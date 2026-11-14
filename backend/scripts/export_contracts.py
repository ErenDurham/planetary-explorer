"""Regenerate docs/openapi.json and docs/api_examples.json from the live app.
Run from backend/:  python scripts/export_contracts.py"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run from anywhere

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services import scoring_engine  # noqa: E402

DOCS = Path(__file__).resolve().parents[2] / "docs"


def main() -> int:
    c = TestClient(app)
    (DOCS / "openapi.json").write_text(json.dumps(app.openapi(), indent=2) + "\n")
    m = scoring_engine.default_mission().model_dump()
    ex = {
        "health": c.get("/api/v1/health").json(),
        "sites": c.get("/api/v1/sites?planet=mars").json(),
        "site": c.get("/api/v1/sites/jezero_crater").json(),
        "default_mission": c.get("/api/v1/scoring/default-mission").json(),
        "evaluate_request": {"planet": "mars", "site_ids": None, "mission": m, "client_request_id": "req-42"},
        "match_request": {"mars_site_id": "jezero_crater", "weights": None, "top_k": 3},
        "explain_request": {"site_id": "jezero_crater", "mission": None, "include_analogs": True, "question": None},
    }
    ex["evaluate"] = c.post("/api/v1/scoring/evaluate", json=ex["evaluate_request"]).json()
    ex["match"] = c.post("/api/v1/analogs/match", json=ex["match_request"]).json()
    ex["explain"] = c.post("/api/v1/research/explain", json=ex["explain_request"]).json()
    ex["error_404"] = c.get("/api/v1/sites/nope").json()
    ex["error_422"] = c.post("/api/v1/scoring/evaluate", json={"mission": {"criteria": []}}).json()
    (DOCS / "api_examples.json").write_text(json.dumps(ex, indent=2) + "\n")
    print("wrote docs/openapi.json and docs/api_examples.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
