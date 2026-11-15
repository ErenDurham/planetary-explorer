import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { Color, ShaderChunk, SRGBColorSpace, type Mesh, type MeshStandardMaterial } from "three";
import { EARTH_CONFIG, MARS_CONFIG, type PlanetConfig } from "./PlanetConfig";
import { planetDissolve } from "./planetMotion";

/** Both maps share one lit material: no black frame or doubled transparent sphere. */
export function PlanetSphere({config,meshRef,reducedMotion=false}:{config:PlanetConfig;meshRef?:RefObject<Mesh>;reducedMotion?:boolean}) {
  const [earth,mars]=useTexture([EARTH_CONFIG.textureUrl,MARS_CONFIG.textureUrl]);
  const material=useRef<MeshStandardMaterial>(null);
  const uniforms=useMemo(()=>({otherPlanetMap:{value:mars},planetMix:{value:config.id==="mars"?1:0}}),[earth,mars]);
  const transition=useRef({from:uniforms.planetMix.value,to:uniforms.planetMix.value,elapsed:2});
  const earthGlow=useMemo(()=>new Color("#0e2440"),[]),marsGlow=useMemo(()=>new Color("#1a0d08"),[]);
  useLayoutEffect(()=>{for(const texture of [earth,mars]){texture.colorSpace=SRGBColorSpace;texture.anisotropy=8;texture.needsUpdate=true;}},[earth,mars]);
  useLayoutEffect(()=>{transition.current={from:uniforms.planetMix.value,to:config.id==="mars"?1:0,elapsed:0};if(reducedMotion)uniforms.planetMix.value=transition.current.to;},[config.id,reducedMotion,uniforms]);
  useFrame((_,delta)=>{
    const t=transition.current;t.elapsed+=Math.min(delta,.1);
    const blend=reducedMotion?1:planetDissolve(t.elapsed);
    uniforms.planetMix.value=t.from+(t.to-t.from)*blend;
    if(material.current){const mix=uniforms.planetMix.value;material.current.roughness=.82+.14*mix;material.current.emissive.copy(earthGlow).lerp(marsGlow,mix);material.current.emissiveIntensity=.35-.15*mix;}
  });
  return <mesh ref={meshRef}><sphereGeometry args={[config.radius,128,96]}/><meshStandardMaterial ref={material} map={earth} roughness={.9} metalness={0} onBeforeCompile={shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.fragmentShader="uniform sampler2D otherPlanetMap;\nuniform float planetMix;\n"+shader.fragmentShader.replace("#include <map_fragment>",ShaderChunk.map_fragment.replace("texture2D( map, vMapUv )","mix( texture2D( map, vMapUv ), texture2D( otherPlanetMap, vMapUv ), planetMix )"));
  }} customProgramCacheKey={()=>"planet-dissolve-v1"}/></mesh>;
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
