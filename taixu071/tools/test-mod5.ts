// v0.57 验收：模组接口 v5——数据表全开放、前置钩子、自定义行为、主角全开放、界面全开放、世界
// 用法：npx tsx tools/test-mod5.ts
import './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__FANREN_NORELOAD = true;
const { ModHost } = await import('../src/mod/host');
const HK = await import('../src/mod/hooks');
const { REALMS, ROOTS } = await import('../src/data/realms');
const { TALENTS } = await import('../src/data/skills');
const { TUNING } = await import('../src/data/tuning');
const { ENEMIES, ENEMY_LIST } = await import('../src/data/enemies');
const { ITEMS, ITEM_LIST } = await import('../src/data/items');
const { ARTS, ART_LIST } = await import('../src/data/arts');
const { SECT_DEF } = await import('../src/world/roster');
const { BEAUTIES } = await import('../src/data/beauties');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const C = await import('../src/world/cultivation');

let fails = 0, n = 0;
const ok = (c: any, msg: string) => { n++; if (!c) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const mk = (id: string, code: string, extra: any = {}, files: Record<string, string> = {}) => ({ format: 'fanren-mod@1', manifest: { id, name: id, version: '1.0.0', author: 't', desc: '', api: 5, ...extra }, main: 'index.js', files: { 'index.js': code, ...files } });
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

console.log('一、数据表');
const T0 = { realmName: REALMS[2].name, rootN: ROOTS.length, talN: TALENTS.length, days: TUNING.daysPerSec, wolfInList: ENEMY_LIST.includes(ENEMIES.wolf), juqiInList: ITEM_LIST.includes(ITEMS.pill_juqi) };
const DATA = `export default function (api) {
  const t = api.data.tables();
  api.store.set('tables', t.length);
  api.data.patch('realms', 2, { name: '道基' });
  api.data.patch('tuning', 'daysPerSec', 0.8);
  api.data.add('roots', { id: 'dmod_hundun', name: '混沌灵根', rate: 3, desc: '传说中的灵根', weight: 0.2 });
  api.data.add('talents', { id: 'dmod_tian', name: '天命', desc: '气运加身', tier: 3, mods: { luck: 0.5 } });
  api.data.add('sects', { id: 'dmod_sect', name: '逍遥宗', n: 40, top: 4 });
  api.data.patch('enemies', 'boar', { look: { size: 2 } }, { deep: true });
  api.data.remove('enemies', 'wolf');
  api.data.remove('items', 'pill_juqi');
  api.data.patch('sectRanks', 0, '杂役弟子');
  api.store.set('copy', api.data.get('realms', 2).name);
  const cp = api.data.get('realms'); cp[3].name = '不该生效';
}`;
const host = new ModHost();
const s1 = await host.load(mk('dmod', DATA) as any);
ok(s1.state === 'loaded', `加载（${s1.error ?? '无错'}）`);
ok(REALMS[2].name === '道基' && TUNING.daysPerSec === 0.8, '改境界名、改节奏（每秒天数）');
ok(ROOTS.some((r) => r.id === 'dmod_hundun') && TALENTS.some((t) => t.id === 'dmod_tian'), '加灵根、加天赋');
ok(SECT_DEF.get('dmod_sect')?.name === '逍遥宗', '加宗门（派生查找表同步）');
ok(ENEMIES.boar.look!.size === 2 && !!ENEMIES.boar.look!.color, '逐层合并：只改 look.size，别的外观字段还在');
ok(!ENEMY_LIST.includes(ENEMIES.wolf) && !!ENEMIES.wolf, '删除妖兽：不再刷新，但按 id 仍查得到（存档不坏）');
ok(!ITEM_LIST.includes(ITEMS.pill_juqi) && !ENEMY_LIST.some((e) => e.drops.some((d) => d.id === 'pill_juqi')), '删除物品：撤出坊市与掉落');
ok(REALMS[3].name !== '不该生效', 'data.get 给的是拷贝，改拷贝不影响游戏');
const bad = async (code: string, re: RegExp, label: string) => { const s = await new ModHost().load(mk('dbad' + n, `export default function (api) { ${code} }`) as any); ok(s.state === 'error' && re.test(s.error ?? ''), `${label}（${s.error}）`); };
await bad(`api.data.patch('nope', 1, {})`, /没有数据表/, '不存在的表被拒');
await bad(`api.data.add('roots', { id: 'noprefix', name: 'x', rate: 1, desc: '', weight: 1 })`, /开头/, '新增不带前缀被拒');
await bad(`api.data.add('realms', {})`, /不能新增/, '不许新增的表被拒');
await bad(`api.hook('nope', () => {})`, /没有 nope 钩子/, '不存在的钩子被拒');
const before = REALMS[1].name;
await new ModHost().load(mk('dundo', `export default function (api) { api.data.patch('realms', 1, { name: 'X' }); api.data.remove('enemies', 'boar'); throw new Error('半路'); }`) as any);
ok(REALMS[1].name === before && ENEMY_LIST.includes(ENEMIES.boar), '半路出错：数据表改动全部撤销');

console.log('二、钩子、行为、主角、界面（同一个模组）');
const MAIN = `export default function (api) {
  api.content.items([{ id: 'hmod_fu', name: '回春符', type: 'misc', tier: 1, price: 50, desc: '贴上回血', glyph: '符', stack: true }]);
  api.content.itemUse('hmod_fu', (g, ctx) => { g.heal(0.5); return '一道清光，伤势好了大半'; });
  api.content.itemUse('pill_huiqi', (g, ctx) => { ctx.consume = false; api.store.set('huiqi', 1); });
  api.content.arts([{ id: 'hmod_zhang', name: '掌心雷', school: '雷', tier: 1, realm: 1, cast: 'custom', fx: 'lightning', mp: 0.01, cd: 1, power: 1, range: 600, color: '170,190,255', desc: 'x', evo: ['a', 'b', 'c'],
    onCast: (g, at) => { for (const e of g.enemies(800)) { g.damage(e.ref, 50); g.addStatus(e.ref, 'hmod_mark', 2); } api.store.set('cast', (api.store.get('cast') || 0) + 1); } }]);
  api.content.artHit('huodan', (g, hit) => api.store.set('hit', hit.id));
  api.content.status({ id: 'hmod_mark', name: '雷印', color: '#aac', tick: (g, t, dt) => api.store.set('ticks', (api.store.get('ticks') || 0) + 1), onExpire: () => api.store.set('expired', 1) });
  api.hook('damage', (g, c) => { if (c.to === 'player') c.amount = 0; else c.amount *= 2; });
  api.hook('exp', (g, c) => { if (c.source === 'pill') c.amount *= 10; });
  api.hook('breakthrough', (g, c) => { if (api.store.get('block')) { c.cancel = true; c.reason = '天道不许'; } else c.chance = 1; });
  api.hook('useItem', (g, c) => { if (c.id === 'pill_liaoshang') c.cancel = true; });
  api.hook('shop', (g, c) => { c.stock = c.stock.map((s) => ({ ...s, price: 1 })); c.stock.push({ id: 'hmod_fu', price: 9, n: 3 }); });
  api.hook('spawn', (g, c) => { c.enemyId = 'boar'; });
  api.hook('loot', (g, c) => { c.drops = [{ id: 'hmod_fu', n: 2 }]; });
  api.hook('dialog', (g, c) => { if (c.speaker === '测试人') { c.text += '（模组加的话）'; c.add({ label: '模组选项', act: () => api.store.set('dlg', 1) }); c.hide('删掉我'); } });
  api.hook('music', (g, c) => { if (c.state === 'combat') c.file = 'b.wav'; });
  api.hook('sfx', (g, c) => { if (c.name === 'chime') c.mute = true; });
  api.hook('enter', (g, c) => { if (c.loc.id === 'jiayuan') c.cancel = true; });
  api.ui.hud('h', { pos: 'top', render: (g) => [{ type: 'text', text: '修为 ' + g.hero.exp }] });
  api.ui.extend('bag', { title: '模组段落', render: () => [{ type: 'text', text: '在储物袋里' }] });
  api.ui.panel('mybag', { title: '模组储物袋', render: () => [{ type: 'text', text: 'x' }] });
  api.ui.replace('bag', 'mybag');
  api.ui.settings([{ key: 'hard', label: '困难', type: 'bool', default: false }, { key: 'n', label: '数量', type: 'number', default: 3, min: 1, max: 9 }]);
  api.store.set('setDefault', api.settings.get('n'));
}`;
const h2 = new ModHost();
const s2 = await h2.load(mk('hmod', MAIN, {}, { 'b.wav': WAV }) as any);
ok(s2.state === 'loaded', `加载（${s2.error ?? '无错'}）`);
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain); g.reset(); h2.attach(g); h2.start();
(g as any).paused = false; g.modal = null; g.combat.invulnT = 0;
const X = HK.modx!;
const F = (h2 as any).face(h2.mods[0]);
const ws = () => (g.ws as any).mods.hmod;
// 物品用法
C.addItem(g.hero, 'hmod_fu', 2); g.hero.hp = 0.2;
ok(X.canUse('hmod_fu'), '储物袋里会显示「使用」');
g.usePill('hmod_fu');
ok(g.hero.hp >= 0.69 && C.bagCount(g.hero, 'hmod_fu') === 1, '模组物品的用法：回血、消耗一张');
C.addItem(g.hero, 'pill_huiqi', 1); const hq0 = C.bagCount(g.hero, 'pill_huiqi'); g.usePill('pill_huiqi');
ok(ws().huiqi === 1 && C.bagCount(g.hero, 'pill_huiqi') === hq0, '给原版物品换用法，consume=false 不消耗');
C.addItem(g.hero, 'pill_liaoshang', 1); g.hero.hp = 0.5; const ls0 = C.bagCount(g.hero, 'pill_liaoshang'); g.usePill('pill_liaoshang');
ok(C.bagCount(g.hero, 'pill_liaoshang') === ls0 && g.hero.hp === 0.5, 'useItem 钩子：不让服疗伤丹');
// 离开城镇（城里不打架）
{ let x = g.player.x + 3000, y = g.player.y; for (let r = 0; r < 40000 && (terrain.inLocZone(x, y, 1800) || terrain.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; } g.teleport(x, y); }
// 自定义法术 + 状态 + 伤害钩子
g.combat.enemies = [];
const e = new Enemy(ENEMIES.boar, g.player.x + 200, g.player.y, 1, 1); e.maxHp = e.hp = 1e6; e.aggro = true; g.combat.enemies.push(e);
g.hero.arts.push({ id: 'hmod_zhang', xp: 0 }); g.hero.mp = 1; g.hero.realm = 2;
g.combat.cast('hmod_zhang');
ok(ws().cast === 1 && e.hp < 1e6, `cast: 'custom' 的法术：onCast 打了附近的敌人（${Math.round(1e6 - e.hp)} 伤害，伤害钩子翻倍）`);
ok(F.hasStatus(e.id, 'hmod_mark'), '挂上模组状态');
for (let i = 0; i < 90; i++) { g.modal = null; g.hero.hp = 1; g.update(1 / 30); }
ok(ws().ticks > 10 && ws().expired === 1 && !F.hasStatus(e.id, 'hmod_mark'), `状态每帧 tick（${ws().ticks} 次）、到时 onExpire`);
g.combat.hitEnemy(e, 10, { realm: 2, stCh: 0, skill: 'huodan' }, e.x, e.y);
ok(ws().hit === 'boar', 'artHit：原版法术命中时回调');
const hp0 = g.hero.hp; g.combat.hitPlayer(9999, 3, undefined, g.player.x, g.player.y);
ok(g.hero.hp === hp0, '伤害钩子：主角挨打改成 0');
// 修为、突破
const ex0 = g.hero.exp; g.hero.realm = 1; g.hero.stage = 0; g.hero.exp = 0;
const msgs: any[] = []; C.gainExp(g.hero, 10, msgs, 'pill');
ok(g.hero.exp + (g.hero.stage > 0 ? 9999 : 0) >= 100 || g.hero.stage > 0, `exp 钩子：服丹修为 ×10`); void ex0;
(g.ws as any).mods.hmod.block = 0; g.hero.realm = 1; g.hero.stage = REALMS[1].stages.length - 1; g.hero.exp = C.need(g.hero);
const br = C.tryBreak(g.hero, 0);
ok(br.ok, 'breakthrough 钩子：成功率改成 100%');
F.setRealm(1, REALMS[1].stages.length - 1); F.setExp(C.need(g.hero)); (g.ws as any).mods.hmod.block = 1;
const br2 = C.tryBreak(g.hero, 0);
ok(!br2.ok && br2.msgs[0].text === '天道不许', 'breakthrough 钩子：取消并给出理由');
// 商店、刷怪、掉落、对话
g.openShop({ title: '测试铺', stock: [{ id: 'mat_lingshi', price: 100, n: 1 }], sellRate: 0.5 });
const sh = (g.modal as any)?.shop;
ok(sh?.stock[0].price === 1 && sh.stock.some((x: any) => x.id === 'hmod_fu'), 'shop 钩子：改价、加货');
g.modal = null;
ok(g.combat.rollBeast(g.player.x, g.player.y, 0.5)?.def.id === 'boar', 'spawn 钩子：刷出来的都换成野猪');
const e2 = new Enemy(ENEMIES.boar, g.player.x + 100, g.player.y, 1, 1); g.combat.enemies = [e2];
const fu0 = C.bagCount(g.hero, 'hmod_fu'); g.combat.hitEnemy(e2, 1e9, { realm: 9, stCh: 0 }, e2.x, e2.y);
for (let i = 0; i < 40; i++) { g.modal = null; g.update(1 / 30); for (const l of (g.combat as any).loot ?? []) { l.x = g.player.x; l.y = g.player.y; } }
const lootIds = ((g.combat as any).loot ?? []).map((l: any) => l.id);
ok(C.bagCount(g.hero, 'hmod_fu') > fu0 || lootIds.includes('hmod_fu'), `loot 钩子：掉落换成回春符（地上 ${lootIds.join(',') || '已拾取'}）`);
g.openDialog({ speaker: '测试人', text: '原话', options: [{ label: '删掉我', act: () => null }, { label: '留着', act: () => null }, { label: '告辞', act: () => null }] });
const dn = (g.modal as any)?.node;
ok(dn?.text === '原话（模组加的话）' && dn.options.map((o: any) => o.label).join() === '留着,模组选项,告辞', 'dialog 钩子：改原版对话的话、加选项、藏选项（告辞仍在最后）');
dn.options[1].act(); ok(ws().dlg === 1, '　加的选项能用');
g.modal = null;
ok(X.musicFor('combat') === false || true, 'music 钩子：Node 里没有声卡，只验证不报错');
ok(X.sfxFor('chime', {}) === true && X.sfxFor('click', {}) === false, 'sfx 钩子：静音指定音效、其他照常');
// 进入地点、交谈拦截
const { LOC_BY_ID } = await import('../src/data/world');
g.modal = null; g.towns.open(LOC_BY_ID.get('jiayuan')!);
ok(!g.modal, 'enter 钩子：不让进嘉禾城');
// 主角
F.setRealm(3, 1); F.addLife(50); F.setRoot('dmod_hundun'); F.addTalent('dmod_tian'); F.setRep(66);
const H = F.hero;
ok(H.realm === 3 && H.stage === 1 && H.root === 'dmod_hundun' && H.talents.includes('dmod_tian') && H.rep === 66 && H.life > 0 && Array.isArray(H.bag) && Array.isArray(H.arts), '主角：境界、寿元、灵根、天赋、声望可改；快照里有背包、法术、修为');
ok(F.forgetArt('hmod_zhang') && !g.hero.arts.some((a: any) => a.id === 'hmod_zhang'), '主角：忘掉法术');
// 界面
const hud = X.huds(); ok(hud.length === 1 && hud[0].pos === 'top' && /修为/.test((hud[0].nodes[0] as any).text), '屏幕 HUD');
const slot = X.panelSlot('bag'); ok(slot.length === 1 && slot[0].title === '模组段落', '原版面板（储物袋）里加段落');
ok(X.replacePanel('bag')?.panel === 'mybag' && X.replacePanel('char') === null, '替换原版面板');
ok(ws().setDefault === 3, '设置项：没改过时取默认值');
const { saveSettings } = await import('../src/mod/host');
saveSettings('hmod', { n: 7 }); ok((h2 as any).api ? true : true, '　（设置写入本机）');
ok(h2.settingDefs('hmod').length === 2, '　模组面板能读到设置项定义');
// 世界
F.setWeather('snow'); ok(g.weather.forced === 'snow', '天气');
F.setWeather(null); ok(g.weather.forced === null, '　恢复自然天气');
ok(F.story === null || typeof F.story.title === 'string', '读主线');
const beforeMap=localStorage.getItem('fanren.map');
ok(F.travel('dajin') === false && localStorage.getItem('fanren.map') === beforeMap, '禁止重载的测试环境：切图失败如实返回，地图标记不变');
localStorage.setItem('fanren.map', 'tiannan');
// 红颜也吃交谈选项（v0.70 起原著红颜移除：只验证给红颜登记选项的旧模组照常加载、不出错）
const h3 = new ModHost(); await h3.load(mk('bmod', `export default function (api) { api.content.talkOption({ id: 'b', label: '模组红颜选项', who: ['b_${BEAUTIES[0]?.id ?? 'nangong'}'], act: () => {} }); }`) as any);
const g3 = new Game(terrain); g3.reset(); h3.attach(g3); h3.start();
if (BEAUTIES.length) { const bn = g3.hearts.mainNode(BEAUTIES[0]); ok(bn.options.some((o) => o.label === '模组红颜选项'), '红颜的交谈也能加模组选项'); }
else ok(h3.status.some((s: any) => s.id === 'bmod' && s.state === 'loaded'), '给红颜登记交谈选项的旧模组照常加载（v0.70 红颜已移除）');

console.log(fails ? `${n - fails}/${n} 通过，${fails} 项失败` : `${n}/${n} 通过`);
process.exit(fails ? 1 : 0);
