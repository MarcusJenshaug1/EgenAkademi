import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateScim, scimError, scimJson, SCIM_SCHEMAS } from '@/lib/scimAuth';
import { logAudit } from '@/lib/audit';
import { toScimUser, parseEqFilter, parsePagination } from '@/lib/scimResources';

/**
 * SCIM 2.0 – Users-kolleksjon (list + opprett).
 *
 * Auth, plan-gating og rate limiting håndteres av `authenticateScim`
 * (se src/lib/scimAuth.ts). Tokenet logges ALDRI. Alle feil returneres som
 * generiske SCIM-feil. CORS settes ALDRI til '*'.
 *
 * Filter-grammatikk: kun `userName eq "<verdi>"` (se followups).
 */

const USER_SELECT = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    name: true,
    active: true,
    externalId: true,
    createdAt: true,
    updatedAt: true,
} as const;

// ── GET /api/scim/v2/Users → ListResponse ───────────────────

export async function GET(req: NextRequest) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId } = auth.context;

        const url = new URL(req.url);
        const { startIndex, count } = parsePagination(url);

        // Minimal filter-støtte: userName eq "..." (vanligst fra IdP-er).
        const filter = url.searchParams.get('filter');
        const where: { tenantId: string; email?: string } = { tenantId };
        if (filter) {
            const parsed = parseEqFilter(filter);
            if (!parsed || parsed.attribute.toLowerCase() !== 'username') {
                return scimError(400, 'Filteret støttes ikke', 'invalidFilter');
            }
            where.email = parsed.value.toLowerCase();
        }

        const [total, users] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: USER_SELECT,
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
            itemsPerPage: users.length,
            Resources: users.map((u) => toScimUser(u, baseUrl)),
        });
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── POST /api/scim/v2/Users → create User ────────────────────

interface ScimUserPayload {
    userName?: string;
    externalId?: string;
    active?: boolean;
    name?: { givenName?: string; familyName?: string };
    emails?: { value?: string; primary?: boolean }[];
}

export async function POST(req: NextRequest) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;

        let payload: ScimUserPayload;
        try {
            payload = (await req.json()) as ScimUserPayload;
        } catch {
            return scimError(400, 'Ugyldig forespørsel', 'invalidValue');
        }

        // userName/email er påkrevd.
        const primaryEmail = payload.emails?.find((e) => e.primary)?.value;
        const anyEmail = payload.emails?.find((e) => !!e.value)?.value;
        const email = (payload.userName || primaryEmail || anyEmail || '').trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return scimError(400, 'userName/email er påkrevd og må være gyldig', 'invalidValue');
        }

        // Unikhet: User.email er globalt unikt i schema.
        const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });
        if (existing) {
            // SCIM 409 ved konflikt – ikke avslør hvilken tenant brukeren er i.
            return scimError(409, 'Bruker finnes allerede', 'uniqueness');
        }

        const created = await prisma.user.create({
            data: {
                email,
                firstName: payload.name?.givenName?.trim() || null,
                lastName: payload.name?.familyName?.trim() || null,
                externalId: payload.externalId?.trim() || null,
                active: payload.active ?? true,
                globalRole: 'USER',
                tenantId,
            },
            select: USER_SELECT,
        });

        await logAudit({
            tenantId,
            action: 'scim.user_provisioned',
            targetType: 'user',
            targetId: created.id,
            metadata: { via: 'scim', tokenId },
        });

        const baseUrl = new URL(req.url).origin;
        return scimJson(toScimUser(created, baseUrl), 201, {
            Location: `${baseUrl}/api/scim/v2/Users/${created.id}`,
        });
    } catch {
        return scimError(500, 'Intern feil');
    }
}
