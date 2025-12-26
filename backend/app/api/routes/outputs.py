"""Multi-room audio output API endpoints."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.outputs import BrowserOutput, OutputType, SonosOutput, get_output_manager

router = APIRouter(prefix="/outputs", tags=["outputs"])


class OutputResponse(BaseModel):
    """Audio output response."""

    id: str
    name: str
    type: str
    state: str
    volume: int
    current_track_id: str | None
    position_ms: int


class ZoneResponse(BaseModel):
    """Zone response."""

    id: str
    name: str
    outputs: list[OutputResponse]
    is_active: bool
    current_track_id: str | None


class CreateZoneRequest(BaseModel):
    """Request to create a zone."""

    name: str
    output_ids: list[str] | None = None


class CreateOutputRequest(BaseModel):
    """Request to create an output."""

    name: str
    type: OutputType
    # Sonos-specific
    speaker_ip: str | None = None


class PlayRequest(BaseModel):
    """Request to play to an output or zone."""

    stream_url: str
    track_id: str | None = None


class VolumeRequest(BaseModel):
    """Request to set volume."""

    volume: int


class SeekRequest(BaseModel):
    """Request to seek."""

    position_ms: int


@router.get("", response_model=list[OutputResponse])
async def list_outputs():
    """List all registered audio outputs."""
    manager = get_output_manager()
    return manager.list_outputs()


@router.post("", response_model=OutputResponse, status_code=status.HTTP_201_CREATED)
async def create_output(request: CreateOutputRequest):
    """Register a new audio output."""
    manager = get_output_manager()

    if request.type == OutputType.BROWSER:
        output = BrowserOutput(name=request.name)
    elif request.type == OutputType.SONOS:
        if not request.speaker_ip:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="speaker_ip required for Sonos output",
            )
        output = SonosOutput(name=request.name, speaker_ip=request.speaker_ip)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported output type: {request.type}",
        )

    manager.register_output(output)
    return output.to_dict()


@router.get("/discover/sonos", response_model=list[OutputResponse])
async def discover_sonos():
    """Discover Sonos speakers on the network."""
    manager = get_output_manager()
    discovered = manager.discover_sonos()
    return [o.to_dict() for o in discovered]


@router.get("/{output_id}", response_model=OutputResponse)
async def get_output(output_id: UUID):
    """Get an audio output by ID."""
    manager = get_output_manager()
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output not found",
        )
    return await output.get_status()


@router.delete("/{output_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_output(output_id: UUID):
    """Unregister an audio output."""
    manager = get_output_manager()
    if not manager.unregister_output(output_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Output not found",
        )


@router.post("/{output_id}/play")
async def play_to_output(output_id: UUID, request: PlayRequest):
    """Play to a specific output."""
    manager = get_output_manager()
    track_id = UUID(request.track_id) if request.track_id else None
    success = await manager.play_to_output(output_id, request.stream_url, track_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to start playback",
        )
    return {"status": "playing"}


@router.post("/{output_id}/pause")
async def pause_output(output_id: UUID):
    """Pause an output."""
    manager = get_output_manager()
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    await output.pause()
    return {"status": "paused"}


@router.post("/{output_id}/resume")
async def resume_output(output_id: UUID):
    """Resume an output."""
    manager = get_output_manager()
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    await output.resume()
    return {"status": "playing"}


@router.post("/{output_id}/stop")
async def stop_output(output_id: UUID):
    """Stop an output."""
    manager = get_output_manager()
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    await output.stop()
    return {"status": "stopped"}


@router.post("/{output_id}/seek")
async def seek_output(output_id: UUID, request: SeekRequest):
    """Seek an output to a position."""
    manager = get_output_manager()
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    await output.seek(request.position_ms)
    return {"status": "seeked", "position_ms": request.position_ms}


@router.post("/{output_id}/volume")
async def set_output_volume(output_id: UUID, request: VolumeRequest):
    """Set output volume."""
    manager = get_output_manager()
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    await output.set_volume(request.volume)
    return {"status": "volume_set", "volume": request.volume}


# Zone endpoints


@router.get("/zones", response_model=list[ZoneResponse])
async def list_zones():
    """List all zones."""
    manager = get_output_manager()
    return manager.list_zones()


@router.post("/zones", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
async def create_zone(request: CreateZoneRequest):
    """Create a new zone."""
    manager = get_output_manager()
    output_ids = [UUID(oid) for oid in request.output_ids] if request.output_ids else None
    zone = manager.create_zone(request.name, output_ids)
    return zone.to_dict()


@router.get("/zones/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: UUID):
    """Get a zone by ID."""
    manager = get_output_manager()
    zone = manager.get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return zone.to_dict()


@router.delete("/zones/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_zone(zone_id: UUID):
    """Delete a zone."""
    manager = get_output_manager()
    if not manager.delete_zone(zone_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")


@router.post("/zones/{zone_id}/play")
async def play_to_zone(zone_id: UUID, request: PlayRequest):
    """Play to all outputs in a zone."""
    manager = get_output_manager()
    track_id = UUID(request.track_id) if request.track_id else None
    results = await manager.play_to_zone(zone_id, request.stream_url, track_id)
    if not results:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    return {"status": "playing", "results": {str(k): v for k, v in results.items()}}


@router.post("/zones/{zone_id}/pause")
async def pause_zone(zone_id: UUID):
    """Pause all outputs in a zone."""
    manager = get_output_manager()
    zone = manager.get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    results = await zone.pause()
    return {"status": "paused", "results": {str(k): v for k, v in results.items()}}


@router.post("/zones/{zone_id}/stop")
async def stop_zone(zone_id: UUID):
    """Stop all outputs in a zone."""
    manager = get_output_manager()
    zone = manager.get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    results = await zone.stop()
    return {"status": "stopped", "results": {str(k): v for k, v in results.items()}}


@router.post("/zones/{zone_id}/outputs/{output_id}")
async def add_output_to_zone(zone_id: UUID, output_id: UUID):
    """Add an output to a zone."""
    manager = get_output_manager()
    zone = manager.get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    output = manager.get_output(output_id)
    if not output:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not found")
    zone.add_output(output)
    return zone.to_dict()


@router.delete("/zones/{zone_id}/outputs/{output_id}")
async def remove_output_from_zone(zone_id: UUID, output_id: UUID):
    """Remove an output from a zone."""
    manager = get_output_manager()
    zone = manager.get_zone(zone_id)
    if not zone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    if not zone.remove_output(output_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output not in zone")
    return zone.to_dict()
