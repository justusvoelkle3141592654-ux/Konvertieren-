"""Gemeinsame Fehlerklasse für alle Konverter-Module."""


class ConversionError(Exception):
    """Nutzerfreundlicher Konvertierungsfehler.

    Die Meldung wird direkt im UI angezeigt, daher sollte sie auf Deutsch,
    verständlich und ohne Stacktrace-Jargon formuliert sein.
    """
