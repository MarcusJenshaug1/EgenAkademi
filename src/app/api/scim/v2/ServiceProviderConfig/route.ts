import { NextRequest } from 'next/server';
import { scimJson, SCIM_SCHEMAS } from '@/lib/scimAuth';

/**
 * SCIM 2.0 – ServiceProviderConfig (discovery).
 *
 * Per RFC 7644 §4 kan discovery-endepunkter eksponeres uten autentisering.
 * Vi holder dette minimalt og statisk. Ingen tenant-data lekkes; CORS aldri '*'.
 */

export async function GET(req: NextRequest) {
    const baseUrl = new URL(req.url).origin;
    return scimJson({
        schemas: [SCIM_SCHEMAS.SERVICE_PROVIDER_CONFIG],
        documentationUri: `${baseUrl}/docs/scim`,
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [
            {
                type: 'oauthbearertoken',
                name: 'OAuth Bearer Token',
                description:
                    'Autentisering via Bearer-token i Authorization-headeren.',
                specUri: 'https://www.rfc-editor.org/info/rfc6750',
                primary: true,
            },
        ],
        meta: {
            resourceType: 'ServiceProviderConfig',
            location: `${baseUrl}/api/scim/v2/ServiceProviderConfig`,
        },
    });
}
