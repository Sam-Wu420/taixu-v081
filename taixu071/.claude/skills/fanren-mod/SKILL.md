---
name: fanren-mod
description: 为《太虚问道录》（本仓库）制作、修改、调试、打包、发布外挂模组（.fmod）——加新法术 / 物品 / 妖兽 / 地点 / NPC / 剧情任务 / 界面面板 / 贴图动画 / 音乐，改原版数值；或扩展游戏的模组接口。用户提到「做模组」「写个 mod」「加一门功法 / 一种妖兽 / 一个地方 / 一个人物 / 一段剧情」「给人物换图」「模组报错」「模组接口不够用」「打包发布模组」时使用。
---

# 太虚问道录 · 模组制作

本仓库的游戏有一套外挂模组系统（v0.55 起）。玩家在标题画面 →「模组」里导入 `.fmod` 文件，或从模组平台一键安装，重新载入后生效。

**你的工作**分两种：

- **写模组**：大多数时候是这种。文件放在 `mods/<模组id>/`，**不改游戏源码**。
- **扩展模组接口**：模组需要的能力接口里没有时才做。这要改 `src/mod/`，见 [reference/extend-api.md](reference/extend-api.md)。

先确认是哪一种。用户说「加一门功法」，就写模组，不要去改 `src/data/arts.ts`。

## 写一个模组：标准流程

1. **想清楚要加什么**：法术？物品？妖兽？剧情？对照下面的「能力清单」确认接口支持。不支持就告诉用户，并给出扩展接口的方案。
2. **建文件夹**：从 `templates/` 里挑最接近的模板拷到 `mods/<id>/`（id 规则见下）。
3. **写 `manifest.json` 和 `index.js`**：字段参考 [reference/content.md](reference/content.md)，接口参考 [reference/api.md](reference/api.md)。
4. **试跑**（必须做，不要跳过）：
   ```bash
   npx tsx tools/mod-try.ts mods/<id>
   ```
   它会打包、在无头游戏里加载，然后逐项检查：施放每门法术、刷出并击杀每种妖兽、触发对话、每帧和每日回调、存档往返。最后报告 ✗ 问题和 ! 提醒。**有 ✗ 必须修**；! 要判断是不是用户想要的。
5. **在浏览器里看一眼**（新妖兽外观、法术特效、对话排版，工具看不出好不好看）：
   ```bash
   npx vite --port 5199          # 打开 http://127.0.0.1:5199/
   ```
   标题画面 → 模组 → 导入 `dist-mods/<id>-<版本>.fmod` → 重新载入 → 进游戏。按 F12，`[模组 <id>]` 开头的是模组日志。`__modHost.status` 能看每个模组的状态。
6. **交付**：给出 `.fmod` 的路径，说明加了什么、怎么触发、有哪些平衡上的取舍。

打包单独用：`npx tsx tools/mod-pack.ts mods/<id>`，输出到 `dist-mods/`。

## 最重要的 12 条规矩（违反就会出错，详见 [reference/pitfalls.md](reference/pitfalls.md)）

1. **模组 id**：小写字母加数字，3–24 位，字母开头，**不能有连字符和下划线**（如 `qingming`）。
2. **内容 id 必须以 `模组id_` 开头**，只用小写字母、数字、下划线（如 `qingming_jianqi`）。不带前缀，加载直接报错。
3. **内容只能在 `setup` 里注册**，不能放进 `api.on('start')`。存档里的物品要在建世界、读档之前就存在。
4. **法术自动生成卷轴** `scroll_art_<法术id>`。不要再手动注册同名卷轴。卷轴会自己进掉落池和坊市。
5. **`cast` / `fx` 只能用游戏现有的值**（见 content.md）。写了不存在的出手方式，法术会放不出来，而且不报错。
6. **妖兽要写 `look`**（身形 `body` 加颜色），修士（`kind: 'human'`）不用写。`look.body` 只能用现有的 32 种。
7. **掉落 `drops` 里的物品 id 必须存在**：游戏原有的，或本模组注册的。写错了，掉落时会掉出一个名字是 id 的「?」物品。
8. **`api.store` 只能存能转成 JSON 的值**：不要存函数、Map、Set、类实例。存档放在 localStorage，总共约 5MB，所以存档数据要精简。
9. **`tick` 每秒约 60 次**：只做很轻的事。要定时做的事，放进 `day`，或在 `tick` 里自己累加时间。
10. **回调连续出错 20 次，模组会被自动停用**。容易出错的地方自己 `try/catch`；数据可能为空的地方先判断。
11. **多段对话用 `next` 或让 `act` 返回下一段**（v3），不要在 `act` 里再调 `g.dialog()`（那样会排队到这段关掉之后，顺序容易乱）。
12. **改了模组要升 `version`**：平台只收更高的版本，玩家也是靠版本号看到「更新」。

## 能力清单（模组接口 v5，游戏 v0.57 起）

目标是**除了标题画面，什么都能改**。用到 v2 能力（标 ²）的模组 `manifest.api` 写 `2`，用到 v3（标 ³）写 `3`。完整示例：`mods/xianzong/`（v3 全套）、`mods/leize/`（v2 改原版）。

| 想做的事 | 用什么 | 备注 |
|---|---|---|
| 新法术 | `api.content.arts([...])` | 出手方式（弹道 / 扇形 / 落点 / 天降 / 光柱 / 连锁 / 护盾 / 治疗 / 增益……）和特效都用现成的 |
| 新物品（丹药、材料、杂物） | `api.content.items([...])` | 丹药效果走 `pill`（修为、气血、法力、寿元、神识） |
| 新妖兽 / 修士 | `api.content.enemies([...])` | 按等阶、地域、危险度自然刷新；招式默认按身形和五行自动配，也可以写 `skills` 自定义² |
| 改原版（或别的模组的）法术、物品、妖兽、丹方² | `api.content.patch.art/item/enemy/recipe(id, {字段})` | 只写要改的字段；`id` 不能改；两个模组改同一处会提示冲突，后加载的为准 |
| 新丹方 / 器方² | `api.content.recipes([...])` | 出现在丹房 / 器炉；`kind: 'forge'` 是炼器 |
| 给敌人加专属招式² | `api.content.enemySkills(敌人id, [...], { replace? })` | 14 种招式类型，地上先出预警；预警 ≥ 0.3 秒、威力 ≤ 6 会被夹紧 |
| 加掉落² | `api.content.addDrops(敌人id, [...])` | 原版妖兽也行 |
| 宗门藏经阁上架² | `api.content.sectLibrary(宗门id, [卷轴id])` | 坊市按物品表自动进货，新物品自己会上架 |
| 图标 | `api.icon(内容id, 文件名)` | 用于法术、物品（卷轴会跟着法术用同一个图标） |
| 开局 / 读档后做事 | `api.on('start', g => …)` | 对话、送东西、教法术 |
| 打死敌人时 | `api.on('kill', (g, e) => …)` | 只算**玩家**的击杀，`e.id` 是敌人种类 |
| 每过一段日子 | `api.on('day', (g, days) => …)` | 约每半天一次，`days` 可能是小数 |
| 每帧 | `api.on('tick', (g, dt) => …)` | 暂停、死亡时不跑 |
| 给东西 / 拿东西 / 查背包 | `g.giveItem` `g.takeItem` `g.bagCount` | |
| 教法术 | `g.learnArt(id)` | 快捷栏满了就不会自动放上去 |
| 刷一只敌人 | `g.spawnEnemy(id, dx, dy, realm?)` | 刷出来就会主动攻击 |
| 提示、新闻、对话 | `g.toast` `g.news` `g.dialog` | |
| 存自己的进度 | `api.store.get/set` | 随存档走 |
| 读主角状态 | `g.hero`（境界、气血、法力、位置）、`g.day` | 只读 |
| 新地点³（城池 / 城镇 / 海岛 / 险地 / 秘地 / 路边小站⁴） | `api.content.locations([...])` | 地图坐标；城镇类自动有房子、坊市、客栈、居民；险地秘地小站进去是对话；`api.world.locations()`⁴ 读原版地点来定位置 |
| 歇息、打听消息⁴ | `g.rest(days)` `g.tavern()` | 茶寮客栈类玩法 |
| 城镇 / 地点里加事务³ | `api.content.townAction({ where, act })` | 城镇面板多一个按钮；险地秘地里是一个选项。原版城镇也能加 |
| 有名有姓的 NPC³ | `api.content.npcs([...])` | 住在某地、会修炼、能交谈切磋赠礼结拜；`talk` 专属开场；`apprentice` 可收徒；`look` 改外貌 |
| 与任何人交谈时多出选项³ | `api.content.talkOption({ who, when, act })` | 有名人物、路人都行 |
| 多层对话³ | 选项写 `next: {…}`，或 `act` 返回下一段 | 立绘 `portrait: api.file('x.png')` |
| 开商店³ | `g.openShop({ title, items })` | |
| 任务栏³ | `g.quest.set / remove / get` | 左侧任务栏 + 地图「任」字标记，点击指路 |
| 人物动作³ | `g.npc` `g.addFavor` `g.spar` `g.follow` | |
| 主角动作³ | `g.addExp` `g.heal` `g.teleport` `g.guide` | |
| 更多事件³ | `realm` `enter` `talk` `spar` `use` `craft` `down` `draw` | 见 api.md |
| 右下角按钮、自定义面板、快捷键³ | `api.ui.button` `api.ui.panel` `api.ui.hotkey` | 面板内容是声明式的（文字、按钮、图片、进度条、物品） |
| 换图（帧动画）³ | `api.gfx.sprite('e:敌人id' / 'n:NPC id' / 'player', {...})` | 原版妖兽、人物、主角都能换 |
| 在世界里画东西³ | `api.on('draw', (g, d) => d.image / circle / rect / line / text)` | 世界坐标，自动按遮挡排序 |
| 特效、震屏、闪光、慢动作、飘字³ | `g.fx` `g.shake` `g.flash` `g.slowmo` `g.floatText` | |
| 音效、背景音乐³ | `g.sound(文件)` `g.music(文件 / null)` | 包里的 mp3 / ogg / wav |
| **改游戏的任何数据**⁵（境界、灵根、天赋、功法、宗门、红颜、阵法、秘境、灵宠、大事件、骗局几率、节奏……43 张表） | `api.data.get / patch / add / remove` | 删法术、物品、敌人只是撤出池子，存档不坏 |
| **事前拦截 / 改写**⁵（伤害、修为、冲关、用物品、商店货架、刷怪、掉落、原版对话、配乐、音效、进地点、交谈） | `api.hook(名字, (g, ctx) => …)` | 改 ctx 或 `ctx.cancel = true` |
| 物品用法、法术施放命中、新状态、自定义出手⁵ | `content.itemUse` `artCast` `artHit` `status`；`cast: 'custom'` | 原版的也能挂 |
| 改主角⁵ | `g.setRealm` `setRoot` `addTalent` `addLife` `setRep` `forgetArt` …；`g.hero` 完整快照 | |
| 屏幕 HUD、原版面板加段落 / 替换、模组设置项⁵ | `api.ui.hud` `extend` `replace` `settings` | |
| 天气、换图、读主线⁵ | `g.setWeather` `g.travel` `g.story` | |
| 高级权限³ | manifest 写 `"unsafe": true` → `api.unsafe.game()` / `.data` / `.onDraw` | 拿到游戏内部的一切；玩家启用时要确认警告；游戏更新最容易坏，**能用正规接口就别用** |

**做不到的事**：

- 改标题画面（有意保留）；
- 全新的整张地图（在现有三张图上加地点、换图可以）；
- 全新的粒子特效引擎（组合现有特效、或用 `draw` 自己画）；
- 改动没有数据表的写死逻辑（例如骗局的具体剧情、战斗公式本身）——用钩子改结果，或高级权限。

用户要的东西不在这张表里，按 [reference/extend-api.md](reference/extend-api.md) 先扩展接口（要改游戏源码、重新打包游戏），并跟用户说清楚：**装了这个模组的玩家，也得用新版游戏**。

## 平衡速查（详见 content.md）

| 阶 | tier | 修习境界 | 威力 power（×攻击） | 法力 mp（占上限） | 冷却 cd |
|---|---|---|---|---|---|
| 凡 | 0 | 炼气 | 0.8–1.6 | 0.03–0.10 | 0.5–6 秒 |
| 黄 | 1 | 炼气 / 筑基 | 1.0–2.2 | 0.05–0.15 | 1–10 |
| 玄 | 2 | 筑基 | 1.1–4.5 | 0.08–0.22 | 2.5–15 |
| 地 | 3 | 结丹 | 2.2–5.0 | 0.12–0.22 | 4–20 |
| 天 | 4 | 元婴 | 2.6–7.2 | 0.15–0.45 | 6–40 |

多发法术（`count` > 1）、带控制效果（`status`）、范围大的，单发威力要往下压。妖兽的 `hp` / `atk` / `def` 是**倍率**（1 = 同境界标准），按 `lv` 自动换算成真实数值，0.5–2 之间比较合理。

## 文件地图

| 路径 | 内容 |
|---|---|
| `mods/<id>/` | 模组源文件夹（`manifest.json`、`index.js`、图片） |
| `mods/qingming/` | 示例（v1）：两门法术、两种物品、一种妖兽、开局对话、击杀计数 |
| `mods/leize/` | 示例（v2）：改原版数值、专属招式、加掉落、器方、藏经阁 |
| `mods/xianzong/` | 示例（v3）：新城镇和秘地、带两段任务的 NPC、任务栏、面板和按钮、快捷键、帧动画贴图、世界层绘制 |
| `mods/sdk/fanren-mod.d.ts` | 类型提示（在 index.js 里写 `/** @param {import('../sdk/fanren-mod').ModAPI} api */`） |
| `mods/README.md` | 给人看的简版说明 |
| `tools/mod-pack.ts` | 打包工具 |
| `tools/mod-try.ts` | 试跑工具 |
| `tools/test-mod.ts` `tools/test-mod3.ts` | 模组系统本身的测试（改了 `src/mod/` 要跑） |
| `src/mod/` | 模组系统：`types.ts` 是接口定义，`host.ts` 是加载和接口实现，`hooks.ts` 是游戏本体里的接入点，`validate.ts` 是包的校验，`store.ts` 是本地库，`client.ts` 是平台客户端 |
| `platform/` | 模组平台服务端（自建；也可以用通用的「合众」平台，见下） |

## 和「合众」的关系

[合众 HeZhong](https://github.com/qwasx/hezhong) 是我们发布的通用模组平台，任何网页游戏都能接。本游戏**目前用的是自己的格式**（`fanren-mod@1` / `.fmod`，接口在 `src/mod/`），**还没有接入合众**。写本游戏的模组时，按本 skill 的规矩来，不要套用合众的 `ctx.on` 或 `.hzmod` 写法。

## 模板

| 模板 | 内容 |
|---|---|
| `templates/spell-pack/` | 一套法术加对应图标 |
| `templates/beast-pack/` | 新妖兽，带专属掉落材料，再加一枚用材料换的丹药 |
| `templates/quest/` | 剧情任务：开局对话接任务 → 击杀计数 → 回报领奖，进度存进存档 |
| `templates/daily-event/` | 随时间发生的事件：每隔几天随机遇到一件事，带选项 |

拷贝后，把所有 `mymod` 换成你的模组 id。
