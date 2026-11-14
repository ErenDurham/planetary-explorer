import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Quaternion, Vector3, type Group, type Mesh } from "three";
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
}

const BASE = 0.022;

export function SiteMarkers({ config, markers, selectedId, onSelect, onHoverChange }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <group>
      {markers.map((m) => (
        <Marker
          key={m.id}
          datum={m}
          config={config}
          selected={m.id === selectedId}
          hovered={m.id === hovered}
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

function Marker({ datum, config, selected, hovered, onSelect, onHover }: { datum: MarkerDatum; config: PlanetConfig; selected: boolean; hovered: boolean; onSelect: () => void; onHover: (h: boolean) => void }) {
  const pos = useMemo(() => markerPosition(datum.lat, datum.lonEast, config.radius), [datum.lat, datum.lonEast, config.radius]);
  const ringRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const { color, style } = datum.appearance;

  // Orient the marker group so its +z points along the surface normal.
  const quaternion = useMemo(() => {
    const n = pos.clone().normalize();
    return new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n);
  }, [pos]);

  useFrame(({ clock }) => {
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
  const outlineOnly = style === "insufficient_data";

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
      {/* static ring: outline for insufficient data, dark halo for the rest */}
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[BASE * 1.25, BASE * 1.55, 32]} />
        <meshBasicMaterial color={outlineOnly ? color : "#0b0f14"} transparent opacity={outlineOnly ? 0.9 : 0.7} />
      </mesh>
      {dim && (
        // "hatched" in 3D: a dark bar across the marker
        <mesh position={[0, 0, BASE + 0.001]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[BASE * 2.2, BASE * 0.35]} />
          <meshBasicMaterial color="#0b0f14" transparent opacity={0.85} />
        </mesh>
      )}
      {/* pulsing selection ring */}
      <mesh ref={ringRef} position={[0, 0, 0.003]}>
        <ringGeometry args={[BASE * 1.6, BASE * 1.9, 48]} />
        <meshBasicMaterial color="#f0a03c" transparent opacity={0} depthWrite={false} />
      </mesh>
      {selected && (
        <mesh position={[0, 0, 0.003]}>
          <ringGeometry args={[BASE * 1.6, BASE * 1.8, 48]} />
          <meshBasicMaterial color="#f0a03c" transparent opacity={0.95} depthWrite={false} />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, BASE * 2.2, 0]} center distanceFactor={2.6} style={{ pointerEvents: "none" }} zIndexRange={[50, 0]}>
          <div className="whitespace-nowrap rounded border border-line-strong bg-bg-elev-2/95 px-2.5 py-1.5 text-left shadow-lg">
            <div className="text-xs font-semibold text-fg">{datum.name}</div>
            <div className="text-[10.5px] text-fg-muted">{datum.region}</div>
            <div className="num mt-0.5 text-[10.5px] text-fg-muted">
              {datum.status === "ok" && datum.score != null ? (
                <>
                  index <span className="text-copper-bright">{formatNumber(datum.score, { maxFractionDigits: 1 })}</span>
                  {datum.rank != null && <> · rank {datum.rank}</>}
                </>
              ) : datum.status === "ineligible" ? (
                "ineligible"
              ) : datum.status === "insufficient_data" ? (
                "insufficient data"
              ) : (
                "not evaluated"
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}
