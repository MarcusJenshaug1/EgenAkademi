import { NextResponse } from 'next/server';
import {
    findPlatformByIssuer,
    verifyLtiState,
    validateIdToken,
    type LtiLaunchClaims,
} from '@/lib/lti';
import prisma from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rateLimit';

/**
 * LTI 1.3 launch (resource link target).
 * POST /api/lti/launch   (application/x-www-form-urlencoded, response_mode=form_post)
 *
 * Plattformen POSTer hit etter OIDC-autentisering med `id_token` + `state`:
 *  1. verifyLtiState(state)        – HMAC + TTL, henter platformId + nonce.
 *  2. Last LtiPlatform (aktivert)  – via id, dobbeltsjekk enabled.
 *  3. validateIdToken(...)         – signatur via JWKS + iss/aud + LTI-claims.
 *  4. Kryss-sjekk nonce            – id_token.nonce === state.nonce.
 *  5. Render en minimal launch-landing som bekrefter den validerte launchen.
 *
 * VIKTIG: Vi etablerer ENNÅ ingen app-sesjon her (se TODO). En full integrasjon
 * ville speilet SAML-broen: finn-eller-provisjoner bruker i platform.tenantId og
 * mint et kortlivet bridge-token til en Auth.js-sesjon.
 *
 * Generiske feil kun. Vi lekker ALDRI jose-/JWT-feil, stack eller token-innhold –
 * verken til klienten eller til logg. Offentlig rute (LTI er public by design).
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // Rate-limiting (sikkerhetsregel #8): denne ruten er PUBLIC og uautentisert
        // og utfører kostbar validering (remote JWKS-henting + signaturverifisering).
        // Vi begrenser per klient-IP for å dempe spam/DoS-forsterkning.
        const rl = await checkRateLimit(`lti-launch:${clientKey(request)}`, 30, 60_000);
        if (!rl.allowed) {
            return errorPage('For mange forsøk. Prøv igjen senere.');
        }

        const form = await request.formData();
        const idToken = form.get('id_token');
        const state = form.get('state');

        if (typeof idToken !== 'string' || typeof state !== 'string') {
            return errorPage('Ugyldig LTI-launch.');
        }

        // 1) Verifiser state (HMAC + TTL) → platformId + forventet nonce.
        const statePayload = verifyLtiState(state);
        if (!statePayload) {
            return errorPage('LTI-økten er utløpt eller ugyldig. Start på nytt fra plattformen.');
        }

        // 2) Last den aktiverte plattformen state peker på.
        const platform = await prisma.ltiPlatform.findFirst({
            where: { id: statePayload.platformId, enabled: true },
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
        if (!platform) {
            return errorPage('LTI-plattformen er ukjent eller deaktivert.');
        }

        // 3) Kryptografisk validering av id_token (signatur via JWKS + iss/aud + LTI-claims).
        let claims: LtiLaunchClaims;
        try {
            claims = await validateIdToken(idToken, platform);
        } catch {
            // validateIdToken kaster allerede generisk – ingen detaljer lekker.
            return errorPage('Kunne ikke verifisere LTI-launchen.');
        }

        // 4) Kryss-sjekk nonce mot state (knytter id_token til VÅR login-runde).
        if (claims.nonce !== statePayload.nonce) {
            return errorPage('LTI-nonce stemmer ikke. Start på nytt fra plattformen.');
        }

        // Sanity: bekreft at issuer-oppslag fortsatt matcher (defensivt; samme platform).
        const reconfirm = await findPlatformByIssuer(platform.issuer, platform.clientId);
        if (!reconfirm || reconfirm.id !== platform.id) {
            return errorPage('LTI-plattformen er ukjent eller deaktivert.');
        }

        // 5) Validert launch – render bekreftelses-landing.
        //
        // TODO (session establishment): Her ville en full integrasjon finne-eller-
        // provisjonere brukeren i platform.tenantId (basert på "sub"/email-claims),
        // mint et kortlivet HMAC-bridge-token og veksle det til en Auth.js-sesjon –
        // nøyaktig som SAML-broen (/api/auth/saml/[tenantId]/complete). Bevisst
        // utelatt i denne scaffolden.

        return successPage(platform.name, statePayload.targetLinkUri, claims);
    } catch {
        // Generisk – aldri lekk biblioteks-/validerings-/stack-detaljer.
        return errorPage('Noe gikk galt under LTI-launchen.');
    }
}

// GET er ikke en gyldig launch-metode (form_post forventes). Svar generisk.
export async function GET() {
    return errorPage('Ugyldig LTI-launch.');
}

/**
 * Stabil rate-limit-nøkkel per klient. Bruker proxy-headere (x-forwarded-for /
 * x-real-ip) og faller tilbake til en fast bøtte når IP ikke kan utledes, slik at
 * uautentiserte forespørsler fortsatt får et tak. Ingen PII lekkes – kun en
 * intern teller-nøkkel.
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

// ── HTML-rendering (server-side, brand-tokens) ──────────────
//
// Dette er en API-rute (ikke en React-side), så vi returnerer minimal HTML
// direkte. Farger bruker globals.css-tokens (var(--color-*)) slik at landingen
// følger standard EgenAkademi-merkevare. Alt dynamisk innhold escapes.

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function htmlShell(title: string, bodyInner: string): NextResponse {
    const html = `<!DOCTYPE html>
<html lang="nb">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${escapeHtml(title)}</title>
<style>
  :root {
    /* Standard EgenAkademi-merkevare – speiler tokenene i globals.css.
       Denne HTML-en serves direkte fra en API-rute (utenfor Next.js-layouten
       som laster globals.css), så vi MÅ deklarere tokenene her. Verdiene holdes
       i synk med src/app/globals.css slik at landingen følger merkevaren. */
    --color-bg-primary: #050505;
    --color-bg-secondary: #0f0f11;
    --color-text-primary: #ffffff;
    --color-text-secondary: #9ca3af;
    --color-border: rgba(255, 255, 255, 0.08);
    --color-accent-blue: #3b82f6;
    --color-success: #22c55e;
    --color-danger: #ef4444;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    width: 100%;
    max-width: 520px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 14px;
    padding: 28px;
  }
  h1 { font-size: 1.25rem; margin: 0 0 6px; }
  p { color: var(--color-text-secondary); margin: 0 0 18px; line-height: 1.5; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    margin-bottom: 14px;
  }
  .badge-ok {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-success) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-success) 35%, transparent);
  }
  .badge-err {
    color: var(--color-danger);
    background: color-mix(in srgb, var(--color-danger) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-danger) 35%, transparent);
  }
  dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; }
  dt { color: var(--color-text-secondary); font-size: 0.85rem; }
  dd { margin: 0; font-size: 0.9rem; word-break: break-word; }
  .note {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
    font-size: 0.8rem;
    color: var(--color-text-secondary);
  }
</style>
</head>
<body>
  <div class="card">
    ${bodyInner}
  </div>
</body>
</html>`;

    return new NextResponse(html, {
        // 200 også for "håndterte" feil: dette er en sluttbruker-landing inne i et
        // LMS-iframe, ikke et maskin-API. Innholdet skiller suksess vs. feil.
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}

function successPage(
    platformName: string,
    targetLinkUri: string | null,
    claims: LtiLaunchClaims,
): NextResponse {
    const rows: string[] = [];
    const addRow = (label: string, value: string | null) => {
        if (value) {
            rows.push(`<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`);
        }
    };

    addRow('Plattform', platformName);
    addRow('Deployment ID', claims.deploymentId);
    addRow('Mållenke', targetLinkUri ?? claims.targetLinkUri);
    addRow('Ressurslenke', claims.resourceLink.title);
    addRow('Ressurslenke-ID', claims.resourceLink.id);
    addRow('Kontekst', claims.context.title ?? claims.context.label);
    addRow('Kontekst-ID', claims.context.id);
    if (claims.roles.length > 0) {
        addRow('Roller', claims.roles.join(', '));
    }

    const body = `
    <span class="badge badge-ok">Verifisert launch</span>
    <h1>LTI 1.3-launch validert</h1>
    <p>
      Signaturen på id_token er verifisert mot plattformens JWKS, og
      issuer, audience og nonce er kontrollert. Ingen app-sesjon er
      etablert ennå (kommer).
    </p>
    <dl>
      ${rows.join('\n      ')}
    </dl>
    <div class="note">
      Neste steg (TODO): etabler en innlogget sesjon for brukeren – speiler
      SAML-broen (finn-eller-provisjoner bruker, mint bridge-token, veksle til
      Auth.js-sesjon).
    </div>`;

    return htmlShell('LTI-launch validert', body);
}

function errorPage(message: string): NextResponse {
    const body = `
    <span class="badge badge-err">Launch avvist</span>
    <h1>LTI-launch kunne ikke fullføres</h1>
    <p>${escapeHtml(message)}</p>
    <div class="note">
      Hvis problemet vedvarer, kontakt administratoren for organisasjonen din.
    </div>`;
    return htmlShell('LTI-launch avvist', body);
}
