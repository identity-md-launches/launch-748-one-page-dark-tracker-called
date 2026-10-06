import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';

test('live public mainnet data from the production export', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  const responses: { url: string; status: number }[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { responses.push({ url: response.url(), status: response.status() }); });
  await page.goto('./');
  await expect(page.locator('tbody tr')).toHaveCount(12, { timeout: 45_000 });
  await expect(page.locator('.metric-value').first()).not.toHaveText('—', { timeout: 15_000 });
  await page.screenshot({ path: 'artifacts/live-mainnet.png', fullPage: true });
  writeFileSync('artifacts/live-mainnet.json', JSON.stringify({
    observedAt: new Date().toISOString(),
    metrics: await page.locator('.metric-value').allTextContents(),
    status: await page.locator('.network-status').textContent(),
    rows: await page.locator('tbody tr').allTextContents(), responses, errors,
  }, null, 2));
  expect(errors).toEqual([]);
});
