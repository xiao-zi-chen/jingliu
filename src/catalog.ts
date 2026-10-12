import rawCatalog from '../shared/stellar-catalog.json';
import { featuredStars } from './featured-stars';
import type { Star } from './types';

type CatalogRow = [string,string,string,number,number,number,number|null,string,number|null,number|null,number|null,number|null,string,string];
export interface Constellation {id:string;name:string;english:string;ra:number;dec:number;fov:number;paths:string[][];count:number}
const rows=rawCatalog.stars as unknown as CatalogRow[];
const featured=new Map(featuredStars.map(star=>[star.id,star]));
export const constellations:Constellation[]=rawCatalog.constellations.map(group=>({...group,count:0}));
const groups=new Map(constellations.map(group=>[group.id.toLowerCase(),group]));
function starColor(ci:number|null){if(ci===null)return '#e6eaff';if(ci<0)return '#b9d4ff';if(ci<.3)return '#d8e5ff';if(ci<.65)return '#f7f2e6';if(ci<1.1)return '#ffe4b5';if(ci<1.6)return '#ffcd9e';return '#ffb790';}
function readStar([id,proper,con,ra,dec,mag,parsecs,spectral,ci,hip,hd,hr,bayer,flam]:CatalogRow):Star{
  const original=featured.get(id);
  const group=groups.get(con.toLowerCase());
  const designation=hip?`HIP ${hip}`:hd?`HD ${hd}`:id.toUpperCase().replace('-',' ');
  const name=original?.name||proper||designation;
  const english=original?.english||proper||designation;
  const distanceLY=parsecs?parsecs*3.26156:null;
  const distance=distanceLY?`约 ${Math.round(distanceLY).toLocaleString('zh-CN')} 光年`:'距离待测';
  const aliases=[name,english,designation,hip?`HIP ${hip}`:'',hd?`HD ${hd}`:'',hr?`HR ${hr}`:'',bayer?`${bayer} ${con}`:'',flam?`${flam} ${con}`:'',group?.english||'',con,original?.constellation||group?.name||'',con==='UMa'?'北斗七星':''].filter(Boolean);
  return {id,name,english,constellation:original?.constellation||group?.name||'星空',constellationId:group?.id||con,ra,dec,mag,color:original?.color||starColor(ci),distance,description:original?.description||`${name} 是${group?.name||'星表'}中的一颗恒星。它也可以成为你的记忆坐标，把某一天的心情，寄存在这束光里。`,hip:hip||undefined,hd:hd||undefined,hr:hr||undefined,spectral,distanceLY,aliases};
}
export const stars:Star[]=rows.map(readStar);
for(const star of stars){const group=groups.get(star.constellationId?.toLowerCase()||'');if(group)group.count++;}
const archivedRows=new Map((rawCatalog.archivedStars as unknown as CatalogRow[]).map(row=>[row[0],row]));
const activeMap:Record<string,Star>=Object.assign(Object.create(null),Object.fromEntries(stars.map(star=>[star.id,star])));
// Archived stars are materialized only when an old memory, favorite or backup
// references them; the normal browser and search index use the smaller catalog.
export const starMap=new Proxy(activeMap,{
  get(target,id:string){if(target[id])return target[id];const row=archivedRows.get(id);if(row){target[id]=readStar(row);return target[id];}}
});
export const catalogStats={total:stars.length,constellations:constellations.length,maxMagnitude:rawCatalog.maxMagnitude,source:rawCatalog.version,epoch:rawCatalog.epoch};
const normalize=(value:string)=>value.toLowerCase().normalize('NFKC').replace(/[\s·_\-]/g,'');
const exactIndex=new Map<string,Star|Star[]>();
const searchIndex=stars.map(star=>{
  const aliases=[...new Set((star.aliases||[]).map(normalize))];
  for(const name of aliases){const value=exactIndex.get(name);if(!value)exactIndex.set(name,star);else if(Array.isArray(value))value.push(star);else exactIndex.set(name,[value,star]);}
  return {star,text:aliases.join('|')};
});
export function searchStars(query:string,limit=20):Star[]{
  const term=normalize(query.trim());
  if(!term)return stars.slice(0,limit);
  const value=exactIndex.get(term),exact=value?(Array.isArray(value)?value:[value]):[];
  if(exact.length>=limit)return exact.slice(0,limit);
  const result=[...exact],seen=new Set(exact.map(star=>star.id));
  for(const row of searchIndex){if(!seen.has(row.star.id)&&row.text.includes(term)){result.push(row.star);if(result.length>=limit)break;}}
  return result;
}
export function nearbyStars(star:Star,limit=4){
  const dec=star.dec*Math.PI/180;
  const result:{star:Star;distance:number}[]=[];
  for(const other of stars){
    if(other.mag>7)break;
    if(other.id===star.id)continue;
    const delta=(other.ra-star.ra)*Math.PI/12,d=other.dec*Math.PI/180;
    const dot=Math.sin(dec)*Math.sin(d)+Math.cos(dec)*Math.cos(d)*Math.cos(delta);
    if(dot<.97)continue;
    result.push({star:other,distance:Math.acos(Math.min(1,dot))*180/Math.PI});
  }
  return result.sort((a,b)=>a.distance-b.distance).slice(0,limit);
}
export function formatRA(ra:number){const total=Math.round(ra*3600)%86400;return `${Math.floor(total/3600)}h ${Math.floor(total/60)%60}m ${total%60}s`;}
export function formatDec(dec:number){const total=Math.round(Math.abs(dec)*3600);return `${dec>=0?'+':'−'}${Math.floor(total/3600)}° ${Math.floor(total/60)%60}′ ${total%60}″`;}
