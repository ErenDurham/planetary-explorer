# GitHub Pages deployment

The public app runs the existing Python API in a browser worker using Pyodide
314.0.8. It does not require a Python server or account on another hosting service.
The Python calculation/retrieval code and shipped scientific data are bundled from
an explicit allowlist. No `.env`, credentials, analyst notebooks or acquisition
caches are published. The repository remains private; published app assets and
included runtime source/data are accessible to visitors, as with other browser apps.

## Deploy

The `Deploy GitHub Pages` Actions workflow builds on pushes to `main`.
Repository Settings → Pages must use **GitHub Actions**.

1. Acquire the original NASA MOLA raster with its existing acquisition script.
2. Build the allowlisted backend/data ZIP and copy verified imagery to static assets.
3. Build Vite with `VITE_BASE_PATH=/planetary-explorer/` and `VITE_PAGES_PYTHON=true`.
4. Publish the `frontend/dist` artifact through the Pages workflow.

Pyodide and its pinned package set load from the public CDN. Pydantic Settings
2.12.0 is installed as a pure-Python dependency. The first visit needs an internet
connection and takes longer while scientific libraries load; subsequent downloads
can use the browser cache. The UI reports progress. Python executes in a separate
worker so it does not block globe interaction. Requests are serialized; cancellation
prevents stale responses from being applied.

The same ASGI routes, validation models and scientific engines run in the worker.
The adapter runs synchronous endpoints inline because native thread pools are not
available there. No model keys are exposed. Cloud/local LLM providers are disabled;
existing rule-based and citation-backed deterministic explanations remain available.

Research notes are saved **on the visitor's device in browser storage**, then
restored into the worker on reload. They are not shared or synced between people.
Export records to keep a portable copy. Browser storage failures surface as errors.
The original discovery survey remains immutable and its checksum is verified.

The original 33 MB MOLA product is loaded lazily when expedition endpoints are
first requested. Imagery is served as copied static assets, with original data
credits retained by the manifest. File-response routes are not used for images.

## Local build

```bash
python backend/scripts/fetch_mola.py
python backend/scripts/build_pages_bundle.py
cd frontend
VITE_BASE_PATH=/planetary-explorer/ VITE_PAGES_PYTHON=true npm run build
```

Serve the output beneath `/planetary-explorer/` when testing. Opening `index.html`
through `file://` does not provide the secure worker/fetch environment required.
Normal local development remains `npm run dev` plus the FastAPI server and does
not use browser Python unless the Pages flag is explicitly enabled.

## Checks

The bundle allowlist has negative tests for `.env`, research notebooks and caches.
Browser smoke tests cover health, site/catalog data, mission interpretation,
discovery, research and expedition capabilities without any backend server.
Standard frontend and backend suites remain applicable. Scores and provenance are
not replaced with fixtures or independently reimplemented in JavaScript.
