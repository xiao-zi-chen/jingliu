import { test, expect } from '@playwright/test';

test('dragging, zoom gestures and fullscreen editing work on the real canvas',async({page},testInfo)=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const canvas=page.locator('canvas');
  const box=(await canvas.boundingBox())!;
  if(testInfo.project.name==='mobile') {
    const session=await page.context().newCDPSession(page);
    const y=box.y+box.height*0.58;
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.width*.35,y,id:0},{x:box.width*.65,y,id:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.width*.18,y,id:0},{x:box.width*.82,y,id:1}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>Number((await page.locator('.sky-status').innerText()).match(/(\d+)°/)?.[1])).toBeLessThan(45);
  } else {
    await page.mouse.move(box.x+box.width*.6,box.y+box.height*.55);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.7,box.y+box.height*.58,{steps:8});
    await page.mouse.up();
    await expect(page.locator('.sky-intro')).toBeHidden();
    await page.mouse.wheel(0,-300);
    await expect(page.locator('.sky-status')).toContainText('49°');
    await canvas.focus();await page.keyboard.press('Home');
    await expect(page.locator('.sky-status')).toContainText('66°');
    await page.getByRole('button',{name:'回到初始星空'}).click();
    await page.getByRole('button',{name:'全屏星图'}).click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    await page.getByRole('button',{name:'留住此刻'}).click();
    await expect(page.getByRole('dialog',{name:'留下一面镜'})).toBeVisible();
    await page.getByRole('button',{name:'关闭弹窗'}).click();
    await page.getByRole('button',{name:'退出全屏'}).click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('private database is never served by the development website',async({request})=>{
  const response=await request.get('/data/jingliu.sqlite');
  expect(response.status()).toBe(403);
});
