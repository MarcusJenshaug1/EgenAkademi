'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';
import type {
    SessionFormat,
    SessionStatus,
    SessionEnrollmentStatus,
} from '@prisma/client';

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
 * Verify the tenant has access to the session-events feature.
 * Returns a discriminated result so callers can surface a safe, generic
 * upgrade reason. ALL session actions (read + write, admin + learner) must
 * pass this gate — the feature is plan-gated (STANDARD+) and must also be
 * blocked when a tenant's trial has expired.
 */
async function requireSessionFeature(
    tenantId: string
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) {
        return { allowed: false as const, reason: 'Ingen tilgang til denne funksjonen.' };
    }
    const access = checkAccess(tenant, 'session-events');
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

async function writeAudit(
    tenantId: string,
    actorUserId: string,
    action: string,
    targetId: string | null,
    metadata?: Record<string, unknown>
) {
    // Denormaliser actor-e-post slik at audit-loggen er lesbar selv om brukeren
    // senere slettes. logAudit svelger alle feil – audit er "best effort".
    let actorEmail: string | null = null;
    try {
        const actor = await prisma.user.findFirst({
            where: { id: actorUserId, tenantId },
            select: { email: true },
        });
        actorEmail = actor?.email ?? null;
    } catch {
        // Ignorer – kan fortsatt logge uten denormalisert e-post.
    }

    await logAudit({
        tenantId,
        actorUserId,
        actorEmail,
        action,
        targetType: 'session',
        targetId: targetId ?? undefined,
        metadata,
    });
}

// ── Types ───────────────────────────────────────────────────

export interface SessionListItem {
    id: string;
    title: string;
    description: string | null;
    format: SessionFormat;
    status: SessionStatus;
    location: string | null;
    meetingUrl: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number | null;
    instructorName: string | null;
    courseId: string | null;
    courseTitle: string | null;
    registeredCount: number;
    waitlistCount: number;
}

export interface SessionEnrollmentRow {
    enrollmentId: string;
    userId: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    status: SessionEnrollmentStatus;
    registeredAt: Date;
    attendedAt: Date | null;
}

export interface SessionDetail {
    id: string;
    title: string;
    description: string | null;
    format: SessionFormat;
    status: SessionStatus;
    location: string | null;
    meetingUrl: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number | null;
    instructorUserId: string | null;
    instructorName: string | null;
    courseId: string | null;
    courseTitle: string | null;
    registeredCount: number;
    waitlistCount: number;
    enrollments: SessionEnrollmentRow[];
}

export interface SessionPickerUser {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
}

export interface SessionStats {
    upcomingCount: number;
    totalEnrollments: number;
    avgFillRate: number;
    completedCount: number;
}

export interface SessionInput {
    title: string;
    description?: string | null;
    format: SessionFormat;
    status?: SessionStatus;
    location?: string | null;
    meetingUrl?: string | null;
    startsAt: string; // datetime-local string from the client
    endsAt: string;
    capacity?: number | null;
    instructorUserId?: string | null;
    courseId?: string | null;
}

// ── List sessions ───────────────────────────────────────────

export async function listSessions(filter?: {
    scope?: 'upcoming' | 'past' | 'all';
    status?: SessionStatus;
    search?: string;
}): Promise<{ sessions: SessionListItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const scope = filter?.scope ?? 'upcoming';
        const now = new Date();

        const where: Record<string, unknown> = { tenantId };

        if (scope === 'upcoming') {
            where.endsAt = { gte: now };
        } else if (scope === 'past') {
            where.endsAt = { lt: now };
        }

        if (filter?.status) {
            where.status = filter.status;
        }

        if (filter?.search && filter.search.trim()) {
            const term = filter.search.trim();
            where.OR = [
                { title: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
                { location: { contains: term, mode: 'insensitive' } },
            ];
        }

        const sessions = await prisma.trainingSession.findMany({
            where,
            select: {
                id: true,
                title: true,
                description: true,
                format: true,
                status: true,
                location: true,
                meetingUrl: true,
                startsAt: true,
                endsAt: true,
                capacity: true,
                courseId: true,
                instructor: {
                    select: { firstName: true, lastName: true, name: true, email: true },
                },
                course: { select: { title: true } },
                enrollments: { select: { status: true } },
            },
            orderBy: { startsAt: scope === 'past' ? 'desc' : 'asc' },
        });

        return {
            sessions: sessions.map((s) => {
                const registeredCount = s.enrollments.filter(
                    (e) => e.status === 'REGISTERED' || e.status === 'ATTENDED'
                ).length;
                const waitlistCount = s.enrollments.filter((e) => e.status === 'WAITLISTED').length;
                return {
                    id: s.id,
                    title: s.title,
                    description: s.description,
                    format: s.format,
                    status: s.status,
                    location: s.location,
                    meetingUrl: s.meetingUrl,
                    startsAt: s.startsAt,
                    endsAt: s.endsAt,
                    capacity: s.capacity,
                    instructorName: s.instructor ? displayName(s.instructor) : null,
                    courseId: s.courseId,
                    courseTitle: s.course?.title ?? null,
                    registeredCount,
                    waitlistCount,
                };
            }),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Get single session ──────────────────────────────────────

export async function getSession(
    id: string
): Promise<{ session: SessionDetail } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const s = await prisma.trainingSession.findFirst({
            where: { id, tenantId },
            select: {
                id: true,
                title: true,
                description: true,
                format: true,
                status: true,
                location: true,
                meetingUrl: true,
                startsAt: true,
                endsAt: true,
                capacity: true,
                instructorUserId: true,
                courseId: true,
                instructor: {
                    select: { firstName: true, lastName: true, name: true, email: true },
                },
                course: { select: { title: true } },
                enrollments: {
                    select: {
                        id: true,
                        userId: true,
                        status: true,
                        registeredAt: true,
                        attendedAt: true,
                        user: {
                            select: {
                                firstName: true,
                                lastName: true,
                                name: true,
                                email: true,
                                avatarUrl: true,
                            },
                        },
                    },
                    orderBy: { registeredAt: 'asc' },
                },
            },
        });

        if (!s) return { error: 'Sesjon ikke funnet' };

        const registeredCount = s.enrollments.filter(
            (e) => e.status === 'REGISTERED' || e.status === 'ATTENDED'
        ).length;
        const waitlistCount = s.enrollments.filter((e) => e.status === 'WAITLISTED').length;

        return {
            session: {
                id: s.id,
                title: s.title,
                description: s.description,
                format: s.format,
                status: s.status,
                location: s.location,
                meetingUrl: s.meetingUrl,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                capacity: s.capacity,
                instructorUserId: s.instructorUserId,
                instructorName: s.instructor ? displayName(s.instructor) : null,
                courseId: s.courseId,
                courseTitle: s.course?.title ?? null,
                registeredCount,
                waitlistCount,
                enrollments: s.enrollments.map((e) => ({
                    enrollmentId: e.id,
                    userId: e.userId,
                    name: displayName(e.user),
                    email: e.user.email,
                    avatarUrl: e.user.avatarUrl,
                    status: e.status,
                    registeredAt: e.registeredAt,
                    attendedAt: e.attendedAt,
                })),
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Validation + entity-ownership for create/update ─────────

interface ParsedSessionData {
    title: string;
    description: string | null;
    format: SessionFormat;
    status: SessionStatus;
    location: string | null;
    meetingUrl: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number | null;
    instructorUserId: string | null;
    courseId: string | null;
}

async function parseAndValidate(
    tenantId: string,
    data: SessionInput
): Promise<{ data: ParsedSessionData } | { error: string }> {
    if (!data.title || data.title.trim().length < 2) {
        return { error: 'Tittel må være minst 2 tegn' };
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        return { error: 'Ugyldig dato eller tidspunkt' };
    }
    if (startsAt >= endsAt) {
        return { error: 'Starttidspunkt må være før sluttidspunkt' };
    }

    let capacity: number | null = null;
    if (data.capacity !== undefined && data.capacity !== null) {
        if (!Number.isInteger(data.capacity) || data.capacity < 0) {
            return { error: 'Kapasitet må være et tall større eller lik 0' };
        }
        capacity = data.capacity;
    }

    // Verify instructor belongs to tenant
    let instructorUserId: string | null = null;
    if (data.instructorUserId) {
        const instructor = await prisma.user.findFirst({
            where: { id: data.instructorUserId, tenantId },
            select: { id: true },
        });
        if (!instructor) return { error: 'Instruktør ikke funnet i organisasjonen' };
        instructorUserId = instructor.id;
    }

    // Verify course belongs to tenant
    let courseId: string | null = null;
    if (data.courseId) {
        const course = await prisma.course.findFirst({
            where: { id: data.courseId, tenantId },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ikke funnet i organisasjonen' };
        courseId = course.id;
    }

    return {
        data: {
            title: data.title.trim(),
            description: data.description?.trim() || null,
            format: data.format,
            status: data.status ?? 'SCHEDULED',
            location: data.location?.trim() || null,
            meetingUrl: data.meetingUrl?.trim() || null,
            startsAt,
            endsAt,
            capacity,
            instructorUserId,
            courseId,
        },
    };
}

// ── Create session ──────────────────────────────────────────

export async function createSession(
    data: SessionInput
): Promise<{ success: true; sessionId: string } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const parsed = await parseAndValidate(tenantId, data);
        if ('error' in parsed) return { error: parsed.error };

        const session = await prisma.trainingSession.create({
            data: { tenantId, ...parsed.data },
        });

        await writeAudit(tenantId, userId, 'session.created', session.id, {
            title: session.title,
        });

        return { success: true, sessionId: session.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Update session ──────────────────────────────────────────

export async function updateSession(
    id: string,
    data: SessionInput
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const existing = await prisma.trainingSession.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'Sesjon ikke funnet' };

        const parsed = await parseAndValidate(tenantId, data);
        if ('error' in parsed) return { error: parsed.error };

        await prisma.trainingSession.update({
            where: { id },
            data: parsed.data,
        });

        await writeAudit(tenantId, userId, 'session.updated', id, { title: parsed.data.title });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete session ──────────────────────────────────────────

export async function deleteSession(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const existing = await prisma.trainingSession.findFirst({
            where: { id, tenantId },
            select: { id: true, title: true },
        });
        if (!existing) return { error: 'Sesjon ikke funnet' };

        // Enrollments cascade-delete via the schema relation.
        await prisma.trainingSession.delete({ where: { id } });

        await writeAudit(tenantId, userId, 'session.deleted', id, { title: existing.title });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Cancel session ──────────────────────────────────────────

export async function cancelSession(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const existing = await prisma.trainingSession.findFirst({
            where: { id, tenantId },
            select: {
                id: true,
                title: true,
                enrollments: {
                    where: { status: { in: ['REGISTERED', 'WAITLISTED'] } },
                    select: { userId: true },
                },
            },
        });
        if (!existing) return { error: 'Sesjon ikke funnet' };

        await prisma.trainingSession.update({
            where: { id },
            data: { status: 'CANCELLED' },
        });

        // Varsle alle påmeldte/ventelistede deltakere om at sesjonen er avlyst.
        // Best effort: én feilende varsling skal ikke velte avlysningen.
        for (const enrollment of existing.enrollments) {
            try {
                await prisma.notification.create({
                    data: {
                        tenantId,
                        userId: enrollment.userId,
                        type: 'GENERAL',
                        title: 'Sesjon avlyst',
                        message: `Sesjonen "${existing.title}" har blitt avlyst.`,
                        entityType: 'session',
                        entityId: id,
                    },
                });
            } catch {
                // Hopp over denne deltakeren, fortsett med resten.
            }
        }

        await writeAudit(tenantId, userId, 'session.cancelled', id, { title: existing.title });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Complete session ────────────────────────────────────────

export async function completeSession(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const existing = await prisma.trainingSession.findFirst({
            where: { id, tenantId },
            select: { id: true, title: true },
        });
        if (!existing) return { error: 'Sesjon ikke funnet' };

        await prisma.trainingSession.update({
            where: { id },
            data: { status: 'COMPLETED' },
        });

        await writeAudit(tenantId, userId, 'session.completed', id, { title: existing.title });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Enroll a user (admin) ───────────────────────────────────

export async function enrollUser(
    sessionId: string,
    userId: string
): Promise<{ success: true; status: SessionEnrollmentStatus } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();
        return await enrollInternal(tenantId, sessionId, userId);
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Shared enrollment logic used by both admin and learner flows.
 * Caller is responsible for the tenant scoping & permission checks.
 */
async function enrollInternal(
    tenantId: string,
    sessionId: string,
    userId: string
): Promise<{ success: true; status: SessionEnrollmentStatus } | { error: string }> {
    const access = await requireSessionFeature(tenantId);
    if (!access.allowed) return { error: access.reason };

    const session = await prisma.trainingSession.findFirst({
        where: { id: sessionId, tenantId },
        select: { id: true, status: true, capacity: true },
    });
    if (!session) return { error: 'Sesjon ikke funnet' };
    if (session.status === 'CANCELLED') return { error: 'Sesjonen er avlyst' };
    if (session.status === 'COMPLETED') return { error: 'Sesjonen er gjennomført' };

    const user = await prisma.user.findFirst({
        where: { id: userId, tenantId },
        select: { id: true },
    });
    if (!user) return { error: 'Bruker ikke funnet i organisasjonen' };

    const existing = await prisma.sessionEnrollment.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
    });

    if (existing && existing.status !== 'CANCELLED') {
        return { error: 'Brukeren er allerede påmeldt' };
    }

    // Determine whether there is room for an active seat.
    let status: SessionEnrollmentStatus = 'REGISTERED';
    if (session.capacity !== null) {
        const activeCount = await prisma.sessionEnrollment.count({
            where: {
                sessionId,
                status: { in: ['REGISTERED', 'ATTENDED'] },
            },
        });
        if (activeCount >= session.capacity) {
            status = 'WAITLISTED';
        }
    }

    if (existing) {
        await prisma.sessionEnrollment.update({
            where: { id: existing.id },
            data: { status, registeredAt: new Date(), attendedAt: null },
        });
    } else {
        await prisma.sessionEnrollment.create({
            data: { tenantId, sessionId, userId, status },
        });
    }

    return { success: true, status };
}

// ── Unenroll a user (admin) ─────────────────────────────────

export async function unenrollUser(
    sessionId: string,
    userId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();
        return await unenrollInternal(tenantId, sessionId, userId);
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Shared unenroll logic. Promotes the next waitlisted attendee when an
 * active seat is freed.
 */
async function unenrollInternal(
    tenantId: string,
    sessionId: string,
    userId: string
): Promise<{ success: true } | { error: string }> {
    const access = await requireSessionFeature(tenantId);
    if (!access.allowed) return { error: access.reason };

    const session = await prisma.trainingSession.findFirst({
        where: { id: sessionId, tenantId },
        select: { id: true, capacity: true },
    });
    if (!session) return { error: 'Sesjon ikke funnet' };

    const enrollment = await prisma.sessionEnrollment.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
    });
    if (!enrollment || enrollment.status === 'CANCELLED') {
        return { error: 'Brukeren er ikke påmeldt' };
    }

    const freedActiveSeat =
        enrollment.status === 'REGISTERED' || enrollment.status === 'ATTENDED';

    await prisma.sessionEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'CANCELLED', attendedAt: null },
    });

    // Promote the earliest waitlisted attendee into the freed seat.
    if (freedActiveSeat) {
        const next = await prisma.sessionEnrollment.findFirst({
            where: { sessionId, status: 'WAITLISTED' },
            orderBy: { registeredAt: 'asc' },
            select: { id: true },
        });
        if (next) {
            await prisma.sessionEnrollment.update({
                where: { id: next.id },
                data: { status: 'REGISTERED' },
            });
        }
    }

    return { success: true };
}

// ── Mark attendance ─────────────────────────────────────────

export async function markAttendance(
    sessionId: string,
    userId: string,
    status: 'ATTENDED' | 'NO_SHOW'
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const session = await prisma.trainingSession.findFirst({
            where: { id: sessionId, tenantId },
            select: { id: true },
        });
        if (!session) return { error: 'Sesjon ikke funnet' };

        const enrollment = await prisma.sessionEnrollment.findUnique({
            where: { sessionId_userId: { sessionId, userId } },
        });
        if (!enrollment) return { error: 'Brukeren er ikke påmeldt' };

        await prisma.sessionEnrollment.update({
            where: { id: enrollment.id },
            data: {
                status,
                attendedAt: status === 'ATTENDED' ? new Date() : null,
            },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Pickers ─────────────────────────────────────────────────

export async function listTenantInstructors(): Promise<
    { users: SessionPickerUser[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const users = await prisma.user.findMany({
            where: { tenantId, active: true },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                name: true,
                email: true,
                avatarUrl: true,
                jobTitle: true,
            },
            orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
            take: 100,
        });

        return {
            users: users.map((u) => ({
                id: u.id,
                name: displayName(u),
                email: u.email,
                avatarUrl: u.avatarUrl,
                jobTitle: u.jobTitle,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function listTenantUsers(
    search?: string
): Promise<{ users: SessionPickerUser[] } | { error: string }> {
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
            select: {
                id: true,
                firstName: true,
                lastName: true,
                name: true,
                email: true,
                avatarUrl: true,
                jobTitle: true,
            },
            orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
            take: 20,
        });

        return {
            users: users.map((u) => ({
                id: u.id,
                name: displayName(u),
                email: u.email,
                avatarUrl: u.avatarUrl,
                jobTitle: u.jobTitle,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function listTenantCourses(): Promise<
    { courses: { id: string; title: string }[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const courses = await prisma.course.findMany({
            where: { tenantId },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
            take: 200,
        });

        return { courses };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Session stats ───────────────────────────────────────────

export async function getSessionStats(): Promise<SessionStats | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const now = new Date();

        const [upcomingCount, completedCount, totalEnrollments, capacitySessions] =
            await Promise.all([
                prisma.trainingSession.count({
                    where: { tenantId, endsAt: { gte: now }, status: { not: 'CANCELLED' } },
                }),
                prisma.trainingSession.count({
                    where: { tenantId, status: 'COMPLETED' },
                }),
                prisma.sessionEnrollment.count({
                    where: { tenantId, status: { in: ['REGISTERED', 'ATTENDED'] } },
                }),
                prisma.trainingSession.findMany({
                    where: { tenantId, capacity: { not: null }, status: { not: 'CANCELLED' } },
                    select: {
                        capacity: true,
                        enrollments: {
                            where: { status: { in: ['REGISTERED', 'ATTENDED'] } },
                            select: { id: true },
                        },
                    },
                }),
            ]);

        let avgFillRate = 0;
        if (capacitySessions.length > 0) {
            const sum = capacitySessions.reduce((acc, s) => {
                if (!s.capacity || s.capacity <= 0) return acc;
                return acc + Math.min(1, s.enrollments.length / s.capacity);
            }, 0);
            avgFillRate = Math.round((sum / capacitySessions.length) * 100);
        }

        return { upcomingCount, totalEnrollments, avgFillRate, completedCount };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Learner-scoped actions (NO admin role required) ─────────

async function requireLearner() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId };
}

export interface LearnerSessionItem {
    id: string;
    title: string;
    description: string | null;
    format: SessionFormat;
    status: SessionStatus;
    location: string | null;
    meetingUrl: string | null;
    startsAt: Date;
    endsAt: Date;
    capacity: number | null;
    instructorName: string | null;
    courseTitle: string | null;
    registeredCount: number;
    waitlistCount: number;
    myStatus: SessionEnrollmentStatus | null;
}

export async function listMySessions(): Promise<
    { sessions: LearnerSessionItem[] } | { error: string }
> {
    try {
        const { userId, tenantId } = await requireLearner();

        const access = await requireSessionFeature(tenantId);
        if (!access.allowed) return { error: access.reason };

        const now = new Date();

        const sessions = await prisma.trainingSession.findMany({
            where: {
                tenantId,
                endsAt: { gte: now },
                status: { in: ['SCHEDULED', 'COMPLETED'] },
            },
            select: {
                id: true,
                title: true,
                description: true,
                format: true,
                status: true,
                location: true,
                meetingUrl: true,
                startsAt: true,
                endsAt: true,
                capacity: true,
                instructor: {
                    select: { firstName: true, lastName: true, name: true, email: true },
                },
                course: { select: { title: true } },
                enrollments: { select: { userId: true, status: true } },
            },
            orderBy: { startsAt: 'asc' },
        });

        return {
            sessions: sessions.map((s) => {
                const registeredCount = s.enrollments.filter(
                    (e) => e.status === 'REGISTERED' || e.status === 'ATTENDED'
                ).length;
                const waitlistCount = s.enrollments.filter((e) => e.status === 'WAITLISTED').length;
                const mine = s.enrollments.find((e) => e.userId === userId);
                return {
                    id: s.id,
                    title: s.title,
                    description: s.description,
                    format: s.format,
                    status: s.status,
                    location: s.location,
                    meetingUrl: s.meetingUrl,
                    startsAt: s.startsAt,
                    endsAt: s.endsAt,
                    capacity: s.capacity,
                    instructorName: s.instructor ? displayName(s.instructor) : null,
                    courseTitle: s.course?.title ?? null,
                    registeredCount,
                    waitlistCount,
                    myStatus:
                        mine && mine.status !== 'CANCELLED' ? mine.status : null,
                };
            }),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function enrollMe(
    sessionId: string
): Promise<{ success: true; status: SessionEnrollmentStatus } | { error: string }> {
    try {
        const { userId, tenantId } = await requireLearner();
        return await enrollInternal(tenantId, sessionId, userId);
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function unenrollMe(
    sessionId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId } = await requireLearner();
        return await unenrollInternal(tenantId, sessionId, userId);
    } catch {
        return { error: 'Ukjent feil' };
    }
}
