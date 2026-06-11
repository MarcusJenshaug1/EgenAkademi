'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import type { LessonType, CompletionRule, BlockType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { dispatchWebhookEvent } from '@/lib/webhooks';

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

// ── Modules ─────────────────────────────────────────────────

export async function addModule(
    courseVersionId: string,
    data: { title: string; summary?: string }
): Promise<{ success: true; moduleId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Verify version belongs to a course in this tenant (not a system template)
        const version = await prisma.courseVersion.findFirst({
            where: {
                id: courseVersionId,
                state: 'DRAFT',
                course: { tenantId, isSystemTemplate: false },
            },
            select: { id: true, _count: { select: { modules: true } } },
        });
        if (!version) return { error: 'Versjon ikke funnet, er ikke et utkast, eller er et systemkurs' };

        const mod = await prisma.module.create({
            data: {
                courseVersionId,
                title: data.title.trim(),
                summary: data.summary?.trim() || null,
                position: version._count.modules, // 0-indexed next position
            },
        });

        return { success: true, moduleId: mod.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function updateModule(
    moduleId: string,
    data: { title?: string; summary?: string; gatingPolicy?: string; minQuizScore?: number | null }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const mod = await prisma.module.findFirst({
            where: {
                id: moduleId,
                courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' },
            },
            select: { id: true },
        });
        if (!mod) return { error: 'Modul ikke funnet eller er et systemkurs' };

        await prisma.module.update({
            where: { id: moduleId },
            data: {
                title: data.title?.trim(),
                summary: data.summary?.trim(),
                gatingPolicy: data.gatingPolicy as import('@prisma/client').GatingPolicy | undefined,
                minQuizScore: data.minQuizScore,
            },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteModule(moduleId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const mod = await prisma.module.findFirst({
            where: {
                id: moduleId,
                courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' },
            },
            select: { id: true, courseVersionId: true, position: true },
        });
        if (!mod) return { error: 'Modul ikke funnet eller er et systemkurs' };

        await prisma.module.delete({ where: { id: moduleId } });

        // Re-order remaining modules
        await prisma.$executeRaw`UPDATE "Module" SET position = position - 1 WHERE "courseVersionId" = ${mod.courseVersionId} AND position > ${mod.position}`;

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function reorderModules(
    courseVersionId: string,
    moduleIds: string[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const version = await prisma.courseVersion.findFirst({
            where: { id: courseVersionId, state: 'DRAFT', course: { tenantId, isSystemTemplate: false } },
            select: { id: true },
        });
        if (!version) return { error: 'Versjon ikke funnet eller er et systemkurs' };

        // Update positions in a transaction
        await prisma.$transaction(
            moduleIds.map((id, index) =>
                prisma.module.update({ where: { id }, data: { position: index } })
            )
        );

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Lessons ─────────────────────────────────────────────────

export async function addLesson(
    moduleId: string,
    data: {
        title: string;
        lessonType?: LessonType;
        completionRule?: CompletionRule;
        estimatedMinutes?: number;
    }
): Promise<{ success: true; lessonId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const mod = await prisma.module.findFirst({
            where: {
                id: moduleId,
                courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' },
            },
            select: { id: true, _count: { select: { lessons: true } } },
        });
        if (!mod) return { error: 'Modul ikke funnet eller er et systemkurs' };

        const lesson = await prisma.lesson.create({
            data: {
                moduleId,
                title: data.title.trim(),
                lessonType: data.lessonType || 'STANDARD',
                completionRule: data.completionRule || 'MANUAL_MARK',
                estimatedMinutes: data.estimatedMinutes || null,
                position: mod._count.lessons,
            },
        });

        return { success: true, lessonId: lesson.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function updateLesson(
    lessonId: string,
    data: {
        title?: string;
        lessonType?: LessonType;
        completionRule?: CompletionRule;
        estimatedMinutes?: number | null;
        isOptional?: boolean;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const lesson = await prisma.lesson.findFirst({
            where: {
                id: lessonId,
                module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } },
            },
            select: { id: true },
        });
        if (!lesson) return { error: 'Leksjon ikke funnet eller er et systemkurs' };

        await prisma.lesson.update({
            where: { id: lessonId },
            data: {
                title: data.title?.trim(),
                lessonType: data.lessonType,
                completionRule: data.completionRule,
                estimatedMinutes: data.estimatedMinutes,
                isOptional: data.isOptional,
            },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteLesson(lessonId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const lesson = await prisma.lesson.findFirst({
            where: {
                id: lessonId,
                module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } },
            },
            select: { id: true, moduleId: true, position: true },
        });
        if (!lesson) return { error: 'Leksjon ikke funnet eller er et systemkurs' };

        await prisma.lesson.delete({ where: { id: lessonId } });

        // Re-order remaining lessons
        await prisma.$executeRaw`UPDATE "Lesson" SET position = position - 1 WHERE "moduleId" = ${lesson.moduleId} AND position > ${lesson.position}`;

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function reorderLessons(
    moduleId: string,
    lessonIds: string[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const mod = await prisma.module.findFirst({
            where: {
                id: moduleId,
                courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' },
            },
            select: { id: true },
        });
        if (!mod) return { error: 'Modul ikke funnet eller er et systemkurs' };

        await prisma.$transaction(
            lessonIds.map((id, index) =>
                prisma.lesson.update({ where: { id }, data: { position: index } })
            )
        );

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Version management ──────────────────────────────────────

export async function publishVersion(
    versionId: string,
    courseId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const version = await prisma.courseVersion.findFirst({
            where: {
                id: versionId,
                courseId,
                state: 'DRAFT',
                course: { tenantId, isSystemTemplate: false },
            },
            select: { id: true, _count: { select: { modules: true } } },
        });
        if (!version) return { error: 'Versjon ikke funnet, allerede publisert, eller er et systemkurs' };

        if (version._count.modules === 0) {
            return { error: 'Versjonen må ha minst én modul for å publiseres' };
        }

        // Archive previously published version (if any)
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { currentPublishedVersionId: true },
        });
        if (course?.currentPublishedVersionId) {
            await prisma.courseVersion.update({
                where: { id: course.currentPublishedVersionId },
                data: { state: 'ARCHIVED' },
            });
        }

        // Publish the new version
        await prisma.courseVersion.update({
            where: { id: versionId },
            data: { state: 'PUBLISHED', publishedAt: new Date() },
        });

        // Set as current published version on course
        await prisma.course.update({
            where: { id: courseId },
            data: { currentPublishedVersionId: versionId },
        });

        // Webhook (best-effort): aldri velt publiseringen om utsending feiler.
        await dispatchWebhookEvent(tenantId, 'course.published', {
            courseId,
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function createNewVersion(
    courseId: string
): Promise<{ success: true; versionId: string } | { error: string }> {
    try {
        const { tenantId, userId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId, isSystemTemplate: false },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ikke funnet eller er et systemkurs' };

        // Check no existing draft
        const existingDraft = await prisma.courseVersion.findFirst({
            where: { courseId, state: 'DRAFT' },
            select: { id: true },
        });
        if (existingDraft) {
            return { error: 'Det finnes allerede et utkast. Slett eller publiser det først.' };
        }

        // Get highest version number
        const latest = await prisma.courseVersion.findFirst({
            where: { courseId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
        });

        // Find the latest published version to copy content from
        const sourceVersion = await prisma.courseVersion.findFirst({
            where: { courseId, state: 'PUBLISHED' },
            orderBy: { versionNumber: 'desc' },
            include: {
                modules: {
                    orderBy: { position: 'asc' },
                    include: {
                        lessons: {
                            orderBy: { position: 'asc' },
                            include: {
                                blocks: {
                                    orderBy: { position: 'asc' },
                                },
                            },
                        },
                    },
                },
            },
        });

        const newVersion = await prisma.courseVersion.create({
            data: {
                courseId,
                versionNumber: (latest?.versionNumber ?? 0) + 1,
                state: 'DRAFT',
                createdByUserId: userId,
            },
        });

        // Copy modules, lessons and blocks from source version inside a transaction
        if (sourceVersion) {
            await prisma.$transaction(async (tx) => {
                for (const mod of sourceVersion.modules) {
                    const newModule = await tx.module.create({
                        data: {
                            courseVersionId: newVersion.id,
                            position: mod.position,
                            title: mod.title,
                            summary: mod.summary,
                            gatingPolicy: mod.gatingPolicy,
                            minQuizScore: mod.minQuizScore,
                        },
                    });

                    for (const lesson of mod.lessons) {
                        const newLesson = await tx.lesson.create({
                            data: {
                                moduleId: newModule.id,
                                position: lesson.position,
                                title: lesson.title,
                                lessonType: lesson.lessonType,
                                completionRule: lesson.completionRule,
                                estimatedMinutes: lesson.estimatedMinutes,
                                isOptional: lesson.isOptional,
                            },
                        });

                        if (lesson.blocks.length > 0) {
                            await tx.lessonBlock.createMany({
                                data: lesson.blocks.map((block) => ({
                                    lessonId: newLesson.id,
                                    position: block.position,
                                    type: block.type,
                                    data: block.data ?? Prisma.JsonNull,
                                    accessibilityMeta: block.accessibilityMeta ?? undefined,
                                })),
                            });
                        }
                    }
                }
            });
        }

        return { success: true, versionId: newVersion.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Lesson Blocks ───────────────────────────────────────────

export async function duplicateModule(
    moduleId: string
): Promise<{ success: true; moduleId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const mod = await prisma.module.findFirst({
            where: {
                id: moduleId,
                courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' },
            },
            include: {
                lessons: {
                    orderBy: { position: 'asc' },
                    include: {
                        blocks: { orderBy: { position: 'asc' } },
                    },
                },
            },
        });
        if (!mod) return { error: 'Modul ikke funnet eller versjonen er ikke et utkast' };

        // Count modules in this version for position
        const moduleCount = await prisma.module.count({
            where: { courseVersionId: mod.courseVersionId },
        });

        const newModule = await prisma.$transaction(async (tx) => {
            const created = await tx.module.create({
                data: {
                    courseVersionId: mod.courseVersionId,
                    position: moduleCount,
                    title: `${mod.title} (kopi)`,
                    summary: mod.summary,
                    gatingPolicy: mod.gatingPolicy,
                    minQuizScore: mod.minQuizScore,
                },
            });

            for (const lesson of mod.lessons) {
                const newLesson = await tx.lesson.create({
                    data: {
                        moduleId: created.id,
                        position: lesson.position,
                        title: lesson.title,
                        lessonType: lesson.lessonType,
                        completionRule: lesson.completionRule,
                        estimatedMinutes: lesson.estimatedMinutes,
                        isOptional: lesson.isOptional,
                    },
                });

                if (lesson.blocks.length > 0) {
                    await tx.lessonBlock.createMany({
                        data: lesson.blocks.map((block) => ({
                            lessonId: newLesson.id,
                            position: block.position,
                            type: block.type,
                            data: block.data ?? Prisma.JsonNull,
                            accessibilityMeta: block.accessibilityMeta ?? undefined,
                        })),
                    });
                }
            }

            return created;
        });

        return { success: true, moduleId: newModule.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function duplicateLesson(
    lessonId: string
): Promise<{ success: true; lessonId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const lesson = await prisma.lesson.findFirst({
            where: {
                id: lessonId,
                module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } },
            },
            include: {
                blocks: { orderBy: { position: 'asc' } },
            },
        });
        if (!lesson) return { error: 'Leksjon ikke funnet eller versjonen er ikke et utkast' };

        // Count lessons in this module for position
        const lessonCount = await prisma.lesson.count({
            where: { moduleId: lesson.moduleId },
        });

        const newLesson = await prisma.$transaction(async (tx) => {
            const created = await tx.lesson.create({
                data: {
                    moduleId: lesson.moduleId,
                    position: lessonCount,
                    title: `${lesson.title} (kopi)`,
                    lessonType: lesson.lessonType,
                    completionRule: lesson.completionRule,
                    estimatedMinutes: lesson.estimatedMinutes,
                    isOptional: lesson.isOptional,
                },
            });

            if (lesson.blocks.length > 0) {
                await tx.lessonBlock.createMany({
                    data: lesson.blocks.map((block) => ({
                        lessonId: created.id,
                        position: block.position,
                        type: block.type,
                        data: block.data ?? Prisma.JsonNull,
                        accessibilityMeta: block.accessibilityMeta ?? undefined,
                    })),
                });
            }

            return created;
        });

        return { success: true, lessonId: newLesson.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Restore from archived version ───────────────────────────

export async function restoreVersion(
    versionId: string,
    courseId: string
): Promise<{ success: true; versionId: string } | { error: string }> {
    try {
        const { tenantId, userId } = await requireTenantAdmin();

        // Verify the version exists and belongs to this tenant's course (not system template)
        const version = await prisma.courseVersion.findFirst({
            where: {
                id: versionId,
                courseId,
                course: { tenantId, isSystemTemplate: false },
            },
            include: {
                modules: {
                    orderBy: { position: 'asc' },
                    include: {
                        lessons: {
                            orderBy: { position: 'asc' },
                            include: {
                                blocks: { orderBy: { position: 'asc' } },
                            },
                        },
                    },
                },
            },
        });
        if (!version) return { error: 'Versjon ikke funnet' };

        // Check no existing draft
        const existingDraft = await prisma.courseVersion.findFirst({
            where: { courseId, state: 'DRAFT' },
            select: { id: true },
        });
        if (existingDraft) {
            return { error: 'Det finnes allerede et utkast. Slett eller publiser det først.' };
        }

        // Get next version number
        const latest = await prisma.courseVersion.findFirst({
            where: { courseId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
        });

        // Create a new DRAFT version with content copied from the source
        const newVersion = await prisma.$transaction(async (tx) => {
            const created = await tx.courseVersion.create({
                data: {
                    courseId,
                    versionNumber: (latest?.versionNumber ?? 0) + 1,
                    state: 'DRAFT',
                    createdByUserId: userId,
                    changeLog: `Gjenopprettet fra v${version.versionNumber}`,
                },
            });

            for (const mod of version.modules) {
                const newModule = await tx.module.create({
                    data: {
                        courseVersionId: created.id,
                        position: mod.position,
                        title: mod.title,
                        summary: mod.summary,
                        gatingPolicy: mod.gatingPolicy,
                        minQuizScore: mod.minQuizScore,
                    },
                });

                for (const lesson of mod.lessons) {
                    const newLesson = await tx.lesson.create({
                        data: {
                            moduleId: newModule.id,
                            position: lesson.position,
                            title: lesson.title,
                            lessonType: lesson.lessonType,
                            completionRule: lesson.completionRule,
                            estimatedMinutes: lesson.estimatedMinutes,
                            isOptional: lesson.isOptional,
                        },
                    });

                    if (lesson.blocks.length > 0) {
                        await tx.lessonBlock.createMany({
                            data: lesson.blocks.map((block) => ({
                                lessonId: newLesson.id,
                                position: block.position,
                                type: block.type,
                                data: block.data ?? Prisma.JsonNull,
                                accessibilityMeta: block.accessibilityMeta ?? undefined,
                            })),
                        });
                    }
                }
            }

            return created;
        });

        return { success: true, versionId: newVersion.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function getLessonBlocks(
    lessonId: string
): Promise<{ success: true; blocks: Array<{
    id: string;
    position: number;
    type: BlockType;
    data: unknown;
    accessibilityMeta: unknown;
}> } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const lesson = await prisma.lesson.findFirst({
            where: {
                id: lessonId,
                module: { courseVersion: { course: { tenantId } } },
            },
            select: { id: true },
        });
        if (!lesson) return { error: 'Leksjon ikke funnet' };

        const blocks = await prisma.lessonBlock.findMany({
            where: { lessonId },
            orderBy: { position: 'asc' },
            select: {
                id: true,
                position: true,
                type: true,
                data: true,
                accessibilityMeta: true,
            },
        });

        return { success: true, blocks };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function addBlock(
    lessonId: string,
    data: {
        type: BlockType;
        data: Record<string, unknown>;
        accessibilityMeta?: Record<string, unknown>;
    }
): Promise<{ success: true; blockId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const lesson = await prisma.lesson.findFirst({
            where: {
                id: lessonId,
                module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } },
            },
            select: { id: true, _count: { select: { blocks: true } } },
        });
        if (!lesson) return { error: 'Leksjon ikke funnet eller versjonen er ikke et utkast' };

        const block = await prisma.lessonBlock.create({
            data: {
                lessonId,
                type: data.type,
                data: data.data as Prisma.InputJsonValue,
                accessibilityMeta: data.accessibilityMeta
                    ? (data.accessibilityMeta as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                position: lesson._count.blocks,
            },
        });

        return { success: true, blockId: block.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function updateBlock(
    blockId: string,
    data: {
        type?: BlockType;
        data?: Record<string, unknown>;
        accessibilityMeta?: Record<string, unknown> | null;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const block = await prisma.lessonBlock.findFirst({
            where: {
                id: blockId,
                lesson: { module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } } },
            },
            select: { id: true },
        });
        if (!block) return { error: 'Blokk ikke funnet, versjonen er ikke et utkast, eller er et systemkurs' };

        const updateData: Record<string, unknown> = {};
        if (data.type !== undefined) updateData.type = data.type;
        if (data.data !== undefined) updateData.data = data.data as Prisma.InputJsonValue;
        if (data.accessibilityMeta !== undefined) {
            updateData.accessibilityMeta = data.accessibilityMeta
                ? (data.accessibilityMeta as Prisma.InputJsonValue)
                : Prisma.JsonNull;
        }

        await prisma.lessonBlock.update({
            where: { id: blockId },
            data: updateData,
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteBlock(
    blockId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const block = await prisma.lessonBlock.findFirst({
            where: {
                id: blockId,
                lesson: { module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } } },
            },
            select: { id: true, lessonId: true, position: true },
        });
        if (!block) return { error: 'Blokk ikke funnet, versjonen er ikke et utkast, eller er et systemkurs' };

        await prisma.lessonBlock.delete({ where: { id: blockId } });

        // Re-index positions
        await prisma.$executeRaw`UPDATE "LessonBlock" SET position = position - 1 WHERE "lessonId" = ${block.lessonId} AND position > ${block.position}`;

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function reorderBlocks(
    lessonId: string,
    blockIds: string[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const lesson = await prisma.lesson.findFirst({
            where: {
                id: lessonId,
                module: { courseVersion: { course: { tenantId, isSystemTemplate: false }, state: 'DRAFT' } },
            },
            select: { id: true },
        });
        if (!lesson) return { error: 'Leksjon ikke funnet, versjonen er ikke et utkast, eller er et systemkurs' };

        // Verify all block IDs belong to this lesson
        const existing = await prisma.lessonBlock.findMany({
            where: { lessonId },
            select: { id: true },
        });
        const existingIds = new Set(existing.map(b => b.id));
        if (blockIds.length !== existingIds.size || !blockIds.every(id => existingIds.has(id))) {
            return { error: 'Blokk-IDene samsvarer ikke med leksjonens blokker' };
        }

        // Update positions in a transaction
        await prisma.$transaction(
            blockIds.map((id, idx) =>
                prisma.lessonBlock.update({
                    where: { id },
                    data: { position: idx },
                })
            )
        );

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Course Assignment Rules ─────────────────────────────────

export async function getAssignmentRules(
    courseId: string
): Promise<{ success: true; rules: Array<{
    id: string;
    scopeType: string;
    scopeRefId: string | null;
    assignedByUserId: string | null;
    dueAt: Date | null;
    isMandatory: boolean;
    recertIntervalDays: number | null;
    state: string;
    createdAt: Date;
    _count: { enrollments: number };
}> } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };

        const rules = await prisma.courseAssignmentRule.findMany({
            where: { courseId, tenantId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                scopeType: true,
                scopeRefId: true,
                assignedByUserId: true,
                dueAt: true,
                isMandatory: true,
                recertIntervalDays: true,
                state: true,
                createdAt: true,
                _count: { select: { enrollments: true } },
            },
        });

        return { success: true, rules };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function createAssignmentRule(
    courseId: string,
    data: {
        scopeType: 'USER' | 'GROUP' | 'ROLE' | 'ALL_USERS';
        scopeRefId?: string | null;
        dueAt?: string | null;
        isMandatory?: boolean;
        recertIntervalDays?: number | null;
    }
): Promise<{ success: true; ruleId: string } | { error: string }> {
    try {
        const { userId, tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };

        // For USER scope, scopeRefId is required
        if (data.scopeType === 'USER' && !data.scopeRefId) {
            return { error: 'Bruker-ID er påkrevd for USER-tildeling' };
        }
        if (data.scopeType === 'GROUP' && !data.scopeRefId) {
            return { error: 'Gruppe-ID er påkrevd for GROUP-tildeling' };
        }

        // Validate scopeRefId belongs to this tenant
        if (data.scopeRefId) {
            if (data.scopeType === 'USER') {
                const user = await prisma.user.findFirst({
                    where: { id: data.scopeRefId, tenantId },
                    select: { id: true },
                });
                if (!user) return { error: 'Brukeren tilhører ikke denne organisasjonen' };
            } else if (data.scopeType === 'GROUP') {
                const group = await prisma.group.findFirst({
                    where: { id: data.scopeRefId, tenantId },
                    select: { id: true },
                });
                if (!group) return { error: 'Gruppen tilhører ikke denne organisasjonen' };
            }
        }

        const rule = await prisma.courseAssignmentRule.create({
            data: {
                tenantId,
                courseId,
                scopeType: data.scopeType,
                scopeRefId: data.scopeRefId || null,
                assignedByUserId: userId,
                dueAt: data.dueAt ? new Date(data.dueAt) : null,
                isMandatory: data.isMandatory ?? false,
                recertIntervalDays: data.recertIntervalDays || null,
            },
        });

        return { success: true, ruleId: rule.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function updateAssignmentRule(
    ruleId: string,
    data: {
        dueAt?: string | null;
        isMandatory?: boolean;
        recertIntervalDays?: number | null;
        state?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const rule = await prisma.courseAssignmentRule.findFirst({
            where: { id: ruleId, tenantId },
            select: { id: true },
        });
        if (!rule) return { error: 'Tildelingsregel ikke funnet' };

        const updateData: Record<string, unknown> = {};
        if (data.dueAt !== undefined) updateData.dueAt = data.dueAt ? new Date(data.dueAt) : null;
        if (data.isMandatory !== undefined) updateData.isMandatory = data.isMandatory;
        if (data.recertIntervalDays !== undefined) updateData.recertIntervalDays = data.recertIntervalDays;
        if (data.state !== undefined) updateData.state = data.state;

        await prisma.courseAssignmentRule.update({
            where: { id: ruleId },
            data: updateData,
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteAssignmentRule(
    ruleId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const rule = await prisma.courseAssignmentRule.findFirst({
            where: { id: ruleId, tenantId },
            select: { id: true },
        });
        if (!rule) return { error: 'Tildelingsregel ikke funnet' };

        await prisma.courseAssignmentRule.delete({ where: { id: ruleId } });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function enrollUsersFromRule(
    ruleId: string
): Promise<{ success: true; enrolled: number } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const rule = await prisma.courseAssignmentRule.findFirst({
            where: { id: ruleId, tenantId, state: 'ACTIVE' },
            include: { course: { select: { id: true, currentPublishedVersionId: true } } },
        });
        if (!rule) return { error: 'Tildelingsregel ikke funnet eller er ikke aktiv' };

        // Find users based on scope
        let userIds: string[] = [];

        if (rule.scopeType === 'ALL_USERS') {
            const users = await prisma.user.findMany({
                where: { tenantId },
                select: { id: true },
            });
            userIds = users.map(u => u.id);
        } else if (rule.scopeType === 'USER' && rule.scopeRefId) {
            userIds = [rule.scopeRefId];
        } else if (rule.scopeType === 'GROUP' && rule.scopeRefId) {
            const members = await prisma.groupMembership.findMany({
                where: { groupId: rule.scopeRefId },
                select: { userId: true },
            });
            userIds = members.map(m => m.userId);
        } else if (rule.scopeType === 'ROLE' && rule.scopeRefId) {
            const users = await prisma.user.findMany({
                where: { tenantId, globalRole: rule.scopeRefId as 'USER' | 'TENANT_ADMIN' | 'SYSTEM_ADMIN' },
                select: { id: true },
            });
            userIds = users.map(u => u.id);
        }

        // Filter out already enrolled users
        const existingEnrollments = await prisma.courseEnrollment.findMany({
            where: { courseId: rule.courseId, userId: { in: userIds } },
            select: { userId: true },
        });
        const enrolledSet = new Set(existingEnrollments.map(e => e.userId));
        const newUserIds = userIds.filter(id => !enrolledSet.has(id));

        if (newUserIds.length === 0) {
            return { success: true, enrolled: 0 };
        }

        // Create enrollments
        await prisma.courseEnrollment.createMany({
            data: newUserIds.map(userId => ({
                tenantId,
                courseId: rule.courseId,
                userId,
                currentCourseVersionId: rule.course.currentPublishedVersionId,
                sourceRuleId: rule.id,
                dueAt: rule.dueAt,
            })),
        });

        return { success: true, enrolled: newUserIds.length };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}
