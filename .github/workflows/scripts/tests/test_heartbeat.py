"""heartbeat.py: one POST to /rest/v1/job_heartbeats, never raises.

Run:  cd .github/workflows/scripts && python3 -m unittest tests.test_heartbeat -v
Uses a local HTTP server on 127.0.0.1 standing in for PostgREST; no external network.
"""
import http.server
import json
import os
import sys
import threading
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

heartbeat = _load.load("heartbeat")


class _Handler(http.server.BaseHTTPRequestHandler):
    status = 201
    seen = []

    def do_POST(self):  # noqa: N802
        body = self.rfile.read(int(self.headers["Content-Length"]))
        _Handler.seen.append((self.path, {k.lower(): v for k, v in self.headers.items()}, json.loads(body)))
        self.send_response(_Handler.status)
        self.end_headers()

    def log_message(self, *a):
        pass


class HeartbeatTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.srv.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        _Handler.seen.clear()
        _Handler.status = 201
        self.env = mock.patch.dict(os.environ, {"SUPABASE_URL": self.url, "SUPABASE_SERVICE_KEY": "svc-test",
                                                "HEARTBEAT_DISABLED": "0", "NO_PROXY": "127.0.0.1",
                                                "no_proxy": "127.0.0.1"})
        self.env.start()
        self.argv = mock.patch.object(sys, "argv", ["collect_markets.py"])
        self.argv.start()

    def tearDown(self):
        self.env.stop()
        self.argv.stop()

    def test_posts_row_with_service_key(self):
        self.assertTrue(heartbeat.beat("collect-markets", "ok", "13 indicators"))
        path, headers, body = _Handler.seen[0]
        self.assertEqual(path, "/rest/v1/job_heartbeats")
        self.assertEqual(body, {"job": "collect-markets", "status": "ok", "detail": "13 indicators"})
        self.assertEqual(headers["apikey"], "svc-test")
        self.assertEqual(headers["authorization"], "Bearer svc-test")
        self.assertEqual(headers["prefer"], "return=minimal")

    def test_missing_table_is_not_fatal(self):
        _Handler.status = 404  # PostgREST answers 404 before the migration is applied
        self.assertFalse(heartbeat.beat("collect-markets", "ok"))

    def test_unreachable_is_not_fatal(self):
        with mock.patch.dict(os.environ, {"SUPABASE_URL": "http://127.0.0.1:9"}):
            self.assertFalse(heartbeat.beat("collect-markets", "ok", timeout=2))

    def test_skips_without_env_dry_run_or_disabled(self):
        with mock.patch.dict(os.environ, {"SUPABASE_SERVICE_KEY": ""}):
            self.assertFalse(heartbeat.beat("collect-markets"))
        with mock.patch.object(sys, "argv", ["scenario_daily.py", "run", "--dry-run"]):
            self.assertFalse(heartbeat.beat("scenario-daily"))
        with mock.patch.dict(os.environ, {"HEARTBEAT_DISABLED": "1"}):
            self.assertFalse(heartbeat.beat("collect-markets"))
        self.assertEqual(_Handler.seen, [])

    def test_bad_status_and_long_detail_are_clamped(self):
        heartbeat.beat("collect-markets", "weird", "x" * 5000)
        body = _Handler.seen[0][2]
        self.assertEqual(body["status"], "warn")
        self.assertEqual(len(body["detail"]), 2000)


if __name__ == "__main__":
    unittest.main()
