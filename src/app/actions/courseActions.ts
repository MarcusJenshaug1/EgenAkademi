'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import type { CourseVisibility, CourseDifficulty, CourseStatus } from '@prisma/client';

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

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'oe')
        .replace(/å/g, 'aa')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ── Types ───────────────────────────────────────────────────

export interface CourseListItem {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    visibility: CourseVisibility;
    status: CourseStatus;
    difficulty: CourseDifficulty | null;
    thumbnailUrl: string | null;
    estimatedMinutes: number | null;
    isSystemTemplate: boolean;
    moduleCount: number;
    lessonCount: number;
    enrollmentCount: number;
    hasPublishedVersion: boolean;
    categories: { id: string; name: string }[];
    tags: { id: string; label: string }[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CourseDetail {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    visibility: CourseVisibility;
    status: CourseStatus;
    difficulty: CourseDifficulty | null;
    thumbnailUrl: string | null;
    estimatedMinutes: number | null;
    defaultLocale: string;
    currentPublishedVersionId: string | null;
    categories: { id: string; name: string; slug: string }[];
    tags: { id: string; label: string; slug: string }[];
    versions: {
        id: string;
        versionNumber: number;
        state: string;
        changeLog: string | null;
        createdAt: Date;
        publishedAt: Date | null;
        moduleCount: number;
    }[];
    enrollmentCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CategoryItem {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    parentCategoryId: string | null;
    sortOrder: number;
    courseCount: number;
}

export interface TagItem {
    id: string;
    slug: string;
    label: string;
    tagType: string;
    courseCount: number;
}

// ── Stats ───────────────────────────────────────────────────

export async function getCourseStats(): Promise<{
    total: number;
    published: number;
    draft: number;
    archived: number;
} | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const [total, published, draft, archived] = await Promise.all([
            prisma.course.count({ where: { tenantId } }),
            prisma.course.count({ where: { tenantId, currentPublishedVersionId: { not: null } } }),
            prisma.course.count({ where: { tenantId, currentPublishedVersionId: null, status: 'ACTIVE' } }),
            prisma.course.count({ where: { tenantId, status: 'ARCHIVED' } }),
        ]);

        return { total, published, draft, archived };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── List courses ────────────────────────────────────────────

export async function listCourses(search?: string): Promise<{ courses: CourseListItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Record<string, unknown> = { tenantId };
        if (search && search.trim()) {
            const term = search.trim();
            where.OR = [
                { title: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
                { slug: { contains: term, mode: 'insensitive' } },
            ];
        }

        const courses = await prisma.course.findMany({
            where,
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
                    where: { state: 'DRAFT' },
                    select: {
                        _count: {
                            select: { modules: true },
                        },
                        modules: {
                            select: {
                                _count: { select: { lessons: true } },
                            },
                        },
                    },
                    take: 1,
                    orderBy: { versionNumber: 'desc' },
                },
            },
            orderBy: { updatedAt: 'desc' },
        });

        return {
            courses: courses.map((c) => {
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
            }),
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Get single course ───────────────────────────────────────

export async function getCourse(courseId: string): Promise<{ course: CourseDetail } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
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
                    },
                    orderBy: { versionNumber: 'desc' },
                },
                _count: { select: { enrollments: true } },
            },
        });

        if (!course) return { error: 'Kurs ikke funnet' };

        return {
            course: {
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
                })),
                enrollmentCount: course._count.enrollments,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt,
            },
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Create course ───────────────────────────────────────────

export async function createCourse(data: {
    title: string;
    description?: string;
    visibility?: CourseVisibility;
    difficulty?: CourseDifficulty;
    estimatedMinutes?: number;
    categoryIds?: string[];
    tagIds?: string[];
}): Promise<{ success: true; courseId: string } | { error: string }> {
    try {
        const { tenantId, userId } = await requireTenantAdmin();

        if (!data.title || !data.title.trim()) {
            return { error: 'Kurstittel er påkrevd' };
        }

        const title = data.title.trim();
        let slug = slugify(title);

        // Ensure unique slug within tenant
        const existing = await prisma.course.findFirst({
            where: { tenantId, slug },
            select: { id: true },
        });
        if (existing) {
            slug = `${slug}-${Date.now().toString(36)}`;
        }

        const course = await prisma.course.create({
            data: {
                tenantId,
                slug,
                title,
                description: data.description?.trim() || null,
                visibility: data.visibility || 'DRAFT_ONLY',
                difficulty: data.difficulty || null,
                estimatedMinutes: data.estimatedMinutes || null,
                categories: data.categoryIds && data.categoryIds.length > 0
                    ? { create: data.categoryIds.map((id) => ({ categoryId: id })) }
                    : undefined,
                tags: data.tagIds && data.tagIds.length > 0
                    ? { create: data.tagIds.map((id) => ({ tagId: id })) }
                    : undefined,
                // Auto-create initial draft version
                versions: {
                    create: {
                        versionNumber: 1,
                        state: 'DRAFT',
                        createdByUserId: userId,
                    },
                },
            },
        });

        return { success: true, courseId: course.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Update course metadata ──────────────────────────────────

export async function updateCourse(
    courseId: string,
    data: {
        title?: string;
        description?: string;
        visibility?: CourseVisibility;
        difficulty?: CourseDifficulty | null;
        estimatedMinutes?: number | null;
        status?: CourseStatus;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true, slug: true, isSystemTemplate: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };
        if (course.isSystemTemplate) return { error: 'Systemkurs kan ikke redigeres' };

        // If title changed, update slug too
        let slug = course.slug;
        if (data.title && data.title.trim()) {
            const newSlug = slugify(data.title.trim());
            if (newSlug !== slug) {
                const existing = await prisma.course.findFirst({
                    where: { tenantId, slug: newSlug, id: { not: courseId } },
                    select: { id: true },
                });
                slug = existing ? `${newSlug}-${Date.now().toString(36)}` : newSlug;
            }
        }

        await prisma.course.update({
            where: { id: courseId },
            data: {
                title: data.title?.trim(),
                slug,
                description: data.description?.trim(),
                visibility: data.visibility,
                difficulty: data.difficulty,
                estimatedMinutes: data.estimatedMinutes,
                status: data.status,
            },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete course ───────────────────────────────────────────

export async function deleteCourse(courseId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true, isSystemTemplate: true, _count: { select: { enrollments: true } } },
        });
        if (!course) return { error: 'Kurs ikke funnet' };
        if (course.isSystemTemplate) return { error: 'Systemkurs kan ikke slettes' };

        if (course._count.enrollments > 0) {
            return { error: 'Kurset har aktive innmeldinger og kan ikke slettes. Arkiver det i stedet.' };
        }

        // Cascade deletes versions, modules, lessons, blocks, links
        await prisma.course.delete({ where: { id: courseId } });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Archive / restore course ────────────────────────────────

export async function archiveCourse(courseId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true, isSystemTemplate: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };
        if (course.isSystemTemplate) return { error: 'Systemkurs kan ikke arkiveres' };

        await prisma.course.update({
            where: { id: courseId },
            data: { status: 'ARCHIVED' },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function restoreCourse(courseId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };

        await prisma.course.update({
            where: { id: courseId },
            data: { status: 'ACTIVE' },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Categories CRUD ─────────────────────────────────────────

export async function listCategories(): Promise<{ categories: CategoryItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const categories = await prisma.courseCategory.findMany({
            where: { tenantId },
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                parentCategoryId: true,
                sortOrder: true,
                _count: { select: { courses: true } },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        return {
            categories: categories.map((c) => ({
                id: c.id,
                slug: c.slug,
                name: c.name,
                description: c.description,
                parentCategoryId: c.parentCategoryId,
                sortOrder: c.sortOrder,
                courseCount: c._count.courses,
            })),
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function createCategory(data: {
    name: string;
    description?: string;
    parentCategoryId?: string;
}): Promise<{ success: true; categoryId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        if (!data.name || !data.name.trim()) {
            return { error: 'Kategorinavn er påkrevd' };
        }

        const name = data.name.trim();
        let slug = slugify(name);

        const existing = await prisma.courseCategory.findFirst({
            where: { tenantId, slug },
            select: { id: true },
        });
        if (existing) {
            slug = `${slug}-${Date.now().toString(36)}`;
        }

        const category = await prisma.courseCategory.create({
            data: {
                tenantId,
                slug,
                name,
                description: data.description?.trim() || null,
                parentCategoryId: data.parentCategoryId || null,
            },
        });

        return { success: true, categoryId: category.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteCategory(categoryId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const category = await prisma.courseCategory.findFirst({
            where: { id: categoryId, tenantId },
            select: { id: true, _count: { select: { courses: true, childCategories: true } } },
        });
        if (!category) return { error: 'Kategori ikke funnet' };

        if (category._count.courses > 0) {
            return { error: 'Kategorien har kurs og kan ikke slettes' };
        }
        if (category._count.childCategories > 0) {
            return { error: 'Kategorien har underkategorier og kan ikke slettes' };
        }

        await prisma.courseCategory.delete({ where: { id: categoryId } });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Tags CRUD ───────────────────────────────────────────────

export async function listTags(): Promise<{ tags: TagItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const tags = await prisma.tag.findMany({
            where: { tenantId },
            select: {
                id: true,
                slug: true,
                label: true,
                tagType: true,
                _count: { select: { courses: true } },
            },
            orderBy: { label: 'asc' },
        });

        return {
            tags: tags.map((t) => ({
                id: t.id,
                slug: t.slug,
                label: t.label,
                tagType: t.tagType,
                courseCount: t._count.courses,
            })),
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function createTag(data: {
    label: string;
    tagType?: 'TOPIC' | 'AUDIENCE' | 'SKILL' | 'COMPLIANCE' | 'CUSTOM';
}): Promise<{ success: true; tagId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        if (!data.label || !data.label.trim()) {
            return { error: 'Tagnavn er påkrevd' };
        }

        const label = data.label.trim();
        let slug = slugify(label);

        const existing = await prisma.tag.findFirst({
            where: { tenantId, slug },
            select: { id: true },
        });
        if (existing) {
            slug = `${slug}-${Date.now().toString(36)}`;
        }

        const tag = await prisma.tag.create({
            data: {
                tenantId,
                slug,
                label,
                tagType: data.tagType || 'CUSTOM',
            },
        });

        return { success: true, tagId: tag.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteTag(tagId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const tag = await prisma.tag.findFirst({
            where: { id: tagId, tenantId },
            select: { id: true },
        });
        if (!tag) return { error: 'Tag ikke funnet' };

        // Delete tag links first, then tag
        await prisma.courseTagLink.deleteMany({ where: { tagId } });
        await prisma.tag.delete({ where: { id: tagId } });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Update course categories ────────────────────────────────

export async function updateCourseCategories(
    courseId: string,
    categoryIds: string[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true, isSystemTemplate: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };
        if (course.isSystemTemplate) return { error: 'Systemkurs kan ikke redigeres' };

        // Replace all category links
        await prisma.courseCategoryLink.deleteMany({ where: { courseId } });
        if (categoryIds.length > 0) {
            await prisma.courseCategoryLink.createMany({
                data: categoryIds.map((categoryId) => ({ courseId, categoryId })),
            });
        }

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Update course tags ──────────────────────────────────────

export async function updateCourseTags(
    courseId: string,
    tagIds: string[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true, isSystemTemplate: true },
        });
        if (!course) return { error: 'Kurs ikke funnet' };
        if (course.isSystemTemplate) return { error: 'Systemkurs kan ikke redigeres' };

        // Replace all tag links
        await prisma.courseTagLink.deleteMany({ where: { courseId } });
        if (tagIds.length > 0) {
            await prisma.courseTagLink.createMany({
                data: tagIds.map((tagId) => ({ courseId, tagId })),
            });
        }

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}
