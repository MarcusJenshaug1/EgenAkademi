/**
 * Branding generator — derives a full 14-field colour palette
 * from 5 "role" colours with automatic WCAG contrast enforcement.
 */

import {
    contrastRatio,
    ensureContrast,
    chooseBestTextOnBg,
    muteColor,
    deriveBorder,
    isValidHex,
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
    brand: 'Merkevarefarge',
    bgPrimary: 'Hovedbakgrunn',
    bgSecondary: 'Panelbakgrunn',
    textPrimary: 'Hovedtekst',
    sidebarBg: 'Sidebar-bakgrunn',
};

export const ROLE_HINTS: Record<keyof BrandingRoles, string> = {
    brand:
        'Din viktigste merkevarefarge — brukes som aksent, knapper og aktive elementer.',
    bgPrimary:
        'Bakgrunnsfargen for hele siden. Mørk for dark mode, lys for light mode.',
    bgSecondary:
        'Sekundær bakgrunn brukt i kort, paneler og modaler.',
    textPrimary:
        'Hovedfargen for all tekst. Bør ha god kontrast mot bakgrunn.',
    sidebarBg:
        'Bakgrunnsfargen for navigasjonspanelet.',
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
}

export interface GeneratorResult {
    suggestions: Record<string, string>;
    details: GeneratedSuggestion[];
    preset: string;
    roles: BrandingRoles;
}

// ── Status colour defaults ──────────────────────────────────

const STATUS_DEFAULTS = {
    success: '#10b981',   // Vivid emerald green
    warning: '#f59e0b',   // Warm amber
    danger: '#f43f5e',    // Vibrant rose-red
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

    function add(
        field: string,
        value: string,
        reasoning: string,
        contrastAgainst?: string,
        original?: string,
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
            entry.contrastRatio =
                Math.round(contrastRatio(value, contrastAgainst) * 10) / 10;
        }
        details.push(entry);
    }

    // ── 1. Backgrounds (direct pass-through) ──
    add('colorBgPrimary', bgPrimary, 'Direkte fra rolle: Hovedbakgrunn');
    add('colorBgSecondary', bgSecondary, 'Direkte fra rolle: Panelbakgrunn');

    // ── 2. Text colours ──
    const textAdj = ensureContrast(textPrimary, bgPrimary, preset.textOnBg);
    add(
        'colorTextPrimary',
        textAdj,
        `Hovedtekst — ${preset.textOnBg}:1 krav`,
        bgPrimary,
        textPrimary,
    );

    const textSecondaryRaw = muteColor(textAdj, bgPrimary, 0.35);
    const textSecondaryAdj = ensureContrast(
        textSecondaryRaw,
        bgPrimary,
        preset.largeText,
    );
    add(
        'colorTextSecondary',
        textSecondaryAdj,
        `Dempet tekst — ${preset.largeText}:1 krav`,
        bgPrimary,
        textSecondaryRaw,
    );

    // ── 3. Border ──
    const border = deriveBorder(bgSecondary);
    add('colorBorder', border, 'Avledet fra panelbakgrunn');

    // ── 4. Accent / Brand ──
    const accentAdj = ensureContrast(brand, bgPrimary, preset.largeText);
    add(
        'colorAccent',
        accentAdj,
        `Merkevarefarge — ${preset.largeText}:1 krav`,
        bgPrimary,
        brand,
    );

    // ── 5. Buttons ──
    const btnBgAdj = ensureContrast(brand, bgPrimary, preset.largeText);
    add(
        'colorButtonPrimary',
        btnBgAdj,
        `Knappebakgrunn — ${preset.largeText}:1 krav`,
        bgPrimary,
        brand,
    );

    const btnText = chooseBestTextOnBg(btnBgAdj);
    add('colorButtonText', btnText, 'Beste tekstfarge for knappebakgrunn', btnBgAdj);

    // ── 6. Sidebar ──
    add('colorSidebarBg', sidebarBg, 'Direkte fra rolle: Sidebar-bakgrunn');

    const sidebarTextCandidates = [
        '#ffffff', '#e5e5e5', '#a1a1aa', '#71717a',
        '#404040', '#1a1a1a', '#000000',
    ];
    const sidebarTextRaw = chooseBestTextOnBg(sidebarBg, sidebarTextCandidates);
    const sidebarTextAdj = ensureContrast(
        sidebarTextRaw,
        sidebarBg,
        preset.largeText,
    );
    add(
        'colorSidebarText',
        sidebarTextAdj,
        `Sidebar-tekst — ${preset.largeText}:1 krav`,
        sidebarBg,
        sidebarTextRaw,
    );

    const sidebarActiveAdj = ensureContrast(brand, sidebarBg, preset.uiOnBg);
    add(
        'colorSidebarActive',
        sidebarActiveAdj,
        `Aktiv lenke — ${preset.uiOnBg}:1 krav`,
        sidebarBg,
        brand,
    );

    // ── 7. Status colours ──
    const successAdj = ensureContrast(
        STATUS_DEFAULTS.success,
        bgPrimary,
        preset.largeText,
    );
    add(
        'colorSuccess',
        successAdj,
        `Suksessfarge — ${preset.largeText}:1 krav`,
        bgPrimary,
        STATUS_DEFAULTS.success,
    );

    const warningAdj = ensureContrast(
        STATUS_DEFAULTS.warning,
        bgPrimary,
        preset.largeText,
    );
    add(
        'colorWarning',
        warningAdj,
        `Advarselsfarge — ${preset.largeText}:1 krav`,
        bgPrimary,
        STATUS_DEFAULTS.warning,
    );

    const dangerAdj = ensureContrast(
        STATUS_DEFAULTS.danger,
        bgPrimary,
        preset.largeText,
    );
    add(
        'colorDanger',
        dangerAdj,
        `Feilfarge — ${preset.largeText}:1 krav`,
        bgPrimary,
        STATUS_DEFAULTS.danger,
    );

    // Build flat suggestion map
    const suggestions: Record<string, string> = {};
    for (const d of details) {
        suggestions[d.field] = d.value;
    }

    return { suggestions, details, preset: presetKey, roles };
}
