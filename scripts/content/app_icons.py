"""Icons and launch screens of the iOS and Android apps, cut from the icon artwork like the PWA icons
(render_covers.mjs): the tile inside the artwork's dark margin.

    python3 scripts/content/app_icons.py scripts/content/icon-artwork.png

Needs Pillow. Writes into ios/App/App/Assets.xcassets and android/app/src/main/res.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
PAPER = (0xF6, 0xF1, 0xE9)
# The tile inside the artwork's dark margin (as in render_covers.mjs).
TILE = (48 / 1024, 53 / 1024, 922 / 1024, 914 / 1024)


def tile(art: Image.Image) -> Image.Image:
    w, h = art.size
    x, y, tw, th = TILE
    return art.crop((round(x * w), round(y * h), round((x + tw) * w), round((y + th) * h))).convert("RGB")


def rounded(img: Image.Image, size: int, radius: float) -> Image.Image:
    """The tile at `size`, its corners rounded a little tighter than the painted ones, transparent outside."""
    out = img.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1), radius=radius * size * 4, fill=255)
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def blurred(img: Image.Image, size: int) -> Image.Image:
    """A soft, darker copy filling the square: what shows around the tile where a mask is larger than it."""
    big = img.resize((round(size * 1.2), round(size * 1.2)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(size * 0.035))
    off = (big.width - size) // 2
    big = big.crop((off, off, off + size, off + size))
    return Image.eval(big, lambda v: round(v * 0.85))


def circle(img: Image.Image) -> Image.Image:
    size = img.width
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask.resize((size, size), Image.LANCZOS))
    return out


def splash(img: Image.Image, w: int, h: int) -> Image.Image:
    out = Image.new("RGB", (w, h), PAPER)
    s = round(min(w, h) * 0.22)
    t = rounded(img, s, 0.2)
    out.paste(t, ((w - s) // 2, (h - s) // 2), t)
    return out


def main(src: str) -> None:
    art = tile(Image.open(src))

    # iOS: one 1024 icon without transparency; iOS rounds it with its own, larger radius.
    ios = ROOT / "ios/App/App/Assets.xcassets"
    art.resize((1024, 1024), Image.LANCZOS).save(ios / "AppIcon.appiconset/AppIcon-512@2x.png")
    for name in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
        splash(art, 2732, 2732).save(ios / "Splash.imageset" / name)

    # Android: legacy square and round icons, and the adaptive icon's layers (108 dp, of which the launcher's mask
    # shows the middle 72 dp): the tile on a blurred copy of itself, so circles and squircles cut only the blur.
    res = ROOT / "android/app/src/main/res"
    for density, scale in (("mdpi", 1), ("hdpi", 1.5), ("xhdpi", 2), ("xxhdpi", 3), ("xxxhdpi", 4)):
        d = res / f"mipmap-{density}"
        legacy = round(48 * scale)
        rounded(art, legacy, 0.2).save(d / "ic_launcher.png")
        r = blurred(art, legacy).convert("RGBA")
        inner = round(legacy * 0.74)
        t = rounded(art, inner, 0.18)
        r.paste(t, ((legacy - inner) // 2, (legacy - inner) // 2), t)
        circle(r).save(d / "ic_launcher_round.png")
        full = round(108 * scale)
        blurred(art, full).save(d / "ic_launcher_background.png")
        fg = Image.new("RGBA", (full, full), (0, 0, 0, 0))
        inner = round(72 * scale * 0.88)
        t = rounded(art, inner, 0.18)
        fg.paste(t, ((full - inner) // 2, (full - inner) // 2), t)
        fg.save(d / "ic_launcher_foreground.png")
    for folder in sorted(res.glob("drawable*")):
        f = folder / "splash.png"
        if f.exists():
            w, h = Image.open(f).size
            splash(art, w, h).save(f)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "scripts/content/icon-artwork.png"))
