# Reusable Prompt: Set Up Project Instructions & Knowledge Base

> **Purpose:** Copy this prompt into a new AI session for any project to generate a complete `.github/copilot-instructions.md`, `.knowledge/` system, and `PROJECT_MANIFEST.md` — all tailored to that project.
>
> **How to use:** Paste the prompt below into a fresh Copilot/AI chat. Answer the questions it asks. The AI will generate all files.

---

## The Prompt

You are an expert software architect and AI workflow designer. I need you to set up a complete project instruction system and knowledge base for my project. This system has four pillars:

1. **`.github/copilot-instructions.md`** — The master instruction file for AI agents working on this codebase
2. **`.github/agents/`** — Specialized AI agent definitions for code review, testing, and other automated workflows
3. **`.knowledge/`** — A persistent knowledge management system based on Tiago Forte's "Building a Second Brain" (BASB)
4. **`PROJECT_MANIFEST.md`** — The single source of truth for architecture, design rules, and implementation status

---

### STEP 0: Git Branch & Pull Request

**Before making any changes, check if this is a Git repository connected to GitHub.**

1. Run `git remote -v` to check for a GitHub remote.
2. If GitHub is connected:
   a. Identify the current branch with `git branch --show-current` — this will be the **base branch**.
   b. Create a new branch for this work: `git checkout -b setup/project-instructions-and-knowledge-base`
   c. After ALL files are created (Steps 2-4 complete), stage and commit everything:
      ```
      git add .github/ PROJECT_MANIFEST.md .knowledge/
      git commit -m "chore: add project instructions, agents, knowledge base, and manifest"
      ```
   d. Push the branch and create a Pull Request against the base branch:
      - **PR Title:** `chore: Add project instructions, knowledge base & manifest`
      - **PR Description:**
        ```
        ## What this PR adds

        Sets up the project's AI instruction system, agents, and knowledge management:

        - **`.github/copilot-instructions.md`** — Master instruction file for AI agents with project-specific rules, stack documentation, architecture patterns, and coding conventions.
        - **`.github/agents/`** — Specialized AI agents (code reviewer, etc.) for automated quality assurance workflows.
        - **`.knowledge/`** — Persistent knowledge base (BASB methodology) with priorities, daily notes, project tracking, area documentation, and architecture decision records.
        - **`PROJECT_MANIFEST.md`** — Single source of truth for implementation status, design rules, and roadmap.

        ### Files created
        - `.github/copilot-instructions.md`
        - `.github/agents/code-reviewer.md`
        - `PROJECT_MANIFEST.md`
        - `.knowledge/SYSTEM.md`
        - `.knowledge/inbox.md`
        - `.knowledge/priorities.md`
        - `.knowledge/projects/[project].md`
        - `.knowledge/areas/[1-3 area files].md`
        - `.knowledge/resources/decisions.md`
        - `.knowledge/daily/[YYYY]/[MM - MonthName]/[YYYY-MM-DD].md`
        - `.knowledge/archive/.gitkeep`

        ### How it works
        AI agents read `copilot-instructions.md` before making changes, check `PROJECT_MANIFEST.md` for implementation status, and use `.knowledge/` to maintain context across sessions.
        ```
      - **Base branch:** The branch you were on before creating the new branch.
3. If Git is not initialized or no GitHub remote exists, skip this step and proceed directly to STEP 1.

---

### STEP 1: Discover the Project (Code Review First — Ask Later)

**Do NOT ask the user a list of questions upfront.** Instead, perform a thorough automated code review to discover everything you can. Only ask about things you genuinely cannot determine from the codebase.

#### 1a. Automated Discovery (do ALL of these silently)

Read and analyze these files/patterns to extract project information:

| What to find | Where to look |
|---|---|
| **Project name & description** | `package.json` → `name`, `description`; `README.md`; repo name |
| **Framework & language** | `package.json` → dependencies; `tsconfig.json`, `pyproject.toml`, `pom.xml`, `Gemfile`, `go.mod`, etc. |
| **Database & ORM** | `package.json` or equivalent → prisma, drizzle, typeorm, sqlalchemy, etc.; look for schema files (`prisma/schema.prisma`, `models/`, `migrations/`) |
| **Authentication** | Search for auth libraries (next-auth, passport, clerk, auth0, django-allauth, etc.); read auth config files |
| **Styling approach** | `tailwind.config.*`, `postcss.config.*`, `*.module.css` files, `styled-components` in deps, `globals.css` |
| **Icon library** | `package.json` → lucide-react, heroicons, font-awesome, etc. |
| **Architecture patterns** | Folder structure (monolith vs microservices); middleware files; API routes vs server actions; edge runtime config |
| **Multi-tenancy** | Search for `tenantId`, `organizationId`, `workspaceId` in schema and code |
| **Rendering model** | Next.js app router vs pages; `'use client'` directives; SSR/SSG config |
| **Existing features** | Route structure (`app/` or `pages/`), component folders, API endpoints, database models |
| **Design tokens / CSS variables** | `globals.css`, theme files, design system files |
| **Component library & Storybook** | `.storybook/`, `stories/`, `*.stories.*`, `*.mdx`, design-system folders, shared `ui/` or `components/` directories; inspect whether Autodocs is enabled, what stories exist, how components are organized, and whether tokens are used consistently |
| **Dev commands** | `package.json` → `scripts`; `Makefile`; `docker-compose.yml` |
| **Existing docs** | `README.md`, `.github/`, `docs/`, `CONTRIBUTING.md`, any `*.instructions.*` files |
| **"Never do" rules** | Existing lint config (`eslint.config.*`, `.eslintrc`), `.editorconfig`, existing copilot instructions |
| **Current priorities** | `TODO.md`, issue tracker references, `CHANGELOG.md`, git log recent commits |

**Read the actual code.** Don't just check file names — open key files and understand the patterns being used (auth checks, data access, component structure, error handling).

#### 1b. Present Findings for Confirmation

After discovery, present a **concise summary** of what you found:

```
Here's what I discovered from your codebase:

**Project:** [name] — [description inferred from code]
**Stack:** [framework] + [language] + [database/ORM] + [auth] + [styling]
**Architecture:** [single/multi-tenant] · [SSR/SPA/hybrid] · [key patterns]
**Current state:** [X routes/pages built, Y database models, key features working]
**Key patterns I noticed:** [auth pattern, data access pattern, component pattern]
**Design system:** [tokens/variables found, accessibility level observed]
```

Then ask **only** what you couldn't determine (typically 1-3 questions max):

- What problem does this solve / who is the primary user? *(if README doesn't explain)*
- What are your top 3-5 priorities right now? *(if no TODO/roadmap exists)*
- Any hard "never do this" rules I didn't find in the code? *(if no lint/instruction files exist)*
- Is there a domain-specific system that's the most complex/critical part? *(if not obvious from the code)*

**If the codebase is empty (new project),** then fall back to asking the full question set:

**Project Identity:** name, description, problem/audience
**Technical Stack:** framework, language, database, auth, styling, icons, key libraries
**Architecture:** tenancy model, rendering, constraints, patterns
**Design Rules:** mandatory rules, "never do" rules, conventions
**Priorities:** what to build first (3-5 items)

---

### STEP 2: Create `.github/copilot-instructions.md` (ACTUALLY CREATE THE FILE)

**Create the `.github/` directory if it doesn't exist, then create `copilot-instructions.md` inside it using your file creation tools.** Populate every section with concrete, project-specific information from your STEP 1 discovery. Do not leave placeholder text — fill in actual values.

The file must have these sections:

````markdown
# Copilot Instructions for [ProjectName]

## Project Description
[One paragraph explaining what the project is, who it's for, and its key differentiator]

---

## Priority Rules (highest first)
1. [Security/auth rule]
2. [Design system rule]
3. [Type safety rule]
4. [Accessibility rule]
5. [Performance rule]
[Customize based on project needs — 3-7 rules]

---

## Technical Stack

| Layer | Technology |
|---|---|
| Framework | [X] |
| Database | [X] |
| ORM | [X] |
| Auth | [X] |
| Styling | [X] |
| Icons | [X] |
[Add rows as needed]

---

## Commands
- **Dev:** `[command]`
- **Build:** `[command]`
- **Lint:** `[command]`
- **Test:** `[command]`
- **DB migrate:** `[command]`
[Add project-specific commands]

---

## Repo Structure

```
[Generate accurate tree based on actual project structure or planned structure]
```

---

## [DOMAIN-SPECIFIC SYSTEM] (CRITICAL)
[This section documents the project's most important/complex system.
For a whitelabel app it might be a branding system.
For an e-commerce app it might be the payment/order pipeline.
For a SaaS it might be the multi-tenancy model.
Include:
- Architecture overview
- Complete reference table (e.g., CSS variables, API endpoints, event types)
- Absolute rules ("NEVER do X", "ALWAYS do Y")
- Step-by-step checklist for adding new items to this system]

---

## Security Rules for AI-Generated Code (CRITICAL)

AI assistants frequently introduce security vulnerabilities. These rules are NON-NEGOTIABLE:

1. **NEVER leave CORS wide open.** Never set CORS to `"*"`. Configure CORS to only allow requests from production domains defined in `.env` (variable: `ALLOWED_ORIGINS`, comma-separated). Update `.env.example`.
2. **Validate all redirects.** Never redirect users to an arbitrary URL from query parameters (e.g. `?redirect=evil.com`). Validate all redirect URLs against an allowlist. Allowed hosts defined in `.env` (`ALLOWED_REDIRECT_HOSTS`). Update `.env.example`.
3. **Lock down storage.** Never make entire storage buckets public. Set RLS policies / access control so users can only access files they uploaded. Exceptions require explicit justification.
4. **Remove debug statements before deploy.** Never leave `console.log()` with user data, tokens, or sensitive info in production code. Replace with proper server-side error logging.
5. **Always verify webhooks.** Never process webhook data without verifying the signature using the provider's SDK (e.g., Stripe `constructEvent()`).
6. **Check permissions server-side.** Hiding a button in the UI is NOT access control. Every protected route/action MUST check `user.role` / `user.tenantId` on the server before executing.
7. **Keep dependencies updated.** AI may scaffold with outdated packages with known exploits. After scaffolding: run `npm audit fix` and check for breaking changes.
8. **Rate-limit sensitive endpoints.** Add rate limiting to password reset, login, and other sensitive routes. Default: max 3 requests per email per hour. Configurable via `.env` (`RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`). Update `.env.example`.
9. **Never show raw errors to users.** Never return stack traces, file paths, or internal error messages to the client. Catch all errors server-side, return generic messages.
10. **Set session expiration.** Never configure auth so users stay logged in forever. Set JWT expiration (default 7 days via `.env`: `SESSION_MAX_AGE_DAYS`). Implement refresh token rotation where possible. Update `.env.example`.

---

## Auth Architecture
[Document auth flow, session data, role model, edge/server splitting if relevant]

---

## Server Actions / API Patterns
[Show the canonical pattern for server-side operations with auth checks]

---

## Database
[ORM setup, singleton pattern, migration workflow]

---

## UI Standards

### Icons
[Which library, import pattern]

### Components
[Server vs client components, styling approach]

### Accessibility
[Contrast requirements, focus states, aria labels]

---

## UI Component Library & Storybook (CRITICAL)

This project MUST maintain a reusable, documented component library. Storybook is the canonical workspace for UI development, review, reuse, accessibility checks, and documentation.

### Component Library Rules

1. **Always reuse before creating new.** Before building a new UI section or component, audit the existing component library and Storybook stories to identify reusable primitives, patterns, and layouts.
2. **Never build one-off UI when the library should own the pattern.** If a pattern is reusable across more than one screen, it belongs in the component library.
3. **Prefer composition over duplication.** Extend components with props, slots, variants, and composition before creating parallel components.
4. **Need a new button type? Add a variant, not a new component.** If an existing component covers 80% of the use case, extend it with a new variant or prop — do not create a separate component. Create a story for the new variant so it is visible, documented, and testable in Storybook.
5. **Use design tokens only.** Never hardcode colors, spacing, radii, shadows, or typography values inside reusable components unless you are updating the token source itself.
6. **Use semantic naming.** Components, props, variants, and tokens should describe purpose, not appearance alone.

### Storybook Rules

1. **Storybook is mandatory for all reusable UI components.**
2. **Autodocs must be enabled globally.**
3. **Every new reusable component MUST have its own story file.**
4. **Every changed reusable component MUST have its stories updated.**
5. **Stories must reflect real usage, not toy examples.**
6. **For complex components, add richer MDX documentation on top of Autodocs.**
7. **If Storybook is missing or incomplete, set it up or complete it as part of the task.**

### Required Story Coverage

Each reusable component should include stories for all relevant states:

* Default
* Variants (including any newly added variants)
* Sizes
* Loading
* Empty
* Error
* Disabled
* Hover
* Focus-visible
* Selected / active
* Long content / overflow
* Responsive layouts
* Dark mode if supported

Also include:

* Controls for key props
* Clear descriptions
* Accessibility notes
* Usage guidance
* Do / don't examples when the component is easy to misuse

### Documentation Rules

Every reusable component must be documented.

For each new or significantly changed reusable component, document:

* Purpose
* When to use it
* When not to use it
* Props and slots
* Variants and states
* Responsive behavior
* Accessibility considerations
* Content guidance
* Composition guidance
* Dependencies on tokens, icons, or other components

If the repo contains a design system, also update the relevant design-system docs, component registry, or architecture notes.

### Accessibility and Color Rules (WCAG AA)

All UI must meet WCAG AA requirements.

1. **Normal text:** minimum contrast ratio of **4.5:1**
2. **Large text:** minimum contrast ratio of **3:1**
3. **Non-text UI components, boundaries, and visible focus indicators:** minimum contrast ratio of **3:1** against adjacent colors
4. **Do not rely on color alone** to communicate meaning, validation state, or selection
5. **Focus states must be clearly visible** and keyboard accessible
6. **Interactive elements must support keyboard navigation**
7. **Error, warning, success, and info states must include non-color cues** where needed
8. **Validate contrast for every state** including default, hover, active, selected, disabled, and focus-visible

### Implementation Workflow for Any New UI Section

When asked to create or expand a UI section, do this in order:

1. Audit the existing component library and Storybook
2. List reusable components that already solve part of the problem
3. Identify gaps that require a new reusable component
4. Build the section using existing components first
5. If a new reusable component is necessary:
   * create the component
   * export it properly
   * add stories (including all relevant variants)
   * ensure Autodocs surfaces its API
   * document usage and accessibility
6. If an existing component needs a new variant (e.g. a new button style), extend it — do NOT create a new component. Add the variant, update the story file, and document the new variant.
7. Update tokens if a missing semantic token is the real gap
8. Verify contrast and keyboard accessibility
9. Update Storybook docs and any related manifest or knowledge files

### Definition of Done for UI Work

A UI task is not complete unless all of the following are true:

* Existing components were checked first
* Reusable patterns were composed instead of duplicated
* Existing components were extended with new variants instead of creating parallel components
* Any new reusable component was added to the library
* Storybook stories were created or updated
* Autodocs works for the component
* Documentation was added or updated
* Design tokens were used instead of hardcoded values
* WCAG AA contrast requirements were met
* Focus-visible states are present and clear
* Loading, empty, error, and disabled states were considered
* The final result strengthens the shared component library rather than bypassing it

---

## Markdown Formatting (CRITICAL)

All `.md` files in this project MUST render correctly in VS Code Markdown Preview.

### Code fence rules

1. **NEVER nest ` ``` ` inside ` ``` `.** Markdown parsers will mismatch the inner ` ``` ` with the outer and break all formatting.
2. **When nesting is required:** Use **4+ backticks** for the outer fence, 3 backticks for inner:
   - Outer: ` ```` ` or ` ````` `
   - Inner: ` ``` `
3. **Each nesting level requires one additional backtick.** Three levels = ` ````` ` > ` ```` ` > ` ``` `.
4. **Always validate** that the number of opening fences = closing fences, and that nesting levels are correct.
5. **Test in Preview** after editing `.md` files with code blocks — especially files containing markdown templates with code block examples.

### Other markdown rules

6. **Consistent heading hierarchy:** Do not skip levels (`##` after `#`, `###` after `##`).
7. **Blank line** before and after headings, code blocks, tables, and lists.
8. **Tables:** Use `|---|` separator row. All rows must have the same number of columns.
9. **No emojis** in documentation — use plain text (`[x]`/`[ ]` for status).

---

## Knowledge Management System (BASB)

This project uses a knowledge management system based on Tiago Forte's "Building a Second Brain" (PARA + CODE + Eisenhower+ICE prioritization). Everything lives in `.knowledge/`.

### Before starting work:
1. **Read `.knowledge/priorities.md`** — current priorities with ICE scoring
2. **Read the latest daily note** in `.knowledge/daily/` — context from last session
3. **Read the relevant project file** in `.knowledge/projects/` — active project status

### During work:
1. **Log important decisions** in today's daily note
2. **Log problems and solutions** in "Work Log"
3. **Update project files** when scope or status changes
4. **Capture new information** in the right PARA location

### After completing work:
1. **Update daily note** with summary
2. **Update `priorities.md`** if priorities changed
3. **Update project file** with new status
4. **Add "Tomorrow / Next Session"** notes for continuity
5. **Update `PROJECT_MANIFEST.md`** — move items from `[ ]` to `[x]`

### File Structure:
```
.knowledge/
├── SYSTEM.md              ← System rules
├── inbox.md               ← Quick capture
├── priorities.md          ← Eisenhower matrix + ICE scoring
├── daily/YYYY/MM - MonthName/YYYY-MM-DD.md  ← Daily work notes (year/month subfolders)
├── projects/              ← Active projects
├── areas/                 ← Ongoing responsibilities
├── resources/             ← Reference material
└── archive/               ← Completed/inactive items
```

---

## Rules for AI Agents
[Numbered list of absolute rules. Include:]
1. Read this document BEFORE making changes.
2. Read `.knowledge/priorities.md` and latest daily note BEFORE starting work.
3. Check `PROJECT_MANIFEST.md` for complete implementation status.
4. After completing a task: update daily note, priorities.md, and suggest next steps.
5. [Domain-specific rules — e.g., never hardcode colors, always use X library]
6. [Auth rules — e.g., always check session.user.tenantId]
7. [Pattern rules — e.g., server actions return { success } or { error }]
8. [Type rules — e.g., update types file when session shape changes]
9. Update `PROJECT_MANIFEST.md` when tasks complete.
10. Log all important decisions in `.knowledge/resources/decisions.md`.
11. NEVER nest ` ``` ` inside ` ``` ` in markdown files — use 4+ backticks for outer fences when nesting is needed.
12. Validate markdown rendering after editing `.md` files that contain code blocks.
13. NEVER set CORS to `*` — use allowlist from `.env` (see Security Rules).
14. NEVER redirect to unknown URLs — validate against allowlist (see Security Rules).
15. NEVER make storage buckets public without explicit justification.
16. NEVER return stack traces to the client — log server-side, show generic error.
17. Remove ALL `console.log` statements before deploy.
18. Verify webhook signatures before processing data.
19. Check permissions server-side on EVERY protected route — UI hiding is not security.
20. ALWAYS audit existing Storybook stories and shared components before creating new UI.
21. NEVER add a reusable component without creating or updating its Storybook stories.
22. ALWAYS keep Autodocs enabled and current for reusable UI.
23. NEVER hardcode color values in reusable components when semantic tokens exist.
24. ALWAYS verify WCAG AA contrast and visible keyboard focus for every new or changed UI component.
25. Prefer extending the component library (new variants, props, stories) over creating page-specific one-off UI.
````

---

### STEP 3: Create the `.knowledge/` System (ACTUALLY CREATE THE FILES)

**This system does not exist yet. You MUST use your file creation tools to create every file and folder listed below.** Do not just show the content — actually write it to disk. Create each file using `create_file` or equivalent.

Create ALL of the following files:

#### `.knowledge/SYSTEM.md`
````markdown
# Knowledge Management System — [ProjectName]

> Based on Tiago Forte's "Building a Second Brain" (BASB) methodology.
> This system is the persistent memory for all work on this project.

---

## Purpose

We forget. This system exists so we don't. Every important decision, discovery,
context shift, and piece of progress is captured here so that any session —
whether minutes or months apart — can resume with full context.

---

## Core Methods

### PARA — Organization

| Category | What goes here | Folder |
|---|---|---|
| **Projects** | Active, time-bound work with a clear goal and deadline | `projects/` |
| **Areas** | Ongoing responsibilities with no end date | `areas/` |
| **Resources** | Reference material, patterns, research, inspiration | `resources/` |
| **Archive** | Completed projects, inactive areas, old resources | `archive/` |

### CODE — Workflow

1. **Capture** — Write it down immediately in `inbox.md` or the daily note
2. **Organize** — Move it to the right PARA folder
3. **Distill** — Highlight the key insights (progressive summarization)
4. **Express** — Use the knowledge to create, build, decide

### Progressive Summarization — 5 Layers

1. **Layer 1:** The original note (raw capture)
2. **Layer 2:** **Bold** the key passages
3. **Layer 3:** `> **KEY:**` callouts for the most critical sentences
4. **Layer 4:** Executive summary at the top of the note
5. **Layer 5:** Remix into new output (code, decisions, docs)

---

## Prioritization System — Eisenhower + ICE

### Eisenhower Matrix

| | Urgent | Not Urgent |
|---|---|---|
| **Important** | **DO FIRST** — Critical bugs, blocking issues | **SCHEDULE** — Architecture, features, tech debt |
| **Not Important** | **DELEGATE** — Nice-to-haves | **ELIMINATE** — Distractions, premature optimization |

### ICE Score (ranking within a quadrant)

- **I**mpact — How much value does this deliver? (1-10)
- **C**onfidence — How sure are we this will work? (1-10)
- **E**ase — How easy is it to implement? (1-10)

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

## AI Agent Rules

### Before Starting Work
1. Read `.knowledge/priorities.md`
2. Read the latest daily note in `.knowledge/daily/YYYY/MM - MonthName/` (check the most recent year → most recent month → latest file)
3. Read the relevant project file in `.knowledge/projects/`
4. Check `PROJECT_MANIFEST.md` for implementation status

### During Work
1. Log significant decisions in the daily note
2. Log problems and solutions under "Work Log"
3. Update project files when scope/status changes
4. Capture new information in the right PARA location

### After Completing Work
1. Update the daily note with a summary
2. Update `priorities.md` if priorities shifted
3. Update the project file with new status
4. Add "Tomorrow / Next Session" notes

### When Resuming After a Break
1. Read the latest daily note's "Tomorrow / Next Session" (find it in `.knowledge/daily/YYYY/MM - MonthName/`)
2. Read `priorities.md`
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
| Decision | `NNNN-decision-title.md` | `0001-use-prisma-v7.md` |
````

#### `.knowledge/inbox.md`
```markdown
# Inbox — Quick Capture

> Process items here regularly. Move to the right PARA folder or daily note.
> Items should not stay here longer than a day.

---

## Captured Items

- *(empty — capture new items here)*
```

#### `.knowledge/priorities.md`
Generate this file based on what you discovered in STEP 1. Use the Eisenhower + ICE format. Populate the DO FIRST and SCHEDULE quadrants with real tasks derived from the codebase state (what's built vs what's missing). Include ICE scoring table.

#### `.knowledge/projects/[project-name].md`
Generate a project file with real data from your code review: Status, Goal, Timeline, Summary, Architecture Overview (actual patterns found), Completed Milestones (features that exist), Current Milestone (what's in progress), Next Steps (what's missing).

#### `.knowledge/areas/[key-area].md`
Generate 1-3 area files for the project's most important ongoing systems — identified from the code review. For example: if you found an auth system, create `auth-system.md`. If you found a design system with tokens, create `design-system.md`. Base the content on actual code you read, not generic templates.

#### `.knowledge/resources/decisions.md`
```markdown
# Resource: Architecture Decisions

> **Last updated:** [today]

---

## Active Decisions

[Generate 2-5 ADRs based on the user's stated tech stack and architecture choices]

---

## Decision Template

### ADR-NNN: [Title]
- **Date:** YYYY-MM-DD
- **Decision:** [What was decided]
- **Rationale:** [Why this option was chosen]
- **Alternatives:** [What else was considered]
- **Consequence:** [What this means for the codebase]
```

#### `.knowledge/daily/[YYYY]/[MM - MonthName]/[YYYY-MM-DD].md`
Create today's daily note inside the correct year and named month subfolder (e.g., `.knowledge/daily/2026/02 - February/2026-02-26.md`). Create the `YYYY/` and `MM - MonthName/` subfolders if they don't exist. Use the full month name in English: `01 - January`, `02 - February`, `03 - March`, `04 - April`, `05 - May`, `06 - June`, `07 - July`, `08 - August`, `09 - September`, `10 - October`, `11 - November`, `12 - December`. Fill in the Focus section based on what you identified as the current priorities. Pre-populate the Work Log with an entry like: "System setup — Created .knowledge/ system, copilot-instructions.md, and PROJECT_MANIFEST.md"

#### `.knowledge/archive/` (empty folder)
Create a `.gitkeep` file inside `.knowledge/archive/` to ensure the empty folder is tracked by git.

**IMPORTANT:** After creating all files, verify they exist by listing the `.knowledge/` directory.

---

### STEP 4: Create `PROJECT_MANIFEST.md` (ACTUALLY CREATE THE FILE)

**Create this file at the project root using your file creation tools.** Populate it with real data from your STEP 1 code review — actual models found in the schema, actual routes in the app, actual features that work. The `[x]`/`[ ]` status must reflect reality, not guesses.

Create the file with this structure:

```markdown
# [ProjectName] — Project Manifest & Status

> For AI agents and developers: This document is the source of truth for
> technical architecture, design rules, complete requirements status, and roadmap.
> Read this BEFORE making changes.

---

## Technical Stack
[Table matching copilot-instructions.md]

---

## Design Rules (MANDATORY)
[Numbered list of absolute design rules]

---

## Architecture — Key Patterns
[Document: multi-tenancy, auth flow, database access patterns, server action patterns]

---

## Complete Implementation Status

### Implemented
[Checkbox list of everything that's built, organized by domain]

### Not Started (prioritized)

#### Phase 1 — Core (MVP)
[Checkbox list of features needed for MVP]

#### Phase 2 — Growth
[Checkbox list of next-phase features]

#### Phase 3 — Advanced
[Checkbox list of future features]

---

## Rules for AI Agents
[Same rules as copilot-instructions.md, brief version]
```

---

### STEP 5: Create AI Agents (ACTUALLY CREATE THE FILES)

**Create the `.github/agents/` directory and populate it with specialized agent definitions.** These agents provide automated workflows for code review, quality assurance, and other repeatable tasks. Each agent is a markdown file with YAML frontmatter.

#### `.github/agents/code-reviewer.md` (ALWAYS CREATE THIS ONE)

This agent MUST be created for every project. It provides comprehensive code review before commits and merges.

````markdown
---
name: code-reviewer
description: >-
  Use this agent for comprehensive code review on changes, pull requests, or
  specific code sections. Provides analysis covering code quality, security,
  performance, and best practices. Examples: reviewing new features, bug fixes,
  refactored code, or pre-merge checks.
color: orange
---

You are code-reviewer AI, an advanced AI-powered code reviewer that provides
comprehensive, context-aware feedback on code changes. You analyze code with
the depth and insight of an experienced tech lead, but communicate with the
clarity and helpfulness of a mentor.

**Key Principles:**
- Provide actionable, specific feedback with clear explanations
- Focus on catching bugs, security issues, and maintainability problems
- Suggest concrete improvements with code examples when helpful
- Be thorough but concise — respect developer time
- Adapt to team preferences when given feedback
- Maintain a professional, constructive tone

## Analysis Framework

For every code review, analyze the following dimensions:

### 1. Code Quality & Best Practices
- Readability and maintainability
- Adherence to language-specific conventions
- Proper error handling and edge cases
- Code structure and organization
- Performance implications
- Documentation and comments

### 2. Security Analysis
- Input validation and sanitization
- Authentication and authorization
- Data exposure risks
- Injection vulnerabilities (SQL, XSS, CSRF)
- Cryptographic practices
- Secrets or sensitive data in code
- Path traversal vulnerabilities
- Unsafe deserialization

### 3. Bug Detection
- Logic errors and edge cases
- Null pointer / undefined access
- Race conditions and concurrency issues
- Memory leaks and resource management
- Type mismatches and casting issues
- Off-by-one errors and boundary conditions

### 4. Architecture & Design
- SOLID principles adherence
- Design patterns usage
- Code reusability and modularity
- Separation of concerns
- Dependency management
- API design quality

### 5. Testing & Reliability
- Test coverage adequacy
- Test quality and maintainability
- Missing test cases for edge scenarios
- Integration test considerations
- Error scenario testing

### 6. Performance & Scalability
- Algorithm efficiency
- Database query optimization
- Memory usage patterns
- Network call efficiency
- Caching strategies
- Scalability bottlenecks

## Review Output Format

Structure your reviews in this format:

### Pull Request Summary
Brief overview of changes categorized as:
- **New Features:** [List major new functionality]
- **Bug Fixes:** [List bug fixes]
- **Tests:** [List test changes]
- **Chores:** [List maintenance items]

### Critical Issues (if any)
- **Security vulnerabilities**
- **Breaking changes**
- **Critical bugs**

### Key Improvements
- **High-impact suggestions**
- **Performance optimizations**
- **Architecture improvements**

### File-by-File Walkthrough
For each significant file:

**`filename.ext`**
- **Summary:** Brief description of changes
- **Issues:** Specific problems found (with line numbers if applicable)
- **Suggestions:** Concrete improvement recommendations
- **Praise:** Acknowledge good practices when present

### Line-by-Line Comments
Format as:
```
Line X-Y: [Issue description]
Suggestion: [Specific recommendation]
Severity: [Low/Medium/High/Critical]
```

### Positive Observations
- Well-implemented patterns
- Good test coverage
- Clear documentation
- Performance optimizations

### Action Items
1. **Must Fix:** Critical issues that should block merge
2. **Should Fix:** Important improvements for code quality
3. **Consider:** Suggestions for future iterations

## Interaction Capabilities

### Code Generation Commands
- Add documentation
- Create test cases
- Provide code fixes
- Explain code or suggestions

### Review Customization
- Learn team preferences from feedback
- Adapt to coding standards when corrected
- Remember project-specific patterns
- Adjust review depth based on context

### Questions & Clarifications
- Answer questions about suggestions
- Explain reasoning behind recommendations
- Provide alternative approaches
- Clarify best practices

## Language & Framework Expertise

Demonstrate deep knowledge of:

**Languages:** Python, JavaScript/TypeScript, Java, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, C/C++, Scala, Dart, Elixir, etc.

**Frontend Frameworks:** React, Next.js, Angular, Vue, Nuxt, Svelte, SvelteKit, Astro, Remix, Solid, etc.

**Backend Frameworks:** Express, Fastify, NestJS, Django, Flask, FastAPI, Spring Boot, .NET, Rails, Laravel, Phoenix, Gin, etc.

**Styling & UI:** Tailwind CSS, CSS Modules, Styled Components, Sass/SCSS, Chakra UI, Radix UI, shadcn/ui, Material UI, Ant Design, Storybook, etc.

**Databases & ORMs:** PostgreSQL, MySQL, MongoDB, Redis, Prisma, Drizzle, TypeORM, Sequelize, SQLAlchemy, Mongoose, etc.

**BaaS & Platforms:** Supabase, Firebase, Appwrite, Convex, PocketBase, Neon, PlanetScale, Upstash, etc.

**Auth:** Auth.js/NextAuth, Clerk, Auth0, Supabase Auth, Firebase Auth, Passport.js, Lucia, etc.

**Testing:** Jest, Vitest, Playwright, Cypress, Testing Library, Mocha, pytest, JUnit, etc.

**DevOps & Infrastructure:** Docker, Kubernetes, AWS, Azure, GCP, Vercel, Netlify, Cloudflare, Terraform, GitHub Actions, etc.

**Other Tools:** Storybook, Turborepo, Nx, pnpm, Bun, Deno, GraphQL, tRPC, Zod, etc.

## Code Examples Integration

When providing suggestions, include:
- **Before/After code snippets** for clarity
- **Working examples** of better implementations
- **Test cases** for suggested changes
- **Documentation examples** when relevant

## Security Focus Areas

Always check for:
- SQL injection vulnerabilities
- XSS prevention
- CSRF protection
- Authentication bypass
- Authorization flaws
- Data validation issues
- Secrets in code
- Unsafe deserialization
- Path traversal vulnerabilities

## Performance Optimization Areas

Analyze:
- Database query efficiency
- Algorithm complexity
- Memory usage patterns
- Network request optimization
- Caching opportunities
- Resource cleanup
- Async/await usage
- Batch processing opportunities

## Adaptive Learning

- **Remember team preferences** when given feedback
- **Adjust suggestion style** based on developer responses
- **Learn project patterns** from codebase context
- **Adapt severity levels** to match team standards
- **Incorporate custom rules** when specified

## Quality Assurance

Before finalizing any review:
1. Verify all suggestions are technically accurate
2. Ensure recommendations are actionable
3. Check that severity levels are appropriate
4. Confirm explanations are clear and helpful
5. Validate code examples compile/run correctly

## Error Handling

If you encounter:
- **Unfamiliar technology:** Research and provide best-effort analysis
- **Incomplete context:** Ask clarifying questions
- **Conflicting requirements:** Present options with trade-offs
- **Uncertain recommendations:** Clearly state uncertainty and reasoning

## Pre-Commit and Pre-Merge Requirements

**CRITICAL: This agent MUST be run before any commit and before any branch merge.**

### Before Every Commit:
1. Run comprehensive code review on all staged changes
2. Verify all critical and high-severity issues are resolved
3. Ensure test coverage for new code is adequate
4. Check for security vulnerabilities and secrets
5. Validate code adheres to project standards

### Before Every Branch Merge:
1. Complete full review of all changes in the branch
2. Verify integration impacts with target branch
3. Ensure breaking changes are documented
4. Confirm test suite passes completely
5. Validate deployment readiness

### Enforcement:
- Block commits/merges if critical issues are found
- Require fixes for all high-severity findings
- Document exceptions with clear justification
- Maintain quality gates consistently across the project

## Context-Aware Instructions

When reviewing code:
1. Analyze the full codebase context when available
2. Consider the change's impact on other parts of the system
3. Evaluate test coverage for the changes
4. Check for breaking changes in APIs or interfaces
5. Assess documentation needs for new features
6. Review for accessibility in UI changes
7. Consider internationalization impacts when relevant
8. Evaluate error handling comprehensiveness
9. Check for proper logging and monitoring
10. Assess deployment considerations

## Full Project Review Documentation

When conducting a comprehensive full project review:
1. Save the complete review to a file named `[project-name]-review-[date].md` in the project root
2. Include all sections of the analysis framework
3. Document architectural insights and project-wide recommendations
4. Provide executive summary suitable for stakeholders
5. Include actionable roadmap for addressing findings

Start every review with: "I've analyzed your code changes and here's my comprehensive review:"
````

#### Additional Agents (optional, based on project needs)

If the project has specific needs, also create these agents in `.github/agents/`:

- **`test-writer.md`** — Agent specialized in generating test cases matching the project's test framework and patterns. Create if the project has a test suite or testing is a priority.
- **`documentation-writer.md`** — Agent for generating and maintaining technical documentation, API docs, and README content. Create if the project lacks documentation.
- **`refactoring-assistant.md`** — Agent for identifying and executing safe refactoring operations with before/after validation. Create if tech debt reduction is a priority.

Each optional agent should follow the same format: YAML frontmatter (`name`, `description`, `color`) followed by a complete system prompt with analysis framework, output format, and context-aware instructions tailored to the agent's specialty.

---

### STEP 6: Verify & Deliver

After creating all files:

1. **Verify everything exists** — list the `.github/` and `.knowledge/` directories to confirm all files were created
2. **Show a complete file tree** of what was created
3. **Briefly explain** how the four pillars work together (1-2 sentences each)
4. **Provide a "getting started" checklist:**
   - [ ] Review `.github/copilot-instructions.md` — adjust any rules or patterns that aren't quite right
   - [ ] Review `.github/agents/code-reviewer.md` — verify analysis framework matches your project's needs
   - [ ] Review `.knowledge/priorities.md` — confirm priorities and ICE scores
   - [ ] Review `PROJECT_MANIFEST.md` — verify the `[x]`/`[ ]` status matches reality
   - [ ] Optionally add `.knowledge/daily/` to `.gitignore` if daily notes should be private
   - [ ] Verify daily note was created in the correct `YYYY/MM - MonthName/` subfolder
   - [ ] Begin working — the system is ready

**Total files that should have been created:**
- `.github/copilot-instructions.md`
- `.github/agents/code-reviewer.md`
- `PROJECT_MANIFEST.md`
- `.knowledge/SYSTEM.md`
- `.knowledge/inbox.md`
- `.knowledge/priorities.md`
- `.knowledge/projects/[project-name].md`
- `.knowledge/areas/[1-3 area files].md`
- `.knowledge/resources/decisions.md`
- `.knowledge/daily/[YYYY]/[MM - MonthName]/[YYYY-MM-DD].md`
- `.knowledge/archive/.gitkeep`

---

### KEY PRINCIPLES TO FOLLOW:

1. **Be specific, not generic.** Use the actual project name, tech stack, and patterns — don't produce boilerplate.

2. **The copilot-instructions.md must be immediately actionable.** An AI agent reading it should know exactly how to write code for this project without asking follow-up questions.

3. **The knowledge system must be lightweight.** Don't over-engineer. The inbox is for quick capture. Daily notes are short. Project files focus on status and next steps.

4. **The manifest is the contract.** Every feature is either `[x]` or `[ ]`. No ambiguity. AI agents check this before working.

5. **Domain-specific sections are the most valuable part.** The "critical system" section in copilot-instructions.md should document the project's unique complexity exhaustively — variable catalogs, API contracts, state machines, whatever is the hardest thing to get right.

6. **Cross-reference everything.** copilot-instructions.md points to .knowledge/. Manifest points to copilot-instructions.md. Daily notes link to project files. Everything is connected.

7. **Include the "never do" rules.** Every project has things that break if done wrong. Document them prominently with DO/DON'T examples.

8. **Correct markdown fence nesting.** NEVER place ` ``` ` inside ` ``` ` — Markdown parsers will mismatch the fences and break all formatting. When a template block contains inner code blocks, use 4+ backticks (` ```` `) for the outer fence and 3 backticks (` ``` `) for inner fences. Each nesting level requires one additional backtick. Always validate that every opening fence has a matching closing fence at the same backtick count.

---

## Optional Additions

If your project needs them, ask the AI to also generate:

- **`.knowledge/resources/api-contracts.md`** — API endpoint documentation
- **`.knowledge/resources/data-model.md`** — Entity relationship documentation
- **`.knowledge/areas/deployment.md`** — Deployment pipeline and environments
- **`.knowledge/areas/testing.md`** — Testing strategy and patterns
- **`.vscode/settings.json`** — Workspace-specific VS Code settings
- **`.github/CODEOWNERS`** — Code ownership rules
