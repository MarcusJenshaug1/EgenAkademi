import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import { unzipSync, strFromU8 } from 'fflate';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';

// ── Limits ──────────────────────────────────────────────────
// Komprimert opplastingsgrense (~100MB) og harde tak på utpakket innhold
// for å unngå zip-bomber.
const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100MB komprimert
const MAX_TOTAL_UNCOMPRESSED = 300 * 1024 * 1024; // 300MB utpakket totalt
const MAX_FILE_COUNT = 2000;

const ZIP_MIME_TYPES = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'application/octet-stream',
    'multipart/x-zip',
];

interface ManifestSummary {
    scormVersion: '1.2' | '2004';
    title: string | null;
    entryPath: string | null;
    organizationTitle: string | null;
}

/**
 * Lett parsing av imsmanifest.xml. SCORM-manifester kan være store og
 * variere mye; vi henter ut det vi trenger med tolerant regex/string-parsing
 * fremfor en full XML-parser. Returnerer null hvis filen ikke gir mening.
 */
function parseManifest(xml: string): ManifestSummary | null {
    // ── SCORM-versjon ──
    // 1.2: schemaversion 1.2 ; 2004: schemaversion "CAM 1.3"/"2004 3rd/4th Edition"
    let scormVersion: '1.2' | '2004' = '1.2';
    const schemaVersionMatch = xml.match(/<schemaversion[^>]*>([\s\S]*?)<\/schemaversion>/i);
    const schemaVersion = schemaVersionMatch ? schemaVersionMatch[1].trim() : '';
    if (/2004|cam\s*1\.3|1\.3/i.test(schemaVersion)) {
        scormVersion = '2004';
    } else if (/1\.2/.test(schemaVersion)) {
        scormVersion = '1.2';
    }

    // ── Default organisasjon ──
    // <organizations default="ORG-ID"> ... <organization identifier="ORG-ID"><title>..</title>
    let organizationTitle: string | null = null;
    let defaultOrgIdentifier: string | null = null;
    const orgsMatch = xml.match(/<organizations\b[^>]*\bdefault\s*=\s*"([^"]+)"/i);
    if (orgsMatch) {
        defaultOrgIdentifier = orgsMatch[1];
    }

    // Finn alle <organization ...> blokker
    const orgRegex = /<organization\b([^>]*)>([\s\S]*?)<\/organization>/gi;
    let orgMatch: RegExpExecArray | null;
    let firstOrgTitle: string | null = null;
    let firstOrgDefaultResourceIdentifierref: string | null = null;
    let defaultOrgFirstItemIdentifierref: string | null = null;
    let firstItemIdentifierref: string | null = null;

    while ((orgMatch = orgRegex.exec(xml)) !== null) {
        const attrs = orgMatch[1];
        const body = orgMatch[2];
        const idMatch = attrs.match(/\bidentifier\s*=\s*"([^"]+)"/i);
        const orgId = idMatch ? idMatch[1] : null;
        const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? decodeXmlEntities(titleMatch[1].trim()) : null;

        // Første <item ...> sin identifierref (peker til en ressurs)
        const itemMatch = body.match(/<item\b[^>]*\bidentifierref\s*=\s*"([^"]+)"/i);
        const itemRef = itemMatch ? itemMatch[1] : null;

        if (firstOrgTitle === null && title) firstOrgTitle = title;
        if (firstItemIdentifierref === null && itemRef) firstItemIdentifierref = itemRef;

        if (defaultOrgIdentifier && orgId === defaultOrgIdentifier) {
            organizationTitle = title;
            defaultOrgFirstItemIdentifierref = itemRef;
        }
    }

    if (!organizationTitle) organizationTitle = firstOrgTitle;
    const targetItemRef = defaultOrgFirstItemIdentifierref ?? firstItemIdentifierref;

    // ── Ressurser → launch href ──
    // Foretrekk ressursen som items refererer til; fall back til første
    // ressurs med en href.
    let entryPath: string | null = null;
    const resourceRegex = /<resource\b([^>]*)>/gi;
    let resMatch: RegExpExecArray | null;
    let firstHref: string | null = null;
    let firstScoHref: string | null = null;

    while ((resMatch = resourceRegex.exec(xml)) !== null) {
        const attrs = resMatch[1];
        const idMatch = attrs.match(/\bidentifier\s*=\s*"([^"]+)"/i);
        const hrefMatch = attrs.match(/\bhref\s*=\s*"([^"]+)"/i);
        const typeMatch = attrs.match(/\bscormtype\s*=\s*"([^"]+)"|\badlcp:scormtype\s*=\s*"([^"]+)"/i);
        const resId = idMatch ? idMatch[1] : null;
        const href = hrefMatch ? hrefMatch[1] : null;
        const scormType = typeMatch ? (typeMatch[1] || typeMatch[2] || '').toLowerCase() : '';

        if (!href) continue;
        if (firstHref === null) firstHref = href;
        if (firstScoHref === null && scormType === 'sco') firstScoHref = href;

        if (targetItemRef && resId === targetItemRef) {
            entryPath = href;
        }
    }

    if (!entryPath) entryPath = firstScoHref ?? firstHref;

    if (!entryPath) {
        // Uten en launch-fil kan vi ikke kjøre pakken.
        return null;
    }

    // Dekod entiteter og strip en eventuell query/fragment fra href-en.
    // SCORM-launch-href kan ha "?param=1#frag"; vi lagrer kun selve fil-pathen
    // og lar query/fragment ligge i runtime-src (se sanitering nedenfor).
    entryPath = decodeXmlEntities(entryPath);

    const sanitized = sanitizeEntryPath(entryPath);
    if (!sanitized) {
        // Launch-href er en absolutt URL, protokoll-relativ, har et scheme,
        // eller forsøker path-traversal. Avvis pakken.
        return null;
    }

    return {
        scormVersion,
        title: organizationTitle,
        entryPath: sanitized,
        organizationTitle,
    };
}

/**
 * Saner og valider en launch-path fra manifestet. entryPath flyter UKLARERT
 * inn i iframe-src (`packagePath + '/' + entryPath`) og lagres i DB, så den må
 * tvinges til å være en trygg, relativ path INNENFOR pakkemappen.
 *
 * Avviser (returnerer null for):
 *  - absolutte paths ("/x", "\\x") og protokoll-relative URL-er ("//host")
 *  - URL-schemes ("http:", "https:", "javascript:", "data:", "file:", ...)
 *  - backslash-separatorer (normaliseres til "/")
 *  - path-traversal via "." / ".." segmenter
 *  - tomme paths
 *
 * Bevarer en eventuell query/fragment ("foo.html?x=1#y") for kompatibilitet,
 * men validerer kun selve fil-pathen før "?"/"#".
 */
function sanitizeEntryPath(raw: string): string | null {
    let value = raw.trim();
    if (!value) return null;

    // Normaliser backslash til forward slash (SCORM-href skal bruke "/").
    value = value.replace(/\\/g, '/');

    // Skill ut query/fragment; validér kun fil-pathen.
    const queryIndex = value.search(/[?#]/);
    const suffix = queryIndex >= 0 ? value.slice(queryIndex) : '';
    let pathPart = queryIndex >= 0 ? value.slice(0, queryIndex) : value;

    // Avvis URL-scheme ("http:", "javascript:", "data:", "file:", "mailto:" …).
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(pathPart)) return null;

    // Avvis absolutt path og protokoll-relativ URL ("//host").
    if (pathPart.startsWith('/')) return null;

    // Strip ledende "./"-segmenter.
    pathPart = pathPart.replace(/^(\.\/)+/, '');
    if (!pathPart) return null;

    // Avvis path-traversal: ingen "." eller ".." som path-segment.
    const segments = pathPart.split('/');
    for (const seg of segments) {
        if (seg === '..' || seg === '.') return null;
    }

    return pathPart + suffix;
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Verifiser at en zip-entry-path holder seg innenfor target-mappen etter
 * normalisering. Beskytter mot Zip Slip (../, absolutte paths, drive-letters).
 */
function isPathInsideTarget(targetDir: string, entryName: string): { ok: boolean; resolved: string } {
    // Avvis absolutte paths og Windows drive-letters direkte.
    if (entryName.startsWith('/') || entryName.startsWith('\\') || /^[a-zA-Z]:/.test(entryName)) {
        return { ok: false, resolved: '' };
    }
    const resolved = path.resolve(targetDir, entryName);
    const normalizedTarget = path.resolve(targetDir);
    // Må ligge under target (med path-separator-grense for å unngå prefiks-feil).
    if (resolved !== normalizedTarget && !resolved.startsWith(normalizedTarget + path.sep)) {
        return { ok: false, resolved: '' };
    }
    return { ok: true, resolved };
}

export async function POST(request: NextRequest) {
    let createdDir: string | null = null;
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.tenantId) {
            return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
        }
        if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });
        }

        const tenantId = session.user.tenantId;

        // ── Feature-gate: SCORM krever PLUS ──
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { plan: true, addons: true, trialEndsAt: true },
        });
        if (!tenant) {
            return NextResponse.json({ error: 'Organisasjonen ble ikke funnet' }, { status: 403 });
        }
        const access = checkAccess(
            { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
            'scorm'
        );
        if (!access.allowed) {
            return NextResponse.json({ error: access.reason || 'Ingen tilgang' }, { status: 403 });
        }

        // ── Hent fil ──
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) {
            return NextResponse.json({ error: 'Ingen fil valgt' }, { status: 400 });
        }

        if (file.size > MAX_ZIP_SIZE) {
            return NextResponse.json({ error: 'Filen er for stor. Maks 100MB.' }, { status: 400 });
        }

        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
        const mimeOk = ZIP_MIME_TYPES.includes(file.type) || file.type === '';
        if (ext !== '.zip' || !mimeOk) {
            return NextResponse.json(
                { error: 'Ugyldig filtype. Last opp en SCORM-pakke (.zip).' },
                { status: 400 }
            );
        }

        // ── Pakk ut i minnet ──
        const buffer = Buffer.from(await file.arrayBuffer());
        let entries: Record<string, Uint8Array>;
        try {
            entries = unzipSync(new Uint8Array(buffer));
        } catch {
            return NextResponse.json({ error: 'Kunne ikke lese zip-arkivet.' }, { status: 400 });
        }

        const entryNames = Object.keys(entries);
        if (entryNames.length === 0) {
            return NextResponse.json({ error: 'Zip-arkivet er tomt.' }, { status: 400 });
        }
        if (entryNames.length > MAX_FILE_COUNT) {
            return NextResponse.json(
                { error: 'Pakken inneholder for mange filer.' },
                { status: 400 }
            );
        }

        // ── Finn imsmanifest.xml i roten ──
        // Tillat varierende casing; manifestet skal ligge i roten av pakken.
        const manifestKey = entryNames.find(
            (n) => n.toLowerCase() === 'imsmanifest.xml'
        );
        if (!manifestKey) {
            return NextResponse.json(
                { error: 'Fant ikke imsmanifest.xml i roten av pakken.' },
                { status: 400 }
            );
        }

        const manifestXml = strFromU8(entries[manifestKey]);
        const summary = parseManifest(manifestXml);
        if (!summary || !summary.entryPath) {
            return NextResponse.json(
                { error: 'Kunne ikke tolke SCORM-manifestet (mangler launch-fil).' },
                { status: 400 }
            );
        }

        // ── Verifiser at launch-filen faktisk finnes i pakken ──
        // entryPath flyter inn i iframe-src; sørg for at den peker på en reell,
        // utpakket fil (case-insensitiv match mot zip-entry-navnene), ikke en
        // path som kun gir 404 eller (etter saneringen) en uventet fil.
        const launchFile = summary.entryPath.split(/[?#]/)[0].toLowerCase();
        const launchExists = entryNames.some(
            (n) => n.replace(/\\/g, '/').toLowerCase() === launchFile
        );
        if (!launchExists) {
            return NextResponse.json(
                { error: 'Launch-filen fra manifestet finnes ikke i pakken.' },
                { status: 400 }
            );
        }

        // ── Sjekk total utpakket størrelse ──
        let totalUncompressed = 0;
        for (const name of entryNames) {
            totalUncompressed += entries[name].byteLength;
            if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
                return NextResponse.json(
                    { error: 'Pakken er for stor når den pakkes ut.' },
                    { status: 400 }
                );
            }
        }

        // ── Skriv til disk under public/uploads/scorm/<packageId>/ ──
        const packageId = randomUUID();
        const targetDir = path.join(process.cwd(), 'public', 'uploads', 'scorm', packageId);
        await mkdir(targetDir, { recursive: true });
        createdDir = targetDir;

        for (const name of entryNames) {
            // Hopp over directory-entries (fflate gir tom Uint8Array for kataloger
            // som ender på "/").
            if (name.endsWith('/') || name.endsWith('\\')) continue;

            const safe = isPathInsideTarget(targetDir, name);
            if (!safe.ok) {
                // Zip Slip-forsøk eller absolutt path — avvis hele opplastingen.
                await rm(targetDir, { recursive: true, force: true });
                createdDir = null;
                return NextResponse.json({ error: 'Ugyldig pakkeinnhold.' }, { status: 400 });
            }

            await mkdir(path.dirname(safe.resolved), { recursive: true });
            await writeFile(safe.resolved, Buffer.from(entries[name]));
        }

        // ── Bestem tittel ──
        const fallbackTitle = file.name.replace(/\.zip$/i, '').trim() || 'SCORM-pakke';
        const title = (summary.title && summary.title.trim()) || fallbackTitle;

        const packagePath = `/uploads/scorm/${packageId}`;

        // ── Opprett databaserad ──
        const pkg = await prisma.scormPackage.create({
            data: {
                id: packageId,
                tenantId,
                title,
                scormVersion: summary.scormVersion,
                entryPath: summary.entryPath,
                packagePath,
                manifestJson: {
                    scormVersion: summary.scormVersion,
                    organizationTitle: summary.organizationTitle,
                    entryPath: summary.entryPath,
                    fileCount: entryNames.length,
                },
            },
            select: {
                id: true,
                title: true,
                scormVersion: true,
                entryPath: true,
                packagePath: true,
                createdAt: true,
            },
        });

        await logAudit({
            tenantId,
            actorUserId: session.user.id,
            actorEmail: session.user.email ?? null,
            action: 'scorm.imported',
            targetType: 'ScormPackage',
            targetId: pkg.id,
            metadata: { title: pkg.title, scormVersion: pkg.scormVersion },
        });

        return NextResponse.json({ success: true, package: pkg });
    } catch {
        // Rydd opp eventuell delvis utpakket mappe ved feil.
        if (createdDir) {
            await rm(createdDir, { recursive: true, force: true }).catch(() => {});
        }
        return NextResponse.json({ error: 'Importfeil' }, { status: 500 });
    }
}
