// 近战兵器的画法（剑、刀、锤、枪、棍；r16 加魂镰 lian）：人物手里、背后、背包图标共用这一套。
// 兵器是一根直的轴：u 是沿轴的长度（人物局部单位），u = 0 是主手握点；u 往刃尖 / 枪头方向为正。
// 画的时候调用方给出这根轴在屏幕上的样子（轴原点、每单位 u 的屏幕位移、每单位「刃口方向」的屏幕位移、比例），
// 这里按形制拼出几段「圆杆」和「扁刃」，可以只画 u 的某一段（人物身上按前后遮挡切成几段分别排序）。
// 画风：同色系描线 + 柔和明暗，和人物一样；品阶高的刃上有一点流光，别糊。
import { shade as shade0, rgba as rgba0 } from '../core/canvas';
import { WEAPON_SHAPE, weaponForm, weaponTier, type WeaponForm, type WeaponLook, type WeaponShape } from '../data/weapons';

const SH = new Map<string, string>();
const shade = (c: string, k: number) => { const key = c + k; let r = SH.get(key); if (r === undefined) { if (SH.size > 2000) SH.clear(); r = shade0(c, k); SH.set(key, r); } return r; };
const rgba = (c: string, a: number) => rgba0(c, a);
const inkOf = (c: string) => rgba(shade(c, -0.62), 0.92);

export interface WeaponPaint {
  form: WeaponForm; S: WeaponShape;
  metal: string; haft: string; glow: number; glowColor: string;
  /** 护手 / 吞口 / 箍的颜色 */ fitting: string;
  /** 剑鞘色（收着的剑） */ sheath: string;
}
const memo = new Map<string, WeaponPaint | null>();
/** 外观上的兵器 → 画法参数（金属色、柄色、流光）；空手返回 null */
export function weaponPaint(w: WeaponLook | undefined | null): WeaponPaint | null {
  if (!w || w.kind === 'fist') return null;
  const key = w.kind + '|' + w.tier + '|' + (w.form ?? '') + '|' + (w.color ?? '');
  if (memo.has(key)) return memo.get(key)!;
  const T = weaponTier(w.kind, w.tier);
  if (!T) { memo.set(key, null); return null; }
  const form = weaponForm(w);
  let metal = T.metal, glow = T.glow, glowColor = T.glowColor;
  if (w.color) { metal = mixHex('#e6eeea', w.color, 0.35); glowColor = w.color; glow = Math.max(glow, 0.38); }   // 本命飞剑握在手里：带着那口剑的光色
  const fitting = w.tier >= 5 ? '#d8b860' : w.tier >= 3 ? shade(metal, -0.15) : '#a88a48';
  const out: WeaponPaint = { form, S: WEAPON_SHAPE[form], metal, haft: T.haft, glow, glowColor, fitting, sheath: shade(T.haft, -0.12) };
  memo.set(key, out);
  return out;
}
function mixHex(a: string, b: string, t: number) {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const A = p(a), B = p(b); if (A.some(isNaN) || B.some(isNaN)) return a;
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** 沿轴的几个关键位置（u）：最尾、刃 / 头起点、最前（刃尖 / 枪尖 / 锤顶）、副手握点 */
export interface WeaponSpan { uMin: number; uBlade: number; uTip: number; uOff: number }
export function weaponSpan(form: WeaponForm): WeaponSpan {
  const s = WEAPON_SHAPE[form];
  switch (form) {
    case 'jian': { const gU = s.grip - s.tail; return { uMin: -s.tail - 1, uBlade: gU + 0.5, uTip: gU + s.blade, uOff: -s.gap }; }
    case 'dao': return { uMin: -s.tail - 1, uBlade: 2.5, uTip: 2 + s.blade, uOff: -s.gap };
    case 'hammer': return { uMin: -s.tail - 1, uBlade: s.blade - s.headL / 2, uTip: s.blade + s.headL / 2 + 1.6, uOff: -s.gap };
    case 'qiang': return { uMin: -s.tail - 1.5, uBlade: s.blade + 2.2, uTip: s.blade + 2.2 + s.headL, uOff: -s.gap };
    case 'gun': return { uMin: -s.tail - 0.2, uBlade: s.blade - 14, uTip: s.blade + 0.2, uOff: -s.gap };
    case 'lian': return { uMin: -s.tail - 1.2, uBlade: s.blade - s.headL, uTip: s.blade + 2.5, uOff: -s.gap };
    default: return { uMin: 0, uBlade: 0, uTip: 0, uOff: 0 };
  }
}

/** 一段：round 圆杆（宽度沿屏幕上的轴法线，不怕侧着看）；flat 扁刃（宽度沿「刃口方向」投影，侧着看会变薄） */
interface Prim {
  u0: number; u1: number; kind: 'round' | 'flat';
  /** u 处两侧的偏移（左负右正，单位 = 人物局部单位） */ w: (u: number) => [number, number];
  fill: string; n?: number;
  ridge?: number; glow?: boolean; bands?: number[]; ribs?: boolean;
}
function prims(P: WeaponPaint, sheathed: boolean): Prim[] {
  const s = P.S, m = P.metal, dk = shade(P.metal, -0.28), out: Prim[] = [];
  const c = (w: number) => (): [number, number] => [-w, w];
  switch (P.form) {
    case 'jian': {
      const gU = s.grip - s.tail, tip = gU + s.blade;
      out.push({ u0: -s.tail - 1, u1: -s.tail + 0.3, kind: 'round', w: c(1.15), fill: P.fitting });
      out.push({ u0: -s.tail + 0.3, u1: gU - 0.45, kind: 'round', w: c(0.72), fill: P.haft, bands: [-s.tail + 1.5, -s.tail + 3, -s.tail + 4.5, -s.tail + 6] });
      out.push({ u0: gU - 0.5, u1: gU + 0.5, kind: 'flat', w: c(s.guard), fill: P.fitting });
      if (sheathed) out.push({ u0: gU + 0.5, u1: tip + 1, kind: 'flat', n: 6, w: (u) => { const r = s.width * 1.3 * (u > tip - 1 ? Math.sqrt(Math.max(0, 1 - (u - tip + 1) / 2)) : 1); return [-r, r]; }, fill: P.sheath, bands: [gU + 4, tip - 2] });
      else out.push({ u0: gU + 0.5, u1: tip, kind: 'flat', n: 6, w: (u) => { const f = (u - gU) / s.blade, r = s.width * (1 - 0.18 * f) * (f > 0.86 ? Math.max(0, (1 - f) / 0.14) : 1); return [-r, r]; }, fill: m, ridge: 0, glow: true });
      break;
    }
    case 'dao': {
      const gU = 2, end = gU + s.blade;
      out.push({ u0: -s.tail - 1, u1: -s.tail, kind: 'round', w: c(1.15), fill: P.fitting });
      out.push({ u0: -s.tail, u1: gU - 0.5, kind: 'round', w: c(0.85), fill: P.haft, bands: [-s.tail + 2, -4, -1] });
      out.push({ u0: gU - 0.5, u1: gU + 0.5, kind: 'flat', w: c(s.guard), fill: P.fitting });
      out.push({ u0: gU + 0.5, u1: end, kind: 'flat', n: 9, w: (u) => {
        const f = (u - gU) / s.blade, sp = -s.width * 0.22;
        let e = s.width * (0.5 + 0.5 * f);
        if (f > 0.8) e = sp + (e - sp) * Math.sqrt(Math.max(0, 1 - ((f - 0.8) / 0.2) ** 2));
        return [sp, e];
      }, fill: m, ridge: -0.12, glow: true });
      break;
    }
    case 'hammer': {
      const hc = s.blade, hl = s.headL / 2;
      out.push({ u0: -s.tail - 1, u1: -s.tail, kind: 'round', w: c(1.35), fill: P.fitting });
      out.push({ u0: -s.tail, u1: hc - hl + 0.4, kind: 'round', w: c(s.width), fill: P.haft, bands: [-s.tail + 1.4, 3, hc - hl - 1] });
      out.push({ u0: hc - hl - 1.3, u1: hc - hl + 0.6, kind: 'round', w: c(1.6), fill: dk });
      out.push({ u0: hc - hl, u1: hc + hl, kind: 'round', n: 9, w: (u) => { const k = (u - hc) / hl, r = (s.headW / 2) * Math.pow(Math.max(0, 1 - k * k), 0.62); return [-r, r]; }, fill: m, ribs: true, glow: true });
      out.push({ u0: hc + hl - 0.2, u1: hc + hl + 1.6, kind: 'round', n: 3, w: (u) => { const r = 0.7 * Math.max(0, 1 - (u - hc - hl + 0.2) / 1.8); return [-r, r]; }, fill: dk });
      break;
    }
    case 'qiang': {
      const b = s.blade, h0 = b + 2.2;
      out.push({ u0: -s.tail - 1.5, u1: -s.tail + 0.4, kind: 'round', w: c(1.05), fill: dk });
      out.push({ u0: -s.tail + 0.4, u1: b, kind: 'round', w: c(s.width), fill: P.haft });
      out.push({ u0: b - 0.4, u1: h0, kind: 'round', w: (u) => { const r = 1.05 + 0.3 * (u - b) / 2.6; return [-r, r]; }, fill: dk });
      out.push({ u0: h0, u1: h0 + s.headL, kind: 'flat', n: 8, w: (u) => { const f = (u - h0) / s.headL, r = (s.headW / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, f * 0.62 + 0.06)), 0.8) * (f > 0.62 ? (1 - f) / 0.38 : 1); return [-r, r]; }, fill: m, ridge: 0, glow: true });
      break;
    }
    case 'lian': {
      // 魂镰：长杆（尾上一截铁鐏、握处缠红布），杆头一圈铁箍，镰刃从杆头往回勾——刃根贴着杆、越往回离杆越远，刃尖收成一点（一弯月牙）
      const b = s.blade, top = b + 2.5, L = s.headL + 2.5;
      out.push({ u0: -s.tail - 1.2, u1: -s.tail + 1.2, kind: 'round', w: c(1.2), fill: dk });
      out.push({ u0: -s.tail + 1.2, u1: b, kind: 'round', w: c(s.width), fill: P.haft, bands: [-6, -3, 0, 3, 6] });
      out.push({ u0: b - 2.2, u1: b + 1.2, kind: 'round', w: c(1.7), fill: dk, ribs: true });
      out.push({ u0: b - s.headL, u1: top, kind: 'flat', n: 12, w: (u) => {
        const f = Math.max(0, Math.min(1, (top - u) / L));
        const outer = 1.4 + s.headW * Math.pow(Math.sin(f * Math.PI / 2), 0.85);
        const thick = 0.25 + 6.2 * Math.pow(1 - f, 0.75) * (0.55 + 0.45 * Math.sin(Math.min(1, f * 3) * Math.PI / 2));
        return [outer - thick, outer];
      }, fill: m, ridge: 0.2, glow: true });
      break;
    }
    case 'gun': {
      const b = s.blade, t0 = -s.tail;
      out.push({ u0: t0, u1: b, kind: 'round', w: c(s.width), fill: P.haft });
      out.push({ u0: t0 - 0.2, u1: t0 + 4, kind: 'round', w: c(s.width * 1.18), fill: m, bands: [t0 + 1.2, t0 + 2.8] });
      out.push({ u0: b - 14, u1: b + 0.2, kind: 'round', w: c(s.width * 1.18), fill: m, bands: [b - 12.5, b - 9, b - 1.5], glow: true });
      break;
    }
  }
  return out;
}

/** 轴在屏幕上：o 是 u = 0 处，a 是每单位 u 的屏幕位移，e 是每单位「刃口方向」的屏幕位移，S 是局部单位 → 屏幕像素 */
export interface WeaponAxis { ox: number; oy: number; ax: number; ay: number; ex: number; ey: number; S: number }
export interface PaintOpts { /** 0–1：扁刃往正对镜头转多少 */ face?: number; sheathed?: boolean; t?: number; lw: number; fine?: boolean; /** 只画 [from, to] 这一段 */ from?: number; to?: number; tassel?: boolean }

/** 画兵器（或其中一段） */
export function paintWeapon(g: CanvasRenderingContext2D, P: WeaponPaint, A: WeaponAxis, o: PaintOpts) {
  const L = Math.hypot(A.ax, A.ay) || 1e-6;
  const nx = -A.ay / L * A.S, ny = A.ax / L * A.S;   // 屏幕上的轴法线（长度 = 一个局部单位）
  // 扁刃的宽度方向：刃口方向的投影；侧着看时不让它薄到看不见（至少留三成）
  let fx = A.ex, fy = A.ey;
  const fl = Math.hypot(fx, fy), along = (fx * A.ax + fy * A.ay) / (L * L);
  fx -= A.ax * along; fy -= A.ay * along;
  const fp = Math.hypot(fx, fy);
  const minK = 0.32 * A.S;
  if (fp < minK) { const sg = fx * nx + fy * ny >= 0 ? 1 : -1; const k = (minK - fp) / A.S; fx += nx * k * sg; fy += ny * k * sg; }
  void fl;
  // face：把扁刃往「正对镜头」转一些——刀、剑侧着对镜头时只剩一条线，看着像根棍
  if (o.face) { const sg = fx * nx + fy * ny >= 0 ? 1 : -1, k = o.face; fx = fx * (1 - k) + nx * sg * k; fy = fy * (1 - k) + ny * sg * k; }
  const from = o.from ?? -1e9, to = o.to ?? 1e9;
  const pt = (u: number, off: number, flat: boolean) => ({ x: A.ox + A.ax * u + (flat ? fx : nx) * off, y: A.oy + A.ay * u + (flat ? fy : ny) * off });
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of prims(P, !!o.sheathed)) {
    const u0 = Math.max(p.u0, from), u1 = Math.min(p.u1, to);
    if (u1 <= u0 + 1e-4) continue;
    const flat = p.kind === 'flat', N = Math.max(1, p.n ?? 1);
    const Lp: { x: number; y: number }[] = [], Rp: { x: number; y: number }[] = [];
    for (let i = 0; i <= N; i++) { const u = u0 + (u1 - u0) * (i / N), [l, r] = p.w(u); Lp.push(pt(u, l, flat)); Rp.push(pt(u, r, flat)); }
    g.beginPath(); g.moveTo(Lp[0].x, Lp[0].y);
    for (let i = 1; i <= N; i++) g.lineTo(Lp[i].x, Lp[i].y);
    for (let i = N; i >= 0; i--) g.lineTo(Rp[i].x, Rp[i].y);
    g.closePath();
    // 明暗：沿法线一侧亮一侧暗（同色系）
    let fill: string | CanvasGradient = p.fill;
    if (o.fine) {
      const a = pt((u0 + u1) / 2, -2, flat), b = pt((u0 + u1) / 2, 2, flat);
      const gr = g.createLinearGradient(a.x, a.y, b.x, b.y);
      gr.addColorStop(0, shade(p.fill, 0.22)); gr.addColorStop(0.5, p.fill); gr.addColorStop(1, shade(p.fill, -0.22));
      fill = gr;
    }
    g.fillStyle = fill; g.fill();
    // 描线：只描两条长边（切段处不描，接缝看不出来）；两头是兵器真正的端点才封口
    g.strokeStyle = inkOf(p.fill); g.lineWidth = o.lw;
    g.beginPath();
    g.moveTo(Lp[0].x, Lp[0].y); for (let i = 1; i <= N; i++) g.lineTo(Lp[i].x, Lp[i].y);
    if (u1 >= p.u1 - 1e-4) g.lineTo(Rp[N].x, Rp[N].y); else g.moveTo(Rp[N].x, Rp[N].y);
    for (let i = N - 1; i >= 0; i--) g.lineTo(Rp[i].x, Rp[i].y);
    if (u0 <= p.u0 + 1e-4) g.lineTo(Lp[0].x, Lp[0].y);
    g.stroke();
    if (o.fine) {
      if (p.ridge !== undefined) {   // 刃口：沿一侧一道白亮的锋（看得出是开了刃的金属，不是一根棍）
        g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = Math.max(0.5, o.lw * 0.8);
        g.beginPath(); for (let i = 0; i <= N; i++) { const u = u0 + (u1 - u0) * (i / N), [, r] = p.w(u); const q = pt(u, r * 0.72, flat); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); } g.stroke();
        // 刃脊：一道亮线
        g.strokeStyle = rgba(shade(p.fill, 0.5), 0.75); g.lineWidth = Math.max(0.4, o.lw * 0.7);
        g.beginPath(); const a = pt(u0, p.ridge * 2, flat), b = pt(Math.min(u1, p.u1 - (p.u1 - p.u0) * 0.12), p.ridge * 2, flat); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      }
      if (p.bands) {   // 缠柄 / 铁箍
        g.strokeStyle = rgba(shade(p.fill, -0.5), 0.7); g.lineWidth = Math.max(0.4, o.lw * 0.8);
        g.beginPath();
        for (const ub of p.bands) { if (ub < u0 || ub > u1) continue; const [l, r] = p.w(ub); const a = pt(ub, l, flat), b = pt(ub, r, flat); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); }
        g.stroke();
      }
      if (p.ribs) {   // 锤头的棱
        g.strokeStyle = rgba(shade(p.fill, -0.45), 0.6); g.lineWidth = Math.max(0.4, o.lw * 0.7);
        for (const k of [-0.5, 0, 0.5]) { g.beginPath(); for (let i = 0; i <= N; i++) { const u = u0 + (u1 - u0) * (i / N), [l, r] = p.w(u); const q = pt(u, (l + r) / 2 + (r - l) / 2 * k, false); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); } g.stroke(); }
      }
    }
    // 流光：高品阶刃上一抹淡光，一道亮点沿刃缓缓走过
    if (p.glow && P.glow > 0 && !o.sheathed) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const a = pt(u0, 0, flat), b = pt(u1, 0, flat);
      g.strokeStyle = rgba(P.glowColor, 0.2 * P.glow); g.lineWidth = Math.max(0.8, 1.3 * A.S * (0.5 + P.glow));
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
      const k = (((o.t ?? 0) * 0.55) % 1.6) - 0.3;
      if (k > 0 && k < 1) {
        const uc = p.u0 + (p.u1 - p.u0) * k, h = (p.u1 - p.u0) * 0.12;
        const c0 = pt(Math.max(u0, uc - h), 0, flat), c1 = pt(Math.min(u1, uc + h), 0, flat);
        if (uc + h > u0 && uc - h < u1) {
          g.strokeStyle = rgba('#ffffff', 0.5 * P.glow); g.lineWidth = Math.max(0.8, 1.1 * A.S);
          g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.stroke();
        }
      }
      g.restore();
    }
  }
  // 枪缨：枪头下一簇红缨，往下垂
  if (P.form === 'qiang' && o.tassel !== false) {
    const ub = P.S.blade + 1.2;
    if (ub >= from && ub <= to) {
      const base = pt(ub, 0, false), sw = Math.sin((o.t ?? 0) * 3.1) * 0.8;
      g.strokeStyle = '#b8302a'; g.lineCap = 'round';
      for (let i = -2; i <= 2; i++) {
        g.lineWidth = Math.max(0.6, 0.75 * A.S);
        const ex = base.x - A.ax * 3.5 + nx * i * 0.6 + sw * A.S, ey = base.y - A.ay * 3.5 + ny * i * 0.6 + 5.5 * A.S;
        g.beginPath(); g.moveTo(base.x, base.y); g.quadraticCurveTo(base.x + nx * i * 0.8 + A.S * 1.5, base.y + 2 * A.S, ex, ey); g.stroke();
      }
    }
  }
  g.restore();
}

/** 背包 / 详情卡的兵器图标（代码画的，和人物手里的是同一套画法）：斜放、刃尖朝右上；没有画布（无头测试）返回 null */
const iconMemo = new Map<string, string>();
export function weaponIconURL(w: WeaponLook, px = 64, make?: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas): string | null {
  const P = weaponPaint(w); if (!P) return null;
  const key = `${w.kind}|${w.tier}|${w.form ?? ''}|${w.color ?? ''}|${px}`;
  const hit = iconMemo.get(key); if (hit) return hit;
  let cv: HTMLCanvasElement | null = null;
  if (make) cv = make(px, px) as HTMLCanvasElement;
  else if (typeof document !== 'undefined') { cv = document.createElement('canvas'); cv.width = px; cv.height = px; }
  if (!cv || typeof (cv as HTMLCanvasElement).toDataURL !== 'function') return null;
  const g = cv.getContext('2d') as CanvasRenderingContext2D | null; if (!g) return null;
  const sp = weaponSpan(P.form), len = sp.uTip - sp.uMin;
  const diag = px * 1.26;   // 沿对角线摆
  const S = diag / len, ux = Math.SQRT1_2, uy = -Math.SQRT1_2;
  const mid = (sp.uTip + sp.uMin) / 2;
  const A: WeaponAxis = { ox: px / 2 - ux * S * mid, oy: px / 2 - uy * S * mid, ax: ux * S, ay: uy * S, ex: -uy * S, ey: ux * S, S };
  // 淡淡的光底（品阶高的带一点流光色）
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  gr.addColorStop(0, rgba(P.glow > 0 ? P.glowColor : '#fff2d8', 0.16 + P.glow * 0.25)); gr.addColorStop(1, rgba(P.glow > 0 ? P.glowColor : '#fff2d8', 0));
  g.fillStyle = gr; g.fillRect(0, 0, px, px);
  // 长兵器太细：图标里把杆加粗一点（只改图标的比例，不改人物手里的）
  const thick = P.form === 'qiang' || P.form === 'gun' ? 2.1 : P.form === 'lian' ? 1.25 : P.form === 'hammer' ? 1.6 : P.form === 'dao' ? 1.15 : 1.35;
  const A2: WeaponAxis = { ...A, ex: A.ex * thick, ey: A.ey * thick };
  g.save();
  const S2 = S * thick;
  paintWeapon(g, P, { ...A2, S: S2 }, { lw: Math.max(0.8, px / 64), fine: true, t: 0.9, tassel: true });
  g.restore();
  const url = (cv as HTMLCanvasElement).toDataURL();
  iconMemo.set(key, url);
  return url;
}
