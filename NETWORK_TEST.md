# Network Speed Investigation

## Summary

Downloads from the NAS were taking ~10x longer than expected. Investigation confirmed the bottleneck is the Tailscale connection on certain WiFi networks, not the application.

## Findings (2025-01-25, on unfamiliar WiFi)

| Test | Speed | Notes |
|------|-------|-------|
| General internet (Cloudflare CDN) | **27.7 MB/sec** | WiFi is fine |
| Tailscale to NAS (SSH) | **90 KB/sec** | ~300x slower |
| Tailscale to NAS (HTTP API) | **92 KB/sec** | Same as SSH |

- Tailscale status showed **direct** connection (not relayed)
- The slow speed is specific to the Tailscale path, not the WiFi in general
- Likely cause: NAT traversal taking suboptimal route, or network traffic shaping

## Test Commands

Run these on your normal network to compare:

```bash
# 1. General internet speed (should be fast everywhere)
curl -o /dev/null -w "Speed: %{speed_download} bytes/sec\n" -m 10 \
  "https://speed.cloudflare.com/__down?bytes=10000000"

# 2. Raw Tailscale/SSH throughput (bypasses app entirely)
ssh root@openmediavault "dd if=/dev/zero bs=1M count=6 2>/dev/null" | dd of=/dev/null

# 3. App download speed (through FastAPI backend)
curl -o /dev/null -w "Speed: %{speed_download} bytes/sec\n" \
  "http://openmediavault:4400/api/v1/tracks/64340943-c78c-4cd1-9a38-7eb46e6b97a6/stream"

# 4. Tailscale connection status
/Applications/Tailscale.app/Contents/MacOS/Tailscale status | grep openmediavault
/Applications/Tailscale.app/Contents/MacOS/Tailscale ping -c 3 openmediavault
```

## Expected Results on Normal Network

- SSH throughput: **1-10 MB/sec** (vs 90 KB/sec on slow network)
- HTTP download: similar to SSH (app adds minimal overhead)
- If SSH is fast but HTTP is slow: investigate backend/proxy
- If both are slow: Tailscale/network issue

## Related Fix

`frontend/vite.config.ts` was updated to remove timeout for track streaming endpoints, so downloads won't be killed by Vite proxy even on slow networks:

```typescript
proxy: {
  '/api/v1/tracks': {
    target: process.env.VITE_API_TARGET || 'http://localhost:4400',
    changeOrigin: true,
    timeout: 0, // No timeout for streaming/downloads
  },
  '/api': { ... }
}
```
