import express from 'express';
import catalog from '../shared/stellar-catalog.json' with { type:'json' };
import { parseMemoryDraft, memoryFingerprint } from '../shared/memory-validation.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const deriveKey = promisify(scrypt);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const SESSION_DAYS = 30;
const starIds = new Set([...catalog.stars,...catalog.archivedStars].map(row=>row[0]));
const tokenHash = token => createHash('sha256').update(token).digest('hex');
const publicUser = user => ({ id:user.id, email:user.email, name:user.name, createdAt:user.created_at });
const publicMemory = memory => ({ id:memory.id, title:memory.title, date:memory.date, category:memory.category, tag:memory.tag||memory.category, content:memory.content, theme:memory.theme, starId:memory.star_id, createdAt:memory.created_at, ...(memory.photo?{photo:memory.photo}:{}) });

function sessionToken(req) {
  const value = (req.headers.cookie || '').split(';').map(c=>c.trim()).find(c=>c.startsWith('jingliu_session='));
  const token=value?.slice('jingliu_session='.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function validateDraft(body){return parseMemoryDraft(body,id=>starIds.has(id));}

export function createApp({databasePath=process.env.DATABASE_PATH||path.join(projectRoot,'data','jingliu.sqlite'),secureCookies=process.env.COOKIE_SECURE==='true',rateLimit=30}={}) {
  if(databasePath!==':memory:') mkdirSync(path.dirname(databasePath),{recursive:true});
  const db=new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, date TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL,
      theme TEXT NOT NULL, star_id TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS memories_owner ON memories(user_id, date);
  `);
  if(!db.prepare('PRAGMA table_info(memories)').all().some(column=>column.name==='tag')) db.exec("ALTER TABLE memories ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
  if(!db.prepare('PRAGMA table_info(memories)').all().some(column=>column.name==='photo')) db.exec("ALTER TABLE memories ADD COLUMN photo TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, star_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,star_id))');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const app=express();
  app.disable('x-powered-by');
  if(process.env.TRUST_PROXY==='true') app.set('trust proxy',1);
  app.use((req,res,next)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    if(req.path.startsWith('/api')) res.setHeader('Cache-Control','no-store');
    // Browsers mark cross-site form/fetch requests. JSON-only mutations plus a Lax
    // session cookie keep this API same-origin, including behind the Vite proxy.
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      if(req.headers['sec-fetch-site']==='cross-site') return res.status(403).json({error:'请从镜留网站内操作。'});
      if(!req.is('application/json')) return res.status(415).json({error:'请求格式不正确。'});
    }
    next();
  });
  app.use('/api/memories/import',express.json({limit:'24mb'}));
  app.use(express.json({limit:'2mb'}));
  const attempts=new Map();
  function authRateLimit(req,res,next){
    const now=Date.now(), key=req.ip||'unknown';
    for(const [ip,entry] of attempts) if(entry.until<now) attempts.delete(ip);
    const entry=attempts.get(key)||{count:0,until:now+15*60*1000};
    entry.count++;attempts.set(key,entry);
    if(entry.count>rateLimit){res.setHeader('Retry-After',String(Math.ceil((entry.until-now)/1000)));return res.status(429).json({error:'尝试次数较多，请稍后再试。'});}
    next();
  }
  function currentUser(req){const token=sessionToken(req);if(!token)return null;return db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash(token),Date.now())||null;}
  function authenticate(req,res,next){req.user=currentUser(req);if(!req.user)return res.status(401).json({error:'登录已过期，请重新登录后保存。'});next();}
  function issueSession(req,res,id){
    const previous=sessionToken(req);if(previous)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(previous));
    const token=randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)').run(tokenHash(token),id,Date.now()+SESSION_DAYS*86400000);
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.cookie('jingliu_session',token,{httpOnly:true,secure:secureCookies,sameSite:'lax',path:'/',maxAge:SESSION_DAYS*86400000});
  }
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  app.get('/api/auth/me',(req,res)=>{const user=currentUser(req);res.json({user:user?publicUser(user):null});});
  app.post('/api/auth/register',authRateLimit,async(req,res)=>{
    const {email,password,name}=req.body||{};
    if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||typeof password!=='string'||password.length<8||password.length>128||typeof name!=='string'||!name.trim()||name.trim().length>24) return res.status(400).json({error:'请填写有效邮箱、1–24 字昵称及 8–128 位密码。'});
    const normalizedEmail=email.trim().toLowerCase();
    if(db.prepare('SELECT id FROM users WHERE email=?').get(normalizedEmail))return res.status(409).json({error:'这个邮箱已经注册，可以直接登录。'});
    const salt=randomBytes(16).toString('hex');
    const hash=(await deriveKey(password,salt,64)).toString('hex');
    const id=randomUUID(),createdAt=new Date().toISOString();
    try{db.prepare('INSERT INTO users (id,email,name,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?)').run(id,normalizedEmail,name.trim(),hash,salt,createdAt);}catch(error){if(db.prepare('SELECT id FROM users WHERE email=?').get(normalizedEmail))return res.status(409).json({error:'这个邮箱已经注册，可以直接登录。'});throw error;}
    issueSession(req,res,id);res.status(201).json({user:{id,email:normalizedEmail,name:name.trim(),createdAt}});
  });
  app.post('/api/auth/login',authRateLimit,async(req,res)=>{
    const {email,password}=req.body||{};
    if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>128||!password)return res.status(400).json({error:'请填写邮箱和密码。'});
    const user=db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase());
    const hash=await deriveKey(password,user?.password_salt||'0'.repeat(32),64);
    if(!user||!timingSafeEqual(hash,Buffer.from(user.password_hash,'hex'))) return res.status(401).json({error:'邮箱或密码不正确，请再试一次。'});
    issueSession(req,res,user.id);res.json({user:publicUser(user)});
  });
  app.post('/api/auth/logout',(req,res)=>{const token=sessionToken(req);if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));res.clearCookie('jingliu_session',{httpOnly:true,secure:secureCookies,sameSite:'lax',path:'/'});res.json({ok:true});});
  app.get('/api/memories',authenticate,(req,res)=>res.json({memories:db.prepare('SELECT * FROM memories WHERE user_id=? ORDER BY date,created_at').all(req.user.id).map(publicMemory)}));
  app.post('/api/memories',authenticate,(req,res)=>{
    const draft=validateDraft(req.body);if(!draft)return res.status(400).json({error:'请检查记忆内容：标题不超过 40 字，正文不超过 5000 字，并选择有效日期、分类和星星。'});
    const id=randomUUID(),createdAt=new Date().toISOString();
    db.prepare('INSERT INTO memories (id,user_id,title,date,category,tag,content,theme,star_id,created_at,photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,req.user.id,draft.title,draft.date,draft.category,draft.tag,draft.content,draft.theme,draft.starId,createdAt,draft.photo||'');
    res.status(201).json({memory:{...draft,id,createdAt}});
  });
  app.put('/api/memories/:id',authenticate,(req,res)=>{
    const draft=validateDraft(req.body);if(!draft)return res.status(400).json({error:'记忆内容不完整或格式不正确，请检查后重试。'});
    const result=db.prepare('UPDATE memories SET title=?,date=?,category=?,tag=?,content=?,theme=?,star_id=?,photo=? WHERE id=? AND user_id=?').run(draft.title,draft.date,draft.category,draft.tag,draft.content,draft.theme,draft.starId,draft.photo||'',req.params.id,req.user.id);
    if(!result.changes)return res.status(404).json({error:'这段记忆不存在。'});
    res.json({memory:publicMemory(db.prepare('SELECT * FROM memories WHERE id=? AND user_id=?').get(req.params.id,req.user.id))});
  });
  app.delete('/api/memories/:id',authenticate,(req,res)=>{const result=db.prepare('DELETE FROM memories WHERE id=? AND user_id=?').run(req.params.id,req.user.id);if(!result.changes)return res.status(404).json({error:'这段记忆不存在。'});res.json({ok:true});});
  app.get('/api/favorites',authenticate,(req,res)=>res.json({favorites:db.prepare('SELECT star_id FROM favorites WHERE user_id=? ORDER BY created_at').all(req.user.id).map(row=>row.star_id)}));
  app.put('/api/favorites/:id',authenticate,(req,res)=>{if(!starIds.has(req.params.id))return res.status(400).json({error:'找不到这颗星。'});db.prepare('INSERT OR IGNORE INTO favorites (user_id,star_id,created_at) VALUES (?,?,?)').run(req.user.id,req.params.id,new Date().toISOString());res.json({ok:true});});
  app.delete('/api/favorites/:id',authenticate,(req,res)=>{db.prepare('DELETE FROM favorites WHERE user_id=? AND star_id=?').run(req.user.id,req.params.id);res.json({ok:true});});
  app.post('/api/memories/import',authenticate,(req,res)=>{
    const incoming=req.body?.memories, favoriteIds=req.body?.favorites||[];
    if(!Array.isArray(incoming)||incoming.length>2000||!Array.isArray(favoriteIds)||favoriteIds.length>50000||favoriteIds.some(id=>!starIds.has(id)))return res.status(400).json({error:'备份格式不正确，或内容超出导入限制。'});
    const drafts=incoming.map(validateDraft);if(drafts.some(item=>!item))return res.status(400).json({error:'备份里有无效记忆，本次没有导入任何内容。'});
    const existing=db.prepare('SELECT * FROM memories WHERE user_id=?').all(req.user.id).map(publicMemory);
    const seen=new Set(existing.map(memoryFingerprint));let imported=0;
    const insert=db.prepare('INSERT INTO memories (id,user_id,title,date,category,tag,content,theme,star_id,created_at,photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const favorite=db.prepare('INSERT OR IGNORE INTO favorites (user_id,star_id,created_at) VALUES (?,?,?)');
    db.exec('BEGIN');
    try{
      for(let i=0;i<drafts.length;i++){
        const draft=drafts[i],key=memoryFingerprint(draft);if(seen.has(key))continue;seen.add(key);
        const originalDate=incoming[i].createdAt,createdAt=typeof originalDate==='string'&&Number.isFinite(Date.parse(originalDate))?originalDate:new Date().toISOString();
        insert.run(randomUUID(),req.user.id,draft.title,draft.date,draft.category,draft.tag,draft.content,draft.theme,draft.starId,createdAt,draft.photo||'');imported++;
      }
      for(const id of favoriteIds)favorite.run(req.user.id,id,new Date().toISOString());
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    res.json({imported,skipped:incoming.length-imported,memories:db.prepare('SELECT * FROM memories WHERE user_id=? ORDER BY date,created_at').all(req.user.id).map(publicMemory),favorites:db.prepare('SELECT star_id FROM favorites WHERE user_id=? ORDER BY created_at').all(req.user.id).map(row=>row.star_id)});
  });
  app.patch('/api/profile',authenticate,(req,res)=>{
    const name=req.body?.name;if(typeof name!=='string'||!name.trim()||name.trim().length>24)return res.status(400).json({error:'昵称需要 1–24 个字。'});
    db.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim(),req.user.id);res.json({user:publicUser({...req.user,name:name.trim()})});
  });
  app.post('/api/auth/password',authenticate,authRateLimit,async(req,res)=>{
    const {currentPassword,newPassword}=req.body||{};
    if(typeof currentPassword!=='string'||currentPassword.length>128||typeof newPassword!=='string'||newPassword.length<8||newPassword.length>128)return res.status(400).json({error:'新密码需要 8–128 位。'});
    const current=await deriveKey(currentPassword,req.user.password_salt,64);
    if(!timingSafeEqual(current,Buffer.from(req.user.password_hash,'hex')))return res.status(400).json({error:'当前密码不正确。'});
    const salt=randomBytes(16).toString('hex'),hash=(await deriveKey(newPassword,salt,64)).toString('hex');
    db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(hash,salt,req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.user.id);issueSession(req,res,req.user.id);res.json({ok:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'接口不存在。'}));
  const dist=path.join(projectRoot,'dist');
  if(existsSync(path.join(dist,'index.html'))){app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
  app.use((error,_req,res,_next)=>{if(error.type==='entity.too.large')return res.status(413).json({error:'内容太长，请精简后再试。'});if(error instanceof SyntaxError&&'body' in error)return res.status(400).json({error:'请求内容格式不正确。'});console.error('[jingliu]',error.message);res.status(500).json({error:'保存暂时遇到问题，请稍后重试。'});});
  return {app,db,close:()=>db.close()};
}
