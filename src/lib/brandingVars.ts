/**
 * Shared derived-CSS-variable builder for the EgenAkademi branding system.
 *
 * Single source of truth for translating tenant branding colour fields into
 * the full set of CSS custom properties (base + derived). This module is a
 * collection of PURE functions with NO server-only imports, so it can be
 * consumed from both a server component (app/layout.tsx) and a client
 * component (the live branding preview) — guaranteeing the preview matches
 * production exactly.
 */

export interface BrandingColorInput {
  colorBgPrimary?: string | null;
  colorBgSecondary?: string | null;
  colorTextPrimary?: string | null;
  colorTextSecondary?: string | null;
  colorBorder?: string | null;
  colorAccent?: string | null;
  colorButtonPrimary?: string | null;
  colorButtonText?: string | null;
  colorSidebarBg?: string | null;
  colorSidebarText?: string | null;
  colorSidebarActive?: string | null;
  colorSuccess?: string | null;
  colorWarning?: string | null;
  colorDanger?: string | null;
  // Optional overrides for otherwise-derived state/effect vars.
  // When null/empty, the value is auto-derived (original behaviour).
  colorSidebarHoverBg?: string | null;
  colorSidebarHoverText?: string | null;
  colorTopbarBg?: string | null;
  colorTopbarText?: string | null;
  fontFamily?: string | null;
}

/**
 * Mapping from DB field name to CSS custom-property name.
 * Single source of truth — imported by layout.tsx (was previously inline there).
 */
export const CSS_VAR_MAP: Record<string, string> = {
  colorBgPrimary: '--color-bg-primary',
  colorBgSecondary: '--color-bg-secondary',
  colorTextPrimary: '--color-text-primary',
  colorTextSecondary: '--color-text-secondary',
  colorBorder: '--color-border',
  colorAccent: '--color-accent-blue',
  colorButtonPrimary: '--color-button-primary',
  colorButtonText: '--color-button-text',
  colorSidebarBg: '--color-sidebar-bg',
  colorSidebarText: '--color-sidebar-text',
  colorSidebarActive: '--color-sidebar-active',
  colorSuccess: '--color-success',
  colorWarning: '--color-warning',
  colorDanger: '--color-danger',
};

/**
 * Perceived-brightness (weighted RGB) of a hex colour, normalised to 0..1.
 *
 * NOTE: This intentionally replicates the EXACT formula previously inlined in
 * layout.tsx — a simple weighted average `(0.299*r + 0.587*g + 0.114*b) / 255`
 * with NaN channels coerced to 0 — rather than the WCAG `relativeLuminance`
 * from colorUtils. Using a different formula here would silently change which
 * branch (light vs dark) is chosen for some colours, altering visual output.
 */
function perceivedBrightness(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Build the full set of CSS custom properties for a tenant's branding.
 *
 * Returns a `cssVarName -> value` map containing:
 *  - the (up to) 14 base vars, included only for non-null/non-empty inputs
 *  - the derived vars (accent-glow, gradient-primary, topbar-bg, topbar-text,
 *    sidebar-hover-bg, sidebar-hover-text, bg-surface) under the same
 *    conditions as the original layout.tsx logic
 *  - --font-sans when a fontFamily is provided
 *
 * The derivation order and light/dark decisions mirror the original inline
 * implementation exactly, so behaviour is unchanged.
 */
export function buildBrandingVars(
  input: BrandingColorInput,
): Record<string, string> {
  const vars: Record<string, string> = {};

  // Base vars — only emit non-null / non-empty values (mirrors `if (value)`).
  for (const [dbField, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = (input as Record<string, string | null | undefined>)[dbField];
    if (value) {
      vars[cssVar] = value;
    }
  }

  // Accent glow + gradient derived from accent.
  if (input.colorAccent) {
    vars['--color-accent-glow'] = `${input.colorAccent}26`;
    vars['--gradient-primary'] =
      `linear-gradient(135deg, ${input.colorAccent} 0%, ${input.colorAccent}cc 100%)`;
  }

  // Topbar — explicit override wins, else derived from bg-primary (semi-transparent).
  if (input.colorTopbarBg) {
    vars['--color-topbar-bg'] = input.colorTopbarBg;
  } else if (input.colorBgPrimary) {
    vars['--color-topbar-bg'] = `${input.colorBgPrimary}cc`;
  }
  // Topbar text — explicit override wins, else follows text-primary.
  if (input.colorTopbarText) {
    vars['--color-topbar-text'] = input.colorTopbarText;
  } else if (input.colorTextPrimary) {
    vars['--color-topbar-text'] = input.colorTextPrimary;
  }

  // Sidebar hover bg — explicit override wins, else derived overlay from sidebar bg.
  if (input.colorSidebarHoverBg) {
    vars['--color-sidebar-hover-bg'] = input.colorSidebarHoverBg;
  } else if (input.colorSidebarBg) {
    // Detect if sidebar is light or dark to pick appropriate hover overlay.
    const lum = perceivedBrightness(input.colorSidebarBg);
    if (lum > 0.5) {
      // Light sidebar → darken on hover.
      vars['--color-sidebar-hover-bg'] = 'rgba(0, 0, 0, 0.08)';
    } else {
      // Dark sidebar → lighten on hover.
      vars['--color-sidebar-hover-bg'] = 'rgba(255, 255, 255, 0.08)';
    }
  }
  // Sidebar hover text — explicit override wins, else follows text-primary.
  if (input.colorSidebarHoverText) {
    vars['--color-sidebar-hover-text'] = input.colorSidebarHoverText;
  } else if (input.colorTextPrimary) {
    vars['--color-sidebar-hover-text'] = input.colorTextPrimary;
  }

  // Bg surface derived from bg-primary (subtle overlay).
  if (input.colorBgPrimary) {
    const lum = perceivedBrightness(input.colorBgPrimary);
    if (lum > 0.5) {
      vars['--color-bg-surface'] = 'rgba(0, 0, 0, 0.04)';
    } else {
      vars['--color-bg-surface'] = 'rgba(255, 255, 255, 0.03)';
    }
  }

  if (input.fontFamily) {
    vars['--font-sans'] = input.fontFamily;
  }

  return vars;
}

/**
 * Serialise a CSS-var map into a `k: v; k: v` string suitable for an inline
 * `:root { ... }` style block.
 */
export function brandingVarsToCssText(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}
