'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';

// ── Hjelpefunksjon for autentisert bruker ──────────────

async function requireAuthenticatedUser() {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.tenantId) {
        return null;
    }
    return { userId: session.user.id, tenantId: session.user.tenantId, globalRole: session.user.globalRole ?? 'USER' };
}

// ── Typer ──────────────────────────────────────────────

export interface LearnerDashboardData {
    continueItem: EnrollmentSummary | null;
    inProgress: EnrollmentSummary[];
    dueSoon: EnrollmentSummary[];
    completed: EnrollmentSummary[];
    stats: {
        total: number;
        inProgress: number;
        completed: number;
        overdue: number;
    };
}

export interface EnrollmentSummary {
    enrollmentId: string;
    courseId: string;
    courseTitle: string;
    courseSlug: string;
    courseThumbnailUrl: string | null;
    difficulty: string | null;
    estimatedMinutes: number | null;
    status: string;
    progressPercent: number;
    enrolledAt: string;
    startedAt: string | null;
    completedAt: string | null;
    dueAt: string | null;
    lastActivityAt: string | null;
    resumeLessonId: string | null;
    resumeLessonTitle: string | null;
    resumeModuleTitle: string | null;
    moduleCount: number;
    lessonCount: number;
    isOverdue: boolean;
}

export interface CourseDetailLearner {
    courseId: string;
    title: string;
    slug: string;
    description: string | null;
    thumbnailUrl: string | null;
    estimatedMinutes: number | null;
    difficulty: string | null;
    categories: { id: string; name: string }[];
    tags: { id: string; label: string }[];
    enrollment: {
        enrollmentId: string;
        status: string;
        progressPercent: number;
        dueAt: string | null;
        startedAt: string | null;
        completedAt: string | null;
        resumeLessonId: string | null;
    } | null;
    modules: {
        moduleId: string;
        title: string;
        position: number;
        lessons: {
            lessonId: string;
            title: string;
            position: number;
            lessonType: string;
            estimatedMinutes: number | null;
            isOptional: boolean;
            status: string; // LOCKED | AVAILABLE | STARTED | COMPLETED
        }[];
    }[];
}

export interface CatalogCourse {
    courseId: string;
    title: string;
    slug: string;
    description: string | null;
    thumbnailUrl: string | null;
    estimatedMinutes: number | null;
    difficulty: string | null;
    categories: { id: string; name: string }[];
    tags: { id: string; label: string }[];
    moduleCount: number;
    lessonCount: number;
    isEnrolled: boolean;
    enrollmentStatus: string | null;
    progressPercent: number | null;
}

export interface PlayerData {
    courseId: string;
    courseTitle: string;
    enrollmentId: string;
    progressPercent: number;
    currentLesson: {
        lessonId: string;
        title: string;
        moduleTitle: string;
        blocks: {
            blockId: string;
            type: string;
            data: unknown;
            accessibilityMeta: unknown;
            position: number;
        }[];
    } | null;
    modules: {
        moduleId: string;
        title: string;
        position: number;
        status: string;
        lessons: {
            lessonId: string;
            title: string;
            position: number;
            lessonType: string;
            estimatedMinutes: number | null;
            isOptional: boolean;
            status: string;
        }[];
    }[];
    prevLessonId: string | null;
    nextLessonId: string | null;
    /** Saved block responses for the current lesson (quiz answers, open responses, etc.) */
    blockResponses: Record<string, unknown>;
}

// ── Dashboard data ─────────────────────────────────────

export async function getLearnerDashboard(): Promise<{ success: true; data: LearnerDashboardData } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const now = new Date();

        const isAdmin = user.globalRole === 'TENANT_ADMIN' || user.globalRole === 'SYSTEM_ADMIN';
        const enrollments = await prisma.courseEnrollment.findMany({
            where: { tenantId: user.tenantId, userId: user.userId, ...(!isAdmin && { course: { isSystemTemplate: false } }) },
            include: {
                course: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        thumbnailUrl: true,
                        difficulty: true,
                        estimatedMinutes: true,
                        currentPublishedVersionId: true,
                        currentPublishedVersion: {
                            select: {
                                modules: {
                                    select: {
                                        id: true,
                                        title: true,
                                        _count: { select: { lessons: true } },
                                    },
                                    orderBy: { position: 'asc' },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { lastActivityAt: { sort: 'desc', nulls: 'last' } },
        });

        // Map to EnrollmentSummary
        const items: EnrollmentSummary[] = enrollments.map((e) => {
            const modules = e.course.currentPublishedVersion?.modules ?? [];
            const lessonCount = modules.reduce((sum: number, m: { _count: { lessons: number } }) => sum + m._count.lessons, 0);
            const isOverdue = e.dueAt !== null && e.dueAt < now && e.completedAt === null;

            return {
                enrollmentId: e.id,
                courseId: e.course.id,
                courseTitle: e.course.title,
                courseSlug: e.course.slug,
                courseThumbnailUrl: e.course.thumbnailUrl,
                difficulty: e.course.difficulty,
                estimatedMinutes: e.course.estimatedMinutes,
                status: e.status,
                progressPercent: e.completionPercentCached,
                enrolledAt: e.enrolledAt.toISOString(),
                startedAt: e.startedAt?.toISOString() ?? null,
                completedAt: e.completedAt?.toISOString() ?? null,
                dueAt: e.dueAt?.toISOString() ?? null,
                lastActivityAt: e.lastActivityAt?.toISOString() ?? null,
                resumeLessonId: e.resumeLessonId,
                resumeLessonTitle: null, // Populated below for continueItem
                resumeModuleTitle: null,
                moduleCount: modules.length,
                lessonCount,
                isOverdue,
            };
        });

        const inProgress = items.filter((i) => i.status === 'IN_PROGRESS');
        const completed = items.filter((i) => i.status === 'COMPLETED');
        const overdue = items.filter((i) => i.isOverdue);

        // 14-day window for due soon
        const fourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
        const dueSoon = items.filter(
            (i) => i.dueAt && new Date(i.dueAt) >= now && new Date(i.dueAt) <= fourteenDays && !i.completedAt
        );

        // Continue learning — most recent in-progress
        let continueItem: EnrollmentSummary | null = null;
        if (inProgress.length > 0) {
            continueItem = inProgress[0];
            // Fetch resume lesson title if available
            if (continueItem.resumeLessonId) {
                const lesson = await prisma.lesson.findUnique({
                    where: { id: continueItem.resumeLessonId },
                    select: { title: true, module: { select: { title: true } } },
                });
                if (lesson) {
                    continueItem = {
                        ...continueItem,
                        resumeLessonTitle: lesson.title,
                        resumeModuleTitle: lesson.module.title,
                    };
                }
            }
        }

        return {
            success: true,
            data: {
                continueItem,
                inProgress,
                dueSoon,
                completed,
                stats: {
                    total: items.length,
                    inProgress: inProgress.length,
                    completed: completed.length,
                    overdue: overdue.length,
                },
            },
        };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── My Learning (full list with filters) ───────────────

export async function getMyLearning(params?: {
    status?: string;
    sort?: string;
}): Promise<{ success: true; items: EnrollmentSummary[] } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const now = new Date();
        const where: Record<string, unknown> = { tenantId: user.tenantId, userId: user.userId };

        if (params?.status === 'IN_PROGRESS') {
            where.status = 'IN_PROGRESS';
        } else if (params?.status === 'COMPLETED') {
            where.status = 'COMPLETED';
        } else if (params?.status === 'NOT_STARTED') {
            where.status = 'NOT_STARTED';
        } else if (params?.status === 'OVERDUE') {
            where.completedAt = null;
            where.dueAt = { lt: now };
        }

        type SortOption = { lastActivityAt: { sort: 'desc'; nulls: 'last' } } | { dueAt: { sort: 'asc'; nulls: 'last' } } | { completionPercentCached: 'desc' } | { enrolledAt: 'desc' };
        let orderBy: SortOption = { lastActivityAt: { sort: 'desc', nulls: 'last' } };
        if (params?.sort === 'dueAt') orderBy = { dueAt: { sort: 'asc', nulls: 'last' } };
        if (params?.sort === 'progress') orderBy = { completionPercentCached: 'desc' };
        if (params?.sort === 'enrolledAt') orderBy = { enrolledAt: 'desc' };

        const isAdmin = user.globalRole === 'TENANT_ADMIN' || user.globalRole === 'SYSTEM_ADMIN';
        const enrollments = await prisma.courseEnrollment.findMany({
            where: { ...where, ...(!isAdmin && { course: { isSystemTemplate: false } }) },
            include: {
                course: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        thumbnailUrl: true,
                        difficulty: true,
                        estimatedMinutes: true,
                        currentPublishedVersion: {
                            select: {
                                modules: {
                                    select: {
                                        _count: { select: { lessons: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: orderBy as Record<string, unknown>,
        });

        const items: EnrollmentSummary[] = enrollments.map((e) => {
            const modules = e.course.currentPublishedVersion?.modules ?? [];
            const lessonCount = modules.reduce(
                (sum: number, m: { _count: { lessons: number } }) => sum + m._count.lessons,
                0
            );
            const isOverdue = e.dueAt !== null && e.dueAt < now && e.completedAt === null;

            return {
                enrollmentId: e.id,
                courseId: e.course.id,
                courseTitle: e.course.title,
                courseSlug: e.course.slug,
                courseThumbnailUrl: e.course.thumbnailUrl,
                difficulty: e.course.difficulty,
                estimatedMinutes: e.course.estimatedMinutes,
                status: e.status,
                progressPercent: e.completionPercentCached,
                enrolledAt: e.enrolledAt.toISOString(),
                startedAt: e.startedAt?.toISOString() ?? null,
                completedAt: e.completedAt?.toISOString() ?? null,
                dueAt: e.dueAt?.toISOString() ?? null,
                lastActivityAt: e.lastActivityAt?.toISOString() ?? null,
                resumeLessonId: e.resumeLessonId,
                resumeLessonTitle: null,
                resumeModuleTitle: null,
                moduleCount: modules.length,
                lessonCount,
                isOverdue,
            };
        });

        return { success: true, items };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Course detail (learner view) ───────────────────────

export async function getLearnerCourseDetail(courseSlug: string): Promise<{ success: true; data: CourseDetailLearner } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const isAdmin = user.globalRole === 'TENANT_ADMIN' || user.globalRole === 'SYSTEM_ADMIN';
        const course = await prisma.course.findFirst({
            where: { tenantId: user.tenantId, slug: courseSlug, status: 'ACTIVE', ...(!isAdmin && { isSystemTemplate: false }) },
            select: {
                id: true,
                title: true,
                slug: true,
                description: true,
                thumbnailUrl: true,
                estimatedMinutes: true,
                difficulty: true,
                categories: { include: { category: { select: { id: true, name: true } } } },
                tags: { include: { tag: { select: { id: true, label: true } } } },
                currentPublishedVersionId: true,
                currentPublishedVersion: {
                    select: {
                        id: true,
                        modules: {
                            orderBy: { position: 'asc' },
                            select: {
                                id: true,
                                title: true,
                                position: true,
                                gatingPolicy: true,
                                lessons: {
                                    orderBy: { position: 'asc' },
                                    select: {
                                        id: true,
                                        title: true,
                                        position: true,
                                        lessonType: true,
                                        estimatedMinutes: true,
                                        isOptional: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!course) return { error: 'Kurs ikke funnet' };

        // Get enrollment + lesson progress
        const enrollment = await prisma.courseEnrollment.findFirst({
            where: { tenantId: user.tenantId, courseId: course.id, userId: user.userId },
            include: {
                lessonProgress: { select: { lessonId: true, status: true } },
            },
        });

        const lessonStatusMap = new Map<string, string>();
        if (enrollment) {
            for (const lp of enrollment.lessonProgress) {
                lessonStatusMap.set(lp.lessonId, lp.status);
            }
        }

        const modules = (course.currentPublishedVersion?.modules ?? []).map((mod) => ({
            moduleId: mod.id,
            title: mod.title,
            position: mod.position,
            lessons: mod.lessons.map((les) => ({
                lessonId: les.id,
                title: les.title,
                position: les.position,
                lessonType: les.lessonType,
                estimatedMinutes: les.estimatedMinutes,
                isOptional: les.isOptional,
                status: lessonStatusMap.get(les.id) ?? 'AVAILABLE',
            })),
        }));

        return {
            success: true,
            data: {
                courseId: course.id,
                title: course.title,
                slug: course.slug,
                description: course.description,
                thumbnailUrl: course.thumbnailUrl,
                estimatedMinutes: course.estimatedMinutes,
                difficulty: course.difficulty,
                categories: course.categories.map((cl) => cl.category),
                tags: course.tags.map((tl) => tl.tag),
                enrollment: enrollment
                    ? {
                        enrollmentId: enrollment.id,
                        status: enrollment.status,
                        progressPercent: enrollment.completionPercentCached,
                        dueAt: enrollment.dueAt?.toISOString() ?? null,
                        startedAt: enrollment.startedAt?.toISOString() ?? null,
                        completedAt: enrollment.completedAt?.toISOString() ?? null,
                        resumeLessonId: enrollment.resumeLessonId,
                    }
                    : null,
                modules,
            },
        };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Player data ────────────────────────────────────────

export async function getPlayerData(
    enrollmentId: string,
    lessonId?: string
): Promise<{ success: true; data: PlayerData } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        // BOLA protection: verify enrollment belongs to user + tenant
        const enrollment = await prisma.courseEnrollment.findFirst({
            where: { id: enrollmentId, userId: user.userId, tenantId: user.tenantId },
            include: {
                course: {
                    select: {
                        id: true,
                        title: true,
                        currentPublishedVersion: {
                            select: {
                                modules: {
                                    orderBy: { position: 'asc' },
                                    select: {
                                        id: true,
                                        title: true,
                                        position: true,
                                        gatingPolicy: true,
                                        lessons: {
                                            orderBy: { position: 'asc' },
                                            select: {
                                                id: true,
                                                title: true,
                                                position: true,
                                                lessonType: true,
                                                estimatedMinutes: true,
                                                isOptional: true,
                                                blocks: {
                                                    orderBy: { position: 'asc' },
                                                    select: {
                                                        id: true,
                                                        type: true,
                                                        data: true,
                                                        accessibilityMeta: true,
                                                        position: true,
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                lessonProgress: { select: { lessonId: true, status: true } },
                moduleProgress: { select: { moduleId: true, status: true } },
            },
        });

        if (!enrollment) return { error: 'Påmelding ikke funnet' };

        const modules = enrollment.course.currentPublishedVersion?.modules ?? [];
        const lessonStatusMap = new Map<string, string>();
        for (const lp of enrollment.lessonProgress) {
            lessonStatusMap.set(lp.lessonId, lp.status);
        }
        const moduleStatusMap = new Map<string, string>();
        for (const mp of enrollment.moduleProgress) {
            moduleStatusMap.set(mp.moduleId, mp.status);
        }

        // Flatten lesson list for prev/next navigation
        const allLessons: { lessonId: string; moduleTitle: string }[] = [];
        for (const mod of modules) {
            for (const les of mod.lessons) {
                allLessons.push({ lessonId: les.id, moduleTitle: mod.title });
            }
        }

        // Determine which lesson to show
        const targetLessonId = lessonId ?? enrollment.resumeLessonId ?? allLessons[0]?.lessonId ?? null;

        let currentLesson: PlayerData['currentLesson'] = null;
        let prevLessonId: string | null = null;
        let nextLessonId: string | null = null;

        if (targetLessonId) {
            const idx = allLessons.findIndex((l) => l.lessonId === targetLessonId);
            if (idx > 0) prevLessonId = allLessons[idx - 1].lessonId;
            if (idx < allLessons.length - 1) nextLessonId = allLessons[idx + 1].lessonId;

            // Find the lesson data
            for (const mod of modules) {
                const les = mod.lessons.find((l) => l.id === targetLessonId);
                if (les) {
                    currentLesson = {
                        lessonId: les.id,
                        title: les.title,
                        moduleTitle: mod.title,
                        blocks: les.blocks.map((b) => ({
                            blockId: b.id,
                            type: b.type,
                            data: b.data,
                            accessibilityMeta: b.accessibilityMeta,
                            position: b.position,
                        })),
                    };
                    break;
                }
            }
        }

        // Fetch saved block responses for the current lesson's blocks
        const blockResponseMap: Record<string, unknown> = {};
        if (currentLesson) {
            const blockIds = currentLesson.blocks.map((b) => b.blockId);
            if (blockIds.length > 0) {
                const responses = await prisma.blockResponse.findMany({
                    where: {
                        courseEnrollmentId: enrollmentId,
                        blockId: { in: blockIds },
                    },
                    select: { blockId: true, responseData: true },
                });
                for (const r of responses) {
                    blockResponseMap[r.blockId] = r.responseData;
                }
            }
        }

        return {
            success: true,
            data: {
                courseId: enrollment.course.id,
                courseTitle: enrollment.course.title,
                enrollmentId: enrollment.id,
                progressPercent: enrollment.completionPercentCached,
                currentLesson,
                modules: modules.map((mod) => ({
                    moduleId: mod.id,
                    title: mod.title,
                    position: mod.position,
                    status: moduleStatusMap.get(mod.id) ?? 'AVAILABLE',
                    lessons: mod.lessons.map((les) => ({
                        lessonId: les.id,
                        title: les.title,
                        position: les.position,
                        lessonType: les.lessonType,
                        estimatedMinutes: les.estimatedMinutes,
                        isOptional: les.isOptional,
                        status: lessonStatusMap.get(les.id) ?? 'AVAILABLE',
                    })),
                })),
                prevLessonId,
                nextLessonId,
                blockResponses: blockResponseMap,
            },
        };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Progress tracking ──────────────────────────────────

export async function markLessonCompleted(
    enrollmentId: string,
    lessonId: string,
): Promise<{ success: true; nextLessonId: string | null; coursePercent: number } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        // BOLA: verify ownership
        const enrollment = await prisma.courseEnrollment.findFirst({
            where: { id: enrollmentId, userId: user.userId, tenantId: user.tenantId },
            include: {
                course: {
                    select: {
                        currentPublishedVersion: {
                            select: {
                                modules: {
                                    orderBy: { position: 'asc' },
                                    select: {
                                        id: true,
                                        lessons: {
                                            orderBy: { position: 'asc' },
                                            select: { id: true, isOptional: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                lessonProgress: { select: { lessonId: true, status: true } },
            },
        });

        if (!enrollment) return { error: 'Påmelding ikke funnet' };

        const now = new Date();

        // Upsert lesson progress
        await prisma.lessonProgress.upsert({
            where: { courseEnrollmentId_lessonId: { courseEnrollmentId: enrollmentId, lessonId } },
            create: {
                tenantId: user.tenantId,
                courseEnrollmentId: enrollmentId,
                lessonId,
                status: 'COMPLETED',
                startedAt: now,
                completedAt: now,
            },
            update: {
                status: 'COMPLETED',
                completedAt: now,
            },
        });

        // Record event
        await prisma.progressEvent.create({
            data: {
                tenantId: user.tenantId,
                courseEnrollmentId: enrollmentId,
                eventType: 'LESSON_COMPLETED',
                entityType: 'lesson',
                entityId: lessonId,
            },
        });

        // Calculate new completion percentage
        const modules = enrollment.course.currentPublishedVersion?.modules ?? [];
        const allRequiredLessons: string[] = [];
        const allLessons: { lessonId: string }[] = [];
        for (const mod of modules) {
            for (const les of mod.lessons) {
                allLessons.push({ lessonId: les.id });
                if (!les.isOptional) allRequiredLessons.push(les.id);
            }
        }

        // Get updated progress
        const completedProgress = await prisma.lessonProgress.findMany({
            where: { courseEnrollmentId: enrollmentId, status: 'COMPLETED' },
            select: { lessonId: true },
        });
        const completedIds = new Set(completedProgress.map((p) => p.lessonId));

        const requiredCompleted = allRequiredLessons.filter((id) => completedIds.has(id)).length;
        const coursePercent = allRequiredLessons.length > 0
            ? Math.round((requiredCompleted / allRequiredLessons.length) * 100)
            : 100;

        // ── Module progress tracking ──────────────
        // For each module, check if all its required lessons are completed
        for (const mod of modules) {
            const moduleLessonIds = mod.lessons.map((l) => l.id);
            const requiredModuleLessons = mod.lessons.filter((l) => !l.isOptional).map((l) => l.id);
            const completedInModule = requiredModuleLessons.filter((id) => completedIds.has(id)).length;
            const modulePercent = requiredModuleLessons.length > 0
                ? Math.round((completedInModule / requiredModuleLessons.length) * 100)
                : 100;
            const moduleCompleted = modulePercent >= 100;

            // Only upsert if this lesson belongs to this module or module is now complete
            if (moduleLessonIds.includes(lessonId) || moduleCompleted) {
                await prisma.moduleProgress.upsert({
                    where: { courseEnrollmentId_moduleId: { courseEnrollmentId: enrollmentId, moduleId: mod.id } },
                    create: {
                        tenantId: user.tenantId,
                        courseEnrollmentId: enrollmentId,
                        moduleId: mod.id,
                        status: moduleCompleted ? 'COMPLETED' : 'STARTED',
                        completionPercent: modulePercent,
                        startedAt: now,
                        completedAt: moduleCompleted ? now : null,
                    },
                    update: {
                        status: moduleCompleted ? 'COMPLETED' : 'STARTED',
                        completionPercent: modulePercent,
                        completedAt: moduleCompleted ? now : undefined,
                    },
                });
            }
        }

        // Find next lesson
        const currentIdx = allLessons.findIndex((l) => l.lessonId === lessonId);
        const nextLessonId = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1].lessonId : null;

        // Update enrollment
        const isCompleted = coursePercent >= 100;
        await prisma.courseEnrollment.update({
            where: { id: enrollmentId },
            data: {
                completionPercentCached: coursePercent,
                resumeLessonId: nextLessonId,
                lastActivityAt: now,
                status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
                startedAt: enrollment.startedAt ?? now,
                completedAt: isCompleted ? now : null,
            },
        });

        if (isCompleted) {
            await prisma.progressEvent.create({
                data: {
                    tenantId: user.tenantId,
                    courseEnrollmentId: enrollmentId,
                    eventType: 'COURSE_COMPLETED',
                    entityType: 'course',
                    entityId: enrollment.courseId,
                },
            });
        }

        return { success: true, nextLessonId, coursePercent };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Start course (enroll if not enrolled) ──────────────

export async function startCourse(courseSlug: string): Promise<{ success: true; enrollmentId: string } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const isAdmin = user.globalRole === 'TENANT_ADMIN' || user.globalRole === 'SYSTEM_ADMIN';
        const course = await prisma.course.findFirst({
            where: { tenantId: user.tenantId, slug: courseSlug, status: 'ACTIVE', ...(!isAdmin && { isSystemTemplate: false }) },
            select: {
                id: true,
                currentPublishedVersionId: true,
                visibility: true,
                currentPublishedVersion: {
                    select: {
                        modules: {
                            orderBy: { position: 'asc' },
                            select: {
                                lessons: {
                                    orderBy: { position: 'asc' },
                                    select: { id: true },
                                    take: 1,
                                },
                            },
                            take: 1,
                        },
                    },
                },
            },
        });

        if (!course || !course.currentPublishedVersionId) return { error: 'Kurs ikke tilgjengelig' };

        // Validate published version actually exists in the database
        if (!course.currentPublishedVersion) return { error: 'Kurset har ingen gyldig publisert versjon' };

        // Check existing enrollment
        let enrollment = await prisma.courseEnrollment.findFirst({
            where: { tenantId: user.tenantId, courseId: course.id, userId: user.userId },
        });

        if (enrollment) {
            // Already enrolled — update if not started 
            if (enrollment.status === 'NOT_STARTED') {
                await prisma.courseEnrollment.update({
                    where: { id: enrollment.id },
                    data: { status: 'IN_PROGRESS', startedAt: new Date(), lastActivityAt: new Date() },
                });
            }
            return { success: true, enrollmentId: enrollment.id };
        }

        // Create new enrollment
        const firstLessonId = course.currentPublishedVersion?.modules[0]?.lessons[0]?.id ?? null;

        enrollment = await prisma.courseEnrollment.create({
            data: {
                tenantId: user.tenantId,
                courseId: course.id,
                userId: user.userId,
                currentCourseVersionId: course.currentPublishedVersionId,
                status: 'IN_PROGRESS',
                startedAt: new Date(),
                lastActivityAt: new Date(),
                resumeLessonId: firstLessonId,
            },
        });

        return { success: true, enrollmentId: enrollment.id };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Track lesson view (update resume pointer) ──────────

export async function trackLessonView(
    enrollmentId: string,
    lessonId: string,
): Promise<{ success: true } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        // BOLA: verify ownership
        const enrollment = await prisma.courseEnrollment.findFirst({
            where: { id: enrollmentId, userId: user.userId, tenantId: user.tenantId },
            select: { id: true },
        });
        if (!enrollment) return { error: 'Påmelding ikke funnet' };

        const now = new Date();

        // Update resume pointer + last activity
        await prisma.courseEnrollment.update({
            where: { id: enrollmentId },
            data: { resumeLessonId: lessonId, lastActivityAt: now },
        });

        // Upsert lesson progress → STARTED if not already COMPLETED
        await prisma.lessonProgress.upsert({
            where: { courseEnrollmentId_lessonId: { courseEnrollmentId: enrollmentId, lessonId } },
            create: {
                tenantId: user.tenantId,
                courseEnrollmentId: enrollmentId,
                lessonId,
                status: 'STARTED',
                startedAt: now,
            },
            update: {
                // Don't overwrite COMPLETED status
                startedAt: now,
            },
        });

        // Record event
        await prisma.progressEvent.create({
            data: {
                tenantId: user.tenantId,
                courseEnrollmentId: enrollmentId,
                eventType: 'LESSON_VIEWED',
                entityType: 'lesson',
                entityId: lessonId,
            },
        });

        return { success: true };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Block response persistence (quiz, open response) ───

export async function saveBlockResponse(
    enrollmentId: string,
    blockId: string,
    responseData: Record<string, unknown>,
): Promise<{ success: true } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        // BOLA: verify ownership
        const enrollment = await prisma.courseEnrollment.findFirst({
            where: { id: enrollmentId, userId: user.userId, tenantId: user.tenantId },
            select: { id: true },
        });
        if (!enrollment) return { error: 'Påmelding ikke funnet' };

        const jsonData = responseData as unknown as Parameters<typeof prisma.blockResponse.create>[0]['data']['responseData'];

        await prisma.blockResponse.upsert({
            where: { courseEnrollmentId_blockId: { courseEnrollmentId: enrollmentId, blockId } },
            create: {
                tenantId: user.tenantId,
                courseEnrollmentId: enrollmentId,
                blockId,
                responseData: jsonData,
            },
            update: {
                responseData: jsonData,
            },
        });

        return { success: true };
    } catch (e: unknown) {
        const message = 'Ukjent feil';
        return { error: message };
    }
}

// ── Sertifikater ──────────────────────────────────────

export interface CertificateData {
    id: string;
    title: string;
    courseTitle: string;
    courseSlug: string;
    issuedAt: Date;
    expiresAt: Date | null;
    certificateNumber: string | null;
}

export async function getLearnerCertificates(): Promise<
    { certificates: CertificateData[] } | { error: string }
> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const certificates = await prisma.certificate.findMany({
            where: { tenantId: user.tenantId, userId: user.userId },
            orderBy: { issuedAt: 'desc' },
            select: {
                id: true,
                title: true,
                issuedAt: true,
                expiresAt: true,
                certificateNumber: true,
                course: {
                    select: { title: true, slug: true },
                },
            },
        });

        return {
            certificates: certificates.map((c) => ({
                id: c.id,
                title: c.title,
                courseTitle: c.course.title,
                courseSlug: c.course.slug,
                issuedAt: c.issuedAt,
                expiresAt: c.expiresAt,
                certificateNumber: c.certificateNumber,
            })),
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Varsler ───────────────────────────────────────────

export interface NotificationData {
    id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date;
}

export async function getLearnerNotifications(): Promise<
    { notifications: NotificationData[] } | { error: string }
> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const notifications = await prisma.notification.findMany({
            where: { tenantId: user.tenantId, userId: user.userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                type: true,
                title: true,
                message: true,
                isRead: true,
                entityType: true,
                entityId: true,
                createdAt: true,
            },
        });

        return { notifications };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function markNotificationRead(
    notificationId: string
): Promise<{ success: true } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        await prisma.notification.updateMany({
            where: {
                id: notificationId,
                userId: user.userId,
                tenantId: user.tenantId,
            },
            data: { isRead: true },
        });
        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function markAllNotificationsRead(): Promise<{ success: true } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        await prisma.notification.updateMany({
            where: {
                userId: user.userId,
                tenantId: user.tenantId,
                isRead: false,
            },
            data: { isRead: true },
        });
        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Profil ────────────────────────────────────────────

export interface ProfileData {
    id: string;
    name: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
    department: string | null;
    bio: string | null;
    phone: string | null;
    location: string | null;
    startDate: Date | null;
    tenantName: string;
}

export async function getLearnerProfile(): Promise<
    { profile: ProfileData } | { error: string }
> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const userData = await prisma.user.findUnique({
            where: { id: user.userId },
            select: {
                id: true,
                name: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                jobTitle: true,
                department: true,
                bio: true,
                phone: true,
                location: true,
                startDate: true,
                tenant: {
                    select: { name: true },
                },
            },
        });

        if (!userData) return { error: 'Bruker ikke funnet' };

        return {
            profile: {
                ...userData,
                tenantName: userData.tenant?.name ?? 'Ukjent organisasjon',
            },
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function updateLearnerProfile(data: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    department?: string;
    bio?: string;
    phone?: string;
    location?: string;
    avatarUrl?: string;
}): Promise<{ success: true } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const updateData: Record<string, unknown> = {};
        if (data.firstName !== undefined) updateData.firstName = data.firstName.trim() || null;
        if (data.lastName !== undefined) updateData.lastName = data.lastName.trim() || null;
        if (data.jobTitle !== undefined) updateData.jobTitle = data.jobTitle.trim() || null;
        if (data.department !== undefined) updateData.department = data.department.trim() || null;
        if (data.bio !== undefined) updateData.bio = data.bio.trim() || null;
        if (data.phone !== undefined) updateData.phone = data.phone.trim() || null;
        if (data.location !== undefined) updateData.location = data.location.trim() || null;
        if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl.trim() || null;

        // Also update name from firstName + lastName
        if (data.firstName !== undefined || data.lastName !== undefined) {
            const currentUser = await prisma.user.findUnique({
                where: { id: user.userId },
                select: { firstName: true, lastName: true },
            });
            const fName = data.firstName !== undefined ? data.firstName.trim() : currentUser?.firstName ?? '';
            const lName = data.lastName !== undefined ? data.lastName.trim() : currentUser?.lastName ?? '';
            updateData.name = [fName, lName].filter(Boolean).join(' ') || null;
        }

        await prisma.user.update({
            where: { id: user.userId },
            data: updateData,
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Course Catalog (available courses) ─────────────────

export async function getAvailableCourses(): Promise<{ success: true; data: CatalogCourse[] } | { error: string }> {
    const user = await requireAuthenticatedUser();
    if (!user) return { error: 'Ikke autentisert' };

    try {
        const isAdmin = user.globalRole === 'TENANT_ADMIN' || user.globalRole === 'SYSTEM_ADMIN';
        // Get all published, visible courses for this tenant (excluding system templates for regular users)
        const courses = await prisma.course.findMany({
            where: {
                tenantId: user.tenantId,
                status: 'ACTIVE',
                visibility: { in: ['INTERNAL', 'PUBLIC'] },
                currentPublishedVersionId: { not: null },
                ...(!isAdmin && { isSystemTemplate: false }),
            },
            select: {
                id: true,
                title: true,
                slug: true,
                description: true,
                thumbnailUrl: true,
                estimatedMinutes: true,
                difficulty: true,
                categories: { include: { category: { select: { id: true, name: true } } } },
                tags: { include: { tag: { select: { id: true, label: true } } } },
                currentPublishedVersion: {
                    select: {
                        modules: {
                            select: {
                                id: true,
                                lessons: { select: { id: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { title: 'asc' },
        });

        // Get user's existing enrollments for these courses
        const enrollments = await prisma.courseEnrollment.findMany({
            where: {
                tenantId: user.tenantId,
                userId: user.userId,
                courseId: { in: courses.map((c) => c.id) },
            },
            select: { courseId: true, status: true, completionPercentCached: true },
        });
        const enrollmentMap = new Map(enrollments.map((e) => [e.courseId, e]));

        const data: CatalogCourse[] = courses.map((c) => {
            const enrollment = enrollmentMap.get(c.id);
            const modules = c.currentPublishedVersion?.modules ?? [];
            const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);

            return {
                courseId: c.id,
                title: c.title,
                slug: c.slug,
                description: c.description,
                thumbnailUrl: c.thumbnailUrl,
                estimatedMinutes: c.estimatedMinutes,
                difficulty: c.difficulty,
                categories: c.categories.map((cl) => cl.category),
                tags: c.tags.map((tl) => tl.tag),
                moduleCount: modules.length,
                lessonCount,
                isEnrolled: !!enrollment,
                enrollmentStatus: enrollment?.status ?? null,
                progressPercent: enrollment?.completionPercentCached ?? null,
            };
        });

        return { success: true, data };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}
