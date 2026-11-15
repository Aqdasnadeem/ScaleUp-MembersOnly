"""Load demo CSVs through the API and worker into two isolated businesses.

Start the backend API and worker first. Generate the CSVs with db/seed.py, then
run this script. It prompts for a password unless one is supplied in the
environment; credentials and access tokens are never written to the log.
"""
import getpass
import os
import pathlib
import sys
import time
from datetime import datetime, timezone

import httpx

ROOT = pathlib.Path(__file__).resolve().parents[2]
FILES = ROOT / "db" / "seed_files" / "files"
LOG = ROOT / "db" / "seed_run_log.txt"
API = os.environ.get("API_URL", "http://localhost:8000")
ACCOUNTS = (
    (os.environ.get("DEMO_EMAIL", "demo@scaleup.test"), "Demo Traders"),
    (os.environ.get("OTHER_EMAIL", "corner@scaleup.test"), "Corner Store"),
)
ORDER = ("sales", "inventory", "expenses", "feedback")


def log(message):
    line = "%s %s" % (datetime.now(timezone.utc).isoformat(timespec="seconds"), message)
    print(message)
    with LOG.open("a", encoding="utf-8") as output:
        output.write(line + "\n")


def get_token(client, email, business_name, password):
    response = client.post("/auth/login", json={"email": email, "password": password})
    if response.status_code == 401:
        response = client.post(
            "/auth/signup",
            json={
                "business_name": business_name,
                "email": email,
                "password": password,
            },
        )
        response.raise_for_status()
        log("created account %s for %s" % (email, business_name))
    else:
        response.raise_for_status()
        log("using existing account %s for %s" % (email, business_name))
    account = response.json()
    if account["business_name"] != business_name:
        raise RuntimeError(
            "%s belongs to %s, expected %s"
            % (email, account["business_name"], business_name)
        )
    return account["access_token"], account["business_id"]


def upload_business(client, token, business_name):
    headers = {"Authorization": "Bearer " + token}
    for kind in ORDER:
        path = FILES / (kind + ".csv")
        response = client.post(
            "/uploads",
            headers=headers,
            data={"upload_type": kind},
            files={"file": (path.name, path.read_bytes(), "text/csv")},
        )
        if response.status_code == 409:
            log("%s %-10s already loaded (same file content)" % (business_name, kind))
            continue
        if response.status_code != 202:
            response.raise_for_status()
            raise RuntimeError("%s upload returned unexpected HTTP %s" % (kind, response.status_code))

        job_id = response.json()["job_id"]
        for _ in range(120):
            job_response = client.get("/uploads/" + job_id, headers=headers)
            job_response.raise_for_status()
            job = job_response.json()
            if job["status"] not in ("pending", "processing"):
                break
            time.sleep(1)
        else:
            raise TimeoutError("%s upload job %s did not finish in 120 seconds" % (kind, job_id))

        message = (
            "%s %-10s %-24s loaded=%s rejected=%s"
            % (
                business_name,
                kind,
                job["status"],
                job["loaded_rows"],
                job["rejected_rows"],
            )
        )
        log(message)
        if job["status"] not in ("completed", "completed_with_warnings"):
            raise RuntimeError("%s upload failed: %s" % (kind, job.get("message") or job["status"]))


def main():
    missing = [kind for kind in ORDER if not (FILES / (kind + ".csv")).is_file()]
    if missing:
        raise FileNotFoundError(
            "Missing demo CSVs (%s); run db/seed.py first." % ", ".join(missing)
        )

    shared_password = os.environ.get("DEMO_PASSWORD") or getpass.getpass(
        "demo password for both accounts (min 8 characters): "
    )
    passwords = (
        shared_password,
        os.environ.get("CORNER_STORE_PASSWORD") or shared_password,
    )
    log("starting demo load for %s" % ", ".join(name for _, name in ACCOUNTS))
    try:
        with httpx.Client(base_url=API, timeout=60) as client:
            authenticated = [
                (business_name, *get_token(client, email, business_name, password))
                for (email, business_name), password in zip(ACCOUNTS, passwords)
            ]
            if authenticated[0][2] == authenticated[1][2]:
                raise RuntimeError("the demo accounts must belong to separate businesses")
            for business_name, token, _business_id in authenticated:
                upload_business(client, token, business_name)
    except (httpx.HTTPError, OSError, RuntimeError, TimeoutError) as error:
        log("demo load failed: %s" % error)
        raise
    log("demo load finished")


if __name__ == "__main__":
    try:
        main()
    except (httpx.HTTPError, OSError, RuntimeError, TimeoutError) as error:
        sys.exit(str(error))
