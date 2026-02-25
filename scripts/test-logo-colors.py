#!/usr/bin/env python3
"""Test that logo SVG colors (including var() fallbacks) are extracted."""
import json, urllib.request, re

url = "http://localhost:3000/api/detect-brand"
data = json.dumps({"url": "https://notion.com"}).encode()
req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
resp = urllib.request.urlopen(req, timeout=30)
d = json.loads(resp.read())

svg = d.get("logoSvgContent", "")
print("=== LOGO SVG ===")
print("SVG content present:", bool(svg))
if svg:
    fills = re.findall(r'fill="([^"]+)"', svg)
    print("fill values:", fills)

print()
print("=== COLORS WITH logo-svg SOURCE ===")
for c in d.get("colors", []):
    if "logo-svg" in c.get("sources", []):
        print(f"  {c['hex']}  imp={c['importance']}  cat={c['category']}  src={c['sources']}")

print()
print("=== TOP 5 COLORS ===")
for c in d.get("colors", [])[:5]:
    print(f"  {c['hex']}  imp={c['importance']}  cat={c['category']}  src={c['sources']}")

print()
print("=== KEY SUGGESTIONS ===")
s = d.get("suggestions", {})
for k in ["colorAccent", "colorBgPrimary", "colorTextPrimary", "colorButtonPrimary"]:
    print(f"  {k}: {s.get(k, '(missing)')}")

# Checks
print()
logo_srcs = [c for c in d.get("colors", []) if "logo-svg" in c.get("sources", [])]
has_black = any(c["hex"] == "#000000" for c in logo_srcs)
has_white = any(c["hex"] == "#ffffff" for c in logo_srcs)
print(f"[{'PASS' if has_black else 'FAIL'}] #000000 extracted from logo var(--color-black)")
print(f"[{'PASS' if has_white else 'FAIL'}] #ffffff extracted from logo fill=\"#fff\"")
