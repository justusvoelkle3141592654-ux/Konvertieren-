"""Daten-/Tabellen-Konvertierungen mit Pandas.

Unterstützt: CSV, XLSX, JSON untereinander.
"""

import io
import json

import pandas as pd

from converters.errors import ConversionError


def _read_dataframe(data: bytes, src_ext: str) -> pd.DataFrame:
    buffer = io.BytesIO(data)
    try:
        if src_ext == "csv":
            # sep=None lässt Pandas das Trennzeichen (Komma/Semikolon/Tab) erraten
            return pd.read_csv(buffer, sep=None, engine="python")
        if src_ext == "xlsx":
            return pd.read_excel(buffer)
        if src_ext == "json":
            try:
                return pd.read_json(buffer)
            except ValueError:
                # Fallback für verschachteltes JSON: flach klopfen
                parsed = json.loads(data.decode("utf-8"))
                return pd.json_normalize(parsed)
    except ConversionError:
        raise
    except Exception as exc:
        raise ConversionError(
            f"Die .{src_ext}-Datei konnte nicht gelesen werden: {exc}"
        )
    raise ConversionError(f"Unbekanntes Datenformat: .{src_ext}")


def convert(data: bytes, src_ext: str, dst_ext: str) -> bytes:
    df = _read_dataframe(data, src_ext)

    if df.empty and len(df.columns) == 0:
        raise ConversionError("Die Datei enthält keine lesbaren Daten.")

    try:
        output = io.BytesIO()
        if dst_ext == "csv":
            df.to_csv(output, index=False)
        elif dst_ext == "xlsx":
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, index=False)
        elif dst_ext == "json":
            df.to_json(output, orient="records", indent=2, force_ascii=False)
        else:
            raise ConversionError(f"Unbekanntes Zielformat: .{dst_ext}")
        return output.getvalue()
    except ConversionError:
        raise
    except Exception as exc:
        raise ConversionError(
            f"Umwandlung von .{src_ext} nach .{dst_ext} fehlgeschlagen: {exc}"
        )
