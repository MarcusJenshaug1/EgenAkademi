# Project: EgenAkademi — Whitelabel LMS Platform

> **Status:** Active — MVP learning flow complete, expanding features
> **Goal:** Build a multi-tenant, whitelabel Learning Management System
> **Timeline:** Ongoing
> **Last updated:** 2026-02-26

---

## Project Summary

EgenAkademi is a whitelabel LMS platform where each organization (tenant) gets a fully branded learning environment. Built with Next.js 16 App Router, PostgreSQL (Neon.tech), Prisma v7, and Auth.js v5.

> **KEY:** The platform's unique value is deep whitelabel customization — every tenant gets their own colors, logo, fonts, and eventually custom domain. The branding system is complete. The full learning flow (admin course building through learner consumption, progress tracking, certificates, and notifications) is also complete.

---

## Architecture Overview

````
User -> Magic Link login -> Onboarding (create org) -> /admin or /learn
                                                    Admin:
                                                    +-- Branding (complete)
                                                    +-- Courses (catalog + builder + assignment complete)
                                                    +-- Users/Groups/Roles (complete)
                                                    +-- Dashboard (stats cards)
                                                    Learner:
                                                    +-- Dashboard (continue-lesson, stats)
                                                    +-- Course catalog + player (complete)
                                                    +-- My Learning (filter, search)
                                                    +-- Certificates (issued certs)
                                                    +-- Notifications (filter, mark-read)
                                                    +-- Profile (edit form)
````

- **Multi-tenancy:** Every user has a `tenantId`. All queries scoped.
- **Auth:** Edge-safe split — `auth.config.ts` (middleware) / `auth.ts` (full, Node.js)
- **Branding:** 14 DB fields -> CSS custom properties injected in `<html style="">` server-side
- **Feature gating:** `TenantPlan` enum + `addons` array + `features.ts` helper
- **Course versioning:** Immutable `CourseVersion` snapshots, progress preserved across changes

---

## Completed Milestones

### M1: Foundation [x]
- Next.js 16+, TypeScript, Turbopack
- PostgreSQL via Neon.tech, Prisma v7 with pg adapter
- CSS design system with glassmorphism, dark mode, CSS variables
- lucide-react icons

### M2: Authentication [x]
- Auth.js v5 with Magic Link (email OTP)
- Edge-safe middleware splitting
- JWT with tenantId, globalRole, id, tenantPlan
- Onboarding flow (create Tenant + assign TENANT_ADMIN)

### M3: Admin UI [x]
- Sidebar navigation + topbar layout
- Dashboard with stats cards
- User, group, role CRUD
- Profile with avatar

### M4: Branding System [x]
- 14 color fields with live preview
- Server-side CSS variable injection
- Logo upload with SVG recoloring
- Favicon upload
- Google Fonts + custom font upload
- Brand Detector (URL-based automatic detection)
- Manual Color Assistant (5-role -> 14-field generator)
- WCAG AA contrast checking

### M5: Course System (Admin) [x]
- Course catalog with grid view, search, status filter
- Create/delete/archive/restore courses
- Taxonomy management (categories + tags)
- Course detail with tabs: Overview, Builder, Versions
- Course builder: modules with lessons, CRUD, ordering
- Publishing and version management

### M6: Content & Assignment [x]
- Content block editor (LessonBlockEditor) with per-type editing, preview, reordering, CRUD
- Course assignment tab: create/delete/activate/pause rules, force-enroll
- Tildeling av kurs til org, grupper, roller eller enkeltpersoner

### M7: Learner Experience [x]
- Learner shell (`/learn/*`) with sidebar, profile, navigation
- Dashboard with continue-lesson, statistics, in-progress/overdue/completed
- My Learning page with status filter, search, sorting
- Course detail (learner) with module overview, progress, start/continue
- Course player with sidebar-TOC, content blocks (text, video, image, file), mark as complete, prev/next
- Role-based routing: USER -> `/learn`, ADMIN -> `/admin`
- Server actions: dashboard, my courses, course detail, player, marking, tracking
- Certificates page with grid view
- Notifications page with filter (all/unread), mark as read, type icons
- Profile page with editable form (name, phone, location, job title, department, bio)

---

## Current Sprint / Focus

### Next Priorities (Phase 1 remainder + Phase 2 start)

1. **SCORM 1.2/2004 import + runtime** (ICE 6.0) — Complex, enterprise requirement
2. **Custom domain / subdomain support** (ICE 5.7) — DNS verification, CNAME, auto-TLS
3. **Frister og resertifisering** (ICE 5.3) — Due dates, intervals, escalation
4. **Admin analytics dashboard** (ICE 5.7) — Real-time stats, drill-downs
5. **Session/event management** (ICE 5.3) — Instructor-led training

---

## Key Files

| Area | Key Files |
|---|---|
| Auth | `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts` |
| Branding | `src/app/admin/branding/`, `src/app/layout.tsx`, `src/lib/brandingGenerator.ts` |
| Courses (admin) | `src/app/admin/courses/`, `src/app/actions/courseActions.ts`, `courseBuilderActions.ts` |
| Courses (learner) | `src/app/learn/courses/`, `src/app/actions/learnerActions.ts` |
| Users | `src/app/admin/users/`, `src/app/actions/userActions.ts` |
| Groups | `src/app/admin/groups/`, `src/app/actions/groupActions.ts` |
| Database | `prisma/schema.prisma`, `src/lib/prisma.ts` |
| Features | `src/lib/features.ts` |
