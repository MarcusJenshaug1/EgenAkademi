import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import CourseDetailClient from './CourseDetailClient';

interface CourseDetailPageProps {
    params: Promise<{ courseId: string }>;
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
    const { courseId } = await params;
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    const [course, categories, tags] = await Promise.all([
        prisma.course.findFirst({
            where: { id: courseId, tenantId },
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
                defaultLocale: true,
                currentPublishedVersionId: true,
                isSystemTemplate: true,
                createdAt: true,
                updatedAt: true,
                categories: {
                    select: { category: { select: { id: true, name: true, slug: true } } },
                },
                tags: {
                    select: { tag: { select: { id: true, label: true, slug: true } } },
                },
                versions: {
                    select: {
                        id: true,
                        versionNumber: true,
                        state: true,
                        changeLog: true,
                        createdAt: true,
                        publishedAt: true,
                        _count: { select: { modules: true } },
                        modules: {
                            select: {
                                id: true,
                                position: true,
                                title: true,
                                summary: true,
                                gatingPolicy: true,
                                lessons: {
                                    select: {
                                        id: true,
                                        position: true,
                                        title: true,
                                        lessonType: true,
                                        completionRule: true,
                                        estimatedMinutes: true,
                                        isOptional: true,
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
                _count: { select: { enrollments: true } },
            },
        }),
        prisma.courseCategory.findMany({
            where: { tenantId },
            select: { id: true, name: true, slug: true },
            orderBy: { name: 'asc' },
        }),
        prisma.tag.findMany({
            where: { tenantId },
            select: { id: true, label: true, slug: true },
            orderBy: { label: 'asc' },
        }),
    ]);

    if (!course) {
        notFound();
    }

    const courseData = {
        id: course.id,
        slug: course.slug,
        title: course.title,
        description: course.description,
        visibility: course.visibility,
        status: course.status,
        difficulty: course.difficulty,
        thumbnailUrl: course.thumbnailUrl,
        estimatedMinutes: course.estimatedMinutes,
        defaultLocale: course.defaultLocale,
        currentPublishedVersionId: course.currentPublishedVersionId,
        isSystemTemplate: course.isSystemTemplate,
        categories: course.categories.map((cl) => cl.category),
        tags: course.tags.map((tl) => tl.tag),
        versions: course.versions.map((v) => ({
            id: v.id,
            versionNumber: v.versionNumber,
            state: v.state,
            changeLog: v.changeLog,
            createdAt: v.createdAt,
            publishedAt: v.publishedAt,
            moduleCount: v._count.modules,
            modules: v.modules.map((m) => ({
                id: m.id,
                position: m.position,
                title: m.title,
                summary: m.summary,
                gatingPolicy: m.gatingPolicy,
                lessons: m.lessons.map((l) => ({
                    id: l.id,
                    position: l.position,
                    title: l.title,
                    lessonType: l.lessonType,
                    completionRule: l.completionRule,
                    estimatedMinutes: l.estimatedMinutes,
                    isOptional: l.isOptional,
                    blockCount: l._count.blocks,
                })),
            })),
        })),
        enrollmentCount: course._count.enrollments,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
    };

    return (
        <CourseDetailClient
            course={courseData}
            allCategories={categories}
            allTags={tags}
        />
    );
}
