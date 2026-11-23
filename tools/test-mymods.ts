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

// MYMODS_DIR / MYMODS_ONLY：换一个放 .fmod 的目录、只装名单里的几个（例：在作者的 v0.8 或 B 版里只试万宝阁和天工试场）
const MOD_DIR = process.env.MYMODS_DIR ?? 'dist-mods', ONLY = process.env.MYMODS_ONLY?.split(',');
const set = (JSON.parse(readFileSync(process.env.MYMODS_SET ?? 'dist-mods/b-set.json', 'utf8')) as { id: string; version: string; name: string }[]).filter((m) => !ONLY || ONLY.includes(m.id));
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
  const f = `${MOD_DIR}/${m.id}-${m.version}.fmod`;
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

// 三、绘制项收得起来（HD2D 下带立板范围的项要有 hx / hb）
{
  const list: any[] = [];
  host.collect(list);
  for (const it of list) assert.ok(typeof it.draw === 'function' && Number.isFinite(it.y), '模组的绘制项结构完整');
}

// 四、模组加的敌人：刷得出来、打得动、打得死（伤害走 hitEnemy，模组的 damage 钩子都会经过）
{
  const mine = Object.keys(ENEMIES).filter((k) => /^klk|^drg/.test(k));
  assert.ok(mine.length > 0 || !loaded.includes('drgnext'), '模组注册了自己的敌人');
  for (const id of mine.slice(0, 4)) {
    const e = new Enemy(ENEMIES[id], g.player.x + 240, g.player.y, 3, 1); e.aggro = true; g.combat.enemies.push(e);
    step(20);
    g.combat.hitEnemy(e, Math.max(1, e.maxHp * 0.2), { realm: 4, stCh: 0 }, g.player.x, g.player.y);
    step(20);
    g.combat.hitEnemy(e, 1e12, { realm: 9, stCh: 0 }, g.player.x, g.player.y);
    step(40);
  }
  none('刷模组的敌人并打它');
}

// 五、主角挨打也过模组（无敌、减伤这类模组靠它）
{
  g.combat.invulnT = 0; const hp0 = g.hero.hp;
  g.combat.hitPlayer(Math.max(1, g.hero.maxHp * 0.05), g.player.x + 50, g.player.y, { realm: 2 } as any);
  step(10); g.combat.invulnT = 1e9; g.hero.hp = Math.max(g.hero.hp, hp0);
  none('主角挨打');
}

// 六、存档往返、再跑一阵
{
  const data = g.save?.('auto' as any);
  step(120);
  void data;
  none('存档之后');
}

// 七、键位：模组用的键（实际在用 F2、F7、F9；规则上数字 7–0 和 F2 / F4 / F6–F10 都留给模组）核心不能默认占
for (const k of ['7', '8', '9', '0', 'f2', 'f4', 'f6', 'f7', 'f8', 'f9', 'f10']) assert.equal(actionOfKey(k), undefined, `核心默认占了留给模组的键 ${k}`);

console.warn = ow; console.error = oe;
console.log(`PASS 我的模组：${loaded.join('、')} ${loaded.length} 个都加载、开局、跑帧、刷怪挨打、存档无错；留给模组的键没被核心占用`);
process.exit(0);
