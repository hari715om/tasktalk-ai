"""
Tasks Router — REST endpoints for direct task access and verification.
GET  /api/v1/tasks        — list all pending tasks for logged-in user
POST /api/v1/tasks        — create a task directly (for testing)
PATCH /api/v1/tasks/{id}  — mark a task complete
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.task import TaskCreate, TaskOut
from app.services.task_service import get_all_tasks, create_task, get_task_by_id, delete_task
from app.schemas.intent import TaskEntity
from app.routers.auth import get_current_user
from app.models.task import TaskStatus
from typing import Optional
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.services.auth_service import decode_token, get_user_by_id

router = APIRouter(tags=["tasks"])
bearer_scheme = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[str]:
    """Returns user_id if authenticated, None if guest."""
    if not credentials:
        return None
    token_data = decode_token(credentials.credentials)
    if not token_data:
        return None
    user = await get_user_by_id(db, token_data.user_id)
    return user.id if user else None


@router.get("/tasks", response_model=list[dict])
async def list_tasks(
    db: AsyncSession = Depends(get_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Get all pending tasks for the current user/session."""
    tasks = await get_all_tasks(db, user_id)
    return [t.to_dict() for t in tasks]


@router.patch("/tasks/{task_id}/complete", response_model=dict)
async def complete_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Mark a task as completed."""
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = TaskStatus.completed
    await db.commit()
    return {"status": "completed", "id": task_id}


@router.delete("/tasks/{task_id}", response_model=dict)
async def remove_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: Optional[str] = Depends(get_optional_user),
):
    """Hard-delete a task."""
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await delete_task(db, task)
    await db.commit()
    return {"status": "deleted", "id": task_id}
