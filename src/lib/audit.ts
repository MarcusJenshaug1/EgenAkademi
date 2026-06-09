import 'server-only';

import prisma from '@/lib/prisma';

/**
 * EgenAkademi – Audit-logging
 *
 * Skriv en sikkerhetshendelse til AuditLog. Denne funksjonen skal ALDRI
 * kaste en feil videre til den som kaller den – audit-logging er en
 * "best effort"-bivirkning og må aldri velte den egentlige operasjonen.
 *
 * Server-only: importeres aldri i klientkode.
 */

export interface AuditInput {
    tenantId: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: unknown;
    ip?: string | null;
}

export async function logAudit(input: AuditInput): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                tenantId: input.tenantId,
                actorUserId: input.actorUserId ?? null,
                actorEmail: input.actorEmail ?? null,
                action: input.action,
                targetType: input.targetType ?? null,
                targetId: input.targetId ?? null,
                // Prisma Json-felt: send objektet hvis satt, ellers undefined
                // (lar databasen bruke default/null). Følger repo-konvensjonen
                // i sessionActions.ts for valgfri metadata.
                metadata:
                    input.metadata == null ? undefined : (input.metadata as object),
                ip: input.ip ?? null,
            },
        });
    } catch {
        // Swallow: audit-logging skal aldri kaste videre eller lekke interne feil.
        // Bevisst ingen console-logging i kode som shipper.
    }
}
