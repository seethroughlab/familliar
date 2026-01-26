"""LLM service package for conversational music discovery.

This module provides:
- LLMService: Main service for handling chat interactions
- ToolExecutor: Executes LLM-called tools against the database
- MUSIC_TOOLS: Tool definitions for the LLM
- SYSTEM_PROMPT: System prompt for the music assistant

Usage:
    from app.services.llm import LLMService

    service = LLMService()
    async for event in service.chat(message, history, db, profile_id):
        handle(event)
"""

from .executor import ToolExecutor
from .service import LLMService
from .tools import MUSIC_TOOLS, SYSTEM_PROMPT

__all__ = [
    "LLMService",
    "ToolExecutor",
    "MUSIC_TOOLS",
    "SYSTEM_PROMPT",
]
