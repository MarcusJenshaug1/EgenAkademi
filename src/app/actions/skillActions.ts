'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Authenticate + require tenant-admin. Returns the caller's userId + tenantId.
 * Throws on missing auth / insufficient role. Callers wrap in try/catch and
 * return a generic { error } so no internal details leak.
 */
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
 * Authenticate a learner (any role) and return userId + tenantId.
 * Used by the learner-facing self-service variants.
 */
async function requireLearner() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    return { userId: session.user.id, tenantId: session.user.tenantId };
}

/**
 * Resolve the tenant's plan-gating context and check the
 * 'competency-management' (ENTERPRISE) feature. Returns the access result so
 * callers can short-circuit mutations / locked learner views.
 */
async function checkCompetencyAccess(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) return { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };
    return checkAccess(
        { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
        'competency-management'
    );
}

function clampLevel(level: number, maxLevel: number): number {
    if (!Number.isFinite(level)) return 1;
    const rounded = Math.round(level);
    if (rounded < 1) return 1;
    if (rounded > maxLevel) return maxLevel;
    return rounded;
}

// ── Types ───────────────────────────────────────────────────

export interface SkillNode {
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    parentSkillId: string | null;
    maxLevel: number;
    sortOrder: number;
    courseCount: number;
    userCount: number;
    children: SkillNode[];
}

export interface MappableCourse {
    id: string;
    title: string;
    slug: string;
}

export interface CourseSkillItem {
    skillId: string;
    skillName: string;
    level: number;
    maxLevel: number;
}

export interface AcquiredSkill {
    skillId: string;
    name: string;
    category: string | null;
    level: number;
    maxLevel: number;
    sources: string[]; // union of "manual" | "course" | "assessment"
}

export interface SkillProfile {
    skills: AcquiredSkill[];
    locked?: boolean;
    reason?: string;
}

export interface SkillGapItem {
    skillId: string;
    name: string;
    category: string | null;
    requiredLevel: number;
    currentLevel: number; // 0 = not acquired at all
    maxLevel: number;
}

export interface RecommendedCourse {
    courseId: string;
    title: string;
    slug: string;
    coversSkills: { skillId: string; name: string; level: number }[];
}

export interface SkillGapResult {
    gaps: SkillGapItem[];
    recommendedCourses: RecommendedCourse[];
    locked?: boolean;
    reason?: string;
}

export interface TeamMatrixUser {
    id: string;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    department: string | null;
    // skillId -> level (only present if acquired)
    levels: Record<string, number>;
}

export interface TeamMatrixSkill {
    id: string;
    name: string;
    category: string | null;
    maxLevel: number;
}

export interface TeamMatrixGroup {
    id: string;
    name: string;
    color: string | null;
}

export interface TeamMatrix {
    skills: TeamMatrixSkill[];
    users: TeamMatrixUser[];
    groups: TeamMatrixGroup[];
    selectedGroupId: string | null;
    capped: boolean;
    userCount: number;
}

// ══════════════════════════════════════════════════════════════
// TAKSONOMI (Skill tree CRUD)
// ══════════════════════════════════════════════════════════════

/**
 * Full skill tree for the tenant: top-level skills nested with their children,
 * each annotated with how many courses map to it and how many users hold it.
 */
export async function listSkills(): Promise<{ skills: SkillNode[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const skills = await prisma.skill.findMany({
            where: { tenantId },
            select: {
                id: true,
                name: true,
                description: true,
                category: true,
                parentSkillId: true,
                maxLevel: true,
                sortOrder: true,
                _count: { select: { courses: true, userSkills: true } },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        // Build nodes keyed by id, then assemble the tree.
        const nodeMap = new Map<string, SkillNode>();
        for (const s of skills) {
            nodeMap.set(s.id, {
                id: s.id,
                name: s.name,
                description: s.description,
                category: s.category,
                parentSkillId: s.parentSkillId,
                maxLevel: s.maxLevel,
                sortOrder: s.sortOrder,
                courseCount: s._count.courses,
                userCount: s._count.userSkills,
                children: [],
            });
        }

        const roots: SkillNode[] = [];
        for (const node of nodeMap.values()) {
            if (node.parentSkillId && nodeMap.has(node.parentSkillId)) {
                nodeMap.get(node.parentSkillId)!.children.push(node);
            } else {
                // Treat orphaned children (parent in another tenant / missing) as roots.
                roots.push(node);
            }
        }

        return { skills: roots };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function createSkill(data: {
    name: string;
    description?: string;
    category?: string;
    parentSkillId?: string | null;
    maxLevel?: number;
}): Promise<{ success: true; skillId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) return { error: access.reason || 'Ingen tilgang' };

        if (!data.name || data.name.trim().length < 2) {
            return { error: 'Ferdighetsnavn må være minst 2 tegn' };
        }

        const maxLevel = data.maxLevel && data.maxLevel >= 1 && data.maxLevel <= 10 ? Math.round(data.maxLevel) : 5;

        // Verify parent belongs to this tenant if provided.
        if (data.parentSkillId) {
            const parent = await prisma.skill.findFirst({
                where: { id: data.parentSkillId, tenantId },
                select: { id: true },
            });
            if (!parent) return { error: 'Overordnet ferdighet ble ikke funnet' };
        }

        const skill = await prisma.skill.create({
            data: {
                tenantId,
                name: data.name.trim(),
                description: data.description?.trim() || null,
                category: data.category?.trim() || null,
                parentSkillId: data.parentSkillId || null,
                maxLevel,
            },
            select: { id: true },
        });

        return { success: true, skillId: skill.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function updateSkill(
    skillId: string,
    data: {
        name?: string;
        description?: string;
        category?: string;
        parentSkillId?: string | null;
        maxLevel?: number;
        sortOrder?: number;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) return { error: access.reason || 'Ingen tilgang' };

        const skill = await prisma.skill.findFirst({
            where: { id: skillId, tenantId },
            select: { id: true },
        });
        if (!skill) return { error: 'Ferdighet ble ikke funnet' };

        if (data.name !== undefined && data.name.trim().length < 2) {
            return { error: 'Ferdighetsnavn må være minst 2 tegn' };
        }

        // Validate parent reassignment: must be in tenant, not self, and not a
        // descendant (avoid cycles).
        if (data.parentSkillId !== undefined && data.parentSkillId !== null) {
            if (data.parentSkillId === skillId) {
                return { error: 'En ferdighet kan ikke være sin egen overordnede' };
            }
            const parent = await prisma.skill.findFirst({
                where: { id: data.parentSkillId, tenantId },
                select: { id: true },
            });
            if (!parent) return { error: 'Overordnet ferdighet ble ikke funnet' };

            // Cycle check: walk up from the proposed parent; if we reach skillId, reject.
            const all = await prisma.skill.findMany({
                where: { tenantId },
                select: { id: true, parentSkillId: true },
            });
            const parentOf = new Map(all.map((s) => [s.id, s.parentSkillId]));
            let cursor: string | null | undefined = data.parentSkillId;
            const seen = new Set<string>();
            while (cursor) {
                if (cursor === skillId) {
                    return { error: 'Ugyldig hierarki: dette ville skape en sirkulær kobling' };
                }
                if (seen.has(cursor)) break;
                seen.add(cursor);
                cursor = parentOf.get(cursor) ?? null;
            }
        }

        await prisma.skill.update({
            where: { id: skillId },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.description !== undefined && { description: data.description.trim() || null }),
                ...(data.category !== undefined && { category: data.category.trim() || null }),
                ...(data.parentSkillId !== undefined && { parentSkillId: data.parentSkillId || null }),
                ...(data.maxLevel !== undefined &&
                    data.maxLevel >= 1 &&
                    data.maxLevel <= 10 && { maxLevel: Math.round(data.maxLevel) }),
                ...(data.sortOrder !== undefined && { sortOrder: Math.round(data.sortOrder) }),
            },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Delete a skill.
 *
 * Cascade choice: child skills are NOT deleted. Instead they are reparented to
 * the deleted skill's parent (i.e. promoted up one level). This preserves the
 * taxonomy and avoids silently destroying sub-skills and their course/user
 * mappings. CourseSkill and UserSkill rows for the deleted skill itself are
 * removed via the schema's onDelete: Cascade.
 */
export async function deleteSkill(skillId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) return { error: access.reason || 'Ingen tilgang' };

        const skill = await prisma.skill.findFirst({
            where: { id: skillId, tenantId },
            select: { id: true, parentSkillId: true },
        });
        if (!skill) return { error: 'Ferdighet ble ikke funnet' };

        await prisma.$transaction([
            // Reparent children up to the deleted skill's parent (tenant-scoped).
            prisma.skill.updateMany({
                where: { tenantId, parentSkillId: skillId },
                data: { parentSkillId: skill.parentSkillId },
            }),
            // Delete the skill — CourseSkill/UserSkill cascade per schema.
            prisma.skill.delete({ where: { id: skillId } }),
        ]);

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// KURS-KOBLING (Course ↔ Skill mappings)
// ══════════════════════════════════════════════════════════════

/** Active tenant courses available for skill mapping. */
export async function listMappableCourses(): Promise<{ courses: MappableCourse[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const courses = await prisma.course.findMany({
            where: { tenantId, status: 'ACTIVE' },
            select: { id: true, title: true, slug: true },
            orderBy: { title: 'asc' },
        });

        return { courses };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function getCourseSkills(
    courseId: string
): Promise<{ items: CourseSkillItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Verify the course belongs to the tenant.
        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ble ikke funnet' };

        const mappings = await prisma.courseSkill.findMany({
            where: { tenantId, courseId },
            select: {
                skillId: true,
                level: true,
                skill: { select: { name: true, maxLevel: true } },
            },
            orderBy: { skill: { name: 'asc' } },
        });

        return {
            items: mappings.map((m) => ({
                skillId: m.skillId,
                skillName: m.skill.name,
                level: m.level,
                maxLevel: m.skill.maxLevel,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Replace the full set of skill mappings for a course. Tenant + ownership are
 * verified for both the course and every skill referenced.
 */
export async function setCourseSkills(
    courseId: string,
    items: { skillId: string; level: number }[]
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) return { error: access.reason || 'Ingen tilgang' };

        const course = await prisma.course.findFirst({
            where: { id: courseId, tenantId },
            select: { id: true },
        });
        if (!course) return { error: 'Kurs ble ikke funnet' };

        // De-duplicate by skillId (keep the last occurrence).
        const byId = new Map<string, number>();
        for (const it of items) {
            if (it.skillId) byId.set(it.skillId, it.level);
        }
        const skillIds = [...byId.keys()];

        // Verify every referenced skill belongs to the tenant; clamp levels.
        let skillMeta = new Map<string, number>(); // skillId -> maxLevel
        if (skillIds.length > 0) {
            const skills = await prisma.skill.findMany({
                where: { tenantId, id: { in: skillIds } },
                select: { id: true, maxLevel: true },
            });
            if (skills.length !== skillIds.length) {
                return { error: 'En eller flere ferdigheter ble ikke funnet' };
            }
            skillMeta = new Map(skills.map((s) => [s.id, s.maxLevel]));
        }

        await prisma.$transaction([
            prisma.courseSkill.deleteMany({ where: { tenantId, courseId } }),
            ...(skillIds.length > 0
                ? [
                      prisma.courseSkill.createMany({
                          data: skillIds.map((skillId) => ({
                              tenantId,
                              courseId,
                              skillId,
                              level: clampLevel(byId.get(skillId) ?? 1, skillMeta.get(skillId) ?? 5),
                          })),
                      }),
                  ]
                : []),
        ]);

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// BRUKERFERDIGHETER (manual / assessment)
// ══════════════════════════════════════════════════════════════

export async function setUserSkill(
    userId: string,
    skillId: string,
    level: number,
    source: 'manual' | 'assessment' = 'manual'
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) return { error: access.reason || 'Ingen tilgang' };

        // Verify both user and skill belong to the tenant.
        const [user, skill] = await Promise.all([
            prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } }),
            prisma.skill.findFirst({ where: { id: skillId, tenantId }, select: { id: true, maxLevel: true } }),
        ]);
        if (!user) return { error: 'Bruker ble ikke funnet' };
        if (!skill) return { error: 'Ferdighet ble ikke funnet' };

        const safeSource = source === 'assessment' ? 'assessment' : 'manual';
        const safeLevel = clampLevel(level, skill.maxLevel);

        await prisma.userSkill.upsert({
            where: { userId_skillId: { userId, skillId } },
            create: { tenantId, userId, skillId, level: safeLevel, source: safeSource },
            update: { level: safeLevel, source: safeSource, acquiredAt: new Date() },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function removeUserSkill(
    userId: string,
    skillId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) return { error: access.reason || 'Ingen tilgang' };

        // Verify ownership before mutating.
        const existing = await prisma.userSkill.findFirst({
            where: { tenantId, userId, skillId },
            select: { id: true },
        });
        if (!existing) return { error: 'Ferdigheten er ikke registrert på brukeren' };

        await prisma.userSkill.delete({ where: { id: existing.id } });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// PROFIL & GAP (delt logikk for admin + learner)
// ══════════════════════════════════════════════════════════════

/**
 * Internal: compute a user's acquired skill set (union of UserSkill rows and
 * skills granted via CourseSkill of COMPLETED courses), taking the max level
 * across sources. Assumes caller has authenticated + tenant-scoped this user.
 */
async function computeAcquired(tenantId: string, userId: string): Promise<AcquiredSkill[]> {
    const [userSkills, completedEnrollments] = await Promise.all([
        prisma.userSkill.findMany({
            where: { tenantId, userId },
            select: {
                skillId: true,
                level: true,
                source: true,
                skill: { select: { name: true, category: true, maxLevel: true } },
            },
        }),
        prisma.courseEnrollment.findMany({
            where: { tenantId, userId, status: 'COMPLETED' },
            select: { courseId: true },
        }),
    ]);

    const completedCourseIds = [...new Set(completedEnrollments.map((e) => e.courseId))];

    const courseSkills =
        completedCourseIds.length > 0
            ? await prisma.courseSkill.findMany({
                  where: { tenantId, courseId: { in: completedCourseIds } },
                  select: {
                      skillId: true,
                      level: true,
                      skill: { select: { name: true, category: true, maxLevel: true } },
                  },
              })
            : [];

    // Aggregate by skillId, keeping max level and the union of sources.
    const map = new Map<string, AcquiredSkill>();

    for (const us of userSkills) {
        map.set(us.skillId, {
            skillId: us.skillId,
            name: us.skill.name,
            category: us.skill.category,
            level: us.level,
            maxLevel: us.skill.maxLevel,
            sources: [us.source],
        });
    }

    for (const cs of courseSkills) {
        const existing = map.get(cs.skillId);
        if (existing) {
            existing.level = Math.max(existing.level, cs.level);
            if (!existing.sources.includes('course')) existing.sources.push('course');
        } else {
            map.set(cs.skillId, {
                skillId: cs.skillId,
                name: cs.skill.name,
                category: cs.skill.category,
                level: cs.level,
                maxLevel: cs.skill.maxLevel,
                sources: ['course'],
            });
        }
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

/**
 * Internal: compute a user's gap. Required skills come from CourseSkill of all
 * courses the user is currently enrolled in (any status) — the target level is
 * the highest level any such mapping requires. The gap is anything not acquired
 * or acquired below the required level. Recommended courses are active courses
 * whose CourseSkill covers a gap skill, excluding courses already completed.
 */
async function computeGap(tenantId: string, userId: string): Promise<SkillGapResult> {
    const acquired = await computeAcquired(tenantId, userId);
    const acquiredLevel = new Map(acquired.map((a) => [a.skillId, a.level]));

    const enrollments = await prisma.courseEnrollment.findMany({
        where: { tenantId, userId },
        select: { courseId: true, status: true },
    });
    const enrolledCourseIds = [...new Set(enrollments.map((e) => e.courseId))];
    const completedCourseIds = new Set(
        enrollments.filter((e) => e.status === 'COMPLETED').map((e) => e.courseId)
    );

    if (enrolledCourseIds.length === 0) {
        return { gaps: [], recommendedCourses: [] };
    }

    // Required skills = max required level across all enrolled courses' mappings.
    const requiredMappings = await prisma.courseSkill.findMany({
        where: { tenantId, courseId: { in: enrolledCourseIds } },
        select: {
            skillId: true,
            level: true,
            skill: { select: { name: true, category: true, maxLevel: true } },
        },
    });

    const required = new Map<
        string,
        { name: string; category: string | null; maxLevel: number; level: number }
    >();
    for (const m of requiredMappings) {
        const cur = required.get(m.skillId);
        if (cur) {
            cur.level = Math.max(cur.level, m.level);
        } else {
            required.set(m.skillId, {
                name: m.skill.name,
                category: m.skill.category,
                maxLevel: m.skill.maxLevel,
                level: m.level,
            });
        }
    }

    const gaps: SkillGapItem[] = [];
    for (const [skillId, req] of required) {
        const current = acquiredLevel.get(skillId) ?? 0;
        if (current < req.level) {
            gaps.push({
                skillId,
                name: req.name,
                category: req.category,
                requiredLevel: req.level,
                currentLevel: current,
                maxLevel: req.maxLevel,
            });
        }
    }
    gaps.sort((a, b) => b.requiredLevel - b.currentLevel - (a.requiredLevel - a.currentLevel));

    // Recommended courses: active tenant courses (not already completed) whose
    // mappings cover at least one gap skill at/above the gap's required level
    // would be ideal, but we recommend any active course that teaches a gap skill.
    let recommendedCourses: RecommendedCourse[] = [];
    const gapSkillIds = gaps.map((g) => g.skillId);
    if (gapSkillIds.length > 0) {
        const candidateMappings = await prisma.courseSkill.findMany({
            where: {
                tenantId,
                skillId: { in: gapSkillIds },
                course: { status: 'ACTIVE' },
            },
            select: {
                courseId: true,
                skillId: true,
                level: true,
                course: { select: { title: true, slug: true } },
                skill: { select: { name: true } },
            },
        });

        const recMap = new Map<string, RecommendedCourse>();
        for (const cm of candidateMappings) {
            if (completedCourseIds.has(cm.courseId)) continue; // skip already-completed
            let rec = recMap.get(cm.courseId);
            if (!rec) {
                rec = {
                    courseId: cm.courseId,
                    title: cm.course.title,
                    slug: cm.course.slug,
                    coversSkills: [],
                };
                recMap.set(cm.courseId, rec);
            }
            rec.coversSkills.push({ skillId: cm.skillId, name: cm.skill.name, level: cm.level });
        }
        recommendedCourses = [...recMap.values()].sort(
            (a, b) => b.coversSkills.length - a.coversSkills.length
        );
    }

    return { gaps, recommendedCourses };
}

/**
 * Admin: acquired skill profile for a tenant user.
 */
export async function getUserSkillProfile(
    userId: string
): Promise<SkillProfile | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true },
        });
        if (!user) return { error: 'Bruker ble ikke funnet' };

        const skills = await computeAcquired(tenantId, userId);
        return { skills };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Admin: gap analysis for a tenant user.
 */
export async function getUserSkillGap(userId: string): Promise<SkillGapResult | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true },
        });
        if (!user) return { error: 'Bruker ble ikke funnet' };

        return await computeGap(tenantId, userId);
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// KOMPETANSEMATRISE (Team matrix)
// ══════════════════════════════════════════════════════════════

const TEAM_MATRIX_CAP = 100;

/**
 * Matrix of users (optionally filtered to a group) × skills, with each user's
 * acquired level per skill. Acquired = UserSkill rows OR CourseSkill from
 * COMPLETED courses (max level). Users capped at 100.
 */
export async function getTeamMatrix(groupId?: string): Promise<TeamMatrix | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Group list for the filter UI.
        const groups = await prisma.group.findMany({
            where: { tenantId },
            select: { id: true, name: true, color: true },
            orderBy: { name: 'asc' },
        });

        let selectedGroupId: string | null = null;
        if (groupId) {
            const grp = await prisma.group.findFirst({
                where: { id: groupId, tenantId },
                select: { id: true },
            });
            if (!grp) return { error: 'Gruppe ble ikke funnet' };
            selectedGroupId = grp.id;
        }

        // Build the user filter (tenant-scoped + optional group membership).
        const userWhere: {
            tenantId: string;
            active: boolean;
            groupMemberships?: { some: { groupId: string } };
        } = { tenantId, active: true };
        if (selectedGroupId) {
            userWhere.groupMemberships = { some: { groupId: selectedGroupId } };
        }

        const userCount = await prisma.user.count({ where: userWhere });

        const usersRaw = await prisma.user.findMany({
            where: userWhere,
            select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                department: true,
            },
            orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
            take: TEAM_MATRIX_CAP,
        });

        const userIds = usersRaw.map((u) => u.id);

        // Skills (flat, for the matrix columns).
        const skillsRaw = await prisma.skill.findMany({
            where: { tenantId },
            select: { id: true, name: true, category: true, maxLevel: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        // Acquired levels: UserSkill rows for the visible users.
        const levels = new Map<string, Map<string, number>>(); // userId -> (skillId -> level)
        const ensure = (uid: string) => {
            let m = levels.get(uid);
            if (!m) {
                m = new Map();
                levels.set(uid, m);
            }
            return m;
        };

        if (userIds.length > 0) {
            const [userSkills, completed] = await Promise.all([
                prisma.userSkill.findMany({
                    where: { tenantId, userId: { in: userIds } },
                    select: { userId: true, skillId: true, level: true },
                }),
                prisma.courseEnrollment.findMany({
                    where: { tenantId, userId: { in: userIds }, status: 'COMPLETED' },
                    select: { userId: true, courseId: true },
                }),
            ]);

            for (const us of userSkills) {
                const m = ensure(us.userId);
                m.set(us.skillId, Math.max(m.get(us.skillId) ?? 0, us.level));
            }

            // Course-derived skills from completed courses.
            const completedCourseIds = [...new Set(completed.map((c) => c.courseId))];
            if (completedCourseIds.length > 0) {
                const courseSkills = await prisma.courseSkill.findMany({
                    where: { tenantId, courseId: { in: completedCourseIds } },
                    select: { courseId: true, skillId: true, level: true },
                });
                // courseId -> [{skillId, level}]
                const byCourse = new Map<string, { skillId: string; level: number }[]>();
                for (const cs of courseSkills) {
                    const arr = byCourse.get(cs.courseId) ?? [];
                    arr.push({ skillId: cs.skillId, level: cs.level });
                    byCourse.set(cs.courseId, arr);
                }
                for (const c of completed) {
                    const grants = byCourse.get(c.courseId);
                    if (!grants) continue;
                    const m = ensure(c.userId);
                    for (const g of grants) {
                        m.set(g.skillId, Math.max(m.get(g.skillId) ?? 0, g.level));
                    }
                }
            }
        }

        const users: TeamMatrixUser[] = usersRaw.map((u) => {
            const display =
                u.firstName || u.lastName
                    ? [u.firstName, u.lastName].filter(Boolean).join(' ')
                    : u.name || u.email || 'Ukjent';
            const levelMap = levels.get(u.id);
            const levelsObj: Record<string, number> = {};
            if (levelMap) {
                for (const [skillId, lvl] of levelMap) levelsObj[skillId] = lvl;
            }
            return {
                id: u.id,
                name: display,
                email: u.email,
                avatarUrl: u.avatarUrl,
                department: u.department,
                levels: levelsObj,
            };
        });

        return {
            skills: skillsRaw.map((s) => ({
                id: s.id,
                name: s.name,
                category: s.category,
                maxLevel: s.maxLevel,
            })),
            users,
            groups,
            selectedGroupId,
            capped: userCount > TEAM_MATRIX_CAP,
            userCount,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ══════════════════════════════════════════════════════════════
// LÆRER (self-service) — gated by tenantId + user, NOT admin role
// ══════════════════════════════════════════════════════════════

/**
 * Learner: own acquired skill profile. Requires the tenant to have
 * 'competency-management'; returns a locked result otherwise.
 */
export async function getMySkillProfile(): Promise<SkillProfile | { error: string }> {
    try {
        const { tenantId, userId } = await requireLearner();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) {
            return { skills: [], locked: true, reason: access.reason };
        }

        const skills = await computeAcquired(tenantId, userId);
        return { skills };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Learner: own gap analysis + recommended courses. Locked result when the
 * tenant lacks 'competency-management'.
 */
export async function getMySkillGap(): Promise<SkillGapResult | { error: string }> {
    try {
        const { tenantId, userId } = await requireLearner();

        const access = await checkCompetencyAccess(tenantId);
        if (!access.allowed) {
            return { gaps: [], recommendedCourses: [], locked: true, reason: access.reason };
        }

        return await computeGap(tenantId, userId);
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Admin helper: list active tenant users (for the gap-analysis user picker).
 */
export async function listSkillUsers(
    search?: string
): Promise<
    | { users: { id: string; name: string; email: string | null; avatarUrl: string | null }[] }
    | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: {
            tenantId: string;
            active: boolean;
            OR?: { firstName?: object; lastName?: object; email?: object; name?: object }[];
        } = { tenantId, active: true };
        if (search && search.trim()) {
            const term = search.trim();
            where.OR = [
                { firstName: { contains: term, mode: 'insensitive' } },
                { lastName: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { name: { contains: term, mode: 'insensitive' } },
            ];
        }

        const users = await prisma.user.findMany({
            where,
            select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true },
            orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
            take: 50,
        });

        return {
            users: users.map((u) => ({
                id: u.id,
                name:
                    u.firstName || u.lastName
                        ? [u.firstName, u.lastName].filter(Boolean).join(' ')
                        : u.name || u.email || 'Ukjent',
                email: u.email,
                avatarUrl: u.avatarUrl,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
