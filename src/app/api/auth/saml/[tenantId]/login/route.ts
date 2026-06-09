import { NextResponse } from 'next/server';
import { getSamlForTenant } from '@/lib/saml';

/**
 * SP-initiert SSO-start.
 * GET /api/auth/saml/[tenantId]/login
 *
 * Bygger en SAML AuthnRequest for tenanten og 302-redirecter nettleseren til
 * IdP-ens SSO-URL. Hvis SSO ikke er konfigurert/aktivert for tenanten, sendes
 * brukeren til /login med en generisk feil (ingen biblioteks-/konfigdetaljer lekkes).
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    const { tenantId } = await params;

    try {
        const ctx = await getSamlForTenant(tenantId);
        if (!ctx) {
            return NextResponse.redirect(new URL('/login?error=sso', getOrigin(_request)), 302);
        }

        // RelayState er ikke brukt i denne MVP-en (tom streng).
        const redirectUrl = await ctx.saml.getAuthorizeUrlAsync('', undefined, {});

        return NextResponse.redirect(redirectUrl, 302);
    } catch {
        // Generisk feil – aldri lekk SAML-/biblioteks-/stack-detaljer.
        return NextResponse.redirect(new URL('/login?error=sso', getOrigin(_request)), 302);
    }
}

/** Origin for trygg relativ redirect (egen host). */
function getOrigin(request: Request): string {
    try {
        return new URL(request.url).origin;
    } catch {
        return 'http://localhost:3000';
    }
}
