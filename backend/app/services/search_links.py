"""Generate search URLs for music stores."""

import urllib.parse

STORES = {
    "bandcamp": {
        "name": "Bandcamp",
        "url_template": "https://bandcamp.com/search?q={query}",
    },
    "discogs": {
        "name": "Discogs",
        "url_template": "https://www.discogs.com/search/?q={query}&type=all",
    },
    "qobuz": {
        "name": "Qobuz",
        "url_template": "https://www.qobuz.com/search?q={query}",
    },
    "7digital": {
        "name": "7digital",
        "url_template": "https://www.7digital.com/search?q={query}",
    },
    "itunes": {
        "name": "iTunes",
        "url_template": "https://music.apple.com/search?term={query}",
    },
    "amazon": {
        "name": "Amazon Music",
        "url_template": "https://www.amazon.com/s?k={query}&i=digital-music",
    },
}


def generate_search_urls(artist: str, title: str, album: str | None = None) -> dict[str, dict[str, str]]:
    """Generate search URLs for all supported music stores.

    Args:
        artist: Artist name
        title: Track title
        album: Optional album name for more specific searches

    Returns:
        Dict mapping store key to {name, url}
    """
    # Build search query
    query_parts = [artist, title]
    if album:
        query_parts.append(album)

    query = " ".join(query_parts)
    encoded_query = urllib.parse.quote(query)

    result = {}
    for store_key, store_info in STORES.items():
        result[store_key] = {
            "name": store_info["name"],
            "url": store_info["url_template"].format(query=encoded_query),
        }

    return result


def generate_search_url(store_key: str, artist: str, title: str, album: str | None = None) -> str | None:
    """Generate search URL for a specific store.

    Args:
        store_key: Store identifier (bandcamp, discogs, etc.)
        artist: Artist name
        title: Track title
        album: Optional album name

    Returns:
        Search URL or None if store not found
    """
    if store_key not in STORES:
        return None

    query_parts = [artist, title]
    if album:
        query_parts.append(album)

    query = " ".join(query_parts)
    encoded_query = urllib.parse.quote(query)

    return STORES[store_key]["url_template"].format(query=encoded_query)
