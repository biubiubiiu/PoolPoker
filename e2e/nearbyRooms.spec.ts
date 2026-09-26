import { expect, test } from '@playwright/test';

const geolocation = { latitude: 31.23, longitude: 121.47, accuracy: 15 };

test('nearby rooms appear automatically, support one-tap join, and disappear on start', async ({
  browser,
}, testInfo) => {
  const hostContext = await browser.newContext({ geolocation, permissions: ['geolocation'] });
  const guestContext = await browser.newContext({ geolocation, permissions: ['geolocation'] });
  const observerContext = await browser.newContext({ geolocation, permissions: ['geolocation'] });
  // Reproduce the real Safari/Core Location 2001-epoch timestamp with a normal Chrome guest.
  await hostContext.addInitScript(() => {
    Object.defineProperty(navigator, 'vendor', { value: 'Apple Computer, Inc.', configurable: true });
    const watch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
    navigator.geolocation.watchPosition = (success, error, options) =>
      watch(
        (p) => success({ coords: p.coords, timestamp: p.timestamp - Date.UTC(2001, 0, 1) } as GeolocationPosition),
        error,
        options
      );
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (success, error, options) =>
      original(
        (p) => success({ coords: p.coords, timestamp: p.timestamp - Date.UTC(2001, 0, 1) } as GeolocationPosition),
        error,
        options
      );
  });
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await guest.setViewportSize({ width: 390, height: 844 });
    const observer = await observerContext.newPage();
    await Promise.all([host.goto('/'), guest.goto('/'), observer.goto('/')]);
    await expect(guest.getByRole('status')).toContainText('正在自动发现');
    await expect(host.getByRole('status')).toContainText('正在自动发现');
    await host.getByPlaceholder('请输入你的大名/外号').fill('NearbyHost');
    await host.getByRole('button', { name: '创建新房间', exact: true }).click();
    await host.getByRole('button', { name: /一键创建数字房间/ }).click();
    await expect(host.getByRole('status')).toContainText('附近玩家可发现');
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'NearbyHost' })).toBeVisible({ timeout: 10_000 });
    await expect(observer.getByTestId('nearby-room').filter({ hasText: 'NearbyHost' })).toBeVisible();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guest.screenshot({ path: testInfo.outputPath('nearby-mobile.png'), fullPage: true });
    await guest.getByRole('button', { name: '加入 NearbyHost 的球局' }).click();
    await expect(guest.getByText('等待房主开始游戏...')).toBeVisible();
    await expect(host.getByText('已加入玩家 (2/8)')).toBeVisible();
    await host.getByRole('button', { name: /开始扑克发牌/ }).click();
    await expect(observer.getByTestId('nearby-room').filter({ hasText: 'NearbyHost' })).toHaveCount(0);
  } finally {
    await Promise.all([hostContext.close(), guestContext.close(), observerContext.close()]);
  }
});

test('nearby discovery hides distant hosts and supports disabling and re-enabling', async ({ browser }) => {
  const hostContext = await browser.newContext({ geolocation, permissions: ['geolocation'] });
  const guestContext = await browser.newContext({
    geolocation: { ...geolocation, longitude: 122 },
    permissions: ['geolocation'],
  });
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await Promise.all([host.goto('/'), guest.goto('/')]);
    await expect(host.getByRole('status')).toContainText('正在自动发现');
    await host.getByPlaceholder('请输入你的大名/外号').fill('HiddenHost');
    await host.getByRole('button', { name: '创建新房间', exact: true }).click();
    await host.getByRole('button', { name: /一键创建数字房间/ }).click();
    await expect(host.getByRole('status')).toContainText('附近玩家可发现');
    await expect(guest.getByRole('status')).toContainText('正在自动发现');
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'HiddenHost' })).toHaveCount(0);
    await guestContext.setGeolocation(geolocation);
    await guest.getByRole('button', { name: '重新定位' }).click();
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'HiddenHost' })).toBeVisible();
    await host.getByRole('checkbox', { name: '附近发现' }).uncheck();
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'HiddenHost' })).toHaveCount(0);
    await host.getByRole('checkbox', { name: '附近发现' }).check();
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'HiddenHost' })).toBeVisible();
    await host.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(host.getByRole('status')).toContainText('已暂停定位');
    await guest.getByRole('button', { name: '重新定位' }).click();
    await expect(guest.getByRole('status')).toContainText('正在自动发现');
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'HiddenHost' })).toBeVisible();
    await host.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(guest.getByTestId('nearby-room').filter({ hasText: 'HiddenHost' })).toBeVisible();
    await guest.getByRole('checkbox', { name: '附近发现' }).uncheck();
    await guest.reload();
    await expect(guest.getByRole('checkbox', { name: '附近发现' })).not.toBeChecked();
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test('nearby discovery recovers after reconnecting', async ({ browser }) => {
  const context = await browser.newContext({ geolocation, permissions: ['geolocation'] });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('正在自动发现');
    await context.setOffline(true);
    await expect(page.getByRole('status')).toContainText('连接已断开', { timeout: 20_000 });
    await expect(page.getByTestId('nearby-room')).toHaveCount(0);
    await context.setOffline(false);
    await expect(page.getByRole('status')).toContainText('正在自动发现', { timeout: 20_000 });
  } finally {
    await context.close();
  }
});

test('denied geolocation keeps manual room entry available', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => {
      error?.({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    };
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('未获定位权限');
  await expect(page.getByPlaceholder(/输入 4 位数字房间码/)).toBeVisible();
  await expect(page.getByRole('button', { name: /进入球局/ })).toBeVisible();
});
