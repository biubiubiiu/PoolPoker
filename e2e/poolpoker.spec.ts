import { expect, test } from '@playwright/test';

test.describe('PoolPoker (球霸扑克) Comprehensive Integration Test Suite', () => {
  // 辅助函数：提取当前页面展示的玩家手牌球号列表
  const getHandBallNumbers = async (page: any) => {
    const cardElements = page.locator('.poker-card-frame .ball-number');
    const count = await cardElements.count();
    const ballNumbers: number[] = [];
    for (let i = 0; i < count; i++) {
      const text = await cardElements.nth(i).innerText();
      ballNumbers.push(parseInt(text.trim(), 10));
    }
    return ballNumbers;
  };

  test.beforeAll(async ({ request }) => {
    // 跑 Playwright 测试时，自动静默禁用企业微信机器人推送，防消息打扰
    await request.post('/api/wecom-push/toggle', { data: { disabled: true } }).catch(() => {});
  });

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

    hostPage.on('dialog', (d) => d.accept());
    guestPage.on('dialog', (d) => d.accept());

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
    await expect(hostPage.locator('text=HostUser')).toBeVisible({
      timeout: 5000,
    });
    await expect(hostPage.locator('text=GuestUser')).toBeVisible({
      timeout: 5000,
    });
    await expect(guestPage.locator('text=HostUser')).toBeVisible({
      timeout: 5000,
    });
    await expect(guestPage.locator('text=GuestUser')).toBeVisible({
      timeout: 5000,
    });

    // 房主加减发牌数，验证 Guest 页面实时收到 WebSocket 规则更新
    const cardCountDisplay = guestPage.locator('span.font-mono.text-amber-300');
    const initialCountText = await cardCountDisplay.innerText();

    await hostPage.click('button:has-text("+")');
    await expect(cardCountDisplay).not.toHaveText(initialCountText, {
      timeout: 5000,
    });

    await hostContext.close();
    await guestContext.close();
  });

  test('3. Game Playback, Card Dimming, Accidental Pocket, Retract, Penalty & Restart Flow', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', (d) => d.accept());
    guestPage.on('dialog', (d) => d.accept());

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

    await expect(hostPage.locator('text=GuestP2')).toBeVisible({
      timeout: 5000,
    });

    // 房主点击开始发牌对局
    await hostPage.click('button:has-text("开始扑克发牌")');

    await hostPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });
    await guestPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 验证初始发牌手牌按球号/点数升序排列
    const initialHostHand = await getHandBallNumbers(hostPage);
    expect(initialHostHand.length).toBeGreaterThan(0);
    expect(initialHostHand).toEqual([...initialHostHand].sort((a, b) => a - b));

    // --- 3.1 测试【记录犯规 (Record Foul)】（默认选中自己）---
    const initialHandCardsCount = await hostPage.locator('.poker-card-frame').count();
    await hostPage.click('button:has-text("记录犯规")');
    await expect(hostPage.locator('.fixed:has-text("记录犯规")').first()).toBeVisible();
    // 验证默认选中的玩家为自己 HostP1
    await expect(hostPage.locator('.fixed button.bg-red-950\\/60:has-text("HostP1")')).toBeVisible();
    await hostPage.click('.fixed button:has-text("确认记录犯规")');
    await hostPage.waitForTimeout(500);
    const afterPenaltyHandCardsCount = await hostPage.locator('.poker-card-frame').count();
    expect(afterPenaltyHandCardsCount).toBe(initialHandCardsCount + 1);

    // 验证犯规罚牌后手牌依然按球号严格升序排列
    const hostHandAfterPenalty = await getHandBallNumbers(hostPage);
    expect(hostHandAfterPenalty.length).toBe(afterPenaltyHandCardsCount);
    expect(hostHandAfterPenalty).toEqual([...hostHandAfterPenalty].sort((a, b) => a - b));

    // 验证犯规日志未泄露抽到的具体扑克牌花色与点数
    const foulLogItem = hostPage.locator('.glass-panel div').filter({ hasText: 'HostP1 犯规' }).last();
    await expect(foulLogItem).toBeVisible();
    const foulLogText = await foulLogItem.innerText();
    expect(foulLogText).toContain('罚抽 1 张扑克牌');
    expect(foulLogText).not.toMatch(/[♠♥♣♦]/);

    // --- 3.2 测试【记录进球 (Record Pocket Ball)】及全场进球免打置灰 ---
    await hostPage.click('button:has-text("记录进球")');
    await expect(hostPage.locator('.fixed:has-text("记录进球")').first()).toBeVisible();
    // 验证默认选中的玩家为自己 HostP1
    await expect(hostPage.locator('.fixed button.bg-emerald-500\\/30:has-text("HostP1")')).toBeVisible();

    // 找到未打进的球号按钮（例如 8 号球）并点击提交
    const ball8Btn = hostPage.locator('.fixed button').filter({ hasText: '8号' }).first();
    await expect(ball8Btn).toBeVisible();
    await ball8Btn.click();
    const confirmBtn = hostPage.locator('.fixed button:has-text("确认记录进球")');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();
    await expect(hostPage.locator('.fixed h3:has-text("记录进球")')).toBeHidden();

    // 验证全场对局日志（GameLogs）记录了判定/进球事件
    await expect(hostPage.locator('text=8号球').first()).toBeVisible({
      timeout: 5000,
    });

    // --- 3.3 测试【打卡销牌 (Confirm Pocket)】---
    const cardToPocket = hostPage.locator('.poker-card-frame:not(.is-dimmed)').first();
    if (await cardToPocket.isVisible()) {
      await cardToPocket.click(); // 自动接受 window.confirm
      await hostPage.waitForTimeout(500);

      // --- 3.4 测试【撤回上一步 (Retract)】整体回退最近一步操作 ---
      await hostPage.click('button:has-text("撤回")');

      // 验证日志显示了撤回记录
      await expect(hostPage.locator('text=已撤回到上一步操作')).toBeVisible({
        timeout: 5000,
      });
    }

    // --- 3.5 测试【重置局况 (Restart Modal)】---
    const restartHeaderBtn = hostPage.locator('header button').first();
    await restartHeaderBtn.click();
    await expect(hostPage.locator('text=确认重开本局？')).toBeVisible();

    await hostPage.click('.fixed button:has-text("确认重开")');

    // 验证双侧玩家同时回到等待阶段
    await expect(hostPage.locator('text=开始扑克发牌')).toBeVisible({
      timeout: 5000,
    });
    await expect(guestPage.locator('text=等待房主开始游戏')).toBeVisible({
      timeout: 5000,
    });

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
    page.on('dialog', (d) => d.accept());

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

    // 验证弹出 VictoryModal，并展示累计战报（总积分 + 1 胜徽章）
    await expect(page.locator('text=率先消完所有手上扑克牌')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('text=总积分: 0')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('text=1胜').first()).toBeVisible({
      timeout: 5000,
    });

    // 开启第 2 局
    await page.click('button:has-text("再来一局")');
    await page.waitForSelector('text=开始扑克发牌', { timeout: 5000 });
    await page.click('button:has-text("开始扑克发牌")');

    await page.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 再次打掉手牌，获得第 2 胜
    const secondCardToPocket = page.locator('.poker-card-frame').first();
    await secondCardToPocket.click();

    // 验证 VictoryModal 展示累计战报（总积分 + 2 胜徽章）
    await expect(page.locator('text=率先消完所有手上扑克牌')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('text=2胜').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('5. Multi-Player Simultaneous Victory Settlement & Next-Round First Player Priority', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', (d) => d.accept());
    guestPage.on('dialog', (d) => d.accept());

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

    await expect(hostPage.locator('text=GuestWin')).toBeVisible({
      timeout: 5000,
    });

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
      return hBalls.find((b) => gBalls.filter((gb) => gb === b).length === 1);
    };

    let sharedBall = findSharedBall(hostBalls, guestBalls);

    // 若当前无合适共同球号，执行记录犯规抽卡直至获得共同球号
    while (!sharedBall) {
      await hostPage.click('button:has-text("记录犯规")');
      await hostPage.click('.fixed button:has-text("确认记录犯规")');
      await hostPage.waitForTimeout(300);
      hostBalls = await getUnpocketedBallList(hostPage);
      guestBalls = await getUnpocketedBallList(guestPage);
      sharedBall = findSharedBall(hostBalls, guestBalls);
    }

    // 房主通过“记录进球”将所有非 sharedBall 的球打进
    const nonSharedBalls = Array.from(new Set([...hostBalls, ...guestBalls])).filter((b) => b !== sharedBall);
    for (const ballNum of nonSharedBalls) {
      await hostPage.click('button:has-text("记录进球")');
      await hostPage.waitForSelector('.fixed:has-text("记录进球")');
      const ballBtn = hostPage.locator(`.fixed button:has-text("${ballNum}号")`).first();
      if (await ballBtn.isEnabled()) {
        await ballBtn.click();
        await hostPage.click('.fixed button:has-text("确认记录进球")');
        await hostPage.waitForTimeout(200);
      } else {
        await hostPage.locator('.fixed button:has-text("取消")').first().click();
        await hostPage.waitForTimeout(200);
      }
    }

    // 若当前未触发胜利弹窗，且 Host 手上有多张牌，打进剩余手牌直到结算
    const isVictoryOpen = await hostPage
      .locator('.glass-panel h2')
      .first()
      .isVisible()
      .catch(() => false);
    if (!isVictoryOpen) {
      let remainingHostCards = hostPage.locator('.poker-card-frame:not(.is-dimmed)');
      while ((await remainingHostCards.count()) > 1) {
        await remainingHostCards.first().click();
        await hostPage.waitForTimeout(300);
        remainingHostCards = hostPage.locator('.poker-card-frame:not(.is-dimmed)');
      }
      if ((await remainingHostCards.count()) > 0) {
        await remainingHostCards.first().click();
      }
    }

    // 验证多名玩家同时胜利结算弹窗 display
    await expect(
      hostPage.locator('text=共同清空有效手牌，赢得本局胜利！').or(hostPage.locator('text=率先消完所有手上扑克牌！'))
    ).toBeVisible({ timeout: 5000 });
    await expect(
      guestPage.locator('text=共同清空有效手牌，赢得本局胜利！').or(guestPage.locator('text=率先消完所有手上扑克牌！'))
    ).toBeVisible({ timeout: 5000 });

    // 验证打出手牌的 HostWin 放在首位
    const victoryTitleText = await hostPage.locator('.glass-panel h2').first().innerText();
    expect(victoryTitleText).toContain('HostWin');
    if (victoryTitleText.includes('GuestWin')) {
      expect(victoryTitleText.indexOf('HostWin')).toBeLessThan(victoryTitleText.indexOf('GuestWin'));
    }

    // 点击再来一局
    await hostPage.click('button:has-text("再来一局")');
    await hostPage.waitForSelector('text=开始扑克发牌', { timeout: 5000 });
    await hostPage.click('button:has-text("开始扑克发牌")');

    // 验证下一局 HostWin 优先作为第一位击球
    await expect(hostPage.locator('text=本局击球顺序').first()).toBeVisible({
      timeout: 5000,
    });
    const logText = await hostPage.locator('.glass-panel').filter({ hasText: '本局击球顺序' }).first().innerText();
    expect(logText).toMatch(/HostWin[\s\S]*GuestWin/);

    await hostContext.close();
    await guestContext.close();
  });

  test('6. Referee Mode Proxy Ball Potting & Proxy Foul Drawing (记录进球与记录犯规功能)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', (d) => d.accept());
    guestPage.on('dialog', (d) => d.accept());

    // Host 创建房间
    await hostPage.goto('/');
    await hostPage.waitForTimeout(500);
    await hostPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('RefereeP1');
    await hostPage.click('button:has-text("创建新房间")');
    await hostPage.click('button:has-text("一键创建数字房间")');

    await hostPage.waitForSelector('text=已加入玩家');
    const roomCodeElement = hostPage.locator('header span.font-mono').first();
    const roomCode = (await roomCodeElement.innerText()).trim();

    // Guest 加入房间
    await guestPage.goto('/');
    await guestPage.waitForTimeout(500);
    await guestPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('RefereeP2');
    await guestPage.click('button:has-text("加入朋友房间")');
    await guestPage.locator('input[placeholder*="输入 4 位数字房间码"]').fill(roomCode);
    await guestPage.click('button:has-text("进入球局")');

    await expect(hostPage.locator('text=RefereeP2').first()).toBeVisible({
      timeout: 5000,
    });

    // 开始对局
    await hostPage.click('button:has-text("开始扑克发牌")');
    await hostPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });
    await guestPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 1. Guest (RefereeP2) 为 Host (RefereeP1) 记录进球
    await guestPage.locator('button:has-text("记录进球")').first().click();
    await guestPage.waitForSelector('.fixed:has-text("记录进球")');

    // 验证 Guest 点开时默认选中的是自己 RefereeP2
    await expect(guestPage.locator('.fixed button.bg-emerald-500\\/30:has-text("RefereeP2")')).toBeVisible();

    // 切换选择 RefereeP1
    await guestPage.click('.fixed button:has-text("RefereeP1")');
    // 选择 1号球
    await guestPage.click('.fixed button:has-text("1号")');
    await guestPage.click('.fixed button:has-text("确认记录进球")');

    // 验证日志中包含记录
    await expect(hostPage.locator('text=RefereeP2').first()).toBeVisible({
      timeout: 5000,
    });

    // 2. Guest (RefereeP2) 为 Host (RefereeP1) 记录犯规
    await guestPage.locator('button:has-text("记录犯规")').first().click();
    await guestPage.waitForSelector('.fixed:has-text("记录犯规")');

    // 验证 Guest 点开时默认选中的是自己 RefereeP2
    await expect(guestPage.locator('.fixed button.bg-red-950\\/60:has-text("RefereeP2")')).toBeVisible();

    // 切换选择 RefereeP1
    await guestPage.click('.fixed button:has-text("RefereeP1")');
    await guestPage.click('.fixed button:has-text("确认记录犯规")');

    // 验证日志记录犯规，且未泄露裁判代抽的具体扑克花色点数
    const proxyFoulLogItem = hostPage.locator('.glass-panel div').filter({ hasText: '裁判代记' }).last();
    await expect(proxyFoulLogItem).toBeVisible({ timeout: 5000 });
    const proxyFoulLogText = await proxyFoulLogItem.innerText();
    expect(proxyFoulLogText).toContain('RefereeP1 犯规');
    expect(proxyFoulLogText).toContain('罚抽 1 张扑克牌');
    expect(proxyFoulLogText).not.toMatch(/[♠♥♣♦]/);

    // 验证受罚玩家(RefereeP1)补牌后手牌依然按球号升序排列
    const refereeP1Hand = await getHandBallNumbers(hostPage);
    expect(refereeP1Hand.length).toBeGreaterThan(0);
    expect(refereeP1Hand).toEqual([...refereeP1Hand].sort((a, b) => a - b));

    await hostContext.close();
    await guestContext.close();
  });

  test('7. Hand Cards Point Sorting & Penalty Log Privacy Protection Verification (手牌球号/点数排序与罚牌日志隐私防泄漏测试)', async ({
    browser,
  }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    hostPage.on('dialog', (d) => d.accept());
    guestPage.on('dialog', (d) => d.accept());

    // Host 创建房间
    await hostPage.goto('/');
    await hostPage.waitForTimeout(500);
    await hostPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('PriHost');
    await hostPage.click('button:has-text("创建新房间")');
    await hostPage.click('button:has-text("一键创建数字房间")');

    await hostPage.waitForSelector('text=已加入玩家');
    const roomCodeElement = hostPage.locator('header span.font-mono').first();
    await expect(roomCodeElement).not.toHaveText('');
    const roomCode = (await roomCodeElement.innerText()).trim();
    // Guest 加入房间
    await guestPage.goto('/');
    await guestPage.waitForTimeout(500);
    await guestPage.locator('input[placeholder*="请输入你的大名/外号"]').fill('PriGuest');
    await guestPage.click('button:has-text("加入朋友房间")');
    await guestPage.locator('input[placeholder*="输入 4 位数字房间码"]').fill(roomCode);
    await guestPage.click('button:has-text("进入球局")');

    await expect(hostPage.locator('text=PriGuest').first()).toBeVisible({ timeout: 5000 });

    // 房主发牌
    await hostPage.click('button:has-text("开始扑克发牌")');
    await hostPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });
    await guestPage.waitForSelector('text=我的手上扑克手牌', { timeout: 5000 });

    // 1. 验证双侧玩家初始发牌手牌均为严格升序
    const hostHand1 = await getHandBallNumbers(hostPage);
    const guestHand1 = await getHandBallNumbers(guestPage);
    expect(hostHand1.length).toBeGreaterThan(0);
    expect(guestHand1.length).toBeGreaterThan(0);
    expect(hostHand1).toEqual([...hostHand1].sort((a, b) => a - b));
    expect(guestHand1).toEqual([...guestHand1].sort((a, b) => a - b));

    // 2. 玩家主动犯规：验证手牌保持升序 & 日志不泄漏点数花色
    await hostPage.click('button:has-text("记录犯规")');
    await hostPage.click('.fixed button:has-text("确认记录犯规")');
    await hostPage.waitForTimeout(500);

    const hostHand2 = await getHandBallNumbers(hostPage);
    expect(hostHand2.length).toBe(hostHand1.length + 1);
    expect(hostHand2).toEqual([...hostHand2].sort((a, b) => a - b));

    const hostFoulLogItem = hostPage.locator('.glass-panel div').filter({ hasText: 'PriHost 犯规' }).last();
    const hostFoulLog = await hostFoulLogItem.innerText();
    expect(hostFoulLog).toContain('PriHost 犯规');
    expect(hostFoulLog).toContain('罚抽 1 张扑克牌');
    expect(hostFoulLog).not.toMatch(/[♠♥♣♦]/);

    // 3. 裁判代记犯规：验证目标玩家手牌保持升序 & 日志不泄漏点数花色
    await hostPage.click('button:has-text("记录犯规")');
    await hostPage.click('.fixed button:has-text("PriGuest")');
    await hostPage.click('.fixed button:has-text("确认记录犯规")');
    await guestPage.waitForTimeout(500);

    const guestHand2 = await getHandBallNumbers(guestPage);
    expect(guestHand2.length).toBe(guestHand1.length + 1);
    expect(guestHand2).toEqual([...guestHand2].sort((a, b) => a - b));

    const proxyFoulLogItem = guestPage.locator('.glass-panel div').filter({ hasText: 'PriGuest 犯规' }).last();
    const proxyFoulLog = await proxyFoulLogItem.innerText();
    expect(proxyFoulLog).toContain('PriGuest 犯规');
    expect(proxyFoulLog).toContain('罚抽 1 张扑克牌');
    expect(proxyFoulLog).not.toMatch(/[♠♥♣♦]/);

    await hostContext.close();
    await guestContext.close();
  });
});
