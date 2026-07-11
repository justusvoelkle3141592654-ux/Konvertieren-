"""Video-Konvertierungen über direkten ffmpeg-Aufruf.

Unterstützt: MP4, AVI, MOV, MKV untereinander sowie die Extraktion der
Tonspur als MP3/WAV/OGG/FLAC.
"""

from converters import AUDIO_FORMATS
from converters.errors import ConversionError
from converters.ffmpeg_runner import run_ffmpeg

# Container-spezifische Einstellungen für Video → Video
_VIDEO_ARGS = {
    "mp4": ["-codec:v", "libx264", "-preset", "fast", "-crf", "23",
            "-codec:a", "aac", "-movflags", "+faststart"],
    "mkv": ["-codec:v", "libx264", "-preset", "fast", "-crf", "23",
            "-codec:a", "aac"],
    "mov": ["-codec:v", "libx264", "-preset", "fast", "-crf", "23",
            "-codec:a", "aac", "-movflags", "+faststart"],
    "avi": ["-codec:v", "mpeg4", "-q:v", "5", "-codec:a", "libmp3lame"],
}

# Tonspur-Extraktion nutzt dieselben Codec-Einstellungen wie der Audio-Konverter
_AUDIO_EXTRACT_ARGS = {
    "mp3": ["-vn", "-codec:a", "libmp3lame", "-b:a", "192k"],
    "wav": ["-vn", "-codec:a", "pcm_s16le"],
    "ogg": ["-vn", "-codec:a", "libvorbis", "-q:a", "5"],
    "flac": ["-vn", "-codec:a", "flac"],
}


def convert(data: bytes, src_ext: str, dst_ext: str) -> bytes:
    if dst_ext in AUDIO_FORMATS:
        extra_args = _AUDIO_EXTRACT_ARGS.get(dst_ext)
        hint = f"Tonspur-Extraktion .{src_ext} → .{dst_ext}"
    else:
        extra_args = _VIDEO_ARGS.get(dst_ext)
        hint = f"Video-Umwandlung .{src_ext} → .{dst_ext}"

    if extra_args is None:
        raise ConversionError(f"Unbekanntes Video-Zielformat: .{dst_ext}")

    return run_ffmpeg(data, src_ext, dst_ext, extra_args=extra_args, error_hint=hint)
