// Renders the shared AnalogPreferences component (owned by the Mission/Explore
// engineer) when the file exists, discovered at build time with import.meta.glob
// so this module compiles whether or not it has landed; otherwise the local
// AnalogWeightControls. A render failure in the shared component falls back too.
import { Component, Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { AnalogWeightControls } from "@/components/compare/AnalogWeightControls";

type Mod = { AnalogPreferences?: ComponentType<Record<string, never>>; default?: ComponentType<Record<string, never>> };
const shared = import.meta.glob<Mod>("/src/components/mission/AnalogPreferences.tsx");
const loader = Object.values(shared)[0];
export const SHARED_ANALOG_PREFERENCES_AVAILABLE = !!loader;
const Shared = loader ? lazy(() => loader().then(m => ({ default: (m.AnalogPreferences ?? m.default ?? AnalogWeightControls) as ComponentType }))) : null;

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <AnalogWeightControls /> : this.props.children; }
}

export function AnalogPreferencesSlot() {
  if (!Shared) return <AnalogWeightControls />;
  return <Boundary><Suspense fallback={<p className="text-xs text-fg-muted">Loading analog preferences…</p>}><Shared /></Suspense></Boundary>;
}
