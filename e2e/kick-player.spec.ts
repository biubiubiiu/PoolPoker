import { expect, test } from '@playwright/test';

test('host can cancel or confirm removing a player from the preparation room', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    await host.goto('/');
    await host.locator('input[placeholder*="请输入你的大名/外号"]').fill('KickHost');
    await host.getByRole('button', { name: '创建新房间' }).click();
    await host.getByRole('button', { name: '一键创建数字房间' }).click();
    await expect(host.getByText('已加入玩家', { exact: false })).toBeVisible();
    const code = (await host.locator('header span.font-mono').first().innerText()).trim();
    await guest.goto('/');
    await guest.locator('input[placeholder*="请输入你的大名/外号"]').fill('KickGuest');
    await guest.locator('input[placeholder*="输入 4 位数字房间码"]').fill(code);
    await guest.getByRole('button', { name: '进入球局' }).click();
    const kick = host.getByRole('button', { name: '移出玩家 KickGuest', exact: true });
    await expect(kick).toBeVisible();
    await expect(host.getByRole('button', { name: '移出玩家 KickHost' })).toHaveCount(0);
    await expect(guest.getByText('已加入玩家', { exact: false })).toBeVisible();
    await expect(guest.getByRole('button', { name: /移出玩家/ })).toHaveCount(0);

    host.once('dialog', (dialog) => dialog.dismiss());
    await kick.click();
    await expect(kick).toBeVisible();
    const notice = guest.waitForEvent('dialog');
    host.once('dialog', (dialog) => dialog.accept());
    await kick.click();
    const dialog = await notice;
    expect(dialog.message()).toContain('你已被房主移出房间');
    await dialog.accept();
    await expect(kick).toHaveCount(0);
    await expect(guest.getByRole('button', { name: '进入球局' })).toBeVisible();
    expect(
      await guest.evaluate(() => [
        localStorage.getItem('billiards_room_code'),
        localStorage.getItem('billiards_session_token'),
      ])
    ).toEqual([null, null]);
    await guest.reload();
    await expect(guest.getByRole('button', { name: '进入球局' })).toBeVisible();
    await expect(guest.getByText('已加入玩家', { exact: false })).toHaveCount(0);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
