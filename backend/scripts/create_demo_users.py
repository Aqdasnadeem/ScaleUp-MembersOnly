"""Creates the two demo Business-user accounts in two DIFFERENT businesses (sir, 5 Nov: P2-08 must show that a user never sees another business's rows).
Goes through the real API (POST /auth/signup), so passwords are hashed exactly as in the app. There is one role only (Business user).
    py scripts/create_demo_users.py           (API must be running; asks for ONE password used for both accounts)
Environment: API_URL (default http://localhost:8000), DEMO_EMAIL (default demo@scaleup.test, business "Demo Traders"),
OTHER_EMAIL (default other@scaleup.test, business "Other Traders"), DEMO_PASSWORD (else asked). Safe to run again.
Afterwards run scripts/load_demo_data.py (loads the demo CSVs into Demo Traders). The check at the end logs in as the OTHER business
and shows that it sees none of Demo Traders' uploads."""
import getpass
import os
import sys
import httpx

API = os.environ.get("API_URL", "http://localhost:8000")
ACCOUNTS = [(os.environ.get("DEMO_EMAIL", "demo@scaleup.test"), "Demo Traders"),
            (os.environ.get("OTHER_EMAIL", "other@scaleup.test"), "Other Traders")]
PASSWORD = os.environ.get("DEMO_PASSWORD") or getpass.getpass("demo password for both accounts (min 8 characters): ")
c = httpx.Client(base_url=API, timeout=30)
tokens = {}
for email, business in ACCOUNTS:
    r = c.post("/auth/login", json={"email": email, "password": PASSWORD})
    if r.status_code == 401:
        r = c.post("/auth/signup", json={"business_name": business, "email": email, "password": PASSWORD})
        print("created", email, "->", business)
    else:
        print(email, "already exists")
    r.raise_for_status()
    tokens[email] = {"Authorization": "Bearer " + r.json()["access_token"]}
(a, _), (b, _) = ACCOUNTS
jobs_a = c.get("/uploads", headers=tokens[a]).json()["items"]
jobs_b = c.get("/uploads", headers=tokens[b]).json()["items"]
print("%s sees %d uploads; %s sees %d uploads" % (a, len(jobs_a), b, len(jobs_b)))
if jobs_a:
    code = c.get("/uploads/" + jobs_a[0]["job_id"], headers=tokens[b]).status_code
    print("%s opening a job of %s -> HTTP %s (expected 404)" % (b, a, code))
    sys.exit(0 if code == 404 else 1)
