// 生成「模组开发包」：给模组作者用，不含游戏源码。
// 用法：npx tsx tools/make-modkit.ts [输出目录=dist-modkit/taixu-modkit]（先 npm run build:single——开发包里的可玩版要能双击打开，
//       立体画面的贴图从 file:// 读不了散文件，只能用把素材内联进脚本的单文件构建）
// 内容：编译好的打包 / 试跑工具（tools/*.mjs）、类型提示 SDK、示例模组、写模组的 skill（改成开发包里的路径）、原版数据速查、可玩版游戏。
import './env';
import { build, type Plugin } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const OUT = resolve(process.argv[2] ?? 'dist-modkit/taixu-modkit');
if (!existsSync('dist/index.html')) { console.error('先 npm run build:single（开发包里要带可玩版）'); process.exit(1); }
if (existsSync('dist/.inl.json') || readdirSync('dist/assets').length > 8) { console.error('dist 是散文件构建（npm run build），双击打不开立体画面。先 npm run build:single'); process.exit(1); }
const HOST_SRC = readFileSync('src/mod/host.ts', 'utf8');
const GAME_V = (/GAME_VERSION = '(\d+\.\d+)/.exec(HOST_SRC) ?? [, '?'])[1];
const API_V = (/MOD_API = (\d+)/.exec(readFileSync('src/mod/types.ts', 'utf8')) ?? [, '?'])[1];
const SK_KINDS = (/SK_KINDS = new Set\(\[([^\]]+)\]/.exec(HOST_SRC) ?? [, ''])[1]!.replace(/['\s]/g, '').split(',').join(' ');
const VER = `游戏 v${GAME_V} B 版（立体画面）· 模组接口 v${API_V}`;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'tools'), { recursive: true });

// ---------------------------------------------------------------- 1. 工具（压缩成单文件；图片声音换成空串——无头试跑用不到）
const noAssets: Plugin = {
  name: 'no-assets',
  setup(b) {
    b.onResolve({ filter: /\.(webp|png|jpe?g|gif|ogg|mp3|wav|m4a|woff2?|ttf|svg)(\?.*)?$/i }, (a) => ({ path: a.path, namespace: 'asset' }));
    b.onResolve({ filter: /\?worker/ }, (a) => ({ path: a.path, namespace: 'asset' }));
    b.onLoad({ filter: /.*/, namespace: 'asset' }, () => ({ contents: 'export default "";', loader: 'js' }));
  },
};
const common = { bundle: true, platform: 'node' as const, format: 'esm' as const, target: 'node18', minify: true, legalComments: 'none' as const, charset: 'utf8' as const,
  external: ['esbuild', '@napi-rs/canvas'], plugins: [noAssets], define: { __MODKIT__: 'true' },
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } };
await build({ ...common, entryPoints: ['tools/mod-pack.ts'], outfile: join(OUT, 'tools/mod-pack.mjs') });
await build({ ...common, entryPoints: ['tools/mod-try.ts'], outfile: join(OUT, 'tools/mod-try.mjs') });

// ---------------------------------------------------------------- 2. SDK 与示例
for (const d of ['sdk', 'qingming', 'leize', 'xianzong', 'yizhan']) cpSync(join('mods', d), join(OUT, 'mods', d), { recursive: true });
cpSync('mods/README.md', join(OUT, 'mods/README.md'));   // 路径在第 3 步统一改

// ---------------------------------------------------------------- 3. skill：换成开发包里的路径与做法
const SK = join(OUT, '.claude/skills/taixu-mod');
cpSync('.claude/skills/taixu-mod', SK, { recursive: true });
rmSync(join(SK, 'reference/extend-api.md'), { force: true });
const fix = (s: string) => s
  .replace(/npx tsx tools\/mod-try\.ts/g, 'node tools/mod-try.mjs')
  .replace(/npx tsx tools\/mod-pack\.ts/g, 'node tools/mod-pack.mjs')
  .replace(/\[reference\/extend-api\.md\]\(reference\/extend-api\.md\)|extend-api\.md/g, '「接口不够用」一节')
  .replace(/`src\/data\/arts\.ts` 的 `ArtSkill`/g, '`mods/sdk/data/arts.d.ts` 的 `ArtSkill`')
  .replace(/`src\/data\/items\.ts` 的 `ItemDef`/g, '`mods/sdk/data/items.d.ts` 的 `ItemDef`')
  .replace(/`src\/data\/enemies\.ts` 的 `EnemyDef`/g, '`mods/sdk/data/enemies.d.ts` 的 `EnemyDef`')
  .replace(/`src\/gfx\/beast\.ts` 的 `BeastLook`/g, '`mods/sdk/gfx/beast.d.ts` 的 `BeastLook`')
  .replace(/`src\/mod\/types\.ts`/g, '`mods/sdk/mod/types.d.ts`')
  .replace(/`src\/world\/foeskills\.ts`( 里)?/g, '「原版数据速查」')
  .replace(/`src\/data\/(arts|items|enemies|recipes|world)\.ts`( 里)?/g, '「原版数据速查」')
  .replace(/`src\/world\/town\.ts` 的 `SECT_LIB`/g, '「原版数据速查」的宗门表')
  .replace(/grep -n "id: 'xxx'" src\/data\/items\.ts/g, 'grep -n "xxx" .claude/skills/taixu-mod/reference/原版数据.md')
  .replace(/，实现在 `src\/mod\/host\.ts`。两边对不上时，以代码为准，并顺手更新本文档。/g, '。两边对不上时，以类型定义为准。')
  .replace(/，接口在 `src\/mod\/`）/g, '）')
  .replace(/`src\/mod\/types\.ts`/g, '`mods/sdk/mod/types.d.ts`')
  .replace(/别的键先查 `src\/core\/keymap\.ts` 有没有被占/g, '别的键先在游戏「设置 → 改键」里看有没有被占')
  .replace(/src\/data\/[a-z]+\.ts/g, '.claude/skills/taixu-mod/reference/原版数据.md');
const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.md') || f.endsWith('.js') || f.endsWith('.json')) writeFileSync(p, fix(readFileSync(p, 'utf8'))); } };
walk(SK);
{ const p = join(OUT, 'mods/README.md'); writeFileSync(p, fix(readFileSync(p, 'utf8')).replace(/npx tsx tools\/mod-(pack|try)\.ts( )?/g, (_m, k) => `node tools/mod-${k}.mjs`)); }
// SKILL.md：开发流程改成开发包的（没有源码、没有 vite）
{
  const p = join(SK, 'SKILL.md');
  let s = readFileSync(p, 'utf8');
  s = s.replace(/\*\*你的工作\*\*分两种：[\s\S]*?先确认是哪一种。[^\n]*\n/, `**这是模组开发包**：里面没有游戏源码，只有写模组要用的东西。你的工作是在 \`mods/<模组id>/\` 里写模组。\n\n`);
  s = s.replace(/5\. \*\*在浏览器里看一眼\*\*[\s\S]*?(?=6\. \*\*交付\*\*)/, `5. **在游戏里看一眼**（新妖兽外观、法术特效、对话排版，工具看不出好不好看）：双击 \`game/index.html\` 打开游戏 → 标题画面「模组」→「导入模组文件」选 \`dist-mods/<id>-<版本>.fmod\` → 重新载入 → 进游戏。按 F12，\`[模组 <id>]\` 开头的是模组日志。\n`);
  s = s.replace(/用户要的东西不在这张表里，按[^\n]*\n/, '');
  s = s.replace('，改原版数值；或扩展游戏的模组接口。', '，改原版数值。').replace('不支持就告诉用户，并给出扩展接口的方案。', '不支持就告诉用户，见下面「接口不够用」。');
  s = s.replace('本仓库的游戏有一套外挂模组系统（v0.55 起）。', `《太虚问道录》同人游戏有一套外挂模组系统（本开发包对应${VER}）。`);
  s = s.replace(/## 文件地图[\s\S]*?(?=## 和「合众」的关系)/, `## 文件地图

| 路径 | 内容 |
|---|---|
| \`mods/<id>/\` | 模组源文件夹（\`manifest.json\`、\`index.js\`、图片、声音） |
| \`mods/qingming/\` \`mods/leize/\` \`mods/xianzong/\` | 示例：v1 基础 / v2 改原版 / v3 地点 NPC 任务界面贴图 |
| \`mods/sdk/taixu-mod.d.ts\` | 类型提示（在 index.js 里写 \`/** @param {import('../sdk/taixu-mod').ModAPI} api */\`）；字段的权威定义在 \`mods/sdk/mod/types.d.ts\` |
| \`mods/README.md\` | 给人看的简版说明 |
| \`reference/原版数据.md\` | 原版法术、物品、妖兽、丹方、地点、宗门、原设人物的 id 和关键数值（改原版、写掉落、定坐标时查） |
| \`tools/mod-pack.mjs\` \`tools/mod-try.mjs\` | 打包、试跑（\`node tools/mod-try.mjs mods/<id>\`） |
| \`game/\` | 可玩版游戏（双击 index.html），用来试玩模组 |

## 接口不够用

开发包里改不了游戏本身。模组要的能力接口里没有时：

1. 先看能不能用现有能力拼出来（\`townAction\` + 对话 + \`store\` 能做出大多数剧情；\`draw\` + \`fx\` 能做出大多数画面）。
2. 实在不行，可以声明高级权限（\`"unsafe": true\`，见 api.md 文末）。玩家启用时会看到警告，游戏一更新就可能坏，**尽量别用**。
3. 或者把需求（想做什么、缺哪个接口）告诉游戏作者，等新版游戏开放接口。

`);
  writeFileSync(p, s);
}

// ---------------------------------------------------------------- 4. 原版数据速查（只是数据表，不是源码）
{
  const { ART_LIST } = await import('../src/data/arts');
  const { ITEM_LIST } = await import('../src/data/items');
  const { ENEMY_LIST } = await import('../src/data/enemies');
  const { RECIPES } = await import('../src/data/recipes');
  const { ALL_LOCATIONS, mapSize } = await import('../src/data/world');
  const { EL_COL } = await import('../src/world/foeskills');
  const MAP_NAME = { tiannan: '南荒', luanxing: '沧溟海', dajin: '中州' };
  const { SECT_LIB } = await import('../src/world/town');
  const TIER = ['凡', '黄', '玄', '地', '天'], REALM = ['凡人', '炼气', '筑基', '结丹', '元婴', '化神'];
  const L: string[] = ['# 原版数据速查', '', `${VER}。改原版（\`api.content.patch.*\`）、写掉落、定坐标、挑宗门时查这里。字段含义见 content.md。`, ''];
  L.push('## 法术', '', '| id | 名称 | 系 | 阶 | 境界 | cast | fx | 威力 | 法力 | 冷却 | 射程 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const a of ART_LIST) L.push(`| ${a.id} | ${a.name} | ${a.school} | ${TIER[a.tier] ?? a.tier} | ${REALM[a.realm] ?? a.realm} | ${a.cast} | ${a.fx} | ${a.power} | ${a.mp} | ${a.cd} | ${a.range} |`);
  L.push('', '## 物品', '', '| id | 名称 | 类型 | 品阶 | 价格 |', '|---|---|---|---|---|');
  for (const it of ITEM_LIST) if (!it.id.startsWith('scroll_art_')) L.push(`| ${it.id} | ${it.name} | ${it.type} | ${it.tier} | ${it.price} |`);
  L.push('', '（法术卷轴的 id 是 `scroll_art_<法术id>`，上表省略。）');
  L.push('', '## 妖兽与修士', '', '| id | 名称 | 种类 | 等阶 lv | 身形 | 地貌 zone | hp | atk | def | 掉落 |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const e of ENEMY_LIST) L.push(`| ${e.id} | ${e.name} | ${e.kind} | ${e.lv ? e.lv.join('–') : `危险 ${e.minDanger}–${e.maxDanger}`} | ${e.look?.body ?? '人'} | ${e.zone ?? ''} | ${e.hp} | ${e.atk} | ${e.def} | ${e.drops.map((d) => d.id).join(' ')} |`);
  L.push('', '## 丹方 / 器方', '', '| id | 名称 | 种类 | 成品 | 材料 | 成功率 | 天数 | 境界 |', '|---|---|---|---|---|---|---|---|');
  for (const r of RECIPES) L.push(`| ${r.id} | ${r.name} | ${r.kind ?? 'pill'} | ${r.out}×${r.outN} | ${r.inputs.map((i) => `${i.id}×${i.n}`).join(' ')} | ${r.base} | ${r.days} | ${REALM[r.reqRealm] ?? r.reqRealm} |`);
  L.push('', '## 地点（地图坐标）', '', `地图尺寸：${(['tiannan', 'luanxing', 'dajin'] as const).map((m) => { const z = mapSize(m); return `${MAP_NAME[m]} ${z.W}×${z.H}`; }).join('，')}（B 版的南荒是原版的两倍，原版模组里写死的南荒坐标要乘二）。世界像素 = 地图坐标 × 300。只列有名字的地点，不列随机生成的小村小洞。`, '', '| id | 名称 | 地图 | 类型 | x | y |', '|---|---|---|---|---|---|');
  for (const l of ALL_LOCATIONS) if (!l.minor) L.push(`| ${l.id} | ${l.name} | ${l.map} | ${l.type} | ${Math.round(l.x)} | ${Math.round(l.y)} |`);
  L.push('', '## 宗门藏经阁（`api.content.sectLibrary` 用）', '', '| 宗门 id | 现有卷轴 |', '|---|---|');
  for (const [k, v] of Object.entries(SECT_LIB)) L.push(`| ${k} | ${v.join(' ')} |`);
  L.push('', '## 敌人招式', '', `招式类型 k：${SK_KINDS}；五行 el：${Object.keys(EL_COL).join(' ')}。参考写法：`, '',
    '```js', "{ id: 'gale', name: '旋风', k: 'circle', el: 'wind', r: 120, tele: 0.9, pow: 1.9, range: 520, cd: 8 }",
    "{ id: 'web', name: '缚灵蛛网', k: 'circle', el: 'poison', r: 120, tele: 0.75, pow: 1.1, range: 520, cd: 8, status: { k: 'root', dur: 1.6, ch: 0.9 } }",
    "{ id: 'rain', name: '火雨', k: 'rain', el: 'fire', n: 5, r: 85, tele: 1.0, pow: 1.7, range: 560, cd: 9, pool: 2.5 }",
    "{ id: 'ring', name: '妖弹环', k: 'ring', el: 'ghost', n: 18, waves: 2, tele: 0.5, pow: 0.8, range: 520, cd: 6 }",
    "{ id: 'salvo', name: '连珠', k: 'salvo', el: 'thunder', n: 3, waves: 3, spread: 0.5, tele: 0.35, pow: 0.75, range: 560, min: 140, cd: 6 }",
    "{ id: 'cone', name: '吐息', k: 'cone', el: 'fire', r: 300, spread: 0.5, tele: 0.85, pow: 2.1, range: 300, cd: 8 }",
    "{ id: 'charge', name: '冲撞', k: 'charge', el: 'phys', len: 560, w: 90, tele: 0.75, pow: 2.2, range: 520, min: 120, cd: 6, status: { k: 'knock', dur: 0.4, ch: 0.9 } }",
    "{ id: 'leap', name: '扑击', k: 'leap', el: 'phys', r: 95, tele: 0.75, pow: 1.9, range: 430, min: 110, cd: 6 }",
    "{ id: 'beam', name: '妖丹光柱', k: 'beam', el: 'thunder', len: 680, w: 70, dur: 0.6, tele: 0.95, pow: 2.5, range: 640, min: 120, cd: 10 }",
    "{ id: 'call', name: '唤群', k: 'summon', el: 'phys', n: 2, minion: 'wolf', tele: 0.8, pow: 0, range: 900, cd: 30, once: true, hpBelow: 0.75 }", '```');
  writeFileSync(join(SK, 'reference/原版数据.md'), L.join('\n') + '\n');
}

// ---------------------------------------------------------------- 5. 可玩版、说明、依赖
cpSync('dist', join(OUT, 'game'), { recursive: true });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dv = { ...pkg.dependencies, ...pkg.devDependencies };
writeFileSync(join(OUT, 'package.json'), JSON.stringify({
  name: 'taixu-modkit', private: true, type: 'module', description: '太虚问道录 · 模组开发包',
  scripts: { pack: 'node tools/mod-pack.mjs', try: 'node tools/mod-try.mjs' },
  dependencies: { esbuild: dv.esbuild ?? '^' + JSON.parse(readFileSync('node_modules/esbuild/package.json', 'utf8')).version, '@napi-rs/canvas': dv['@napi-rs/canvas'] },
}, null, 2) + '\n');
writeFileSync(join(OUT, '.gitignore'), 'node_modules/\ndist-mods/\n');
writeFileSync(join(OUT, 'README.md'), `# 太虚问道录 · 模组开发包（${VER}）

给模组作者用。里面**没有游戏源码**，只有写模组需要的东西：

| 路径 | 内容 |
|---|---|
| \`game/\` | 可玩版游戏：双击 \`index.html\` 就能玩，用来试玩模组 |
| \`mods/\` | 写模组的地方。\`qingming\` \`leize\` \`xianzong\` 是三个示例，\`sdk\` 是类型提示，\`README.md\` 是简版说明 |
| \`tools/\` | \`mod-pack.mjs\` 打包、\`mod-try.mjs\` 试跑 |
| \`.claude/skills/taixu-mod/\` | 写模组的完整说明（规矩、接口、字段、常见的坑、模板、原版数据速查）。用 Claude Code 打开这个文件夹，它会自动按这套说明帮你写模组 |

## 第一次用

1. 装 [Node.js](https://nodejs.org/)（18 或更新）。
2. 在这个文件夹里打开终端：\`npm install\`（装打包和试跑要用的两个包）。

## 写一个模组

1. 拷一个示例或模板（\`.claude/skills/taixu-mod/templates/\`）到 \`mods/你的模组id/\`，改 \`manifest.json\` 和 \`index.js\`。
2. 试跑：\`node tools/mod-try.mjs mods/你的模组id\`。它会打包，然后在无头游戏里逐项检查：法术、妖兽、招式、地点、NPC、面板、过日子、存档。有 ✗ 必须修。
3. 试玩：打包结果在 \`dist-mods/\`。双击 \`game/index.html\` → 标题画面「模组」→「导入模组文件」→ 选 \`.fmod\` → 重新载入。
4. 发布：把 \`.fmod\` 发给别人导入，或上传到模组平台。

## 用 Claude Code 写

在这个文件夹里运行 \`claude\`，直接说「帮我做一个模组：……」。它会读 \`.claude/skills/taixu-mod/\` 里的说明，写好后自己跑试跑工具。

## 能做什么

除了标题画面，几乎都能改：新法术、物品、妖兽（含专属招式）、丹方；改原版数值；新城镇、险地、秘地；有名有姓的 NPC 和任务；对话树、商店、任务栏；右下角按钮和面板、快捷键；图片帧动画换图；在世界里画东西、特效、音效、背景音乐。详见 \`mods/README.md\` 和 skill。
`);

console.log('模组开发包已生成：' + OUT);
