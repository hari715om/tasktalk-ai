from pydantic import BaseModel
from datetime import date, time, datetime
from typing import Optional
from app.models.task import TaskStatus, TaskPriority


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: Optional[TaskPriority] = TaskPriority.none
    task_date: Optional[date] = None
    task_time: Optional[time] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[TaskPriority] = None
    task_date: Optional[date] = None
    task_time: Optional[time] = None
    status: Optional[TaskStatus] = None


class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    priority: TaskPriority
    task_date: Optional[date] = None
    task_time: Optional[time] = None
    status: TaskStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
