# Space Apps 2026 submission and hosting

Checked November 14, 2026 against the official [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), [challenge](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/?tab=details), and [Vercel FastAPI documentation](https://vercel.com/docs/frameworks/backend/fastapi).

## Decision

Vercel is optional. The final-project link may be a public code repository; the guide does not require a live application or a particular host. Prioritize a stable demo, public project files, and the submission page. Deploy once the demonstration flow is stable, with time for production checks—not in the final minutes. No public deployment was performed in this change.

## Submission essentials

- Submit using **Submit for Judging**, not only Save Progress, by November 15, 2026 at 11:59 p.m. in your Local Event's time zone. For Universal Event teams, use the Team Owner's residence time zone. Local judging can have an earlier schedule; check with the Local Lead.
- Supply separate public final-project and demo links, without login or access approval. Test signed out.
- The required demo is a video of at most 30 seconds or a deck of at most seven slides, including introductory/title slides. Over-limit demos are ineligible for Global Judging.
- Complete all required fields in English. Non-English demo speech needs English subtitles; slides must be English.
- Use at least one NASA resource for Global Award eligibility, and credit data, code, images and other resources. Disclose AI/SI assistance and identify generated code/data in description/metadata; generated images/video need visible indicators. Do not create AI-generated NASA branding.

The challenge emphasizes finding and characterizing terrestrial analogs using NASA/partner Earth, Moon and Mars data, presented as a map or tool. Describe our current Mars/Earth curated-candidate prototype honestly; ranking known examples is not proof of discovering new analog locations.

## Vercel path for this repository

A Vite frontend alone does not host the FastAPI endpoints. Deploy and test both services:

1. Backend project: repository root directory `backend`, detected FastAPI entrypoint `app/main.py`, compatible Python version, committed profile/document/imagery data included. Separate runtime dependencies from data-rebuild/test dependencies before packaging. Do not download source datasets or embedding models at request time.
2. Backend configuration: `LLM_PROVIDER=anthropic`, a supported `LLM_MODEL`, optional server-only `ANTHROPIC_API_KEY`, `EMBEDDING_BACKEND=local`, and `CORS_ORIGINS` listing the actual frontend origin(s). Install the Anthropic SDK in production for live Claude; verify fallback without it.
3. Frontend project: root `frontend`, framework Vite, build `npm run build`, output `dist`. Set `VITE_API_BASE_URL` to the deployed HTTPS backend origin before building. Never use localhost in the production build or expose the Claude key through `VITE_` variables.
4. Check Vercel's current Python function size/duration limits against installed runtime dependencies and bundled data. Profile generation scripts are not production endpoints.
5. Smoke-test health, profiles, scoring, Earth/Mars ranking, imagery, evidence and Astro against production URLs. Verify cross-origin requests, a fresh browser, mobile layout, missing-key fallback, and actual model access when configured.
6. Ensure judges can access the submitted production URL without Vercel sign-in/deployment protection. Public access to Claude-backed endpoints also needs bounded usage and rate limiting; a server-side key alone does not control public API costs.

Before submitting a repository link, push the team's reviewed final work to the branch referenced by that link. Local edits are not automatically part of the remote repository; verify the submission link points to the reviewed final commit. Keep a public repository and the short demo as the submission fallback even if a hosted app is added.
