"""
Context Service — In-memory session state management.
Stores per-session context: last mentioned tasks, pending confirmation, recent intent.
TTL-managed with auto-cleanup.
"""
import asyncio
import time
from typing import Optional
from copy import deepcopy

# session_id → { context_data, last_accessed }
_store: dict[str, dict] = {}
TTL_SECONDS = 7200  # 2 hours


def _now() -> float:
    return time.monotonic()


def _cleanup():
    """Remove expired sessions."""
    cutoff = _now() - TTL_SECONDS
    expired = [sid for sid, s in _store.items() if s["last_accessed"] < cutoff]
    for sid in expired:
        del _store[sid]


def _default_context() -> dict:
    return {
        "last_tasks": [],           # list of task dicts recently mentioned
        "pending_confirmation": None,  # { "action": str, "task_ids": [], "description": str }
        "current_focus": None,      # task_id currently in focus
        "recent_intent": "",        # last intent string
        "recent_entities": [],      # last extracted entities
        "conversation_history": [], # last N turns for multi-turn context
    }


def get_context(session_id: str) -> dict:
    _cleanup()
    if session_id not in _store:
        _store[session_id] = {
            "data": _default_context(),
            "last_accessed": _now(),
        }
    else:
        _store[session_id]["last_accessed"] = _now()
    return deepcopy(_store[session_id]["data"])


def update_context(session_id: str, updates: dict) -> None:
    if session_id not in _store:
        _store[session_id] = {
            "data": _default_context(),
            "last_accessed": _now(),
        }
    ctx = _store[session_id]["data"]
    ctx.update(updates)
    _store[session_id]["last_accessed"] = _now()


def set_last_tasks(session_id: str, tasks: list[dict]) -> None:
    update_context(session_id, {"last_tasks": tasks})


def set_pending_confirmation(session_id: str, action: Optional[dict]) -> None:
    update_context(session_id, {"pending_confirmation": action})


def get_pending_confirmation(session_id: str) -> Optional[dict]:
    return get_context(session_id).get("pending_confirmation")


def set_recent_intent(session_id: str, intent: str) -> None:
    update_context(session_id, {"recent_intent": intent})


def add_conversation_turn(session_id: str, role: str, content: str) -> None:
    ctx = get_context(session_id)
    history = ctx.get("conversation_history", [])
    history.append({"role": role, "content": content})
    # Keep last 10 turns only
    history = history[-10:]
    update_context(session_id, {"conversation_history": history})


def clear_session(session_id: str) -> None:
    if session_id in _store:
        del _store[session_id]
