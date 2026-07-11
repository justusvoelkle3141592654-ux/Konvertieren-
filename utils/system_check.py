"""System-Checks beim App-Start: externe Programme und Python-Pakete."""

import importlib.util
import shutil


def check_ffmpeg() -> bool:
    """True, wenn ffmpeg installiert ist (nötig für Audio & Video)."""
    return shutil.which("ffmpeg") is not None


def check_libreoffice() -> bool:
    """True, wenn LibreOffice installiert ist (nötig für DOCX → PDF auf Linux)."""
    return shutil.which("soffice") is not None or shutil.which("libreoffice") is not None


def missing_packages() -> list[str]:
    """Listet fehlende Python-Pakete auf, damit das UI gezielt warnen kann."""
    required = {
        "PIL": "Pillow",
        "pandas": "pandas",
        "openpyxl": "openpyxl",
        "pdf2docx": "pdf2docx",
        "docx": "python-docx",
        "pypdf": "pypdf",
        "fpdf": "fpdf2",
    }
    return [
        pip_name
        for module, pip_name in required.items()
        if importlib.util.find_spec(module) is None
    ]
