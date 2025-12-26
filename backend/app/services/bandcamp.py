"""Bandcamp search service for finding albums to purchase."""

from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup


@dataclass
class BandcampResult:
    """A Bandcamp search result."""
    result_type: str  # album, track, artist
    name: str
    artist: str | None
    album: str | None  # For tracks
    url: str
    image_url: str | None
    genre: str | None
    release_date: str | None


class BandcampService:
    """Service for searching Bandcamp."""

    BASE_URL = "https://bandcamp.com"
    SEARCH_URL = "https://bandcamp.com/search"

    def __init__(self):
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            }
        )

    async def search(
        self,
        query: str,
        item_type: str = "a",  # a=album, t=track, b=artist/band
        limit: int = 10,
    ) -> list[BandcampResult]:
        """Search Bandcamp for albums, tracks, or artists.

        Args:
            query: Search query
            item_type: 'a' for albums, 't' for tracks, 'b' for artists/bands
            limit: Maximum results to return

        Returns:
            List of BandcampResult objects
        """
        params = {
            "q": query,
            "item_type": item_type,
        }

        try:
            response = await self.client.get(self.SEARCH_URL, params=params)
            response.raise_for_status()
        except httpx.HTTPError:
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        results = []

        # Find search result items
        result_items = soup.select(".searchresult.data-search")

        for item in result_items[:limit]:
            result = self._parse_result_item(item, item_type)
            if result:
                results.append(result)

        return results

    def _parse_result_item(self, item, item_type: str) -> BandcampResult | None:
        """Parse a single search result item."""
        try:
            # Get result type
            result_class = item.get("class", [])
            if "album" in result_class:
                rtype = "album"
            elif "track" in result_class:
                rtype = "track"
            elif "band" in result_class:
                rtype = "artist"
            else:
                rtype = "album"  # Default

            # Get name
            heading = item.select_one(".heading a")
            name = heading.get_text(strip=True) if heading else None
            url = heading.get("href") if heading else None

            if not name or not url:
                return None

            # Get artist (for albums/tracks)
            subhead = item.select_one(".subhead")
            artist = None
            if subhead:
                artist_text = subhead.get_text(strip=True)
                # Format is typically "by Artist Name"
                if artist_text.startswith("by "):
                    artist = artist_text[3:]
                else:
                    artist = artist_text

            # Get image
            art = item.select_one(".art img")
            image_url = art.get("src") if art else None

            # Get genre from tags
            genre = None
            tags = item.select(".tags .tag")
            if tags:
                genre = tags[0].get_text(strip=True)

            # Get release date if available
            release = item.select_one(".released")
            release_date = release.get_text(strip=True).replace("released ", "") if release else None

            return BandcampResult(
                result_type=rtype,
                name=name,
                artist=artist,
                album=None if rtype != "track" else None,  # For tracks, album is separate
                url=url,
                image_url=image_url,
                genre=genre,
                release_date=release_date,
            )
        except Exception:
            return None

    async def get_album_details(self, url: str) -> dict | None:
        """Get details about a specific album.

        Args:
            url: Bandcamp album URL

        Returns:
            Dict with album details or None if not found
        """
        try:
            response = await self.client.get(url)
            response.raise_for_status()
        except httpx.HTTPError:
            return None

        soup = BeautifulSoup(response.text, "html.parser")

        try:
            # Get album name
            title = soup.select_one("h2.trackTitle")
            album_name = title.get_text(strip=True) if title else None

            # Get artist
            artist_link = soup.select_one("#name-section a")
            artist = artist_link.get_text(strip=True) if artist_link else None

            # Get price
            price_el = soup.select_one(".buyItemNy498 .base-text-color")
            price = price_el.get_text(strip=True) if price_el else "Name your price"

            # Get track list
            tracks = []
            track_rows = soup.select(".track_list .track_row_view")
            for row in track_rows:
                track_title = row.select_one(".title-col .title")
                if track_title:
                    tracks.append(track_title.get_text(strip=True))

            # Get cover art
            art = soup.select_one("#tralbumArt img")
            image_url = art.get("src") if art else None

            # Get tags
            tags = [t.get_text(strip=True) for t in soup.select(".tralbumData.tralbum-tags a")]

            return {
                "name": album_name,
                "artist": artist,
                "url": url,
                "price": price,
                "tracks": tracks,
                "track_count": len(tracks),
                "image_url": image_url,
                "tags": tags,
            }
        except Exception:
            return None

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
