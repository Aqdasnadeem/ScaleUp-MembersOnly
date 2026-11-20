"""P2-07: loads the two demo businesses THROUGH THE REAL APP (sign up / log in, POST /uploads, worker, GET /uploads/{id}).
Needs the API and the worker running (py -m app.worker). Order matters: sales first (it creates the products),
then inventory, expenses, feedback. A file that is already loaded is skipped (409 from the API).

    py scripts/load_demo_data.py          (run from backend/; asks for a password for each account that is not set in the environment)

Environment (all optional):
    API_URL        default http://localhost:8000
    DEMO_EMAIL     default demo@scaleup.test       DEMO_PASSWORD   (else asked)
    DEMO2_EMAIL    default demo2@scaleup.test      DEMO2_PASSWORD  (else asked)
"""
import getpass
import os
import pathlib
import sys
import time

import httpx

API = os.environ.get("API_URL", "http://localhost:8000")
FILES_ROOT = pathlib.Path(__file__).resolve().parents[2] / "db" / "seed_files"   # repo root / db / seed_files
ORDER = ["sales", "inventory", "expenses", "feedback"]
ACCOUNTS = [
    # (business name for sign-up, email, password env var, folder with the CSVs)
    ("Demo Traders", os.environ.get("DEMO_EMAIL", "demo@scaleup.test"), "DEMO_PASSWORD", "files"),
    ("Corner Store", os.environ.get("DEMO2_EMAIL", "demo2@scaleup.test"), "DEMO2_PASSWORD", "files2"),
]


def load_account(client, business_name, email, password, folder):
    r = client.post("/auth/login", json={"email": email, "password": password})
    if r.status_code == 401:                                   # first run: create this business and its user
        r = client.post("/auth/signup", json={"business_name": business_name, "email": email, "password": password})
        print("created account", email, "for", business_name)
    r.raise_for_status()
    h = {"Authorization": "Bearer " + r.json()["access_token"]}
    print("== %s (%s)" % (business_name, email))

    for kind in ORDER:
        path = FILES_ROOT / folder / (kind + ".csv")
        up = client.post("/uploads", headers=h, data={"upload_type": kind},
                         files={"file": (path.name, path.read_bytes(), "text/csv")})
        if up.status_code == 409:
            print("%-10s already loaded earlier (same file content): skipped" % kind)
            continue
        if up.status_code != 202:
            sys.exit("%s: %s %s" % (kind, up.status_code, up.text))
        job = up.json()["job_id"]
        j = {}
        for _ in range(120):                                   # wait for the worker, up to 2 minutes
            j = client.get("/uploads/" + job, headers=h).json()
            if j["status"] not in ("pending", "processing"):
                break
            time.sleep(1)
        print("%-10s %-24s loaded %-5s rejected %-4s %s" % (kind, j["status"], j["loaded_rows"], j["rejected_rows"], j.get("message") or ""))
        if j["status"] in ("pending", "processing"):
            sys.exit("job is still %s: is the worker running (py -m app.worker)?" % j["status"])


def main():
    with httpx.Client(base_url=API, timeout=60) as client:
        for business_name, email, pw_var, folder in ACCOUNTS:
            password = os.environ.get(pw_var) or getpass.getpass("%s password (min 8 characters): " % email)
            load_account(client, business_name, email, password, folder)


if __name__ == "__main__":
    main()
