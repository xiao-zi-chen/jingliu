import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const rendered = async (page: import('@playwright/test').Page) => {
  await expect(page.locator('.planet-stage')).toHaveAttribute('data-status', 'ready');
  await page.waitForTimeout(100);
};
const picture = async (page: import('@playwright/test').Page) => createHash('sha256').update(await page.locator('.planet-canvas').screenshot()).digest('hex');

// Fractional device pixels and GPU rasterization can slightly change a reset
// frame. Compare the visible result, allowing less than 1/255 average error.
async function imageDifference(page: import('@playwright/test').Page, baseline: Buffer) {
  const actual = await page.locator('.planet-canvas').screenshot();
  return page.evaluate(async ([before, after]) => {
    const pixels = await Promise.all([before, after].map(async encoded => {
      const image = new Image(); image.src = 'data:image/png;base64,' + encoded; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, 128, 128);
      return context.getImageData(0, 0, 128, 128).data;
    }));
    return pixels[0].reduce((sum, value, index) => sum + Math.abs(value - pixels[1][index]), 0) / pixels[0].length;
  }, [baseline.toString('base64'), actual.toString('base64')]);
}

test('nine distinct bodies render and the star catalog remains available', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: '行星近观', exact: true }).click();
  await expect(page).toHaveURL(/#planets$/);
  const images = new Set<string>();
  for (const name of ['土星', '地球', '木星', '月球', '火星', '海王星', '天王星', '金星', '水星']) {
    await page.getByRole('button', { name: `探索${name}`, exact: true }).click();
    await rendered(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    images.add(await picture(page));
  }
  expect(images.size).toBe(9);
  await page.getByRole('button', { name: '下一颗天体' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('土星');
  await page.getByRole('button', { name: '恒星漫游', exact: true }).click();
  const counts = await page.locator('.region-count').allTextContents();
  expect(counts.reduce((sum, text) => sum + Number(text.replace(/\D/g, '')), 0)).toBe(20000);
  await page.getByLabel('搜索星星或记忆').fill('织女星');
  await page.locator('#search-results .search-result').first().click();
  await expect(page.getByRole('complementary', { name: '织女星的详情' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('drag, pinch, zoom buttons and keyboard change the actual 3D image', async ({ page }, info) => {
  await page.goto('/#planets'); await rendered(page);
  await page.evaluate(() => document.fonts.ready);
  const canvas = page.locator('.planet-canvas');
  const baseline = await canvas.screenshot();
  const original = createHash('sha256').update(baseline).digest('hex');
  const box = (await canvas.boundingBox())!;
  if (info.project.name === 'mobile') {
    const session = await page.context().newCDPSession(page);
    const y = box.y + box.height * .5;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .35, y, id: 0 }, { x: box.x + box.width * .65, y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .17, y, id: 0 }, { x: box.x + box.width * .83, y, id: 1 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height * .65, { steps: 8 });
    await page.mouse.up();
  }
  await expect.poll(() => picture(page)).not.toBe(original);
  await page.getByRole('button', { name: '重置星球视角' }).click();
  await expect.poll(() => imageDifference(page, baseline)).toBeLessThan(1);
  await page.getByRole('button', { name: '放大星球' }).click();
  await expect.poll(() => picture(page)).not.toBe(original);
  await canvas.focus(); await page.keyboard.press('Home');
  // The focus outline is intentionally outside the model's pixels.
  await canvas.evaluate(element => (element as HTMLCanvasElement).blur());
  await expect.poll(() => imageDifference(page, baseline)).toBeLessThan(1);
  await canvas.focus(); await page.keyboard.press('ArrowRight');
  await canvas.evaluate(element => (element as HTMLCanvasElement).blur());
  await expect.poll(() => picture(page)).not.toBe(original);
});

test('3D rendering stops at rest and pauses when the app is hidden', async ({ page }) => {
  await page.addInitScript(() => {
    const runtime = window as unknown as { planetDraws: number };
    runtime.planetDraws = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function(...args) { runtime.planetDraws++; return draw.apply(this, args); };
  });
  await page.goto('/#planets'); await rendered(page);
  const draws = () => page.evaluate(() => (window as unknown as { planetDraws: number }).planetDraws);
  await page.waitForTimeout(200);
  const idle = await draws(); expect(idle).toBeGreaterThan(0);
  await page.waitForTimeout(250); expect(await draws()).toBe(idle);
  await page.getByRole('button', { name: '缓慢自转' }).click();
  await expect.poll(draws).toBeGreaterThan(idle + 5);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await draws(); await page.waitForTimeout(250); expect(await draws()).toBe(hidden);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(draws).toBeGreaterThan(hidden);
  await page.getByRole('button', { name: '缓慢自转' }).click();
  await page.waitForTimeout(100); const paused = await draws();
  await page.waitForTimeout(250); expect(await draws()).toBe(paused);
});

test('a missing map uses a disclosed simulated surface without breaking exploration', async ({ page }) => {
  await page.route('**/textures/planets/earth.webp', route => route.abort());
  await page.goto('/#planets'); await rendered(page);
  await page.getByRole('button', { name: '探索地球', exact: true }).click();
  await expect(page.locator('.planet-stage')).toHaveAttribute('data-status', 'simulated');
  await expect(page.getByText('备用模拟纹理')).toBeVisible();
  await expect(page.getByRole('button', { name: '放大星球' })).toBeEnabled();
  await page.getByRole('button', { name: '探索月球', exact: true }).click(); await rendered(page);
});

test('devices without WebGL show a usable preview and can retry on a fresh canvas', async ({ page }) => {
  await page.addInitScript(() => {
    const runtime = window as unknown as { allowPlanetGL: boolean };
    runtime.allowPlanetGL = false;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, ...args: Parameters<typeof getContext>) {
      if (String(args[0]).includes('webgl') && !runtime.allowPlanetGL) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await page.goto('/#planets');
  await expect(page.getByText('当前设备使用静态预览')).toBeVisible();
  const preview = page.getByRole('img', { name: '土星的静态预览' });
  await expect.poll(() => preview.evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '探索地球', exact: true }).click();
  await expect(page.getByRole('img', { name: '地球的静态预览' })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { allowPlanetGL: boolean }).allowPlanetGL = true; });
  await page.getByRole('button', { name: '重新启用三维' }).click(); await rendered(page);
});

test('Android mode loads all planet assets locally and back returns to the stars', async ({ page }) => {
  const remote: string[] = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5183') || request.url().includes('/api/')) remote.push(request.url()); });
  await page.addInitScript(() => { (window as unknown as { JingliuAndroid: object }).JingliuAndroid = { exportBackup() {} }; });
  await page.goto('/#planets'); await rendered(page);
  await page.getByRole('button', { name: '探索地球', exact: true }).click(); await rendered(page);
  expect(await page.evaluate(() => (window as unknown as { jingliuHandleBack: () => boolean }).jingliuHandleBack())).toBe(true);
  await expect(page.locator('.sky-canvas')).toBeVisible();
  await page.getByRole('button', { name: '行星近观', exact: true }).click(); await rendered(page);
  expect(remote).toEqual([]);
});

test('small and landscape screens keep headings and controls clear of the model', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 393, height: 852 }, { width: 744, height: 960 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.goto('/#planets'); await rendered(page);
    const model = (await page.locator('.planet-stage').boundingBox())!;
    expect(model.height).toBeGreaterThan(125);
    for (const selector of ['.planet-copy', '.planet-dock', '.planet-controls']) {
      const box = (await page.locator(selector).boundingBox())!;
      const overlapX = Math.min(box.x + box.width, model.x + model.width) - Math.max(box.x, model.x);
      const overlapY = Math.min(box.y + box.height, model.y + model.height) - Math.max(box.y, model.y);
      expect(overlapX <= 1 || overlapY <= 1).toBe(true);
    }
    await page.getByText('影像与模拟说明', { exact: true }).click();
    await expect(page.locator('.planet-source')).toContainText('不代表实时位置');
    await page.getByText('影像与模拟说明', { exact: true }).click();
    await page.getByRole('button', { name: '下一颗天体' }).click(); await rendered(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});