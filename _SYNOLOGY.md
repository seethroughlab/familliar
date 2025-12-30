# Synology NAS Support Plan

## Goal
Add ARM64 Docker builds to support most Synology NAS devices (DS218, DS220+, DS720+, etc.).

## Current State
- Docker images only built for `linux/amd64`
- Most Synology NAS devices use ARM64 processors
- OpenMediaVault support already working

## Key Findings

### What Already Works
- **pgvector/pgvector:pg16** - Has ARM64 images on Docker Hub
- **redis:7-alpine** - Has ARM64 images
- **Python 3.12-slim** - Has ARM64 images
- **DISABLE_CLAP_EMBEDDINGS** env var exists to skip torch-dependent features

### Potential Issues
1. **PyTorch ARM64 wheels** - CPU-only index may have limited ARM64 support
2. **Disk space during CI** - Building two architectures uses more space (mitigated by removing CUDA torch)

## Implementation Steps

### Step 1: Enable ARM64 Builds
**File:** `.github/workflows/release.yml`

Change line 73 from:
```yaml
platforms: linux/amd64
```
to:
```yaml
platforms: linux/amd64,linux/arm64
```

### Step 2: Add Synology Documentation
**File:** `README.md`

Add a new section covering:
- Supported Synology models (ARM64 and x86)
- Container Manager installation steps
- Volume path configuration (`/volume1/docker/familiar`, `/volume1/music`)
- Environment variable setup
- Troubleshooting common issues

### Step 3: Test and Validate
1. Push changes and trigger release workflow
2. Verify ARM64 image builds successfully
3. Test on actual Synology hardware (if available)
4. Document any ARM64-specific issues or workarounds

## Synology-Specific Considerations

### Volume Paths
Synology uses different mount paths than standard Linux:
- Music library: `/volume1/music` or `/volume2/music`
- Data directory: `/volume1/docker/familiar`

### Container Manager Setup
1. Open Container Manager (or Docker package on older DSM)
2. Go to Registry → Search for `ghcr.io/seethroughlab/familliar`
3. Download the image
4. Create containers for postgres, redis, api, and worker
5. Configure volumes and environment variables

### Permission Handling
Synology has specific user/group handling:
- Default docker user is typically `admin` (UID 1024)
- May need to adjust file permissions on mounted volumes

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| pgvector ARM64 | Low | Images already available |
| Redis ARM64 | Low | Images already available |
| PyTorch ARM64 | Medium | Use DISABLE_CLAP_EMBEDDINGS if needed |
| CI disk space | Low | Already resolved by using CPU-only torch |

## Success Criteria
- [ ] ARM64 Docker image builds successfully in CI
- [ ] Image runs on ARM64 Synology NAS
- [ ] All services (postgres, redis, api, worker) start correctly
- [ ] Music library scanning works
- [ ] Playback works through web interface
- [ ] Documentation updated with Synology-specific instructions
