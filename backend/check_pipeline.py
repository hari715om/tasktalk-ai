"""Diagnostic script — verifies the full DB write pipeline end-to-end."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
os.chdir(os.path.dirname(__file__))

async def main():
    from app.database import AsyncSessionLocal, init_db
    from app.models.task import Task, TaskStatus, TaskPriority

    print("=== Step 1: Initialise DB ===")
    await init_db()
    print("  DB tables created/verified OK")

    print("\n=== Step 2: Write a test task ===")
    async with AsyncSessionLocal() as db:
        import uuid
        from datetime import date, time
        task = Task(
            id=str(uuid.uuid4()),
            user_id=None,
            title="DIAGNOSTIC TEST TASK",
            description="Auto-created by check_pipeline.py",
            priority=TaskPriority.high,
            task_date=date.today(),
            task_time=time(9, 0),
            status=TaskStatus.pending,
        )
        db.add(task)
        await db.flush()
        print(f"  flush OK — task id={task.id}")
        await db.commit()
        print("  commit OK")

    print("\n=== Step 3: Read back the task ===")
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Task).where(Task.title == "DIAGNOSTIC TEST TASK"))
        found = result.scalars().all()
        print(f"  Found {len(found)} task(s) in DB")
        for t in found:
            print(f"    → id={t.id}  title={t.title}  date={t.task_date}  priority={t.priority}")

    print("\n=== Step 4: Count ALL tasks ===")
    import sqlite3
    conn = sqlite3.connect('tasktalk.db')
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM tasks")
    print(f"  SQLite raw count: {c.fetchone()[0]}")
    c.execute("SELECT id, user_id, title, status FROM tasks")
    for row in c.fetchall():
        print("  →", row)
    conn.close()
    print("\n=== Diagnostic COMPLETE ===")

asyncio.run(main())
