import 'server-only';

import crypto from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import prisma from '@/lib/prisma';

/**
 * LTI 1.3 (IMS Global / 1EdTech) – verktøysiden (tool) som RESOURCE LINK-mål.
 *
 * Denne modulen er et SCAFFOLD for en innkommende LTI 1.3 Resource Link-launch:
 *
 *   1. Plattformen (LMS) starter OIDC third-party initiation mot /api/lti/login.
 *   2. Vi redirecter tilbake til plattformens authUrl med en nonce + signert state.
 *   3. Plattformen POSTer et signert id_token (form_post) til /api/lti/launch.
 *   4. Vi verifiserer id_token kryptografisk mot plattformens JWKS og sjekker
 *      iss/aud/nonce + obligatoriske LTI-claims.
 *
 * SIKKERHET (les .github/copilot-instructions.md):
 *  - ALL signaturvalidering av id_token gjøres av `jose` (createRemoteJWKSet +
 *    jwtVerify). Vi håndruller ALDRI JWT-/JWKS-validering.
 *  - state-tokenet er et kortlivet, HMAC-SHA256-signert token over AUTH_SECRET
 *    (speiler bridge-tokenet i src/lib/saml.ts). Det binder nonce + platformId +
 *    target_link_uri til selve flyten.
 *  - Råe jose-/JWT-feil, token-innhold, claims og stack lekkes ALDRI til klienten
 *    eller til logg. Kallere fanger feil og svarer generisk.
 *
 * MERK (scaffold-grenser, se followups i oppgaven):
 *  - nonce/state lagres IKKE i en delt store ennå – kun TTL + HMAC. Replay innen
 *    TTL er teoretisk mulig på tvers av instanser. En persistert nonce-store er TODO.
 *  - Vi etablerer ENNÅ ingen app-sesjon etter launch (ville speilet SAML-broen).
 *  - Vi har ennå ingen egen tool-keypair / JWKS-endepunkt for å signere egne
 *    meldinger (Deep Linking / AGS / NRPS). Alt dette er TODO.
 */

// ── LTI-konstanter (1EdTech-claim-URIer) ────────────────────

/** message_type for en standard ressurslenke-launch. */
export const LTI_MESSAGE_TYPE_RESOURCE_LINK = 'LtiResourceLinkRequest';

/** Eneste støttede LTI-versjon i denne scaffolden. */
export const LTI_VERSION = '1.3.0';

const CLAIM_MESSAGE_TYPE = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const CLAIM_VERSION = 'https://purl.imsglobal.org/spec/lti/claim/version';
const CLAIM_DEPLOYMENT_ID = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const CLAIM_RESOURCE_LINK = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';
const CLAIM_CONTEXT = 'https://purl.imsglobal.org/spec/lti/claim/context';
const CLAIM_ROLES = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const CLAIM_TARGET_LINK_URI = 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri';

// ── Base-URL (speiler src/lib/saml.ts) ──────────────────────

/** Base-URL for verktøy-endepunkter (OIDC login / launch / JWKS). */
export function getBaseUrl(): string {
    return (
        process.env.AUTH_URL ||
        process.env.NEXTAUTH_URL ||
        'http://localhost:3000'
    ).replace(/\/+$/, '');
}

/** OIDC third-party initiation-URL (login). Registreres i plattformen. */
export function getLtiLoginUrl(): string {
    return `${getBaseUrl()}/api/lti/login`;
}

/** Redirect/launch-URI (form_post target). Registreres i plattformen. */
export function getLtiLaunchUrl(): string {
    return `${getBaseUrl()}/api/lti/launch`;
}

/**
 * Plassholder for verktøyets offentlige JWKS-URL. Verktøyets keypair + et ekte
 * JWKS-endepunkt er ennå ikke implementert (TODO) – men plattformer ber ofte om
 * denne URL-en ved registrering, så vi eksponerer den allerede.
 */
export function getLtiJwksUrl(): string {
    return `${getBaseUrl()}/api/lti/jwks`;
}

// ── Plattform-oppslag ───────────────────────────────────────

export interface LtiPlatformRecord {
    id: string;
    tenantId: string;
    name: string;
    issuer: string;
    clientId: string;
    authUrl: string | null;
    jwksUrl: string | null;
    enabled: boolean;
}

/**
 * Finn en AKTIVERT LtiPlatform via issuer (og valgfritt client_id). Returnerer
 * null om ingen aktiv plattform matcher. En issuer kan i prinsippet ha flere
 * client_id-er (deployments); når client_id er gitt brukes det for å disambiguere.
 *
 * Vi prosesserer KUN plattformer der enabled===true.
 */
export async function findPlatformByIssuer(
    issuer: string,
    clientId?: string | null,
): Promise<LtiPlatformRecord | null> {
    if (!issuer || typeof issuer !== 'string') return null;

    const platform = await prisma.ltiPlatform.findFirst({
        where: {
            issuer,
            enabled: true,
            ...(clientId ? { clientId } : {}),
        },
        select: {
            id: true,
            tenantId: true,
            name: true,
            issuer: true,
            clientId: true,
            authUrl: true,
            jwksUrl: true,
            enabled: true,
        },
    });

    return platform ?? null;
}

// ════════════════════════════════════════════════════════════
// State-token (HMAC-SHA256 med AUTH_SECRET) – speiler saml-broen
// ════════════════════════════════════════════════════════════
//
// State binder OIDC-runden sammen: login genererer nonce + state, launch
// verifiserer state og krever at id_token-ets nonce matcher state.nonce.
// Tokenet er kortlivet og HMAC-signert – kan ikke forfalskes uten AUTH_SECRET.

export interface LtiStatePayload {
    /** OIDC nonce vi genererte ved login; må matche id_token-ets nonce. */
    nonce: string;
    /** LtiPlatform.id som launchen forventes å komme fra. */
    platformId: string;
    /** target_link_uri fra OIDC-initieringen (hvor launchen skal lande). */
    targetLinkUri: string | null;
    /** Utløp som epoch-ms. */
    exp: number;
}

/** Maks levetid for et state-token (5 minutter – dekker OIDC-rundturen). */
export const LTI_STATE_TTL_MS = 5 * 60 * 1000;

function getSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
        // Generisk – ingen secret-verdi lekkes.
        throw new Error('Auth secret not configured');
    }
    return secret;
}

function b64url(input: Buffer | string): string {
    return Buffer.from(input).toString('base64url');
}

function hmac(data: string): string {
    return crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
}

/** Generer en kryptografisk tilfeldig nonce (brukes som OIDC nonce). */
export function generateNonce(): string {
    return crypto.randomBytes(24).toString('base64url');
}

/**
 * Signer et state-token. Format: `<base64url(payload)>.<base64url(hmac)>`.
 * exp settes automatisk til nå + LTI_STATE_TTL_MS hvis ikke allerede satt.
 */
export function signLtiState(
    payload: Omit<LtiStatePayload, 'exp'> & Partial<Pick<LtiStatePayload, 'exp'>>,
): string {
    const full: LtiStatePayload = {
        nonce: payload.nonce,
        platformId: payload.platformId,
        targetLinkUri: payload.targetLinkUri ?? null,
        exp: payload.exp ?? Date.now() + LTI_STATE_TTL_MS,
    };
    const body = b64url(JSON.stringify(full));
    const sig = hmac(body);
    return `${body}.${sig}`;
}

/**
 * Verifiser et state-token: konstant-tids HMAC-sjekk + utløp (<= TTL).
 * Returnerer payload ved gyldig token, ellers null. Kaster aldri på ugyldig
 * input – returnerer null slik at kallere kan svare generisk.
 */
export function verifyLtiState(token: string | null | undefined): LtiStatePayload | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [body, sig] = parts;
    if (!body || !sig) return null;

    let expectedSig: string;
    try {
        expectedSig = hmac(body);
    } catch {
        return null;
    }

    // Konstant-tids sammenligning.
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return null;
    }

    let payload: LtiStatePayload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as LtiStatePayload;
    } catch {
        return null;
    }

    if (
        !payload ||
        typeof payload.nonce !== 'string' ||
        typeof payload.platformId !== 'string' ||
        typeof payload.exp !== 'number'
    ) {
        return null;
    }

    const now = Date.now();
    // Avvis utløpte tokens og tokens med urimelig lang TTL (manipulert exp).
    if (payload.exp <= now) return null;
    if (payload.exp - now > LTI_STATE_TTL_MS) return null;

    return payload;
}

// ════════════════════════════════════════════════════════════
// id_token-validering (signatur via JWKS + LTI-claims)
// ════════════════════════════════════════════════════════════

/** Validerte LTI-claims vi bryr oss om i landingen (alt valgfritt utenom kjernen). */
export interface LtiLaunchClaims {
    /** Hele den verifiserte JWT-payloaden (for avansert bruk). */
    raw: JWTPayload;
    messageType: string;
    version: string;
    deploymentId: string;
    targetLinkUri: string | null;
    resourceLink: {
        id: string | null;
        title: string | null;
        description: string | null;
    };
    context: {
        id: string | null;
        label: string | null;
        title: string | null;
    };
    roles: string[];
    nonce: string | null;
}

/**
 * Cache for createRemoteJWKSet-instanser per JWKS-URL. jose-instansen cacher
 * selv hentede nøkler (med rotasjons-håndtering), så vi gjenbruker den per URL
 * i stedet for å opprette et nytt remote-sett ved hver launch.
 */
const globalForLtiJwks = globalThis as unknown as {
    __ltiJwksCache?: Map<string, ReturnType<typeof createRemoteJWKSet>>;
};

const ltiJwksCache: Map<string, ReturnType<typeof createRemoteJWKSet>> =
    globalForLtiJwks.__ltiJwksCache ?? new Map();

if (process.env.NODE_ENV !== 'production') {
    globalForLtiJwks.__ltiJwksCache = ltiJwksCache;
}

function getRemoteJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
    const cached = ltiJwksCache.get(jwksUrl);
    if (cached) return cached;
    const jwks = createRemoteJWKSet(new URL(jwksUrl));
    ltiJwksCache.set(jwksUrl, jwks);
    return jwks;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * Verifiser et innkommende LTI id_token:
 *  1. Signatur via plattformens JWKS (createRemoteJWKSet + jwtVerify).
 *  2. iss === platform.issuer og aud inkluderer platform.clientId (gjøres av jose).
 *  3. Obligatoriske LTI-claims: message_type, version (1.3.0), deployment_id.
 *  4. nonce må være til stede (kryss-sjekkes mot state av kalleren).
 *
 * Kaster en GENERISK feil ved enhver valideringsfeil. Råe jose-/JWT-feil,
 * token-innhold og claims lekkes ALDRI (verken til klient eller logg).
 */
export async function validateIdToken(
    idToken: string,
    platform: LtiPlatformRecord,
): Promise<LtiLaunchClaims> {
    if (!idToken || typeof idToken !== 'string') {
        throw new Error('Invalid LTI launch');
    }
    if (!platform.jwksUrl) {
        // Uten JWKS-URL kan vi ikke verifisere signaturen → avvis generisk.
        throw new Error('Invalid LTI launch');
    }

    let payload: JWTPayload;
    try {
        const jwks = getRemoteJwks(platform.jwksUrl);
        const result = await jwtVerify(idToken, jwks, {
            issuer: platform.issuer,
            audience: platform.clientId,
            // LTI 1.3 / OIDC mandates RS256-signerte id_tokens. Pinn algoritmen
            // eksplisitt slik at vi aldri aksepterer en uventet `alg` (forsvar
            // mot algoritme-substitusjon), uavhengig av hva JWKS-et tilbyr.
            algorithms: ['RS256'],
        });
        payload = result.payload;
    } catch {
        // Generisk – aldri lekk jose-/signatur-/JWKS-detaljer.
        throw new Error('Invalid LTI launch');
    }

    // ── LTI-spesifikke claim-sjekker ──
    const messageType = asString(payload[CLAIM_MESSAGE_TYPE]);
    const version = asString(payload[CLAIM_VERSION]);
    const deploymentId = asString(payload[CLAIM_DEPLOYMENT_ID]);
    const nonce = asString(payload.nonce);

    if (messageType !== LTI_MESSAGE_TYPE_RESOURCE_LINK) {
        throw new Error('Invalid LTI launch');
    }
    if (version !== LTI_VERSION) {
        throw new Error('Invalid LTI launch');
    }
    if (!deploymentId) {
        throw new Error('Invalid LTI launch');
    }
    if (!nonce) {
        throw new Error('Invalid LTI launch');
    }

    const resourceLinkRaw = (payload[CLAIM_RESOURCE_LINK] ?? {}) as Record<string, unknown>;
    const contextRaw = (payload[CLAIM_CONTEXT] ?? {}) as Record<string, unknown>;
    const rolesRaw = payload[CLAIM_ROLES];
    const roles = Array.isArray(rolesRaw)
        ? rolesRaw.filter((r): r is string => typeof r === 'string')
        : [];

    return {
        raw: payload,
        messageType,
        version,
        deploymentId,
        targetLinkUri: asString(payload[CLAIM_TARGET_LINK_URI]),
        resourceLink: {
            id: asString(resourceLinkRaw.id),
            title: asString(resourceLinkRaw.title),
            description: asString(resourceLinkRaw.description),
        },
        context: {
            id: asString(contextRaw.id),
            label: asString(contextRaw.label),
            title: asString(contextRaw.title),
        },
        roles,
        nonce,
    };
}
