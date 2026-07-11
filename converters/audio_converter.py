"""Audio-Konvertierungen über direkten ffmpeg-Aufruf.

Unterstützt: MP3, WAV, OGG, FLAC untereinander.
ffmpeg wird direkt aufgerufen (robuster als Python-Wrapper) – die
Verfügbarkeit wird beim App-Start geprüft.
"""

from converters.errors import ConversionError
from converters.ffmpeg_runner import run_ffmpeg

# Sinnvolle Codec-/Qualitätseinstellungen je Zielformat
_CODEC_ARGS = {
    "mp3": ["-codec:a", "libmp3lame", "-b:a", "192k"],
    "wav": ["-codec:a", "pcm_s16le"],
    "ogg": ["-codec:a", "libvorbis", "-q:a", "5"],
    "flac": ["-codec:a", "flac"],
}


def convert(data: bytes, src_ext: str, dst_ext: str) -> bytes:
    codec_args = _CODEC_ARGS.get(dst_ext)
    if codec_args is None:
        raise ConversionError(f"Unbekanntes Audio-Zielformat: .{dst_ext}")

    return run_ffmpeg(
        data,
        src_ext,
        dst_ext,
        extra_args=["-vn", *codec_args],
        error_hint=f"Audio-Umwandlung .{src_ext} → .{dst_ext}",
    )
