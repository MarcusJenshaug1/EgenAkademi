/**
 * Branding generator — derives a full 14-field colour palette
 * from 5 "role" colours with automatic WCAG contrast enforcement.
 */

import {
    contrastRatio,
    ensureContrast,
    ensureContrastOnBoth,
    chooseBestTextOnBg,
    muteColor,
    deriveBorder,
    isValidHex,
    hueDistance,
    setSaturation,
    adjustLightness,
    vividMidtone,
    hexToHsl,
} from './colorUtils';

// ── Preset definitions ──────────────────────────────────────

export interface ContrastPreset {
    label: string;
    description: string;
    textOnBg: number;   // normal text on primary background
    uiOnBg: number;     // interactive elements (accent, buttons, active links)
    largeText: number;  // large text / secondary text minimum
}

export const PRESETS: Record<string, ContrastPreset> = {
    standard: {
        label: 'Standard (WCAG AA)',
        description:
            'Anbefalt for de fleste. 4.5:1 for tekst, 3:1 for store elementer.',
        textOnBg: 4.5,
        uiOnBg: 4.5,
        largeText: 3.0,
    },
    streng: {
        label: 'Streng (WCAG AAA)',
        description:
            'Høyeste tilgjengelighet. 7:1 for tekst, 3:1 for store elementer.',
        textOnBg: 7.0,
        uiOnBg: 7.0,
        largeText: 3.0,
    },
    avslappet: {
        label: 'Avslappet',
        description:
            'Lettere krav. 3:1 for tekst, 4.5:1 for interaktive elementer.',
        textOnBg: 3.0,
        uiOnBg: 4.5,
        largeText: 3.0,
    },
};

// ── Role input ──────────────────────────────────────────────

export interface BrandingRoles {
    brand: string;       // Merkevarefarge (accent)
    bgPrimary: string;   // Hovedbakgrunn
    bgSecondary: string; // Panelbakgrunn / kort
    textPrimary: string; // Hovedtekst
    sidebarBg: string;   // Sidebar-bakgrunn
}

export const ROLE_DEFAULTS: BrandingRoles = {
    brand: '#3b82f6',
    bgPrimary: '#050505',
    bgSecondary: '#0f0f11',
    textPrimary: '#ffffff',
    sidebarBg: '#0a0a0a',
};

export const ROLE_LABELS: Record<keyof BrandingRoles, string> = {
    brand: 'Merkevarefarge (aksent)',
    bgPrimary: 'Sidebakgrunn',
    bgSecondary: 'Kort-bakgrunn',
    textPrimary: 'Tekstfarge',
    sidebarBg: 'Meny-bakgrunn',
};

export const ROLE_HINTS: Record<keyof BrandingRoles, string> = {
    brand:
        'Hovedfargen — brukes på lenker, knapper og aktive elementer.',
    bgPrimary:
        'Bakgrunn for hele siden — mørk gir mørkt tema, lys gir lyst tema.',
    bgSecondary:
        'Bakgrunn for kort og paneler — påvirker også rammefargen.',
    textPrimary:
        'Farge for brødtekst — kontrasten mot bakgrunnen sikres automatisk.',
    sidebarBg:
        'Bakgrunn for sidemenyen — tekst og aktiv lenke beregnes ut fra denne.',
};

// ── Generator output ────────────────────────────────────────

export interface GeneratedSuggestion {
    field: string;
    value: string;
    source: 'manual';
    reasoning: string;
    contrastAgainst?: string;
    contrastRatio?: number;
    adjusted: boolean;
    /**
     * Additive: a secondary background the colour was also validated against
     * (e.g. text validated against both page and panel backgrounds).
     */
    secondaryContrastAgainst?: string;
    /** Additive: contrast ratio against `secondaryContrastAgainst`. */
    secondaryContrastRatio?: number;
}

export interface GeneratorResult {
    suggestions: Record<string, string>;
    details: GeneratedSuggestion[];
    preset: string;
    roles: BrandingRoles;
}

// ── Status colour defaults ──────────────────────────────────

const STATUS_DEFAULTS = {
    success: '#22c55e',   // Bright green
    warning: '#f97316',   // Vibrant orange
    danger: '#ef4444',    // Bright red
};

// ── Field labels (for display in results) ───────────────────

export const FIELD_LABELS: Record<string, string> = {
    colorBgPrimary: 'Hovedbakgrunn',
    colorBgSecondary: 'Sekundær bakgrunn',
    colorTextPrimary: 'Hovedtekst',
    colorTextSecondary: 'Sekundærtekst',
    colorBorder: 'Border',
    colorAccent: 'Aksentfarge',
    colorButtonPrimary: 'Knapp bakgrunn',
    colorButtonText: 'Knapp tekst',
    colorSidebarBg: 'Sidebar bakgrunn',
    colorSidebarText: 'Sidebar tekst',
    colorSidebarActive: 'Aktiv lenke',
    colorSuccess: 'Suksess',
    colorWarning: 'Advarsel',
    colorDanger: 'Feil',
};

// ── Main generator ──────────────────────────────────────────

export function deriveBrandingSuggestionsFromRoles(
    roles: BrandingRoles,
    presetKey: string = 'standard',
): GeneratorResult {
    const preset = PRESETS[presetKey] || PRESETS.standard;
    const { brand, bgPrimary, bgSecondary, textPrimary, sidebarBg } = roles;
    const details: GeneratedSuggestion[] = [];

    function round1(n: number): number {
        return Math.round(n * 10) / 10;
    }

    function add(
        field: string,
        value: string,
        reasoning: string,
        contrastAgainst?: string,
        original?: string,
        secondaryContrastAgainst?: string,
    ) {
        const adjusted = original !== undefined && original !== value;
        const entry: GeneratedSuggestion = {
            field,
            value,
            source: 'manual',
            reasoning,
            adjusted,
        };
        if (contrastAgainst && isValidHex(value) && isValidHex(contrastAgainst)) {
            entry.contrastAgainst = contrastAgainst;
            entry.contrastRatio = round1(contrastRatio(value, contrastAgainst));
        }
        if (
            secondaryContrastAgainst &&
            isValidHex(value) &&
            isValidHex(secondaryContrastAgainst)
        ) {
            entry.secondaryContrastAgainst = secondaryContrastAgainst;
            entry.secondaryContrastRatio = round1(
                contrastRatio(value, secondaryContrastAgainst),
            );
        }
        details.push(entry);
    }

    // ── 1. Backgrounds (direct pass-through) ──
    add('colorBgPrimary', bgPrimary, 'Direkte fra rolle: Hovedbakgrunn');
    add('colorBgSecondary', bgSecondary, 'Direkte fra rolle: Panelbakgrunn');

    // ── 2. Text colours ──
    // Primary text must clear textOnBg against BOTH the page background and
    // the panel/card background — validate against the worse case.
    const textAdj = ensureContrastOnBoth(
        textPrimary,
        bgPrimary,
        bgSecondary,
        preset.textOnBg,
        preset.textOnBg,
    );
    add(
        'colorTextPrimary',
        textAdj,
        `Hovedtekst — ${preset.textOnBg}:1 mot bade hoved- og panelbakgrunn (verste tilfelle)`,
        bgPrimary,
        textPrimary,
        bgSecondary,
    );

    // Secondary text is muted from primary, then must clear at least
    // largeText (3:1) against BOTH backgrounds — but we prefer the full
    // textOnBg (4.5:1) if the muted colour can reach it on both without
    // being driven all the way back to the primary text colour.
    const textSecondaryRaw = muteColor(textAdj, bgPrimary, 0.35);
    const prefersStrict = (() => {
        const strict = ensureContrastOnBoth(
            textSecondaryRaw,
            bgPrimary,
            bgSecondary,
            preset.textOnBg,
            preset.textOnBg,
        );
        // Only adopt the stricter result if it stays visibly muted
        // (i.e. still distinguishable from full primary text).
        return contrastRatio(strict, textAdj) > 1.05 ? strict : null;
    })();
    const textSecondaryAdj =
        prefersStrict ??
        ensureContrastOnBoth(
            textSecondaryRaw,
            bgPrimary,
            bgSecondary,
            preset.largeText,
            preset.largeText,
        );
    const secReq = prefersStrict ? preset.textOnBg : preset.largeText;
    add(
        'colorTextSecondary',
        textSecondaryAdj,
        `Dempet tekst — minst ${secReq}:1 mot bade hoved- og panelbakgrunn (verste tilfelle)`,
        bgPrimary,
        textSecondaryRaw,
        bgSecondary,
    );

    // ── 3. Border ──
    // Borders must be visible against BOTH the page background and the panel
    // background. Derive from the panel bg, then if either contrast falls
    // below ~1.5:1 keep increasing the derive strength (and saturation) until
    // the border separates from both surfaces.
    const BORDER_MIN = 1.5;
    let border = deriveBorder(bgSecondary);
    {
        let strength = 0.12;
        let satFactor = 0.7;
        let guard = 0;
        while (
            (contrastRatio(border, bgPrimary) < BORDER_MIN ||
                contrastRatio(border, bgSecondary) < BORDER_MIN) &&
            guard < 24
        ) {
            strength = Math.min(0.6, strength + 0.05);
            satFactor = Math.min(1.4, satFactor + 0.1);
            border = deriveBorder(bgSecondary, strength, satFactor);
            guard++;
        }
    }
    add(
        'colorBorder',
        border,
        `Avledet fra panelbakgrunn — minst ${BORDER_MIN}:1 mot bade hoved- og panelbakgrunn for synlighet`,
        bgPrimary,
        deriveBorder(bgSecondary),
        bgSecondary,
    );

    // ── 4. Accent / Brand ──
    // The accent is used as LINK TEXT and focus, so it must meet the
    // interactive text requirement (uiOnBg, 4.5:1 in standard) against the
    // page background, and also stay >=3:1 on the panel background.
    const accentAdj = ensureContrastOnBoth(
        brand,
        bgPrimary,
        bgSecondary,
        preset.uiOnBg,
        preset.largeText,
    );
    add(
        'colorAccent',
        accentAdj,
        `Aksent/lenketekst — ${preset.uiOnBg}:1 mot hovedbakgrunn og minst ${preset.largeText}:1 mot panelbakgrunn`,
        bgPrimary,
        brand,
        bgSecondary,
    );

    // ── 5. Buttons ──
    // The primary button is a primary interactive SURFACE, so its background
    // targets uiOnBg against the page background — the same rule the active
    // sidebar link uses against the sidebar background.
    let btnBgAdj = ensureContrast(brand, bgPrimary, preset.uiOnBg);

    // Button text: pick black-or-white, then GUARANTEE >=4.5:1 against the
    // button surface (small button labels are normal text).
    let btnText = chooseBestTextOnBg(btnBgAdj);
    if (contrastRatio(btnText, btnBgAdj) < 4.5) {
        // First try nudging the text colour itself.
        const ensured = ensureContrast(btnText, btnBgAdj, 4.5);
        if (contrastRatio(ensured, btnBgAdj) >= 4.5) {
            btnText = ensured;
        } else {
            // Mid-tone button: nudge the BUTTON lightness (preserving hue &
            // saturation) until a pure black-or-white label clears 4.5:1.
            const [, , bl] = hexToHsl(btnBgAdj);
            // A pure label needs the surface to be either dark enough (white
            // text) or light enough (black text); push toward whichever side
            // is closer.
            const goLighter = bl >= 0.5;
            let candidate = btnBgAdj;
            let guard = 0;
            while (guard < 40) {
                const label = chooseBestTextOnBg(candidate);
                if (contrastRatio(label, candidate) >= 4.5) {
                    btnBgAdj = candidate;
                    btnText = label;
                    break;
                }
                candidate = adjustLightness(candidate, goLighter ? 0.025 : -0.025);
                guard++;
            }
            // Final safety net: if hue-preserving nudges somehow failed,
            // fall back to the best pure label on the last candidate.
            if (contrastRatio(btnText, btnBgAdj) < 4.5) {
                btnBgAdj = candidate;
                btnText = chooseBestTextOnBg(candidate);
            }
        }
    }

    add(
        'colorButtonPrimary',
        btnBgAdj,
        `Knappebakgrunn — primaer interaktiv flate, ${preset.uiOnBg}:1 mot hovedbakgrunn (samme regel som aktiv sidebar-lenke)`,
        bgPrimary,
        brand,
    );
    add(
        'colorButtonText',
        btnText,
        'Knappetekst — garantert minst 4.5:1 mot knappebakgrunn (liten brodtekst)',
        btnBgAdj,
    );

    // ── 6. Sidebar ──
    add('colorSidebarBg', sidebarBg, 'Direkte fra rolle: Sidebar-bakgrunn');

    const sidebarTextCandidates = [
        '#ffffff', '#e5e5e5', '#a1a1aa', '#71717a',
        '#404040', '#1a1a1a', '#000000',
    ];
    const sidebarTextRaw = chooseBestTextOnBg(sidebarBg, sidebarTextCandidates);
    // Sidebar menu items are small nav text → full textOnBg (4.5:1), not 3:1.
    const sidebarTextAdj = ensureContrast(
        sidebarTextRaw,
        sidebarBg,
        preset.textOnBg,
    );
    add(
        'colorSidebarText',
        sidebarTextAdj,
        `Sidebar-tekst — ${preset.textOnBg}:1 mot sidebar-bakgrunn (liten navigasjonstekst)`,
        sidebarBg,
        sidebarTextRaw,
    );

    // Active link: meet uiOnBg against the sidebar bg AND be visually
    // distinct from it. If the brand hue is close to the sidebar hue and the
    // brand is desaturated, boost saturation / shift lightness so the active
    // state is clearly visible before enforcing contrast.
    let sidebarActiveBase = brand;
    {
        const brandSat = hexToHsl(brand)[1];
        const closeHue = hueDistance(brand, sidebarBg) <= 25;
        const lowSat = brandSat < 0.4;
        if (closeHue && lowSat) {
            // Boost saturation to make the hue read as a distinct accent.
            sidebarActiveBase = setSaturation(brand, Math.max(0.6, brandSat));
            // If still nearly grey (e.g. brand was almost achromatic), also
            // shift lightness away from the sidebar to add separation.
            if (hueDistance(sidebarActiveBase, sidebarBg) <= 25) {
                const sidebarL = hexToHsl(sidebarBg)[2];
                sidebarActiveBase = adjustLightness(
                    sidebarActiveBase,
                    sidebarL > 0.5 ? -0.2 : 0.2,
                );
            }
        }
    }
    const sidebarActiveAdj = ensureContrast(
        sidebarActiveBase,
        sidebarBg,
        preset.uiOnBg,
    );
    add(
        'colorSidebarActive',
        sidebarActiveAdj,
        `Aktiv lenke — primaer interaktiv flate, ${preset.uiOnBg}:1 mot sidebar-bakgrunn (samme regel som primaerknapp) og tydelig adskilt fra bakgrunnen`,
        sidebarBg,
        brand,
    );

    // ── 7. Status colours ──
    // Status colours stay brand-independent. Before contrast-adjusting we
    // normalise each to a vivid mid-tone (saturation ~70-85%, lightness mid)
    // so success/warning/danger stay unmistakably green/orange/red and
    // distinct from one another. Then we enforce >=largeText (3:1) against the
    // page background AND verify each also clears >=3:1 on the panel bg.
    const STATUS_MIN_SAT = 0.78;
    const STATUS_TARGET_L = 0.5;

    const successVivid = vividMidtone(
        STATUS_DEFAULTS.success,
        STATUS_MIN_SAT,
        STATUS_TARGET_L,
    );
    const successAdj = ensureContrastOnBoth(
        successVivid,
        bgPrimary,
        bgSecondary,
        preset.largeText,
        preset.largeText,
    );
    add(
        'colorSuccess',
        successAdj,
        `Suksessfarge — livlig grontone, minst ${preset.largeText}:1 mot bade hoved- og panelbakgrunn`,
        bgPrimary,
        STATUS_DEFAULTS.success,
        bgSecondary,
    );

    const warningVivid = vividMidtone(
        STATUS_DEFAULTS.warning,
        STATUS_MIN_SAT,
        STATUS_TARGET_L,
    );
    const warningAdj = ensureContrastOnBoth(
        warningVivid,
        bgPrimary,
        bgSecondary,
        preset.largeText,
        preset.largeText,
    );
    add(
        'colorWarning',
        warningAdj,
        `Advarselsfarge — livlig oransjetone, minst ${preset.largeText}:1 mot bade hoved- og panelbakgrunn`,
        bgPrimary,
        STATUS_DEFAULTS.warning,
        bgSecondary,
    );

    const dangerVivid = vividMidtone(
        STATUS_DEFAULTS.danger,
        STATUS_MIN_SAT,
        STATUS_TARGET_L,
    );
    const dangerAdj = ensureContrastOnBoth(
        dangerVivid,
        bgPrimary,
        bgSecondary,
        preset.largeText,
        preset.largeText,
    );
    add(
        'colorDanger',
        dangerAdj,
        `Feilfarge — livlig rodtone, minst ${preset.largeText}:1 mot bade hoved- og panelbakgrunn`,
        bgPrimary,
        STATUS_DEFAULTS.danger,
        bgSecondary,
    );

    // Build flat suggestion map
    const suggestions: Record<string, string> = {};
    for (const d of details) {
        suggestions[d.field] = d.value;
    }

    return { suggestions, details, preset: presetKey, roles };
}
