import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login',
    },
    providers: [], // Legges til i auth.ts der Node.js API er tilgjengelig
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isOnAdmin = nextUrl.pathname.startsWith('/admin');
            const isOnOnboarding = nextUrl.pathname.startsWith('/onboarding');

            if (isOnAdmin || isOnOnboarding) {
                if (!isLoggedIn) return false; // Redirects til login
            }

            if (isLoggedIn) {
                // tenantId er satt til string i typene v\u00e5re
                const hasTenant = !!auth.user.tenantId;

                if (!hasTenant && !isOnOnboarding) {
                    return Response.redirect(new URL('/onboarding', nextUrl));
                }

                if (hasTenant && isOnOnboarding) {
                    return Response.redirect(new URL('/admin', nextUrl));
                }

                if (nextUrl.pathname.startsWith('/login')) {
                    return Response.redirect(new URL(hasTenant ? '/admin' : '/onboarding', nextUrl));
                }
            }
            return true;
        },
        async jwt({ token, user, trigger, session }) {
            if (user) {
                token.id = user.id as string;
                token.tenantId = user.tenantId;
                token.globalRole = user.globalRole;
            }
            if (trigger === "update" && session) {
                if (session.tenantId) token.tenantId = session.tenantId;
                if (session.globalRole) token.globalRole = session.globalRole;
            }
            return token;
        },
        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string;
                session.user.tenantId = token.tenantId as string | null | undefined;
                session.user.globalRole = token.globalRole as string | undefined;
            }
            return session;
        },
    },
} satisfies NextAuthConfig;
