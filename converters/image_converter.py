"""Bild-Konvertierungen mit Pillow.

Unterstützt: JPG, PNG, WEBP, GIF, BMP, TIFF untereinander sowie Bild → PDF.
"""

import io

from PIL import Image, UnidentifiedImageError

from converters.errors import ConversionError

# Pillow erwartet bestimmte Format-Namen, die von der Dateiendung abweichen
_PIL_FORMAT = {
    "jpg": "JPEG",
    "png": "PNG",
    "webp": "WEBP",
    "gif": "GIF",
    "bmp": "BMP",
    "tiff": "TIFF",
    "pdf": "PDF",
}

# Formate ohne Transparenz-Unterstützung brauchen einen RGB-Hintergrund
_NO_ALPHA = {"jpg", "pdf", "bmp"}


def _flatten_alpha(img: Image.Image) -> Image.Image:
    """Legt transparente Bilder auf weißen Hintergrund (für JPG/PDF/BMP)."""
    if img.mode in ("RGBA", "LA", "PA") or (
        img.mode == "P" and "transparency" in img.info
    ):
        rgba = img.convert("RGBA")
        background = Image.new("RGB", rgba.size, (255, 255, 255))
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return img.convert("RGB") if img.mode not in ("RGB", "L") else img


def convert(data: bytes, src_ext: str, dst_ext: str) -> bytes:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except UnidentifiedImageError:
        raise ConversionError(
            f"Die Datei konnte nicht als Bild gelesen werden. "
            f"Ist sie wirklich eine gültige .{src_ext}-Datei?"
        )
    except Exception as exc:
        raise ConversionError(f"Bild konnte nicht geöffnet werden: {exc}")

    try:
        output = io.BytesIO()
        save_kwargs = {}

        if dst_ext in _NO_ALPHA:
            img = _flatten_alpha(img)
        elif dst_ext == "gif" and img.mode not in ("P", "L"):
            # GIF ist auf 256 Farben beschränkt
            img = img.convert("P", palette=Image.Palette.ADAPTIVE)

        if dst_ext == "jpg":
            save_kwargs["quality"] = 95
        elif dst_ext == "webp":
            save_kwargs["quality"] = 90
        elif dst_ext == "pdf":
            save_kwargs["resolution"] = 100.0

        img.save(output, format=_PIL_FORMAT[dst_ext], **save_kwargs)
        return output.getvalue()
    except Exception as exc:
        raise ConversionError(
            f"Umwandlung von .{src_ext} nach .{dst_ext} fehlgeschlagen: {exc}"
        )
