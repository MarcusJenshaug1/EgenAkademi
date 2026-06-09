import type { DefaultSession } from 'next-auth';
import type { TenantPlan } from '@prisma/client';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            tenantId?: string | null;
            globalRole?: string;
            tenantPlan?: TenantPlan;
        } & DefaultSession['user'];
    }

    interface User {
        tenantId?: string | null;
        globalRole?: string;
        tenantPlan?: TenantPlan;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        tenantId?: string | null;
        globalRole?: string;
        tenantPlan?: TenantPlan;
    }
}
