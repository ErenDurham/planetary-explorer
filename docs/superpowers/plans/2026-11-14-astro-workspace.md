# Astro workspace implementation plan

Goal: Relocate Explore details into a central sheet, add a grounded conversational assistant across tabs, and keep globe descriptions readable during zoom.

Architecture: Reuse RightSidebar content in LocationDetails. Keep Astro mounted alongside the workspace; use a typed FastAPI endpoint with authoritative context, bounded history, retrieval and validated navigation. Keep marker geometry world-scaled and labels screen-sized.

- [x] Add backend contract tests for offline guidance, valid locations, bounded history, grounded output, action allowlist and failures; run red.
- [x] Implement models/astro.py and services/astro_engine.py; add thin route. Run backend tests.
- [x] Add detail-sheet and Astro interaction tests; run red.
- [x] Implement reusable responsive panel, central location details and session chat state. Wire App and typed API.
- [x] Reproduce hover scaling in browser, change label rendering, verify both bodies and zoom extremes.
- [x] Run frontend tests, typecheck/build and backend suite; review diff and responsive/keyboard behavior. No commits, pushes or deployment.

Verified: 136 frontend tests; frontend TypeScript + production build; 323 backend tests passed, one skipped. Headless Chrome visual checks covered desktop/mobile details, Astro fallback and history, Earth/Mars navigation, reset/focus, and constant hover-card dimensions at zoom extremes. Claude network calls were not made; the configured key is absent. Existing chart/test warnings and vendor-bundle size warnings remain.
