import 'server-only';

import { SCIM_SCHEMAS } from '@/lib/scimAuth';

/**
 * EgenAkademi – SCIM 2.0 ressurs-mappere.
 *
 * Konverterer interne Prisma-modeller til SCIM-representasjoner (User/Group).
 * Holdes adskilt fra rutene slik at form er konsistent på tvers av
 * list/get/create/update.
 */

export interface ScimUserModel {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    active: boolean;
    externalId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export function toScimUser(user: ScimUserModel, baseUrl?: string) {
    const formatted =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.name ||
        (user.email ?? '');

    return {
        schemas: [SCIM_SCHEMAS.USER],
        id: user.id,
        ...(user.externalId ? { externalId: user.externalId } : {}),
        userName: user.email ?? user.id,
        name: {
            givenName: user.firstName ?? '',
            familyName: user.lastName ?? '',
            formatted,
        },
        displayName: formatted,
        emails: user.email
            ? [{ value: user.email, primary: true, type: 'work' }]
            : [],
        active: user.active,
        meta: {
            resourceType: 'User',
            created: user.createdAt.toISOString(),
            lastModified: user.updatedAt.toISOString(),
            ...(baseUrl ? { location: `${baseUrl}/api/scim/v2/Users/${user.id}` } : {}),
        },
    };
}

export interface ScimGroupMemberModel {
    userId: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
}

export interface ScimGroupModel {
    id: string;
    name: string;
    externalId: string | null;
    createdAt: Date;
    updatedAt: Date;
    members: ScimGroupMemberModel[];
}

export function toScimGroup(group: ScimGroupModel, baseUrl?: string) {
    return {
        schemas: [SCIM_SCHEMAS.GROUP],
        id: group.id,
        ...(group.externalId ? { externalId: group.externalId } : {}),
        displayName: group.name,
        members: group.members.map((m) => ({
            value: m.userId,
            display:
                [m.firstName, m.lastName].filter(Boolean).join(' ') ||
                m.name ||
                (m.email ?? m.userId),
            ...(baseUrl ? { $ref: `${baseUrl}/api/scim/v2/Users/${m.userId}` } : {}),
        })),
        meta: {
            resourceType: 'Group',
            created: group.createdAt.toISOString(),
            lastModified: group.updatedAt.toISOString(),
            ...(baseUrl ? { location: `${baseUrl}/api/scim/v2/Groups/${group.id}` } : {}),
        },
    };
}

/**
 * Parse en minimal SCIM-filter: kun `<attr> eq "<value>"`.
 * Returnerer { attribute, value } eller null hvis filteret ikke gjenkjennes.
 *
 * Begrensning (se followups): kun likhets-filter på ett attributt støttes.
 */
export function parseEqFilter(filter: string): { attribute: string; value: string } | null {
    const m = /^\s*([\w.]+)\s+eq\s+"([^"]*)"\s*$/i.exec(filter);
    if (!m) return null;
    return { attribute: m[1], value: m[2] };
}

/** Les og normaliser SCIM paginering (startIndex 1-basert, count begrenset). */
export function parsePagination(url: URL): { startIndex: number; count: number } {
    const startIndex = Math.max(
        parseInt(url.searchParams.get('startIndex') ?? '1', 10) || 1,
        1,
    );
    const count = Math.min(
        Math.max(parseInt(url.searchParams.get('count') ?? '100', 10) || 100, 0),
        200,
    );
    return { startIndex, count };
}
