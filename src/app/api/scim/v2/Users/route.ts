import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';

/**
 * SCIM 2.0 – Users-endepunkt (minimal, men ekte og autentisert).
 *
 * Sikkerhet:
 *  - Bearer-token autentiseres ved å sha256-hashe tokenet og slå opp en
 *    ScimToken-rad med samme tokenHash som ikke er tilbakekalt eller utløpt.
 *  - Tokenet logges ALDRI noe sted.
 *  - Alle feil returneres som generiske SCIM-feil – ingen interne detaljer.
 *  - CORS settes ALDRI til '*'.
 *
 * Begrensninger: se followups i oppgavebeskrivelsen. Dette er en lese-/
 * opprett-flate; PATCH/PUT/DELETE og full filter-syntaks er ikke implementert.
 */

const SCIM_CONTENT_TYPE = 'application/scim+json';
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

function sha256Hex(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function scimError(status: number, detail: string) {
    return NextResponse.json(
        { schemas: [ERROR_SCHEMA], detail, status: String(status) },
        { status, headers: { 'Content-Type': SCIM_CONTENT_TYPE } }
    );
}

interface AuthedToken {
    tenantId: string;
    tokenId: string;
}

/**
 * Autentiser SCIM-forespørselen via Bearer-token. Returnerer tenantId ved
 * gyldig token, ellers null. Oppdaterer lastUsedAt som bivirkning.
 */
async function authenticate(req: NextRequest): Promise<AuthedToken | null> {
    const header = req.headers.get('authorization');
    if (!header) return null;

    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return null;

    const presented = match[1].trim();
    if (!presented) return null;

    // Hash tokenet og slå opp – klartekst lagres aldri og logges aldri.
    const tokenHash = sha256Hex(presented);

    const token = await prisma.scimToken.findUnique({
        where: { tokenHash },
        select: { id: true, tenantId: true, revokedAt: true, expiresAt: true },
    });

    if (!token) return null;
    if (token.revokedAt) return null;
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return null;

    // Oppdater lastUsedAt – best effort, skal ikke velte forespørselen.
    try {
        await prisma.scimToken.update({
            where: { id: token.id },
            data: { lastUsedAt: new Date() },
        });
    } catch {
        // Ignorer logging-feil.
    }

    return { tenantId: token.tenantId, tokenId: token.id };
}

/**
 * Plan-gate SCIM på serveren. Et gyldig token er ikke nok – tenanten må
 * fortsatt ha 'scim'-funksjonen i planen (f.eks. nedgradering eller utløpt
 * prøveperiode skal stenge provisjonering selv om tokenet ikke er tilbakekalt).
 */
async function scimFeatureAllowed(tenantId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) return false;
    return checkAccess(tenant, 'scim').allowed;
}

function toScimUser(user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}) {
    return {
        schemas: [USER_SCHEMA],
        id: user.id,
        userName: user.email ?? user.id,
        name: {
            givenName: user.firstName ?? '',
            familyName: user.lastName ?? '',
            formatted:
                [user.firstName, user.lastName].filter(Boolean).join(' ') ||
                user.name ||
                (user.email ?? ''),
        },
        emails: user.email
            ? [{ value: user.email, primary: true, type: 'work' }]
            : [],
        active: user.active,
        meta: {
            resourceType: 'User',
            created: user.createdAt.toISOString(),
            lastModified: user.updatedAt.toISOString(),
        },
    };
}

// ── GET /api/scim/v2/Users → ListResponse ───────────────────

export async function GET(req: NextRequest) {
    try {
        const authed = await authenticate(req);
        if (!authed) {
            return scimError(401, 'Uautorisert');
        }
        if (!(await scimFeatureAllowed(authed.tenantId))) {
            return scimError(403, 'SCIM er ikke tilgjengelig for denne organisasjonen');
        }

        const url = new URL(req.url);
        const startIndex = Math.max(parseInt(url.searchParams.get('startIndex') ?? '1', 10) || 1, 1);
        const count = Math.min(
            Math.max(parseInt(url.searchParams.get('count') ?? '100', 10) || 100, 1),
            200
        );

        // Minimal filter-støtte: userName eq "..." (vanligst fra IdP-er).
        const filter = url.searchParams.get('filter');
        const where: Record<string, unknown> = { tenantId: authed.tenantId };
        if (filter) {
            const m = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
            if (m) {
                where.email = m[1];
            }
        }

        const [total, users] = await Promise.all([
            prisma.user.count({ where }),
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    name: true,
                    active: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: { createdAt: 'asc' },
                skip: startIndex - 1,
                take: count,
            }),
        ]);

        const body = {
            schemas: [LIST_SCHEMA],
            totalResults: total,
            startIndex,
            itemsPerPage: users.length,
            Resources: users.map(toScimUser),
        };

        return NextResponse.json(body, {
            status: 200,
            headers: { 'Content-Type': SCIM_CONTENT_TYPE },
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
        const authed = await authenticate(req);
        if (!authed) {
            return scimError(401, 'Uautorisert');
        }
        if (!(await scimFeatureAllowed(authed.tenantId))) {
            return scimError(403, 'SCIM er ikke tilgjengelig for denne organisasjonen');
        }

        let payload: ScimUserPayload;
        try {
            payload = (await req.json()) as ScimUserPayload;
        } catch {
            return scimError(400, 'Ugyldig forespørsel');
        }

        // userName/email er påkrevd.
        const primaryEmail = payload.emails?.find((e) => e.primary)?.value;
        const anyEmail = payload.emails?.find((e) => !!e.value)?.value;
        const email = (payload.userName || primaryEmail || anyEmail || '').trim().toLowerCase();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return scimError(400, 'userName/email er påkrevd og må være gyldig');
        }

        // Unikhet: User.email er globalt unikt i schema.
        const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true, tenantId: true },
        });
        if (existing) {
            // SCIM 409 ved konflikt – ikke avslør hvilken tenant brukeren er i.
            return scimError(409, 'Bruker finnes allerede');
        }

        const created = await prisma.user.create({
            data: {
                email,
                firstName: payload.name?.givenName?.trim() || null,
                lastName: payload.name?.familyName?.trim() || null,
                externalId: payload.externalId?.trim() || null,
                active: payload.active ?? true,
                globalRole: 'USER',
                tenantId: authed.tenantId,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                name: true,
                active: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Audit-logg provisjonering – best effort.
        try {
            await prisma.auditLog.create({
                data: {
                    tenantId: authed.tenantId,
                    action: 'scim.user_provisioned',
                    targetType: 'user',
                    targetId: created.id,
                    metadata: { via: 'scim', tokenId: authed.tokenId },
                },
            });
        } catch {
            // Ignorer logging-feil.
        }

        return NextResponse.json(toScimUser(created), {
            status: 201,
            headers: {
                'Content-Type': SCIM_CONTENT_TYPE,
                Location: `${new URL(req.url).origin}/api/scim/v2/Users/${created.id}`,
            },
        });
    } catch {
        return scimError(500, 'Intern feil');
    }
}
