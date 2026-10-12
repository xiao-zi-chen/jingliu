from pathlib import Path
import csv,json,re,math,shutil
root=Path.cwd(); raw=root/'.artifacts/catalog-source'
rows=list(csv.DictReader((raw/'hyg-hygdata_v40.csv').open(encoding='utf-8')))
for limit in [6.5,7,7.5,8]: print('mag',limit,':',sum(1 for r in rows if r['id']!='0' and r['mag'] and float(r['mag'])<=limit))
print('fields:',list(rows[0]))
src=(root/'src/featured-stars.ts').read_text(encoding='utf-8')
legacy=[]
for line in src.splitlines():
 m=re.search(r"id:'([^']+)'.*?ra:([\d.-]+), dec:([\d.-]+)",line)
 if m:legacy.append((m[1],float(m[2]),float(m[3])))
western=json.loads((raw/'western.json').read_text(encoding='utf-8'))['constellations']
required={str(hip) for g in western for line in g['lines'] for hip in line}
selected=[r for r in rows if r['id']!='0' and r['mag'] and (float(r['mag'])<=8 or r['hip'] in required)]
def vec(ra,dec):
 a=math.radians(ra*15);d=math.radians(dec)
 return math.cos(d)*math.cos(a),math.cos(d)*math.sin(a),math.sin(d)
positions=[vec(float(r['ra']),float(r['dec'])) for r in selected]
legacy_indices={}
for id,ra,dec in legacy:
 v=vec(ra,dec)
 best=max(range(len(selected)),key=lambda i:sum(a*b for a,b in zip(v,positions[i])))
 delta=math.degrees(math.acos(min(1,sum(a*b for a,b in zip(v,positions[best])))))
 assert delta<.05,(id,delta)
 assert best not in legacy_indices,(id,legacy_indices.get(best))
 legacy_indices[best]=id
names={f['id'].lower():f['properties'] for f in json.loads((raw/'constellation-names.json').read_text(encoding='utf-8'))['features']}
compact=[];hip_to_id={};id_to_row={}
for i,r in enumerate(selected):
 id=legacy_indices.get(i) or ('hip-'+r['hip'] if r['hip'] else 'hyg-'+r['id'])
 if id in id_to_row:id='hyg-'+r['id']
 dist=float(r['dist']) if r['dist'] and float(r['dist'])<99999 else None
 item=[id,r['proper'],r['con'],round(float(r['ra']),6),round(float(r['dec']),6),float(r['mag']),round(dist,3) if dist else None,r['spect'],float(r['ci']) if r['ci'] else None,int(r['hip']) if r['hip'] else None,int(r['hd']) if r['hd'] else None,int(r['hr']) if r['hr'] else None,r['bayer'],r['flam']]
 compact.append(item);id_to_row[id]=item
 if r['hip']:hip_to_id.setdefault(r['hip'],id)
compact.sort(key=lambda r:(r[5],r[0]))
groups=[];missing=[]
for g in western:
 code=g['iau'];n=names[code.lower()];code=n['desig']
 paths=[]
 for line in g['lines']:
  run=[]
  for hip in line:
   id=hip_to_id.get(str(hip))
   if id:run.append(id)
   else:
    missing.append(hip)
    if len(run)>1:paths.append(run)
    run=[]
  if len(run)>1:paths.append(run)
 ids=list(dict.fromkeys(id for line in paths for id in line))
 vectors=[vec(id_to_row[id][3],id_to_row[id][4]) for id in ids]
 avg=[sum(v[j] for v in vectors)/len(vectors) for j in range(3)]
 norm=math.sqrt(sum(x*x for x in avg));avg=[x/norm for x in avg]
 ra=math.degrees(math.atan2(avg[1],avg[0]))/15%24;dec=math.degrees(math.asin(avg[2]))
 spread=max(math.degrees(math.acos(max(-1,min(1,sum(a*b for a,b in zip(v,avg)))))) for v in vectors)
 groups.append({'id':code,'name':n['zh'],'english':n['name'],'ra':round(ra,4),'dec':round(dec,4),'fov':round(max(25,min(95,spread*2.7))),'paths':paths})
assert len(groups)==88
out=root/'shared';out.mkdir(exist_ok=True)
active_ids={id for id,_,_ in legacy}|{id for g in groups for line in g['paths'] for id in line}
for row in compact:
 if len(active_ids)>=20000:break
 active_ids.add(row[0])
active=[row for row in compact if row[0] in active_ids]
archived=[row for row in compact if row[0] not in active_ids]
data={'version':'HYG v4.0','epoch':'J2000','maxMagnitude':max(row[5] for row in active),'stars':active,'archivedStars':archived,'constellations':groups}
(out/'stellar-catalog.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
license_dir=root/'public/catalog-credits';license_dir.mkdir(exist_ok=True)
shutil.copyfile(raw/'hyg-readme.md',license_dir/'HYG-README.md')
shutil.copyfile(raw/'western-description.md',license_dir/'Stellarium-western.md')
print('Saved',len(active),'stars,',len(archived),'archived stars and',len(groups),'constellations;',len(missing),'missing line vertices')
print('Size:',(out/'stellar-catalog.json').stat().st_size)
