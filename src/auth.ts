import NextAuth from "next-auth"
import Nodemailer from "next-auth/providers/nodemailer"
import Credentials from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { createTransport } from "nodemailer"
import prisma from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rateLimit"
import { verifyBridgeToken } from "@/lib/saml"
import { authConfig } from "./auth.config"

/**
 * HTML-escape for trygg innsetting i e-postmal (host vises i meldingen).
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

/**
 * Standard magic-link e-postmal (HTML + tekst). Speiler Auth.js sin innebygde
 * mal slik at vi beholder samme utseende når vi overstyrer sendVerificationRequest.
 */
function magicLinkEmailHtml(params: { url: string; host: string }): string {
    const { url, host } = params
    const safeHost = escapeHtml(host)
    return `
<body style="background: #f9f9f9;">
  <table width="100%" border="0" cellspacing="20" cellpadding="0"
    style="background: #ffffff; max-width: 600px; margin: auto; border-radius: 10px;">
    <tr>
      <td align="center"
        style="padding: 10px 0px; font-size: 22px; font-family: Helvetica, Arial, sans-serif; color: #444444;">
        Logg inn på <strong>${safeHost}</strong>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td align="center" style="border-radius: 5px;" bgcolor="#346df1">
              <a href="${url}" target="_blank"
                style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid #346df1; display: inline-block;">
                Logg inn
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center"
        style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: #444444;">
        Hvis du ikke ba om denne e-posten, kan du trygt ignorere den.
      </td>
    </tr>
  </table>
</body>`
}

function magicLinkEmailText(params: { url: string; host: string }): string {
    return `Logg inn på ${params.host}\n${params.url}\n\nHvis du ikke ba om denne e-posten, kan du trygt ignorere den.\n`
}

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
            /**
             * Rate-limiting (sikkerhetsregel #8): maks 3 magic-link-forespørsler
             * per e-post per time. Overstyrer Auth.js sin innebygde sender slik at
             * vi kan blokkere FØR e-posten sendes. Ved overskridelse kastes en
             * generisk feil – ingen e-post sendes, og Auth.js viser en auth-feil.
             *
             * Server/from-konfig over beholdes uendret og brukes til selve sendingen.
             */
            async sendVerificationRequest(params) {
                const { identifier, url, provider } = params
                const normalizedEmail = identifier.trim().toLowerCase()

                const rl = await checkRateLimit(`login:${normalizedEmail}`, 3, 3_600_000)
                if (!rl.allowed) {
                    // Generisk feil – ingen e-post/adresse/token lekkes.
                    throw new Error("Rate limit exceeded")
                }

                const { host } = new URL(url)
                if (!provider.server) {
                    // Generisk feil – ingen interne konfig-detaljer lekkes.
                    throw new Error("Email transport not configured")
                }
                const transport = createTransport(provider.server)
                const result = await transport.sendMail({
                    to: identifier,
                    from: provider.from,
                    subject: `Logg inn på ${host}`,
                    text: magicLinkEmailText({ url, host }),
                    html: magicLinkEmailHtml({ url, host }),
                })
                // Speiler Auth.js' standardatferd: om SMTP avviser/utsetter
                // mottakeren, skal innloggingen feile i stedet for å gi brukeren
                // en falsk «e-post sendt»-bekreftelse. Generisk feil – ingen
                // adresser/transport-detaljer lekkes.
                const rejected = result.rejected || []
                const pending = result.pending || []
                const failed = rejected.concat(pending).filter(Boolean)
                if (failed.length) {
                    throw new Error("Verification email could not be sent")
                }
            },
        }),
        /**
         * SAML-bro: etablerer en Auth.js-sesjon etter at vår egen ACS
         * (/api/auth/saml/[tenantId]/acs) har validert SAML-svaret kryptografisk.
         *
         * TILLITSGRENSE: Denne provideren stoler UTELUKKENDE på et bridge-token
         * signert med AUTH_SECRET-HMAC og mintet av vår egen ACS. Den utfører
         * INGEN SAML-validering selv – den verifiserer kun HMAC-signatur + utløp
         * (verifyBridgeToken) og laster brukeren by id+tenant. Tokenet eksponeres
         * aldri for IdP/nettleser utover den korte /acs → /complete-redirecten,
         * og kan ikke forfalskes uten AUTH_SECRET. Ved ethvert ugyldig/utløpt
         * token returneres null (ingen sesjon opprettes).
         */
        Credentials({
            id: "saml-bridge",
            name: "SAML",
            credentials: {
                token: { type: "text" },
            },
            async authorize(credentials) {
                const token = typeof credentials?.token === "string" ? credentials.token : null
                const payload = verifyBridgeToken(token)
                if (!payload) return null

                // Last brukeren STRENGT på id + tenant fra tokenet. Avvis om
                // bruker ikke finnes, er deaktivert, eller tenant ikke matcher.
                const user = await prisma.user.findFirst({
                    where: { id: payload.userId, tenantId: payload.tenantId, active: true },
                    select: {
                        id: true,
                        tenantId: true,
                        globalRole: true,
                        email: true,
                        name: true,
                    },
                })
                if (!user) return null

                // Returneres til jwt/session-callbackene (auth.config.ts) som
                // populerer token.id/tenantId/globalRole.
                return {
                    id: user.id,
                    tenantId: user.tenantId,
                    globalRole: user.globalRole,
                    email: user.email,
                    name: user.name,
                }
            },
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
