# Resource: LMS Competitive Research

> **Source:** `.tmp/deep-research-report (1).md` (937 lines)
> **Created:** 2026-02-26
> **Type:** Research report

---

## Summary

Comprehensive competitive analysis of 8 LMS platforms: Moodle, Canvas, Blackboard, TalentLMS, LearnDash, Teachable, Docebo, Absorb.

> **KEY:** The market converges on 5 coupled subsystems: Catalogue, Builder, Assignment, Progress, Gating. Our implementation should follow these patterns.

---

## Key Patterns Identified

### 1. Catalogue ≠ Course Structure
Mature systems separate browseable catalogues from underlying course objects. Visibility rules and self-enrollment happen at the catalogue layer.

### 2. Builder UX = Tree + Canvas + Inspector
Drag-and-drop ordering + explicit draft/publish semantics. LearnDash, Absorb, Docebo all follow this.

### 3. Progress and Gating Are Coupled
- Moodle: "Restrict access" with conditions (completion, dates, grades, groups)
- Canvas: Module prerequisites/requirements
- Teachable: Sequential progress enforcement
- Absorb/Docebo: Prerequisites + automated enrollment rules

### 4. Assignment = Rules Engine + Bulk Operations
Corporate LMSs differentiate with automation (Absorb: Automatic Enrollment Rules, Docebo: Enrollment Rules).

### 5. Versioned Content Model Recommended
Immutable published versions. Block-based lesson builder with typed blocks. Two-layer assignment (rules + per-user enrollments). Progress event model for both real-time UX and analytics.

---

## Recommended Architecture (from report)

- **Versioned course-content model** — immutable published versions
- **Block-based lesson builder** — typed blocks stored as JSON + indexed metadata
- **Two-layer assignment** — rules + generated per-user enrollments
- **Progress event model** — supports real-time UX (checklists, gating) AND analytics

---

## Full Report Location

See `.tmp/deep-research-report (1).md` for the complete 937-line analysis.
