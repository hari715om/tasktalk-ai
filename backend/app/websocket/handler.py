"""
WebSocket Handler — Real-time voice pipeline endpoint.
Handles: VOICE_INPUT, INTERRUPT, PING, CONFIRMATION
Sends:   AI_RESPONSE, TASK_UPDATE, STOP_AUDIO, ERROR, PONG
"""
import json
import logging
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.services import conversation_service, context_service
from app.services.auth_service import decode_token, get_user_by_id

logger = logging.getLogger(__name__)

# Active connections map: session_id → WebSocket
_connections: dict[str, WebSocket] = {}
# Interrupt flags: session_id → bool
_interrupted: dict[str, bool] = {}


async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    # ── Auth via query param token (optional) ────────────────────────────────
    token = websocket.query_params.get("token")
    user_id = None
    if token:
        token_data = decode_token(token)
        if token_data:
            # Validate that user_id from JWT actually exists in current DB
            async with AsyncSessionLocal() as db:
                user = await get_user_by_id(db, token_data.user_id)
                if user:
                    user_id = token_data.user_id
                else:
                    logger.warning(
                        f"JWT user_id={token_data.user_id} not found in DB "
                        f"(stale token after DB reset). Treating as guest."
                    )
                    # Send auth error so frontend clears the stale token
                    await _send(websocket, {
                        "type": "AUTH_ERROR",
                        "message": "Session expired. Please sign in again."
                    })

    session_id = websocket.query_params.get("session_id", f"anon_{id(websocket)}")
    _connections[session_id] = websocket
    _interrupted[session_id] = False

    logger.info(f"WS connected: session={session_id} user={user_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await _send(websocket, {"type": "ERROR", "message": "Invalid JSON"})
                continue

            event_type = message.get("type", "")

            # ── PING ─────────────────────────────────────────────────────────
            if event_type == "PING":
                await _send(websocket, {"type": "PONG"})
                continue

            # ── SYNC (Initial load tasks) ────────────────────────────────────
            if event_type == "SYNC":
                try:
                    async with AsyncSessionLocal() as db:
                        from app.services.task_service import get_all_tasks
                        tasks = await get_all_tasks(db, user_id=user_id)
                        await _send(websocket, {
                            "type": "TASK_UPDATE",
                            "tasks": [t.to_dict() for t in tasks]
                        })
                except Exception as e:
                    logger.error(f"Sync error: {e}", exc_info=True)
                continue

            # ── INTERRUPT ────────────────────────────────────────────────────
            if event_type == "INTERRUPT":
                _interrupted[session_id] = True
                await _send(websocket, {"type": "STOP_AUDIO"})
                logger.info(f"Interrupt received: session={session_id}")
                continue

            # ── VOICE_INPUT ──────────────────────────────────────────────────
            if event_type == "VOICE_INPUT":
                transcript = message.get("transcript", "").strip()
                if not transcript:
                    continue

                _interrupted[session_id] = False

                # Signal thinking state
                await _send(websocket, {"type": "THINKING"})

                try:
                    async with AsyncSessionLocal() as db:
                        result = await conversation_service.process_turn(
                            user_text=transcript,
                            session_id=session_id,
                            user_id=user_id,
                            db=db,
                        )
                        await db.commit()
                        logger.info(f"DB commit OK — event={result.get('event')} tasks={len(result.get('tasks') or [])}")

                    # Check if interrupted during processing
                    if _interrupted.get(session_id):
                        _interrupted[session_id] = False
                        await _send(websocket, {"type": "STOP_AUDIO"})
                        continue

                    await _send(websocket, {
                        "type": "AI_RESPONSE",
                        "text": result["response_text"],
                        "event": result.get("event", "RESPONSE"),
                    })

                    if result.get("tasks") is not None:
                        await _send(websocket, {
                            "type": "TASK_UPDATE",
                            "tasks": result["tasks"],
                        })

                except Exception as e:
                    logger.error(f"Pipeline error: {e}", exc_info=True)
                    await _send(websocket, {
                        "type": "AI_RESPONSE",
                        "text": "Sorry, I ran into an issue. Please try again.",
                        "event": "ERROR",
                    })

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: session={session_id}")
    except Exception as e:
        logger.error(f"WS error: {e}", exc_info=True)
    finally:
        _connections.pop(session_id, None)
        _interrupted.pop(session_id, None)


async def _send(ws: WebSocket, data: dict):
    try:
        await ws.send_text(json.dumps(data, default=str))
    except Exception as e:
        logger.warning(f"Send error: {e}")
