import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateScim, scimError, scimJson } from '@/lib/scimAuth';
import { logAudit } from '@/lib/audit';
import { toScimGroup, type ScimGroupModel } from '@/lib/scimResources';

/**
 * SCIM 2.0 – enkelt Group-ressurs (GET / PUT / PATCH / DELETE).
 *
 * Tenant-scopet. Auth, plan-gating og rate limiting via `authenticateScim`.
 * Medlemskap forvaltes som GroupMembership med source:'scim'. Generiske
 * SCIM-feil; tokenet logges aldri; CORS aldri '*'.
 *
 * PATCH støtter add/remove/replace av members via Operations[] og replace av
 * displayName. Path-uttrykk for members er delvis støttet (se followups):
 *  - add/remove med path "members" og value: [{ value: <userId> }]
 *  - remove med path `members[value eq "<userId>"]`
 *  - replace av displayName (path "displayName" eller path-løst objekt)
 */

const GROUP_INCLUDE = {
    members: {
        select: {
            user: {
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    name: true,
                },
            },
        },
    },
} as const;

interface GroupWithMembers {
    id: string;
    name: string;
    externalId: string | null;
    createdAt: Date;
    updatedAt: Date;
    members: {
        user: {
            id: string;
            email: string | null;
            firstName: string | null;
            lastName: string | null;
            name: string | null;
        };
    }[];
}

function mapGroup(group: GroupWithMembers): ScimGroupModel {
    return {
        id: group.id,
        name: group.name,
        externalId: group.externalId,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        members: group.members.map((m) => ({
            userId: m.user.id,
            email: m.user.email,
            firstName: m.user.firstName,
            lastName: m.user.lastName,
            name: m.user.name,
        })),
    };
}

/** Filtrer en liste brukers-IDer ned til de som finnes i tenanten. */
async function validTenantUserIds(ids: string[], tenantId: string): Promise<string[]> {
    const unique = Array.from(new Set(ids.map((i) => i.trim()).filter(Boolean)));
    if (unique.length === 0) return [];
    const found = await prisma.user.findMany({
        where: { id: { in: unique }, tenantId },
        select: { id: true },
    });
    return found.map((u) => u.id);
}

/** Legg til medlemmer (idempotent via @@unique[userId, groupId]). */
async function addMembers(groupId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await prisma.groupMembership.createMany({
        data: userIds.map((userId) => ({ groupId, userId, source: 'scim' })),
        skipDuplicates: true,
    });
}

async function removeMembers(groupId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await prisma.groupMembership.deleteMany({
        where: { groupId, userId: { in: userIds } },
    });
}

/** Erstatt hele medlemslisten (PUT / replace members). */
async function replaceMembers(groupId: string, userIds: string[]): Promise<void> {
    await prisma.$transaction([
        prisma.groupMembership.deleteMany({ where: { groupId } }),
        prisma.groupMembership.createMany({
            data: userIds.map((userId) => ({ groupId, userId, source: 'scim' })),
            skipDuplicates: true,
        }),
    ]);
}

// ── GET /api/scim/v2/Groups/[id] ────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId } = auth.context;
        const { id } = await params;

        const group = await prisma.group.findFirst({
            where: { id, tenantId },
            include: GROUP_INCLUDE,
        });
        if (!group) return scimError(404, 'Gruppe ikke funnet');

        return scimJson(toScimGroup(mapGroup(group as GroupWithMembers), new URL(req.url).origin));
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── PUT /api/scim/v2/Groups/[id] (rename + replace members) ─

interface ScimGroupMemberInput {
    value?: string;
}

interface ScimGroupReplacePayload {
    displayName?: string;
    externalId?: string;
    members?: ScimGroupMemberInput[];
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;
        const { id } = await params;

        const existing = await prisma.group.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return scimError(404, 'Gruppe ikke funnet');

        let payload: ScimGroupReplacePayload;
        try {
            payload = (await req.json()) as ScimGroupReplacePayload;
        } catch {
            return scimError(400, 'Ugyldig forespørsel', 'invalidValue');
        }

        const name = payload.displayName?.trim();
        if (!name) {
            return scimError(400, 'displayName er påkrevd', 'invalidValue');
        }

        const memberIds = await validTenantUserIds(
            (payload.members ?? []).map((m) => m.value ?? ''),
            tenantId,
        );

        await prisma.group.update({
            where: { id },
            data: {
                name,
                externalId: payload.externalId?.trim() || null,
            },
        });
        // PUT erstatter hele ressursen → erstatt medlemslisten fullstendig.
        await replaceMembers(id, memberIds);

        const refreshed = await prisma.group.findUnique({
            where: { id },
            include: GROUP_INCLUDE,
        });

        await logAudit({
            tenantId,
            action: 'scim.group_updated',
            targetType: 'group',
            targetId: id,
            metadata: { via: 'scim', op: 'replace', memberCount: memberIds.length, tokenId },
        });

        return scimJson(toScimGroup(mapGroup(refreshed as GroupWithMembers), new URL(req.url).origin));
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── PATCH /api/scim/v2/Groups/[id] (members add/remove, rename) ─

interface ScimPatchOperation {
    op?: string;
    path?: string;
    value?: unknown;
}

interface ScimPatchPayload {
    schemas?: string[];
    Operations?: ScimPatchOperation[];
}

/** Hent userId-er fra en members-operasjons value (array eller enkeltobjekt). */
function memberIdsFromValue(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((v) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>).value : undefined))
            .filter((v): v is string => typeof v === 'string');
    }
    if (typeof value === 'object' && value !== null) {
        const v = (value as Record<string, unknown>).value;
        if (typeof v === 'string') return [v];
    }
    return [];
}

/**
 * Plukk userId fra et members-path med value-filter:
 * `members[value eq "<userId>"]`. Returnerer null hvis ikke gjenkjent.
 */
function memberIdFromPath(path: string): string | null {
    const m = /^members\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i.exec(path.trim());
    return m ? m[1] : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;
        const { id } = await params;

        const existing = await prisma.group.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return scimError(404, 'Gruppe ikke funnet');

        let payload: ScimPatchPayload;
        try {
            payload = (await req.json()) as ScimPatchPayload;
        } catch {
            return scimError(400, 'Ugyldig forespørsel', 'invalidValue');
        }

        const ops = payload.Operations;
        if (!Array.isArray(ops) || ops.length === 0) {
            return scimError(400, 'Operations[] er påkrevd', 'invalidValue');
        }

        // Valider HELE batchen først, slik at en ugyldig operasjon midt i listen
        // ikke kan etterlate delvis-utførte DB-endringer (PATCH skal være alt-
        // eller-ingenting). Kun add/remove/replace støttes.
        for (const op of ops) {
            const verb = (op.op ?? '').toLowerCase();
            if (verb !== 'add' && verb !== 'remove' && verb !== 'replace') {
                return scimError(400, 'Operasjonen støttes ikke', 'invalidValue');
            }
        }

        let renameTo: string | undefined;

        for (const op of ops) {
            const verb = (op.op ?? '').toLowerCase();
            const path = (op.path ?? '').trim();
            const lowerPath = path.toLowerCase();

            if (verb === 'add') {
                if (lowerPath === 'members' || lowerPath === '') {
                    const ids = await validTenantUserIds(memberIdsFromValue(op.value), tenantId);
                    await addMembers(id, ids);
                } else if (lowerPath === 'displayname' && typeof op.value === 'string') {
                    renameTo = op.value.trim();
                }
                continue;
            }

            if (verb === 'remove') {
                // Form 1: path "members" med value [{ value }] → fjern spesifikke.
                // Form 2: path `members[value eq "id"]` → fjern den ene.
                // Form 3: path "members" uten value → fjern alle.
                if (lowerPath === 'members') {
                    const ids = memberIdsFromValue(op.value);
                    if (ids.length > 0) {
                        await removeMembers(id, ids);
                    } else {
                        await prisma.groupMembership.deleteMany({ where: { groupId: id } });
                    }
                } else {
                    const single = memberIdFromPath(path);
                    if (single) await removeMembers(id, [single]);
                    // Ukjente remove-stier ignoreres (delvis path-støtte).
                }
                continue;
            }

            if (verb === 'replace') {
                if (lowerPath === 'members') {
                    const ids = await validTenantUserIds(memberIdsFromValue(op.value), tenantId);
                    await replaceMembers(id, ids);
                } else if (lowerPath === 'displayname' && typeof op.value === 'string') {
                    renameTo = op.value.trim();
                } else if (lowerPath === '' && typeof op.value === 'object' && op.value !== null) {
                    // Path-løs replace: objekt med displayName/members.
                    const obj = op.value as Record<string, unknown>;
                    if (typeof obj.displayName === 'string') renameTo = obj.displayName.trim();
                    if ('members' in obj) {
                        const ids = await validTenantUserIds(memberIdsFromValue(obj.members), tenantId);
                        await replaceMembers(id, ids);
                    }
                }
                continue;
            }

            return scimError(400, 'Operasjonen støttes ikke', 'invalidValue');
        }

        if (renameTo !== undefined) {
            if (!renameTo) return scimError(400, 'displayName kan ikke være tom', 'invalidValue');
            await prisma.group.update({ where: { id }, data: { name: renameTo } });
        }

        const refreshed = await prisma.group.findUnique({
            where: { id },
            include: GROUP_INCLUDE,
        });

        await logAudit({
            tenantId,
            action: 'scim.group_updated',
            targetType: 'group',
            targetId: id,
            metadata: { via: 'scim', op: 'patch', tokenId },
        });

        return scimJson(toScimGroup(mapGroup(refreshed as GroupWithMembers), new URL(req.url).origin));
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── DELETE /api/scim/v2/Groups/[id] ─────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;
        const { id } = await params;

        const existing = await prisma.group.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return scimError(404, 'Gruppe ikke funnet');

        // Sletting av gruppen fjerner medlemskap via onDelete: Cascade.
        await prisma.group.delete({ where: { id } });

        await logAudit({
            tenantId,
            action: 'scim.group_deleted',
            targetType: 'group',
            targetId: id,
            metadata: { via: 'scim', tokenId },
        });

        return new Response(null, { status: 204 });
    } catch {
        return scimError(500, 'Intern feil');
    }
}
