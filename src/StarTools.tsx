import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Bookmark, BookmarkCheck, ChevronRight, Compass, Crosshair, Heart, Search, Sparkles, Star as StarIcon, Telescope, X } from 'lucide-react';
import { catalogStats, constellations, formatDec, formatRA, nearbyStars, searchStars, stars, starMap } from './catalog';
import type { Constellation } from './catalog';
import { memoryTags } from './data';
import type { Memory, Star } from './types';

export function SearchBox({memories,onStar,onMemory,onExplore}:{memories:Memory[];onStar:(star:Star)=>void;onMemory:(memory:Memory)=>void;onExplore:()=>void}){
  const [query,setQuery]=useState(''),[open,setOpen]=useState(false),[limit,setLimit]=useState(12);
  const ref=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const term=query.trim().toLowerCase();
  const foundStars=useMemo(()=>term?searchStars(term,limit+1):['sirius','vega','polaris','betelgeuse'].map(id=>starMap[id]),[term,limit]);
  const foundMemories=(term?memories.filter(m=>`${m.title} ${m.content} ${m.category} ${memoryTags(m).join(' ')}`.toLowerCase().includes(term)):memories.slice(0,3)).slice(0,8);
  useEffect(()=>{
    function outside(event:PointerEvent){if(!ref.current?.contains(event.target as Node))setOpen(false);}
    function shortcut(event:KeyboardEvent){if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();input.current?.focus();setOpen(true);}if(event.key==='Escape')setOpen(false);}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',shortcut);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',shortcut);};
  },[]);
  return <div className={`search-box ${open?'is-open':''}`} ref={ref} onKeyDown={event=>{
    const results=Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[data-search-result]')||[]);
    const index=results.indexOf(document.activeElement as HTMLButtonElement);
    if(event.key==='ArrowDown'){event.preventDefault();results[Math.min(index+1,results.length-1)]?.focus();}
    if(event.key==='ArrowUp'){event.preventDefault();if(index<=0)input.current?.focus();else results[index-1]?.focus();}
    if(event.key==='Enter'&&event.target===input.current&&open){event.preventDefault();results[0]?.click();}
  }}>
    <div className="search-field"><Search size={18}/><input ref={input} aria-label="搜索星星或记忆" aria-expanded={open} aria-controls="search-results" placeholder="搜索星名、星座、编号或回忆" value={query} maxLength={100} onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);setLimit(12);setOpen(true);}}/>{query?<button aria-label="清空搜索" onClick={()=>{setQuery('');input.current?.focus();}}><X size={16}/></button>:<kbd>{navigator.platform.includes('Mac')?'⌘':'Ctrl'} K</kbd>}</div>
    {open&&<div className="search-popover" id="search-results">
      <div className="search-suggestions"><span>找一段时光</span>{['18岁','刚上大学','进入恋爱'].map(tag=><button key={tag} onClick={()=>{setQuery(tag);setLimit(12);input.current?.focus();}}>{tag}</button>)}</div>
      {!!foundMemories.length&&<><div className="result-group-title"><Heart size={13}/> 留下的镜 <span>{foundMemories.length}</span></div>{foundMemories.map(memory=><button data-search-result className="search-result memory-result" key={memory.id} onClick={()=>{onMemory(memory);setOpen(false);input.current?.blur();}}><img src={memory.photo||`/images/${memory.theme}.jpg`} alt=""/><span><strong>{memory.title}</strong><small>{memoryTags(memory).join(' · ')} · {memory.date.replaceAll('-','.')}</small></span><ArrowRight size={15}/></button>)}</>}
      {!!foundStars.length&&<><div className="result-group-title"><Sparkles size={13}/> {term?'星空中的回应':'与你相遇的星'}<span>真实星表</span></div>{foundStars.slice(0,limit).map(star=><button data-search-result className="search-result" key={star.id} onClick={()=>{onStar(star);setOpen(false);input.current?.blur();}}><span className="star-dot" style={{color:star.color}}><StarIcon size={17}/></span><span><strong>{star.name}{star.name!==star.english&&<em>{star.english}</em>}</strong><small>{star.constellation} · {star.mag.toFixed(2)} 等 · {star.hip?`HIP ${star.hip}`:star.distance}</small></span><Crosshair size={16}/></button>)}</>}
      {foundStars.length>limit&&<button className="search-more" onClick={()=>setLimit(limit+24)}>继续寻找更多星星 <ChevronRight size={13}/></button>}
      {!foundStars.length&&!foundMemories.length&&<div className="search-empty"><Telescope size={30}/><p>暂时没有找到这束光</p><small>试试「仙女座」「HIP 677」或记忆关键词</small></div>}
      <button className="search-footnote search-explore" onClick={()=>{setOpen(false);onExplore();}}><Compass size={13}/> 浏览 {catalogStats.total.toLocaleString()} 颗星与 88 个星座 <ArrowRight size={13}/></button>
    </div>}
  </div>;
}

export function StarPicker({value,onChange}:{value:string;onChange:(id:string)=>void}){
  const [query,setQuery]=useState('');
  const matches=useMemo(()=>searchStars(query,60),[query]);
  const selected=starMap[value];
  const options=selected?[selected,...matches.filter(star=>star.id!==value)]:matches;
  return <div className="star-picker"><label htmlFor="memory-star"><StarIcon size={14}/> 让一颗星，替你记住</label><div className="picker-search"><Search size={14}/><input aria-label="在全部星星中查找" placeholder="输入星名、星座或 HIP 编号" value={query} onChange={e=>setQuery(e.target.value)} maxLength={100}/></div><select id="memory-star" value={value} onChange={e=>onChange(e.target.value)}>{options.map(star=><option key={star.id} value={star.id}>{star.name} · {star.constellation}</option>)}</select>{query&&!matches.length&&<small>没有找到，当前选中的星星会继续保留。</small>}</div>;
}

export function StarExplorer({favorites,initialTab='constellations',onSelect,onVisit,onRandom}:{favorites:string[];initialTab?:'constellations'|'favorites';onSelect:(star:Star)=>void;onVisit:(group:Constellation)=>void;onRandom:()=>void}){
  const [tab,setTab]=useState<'constellations'|'favorites'>(initialTab);
  const [query,setQuery]=useState(''),[group,setGroup]=useState<Constellation|null>(null),[limit,setLimit]=useState(40);
  const term=query.trim().toLowerCase();
  const groups=constellations.filter(c=>`${c.name} ${c.english} ${c.id}`.toLowerCase().includes(term)).sort((a,b)=>a.english.localeCompare(b.english));
  const selectedStars=useMemo(()=>{
    let result=tab==='favorites'?favorites.map(id=>starMap[id]).filter(Boolean):group?stars.filter(star=>star.constellationId===group.id):[];
    if(term)result=result.filter(star=>(star.aliases||[]).join(' ').toLowerCase().includes(term));
    return result;
  },[favorites,tab,group,term]);
  return <div className="atlas"><span className="modal-eyebrow"><Compass size={14}/> 循着星光，慢慢走</span><h2>把宇宙，慢慢逛完。</h2><p>{catalogStats.total.toLocaleString()} 颗真实恒星，每一颗都可以相遇。</p><div className="atlas-tabs"><button className={tab==='constellations'?'active':''} onClick={()=>{setTab('constellations');setGroup(null);setQuery('');setLimit(40);}}>88 个星座</button><button className={tab==='favorites'?'active':''} onClick={()=>{setTab('favorites');setGroup(null);setQuery('');setLimit(40);}}><Bookmark size={13}/> 我的收藏 <span>{favorites.length}</span></button><button className="atlas-random" onClick={onRandom}><Sparkles size={14}/> 随机相遇</button></div>
    <div className="atlas-search"><Search size={16}/><input aria-label="搜索星座或收藏" placeholder={group?'在这个星座中寻找':tab==='favorites'?'寻找收藏过的星星':'搜索星座，如猎户座、天蝎座'} value={query} onChange={e=>{setQuery(e.target.value);setLimit(40);}} maxLength={100}/></div>
    {group&&<div className="atlas-group-heading"><button onClick={()=>{setGroup(null);setQuery('');}}>← 全部星座</button><span>{group.name} <small>{group.count.toLocaleString()} 颗</small></span><button onClick={()=>onVisit(group)}><Crosshair size={13}/> 漫游这里</button></div>}
    <div className="atlas-scroll">{tab==='constellations'&&!group?<div className="constellation-grid">{groups.map(c=><button className="constellation-card" key={c.id} onClick={()=>{setGroup(c);setQuery('');setLimit(40);}}><span className="constellation-monogram">{c.id}</span><span><strong>{c.name}</strong><small>{c.english}</small></span><span className="constellation-star-count">{c.count}<StarIcon size={9}/></span></button>)}{groups.length===0&&<div className="atlas-empty"><Telescope/><p>没有找到这个星座，换个名字试试。</p></div>}</div>:<div className="atlas-star-list">{selectedStars.slice(0,limit).map(star=><button key={star.id} onClick={()=>onSelect(star)}><span className="star-dot" style={{color:star.color}}><StarIcon size={16}/></span><span><strong>{star.name}</strong><small>{star.constellation} · {star.mag.toFixed(2)} 等</small></span><Crosshair size={15}/></button>)}{selectedStars.length>limit&&<button className="atlas-load-more" onClick={()=>setLimit(limit+40)}>再看 40 颗星 <ChevronRight size={15}/></button>}{!selectedStars.length&&<div className="atlas-empty"><Bookmark size={31} strokeWidth={1}/><p>{term?'没有找到匹配的星星':'还没有收藏的星星'}</p><small>在星体详情里点一下收藏，把喜欢的光留下。</small></div>}</div>}</div>
    <div className="atlas-footer"><span>HYG v4.0 · J2000 星表</span><span>放大星空，会看见更多微光</span></div>
  </div>;
}

export function StarPanel({star,memories,favorite,pending,onFavorite,onClose,onNew,onMemory,onSelect}:{star:Star;memories:Memory[];favorite:boolean;pending:boolean;onFavorite:()=>void;onClose:()=>void;onNew:()=>void;onMemory:(memory:Memory)=>void;onSelect:(star:Star)=>void}){
  const nearby=useMemo(()=>nearbyStars(star,4),[star]);
  return <aside className="star-panel" aria-label={`${star.name}的详情`}><div className="star-panel-header"><span className="modal-eyebrow"><span className="tiny-star">✧</span> 与这颗星，相遇</span><button className={`star-bookmark ${favorite?'saved':''}`} aria-label={favorite?'取消收藏这颗星':'收藏这颗星'} aria-pressed={favorite} disabled={pending} onClick={onFavorite}>{favorite?<BookmarkCheck size={17}/>:<Bookmark size={17}/>}</button><button className="star-panel-close" aria-label="关闭星体详情" onClick={onClose}><X size={17}/></button></div><div className="star-panel-scroll"><div className="star-panel-title"><h2 className={star.name.length>8?'long-star-name':''}>{star.name}</h2>{star.english!==star.name&&<span>{star.english}</span>}<span className="star-panel-orb" style={{color:star.color}}><Sparkles size={29} strokeWidth={1}/></span></div><div className="star-facts"><span>{star.constellation}</span><span>{star.distance}</span><span>{star.mag.toFixed(2)} 等</span></div><p>{star.description}</p>
    <details className="stellar-details"><summary>恒星档案 <span>{star.hip?`HIP ${star.hip}`:'HYG 星表'}</span></summary><dl><div><dt>赤经 J2000</dt><dd>{formatRA(star.ra)}</dd></div><div><dt>赤纬 J2000</dt><dd>{formatDec(star.dec)}</dd></div><div><dt>光谱类型</dt><dd>{star.spectral||'暂无数据'}</dd></div><div><dt>星表编号</dt><dd>{star.hd?`HD ${star.hd}`:star.id.toUpperCase()}</dd></div></dl><small>星等越小，通常越亮；距离为星表估计值。</small></details>
    {!!memories.length&&<div className="star-memories">{memories.map(memory=><button key={memory.id} onClick={()=>onMemory(memory)}><img src={memory.photo||`/images/${memory.theme}.jpg`} alt=""/><span><small>寄存在这里的回忆</small><strong>{memory.title}</strong></span><ChevronRight size={15}/></button>)}</div>}
    <button className="star-save-button" onClick={onNew}>＋ 把此刻，留在这颗星</button>
    {!!nearby.length&&<details className="nearby-stars"><summary>附近还有这些光 <ChevronRight size={12}/></summary>{nearby.map(item=><button key={item.star.id} onClick={()=>onSelect(item.star)}><span style={{color:item.star.color}}>✦</span><span>{item.star.name}</span><small>{item.distance.toFixed(1)}°</small></button>)}</details>}
  </div></aside>;
}
