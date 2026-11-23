# DrG 傀儡框架（drgnext）：做「会自己打」的 NPC / 首领

`mods/drgnext/` 是一个**前置模组**：别的模组依赖它，就能做出带完整打法的 NPC / 首领，例如连段、闪避、格挡、硬直、大招、阵营，以及实时 3D 模型。完整接口见 [mods/drgnext/README.md](../../../../mods/drgnext/README.md)。用它做的完整例子是 `mods/klkport/`（KLK 两人移植）。

设计参照 Garry's Mod 创意工坊「DrGBase | Nextbot Base」（1560118657，作者 Dragoteryx），用 JS 重写，没有使用它的代码。

## 什么时候用它

| 需求 | 用什么 |
|---|---|
| 妖兽多几门招式、换外观 | 正规接口就够：`enemies` + `skills` + `gfx.sprite`，不用框架 |
| 敌人要按时间轴出招、接连段、闪避格挡、按血量换阶段、自己的弹道和特效 | **drgnext** |
| 原设风格的有名有姓 NPC，切磋时打法要特别 | `content.npcs` + drgnext 的 `npc:` 字段 |
| 3D 模型、原版动作 | drgnext 的 `D.model` + 一个模型包 |

## 规矩（违反就会出错）

1. 内容模组 manifest 写 `"deps": ["drgnext"]`。框架会先加载，内容模组的 setup 里直接用 `globalThis.DrGNext`。内容模组**不需要** `unsafe`，只有框架要。
2. `D.define(api, def)` 要传**内容模组自己的 api**：敌人 id 必须带内容模组的前缀（`mymod_xxx`），框架会用你的 api 去注册。
3. 人形敌人不要写 `lv`，否则头顶会显示「X 级妖兽」。用 `D.spawn(id, { realm: 3 })` 指定境界。
4. 不想让它进野外刷怪池：注册后调用 `api.data.remove('enemies', id)`（按 id 仍能 `D.spawn`）。
5. 自己写 `spawn` 钩子替换刷怪时，**跳过人形的刷新**（`api.data.get('enemies', c.enemyId)?.kind === 'human'` 就 return）。劫修拦路、追兵这类事件会拿被换掉的敌人名字去生成路人。
6. 协程里能用 `yield*`、`bot.run`、`bot.react`。用 `bot.hidden = true` 隐身，结束时设回 `false`，框架会把游戏的 `hideT` 清零。
7. 伤害写成 `p`（目标最大气血的比例）加 `F`（固定值，按攻击力换算）。框架对主角的比例部分封顶 60%，免得一下秒杀。
8. 带原作素材的模型包、语音包只能自用，不要上传。模组本体（招式、数值、对话）可以上传，并在 desc 写明来源。

## 试跑

`tools/mod-try.ts` 一次只加载一个包，测不了依赖框架的模组。可以照 `mod-try` 写一个无头脚本：先 `host.load(drgnext)`，再 `host.load(你的模组)`，然后 `D.spawn` → 跑 60 秒 → 击杀 → 存档往返。另外，Windows 上 `mod-try` 调 `npx` 会报 `spawnSync npx ENOENT`，可以先手动 `npx tsx tools/mod-pack.ts mods/<id>` 再试。

## 粒子特效

原版是 Source 引擎的 `.pcf` 粒子时，不要用矢量特效去「模仿」，直接搬粒子定义：用 SourceIO 的 `datamodel.py` 把 `.pcf` 转成 JSON，读 `.vmt` 拿贴图和混合方式（`$additive`），读 `.vtf` 资源段 0x10 拿序列帧，再把 VTF 转成 PNG，放进**自用**素材包。素材包里调 `D.particles(api, api.file('pfx/pfx.txt'), t => 'pfx/' + t + '.png', { pxPerHu: 2 })` 注册；招式里用 `pfxSwing` / `pfxHit` / `pfxTrail` / `pfxImpact`，或在协程里 `D.pfx(名, { follow: bot, ... })`。原版 Lua 的动作事件里放了哪些粒子，可以用 `mods/klkport-build/cmd_pfx.py` 扫出来交给生成器。细节见 README 的「粒子系统」。

## 刀光、刀气（平面道具）

原版刀光是 `slashattack*.mdl` 这类圆盘模型（不是贴图，更不是矢量弧线），刀气是不可见的载体加上可见的子模型（刀光圆盘、GMod 自带的 comball_tape 能量半圆盘），冲击环是 Lua 里的 3D 粒子方片。照搬做法：Blender + SourceIO 读出圆盘半径和朝向（`mods/klkmodel/build/export_slash.py`），GMod 自带素材用 `vpk_extract.py` 从 VPK 取，再用 `props_spec.py` 从 Lua 抽出每个动作事件的摆放（`SetPos`、`SetAngles`、`Expand` 等）和每种投射物的子模型，交给 `D.props`。生成器把这些事件写成 `'@cmd'`，运行时 `D.propCmd` 画。细节见 README 的「平面道具」。

另外注意：叠加材质的贴图如果是黑底不透明（softglow、ryu_flare），世界层是透明画布，直接 `lighter` 会画出黑方块；框架加载时会把亮度转成透明度。

## 有名 NPC 和配乐

- B 版立体画面（drgnext 1.2.3 起）：3D 模型、原版粒子、平面道具（刀光圆盘、刀波、刀气的能量面）不再画到画布上，而是由 `core/scene3d.js` 放进游戏的 three 场景（`api.unsafe.scene3d()` + `api.unsafe.three`）：模型仍由框架自带的 three 读取、播动作，场景里放一份用游戏那份 three 造的镜像，每帧抄骨骼；大光晕在模型之前画、不测深度（不挡人、不被地面切成直边），其余粒子和刀光测深度。只有框架自己的 2D 特效（打击贴图、冲击环、连线）还立成小板。没有立体画面时照旧画画布。内容模组、模型包不用改。
- 内容模组照常用 `api.content.npcs` 注册（交谈、赠礼、切磋、结拜、结仇、追杀全走原版系统），`npc:` 字段让她们变成敌人时由傀儡接管；`D.npcModel` 让平时在世界里也画成 3D 模型，`D.portrait` 给对话配立绘，`D.npcHome` 让老存档也搬家。
- 游戏的 `g.music` 总是循环。原版是一次性的主题曲时用 `D.music(名, 音量, bot, { once: true })`，并照原版的触发时机放（KLK：变身、战意解放、劣势、终结技、战败）。

## 照着原版移植（KLK 的做法）

原版招式写在别的游戏里（比如 Garry's Mod 的 Lua 加模型动作事件）时，先整理成一份招式表（每招的时长、命中时刻、伤害、半径、角度、击飞、弹道、音效时刻、根运动位移，加上起手骰和连段概率图），再写生成器生成 `gen_<角色>.js`，不要手抄。参见 `mods/klkport-build/gen_moves.py`，以及 `mods/klkport/common.js` 的 `fromGen`。原版本来就写在代码里的大招，再手写覆盖。

验收要做「AI 招式覆盖率」：长时间对打，变换距离、血量、气、战意、主角是否闪避，统计每一招有没有被 AI 真的用出来，没用到的顺着连段图查原因。
