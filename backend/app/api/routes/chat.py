"""Chat endpoints for LLM-powered music discovery."""

import json
from collections.abc import AsyncIterator
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentProfile, DbSession
from app.services.app_settings import get_app_settings_service
from app.services.llm import LLMService

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/status")
async def get_chat_status() -> dict[str, Any]:
    """Check if LLM is configured and available.

    Returns configuration status so the frontend can show
    appropriate warnings before the user tries to chat.
    """
    settings_service = get_app_settings_service()
    app_settings = settings_service.get()
    provider = app_settings.llm_provider

    if provider == "claude":
        configured = bool(settings_service.get_effective("anthropic_api_key"))
    else:
        # For Ollama, assume configured (would need to ping to verify)
        configured = True

    return {
        "configured": configured,
        "provider": provider,
    }


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    """Chat request body."""
    message: str
    history: list[ChatMessage] = []


async def generate_sse_events(
    message: str,
    history: list[dict[str, Any]],
    db: AsyncSession,
    profile_id: UUID | None = None,
) -> AsyncIterator[str]:
    """Generate Server-Sent Events for streaming chat response."""
    llm_service = LLMService()  # type: ignore[no-untyped-call]

    try:
        async for event in llm_service.chat(message, history, db, profile_id):  # type: ignore[no-untyped-call]
            # Format as SSE
            yield f"data: {json.dumps(event)}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    yield "data: [DONE]\n\n"


@router.post("/stream")
async def chat_stream(
    request: ChatRequest,
    db: DbSession,
    profile: CurrentProfile,
) -> StreamingResponse:
    """
    Stream a chat response with tool execution.

    Returns Server-Sent Events (SSE) with the following event types:
    - text: LLM text response chunk
    - tool_call: Tool being called (name, input)
    - tool_result: Result of tool execution
    - queue: Tracks to add to queue
    - playback: Playback control action
    - done: Stream complete
    - error: Error occurred
    """
    # Check for API key with proper precedence
    settings_service = get_app_settings_service()
    app_settings = settings_service.get()
    has_api_key = bool(settings_service.get_effective("anthropic_api_key"))

    # If using Ollama, we don't need an Anthropic key
    if app_settings.llm_provider == "ollama":
        has_api_key = True

    if not has_api_key:
        raise HTTPException(
            status_code=503,
            detail="Anthropic API key not configured. Add it in the Admin panel."
        )

    # Convert history to format expected by LLM service
    history = [{"role": msg.role, "content": msg.content} for msg in request.history]
    profile_id = profile.id if profile else None

    return StreamingResponse(
        generate_sse_events(request.message, history, db, profile_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("")
async def chat(
    request: ChatRequest,
    db: DbSession,
    profile: CurrentProfile,
) -> dict[str, Any]:
    """
    Non-streaming chat endpoint.

    Returns the complete response after all tool calls are processed.
    Useful for simpler integrations that don't need streaming.
    """
    # Check for API key with proper precedence
    settings_service = get_app_settings_service()
    app_settings = settings_service.get()
    has_api_key = bool(settings_service.get_effective("anthropic_api_key"))

    # If using Ollama, we don't need an Anthropic key
    if app_settings.llm_provider == "ollama":
        has_api_key = True

    if not has_api_key:
        raise HTTPException(
            status_code=503,
            detail="Anthropic API key not configured. Add it in the Admin panel."
        )

    llm_service = LLMService()  # type: ignore[no-untyped-call]
    history = [{"role": msg.role, "content": msg.content} for msg in request.history]
    profile_id = profile.id if profile else None

    response_text = ""
    tool_calls = []
    queued_tracks = []
    playback_action = None

    async for event in llm_service.chat(request.message, history, db, profile_id):  # type: ignore[no-untyped-call]
        if event["type"] == "text":
            response_text += event["content"]
        elif event["type"] == "tool_call":
            tool_calls.append({
                "name": event["name"],
                "input": event["input"]
            })
        elif event["type"] == "queue":
            queued_tracks = event["tracks"]
        elif event["type"] == "playback":
            playback_action = event["action"]

    return {
        "response": response_text,
        "tool_calls": tool_calls,
        "queued_tracks": queued_tracks,
        "playback_action": playback_action,
    }
