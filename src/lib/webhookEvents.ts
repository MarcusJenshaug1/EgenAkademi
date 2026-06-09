/**
 * Webhook-hendelser som kan abonneres på.
 *
 * Ligger i en vanlig modul (ikke en 'use server'-fil) fordi en 'use server'-fil
 * kun kan eksportere async-funksjoner — ikke konstanter/objekter.
 * Importeres både av integrationActions.ts (server) og IntegrationsClient.tsx (klient).
 */
export const WEBHOOK_EVENTS = [
    'user.created',
    'user.updated',
    'user.deactivated',
    'course.published',
    'course.completed',
    'enrollment.created',
    'certificate.issued',
    'session.scheduled',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
