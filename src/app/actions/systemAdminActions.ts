'use server';

import type { TenantPlan } from '@prisma/client';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { ADDON_FEATURES } from '@/lib/features';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Cross-tenant guard. This is the ONLY system-wide surface in the app, so it
 * must be airtight: TENANT_ADMIN is explicitly NOT enough — only SYSTEM_ADMIN
 * may touch other tenants' data. Throws on any failure; never returns a partial
 * identity. Callers wrap in try/catch and surface a generic error.
 */
async function requireSystemAdmin(): Promise<{ userId: string; email: string | null }> {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    return { userId: session.user.id, email: session.user.email ?? null };
}

// Known plan values (kept in sync with the TenantPlan enum).
const VALID_PLANS: TenantPlan[] = ['FREE', 'STANDARD', 'PLUS', 'ENTERPRISE'];

function isValidPlan(value: unknown): value is TenantPlan {
    return typeof value === 'string' && (VALID_PLANS as string[]).includes(value);
}

// Known addon keys come straight from the feature source-of-truth.
const KNOWN_ADDON_KEYS = new Set(Object.keys(ADDON_FEATURES));

// ── Types ───────────────────────────────────────────────────

export interface TenantListItem {
    id: string;
    name: string;
    plan: TenantPlan;
    addons: string[];
    trialEndsAt: Date | null;
    userCount: number;
    createdAt: Date;
}

export interface SystemStats {
    totalTenants: number;
    totalUsers: number;
    tenantsPerPlan: Record<TenantPlan, number>;
}

export interface UpdateTenantInput {
    plan?: TenantPlan;
    addons?: string[];
    trialEndsAt?: string | Date | null;
}

// ── List all tenants (system-wide) ──────────────────────────

export async function listAllTenants(
    search?: string
): Promise<{ tenants: TenantListItem[] } | { error: string }> {
    try {
        // Cross-tenant read: gate FIRST, then query system-wide (no tenant scope).
        await requireSystemAdmin();

        const where: Record<string, unknown> = {};
        if (search && search.trim()) {
            const term = search.trim();
            where.OR = [
                { name: { contains: term, mode: 'insensitive' } },
                { domain: { contains: term, mode: 'insensitive' } },
            ];
        }

        const tenants = await prisma.tenant.findMany({
            where,
            select: {
                id: true,
                name: true,
                plan: true,
                addons: true,
                trialEndsAt: true,
                createdAt: true,
                _count: { select: { users: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            tenants: tenants.map((t) => ({
                id: t.id,
                name: t.name,
                plan: t.plan,
                addons: t.addons,
                trialEndsAt: t.trialEndsAt,
                userCount: t._count.users,
                createdAt: t.createdAt,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Update a tenant's plan / addons / trial ─────────────────

export async function updateTenant(
    tenantId: string,
    input: UpdateTenantInput
): Promise<{ success: true } | { error: string }> {
    try {
        const actor = await requireSystemAdmin();

        if (!tenantId || typeof tenantId !== 'string') {
            return { error: 'Ugyldig organisasjon' };
        }

        // ── Validate inputs before touching the DB ──────────
        const data: { plan?: TenantPlan; addons?: string[]; trialEndsAt?: Date | null } = {};

        if (input.plan !== undefined) {
            if (!isValidPlan(input.plan)) {
                return { error: 'Ugyldig plan' };
            }
            data.plan = input.plan;
        }

        if (input.addons !== undefined) {
            if (!Array.isArray(input.addons)) {
                return { error: 'Ugyldige tillegg' };
            }
            // Every addon must be a known ADDON_FEATURES key. De-duplicate.
            const cleaned = Array.from(
                new Set(input.addons.filter((a) => typeof a === 'string'))
            );
            for (const a of cleaned) {
                if (!KNOWN_ADDON_KEYS.has(a)) {
                    return { error: 'Ukjent tillegg' };
                }
            }
            data.addons = cleaned;
        }

        if (input.trialEndsAt !== undefined) {
            if (input.trialEndsAt === null || input.trialEndsAt === '') {
                data.trialEndsAt = null;
            } else {
                const parsed = new Date(input.trialEndsAt);
                if (Number.isNaN(parsed.getTime())) {
                    return { error: 'Ugyldig dato for prøveperiode' };
                }
                data.trialEndsAt = parsed;
            }
        }

        if (Object.keys(data).length === 0) {
            return { error: 'Ingen endringer å lagre' };
        }

        // Capture "before" for the audit trail.
        const before = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { plan: true, addons: true, trialEndsAt: true },
        });
        if (!before) {
            return { error: 'Organisasjonen ble ikke funnet' };
        }

        const updated = await prisma.tenant.update({
            where: { id: tenantId },
            data,
            select: { plan: true, addons: true, trialEndsAt: true },
        });

        // Audit on the affected tenant, attributed to the acting system admin.
        await logAudit({
            tenantId,
            actorUserId: actor.userId,
            actorEmail: actor.email,
            action: 'system.tenant_updated',
            targetType: 'tenant',
            targetId: tenantId,
            metadata: {
                before: {
                    plan: before.plan,
                    addons: before.addons,
                    trialEndsAt: before.trialEndsAt,
                },
                after: {
                    plan: updated.plan,
                    addons: updated.addons,
                    trialEndsAt: updated.trialEndsAt,
                },
            },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── System-wide stats ───────────────────────────────────────

export async function getSystemStats(): Promise<SystemStats | { error: string }> {
    try {
        await requireSystemAdmin();

        const [totalTenants, totalUsers, grouped] = await Promise.all([
            prisma.tenant.count(),
            prisma.user.count(),
            prisma.tenant.groupBy({
                by: ['plan'],
                _count: { _all: true },
            }),
        ]);

        const tenantsPerPlan: Record<TenantPlan, number> = {
            FREE: 0,
            STANDARD: 0,
            PLUS: 0,
            ENTERPRISE: 0,
        };
        for (const row of grouped) {
            tenantsPerPlan[row.plan] = row._count._all;
        }

        return { totalTenants, totalUsers, tenantsPerPlan };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
