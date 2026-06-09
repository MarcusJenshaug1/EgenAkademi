'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';
import { levelForPoints, levelProgress } from '@/lib/gamification';
import type { BadgeCriteriaType } from '@prisma/client';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Authenticate + require tenant-admin. Returns userId + tenantId.
 * Throws on missing auth / insufficient role. Callers wrap in try/catch
 * and return a generic { error } so no internal details leak.
 */
async function requireTenantAdmin() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId, email: session.user.email ?? null };
}

/** Authenticate any logged-in learner (any role). */
async function requireLearner() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId };
}

/** Resolve the tenant's plan context and gate the 'gamification' (ENTERPRISE) feature. */
async function checkGamificationAccess(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) return { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };
    return checkAccess(
        { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
        'gamification'
    );
}

/** Build a display name from the user's profile fields. */
function displayName(u: { name: string | null; firstName: string | null; lastName: string | null; email: string | null }): string {
    if (u.firstName || u.lastName) return [u.firstName, u.lastName].filter(Boolean).join(' ');
    if (u.name) return u.name;
    if (u.email) return u.email;
    return 'Bruker';
}

const VALID_CRITERIA: BadgeCriteriaType[] = ['POINTS_TOTAL', 'COURSES_COMPLETED', 'STREAK_DAYS', 'MANUAL'];

// Badge-fargen interpoleres i color-mix() i inline styles på både admin- og
// elev-siden. Lås den til et trygt hex-format (#rgb / #rrggbb) slik at en
// administrator ikke kan persistere en vilkårlig streng som bryter CSS-en.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function sanitizeBadgeColor(input: string | null | undefined): string | null {
    const trimmed = (input ?? '').trim();
    if (!trimmed) return null;
    return HEX_COLOR_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

// Lucide-ikoner som UI-en kan rendre (samme allowlist som klient-komponentene).
// Et ukjent navn lagres som null så vi ikke persisterer vilkårlige strenger.
const ALLOWED_BADGE_ICONS = ['Trophy', 'Award', 'Star', 'Flame', 'Medal'];

function sanitizeBadgeIcon(input: string | null | undefined): string | null {
    const trimmed = (input ?? '').trim();
    if (!trimmed) return null;
    return ALLOWED_BADGE_ICONS.includes(trimmed) ? trimmed : null;
}

// ── Types ───────────────────────────────────────────────────

export interface PointRuleItem {
    event: string;
    label: string;
    points: number;
    active: boolean;
    configured: boolean;
}

export interface BadgeItem {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    criteriaType: BadgeCriteriaType;
    threshold: number | null;
    awardedCount: number;
    createdAt: string;
}

export interface LeaderboardEntry {
    userId: string;
    name: string;
    avatarUrl: string | null;
    totalPoints: number;
    level: number;
    badgeCount: number;
    rank: number;
    isCurrentUser?: boolean;
}

export interface GamificationStats {
    participants: number;
    totalPointsAwarded: number;
    badgesDefined: number;
    badgesAwarded: number;
    topLevel: number;
    longestStreak: number;
}

export interface MyGamification {
    enabled: boolean;
    totalPoints: number;
    level: number;
    currentStreak: number;
    longestStreak: number;
    progress: {
        pointsIntoLevel: number;
        pointsForThisLevel: number;
        pointsToNextLevel: number;
        percent: number;
    };
    rank: number | null;
    optedIn: boolean;
    badges: {
        id: string;
        name: string;
        description: string | null;
        color: string | null;
        icon: string | null;
        awardedAt: string;
    }[];
}

// Kanonisk liste over støttede poenghendelser (matcher PointRule.event-kommentar i schema).
const POINT_EVENTS: { event: string; label: string }[] = [
    { event: 'course_completed', label: 'Fullført kurs' },
    { event: 'lesson_completed', label: 'Fullført leksjon' },
    { event: 'quiz_passed', label: 'Bestått quiz' },
    { event: 'streak_day', label: 'Aktiv dag (streak)' },
    { event: 'session_attended', label: 'Deltatt på sesjon' },
];

const EVENT_LABELS: Record<string, string> = Object.fromEntries(
    POINT_EVENTS.map((e) => [e.event, e.label])
);

const DEFAULT_RULE_POINTS: Record<string, number> = {
    course_completed: 100,
    lesson_completed: 10,
    quiz_passed: 25,
    streak_day: 5,
    session_attended: 50,
};

// ══════════════════════════════════════════════════════════════
// POENGREGLER
// ══════════════════════════════════════════════════════════════

export async function listPointRules(): Promise<{ rules: PointRuleItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const rows = await prisma.pointRule.findMany({
            where: { tenantId },
            select: { event: true, points: true, active: true },
        });
        const map = new Map(rows.map((r) => [r.event, r]));

        const rules: PointRuleItem[] = POINT_EVENTS.map(({ event, label }) => {
            const existing = map.get(event);
            return {
                event,
                label,
                points: existing?.points ?? DEFAULT_RULE_POINTS[event] ?? 0,
                active: existing?.active ?? false,
                configured: !!existing,
            };
        });

        return { rules };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function setPointRule(
    event: string,
    points: number,
    active: boolean
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        if (!EVENT_LABELS[event]) return { error: 'Ukjent hendelse' };
        const safePoints = Number.isFinite(points) ? Math.max(0, Math.round(points)) : 0;

        await prisma.pointRule.upsert({
            where: { tenantId_event: { tenantId, event } },
            create: { tenantId, event, points: safePoints, active },
            update: { points: safePoints, active },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'gamification.point_rule.set',
            targetType: 'point_rule',
            targetId: event,
            metadata: { points: safePoints, active },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function seedDefaultRules(): Promise<{ success: true; created: number } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const existing = await prisma.pointRule.findMany({
            where: { tenantId },
            select: { event: true },
        });
        const existingEvents = new Set(existing.map((r) => r.event));

        const toCreate = POINT_EVENTS.filter((e) => !existingEvents.has(e.event)).map((e) => ({
            tenantId,
            event: e.event,
            points: DEFAULT_RULE_POINTS[e.event] ?? 0,
            active: true,
        }));

        if (toCreate.length > 0) {
            await prisma.pointRule.createMany({ data: toCreate, skipDuplicates: true });
            await logAudit({
                tenantId,
                actorUserId: userId,
                actorEmail: email,
                action: 'gamification.point_rule.seed',
                metadata: { created: toCreate.length },
            });
        }

        return { success: true, created: toCreate.length };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// BADGES
// ══════════════════════════════════════════════════════════════

export async function listBadges(): Promise<{ badges: BadgeItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const badges = await prisma.badge.findMany({
            where: { tenantId },
            select: {
                id: true,
                name: true,
                description: true,
                color: true,
                icon: true,
                criteriaType: true,
                threshold: true,
                createdAt: true,
                _count: { select: { userBadges: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        return {
            badges: badges.map((b) => ({
                id: b.id,
                name: b.name,
                description: b.description,
                color: b.color,
                icon: b.icon,
                criteriaType: b.criteriaType,
                threshold: b.threshold,
                awardedCount: b._count.userBadges,
                createdAt: b.createdAt.toISOString(),
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export interface BadgeInput {
    name: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    criteriaType: BadgeCriteriaType;
    threshold?: number | null;
}

function normalizeBadgeInput(data: BadgeInput): { value: {
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    criteriaType: BadgeCriteriaType;
    threshold: number | null;
} } | { error: string } {
    const name = (data.name ?? '').trim();
    if (name.length < 2) return { error: 'Navn må være minst 2 tegn' };

    if (!VALID_CRITERIA.includes(data.criteriaType)) return { error: 'Ugyldig kriterietype' };

    let threshold: number | null = null;
    if (data.criteriaType !== 'MANUAL') {
        if (data.threshold == null || !Number.isFinite(data.threshold) || data.threshold <= 0) {
            return { error: 'Automatiske badges krever en terskel større enn 0' };
        }
        threshold = Math.round(data.threshold);
    }

    return {
        value: {
            name,
            description: data.description?.trim() || null,
            color: sanitizeBadgeColor(data.color),
            icon: sanitizeBadgeIcon(data.icon),
            criteriaType: data.criteriaType,
            threshold,
        },
    };
}

export async function createBadge(data: BadgeInput): Promise<{ success: true; id: string } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const normalized = normalizeBadgeInput(data);
        if ('error' in normalized) return { error: normalized.error };

        const badge = await prisma.badge.create({
            data: { tenantId, ...normalized.value },
            select: { id: true },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'gamification.badge.create',
            targetType: 'badge',
            targetId: badge.id,
            metadata: { name: normalized.value.name, criteriaType: normalized.value.criteriaType },
        });

        return { success: true, id: badge.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function updateBadge(
    badgeId: string,
    data: BadgeInput
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        // Ownership: badge må tilhøre tenanten.
        const existing = await prisma.badge.findFirst({
            where: { id: badgeId, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'Badge ikke funnet' };

        const normalized = normalizeBadgeInput(data);
        if ('error' in normalized) return { error: normalized.error };

        await prisma.badge.update({
            where: { id: badgeId },
            data: normalized.value,
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'gamification.badge.update',
            targetType: 'badge',
            targetId: badgeId,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteBadge(badgeId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const existing = await prisma.badge.findFirst({
            where: { id: badgeId, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'Badge ikke funnet' };

        // UserBadge fjernes via onDelete: Cascade.
        await prisma.badge.delete({ where: { id: badgeId } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'gamification.badge.delete',
            targetType: 'badge',
            targetId: badgeId,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// MANUELL BADGE-TILDELING
// ══════════════════════════════════════════════════════════════

export async function awardBadge(
    userId: string,
    badgeId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const admin = await requireTenantAdmin();

        const access = await checkGamificationAccess(admin.tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        // Verifiser at både badge og bruker tilhører tenanten.
        const [badge, targetUser] = await Promise.all([
            prisma.badge.findFirst({ where: { id: badgeId, tenantId: admin.tenantId }, select: { id: true } }),
            prisma.user.findFirst({ where: { id: userId, tenantId: admin.tenantId }, select: { id: true } }),
        ]);
        if (!badge) return { error: 'Badge ikke funnet' };
        if (!targetUser) return { error: 'Bruker ikke funnet i organisasjonen' };

        const result = await prisma.userBadge.createMany({
            data: [{ tenantId: admin.tenantId, userId, badgeId }],
            skipDuplicates: true,
        });
        if (result.count === 0) return { error: 'Brukeren har allerede denne badgen' };

        await logAudit({
            tenantId: admin.tenantId,
            actorUserId: admin.userId,
            actorEmail: admin.email,
            action: 'gamification.badge.award',
            targetType: 'user',
            targetId: userId,
            metadata: { badgeId },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function revokeBadge(
    userId: string,
    badgeId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const admin = await requireTenantAdmin();

        const access = await checkGamificationAccess(admin.tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        // deleteMany med tenant-scope hindrer kryss-tenant-sletting.
        const result = await prisma.userBadge.deleteMany({
            where: { tenantId: admin.tenantId, userId, badgeId },
        });
        if (result.count === 0) return { error: 'Tildelingen ble ikke funnet' };

        await logAudit({
            tenantId: admin.tenantId,
            actorUserId: admin.userId,
            actorEmail: admin.email,
            action: 'gamification.badge.revoke',
            targetType: 'user',
            targetId: userId,
            metadata: { badgeId },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// ADMIN-VISNINGER (toppliste + statistikk)
// ══════════════════════════════════════════════════════════════

const LEADERBOARD_CAP = 100;

export async function getLeaderboard(
    scope?: { groupId?: string }
): Promise<{ entries: LeaderboardEntry[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Begrens eventuelt til medlemmer av en gruppe (tenant-scopet).
        let userIdFilter: string[] | null = null;
        if (scope?.groupId) {
            const group = await prisma.group.findFirst({
                where: { id: scope.groupId, tenantId },
                select: { id: true },
            });
            if (!group) return { error: 'Gruppe ikke funnet' };
            const memberships = await prisma.groupMembership.findMany({
                where: { groupId: scope.groupId },
                select: { userId: true },
            });
            userIdFilter = memberships.map((m) => m.userId);
            if (userIdFilter.length === 0) return { entries: [] };
        }

        const states = await prisma.userGamification.findMany({
            where: {
                tenantId,
                leaderboardOptIn: true,
                ...(userIdFilter ? { userId: { in: userIdFilter } } : {}),
            },
            orderBy: [{ totalPoints: 'desc' }, { updatedAt: 'asc' }],
            take: LEADERBOARD_CAP,
            select: { userId: true, totalPoints: true, level: true },
        });

        if (states.length === 0) return { entries: [] };

        const userIds = states.map((s) => s.userId);
        const [users, badgeCounts] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: userIds }, tenantId },
                select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            }),
            prisma.userBadge.groupBy({
                by: ['userId'],
                where: { tenantId, userId: { in: userIds } },
                _count: { userId: true },
            }),
        ]);

        const userMap = new Map(users.map((u) => [u.id, u]));
        const badgeMap = new Map(badgeCounts.map((b) => [b.userId, b._count.userId]));

        const entries: LeaderboardEntry[] = states
            .filter((s) => userMap.has(s.userId)) // dropp brukere som ikke lenger finnes i tenanten
            .map((s, idx) => {
                const u = userMap.get(s.userId)!;
                return {
                    userId: s.userId,
                    name: displayName(u),
                    avatarUrl: u.avatarUrl,
                    totalPoints: s.totalPoints,
                    level: s.level,
                    badgeCount: badgeMap.get(s.userId) ?? 0,
                    rank: idx + 1,
                };
            });

        return { entries };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function getGamificationStats(): Promise<{ stats: GamificationStats } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const [states, pointsAgg, badgesDefined, badgesAwarded] = await Promise.all([
            prisma.userGamification.findMany({
                where: { tenantId },
                select: { level: true, longestStreak: true },
            }),
            prisma.pointTransaction.aggregate({
                where: { tenantId },
                _sum: { points: true },
            }),
            prisma.badge.count({ where: { tenantId } }),
            prisma.userBadge.count({ where: { tenantId } }),
        ]);

        const topLevel = states.reduce((m, s) => Math.max(m, s.level), 0);
        const longestStreak = states.reduce((m, s) => Math.max(m, s.longestStreak), 0);

        return {
            stats: {
                participants: states.length,
                totalPointsAwarded: pointsAgg._sum.points ?? 0,
                badgesDefined,
                badgesAwarded,
                topLevel,
                longestStreak,
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Tenant-scopet brukerliste for manuell badge-tildeling (admin). */
export async function listGamificationUsers(
    search?: string
): Promise<{ users: { id: string; name: string; email: string | null }[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Record<string, unknown> = { tenantId, active: true };
        if (search && search.trim()) {
            const term = search.trim();
            where.OR = [
                { email: { contains: term, mode: 'insensitive' } },
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
                { name: { contains: term, mode: 'insensitive' } },
            ];
        }

        const users = await prisma.user.findMany({
            where,
            select: { id: true, name: true, firstName: true, lastName: true, email: true },
            orderBy: { email: 'asc' },
            take: 20,
        });

        return {
            users: users.map((u) => ({ id: u.id, name: displayName(u), email: u.email })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Tenant-scopet gruppeliste for topplistefilteret (admin). */
export async function listGroupsForFilter(): Promise<{ groups: { id: string; name: string }[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const groups = await prisma.group.findMany({
            where: { tenantId },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
        return { groups };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// LÆRER-SELVBETJENING (auth-only)
// ══════════════════════════════════════════════════════════════

export async function getMyGamification(): Promise<{ data: MyGamification } | { error: string }> {
    try {
        const { tenantId, userId } = await requireLearner();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) {
            return {
                data: {
                    enabled: false,
                    totalPoints: 0,
                    level: 1,
                    currentStreak: 0,
                    longestStreak: 0,
                    progress: { pointsIntoLevel: 0, pointsForThisLevel: 100, pointsToNextLevel: 100, percent: 0 },
                    rank: null,
                    optedIn: false,
                    badges: [],
                },
            };
        }

        const [state, userBadges] = await Promise.all([
            prisma.userGamification.findUnique({
                where: { userId },
                select: {
                    totalPoints: true,
                    level: true,
                    currentStreak: true,
                    longestStreak: true,
                    leaderboardOptIn: true,
                },
            }),
            prisma.userBadge.findMany({
                where: { tenantId, userId },
                orderBy: { awardedAt: 'desc' },
                select: {
                    awardedAt: true,
                    badge: { select: { id: true, name: true, description: true, color: true, icon: true } },
                },
            }),
        ]);

        const totalPoints = state?.totalPoints ?? 0;
        const progress = levelProgress(totalPoints);
        const optedIn = state?.leaderboardOptIn ?? true;

        // Rangering: kun meningsfull (og synlig) når brukeren deltar i topplista.
        let rank: number | null = null;
        if (optedIn && totalPoints > 0) {
            const ahead = await prisma.userGamification.count({
                where: {
                    tenantId,
                    leaderboardOptIn: true,
                    totalPoints: { gt: totalPoints },
                },
            });
            rank = ahead + 1;
        }

        return {
            data: {
                enabled: true,
                totalPoints,
                level: state?.level ?? levelForPoints(totalPoints),
                currentStreak: state?.currentStreak ?? 0,
                longestStreak: state?.longestStreak ?? 0,
                progress: {
                    pointsIntoLevel: progress.pointsIntoLevel,
                    pointsForThisLevel: progress.pointsForThisLevel,
                    pointsToNextLevel: progress.pointsToNextLevel,
                    percent: progress.percent,
                },
                rank,
                optedIn,
                badges: userBadges.map((ub) => ({
                    id: ub.badge.id,
                    name: ub.badge.name,
                    description: ub.badge.description,
                    color: ub.badge.color,
                    icon: ub.badge.icon,
                    awardedAt: ub.awardedAt.toISOString(),
                })),
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function getLeaderboardPublic(): Promise<
    { entries: LeaderboardEntry[]; enabled: boolean } | { error: string }
> {
    try {
        const { tenantId, userId } = await requireLearner();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { entries: [], enabled: false };

        const states = await prisma.userGamification.findMany({
            where: { tenantId, leaderboardOptIn: true },
            orderBy: [{ totalPoints: 'desc' }, { updatedAt: 'asc' }],
            take: LEADERBOARD_CAP,
            select: { userId: true, totalPoints: true, level: true },
        });

        if (states.length === 0) return { entries: [], enabled: true };

        const userIds = states.map((s) => s.userId);
        const [users, badgeCounts] = await Promise.all([
            prisma.user.findMany({
                where: { id: { in: userIds }, tenantId },
                select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            }),
            prisma.userBadge.groupBy({
                by: ['userId'],
                where: { tenantId, userId: { in: userIds } },
                _count: { userId: true },
            }),
        ]);

        const userMap = new Map(users.map((u) => [u.id, u]));
        const badgeMap = new Map(badgeCounts.map((b) => [b.userId, b._count.userId]));

        const entries: LeaderboardEntry[] = states
            .filter((s) => userMap.has(s.userId))
            .map((s, idx) => {
                const u = userMap.get(s.userId)!;
                return {
                    userId: s.userId,
                    name: displayName(u),
                    avatarUrl: u.avatarUrl,
                    totalPoints: s.totalPoints,
                    level: s.level,
                    badgeCount: badgeMap.get(s.userId) ?? 0,
                    rank: idx + 1,
                    isCurrentUser: s.userId === userId,
                };
            });

        return { entries, enabled: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function setLeaderboardOptIn(optIn: boolean): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId } = await requireLearner();

        const access = await checkGamificationAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        await prisma.userGamification.upsert({
            where: { userId },
            create: { tenantId, userId, leaderboardOptIn: optIn },
            update: { leaderboardOptIn: optIn },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
