'use server';

import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * EgenAkademi – Markedsnettsted server actions
 *
 * Disse er PUBLIC (ingen auth) fordi markedsnettstedet er uautentisert.
 * Derfor er input-validering og rate-limiting OBLIGATORISK for å dempe spam,
 * og alle feil returneres som generiske meldinger (aldri e.message/stack).
 */

// ── Inn-/utdata-kontrakter ──────────────────────────────────
export interface DemoRequestInput {
    name: string;
    email: string;
    company?: string;
    phone?: string;
    message?: string;
}

export type DemoRequestResult = { success: true } | { error: string };

// ── Validerings-grenser ─────────────────────────────────────
const LIMITS = {
    name: 120,
    email: 200,
    company: 160,
    phone: 40,
    message: 2000,
} as const;

// Enkel, konservativ e-postvalidering (ikke RFC-komplett – nok til å fange
// åpenbart ugyldige adresser uten å avvise legitime).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim + cap en valgfri streng. Tom streng → undefined.
 */
function clean(value: string | undefined, max: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.slice(0, max);
}

/**
 * Opprett en demo-forespørsel (lead) fra markedsnettstedet.
 *
 * PUBLIC: ingen auth. Validerer input, rate-limiter per e-post (faller tilbake
 * til en generisk nøkkel hvis e-post er ugyldig), og lagrer en DemoRequest-rad.
 * Returnerer alltid { success } | { error } – aldri interne feildetaljer.
 */
export async function createDemoRequest(data: DemoRequestInput): Promise<DemoRequestResult> {
    try {
        if (!data || typeof data !== 'object') {
            return { error: 'Ugyldig forespørsel. Sjekk skjemaet og prøv igjen.' };
        }

        // ── Påkrevde felter ──
        const name = typeof data.name === 'string' ? data.name.trim() : '';
        const email = typeof data.email === 'string' ? data.email.trim() : '';

        if (name.length < 2) {
            return { error: 'Oppgi navnet ditt (minst 2 tegn).' };
        }
        if (name.length > LIMITS.name) {
            return { error: 'Navnet er for langt.' };
        }
        if (email.length === 0) {
            return { error: 'Oppgi en e-postadresse.' };
        }
        if (email.length > LIMITS.email || !EMAIL_RE.test(email)) {
            return { error: 'Oppgi en gyldig e-postadresse.' };
        }

        // ── Valgfrie felter (trim + cap) ──
        const company = clean(data.company, LIMITS.company);
        const phone = clean(data.phone, LIMITS.phone);
        const message = clean(data.message, LIMITS.message);

        // ── Rate limiting (anti-spam) ──
        // Nøkkel knyttet til e-post for å dempe gjentatte innsendinger; faller
        // tilbake til en generisk nøkkel dersom noe skulle mangle.
        const normalizedEmail = email.toLowerCase();
        const rlKey = `demo:${normalizedEmail || 'generic'}`;
        const rate = await checkRateLimit(rlKey, 5, 3600000); // maks 5 per time
        if (!rate.allowed) {
            return {
                error: 'Vi har allerede mottatt flere forespørsler fra deg. Prøv igjen senere, eller kontakt oss på e-post.',
            };
        }

        // ── Lagre lead ──
        await prisma.demoRequest.create({
            data: {
                name,
                email: normalizedEmail,
                company: company ?? null,
                phone: phone ?? null,
                message: message ?? null,
            },
        });

        return { success: true };
    } catch {
        // Generisk feil – ingen e.message/stack til klienten, ingen console.*
        return { error: 'Noe gikk galt. Prøv igjen om litt.' };
    }
}
