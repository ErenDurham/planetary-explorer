/** Fit the atmosphere as well as the sphere, using whichever viewport axis is tighter. */
export function previewFitDistance(aspect: number, fovDegrees = 40) {
 const halfFov = Math.atan(Math.tan(fovDegrees * Math.PI / 360) * Math.min(1,Math.max(.1,aspect)));
 return 1.1 / Math.sin(halfFov) * 1.12;
}
const ease = (x: number) => { const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t); };
export function previewSlide(progress: number) {
 const t=Math.max(0,Math.min(1,progress));
 return { x: t===0 ? 0 : t<.5 ? -3.2*ease(t*2) : 3.2*(1-ease((t-.5)*2)), opacity: t<.5 ? 1-ease(t*2) : ease((t-.5)*2), swap:t>=.5, done:t>=1 };
}
