"""Text normalization for the aligner (MMS_FA vocab: lowercase a-z, apostrophe)."""

from __future__ import annotations

import re

from num2words import num2words
from unidecode import unidecode

_NUM = re.compile(r"\d+")


def normalize_word(word: str) -> str:
    """Romanize + lowercase, digits -> words, keep only a-z and apostrophe. May return ''."""
    w = unidecode(word).lower()
    w = _NUM.sub(lambda m: " " + num2words(int(m.group())) + " ", w)
    w = w.replace("-", " ")
    w = re.sub(r"[^a-z' ]", "", w)
    w = re.sub(r"\s+", "", w)  # one display word stays one aligner word
    return w.strip("'")


def typing_chars(text: str) -> int:
    return len(text.strip())
