// Shapes drawn on the planet surface besides the markers: rings (outlines,
// optionally filled and dashed) and dots. Everything is positioned with the
// same lat/lon → vector convention as the markers (geo.ts) and lifted a hair
// above the texture so the sphere does not z-fight it. The viewer does not
// know what a shape means; the feature that passes the specs does (Find Earth
// Analogs: the surveyed bounds, the evaluated centres, the candidate
// footprints).
import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { DoubleSide } from "three";
import { latLonToVector3 } from "./geo";

export interface SurfacePoint { lat: number; lonEast: number }

export interface SurfaceRing {
  id: string;
  points: SurfacePoint[];
  color: string;
  /** Outline width in pixels. */
  width?: number;
  dashed?: boolean;
  /** Fill the ring with a translucent fan (convex or near-convex rings only). */
  fill?: boolean;
  selected?: boolean;
  /** When set, clicking the fill reports this id. */
  pickId?: string;
}

export interface SurfaceDot { id: string; lat: number; lonEast: number; color?: string; muted?: boolean; /** Multiplier on the default dot radius. */ size?: number }

const RING_LIFT = 1.004;
const FILL_LIFT = 1.003;
const DOT_LIFT = 1.005;

export function SurfaceOverlays({ radius, rings, dots, onPick }: { radius: number; rings: SurfaceRing[]; dots: SurfaceDot[]; onPick?: (id: string) => void }) {
  return (
    <group>
      {rings.map(r => <Ring key={r.id} radius={radius} ring={r} onPick={onPick} />)}
      {dots.map(d => <Dot key={d.id} radius={radius} dot={d} />)}
    </group>
  );
}

function Ring({ radius, ring, onPick }: { radius: number; ring: SurfaceRing; onPick?: (id: string) => void }) {
  const outline = useMemo(() => {
    const p = ring.points.map(q => latLonToVector3(q.lat, q.lonEast, radius * RING_LIFT));
    if (p.length) p.push(p[0].clone());
    return p;
  }, [ring.points, radius]);
  const fill = useMemo(() => {
    if (!ring.fill || ring.points.length < 3) return null;
    const n = ring.points.length;
    const c = ring.points.reduce((a, q) => ({ lat: a.lat + q.lat / n, lonEast: a.lonEast + q.lonEast / n }), { lat: 0, lonEast: 0 });
    const centre = latLonToVector3(c.lat, c.lonEast, radius * FILL_LIFT);
    const rim = ring.points.map(q => latLonToVector3(q.lat, q.lonEast, radius * FILL_LIFT));
    const v: number[] = [];
    for (let i = 0; i < rim.length; i++) { const a = rim[i], b = rim[(i + 1) % rim.length]; v.push(centre.x, centre.y, centre.z, a.x, a.y, a.z, b.x, b.y, b.z); }
    return new Float32Array(v);
  }, [ring.fill, ring.points, radius]);
  const pick = ring.pickId;
  return (
    <group>
      {fill && (
        <mesh onClick={pick && onPick ? e => { e.stopPropagation(); onPick(pick); } : undefined} onPointerOver={pick ? () => { document.body.style.cursor = "pointer"; } : undefined} onPointerOut={pick ? () => { document.body.style.cursor = ""; } : undefined}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[fill, 3]} /></bufferGeometry>
          <meshBasicMaterial color={ring.color} transparent opacity={ring.selected ? 0.42 : 0.2} side={DoubleSide} depthWrite={false} />
        </mesh>
      )}
      {outline.length > 1 && <Line points={outline} color={ring.color} lineWidth={ring.width ?? 1.5} dashed={!!ring.dashed} dashSize={0.003} gapSize={0.002} transparent opacity={0.95} />}
    </group>
  );
}

function Dot({ radius, dot }: { radius: number; dot: SurfaceDot }) {
  const pos = useMemo(() => latLonToVector3(dot.lat, dot.lonEast, radius * DOT_LIFT), [dot.lat, dot.lonEast, radius]);
  return (
    <mesh position={pos}>
      <sphereGeometry args={[radius * 0.0012 * (dot.size ?? 1), 8, 8]} />
      <meshBasicMaterial color={dot.color ?? "#e8e3d9"} transparent opacity={dot.muted ? 0.45 : 0.9} />
    </mesh>
  );
}
