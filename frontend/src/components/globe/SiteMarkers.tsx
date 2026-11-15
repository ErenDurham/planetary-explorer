import { useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Quaternion, Vector3, type Group, type Mesh } from "three";
import { labelPosition } from "./labelPosition";
import { markerPosition } from "./geo";
import type { MarkerDatum } from "./MarkerData";
import type { PlanetConfig } from "./PlanetConfig";
import { formatNumber } from "@/lib/format";

interface Props {
  config: PlanetConfig;
  markers: MarkerDatum[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHoverChange?: (hovering: boolean) => void;
  /** The planet body; rank labels are hidden when it is between them and the camera. */
  planetRef?: RefObject<Mesh>;
}

const BASE = 0.022;
const DARK = "#0b0f14";

export function SiteMarkers({ config, markers, selectedId, onSelect, onHoverChange, planetRef }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <group>
      {markers.map((m) => (
        <Marker
          key={`${config.id}:${m.id}`}
          datum={m}
          config={config}
          selected={m.id === selectedId}
          hovered={m.id === hovered}
          planetRef={planetRef}
          onSelect={() => onSelect(m.id)}
          onHover={(h) => {
            setHovered(h ? m.id : null);
            onHoverChange?.(h);
          }}
        />
      ))}
    </group>
  );
}

/** Text shown in the hover card under the name: never colour alone. */
export function markerStatusText(d: MarkerDatum): string {
  if (d.mode === "browse") return "Mission site · no suitability score";
  if (d.mode === "analog") {
    if (d.rank == null) return `Not ranked${d.unrankableReason ? `: ${d.unrankableReason}` : ""}`;
    return `match rank ${d.rank}${d.similarity != null ? ` · ${formatNumber(d.similarity, { maxFractionDigits: 1 })}% match` : ""}`;
  }
  if (d.status === "ok" && d.score != null) return `index ${formatNumber(d.score, { maxFractionDigits: 1 })}${d.rank != null ? ` · rank ${d.rank}` : ""}`;
  if (d.status === "ineligible") return "ineligible";
  if (d.status === "insufficient_data") return "insufficient data";
  return "not evaluated";
}

function Marker({ datum, config, selected, hovered, onSelect, onHover, planetRef }: { datum: MarkerDatum; config: PlanetConfig; selected: boolean; hovered: boolean; onSelect: () => void; onHover: (h: boolean) => void; planetRef?: RefObject<Mesh> }) {
  const pos = useMemo(() => markerPosition(datum.lat, datum.lonEast, config.radius), [datum.lat, datum.lonEast, config.radius]);
  const ringRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const { color, style } = datum.appearance;
  const analog = datum.mode === "analog";

  // Orient the marker group so its +z points along the surface normal.
  const quaternion = useMemo(() => {
    const n = pos.clone().normalize();
    return new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
  }, [pos]);

  useFrame(({ clock, camera }) => {
    // Keep markers small enough to inspect the surface when the camera zooms in.
    if (groupRef.current) groupRef.current.scale.setScalar(Math.max(0.18, Math.min(1, camera.position.distanceTo(pos) / 2.1)));
    if (!ringRef.current) return;
    if (selected) {
      const t = (clock.elapsedTime % 1.6) / 1.6;
      const s = 1 + t * 1.4;
      ringRef.current.scale.setScalar(s);
      const mat = ringRef.current.material as { opacity: number };
      mat.opacity = 0.9 * (1 - t);
    } else {
      ringRef.current.scale.setScalar(1);
      (ringRef.current.material as { opacity: number }).opacity = 0;
    }
  });

  const scale = hovered ? 1.35 : 1;
  const dim = style === "ineligible";
  const outlineOnly = style === "insufficient_data" || style === "not_ranked";
  // Landing keeps its copper ring; analog ranks include orange and yellow, so
  // the analog selection ring is white over a dark outline for contrast on
  // both the Mars mosaic and the Earth oceans.
  const ringColor = analog ? "#ffffff" : "#f0a03c";

  return (
    <group ref={groupRef} position={pos} quaternion={quaternion}>
      {/* hit target + body */}
      <mesh
        scale={scale}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          onHover(false);
          document.body.style.cursor = "";
        }}
      >
        <sphereGeometry args={[BASE, 16, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={outlineOnly ? 0 : dim ? 0.15 : 0.55}
          roughness={0.6}
          transparent
          opacity={outlineOnly ? 0.08 : dim ? 0.55 : 1}
          wireframe={outlineOnly}
        />
      </mesh>
      {/* static ring: outline for insufficient data / not ranked, dark halo for the rest */}
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[BASE * 1.25, BASE * 1.55, 32]} />
        <meshBasicMaterial color={outlineOnly ? color : DARK} transparent opacity={outlineOnly ? 0.9 : 0.7} />
      </mesh>
      {dim && (
        // "hatched" in 3D: a dark bar across the marker
        <mesh position={[0, 0, BASE + 0.001]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[BASE * 2.2, BASE * 0.35]} />
          <meshBasicMaterial color={DARK} transparent opacity={0.85} />
        </mesh>
      )}
      {/* pulsing selection ring */}
      <mesh ref={ringRef} position={[0, 0, 0.003]}>
        <ringGeometry args={[BASE * 1.6, BASE * 1.9, 48]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && (
        <>
          {analog && (
            <mesh position={[0, 0, 0.0028]}>
              <ringGeometry args={[BASE * 1.5, BASE * 1.95, 48]} />
              <meshBasicMaterial color={DARK} transparent opacity={0.9} depthWrite={false} />
            </mesh>
          )}
          <mesh position={[0, 0, 0.003]}>
            <ringGeometry args={[BASE * 1.6, BASE * 1.8, 48]} />
            <meshBasicMaterial color={ringColor} transparent opacity={0.95} depthWrite={false} />
          </mesh>
        </>
      )}
      {analog && (
        // Visible rank number on a dark backplate: the rank is text, never colour alone.
        <Html position={[BASE * 1.9, BASE * 1.9, 0]} center occlude={planetRef ? [planetRef] : true} zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
          <span
            aria-hidden
            className="num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 px-1 text-[11px] font-semibold leading-none shadow"
            style={{ backgroundColor: "rgba(11,15,20,0.88)", borderColor: datum.rank == null ? color : "#ffffff", color: datum.rank == null ? color : "#ffffff" }}
          >
            {datum.rank ?? "NR"}
          </span>
        </Html>
      )}
      {hovered && (
        <Html position={[0, 0, 0]} center calculatePosition={labelPosition} occlude={planetRef ? [planetRef] : true} style={{ pointerEvents: "none" }} zIndexRange={[50, 0]}>
          <div role="tooltip" data-testid="marker-description" className="w-max max-w-[260px] whitespace-normal break-words rounded border border-line-strong bg-bg-elev-2/95 px-2.5 py-1.5 text-left shadow-lg">
            <div className="text-xs font-semibold text-fg">{datum.name}</div>
            <div className="text-[10.5px] text-fg-muted">{datum.region}</div>
            <div className="num mt-0.5 text-[10.5px] text-fg-muted">{markerStatusText(datum)}</div>
          </div>
        </Html>
      )}
    </group>
  );
}
