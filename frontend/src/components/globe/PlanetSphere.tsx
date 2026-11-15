import { useEffect, type RefObject } from "react";
import { useTexture } from "@react-three/drei";
import { SRGBColorSpace, type Mesh } from "three";
import type { PlanetConfig } from "./PlanetConfig";

/** The textured planet for any PlanetConfig. Suspends until the texture is
 * decoded. `meshRef` lets the markers occlude their labels against the planet
 * body only (never against each other). */
export function PlanetSphere({ config, meshRef }: { config: PlanetConfig; meshRef?: RefObject<Mesh> }) {
  const texture = useTexture(config.textureUrl);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[config.radius, 128, 96]} />
      {/* lit by the hemisphere + key light; a faint emissive lift keeps the night side readable without flattening the day side */}
      <meshStandardMaterial map={texture} roughness={config.id === "earth" ? 0.82 : 0.96} metalness={0}
        emissive={config.id === "earth" ? "#0e2440" : "#1a0d08"}
        emissiveIntensity={config.id === "earth" ? 0.35 : 0.2} />
    </mesh>
  );
}

/** @deprecated use PlanetSphere; kept so older imports keep compiling. */
export const MarsSphere = PlanetSphere;

/** Untextured stand-in rendered while the texture loads. */
export function PlaceholderSphere({ config, meshRef }: { config: PlanetConfig; meshRef?: RefObject<Mesh> }) {
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[config.radius, 32, 24]} />
      <meshStandardMaterial color={config.placeholderColor} roughness={1} />
    </mesh>
  );
}
