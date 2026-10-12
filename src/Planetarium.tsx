import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Info, Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { planets } from './planets';
import { createPlanetScene } from './planet-renderer';
import type { PlanetRenderStatus, PlanetScene } from './planet-renderer';
import './planets.css';

export default function Planetarium() {
  const [index,setIndex]=useState(0);
  const [status,setStatus]=useState<PlanetRenderStatus>('loading');
  const [automatic,setAutomatic]=useState(false);
  const [retry,setRetry]=useState(0);
  const canvas=useRef<HTMLCanvasElement>(null);
  const scene=useRef<PlanetScene|null>(null);
  const dock=useRef<HTMLDivElement>(null);
  const planet=planets[index];
  useEffect(()=>{
    try {scene.current=createPlanetScene(canvas.current!,setStatus);}
    catch {setStatus('unavailable');}
    return()=>{scene.current?.dispose();scene.current=null;};
  },[retry]);
  useEffect(()=>{scene.current?.show(planet);},[planet,retry]);
  useEffect(()=>{scene.current?.autoRotate(automatic);},[automatic,retry]);
  useEffect(()=>{
    const button=dock.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if(button&&dock.current){
      const container=dock.current;
      const target=button.offsetLeft-(container.clientWidth-button.clientWidth)/2;
      container.scrollTo({left:target,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    }
  },[index]);
  const select=(next:number)=>setIndex((next+planets.length)%planets.length);
  const available=status!=='unavailable';
  return <section className="planetarium" aria-label="行星近观" style={{'--planet-color':planet.color} as CSSProperties}>
    <div className="planet-copy" key={planet.id}>
      <div className="planet-eyebrow"><span/> 太阳系 · 三维漫游</div>
      <h1>{planet.name}<span>{planet.english}</span></h1>
      <p className="planet-subtitle">{planet.subtitle}</p>
      <p className="planet-description">{planet.description}</p>
      <div className="planet-facts"><span>{planet.kind}</span><span>{planet.detail}</span></div>
      <details className="planet-source"><summary><Info size={13}/> 影像与模拟说明</summary><div><p>{planet.credit}</p><p>三维光照与视角为演示。天体大小未按同一比例显示，也不代表实时位置或当前云层。</p></div></details>
    </div>
    <div className="planet-observatory">
      <div className="planet-stage" data-status={status} data-planet={planet.id} aria-busy={status==='loading'}>
        <div className="planet-dust" aria-hidden="true"/>
        <canvas key={retry} ref={canvas} className="planet-canvas" tabIndex={available?0:-1} aria-hidden={!available} aria-label={`${planet.name}三维模型。拖动旋转，滚轮或双指缩放，方向键转动，加减号缩放，Home 复位。`}/>
        {status==='loading'&&<span className="planet-loading" role="status">正在靠近{planet.name}…</span>}
        {!available&&<div className="planet-fallback"><img src={`/textures/planets/${planet.id}-preview.webp`} alt={`${planet.name}的静态预览`}/><p role="status">当前设备使用静态预览</p><button onClick={()=>setRetry(value=>value+1)}>重新启用三维</button></div>}
        <span className="planet-map-note">{status==='simulated'?'备用模拟纹理':planet.observed?'公开地图 · 三维演绎':'模拟纹理 · 三维演绎'}</span>
      </div>
      <div className="planet-controls">
        <span className="planet-gesture">拖动旋转<span> · </span>双指缩放</span>
        <div className="planet-view-controls" aria-label="三维视角控制"><button disabled={!available} aria-label="缩小星球" title="缩小" onClick={()=>scene.current?.zoom(-1)}><Minus size={17}/></button><button disabled={!available} aria-label="放大星球" title="放大" onClick={()=>scene.current?.zoom(1)}><Plus size={17}/></button><button disabled={!available} aria-label="重置星球视角" title="复位" onClick={()=>scene.current?.reset()}><RotateCcw size={16}/></button></div>
        <button disabled={!available} className="planet-rotate" aria-pressed={automatic} aria-label="缓慢自转" onClick={()=>setAutomatic(value=>!value)}>{automatic?<Pause size={14}/>:<Play size={14}/>}<span>{automatic?'暂停自转':'缓慢自转'}</span></button>
      </div>
    </div>
    <div className="planet-dock">
      <div className="planet-dock-heading"><span>去下一颗星球</span><span className="planet-position" aria-live="polite">{String(index+1).padStart(2,'0')} <i>/ {String(planets.length).padStart(2,'0')}</i></span></div>
      <nav className="planet-navigation" aria-label="选择太阳系天体">
        <button className="planet-next" aria-label="上一颗天体" onClick={()=>select(index-1)}><ArrowLeft size={17}/></button>
        <div ref={dock} className="planet-list">{planets.map((item,i)=><button key={item.id} aria-label={`探索${item.name}`} aria-pressed={index===i} onClick={()=>select(i)}><img src={`/textures/planets/${item.id}-preview.webp`} alt="" width="56" height="56" loading="lazy"/><span>{item.name}</span><i/></button>)}</div>
        <button className="planet-next" aria-label="下一颗天体" onClick={()=>select(index+1)}><ArrowRight size={17}/></button>
      </nav>
    </div>
  </section>;
}