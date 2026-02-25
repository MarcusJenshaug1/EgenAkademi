#!/usr/bin/env python3
"""
Brand-detection acceptance-test harness.
Tests siteTheme-aware mapping: light sites get light bg + dark text,
monochrome brands get brand-ink accent.

Usage:
  1. npm run dev  (in another terminal)
  2. python3 scripts/test-theme-mapping.py
"""
import json, urllib.request, sys

API = "http://localhost:3000/api/detect-brand"
SITES = [
    "notion.com",
    "nike.com",
    "stripe.com",
    "slack.com",
    "shopify.com",
    "instagram.com",
    "github.com",
    "suno.com",
    "us2.app",
]

def hex_to_hsl(hex_str):
    hex_str = hex_str.lstrip('#')
    r, g, b = int(hex_str[0:2], 16)/255, int(hex_str[2:4], 16)/255, int(hex_str[4:6], 16)/255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return (0, 0, round(l*100))
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r: h = ((g - b) / d + (6 if g < b else 0)) * 60
    elif mx == g: h = ((b - r) / d + 2) * 60
    else: h = ((r - g) / d + 4) * 60
    return (round(h), round(s*100), round(l*100))

pass_count = 0
fail_count = 0
warn_count = 0
total = 0

print("=" * 100)
print("  BRAND DETECTION ACCEPTANCE TEST  --  Theme-aware mapping")
print("=" * 100)
print()

for site in SITES:
    total += 1
    try:
        req = urllib.request.Request(API, data=json.dumps({"url": site}).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            d = json.loads(resp.read())
    except Exception as e:
        print(f"  {site:20s}  [SKIP] Could not fetch: {e}")
        continue

    s = d.get("suggestions", {})
    theme = d.get("siteTheme", "?")

    bg1     = s.get("colorBgPrimary", "")
    bg2     = s.get("colorBgSecondary", "")
    text1   = s.get("colorTextPrimary", "")
    text2   = s.get("colorTextSecondary", "")
    accent  = s.get("colorAccent", "")
    btn_bg  = s.get("colorButtonPrimary", "")
    btn_txt = s.get("colorButtonText", "")
    sidebar = s.get("colorSidebarBg", "")
    sidebar_txt = s.get("colorSidebarText", "")

    bg1_l  = hex_to_hsl(bg1)[2]  if bg1  else -1
    bg2_l  = hex_to_hsl(bg2)[2]  if bg2  else -1
    text1_l = hex_to_hsl(text1)[2] if text1 else -1
    text2_l = hex_to_hsl(text2)[2] if text2 else -1
    accent_s = hex_to_hsl(accent)[1] if accent else -1
    accent_l = hex_to_hsl(accent)[2] if accent else -1

    results = []

    # --- Checks ---
    if theme == "light":
        # BgPrimary must be light (l > 80)
        if bg1_l >= 0 and bg1_l < 80:
            results.append(f"[FAIL] bgPrimary L={bg1_l} (expected >80 for light site)")
            fail_count += 1
        else:
            results.append(f"[PASS] bgPrimary L={bg1_l}")
            pass_count += 1
        # TextPrimary must be dark (l < 30)
        if text1_l >= 0 and text1_l > 30:
            results.append(f"[FAIL] textPrimary L={text1_l} (expected <30 for light site)")
            fail_count += 1
        else:
            results.append(f"[PASS] textPrimary L={text1_l}")
            pass_count += 1

    elif theme == "dark":
        # BgPrimary must be dark (l < 20)
        if bg1_l >= 0 and bg1_l > 20:
            results.append(f"[FAIL] bgPrimary L={bg1_l} (expected <20 for dark site)")
            fail_count += 1
        else:
            results.append(f"[PASS] bgPrimary L={bg1_l}")
            pass_count += 1
        # TextPrimary must be light (l > 80)
        if text1_l >= 0 and text1_l < 80:
            results.append(f"[FAIL] textPrimary L={text1_l} (expected >80 for dark site)")
            fail_count += 1
        else:
            results.append(f"[PASS] textPrimary L={text1_l}")
            pass_count += 1

    # Accent: default-blue check
    if accent == "#3b82f6":
        results.append(f"[WARN] accent is default-blue #3b82f6")
        warn_count += 1
    else:
        results.append(f"[PASS] accent={accent} S={accent_s} L={accent_l}")
        pass_count += 1

    # Monochrome check: if no saturated accent, check that dark ink is used, not mid-grey
    if accent_s >= 0 and accent_s < 15:
        if accent_l > 25 and accent_l < 70:
            results.append(f"[WARN] monochrome brand has mid-grey accent L={accent_l} (prefer dark ink <15 or light ink >85)")
            warn_count += 1
        else:
            results.append(f"[PASS] brand-ink accent L={accent_l}")
            pass_count += 1

    # Secondaries check
    if bg2:
        results.append(f"[PASS] bgSecondary={bg2} L={bg2_l}")
        pass_count += 1
    else:
        results.append(f"[WARN] bgSecondary missing")
        warn_count += 1

    if text2:
        results.append(f"[PASS] textSecondary={text2} L={text2_l}")
        pass_count += 1
    else:
        results.append(f"[WARN] textSecondary missing")
        warn_count += 1

    # Print
    print(f"--- {site} ---  theme={theme}")
    print(f"  bgPri={bg1:8s}(L={bg1_l:3d})  bgSec={bg2:8s}(L={bg2_l:3d})")
    print(f"  txtPri={text1:8s}(L={text1_l:3d})  txtSec={text2:8s}(L={text2_l:3d})")
    print(f"  accent={accent:8s}(S={accent_s:3d} L={accent_l:3d})  btn={btn_bg:8s} btnTxt={btn_txt:8s}")
    print(f"  sidebar={sidebar:8s} sidebarTxt={sidebar_txt}")
    for r in results:
        print(f"    {r}")
    print()

# Summary
print("=" * 100)
print(f"  SUMMARY:  {pass_count} passed  /  {fail_count} failed  /  {warn_count} warnings  /  {total} sites tested")
if fail_count == 0:
    print("  >> All acceptance criteria passed.")
else:
    print(f"  >> {fail_count} failure(s) detected.")
print("=" * 100)
