'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import type { GlobalRole } from '@prisma/client';

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

// ── List users ──────────────────────────────────────────────

export interface UserListItem {
    id: string;
    name: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
    globalRole: GlobalRole;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    groupCount: number;
    groups: { id: string; name: string; color: string | null }[];
}

export async function listUsers(search?: string): Promise<{ users: UserListItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Record<string, unknown> = { tenantId };
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
                jobTitle: true,
                globalRole: true,
                active: true,
                createdAt: true,
                updatedAt: true,
                _count: { select: { groupMemberships: true } },
                groupMemberships: {
                    select: { group: { select: { id: true, name: true, color: true } } },
                    take: 5,
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            users: users.map((u) => ({
                id: u.id,
                name: u.name,
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName,
                avatarUrl: u.avatarUrl,
                jobTitle: u.jobTitle,
                globalRole: u.globalRole,
                active: u.active,
                createdAt: u.createdAt,
                updatedAt: u.updatedAt,
                groupCount: u._count.groupMemberships,
                groups: u.groupMemberships.map((m) => m.group),
            })),
        };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Get single user ─────────────────────────────────────────

export interface UserDetail {
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
    workSchedule: string | null;
    startDate: Date | null;
    globalRole: GlobalRole;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    groups: { id: string; name: string; color: string | null }[];
}

export async function getUser(userId: string): Promise<{ user: UserDetail } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
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
                workSchedule: true,
                startDate: true,
                globalRole: true,
                active: true,
                createdAt: true,
                updatedAt: true,
                groupMemberships: {
                    select: {
                        group: { select: { id: true, name: true, color: true } },
                    },
                },
            },
        });

        if (!user) return { error: 'Bruker ikke funnet' };

        return {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                avatarUrl: user.avatarUrl,
                jobTitle: user.jobTitle,
                department: user.department,
                bio: user.bio,
                phone: user.phone,
                location: user.location,
                workSchedule: user.workSchedule,
                startDate: user.startDate,
                globalRole: user.globalRole,
                active: user.active,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                groups: user.groupMemberships.map((m) => m.group),
            },
        };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Update user ─────────────────────────────────────────────

export async function updateUser(
    userId: string,
    data: {
        firstName?: string;
        lastName?: string;
        jobTitle?: string;
        department?: string;
        phone?: string;
        location?: string;
        workSchedule?: string;
        globalRole?: GlobalRole;
        active?: boolean;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId: adminId } = await requireTenantAdmin();

        // Verify user belongs to this tenant
        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true },
        });
        if (!user) return { error: 'Bruker ikke funnet' };

        // Prevent self-demotion from admin
        if (userId === adminId && data.globalRole && data.globalRole !== 'TENANT_ADMIN' && data.globalRole !== 'SYSTEM_ADMIN') {
            return { error: 'Du kan ikke fjerne din egen admin-rolle' };
        }

        // Prevent self-deactivation
        if (userId === adminId && data.active === false) {
            return { error: 'Du kan ikke deaktivere din egen konto' };
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                firstName: data.firstName,
                lastName: data.lastName,
                jobTitle: data.jobTitle,
                department: data.department,
                phone: data.phone,
                location: data.location,
                workSchedule: data.workSchedule,
                globalRole: data.globalRole,
                active: data.active,
            },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Invite user (create + send magic link) ──────────────────

export async function inviteUser(
    email: string,
    data: {
        firstName?: string;
        lastName?: string;
        globalRole?: GlobalRole;
    }
): Promise<{ success: true; userId: string } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        if (!email || !email.includes('@')) {
            return { error: 'Ugyldig e-postadresse' };
        }

        // Check if user with this email already exists
        const existing = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
            select: { id: true, tenantId: true },
        });

        if (existing) {
            if (existing.tenantId === tenantId) {
                return { error: 'Brukeren finnes allerede i organisasjonen' };
            }
            return { error: 'E-postadressen er allerede registrert i en annen organisasjon' };
        }

        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase().trim(),
                firstName: data.firstName || null,
                lastName: data.lastName || null,
                globalRole: data.globalRole || 'USER',
                tenantId,
                active: true,
            },
        });

        // TODO: Trigger magic link / welcome email via Auth.js

        return { success: true, userId: user.id };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Remove user from tenant ─────────────────────────────────

export async function removeUser(userId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId: adminId } = await requireTenantAdmin();

        if (userId === adminId) {
            return { error: 'Du kan ikke fjerne deg selv fra organisasjonen' };
        }

        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true },
        });
        if (!user) return { error: 'Bruker ikke funnet' };

        // Remove group memberships first
        await prisma.groupMembership.deleteMany({
            where: { userId },
        });

        // Remove user from tenant (soft: set tenantId to null)
        await prisma.user.update({
            where: { id: userId },
            data: { tenantId: null, active: false },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Get tenant stats ────────────────────────────────────────

export async function getUserStats(): Promise<{
    total: number;
    active: number;
    admins: number;
    inactive: number;
} | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const [total, active, admins, inactive] = await Promise.all([
            prisma.user.count({ where: { tenantId } }),
            prisma.user.count({ where: { tenantId, active: true } }),
            prisma.user.count({ where: { tenantId, globalRole: { in: ['TENANT_ADMIN', 'SYSTEM_ADMIN'] } } }),
            prisma.user.count({ where: { tenantId, active: false } }),
        ]);

        return { total, active, admins, inactive };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}
