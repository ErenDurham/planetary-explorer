import { ReportedConditionsPanel } from "@/components/sites/SiteConditionPanels";
import { CandidatePanel } from "./CandidatePanel";
import { MissionSensitivity } from "./MissionSensitivity";
import { CandidateRow } from "./CandidateRow";
import { EmptyNote } from "@/components/ui/Section";
import { Spinner } from "@/components/ui/Spinner";
import type { BadgeTone } from "@/components/ui/Badge";
import { missionRankPosition, rankColor, type RankPalette } from "@/lib/rankColor";
import { formatLatLon, formatNumber, formatValueWithUnit, humanize } from "@/lib/format";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useAppStore } from "@/store/useAppStore";
import type { ComparisonLocation, MissionAssessmentResponse, MissionAssessmentResult } from "@/types";

function ScreeningLimits() {
 const plan=useAppStore(s=>s.appliedInterpretation?.screening);
 const requirements=useAppStore(s=>s.missionRequirements[s.selectionBody]);
 const kind=useAppStore(s=>s.missionType);
 if(!plan || plan.mission_type==="landing" || plan.mission_type!==kind)return null;
 return <div className="my-3 text-xs leading-relaxed text-fg-muted" data-testid="screening-basis"><p>{plan.mission_type==="research" ? `Target match: ${[...(requirements.material_targets??[]),...(requirements.landform_targets??[])].map(humanize).join(", ") || "no supported targets selected"}.` : "Evidence review; no base-viability score."}</p>{!!requirements.excluded_material_targets?.length&&<p>Excluded materials: {requirements.excluded_material_targets.map(humanize).join(", ")}.</p>}{plan.limitations.length>0&&<details className="mt-2"><summary className="cursor-pointer text-warn">What this ranking cannot establish</summary><ul className="mt-2 list-disc space-y-2 pl-4">{plan.limitations.map(n=><li key={n}>{n}</li>)}</ul></details>}{plan.mission_type==="research"&&plan.limitations.some(n=>n.includes("accessibility"))&&<p className="mt-2 text-warn">Ice proximity and water accessibility are not ranked.</p>}</div>;
}

export function MissionAssessmentList({data,pending,error,selectedId,onSelect,palette="roygbiv"}:{palette?:RankPalette;data?:MissionAssessmentResponse;pending:boolean;error:unknown;selectedId:string|null;onSelect:(id:string)=>void}){
 const open=useAppStore(s=>s.setActiveTab);
 const statuses: Record<MissionAssessmentResult["status"], {label:string;tone:BadgeTone}> = {
  scored: {label:"scored",tone:"ok"},
  needs_requirements: {label:"needs targets",tone:"warn"},
  insufficient_data: {label:"no data",tone:"warn"},
  not_supported: {label:"not scored",tone:"neutral"},
 };
 return <CandidatePanel title="Ranked candidates"
  subtitle={`${data ? humanize(data.body) + " · " : ""}${data?.profile_label ?? "Task-specific mission fit"} · task-fit index 0–100, not a probability.`}
  actions={pending ? <Spinner label="Scoring" /> : undefined} controls={<>
  <ScreeningLimits />
  {!!error && <ErrorNote error={error}/>}
  {data?.warnings.length ? <ul className="mb-2 space-y-1" aria-label="Scoring warnings">{data.warnings.map((w,i)=><li key={i} className="rounded border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] leading-snug text-warn">{w}</li>)}</ul> : null}
  {data?.results.length && data.results.every(r=>r.score===null) ? <button type="button" onClick={()=>open("mission")} className="mb-3 text-xs text-copper-bright underline">Review mission requirements</button> : null}
  </>}>
  {!data ? <EmptyNote>{pending ? "Scoring sites…" : "No evaluation yet."}</EmptyNote> :
   <ol className="space-y-1" aria-label="Ranked sites">{data.results.map(r=>{
    const status=statuses[r.status];
    return <li key={r.site_id}><CandidateRow name={r.site_name} rank={r.rank} score={r.score}
     color={rankColor(missionRankPosition(r.rank,data.results.map(r=>r.rank)),palette)??undefined}
     selected={r.site_id===selectedId} status={status.label} tone={status.tone}
     detail={`${Math.round(r.coverage_fraction*100)}% active-weight data availability`}
     onSelect={()=>onSelect(r.site_id)}/></li>;
   })}</ol>}
 </CandidatePanel>;
}

export function MissionAssessmentDetail({data,result,location,pending,showSensitivity=false,palette="roygbiv"}:{palette?:RankPalette;data?:MissionAssessmentResponse;result?:MissionAssessmentResult;location?:ComparisonLocation;pending:boolean;showSensitivity?:boolean}){
 const open=useAppStore(s=>s.setActiveTab);
 return <section className="scroll-thin h-full overflow-y-auto bg-bg-elev p-5" aria-label="Mission fit analysis"><h1 className="text-xl font-semibold text-fg">{location?.name??result?.site_name??"Select a mission site"}</h1>{location&&<p className="mt-2 text-xs text-fg-muted">{humanize(location.body)} · {formatLatLon(location.lat,location.lon_east)}</p>}<p className="mt-3 text-sm text-fg-muted">{data?.profile_label??"Mission assessment"}</p>{pending&&<p className="mt-3 text-xs">Updating mission assessment…</p>}{result&&<>
  <ScreeningLimits />
  <div className="my-5 border-y border-line py-4"><span className="num text-3xl font-semibold" style={{color:rankColor(missionRankPosition(result.rank,data?.results.map(r=>r.rank)??[]),palette)??undefined}}>{result.score==null?"Not scored":result.score.toFixed(1)}{result.score!=null&&<span className="ml-1 text-sm text-fg-muted">/ 100</span>}</span><p className="mt-2 text-xs text-fg-muted">{result.rank!=null?`Rank ${result.rank} of ${data?.results.length} · `:""}{Math.round(result.coverage_fraction*100)}% active-weight data availability. A task-fit index, not a probability.</p></div>
  {result.evidence_gaps.length>0&&<div className="mb-4 rounded border border-warn/40 p-3"><h2 className="text-sm font-semibold text-warn">Requirements & evidence gaps</h2><ul className="mt-2 list-disc space-y-2 pl-4 text-xs text-fg-muted">{result.evidence_gaps.map(g=><li key={g}>{g}</li>)}</ul><button type="button" onClick={()=>open("mission")} className="mt-3 text-xs text-copper-bright underline">Edit mission requirements</button></div>}
  <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Why this score</h2><div className="mt-3 space-y-3">{result.factors.map(f=><article key={f.criterion_id} className="rounded border border-line p-3"><div className="flex justify-between gap-3 text-sm"><h3 className="font-semibold">{f.label}</h3><span className="num text-copper-bright">{f.contribution==null?"Excluded":`${formatNumber(f.contribution,{maxFractionDigits:2})} pts`}</span></div><p className="mt-2 text-xs text-fg-muted">{Array.isArray(f.value)?f.value.map(humanize).join(", "):typeof f.value==="number"?formatValueWithUnit(f.value,f.unit):"No compatible measurement"}</p><p className="mt-2 text-xs leading-relaxed text-fg-muted">{f.note}</p>{f.q!=null&&<><div className="mt-3 h-2 overflow-hidden rounded bg-line"><div className="h-full bg-data-contribution" style={{width:`${f.q*100}%`}}/></div><p className="mt-2 text-xs text-fg-muted">Factor fit {(f.q*100).toFixed(1)}% · Influence {((f.normalized_weight??0)*100).toFixed(0)}% · {humanize(f.quality??"")}</p></>}{f.source&&/^https?:/.test(f.source.url)&&<a className="mt-3 inline-block text-xs text-info underline" href={f.source.url} target="_blank" rel="noreferrer">{f.source.title} ↗</a>}</article>)}</div>
  {location&&<ReportedConditionsPanel conditions={location.reported_conditions} sources={location.condition_sources} title="Cited site evidence (not scored)"/>}
  {showSensitivity&&data&&result.score!=null&&<MissionSensitivity data={data} siteId={result.site_id}/>}
  <details className="mt-5 border-t border-line pt-4"><summary className="cursor-pointer text-sm text-fg-muted">Method, assumptions & limitations</summary><p className="mt-3 text-xs leading-relaxed text-fg-muted">{data?.method} · {data?.spec_version}</p>{data?.assumptions.map(n=><p key={n} className="mt-3 text-xs leading-relaxed text-fg-muted">{n}</p>)}</details>
 </>}{location&&<details className="mt-5 border-t border-line pt-4"><summary className="cursor-pointer text-sm text-fg-muted">All site measurements</summary><p className="mt-3 text-xs text-fg-muted">{location.coverage}</p><ul className="mt-3 space-y-3">{location.measurements.map(m=><li key={m.feature_id} className="text-xs"><span className="text-fg-muted">{m.label}: </span>{m.is_missing||m.value==null?"Not available":Array.isArray(m.value)?m.value.map(humanize).join(", "):typeof m.value==="number"?formatValueWithUnit(m.value,m.unit):m.value}</li>)}</ul></details>}</section>;
}
