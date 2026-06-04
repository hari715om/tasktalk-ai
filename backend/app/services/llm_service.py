"""
LLM Service — Groq integration for intent extraction.
Uses structured JSON output with strict schema enforcement.
"""
import json
import logging
from groq import AsyncGroq
from app.config import get_settings
from app.schemas.intent import IntentResult, IntentType, TaskEntity, TaskReference
from app.prompts.system_prompt import SYSTEM_PROMPT, build_context_prompt

logger = logging.getLogger(__name__)
settings = get_settings()

_client: AsyncGroq | None = None


def get_groq_client() -> AsyncGroq:
    global _client
    if _client is None:
        _client = AsyncGroq(api_key=settings.groq_api_key)
    return _client


async def extract_intent(user_text: str, session_context: dict) -> IntentResult:
    """
    Call Groq LLM to extract structured intent from user speech.
    Falls back gracefully on any error.
    """
    if not settings.groq_api_key:
        logger.warning("GROQ_API_KEY not set — returning UNKNOWN intent")
        return IntentResult(intent=IntentType.UNKNOWN, raw_text=user_text)

    context_str = build_context_prompt(session_context)

    user_message = f"""Context:
{context_str}

User said: "{user_text}"

Return ONLY the JSON object."""

    try:
        client = get_groq_client()
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=1024,
            timeout=10.0,
        )

        raw_json = response.choices[0].message.content
        data = json.loads(raw_json)

        # Parse tasks
        tasks = [TaskEntity(**t) for t in data.get("tasks", [])]
        references = [TaskReference(**r) for r in data.get("references", [])]

        return IntentResult(
            intent=IntentType(data.get("intent", "UNKNOWN")),
            tasks=tasks,
            references=references,
            time_context=data.get("time_context"),
            confirmation_required=data.get("confirmation_required", False),
            clarification_needed=data.get("clarification_needed", False),
            clarification_question=data.get("clarification_question"),
            raw_text=user_text,
        )

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error from LLM: {e}")
        return IntentResult(intent=IntentType.UNKNOWN, raw_text=user_text)
    except Exception as e:
        logger.error(f"Groq API error: {e}")
        return IntentResult(
            intent=IntentType.UNKNOWN,
            raw_text=user_text,
            clarification_needed=True,
            clarification_question="I had trouble understanding that. Could you please repeat?",
        )


async def generate_response(
    action_result: dict,
    intent: str,
    session_context: dict,
) -> str:
    """
    Generate a natural, conversational voice response from the action result.
    Returns plain text ready for TTS.
    """
    if not settings.groq_api_key:
        return action_result.get("fallback_message", "Done.")

    system = """You are TaskTalk, a friendly voice assistant for task management.
Generate a SHORT, natural spoken response (1-3 sentences max) based on the action result.
- Use conversational language, not robotic lists
- Confirm what was done in natural terms
- For task lists, summarize naturally: "You have a gym session at 7 AM and a team sync at 9 AM"
- For errors, apologize briefly and explain simply
- Never use markdown, bullet points, or formatting — this is spoken aloud
- Keep it concise and warm"""

    user_msg = f"Intent: {intent}\nResult: {json.dumps(action_result, default=str)}"

    try:
        client = get_groq_client()
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.7,
            max_tokens=200,
            timeout=8.0,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Response generation error: {e}")
        return action_result.get("fallback_message", "I've taken care of that for you.")
