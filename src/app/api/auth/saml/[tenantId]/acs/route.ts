import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSamlForTenant, extractAttributes, signBridgeToken } from '@/lib/saml';

/**
 * Assertion Consumer Service (ACS).
 * POST /api/auth/saml/[tenantId]/acs   (application/x-www-form-urlencoded)
 *
 * IdP POSTer en `SAMLResponse` hit. node-saml utfører ALL kryptografisk
 * validering (XML-signatur, audience, notBefore/notOnOrAfter, wantAssertionsSigned).
 * Ved gyldig svar finner-eller-provisjonerer vi brukeren i NØYAKTIG denne tenanten,
 * minter et kortlivet HMAC-bridge-token og redirecter til /complete som etablerer
 * Auth.js-sesjonen.
 *
 * Ved enhver feil → generisk 302 til /login?error=sso. Vi lekker ALDRI
 * biblioteksfeil, stack, råe XML-assertions eller tokens (heller ikke i logg).
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ tenantId: string }> }
) {
    const { tenantId } = await params;
    const origin = getOrigin(request);

    try {
        const ctx = await getSamlForTenant(tenantId);
        if (!ctx) {
            return redirectError(origin);
        }

        // Les x-www-form-urlencoded body og hent SAMLResponse.
        const form = await request.formData();
        const samlResponse = form.get('SAMLResponse');
        if (typeof samlResponse !== 'string' || samlResponse.length === 0) {
            return redirectError(origin);
        }

        // Kryptografisk validering (signatur + betingelser) gjøres her av node-saml.
        const { profile, loggedOut } = await ctx.saml.validatePostResponseAsync({
            SAMLResponse: samlResponse,
        });

        // Dette endepunktet håndterer kun innlogging (ikke SLO).
        if (loggedOut || !profile) {
            return redirectError(origin);
        }

        const attrs = extractAttributes(profile, ctx.attributeMapping);
        if (!attrs.email) {
            // E-post er påkrevd for å kunne knytte/provisjonere en bruker.
            return redirectError(origin);
        }

        const email = attrs.email; // allerede normalisert (lowercase/trim)

        // Find-or-provision STRENGT innenfor denne tenanten.
        // email er globalt unik i schemaet: hvis en bruker med denne e-posten finnes
        // i en ANNEN tenant, avviser vi (flytter ALDRI brukere på tvers av tenants).
        const existing = await prisma.user.findUnique({
            where: { email },
            select: { id: true, tenantId: true, active: true },
        });

        let userId: string;

        if (existing) {
            if (existing.tenantId !== tenantId) {
                // E-post tilhører en annen organisasjon – avvis generisk.
                return redirectError(origin);
            }
            if (existing.active === false) {
                // Deaktiverte brukere skal ikke kunne logge inn.
                return redirectError(origin);
            }
            userId = existing.id;
            // Oppdater navn-attributter (men ALDRI rolle/tenant).
            await updateUserNames(existing.id, attrs.firstName, attrs.lastName);
        } else {
            // Provisjoner ny bruker KUN i denne tenanten. Aldri eskaler rolle: USER.
            const fullName = [attrs.firstName, attrs.lastName].filter(Boolean).join(' ').trim();
            const created = await prisma.user.create({
                data: {
                    email,
                    tenantId,
                    firstName: attrs.firstName ?? null,
                    lastName: attrs.lastName ?? null,
                    name: fullName || null,
                    emailVerified: new Date(), // IdP har verifisert identiteten
                    active: true,
                    globalRole: 'USER',
                },
                select: { id: true },
            });
            userId = created.id;
        }

        // Mint kortlivet HMAC-bridge-token og send til /complete.
        const token = signBridgeToken({ userId, tenantId });
        const completeUrl = new URL(
            `/api/auth/saml/${encodeURIComponent(tenantId)}/complete`,
            origin
        );
        completeUrl.searchParams.set('token', token);

        return NextResponse.redirect(completeUrl, 302);
    } catch {
        // Generisk – ingen biblioteks-/validerings-/stack-detaljer ut til klienten.
        return redirectError(origin);
    }
}

/** Oppdater fornavn/etternavn/visningsnavn uten å røre rolle eller tenant. */
async function updateUserNames(
    id: string,
    firstName: string | null,
    lastName: string | null
): Promise<void> {
    const data: { firstName?: string; lastName?: string; name?: string } = {};
    if (firstName) data.firstName = firstName;
    if (lastName) data.lastName = lastName;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (fullName) data.name = fullName;
    if (Object.keys(data).length === 0) return;
    await prisma.user.update({ where: { id }, data });
}

function getOrigin(request: Request): string {
    try {
        return new URL(request.url).origin;
    } catch {
        return 'http://localhost:3000';
    }
}

function redirectError(origin: string): NextResponse {
    return NextResponse.redirect(new URL('/login?error=sso', origin), 302);
}
