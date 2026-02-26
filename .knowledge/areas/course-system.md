# Area: Course System

> **Status:** Admin side complete, learner side not started
> **Last updated:** 2026-02-26

---

## Overview

The course system is the core of the LMS. Admin-side CRUD, catalog, builder, and versioning are complete. The learner-facing player, content block editor, assignment, and progress tracking are the next major work items.

> **KEY:** Course content uses a versioned model. `CourseVersion` is immutable once published. `Course.currentPublishedVersionId` points to the active version. Progress history is preserved across version changes.

---

## Data Model

```
Course
  └── CourseVersion (draft → published → archived)
        └── Module (ordered)
              └── Lesson (ordered, typed: TEXT, VIDEO, QUIZ, etc.)
                    └── LessonBlock (typed content blocks — NOT YET IMPLEMENTED IN UI)

CourseCategory, Tag → taxonomy
CourseAssignmentRule → assignment rules (NOT YET IMPLEMENTED IN UI)
CourseEnrollment → per-user enrollment (NOT YET IMPLEMENTED)
LessonProgress, ModuleProgress, ProgressEvent → tracking (NOT YET IMPLEMENTED)
```

## Key Files

| File | Purpose |
|---|---|
| `src/app/admin/courses/page.tsx` | Course catalog (grid, search, filter) |
| `src/app/admin/courses/[courseId]/page.tsx` | Course detail (tabs: Overview, Builder, Versions) |
| `src/app/actions/courseActions.ts` | Course CRUD, taxonomy, catalog operations |
| `src/app/actions/courseBuilderActions.ts` | Module/lesson CRUD, ordering, versioning |
| `prisma/schema.prisma` | All course-related models |

## What's Next

1. **Content block editor** — UI for creating/editing `LessonBlock` records inside lessons
2. **Assignment UI** — Interface for `CourseAssignmentRule` management
3. **Learner player** — Student-facing course consumption view
4. **Progress tracking** — `LessonProgress`/`ModuleProgress` updates as learner progresses

## Block Types (from schema)

```
enum BlockType {
  TEXT
  IMAGE
  VIDEO
  QUIZ
  DOCUMENT
  EMBED
}
```

## Open Questions

- Content storage format for TEXT blocks? (Markdown? HTML? ProseMirror JSON?)
- Video hosting strategy?
- Quiz answer validation — server-side or client-side?
