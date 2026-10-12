import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { catalogStats, constellations, stars, starMap } from './catalog';
import type { Memory, Star } from './types';
import { regionAt } from './sky-regions';
import type { SkyRegionId } from './sky-regions';

export interface SkyHandle {
  focus:(starId:string)=>void;
  region:(ra:number,dec:number,fov:number)=>void;
  zoom:(direction:number)=>void;
  reset:()=>void;
}
interface Props {
  memories:Memory[]; favorites:string[]; density:number; starSize:number;
  lines:boolean; labels:boolean; grid:boolean; landscape:boolean; selectedId:string|null;
  onSelect:(star:Star)=>void; onViewChange:(fov:number)=>void; onInteract:()=>void;
  onVisibleChange:(count:number)=>void;
  onRegionChange:(region:SkyRegionId)=>void;
}
const RAD=Math.PI/180,TAU=Math.PI*2;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
const coordinates=new Float64Array(stars.length*3);
const starIndex=new Map<string,number>();
stars.forEach((star,index)=>{const a=star.ra*15*RAD,d=star.dec*RAD;coordinates[index*3]=Math.cos(d)*Math.cos(a);coordinates[index*3+1]=Math.cos(d)*Math.sin(a);coordinates[index*3+2]=Math.sin(d);starIndex.set(star.id,index);});
interface Hit {star:Star;x:number;y:number;r:number}
let nebulaImage:HTMLCanvasElement|undefined;
function makeNebula(){
  if(nebulaImage)return nebulaImage;
  const canvas=document.createElement('canvas');canvas.width=1400;canvas.height=1000;
  const ctx=canvas.getContext('2d')!;let seed=8301;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1250;i++){
    const x=random()*1750-200,y=680-x*.32+(random()+random()+random()-1.5)*290,r=15+random()*85;
    const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
    const color=i%4===0?'139,118,134':i%3===0?'100,136,165':'102,143,158';
    gradient.addColorStop(0,`rgba(${color},${.008+random()*.025})`);gradient.addColorStop(1,`rgba(${color},0)`);
    ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  nebulaImage=canvas;return canvas;
}
export const SkyCanvas=forwardRef<SkyHandle,Props>(function SkyCanvas(props,ref){
  const canvasRef=useRef<HTMLCanvasElement>(null),propsRef=useRef(props);
  const invalidate=useRef<()=>void>(()=>{});
  const [hover,setHover]=useState<Hit|null>(null);
  const state=useRef({ra:5.65*15*RAD,dec:10*RAD,fov:66,targetRa:5.65*15*RAD,targetDec:10*RAD,targetFov:66});
  const reset=()=>{Object.assign(state.current,{targetRa:5.65*15*RAD,targetDec:10*RAD,targetFov:66});invalidate.current();};
  useEffect(()=>{
    const previous=propsRef.current;propsRef.current=props;
    if(previous.memories!==props.memories||previous.favorites!==props.favorites||previous.selectedId!==props.selectedId||previous.density!==props.density||previous.starSize!==props.starSize||previous.lines!==props.lines||previous.labels!==props.labels||previous.grid!==props.grid||previous.landscape!==props.landscape){setHover(null);invalidate.current();}
  },[props]);
  useImperativeHandle(ref,()=>({
    focus(id){const star=starMap[id];if(star){Object.assign(state.current,{targetRa:star.ra*15*RAD,targetDec:star.dec*RAD,targetFov:Math.min(42,state.current.targetFov)});invalidate.current();}},
    region(ra,dec,fov){Object.assign(state.current,{targetRa:ra*15*RAD,targetDec:clamp(dec,-89.7,89.7)*RAD,targetFov:clamp(fov,4,108)});invalidate.current();},
    zoom(direction){state.current.targetFov=clamp(state.current.targetFov*(direction>0?.78:1.28),4,108);invalidate.current();},reset,
  }),[]);
  useEffect(()=>{
    const canvas=canvasRef.current!,ctx=canvas.getContext('2d')!;
    const nebula=makeNebula(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sprites=new Map<string,{image:HTMLCanvasElement;size:number}>();
    let width=0,height=0,frame=0,lastTime=0,lastReported=0,hidden=document.hidden;
    let lastFov=-1,lastVisible=-1,lastRegion:SkyRegionId|undefined;
    let hits=new Map<number,Hit[]>(),columns=1,lastHover:string|null=null;
    let memorySource:Memory[]|null=null,favoriteSource:string[]|null=null;
    let memories=new Map<string,Memory>(),favorites=new Set<string>();
    let selectedSource:string|null|undefined,specialStars:{star:Star;x:number;y:number;z:number}[]=[];
    const pointers=new Map<number,{x:number;y:number}>();
    let moved=false,start={x:0,y:0},pinchDistance=0;
    let ca=1,sa=0,cd=1,sd=0,scale=1,ox=0,oy=0;
    function schedule(){if(!frame&&!hidden)frame=requestAnimationFrame(paint);}
    invalidate.current=schedule;
    function resize(){const box=canvas.getBoundingClientRect();width=box.width;height=box.height;columns=Math.ceil(width/28);const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);schedule();}
    const observer=new ResizeObserver(resize);observer.observe(canvas);
    function projectXYZ(x:number,y:number,z:number){
      const horizontal=ca*x+sa*y,depth=cd*horizontal+sd*z;
      if(depth<.08)return null;
      const px=ox-(ca*y-sa*x)*scale/depth,py=oy-(cd*z-sd*horizontal)*scale/depth;
      return {x:px,y:py};
    }
    function project(ra:number,dec:number){return projectXYZ(Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec));}
    function line(points:{x:number;y:number}[],color:string,lineWidth=.7){if(points.length<2)return;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=lineWidth;points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();}
    function sprite(color:string,radius:number,bright:boolean){
      const r=Math.round(radius*4)/4,key=`${color}|${r}|${bright}`;
      const saved=sprites.get(key);if(saved)return saved;
      const extent=r*(bright?8:4.5),size=Math.ceil(extent)*2,image=document.createElement('canvas');
      image.width=image.height=size*2;const c=image.getContext('2d')!;c.scale(2,2);
      const center=size/2,g=c.createRadialGradient(center,center,0,center,center,extent);
      g.addColorStop(0,color+'b0');g.addColorStop(.12,color+'45');g.addColorStop(.4,color+'0e');g.addColorStop(1,color+'00');
      c.fillStyle=g;c.fillRect(0,0,size,size);
      // Tapered diffraction rays and a soft white core give even faint stars
      // a luminous silhouette. Cache the entire image, never blur per frame.
      function rays(length:number,thickness:number,rotation:number,opacity:number){
        c.save();c.translate(center,center);c.rotate(rotation);
        const light=c.createRadialGradient(0,0,0,0,0,length);
        light.addColorStop(0,'#ffffff');light.addColorStop(.22,color+'e0');light.addColorStop(.65,color+'55');light.addColorStop(1,color+'00');
        c.globalAlpha=opacity;c.fillStyle=light;c.beginPath();
        c.moveTo(0,-length);c.quadraticCurveTo(thickness*.2,-r,thickness,0);
        c.quadraticCurveTo(thickness*.2,r,0,length);c.quadraticCurveTo(-thickness*.2,r,-thickness,0);
        c.quadraticCurveTo(-thickness*.2,-r,0,-length);
        c.moveTo(-length*.8,0);c.quadraticCurveTo(-r,-thickness*.2,0,-thickness);
        c.quadraticCurveTo(r,-thickness*.2,length*.8,0);c.quadraticCurveTo(r,thickness*.2,0,thickness);
        c.quadraticCurveTo(-r,thickness*.2,-length*.8,0);c.fill();c.restore();
      }
      rays(r*(bright?6.6:3),r*.4,0,bright?.9:.52);
      if(bright)rays(r*3.2,r*.12,Math.PI/4,.32);
      const core=c.createRadialGradient(center,center,0,center,center,r*1.5);
      core.addColorStop(0,'#ffffff');core.addColorStop(.15,'#ffffff');core.addColorStop(.4,color+'dd');core.addColorStop(1,color+'00');
      c.fillStyle=core;c.fillRect(center-r*1.5,center-r*1.5,r*3,r*3);
      const result={image,size};sprites.set(key,result);return result;
    }
    function pick(x:number,y:number,radius:number){let best:Hit|null=null,bestDistance=radius;const gx=Math.floor(x/28),gy=Math.floor(y/28);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const hit of hits.get((gy+dy)*columns+gx+dx)||[]){const distance=Math.hypot(hit.x-x,hit.y-y);if(distance<bestDistance){bestDistance=distance;best=hit;}}return best;}
    function paint(time:number){
      frame=0;if(hidden||!width||!height)return;
      const elapsed=Math.min(50,lastTime?time-lastTime:16);lastTime=time;
      const s=state.current,p=propsRef.current,ease=reducedMotion||pointers.size?1:1-Math.exp(-elapsed/100);
      s.ra+=angle(s.targetRa-s.ra)*ease;s.dec+=(s.targetDec-s.dec)*ease;s.fov+=(s.targetFov-s.fov)*ease;
      const moving=Math.abs(angle(s.targetRa-s.ra))>0.000005||Math.abs(s.targetDec-s.dec)>0.000005||Math.abs(s.targetFov-s.fov)>.005;
      if(!moving){s.ra=s.targetRa;s.dec=s.targetDec;s.fov=s.targetFov;}
      ca=Math.cos(s.ra);sa=Math.sin(s.ra);cd=Math.cos(s.dec);sd=Math.sin(s.dec);scale=height/(2*Math.tan(s.fov*RAD/2));
      ox=width*.5;oy=height*.5;
      if(memorySource!==p.memories||favoriteSource!==p.favorites||selectedSource!==p.selectedId){
        memorySource=p.memories;favoriteSource=p.favorites;selectedSource=p.selectedId;
        memories=new Map(p.memories.map(m=>[m.starId,m]));favorites=new Set(p.favorites);
        const ids=new Set([...memories.keys(),...favorites,...(p.selectedId?[p.selectedId]:[])]);
        specialStars=[...ids].flatMap(id=>{const star=starMap[id];if(!star)return [];const a=star.ra*15*RAD,d=star.dec*RAD;return [{star,x:Math.cos(d)*Math.cos(a),y:Math.cos(d)*Math.sin(a),z:Math.sin(d)}];});
      }
      const bg=ctx.createRadialGradient(width*.55,height*.45,0,width*.5,height*.5,Math.max(width,height)*.65);bg.addColorStop(0,'#122333');bg.addColorStop(1,'#101c2a');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
      ctx.globalAlpha=.18;ctx.drawImage(nebula,-width*.15+angle(s.ra-5.65*15*RAD)*80,-height*.15,width*1.4,height*1.35);ctx.globalAlpha=1;
      const tint=ctx.createRadialGradient(width*.68,height*.4,0,width*.55,height*.5,Math.max(width,height)*.75);
      const phase=s.ra/(15*RAD),warm=(Math.cos((phase-18)*Math.PI/12)+1)/2;
      tint.addColorStop(0,`rgba(${Math.round(42+warm*34)},${Math.round(77-warm*19)},${Math.round(110-warm*16)},.17)`);tint.addColorStop(1,'rgba(15,25,40,0)');ctx.fillStyle=tint;ctx.fillRect(0,0,width,height);
      if(p.grid){
        for(let ra=0;ra<360;ra+=15){let points:{x:number;y:number}[]=[];for(let dec=-88;dec<=88;dec+=2){const point=project(ra*RAD,dec*RAD);if(point&&Math.abs(point.x)<width*3&&Math.abs(point.y)<height*3)points.push(point);else{line(points,'rgba(138,179,197,.12)');points=[];}}line(points,'rgba(138,179,197,.12)');}
        for(let dec=-75;dec<=75;dec+=15){let points:{x:number;y:number}[]=[];for(let ra=0;ra<=360;ra+=2){const point=project(ra*RAD,dec*RAD);if(point&&Math.abs(point.x)<width*3&&Math.abs(point.y)<height*3)points.push(point);else{line(points,'rgba(138,179,197,.12)');points=[];}}line(points,'rgba(138,179,197,.12)');}
      }
      if(p.lines)for(const group of constellations){
        for(const ids of group.paths)for(let i=1;i<ids.length;i++){
          const a=starIndex.get(ids[i-1]),b=starIndex.get(ids[i]);if(a===undefined||b===undefined)continue;
          const p1=projectXYZ(coordinates[a*3],coordinates[a*3+1],coordinates[a*3+2]),p2=projectXYZ(coordinates[b*3],coordinates[b*3+1],coordinates[b*3+2]);
          if(p1&&p2&&Math.hypot(p1.x-p2.x,p1.y-p2.y)<Math.max(width,height)*1.3)line([p1,p2],'rgba(147,184,203,.23)');
        }
        const point=project(group.ra*15*RAD,group.dec*RAD);
        if(point&&p.labels&&s.fov>18&&point.x>10&&point.x<width-10&&point.y>50&&point.y<height-35){ctx.textAlign='center';ctx.font='12px "Microsoft YaHei",sans-serif';ctx.fillStyle='rgba(174,193,207,.53)';ctx.fillText(group.name.split('').join(' '),point.x,point.y);ctx.font='8px Georgia,serif';ctx.fillStyle='rgba(174,193,207,.28)';ctx.fillText(group.english.toUpperCase(),point.x,point.y+15);}
      }
      hits=new Map();let visible=0;
      const zoomLevel=Math.max(0,Math.log2(66/s.fov));
      const visibleStars:Hit[]=[],magnitudeLimit=Math.min(catalogStats.maxMagnitude,p.density+zoomLevel*.8);
      function drawStar(star:Star,vx:number,vy:number,vz:number){
        // Reject offscreen coordinates before creating objects or drawing sprites.
        const horizontal=ca*vx+sa*vy,depth=cd*horizontal+sd*vz;
        if(depth<.08)return;
        const x=ox-(ca*vy-sa*vx)*scale/depth,y=oy-(cd*vz-sd*horizontal)*scale/depth;
        if(x<-80||x>width+80||y<-80||y>height+80)return;
        if(p.landscape&&y>height*.8+Math.sin(x/190)*27+Math.cos(x/95)*12)return;
        // Keep neighboring glows from merging on short phone viewports.
        // The catalog is brightness-sorted; fainter neighbors appear as the
        // view is enlarged. Saved and explicitly selected stars stay visible.
        if(zoomLevel<2&&star.id!==p.selectedId&&!memories.has(star.id)&&!favorites.has(star.id)){
          const spacing=clamp(9*p.starSize/(1+zoomLevel*.6),5,14),gx=Math.floor(x/28),gy=Math.floor(y/28);
          for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
            const cell=hits.get((gy+dy)*columns+gx+dx);
            if(cell?.some(hit=>Math.hypot(hit.x-x,hit.y-y)<spacing))return;
          }
        }
        const radius=Math.max(.95,2.6-star.mag*.26)*p.starSize+zoomLevel*.22;
        const hit={star,x,y,r:radius};visibleStars.push(hit);if(x>=0&&x<=width&&y>=0&&y<=height)visible++;
        const key=Math.floor(y/28)*columns+Math.floor(x/28),cell=hits.get(key);if(cell)cell.push(hit);else hits.set(key,[hit]);
      }
      // The active catalog is sorted by magnitude, so dim rows need no per-frame
      // traversal. Saved coordinates outside that subset are drawn separately.
      for(let i=0;i<stars.length;i++){
        const star=stars[i];if(star.mag>magnitudeLimit)break;
        drawStar(star,coordinates[i*3],coordinates[i*3+1],coordinates[i*3+2]);
      }
      for(const item of specialStars){if(starIndex.has(item.star.id)&&item.star.mag<=magnitudeLimit)continue;drawStar(item.star,item.x,item.y,item.z);}
      // Paint faint stars first so their halos cannot cover the brighter cores.
      for(let i=visibleStars.length-1;i>=0;i--){const hit=visibleStars[i],point=sprite(hit.star.color,hit.r,hit.star.mag<2.5);const edge=clamp(Math.min(hit.x,width-hit.x,hit.y,height-hit.y)/24,0,1);ctx.globalAlpha=clamp(Math.pow(10,-Math.max(0,hit.star.mag-2)*.105),.26,1)*edge;ctx.drawImage(point.image,hit.x-point.size/2,hit.y-point.size/2,point.size,point.size);}
      ctx.globalAlpha=1;
      const occupied:{x:number;y:number;w:number;h:number}[]=[];
      function label(text:string,x:number,y:number,color:string,size=10){
        ctx.font=`${size}px "Microsoft YaHei",sans-serif`;const w=ctx.measureText(text).width;
        x=clamp(x,8,width-w-8);y=clamp(y,14,height-20);
        if(occupied.some(box=>x<box.x+box.w&&x+w>box.x&&y-11<box.y+box.h&&y>box.y))return;
        occupied.push({x:x-3,y:y-12,w:w+6,h:17});ctx.textAlign='left';ctx.fillStyle=color;ctx.fillText(text,x,y);
      }
      for(const hit of visibleStars){
        const {star,x,y}=hit,memory=memories.get(star.id),favorite=favorites.has(star.id);
        if((memory||favorite)&&(p.labels||star.id===p.selectedId)){ctx.strokeStyle=memory?'#d7b97599':'#96c5bcaa';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(x,y,memory?10:7,0,TAU);ctx.stroke();}
        if(memory&&p.labels)label(memory.title.length>11?memory.title.slice(0,11)+'…':memory.title,x+18,y-12,'#d8c095',11);
        if(p.labels&&(star.mag<1.8||star.id===p.selectedId||(s.fov<22&&star.mag<5.5)))label(star.name,x+12,y+17,'rgba(210,221,229,.72)');
        if(star.id===p.selectedId){ctx.strokeStyle='#ead2a0';ctx.lineWidth=1.3;const radius=18;for(let j=0;j<4;j++){const a=j*Math.PI/2+Math.PI/8;ctx.beginPath();ctx.arc(x,y,radius,a,a+Math.PI/4);ctx.stroke();}}
      }
      if(p.landscape){const horizon=height*.8,g=ctx.createLinearGradient(0,horizon-100,0,height);g.addColorStop(0,'rgba(165,151,116,0)');g.addColorStop(.65,'rgba(159,154,115,.2)');g.addColorStop(1,'rgba(102,116,95,.4)');ctx.fillStyle=g;ctx.fillRect(0,horizon-100,width,height-horizon+100);for(let layer=0;layer<3;layer++){ctx.beginPath();ctx.moveTo(0,height);for(let x=0;x<=width+10;x+=10)ctx.lineTo(x,horizon+layer*38+Math.sin(x/(190-layer*30)+layer*3)*27+Math.cos(x/95+layer)*12);ctx.lineTo(width,height);ctx.closePath();ctx.fillStyle=['#243b3e','#1b3034','#14262b'][layer];ctx.fill();}}
      const vignette=ctx.createRadialGradient(width*.5,height*.5,Math.min(width,height)*.15,width*.5,height*.5,Math.max(width,height)*.63);vignette.addColorStop(0,'rgba(16,28,42,0)');vignette.addColorStop(.65,'rgba(16,28,42,.08)');vignette.addColorStop(1,'rgba(16,28,42,.75)');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
      if(time-lastReported>150||!moving){const nextFov=Math.round(s.fov);if(nextFov!==lastFov){p.onViewChange(nextFov);lastFov=nextFov;}if(visible!==lastVisible){p.onVisibleChange(visible);lastVisible=visible;}const region=regionAt(s.ra/(15*RAD));if(region!==lastRegion){p.onRegionChange(region);lastRegion=region;}lastReported=time;}
      if(moving)schedule();
    }
    function clearHover(){lastHover=null;setHover(null);}
    function down(event:PointerEvent){if(event.button!==0&&event.pointerType==='mouse')return;propsRef.current.onInteract();clearHover();canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===1){start={x:event.clientX,y:event.clientY};moved=false;state.current.targetRa=state.current.ra;state.current.targetDec=state.current.dec;}if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);moved=true;}canvas.style.cursor='grabbing';schedule();}
    function move(event:PointerEvent){
      const old=pointers.get(event.pointerId);
      if(!old){const rect=canvas.getBoundingClientRect(),hit=pick(event.clientX-rect.left,event.clientY-rect.top,14);canvas.style.cursor=hit?'pointer':'grab';if(hit?.star.id!==lastHover){lastHover=hit?.star.id||null;setHover(hit);}return;}
      const dx=event.clientX-old.x,dy=event.clientY-old.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)moved=true;
      const s=state.current;
      if(pointers.size===2){const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>0&&d>0)s.targetFov=clamp(s.targetFov*pinchDistance/d,4,108);pinchDistance=d;}
      else{const amount=s.fov*RAD/height;s.targetRa+=dx*amount/Math.max(.15,Math.cos(s.dec));s.targetDec=clamp(s.targetDec+dy*amount,-89.7*RAD,89.7*RAD);}
      schedule();
    }
    function up(event:PointerEvent){if(!pointers.has(event.pointerId))return;if(!moved&&pointers.size===1&&event.type==='pointerup'){const rect=canvas.getBoundingClientRect(),hit=pick(event.clientX-rect.left,event.clientY-rect.top,event.pointerType==='touch'?22:16);if(hit)propsRef.current.onSelect(hit.star);}pointers.delete(event.pointerId);canvas.style.cursor='grab';schedule();}
    function wheel(event:WheelEvent){event.preventDefault();propsRef.current.onInteract();clearHover();state.current.targetFov=clamp(state.current.targetFov*Math.exp(event.deltaY*.001),4,108);schedule();}
    function doubleClick(event:MouseEvent){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(pick(x,y,16))return;const ex=-(x-ox)/scale,ny=-(y-oy)/scale;let vx=cd*ca-ex*sa-ny*sd*ca,vy=cd*sa+ex*ca-ny*sd*sa,vz=sd+ny*cd;const norm=Math.hypot(vx,vy,vz);vx/=norm;vy/=norm;vz/=norm;Object.assign(state.current,{targetRa:Math.atan2(vy,vx),targetDec:Math.asin(vz),targetFov:clamp(state.current.fov*.55,4,108)});schedule();}
    function key(event:KeyboardEvent){const s=state.current,step=s.fov*RAD*.07;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key)){event.preventDefault();propsRef.current.onInteract();clearHover();}if(event.key==='ArrowLeft')s.targetRa-=step;if(event.key==='ArrowRight')s.targetRa+=step;if(event.key==='ArrowUp')s.targetDec=clamp(s.targetDec+step,-89.7*RAD,89.7*RAD);if(event.key==='ArrowDown')s.targetDec=clamp(s.targetDec-step,-89.7*RAD,89.7*RAD);if(event.key==='+'||event.key==='=')s.targetFov=clamp(s.targetFov*.8,4,108);if(event.key==='-')s.targetFov=clamp(s.targetFov*1.25,4,108);if(event.key==='Home')reset();schedule();}
    function visibility(){hidden=document.hidden;if(hidden){cancelAnimationFrame(frame);frame=0;}else schedule();}
    canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);canvas.addEventListener('pointerleave',clearHover);canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('dblclick',doubleClick);canvas.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);schedule();
    return()=>{invalidate.current=()=>{};cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);canvas.removeEventListener('pointerleave',clearHover);canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('dblclick',doubleClick);canvas.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return <><canvas ref={canvasRef} className="sky-canvas" tabIndex={0} aria-label="互动星图。每颗可见恒星均可点击。拖动浏览、滚轮或双指缩放，双击空白区域拉近。方向键移动，加减号缩放，Home 复位。"/>{hover&&<div className="star-hover" style={{left:Math.max(8,Math.min(hover.x+15,(canvasRef.current?.clientWidth||400)-190)),top:Math.max(105,hover.y-56)}}><strong>{hover.star.name}</strong><span>{hover.star.constellation} · {hover.star.mag.toFixed(2)} 等</span><small>点击，认识这颗星</small></div>}</>;
});
