#!/usr/bin/env python3
"""Quick brand detection tester — runs 5 key URLs sequentially."""
import json, urllib.request, sys

API = "http://localhost:3000/api/detect-brand"
SITES = ["stripe.com", "github.com", "vercel.com", "shopify.com", "us2.app",
         "notion.com", "openai.com", "slack.com", "figma.com", "netflix.com",
         "nike.com", "airbnb.com", "suno.com", "instagram.com"]

for site in SITES:
    try:
        req = urllib.request.Request(API, data=json.dumps({"url": site}).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            d = json.loads(resp.read())
        s = d.get("suggestions", {})
        defblue = "⚠DEF" if s.get("colorAccent") == "#3b82f6" else "  ✓ "
        logo = "SVG" if d.get("logoUrl","").startswith("data:") else ("URL" if d.get("logoUrl") else "---")
        top5 = " ".join(f'{c["hex"]}[{c["category"][0]}]' for c in d.get("colors",[])[:5])
        print(f'{site:20s} {d.get("siteTheme","?"):5s} '
              f'A={s.get("colorAccent","?"):9s} '
              f'Bg={s.get("colorBackground","?"):9s} '
              f'Tx={s.get("colorText","?"):9s} '
              f'{defblue} Logo={logo:4s} | {top5}')
        # Save full result
        with open(f"/tmp/brand_{site}.json", "w") as f:
            json.dump(d, f, indent=2)
    except Exception as e:
        print(f'{site:20s} ❌ {e}')
