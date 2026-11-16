// A PlanetConfig describes everything the viewer needs to render one body:
// which texture, how big, and how lat/lon map onto the sphere. The viewer,
// the markers, the legend and the accessible descriptions all read the body's
// name from here, so a second body is a config, not a rewrite.
export type MarkerConvention = "east_-180_180_three_default_uv";

export type PlanetId = "earth" | "mars";

export interface PlanetConfig {
  /** Stable id, matches the backend `body` / `planet` fields. */
  id: PlanetId;
  displayName: string;
  /** Equirectangular texture, column 0 = 180 W, row 0 = 90 N. */
  textureUrl: string;
  /** Scene-unit radius of the sphere (both bodies render at the same size). */
  radius: number;
  /** Real mean radius in km, for the scale text and accessible description. */
  bodyRadiusKm: number;
  /** How lat/lon are turned into sphere coordinates (see geo.ts). */
  markerConvention: MarkerConvention;
  /** Attribution shown in the legend. */
  textureCredit: string;
  textureCreditUrl?: string;
  /** Colour of the untextured stand-in while the texture decodes. */
  placeholderColor: string;
  /** One sentence for the selected-site card about what the texture shows. */
  textureNote: string;
  /** Limb glow: colour and strength of the Fresnel rim. Earth scatters blue; Mars has a faint dusty haze. */
  atmosphere: { color: string; intensity: number; thickness: number; power: number };
  /** Key light tint and the overall exposure that suits this body's albedo. */
  lighting: { key: string; keyIntensity: number; sky: string; ground: string; hemisphere: number; exposure: number };
}

const LARGE_SCREEN = typeof window !== "undefined" && !!window.matchMedia?.("(min-width: 1024px)").matches;
/** Device-pixel-ratio range for the globe canvases: full retina sharpness on large screens, capped lower on phones to halve the fill cost. */
export const GLOBE_DPR: [number, number] = LARGE_SCREEN ? [1, 2] : [1, 1.5];

export const MARS_CONFIG: PlanetConfig = {
  id: "mars",
  displayName: "Mars",
  textureUrl: `${import.meta.env.BASE_URL}textures/mars_viking_4k.jpg`,
  radius: 1,
  bodyRadiusKm: 3389.5,
  markerConvention: "east_-180_180_three_default_uv",
  textureCredit: "Viking MDIM 2.1 colour mosaic, NASA/JPL/USGS via NASA Solar System Treks",
  textureCreditUrl: "https://trek.nasa.gov/mars/",
  placeholderColor: "#3a2a24",
  textureNote: "Regional orbital mosaic. Surface photographs and local terrain detail are not loaded in this view.",
  atmosphere: { color: "#d9a37a", intensity: 0.55, thickness: 0.05, power: 2.6 },
  lighting: { key: "#ffe4c4", keyIntensity: 2.6, sky: "#7a6a60", ground: "#20140e", hemisphere: 0.9, exposure: 1.0 },
};

export const EARTH_CONFIG: PlanetConfig = {
  id: "earth",
  displayName: "Earth",
  textureUrl: `${import.meta.env.BASE_URL}textures/earth_bluemarble_4k.jpg`,
  radius: 1,
  bodyRadiusKm: 6371.0,
  markerConvention: "east_-180_180_three_default_uv",
  textureCredit: "NASA Earth Observatory (Reto Stöckli, NASA GSFC) via NASA GIBS, Blue Marble Next Generation",
  textureCreditUrl: "https://earthobservatory.nasa.gov/features/BlueMarble",
  placeholderColor: "#1d3550",
  textureNote: "Blue Marble composite (cloud-free, annual). Field photographs and local terrain detail are not loaded in this view.",
  atmosphere: { color: "#5ea4ff", intensity: 0.6, thickness: 0.09, power: 2.6 },
  lighting: { key: "#fff4e6", keyIntensity: 2.4, sky: "#9fc3ff", ground: "#0b1626", hemisphere: 1.1, exposure: 1.08 },
};

export const PLANET_CONFIGS: Record<PlanetId, PlanetConfig> = { earth: EARTH_CONFIG, mars: MARS_CONFIG };
