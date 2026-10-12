import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('catalog stars are clickable on canvas and favorites survive reload and navigation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('搜索星星或记忆').fill('HIP 677');
  await page.locator('#search-results .search-result').first().click();
  const panel=page.getByRole('complementary',{name:'Alpheratz的详情'});
  await expect(panel).toBeVisible();
  await panel.getByText('恒星档案').click();
  await expect(panel.getByText('B9p',{exact:true})).toBeVisible();
  await expect(panel.getByText('HD 358',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'收藏这颗星',exact:true}).click();
  await expect(page.getByRole('button',{name:'取消收藏这颗星',exact:true})).toHaveAttribute('aria-pressed','true');
  await panel.getByText('附近还有这些光').click();
  await page.getByRole('button',{name:'星座与收藏 88'}).click();
  await expect(page.getByRole('dialog',{name:'星座与收藏'})).toBeVisible();
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  // Wait for the actual projection to settle, then pick the catalog star from pixels.
  await expect(page.locator('.sky-status')).toContainText('42°');
  await page.waitForTimeout(1200);
  await page.getByRole('button',{name:'关闭星体详情'}).click();
  await page.waitForTimeout(100);
  const canvas=page.locator('canvas'),box=(await canvas.boundingBox())!;
  await canvas.click({position:{x:box.width*.5,y:box.height*.5}});
  await expect(panel).toBeVisible();
  await page.reload();
  await page.goto('/#profile');
  await page.getByRole('button',{name:/我收藏的星星/}).click();
  const atlas=page.getByRole('dialog',{name:'星座与收藏'});
  await expect(atlas.getByRole('button',{name:/Alpheratz/})).toBeVisible();
  await atlas.getByRole('button',{name:/Alpheratz/}).click();
  await expect(panel).toBeVisible();
  await page.getByRole('button',{name:'取消收藏这颗星',exact:true}).click();
  await expect(page.getByRole('button',{name:'收藏这颗星',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('88 constellations can be browsed, searched and visited; sky settings persist',async({page},testInfo)=>{
  await page.goto('/');
  await page.getByRole('button',{name:'星座与收藏 88'}).click();
  const atlas=page.getByRole('dialog',{name:'星座与收藏'});
  await expect(atlas.locator('.constellation-card')).toHaveCount(88);
  await expect(atlas).toContainText('20,000 颗真实恒星');
  await atlas.getByLabel('搜索星座或收藏').fill('仙女座');
  await expect(atlas.locator('.constellation-card')).toHaveCount(1);
  await atlas.locator('.constellation-card').click();
  await expect(atlas.locator('.atlas-star-list>button').first()).toBeVisible();
  await page.screenshot({path:`.artifacts/${testInfo.project.name}-atlas.png`,fullPage:true});
  await atlas.getByRole('button',{name:'漫游这里'}).click();
  await expect(atlas).toBeHidden();
  await expect(page.locator('.sky-intro')).toBeHidden();
  await page.getByRole('button',{name:'星图设置',exact:true}).click();
  await page.getByRole('switch',{name:'赤道网格'}).click();
  await page.getByLabel('微光密度').fill('8');
  await page.getByLabel('星点大小').fill('1.8');
  await page.reload();
  await page.getByRole('button',{name:'星图设置',exact:true}).click();
  await expect(page.getByRole('switch',{name:'赤道网格'})).toHaveAttribute('aria-checked','true');
  await expect(page.getByLabel('微光密度')).toHaveValue('8');
  await expect(page.getByLabel('星点大小')).toHaveValue('1.8');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('personal photo and new star coordinate survive editing, export and a fresh browser import',async({page,browser},testInfo)=>{
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/me')),page.goto('/#shelf')]);
  await page.getByRole('button',{name:'留下一面镜',exact:true}).first().click();
  await page.getByLabel('给回忆起个名字').fill('自己的相片');
  await page.getByLabel('想对未来的自己说').fill('把这张照片交给仙女座。');
  await page.getByLabel('选择自己的照片').setInputFiles('public/images/ocean.jpg');
  await expect(page.getByAltText('自己的照片封面预览')).toBeVisible();
  await page.getByLabel('在全部星星中查找').fill('HIP 677');
  await page.getByLabel('让一颗星，替你记住').selectOption('hip-677');
  await page.getByRole('button',{name:'珍藏这一刻',exact:true}).click();
  const card=page.getByRole('button',{name:'打开记忆：自己的相片'});
  await expect(card.locator('img')).toHaveAttribute('src',/^data:image\/jpeg;base64,/);
  await page.reload();
  await card.click();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await expect(page.getByLabel('让一颗星，替你记住')).toHaveValue('hip-677');
  await expect(page.getByAltText('自己的照片封面预览')).toBeVisible();
  await page.getByRole('button',{name:'保存这面镜',exact:true}).click();
  await card.click();
  await page.getByRole('button',{name:'这段记忆，住在 Alpheratz'}).click();
  await page.getByRole('button',{name:'收藏这颗星',exact:true}).click();
  await expect(page.getByRole('button',{name:'取消收藏这颗星',exact:true})).toBeVisible();
  await page.goto('/#profile');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:/带走我的回忆/}).click();
  const download=await downloadPromise,backup=await readFile((await download.path())!);
  const data=JSON.parse(backup.toString());
  expect(data.favorites).toEqual(['hip-677']);
  expect(data.memories.find((m:{title:string})=>m.title==='自己的相片').photo).toMatch(/^data:image\/jpeg;base64,/);
  const context=await browser.newContext({viewport:page.viewportSize()!});
  try{
    const restored=await context.newPage();
    await restored.goto(new URL('/#profile',page.url()).href);
    await restored.getByRole('button',{name:/导入回忆备份/}).click();
    await restored.getByLabel('选择回忆备份文件').setInputFiles({name:'镜留备份.json',mimeType:'application/json',buffer:backup});
    await expect(restored.locator('.backup-counts')).toContainText('1段新记忆');
    await restored.screenshot({path:`.artifacts/${testInfo.project.name}-backup.png`,fullPage:true});
    await restored.getByRole('button',{name:'确认导入',exact:true}).click();
    await expect(restored.getByRole('dialog')).toBeHidden();
    await restored.reload();
    await restored.getByRole('button',{name:/我收藏的星星/}).click();
    await expect(restored.locator('.atlas-star-list')).toContainText('Alpheratz');
    await restored.getByRole('button',{name:'关闭弹窗'}).click();
    await restored.getByRole('button',{name:/导入回忆备份/}).click();
    await restored.getByLabel('选择回忆备份文件').setInputFiles({name:'镜留备份.json',mimeType:'application/json',buffer:backup});
    await expect(restored.locator('.backup-counts')).toContainText('0段新记忆');
    await restored.getByRole('button',{name:'关闭弹窗'}).click();
    await restored.getByRole('button',{name:/我的记忆书架/}).click();
    await expect(restored.getByRole('button',{name:'打开记忆：自己的相片'}).locator('img')).toHaveAttribute('src',/^data:image\/jpeg;base64,/);
  }finally{await context.close();}
});

test('invalid backups and exhausted browser storage do not change existing memories or favorites',async({page})=>{
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/me')),page.goto('/#profile')]);
  await page.getByRole('button',{name:/导入回忆备份/}).click();
  await page.getByLabel('选择回忆备份文件').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button',{name:'确认导入',exact:true})).toBeDisabled();
  const backup={memories:[{id:'test',createdAt:'2025-01-01',title:'从备份回来',content:'应当完整导入',date:'2025-01-01',category:'生活',theme:'night',starId:'hip-677'}],favorites:['hip-677']};
  await page.getByLabel('选择回忆备份文件').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByRole('button',{name:'确认导入',exact:true})).toBeEnabled();
  await page.evaluate(()=>{
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='jingliu.memories.v1')throw new DOMException('Full','QuotaExceededError');original.call(this,key,value);};
  });
  await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('未导入任何内容');
  expect(await page.evaluate(()=>localStorage.getItem('jingliu.favorites.v1'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('jingliu.memories.v1'))).toBeNull();
});

test('large backups split into importable files and restore in either order',async({page})=>{
  await page.addInitScript(()=>{
    const memories=Array.from({length:2001},(_,index)=>({id:`old-${index}`,createdAt:'2025-01-01T00:00:00Z',title:`记忆 ${index}`,content:'一直保留的瞬间',date:'2025-01-01',category:'生活',tag:'生活',theme:'night',starId:'vega'}));
    localStorage.setItem('jingliu.memories.v1',JSON.stringify(memories));
    localStorage.setItem('jingliu.favorites.v1',JSON.stringify(['vega']));
  });
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/auth/me')),page.goto('/#profile')]);
  await page.getByRole('button',{name:/带走我的回忆/}).click();
  const dialog=page.getByRole('dialog',{name:'下载回忆备份'});
  await expect(dialog.locator('.backup-parts>button')).toHaveCount(2);
  const parts:Buffer[]=[];
  for(let i=0;i<2;i++){
    const downloaded=page.waitForEvent('download');
    await dialog.locator('.backup-parts>button').nth(i).click();
    const buffer=await readFile((await (await downloaded).path())!);
    expect(buffer.length).toBeLessThan(24*1024*1024);
    expect(JSON.parse(buffer.toString()).memories.length).toBeLessThanOrEqual(2000);
    parts.push(buffer);
  }
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'拥有我的星空'}).click();
  await page.getByLabel('怎么称呼你').fill('备份旅人');
  await page.getByLabel('邮箱',{exact:true}).fill(`backup-${Date.now()}@example.com`);
  await page.getByLabel('密码',{exact:true}).fill('backup-password-2026');
  await page.getByRole('button',{name:'开启我的星空'}).click();
  await expect(page.getByRole('heading',{name:'备份旅人的星空'})).toBeVisible();
  await page.getByRole('button',{name:/我收藏的星星/}).click();
  await expect(page.getByText('还没有收藏的星星',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  for(const buffer of parts.reverse()){
    await page.getByRole('button',{name:/导入回忆备份/}).click();
    await page.getByLabel('选择回忆备份文件').setInputFiles({name:'part.json',mimeType:'application/json',buffer});
    await page.getByRole('button',{name:'确认导入',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await expect(page.locator('.profile-stats>div').first()).toContainText('2001');
  await page.getByRole('button',{name:/我收藏的星星/}).click();
  await expect(page.locator('.atlas-star-list')).toContainText('织女星');
  await page.getByRole('button',{name:'关闭弹窗'}).click();
  await page.getByRole('button',{name:'退出登录'}).click();
  await expect(page.getByRole('heading',{name:'你好，拾光的人。'})).toBeVisible();
  await page.getByRole('button',{name:/我收藏的星星/}).click();
  await expect(page.locator('.atlas-star-list')).toContainText('织女星');
});

test('photo-heavy exports also respect the byte limit',async({page})=>{
  await page.goto('/#profile');
  const result=await page.evaluate(async()=>{
    // Exercise the export format without filling localStorage or transferring a
    // 25 MB fixture from the test runner into the browser.
    const source='/src/memory-utils.ts';
    const {createBackupParts,parseBackup}=await import(/* @vite-ignore */source);
    const memories=Array.from({length:25},(_,index)=>({id:`photo-${index}`,createdAt:'2025-01-01T00:00:00Z',title:`照片 ${index}`,content:'一起留下',date:'2025-01-01',category:'生活',tag:'生活',theme:'night',starId:'hip-677',photo:'data:image/jpeg;base64,/9j/'+ 'A'.repeat(999900)}));
    return createBackupParts(memories,['hip-677']).map((part:{contents:string})=>({bytes:new TextEncoder().encode(part.contents).byteLength,count:parseBackup(JSON.parse(part.contents)).memories.length}));
  });
  expect(result).toHaveLength(2);
  expect(result.every((part:{bytes:number})=>part.bytes<24*1024*1024)).toBe(true);
  expect(result.reduce((count:number,part:{count:number})=>count+part.count,0)).toBe(25);
});

test('faint stars removed from normal browsing still locate saved memories and favorites',async({page},testInfo)=>{
  const catalog=JSON.parse(await readFile('shared/stellar-catalog.json','utf8'));
  const row=catalog.archivedStars[0],id=row[0],name=row[1]||`HIP ${row[9]}`;
  await page.addInitScript(({id})=>{
    localStorage.setItem('jingliu.memories.v1',JSON.stringify([{id:'old-faint-memory',title:'那颗微弱的星',date:'2025-01-01',category:'生活',tag:'从前',content:'以前留下的坐标一直都在。',theme:'night',starId:id,createdAt:'2025-01-01T00:00:00Z'}]));
    localStorage.setItem('jingliu.favorites.v1',JSON.stringify([id]));
  },{id});
  await page.goto('/#shelf');
  await page.getByRole('button',{name:'打开记忆：那颗微弱的星'}).click();
  await page.getByRole('button',{name:`这段记忆，住在 ${name}`}).click();
  await expect(page.getByRole('complementary',{name:`${name}的详情`})).toBeVisible();
  await expect(page.getByRole('button',{name:'取消收藏这颗星',exact:true})).toBeVisible();
  await expect(page.locator('.sky-status')).toContainText('42°');
  await page.waitForTimeout(1100);
  await page.getByRole('button',{name:'关闭星体详情'}).click();
  await page.waitForTimeout(100);
  const canvas=page.locator('canvas'),box=(await canvas.boundingBox())!;
  await canvas.click({position:{x:box.width*.5,y:box.height*.5}});
  await expect(page.getByRole('complementary',{name:`${name}的详情`})).toBeVisible();
});

test('stationary sky stops drawing and responds again to zoom and size changes',async({page})=>{
  await page.addInitScript(()=>{
    (window as unknown as {skyPaints:number}).skyPaints=0;
    const original=CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect=function(x,y,width,height){
      if(this.canvas.classList.contains('sky-canvas')&&x===0&&y===0&&width>0&&height>0)(window as unknown as {skyPaints:number}).skyPaints++;
      original.call(this,x,y,width,height);
    };
  });
  await page.goto('/');
  await page.waitForFunction(()=>(window as unknown as {skyPaints:number}).skyPaints>0);
  await page.waitForTimeout(300);
  const count=()=>page.evaluate(()=>(window as unknown as {skyPaints:number}).skyPaints);
  const first=await count();await page.waitForTimeout(400);expect(await count()).toBe(first);
  await page.getByLabel('搜索星星或记忆').fill('织女星');
  await page.locator('#search-results .search-result').first().click();
  await expect(page.locator('.sky-status')).toContainText('42°');
  await page.waitForTimeout(1100);
  const selected=await count();await page.waitForTimeout(400);expect(await count()).toBe(selected);
  await page.getByRole('button',{name:'星图设置',exact:true}).click();
  await page.getByLabel('星点大小').fill('1.9');
  await expect.poll(count).toBeGreaterThan(selected);
  await page.getByRole('button',{name:'关闭星图设置'}).click();
  await page.getByRole('button',{name:'放大星图'}).click();
  await expect(page.locator('.sky-status')).toContainText('33°');
});
