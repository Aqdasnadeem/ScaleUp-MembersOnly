"""PostgreSQL connection from the standard libpq environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
No password in code or in the repository (NFR-SEC-03)."""


"""import psycopg2
import psycopg2.extras

psycopg2.extras.register_uuid()          # uuid.UUID values go in and come out as UUID objects

def connect():
    return psycopg2.connect()"""



"""PostgreSQL connection using environment variables."""

"""import os
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load backend/.env
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(ENV_FILE)

psycopg2.extras.register_uuid()

def connect():
    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=os.environ.get("PGPORT", "5432"),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ["PGDATABASE"],
        sslmode=os.environ.get("PGSSLMODE", "require"),
    )"""


"""PostgreSQL connection using environment variables."""

from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

psycopg2.extras.register_uuid()

def connect():
    return psycopg2.connect()