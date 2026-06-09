'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import type { MediaKind } from '@prisma/client';

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

// ── Types ───────────────────────────────────────────────────

export interface MediaAssetItem {
    id: string;
    filename: string;
    url: string;
    kind: MediaKind;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: Date;
    uploaderName: string | null;
}

export interface MediaStats {
    total: number;
    totalSizeBytes: number;
    byKind: Record<MediaKind, number>;
}

export interface ContentCourseNode {
    courseId: string;
    title: string;
    status: string;
    hasPublishedVersion: boolean;
    moduleCount: number;
    lessonCount: number;
    blockCount: number;
    modules: {
        id: string;
        title: string;
        position: number;
        lessonCount: number;
        blockCount: number;
        lessons: {
            id: string;
            title: string;
            position: number;
            lessonType: string;
            blockCount: number;
        }[];
    }[];
}

export interface ContentOverview {
    courses: ContentCourseNode[];
    totals: {
        courses: number;
        modules: number;
        lessons: number;
        blocks: number;
    };
}

export interface LessonSearchResult {
    courseId: string;
    courseTitle: string;
    moduleId: string;
    moduleTitle: string;
    lessonId: string;
    lessonTitle: string;
    lessonType: string;
    blockCount: number;
    href: string;
}

// ── List media assets ───────────────────────────────────────

export async function listMediaAssets(filter?: {
    kind?: MediaKind;
    search?: string;
}): Promise<{ assets: MediaAssetItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Record<string, unknown> = { tenantId };
        if (filter?.kind) {
            where.kind = filter.kind;
        }
        if (filter?.search && filter.search.trim()) {
            where.filename = { contains: filter.search.trim(), mode: 'insensitive' };
        }

        const assets = await prisma.mediaAsset.findMany({
            where,
            select: {
                id: true,
                filename: true,
                url: true,
                kind: true,
                mimeType: true,
                sizeBytes: true,
                createdAt: true,
                uploadedByUserId: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });

        // Resolve uploader names (tenant-scoped)
        const uploaderIds = Array.from(
            new Set(assets.map((a) => a.uploadedByUserId).filter((id): id is string => Boolean(id)))
        );
        const uploaders = uploaderIds.length
            ? await prisma.user.findMany({
                  where: { id: { in: uploaderIds }, tenantId },
                  select: { id: true, name: true, firstName: true, lastName: true, email: true },
              })
            : [];
        const uploaderMap = new Map(
            uploaders.map((u) => {
                const display =
                    [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email || null;
                return [u.id, display];
            })
        );

        return {
            assets: assets.map((a) => ({
                id: a.id,
                filename: a.filename,
                url: a.url,
                kind: a.kind,
                mimeType: a.mimeType,
                sizeBytes: a.sizeBytes,
                createdAt: a.createdAt,
                uploaderName: a.uploadedByUserId ? uploaderMap.get(a.uploadedByUserId) ?? null : null,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete media asset ──────────────────────────────────────

export async function deleteMediaAsset(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Verify asset belongs to tenant before mutating
        const asset = await prisma.mediaAsset.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!asset) return { error: 'Mediefil ikke funnet' };

        await prisma.mediaAsset.delete({ where: { id } });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Media stats ─────────────────────────────────────────────

export async function getMediaStats(): Promise<MediaStats | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const [grouped, sizeAgg] = await Promise.all([
            prisma.mediaAsset.groupBy({
                by: ['kind'],
                where: { tenantId },
                _count: { _all: true },
            }),
            prisma.mediaAsset.aggregate({
                where: { tenantId },
                _sum: { sizeBytes: true },
            }),
        ]);

        const byKind: Record<MediaKind, number> = {
            IMAGE: 0,
            VIDEO: 0,
            AUDIO: 0,
            DOCUMENT: 0,
            OTHER: 0,
        };
        let total = 0;
        for (const row of grouped) {
            byKind[row.kind] = row._count._all;
            total += row._count._all;
        }

        return {
            total,
            totalSizeBytes: sizeAgg._sum.sizeBytes ?? 0,
            byKind,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Helper: select the version to inspect for a course ──────
// Prefer the current published version; otherwise the highest version number (latest draft).

function pickVersion<
    V extends { id: string; state: string; versionNumber: number }
>(versions: V[], currentPublishedVersionId: string | null): V | null {
    if (currentPublishedVersionId) {
        const published = versions.find((v) => v.id === currentPublishedVersionId);
        if (published) return published;
    }
    if (versions.length === 0) return null;
    return [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

// ── Content overview (cross-course tree + stats) ────────────

export async function getContentOverview(): Promise<ContentOverview | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const courses = await prisma.course.findMany({
            where: { tenantId, status: 'ACTIVE' },
            select: {
                id: true,
                title: true,
                status: true,
                currentPublishedVersionId: true,
                versions: {
                    select: {
                        id: true,
                        state: true,
                        versionNumber: true,
                        modules: {
                            select: {
                                id: true,
                                title: true,
                                position: true,
                                lessons: {
                                    select: {
                                        id: true,
                                        title: true,
                                        position: true,
                                        lessonType: true,
                                        _count: { select: { blocks: true } },
                                    },
                                    orderBy: { position: 'asc' as const },
                                },
                            },
                            orderBy: { position: 'asc' as const },
                        },
                    },
                    orderBy: { versionNumber: 'desc' as const },
                },
            },
            orderBy: { title: 'asc' },
        });

        let totalModules = 0;
        let totalLessons = 0;
        let totalBlocks = 0;

        const courseNodes: ContentCourseNode[] = courses.map((c) => {
            const version = pickVersion(c.versions, c.currentPublishedVersionId);
            const modules = version?.modules ?? [];

            let courseLessonCount = 0;
            let courseBlockCount = 0;

            const moduleNodes = modules.map((m) => {
                let moduleBlockCount = 0;
                const lessons = m.lessons.map((l) => {
                    moduleBlockCount += l._count.blocks;
                    return {
                        id: l.id,
                        title: l.title,
                        position: l.position,
                        lessonType: l.lessonType,
                        blockCount: l._count.blocks,
                    };
                });
                courseLessonCount += lessons.length;
                courseBlockCount += moduleBlockCount;
                return {
                    id: m.id,
                    title: m.title,
                    position: m.position,
                    lessonCount: lessons.length,
                    blockCount: moduleBlockCount,
                    lessons,
                };
            });

            totalModules += moduleNodes.length;
            totalLessons += courseLessonCount;
            totalBlocks += courseBlockCount;

            return {
                courseId: c.id,
                title: c.title,
                status: c.status,
                hasPublishedVersion: c.currentPublishedVersionId !== null,
                moduleCount: moduleNodes.length,
                lessonCount: courseLessonCount,
                blockCount: courseBlockCount,
                modules: moduleNodes,
            };
        });

        return {
            courses: courseNodes,
            totals: {
                courses: courseNodes.length,
                modules: totalModules,
                lessons: totalLessons,
                blocks: totalBlocks,
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Search lessons across tenant courses ────────────────────

export async function searchLessons(
    term: string
): Promise<{ results: LessonSearchResult[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const trimmed = term.trim();
        if (trimmed.length < 2) {
            return { results: [] };
        }

        // Scope strictly through the course → version → module → lesson chain,
        // and match lesson titles. Tenant-scoped via the course filter.
        const lessons = await prisma.lesson.findMany({
            where: {
                title: { contains: trimmed, mode: 'insensitive' },
                module: {
                    courseVersion: {
                        course: { tenantId },
                    },
                },
            },
            select: {
                id: true,
                title: true,
                lessonType: true,
                _count: { select: { blocks: true } },
                module: {
                    select: {
                        id: true,
                        title: true,
                        courseVersion: {
                            select: {
                                course: { select: { id: true, title: true } },
                            },
                        },
                    },
                },
            },
            orderBy: { title: 'asc' },
            take: 50,
        });

        const results: LessonSearchResult[] = lessons.map((l) => ({
            courseId: l.module.courseVersion.course.id,
            courseTitle: l.module.courseVersion.course.title,
            moduleId: l.module.id,
            moduleTitle: l.module.title,
            lessonId: l.id,
            lessonTitle: l.title,
            lessonType: l.lessonType,
            blockCount: l._count.blocks,
            href: `/admin/courses/${l.module.courseVersion.course.id}`,
        }));

        return { results };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
