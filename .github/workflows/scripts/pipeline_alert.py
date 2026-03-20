import argparse
import os
import json
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--stage")
parser.add_argument("--day")
parser.add_argument("--error")
args = parser.parse_args()

RESEND_KEY = os.environ["RESEND_API_KEY"]
ADMIN = os.environ["ADMIN_EMAIL"]

payload = {
    "from": "pipeline@mena-intel-desk.com",
    "to": [ADMIN],
    "subject": f"[MENA Intel] Pipeline FAILED — Day {args.day} | Stage: {args.stage}",
    "html": f"""
    <h2>Pipeline Failure — Day {args.day}</h2>
    <p><strong>Stage:</strong> {args.stage}</p>
    <p><strong>Error:</strong> {args.error}</p>
    <p><strong>Action:</strong> No data was written to the database.
    Run the pipeline manually or review GitHub Actions logs.</p>
    <p>Model: claude-sonnet-4-6 | Schema validation: ACTIVE</p>
    """
}

req = urllib.request.Request(
    "https://api.resend.com/emails",
    data=json.dumps(payload).encode(),
    headers={"Authorization": f"Bearer {RESEND_KEY}", "Content-Type": "application/json"},
    method="POST"
)
with urllib.request.urlopen(req) as r:
    print(f"Alert sent: HTTP {r.status}")
