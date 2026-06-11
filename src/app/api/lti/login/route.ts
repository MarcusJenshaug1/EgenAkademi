import { NextResponse } from 'next/server';
import {
    findPlatformByIssuer,
    signLtiState,
    generateNonce,
} from '@/lib/lti';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * LTI 1.3 OIDC third-party initiation (login).
 * GET|POST /api/lti/login
 *
 * Plattformen (LMS) starter en launch ved å sende brukeren hit med (minst)
 * `iss`, `login_hint` og `target_link_uri`. Vi finner den AKTIVERTE LtiPlatform,
 * genererer en nonce + et HMAC-signert state-token, og 302-redirecter til
 * plattformens authUrl med OIDC auth-parametrene (response_type=id_token,
 * response_mode=form_post, scope=openid, prompt=none).
 *
 * Begge metoder støttes: plattformer kan initiere via GET (query) eller POST
 * (form). Ved ukjent/deaktivert plattform eller manglende parametre svarer vi
 * generisk (302 til /login?error=lti) – vi lekker ALDRI konfig-/biblioteksdetaljer.
 *
 * Offentlig rute (middleware beskytter kun /admin + /onboarding). Inndata
 * valideres; ingen sidevirkninger utføres her utover en signert redirect.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const url = new URL(request.url);
    return handleInitiation(request, url.searchParams);
}

export async function POST(request: Request) {
    const origin = getOrigin(request);
    try {
        const form = await request.formData();
        const params = new URLSearchParams();
        for (const [key, value] of form.entries()) {
            if (typeof value === 'string') params.set(key, value);
        }
        return handleInitiation(request, params);
    } catch {
        return redirectError(origin);
    }
}

async function handleInitiation(
    request: Request,
    params: URLSearchParams,
): Promise<NextResponse> {
    const origin = getOrigin(request);

    try {
        // Rate-limiting (sikkerhetsregel #8): PUBLIC, uautentisert rute som gjør
        // et DB-oppslag per forespørsel. Begrens per klient-IP for å dempe spam.
        const rl = await checkRateLimit(`lti-login:${clientKey(request)}`, 60, 60_000);
        if (!rl.allowed) {
            return redirectError(origin);
        }

        const issuer = (params.get('iss') || '').trim();
        const loginHint = params.get('login_hint') || '';
        const targetLinkUri = (params.get('target_link_uri') || '').trim();
        const clientIdParam = (params.get('client_id') || '').trim() || null;
        const ltiMessageHint = params.get('lti_message_hint') || '';

        // Minimumskrav for OIDC-initiering.
        if (!issuer || !loginHint || !targetLinkUri) {
            return redirectError(origin);
        }

        const platform = await findPlatformByIssuer(issuer, clientIdParam);
        if (!platform || !platform.authUrl) {
            // Ukjent/deaktivert plattform, eller mangler OIDC auth-endepunkt.
            return redirectError(origin);
        }

        // Generer nonce + signert state som binder runden sammen.
        const nonce = generateNonce();
        const state = signLtiState({
            nonce,
            platformId: platform.id,
            targetLinkUri,
        });

        // Bygg OIDC authorization request mot plattformens authUrl.
        let authUrl: URL;
        try {
            authUrl = new URL(platform.authUrl);
        } catch {
            return redirectError(origin);
        }

        const q = authUrl.searchParams;
        q.set('scope', 'openid');
        q.set('response_type', 'id_token');
        q.set('response_mode', 'form_post');
        q.set('prompt', 'none');
        q.set('client_id', platform.clientId);
        // Verktøyets launch/redirect-URI (form_post-mål).
        q.set('redirect_uri', `${origin}/api/lti/launch`);
        q.set('login_hint', loginHint);
        q.set('nonce', nonce);
        q.set('state', state);
        // Påkrevd ved plattform-initiert flyt iht. LTI/OIDC-spek.
        if (ltiMessageHint) q.set('lti_message_hint', ltiMessageHint);

        return NextResponse.redirect(authUrl, 302);
    } catch {
        // Generisk – aldri lekk biblioteks-/konfig-/stack-detaljer.
        return redirectError(origin);
    }
}

function getOrigin(request: Request): string {
    try {
        return new URL(request.url).origin;
    } catch {
        return 'http://localhost:3000';
    }
}

/**
 * Stabil rate-limit-nøkkel per klient (proxy-headere → fallback). Ingen PII
 * lekkes – kun en intern teller-nøkkel.
 */
function clientKey(request: Request): string {
    const fwd = request.headers.get('x-forwarded-for');
    if (fwd) {
        const first = fwd.split(',')[0]?.trim();
        if (first) return first;
    }
    const realIp = request.headers.get('x-real-ip');
    if (realIp && realIp.trim()) return realIp.trim();
    return 'unknown';
}

function redirectError(origin: string): NextResponse {
    return NextResponse.redirect(new URL('/login?error=lti', origin), 302);
}
