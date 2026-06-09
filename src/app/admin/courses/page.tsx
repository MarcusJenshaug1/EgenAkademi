import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import CoursesClient from './CoursesClient';

export default async function CoursesPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    // Fetch initial data server-side
    const [coursesRaw, total, categoriesRaw, tagsRaw] = await Promise.all([
        prisma.course.findMany({
            where: { tenantId },
            select: {
                id: true,
                slug: true,
                title: true,
                description: true,
                visibility: true,
                status: true,
                difficulty: true,
                thumbnailUrl: true,
                estimatedMinutes: true,
                currentPublishedVersionId: true,
                isSystemTemplate: true,
                createdAt: true,
                updatedAt: true,
                categories: {
                    select: { category: { select: { id: true, name: true } } },
                },
                tags: {
                    select: { tag: { select: { id: true, label: true } } },
                },
                _count: {
                    select: { enrollments: true },
                },
                versions: {
                    select: {
                        _count: { select: { modules: true } },
                        modules: {
                            select: {
                                _count: { select: { lessons: true } },
                            },
                        },
                    },
                    take: 1,
                    orderBy: { versionNumber: 'desc' as const },
                },
            },
            orderBy: { updatedAt: 'desc' },
        }),
        prisma.course.count({ where: { tenantId } }),
        prisma.courseCategory.findMany({
            where: { tenantId },
            select: { id: true, slug: true, name: true, description: true, parentCategoryId: true, sortOrder: true, _count: { select: { courses: true } } },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        prisma.tag.findMany({
            where: { tenantId },
            select: { id: true, slug: true, label: true, tagType: true, _count: { select: { courses: true } } },
            orderBy: { label: 'asc' },
        }),
    ]);

    const publishedCount = coursesRaw.filter((c) => c.currentPublishedVersionId !== null).length;
    const draftCount = coursesRaw.filter((c) => c.currentPublishedVersionId === null && c.status === 'ACTIVE').length;
    const archivedCount = coursesRaw.filter((c) => c.status === 'ARCHIVED').length;

    const courses = coursesRaw.map((c) => {
        const latestVersion = c.versions[0];
        const moduleCount = latestVersion?._count.modules ?? 0;
        const lessonCount = latestVersion?.modules.reduce((sum, m) => sum + m._count.lessons, 0) ?? 0;

        return {
            id: c.id,
            slug: c.slug,
            title: c.title,
            description: c.description,
            visibility: c.visibility,
            status: c.status,
            difficulty: c.difficulty,
            thumbnailUrl: c.thumbnailUrl,
            estimatedMinutes: c.estimatedMinutes,
            isSystemTemplate: c.isSystemTemplate,
            moduleCount,
            lessonCount,
            enrollmentCount: c._count.enrollments,
            hasPublishedVersion: c.currentPublishedVersionId !== null,
            categories: c.categories.map((cl) => cl.category),
            tags: c.tags.map((tl) => tl.tag),
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        };
    });

    const categories = categoriesRaw.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        parentCategoryId: c.parentCategoryId,
        sortOrder: c.sortOrder,
        courseCount: c._count.courses,
    }));

    const tags = tagsRaw.map((t) => ({
        id: t.id,
        slug: t.slug,
        label: t.label,
        tagType: t.tagType,
        courseCount: t._count.courses,
    }));

    return (
        <CoursesClient
            initialCourses={courses}
            stats={{ total, published: publishedCount, draft: draftCount, archived: archivedCount }}
            categories={categories}
            tags={tags}
        />
    );
}
