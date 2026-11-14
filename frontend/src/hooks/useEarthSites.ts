// The Earth analog candidates come from GET /comparison/catalog (body "earth"),
// which already carries their names and coordinates. The same query key as
// the Compare view, so both read one cached catalogue.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { ComparisonLocation } from "@/types";

export const comparisonCatalogKey = ["comparison-catalog"] as const;

export interface EarthSite {
  id: string;
  name: string;
  region: string;
  lat: number;
  lonEast: number;
}

export function useComparisonCatalog() {
  return useQuery({ queryKey: comparisonCatalogKey, queryFn: api.comparisonCatalog, staleTime: Infinity });
}

export function earthSitesFromCatalog(locations: ComparisonLocation[] | undefined): EarthSite[] {
  return (locations ?? [])
    .filter((l) => l.body === "earth")
    .map((l) => ({ id: l.id, name: l.name, region: l.region ?? "", lat: l.lat, lonEast: l.lon_east }));
}

export function useEarthSites() {
  const q = useComparisonCatalog();
  return { ...q, sites: earthSitesFromCatalog(q.data?.locations) };
}
