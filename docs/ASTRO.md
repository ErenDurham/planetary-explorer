# Astro and location details

Explore keeps location information in a right sidebar that can be resized or collapsed from its left edge. Button and keyboard alternatives also reopen it. The original body/mode/view toolbar remains always visible.

Astro floats over the workspace as a small rounded launcher on every tab, without reserving a footer row. Clicking opens a compact panel; conversations get a bounded larger panel, including on mobile. Changing tabs folds it back to the launcher while preserving conversation and draft. Reloading clears the session. One dim contextual question appears as placeholder text; focusing the input clears the hint without inserting it. Tab retains normal focus navigation.

Clicking empty globe space or unmarked planetary surface deselects only the viewed body's location. Orbit drags and UI controls preserve selection; Escape while the globe is focused and the Clear selection control provide keyboard/explicit alternatives. Deselecting stops an unfinished selection flight without resetting the current camera. On mobile the location dropdown also offers No location selected.

## Claude configuration

Astro uses the existing backend `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic`, and `LLM_MODEL` settings. Install an up-to-date Anthropic SDK in the backend environment (`python -m pip install --upgrade anthropic`) and restart the backend after changing settings. Use a model available to your Anthropic account that supports structured outputs. Keys remain on the server; no frontend secret is needed.

Without a key, or when the SDK/API is unavailable, Astro shows clearly labelled deterministic context and navigation guidance. With no location selected it offers mission-level leading Mars candidates or unranked Earth catalog locations, using existing deterministic services. Network failures expose Retry. Core exploration, scoring, and comparison do not require Claude.

## Conversation contract

`POST /api/v1/astro/chat` accepts the question, up to twelve bounded history turns, active view, selected location IDs, applied objective, mission settings, analog weights, and candidate direction. The backend loads locations and recalculates scientific facts using the deterministic engines. It retrieves at most six local evidence passages. Analyze/Research use Mars context; Compare supplies the resolved displayed pair and its selection-body direction. The selected candidate is included even outside the top three analog matches.

Claude selects relevant fact identifiers, an answer focus, exact evidence quotes, and allowed navigation actions. Scientific facts are rendered from server-owned strings; Claude cannot rewrite values, units, site attribution, ranks, or safety claims. Quotes must be exact substrings of retrieved passages and cite real server-generated handles. This deliberately favors traceable evidence over unrestricted scientific prose. Retrieved passages can still be incomplete or irrelevant; the original sources and limitations remain available for review.

Anthropic's generation schema omits unsupported length/array constraints and closes nested objects. Pydantic enforces the complete response bounds locally. See the official [structured-output documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Navigation is explicit. Model-selected action IDs resolve to server-owned known locations and tabs. Astro never applies mission settings. Earlier-context answers remain labelled; their actions are disabled after relevant selections, priorities, or views change. Clearing the conversation invalidates outstanding requests.

## Verification

Run `npm test -- --run` and `npm run build` in `frontend`, and `python -m pytest tests -q` in `backend`. Tests cover invalid model output, unsupported scientific assertions, citation/action validation, context direction, offline behavior, interaction, and in-flight clearing.

Browser verification covers desktop sidebar/central-composer positioning, narrow-screen modal semantics, inline suggestion acceptance, click-away and keyboard deselection, drag/control preservation, retained cross-body references, drafts/history, reset/focus, and stable label dimensions through zoom. The original Jezero hover card measured approximately 837–1,128 px wide during selection/close zoom. With screen-space labels it remains approximately 158 × 64 px; the tested Earth card remains approximately 208 × 64 px at close and far zoom. Browser zoom and text scaling are preserved.

Live Claude response quality requires a configured key and was not exercised in the offline verification environment; model responses were mocked for deterministic contract tests.


Mission Design remains the dedicated place to review and apply AI-assisted priority proposals. Its star-only indicator describes AI capability, and existing result badges distinguish model, server rules, and browser offline rules. Astro supplies research guidance and navigation; it does not silently apply mission settings. See [the UI rationale](superpowers/plans/2026-11-14-quiet-controls.md).


In Explore, the globe keeps its full available height. The suitability/analog legend moves above Astro only when their measured bounds overlap. Explore chat height is capped to leave room for the legend on smaller screens; that cap is released when Orbital/Surface imagery replaces the globe. Other tabs retain their layout when Astro opens.
