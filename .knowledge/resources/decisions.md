# Resource: Architecture Decisions

> **Last updated:** 2026-02-26

---

## Active Decisions

### ADR-001: Use Prisma v7 with pg adapter
- **Date:** Project inception
- **Decision:** Use Prisma v7 with `@prisma/adapter-pg` and `pg` pool
- **Rationale:** Required for Neon.tech serverless PostgreSQL compatibility
- **Consequence:** Must use `new PrismaClient({ adapter })` singleton pattern

### ADR-002: Edge-safe auth splitting
- **Date:** Project inception
- **Decision:** Split auth config into `auth.config.ts` (Edge) and `auth.ts` (Node.js)
- **Rationale:** Next.js middleware runs on Edge runtime which can't use Prisma/Node.js APIs
- **Consequence:** Middleware imports ONLY from `auth.config.ts`

### ADR-003: CSS custom properties for branding
- **Date:** Project inception
- **Decision:** All tenant branding via CSS custom properties injected server-side
- **Rationale:** Enables full whitelabel without page reload; SSR-compatible; no FOUC
- **Consequence:** Zero hardcoded colors in `.module.css` files; all theming via `var(--color-*)`

### ADR-004: Versioned course content model
- **Date:** Course system design
- **Decision:** Courses have immutable `CourseVersion` snapshots; `Course.currentPublishedVersionId` points to active version
- **Rationale:** Preserves learner progress when course content changes
- **Consequence:** Publishing creates new version; progress tied to version at time of enrollment

### ADR-005: Knowledge management with BASB
- **Date:** 2026-02-26
- **Decision:** Implement Tiago Forte's "Building a Second Brain" (PARA + CODE + Progressive Summarization) for project knowledge management
- **Rationale:** Prevents context loss between sessions; provides structured capture/organize/distill workflow
- **Consequence:** `.knowledge/` folder at project root; daily notes mandatory; AI agent must read/update knowledge system

### ADR-006: Hierarchical daily note folder structure
- **Date:** 2026-02-26
- **Decision:** Organize daily notes in `YYYY/MM - MonthName/YYYY-MM-DD.md` subfolders instead of flat `YYYY-MM-DD.md`
- **Rationale:** Better navigation as notes accumulate over months/years; named month folders are human-readable
- **Alternatives:** Flat structure (simpler but clutters folder as notes grow); `YYYY/MM/` numeric-only (less readable)
- **Consequence:** All new daily notes must be created in `daily/YYYY/MM - MonthName/` subfolders; old flat notes migrated

### ADR-007: Recover course system from PR #6 rather than rebuild
- **Date:** 2026-06-09
- **Decision:** The course + learner system was missing from `main` (reset out on 2026-06-05) but preserved on `feature/course-management` (PR #6). Merged that branch into `main` and fixed the one invalid-schema issue, instead of re-implementing ~20k lines.
- **Rationale:** The work was already built, security-hardened, and code-reviewed; the Neon DB still held the data created by that exact schema (`db push` reported "already in sync" after recovery). Rebuilding would be slower and risk diverging from the live data.
- **Alternatives:** Rebuild from scratch (slow, error-prone); `db pull` to introspect (would not bring back the UI/actions code).
- **Consequence:** `main` now contains the full system. The orphan `Tenant.courses Course[]` relation was removed (course models use scalar `tenantId` only, matching all other course models).

### ADR-008: Integrations are config/management surfaces, runtime handshakes deferred
- **Date:** 2026-06-09
- **Decision:** `/admin/integrations` ships SSO/SCIM/Webhooks/LTI **configuration + storage + admin UI + audit logging**, a **working authenticated SCIM `/Users` (GET/POST)** endpoint, and **working HMAC-signed webhook delivery** — but NOT the SAML ACS/assertion-validation flow or the LTI 1.3 OIDC launch handshake.
- **Rationale:** Protocol runtimes are security-critical and large; doing them poorly is worse than not yet. Building honest, gated management surfaces unblocks configuration and avoids repeating the 2026-02 doc/code drift where docs overclaimed completeness.
- **Alternatives:** Attempt full SAML/LTI runtime now (high risk, incomplete); leave the nav items as 404 (poor UX).
- **Consequence:** Manifest marks these `[~]` partial with explicit runtime TODOs. Real SSO login needs an ACS route + Auth.js SAML wiring before use.

### ADR-009: Autonom topp-ned utbygging via stacked PR-er + infra-TODO-policy
- **Date:** 2026-06-09
- **Decision:** Bygg hele gjenværende veikart (Fase 1→3 + marked + LTI) autonomt som 12 stacked feature-branches med én PR per område. Bygg alt som er fullt byggbart + verifiserbart lokalt; scaffold infra-avhengige deler (auto-TLS, host-ruting, object-storage, persisterte nonce-cacher, login-tids 2FA, cron, live-IdP) og merk dem eksplisitt som TODO i PR/manifest.
- **Rationale:** Delt Neon-DB med additivt skjema → stacking holder `schema.prisma` kumulativt slik at `db push` aldri vil droppe tidligere tabeller; én PR per område holder review-bar. Infra-deler kan ikke gjøres produksjonsriktig uten deploy-plattform, så ærlig scaffolding + TODO er bedre enn å late som.
- **Consequence:** Hvert område fikk skjema sentralt (av meg) før parallelle agenter bygde UI/actions, etterfulgt av adversariell hardening og sentral `tsc`+`build`. PR-ene må merges i rekkefølge.

### ADR-010: Sikkerhetskritiske integrasjoner bruker vettede biblioteker, ikke håndrullet krypto
- **Date:** 2026-06-09
- **Decision:** SAML (@node-saml/node-saml), LTI/JWT (jose), TOTP (otplib), SCIM token-hashing (node:crypto). Ingen egen XML-signatur-/JWT-validering.
- **Rationale:** Auth-/krypto-kode gjort feil er et sikkerhetshull; bibliotekene håndterer signatur, conditions, replay (validateInResponseTo) og alg-pinning korrekt.
- **Consequence:** Adversariell hardening-pass per område verifiserte trust-grensene (HMAC-broer mot AUTH_SECRET, JWKS-validering, RS256-pinning, InResponseTo).

---

## Decision Template

```markdown
### ADR-NNN: [Title]
- **Date:** YYYY-MM-DD
- **Decision:** [What was decided]
- **Rationale:** [Why this option was chosen]
- **Alternatives:** [What else was considered]
- **Consequence:** [What this means for the codebase]
```
