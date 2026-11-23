# r11-lock 交付说明（分支 `r11-lock`，从主线 `926bc91` 开出）

两件：一、锁定目标（提交 `dba8542`）；二、血条打击感 · 修仙版（提交 `19be29e`）。截图在 `tools\out\r11-lock\`（`tools/out` 不进库），都逐张看过。

试玩（开发服务器 `npx vite --port 5214 --strictPort --host 127.0.0.1`；5213 被别的目录起的一个 vite 占着，没动它）：

- 锁定：`/tools/perf-acceptance.html?auto=new&map=tiannan&try=lock&at=foe|neutral|tree|off|boss|fly`（`&lockboss=1` 改锁首领，`&touch=1` 手机布局）
- 血条：`/tools/perf-acceptance.html?auto=new&map=tiannan&try=hpbar`，页面上 `__hp.hit('lock'|'boss'|'me', 0.2, 'normal'|'fire'|'ice'|'poison'|'thunder')`、`__hp.dot('me', 3)`、`__hp.heal('lock', 0.3)`、`__hp.mp(0.3)`、`__hp.poise()`

## 一、锁定目标

### 做了什么

1. **立体锁定标记**（新文件 `src/gl/lockgl.ts`，挂在 `gl/combatgl.ts` 的单位循环之后）
   - 脚下一圈横躺的锁定环 + 三段反向旋转的弧（手动锁定再多一圈短刻），画在单位脚下的离地高度上（`e.z`：被击飞、御剑、腾起都跟着，地面起伏跟着贴）。
   - 头顶一枚竖长菱形 + 下指的「V」，在名牌上方浮动；目标被顶到画面顶栏那一带时往下让、贴着身子。
   - 颜色按态度（`world/locktarget.ts` 的 `lockStance`）：冲你来的敌对朱红、没交手 / 切磋中立金色、同阵友方青色。
   - 透过遮挡：头顶标记和锁定环朝镜头的那半圈再画一层「深度最近」的透视层，树、房子挡着也看得见（只取朝镜头那半圈，免得透视层盖在被锁的人自己身上）。
   - 换目标：环从两倍多大收缩落定、外圈亮环往里收、头顶标记从上落下；手动锁上（Tab、点选）更重，还有一声合成的「咔」（`audio.ts` 新增 `lock`）。自动锁定换人只轻收一下、不响。
   - 目标在画面外：屏幕边缘出一枚指向它的箭头（避开四角的人物牌、小地图和底下的快捷栏）。
   - 平面兼容画法（没有立体投影时）仍是 `combatfx.ts` 原来那圈椭圆；立体画面里不再把那圈画进人物立板（立起来看不出是圈）。
2. **锁定后的大血条**（`src/ui/BossHUD.tsx` 重写，复用首领血条的样式和组件）
   - 态度印（敌 / 中 / 友）、名字、境界 / 阶数、「锁定 / 目标」（手动 / 自动）、比自己高的标「险」、气血大条 + 残影条、近战交手时的罡气条、状态（燃烧、中毒……剩几息）、护体灵光、精英词缀。
   - 锁的就是首领：只出首领那一条，条头多一枚「锁」印、条下多一行罡气 / 状态；锁的不是首领、首领又在打：首领条收窄在上、目标条在下，都在顶栏堆叠里按顺序排，不互相压。
   - 原来的小目标框 `TargetFrame` 不再挂（组件还在 `Hud.tsx` 里没删）。引导气泡的让位名单加了 `.lock-hud`。
   - 手机 844×390、390×844 都看过：在顶栏堆叠里，不挡摇杆和法诀盘。动效只动 transform / opacity。
3. **锁定跟随镜头**（新文件 `src/world/lockcam.ts`）
   - 焦点取「你—目标」连线上靠你的三成五处，同时略拉远把两人框进画面；超过跟随距离（投放距离 × 1.25，700–1800）的最后两成渐渐放掉；临界阻尼弹簧，换目标不跳、不过冲。
   - 御剑高空、遁空、虚空（含虚空斗法、往天外升降）、海渊、虚空挪移时让出；近战 / 撼山客出招时镜头本来就由 `brawl.cameraTick` 整个接管，不抢。
   - 设置面板加「锁定跟随镜头」开关（`taixu.lockcam`，默认开）；关掉时照原来的写法（锁定在投放距离内偏三成二、指数平滑）。
4. **Tab 手感**
   - 顺序：神识范围内能锁的人，敌对在前，同一类由近到远，到头了从头再来。还没手动锁定时，鼠标四秒内指过谁（两百以内）就先锁谁。
   - Esc：手动锁着人、没开面板时，先取消锁定（回到自动锁最近的敌人），再按一次才开设置。
   - 点选：按单位在屏幕上的身子（立体投影出来的脚—头竖线）找，飞着的、高大的都点得中；点的正是手动锁着的那位 → 取消。触屏一样（实测：点一下锁上、再点取消；Tab、Esc 也实测过）。
   - 目标死了：照旧转到最近的敌对（自动）。锁定范围不变（手动在神识内有效，自动在投放距离内）。
   - 键位说明（电脑和手机两套）写清了。默认键没新增（Tab 原有，Esc 是固定键）。

### 改了哪些共享文件（哪几处）

- `src/world/combat.ts`：加一行 import；`cycleLock` 那一段换成 `lockTrack` 字段 + `lockOrder()` + 新 `cycleLock()` + `unlock()`；`update` 里 `refreshLock` 后加一行 `this.lockTrack.tick(this, dt)`。`combat.lock` / `manual` 的语义、`hitEnemy` / `hitPlayer` 没动。
- `src/world/game.ts`：两行 import；`lockCam` 字段；战斗取景那段（锁定跟随开时用弹簧、关时原样）；鼠标 / 触屏点选两处（`pickAtScreen`、再点取消）。
- `src/world/combatfx.ts`：`drawEnemy` 里原来的锁定椭圆包一层「没有立体投影才画」。绘制列表结构、标签字符串没动。
- `src/world/audio.ts`：`OldKind` 加 `'lock'`，`sfx` 加一个 case。
- `src/gl/combatgl.ts`（另一条线可能也动 `gl/`）：只加一行 import、一行 `drawLockGL(F, c, t)`。**没碰** `gl/batch.ts`、`gl/atlas.ts`、`gl/stage.ts`、`world/render.ts`、混合方式和图集（透视层是把自己刚写的顶点深度改成 -1；实心菱形取 Disc 格正中一小块）。
- 界面：`ui/BossHUD.tsx`、`ui/GameView.tsx`（Esc、卸掉 TargetFrame、血条画布）、`ui/Coach.tsx`（让位名单一项）、`ui/KeysHelp.tsx`、`ui/Panels.tsx`（设置开关）、`ui/hud.css`。
- 工具：`tools/perf-acceptance.ts`（`try=lock`、`try=hpbar`）、`tools/try-brawl.ts`（`openField` 加 export）。
- 固定种子路径：没多取 `Math.random`（锁定、镜头、血条特效都按时间或自己的小序列）。

### 测试

- `npx tsc --noEmit -p .` 过；`npx tsx tools/test-ui.tsx` 过；`node tools/check-anim.mjs` 过。
- `run-suite --jobs=1`：`test-lock`（新，34 项）、`test-target`、`test-combat`、`test-combat-*`（7 项）、`test-fx-combat`、`test-reach`、`test-brawl`、`test-hanshan`、`test-elite`、`test-tutorial`、`test-renderer-lifecycle` 全过。
- `test-mymods` 失败：工作副本里缺 `dist-mods/drgnext-1.2.1.fmod`（模组包不在库里），不是这次改动带来的，没在这里补。
- 截图：`lock-foe` / `lock-neutral` / `lock-tree`（被树挡着）/ `lock-off`（画面外边缘箭头）/ `lock-boss`（首领 + 普通目标两条）/ `lock-fly`（悬在高处，环跟着高度）/ `lock-snap`（Tab 换目标那一下的收缩）/ `lock-touch-844x390` / `lock-touch-390x844` / `lock-settings`。

### 没做到 / 要知道的

- 自动锁定（没按 Tab 时下一招会打的那位）也显示标记和大条，只是更淡、条上写「目标」；所以 Esc 取消手动锁定后，战斗里标记会落回最近的敌人身上。
- 透视层只有头顶标记和朝镜头的半圈；锁定环背面那半圈被挡时照常看不见。
- 近战自己的「对手」（`brawl.foe`）不单独打标记，标记只跟 `combat.lock`。
- 平面兼容画法（Canvas2D 回退）没做新标记、也没看图；性能没量。
- 同屏单位很多时没专门压测锁定标记的开销（一帧多两百来个顶点）。

## 二、血条打击感 · 修仙版

### 做了什么（`src/ui/hpfx.ts`）

一张盖在界面上的小画布（`.hpfx-layer`，不接点击；有东西在动才跑 rAF，动完停、清屏），对象池（同时最多 280 个、碎片组最多 10 组）。

1. **碎玉**：掉的那一截（宽 = 总宽 × 掉的比例，左沿贴住掉血后红条的右沿）裂成两三块玉片，分界是相邻两块共用的锯齿线、合起来正好那一截；往下掉、翻转，落尽化一缕墨烟 / 灵气。
2. **按伤害类型变**：火 → 琥珀碎片 + 余烬卷着上飘；冰 → 冰晶碎片 + 霜屑；毒 → 绿玉 + 绿烟；雷 → 紫白碎片 + 电火花；寻常 / 近战 → 白金碎玉（贴生成的玉纹）。重击（掉超过 15%）：四到六块、血条轻震、边框闪一道裂纹、右端再叠一枚朱砂印。
3. **持续掉血**（燃烧、中毒时的小口掉血）：右端一颗颗血珠往下滴（毒是绿的），落下溅成小墨点，不出碎片。
4. **右端闪光**：一团朱砂墨晕「按」一下（先压小再晕开、收淡）；法力是一团蓝光。
5. **残影条**：淡金色，停半拍（人物牌 0.42 息、大条 0.35 息）再缩回去。锁定目标大条、首领条、人物牌都是。
6. **回血**：青绿灵气光点从外面流进右端，荡开一圈玉色波纹（攒够 3% 出一次，自然回血也会偶尔冒一下）。
7. **濒死**（低于 25%）：血条边缘一圈呼吸的红墨（人物牌整块牌子外沿也渗一圈）；**罡气被打空**时琉璃一样碎开（近战罡气条、锁定目标条下的罡气条）。
8. **用在哪**：人物牌气血、法力（蓝色轻量版，持续的小耗不碎）、锁定目标大条、首领条、队伍框（轻量版：一两块、不叠印不震）。
9. 低画质档（`renderer.tier` 0）只留右端闪光和残影条。CSS 动画只动 transform / opacity（`check-anim` 过）。
10. 贴图用 our-codex-image 生成三张（玉片、墨晕、朱砂印），压成 webp 放 `src/assets/hpfx/`，合计约 45 KB。

### 伤害类型怎么认

没改 `hitEnemy` / `hitPlayer`：按这一帧身上新挂上的状态认（燃烧 → 火、冰冻 / 迟缓 → 冰、中毒 → 毒、麻痹 → 雷），没有就看还挂着的，都没有就是寻常。所以**不带状态的火球、雷法打中时按寻常碎**——要精确得在命中时记下来源的系别，那要动 `hitEnemy`，这次没动。

### 改了哪些文件

`ui/hpfx.ts`（新）、`ui/Hud.tsx`（`HudBar` 加可选 `fx`、濒死类名；人物牌接上；状态小图标「中毒」显示「毒」不再是「中」）、`ui/BossHUD.tsx`（大条接上、罡气碎琉璃）、`ui/BrawlHUD.tsx`（罡气条碎琉璃）、`ui/PartyFrames.tsx`（轻量版）、`ui/GameView.tsx`（画布）、`ui/hud.css`、`src/assets/hpfx/*.webp`。

### 测试

- 新单测 `tools/test-hpfx.ts`：900 宽掉 20% → 碎片合宽 180、左沿 720；切块首尾与合宽；碎片 / 滴血 / 回血 / 重击的判定；按状态认类型；粒子池上限与回收；低画质只留闪光。过。
- tsc、test-ui、check-anim 和上面那批相关测试都在这件之后重跑过，全过。
- 截图 `hpbar-normal` / `hpbar-fire` / `hpbar-ice-thunder` / `hpbar-poison-mp` / `hpbar-dot` / `hpbar-heal` / `hpbar-heavy` / `hpbar-heavy-dying` / `hpbar-poise` / `hpbar-lowq` / `hpbar-touch-844x390` / `hpbar-touch-390x844`。

### 没做到 / 要知道的

- 碎片高度就是血条高度（大条 12 像素、人物牌 8 像素），在人物牌上是细细的几片，手机上更小。
- 伤害类型靠状态推断（见上）。
- 没量性能；一次掉血是几块碎片加几团烟，粒子有上限，画布不打仗时不跑。
