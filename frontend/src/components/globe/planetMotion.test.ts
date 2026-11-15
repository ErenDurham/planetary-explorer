import { expect,it } from "vitest";
import { planetTravel,planetDissolve,PLANET_TRAVEL_SECONDS } from "./planetMotion";
it("leaves and arrives at the exact camera distances without snapping",()=>{
 expect(planetTravel(0,1.65,2.8,1)).toMatchObject({turn:0,distance:1.65,done:false});
 expect(planetTravel(PLANET_TRAVEL_SECONDS,1.65,2.8,1)).toMatchObject({turn:1,distance:2.8,done:true});
 expect(planetTravel(PLANET_TRAVEL_SECONDS*.3,1.65,2.8,1).distance).toBeCloseTo(3.6);
});
it("keeps even a close surface departure outside the planet throughout travel",()=>{
 for(let i=0;i<=200;i++){const sample=planetTravel(i/200*PLANET_TRAVEL_SECONDS,1.08,1.65,1);expect(sample.distance).toBeGreaterThanOrEqual(1.08);expect(sample.turn).toBeGreaterThanOrEqual(0);expect(sample.turn).toBeLessThanOrEqual(1);}
});
it("dissolves only after departure and clamps to exact endpoint textures",()=>{
 expect(planetDissolve(0)).toBe(0);expect(planetDissolve(.18)).toBe(0);expect(planetDissolve(.6)).toBeGreaterThan(0);expect(planetDissolve(2)).toBe(1);
});
