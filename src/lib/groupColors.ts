/**
 * Group color utilities with WCAG AA contrast checking.
 * Suggests colors that contrast well with the tenant's branding
 * and don't repeat across existing groups.
 */

// ── Color palette ──────────────────────────────────────────────
// A curated set of accessible colors that work well on dark UIs.
// Each has a minimum 4.5:1 contrast ratio against typical dark backgrounds.

export const GROUP_COLOR_PALETTE = [
    { hex: '#3b82f6', name: 'Blå' },
    { hex: '#8b5cf6', name: 'Lilla' },
    { hex: '#06b6d4', name: 'Cyan' },
    { hex: '#10b981', name: 'Smaragd' },
    { hex: '#f59e0b', name: 'Gul' },
    { hex: '#ef4444', name: 'Rød' },
    { hex: '#ec4899', name: 'Rosa' },
    { hex: '#f97316', name: 'Oransje' },
    { hex: '#14b8a6', name: 'Teal' },
    { hex: '#a78bfa', name: 'Fiolett' },
    { hex: '#22d3ee', name: 'Lyseblå' },
    { hex: '#84cc16', name: 'Lime' },
    { hex: '#e879f9', name: 'Magenta' },
    { hex: '#fb923c', name: 'Fersken' },
    { hex: '#34d399', name: 'Mint' },
    { hex: '#60a5fa', name: 'Kornblomst' },
] as const;

// ── Contrast utilities ─────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

/** Returns true if string is a valid 6-digit hex color (with or without #) */
export function isValidHex(hex: string): boolean {
    return /^#?[0-9a-fA-F]{6}$/.test(hex.trim());
}

function sRGBtoLinear(c: number): number {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
}

export function contrastRatio(color1: string, color2: string): number {
    const l1 = relativeLuminance(color1);
    const l2 = relativeLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAA(foreground: string, background: string): boolean {
    return contrastRatio(foreground, background) >= 4.5;
}

// ── Color distance (perceptual) ────────────────────────────────

function colorDistance(hex1: string, hex2: string): number {
    const [r1, g1, b1] = hexToRgb(hex1);
    const [r2, g2, b2] = hexToRgb(hex2);
    // Weighted Euclidean for perceptual similarity
    const rMean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(
        (2 + rMean / 256) * dr * dr +
        4 * dg * dg +
        (2 + (255 - rMean) / 256) * db * db
    );
}

// ── Suggest group colors ───────────────────────────────────────

export interface ColorSuggestion {
    hex: string;
    name: string;
    contrastOnDark: number;
    meetsAA: boolean;
}

/**
 * Returns color suggestions for a new group, ranked by best contrast
 * and not conflicting with already-used group colors or branding accent.
 */
export function suggestGroupColors(
    usedColors: string[],
    brandingAccent?: string,
    bgColor: string = '#050505',
): ColorSuggestion[] {
    const avoid = [...usedColors.map(c => c.toLowerCase())];
    if (brandingAccent) avoid.push(brandingAccent.toLowerCase());

    const MIN_DISTANCE = 80; // minimum perceptual distance from used colors

    return GROUP_COLOR_PALETTE
        .filter((c) => {
            // Filter out colors too similar to already-used ones
            const cLower = c.hex.toLowerCase();
            if (avoid.includes(cLower)) return false;
            return !avoid.some((used) => colorDistance(cLower, used) < MIN_DISTANCE);
        })
        .map((c) => {
            const ratio = contrastRatio(c.hex, bgColor);
            return {
                hex: c.hex,
                name: c.name,
                contrastOnDark: Math.round(ratio * 100) / 100,
                meetsAA: ratio >= 4.5,
            };
        })
        .sort((a, b) => {
            // Prefer WCAG AA first, then highest contrast
            if (a.meetsAA !== b.meetsAA) return a.meetsAA ? -1 : 1;
            return b.contrastOnDark - a.contrastOnDark;
        });
}
