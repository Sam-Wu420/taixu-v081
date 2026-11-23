// v0.55 验收：外挂模组——校验、加载、注册内容、事件、存档数据、出错隔离
// 用法：npx tsx tools/test-mod.ts
import './env';
import { readFileSync } from 'fs';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__FANREN_NORELOAD = true;
const { ModHost } = await import('../src/mod/host');
const { validateBundle } = await import('../src/mod/validate');
const { modClient } = await import('../src/mod/client');
const { modStore } = await import('../src/mod/store');
const { ARTS, ART_LIST } = await import('../src/data/arts');
const { ITEMS } = await import('../src/data/items');
const { ENEMIES, ENEMY_LIST } = await import('../src/data/enemies');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const C = await import('../src/world/cultivation');

let fails = 0, n = 0;
const ok = (c: any, msg: string) => { n++; if (!c) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const fmod = readFileSync('dist-mods/qingming-1.0.0.fmod', 'utf8');
const bundle = JSON.parse(fmod);
const mk = (id: string, code: string, extra: any = {}) => ({ format: 'fanren-mod@1', manifest: { id, name: id, version: '1.0.0', author: 't', desc: '', ...extra }, main: 'index.js', files: { 'index.js': code } });

console.log('一、校验');
ok(validateBundle(bundle) === null, '示例模组包合格');
ok(validateBundle({ ...bundle, format: 'x' }) !== null, '格式不对被拒');
ok(validateBundle(mk('A-b', 'x')) !== null, '模组 id 不合规被拒');
ok(validateBundle(mk('okmod', 'x', { version: '1.0' })) !== null, '版本号不合规被拒');
ok(validateBundle({ ...mk('okmod', 'x'), main: 'nope.js' }) !== null, '入口文件缺失被拒');
ok(validateBundle(mk('okmod', 'x', { api: 99 })) !== null, '要求更高接口版本被拒');

console.log('二、导入本地库并按启用名单加载');
await modClient.importText(fmod);
ok(modStore.enabled().qingming === true, '导入后默认启用');
await modClient.add(mk('badmod', 'export default function (api) { api.content.items([{ id: "wrong_id", name: "x", type: "misc", tier: 0, price: 1, desc: "", glyph: "x" }]); }') as any, true);
await modClient.add(mk('throwmod', 'export default function () { throw new Error("故意的"); }') as any, true);
await modClient.add(mk('needdep', 'export default function () {}', { deps: ['nothere'] }) as any, true);
await modClient.add(mk('offmod', 'export default function () {}') as any, false);
await modClient.add(mk('tickbad', 'export default function (api) { api.on("tick", () => { throw new Error("坏回调"); }); }') as any, true);
const host = new ModHost();
await host.loadEnabled();
const S = (id: string) => host.status.find((s) => s.id === id)!;
ok(S('qingming').state === 'loaded' && S('qingming').added.arts === 2 && S('qingming').added.items === 2 && S('qingming').added.enemies === 1, `示例模组加载：法术 ${S('qingming').added.arts}、物品 ${S('qingming').added.items}、敌人 ${S('qingming').added.enemies}`);
ok(S('badmod').state === 'error' && /须以「badmod_」开头/.test(S('badmod').error ?? ''), `id 不带前缀被拒（${S('badmod').error}）`);
ok(S('throwmod').state === 'error' && /故意的/.test(S('throwmod').error ?? ''), '模组 setup 抛错：只停这个模组');
ok(S('needdep').state === 'missing-dep', '缺依赖不加载');
ok(S('offmod').state === 'disabled', '未启用的不加载');
ok(!!ARTS.qingming_jianqi && ART_LIST.some((s) => s.id === 'qingming_jiangang'), '法术进了法术表（会出现在掉落 / 坊市卷轴池）');
ok(!!ITEMS.scroll_art_qingming_jianqi && !!ITEMS.qingming_dan, '自动生成了法术卷轴；物品进了物品表');
ok(!!ENEMIES.qingming_leilang && ENEMY_LIST.some((e) => e.id === 'qingming_leilang'), '妖兽进了敌人表（按等阶 / 地域自然刷新）');

console.log('三、进游戏：开局对话、学法术、击杀计数、存档数据');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain); g.reset();
host.attach(g); host.start();
(g as any).paused = false;
for (let i = 0; i < 20 && (g.modal as any)?.node?.speaker !== '青冥剑修'; i++) { if (g.modal && (g.modal as any)?.node?.speaker !== '青冥剑修') g.closeModal(true); g.update(1 / 30); }
ok((g.modal as any)?.node?.speaker === '青冥剑修', '开局弹出模组的对话（等开场剧情关了才弹）');
(g.modal as any).node.options[0].act(); g.modal = null;
ok(g.hero.arts.some((a) => a.id === 'qingming_jianqi'), '选项生效：学会《青冥剑气》');
(g as any).paused = false;
g.combat.invulnT = 1e9;
// 施放模组法术
g.combat.enemies = [];
const target = new Enemy(ENEMIES.boar, g.player.x + 300, g.player.y, 1, 1); target.aggro = true; target.maxHp = target.hp = 1e7; g.combat.enemies.push(target);
g.hero.mp = 1; (g.combat as any).cds.clear(); g.combat.cast('qingming_jianqi');
for (let i = 0; i < 30; i++) { g.modal = null; g.update(1 / 30); }
ok(target.hp < 1e7, '模组法术能放、能打中');
// 击杀五头雷纹狼
for (let k = 0; k < 5; k++) { const e = new Enemy(ENEMIES.qingming_leilang, g.player.x + 200, g.player.y, 1, 1); g.combat.enemies.push(e); g.combat.hitEnemy(e, 1e9, { realm: 9, stCh: 0 }, e.x, e.y); }
for (let i = 0; i < 5; i++) g.update(1 / 30);
ok(C.bagCount(g.hero, 'qingming_dan') === 1 && C.bagCount(g.hero, 'scroll_art_qingming_jiangang') === 1, '斩五头雷纹狼：得青冥丹与《青冥剑罡》卷轴');
ok((g.ws as any).mods?.qingming?.wolves === 5, '模组数据记在世界状态里');
// 自然刷新
let seen = false;
for (let k = 0; k < 400 && !seen; k++) { const r = g.combat.rollBeast(g.player.x + 4000, g.player.y, 0.5); seen = r?.def.id === 'qingming_leilang'; }
ok(seen, '野外刷怪池里有雷纹狼');
// 坏回调连错 20 次被停
for (let i = 0; i < 40; i++) { g.modal = null; g.update(1 / 30); }
ok(S('tickbad').state === 'error' && /已停用/.test(S('tickbad').error ?? ''), '每帧回调连续出错：自动停掉，游戏照常');
// 存档往返
g.save(1);
const g2 = new Game(terrain); g2.load('fanren_save_1');
ok((g2.ws as any).mods?.qingming?.wolves === 5 && g2.hero.arts.some((a) => a.id === 'qingming_jianqi'), '读档：模组数据与学会的法术都在');
host.attach(g2); host.start();
for (let i = 0; i < 10; i++) { g2.modal = null; g2.update(1 / 30); }
ok(!host.queue.length && (g2.modal as any)?.node?.speaker !== '青冥剑修', '读档后不再重复开局对话');

console.log('四、接口 v2：改原版内容、丹方、敌人招式、掉落、藏经阁、冲突提示');
const { RECIPES } = await import('../src/data/recipes');
const { kitOf, MOD_KITS } = await import('../src/world/foeskills');
const { SECT_LIB } = await import('../src/world/town');
const V2 = `export default function (api) {
  api.content.items([{ id: 'patcha_jing', name: '雷晶', type: 'material', tier: 2, price: 200, desc: '雷气凝成。', glyph: '晶', stack: true }]);
  api.content.patch.art('fengren', { power: 1.6, name: '狂风刃' });
  api.content.patch.enemy('boar', { hp: 3 });
  api.content.patch.item('pill_juqi', { price: 77 });
  api.content.recipes([{ id: 'patcha_r', name: '雷晶', out: 'patcha_jing', outN: 1, inputs: [{ id: 'herb_huangjing', n: 1 }], base: 5, days: 1, reqRealm: 1, desc: '试炼', kind: 'forge' }]);
  api.content.enemySkills('boar', [{ id: 'patcha_lei', name: '奔雷', k: 'ring', el: 'thunder', cd: 6, tele: 0.05, pow: 99, range: 400, r: 140 }]);
  api.content.addDrops('boar', [{ id: 'patcha_jing', ch: 2 }]);
  api.content.sectLibrary('huangfeng', ['scroll_art_fengren']);
  api.content.enemies([{ id: 'patcha_wolf', name: '试狼', kind: 'beast', lv: [1, 2], look: { body: 'wolf', color: [80, 80, 90], size: 1 }, minDanger: 1, maxDanger: 3, hp: 1, atk: 1, def: 1, speed: 160, drops: [],
    skills: [{ id: 'patcha_s', name: '狼嚎', k: 'roar', el: 'phys', cd: 10, tele: 0.8, pow: 0, range: 300 }], skillsReplace: true }]);
}`;
const h2 = new ModHost();
const s2 = await h2.load(mk('patcha', V2, { api: 2 }) as any);
ok(s2.state === 'loaded', `v2 模组加载（${s2.error ?? '无错'}，改动 ${s2.patched} 处）`);
ok(ARTS.fengren.power === 1.6 && ARTS.fengren.name === '狂风刃' && ITEMS.scroll_art_fengren.name === '《狂风刃》', '改原版法术：数值、名字，卷轴跟着改');
ok(ENEMIES.boar.hp === 3 && ITEMS.pill_juqi.price === 77, '改原版妖兽、物品');
const rr = RECIPES.find((r) => r.id === 'patcha_r');
ok(!!rr && rr.base === 1, '加丹方 / 器方（成功率夹到 1）');
const boar = new Enemy(ENEMIES.boar, 0, 0, 1, 1), bk = kitOf(boar).find((k) => k.id === 'patcha_lei');
ok(!!bk && bk.tele >= 0.3 && bk.pow <= 6, `给原版妖兽加招式：预警 ${bk?.tele}s、威力 ${bk?.pow}（已夹紧）`);
ok(kitOf(boar).length > 1, '加招式不顶掉原有招式');
const wk = kitOf(new Enemy(ENEMIES.patcha_wolf, 0, 0, 1, 1));
ok(wk.length === 1 && wk[0].id === 'patcha_s', '新妖兽 skillsReplace：只用自定义招式');
ok(ENEMIES.boar.drops.some((d) => d.id === 'patcha_jing' && d.ch === 1), '加掉落（几率夹到 1）');
ok(SECT_LIB.huangfeng.includes('scroll_art_fengren'), '往宗门藏经阁加功法');
{ // 实战：只带自定义招式的试狼，在玩家身边真的放出「狼嚎」
  (g2 as any).paused = false; g2.combat.invulnT = 1e9;
  { let x = g2.player.x + 3000, y = g2.player.y; const T = g2.terrain;   // 离开城镇（城里妖兽不动手）
    for (let r = 0; r < 40000 && (T.inLocZone(x, y, 1800) || T.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
    g2.teleport(x, y); }
  g2.combat.enemies = []; (g2.combat.texts as any[]).length = 0;
  const w = new Enemy(ENEMIES.patcha_wolf, g2.player.x + 200, g2.player.y, 1, 1); w.aggro = true; g2.combat.enemies.push(w);
  let cast = false;
  for (let i = 0; i < 400 && !cast; i++) { g2.modal = null; g2.update(1 / 30); cast = (g2.combat.texts as any[]).some((t) => t.s === '狼嚎'); }
  ok(cast, '实战：自定义招式「狼嚎」真的放出来了');
}
const s3 = await h2.load(mk('patchb', `export default function (api) { api.content.patch.art('fengren', { power: 1.2 }); }`) as any);
ok(s3.state === 'loaded' && s3.warnings.some((w) => /patcha/.test(w)), `两个模组改同一处：提示冲突（${s3.warnings[0]}）`);
const bads: [string, RegExp][] = [
  [`api.content.patch.art('fengren', { id: 'x' })`, /不能改/],
  [`api.content.patch.enemy('nope', { hp: 1 })`, /没有敌人/],
  [`api.content.enemySkills('boar', [{ id: 'a', name: 'a', k: 'laser', el: 'fire', cd: 1, tele: 1, pow: 1, range: 1 }])`, /类型/],
  [`api.content.recipes([{ id: 'patchc3_r', name: 'x', out: 'nope', outN: 1, inputs: [], base: 1, days: 1, reqRealm: 1, desc: '' }])`, /成品/],
  [`api.content.sectLibrary('nosect', [])`, /没有宗门/],
];
let bi = 0;
for (const [code, re] of bads) { const s = await h2.load(mk('patchc' + bi++, `export default function (api) { ${code}; }`) as any); ok(s.state === 'error' && re.test(s.error ?? ''), `拒绝：${s.error}`); }
const p0 = ARTS.huodan.power, d0 = ENEMIES.wolf.drops.length;
const s4 = await h2.load(mk('patchd', `export default function (api) { api.content.patch.art('huodan', { power: 9 }); api.content.addDrops('wolf', [{ id: 'pill_juqi', ch: 0.5 }]); api.content.items([{ id: 'patchd_x', name: 'x', type: 'misc', tier: 0, price: 1, desc: '', glyph: 'x' }]); throw new Error('半路出错'); }`) as any);
ok(s4.state === 'error' && ARTS.huodan.power === p0 && ENEMIES.wolf.drops.length === d0 && !ITEMS.patchd_x, 'setup 半路出错：已做的修改全部撤销');
void MOD_KITS;

console.log('五、对话树、商店、高级权限');
{
  const DT = `export default function (api) {
    api.on('start', (g) => g.dialog({ speaker: '老者', text: '第一层', options: [
      { label: '问路', next: { speaker: '老者', text: '第二层', options: [{ label: '再问', act: () => ({ speaker: '老者', text: '第三层', options: [{ label: '谢过', act: () => { api.store.set('done', 1); } }] }) }] } },
      { label: '买东西', act: () => { g.openShop({ title: '杂货', items: [{ id: 'pill_juqi', n: 3 }] }); } },
    ] }));
  }`;
  const h3 = new ModHost();
  await h3.load(mk('dlgtree', DT, { api: 3 }) as any);
  const g3 = new Game(terrain); g3.reset(); h3.attach(g3); h3.start();
  for (let i = 0; i < 400 && (g3.modal as any)?.node?.text !== '第一层'; i++) { if (g3.modal && (g3.modal as any)?.node?.text !== '第一层') g3.closeModal(true); (g3 as any).paused = false; g3.update(1 / 30); }
  const n1 = (g3.modal as any)?.node;
  ok(n1?.text === '第一层', '模组对话弹出');
  const n2 = n1?.options[0].act(); ok(n2?.text === '第二层', '选项 next 接第二层');
  const n3 = n2?.options[0].act(); ok(n3?.text === '第三层', '选项 act 返回第三层');
  ok(n3?.options[0].act() === null && (g3.ws as any).mods.dlgtree.done === 1, '最后一层关闭、act 生效');
  g3.modal = null; (g3 as any).mods = h3; h3.attach(g3);
  n1.options[1].act();
  ok(g3.modal?.kind === 'shop' && (g3.modal as any).shop.stock[0].price === ITEMS.pill_juqi.price, '开商店');
  const un = await new ModHost().load(mk('rawmod', `export default function (api) { if (!api.unsafe) throw new Error('没给高级权限'); api.unsafe.data.ITEMS.pill_juqi.glyph = '聚'; }`, { unsafe: true }) as any);
  ok(un.state === 'loaded' && ITEMS.pill_juqi.glyph === '聚', '高级权限：manifest.unsafe 才有 api.unsafe');
  const nu = await new ModHost().load(mk('rawmod2', `export default function (api) { if (api.unsafe) throw new Error('不该有'); }`) as any);
  ok(nu.state === 'loaded', '普通模组拿不到 api.unsafe');
  await modClient.add(mk('rawmod3', 'export default function () {}', { unsafe: true }) as any, true);
  ok(!modStore.enabled().rawmod3, '高级权限模组导入后不自动启用（要玩家确认）');
  const e = modStore.enabled(); e.rawmod3 = true; modStore.setEnabled(e);
  const h4 = new ModHost(); await h4.loadEnabled();
  ok(h4.status.find((x) => x.id === 'rawmod3')?.state === 'error', '没确认过的高级权限模组不加载');
  modStore.setUnsafeOk('rawmod3', '1.0.0');
  const h5 = new ModHost(); await h5.loadEnabled();
  ok(h5.status.find((x) => x.id === 'rawmod3')?.state === 'loaded', '确认过就加载');
}

console.log(fails ? `${n - fails}/${n} 通过，${fails} 项失败` : `${n}/${n} 通过`);
process.exit(fails ? 1 : 0);
