# Familiar — Feature Roadmap

## Project Status: ~90% Complete

See `CLAUDE.md` for project overview and development guide.

---

## Completed Features

### Gapless Crossfade (Audio Engine) ✓
**Location:** `frontend/src/hooks/useAudioEngine.ts`

Implemented dual HTMLAudioElement architecture with Web Audio API:
- Two audio elements (A/B) that swap roles for crossfade
- Individual GainNodes for crossfade control, MasterGain for volume
- Configurable crossfade duration (0-10s) in Settings > Playback
- Pre-buffers next track 3 seconds before crossfade
- Ready for future EQ/effects chain

### Offline Playback UI ✓
**Location:** `frontend/src/components/Settings/OfflineSettings.tsx`

Enhanced offline management:
- Storage quota display with warnings (80%/95% thresholds)
- Expandable track list with search/sort/remove
- Download progress tracking for individual tracks
- Batch download with progress in playlists

---

## Remaining Features

### High Priority

#### 1. Listening Sessions - Public Signaling Server
**Location:** Need to create `familiar-signaling/` (Cloudflare Workers)
 - this should be in a different repo: ~/Developer/familliar-signaling

WebRTC listening sessions work locally but need a public signaling server for remote guests:
- Cloudflare Workers for WebSocket signaling
- Session discovery and peer coordination
- No media relay (STUN/TURN handles that)

#### 3. Listening Sessions - TURN Server Deployment
**Docs:** See "WebRTC TURN Server Setup" section below
- Can/should this be combined with familiar-signaling into a single familliar-public Cloudflare worker?

For guests behind symmetric NAT, deploy coturn:
- VPS with public IP
- Configure coturn with credentials
- Add TURN config to Familiar settings

### Medium Priority

#### 4. Offline Playback UI
**Location:** `frontend/src/components/Settings/OfflineSettings.tsx`

Infrastructure exists (IndexedDB caching, service worker) but needs:
- Better UI for managing offline tracks
- Download progress indicators
- Playlist offline sync
- Storage quota management

#### 5. Conversation History UI
**Location:** `frontend/src/components/Chat/ChatPanel.tsx`

Chat sessions persist in IndexedDB but UI needs:
- Session list/picker in sidebar
- Session rename/delete
- Search across conversations

#### 6. Music Import Flow
**Location:** `backend/app/services/import_service.py`

Backend endpoint exists (`/library/import`) but needs:
- Drag-drop UI in frontend
- Progress feedback
- Duplicate detection UI

### Low Priority / Future

#### 7. Multi-Room Audio (Sonos/AirPlay)
**Location:** `backend/app/services/outputs.py`

Output abstraction layer exists. Implementations needed:
- Sonos SOAP/UPnP integration
- AirPlay via shairport-sync or similar

#### 8. Guest Listener Page
**Location:** `frontend/src/components/Guest/GuestListener.tsx`

Needs polish:
- Standalone page without full app
- Mobile-optimized layout
- Connection status feedback

---

## WebRTC TURN Server Setup

For listening sessions to work across different networks (especially when guests are behind symmetric NAT), you need a TURN server.

### Quick Setup with coturn

1. **Install coturn** on a public VPS:
   ```bash
   sudo apt install coturn
   sudo systemctl enable coturn
   ```

2. **Configure `/etc/turnserver.conf`**:
   ```ini
   listening-port=3478
   tls-listening-port=5349
   external-ip=YOUR_PUBLIC_IP
   lt-cred-mech
   user=familiar:YOUR_SECURE_PASSWORD
   realm=familiar.local
   fingerprint
   no-multicast-peers
   no-cli
   log-file=/var/log/turnserver.log
   simple-log
   ```

3. **Open firewall ports**:
   ```bash
   sudo ufw allow 3478/udp
   sudo ufw allow 3478/tcp
   sudo ufw allow 5349/tcp
   sudo ufw allow 49152:65535/udp
   ```

4. **Start the server**:
   ```bash
   sudo systemctl start coturn
   ```

### Configure Familiar

Add environment variables:
```bash
TURN_SERVER_URL=turn:your-server.com:3478
TURN_SERVER_USERNAME=familiar
TURN_SERVER_CREDENTIAL=YOUR_SECURE_PASSWORD
```

### Testing

1. Use [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/)
2. Add your TURN server credentials
3. Gather candidates — you should see "relay" candidates if TURN is working

### When TURN is Required

- Users behind symmetric NAT (corporate networks)
- Direct peer-to-peer connection fails
- Guests on mobile networks with carrier-grade NAT

Most home networks work fine with just STUN (Google's free servers are configured by default).
