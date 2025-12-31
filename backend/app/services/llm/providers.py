"""LLM provider clients (Ollama, Claude)."""

import json
from typing import Any

import httpx

from .tools import convert_tools_to_ollama_format


class OllamaClient:
    """Client for Ollama API with tool calling support."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3.2"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.http_client = httpx.AsyncClient(timeout=120.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.http_client.aclose()

    async def chat(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """Send a chat request to Ollama."""
        # Prepare messages with system prompt
        ollama_messages = []
        if system:
            ollama_messages.append({"role": "system", "content": system})

        # Convert messages to Ollama format
        for msg in messages:
            if msg["role"] == "user":
                content = msg["content"]
                if isinstance(content, list):
                    # Handle tool result format
                    for item in content:
                        if item.get("type") == "tool_result":
                            ollama_messages.append({
                                "role": "tool",
                                "content": item.get("content", ""),
                            })
                else:
                    ollama_messages.append({"role": "user", "content": content})
            elif msg["role"] == "assistant":
                content = msg["content"]
                if isinstance(content, list):
                    # Extract text content
                    text_parts = []
                    tool_calls = []
                    for item in content:
                        if hasattr(item, "type"):
                            if item.type == "text":
                                text_parts.append(item.text)
                            elif item.type == "tool_use":
                                tool_calls.append({
                                    "id": item.id,
                                    "type": "function",
                                    "function": {
                                        "name": item.name,
                                        "arguments": json.dumps(item.input),
                                    },
                                })
                    msg_dict: dict[str, Any] = {"role": "assistant"}
                    if text_parts:
                        msg_dict["content"] = "\n".join(text_parts)
                    if tool_calls:
                        msg_dict["tool_calls"] = tool_calls
                    ollama_messages.append(msg_dict)
                else:
                    ollama_messages.append({"role": "assistant", "content": content})

        # Prepare request body
        body: dict[str, Any] = {
            "model": self.model,
            "messages": ollama_messages,
            "stream": False,
        }

        if tools:
            body["tools"] = convert_tools_to_ollama_format(tools)

        # Make request
        response = await self.http_client.post(
            f"{self.base_url}/api/chat",
            json=body,
        )
        response.raise_for_status()
        return response.json()
