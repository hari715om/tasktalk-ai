"""
Conversation Service — Orchestrates the full voice pipeline turn.
Receives transcript → extracts intent → resolves references → executes task action → builds response.
"""
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.schemas.intent import IntentResult, IntentType
from app.services import task_service, context_service, llm_service
from app.utils.temporal import parse_date_expression, parse_time_expression, format_date_natural, get_today

logger = logging.getLogger(__name__)


async def process_turn(
    user_text: str,
    session_id: str,
    user_id: str | None,
    db: AsyncSession,
) -> dict:
    """
    Full pipeline for one conversation turn.
    Returns: { "response_text": str, "tasks": [...], "event": str }
    """
    ctx = context_service.get_context(session_id)
    context_service.add_conversation_turn(session_id, "user", user_text)

    # ── 1. Extract intent ────────────────────────────────────────────────────
    intent_result: IntentResult = await llm_service.extract_intent(user_text, ctx)
    logger.info(f"Intent: {intent_result.intent} | text: {user_text!r}")
    context_service.set_recent_intent(session_id, intent_result.intent.value)

    # ── 2. Handle CONFIRM / CANCEL (pending confirmation) ────────────────────
    if intent_result.intent in (IntentType.CONFIRM, IntentType.CANCEL):
        return await _handle_confirmation(intent_result, session_id, user_id, db, ctx)

    # ── 3. Route by intent ───────────────────────────────────────────────────
    if intent_result.intent == IntentType.CREATE_TASK:
        return await _handle_create(intent_result, session_id, user_id, db)

    if intent_result.intent == IntentType.READ_TASKS:
        return await _handle_read(intent_result, session_id, user_id, db)

    if intent_result.intent == IntentType.UPDATE_TASK:
        return await _handle_update(intent_result, session_id, user_id, db, ctx)

    if intent_result.intent == IntentType.DELETE_TASK:
        return await _handle_delete(intent_result, session_id, user_id, db, ctx)

    # ── 4. Unknown / clarification ───────────────────────────────────────────
    if intent_result.clarification_needed:
        question = intent_result.clarification_question or "Could you clarify what you'd like to do?"
        return {"response_text": question, "tasks": [], "event": "CLARIFICATION"}

    return {
        "response_text": "I didn't quite catch that. Could you say it again?",
        "tasks": [],
        "event": "UNKNOWN",
    }


# ─── Intent Handlers ─────────────────────────────────────────────────────────

async def _handle_create(intent: IntentResult, session_id: str, user_id, db: AsyncSession) -> dict:
    created = []
    for entity in intent.tasks:
        task = await task_service.create_task(db, entity, user_id)
        created.append(task.to_dict())

    context_service.set_last_tasks(session_id, created)

    if not created:
        return {"response_text": "I couldn't figure out the task details. What would you like to create?", "tasks": [], "event": "ERROR"}

    all_tasks = await task_service.get_all_tasks(db, user_id)
    action_result = {
        "created": created,
        "count": len(created),
        "fallback_message": _create_fallback(created),
    }
    response = await llm_service.generate_response(action_result, "CREATE_TASK", {})
    context_service.add_conversation_turn(session_id, "assistant", response)
    return {"response_text": response, "tasks": [t.to_dict() for t in all_tasks], "event": "TASK_CREATED"}


async def _handle_read(intent: IntentResult, session_id: str, user_id, db: AsyncSession) -> dict:
    # Parse date & period filters
    task_date = parse_date_expression(intent.time_context) if intent.time_context else get_today()
    time_period = None
    if intent.time_context in ("morning", "afternoon", "evening", "night"):
        time_period = intent.time_context
        task_date = get_today()

    tasks = await task_service.find_tasks_by_filter(db, user_id, task_date, intent.time_context, time_period)

    # Store for context references
    context_service.set_last_tasks(session_id, [t.to_dict() for t in tasks])

    all_tasks = await task_service.get_all_tasks(db, user_id)

    if not tasks:
        period_str = f"{time_period} " if time_period else ""
        date_str = format_date_natural(task_date) if task_date else "today"
        response = f"You have no {period_str}tasks for {date_str}."
    else:
        action_result = {
            "tasks": [t.to_dict() for t in tasks],
            "count": len(tasks),
            "date_context": format_date_natural(task_date) if task_date else "today",
            "time_period": time_period,
            "summary": task_service.format_tasks_for_speech(tasks),
            "fallback_message": f"You have {task_service.format_tasks_for_speech(tasks)}.",
        }
        response = await llm_service.generate_response(action_result, "READ_TASKS", {})

    context_service.add_conversation_turn(session_id, "assistant", response)
    return {"response_text": response, "tasks": [t.to_dict() for t in all_tasks], "event": "TASKS_READ"}


async def _handle_update(intent: IntentResult, session_id: str, user_id, db: AsyncSession, ctx: dict) -> dict:
    # Resolve which task to update
    task, confidence, match_type = await task_service.resolve_reference(
        db, user_id, intent.references, ctx.get("last_tasks", [])
    )

    if not task and intent.tasks:
        # Try matching by title from new entity
        entity = intent.tasks[0]
        if entity.title:
            all_tasks = await task_service.get_all_tasks(db, user_id)
            matches = [t for t in all_tasks if entity.title.lower() in t.title.lower()]
            if matches:
                task = matches[0]
                confidence = 0.80

    if not task or confidence < 0.5:
        return {
            "response_text": "I couldn't find which task you'd like to update. Could you be more specific?",
            "tasks": [],
            "event": "CLARIFICATION",
        }

    # If confidence is moderate, suggest closest match
    if confidence < 0.75:
        confirm_action = {
            "action": "UPDATE_TASK",
            "task_ids": [task.id],
            "description": f"update '{task.title}'",
            "entity": intent.tasks[0].model_dump() if intent.tasks else {},
        }
        context_service.set_pending_confirmation(session_id, confirm_action)
        return {
            "response_text": f"Did you mean the task '{task.title}'? Say yes to update it.",
            "tasks": [],
            "event": "CONFIRMATION_NEEDED",
        }

    updated_entity = intent.tasks[0] if intent.tasks else None
    if not updated_entity:
        return {"response_text": "What would you like to change about the task?", "tasks": [], "event": "CLARIFICATION"}

    task = await task_service.update_task(db, task, updated_entity)
    context_service.set_last_tasks(session_id, [task.to_dict()])

    all_tasks = await task_service.get_all_tasks(db, user_id)
    action_result = {
        "updated": task.to_dict(),
        "fallback_message": f"Done! I've updated '{task.title}'.",
    }
    response = await llm_service.generate_response(action_result, "UPDATE_TASK", {})
    context_service.add_conversation_turn(session_id, "assistant", response)
    return {"response_text": response, "tasks": [t.to_dict() for t in all_tasks], "event": "TASK_UPDATED"}


async def _handle_delete(intent: IntentResult, session_id: str, user_id, db: AsyncSession, ctx: dict) -> dict:
    task, confidence, match_type = await task_service.resolve_reference(
        db, user_id, intent.references, ctx.get("last_tasks", [])
    )

    # Try title from task entity if no reference resolved
    if not task and intent.tasks:
        entity = intent.tasks[0]
        if entity.title:
            all_tasks = await task_service.get_all_tasks(db, user_id)
            matches = [t for t in all_tasks if entity.title.lower() in t.title.lower()]
            if len(matches) == 1:
                task = matches[0]
                confidence = 0.85

    if not task:
        return {
            "response_text": "I couldn't find which task to delete. Could you describe it more clearly?",
            "tasks": [],
            "event": "CLARIFICATION",
        }

    # Low confidence → ask for clarification with best guess
    if confidence < 0.75:
        confirm_action = {
            "action": "DELETE_TASK",
            "task_ids": [task.id],
            "description": f"delete '{task.title}'",
        }
        context_service.set_pending_confirmation(session_id, confirm_action)
        return {
            "response_text": f"I couldn't find that exact task. Did you mean '{task.title}'?",
            "tasks": [],
            "event": "CONFIRMATION_NEEDED",
        }

    # Always confirm before deleting
    confirm_action = {
        "action": "DELETE_TASK",
        "task_ids": [task.id],
        "description": f"delete '{task.title}'",
    }
    context_service.set_pending_confirmation(session_id, confirm_action)
    return {
        "response_text": f"Just to confirm — should I delete '{task.title}'?",
        "tasks": [],
        "event": "CONFIRMATION_NEEDED",
    }


async def _handle_confirmation(
    intent: IntentResult, session_id: str, user_id, db: AsyncSession, ctx: dict
) -> dict:
    pending = context_service.get_pending_confirmation(session_id)

    if not pending:
        return {"response_text": "There's nothing waiting for confirmation.", "tasks": [], "event": "NOOP"}

    if intent.intent == IntentType.CANCEL:
        context_service.set_pending_confirmation(session_id, None)
        return {"response_text": "Alright, cancelled. What else can I help with?", "tasks": [], "event": "CANCELLED"}

    # CONFIRM
    action = pending.get("action")
    task_ids = pending.get("task_ids", [])
    entity_data = pending.get("entity")
    context_service.set_pending_confirmation(session_id, None)

    if action == "DELETE_TASK":
        deleted = []
        for tid in task_ids:
            task = await task_service.get_task_by_id(db, tid)
            if task:
                await task_service.delete_task(db, task)
                deleted.append(task.title)
        all_tasks = await task_service.get_all_tasks(db, user_id)
        names = ", ".join(f"'{n}'" for n in deleted)
        response = f"Done! I've deleted {names}." if deleted else "The task was already removed."
        return {"response_text": response, "tasks": [t.to_dict() for t in all_tasks], "event": "TASK_DELETED"}

    if action == "UPDATE_TASK" and entity_data and task_ids:
        from app.schemas.intent import TaskEntity
        task = await task_service.get_task_by_id(db, task_ids[0])
        if task:
            entity = TaskEntity(**entity_data)
            task = await task_service.update_task(db, task, entity)
            all_tasks = await task_service.get_all_tasks(db, user_id)
            response = f"Updated! '{task.title}' has been changed."
            return {"response_text": response, "tasks": [t.to_dict() for t in all_tasks], "event": "TASK_UPDATED"}

    return {"response_text": "Done!", "tasks": [], "event": "CONFIRMED"}


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _create_fallback(created: list[dict]) -> str:
    if len(created) == 1:
        t = created[0]
        time_str = f" at {t['task_time']}" if t.get("task_time") else ""
        return f"Got it! I've added '{t['title']}'{time_str}."
    titles = ", ".join(f"'{t['title']}'" for t in created)
    return f"Done! I've created {len(created)} tasks: {titles}."
