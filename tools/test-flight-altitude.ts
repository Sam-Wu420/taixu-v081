// 御剑巡航高度：飞过起伏的地形，画面上的高度（地面高度 + st.lift × boost）应当平稳——
// 小起伏不跟着颠，大山平滑越过（永不低于「脚下地面 + p.z」），落地后回到地面。用真实的 Game 无界面地跑。
// 运行：node node_modules/tsx/dist/cli.mjs tools/test-flight-altitude.ts
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const G = await import('../src/world/game');
const g = await G.createGame(() => {});
g.reset();
const x0 = g.player.x, y0 = g.player.y;
g.hero.realm = 3; g.hero.stage = 0;
const p = g.player, c = g.combat as any, T = g.terrain;
const BOOST = Math.SQRT2;   // 无界面时 cruiseTick 按 45° 俯角的 boost 换算
const step = (seconds: number, each?: () => void) => { for (let t = 0; t < seconds; t += 1 / 30) { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 9; c.enemies.length = 0; c.projs.length = 0; c.lock = null; g.hero.hp = g.hero.maxHp ?? g.hero.hp; each?.(); g.update(1 / 30); } };
/** 一串高度的「颠簸量」：二阶差分绝对值之和（只看起伏，不看整体爬升） */
const rough = (a: number[]) => { let s = 0; for (let i = 2; i < a.length; i++) s += Math.abs(a[i] - 2 * a[i - 1] + a[i - 2]); return s; };
const B = g.bounds;
const inB = (x: number, y: number) => x > B.x0 + 200 && x < B.x1 - 200 && y > B.y0 + 200 && y < B.y1 - 200;

// 在地图上找一段起伏最大的 5000 长的直线航线（陆地上，地形颠簸量最大）
let best: { x: number; y: number; dx: number; dy: number; r: number; span: number } | null = null;
for (let i = 0; i < 400; i++) {
  const x = B.x0 + (B.x1 - B.x0) * ((i * 0.618034) % 1), y = B.y0 + (B.y1 - B.y0) * ((i * 0.414214 + 0.13) % 1), a = i * 2.39996;
  const dx = Math.cos(a), dy = Math.sin(a);
  if (!inB(x, y) || !inB(x + dx * 5000, y + dy * 5000)) continue;
  const hs: number[] = []; for (let s = 0; s <= 5000; s += 20) hs.push(T.surfaceHeight(x + dx * s, y + dy * s));
  const r = rough(hs), span = Math.max(...hs) - Math.min(...hs);
  if (!best || r > best.r) best = { x, y, dx, dy, r, span };
}
assert.ok(best && best.r > 50, '地图上找得到有起伏的航线');
console.log('航线', { x: Math.round(best!.x), y: Math.round(best!.y), 地形颠簸量: Math.round(best!.r), 高差: Math.round(best!.span) });

// 起飞、飞过整条航线，逐帧记录：脚下地面、旧画法的高度（地面 + p.z）、现在画面上的高度（地面 + st.lift）
g.teleport(best!.x, best!.y); step(0.5);
g.toggleFly(); step(1.5);
assert.ok(p.flying, '起飞');
const ground: number[] = [], old: number[] = [], drawn: number[] = [];
const ex = best!.x + best!.dx * 5000, ey = best!.y + best!.dy * 5000;
let minGap = Infinity, frames = 0;
step(60, () => {
  if (Math.hypot(p.x - ex, p.y - ey) < 60) return;
  g.destination = { x: ex, y: ey };
  const g0 = T.surfaceHeight(p.x, p.y);
  ground.push(g0); old.push(g0 + p.z * BOOST); drawn.push(g0 + p.st.lift * BOOST);
  minGap = Math.min(minGap, p.st.lift - p.z);   // 画面抬升永不低于原来的 p.z（不钻山）
  frames++;
});
assert.ok(Math.hypot(p.x - ex, p.y - ey) < 200, `飞到了航线尽头（还差 ${Math.round(Math.hypot(p.x - ex, p.y - ey))}）`);
const rOld = rough(old), rNew = rough(drawn);
console.log({ 帧数: frames, 旧画法颠簸量: Math.round(rOld), 现在颠簸量: Math.round(rNew), 比例: +(rNew / rOld).toFixed(3), 最大额外抬升: Math.round(Math.max(...drawn.map((d, i) => d - old[i]))) });
assert.ok(minGap > -0.01, `画面高度不低于 地面 + p.z（${minGap}）`);
assert.ok(rNew < rOld * 0.4, `飞过起伏地形，画面高度的颠簸明显小于地形（${rNew.toFixed(0)} / ${rOld.toFixed(0)}）`);
// 逐帧画面高度的变化率也平缓：最大单帧跳变小于旧画法
const jump = (a: number[]) => Math.max(...a.slice(1).map((v, i) => Math.abs(v - a[i])));
console.log({ 旧最大单帧跳变: +jump(old).toFixed(1), 现在: +jump(drawn).toFixed(1) });
assert.ok(jump(drawn) <= jump(old) + 0.5, '单帧跳变不比旧画法大');

// 大山：航线上找最高点，画面高度在最高点附近也在山顶之上
const top = ground.indexOf(Math.max(...ground));
assert.ok(drawn[top] >= ground[top] + p.z * BOOST - 0.5, '越过最高处时仍在山顶之上');

// 悬停：停下来不动，巡航基准慢慢落回脚下（额外抬升收回到 0 附近）
step(6);
assert.ok(Math.abs(p.st.lift - p.z) < 3, `悬停后额外抬升收回：${(p.st.lift - p.z).toFixed(2)}`);

// 落地：飞回开局的落脚处（城里，平地）落下遁光，画面回到地面
g.teleport(x0, y0); step(1);
assert.ok(Math.abs(p.st.lift - p.z) < 0.5, '瞬移后巡航基准从新落脚处重算，不带着上一处的抬升');
g.toggleFly(); step(1.5);
assert.ok(!p.flying && p.z === 0 && p.st.lift === 0 && g.cruiseLift === 0, `落地归零（lift ${p.st.lift}）`);

// 落地途中不跳：在山坡上空高处落下遁光，画面高度逐帧平滑下降
{
  g.teleport(best!.x, best!.y); step(0.3); g.toggleFly(); step(1.5);
  // 沿航线飞，等到巡航基准明显高于脚下、而脚下又能落脚时，直接落下遁光
  let landed = false, lift0 = 0;
  const seq: number[] = [];
  step(8, () => {
    if (landed) { if (seq.length < 45) seq.push(T.surfaceHeight(p.x, p.y) + p.st.lift * BOOST); return; }
    g.destination = { x: ex, y: ey };
    if (g.cruiseLift > 60 && T.walkFactor(p.x, p.y) > 0 && T.surface.sample(p.x, p.y).walkable) { lift0 = g.cruiseLift; g.destination = null; g.toggleFly(); landed = !p.flying; }
  });
  assert.ok(landed, '航线上找到了巡航抬升较高、又能落脚的地方');
  const j = jump(seq);
  console.log({ 落地最大单帧跳变: +j.toFixed(1), 帧数: seq.length, 起: Math.round(seq[0]), 止: Math.round(seq[seq.length - 1]), 落下时抬升: Math.round(lift0) });
  const drop = seq[0] - seq[seq.length - 1];
  assert.ok(drop > 100 && j <= drop * 0.2, `落下遁光时画面高度从巡航高度平滑落回地面（落差 ${drop.toFixed(0)}，单帧最大 ${j.toFixed(0)}；原先落地单帧要掉两成）`);
  assert.ok(!p.flying && p.st.lift === 0, '落稳');
}
console.log('test-flight-altitude OK');
