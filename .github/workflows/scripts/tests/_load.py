"""Load a collector script as a module, from COLLECTOR_SCRIPTS_DIR if set (used to run
the same tests against an untouched copy of the original scripts), else from ../"""
import importlib.util
import os
import sys

DEFAULT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.environ.get("COLLECTOR_SCRIPTS_DIR", DEFAULT_DIR)

# The scripts read these at import time; tests never touch the network.
os.environ.setdefault("SUPABASE_URL", "https://supabase.test")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-key")


def load(name):
    path = os.path.join(SCRIPTS_DIR, f"{name}.py")
    if SCRIPTS_DIR not in sys.path:
        sys.path.insert(0, SCRIPTS_DIR)
    spec = importlib.util.spec_from_file_location(f"under_test_{name}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
