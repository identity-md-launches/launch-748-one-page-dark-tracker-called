import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { decodePrice, fixed, formatGwei, FEED } from '../src/ethereum';
import { ACCOUNT_B, encodeRound, mockRpc, mockWallet } from './fixtures';

test('formatting preserves oracle precision, small balances, and signed-answer validation', () => {
  expect(fixed(239867000000n, 8, 2)).toBe('2,398.67');
  expect(fixed(199999999n, 8, 2)).toBe('2.00');
  expect(fixed(1234567890123456789n, 18, 4, false)).toBe('1.2345');
  expect(formatGwei(12n)).toBe('<0.001');
  expect(formatGwei(0n)).toBe('0.000');
  expect(decodePrice(encodeRound()).answer).toBe(239867000000n);
  expect(() => decodePrice(encodeRound(0n))).toThrow();
  expect(() => decodePrice(encodeRound(2n ** 256n - 1n))).toThrow();
  expect(() => decodePrice('0x00')).toThrow();
  expect(() => decodePrice(encodeRound(1n, Math.floor(Date.now() / 1000) + 3600))).toThrow();
});

test('loads 12 descending blocks, exact feed, units, UTC clock, and polls after 15 seconds', async ({ page }) => {
  const state = await mockRpc(page);
  await page.clock.install();
  await page.goto('./');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.locator('.metric-value').nth(0)).toHaveText('$2,398.67');
  await expect(page.locator('.metric-value').nth(1)).toHaveText('1.167gwei');
  await expect(page.locator('.metric-value').nth(2)).toHaveText('—');
  await expect(page.locator('tbody tr').first()).toContainText('27,000,000');
  await expect(page.locator('tbody tr').last()).toContainText('26,999,989');
  await expect(page.locator('tbody tr').first()).toContainText('51.8%');
  const oracle = state.calls.filter(c => c.method === 'eth_call');
  expect(oracle.every(c => (c.params[0] as { to: string }).to === FEED)).toBe(true);
  const firstTime = await page.locator('.clock time').textContent();
  state.height++;
  await page.clock.runFor(15_000);
  await expect(page.locator('tbody tr').first()).toContainText('27,000,001');
  expect(await page.locator('.clock time').textContent()).not.toBe(firstTime);
  expect(state.calls.filter(c => c.method === 'eth_getBlockByNumber' && c.params[0] === 'latest').length).toBeGreaterThanOrEqual(2);
});

test('manual refresh, failed refresh preserves labelled readings, retry recovers', async ({ page }) => {
  const state = await mockRpc(page);
  await page.goto('./');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  state.height++;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toContainText('27,000,001');
  state.fail = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Last known price', { exact: true })).toBeVisible();
  await expect(page.locator('.network-status')).toHaveText('Data delayed');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  state.fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.network-status')).toHaveText('Live on mainnet');
});

test('initial outage has no invented values and recovers using Retry', async ({ page }) => {
  const state = await mockRpc(page); state.fail = true;
  await page.goto('./');
  await expect(page.getByText('Unable to load the latest blocks')).toBeVisible();
  await expect(page.locator('.metric-value').nth(0)).toHaveText('—');
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/error-state.png', fullPage: true });
  state.fail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(12);
});

test('wrong network and HTTP failures fall back to another mainnet endpoint', async ({ page }) => {
  const state = await mockRpc(page); state.wrongChain = true;
  await page.goto('./');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  expect(state.calls.some(c => c.url.includes('blastapi'))).toBe(true);
  state.wrongChain = false; state.failPrimary = true;
  await page.reload();
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.locator('.metric-value').first()).toHaveText('$2,398.67');
});

test('invalid oracle data does not block valid blocks; old data is labelled delayed', async ({ page }) => {
  const state = await mockRpc(page); state.invalidPrice = true;
  await page.goto('./');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await expect(page.getByText('Price unavailable', { exact: true })).toBeVisible();
  await expect(page.locator('.metric-value').first()).toHaveText('—');
  state.invalidPrice = false; state.priceAge = 7200;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Oracle update delayed', { exact: true })).toBeVisible();
  state.priceAge = 45; state.blockAge = 120;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Latest block is delayed', { exact: true })).toBeVisible();
});

test('no installed wallet provides a useful recovery message', async ({ page }) => {
  await mockRpc(page);
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByText(/No wallet detected/)).toBeVisible();
  await expect(page.locator('.metric-value').nth(2)).toHaveText('—');
});

test('wallet refusal, connection, account change, and local disconnect request no signatures', async ({ page }) => {
  const state = await mockRpc(page); await mockWallet(page, true);
  await page.goto('./');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.getByText(/Connection declined/)).toBeVisible();
  await page.evaluate('window.__wallet.reject = false');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect(page.locator('.metric-value').nth(2)).toHaveText('1.2345ETH');
  await page.evaluate(`window.__wallet.emit('accountsChanged', ['${ACCOUNT_B}'])`);
  await expect(page.locator('.wallet-address')).toHaveText(ACCOUNT_B);
  await expect(page.locator('.metric-value').nth(2)).toHaveText('5.0000ETH');
  await page.getByRole('button', { name: 'Disconnect wallet', exact: true }).click();
  await page.evaluate("window.__wallet.emit('accountsChanged', ['0x1111111111111111111111111111111111111111'])");
  await expect(page.locator('.metric-value').nth(2)).toHaveText('—');
  expect(await page.evaluate('window.__wallet.calls')).toEqual(['eth_requestAccounts', 'eth_requestAccounts']);
  expect(state.calls.some(c => /send|sign/i.test(c.method))).toBe(false);
});

test('late balance response cannot overwrite another account or reconnect a disconnected wallet', async ({ page }) => {
  const state = await mockRpc(page); state.balanceDelay = 900;
  await mockWallet(page); await page.goto('./');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await expect.poll(() => state.calls.some(c => c.method === 'eth_getBalance')).toBe(true);
  await page.evaluate(`window.__wallet.emit('accountsChanged', ['${ACCOUNT_B}'])`);
  await expect(page.locator('.metric-value').nth(2)).toHaveText('5.0000ETH');
  await page.waitForTimeout(1000);
  await expect(page.locator('.metric-value').nth(2)).toHaveText('5.0000ETH');
  await page.evaluate("window.__wallet.emit('disconnect')");
  await expect(page.locator('.metric-value').nth(2)).toHaveText('—');
});

test('production assets, responsive layouts, fonts, keyboard, contrast and axe checks', async ({ page }) => {
  mkdirSync('artifacts', { recursive: true });
  await mockRpc(page);
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('requestfailed', request => failures.push(request.url()));
  await page.goto('./');
  await expect(page.locator('tbody tr')).toHaveCount(12);
  await page.evaluate(() => document.fonts.ready);
  const contrast = await page.evaluate(() => {
    const luminance = (rgb: string) => {
      const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255)
        .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
    };
    const ratio = (a: string, b: string) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return Number(((values[0] + .05) / (values[1] + .05)).toFixed(2));
    };
    const pairs = ['h1', '.brand p', '.metric-label h3', '.metric-value', '.currency', '.metric-detail a',
      '.metric-detail > span:last-child', '.network-status', '.wallet-button', 'thead th', '.latest-row .block-number',
      '.latest-row td:nth-child(2)', 'tbody tr:nth-child(2) td:last-child', '.table-footer', '.page-footer', '.countdown'].map(selector => {
      const el = document.querySelector(selector)!;
      const foreground = getComputedStyle(el).color;
      let background = 'rgba(0, 0, 0, 0)';
      let ancestor: Element | null = el;
      while (ancestor && background === 'rgba(0, 0, 0, 0)') {
        background = getComputedStyle(ancestor).backgroundColor;
        ancestor = ancestor.parentElement;
      }
      return { selector, foreground, background, ratio: ratio(foreground, background) };
    });
    const style = getComputedStyle(document.documentElement);
    const focus = style.getPropertyValue('--color-focus').trim();
    const probe = document.createElement('span'); probe.style.color = focus; document.body.append(probe);
    const focusColor = getComputedStyle(probe).color; probe.remove();
    return { text: pairs, focus: ['.wallet-button', '.refresh-button', '.metric-detail a'].map(selector => {
      const el = document.querySelector(selector)!;
      let ancestor: Element | null = el.parentElement;
      let background = 'rgba(0, 0, 0, 0)';
      while (ancestor && background === 'rgba(0, 0, 0, 0)') {
        background = getComputedStyle(ancestor).backgroundColor; ancestor = ancestor.parentElement;
      }
      return { selector, foreground: focusColor, background, ratio: ratio(focusColor, background) };
    }) };
  });
  writeFileSync('artifacts/contrast.json', JSON.stringify(contrast, null, 2));
  expect(contrast.text.every(pair => pair.ratio >= 4.5)).toBe(true);
  expect(contrast.focus.every(pair => pair.ratio >= 3)).toBe(true);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeInViewport();
    if (width === 1440 || width === 390 || width === 320) {
      await page.screenshot({ path: `artifacts/dashboard-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Connect wallet', exact: true })).toBeFocused();
  await page.screenshot({ path: 'artifacts/keyboard-focus.png', fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByText(/No wallet detected/)).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Chainlink ETH\/USD feed on Etherscan/ })).toBeFocused();
  await page.screenshot({ path: 'artifacts/link-focus.png', fullPage: true });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeFocused();
  await page.screenshot({ path: 'artifacts/refresh-focus.png', fullPage: true });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.addScriptTag({ content: readFileSync('node_modules/axe-core/axe.min.js', 'utf8') });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations;
  });
  expect(violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 900 });
  const mobileViolations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe;
    return (await axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations;
  });
  expect(mobileViolations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/text-enlargement.png', fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).focus();
  await page.screenshot({ path: 'artifacts/forced-colors.png', fullPage: true });
  await page.emulateMedia({ forcedColors: 'none' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.button').first().evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await page.evaluate(() => document.fonts.check('400 14px "Geist Variable"') && document.fonts.check('400 14px "Geist Mono Variable"'))).toBe(true);
  expect(failures).toEqual([]);
});
