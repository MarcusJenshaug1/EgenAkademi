import { NextRequest } from 'next/server';
import { scimJson, SCIM_SCHEMAS } from '@/lib/scimAuth';

/**
 * SCIM 2.0 – Schemas (discovery).
 *
 * Returnerer kjerneskjemaene tjenesten støtter (User, Group), begrenset til
 * attributtene vi faktisk forvalter. Discovery kan eksponeres uten
 * autentisering (RFC 7644 §4). CORS aldri '*'.
 */

function attr(
    name: string,
    type: string,
    opts?: Partial<{
        required: boolean;
        mutability: string;
        uniqueness: string;
        multiValued: boolean;
        subAttributes: unknown[];
        caseExact: boolean;
    }>,
) {
    return {
        name,
        type,
        multiValued: opts?.multiValued ?? false,
        required: opts?.required ?? false,
        caseExact: opts?.caseExact ?? false,
        mutability: opts?.mutability ?? 'readWrite',
        returned: 'default',
        uniqueness: opts?.uniqueness ?? 'none',
        ...(opts?.subAttributes ? { subAttributes: opts.subAttributes } : {}),
    };
}

export async function GET(req: NextRequest) {
    const baseUrl = new URL(req.url).origin;

    const userSchema = {
        schemas: [SCIM_SCHEMAS.SCHEMA],
        id: SCIM_SCHEMAS.USER,
        name: 'User',
        description: 'SCIM 2.0 User',
        attributes: [
            attr('userName', 'string', { required: true, uniqueness: 'server' }),
            attr('externalId', 'string'),
            attr('active', 'boolean'),
            attr('displayName', 'string'),
            attr('name', 'complex', {
                subAttributes: [
                    attr('givenName', 'string'),
                    attr('familyName', 'string'),
                    attr('formatted', 'string'),
                ],
            }),
            attr('emails', 'complex', {
                multiValued: true,
                subAttributes: [
                    attr('value', 'string'),
                    attr('primary', 'boolean'),
                    attr('type', 'string'),
                ],
            }),
        ],
        meta: {
            resourceType: 'Schema',
            location: `${baseUrl}/api/scim/v2/Schemas/${SCIM_SCHEMAS.USER}`,
        },
    };

    const groupSchema = {
        schemas: [SCIM_SCHEMAS.SCHEMA],
        id: SCIM_SCHEMAS.GROUP,
        name: 'Group',
        description: 'SCIM 2.0 Group',
        attributes: [
            attr('displayName', 'string', { required: true }),
            attr('externalId', 'string'),
            attr('members', 'complex', {
                multiValued: true,
                subAttributes: [
                    attr('value', 'string'),
                    attr('display', 'string'),
                    attr('$ref', 'reference'),
                ],
            }),
        ],
        meta: {
            resourceType: 'Schema',
            location: `${baseUrl}/api/scim/v2/Schemas/${SCIM_SCHEMAS.GROUP}`,
        },
    };

    const schemas = [userSchema, groupSchema];
    return scimJson({
        schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
        totalResults: schemas.length,
        startIndex: 1,
        itemsPerPage: schemas.length,
        Resources: schemas,
    });
}
