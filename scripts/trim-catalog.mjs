import {readFileSync,writeFileSync} from 'node:fs';

// Keep the removed rows as a compatibility archive for previously saved IDs.
// Running this again is safe: selection always starts from the complete source.
const file=new URL('../shared/stellar-catalog.json',import.meta.url);
const catalog=JSON.parse(readFileSync(file,'utf8'));
const rows=[...catalog.stars,...(catalog.archivedStars||[])].sort((a,b)=>a[5]-b[5]||a[0].localeCompare(b[0]));
const legacy=readFileSync(new URL('../src/featured-stars.ts',import.meta.url),'utf8');
const required=new Set([...legacy.matchAll(/id:'([^']+)'/g)].map(match=>match[1]));
for(const group of catalog.constellations)for(const line of group.paths)for(const id of line)required.add(id);
const selected=new Set(required);
for(const row of rows){if(selected.size>=20000)break;selected.add(row[0]);}
catalog.stars=rows.filter(row=>selected.has(row[0]));
catalog.archivedStars=rows.filter(row=>!selected.has(row[0]));
catalog.maxMagnitude=Math.max(...catalog.stars.map(row=>row[5]));
writeFileSync(file,JSON.stringify(catalog));
console.log(JSON.stringify({stars:catalog.stars.length,archived:catalog.archivedStars.length,constellations:catalog.constellations.length,maxMagnitude:catalog.maxMagnitude}));
