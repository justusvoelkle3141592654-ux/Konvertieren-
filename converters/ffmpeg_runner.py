"""Gemeinsamer, robuster ffmpeg-Aufruf für Audio- und Video-Konvertierungen."""

import shutil
import subprocess
import tempfile
from pathlib import Path

from converters.errors import ConversionError

# 10 Minuten – großzügig genug für große Videos, verhindert aber Hänger
_TIMEOUT_SECONDS = 600


def ffmpeg_available() -> bool:
    """Prüft, ob ffmpeg auf dem System installiert und aufrufbar ist."""
    return shutil.which("ffmpeg") is not None


def run_ffmpeg(
    data: bytes,
    src_ext: str,
    dst_ext: str,
    extra_args: list[str],
    error_hint: str,
) -> bytes:
    """Schreibt die Eingabe in eine Temp-Datei, ruft ffmpeg auf, liest das Ergebnis.

    Temp-Dateien statt Pipes, weil viele Container-Formate (z.B. MP4/MOV)
    kein Streaming über stdin/stdout unterstützen.
    """
    if not ffmpeg_available():
        raise ConversionError(
            "ffmpeg ist nicht installiert. Audio-/Video-Konvertierungen benötigen "
            "ffmpeg – siehe README für die Installationsanleitung."
        )

    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / f"input.{src_ext}"
        output_path = Path(tmp) / f"output.{dst_ext}"
        input_path.write_bytes(data)

        command = [
            "ffmpeg",
            "-y",              # Ausgabedatei überschreiben
            "-hide_banner",
            "-loglevel", "error",
            "-i", str(input_path),
            *extra_args,
            str(output_path),
        ]

        try:
            result = subprocess.run(
                command,
                capture_output=True,
                timeout=_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            raise ConversionError(
                f"{error_hint} abgebrochen: ffmpeg hat das Zeitlimit von "
                f"{_TIMEOUT_SECONDS // 60} Minuten überschritten."
            )
        except OSError as exc:
            raise ConversionError(f"ffmpeg konnte nicht gestartet werden: {exc}")

        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace").strip()
            # Nur die letzte Zeile zeigen – dort steht die eigentliche Ursache
            last_line = stderr.splitlines()[-1] if stderr else "Unbekannter Fehler"
            raise ConversionError(f"{error_hint} fehlgeschlagen: {last_line}")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise ConversionError(
                f"{error_hint} fehlgeschlagen: ffmpeg hat keine Ausgabedatei erzeugt."
            )

        return output_path.read_bytes()
