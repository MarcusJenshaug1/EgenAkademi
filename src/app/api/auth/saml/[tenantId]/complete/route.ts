import { NextResponse } from 'next/server';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { signIn } from '@/auth';
import { verifyBridgeToken } from '@/lib/saml';

/**
 * Bridge → Auth.js-sesjon.
 * GET /api/auth/saml/[tenantId]/complete?token=...
 *
 * Verifiserer det HMAC-signerte bridge-tokenet (signatur + utløp + at tenant
 * matcher ruten), og etablerer deretter Auth.js-sesjonen via 'saml-bridge'-
 * Credentials-provideren. signIn(redirect:true) kaster en NEXT_REDIRECT som
 * vi lar propagere slik at Auth.js setter sesjons-cookien og redirecter.
 */
export async function GET(
    request: Request,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    const { tenantId } = await params;
    const origin = getOrigin(request);

    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    const payload = verifyBridgeToken(token);
    if (!payload || payload.tenantId !== tenantId) {
        return NextResponse.redirect(new URL('/login?error=sso', origin), 302);
    }

    try {
        // signIn med redirect:true kaster NEXT_REDIRECT (se catch under) etter at
        // 'saml-bridge'.authorize har verifisert tokenet på nytt og lastet brukeren.
        await signIn('saml-bridge', {
            token,
            redirect: true,
            redirectTo: '/admin',
        });
        // Skal normalt ikke nås (signIn redirecter).
        return NextResponse.redirect(new URL('/admin', origin), 302);
    } catch (err) {
        // NEXT_REDIRECT må slippe gjennom slik at sesjon settes + redirect skjer.
        if (isRedirectError(err)) {
            throw err;
        }
        // Alt annet: generisk feil – ingen detaljer lekkes.
        return NextResponse.redirect(new URL('/login?error=sso', origin), 302);
    }
}

function getOrigin(request: Request): string {
    try {
        return new URL(request.url).origin;
    } catch {
        return 'http://localhost:3000';
    }
}
