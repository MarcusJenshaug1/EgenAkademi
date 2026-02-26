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
            const isOnLearn = nextUrl.pathname.startsWith('/learn');
            const isOnOnboarding = nextUrl.pathname.startsWith('/onboarding');

            // Protected routes: admin, learn, onboarding
            if (isOnAdmin || isOnLearn || isOnOnboarding) {
                if (!isLoggedIn) return false; // Redirects til login
            }

            if (isLoggedIn) {
                const hasTenant = !!auth.user.tenantId;
                const isAdmin = auth.user.globalRole === 'TENANT_ADMIN' || auth.user.globalRole === 'SYSTEM_ADMIN';

                if (!hasTenant && !isOnOnboarding) {
                    return Response.redirect(new URL('/onboarding', nextUrl));
                }

                if (hasTenant && isOnOnboarding) {
                    return Response.redirect(new URL(isAdmin ? '/admin' : '/learn', nextUrl));
                }

                // Admin-only: block non-admins from /admin
                if (isOnAdmin && !isAdmin) {
                    return Response.redirect(new URL('/learn', nextUrl));
                }

                if (nextUrl.pathname.startsWith('/login')) {
                    if (!hasTenant) return Response.redirect(new URL('/onboarding', nextUrl));
                    return Response.redirect(new URL(isAdmin ? '/admin' : '/learn', nextUrl));
                }

                // Root redirect
                if (nextUrl.pathname === '/' && hasTenant) {
                    return Response.redirect(new URL(isAdmin ? '/admin' : '/learn', nextUrl));
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
