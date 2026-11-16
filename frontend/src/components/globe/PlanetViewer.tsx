import { useMotionPreference } from "@/lib/motion/preferences";
import { planetTravel, PLANET_TRAVEL_SECONDS } from "./planetMotion";
// PlanetViewer: the React Three Fiber scene. Camera, hover and rotation state
// live inside this tree (R3F local state) and never pass through the Zustand
// store, per docs/ARCHITECTURE.md. The parent hands in a PlanetConfig, a flat
// marker list, the selected id and callbacks.
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, useProgress } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ACESFilmicToneMapping, Color, Quaternion, Spherical, Vector3, type DirectionalLight, type HemisphereLight, type Mesh } from "three";
import { RotateCcw, Pause, Play, LocateFixed, X } from "lucide-react";
import { PlanetSphere, PlaceholderSphere } from "./PlanetSphere";
import { Atmosphere } from "./Atmosphere";
import { GlobeErrorBoundary, GlobeFallback } from "./GlobeFallback";
import { hasWebGL, prefersReducedMotion } from "./webgl";
import { SiteMarkers } from "./SiteMarkers";
import { latLonToVector3 } from "./geo";
import { legendBottomOffset, type OverlayBounds } from "@/lib/overlay";
import { GlobeLegend } from "./GlobeLegend";
import { GLOBE_DPR, type PlanetConfig } from "./PlanetConfig";
import type { MarkerDatum, MarkerMode } from "./MarkerData";
import type { RankPalette } from "@/lib/rankColor";

export interface PlanetViewerProps {
  config: PlanetConfig;
  markers: MarkerDatum[];
  selectedId: string | null;
  focusToken?: number;
  onSelect: (id: string) => void;
  onDeselect?: () => void;
  overlayBounds?: OverlayBounds|null;
  onOverlayMaxHeightChange?: (height:number|undefined)=>void;
  autoRotate: boolean;
  onAutoRotateChange: (v: boolean) => void;
  /** Change this value to request a camera reset. */
  resetToken: number;
  onRequestReset: () => void;
  statusLine?: string;
  /** Which legend and marker encoding is in force. Defaults to landing. */
  mode?: MarkerMode;
  palette?: RankPalette;
  onPaletteChange?: (p: RankPalette) => void;
  /** Analog mode: names the reference in the legend, e.g. "Earth matches to Elysium Planitia (InSight)". */
  legendHeading?: string;
  rankedCount?: number | null;
  /** Extra scene content drawn on the surface (SurfaceOverlays); the viewer gives it no meaning. */
  overlays?: ReactNode;
  /** Camera distance, as a multiple of the radius, that selecting a marker flies to. 1.65 frames a region; ~1.08 frames a 60 km footprint. */
  focusDistance?: number;
}

const DEFAULT_CAMERA = new Vector3(0, 0.6, 3.1);

export function PlanetViewer(props: PlanetViewerProps) {
  const { config, markers, selectedId, onSelect, autoRotate, onAutoRotateChange, resetToken, onRequestReset, statusLine, mode = "landing", palette = "roygbiv", onPaletteChange, legendHeading, rankedCount, overlays, focusDistance = 1.65 } = props;
  const selected = markers.find(m => m.id === selectedId);
  const body = config.displayName;
  const [travelling,setTravelling]=useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [rotationRequest, setRotationRequest] = useState(0);
  const [navigation, setNavigation] = useState({ id: 0, action: "" });
  const planetRef = useRef<Mesh>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef=useRef<HTMLDivElement>(null);
  const [legendBottom,setLegendBottom]=useState(12);
  useLayoutEffect(()=>{
    const root=containerRef.current,legend=legendRef.current;if(!root||!legend)return;
    const update=()=>{const bounds=root.getBoundingClientRect(),size=legend.getBoundingClientRect();setLegendBottom(legendBottomOffset(bounds,size,props.overlayBounds??null));
      const bottom=window.matchMedia("(max-width: 1023px)").matches ? window.innerHeight : (root.closest("main")?.getBoundingClientRect().bottom ?? bounds.bottom)-12;
      props.onOverlayMaxHeightChange?.(Math.max(144,Math.floor(Math.min(window.innerHeight*.8,bottom-bounds.top-size.height-24))));};
    const observer=new ResizeObserver(update);observer.observe(root);observer.observe(legend);window.addEventListener("resize",update);window.addEventListener("scroll",update,true);update();
    return()=>{observer.disconnect();window.removeEventListener("resize",update);window.removeEventListener("scroll",update,true);};
  },[props.overlayBounds,props.onOverlayMaxHeightChange]);
  useEffect(()=>()=>props.onOverlayMaxHeightChange?.(undefined),[props.onOverlayMaxHeightChange]);
  const deselect = useRef(props.onDeselect);
  deselect.current = props.onDeselect;
  // no WebGL (or a renderer that fails later) gets the flat map with the same markers and legend
  const webgl = useMemo(() => hasWebGL(), []);
  const reducedMotion = useMotionPreference();
  const legend = <GlobeLegend config={config} mode={mode} palette={palette} onPaletteChange={onPaletteChange} heading={legendHeading} rankedCount={rankedCount} />;
  if (!webgl) return <GlobeFallback config={config} markers={markers} selectedId={selectedId} onSelect={onSelect} reason="This browser cannot draw 3D graphics (WebGL is unavailable)." legend={legend} />;
  return (
    <GlobeErrorBoundary fallback={(error) => <GlobeFallback config={config} markers={markers} selectedId={selectedId} onSelect={onSelect} reason={`The 3D renderer stopped (${error.message}).`} legend={legend} />}>
    <div ref={containerRef} tabIndex={0} role="region" aria-label={`Interactive ${body} globe`} aria-describedby="globe-keyboard-help" data-body={config.id} data-travelling={travelling} className="planet-viewport relative h-full w-full min-h-[320px] overflow-hidden bg-canvas focus-visible:outline focus-visible:outline-2 focus-visible:outline-copper-bright focus-visible:-outline-offset-2" style={{ background: "var(--color-canvas)" }}
      onKeyDown={e => {
        if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
        const key = e.key.toLowerCase();
        if (key === "escape") { e.preventDefault(); deselect.current?.(); return; }
        if (!["arrowleft", "arrowright", "arrowup", "arrowdown", "+", "=", "-", "_", "f", "r"].includes(key)) return;
        e.preventDefault();
        onAutoRotateChange(false);
        if (key === "r") onRequestReset();
        else if (key === "f") setFocusRequest(n => n + 1);
        else setNavigation(n => ({ id: n.id + 1, action: key }));
      }}>
      <p id="globe-keyboard-help" className="sr-only">Arrow keys orbit {body}. Plus and minus zoom. F focuses the selected site. Escape clears the current selection. Click empty globe space to deselect. R resets the camera. Tab moves out of the globe. Select a site from the candidate list using Enter or Space. {body} has a mean radius of {Math.round(config.bodyRadiusKm).toLocaleString()} km; {markers.length} candidate {markers.length === 1 ? "location is" : "locations are"} marked at their real coordinates.</p>
      <Canvas
        camera={{ position: DEFAULT_CAMERA.toArray(), fov: 42, near: 0.02, far: 100 }}
        dpr={GLOBE_DPR}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => { gl.toneMapping = ACESFilmicToneMapping; gl.toneMappingExposure = config.lighting.exposure; gl.setClearColor(0x000000, 0); }}
        onPointerMissed={(event) => { if (event.type === "click" && !travelling) { deselect.current?.(); containerRef.current?.focus({preventScroll:true}); } }}
      >
        {/* a sky/ground hemisphere lifts the night side; the warm key rides with the camera so a focused site is never on the dark side */}
        <PlanetLighting config={config} />
        <KeyLight intensity={config.lighting.keyIntensity} color={config.lighting.key} />
        <directionalLight position={[-6, -1, -3]} intensity={0.18} color="#8aa0c8" />
        <Stars radius={32} depth={12} count={1000} factor={2} saturation={0} fade speed={reducedMotion ? 0 : 0.15} />
        <Suspense fallback={<PlaceholderSphere config={config} meshRef={planetRef} />}>
          <PlanetSphere config={config} meshRef={planetRef} reducedMotion={reducedMotion} />
        </Suspense>
        <Atmosphere radius={config.radius} spec={config.atmosphere} />
        {!travelling && overlays}
        {!travelling && <SiteMarkers config={config} markers={markers} selectedId={selectedId} onSelect={onSelect} planetRef={planetRef} reducedMotion={reducedMotion} />}
        <Controls rotationRequest={rotationRequest} onTravel={setTravelling} bodyId={config.id} autoRotate={autoRotate && !reducedMotion && !travelling} resetToken={resetToken} radius={config.radius} selectedId={selectedId} lat={selected?.lat} lonEast={selected?.lonEast} focusToken={`${props.focusToken ?? 0}:${focusRequest}`} navigation={navigation} focusDistance={focusDistance} />
      </Canvas>

      <LoadingOverlay body={body} />
      <div className="planet-identity" aria-hidden="true"><span>{config.id === "earth" ? "Terrestrial environment" : "Planetary reference"}</span><strong>{body}</strong>{selected && <p>{selected.name}</p>}</div>
      {travelling && <div className="planet-transit" role="status"><span>Changing view <span aria-hidden>↗</span> {body}</span><i aria-hidden /></div>}


      {/* HUD */}
      <div className="pointer-events-none absolute left-0 right-36 top-0 flex items-start p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
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
          {selected && props.onDeselect && <button type="button" onClick={() => deselect.current?.()} aria-label="Clear selection" title="Clear selection" className="inline-flex h-8 items-center gap-1 rounded border border-line bg-bg-elev/90 px-2 text-xs text-fg-muted hover:text-fg"><X className="h-4 w-4" aria-hidden /><span className="hidden xl:inline">Clear</span></button>}
          <button
            type="button"
            onClick={() => { if (!autoRotate) setRotationRequest(n => n + 1); onAutoRotateChange(!autoRotate); }}
            aria-pressed={autoRotate}
            aria-label={autoRotate ? "Pause auto-rotate" : "Resume auto-rotate"}
            title={autoRotate ? "Pause auto-rotate" : "Resume auto-rotate"}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-line bg-bg-elev/90 px-2.5 text-xs text-fg-muted hover:text-fg"
          >
            {autoRotate ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
            {autoRotate ? "Rotating" : "Paused"}
          </button>
        </div>
        {statusLine && <div className="sr-only">{statusLine}</div>}
      </div>
      <div ref={legendRef} data-testid="globe-legend" className="pointer-events-none absolute left-3" style={{bottom:legendBottom}}>
        {legend}
      </div>
    </div>
    </GlobeErrorBoundary>
  );
}

function LoadingOverlay({ body }: { body: string }) {
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
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-canvas/60">
      <div className="rounded border border-line bg-bg-elev/90 px-4 py-2 text-xs text-fg-muted">
        Loading {body} texture… <span className="num">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

interface CameraMemory { position: Vector3; target: Vector3; selection:string|null }

/** The key light follows the camera, offset up and to the camera's right, so
 * whatever the user is looking at is lit from a consistent "sun over the
 * shoulder" angle and relief still shades. A world-fixed light left a focused
 * site in darkness whenever the camera flew to the far side of the globe. */
function PlanetLighting({config}:{config:PlanetConfig}){
  const light=useRef<HemisphereLight>(null);
  const reduce=prefersReducedMotion();
  const initial=useRef(config.lighting);
  const {gl}=useThree();
  const sky=useMemo(()=>new Color(config.lighting.sky),[config.lighting.sky]);
  const ground=useMemo(()=>new Color(config.lighting.ground),[config.lighting.ground]);
  useFrame((_,delta)=>{const k=reduce?1:1-Math.exp(-Math.min(delta,.1)*5);if(light.current){light.current.color.lerp(sky,k);light.current.groundColor.lerp(ground,k);light.current.intensity+=(config.lighting.hemisphere-light.current.intensity)*k;}gl.toneMappingExposure+=(config.lighting.exposure-gl.toneMappingExposure)*k;});
  return <hemisphereLight ref={light} args={[initial.current.sky,initial.current.ground,initial.current.hemisphere]}/>;
}

function KeyLight({ intensity, color }: { intensity: number; color: string }) {
  const ref = useRef<DirectionalLight>(null);
  const { camera } = useThree();
  const initial=useRef({intensity,color});
  const tint=useMemo(()=>new Color(color),[color]);
  const reduce=prefersReducedMotion();
  const scratch = useMemo(() => ({ right: new Vector3(), up: new Vector3(), pos: new Vector3() }), []);
  useFrame((_,delta) => {
    const light = ref.current; if (!light) return;
    const { right, up, pos } = scratch;
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    pos.copy(camera.position).normalize().multiplyScalar(6).addScaledVector(right, 3.2).addScaledVector(up, 2.6);
    light.position.copy(pos);
    const k=reduce?1:1-Math.exp(-Math.min(delta,.1)*5);light.color.lerp(tint,k);light.intensity+=(intensity-light.intensity)*k;
  });
  return <directionalLight ref={ref} position={[5, 2.5, 4]} intensity={initial.current.intensity} color={initial.current.color} />;
}

/** OrbitControls with auto-rotate that pauses while the user interacts, reset,
 * and a per-body camera memory: switching Earth <-> Mars saves the current
 * orbit and restores the other body's last orbit (default on first visit). */
function Controls({ rotationRequest, onTravel, bodyId, autoRotate, resetToken, radius, selectedId, lat, lonEast, focusToken, navigation, focusDistance }: { rotationRequest:number; onTravel:(moving:boolean)=>void; bodyId: string; autoRotate: boolean; resetToken: number; radius: number; selectedId: string | null; lat?: number; lonEast?: number; focusToken: string; navigation: { id: number; action: string }; focusDistance: number }) {
  // the closest the camera may come; a tight focus distance lowers it so the flight can land
  const minDistance = radius * Math.min(1.35, focusDistance - 0.03);
  const ref = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const [interacting, setInteracting] = useState(false);
  const idleTimer = useRef<number | null>(null);
  const flight = useRef<{ kind:"focus"|"planet"; start: Vector3; turn: Quaternion; distance: number; endDistance:number; elapsed: number; awaitingSelection?: boolean } | null>(null);
  const queuedFocus=useRef<Vector3|null>(null);
  const bodyChanged=useRef(false);
  const previousSelection=useRef(selectedId);
  const direction = useRef(new Vector3());
  const rotation = useRef(new Quaternion());
  const memory = useRef(new Map<string, CameraMemory>());
  const lastBody = useRef(bodyId);
  useEffect(() => () => { if (idleTimer.current) window.clearTimeout(idleTimer.current); }, []);
  // Explicit Play overrides the temporary drag pause and any selection flight.
  useEffect(() => {
    if (!rotationRequest) return;
    if (idleTimer.current) window.clearTimeout(idleTimer.current);
    setInteracting(false);
    flight.current = null;
    queuedFocus.current = null;
    onTravel(false);
  }, [rotationRequest, onTravel]);


  useEffect(() => {
    const c = ref.current;
    if (!c || lastBody.current === bodyId) return;
    if(flight.current?.kind!=="planet")memory.current.set(lastBody.current,{position:camera.position.clone(),target:c.target.clone(),selection:previousSelection.current});
    lastBody.current=bodyId;bodyChanged.current=true;queuedFocus.current=null;
    const saved=memory.current.get(bodyId);
    const end=saved && saved.selection===selectedId ? saved.position.clone() : selectedId && lat!==undefined && lonEast!==undefined ? latLonToVector3(lat,lonEast,radius*focusDistance) : DEFAULT_CAMERA.clone();
    if(prefersReducedMotion()){
      camera.position.copy(end);c.target.copy(saved?.target ?? new Vector3());c.update();flight.current=null;onTravel(false);
    }else{
      const start=camera.position.clone().normalize();
      flight.current={kind:"planet",start,turn:new Quaternion().setFromUnitVectors(start,end.clone().normalize()),distance:camera.position.length(),endDistance:end.length(),elapsed:0,awaitingSelection:!(saved && saved.selection===selectedId) && !!selectedId && (lat===undefined || lonEast===undefined)};
      onTravel(true);
    }
  }, [bodyId, camera]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    flight.current = null;queuedFocus.current=null;onTravel(false);
    camera.position.copy(DEFAULT_CAMERA);
    c.target.set(0, 0, 0);
    c.update();
  }, [resetToken, camera]);

  useEffect(() => {
    const selectionChanged = previousSelection.current !== selectedId;
    previousSelection.current=selectedId;
    if(bodyChanged.current){bodyChanged.current=false;return;}
    if (flight.current?.kind === "planet") {
      // Ranking may deliver this body's coordinates after departure. Let the body
      // handoff finish before focusing; never cancel the flight halfway through a texture blend.
      if (!selectedId) queuedFocus.current=null;
      else if ((selectionChanged || flight.current.awaitingSelection) && lat!==undefined && lonEast!==undefined) queuedFocus.current=latLonToVector3(lat,lonEast,radius*focusDistance);
      return;
    }
    if (!selectedId) { flight.current = null; return; }
    if (lat === undefined || lonEast === undefined || !ref.current) return;
    onTravel(false);
    const target = latLonToVector3(lat, lonEast, 1).normalize();
    const start = camera.position.clone().normalize();
    const distance = radius * focusDistance;
    ref.current.target.set(0, 0, 0);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      camera.position.copy(target.multiplyScalar(distance));
      ref.current.update();
      flight.current = null;
    } else {
      flight.current = { kind:"focus",endDistance:distance,start, turn: new Quaternion().setFromUnitVectors(start, target), distance: camera.position.length(), elapsed: 0 };
    }
  }, [bodyId, selectedId, lat, lonEast, focusToken, radius, camera, focusDistance]);

  useEffect(() => {
    if (!navigation.id || !ref.current) return;
    flight.current = null;queuedFocus.current=null;
    onTravel(false);
    const spherical = new Spherical().setFromVector3(camera.position);
    const key = navigation.action;
    if (key === "arrowleft") spherical.theta += 0.12;
    if (key === "arrowright") spherical.theta -= 0.12;
    if (key === "arrowup") spherical.phi -= 0.12;
    if (key === "arrowdown") spherical.phi += 0.12;
    if (key === "+" || key === "=") spherical.radius *= 0.9;
    if (key === "-" || key === "_") spherical.radius *= 1.1;
    spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, spherical.phi));
    spherical.radius = Math.max(minDistance, Math.min(radius * 7, spherical.radius));
    camera.position.setFromSpherical(spherical);
    ref.current.update();
  }, [navigation, camera, radius, minDistance]);

  useFrame((_state, delta) => {
    const f = flight.current;
    const controls = ref.current;
    if (!f || !controls) return;
    f.elapsed = prefersReducedMotion() ? PLANET_TRAVEL_SECONDS : f.elapsed + Math.min(delta, 0.1);
    const t = Math.min(f.elapsed / (f.kind==="planet" ? PLANET_TRAVEL_SECONDS : 1.2), 1);
    const travel=f.kind==="planet" ? planetTravel(f.elapsed,f.distance,f.endDistance,radius) : null;
    const eased = travel?.turn ?? t * t * (3 - 2 * t);
    // Travel around the sphere, never through it when selecting the far side.
    rotation.current.identity().slerp(f.turn, eased);
    direction.current.copy(f.start).applyQuaternion(rotation.current);
    camera.position.copy(direction.current.multiplyScalar(travel?.distance ?? (f.distance + (f.endDistance - f.distance) * eased)));
    controls.target.set(0, 0, 0);
    controls.update();
    if (t === 1) {
      const arrival = queuedFocus.current;
      queuedFocus.current = null;
      onTravel(false);
      if (f.kind === "planet" && arrival && arrival.distanceTo(camera.position) > .02) {
        const start = camera.position.clone().normalize();
        flight.current = { kind:"focus", start, turn:new Quaternion().setFromUnitVectors(start,arrival.clone().normalize()), distance:camera.position.length(), endDistance:arrival.length(), elapsed:0 };
      } else {
        flight.current = null;
        memory.current.set(bodyId,{position:camera.position.clone(),target:controls.target.clone(),selection:selectedId});
      }
    }
  });

  return (
    <OrbitControls
      ref={ref}
      enabled={flight.current?.kind!=="planet"}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={minDistance}
      maxDistance={radius * 7}
      autoRotate={autoRotate && !interacting}
      autoRotateSpeed={0.65}
      onStart={() => {
        flight.current = null;queuedFocus.current=null;onTravel(false);
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
