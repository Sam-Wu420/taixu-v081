# 模组接口参考（v5）

权威定义在 `mods/sdk/mod/types.d.ts`。两边对不上时，以类型定义为准。

## 模组包结构

```
mods/<id>/
  manifest.json
  index.js          入口：默认导出 setup(api)；可以 import 同文件夹的其他 .js，打包时会合成一个文件
  *.png / *.webp …  图片（打包时转成 data: 网址）；也可以放 mp3 / ogg / wav、json / txt
```

### manifest.json

```jsonc
{
  "id": "qingming",          // 小写字母和数字，3–24 位，字母开头（不能有 - 和 _）
  "name": "青冥剑修",         // 1–40 字
  "version": "1.0.0",        // x.y.z
  "author": "作者",          // ≤ 40 字
  "desc": "简介，可以换行",    // ≤ 2000 字，模组面板和平台上显示
  "api": 5,                  // 需要的接口版本（可省略，默认 1；用到哪一版的能力就写几）
  "unsafe": false,           // 可选：高级权限（见文末），一般不要写
  "icon": "icon.png",        // 可选：files 里的 png / webp / jpeg / gif
  "deps": ["othermod"],      // 可选：依赖的模组 id（会先加载它们；缺了就不加载本模组）
  "tags": ["剑修", "妖兽"]    // 可选：最多 8 个，每个 ≤ 12 字
}
```

`main` 字段可选，默认 `index.js`。

## setup(api)

```js
/** @param {import('../sdk/taixu-mod').ModAPI} api */
export default function setup(api) { … }
```

- **调用时机**：游戏启动后、建世界和读档之前。此时**还没有游戏对象**，不能调用 `g.*`（`g` 只在事件回调里有）。
- 可以是 `async`，但别在这里等网络，会拖慢游戏启动。
- 抛错：这个模组整个不加载，模组面板里显示错误原因。其他模组照常。

### api 的成员

| 成员 | 说明 |
|---|---|
| `api.id` / `api.version` | 本模组 id、版本 |
| `api.gameVersion` / `api.apiVersion` | 游戏版本（如 `0.56.0`）、接口版本（`3`） |
| `api.log(...)` | 打印到控制台，前缀 `[模组 id]` |
| `api.content.arts(defs)` | 注册法术，自动生成卷轴 `scroll_art_<id>`。字段见 content.md |
| `api.content.items(defs)` | 注册物品 |
| `api.content.enemies(defs)` | 注册妖兽 / 修士；v2 可带 `skills`（自定义招式）和 `skillsReplace`（只用自定义的） |
| `api.content.recipes(defs)`² | 注册丹方 / 器方；成品和材料必须是已有物品 |
| `api.content.enemySkills(enemyId, skills, { replace? })`² | 给任意敌人（含原版）加招式；`replace: true` 顶掉自动配的 |
| `api.content.addDrops(enemyId, drops)`² | 给任意敌人加掉落 |
| `api.content.sectLibrary(sectId, itemIds)`² | 往宗门藏经阁加东西；宗门 id 见 「原版数据速查」的宗门表 |
| `api.content.patch.art / item / enemy / recipe(id, fields)`² | 改已有内容的字段（浅合并：写 `melee: {...}` 会整个替换 melee）；改法术时卷轴的名字说明跟着变 |
| `api.file(name)` | 取包里的文件：图片和声音是 data: 网址，文本是原文 |
| `api.icon(contentId, fileName)` | 给法术或物品配图标（法术的卷轴也一起用）。**要在注册内容之后调用** |
| `api.content.locations(defs)`³ | 新地点，见下「地点」 |
| `api.content.townAction(def)`³ | 城镇 / 地点里的事务 |
| `api.content.talkOption(def)`³ | 与人交谈时多出的选项 |
| `api.content.npcs(defs)`³ | 有名有姓的 NPC，见下「人物」 |
| `api.on(event, cb)` | 监听事件，见下 |
| `api.ui.button / panel / hotkey`³ | 界面，见下 |
| `api.gfx.sprite(target, def)`³ | 换图，见下 |
| `api.store.get(k)` / `api.store.set(k, v)` | 本模组的存档数据 |
| `api.unsafe`³ | 只有高级权限模组才有，见文末 |
| `api.data`⁵ / `api.hook`⁵ / `api.settings`⁵ | 数据表、前置钩子、设置，见下 |
| `api.world.locations()`⁴ | 所有地点（三张图）的只读列表：`{ id, name, type, map, x, y, major, minor, danger }`。setup 里就能用——按原版地点算新地点的位置 |

注册时的检查（不通过就抛错，整个模组不加载）：

- id 前缀必须是 `模组id_`，只用 `[a-z0-9_]`；
- 必填字段不能缺；
- 不能和已有内容重名；
- 妖兽必须有 `look`；
- v2：修改的目标必须存在，不能改 `id`；招式类型 / 五行必须合法，数值会被夹紧。

setup 中途抛错时，本模组之前已做的注册和修改**全部撤销**，不会留下半截改动。

`patch` 不用加前缀（改的是别人的内容）。多个模组改同一个字段时，按加载顺序后者为准，模组面板会显示「与模组某某冲突」。

## 事件

| 事件 | 回调参数 | 何时触发 |
|---|---|---|
| `start` | `(g)` | 新开局，或每次读档进入游戏后。**读档也会触发**，「只做一次」的事要靠 `store` 记下来 |
| `tick` | `(g, dt)` | 每帧，`dt` 是秒（约 0.016）。游戏暂停、主角死亡时不触发 |
| `day` | `(g, days)` | 游戏里时间每推进约半天触发一次，`days` 是这次推进的天数（常见 0.5） |
| `kill` | `(g, e)` | **玩家**打死敌人。`e = { id, name, realm, x, y }`，`id` 是敌人种类（如 `wolf`、`qingming_leilang`）。NPC 之间互杀不算 |
| `realm`³ | `(g, { realm, stage, major })` | 主角境界变化（升层、突破；`major` 为大境界） |
| `enter`³ | `(g, loc)` | 进入城镇 / 地点（点「进入」或走进店门）。`loc = { id, name, type, map, x, y, danger }` |
| `talk`³ | `(g, npc)` | 开口与人交谈（任何人） |
| `spar`³ | `(g, { npc, won })` | 切磋结束 |
| `use`³ | `(g, { id })` | 服丹、研读玉简 |
| `craft`³ | `(g, { recipe, ok })` | 炼丹 / 炼器出炉 |
| `down`³ | `(g)` | 主角被打倒 |
| `draw`³ | `(g, d)` | 每帧画世界层，见下「绘制」。只画，别改数据 |

每个回调单独兜错。同一个模组累计出错 20 次，它所有的回调都会停掉（本次运行），玩家会收到一条提示。

## g：游戏外观

只有这些。别的拿不到，这是有意设计的。

| 成员 | 说明 |
|---|---|
| `g.day` | 游戏日（开局起算，360 日一年） |
| `g.hero` | `{ name, realm, stage, hp, mp, x, y, map }`，只读。`realm`：1 炼气、2 筑基、3 结丹、4 元婴、5 化神。`hp` / `mp` 是 0–1 的比例 |
| `g.bagCount(id)` | 背包里某物品的数量 |
| `g.giveItem(id, n=1)` | 给物品（id 必须存在，不然抛错） |
| `g.takeItem(id, n=1)` | 拿走物品。不够就返回 `false`，什么也不拿 |
| `g.learnArt(id)` | 学会法术（已会或不存在时返回 `false`）。快捷栏有空位才自动放上去 |
| `g.knowsArt(id)` | 是否已会 |
| `g.spawnEnemy(id, dx=300, dy=0, realm?)` | 在主角附近刷一只敌人，会主动攻击。`realm` 不填时按它的 `lv` 下限 |
| `g.toast(text, tone?)` | 屏幕提示，`tone`：`'info'`、`'good'`、`'warn'`；超过 200 字会被截断 |
| `g.news(text)` | 写进大事记（个人） |
| `g.dialog({ speaker, title?, text, options })` | 底部对话框，见下 |
| `g.openShop({ title, desc?, items: [{ id, price?, n? }], sellRate?, noSell? })`³ | 开一个商店 |
| `g.time`³ | `{ phase, night }`：phase 0–1（0 子夜、0.5 正午），night 0–1 |
| `g.nearLocation`³ / `g.location(id)`³ | 主角附近的地点 / 查地点（`x`、`y` 是世界像素） |
| `g.npc(id)`³ | 查人：`{ id, name, sex, realm, stage, favor, alive, faction, home, title, met, bond, x, y }` |
| `g.addFavor(id, n)`³ | 改好感（单次 ±30，总 ±100），返回新值 |
| `g.spar(id)`³ / `g.follow(id, on)`³ | 切磋（不在身边会先现身）/ 同行或分开 |
| `g.addExp(n)`³ | 加修为（单次至多当前境界所需的 3 倍） |
| `g.heal(hp, mp?)`³ | 回复气血 / 法力（0–1） |
| `g.teleport(x, y)`³ | 传送到本图某点（世界像素）；走不到的地方返回 `false` |
| `g.guide(x, y, name)`³ | 指路（地图上的青色「指」字）；`name` 为空清除 |
| `g.quest.set(id, { title, text?, have?, need?, x?, y?, done? })`³ | 任务栏；`remove(id)`、`get(id)`。存在本模组的存档里 |
| `g.fx(kind, x, y, { r, dur, color, fx })`³ | 特效：`ring strike pillar flash aura beam`，`fx` 用法术特效名 |
| `g.floatText(x, y, text, color?, big?)`³ | 飘字 |
| `g.shake(n)`³ / `g.flash('r,g,b', a)`³ / `g.slowmo(秒)`³ | 震屏 / 全屏闪光 / 慢动作（≤ 0.6 秒） |
| `g.sound(文件, { vol, rate, x, y })`³ | 音效（包里的 mp3 / ogg / wav） |
| `g.music(文件 \| null, vol?)`³ | 换背景音乐（循环）；`null` 恢复原配乐 |
| `g.openPanel(id)`³ | 打开本模组的面板 |
| `g.rest(days)`⁴ | 歇息 1–30 日：时光流逝（众生照常过日子），气血法力回满 |
| `g.tavern(locId?)`⁴ | 打听消息：弹出游戏的酒楼对话（近处秘境线索、坊间传闻、说书人） |

### g.dialog

```js
g.dialog({
  speaker: '青冥剑修',            // ≤ 30 字，同时是对话框左边印章上的字
  title: '隐居的剑修',            // 可选
  text: '第一段。\n\n第二段。',    // ≤ 4000 字，\n 换行
  options: [                       // 最多 8 个
    { label: '谢过前辈', tone: 'gold', act: () => { g.learnArt('qingming_jianqi'); } },
    { label: '请教来历', next: { speaker: '青冥剑修', text: '第二层……', options: [{ label: '原来如此' }] } },   // v3：接下一段
    { label: '讨价还价', act: () => (g.bagCount('mat_lingshi') > 100 ? { speaker: '青冥剑修', text: '有钱好说。', options: [{ label: '好' }] } : undefined) },   // v3：act 返回下一段
    { label: '拱手作别' },          // 没有 act 也没有 next：直接关闭
  ],
});
```

- 选项有 `next`，或 `act` 返回一段对话，就接着说；否则关闭。可以一直嵌套下去（多层对话树）。
- 其他可选字段：`portrait`（立绘，`api.file('x.png')`）、`mood`（`'love' 'danger' 'mystic' 'normal'`）；选项的 `hint`（小字说明）、`disabled`、`tone`（`'gold' 'jade' 'bad' 'love'`）。
- **会排队**：如果此刻有别的对话或面板开着（比如新开局的剧情），模组对话会等它关了再弹。
- `tone`：`'gold'` 是重要选项，`'jade'` 是正面选项。
- 对话期间游戏暂停。

## store

```js
const n = api.store.get('wolves') ?? 0;
api.store.set('wolves', n + 1);
```

- 存在 `世界状态.mods[模组id]`，跟着存档走：读档会回到存档时的值，新开局是空的。
- `setup` 里也能调用，但那时还没有存档，值会在 `start` 时合并进去。**一般只在事件回调里用。**
- 只能存能转成 JSON 的值：数字、字符串、布尔、数组、普通对象。

## 地点³

```js
api.content.locations([
  { id: 'mymod_zhen', name: '仙踪镇', type: 'town', map: 'tiannan', x: 812, y: 506, desc: '山脚的小镇。' },
  { id: 'mymod_gu', name: '云雾谷', type: 'secret', map: 'tiannan', x: 834, y: 522, desc: '终年云雾不散。', danger: 2 },
]);
```

- `x`、`y` 是**地图坐标**（南荒 0–1000 × 0–700，沧溟海 0–800 × 0–840，中州 0–1200 × 0–880），世界像素 = 地图坐标 × 300。青玄门约在南荒 (808, 538)，嘉禾城 (749, 486)，青霞谷 (838, 464)。
- `type`：`city` `town` `isle` 有房子、坊市、客栈、居民（和原版城镇一样）；`danger` `secret` 进去是一段对话，选项是 `townAction` 给这里的事务。
- v4：`type: 'inn'` 是路边小站（一间屋、茶桌、灯笼、水井；`look: 'post'` 多一座马棚），进去同样是对话。`label` 改地点卡上的类型名（如「茶寮」），`seal` 改地图印章字。道路会自动连到新地点。示例：`mods/yizhan/`。
- 落在水里会被挪到岸上；和随机生成的小村、小险地挤在一起时，那些小地点会让位。
- 不能加宗门（`sect`）类型，也不能加新地图。

```js
api.content.townAction({ id: 'cha', seal: '茶', name: '茶馆', desc: '喝茶听书',
  where: ['mymod_zhen'],                 // 地点 id 或类型（'city' 'town' 'isle' ……）；缺省 'all'＝所有城池城镇海岛
  act: (g, loc) => ({ speaker: '说书人', text: '……', options: [{ label: '好' }] }) });   // 返回对话就弹出；也可以直接做事
```

## 人物³

```js
api.content.npcs([{
  id: 'mymod_yun', name: '云老道', sex: 'm', home: 'mymod_zhen', realm: 2, stage: 1,
  title: '游方道人', role: 'elder', pers: 'kind', faction: 'rogue', favor: 0, age: 180,
  look: { robe: '#4a3a7a', hair: '#e8e4dc', beard: '#e8e4dc' },   // 覆盖随机外貌（Look 的字段）
  greet: ['无量天尊。'],                                         // 寻常交谈的招呼语
  talk: (g, npc) => ({ speaker: npc.name, text: '小友来得巧……', options: [ … ] }),   // 专属开场；返回 null 走寻常交谈
  apprentice: true,                                              // 可以被收为弟子
  wander: false,                                                 // true：不守在原地
}]);
api.content.talkOption({ id: 'ask', label: '打听仙踪镇', who: ['mymod_yun', 'lifeiyu'], when: (npc, g) => npc.favor > 10, act: (g, npc) => ({ … }) });
```

- NPC 每次进游戏都会放进众生名册（存档里有就沿用存档里的境界、好感、生死）。模组卸载后，它会从名册撤下。
- 专属开场后面会自动接「其他事」（寻常交谈：打听、交易、赠礼、切磋、结拜……）和「告辞」。
- 它会随时间修炼升境界，也可能被人杀死（`g.npc(id).alive`）。

## 界面³

```js
api.ui.button({ id: 'lu', glyph: '仙', label: '仙踪', onClick: (g) => g.openPanel('lu'), badge: (g) => 1 });   // 每个模组最多 4 个
api.ui.panel('lu', { title: '仙踪录', sub: '副标题', render: (g) => [
  { type: 'text', text: '……', color: '#556', size: 'small', bold: false },
  { type: 'bar', label: '进度', value: 2, max: 3, color: '#8aa0c8' },
  { type: 'item', id: 'mat_lingshi', n: 20 },
  { type: 'image', src: api.file('pic.png'), w: 200 },
  { type: 'row', children: [ … ] }, { type: 'col', children: [ … ] }, { type: 'divider' },
  { type: 'button', label: '做点什么', tone: 'gold', onClick: () => { … } },
] });
api.ui.hotkey('7', (g) => g.openPanel('lu'));   // 字母都被游戏占了；可用 7 8 9 0 和 F2 F4 F6–F10
```

面板每半秒、每次点按钮后重新调用 `render`。只能用上面这几种元素（游戏负责画，模组不能塞 HTML）。

## 换图³

```js
api.gfx.sprite('e:mymod_wuyao', {   // 'e:敌人id'、'n:NPC id' 或 'player'；原版的也能换
  frames: { idle: ['a0.png', 'a1.png'], walk: ['w0.png', 'w1.png'], attack: ['k0.png'], hit: ['h0.png'] },   // idle 必填
  fps: 8, height: 110,              // height：画面在世界中的高度（主角约 108）
  facing: 1,                        // 原画朝向：1 朝右，-1 朝左
  motion: 'float',                  // 游戏另加的动态：walk stand fly float slither swim
  glow: '200,220,255',
});
```

图片先裁掉透明边，脚底对齐画面底边。血条位置、受击点按 `height` 算。

## 绘制³

```js
api.on('draw', (g, d) => {
  d.image('mist.png', x, y, w, h, { alpha: 0.6, rot: 0, flip: false });
  d.circle(x, y, r, 'rgba(255,255,255,0.3)', { fill: true });
  d.rect(x, y, w, h, '#fff', { fill: false, width: 2 });
  d.line(x1, y1, x2, y2, '#fff', 2, 0.8);
  d.text('云雾谷', x, y, { color: '#eaf2ff', size: 30 });   // 文字总在最上层
});
```

坐标是世界像素。每一笔按自己的下沿和场景里的人、树、房子排遮挡。每帧最多 400 笔；只画看得见的（先判断离主角远近）。

## 数据表⁵：游戏的一切内容，一套方法读改加删

```js
api.data.tables();                                   // 有哪些表：[{ name, desc, count, add, remove }]
api.data.get('realms', 2);                           // 读一条（拷贝；改拷贝不影响游戏）；不给 key 读整张表
api.data.patch('realms', 2, { name: '道基' });        // 改字段（整字段替换）
api.data.patch('enemies', 'boar', { look: { size: 2 } }, { deep: true });   // 逐层合并：只改 look.size
api.data.patch('tuning', 'daysPerSec', 0.8);          // 纯值的表（tuning、sectRanks、profDamage 的一格）直接给新值
api.data.add('roots', { id: 'mymod_hundun', name: '混沌灵根', rate: 3, desc: '…', weight: 0.2 });
api.data.remove('enemies', 'wolf');                   // 法术 / 物品 / 敌人：不再出现在刷怪、坊市、掉落、卷轴池里，按 id 仍查得到（存档不坏）
```

表（`api.data.tables()` 里有每张表的说明）：

| 类 | 表 |
|---|---|
| 内容 | `arts` `items` `enemies` `recipes` `lairs` `affixes` `schools` `startArts` `profDamage` `profRadius` `profChance` `profCooldown` `schoolNames` `schoolColors` `statusNames` `statusColors` |
| 修炼 | `realms`（境界：名字、各层天数、寿元、攻防血）`majorBreaks`（大瓶颈）`roots`（灵根）`gongfa` `skills` `talents`（天赋）`tuning`（节奏：每秒天数、打坐倍速、一日修为基数） |
| 世界 | `locations` `portals` `landmarks` `canonEvents`（旧案大事件）`scamRates`（骗局几率）`sects`（宗门名册）`sectRanks` `sectLibrary` |
| 人物 | `beauties`（红颜）`heartLines` `festivals` `pets`（灵宠） |
| 阵法秘境 | `zhen` `pans` `mijing` `mijingThemes` `mijingRooms` |
| 外观 | `outfits`（衣橱）`artLooks`（法宝外观）`beastSprites` |

- 新增的主键须带「模组 id_」前缀；按下标的表（`startArts` `festivals`）追加在末尾。
- 法术、物品、敌人、丹方的**新增**仍用 `content.*`（有完整校验）；数据表管改和删。
- 两个模组改同一处会在模组面板提示冲突；setup 半路出错，数据表改动全部撤销。

## 前置钩子⁵：事情发生之前，改它或取消它

```js
api.hook('damage', (g, c) => { if (c.to === 'player') c.amount *= 0.5; });          // 主角减伤一半
api.hook('breakthrough', (g, c) => { c.chance = Math.min(1, c.chance + 0.2); });     // 冲关成功率 +20%
api.hook('shop', (g, c) => { c.stock.push({ id: 'mymod_fu', price: 50, n: 5 }); });   // 每个商店都卖模组物品
api.hook('spawn', (g, c) => { if (Math.random() < 0.1) c.enemyId = 'mymod_yao'; });  // 野外一成换成模组妖兽
api.hook('dialog', (g, c) => { if (c.speaker === '邹大夫') c.add({ label: '问问模组的事', next: { … } }); });
api.hook('music', (g, c) => { if (c.state === 'combat') c.file = 'fight.ogg'; });    // 战斗配乐换成自己的
```

| 钩子 | ctx（可改的字段） | 取消 = |
|---|---|---|
| `damage` | `to`（enemy/player）`enemyId` `npcId` `ref` `skill`、**`amount`**（改成 0 = 免伤） | 这次伤害不算 |
| `exp` | `source`（insight 感悟 / med 打坐 / pill 丹药）、**`amount`** | 不得修为 |
| `breakthrough` | `realm` `stage` `major` `pills`、**`chance`**（0–1） | 冲不了关，`reason` 是给玩家看的话 |
| `useItem` | `id` | 不让用 |
| `shop` | `title` `loc`、**`stock`**（`[{ id, price, n }]`，可增删改） | 店不开 |
| `spawn` | **`enemyId` `realm` `stage`**、`x` `y` | 这次不刷 |
| `loot` | `enemyId` `npcId`、**`drops`**（`[{ id, n }]`） | 什么都不掉 |
| `dialog` | **`text`**、`speaker` `title` `options`；`add(选项)` 加选项、`hide(选项名)` 藏选项 | 这段对话不弹（只管原版对话） |
| `music` | `state`（day night town sect sea demon cold desert combat boss pursuit cultivate）；写 **`file`**（包里的音频）换曲、`vol` | — |
| `sfx` | `name`（原版音效名）；写 **`file`** 换掉、**`mute`** 静音 | — |
| `enter` | `loc` | 进不去 |
| `talk` | `npc` | 不进寻常交谈（多半你在钩子里弹了自己的对话） |

## 自定义行为⁵

```js
// 物品用法（原版物品也行）：储物袋里会出现「使用」
api.content.itemUse('mymod_fu', (g, ctx) => { g.heal(0.5); return '伤势好了大半'; });   // 返回的字会提示给玩家；ctx.consume = false 不消耗
// 法术：cast: 'custom' 只扣法力记冷却，效果全靠 onCast（也可写 content.artCast / artHit 给原版法术加效果）
api.content.arts([{ id: 'mymod_lei', name: '掌心雷', cast: 'custom', …,
  onCast: (g, at) => { for (const e of g.enemies(700)) { g.fx('strike', e.x, e.y, { fx: 'lightning' }); g.damage(e.ref, 30); g.addStatus(e.ref, 'mymod_yin', 3); } } }]);
api.content.artHit('huodan', (g, hit) => { g.addStatus(hit.ref, 'mymod_yin', 2); });   // 原版火弹术命中时
// 状态
api.content.status({ id: 'mymod_yin', name: '雷印', color: '#a8b8ff',
  tick: (g, target, dt, left) => { if (target !== 'hero') g.damage(target, 2 * dt); }, onApply: (g, t) => {}, onExpire: (g, t) => {} });
```

战斗用的 `g`：`g.enemies(半径)` → `[{ ref, id, name, x, y, hp, maxHp, realm, npcId }]`；`g.damage(ref, 数值, { status })` 走正常结算（防御、境界压制、死亡掉落）；`g.hurtHero(数值)`；`g.addStatus(ref 或 'hero', 状态id, 秒)`、`g.hasStatus(…)`。

## 改主角⁵

`g.hero` 快照：`name realm stage hp mp x y map exp need age life root gongfa talents rep lingshi kills arts bag`。

动作：`g.setRealm(境界, 小层)` `g.setExp(n)` `g.addLife(年)` `g.setRoot(id)` `g.setGongfa(id)` `g.addTalent(id)` `g.removeTalent(id)` `g.forgetArt(id)` `g.setRep(n)`，加上原有的 `giveItem takeItem learnArt addExp heal teleport`。

## 界面⁵

```js
api.ui.hud('state', { pos: 'top', render: (g) => [{ type: 'text', text: '修为 ' + g.hero.exp }] });   // 屏幕常驻小块：top-left top-right bottom-left top center
api.ui.extend('bag', { title: '我的段落', render: (g) => [ … ] });   // 原版面板里加一段：char bag alchemy seclude town
api.ui.replace('seclude', 'myPanel');                                // 原版面板换成本模组的面板（myPanel 用 api.ui.panel 注册）：char bag alchemy seclude skills map friends zhenfa wardrobe
api.ui.settings([{ key: 'hard', label: '困难模式', type: 'bool', default: false }, { key: 'mul', label: '倍数', type: 'number', default: 2, min: 1, max: 10 }]);
api.settings.get('mul');   // 玩家在「模组」面板里改的值（没改过就是 default）
```

## 世界⁵

`g.setWeather('snow' | … | null)`、`g.travel('dajin', 地点id?)`（存档、换图）、`g.story`（主线当前章节）。节奏（每秒过几日、打坐倍速、修为基数）在数据表 `tuning`。

## 高级权限³

manifest 写 `"unsafe": true`，`api.unsafe` 才有：

- `api.unsafe.game()`：游戏内部的 Game 对象（进游戏前是 `null`）；
- `api.unsafe.data`：内容表（`ARTS` `ITEMS` `ENEMIES` `RECIPES` `SECT_LIB` `LOC_BY_ID` `BEAST_SPR` `REALMS` ……），改了立即生效；
- `api.unsafe.onDraw((ctx, game) => …)`：原始画布（世界坐标），画在一切之上。

代价：

- 玩家启用时会弹醒目警告，必须确认；模组每次更新都要重新确认；平台上标红「高级权限」；
- 没有任何保护，游戏一更新就可能坏；
- **能用正规接口就别用**。真缺能力，先考虑扩展接口（「接口不够用」一节）。

## 运行环境

- 模组代码在游戏页面里运行，可以用浏览器的东西（`fetch`、`Math`、`Date`……），**没有 Node**（没有 `require`、`fs`）。
- **不要碰 `window.__game` 之类的内部对象**：它们不是接口，游戏一更新就会坏。确实需要，就声明高级权限（`unsafe`），让玩家知情；更好的办法是扩展接口。
- 玩家停用或卸载模组后重新载入，模组注册的东西就不存在了。存档里的这些物品会显示成「?」（不会崩），学会的模组法术会从法术书里消失。介绍里请写清楚「卸载后相关物品失效」。
