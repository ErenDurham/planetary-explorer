// Earth Analog Research: the established analogs for one Mars site, as a browsable
// board rather than a ranked list.
//
// The layout and its three questions - what is shared, what it has been used to
// study, where the analogy breaks down - are Amy's. What fills them is the
// service's: `POST /analogs/match` returns the ranked Earth candidates with their
// measured shared characteristics, their DOCUMENTED analog campaigns (cited, not
// invented), the differences it could not compare, and the fundamental planetary
// differences disclosed on every comparison. Imagery comes from the verified
// imagery manifest with its recorded credit and licence; no stock photograph ever
// stands in for a site. Nothing on this page is written here.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { imageryAssetUrl } from "@/components/imagery/assetUrl";
import { useImageryFor } from "@/hooks/usePairImagery";
import { EmptyNote } from "@/components/ui/Section";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { formatPoint } from "@/features/discovery/lib/geo";
import type { AnalogMatch } from "@/types";

const DEFAULT_REFERENCE = "jezero_crater";

/** Optional list fields arrive absent rather than empty; absent is "nothing recorded". */
const list = (v: string[] | undefined | null): string[] => v ?? [];

/** NASA-run archives a reader can take a question to. Links only; nothing is read from them. */
const DATASETS = [
  { title: "HiRISE — high-resolution Mars imagery", description: "Metre-scale surface detail for the Mars side of a comparison.", url: "https://www.uahirise.org/" },
  { title: "JMARS — planetary mapping", description: "Layer geology, mineralogy and terrain over either body.", url: "https://jmars.asu.edu/" },
  { title: "NASA Planetary Data System", description: "The archived mission data behind every Mars number here.", url: "https://pds.nasa.gov/" },
];

/** One verified image with the credit and licence the manifest records for it. */
function VerifiedImage({ body, siteId, label }: { body: "earth" | "mars"; siteId: string | null; label: string }) {
  const q = useImageryFor(body, siteId);
  const entry = q.data?.entries.find(e => e.view === "orbital") ?? q.data?.entries[0] ?? null;
  return (
    <figure className="m-0">
      <div className="relative h-40 w-full overflow-hidden rounded-xl border border-line bg-bg-elev-2">
        {entry
          ? <img src={imageryAssetUrl(entry.entry_id)} alt={`${label}: ${entry.title}`} loading="lazy" className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center px-3 text-center text-[11px] text-fg-faint">
              {q.status === "loading" ? "Loading imagery…" : q.reason ?? "No verified imagery is held for this location. Nothing is shown in its place."}
            </div>}
        <span className="absolute bottom-2 left-2 rounded-lg bg-canvas/90 px-2.5 py-1 text-[11px] font-medium text-fg">{label}</span>
      </div>
      {entry && <figcaption className="mt-1 text-[10.5px] leading-snug text-fg-faint">{entry.title} · {entry.credit} · {entry.license}</figcaption>}
    </figure>
  );
}

function Panel({ title, items, empty, tone = "fg" }: { title: string; items: string[]; empty: string; tone?: "fg" | "warn" }) {
  return (
    <section aria-label={title} className="py-3 first:pt-0">
      <h3 className={`text-sm font-semibold ${tone === "warn" ? "text-warn" : "text-fg"}`}>{title}</h3>
      {items.length === 0
        ? <p className="mt-1 text-xs leading-relaxed text-fg-muted">{empty}</p>
        : <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-fg">{items.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </section>
  );
}

export function EarthAnalogDashboard({ marsSiteId }: { marsSiteId?: string | null }) {
  const reference = marsSiteId ?? DEFAULT_REFERENCE;
  const q = useQuery({
    queryKey: ["analog-match", reference],
    queryFn: () => api.matchAnalogs({ mars_site_id: reference, top_k: 12 }),
    staleTime: Infinity,
    retry: false,
  });
  const matches: AnalogMatch[] = useMemo(() => q.data?.matches ?? [], [q.data]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Follow the service's own ordering when the reference changes; never keep a stale pick.
  useEffect(() => { setActiveId(matches[0]?.earth_candidate.id ?? null); }, [matches]);
  const active = matches.find(m => m.earth_candidate.id === activeId) ?? matches[0] ?? null;

  return (
    <div className="border-b border-line bg-bg">
      <header className="border-b border-line bg-bg-elev px-5 py-6 md:px-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="border-l-[3px] border-copper pl-5">
            <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">Earth Analog Research</h1>
            <p className="mt-1 text-sm text-fg-muted">The established Earth analogs for {q.data ? <span className="text-fg">{reference.replace(/_/g, " ")}</span> : "the selected Mars site"}, with what each one is documented to have been used to study.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-5 md:px-8">
        {q.isPending ? <p role="status" className="text-sm text-fg-muted">Ranking the established analogs…</p>
          : q.error ? <ErrorNote error={q.error} context="analogs/match" />
          : matches.length === 0 ? <EmptyNote>The service returned no established analog for this site.</EmptyNote>
          : <>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Established Earth analogs">
              {matches.map(m => {
                const c = m.earth_candidate;
                const selected = c.id === active?.earth_candidate.id;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setActiveId(c.id)} aria-pressed={selected}
                      className={`flex h-full w-full flex-col rounded-2xl border p-3.5 text-left transition-colors ${selected ? "border-copper bg-copper/10" : "border-line-strong bg-bg-elev hover:border-line-strong hover:bg-bg-elev-2"}`}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold leading-tight text-fg">{c.name}</span>
                        <span className="num shrink-0 text-sm text-copper-bright">{m.similarity != null ? m.similarity.toFixed(1) : "—"}</span>
                      </span>
                      <span className="num mt-0.5 block text-[10.5px] text-fg-faint">{c.region} · {formatPoint(c.lat, c.lon_east)}</span>
                      <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-sm bg-line" aria-hidden>
                        {m.similarity != null && <span className="block h-full bg-copper" style={{ width: `${m.similarity}%` }} />}
                      </span>
                      <span className="mt-2.5 line-clamp-3 text-xs leading-relaxed text-fg-muted">{c.description}</span>
                      <span className="mt-2.5 flex flex-wrap gap-1 text-[10.5px]">
                        <span className="rounded border border-line px-1.5 py-0.5 text-fg-muted">{list(m.shared_characteristics).length} shared</span>
                        {list(m.documented_analog_use).length > 0 && <span className="rounded border border-info/40 bg-info/10 px-1.5 py-0.5 text-info">{list(m.documented_analog_use).length} documented campaign{list(m.documented_analog_use).length === 1 ? "" : "s"}</span>}
                        {c.coordinates_approximate && <span className="rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-warn">approximate coordinates</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {active && (
              <div className="grid items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
                <section aria-label={`Analog comparison: ${active.earth_candidate.name}`} className="rounded-2xl border border-line-strong bg-bg-elev p-4 md:p-5">
                  <h2 className="border-b border-line pb-3 text-base font-semibold text-fg">{active.earth_candidate.name} <span className="text-fg-muted">compared with {reference.replace(/_/g, " ")}</span></h2>
                  <div className="mt-4 grid gap-5 md:grid-cols-[1fr_1.1fr]">
                    <div className="space-y-3">
                      <VerifiedImage body="earth" siteId={active.earth_candidate.id} label={`Earth · ${active.earth_candidate.name}`} />
                      <VerifiedImage body="mars" siteId={reference} label={`Mars · ${reference.replace(/_/g, " ")}`} />
                    </div>
                    <div className="divide-y divide-line">
                      <Panel title="Shared features" items={list(active.shared_characteristics)}
                        empty="The service found no feature close enough to report as shared at the configured comparison scales." />
                      <Panel title="Documented research use" items={list(active.documented_analog_use)}
                        empty="No analog campaign is recorded for this location in our sources. That is a gap in the catalogue, not evidence that none exists." />
                      <Panel title="Where the analogy breaks down" tone="warn"
                        items={[...list(active.important_differences), ...list(active.noncomparable_variables), ...list(q.data?.planetary_differences)]}
                        empty="No difference was recorded, which means the comparison was incomplete rather than perfect." />
                    </div>
                  </div>
                  {list(active.citations).length > 0 && <p className="mt-4 border-t border-line pt-3 text-[10.5px] leading-snug text-fg-faint">Sources behind this comparison: {list(active.citations).join(", ")}.</p>}
                </section>

                <section aria-label="Evidence and NASA datasets" className="rounded-2xl border border-line-strong bg-bg-elev p-4 md:p-5">
                  <h2 className="text-base font-semibold text-fg">Evidence and NASA archives</h2>
                  <p className="my-2.5 text-xs leading-relaxed text-fg-muted">Where to take a question this page cannot answer. These open in a new tab; nothing here is read from them.</p>
                  <div className="space-y-2">
                    {DATASETS.map(d => (
                      <a key={d.title} href={d.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-line bg-bg p-3 transition-colors hover:border-info/60">
                        <span className="block text-xs font-semibold text-fg">{d.title} <span className="text-info">↗</span></span>
                        <span className="mt-1 block text-[11px] text-fg-muted">{d.description}</span>
                      </a>
                    ))}
                  </div>
                  {q.data?.analog_spec_version && <p className="mt-3 text-[10.5px] text-fg-faint">Analog scoring spec {q.data.analog_spec_version}. The index is a heuristic, not a probability.</p>}
                </section>
              </div>
            )}
          </>}
        <p className="pb-1 text-[11px] leading-relaxed text-fg-faint">Earth analogs reproduce selected environmental or operational conditions, never a complete planetary environment. The Moon is deferred in this release and is not shown. Compare the primary datasets before drawing any scientific conclusion.</p>
      </div>
    </div>
  );
}
