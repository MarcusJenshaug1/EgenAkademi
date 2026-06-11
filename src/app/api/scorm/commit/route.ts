import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';

// Statuser som regnes som fullført for sertifisering/enrollment.
const COMPLETED_STATUSES = ['completed', 'passed'];

interface CommitBody {
    packageId?: unknown;
    cmi?: unknown;
    lessonStatus?: unknown;
    scoreRaw?: unknown;
    suspendData?: unknown;
    totalTime?: unknown;
    finished?: unknown;
}

function asString(v: unknown): string | undefined {
    return typeof v === 'string' ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

/**
 * Slå sammen to CMI key/value-maps. Klient-CMI overstyrer lagret CMI for
 * felter som finnes i begge. Begrenser nøkkel-/verdistørrelse for å unngå
 * at en kompromittert klient blåser opp databasen.
 */
function mergeCmi(existing: unknown, incoming: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    const MAX_KEYS = 500;
    const MAX_VALUE_LEN = 65536;

    const copy = (src: unknown) => {
        if (!src || typeof src !== 'object') return;
        for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
            if (Object.keys(out).length >= MAX_KEYS && !(k in out)) continue;
            if (typeof k !== 'string' || k.length > 512) continue;
            const value = typeof v === 'string' ? v : v == null ? '' : String(v);
            out[k] = value.length > MAX_VALUE_LEN ? value.slice(0, MAX_VALUE_LEN) : value;
        }
    };

    copy(existing);
    copy(incoming);
    return out;
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.tenantId) {
            return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
        }

        const userId = session.user.id;
        const tenantId = session.user.tenantId;

        let body: CommitBody;
        try {
            body = (await request.json()) as CommitBody;
        } catch {
            return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 });
        }

        const packageId = asString(body.packageId);
        if (!packageId) {
            return NextResponse.json({ error: 'Mangler pakke-ID' }, { status: 400 });
        }

        // ── Verifiser at pakken tilhører brukerens tenant ──
        const pkg = await prisma.scormPackage.findFirst({
            where: { id: packageId, tenantId },
            select: { id: true, courseId: true },
        });
        if (!pkg) {
            return NextResponse.json({ error: 'Pakke ikke funnet' }, { status: 404 });
        }

        const lessonStatus = asString(body.lessonStatus)?.toLowerCase();
        const scoreRaw = asNumber(body.scoreRaw);
        const suspendData = asString(body.suspendData);
        const totalTime = asString(body.totalTime);
        const finished = body.finished === true;

        const isCompleted =
            lessonStatus !== undefined && COMPLETED_STATUSES.includes(lessonStatus);

        // ── Hent eksisterende forsøk for CMI-merge ──
        const existing = await prisma.scormAttempt.findUnique({
            where: { scormPackageId_userId: { scormPackageId: pkg.id, userId } },
            select: { cmiJson: true, completedAt: true },
        });

        const mergedCmi = mergeCmi(existing?.cmiJson, body.cmi);

        // Behold tidligere completedAt hvis allerede satt; ellers sett nå ved fullføring.
        const completedAt = existing?.completedAt ?? (isCompleted ? new Date() : null);

        await prisma.scormAttempt.upsert({
            where: { scormPackageId_userId: { scormPackageId: pkg.id, userId } },
            create: {
                tenantId,
                scormPackageId: pkg.id,
                userId,
                cmiJson: mergedCmi as unknown as Prisma.InputJsonValue,
                lessonStatus: lessonStatus ?? null,
                scoreRaw: scoreRaw ?? null,
                suspendData: suspendData ?? null,
                totalTime: totalTime ?? null,
                completedAt,
            },
            update: {
                cmiJson: mergedCmi as unknown as Prisma.InputJsonValue,
                ...(lessonStatus !== undefined && { lessonStatus }),
                ...(scoreRaw !== undefined && { scoreRaw }),
                ...(suspendData !== undefined && { suspendData }),
                ...(totalTime !== undefined && { totalTime }),
                ...(completedAt !== null && { completedAt }),
            },
        });

        // ── Best-effort: marker tilknyttet kurs som fullført ──
        if (finished && isCompleted && pkg.courseId) {
            try {
                const enrollment = await prisma.courseEnrollment.findFirst({
                    where: { courseId: pkg.courseId, userId, tenantId },
                    select: { id: true, status: true, completedAt: true },
                });
                if (enrollment && enrollment.status !== 'COMPLETED') {
                    await prisma.courseEnrollment.update({
                        where: { id: enrollment.id },
                        data: {
                            status: 'COMPLETED',
                            completionPercentCached: 100,
                            completedAt: enrollment.completedAt ?? new Date(),
                            lastActivityAt: new Date(),
                        },
                    });
                }
            } catch {
                // Best-effort: enrollment-oppdatering må aldri velte commit.
            }
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: 'Lagringsfeil' }, { status: 500 });
    }
}
