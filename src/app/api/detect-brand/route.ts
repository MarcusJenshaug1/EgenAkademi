import { NextRequest, NextResponse } from 'next/server';

/* ═══════════════════════════════════════════════════════════════════════
   Types – DetectionResult is the public API shape.  DO NOT change.
   ═══════════════════════════════════════════════════════════════════════ */
interface DetectedColor {
    hex: string;
    sources: string[];
    importance: number;
    category: 'background' | 'text' | 'accent' | 'neutral' | 'success' | 'warning' | 'danger';
}

interface DetectionResult {
    url: string;
    title?: string;
    colors: DetectedColor[];
    suggestions: Record<string, string>;
    detectedRoles?: {
        brand: string;
        bgPrimary: string;
        bgSecondary: string;
        textPrimary: string;
        sidebarBg: string;
    };
    faviconUrl?: string;
    logoUrl?: string;
    logoSvgContent?: string;
    googleFonts?: string[];
    detectedFonts?: string[];
    siteTheme?: 'light' | 'dark';
}

/* ═══════════════════════════════════════════════════════════════════════
   CSS named-colour keywords → hex   (common subset; rare names omitted)
   ═══════════════════════════════════════════════════════════════════════ */
const CSS_KEYWORDS: Record<string, string | null> = {
    black: '#000000', white: '#ffffff', red: '#ff0000',
    green: '#008000', blue: '#0000ff', yellow: '#ffff00',
    orange: '#ffa500', purple: '#800080', pink: '#ffc0cb',
    gray: '#808080', grey: '#808080', cyan: '#00ffff',
    magenta: '#ff00ff', navy: '#000080', teal: '#008080',
    lime: '#00ff00', maroon: '#800000', aqua: '#00ffff',
    silver: '#c0c0c0', fuchsia: '#ff00ff', indigo: '#4b0082',
    violet: '#ee82ee', coral: '#ff7f50', tomato: '#ff6347',
    gold: '#ffd700', crimson: '#dc143c', dodgerblue: '#1e90ff',
    midnightblue: '#191970', orangered: '#ff4500', royalblue: '#4169e1',
    salmon: '#fa8072', steelblue: '#4682b4', turquoise: '#40e0d0',
    slateblue: '#6a5acd', darkblue: '#00008b', darkgreen: '#006400',
    darkred: '#8b0000', deeppink: '#ff1493', hotpink: '#ff69b4',
    limegreen: '#32cd32', skyblue: '#87ceeb', springgreen: '#00ff7f',
    // Non-colours → null
    transparent: null, inherit: null, initial: null,
    unset: null, revert: null, currentcolor: null, none: null,
};

/* ═══════════════════════════════════════════════════════════════════════
   Colour conversion helpers
   ═══════════════════════════════════════════════════════════════════════ */
function rgbToHex(r: number, g: number, b: number): string {
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    return '#' + [r, g, b].map(c => clamp(c).toString(16).padStart(2, '0')).join('');
}

function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    const S = Math.max(0, Math.min(100, s)) / 100;
    const L = Math.max(0, Math.min(100, l)) / 100;
    const a = S * Math.min(L, 1 - L);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = L - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * c);
    };
    return rgbToHex(f(0), f(8), f(4));
}

/** Parse a single RGB channel value (number 0-255 or percentage). */
function parseRgbChannel(v: string): number {
    v = v.trim();
    if (v.endsWith('%')) return Math.round(parseFloat(v) * 255 / 100);
    return Math.round(parseFloat(v));
}

/**
 * Parse *any* CSS colour token → 6-char lowercase hex, or null.
 *
 * Supported:
 *   - hex 3 / 4 / 6 / 8
 *   - rgb(r, g, b)  /  rgba(r, g, b, a)          (comma-separated)
 *   - rgb(r g b)    /  rgb(r g b / a)             (space-separated, modern)
 *   - rgb(r g b / var(--x))                       (Tailwind-style)
 *   - rgb(100%, 0%, 0%)                           (percentage channels)
 *   - hsl(h, s%, l%) /  hsla(h, s%, l%, a)        (comma-separated)
 *   - hsl(h s% l%)  /  hsl(h s% l% / a)          (space-separated, modern)
 *   - CSS named keywords (black, white, …)
 *
 * Returns null for: transparent, inherit, oklch(), color-mix(), etc.
 */
function parseColorToHex(raw: string): string | null {
    const color = raw.trim().toLowerCase();
    if (!color || color.length > 200) return null;

    // CSS keyword?
    if (color in CSS_KEYWORDS) return CSS_KEYWORDS[color];

    // oklch / lab / lch / color() / color-mix → not supported
    if (/^(oklch|lab|lch|color-mix|color)\s*\(/.test(color)) return null;

    // ── hex ──────────────────────────────────────────────────
    const hex6 = color.match(/^#([0-9a-f]{6})$/);
    if (hex6) return '#' + hex6[1];

    const hex3 = color.match(/^#([0-9a-f]{3})$/);
    if (hex3) {
        const c = hex3[1];
        return '#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }

    const hex8 = color.match(/^#([0-9a-f]{6})[0-9a-f]{2}$/);
    if (hex8) return '#' + hex8[1];

    const hex4 = color.match(/^#([0-9a-f]{3})[0-9a-f]$/);
    if (hex4) {
        const c = hex4[1];
        return '#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    }

    // ── rgb / rgba ───────────────────────────────────────────
    if (color.startsWith('rgb')) {
        const open = color.indexOf('(');
        const close = color.lastIndexOf(')');
        if (open < 0 || close <= open) return null;
        const inner = color.slice(open + 1, close).trim();
        // Strip alpha: everything after '/'
        const body = inner.split('/')[0].trim();

        // Comma-separated: rgb(255, 128, 0) or rgba(255, 128, 0, 0.5)
        const cm = body.match(/^([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)/);
        if (cm) return rgbToHex(parseRgbChannel(cm[1]), parseRgbChannel(cm[2]), parseRgbChannel(cm[3]));

        // Space-separated: rgb(255 128 0)
        const sm = body.match(/^([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+%?)/);
        if (sm) return rgbToHex(parseRgbChannel(sm[1]), parseRgbChannel(sm[2]), parseRgbChannel(sm[3]));

        return null;
    }

    // ── hsl / hsla ───────────────────────────────────────────
    if (color.startsWith('hsl')) {
        const open = color.indexOf('(');
        const close = color.lastIndexOf(')');
        if (open < 0 || close <= open) return null;
        const inner = color.slice(open + 1, close).trim();
        const body = inner.split('/')[0].trim();

        // Comma: hsl(210, 50%, 50%)
        const cm = body.match(/^([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
        if (cm) return hslToHex(+cm[1], +cm[2], +cm[3]);

        // Space: hsl(210 50% 50%)
        const sm = body.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
        if (sm) return hslToHex(+sm[1], +sm[2], +sm[3]);

        return null;
    }

    return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   hexToHsl
   ═══════════════════════════════════════════════════════════════════════ */
function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, Math.round(l * 100)];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

/* ═══════════════════════════════════════════════════════════════════════
   WCAG contrast helpers
   ═══════════════════════════════════════════════════════════════════════ */
function wcagLuminance(hex: string): number {
    const chan = (i: number) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(1) + 0.7152 * chan(3) + 0.0722 * chan(5);
}

function wcagContrast(a: string, b: string): number {
    const la = wcagLuminance(a), lb = wcagLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick black or white text that has better WCAG contrast against bg. */
function bestTextOnBg(bgHex: string): string {
    return wcagContrast(bgHex, '#ffffff') > wcagContrast(bgHex, '#000000')
        ? '#ffffff' : '#1a1a2e';
}

/* ═══════════════════════════════════════════════════════════════════════
   SSRF helpers
   ═══════════════════════════════════════════════════════════════════════ */
function isPrivateHost(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
    if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
    const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [, a, b] = ipv4.map(Number);
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 169 && b === 254) return true;
    }
    if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
    return false;
}

/* ═══════════════════════════════════════════════════════════════════════
   Colour filtering & categorisation
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Only skip truly non-colours (transparent parsed as null already).
 * We intentionally keep neutrals (#000, #fff, greys) — they are
 * down-weighted in scoring instead of being discarded outright.
 */
function shouldSkipColor(hex: string): boolean {
    // Only skip if it's somehow an empty or invalid parse result
    return !hex || hex.length !== 7;
}

function colorDistance(hex1: string, hex2: string): number {
    const [h1, s1, l1] = hexToHsl(hex1);
    const [h2, s2, l2] = hexToHsl(hex2);
    const dh = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) / 360;
    const ds = Math.abs(s1 - s2) / 100;
    const dl = Math.abs(l1 - l2) / 100;
    return Math.sqrt(dh * dh + ds * ds + dl * dl);
}

type ColorCategory = DetectedColor['category'];

function categorizeByHsl(hex: string): ColorCategory {
    const [h, s, l] = hexToHsl(hex);
    // Very dark or very light with near-zero saturation → neutral or background/text
    if (s < 8) {
        if (l < 15) return 'background';
        if (l > 90) return 'text';
        return 'neutral';
    }
    // Status colours by hue (need decent saturation + mid-lightness)
    if (s > 25 && l > 15 && l < 85) {
        if ((h >= 0 && h < 15) || h >= 345) return 'danger';
        if (h >= 90 && h < 160) return 'success';
        if (h >= 30 && h < 55) return 'warning';
    }
    // Saturated mid-lightness → accent
    if (s > 15 && l > 10 && l < 90) return 'accent';
    // Fall-through
    if (l < 20) return 'background';
    if (l > 80) return 'text';
    return 'neutral';
}

function isLikelyAccent(hex: string): boolean {
    const [, s, l] = hexToHsl(hex);
    return s > 25 && l > 15 && l < 80;
}

/**
 * Infer category from a CSS custom-property name, optionally validated
 * against the resolved colour's HSL.
 */
function categorizeByVarName(name: string, hex?: string): ColorCategory | null {
    const n = name.toLowerCase();
    const hsl = hex ? hexToHsl(hex) : null;
    const [, s = 0, l = 50] = hsl ?? [];

    if (/(danger|error|destructive|red)/.test(n)) {
        if (!hsl || ((s > 10 || l < 20) && l < 90)) return 'danger';
    }
    if (/(success|green)/.test(n)) {
        if (!hsl || ((s > 10 || l < 20) && l < 90)) return 'success';
    }
    if (/(warning|warn|yellow|amber)/.test(n)) {
        if (!hsl || ((s > 10 || l < 20) && l < 90)) return 'warning';
    }
    if (/(primary|brand|accent|link|cta|interactive|focus|highlight)/.test(n)) {
        if (!hsl || l < 90) return 'accent';
    }
    if (/(bg|background|surface|canvas|base|body)/.test(n)) {
        return 'background';
    }
    if (/(text|foreground|fg|heading|title|label|content|font|copy)/.test(n)) {
        return 'text';
    }
    if (/(border|divider|separator|outline|ring|muted|subtle|neutral|secondary|gray|grey)/.test(n)) {
        return 'neutral';
    }
    if (/(sidebar|nav|menu|header|footer|card|panel|modal|overlay|input|btn|button)/.test(n)) {
        if (hsl) {
            if (s > 15 && l > 15 && l < 80) return 'accent';
            if (l < 25) return 'background';
            if (l > 85) return 'text';
        }
        return 'neutral';
    }
    return null;
}

/* ═══════════════════════════════════════════════════════════════════════
   Source-weight constants
   ═══════════════════════════════════════════════════════════════════════ */
const SOURCE_WEIGHT: Record<string, number> = {
    'manifest-theme': 150,
    'theme-color': 120,
    'logo-svg': 100,
    'mask-icon': 100,
    'tile-color': 80,
};

/** Extra boost if a CSS var name suggests brand identity. */
const BRAND_VAR_PATTERN = /(primary|brand|accent|main|link|cta|interactive|focus)/i;
const BRAND_VAR_BOOST = 60;
const CSS_VAR_BASE_BOOST = 20;

/** Resolve a CSS var() expression from an SVG to a concrete hex colour.
 *  Handles nested vars and infers from variable names as last resort.
 *  e.g. var(--notion-logo-fill, var(--color-black)) → #000000  */
const LOGO_NAMED_MAP: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
    blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
    pink: '#ffc0cb', gray: '#808080', grey: '#808080', navy: '#000080',
    teal: '#008080', maroon: '#800000', cyan: '#00ffff', magenta: '#ff00ff',
    silver: '#c0c0c0', lime: '#00ff00', olive: '#808000', brown: '#a52a2a',
};
function resolveLogoVarColor(expr: string): string | null {
    // 1. Direct hex
    const hexM = expr.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/);
    if (hexM) return hexM[0].toLowerCase();
    // 2. rgb()
    const rgbM = expr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbM) return '#' + [rgbM[1], rgbM[2], rgbM[3]].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
    // 3. Named colour as a standalone fallback value: var(--x, black)
    for (const [name, hex] of Object.entries(LOGO_NAMED_MAP)) {
        const re = new RegExp(`,\\s*${name}\\s*\\)`, 'i');
        if (re.test(expr)) return hex;
    }
    // 4. Infer from CSS variable names: --color-black → black
    const varNames = [...expr.matchAll(/--([a-z0-9-]+)/gi)].map(m => m[1].toLowerCase());
    for (const vn of varNames) {
        for (const [name, hex] of Object.entries(LOGO_NAMED_MAP)) {
            if (vn === name || vn.endsWith(`-${name}`)) return hex;
        }
    }
    return null;
}

/** Pre-resolve all CSS var() expressions in an SVG to concrete hex values.
 *  This is essential because var() cannot resolve inside <img src="data:svg">
 *  where the page's CSS custom properties aren't available. */
function resolveSvgVars(svg: string): string {
    // Replace fill/stroke/color attributes that use var()
    return svg.replace(
        /((?:fill|stroke|color|stop-color)\s*=\s*["'])(var\([^"']+\))(["'])/gi,
        (_match, prefix: string, varExpr: string, suffix: string) => {
            const resolved = resolveLogoVarColor(varExpr);
            return resolved ? `${prefix}${resolved}${suffix}` : `${prefix}${varExpr}${suffix}`;
        }
    );
}

/* ═══════════════════════════════════════════════════════════════════════
   Regex helpers for extracting colour functions (handles 1 nesting level
   for patterns like  rgb(59 130 246 / var(--tw-bg-opacity)) )
   ═══════════════════════════════════════════════════════════════════════ */
const COLOR_FN_RE = /(?:rgba?|hsla?)\((?:[^)(]*|\([^)]*\))*\)/gi;
const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;

/* ═══════════════════════════════════════════════════════════════════════
   POST  /api/detect-brand
   ═══════════════════════════════════════════════════════════════════════ */
export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();
        if (!url || typeof url !== 'string') {
            return NextResponse.json({ error: 'URL er påkrevd' }, { status: 400 });
        }

        let targetUrl: string;
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return NextResponse.json({ error: 'Kun HTTP(S)-URLer er tillatt' }, { status: 400 });
            }
            if (isPrivateHost(parsed.hostname)) {
                return NextResponse.json({ error: 'Private / interne URLer er ikke tillatt' }, { status: 400 });
            }
            targetUrl = parsed.href;
        } catch {
            return NextResponse.json({ error: 'Ugyldig URL-format' }, { status: 400 });
        }

        /* ── Fetch HTML ─────────────────────────────────────── */
        let html: string;
        let finalUrl: string;
        try {
            const res = await fetch(targetUrl, {
                redirect: 'follow',
                signal: AbortSignal.timeout(10000),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; BrandDetector/2.0)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            finalUrl = res.url;
            // Re-check after redirects (SSRF)
            try {
                const finalParsed = new URL(finalUrl);
                if (isPrivateHost(finalParsed.hostname)) {
                    return NextResponse.json({ error: 'Omdirigering til privat nettverk blokkert' }, { status: 400 });
                }
            } catch { /* keep going */ }

            if (!res.ok) {
                return NextResponse.json({ error: `Fikk HTTP ${res.status} fra nettstedet` }, { status: 422 });
            }
            html = await res.text();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('abort') || msg.includes('timeout')) {
                return NextResponse.json({ error: 'Nettstedet svarte ikke innen tidsfristen' }, { status: 504 });
            }
            if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
                return NextResponse.json({ error: 'Kunne ikke finne nettstedet – sjekk URLen' }, { status: 422 });
            }
            if (msg.includes('ECONNREFUSED')) {
                return NextResponse.json({ error: 'Tilkoblingen ble nektet av serveren' }, { status: 422 });
            }
            if (msg.includes('ERR_BLOCKED_BY_RESPONSE') || msg.includes('403')) {
                return NextResponse.json({
                    error: 'Nettstedet blokkerer automatisk henting. ' +
                        'Du kan prøve å laste opp logo og velge farger manuelt.',
                }, { status: 422 });
            }
            return NextResponse.json({ error: 'Kunne ikke hente nettstedet' }, { status: 500 });
        }

        /* ── Accumulator ────────────────────────────────────── */
        const colorMap = new Map<string, { count: number; sources: Set<string>; category?: ColorCategory }>();

        function addColor(hex: string, source: string, forceCategory?: ColorCategory) {
            if (shouldSkipColor(hex)) return;
            const key = hex.toLowerCase();
            const existing = colorMap.get(key);
            if (existing) {
                existing.count++;
                existing.sources.add(source);
                if (forceCategory && !existing.category) existing.category = forceCategory;
            } else {
                colorMap.set(key, { count: 1, sources: new Set([source]), category: forceCategory });
            }
        }

        /* ── Source 1: <meta name="theme-color"> ────────────── */
        let themeColorHex: string | null = null;
        const themeColorMatch = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)
            ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']theme-color["']/i);
        if (themeColorMatch) {
            const hex = parseColorToHex(themeColorMatch[1]);
            if (hex) {
                themeColorHex = hex;
                addColor(hex, 'theme-color', isLikelyAccent(hex) ? 'accent' : undefined);
            }
        }

        /* ── Source 2: MS tile colour ───────────────────────── */
        const tileMatch = html.match(/<meta[^>]*name=["']msapplication-TileColor["'][^>]*content=["']([^"']+)["']/i)
            ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']msapplication-TileColor["']/i);
        if (tileMatch) {
            const hex = parseColorToHex(tileMatch[1]);
            if (hex) addColor(hex, 'tile-color', isLikelyAccent(hex) ? 'accent' : undefined);
        }

        /* ── Source 3: Web App Manifest  (NEW) ──────────────── */
        const manifestLink = html.match(/<link[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/i)
            ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']manifest["']/i);
        if (manifestLink) {
            try {
                const manifestUrl = new URL(manifestLink[1], finalUrl).href;
                if (!isPrivateHost(new URL(manifestUrl).hostname)) {
                    const mRes = await fetch(manifestUrl, {
                        signal: AbortSignal.timeout(4000),
                        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandDetector/2.0)' },
                    });
                    if (mRes.ok) {
                        const mText = await mRes.text();
                        try {
                            const manifest = JSON.parse(mText.slice(0, 60000));
                            if (manifest.theme_color) {
                                const hex = parseColorToHex(manifest.theme_color);
                                if (hex) addColor(hex, 'manifest-theme', isLikelyAccent(hex) ? 'accent' : undefined);
                            }
                            if (manifest.background_color) {
                                const hex = parseColorToHex(manifest.background_color);
                                if (hex) addColor(hex, 'manifest-bg');
                            }
                        } catch { /* invalid JSON */ }
                    }
                }
            } catch { /* manifest fetch failed – ok */ }
        }

        /* ── Source 4: <link rel="mask-icon" color="…">  (NEW)  */
        const maskIconMatch = html.match(/<link[^>]*rel=["']mask-icon["'][^>]*color=["']([^"']+)["']/i)
            ?? html.match(/<link[^>]*color=["']([^"']+)["'][^>]*rel=["']mask-icon["']/i);
        if (maskIconMatch) {
            const hex = parseColorToHex(maskIconMatch[1]);
            if (hex) addColor(hex, 'mask-icon', isLikelyAccent(hex) ? 'accent' : undefined);
        }

        /* ── Page title ─────────────────────────────────────── */
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const pageTitle = titleMatch ? titleMatch[1].trim() : undefined;

        /* ── Favicon ────────────────────────────────────────── */
        let faviconUrl: string | undefined;
        const iconLink = html.match(/<link[^>]*rel=["'](?:shortcut\s+)?icon["'][^>]*href=["']([^"']+)["']/i)
            ?? html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut\s+)?icon["']/i);
        if (iconLink) {
            try { faviconUrl = new URL(iconLink[1], finalUrl).href; } catch { /* ignore */ }
        }
        if (!faviconUrl) {
            try { faviconUrl = new URL('/favicon.ico', finalUrl).href; } catch { /* ignore */ }
        }

        /* ── Logo detection ─────────────────────────────────── */
        let logoUrl: string | undefined;
        let logoSvgContent: string | undefined;

        // Strategy A – <header> or <nav> link-to-home wrapping an <img>
        const headerNavBlocks = [
            ...(html.match(/<header[\s>][\s\S]*?<\/header>/gi) ?? []),
            ...(html.match(/<nav[\s>][\s\S]*?<\/nav>/gi) ?? []),
        ];
        const homeImgPat = /<a[^>]*href=["'](?:\/[^"']*?)["'][^>]*>\s*<img[^>]*src=["']([^"']+)["']/i;
        for (const block of headerNavBlocks) {
            const m = block.match(homeImgPat);
            if (m) {
                try { logoUrl = new URL(m[1], finalUrl).href; } catch { /* skip */ }
                break;
            }
        }

        // Strategy B – <header>/<nav> wrapping an inline SVG
        if (!logoUrl) {
            for (const block of headerNavBlocks) {
                const svgM = block.match(/<a[^>]*href=["']\/["'][^>]*>\s*(<svg[\s\S]*?<\/svg>)/i)
                    ?? block.match(/<a[^>]*>\s*(<svg[\s\S]*?<\/svg>)/i);
                if (svgM) {
                    logoSvgContent = resolveSvgVars(svgM[1]);
                    logoUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvgContent).toString('base64')}`;
                    break;
                }
            }
        }

        // Strategy C – <img> whose class / alt / src hints at "logo"
        if (!logoUrl) {
            const logoImgs = html.match(/<img[^>]*(?:class|alt|src|id)=["'][^"']*logo[^"']*["'][^>]*>/gi);
            if (logoImgs) {
                for (const imgTag of logoImgs) {
                    const srcM = imgTag.match(/src=["']([^"']+)["']/i);
                    if (srcM) {
                        try { logoUrl = new URL(srcM[1], finalUrl).href; } catch { /* skip */ }
                        break;
                    }
                }
            }
        }

        // Strategy D – Open Graph image  (only as very last resort)
        // Removed — og:image is usually promotional, not a logo

        // If logo is an external .svg URL, fetch SVG content for color editing
        if (logoUrl && !logoSvgContent && /\.svg(\?|$)/i.test(logoUrl) && !logoUrl.startsWith('data:')) {
            try {
                const svgRes = await fetch(logoUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandDetector/1.0)' },
                    signal: AbortSignal.timeout(5000),
                    redirect: 'follow',
                });
                if (svgRes.ok) {
                    const ct = svgRes.headers.get('content-type') || '';
                    if (ct.includes('svg') || ct.includes('xml')) {
                        logoSvgContent = resolveSvgVars(await svgRes.text());
                        // Convert to data URI so LogoUploader can decode it
                        logoUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvgContent).toString('base64')}`;
                    }
                }
            } catch { /* Non-critical – keep the external URL */ }
        }

        /* ── Google Fonts ───────────────────────────────────── */
        const googleFonts: string[] = [];
        const gfLinks = html.matchAll(/<link[^>]*href=["'](https:\/\/fonts\.googleapis\.com\/css2?\?[^"']+)["']/gi);
        for (const m of gfLinks) {
            const familyMatches = m[1].matchAll(/family=([^&:]+)/g);
            for (const fm of familyMatches) {
                const name = decodeURIComponent(fm[1]).replace(/\+/g, ' ');
                if (!googleFonts.includes(name)) googleFonts.push(name);
            }
        }

        /* ── CSS extraction (inline <style> blocks) ─────────── */
        const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
            .map(m => m[1]).join('\n');

        // 8a. CSS custom-properties → colour
        const cssVarPat = /--([\w-]+)\s*:\s*([^;}\n]+)/g;
        for (const m of styleBlocks.matchAll(cssVarPat)) {
            const varName = m[1];
            const rawVal = m[2].trim();
            const hex = parseColorToHex(rawVal);
            if (hex && !shouldSkipColor(hex)) {
                const cat = categorizeByVarName(varName, hex);
                const source = `css-var:--${varName}`;
                addColor(hex, source, cat ?? undefined);
            }
        }

        // 8b. Raw hex in <style>
        for (const m of styleBlocks.matchAll(HEX_RE)) {
            const hex = parseColorToHex(m[0]);
            if (hex) addColor(hex, 'style');
        }

        // 8c. rgb/hsl in <style>  (modern regex handles nested parens)
        for (const m of styleBlocks.matchAll(COLOR_FN_RE)) {
            const hex = parseColorToHex(m[0]);
            if (hex) addColor(hex, 'style');
        }

        // 8d. Google Fonts from @import inside <style>
        const importPat = /@import\s+url\(["']?(https:\/\/fonts\.googleapis\.com\/css2?\?[^"')]+)["']?\)/gi;
        for (const m of styleBlocks.matchAll(importPat)) {
            const families = m[1].matchAll(/family=([^&:]+)/g);
            for (const fm of families) {
                const name = decodeURIComponent(fm[1]).replace(/\+/g, ' ');
                if (!googleFonts.includes(name)) googleFonts.push(name);
            }
        }

        /* ── Font-family detection from CSS ─────────────────── */
        const detectedFonts: string[] = [];
        const fontPat = /font-family\s*:\s*([^;}\n]+)/gi;
        for (const m of styleBlocks.matchAll(fontPat)) {
            const families = m[1].split(',');
            for (const f of families) {
                const clean = f.trim().replace(/["']/g, '').replace(/!important/gi, '').trim();
                if (clean && !/(inherit|initial|sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-|emoji|-apple-system|BlinkMacSystemFont|Segoe)/i.test(clean)) {
                    if (!detectedFonts.includes(clean) && !googleFonts.includes(clean)) {
                        detectedFonts.push(clean);
                    }
                }
            }
        }

        /* ── External CSS ───────────────────────────────────── */
        let externalCssText = '';
        const cssLinks = html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi);
        const cssUrls: string[] = [];
        for (const m of cssLinks) {
            try {
                const cssUrl = new URL(m[1], finalUrl).href;
                if (!isPrivateHost(new URL(cssUrl).hostname)) cssUrls.push(cssUrl);
            } catch { /* skip */ }
        }
        // Also find <link href="..." rel="stylesheet"> (reversed order)
        const cssLinksAlt = html.matchAll(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi);
        for (const m of cssLinksAlt) {
            try {
                const cssUrl = new URL(m[1], finalUrl).href;
                if (!isPrivateHost(new URL(cssUrl).hostname) && !cssUrls.includes(cssUrl)) cssUrls.push(cssUrl);
            } catch { /* skip */ }
        }

        for (const cssUrl of cssUrls.slice(0, 5)) {
            try {
                const cssRes = await fetch(cssUrl, {
                    signal: AbortSignal.timeout(4000),
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrandDetector/2.0)' },
                });
                if (cssRes.ok) {
                    const css = (await cssRes.text()).slice(0, 200000);
                    externalCssText += css + '\n';

                    // CSS vars
                    for (const vm of css.matchAll(cssVarPat)) {
                        const varName = vm[1];
                        const rawVal = vm[2].trim();
                        const hex = parseColorToHex(rawVal);
                        if (hex && !shouldSkipColor(hex)) {
                            const cat = categorizeByVarName(varName, hex);
                            addColor(hex, `css-var:--${varName}`, cat ?? undefined);
                        }
                    }

                    // Hex in external CSS
                    for (const hm of css.matchAll(HEX_RE)) {
                        const hex = parseColorToHex(hm[0]);
                        if (hex) addColor(hex, 'stylesheet');
                    }

                    // rgb/hsl in external CSS  (NEW — was missing before)
                    for (const cm of css.matchAll(COLOR_FN_RE)) {
                        const hex = parseColorToHex(cm[0]);
                        if (hex) addColor(hex, 'stylesheet');
                    }

                    // Google Fonts @import in external CSS
                    for (const im of css.matchAll(importPat)) {
                        const families = im[1].matchAll(/family=([^&:]+)/g);
                        for (const fm of families) {
                            const name = decodeURIComponent(fm[1]).replace(/\+/g, ' ');
                            if (!googleFonts.includes(name)) googleFonts.push(name);
                        }
                    }

                    // font-family in external CSS
                    for (const fm of css.matchAll(fontPat)) {
                        const families = fm[1].split(',');
                        for (const f of families) {
                            const clean = f.trim().replace(/["']/g, '').replace(/!important/gi, '').trim();
                            if (clean && !/(inherit|initial|sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-|emoji|-apple-system|BlinkMacSystemFont|Segoe)/i.test(clean)) {
                                if (!detectedFonts.includes(clean) && !googleFonts.includes(clean)) {
                                    detectedFonts.push(clean);
                                }
                            }
                        }
                    }
                }
            } catch { /* external CSS fetch failed – ok */ }
        }

        /* ── Inline styles on elements ──────────────────────── */
        const inlineStyles = html.matchAll(/style=["']([^"']+)["']/gi);
        for (const m of inlineStyles) {
            for (const hm of m[1].matchAll(HEX_RE)) {
                const hex = parseColorToHex(hm[0]);
                if (hex) addColor(hex, 'inline-style');
            }
            for (const cm of m[1].matchAll(COLOR_FN_RE)) {
                const hex = parseColorToHex(cm[0]);
                if (hex) addColor(hex, 'inline-style');
            }
        }

        /* ── Logo SVG colour extraction ─────────────────────── */
        // The logo is the brand's visual identity — its colours are
        // among the most authoritative brand signals we can get.
        if (logoSvgContent) {
            // Direct hex/rgb values
            const logoHexes = logoSvgContent.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g) || [];
            for (const h of logoHexes) {
                const hex = parseColorToHex(h);
                if (hex) addColor(hex, 'logo-svg');
            }
            const logoRgbs = logoSvgContent.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g) || [];
            for (const r of logoRgbs) {
                const hex = parseColorToHex(r);
                if (hex) addColor(hex, 'logo-svg');
            }

            // Named colours in fill/stroke attributes
            const NAMED_MAP: Record<string, string> = {
                black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
                blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
                pink: '#ffc0cb', gray: '#808080', grey: '#808080', navy: '#000080',
                teal: '#008080', maroon: '#800000', cyan: '#00ffff', magenta: '#ff00ff',
            };
            const namedAttrRe = /(?:fill|stroke)\s*=\s*["'](\w+)["']/gi;
            let nMatch;
            while ((nMatch = namedAttrRe.exec(logoSvgContent)) !== null) {
                const name = nMatch[1].toLowerCase();
                if (NAMED_MAP[name]) addColor(NAMED_MAP[name], 'logo-svg');
            }

            // CSS var() custom properties — resolve fallback values
            // e.g. fill="var(--notion-logo-fill, var(--color-black))"
            const varFillRe = /(?:fill|stroke|color)\s*=\s*["'](var\([^"']+\))["']/gi;
            let vMatch;
            while ((vMatch = varFillRe.exec(logoSvgContent)) !== null) {
                const varExpr = vMatch[1];
                const resolved = resolveLogoVarColor(varExpr);
                if (resolved) addColor(resolved, 'logo-svg');
            }
        }

        /* ══════════════════════════════════════════════════════
           Build colour array with source-weighted scoring
           ══════════════════════════════════════════════════════ */
        const allColors: DetectedColor[] = [];

        for (const [hex, data] of colorMap.entries()) {
            const sources = Array.from(data.sources);

            // Base: frequency, capped at 15 to prevent sheer repetition domination
            let importance = Math.min(data.count, 15);

            // Source-based boosts
            for (const src of sources) {
                const sw = SOURCE_WEIGHT[src];
                if (sw) importance += sw;
                // CSS var boosts
                if (src.startsWith('css-var:')) {
                    importance += CSS_VAR_BASE_BOOST;
                    if (BRAND_VAR_PATTERN.test(src)) importance += BRAND_VAR_BOOST;
                }
            }

            // Neutral dampening: reduce importance for ultra-common neutrals
            // so they don't crowd out accents, but DON'T discard them
            const [, s, l] = hexToHsl(hex);
            if (s < 5 && (l < 5 || l > 95)) {
                // Pure black / pure white: cap base frequency contribution
                importance = Math.min(importance, 10) + sources.reduce((acc, src) => {
                    const w = SOURCE_WEIGHT[src] ?? (src.startsWith('css-var:') ? CSS_VAR_BASE_BOOST : 0);
                    return acc + w;
                }, 0);
            }

            const category = data.category ?? categorizeByHsl(hex);
            allColors.push({ hex, sources, importance, category });
        }

        // Sort descending by importance
        allColors.sort((a, b) => b.importance - a.importance);

        /* ── Dedupe (merge visually similar, keep the more important) */
        const dedupedColors: DetectedColor[] = [];
        const DEDUP_THRESHOLD = 0.10;

        for (const c of allColors) {
            const isDupe = dedupedColors.some(d => colorDistance(c.hex, d.hex) < DEDUP_THRESHOLD);
            if (!isDupe) dedupedColors.push(c);
        }

        // Diversity guarantee: ensure at least 1 accent if any exist
        if (!dedupedColors.slice(0, 12).some(c => c.category === 'accent')) {
            const firstAccent = allColors.find(c => c.category === 'accent' && !dedupedColors.slice(0, 12).some(d => d.hex === c.hex));
            if (firstAccent) {
                dedupedColors.splice(Math.min(3, dedupedColors.length), 0, firstAccent);
            }
        }

        const topColors = dedupedColors.slice(0, 14);

        /* ══════════════════════════════════════════════════════
           Theme detection
           ══════════════════════════════════════════════════════ */
        const allCssText = styleBlocks + '\n' + externalCssText;

        // body / :root background
        let bodyBgHex: string | null = null;
        const bodyBgPat = /(?:body|:root|\[data-theme\])\s*\{[^}]*background(?:-color)?\s*:\s*([^;}\n]+)/gi;
        for (const m of allCssText.matchAll(bodyBgPat)) {
            const hex = parseColorToHex(m[1].trim().split(/\s+/)[0]);
            if (hex) bodyBgHex = hex;
        }

        // Default to light; only switch to dark if strong signals exist
        let siteTheme: 'light' | 'dark' = 'light';
        let darkSignals = 0;

        // Signal 1: theme-color is dark
        if (themeColorHex) {
            const [, , tl] = hexToHsl(themeColorHex);
            if (tl < 30) darkSignals += 3;
        }
        // Signal 2: body bg is dark
        if (bodyBgHex) {
            const [, , bl] = hexToHsl(bodyBgHex);
            if (bl < 30) darkSignals += 3;
            else if (bl > 70) darkSignals -= 2; // strong light signal
        }
        // Signal 3: CSS dark-mode keywords
        if (/(?:dark-theme|dark-mode|theme-dark|color-scheme:\s*dark|data-theme=["']dark)/i.test(allCssText)) {
            darkSignals += 2;
        }
        if (/(?:light-theme|light-mode|theme-light|color-scheme:\s*light|data-theme=["']light)/i.test(allCssText)) {
            darkSignals -= 2;
        }
        // Signal 4: dark class on html/body
        if (/<(?:html|body)[^>]*class=["'][^"']*dark[^"']*["']/i.test(html)) darkSignals += 2;
        if (/<(?:html|body)[^>]*class=["'][^"']*light[^"']*["']/i.test(html)) darkSignals -= 2;
        // Signal 5: color-scheme meta
        const csMatch = html.match(/<meta[^>]*name=["']color-scheme["'][^>]*content=["']([^"']+)["']/i);
        if (csMatch) {
            if (csMatch[1].toLowerCase().includes('dark')) darkSignals += 2;
            if (csMatch[1].toLowerCase().includes('light')) darkSignals -= 2;
        }
        // Signal 6: prefers-color-scheme CSS default
        if (/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/.test(allCssText)) darkSignals += 1;
        // Signal 7: background of top colours
        const topBgs = topColors.filter(c => c.category === 'background');
        if (topBgs.length > 0) {
            const avgL = topBgs.reduce((acc, c) => acc + hexToHsl(c.hex)[2], 0) / topBgs.length;
            if (avgL < 25) darkSignals += 2;
            else if (avgL > 75) darkSignals -= 2;
        }
        // Signal 8: neutrals distribution — if most neutrals are light, strong light signal
        const allNeutrals = allColors.filter(c => {
            const [, s] = hexToHsl(c.hex);
            return s < 12;
        });
        if (allNeutrals.length >= 4) {
            const lightN = allNeutrals.filter(c => hexToHsl(c.hex)[2] > 75).length;
            const darkN  = allNeutrals.filter(c => hexToHsl(c.hex)[2] < 25).length;
            if (lightN > darkN * 1.5) darkSignals -= 2;
            else if (darkN > lightN * 1.5) darkSignals += 2;
        }

        if (darkSignals >= 4) siteTheme = 'dark';

        /* ══════════════════════════════════════════════════════
           Smart suggestions  (THEME-AWARE)
           ══════════════════════════════════════════════════════
           Key names MUST match BrandingForm state keys:
             colorBgPrimary, colorBgSecondary,
             colorTextPrimary, colorTextSecondary,
             colorBorder, colorAccent,
             colorButtonPrimary, colorButtonText,
             colorSidebarBg, colorSidebarText, colorSidebarActive,
             colorSuccess, colorWarning, colorDanger
           ══════════════════════════════════════════════════════ */
        const suggestions: Record<string, string> = {};

        /* ── Collect neutrals (s < 12) sorted by lightness ─── */
        const neutralPool = allColors
            .filter(c => { const [, s] = hexToHsl(c.hex); return s < 12; })
            .sort((a, b) => hexToHsl(a.hex)[2] - hexToHsl(b.hex)[2]);
        const lightNeutrals = neutralPool.filter(c => hexToHsl(c.hex)[2] > 85);
        const darkNeutrals  = neutralPool.filter(c => hexToHsl(c.hex)[2] < 20);
        const midNeutrals   = neutralPool.filter(c => { const l = hexToHsl(c.hex)[2]; return l >= 20 && l <= 85; });

        /* ── Accent / brand colour ──────────────────────────── */
        const brandPool = topColors.filter(c => {
            const hasStrongSource = c.sources.some(s =>
                s === 'theme-color' || s === 'manifest-theme' || s === 'manifest-bg' ||
                s === 'mask-icon' || s === 'tile-color' ||
                BRAND_VAR_PATTERN.test(s)
            );
            return hasStrongSource || (c.category === 'accent' && c.importance >= 10);
        });

        // Prefer saturated mid-lightness from the brand pool
        const saturatedCandidates = [...brandPool, ...topColors.filter(c => c.category === 'accent')]
            .filter(c => {
                const [, s, l] = hexToHsl(c.hex);
                return s > 20 && l > 15 && l < 85;
            })
            .sort((a, b) => {
                const [, sa, la] = hexToHsl(a.hex);
                const [, sb, lb] = hexToHsl(b.hex);
                const scoreA = sa + (100 - Math.abs(la - 45)) + a.importance * 3;
                const scoreB = sb + (100 - Math.abs(lb - 45)) + b.importance * 3;
                return scoreB - scoreA;
            });

        const seenHex = new Set<string>();
        const uniqueSaturated = saturatedCandidates.filter(c => {
            if (seenHex.has(c.hex)) return false;
            seenHex.add(c.hex);
            return true;
        });

        if (uniqueSaturated.length > 0) {
            suggestions.colorAccent = uniqueSaturated[0].hex;
        } else {
            // Monochrome brand: use "brand ink" directly.
            // For light sites, dark ink (#000 or near-black) IS the accent.
            // For dark sites, light ink (#fff or near-white) IS the accent.
            // Search broadly across all detected colours for strong ink,
            // not just the brand pool (which may only contain mid-greys).

            if (siteTheme === 'light') {
                // Prefer the darkest strong neutral as brand ink
                const darkInk = allColors
                    .filter(c => { const [, s, l] = hexToHsl(c.hex); return s < 12 && l < 15; })
                    .sort((a, b) => b.importance - a.importance)[0];
                if (darkInk) {
                    suggestions.colorAccent = darkInk.hex;
                }
            } else {
                // Dark site: prefer lightest neutral as brand ink
                const lightInk = allColors
                    .filter(c => { const [, s, l] = hexToHsl(c.hex); return s < 12 && l > 85; })
                    .sort((a, b) => b.importance - a.importance)[0];
                if (lightInk) {
                    suggestions.colorAccent = lightInk.hex;
                }
            }

            // Fallback: strongest brand pool colour
            if (!suggestions.colorAccent) {
                const bp = [...brandPool].sort((a, b) => b.importance - a.importance)[0];
                if (bp) suggestions.colorAccent = bp.hex;
            }
            if (!suggestions.colorAccent) {
                const anyAccent = allColors.find(c => c.category === 'accent');
                if (anyAccent) suggestions.colorAccent = anyAccent.hex;
            }
        }

        // Button + sidebar derive from accent
        if (suggestions.colorAccent) {
            suggestions.colorButtonPrimary = suggestions.colorAccent;
            suggestions.colorSidebarActive = suggestions.colorAccent;
            suggestions.colorButtonText = bestTextOnBg(suggestions.colorAccent);
        }

        /* ── Status colours — ONLY from explicit CSS-variable NAME evidence ──
           Status hues (red/green/amber) are very often BRAND colours: a coral
           or gold brand accent has the hue of "danger"/"warning" and was being
           hijacked into the status slots, producing off-brand palettes
           (e.g. wakandi's coral becoming the error colour). We now only adopt
           a detected colour as success/warning/danger when a CSS custom-property
           name explicitly says so (e.g. --danger, --error, --success); otherwise
           the safe brand-independent defaults below are kept. */
        const STATUS_NAME_RE: Record<string, RegExp> = {
            success: /(success|positive|valid|green)/i,
            warning: /(warning|warn|amber|caution|yellow)/i,
            danger: /(danger|error|destructive|critical|alert|red)/i,
        };
        function hasStatusNameEvidence(c: DetectedColor, kind: string): boolean {
            const re = STATUS_NAME_RE[kind];
            return c.sources.some((s) => s.startsWith('css-var:') && re.test(s));
        }
        const statusMap: Record<string, string> = { success: '', warning: '', danger: '' };
        for (const c of topColors) {
            for (const kind of ['success', 'warning', 'danger'] as const) {
                if (c.category === kind && !statusMap[kind] && hasStatusNameEvidence(c, kind)) {
                    const [, s, l] = hexToHsl(c.hex);
                    if (s > 20 && l > 15 && l < 80) statusMap[kind] = c.hex;
                }
            }
        }
        if (statusMap.success) suggestions.colorSuccess = statusMap.success;
        if (statusMap.warning) suggestions.colorWarning = statusMap.warning;
        if (statusMap.danger) suggestions.colorDanger = statusMap.danger;

        /* ── Theme-aware background / text / sidebar / border ─ */
        if (siteTheme === 'light') {
            // --- LIGHT SITE: light bg, dark text ---
            // BgPrimary: lightest neutral (l > 92), or derive from body bg
            const lightBg = lightNeutrals.filter(c => hexToHsl(c.hex)[2] > 92);
            if (lightBg.length > 0) {
                suggestions.colorBgPrimary = lightBg[lightBg.length - 1].hex; // lightest
            } else if (bodyBgHex && hexToHsl(bodyBgHex)[2] > 85) {
                suggestions.colorBgPrimary = bodyBgHex;
            }
            // BgSecondary: slightly darker light neutral (l 85-94)
            const secBg = lightNeutrals.filter(c => {
                const l = hexToHsl(c.hex)[2];
                return l >= 85 && l <= 96;
            });
            if (secBg.length > 0) {
                suggestions.colorBgSecondary = secBg[0].hex; // darkest of the light range
            }

            // TextPrimary: darkest neutral (l < 15)
            const darkText = darkNeutrals.filter(c => hexToHsl(c.hex)[2] < 15);
            if (darkText.length > 0) {
                suggestions.colorTextPrimary = darkText[0].hex; // darkest
            }
            // TextSecondary: mid neutral (l 35-60)
            const secText = midNeutrals.filter(c => {
                const l = hexToHsl(c.hex)[2];
                return l >= 30 && l <= 60;
            });
            if (secText.length > 0) {
                suggestions.colorTextSecondary = secText[Math.floor(secText.length / 2)].hex;
            }

            // Sidebar: dark for contrast
            if (darkNeutrals.length > 0) {
                suggestions.colorSidebarBg = darkNeutrals[0].hex;
                const [h, s, l] = hexToHsl(darkNeutrals[0].hex);
                suggestions.colorSidebarText = hslToHex(h, Math.min(s, 8), Math.max(l + 60, 75));
            }

            // Border: light-ish neutral
            const borderCand = neutralPool.filter(c => {
                const l = hexToHsl(c.hex)[2];
                return l >= 75 && l <= 92;
            });
            if (borderCand.length > 0) {
                suggestions.colorBorder = borderCand[0].hex;
            }

        } else {
            // --- DARK SITE: dark bg, light text ---
            // BgPrimary: darkest neutral (l < 12)
            const darkBg = darkNeutrals.filter(c => hexToHsl(c.hex)[2] < 12);
            if (darkBg.length > 0) {
                suggestions.colorBgPrimary = darkBg[0].hex; // darkest
            }
            // BgSecondary: slightly lighter dark neutral (l 10-20)
            const secBg = darkNeutrals.filter(c => {
                const l = hexToHsl(c.hex)[2];
                return l >= 8 && l <= 20;
            });
            if (secBg.length > 0) {
                suggestions.colorBgSecondary = secBg[secBg.length - 1].hex; // lightest of dark range
            }

            // TextPrimary: lightest neutral (l > 90)
            if (lightNeutrals.length > 0) {
                suggestions.colorTextPrimary = lightNeutrals[lightNeutrals.length - 1].hex;
            }
            // TextSecondary: mid-light neutral (l 55-80)
            const secText = midNeutrals.filter(c => {
                const l = hexToHsl(c.hex)[2];
                return l >= 55 && l <= 80;
            });
            if (secText.length > 0) {
                suggestions.colorTextSecondary = secText[Math.floor(secText.length / 2)].hex;
            }

            // Sidebar: slightly different dark shade
            if (suggestions.colorBgPrimary) {
                const [h, s, l] = hexToHsl(suggestions.colorBgPrimary);
                suggestions.colorSidebarBg = hslToHex(h, s, Math.min(l + 5, 15));
                suggestions.colorSidebarText = hslToHex(h, Math.min(s, 8), 65);
            }

            // Border: dark-ish neutral
            const borderCand = neutralPool.filter(c => {
                const l = hexToHsl(c.hex)[2];
                return l >= 15 && l <= 30;
            });
            if (borderCand.length > 0) {
                suggestions.colorBorder = borderCand[0].hex;
            }
        }

        /* ══════════════════════════════════════════════════════
           Fallbacks — fill any gaps with sensible derived values
           ══════════════════════════════════════════════════════ */
        if (!suggestions.colorAccent) {
            const bestAccent = allColors.find(c => {
                const [, s, l] = hexToHsl(c.hex);
                return s > 15 && l > 15 && l < 80;
            });
            suggestions.colorAccent = bestAccent?.hex ?? '#3b82f6';
        }
        if (!suggestions.colorButtonPrimary) suggestions.colorButtonPrimary = suggestions.colorAccent;
        if (!suggestions.colorButtonText) suggestions.colorButtonText = bestTextOnBg(suggestions.colorButtonPrimary);
        if (!suggestions.colorSidebarActive) suggestions.colorSidebarActive = suggestions.colorAccent;

        if (siteTheme === 'light') {
            if (!suggestions.colorBgPrimary) suggestions.colorBgPrimary = '#fafafa';
            if (!suggestions.colorBgSecondary) {
                const [h, s] = hexToHsl(suggestions.colorBgPrimary);
                suggestions.colorBgSecondary = hslToHex(h, s, Math.max(hexToHsl(suggestions.colorBgPrimary)[2] - 5, 88));
            }
            if (!suggestions.colorTextPrimary) suggestions.colorTextPrimary = '#111111';
            if (!suggestions.colorTextSecondary) suggestions.colorTextSecondary = '#555555';
            if (!suggestions.colorSidebarBg) suggestions.colorSidebarBg = '#111111';
            if (!suggestions.colorSidebarText) suggestions.colorSidebarText = '#a1a1aa';
            if (!suggestions.colorBorder) suggestions.colorBorder = '#e0e0e0';
        } else {
            if (!suggestions.colorBgPrimary) suggestions.colorBgPrimary = '#050505';
            if (!suggestions.colorBgSecondary) {
                const [h, s, l] = hexToHsl(suggestions.colorBgPrimary);
                suggestions.colorBgSecondary = hslToHex(h, s, Math.min(l + 6, 18));
            }
            if (!suggestions.colorTextPrimary) suggestions.colorTextPrimary = '#f0f0f5';
            if (!suggestions.colorTextSecondary) suggestions.colorTextSecondary = '#9ca3af';
            if (!suggestions.colorSidebarBg) {
                const [h, s, l] = hexToHsl(suggestions.colorBgPrimary);
                suggestions.colorSidebarBg = hslToHex(h, s, Math.min(l + 5, 15));
            }
            if (!suggestions.colorSidebarText) suggestions.colorSidebarText = '#a1a1aa';
            if (!suggestions.colorBorder) {
                const [h, s] = hexToHsl(suggestions.colorBgPrimary);
                suggestions.colorBorder = hslToHex(h, Math.min(s, 8), 18);
            }
        }

        if (!suggestions.colorSuccess) suggestions.colorSuccess = '#22c55e';
        if (!suggestions.colorWarning) suggestions.colorWarning = '#f59e0b';
        if (!suggestions.colorDanger) suggestions.colorDanger = '#ef4444';

        /* ══════════════════════════════════════════════════════
           Response
           ══════════════════════════════════════════════════════ */
        const result: DetectionResult = {
            url: finalUrl,
            title: pageTitle,
            colors: topColors,
            suggestions,
            detectedRoles: {
                brand: suggestions.colorAccent || '#3b82f6',
                bgPrimary: suggestions.colorBgPrimary || '#050505',
                bgSecondary: suggestions.colorBgSecondary || '#0f0f11',
                textPrimary: suggestions.colorTextPrimary || '#ffffff',
                sidebarBg: suggestions.colorSidebarBg || '#0a0a0a',
            },
            faviconUrl,
            logoUrl,
            logoSvgContent,
            googleFonts: googleFonts.length > 0 ? googleFonts : undefined,
            detectedFonts: detectedFonts.length > 0 ? detectedFonts.slice(0, 10) : undefined,
            siteTheme,
        };

        return NextResponse.json(result);
    } catch {
        return NextResponse.json(
            { error: 'Intern feil under merkevaredeteksjon' },
            { status: 500 },
        );
    }
}
