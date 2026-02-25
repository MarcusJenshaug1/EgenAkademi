import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            tenantId?: string | null;
            globalRole?: string;
        } & DefaultSession['user'];
    }

    interface User {
        tenantId?: string | null;
        globalRole?: string;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        tenantId?: string | null;
        globalRole?: string;
    }
}
