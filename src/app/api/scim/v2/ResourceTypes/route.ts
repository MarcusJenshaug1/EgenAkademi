import { NextRequest } from 'next/server';
import { scimJson, SCIM_SCHEMAS } from '@/lib/scimAuth';

/**
 * SCIM 2.0 – ResourceTypes (discovery).
 *
 * Lister ressurstypene tjenesten eksponerer (User, Group). Discovery kan
 * eksponeres uten autentisering (RFC 7644 §4). CORS aldri '*'.
 */

export async function GET(req: NextRequest) {
    const baseUrl = new URL(req.url).origin;

    const resources = [
        {
            schemas: [SCIM_SCHEMAS.RESOURCE_TYPE],
            id: 'User',
            name: 'User',
            endpoint: '/Users',
            description: 'SCIM 2.0 User',
            schema: SCIM_SCHEMAS.USER,
            schemaExtensions: [],
            meta: {
                resourceType: 'ResourceType',
                location: `${baseUrl}/api/scim/v2/ResourceTypes/User`,
            },
        },
        {
            schemas: [SCIM_SCHEMAS.RESOURCE_TYPE],
            id: 'Group',
            name: 'Group',
            endpoint: '/Groups',
            description: 'SCIM 2.0 Group',
            schema: SCIM_SCHEMAS.GROUP,
            schemaExtensions: [],
            meta: {
                resourceType: 'ResourceType',
                location: `${baseUrl}/api/scim/v2/ResourceTypes/Group`,
            },
        },
    ];

    return scimJson({
        schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
        totalResults: resources.length,
        startIndex: 1,
        itemsPerPage: resources.length,
        Resources: resources,
    });
}
