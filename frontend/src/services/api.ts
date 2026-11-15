import type { AstroRequest, AstroResponse, AnalogRankRequest, AnalogRankResponse, ComparisonCatalog, SiteImagery, SensitivityRequest, SensitivityResponse } from "@/types";
// Typed fetch wrapper for the Planetary Explorer backend.
//
// Every non-2xx response from the API is `{ error: { code, message, details } }`
// (see docs/API_CONTRACTS.md); `request()` parses that envelope into an
// `ApiError` so callers can branch on `code`. A network failure (backend down,
// CORS, DNS) becomes an `ApiError` with code `unavailable`, which the UI shows
// as a banner while the globe keeps rendering from the static texture.
import type {
  DefaultMissionResponse,
  EvaluateRequest,
  EvaluateResponse,
  ExplainRequest,
  GuidanceRequest,
  GuidanceResponse,
  HealthResponse,
  InterpretRequest,
  InterpretResponse,
  MatchRequest,
  MatchResponse,
  ResearchExplanation,
  SiteListResponse,
  SiteWithProfile,
} from "@/types";

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

const API_PREFIX = "/api/v1";

export type ApiErrorCode =
  | "not_found"
  | "validation_error"
  | "unsupported_planet"
  | "data_unavailable"
  | "http_error"
  | "unavailable"
  | "invalid_response"
  | string;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, status: number | null, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details ?? null;
  }

  /** True when the backend could not be reached at all (as opposed to a 4xx/5xx). */
  get isUnavailable(): boolean {
    return this.code === "unavailable" || this.code === "data_unavailable";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${API_PREFIX}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
    });
  } catch (e) {
    throw new ApiError("unavailable", `Backend unreachable at ${API_BASE_URL}`, null, e instanceof Error ? e.message : e);
  }

  if (!res.ok) {
    let envelope: ErrorEnvelope | null = null;
    try {
      envelope = (await res.json()) as ErrorEnvelope;
    } catch {
      // non-JSON error body; fall through to the generic error
    }
    const code = envelope?.error?.code ?? "http_error";
    const message = envelope?.error?.message ?? `${res.status} ${res.statusText}`;
    throw new ApiError(code, message, res.status, envelope?.error?.details);
  }

  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new ApiError("invalid_response", "Response was not valid JSON", res.status, e);
  }
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const api = {
  astroChat: (body: AstroRequest) => post<AstroResponse>("/astro/chat", body),
  comparisonCatalog: () => request<ComparisonCatalog>("/comparison/catalog"),
  imagery: (siteId: string) => request<SiteImagery>(`/sites/${encodeURIComponent(siteId)}/imagery`),
  sensitivity: (body: SensitivityRequest, signal?: AbortSignal) => request<SensitivityResponse>("/scoring/sensitivity", { method: "POST", body: JSON.stringify(body), signal }),
  health: () => request<HealthResponse>("/health"),
  sites: (planet = "mars") => request<SiteListResponse>(`/sites?planet=${encodeURIComponent(planet)}`),
  site: (siteId: string) => request<SiteWithProfile>(`/sites/${encodeURIComponent(siteId)}`),
  defaultMission: () => request<DefaultMissionResponse>("/scoring/default-mission"),
  evaluate: (body: EvaluateRequest) => post<EvaluateResponse>("/scoring/evaluate", body),
  matchAnalogs: (body: MatchRequest) => post<MatchResponse>("/analogs/match", body),
  /** Rank every candidate on one body against a reference on the other; `client_request_id` is echoed for the stale guard. */
  rankAnalogs: (body: AnalogRankRequest, signal?: AbortSignal) => request<AnalogRankResponse>("/analogs/rank", { method: "POST", body: JSON.stringify(body), signal }),
  explain: (body: ExplainRequest) => post<ResearchExplanation>("/research/explain", body),
  /** Reads a free-text objective into a reviewable weight proposal; never applies anything itself. */
  interpret: (body: InterpretRequest) => post<InterpretResponse>("/mission/interpret", body),
  /** Objective-aware guidance after a slider settles; numbers come from the scoring engine. */
  guidance: (body: GuidanceRequest) => post<GuidanceResponse>("/mission/guidance", body),
};

export type Api = typeof api;
