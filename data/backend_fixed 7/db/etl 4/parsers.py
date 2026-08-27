"""
Parsing helpers for the source CSVs (_poi_chennai.csv, chennaiFood.csv).

The source data is hand-curated and has messy/inconsistent formatting:
- both a hyphen '-' and an en-dash '–' are used for ranges
- some numeric fields are blank
- "Time_Needed_hr" mixes a real range ('2-3 hr') with categorical values
  ('Half-day', 'Full-day')
- "Best_Time_to_Visit" conflates time-of-day ('Morning/Evening') with
  seasonal advice ('November-February', 'December-January (Margazhi season)')

These helpers turn that into clean, typed data. Every parser keeps the raw
original string too (nothing is silently discarded).
"""
import re

_DASH_RE = re.compile(r'[-\u2013\u2014]')  # hyphen, en-dash, em-dash
_MONTHS = {
    'january','february','march','april','may','june','july','august',
    'september','october','november','december', 'novenber',  # source has this typo
}
_TIME_OF_DAY_WORDS = {
    'morning': 'Morning', 'afternoon': 'Afternoon', 'evening': 'Evening',
    'night': 'Night', 'sunrise': 'Sunrise', 'daytime': 'Daytime', 'anytime': 'Anytime',
}

TIME_NEEDED_MAP = {
    # categorical -> (min_hr, max_hr) — documented assumption, tune as needed
    'half-day': (4, 6),
    'full-day': (7, 10),
}


def parse_numeric_range(raw: str):
    """'50-100' / '450–600' / '0' / '' / '500' -> (min, max) as float or None."""
    if raw is None:
        return None, None
    s = raw.strip()
    if s == '':
        return None, None
    parts = [p.strip() for p in _DASH_RE.split(s) if p.strip() != '']
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None, None
    if not nums:
        return None, None
    if len(nums) == 1:
        return nums[0], nums[0]
    return min(nums), max(nums)


def parse_time_needed(raw: str):
    """'2-3 hr' -> (2,3); 'Half-day' -> (4,6); 'Full-day' -> (7,10)."""
    if not raw:
        return None, None
    s = raw.strip().lower()
    if s in TIME_NEEDED_MAP:
        return TIME_NEEDED_MAP[s]
    s_num = s.replace('hr', '').replace('hrs', '').strip()
    lo, hi = parse_numeric_range(s_num)
    return lo, hi


def parse_best_time(raw: str):
    """
    Split the conflated 'Best_Time_to_Visit' field into:
      - time_of_day: list[str] drawn from the known time-of-day vocabulary
      - season: str | None  (kept as free text, e.g. 'November-February')
    """
    if not raw:
        return [], None
    s = raw.strip()
    tokens = re.split(r'[/,]', s)
    times, season_tokens = [], []
    for tok in tokens:
        t = tok.strip()
        if not t:
            continue
        low = t.lower()
        # strip a parenthetical aside, e.g. 'December-January (Margazhi season)'
        base = re.sub(r'\(.*?\)', '', low).strip()
        month_words = _DASH_RE.split(base)
        if any(w.strip() in _MONTHS for w in month_words):
            season_tokens.append(t)
        elif low in _TIME_OF_DAY_WORDS:
            times.append(_TIME_OF_DAY_WORDS[low])
        else:
            # unrecognised token — keep as season/free-text bucket rather than dropping it
            season_tokens.append(t)
    season = '; '.join(season_tokens) if season_tokens else None
    return times, season


def split_multi(raw: str):
    """'Peaceful,Relaxing,Scenic' / 'Youthful, Foodie,Peaceful' -> clean list, dedup, order kept."""
    if not raw:
        return []
    parts = [p.strip() for p in raw.split(',')]
    seen, out = set(), []
    for p in parts:
        if p and p.lower() not in seen:
            seen.add(p.lower())
            out.append(p)
    return out
