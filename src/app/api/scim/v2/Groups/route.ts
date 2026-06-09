import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateScim, scimError, scimJson, SCIM_SCHEMAS } from '@/lib/scimAuth';
import { logAudit } from '@/lib/audit';
import { toScimGroup, parseEqFilter, parsePagination, type ScimGroupModel } from '@/lib/scimResources';

/**
 * SCIM 2.0 – Groups-kolleksjon (list + opprett).
 *
 * Auth, plan-gating og rate limiting via `authenticateScim`. Tenant-scopet.
 * Generiske SCIM-feil; tokenet logges aldri; CORS aldri '*'.
 *
 * Filter-grammatikk: kun `displayName eq "<verdi>"` (se followups).
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

// ── GET /api/scim/v2/Groups → ListResponse ──────────────────

export async function GET(req: NextRequest) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId } = auth.context;

        const url = new URL(req.url);
        const { startIndex, count } = parsePagination(url);

        const filter = url.searchParams.get('filter');
        const where: { tenantId: string; name?: string } = { tenantId };
        if (filter) {
            const parsed = parseEqFilter(filter);
            if (!parsed || parsed.attribute.toLowerCase() !== 'displayname') {
                return scimError(400, 'Filteret støttes ikke', 'invalidFilter');
            }
            where.name = parsed.value;
        }

        const [total, groups] = await Promise.all([
            prisma.group.count({ where }),
            prisma.group.findMany({
                where,
                include: GROUP_INCLUDE,
                orderBy: { createdAt: 'asc' },
                skip: startIndex - 1,
                take: count,
            }),
        ]);

        const baseUrl = url.origin;
        return scimJson({
            schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
            totalResults: total,
            startIndex,
            itemsPerPage: groups.length,
            Resources: groups.map((g) => toScimGroup(mapGroup(g as GroupWithMembers), baseUrl)),
        });
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── POST /api/scim/v2/Groups → create Group ─────────────────

interface ScimGroupMemberInput {
    value?: string;
}

interface ScimGroupPayload {
    displayName?: string;
    externalId?: string;
    members?: ScimGroupMemberInput[];
}

export async function POST(req: NextRequest) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;

        let payload: ScimGroupPayload;
        try {
            payload = (await req.json()) as ScimGroupPayload;
        } catch {
            return scimError(400, 'Ugyldig forespørsel', 'invalidValue');
        }

        const name = payload.displayName?.trim();
        if (!name) {
            return scimError(400, 'displayName er påkrevd', 'invalidValue');
        }

        // Begrens medlemmer til brukere i samme tenant (unngå krysstenant).
        const requestedMemberIds = Array.from(
            new Set(
                (payload.members ?? [])
                    .map((m) => m.value?.trim())
                    .filter((v): v is string => !!v),
            ),
        );
        let validMemberIds: string[] = [];
        if (requestedMemberIds.length > 0) {
            const members = await prisma.user.findMany({
                where: { id: { in: requestedMemberIds }, tenantId },
                select: { id: true },
            });
            validMemberIds = members.map((m) => m.id);
        }

        const created = await prisma.group.create({
            data: {
                tenantId,
                name,
                externalId: payload.externalId?.trim() || null,
                members: {
                    create: validMemberIds.map((userId) => ({ userId, source: 'scim' })),
                },
            },
            include: GROUP_INCLUDE,
        });

        await logAudit({
            tenantId,
            action: 'scim.group_provisioned',
            targetType: 'group',
            targetId: created.id,
            metadata: { via: 'scim', memberCount: validMemberIds.length, tokenId },
        });

        const baseUrl = new URL(req.url).origin;
        return scimJson(toScimGroup(mapGroup(created as GroupWithMembers), baseUrl), 201, {
            Location: `${baseUrl}/api/scim/v2/Groups/${created.id}`,
        });
    } catch {
        return scimError(500, 'Intern feil');
    }
}
