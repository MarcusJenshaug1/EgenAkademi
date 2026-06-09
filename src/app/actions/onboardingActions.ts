'use server';

import 'server-only';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { dispatchWebhookEvent } from '@/lib/webhooks';
import type { Prisma } from '@prisma/client';

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Types ───────────────────────────────────────────────────

export interface OnboardingProgramListItem {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    autoAssignOnCreate: boolean;
    autoAssignGroupId: string | null;
    itemCount: number;
    enrolleeCount: number;
    createdAt: Date;
}

export interface OnboardingItem {
    id: string;
    courseId: string | null;
    courseTitle: string | null;
    title: string;
    offsetDays: number;
    sortOrder: number;
}

export interface OnboardingProgramDetail {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    autoAssignOnCreate: boolean;
    autoAssignGroupId: string | null;
    items: OnboardingItem[];
    enrolleeCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface OnboardingEnrollee {
    enrollmentId: string;
    userId: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    assignedAt: Date;
    completedAt: Date | null;
}

export interface OnboardingPickerCourse {
    id: string;
    title: string;
}

export interface OnboardingPickerUser {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
}

export interface OnboardingPickerGroup {
    id: string;
    name: string;
}

export interface OnboardingStats {
    totalPrograms: number;
    activePrograms: number;
    autoAssignPrograms: number;
    totalEnrollees: number;
}

export interface OnboardingItemInput {
    courseId: string | null;
    title: string;
    offsetDays: number;
}

interface OnboardingProgramInput {
    name: string;
    description?: string | null;
    isActive?: boolean;
    autoAssignOnCreate?: boolean;
    autoAssignGroupId?: string | null;
}

function displayName(u: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    email: string | null;
}): string {
    if (u.firstName || u.lastName) return [u.firstName, u.lastName].filter(Boolean).join(' ');
    return u.name || u.email || 'Ukjent';
}

// ── List programs ───────────────────────────────────────────

export async function listPrograms(): Promise<
    { programs: OnboardingProgramListItem[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const programs = await prisma.onboardingProgram.findMany({
            where: { tenantId },
            select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
                autoAssignOnCreate: true,
                autoAssignGroupId: true,
                createdAt: true,
                _count: { select: { items: true, enrollments: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            programs: programs.map((p) => ({
                id: p.id,
                name: p.name,
                description: p.description,
                isActive: p.isActive,
                autoAssignOnCreate: p.autoAssignOnCreate,
                autoAssignGroupId: p.autoAssignGroupId,
                itemCount: p._count.items,
                enrolleeCount: p._count.enrollments,
                createdAt: p.createdAt,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Get single program (items + enrollee count) ─────────────

export async function getProgram(
    programId: string
): Promise<{ program: OnboardingProgramDetail } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
                autoAssignOnCreate: true,
                autoAssignGroupId: true,
                createdAt: true,
                updatedAt: true,
                items: {
                    select: {
                        id: true,
                        courseId: true,
                        title: true,
                        offsetDays: true,
                        sortOrder: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                },
                _count: { select: { enrollments: true } },
            },
        });

        if (!program) return { error: 'Program ikke funnet' };

        // Resolve course titles in a single tenant-scoped batch (no relation field on item).
        const courseIds = Array.from(
            new Set(program.items.map((it) => it.courseId).filter((id): id is string => !!id))
        );
        const courseTitleMap = new Map<string, string>();
        if (courseIds.length > 0) {
            const courses = await prisma.course.findMany({
                where: { id: { in: courseIds }, tenantId },
                select: { id: true, title: true },
            });
            for (const c of courses) courseTitleMap.set(c.id, c.title);
        }

        return {
            program: {
                id: program.id,
                name: program.name,
                description: program.description,
                isActive: program.isActive,
                autoAssignOnCreate: program.autoAssignOnCreate,
                autoAssignGroupId: program.autoAssignGroupId,
                items: program.items.map((it) => ({
                    id: it.id,
                    courseId: it.courseId,
                    courseTitle: it.courseId ? (courseTitleMap.get(it.courseId) ?? null) : null,
                    title: it.title,
                    offsetDays: it.offsetDays,
                    sortOrder: it.sortOrder,
                })),
                enrolleeCount: program._count.enrollments,
                createdAt: program.createdAt,
                updatedAt: program.updatedAt,
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Create program ──────────────────────────────────────────

export async function createProgram(
    data: OnboardingProgramInput
): Promise<{ success: true; programId: string } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        if (!data.name || data.name.trim().length < 2) {
            return { error: 'Programnavn må være minst 2 tegn' };
        }

        // Verify referenced group belongs to tenant before linking
        let groupId: string | null = null;
        if (data.autoAssignGroupId) {
            const group = await prisma.group.findFirst({
                where: { id: data.autoAssignGroupId, tenantId },
                select: { id: true },
            });
            if (!group) return { error: 'Valgt gruppe ikke funnet i organisasjonen' };
            groupId = group.id;
        }

        const program = await prisma.onboardingProgram.create({
            data: {
                tenantId,
                name: data.name.trim(),
                description: data.description?.trim() || null,
                isActive: data.isActive ?? true,
                autoAssignOnCreate: data.autoAssignOnCreate ?? false,
                autoAssignGroupId: groupId,
            },
            select: { id: true },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            action: 'onboarding.program.create',
            targetType: 'OnboardingProgram',
            targetId: program.id,
            metadata: { name: data.name.trim() },
        });

        return { success: true, programId: program.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Update program ──────────────────────────────────────────

export async function updateProgram(
    programId: string,
    data: OnboardingProgramInput
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: { id: true },
        });
        if (!program) return { error: 'Program ikke funnet' };

        if (data.name !== undefined && data.name.trim().length < 2) {
            return { error: 'Programnavn må være minst 2 tegn' };
        }

        // Verify referenced group belongs to tenant before linking
        if (data.autoAssignGroupId) {
            const group = await prisma.group.findFirst({
                where: { id: data.autoAssignGroupId, tenantId },
                select: { id: true },
            });
            if (!group) return { error: 'Valgt gruppe ikke funnet i organisasjonen' };
        }

        await prisma.onboardingProgram.update({
            where: { id: programId },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.description !== undefined && {
                    description: data.description?.trim() || null,
                }),
                ...(data.isActive !== undefined && { isActive: data.isActive }),
                ...(data.autoAssignOnCreate !== undefined && {
                    autoAssignOnCreate: data.autoAssignOnCreate,
                }),
                ...(data.autoAssignGroupId !== undefined && {
                    autoAssignGroupId: data.autoAssignGroupId || null,
                }),
            },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete program ──────────────────────────────────────────

export async function deleteProgram(
    programId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: { id: true, name: true },
        });
        if (!program) return { error: 'Program ikke funnet' };

        // Items + enrollments cascade via schema onDelete: Cascade
        await prisma.onboardingProgram.delete({ where: { id: programId } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            action: 'onboarding.program.delete',
            targetType: 'OnboardingProgram',
            targetId: programId,
            metadata: { name: program.name },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Add item ────────────────────────────────────────────────

export async function addItem(
    programId: string,
    data: OnboardingItemInput
): Promise<{ success: true; itemId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: { id: true },
        });
        if (!program) return { error: 'Program ikke funnet' };

        if (!data.title || data.title.trim().length < 1) {
            return { error: 'Tittel er påkrevd' };
        }

        // Verify referenced course belongs to tenant before linking
        if (data.courseId) {
            const course = await prisma.course.findFirst({
                where: { id: data.courseId, tenantId },
                select: { id: true },
            });
            if (!course) return { error: 'Valgt kurs ikke funnet i organisasjonen' };
        }

        const last = await prisma.onboardingProgramItem.findFirst({
            where: { programId, tenantId },
            select: { sortOrder: true },
            orderBy: { sortOrder: 'desc' },
        });
        const nextSort = (last?.sortOrder ?? -1) + 1;

        const offsetDays = Number.isFinite(data.offsetDays)
            ? Math.max(0, Math.trunc(data.offsetDays))
            : 0;

        const item = await prisma.onboardingProgramItem.create({
            data: {
                tenantId,
                programId,
                courseId: data.courseId || null,
                title: data.title.trim(),
                offsetDays,
                sortOrder: nextSort,
            },
            select: { id: true },
        });

        return { success: true, itemId: item.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Update item ─────────────────────────────────────────────

export async function updateItem(
    itemId: string,
    data: Partial<OnboardingItemInput>
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const item = await prisma.onboardingProgramItem.findFirst({
            where: { id: itemId, tenantId },
            select: { id: true },
        });
        if (!item) return { error: 'Element ikke funnet' };

        if (data.title !== undefined && data.title.trim().length < 1) {
            return { error: 'Tittel er påkrevd' };
        }

        // Verify referenced course belongs to tenant before linking
        if (data.courseId) {
            const course = await prisma.course.findFirst({
                where: { id: data.courseId, tenantId },
                select: { id: true },
            });
            if (!course) return { error: 'Valgt kurs ikke funnet i organisasjonen' };
        }

        await prisma.onboardingProgramItem.update({
            where: { id: itemId },
            data: {
                ...(data.title !== undefined && { title: data.title.trim() }),
                ...(data.courseId !== undefined && { courseId: data.courseId || null }),
                ...(data.offsetDays !== undefined && {
                    offsetDays: Number.isFinite(data.offsetDays)
                        ? Math.max(0, Math.trunc(data.offsetDays))
                        : 0,
                }),
            },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete item ─────────────────────────────────────────────

export async function deleteItem(
    itemId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const item = await prisma.onboardingProgramItem.findFirst({
            where: { id: itemId, tenantId },
            select: { id: true },
        });
        if (!item) return { error: 'Element ikke funnet' };

        await prisma.onboardingProgramItem.delete({ where: { id: itemId } });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Reorder items ───────────────────────────────────────────

export async function reorderItems(
    programId: string,
    orderedIds: string[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: { id: true },
        });
        if (!program) return { error: 'Program ikke funnet' };

        // Only reorder items that actually belong to this program + tenant
        const existing = await prisma.onboardingProgramItem.findMany({
            where: { programId, tenantId },
            select: { id: true },
        });
        const validIds = new Set(existing.map((i) => i.id));
        const toUpdate = orderedIds.filter((id) => validIds.has(id));

        await prisma.$transaction(
            toUpdate.map((id, index) =>
                prisma.onboardingProgramItem.update({
                    where: { id },
                    data: { sortOrder: index },
                })
            )
        );

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── List tenant courses (item picker) ───────────────────────

export async function listTenantCourses(): Promise<
    { courses: OnboardingPickerCourse[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const courses = await prisma.course.findMany({
            where: { tenantId, status: 'ACTIVE' },
            select: { id: true, title: true },
            orderBy: { title: 'asc' },
            take: 200,
        });

        return { courses };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── List tenant groups (auto-assign picker) ─────────────────

export async function listTenantGroups(): Promise<
    { groups: OnboardingPickerGroup[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const groups = await prisma.group.findMany({
            where: { tenantId },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
            take: 200,
        });

        return { groups };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── List tenant users (assign modal) ────────────────────────

export async function listTenantUsers(
    search?: string
): Promise<{ users: OnboardingPickerUser[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Prisma.UserWhereInput = { tenantId, active: true };
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
            take: 50,
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

// ── List program enrollees ──────────────────────────────────

export async function listProgramEnrollees(
    programId: string
): Promise<{ enrollees: OnboardingEnrollee[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: { id: true },
        });
        if (!program) return { error: 'Program ikke funnet' };

        const enrollments = await prisma.onboardingEnrollment.findMany({
            where: { programId, tenantId },
            select: {
                id: true,
                userId: true,
                assignedAt: true,
                completedAt: true,
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
            orderBy: { assignedAt: 'desc' },
        });

        return {
            enrollees: enrollments.map((e) => ({
                enrollmentId: e.id,
                userId: e.userId,
                name: displayName(e.user),
                email: e.user.email,
                avatarUrl: e.user.avatarUrl,
                assignedAt: e.assignedAt,
                completedAt: e.completedAt,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Core enroll logic (shared by assignProgram + auto-assign) ─

/**
 * Enroll a single user into a single program within a tenant.
 *
 * - Upserts the OnboardingEnrollment (skips duplicates via @@unique[programId,userId]).
 * - For each program item with a courseId, creates a CourseEnrollment if the user
 *   isn't already actively enrolled in that course (NOT_STARTED, dueAt = now + offsetDays,
 *   currentCourseVersionId from the course's currentPublishedVersionId), respecting the
 *   @@unique([tenantId, courseId, userId, currentCourseVersionId]) constraint.
 * - Creates an ONBOARDING_ASSIGNED notification per newly assigned course.
 *
 * Caller is responsible for verifying program + user belong to the tenant.
 */
async function enrollUserInProgram(
    tenantId: string,
    programId: string,
    userId: string,
    program: {
        name: string;
        items: { courseId: string | null; title: string; offsetDays: number }[];
    }
): Promise<void> {
    const now = new Date();

    // Upsert enrollment – skip silently if already enrolled (unique [programId,userId])
    await prisma.onboardingEnrollment.upsert({
        where: { programId_userId: { programId, userId } },
        update: {},
        create: { tenantId, programId, userId, assignedAt: now },
    });

    // Assign course enrollments for items that reference a course
    for (const item of program.items) {
        if (!item.courseId) continue;

        const course = await prisma.course.findFirst({
            where: { id: item.courseId, tenantId },
            select: { id: true, currentPublishedVersionId: true },
        });
        if (!course) continue;

        const versionId = course.currentPublishedVersionId ?? null;

        // Skip if the user is already actively enrolled in this course
        // (any non-terminal/active enrollment regardless of version).
        const existingActive = await prisma.courseEnrollment.findFirst({
            where: {
                tenantId,
                courseId: course.id,
                userId,
                status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'OVERDUE'] },
            },
            select: { id: true },
        });
        if (existingActive) continue;

        // Respect the unique constraint [tenantId, courseId, userId, currentCourseVersionId]
        const duplicate = await prisma.courseEnrollment.findFirst({
            where: {
                tenantId,
                courseId: course.id,
                userId,
                currentCourseVersionId: versionId,
            },
            select: { id: true },
        });
        if (duplicate) continue;

        const dueAt = new Date(now.getTime() + item.offsetDays * MS_PER_DAY);

        // The findFirst guards above are best-effort and not atomic. Under
        // concurrent assignment two callers can both pass the duplicate check
        // and race the unique constraint [tenantId,courseId,userId,currentCourseVersionId].
        // Wrap per-item so a constraint violation never aborts the remaining
        // items and never bubbles a raw Prisma error to the client.
        try {
            const enrollment = await prisma.courseEnrollment.create({
                data: {
                    tenantId,
                    courseId: course.id,
                    userId,
                    currentCourseVersionId: versionId,
                    status: 'NOT_STARTED',
                    dueAt,
                },
            });

            await prisma.notification.create({
                data: {
                    tenantId,
                    userId,
                    type: 'ONBOARDING_ASSIGNED',
                    title: 'Nytt onboarding-kurs tildelt',
                    message: `Du har fått tildelt "${item.title}" som del av onboarding-programmet "${program.name}". Frist: ${dueAt.toLocaleDateString('nb-NO')}.`,
                    entityType: 'course',
                    entityId: course.id,
                },
            });

            // Webhook (best-effort): aldri velt tildelingen om utsending feiler.
            await dispatchWebhookEvent(tenantId, 'enrollment.created', {
                userId,
                courseId: course.id,
                enrollmentId: enrollment.id,
            });
        } catch {
            // Skip this course (e.g. a concurrent enrollment won the unique
            // constraint race) and continue with the remaining program items.
        }
    }
}

// ── Assign program to users ─────────────────────────────────

export async function assignProgram(
    programId: string,
    userIds: string[]
): Promise<{ success: true; assignedCount: number } | { error: string }> {
    try {
        const { userId: actorUserId, tenantId } = await requireTenantAdmin();

        if (!userIds || userIds.length === 0) {
            return { error: 'Velg minst én bruker' };
        }

        const program = await prisma.onboardingProgram.findFirst({
            where: { id: programId, tenantId },
            select: {
                id: true,
                name: true,
                items: {
                    select: { courseId: true, title: true, offsetDays: true },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });
        if (!program) return { error: 'Program ikke funnet' };

        // Only operate on users that belong to this tenant
        const validUsers = await prisma.user.findMany({
            where: { id: { in: userIds }, tenantId },
            select: { id: true },
        });
        if (validUsers.length === 0) {
            return { error: 'Ingen gyldige brukere i organisasjonen' };
        }

        let assignedCount = 0;
        for (const u of validUsers) {
            try {
                await enrollUserInProgram(tenantId, programId, u.id, {
                    name: program.name,
                    items: program.items,
                });
                assignedCount += 1;
            } catch {
                // Skip this user (e.g. a concurrent enrollment race) so one
                // failure never aborts the rest of the batch or surfaces a raw error.
            }
        }

        await logAudit({
            tenantId,
            actorUserId,
            action: 'onboarding.program.assign',
            targetType: 'OnboardingProgram',
            targetId: programId,
            metadata: { name: program.name, userCount: assignedCount },
        });

        return { success: true, assignedCount };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Onboarding stats ────────────────────────────────────────

export async function getOnboardingStats(): Promise<OnboardingStats | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const [totalPrograms, activePrograms, autoAssignPrograms, totalEnrollees] =
            await Promise.all([
                prisma.onboardingProgram.count({ where: { tenantId } }),
                prisma.onboardingProgram.count({ where: { tenantId, isActive: true } }),
                prisma.onboardingProgram.count({
                    where: { tenantId, isActive: true, autoAssignOnCreate: true },
                }),
                prisma.onboardingEnrollment.count({ where: { tenantId } }),
            ]);

        return { totalPrograms, activePrograms, autoAssignPrograms, totalEnrollees };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Auto-assign on user create (wired by orchestrator) ──────

/**
 * Assign all active programs with autoAssignOnCreate=true to a newly created user.
 * Reuses the shared enroll logic. Swallows all errors – this is a best-effort
 * side effect of user creation and must never break the parent operation.
 *
 * NOTE: caller (userActions, wired by orchestrator) is responsible for ensuring
 * the user belongs to the given tenant.
 */
export async function runOnboardingAutoAssign(
    tenantId: string,
    userId: string
): Promise<void> {
    try {
        const programs = await prisma.onboardingProgram.findMany({
            where: { tenantId, isActive: true, autoAssignOnCreate: true },
            select: {
                id: true,
                name: true,
                items: {
                    select: { courseId: true, title: true, offsetDays: true },
                    orderBy: { sortOrder: 'asc' },
                },
            },
        });

        for (const program of programs) {
            try {
                await enrollUserInProgram(tenantId, program.id, userId, {
                    name: program.name,
                    items: program.items,
                });
            } catch {
                // Swallow per-program errors so one bad program doesn't block the rest.
            }
        }
    } catch {
        // Swallow: auto-assign must never break user creation.
    }
}
