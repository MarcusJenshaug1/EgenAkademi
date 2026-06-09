/**
 * Shared colour utilities for EgenAkademi branding system.
 * Consolidates hex/rgb/hsl conversions, WCAG luminance & contrast,
 * and the ensureContrast algorithm used by the branding generator.
 */

// ── Parsing & Conversion ─────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '');
    const full =
        clean.length === 3
            ? clean.split('').map((c) => c + c).join('')
            : clean;
    return [
        parseInt(full.substring(0, 2), 16),
        parseInt(full.substring(2, 4), 16),
        parseInt(full.substring(4, 6), 16),
    ];
}

export function rgbToHex(r: number, g: number, b: number): string {
    return (
        '#' +
        [r, g, b]
            .map((c) =>
                Math.round(Math.min(255, Math.max(0, c)))
                    .toString(16)
                    .padStart(2, '0'),
            )
            .join('')
    );
}

export function rgbToHsl(
    r: number,
    g: number,
    b: number,
): [number, number, number] {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h, s, l];
}

function hueToRgb(p: number, q: number, t: number): number {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

export function hslToRgb(
    h: number,
    s: number,
    l: number,
): [number, number, number] {
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        Math.round(hueToRgb(p, q, h) * 255),
        Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    ];
}

export function hexToHsl(hex: string): [number, number, number] {
    return rgbToHsl(...hexToRgb(hex));
}

export function hslToHex(h: number, s: number, l: number): string {
    return rgbToHex(...hslToRgb(h, s, l));
}

// ── Normalisation & Validation ────────────────────────────

export function normalizeHex(hex: string): string {
    const clean = hex.replace('#', '');
    if (clean.length === 3) {
        return (
            '#' +
            clean
                .split('')
                .map((c) => c + c)
                .join('')
                .toLowerCase()
        );
    }
    return '#' + clean.substring(0, 6).toLowerCase();
}

export function isValidHex(hex: string): boolean {
    return /^#[0-9a-fA-F]{6}$/.test(hex);
}

/**
 * Normalise user colour input — accepts fff, FFF, #fff, #ffffff, rgb(...), etc.
 * Returns a lowercase 6-digit hex string (#rrggbb) or '' if empty.
 */
export function normalizeHexInput(raw: string): string {
    const v = raw.trim();
    if (!v || v === '#') return '';

    const stripped = v.replace(/^#/, '');

    // 3-digit hex → expand
    if (/^[0-9a-fA-F]{3}$/.test(stripped)) {
        return (
            '#' +
            stripped[0] +
            stripped[0] +
            stripped[1] +
            stripped[1] +
            stripped[2] +
            stripped[2]
        );
    }
    // 6-digit hex
    if (/^[0-9a-fA-F]{6}$/.test(stripped)) {
        return '#' + stripped.toLowerCase();
    }
    // 8-digit hex (with alpha) → drop alpha
    if (/^[0-9a-fA-F]{8}$/.test(stripped)) {
        return '#' + stripped.substring(0, 6).toLowerCase();
    }

    // rgb(r, g, b)
    const rgb = v.match(/rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)/i);
    if (rgb) {
        return (
            '#' +
            [+rgb[1], +rgb[2], +rgb[3]]
                .map((n) =>
                    Math.min(255, Math.max(0, n))
                        .toString(16)
                        .padStart(2, '0'),
                )
                .join('')
        );
    }

    return v;
}

// ── WCAG 2.2 Luminance & Contrast ─────────────────────────

export function relativeLuminance(r: number, g: number, b: number): number {
    const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928
            ? s / 12.92
            : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(hex1: string, hex2: string): number {
    const l1 = relativeLuminance(...hexToRgb(hex1));
    const l2 = relativeLuminance(...hexToRgb(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastLevel {
    level: 'pass' | 'warn' | 'fail';
    label: string;
}

export function getContrastLevel(ratio: number): ContrastLevel {
    if (ratio >= 4.5)
        return { level: 'pass', label: `${ratio.toFixed(1)}:1 — AA OK` };
    if (ratio >= 3)
        return {
            level: 'warn',
            label: `${ratio.toFixed(1)}:1 — Kun store tekster`,
        };
    return { level: 'fail', label: `${ratio.toFixed(1)}:1 — For lav kontrast` };
}

// ── Smart Colour Selection ─────────────────────────────────

/**
 * Pick the candidate with the best contrast ratio against `bg`.
 */
export function chooseBestTextOnBg(
    bg: string,
    candidates: string[] = ['#ffffff', '#000000'],
): string {
    let best = candidates[0];
    let bestRatio = 0;
    for (const c of candidates) {
        const r = contrastRatio(bg, c);
        if (r > bestRatio) {
            bestRatio = r;
            best = c;
        }
    }
    return best;
}

/**
 * Adjust `fgCandidate` so it achieves at least `minRatio` contrast against `bg`.
 *
 * Strategy:
 *  - 'auto': decides lighten/darken based on bg luminance
 *  - 'lighten': only increase lightness
 *  - 'darken': only decrease lightness
 *
 * Uses binary search on HSL lightness to find the closest colour that meets
 * the target ratio while preserving hue and saturation.
 */
export function ensureContrast(
    fgCandidate: string,
    bg: string,
    minRatio: number = 4.5,
    strategy: 'lighten' | 'darken' | 'auto' = 'auto',
): string {
    if (contrastRatio(fgCandidate, bg) >= minRatio) return fgCandidate;

    const [h, s] = hexToHsl(fgCandidate);
    const l = hexToHsl(fgCandidate)[2];
    const bgLum = relativeLuminance(...hexToRgb(bg));

    let direction = strategy;
    if (direction === 'auto') {
        direction = bgLum > 0.5 ? 'darken' : 'lighten';
    }

    let lo: number, hi: number;
    if (direction === 'lighten') {
        lo = l;
        hi = 1.0;
    } else {
        lo = 0.0;
        hi = l;
    }

    let bestL = direction === 'lighten' ? 1.0 : 0.0;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const test = hslToHex(h, s, mid);
        if (contrastRatio(test, bg) >= minRatio) {
            bestL = mid;
            if (direction === 'lighten') hi = mid;
            else lo = mid;
        } else {
            if (direction === 'lighten') lo = mid;
            else hi = mid;
        }
    }

    return hslToHex(h, s, bestL);
}

/**
 * Create a muted/dimmed version of a colour (for secondary text, etc.).
 * Moves lightness toward the midpoint with bg, with adjustable factor.
 */
export function muteColor(
    hex: string,
    bg: string,
    factor: number = 0.4,
): string {
    const [h, s, l] = hexToHsl(hex);
    const [, , bgL] = hexToHsl(bg);
    const targetL = l + (bgL - l) * factor;
    return hslToHex(h, s * 0.85, targetL);
}

/**
 * Derive a border colour from a background.
 * Slightly lighter or darker depending on background luminance.
 *
 * `satFactor` controls how much of the background saturation is retained;
 * a higher value produces a more tinted (and thus more visible) border.
 */
export function deriveBorder(
    bg: string,
    strength: number = 0.12,
    satFactor: number = 0.7,
): string {
    const [h, s, l] = hexToHsl(bg);
    const bgLum = relativeLuminance(...hexToRgb(bg));
    const newL =
        bgLum > 0.5
            ? Math.max(0, l - strength)
            : Math.min(1, l + strength);
    return hslToHex(h, Math.min(1, s * satFactor), newL);
}

// ── Hue / Saturation helpers ──────────────────────────────

/**
 * Smallest angular distance between two hues (in degrees, 0–180).
 * Accepts any two hex colours.
 */
export function hueDistance(hex1: string, hex2: string): number {
    const h1 = hexToHsl(hex1)[0] * 360;
    const h2 = hexToHsl(hex2)[0] * 360;
    const diff = Math.abs(h1 - h2) % 360;
    return diff > 180 ? 360 - diff : diff;
}

/**
 * Return a copy of `hex` with its HSL saturation set to `targetSat`
 * (0–1), preserving hue and lightness.
 */
export function setSaturation(hex: string, targetSat: number): string {
    const [h, , l] = hexToHsl(hex);
    return hslToHex(h, Math.min(1, Math.max(0, targetSat)), l);
}

/**
 * Multiply (or otherwise scale) a colour's saturation by `factor`,
 * preserving hue and lightness. `factor > 1` boosts, `< 1` mutes.
 */
export function adjustSaturation(hex: string, factor: number): string {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h, Math.min(1, Math.max(0, s * factor)), l);
}

/**
 * Shift a colour's HSL lightness by `delta` (clamped to 0–1),
 * preserving hue and saturation.
 */
export function adjustLightness(hex: string, delta: number): string {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h, s, Math.min(1, Math.max(0, l + delta)));
}

/**
 * Composite an opaque foreground over an opaque background at `alpha`
 * (0–1), returning the resulting opaque hex colour. Useful for previewing
 * how a translucent overlay will read against a solid surface.
 */
export function blendOver(fg: string, bg: string, alpha: number): string {
    const a = Math.min(1, Math.max(0, alpha));
    const [fr, fgc, fb] = hexToRgb(fg);
    const [br, bgc, bb] = hexToRgb(bg);
    return rgbToHex(
        fr * a + br * (1 - a),
        fgc * a + bgc * (1 - a),
        fb * a + bb * (1 - a),
    );
}

/**
 * Normalise a status colour (success/warning/danger) to a vivid, mid-tone
 * version so it stays unmistakably green/orange/red regardless of how the
 * incoming default is tuned. Saturation is pushed into [minSat, 1] and
 * lightness is pulled toward `targetL` while preserving hue.
 */
export function vividMidtone(
    hex: string,
    minSat: number = 0.7,
    targetL: number = 0.5,
    lightnessPull: number = 0.6,
): string {
    const [h, s, l] = hexToHsl(hex);
    const newS = Math.min(1, Math.max(minSat, s));
    const newL = l + (targetL - l) * Math.min(1, Math.max(0, lightnessPull));
    return hslToHex(h, newS, newL);
}

/**
 * Ensure `fgCandidate` meets `minRatio` against `bg`, then verify it ALSO
 * meets `secondaryMin` against `bg2`. If the second background fails, the
 * colour is re-adjusted to satisfy the larger of the two requirements
 * against whichever background is the worse case, so the returned colour
 * is guaranteed to clear `minRatio` on `bg` and `secondaryMin` on `bg2`.
 */
export function ensureContrastOnBoth(
    fgCandidate: string,
    bg: string,
    bg2: string,
    minRatio: number = 4.5,
    secondaryMin: number = minRatio,
    strategy: 'lighten' | 'darken' | 'auto' = 'auto',
): string {
    let result = ensureContrast(fgCandidate, bg, minRatio, strategy);
    if (contrastRatio(result, bg2) < secondaryMin) {
        // Re-derive against the harder background, then re-confirm the first.
        result = ensureContrast(result, bg2, secondaryMin, strategy);
        if (contrastRatio(result, bg) < minRatio) {
            result = ensureContrast(result, bg, minRatio, strategy);
        }
    }
    return result;
}
