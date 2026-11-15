"""P2-08-BE: token handling. FR-AUTH-02 (JWT carries business_id), FR-AUTH-03 (the business is NEVER taken from the
request body or URL; only from the signed token). Every other router depends on `current_business_id`."""
import datetime as dt
import uuid
import jwt
from fastapi import Header, HTTPException
from .config import jwt_secret, TOKEN_MINUTES

def create_token(user_id, business_id) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {"sub": str(user_id), "business_id": str(business_id), "iat": now, "exp": now + dt.timedelta(minutes=TOKEN_MINUTES)}
    return jwt.encode(claims, jwt_secret(), algorithm="HS256")

def current_business_id(authorization: str = Header(default="")) -> uuid.UUID:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing token")
    try:
        claims = jwt.decode(authorization[7:], jwt_secret(), algorithms=["HS256"])     # checks signature and exp
        return uuid.UUID(claims["business_id"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(401, "invalid token")
