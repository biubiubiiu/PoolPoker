import { test, expect } from '@playwright/test';

test.describe('PoolPoker (球霸扑克) Comprehensive Integration Test Suite', () => {

  test('1. Player Profile & LocalStorage Persistence (usePlayerProfile)', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // 设置玩家姓名 (<=10字符)、选择头像
    const nameInput = page.locator('input[placeholder*="请输入你的大名/外号"]');
    await nameInput.fill('Alice');

    // 选中第二个头像 🎯
    const avatarBtns = page.locator('.glass-panel button');
    await avatarBtns.nth(1).click();

    // 验证 LocalStorage 持久化
    const savedName = await page.evaluate(() => localStorage.getItem('billiards_player_name'));
    const savedAvatar = await page.evaluate(() => localStorage.getItem('billiards_player_avatar'));
    expect(savedName).toBe('Alice');
    expect(savedAvatar).toBeTruthy();

    // 刷新页面，验证配置保存生效
    await page.reload();
    await page.waitForTimeout(500);
    await expect(nameInput).toHaveValue('Alice');
  });

  test('2. Multi-player Lobby Sync & Rules Adjustment (useGameRoom + Socket.io)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', d => d.accept());
    guestPage.on('dialog', d => d.accept());

    // Host 创建房间
    await hostPage.goto('/');
    await hostPage.waitForTimeout(500);
    await hostPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('HostUser');
    await hostPage.click('button:has-text("创建新房间")');
    await hostPage.click('button:has-text("一键创建数字房间")');

    await hostPage.waitForSelector('text=已加入玩家');
    const roomCodeElement = hostPage.locator('header span.font-mono').first();
    const roomCode = (await roomCodeElement.innerText()).trim();

    // Guest 加入房间
    await guestPage.goto('/');
    await guestPage.waitForTimeout(500);
    await guestPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('GuestUser');
    await guestPage.click('button:has-text("加入朋友房间")');
    await guestPage.locator('input[placeholder*="输入 4 位数字房间码"]').fill(roomCode);
    await guestPage.click('button:has-text("进入球局")');

    // 验证双向房间玩家列表同步
    await expect(hostPage.locator('text=HostUser')).toBeVisible({ timeout: 5000 });
    await expect(hostPage.locator('text=GuestUser')).toBeVisible({ timeout: 5000 });
    await expect(guestPage.locator('text=HostUser')).toBeVisible({ timeout: 5000 });
    await expect(guestPage.locator('text=GuestUser')).toBeVisible({ timeout: 5000 });

    // 房主加减发牌数，验证 Guest 页面实时收到 WebSocket 规则更新
    const cardCountDisplay = guestPage.locator('span.font-mono.text-amber-300');
    const initialCountText = await cardCountDisplay.innerText();

    await hostPage.click('button:has-text("+")');
    await expect(cardCountDisplay).not.toHaveText(initialCountText, { timeout: 5000 });

    await hostContext.close();
    await guestContext.close();
  });

  test('3. Game Playback, Card Dimming, Accidental Pocket, Retract, Penalty & Restart Flow', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', d => d.accept());
    guestPage.on('dialog', d => d.accept());

    // --- 初始化房间与开始对局 ---
    await hostPage.goto('/');
    await hostPage.waitForTimeout(500);
    await hostPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('HostP1');
    await hostPage.click('button:has-text("创建新房间")');
    await hostPage.click('button:has-text("一键创建数字房间")');

    await hostPage.waitForSelector('text=已加入玩家');
    const roomCodeElement = hostPage.locator('header span.font-mono').first();
    const roomCode = (await roomCodeElement.innerText()).trim();

    await guestPage.goto('/');
    await guestPage.waitForTimeout(500);
    await guestPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('GuestP2');
    await guestPage.click('button:has-text("加入朋友房间")');
    await guestPage.locator('input[placeholder*="输入 4 位数字房间码"]').fill(roomCode);
    await guestPage.click('button:has-text("进入球局")');

    await expect(hostPage.locator('text=GuestP2')).toBeVisible({ timeout: 5000 });

    // 房主点击开始发牌对局
    await hostPage.click('button:has-text("开始扑克发牌")');

    await hostPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });
    await guestPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // --- 3.1 测试【犯规抽卡 (Draw Penalty)】---
    const initialHandCardsCount = await hostPage.locator('.poker-card-frame').count();
    await hostPage.click('button:has-text("犯规抽卡")');
    await hostPage.waitForTimeout(500);
    const afterPenaltyHandCardsCount = await hostPage.locator('.poker-card-frame').count();
    expect(afterPenaltyHandCardsCount).toBe(initialHandCardsCount + 1);

    // --- 3.2 测试【意外进球 (Accidental Pocket)】及牌面免打置灰 (isCardDimmed) ---
    await hostPage.click('button:has-text("意外进球")');
    await expect(hostPage.locator('text=请选择意外打进的球号')).toBeVisible();

    // 找到未打进的球号按钮（例如 8 号球）并点击提交
    const ball8Btn = hostPage.locator('.fixed button:has-text("8号")').first();
    if (await ball8Btn.isVisible()) {
      await ball8Btn.click();
      await hostPage.click('.fixed button:has-text("确认进球")');
      await expect(hostPage.locator('text=请选择意外打进的球号')).toBeHidden();

      // 验证全场对局日志（GameLogs）记录了判定事件
      await expect(hostPage.locator('text=判定为已进球')).toBeVisible({ timeout: 5000 });
    }

    // --- 3.3 测试【打卡销牌 (Confirm Pocket)】---
    const cardToPocket = hostPage.locator('.poker-card-frame:not(.is-dimmed)').first();
    if (await cardToPocket.isVisible()) {
      await cardToPocket.click(); // 自动接受 window.confirm
      await hostPage.waitForTimeout(500);

      // --- 3.4 测试【撤回进球 (Retract Ball Modal)】确认撤回功能 ---
      await hostPage.click('button:has-text("撤回")');
      await expect(hostPage.locator('text=撤回进球')).toBeVisible();

      // 选中已打进的卡片并点击确认撤回
      const pocketedCardInModal = hostPage.locator('.fixed button:has-text("号")').first();
      if (await pocketedCardInModal.isVisible()) {
        await pocketedCardInModal.click();
        await hostPage.click('.fixed button:has-text("确认撤回")');
        await expect(hostPage.locator('text=撤回进球')).toBeHidden();

        // 验证日志显示了撤回记录
        await expect(hostPage.locator('text=撤回了已打进的手牌')).toBeVisible({ timeout: 5000 });
      } else {
        await hostPage.click('.fixed button:has-text("取消")');
      }
    }

    // --- 3.5 测试【重置局况 (Restart Modal)】---
    const restartHeaderBtn = hostPage.locator('header button').first();
    await restartHeaderBtn.click();
    await expect(hostPage.locator('text=确认重开本局？')).toBeVisible();

    await hostPage.click('.fixed button:has-text("确认重开")');

    // 验证双侧玩家同时回到等待阶段
    await expect(hostPage.locator('text=开始扑克发牌')).toBeVisible({ timeout: 5000 });
    await expect(guestPage.locator('text=等待房主开始游戏')).toBeVisible({ timeout: 5000 });

    // --- 3.6 测试【离开房间 (Leave Room)】与缓存清理 ---
    const leaveBtn = hostPage.locator('header button').last();
    await leaveBtn.click();

    // 验证房主返回登录大厅
    await expect(hostPage.locator('button:has-text("创建新房间")')).toBeVisible();

    // 验证 localStorage billiards_room_code 已被清理
    const savedRoomCode = await hostPage.evaluate(() => localStorage.getItem('billiards_room_code'));
    expect(savedRoomCode).toBeNull();

    await hostContext.close();
    await guestContext.close();
  });

  test('4. Cumulative Score & Victory Count Tracking Across Rounds', async ({ page }) => {
    page.on('dialog', d => d.accept());

    // 1. 创建房间
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.locator('input[placeholder*="请输入你的大名/外号"]').fill('ScoreTester');
    await page.click('button:has-text("创建新房间")');
    await page.click('button:has-text("一键创建数字房间")');

    await page.waitForSelector('text=已加入玩家');

    // 调整规则为每人 1 张牌以快速触发胜利
    const cardMinusBtn = page.locator('button:has-text("-")');
    for (let i = 0; i < 4; i++) {
      await cardMinusBtn.click();
    }
    await page.waitForTimeout(300);

    // 开始第 1 局
    await page.click('button:has-text("开始扑克发牌")');
    await page.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 打掉唯一下的卡牌
    const cardToPocket = page.locator('.poker-card-frame').first();
    await cardToPocket.click();

    // 验证弹出 VictoryModal，并展示累计得分 1 胜
    await expect(page.locator('text=率先消完所有手上扑克牌')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=累计得分: 1胜')).toBeVisible({ timeout: 5000 });

    // 开启第 2 局
    await page.click('button:has-text("再来一局")');
    await page.waitForSelector('text=开始扑克发牌', { timeout: 5000 });
    await page.click('button:has-text("开始扑克发牌")');

    await page.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 再次打掉手牌，获得第 2 胜
    const secondCardToPocket = page.locator('.poker-card-frame').first();
    await secondCardToPocket.click();

    // 验证 VictoryModal 展示累计得分 2 胜
    await expect(page.locator('text=率先消完所有手上扑克牌')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=累计得分: 2胜')).toBeVisible({ timeout: 5000 });
  });

  test('5. Multi-Player Simultaneous Victory Settlement & Next-Round First Player Priority', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', d => d.accept());
    guestPage.on('dialog', d => d.accept());

    // Host 创建房间
    await hostPage.goto('/');
    await hostPage.waitForTimeout(500);
    await hostPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('HostWin');
    await hostPage.click('button:has-text("创建新房间")');
    await hostPage.click('button:has-text("一键创建数字房间")');

    await hostPage.waitForSelector('text=已加入玩家');
    const roomCodeLocator = hostPage.locator('header span.font-mono').first();
    await expect(roomCodeLocator).not.toHaveText('');
    const roomCode = (await roomCodeLocator.innerText()).trim();

    // Guest 加入房间
    await guestPage.goto('/');
    await guestPage.waitForTimeout(500);
    await guestPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('GuestWin');
    await guestPage.click('button:has-text("加入朋友房间")');
    await guestPage.locator('input[placeholder*="输入 4 位数字房间码"]').fill(roomCode);
    await guestPage.click('button:has-text("进入球局")');

    await expect(hostPage.locator('text=GuestWin')).toBeVisible({ timeout: 5000 });

    // 开始第 1 局（使用默认每人 5 张牌）
    await hostPage.click('button:has-text("开始扑克发牌")');
    await hostPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });
    await guestPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 提取未消除的扑克球号数组
    const getUnpocketedBallList = async (page: any) => {
      const texts = await page.locator('.poker-card-frame:not(.is-dimmed)').allInnerTexts();
      const balls: number[] = [];
      for (const t of texts) {
        const m = t.match(/(\d+)/);
        if (m) balls.push(parseInt(m[1], 10));
      }
      return balls;
    };

    let hostBalls = await getUnpocketedBallList(hostPage);
    let guestBalls = await getUnpocketedBallList(guestPage);
    
    // 找到在 Guest 手牌中只出现 1 次且 Host 也持有的球号
    const findSharedBall = (hBalls: number[], gBalls: number[]) => {
      return hBalls.find(b => gBalls.filter(gb => gb === b).length === 1);
    };

    let sharedBall = findSharedBall(hostBalls, guestBalls);

    // 若当前无合适共同球号，执行犯规抽卡直至获得共同球号
    while (!sharedBall) {
      await hostPage.click('button:has-text("犯规抽卡")');
      await hostPage.waitForTimeout(300);
      hostBalls = await getUnpocketedBallList(hostPage);
      guestBalls = await getUnpocketedBallList(guestPage);
      sharedBall = findSharedBall(hostBalls, guestBalls);
    }

    // 房主通过“意外进球”将所有非 sharedBall 的球打进
    const nonSharedBalls = Array.from(new Set([...hostBalls, ...guestBalls])).filter(b => b !== sharedBall);
    for (const ballNum of nonSharedBalls) {
      await hostPage.click('button:has-text("意外进球")');
      await hostPage.waitForSelector('text=请选择意外打进的球号');
      const ballBtn = hostPage.locator(`.fixed button:has-text("${ballNum}号")`).first();
      await ballBtn.click();
      await hostPage.click('.fixed button:has-text("确认进球")');
      await hostPage.waitForTimeout(200);
    }

    // 若 Host 手上有多张 sharedBall（比如持有多张同球号不同花色的牌），先打进多余的牌直到只剩 1 张
    let remainingHostCards = hostPage.locator('.poker-card-frame:not(.is-dimmed)');
    while ((await remainingHostCards.count()) > 1) {
      await remainingHostCards.first().click();
      await hostPage.waitForTimeout(300);
      remainingHostCards = hostPage.locator('.poker-card-frame:not(.is-dimmed)');
    }

    // 此时 Host 与 Guest 均只剩 1 张 sharedBall 手牌，Host 打进最后 1 张手牌，触发两人同时胜出
    await remainingHostCards.first().click();

    // 验证多名玩家同时胜利结算弹窗 display
    await expect(hostPage.locator('text=共同清空有效手牌，赢得本局胜利！')).toBeVisible({ timeout: 5000 });
    await expect(guestPage.locator('text=共同清空有效手牌，赢得本局胜利！')).toBeVisible({ timeout: 5000 });

    // 验证打出手牌的 HostWin 放在首位
    const victoryTitleText = await hostPage.locator('.glass-panel h2').first().innerText();
    expect(victoryTitleText).toContain('HostWin');
    expect(victoryTitleText).toContain('GuestWin');
    expect(victoryTitleText.indexOf('HostWin')).toBeLessThan(victoryTitleText.indexOf('GuestWin'));

    // 点击再来一局
    await hostPage.click('button:has-text("再来一局")');
    await hostPage.waitForSelector('text=开始扑克发牌', { timeout: 5000 });
    await hostPage.click('button:has-text("开始扑克发牌")');

    // 验证下一局 HostWin 优先作为第一位击球
    await expect(hostPage.locator('text=本局击球顺序').first()).toBeVisible({ timeout: 5000 });
    const logText = await hostPage.locator('.glass-panel').filter({ hasText: '本局击球顺序' }).first().innerText();
    expect(logText).toMatch(/HostWin[\s\S]*GuestWin/);

    await hostContext.close();
    await guestContext.close();
  });

});


