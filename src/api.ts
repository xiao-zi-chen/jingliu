import type { Memory, MemoryDraft, User } from './types';
import { isAndroidApp } from './platform';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type':'application/json', ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '暂时无法连接，请稍后再试');
  return data;
}

export const api = {
  favorites: () => request<{favorites:string[]}>('/favorites'),
  favorite: (id:string,save:boolean) => request(`/favorites/${encodeURIComponent(id)}`,{method:save?'PUT':'DELETE',body:'{}'}),
  importBackup: (memories:Memory[],favorites:string[]=[]) => request<{memories:Memory[];favorites:string[];imported:number;skipped:number}>('/memories/import',{method:'POST',body:JSON.stringify({memories,favorites})}),
  profile: (name:string) => request<{user:User}>('/profile',{method:'PATCH',body:JSON.stringify({name})}),
  password: (currentPassword:string,newPassword:string) => request('/auth/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})}),
  me: () => isAndroidApp ? Promise.resolve({user:null}) : request<{ user: User | null }>('/auth/me'),
  auth: (mode: 'login' | 'register', values: {email:string; password:string; name?:string}) => request<{user:User}>(`/auth/${mode}`, {method:'POST', body:JSON.stringify(values)}),
  logout: () => request('/auth/logout', {method:'POST',body:'{}'}),
  memories: () => request<{memories:Memory[]}>('/memories'),
  create: (memory: MemoryDraft) => request<{memory:Memory}>('/memories', {method:'POST', body:JSON.stringify(memory)}),
  update: (id:string, memory:MemoryDraft) => request<{memory:Memory}>(`/memories/${encodeURIComponent(id)}`, {method:'PUT', body:JSON.stringify(memory)}),
  remove: (id:string) => request(`/memories/${encodeURIComponent(id)}`, {method:'DELETE',body:'{}'}),
};

const storageKey = 'jingliu.memories.v1';
export function readGuestMemories(fallback: Memory[]): Memory[] {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!Array.isArray(saved)) return fallback;
    return saved.filter((m): m is Memory => typeof m?.id === 'string' && typeof m.title === 'string' && typeof m.content === 'string' && typeof m.date === 'string' && typeof m.starId === 'string' && ['sunrise','campus','love','ocean','forest','night'].includes(m.theme) && ['成长','生活','心动','旅行'].includes(m.category));
  } catch { return fallback; }
}

export function saveGuestMemories(memories: Memory[]) {
  try{localStorage.setItem(storageKey, JSON.stringify(memories));}catch{throw new Error(isAndroidApp?'本机回忆空间不足，请先导出备份，再整理照片。':'浏览器存储空间不足。可以先导出备份，或登录账号保存更多照片。');}
}

export function saveGuestBackup(memories:Memory[],favorites:string[]) {
  const key='jingliu.favorites.v1',previous=localStorage.getItem(key);
  try{
    localStorage.setItem(key,JSON.stringify(favorites));
    saveGuestMemories(memories);
  }catch{
    // A failed localStorage write leaves that key unchanged. Roll back the small
    // favorites write as well so an import either commits both parts or neither.
    if(previous===null)localStorage.removeItem(key);else localStorage.setItem(key,previous);
    throw new Error(isAndroidApp?'本机回忆空间不足，未导入任何内容。请先备份，再整理照片。':'浏览器存储空间不足，未导入任何内容。请先备份，或登录账号后导入。');
  }
}
