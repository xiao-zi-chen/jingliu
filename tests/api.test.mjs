import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import catalog from '../shared/stellar-catalog.json' with { type:'json' };

const draft={title:'第一次看到银河',date:'2025-08-12',category:'旅行',tag:'第一次露营',content:'山顶的风很凉，星空很亮。',theme:'night',starId:'vega'};

async function fixture(t,options={}) {
  const backend=createApp({databasePath:':memory:',...options});
  const server=backend.app.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));backend.close();});
  return {backend,async request(route,method='GET',body, cookie, extraHeaders={}) {
    const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extraHeaders},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  }};
}

test('registration, login, session revocation and password storage',async t=>{
  const {request,backend}=await fixture(t);
  const registered=await request('/api/auth/register','POST',{name:'拾光者',email:' USER@example.com ',password:'secret-pass-2026'});
  assert.equal(registered.status,201);assert.equal(registered.body.user.email,'user@example.com');
  assert.ok(registered.headers.get('set-cookie').includes('HttpOnly'));assert.ok(registered.headers.get('set-cookie').includes('SameSite=Lax'));
  assert.equal(registered.body.user.password_hash,undefined);
  const stored=backend.db.prepare('SELECT password_hash,password_salt FROM users').get();
  assert.notEqual(stored.password_hash,'secret-pass-2026');assert.equal(stored.password_salt.length,32);
  assert.equal((await request('/api/auth/me','GET',undefined,registered.cookie)).body.user.name,'拾光者');
  assert.equal((await request('/api/auth/register','POST',{name:'重名',email:'user@example.com',password:'secret-pass-2026'})).status,409);
  assert.equal((await request('/api/auth/login','POST',{email:'user@example.com',password:'wrong-pass'})).status,401);
  const loggedIn=await request('/api/auth/login','POST',{email:'USER@example.com',password:'secret-pass-2026'});
  assert.equal(loggedIn.status,200);
  await request('/api/auth/logout','POST',{},loggedIn.cookie);
  assert.equal((await request('/api/memories','GET',undefined,loggedIn.cookie)).status,401);
});

test('two accounts have isolated memories across CRUD operations',async t=>{
  const {request}=await fixture(t);
  const a=await request('/api/auth/register','POST',{name:'甲',email:'a@example.com',password:'password-2026'});
  const b=await request('/api/auth/register','POST',{name:'乙',email:'b@example.com',password:'password-2026'});
  assert.equal((await request('/api/memories')).status,401);
  const created=await request('/api/memories','POST',draft,a.cookie);assert.equal(created.status,201);
  const id=created.body.memory.id;
  assert.equal(created.body.memory.tag,'第一次露营');
  assert.equal((await request('/api/memories','GET',undefined,a.cookie)).body.memories.length,1);
  assert.equal((await request('/api/memories','GET',undefined,b.cookie)).body.memories.length,0);
  assert.equal((await request(`/api/memories/${id}`,'PUT',{...draft,title:'偷改'},b.cookie)).status,404);
  assert.equal((await request(`/api/memories/${id}`,'DELETE',{},b.cookie)).status,404);
  const edited=await request(`/api/memories/${id}`,'PUT',{...draft,title:'那天的星空'},a.cookie);
  assert.equal(edited.status,200);assert.equal(edited.body.memory.title,'那天的星空');
  assert.equal(edited.body.memory.createdAt,created.body.memory.createdAt);
  assert.equal((await request(`/api/memories/${id}`,'DELETE',{},a.cookie)).status,200);
  assert.equal((await request('/api/memories','GET',undefined,a.cookie)).body.memories.length,0);
});

test('invalid dates, malformed memories and cross-site mutations are rejected',async t=>{
  const {request}=await fixture(t);
  const account=await request('/api/auth/register','POST',{name:'测试',email:'test@example.com',password:'password-2026'});
  for(const invalid of [{...draft,date:'2025-02-30'},{...draft,date:'2999-01-01'},{...draft,title:' '},{...draft,content:'x'.repeat(5001)},{...draft,starId:'unknown'},{...draft,category:'unknown'}]) assert.equal((await request('/api/memories','POST',invalid,account.cookie)).status,400);
  assert.equal((await request('/api/memories','POST',draft,account.cookie,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await request('/api/auth/register','POST',{name:'测试',email:'not-email',password:'short'})).status,400);
});

test('data and sessions survive a database reopen',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'jingliu-test-'));
  const databasePath=path.join(directory,'test.sqlite');
  const first=createApp({databasePath});
  first.db.prepare('INSERT INTO users (id,email,name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)').run('persist','persist@example.com','保留','hash','salt','2025-01-01');
  first.db.prepare('INSERT INTO memories (id,user_id,title,date,category,content,theme,star_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run('m','persist',draft.title,draft.date,draft.category,draft.content,draft.theme,draft.starId,'2025-01-01');
  first.close();
  const second=createApp({databasePath});
  t.after(()=>{second.close();rmSync(directory,{recursive:true,force:true});});
  assert.equal(second.db.prepare('SELECT title FROM memories WHERE user_id=?').get('persist').title,draft.title);
});

test('authentication requests are rate limited',async t=>{
  const {request}=await fixture(t,{rateLimit:2});
  const credentials={email:'missing@example.com',password:'password-2026'};
  assert.equal((await request('/api/auth/login','POST',credentials)).status,401);
  assert.equal((await request('/api/auth/login','POST',credentials)).status,401);
  const limited=await request('/api/auth/login','POST',credentials);assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
});

test('reduced catalog preserves legacy coordinates and complete constellation paths',()=>{
  const ids=new Set(catalog.stars.map(row=>row[0]));
  assert.equal(catalog.stars.length,20000);assert.equal(ids.size,20000);
  assert.equal(catalog.archivedStars.length,21487);
  assert.equal(new Set([...ids,...catalog.archivedStars.map(row=>row[0])]).size,41487);
  assert.ok(catalog.stars.every((row,index)=>!index||row[5]>=catalog.stars[index-1][5]));
  assert.equal(catalog.constellations.length,88);
  const legacy=readFileSync(new URL('../src/featured-stars.ts',import.meta.url),'utf8');
  const matches=[...legacy.matchAll(/id:'([^']+)'.*?ra:([\d.-]+), dec:([\d.-]+)/g)];
  assert.equal(matches.length,59);
  for(const [,id,ra,dec] of matches){
    const row=catalog.stars.find(star=>star[0]===id);assert.ok(row,id);
    assert.ok(Math.abs(row[3]-Number(ra))<.01,`${id} RA`);
    assert.ok(Math.abs(row[4]-Number(dec))<.05,`${id} Dec`);
  }
  for(const group of catalog.constellations)for(const line of group.paths)for(const id of line)assert.ok(ids.has(id),`${group.id}: ${id}`);
});

test('new catalog stars, photos and favorites persist and remain private',async t=>{
  const {request}=await fixture(t);
  const a=await request('/api/auth/register','POST',{name:'甲',email:'photo-a@example.com',password:'password-2026'});
  const b=await request('/api/auth/register','POST',{name:'乙',email:'photo-b@example.com',password:'password-2026'});
  const photo='data:image/jpeg;base64,'+readFileSync(new URL('../public/images/sunrise.jpg',import.meta.url)).toString('base64');
  const created=await request('/api/memories','POST',{...draft,starId:'hip-677',photo},a.cookie);
  assert.equal(created.status,201);
  const memory=(await request('/api/memories','GET',undefined,a.cookie)).body.memories[0];
  assert.equal(memory.photo,photo);assert.equal(memory.starId,'hip-677');
  assert.equal((await request('/api/memories','GET',undefined,b.cookie)).body.memories.length,0);
  assert.equal((await request('/api/favorites/hip-677','PUT',{})).status,401);
  assert.equal((await request('/api/favorites/unknown','PUT',{},a.cookie)).status,400);
  for(let i=0;i<2;i++)assert.equal((await request('/api/favorites/hip-677','PUT',{},a.cookie)).status,200);
  assert.deepEqual((await request('/api/favorites','GET',undefined,a.cookie)).body.favorites,['hip-677']);
  await request('/api/favorites/hip-677','DELETE',{},b.cookie);
  assert.deepEqual((await request('/api/favorites','GET',undefined,b.cookie)).body.favorites,[]);
  assert.deepEqual((await request('/api/favorites','GET',undefined,a.cookie)).body.favorites,['hip-677']);
  const updated=await request(`/api/memories/${memory.id}`,'PUT',{...draft,starId:'hip-677'},a.cookie);
  assert.equal(updated.body.memory.photo,undefined);
  await request('/api/favorites/hip-677','DELETE',{},a.cookie);
  assert.deepEqual((await request('/api/favorites','GET',undefined,a.cookie)).body.favorites,[]);
  for(const invalidPhoto of ['https://example.com/photo.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/jpeg;base64,invalid',42]){
    assert.equal((await request('/api/memories','POST',{...draft,photo:invalidPhoto},a.cookie)).status,400);
  }
});

test('backup import merges without overwriting, deduplicates and keeps changed covers and tags',async t=>{
  const {request}=await fixture(t);
  const a=await request('/api/auth/register','POST',{name:'甲',email:'import-a@example.com',password:'password-2026'});
  const b=await request('/api/auth/register','POST',{name:'乙',email:'import-b@example.com',password:'password-2026'});
  const existing=(await request('/api/memories','POST',draft,a.cookie)).body.memory;
  const photo='data:image/jpeg;base64,'+readFileSync(new URL('../public/images/sunrise.jpg',import.meta.url)).toString('base64');
  const changed={...existing,photo},newMemory={...existing,title:'保存到新星表',starId:'hip-677',createdAt:'2025-08-12T03:00:00Z'};
  const body={memories:[existing,changed,newMemory,newMemory],favorites:['hip-677','vega','vega']};
  assert.equal((await request('/api/memories/import','POST',body)).status,401);
  const result=await request('/api/memories/import','POST',body,a.cookie);
  assert.equal(result.status,200);assert.equal(result.body.imported,2);assert.equal(result.body.skipped,2);
  assert.equal(new Set(result.body.memories.map(m=>m.id)).size,3);
  assert.deepEqual(result.body.memories.find(m=>m.id===existing.id),existing);
  assert.equal(result.body.memories.find(m=>m.photo)?.photo,photo);
  assert.equal(result.body.memories.find(m=>m.starId==='hip-677')?.createdAt,newMemory.createdAt);
  const repeated=await request('/api/memories/import','POST',body,a.cookie);
  assert.equal(repeated.body.imported,0);assert.equal(repeated.body.skipped,4);
  const tagged=await request('/api/memories/import','POST',{memories:[{...existing,tag:'新的标签'}]},a.cookie);
  assert.equal(tagged.body.imported,1);
  assert.deepEqual((await request('/api/favorites','GET',undefined,a.cookie)).body.favorites.sort(),['hip-677','vega']);
  assert.deepEqual((await request('/api/favorites','GET',undefined,b.cookie)).body.favorites,[]);
  assert.equal((await request('/api/memories','GET',undefined,b.cookie)).body.memories.length,0);
});

test('invalid or failed backup imports leave both memories and favorites untouched',async t=>{
  const {request,backend}=await fixture(t);
  const a=await request('/api/auth/register','POST',{name:'甲',email:'rollback@example.com',password:'password-2026'});
  for(const body of [
    {memories:[draft,{...draft,title:'',starId:'hip-677'}],favorites:['vega']},
    {memories:[draft],favorites:['missing']},
    {memories:[draft],favorites:'vega'},
    {memories:Array(2001).fill(draft)},
  ])assert.equal((await request('/api/memories/import','POST',body,a.cookie)).status,400);
  backend.db.exec("CREATE TRIGGER import_failure BEFORE INSERT ON memories WHEN NEW.title='模拟写入失败' BEGIN SELECT RAISE(ABORT, 'test import failure'); END");
  assert.equal((await request('/api/memories/import','POST',{memories:[draft,{...draft,title:'模拟写入失败'}],favorites:['vega']},a.cookie)).status,500);
  assert.deepEqual((await request('/api/memories','GET',undefined,a.cookie)).body.memories,[]);
  assert.deepEqual((await request('/api/favorites','GET',undefined,a.cookie)).body.favorites,[]);
});

test('memories and favorites referencing removed faint stars remain restorable',async t=>{
  const {request}=await fixture(t);
  const account=await request('/api/auth/register','POST',{name:'旧星空',email:'archived@example.com',password:'password-2026'});
  const starId=catalog.archivedStars[0][0];
  const imported=await request('/api/memories/import','POST',{memories:[{...draft,starId}],favorites:[starId]},account.cookie);
  assert.equal(imported.status,200);
  assert.equal(imported.body.memories[0].starId,starId);
  assert.deepEqual(imported.body.favorites,[starId]);
  assert.equal((await request('/api/memories','GET',undefined,account.cookie)).body.memories[0].starId,starId);
});
