#!/usr/bin/env python3
"""Generate TBC's app icons (icon-192.png / icon-512.png).

Drawn from primitives with Pillow at 4x supersample then downscaled for crisp
edges. Maskable-safe: the tractor sits inside the central ~80% of the canvas.
Re-run with:  python3 make-icons.py
"""
from PIL import Image, ImageDraw

S = 1024
img = Image.new("RGBA", (S, S), (46, 158, 79, 255))  # grass green, full bleed
d = ImageDraw.Draw(img)


def px(v):
    return int(v * S)


# Ground
d.rectangle([0, px(0.80), S, S], fill=(33, 120, 62, 255))
# Sun (decorative, corner)
d.ellipse([px(0.71), px(0.09), px(0.90), px(0.28)], fill=(245, 201, 60, 255))

ORANGE = (232, 97, 44, 255)
DARK = (34, 34, 34, 255)
HUB = (150, 150, 150, 255)
WIN = (190, 227, 255, 255)

# Bonnet + cab body
d.rounded_rectangle([px(0.28), px(0.46), px(0.76), px(0.66)], radius=px(0.03), fill=ORANGE)
d.rounded_rectangle([px(0.50), px(0.32), px(0.72), px(0.52)], radius=px(0.03), fill=ORANGE)
# Window
d.rounded_rectangle([px(0.535), px(0.36), px(0.685), px(0.49)], radius=px(0.015), fill=WIN)
# Exhaust
d.rectangle([px(0.40), px(0.30), px(0.435), px(0.47)], fill=DARK)
d.rectangle([px(0.385), px(0.285), px(0.45), px(0.31)], fill=DARK)


def wheel(cx, cy, r):
    d.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=DARK)
    d.ellipse([px(cx - r * 0.45), px(cy - r * 0.45), px(cx + r * 0.45), px(cy + r * 0.45)], fill=HUB)
    d.ellipse([px(cx - r * 0.12), px(cy - r * 0.12), px(cx + r * 0.12), px(cy + r * 0.12)], fill=DARK)


wheel(0.62, 0.66, 0.17)  # rear (big)
wheel(0.36, 0.70, 0.11)  # front (small)
# Headlight
d.ellipse([px(0.285), px(0.52), px(0.325), px(0.56)], fill=(255, 221, 63, 255))

for sz in (512, 192):
    img.resize((sz, sz), Image.LANCZOS).save("icon-%d.png" % sz)

print("icons written: icon-512.png, icon-192.png")
