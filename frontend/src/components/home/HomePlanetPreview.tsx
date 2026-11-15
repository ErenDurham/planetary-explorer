import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, useTexture } from "@react-three/drei";
import { Spherical, SRGBColorSpace, type Group, type MeshStandardMaterial, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PlaceholderSphere } from "@/components/globe/PlanetSphere";
import { PLANET_CONFIGS } from "@/components/globe/PlanetConfig";
import { Atmosphere } from "@/components/globe/Atmosphere";
import { GlobeErrorBoundary } from "@/components/globe/GlobeFallback";
import { hasWebGL } from "@/components/globe/webgl";
import { useMotionPreference } from "@/lib/motion/preferences";
import { previewFitDistance, previewSlide } from "./previewMotion";
import styles from "./home.module.css";

type Body = "earth" | "mars";
function World({ body, reduced, visible, controls }: { body: Body; reduced: boolean; visible: boolean; controls: React.RefObject<OrbitControlsImpl> }) {
  const group = useRef<Group>(null), material = useRef<MeshStandardMaterial>(null);
  const [shown,setShown] = useState(body);
  const displayed = useRef(body);
  const flight = useRef<{target:Body;elapsed:number}|null>(null);
  const maps=useTexture([PLANET_CONFIGS.earth.textureUrl,PLANET_CONFIGS.mars.textureUrl]);
  useLayoutEffect(()=>{for(const map of maps){map.colorSpace=SRGBColorSpace;map.anisotropy=8;map.needsUpdate=true;}},[maps]);
  useEffect(()=>{
    if(reduced){flight.current=null;displayed.current=body;setShown(body);if(group.current)group.current.position.set(0,0,0);if(material.current)material.current.opacity=1;}
    else flight.current=displayed.current===body ? null : {target:body,elapsed:0};
  },[body,reduced]);
  useFrame((state,delta)=>{
    const f=flight.current;
    if(controls.current){controls.current.enabled=!f;controls.current.autoRotate=!f&&!reduced&&visible;}
    if(!f||!visible)return;
    f.elapsed+=Math.min(delta,.1);
    const pose=previewSlide(f.elapsed/.7);
    if(group.current)group.current.position.setFromMatrixColumn(state.camera.matrixWorld,0).multiplyScalar(pose.x);
    if(material.current)material.current.opacity=pose.opacity;
    if(pose.swap&&displayed.current!==f.target){displayed.current=f.target;setShown(f.target);}
    if(pose.done)flight.current=null;
  });
  const config=PLANET_CONFIGS[shown];
  return <group ref={group}>
    <mesh rotation={[.15,-.45,-.18]}><sphereGeometry args={[1,96,64]}/><meshStandardMaterial ref={material} map={maps[shown==="earth"?0:1]} roughness={.9} metalness={0} transparent emissive={shown==="earth"?"#0e2440":"#1a0d08"} emissiveIntensity={.2}/></mesh>
    <Atmosphere radius={config.radius} spec={config.atmosphere}/>
  </group>;
}
function PreviewControls({ controls, reduced }: { controls: React.RefObject<OrbitControlsImpl>; reduced: boolean }) {
  const {camera,size,invalidate}=useThree();
  const fit=previewFitDistance(size.width/Math.max(1,size.height));
  useLayoutEffect(()=>{
    const c=camera as PerspectiveCamera;
    c.position.normalize().multiplyScalar(fit);c.lookAt(0,0,0);c.updateProjectionMatrix();controls.current?.update();invalidate();
  },[camera,fit,controls,invalidate]);
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reduced} dampingFactor={.08} rotateSpeed={.55} zoomSpeed={.55} minDistance={fit*.94} maxDistance={fit*1.7} autoRotate={!reduced} autoRotateSpeed={.22}/>;
}

/** Interactive preview only: never changes a mission selection or ranking. */
export default function HomePlanetPreview() {
  const figure=useRef<HTMLElement>(null),controls=useRef<OrbitControlsImpl>(null);
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    let inView=true;
    const update=()=>setVisible(inView&&!document.hidden);
    const observer=typeof IntersectionObserver==="undefined"?null:new IntersectionObserver(entries=>{inView=entries[0]?.isIntersecting??true;update();});
    if(figure.current)observer?.observe(figure.current);
    document.addEventListener("visibilitychange",update);
    return()=>{observer?.disconnect();document.removeEventListener("visibilitychange",update);};
  },[]);
  const [body,setBody]=useState<Body>("earth");
  const reduced=useMotionPreference("home");
  const config=PLANET_CONFIGS[body];
  const fallback=<div className={styles.flatWorld} style={{backgroundImage:`url(${config.textureUrl})`}}/>;
  const webgl=typeof window!=="undefined"&&!!(window.WebGLRenderingContext||window.WebGL2RenderingContext)&&hasWebGL();
  return <figure ref={figure} data-motion={reduced||!visible?"still":"animated"} className={styles.worlds} aria-label="Earth and Mars reference preview">
    <div id="home-world-preview" className={styles.scene} role="region" tabIndex={webgl?0:undefined} aria-label={`Interactive ${config.displayName} preview`} aria-describedby="home-preview-help"
      onKeyDown={e=>{
        if(e.target!==e.currentTarget||e.altKey||e.metaKey||e.ctrlKey||!controls.current)return;
        if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","+","=","-"].includes(e.key))return;
        e.preventDefault();const c=controls.current;const orbit=new Spherical().setFromVector3(c.object.position);
        if(e.key==="ArrowLeft")orbit.theta+=.12;if(e.key==="ArrowRight")orbit.theta-=.12;
        if(e.key==="ArrowUp")orbit.phi-=.12;if(e.key==="ArrowDown")orbit.phi+=.12;
        if(e.key==="+"||e.key==="=")orbit.radius*=.9;if(e.key==="-")orbit.radius*=1.1;
        orbit.phi=Math.max(.05,Math.min(Math.PI-.05,orbit.phi));orbit.radius=Math.max(c.minDistance,Math.min(c.maxDistance,orbit.radius));
        c.object.position.setFromSpherical(orbit);c.update();
      }}>
      {webgl?<GlobeErrorBoundary fallback={()=>fallback}><Canvas dpr={[1,1.5]} frameloop={reduced||!visible?"demand":"always"} camera={{position:[0,.1,4],fov:40}} gl={{alpha:true,antialias:true}} aria-hidden="true">
        <hemisphereLight args={["#b4c3d2","#161b17",1.05]}/><directionalLight position={[-3,3,5]} color="#fff4e6" intensity={3}/><directionalLight position={[4,-1,-3]} color="#7898b0" intensity={.25}/>
        <Stars radius={50} depth={20} count={550} factor={1.3} fade speed={0}/>
        <Suspense fallback={<PlaceholderSphere config={config}/>}><World body={body} reduced={reduced} visible={visible} controls={controls}/></Suspense>
        <PreviewControls controls={controls} reduced={reduced||!visible}/>
      </Canvas></GlobeErrorBoundary>:fallback}
    </div>
    <p id="home-preview-help" className={styles.previewHelp}>{webgl?"Drag to rotate · Scroll to zoom":"Reference preview"}<span className="sr-only">. Arrow keys rotate; plus and minus zoom.</span></p>
    <div className={styles.previewControls} role="group" aria-label="Preview a world">
      <span className={styles.previewTrack} aria-hidden="true"><i style={{transform:`translateY(${body==="earth"?0:100}%)`}}/></span>
      {(["earth","mars"] as const).map((id,i)=><button type="button" key={id} aria-label={`Preview ${PLANET_CONFIGS[id].displayName}`} aria-pressed={id===body} aria-controls="home-world-preview" onClick={()=>setBody(id)}><span>0{i+1}</span>{PLANET_CONFIGS[id].displayName}<span aria-hidden>↗</span></button>)}
    </div>
    <figcaption><span>{body==="earth"?"Earth · the fieldwork environment":"Mars · the planetary reference"}</span><a href={config.textureCreditUrl} target="_blank" rel="noreferrer">{body==="earth"?"NASA Blue Marble":"NASA/JPL/USGS Viking"} ↗</a></figcaption>
  </figure>;
}
