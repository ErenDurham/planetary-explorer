// The project's own site roles. A role labels a site; it is never scored and
// never changes a rank or a colour.
import type { SiteRole } from "@/types";

export const SITE_ROLES: SiteRole[] = ["Base candidate", "Resource site", "To evaluate", "Instrument testing", "Context only"];

export type RoleFilter = SiteRole | "all";

/** Short explanation of each role, for tooltips. */
export const ROLE_HINT: Record<SiteRole, string> = {
  "Base candidate": "Candidate location for a crewed base",
  "Resource site": "Valued for resources such as water, not as a base",
  "To evaluate": "Needs further evaluation",
  "Instrument testing": "Paired with Earth sites for instrument tests, not a base",
  "Context only": "Context for the region; not a probable base",
};

/** Lookup key for a location's role across both bodies. */
export const roleKey = (body: string, id: string) => `${body}:${id}`;

export function passesRole(filter: RoleFilter, role: SiteRole | null | undefined): boolean {
  return filter === "all" || role === filter;
}

export function roleCounts(roles: Array<SiteRole | null | undefined>): Record<SiteRole, number> {
  const out = Object.fromEntries(SITE_ROLES.map((r) => [r, 0])) as Record<SiteRole, number>;
  for (const r of roles) if (r) out[r] += 1;
  return out;
}
