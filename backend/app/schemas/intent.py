from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class IntentType(str, Enum):
    CREATE_TASK = "CREATE_TASK"
    READ_TASKS = "READ_TASKS"
    UPDATE_TASK = "UPDATE_TASK"
    DELETE_TASK = "DELETE_TASK"
    CONFIRM = "CONFIRM"
    CANCEL = "CANCEL"
    UNKNOWN = "UNKNOWN"


class TaskEntity(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = Field(default="none", description="high, medium, low, or none")
    task_date: Optional[str] = None   # natural lang: "tomorrow", "today", "2024-12-25"
    task_time: Optional[str] = None   # natural lang: "7 AM", "10:30", "evening"
    time_period: Optional[str] = None  # "morning" | "afternoon" | "evening"


class TaskReference(BaseModel):
    type: str  # "previous" | "nth" | "title_match" | "time_match"
    value: Optional[str] = None   # e.g. "second", "LinkedIn", "9:15"


class IntentResult(BaseModel):
    intent: IntentType
    tasks: List[TaskEntity] = []
    references: List[TaskReference] = []
    time_context: Optional[str] = None   # "today" | "tomorrow" | "morning" | "evening"
    confirmation_required: bool = False
    clarification_needed: bool = False
    clarification_question: Optional[str] = None
    raw_text: Optional[str] = None
