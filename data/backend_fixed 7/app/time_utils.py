from datetime import datetime, timedelta


def time_of_day(dt: datetime) -> timedelta:
    """A datetime's time-of-day as a timedelta — the shape asyncpg needs to
    bind against an `interval`-typed column/parameter. Binding a plain
    "HH:MM:SS" string against `$N::interval` fails at the wire-protocol
    level (asyncpg's interval codec expects a real timedelta, not text —
    unlike a literal string inside SQL, which Postgres itself would happily
    cast), so every caller needs an actual timedelta, never a formatted str.
    """
    return timedelta(hours=dt.hour, minutes=dt.minute, seconds=dt.second)


def parse_hms(s: str) -> timedelta:
    """Parse a "HH:MM:SS" string into a timedelta, for GTFS-style times —
    including past-midnight values like "25:30:00" that `datetime.strptime`
    can't represent as a time-of-day but are valid as a duration.
    """
    h, m, sec = (int(part) for part in s.split(":"))
    return timedelta(hours=h, minutes=m, seconds=sec)
