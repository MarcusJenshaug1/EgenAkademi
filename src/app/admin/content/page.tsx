import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import ContentClient from './ContentClient';
import type {
    MediaAssetItem,
    MediaStats,
    ContentOverview,
    ContentCourseNode,
} from '@/app/actions/contentActions';
import type { MediaKind } from '@prisma/client';

export default async function ContentPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    const [assetsRaw, grouped, sizeAgg, coursesRaw] = await Promise.all([
        prisma.mediaAsset.findMany({
            where: { tenantId },
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
        }),
        prisma.mediaAsset.groupBy({
            by: ['kind'],
            where: { tenantId },
            _count: { _all: true },
        }),
        prisma.mediaAsset.aggregate({
            where: { tenantId },
            _sum: { sizeBytes: true },
        }),
        prisma.course.findMany({
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
        }),
    ]);

    // ── Resolve uploader display names (tenant-scoped) ──
    const uploaderIds = Array.from(
        new Set(assetsRaw.map((a) => a.uploadedByUserId).filter((id): id is string => Boolean(id)))
    );
    const uploaders = uploaderIds.length
        ? await prisma.user.findMany({
              where: { id: { in: uploaderIds }, tenantId },
              select: { id: true, name: true, firstName: true, lastName: true, email: true },
          })
        : [];
    const uploaderMap = new Map(
        uploaders.map((u) => {
            const display = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email || null;
            return [u.id, display];
        })
    );

    const assets: MediaAssetItem[] = assetsRaw.map((a) => ({
        id: a.id,
        filename: a.filename,
        url: a.url,
        kind: a.kind,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        createdAt: a.createdAt,
        uploaderName: a.uploadedByUserId ? uploaderMap.get(a.uploadedByUserId) ?? null : null,
    }));

    // ── Media stats ──
    const byKind: Record<MediaKind, number> = {
        IMAGE: 0,
        VIDEO: 0,
        AUDIO: 0,
        DOCUMENT: 0,
        OTHER: 0,
    };
    let totalAssets = 0;
    for (const row of grouped) {
        byKind[row.kind] = row._count._all;
        totalAssets += row._count._all;
    }
    const mediaStats: MediaStats = {
        total: totalAssets,
        totalSizeBytes: sizeAgg._sum.sizeBytes ?? 0,
        byKind,
    };

    // ── Content overview tree ──
    function pickVersion<V extends { id: string; versionNumber: number }>(
        versions: V[],
        currentPublishedVersionId: string | null
    ): V | null {
        if (currentPublishedVersionId) {
            const published = versions.find((v) => v.id === currentPublishedVersionId);
            if (published) return published;
        }
        if (versions.length === 0) return null;
        return [...versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];
    }

    const courseNodes: ContentCourseNode[] = coursesRaw.map((c) => {
        const version = pickVersion(c.versions, c.currentPublishedVersionId);
        const modules = version?.modules ?? [];

        const moduleNodes = modules.map((m) => {
            const lessons = m.lessons.map((l) => ({
                id: l.id,
                title: l.title,
                position: l.position,
                lessonType: l.lessonType,
                blockCount: l._count.blocks,
            }));
            const moduleBlockCount = lessons.reduce((sum, l) => sum + l.blockCount, 0);
            return {
                id: m.id,
                title: m.title,
                position: m.position,
                lessonCount: lessons.length,
                blockCount: moduleBlockCount,
                lessons,
            };
        });

        const courseLessonCount = moduleNodes.reduce((sum, m) => sum + m.lessonCount, 0);
        const courseBlockCount = moduleNodes.reduce((sum, m) => sum + m.blockCount, 0);

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

    const overview: ContentOverview = {
        courses: courseNodes,
        totals: {
            courses: courseNodes.length,
            modules: courseNodes.reduce((sum, c) => sum + c.moduleCount, 0),
            lessons: courseNodes.reduce((sum, c) => sum + c.lessonCount, 0),
            blocks: courseNodes.reduce((sum, c) => sum + c.blockCount, 0),
        },
    };

    return (
        <ContentClient
            initialAssets={assets}
            initialMediaStats={mediaStats}
            initialOverview={overview}
        />
    );
}
