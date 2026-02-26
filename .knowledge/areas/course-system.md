# Area: Course System

> **Status:** Admin and learner sides complete, maintained
> **Last updated:** 2026-02-26

---

## Overview

The course system is the core of the LMS. Admin-side CRUD, catalog, builder, versioning, content block editor, and assignment management are complete. The learner-facing course player, progress tracking, certificates, and notifications are also complete.

> **KEY:** Course content uses a versioned model. `CourseVersion` is immutable once published. `Course.currentPublishedVersionId` points to the active version. Progress history is preserved across version changes.

---

## Data Model

````
Course
  +-- CourseVersion (draft -> published -> archived)
        +-- Module (ordered)
              +-- Lesson (ordered, typed: TEXT, VIDEO, QUIZ, etc.)
                    +-- LessonBlock (typed content blocks — IMPLEMENTED)

CourseCategory, Tag -> taxonomy (IMPLEMENTED)
CourseAssignmentRule -> assignment rules (IMPLEMENTED)
CourseEnrollment -> per-user enrollment (IMPLEMENTED)
LessonProgress, ModuleProgress, ProgressEvent -> tracking (IMPLEMENTED)
Certificate -> issued certificates (IMPLEMENTED)
BlockResponse -> quiz/checklist responses (IMPLEMENTED)
````

## Key Files

| File | Purpose |
|---|---|
| `src/app/admin/courses/page.tsx` | Course catalog (grid, search, filter) |
| `src/app/admin/courses/[courseId]/page.tsx` | Course detail (tabs: Overview, Builder, Versions, Assignment) |
| `src/app/actions/courseActions.ts` | Course CRUD, taxonomy, catalog operations |
| `src/app/actions/courseBuilderActions.ts` | Module/lesson CRUD, ordering, versioning |
| `src/app/actions/learnerActions.ts` | Dashboard, my courses, player, progress, marking |
| `src/app/learn/courses/[courseId]/page.tsx` | Learner course detail + player |
| `src/app/learn/my-learning/page.tsx` | My Learning with filters |
| `prisma/schema.prisma` | All course-related models |

## What's Next

1. **SCORM 1.2/2004** — Import imsmanifest.xml, runtime JS API bridge
2. **Frister og resertifisering** — Due dates, recertification intervals, escalation
3. **Admin analytics** — Completion rates, drill-downs, CSV export

## Block Types (from schema)

````
enum BlockType {
  TEXT
  IMAGE
  VIDEO
  QUIZ
  DOCUMENT
  EMBED
  AUDIO
  CODE
  CALLOUT
  CHECKLIST
  OPEN_RESPONSE
  DIVIDER
}
````

## Open Questions

- SCORM runtime: build custom JS API bridge, or use open-source library?
- Video hosting strategy: local storage vs external (YouTube, Vimeo, Mux)?
