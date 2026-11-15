import { IS_BROWSER_PYTHON } from "@/services/browserPython";
// Every image is served by the backend asset endpoint (cached, allow-listed,
// decode-checked). The manifest's external `asset_url` is never loaded directly.
import { API_BASE_URL } from "@/services/api";

export function imageryAssetUrl(entryId: string, attempt = 0): string {
  if (IS_BROWSER_PYTHON) return `${import.meta.env.BASE_URL}pages-data/imagery/${encodeURIComponent(entryId)}.jpg`;
  return `${API_BASE_URL}/api/v1/imagery/${encodeURIComponent(entryId)}/asset${attempt ? `?retry=${attempt}` : ""}`;
}

export const BODY_COLOR: Record<"earth" | "mars", string> = { earth: "#70a6df", mars: "#ee9c44" };
