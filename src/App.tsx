import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, BookHeart, Bookmark, Check, ChevronDown, ChevronRight, Compass, Crosshair, Eye, Grid3X3, Heart, ImagePlus, LoaderCircle, LogOut, Mail, Maximize2, Minus, Moon, Mountain, Orbit, Pencil, Plus, Settings2, ShieldCheck, Sparkles, Star as StarIcon, Telescope, Trash2, Upload, UserRound, X } from 'lucide-react';
import { api, readGuestMemories, saveGuestMemories, saveGuestBackup } from './api';
import { demoMemories, localDate, memoryTags, starMap, stars, themes } from './data';
import { catalogStats } from './catalog';
import type { Constellation } from './catalog';
import { SearchBox, StarExplorer, StarPanel, StarPicker } from './StarTools';
import { BackupImport } from './UpgradeDialogs';
import { createBackupParts, downloadBackup, mergeMemories, preparePhoto } from './memory-utils';
import type { BackupPart } from './memory-utils';
import { readFavorites, saveFavorites, readPreferences, savePreferences } from './preferences';
import { SkyCanvas } from './SkyCanvas';
import { skyRegions } from './sky-regions';
import type { SkyRegion, SkyRegionId } from './sky-regions';
import { isAndroidApp } from './platform';
import type { SkyHandle } from './SkyCanvas';
import type { Memory, MemoryCategory, MemoryDraft, MemoryTheme, Page, Star, User } from './types';

function MirrorLogo({small=false}:{small?:boolean}) {
  return <svg className={small?'mirror-logo small':'mirror-logo'} width="36" height="42" viewBox="0 0 36 42" fill="none" aria-hidden="true"><ellipse cx="15" cy="17" rx="10" ry="13" stroke="currentColor" strokeWidth="1.5"/><ellipse cx="15" cy="17" rx="7" ry="10" stroke="currentColor" strokeWidth="0.7" opacity="0.45"/><path d="M15 30v8m-7 0h14M28 2v10m-5-5h10M12 12l-2 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}

function Modal({title,children,onClose,className=''}:{title:string;children:ReactNode;onClose:()=>void;className?:string}) {
  const ref=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);
  useEffect(()=>{closeRef.current=onClose;},[onClose]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusable=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]')||[]).filter(el=>el.offsetParent!==null);
    focusable()[0]?.focus();
    function key(event:KeyboardEvent) {
      if(event.key==='Escape') closeRef.current();
      if(event.key==='Tab') {
        const items=focusable();const first=items[0],last=items[items.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',key);
    return ()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return createPortal(<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div className={`modal ${className}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}><button className="icon-button modal-close" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button>{children}</div></div>,document.fullscreenElement||document.body);
}

function ArrowUpRightIcon(){return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" strokeWidth="1.2"/></svg>;}

function MemoryArtwork({memory}:{memory:Memory}) {
  if(memoryTags(memory)[0]==='18岁') return <><small>HELLO, MY</small><b>18</b><span>愿你永远 热烈而自由</span></>;
  if(memory.theme==='love') return <><Heart size={29} strokeWidth={1}/><b className="art-script">It’s you.</b><span>幸好，是你</span></>;
  const text={sunrise:'一束微光',campus:'新的篇章',ocean:'去见山海',forest:'慢慢生长',night:'星河如你'}[memory.theme];
  return <>{memory.theme==='campus'?<StarIcon size={23} strokeWidth={1}/>:<Sparkles size={24} strokeWidth={1}/>}<b className="art-chinese">{text}</b><span>{memory.theme==='campus'?'A NEW CHAPTER':'COLLECT LITTLE MOMENTS'}</span></>;
}

function MemoryFrame({memory,onClick,index}:{memory:Memory;onClick:()=>void;index:number}) {
  return <button className={`memory-frame frame-${index%3} theme-${memory.theme}`} onClick={onClick} aria-label={`打开记忆：${memory.title}`}>
    <div className="wood-frame">
      <div className="frame-mat">
        <div className="frame-picture">
          <img src={memory.photo||`/images/${memory.theme}.jpg`} alt={memory.photo?`${memory.title}的照片封面`:`${themes.find(t=>t.id===memory.theme)?.label}风景`} loading="lazy"/>
          <div className={`photo-shade ${memory.photo?'personal-photo-shade':''}`}/>
          {!memory.photo&&<div className="frame-art-text"><MemoryArtwork memory={memory}/></div>}
        </div>
        <span className="frame-date">{memory.date.replaceAll('-',' . ')}</span>
      </div>
    </div>
    <div className="frame-label"><span className="frame-tag">{memoryTags(memory)[0]}</span><h3>{memory.title}</h3><span className="frame-category">{memory.category}<span>·</span>{starMap[memory.starId]?.name||'星空'}</span></div>
  </button>;
}

function Bookshelf({memories,onOpen,onNew,guest}:{memories:Memory[];onOpen:(m:Memory)=>void;onNew:()=>void;guest:boolean}) {
  const [filter,setFilter]=useState('全部');
  const [order,setOrder]=useState('oldest');
  const filtered=memories.filter(m=>filter==='全部'||m.category===filter).sort((a,b)=>order==='oldest'?a.date.localeCompare(b.date):b.date.localeCompare(a.date));
  return <main className="shelf-page">
    <div className="shelf-grain"/>
    <div className="shelf-intro"><div><div className="eyebrow"><span/> THE MOMENTS WE KEEP</div><h1>留下的镜<span>，</span></h1><p>把走过的时光，安放在心里的书架上。</p></div><div className="shelf-intro-right"><span className="handwritten">每一面镜，都是曾经的你。<Sparkles size={19}/></span><button className="primary-button" onClick={onNew}><Plus size={17}/> 留下一面镜</button></div></div>
    <div className="shelf-filter"><div className="filter-tabs" aria-label="按记忆分类">{['全部','成长','生活','心动','旅行'].map(item=><button key={item} className={filter===item?'active':''} aria-pressed={filter===item} onClick={()=>setFilter(item)}>{item}{item==='全部'&&<span>{memories.length}</span>}</button>)}</div><label className="sort-control"><span className="sr-only">记忆排序</span><select value={order} onChange={e=>setOrder(e.target.value)}><option value="oldest">沿着时光，慢慢看</option><option value="newest">最近的时光在前</option></select><ChevronDown size={13}/></label></div>
    <div className="shelf-gallery">
      {filtered.map((memory,index)=><div className="shelf-cell" key={memory.id}><MemoryFrame memory={memory} index={index} onClick={()=>onOpen(memory)}/></div>)}
      <div className="shelf-cell add-cell"><button className="add-frame" onClick={onNew}><span className="add-frame-border"><Plus size={30} strokeWidth={1}/><span>下一段故事</span><small>等你来留下</small></span><span className="add-frame-caption">生活里的小事，也值得被珍藏</span></button></div>
    </div>
    {filtered.length===0&&filter!=='全部'&&<p className="filter-empty">还没有「{filter}」的记忆，从一个小小的瞬间开始吧。</p>}
    <div className="shelf-footer"><MirrorLogo small/><span>{isAndroidApp?'你的本机书架 · 让每一段时光，离线也有归处':guest?'此刻是你的体验书架 · 登录后，拥有专属的记忆空间':'你的私人书架 · 每一段时光，只为你保留'}</span><span className="shelf-footer-line"/></div>
  </main>;
}

function MemoryEditor({initial,starId,onSave,onClose}:{initial?:Memory;starId?:string;onSave:(draft:MemoryDraft,id?:string)=>Promise<void>;onClose:()=>void}) {
  const [title,setTitle]=useState(initial?.title||'');
  const [date,setDate]=useState(initial?.date||localDate());
  const [category,setCategory]=useState<MemoryCategory>(initial?.category||'生活');
  const [tag,setTag]=useState(initial?memoryTags(initial)[0]:'');
  const [content,setContent]=useState(initial?.content||'');
  const [theme,setTheme]=useState<MemoryTheme>(initial?.theme||'sunrise');
  const [photo,setPhoto]=useState(initial?.photo||'');
  const [processing,setProcessing]=useState(false);
  const photoInput=useRef<HTMLInputElement>(null);
  const [star,setStar]=useState(initial?.starId||starId||'betelgeuse');
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function uploadPhoto(file:File){
    setProcessing(true);setError('');
    try{setPhoto(await preparePhoto(file));}catch(e){setError(e instanceof Error?e.message:'照片读取失败，请重试。');}finally{setProcessing(false);}
  }
  async function submit(event:FormEvent) {
    event.preventDefault();if(processing||saving)return;if(!title.trim()||!content.trim()){setError('给这段记忆一个名字，再写下此刻的心情吧。');return;}
    setSaving(true);setError('');
    try{await onSave({title:title.trim(),date,category,tag:tag.trim()||category,content:content.trim(),theme,starId:star,...(photo?{photo}:{})},initial?.id);}catch(error){setError(error instanceof Error?error.message:'保存失败，请重试');setSaving(false);}
  }
  return <Modal title={initial?'编辑这面镜':'留下一面镜'} onClose={()=>{if(!saving)onClose();}} className="editor-modal"><div className="editor-heading"><span className="modal-eyebrow"><Sparkles size={14}/> A LITTLE MOMENT, A LITTLE LIGHT</span><h2>{initial?'再看看，那时的自己':'让这一刻，留下来。'}</h2><p>不必是大事。让你心动过的，就值得。</p></div><form onSubmit={submit}>
    <label className="form-label">给回忆起个名字<input required autoComplete="off" maxLength={40} placeholder="比如：十八岁，风是自由的" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <div className="form-row"><label className="form-label">那一天<input type="date" required max={localDate()} min="1900-01-01" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="form-label">属于哪种心情<select value={category} onChange={e=>setCategory(e.target.value as MemoryCategory)}>{['成长','生活','心动','旅行'].map(c=><option key={c}>{c}</option>)}</select></label></div>
    <label className="form-label">人生标签<input maxLength={16} placeholder="比如：18岁、刚上大学、第一次旅行（选填）" value={tag} onChange={e=>setTag(e.target.value)}/></label>
    <label className="form-label">想对未来的自己说<textarea required maxLength={5000} rows={4} placeholder="写下那天的风、遇见的人，或是一个不想忘记的瞬间……" value={content} onChange={e=>setContent(e.target.value)}/><span className="character-count">{content.length} / 5000</span></label>
    <fieldset className="theme-picker"><legend>选一张心情封面</legend><div>{themes.map(t=><button type="button" key={t.id} disabled={processing||saving} aria-pressed={!photo&&theme===t.id} className={!photo&&theme===t.id?'selected':''} onClick={()=>{setTheme(t.id);setPhoto('');}}><img src={`/images/${t.id}.jpg`} alt=""/><span>{t.label}</span>{!photo&&theme===t.id&&<Check size={15}/>}</button>)}</div></fieldset>
    <div className="photo-upload"><input ref={photoInput} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择自己的照片" disabled={processing||saving} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadPhoto(file);e.target.value='';}}/>{photo&&<img className="photo-preview" src={photo} alt="自己的照片封面预览"/>}<div><button className="photo-upload-button" type="button" disabled={processing||saving} onClick={()=>photoInput.current?.click()}>{processing?<LoaderCircle className="spin" size={17}/>:<ImagePlus size={17}/>} {processing?'正在处理照片…':photo?'换一张自己的照片':'用自己的照片作封面'}</button><small>JPG、PNG、WebP · 最多 12 MB · 自动压缩保存</small></div>{photo&&<button type="button" className="photo-remove" aria-label="移除自己的照片" disabled={processing||saving} onClick={()=>setPhoto('')}><X size={16}/></button>}</div>
    <StarPicker value={star} onChange={setStar}/>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="editor-actions"><span><ShieldCheck size={14}/> 你的记忆，只属于你</span><button className="primary-button" type="submit" disabled={saving||processing}>{saving?<LoaderCircle className="spin" size={17}/>:<Plus size={17}/>} {saving?'正在珍藏…':initial?'保存这面镜':'珍藏这一刻'}</button></div>
  </form></Modal>;
}

function MemoryDetail({memory,onClose,onEdit,onDelete,onLocate}:{memory:Memory;onClose:()=>void;onEdit:()=>void;onDelete:()=>Promise<void>;onLocate:()=>void}) {
  const [confirming,setConfirming]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function remove(){setBusy(true);try{await onDelete();}catch(e){setError(e instanceof Error?e.message:'操作失败');setBusy(false);}}
  return <Modal title={memory.title} onClose={()=>{if(!busy)onClose();}} className="detail-modal"><div className={`detail-cover theme-${memory.theme}`}><img src={memory.photo||`/images/${memory.theme}.jpg`} alt={memory.photo?`${memory.title}的照片封面`:`${themes.find(t=>t.id===memory.theme)?.label}风景`}/><div/><span className="detail-cover-label"><MirrorLogo small/> 镜留 · 时光有迹</span></div><div className="detail-body"><div className="detail-meta"><span>{memoryTags(memory)[0]}</span><time>{memory.date.replaceAll('-',' . ')}</time></div><h2>{memory.title}</h2><p className="memory-content">{memory.content}</p><button className="memory-star-link" onClick={onLocate}><StarIcon size={17}/><span>这段记忆，住在 <strong>{starMap[memory.starId]?.name||'星空'}</strong></span><ArrowUpRightIcon/></button><div className="detail-actions"><span>{memory.category} · 一面属于你的镜</span><button onClick={onEdit}><Pencil size={15}/> 编辑</button><button className="delete-button" aria-label="删除这段记忆" onClick={()=>setConfirming(true)}><Trash2 size={15}/></button></div>{confirming&&<div className="delete-confirm"><p>确定删除这段记忆吗？删除后无法恢复。</p><div><button className="subtle-button" disabled={busy} onClick={()=>setConfirming(false)}>再想想</button><button className="danger-button" disabled={busy} onClick={remove}>{busy?'正在删除…':'确认删除'}</button></div></div>}{error&&<p className="form-error" role="alert">{error}</p>}</div></Modal>;
}

function AuthModal({onClose,onSuccess}:{onClose:()=>void;onSuccess:(user:User,memories:Memory[],favorites:string[])=>void}) {
  const [mode,setMode]=useState<'login'|'register'>('register');
  const [email,setEmail]=useState('');const [name,setName]=useState('');const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{const result=await api.auth(mode,{email,password,name});const [data,saved]=await Promise.all([api.memories(),api.favorites()]);onSuccess(result.user,data.memories,saved.favorites);}catch(e){setError(e instanceof Error?e.message:'连接失败，请重试');}finally{setBusy(false);}}
  return <Modal title={mode==='login'?'登录镜留':'拥有你的星空'} onClose={()=>{if(!busy)onClose();}} className="auth-modal"><div className="auth-brand"><MirrorLogo/><span>镜留</span></div><span className="modal-eyebrow">A UNIVERSE OF YOUR OWN</span><h2>{mode==='register'?'每一束光，都有归处。':'欢迎回到，你的星空。'}</h2><p>拥有自己的星海，让珍贵的回忆一直都在。</p><div className="auth-tabs"><button className={mode==='register'?'active':''} disabled={busy} onClick={()=>{setMode('register');setError('');}}>创建账号</button><button className={mode==='login'?'active':''} disabled={busy} onClick={()=>{setMode('login');setError('');}}>已有账号</button></div><form onSubmit={submit}>{mode==='register'&&<label className="form-label">怎么称呼你<input autoComplete="nickname" maxLength={24} required placeholder="你的昵称" value={name} onChange={e=>setName(e.target.value)}/></label>}<label className="form-label">邮箱<input type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="form-label">密码<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={8} maxLength={128} required placeholder="至少 8 位，留一个只有你知道的密码" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button auth-submit" disabled={busy} type="submit">{busy?<LoaderCircle size={18} className="spin"/>:mode==='register'?'开启我的星空':'回到我的星空'}{!busy&&<ArrowRight size={17}/>}</button></form><div className="auth-note"><ShieldCheck size={14}/> 账号内的记忆仅自己可见，体验书架单独保留</div></Modal>;
}

function Profile({user,memories,favorites,onAuth,onLogout,onNew,onShelf,onExport,onImport,onExplore,onAbout}:{user:User|null;memories:Memory[];favorites:string[];onAuth:()=>void;onLogout:()=>void;onNew:()=>void;onShelf:()=>void;onExport:()=>void;onImport:()=>void;onExplore:()=>void;onAbout:()=>void}) {
  const distinctStars=new Set(memories.map(m=>m.starId)).size;
  return <main className="profile-page"><div className="profile-banner"><div className="profile-stars">✧<span>✦</span>✧</div><div className="profile-avatar"><UserRound size={32} strokeWidth={1}/><span><StarIcon size={11}/></span></div><div className="eyebrow">YOUR LITTLE UNIVERSE</div><h1>{user?`${user.name}的星空`:'你好，拾光的人。'}</h1><p>{user?'生活很长，值得珍藏的瞬间也很多。':'在这里，慢慢收集成为自己的每一刻。'}</p>{!user&&!isAndroidApp&&<button className="primary-button" onClick={onAuth}>拥有我的星空 <ArrowRight size={16}/></button>}{user&&<span className="account-email"><Mail size={13}/>{user.email}</span>}</div><div className="profile-body"><div className="profile-stats"><div><strong>{memories.length.toString().padStart(2,'0')}</strong><span>留下的镜</span></div><div><strong>{distinctStars.toString().padStart(2,'0')}</strong><span>点亮的星</span></div><div><strong>{new Set(memories.map(m=>m.category)).size.toString().padStart(2,'0')}</strong><span>人生的切面</span></div></div><div className="profile-menu"><button onClick={onShelf}><BookHeart/><span><strong>我的记忆书架</strong><small>再看一眼，那时的自己</small></span><ChevronRight size={18}/></button><button onClick={onNew}><ImagePlus/><span><strong>留下一面新的镜</strong><small>今天，有什么值得记住的小事？</small></span><ChevronRight size={18}/></button><button onClick={onExport}><ArrowDownToLine/><span><strong>带走我的回忆</strong><small>备份记忆、照片封面和收藏的星星</small></span><ChevronRight size={18}/></button><button onClick={onImport}><Upload/><span><strong>导入回忆备份</strong><small>预览后合并，完整保留现有记忆</small></span><ChevronRight size={18}/></button><button onClick={onExplore}><Bookmark/><span><strong>我收藏的星星</strong><small>{favorites.length} 颗微光，等你再相遇</small></span><ChevronRight size={18}/></button><button onClick={onAbout}><Orbit/><span><strong>关于镜留</strong><small>每一刻，都有回响</small></span><ChevronRight size={18}/></button></div><div className="privacy-note"><ShieldCheck size={17}/><p>{isAndroidApp?'记忆与照片保存在这台手机上，离线也能使用。换机或卸载前，可用「带走我的回忆」导出备份。':user?'你的记忆已存放在个人账号中，仅你自己可见。':'你正在体验镜留。新增的记忆保存在当前浏览器；登录后可创建自己的专属书架。'}</p></div>{user&&<button className="logout-button" onClick={onLogout}><LogOut size={16}/> 退出登录</button>}<div className="profile-footer">镜留 JINGLIU <span>·</span> 把时光，轻轻留下</div></div></main>;
}

function getPage():Page { const hash=window.location.hash.slice(1);return hash==='shelf'||hash==='profile'?hash:'sky'; }

export default function App() {
  const [page,setPage]=useState<Page>(getPage);
  const [user,setUser]=useState<User|null>(null);
  const [memories,setMemories]=useState<Memory[]>(()=>readGuestMemories(demoMemories));
  const [favorites,setFavorites]=useState<string[]>(readFavorites);
  const [favoriteBusy,setFavoriteBusy]=useState(false);
  const [importBusy,setImportBusy]=useState(false);
  const [atlasTab,setAtlasTab]=useState<'constellations'|'favorites'>('constellations');
  const [ready,setReady]=useState(false);
  const [modal,setModal]=useState<'auth'|'editor'|'about'|'atlas'|'import'|'export'|null>(null);
  const [backupParts,setBackupParts]=useState<BackupPart[]>([]);
  const [editing,setEditing]=useState<Memory|undefined>();
  const [detail,setDetail]=useState<Memory|null>(null);
  const [selectedStar,setSelectedStar]=useState<Star|null>(null);
  const [settings,setSettings]=useState(false);
  const [preferences]=useState(readPreferences);
  const [lines,setLines]=useState(preferences.lines);const [labels,setLabels]=useState(preferences.labels);const [grid,setGrid]=useState(preferences.grid);const [landscape,setLandscape]=useState(preferences.landscape);
  const [density,setDensity]=useState(preferences.density);
  const [starSize,setStarSize]=useState(preferences.starSize);
  const [visibleCount,setVisibleCount]=useState(0);
  const [fov,setFov]=useState(66);
  const [activeRegion,setActiveRegion]=useState<SkyRegionId>('winter');
  const [exploring,setExploring]=useState(false);
  const [toast,setToast]=useState('');
  const [fullscreen,setFullscreen]=useState(false);
  const sky=useRef<SkyHandle>(null);
  const skySection=useRef<HTMLElement>(null);
  const focusAfterMount=useRef<string|null>(null);
  const regionAfterMount=useRef<Constellation|null>(null);
  useEffect(()=>{
    let active=true;
    async function load(){try{const {user:current}=await api.me();if(current){const [data,saved]=await Promise.all([api.memories(),api.favorites()]);if(active){setUser(current);setMemories(data.memories);setFavorites(saved.favorites);}}}catch{if(active)setToast('暂时无法连接账号服务，可以先体验星空与书架。');}finally{if(active)setReady(true);}}
    load();return()=>{active=false;};
  },[]);
  useEffect(()=>{function change(){setPage(getPage());setSettings(false);}window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(timer);}},[toast]);
  useEffect(()=>{if(page==='sky'){if(focusAfterMount.current){sky.current?.focus(focusAfterMount.current);focusAfterMount.current=null;}if(regionAfterMount.current){const group=regionAfterMount.current;sky.current?.region(group.ra,group.dec,group.fov);regionAfterMount.current=null;}}},[page]);
  useEffect(()=>{function change(){setFullscreen(!!document.fullscreenElement);}document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
  useEffect(()=>{savePreferences({lines,labels,grid,landscape,density,starSize});},[lines,labels,grid,landscape,density,starSize]);
  useEffect(()=>{
    window.jingliuHandleBack=()=>{
      if(document.querySelector('.search-box.is-open')){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));(document.activeElement as HTMLElement)?.blur();return true;}
      if(modal){if(!importBusy)setModal(null);return true;}
      if(detail){setDetail(null);return true;}
      if(settings){setSettings(false);return true;}
      if(selectedStar){setSelectedStar(null);return true;}
      if(page!=='sky'){navigate('sky');return true;}
      if(exploring){sky.current?.reset();setExploring(false);return true;}
      return false;
    };
    return()=>{delete window.jingliuHandleBack;};
  },[modal,detail,settings,selectedStar,page,exploring,importBusy]);
  function visitRegion(region:SkyRegion){setSelectedStar(null);setSettings(false);setExploring(true);setActiveRegion(region.id);sky.current?.region(region.ra,region.dec,region.fov);}
  function navigate(next:Page){setPage(next);window.location.hash=next;setSettings(false);window.scrollTo({top:0,behavior:'instant'});}
  function newMemory(){if(!ready){setToast('正在载入你的星空，请稍候。');return;}setEditing(undefined);setModal('editor');}
  function selectStar(star:Star){setSelectedStar(star);setModal(null);setSettings(false);if(page!=='sky'){focusAfterMount.current=star.id;navigate('sky');}else sky.current?.focus(star.id);}
  function openAtlas(tab:'constellations'|'favorites'='constellations'){setAtlasTab(tab);setSettings(false);setModal('atlas');}
  function visitConstellation(group:Constellation){setModal(null);setSelectedStar(null);setExploring(true);if(page!=='sky'){regionAfterMount.current=group;navigate('sky');}else sky.current?.region(group.ra,group.dec,group.fov);setToast(`来到${group.name}，点击一颗星开始相遇。`);}
  async function toggleFavorite(){
    if(!selectedStar||favoriteBusy||!ready)return;
    const id=selectedStar.id,saved=favorites.includes(id),next=saved?favorites.filter(value=>value!==id):[...favorites,id];
    setFavoriteBusy(true);
    try{if(user)await api.favorite(id,!saved);else saveFavorites(next);setFavorites(next);setToast(saved?'已取消收藏。':'这颗星，已收进你的收藏。');}catch(e){setToast(e instanceof Error?e.message:'收藏保存失败，请重试。');}finally{setFavoriteBusy(false);}
  }
  async function importBackup(incoming:Memory[],saved:string[]){
    if(!ready)throw new Error('正在载入你的星空，请稍候。');
    if(favoriteBusy)throw new Error('正在保存星星收藏，请稍候再导入。');
    setImportBusy(true);
    try{
      const result=user?await api.importBackup(incoming,saved):{...mergeMemories(memories,incoming),favorites:[...new Set([...favorites,...saved])]};
      if(!user)saveGuestBackup(result.memories,result.favorites);
      setMemories(result.memories);setFavorites(result.favorites);setModal(null);
      setToast(`已导入 ${result.imported} 段记忆，跳过 ${result.skipped} 段重复内容，收藏已合并。`);
    }finally{setImportBusy(false);}
  }
  function locate(memory:Memory){const star=starMap[memory.starId];if(!star)return;setDetail(null);setSelectedStar(star);if(page!=='sky'){focusAfterMount.current=star.id;navigate('sky');}else sky.current?.focus(star.id);}
  async function save(draft:MemoryDraft,id?:string){
    let next:Memory[];
    if(user){const result=id?await api.update(id,draft):await api.create(draft);next=id?memories.map(m=>m.id===id?result.memory:m):[...memories,result.memory];}
    else{const memory={...draft,id:id||crypto.randomUUID(),createdAt:editing?.createdAt||new Date().toISOString()};next=id?memories.map(m=>m.id===id?memory:m):[...memories,memory];saveGuestMemories(next);}
    setMemories(next);setModal(null);setEditing(undefined);setToast(id?'这面镜，已更新。':'已珍藏。你的星空，又亮了一点。');navigate('shelf');
  }
  async function remove(memory:Memory){if(user)await api.remove(memory.id);const next=memories.filter(m=>m.id!==memory.id);if(!user)saveGuestMemories(next);setMemories(next);setDetail(null);setToast('这段记忆已删除。');}
  async function logout(){if(favoriteBusy||importBusy)return;try{await api.logout();setUser(null);setMemories(readGuestMemories(demoMemories));setFavorites(readFavorites());setDetail(null);setToast('已退出，期待下一次相见。');}catch(e){setToast(e instanceof Error?e.message:'退出失败，请重试');}}
  function exportMemories(){
    if(!ready){setToast('正在载入你的星空，请稍候。');return;}
    const parts=createBackupParts(memories,favorites);
    if(parts.length===1){downloadBackup(parts[0].contents,`镜留-我的回忆-${localDate()}.json`);setToast('回忆、照片与收藏已打包。');}
    else{setBackupParts(parts);setModal('export');}
  }
  async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await skySection.current?.requestFullscreen();}catch{setToast('当前浏览器暂不支持全屏，可横屏体验星空。');}}
  const selectedMemories=selectedStar?memories.filter(m=>m.starId===selectedStar.id):[];
  return <div className={`app page-${page}`}>
    <header className="site-header"><button className="brand" onClick={()=>navigate('sky')} aria-label="镜留首页"><MirrorLogo/><span className="brand-name">镜留<small>J I N G L I U</small></span><span className="brand-divider"/><span className="brand-tagline">每一刻，都有回响</span></button><nav className="desktop-nav" aria-label="主导航"><button className={page==='sky'?'active':''} aria-current={page==='sky'?'page':undefined} onClick={()=>navigate('sky')}><Orbit size={17}/> 星海漫游</button><button className={page==='shelf'?'active':''} aria-current={page==='shelf'?'page':undefined} onClick={()=>navigate('shelf')}><BookHeart size={17}/> 留下的镜<span className="nav-count">{memories.length}</span></button></nav><div className="header-actions"><button className="header-create" onClick={newMemory}><Plus size={15}/> 留下一刻</button><span className="header-divider"/><button className={`profile-button ${page==='profile'?'active':''}`} onClick={()=>navigate('profile')} aria-label="我的空间"><span className="avatar"><UserRound size={17} strokeWidth={1.5}/></span><span>{user?user.name:'我的空间'}</span></button></div></header>
    {page==='sky'&&<main className={`sky-page ${selectedStar?'has-selection':''} ${exploring?'is-exploring':''}`} ref={skySection}>
      <SkyCanvas ref={sky} favorites={favorites} density={density} starSize={starSize} onVisibleChange={setVisibleCount} onRegionChange={setActiveRegion} memories={memories} lines={lines} labels={labels} grid={grid} landscape={landscape} selectedId={selectedStar?.id||null} onSelect={selectStar} onViewChange={setFov} onInteract={()=>setExploring(true)}/>
      <div className="sky-topline"><span><span className="live-dot"/> 让记忆，在星空中有迹可循</span><span className="sky-edition">20,000 STARS / FOUR SEASONS</span></div>
      <div className="sky-intro"><div className="sky-eyebrow"><span/> A MOMENT, A STAR.</div><h1>总有一束光，<br/>记得<span>你来过。</span></h1><p>有些瞬间，值得一整个宇宙来收藏。<br/>在星海里漫游，与过去的自己重逢。</p><button className="sky-primary" onClick={newMemory}>留住此刻 <Plus size={17}/></button><div className="sky-tiny-note"><span/> 你的故事，是这里最特别的星光</div></div>
      <div className="sky-search"><SearchBox memories={memories} onExplore={()=>openAtlas()} onStar={selectStar} onMemory={memory=>{locate(memory);}}/><span className="search-hint">寻找星辰，也寻找记忆里的自己</span></div>
      <nav className="sky-regions" aria-label="四季星区"><div className="sky-regions-heading"><span>四时星海</span><small>20,000 颗星 · 四处归途</small></div><div className="sky-region-grid">{skyRegions.map(region=><button key={region.id} className={`sky-region region-${region.id}`} style={{'--region-color':region.color} as CSSProperties} aria-label={`${region.name}星区`} aria-pressed={activeRegion===region.id} onClick={()=>visitRegion(region)}><span className="region-spark" aria-hidden="true">✦</span><span><strong>{region.name}</strong><small>{region.english}</small><em>{region.note}</em></span><span className="region-count">{region.count.toLocaleString('zh-CN')} 颗</span></button>)}</div></nav>
      <div className="sky-mode-switch"><button className={!landscape?'active':''} aria-pressed={!landscape} onClick={()=>setLandscape(false)}><Orbit size={14}/> 星海</button><button className={landscape?'active':''} aria-pressed={landscape} onClick={()=>setLandscape(true)}><Mountain size={14}/> 旷野</button></div>
      <button className="sky-atlas-button" onClick={()=>openAtlas()}><Compass size={15}/><span>星座与收藏</span><small>88</small></button><div className="sky-toolbox"><div className="tool-group"><button aria-label="放大星图" title="放大" onClick={()=>sky.current?.zoom(1)}><Plus size={19}/></button><span/><button aria-label="缩小星图" title="缩小" onClick={()=>sky.current?.zoom(-1)}><Minus size={19}/></button></div><button className="sky-tool" aria-label="回到初始星空" title="回到初始星空" onClick={()=>{sky.current?.reset();setSelectedStar(null);setExploring(false);}}><Crosshair size={18}/></button><button className={`sky-tool ${settings?'active':''}`} aria-label="星图设置" aria-expanded={settings} onClick={()=>setSettings(!settings)}><Settings2 size={18}/></button>{document.fullscreenEnabled&&<button className="sky-tool fullscreen-tool" aria-label={fullscreen?'退出全屏':'全屏星图'} onClick={toggleFullscreen}><Maximize2 size={17}/></button>}</div>
      {settings&&<div className="sky-settings"><div className="settings-title">让星空，合你心意<button aria-label="关闭星图设置" onClick={()=>setSettings(false)}><X size={15}/></button></div>{[{name:'星座连线',icon:<Orbit size={16}/>,value:lines,set:setLines},{name:'星体名称',icon:<Eye size={16}/>,value:labels,set:setLabels},{name:'赤道网格',icon:<Grid3X3 size={16}/>,value:grid,set:setGrid}].map(item=><button className="settings-row" key={item.name} role="switch" aria-checked={item.value} onClick={()=>item.set(!item.value)}>{item.icon}<span>{item.name}</span><i className={`switch ${item.value?'on':''}`}/></button>)}<label className="density-control">微光密度 <span>{density.toFixed(1)} 等</span><input aria-label="微光密度" type="range" min="4" max="8" step="0.5" value={density} onChange={e=>setDensity(Number(e.target.value))}/></label><label className="density-control">星点大小 <span>{starSize.toFixed(1)} 倍</span><input aria-label="星点大小" type="range" min="1" max="2.5" step="0.05" value={starSize} onChange={e=>setStarSize(Number(e.target.value))}/></label><small>当前可见 {visibleCount.toLocaleString()} 颗星 · 非实时观测视图</small></div>}
      {!selectedStar&&<button className="sky-memory-card" onClick={()=>memories.length?setDetail(memories[0]):newMemory()}><span className="memory-card-heading"><span><span className="tiny-star">✧</span> {memories.length?'来自旧时光的一封信':'写给未来的自己'}</span><ArrowUpRightIcon/></span><span className="memory-card-body"><img src={memories[0]?.photo||`/images/${memories[0]?.theme||'sunrise'}.jpg`} alt=""/><span><small>{memories[0]?memoryTags(memories[0])[0]:'从今天开始'}<span> / </span>{memories[0]?.date.replaceAll('-','.')||localDate().replaceAll('-','.')}</small><strong>{memories[0]?.title||'为自己的星空，点亮第一颗星'}</strong><span className="memory-card-link">{memories.length?'打开这面镜':'留下一面镜'} <ArrowRight size={12}/></span></span></span></button>}
      {selectedStar&&<StarPanel star={selectedStar} memories={selectedMemories} favorite={favorites.includes(selectedStar.id)} pending={favoriteBusy||!ready} onFavorite={toggleFavorite} onClose={()=>setSelectedStar(null)} onNew={newMemory} onMemory={setDetail} onSelect={selectStar}/>}
      <div className="sky-bottom"><span className="sky-status"><Compass size={14}/> {skyRegions.find(region=>region.id===activeRegion)?.name} <span className="status-separator">/</span> 视野 {fov}°</span><span className="drag-tip"><span className="mouse-icon"/> 拖动探索星空 <i/> 滚动拉近距离</span><button className="constellation-toggle" aria-pressed={lines} onClick={()=>setLines(!lines)}><span className={`toggle-dot ${lines?'on':''}`}/><span>星座连线</span></button></div>
      <div className="sky-vertical-caption">EVERY MEMORY IS A CONSTELLATION</div>
      <span className="sky-moon-caption"><Moon size={13}/> 今夜，适合想念</span>
    </main>}
    {page==='shelf'&&<Bookshelf memories={memories} onOpen={setDetail} onNew={newMemory} guest={!user}/>}
    {page==='profile'&&<Profile user={user} memories={memories} favorites={favorites} onImport={()=>setModal('import')} onExplore={()=>openAtlas('favorites')} onAuth={()=>setModal('auth')} onLogout={logout} onNew={newMemory} onShelf={()=>navigate('shelf')} onExport={exportMemories} onAbout={()=>setModal('about')}/>}
    <nav className="mobile-nav" aria-label="手机主导航"><button className={page==='sky'?'active':''} aria-current={page==='sky'?'page':undefined} onClick={()=>navigate('sky')}><Orbit size={21}/><span>星海</span></button><button className={page==='shelf'?'active':''} aria-current={page==='shelf'?'page':undefined} onClick={()=>navigate('shelf')}><BookHeart size={21}/><span>镜留</span></button><button className="mobile-add" aria-label="留下一面镜" onClick={newMemory}><Plus size={23}/></button><button className={page==='profile'?'active':''} aria-current={page==='profile'?'page':undefined} onClick={()=>navigate('profile')}><UserRound size={21}/><span>我的</span></button></nav>
    {modal==='editor'&&<MemoryEditor initial={editing} starId={selectedStar?.id} onSave={save} onClose={()=>setModal(null)}/>}
    {modal==='auth'&&<AuthModal onClose={()=>setModal(null)} onSuccess={(current,data,saved)=>{setReady(true);setUser(current);setMemories(data);setFavorites(saved);setModal(null);setToast(`欢迎，${current.name}。这里是只属于你的星空。`);}}/>}
    {modal==='atlas'&&<Modal title="星座与收藏" onClose={()=>setModal(null)} className="atlas-modal"><StarExplorer initialTab={atlasTab} favorites={favorites} onSelect={selectStar} onVisit={visitConstellation} onRandom={()=>{selectStar(stars[Math.floor(Math.random()*stars.length)]);setExploring(true);}}/></Modal>}
    {modal==='import'&&<Modal title="导入回忆备份" onClose={()=>{if(!importBusy)setModal(null);}} className="backup-modal"><BackupImport existing={memories} onImport={importBackup}/></Modal>}
    {modal==='export'&&<Modal title="下载回忆备份" onClose={()=>{setModal(null);setBackupParts([]);}} className="backup-modal"><div className="backup-import"><span className="modal-eyebrow"><ArrowDownToLine size={14}/> KEEP EVERY MOMENT</span><h2>每一段回忆，都带走。</h2><p>回忆较多，已整理成 {backupParts.length} 份备份。请逐份下载；恢复时可按任意顺序导入。星星收藏在第一份里。</p><div className="backup-parts">{backupParts.map((part,index)=><button key={index} onClick={()=>downloadBackup(part.contents,`镜留-我的回忆-${localDate()}-${index+1}共${backupParts.length}份.json`)}><ArrowDownToLine size={17}/><span>下载第 {index+1} 份 <small>{part.count} 段记忆</small></span></button>)}</div></div></Modal>}
    {modal==='about'&&<Modal title="关于镜留" onClose={()=>setModal(null)} className="about-modal"><MirrorLogo/><div className="eyebrow">ABOUT JINGLIU</div><h2>每一刻，都有回响。</h2><p>镜，是看见自己；留，是珍藏时光。</p><p>我们想为每一个人，留一小片安静的宇宙。把成长、相遇和普通日子里的微光，放进画框，寄在星辰。</p><div className="about-note"><Telescope size={20}/><p>星海收录 {catalogStats.total.toLocaleString()} 颗真实恒星与 {catalogStats.constellations} 个星座，使用 HYG v4.0 的 J2000 赤道坐标。点击星星可查看档案、收藏或寄存回忆；放大星空会显示更多微光。这是一张自由星图，不提供实时天象或观测方位预测。</p></div><button className="primary-button" onClick={()=>setModal(null)}>继续拾光 <ArrowRight size={16}/></button></Modal>}
    {detail&&<MemoryDetail memory={detail} onClose={()=>setDetail(null)} onEdit={()=>{setEditing(detail);setDetail(null);setModal('editor');}} onDelete={()=>remove(detail)} onLocate={()=>locate(detail)}/>}
    {toast&&<div className="toast" role="status"><Check size={17}/><span>{toast}</span><button aria-label="关闭提示" onClick={()=>setToast('')}><X size={15}/></button></div>}
  </div>;
}
