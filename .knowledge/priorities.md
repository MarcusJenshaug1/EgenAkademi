# Priorities — EgenAkademi

> Last updated: 2026-02-26
> Review and update at the start and end of each session.

---

## Eisenhower Matrix

### DO FIRST (Important + Urgent)

| # | Task | ICE | Status | Notes |
|---|---|---|---|---|
| 1 | SCORM 1.2/2004 import + runtime | 6.0 | Not started | Enterprise requirement, complex. imsmanifest.xml, JS API |
| 2 | Custom domain / subdomain support | 5.7 | Not started | DNS verification, CNAME, auto-TLS. Domain status panel |
| 3 | Frister og resertifisering | 5.3 | Not started | Due dates, recertification intervals, escalation logic |

### SCHEDULE (Important + Not Urgent)

| # | Task | ICE | Status | Notes |
|---|---|---|---|---|
| 4 | Admin analytics dashboard | 5.7 | Not started | Real-time learning paths, deadline violations, drill-downs |
| 5 | Session/event management | 5.3 | Not started | Instructor-led: scheduling, enrollment, attendance, notifications |
| 6 | Onboarding program templates | 5.0 | Not started | "Nyansatt", "Ny leder", auto-assignment, timed rollout |
| 7 | UI gating by tenant plan | 4.7 | Not started | Feature flag system exists, UI enforcement + system admin panel missing |
| 8 | CSV export / BI API | 4.3 | Not started | Users, courses, completions, test results |
| 9 | Dynamic groups (rule-based) | 4.0 | Not started | Auto-membership from user attributes |
| 10 | Storybook setup + component library | 3.7 | Not started | Reusable components, Autodocs, accessibility testing |

### DELEGATE (Not Important + Urgent)

*(Nothing currently)*

### ELIMINATE (Not Important + Not Urgent)

*(Nothing currently)*

---

## ICE Scoring Reference

Each score is (Impact + Confidence + Ease) / 3, rated 1-10.

| Task | Impact | Confidence | Ease | ICE |
|---|---|---|---|---|
| SCORM import/runtime | 8 | 5 | 5 | 6.0 |
| Custom domain support | 6 | 6 | 5 | 5.7 |
| Frister og resertifisering | 7 | 5 | 4 | 5.3 |
| Admin analytics dashboard | 7 | 6 | 4 | 5.7 |
| Session/event mgmt | 6 | 6 | 4 | 5.3 |
| Onboarding templates | 6 | 5 | 4 | 5.0 |
| UI gating by plan | 5 | 5 | 4 | 4.7 |
| CSV export / BI API | 5 | 5 | 3 | 4.3 |
| Dynamic groups | 4 | 5 | 3 | 4.0 |
| Storybook setup | 3 | 5 | 3 | 3.7 |

---

## Completed (move here when done)

- [x] Next.js project setup, Prisma, Auth.js, Edge-safe middleware
- [x] Admin layout with sidebar navigation
- [x] Full branding system (14 color fields, CSS injection, brand detector, manual assistant)
- [x] Course catalog with CRUD, taxonomy, search, filters
- [x] Course builder with modules, lessons, versioning
- [x] User, group, role management
- [x] User profile with avatar
- [x] Feature flag system (`TenantPlan`, addons, trial)
- [x] Content block editor (LessonBlockEditor with per-type editing, preview, ordering, CRUD)
- [x] Course assignment UI (assignment tab with create/delete/activate/pause rules, force-enroll)
- [x] Learner-facing course player (shell, dashboard, course detail, player with content blocks, progress bar)
- [x] Progress tracking system (LessonProgress, ModuleProgress, ProgressEvent, mark-as-complete)
- [x] Learner dashboard (continue-lesson, stats, in-progress/overdue/completed courses)
- [x] My Learning page (status filter, search, sorting)
- [x] Certificates page (grid view of issued certificates)
- [x] Notifications page (filter all/unread, mark-as-read, type icons)
- [x] Learner profile (editable form: name, phone, location, job title, department, bio)
- [x] Role-based routing (USER to /learn, ADMIN to /admin, with protection)
- [x] Knowledge management system setup (BASB: PARA + CODE + Eisenhower+ICE)

---

## Notes on Prioritization

- **MVP Core is DONE:** Content blocks, assignment, player, progress tracking, certificates, notifications — full end-to-end learning flow works.
- **Next focus:** SCORM, custom domains, analytics — features that differentiate the platform for paying customers.
- **Enterprise features** (SSO, SCIM, compliance, gamification) are Phase 2-3 per manifest.
- **Market site** is separate track, not blocking core product.
