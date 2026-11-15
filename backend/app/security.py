"""FR-AUTH-04: passwords are stored only as salted hashes. scrypt from the Python standard library (no extra package).
Format kept in users.password_hash:  scrypt$N$r$p$<salt b64>$<hash b64>   (the parameters travel with the hash, so they can be raised later)."""
import base64
import hashlib
import hmac
import os

N, R, P = 2 ** 14, 8, 1

def _b64(b: bytes) -> str: return base64.b64encode(b).decode("ascii")

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=N, r=R, p=P, dklen=32)
    return "scrypt$%d$%d$%d$%s$%s" % (N, R, P, _b64(salt), _b64(h))

def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, h = stored.split("$")
        if scheme != "scrypt": return False
        got = hashlib.scrypt(password.encode("utf-8"), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(got, base64.b64decode(h))
    except (ValueError, TypeError):
        return False                                   # e.g. the seed placeholder '!placeholder-cannot-log-in'

if __name__ == "__main__":                              # py -m app.security  -> prints a hash for SEED_PASSWORD_HASH
    import getpass
    print(hash_password(getpass.getpass("password to hash: ")))
