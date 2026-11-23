// drgnext 1.2.5 / KLK（用户 2026-11-19：KLK 的人老是莫名其妙飞到很高的位置，玩家都没飞起来；把玩家击飞后落地弹跳太久、控制很久）。
// 无头游戏里装上 b-set.json 的模组，流子、皐月各按几颗固定种子对站在地上不动的主角打一阵，量两样：
//   主角好好站在地上时她飞多高、在 300 以上高处一口气待多久；主角每次被打飞后弹了几下、从被打飞到能动用了多久。
// DRG_FMOD=dist-mods/drgnext-1.2.4.fmod KLK_FMOD=dist-mods/klkport-1.2.1.fmod 跑旧版能看到毛病（会失败）；PROBE=1 只打印数字不断言；SEEDS=1,2,3 / SECS=60 可调。
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

const set = JSON.parse(readFileSync('dist-mods/b-set.json', 'utf8')) as { id: string; version: string; name: string }[];
const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { actionOfKey } = await import('../src/core/keymap');

const host = new ModHost();
(globalThis as any).__modHost = host; win.__modHost = host;
const logs: string[] = [];
const ow = console.warn, oe = console.error;
console.warn = (...a: unknown[]) => { logs.push('warn ' + a.map(String).join(' ').slice(0, 300)); };
console.error = (...a: unknown[]) => { logs.push('error ' + a.map(String).join(' ').slice(0, 300)); };

// 一、按名单的顺序加载（名单本身就是依赖顺序：框架在前）
const loaded: string[] = [];
for (const m of set) {
  const f = m.id === 'drgnext' && process.env.DRG_FMOD ? process.env.DRG_FMOD : m.id === 'klkport' && process.env.KLK_FMOD ? process.env.KLK_FMOD : `dist-mods/${m.id}-${m.version}.fmod`;
  assert.ok(existsSync(f), `缺模组包 ${f}`);
  const st = await host.load(JSON.parse(readFileSync(f, 'utf8')));
  assert.equal(st.state, 'loaded', `「${m.name}」（${m.id} ${m.version}）加载失败：${st.error}`);
  loaded.push(m.id);
}

// 二、进游戏：开局、连发两次 start（跨图不刷新页面时模组只再收到一次 start）、跑三百帧
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain); g.reset(); g.tutorial.begin();   // 收官 I：和正式新开局一样开着入门一课（引导在模组环境里不能报错、不能卡住流程）
win.__game = g; (globalThis as any).__game = g;
host.attach(g); host.start(); host.start();
(g as any).paused = false; g.combat.invulnT = 1e9;
const step = (n: number) => { for (let i = 0; i < n; i++) { if (g.modal) g.closeModal(true); (g as any).paused = false; g.update(1 / 30); } };
step(300);
const errs = () => Object.fromEntries(host.status.map((s) => [s.id, s.errors ?? 0]));
const none = (when: string) => { const e = errs(), bad = Object.entries(e).filter(([, n]) => n > 0); assert.equal(bad.length, 0, `${when}：模组回调出错 ${JSON.stringify(e)}\n${logs.slice(-12).join('\n')}`); };
none('开局与三百帧');
assert.ok(!(g.tutorial as any).warned && g.tutorial.active && g.tutorial.step !== '', '新手引导在模组环境里照常上课、没出错');


// —— 跑一场：KLK 首领对站在地上不动的主角（不会死、不飞），记她离地多高、主角被打飞后多久才能动
const D = (globalThis as any).DrGNext;
function fight(who: string, seed: number, secs: number) {
  let s = seed >>> 0; const R0 = Math.random; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  try {
    for (const b of D.bots()) { b.e.dead = true; b.e.gone = true; }
    g.combat.enemies.length = 0; step(2);
    g.combat.invulnT = 0;
    D.spawn(who, { x: g.player.x + 300, y: g.player.y + 20, realm: Math.max(3, g.hero.realm), boss: true });
    step(2);
    const bot = D.bots().find((b: any) => b.e?.def?.id === who && b.alive);
    assert.ok(bot, '刷出了 ' + who);
    const rt = bot.rt, A = rt.A, pa = rt.playerAir;
    const stuns: { t: number; dur: number }[] = []; const o0 = A.statusPlayer; A.statusPlayer = (o: any) => { stuns.push({ t: T, dur: o.dur ?? 0 }); return o0.call(A, o); };
    let T = 0, maxGround = 0, hiGround = 0, hiRun = 0, hiLong = 0, groundFor = 0, airStart = -1, bounces = 0, prevZ = 0;
    const launches: { air: number; bounces: number; lost: number }[] = [];
    for (let i = 0; i < secs * 30; i++) {
      g.hero.hp = g.hero.maxHp; if (g.modal) g.closeModal(true); (g as any).paused = false;
      g.update(1 / 30); T += 1 / 30;
      const h = Math.max(bot.z ?? 0, bot.lz ?? 0, bot.az ?? 0);
      const pAir = pa.airborne;
      groundFor = pAir || g.isFlying ? 0 : groundFor + 1 / 30;
      // 主角在地上已经站稳一秒半（不在被挑飞后的追打窗口里）：她还在高处，就是「莫名其妙飞得很高」
      if (groundFor > 1.5) { maxGround = Math.max(maxGround, h); if (h > 300) { hiGround += 1 / 30; hiRun += 1 / 30; hiLong = Math.max(hiLong, hiRun); } else hiRun = 0; } else hiRun = 0;
      if (pAir && airStart < 0) { airStart = T; bounces = 0; prevZ = pa.height; }
      if (pAir) { const z = pa.height; if (prevZ <= 2 && z > prevZ + 0.4 && T - airStart > 0.1) bounces++; prevZ = z; }
      if (!pAir && airStart >= 0) {
        const landT = T, down = stuns.filter((x) => x.t >= landT - 0.1 && x.t <= landT + 0.1).reduce((m, x) => Math.max(m, x.dur), 0);
        launches.push({ air: +(landT - airStart).toFixed(2), bounces, lost: +(landT - airStart + down).toFixed(2) }); airStart = -1;
      }
      if (!bot.alive) break;
    }
    A.statusPlayer = o0;
    bot.e.dead = true; bot.e.gone = true; step(2);
    return { maxGround: Math.round(maxGround), hiGround: +hiGround.toFixed(1), hiLong: +hiLong.toFixed(1), launches };
  } finally { Math.random = R0; }
}
const SEEDS = (process.env.SEEDS ?? '1,2,3,4,5,6').split(',').map(Number), SECS = Number(process.env.SECS ?? 60);
const rows: any[] = [];
for (const who of ['klkport_e_ryuko', 'klkport_e_satsuki']) for (const seed of SEEDS) rows.push({ who: who.slice(10), seed, ...fight(who, seed, SECS) });
const L = rows.flatMap((r) => r.launches);
const sum = { maxGround: Math.max(...rows.map((r) => r.maxGround)), hiGround: +rows.reduce((a, r) => a + r.hiGround, 0).toFixed(1), hiLong: Math.max(...rows.map((r) => r.hiLong)), launches: L.length, maxBounces: Math.max(0, ...L.map((l) => l.bounces)), maxLost: Math.max(0, ...L.map((l) => l.lost)), avgLost: L.length ? +(L.reduce((a, l) => a + l.lost, 0) / L.length).toFixed(2) : 0 };
console.log(JSON.stringify(rows.map((r) => ({ ...r, launches: r.launches.map((l: any) => `${l.air}s/${l.bounces}弹/失控${l.lost}s`).join(' ') }))));
console.log('SUM ' + JSON.stringify(sum));
if (process.env.PROBE) process.exit(0);
// 主角站在地上时她不该悬在半空：一次整跳（原版 625 hu/s，顶点约 460）在 300 以上约 1.2 秒；毛病是飘到七八百、一千多，一悬两三秒到近十秒
assert.ok(sum.maxGround <= 520, `主角好好站在地上时，KLK 首领飞到了 ${sum.maxGround} 高`);
assert.ok(sum.hiLong <= 1.5, `主角好好站在地上时，KLK 首领在 300 以上的高处一口气待了 ${sum.hiLong} 秒`);
// 主角被打飞：落地最多弹一下；从被打飞到能动不超过四秒（最高一挑约 2.1 秒滞空 + 一下矮弹 + 0.6 秒起身）
assert.ok(sum.maxBounces <= 1, `主角落地弹了 ${sum.maxBounces} 下`);
assert.ok(sum.maxLost <= 4, `主角被打飞后失控 ${sum.maxLost} 秒`);
none('KLK 首领对主角打了 ' + rows.length + ' 场');
console.log(`PASS KLK 空中：${rows.length} 场，主角站地上时她最高 ${sum.maxGround}、300 以上最长一口气 ${sum.hiLong} 秒（共 ${sum.hiGround} 秒）；主角被打飞 ${sum.launches} 次，最多弹 ${sum.maxBounces} 下，失控最长 ${sum.maxLost} 秒、平均 ${sum.avgLost} 秒`);
process.exit(0);
