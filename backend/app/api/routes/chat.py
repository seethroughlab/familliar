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
from app.config import settings
from app.services.llm import LLMService

router = APIRouter(prefix="/chat", tags=["chat"])


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
    llm_service = LLMService()

    try:
        async for event in llm_service.chat(message, history, db, profile_id):
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
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="Anthropic API key not configured"
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
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="Anthropic API key not configured"
        )

    llm_service = LLMService()
    history = [{"role": msg.role, "content": msg.content} for msg in request.history]
    profile_id = profile.id if profile else None

    response_text = ""
    tool_calls = []
    queued_tracks = []
    playback_action = None

    async for event in llm_service.chat(request.message, history, db, profile_id):
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
