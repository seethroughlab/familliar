"""Listening sessions WebSocket API with WebRTC signaling support."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status

from app.config import settings
from app.services.sessions import SessionRole, get_session_manager


def get_ice_servers() -> list[dict[str, Any]]:
    """Get ICE servers configuration including optional TURN server."""
    servers = [
        {"urls": "stun:stun.l.google.com:19302"},
        {"urls": "stun:stun1.l.google.com:19302"},
    ]

    # Add TURN server if configured (needed for symmetric NAT traversal)
    if settings.turn_server_url:
        turn_config = {"urls": settings.turn_server_url}
        if settings.turn_server_username:
            turn_config["username"] = settings.turn_server_username
        if settings.turn_server_credential:
            turn_config["credential"] = settings.turn_server_credential
        servers.append(turn_config)

    return servers

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/by-code/{code}")
async def get_session_by_code(code: str) -> dict[str, Any]:
    """Get session info by join code."""
    manager = get_session_manager()
    session = manager.get_session_by_code(code)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    return session.to_dict()


@router.websocket("/ws")
async def session_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for listening sessions with WebRTC signaling.

    Messages:
    - create: {"type": "create", "name": "Session Name", "user_id": "...", "username": "..."}
    - join: {"type": "join", "code": "ABC123", "user_id": "...", "username": "..."}
    - join_guest: {"type": "join_guest", "code": "ABC123", "guest_name": "..."}
    - playback: {"type": "playback", "track_id": "...", "is_playing": true, "position_ms": 0}
    - sync_request: {"type": "sync_request"} - Request current playback state
    - leave: {"type": "leave"}

    WebRTC Signaling:
    - webrtc_offer: {"type": "webrtc_offer", "target_user_id": "...", "sdp": {...}}
    - webrtc_answer: {"type": "webrtc_answer", "target_user_id": "...", "sdp": {...}}
    - webrtc_ice: {"type": "webrtc_ice", "target_user_id": "...", "candidate": {...}}
    - webrtc_request: {"type": "webrtc_request"} - Guest requests stream from host
    - webrtc_connected: {"type": "webrtc_connected", "connected": true}
    """
    await websocket.accept()
    manager = get_session_manager()
    current_user_id: UUID | None = None

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "create":
                # Create a new session
                user_id = UUID(data["user_id"])
                username = data.get("username", "Anonymous")
                name = data.get("name", "Listening Session")

                session = manager.create_session(
                    host_id=user_id,
                    host_username=username,
                    name=name,
                    websocket=websocket,
                )
                current_user_id = user_id

                await websocket.send_json({
                    "type": "session_created",
                    "session": session.to_dict(),
                })

            elif msg_type == "join":
                # Join an existing session
                code = data.get("code", "").upper()
                user_id = UUID(data["user_id"])
                username = data.get("username", "Anonymous")

                session = manager.get_session_by_code(code)
                if session is None:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session not found",
                    })
                    continue

                participant = manager.join_session(
                    session=session,
                    user_id=user_id,
                    username=username,
                    websocket=websocket,
                )
                current_user_id = user_id

                # Send session info to joiner
                await websocket.send_json({
                    "type": "session_joined",
                    "session": session.to_dict(),
                })

                # Notify others
                await manager.broadcast(
                    session,
                    {
                        "type": "user_joined",
                        "user": {
                            "user_id": str(user_id),
                            "username": username,
                            "role": participant.role.value,
                        },
                        "participant_count": len(session.participants),
                    },
                    exclude_user=user_id,
                )

            elif msg_type == "playback":
                # Update playback state (host only)
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None:
                    continue

                # Only host can control playback
                if session.host_id != current_user_id:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Only the host can control playback",
                    })
                    continue

                track_id = UUID(data["track_id"]) if data.get("track_id") else None
                is_playing = data.get("is_playing")
                position_ms = data.get("position_ms")

                manager.update_playback(
                    session,
                    track_id=track_id,
                    is_playing=is_playing,
                    position_ms=position_ms,
                )

                # Broadcast to all participants
                await manager.broadcast(
                    session,
                    {
                        "type": "playback_update",
                        "track_id": str(track_id) if track_id else None,
                        "is_playing": is_playing,
                        "position_ms": position_ms,
                    },
                    exclude_user=current_user_id,
                )

            elif msg_type == "sync_request":
                # Request current playback state
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None:
                    continue

                await websocket.send_json({
                    "type": "sync_response",
                    "track_id": str(session.playback_state.track_id) if session.playback_state.track_id else None,
                    "is_playing": session.playback_state.is_playing,
                    "position_ms": session.playback_state.position_ms,
                })

            elif msg_type == "chat":
                # Chat message
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None:
                    continue

                participant = session.participants.get(current_user_id)
                if participant is None:
                    continue

                await manager.broadcast(
                    session,
                    {
                        "type": "chat",
                        "user_id": str(current_user_id),
                        "username": participant.username,
                        "message": data.get("message", ""),
                    },
                )

            elif msg_type == "join_guest":
                # Guest joining without authentication
                code = data.get("code", "").upper()
                guest_name = data.get("guest_name", "Guest")

                session = manager.get_session_by_code(code)
                if session is None:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Session not found",
                    })
                    continue

                if not session.webrtc_enabled:
                    await websocket.send_json({
                        "type": "error",
                        "message": "This session does not allow guest listeners",
                    })
                    continue

                participant = manager.join_as_guest(
                    session=session,
                    guest_name=guest_name,
                    websocket=websocket,
                )
                current_user_id = participant.user_id

                # Send session info to guest with ICE servers
                await websocket.send_json({
                    "type": "session_joined",
                    "session": session.to_dict(),
                    "your_user_id": str(current_user_id),
                    "your_peer_id": participant.peer_id,
                    "ice_servers": get_ice_servers(),
                })

                # Notify host about new guest
                await manager.send_to_host(
                    session,
                    {
                        "type": "guest_joined",
                        "user_id": str(current_user_id),
                        "username": guest_name,
                        "peer_id": participant.peer_id,
                        "participant_count": len(session.participants),
                    },
                )

                # Notify others
                await manager.broadcast(
                    session,
                    {
                        "type": "user_joined",
                        "user": {
                            "user_id": str(current_user_id),
                            "username": guest_name,
                            "role": SessionRole.GUEST.value,
                        },
                        "participant_count": len(session.participants),
                    },
                    exclude_user=current_user_id,
                )

            elif msg_type == "webrtc_request":
                # Guest requests WebRTC stream from host
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None:
                    continue

                participant = session.participants.get(current_user_id)
                if participant is None:
                    continue

                # Tell host to create offer for this guest
                await manager.send_to_host(
                    session,
                    {
                        "type": "webrtc_create_offer",
                        "target_user_id": str(current_user_id),
                        "peer_id": participant.peer_id,
                    },
                )

            elif msg_type == "webrtc_offer":
                # Host sending offer to a specific guest
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None or session.host_id != current_user_id:
                    continue

                target_user_id = UUID(data.get("target_user_id"))
                await manager.send_to_user(
                    session,
                    target_user_id,
                    {
                        "type": "webrtc_offer",
                        "sdp": data.get("sdp"),
                        "from_user_id": str(current_user_id),
                    },
                )

            elif msg_type == "webrtc_answer":
                # Guest sending answer to host
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None:
                    continue

                await manager.send_to_host(
                    session,
                    {
                        "type": "webrtc_answer",
                        "sdp": data.get("sdp"),
                        "from_user_id": str(current_user_id),
                    },
                )

            elif msg_type == "webrtc_ice":
                # ICE candidate exchange
                if not current_user_id:
                    continue

                session = manager.get_user_session(current_user_id)
                if session is None:
                    continue

                target_user_id = data.get("target_user_id")
                if target_user_id:
                    # Sending to specific user
                    await manager.send_to_user(
                        session,
                        UUID(target_user_id),
                        {
                            "type": "webrtc_ice",
                            "candidate": data.get("candidate"),
                            "from_user_id": str(current_user_id),
                        },
                    )
                else:
                    # Guest sending to host
                    await manager.send_to_host(
                        session,
                        {
                            "type": "webrtc_ice",
                            "candidate": data.get("candidate"),
                            "from_user_id": str(current_user_id),
                        },
                    )

            elif msg_type == "webrtc_connected":
                # Update WebRTC connection state
                if not current_user_id:
                    continue

                connected = data.get("connected", False)
                manager.update_webrtc_state(current_user_id, connected)

                session = manager.get_user_session(current_user_id)
                if session is not None:
                    await manager.broadcast(
                        session,
                        {
                            "type": "webrtc_state_changed",
                            "user_id": str(current_user_id),
                            "connected": connected,
                        },
                        exclude_user=current_user_id,
                    )

            elif msg_type == "leave":
                # Leave session
                if current_user_id:
                    session = manager.remove_user(current_user_id)
                    if session is not None and session.participants:
                        await manager.broadcast(
                            session,
                            {
                                "type": "user_left",
                                "user_id": str(current_user_id),
                                "participant_count": len(session.participants),
                            },
                        )
                    current_user_id = None

                await websocket.send_json({
                    "type": "left",
                })

    except WebSocketDisconnect:
        # Clean up on disconnect
        if current_user_id:
            session = manager.remove_user(current_user_id)
            if session is not None and session.participants:
                await manager.broadcast(
                    session,
                    {
                        "type": "user_left",
                        "user_id": str(current_user_id),
                        "participant_count": len(session.participants),
                        "reason": "disconnected",
                    },
                )
