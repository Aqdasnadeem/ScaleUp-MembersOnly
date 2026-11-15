"""P2-08-BE: POST /auth/signup (FR-AUTH-01), POST /auth/login (FR-AUTH-02), GET /auth/me.
Wrong password and unknown email give the SAME 401 text (no detail leak). The password is never logged or returned."""
import re
import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from . import config
from .auth import create_token, current_business_id
from .routes_uploads import get_conn
from .security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
BAD_LOGIN = "Incorrect email or password"
_DUMMY_HASH = hash_password("dummy-password-for-timing")          # so an unknown email takes as long as a wrong password

class Credentials(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=128)
    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = v.strip().lower()
        if not _EMAIL.match(v): raise ValueError("enter a valid email address")
        return v

class SignupIn(Credentials):
    business_name: str = Field(min_length=1, max_length=255)
    @field_validator("business_name")
    @classmethod
    def _name(cls, v):
        v = " ".join(v.split())
        if not v: raise ValueError("business name is required")
        return v
    @field_validator("password")
    @classmethod
    def _pw(cls, v):
        if len(v) < config.MIN_PASSWORD_LENGTH: raise ValueError("password must be at least %d characters" % config.MIN_PASSWORD_LENGTH)
        return v

def _token_reply(user_id, business_id, name):
    return {"access_token": create_token(user_id, business_id), "token_type": "bearer", "business_id": str(business_id), "business_name": name}

@router.post("/signup", status_code=201)
def signup(body: SignupIn, conn=Depends(get_conn)):
    cur = conn.cursor()
    try:
        cur.execute("insert into businesses(business_name) values(%s) returning business_id", (body.business_name,))
        biz = cur.fetchone()[0]
        cur.execute("insert into users(business_id,email,password_hash) values(%s,%s,%s) returning user_id",
                    (biz, body.email, hash_password(body.password)))
        uid = cur.fetchone()[0]
        conn.commit()
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "this email is already registered")          # FR-AUTH-01: duplicate email rejected
    return _token_reply(uid, biz, body.business_name)

@router.post("/login")
def login(body: Credentials, conn=Depends(get_conn)):
    cur = conn.cursor()
    cur.execute("select u.user_id,u.business_id,u.password_hash,b.business_name from users u join businesses b using(business_id) where u.email=%s", (body.email,))
    row = cur.fetchone()
    ok = verify_password(body.password, row[2] if row else _DUMMY_HASH)
    if not row or not ok:
        raise HTTPException(401, BAD_LOGIN)
    return _token_reply(row[0], row[1], row[3])

@router.get("/me")
def me(business=Depends(current_business_id), conn=Depends(get_conn)):
    cur = conn.cursor()
    cur.execute("select business_name, currency, date_format from businesses where business_id=%s", (business,))
    r = cur.fetchone()
    if not r: raise HTTPException(401, "invalid token")
    return {"business_id": str(business), "business_name": r[0], "currency": r[1], "date_format": r[2]}
