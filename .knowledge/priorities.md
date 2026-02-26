# Priorities — EgenAkademi

> Last updated: 2026-02-26
> Review and update at the start and end of each session.

---

## Eisenhower Matrix

### DO FIRST (Important + Urgent)

| # | Task | ICE | Status | Notes |
|---|---|---|---|---|
| 1 | Content block editor for lessons | 8.0 | Not started | Core MVP feature — lessons need actual content |
| 2 | Course assignment UI | 7.7 | Not started | DB model ready, UI missing. Needed for end-to-end flow |

### SCHEDULE (Important + Not Urgent)

| # | Task | ICE | Status | Notes |
|---|---|---|---|---|
| 3 | Learner-facing course player | 7.3 | Not started | Front-end for students to consume courses |
| 4 | Progress tracking system | 7.0 | Not started | DB models exist (`LessonProgress`, `ModuleProgress`, `ProgressEvent`) |
| 5 | SCORM 1.2/2004 import + runtime | 6.0 | Not started | Enterprise requirement, complex |
| 6 | Custom domain / subdomain support | 5.7 | Not started | DNS verification, CNAME, auto-TLS |
| 7 | Session/event management | 5.3 | Not started | Instructor-led training support |
| 8 | Admin analytics dashboard | 5.0 | Not started | Completion rates, drill-downs, exports |
| 9 | Onboarding program templates | 4.7 | Not started | "New hire", "New manager" etc. |
| 10 | UI gating by tenant plan | 4.3 | Not started | Feature flag system exists, UI enforcement missing |

### DELEGATE (Not Important + Urgent)

*(Nothing currently)*

### ELIMINATE (Not Important + Not Urgent)

*(Nothing currently)*

---

## ICE Scoring Reference

Each score is (Impact + Confidence + Ease) / 3, rated 1-10.

| Task | Impact | Confidence | Ease | ICE |
|---|---|---|---|---|
| Content block editor | 9 | 8 | 7 | 8.0 |
| Course assignment UI | 8 | 8 | 7 | 7.7 |
| Learner course player | 9 | 7 | 6 | 7.3 |
| Progress tracking | 8 | 7 | 6 | 7.0 |
| SCORM import/runtime | 8 | 5 | 5 | 6.0 |
| Custom domain support | 6 | 6 | 5 | 5.7 |
| Session/event mgmt | 6 | 6 | 4 | 5.3 |
| Admin analytics | 6 | 5 | 4 | 5.0 |
| Onboarding templates | 5 | 5 | 4 | 4.7 |
| UI gating by plan | 4 | 5 | 4 | 4.3 |

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

---

## Notes on Prioritization

- **MVP Focus:** Content block editor → Assignment → Player → Progress. This is the end-to-end learning flow.
- **Enterprise features** (SSO, SCIM, compliance, gamification) are Phase 2-3 per manifest.
- **Market site** is separate track, not blocking MVP.
