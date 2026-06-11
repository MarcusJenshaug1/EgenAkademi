'use server';

import { createHash, randomBytes } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { logAudit } from '@/lib/audit';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * EgenAkademi – Selvbetjent to-faktor (TOTP).
 *
 * SIKKERHET (ufravikelig):
 * - ALLE handlinger løser den handlende brukeren fra sesjonen (auth()).
 *   En bruker administrerer KUN sin EGEN 2FA – ingen userId tas fra klienten.
 * - totpSecret returneres KUN under oppsett (for å skanne inn i autentikator)
 *   og ALDRI etter at 2FA er aktivert. Den logges aldri.
 * - Gjenopprettingskoder vises i KLARTEKST nøyaktig én gang (ved generering) og
 *   lagres kun som sha256-hasher.
 * - Generiske feilmeldinger til klienten – ingen e.message/stack, ingen console.*.
 *
 * MERK om otplib: pakken er v13 (funksjonelt API). Standard er 30s / 6-siffer
 * (TOTP). Vi bruker `epochTolerance: 30` (±30 sekunder = ett tidssteg i hver
 * retning) som liten vindustoleranse for klokkeskew – tilsvarende `window: 1` i
 * eldre otplib.
 */

const ISSUER = 'EgenAkademi';
const RECOVERY_CODE_COUNT = 10;
// ±30 sekunder (ett 30s-tidssteg i hver retning) for klokkeskew-toleranse.
const EPOCH_TOLERANCE = 30;

// ── Interne hjelpere ────────────────────────────────────────

/**
 * Løs den handlende brukeren fra sesjonen. Returnerer null hvis ikke autentisert.
 * Tenant-id hentes med for best-effort audit-logging.
 */
async function resolveActor(): Promise<
    | { id: string; email: string | null; tenantId: string | null }
    | null
> {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, tenantId: true },
    });
    if (!user) return null;
    return user;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function normalizeToken(code: string): string {
    return code.trim().replace(/\s+/g, '');
}

/**
 * Verifiser en TOTP-kode mot en Base32-hemmelighet. Returnerer false ved
 * ugyldig format/feil – aldri kast videre til klienten.
 */
async function verifyTotp(secret: string, code: string): Promise<boolean> {
    try {
        const result = await verify({
            secret,
            token: normalizeToken(code),
            epochTolerance: EPOCH_TOLERANCE,
        });
        return result.valid === true;
    } catch {
        return false;
    }
}

/**
 * Generer en lesbar gjenopprettingskode på formatet 'xxxx-xxxx' (kun lowercase
 * a-z og 0-9 fra et kryptografisk sikkert utvalg).
 */
function generateRecoveryCode(): string {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) {
        out += alphabet[bytes[i] % alphabet.length];
        if (i === 3) out += '-';
    }
    return out;
}

function generateRecoveryCodes(): string[] {
    const codes = new Set<string>();
    while (codes.size < RECOVERY_CODE_COUNT) {
        codes.add(generateRecoveryCode());
    }
    return Array.from(codes);
}

/**
 * Best-effort audit. Krever en tenant; brukere uten tenant (skal i praksis ikke
 * forekomme her) hoppes stille over. logAudit svelger uansett alle feil.
 */
async function audit(
    actor: { id: string; email: string | null; tenantId: string | null },
    action: string
): Promise<void> {
    if (!actor.tenantId) return;
    await logAudit({
        tenantId: actor.tenantId,
        actorUserId: actor.id,
        actorEmail: actor.email,
        action,
        targetType: 'user',
        targetId: actor.id,
    });
}

/**
 * Felles verifisering: godtar enten en gyldig TOTP-kode ELLER en ubrukt
 * gjenopprettingskode. Ved bruk av en gjenopprettingskode fjernes den matchende
 * hashen (engangsbruk). Returnerer hvorvidt verifiseringen lyktes.
 *
 * Caller er ansvarlig for å laste totpSecret + totpRecoveryCodes på forhånd.
 */
async function consumeCode(
    userId: string,
    code: string,
    secret: string | null,
    recoveryHashes: string[]
): Promise<boolean> {
    const trimmed = code.trim();
    if (!trimmed) return false;

    // 1) Prøv TOTP først.
    if (secret && (await verifyTotp(secret, trimmed))) {
        return true;
    }

    // 2) Prøv gjenopprettingskode (normaliser til lowercase).
    const hash = sha256(trimmed.toLowerCase());
    if (recoveryHashes.includes(hash)) {
        await prisma.user.update({
            where: { id: userId },
            data: { totpRecoveryCodes: recoveryHashes.filter((h) => h !== hash) },
        });
        return true;
    }

    return false;
}

// ── Status ──────────────────────────────────────────────────

export async function getTwoFactorStatus(): Promise<
    { enabled: boolean; recoveryCodesRemaining: number } | { error: string }
> {
    try {
        const actor = await resolveActor();
        if (!actor) return { error: 'Ikke autentisert' };

        const user = await prisma.user.findUnique({
            where: { id: actor.id },
            select: { totpEnabled: true, totpRecoveryCodes: true },
        });
        if (!user) return { error: 'Ikke autentisert' };

        return {
            enabled: user.totpEnabled,
            recoveryCodesRemaining: user.totpRecoveryCodes.length,
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Start oppsett ───────────────────────────────────────────

export async function startTotpSetup(): Promise<
    { qrDataUrl: string; manualKey: string } | { error: string }
> {
    try {
        const actor = await resolveActor();
        if (!actor) return { error: 'Ikke autentisert' };

        const user = await prisma.user.findUnique({
            where: { id: actor.id },
            select: { totpEnabled: true, email: true },
        });
        if (!user) return { error: 'Ikke autentisert' };
        if (user.totpEnabled) return { error: 'Allerede aktivert' };

        const accountName = user.email ?? actor.id;
        const secret = generateSecret();

        // Lagre som ventende hemmelighet (ikke aktivert før bekreftet kode).
        await prisma.user.update({
            where: { id: actor.id },
            data: { totpSecret: secret, totpEnabled: false },
        });

        const otpauthUrl = generateURI({
            issuer: ISSUER,
            label: accountName,
            secret,
        });
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

        // Hemmeligheten returneres her KUN for innrullering – aldri etter aktivering.
        return { qrDataUrl, manualKey: secret };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Bekreft oppsett ─────────────────────────────────────────

export async function confirmTotpSetup(
    code: string
): Promise<{ recoveryCodes: string[] } | { error: string }> {
    try {
        const actor = await resolveActor();
        if (!actor) return { error: 'Ikke autentisert' };

        const rl = await checkRateLimit(`2fa-confirm:${actor.id}`, 8, 300_000);
        if (!rl.allowed) return { error: 'For mange forsøk. Prøv igjen senere.' };

        const user = await prisma.user.findUnique({
            where: { id: actor.id },
            select: { totpSecret: true, totpEnabled: true },
        });
        if (!user) return { error: 'Ikke autentisert' };
        if (user.totpEnabled) return { error: 'Allerede aktivert' };
        if (!user.totpSecret) return { error: 'Oppsett er ikke startet' };

        const valid = await verifyTotp(user.totpSecret, code);
        if (!valid) return { error: 'Ugyldig kode' };

        // Generer + lagre gjenopprettingskoder som sha256-hasher.
        const recoveryCodes = generateRecoveryCodes();
        const recoveryHashes = recoveryCodes.map((c) => sha256(c));

        await prisma.user.update({
            where: { id: actor.id },
            data: { totpEnabled: true, totpRecoveryCodes: recoveryHashes },
        });

        await audit(actor, '2fa.enabled');

        // Klartekstkodene returneres KUN her, denne ene gangen.
        return { recoveryCodes };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Deaktiver ───────────────────────────────────────────────

export async function disableTotp(
    code: string
): Promise<{ success: true } | { error: string }> {
    try {
        const actor = await resolveActor();
        if (!actor) return { error: 'Ikke autentisert' };

        const rl = await checkRateLimit(`2fa-disable:${actor.id}`, 8, 300_000);
        if (!rl.allowed) return { error: 'For mange forsøk. Prøv igjen senere.' };

        const user = await prisma.user.findUnique({
            where: { id: actor.id },
            select: { totpSecret: true, totpEnabled: true, totpRecoveryCodes: true },
        });
        if (!user) return { error: 'Ikke autentisert' };
        if (!user.totpEnabled) return { error: 'To-faktor er ikke aktivert' };

        const ok = await consumeCode(
            actor.id,
            code,
            user.totpSecret,
            user.totpRecoveryCodes
        );
        if (!ok) return { error: 'Ugyldig kode' };

        await prisma.user.update({
            where: { id: actor.id },
            data: { totpSecret: null, totpEnabled: false, totpRecoveryCodes: [] },
        });

        await audit(actor, '2fa.disabled');

        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Generer nye gjenopprettingskoder ────────────────────────

export async function regenerateRecoveryCodes(
    code: string
): Promise<{ recoveryCodes: string[] } | { error: string }> {
    try {
        const actor = await resolveActor();
        if (!actor) return { error: 'Ikke autentisert' };

        const rl = await checkRateLimit(`2fa-regen:${actor.id}`, 8, 300_000);
        if (!rl.allowed) return { error: 'For mange forsøk. Prøv igjen senere.' };

        const user = await prisma.user.findUnique({
            where: { id: actor.id },
            select: { totpSecret: true, totpEnabled: true },
        });
        if (!user) return { error: 'Ikke autentisert' };
        if (!user.totpEnabled || !user.totpSecret) {
            return { error: 'To-faktor er ikke aktivert' };
        }

        // Krev en gyldig TOTP-kode (ikke gjenopprettingskode) for regenerering.
        const valid = await verifyTotp(user.totpSecret, code);
        if (!valid) return { error: 'Ugyldig kode' };

        const recoveryCodes = generateRecoveryCodes();
        const recoveryHashes = recoveryCodes.map((c) => sha256(c));

        await prisma.user.update({
            where: { id: actor.id },
            data: { totpRecoveryCodes: recoveryHashes },
        });

        await audit(actor, '2fa.recovery_regenerated');

        return { recoveryCodes };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ── Verifiseringshjelper (for fremtidig innloggings-utfordring) ──

/**
 * Verifiser en TOTP-kode ELLER konsumer en gjenopprettingskode for den
 * innloggede brukeren. Tiltenkt brukt i en fremtidig innloggings-utfordring
 * (etter magic-link-callback). Rate-limitet på samme måte som de andre
 * sensitive handlingene.
 */
export async function verifyTwoFactor(
    code: string
): Promise<{ ok: boolean } | { error: string }> {
    try {
        const actor = await resolveActor();
        if (!actor) return { error: 'Ikke autentisert' };

        const rl = await checkRateLimit(`2fa-verify:${actor.id}`, 8, 300_000);
        if (!rl.allowed) return { error: 'For mange forsøk. Prøv igjen senere.' };

        const user = await prisma.user.findUnique({
            where: { id: actor.id },
            select: { totpSecret: true, totpEnabled: true, totpRecoveryCodes: true },
        });
        if (!user) return { error: 'Ikke autentisert' };
        if (!user.totpEnabled) return { error: 'To-faktor er ikke aktivert' };

        const ok = await consumeCode(
            actor.id,
            code,
            user.totpSecret,
            user.totpRecoveryCodes
        );

        return { ok };
    } catch {
        return { error: 'Ukjent feil' };
    }
}
