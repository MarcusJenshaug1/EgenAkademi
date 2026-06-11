'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { checkAccess } from '@/lib/features';
import type { EnrollmentStatus } from '@prisma/client';

// ── Helpers ─────────────────────────────────────────────────

async function requireTenantAdmin() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId };
}

/**
 * Verify the tenant has access to the escalation/recertification feature.
 * The deadlines area (reminders + escalation + recertification) is plan-gated
 * (`escalation-logic`, PLUS+) and must also be blocked when a tenant's trial has
 * expired. EVERY exported action — read and write — must pass this gate, mirroring
 * the requireSessionFeature() pattern in sessionActions.ts. Returns a discriminated
 * result so callers can surface a safe, generic upgrade reason.
 */
async function requireEscalationFeature(
    tenantId: string
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) {
        return { allowed: false as const, reason: 'Ingen tilgang til denne funksjonen.' };
    }
    const access = checkAccess(tenant, 'escalation-logic');
    if (!access.allowed) {
        return { allowed: false as const, reason: access.reason ?? 'Ingen tilgang til denne funksjonen.' };
    }
    return { allowed: true as const };
}

function displayName(u: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    email: string | null;
}): string {
    if (u.firstName || u.lastName) {
        return [u.firstName, u.lastName].filter(Boolean).join(' ');
    }
    return u.name || u.email || 'Ukjent';
}

const DEFAULT_REMINDER_WINDOWS = [14, 7, 1];

/** Whole-day difference (b - a) rounded toward zero, in calendar-ish days. */
function diffDays(a: Date, b: Date): number {
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Start of the current day (local server time) – used for same-day dedupe. */
function startOfToday(now: Date): Date {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Parse a notificationPolicy JSON value into a sorted, sanitised array of
 * reminder windows (days before due). Falls back to the default windows when
 * the policy is missing or malformed – never throws.
 */
function parseReminderWindows(policy: unknown): number[] {
    try {
        if (policy && typeof policy === 'object' && !Array.isArray(policy)) {
            const raw = (policy as Record<string, unknown>).remindersDaysBefore;
            if (Array.isArray(raw)) {
                const cleaned = raw
                    .map((n) => (typeof n === 'number' ? Math.trunc(n) : NaN))
                    .filter((n) => Number.isFinite(n) && n >= 0);
                if (cleaned.length > 0) {
                    return Array.from(new Set(cleaned)).sort((a, b) => b - a);
                }
            }
        }
    } catch {
        // Fall through to defaults on any malformed policy.
    }
    return DEFAULT_REMINDER_WINDOWS;
}

const ACTIVE_STATUSES: EnrollmentStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'OVERDUE'];

// ── Types ───────────────────────────────────────────────────

export interface DeadlineRow {
    enrollmentId: string;
    userName: string;
    userEmail: string | null;
    courseTitle: string;
    dueAt: Date | null;
    status: EnrollmentStatus;
    /** Positive number of days the enrollment is past due (overdue rows). */
    daysOverdue?: number;
    /** Number of days until the due date (upcoming rows). */
    daysUntilDue?: number;
}

export interface RecertRow {
    enrollmentId: string;
    userName: string;
    userEmail: string | null;
    courseTitle: string;
    completedAt: Date | null;
    /** Number of days since the recertification became due. */
    daysSinceDue: number;
}

export interface DeadlineOverview {
    overdueCount: number;
    upcomingCount: number;
    recertificationDueCount: number;
    overdue: DeadlineRow[];
    upcoming: DeadlineRow[];
    recertification: RecertRow[];
}

export interface SweepResult {
    markedOverdue: number;
    remindersSent: number;
    escalationsSent: number;
    recertCreated: number;
}

// ── Overview ────────────────────────────────────────────────

export async function getDeadlineOverview(): Promise<DeadlineOverview | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await requireEscalationFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const now = new Date();
        const upcomingHorizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

        // Overdue: dueAt < now AND status not completed/exempt.
        const overdueRaw = await prisma.courseEnrollment.findMany({
            where: {
                tenantId,
                dueAt: { lt: now },
                status: { notIn: ['COMPLETED', 'EXEMPT'] },
            },
            select: {
                id: true,
                dueAt: true,
                status: true,
                course: { select: { title: true } },
                user: { select: { firstName: true, lastName: true, name: true, email: true } },
            },
            orderBy: { dueAt: 'asc' },
            take: 50,
        });

        const overdueCount = await prisma.courseEnrollment.count({
            where: {
                tenantId,
                dueAt: { lt: now },
                status: { notIn: ['COMPLETED', 'EXEMPT'] },
            },
        });

        // Upcoming: dueAt within the next 14 days, not yet completed/exempt.
        const upcomingRaw = await prisma.courseEnrollment.findMany({
            where: {
                tenantId,
                dueAt: { gte: now, lte: upcomingHorizon },
                status: { notIn: ['COMPLETED', 'EXEMPT'] },
            },
            select: {
                id: true,
                dueAt: true,
                status: true,
                course: { select: { title: true } },
                user: { select: { firstName: true, lastName: true, name: true, email: true } },
            },
            orderBy: { dueAt: 'asc' },
            take: 50,
        });

        const upcomingCount = await prisma.courseEnrollment.count({
            where: {
                tenantId,
                dueAt: { gte: now, lte: upcomingHorizon },
                status: { notIn: ['COMPLETED', 'EXEMPT'] },
            },
        });

        // Recertification due: COMPLETED enrollments whose sourceRule has a
        // recertIntervalDays and where completedAt + interval <= now.
        const completedWithRule = await prisma.courseEnrollment.findMany({
            where: {
                tenantId,
                status: 'COMPLETED',
                completedAt: { not: null },
                sourceRule: { recertIntervalDays: { not: null } },
            },
            select: {
                id: true,
                completedAt: true,
                course: { select: { title: true } },
                user: { select: { firstName: true, lastName: true, name: true, email: true } },
                sourceRule: { select: { recertIntervalDays: true } },
            },
            orderBy: { completedAt: 'asc' },
        });

        const recertification: RecertRow[] = [];
        for (const e of completedWithRule) {
            const interval = e.sourceRule?.recertIntervalDays;
            if (!interval || !e.completedAt) continue;
            const dueDate = new Date(e.completedAt.getTime() + interval * 24 * 60 * 60 * 1000);
            if (dueDate <= now) {
                recertification.push({
                    enrollmentId: e.id,
                    userName: displayName(e.user),
                    userEmail: e.user.email,
                    courseTitle: e.course.title,
                    completedAt: e.completedAt,
                    daysSinceDue: Math.max(0, diffDays(dueDate, now)),
                });
            }
        }

        const overdue: DeadlineRow[] = overdueRaw.map((e) => ({
            enrollmentId: e.id,
            userName: displayName(e.user),
            userEmail: e.user.email,
            courseTitle: e.course.title,
            dueAt: e.dueAt,
            status: e.status,
            daysOverdue: e.dueAt ? Math.max(0, diffDays(e.dueAt, now)) : 0,
        }));

        const upcoming: DeadlineRow[] = upcomingRaw.map((e) => ({
            enrollmentId: e.id,
            userName: displayName(e.user),
            userEmail: e.user.email,
            courseTitle: e.course.title,
            dueAt: e.dueAt,
            status: e.status,
            daysUntilDue: e.dueAt ? Math.max(0, diffDays(now, e.dueAt)) : 0,
        }));

        return {
            overdueCount,
            upcomingCount,
            recertificationDueCount: recertification.length,
            overdue,
            upcoming,
            recertification: recertification.slice(0, 50),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Detailed lists ──────────────────────────────────────────

export async function listOverdue(): Promise<{ rows: DeadlineRow[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await requireEscalationFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const now = new Date();

        const rows = await prisma.courseEnrollment.findMany({
            where: {
                tenantId,
                dueAt: { lt: now },
                status: { notIn: ['COMPLETED', 'EXEMPT'] },
            },
            select: {
                id: true,
                dueAt: true,
                status: true,
                course: { select: { title: true } },
                user: { select: { firstName: true, lastName: true, name: true, email: true } },
            },
            orderBy: { dueAt: 'asc' },
            take: 200,
        });

        return {
            rows: rows.map((e) => ({
                enrollmentId: e.id,
                userName: displayName(e.user),
                userEmail: e.user.email,
                courseTitle: e.course.title,
                dueAt: e.dueAt,
                status: e.status,
                daysOverdue: e.dueAt ? Math.max(0, diffDays(e.dueAt, now)) : 0,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function listUpcoming(
    days = 14
): Promise<{ rows: DeadlineRow[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await requireEscalationFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const now = new Date();
        const safeDays = Number.isFinite(days) && days > 0 ? Math.trunc(days) : 14;
        const horizon = new Date(now.getTime() + safeDays * 24 * 60 * 60 * 1000);

        const rows = await prisma.courseEnrollment.findMany({
            where: {
                tenantId,
                dueAt: { gte: now, lte: horizon },
                status: { notIn: ['COMPLETED', 'EXEMPT'] },
            },
            select: {
                id: true,
                dueAt: true,
                status: true,
                course: { select: { title: true } },
                user: { select: { firstName: true, lastName: true, name: true, email: true } },
            },
            orderBy: { dueAt: 'asc' },
            take: 200,
        });

        return {
            rows: rows.map((e) => ({
                enrollmentId: e.id,
                userName: displayName(e.user),
                userEmail: e.user.email,
                courseTitle: e.course.title,
                dueAt: e.dueAt,
                status: e.status,
                daysUntilDue: e.dueAt ? Math.max(0, diffDays(now, e.dueAt)) : 0,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Deadline sweep ──────────────────────────────────────────

/**
 * Runs the daily deadline/recertification/escalation sweep for the tenant.
 *
 * This is intended to be invoked by a scheduled job (cron). For now it is
 * triggered manually from the admin UI. Each phase is wrapped defensively so a
 * single bad row never aborts the whole sweep.
 */
export async function runDeadlineSweep(): Promise<SweepResult | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const access = await requireEscalationFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const now = new Date();
        const today = startOfToday(now);

        let markedOverdue = 0;
        let remindersSent = 0;
        let escalationsSent = 0;
        let recertCreated = 0;

        // ── (a) Mark overdue ───────────────────────────────────
        try {
            const result = await prisma.courseEnrollment.updateMany({
                where: {
                    tenantId,
                    dueAt: { lt: now },
                    status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
                },
                data: { status: 'OVERDUE' },
            });
            markedOverdue = result.count;
        } catch {
            // Ignore – proceed with remaining phases.
        }

        // ── Tenant admins (recipients for escalation) ──────────
        let adminUserIds: string[] = [];
        try {
            const admins = await prisma.user.findMany({
                where: {
                    tenantId,
                    active: true,
                    globalRole: { in: ['TENANT_ADMIN', 'SYSTEM_ADMIN'] },
                },
                select: { id: true },
            });
            adminUserIds = admins.map((a) => a.id);
        } catch {
            adminUserIds = [];
        }

        // ── (b) Deadline reminders ─────────────────────────────
        try {
            const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
            const upcoming = await prisma.courseEnrollment.findMany({
                where: {
                    tenantId,
                    dueAt: { gte: now, lte: horizon },
                    status: { notIn: ['COMPLETED', 'EXEMPT'] },
                },
                select: {
                    id: true,
                    userId: true,
                    dueAt: true,
                    course: { select: { title: true } },
                    sourceRule: { select: { notificationPolicy: true } },
                },
            });

            for (const e of upcoming) {
                try {
                    if (!e.dueAt) continue;
                    const windows = parseReminderWindows(e.sourceRule?.notificationPolicy);
                    const daysUntil = diffDays(now, e.dueAt);
                    // Fire a reminder when we are at or just inside a window
                    // boundary. We match exact day counts present in the policy.
                    if (!windows.includes(daysUntil)) continue;

                    // Dedupe: skip if a DEADLINE_REMINDER for this enrollment was
                    // already created today.
                    const existing = await prisma.notification.findFirst({
                        where: {
                            tenantId,
                            userId: e.userId,
                            type: 'DEADLINE_REMINDER',
                            entityType: 'enrollment',
                            entityId: e.id,
                            createdAt: { gte: today },
                        },
                        select: { id: true },
                    });
                    if (existing) continue;

                    await prisma.notification.create({
                        data: {
                            tenantId,
                            userId: e.userId,
                            type: 'DEADLINE_REMINDER',
                            title: 'Påminnelse om frist',
                            message:
                                daysUntil <= 0
                                    ? `Fristen for "${e.course.title}" er i dag.`
                                    : `Du har ${daysUntil} dag(er) igjen til fristen for "${e.course.title}".`,
                            entityType: 'enrollment',
                            entityId: e.id,
                        },
                    });
                    remindersSent += 1;
                } catch {
                    // Skip this row, continue with the rest.
                }
            }
        } catch {
            // Ignore phase failure.
        }

        // ── (c) Escalations for overdue enrollments ────────────
        try {
            const overdue = await prisma.courseEnrollment.findMany({
                where: {
                    tenantId,
                    dueAt: { lt: now },
                    status: { notIn: ['COMPLETED', 'EXEMPT'] },
                },
                select: {
                    id: true,
                    userId: true,
                    course: { select: { title: true } },
                    user: {
                        select: {
                            firstName: true,
                            lastName: true,
                            name: true,
                            email: true,
                            managerId: true,
                        },
                    },
                },
            });

            for (const e of overdue) {
                try {
                    const learnerName = displayName(e.user);
                    // Recipients: the learner's manager (if set) + all tenant admins.
                    const recipientIds = new Set<string>();
                    if (e.user.managerId) recipientIds.add(e.user.managerId);
                    for (const adminId of adminUserIds) recipientIds.add(adminId);
                    // Never escalate to the learner themselves.
                    recipientIds.delete(e.userId);

                    for (const recipientId of recipientIds) {
                        try {
                            // Dedupe per recipient + enrollment + day.
                            const existing = await prisma.notification.findFirst({
                                where: {
                                    tenantId,
                                    userId: recipientId,
                                    type: 'ESCALATION',
                                    entityType: 'enrollment',
                                    entityId: e.id,
                                    createdAt: { gte: today },
                                },
                                select: { id: true },
                            });
                            if (existing) continue;

                            // Verify the recipient belongs to the tenant before writing.
                            const recipient = await prisma.user.findFirst({
                                where: { id: recipientId, tenantId },
                                select: { id: true },
                            });
                            if (!recipient) continue;

                            await prisma.notification.create({
                                data: {
                                    tenantId,
                                    userId: recipientId,
                                    type: 'ESCALATION',
                                    title: 'Forfalt frist',
                                    message: `${learnerName} har ikke fullført "${e.course.title}" innen fristen.`,
                                    entityType: 'enrollment',
                                    entityId: e.id,
                                },
                            });
                            escalationsSent += 1;
                        } catch {
                            // Skip this recipient.
                        }
                    }
                } catch {
                    // Skip this row.
                }
            }
        } catch {
            // Ignore phase failure.
        }

        // ── (d) Recertification ────────────────────────────────
        try {
            const completedWithRule = await prisma.courseEnrollment.findMany({
                where: {
                    tenantId,
                    status: 'COMPLETED',
                    completedAt: { not: null },
                    sourceRuleId: { not: null },
                    sourceRule: { recertIntervalDays: { not: null } },
                },
                select: {
                    id: true,
                    userId: true,
                    courseId: true,
                    completedAt: true,
                    sourceRuleId: true,
                    sourceRule: { select: { recertIntervalDays: true } },
                    course: { select: { title: true, currentPublishedVersionId: true } },
                },
            });

            for (const e of completedWithRule) {
                try {
                    const interval = e.sourceRule?.recertIntervalDays;
                    if (!interval || !e.completedAt) continue;
                    const dueDate = new Date(
                        e.completedAt.getTime() + interval * 24 * 60 * 60 * 1000
                    );
                    if (dueDate > now) continue;

                    // Skip if a newer active enrollment already exists for this
                    // course/user (e.g. an earlier sweep already created one).
                    const newerActive = await prisma.courseEnrollment.findFirst({
                        where: {
                            tenantId,
                            courseId: e.courseId,
                            userId: e.userId,
                            status: { in: ACTIVE_STATUSES },
                        },
                        select: { id: true },
                    });
                    if (newerActive) continue;

                    const newDueAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                    const versionId = e.course.currentPublishedVersionId ?? null;

                    // Guard the unique constraint
                    // @@unique([tenantId, courseId, userId, currentCourseVersionId]).
                    const conflict = await prisma.courseEnrollment.findFirst({
                        where: {
                            tenantId,
                            courseId: e.courseId,
                            userId: e.userId,
                            currentCourseVersionId: versionId,
                        },
                        select: { id: true },
                    });
                    if (conflict) continue;

                    await prisma.courseEnrollment.create({
                        data: {
                            tenantId,
                            courseId: e.courseId,
                            userId: e.userId,
                            status: 'NOT_STARTED',
                            dueAt: newDueAt,
                            currentCourseVersionId: versionId,
                            sourceRuleId: e.sourceRuleId,
                        },
                    });

                    await prisma.notification.create({
                        data: {
                            tenantId,
                            userId: e.userId,
                            type: 'RECERTIFICATION_DUE',
                            title: 'Resertifisering kreves',
                            message: `Det er på tide å fornye sertifiseringen for "${e.course.title}". Ny frist er om 30 dager.`,
                            entityType: 'course',
                            entityId: e.courseId,
                        },
                    });
                    recertCreated += 1;
                } catch {
                    // Skip this row.
                }
            }
        } catch {
            // Ignore phase failure.
        }

        await logAudit({
            tenantId,
            actorUserId: userId,
            action: 'deadline.sweep',
            targetType: 'tenant',
            targetId: tenantId,
            metadata: { markedOverdue, remindersSent, escalationsSent, recertCreated },
        });

        return { markedOverdue, remindersSent, escalationsSent, recertCreated };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
