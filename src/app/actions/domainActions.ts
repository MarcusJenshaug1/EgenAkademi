'use server';

import { randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';

// ── Konstanter ──────────────────────────────────────────────

/**
 * CNAME-mål som kundens (sub)domene skal peke mot. Selve rutingen av
 * trafikk til riktig tenant settes opp på hosting-plattformen (infra/TODO).
 */
const CNAME_TARGET = 'cname.egenakademi.no';

/** Prefiks for verifiserings-token i TXT-posten. */
const VERIFY_PREFIX = 'egenakademi-verify=';

/** Vert (subdomene) der TXT-posten for verifisering forventes. */
const VERIFY_HOST_PREFIX = '_egenakademi-verify';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Autentiser + krev tenant-admin OG aktiv 'custom-domain'-tilgang (PLUS).
 * Kaster ved manglende auth/rolle/tilgang; callere wrapper i try/catch og
 * returnerer en generisk { error }.
 */
async function requireTenantAdmin(): Promise<{ userId: string; tenantId: string; email: string | null }> {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    const tenant = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) throw new Error('Ikke tilgang');
    const access = checkAccess(
        { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
        'custom-domain'
    );
    if (!access.allowed) throw new Error('Ikke tilgang');
    return {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        email: session.user.email ?? null,
    };
}

// ── Types ───────────────────────────────────────────────────

export interface DnsInstructions {
    /** TXT-post navn (host) som skal opprettes, f.eks. _egenakademi-verify.kurs.eksempel.no */
    txtName: string;
    /** TXT-post verdi som skal limes inn, f.eks. egenakademi-verify=<hex> */
    txtValue: string;
    /** CNAME-host (selve domenet som skal peke mot plattformen). */
    cnameName: string;
    /** CNAME-mål (plattformens host). */
    cnameTarget: string;
}

export interface DomainListItem {
    id: string;
    domain: string;
    status: string; // 'pending' | 'verified' | 'failed'
    isPrimary: boolean;
    verifiedAt: Date | null;
    lastCheckedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    instructions: DnsInstructions;
}

// ── Validering ──────────────────────────────────────────────

/**
 * Validerer og normaliserer et domenenavn.
 * - Tvinger lowercase, trimmer whitespace.
 * - Avviser protokoller, stier, porter, mellomrom og wildcard.
 * - Avviser åpenbart interne navn (localhost, *.local, bare IP-adresser).
 * Returnerer det normaliserte domenet eller en feilmelding.
 */
function validateDomain(input: string): { domain: string } | { error: string } {
    if (typeof input !== 'string') return { error: 'Ugyldig domene' };

    const domain = input.trim().toLowerCase();

    if (domain.length === 0) return { error: 'Domene kan ikke være tomt' };
    if (domain.length > 253) return { error: 'Domenet er for langt' };

    // Avvis protokoll, sti, port, query, whitespace og wildcard.
    if (/[\s/\\?#@*]/.test(domain)) return { error: 'Ugyldig domeneformat' };
    if (domain.includes('://') || domain.includes(':')) {
        return { error: 'Skriv kun selve domenet, uten protokoll eller port' };
    }

    // Bare-IP (IPv4) er ikke et gyldig custom-domene.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(domain)) {
        return { error: 'IP-adresser kan ikke brukes som domene' };
    }
    // IPv6-aktig (inneholder kolon fanges allerede over, men vær eksplisitt).
    if (domain.includes(':')) return { error: 'Ugyldig domeneformat' };

    // Interne / ikke-rutbare navn.
    if (domain === 'localhost' || domain.endsWith('.localhost')) {
        return { error: 'Interne navn som localhost kan ikke brukes' };
    }
    if (domain.endsWith('.local') || domain.endsWith('.internal') || domain.endsWith('.lan')) {
        return { error: 'Interne navn (.local/.internal/.lan) kan ikke brukes' };
    }

    // Hostname-regex: labels [a-z0-9-], 1-63 tegn, ikke start/slutt med bindestrek,
    // minst to labels (krever et TLD), TLD kun bokstaver og minst 2 tegn.
    const hostnameRegex =
        /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
    if (!hostnameRegex.test(domain)) {
        return { error: 'Ugyldig domeneformat. Bruk f.eks. kurs.eksempel.no' };
    }

    return { domain };
}

// ── DNS-instruksjoner ───────────────────────────────────────

/**
 * Returnerer hvilke DNS-poster brukeren må legge til for å verifisere og rute
 * domenet. TXT-posten brukes til eierskapsverifisering; CNAME-målet er der
 * (sub)domenet skal peke for at trafikk skal nå plattformen (infra/TODO).
 */
export async function getDnsInstructions(domain: string, token: string): Promise<DnsInstructions> {
    const normalized = domain.trim().toLowerCase();
    return {
        txtName: `${VERIFY_HOST_PREFIX}.${normalized}`,
        txtValue: token,
        cnameName: normalized,
        cnameTarget: CNAME_TARGET,
    };
}

/** Intern, ikke-async variant for gjenbruk i andre actions uten await-overhead. */
function buildDnsInstructions(domain: string, token: string): DnsInstructions {
    return {
        txtName: `${VERIFY_HOST_PREFIX}.${domain}`,
        txtValue: token,
        cnameName: domain,
        cnameTarget: CNAME_TARGET,
    };
}

// ── List domains ────────────────────────────────────────────

export async function listDomains(): Promise<{ domains: DomainListItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const domains = await prisma.tenantDomain.findMany({
            where: { tenantId },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        });

        return {
            domains: domains.map((d) => ({
                id: d.id,
                domain: d.domain,
                status: d.status,
                isPrimary: d.isPrimary,
                verifiedAt: d.verifiedAt,
                lastCheckedAt: d.lastCheckedAt,
                lastError: d.lastError,
                createdAt: d.createdAt,
                instructions: buildDnsInstructions(d.domain, d.verificationToken),
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Add domain ──────────────────────────────────────────────

export async function addDomain(
    domain: string
): Promise<{ success: true; domain: DomainListItem } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const validated = validateDomain(domain);
        if ('error' in validated) return { error: validated.error };

        // Avvis hvis domenet allerede er registrert (globalt unikt).
        const existing = await prisma.tenantDomain.findUnique({
            where: { domain: validated.domain },
            select: { id: true },
        });
        if (existing) {
            return { error: 'Dette domenet er allerede i bruk' };
        }

        // Generer et tilfeldig verifiseringstoken.
        const verificationToken = `${VERIFY_PREFIX}${randomBytes(24).toString('hex')}`;

        const created = await prisma.tenantDomain.create({
            data: {
                tenantId,
                domain: validated.domain,
                verificationToken,
                status: 'pending',
                isPrimary: false,
            },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'domain.added',
            targetType: 'TenantDomain',
            targetId: created.id,
            metadata: { domain: created.domain },
        });

        return {
            success: true,
            domain: {
                id: created.id,
                domain: created.domain,
                status: created.status,
                isPrimary: created.isPrimary,
                verifiedAt: created.verifiedAt,
                lastCheckedAt: created.lastCheckedAt,
                lastError: created.lastError,
                createdAt: created.createdAt,
                instructions: buildDnsInstructions(created.domain, created.verificationToken),
            },
        };
    } catch (e: unknown) {
        // Mulig race på unique-constraint: returner samme generiske melding.
        if (
            e &&
            typeof e === 'object' &&
            'code' in e &&
            (e as { code?: string }).code === 'P2002'
        ) {
            return { error: 'Dette domenet er allerede i bruk' };
        }
        return { error: 'Ukjent feil' };
    }
}

// ── Verify domain (ekte DNS TXT-oppslag) ────────────────────

/**
 * Slår opp TXT-poster for verten på en trygg måte. Returnerer en liste med
 * sammenflatede TXT-strenger, eller en tom liste ved ENOTFOUND/timeout/feil.
 * Kaster ALDRI videre — råe DNS-feil skal aldri nå klienten.
 */
async function safeResolveTxt(host: string): Promise<string[]> {
    try {
        // resolveTxt returnerer string[][] (chunks per post) — flat dem sammen.
        const records = await dns.resolveTxt(host);
        return records.map((chunks) => chunks.join(''));
    } catch {
        // ENOTFOUND, ENODATA, ESERVFAIL, timeouts m.m. → behandles som "ingen post".
        return [];
    }
}

export async function verifyDomain(
    id: string
): Promise<{ success: true; status: string; verified: boolean } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const record = await prisma.tenantDomain.findFirst({
            where: { id, tenantId },
        });
        if (!record) return { error: 'Domene ikke funnet' };

        const host = `${VERIFY_HOST_PREFIX}.${record.domain}`;
        const txtValues = await safeResolveTxt(host);

        const verified = txtValues.some((v) => v.trim() === record.verificationToken);
        const now = new Date();

        if (verified) {
            await prisma.tenantDomain.update({
                where: { id: record.id },
                data: {
                    status: 'verified',
                    verifiedAt: now,
                    lastCheckedAt: now,
                    lastError: null,
                },
            });

            await logAudit({
                tenantId,
                actorUserId: userId,
                actorEmail: email,
                action: 'domain.verified',
                targetType: 'TenantDomain',
                targetId: record.id,
                metadata: { domain: record.domain },
            });

            return { success: true, status: 'verified', verified: true };
        }

        // Mislykket: sett en trygg, generisk lastError (aldri råe DNS-detaljer).
        // Demoter også primær-flagget — et domene som ikke (lenger) er verifisert
        // skal aldri stå som primært (holder UI og host-basert ruting konsistent).
        await prisma.tenantDomain.update({
            where: { id: record.id },
            data: {
                status: 'failed',
                isPrimary: false,
                lastCheckedAt: now,
                lastError: 'Fant ikke forventet TXT-post',
            },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'domain.verify_failed',
            targetType: 'TenantDomain',
            targetId: record.id,
            metadata: { domain: record.domain },
        });

        return { success: true, status: 'failed', verified: false };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Set primary domain ──────────────────────────────────────

export async function setPrimaryDomain(id: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const record = await prisma.tenantDomain.findFirst({
            where: { id, tenantId },
            select: { id: true, status: true, domain: true },
        });
        if (!record) return { error: 'Domene ikke funnet' };
        if (record.status !== 'verified') {
            return { error: 'Domenet må være verifisert før det kan settes som primært' };
        }

        // Fjern primær-flagg på øvrige domener i tenanten, sett dette.
        await prisma.$transaction([
            prisma.tenantDomain.updateMany({
                where: { tenantId, id: { not: record.id }, isPrimary: true },
                data: { isPrimary: false },
            }),
            prisma.tenantDomain.update({
                where: { id: record.id },
                data: { isPrimary: true },
            }),
        ]);

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'domain.set_primary',
            targetType: 'TenantDomain',
            targetId: record.id,
            metadata: { domain: record.domain },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Remove domain ───────────────────────────────────────────

export async function removeDomain(id: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const record = await prisma.tenantDomain.findFirst({
            where: { id, tenantId },
            select: { id: true, domain: true },
        });
        if (!record) return { error: 'Domene ikke funnet' };

        await prisma.tenantDomain.delete({ where: { id: record.id } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'domain.removed',
            targetType: 'TenantDomain',
            targetId: record.id,
            metadata: { domain: record.domain },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Host-based tenant resolution helper (for fremtidig middleware) ──

/**
 * Slår opp tenant-id ut fra en innkommende Host-header. Returnerer KUN treff på
 * verifiserte domener. Eksportert for fremtidig host-basert ruting i middleware,
 * men er IKKE wiret inn i middleware ennå (infra/TODO). Gjør ingen auth — er ment
 * å kalles fra et betrodd server-miljø (route handler / middleware).
 */
export async function getTenantIdByDomain(host: string): Promise<string | null> {
    try {
        if (typeof host !== 'string' || host.length === 0) return null;
        // Strip eventuell port og normaliser.
        const domain = host.trim().toLowerCase().split(':')[0];
        if (!domain) return null;

        const record = await prisma.tenantDomain.findFirst({
            where: { domain, status: 'verified' },
            select: { tenantId: true },
        });
        return record?.tenantId ?? null;
    } catch {
        return null;
    }
}
