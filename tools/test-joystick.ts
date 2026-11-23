// r15-touchctl：手机摇杆「拉到最边缘人物很慢」。
// 一、推力换算（ui/joystick.ts）：推多远给多大推力、方向连续、拉出圈外不衰减；
// 二、真实的 Game 无界面地跑：按不同推动距离写进 input.joy / joyMag，量每息走多远——推一半半速，推到推满半径、底盘外沿、圈外都一样快。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 844, innerHeight: 390, devicePixelRatio: 2.75, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { joyFromDrag, JOY_REACH, JOY_DEAD } = await import('../src/ui/joystick');
const near = (a: number, b: number, eps: number, msg: string) => assert.ok(Math.abs(a - b) <= eps, `${msg}：${a.toFixed(4)} ≠ ${b.toFixed(4)}`);

// ------------------------------------------------ 一、推力换算
// 横屏矮屏的摇杆底盘 108 CSS 像素（hud.css），推满半径 = 54 × 0.62
const R = 54, MAX = R * JOY_REACH;
{
  const at = (f: number, ang = 0.7) => joyFromDrag(Math.cos(ang) * f * MAX, Math.sin(ang) * f * MAX, MAX);
  assert.equal(at(0).mag, 0, '没推：0');
  assert.equal(at(JOY_DEAD * 0.9).mag, 0, '死区里：0');
  assert.equal(Math.hypot(at(JOY_DEAD * 0.9).x, at(JOY_DEAD * 0.9).y), 0, '死区里不动');
  for (const f of [0.2, 0.25, 0.5, 0.75, 0.9]) {
    const j = at(f);
    near(j.mag, f, 1e-9, `推 ${f}：推力`);
    near(Math.hypot(j.x, j.y), f, 1e-9, `推 ${f}：向量长度 = 推力`);
  }
  // 推满、推到底盘外沿（推满半径的 1/0.62）、手指滑出圈外两倍、五倍：一律满速
  for (const f of [1, 1 / JOY_REACH, 2, 5]) {
    const j = at(f);
    near(j.mag, 1, 1e-9, `推 ${f.toFixed(2)} 倍：推力`);
    near(Math.hypot(j.x, j.y), 1, 1e-9, `推 ${f.toFixed(2)} 倍：向量长度（以前这里是 ${(1 / f).toFixed(2)}）`);
    assert.ok(Math.hypot(j.kx, j.ky) <= MAX + 1e-9, '摇杆头不出推满半径');
  }
  // 方向连续：转一圈，向量的角度跟着手指走、长度不变（圈里圈外都一样）
  for (const f of [0.5, 1, 3]) for (let i = 0; i < 72; i++) {
    const a = -Math.PI + (i + 0.5) * (Math.PI * 2 / 72), j = at(f, a);
    near(Math.atan2(j.y, j.x), a, 1e-9, `推 ${f}、${(a * 180 / Math.PI).toFixed(0)}°：方向`);
    near(Math.hypot(j.x, j.y), Math.min(1, f), 1e-9, `推 ${f}、${(a * 180 / Math.PI).toFixed(0)}°：长度`);
  }
  // 单位无关：CSS 像素和设备像素（×2.75）算出来一样
  { const a = joyFromDrag(30, -12, MAX), b = joyFromDrag(30 * 2.75, -12 * 2.75, MAX * 2.75); near(a.x, b.x, 1e-12, '换单位 x'); near(a.y, b.y, 1e-12, '换单位 y'); }
  // 旧算法（夹过的 dx ÷ 没夹的距离）在底盘外沿只剩 0.62：记一笔，免得改回去
  const old = (f: number) => { const d = f * MAX, cd = Math.min(d, MAX); return (cd / Math.max(d, 1)) * Math.min(1, d / MAX); };
  assert.ok(old(1 / JOY_REACH) < 0.63 && old(3) < 0.34, '旧算法拉到边缘确实变慢（对照）');
  console.log('推力换算：通过');
}

// ------------------------------------------------ 二、真实速度
const G = await import('../src/world/game');
const g = await G.createGame(() => {});
g.reset();
g.hero.realm = 3; g.hero.stage = 0;
const p = g.player, c = g.combat as any, h = g.hero;
const B = g.bounds, X0 = (B.x0 + B.x1) / 2, Y0 = (B.y0 + B.y1) / 2;
/** 推 f 倍推满半径（朝右偏下一点），飞着跑 1.2 息，量后 0.8 息的平均速度（前面起步、遁光点火不算） */
function speedAt(f: number): number {
  const j = joyFromDrag(Math.cos(0.3) * f * MAX, Math.sin(0.3) * f * MAX, MAX);
  p.x = X0; p.y = Y0; p.flying = true; p.z = p.zTarget = 60; p.boosting = false; g.destination = null;
  let x1 = 0, y1 = 0;
  for (let t = 0, i = 0; i < 24; i++, t += 0.05) {
    if (g.modal) g.closeModal(true);
    g.paused = false; c.enemies.length = 0; c.spawnT = 9; c.invulnT = 9; h.hp = 1; h.mp = 1;
    g.input.joy.x = j.x; g.input.joy.y = j.y; g.input.joyMag = j.mag;
    g.update(0.05);
    if (i === 7) { x1 = p.x; y1 = p.y; }
  }
  const v = Math.hypot(p.x - x1, p.y - y1) / 0.8;
  g.input.joy.x = g.input.joy.y = g.input.joyMag = 0;
  return v;
}
for (let i = 0; i < 10; i++) g.update(0.05);
const v: Record<string, number> = {};
for (const f of [0.25, 0.5, 0.75, 0.85, 1, 1 / JOY_REACH, 2, 4]) v[f.toFixed(2)] = speedAt(f);
console.log('推动距离（推满半径的倍数）→ 速度：', Object.entries(v).map(([k, s]) => `${k}→${s.toFixed(0)}`).join('  '));
const s = (f: number) => v[f.toFixed(2)];
assert.ok(s(0.25) > 0, '推一点就动');
near(s(0.5) / s(0.25), 2, 0.06, '推一半是推四分之一的两倍快');
near(s(0.75) / s(0.5), 1.5, 0.05, '推四分之三是推一半的 1.5 倍');
near(s(0.85) / s(0.5), 1.7, 0.06, '线性到疾行线之前');
// 推满（> 0.86 自动疾行 / 遁光加速）：边缘和圈外一样快，而且不比「推一半 × 2」慢
for (const f of [1 / JOY_REACH, 2, 4]) near(s(f) / s(1), 1, 0.03, `推 ${f.toFixed(2)} 倍和推满一样快`);
assert.ok(s(1) >= s(0.5) * 2 * 0.98, `推满至少是推一半的两倍：${s(1).toFixed(0)} vs ${s(0.5).toFixed(0)}`);
console.log('真实速度：通过');
console.log('test-joystick 全部通过');
process.exit(0);
