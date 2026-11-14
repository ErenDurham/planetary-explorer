import { useHealth } from "@/hooks/useSites";

export function HealthChip() {
  const h = useHealth();
  const ok = !!h.data && !h.error;
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px] text-fg-faint" title={ok ? `Connected · API ${h.data?.version}` : "Cannot connect to the data service"}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${h.isPending ? "bg-fg-faint" : ok ? "bg-ok" : "bg-danger"}`} />
      {h.isPending ? "Connecting…" : ok ? "Connected" : "Offline"}
    </span>
  );
}
