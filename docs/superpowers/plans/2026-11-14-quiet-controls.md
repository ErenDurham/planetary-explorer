# Quiet controls and AI clarity

User authorized implementation of the notes without another design approval step.

- Site details: draggable left-edge separator resizes and collapses the right panel; buttons and Home/End/arrow keys provide alternatives. Content stays mounted. The grid and Astro anchor follow the panel width.
- Explore controls: collapsible body/mode/view controls retain their selections and session visibility preference.
- Astro: small rounded launcher on every tab; 180px empty panel, bounded conversation panel, compact native modal on mobile. Tab navigation collapses Astro while retaining draft/history. Navigation actions restore focus to the launcher.
- Suggestions: genuine dim placeholders, hidden on focus; never inserted by clicking or Tab. A separate accessible input label remains present.
- Mission objective: confirmed existing Claude interpretation with backend/browser rule fallbacks and explicit review/apply. Keep this structured settings workflow separate from Astro's conversational guidance. Add a restrained sparkle/text capability label before a suggestion is requested; preserve actual generation provenance on results.
- Lighting: use constant ambient intensity. Same-camera terrain image samples are identical with and without a site selection.

Research informed the icon-plus-text choice and persistent labels: [Google Design's sparkle research](https://design.google/library/ai-sparkle-icon-research-pozos-schmidt), [NN/G chatbot identity and capability transparency](https://www.nngroup.com/articles/dimensions-of-ai-chatbots/), and [NN/G placeholder guidance](https://www.nngroup.com/articles/form-design-placeholders/). A symbol indicates AI availability, while text and per-response provenance clarify whether Claude actually ran.
