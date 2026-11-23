# 写一个模组

一个模组就是一个文件夹，打包后成为一个 `.fmod` 文件。它可以导入游戏，也可以上传到模组坊。参考示例：`qingming/`（青冥剑修）。

```
mods/你的模组/
  manifest.json   清单
  index.js        入口（可以 import 同文件夹里的其他 .js，打包时会并成一个文件）
  icon.png        图标（可选）
  其他图片 / 声音  png webp jpg gif / mp3 ogg wav
```

## manifest.json

```json
{
  "id": "qingming",              // 小写字母和数字，3–24 位，字母开头，全网唯一
  "name": "青冥剑修",
  "version": "1.0.0",            // x.y.z，更新时调高
  "author": "你的名字",
  "desc": "简介（可以换行）",
  "api": 3,                      // 需要的模组接口版本（用到下面标 ² / ³ 的功能写 2 / 3）
  "icon": "icon.png",
  "deps": [],                    // 依赖的其他模组 id
  "tags": ["剑修", "妖兽"]
}
```

## index.js

```js
export default function setup(api) {
  api.content.arts([...]);      // 新法术：出手方式 cast 和特效 fx 都用游戏现成的；会自动生成卷轴，出现在掉落和坊市里
  api.content.items([...]);     // 新物品：丹药（pill）、材料（material）……
  api.content.enemies([...]);   // 新妖兽 / 修士：身形 look 用游戏现成的画法（wolf tiger snake eagle ape ……），给颜色、大小、发光即可
  api.icon('内容id', 'xx.png'); // 给法术 / 物品配图标

  // ² 接口 v2（游戏 v0.56 起）：改原版、丹方、招式、掉落、藏经阁
  api.content.patch.art('fengren', { power: 1.3 });       // 改任何已有法术 / 物品 / 妖兽 / 丹方的字段（patch.item / enemy / recipe 同理）
  api.content.recipes([...]);                              // 新丹方 / 器方
  api.content.enemySkills('wolf', [...]);                  // 给敌人加专属招式（新妖兽也可以直接在定义里写 skills）
  api.content.addDrops('wolf', [{ id: 'x', ch: 0.3 }]);    // 加掉落
  api.content.sectLibrary('huangfeng', ['scroll_art_x']);  // 宗门藏经阁上架

  // ³ 接口 v3：地点、人物、界面、画面、声音
  api.content.locations([...]);          // 新城镇 / 海岛 / 险地 / 秘地（地图坐标）
  api.content.townAction({...});         // 城镇面板加按钮；险地秘地里的选项
  api.content.npcs([...]);               // 有名有姓的 NPC：住处、外貌、专属开场、可收徒
  api.content.talkOption({...});         // 与任何人交谈时多出的选项
  api.ui.button({...}); api.ui.panel('id', {...}); api.ui.hotkey('7', cb);   // 按钮、面板、快捷键
  api.gfx.sprite('e:wolf', { frames: { idle: ['a.png', 'b.png'] }, height: 80 });   // 换图（妖兽、NPC、主角）
  api.on('draw', (g, d) => { d.circle(x, y, 40, 'rgba(255,255,255,.3)'); });        // 在世界里画东西

  api.on('start', (g) => {});        // 进游戏（新开局 / 读档）之后
  api.on('kill', (g, e) => {});      // 打死敌人：e.id e.name e.realm e.x e.y
  api.on('day', (g, days) => {});    // 游戏里过了 days 天
  api.on('tick', (g, dt) => {});     // 每帧（尽量少做事）

  api.store.get('键'); api.store.set('键', 值);   // 本模组的存档数据，随存档走
}
```

`g` 能做的事：`g.day`、`g.hero`（境界、气血、位置……只读）、`g.bagCount(id)`、`g.giveItem(id, n)`、`g.takeItem(id, n)`、`g.learnArt(id)`、`g.knowsArt(id)`、`g.spawnEnemy(id, dx, dy)`、`g.toast(文字)`、`g.news(文字)`、`g.dialog({ speaker, text, options })`（选项可 `next` 接下一段）。

v3 另有：`g.openShop`、`g.quest.set/remove`（任务栏）、`g.npc / addFavor / spar / follow`、`g.addExp / heal / teleport / guide`、`g.fx / shake / flash / slowmo / floatText`、`g.sound / music`、`g.openPanel`、`g.time`、`g.location`。事件另有 `realm enter talk spar use craft down draw`。

v5 另有：`api.data`（43 张数据表读改加删）、`api.hook`（伤害、修为、冲关、商店、刷怪、掉落、对话、配乐、音效……事前改写或取消）、`content.itemUse / artCast / artHit / status`、`g.setRealm / setRoot / addTalent …`、`api.ui.hud / extend / replace / settings`、`g.setWeather / travel`。

**除了标题画面，都能改。** 实在需要碰游戏内部，manifest 写 `"unsafe": true`（高级权限：玩家启用时会看到警告，游戏更新最容易坏）。

示例：`qingming/`（v1）、`leize/`（v2 改原版）、`xianzong/`（v3 新地点 + NPC 任务 + 面板 + 贴图）、`yizhan/`（v4 路边茶寮驿站：歇脚、喝茶、打听消息、雇车）。

完整的字段说明在 `src/mod/types.ts`。编辑器类型提示用 `mods/sdk/taixu-mod.d.ts`（在 index.js 里写 `/** @param {import('../sdk/taixu-mod').ModAPI} api */`）。

## 规则

- 新加的法术、物品、敌人，id 必须以「模组 id + 下划线」开头（如 `qingming_jianqi`），否则加载时报错。
- 模组出错只停它自己：setup 抛错，这个模组就不加载；回调连续出错 20 次自动停用。游戏照常运行。
- 模组在玩家的游戏里运行，碰不到玩家电脑上的文件，但能改存档。别做坏事。

## 打包、试跑、试玩、发布

```bash
npx tsx tools/mod-pack.ts mods/你的模组      # → dist-mods/<id>-<版本>.fmod
npx tsx tools/mod-try.ts  mods/你的模组      # 打包并在无头游戏里走一遍：施法、刷怪击杀、对话、过 60 天、存档往返，逐项报告
```

用 Claude Code 写模组时，会自动用上仓库里的 skill（`.claude/skills/taixu-mod/`）：规矩、字段参考、43 条常见坑、扩展接口的做法、4 个模板。

- 试玩：游戏标题画面 → 模组 → 导入模组文件 → 选 `.fmod` → 重新载入。
- 发布：上传到模组坊（见 `platform/README.md`）。
