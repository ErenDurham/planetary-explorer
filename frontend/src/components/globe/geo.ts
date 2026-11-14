// Spherical coordinate helpers for the Mars globe.
//
// Marker convention (docs/ARCHITECTURE.md "Coordinate convention"), for a
// sphere of radius R and east-positive longitude in -180..180:
//
//   x =  R cos(lat) cos(lonEast)
//   y =  R sin(lat)
//   z = -R cos(lat) sin(lonEast)
//
// Why this matches the texture: Three.js SphereGeometry builds its vertices as
//   x = -R cos(2*pi*u) sin(theta),  z = R sin(2*pi*u) sin(theta)
// so texture column u=0 sits on the -x axis and u increases through +z
// (u=0.25), +x (u=0.5) and -z (u=0.75). The NASA Trek mosaic has column 0 at
// 180 W, so u=0 must be lon=-180, u=0.25 lon=-90 (90 W), u=0.5 lon=0 and
// u=0.75 lon=+90 E. The formula above does exactly that: lon=0 -> +x,
// lon=+90 E -> -z, lon=-90 -> +z, lon=+-180 -> -x. Row 0 of the image is
// 90 N and SphereGeometry maps v=1 to +y, so latitude needs no flip. Verified
// against Olympus Mons (18.65 N, -133.8 E), which lands on the big volcano.
import { Vector3 } from "three";

export const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lonEast: number;
}

/** Normalise any longitude to -180..180 east-positive. */
export function normalizeLonEast(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180) l = 180;
  return l;
}

export function latLonToVector3(lat: number, lonEast: number, radius: number): Vector3 {
  const phi = lat * DEG;
  const lam = normalizeLonEast(lonEast) * DEG;
  const cosPhi = Math.cos(phi);
  return new Vector3(
    radius * cosPhi * Math.cos(lam),
    radius * Math.sin(phi),
    -radius * cosPhi * Math.sin(lam),
  );
}

/** Position slightly above the surface so a marker is not z-fighting the texture. */
export function markerPosition(lat: number, lonEast: number, radius: number, lift = 1.012): Vector3 {
  return latLonToVector3(lat, lonEast, radius * lift);
}
