#!/usr/bin/env node
/**
 * Brand-detection test harness
 * Usage:
 *   1. Start the dev server:  npm run dev
 *   2. In another terminal:   node scripts/test-brand-detection.mjs
 *
 * Tests all 14+ URLs and prints a summary table with:
 *   - accent, bg, text, buttonPrimary, buttonText
 *   - top 12 colours (hex + category)
 *   - whether accent fell back to default blue #3b82f6
 *   - logo, fonts, siteTheme
 */

const API = process.env.API_URL ?? 'http://localhost:3000/api/detect-brand';

const TEST_URLS = [
    'notion.com',
    'us2.app',
    'suno.com',
    'instagram.com',
    'stripe.com',
    'figma.com',
    'slack.com',
    'github.com',
    'openai.com',
    'shopify.com',
    'vercel.com',
    'nike.com',
    'airbnb.com',
    'netflix.com',
];

const DEFAULT_BLUE = '#3b82f6';

function pad(s, n) { return (s ?? '').toString().padEnd(n).slice(0, n); }
function colourBlock(hex) { return hex ? `${hex}` : '(none)'; }

async function testUrl(url) {
    const start = Date.now();
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const elapsed = Date.now() - start;
        const data = await res.json();

        if (!res.ok) {
            return {
                url,
                status: `ERR ${res.status}`,
                error: data.error ?? 'unknown',
                elapsed,
            };
        }

        const s = data.suggestions ?? {};
        return {
            url,
            status: 'OK',
            elapsed,
            theme: data.siteTheme,
            accent: s.colorAccent,
            bg: s.colorBackground,
            text: s.colorText,
            buttonPrimary: s.colorButtonPrimary,
            buttonText: s.colorButtonText,
            sidebar: s.colorSidebar,
            border: s.colorBorder,
            success: s.colorSuccess,
            warning: s.colorWarning,
            danger: s.colorDanger,
            isDefaultBlue: s.colorAccent === DEFAULT_BLUE,
            logo: data.logoUrl ? (data.logoUrl.startsWith('data:') ? 'SVG-inline' : 'URL') : 'none',
            fonts: (data.googleFonts ?? []).concat(data.detectedFonts ?? []).slice(0, 3).join(', ') || '(none)',
            topColors: (data.colors ?? []).slice(0, 12).map(c => `${c.hex}[${c.category[0]}]`),
            colorCount: (data.colors ?? []).length,
        };
    } catch (e) {
        return {
            url,
            status: 'FAIL',
            error: e.message,
            elapsed: Date.now() - start,
        };
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║         BRAND DETECTION TEST HARNESS  v2.0                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`API: ${API}\n`);

    const results = [];
    for (const url of TEST_URLS) {
        process.stdout.write(`Testing ${pad(url, 20)} ... `);
        const r = await testUrl(url);
        results.push(r);

        if (r.error) {
            console.log(`❌ ${r.status} — ${r.error} (${r.elapsed}ms)`);
        } else {
            const flag = r.isDefaultBlue ? ' ⚠️  DEFAULT-BLUE' : '';
            console.log(`✅ ${r.theme} | accent=${colourBlock(r.accent)} | ${r.elapsed}ms${flag}`);
        }
    }

    // Summary table
    console.log('\n' + '═'.repeat(110));
    console.log(pad('URL', 18) + pad('Theme', 7) + pad('Accent', 10) + pad('BtnPri', 10) +
        pad('BtnTxt', 10) + pad('Bg', 10) + pad('Text', 10) + pad('Logo', 12) + pad('Default?', 10) + 'Top colours');
    console.log('─'.repeat(110));

    let defaultBlueCount = 0;
    let errorCount = 0;

    for (const r of results) {
        if (r.error) {
            console.log(pad(r.url, 18) + `❌ ${r.error}`);
            errorCount++;
            continue;
        }
        if (r.isDefaultBlue) defaultBlueCount++;
        console.log(
            pad(r.url, 18) +
            pad(r.theme, 7) +
            pad(r.accent, 10) +
            pad(r.buttonPrimary, 10) +
            pad(r.buttonText, 10) +
            pad(r.bg, 10) +
            pad(r.text, 10) +
            pad(r.logo, 12) +
            pad(r.isDefaultBlue ? '⚠️ YES' : '✓ NO', 10) +
            (r.topColors ?? []).slice(0, 6).join(' ')
        );
    }

    console.log('─'.repeat(110));
    console.log(`\nTotal: ${results.length} | Errors: ${errorCount} | Default-blue fallbacks: ${defaultBlueCount}`);

    if (defaultBlueCount > 0) {
        console.log('\n⚠️  The following sites fell back to default blue (#3b82f6):');
        results.filter(r => r.isDefaultBlue).forEach(r => console.log(`   - ${r.url}`));
    }

    // Detailed per-site dump
    console.log('\n\n══ DETAILED RESULTS ══');
    for (const r of results) {
        if (r.error) continue;
        console.log(`\n── ${r.url} ──`);
        console.log(`  Theme:    ${r.theme}`);
        console.log(`  Accent:   ${r.accent}  ${r.isDefaultBlue ? '⚠️ DEFAULT' : ''}`);
        console.log(`  Button:   ${r.buttonPrimary} / text: ${r.buttonText}`);
        console.log(`  Bg:       ${r.bg}`);
        console.log(`  Sidebar:  ${r.sidebar}`);
        console.log(`  Text:     ${r.text}`);
        console.log(`  Border:   ${r.border}`);
        console.log(`  Status:   ✅${r.success}  ⚠️${r.warning}  ❌${r.danger}`);
        console.log(`  Logo:     ${r.logo}`);
        console.log(`  Fonts:    ${r.fonts}`);
        console.log(`  Colours (${r.colorCount}):`);
        (r.topColors ?? []).forEach(c => console.log(`    ${c}`));
    }
}

main();
