# Knowledge Management System — EgenAkademi

> **Based on Tiago Forte's "Building a Second Brain" (BASB)** methodology.
> This system is the persistent memory for all work on this project.

---

## Purpose

We forget. This system exists so we don't. Every important decision, discovery, context shift, and piece of progress is captured here so that any session — whether minutes or months apart — can resume with full context.

---

## Core Methods

### PARA — Organization

All knowledge is organized into four categories:

| Category | What goes here | Folder |
|---|---|---|
| **Projects** | Active, time-bound work with a clear goal and deadline | `projects/` |
| **Areas** | Ongoing responsibilities with no end date | `areas/` |
| **Resources** | Reference material, patterns, research, inspiration | `resources/` |
| **Archive** | Completed projects, inactive areas, old resources | `archive/` |

### CODE — Workflow

Every piece of information flows through:

1. **Capture** — Write it down immediately in `inbox.md` or the daily note
2. **Organize** — Move it to the right PARA folder
3. **Distill** — Highlight the key insights (progressive summarization)
4. **Express** — Use the knowledge to create, build, decide

### Progressive Summarization — 5 Layers

When reviewing notes, apply progressive layers of highlighting:

1. **Layer 1:** The original note (raw capture)
2. **Layer 2:** **Bold** the key passages
3. **Layer 3:** ==Highlight== the most critical sentences (use `> **KEY:**` in markdown)
4. **Layer 4:** Executive summary at the top of the note
5. **Layer 5:** Remix into new output (code, decisions, docs)

---

## Prioritization System — Eisenhower + ICE

### Eisenhower Matrix (What to work on)

| | Urgent | Not Urgent |
|---|---|---|
| **Important** | **DO FIRST** — Critical bugs, blocking issues, deadlines | **SCHEDULE** — Architecture, features, tech debt |
| **Not Important** | **DELEGATE** — Nice-to-haves someone asks for | **ELIMINATE** — Distractions, premature optimization |

### ICE Score (How to rank within a quadrant)

For items in the same priority bucket, score 1-10 on:

- **I**mpact — How much value does this deliver?
- **C**onfidence — How sure are we this will work?
- **E**ase — How easy is it to implement?

**ICE Score = (I + C + E) / 3** → Higher = do first.

---

## Daily Notes

**Location:** `.knowledge/daily/YYYY/MM - MonthName/YYYY-MM-DD.md`

Daily notes are organized into year and named month subfolders for easy navigation:

```
.knowledge/daily/
├── 2026/
│   ├── 01 - January/
│   │   ├── 2026-01-15.md
│   │   └── 2026-01-28.md
│   ├── 02 - February/
│   │   ├── 2026-02-03.md
│   │   └── 2026-02-26.md
│   ├── 03 - March/
│   │   └── ...
│   └── ...
└── 2027/
    └── ...
```

Month folder names use the format `MM - MonthName` (e.g., `01 - January`, `02 - February`, ..., `12 - December`).

**When creating a daily note:** Always create it inside the correct `YYYY/MM - MonthName/` subfolder. Create the subfolders if they don't exist.

```markdown
# Daily Note — YYYY-MM-DD

## Focus
What are we working on today?

## Work Log
- HH:MM — What was done
- HH:MM — Decision made: [description] → [rationale]
- HH:MM — Problem encountered: [description] → [resolution]

## Decisions Made
- **Decision:** [what] — **Rationale:** [why] — **Alternatives:** [what else]

## Discoveries
- Things learned, patterns noticed, insights gained

## Blockers
- What's stuck and why

## Tomorrow / Next Session
- What to pick up next
```

---

## AI Agent Rules (CRITICAL)

### Before Starting Work
1. **Read `.knowledge/priorities.md`** to know current priorities
2. **Read the latest daily note** in `.knowledge/daily/YYYY/MM - MonthName/` (check the most recent year → most recent month → latest file)
3. **Read the relevant project file** in `.knowledge/projects/` for active project state
4. **Check `PROJECT_MANIFEST.md`** for implementation status

### During Work
1. **Log significant decisions** in the daily note under "Decisions Made"
2. **Log problems and solutions** under "Work Log"
3. **Update project files** when project scope, status, or understanding changes
4. **Capture new information** in the right PARA location immediately

### After Completing Work
1. **Update the daily note** with a summary of what was accomplished
2. **Update `priorities.md`** if priorities shifted
3. **Update the project file** with new status
4. **Add "Tomorrow / Next Session"** notes for continuity
5. **Move completed items** to archive when a project is done

### When Resuming After a Break
1. Read the latest daily note's "Tomorrow / Next Session" (find it in `.knowledge/daily/YYYY/MM - MonthName/`)
2. Read `priorities.md` for current state
3. Create a new daily note for today in the correct `YYYY/MM - MonthName/` subfolder
4. Continue from where we left off

---

## File Naming Conventions

| Type | Pattern | Example |
|---|---|---|
| Daily note | `daily/YYYY/MM - MonthName/YYYY-MM-DD.md` | `daily/2026/02 - February/2026-02-26.md` |
| Project | `kebab-case.md` | `course-builder.md` |
| Area | `kebab-case.md` | `branding-system.md` |
| Resource | `kebab-case.md` | `lms-research.md` |
| Decision record | `NNNN-decision-title.md` | `0001-use-prisma-v7.md` |

---

## Quick Reference

```
.knowledge/
├── SYSTEM.md              ← You are here. How the system works.
├── inbox.md               ← Quick capture. Process regularly.
├── priorities.md          ← Current prioritization (Eisenhower + ICE)
├── daily/
│   └── YYYY/
│       └── MM - MonthName/
│           └── YYYY-MM-DD.md  ← Daily work notes
├── projects/              ← PARA: Active projects
├── areas/                 ← PARA: Ongoing responsibilities
├── resources/             ← PARA: Reference material
└── archive/               ← PARA: Completed/inactive items
```
