# Astro position swap

User authorized implementation without a design approval step.

- [x] Restore existing details to the sidebar occupied by Astro; anchor Astro to the central workspace bottom on all tabs.
- [x] Replace starter cards with one contextual, explicitly accepted inline prompt; preserve drafts/history and simplify source presentation.
- [x] Add click-away deselection on the visible globe plus keyboard/explicit clear, without clearing the other body's reference or treating drag/control interaction as a click-away.
- [x] Cover selected/unselected suggestions, drafts, collapsed chat, globe deselection and controls in tests.
- [x] Verify desktop/mobile and zoom behavior; run frontend tests, build, backend tests. Leave local services running.
- [x] Document verified 2026 submission requirements and Vercel readiness; defer public hosting because a public repository is acceptable and the backend requires separate deployment validation.

Verification: 142 frontend tests; TypeScript/production build; 325 backend tests passed, one skipped. Headless Chrome verified placement, suggestion acceptance, no-selection mode, primary-click/Escape clearing, drag/control preservation, cross-body references, persisted drafts/history, native mobile dialog and source access above the composer. Local frontend and API return HTTP 200. Another session changed the shared checkout to jasmine/judge-review; no branch reset, commit or push was performed.
