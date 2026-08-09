#!/usr/bin/env python3
"""
Generate TidePool's app icons from code.

Kept as a script rather than committed binaries so the artwork is reproducible
and reviewable. Produces build/icon.png (1024), build/icon.icns (macOS) and
build/icon.ico (Windows).

    python3 tools/make-icon.py
"""
import math
import os
import subprocess
import sys
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "build")
SS = 4           # supersample factor for clean antialiasing
SIZE = 1024

DEEP = (7, 23, 29)
WATER_TOP = (16, 58, 71)
WATER_BOT = (8, 30, 38)
ACCENT = (53, 198, 216)
FOAM = (196, 240, 246)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius, fill=255)
    return m


def build(size):
    """Draw the icon at `size` px, supersampled."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")

    # Vertical gradient ground.
    for y in range(s):
        d.line([(0, y), (s, y)], fill=lerp(WATER_TOP, WATER_BOT, y / s))

    cx, cy = s / 2, s * 0.52
    max_r = s * 0.34
    squash = 0.80          # viewed at an angle, so the pool reads as a surface

    # A droplet ripple: each ring outward is markedly thinner and fainter.
    # Uniform rings read as a radar target instead of water, so the falloff
    # here is deliberately steep.
    rings = [
        (0.30, 0.0170, 235),
        (0.52, 0.0125, 140),
        (0.74, 0.0090, 78),
        (1.00, 0.0062, 38),
    ]
    for t, w, alpha in rings:
        r = max_r * t
        colour = lerp(ACCENT, FOAM, (1 - t) * 0.4) + (alpha,)
        d.ellipse([cx - r, cy - r * squash, cx + r, cy + r * squash],
                  outline=colour, width=max(1, int(s * w)))

    # Still centre where the drop landed.
    r0 = max_r * 0.115
    d.ellipse([cx - r0, cy - r0 * squash, cx + r0, cy + r0 * squash], fill=FOAM + (245,))
    r1 = r0 * 2.1
    d.ellipse([cx - r1, cy - r1 * squash, cx + r1, cy + r1 * squash],
              outline=ACCENT + (170,), width=max(1, int(s * 0.008)))

    # Specular sheen across the upper left, clipped to the pool, so the surface
    # reads as wet rather than as concentric line art.
    sheen = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen, "RGBA")
    sd.ellipse([cx - max_r * 1.5, cy - max_r * 2.1, cx + max_r * 0.35, cy + max_r * 0.05],
               fill=(255, 255, 255, 16))
    clip = Image.new("L", (s, s), 0)
    ImageDraw.Draw(clip).ellipse(
        [cx - max_r, cy - max_r * squash, cx + max_r, cy + max_r * squash], fill=255)
    sheen.putalpha(Image.composite(sheen.getchannel("A"), Image.new("L", (s, s), 0), clip))
    img = Image.alpha_composite(img, sheen)

    # Soft top-light so the square isn't flat.
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow, "RGBA")
    for i in range(60):
        a = int(26 * (1 - i / 60))
        gd.ellipse([-s * 0.3, -s * 0.72 + i * s * 0.004, s * 1.3, s * 0.42 + i * s * 0.004],
                   fill=(255, 255, 255, max(0, a // 12)))
    img = Image.alpha_composite(img, glow)

    # macOS-style squircle crop.
    img.putalpha(rounded_mask(s, int(s * 0.225)))
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    master = build(SIZE)
    png = os.path.join(OUT, "icon.png")
    master.save(png)
    print("wrote", png)

    # Windows .ico — PIL writes a genuine multi-resolution icon.
    ico = os.path.join(OUT, "icon.ico")
    master.save(ico, sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    print("wrote", ico)

    # macOS .icns via iconutil, which needs a correctly named .iconset folder.
    iconset = os.path.join(OUT, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
            build(px).save(os.path.join(iconset, name))
    try:
        subprocess.run(["iconutil", "-c", "icns", iconset, "-o", os.path.join(OUT, "icon.icns")],
                       check=True)
        print("wrote", os.path.join(OUT, "icon.icns"))
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        # iconutil only exists on macOS; the ico and png are still usable.
        print("skipped icns:", e, file=sys.stderr)


if __name__ == "__main__":
    main()
