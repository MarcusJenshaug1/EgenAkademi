import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * EgenAkademi – Delt SCIM 2.0-autentisering og hjelpere.
 *
 * Sikkerhet:
 *  - Bearer-token autentiseres ved å sha256-hashe det presenterte tokenet og
 *    slå opp en `ScimToken`-rad med samme `tokenHash` som ikke er tilbakekalt
 *    eller utløpt.
 *  - Tokenet (klartekst) logges ALDRI noe sted, og hashen returneres aldri.
 *  - Et gyldig token er ikke nok: tenanten må fortsatt ha 'scim'-funksjonen i
 *    planen (nedgradering / utløpt prøveperiode stenger provisjonering selv om
 *    tokenet ikke er tilbakekalt).
 *  - Alle feil returneres som generiske SCIM-feil – ingen interne detaljer,
 *    stack traces eller filstier lekkes til klienten.
 *  - CORS settes ALDRI til '*'.
 *  - Rate limiting håndheves per tenant rett etter autentisering.
 */

export const SCIM_CONTENT_TYPE = 'application/scim+json';

export const SCIM_SCHEMAS = {
    USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
    GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
    LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
    ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
    PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
    SERVICE_PROVIDER_CONFIG:
        'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
    RESOURCE_TYPE: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
    SCHEMA: 'urn:ietf:params:scim:schemas:core:2.0:Schema',
} as const;

// Rate-limit-grenser for SCIM (per tenant, fast vindu).
const SCIM_RATE_MAX = 120;
const SCIM_RATE_WINDOW_MS = 60_000;

function sha256Hex(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Bygg en generisk SCIM-feilrespons. `scimType` er valgfri (RFC 7644 §3.12),
 * f.eks. 'invalidFilter', 'invalidValue', 'uniqueness', 'mutability'.
 */
export function scimError(
    status: number,
    detail: string,
    scimType?: string,
): NextResponse {
    const body: Record<string, unknown> = {
        schemas: [SCIM_SCHEMAS.ERROR],
        detail,
        status: String(status),
    };
    if (scimType) body.scimType = scimType;
    return NextResponse.json(body, {
        status,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE },
    });
}

/** Standard JSON-respons for vellykkede SCIM-svar (aldri CORS '*'). */
export function scimJson(body: unknown, status = 200, extraHeaders?: Record<string, string>): NextResponse {
    return NextResponse.json(body, {
        status,
        headers: { 'Content-Type': SCIM_CONTENT_TYPE, ...(extraHeaders ?? {}) },
    });
}

export interface ScimAuthContext {
    tenantId: string;
    tokenId: string;
}

/**
 * Resultat av `authenticateScim`. Enten en gyldig kontekst, eller en ferdig
 * NextResponse-feil (401/403/429) som kalleren skal returnere uendret.
 */
export type ScimAuthResult =
    | { ok: true; context: ScimAuthContext }
    | { ok: false; response: NextResponse };

/**
 * Autentiser en SCIM-forespørsel via Bearer-token, plan-gate på 'scim', og
 * håndhev rate limiting per tenant. Brukes i ALLE autentiserte SCIM-ruter.
 *
 * Returnerer enten `{ ok: true, context }` eller `{ ok: false, response }`
 * der `response` er en ferdig SCIM-feil (401/403/429) som skal returneres
 * direkte til klienten.
 *
 * Bivirkning: oppdaterer `lastUsedAt` på tokenet (best effort).
 */
export async function authenticateScim(req: NextRequest): Promise<ScimAuthResult> {
    const header = req.headers.get('authorization');
    if (!header) {
        return { ok: false, response: scimError(401, 'Uautorisert') };
    }

    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
        return { ok: false, response: scimError(401, 'Uautorisert') };
    }

    const presented = match[1].trim();
    if (!presented) {
        return { ok: false, response: scimError(401, 'Uautorisert') };
    }

    // Hash tokenet og slå opp – klartekst lagres aldri og logges aldri.
    const tokenHash = sha256Hex(presented);

    let token: { id: string; tenantId: string; revokedAt: Date | null; expiresAt: Date | null } | null;
    try {
        token = await prisma.scimToken.findUnique({
            where: { tokenHash },
            select: { id: true, tenantId: true, revokedAt: true, expiresAt: true },
        });
    } catch {
        // Ikke lekk interne feil – behandle som uautorisert.
        return { ok: false, response: scimError(401, 'Uautorisert') };
    }

    if (!token) return { ok: false, response: scimError(401, 'Uautorisert') };
    if (token.revokedAt) return { ok: false, response: scimError(401, 'Uautorisert') };
    if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
        return { ok: false, response: scimError(401, 'Uautorisert') };
    }

    // Oppdater lastUsedAt – best effort, skal ikke velte forespørselen.
    try {
        await prisma.scimToken.update({
            where: { id: token.id },
            data: { lastUsedAt: new Date() },
        });
    } catch {
        // Ignorer – aldri console-logging i kode som shipper.
    }

    // Plan-gate SCIM på serveren (et gyldig token er ikke nok).
    if (!(await scimFeatureAllowed(token.tenantId))) {
        return {
            ok: false,
            response: scimError(403, 'SCIM er ikke tilgjengelig for denne organisasjonen'),
        };
    }

    // Rate limiting per tenant – håndheves rett etter autentisering.
    const limit = await checkRateLimit(`scim:${token.tenantId}`, SCIM_RATE_MAX, SCIM_RATE_WINDOW_MS);
    if (!limit.allowed) {
        const retryAfterSec = Math.ceil(limit.retryAfterMs / 1000);
        const response = scimError(429, 'For mange forespørsler. Prøv igjen senere.', 'tooMany');
        response.headers.set('Retry-After', String(Math.max(1, retryAfterSec)));
        return { ok: false, response };
    }

    return { ok: true, context: { tenantId: token.tenantId, tokenId: token.id } };
}

/**
 * Plan-gate SCIM på serveren. Tenanten må ha 'scim'-funksjonen i planen.
 */
async function scimFeatureAllowed(tenantId: string): Promise<boolean> {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { plan: true, addons: true, trialEndsAt: true },
        });
        if (!tenant) return false;
        return checkAccess(tenant, 'scim').allowed;
    } catch {
        return false;
    }
}
