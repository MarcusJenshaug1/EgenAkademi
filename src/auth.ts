import NextAuth from "next-auth"
import Nodemailer from "next-auth/providers/nodemailer"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
    ...authConfig,
    adapter: PrismaAdapter(prisma),
    providers: [
        Nodemailer({
            server: {
                host: process.env.EMAIL_SERVER_HOST,
                port: Number(process.env.EMAIL_SERVER_PORT),
                secure: Number(process.env.EMAIL_SERVER_PORT) === 465,
                auth: {
                    user: process.env.EMAIL_SERVER_USER,
                    pass: process.env.EMAIL_SERVER_PASSWORD,
                },
            },
            from: process.env.EMAIL_FROM,
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        ...authConfig.callbacks,
        async jwt({ token, user, trigger, session }) {
            // Kall base-callback først (fra auth.config.ts)
            const baseJwt = authConfig.callbacks?.jwt;
            if (baseJwt) {
                token = await baseJwt({ token, user, trigger, session } as Parameters<typeof baseJwt>[0]);
            }
            
            // Hent tenantPlan og oppdatert globalRole fra database
            if (token.tenantId) {
                if (!token.tenantPlan || trigger === 'update') {
                    const tenant = await prisma.tenant.findUnique({
                        where: { id: token.tenantId as string },
                        select: { plan: true },
                    });
                    if (tenant) {
                        token.tenantPlan = tenant.plan;
                    }
                }

                // Alltid oppdater globalRole fra DB slik at rolleendringer trer i kraft umiddelbart
                if (token.id) {
                    const dbUser = await prisma.user.findUnique({
                        where: { id: token.id as string },
                        select: { globalRole: true },
                    });
                    if (dbUser) {
                        token.globalRole = dbUser.globalRole;
                    }
                }
            }
            
            return token;
        },
        async session({ session, token }) {
            // Kall base-callback først
            const baseSession = authConfig.callbacks?.session;
            if (baseSession) {
                session = await (baseSession as (params: { session: typeof session; token: typeof token }) => Promise<typeof session>)({ session, token });
            }
            
            if (token && session.user) {
                session.user.tenantPlan = token.tenantPlan as typeof session.user.tenantPlan;
            }
            return session;
        },
    },
})
