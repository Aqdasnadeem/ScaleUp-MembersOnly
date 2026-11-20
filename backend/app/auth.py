"""P2-08-BE: token handling. FR-AUTH-02 (JWT carries business_id), FR-AUTH-03 (the business is NEVER taken from the
request body or URL; only from the signed token). Every other router depends on `current_business_id`.

Super admin (added for the admin ticket): a token now also carries `role` ("business_user" or "super_admin").
`current_business_id` rejects a super_admin token with 403 (admins do not use business data routes) and, for a
business_user token, does one PK lookup to confirm the user is still active and the business is still active
(FR: a suspended/deactivated account is rejected even with an old, still-unexpired token). `require_super_admin`
is the equivalent dependency for the /admin router."""
import datetime as dt
import uuid
import jwt
from fastapi import Depends, Header, HTTPException
from .config import jwt_secret, TOKEN_MINUTES
from .db import pool_connect, pool_release

def create_token(user_id, business_id, role: str = "business_user") -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {
        "sub": str(user_id),
        "business_id": str(business_id) if business_id else None,
        "role": role,
        "iat": now,
        "exp": now + dt.timedelta(minutes=TOKEN_MINUTES),
    }
    return jwt.encode(claims, jwt_secret(), algorithm="HS256")

def _conn():
    """A request-scoped connection for this module only, so auth.py never imports routes_uploads.py
    (routes_uploads.py already imports from auth.py; importing its get_conn back here would be circular)."""
    conn = pool_connect()
    try:
        yield conn
    finally:
        pool_release(conn)

def _decode(authorization: str) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing token")
    try:
        return jwt.decode(authorization[7:], jwt_secret(), algorithms=["HS256"])     # checks signature and exp
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid token")

def current_business_id(authorization: str = Header(default=""), conn=Depends(_conn)) -> uuid.UUID:
    claims = _decode(authorization)
    if claims.get("role", "business_user") == "super_admin":
        raise HTTPException(403, "super admin accounts do not use business data routes")
    try:
        business_id = uuid.UUID(claims["business_id"])
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(401, "invalid token")

    cursor = conn.cursor()
    cursor.execute(
        "SELECT u.is_active, b.status FROM users u JOIN businesses b ON b.business_id = u.business_id "
        "WHERE u.user_id = %s AND u.business_id = %s",
        (user_id, business_id),
    )
    row = cursor.fetchone()
    if row is None or not row[0]:
        raise HTTPException(401, "invalid token")                      # user deactivated or no longer exists
    if row[1] != "active":
        raise HTTPException(403, "this business account is suspended")
    return business_id

def require_super_admin(authorization: str = Header(default=""), conn=Depends(_conn)) -> uuid.UUID:
    """Dependency for the /admin router. Returns the admin's user_id (for the audit log)."""
    claims = _decode(authorization)
    if claims.get("role") != "super_admin":
        raise HTTPException(403, "super admin access required")
    try:
        user_id = uuid.UUID(claims["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(401, "invalid token")

    cursor = conn.cursor()
    cursor.execute("SELECT is_active FROM users WHERE user_id = %s AND role = 'super_admin'", (user_id,))
    row = cursor.fetchone()
    if row is None or not row[0]:
        raise HTTPException(401, "invalid token")
    return user_id
