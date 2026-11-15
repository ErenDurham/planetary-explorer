// Entry into Find Earth Analogs from a Mars region's detail panel. Discovery
// surveys exist only for the service's reference region (Jezero in this
// release), so other regions get an honest note rather than a dead button.
import { Compass } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { useAppStore } from "@/store/useAppStore";
import { useDiscoveryCapabilities } from "../hooks/useDiscoveryCapabilities";

export function FindAnalogsEntry({ siteId, siteName }: { siteId: string; siteName: string }) {
  const caps = useDiscoveryCapabilities();
  const openFindAnalogs = useAppStore((s) => s.openFindAnalogs);
  const reference = caps.kind === "ready" ? caps.capabilities.reference : caps.kind === "unavailable" ? caps.capabilities?.reference : undefined;
  const supported = caps.kind === "ready" && reference?.id === siteId;
  return (
    <Section title="Find Earth analogs" subtitle="Candidate Earth regions from an offline terrain survey, separate from the established analogs.">
      {supported ? (
        <button type="button" onClick={openFindAnalogs} className="flex w-full items-center gap-2 rounded-lg border border-info/50 bg-info/10 p-3 text-left text-sm font-semibold text-info" data-testid="find-analogs-entry">
          <Compass className="h-4 w-4 shrink-0" aria-hidden />Find Earth regions with terrain similar to {siteName} →
        </button>
      ) : (
        <p className="text-xs text-fg-muted" data-testid="find-analogs-unavailable">
          {caps.kind === "loading" ? "Checking for a terrain survey…" : reference && reference.id !== siteId ? `Candidate discovery is available for ${reference.name} in this release. Established analogs for ${siteName} are on the Earth globe.` : "No discovery survey is installed, so only the established analogs are available."}
        </p>
      )}
    </Section>
  );
}
