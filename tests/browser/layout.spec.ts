import { test, expect } from '@playwright/test';

test('search results stay accessible above an open star details sheet', async ({ page }) => {
  await page.goto('/');
  const search = page.getByLabel('搜索星星或记忆');
  await search.fill('织女星');
  await page.locator('#search-results .search-result').first().click();
  await expect(page.getByRole('complementary', { name: '织女星的详情' })).toBeVisible();
  await search.fill('HIP');
  const result = page.locator('#search-results .search-result').nth(8);
  const name = await result.locator('strong').evaluate(element => element.firstChild?.textContent);
  await result.click();
  await expect(page.getByRole('complementary', { name: `${name}的详情` })).toBeVisible();
});

test('small screens separate the star field from the title, seasons and main action', async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const canvas = (await page.locator('canvas').boundingBox())!;
    expect(canvas.height).toBeGreaterThan(100);
    for (const selector of ['.sky-topbar', '.sky-regions', '.sky-actions']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.y + box.height <= canvas.y + 1 || box.y >= canvas.y + canvas.height - 1).toBe(true);
    }
    const heading = page.locator('.sky-intro');
    if (await heading.isVisible()) {
      const box = (await heading.boundingBox())!;
      expect(box.y + box.height).toBeLessThanOrEqual(canvas.y + 1);
    }
    await page.getByLabel('搜索星星或记忆').fill('织女星');
    await page.locator('#search-results .search-result').first().click();
    const panel = page.getByRole('complementary', { name: '织女星的详情' });
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: '关闭星体详情' }).click();
    await page.getByRole('button', { name: '星图设置', exact: true }).click();
    await expect(page.getByRole('switch', { name: '星体名称' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByLabel('微光密度')).toHaveValue('4.5');
    await page.getByRole('button', { name: '关闭星图设置' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
