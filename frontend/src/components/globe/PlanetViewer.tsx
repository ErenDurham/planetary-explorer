// PlanetViewer: the React Three Fiber scene. Camera, hover and rotation state
// live inside this tree (R3F local state) and never pass through the Zustand
// store, per docs/ARCHITECTURE.md. The parent hands in a PlanetConfig, a flat
// marker list, the selected id and callbacks.
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, useProgress } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Vector3 } from "three";
import { RotateCcw, Pause, Play } from "lucide-react";
import { MarsSphere, PlaceholderSphere } from "./MarsSphere";
import { SiteMarkers } from "./SiteMarkers";
import { GlobeLegend } from "./GlobeLegend";
import type { PlanetConfig } from "./PlanetConfig";
import type { MarkerDatum } from "./MarkerData";

export interface PlanetViewerProps {
  config: PlanetConfig;
  markers: MarkerDatum[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  autoRotate: boolean;
  onAutoRotateChange: (v: boolean) => void;
  /** Change this value to request a camera reset. */
  resetToken: number;
  onRequestReset: () => void;
  statusLine?: string;
}

const DEFAULT_CAMERA = new Vector3(0, 0.6, 3.1);

export function PlanetViewer(props: PlanetViewerProps) {
  const { config, markers, selectedId, onSelect, autoRotate, onAutoRotateChange, resetToken, onRequestReset, statusLine } = props;
  return (
    <div className="relative h-full w-full min-h-[320px] overflow-hidden bg-[#06090d]">
      <Canvas
        camera={{ position: DEFAULT_CAMERA.toArray(), fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => undefined}
      >
        <color attach="background" args={["#06090d"]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 2, 4]} intensity={2.2} color="#fff2e0" />
        <directionalLight position={[-6, -1, -3]} intensity={0.25} color="#8aa0c8" />
        <Stars radius={60} depth={30} count={2500} factor={2.5} saturation={0} fade speed={0.2} />
        <Suspense fallback={<PlaceholderSphere config={config} />}>
          <MarsSphere config={config} />
        </Suspense>
        <SiteMarkers config={config} markers={markers} selectedId={selectedId} onSelect={onSelect} />
        <Controls autoRotate={autoRotate} resetToken={resetToken} radius={config.radius} />
      </Canvas>

      <LoadingOverlay />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onRequestReset}
            aria-label="Reset camera"
            title="Reset camera"
            className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-bg-elev/90 px-2.5 text-xs text-fg-muted hover:text-fg"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reset view
          </button>
          <button
            type="button"
            onClick={() => onAutoRotateChange(!autoRotate)}
            aria-pressed={autoRotate}
            aria-label={autoRotate ? "Pause auto-rotate" : "Resume auto-rotate"}
            title={autoRotate ? "Pause auto-rotate" : "Resume auto-rotate"}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-bg-elev/90 px-2.5 text-xs text-fg-muted hover:text-fg"
          >
            {autoRotate ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {autoRotate ? "Rotating" : "Paused"}
          </button>
        </div>
        {statusLine && <div className="pointer-events-auto rounded border border-line bg-bg-elev/90 px-2.5 py-1.5 text-[10.5px] text-fg-muted">{statusLine}</div>}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3">
        <GlobeLegend config={config} />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 text-[10.5px] text-fg-faint">
        drag to orbit · scroll to zoom · click a marker to select
      </div>
    </div>
  );
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (!active && progress >= 100) {
      const t = window.setTimeout(() => setShow(false), 250);
      return () => window.clearTimeout(t);
    }
    if (active) setShow(true);
  }, [active, progress]);
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#06090d]/60">
      <div className="rounded border border-line bg-bg-elev/90 px-4 py-2 text-xs text-fg-muted">
        Loading Mars texture… <span className="num">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

/** OrbitControls with auto-rotate that pauses while the user interacts, plus reset. */
function Controls({ autoRotate, resetToken, radius }: { autoRotate: boolean; resetToken: number; radius: number }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const [interacting, setInteracting] = useState(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    camera.position.copy(DEFAULT_CAMERA);
    c.target.set(0, 0, 0);
    c.update();
  }, [resetToken, camera]);

  return (
    <OrbitControls
      ref={ref}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={radius * 1.35}
      maxDistance={radius * 7}
      autoRotate={autoRotate && !interacting}
      autoRotateSpeed={0.35}
      onStart={() => {
        setInteracting(true);
        if (idleTimer.current) window.clearTimeout(idleTimer.current);
      }}
      onEnd={() => {
        // resume auto-rotate after a few idle seconds
        idleTimer.current = window.setTimeout(() => setInteracting(false), 3500);
      }}
    />
  );
}
