import { NextResponse } from 'next/server';
import { getSamlForTenant } from '@/lib/saml';

/**
 * SP-metadata.
 * GET /api/auth/saml/[tenantId]/metadata
 *
 * Returnerer Service Provider-metadata (XML) som admins kan importere i sin IdP
 * (Okta/Entra/Google). Inneholder SP entityId, ACS-URL og NameID-format.
 * Returnerer 404 (generisk) hvis SSO ikke er konfigurert/aktivert for tenanten.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    const { tenantId } = await params;

    try {
        const ctx = await getSamlForTenant(tenantId);
        if (!ctx) {
            return new NextResponse('Not found', { status: 404 });
        }

        // Ingen dekrypteringssertifikat (kryptert assertion er ikke konfigurert – TODO).
        const xml = ctx.saml.generateServiceProviderMetadata(null);

        return new NextResponse(xml, {
            status: 200,
            headers: {
                'content-type': 'application/xml; charset=utf-8',
                'cache-control': 'no-store',
            },
        });
    } catch {
        // Generisk – ingen biblioteks-/stack-detaljer.
        return new NextResponse('Not found', { status: 404 });
    }
}
