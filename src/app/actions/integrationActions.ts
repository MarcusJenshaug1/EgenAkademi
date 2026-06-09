'use server';

import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';
import { sendWebhook, type WebhookRecord } from '@/lib/webhooks';
import { WEBHOOK_EVENTS } from '@/lib/webhookEvents';

// ── Helpers ─────────────────────────────────────────────────

async function requireTenantAdmin() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    return {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        email: session.user.email ?? null,
    };
}

/**
 * Henter tenant-plan + gjør feature-gating på serveren. Kastes ikke videre
 * til generisk catch – returnerer { error } som kaller-funksjonen propagerer.
 */
async function gate(
    tenantId: string,
    feature: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) return { ok: false, error: 'Organisasjon ikke funnet' };

    const access = checkAccess(tenant, feature);
    if (!access.allowed) {
        return { ok: false, error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };
    }
    return { ok: true };
}

function sha256Hex(value: string): string {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function isHttpsUrl(value: string): boolean {
    try {
        const u = new URL(value);
        return u.protocol === 'https:';
    } catch {
        return false;
    }
}

// ════════════════════════════════════════════════════════════
// SSO (SAML)
// ════════════════════════════════════════════════════════════

export interface SsoConnectionData {
    id: string;
    protocol: string;
    enabled: boolean;
    idpEntityId: string | null;
    idpSsoUrl: string | null;
    idpCertificate: string | null;
    spEntityId: string | null;
    attributeMapping: Record<string, string> | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getSsoConnection(): Promise<
    { connection: SsoConnectionData | null } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const g = await gate(tenantId, 'sso-saml');
        if (!g.ok) return { error: g.error };

        const conn = await prisma.ssoConnection.findUnique({ where: { tenantId } });
        if (!conn) return { connection: null };

        return {
            connection: {
                id: conn.id,
                protocol: conn.protocol,
                enabled: conn.enabled,
                idpEntityId: conn.idpEntityId,
                idpSsoUrl: conn.idpSsoUrl,
                idpCertificate: conn.idpCertificate,
                spEntityId: conn.spEntityId,
                attributeMapping: (conn.attributeMapping as Record<string, string> | null) ?? null,
                createdAt: conn.createdAt,
                updatedAt: conn.updatedAt,
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function upsertSsoConnection(data: {
    idpEntityId?: string;
    idpSsoUrl?: string;
    idpCertificate?: string;
    spEntityId?: string;
    attributeMapping?: Record<string, string>;
}): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'sso-saml');
        if (!g.ok) return { error: g.error };

        // Lett validering – SSO-URL må være https hvis satt.
        if (data.idpSsoUrl && data.idpSsoUrl.trim() && !isHttpsUrl(data.idpSsoUrl.trim())) {
            return { error: 'IdP SSO-URL må være en gyldig https-adresse' };
        }

        const existing = await prisma.ssoConnection.findUnique({
            where: { tenantId },
            select: { id: true },
        });

        await prisma.ssoConnection.upsert({
            where: { tenantId },
            create: {
                tenantId,
                protocol: 'SAML',
                idpEntityId: data.idpEntityId?.trim() || null,
                idpSsoUrl: data.idpSsoUrl?.trim() || null,
                // idpCertificate er en offentlig X.509-cert (PEM) – lagres som-er.
                idpCertificate: data.idpCertificate?.trim() || null,
                spEntityId: data.spEntityId?.trim() || null,
                attributeMapping: data.attributeMapping ?? undefined,
            },
            update: {
                idpEntityId: data.idpEntityId?.trim() || null,
                idpSsoUrl: data.idpSsoUrl?.trim() || null,
                idpCertificate: data.idpCertificate?.trim() || null,
                spEntityId: data.spEntityId?.trim() || null,
                attributeMapping: data.attributeMapping ?? undefined,
            },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: existing ? 'sso.updated' : 'sso.created',
            targetType: 'sso_connection',
            metadata: { protocol: 'SAML' },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function setSsoEnabled(
    enabled: boolean
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'sso-saml');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.ssoConnection.findUnique({
            where: { tenantId },
            select: { id: true, idpEntityId: true, idpSsoUrl: true, idpCertificate: true },
        });
        if (!existing) {
            return { error: 'Konfigurer SSO før du aktiverer den' };
        }
        if (
            enabled &&
            (!existing.idpEntityId || !existing.idpSsoUrl || !existing.idpCertificate)
        ) {
            return { error: 'IdP Entity ID, SSO-URL og sertifikat må være satt før aktivering' };
        }

        await prisma.ssoConnection.update({
            where: { tenantId },
            data: { enabled },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: enabled ? 'sso.enabled' : 'sso.disabled',
            targetType: 'sso_connection',
            targetId: existing.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ════════════════════════════════════════════════════════════
// SCIM
// ════════════════════════════════════════════════════════════

export interface ScimTokenListItem {
    id: string;
    name: string;
    tokenPrefix: string;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
}

export async function listScimTokens(): Promise<
    { tokens: ScimTokenListItem[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const g = await gate(tenantId, 'scim');
        if (!g.ok) return { error: g.error };

        const rows = await prisma.scimToken.findMany({
            where: { tenantId },
            // ALDRI selecte tokenHash – skal aldri ut til klienten.
            select: {
                id: true,
                name: true,
                tokenPrefix: true,
                lastUsedAt: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return { tokens: rows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function createScimToken(
    name: string,
    expiresAt?: string | null
): Promise<
    | { success: true; plaintext: string; warning: string; token: ScimTokenListItem }
    | { error: string }
> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'scim');
        if (!g.ok) return { error: g.error };

        if (!name || name.trim().length < 2) {
            return { error: 'Tokennavn må være minst 2 tegn' };
        }

        let expires: Date | null = null;
        if (expiresAt) {
            const d = new Date(expiresAt);
            if (Number.isNaN(d.getTime())) {
                return { error: 'Ugyldig utløpsdato' };
            }
            expires = d;
        }

        // Generer 32 tilfeldige bytes → base64url. Klartekst vises kun én gang.
        const raw = crypto.randomBytes(32).toString('base64url');
        const plaintext = `scim_${raw}`;
        const tokenHash = sha256Hex(plaintext);
        const tokenPrefix = `${plaintext.slice(0, 12)}…`;

        const created = await prisma.scimToken.create({
            data: {
                tenantId,
                name: name.trim(),
                tokenHash,
                tokenPrefix,
                expiresAt: expires,
            },
            select: {
                id: true,
                name: true,
                tokenPrefix: true,
                lastUsedAt: true,
                expiresAt: true,
                revokedAt: true,
                createdAt: true,
            },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'scim.token_created',
            targetType: 'scim_token',
            targetId: created.id,
            metadata: { name: created.name },
        });

        return {
            success: true,
            plaintext,
            warning:
                'Kopier tokenet nå. Det vises kun denne ene gangen og kan ikke hentes frem igjen.',
            token: created,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function revokeScimToken(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'scim');
        if (!g.ok) return { error: g.error };

        const token = await prisma.scimToken.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true, revokedAt: true },
        });
        if (!token) return { error: 'Token ikke funnet' };
        if (token.revokedAt) return { error: 'Tokenet er allerede tilbakekalt' };

        await prisma.scimToken.update({
            where: { id: token.id },
            data: { revokedAt: new Date() },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'scim.token_revoked',
            targetType: 'scim_token',
            targetId: token.id,
            metadata: { name: token.name },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ════════════════════════════════════════════════════════════
// WEBHOOKS
// ════════════════════════════════════════════════════════════

export interface WebhookListItem {
    id: string;
    url: string;
    events: string[];
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface WebhookDeliveryItem {
    id: string;
    event: string;
    statusCode: number | null;
    success: boolean;
    error: string | null;
    createdAt: Date;
}

function validateEvents(events: string[]): string[] | null {
    if (!Array.isArray(events) || events.length === 0) return null;
    const allowed = new Set<string>(WEBHOOK_EVENTS as readonly string[]);
    const cleaned = Array.from(new Set(events)).filter((e) => allowed.has(e));
    return cleaned.length > 0 ? cleaned : null;
}

export async function listWebhooks(): Promise<
    { webhooks: WebhookListItem[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        const rows = await prisma.webhook.findMany({
            where: { tenantId },
            // secret aldri ut til klienten etter opprettelse.
            select: {
                id: true,
                url: true,
                events: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return { webhooks: rows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function createWebhook(
    url: string,
    events: string[]
): Promise<
    { success: true; secret: string; warning: string; webhook: WebhookListItem } | { error: string }
> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        const trimmed = (url ?? '').trim();
        if (!isHttpsUrl(trimmed)) {
            return { error: 'Webhook-URL må være en gyldig https-adresse' };
        }
        const cleanedEvents = validateEvents(events);
        if (!cleanedEvents) {
            return { error: 'Velg minst én gyldig hendelse' };
        }

        const secret = crypto.randomBytes(24).toString('hex');

        const created = await prisma.webhook.create({
            data: {
                tenantId,
                url: trimmed,
                secret,
                events: cleanedEvents,
                enabled: true,
            },
            select: {
                id: true,
                url: true,
                events: true,
                enabled: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'webhook.created',
            targetType: 'webhook',
            targetId: created.id,
            metadata: { url: created.url, events: created.events },
        });

        return {
            success: true,
            secret,
            warning:
                'Kopier signeringsnøkkelen nå. Den vises kun denne ene gangen og brukes til å verifisere HMAC-signaturen.',
            webhook: created,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function updateWebhook(
    id: string,
    data: { url?: string; events?: string[] }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.webhook.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'Webhook ikke funnet' };

        const update: { url?: string; events?: string[] } = {};

        if (data.url !== undefined) {
            const trimmed = data.url.trim();
            if (!isHttpsUrl(trimmed)) {
                return { error: 'Webhook-URL må være en gyldig https-adresse' };
            }
            update.url = trimmed;
        }
        if (data.events !== undefined) {
            const cleanedEvents = validateEvents(data.events);
            if (!cleanedEvents) {
                return { error: 'Velg minst én gyldig hendelse' };
            }
            update.events = cleanedEvents;
        }

        await prisma.webhook.update({ where: { id: existing.id }, data: update });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'webhook.updated',
            targetType: 'webhook',
            targetId: existing.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function setWebhookEnabled(
    id: string,
    enabled: boolean
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.webhook.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'Webhook ikke funnet' };

        await prisma.webhook.update({ where: { id: existing.id }, data: { enabled } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: enabled ? 'webhook.enabled' : 'webhook.disabled',
            targetType: 'webhook',
            targetId: existing.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteWebhook(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.webhook.findFirst({
            where: { id, tenantId },
            select: { id: true, url: true },
        });
        if (!existing) return { error: 'Webhook ikke funnet' };

        // Leveringene har onDelete: Cascade i schema, men vi sletter eksplisitt
        // for å være robuste uavhengig av database-konfig.
        await prisma.webhookDelivery.deleteMany({ where: { webhookId: existing.id } });
        await prisma.webhook.delete({ where: { id: existing.id } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'webhook.deleted',
            targetType: 'webhook',
            targetId: existing.id,
            metadata: { url: existing.url },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function listRecentDeliveries(
    webhookId: string
): Promise<{ deliveries: WebhookDeliveryItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        // Verifiser at webhooken tilhører tenanten før vi henter leveringer.
        const webhook = await prisma.webhook.findFirst({
            where: { id: webhookId, tenantId },
            select: { id: true },
        });
        if (!webhook) return { error: 'Webhook ikke funnet' };

        const rows = await prisma.webhookDelivery.findMany({
            where: { tenantId, webhookId: webhook.id },
            select: {
                id: true,
                event: true,
                statusCode: true,
                success: true,
                error: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });

        return { deliveries: rows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function sendTestWebhook(
    webhookId: string
): Promise<{ success: true; ok: boolean; statusCode?: number } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'webhooks');
        if (!g.ok) return { error: g.error };

        const webhook = await prisma.webhook.findFirst({
            where: { id: webhookId, tenantId },
            select: {
                id: true,
                tenantId: true,
                url: true,
                secret: true,
                events: true,
                enabled: true,
            },
        });
        if (!webhook) return { error: 'Webhook ikke funnet' };

        const record: WebhookRecord = {
            id: webhook.id,
            tenantId: webhook.tenantId,
            url: webhook.url,
            secret: webhook.secret,
            events: webhook.events,
            enabled: webhook.enabled,
        };

        const result = await sendWebhook(record, 'ping', {
            message: 'Test-levering fra EgenAkademi',
            triggeredBy: email,
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'webhook.test_sent',
            targetType: 'webhook',
            targetId: webhook.id,
            metadata: { ok: result.ok, statusCode: result.statusCode ?? null },
        });

        return { success: true, ok: result.ok, statusCode: result.statusCode };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ════════════════════════════════════════════════════════════
// LTI
// ════════════════════════════════════════════════════════════

export interface LtiPlatformItem {
    id: string;
    name: string;
    issuer: string;
    clientId: string;
    authUrl: string | null;
    jwksUrl: string | null;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLtiPlatforms(): Promise<
    { platforms: LtiPlatformItem[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const g = await gate(tenantId, 'lti');
        if (!g.ok) return { error: g.error };

        const rows = await prisma.ltiPlatform.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
        });

        return { platforms: rows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function createLtiPlatform(data: {
    name: string;
    issuer: string;
    clientId: string;
    authUrl?: string;
    jwksUrl?: string;
}): Promise<{ success: true; platformId: string } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'lti');
        if (!g.ok) return { error: g.error };

        if (!data.name || data.name.trim().length < 2) {
            return { error: 'Plattformnavn må være minst 2 tegn' };
        }
        if (!data.issuer || !data.issuer.trim()) {
            return { error: 'Issuer er påkrevd' };
        }
        if (!data.clientId || !data.clientId.trim()) {
            return { error: 'Client ID er påkrevd' };
        }
        if (data.authUrl && data.authUrl.trim() && !isHttpsUrl(data.authUrl.trim())) {
            return { error: 'Auth-URL må være en gyldig https-adresse' };
        }
        if (data.jwksUrl && data.jwksUrl.trim() && !isHttpsUrl(data.jwksUrl.trim())) {
            return { error: 'JWKS-URL må være en gyldig https-adresse' };
        }

        const created = await prisma.ltiPlatform.create({
            data: {
                tenantId,
                name: data.name.trim(),
                issuer: data.issuer.trim(),
                clientId: data.clientId.trim(),
                authUrl: data.authUrl?.trim() || null,
                jwksUrl: data.jwksUrl?.trim() || null,
                enabled: false,
            },
            select: { id: true, name: true },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'lti.platform_created',
            targetType: 'lti_platform',
            targetId: created.id,
            metadata: { name: created.name },
        });

        return { success: true, platformId: created.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function updateLtiPlatform(
    id: string,
    data: {
        name?: string;
        issuer?: string;
        clientId?: string;
        authUrl?: string | null;
        jwksUrl?: string | null;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'lti');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.ltiPlatform.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'LTI-plattform ikke funnet' };

        const update: {
            name?: string;
            issuer?: string;
            clientId?: string;
            authUrl?: string | null;
            jwksUrl?: string | null;
        } = {};

        if (data.name !== undefined) {
            if (data.name.trim().length < 2) return { error: 'Plattformnavn må være minst 2 tegn' };
            update.name = data.name.trim();
        }
        if (data.issuer !== undefined) {
            if (!data.issuer.trim()) return { error: 'Issuer er påkrevd' };
            update.issuer = data.issuer.trim();
        }
        if (data.clientId !== undefined) {
            if (!data.clientId.trim()) return { error: 'Client ID er påkrevd' };
            update.clientId = data.clientId.trim();
        }
        if (data.authUrl !== undefined) {
            const v = data.authUrl?.trim() || '';
            if (v && !isHttpsUrl(v)) return { error: 'Auth-URL må være en gyldig https-adresse' };
            update.authUrl = v || null;
        }
        if (data.jwksUrl !== undefined) {
            const v = data.jwksUrl?.trim() || '';
            if (v && !isHttpsUrl(v)) return { error: 'JWKS-URL må være en gyldig https-adresse' };
            update.jwksUrl = v || null;
        }

        await prisma.ltiPlatform.update({ where: { id: existing.id }, data: update });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'lti.platform_updated',
            targetType: 'lti_platform',
            targetId: existing.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function setLtiEnabled(
    id: string,
    enabled: boolean
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'lti');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.ltiPlatform.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!existing) return { error: 'LTI-plattform ikke funnet' };

        await prisma.ltiPlatform.update({ where: { id: existing.id }, data: { enabled } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: enabled ? 'lti.platform_enabled' : 'lti.platform_disabled',
            targetType: 'lti_platform',
            targetId: existing.id,
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

export async function deleteLtiPlatform(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();
        const g = await gate(tenantId, 'lti');
        if (!g.ok) return { error: g.error };

        const existing = await prisma.ltiPlatform.findFirst({
            where: { id, tenantId },
            select: { id: true, name: true },
        });
        if (!existing) return { error: 'LTI-plattform ikke funnet' };

        await prisma.ltiPlatform.delete({ where: { id: existing.id } });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'lti.platform_deleted',
            targetType: 'lti_platform',
            targetId: existing.id,
            metadata: { name: existing.name },
        });

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ════════════════════════════════════════════════════════════
// AUDIT-LOGG
// ════════════════════════════════════════════════════════════

export interface AuditLogItem {
    id: string;
    actorEmail: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ip: string | null;
    createdAt: Date;
}

export async function listAuditLogs(filter?: {
    action?: string;
    search?: string;
    limit?: number;
}): Promise<{ logs: AuditLogItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();
        const g = await gate(tenantId, 'audit-logging');
        if (!g.ok) return { error: g.error };

        const limit = Math.min(Math.max(filter?.limit ?? 100, 1), 500);

        const where: Record<string, unknown> = { tenantId };

        if (filter?.action && filter.action.trim()) {
            where.action = filter.action.trim();
        }
        if (filter?.search && filter.search.trim()) {
            const term = filter.search.trim();
            where.OR = [
                { actorEmail: { contains: term, mode: 'insensitive' } },
                { action: { contains: term, mode: 'insensitive' } },
                { targetType: { contains: term, mode: 'insensitive' } },
                { targetId: { contains: term, mode: 'insensitive' } },
            ];
        }

        const rows = await prisma.auditLog.findMany({
            where,
            select: {
                id: true,
                actorEmail: true,
                action: true,
                targetType: true,
                targetId: true,
                ip: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return { logs: rows };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
