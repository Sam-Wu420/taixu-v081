// drgnext 1.3.0：2D 贴图人物（MUGEN 帧动画）的无头测试。
// 用一份合成的贴图包（@napi-rs/canvas 画的图集 + frames.json）和一个小内容模组刷出贴图傀儡，断言：
//   帧按 AIR 的帧数走（60 帧 / 秒、循环起点、-1 停住、播完停在最后一帧），和傀儡用同一个 dt；朝向翻转（画布像素）；
//   攻击框命中每段每个目标只打一次；特效播完就撤、跟着弹道走、弹道没了就撤；没有立体画面时画进立板；
//   立体画面（scene3d 的替身，真 three 对象）里每人一块板、UV 随朝向翻、叠加不写深度；世界里的 NPC 画成贴图（待机 / 走 / 跑、按左右移动翻面、原版小人藏起来）；
//   热卸载把场景里的板、贴图都放掉。
// 用法：node node_modules/tsx/dist/cli.mjs tools/test-drg-sprite.ts（先 tools/mod-pack.ts mods/drgnext 打包；DRG_FMOD 换包）
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


const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { MOD_FORMAT } = await import('../src/mod/types');
const { BEAST_SPR } = await import('../src/gfx/beastTex');
const THREE: any = await import('three');
const { Image: NImage } = await import('@napi-rs/canvas');

// 浏览器的 Image：用 @napi-rs/canvas 的（能 drawImage）；data: 网址转成 Buffer 再给它
(globalThis as any).Image = class {
  img: any = new NImage(); onload: any = null; onerror: any = null; complete = false;
  get width() { return this.img.width; } get height() { return this.img.height; }
  set src(u: string) { try { this.img.src = Buffer.from(u.slice(u.indexOf(',') + 1), 'base64'); this.complete = true; setTimeout(() => this.onload?.(), 0); } catch (e) { setTimeout(() => this.onerror?.(e), 0); } }
};
// 画布 drawImage 认不得包了一层的图：拆开
{
  const proto = Object.getPrototypeOf(createCanvas(4, 4).getContext('2d'));
  const di = proto.drawImage;
  proto.drawImage = function (img: any, ...a: any[]) { return di.call(this, img?.img ?? img, ...a); };
}

// —— 合成贴图包：图集 0（人物：左半蓝、右半红 / 全绿 / 弹道橙），图集 1 放在另一个「包」里（'sprtestb:' 前缀，同 bbart2）
const atlas0 = createCanvas(64, 64), x0 = atlas0.getContext('2d');
x0.fillStyle = '#0000ff'; x0.fillRect(0, 0, 10, 40); x0.fillStyle = '#ff0000'; x0.fillRect(10, 0, 10, 40);   // '0,0' (0,0,20,40)
x0.fillStyle = '#00ff00'; x0.fillRect(20, 0, 20, 40);                                                       // '0,1' (20,0,20,40)
x0.fillStyle = '#ff8000'; x0.fillRect(40, 0, 16, 8);                                                        // '8,0' (40,0,16,8)
const atlas1 = createCanvas(32, 32), x1 = atlas1.getContext('2d');
x1.fillStyle = '#ffff00'; x1.fillRect(0, 0, 16, 16);                                                        // '9,0'
const png = (c: any) => 'data:image/png;base64,' + c.toBuffer('image/png').toString('base64');
const A1 = png(atlas1);
(globalThis as any).__sprtestb = { file: (n: string) => (n === 'atlas/a1.png' ? A1 : undefined) };
const C1 = [[0, -30, 40, -10]];
const FRAMES = {
  v: 1, src: '合成测试', localcoord: null, atlas: ['atlas/a0.png', 'sprtestb:atlas/a1.png'],
  sprites: { '0,0': { a: 0, x: 0, y: 0, w: 20, h: 40, ax: 10, ay: 40 }, '0,1': { a: 0, x: 20, y: 0, w: 20, h: 40, ax: 10, ay: 40 }, '8,0': { a: 0, x: 40, y: 0, w: 16, h: 8, ax: 8, ay: 4 }, '9,0': { a: 1, x: 0, y: 0, w: 16, h: 16, ax: 8, ay: 8 } },
  anims: {
    0: { loop: 1, frames: [{ s: '0,0', t: 6 }, { s: '0,1', t: 6 }, { s: '0,0', t: 6 }] },
    20: { loop: -1, frames: [{ s: '0,1', t: 5 }] },
    21: { loop: -1, frames: [{ s: '0,0', t: 5 }, { s: '0,1', t: 5 }] },
    100: { loop: -1, frames: [{ s: '0,0', t: 3 }, { s: '0,1', t: -1 }] },
    200: { loop: -1, frames: [{ s: '0,0', t: 4 }, { s: '0,1', t: 4, c1: C1 }, { s: '0,1', t: 4, c1: C1 }, { s: '0,0', t: 4 }, { s: '0,1', t: 4, c1: C1 }, { s: '0,0', t: 10 }] },
    300: { loop: -1, frames: [{ s: '9,0', t: 6, bl: 'add' }, { s: '9,0', t: 6, bl: 'add', fl: 'H' }] },
    400: { loop: -1, frames: [{ s: '8,0', t: 4 }] },
    5000: { loop: -1, frames: [{ s: '0,1', t: 10 }] },
  },
  sounds: {},
};
const CODE = `export default function setup(api) {
  const D = globalThis.DrGNext;
  D.define(api, { id: 'sprtest_bb', name: '测试贴图人', enemy: { kind: 'human', hp: 2, atk: 1, def: 1, speed: 120, minDanger: 99, maxDanger: 99, drops: [] },
    speed: { walk: 110, run: 240 }, ranges: { melee: 90, range: 600, sight: 1400 },
    mugen: { pack: 'frames.json', from: 'sprtest', anims: { idle: 0, walk: 20, run: 21, hitLight: 5000, hitHeavy: 5000 } },
    hooks: { onMeleeAttack() {}, onRangeAttack() {} } });
  api.log('贴图测试模组就绪');
}`;
const BUNDLE = { format: MOD_FORMAT, manifest: { id: 'sprtest', name: '贴图人物测试', version: '1.0.0', author: '测试', desc: '贴图人物的无头测试用', api: 5, deps: ['drgnext'] }, main: 'index.js',
  files: { 'index.js': CODE, 'frames.json': JSON.stringify(FRAMES), 'atlas/a0.png': png(atlas0) } };

const host = new ModHost();
(globalThis as any).__modHost = host; win.__modHost = host;
const logs: string[] = [];
const ow = console.warn, oe = console.error;
console.warn = (...a: unknown[]) => { logs.push('warn ' + a.map(String).join(' ').slice(0, 300)); };
console.error = (...a: unknown[]) => { logs.push('error ' + a.map(String).join(' ').slice(0, 300)); };
const DRG = process.env.DRG_FMOD ?? 'dist-mods/drgnext-' + JSON.parse(readFileSync('mods/drgnext/manifest.json', 'utf8')).version + '.fmod';
assert.ok(existsSync(DRG), '先打包 drgnext：' + DRG);
for (const b of [JSON.parse(readFileSync(DRG, 'utf8')), BUNDLE]) { const st = await host.load(b as any); assert.equal(st.state, 'loaded', b.manifest.id + ' 加载失败：' + st.error); }

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
win.__game = g; (globalThis as any).__game = g;
host.attach(g); host.start();
g.paused = false; g.combat.invulnT = 1e9;
const step = (n: number, dt = 1 / 60) => { for (let i = 0; i < n; i++) { if (g.modal) g.closeModal(true); g.paused = false; g.update(dt); } };
step(30);
const errs = () => host.status.filter((s: any) => (s.errors ?? 0) > 0).map((s: any) => s.id + ':' + s.errors);
const none = (when: string) => assert.deepEqual(errs(), [], when + '：模组回调出错\n' + logs.slice(-12).join('\n'));
await new Promise((r) => setTimeout(r, 30));   // 图集读完
const D = (globalThis as any).DrGNext, rt = D._rt, S = rt.sprites;
assert.equal(D.version, '1.3.0');
const d = S.defs.get('sprtest_bb');
assert.ok(d?.pack, '贴图包读到了（frames.json 从内容模组自己的包里取）');
assert.ok(d.loaded[0] && d.loaded[1], '两张图集都读到了（第二张走 sprtestb: 前缀）');
assert.ok(Math.abs(d.px - 2.5) < 1e-9, '不写 px 时按待机图高 40 → 世界高 100 算：px = 2.5');
assert.ok(BEAST_SPR['e:sprtest_bb'], '藏原画：敌人改走换图路径（近乎透明的小图）');
let pass: string[] = [];

// 一、播放器：AIR 帧数、循环起点、-1 停住、播完停在最后一帧
{
  const s = S.inst({ def: { id: 'sprtest_bb' }, data: {}, t: 0 });
  S.setAction(s, 0); S.advance(s, 5.9); assert.equal(s.el, 0);
  S.advance(s, 0.2); assert.equal(s.el, 1, '6 帧后到第 2 个元素');
  S.advance(s, 5.8); assert.equal(s.el, 1);
  S.advance(s, 0.2); assert.equal(s.el, 2, '12 帧后到第 3 个元素');
  S.advance(s, 5.8); assert.equal(s.el, 2); assert.equal(s.ended, false);
  S.advance(s, 0.2); assert.equal(s.el, 1, '走完回循环起点（第 2 个元素）'); assert.equal(s.ended, true);
  S.advance(s, 60 * 10); assert.ok(s.loops > 5);
  S.setAction(s, 100); S.advance(s, 1e4); assert.equal(s.el, 1, '-1 一直停住'); assert.equal(s.ended, false);
  S.setAction(s, 200, { once: true }); S.advance(s, 100); assert.equal(s.el, 5); assert.ok(s.ended, '播一遍的停在最后一帧');
  S.setAction(s, 21); S.advance(s, 4.5 + 5 * 60 / 60 * 6); // 34.5 帧 → (34.5 mod 10) = 4.5 → 元素 0
  assert.equal(s.el, 0);
  assert.equal(D.animDur({ def: { id: 'sprtest_bb' } }, 'm:200'), 30 / 60, 'D.animDur 认 m:号');
  pass.push('帧时序');
}

// 二、刷出来：和傀儡同一个 dt；朝向翻转
rt.ai.think = () => {};   // 不让 AI 走动（测试自己控制）
const bot = D.spawn('sprtest_bb', { dx: 300, dy: 0 });
assert.ok(bot, '刷出贴图傀儡');
step(2);
assert.ok(bot._s, '傀儡有播放器'); assert.equal(bot._s.no, 0, '待机动作');
{
  bot.animPlay = { name: 'm:21', loop: true };
  step(1); const t0 = bot.t, s0 = bot._s.time;
  step(37);
  assert.ok(Math.abs((bot._s.time - s0) - (bot.t - t0) * 60) < 1e-6, `帧数跟着傀儡的 dt 走：${bot._s.time - s0} vs ${(bot.t - t0) * 60}`);
  bot.animPlay = null;
  pass.push('跟随游戏时间');
}
const shot = (facing: number) => {
  bot.e.facing = facing; bot.ang = facing > 0 ? 0 : Math.PI; step(1);
  bot._s.no !== 0 && step(1);
  S.setAction(bot._s, 0); S.advance(bot._s, 1);   // 元素 0：左蓝右红
  const c = createCanvas(400, 400), x: any = c.getContext('2d');
  x.translate(200 - bot.x, 300 - bot.y);
  rt.cull = null;
  const n = S.draw2d(x, [bot]);
  const px = (X: number, Y: number) => Array.from(x.getImageData(X, Y, 1, 1).data) as number[];
  return { n, right: px(212, 250), left: px(188, 250) };
};
{
  const R1 = shot(1);
  assert.ok(R1.n >= 1);
  assert.ok(R1.right[0] > 200 && R1.right[2] < 50, '朝右：轴心右边是红的 ' + R1.right);
  assert.ok(R1.left[2] > 200 && R1.left[0] < 50, '朝右：轴心左边是蓝的 ' + R1.left);
  const R2 = shot(-1);
  assert.ok(R2.right[2] > 200 && R2.right[0] < 50, '朝左：翻过来，右边变蓝 ' + R2.right);
  const q = S.quadOf(S.drawables([bot])[0]);
  assert.equal(q.hx, -1); assert.ok(Math.abs(q.left + 25) < 1e-9 && Math.abs(q.right - 25) < 1e-9 && Math.abs(q.top + 100) < 1e-9, '朝左的画面矩形（世界单位）');
  pass.push('朝向翻转');
}

// 三、攻击框：一段只打一次（两段 → 两下）
{
  const P = g.player;
  bot.e.x = P.x - 50; bot.e.y = P.y; bot.e.facing = 1; bot.ang = 0; bot.enemy = { kind: 'player' };
  g.combat.invulnT = 0;
  const calls: string[] = [], dealt: number[] = [];
  const strike0 = rt.attack.strike;
  rt.attack.strike = (b: any, t: any, o: any, fx: number, fy: number) => { calls.push(t.kind === 'player' ? 'P' : String(t.e.id)); g.combat.invulnT = 0; const h0 = g.hero.hp; const r = strike0(b, t, o, fx, fy); dealt.push(h0 - g.hero.hp); return r; };
  const hp0 = g.hero.hp;
  bot.run(function* (b: any) { yield* b.playMove({ dur: 'anim', anim: 'm:200', track: 0, boxHit: { p: 0.01, F: 10, knock: 0 } }); }, '框打');
  step(45);
  rt.attack.strike = strike0;
  assert.deepEqual(calls, ['P', 'P'], '两段攻击框，各打主角一次：' + JSON.stringify(calls));
  // 开局主角站在城里（原版结算不让掉血），这里只断言走了框架的结算（strike）；伤害公式本身由 KLK 的测试覆盖
  void dealt;
  assert.equal(D.mugenBoxes(bot, 'c1').length, 0, '出完招回到待机，没有攻击框');
  // 离得太远（纵深）打不着
  calls.length = 0; rt.attack.strike = (b: any, t: any, o: any, fx: number, fy: number) => { calls.push('x'); return strike0(b, t, o, fx, fy); };
  bot.e.y = P.y + 300;
  bot.run(function* (b: any) { yield* b.playAction(200, { boxHit: { p: 0.01, F: 10 } }); }, '框打2');
  step(45);
  rt.attack.strike = strike0;
  assert.equal(calls.length, 0, '纵深外打不着');
  g.combat.invulnT = 1e9; g.hero.hp = hp0; bot.e.y = P.y;
  pass.push('攻击框命中');
}

// 四、特效：播完就撤；挂在弹道上，弹道没了就撤
{
  const h = D.explod({ bot, anim: 300, ox: 10, z: 50 });
  assert.ok(h && S.fx.includes(h), '放出特效');
  for (let i = 0; i < 6; i++) S.updateFx(1 / 60);
  assert.ok(!h.dead && h.s.el === 1, '6 帧后第二个元素');
  for (let i = 0; i < 7; i++) S.updateFx(1 / 60);
  assert.ok(h.dead && !S.fx.includes(h), '12 帧播完就撤');
  const keep = D.explod({ bot, anim: 300, removetime: 20 });
  for (let i = 0; i < 19; i++) S.updateFx(1 / 60);
  assert.ok(!keep.dead, 'removetime：20 帧前还在（动作循环）');
  for (let i = 0; i < 2; i++) S.updateFx(1 / 60);
  assert.ok(keep.dead, 'removetime 到了就撤');
  bot.e.y = g.player.y + 600; bot.ang = 0;   // 离主角远一点，免得弹道一出手就撞上
  bot.shoot({ mugen: 400, speed: 600, life: 0.3, r: 10, p: 0, F: 0, aim: false });
  const pr = rt.attack.projs[rt.attack.projs.length - 1];
  assert.ok(pr.spr && S.fx.includes(pr.spr), '弹道挂上贴图');
  const hp = pr.spr; step(4);
  const p0 = S.drawables([]).find((it: any) => it.fx === hp);
  assert.ok(p0 && Math.abs(p0.x - pr.x) < 1e-6, '贴图跟着弹道走');
  step(40);
  assert.ok(hp.dead && !S.fx.includes(hp), '弹道没了，贴图撤掉');
  pass.push('特效');
}
none('前四项');

// 五、没有立体画面：画进立板
{
  bot.e.facing = 1; step(2);
  const list: any[] = []; host.collect(list);
  assert.ok(list.length > 0, '有绘制项');
  const c = createCanvas(400, 400), x: any = c.getContext('2d');
  x.translate(200 - bot.x, 300 - bot.y);
  for (const it of list) it.draw(x);
  const p = Array.from(x.getImageData(200, 260, 1, 1).data) as number[];
  assert.ok(p[3] > 200, '立板里画出了贴图人物 ' + p);
  assert.ok(!S.active, '没有立体画面时场景里没有板');
  pass.push('2D 立板');
}

// 六、立体画面（替身：真的 three 场景 / 相机）
const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-500, 500, 500, -500, 1, 5000);
cam.position.set(0, 600, 800); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
const VIEW = { scene, camera: cam, heightAt: () => 7, boost: 1.2, noShadowLayer: 1 };
const with3d = (fn: () => void) => { const r0 = g.renderer; g.renderer = { ...(r0 ?? {}), hd: { modView: () => VIEW } }; try { fn(); } finally { g.renderer = r0; } };
const disposed = { tex: 0, mat: 0, geo: 0 };
{
  bot.e.facing = -1; bot.ang = Math.PI; step(2);
  S.setAction(bot._s, 0); S.advance(bot._s, 1);
  D.explod({ bot, anim: 300, ox: 20, z: 60 });
  with3d(() => { const list: any[] = []; host.collect(list); });
  const root = scene.children.find((o: any) => o.name === 'drgnext-sprites');
  assert.ok(root, '贴图板放进了游戏的场景');
  const vis = root.children.filter((m: any) => m.visible);
  assert.ok(vis.length >= 2, '人物一块、特效一块：' + vis.length);
  const man = vis.find((m: any) => m.material.uniforms.uMap.value?.image === d.imgs[0]);
  const u = man.material.uniforms.uUv.value;
  assert.ok(u.x > u.z, '朝左：UV 左右对调');
  assert.ok(Math.abs(u.x - 20 / 64) < 1e-6 && Math.abs(u.y) < 1e-6 && Math.abs(u.w - 40 / 64) < 1e-6, 'UV 对准图集里这一帧 ' + JSON.stringify(u));
  const e = man.matrix.elements;
  assert.ok(Math.abs(e[5] - 100 * 1.2) < 1e-6, '高 = 100 × boost');
  assert.ok(Math.abs(e[13] - 7) < 1e-6, '脚底在地面高度上');
  assert.ok(man.material.depthWrite && !man.material.transparent, '人物不透明、写深度（和 3D 模型一样遮挡）');
  assert.equal(man.layers.mask, 1 << 1, '不投影的层');
  const glow = vis.find((m: any) => m !== man);
  assert.ok(glow.material.transparent && !glow.material.depthWrite, '叠加的特效不写深度');
  assert.ok(Math.abs(glow.material.uniforms.uD.value - 1) < 1e-9, '叠加：底下的颜色全留');
  for (const m of root.children) { m.material.addEventListener('dispose', () => disposed.mat++); }
  root.children[0].geometry.addEventListener('dispose', () => disposed.geo++);
  for (const m of vis) m.material.uniforms.uMap.value.addEventListener('dispose', () => disposed.tex++);
  pass.push('立体画面');
}

// 七、世界里的 NPC 画成贴图人物
{
  const W = g.npcs, P = g.player;
  const dn = W.list.find((n: any) => n.alive !== false && !n.hidden && W.summon(n.id));
  assert.ok(dn, '有能叫来的 NPC');
  const a = W.activeOf(dn.id);
  D.npcModel(dn.id, 'sprtest_bb');
  assert.ok(BEAST_SPR['n:' + dn.id], '框架藏起原版小人（n: 换图）');
  a.st.x = P.x + 120; a.st.y = P.y + 40;
  const draw = (vx: number) => { a.st.vx = vx; a.st.vy = 0; const list: any[] = []; host.collect(list); return rt.npcPuppetMap().get(dn.id); };
  let p = draw(0);
  assert.ok(p?._s, 'NPC 木偶有贴图播放器'); assert.equal(p._s.no, 0, '站着：待机');
  p = draw(80); assert.equal(p._s.no, 20, '慢走：走'); assert.equal(p._s.facing, 1);
  p = draw(-300); assert.equal(p._s.no, 21, '快：跑'); assert.equal(p._s.facing, -1, '往左跑：朝左');
  const list: any[] = []; host.collect(list);
  const c = createCanvas(400, 400), x: any = c.getContext('2d');
  x.translate(200 - a.st.x, 300 - a.st.y);
  for (const it of list) it.draw(x);
  assert.ok((x.getImageData(200, 260, 1, 1).data[3]) > 200, 'NPC 画进了立板');
  with3d(() => { const l2: any[] = []; host.collect(l2); });
  const root = scene.children.find((o: any) => o.name === 'drgnext-sprites');
  assert.ok(root.children.filter((m: any) => m.visible).length >= 2, '立体画面里 NPC 也有一块板');
  pass.push('NPC 贴图');
}
none('前七项');

// 八、热卸载：板撤出场景，材质、几何、贴图都放掉
{
  const cl = (globalThis as any).__taixuModCleanup?.drgnext ?? (globalThis as any).__fanrenModCleanup?.drgnext;
  assert.ok(typeof cl === 'function');
  cl();
  assert.ok(!scene.children.some((o: any) => o.name === 'drgnext-sprites'), '场景里的贴图板撤掉了');
  assert.ok(disposed.mat >= 2 && disposed.geo === 1 && disposed.tex >= 2, '材质 / 几何 / 贴图都 dispose 了 ' + JSON.stringify(disposed));
  assert.equal(S.fx.length, 0, '特效清空');
  assert.ok(!(globalThis as any).DrGNext, '全局撤掉');
  pass.push('热卸载');
}

console.warn = ow; console.error = oe;
console.log('PASS drgnext 贴图人物：' + pass.join('、'));
process.exit(0);
