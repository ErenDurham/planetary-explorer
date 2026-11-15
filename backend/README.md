# Backend

FastAPI + Pydantic v2. Python 3.11+.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt            # core (CI installs only this)
pip install -r requirements-ai.txt         # optional: ChromaDB embeddings + Anthropic LLM
python -m pytest -q
uvicorn app.main:app --reload              # http://localhost:8000/docs
```

| Path | What | Owner |
|---|---|---|
| `app/models/` | Pydantic models = the API contract; `docs/openapi.json` is generated from them | shared, frozen |
| `app/api/routes.py` | the six `/api/v1` endpoints, structured error envelope | E5 |
| `app/services/data_loader.py` | loads versioned profiles; the only module that touches the filesystem | E2 |
| `app/services/scoring_engine.py`, `ranking_engine.py`, `analog_engine.py` | deterministic engines over `app/config/*.json` | E3 |
| `app/services/retrieval_engine.py`, `explanation_engine.py` | retrieval + citation-backed explanations with deterministic fallback | E4 |
| `scripts/` | reproducible pipeline: fetch -> validate -> sample -> derive -> QC -> store | E2 |
| `data/` | versioned outputs (committed) and `raw/` downloads (gitignored) | E2 |
| `tests/` | pytest; runs offline on the committed data | all |

Regenerate the contract docs after changing a model:

```bash
python scripts/export_contracts.py && (cd ../frontend && npm run gen:types)
```

### Free AI setup (Groq)

Create a key at https://console.groq.com/keys and keep the account on the **Free** plan.
In the repo-root `.env`, set `LLM_PROVIDER=groq`, `LLM_MODEL=openai/gpt-oss-120b`,
and `GROQ_API_KEY=<your key>`. Restart the backend after saving.
This uses the existing HTTP client; no optional AI SDK is required for Groq.
Free quotas apply. Missing keys, quota errors, and invalid responses use the
labelled deterministic fallback; the app never automatically calls a paid provider.
Scientific scores and citations remain validated by the backend.
