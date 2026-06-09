'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';

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

// ── Export user data (GDPR data portability) ────────────────

/**
 * Assemble a complete export of a single user's data for GDPR portability.
 * Tenant-scoped: the user must belong to the acting admin's tenant, and the
 * export contains only that user's own data — never other users' records.
 */
export async function exportUserData(
    userId: string
): Promise<{ json: string; filename: string } | { error: string }> {
    try {
        const { tenantId, userId: adminId } = await requireTenantAdmin();

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: {
                id: true,
                name: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                image: true,
                jobTitle: true,
                department: true,
                bio: true,
                phone: true,
                location: true,
                workSchedule: true,
                startDate: true,
                externalId: true,
                globalRole: true,
                active: true,
                anonymizedAt: true,
                createdAt: true,
                updatedAt: true,
                groupMemberships: {
                    select: {
                        source: true,
                        createdAt: true,
                        group: { select: { id: true, name: true, description: true } },
                    },
                },
                courseEnrollments: {
                    select: {
                        id: true,
                        status: true,
                        completionPercentCached: true,
                        enrolledAt: true,
                        startedAt: true,
                        completedAt: true,
                        dueAt: true,
                        lastActivityAt: true,
                        course: { select: { id: true, title: true, slug: true } },
                        moduleProgress: {
                            select: {
                                status: true,
                                completionPercent: true,
                                startedAt: true,
                                completedAt: true,
                                module: { select: { id: true, title: true } },
                            },
                        },
                        lessonProgress: {
                            select: {
                                status: true,
                                timeSpentSeconds: true,
                                startedAt: true,
                                completedAt: true,
                                lesson: { select: { id: true, title: true } },
                            },
                        },
                    },
                },
                certificates: {
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        certificateNumber: true,
                        issuedAt: true,
                        expiresAt: true,
                        course: { select: { id: true, title: true } },
                    },
                },
                notifications: {
                    select: {
                        id: true,
                        type: true,
                        title: true,
                        message: true,
                        isRead: true,
                        createdAt: true,
                    },
                },
                skills: {
                    select: {
                        level: true,
                        source: true,
                        acquiredAt: true,
                        skill: { select: { id: true, name: true, category: true } },
                    },
                },
                sessionEnrollments: {
                    select: {
                        id: true,
                        status: true,
                        registeredAt: true,
                        attendedAt: true,
                        session: {
                            select: {
                                id: true,
                                title: true,
                                format: true,
                                startsAt: true,
                                endsAt: true,
                            },
                        },
                    },
                },
                onboardingEnrollments: {
                    select: {
                        id: true,
                        assignedAt: true,
                        completedAt: true,
                        program: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!user) return { error: 'Bruker ikke funnet' };

        // Build a human-readable, structured export. Each enrollment carries a
        // compact progress summary so the export is portable on its own.
        const exportObject = {
            metadata: {
                exportedAt: new Date().toISOString(),
                tenantId,
                userId: user.id,
                schemaVersion: 1,
            },
            profile: {
                id: user.id,
                name: user.name,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                avatarUrl: user.avatarUrl,
                image: user.image,
                jobTitle: user.jobTitle,
                department: user.department,
                bio: user.bio,
                phone: user.phone,
                location: user.location,
                workSchedule: user.workSchedule,
                startDate: user.startDate,
                externalId: user.externalId,
                globalRole: user.globalRole,
                active: user.active,
                anonymizedAt: user.anonymizedAt,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
            groupMemberships: user.groupMemberships.map((m) => ({
                groupId: m.group.id,
                groupName: m.group.name,
                description: m.group.description,
                source: m.source,
                joinedAt: m.createdAt,
            })),
            courseEnrollments: user.courseEnrollments.map((e) => ({
                id: e.id,
                courseId: e.course.id,
                courseTitle: e.course.title,
                courseSlug: e.course.slug,
                status: e.status,
                completionPercent: e.completionPercentCached,
                enrolledAt: e.enrolledAt,
                startedAt: e.startedAt,
                completedAt: e.completedAt,
                dueAt: e.dueAt,
                lastActivityAt: e.lastActivityAt,
                progressSummary: {
                    modules: {
                        total: e.moduleProgress.length,
                        completed: e.moduleProgress.filter((m) => m.status === 'COMPLETED').length,
                    },
                    lessons: {
                        total: e.lessonProgress.length,
                        completed: e.lessonProgress.filter((l) => l.status === 'COMPLETED').length,
                        totalTimeSpentSeconds: e.lessonProgress.reduce(
                            (sum, l) => sum + (l.timeSpentSeconds ?? 0),
                            0
                        ),
                    },
                },
                moduleProgress: e.moduleProgress.map((m) => ({
                    moduleId: m.module.id,
                    moduleTitle: m.module.title,
                    status: m.status,
                    completionPercent: m.completionPercent,
                    startedAt: m.startedAt,
                    completedAt: m.completedAt,
                })),
                lessonProgress: e.lessonProgress.map((l) => ({
                    lessonId: l.lesson.id,
                    lessonTitle: l.lesson.title,
                    status: l.status,
                    timeSpentSeconds: l.timeSpentSeconds,
                    startedAt: l.startedAt,
                    completedAt: l.completedAt,
                })),
            })),
            certificates: user.certificates.map((c) => ({
                id: c.id,
                title: c.title,
                description: c.description,
                certificateNumber: c.certificateNumber,
                issuedAt: c.issuedAt,
                expiresAt: c.expiresAt,
                courseId: c.course?.id ?? null,
                courseTitle: c.course?.title ?? null,
            })),
            notifications: user.notifications.map((n) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                isRead: n.isRead,
                createdAt: n.createdAt,
            })),
            skills: user.skills.map((s) => ({
                skillId: s.skill.id,
                skillName: s.skill.name,
                category: s.skill.category,
                level: s.level,
                source: s.source,
                acquiredAt: s.acquiredAt,
            })),
            sessionEnrollments: user.sessionEnrollments.map((s) => ({
                id: s.id,
                sessionId: s.session.id,
                sessionTitle: s.session.title,
                format: s.session.format,
                startsAt: s.session.startsAt,
                endsAt: s.session.endsAt,
                status: s.status,
                registeredAt: s.registeredAt,
                attendedAt: s.attendedAt,
            })),
            onboardingEnrollments: user.onboardingEnrollments.map((o) => ({
                id: o.id,
                programId: o.program.id,
                programName: o.program.name,
                assignedAt: o.assignedAt,
                completedAt: o.completedAt,
            })),
        };

        await logAudit({
            tenantId,
            actorUserId: adminId,
            action: 'gdpr.export',
            targetType: 'user',
            targetId: user.id,
        });

        return {
            json: JSON.stringify(exportObject, null, 2),
            filename: `bruker-${user.id}-data.json`,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Anonymize user (GDPR right to erasure — scrub PII) ──────

/**
 * Irreversibly scrub a user's personally identifiable information while keeping
 * learning records (enrollments, progress, certificates) intact for integrity
 * and reporting. The account is deactivated and marked as anonymized.
 *
 * Tenant-scoped. Refuses to anonymize the acting admin and refuses if the user
 * is already anonymized.
 */
export async function anonymizeUser(
    userId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId: adminId } = await requireTenantAdmin();

        if (userId === adminId) {
            return { error: 'Du kan ikke anonymisere din egen konto' };
        }

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true, anonymizedAt: true },
        });
        if (!user) return { error: 'Bruker ikke funnet' };

        if (user.anonymizedAt) {
            return { error: 'Brukeren er allerede anonymisert' };
        }

        // Non-reversible placeholder e-post som bevarer den globale unik-constrainten
        // på User.email. <userId> garanterer unikhet på tvers av tenants.
        const placeholderEmail = `anonymisert+${user.id}@anonymisert.local`;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                firstName: null,
                lastName: null,
                name: null,
                phone: null,
                bio: null,
                location: null,
                avatarUrl: null,
                image: null,
                jobTitle: null,
                department: null,
                workSchedule: null,
                externalId: null,
                email: placeholderEmail,
                active: false,
                anonymizedAt: new Date(),
            },
        });

        await logAudit({
            tenantId,
            actorUserId: adminId,
            action: 'gdpr.anonymized',
            targetType: 'user',
            targetId: user.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete user data (destructive alternative — hard delete) ─

/**
 * DESTRUCTIVE ALTERNATIVE to anonymizeUser. Permanently deletes the user row,
 * cascading to all owned records (enrollments, progress, certificates,
 * memberships, notifications, skills, sessions). Prefer anonymizeUser when
 * learning records must be retained for integrity/reporting.
 *
 * Tenant-scoped. Refuses to delete the acting admin.
 */
export async function deleteUserData(
    userId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId: adminId } = await requireTenantAdmin();

        if (userId === adminId) {
            return { error: 'Du kan ikke slette din egen konto' };
        }

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true },
        });
        if (!user) return { error: 'Bruker ikke funnet' };

        await prisma.user.delete({ where: { id: user.id } });

        // GDPR data-minimering: ikke persister den slettede brukerens PII
        // (f.eks. e-post) i AuditLog. Sporbarhet ivaretas av targetId (bruker-id)
        // og actorUserId — å lagre e-posten ville motvirke selve slettingen.
        await logAudit({
            tenantId,
            actorUserId: adminId,
            action: 'gdpr.deleted',
            targetType: 'user',
            targetId: user.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
