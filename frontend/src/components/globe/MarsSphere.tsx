import { useEffect } from "react";
import { useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import type { PlanetConfig } from "./PlanetConfig";

/** The textured planet. Suspends until the texture is decoded. */
export function MarsSphere({ config }: { config: PlanetConfig }) {
  const texture = useTexture(config.textureUrl);
  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);
  return (
    <mesh>
      <sphereGeometry args={[config.radius, 96, 64]} />
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0} />
    </mesh>
  );
}

/** Untextured stand-in rendered while the texture loads. */
export function PlaceholderSphere({ config }: { config: PlanetConfig }) {
  return (
    <mesh>
      <sphereGeometry args={[config.radius, 32, 24]} />
      <meshStandardMaterial color="#3a2a24" roughness={1} />
    </mesh>
  );
}
