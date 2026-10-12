import { test, expect } from '@playwright/test';

test('four borderless sky regions cover 20,000 stars and move the star map', async ({ page }) => {
  await page.goto('/');
  const regions = page.getByRole('navigation', { name: '四季星区' });
  await expect(regions.getByRole('button')).toHaveCount(4);
  const counts = await regions.locator('.region-count').allTextContents();
  expect(counts.reduce((total, count) => total + Number(count.replace(/\D/g, '')), 0)).toBe(20000);
  const images = new Set<string>();
  for (const name of ['春 · 初生', '夏 · 流萤', '秋 · 星语', '冬 · 长明']) {
    const button = regions.getByRole('button', { name: name + '星区' });
    await button.click();
    await expect(page.locator('.sky-status')).toContainText(name);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    images.add(await page.locator('canvas').evaluate(canvas => canvas.toDataURL()));
  }
  expect(images.size).toBe(4);
  await page.getByRole('button', { name: '星图设置', exact: true }).click();
  await expect(page.getByRole('switch', { name: '星座连线' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('switch', { name: '赤道网格' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByLabel('星点大小')).toHaveValue('1.65');
});

test('Android mode saves memories offline, exports through the bridge and handles back', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
  await page.route('**/api/**', route => route.abort());
  await page.addInitScript(() => {
    const nativeWindow = window as unknown as {
      JingliuAndroid: { exportBackup: (contents: string, filename: string) => void };
      savedBackup?: { contents: string; filename: string };
    };
    nativeWindow.JingliuAndroid = {
      exportBackup(contents, filename) { nativeWindow.savedBackup = { contents, filename }; },
    };
  });
  await page.goto('/#profile');
  await expect(page.getByText(/记忆与照片保存在这台手机上/)).toBeVisible();
  await expect(page.getByRole('button', { name: '拥有我的星空' })).toHaveCount(0);
  await page.getByRole('button', { name: /留下一面新的镜/ }).click();
  await page.getByLabel('给回忆起个名字').fill('离线的星光');
  await page.getByLabel('想对未来的自己说').fill('没有网络，也能把此刻保存下来。');
  await page.getByRole('button', { name: '珍藏这一刻', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开记忆：离线的星光' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '打开记忆：离线的星光' })).toBeVisible();
  await page.goto('/#profile');
  await page.getByRole('button', { name: /带走我的回忆/ }).click();
  const backup = await page.evaluate(() => (window as unknown as { savedBackup: { contents: string; filename: string } }).savedBackup);
  expect(backup.filename).toMatch(/\.json$/);
  expect(JSON.parse(backup.contents).memories.some((memory: { title: string }) => memory.title === '离线的星光')).toBe(true);
  const goBack = () => page.evaluate(() => (window as unknown as { jingliuHandleBack: () => boolean }).jingliuHandleBack());
  await page.getByRole('button', { name: /关于镜留/ }).click();
  expect(await goBack()).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await goBack()).toBe(true);
  await expect(page.locator('canvas')).toBeVisible();
  expect(await goBack()).toBe(false);
  expect(requests).toEqual([]);
});
