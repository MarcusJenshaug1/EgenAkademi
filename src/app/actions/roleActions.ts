'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';

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

// ── Role definitions ────────────────────────────────────────

export interface RoleInfo {
    key: string;
    label: string;
    description: string;
    permissions: string[];
    userCount: number;
}

const ROLE_DEFINITIONS: Record<string, { label: string; description: string; permissions: string[] }> = {
    USER: {
        label: 'Bruker',
        description: 'Standard brukerrolle. Kan delta på kurs, fullføre leksjoner og se eget fremgang.',
        permissions: [
            'Se tilgjengelige kurs',
            'Melde seg på kurs',
            'Fullføre leksjoner og quizer',
            'Se egen fremdrift og sertifikater',
            'Redigere egen profil',
        ],
    },
    TENANT_ADMIN: {
        label: 'Organisasjonsadministrator',
        description: 'Full administrasjonstilgang for organisasjonen. Kan administrere brukere, grupper, kurs og innstillinger.',
        permissions: [
            'Alle brukerrettigheter',
            'Administrere brukere (invitere, redigere, deaktivere)',
            'Administrere grupper og gruppemedlemskap',
            'Opprette og redigere kurs og innhold',
            'Se rapporter og statistikk',
            'Endre organisasjonsinnstillinger og branding',
            'Administrere integrasjoner',
        ],
    },
    SYSTEM_ADMIN: {
        label: 'Systemadministrator',
        description: 'Høyeste tilgangsnivå. Full tilgang til alle funksjoner på tvers av plattformen.',
        permissions: [
            'Alle administratorrettigheter',
            'Tilgang til alle organisasjoner',
            'Systemkonfigurasjon',
            'Plattformovervåking',
        ],
    },
};

// ── Get roles with user counts ──────────────────────────────

export async function getRolesOverview(): Promise<{ roles: RoleInfo[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const roleCounts = await prisma.user.groupBy({
            by: ['globalRole'],
            where: { tenantId, active: true },
            _count: { id: true },
        });

        const countMap: Record<string, number> = {};
        for (const rc of roleCounts) {
            countMap[rc.globalRole] = rc._count.id;
        }

        const roles: RoleInfo[] = Object.entries(ROLE_DEFINITIONS).map(([key, def]) => ({
            key,
            label: def.label,
            description: def.description,
            permissions: def.permissions,
            userCount: countMap[key] || 0,
        }));

        return { roles };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Update user role ────────────────────────────────────────

export async function updateUserRole(
    userId: string,
    newRole: 'USER' | 'TENANT_ADMIN' | 'SYSTEM_ADMIN'
): Promise<{ success: true } | { error: string }> {
    try {
        const { userId: adminId, tenantId } = await requireTenantAdmin();

        // Can't change own role
        if (userId === adminId) {
            return { error: 'Du kan ikke endre din egen rolle' };
        }

        // Only SYSTEM_ADMIN can assign SYSTEM_ADMIN
        const session = await auth();
        if (newRole === 'SYSTEM_ADMIN' && session?.user?.globalRole !== 'SYSTEM_ADMIN') {
            return { error: 'Kun systemadministratorer kan tildele systemadministrator-rollen' };
        }

        // Verify user belongs to tenant
        const user = await prisma.user.findFirst({
            where: { id: userId, tenantId },
            select: { id: true, globalRole: true },
        });
        if (!user) return { error: 'Bruker ikke funnet' };

        // Can't demote other SYSTEM_ADMINs unless you are one
        if (user.globalRole === 'SYSTEM_ADMIN' && session?.user?.globalRole !== 'SYSTEM_ADMIN') {
            return { error: 'Du kan ikke endre rollen til en systemadministrator' };
        }

        await prisma.user.update({
            where: { id: userId },
            data: { globalRole: newRole },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── List users by role ──────────────────────────────────────

export async function listUsersByRole(
    role: string,
    search?: string
): Promise<{
    users: { id: string; name: string | null; email: string | null; firstName: string | null; lastName: string | null; globalRole: string; active: boolean }[]
} | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const where: Record<string, unknown> = { tenantId, globalRole: role, active: true };

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
                globalRole: true,
                active: true,
            },
            orderBy: { email: 'asc' },
        });

        return { users };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}
