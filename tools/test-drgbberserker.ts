// 用户在玩的六个模组（dist-mods/b-set.json：drgnext、klkport、klkmodel、klkvoice、shahe、wanbao）在 B 版里的冒烟：
// 按依赖顺序装进无头游戏，开局、跑一阵、刷一个模组首领并打它、看绘制项，断言哪个模组都没报错；
// 再查模组用的键没被核心占用。画面和界面那一半（标题页的入口、万宝阁、试场）由实机截图另验。
//
// 为什么要有这一项（2026-11-15）：这一轮要大改储物袋、战斗、界面，用户问「以前的模组还能用吗」——每次合并都跑它。
import './env';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'fs';

// —— 浏览器环境的桩：模组（高级权限的那几个）会直接摸 DOM、建样式、挂监听；这里给一个「什么都能调、什么都不做」的桩
const listeners: Record<string, Function[]> = {};
function soft(name: string, base: Record<string, unknown> = {}): any {
  const fn = function () { /* 可调用 */ } as any;
  return new Proxy(fn, {
    get(_t, k) {
      if (k in base) return base[k as string];
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return undefined;
      if (k === 'then') return undefined;
      if (k === 'length') return 0;
      if (k === 'style' || k === 'classList' || k === 'dataset' || k === 'children' || k === 'childNodes') return (base[k as string] ??= k === 'children' || k === 'childNodes' ? [] : soft(name + '.' + String(k)));
      if (k === 'getContext') return () => makeCanvas().getContext('2d');
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, x: 0, y: 0 });
      // 模组自己建的元素（innerHTML 拼出来的界面）里找子元素：给一个同样的桩；整份文档里找游戏的元素则找不到（见下面 document 的定义）
      if (k === 'querySelector' || k === 'closest') return () => soft(name + ' *');
      if (k === 'getElementById') return () => null;
      if (k === 'querySelectorAll' || k === 'getElementsByClassName' || k === 'getElementsByTagName') return () => [];
      if (k === 'contains' || k === 'matches' || k === 'hasAttribute') return () => false;
      if (k === 'getAttribute') return () => null;
      if (k === 'toString') return () => '';
      return (base[k as string] ??= soft(name + '.' + String(k)));
    },
    set(_t, k, v) { base[k as string] = v; return true; },
    apply() { return soft(name + '()'); },
    construct() { return soft('new ' + name); },
  });
}
const { createCanvas } = await import('@napi-rs/canvas');
const makeCanvas = () => { const c: any = createCanvas(64, 64); c.style = {}; c.addEventListener = () => {}; c.removeEventListener = () => {}; c.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800 }); c.classList = soft('classList'); c.setAttribute = () => {}; c.remove = () => {}; return c; };
const store: Record<string, string> = {};
const storage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; }, key: (i: number) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; } };
const doc0 = (globalThis as any).document ?? {};
const head = soft('head'), body = soft('body');
(globalThis as any).document = soft('document', {
  ...doc0,
  createElement: (t: string) => (t === 'canvas' ? makeCanvas() : soft('<' + t + '>', { tagName: String(t).toUpperCase(), appendChild: (x: unknown) => x, remove() {}, setAttribute() {}, addEventListener() {}, removeEventListener() {} })),
  createElementNS: (_n: string, t: string) => soft('<' + t + '>'),
  head, body, documentElement: soft('html'),
  querySelector: () => null, getElementById: () => null, querySelectorAll: () => [],
  addEventListener: (k: string, f: Function) => { (listeners['d:' + k] ??= []).push(f); }, removeEventListener() {},
  fonts: doc0.fonts ?? { check: () => true, load: () => Promise.resolve() },
  hidden: false, visibilityState: 'visible', readyState: 'complete',
});
const win: any = soft('window', {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: (k: string, f: Function) => { (listeners[k] ??= []).push(f); }, removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
  localStorage: storage, sessionStorage: storage,
  location: { href: 'http://localhost/', origin: 'http://localhost', search: '', hash: '', pathname: '/', reload() {} },
  navigator: { userAgent: 'node', maxTouchPoints: 0, language: 'zh-CN' },
  performance, document: (globalThis as any).document,
});
(globalThis as any).window = win;
(globalThis as any).localStorage = storage; (globalThis as any).sessionStorage = storage;
if (!(globalThis as any).navigator?.userAgent) try { (globalThis as any).navigator = win.navigator; } catch { /* Node 21+ 自带只读的 navigator */ }
(globalThis as any).location = win.location;
(globalThis as any).requestAnimationFrame = () => 0; (globalThis as any).cancelAnimationFrame = () => {};
(globalThis as any).indexedDB = undefined;
(globalThis as any).HTMLElement ??= class {}; (globalThis as any).HTMLCanvasElement ??= class {}; (globalThis as any).Audio ??= function () { return soft('audio', { play: () => Promise.resolve(), pause() {} }); };
(globalThis as any).fetch ??= () => Promise.reject(new Error('offline'));
(globalThis as any).__TAIXU_NORELOAD = true;
// 模组里有不带 window. 前缀直接调的全局（addEventListener、getComputedStyle、各种 Observer……）
{
  const G = globalThis as any;
  G.addEventListener ??= win.addEventListener; G.removeEventListener ??= () => {}; G.dispatchEvent ??= () => true;
  G.innerWidth ??= 1280; G.innerHeight ??= 800; G.devicePixelRatio ??= 1;
  G.getComputedStyle ??= () => soft('computedStyle', { getPropertyValue: () => '' });
  for (const k of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) G[k] ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  G.CSS ??= { escape: (x: string) => String(x), supports: () => false };
  G.matchMedia ??= win.matchMedia;
  G.KeyboardEvent ??= class {}; G.MouseEvent ??= class {}; G.PointerEvent ??= class {}; G.Event ??= class {}; G.CustomEvent ??= class {};
}


const PACKS = (process.env.BB_PACKS ?? 'drgnext-1.3.4,drgbberserker-1.4.0,klkport-1.3.1').split(',');
const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const host = new ModHost();
(globalThis as any).__modHost = host; win.__modHost = host;
const logs: string[] = [];
const ow = console.warn, oe = console.error;
console.warn = (...a: unknown[]) => { logs.push('warn ' + a.map(String).join(' ').slice(0, 300)); };
console.error = (...a: unknown[]) => { logs.push('error ' + a.map(String).join(' ').slice(0, 300)); };
for (const p of PACKS) {
  const st = await host.load(JSON.parse(readFileSync('dist-mods/' + p + '.fmod', 'utf8')));
  assert.equal(st.state, 'loaded', p + ' 加载失败：' + st.error);
}
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain); g.reset();
win.__game = g; (globalThis as any).__game = g;
host.attach(g); host.start();
(g as any).paused = false;
const step = (n: number) => { for (let i = 0; i < n; i++) { if (g.modal) g.closeModal(true); (g as any).paused = false; g.update(1 / 30); } };
step(60);
const errs = () => Object.fromEntries(host.status.map((s) => [s.id, s.errors ?? 0]));
const none = (when: string) => { const e = errs(), bad = Object.entries(e).filter(([, n]) => n > 0); assert.equal(bad.length, 0, when + '：模组回调出错 ' + JSON.stringify(e) + '\n' + logs.slice(-14).join('\n')); };
none('开局');
const BB = (globalThis as any).__drgbberserker, D = (globalThis as any).DrGNext;
assert.ok(BB && D, '浴血魔神、DrG 都就位');

// 一、人物、地点：有名有姓的人、会四处走（不是钉在住处）
const loc = LOC_BY_ID.get(BB.LOC); assert.ok(loc, '血祭坛在地图上');
const d = g.npcs.byId.get(BB.NPC); assert.ok(d && d.alive, '屠渊在世');
assert.ok(!d.stay && d.canon && d.mod === 'drgbberserker', '屠渊：四处走动、按原设人物待遇');
for (const id of ['klkport_ryuko', 'klkport_satsuki']) { const k = g.npcs.byId.get(id); assert.ok(k && !k.stay, id + ' 改成四处走动'); }
console.log('一 人物：屠渊住在血祭坛（' + loc.x + ',' + loc.y + '），四处走动；KLK 两人也不再钉在学园');

// 二、主角站到血祭坛边上（野外，伤害不被城镇挡），切磋：贴图傀儡接管
// 野外空地：敌人进不了城镇 / 宗门的安全区（走不动、会被清出战场），找一块离安全区远、走得动的地方
const home = () => { const p: any = g.player; p.x = p.st.x = wild.x; p.y = p.st.y = wild.y; (D as any)._rt.playerAir.clear(); };
const wild = (() => { const C: any = g.combat, T: any = (g as any).terrain, cx = loc.x * WORLD_SCALE, cy = loc.y * WORLD_SCALE;
  for (let r = 300; r < 6000; r += 150) for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) { const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if ([[0, 0], [400, 0], [-400, 0], [0, 300], [0, -300]].every(([dx, dy]) => !C.safeAt(x + dx, y + dy) && T.walkFactor(x + dx, y + dy) > 0)) return { x, y }; }
  return { x: cx + 600, y: cy + 300 }; })();
g.teleport(loc.x * WORLD_SCALE + 600, loc.y * WORLD_SCALE + 300); step(30);
const bot = D.challenge(BB.NPC, { spar: true });
assert.ok(bot, '切磋：DrG 接管屠渊');
step(10);
const fr = D.mugenFrame(bot);
assert.ok(fr && typeof fr.no === 'number', '屠渊画成 MUGEN 贴图人物（当前动作 ' + fr?.no + '）');
none('切磋开打');

// 三、每一招都放得出、放得完，判定打得到主角（切磋是点到为止、不扣血：这里另刷一个敌对的来试招）
bot.stop(); for (const e of [...g.combat.enemies]) if (e.npcId === BB.NPC) e.hp = 0; step(60);
console.log('   试招地点：野外', Math.round(wild.x), Math.round(wild.y), '主角', Math.round(g.player.x), Math.round(g.player.y), '安全区=' + (g.combat as any).safeAt(g.player.x, g.player.y));
const foeBot = D.spawn(BB.BOT, { dx: 110, dy: 0 });
assert.ok(foeBot, '刷出一个敌对的屠渊');
g.combat.invulnT = 0;
if (process.env.BB_DEBUG) (globalThis as any).__bbdbg = 1;
const rows: string[] = [];
let foe1 = foeBot;
// 数特效：放出来的 Explod 个数、落点算不出来（NaN）的个数
const ex0 = D.explod; let exN = 0, exBad = 0;
D.explod = (o: any) => { const h = ex0(o); if (h) { exN++; const p = { x: h.bind ? h.bind.x + h.rx : h.x + h.rx, y: h.bind ? h.bind.y : h.y }; if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { exBad++; if (process.env.BB_DEBUG) console.log('NaN特效', JSON.stringify({ ...o, bot: !!o.bot, bind: o.bind && typeof o.bind })); } } return h; };
const noFx: string[] = [];
const moveStat: Record<string, { travel: number; push: number; airMax: number; stunned: boolean }> = {};
for (const [k, m] of (Object.entries(BB.MOVES) as [string, any][]).filter(([k]) => !process.env.BB_ONLY || process.env.BB_ONLY.split(',').includes(k))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (foe1.e.dead || !D.botOf(foe1.e) || !g.combat.enemies.includes(foe1.e)) { console.log('     （上一招后试招对象没了：dead=' + foe1.e.dead + ' hp=' + Math.round(foe1.e.hp) + ' 在场=' + g.combat.enemies.includes(foe1.e) + '，重刷）'); foe1 = D.spawn(BB.BOT, { dx: 110, dy: 0 }); }
    const bot = foe1; bot.stop(); step(2);
    bot.e.x = g.player.x + 110; bot.e.y = g.player.y; bot.ang = Math.PI; bot.e.hp = bot.e.maxHp; g.hero.hp = 1; g.hero.dead = false;
    bot.data.baozou = 0; bot.data.kuangbao = 0;
    const hp0 = g.hero.hp; let seen = new Set<number>(), t = 0, lo = hp0; const ex1 = exN; let dmgSum = 0;
    const x0 = bot.e.x, y0 = bot.e.y, hx0 = g.player.x, hy0 = g.player.y; let push = 0, travel = 0, airMax = 0, stunned = false; (D as any)._rt.playerAir.clear();
    if (process.env.BB_DEBUG) { const st0 = bot.stop.bind(bot); bot.stop = () => { if (bot.task) console.log('STOPTRACE', new Error().stack?.split('\n').slice(2, 7).join(' | ')); st0(); }; const rx0 = bot.react.bind(bot); bot.react = (...a: any[]) => { const r = rx0(...a); if (r) console.log('REACT', a[1]); return r; }; }
    bot.run(function* (b: any) { try { yield* m.run(b); } catch (e: any) { console.log('招式出错', m.name, e?.stack?.slice(0, 600)); throw e; } finally { if (process.env.BB_DEBUG) console.log('收招', m.name, t.toFixed(2), 'busy', bot.busy, 'stun', bot.stun, 'dead', bot.e.dead, 'hero', g.hero.hp, g.hero.dead, 'task', bot.task, 'enemy', !!bot.enemy); } }, m.name);
    while (bot.busy && t < 12) { step(1); t += 1 / 30; lo = Math.min(lo, g.hero.hp); if (g.hero.hp < 1) { dmgSum += 1 - g.hero.hp; g.hero.hp = 1; } travel = Math.max(travel, Math.hypot(bot.e.x - x0, bot.e.y - y0)); push = Math.max(push, Math.hypot(g.player.x - hx0, g.player.y - hy0)); airMax = Math.max(airMax, (D as any)._rt.playerAir.height); if ((g.combat as any).status?.stun > 0 || (g as any).hero?.stun > 0 || (g.combat as any).stunT > 0) stunned = true; const f = D.mugenFrame(bot); if (f) seen.add(f.no); if (process.env.BB_DEBUG && Math.round(t * 30) % 15 === 0) console.log('DBG', k, t.toFixed(2), bot.taskName, f?.no, f?.el, 'hold', bot.hold.vx.toFixed(0), 'last', bot.lastVx?.toFixed?.(0), 'x', bot.e.x.toFixed(0), 'root', bot.e.st?.root, 'stun', bot.stun, 'frz', bot.frozen, 'z', bot.z?.toFixed?.(1), 'vz', bot.vz?.toFixed?.(1), 'stun', bot.stun); g.hero.hp = 1; g.hero.dead = false; (g.combat as any).invulnT = 0; }
    if (process.env.BB_POS) console.log('POS', m.name, 't', t.toFixed(2), 'botΔ', Math.round(bot.e.x - x0), Math.round(bot.e.y - y0), 'hero-bot', Math.round(Math.hypot(g.player.x - bot.e.x, g.player.y - bot.e.y)), 'inCombat', g.combat.enemies.includes(bot.e), 'enemies', g.combat.enemies.length, 'heroHp', g.hero.hp.toFixed(2));
    const cut = t < 12 && !g.combat.enemies.includes(bot.e);   // 招式中途试招对象被游戏移出战场（上一招把主角打远了）：重来一次
    if (cut && attempt < 2) { console.log('     （' + m.name + ' 放到一半试招对象被移出战场，重来）', JSON.stringify({ gone: bot.e.gone, fled: bot.e.fled, cowered: bot.e.cowered, dead: bot.e.dead, d: Math.round(Math.hypot(bot.e.x - g.player.x, bot.e.y - g.player.y)), t: t.toFixed(2) })); foe1 = D.spawn(BB.BOT, { dx: 110, dy: 0 }); for (let i = 0; i < 60; i++) step(1); continue; }
    assert.ok(t < 12, m.name + ' 放完收招（没卡住）');
    moveStat[k] = { travel, push, airMax, stunned };
    const dmg = Math.max(hp0 - lo, dmgSum);
    for (let i = 0; i < 90; i++) step(1);   // 等辅助体（地裂、血柱、陨石）放完
    if (m.cost && exN === ex1) noFx.push(m.name);
    rows.push(m.name + ' ' + t.toFixed(1) + 's 动作[' + [...seen].slice(0, 5).join(',') + '] 特效' + (exN - ex1) + ' 位移' + Math.round(travel) + '/推' + Math.round(push) + (airMax > 1 ? ' 打飞' + Math.round(airMax) : '') + (dmg > 0 ? ' 伤' : ''));
    break;
  }
  none(m.name);
}
console.log('三 招式：' + rows.join('；'));
D.explod = ex0;
// 主角挨过挑飞、硬直之后，姿势里不能有 NaN（v0.8 给姿势加了兵器、肢体缩放字段，DrG 的受击姿势缺了它们，原版过渡算出 NaN，整帧画不出来）
{ const cs: any = g.player.st; const bad: string[] = []; for (const nm of ['from', 'last']) for (const [k, v] of Object.entries(cs[nm] ?? {})) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(nm + '.' + k); assert.deepEqual(bad, [], '主角姿势没有 NaN'); }
assert.equal(exBad, 0, '特效落点都算得出来（' + exBad + ' 个 NaN）');
assert.deepEqual(noFx, [], '必杀都放出了特效');
// 1.3.0 位移与控制（照原版物理）：三段斩一路往前冲、崩山击 / 崩山裂地斩跳到对手面前；挑飞类把主角打上天
if (!process.env.BB_ONLY) {
  // 位移：单独一块空地、只留一个试招的，站在 260 外：冲刺 / 跳斩要真的过去（贴身就停）
  const trav: Record<string, number> = {};
  g.teleport(wild.x, wild.y); step(60);
  for (const k of ['sanduan', 'bengshan', 'bengshanliedi']) {
    for (const e of [...g.combat.enemies]) e.hp = 0; step(60); home();
    const fb = D.spawn(BB.BOT, { dx: 260, dy: 0 }); step(2); fb.stop();
    fb.e.x = g.player.x + 260; fb.e.y = g.player.y; fb.ang = Math.PI; fb.e.hp = fb.e.maxHp; g.hero.hp = 1; (D as any)._rt.playerAir.clear(); fb.data.rage = 300;
    const sx = fb.e.x; let mx = 0, tt = 0;
    fb.run(function* (b: any) { yield* BB.MOVES[k].run(b); }, k);
    const inF0 = g.combat.enemies.includes(fb.e);
    while (fb.busy && tt < 6) { step(1); tt += 1 / 30; mx = Math.max(mx, sx - fb.e.x); g.hero.hp = 1; if (process.env.BB_TRAV && Math.round(tt * 30) % 4 === 0) console.log('TRAV', k, tt.toFixed(2), D.mugenFrame(fb)?.no, 'hold', fb.hold.vx.toFixed(0), fb.hold.vy.toFixed(0), 'last', fb.lastVx?.toFixed(0), 'x', (fb.e.x - sx).toFixed(0), 'ang', fb.ang.toFixed(2), 'st', JSON.stringify(fb.e.st), 'mv', fb.mvx?.toFixed?.(0), 'enemy', fb.enemy?.kind); }
    trav[k] = Math.round(mx); if (process.env.BB_TRAV) console.log('TRAVEND', k, 'inFight', inF0, g.combat.enemies.includes(fb.e), 'safe', (g.combat as any).safeAt(g.player.x, g.player.y)); fb.stop(); fb.e.hp = 0; step(30);
  }
  console.log('   位移（站 260 外）：' + JSON.stringify(trav) + ' safeAt(主角)=' + (g.combat as any).safeAt?.(g.player.x, g.player.y) + ' safeAt(祭坛)=' + (g.combat as any).safeAt?.(loc.x * WORLD_SCALE, loc.y * WORLD_SCALE) + ' walk=' + (g as any).terrain.walkFactor(g.player.x + 100, g.player.y));
  assert.ok(trav.sanduan > 80, '三段斩往前冲（' + trav.sanduan + '）');
  assert.ok(trav.bengshan > 80, '崩山击跳到对手面前（' + trav.bengshan + '）');
  assert.ok(trav.bengshanliedi > 80, '崩山裂地斩跳到对手面前（' + trav.bengshanliedi + '）');
  const airs = Object.entries(moveStat).filter(([, s]) => s.airMax > 1).map(([k]) => k);
  assert.ok(airs.length >= 4, '好几招能把主角打上天（' + airs.join('、') + '）');
}
const struck = rows.filter((r) => r.endsWith(' 伤')).length;
if (!process.env.BB_ONLY) assert.ok(struck >= 14, '大部分招式打得到主角（' + struck + '/' + rows.length + '）');
foe1.stop(); foe1.e.hp = 0; step(90);
none('试招结束');

// 四、同行：一进战斗由替身上场，打完撤下回到身边
const dd = g.npcs.byId.get(BB.NPC)!; dd.alive = true; dd.favor = 60; dd.bond = 'companion'; dd.bondUntil = g.day + 30;
g.combat.enemies.length = 0; g.combat.allies.length = 0; step(10);
const a = g.npcs.summon(BB.NPC)!; step(10);
assert.ok(g.npcs.followers().includes(a), '屠渊同行');
const foe = new Enemy(ENEMIES.bandit ?? Object.values(ENEMIES)[0], g.player.x + 300, g.player.y, 2, 1); foe.aggro = true; foe.maxHp = foe.hp = foe.maxHp * 6; g.combat.enemies.push(foe);
g.combat.invulnT = 1e9;
const stepF = (n: number, ...fs: any[]) => { for (let i = 0; i < n; i++) { for (const f of fs) if (!f.dead) f.aggro = true; step(1); } };
stepF(20, foe);
if (process.env.BB_DEBUG) console.log('PXDBG proxies', JSON.stringify(D.proxies()), 'a.proxy', !!a.proxy, 'follow', g.npcs.followers().map((x: any) => x.d.id).join(','), 'act', a.act, 'downT', (a as any).downT, 'foe aggro', foe.aggro, foe.dead, Math.round(Math.hypot(foe.x - a.st.x, foe.y - a.st.y)), 'enemies', g.combat.enemies.length, 'allies', g.combat.allies.length, 'paused', (g as any).paused, logs.filter((l) => /替身|出错/.test(l)).slice(-3).join(' | '));
assert.ok(D.proxies().includes(BB.NPC) && a.proxy && g.combat.allies.includes(a.proxy), '进了战斗：替身上场（友方战斗单位）');
const px = a.proxy; const fhp = foe.hp;
stepF(240, foe);
assert.ok(foe.hp < fhp || foe.dead, '替身用自己的招式打敌人（敌人掉血 ' + Math.round(fhp - foe.hp) + '）');
assert.ok(Math.hypot(a.st.x - px.x, a.st.y - px.y) < 5 || !a.proxy, '本人跟着替身走');
foe.hp = 0; foe.dead = true; g.combat.enemies.length = 0;
step(150);
assert.ok(!a.proxy && !D.proxies().includes(BB.NPC) && !g.combat.allies.includes(px), '打完替身撤下');
assert.ok(g.npcs.followers().includes(a) && dd.alive, '人还在、还同行');
none('同行替身');
console.log('四 同行：进战斗替身上场、打完撤下回到身边');

// 五、替身气血见底：撤下来按重伤调息，人不死
{
  const foe2 = new Enemy(ENEMIES.bandit ?? Object.values(ENEMIES)[0], g.player.x + 300, g.player.y, 2, 1); foe2.aggro = true; foe2.maxHp = foe2.hp = foe2.maxHp * 6; g.combat.enemies.push(foe2);
  stepF(20, foe2);
  const p2 = a.proxy; assert.ok(p2, '又上场');
  p2.hp = Math.max(1, p2.maxHp * 0.05); stepF(15, foe2);
  assert.ok(!a.proxy && (a as any).downT > 0 && dd.alive, '替身见底：撤下、重伤调息、人不死');
  g.combat.enemies.length = 0; step(30);
  none('替身见底');
}
console.warn = ow; console.error = oe;
console.log('PASS 浴血魔神：人物与地点、四处走动、切磋由贴图傀儡接管、' + rows.length + ' 招都放得完（' + struck + ' 招打中）、同行替身上场 / 撤下 / 见底调息，模组无错');
process.exit(0);
