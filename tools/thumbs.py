"""Thumbnail leggere per le card (Pillow). Originali intatti.

Uso: python tools/thumbs.py
Output: _thumbs/<stesso path relativo>.jpg  (larghezza max 420, q74, senza EXIF)
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_multimedia")
DST = os.path.join(ROOT, "_thumbs")
MAX_W = 420
QUALITY = 74
EXTS = (".jpg", ".jpeg", ".png", ".webp")

made = skipped = failed = 0

for base, _dirs, files in os.walk(SRC):
    for name in files:
        if not name.lower().endswith(EXTS):
            continue
        src = os.path.join(base, name)
        rel = os.path.relpath(src, SRC)
        out = os.path.join(DST, os.path.splitext(rel)[0] + ".jpg")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(out) and os.path.getmtime(out) >= os.path.getmtime(src):
            skipped += 1
            continue
        try:
            with Image.open(src) as im:
                im = im.convert("RGB")
                if im.width > MAX_W:
                    im = im.resize((MAX_W, max(1, round(im.height * MAX_W / im.width))), Image.LANCZOS)
                im.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            made += 1
        except Exception as exc:  # noqa: BLE001 - un file rotto non deve fermare il sync
            failed += 1
            print(f"ERRORE {rel}: {exc}", file=sys.stderr)

print(f"thumbs: {made} create, {skipped} già aggiornate, {failed} errori")
