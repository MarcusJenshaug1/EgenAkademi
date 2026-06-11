'use server';

import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';

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

export interface GroupListItem {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    memberCount: number;
    isDynamic: boolean;
    createdAt: Date;
}

export interface GroupDetail {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    isDynamic: boolean;
    ruleJson: GroupRule | null;
    createdAt: Date;
    updatedAt: Date;
    members: {
        id: string;
        membershipId: string;
        name: string | null;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
        globalRole: string;
        active: boolean;
        source: string;
    }[];
}

// ── Dynamic group rule types ────────────────────────────────

export type RuleAttribute =
    | 'department'
    | 'jobTitle'
    | 'location'
    | 'globalRole'
    | 'active'
    | 'email'
    | 'firstName'
    | 'lastName';

export type RuleOperator =
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'starts_with'
    | 'is_empty'
    | 'is_not_empty';

export interface RuleCondition {
    attribute: RuleAttribute;
    operator: RuleOperator;
    value: string;
}

export interface GroupRule {
    match: 'all' | 'any';
    conditions: RuleCondition[];
}

const RULE_ATTRIBUTES: RuleAttribute[] = [
    'department',
    'jobTitle',
    'location',
    'globalRole',
    'active',
    'email',
    'firstName',
    'lastName',
];

const RULE_OPERATORS: RuleOperator[] = [
    'equals',
    'not_equals',
    'contains',
    'starts_with',
    'is_empty',
    'is_not_empty',
];

/**
 * Normalize/validate an unknown value into a well-formed GroupRule.
 * Returns null when the input cannot be interpreted as a rule.
 */
function parseRule(raw: unknown): GroupRule | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const match = obj.match === 'any' ? 'any' : 'all';
    if (!Array.isArray(obj.conditions)) {
        return { match, conditions: [] };
    }
    const conditions: RuleCondition[] = [];
    for (const c of obj.conditions) {
        if (!c || typeof c !== 'object') continue;
        const cond = c as Record<string, unknown>;
        const attribute = cond.attribute as RuleAttribute;
        const operator = cond.operator as RuleOperator;
        if (!RULE_ATTRIBUTES.includes(attribute)) continue;
        if (!RULE_OPERATORS.includes(operator)) continue;
        conditions.push({
            attribute,
            operator,
            value: typeof cond.value === 'string' ? cond.value : String(cond.value ?? ''),
        });
    }
    return { match, conditions };
}

/** User attributes needed for rule evaluation */
interface EvaluableUser {
    id: string;
    department: string | null;
    jobTitle: string | null;
    location: string | null;
    globalRole: string;
    active: boolean;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
}

/** Evaluate a single condition against a user */
function evalCondition(user: EvaluableUser, cond: RuleCondition): boolean {
    // The "active" boolean attribute is compared as a string ("true"/"false")
    let attrValue: string;
    if (cond.attribute === 'active') {
        attrValue = user.active ? 'true' : 'false';
    } else {
        const raw = user[cond.attribute];
        attrValue = raw == null ? '' : String(raw);
    }

    const target = cond.value ?? '';
    const a = attrValue.trim().toLowerCase();
    const b = target.trim().toLowerCase();

    switch (cond.operator) {
        case 'equals':
            return a === b;
        case 'not_equals':
            return a !== b;
        case 'contains':
            return b.length > 0 && a.includes(b);
        case 'starts_with':
            return b.length > 0 && a.startsWith(b);
        case 'is_empty':
            return attrValue.trim().length === 0;
        case 'is_not_empty':
            return attrValue.trim().length > 0;
        default:
            return false;
    }
}

/** Evaluate the full rule against a user */
function evalRule(user: EvaluableUser, rule: GroupRule): boolean {
    if (rule.conditions.length === 0) return false;
    if (rule.match === 'any') {
        return rule.conditions.some((c) => evalCondition(user, c));
    }
    return rule.conditions.every((c) => evalCondition(user, c));
}

const USER_EVAL_SELECT = {
    id: true,
    department: true,
    jobTitle: true,
    location: true,
    globalRole: true,
    active: true,
    email: true,
    firstName: true,
    lastName: true,
} as const;

// ── List groups ─────────────────────────────────────────────

export async function listGroups(search?: string): Promise<{ groups: GroupListItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Record<string, unknown> = { tenantId };
        if (search && search.trim()) {
            const term = search.trim();
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
            ];
        }

        const groups = await prisma.group.findMany({
            where,
            select: {
                id: true,
                name: true,
                description: true,
                color: true,
                isDynamic: true,
                createdAt: true,
                _count: { select: { members: true } },
            },
            orderBy: { name: 'asc' },
        });

        return {
            groups: groups.map((g) => ({
                id: g.id,
                name: g.name,
                description: g.description,
                color: g.color,
                memberCount: g._count.members,
                isDynamic: g.isDynamic,
                createdAt: g.createdAt,
            })),
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Get single group ────────────────────────────────────────

export async function getGroup(groupId: string): Promise<{ group: GroupDetail } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: {
                id: true,
                name: true,
                description: true,
                color: true,
                isDynamic: true,
                ruleJson: true,
                createdAt: true,
                updatedAt: true,
                members: {
                    select: {
                        id: true,
                        source: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                                avatarUrl: true,
                                globalRole: true,
                                active: true,
                            },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!group) return { error: 'Gruppe ikke funnet' };

        return {
            group: {
                id: group.id,
                name: group.name,
                description: group.description,
                color: group.color,
                isDynamic: group.isDynamic,
                ruleJson: parseRule(group.ruleJson),
                createdAt: group.createdAt,
                updatedAt: group.updatedAt,
                members: group.members.map((m) => ({
                    id: m.user.id,
                    membershipId: m.id,
                    name: m.user.name,
                    email: m.user.email,
                    firstName: m.user.firstName,
                    lastName: m.user.lastName,
                    avatarUrl: m.user.avatarUrl,
                    globalRole: m.user.globalRole,
                    active: m.user.active,
                    source: m.source,
                })),
            },
        };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Create group ────────────────────────────────────────────

export async function createGroup(data: {
    name: string;
    description?: string;
    color?: string;
}): Promise<{ success: true; groupId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        if (!data.name || data.name.trim().length < 2) {
            return { error: 'Gruppenavn må være minst 2 tegn' };
        }

        const group = await prisma.group.create({
            data: {
                name: data.name.trim(),
                description: data.description?.trim() || null,
                color: data.color || null,
                tenantId,
            },
        });

        return { success: true, groupId: group.id };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Update group ────────────────────────────────────────────

export async function updateGroup(
    groupId: string,
    data: { name?: string; description?: string; color?: string | null }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };

        if (data.name !== undefined && data.name.trim().length < 2) {
            return { error: 'Gruppenavn må være minst 2 tegn' };
        }

        await prisma.group.update({
            where: { id: groupId },
            data: {
                ...(data.name !== undefined && { name: data.name.trim() }),
                ...(data.description !== undefined && { description: data.description.trim() || null }),
                ...(data.color !== undefined && { color: data.color || null }),
            },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Delete group ────────────────────────────────────────────

export async function deleteGroup(groupId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };

        // Delete memberships first, then group
        await prisma.groupMembership.deleteMany({ where: { groupId } });
        await prisma.group.delete({ where: { id: groupId } });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Add member ──────────────────────────────────────────────

export async function addGroupMember(
    groupId: string,
    userId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Verify group belongs to tenant
        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };

        // Verify user belongs to tenant
        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true },
        });
        if (!user) return { error: 'Bruker ikke funnet i organisasjonen' };

        // Check existing membership
        const existing = await prisma.groupMembership.findUnique({
            where: { userId_groupId: { userId, groupId } },
        });
        if (existing) return { error: 'Brukeren er allerede medlem av gruppen' };

        await prisma.groupMembership.create({
            data: { userId, groupId },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Remove member ───────────────────────────────────────────

export async function removeGroupMember(
    groupId: string,
    userId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };

        const membership = await prisma.groupMembership.findUnique({
            where: { userId_groupId: { userId, groupId } },
        });
        if (!membership) return { error: 'Brukeren er ikke medlem av gruppen' };

        await prisma.groupMembership.delete({
            where: { id: membership.id },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── List available users (for add-member picker) ────────────

export async function listAvailableMembers(
    groupId: string,
    search?: string
): Promise<{ users: { id: string; name: string | null; email: string | null; firstName: string | null; lastName: string | null; avatarUrl: string | null }[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        // Verify the group belongs to the caller's tenant before reading its
        // membership (ownership check matches the rest of this file).
        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };

        // Get existing member IDs
        const existingMembers = await prisma.groupMembership.findMany({
            where: { groupId },
            select: { userId: true },
        });
        const memberIds = existingMembers.map((m) => m.userId);

        const where: Record<string, unknown> = {
            tenantId,
            active: true,
            id: { notIn: memberIds },
        };

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
                name: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
            },
            orderBy: { email: 'asc' },
            take: 20,
        });

        return { users };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Group stats ─────────────────────────────────────────────

export async function getGroupStats(): Promise<{
    totalGroups: number;
    totalMemberships: number;
    emptyGroups: number;
} | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const groups = await prisma.group.findMany({
            where: { tenantId },
            select: { _count: { select: { members: true } } },
        });

        const totalGroups = groups.length;
        const totalMemberships = groups.reduce((sum, g) => sum + g._count.members, 0);
        const emptyGroups = groups.filter((g) => g._count.members === 0).length;

        return { totalGroups, totalMemberships, emptyGroups };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

// ── Dynamic groups ──────────────────────────────────────────

export interface SyncResult {
    added: number;
    removed: number;
    total: number;
}

/**
 * Core reconciliation for a single dynamic group, scoped to a tenant.
 * Evaluates ruleJson against the tenant's users and reconciles only
 * memberships with source:'rule' — manual memberships are never touched.
 *
 * This internal helper does NOT perform auth; callers must authenticate
 * and verify tenant ownership first.
 */
async function reconcileDynamicGroup(
    tenantId: string,
    group: { id: string; isDynamic: boolean; ruleJson: unknown }
): Promise<SyncResult> {
    // Existing memberships for this group
    const existing = await prisma.groupMembership.findMany({
        where: { groupId: group.id },
        select: { id: true, userId: true, source: true },
    });

    // If the group is not dynamic, remove any stale rule-memberships and stop.
    if (!group.isDynamic) {
        const ruleMembershipIds = existing
            .filter((m) => m.source === 'rule')
            .map((m) => m.id);
        if (ruleMembershipIds.length > 0) {
            await prisma.groupMembership.deleteMany({ where: { id: { in: ruleMembershipIds } } });
        }
        const total = existing.length - ruleMembershipIds.length;
        return { added: 0, removed: ruleMembershipIds.length, total };
    }

    const rule = parseRule(group.ruleJson);

    // Evaluate against all tenant users
    const users = await prisma.user.findMany({
        where: { tenantId },
        select: USER_EVAL_SELECT,
    });

    const matchingIds = new Set<string>(
        rule ? users.filter((u) => evalRule(u, rule)).map((u) => u.id) : []
    );

    const ruleMembers = existing.filter((m) => m.source === 'rule');
    const manualOrOtherUserIds = new Set(
        existing.filter((m) => m.source !== 'rule').map((m) => m.userId)
    );
    const currentRuleUserIds = new Set(ruleMembers.map((m) => m.userId));

    // Users to add (match the rule, not already a rule-member, and not already
    // a manual/other member — avoid violating the @@unique([userId, groupId])).
    const toAdd = [...matchingIds].filter(
        (uid) => !currentRuleUserIds.has(uid) && !manualOrOtherUserIds.has(uid)
    );

    // Rule-memberships that no longer match — remove them.
    const toRemove = ruleMembers.filter((m) => !matchingIds.has(m.userId));

    if (toAdd.length > 0) {
        await prisma.groupMembership.createMany({
            data: toAdd.map((userId) => ({ groupId: group.id, userId, source: 'rule' })),
            skipDuplicates: true,
        });
    }

    if (toRemove.length > 0) {
        await prisma.groupMembership.deleteMany({
            where: { id: { in: toRemove.map((m) => m.id) } },
        });
    }

    const total = await prisma.groupMembership.count({ where: { groupId: group.id } });
    return { added: toAdd.length, removed: toRemove.length, total };
}

/**
 * Turn a group's dynamic mode on/off and persist its rule.
 * When turning dynamic on, the group is immediately synced.
 */
export async function setGroupDynamic(
    groupId: string,
    isDynamic: boolean,
    ruleJson: object | null
): Promise<{ success: true; sync?: SyncResult } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };

        const normalizedRule = isDynamic ? parseRule(ruleJson) : null;

        const updated = await prisma.group.update({
            where: { id: groupId },
            data: {
                isDynamic,
                // Store the normalized rule when dynamic; clear it otherwise.
                ruleJson: normalizedRule === null
                    ? Prisma.JsonNull
                    : (normalizedRule as unknown as Prisma.InputJsonValue),
            },
            select: { id: true, isDynamic: true, ruleJson: true },
        });

        // Reconcile immediately so the membership list reflects the change.
        const sync = await reconcileDynamicGroup(tenantId, updated);

        return { success: true, sync };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Re-evaluate a single dynamic group's rule and reconcile its
 * rule-based memberships. Manual memberships are preserved.
 */
export async function syncDynamicGroup(
    groupId: string
): Promise<SyncResult | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const group = await prisma.group.findFirst({
            where: { id: groupId, tenantId },
            select: { id: true, isDynamic: true, ruleJson: true },
        });
        if (!group) return { error: 'Gruppe ikke funnet' };
        if (!group.isDynamic) return { error: 'Gruppen er ikke dynamisk' };

        const result = await reconcileDynamicGroup(tenantId, group);
        return result;
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Re-evaluate every dynamic group in the tenant.
 */
export async function syncAllDynamicGroups(): Promise<
    { success: true; groups: number; added: number; removed: number } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const groups = await prisma.group.findMany({
            where: { tenantId, isDynamic: true },
            select: { id: true, isDynamic: true, ruleJson: true },
        });

        let added = 0;
        let removed = 0;
        for (const group of groups) {
            const result = await reconcileDynamicGroup(tenantId, group);
            added += result.added;
            removed += result.removed;
        }

        return { success: true, groups: groups.length, added, removed };
    } catch (e: unknown) {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Re-evaluate every dynamic group in the tenant for a single user, adding or
 * removing that user's rule-based membership accordingly. Intended to be wired
 * into user create/update flows by the orchestrator. Errors are swallowed so
 * that membership reconciliation never breaks the calling operation.
 */
export async function syncDynamicGroupsForUser(tenantId: string, userId: string): Promise<void> {
    try {
        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: USER_EVAL_SELECT,
        });
        if (!user) return;

        const groups = await prisma.group.findMany({
            where: { tenantId, isDynamic: true },
            select: { id: true, ruleJson: true },
        });

        for (const group of groups) {
            const rule = parseRule(group.ruleJson);
            const matches = rule ? evalRule(user, rule) : false;

            const membership = await prisma.groupMembership.findUnique({
                where: { userId_groupId: { userId, groupId: group.id } },
                select: { id: true, source: true },
            });

            if (matches) {
                // Add a rule-membership only if there is no membership at all.
                // Never overwrite/duplicate a manual (or other-source) membership.
                if (!membership) {
                    await prisma.groupMembership.create({
                        data: { userId, groupId: group.id, source: 'rule' },
                    });
                }
            } else if (membership && membership.source === 'rule') {
                // User no longer matches — drop the rule-membership only.
                await prisma.groupMembership.delete({ where: { id: membership.id } });
            }
        }
    } catch {
        // Swallow: reconciliation is a best-effort side effect and must never
        // surface internal errors to the caller.
    }
}
