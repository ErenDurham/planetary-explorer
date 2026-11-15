"""Export just discovery schemas, preserving other teams' generated files."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from app.api.discovery_routes import router

app = FastAPI(title="Planetary Explorer discovery-v1", version="discovery-v1")
app.include_router(router)
target = Path(__file__).resolve().parents[2] / "docs" / "discovery-openapi.json"
target.write_text(json.dumps(app.openapi(), indent=2) + "\n")
print(target)
