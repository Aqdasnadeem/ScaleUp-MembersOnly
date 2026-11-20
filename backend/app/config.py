"""Settings. Every limit is one constant here (BR-13, BR-22): no magic numbers in the logic."""
import os
import datetime as dt

BAD_ROW_LIMIT = 0.20                 # BR-12/BR-13: more than 20% bad rows -> nothing is saved
ERROR_REPORT_MAX = 1000              # error_report keeps at most this many entries; the counts stay exact
DATE_MIN = dt.date(2000, 1, 1)       # BR-22
DATE_TZ = os.environ.get("DATE_TZ", "Asia/Karachi")   # BR-22: "today" is the business's calendar day, not the server's (sir, 5 Nov)
DATE_MAX_DAYS_AHEAD = 0              # BR-22: latest allowed date = today in DATE_TZ (set 1 to allow tomorrow)

def today_local() -> dt.date:
    from zoneinfo import ZoneInfo
    return dt.datetime.now(ZoneInfo(DATE_TZ)).date()
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "50"))      # FR-UP-02
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")             # EI-07: original file is kept after the job
UPLOAD_TYPES = ("sales", "inventory", "expenses", "feedback")    # BR-01

def jwt_secret() -> str:
    s = os.environ.get("JWT_SECRET")
    if not s:
        raise RuntimeError("JWT_SECRET is not set (use an environment variable, never a file in the repo)")
    return s

TOKEN_MINUTES = int(os.environ.get("TOKEN_MINUTES", "60"))       # NFR-SEC-02: token lifetime 60 min or less
MIN_PASSWORD_LENGTH = 8

WORKER_MAX_ATTEMPTS = 3              # P2-51: a job is tried at most 3 times, and only for TEMPORARY failures
WORKER_RETRY_WAIT_SECONDS = 2        # waits 2 s, then 4 s between attempts
WORKER_STUCK_MINUTES = 15            # P2-51: a job 'processing' longer than this belongs to a crashed worker and goes back to pending
WORKER_POLL_SECONDS = 2              # how often the worker looks for a pending job when there is none

# P2-28: PROPOSED default, pending advisor confirmation (sir, 18 Nov). Overridden by the
# EXPENSE_RUPEE_THRESHOLD environment variable when set.
EXPENSE_MIN_RUPEE_INCREASE_DEFAULT = 1000

# Plan limits (super admin ticket's Feature 2). One dict, no DB table: a business's limits come
# only from its effective plan ('free' or 'pro'; see app/billing.py:effective_plan), looked up here.
# questions_per_day is for the /agent/ask ticket, which does not exist yet - kept here for later, unused now.
PLAN_LIMITS = {
    "free": {"uploads_per_month": 5, "max_rows_per_file": 10_000, "questions_per_day": 20},
    "pro": {"uploads_per_month": 100, "max_rows_per_file": 200_000, "questions_per_day": 500},
}
