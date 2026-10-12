import { test, expect } from '@playwright/test';

test('sky search, memory lookup, settings and viewport controls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/总有一束光/})).toBeVisible();
  const search=page.getByRole('textbox',{name:'搜索星星或记忆'});
  await search.fill('织女');
  await page.getByRole('button',{name:/织女星.*Vega/}).click();
  await expect(page.getByRole('complementary',{name:'织女星的详情'})).toBeVisible();
  await expect(page.getByText('视野 42°',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'关闭星体详情'}).click();
  await search.fill('18岁');
  await page.locator('#search-results').getByRole('button',{name:/十八岁，风是自由的/}).click();
  await expect(page.getByRole('complementary',{name:'毕宿五的详情'})).toBeVisible();
  await page.getByRole('button',{name:'回到初始星空'}).click();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.getByRole('button',{name:'星图设置',exact:true}).click();
  await page.getByRole('switch',{name:'赤道网格'}).click();
  await expect(page.getByRole('switch',{name:'赤道网格'})).toHaveAttribute('aria-checked','true');
  await page.getByRole('button',{name:'旷野',exact:true}).click();
  await expect(page.getByRole('button',{name:'旷野',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'关闭星图设置'}).click();
  await page.getByRole('button',{name:'放大星图'}).click();
  await expect(page.locator('.sky-status')).toContainText('51°');
  await page.getByRole('button',{name:'回到初始星空'}).click();
  await expect(page.locator('.sky-status')).toContainText('66°');
  if(test.info().project.name==='mobile') {
    const box=await page.locator('canvas').boundingBox();
    expect(box!.y+box!.height).toBeLessThanOrEqual((await page.locator('.mobile-nav').boundingBox())!.y+1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('guest can create, reload, edit, filter, locate and delete a memory',async({page})=>{
  await Promise.all([page.waitForResponse(response=>response.url().endsWith('/api/auth/me')),page.goto('/#shelf')]);
  await page.getByRole('button',{name:'留下一面镜',exact:true}).first().click();
  await page.getByLabel('给回忆起个名字').fill('浏览器里的流星');
  await page.getByLabel('想对未来的自己说').fill('有一天，我会记得今天的星空。');
  await page.getByLabel('属于哪种心情').selectOption('旅行');
  await page.getByLabel('人生标签').fill('第一次露营');
  await page.getByRole('button',{name:'星夜',exact:true}).click();
  await page.getByLabel('让一颗星，替你记住').selectOption('vega');
  await page.getByRole('button',{name:'珍藏这一刻',exact:true}).click();
  await expect(page.getByRole('button',{name:'打开记忆：浏览器里的流星'})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'旅行',exact:true}).click();
  await expect(page.getByRole('button',{name:'打开记忆：浏览器里的流星'})).toBeVisible();
  await expect(page.getByRole('button',{name:'打开记忆：十八岁，风是自由的'})).toHaveCount(0);
  await page.getByRole('button',{name:'打开记忆：浏览器里的流星'}).click();
  await expect(page.getByRole('dialog').getByText('第一次露营',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'编辑',exact:true}).click();
  await page.getByLabel('给回忆起个名字').fill('更新后的流星');
  await page.getByRole('button',{name:'保存这面镜',exact:true}).click();
  await page.getByRole('button',{name:'打开记忆：更新后的流星'}).click();
  await page.getByRole('button',{name:'这段记忆，住在 织女星'}).click();
  await expect(page.getByRole('complementary',{name:'织女星的详情'})).toBeVisible();
  await page.getByRole('button',{name:'寄存在这里的回忆 更新后的流星'}).click();
  await page.getByRole('button',{name:'删除这段记忆'}).click();
  await page.getByRole('button',{name:'确认删除',exact:true}).click();
  await page.goto('/#shelf');
  await expect(page.getByRole('button',{name:'打开记忆：更新后的流星'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('registration creates a private space and data persists through login',async({page})=>{
  const email=`browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  await page.goto('/#profile');
  await page.getByRole('button',{name:'拥有我的星空'}).click();
  await page.getByLabel('怎么称呼你').fill('星空旅人');
  await page.getByLabel('邮箱',{exact:true}).fill(email);
  await page.getByLabel('密码',{exact:true}).fill('jingliu-test-2026');
  await page.getByRole('button',{name:'开启我的星空'}).click();
  await expect(page.getByRole('heading',{name:'星空旅人的星空'})).toBeVisible();
  await page.getByRole('button',{name:/留下一面新的镜/}).click();
  await page.getByLabel('给回忆起个名字').fill('只属于我的回忆');
  await page.getByLabel('想对未来的自己说').fill('这面镜保存在我的账号里。');
  await page.getByRole('button',{name:'珍藏这一刻'}).click();
  await expect(page.getByRole('button',{name:'打开记忆：只属于我的回忆'})).toBeVisible();
  await expect(page.getByRole('button',{name:'打开记忆：十八岁，风是自由的'})).toHaveCount(0);
  await page.goto('/#profile');
  await page.getByRole('button',{name:'退出登录'}).click();
  await expect(page.getByRole('heading',{name:'你好，拾光的人。'})).toBeVisible();
  await page.getByRole('button',{name:'拥有我的星空'}).click();
  await page.getByRole('button',{name:'已有账号'}).click();
  await page.getByLabel('邮箱',{exact:true}).fill(email);
  await page.getByLabel('密码',{exact:true}).fill('jingliu-test-2026');
  await page.getByRole('button',{name:'回到我的星空'}).click();
  await expect(page.getByRole('heading',{name:'星空旅人的星空'})).toBeVisible();
  await page.getByRole('button',{name:/我的记忆书架/}).click();
  await page.getByRole('button',{name:'打开记忆：只属于我的回忆'}).click();
  await expect(page.getByText('这面镜保存在我的账号里。')).toBeVisible();
  await page.getByRole('button',{name:'删除这段记忆'}).click();
  await page.getByRole('button',{name:'确认删除',exact:true}).click();
});

test('screenshots of sky and shelf',async({page},testInfo)=>{
  await page.goto('/');
  await page.waitForTimeout(1600);
  await page.screenshot({path:`.artifacts/${testInfo.project.name}-sky.png`,fullPage:true});
  await page.goto('/#shelf');
  await page.locator('.frame-picture img').first().waitFor();
  await page.screenshot({path:`.artifacts/${testInfo.project.name}-shelf.png`,fullPage:true});
});
