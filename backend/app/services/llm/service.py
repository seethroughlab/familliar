"""LLM service for conversational music discovery."""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, cast
from uuid import UUID

import anthropic
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.app_settings import get_app_settings_service

from .executor import ToolExecutor
from .providers import OllamaClient
from .tools import MUSIC_TOOLS, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class LLMService:
    """Service for conversational music discovery using Claude or Ollama."""

    def __init__(self) -> None:
        self.app_settings = get_app_settings_service().get()
        self.provider = self.app_settings.llm_provider

        if self.provider == "claude":
            api_key = self._get_api_key()
            self.claude_client: anthropic.Anthropic | None = anthropic.Anthropic(api_key=api_key)
            self.ollama_client: OllamaClient | None = None
        else:
            self.claude_client = None
            self.ollama_client = OllamaClient(
                base_url=self.app_settings.ollama_url,
                model=self.app_settings.ollama_model,
            )

    def _get_api_key(self) -> str | None:
        """Get Anthropic API key with proper precedence."""
        return get_app_settings_service().get_effective("anthropic_api_key")

    async def chat(
        self,
        message: str,
        conversation_history: list[dict[str, Any]],
        db: AsyncSession,
        profile_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Process a chat message and stream the response.

        Yields dicts with types:
        - {"type": "text", "content": "..."}
        - {"type": "tool_call", "name": "...", "input": {...}}
        - {"type": "tool_result", "name": "...", "result": {...}}
        - {"type": "queue", "tracks": [...], "clear": bool}
        - {"type": "playback", "action": "..."}
        - {"type": "done"}
        """
        if self.provider == "ollama":
            async for event in self._chat_ollama(message, conversation_history, db, profile_id):
                yield event
        else:
            async for event in self._chat_claude(message, conversation_history, db, profile_id):
                yield event

    async def _chat_claude(
        self,
        message: str,
        conversation_history: list[dict[str, Any]],
        db: AsyncSession,
        profile_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Chat using Claude API."""
        if not self.claude_client:
            yield {"type": "error", "content": "Claude client not configured"}
            return

        tool_executor = ToolExecutor(db, profile_id, user_message=message)
        messages: list[dict[str, Any]] = conversation_history + [
            {"role": "user", "content": message}
        ]

        while True:
            try:
                response = self.claude_client.messages.create(
                    model="claude-sonnet-4-5-20250929",
                    max_tokens=2048,
                    system=SYSTEM_PROMPT,
                    tools=cast(Any, MUSIC_TOOLS),
                    messages=cast(Any, messages),
                )
            except anthropic.BadRequestError as e:
                logger.error(f"Anthropic BadRequestError: {e}")
                yield {"type": "error", "content": f"API error: {e.message}"}
                return
            except anthropic.AuthenticationError as e:
                logger.error(f"Anthropic AuthenticationError: {e}")
                yield {
                    "type": "error",
                    "content": "Invalid API key. Check your Anthropic API key in Settings.",
                }
                return
            except anthropic.APIError as e:
                logger.error(f"Anthropic APIError: {e}")
                yield {"type": "error", "content": f"API error: {e.message}"}
                return

            # Process response content
            assistant_content: list[Any] = []
            for block in response.content:
                if block.type == "text":
                    yield {"type": "text", "content": block.text}
                    assistant_content.append(block)
                elif block.type == "tool_use":
                    tool_input = cast(dict[str, Any], block.input)
                    yield {
                        "type": "tool_call",
                        "id": block.id,
                        "name": block.name,
                        "input": tool_input,
                    }

                    result = await tool_executor.execute(block.name, tool_input)

                    yield {"type": "tool_result", "name": block.name, "result": result}

                    assistant_content.append(block)

                    messages.append({"role": "assistant", "content": assistant_content})
                    messages.append({
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": json.dumps(result),
                            }
                        ],
                    })
                    assistant_content = []

            if response.stop_reason == "end_turn":
                queued = tool_executor.get_queued_tracks()
                if queued:
                    yield {"type": "queue", "tracks": queued, "clear": False}

                auto_playlist = tool_executor.get_auto_saved_playlist()
                if auto_playlist and auto_playlist.get("saved"):
                    yield {
                        "type": "playlist_created",
                        "playlist_id": auto_playlist.get("playlist_id"),
                        "playlist_name": auto_playlist.get("playlist_name"),
                        "track_count": auto_playlist.get("tracks_saved"),
                    }

                action = tool_executor.get_playback_action()
                if action:
                    yield {"type": "playback", "action": action}

                yield {"type": "done"}
                break
            elif response.stop_reason == "tool_use":
                continue
            else:
                yield {"type": "done"}
                break

    async def _chat_ollama(
        self,
        message: str,
        conversation_history: list[dict[str, Any]],
        db: AsyncSession,
        profile_id: UUID | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Chat using Ollama API with tool support."""
        if not self.ollama_client:
            yield {"type": "error", "content": "Ollama client not configured"}
            return

        tool_executor = ToolExecutor(db, profile_id, user_message=message)
        messages = conversation_history + [{"role": "user", "content": message}]

        max_iterations = 10
        iteration = 0

        try:
            while iteration < max_iterations:
                iteration += 1

                response = await self.ollama_client.chat(
                    messages=messages,
                    system=SYSTEM_PROMPT,
                    tools=MUSIC_TOOLS,
                )

                msg = response.get("message", {})
                content = msg.get("content", "")
                tool_calls = msg.get("tool_calls", [])

                if content:
                    yield {"type": "text", "content": content}

                if tool_calls:
                    for tool_call in tool_calls:
                        func = tool_call.get("function", {})
                        tool_name = func.get("name", "")
                        tool_args_str = func.get("arguments", "{}")

                        try:
                            tool_input = (
                                json.loads(tool_args_str)
                                if isinstance(tool_args_str, str)
                                else tool_args_str
                            )
                        except json.JSONDecodeError:
                            tool_input = {}

                        yield {
                            "type": "tool_call",
                            "id": tool_call.get("id", ""),
                            "name": tool_name,
                            "input": tool_input,
                        }

                        result = await tool_executor.execute(tool_name, tool_input)

                        yield {"type": "tool_result", "name": tool_name, "result": result}

                        messages.append({
                            "role": "assistant",
                            "content": content,
                            "tool_calls": tool_calls,
                        })
                        messages.append({
                            "role": "tool",
                            "content": json.dumps(result),
                        })

                    continue

                queued = tool_executor.get_queued_tracks()
                if queued:
                    yield {"type": "queue", "tracks": queued, "clear": False}

                auto_playlist = tool_executor.get_auto_saved_playlist()
                if auto_playlist and auto_playlist.get("saved"):
                    yield {
                        "type": "playlist_created",
                        "playlist_id": auto_playlist.get("playlist_id"),
                        "playlist_name": auto_playlist.get("playlist_name"),
                        "track_count": auto_playlist.get("tracks_saved"),
                    }

                action = tool_executor.get_playback_action()
                if action:
                    yield {"type": "playback", "action": action}

                yield {"type": "done"}
                break

        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama API error: {e}")
            yield {"type": "text", "content": f"Error communicating with Ollama: {e}"}
            yield {"type": "done"}
        except Exception as e:
            logger.error(f"Ollama chat error: {e}")
            yield {"type": "text", "content": f"Error: {e}"}
            yield {"type": "done"}
