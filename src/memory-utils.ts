import { isAndroidApp } from './platform';
import { parseMemoryDraft, memoryFingerprint } from '../shared/memory-validation.mjs';
import { starMap } from './catalog';
import type { Memory } from './types';
export { memoryFingerprint };
export interface BackupPart {contents:string;count:number}
export function createBackupParts(memories:Memory[],favorites:string[]):BackupPart[]{
  const encoder=new TextEncoder(),parts:BackupPart[]=[],exportedAt=new Date().toISOString();
  let entries:string[]=[],size=0;
  // Leave room for the envelope and favorites. Each file remains importable on
  // its own even after years of collecting photos or thousands of memories.
  function flush(){
    const metadata=JSON.stringify({app:'镜留',version:2,exportedAt,favorites:parts.length?[]:favorites});
    parts.push({contents:metadata.slice(0,-1)+',"memories":['+entries.join(',')+']}',count:entries.length});
    entries=[];size=0;
  }
  for(const memory of memories){
    const serialized=JSON.stringify(memory),bytes=encoder.encode(serialized).byteLength+1;
    if(entries.length&&(entries.length>=2000||size+bytes>22*1024*1024))flush();
    entries.push(serialized);size+=bytes;
  }
  if(entries.length||!parts.length)flush();
  return parts;
}
export function downloadBackup(contents:string,filename:string){
  if(isAndroidApp){window.JingliuAndroid!.exportBackup(contents,filename);return;}
  const url=URL.createObjectURL(new Blob([contents],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function parseBackup(value:unknown):{memories:Memory[];favorites:string[]}{
  if(!value||typeof value!=='object'||!('memories' in value)||!Array.isArray(value.memories))throw new Error('这不是镜留的回忆备份，请选择从「带走我的回忆」导出的 JSON 文件。');
  if(value.memories.length>2000)throw new Error('一次最多导入 2000 段记忆。');
  const memories=value.memories.map((raw:unknown,index:number)=>{
    const parsed=parseMemoryDraft(raw,id=>!!starMap[id]);
    if(!parsed)throw new Error(`第 ${index+1} 段记忆的日期、内容、照片或星星编号不完整，请检查备份。`);
    const row=raw as Record<string,unknown>;
    return {...parsed,id:typeof row.id==='string'&&row.id.length<=100?row.id:crypto.randomUUID(),createdAt:typeof row.createdAt==='string'&&Number.isFinite(Date.parse(row.createdAt))?row.createdAt:new Date().toISOString()};
  });
  const rawFavorites='favorites' in value?value.favorites:[];
  if(!Array.isArray(rawFavorites)||rawFavorites.length>50000||rawFavorites.some(id=>typeof id!=='string'||!starMap[id]))throw new Error('备份中的星星收藏包含无法识别的编号，或超出导入限制。');
  return {memories,favorites:[...new Set(rawFavorites as string[])]};
}
export function mergeMemories(existing:Memory[],incoming:Memory[]){
  const seen=new Set(existing.map(memoryFingerprint)),usedIds=new Set(existing.map(m=>m.id));
  const added:Memory[]=[];
  for(const memory of incoming){const key=memoryFingerprint(memory);if(seen.has(key))continue;seen.add(key);const id=usedIds.has(memory.id)?crypto.randomUUID():memory.id;usedIds.add(id);added.push({...memory,id});}
  return {memories:[...existing,...added],imported:added.length,skipped:incoming.length-added.length};
}
export async function preparePhoto(file:File):Promise<string>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('请选择 JPG、PNG 或 WebP 照片。');
  if(file.size>12*1024*1024)throw new Error('这张照片超过 12 MB，换一张小一点的照片吧。');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    if(!image.naturalWidth||!image.naturalHeight)throw new Error('无法读取这张照片，请重新选择。');
    const ratio=Math.min(1,1400/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f5f1e5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    let quality=.8,data=canvas.toDataURL('image/jpeg',quality);
    while(data.length>450000&&quality>.35){quality-=.1;data=canvas.toDataURL('image/jpeg',quality);}
    if(data.length>1000000)throw new Error('照片处理后仍然太大，请选择尺寸更小的照片。');
    return data;
  }catch(error){throw error instanceof Error?error:new Error('无法读取照片，请换一张试试。');}finally{URL.revokeObjectURL(url);}
}
