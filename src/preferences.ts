import { starMap } from './catalog';
import { isAndroidApp } from './platform';
export interface SkyPreferences {lines:boolean;labels:boolean;grid:boolean;landscape:boolean;density:number;starSize:number}
const defaults:SkyPreferences={lines:false,labels:false,grid:false,landscape:false,density:4.5,starSize:1.65};
export function readPreferences():SkyPreferences{try{
  const current=localStorage.getItem('jingliu.sky.v4');
  const parsed=JSON.parse(current||localStorage.getItem('jingliu.sky.v3')||localStorage.getItem('jingliu.sky.v2')||'{}');
  return {lines:current&&typeof parsed.lines==='boolean'?parsed.lines:defaults.lines,labels:current&&typeof parsed.labels==='boolean'?parsed.labels:defaults.labels,grid:current&&typeof parsed.grid==='boolean'?parsed.grid:defaults.grid,landscape:typeof parsed.landscape==='boolean'?parsed.landscape:defaults.landscape,density:typeof parsed.density==='number'&&Number.isFinite(parsed.density)?Math.max(4,Math.min(current?8:defaults.density,parsed.density)):defaults.density,starSize:typeof parsed.starSize==='number'&&Number.isFinite(parsed.starSize)?Math.max(1,Math.min(2.5,parsed.starSize)):defaults.starSize};
}catch{return defaults;}}
export function savePreferences(value:SkyPreferences){try{localStorage.setItem('jingliu.sky.v4',JSON.stringify(value));}catch{/* Browsing still works if storage is unavailable. */}}
export function readFavorites():string[]{try{const raw=JSON.parse(localStorage.getItem('jingliu.favorites.v1')||'[]');return Array.isArray(raw)?[...new Set(raw.filter((id):id is string=>typeof id==='string'&&!!starMap[id]))]:[];}catch{return [];}}
export function saveFavorites(ids:string[]){try{localStorage.setItem('jingliu.favorites.v1',JSON.stringify(ids));}catch{throw new Error(isAndroidApp?'本机回忆空间不足，收藏暂时未能保存。':'浏览器存储空间不足，收藏暂时未能保存。');}}
