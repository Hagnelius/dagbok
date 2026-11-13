"""Renderar PNG-ikoner från SVG med Playwright. Körs vid behov: python3 scripts/make-icons.py"""
import pathlib
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
svg = (root / "favicon.svg").read_text()
# Maskable: extra marginal (safe zone 80 %) och full bakgrund
maskable = svg.replace('rx="112"', 'rx="0"').replace('r="150"', 'r="120"').replace(
    'M196 262l44 44 84-96', 'M208 260l35 35 67-77').replace('stroke-width="40"', 'stroke-width="32"')
apple = svg.replace('rx="112"', 'rx="0"')
targets = [("icon-192.png", 192, svg), ("icon-512.png", 512, svg),
           ("icon-maskable-512.png", 512, maskable), ("apple-touch-icon.png", 180, apple)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, s in targets:
        pg = b.new_page(viewport={"width": size, "height": size})
        pg.set_content(f'<html><body style="margin:0;background:transparent">{s.replace("<svg ", f"<svg width=\"{size}\" height=\"{size}\" ", 1)}</body></html>')
        pg.screenshot(path=str(root / name), omit_background=True)
    b.close()
print("ok")
