# Familiar — Development Plan

> **For Claude Code:** This is the development plan for Familiar, an LLM-powered local music player. Use this document as your primary reference for architecture decisions, schema design, and implementation details. When implementing features, check the relevant section here first.

## Quick Reference

| Path | Purpose |
|------|---------|
| `familiar/backend/` | Python FastAPI backend |
| `familiar/backend/api/` | API routes |
| `familiar/backend/workers/` | Celery workers (GPU analysis) |
| `familiar/backend/lib/` | Shared code (models, services, utils) |
| `familiar/frontend/` | React + TypeScript frontend |
| `familiar/frontend/src/components/` | React components |
| `familiar/frontend/src/hooks/` | Custom hooks (audio, API, state) |
| `familiar/frontend/src/stores/` | Zustand stores |
| `familiar/docker/` | Dockerfiles |
| `data/music/` | Mounted music library (read-only) |
| `data/art/` | Extracted album art |
| `data/videos/` | Downloaded music videos |

## Implementation Order

1. **Phase 1:** Backend infrastructure, database, audio analysis pipeline
2. **Phase 2:** Basic playback (backend streaming + frontend audio engine)
3. **Phase 3:** LLM integration (Claude API + tools)
4. **Phase 4:** Spotify sync, Bandcamp integration
5. **Phase 5:** Polish (lyrics, scrobbling, videos, sharing)

---

## Project Overview

**Name**: Familiar

A conversational music player that combines local library management with AI-powered discovery. Users describe what they want to listen to in natural language, and the LLM creates playlists from a deeply-analyzed local music collection. Spotify integration learns user preferences and recommends purchases to grow the local library.

### Core Philosophy
A pathway from streaming back to ownership—making local music collections as discoverable and serendipitous as Spotify, while encouraging users to own their music.

---

## Requirements Summary

| Area | Decision |
|------|----------|
| **Formats** | MP3, FLAC, AAC |
| **Library Size** | < 1TB |
| **Audio Analysis** | Advanced (embeddings, spectral, similarity) |
| **Metadata** | Auto-tagging via AcoustID/MusicBrainz |
| **Primary LLM** | Claude API with tool-use |
| **Fallback LLM** | Ollama (user choice) |
| **Analysis Compute** | Local GPU |
| **Interface** | Custom web app (browser-based) |
| **Frontend** | React + TypeScript, Tailwind, Vite |
| **Backend** | Python (FastAPI) |
| **Playback** | Gapless crossfade, background persistence |
| **Multi-room** | Future (Sonos/AirPlay), abstracted from start |
| **Spotify Sync** | Periodic or real-time (user choice) |
| **Purchases** | Bandcamp (one-click, wishlist, auto-import) |
| **Users** | Multi-user with separate profiles |
| **Deployment** | Docker on OpenMediaVault, GPU passthrough |
| **Album Art** | Extract to files during indexing |
| **Lyrics** | Full support (fetch external, display synced) |
| **Mobile** | PWA first, native later if needed |
| **Scrobbling** | Last.fm integration (optional) |
| **Library Write-back** | User choice (default off) |
| **Playlist Sharing** | Export/import via .familiar file, identity-based matching |
| **Music Videos** | yt-dlp download (full video / audio-only / stream-only) |
| **Listening Sessions** | WebRTC streaming, public guests, host control with handoff |
| **Priority** | Analysis foundation first |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │   Chat UI       │  │  Player UI      │  │  Library Browser        │  │
│  │   (React)       │  │  (Web Audio)    │  │  (Search/Browse)        │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │               │
│           └────────────────────┼────────────────────────┘               │
│                                │                                         │
│                    ┌───────────▼───────────┐                            │
│                    │   Media Session API   │                            │
│                    │   + Audio Worklet     │                            │
│                    └───────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ WebSocket + REST
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                    │
│                         (FastAPI + WebSocket)                           │
└─────────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   LLM       │ │  Playback   │ │  Library    │ │  Spotify    │
│   Service   │ │  Service    │ │  Service    │ │  Service    │
│             │ │             │ │             │ │             │
│ Claude API  │ │ Queue mgmt  │ │ Search      │ │ Sync        │
│ Ollama      │ │ Streaming   │ │ Metadata    │ │ History     │
│ Tool exec   │ │ Output ctrl │ │ Analysis    │ │ Recommend   │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
         │              │              │              │
         └──────────────┼──────────────┼──────────────┘
                        ▼              ▼
              ┌─────────────┐ ┌─────────────────────┐
              │  PostgreSQL │ │  Vector DB          │
              │             │ │  (pgvector)         │
              │  - Users    │ │                     │
              │  - Tracks   │ │  - Audio embeddings │
              │  - Playlists│ │  - Similarity index │
              │  - History  │ │                     │
              └─────────────┘ └─────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Analysis   │ │  File       │ │  Bandcamp   │
│  Workers    │ │  Watcher    │ │  Importer   │
│  (GPU)      │ │             │ │             │
│             │ │ New files   │ │ Download    │
│ Embeddings  │ │ Changes     │ │ purchases   │
│ Features    │ │ Deletions   │ │             │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## UI Layout

### Desktop Layout
```
┌─────────────────────────────────────────────────────────┐
│  Chat                    │ [Context] [Library] [Playlists] │
│                          ├──────────────────────────────│
│  [conversation]          │                              │
│                          │  Contextual panel (default)  │
│                          │  - LLM search results        │
│                          │  - Playlist being built      │
│                          │  - Queue                     │
│                          │  Direct manipulation enabled │
│                          │                              │
│  [input]                 │                              │
├──────────────────────────┴──────────────────────────────┤
│  ▶ Now Playing Bar (click art → full player)            │
└─────────────────────────────────────────────────────────┘
```

**Key behaviors:**
- Chat on left is the primary interaction mode
- Right panel defaults to contextual view (LLM controls what's shown)
- Tabs allow direct access to Library and Playlists
- Right panel supports direct manipulation (drag reorder, click to remove/add)
- LLM can react to manual edits in the contextual panel
- Now Playing bar fixed at bottom, always visible

### Mobile Layout
```
┌─────────────────────────┐
│ ▶ Mini Player           │  → tap for full player
├─────────────────────────┤
│                         │
│  Chat (primary)         │
│                         │
├─────────────────────────┤
│ ☰ Nav (library, etc.)   │
└─────────────────────────┘
```

**Key behaviors:**
- Chat-first experience, library browsing is secondary
- Mini player at top, expands to full player on tap
- Bottom nav for accessing library, playlists, settings

### Full Player View (both platforms)
```
┌─────────────────────────────────┐
│  ┌───────────────────────────┐  │
│  │                           │  │
│  │   R3F Audio Visualizer    │  │
│  │   + Synced Lyrics Overlay │  │
│  │                           │  │
│  └───────────────────────────┘  │
│  Track: Song Name - Artist      │
│  BPM: 124 | Key: Am | Mood: 🔥  │
│  ━━━━━━━━●━━━━━━━━━ 2:34/4:12   │
│  ◀◀    ▶    ▶▶    🔀    🔁      │
├─────────────────────────────────┤
│  Up Next (queue preview)        │
│  ├ Track 2                      │
│  ├ Track 3                      │
│  └ Track 4                      │
├─────────────────────────────────┤
│  Similar Tracks                 │
│  ├ Suggestion 1                 │
│  └ Suggestion 2                 │
└─────────────────────────────────┘
```

**Key features:**
- React Three Fiber (R3F) audio visualizer fed by Web Audio API analysis
- Synced lyrics overlaid on visualizer
- Track metadata display (BPM, key, mood/energy)
- Queue preview
- Similar tracks suggestions (from embedding similarity)

---

## Listening Sessions (Remote Listening Party)

Invite friends to listen with you in real-time — even if they don't have Familiar.

### Concept

Host streams audio from their Familiar instance via WebRTC. Guests join via a simple link, hear the audio, see what's playing, and can chat. Only Familiar users can host or DJ; anyone with a browser can listen.

### Architecture

```
                                    Public Internet
                                          │
    ┌─────────────────────────────────────┼─────────────────────────────────────┐
    │                                     │                                     │
    │   ┌─────────────────┐               │               ┌─────────────────┐   │
    │   │   Host Browser  │               │               │  Guest Browser  │   │
    │   │   (Familiar UI) │               │               │  (Lightweight)  │   │
    │   │                 │◄──────────────┼──────────────►│                 │   │
    │   │   Full app      │    WebRTC     │    WebRTC     │   Listen-only   │   │
    │   │   DJ controls   │    Audio +    │    Audio +    │   + chat        │   │
    │   │                 │    Data       │    Data       │                 │   │
    │   └────────┬────────┘               │               └────────┬────────┘   │
    │            │                        │                        │            │
    │            │ WebSocket              │                        │            │
    │            │ (auth'd)               │                        │            │
    │            ▼                        │                        │            │
    │   ┌──────────────────┐              │                        │            │
    │   │ Familiar Backend │              │                        │            │
    │   │ (your network)   │              │                        │            │
    │   └────────┬─────────┘              │                        │            │
    │            │                        │                        │            │
    └────────────┼────────────────────────┼────────────────────────┼────────────┘
                 │                        │                        │
                 ▼                        ▼                        ▼
    ┌──────────────────────────────────────────────────────────────────────────┐
    │              Public Session Service (lightweight)                         │
    │   ┌─────────────────────────────────────────────────────────────────┐    │
    │   │  Signaling Server (WebSocket)                                   │    │
    │   │  - Session state (current track, participants)                  │    │
    │   │  - WebRTC handshake (SDP exchange, ICE candidates)              │    │
    │   │  - Chat relay (fallback when P2P data channel fails)           │    │
    │   └─────────────────────────────────────────────────────────────────┘    │
    │   ┌─────────────────────────────────────────────────────────────────┐    │
    │   │  TURN Server (coturn)                                           │    │
    │   │  - WebRTC relay when P2P fails (~10-20% of connections)         │    │
    │   └─────────────────────────────────────────────────────────────────┘    │
    │   ┌─────────────────────────────────────────────────────────────────┐    │
    │   │  Guest Web Page (static)                                        │    │
    │   │  - listen.familiar.app/SESSION_CODE                             │    │
    │   │  - Minimal JS: WebRTC audio + chat UI                           │    │
    │   └─────────────────────────────────────────────────────────────────┘    │
    └──────────────────────────────────────────────────────────────────────────┘
```

### User Flows

**Host creates session:**
1. Click "Start Listening Session" in Familiar
2. Optionally name the session
3. Get shareable link: `listen.familiar.app/VIBE-7X3K`
4. Share link however you want (text, Discord, etc.)
5. Play music — audio streams to all connected guests

**Guest joins session:**
1. Open link in any browser — no install, no account
2. Enter display name
3. WebRTC connects to host
4. Hear audio, see track info, chat with others

**Host handoff:**
1. Host clicks "Pass Host to..." → selects participant
2. Backend verifies new host has Familiar account
3. Audio source switches to new host's browser
4. Original host becomes a listener

### Guest UI (Minimal Web Page)

```
┌─────────────────────────────────────────┐
│  🎧 jeff's Listening Session            │
├─────────────────────────────────────────┤
│                                         │
│      ┌─────────────────────┐            │
│      │    Album Art        │            │
│      │                     │            │
│      └─────────────────────┘            │
│                                         │
│      Windowlicker                       │
│      Aphex Twin                         │
│      ━━━━━━●━━━━━━━━ 2:34               │
│                                         │
├─────────────────────────────────────────┤
│  👑 jeff (host) · alex · sam · you      │
├─────────────────────────────────────────┤
│  alex: this track is insane             │
│  jeff: wait for the drop                │
│                                         │
│  [your message...          ] [Send]     │
└─────────────────────────────────────────┘
```

### Host UI (In Familiar)

```
┌─────────────────────────────────────────┐
│  🎧 Listening Session: "Late Night"     │
│  Host: you                              │
│  Share: listen.familiar.app/VIBE-7X3K  │
├─────────────────────────────────────────┤
│  Now Playing:                           │
│  Windowlicker - Aphex Twin              │
│  ━━━━━━●━━━━━━━━ 2:34/6:07              │
│                                         │
│  ▶  ▶▶  🔀  🔁   [Queue...]             │
├─────────────────────────────────────────┤
│  Listeners (3):                         │
│  👑 you (host)                          │
│  ○ alex                                 │
│  ○ sam                                  │
├─────────────────────────────────────────┤
│  Chat:                                  │
│  alex: this track is insane             │
│  jeff: wait for the drop                │
│  sam: 🔥🔥🔥                            │
│  [message input____________] [Send]     │
├─────────────────────────────────────────┤
│  [Pass Host to...▼] [End Session]       │
└─────────────────────────────────────────┘
```

### Technical Implementation

**Host-side (Familiar frontend):**
```typescript
class ListeningSessionHost {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private audioContext: AudioContext;
  private mediaStreamDestination: MediaStreamAudioDestinationNode;

  async startSession(sessionCode: string) {
    // Capture audio output from Web Audio API
    this.mediaStreamDestination = this.audioContext.createMediaStreamDestination();
    this.audioEngine.connectToDestination(this.mediaStreamDestination);

    // Connect to signaling server
    this.signaling = new WebSocket(`wss://signal.familiar.app/host/${sessionCode}`);
    this.signaling.onmessage = this.handleSignaling.bind(this);
  }

  async addGuest(guestId: string, offer: RTCSessionDescriptionInit) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:turn.familiar.app:3478', username: '...', credential: '...' }
      ]
    });

    // Add audio track
    const stream = this.mediaStreamDestination.stream;
    stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));

    // Create data channel for chat + sync
    const dataChannel = pc.createDataChannel('control');
    dataChannel.onmessage = (e) => this.handleDataMessage(guestId, e.data);

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.peerConnections.set(guestId, pc);
    this.signaling.send(JSON.stringify({ type: 'answer', guestId, answer }));
  }

  broadcastTrackChange(track: Track) {
    const message = JSON.stringify({
      type: 'track',
      title: track.title,
      artist: track.artist,
      album: track.album,
      artworkUrl: track.artworkUrl
    });

    for (const [guestId, pc] of this.peerConnections) {
      pc.dataChannel?.send(message);
    }
  }
}
```

**Guest-side (minimal standalone page):**
```typescript
class ListeningSessionGuest {
  private pc: RTCPeerConnection;
  private audioElement: HTMLAudioElement;

  async join(sessionCode: string, displayName: string) {
    this.signaling = new WebSocket(`wss://signal.familiar.app/guest/${sessionCode}`);

    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:turn.familiar.app:3478', username: '...', credential: '...' }
      ]
    });

    // Receive audio
    this.pc.ontrack = (event) => {
      this.audioElement.srcObject = event.streams[0];
      this.audioElement.play();
    };

    // Receive data channel
    this.pc.ondatachannel = (event) => {
      event.channel.onmessage = (e) => this.handleMessage(JSON.parse(e.data));
    };

    // Create and send offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.signaling.send(JSON.stringify({ type: 'offer', displayName, offer }));
  }

  handleMessage(msg: any) {
    if (msg.type === 'track') {
      this.updateNowPlaying(msg);
    } else if (msg.type === 'chat') {
      this.addChatMessage(msg);
    }
  }
}
```

**Signaling server (Cloudflare Worker or similar):**
```typescript
// Minimal signaling server - just relays WebRTC handshake messages
// Sessions are ephemeral - stored in memory / Durable Objects

interface Session {
  code: string;
  hostConnection: WebSocket;
  guests: Map<string, { ws: WebSocket; displayName: string }>;
  currentTrack?: { title: string; artist: string; artworkUrl: string };
}

// Relay offer from guest to host
// Relay answer from host to guest
// Relay ICE candidates both directions
// Broadcast participant list changes
```

### Infrastructure Requirements

| Component | Hosting | Cost |
|-----------|---------|------|
| Signaling server | Cloudflare Workers / Deno Deploy | Free tier |
| TURN server | Small VPS running coturn | ~$5/mo |
| Guest page | Cloudflare Pages / Vercel | Free |
| Domain | `listen.familiar.app` or similar | ~$12/yr |

### Session Data Model

Sessions are ephemeral (not persisted to Familiar's database). The signaling server holds session state in memory:

```typescript
interface SessionState {
  code: string;              // "VIBE-7X3K"
  hostUserId: string;        // Familiar user ID
  hostDisplayName: string;

  participants: Array<{
    id: string;              // Connection ID
    displayName: string;
    isHost: boolean;
    isFamiliarUser: boolean; // Can become host
  }>;

  currentTrack?: {
    title: string;
    artist: string;
    album: string;
    artworkUrl: string;      // Proxied through Familiar backend
  };

  createdAt: Date;
}
```

### Security Considerations

- **Audio is ephemeral** — streamed live, not stored on signaling server
- **No authentication for guests** — just display name, intentionally frictionless
- **Host verified** — only authenticated Familiar users can create/host sessions
- **Artwork proxied** — album art served through Familiar backend, not exposing local paths
- **Rate limiting** — signaling server limits sessions per IP, participants per session
- **Session expiry** — auto-end after 8 hours or when host disconnects

### Phase Placement

This feature fits best in **Phase 5 (Polish)** since it:
- Requires the audio engine from Phase 2
- Is a "nice to have" social feature, not core functionality
- Needs external infrastructure (signaling server, TURN)

---

## Music Videos (yt-dlp Integration)

Familiar can download official music videos from YouTube to enhance the full player experience.

### Use Case

Visual enhancement for tracks you already own — watch the music video instead of (or alongside) the visualizer.

### Download Options (per-download)

- **Full video** — HD or SD quality choice
- **Audio only** — Extract audio, discard video
- **Stream only** — Play without saving (future)

### Storage Management (user settings)

- Video cache size limit (10GB, 50GB, unlimited)
- Auto-prune policy: oldest first, least played, or manual only
- "Delete video, keep mapping" — removes file but remembers YouTube ID for re-download

### Matching

1. Search YouTube for `"{artist} - {title}" official video`
2. User confirms match before downloading
3. Cache video→track mapping to avoid re-searching

### Full Player Toggle

```
[ Visualizer ] [ Music Video ] [ Lyrics ]
```

Falls back to visualizer if no video available.

### Schema

```sql
CREATE TABLE track_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    
    source VARCHAR(50) NOT NULL,       -- 'youtube', 'vimeo', etc.
    source_id VARCHAR(100) NOT NULL,   -- YouTube video ID
    source_url VARCHAR(500),           -- Original URL
    
    file_path VARCHAR(1000),           -- Local path if downloaded (NULL if not downloaded)
    is_audio_only BOOLEAN DEFAULT FALSE,
    
    video_metadata JSONB,              -- {title, duration, resolution, channel, etc.}
    
    match_confidence FLOAT,            -- How confident we are this is the right video
    user_confirmed BOOLEAN DEFAULT FALSE,
    
    downloaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(track_id, source, source_id)
);

CREATE INDEX idx_track_videos_track ON track_videos(track_id);
```

### Implementation Notes

- Use `yt-dlp` Python library (not subprocess) for better integration
- Store videos in `/data/videos/{track_id}.{ext}`
- Respect YouTube rate limits
- Background download queue (don't block UI)

---

## Playlist Sharing (Future Feature)

Share playlists with other Familiar users, even with different local libraries.

### Export Format

```json
{
  "familiar_version": 1,
  "playlist": {
    "name": "Late Night Coding",
    "description": "Focus music for 2am sessions",
    "created_by": "jeff",
    "created_at": "2025-12-20T02:30:00Z"
  },
  "tracks": [
    {
      "position": 1,
      "identifiers": {
        "musicbrainz_recording_id": "abc123",
        "isrc": "USRC12345678",
        "acoustid": "xyz789"
      },
      "metadata": {
        "title": "Windowlicker",
        "artist": "Aphex Twin",
        "album": "Windowlicker EP",
        "duration_seconds": 378
      }
    }
  ]
}
```

### Import Matching Priority

1. **MusicBrainz Recording ID** — exact match (most reliable)
2. **ISRC** — exact match
3. **AcoustID fingerprint** — audio fingerprint match
4. **Fuzzy metadata** — title + artist similarity > 90%

### Sharing Methods

**Phase 1:** File export (`.familiar` file) — download and send however you want

**Future:** Cloud sharing via lightweight relay or Tailscale Funnel — TBD based on real usage

### Open Questions (TBD)

- UX for missing tracks during import
- Integration with "Want to Buy" / Bandcamp recommendations
- Collaborative playlists

---

## Handling Compilations & Soundtracks

Traditional music players handle compilations and soundtracks awkwardly because they force everything into an Artist → Album hierarchy. Familiar handles this properly:

### Album Types

Every album is classified:
- `album` — Standard artist release
- `ep` / `single` — Shorter releases
- `compilation` — Various artists collection
- `soundtrack` — Film/game/TV soundtrack
- `live` — Live recordings

**Auto-detection:** If an album has 3+ different track artists, it's likely a compilation. MusicBrainz enrichment can confirm/override.

### Artist vs Album Artist

Two distinct fields:
- `album_artist` — Who the album "belongs to" (e.g., "Various Artists", "TRON: Legacy Soundtrack")
- `artist` — Who performed the specific track

### Artist Browser: "Albums" vs "Appears On"

When browsing an artist:
```
┌─────────────────────────────────┐
│  Daft Punk                      │
├─────────────────────────────────┤
│  Albums (3)                     │
│  ├ Discovery                    │
│  ├ Random Access Memories       │
│  └ Homework                     │
├─────────────────────────────────┤
│  Appears On (7)                 │
│  ├ TRON: Legacy (Soundtrack)    │
│  ├ Space Jam 2 (Compilation)    │
│  └ ...                          │
└─────────────────────────────────┘
```

This keeps the artist view clean while still surfacing all their work.

### Library Browser Sections

Top-level filters in the Library tab:
- All Albums
- Compilations
- Soundtracks

### LLM Awareness

The LLM understands these distinctions and can handle queries like:
- "Play the Drive soundtrack"
- "Songs by Kavinsky, including soundtrack appearances"
- "90s compilations"
- "Tracks where Bowie appears but isn't the main artist"

---

## Playlist Sharing

Different Familiar instances have different local libraries, so sharing playlists requires identity-based matching rather than file matching.

### Export Format

Shareable playlists contain multiple identifiers per track for best matching:

```json
{
  "familiar_version": 1,
  "playlist": {
    "name": "Late Night Coding",
    "description": "Focus music for 2am sessions",
    "created_by": "jeff",
    "created_at": "2025-12-20T02:30:00Z"
  },
  "tracks": [
    {
      "position": 1,
      "identifiers": {
        "musicbrainz_recording_id": "abc123",
        "isrc": "USRC12345678",
        "acoustid": "xyz789"
      },
      "metadata": {
        "title": "Windowlicker",
        "artist": "Aphex Twin",
        "album": "Windowlicker EP",
        "duration_seconds": 378
      }
    }
  ]
}
```

### Matching Priority

When importing, try to match each track:
1. **MusicBrainz ID** — exact match (most reliable)
2. **ISRC** — exact match  
3. **AcoustID** — fingerprint match
4. **Fuzzy metadata** — title + artist similarity > 90%

### Import UX

Show match results before importing:
- ✓ Found in library
- ✗ Not found (offer Bandcamp search)
- ? Partial match (let user confirm)

Missing tracks can be added to "Want to Buy" list for Bandcamp recommendations.

### Sharing Methods

- **File export** — Download `.familiar` file, share via any method
- **Share link** — `familiar.app/p/abc123` (requires lightweight cloud service, future)
- **QR code** — For in-person sharing

---

## Music Videos (yt-dlp Integration)

Visual enhancement for tracks — download official music videos to display in the full player.

### Download Options (user choice per video)

| Option | Storage | Use Case |
|--------|---------|----------|
| **Full video** | ~100MB+ per video | Best quality, offline viewing |
| **Audio only** | ~10MB per track | Just want the audio version |
| **Stream only** | None | No storage, requires internet |

### Storage Management

User settings:
- Max video cache size (e.g., 10GB)
- Auto-prune policy: oldest first, least played, or manual only
- Per-video delete option

### Matching Flow

1. Search YouTube: `"{artist} - {title}" official video`
2. Present top results to user for confirmation
3. Download on confirmation
4. Cache video→track mapping to avoid re-searching

### Player Integration

Full player toggle between:
- **Visualizer** — R3F audio visualizer (default)
- **Music Video** — If downloaded/available
- **Lyrics** — Synced lyrics display

Falls back to visualizer if no video available.

### Schema

```sql
CREATE TABLE track_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    
    source VARCHAR(50) NOT NULL,       -- 'youtube', 'vimeo', etc.
    source_id VARCHAR(100) NOT NULL,   -- YouTube video ID
    source_url VARCHAR(500),           -- Original URL
    
    -- Local storage (NULL if stream-only)
    file_path VARCHAR(1000),
    is_audio_only BOOLEAN DEFAULT FALSE,
    file_size_bytes BIGINT,
    
    -- Metadata from source
    video_metadata JSONB,              -- {title, duration, resolution, channel, ...}
    
    -- User interaction
    match_confirmed_by UUID REFERENCES users(id),
    downloaded_at TIMESTAMP,
    last_played_at TIMESTAMP,
    
    UNIQUE(track_id, source, source_id)
);

CREATE INDEX idx_track_videos_track ON track_videos(track_id);
CREATE INDEX idx_track_videos_last_played ON track_videos(last_played_at);
```

---

## Technology Stack

### Backend (Python)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Web Framework** | FastAPI | Async, WebSocket support, automatic OpenAPI |
| **Task Queue** | Celery + Redis | Background analysis jobs, GPU worker isolation |
| **Database** | PostgreSQL + pgvector | Relational data + vector similarity in one DB |
| **Audio Analysis** | essentia, librosa | Industry standard, GPU-accelerated options |
| **Embeddings** | CLAP or MusicGen encoder | State-of-art audio-to-embedding models |
| **Fingerprinting** | chromaprint (AcoustID) | Industry standard for audio identification |
| **Metadata** | musicbrainzngs | Python MusicBrainz client |
| **Audio Decode** | ffmpeg (via subprocess) | Universal format support |
| **Video Download** | yt-dlp | YouTube video/audio extraction |
| **Lyrics** | Musixmatch API, LRCLIB | Synced lyrics fetching |
| **Scrobbling** | pylast | Last.fm integration |
| **LLM (Claude)** | anthropic SDK | Official SDK with tool-use support |
| **LLM (Ollama)** | ollama-python | Local LLM fallback |

### Frontend

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Framework** | React + TypeScript | Strong ecosystem for audio/visualization, type safety |
| **Build Tool** | Vite | Fast HMR, modern ESM-first approach |
| **State** | Zustand | Simple, no boilerplate |
| **Audio** | Web Audio API + Audio Worklet | Gapless crossfade, background play |
| **Visualizer** | React Three Fiber (R3F) | 3D audio visualizer with lyrics overlay |
| **Styling** | Tailwind CSS | Rapid iteration, utility-first |
| **Chat UI** | Custom (not off-the-shelf) | Full control over UX |
| **API Client** | TanStack Query | Caching, real-time updates |

### Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Containers** | Docker Compose | Multi-service orchestration |
| **GPU Access** | NVIDIA Container Toolkit | GPU passthrough for analysis |
| **Reverse Proxy** | Traefik or Caddy | SSL, routing |
| **File Watching** | watchdog | Detect library changes |

---

## Phase 1: Foundation & Audio Analysis Pipeline

**Goal**: Build the indexing and analysis system that will power all LLM interactions.

**Duration**: 3-4 weeks

### 1.1 Project Setup

- [ ] Initialize monorepo structure
  ```
  familiar/
  ├── backend/
  │   ├── api/           # FastAPI app
  │   ├── workers/       # Celery workers
  │   ├── lib/           # Shared code
  │   └── tests/
  ├── frontend/
  │   ├── src/
  │   └── public/
  ├── docker/
  │   ├── Dockerfile.api
  │   ├── Dockerfile.worker
  │   └── Dockerfile.frontend
  ├── docker-compose.yml
  └── README.md
  ```
- [ ] Docker Compose setup with:
  - PostgreSQL + pgvector extension
  - Redis
  - API service
  - Worker service (GPU-enabled)
  - Frontend dev server
- [ ] GPU passthrough configuration for OMV
- [ ] Basic CI (lint, test) with GitHub Actions

### 1.2 Database Strategy

**Goal:** Avoid migration hell during development while maintaining data integrity.

#### Hybrid Schema Approach

| Data Type | Storage | Rationale |
|-----------|---------|-----------|
| Core entities (tracks, users, playlists) | Typed columns | Stable, relational integrity, foreign keys |
| Audio features | JSONB | Evolves constantly, no migrations needed |
| Embeddings | pgvector column | Required for similarity search |
| Spotify data | JSONB | API responses change, flexible structure |
| User settings/preferences | JSONB | Flexible, user-specific options |

#### Dev Workflow (No Migrations)

During active development:
1. Edit SQLAlchemy models
2. Run `make reset-db` (drops and recreates all tables)
3. Re-run analysis on test subset

```makefile
# Makefile
reset-db:
	docker-compose down -v
	docker-compose up -d postgres
	sleep 3
	docker-compose exec api python -m app.db.init
```

#### Pre-Production Migration Path

When approaching production or needing to preserve data:
1. Freeze schema design
2. Generate migration: `alembic revision --autogenerate -m "description"`
3. Review and adjust generated migration
4. Test migration on copy of production data

#### Versioned Analysis

Since re-analysis is expected (model updates, new features), track versions:

```python
class TrackAnalysis(Base):
    id: UUID
    track_id: UUID  # FK to tracks
    version: int    # Bump when analysis pipeline changes
    features: dict  # JSONB - flexible feature storage
    embedding: Vector(512)
    created_at: datetime
    
    __table_args__ = (
        UniqueConstraint('track_id', 'version'),
    )
```

When the analysis pipeline changes:
1. Bump `ANALYSIS_VERSION` constant
2. Re-run analysis (creates new version records)
3. Old versions stay for comparison or can be pruned

### 1.3 Database Schema

```sql
-- Album type enum for proper handling of compilations/soundtracks
CREATE TYPE album_type AS ENUM ('album', 'ep', 'single', 'compilation', 'soundtrack', 'live');

-- Users and auth
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    settings JSONB DEFAULT '{}'
);

-- Core track data
CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path VARCHAR(1000) UNIQUE NOT NULL,
    file_hash VARCHAR(64) NOT NULL,  -- For detecting changes
    
    -- Basic metadata
    title VARCHAR(500),
    artist VARCHAR(500),              -- Track performer
    album VARCHAR(500),
    album_artist VARCHAR(500),        -- Album-level artist (e.g., "Various Artists")
    album_type album_type DEFAULT 'album',
    track_number INTEGER,
    disc_number INTEGER,
    year INTEGER,
    genre VARCHAR(255),
    
    -- Technical metadata
    duration_seconds FLOAT,
    sample_rate INTEGER,
    bit_depth INTEGER,
    bitrate INTEGER,
    format VARCHAR(10),
    
    -- External IDs
    musicbrainz_track_id VARCHAR(36),
    musicbrainz_artist_id VARCHAR(36),
    musicbrainz_album_id VARCHAR(36),
    acoustid VARCHAR(100),
    
    -- Analysis status
    analysis_version INTEGER DEFAULT 0,
    analyzed_at TIMESTAMP,
    
    -- Timestamps
    file_modified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient album_type filtering
CREATE INDEX idx_tracks_album_type ON tracks(album_type);
CREATE INDEX idx_tracks_album_artist ON tracks(album_artist);

-- Versioned analysis with JSONB features (avoids migration hell)
-- When analysis pipeline changes, bump version and re-analyze
CREATE TABLE track_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,         -- Analysis pipeline version
    
    -- JSONB for flexible, evolving features (no migrations needed)
    -- Example contents: {"bpm": 124.5, "key": "Am", "energy": 0.87, ...}
    features JSONB NOT NULL DEFAULT '{}',
    
    -- Vector embedding for similarity search (stable structure)
    embedding vector(512),            -- CLAP produces 512-dim embeddings
    
    -- Fingerprint for identification
    acoustid VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(track_id, version)
);

-- Index for fast similarity search
CREATE INDEX idx_analysis_embedding ON track_analysis USING ivfflat (embedding vector_cosine_ops);

-- Index for querying by version
CREATE INDEX idx_analysis_version ON track_analysis(version);

-- GIN index for JSONB feature queries (e.g., WHERE features->>'bpm' > 120)
CREATE INDEX idx_analysis_features ON track_analysis USING GIN (features);

-- View to get latest analysis for each track
CREATE VIEW track_latest_analysis AS
SELECT DISTINCT ON (track_id) *
FROM track_analysis
ORDER BY track_id, version DESC;

-- Playlists
CREATE TABLE playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_auto_generated BOOLEAN DEFAULT FALSE,
    generation_prompt TEXT,   -- The prompt that created this playlist
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE playlist_tracks (
    playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (playlist_id, track_id)
);

-- Listening history (per user)
CREATE TABLE listening_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
    played_at TIMESTAMP DEFAULT NOW(),
    play_duration_seconds FLOAT,  -- How much they actually listened
    source VARCHAR(50),           -- 'local', 'spotify', etc.
    context JSONB                 -- playlist_id, search query, etc.
);

-- Spotify sync data (per user)
CREATE TABLE spotify_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    spotify_user_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    sync_mode VARCHAR(20) DEFAULT 'periodic',  -- 'periodic' or 'realtime'
    last_sync_at TIMESTAMP,
    settings JSONB DEFAULT '{}'  -- User-specific Spotify sync preferences
);

CREATE TABLE spotify_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    spotify_track_id VARCHAR(255) NOT NULL,
    matched_track_id UUID REFERENCES tracks(id),  -- NULL if not in local library
    
    -- JSONB for Spotify API data (structure may change)
    track_data JSONB NOT NULL,  -- {name, artist, album, isrc, ...}
    
    added_at TIMESTAMP,
    synced_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, spotify_track_id)
);
```

### 1.3 Audio Analysis Pipeline

#### File Discovery & Monitoring

```python
# Watcher service that detects new/changed/deleted files
class LibraryWatcher:
    def __init__(self, library_paths: list[Path], db: Database, queue: TaskQueue):
        self.library_paths = library_paths
        self.db = db
        self.queue = queue
    
    async def full_scan(self):
        """Initial scan of entire library"""
        for path in self.library_paths:
            for file in path.rglob("*"):
                if file.suffix.lower() in {".mp3", ".flac", ".m4a", ".aac"}:
                    await self.process_file(file)
    
    async def process_file(self, path: Path):
        """Check if file needs processing and queue if so"""
        file_hash = compute_hash(path)
        existing = await self.db.get_track_by_path(path)
        
        if not existing or existing.file_hash != file_hash:
            await self.queue.enqueue("analyze_track", {"path": str(path)})
```

#### Analysis Worker (GPU)

```python
# Worker that runs on GPU-enabled container
class AnalysisWorker:
    def __init__(self):
        self.clap_model = load_clap_model()  # For embeddings
        self.essentia_models = load_essentia_models()  # For features
    
    async def analyze_track(self, path: str) -> TrackAnalysis:
        # 1. Decode audio to numpy array
        audio, sr = decode_audio(path)
        
        # 2. Extract basic metadata from tags
        metadata = extract_metadata(path)
        
        # 3. Compute audio fingerprint for identification
        fingerprint = compute_chromaprint(audio, sr)
        
        # 4. Match against MusicBrainz if metadata is poor
        if needs_metadata_enrichment(metadata):
            mb_data = lookup_musicbrainz(fingerprint)
            metadata = merge_metadata(metadata, mb_data)
        
        # 5. Extract audio features (GPU-accelerated)
        features = self.extract_features(audio, sr)
        
        # 6. Generate embedding (GPU)
        embedding = self.clap_model.encode_audio(audio)
        
        return TrackAnalysis(
            metadata=metadata,
            features=features,
            embedding=embedding,
            fingerprint=fingerprint
        )
    
    def extract_features(self, audio: np.ndarray, sr: int) -> dict:
        """Returns a dict for JSONB storage - add new features without migrations"""
        return {
            # Rhythm
            "bpm": estimate_bpm(audio, sr),
            "bpm_confidence": estimate_bpm_confidence(audio, sr),
            "time_signature": estimate_time_signature(audio, sr),
            
            # Tonal
            "key": estimate_key(audio, sr),
            "mode": estimate_mode(audio, sr),
            "key_confidence": estimate_key_confidence(audio, sr),
            
            # Energy/mood (0-1 scale)
            "energy": compute_energy(audio),
            "valence": compute_valence(audio),
            "danceability": compute_danceability(audio),
            "acousticness": compute_acousticness(audio),
            "instrumentalness": compute_instrumentalness(audio),
            "speechiness": compute_speechiness(audio),
            
            # Spectral
            "spectral_centroid_mean": compute_spectral_centroid(audio, sr),
            "spectral_bandwidth_mean": compute_spectral_bandwidth(audio, sr),
            
            # Loudness
            "loudness_db": compute_loudness(audio),
            "dynamic_range_db": compute_dynamic_range(audio),
            
            # Easy to add new features later - no migration needed!
            # "new_experimental_feature": compute_something_new(audio),
        }
    
    async def save_analysis(self, track_id: UUID, features: dict, embedding: np.ndarray, fingerprint: str):
        """Save analysis with current pipeline version"""
        await self.db.execute("""
            INSERT INTO track_analysis (track_id, version, features, embedding, acoustid)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (track_id, version) DO UPDATE
            SET features = $3, embedding = $4, acoustid = $5, created_at = NOW()
        """, track_id, ANALYSIS_VERSION, features, embedding, fingerprint)
```

```python
# config.py
ANALYSIS_VERSION = 1  # Bump when analysis pipeline changes significantly
```

#### Analysis Models to Evaluate

| Model | Purpose | Size | Notes |
|-------|---------|------|-------|
| **CLAP** | Audio embeddings | ~600MB | Text-audio aligned, good for semantic search |
| **MERT** | Audio embeddings | ~300MB | Music-specific, may be better for similarity |
| **Essentia TensorFlow** | Feature extraction | ~100MB | BPM, key, mood classifiers |
| **Demucs** | Stem separation | ~1GB | For "find songs with similar bass line" |

**Recommendation**: Start with CLAP for embeddings (enables "find songs like X" and "find songs matching description Y") and Essentia for features. Add Demucs later if stem-based similarity proves valuable.

### 1.4 Metadata Enrichment

```python
class MetadataEnricher:
    async def enrich(self, track: Track, fingerprint: str) -> EnrichedMetadata:
        # 1. Try AcoustID lookup
        acoustid_results = await lookup_acoustid(fingerprint)
        
        if acoustid_results:
            # 2. Get full metadata from MusicBrainz
            mb_recording = await get_musicbrainz_recording(
                acoustid_results[0].recording_id
            )
            
            return EnrichedMetadata(
                title=mb_recording.title,
                artist=mb_recording.artist_credit,
                album=mb_recording.release.title,
                album_artist=mb_recording.release.artist_credit,
                album_type=mb_recording.release.release_group.type,  # album, compilation, soundtrack, etc.
                year=mb_recording.release.year,
                musicbrainz_ids={
                    "recording": mb_recording.id,
                    "artist": mb_recording.artist_id,
                    "release": mb_recording.release.id
                }
            )
        
        # 3. Fallback: use existing tags, clean them up
        return clean_existing_metadata(track)
    
    def detect_album_type(self, tracks_in_album: list[Track]) -> AlbumType:
        """Auto-detect album type based on track artists"""
        unique_artists = set(t.artist for t in tracks_in_album)
        album_artist = tracks_in_album[0].album_artist
        
        # If album_artist is "Various Artists" or similar
        if album_artist and album_artist.lower() in ["various artists", "various", "va"]:
            return AlbumType.COMPILATION
        
        # If 3+ different track artists, likely compilation
        if len(unique_artists) >= 3:
            return AlbumType.COMPILATION
        
        # Check for soundtrack indicators in album name
        album = tracks_in_album[0].album or ""
        soundtrack_keywords = ["soundtrack", "ost", "motion picture", "original score"]
        if any(kw in album.lower() for kw in soundtrack_keywords):
            return AlbumType.SOUNDTRACK
        
        return AlbumType.ALBUM
```

### 1.5 Deliverables for Phase 1

- [ ] Docker environment running on OMV
- [ ] Database with schema deployed
- [ ] File watcher detecting new/changed files
- [ ] Analysis worker processing queue
- [ ] Full library scan completes successfully
- [ ] All tracks have: metadata, features, embeddings
- [ ] Album type detection (album/compilation/soundtrack) working
- [ ] Album art extracted and optimized to `/art/{album_id}.jpg`
- [ ] Similarity search working (`find 10 most similar to track X`)
- [ ] Basic API endpoints:
  - `GET /tracks` - List/search tracks
  - `GET /tracks/{id}` - Track details with features
  - `GET /tracks/{id}/similar` - Similar tracks by embedding
  - `POST /library/scan` - Trigger full rescan

### 1.6 Implementation Notes for Claude Code

#### File Structure to Create

```
familiar/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app entry
│   │   ├── config.py            # Settings, ANALYSIS_VERSION
│   │   ├── db/
│   │   │   ├── __init__.py
│   │   │   ├── session.py       # Database connection
│   │   │   ├── models.py        # SQLAlchemy models
│   │   │   └── init.py          # Schema creation (dev mode)
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── tracks.py    # Track CRUD endpoints
│   │   │   │   ├── library.py   # Scan endpoints
│   │   │   │   └── health.py    # Health check
│   │   │   └── deps.py          # Dependency injection
│   │   ├── services/
│   │   │   ├── scanner.py       # File discovery
│   │   │   ├── watcher.py       # Watchdog integration
│   │   │   ├── analyzer.py      # Audio analysis
│   │   │   ├── metadata.py      # Tag extraction, MusicBrainz
│   │   │   └── artwork.py       # Album art extraction
│   │   └── workers/
│   │       ├── __init__.py
│   │       ├── celery.py        # Celery app config
│   │       └── tasks.py         # Analysis tasks
│   ├── tests/
│   ├── pyproject.toml
│   └── Makefile
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.worker
│   └── docker-compose.yml
├── data/                        # Mounted volumes (gitignored)
│   ├── music/                   # Music library (read-only mount)
│   ├── art/                     # Extracted artwork
│   └── videos/                  # Downloaded videos (Phase 5)
└── README.md
```

#### Key Dependencies (pyproject.toml)

```toml
[project]
name = "familiar"
version = "0.1.0"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.109.0",
    "uvicorn[standard]>=0.27.0",
    "sqlalchemy>=2.0.0",
    "asyncpg>=0.29.0",
    "pgvector>=0.2.0",
    "celery[redis]>=5.3.0",
    "watchdog>=4.0.0",
    "mutagen>=1.47.0",           # Audio metadata
    "pydub>=0.25.0",             # Audio processing
    "librosa>=0.10.0",           # Audio analysis
    "essentia-tensorflow>=2.1b6", # GPU-accelerated features
    "chromaprint>=1.5.0",        # AcoustID fingerprinting  
    "musicbrainzngs>=0.7.1",     # MusicBrainz API
    "pillow>=10.0.0",            # Image processing
    "httpx>=0.26.0",             # Async HTTP client
    "pydantic>=2.5.0",
    "pydantic-settings>=2.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "ruff>=0.1.0",
    "mypy>=1.8.0",
]
```

#### Start Here

1. Create the directory structure above
2. Set up `docker-compose.yml` with PostgreSQL + pgvector, Redis
3. Implement `backend/app/db/` — models and session
4. Run `make reset-db` to create tables
5. Implement `backend/app/services/scanner.py` — file discovery
6. Wire up Celery and implement basic analysis task
7. Add API routes for tracks

#### Testing a Subset

For faster iteration, test with a small subset of your library:

```python
# config.py
LIBRARY_PATHS = ["/data/music/test-subset"]  # ~100 tracks for dev
```

---

## Phase 2: Basic Playback & Library UI

**Goal**: Functional music player without AI features—browse, search, play, queue.

**Duration**: 2-3 weeks

### 2.1 Audio Playback Backend

```python
# Playback service manages queue and streaming
class PlaybackService:
    def __init__(self, db: Database):
        self.db = db
        self.sessions: dict[str, PlaybackSession] = {}
    
    async def create_session(self, user_id: str) -> PlaybackSession:
        session = PlaybackSession(user_id=user_id)
        self.sessions[session.id] = session
        return session
    
    async def get_stream_url(self, track_id: str, session_id: str) -> str:
        """Generate authenticated streaming URL"""
        track = await self.db.get_track(track_id)
        token = generate_stream_token(track_id, session_id)
        return f"/api/stream/{track_id}?token={token}"
    
    async def stream_track(self, track_id: str, range_header: str | None):
        """HTTP range request support for seeking"""
        track = await self.db.get_track(track_id)
        file_path = track.file_path
        
        # Support range requests for seeking
        if range_header:
            start, end = parse_range(range_header, file_size)
            return StreamingResponse(
                stream_file_range(file_path, start, end),
                headers={"Content-Range": f"bytes {start}-{end}/{file_size}"}
            )
        
        return StreamingResponse(stream_file(file_path))
```

### 2.2 Frontend Audio Engine

```typescript
// Audio engine using Web Audio API for gapless crossfade
class AudioEngine {
  private context: AudioContext;
  private currentSource: AudioBufferSourceNode | null = null;
  private nextSource: AudioBufferSourceNode | null = null;
  private gainCurrent: GainNode;
  private gainNext: GainNode;
  
  constructor() {
    this.context = new AudioContext();
    this.gainCurrent = this.context.createGain();
    this.gainNext = this.context.createGain();
    this.gainCurrent.connect(this.context.destination);
    this.gainNext.connect(this.context.destination);
  }
  
  async loadTrack(url: string): Promise<AudioBuffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return this.context.decodeAudioData(arrayBuffer);
  }
  
  async play(url: string) {
    const buffer = await this.loadTrack(url);
    this.currentSource = this.context.createBufferSource();
    this.currentSource.buffer = buffer;
    this.currentSource.connect(this.gainCurrent);
    this.currentSource.start();
    
    // Register with Media Session API
    this.updateMediaSession();
  }
  
  async crossfadeTo(url: string, duration: number = 3) {
    const buffer = await this.loadTrack(url);
    const now = this.context.currentTime;
    
    // Prepare next track
    this.nextSource = this.context.createBufferSource();
    this.nextSource.buffer = buffer;
    this.nextSource.connect(this.gainNext);
    
    // Crossfade
    this.gainCurrent.gain.setValueAtTime(1, now);
    this.gainCurrent.gain.linearRampToValueAtTime(0, now + duration);
    this.gainNext.gain.setValueAtTime(0, now);
    this.gainNext.gain.linearRampToValueAtTime(1, now + duration);
    
    this.nextSource.start(now);
    
    // Swap after crossfade
    setTimeout(() => {
      this.currentSource?.stop();
      this.currentSource = this.nextSource;
      [this.gainCurrent, this.gainNext] = [this.gainNext, this.gainCurrent];
    }, duration * 1000);
  }
  
  private updateMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.currentTrack.title,
        artist: this.currentTrack.artist,
        album: this.currentTrack.album,
        artwork: [{ src: this.currentTrack.artworkUrl }]
      });
      
      navigator.mediaSession.setActionHandler('play', () => this.resume());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    }
  }
}
```

### 2.3 Frontend UI Components

#### Player Bar
- Play/pause, next/previous
- Progress bar with seeking
- Volume control
- Current track info + album art
- Queue preview

#### Library Browser
- Grid/list view toggle
- Top-level sections: Albums, Compilations, Soundtracks
- Sort by: artist, album, title, date added, recently played
- Filter by: genre, year, format, album type
- Search: instant search across metadata
- Artist view shows "Albums" vs "Appears On" separation

#### Queue Management
- Drag-and-drop reordering
- Clear queue
- Save queue as playlist
- Queue source indicator (manual, AI-generated, etc.)

### 2.4 User Authentication

```python
# Simple JWT-based auth
class AuthService:
    async def register(self, username: str, email: str, password: str) -> User:
        password_hash = hash_password(password)
        user = await self.db.create_user(username, email, password_hash)
        return user
    
    async def login(self, username: str, password: str) -> TokenPair:
        user = await self.db.get_user_by_username(username)
        if not user or not verify_password(password, user.password_hash):
            raise InvalidCredentials()
        
        return TokenPair(
            access_token=create_access_token(user.id),
            refresh_token=create_refresh_token(user.id)
        )
```

### 2.5 Deliverables for Phase 2

- [ ] Audio streaming endpoint with range support
- [ ] Frontend audio engine with gapless crossfade
- [ ] Media Session API integration (background play, lock screen controls)
- [ ] Library browser with search/filter
- [ ] Queue management
- [ ] User registration/login
- [ ] Basic settings page
- [ ] Album art display (embedded or fetched)

---

## Phase 3: LLM Integration & Conversational UI

**Goal**: The core AI experience—chat with your music library.

**Duration**: 3-4 weeks

### 3.1 Tool Definitions for Claude

```python
MUSIC_PLAYER_TOOLS = [
    {
        "name": "search_library",
        "description": "Search the user's music library by text query. Searches across title, artist, album, and genre.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query text"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max results to return",
                    "default": 20
                }
            },
            "required": ["query"]
        }
    },
    {
        "name": "find_similar_tracks",
        "description": "Find tracks sonically similar to a given track, using audio embeddings.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_id": {
                    "type": "string",
                    "description": "ID of the reference track"
                },
                "limit": {
                    "type": "integer",
                    "default": 10
                }
            },
            "required": ["track_id"]
        }
    },
    {
        "name": "find_tracks_by_description",
        "description": "Find tracks matching a natural language description using CLAP embeddings. E.g., 'upbeat electronic with heavy bass' or 'melancholic acoustic guitar'.",
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Natural language description of desired sound"
                },
                "limit": {
                    "type": "integer",
                    "default": 10
                }
            },
            "required": ["description"]
        }
    },
    {
        "name": "filter_tracks_by_features",
        "description": "Filter tracks by audio features like BPM, key, energy, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "bpm_min": {"type": "number"},
                "bpm_max": {"type": "number"},
                "key": {"type": "string", "description": "Musical key, e.g., 'C', 'F#m'"},
                "energy_min": {"type": "number", "minimum": 0, "maximum": 1},
                "energy_max": {"type": "number", "minimum": 0, "maximum": 1},
                "danceability_min": {"type": "number", "minimum": 0, "maximum": 1},
                "valence_min": {"type": "number", "minimum": 0, "maximum": 1},
                "valence_max": {"type": "number", "minimum": 0, "maximum": 1},
                "acousticness_min": {"type": "number", "minimum": 0, "maximum": 1},
                "instrumentalness_min": {"type": "number", "minimum": 0, "maximum": 1},
                "limit": {"type": "integer", "default": 50}
            }
        }
    },
    {
        "name": "get_user_listening_history",
        "description": "Get the user's recent listening history to understand their current preferences.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "How many days back to look",
                    "default": 30
                },
                "limit": {
                    "type": "integer",
                    "default": 100
                }
            }
        }
    },
    {
        "name": "get_user_favorites",
        "description": "Get tracks the user has explicitly marked as favorites or played most often.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "enum": ["local", "spotify", "both"],
                    "default": "both"
                },
                "limit": {"type": "integer", "default": 50}
            }
        }
    },
    {
        "name": "create_playlist",
        "description": "Create a new playlist with the specified tracks.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "description": {"type": "string"},
                "track_ids": {
                    "type": "array",
                    "items": {"type": "string"}
                }
            },
            "required": ["name", "track_ids"]
        }
    },
    {
        "name": "queue_tracks",
        "description": "Add tracks to the current playback queue.",
        "input_schema": {
            "type": "object",
            "properties": {
                "track_ids": {
                    "type": "array",
                    "items": {"type": "string"}
                },
                "position": {
                    "type": "string",
                    "enum": ["next", "end"],
                    "default": "end"
                },
                "clear_existing": {
                    "type": "boolean",
                    "default": false,
                    "description": "Clear the current queue before adding"
                }
            },
            "required": ["track_ids"]
        }
    },
    {
        "name": "control_playback",
        "description": "Control playback state.",
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["play", "pause", "next", "previous", "shuffle_on", "shuffle_off"]
                }
            },
            "required": ["action"]
        }
    },
    {
        "name": "get_library_stats",
        "description": "Get statistics about the user's library: total tracks, artists, albums, genres, etc.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    }
]
```

### 3.2 LLM Service

```python
class LLMService:
    def __init__(self, tools: list[dict], tool_executor: ToolExecutor):
        self.claude_client = anthropic.Anthropic()
        self.tools = tools
        self.tool_executor = tool_executor
        
    async def chat(
        self, 
        user_id: str, 
        message: str, 
        conversation_history: list[dict]
    ) -> AsyncIterator[str]:
        """Stream a response, executing tools as needed"""
        
        system_prompt = self.build_system_prompt(user_id)
        
        messages = conversation_history + [{"role": "user", "content": message}]
        
        while True:
            response = await self.claude_client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=system_prompt,
                tools=self.tools,
                messages=messages
            )
            
            # Yield text content as it comes
            for block in response.content:
                if block.type == "text":
                    yield {"type": "text", "content": block.text}
                elif block.type == "tool_use":
                    yield {"type": "tool_call", "name": block.name, "input": block.input}
                    
                    # Execute tool
                    result = await self.tool_executor.execute(
                        user_id, block.name, block.input
                    )
                    
                    yield {"type": "tool_result", "name": block.name, "result": result}
                    
                    # Add to messages for next iteration
                    messages.append({"role": "assistant", "content": response.content})
                    messages.append({
                        "role": "user",
                        "content": [{
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result)
                        }]
                    })
            
            if response.stop_reason == "end_turn":
                break
    
    def build_system_prompt(self, user_id: str) -> str:
        return """You are a knowledgeable music assistant helping the user discover and enjoy their personal music library.

You have access to tools that let you search the library, find similar tracks, filter by audio features, and control playback.

Guidelines:
- When the user asks for music, use tools to search and build a playlist, then queue it
- Explain your choices briefly—why these tracks fit what they asked for
- If you can't find exactly what they want, suggest alternatives
- You can combine multiple searches: e.g., find similar to X, then filter by BPM
- For mood/vibe requests, use find_tracks_by_description with natural language
- Consider the user's listening history when making recommendations
- If tracks are missing from the library, note this and later we can suggest purchases

Keep responses conversational but efficient. The user wants to listen to music, not read essays."""
```

### 3.3 Ollama Fallback

```python
class OllamaService:
    """Fallback LLM using local Ollama instance"""
    
    def __init__(self, model: str = "llama3:8b"):
        self.client = ollama.Client()
        self.model = model
    
    async def chat(self, user_id: str, message: str, history: list) -> AsyncIterator[str]:
        # Ollama's tool support is more limited
        # We'll use a ReAct-style prompt instead
        
        system = self.build_react_prompt()
        
        response = await self.client.chat(
            model=self.model,
            messages=[{"role": "system", "content": system}] + history + [{"role": "user", "content": message}],
            stream=True
        )
        
        async for chunk in response:
            # Parse for tool calls in output, execute, and continue
            yield chunk
```

### 3.4 Chat UI

```typescript
// Streaming chat with tool execution visibility
function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  const sendMessage = async () => {
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: input, history: messages }),
    });
    
    const reader = response.body.getReader();
    let assistantMessage = { role: 'assistant', content: '', toolCalls: [] };
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const events = parseSSE(value);
      for (const event of events) {
        if (event.type === 'text') {
          assistantMessage.content += event.content;
        } else if (event.type === 'tool_call') {
          assistantMessage.toolCalls.push({
            name: event.name,
            input: event.input,
            status: 'running'
          });
        } else if (event.type === 'tool_result') {
          // Update tool call status
          const call = assistantMessage.toolCalls.find(t => t.name === event.name);
          if (call) {
            call.status = 'complete';
            call.result = event.result;
          }
        }
        
        setMessages(prev => [...prev.slice(0, -1), { ...assistantMessage }]);
      }
    }
    
    setIsStreaming(false);
  };
  
  return (
    <div className="chat-container">
      <MessageList messages={messages} />
      <ChatInput 
        value={input} 
        onChange={setInput} 
        onSend={sendMessage}
        disabled={isStreaming}
      />
    </div>
  );
}

// Show tool calls inline so user sees what's happening
function ToolCallDisplay({ toolCall }) {
  return (
    <div className="tool-call">
      <span className="tool-name">{formatToolName(toolCall.name)}</span>
      {toolCall.status === 'running' && <Spinner />}
      {toolCall.result && (
        <div className="tool-result">
          Found {toolCall.result.tracks?.length} tracks
        </div>
      )}
    </div>
  );
}
```

### 3.5 Deliverables for Phase 3

- [ ] Tool definitions for all library operations
- [ ] LLM service with Claude integration
- [ ] Tool executor that calls backend services
- [ ] Streaming chat endpoint
- [ ] Ollama fallback (basic functionality)
- [ ] Chat UI with tool call visibility
- [ ] Conversation history persistence
- [ ] Settings toggle for Claude vs Ollama

---

## Phase 4: Spotify Integration & Purchase Discovery

**Goal**: Learn from Spotify listening habits, help discover music to purchase.

**Key constraint**: No unofficial APIs or scraping. All integrations use official APIs only.

### 4.1 Spotify Integration (Implemented)

OAuth flow and sync are already implemented:
- `backend/app/api/routes/spotify.py` - OAuth flow, sync endpoint
- `backend/app/services/spotify.py` - SpotifyService, SpotifySyncService
- `backend/app/db/models.py` - SpotifyProfile, SpotifyFavorite models

**Sync modes:**
- Saved tracks with `added_at` timestamps
- Top tracks (short/medium/long term) for listening frequency
- Matching to local library via ISRC, exact match, partial match

### 4.2 Purchase Discovery (Search Links)

Instead of integrating with store APIs (which don't exist for Bandcamp), we generate search URLs:

```python
# backend/app/services/search_links.py
STORES = {
    "bandcamp": "https://bandcamp.com/search?q={query}",
    "discogs": "https://www.discogs.com/search/?q={query}&type=all",
    "qobuz": "https://www.qobuz.com/search?q={query}",
    "7digital": "https://www.7digital.com/search?q={query}",
    "itunes": "https://music.apple.com/search?term={query}",
}
```

**API endpoint**: `GET /api/v1/spotify/unmatched`
- Returns unmatched Spotify favorites sorted by popularity (listening preference)
- Each track includes search links for all supported stores
- User clicks link → opens store in new tab → buys however they want

### 4.3 Music Import (Drag-Drop)

Simple, robust import workflow for purchased music:

```
User Flow:
1. User sees "Missing from Library" with search links
2. User buys music from Bandcamp/Discogs/wherever
3. User downloads zip file from store
4. User drags zip into Familiar import zone
5. Familiar extracts, moves to library, scans
6. Track appears in library, matched to Spotify favorite
```

**API endpoint**: `POST /api/v1/library/import`
- Accepts: zip files, individual audio files
- Extracts to `{MUSIC_LIBRARY_PATH}/_imports/{timestamp}/`
- Triggers scan of import folder
- Returns import results

### 4.4 LLM Tools

```python
SPOTIFY_TOOLS = [
    {
        "name": "get_spotify_favorites_not_in_library",
        "description": "Get tracks the user likes on Spotify but doesn't own locally, sorted by listening preference.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 20}
            }
        }
    }
]
```

### 4.5 What's NOT in Phase 4

- ❌ Bandcamp API integration (doesn't exist)
- ❌ Bandcamp scraping (unofficial, fragile)
- ❌ Auto-download from stores
- ❌ Wishlist sync with stores
- ❌ Price comparison across stores

### 4.6 Deliverables for Phase 4

- [x] Spotify OAuth connection flow
- [x] Periodic sync of saved tracks and top tracks
- [x] Local library matching (ISRC, metadata, partial)
- [x] Search links generation for stores
- [ ] "Missing from Library" UI with search buttons
- [ ] Drag-drop import for purchased music
- [ ] LLM tool for querying missing tracks

---

## Phase 5: Polish & Advanced Features

**Goal**: Production-ready quality, optional advanced features.

**Duration**: 2-4 weeks

### 5.1 Multi-Room Audio (Optional)

```python
class OutputManager:
    """Abstract audio output to support multiple targets"""
    
    def __init__(self):
        self.outputs: dict[str, AudioOutput] = {}
    
    async def register_output(self, output: AudioOutput):
        self.outputs[output.id] = output
    
    async def play_to(self, track_id: str, output_ids: list[str]):
        for output_id in output_ids:
            output = self.outputs[output_id]
            await output.play(track_id)

class SonosOutput(AudioOutput):
    """Sonos speaker output using SoCo library"""
    
    def __init__(self, speaker_ip: str):
        self.speaker = soco.SoCo(speaker_ip)
    
    async def play(self, stream_url: str):
        self.speaker.play_uri(stream_url)

class AirPlayOutput(AudioOutput):
    """AirPlay output (more complex, may need shairport-sync)"""
    pass

class BrowserOutput(AudioOutput):
    """Signal browser to play (via WebSocket)"""
    pass
```

### 5.2 Smart Playlists

```python
# Auto-updating playlists based on rules
class SmartPlaylist:
    name: str
    rules: list[PlaylistRule]
    
    async def refresh(self, db: Database) -> list[Track]:
        query = self.build_query()
        return await db.execute(query)
    
    def build_query(self) -> str:
        # Build SQL from rules
        pass

# Example rules
rules = [
    {"field": "genre", "operator": "contains", "value": "electronic"},
    {"field": "bpm", "operator": "between", "value": [120, 140]},
    {"field": "energy", "operator": ">=", "value": 0.7},
    {"field": "added_at", "operator": "within", "value": "30 days"}
]
```

### 5.3 Library Organization

```python
class LibraryOrganizer:
    """Optionally reorganize files into consistent structure"""
    
    async def organize(self, track: Track, template: str = "{artist}/{album}/{track} - {title}"):
        if not track.metadata_complete:
            return  # Don't move poorly-tagged files
        
        new_path = self.library_root / template.format(
            artist=sanitize_filename(track.artist),
            album=sanitize_filename(track.album),
            track=str(track.track_number).zfill(2),
            title=sanitize_filename(track.title)
        )
        
        new_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(track.file_path, new_path)
        
        await self.db.update_track_path(track.id, new_path)
```

### 5.4 Performance & Reliability

- [ ] Connection pooling for database
- [ ] Redis caching for frequent queries
- [ ] Rate limiting on API endpoints
- [ ] Graceful degradation if GPU unavailable
- [ ] Health check endpoints
- [ ] Structured logging
- [ ] Error tracking (Sentry or similar)
- [ ] Backup strategy for database

### 5.5 UI Polish

- [ ] Dark/light mode
- [ ] Keyboard shortcuts
- [ ] Mobile-responsive design
- [ ] Drag-and-drop playlist editing
- [ ] Waveform visualization (optional)
- [ ] Lyrics display (if available via Musixmatch API or embedded)

### 5.6 Deliverables for Phase 5

- [ ] Output abstraction layer
- [ ] Sonos integration (if prioritized)
- [ ] Smart playlist builder UI
- [ ] Library organization tool (opt-in)
- [ ] Lyrics fetching (Musixmatch/LRCLIB) and synced display
- [ ] Last.fm scrobbling (optional, user setting)
- [ ] Library write-back option (user choice, per-track manual option)
- [ ] Playlist sharing (export/import .familiar files)
- [ ] Music video download (yt-dlp) with user options
- [ ] Video storage management (cache size, auto-prune)
- [ ] Full player video/visualizer/lyrics toggle
- [ ] **Listening Sessions:**
  - [ ] Public signaling server (Cloudflare Workers)
  - [ ] TURN server for WebRTC relay (coturn)
  - [ ] Guest listener page (static, no auth required)
  - [ ] Host UI in Familiar (create session, share link, DJ controls)
  - [ ] WebRTC audio streaming from host to guests
  - [ ] Text chat via data channel
  - [ ] Host handoff (pass DJ to another Familiar user)
- [ ] Performance optimizations
- [ ] Mobile-friendly PWA
- [ ] Documentation

---

## Development Timeline (Estimated)

| Phase | Duration | Milestone |
|-------|----------|-----------|
| Phase 1: Foundation | 3-4 weeks | Library fully indexed with embeddings |
| Phase 2: Playback | 2-3 weeks | Functional player without AI |
| Phase 3: LLM | 3-4 weeks | "Chat with your library" working |
| Phase 4: Spotify | 2-3 weeks | Full Spotify sync + Bandcamp recs |
| Phase 5: Polish | 3-5 weeks | Videos, sharing, lyrics, production-ready |

**Total: 13-19 weeks** depending on scope and polish level.

---

## Resolved Design Decisions

| Question | Decision |
|----------|----------|
| **Project name** | Familiar |
| **Album art storage** | Extract to files during indexing |
| **Lyrics** | Full support — fetch external (Musixmatch/LRCLIB), display synced |
| **Mobile app** | PWA first, native later if needed |
| **Scrobbling** | Last.fm integration (optional) |
| **Library write-back** | User choice (default off), manual per-track option |
| **Frontend framework** | React + TypeScript |
| **Styling** | Tailwind CSS |
| **Build tool** | Vite |
| **Compilations/soundtracks** | album_type enum, "Albums" vs "Appears On" artist view |
| **Database strategy** | JSONB for evolving data, typed columns for stable data, reset-db in dev |
| **Desktop layout** | Chat left, contextual/library right, fixed player bar bottom |
| **Mobile layout** | Mini player top, chat primary, library via nav |
| **Full player** | R3F visualizer + lyrics overlay + music video toggle |
| **Contextual panel** | Direct manipulation (drag reorder, click remove/add) |
| **Playlist sharing** | Export .familiar file with multi-identifier matching |
| **Music videos** | yt-dlp with user choice: full video / audio-only / stream-only |
| **Video storage** | User-configurable cache size, auto-prune options |
| **Listening sessions** | WebRTC streaming, guests need no account, host-only control with handoff |

---

## Getting Started

1. Set up development environment:
   ```bash
   git clone <repo>
   cd familiar
   cp .env.example .env
   # Edit .env with your paths and API keys
   docker-compose up -d
   ```

2. Configure library path in `.env`:
   ```
   MUSIC_LIBRARY_PATH=/path/to/your/music
   ```

3. Run initial scan:
   ```bash
   docker-compose exec api python -m app.cli scan --full
   ```

4. Access web UI at `http://localhost:3000`

---

## Notes for Claude Code

### When Implementing

- **Check this document first** for architecture decisions before implementing new features
- **Use JSONB** for any data that might evolve (features, settings, API responses)
- **Don't write migrations** during dev — use `make reset-db` instead
- **Test with subset** — point `LIBRARY_PATHS` at a small folder first

### Key Files Reference

| When working on... | Look at... |
|-------------------|------------|
| Database models | `backend/app/db/models.py`, Section 1.3 (Schema) |
| API routes | `backend/app/api/routes/`, Phase 1.5 (Endpoints) |
| Audio analysis | `backend/app/services/analyzer.py`, Section 1.3 (Analysis Pipeline) |
| LLM tools | `backend/app/services/llm.py`, Section 3.1 (Tool Definitions) |
| Frontend audio | `frontend/src/hooks/useAudioEngine.ts`, Section 2.2 (Audio Engine) |
| Full player | `frontend/src/components/FullPlayer/`, UI Layout section |

### Common Tasks

**Add a new audio feature:**
1. Add extraction logic to `analyzer.py` `extract_features()` dict
2. No schema change needed (it's JSONB)
3. Bump `ANALYSIS_VERSION` if you want to re-analyze existing tracks

**Add a new LLM tool:**
1. Define tool schema in `MUSIC_PLAYER_TOOLS` list
2. Implement handler in `ToolExecutor`
3. Tools can query JSONB features with PostgreSQL `->` operator

**Add a new API endpoint:**
1. Create route in `backend/app/api/routes/`
2. Register in `main.py`
3. Use dependency injection from `deps.py` for DB/services

### Environment Variables

```bash
# .env.example
DATABASE_URL=postgresql+asyncpg://familiar:familiar@localhost:5432/familiar
REDIS_URL=redis://localhost:6379/0
MUSIC_LIBRARY_PATH=/path/to/music
ANTHROPIC_API_KEY=sk-ant-...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
LASTFM_API_KEY=...
ANALYSIS_VERSION=1
```
