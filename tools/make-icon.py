#!/usr/bin/env python3
"""
Build TidePool's app icons from build/icon-source.png.

The source is 800x800 full-bleed pixel art. Scaling matters here: pixel art
upscaled with a smooth filter turns to mush, and downscaled with nearest
neighbour it shimmers. So upscales use NEAREST to keep edges hard, and
downscales use LANCZOS, which is what a small icon actually needs to stay
legible.

macOS gets a rounded mask because every other icon in the Dock is a squircle and
a hard square reads as broken. Windows keeps the full square, which is that
platform's convention.

    python3 tools/make-icon.py
"""
import os
import subprocess
import sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "..", "build")
SOURCE = os.path.join(OUT, "icon-source.png")


def load():
    im = Image.open(SOURCE).convert("RGBA")
    if im.width != im.height:
        raise SystemExit(f"icon source must be square, got {im.size}")
    return im


def scaled(im, size):
    """Resize preserving the pixel-art look in whichever direction we're going."""
    if size == im.width:
        return im.copy()
    if size > im.width:
        return im.resize((size, size), Image.NEAREST)
    return im.resize((size, size), Image.LANCZOS)


def squircled(im):
    """Apply the macOS-style rounded mask, at 4x for clean edges."""
    size = im.width
    ss = 4
    mask = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size * ss - 1, size * ss - 1], radius=int(size * ss * 0.225), fill=255
    )
    out = im.copy()
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    src = load()

    master = scaled(src, 1024)
    master.save(os.path.join(OUT, "icon.png"))
    print("wrote icon.png (1024, square)")

    # Windows: square, multi-resolution.
    master.save(
        os.path.join(OUT, "icon.ico"),
        sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)],
    )
    print("wrote icon.ico")

    # macOS: rounded, via an .iconset that iconutil understands.
    iconset = os.path.join(OUT, "icon.iconset")
    os.makedirs(iconset, exist_ok=True)
    for base in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            px = base * scale
            name = f"icon_{base}x{base}{'@2x' if scale == 2 else ''}.png"
            squircled(scaled(src, px)).save(os.path.join(iconset, name))
    try:
        subprocess.run(
            ["iconutil", "-c", "icns", iconset, "-o", os.path.join(OUT, "icon.icns")],
            check=True,
        )
        print("wrote icon.icns (rounded)")
    except (FileNotFoundError, subprocess.CalledProcessError) as e:
        print("skipped icns:", e, file=sys.stderr)

    # The in-app brand mark, small and crisp.
    squircled(scaled(src, 64)).save(
        os.path.join(HERE, "..", "src", "renderer", "assets", "mark.png")
    )
    print("wrote src/renderer/assets/mark.png (64, for the topbar)")


if __name__ == "__main__":
    main()
