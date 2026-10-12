import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, CanvasTexture, Color,
  DirectionalLight, DoubleSide, Group, MathUtils, Mesh, MeshStandardMaterial,
  PCFShadowMap, PerspectiveCamera, RingGeometry, Scene, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, TextureLoader, Vector3, WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { planetTexture } from './planets';
import type { Planet } from './planets';

export type PlanetRenderStatus = 'loading' | 'ready' | 'simulated' | 'unavailable';
export interface PlanetScene {
  show: (planet: Planet) => void;
  zoom: (direction: number) => void;
  reset: () => void;
  autoRotate: (enabled: boolean) => void;
  dispose: () => void;
}
const clamp = MathUtils.clamp;

function ringMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(1024, 1);
  for (let i=0; i<1024; i++) {
    const r=i/1023;
    const gap=r>.64&&r<.68;
    const density=gap?.06:r<.15?.25:r<.64?.84:.63;
    const grain=.82+Math.sin(i*1.8)*.1+Math.sin(i*.38)*.06+Math.sin(i*.047)*.06;
    const fade=Math.min(1,r*90,(1-r)*100);
    const shade=.83+.12*Math.sin(r*17)+.045*Math.sin(i*.48);
    pixels.data.set([208*shade,192*shade,161*shade,255*clamp(density*grain*fade,0,1)],i*4);
  }
  ctx.putImageData(pixels,0,0);
  const texture = new CanvasTexture(canvas); texture.colorSpace=SRGBColorSpace;
  return texture;
}

// An intentionally illustrated map is also available if an offline asset fails.
function fallbackMap(planet: Planet) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle=planet.color;ctx.fillRect(0,0,512,256);
  let seed=planet.id.split('').reduce((n,c)=>n+c.charCodeAt(0),0);
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<256;y++){
    ctx.fillStyle=`rgba(54,40,29,${.015+random()*.075})`;ctx.fillRect(0,y,512,1);
  }
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  return texture;
}

export function createPlanetScene(canvas: HTMLCanvasElement, report: (status: PlanetRenderStatus)=>void): PlanetScene {
  const renderer = new WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=SRGBColorSpace;
  renderer.toneMapping=ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.2;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=PCFShadowMap;
  const scene=new Scene(), camera=new PerspectiveCamera(36,1,.1,100);
  const controls=new OrbitControls(camera,canvas);
  controls.enablePan=false;
  controls.enableDamping=false;
  controls.rotateSpeed=.6;
  controls.zoomSpeed=.7;
  const root=new Group(), spin=new Group();
  root.add(spin);scene.add(root);
  scene.add(new AmbientLight(0xc4d8f0,.13));
  const sun=new DirectionalLight(0xfff3dc,3.1);
  sun.position.set(-4.8,3.5,4.8);
  sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.5,far:20});
  sun.shadow.normalBias=.012;
  sun.shadow.bias=-.0003;
  scene.add(sun);
  const sphere=new SphereGeometry(1,96,64);
  const loader=new TextureLoader();
  const materials:Material[]=[], textures:Texture[]=[], geometries:BufferGeometry[]=[];
  let planet:Planet|undefined, frame=0, generation=0, disposed=false, contextLost=false;
  let automatic=false, dragging=false, lastTime=0, baseDistance=5, surface:Mesh|undefined;
  let lastStatus:PlanetRenderStatus='loading';
  function status(value:PlanetRenderStatus){lastStatus=value;report(value);}
  function schedule(){if(!frame&&!disposed&&!contextLost&&!document.hidden)frame=requestAnimationFrame(paint);}
  function paint(time:number){
    frame=0;
    if(disposed||contextLost||document.hidden)return;
    if(automatic&&!dragging){
      const delta=lastTime?Math.min((time-lastTime)/1000,.05):0;
      spin.rotation.y+=delta*.075;
    }
    lastTime=time;
    renderer.render(scene,camera);
    if(automatic&&!dragging)schedule();
  }
  function clearPlanet(){
    spin.clear();
    while(root.children.length>1)root.remove(root.children[root.children.length-1]);
    materials.splice(0).forEach(item=>item.dispose());
    textures.splice(0).forEach(item=>item.dispose());
    geometries.splice(0).forEach(item=>item.dispose());
  }
  function limits(){controls.minDistance=baseDistance*.48;controls.maxDistance=baseDistance*1.7;}
  function resize(){
    const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    const previous=baseDistance;
    const radius=planet?.rings?Math.max(1.5,2.45/camera.aspect):Math.max(1.16,1.16/camera.aspect);
    baseDistance=radius/Math.tan(MathUtils.degToRad(camera.fov/2))*1.07;
    if(camera.position.length()>0)camera.position.multiplyScalar(baseDistance/previous);
    limits();controls.update();schedule();
  }
  function reset(){
    if(!planet)return;
    root.rotation.set(0,0,MathUtils.degToRad(planet.tilt));
    spin.rotation.y=planet.id==='earth'?3.6:planet.id==='jupiter'?2.7:0;
    const elevation=planet.rings?.34:.06;
    camera.position.set(0,Math.sin(elevation)*baseDistance,Math.cos(elevation)*baseDistance);
    controls.target.set(0,0,0);controls.update();schedule();
  }
  function loadMap(path:string,token:number,onLoad:(texture:Texture)=>void,onError?:()=>void,color=true){
    loader.load(path,texture=>{
      if(disposed||token!==generation){texture.dispose();return;}
      if(color)texture.colorSpace=SRGBColorSpace;
      texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),4);
      textures.push(texture);onLoad(texture);schedule();
    },undefined,()=>{if(!disposed&&token===generation)onError?.();});
  }
  function show(next:Planet){
    planet=next;const token=++generation;clearPlanet();status('loading');
    const material=new MeshStandardMaterial({color:0xffffff,roughness:next.id==='earth'?.84:.94,metalness:0});
    materials.push(material);
    surface=new Mesh(sphere,material);surface.castShadow=true;surface.receiveShadow=true;
    if(next.id==='saturn')surface.scale.y=.9;
    if(next.id==='jupiter')surface.scale.y=.935;
    spin.add(surface);
    const initial=fallbackMap(next);textures.push(initial);material.map=initial;
    loadMap(planetTexture(next.id),token,texture=>{material.map=texture;if(next.id==='mercury'){material.bumpMap=texture;material.bumpScale=.015;}material.needsUpdate=true;status('ready');},()=>status('simulated'));
    if(next.id==='moon')loadMap('/textures/planets/moon-height.webp',token,texture=>{material.bumpMap=texture;material.bumpScale=.025;material.needsUpdate=true;},undefined,false);
    if(next.id==='earth'){
      const cloudMaterial=new MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.8,depthWrite:false,roughness:1});
      materials.push(cloudMaterial);
      loadMap('/textures/planets/clouds.webp',token,texture=>{
        cloudMaterial.map=texture;cloudMaterial.needsUpdate=true;
        const clouds=new Mesh(sphere,cloudMaterial);clouds.scale.setScalar(1.012);spin.add(clouds);
      });
    }
    if(next.atmosphere){
      const atmosphere=new ShaderMaterial({
        uniforms:{tint:{value:new Color(next.atmosphere)}},
        vertexShader:'varying vec3 n; varying vec3 v; void main(){n=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.0); v=-p.xyz; gl_Position=projectionMatrix*p;}',
        fragmentShader:'uniform vec3 tint; varying vec3 n; varying vec3 v; void main(){float edge=pow(1.0-max(0.0,dot(normalize(n),normalize(v))),3.0); gl_FragColor=vec4(tint,edge*0.3);}',
        transparent:true,depthWrite:false,blending:AdditiveBlending,
      });
      materials.push(atmosphere);
      const glow=new Mesh(sphere,atmosphere);glow.scale.setScalar(1.026);spin.add(glow);
    }
    if(next.rings){
      const geometry=new RingGeometry(1.24,2.3,192,2);
      const position=geometry.attributes.position,uv=geometry.attributes.uv;
      for(let i=0;i<position.count;i++)uv.setXY(i,(Math.hypot(position.getX(i),position.getY(i))-1.24)/(2.3-1.24),.5);
      const map=ringMap();textures.push(map);geometries.push(geometry);
      const ringMaterial=new MeshStandardMaterial({map,side:DoubleSide,transparent:true,alphaTest:.06,roughness:1,depthWrite:true});
      materials.push(ringMaterial);
      const rings=new Mesh(geometry,ringMaterial);rings.rotation.x=-Math.PI/2;rings.castShadow=true;rings.receiveShadow=true;
      root.add(rings);
    }
    resize();reset();schedule();
  }
  function zoom(direction:number){
    const distance=camera.position.length();
    camera.position.multiplyScalar(clamp(distance*(direction>0?.8:1.25),controls.minDistance,controls.maxDistance)/distance);
    controls.update();schedule();
  }
  function key(event:KeyboardEvent){
    const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'];
    if(!keys.includes(event.key))return;event.preventDefault();
    if(event.key==='Home'){reset();return;}
    if(event.key==='+'||event.key==='='){zoom(1);return;}
    if(event.key==='-'){zoom(-1);return;}
    const axis=new Vector3(event.key.includes('Up')||event.key.includes('Down')?1:0,event.key.includes('Left')||event.key.includes('Right')?1:0,0);
    camera.position.applyAxisAngle(axis,(event.key==='ArrowLeft'||event.key==='ArrowUp'?1:-1)*.15);
    controls.update();schedule();
  }
  function start(){dragging=true;canvas.style.cursor='grabbing';}
  function end(){dragging=false;canvas.style.cursor='grab';lastTime=0;schedule();}
  function visibility(){cancelAnimationFrame(frame);frame=0;lastTime=0;if(!document.hidden)schedule();}
  function lost(event:Event){event.preventDefault();contextLost=true;cancelAnimationFrame(frame);frame=0;report('unavailable');}
  function restored(){contextLost=false;report(lastStatus);schedule();}
  controls.addEventListener('change',schedule);controls.addEventListener('start',start);controls.addEventListener('end',end);
  canvas.addEventListener('keydown',key);canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  document.addEventListener('visibilitychange',visibility);
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  return {show,zoom,reset,
    autoRotate(enabled){automatic=enabled;lastTime=0;schedule();},
    dispose(){
      disposed=true;++generation;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();
      canvas.removeEventListener('keydown',key);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);
      document.removeEventListener('visibilitychange',visibility);
      clearPlanet();sphere.dispose();sun.shadow.map?.dispose();renderer.dispose();if(!canvas.isConnected)renderer.forceContextLoss();
    },
  };
}