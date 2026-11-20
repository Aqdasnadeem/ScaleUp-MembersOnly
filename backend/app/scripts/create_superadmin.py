"""Create the one super admin account. There is no public admin sign-up route (by design).

Reads SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD from the environment (never pass them on the
command line or print them). Idempotent: running it again with the same email just reports the
existing account instead of making a second one.

    py -m app.scripts.create_superadmin
"""
import os
import sys

from app import db
from app.security import hash_password

_MIN_PASSWORD_LENGTH = 8


def main() -> int:
    email = os.environ.get("SUPERADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("SUPERADMIN_PASSWORD", "")
    if not email or "@" not in email:
        print("SUPERADMIN_EMAIL is not set to a valid-looking email address.", file=sys.stderr)
        return 1
    if len(password) < _MIN_PASSWORD_LENGTH:
        print("SUPERADMIN_PASSWORD is not set, or is shorter than %d characters." % _MIN_PASSWORD_LENGTH, file=sys.stderr)
        return 1

    conn = db.connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id, role FROM users WHERE email = %s", (email,))
        existing = cur.fetchone()
        if existing is not None:
            if existing[1] != "super_admin":
                print("A user with this email already exists and is not a super admin; nothing changed.", file=sys.stderr)
                return 1
            print("A super admin with this email already exists (user_id=%s); nothing changed." % existing[0])
            return 0

        cur.execute(
            "INSERT INTO users(business_id, email, password_hash, role, is_active) "
            "VALUES (NULL, %s, %s, 'super_admin', true) RETURNING user_id",
            (email, hash_password(password)),
        )
        user_id = cur.fetchone()[0]
        conn.commit()
        print("Created super admin %s (user_id=%s)." % (email, user_id))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
