import 'server-only';

import crypto from 'crypto';
import prisma from '@/lib/prisma';

/**
 * EgenAkademi – Webhook-signering og -levering
 *
 * Server-only. Aldri 'use client'.
 *
 * Payloads signeres med HMAC-SHA256 over den eksakte JSON-strengen som
 * sendes i body. Mottakeren verifiserer ved å reberegne HMAC med sin
 * delte hemmelighet og sammenligne med 'X-EgenAkademi-Signature'-headeren.
 */

export interface WebhookRecord {
    id: string;
    tenantId: string;
    url: string;
    secret: string;
    events: string[];
    enabled: boolean;
}

export interface SendWebhookResult {
    ok: boolean;
    statusCode?: number;
    error?: string;
}

const SIGNATURE_HEADER = 'X-EgenAkademi-Signature';
const TIMEOUT_MS = 5000;

/**
 * Beregn HMAC-SHA256 (hex) over body med den gitte hemmeligheten.
 */
export function signPayload(secret: string, body: string): string {
    return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Send en webhook-event til mottakeren og registrer en WebhookDelivery-rad.
 *
 * Kaster ALDRI videre til den som kaller – alle feil fanges og returneres
 * som { ok: false, error }. Ingen interne feilmeldinger lekkes utover en
 * trygg, generisk streng.
 */
export async function sendWebhook(
    webhook: WebhookRecord,
    event: string,
    payloadObj: unknown
): Promise<SendWebhookResult> {
    const envelope = {
        event,
        webhookId: webhook.id,
        timestamp: new Date().toISOString(),
        data: payloadObj,
    };
    const body = JSON.stringify(envelope);
    const signature = signPayload(webhook.secret, body);

    let statusCode: number | undefined;
    let ok = false;
    let errorMessage: string | undefined;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const res = await fetch(webhook.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'EgenAkademi-Webhook/1.0',
                [SIGNATURE_HEADER]: `sha256=${signature}`,
                'X-EgenAkademi-Event': event,
            },
            body,
            signal: controller.signal,
        });
        statusCode = res.status;
        ok = res.ok;
        if (!ok) {
            errorMessage = `HTTP ${res.status}`;
        }
    } catch {
        // Nettverksfeil, timeout, ugyldig URL osv. – aldri lekk detaljer.
        ok = false;
        errorMessage = 'Levering feilet';
    } finally {
        clearTimeout(timeout);
    }

    // Registrer leveringsforsøket. Selve loggingen skal aldri velte kallet.
    try {
        await prisma.webhookDelivery.create({
            data: {
                tenantId: webhook.tenantId,
                webhookId: webhook.id,
                event,
                payload: envelope as object,
                statusCode: statusCode ?? null,
                success: ok,
                error: errorMessage ?? null,
            },
        });
    } catch {
        // Swallow – leveringen kan ha lyktes selv om logging feilet.
    }

    return { ok, statusCode, error: errorMessage };
}

/**
 * Send en hendelse til alle aktiverte webhooks i tenanten som abonnerer på
 * den gitte event-typen.
 *
 * Dette er en "fire-and-forget"-funksjon: den kalles etter at en server action
 * allerede har fullført sin DB-skriving, og skal ALDRI velte den handlingen.
 * Alle feil – inkludert oppslag av webhooks og selve leveringen – fanges og
 * svelges. Funksjonen kaster aldri og returnerer alltid void.
 */
export async function dispatchWebhookEvent(
    tenantId: string,
    event: string,
    payload: object
): Promise<void> {
    try {
        const webhooks = await prisma.webhook.findMany({
            where: {
                tenantId,
                enabled: true,
                events: { has: event },
            },
            select: {
                id: true,
                tenantId: true,
                url: true,
                secret: true,
                events: true,
                enabled: true,
            },
        });

        // Lever til hver matchende webhook uavhengig av hverandre. En feilende
        // levering (eller en avvist promise) skal aldri stoppe de øvrige.
        await Promise.allSettled(
            webhooks.map((webhook) => sendWebhook(webhook, event, payload))
        );
    } catch {
        // Svelg alt: webhook-utsending er en best-effort sideeffekt og skal
        // aldri lekke feil eller velte den kallende handlingen.
    }
}
