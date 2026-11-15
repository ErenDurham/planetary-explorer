/** One timing curve shared by camera travel and the material dissolve. */
export const PLANET_TRAVEL_SECONDS = 1.7;
export const smooth = (t:number) => {const x=Math.max(0,Math.min(1,t));return x*x*x*(x*(x*6-15)+10);};
export function planetTravel(elapsed:number,startDistance:number,endDistance:number,radius:number){
  const t=Math.max(0,Math.min(1,elapsed/PLANET_TRAVEL_SECONDS));
  const clearance=Math.max(radius*3.6,startDistance,endDistance);
  return {turn:smooth((t-.18)/.64),distance:t<.3 ? startDistance+(clearance-startDistance)*smooth(t/.3) : clearance+(endDistance-clearance)*smooth((t-.3)/.7),done:t>=1};
}
export const planetDissolve=(elapsed:number)=>smooth((elapsed-.5)/.6);
