// PlanetViewer: the React Three Fiber scene. Camera, hover and rotation state
// live inside this tree (R3F local state) and never pass through the Zustand
// store, per docs/ARCHITECTURE.md. The parent hands in a PlanetConfig, a flat
// marker list, the selected id and callbacks.
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, useProgress } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Quaternion, Spherical, Vector3 } from "three";
import { RotateCcw, Pause, Play, LocateFixed } from "lucide-react";
import { MarsSphere, PlaceholderSphere } from "./MarsSphere";
import { SiteMarkers } from "./SiteMarkers";
import { latLonToVector3 } from "./geo";
import { GlobeLegend } from "./GlobeLegend";
import type { PlanetConfig } from "./PlanetConfig";
import type { MarkerDatum } from "./MarkerData";

export interface PlanetViewerProps {
  config: PlanetConfig;
  markers: MarkerDatum[];
  selectedId: string | null;
  focusToken?: number;
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
  const selected = markers.find(m => m.id === selectedId);
  const [focusRequest, setFocusRequest] = useState(0);
  const [navigation, setNavigation] = useState({ id: 0, action: "" });
  return (
    <div tabIndex={0} role="region" aria-label="Interactive Mars globe" aria-describedby="globe-keyboard-help" className="relative h-full w-full min-h-[320px] overflow-hidden bg-[#06090d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-bright focus-visible:-outline-offset-2"
      onKeyDown={e => {
        if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
        const key = e.key.toLowerCase();
        if (!["arrowleft", "arrowright", "arrowup", "arrowdown", "+", "=", "-", "_", "f", "r"].includes(key)) return;
        e.preventDefault();
        onAutoRotateChange(false);
        if (key === "r") onRequestReset();
        else if (key === "f") setFocusRequest(n => n + 1);
        else setNavigation(n => ({ id: n.id + 1, action: key }));
      }}>
      <p id="globe-keyboard-help" className="sr-only">Arrow keys orbit Mars. Plus and minus zoom. F focuses the selected site. R resets the camera. Tab moves out of the globe. Select a site from the candidate list using Enter or Space.</p>
      <Canvas
        camera={{ position: DEFAULT_CAMERA.toArray(), fov: 42, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => undefined}
      >
        <color attach="background" args={["#06090d"]} />
        <ambientLight intensity={selected ? 1.1 : 0.35} />
        <directionalLight position={[5, 2, 4]} intensity={2.2} color="#fff2e0" />
        <directionalLight position={[-6, -1, -3]} intensity={0.25} color="#8aa0c8" />
        <Stars radius={60} depth={30} count={2500} factor={2.5} saturation={0} fade speed={0.2} />
        <Suspense fallback={<PlaceholderSphere config={config} />}>
          <MarsSphere config={config} />
        </Suspense>
        <SiteMarkers config={config} markers={markers} selectedId={selectedId} onSelect={onSelect} />
        <Controls autoRotate={autoRotate} resetToken={resetToken} radius={config.radius} selectedId={selectedId} lat={selected?.lat} lonEast={selected?.lonEast} focusToken={`${props.focusToken ?? 0}:${focusRequest}`} navigation={navigation} />
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
          {selected && <button type="button" onClick={() => { onAutoRotateChange(false); setFocusRequest(n => n + 1); }} aria-label="Focus selected site" className="inline-flex h-8 items-center gap-1 rounded border border-line bg-bg-elev/90 px-2 text-xs text-fg-muted hover:text-fg"><LocateFixed className="h-4 w-4" aria-hidden /> Focus site</button>}
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
      {selected && <div className="pointer-events-none absolute left-3 right-3 top-16 rounded-lg border border-line bg-bg-elev/90 p-3 text-sm text-fg" role="status">{selected.name}<p className="mt-1 text-xs text-fg-muted">Regional orbital mosaic. Surface photographs and local terrain detail are not loaded in this view.</p></div>}
      <div className="pointer-events-none absolute bottom-3 left-3">
        <GlobeLegend config={config} />
      </div>
      <div className="pointer-events-none absolute bottom-3 right-3 text-[10.5px] text-fg-faint">
        <span className="hidden xl:inline">Focus globe: arrows orbit · + / − zoom · F focus · R reset</span><span className="xl:hidden">Tab to globe for keyboard controls</span>
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
function Controls({ autoRotate, resetToken, radius, selectedId, lat, lonEast, focusToken, navigation }: { autoRotate: boolean; resetToken: number; radius: number; selectedId: string | null; lat?: number; lonEast?: number; focusToken: string; navigation: { id: number; action: string } }) {
  const ref = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const [interacting, setInteracting] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const flight = useRef<{ start: Vector3; turn: Quaternion; distance: number; elapsed: number } | null>(null);
  const direction = useRef(new Vector3());
  const rotation = useRef(new Quaternion());
  useEffect(() => () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    flight.current = null;
    camera.position.copy(DEFAULT_CAMERA);
    c.target.set(0, 0, 0);
    c.update();
  }, [resetToken, camera]);

  useEffect(() => {
    if (!selectedId || lat === undefined || lonEast === undefined || !ref.current) return;
    const target = latLonToVector3(lat, lonEast, 1).normalize();
    const start = camera.position.clone().normalize();
    const distance = radius * 1.65;
    ref.current.target.set(0, 0, 0);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      camera.position.copy(target.multiplyScalar(distance));
      ref.current.update();
      flight.current = null;
    } else {
      flight.current = { start, turn: new Quaternion().setFromUnitVectors(start, target), distance: camera.position.length(), elapsed: 0 };
    }
  }, [selectedId, lat, lonEast, focusToken, radius, camera]);

  useEffect(() => {
    if (!navigation.id || !ref.current) return;
    flight.current = null;
    const spherical = new Spherical().setFromVector3(camera.position);
    const key = navigation.action;
    if (key === "arrowleft") spherical.theta += 0.12;
    if (key === "arrowright") spherical.theta -= 0.12;
    if (key === "arrowup") spherical.phi -= 0.12;
    if (key === "arrowdown") spherical.phi += 0.12;
    if (key === "+" || key === "=") spherical.radius *= 0.9;
    if (key === "-" || key === "_") spherical.radius *= 1.1;
    spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));
    spherical.radius = Math.max(radius * 1.35, Math.min(radius * 7, spherical.radius));
    camera.position.setFromSpherical(spherical);
    ref.current.update();
  }, [navigation, camera, radius]);

  useFrame((_state, delta) => {
    const f = flight.current;
    const controls = ref.current;
    if (!f || !controls) return;
    f.elapsed += Math.min(delta, 0.1);
    const t = Math.min(f.elapsed / 1.2, 1);
    const eased = t * t * (3 - 2 * t);
    // Travel around the sphere, never through it when selecting the far side.
    rotation.current.identity().slerp(f.turn, eased);
    direction.current.copy(f.start).applyQuaternion(rotation.current);
    camera.position.copy(direction.current.multiplyScalar(f.distance + (radius * 1.65 - f.distance) * eased));
    controls.target.set(0, 0, 0);
    controls.update();
    if (t === 1) flight.current = null;
  });

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
        flight.current = null;
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
