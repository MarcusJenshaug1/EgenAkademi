import 'server-only';

import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';

/**
 * EgenAkademi – Gamification engine (server-only)
 *
 * Inneholder den rene nivåkurven samt `awardForEvent`, som er en
 * "best effort"-bivirkning: den skal ALDRI kaste en feil videre til
 * den som kaller den. Poengtildeling må aldri velte den egentlige
 * operasjonen (f.eks. kursfullføring). Importeres aldri i klientkode.
 */

// ── Nivåkurve ───────────────────────────────────────────────
//
// Vi bruker en kvadratrot-basert kurve slik at hvert nivå krever
// gradvis flere poeng (klassisk "RPG"-progresjon):
//
//   level   = floor(sqrt(points / 100)) + 1
//   poeng for nivå L (terskel) = (L - 1)^2 * 100
//
// Eksempler:
//   0 poeng    → nivå 1
//   100 poeng  → nivå 2
//   400 poeng  → nivå 3
//   900 poeng  → nivå 4
//   1600 poeng → nivå 5
//
// Kurven er ren (ingen sideeffekter) og brukes både til å beregne
// nivå og til å tegne progresjonsbjelker (poeng til neste nivå).

const POINTS_PER_LEVEL_BASE = 100;

/** Rent: beregn nivået for et gitt poengtall (minimum nivå 1). */
export function levelForPoints(points: number): number {
    if (!Number.isFinite(points) || points <= 0) return 1;
    return Math.floor(Math.sqrt(points / POINTS_PER_LEVEL_BASE)) + 1;
}

/** Rent: poengterskelen som kreves for å nå et gitt nivå (nivå 1 = 0 poeng). */
export function pointsForLevel(level: number): number {
    if (!Number.isFinite(level) || level <= 1) return 0;
    const l = Math.floor(level);
    return (l - 1) * (l - 1) * POINTS_PER_LEVEL_BASE;
}

export interface LevelProgress {
    level: number;
    pointsIntoLevel: number;   // poeng oppnådd siden inngangen til nåværende nivå
    pointsForThisLevel: number; // poeng som kreves fra dette nivået til neste
    pointsToNextLevel: number;  // gjenstående poeng til neste nivå
    nextLevelAt: number;        // total-poengterskel for neste nivå
    percent: number;            // 0–100 framdrift mot neste nivå
}

/** Rent: utled framdriftsdata for en progresjonsbjelke. */
export function levelProgress(points: number): LevelProgress {
    const safePoints = Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;
    const level = levelForPoints(safePoints);
    const currentThreshold = pointsForLevel(level);
    const nextThreshold = pointsForLevel(level + 1);
    const pointsForThisLevel = Math.max(1, nextThreshold - currentThreshold);
    const pointsIntoLevel = Math.max(0, safePoints - currentThreshold);
    const pointsToNextLevel = Math.max(0, nextThreshold - safePoints);
    const percent = Math.min(100, Math.round((pointsIntoLevel / pointsForThisLevel) * 100));
    return {
        level,
        pointsIntoLevel,
        pointsForThisLevel,
        pointsToNextLevel,
        nextLevelAt: nextThreshold,
        percent,
    };
}

// ── Streak-hjelper ──────────────────────────────────────────

/** Returnerer UTC-dato uten tidskomponent (00:00:00) for sammenligning. */
function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Antall hele kalenderdøgn mellom to datoer (a tidligst). */
function dayDiff(earlier: Date, later: Date): number {
    const ms = startOfUtcDay(later).getTime() - startOfUtcDay(earlier).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Beregn ny streak basert på forrige aktivitetsdato.
 * - i går  → +1
 * - i dag  → uendret
 * - ellers → tilbakestilt til 1
 */
function computeStreak(lastActivityDate: Date | null, current: number, now: Date): number {
    if (!lastActivityDate) return 1;
    const diff = dayDiff(lastActivityDate, now);
    if (diff <= 0) return Math.max(1, current); // samme dag (eller framtidig) → uendret
    if (diff === 1) return current + 1;           // i går → forleng
    return 1;                                      // hull → tilbakestill
}

// ── awardForEvent (best-effort) ─────────────────────────────

export interface AwardOptions {
    sourceType?: string;
    sourceId?: string;
    /** Eksplisitt dedupe-nøkkel; brukes som sourceId-fallback for å hindre dobbel-tildeling. */
    dedupeKey?: string;
}

/**
 * Tildel poeng (og evaluer auto-badges) for en hendelse.
 *
 * BEST-EFFORT: kaster aldri. Hvis tenanten mangler 'gamification'-featuren,
 * det ikke finnes en aktiv PointRule for hendelsen, eller noe feiler, så
 * returnerer funksjonen stille uten å påvirke den kallende operasjonen.
 */
export async function awardForEvent(
    tenantId: string,
    userId: string,
    event: string,
    opts?: AwardOptions
): Promise<void> {
    try {
        if (!tenantId || !userId || !event) return;

        // 1) Feature-gate: no-op hvis tenanten ikke har gamification.
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { plan: true, addons: true, trialEndsAt: true },
        });
        if (!tenant) return;
        const access = checkAccess(
            { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
            'gamification'
        );
        if (!access.allowed) return;

        // 2) Finn aktiv poengregel for hendelsen; no-op for poeng hvis ingen.
        const rule = await prisma.pointRule.findUnique({
            where: { tenantId_event: { tenantId, event } },
            select: { points: true, active: true },
        });

        const now = new Date();

        if (rule && rule.active && rule.points !== 0) {
            // 3) Dedupe: hopp over hvis en transaksjon allerede finnes for denne kilden.
            const dedupeSourceId = opts?.dedupeKey ?? opts?.sourceId ?? null;
            if (dedupeSourceId) {
                const existing = await prisma.pointTransaction.findFirst({
                    where: {
                        tenantId,
                        userId,
                        reason: event,
                        sourceId: dedupeSourceId,
                    },
                    select: { id: true },
                });
                if (existing) {
                    // Allerede tildelt for denne kilden — re-evaluer badges likevel
                    // (idempotent), men ikke gi poeng på nytt.
                    await evaluateAutoBadges(tenantId, userId);
                    return;
                }
            }

            // 4) Opprett poengtransaksjon.
            await prisma.pointTransaction.create({
                data: {
                    tenantId,
                    userId,
                    points: rule.points,
                    reason: event,
                    sourceType: opts?.sourceType ?? null,
                    sourceId: dedupeSourceId,
                },
            });

            // 5) Oppdater UserGamification (poeng, nivå, streak).
            const existingState = await prisma.userGamification.findUnique({
                where: { userId },
                select: {
                    totalPoints: true,
                    currentStreak: true,
                    longestStreak: true,
                    lastActivityDate: true,
                },
            });

            const newTotal = (existingState?.totalPoints ?? 0) + rule.points;
            const newLevel = levelForPoints(newTotal);
            const newStreak = computeStreak(
                existingState?.lastActivityDate ?? null,
                existingState?.currentStreak ?? 0,
                now
            );
            const newLongest = Math.max(existingState?.longestStreak ?? 0, newStreak);

            await prisma.userGamification.upsert({
                where: { userId },
                create: {
                    tenantId,
                    userId,
                    totalPoints: newTotal,
                    level: newLevel,
                    currentStreak: newStreak,
                    longestStreak: newLongest,
                    lastActivityDate: startOfUtcDay(now),
                },
                update: {
                    totalPoints: newTotal,
                    level: newLevel,
                    currentStreak: newStreak,
                    longestStreak: newLongest,
                    lastActivityDate: startOfUtcDay(now),
                },
            });
        }

        // 6) Evaluer auto-badges (uavhengig av om denne hendelsen ga poeng,
        //    f.eks. COURSES_COMPLETED-badges utløst av selve fullføringen).
        await evaluateAutoBadges(tenantId, userId);
    } catch {
        // Svelg: gamification er en best-effort bivirkning og må aldri kaste
        // videre eller lekke interne feil. Bevisst ingen console-logging.
    }
}

/**
 * Evaluer tenantens auto-badges (POINTS_TOTAL / COURSES_COMPLETED /
 * STREAK_DAYS) for en bruker og tildel UserBadge der terskelen er nådd.
 * Idempotent: dupliserer aldri en allerede tildelt badge.
 *
 * Intern hjelper — utfører ingen auth/feature-gate (kallere har gjort det).
 */
async function evaluateAutoBadges(tenantId: string, userId: string): Promise<void> {
    try {
        const autoBadges = await prisma.badge.findMany({
            where: {
                tenantId,
                criteriaType: { in: ['POINTS_TOTAL', 'COURSES_COMPLETED', 'STREAK_DAYS'] },
                threshold: { not: null },
            },
            select: { id: true, criteriaType: true, threshold: true },
        });

        if (autoBadges.length === 0) return;

        // Hent metrikker som badges evalueres mot.
        const needsPoints = autoBadges.some((b) => b.criteriaType === 'POINTS_TOTAL');
        const needsStreak = autoBadges.some((b) => b.criteriaType === 'STREAK_DAYS');
        const needsCourses = autoBadges.some((b) => b.criteriaType === 'COURSES_COMPLETED');

        let totalPoints = 0;
        let currentStreak = 0;
        if (needsPoints || needsStreak) {
            const state = await prisma.userGamification.findUnique({
                where: { userId },
                select: { totalPoints: true, currentStreak: true },
            });
            totalPoints = state?.totalPoints ?? 0;
            currentStreak = state?.currentStreak ?? 0;
        }

        let coursesCompleted = 0;
        if (needsCourses) {
            coursesCompleted = await prisma.courseEnrollment.count({
                where: { tenantId, userId, status: 'COMPLETED' },
            });
        }

        const earnedBadgeIds: string[] = [];
        for (const badge of autoBadges) {
            const threshold = badge.threshold ?? 0;
            let met = false;
            if (badge.criteriaType === 'POINTS_TOTAL') met = totalPoints >= threshold;
            else if (badge.criteriaType === 'STREAK_DAYS') met = currentStreak >= threshold;
            else if (badge.criteriaType === 'COURSES_COMPLETED') met = coursesCompleted >= threshold;
            if (met) earnedBadgeIds.push(badge.id);
        }

        if (earnedBadgeIds.length === 0) return;

        await prisma.userBadge.createMany({
            data: earnedBadgeIds.map((badgeId) => ({ tenantId, userId, badgeId })),
            skipDuplicates: true,
        });
    } catch {
        // Best-effort: svelg feil ved badge-evaluering.
    }
}
