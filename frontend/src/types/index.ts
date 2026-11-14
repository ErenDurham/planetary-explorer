// Convenience aliases over the generated OpenAPI types. `api.ts` is produced by
// `npm run gen:types` from the running backend and is never hand-edited; this
// file is the only place the rest of the app imports types from, so a schema
// rename is a one-line fix here.
import type { components } from "./api";

type S = components["schemas"];

export type Site = S["Site"];
export type SiteListResponse = S["SiteListResponse"];
export type SiteWithProfile = S["SiteWithProfile"];
export type GeographicFootprint = S["GeographicFootprint"];
export type EnvironmentalProfile = S["EnvironmentalProfile"];
export type EnvironmentalMeasurement = S["EnvironmentalMeasurement"];
export type Provenance = S["Provenance"];
export type Completeness = S["Completeness"];

export type MissionProfile = S["MissionProfile"];
export type CriterionWeight = S["CriterionWeight"];
export type HardConstraint = S["HardConstraint"];
export type EvaluateRequest = S["EvaluateRequest"];
export type EvaluateResponse = S["EvaluateResponse"];
export type SuitabilityResult = S["SuitabilityResult"];
export type FactorScore = S["FactorScore"];
export type Eligibility = S["Eligibility"];
export type ConstraintResult = S["ConstraintResult"];
export type CriteriaCompleteness = S["CriteriaCompleteness"];

export type MatchRequest = S["MatchRequest"];
export type MatchResponse = S["MatchResponse"];
export type AnalogMatch = S["AnalogMatch"];
export type AnalogWeight = S["AnalogWeight"];
export type EarthCandidate = S["EarthCandidate"];
export type FeatureDistance = S["FeatureDistance"];

export type ExplainRequest = S["ExplainRequest"];
export type ResearchExplanation = S["ResearchExplanation"];
export type ExplanationSections = S["ExplanationSections"];
export type EvidenceChunk = S["EvidenceChunk"];
export type Citation = S["Citation"];
export type SourceDigest = S["SourceDigest"];
export type StudyCard = S["StudyCard"];

export type InterpretRequest = S["InterpretRequest"];
export type InterpretResponse = S["InterpretResponse"];
export type WeightSuggestion = S["WeightSuggestion"];
export type GuidanceRequest = S["GuidanceRequest"];
export type GuidanceResponse = S["GuidanceResponse"];
export type InfluenceDelta = S["InfluenceDelta"];
export type RankDelta = S["RankDelta"];

export type HealthResponse = S["HealthResponse"];
export type ServiceStatus = S["ServiceStatus"];
export type ApiErrorBody = S["ApiErrorBody"];

export type MeasurementCategory = EnvironmentalMeasurement["category"];
export type QualityFlag = EnvironmentalMeasurement["quality_flag"];
export type SuitabilityStatus = SuitabilityResult["status"];

/**
 * GET /scoring/default-mission is declared with an empty response schema in
 * the OpenAPI document (`schema: {}`), so openapi-typescript generates
 * `unknown` for it. This hand-written shape mirrors the live response and the
 * scoring spec; it is the one type in this folder not derived from the
 * generated file. (Reported to the backend owners as a contract gap.)
 */
export interface CriterionFunction {
  type: "piecewise_linear";
  direction: "lower_is_better" | "higher_is_better";
  full: number;
  zero: number;
}

export interface CriterionSpec {
  criterion_id: string;
  label: string;
  feature_id: string;
  unit: string | null;
  default_weight: number;
  rationale: string;
  function: CriterionFunction;
}

export interface DefaultMissionResponse {
  mission: MissionProfile;
  scoring_spec_version: string;
  criteria: CriterionSpec[];
  notes: string[];
}

export type SiteImagery = S["SiteImagery"];
export type ImageryEntry = S["ImageryEntry"];
export type SensitivityRequest = S["SensitivityRequest"];
export type SensitivityResponse = S["SensitivityResponse"];
export type SensitivityPoint = S["SensitivityPoint"];

export type ComparisonCatalog = S["ComparisonCatalog"];
export type ComparisonLocation = S["ComparisonLocation"];
export type BodyReference = S["BodyReference"];
