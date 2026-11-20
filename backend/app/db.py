"""PostgreSQL connection from the standard libpq environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
No password in code or in the repository (NFR-SEC-03)."""
import psycopg2
import psycopg2.extras
import psycopg2.pool

psycopg2.extras.register_uuid()          # uuid.UUID values go in and come out as UUID objects

def connect():
    return psycopg2.connect()

# A fresh TCP + auth handshake to Postgres on every request measured ~130-170ms of fixed
# overhead per request (EXPLAIN ANALYZE showed the queries themselves run in under 1ms - sir,
# 20 Nov). Pooling is for the request-path dependencies only (routes_uploads.get_conn,
# auth._conn, billing._conn); the worker and pipeline keep using connect() directly since they
# are not the "button click" path this was measured against.
_pool = None

def _get_pool():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 10)
    return _pool

def pool_connect():
    return _get_pool().getconn()

def pool_release(conn):
    _get_pool().putconn(conn)
