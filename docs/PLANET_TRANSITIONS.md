# Earth–Mars globe transition

The Browse Regions globe remains mounted when `navigateExplore` changes body.
An Explore revision resets the imagery choice to Globe without replacing its
React subtree or WebGL context.

- Camera: 1.7-second departure, shortest-arc orbit and arrival. The camera pulls
  back to at least 3.6 scene radii before settling at the destination view.
- Texture: two cached maps blended in one lit sphere material. Both maps load on
  the first globe visit, avoiding an untextured frame on a later switch.
- Lighting and atmosphere interpolate between body-specific values.
- Per-body camera memory survives a return trip. Rapid reversal starts from the
  current camera position and material blend; it does not snap to an old frame.
- Markers and survey overlays are hidden during planet travel so a new body's
  locations are not drawn against the outgoing body's texture.
- Reduced motion skips the camera journey and texture dissolve. Keyboard/reset
  actions cancel camera travel and restore interaction.

No new animation library is required. Frame updates mutate Three.js objects;
React state changes only at the start/end of a body transition. Physical data,
rankings, geographic coordinates and body radii are unchanged. This is a visual
transition, not a depiction of interplanetary distance or travel time.

Regression checks cover the shared timing curves, exact endpoints, surface
clearance and preservation of the same globe DOM node across body navigation.
A Chrome preview was checked in both directions and with a rapid reversal;
arrival textures/markers were correct and the renderer logged no errors.
