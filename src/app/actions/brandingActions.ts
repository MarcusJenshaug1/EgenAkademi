'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';

// Alle branding-felter som kan settes av tenant admin
const BRANDING_FIELDS = [
    'colorBgPrimary',
    'colorBgSecondary',
    'colorTextPrimary',
    'colorTextSecondary',
    'colorBorder',
    'colorAccent',
    'colorButtonPrimary',
    'colorButtonText',
    'colorSidebarBg',
    'colorSidebarText',
    'colorSidebarActive',
    'colorSuccess',
    'colorWarning',
    'colorDanger',
    'logoUrl',
    'logoSvgContent',
    'logoSvgModified',
    'faviconUrl',
    'faviconSvgContent',
    'faviconSvgModified',
    'fontFamily',
    'fontHeading',
    'fontSource',
    'customFontUrl',
] as const;

const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/i;

const COLOR_FIELDS: string[] = BRANDING_FIELDS.filter(
    (f) => f.startsWith('color')
);

export async function updateBranding(formData: FormData) {
    try {
        const session = await auth();

        if (!session?.user?.id || !session?.user?.tenantId) {
            return { error: 'Ikke autentisert eller mangler organisasjonstilknytning' };
        }

        if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
            return { error: 'Du har ikke rettigheter til dette' };
        }

        const data: Record<string, string | null> = {};

        // Håndter organisasjonsnavn separat (ikke et branding-farge-felt)
        const tenantName = formData.get('tenantName') as string | null;
        if (tenantName && tenantName.trim().length >= 2) {
            data.name = tenantName.trim();
        }

        for (const field of BRANDING_FIELDS) {
            const value = formData.get(field) as string | null;

            if (value && value.trim()) {
                if (COLOR_FIELDS.includes(field)) {
                    if (!hexRegex.test(value.trim())) {
                        return {
                            error: `Ugyldig fargeverdi for ${field}: "${value}". Bruk hex-format (#FF0000).`
                        };
                    }
                }
                data[field] = value.trim();
            } else {
                data[field] = null;
            }
        }

        await prisma.tenant.update({
            where: { id: session.user.tenantId },
            data,
        });

        return { success: true };
    } catch (e: any) {
        console.error("Feil ved oppdatering av branding:", e);
        return { error: e.message || 'En uventet systemfeil oppstod.' };
    }
}

export async function resetBranding() {
    try {
        const session = await auth();

        if (!session?.user?.id || !session?.user?.tenantId) {
            return { error: 'Ikke autentisert eller mangler organisasjonstilknytning' };
        }

        if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
            return { error: 'Du har ikke rettigheter til dette' };
        }

        const data: Record<string, null> = {};
        for (const field of BRANDING_FIELDS) {
            data[field] = null;
        }

        await prisma.tenant.update({
            where: { id: session.user.tenantId },
            data,
        });

        return { success: true };
    } catch (e: any) {
        console.error("Feil ved tilbakestilling av branding:", e);
        return { error: e.message || 'En uventet systemfeil oppstod.' };
    }
}
