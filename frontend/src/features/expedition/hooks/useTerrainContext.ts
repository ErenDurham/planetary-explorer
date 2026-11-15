// Terrain context for the planner's region, from two independent sources:
//  - the existing verified-imagery endpoint, for georeferenced orbital mosaics
//    (CTX on Mars, Landsat WELD / MODIS on Earth) that carry tile-grid bounds
//    and so can serve as an accurately aligned basemap; and
//  - the shared expedition service, for its start point, research targets with
//    coordinates and its own statement of what elevation data it can route on.
// Each side has its own status so a missing service never hides the basemap.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { ImageryEntry } from "@/types";
import { isGeoreferenced } from "@/lib/comparison";
import { expeditionService, isUnavailable, type ExpeditionBody, type TerrainContext } from "../adapter";

export interface Basemap { entry: ImageryEntry & { bounds: NonNullable<ImageryEntry["bounds"]> }; /** Metres per source pixel from the manifest when known. */ resolution: number | null }

export interface BasemapState { status: "loading" | "ready" | "none" | "error"; basemaps: Basemap[]; error: unknown }

export function useBasemaps(body: ExpeditionBody, siteId: string | null): BasemapState {
  const q = useQuery({ queryKey: ["imagery", siteId], queryFn: () => api.imagery(siteId as string), enabled: siteId != null, staleTime: Infinity, retry: false });
  const data = q.data && q.data.site_id === siteId ? q.data : null;
  const basemaps: Basemap[] = (data?.entries ?? [])
    .filter(isGeoreferenced)
    .filter(e => (e as ImageryEntry).site_id === siteId && (data?.body ?? body) === body)
    .sort((a, b) => (b.bounds.north - b.bounds.south) - (a.bounds.north - a.bounds.south)) // widest first: a 3.7 km route grid needs the regional view
    .map(e => ({ entry: e, resolution: e.spatial_resolution_m_per_px ?? null }));
  const status: BasemapState["status"] = siteId == null ? "none" : data ? (basemaps.length ? "ready" : "none") : q.error ? (q.error && typeof q.error === "object" && "status" in q.error && (q.error as { status: number | null }).status === 404 ? "none" : "error") : "loading";
  return { status, basemaps, error: q.error ?? null };
}

export type TerrainState =
  | { kind: "loading" }
  | { kind: "ready"; terrain: TerrainContext }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; error: unknown; retry: () => void };

export function useTerrainContext(body: ExpeditionBody, siteId: string | null, serviceAvailable: boolean): TerrainState {
  const q = useQuery({
    queryKey: ["expedition", "terrain", body, siteId],
    queryFn: ({ signal }) => expeditionService().terrain(body, siteId as string, signal),
    enabled: siteId != null && serviceAvailable,
    staleTime: Infinity,
    retry: false,
  });
  if (!serviceAvailable) return { kind: "unavailable", reason: "The expedition service is not connected, so research targets and routing terrain are unavailable." };
  if (q.data && q.data.site_id === siteId && q.data.body === body) return { kind: "ready", terrain: q.data };
  if (q.error) return isUnavailable(q.error) ? { kind: "unavailable", reason: q.error.reason } : { kind: "error", error: q.error, retry: () => void q.refetch() };
  return { kind: "loading" };
}
