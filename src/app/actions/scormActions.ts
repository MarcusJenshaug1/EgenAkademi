'use server';

import { rm } from 'fs/promises';
import path from 'path';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';

// ── Types ───────────────────────────────────────────────────

export interface ScormPackageListItem {
    id: string;
    title: string;
    scormVersion: string;
    entryPath: string;
    packagePath: string;
    courseId: string | null;
    attemptCount: number;
    createdAt: Date;
}

export interface ScormPackageDetail {
    id: string;
    title: string;
    scormVersion: string;
    entryPath: string;
    packagePath: string;
    courseId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ScormStats {
    totalPackages: number;
    totalAttempts: number;
    completedAttempts: number;
}

export interface MyScormAttempt {
    cmi: Record<string, string>;
    lessonStatus: string | null;
    scoreRaw: number | null;
    suspendData: string | null;
    totalTime: string | null;
    completedAt: Date | null;
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Autentiser + krev tenant-admin OG aktiv 'scorm'-tilgang (PLUS).
 * Kaster ved manglende auth/rolle/tilgang; callere wrapper i try/catch og
 * returnerer en generisk { error }.
 */
async function requireScormAdmin(): Promise<{ userId: string; tenantId: string; email: string | null }> {
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
        'scorm'
    );
    if (!access.allowed) throw new Error('Ikke tilgang');
    return {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        email: session.user.email ?? null,
    };
}

/** Autentiser en hvilken som helst tenant-bruker (for læ, runtime). */
async function requireUser(): Promise<{ userId: string; tenantId: string }> {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId };
}

function normalizeCmi(raw: unknown): Record<string, string> {
    const out: Record<string, string> = {};
    if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            out[k] = typeof v === 'string' ? v : v == null ? '' : String(v);
        }
    }
    return out;
}

// ── Admin: list packages ────────────────────────────────────

export async function listScormPackages(): Promise<
    { packages: ScormPackageListItem[] } | { error: string }
> {
    try {
        const { tenantId } = await requireScormAdmin();

        const packages = await prisma.scormPackage.findMany({
            where: { tenantId },
            select: {
                id: true,
                title: true,
                scormVersion: true,
                entryPath: true,
                packagePath: true,
                courseId: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        // Tell forsøk per pakke (tenant-scoped) i en samlet spørring.
        const ids = packages.map((p) => p.id);
        const counts = ids.length
            ? await prisma.scormAttempt.groupBy({
                  by: ['scormPackageId'],
                  where: { tenantId, scormPackageId: { in: ids } },
                  _count: { _all: true },
              })
            : [];
        const countMap = new Map(counts.map((c) => [c.scormPackageId, c._count._all]));

        return {
            packages: packages.map((p) => ({
                id: p.id,
                title: p.title,
                scormVersion: p.scormVersion,
                entryPath: p.entryPath,
                packagePath: p.packagePath,
                courseId: p.courseId,
                attemptCount: countMap.get(p.id) ?? 0,
                createdAt: p.createdAt,
            })),
        };
    } catch {
        return { error: 'Kunne ikke hente SCORM-pakker' };
    }
}

// ── Admin: get single package ───────────────────────────────

export async function getScormPackage(
    id: string
): Promise<{ package: ScormPackageDetail } | { error: string }> {
    try {
        const { tenantId } = await requireScormAdmin();

        const pkg = await prisma.scormPackage.findFirst({
            where: { id, tenantId },
            select: {
                id: true,
                title: true,
                scormVersion: true,
                entryPath: true,
                packagePath: true,
                courseId: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        if (!pkg) return { error: 'Pakke ikke funnet' };

        return { package: pkg };
    } catch {
        return { error: 'Kunne ikke hente pakken' };
    }
}

// ── Admin: delete package ───────────────────────────────────

export async function deleteScormPackage(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId, email } = await requireScormAdmin();

        // Verifiser eierskap før mutasjon.
        const pkg = await prisma.scormPackage.findFirst({
            where: { id, tenantId },
            select: { id: true, title: true },
        });
        if (!pkg) return { error: 'Pakke ikke funnet' };

        // Cascade: slett forsøk først, deretter pakken.
        await prisma.scormAttempt.deleteMany({ where: { scormPackageId: id, tenantId } });
        await prisma.scormPackage.delete({ where: { id } });

        // Best-effort: fjern utpakkede filer fra disk.
        // packageId er en UUID generert server-side; vi bygger pathen fra id
        // (aldri fra brukerinput) for å unngå traversering.
        try {
            const dir = path.join(process.cwd(), 'public', 'uploads', 'scorm', id);
            await rm(dir, { recursive: true, force: true });
        } catch {
            // Disk-opprydding er best-effort; databaserad er allerede borte.
        }

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'scorm.deleted',
            targetType: 'ScormPackage',
            targetId: id,
            metadata: { title: pkg.title },
        });

        return { success: true };
    } catch {
        return { error: 'Kunne ikke slette pakken' };
    }
}

// ── Admin: stats ────────────────────────────────────────────

export async function getScormStats(): Promise<ScormStats | { error: string }> {
    try {
        const { tenantId } = await requireScormAdmin();

        const [totalPackages, totalAttempts, completedAttempts] = await Promise.all([
            prisma.scormPackage.count({ where: { tenantId } }),
            prisma.scormAttempt.count({ where: { tenantId } }),
            prisma.scormAttempt.count({
                where: { tenantId, lessonStatus: { in: ['completed', 'passed'] } },
            }),
        ]);

        return { totalPackages, totalAttempts, completedAttempts };
    } catch {
        return { error: 'Kunne ikke hente statistikk' };
    }
}

// ── Learner: get my attempt (seed runtime) ──────────────────

export async function getMyScormAttempt(
    packageId: string
): Promise<{ attempt: MyScormAttempt | null } | { error: string }> {
    try {
        const { userId, tenantId } = await requireUser();

        // Verifiser at pakken tilhører brukerens tenant.
        const pkg = await prisma.scormPackage.findFirst({
            where: { id: packageId, tenantId },
            select: { id: true },
        });
        if (!pkg) return { error: 'Pakke ikke funnet' };

        const attempt = await prisma.scormAttempt.findUnique({
            where: { scormPackageId_userId: { scormPackageId: packageId, userId } },
            select: {
                cmiJson: true,
                lessonStatus: true,
                scoreRaw: true,
                suspendData: true,
                totalTime: true,
                completedAt: true,
            },
        });

        if (!attempt) return { attempt: null };

        return {
            attempt: {
                cmi: normalizeCmi(attempt.cmiJson),
                lessonStatus: attempt.lessonStatus,
                scoreRaw: attempt.scoreRaw,
                suspendData: attempt.suspendData,
                totalTime: attempt.totalTime,
                completedAt: attempt.completedAt,
            },
        };
    } catch {
        return { error: 'Kunne ikke hente fremdrift' };
    }
}
