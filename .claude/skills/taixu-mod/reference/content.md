# 内容字段参考：法术 · 物品 · 妖兽

权威定义：

- 法术：`src/data/arts.ts` 的 `ArtSkill`；
- 物品：`src/data/items.ts` 的 `ItemDef`；
- 妖兽：`src/data/enemies.ts` 的 `EnemyDef`，以及 `src/gfx/beast.ts` 的 `BeastLook`。

拿不准时，打开这几个文件，找一个相近的原版条目照抄改改。原版几百条，是最好的范例。

---

## 一、法术 `api.content.arts([...])`

```js
{
  id: 'mymod_leijian', name: '雷剑诀', school: '雷', tier: 2, realm: 2,
  cast: 'bolt', fx: 'lightning',
  mp: 0.12, cd: 4, power: 2.2, range: 640, speed: 900,
  count: 1, pierce: false, homing: false, radius: 0,
  status: { k: 'shock', dur: 0.8, ch: 0.4 },
  color: '170,190,255',
  desc: '一句话说明，会显示在法术书和卷轴上。',
  evo: ['小成时的变化', '大成时的变化', '圆满时的变化'],
  lvCount: [1, 1, 2, 2],
}
```

### 必填

| 字段 | 说明 |
|---|---|
| `id` `name` | `name` 会出现在法术书、卷轴（《名称》）、施法提示里 |
| `school` | `'火' '冰' '雷' '风' '土' '木' '剑' '体' '御' '魔' '识' '阵' '身' '符' '神'`。决定法术书分类和颜色 |
| `tier` | 0 凡、1 黄、2 玄、3 地、4 天。决定卷轴价格（40 / 300 / 2500 / 15000 / 80000）和掉落稀有度 |
| `realm` | 修习所需境界：1 炼气、2 筑基、3 结丹、4 元婴、5 化神 |
| `cast` | 出手方式，见下表 |
| `fx` | 特效，见下表 |
| `mp` | 法力消耗，占法力上限的比例（0.1 = 10%）。实际按 0.85 倍扣 |
| `cd` | 冷却秒数；熟练度越高越短 |
| `power` | 威力，乘以攻击力。熟练度加成：入门 ×1、小成 ×1.2、大成 ×1.45、圆满 ×1.8 |
| `range` | 射程或距离（像素；主角约 120 像素高） |
| `color` | `'r,g,b'`，特效和印记的颜色 |
| `desc` | 说明 |
| `evo` | 三条文字，**只是显示**，不会真的改变效果。要真变化，用 `lvCount` 等字段 |

### 出手方式 `cast`

| cast | 效果 | 会用到的字段 |
|---|---|---|
| `bolt` | 弹道，朝锁定目标飞 | `speed` `count` `pierce` `homing` `radius`（命中后爆开） |
| `fan` | 扇形多发 | 同上，`count` 决定发数和扇面宽度 |
| `nova` | 以自身为中心炸开 | `radius` |
| `burst` | 在目标处炸开 | `radius` `range` |
| `strike` | 天降打击，在目标附近落下几次 | `count` `radius` `range` |
| `cone` | 前方锥形 | `range` `radius`（**半角**，弧度：原版 0.45–0.6，最大约 1.2） |
| `beam` | 直线光柱（瞬发） | `range` `radius`（宽度） |
| `chain` | 连锁弹跳 | `count`（跳几次） `range` |
| `field` | 留在地上的持续区域 | `radius` `dur` |
| `orbit` | 绕身旋转的护体法器 | `count` `dur` `radius` |
| `dash` | 冲刺，撞到的敌人受伤 | `range` |
| `blink` | 瞬移 | `range`（`power: 0`） |
| `buff` | 增益 | `dur` 和 `buff: { atk, def, speed, regen, stealth, decoy }`（数值是比例，如 `atk: 0.3`）；`power: 0` |
| `shield` | 护盾，吸收量 = 气血上限 × power | `power`（0.2–0.6） `dur` |
| `heal` | 在 dur 秒内回复 power 比例的气血 | `power`（0.2–0.5） `dur` |
| `summon` | 召唤 | `summon: { kind: 'fox' \| 'puppet' \| 'demon' \| 'tihun' \| 'quhun' \| 'bugs', n }` `dur` |
| `sense` | 神识外放 / 敛息（特殊，不建议模组用） | |

不存在的 `cast` 不会报错，只是什么都不发生。`tools/mod-try.ts` 会提醒「没打中木桩」。

### 特效 `fx`

`fireball firesnake crow flame icefire icicle frost needle water lightning goldthunder wind tornado rock vine leaf sword bigsword palm roar blood ghost mind array talisman gold star magnet dragon none`

`fx` 和 `cast` 是独立的。同一个 `bolt`，换个 `fx` 就是火球、冰锥、飞剑或雷光。挑跟 `school` 相配的。

### 可选

| 字段 | 说明 |
|---|---|
| `count` | 发数 / 次数（默认 1） |
| `lvCount: [入门, 小成, 大成, 圆满]` | 按熟练度变化的发数。写了它，`count` 就是基数 |
| `speed` | 弹速，常见 500–1000 |
| `pierce` / `homing` | 穿透 / 追踪 |
| `radius` | 范围半径；对 `cone` 是锥形的半角（弧度） |
| `dur` | 持续秒数（field / buff / shield / heal / summon / orbit） |
| `status: { k, dur, ch }` | 命中附带的异常状态。`k` 可选：`burn`（燃烧）、`freeze`（冰冻）、`shock`（麻痹）、`poison`（中毒）、`root`（定身）、`knock`（击退）、`break`（破甲）、`slow`（迟缓）、`stun`（眩晕）。`ch` 是 0–1 的几率，熟练度会加成 |
| `vsEvil` | 对魔物 / 鬼物的额外倍率（如 2） |
| `hpCost` | 额外扣的气血比例（魔道功法的味道） |
| `needs` | 需要背包里有某物品才能施放（法宝类法术） |

### 卷轴

注册法术会自动生成卷轴物品 `scroll_art_<法术id>`，名字是「《法术名》」。它会进入：

- 野外掉落池：按 `tier` 越高越稀有，且要求 `realm` ≤ 主角境界 + 1；
- 坊市的卷轴货架。

想让玩家**一定**拿到，就在剧情里用 `g.giveItem('scroll_art_xxx')` 送卷轴，或用 `g.learnArt('xxx')` 直接教会。

---

## 二、物品 `api.content.items([...])`

```js
{ id: 'mymod_dan', name: '青冥丹', type: 'pill', tier: 2, price: 600, glyph: '丹', stack: true,
  desc: '服下修为大涨，法力回满。', pill: { exp: 800, mp: 1 } }
```

| 字段 | 说明 |
|---|---|
| `type` | `'herb'`（灵药）、`'pill'`（丹药）、`'material'`（材料）、`'artifact'`（法宝）、`'talisman'`（符箓）、`'scroll'`（功法）、`'misc'`（杂物）、`'gear'`（装备：发冠、腰带、护腕、戒指、玉佩，外加兵器——剑、重兵、长枪，槽位 `weapon`、id 是 `wpn_sword_0`…`wpn_spear_6`；B 版新增，给玩家时游戏自己摇词条、每件单独占一格。模组自己加兵器就写 `gear: { slot: 'weapon', weapon: 'sword', base: { melee: 0.06 } }`） |
| `tier` | 品阶 0–6（凡品、下品、中品、上品、极品、古宝、通天），决定颜色 |
| `price` | 基础价格（灵石）。坊市卖价、礼物价值都由它算 |
| `glyph` | 没有图标时显示的一个字 |
| `stack` | 能否堆叠（丹药、材料都写 `true`） |
| `desc` | 说明 |
| `pill` | 丹药效果，见下 |
| `giftValue` | 送 NPC 时的价值（不写就按 price） |

### 丹药效果 `pill`

| 字段 | 效果 |
|---|---|
| `exp` | 修为（**原始值**），按丹药品阶与主角境界匹配程度打折，单次有上限。炼气丹约 100–300，筑基约 500–1500 |
| `expPct` | 按当前境界所需修为的比例加修为 |
| `hp` / `mp` | 回复气血 / 法力（0–1 比例） |
| `life` | 加寿元（年） |
| `sense` | 加神识 |
| `root` | 改善灵根（极稀有，慎用） |
| `favor` | 好感（礼物类） |

**v1 限制**：`artifact` 法宝和 `talisman` 符箓要配 `art` / `tal` 规格，牵涉战斗和绘制，模组接口目前没有校验和帮助函数。建议先只做丹药、材料、杂物、功法卷轴（法术）。真要做法宝，照抄 `items.ts` 里现成法宝的 `art` 字段，并用 `tools/mod-try.ts` 和浏览器充分测试。

### 常用的原版物品 id（掉落、奖励时可直接用）

| 物品 | id |
|---|---|
| 灵石 | `mat_lingshi` |
| 妖丹（按妖兽等阶 1–10） | `mat_yaodan1` … `mat_yaodan10` |
| 聚气丹 | `pill_juqi` |
| 回气丹 | `pill_huiqi` |
| 疗伤丹 | `pill_liaoshang` |
| 筑基丹 | `pill_zhuji` |
| 黄精 | `herb_huangjing` |
| 赤灵芝 | `herb_lingzhi` |
| 金心草 | `herb_jinxin` |
| 玄铁 | `mat_xuantie` |
| 火符 | `tal_fire` |

更多见 `src/data/items.ts`。不确定某个 id 在不在：`grep -n "id: 'xxx'" src/data/items.ts`。

---

## 三、妖兽 / 修士 `api.content.enemies([...])`

```js
{ id: 'mymod_leilang', name: '雷纹狼', kind: 'beast', lv: [1, 2],
  look: { body: 'wolf', color: [70, 86, 120], belly: [190, 200, 230], size: 1.15, eye: 'rgba(140,220,255,0.95)', glow: '140,200,255' },
  minDanger: 1, maxDanger: 4, zone: undefined, regions: undefined,
  hp: 0.75, atk: 0.8, def: 0.7, speed: 175,
  melee: { range: 64, power: 1.1, cd: 1.1, status: { k: 'shock', dur: 0.5, ch: 0.25 } },
  ranged: { fx: 'lightning', color: '170,190,255', range: 420, power: 0.9, cd: 3, speed: 600 },
  pack: [2, 3],
  drops: [{ id: 'mymod_jiao', ch: 0.7 }, { id: 'mat_lingshi', ch: 0.6, n: [2, 6] }] }
```

### 必填

| 字段 | 说明 |
|---|---|
| `kind` | `'beast'`（妖兽）、`'insect'`（虫）、`'ghost'`（鬼物：**野外不会自然刷出**，只能剧情放出）、`'human'`（修士，用人物系统画，不需要 look） |
| `minDanger` / `maxDanger` | 旧版危险度范围（0–6）。写了 `lv` 时主要按 `lv` 刷新，但这两项也要填 |
| `hp` `atk` `def` | **倍率**，1 = 同境界标准。普通妖兽 0.5–1.2，皮厚的 1.5–2，首领更高 |
| `speed` | 移动速度，常见 90–210 |
| `drops` | `[{ id, ch: 几率, n?: [最少, 最多] }]`，物品必须存在 |

### 等阶与刷新

- `lv: [下限, 上限]`：妖兽等阶 1–10。1 = 炼气，2–4 = 筑基，5–7 = 结丹，8–10 = 元婴。野外按当地妖气挑等阶落在范围内的妖兽，境界由等阶决定。
- `zone`：只在某种地貌出现。可选 `'cold'`（雪原）、`'arid'`（荒漠）、`'sea'`（海上）、`'forest'`（林地）、`'demon'`（魔道 / 阴地）、`'grass'`（草原）。不写就是哪里都有。
- `regions`：只在某些区域出现，填区域 id，如 `['yue']` 梁国、`['tianlan']` 天穹草原（见 `src/data/world.ts` 的 `RAW_REGIONS`）。
- `pack: [min, max]`：成群数量。
- `flying: true`：会飞（可以在海上出现）。
- `evil: true`：魔物，会被克魔法术加倍伤害。
- `behave`：`'flee'` 见人就逃、`'shy'` 不主动攻击、`'call'` 示警召集同类。
- `aggro`：察觉距离。

刷新范围太窄（比如 `zone: 'sea'` 但没写 `flying`，或 `lv` 太高），可能一辈子刷不出来。`tools/mod-try.ts` 会提醒。

### 攻击

- `melee: { range, power, cd, status? }`：近战。
- `ranged: { fx, color, range, power, cd, speed?, count?, radius?, status? }`：远程。`fx` 用法术特效表里的值。
- **招式（技能）默认由游戏自动配**：按身形 `look.body` 和五行（由 `ranged.fx`、`zone`、`evil` 推出）给 1–5 门。五级以上自带妖丹光柱；首领和七级以上还有大招。
- **v2 自定义招式**：敌人定义里写 `skills: [...]`（加在自动配的后面），再写 `skillsReplace: true` 就只用自己的；原版敌人用 `api.content.enemySkills(id, [...])`。

```js
skills: [
  { id: 'leibao', name: '雷暴', k: 'circle', el: 'thunder', r: 130, tele: 0.9, pow: 1.9, range: 520, cd: 8, status: { k: 'shock', dur: 0.8, ch: 0.4 } },
  { id: 'leishi', name: '雷矢连珠', k: 'salvo', el: 'thunder', n: 5, tele: 0.5, pow: 0.8, range: 600, cd: 6 },
  { id: 'zhaohuan', name: '唤狼', k: 'summon', el: 'phys', minion: 'wolf', n: 2, tele: 1, pow: 0, range: 400, cd: 30, once: true },
]
```

| k | 效果 | 常用字段 |
|---|---|---|
| `salvo` | 连射弹道 | `n` 每轮发数、`waves` 轮数、`spread` 散开角 |
| `ring` | 环形弹幕 | `n` 弹数、`waves` 圈数 |
| `circle` | 目标脚下圆圈 | `r` |
| `rain` | 目标周围落下多个圆圈 | `n` 个数、`r` 每个半径 |
| `cone` | 前方扇形 | `r` 长度、`spread` 半角（弧度，0.4–0.6） |
| `charge` | 直线冲撞 | `len` `w` |
| `leap` | 跳扑落点 | `r` |
| `nova` | 以自身为圆心炸开 | `r` |
| `beam` | 光柱 | `len` `w` `dur` |
| `summon` | 召唤（`minion` 必须是已有敌人 id） | `n` |
| `guard` / `heal` / `blink` / `roar` | 护体 / 回血 / 闪身 / 震吼 | `dur` |
| `brawl` | 欺身连击（B 版新增）：扑到跟前连打带轰飞，会和玩家拼招 | `range` 多远以内会扑上来、`pow` 伤害倍率 |

`el` 五行：`phys fire ice water thunder poison blood ghost wind earth sword gold metal`，决定颜色和弹道外观。`tele` 是预警秒数（≥ 0.3，玩家要来得及躲），`pow` 是攻击倍率（≤ 6），`cd` 冷却秒。`ult: true` 是大招（预警更醒目），`hpBelow: 0.5` 半血后才放，`once: true` 只放一次，`pool: 3` 落地后留 3 秒持续伤害区（circle / rain / cone）。数值抄 `src/world/foeskills.ts` 里相近的原版招式最稳。

## 四、丹方 / 器方²（`api.content.recipes([...])`）

```js
{ id: 'mymod_r_lei', name: '雷晶', out: 'mymod_leijing', outN: 1, inputs: [{ id: 'mat_yaodan3', n: 1 }, { id: 'mat_xuantie', n: 2 }],
  base: 0.5, days: 3, reqRealm: 2, desc: '以妖丹引雷，凝于玄铁。', kind: 'forge' }
```

`base` 是基础成功率（0–1），`days` 耗时，`reqRealm` 所需境界，`inputs[].minAge` 灵草最低药龄。不写 `kind` 就是丹方。

## 五、改原版²（`api.content.patch.*`）

```js
api.content.patch.art('fengren', { power: 1.3, desc: '风刃更利。' });
api.content.patch.enemy('wolf', { hp: 0.8, pack: [2, 4] });
api.content.patch.item('pill_juqi', { price: 30 });
api.content.patch.recipe('r_juqi', { base: 0.8 });
```

是浅合并：对象字段（`melee` `look` `pill` …）整个替换，要改其中一项，把原来的抄全再改。

### 外观 `look`（kind 不是 human 时必填）

| 字段 | 说明 |
|---|---|
| `body` | `wolf fox boar tiger bear ape snake jiao centipede spider scorpion eagle bat ghost turtle rat deer ox croc horse pangolin fish carp shark urchin jelly toad ant mantis corpse yaksha demon` |
| `color: [r,g,b]` | 主色 |
| `belly` `accent` | 腹色、点缀色 `[r,g,b]` |
| `size` | 1 ≈ 狼的大小，0.6–2.2 比较合适 |
| `eye` | 眼睛颜色 `'rgba(...)'`，发光的眼睛很有妖气 |
| `glow` | 体表灵光 `'r,g,b'` |
| `horn` `mane` `spikes` `stripes` `eye3` `bull` | 角、鬃毛、背刺、条纹、第三只眼、牛角 |
| `tails` `heads` | 尾巴数（狐）、头数 |
| `crest` `tail` `claws` `wings` | 禽类肉冠、尾型（`'fan' / 'streamer' / 'fish'`）、爪数，以及翅膀对数 |

不是每个 `body` 都画得出每个装饰。挑跟身形配的，再在浏览器里看效果。

修士（`kind: 'human'`）写 `robe: '#2a3440'`（道袍色）和 `title`（如 `'劫修'`），境界由当地人口自动决定。

---

## 平衡参考

### 法术

原版统计（各阶的最小值 / 中位数 / 最大值）：

| tier | 威力 power | 法力 mp | 冷却 cd |
|---|---|---|---|
| 0 凡 | 中位 1.05，最大 1.6 | ≤ 0.10 | 0.5–16 |
| 1 黄 | 中位 0.5（多为辅助），最大 2.2 | ≤ 0.15 | 1–30 |
| 2 玄 | 中位 1.1，最大 4.5 | ≤ 0.22 | 2.5–40 |
| 3 地 | 中位 2.2，最大 5.0 | ≤ 0.22 | 1.5–28 |
| 4 天 | 中位 2.6，最大 7.2 | 0.1–0.45 | 4–40 |

调参建议：

- 估一个「总伤害 ≈ power × count × 命中率」，再跟同阶对比。
- 控制效果（stun / freeze / root）几率高的，威力再降两三成。
- 冷却短于 2 秒的，法力要贵，或者威力要低。

### 境界攻击力（真实值，用来估算伤害）

| 境界 | 攻击力 |
|---|---|
| 炼气 | 约 6–40 |
| 筑基 | 46 / 60 / 78 |
| 结丹 | 185 / 235 / 305 |
| 元婴 | 720 / 920 / 1220 |

越大境界打人，伤害有很强的压制（高一个大境界打低一个，伤害 ×数倍；反过来只剩约 0.06 倍）。所以给低境界玩家的法术，不要指望靠高威力越阶杀敌。
