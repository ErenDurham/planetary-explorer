# Research workflow support for Fable

Backend/client support is implemented independently of the pending UI/theme work.

## Download a saved candidate research brief

Call `discoveryEngine.exportResearch(runId, candidateId, signal?)`.
The response includes `filename`, `markdown`, saved `record`, a reproducible
`discovery` JSON snapshot, explicit `limitations`, and schema version
`research-brief-v1`. Download Markdown as text/markdown and optionally the complete
response as application/json. Use a Blob/object URL and revoke it after use.
Render analyst text as text or sanitized Markdown, never unsanitized HTML.

The endpoint is read-only and works through the existing API transport in native
and GitHub Pages modes. It performs no retrieval, source downloads or LLM calls.
It cannot see unsaved form fields: save first, or label the export “last saved
version.” It does not promote research status. Literature reviewed can include a
negative conclusion. Its immutable survey settings do not capture the current UI
ranking/custom weights; if displaying that context alongside a download, label
it separately and include the exact rank response rather than reconstructing it.
Other candidates' notebooks are excluded. Selected malformed notebooks return an
honest 503. Unknown run/candidate returns 404.

## Save and runtime failures

Atomic notebook saves now return data_unavailable/503 on storage errors, retain
the previous record and remove temporary files where possible. Preserve draft
fields after errors; do not show “Saved” until the request succeeds.

Pages transport already reports browser-storage failures; new regression tests
cover successful persistence/restoration and quota failure. Worker crashes now
reject pending requests and future requests until reload, rather than leaving
spinners indefinitely. Display the request error and preserve the draft.

## UI work still yours

Implement the outcome-first discovery default, candidate evidence hierarchy,
direct Research action, navigation context, unsaved-draft handling, clear save and
export controls, advanced tools organization, mobile layout and keyboard journey.
No scientific models or scoring were changed by this support work.

Use the updated generated `discovery-api.ts` and client; do not duplicate the
brief schema in UI components. Preserve the original checkout's uncommitted
theme work and the existing Pages deployment configuration.
