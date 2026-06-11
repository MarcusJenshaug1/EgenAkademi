import 'server-only';

import crypto from 'crypto';
import {
    SAML,
    ValidateInResponseTo,
    type Profile,
    type CacheItem,
    type CacheProvider,
} from '@node-saml/node-saml';
import prisma from '@/lib/prisma';

/**
 * SAML 2.0 Service Provider (SP) runtime.
 *
 * SIKKERHET (les .github/copilot-instructions.md):
 *  - ALL kryptografisk validering (XML-signatur, audience, notBefore/notOnOrAfter)
 *    utføres av @node-saml/node-saml. Vi håndruller ALDRI noe av dette.
 *  - wantAssertionsSigned=true → usignerte assertions avvises.
 *  - Råe biblioteksfeil/stack/XML lekkes ALDRI til nettleseren (kallere fanger og
 *    returnerer generiske feil). Vi logger heller aldri assertions eller tokens.
 *
 * Per-tenant flyt:
 *  /api/auth/saml/[tenantId]/login    → redirect til IdP
 *  /api/auth/saml/[tenantId]/acs      → IdP POSTer SAMLResponse hit (validering + provisjonering)
 *  /api/auth/saml/[tenantId]/complete → veksler vår HMAC-bridge-token til en Auth.js-sesjon
 *  /api/auth/saml/[tenantId]/metadata → SP-metadata (XML) for registrering i IdP
 */

// ── Base-URL ────────────────────────────────────────────────

/** Base-URL for SP-endepunkter. Brukes til å bygge issuer/callback/audience. */
export function getBaseUrl(): string {
    return (
        process.env.AUTH_URL ||
        process.env.NEXTAUTH_URL ||
        'http://localhost:3000'
    ).replace(/\/+$/, '');
}

/** Avledet SP entityId hvis tenanten ikke har satt en egen spEntityId. */
export function deriveSpEntityId(tenantId: string): string {
    return `${getBaseUrl()}/api/auth/saml/${encodeURIComponent(tenantId)}/metadata`;
}

/** SP Assertion Consumer Service (ACS) URL der IdP POSTer SAMLResponse. */
export function getAcsUrl(tenantId: string): string {
    return `${getBaseUrl()}/api/auth/saml/${encodeURIComponent(tenantId)}/acs`;
}

/** Login-endepunktet som starter SP-initiert SSO. */
export function getLoginUrl(tenantId: string): string {
    return `${getBaseUrl()}/api/auth/saml/${encodeURIComponent(tenantId)}/login`;
}

/** SP-metadata-URL. */
export function getMetadataUrl(tenantId: string): string {
    return `${getBaseUrl()}/api/auth/saml/${encodeURIComponent(tenantId)}/metadata`;
}

// ── Replay-beskyttelse: delt request-ID-cache ───────────────
//
// node-saml gir replay-beskyttelse ved å lagre AuthnRequest-ID-en ved /login og
// kreve at IdP-svaret refererer den (InResponseTo) ved /acs – og DERETTER fjerne
// nøkkelen, slik at hvert svar kun kan brukes ÉN gang. Dette krever at SAVE (login)
// og GET+REMOVE (acs) deler SAMME cache. Siden vi konstruerer en ny SAML-instans
// per request, må cachen leve på modulnivå (her), ikke i instansen.
//
// MERK (skaleringsgrense): denne in-memory-cachen er per prosess. Med flere
// instanser/serverless bør den byttes ut med en delt backing (Redis/DB).
// Dette er likevel en klar forbedring over INGEN replay-beskyttelse.

interface CacheEntry {
    value: string;
    createdAt: number;
}

const globalForSamlCache = globalThis as unknown as {
    __samlRequestIdCache?: Map<string, CacheEntry>;
};

const samlRequestIdStore: Map<string, CacheEntry> =
    globalForSamlCache.__samlRequestIdCache ?? new Map<string, CacheEntry>();

if (process.env.NODE_ENV !== 'production') {
    globalForSamlCache.__samlRequestIdCache = samlRequestIdStore;
}

/** Levetid for en lagret AuthnRequest-ID (login → acs). */
const REQUEST_ID_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutter

/** Fjern utløpte request-ID-er for å hindre ubegrenset minnevekst. */
function pruneRequestIdStore(now: number): void {
    for (const [key, entry] of samlRequestIdStore) {
        if (now - entry.createdAt > REQUEST_ID_EXPIRATION_MS) {
            samlRequestIdStore.delete(key);
        }
    }
}

/**
 * CacheProvider for node-saml som deler request-ID-er på tvers av /login og /acs.
 * Brukes til InResponseTo-validering (replay-beskyttelse). Inneholder kun
 * ugjennomtrengelige request-ID-er (UUID-lignende) og tidsstempler – aldri
 * assertions, e-poster eller tokens.
 */
const sharedSamlCacheProvider: CacheProvider = {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
        const now = Date.now();
        pruneRequestIdStore(now);
        if (samlRequestIdStore.has(key)) return null;
        const entry: CacheEntry = { value, createdAt: now };
        samlRequestIdStore.set(key, entry);
        return { value: entry.value, createdAt: entry.createdAt };
    },
    async getAsync(key: string): Promise<string | null> {
        const entry = samlRequestIdStore.get(key);
        if (!entry) return null;
        if (Date.now() - entry.createdAt > REQUEST_ID_EXPIRATION_MS) {
            samlRequestIdStore.delete(key);
            return null;
        }
        return entry.value;
    },
    async removeAsync(key: string | null): Promise<string | null> {
        if (key == null) return null;
        const existed = samlRequestIdStore.delete(key);
        return existed ? key : null;
    },
};

// ── SAML-instans per tenant ─────────────────────────────────

export interface TenantSamlContext {
    saml: SAML;
    /** SP issuer/entityId som faktisk brukes (tenant-satt eller avledet). */
    spEntityId: string;
    /** Tenantens attributtmapping (email/firstName/lastName → SAML-claim-navn). */
    attributeMapping: Record<string, string> | null;
    tenantId: string;
}

/**
 * Laster den aktiverte SsoConnection for en tenant og returnerer en ferdig
 * konfigurert node-saml-instans. Returnerer null dersom SSO ikke er konfigurert
 * eller ikke aktivert, eller om obligatoriske IdP-felter mangler.
 *
 * Vi prosesserer KUN SSO for en tenant der enabled===true OG idpEntityId,
 * idpSsoUrl og idpCertificate alle er satt.
 */
export async function getSamlForTenant(
    tenantId: string
): Promise<TenantSamlContext | null> {
    if (!tenantId || typeof tenantId !== 'string') return null;

    const conn = await prisma.ssoConnection.findUnique({
        where: { tenantId },
    });

    if (
        !conn ||
        conn.enabled !== true ||
        conn.protocol !== 'SAML' ||
        !conn.idpEntityId ||
        !conn.idpSsoUrl ||
        !conn.idpCertificate
    ) {
        return null;
    }

    const spEntityId = (conn.spEntityId && conn.spEntityId.trim()) || deriveSpEntityId(tenantId);
    const callbackUrl = getAcsUrl(tenantId);

    const saml = new SAML({
        // IdP-konfig
        entryPoint: conn.idpSsoUrl,
        idpCert: conn.idpCertificate, // PEM X.509 – brukes til signaturvalidering
        idpIssuer: conn.idpEntityId, // verifiser at Response.Issuer matcher IdP
        // SP-konfig
        issuer: spEntityId,
        callbackUrl,
        audience: spEntityId, // assertion må være adressert til vår SP
        // Sikkerhet: avvis usignerte assertions.
        wantAssertionsSigned: true,
        // wantAuthnResponseSigned er true som standard i node-saml → usignert
        // top-level Response avvises også. Vi overstyrer den IKKE.
        // Vi sender ikke signerte AuthnRequests i denne MVP-en (TODO).
        // node-saml validerer fremdeles signatur PÅ svaret/assertion fra IdP.
        identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
        // Liten klokkeskew-toleranse for notBefore/notOnOrAfter.
        acceptedClockSkewMs: 5000,
        // Replay-beskyttelse: krev at IdP-svaret refererer en AuthnRequest-ID vi
        // selv genererte (InResponseTo), og gjør hvert svar engangs-brukbart.
        // Krever den delte cachen over (login lagrer ID, acs henter + fjerner).
        validateInResponseTo: ValidateInResponseTo.always,
        requestIdExpirationPeriodMs: REQUEST_ID_EXPIRATION_MS,
        cacheProvider: sharedSamlCacheProvider,
    });

    return {
        saml,
        spEntityId,
        attributeMapping: (conn.attributeMapping as Record<string, string> | null) ?? null,
        tenantId,
    };
}

// ── Attributt-uthenting ─────────────────────────────────────

export interface SamlUserAttributes {
    email: string | null;
    firstName: string | null;
    lastName: string | null;
}

/** Vanlige SAML/OID-claim-URIer som fallback når mapping ikke er satt. */
const EMAIL_CLAIM_CANDIDATES = [
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
    'urn:oid:0.9.2342.19200300.100.1.3', // mail
    'mail',
    'email',
    'emailAddress',
    'EmailAddress',
];

const FIRST_NAME_CLAIM_CANDIDATES = [
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    'urn:oid:2.5.4.42', // givenName
    'givenName',
    'firstName',
    'first_name',
    'FirstName',
];

const LAST_NAME_CLAIM_CANDIDATES = [
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    'urn:oid:2.5.4.4', // sn
    'sn',
    'surname',
    'lastName',
    'last_name',
    'LastName',
];

/** Plukk ut første ikke-tomme string-verdi for et gitt claim-navn fra profilen. */
function readClaim(profile: Profile, key: string): string | null {
    if (!key) return null;
    const raw = (profile as Record<string, unknown>)[key];
    if (raw == null) return null;
    if (Array.isArray(raw)) {
        const first = raw.find((v) => typeof v === 'string' && v.trim().length > 0);
        return typeof first === 'string' ? first.trim() : null;
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
}

function firstClaim(profile: Profile, candidates: string[]): string | null {
    for (const c of candidates) {
        const v = readClaim(profile, c);
        if (v) return v;
    }
    return null;
}

function looksLikeEmail(value: string | null | undefined): value is string {
    return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Hent ut email/firstName/lastName fra en validert SAML-profil, ved hjelp av
 * tenantens attributtmapping og deretter fornuftige fallbacks (NameID + vanlige
 * claim-URIer). E-post normaliseres til lowercase/trim.
 */
export function extractAttributes(
    profile: Profile,
    attributeMapping: Record<string, string> | null
): SamlUserAttributes {
    const map = attributeMapping ?? {};

    // 1) Eksplisitt mapping (om satt) → 2) vanlige claim-fallbacks → 3) NameID.
    let email =
        (map.email ? readClaim(profile, map.email) : null) ??
        firstClaim(profile, EMAIL_CLAIM_CANDIDATES);

    if (!looksLikeEmail(email) && looksLikeEmail(profile.nameID)) {
        email = profile.nameID;
    }

    const firstName =
        (map.firstName ? readClaim(profile, map.firstName) : null) ??
        firstClaim(profile, FIRST_NAME_CLAIM_CANDIDATES);

    const lastName =
        (map.lastName ? readClaim(profile, map.lastName) : null) ??
        firstClaim(profile, LAST_NAME_CLAIM_CANDIDATES);

    return {
        email: email ? email.trim().toLowerCase() : null,
        firstName,
        lastName,
    };
}

// ════════════════════════════════════════════════════════════
// Intern bridge-token (HMAC-SHA256 med AUTH_SECRET)
// ════════════════════════════════════════════════════════════
//
// TILLITSGRENSE: Etter at ACS har validert SAML-svaret kryptografisk, minter vi
// et kortlivet, HMAC-signert token. Auth.js sin 'saml-bridge'-Credentials-provider
// stoler KUN på tokens signert med AUTH_SECRET (vår egen ACS). Dette er en intern
// bro – tokenet eksponeres aldri for IdP og kan ikke forfalskes uten AUTH_SECRET.

export interface BridgeTokenPayload {
    userId: string;
    tenantId: string;
    nonce: string;
    /** Utløp som epoch-ms. */
    exp: number;
}

/** Maks levetid for et bridge-token (120 sekunder). */
export const BRIDGE_TOKEN_TTL_MS = 120_000;

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

/**
 * Signer et bridge-token. Format: `<base64url(payload)>.<base64url(hmac)>`.
 * exp settes automatisk til nå + BRIDGE_TOKEN_TTL_MS hvis ikke allerede satt.
 */
export function signBridgeToken(
    payload: Omit<BridgeTokenPayload, 'nonce' | 'exp'> & Partial<Pick<BridgeTokenPayload, 'nonce' | 'exp'>>
): string {
    const full: BridgeTokenPayload = {
        userId: payload.userId,
        tenantId: payload.tenantId,
        nonce: payload.nonce ?? crypto.randomBytes(16).toString('base64url'),
        exp: payload.exp ?? Date.now() + BRIDGE_TOKEN_TTL_MS,
    };
    const body = b64url(JSON.stringify(full));
    const sig = hmac(body);
    return `${body}.${sig}`;
}

/**
 * Verifiser et bridge-token: konstant-tids HMAC-sjekk + utløp (<=120s TTL).
 * Returnerer payload ved gyldig token, ellers null. Kaster aldri på ugyldig
 * input – returnerer null slik at kallere kan svare generisk.
 */
export function verifyBridgeToken(token: string | null | undefined): BridgeTokenPayload | null {
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

    let payload: BridgeTokenPayload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as BridgeTokenPayload;
    } catch {
        return null;
    }

    if (
        !payload ||
        typeof payload.userId !== 'string' ||
        typeof payload.tenantId !== 'string' ||
        typeof payload.exp !== 'number'
    ) {
        return null;
    }

    const now = Date.now();
    // Avvis utløpte tokens og tokens med urimelig lang TTL (manipulert exp).
    if (payload.exp <= now) return null;
    if (payload.exp - now > BRIDGE_TOKEN_TTL_MS) return null;

    return payload;
}
