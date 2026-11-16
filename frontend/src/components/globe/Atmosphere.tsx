import { useFrame } from "@react-three/fiber";
import { prefersReducedMotion } from "./webgl";
// A thin atmospheric rim drawn as a slightly larger back-facing shell with a
// Fresnel falloff, additively blended. It brightens only the limb, so the
// surface, the markers and the discovery overlays underneath stay exactly as
// legible as before. The colour and strength come from the PlanetConfig, so
// Earth's blue scattering and Mars's faint dusty haze read differently
// without any texture or asset. No depth write, so nothing is occluded by it.
import { useMemo } from "react";
import { AdditiveBlending, BackSide, Color } from "three";

const VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  uniform float uLimb;
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    // Back faces: dot(normal, view) runs from 0 at the shell's outer silhouette to
    // -uLimb where the shell meets the planet's limb (and on to -1 behind the
    // planet, hidden). Scattering is thickest against the limb and thins to
    // nothing at the outer edge, so the glow has a soft outside and no hard ring.
    float depth = clamp(-dot(vNormal, vView) / uLimb, 0.0, 1.0);
    float rim = pow(depth, uPower);
    gl_FragColor = vec4(uColor * rim * uIntensity, rim * uIntensity) * uFade;
  }
`;

export interface AtmosphereSpec { color: string; intensity: number; /** shell thickness as a fraction of the radius */ thickness?: number; power?: number }

export function Atmosphere({ radius, spec, fade }: { radius: number; spec: AtmosphereSpec; /** 0-1 multiplier read every frame, so the glow can fade out with its planet */ fade?: { current: number } }) {
  const thickness = spec.thickness ?? 0.035;
  // cosine of the angle between the shell normal and the view ray where the ray grazes the planet
  const limb = Math.sqrt(Math.max(1e-4, 1 - 1 / ((1 + thickness) * (1 + thickness))));
  const uniforms = useMemo(() => ({ uColor: { value: new Color(spec.color) }, uIntensity: { value: spec.intensity }, uPower: { value: spec.power ?? 2.2 }, uLimb: { value: limb }, uFade: { value: fade?.current ?? 1 } }), []);
  const reduce=prefersReducedMotion();
  const targetColor=useMemo(()=>new Color(spec.color),[spec.color]);
  useFrame((_,delta)=>{const k=reduce?1:1-Math.exp(-Math.min(delta,.1)*5);uniforms.uColor.value.lerp(targetColor,k);uniforms.uIntensity.value+=(spec.intensity-uniforms.uIntensity.value)*k;uniforms.uPower.value+=((spec.power ?? 2.2)-uniforms.uPower.value)*k;uniforms.uLimb.value+=(limb-uniforms.uLimb.value)*k;uniforms.uFade.value=fade?.current ?? 1;});
  return (
    <mesh scale={1 + thickness} renderOrder={-1}>
      <sphereGeometry args={[radius, 64, 48]} />
      <shaderMaterial vertexShader={VERT} fragmentShader={FRAG} uniforms={uniforms} side={BackSide} transparent blending={AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}
