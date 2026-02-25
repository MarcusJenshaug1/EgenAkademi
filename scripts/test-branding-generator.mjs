/**
 * Test script for the Manual Color Assistant + branding generator.
 * Verifies:
 *  - 3 test cases (light theme, dark theme, strict/AAA)
 *  - Contrast ratios meet preset requirements
 *  - ensureContrast adjusts colours correctly
 *
 * Run with: node --loader ts-node/esm scripts/test-branding-generator.mjs
 * (or simply: node scripts/test-branding-generator.mjs)
 */

// ── Inline implementations (so we can run without ts-node) ──

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean;
    return [
        parseInt(full.substring(0, 2), 16),
        parseInt(full.substring(2, 4), 16),
        parseInt(full.substring(4, 6), 16),
    ];
}

function relativeLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(hex1, hex2) {
    const l1 = relativeLuminance(...hexToRgb(hex1));
    const l2 = relativeLuminance(...hexToRgb(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
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

function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

function hslToRgb(h, s, l) {
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

function hexToHsl(hex) { return rgbToHsl(...hexToRgb(hex)); }

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(c =>
        Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')
    ).join('');
}

function hslToHex(h, s, l) { return rgbToHex(...hslToRgb(h, s, l)); }

function chooseBestTextOnBg(bg, candidates = ['#ffffff', '#000000']) {
    let best = candidates[0], bestR = 0;
    for (const c of candidates) {
        const r = contrastRatio(bg, c);
        if (r > bestR) { bestR = r; best = c; }
    }
    return best;
}

function ensureContrast(fg, bg, minRatio = 4.5, strategy = 'auto') {
    if (contrastRatio(fg, bg) >= minRatio) return fg;
    const [h, s, l] = hexToHsl(fg);
    const bgLum = relativeLuminance(...hexToRgb(bg));
    let dir = strategy;
    if (dir === 'auto') dir = bgLum > 0.5 ? 'darken' : 'lighten';
    let lo, hi;
    if (dir === 'lighten') { lo = l; hi = 1.0; } else { lo = 0.0; hi = l; }
    let bestL = dir === 'lighten' ? 1.0 : 0.0;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const test = hslToHex(h, s, mid);
        if (contrastRatio(test, bg) >= minRatio) {
            bestL = mid;
            if (dir === 'lighten') hi = mid; else lo = mid;
        } else {
            if (dir === 'lighten') lo = mid; else hi = mid;
        }
    }
    return hslToHex(h, s, bestL);
}

function muteColor(hex, bg, factor = 0.4) {
    const [h, s, l] = hexToHsl(hex);
    const [,, bgL] = hexToHsl(bg);
    const targetL = l + (bgL - l) * factor;
    return hslToHex(h, s * 0.85, targetL);
}

function deriveBorder(bg, strength = 0.12) {
    const [h, s, l] = hexToHsl(bg);
    const bgLum = relativeLuminance(...hexToRgb(bg));
    const newL = bgLum > 0.5 ? Math.max(0, l - strength) : Math.min(1, l + strength);
    return hslToHex(h, s * 0.7, newL);
}

// ── Generator (mirrors brandingGenerator.ts) ──

function derive(roles, presetKey = 'standard') {
    const PRESETS = {
        standard: { textOnBg: 4.5, uiOnBg: 4.5, largeText: 3.0 },
        streng:   { textOnBg: 7.0, uiOnBg: 7.0, largeText: 3.0 },
        avslappet:{ textOnBg: 3.0, uiOnBg: 4.5, largeText: 3.0 },
    };
    const STATUS = { success: '#22c55e', warning: '#f59e0b', danger: '#ef4444' };
    const p = PRESETS[presetKey];
    const { brand, bgPrimary, bgSecondary, textPrimary, sidebarBg } = roles;
    const s = {};

    s.colorBgPrimary = bgPrimary;
    s.colorBgSecondary = bgSecondary;
    s.colorTextPrimary = ensureContrast(textPrimary, bgPrimary, p.textOnBg);
    s.colorTextSecondary = ensureContrast(muteColor(s.colorTextPrimary, bgPrimary, 0.35), bgPrimary, p.largeText);
    s.colorBorder = deriveBorder(bgSecondary);
    s.colorAccent = ensureContrast(brand, bgPrimary, p.largeText);
    s.colorButtonPrimary = ensureContrast(brand, bgPrimary, p.largeText);
    s.colorButtonText = chooseBestTextOnBg(s.colorButtonPrimary);
    s.colorSidebarBg = sidebarBg;
    s.colorSidebarText = ensureContrast(
        chooseBestTextOnBg(sidebarBg, ['#ffffff','#e5e5e5','#a1a1aa','#71717a','#404040','#1a1a1a','#000000']),
        sidebarBg, p.largeText
    );
    s.colorSidebarActive = ensureContrast(brand, sidebarBg, p.uiOnBg);
    s.colorSuccess = ensureContrast(STATUS.success, bgPrimary, p.largeText);
    s.colorWarning = ensureContrast(STATUS.warning, bgPrimary, p.largeText);
    s.colorDanger = ensureContrast(STATUS.danger, bgPrimary, p.largeText);

    return s;
}

// ── Test cases ──

const TESTS = [
    {
        name: 'Dark theme (default EgenAkademi)',
        roles: {
            brand: '#3b82f6',
            bgPrimary: '#050505',
            bgSecondary: '#0f0f11',
            textPrimary: '#ffffff',
            sidebarBg: '#0a0a0a',
        },
        preset: 'standard',
        checks: {
            colorTextPrimary: { minContrast: 4.5, against: 'colorBgPrimary' },
            colorTextSecondary: { minContrast: 3.0, against: 'colorBgPrimary' },
            colorAccent: { minContrast: 3.0, against: 'colorBgPrimary' },
            colorButtonText: { minContrast: 3.0, against: 'colorButtonPrimary' },
            colorSidebarText: { minContrast: 3.0, against: 'colorSidebarBg' },
            colorSidebarActive: { minContrast: 4.5, against: 'colorSidebarBg' },
        },
    },
    {
        name: 'Light theme (corporate)',
        roles: {
            brand: '#1e40af',
            bgPrimary: '#ffffff',
            bgSecondary: '#f3f4f6',
            textPrimary: '#111827',
            sidebarBg: '#1f2937',
        },
        preset: 'standard',
        checks: {
            colorTextPrimary: { minContrast: 4.5, against: 'colorBgPrimary' },
            colorTextSecondary: { minContrast: 3.0, against: 'colorBgPrimary' },
            colorAccent: { minContrast: 3.0, against: 'colorBgPrimary' },
            colorButtonText: { minContrast: 3.0, against: 'colorButtonPrimary' },
            colorSidebarText: { minContrast: 3.0, against: 'colorSidebarBg' },
            colorSidebarActive: { minContrast: 4.5, against: 'colorSidebarBg' },
        },
    },
    {
        name: 'Strict / AAA — low-contrast brand on dark',
        roles: {
            brand: '#6366f1',
            bgPrimary: '#0a0a0a',
            bgSecondary: '#171717',
            textPrimary: '#e5e5e5',
            sidebarBg: '#0f0f0f',
        },
        preset: 'streng',
        checks: {
            colorTextPrimary: { minContrast: 7.0, against: 'colorBgPrimary' },
            colorTextSecondary: { minContrast: 3.0, against: 'colorBgPrimary' },
            colorAccent: { minContrast: 3.0, against: 'colorBgPrimary' },
            colorButtonText: { minContrast: 3.0, against: 'colorButtonPrimary' },
            colorSidebarText: { minContrast: 3.0, against: 'colorSidebarBg' },
            colorSidebarActive: { minContrast: 7.0, against: 'colorSidebarBg' },
        },
    },
];

// ── Run ──

let pass = 0, fail = 0, warn = 0;

for (const test of TESTS) {
    console.log(`\n═══ ${test.name} (${test.preset}) ═══`);
    const s = derive(test.roles, test.preset);

    // Print palette
    for (const [k, v] of Object.entries(s)) {
        console.log(`  ${k.padEnd(22)} ${v}`);
    }

    // Check contrasts
    console.log('');
    for (const [field, check] of Object.entries(test.checks)) {
        const fg = s[field];
        const bg = s[check.against];
        const ratio = contrastRatio(fg, bg);
        const ok = ratio >= check.minContrast;
        const tag = ok ? '[OK]  ' : '[FAIL]';
        const msg = `${tag} ${field} vs ${check.against}: ${ratio.toFixed(1)}:1 (need ${check.minContrast}:1)`;
        if (ok) { pass++; console.log(`  ✅ ${msg}`); }
        else    { fail++; console.log(`  ❌ ${msg}`); }
    }
}

console.log(`\n════════════════════════════════════════`);
console.log(`  PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warn}`);
console.log(`════════════════════════════════════════\n`);

process.exit(fail > 0 ? 1 : 0);
