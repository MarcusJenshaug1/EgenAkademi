# Area: Authentication & Authorization

> **Status:** Complete and maintained
> **Last updated:** 2026-02-26

---

## Overview

Auth is handled by Auth.js v5 (NextAuth) with Magic Link (email OTP) as the primary login method. Edge-safe architecture ensures middleware works on all deployment targets.

> **KEY:** The auth system is split into two files for Edge compatibility. `auth.config.ts` (Edge-safe, no Prisma) is used by middleware. `auth.ts` (full Node.js, with Prisma) handles actual auth logic.

---

## Architecture

```
src/auth.config.ts  → Edge-safe config (imported by middleware)
src/auth.ts         → Full config with Prisma + Nodemailer (Node.js only)
src/middleware.ts   → Imports ONLY from auth.config.ts
```

## Session Data (JWT)

- `id` — User ID
- `tenantId` — Tenant (organization) ID
- `globalRole` — `USER` | `TENANT_ADMIN` | `SYSTEM_ADMIN`
- `tenantPlan` — Plan tier for feature gating

## Routing Flow

```
/login → Magic Link email → /onboarding (if new user, no tenant) → /admin
```

## Type Extensions

`src/types/next-auth.d.ts` extends the default NextAuth types with our custom session fields.

## Rules

1. NEVER import from `auth.ts` in middleware — only `auth.config.ts`
2. All server actions MUST check `session.user.tenantId`
3. Session type changes require updating `src/types/next-auth.d.ts`
