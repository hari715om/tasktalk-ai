"""
Temporal parsing utilities.
Converts natural language time expressions into concrete Python date/time objects.
"""
from datetime import date, time, timedelta
from dateutil import parser as dateutil_parser
import re


def get_today() -> date:
    return date.today()


def parse_date_expression(expr: str | None) -> date | None:
    """Convert 'today', 'tomorrow', 'next week', ISO strings, etc. → date."""
    if not expr:
        return None
    expr = expr.strip().lower()
    today = get_today()

    if expr in ("today", "now"):
        return today
    if expr in ("tomorrow",):
        return today + timedelta(days=1)
    if expr in ("yesterday",):
        return today - timedelta(days=1)
    if "next week" in expr:
        return today + timedelta(weeks=1)
    if "day after tomorrow" in expr:
        return today + timedelta(days=2)

    # Try ISO / dateutil parsing
    try:
        parsed = dateutil_parser.parse(expr, default=None)
        if parsed:
            return parsed.date()
    except Exception:
        pass

    return None


def parse_time_expression(expr: str | None) -> time | None:
    """
    Convert natural language time → time object.
    Supports: '7 AM', '10:30', '9:15 PM', 'evening', 'morning', 'afternoon'
    """
    if not expr:
        return None
    expr = expr.strip().lower()

    # Named periods → representative times
    period_map = {
        "morning": time(8, 0),
        "afternoon": time(14, 0),
        "evening": time(18, 0),
        "night": time(21, 0),
        "noon": time(12, 0),
        "midnight": time(0, 0),
    }
    if expr in period_map:
        return period_map[expr]

    # Try dateutil parsing
    try:
        parsed = dateutil_parser.parse(expr)
        return parsed.time().replace(second=0, microsecond=0)
    except Exception:
        pass

    # Handle patterns like "7am", "7 am", "10pm"
    match = re.match(r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?", expr)
    if match:
        hour = int(match.group(1))
        minute = int(match.group(2) or 0)
        meridiem = match.group(3)
        if meridiem == "pm" and hour != 12:
            hour += 12
        if meridiem == "am" and hour == 12:
            hour = 0
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return time(hour, minute)

    return None


def get_period_range(period: str) -> tuple[int, int]:
    """Return (start_hour, end_hour) for a named time period."""
    periods = {
        "morning": (5, 11),
        "afternoon": (12, 16),
        "evening": (17, 22),
        "night": (20, 23),
    }
    return periods.get(period.lower(), (0, 23))


def time_matches_period(t: time, period: str) -> bool:
    """Check if a time falls within a named period."""
    start, end = get_period_range(period)
    return start <= t.hour <= end


def format_time_natural(t: time | None) -> str:
    """Format time as natural language: 14:00 → '2 PM', 09:15 → '9:15 AM'"""
    if not t:
        return ""
    hour = t.hour
    minute = t.minute
    meridiem = "AM" if hour < 12 else "PM"
    display_hour = hour if hour <= 12 else hour - 12
    if display_hour == 0:
        display_hour = 12
    if minute:
        return f"{display_hour}:{minute:02d} {meridiem}"
    return f"{display_hour} {meridiem}"


def format_date_natural(d: date | None) -> str:
    """Format date as natural language relative to today."""
    if not d:
        return ""
    today = get_today()
    diff = (d - today).days
    if diff == 0:
        return "today"
    if diff == 1:
        return "tomorrow"
    if diff == -1:
        return "yesterday"
    if 2 <= diff <= 6:
        return f"this {d.strftime('%A')}"
    return d.strftime("%B %d")
