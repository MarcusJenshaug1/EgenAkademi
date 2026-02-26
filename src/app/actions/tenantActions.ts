'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';

export async function createTenantAndAssign(formData: FormData) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return { error: 'Ikke autentisert' };
        }

        if (session.user.tenantId) {
            return { error: 'Bruker har allerede en organisasjon' };
        }

        const tenantName = formData.get('tenantName') as string;
        if (!tenantName || tenantName.length < 2) {
            return { error: 'Organisasjonsnavn er ugyldig eller for kort' };
        }

        // 1. Opprett Tenant
        const newTenant = await prisma.tenant.create({
            data: {
                name: tenantName,
            },
        });

        // 2. Oppdater Bruker – oppretteren får SYSTEM_ADMIN (høyeste tilgang)
        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                tenantId: newTenant.id,
                globalRole: 'SYSTEM_ADMIN',
            },
        });

        // La klient-siden ta seg av redirecten og session refresh
        return { success: true, tenantId: newTenant.id };
    } catch (e: any) {
        console.error("Feil ved opprettelse av tenant:", e);
        return { error: e.message || 'En uventet systemfeil oppstod.' };
    }
}
