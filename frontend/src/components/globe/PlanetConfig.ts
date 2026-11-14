// A PlanetConfig describes everything the viewer needs to render one body:
// which texture, how big, and how lat/lon map onto the sphere. v1 ships Mars
// only; the interface exists so a second body is a config, not a rewrite.
export type MarkerConvention = "east_-180_180_three_default_uv";

export interface PlanetConfig {
  /** Stable id, matches the backend `planet` field. */
  id: "mars";
  displayName: string;
  /** Equirectangular texture, column 0 = 180 W, row 0 = 90 N. */
  textureUrl: string;
  /** Scene-unit radius of the sphere. */
  radius: number;
  /** How lat/lon are turned into sphere coordinates (see geo.ts). */
  markerConvention: MarkerConvention;
  /** Attribution shown in the legend. */
  textureCredit: string;
  textureCreditUrl?: string;
}

export const MARS_CONFIG: PlanetConfig = {
  id: "mars",
  displayName: "Mars",
  textureUrl: "/textures/mars_viking_4k.jpg",
  radius: 1,
  markerConvention: "east_-180_180_three_default_uv",
  textureCredit: "Viking MDIM 2.1 colour mosaic, NASA/JPL/USGS via NASA Solar System Treks",
  textureCreditUrl: "https://trek.nasa.gov/mars/",
};
