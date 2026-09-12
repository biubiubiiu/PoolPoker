import { expect, test } from '@playwright/test';

test.describe('PoolPoker (球霸扑克) Comprehensive Integration Test Suite', () => {
  // 辅助函数：提取当前页面展示的玩家手牌球号列表
  const getHandBallNumbers = async (page: any) => {
    const cardElements = page.locator('.poker-prop-card .corner-ball, .poker-card-frame .ball-number');
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

    // 设置玩家姓名 (<=10字符)、选择球色配置
    const nameInput = page.locator('input[placeholder*="请输入你的大名/外号"]');
    await nameInput.fill('Alice');

    // 切换选择星牌球桌配置
    const themeSelect = page.locator('select');
    await themeSelect.selectOption('xingpai');

    // 验证 LocalStorage 持久化
    const savedName = await page.evaluate(() => localStorage.getItem('billiards_player_name'));
    const savedTheme = await page.evaluate(() => localStorage.getItem('billiards_ball_config_key'));
    const savedUserId = await page.evaluate(() => localStorage.getItem('billiards_user_id'));
    expect(savedName).toBe('Alice');
    expect(savedTheme).toBe('xingpai');
    expect(savedUserId).toBeTruthy();

    // 刷新页面，验证配置保存生效
    await page.reload();
    await page.waitForTimeout(500);
    await expect(nameInput).toHaveValue('Alice');
    await expect(themeSelect).toHaveValue('xingpai');
  });

  test('1.1 Backend Server Settings Navigation, Multi-Address Saving & Switching', async ({ page }) => {
    page.on('dialog', (d) => d.accept());
    await page.addInitScript(() => {
      (window as any).__TAURI__ = {};
    });
    await page.goto('/');
    await page.waitForTimeout(500);

    // 点击右上角设置按钮，跳转到服务器设置页面
    const settingsBtn = page.locator('button:has-text("设置服务地址")');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    // 验证展示后端服务地址设置页面
    await expect(page.locator('h2:has-text("后端服务地址设置")')).toBeVisible();
    await expect(page.locator('text=默认同源 (Same Origin)')).toBeVisible();

    // 添加新的服务器地址
    const urlInput = page.locator('input[placeholder*="http://192.168.18.227:3000"]');
    const nameInput = page.locator('input[placeholder*="备注名称"]');
    const saveBtn = page.locator('button:has-text("保存并切换使用")');

    await urlInput.fill('http://192.168.18.227:3000');
    await nameInput.fill('测试局域网');
    await saveBtn.click();

    // 验证新添加的服务器项在列表中显示并被选中
    await expect(page.locator('text=测试局域网')).toBeVisible();
    await expect(page.locator('text=http://192.168.18.227:3000').first()).toBeVisible();

    const savedUrl = await page.evaluate(() => localStorage.getItem('poolpoker_server_url'));
    expect(savedUrl).toBe('http://192.168.18.227:3000');

    // 删除刚保存的服务器地址
    const deleteBtn = page.locator('button[title="删除地址"]').first();
    await deleteBtn.click();

    // 验证已恢复为默认同源
    const restoredUrl = await page.evaluate(() => localStorage.getItem('poolpoker_server_url'));
    expect(restoredUrl).toBeNull();

    // 点击返回大厅
    const backBtn = page.locator('button:has-text("返回大厅")');
    await backBtn.click();
    await expect(page.locator('h1:has-text("PoolPoker · 球霸扑克")')).toBeVisible();
  });

  test('1.2 Game Entry UI Switch: Default Off on Web, Default On on Tauri, Persistence & UI Toggle', async ({
    page,
  }) => {
    // 1. Web 环境下默认关闭
    await page.goto('/');
    await page.waitForTimeout(500);

    const switchLabel = page.locator('label:has-text("新版界面")').first();
    await expect(switchLabel).toBeVisible();
    const switchInput = switchLabel.locator('input[type="checkbox"]');
    expect(await switchInput.isChecked()).toBe(false);

    // 2. 点击切换为开启，验证 localStorage 持久化
    await switchLabel.click();
    expect(await switchInput.isChecked()).toBe(true);
    let savedPref = await page.evaluate(() => localStorage.getItem('poolpoker_use_new_ui'));
    expect(savedPref).toBe('true');

    // 刷新页面，验证仍保持开启
    await page.reload();
    await page.waitForTimeout(500);
    const reloadedSwitch = page.locator('label:has-text("新版界面") input[type="checkbox"]').first();
    expect(await reloadedSwitch.isChecked()).toBe(true);

    // 再次点击切回关闭
    await page.locator('label:has-text("新版界面")').first().click();
    expect(await reloadedSwitch.isChecked()).toBe(false);
    savedPref = await page.evaluate(() => localStorage.getItem('poolpoker_use_new_ui'));
    expect(savedPref).toBe('false');

    // 3. 模拟 Tauri 环境：清空 localStorage 后默认开启
    await page.evaluate(() => localStorage.removeItem('poolpoker_use_new_ui'));
    await page.addInitScript(() => {
      (window as any).__TAURI__ = {};
    });
    await page.reload();
    await page.waitForTimeout(500);
    const tauriSwitch = page.locator('label:has-text("新版界面") input[type="checkbox"]').first();
    expect(await tauriSwitch.isChecked()).toBe(true);
  });

  test('1.3 Classic V1 Gameplay Interface Verification (PokerCard, BilliardsTable, GameLogs, GameHeader)', async ({
    page,
  }) => {
    page.on('dialog', (d) => d.accept());
    await page.goto('/');
    await page.waitForTimeout(500);
    // 确保使用 V1 旧版界面（默认关闭）
    await page.evaluate(() => localStorage.setItem('poolpoker_use_new_ui', 'false'));
    await page.reload();
    await page.waitForTimeout(500);

    await page.locator('input[placeholder*="请输入你的大名/外号"]').fill('V1Player');
    await page.click('button:has-text("创建新房间")');
    await page.click('button:has-text("一键创建数字房间")');
    await page.waitForSelector('text=已加入玩家');

    // 开局
    await page.click('button:has-text("开始扑克发牌")');
    // 验证展示 V1 界面特有的组件元素：
    // - 我的手上扑克手牌区
    await expect(page.locator('text=我的手上扑克手牌')).toBeVisible();
    // - 2D PokerCard 扑克手牌
    const pokerCards = page.locator('.poker-card-frame');
    await expect(pokerCards.first()).toBeVisible();
    // - 局况对比与球盘表格 (BilliardsTable)
    await expect(page.locator('text=全局赛况')).toBeVisible();
    // - 对局实况日志 (GameLogs)
    await expect(page.locator('text=对局实况日志')).toBeVisible();
    // - 顶部 GameHeader 在游戏中正常显示
    await expect(page.locator('header span.font-mono')).toBeVisible();

    // 点击一张手牌消牌
    const firstCard = pokerCards.first();
    await firstCard.click();
    await page.waitForTimeout(500);
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
    await hostContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));
    await guestContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));

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

    await hostPage.waitForSelector('.hand-zone', { timeout: 10000 });
    await guestPage.waitForSelector('.hand-zone', { timeout: 10000 });

    // 验证初始发牌手牌按球号/点数升序排列
    const initialHostHand = await getHandBallNumbers(hostPage);
    expect(initialHostHand.length).toBeGreaterThan(0);
    expect(initialHostHand).toEqual([...initialHostHand].sort((a, b) => a - b));

    // --- 3.1 测试【记录犯规 (Record Foul)】（默认选中自己）---
    const initialHandCardsCount = await hostPage.locator('.poker-prop-card').count();
    await hostPage.click('button:has-text("犯规罚牌")');
    await expect(hostPage.locator('.fixed:has-text("记录犯规")').first()).toBeVisible();
    // 验证默认选中的玩家为自己 HostP1
    await expect(hostPage.locator('.fixed button.bg-red-950\\/60:has-text("HostP1")')).toBeVisible();
    await hostPage.click('.fixed button:has-text("确认记录犯规")');
    await hostPage.waitForTimeout(600);
    const afterPenaltyHandCardsCount = await hostPage.locator('.poker-prop-card').count();
    expect(afterPenaltyHandCardsCount).toBe(initialHandCardsCount + 1);

    // 验证犯规罚牌后手牌依然按球号严格升序排列
    const hostHandAfterPenalty = await getHandBallNumbers(hostPage);
    expect(hostHandAfterPenalty.length).toBe(afterPenaltyHandCardsCount);
    expect(hostHandAfterPenalty).toEqual([...hostHandAfterPenalty].sort((a, b) => a - b));

    // 验证犯规日志未泄露抽到的具体扑克牌花色与点数（在侧滑菜单实况日志中查验）
    await hostPage.click('button[aria-label="打开对局菜单"]');
    await hostPage.waitForSelector('text=对局菜单', { timeout: 5000 });
    const foulLogItem = hostPage.locator('.drawer-content div').filter({ hasText: 'HostP1 犯规' }).last();
    await expect(foulLogItem).toBeVisible();
    const foulLogText = await foulLogItem.innerText();
    expect(foulLogText).toContain('罚抽 1 张扑克牌');
    expect(foulLogText).not.toMatch(/[♠♥♣♦]/);
    await hostPage.click('button:has-text("✕")');
    await hostPage.waitForTimeout(300);

    // --- 3.2 测试【记录进球 (Record Pocket Ball)】及全场进球免打置灰 ---
    await hostPage.click('button[aria-label="打开对局菜单"]');
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

    // 验证全场实况日志记录了判定/进球事件
    await hostPage.click('button[aria-label="打开对局菜单"]');
    await expect(hostPage.locator('.drawer-content').getByText('8号球').first()).toBeVisible({
      timeout: 5000,
    });
    await hostPage.click('button:has-text("✕")');
    await hostPage.waitForTimeout(300);

    // --- 3.3 测试【打卡销牌 (Confirm Pocket)】---
    const cardToPocket = hostPage.locator('.poker-prop-card:not(.is-dimmed):not([disabled])').first();
    if (await cardToPocket.isVisible()) {
      await cardToPocket.click();
      await hostPage.waitForTimeout(800);

      // --- 3.4 测试【撤回上一步 (Retract)】---
      const retractBtn = hostPage.locator('button:has-text("撤回上一步")');
      if (await retractBtn.isEnabled()) {
        await retractBtn.click();
        await hostPage.waitForTimeout(600);

        // 验证侧边栏实况日志显示了撤回记录
        await hostPage.click('button[aria-label="打开对局菜单"]');
        await expect(hostPage.locator('.drawer-content').getByText('已撤回到上一步操作').first()).toBeVisible({
          timeout: 5000,
        });
        await hostPage.click('button:has-text("✕")');
        await hostPage.waitForTimeout(300);
      }
    }

    // --- 3.5 测试【重置局况 (Restart Modal)】---
    await hostPage.click('button[aria-label="打开对局菜单"]');
    await hostPage.click('button:has-text("重新开始本局对决")');
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
    await page.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));

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
    await page.waitForSelector('.hand-zone', { timeout: 10000 });

    // 打掉手上的单张卡牌
    const cardToPocket = page.locator('.poker-prop-card:not(.is-dimmed):not([disabled])').first();
    await cardToPocket.click();

    // 验证弹出 VictoryModal，并展示累计战报（总积分 + 胜出徽章）
    await expect(page.locator('text=Victory')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=已清空有效手牌，保留的免打牌不影响获胜。')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('text=总积分:').first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('text=🏆 胜出').first()).toBeVisible({
      timeout: 5000,
    });

    // 开启第 2 局
    await page.click('button:has-text("再来一局")');
    await page.waitForSelector('text=开始扑克发牌', { timeout: 5000 });
    await page.click('button:has-text("开始扑克发牌")');

    await page.waitForSelector('.hand-zone', { timeout: 10000 });

    // 再次打掉手牌，获得第 2 胜
    const secondCardToPocket = page.locator('.poker-prop-card:not(.is-dimmed):not([disabled])').first();
    await secondCardToPocket.click();

    // 验证 VictoryModal 展示累计战报
    await expect(page.locator('text=Victory')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=已清空有效手牌，保留的免打牌不影响获胜。')).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator('text=🏆 胜出').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('5. Multi-Player Simultaneous Victory Settlement & Next-Round First Player Priority', async ({ browser }) => {
    test.setTimeout(90000);
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await hostContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));
    await guestContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));

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

    // 调整规则为每人 2 张牌，加速多人联合胜利逻辑执行
    const cardMinusBtn = hostPage.locator('button:has-text("-")');
    for (let i = 0; i < 3; i++) {
      await cardMinusBtn.click();
      await hostPage.waitForTimeout(200);
    }

    // 开始第 1 局
    await hostPage.click('button:has-text("开始扑克发牌")');
    await hostPage.waitForSelector('.hand-zone', { timeout: 10000 });
    await guestPage.waitForSelector('.hand-zone', { timeout: 10000 });

    // 提取未消除的扑克球号数组
    const getUnpocketedBallList = async (page: any) => {
      const cornerBalls = page.locator('.poker-prop-card:not(.is-dimmed) .corner-ball');
      const count = await cornerBalls.count();
      const balls: number[] = [];
      for (let i = 0; i < count; i++) {
        const text = await cornerBalls.nth(i).innerText();
        const num = parseInt(text.trim(), 10);
        if (!Number.isNaN(num)) balls.push(num);
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
      await hostPage.click('button:has-text("犯规罚牌")');
      await hostPage.click('.fixed button:has-text("确认记录犯规")');
      await hostPage.waitForTimeout(400);
      hostBalls = await getUnpocketedBallList(hostPage);
      guestBalls = await getUnpocketedBallList(guestPage);
      sharedBall = findSharedBall(hostBalls, guestBalls);
    }

    // 房主通过“记录进球”将所有非 sharedBall 的球打进
    const nonSharedBalls = Array.from(new Set([...hostBalls, ...guestBalls])).filter((b) => b !== sharedBall);
    for (const ballNum of nonSharedBalls) {
      const ballTarget = hostPage.locator(`.ball-target[aria-label^="记录 ${ballNum} 号球入袋"]`).first();
      if (await ballTarget.isVisible()) {
        await ballTarget.click();
        await hostPage.waitForTimeout(400);
      }
    }

    // 打进剩余手牌直至触发胜利结算
    while (true) {
      const isVictoryOpen = await hostPage
        .locator('text=Victory')
        .first()
        .isVisible()
        .catch(() => false);
      if (isVictoryOpen) break;
      const remainingCards = hostPage.locator('.poker-prop-card:not(.is-dimmed)');
      if ((await remainingCards.count()) === 0) break;
      await remainingCards.first().click();
      const victoryFound = await hostPage
        .waitForSelector('text=Victory', { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (victoryFound) break;
      await hostPage.waitForTimeout(600);
    }

    // 验证多名玩家同时胜利结算弹窗 display
    await expect(hostPage.locator('text=Victory')).toBeVisible({ timeout: 10000 });
    await expect(guestPage.locator('text=Victory')).toBeVisible({ timeout: 10000 });
    await expect(
      hostPage.locator('text=共同清空有效手牌，赢得本局胜利！').or(hostPage.locator('text=已清空有效手牌'))
    ).toBeVisible({ timeout: 5000 });

    // 验证打出手牌的 HostWin 放在首位
    const victoryTitleText = await hostPage.locator('.glass-panel h2, .glass-panel .text-lg').first().innerText();
    expect(victoryTitleText).toContain('HostWin');
    if (victoryTitleText.includes('GuestWin')) {
      expect(victoryTitleText.indexOf('HostWin')).toBeLessThan(victoryTitleText.indexOf('GuestWin'));
    }

    // 点击再来一局
    await hostPage.click('button:has-text("再来一局")');
    await hostPage.waitForSelector('text=开始扑克发牌', { timeout: 5000 });
    await hostPage.click('button:has-text("开始扑克发牌")');

    // 验证下一局 HostWin 优先作为第一位击球（在桌面击球顺序栏中展示）
    await hostPage.waitForSelector('.hand-zone', { timeout: 10000 });
    await hostPage.waitForSelector('.turn-order-strip', { timeout: 5000 });
    const orderText = await hostPage.locator('.turn-order-strip').innerText();
    expect(orderText).toMatch(/HostWin[\s\S]*GuestWin/);

    await hostContext.close();
    await guestContext.close();
  });

  test('6. Referee Mode Proxy Ball Potting & Proxy Foul Drawing (记录进球与记录犯规功能)', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    await hostContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));
    await guestContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));

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
    await hostPage.waitForSelector('.hand-zone', { timeout: 10000 });
    await guestPage.waitForSelector('.hand-zone', { timeout: 10000 });

    // 1. Guest (RefereeP2) 为 Host (RefereeP1) 记录进球
    await guestPage.click('button[aria-label="打开对局菜单"]');
    await guestPage.click('button:has-text("记录进球")');
    await guestPage.waitForSelector('.fixed:has-text("记录进球")');

    // 验证 Guest 点开时默认选中的是自己 RefereeP2
    await expect(guestPage.locator('.fixed button.bg-emerald-500\\/30:has-text("RefereeP2")')).toBeVisible();

    // 切换选择 RefereeP1
    await guestPage.click('.fixed button:has-text("RefereeP1")');
    // 选择 1号球
    await guestPage.click('.fixed button:has-text("1号")');
    await guestPage.click('.fixed button:has-text("确认记录进球")');

    // 验证日志中包含记录
    await hostPage.click('button[aria-label="打开对局菜单"]');
    await expect(hostPage.locator('.drawer-content').getByText('RefereeP2').first()).toBeVisible({
      timeout: 5000,
    });
    await hostPage.click('button:has-text("✕")');
    await hostPage.waitForTimeout(300);

    // 2. Guest (RefereeP2) 为 Host (RefereeP1) 记录犯规
    await guestPage.click('button[aria-label="打开对局菜单"]');
    await guestPage.click('button:has-text("记录犯规")');
    await guestPage.waitForSelector('.fixed:has-text("记录犯规")');

    // 验证 Guest 点开时默认选中的是自己 RefereeP2
    await expect(guestPage.locator('.fixed button.bg-red-950\\/60:has-text("RefereeP2")')).toBeVisible();

    // 切换选择 RefereeP1
    await guestPage.click('.fixed button:has-text("RefereeP1")');
    await guestPage.click('.fixed button:has-text("确认记录犯规")');

    // 验证侧滑菜单日志记录犯规，且未泄露裁判代抽的具体扑克花色点数
    await hostPage.click('button[aria-label="打开对局菜单"]');
    const proxyFoulLogItem = hostPage.locator('.drawer-content div').filter({ hasText: '裁判代记' }).last();
    await expect(proxyFoulLogItem).toBeVisible({ timeout: 5000 });
    const proxyFoulLogText = await proxyFoulLogItem.innerText();
    expect(proxyFoulLogText).toContain('RefereeP1 犯规');
    expect(proxyFoulLogText).toContain('罚抽 1 张扑克牌');
    expect(proxyFoulLogText).not.toMatch(/[♠♥♣♦]/);
    await hostPage.click('button:has-text("✕")');

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
    await hostContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));
    await guestContext.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));

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
    await hostPage.waitForSelector('.hand-zone', { timeout: 10000 });
    await guestPage.waitForSelector('.hand-zone', { timeout: 10000 });

    // 1. 验证双侧玩家初始发牌手牌均为严格升序
    const hostHand1 = await getHandBallNumbers(hostPage);
    const guestHand1 = await getHandBallNumbers(guestPage);
    expect(hostHand1.length).toBeGreaterThan(0);
    expect(guestHand1.length).toBeGreaterThan(0);
    expect(hostHand1).toEqual([...hostHand1].sort((a, b) => a - b));
    expect(guestHand1).toEqual([...guestHand1].sort((a, b) => a - b));

    // 2. 玩家主动犯规：验证手牌保持升序 & 日志不泄漏点数花色
    await hostPage.click('button:has-text("犯规罚牌")');
    await hostPage.click('.fixed button:has-text("确认记录犯规")');
    await hostPage.waitForTimeout(500);

    const hostHand2 = await getHandBallNumbers(hostPage);
    expect(hostHand2.length).toBe(hostHand1.length + 1);
    expect(hostHand2).toEqual([...hostHand2].sort((a, b) => a - b));

    await hostPage.click('button[aria-label="打开对局菜单"]');
    const hostFoulLogItem = hostPage.locator('.drawer-content div').filter({ hasText: 'PriHost 犯规' }).last();
    const hostFoulLog = await hostFoulLogItem.innerText();
    expect(hostFoulLog).toContain('PriHost 犯规');
    expect(hostFoulLog).toContain('罚抽 1 张扑克牌');
    expect(hostFoulLog).not.toMatch(/[♠♥♣♦]/);
    await hostPage.click('button:has-text("✕")');

    // 3. 裁判代记犯规：验证目标玩家手牌保持升序 & 日志不泄漏点数花色
    await hostPage.click('button[aria-label="打开对局菜单"]');
    await hostPage.click('button:has-text("记录犯规")');
    await hostPage.click('.fixed button:has-text("PriGuest")');
    await hostPage.click('.fixed button:has-text("确认记录犯规")');
    await guestPage.waitForTimeout(500);

    const guestHand2 = await getHandBallNumbers(guestPage);
    expect(guestHand2.length).toBe(guestHand1.length + 1);
    expect(guestHand2).toEqual([...guestHand2].sort((a, b) => a - b));

    await guestPage.click('button[aria-label="打开对局菜单"]');
    const proxyFoulLogItem = guestPage.locator('.drawer-content div').filter({ hasText: 'PriGuest 犯规' }).last();
    const proxyFoulLog = await proxyFoulLogItem.innerText();
    expect(proxyFoulLog).toContain('PriGuest 犯规');
    expect(proxyFoulLog).toContain('罚抽 1 张扑克牌');
    expect(proxyFoulLog).not.toMatch(/[♠♥♣♦]/);
    await guestPage.click('button:has-text("✕")');

    await hostContext.close();
    await guestContext.close();
  });

  test('8. Immersive V2 Pool Table Features, Break Mode, Drawer & Rules Modal', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('poolpoker_use_new_ui', 'true'));
    await page.goto('/');
    await page.waitForTimeout(500);
    await page.locator('input[placeholder*="请输入你的大名/外号"]').fill('V2Tester');
    await page.click('button:has-text("创建新房间")');
    await page.click('button:has-text("一键创建数字房间")');

    await page.waitForSelector('text=已加入玩家');
    await page.click('button:has-text("开始扑克发牌")');
    await page.waitForSelector('.hand-zone', { timeout: 10000 });

    // 1. 验证 3D 球桌画布及 15 个球号交互靶点渲染
    await expect(page.locator('.arena canvas')).toBeVisible();
    const ballTargets = page.locator('.ball-target');
    await expect(ballTargets).toHaveCount(15);

    // 2. 验证手牌展开与收拢功能
    const expandBtn = page.locator('.expand-hand');
    await expect(expandBtn).toBeVisible();
    await expect(expandBtn).toHaveText('展开手牌');
    await expandBtn.click();
    await expect(expandBtn).toHaveText('收拢手牌');
    await expandBtn.click();
    await expect(expandBtn).toHaveText('展开手牌');

    // 3. 验证点球呼出归属浮层 (BallAssignSheet) 并选择开球进球
    const ball1Target = page.locator('.ball-target[aria-label*="1 号球入袋"]').first();
    await ball1Target.click();
    await expect(page.locator('text=已入袋')).toBeVisible();
    await expect(page.locator('text=开球进球 / 公球免打')).toBeVisible();

    // 点击开球进球 / 公球免打
    await page.click('button:has-text("开球进球 / 公球免打")');
    await page.waitForTimeout(600);
    await expect(page.locator('text=已入袋')).not.toBeVisible();

    // 4. 验证对局控制抽屉与积分计算规则说明弹窗
    await page.click('button[aria-label="打开对局菜单"]');
    await expect(page.locator('text=对局菜单')).toBeVisible();
    await expect(page.locator('text=牌库剩余扑克')).toBeVisible();

    // 查看积分规则弹窗
    await page.click('button:has-text("查看积分计算规则")');
    await expect(page.locator('h3:has-text("积分计算规则")')).toBeVisible();
    await expect(page.locator('text=牌的基础分值')).toBeVisible();
    await expect(page.locator('text=大王 / 小王')).toBeVisible();
    await expect(page.locator('text=组合倍率')).toBeVisible();

    // 关闭规则弹窗
    await page.click('.fixed:has-text("积分计算规则") button:has-text("✕")');
    await expect(page.locator('h3:has-text("积分计算规则")')).toBeHidden();
  });
});
