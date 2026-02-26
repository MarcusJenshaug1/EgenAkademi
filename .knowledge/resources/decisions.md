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
