/** Fit the atmosphere as well as the sphere, using whichever viewport axis is tighter. */
export function previewFitDistance(aspect: number, fovDegrees = 40) {
 const halfFov = Math.atan(Math.tan(fovDegrees * Math.PI / 360) * Math.min(1,Math.max(.1,aspect)));
 return 1.1 / Math.sin(halfFov) * 1.12;
}
const ease = (x: number) => { const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t); };
/** Swapping worlds: the planet recedes and fades out, changes while invisible, then returns the same way. */
export function previewSwap(progress: number) {
 const t=Math.max(0,Math.min(1,progress));
 const shown=t<.5 ? 1-ease(t*2) : ease((t-.5)*2);
 return { scale:.9+.1*shown, opacity:shown, swap:t>=.5, done:t>=1 };
}
