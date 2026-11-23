// P10：占山的宗门。整座山（或平地上堆起的小山）层层台地，按每层台地的用处（role）往上摆殿阁、院落、标志物。
// 返回 true 表示这座宗门由这里排好了（坐标、尺寸都是最终值，layoutLocation 不再整体放大）；返回 false 走老布局。
// 山体本身（台地、陡坎、石阶的坡）由地表按同一份规划整出来（data/sectPlan.ts → world/surface.ts），这里只往台地上摆东西。
// 坐标：规划是世界单位（相对地点中心），存进布局时除以 LOC_SCALE；s 开头的立体构件 p 里的长度仍是世界单位（见 hd2d/sectPieces.ts）。
import type { LocDef } from '../data/world';
import type { LocLayout } from './building';
import type { Env } from './townLayout';
import { grandSectPlan, rectDist, onPlanStair, terraceOutline, riseOf, planRise, type GrandSectPlan, type SectTerrace } from '../data/sectPlan';
import { mulberry32 } from '../core/rng';
import { SECT_STYLE } from './building';

const LS = 1.5;   // = LOC_SCALE（避免循环引用）
/** 屋顶按尊卑：祖师殿金黄琉璃、正殿青碧琉璃、诸堂深青灰、配殿与钟鼓楼灰绿、弟子院落灰褐；魔道一律压暗 */
const ROOF_LIGHT = { top: '#977a3c', main: '#2a4452', hall: '#3a4650', side: '#4e5a50', yard: '#5c5a50', yard2: '#545a52' };
const ROOF_DEMON = { top: '#5a2a2a', main: '#2a1c26', hall: '#2a2228', side: '#34282c', yard: '#3a3434', yard2: '#342e30' };

export function layoutGrandSect(loc: LocDef, L: LocLayout, _env: Env): boolean {
  const plan = grandSectPlan(loc);
  if (!plan) return false;
  buildSect(loc, L, plan);
  return true;
}

function buildSect(loc: LocDef, L: LocLayout, P: GrandSectPlan) {
  let seed = 0;
  for (let i = 0; i < loc.id.length; i++) seed = Math.imul(seed ^ loc.id.charCodeAt(i), 16777619) >>> 0;
  const rnd = mulberry32(seed ^ 0x5ec7);
  let sid = 0;
  const pal = L.pal, look = P.look, demon = !!look.demon, feat = look.feature ?? '', small = look.variant === 'small';
  const ROOF = demon ? ROOF_DEMON : ROOF_LIGHT;
  /** 窗光、灯火的颜色：魔道偏青红 */
  const WIN = demon ? '#e07a6a' : '#f2d79a', LC: [number, number, number] | undefined = demon ? [0.9, 0.35, 0.3] : undefined, LC2: [number, number, number] | undefined = demon ? [0.4, 0.8, 0.8] : undefined;
  const sp = (k: number) => look.trees[Math.floor(k * look.trees.length) % look.trees.length];
  /** 放一件：x, y 是世界单位（本地），p 原样存（s 构件里的长度也是世界单位） */
  const add = (kind: string, x: number, y: number, p: Record<string, any> = {}) => { L.pieces.push({ kind, x: x / LS, y: y / LS, seed: seed + ++sid * 7919, p }); };
  const block = (x: number, yFront: number, w: number, d: number) => L.blocks.push({ x: (x - w / 2) / LS, y: (yFront - d) / LS, w: w / LS, h: d / LS });
  const light = (x: number, y: number, r: number, h?: number, c?: [number, number, number]) => L.lights.push({ x: x / LS, y: y / LS, r: r / LS, h, c: c ?? LC });
  /** 殿：位置是正面中点；hang：往哪边（-1 西、1 东）半悬出台沿，下面木柱托着 */
  const hall = (x: number, yFront: number, w: number, d: number, h: number, o: Record<string, any> = {}) => {
    add('sHall', x, yFront, { w, d, h, roof: o.roof ?? d * 0.46, tiers: o.tiers ?? 1, base: o.base ?? Math.max(14, h * 0.16), gable: o.gable, lit: o.lit ?? true, pal: o.pal, on: o.on, win: WIN, glaze: o.glaze, stilts: o.stilts });
    block(x, yFront + 20, w * 1.1, d * 1.1);
    const wh = (o.base ?? Math.max(14, h * 0.16)) + h * 0.55;
    if (!o.on) { light(x - w * 0.25, yFront + 6, Math.min(120, w * 0.12), wh); light(x + w * 0.25, yFront + 6, Math.min(120, w * 0.12), wh); }
  };
  const lampPair = (x: number, y: number, gap: number) => {
    // 灯落在哪层台上就挪进那层台面（台沿圆角、石阶口附近会挪一挪，挪不进就不立）
    for (const s of [-1, 1]) {
      const t = P.terraces.find((q) => rectDist(q, x + s * gap, y) < 60), p = t ? nudge(t, x + s * gap, y, -40, 40, -40, 40) : null;
      if (!p) continue;
      add('sLamp', p[0], p[1], { s: 1.2, glow: demon ? '#9fe0d8' : undefined }); light(p[0], p[1], 60, 90, LC2);
    }
  };
  const flag = (x: number, y: number) => L.flags.push({ x: x / LS, y: y / LS, color: pal.accent });
  const tree = (x: number, y: number, s: number, kind?: string) => add('tree', x, y, { sp: kind ?? sp(rnd()), s });
  /** 台面南沿（正面）在 x 处的位置 */
  const front = (t: SectTerrace, x = t.x) => { let d = 0; while (d < 4000 && rectDist(t, x, t.y + d) < 0) d += 10; return t.y + d; };
  const back = (t: SectTerrace) => t.y - t.h / 2;
  const fits = (t: SectTerrace, x: number, y: number, hw: number, hd: number) => [[x - hw, y - hd], [x + hw, y - hd], [x - hw, y + hd], [x + hw, y + hd]].every(([qx, qy]) => rectDist(t, qx, qy) < -70 && !onPlanStair(P, qx, qy, 140));
  /** 往台面中心挪，直到占地（相对 (x, y) 的 x0..x1、y0..y1）整块落在台面里 */
  const nudge = (t: SectTerrace, x: number, y: number, x0: number, x1: number, y0: number, y1: number): [number, number] | null => {
    // 石阶两头各留一块 240 深、和石阶一样宽的落脚处（踏上石阶前、下了石阶后那一截不被殿阁堵住，人不用贴着殿后墙挤上石阶）。
    // 落脚处只拿殿身（占地左右收一成，台基、踏步可以挨着）去比
    const onStair = (qx: number, qy: number) => P.stairs.some((s) => { const d = (s.x2 - s.x1) ** 2 + (s.y2 - s.y1) ** 2, u = Math.max(0, Math.min(1, ((qx - s.x1) * (s.x2 - s.x1) + (qy - s.y1) * (s.y2 - s.y1)) / d)); return Math.hypot(qx - s.x1 - (s.x2 - s.x1) * u, qy - s.y1 - (s.y2 - s.y1) * u) < s.w / 2 + 100; });
    const onLanding = (qx: number, qy: number) => P.stairs.some((s) => { const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L, a = (qx - s.x1) * ux + (qy - s.y1) * uy, side = Math.abs((qx - s.x1) * uy - (qy - s.y1) * ux); return side < s.w / 2 + 20 && ((a < 0 && a > -240) || (a > L && a < L + 240)); });
    // 也不压在已经摆下的殿阁上（亭、塔挪进台面时会往台心挪，别挪进旁边的殿里）
    const taken = (qx: number, qy: number) => L.blocks.some((b) => qx / LS > b.x - 8 && qx / LS < b.x + b.w + 8 && qy / LS > b.y - 8 && qy / LS < b.y + b.h + 8);
    const ok = (qx: number, qy: number) => rectDist(t, qx, qy) < -80 && !onPlanStair(P, qx, qy, 140) && !onStair(qx, qy) && !taken(qx, qy);
    const grid: [number, number][] = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) grid.push([x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * j / 2]);
    const core: [number, number][] = grid.map(([dx, dy]) => [dx * 0.88, dy]);
    const fine = (x: number, y: number) => grid.every(([dx, dy]) => ok(x + dx, y + dy)) && core.every(([dx, dy]) => !onLanding(x + dx, y + dy));
    const x00 = x, y00 = y;
    for (let k = 0; k < 30; k++) {
      if (fine(x, y)) return [x, y];
      const dx = t.x - x, dy = t.y - y, l = Math.hypot(dx, dy) || 1; if (l < 40) break; x += dx / l * 40; y += dy / l * 40;
    }
    // 往台心挪不开（比如殿正好卡在前后两处石阶口之间）：在原位附近前后左右找一处
    const tries: [number, number][] = []; for (let i = -4; i <= 4; i++) for (let j = -10; j <= 10; j++) tries.push([i * 100, j * 80]);
    tries.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [dx, dy] of tries) if (fine(x00 + dx, y00 + dy)) return [x00 + dx, y00 + dy];
    return null;
  };
  /** 殿：自己挪进台面（台基比殿身宽出一圈、正面有踏步），挪不进就不摆 */
  const hallIn = (t: SectTerrace, x: number, yFront: number, w: number, d: number, h: number, o: Record<string, any> = {}) => {
    const q = nudge(t, x, yFront, -w * 0.62, w * 0.62, -d * 1.12, 60); if (q) hall(q[0], q[1], w, d, h, o); return q;
  };
  /** 亭：自己挪进台面，挪不进就不摆 */
  const pavilion = (t: SectTerrace, x: number, y: number, w: number, h: number, o: Record<string, any> = {}) => { const q = nudge(t, x, y, -w * 0.63, w * 0.63, -w * 1.13, w * 0.13); if (q) add('sPavilion', q[0], q[1], { w, h, ...o }); };

  // —— 石阶
  for (const s of P.stairs) add('sStair', s.x1, s.y1, { x2: s.x2, y2: s.y2, w: s.w });

  // —— 台沿：顺着台面轮廓一圈石栏，台下两级毛石墙（sWall 自己看外面低不低，不低的不砌）。
  //    石阶、石梁、铁索桥落脚处，和紧挨着别的台的地方留口；每十来段并成一件，免得构件数失控
  for (const t of P.terraces) if (!t.causeway && t.role !== 'lake') edge(t);
  function edge(t: SectTerrace) {
    const ol = terraceOutline(t, 110);
    const open = (x: number, y: number, nx: number, ny: number) => {
      const ox = x + nx * 70, oy = y + ny * 70;
      if (onPlanStair(P, ox, oy, 50) || onPlanStair(P, x - nx * 30, y - ny * 30, 50)) return true;
      for (const b of P.bridges) for (const [bx, by] of [[b.x1, b.y1], [b.x2, b.y2]]) if (Math.hypot(x - bx, y - by) < b.w / 2 + 60) return true;
      for (const o of P.terraces) if (o !== t && o.role !== 'lake' && rectDist(o, x + nx * 120, y + ny * 120) < 0 && Math.abs(o.rise - t.rise) < 40) return true;
      return false;
    };
    let run: number[] = [];
    const flush = () => { if (run.length >= 8) add('sWall', run[0], run[1], { pts: run, perch: !!t.perch || t.role === 'perch', moss: demon ? '#4a4a46' : undefined, cut: !P.mountain }); run = []; };
    for (let i = 0; i <= ol.length; i++) {
      const [x, y, nx, ny] = ol[i % ol.length];
      if (open(x, y, nx, ny)) { flush(); continue; }
      run.push(x, y, nx, ny);
      if (run.length >= 48) { flush(); run.push(x, y, nx, ny); }
    }
    flush();
  }

  // —— 长阶两侧：每隔一段一对石灯（立在垂带上）
  for (const s of P.stairs) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1); if (len < 300) continue;
    const ux = (s.x2 - s.x1) / len, uy = (s.y2 - s.y1) / len;
    for (let d = 140; d < len - 100; d += 300) {
      const cx = s.x1 + ux * d, cy = s.y1 + uy * d;
      for (const k of [-1, 1]) {
        const lx = cx - uy * k * (s.w / 2 + 2), ly = cy + ux * k * (s.w / 2 + 2);
        add('sLamp', lx, ly, { s: 0.9, on: { x: cx, y: cy, dz: 26 }, glow: demon ? '#9fe0d8' : undefined }); light(lx, ly, 52, 100, LC2);
      }
    }
  }

  // —— 山脚的山门：引道起头处一座石牌坊、一对石狮；长阶中途的歇脚台上牌坊、山亭
  {
    const f = P.gateOut;
    add('sGate', f.x, f.y + 40, { w: small ? 420 : 640, h: small ? 280 : 380, stone: true });
    add('sLion', f.x - (small ? 180 : 260), f.y - 20, { s: small ? 1.1 : 1.5 }); add('sLion', f.x + (small ? 180 : 260), f.y - 20, { s: small ? 1.1 : 1.5, flip: true });
    flag(f.x - 380, f.y + 60); flag(f.x + 380, f.y + 60);
    if (feat === 'demon') for (const s of [-1, 1]) add('sObelisk', f.x + s * 520, f.y - 60, { h: 420, glow: '#c03030' });
  }

  // —— 每层台地按用处摆
  for (const t of P.terraces) {
    const fy = front(t), W = t.w, D = t.h;
    switch (t.role) {
      case 'landing': {
        if (W < 900) {
          add('sGate', t.x, fy - 60, { w: 420, h: 300, pal: { roof: ROOF.side } });
          tree(t.x - 200, t.y - 40, 1.1, 'pine');
        }
        break;
      }
      case 'gate': {
        add('sGate', t.x, fy + 30 - (t.bulge ?? 0) * 0, { w: Math.min(560, W * 0.4), h: 330, stone: true });
        add('sLion', t.x - 190, fy - 70, { s: 1.3 }); add('sLion', t.x + 190, fy - 70, { s: 1.3, flip: true });
        lampPair(t.x, t.y + D * 0.1, Math.min(330, W * 0.25)); lampPair(t.x, t.y - D * 0.3, Math.min(330, W * 0.25));
        if (W > 1300) {
          add('sStele', t.x - W * 0.3, t.y + 40, { s: 1.4 }); add('sStele', t.x + W * 0.3, t.y + 40, { s: 1.4 });
          pavilion(t, t.x - W * 0.37, t.y - D * 0.1, 200, 300, { pal: { roof: ROOF.side } }); pavilion(t, t.x + W * 0.37, t.y - D * 0.1, 200, 300, { pal: { roof: ROOF.side } });
          tree(t.x - W * 0.2, t.y - D * 0.33, 1.4, 'pine'); tree(t.x + W * 0.21, t.y - D * 0.3, 1.3);
        }
        flag(t.x - 300, fy - 20); flag(t.x + 300, fy - 20);
        if (feat === 'fort') for (const s of [-1, 1]) { add('sPagoda', t.x + s * (W / 2 - 180), fy - 200, { w: 220, h: 420, tiers: 2, pal: { roof: ROOF.side, wall: '#a49c8a' } }); block(t.x + s * (W / 2 - 180), fy - 120, 280, 280); }
        break;
      }
      case 'axis': {
        add('sCenser', t.x, t.y + D * 0.16, { s: 1.2 }); light(t.x, t.y + D * 0.16, 120);
        add('sStele', t.x - 330, t.y + D * 0.27, { s: 1.1 }); add('sStele', t.x + 330, t.y + D * 0.27, { s: 1.1 });
        add('sGate', t.x, back(t) + 380, { w: 460, h: 300, pal: { roof: ROOF.side } });
        tree(t.x - W * 0.3, t.y - D * 0.06, 1.3); tree(t.x + W * 0.3, t.y + D * 0.03, 1.3, 'pine');
        flag(t.x - 260, fy - 100); flag(t.x + 260, fy - 100);
        if (feat === 'demon') for (let k = 0; k < 4; k++) for (const s of [-1, 1]) add('sObelisk', t.x + s * W * 0.38, t.y + D * 0.4 - k * D * 0.25, { h: 260, glow: '#c03030' });
        break;
      }
      case 'drill': {
        const sw = Math.min(2300, W - 900), sd = Math.min(1250, D - 600), ay = t.y + D * 0.1;
        if (sw > 600 && sd > 400) {
          add('sSlab', t.x, ay, { w: sw, d: sd, color: demon ? '#8a7a6a' : '#b9a984' });
          const n = Math.max(2, Math.round(sw / 380));
          for (let k = 0; k < n; k++) add('sPost', t.x - sw * 0.35 + k * sw * 0.7 / (n - 1), ay - sd * 0.36, {});
          for (let k = 0; k < Math.max(2, n - 2); k++) add('sPost', t.x - sw * 0.39 + k * sw * 0.78 / Math.max(1, n - 3), ay + sd * 0.4, { rack: true });
        }
        if (D > 1600) { add('sGate', t.x, back(t) + 640, { w: 460, h: 300, pal: { roof: ROOF.side } }); lampPair(t.x, back(t) + 760, 300); }
        lampPair(t.x, ay + sd / 2 + 130, 300);
        if (P.falls.some((f) => f.dy > 0 && Math.abs(f.y - back(t)) < 700 && Math.abs(f.x - t.x) < W / 2)) { const f = P.falls.find((q) => q.dy > 0 && Math.abs(q.y - back(t)) < 700 && Math.abs(q.x - t.x) < W / 2)!; add('sPool', f.x, back(t) + 320, { w: 480, d: 280, blood: feat === 'demon' }); }
        tree(t.x + W * 0.36, back(t) + 330, 1.5, 'pine'); tree(t.x - W * 0.42, fy - 200, 1.3); tree(t.x + W * 0.42, fy - 160, 1.3);
        flag(t.x - sw * 0.5, ay - sd * 0.5 - 50); flag(t.x + sw * 0.5, ay - sd * 0.5 - 50);
        if (feat === 'demon') add('sPool', t.x + W * 0.33, t.y - D * 0.25, { w: 360, d: 220, blood: true });
        break;
      }
      case 'bell': {
        // 钟楼 / 鼓楼与传功殿
        add('sPagoda', t.x, t.y - D * 0.15, { w: 300, h: 640, tiers: 2, pal: { roof: ROOF.side } }); block(t.x, t.y - D * 0.15 + 60, 380, 380);
        if (D > 1500) hallIn(t, t.x, t.y + D * 0.32, Math.min(760, W - 400), 360, 190, { pal: { roof: ROOF.side } });
        tree(t.x - Math.sign(t.x) * W * 0.27, t.y + 100, 1.1);
        break;
      }
      case 'mid': {
        const hw = Math.min(760, W * 0.24);
        const sd = Math.min(360, D * 0.3);
        hallIn(t, t.x - W * 0.29, fy - 180, hw, sd, 210, { pal: { roof: ROOF.side } });
        hallIn(t, t.x + W * 0.29, fy - 180, hw, sd, 210, { pal: { roof: ROOF.side } });
        L.smoke.push({ x: (t.x - W * 0.33) / LS, y: (fy - 620) / LS }, { x: (t.x - W * 0.25) / LS, y: (fy - 600) / LS });
        hallIn(t, t.x, back(t) + Math.min(460, D * 0.35) + 160, Math.min(1000, W * 0.3), Math.min(460, D * 0.35), 250, { pal: { roof: ROOF.hall }, base: 50 });   // 传法堂
        add('sCenser', t.x, t.y + D * 0.2, { s: 1.3 }); light(t.x, t.y + D * 0.2, 140);
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) add('sStele', t.x + s * (380 + k * 170), t.y + 160 - D * 0.02, { s: 1 });
        lampPair(t.x, fy - 150, 300);
        tree(t.x - W * 0.38, back(t) + 350, 1.6, 'pine'); tree(t.x + W * 0.4, back(t) + 250, 1.4);
        break;
      }
      case 'library': {
        // 藏经阁：多层楼阁，往外一侧半悬出台沿，木柱斜撑落到下面的山坡上
        const side = t.x < 0 ? -1 : 1, px = t.x + side * (W / 2 - 120), py = t.y - 120;
        add('sPagoda', px, py, { w: 460, h: small ? 900 : 1600, tiers: small ? 4 : 7, stilts: true, on: { x: t.x - side * 200, y: t.y, dz: 0 }, pal: { roof: ROOF.hall } });
        block(px, py + 80, 560, 560); light(px, py - 60, 110, 300); light(px, py - 60, 90, 700);
        tree(t.x - side * 250, t.y + D * 0.3, 1.2, 'pine');
        // P10 收尾：阁半悬在台外，台面里原来只有一棵松（远看一整块空台）：靠里起一排书房、一座亭、一对石灯
        hallIn(t, t.x - side * W * 0.12, t.y - D * 0.05, Math.min(560, W * 0.4), Math.min(240, D * 0.28), 160, { pal: { roof: ROOF.side } });
        pavilion(t, t.x - side * W * 0.02, fy - 220, 170, 260, { pal: { roof: ROOF.side } });
        lampPair(t.x - side * W * 0.08, fy - 100, 150);
        break;
      }
      case 'hall2': {
        // 器殿：往外半悬出台沿
        const side = t.x < 0 ? -1 : 1;
        hall(t.x + side * (W / 2 - 220), t.y + 120, 620, 340, 200, { pal: { roof: ROOF.side }, stilts: true, on: { x: t.x - side * 250, y: t.y + 100, dz: 0 } });
        pavilion(t, t.x - side * 150, fy - 260, 180, 280, { pal: { roof: ROOF.side } });
        break;
      }
      case 'tower': {
        // 两翼的钟鼓楼：往外半悬
        const side = t.x < 0 ? -1 : 1, px = t.x + side * (W / 2 - 100);
        add('sPagoda', px, t.y + 200, { w: 300, h: 620, tiers: 2, stilts: true, on: { x: t.x - side * 150, y: t.y + 150, dz: 0 }, pal: { roof: ROOF.hall } }); block(px, t.y + 260, 380, 380);
        tree(t.x - side * 250, t.y - D * 0.23, 1.2);
        // P10 收尾：楼半悬在台外，台面里原来只剩一棵树（远看一整块空台）：靠里起一座值房、一座亭、一对石灯
        hallIn(t, t.x - side * W * 0.16, t.y + D * 0.3, Math.min(520, W * 0.36), Math.min(260, D * 0.3), 170, { pal: { roof: ROOF.side } });
        pavilion(t, t.x - side * W * 0.04, fy - 240, 180, 280, { pal: { roof: ROOF.side } });
        lampPair(t.x - side * W * 0.1, fy - 110, 150);
        break;
      }
      case 'main': {
        // 正殿：最大一号、重檐、琉璃顶；两侧配殿（往外摆开），连廊从正殿两山接到配殿的内侧；香炉、石狮、古松
        // 正殿夹在两道上后殿的石阶之间（殿后两侧各一道往上走）：殿宽收到不压那两道石阶，殿就能照原样坐在台后，不被挤到台前
        let gapW = Infinity;
        for (const s of P.stairs) if (s.lo === t.id && Math.abs(s.x2 - s.x1) < 1 && Math.abs(s.x1 - t.x) > 300) gapW = Math.min(gapW, (Math.abs(s.x1 - t.x) - s.w / 2 - 150) / 0.62);
        const mw = Math.min(small ? Math.min(900, W * 0.55) : Math.min(1400, W * 0.47), Math.max(600, gapW)), md = small ? 420 : 640, mh = small ? 240 : 360, hy = back(t) + md + (small ? 160 : 220);
        if (feat === 'dome') { add('sDome', t.x, hy - md * 0.5, { r: mw * 0.42, pal: { roof: '#d8c890', wall: '#f4f0e4', accent: '#e0b040' } }); block(t.x, hy, mw * 0.9, md * 1.1); light(t.x, hy, 160, 200); }
        const mq = feat === 'dome' ? null : hallIn(t, t.x, hy, mw, Math.min(md, D * 0.42), mh, { tiers: small ? 1 : 2, base: small ? 60 : 110, roof: mh, pal: { roof: ROOF.main, accent: demon ? '#c03030' : '#d8b040' }, glaze: true });
        if (!small && W > 2200) for (const s of [-1, 1]) {
          const sx = t.x + s * W * 0.36, sy = hy + 620;
          if (!fits(t, sx, sy - 160, 300, 170)) continue;
          const q = hallIn(t, sx, sy, 560, 320, 200, { pal: { roof: ROOF.hall } }); if (!q) continue;   // 配殿
          // 连廊：从正殿山墙接出来，拐进配殿后身（按两座殿实际摆下的位置）
          const my = (mq?.[1] ?? hy) - md * 0.4;
          if (q[1] - 160 > my + 60) add('sCorridor', t.x + s * (mw / 2 + 40), my, { x2: q[0] - s * 200, y2: my, y3: q[1] - 160, w: 110, h: 110 });
        }
        for (const s of [-1, 1]) { add('sLion', t.x + s * 260, hy + 300, { s: 1.2, flip: s > 0 }); tree(t.x + s * W * 0.4, back(t) + 300, 1.7, 'pine'); }
        add('sCenser', t.x, Math.min(fy - 300, hy + 520), { s: small ? 1.1 : 1.5 }); light(t.x, Math.min(fy - 300, hy + 520), 160);
        lampPair(t.x, fy - 120, 300);
        flag(t.x - 560, fy - 100); flag(t.x + 560, fy - 100);
        if (feat === 'moon') { add('sPool', t.x - W * 0.3, fy - 300, { w: 420, d: 420, round: true, moon: true }); light(t.x - W * 0.3, fy - 300, 160); }
        if (feat === 'sword' && small) add('sSword', t.x + W * 0.32, fy - 260, { h: 520 });
        if (feat === 'temple') add('sPagoda', t.x + W * 0.33, back(t) + 420, { w: 260, h: 900, tiers: 5, pal: { roof: ROOF.hall } });
        if (feat === 'blade') add('sPost', t.x + W * 0.3, fy - 260, { rack: true });
        break;
      }
      case 'top': {
        const mw = Math.min(1150, W * 0.5), hy = back(t) + 520 + 150;
        if (feat === 'dome') add('sDome', t.x, hy - 260, { r: mw * 0.4, pal: { roof: '#e0c870', wall: '#f4f0e4', accent: '#e0b040' } });
        else hallIn(t, t.x, hy, mw, Math.min(520, D * 0.42), 320, { tiers: 2, base: 100, roof: 320, pal: { roof: ROOF.top, accent: demon ? '#c03030' : '#e8c050' }, glaze: true });
        { const q = nudge(t, t.x - W * 0.36, back(t) + 420, -200, 200, -360, 60); if (q) { add('sPagoda', q[0], q[1], { w: 300, h: small ? 900 : 1900, tiers: small ? 5 : 9, pal: { roof: ROOF.top } }); block(q[0], q[1] + 60, 380, 380); light(q[0], q[1] + 20, 80, 900); } }
        if (fits(t, t.x + W * 0.36, back(t) + 450, 260, 260)) { if (feat === 'sword') { for (let k = 0; k < 5; k++) add('sSword', t.x + W * 0.36 + (k - 2) * 90, back(t) + 450 + (k % 2) * 80, { h: 360 + k * 60 }); } else add('sForbid', t.x + W * 0.36, back(t) + 450, { r: 230 }); light(t.x + W * 0.36, back(t) + 450, 200); }
        lampPair(t.x, fy - 120, 260);
        tree(t.x - W * 0.42, fy - 300, 1.6, 'pine'); tree(t.x + W * 0.42, fy - 260, 1.5, 'pine');
        break;
      }
      case 'caves': {
        hallIn(t, t.x, t.y + D * 0.08, 520, 280, 170, { pal: { roof: ROOF.side } });
        for (const [x, y] of [[-0.3, -0.33], [0, -0.37], [0.3, -0.33], [0.35, -0.1], [-0.35, -0.1], [0.3, 0.19]] as const) { add('sCave', t.x + x * W, t.y + y * D, { w: 300 }); light(t.x + x * W, t.y + y * D + 30, 60, 60); }
        pavilion(t, t.x - W * 0.27, t.y + D * 0.35, 200, 300, { pal: { roof: ROOF.side } });
        tree(t.x + 200, t.y + D * 0.33, 1.3, 'pine');
        break;
      }
      case 'garden': {
        if (feat === 'beast') {
          for (const [x, y] of [[-0.22, -0.2], [0.18, -0.2], [-0.22, 0.2], [0.18, 0.2]] as const) add('sPen', t.x + x * W, t.y + y * D, { w: W * 0.32, d: D * 0.28 });
          hall(t.x, back(t) + 340, Math.min(500, W * 0.5), 240, 160, { pal: { roof: ROOF.side } });
          break;
        }
        const cols = W > 1600 ? 2 : 1, rows = Math.max(2, Math.floor((D - 400) / 420));
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
          const fw = Math.min(430, W * 0.3), q = nudge(t, t.x + (cols === 2 ? (c ? 0.16 : -0.07) * W : 0.12 * W), back(t) + 300 + r * 420 + (r >= rows / 2 ? 100 : 0), -fw / 2, fw / 2, -150, 150);
          if (q && !L.pieces.some((pc) => pc.kind === 'sField' && Math.abs(pc.x * LS - q[0]) < fw && Math.abs(pc.y * LS - q[1]) < 320)) add('sField', q[0], q[1], { w: fw, d: 300 });
        }
        if (W > 1100) {
          { const hw = Math.min(460, W * 0.3), q = nudge(t, t.x - W * 0.27, t.y + D * 0.06, -hw * 0.6, hw * 0.6, -280, 20); if (q) hall(q[0], q[1], hw, 240, 160, { pal: { roof: ROOF.side } }); }
          { const pw = Math.min(380, W * 0.25), q = nudge(t, t.x - W * 0.3, fy - 450, -pw / 2, pw / 2, -130, 130); if (q) add('sPool', q[0], q[1], { w: pw, d: 240 }); }
          pavilion(t, t.x + W * 0.3, back(t) + 400, 200, 300, { pal: { roof: ROOF.side } });
        }
        tree(t.x + 100, t.y + 60, 1.2, feat === 'pink' ? 'peach' : 'peach'); tree(t.x - W * 0.1, back(t) + 200, 1.2, 'pine');
        break;
      }
      case 'perch': pavilion(t, t.x, t.y + 60, Math.min(150, W * 0.35), 240, { pal: { roof: ROOF.side } }); break;
      case 'lake': {
        add('sLake', t.x, t.y, { pts: terraceOutline(t, 90).flatMap((q) => [q[0], q[1]]), moon: feat === 'moon' });
        L.blocks.push(...lakeBlocks(t));
        break;
      }
      case 'yards': case 'causeway': default: break;
    }
  }
  /** 湖面挡步行：沿湖内一圈矩形块（不压住湖心长堤） */
  function lakeBlocks(t: SectTerrace) {
    const out: LocLayout['blocks'] = [], step = 200;
    for (let y = t.y - t.h / 2; y < t.y + t.h / 2; y += step) for (let x = t.x - t.w / 2; x < t.x + t.w / 2; x += step) {
      if (rectDist(t, x + step / 2, y + step / 2) > -60) continue;
      if (P.terraces.some((o) => o !== t && o.rise > t.rise && rectDist(o, x + step / 2, y + step / 2) < 40)) continue;
      out.push({ x: x / LS, y: y / LS, w: step / LS, h: step / LS });
    }
    return out;
  }

  // —— 院落：位置在规划里定好（底图上的小径也照这一份画）
  for (const y of P.yards) {
    if (!y.kind) {
      if (y.fill === 'tree') tree(y.x, y.y + 40, 0.9 + rnd() * 0.35);
      else add(y.fill === 'well' ? 'sWell' : 'sRack', y.x, y.y, {});
      continue;
    }
    add('sYard', y.x, y.y, { w: y.w, d: y.d, kind: y.kind, lit: y.lit, pal: { roof: y.roof ? ROOF.yard2 : ROOF.yard }, win: WIN });
    L.blocks.push({ x: (y.x - y.w / 2) / LS, y: (y.y - y.d / 2) / LS, w: y.w / LS, h: y.d / LS });
    light(y.x, y.y + y.d / 2 + 10, 40, 44); light(y.x, y.y - y.d * 0.15, 50, 60);
    if (rnd() < 0.3) L.smoke.push({ x: (y.x + y.w * 0.25) / LS, y: (y.y - y.d / 2) / LS });
  }
  // 特色：竹林教在台面上也种竹；合欢、妙音满院桃花；剑门在院落台上立剑
  if (feat === 'bamboo' || feat === 'pink') for (const t of P.terraces) if (t.role === 'yards' || t.role === 'axis') for (let k = 0; k < 4; k++) {
    const x = t.x + (rnd() - 0.5) * t.w * 0.8, y = t.y + (rnd() - 0.5) * t.h * 0.6;
    if (fits(t, x, y, 60, 60) && !P.yards.some((q) => q.kind && Math.abs(q.x - x) < q.w / 2 + 60 && Math.abs(q.y - y) < q.d / 2 + 60)) tree(x, y, 1.1, feat === 'bamboo' ? 'bamboo' : 'peach');
  }

  // —— 石梁上的长石桥、通往悬空峰的铁索桥
  const T = (id: string) => P.terraces.find((t) => t.id === id);
  /** 悬空峰的「脚下」：以一层主台的台面为准再抬高（地表不托着它） */
  const anchor = P.terraces.find((t) => t.role === 'main') ?? P.terraces[0];
  const isleOn = (rise: number) => ({ x: anchor.x, y: anchor.y, dz: rise - anchor.rise });
  for (const b of P.bridges) {
    if (b.kind === 'stone') { add('sBridge', b.x1, b.y1, { x2: b.x2, y2: b.y2, w: b.w }); continue; }
    const end = (id: string, x: number, y: number) => {
      const isle = P.isles.find((s) => s.id === id);
      if (!isle) { const t = T(id)!, dx = t.x - x, dy = t.y - y, l = Math.hypot(dx, dy) || 1; return { x: x + dx / l * 60, y: y + dy / l * 60, dz: 0 }; }
      return isleOn(isle.rise);
    };
    add('sChain', b.x1, b.y1, { x2: b.x2, y2: b.y2, w: b.w, a: end(b.a, b.x1, b.y1), b: end(b.b, b.x2, b.y2) });
  }
  // —— 悬空峰：岩体、峰上的楼阁、松
  for (const s of P.isles) {
    const on = isleOn(s.rise);
    add('sIsle', s.x, s.y, { r: s.r, seed: s.seed, on });
    if (s.r > 560) hall(s.x, s.y + 140, 460, 300, 170, { tiers: 2, on, pal: { roof: ROOF.hall } });
    else add('sPavilion', s.x, s.y + 60, { w: 260, h: 380, on, pal: { roof: ROOF.hall } });
    for (let k = 0; k < 3; k++) { const a = rnd() * Math.PI * 2; add('sPine', s.x + Math.cos(a) * s.r * 0.65, s.y + Math.sin(a) * s.r * 0.55, { h: 220 + rnd() * 120, on }); }
    add('sLamp', s.x - s.r * 0.3, s.y + s.r * 0.6, { on }); add('sLamp', s.x + s.r * 0.3, s.y + s.r * 0.6, { on });
  }
  // 山坡上的树林不在这里摆：由地面装饰按规划成片地种（world/sectTrees.ts）

  // —— 宗门里的人：落脚点（各台的前半截，避开建筑）与步行网（各台一个汇点，连到落在台上的石阶口，石阶两头相连）
  {
    const inBlock = (x: number, y: number, pad = 20) => L.blocks.some((b) => x / LS > b.x - pad && x / LS < b.x + b.w + pad && y / LS > b.y - pad && y / LS < b.y + b.h + pad);
    const spots: { x: number; y: number }[] = [], pts: number[] = [], adj: number[][] = [];
    const node = (x: number, y: number) => { pts.push(x / LS, y / LS); adj.push([]); return adj.length - 1; };
    const link = (a: number, b: number) => { if (a !== b && !adj[a].includes(b)) { adj[a].push(b); adj[b].push(a); } };
    const hub = new Map<SectTerrace, number>();
    for (const t of P.terraces) {
      if (t.role === 'lake' || t.role === 'perch' || (t.causeway && P.mountain)) continue;
      let hx = t.x, hy = t.y + (t.causeway ? 0 : t.h * 0.3);
      for (let k = 0; k < 12 && (inBlock(hx, hy) || rectDist(t, hx, hy) > -60); k++) { hx = t.x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 150; hy = t.y + t.h * (0.3 - (k % 3) * 0.1); }
      if (inBlock(hx, hy)) continue;
      hub.set(t, node(hx, hy));
      for (const u of [-0.35, -0.15, 0.15, 0.35]) for (const v of [0.05, 0.3]) {
        const x = t.x + u * t.w, y = t.y + v * t.h;
        // 落脚点离建筑多留一点（行人在落脚点上下会随手错开几十）
        if (rectDist(t, x, y) < -100 && !inBlock(x, y, 45) && !onPlanStair(P, x, y, 80)) spots.push({ x: x / LS, y: y / LS });
      }
    }
    for (const s of P.stairs) {
      const ta = P.terraces.find((t) => hub.has(t) && rectDist(t, s.x1, s.y1) < 40), tb = P.terraces.find((t) => hub.has(t) && rectDist(t, s.x2, s.y2) < 40);
      if (!ta || !tb) continue;
      const a = node(s.x1, s.y1), b = node(s.x2, s.y2);
      link(a, b); joinHub(ta, a, s); joinHub(tb, b, s);
    }
    /** 石阶口接到台上的汇点（绕开殿阁、院墙） */
    function joinHub(t: SectTerrace, end: number, _s: unknown) { linkOn(t, end, hub.get(t)!); }
    /** 同一层台上的两点之间：直线不穿建筑就直连；穿了就在台面上按 60 一格绕开殿阁（广度优先，再拉直），中间加几个拐点 */
    function linkOn(t: SectTerrace, a: number, b: number) {
      const ax = pts[a * 2] * LS, ay = pts[a * 2 + 1] * LS, bx = pts[b * 2] * LS, by = pts[b * 2 + 1] * LS;
      const free = (x: number, y: number) => !inBlock(x, y, 12) && (rectDist(t, x, y) < -30 || onPlanStair(P, x, y, 0));
      const see = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 25)); for (let k = 1; k < n; k++) if (!free(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)) return false; return true; };
      if (see(ax, ay, bx, by)) { link(a, b); return; }
      const C = 60, x0 = t.x - t.w / 2, y0 = t.y - t.h / 2, nx = Math.ceil(t.w / C) + 1, ny = Math.ceil((t.h + (t.bulge ?? 0)) / C) + 1;
      const cell = (x: number, y: number) => { const i = Math.round((x - x0) / C), j = Math.round((y - y0) / C); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
      const cx = (c: number) => x0 + (c % nx) * C, cy = (c: number) => y0 + Math.floor(c / nx) * C;
      const s0 = cell(ax, ay), s1 = cell(bx, by);
      if (s0 < 0 || s1 < 0) { link(a, b); return; }
      const prev = new Int32Array(nx * ny).fill(-2); prev[s0] = -1; const q = [s0];
      for (let qi = 0; qi < q.length && prev[s1] === -2; qi++) {
        const c = q[qi], i = c % nx, j = Math.floor(c / nx);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const u = i + di, v = j + dj; if (u < 0 || v < 0 || u >= nx || v >= ny) continue;
          const n = v * nx + u; if (prev[n] !== -2 || (n !== s1 && !free(cx(n), cy(n)))) continue;
          prev[n] = c; q.push(n);
        }
      }
      if (prev[s1] === -2) { link(a, b); return; }   // 绕不过去（不该有）：照旧直连，行人碰壁会换个去处
      const path: [number, number][] = []; for (let c = prev[s1]; c >= 0 && c !== s0; c = prev[c]) path.unshift([cx(c), cy(c)]);
      // 拉直：从当前点看得见的最远一点直接连过去
      let cur = a, px = ax, py = ay;
      for (let i = 0; i < path.length; ) {
        let j = path.length - 1; while (j > i && !see(px, py, path[j][0], path[j][1])) j--;
        if (see(path[j][0], path[j][1], bx, by)) { const m = node(path[j][0], path[j][1]); link(cur, m); link(m, b); return; }
        const m = node(path[j][0], path[j][1]); link(cur, m); cur = m; px = path[j][0]; py = path[j][1]; i = j + 1;
      }
      link(cur, b);
    }
    // 石梁上的长石桥：两头的台连起来
    for (const b of P.bridges) {
      if (b.kind !== 'stone') continue;
      const ta = P.terraces.find((t) => t.id === b.a), tb = P.terraces.find((t) => t.id === b.b);
      if (!ta || !tb || !hub.has(ta) || !hub.has(tb)) continue;
      const a = node(b.x1, b.y1), c = node(b.x2, b.y2);
      link(a, c); link(a, hub.get(ta)!); link(c, hub.get(tb)!);
    }
    // 平地堆的小山：台地之间多半是能走的缓坡，同高（差一百上下）、隔得不远的两层台直接连起来（湖边的长堤、山门前的平地也算）
    if (!P.mountain) for (const [ta, ha] of hub) for (const [tb, hb] of hub) {
      if (ta === tb || Math.abs(ta.rise - tb.rise) > 120) continue;
      const ax = pts[ha * 2] * LS, ay = pts[ha * 2 + 1] * LS, bx = pts[hb * 2] * LS, by = pts[hb * 2 + 1] * LS;
      // 沿直线每 30 一步：不穿建筑、不下湖，坡不陡过步行限坡（台沿的挡墙走不过去，那里只能走石阶）
      const L2 = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(L2 / 30));
      let gap = 0, clear = true, h0 = planRise(P, ax, ay);
      for (let k = 1; k <= n && clear; k++) {
        const x = ax + (bx - ax) * k / n, y = ay + (by - ay) * k / n, h = planRise(P, x, y);
        if (inBlock(x, y) || P.terraces.some((t) => t.role === 'lake' && rectDist(t, x, y) < 40 && !P.terraces.some((c) => c.causeway && rectDist(c, x, y) < 0))) clear = false;
        else if (Math.abs(h - h0) > L2 / n * 0.7 && !onPlanStair(P, x, y, 0)) clear = false;
        else if (!P.terraces.some((t) => rectDist(t, x, y) < 0)) gap += L2 / n;
        h0 = h;
      }
      if (clear && gap < 900) link(ha, hb);
    }
    // 只留和山门连着的那一片（没有路接上的台不放人）
    const gateHub = [...hub.entries()].find(([t]) => t.role === 'gate')?.[1] ?? 0, keep = new Uint8Array(adj.length), q = [gateHub]; keep[gateHub] = 1;
    while (q.length) for (const nb of adj[q.pop()!]) if (!keep[nb]) { keep[nb] = 1; q.push(nb); }
    const remap = new Int32Array(adj.length).fill(-1); let n = 0;
    for (let i = 0; i < adj.length; i++) if (keep[i]) remap[i] = n++;
    const pts2: number[] = [], adj2: number[][] = [];
    for (let i = 0; i < adj.length; i++) if (keep[i]) { pts2.push(pts[i * 2], pts[i * 2 + 1]); adj2.push(adj[i].map((j) => remap[j]).filter((j) => j >= 0)); }
    L.spots = spots; L.nav = { pts: pts2, adj: adj2 };
  }

  // —— 护山大阵：罩住整座山。光罩是加色的：人一直在罩子里头，颜色压暗一半（远看仍看得出一层光）
  const bc = SECT_STYLE[loc.id]?.barrier ?? (demon ? '#c03030' : '#80c0e0'), dim = (h: string) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.5).toString(16).padStart(2, '0')).join('');
  L.barrier = { x: P.cx / LS, y: P.cy / LS, rx: (P.rx + 400) / LS, ry: (P.ry + 400) / LS, color: dim(bc) };
  // 地点范围：locZone = gw·LOC_SCALE·0.42 —— 正好是地界
  L.gw = (P.rx + 300) / (LS * 0.42); L.gh = (P.ry + Math.abs(P.cy) + 300) / (LS * 0.42);
  L.terraces = P.terraces.map((t) => ({ x: t.x / LS, y: t.y / LS, rx: t.w / 2 / LS, ry: t.h / 2 / LS, rise: t.rise }));
  // —— 名牌（镜头拉近时浮在殿顶上）：每层要紧的台取台上最大的那座殿 / 塔 / 门，按台的用处起名；演武场、灵药园没有殿就挂在台心
  {
    const NAME: Partial<Record<string, [string, number]>> = { gate: ['山门', 0], main: ['正殿', 0], top: ['祖师殿', 0], library: ['藏经阁', 0], hall2: ['传功殿', 0], mid: ['执事堂', 1], drill: ['演武场', 1], bell: ['钟鼓楼', 1], tower: ['镇山塔', 1], caves: ['洞府', 1], garden: ['灵药园', 1] };
    const big = new Set(['sHall', 'sPagoda', 'sGate', 'sDome']);
    const names: NonNullable<LocLayout['names']> = [];
    const seen = new Set<string>();
    for (const t of P.terraces) {
      const nm = t.role ? NAME[t.role] : undefined; if (!nm) continue;
      if (seen.has(nm[0]) && t.role !== 'garden') continue;
      let best: { x: number; y: number; h: number; a: number } | null = null;
      for (const pc of L.pieces) {
        if (!big.has(pc.kind)) continue;
        const x = pc.x * LS, y = pc.y * LS; if (rectDist(t, x, y - 60) > 60) continue;
        const p = pc.p as Record<string, number>, a = (p.w ?? 300) * ((p.h ?? 300) + (p.base ?? 0));
        if (t.role === 'gate' && pc.kind !== 'sGate') continue;
        const h = pc.kind === 'sHall' ? (p.base ?? 20) + (p.h ?? 200) + (p.roof ?? 120) * (p.tiers ?? 1) + 60 : pc.kind === 'sDome' ? (p.r ?? 300) * 1.1 : (p.h ?? 300) + 60;
        if (!best || a > best.a) best = { x, y: y - (pc.kind === 'sHall' ? (p.d ?? 200) * 0.5 : 0), h, a };
      }
      if (!best && (t.role === 'drill' || t.role === 'garden')) best = { x: t.x, y: t.y, h: 90, a: 0 };
      if (!best) continue;
      seen.add(nm[0]);
      names.push({ x: best.x / LS, y: best.y / LS, h: best.h, t: nm[0], k: nm[1] });
    }
    L.names = names;
  }
  void riseOf;
}
