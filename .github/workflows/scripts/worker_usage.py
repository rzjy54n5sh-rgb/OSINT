#!/usr/bin/env python3
"""
Daily Workers request-usage check for the Free plan (100,000 requests/day; over the limit
Cloudflare answers error 1027 until 00:00 UTC). Operator ruling 2026-10-07.

Reads YESTERDAY's (UTC) total requests for the Worker script from the Cloudflare GraphQL
Analytics API, prints the count and % of 100k, and exits non-zero (so GitHub emails the repo
owner) when it is above the alert threshold. Stdlib only, no paid API, nothing written anywhere.

Query shape verified 2026-10-07 against Cloudflare's docs:
  https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/
  dataset `workersInvocationsAdaptive` (beta), filter {scriptName, datetime_geq, datetime_leq},
  field `sum { requests }`; endpoint https://api.cloudflare.com/client/v4/graphql.
Token permission (docs): Account > Account Analytics > Read
  https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
Error format (200 with `errors`, or 401/403):
  https://developers.cloudflare.com/analytics/graphql-api/errors/

CAVEAT: `workersInvocationsAdaptive` counts Worker *invocations*. With Workers Cache enabled
(wrangler.jsonc `cache.enabled`), cache HITs and static-asset requests also count toward the
100k/day limit but do not run the Worker, so they are most likely NOT in this number. Treat the
result as a lower bound; the dashboard (Workers & Pages > mena-intel-desk > Metrics) is the
authoritative total. The script also lists any other `workers*` datasets the token can see, so a
dataset that includes cached requests can be adopted later without guessing.
"""
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request

ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql'
FREE_LIMIT = 100_000
THRESHOLD = int(os.environ.get('ALERT_THRESHOLD', '70000'))
SCRIPT = os.environ.get('WORKER_SCRIPT', 'mena-intel-desk')
PERMISSION_HINT = (
    'The CLOUDFLARE_API_TOKEN secret lacks the GraphQL Analytics permission. In the Cloudflare '
    'dashboard (My Profile > API Tokens > edit the token) add: Account > Account Analytics > Read '
    '(for this account), then re-run this workflow. If the API reports "Authentication failed", the '
    'token itself is invalid or expired: regenerate it with that permission (plus the Workers '
    'permissions the Deploy workflow already uses).'
)

QUERY = """
query WorkerRequests($accountTag: string, $start: string, $end: string, $script: string) {
  viewer {
    accounts(filter: {accountTag: $accountTag}) {
      workersInvocationsAdaptive(limit: 100, filter: {
        scriptName: $script,
        datetime_geq: $start,
        datetime_leq: $end
      }) {
        sum { requests errors }
        dimensions { scriptName }
      }
    }
  }
}
"""


def gql(token: str, query: str, variables: dict | None = None) -> tuple[int, dict]:
    body = json.dumps({'query': query, 'variables': variables or {}}).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read() or b'{}')
        except ValueError:
            payload = {}
        return e.code, payload


def is_auth_error(status: int, payload: dict) -> bool:
    if status in (401, 403):
        return True
    for err in payload.get('errors') or []:
        msg = str(err.get('message', '')).lower()
        code = str((err.get('extensions') or {}).get('code', err.get('code', ''))).lower()
        # 403/authz = token lacks the permission; 9106/10000/"authentication" = token invalid or expired
        if any(k in msg for k in ('not authorized', 'unauthorized', 'authentication')) or code in ('authz', 'authn', '9106', '10000'):
            return True
    return False


def summary(line: str) -> None:
    print(line)
    path = os.environ.get('GITHUB_STEP_SUMMARY')
    if path:
        with open(path, 'a', encoding='utf-8') as f:
            f.write(line + '\n')


def main() -> int:
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '').strip()
    account = os.environ.get('CLOUDFLARE_ACCOUNT_ID', '').strip()
    if not token or not account:
        print('::error::CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID repo secrets are required.')
        return 1

    day = dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)
    start, end = f'{day}T00:00:00Z', f'{day}T23:59:59Z'
    status, payload = gql(token, QUERY, {'accountTag': account, 'start': start, 'end': end, 'script': SCRIPT})

    if is_auth_error(status, payload):
        print(f'::error::{PERMISSION_HINT}')
        print(f'(HTTP {status}; API said: {[e.get("message") for e in payload.get("errors") or []]})')
        return 1
    if status != 200 or payload.get('errors'):
        print(f'::error::GraphQL query failed (HTTP {status}): {json.dumps(payload.get("errors"))[:800]}')
        return 1

    accounts = ((payload.get('data') or {}).get('viewer') or {}).get('accounts') or []
    if not accounts:
        print('::error::No account returned — check that CLOUDFLARE_ACCOUNT_ID is the account tag of the token\'s account.')
        return 1
    rows = accounts[0].get('workersInvocationsAdaptive') or []
    requests = sum(int((r.get('sum') or {}).get('requests') or 0) for r in rows)
    errors = sum(int((r.get('sum') or {}).get('errors') or 0) for r in rows)
    pct = requests / FREE_LIMIT * 100

    summary(f'### Worker usage — {SCRIPT}, {day} (UTC)')
    summary(f'- Worker invocations (workersInvocationsAdaptive.sum.requests): **{requests:,}** = **{pct:.1f}%** of the {FREE_LIMIT:,}/day Free limit')
    summary(f'- Invocation errors (incl. exceeded CPU, 1102): {errors:,}')
    summary(f'- Alert threshold: {THRESHOLD:,}')
    summary('- Lower bound: Workers Cache HITs and static-asset requests also count toward the limit but are not Worker invocations.')

    # Best-effort discovery (never fails the job): which workers* datasets can this token query?
    st2, intro = gql(token, '{ __type(name: "account") { fields { name } } }')
    names = [f['name'] for f in (((intro.get('data') or {}).get('__type') or {}).get('fields') or [])]
    workers_sets = sorted(n for n in names if n.lower().startswith('workers'))
    if workers_sets:
        print('workers* datasets visible to this token:', ', '.join(workers_sets))

    if requests > THRESHOLD:
        print(f'::error::{SCRIPT} served {requests:,} Worker requests on {day} ({pct:.1f}% of the Free plan\'s '
              f'{FREE_LIMIT:,}/day; alert at {THRESHOLD:,}). Above 100k Cloudflare returns error 1027 until 00:00 UTC. '
              'Options: find the traffic source in the Cloudflare dashboard; with Workers Cache on, static assets '
              'count too, so wrangler.jsonc cache.enabled=false lowers the count (but re-exposes 1102 CPU errors); '
              'or move to Workers Paid (Omar decides).')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
