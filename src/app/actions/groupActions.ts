'use server';

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
    memberCount: number;
    createdAt: Date;
}

export interface GroupDetail {
    id: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
    members: {
        id: string;
        membershipId: string;
        name: string | null;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        globalRole: string;
        active: boolean;
    }[];
}

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
                memberCount: g._count.members,
                createdAt: g.createdAt,
            })),
        };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
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
                createdAt: true,
                updatedAt: true,
                members: {
                    select: {
                        id: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                firstName: true,
                                lastName: true,
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
                createdAt: group.createdAt,
                updatedAt: group.updatedAt,
                members: group.members.map((m) => ({
                    id: m.user.id,
                    membershipId: m.id,
                    name: m.user.name,
                    email: m.user.email,
                    firstName: m.user.firstName,
                    lastName: m.user.lastName,
                    globalRole: m.user.globalRole,
                    active: m.user.active,
                })),
            },
        };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Create group ────────────────────────────────────────────

export async function createGroup(data: {
    name: string;
    description?: string;
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
                tenantId,
            },
        });

        return { success: true, groupId: group.id };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Update group ────────────────────────────────────────────

export async function updateGroup(
    groupId: string,
    data: { name?: string; description?: string }
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
            },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
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
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
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
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
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
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── List available users (for add-member picker) ────────────

export async function listAvailableMembers(
    groupId: string,
    search?: string
): Promise<{ users: { id: string; name: string | null; email: string | null; firstName: string | null; lastName: string | null }[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

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
            },
            orderBy: { email: 'asc' },
            take: 20,
        });

        return { users };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
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
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}
