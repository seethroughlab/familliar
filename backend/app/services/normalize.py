"""String normalization utilities for consistent matching.

Used for album/artist name matching to handle variations like:
- Case: "THE" vs "the"
- Diacritics: "Björk" vs "Bjork"
- Quote styles: "Don't" vs "Don't"
- Dashes: "Rock — Roll" vs "Rock - Roll"
- Whitespace: "The  Beatles" vs "The Beatles"
"""

import re
import unicodedata


def normalize_for_matching(name: str | None) -> str:
    """Normalize a string for consistent matching.

    Handles: case, whitespace, quotes, dashes, diacritics.
    Preserves: articles, punctuation structure.

    Args:
        name: The string to normalize

    Returns:
        Normalized string suitable for comparison/hashing

    Examples:
        >>> normalize_for_matching("Björk")
        'bjork'
        >>> normalize_for_matching("Alice In Ultraland")
        'alice in ultraland'
        >>> normalize_for_matching("Don't Stop")
        "don't stop"
    """
    if not name:
        return ""

    s = name.strip()

    # Unicode NFC normalization (compose characters consistently)
    s = unicodedata.normalize("NFC", s)

    # Normalize quotes: ' ' ´ ` ′ → '
    s = re.sub(r"[''´`′]", "'", s)
    s = re.sub(r'[""«»]', '"', s)

    # Normalize dashes: – — − ‐ ‒ ⁻ → -
    s = re.sub(r"[–—−‐‒⁻]", "-", s)

    # Remove diacritics: Björk → Bjork
    # NFKD decomposes characters (é → e + combining accent)
    s = unicodedata.normalize("NFKD", s)
    # Remove combining marks (accents, umlauts, etc.)
    s = "".join(c for c in s if not unicodedata.combining(c))

    # Case fold (better than .lower() for unicode, handles ß → ss)
    s = s.casefold()

    # Collapse whitespace
    s = " ".join(s.split())

    return s
