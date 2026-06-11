import prisma from '@/lib/prisma';

/**
 * Enkel DB-basert fixed-window rate limiter.
 *
 * `key` bør være stabil og spesifikk, f.eks. `login:<email>`, `scim:<tenantId>`,
 * `upload:<userId>`. `max` = tillatte forsøk innenfor `windowMs`.
 *
 * Best-effort: ved en uventet DB-feil "fail-open" (tillater forespørselen) slik
 * at en feilende teller ikke låser ute legitime brukere. Returnerer alltid et
 * resultat (kaster aldri).
 *
 * MERK: dette er en fixed-window-teller (ikke sliding window). For serverless
 * med mange instanser er den korrekt nok for misbruksdemping, men ikke en hard
 * garanti under høy samtidighet.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const existing = await prisma.rateLimit.findUnique({ where: { key } });

    // Ingen teller, eller vinduet er utløpt → start nytt vindu.
    if (!existing || now - existing.windowStart.getTime() >= windowMs) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date(now) },
        update: { count: 1, windowStart: new Date(now) },
      });
      return { allowed: true, remaining: Math.max(0, max - 1), retryAfterMs: 0 };
    }

    // Innenfor vinduet.
    const windowEnds = existing.windowStart.getTime() + windowMs;
    if (existing.count >= max) {
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowEnds - now) };
    }

    const updated = await prisma.rateLimit.update({
      where: { key },
      data: { count: { increment: 1 } },
    });
    return {
      allowed: updated.count <= max,
      remaining: Math.max(0, max - updated.count),
      retryAfterMs: updated.count > max ? Math.max(0, windowEnds - now) : 0,
    };
  } catch {
    // Fail-open: ikke lås ute legitime brukere hvis telleren feiler.
    return { allowed: true, remaining: max, retryAfterMs: 0 };
  }
}
