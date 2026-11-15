/** Change this one value to select the application's default appearance. */
export const THEME_NAMES = ["atlas", "observatory"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];
export const APP_THEME: ThemeName = "atlas";
