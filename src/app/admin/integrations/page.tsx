import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import IntegrationsClient, {
    type IntegrationsData,
} from './IntegrationsClient';

export default async function IntegrationsPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/admin');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        redirect('/admin');
    }

    const tenantId = session.user.tenantId;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });

    if (!tenant) {
        redirect('/admin');
    }

    // Per-feature tilgangsflagg + årsak (fra checkAccess) for upgrade-kort.
    const ssoAccess = checkAccess(tenant, 'sso-saml');
    const scimAccess = checkAccess(tenant, 'scim');
    const webhooksAccess = checkAccess(tenant, 'webhooks');
    const ltiAccess = checkAccess(tenant, 'lti');
    const auditAccess = checkAccess(tenant, 'audit-logging');

    // Hent tilstand kun for de feature-ene tenanten faktisk har tilgang til.
    const [ssoConn, scimTokens, webhooks, ltiPlatforms, auditLogs] = await Promise.all([
        ssoAccess.allowed
            ? prisma.ssoConnection.findUnique({ where: { tenantId } })
            : Promise.resolve(null),
        scimAccess.allowed
            ? prisma.scimToken.findMany({
                  where: { tenantId },
                  select: {
                      id: true,
                      name: true,
                      tokenPrefix: true,
                      lastUsedAt: true,
                      expiresAt: true,
                      revokedAt: true,
                      createdAt: true,
                  },
                  orderBy: { createdAt: 'desc' },
              })
            : Promise.resolve([]),
        webhooksAccess.allowed
            ? prisma.webhook.findMany({
                  where: { tenantId },
                  select: {
                      id: true,
                      url: true,
                      events: true,
                      enabled: true,
                      createdAt: true,
                      updatedAt: true,
                  },
                  orderBy: { createdAt: 'desc' },
              })
            : Promise.resolve([]),
        ltiAccess.allowed
            ? prisma.ltiPlatform.findMany({
                  where: { tenantId },
                  orderBy: { createdAt: 'desc' },
              })
            : Promise.resolve([]),
        auditAccess.allowed
            ? prisma.auditLog.findMany({
                  where: { tenantId },
                  select: {
                      id: true,
                      actorEmail: true,
                      action: true,
                      targetType: true,
                      targetId: true,
                      ip: true,
                      createdAt: true,
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 100,
              })
            : Promise.resolve([]),
    ]);

    // Base-URL for per-tenant SP-endepunkter (login/ACS/metadata). Samme kilde
    // som src/lib/saml.ts slik at admin ser nøyaktig URL-ene IdP skal bruke.
    const baseUrl = (
        process.env.AUTH_URL ||
        process.env.NEXTAUTH_URL ||
        'http://localhost:3000'
    ).replace(/\/+$/, '');

    const data: IntegrationsData = {
        tenantId,
        baseUrl,
        access: {
            sso: { allowed: ssoAccess.allowed, reason: ssoAccess.reason ?? null },
            scim: { allowed: scimAccess.allowed, reason: scimAccess.reason ?? null },
            webhooks: { allowed: webhooksAccess.allowed, reason: webhooksAccess.reason ?? null },
            lti: { allowed: ltiAccess.allowed, reason: ltiAccess.reason ?? null },
            audit: { allowed: auditAccess.allowed, reason: auditAccess.reason ?? null },
        },
        sso: ssoConn
            ? {
                  id: ssoConn.id,
                  protocol: ssoConn.protocol,
                  enabled: ssoConn.enabled,
                  idpEntityId: ssoConn.idpEntityId,
                  idpSsoUrl: ssoConn.idpSsoUrl,
                  idpCertificate: ssoConn.idpCertificate,
                  spEntityId: ssoConn.spEntityId,
                  attributeMapping:
                      (ssoConn.attributeMapping as Record<string, string> | null) ?? null,
                  createdAt: ssoConn.createdAt,
                  updatedAt: ssoConn.updatedAt,
              }
            : null,
        scimTokens,
        webhooks,
        ltiPlatforms,
        auditLogs,
    };

    return <IntegrationsClient data={data} />;
}
