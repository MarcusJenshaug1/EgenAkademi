# Project: EgenAkademi — Whitelabel LMS Platform

> **Status:** Active — MVP in progress
> **Goal:** Build a multi-tenant, whitelabel Learning Management System
> **Timeline:** Ongoing
> **Last updated:** 2026-02-26

---

## Project Summary

EgenAkademi is a whitelabel LMS platform where each organization (tenant) gets a fully branded learning environment. Built with Next.js App Router, PostgreSQL (Neon.tech), Prisma v7, and Auth.js v5.

> **KEY:** The platform's unique value is deep whitelabel customization — every tenant gets their own colors, logo, fonts, and eventually custom domain. The branding system is complete. The focus now shifts to the learning flow.

---

## Architecture Overview

```
User → Magic Link login → Onboarding (create org) → /admin dashboard
                                                    ├── Branding (complete)
                                                    ├── Courses (catalog + builder complete)
                                                    ├── Users/Groups/Roles (complete)
                                                    └── [Learner player] (not built)
```

- **Multi-tenancy:** Every user has a `tenantId`. All queries scoped.
- **Auth:** Edge-safe split — `auth.config.ts` (middleware) / `auth.ts` (full, Node.js)
- **Branding:** 14 DB fields → CSS custom properties injected in `<html style="">` server-side
- **Feature gating:** `TenantPlan` enum + `addons` array + `features.ts` helper

---

## Completed Milestones

### M1: Foundation ✅
- Next.js 15+, TypeScript, Turbopack
- PostgreSQL via Neon.tech, Prisma v7 with pg adapter
- CSS design system with glassmorphism, dark mode, CSS variables
- lucide-react icons

### M2: Authentication ✅
- Auth.js v5 with Magic Link (email OTP)
- Edge-safe middleware splitting
- JWT with tenantId, globalRole, id
- Onboarding flow (create Tenant + assign TENANT_ADMIN)

### M3: Admin UI ✅
- Sidebar navigation + topbar layout
- Dashboard with stats cards
- User, group, role CRUD
- Profile with avatar

### M4: Branding System ✅
- 14 color fields with live preview
- Server-side CSS variable injection
- Logo upload with SVG recoloring
- Favicon upload
- Google Fonts + custom font upload
- Brand Detector (URL-based automatic detection)
- Manual Color Assistant (5-role → 14-field generator)
- WCAG AA contrast checking

### M5: Course System (Admin) ✅
- Course catalog with grid view, search, status filter
- Create/delete/archive/restore courses
- Taxonomy management (categories + tags)
- Course detail with tabs: Overview, Builder, Versions
- Course builder: modules with lessons, CRUD, ordering
- Publishing and version management

---

## Current Sprint / Focus

### M6: Learning Flow (MVP) — NOT STARTED
Priority order (ICE scored — see priorities.md):

1. **Content block editor** (ICE 8.0) — Rich text, images, video, quiz blocks inside lessons
2. **Course assignment UI** (ICE 7.7) — Assign courses to users/groups/roles
3. **Learner course player** (ICE 7.3) — Student-facing course consumption
4. **Progress tracking** (ICE 7.0) — Track completion per lesson/module/course

### Key DB Models Already in Place
- `LessonBlock` (type: TEXT, IMAGE, VIDEO, QUIZ, DOCUMENT, EMBED)
- `CourseAssignmentRule` (scope: EVERYONE, GROUP, ROLE, INDIVIDUAL)
- `CourseEnrollment` (status: ENROLLED, STARTED, COMPLETED, etc.)
- `LessonProgress`, `ModuleProgress`, `ProgressEvent`

---

## Open Questions

- Content block storage: JSON in `LessonBlock.content` or structured fields?
- Video hosting: upload to local storage, or integrate with external (YouTube, Vimeo, Mux)?
- Quiz engine: simple inline quiz, or full assessment module?
- SCORM runtime: build custom JS API bridge, or use open-source library?

---

## Key Files

| Area | Key Files |
|---|---|
| Auth | `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts` |
| Branding | `src/app/admin/branding/`, `src/app/layout.tsx`, `src/lib/brandingGenerator.ts` |
| Courses | `src/app/admin/courses/`, `src/app/actions/courseActions.ts`, `courseBuilderActions.ts` |
| Users | `src/app/admin/users/`, `src/app/actions/userActions.ts` |
| Groups | `src/app/admin/groups/`, `src/app/actions/groupActions.ts` |
| Database | `prisma/schema.prisma`, `src/lib/prisma.ts` |
| Features | `src/lib/features.ts` |
