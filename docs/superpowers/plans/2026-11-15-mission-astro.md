# Mission and Astro Implementation Plan

**Goal:** Accurate catalogue screening with useful grounded chat across pages.
**Architecture:** Deterministic scoring owns ranks and comparison facts; optional AI phrases them. Mission limitations are reconstructed server-side from the objective. A focused comparison helper resolves names/ordinals and summarizes factors.
**Tech Stack:** FastAPI/Pydantic, pytest, React/Zustand, Vitest.

- [x] Add backend regressions in `backend/tests/test_astro.py` for screenshot comparisons, ordinal ties, research limitations, no unrelated evidence and provider errors. Run and verify failures.
- [x] Create `backend/app/services/astro_comparison.py` for candidate resolution and deterministic explanations. Integrate in `astro_engine.py`; supply both candidates and limitations to model. Filter Astro evidence by geography. Verify regressions.
- [x] Add regression prompts in `backend/tests/test_objective_screening.py` for supported mineral synonyms and ignored criteria. Fix parsing only where tests establish a defect.
- [x] Add frontend page-context regressions in `frontend/src/components/astro/AstroPanel.test.tsx`. Scope assessments and history to the active context; improve fallback labels. Verify tests.
- [x] Run mission/backend regression suite, frontend suite and build; live HTTP checks for user prompt and comparison questions. Record data limitations and test evidence.

Review refinements: ordinals mean displayed list positions; full-precision rank controls tie explanations. Named comparisons outside the top three, omitted/invalid model replies, stale Research context, and displayed Earth–Mars pairs have regressions.
