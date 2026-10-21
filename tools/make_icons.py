"""Regenerates the app icons in icons/ (forest green square, cream scan frame + chef hat).
Run: python3 tools/make_icons.py   (needs Pillow: pip install pillow)"""
from PIL import Image, ImageDraw

def icon(size, maskable=False, path=None, rgb=False):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    bg = (29, 58, 44, 255); cream = (244, 237, 224, 255)
    if maskable: d.rectangle([0, 0, S, S], fill=bg)
    else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.23), fill=bg)
    k = 0.78 if maskable else 1.0; c = S / 2
    def P(x, y): return (c + (x - 0.5) * S * k, c + (y - 0.5) * S * k)
    lw = int(S * 0.045 * k); L = 0.12
    for (x, y, dx, dy) in [(0.18, 0.18, 1, 1), (0.82, 0.18, -1, 1), (0.18, 0.82, 1, -1), (0.82, 0.82, -1, -1)]:
        d.line([P(x, y + dy * L), P(x, y), P(x + dx * L, y)], fill=cream, width=lw, joint='curve')
    for (x, y, r) in [(0.39, 0.43, 0.1), (0.5, 0.37, 0.12), (0.61, 0.43, 0.1)]:
        a, b = P(x - r, y - r); e, f = P(x + r, y + r); d.ellipse([a, b, e, f], fill=cream)
    d.rectangle([*P(0.33, 0.44), *P(0.67, 0.6)], fill=cream)
    d.rounded_rectangle([*P(0.35, 0.6), *P(0.65, 0.68)], radius=int(S * 0.015 * k), fill=cream)
    d.line([P(0.37, 0.59), P(0.63, 0.59)], fill=bg, width=int(lw * 0.6))
    im = im.resize((size, size), Image.LANCZOS)
    if rgb: im = im.convert('RGB')
    im.save(path)

icon(192, path='icons/icon-192.png'); icon(512, path='icons/icon-512.png')
icon(512, maskable=True, path='icons/maskable-512.png')
icon(180, maskable=True, path='icons/apple-touch-icon.png', rgb=True)
icon(64, path='icons/favicon-64.png')
print('icons written')
