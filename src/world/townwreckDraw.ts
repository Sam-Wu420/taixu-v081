// 城里地面的破坏痕迹（world/townwreck.ts 的 TWMark）：石板碎裂的浅坑、一路碎开的石板沟、成圈的龟裂。
// 比野外的坑浅：没有翻出来的土，是一块块碎开、翘起、陷下去的石板，缝里发黑，边上几块碎石子。
// 画进地贴（render.ts 在城镇铺装之后推一个没有立板的绘制项），代码画、按变体缓存，一帧最多现画一张。修好之前一直在，快修好时淡掉。
import type { Game } from './game';
import type { TWMark } from './townwreck';
import { TW } from './townwreck';
import { makeCanvas } from '../core/canvas';
import { mulberry32 } from '../core/rng';
import { hash32 } from './brawlrng';
import { CharState, drawCharacter, randomLook, type Look } from '../gfx/character';
import { charBox } from '../hd2d/boxes';
import type { Drawable } from './life';

const TAU = Math.PI * 2;
const cache = new Map<string, HTMLCanvasElement | null>();
let genLeft = 1;
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement | null {
  if (cache.has(key)) return cache.get(key)!;
  if (genLeft <= 0) return null;
  genLeft--;
  let c: HTMLCanvasElement | null = null;
  try { c = make(); } catch { c = null; }
  cache.set(key, c);
  return c;
}
/** 碎石板：w × h 的画布，形状 shape(x, y) 给出这一点「碎了多少」0‥1（0 以外透明）。一块块石板（按最近的点分格），缝发黑，有的翘起有的陷下 */
function slabs(w: number, h: number, seed: number, cells: number, shape: (x: number, y: number) => number): HTMLCanvasElement {
  const cv = makeCanvas(w, h) as HTMLCanvasElement, g = cv.getContext('2d')!, img = g.createImageData(w, h), D = img.data;
  const rnd = mulberry32(seed);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < cells; i++) { let x = 0, y = 0; for (let k = 0; k < 20; k++) { x = rnd() * w; y = rnd() * h; if (shape(x, y) > 0.05) break; } pts.push([x, y, rnd()]); }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = shape(i, j), o = (j * w + i) * 4;
    if (s <= 0) { D[o + 3] = 0; continue; }
    let d1 = 1e9, d2 = 1e9, k1 = 0;
    for (let k = 0; k < pts.length; k++) { const dx = i - pts[k][0], dy = j - pts[k][1], d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; k1 = k; } else if (d < d2) d2 = d; }
    const gap = Math.sqrt(d2) - Math.sqrt(d1), t = pts[k1][2];
    if (gap < 1.6) { D[o] = 28; D[o + 1] = 22; D[o + 2] = 17; D[o + 3] = Math.min(255, 235 * Math.min(1, s * 1.6)); continue; }
    if (gap < 3) { D[o] = 200; D[o + 1] = 190; D[o + 2] = 170; D[o + 3] = 70 * s; continue; }   // 缝边一道亮（石板的断口）
    // 石板本身：翘起来的亮一点、陷下去的暗一点，越往中心越明显；铺装原来的颜色透出来（只叠一层明暗）
    const up = t > 0.62, dn = t < 0.3;
    const tone = up ? [222, 214, 196] : dn ? [40, 34, 28] : [90, 80, 66];
    D[o] = tone[0]; D[o + 1] = tone[1]; D[o + 2] = tone[2]; D[o + 3] = (up ? 70 : dn ? 120 : 40) * s;
  }
  g.putImageData(img, 0, 0);
  // 碎石子
  for (let k = 0; k < cells * 1.5; k++) {
    const x = rnd() * w, y = rnd() * h; if (shape(x, y) < 0.2) continue;
    const r = 1 + rnd() * 2.4;
    g.fillStyle = 'rgba(30,24,18,0.5)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.7, r, r * 0.7, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(168,160,146,0.95)'; g.beginPath(); g.ellipse(x, y, r, r * 0.7, rnd() * 3, 0, TAU); g.fill();
  }
  return cv;
}
/** 浅坑：画布半边 = 1.25 个半径 */
function pitSprite(v: number) {
  return cached('tp' + v, () => {
    const N = 200, R = N / 2 / 1.25, rnd = mulberry32(0x7a11 + v * 97);
    const amp = [0, 1, 2, 3].map(() => (rnd() - 0.5) * 0.16), ph = [0, 1, 2, 3].map(() => rnd() * TAU);
    const cv = slabs(N, N, 0x5ab + v * 131, 22, (x, y) => {
      const dx = x - N / 2, dy = y - N / 2, a = Math.atan2(dy, dx); let s = 1; for (let i = 0; i < 4; i++) s += amp[i] * Math.sin((i + 2) * a + ph[i]);
      const q = Math.hypot(dx, dy) / (R * s); return q < 1 ? 1 - q * q * 0.35 : 0;
    });
    // 往外的几道裂缝，中间压一层浅浅的暗（陷下去一点）
    const g = cv.getContext('2d')!;
    const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, R); grd.addColorStop(0, 'rgba(30,24,18,0.28)'); grd.addColorStop(1, 'rgba(30,24,18,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(N / 2, N / 2, R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(28,22,17,0.8)'; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) { let a = rnd() * TAU, d = R * 0.9; g.lineWidth = 1.2 + rnd(); g.beginPath(); g.moveTo(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d); for (let k = 0; k < 3; k++) { a += (rnd() - 0.5) * 0.5; d += R * (0.07 + rnd() * 0.06); g.lineTo(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d); } g.stroke(); }
    return cv;
  });
}
/** 龟裂：画布半边 = 1.05 个半径；只有放射的缝和两圈断续的环缝，石板没碎开 */
function crackSprite(v: number) {
  return cached('tc' + v, () => {
    const N = 256, R = N / 2 / 1.05, rnd = mulberry32(0xc7 + v * 71), cv = makeCanvas(N, N) as HTMLCanvasElement, g = cv.getContext('2d')!;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (pts: [number, number][], w: number) => { g.strokeStyle = 'rgba(205,195,175,0.3)'; g.lineWidth = w * 0.7; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x + 1.2, y + 1.3) : g.moveTo(x + 1.2, y + 1.3))); g.stroke(); g.strokeStyle = 'rgba(30,24,18,0.75)'; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    const n = 12 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) { let a = (i + rnd() * 0.6) / n * TAU, d = R * 0.08; const pts: [number, number][] = [[N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d]]; const end = R * (0.6 + rnd() * 0.4); while (d < end) { d += R * (0.08 + rnd() * 0.06); a += (rnd() - 0.5) * 0.3; pts.push([N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d]); } line(pts, 2 - d / R); }
    for (const rr of [0.38, 0.7]) { let a = rnd() * TAU; for (let s = 0; s < TAU * 0.7; ) { const seg = 0.3 + rnd() * 0.5, pts: [number, number][] = []; for (let u = 0; u <= 1; u += 0.25) { const q = R * rr * (1 + (rnd() - 0.5) * 0.06); pts.push([N / 2 + Math.cos(a + seg * u) * q, N / 2 + Math.sin(a + seg * u) * q]); } line(pts, 1.5); a += seg + 0.2 + rnd() * 0.4; s += seg + 0.3; } }
    return cv;
  });
}
/** 一路碎开的石板沟：画布长 384 × 宽 96，横着是沟的走向 */
function furrowSprite(v: number) {
  return cached('tf' + v, () => {
    const W = 384, H = 96, rnd = mulberry32(0xf3 + v * 53), w0 = (rnd() - 0.5) * 0.2;
    return slabs(W, H, 0x9f + v * 17, 34, (x, y) => {
      const u = x / W, env = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.06), half = H * 0.42 * (0.4 + 0.6 * env) * (1 + w0 * Math.sin(u * 9));
      const q = Math.abs(y - H / 2) / Math.max(1, half); return q < 1 ? 1 - q * q * 0.4 : 0;
    });
  });
}

/** render.ts：把主角所在那座城的地面痕迹画进地贴（ctx 是世界变换） */
export function drawTownMarks(g: CanvasRenderingContext2D, game: Game, left: number, top: number, right: number, bottom: number) {
  const T = game.combat.wreck.town, m = T.here(); if (!m) return;
  const st = T.state(m.l.id); if (!st || !st.m.length) return;
  genLeft = 1;
  const day = game.day;
  for (const mk of st.m) {
    const R = mk.k === 1 ? mk.r * 1.2 : mk.r * 1.3;
    const x0 = Math.min(mk.x, mk.x2 ?? mk.x) - R, x1 = Math.max(mk.x, mk.x2 ?? mk.x) + R, y0 = Math.min(mk.y, mk.y2 ?? mk.y) - R, y1 = Math.max(mk.y, mk.y2 ?? mk.y) + R;
    if (x1 < left || x0 > right || y1 < top || y0 > bottom) continue;
    // 快修好的最后一截慢慢淡掉；刚砸出来的那一下从小到大
    const left2 = (mk.f - day) / TW.DAY, a = Math.max(0, Math.min(1, left2 / 0.3)), age = (day - mk.d) / (TW.DAY / 240), grow = Math.min(1, 0.6 + age / 0.25 * 0.4);
    if (a <= 0.01) continue;
    g.globalAlpha = a;
    const v = mk.s & 3;
    if (mk.k === 0) { const cv = pitSprite(v); if (cv) { const r = mk.r * 1.25 * grow; g.drawImage(cv, mk.x - r, mk.y - r, r * 2, r * 2); } }
    else if (mk.k === 2) { const cv = crackSprite(v); if (cv) { const r = mk.r * 1.05 * grow; g.drawImage(cv, mk.x - r, mk.y - r, r * 2, r * 2); } }
    else {
      const cv = furrowSprite(v); if (!cv) continue;
      const L = Math.hypot(mk.x2! - mk.x, mk.y2! - mk.y), a0 = Math.atan2(mk.y2! - mk.y, mk.x2! - mk.x), W = mk.r * 1.2;
      g.save(); g.translate(mk.x, mk.y); g.rotate(a0); g.drawImage(cv, -W * 0.2, -W, L + W * 0.4, W * 2); g.restore();
    }
  }
  g.globalAlpha = 1;
}

// ================================================================ 修房子的工匠（只是画面）
// 搭着脚手架修的那几座房子（townwreck.scaffolding），门脸前站两三个穿短打、拿锤子的工匠，一下一下抡锤敲打；修好了（账上那一条没了）就散。
// 不进日结算、不进存档、不取 Math.random（外观按「城 + 这一件 + 第几个」的 hash32 定）；只画主角所在的那座城、画面附近的。
interface Worker { st: CharState; look: Look; x: number; y: number; fx: number; fy: number; per: number; ph: number; next: number }
const workers = new Map<string, Worker>();
let wClock = 0;
function makeWorker(loc: string, id: number, i: number, x: number, y: number, fx: number, fy: number): Worker {
  const h = hash32(id, i, loc.length, loc.charCodeAt(0) | 0, 0x6a7c), rnd = mulberry32(h);
  const look = randomLook(rnd, 'farmer');
  // 短打：短襟、窄袖、不戴斗笠不背篓；手里一把锤（重兵·锤形，最低一阶的熟铜锤）
  look.robeLen = 'short'; look.sleeve = 'narrow'; look.hat = 'none'; look.back = 'none'; look.hand = 'none';
  look.weapon = { kind: 'heavy', tier: 0, form: 'hammer' };
  // CharState 构造时取两个 Math.random（t、seed）：临时换成这一个人自己的序列（城镇破坏的路径上一个都不取）
  const r0 = Math.random; let st: CharState;
  Math.random = rnd; try { st = new CharState(x, y); } finally { Math.random = r0; }
  st.armed = true; st.faceToward(fx, fy, false); st.yaw = st.targetYaw;
  return { st, look, x, y, fx, fy, per: 1.05 + (h % 7) * 0.06, ph: ((h >>> 8) % 100) / 100, next: 0 };
}
/** render.ts：把主角所在那座城里正在修的房子前的工匠放进绘制列表 */
export function collectTownWorkers(game: Game, out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, dt: number) {
  const T = game.combat.wreck.town, m = T.here();
  const st = m ? T.state(m.l.id) : null;
  if (!m || !st || !st.e.length) { if (workers.size) workers.clear(); return; }
  wClock += dt;
  const live = new Set<string>();
  for (const e of st.e) {
    if (e.t <= 0 || !T.scaffolding(e)) continue;
    const t = m.byId.get(e.id); if (!t || t.k !== 'house') continue;
    if (t.x1 < view.left - 300 || t.x0 > view.right + 300 || t.y1 < view.top - 200 || t.y0 > view.bottom + 400) continue;
    // 门脸朝外的方向（门口点减房子中心）；沿门脸左右站开，面朝房子
    let nx = t.fx - t.x, ny = t.fy - t.y; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    if (nl < 1) { nx = 0; ny = 1; }
    const tx = -ny, ty = nx, wAlong = Math.abs(tx * (t.x1 - t.x0)) + Math.abs(ty * (t.y1 - t.y0));
    const fx = t.fx, fy = t.fy, n = e.t >= 2 ? 2 : 2 + (hash32(e.id, 0x3b) % 2);   // 半塌的门口有临时摊：只站两边
    const slots: [number, number][] = [[-0.34, 60], [0.34, 70], [0.05, 140]];
    for (let i = 0; i < n; i++) {
      const key = m.l.id + ':' + e.id + ':' + i; live.add(key);
      let w = workers.get(key);
      if (!w) {
        const [u, out0] = slots[i], x = fx + tx * u * Math.max(120, wAlong) + nx * out0, y = fy + ty * u * Math.max(120, wAlong) + ny * out0;
        w = makeWorker(m.l.id, e.id, i, x, y, -nx - tx * u * 0.4, -ny - ty * u * 0.4); workers.set(key, w);
      }
      const W = w, s = W.st;
      // 一下一下抡锤：每 per 秒从头抡一次（重兵·抡砸），两下之间站着歇口气
      const cyc = (wClock / W.per + W.ph) % 1;
      if (cyc < 0.72) { if (W.next <= wClock) { s.restart('heavyH'); W.next = wClock + W.per * 0.9; } } else if (s.action !== 'idle' && s.actionT > 0.85) s.setAction('idle');
      s.x = W.x; s.y = W.y; s.vx = s.vy = 0; s.speed = 0;
      s.update(dt);
      out.push({ y: W.y, k: 'D·工匠', hx: W.x, hy: W.y, hb: charBox(1, 30), draw: (ctx) => { ctx.save(); drawCharacter(ctx, W.look, s, 1, dt); ctx.restore(); } });
    }
  }
  for (const k of [...workers.keys()]) if (!live.has(k)) workers.delete(k);   // 修好了（或走远了）：散了
}
