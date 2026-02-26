# Area: Branding System

> **Status:** Complete and maintained
> **Last updated:** 2026-02-26

---

## Overview

The branding system allows each tenant to fully customize their LMS appearance. It's the core differentiator of EgenAkademi as a whitelabel platform.

> **KEY:** All 14 color fields + 7 derived variables are injected server-side as CSS custom properties on `<html style="">`. No hardcoded colors anywhere in `.module.css` files.

---

## Architecture

1. **Database:** `Tenant` model has 14 color fields + logo/favicon/font fields
2. **CSS injection:** `src/app/layout.tsx` reads tenant branding and injects `<style>` tag
3. **Defaults:** `src/app/globals.css` defines `:root` variables as fallback
4. **Generator:** `src/lib/brandingGenerator.ts` generates 14 fields from 5 roles with WCAG check

## Components

| Component | File | Purpose |
|---|---|---|
| BrandingForm | `src/app/admin/branding/BrandingForm.tsx` | Main form for all branding fields |
| BrandDetector | `src/app/admin/branding/BrandDetector.tsx` | URL-based automatic brand detection |
| ManualAssistant | `src/app/admin/branding/ManualAssistant.tsx` | 5-role → 14-field color generator |
| LogoUploader | `src/app/admin/branding/LogoUploader.tsx` | Logo upload with SVG recoloring |
| FontPicker | `src/app/admin/branding/FontPicker.tsx` | Google Fonts + custom font upload |
| ColorFieldTip | `src/app/admin/branding/ColorFieldTip.tsx` | WCAG contrast tips per field |

## CSS Variable Catalog

See `.github/copilot-instructions.md` for the complete catalog of 14 stored + 7 derived variables.

## Rules

1. NEVER hardcode hex/rgba in `.module.css` for themed elements
2. Use `color-mix()` for alpha-blending with CSS variables
3. Sidebar elements MUST use `--color-sidebar-*` variables
4. New color fields require updates in: schema.prisma, layout.tsx, globals.css, BrandingForm.tsx, brandingActions.ts, brandingGenerator.ts
