import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateScim, scimError, scimJson } from '@/lib/scimAuth';
import { logAudit } from '@/lib/audit';
import { toScimUser } from '@/lib/scimResources';

/**
 * SCIM 2.0 – enkelt User-ressurs (GET / PUT / PATCH / DELETE).
 *
 * Alt er tenant-scopet til tokenets tenant. Auth, plan-gating og rate limiting
 * via `authenticateScim`. Generiske SCIM-feil; tokenet logges aldri; CORS aldri '*'.
 *
 * PATCH støtter RFC 7644-operasjoner (replace) for: active,
 * name.givenName/familyName, userName/emails. Path-uttrykk er delvis støttet
 * (se followups). DELETE er deprovisjonering (active=false), ALDRI hard-delete.
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

interface UserUpdateData {
    firstName?: string | null;
    lastName?: string | null;
    active?: boolean;
    email?: string;
    externalId?: string | null;
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ── GET /api/scim/v2/Users/[id] ─────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId } = auth.context;
        const { id } = await params;

        const user = await prisma.user.findFirst({
            where: { id, tenantId },
            select: USER_SELECT,
        });
        if (!user) return scimError(404, 'Bruker ikke funnet');

        return scimJson(toScimUser(user, new URL(req.url).origin));
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── PUT /api/scim/v2/Users/[id] (replace) ───────────────────

interface ScimUserReplacePayload {
    userName?: string;
    active?: boolean;
    externalId?: string;
    name?: { givenName?: string; familyName?: string };
    emails?: { value?: string; primary?: boolean }[];
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;
        const { id } = await params;

        const existing = await prisma.user.findFirst({
            where: { id, tenantId },
            select: { id: true, email: true },
        });
        if (!existing) return scimError(404, 'Bruker ikke funnet');

        let payload: ScimUserReplacePayload;
        try {
            payload = (await req.json()) as ScimUserReplacePayload;
        } catch {
            return scimError(400, 'Ugyldig forespørsel', 'invalidValue');
        }

        const data: UserUpdateData = {
            firstName: payload.name?.givenName?.trim() || null,
            lastName: payload.name?.familyName?.trim() || null,
            active: payload.active ?? true,
            externalId: payload.externalId?.trim() || null,
        };

        // userName-replace → e-post. Valider og sjekk unikhet ved endring.
        const primaryEmail = payload.emails?.find((e) => e.primary)?.value;
        const newEmail = (payload.userName || primaryEmail || '').trim().toLowerCase();
        if (newEmail && newEmail !== existing.email) {
            if (!isValidEmail(newEmail)) {
                return scimError(400, 'userName/email må være gyldig', 'invalidValue');
            }
            const clash = await prisma.user.findUnique({
                where: { email: newEmail },
                select: { id: true },
            });
            if (clash && clash.id !== id) {
                return scimError(409, 'E-post er allerede i bruk', 'uniqueness');
            }
            data.email = newEmail;
        }

        const updated = await prisma.user.update({
            where: { id },
            data,
            select: USER_SELECT,
        });

        await logAudit({
            tenantId,
            action: 'scim.user_updated',
            targetType: 'user',
            targetId: id,
            metadata: { via: 'scim', op: 'replace', tokenId },
        });

        return scimJson(toScimUser(updated, new URL(req.url).origin));
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── PATCH /api/scim/v2/Users/[id] (RFC 7644 partial) ────────

interface ScimPatchOperation {
    op?: string;
    path?: string;
    value?: unknown;
}

interface ScimPatchPayload {
    schemas?: string[];
    Operations?: ScimPatchOperation[];
}

/**
 * Bygg oppdateringsdata fra én PATCH-operasjon. Returnerer false hvis verdien
 * er ugyldig (kalleren skal da returnere en feil). Path-uttrykk er delvis
 * støttet: active, userName, name.givenName, name.familyName, samt verdiløs
 * replace med et objekt ({ active, userName, name: {...} }).
 */
function applyOperation(
    op: ScimPatchOperation,
    data: UserUpdateData,
): { ok: true } | { ok: false; detail: string } {
    const verb = (op.op ?? '').toLowerCase();
    // SCIM bruker 'add' og 'replace' nær identisk for enkle skalarfelter her.
    if (verb !== 'replace' && verb !== 'add') {
        if (verb === 'remove') {
            // 'remove' på enkle felter: tøm navn / deaktiver er ikke standard;
            // vi godtar remove av name-felter ved å nulle dem.
            const path = (op.path ?? '').toLowerCase();
            if (path === 'name.givenname') { data.firstName = null; return { ok: true }; }
            if (path === 'name.familyname') { data.lastName = null; return { ok: true }; }
            return { ok: true }; // Ignorer ukjente remove-stier (delvis path-støtte).
        }
        return { ok: false, detail: 'Operasjonen støttes ikke' };
    }

    const path = (op.path ?? '').toLowerCase();

    // Path-løs operasjon: value er et objekt med flere attributter.
    if (!path) {
        const v = op.value;
        if (typeof v !== 'object' || v === null) {
            return { ok: false, detail: 'value må være et objekt når path mangler' };
        }
        const obj = v as Record<string, unknown>;
        if ('active' in obj) {
            if (typeof obj.active !== 'boolean') return { ok: false, detail: 'active må være boolean' };
            data.active = obj.active;
        }
        if ('userName' in obj && typeof obj.userName === 'string') {
            data.email = obj.userName.trim().toLowerCase();
        }
        if ('name' in obj && typeof obj.name === 'object' && obj.name !== null) {
            const n = obj.name as Record<string, unknown>;
            if (typeof n.givenName === 'string') data.firstName = n.givenName.trim() || null;
            if (typeof n.familyName === 'string') data.lastName = n.familyName.trim() || null;
        }
        return { ok: true };
    }

    // Path-baserte operasjoner (delvis grammatikk-støtte).
    const value = op.value;
    switch (path) {
        case 'active': {
            // IdP-er sender ofte boolean eller streng "True"/"False".
            if (typeof value === 'boolean') { data.active = value; return { ok: true }; }
            if (typeof value === 'string') {
                data.active = value.toLowerCase() === 'true';
                return { ok: true };
            }
            return { ok: false, detail: 'active må være boolean' };
        }
        case 'username': {
            if (typeof value !== 'string') return { ok: false, detail: 'userName må være streng' };
            data.email = value.trim().toLowerCase();
            return { ok: true };
        }
        case 'name.givenname': {
            data.firstName = typeof value === 'string' ? value.trim() || null : null;
            return { ok: true };
        }
        case 'name.familyname': {
            data.lastName = typeof value === 'string' ? value.trim() || null : null;
            return { ok: true };
        }
        case 'externalid': {
            data.externalId = typeof value === 'string' ? value.trim() || null : null;
            return { ok: true };
        }
        default:
            // Delvis path-støtte: ignorer ukjente stier i stedet for å feile hardt.
            return { ok: true };
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;
        const { id } = await params;

        const existing = await prisma.user.findFirst({
            where: { id, tenantId },
            select: { id: true, email: true },
        });
        if (!existing) return scimError(404, 'Bruker ikke funnet');

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

        const data: UserUpdateData = {};
        for (const op of ops) {
            const result = applyOperation(op, data);
            if (!result.ok) return scimError(400, result.detail, 'invalidValue');
        }

        // Hvis e-post endres: valider og sjekk unikhet.
        if (data.email !== undefined && data.email !== existing.email) {
            if (!isValidEmail(data.email)) {
                return scimError(400, 'userName/email må være gyldig', 'invalidValue');
            }
            const clash = await prisma.user.findUnique({
                where: { email: data.email },
                select: { id: true },
            });
            if (clash && clash.id !== id) {
                return scimError(409, 'E-post er allerede i bruk', 'uniqueness');
            }
        } else if (data.email !== undefined) {
            // Uendret e-post – ikke skriv den på nytt.
            delete data.email;
        }

        const updated = await prisma.user.update({
            where: { id },
            data,
            select: USER_SELECT,
        });

        await logAudit({
            tenantId,
            action: 'scim.user_updated',
            targetType: 'user',
            targetId: id,
            metadata: { via: 'scim', op: 'patch', tokenId },
        });

        return scimJson(toScimUser(updated, new URL(req.url).origin));
    } catch {
        return scimError(500, 'Intern feil');
    }
}

// ── DELETE /api/scim/v2/Users/[id] (deprovision) ────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await authenticateScim(req);
        if (!auth.ok) return auth.response;
        const { tenantId, tokenId } = auth.context;
        const { id } = await params;

        const existing = await prisma.user.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return scimError(404, 'Bruker ikke funnet');

        // Deprovisjonering = deaktiver, ALDRI hard-delete (bevarer historikk).
        await prisma.user.update({
            where: { id },
            data: { active: false },
        });

        await logAudit({
            tenantId,
            action: 'scim.user_deprovisioned',
            targetType: 'user',
            targetId: id,
            metadata: { via: 'scim', tokenId },
        });

        // SCIM 204 No Content ved vellykket sletting/deprovisjonering.
        return new Response(null, { status: 204 });
    } catch {
        return scimError(500, 'Intern feil');
    }
}
