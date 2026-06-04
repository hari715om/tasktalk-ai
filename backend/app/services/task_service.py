"""
Task Service — Full CRUD with smart matching.
Matching priority: context match → exact title match → time match → fuzzy/semantic match.
"""
import logging
from datetime import date, time as time_type, datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from app.models.task import Task, TaskStatus
from app.schemas.intent import TaskEntity, TaskReference
from app.utils.temporal import (
    parse_date_expression,
    parse_time_expression,
    time_matches_period,
    format_time_natural,
    format_date_natural,
    get_today,
)

logger = logging.getLogger(__name__)


# ─── CRUD helpers ────────────────────────────────────────────────────────────

async def create_task(db: AsyncSession, entity: TaskEntity, user_id: Optional[str]) -> Task:
    task_date = parse_date_expression(entity.task_date)
    task_time = parse_time_expression(entity.task_time or entity.time_period)

    # Convert intent string to TaskPriority Enum
    from app.models.task import TaskPriority
    try:
        priority_enum = TaskPriority(entity.priority.lower()) if entity.priority else TaskPriority.none
    except ValueError:
        priority_enum = TaskPriority.none

    task = Task(
        title=entity.title or "Untitled Task",
        description=entity.description,
        priority=priority_enum,
        task_date=task_date or get_today(),
        task_time=task_time,
        user_id=user_id,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


async def get_all_tasks(
    db: AsyncSession,
    user_id: Optional[str],
    status: TaskStatus = TaskStatus.pending,
) -> list[Task]:
    stmt = select(Task).where(Task.status == status)
    if user_id:
        stmt = stmt.where(Task.user_id == user_id)
    else:
        stmt = stmt.where(Task.user_id.is_(None))
    stmt = stmt.order_by(Task.task_date.asc().nullslast(), Task.task_time.asc().nullslast())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_task_by_id(db: AsyncSession, task_id: str) -> Optional[Task]:
    result = await db.execute(select(Task).where(Task.id == task_id))
    return result.scalar_one_or_none()


async def update_task(
    db: AsyncSession,
    task: Task,
    entity: TaskEntity,
) -> Task:
    if entity.title:
        task.title = entity.title
    if entity.description:
        task.description = entity.description
    if entity.priority and entity.priority.lower() != "none":
        from app.models.task import TaskPriority
        try:
            task.priority = TaskPriority(entity.priority.lower())
        except ValueError:
            pass
    if entity.task_date:
        task.task_date = parse_date_expression(entity.task_date)
    if entity.task_time or entity.time_period:
        task.task_time = parse_time_expression(entity.task_time or entity.time_period)
    task.updated_at = datetime.utcnow()
    await db.flush()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task: Task) -> Task:
    task.status = TaskStatus.deleted
    task.updated_at = datetime.utcnow()
    await db.flush()
    return task


# ─── Smart Matching ──────────────────────────────────────────────────────────

async def find_tasks_by_filter(
    db: AsyncSession,
    user_id: Optional[str],
    task_date: Optional[date] = None,
    time_context: Optional[str] = None,
    time_period: Optional[str] = None,
) -> list[Task]:
    """Find tasks matching date + optional time period filter."""
    all_tasks = await get_all_tasks(db, user_id)

    results = all_tasks
    if task_date:
        results = [t for t in results if t.task_date == task_date]

    if time_period:
        results = [t for t in results if t.task_time and time_matches_period(t.task_time, time_period)]
    elif time_context in ("morning", "afternoon", "evening", "night"):
        results = [t for t in results if t.task_time and time_matches_period(t.task_time, time_context)]

    return results


async def resolve_reference(
    db: AsyncSession,
    user_id: Optional[str],
    references: list[TaskReference],
    last_tasks: list[dict],
) -> tuple[Optional[Task], float, str]:
    """
    Resolve a task reference. Returns (task, confidence, match_type).
    Priority: context → exact → time → fuzzy.
    """
    all_tasks = await get_all_tasks(db, user_id)

    for ref in references:
        # Context-based: "the previous one", "that task"
        if ref.type == "previous" and last_tasks:
            last_id = last_tasks[0].get("id") if last_tasks else None
            if last_id:
                task = await get_task_by_id(db, last_id)
                if task and task.status == TaskStatus.pending:
                    return task, 0.95, "context"

        # Nth reference: "the second one"
        if ref.type == "nth" and ref.value and last_tasks:
            try:
                idx = int(ref.value) - 1
                if 0 <= idx < len(last_tasks):
                    task_id = last_tasks[idx].get("id")
                    task = await get_task_by_id(db, task_id)
                    if task:
                        return task, 0.90, "context_nth"
            except (ValueError, IndexError):
                pass

        # Title match: "the LinkedIn task"
        if ref.type == "title_match" and ref.value:
            keyword = ref.value.lower()
            matches = [t for t in all_tasks if keyword in t.title.lower()]
            if len(matches) == 1:
                return matches[0], 0.90, "exact_title"
            if len(matches) > 1:
                return matches[0], 0.70, "fuzzy_title"

        # Time match: "the 9:15 task"
        if ref.type == "time_match" and ref.value:
            parsed_time = parse_time_expression(ref.value)
            if parsed_time:
                matches = [t for t in all_tasks if t.task_time == parsed_time]
                if len(matches) == 1:
                    return matches[0], 0.90, "exact_time"
                if len(matches) > 1:
                    # Return closest in time
                    return matches[0], 0.70, "fuzzy_time"

    # Low confidence — no good match
    return None, 0.0, "none"


def tasks_to_dict_list(tasks: list[Task]) -> list[dict]:
    return [t.to_dict() for t in tasks]


def format_task_for_speech(task: Task) -> str:
    """Format a single task for spoken output."""
    parts = [task.title]
    if task.task_time:
        parts.append(f"at {format_time_natural(task.task_time)}")
    if task.task_date:
        date_str = format_date_natural(task.task_date)
        if date_str not in ("today",):
            parts.append(date_str)
    return " ".join(parts)


def format_tasks_for_speech(tasks: list[Task]) -> str:
    """Format a list of tasks for natural spoken output."""
    if not tasks:
        return "no tasks"
    if len(tasks) == 1:
        return format_task_for_speech(tasks[0])
    items = [format_task_for_speech(t) for t in tasks]
    return ", ".join(items[:-1]) + f", and {items[-1]}"
