// P10：城里的立体构件（院落、铺面、城墙、城门楼、角楼、钟鼓楼、桥、坛、码头、摊位车马……）。用 registerPiece 登记，kind 以 c 开头免得和别处重名。
// 约定：构件参数是世界单位；本地坐标正面朝 +z（锚点在正面中点、脚下地面 y=0），构件向 -z 伸；
// 先拼进一个临时的 ArchBuilder，再按 p.r（0 面南、1 面东、2 面北、3 面西）转过去并进这处地点的网格（ArchBuilder.append）。
// 民居一律低面数：几个四边面拼的两坡顶（瓦垄由着色器按 quad 的 tiled 画），檐角起翘、正脊、封檐板、博风；窗纸夜里会亮（glowQuad）。
// 地域样式（L.cityStyle）和贫富（p.wl）决定配色和做法：富户青瓦白墙、门楼带红门；穷巷灰瓦土墙矮屋；边城夯土平顶；寒渊雪顶……
// 匾额、招牌、幌子上的字记在 builder.plaques 上（cityText.ts 印字），buildings.ts 另做贴字的网格。
import { registerPiece, type PieceCtx } from './pieceKinds';
import { ArchBuilder, shadeOf, type ArchPalette } from './arch';
import { mulberry32 } from '../core/rng';
import type { Plaque, PlaqueKind } from './cityText';

type P = Record<string, any>;
type V = readonly number[];
type PB = ArchBuilder & { plaques?: Plaque[] };
const pool: PB[] = [];
let depth = 0;
/** 临时拼构件用的 ArchBuilder（可嵌套：院落里转方向的厢房要再套一层） */
function tmp(): PB { let b = pool[depth]; if (!b) { b = pool[depth] = new ArchBuilder(); b.roofDetail = 0.5; } depth++; b.clear(); b.plaques = []; return b; }
function done() { depth--; }
/** 把 T（本地坐标）转向、平移后并进 B，连同上面的匾 */
function app(B: PB, T: PB, rot: number, x: number, y: number, z: number) {
  B.append(T, rot, x, y, z);
  if (!T.plaques?.length) return;
  const r = ((rot % 4) + 4) % 4;
  B.plaques ??= [];
  for (const q of T.plaques) {
    const p: number[] = [];
    for (let i = 0; i < 12; i += 3) {
      const px = q.p[i], pz = q.p[i + 2];
      const wx = r === 0 ? px : r === 1 ? pz : r === 2 ? -px : -pz, wz = r === 0 ? pz : r === 1 ? -px : r === 2 ? -pz : px;
      p.push(wx + x, q.p[i + 1] + y, wz + z);
    }
    B.plaques.push({ ...q, p });
  }
}
/** 正面朝 +z 的匾（x0..x1, y0..y1，在 z 平面上） */
function plaque(B: PB, x0: number, x1: number, y0: number, y1: number, z: number, text: string, kind: PlaqueKind = 'board', color?: string) {
  if (!text) return;
  (B.plaques ??= []).push({ p: [x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z], text, kind, color });
}

// ---------------------------------------------------------------- 配色（地域样式 × 贫富）
const ROOFS = ['#565c64', '#5c6066', '#50565e', '#5f6262', '#585a5e', '#4e545a'];
const PLASTER = ['#e6dfcf', '#ddd4c0', '#e9e2d2', '#d8cdb6'];
const BRICK = ['#8f8b82', '#9a958a', '#878379', '#a09a8c'];
const WOOD = ['#6e4630', '#7a5034', '#5e3c28', '#7c4a2c'];
const PAPER = '#dccb9c', DOOR = '#4a2a1c', RIDGE = '#3a3e44', STONE = '#a8a296', DARK = '#2c2622';
const cache = new Map<string, string>();
const sh = (c: string, k: number) => { const key = c + k; let v = cache.get(key); if (!v) { v = shadeOf(c, k); cache.set(key, v); } return v; };
const mix = (a: string, b: string, t: number) => { const key = a + b + t.toFixed(2); let v = cache.get(key); if (!v) { const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); v = '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join(''); cache.set(key, v); } return v; };

/** 一户人家的配色：屋瓦、墙、院墙（砖）、木作、做法 */
interface CP { roof: string; wall: string; brick: string; wood: string; flat: boolean; snow: boolean; red: boolean; low: number; orn: boolean }
type StyleId = 'central' | 'jin' | 'frontier' | 'isle' | 'demon' | 'ember' | 'nether' | 'frost' | 'spiritwood';
const SP: Record<StyleId, { roof: string[]; wall: string[]; brick: string[]; wood: string[]; rich: string; poor: string; poorWall: string; flat?: boolean; snow?: boolean }> = {
  central: { roof: ROOFS, wall: PLASTER, brick: BRICK, wood: WOOD, rich: '#4a5666', poor: '#6a665e', poorWall: '#c2b08c' },
  jin: { roof: ['#4a4e56', '#50545c', '#46494f'], wall: ['#a29e96', '#9a968e', '#aaa69c'], brick: ['#8a8680', '#827e78', '#908c84'], wood: ['#5a3c2a', '#6a4430'], rich: '#424c5a', poor: '#5e5c58', poorWall: '#9a948a' },
  frontier: { roof: ['#a88a5c', '#b0946a', '#9c8058'], wall: ['#c8ae80', '#bea070', '#cbb48a'], brick: ['#b89a6a', '#ae9060'], wood: ['#6a4a30', '#7a5636'], rich: '#9a7a50', poor: '#b09468', poorWall: '#c4a878', flat: true },
  isle: { roof: ['#5a6a6c', '#56666a', '#62706e'], wall: ['#eeeae0', '#e4ded0', '#c8c0b0'], brick: ['#a8a49a', '#b0aaa0'], wood: ['#6a5040', '#5a4436'], rich: '#4e6264', poor: '#6e7470', poorWall: '#c4bcac' },
  demon: { roof: ['#3a2c2e', '#4a2a2a', '#36282c'], wall: ['#6a5450', '#5e4a48', '#725a54'], brick: ['#4a3a3a', '#54403e'], wood: ['#5a1a14', '#4a1612'], rich: '#4a1e1e', poor: '#3e3434', poorWall: '#5a4a44' },
  ember: { roof: ['#7a3a28', '#843f2a', '#6e3424'], wall: ['#9a6a50', '#a07058', '#8e604a'], brick: ['#7a4a3a', '#6e4234'], wood: ['#4a2418', '#5a2c1c'], rich: '#8a3020', poor: '#6a4434', poorWall: '#8a6a54' },
  nether: { roof: ['#2a2c38', '#30303e', '#262834'], wall: ['#585468', '#4e4a5e', '#605c70'], brick: ['#3e3c4a', '#44424e'], wood: ['#2a2a3a', '#32303e'], rich: '#262a40', poor: '#3a3a44', poorWall: '#4a4656' },
  frost: { roof: ['#c8d4dc', '#d0dae2', '#bccad4'], wall: ['#e8ecf0', '#dfe4ea', '#eef0f2'], brick: ['#a8b0b8', '#b0b8c0'], wood: ['#5a4a40', '#4e4038'], rich: '#c0ccd8', poor: '#b8c2c8', poorWall: '#c8ccd0', snow: true },
  spiritwood: { roof: ['#4a6a4a', '#527050', '#466444'], wall: ['#d8d2b0', '#d0caa6', '#ddd8b8'], brick: ['#8a8a6a', '#7e7e60'], wood: ['#5a4a2a', '#4e4024'], rich: '#3e6a50', poor: '#5a6a4e', poorWall: '#c0b890' },
};
function cpal(c: PieceCtx, p: P, rnd: () => number): CP {
  const st = ((c.layout as { cityStyle?: StyleId }).cityStyle ?? 'central') as StyleId, S = SP[st] ?? SP.central;
  const wl = (p.wl as number) ?? 0.5, pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  let roof = pick(S.roof);
  // P10 收尾：富区、穷区的屋顶颜色再拉开一点（远看一眼分得出：富区青灰偏蓝、穷区灰褐）
  roof = wl > 0.68 ? mix(roof, S.rich, 0.75) : wl < 0.32 ? mix(roof, S.poor, 0.8) : roof;
  roof = sh(roof, (rnd() - 0.5) * 0.12);   // 一户一点深浅
  const wall = wl < 0.32 ? mix(pick(S.wall), S.poorWall, 0.75) : wl > 0.68 ? sh(pick(S.wall), 0.08) : pick(S.wall);
  const brick = wl < 0.32 ? mix(pick(S.brick), S.poorWall, 0.6) : pick(S.brick);
  return { roof, wall, brick, wood: pick(S.wood), flat: !!S.flat, snow: !!S.snow, red: wl > 0.68 || rnd() < 0.15, low: wl < 0.32 ? 0.86 : 1, orn: wl > 0.6 };
}

// ---------------------------------------------------------------- 小件
/** 正面朝 +z 的竖直矩形（x0..x1, y0..y1，在 z 平面上） */
function fq(B: ArchBuilder, x0: number, x1: number, y0: number, y1: number, z: number, c: string) { B.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c); }
function gq(B: ArchBuilder, x0: number, x1: number, y0: number, y1: number, z: number, c: string) { B.glowQuad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], c); }
/** 朝 -z 的竖直矩形 */
function bq(B: ArchBuilder, x0: number, x1: number, y0: number, y1: number, z: number, c: string) { B.quad([x1, y0, z], [x0, y0, z], [x0, y1, z], [x1, y1, z], c); }
/** 窗：木框 + 窗棂（几道竖条）+ 窗纸（夜里亮或不亮） */
function window_(B: ArchBuilder, cx: number, ww: number, y0: number, y1: number, z: number, wood: string, lit: boolean) {
  fq(B, cx - ww / 2 - 5, cx + ww / 2 + 5, y0 - 4, y1 + 4, z, wood);
  if (lit) gq(B, cx - ww / 2, cx + ww / 2, y0, y1, z + 0.3, PAPER); else fq(B, cx - ww / 2, cx + ww / 2, y0, y1, z + 0.3, sh(PAPER, -0.14));
  const n = Math.max(2, Math.round(ww / 12));
  for (let i = 1; i < n; i++) { const x = cx - ww / 2 + ww * i / n; fq(B, x - 1, x + 1, y0, y1, z + 0.6, sh(wood, -0.2)); }
  fq(B, cx - ww / 2, cx + ww / 2, (y0 + y1) / 2 - 1, (y0 + y1) / 2 + 1, z + 0.6, sh(wood, -0.2));
}

interface HouseOpt {
  roof: string; wall: string; wood: string; base?: number; lit?: boolean; door?: boolean; win?: number;
  /** 两层（铺面）：腰檐 + 楼上一排窗 */
  two?: boolean; open?: boolean; rise?: number; ridgeOrn?: boolean; tile?: number; gran?: boolean; side?: string;
  flat?: boolean; snow?: boolean; flare?: number; red?: boolean;
}
/**
 * 两坡顶的屋：x 居中宽 w，正面在 z=0、向后 d，墙高 h（台基 base 之上）。
 * 屋面、正脊、封檐板、博风、山墙三角；正面门、窗（窗纸夜里亮）、柱。边城的是平顶。
 */
function house(B: PB, w: number, d: number, h: number, o: HouseOpt) {
  const base = o.base ?? 10, zm = -d / 2;
  if (base > 0) { B.box(0, base / 2, zm, w + 14, base, d + 14, STONE); }
  const y0 = base, ye = base + h;
  if (o.open) {
    // 敞廊：只有柱子和后墙
    const n = Math.max(2, Math.round(w / 110));
    for (let i = 0; i <= n; i++) { const x = -w / 2 + 6 + (w - 12) * i / n; B.box(x, y0 + h / 2, -6, 10, h, 10, o.wood); }
    B.box(0, y0 + h / 2, -d + 8, w, h, 14, o.wall);
    B.box(0, ye - 8, -d / 2, w, 16, d, sh(o.wood, -0.2));
  } else {
    B.box(0, y0 + h / 2, zm, w, h, d, o.wall);
    // 正面：下碱（砖色）、柱、门、窗、额枋
    const f = 0.7;
    fq(B, -w / 2, w / 2, y0, y0 + h * 0.22, f, sh(o.side ?? '#8f8b82', -0.05));
    const doorW = Math.min(w * 0.22, 64), winN = o.win ?? (w > 260 ? 2 : 1);
    if (o.door !== false) { fq(B, -doorW / 2 - 6, doorW / 2 + 6, y0, y0 + h * 0.8, f + 0.2, o.wood); fq(B, -doorW / 2, doorW / 2, y0, y0 + h * 0.74, f + 0.4, o.red ? '#6a2018' : DOOR); fq(B, -1, 1, y0, y0 + h * 0.74, f + 0.6, sh(DOOR, -0.3)); }
    const span = (w / 2 - doorW / 2 - 14) / Math.max(1, winN);
    for (let i = 0; i < winN; i++) for (const s of [-1, 1]) {
      const cx = s * (doorW / 2 + 10 + span * (i + 0.5)), ww = Math.min(span * 0.7, h * 0.5);
      window_(B, cx, ww, y0 + h * 0.34, y0 + h * 0.72, f + 0.2, o.wood, !!o.lit);
    }
    for (const s of [-1, 1]) fq(B, s * w / 2 - (s > 0 ? 12 : 0), s * w / 2 + (s < 0 ? 12 : 0), y0, ye, f + 0.1, o.wood);
    fq(B, -w / 2, w / 2, ye - h * 0.12, ye, f + 0.3, sh(o.wood, -0.25));
    if (o.gran) for (let x = -w / 2 + 60; x < w / 2 - 40; x += 90) fq(B, x, x + 26, ye - h * 0.45, ye - h * 0.25, f + 0.3, DARK);
  }
  if (o.two) {
    // 腰檐：一条窄的瓦坡；楼上一排窗
    const ym = y0 + h * 0.5, oz = 34;
    B.quad([-w / 2 - 6, ym - 10, oz], [w / 2 + 6, ym - 10, oz], [w / 2 + 6, ym + 8, 0], [-w / 2 - 6, ym + 8, 0], o.roof, true, o.tile ?? 13);
    fq(B, -w / 2 - 6, w / 2 + 6, ym - 15, ym - 10, oz, sh(o.roof, -0.4));
    const n = Math.max(2, Math.round(w / 90));
    for (let i = 0; i < n; i++) { const cx = -w / 2 + (i + 0.5) * w / n; window_(B, cx, w / n * 0.62, ym + 22, ye - h * 0.17, 1.0, o.wood, !!o.lit || i % 2 === 0); }
  }
  if (o.flat) flatRoof(B, w, d, ye, o); else roof(B, w, d, ye, o);
}
/** 边城的平顶：一层厚土顶，四周一圈矮女儿墙，正面一道短挑檐 */
function flatRoof(B: ArchBuilder, w: number, d: number, ye: number, o: HouseOpt) {
  B.box(0, ye + 8, -d / 2, w + 16, 16, d + 16, sh(o.wall, -0.08));
  B.box(0, ye + 24, -d - 2, w + 16, 16, 12, sh(o.wall, -0.04));
  for (const s of [-1, 1]) B.box(s * (w / 2 + 2), ye + 24, -d / 2, 12, 16, d + 16, sh(o.wall, -0.04));
  B.quad([-w / 2 - 10, ye + 2, 34], [w / 2 + 10, ye + 2, 34], [w / 2 + 10, ye + 12, 0], [-w / 2 - 10, ye + 12, 0], o.roof);
  for (let x = -w / 2 + 30; x < w / 2 - 20; x += 46) B.box(x, ye + 6, 8, 6, 6, 18, sh(o.wood, -0.1));   // 椽头
}
/** 两坡顶（正脊沿 x）：ye 是檐口高度。flare：檐角起翘的高度（民居小、富户和殿堂大） */
function roof(B: ArchBuilder, w: number, d: number, ye: number, o: { roof: string; wall?: string; rise?: number; ridgeOrn?: boolean; tile?: number; flare?: number; snow?: boolean }) {
  const zm = -d / 2, rise = o.rise ?? d * 0.4, yr = ye + rise, ox = 14, oz = Math.min(40, d * 0.22), X = w / 2 + ox;
  const k = rise / (d / 2), zf = oz, zb = -d - oz, yE = ye - oz * k, tile = o.tile ?? 14, edge = sh(o.roof, -0.38);
  const L = o.flare ?? Math.min(12, w * 0.03), e = Math.min(X * 0.3, 60);   // 两端起翘的那一截
  const rc = o.snow ? '#e8eef2' : o.roof, rc2 = o.snow ? '#dce4ea' : sh(o.roof, -0.06);
  // 前坡：中段平直、两端翘起（三块）
  B.quad([-X + e, yE, zf], [X - e, yE, zf], [X - e, yr, zm], [-X + e, yr, zm], rc, true, tile);
  B.quad([-X, yE + L, zf + L * 0.4], [-X + e, yE, zf], [-X + e, yr, zm], [-X, yr + L * 0.25, zm], rc, true, tile);
  B.quad([X - e, yE, zf], [X, yE + L, zf + L * 0.4], [X, yr + L * 0.25, zm], [X - e, yr, zm], rc, true, tile);
  // 后坡
  B.quad([X - e, yE, zb], [-X + e, yE, zb], [-X + e, yr, zm], [X - e, yr, zm], rc2, true, tile);
  B.quad([X, yE + L, zb - L * 0.4], [X - e, yE, zb], [X - e, yr, zm], [X, yr + L * 0.25, zm], rc2, true, tile);
  B.quad([-X + e, yE, zb], [-X, yE + L, zb - L * 0.4], [-X, yr + L * 0.25, zm], [-X + e, yr, zm], rc2, true, tile);
  // 山墙三角
  const wall = o.wall ?? '#d8d0bc';
  B.tri([w / 2, ye, 0], [w / 2, ye, -d], [w / 2, yr - 2, zm], wall);
  B.tri([-w / 2, ye, -d], [-w / 2, ye, 0], [-w / 2, yr - 2, zm], wall);
  // 封檐板（前后，中段）、博风（两侧斜边）
  const t = Math.max(5, d * 0.035);
  fq(B, -X + e, X - e, yE - t, yE, zf, edge);
  bq(B, -X + e, X - e, yE - t, yE, zb, edge);
  B.quad([X, yE + L - t, zf + L * 0.4], [X, yr - t, zm], [X, yr, zm], [X, yE + L, zf + L * 0.4], edge);
  B.quad([X, yr - t, zm], [X, yE + L - t, zb - L * 0.4], [X, yE + L, zb - L * 0.4], [X, yr, zm], edge);
  B.quad([-X, yr - t, zm], [-X, yE + L - t, zf + L * 0.4], [-X, yE + L, zf + L * 0.4], [-X, yr, zm], edge);
  B.quad([-X, yE + L - t, zb - L * 0.4], [-X, yr - t, zm], [-X, yr, zm], [-X, yE + L, zb - L * 0.4], edge);
  // 正脊：两头微微翘起；殿堂、富户加鸱吻
  // P10 收尾：正脊加粗一档（镜头最远时屋顶块之间看得出一道道屋脊线）
  const rh = Math.max(11, d * 0.085), rcol = o.snow ? '#f4f6f8' : RIDGE;
  B.box(0, yr + rh / 2 - 2, zm, X * 2 - 20, rh, rh * 1.1, rcol);
  for (const s of [-1, 1]) B.quad([s * (X - 12), yr - 2, zm + rh * 0.55], [s * (X + 4), yr + rh * 0.4, zm + rh * 0.55], [s * (X + 4), yr + rh * 1.6, zm + rh * 0.55], [s * (X - 12), yr + rh - 2, zm + rh * 0.55], rcol);
  if (o.ridgeOrn) for (const s of [-1, 1]) {
    B.box(s * (X - 6), yr + rh * 1.3, zm, rh * 1.2, rh * 2.4, rh * 1.2, sh(RIDGE, 0.15));
    B.box(s * (X - 6 - rh * 0.5), yr + rh * 2.6, zm, rh * 1.6, rh * 0.7, rh, sh(RIDGE, 0.15));
  }
}
/** 院墙一段（本地，沿 x 从 x0 到 x1，在 z 处），顶上两坡瓦帽 */
function wallX(B: ArchBuilder, x0: number, x1: number, z: number, h: number, t: number, col: string, cap: string) {
  if (x1 - x0 < 2) return;
  const cx = (x0 + x1) / 2, L = x1 - x0;
  B.box(cx, h / 2, z, L, h, t, col);
  B.box(cx, 9, z, L + 1, 18, t + 4, sh(col, -0.12));   // 墙根
  const ov = 8, ry = h + 14;
  B.quad([x0 - 2, h - 2, z + t / 2 + ov], [x1 + 2, h - 2, z + t / 2 + ov], [x1 + 2, ry, z], [x0 - 2, ry, z], cap, true, 11);
  B.quad([x1 + 2, h - 2, z - t / 2 - ov], [x0 - 2, h - 2, z - t / 2 - ov], [x0 - 2, ry, z], [x1 + 2, ry, z], sh(cap, -0.06), true, 11);
}
function wallZ(B: ArchBuilder, x: number, z0: number, z1: number, h: number, t: number, col: string, cap: string) {
  if (z1 - z0 < 2) return;
  const cz = (z0 + z1) / 2, L = z1 - z0;
  B.box(x, h / 2, cz, t, h, L, col);
  B.box(x, 9, cz, t + 4, 18, L + 1, sh(col, -0.12));
  const ov = 8, ry = h + 14;
  B.quad([x + t / 2 + ov, h - 2, z1 + 2], [x + t / 2 + ov, h - 2, z0 - 2], [x, ry, z0 - 2], [x, ry, z1 + 2], cap, true, 11);
  B.quad([x - t / 2 - ov, h - 2, z0 - 2], [x - t / 2 - ov, h - 2, z1 + 2], [x, ry, z1 + 2], [x, ry, z0 - 2], sh(cap, -0.06), true, 11);
}
/** 把一座屋（本地正面朝 +z）转个方向放进 B：锚点 (x, z)，rot 见文件头 */
function placeHouse(B: PB, rot: number, x: number, z: number, w: number, d: number, h: number, o: HouseOpt) {
  const T = tmp(); house(T, w, d, h, o); app(B, T, rot, x, 0, z); done();
}
/** 门楼：院墙上的一座小门，带两坡小顶；富户红门、门簪、门墩 */
function gatehouse(B: PB, x: number, z: number, w: number, h: number, cp: { roof: string; wood: string; red: boolean; flat?: boolean; snow?: boolean; wall?: string; open?: boolean }, name = '') {
  for (const s of [-1, 1]) B.box(x + s * (w / 2 - 10), h / 2, z, 20, h, 40, sh(cp.wood, -0.1));
  if (cp.open) {
    // 敞着的门：两扇门板向里推开，贴着门框；门槛
    const lw = (w - 40) / 2;
    for (const s of [-1, 1]) B.box(x + s * (w / 2 - 24), h * 0.41, z - 8 - lw / 2, 5, h * 0.82, lw, cp.red ? '#7a2a20' : DOOR);
    B.box(x, 4, z, w - 40, 8, 10, sh(cp.wood, -0.2));
  } else {
    fq(B, x - w / 2 + 20, x + w / 2 - 20, 0, h * 0.82, z - 6, cp.red ? '#7a2a20' : DOOR);
    fq(B, x - 1, x + 1, 0, h * 0.82, z - 5.5, DARK);
  }
  for (const s of [-1, 1]) { B.box(x + s * (w / 2 - 26), 10, z + 24, 14, 20, 16, STONE); B.box(x + s * 14, h * 0.74, z - 5, 6, 6, 4, '#c8a050'); }
  B.box(x, h * 0.92, z, w, h * 0.16, 44, sh(cp.wood, -0.25));
  if (name) plaque(B, x - w * 0.32, x + w * 0.32, h * 0.86, h * 1.0, z + 23, name, 'board');
  if (cp.flat) { B.box(x, h + 8, z, w + 20, 16, 56, sh(cp.wall ?? '#c8ae80', -0.08)); return; }
  const T = tmp(); roof(T, w + 16, 60, 0, { roof: cp.roof, rise: 26, tile: 11, flare: 8, snow: cp.snow }); app(B, T, 0, x, h, z + 30); done();
}

// ---------------------------------------------------------------- 院落
function court(B: PB, p: P, rnd: () => number, cp: CP) {
  const w = p.w as number, d = p.d as number, k = p.k as string;
  const yellow = p.roof === '#c8a030';
  const roofC = p.roof || cp.roof;
  const wall = cp.wall, brick = cp.brick, wood = cp.wood;
  const capC = cp.snow ? '#e4eaee' : sh(roofC, -0.08), wallC = yellow ? '#a8402e' : brick;
  const gx = (p.gx as number) || 1;
  if (k === 'big') {
    // 大宅：左边两进主院，右边一座跨院
    const wl = Math.round(w * 0.6);
    const T = tmp(); court(T, { ...p, w: wl, k: 'two', roof: roofC }, rnd, cp); app(B, T, 0, -w / 2 + wl / 2, 0, 0); done();
    const T2 = tmp(); court(T2, { ...p, w: w - wl, k: 'one', roof: roofC, gx: 1 }, rnd, cp); app(B, T2, 0, w / 2 - (w - wl) / 2, 0, 0); done();
    return;
  }
  const inset = 8, wt = 22, wh = 104 * cp.low;
  const x0 = -w / 2 + inset, x1 = w / 2 - inset, zF = -inset, zB = -d + inset;
  // 院墙：正面开门
  const gW = 84, gX = gx * (w / 2 - inset - 70);
  wallX(B, x0, gX - gW / 2, zF, wh, wt, wallC, capC); wallX(B, gX + gW / 2, x1, zF, wh, wt, wallC, capC);
  wallX(B, x0, x1, zB, wh, wt, wallC, capC);
  wallZ(B, x0, zB, zF, wh, wt, wallC, capC); wallZ(B, x1, zB, zF, wh, wt, wallC, capC);
  gatehouse(B, gX, zF, gW + 34, 128 * cp.low, { roof: roofC, wood, red: cp.red || yellow || !!p.name, flat: cp.flat, snow: cp.snow, wall, open: !!p.open }, (p.name as string) || '');
  const lit = () => rnd() < (cp.orn ? 0.85 : 0.68);   // P10 收尾：夜里院落窗光加密（富户八成五、一般人家近七成）
  const fl = cp.orn ? 16 : 7;
  const ho = (extra: Partial<HouseOpt> = {}): HouseOpt => ({ roof: roofC, wall, wood, side: brick, lit: lit(), flat: cp.flat, snow: cp.snow, flare: fl, red: cp.red, ...extra });
  const hl = cp.low;
  if (k === 'one') {
    // 正房（北）、东西厢房、倒座（宽的院子才有）
    const dm = Math.min(180, d * 0.29), wm = w - 2 * inset - 2 * wt - (w > 560 ? 90 : 20);
    placeHouse(B, 0, 0, zB + wt / 2 + dm + 4, wm, dm, 120 * hl, ho({ ridgeOrn: cp.orn && w > 480 }));
    const L = d * 0.34, ds = Math.min(118, w * 0.21), zc = zB + wt + dm + (zF - zB - dm - wt * 2) * 0.48;
    placeHouse(B, 1, x0 + wt / 2 + ds, zc, L, ds, 100 * hl, ho({ win: 1 }));
    if (w > 440) placeHouse(B, 3, x1 - wt / 2 - ds, zc, L, ds, 100 * hl, ho({ win: 1 }));
    if (d > 560 && w > 480) {
      const wd = w - 2 * inset - 2 * wt - 140, dd = 96, xd = -gx * 60;
      placeHouse(B, 2, xd, zF - wt / 2 - dd, wd, dd, 96 * hl, ho({ door: false, win: 2 }));
    }
    // P10 收尾：院里一棵树（富户、中等人家多半有，穷人家少）——远看屋顶块之间冒出一团团树冠
    if (rnd() < (cp.orn ? 0.85 : cp.low < 1 ? 0.3 : 0.6)) grove(B, [[gx * w * 0.12, zF - d * 0.5, 1.05 + rnd() * 0.35, rnd() < 0.2 ? 'c' : 'b']], rnd);
    // 院里：水缸、晾衣、花木盆
    const r = rnd();
    if (r < 0.3) laundry(B, (rnd() - 0.5) * w * 0.3, zF - d * 0.45);
    else if (r < 0.55) cyl(B, -gx * w * 0.2, 0, zF - d * 0.4, 18, 34, '#5a5a52', 8, '#3a4a50');
    return;
  }
  // 两进院：前院倒座 + 垂花门隔墙；里院正房、两厢；最后一排后罩房
  const zMid = zF - d * 0.3, dm = Math.min(190, d * 0.2);
  const wd = w - 2 * inset - 2 * wt - 130;
  placeHouse(B, 2, -gx * 50, zF - wt / 2 - 96, wd, 96, 96, ho({ door: false, win: 2 }));
  wallX(B, x0 + wt, -60, zMid, 90, 18, sh(wall, -0.05), capC); wallX(B, 60, x1 - wt, zMid, 90, 18, sh(wall, -0.05), capC);
  // 垂花门：两根红柱一个小顶
  for (const s of [-1, 1]) B.box(s * 50, 60, zMid, 12, 120, 12, '#8a2e24');
  if (!cp.flat) { const T = tmp(); roof(T, 140, 70, 0, { roof: roofC, rise: 28, tile: 10, flare: 10, snow: cp.snow }); app(B, T, 0, 0, 120, zMid + 35); done(); }
  const zR = zB + wt / 2 + 4, dr = 110;
  placeHouse(B, 0, 0, zR + dr, w - 2 * inset - 2 * wt - 10, dr, 104, ho({ win: 3 }));
  placeHouse(B, 0, 0, zR + dr + 30 + dm, w * 0.72, dm, 132, ho({ ridgeOrn: true, base: 18, flare: fl + 6 }));
  const L = (zMid - (zR + dr + 30 + dm)) * 0.7, ds = Math.min(122, w * 0.18), zc = (zMid + zR + dr + 30 + dm) / 2;
  placeHouse(B, 1, x0 + wt / 2 + ds, zc, L, ds, 104, ho({ win: 1 }));
  placeHouse(B, 3, x1 - wt / 2 - ds, zc, L, ds, 104, ho({ win: 1 }));
  // 里院一缸荷花、两盆花木
  cyl(B, 0, 0, zMid - 140, 22, 36, '#6a6a60', 8, '#4a6a50');
  // P10 收尾：里院两侧各一棵树（远看是院里的树冠）
  if (rnd() < 0.8) grove(B, [[-w * 0.17, zMid - 120, 1.1 + rnd() * 0.3, 'b'], [w * 0.17, zMid - 160, 1.0 + rnd() * 0.3, rnd() < 0.3 ? 'c' : 'b']], rnd);
}

// ---------------------------------------------------------------- 铺面（前店后宅）
const GOODS = ['#c8a050', '#9a6a3a', '#7a8a4a', '#c86a3a', '#d8c8a0', '#6a7a8a', '#a8432f'];
/** 幌子上的字：取行当的头一个字（酒肆 → 酒） */
const BANNER: Record<string, string> = { 布: '布', 茶: '茶', 米: '米', 药: '药', 酒: '酒', 当: '当', 杂: '杂货', 绸: '绸缎', 书: '书', 油: '油', 香: '香烛', 铁: '铁', 饭: '饭', 果: '果子', 漆: '漆', 瓷: '瓷', 粮: '粮', 鞋: '鞋帽', 丹: '丹药', 客: '客栈', 坊: '坊市', 法: '法器', 符: '符箓', 拍: '拍卖' };
function shop(B: PB, p: P, rnd: () => number, cp: CP) {
  const w = p.w as number, d = p.d as number;
  const roofC = cp.roof, wood = cp.wood, wall = cp.wall;
  const two = !!p.two, fd = Math.min(250, d * 0.48), h = (two ? 236 : 132) * (cp.low < 1 ? 0.92 : 1);
  const fw = w - 14, name = (p.name as string) || '';
  // 前店：正面一排木板门，开着中间几扇（暗）；上头一溜格子窗；柜台
  B.box(0, 6, -fd / 2, fw + 10, 12, fd + 10, STONE);
  B.box(0, 12 + h / 2, -fd / 2, fw, h, fd, wall);
  const panels = Math.max(3, Math.round(fw / 46)), y0 = 12, yh = two ? h * 0.46 : h * 0.8;
  for (let i = 0; i < panels; i++) {
    const x = -fw / 2 + (i + 0.5) * fw / panels, pw = fw / panels;
    const openP = i > 0 && i < panels - 1 && i % 3 !== 0;
    fq(B, x - pw / 2 + 1.5, x + pw / 2 - 1.5, y0, y0 + yh * 0.78, 0.6, openP ? '#2e2420' : sh(wood, i % 2 ? 0.06 : -0.04));
    if (openP && rnd() < 0.6) gq(B, x - pw / 2 + 6, x + pw / 2 - 6, y0 + yh * 0.3, y0 + yh * 0.7, 0.9, '#e8c890');
    // 门上方的横披窗
    window_(B, x, pw - 10, y0 + yh * 0.82, y0 + yh * 0.97, 0.7, wood, i % 2 === 0);
  }
  fq(B, -fw / 2, fw / 2, y0 + yh, y0 + yh + 10, 0.9, sh(wood, -0.3));
  B.box(0, 22, 26, fw * 0.6, 32, 20, sh(wood, 0.05));
  for (const s of [-1, 1]) B.box(s * fw / 2, 12 + h / 2, 0, 12, h, 12, sh(wood, -0.15));
  if (two) {
    const ym = y0 + h * 0.5, oz = 36;
    B.quad([-fw / 2 - 8, ym - 12, oz], [fw / 2 + 8, ym - 12, oz], [fw / 2 + 8, ym + 8, 0], [-fw / 2 - 8, ym + 8, 0], cp.snow ? '#e4eaee' : roofC, true, 13);
    fq(B, -fw / 2 - 8, fw / 2 + 8, ym - 17, ym - 12, oz, sh(roofC, -0.4));
    // 楼上：栏杆（望柱 + 横栏）+ 窗
    fq(B, -fw / 2, fw / 2, ym + 10, ym + 34, 8, sh(wood, -0.1));
    for (let x = -fw / 2 + 10; x < fw / 2; x += 34) fq(B, x - 2, x + 2, ym + 8, ym + 40, 8.5, sh(wood, -0.3));
    const n = Math.max(2, Math.round(fw / 80));
    for (let i = 0; i < n; i++) { const cx = -fw / 2 + (i + 0.5) * fw / n; window_(B, cx, fw / n * 0.66, ym + 44, y0 + h - 22, 0.8, wood, rnd() < 0.7); }
  }
  // 店招（匾）：店名
  const sy = two ? y0 + h * 0.5 + 8 : y0 + yh + 12, sh2 = Math.min(44, fw * 0.14);
  plaque(B, -Math.min(fw * 0.38, 150), Math.min(fw * 0.38, 150), sy, sy + sh2, 2.5, name, p.fn ? 'gold' : 'board');
  if (cp.flat) flatRoof(B, fw, fd, 12 + h, { roof: roofC, wall, wood });
  else { const T = tmp(); roof(T, fw, fd, 0, { roof: roofC, wall, rise: fd * 0.4, ridgeOrn: two, flare: two ? 16 : 9, snow: cp.snow }); app(B, T, 0, 0, 12 + h, 0); done(); }
  // 凉棚：两根竹竿撑一块布，斜伸到街上
  const awn = p.awn as string, aw = fw * (0.55 + rnd() * 0.3), ax = (rnd() - 0.5) * (fw - aw) * 0.6, ah = two ? y0 + h * 0.42 : y0 + h * 0.72, out = 110 + rnd() * 50;
  B.quad([ax - aw / 2, ah - 46, out], [ax + aw / 2, ah - 46, out], [ax + aw / 2, ah, 4], [ax - aw / 2, ah, 4], awn);
  B.quad([ax + aw / 2, ah - 46, out], [ax - aw / 2, ah - 46, out], [ax - aw / 2, ah, 4], [ax + aw / 2, ah, 4], sh(awn, -0.35));
  // 布沿一道垂边，画出几道褶
  fq(B, ax - aw / 2, ax + aw / 2, ah - 62, ah - 46, out, sh(awn, -0.1));
  for (let x = ax - aw / 2 + 20; x < ax + aw / 2; x += 40) fq(B, x - 1.5, x + 1.5, ah - 62, ah - 46, out + 0.3, sh(awn, -0.3));
  for (const s of [-1, 1]) B.box(ax + s * (aw / 2 - 3), (ah - 46) / 2, out - 3, 5, ah - 46, 5, '#8a7050');
  // 招幌：一根挑出的杆子挂一条长幡，幡上写行当
  if (p.ban) {
    const bx = (rnd() < 0.5 ? -1 : 1) * (fw / 2 - 18), top = 12 + h + 40;
    B.box(bx, top, 36, 6, 6, 80, DARK);
    B.box(bx, top / 2 + 6, 70, 5, top, 5, '#5a4030');
    const trade = name.replace(/^.+?[记家]/, ''), t = BANNER[trade[0]] ?? trade.slice(0, 2);
    const yb = top - 180, ye2 = top - 8;
    // P4：幡布随风摆（上沿系在挑杆上不动，越往下摆得越开）
    B.swayQuad([bx + 1, yb, 50], [bx + 1, yb, 74], [bx + 1, ye2, 74], [bx + 1, ye2, 50], p.ban, [1, 1, 0, 0]);
    B.swayQuad([bx - 1, yb, 74], [bx - 1, yb, 50], [bx - 1, ye2, 50], [bx - 1, ye2, 74], sh(p.ban, -0.2), [1, 1, 0, 0]);
    const swy = (y: number) => (ye2 - y) / (ye2 - yb), sw0 = swy(yb + 8), sw1 = swy(ye2 - 8);
    // 幡上的字（两面都朝外）：本地 +x、-x 两面各一块竖幅
    if (t) {
      (B.plaques ??= []).push({ p: [bx + 1.6, yb + 8, 72, bx + 1.6, yb + 8, 52, bx + 1.6, ye2 - 8, 52, bx + 1.6, ye2 - 8, 72], text: t, kind: 'banner', color: p.ban, sw: [sw0, sw0, sw1, sw1] });
      (B.plaques ??= []).push({ p: [bx - 1.6, yb + 8, 52, bx - 1.6, yb + 8, 72, bx - 1.6, ye2 - 8, 72, bx - 1.6, ye2 - 8, 52], text: t, kind: 'banner', color: p.ban, sw: [sw0, sw0, sw1, sw1] });
    }
    // 幡下的穗子
    fq(B, bx - 1, bx + 1, yb - 18, yb, 62, sh(p.ban, -0.3));
  }
  // 灯笼：檐下两盏（夜里亮）
  for (const s of [-1, 1]) { const lx = s * fw * 0.36, ly = two ? y0 + h * 0.46 : y0 + h - 30; B.box(lx, ly - 18, 16, 3, 16, 3, DARK); lanternBox(B, lx, ly - 40, 18, 15); }
  // 门口的货：筐、缸、布匹
  const g = p.goods as number;
  for (let i = 0; i < 3; i++) {
    const gxp = -fw * 0.4 + rnd() * fw * 0.8;
    if (Math.abs(gxp - ax) < 20 && i === 0) continue;
    const c = GOODS[(g + i) % GOODS.length];
    if (g % 2) B.box(gxp, 14, 52 + rnd() * 30, 30, 28, 30, c); else cyl(B, gxp, 0, 54 + rnd() * 30, 15, 30, c, 6);
  }
  // 后宅：一小院，一间屋；院墙
  const bd = Math.max(0, d - fd - 30);
  if (bd > 130) {
    const hd = Math.min(150, bd * 0.5);
    placeHouse(B, 0, 0, -d + 14 + hd, fw - 30, hd, 110 * cp.low, { roof: roofC, wall, wood, lit: rnd() < 0.5, base: 8, flat: cp.flat, snow: cp.snow, flare: 6 });
    const bc = cp.brick, cap = cp.snow ? '#e4eaee' : sh(roofC, -0.08);
    wallZ(B, -w / 2 + 10, -d + 8, -fd, 96, 18, bc, cap);
    wallZ(B, w / 2 - 10, -d + 8, -fd, 96, 18, bc, cap);
    wallX(B, -w / 2 + 10, w / 2 - 10, -d + 8, 96, 18, bc, cap);
    if (rnd() < 0.35) laundry(B, (rnd() - 0.5) * fw * 0.4, -fd - bd * 0.35);
  }
}

// ---------------------------------------------------------------- 杂件
function lanternBox(B: ArchBuilder, x: number, y: number, z: number, s: number) {
  B.box(x, y + s * 0.62, z, s * 0.5, s * 0.14, s * 0.5, DARK);
  const a = s / 2;
  // 四面会亮的红灯笼
  // P4：灯笼也随风轻轻晃（下沿晃得多、上沿少），入夜照样发光
  const lw: [number, number, number, number] = [0.3, 0.3, 0.1, 0.1];
  B.swayQuad([x - a, y - a, z + a], [x + a, y - a, z + a], [x + a, y + a, z + a], [x - a, y + a, z + a], '#c8402a', lw, true);
  B.swayQuad([x + a, y - a, z - a], [x - a, y - a, z - a], [x - a, y + a, z - a], [x + a, y + a, z - a], '#c8402a', lw, true);
  B.swayQuad([x + a, y - a, z + a], [x + a, y - a, z - a], [x + a, y + a, z - a], [x + a, y + a, z + a], '#b8382a', lw, true);
  B.swayQuad([x - a, y - a, z - a], [x - a, y - a, z + a], [x - a, y + a, z + a], [x - a, y + a, z - a], '#b8382a', lw, true);
  B.box(x, y + a + 2, z, s * 1.02, 3, s * 1.02, DARK);
}
/** 竖的多棱柱（缸、桶、井台、柱子） */
function cyl(B: ArchBuilder, x: number, y: number, z: number, r: number, h: number, c: string, n = 8, top?: string) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
    B.quad([p1[0], y, p1[1]], [p0[0], y, p0[1]], [p0[0], y + h, p0[1]], [p1[0], y + h, p1[1]], i % 2 ? c : sh(c, -0.06));
    B.tri([x, y + h, z], [p1[0], y + h, p1[1]], [p0[0], y + h, p0[1]], top ?? sh(c, 0.12));
  }
}
/** 圆锥（伞面、亭顶、柏树冠）：底半径 r 在 y，尖在 y+h */
function cone(B: ArchBuilder, x: number, y: number, z: number, r: number, h: number, c: string, n = 10) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    B.tri([x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], [x, y + h, z], i % 2 ? c : sh(c, -0.1));
  }
}
/** 一团（树冠）：上半截圆锥、下半截倒圆锥，八面 */
function blob(B: ArchBuilder, x: number, y: number, z: number, r: number, c: string) {
  const n = 8, up = r * 0.9, dn = r * 0.6;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const p0: V = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1: V = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r];
    B.tri(p1, p0, [x, y + up, z], i % 2 ? c : sh(c, 0.08));
    B.tri(p0, p1, [x, y - dn, z], sh(c, -0.2));
  }
}
/** 斜放的长条（马腿、车辕、轿杠）：从 a 到 b，截面 t×t */
function beam(B: ArchBuilder, a: V, b: V, t: number, c: string) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1;
  // 取一个和轴不平行的向量做两条法向
  const ux = dx / L, uy = dy / L, uz = dz / L;
  let px = -uz, py = 0, pz = ux; if (Math.hypot(px, pz) < 0.1) { px = 1; py = 0; pz = 0; }
  const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  const h = t / 2, c4 = (o: V, s1: number, s2: number) => [o[0] + (px * s1 + qx * s2) * h, o[1] + (py * s1 + qy * s2) * h, o[2] + (pz * s1 + qz * s2) * h];
  const A = [c4(a, -1, -1), c4(a, 1, -1), c4(a, 1, 1), c4(a, -1, 1)], Bb = [c4(b, -1, -1), c4(b, 1, -1), c4(b, 1, 1), c4(b, -1, 1)];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; B.quad(A[i], A[j], Bb[j], Bb[i], i % 2 ? c : sh(c, -0.12)); B.quad(A[j], A[i], Bb[i], Bb[j], i % 2 ? c : sh(c, -0.12)); }
}
function laundry(B: ArchBuilder, x: number, z: number) {
  for (const s of [-1, 1]) B.box(x + s * 70, 50, z, 5, 100, 5, '#6a5038');
  B.box(x, 98, z, 144, 2, 2, '#4a3a2a');
  const cols = ['#e8e4d8', '#4a6a8a', '#c8a080', '#8a4a3a'];
  for (let i = 0; i < 4; i++) { const cx = x - 54 + i * 36, c = cols[i]; B.quad([cx - 13, 54, z], [cx + 13, 54, z], [cx + 13, 97, z], [cx - 13, 97, z], c); B.quad([cx + 13, 54, z], [cx - 13, 54, z], [cx - 13, 97, z], [cx + 13, 97, z], sh(c, -0.2)); }
}
/**
 * 马 / 驴（朝 +x）：圆滚滚的身子（前后收窄的八面体）、斜伸的颈、长条的头、四条分两节的腿、尾巴、马鬃；
 * 马有鞍和缰绳，驴小一号、耳朵长、背上驮两个筐
 */
function animal(B: ArchBuilder, horse: boolean, col?: string) {
  const s = horse ? 1 : 0.8, c = col ?? (horse ? '#6a4a34' : '#7a7470'), dk = sh(c, -0.25);
  const L = 78 * s, H = 30 * s, W = 24 * s, leg = 46 * s, y = leg + H / 2;
  // 身子：中段一个盒子，前后两头收成楔形
  B.box(0, y, 0, L * 0.56, H, W, c);
  for (const sx of [-1, 1]) {
    const x0 = sx * L * 0.28, x1 = sx * L * 0.5;
    const a = (yy: number, zz: number): V => [x0, y + yy, zz], b = (yy: number, zz: number): V => [x1, y + yy * 0.7, zz * 0.7];
    const T = H / 2, Z = W / 2;
    const q = (p1: V, p2: V, p3: V, p4: V, cc: string) => { B.quad(p1, p2, p3, p4, cc); B.quad(p2, p1, p4, p3, cc); };   // 两面都画，免得转了方向看不见
    q(a(-T, Z), b(-T, Z), b(T, Z), a(T, Z), c); q(b(-T, -Z), a(-T, -Z), a(T, -Z), b(T, -Z), sh(c, -0.08));
    q(a(T, Z), b(T, Z), b(T, -Z), a(T, -Z), sh(c, 0.06)); q(b(-T, Z), a(-T, Z), a(-T, -Z), b(-T, -Z), dk);
    q(b(-T, Z), b(-T, -Z), b(T, -Z), b(T, Z), dk);
  }
  // 腿：大腿斜、小腿直，蹄子深色
  for (const [lx, lz] of [[-L * 0.32, -W * 0.32], [-L * 0.32, W * 0.32], [L * 0.3, -W * 0.32], [L * 0.3, W * 0.32]]) {
    beam(B, [lx, y - H * 0.2, lz], [lx + 4 * Math.sign(lx), leg * 0.5, lz], 9 * s, c);
    beam(B, [lx + 4 * Math.sign(lx), leg * 0.5, lz], [lx + 2 * Math.sign(lx), 4, lz], 7 * s, sh(c, -0.1));
    B.box(lx + 2 * Math.sign(lx), 3, lz, 9 * s, 6, 9 * s, '#2a2420');
  }
  // 颈、头
  const nx = L * 0.42, nTop: V = [L * 0.62, y + H * 1.55, 0];
  beam(B, [nx, y + H * 0.2, 0], nTop, 16 * s, c);
  beam(B, nTop, [L * 0.82, y + H * 1.05, 0], 13 * s, c);
  if (horse) for (let i = 0; i < 4; i++) B.box(nx + (nTop[0] - nx) * (i + 0.5) / 4 - 4, y + H * 0.6 + (nTop[1] - y - H * 0.6) * (i + 0.5) / 4 + 6, 0, 8, 10, 4, '#2a2018');   // 马鬃
  for (const sz of [-1, 1]) beam(B, [L * 0.6, y + H * 1.6, sz * 3], [L * 0.58, y + H * 1.6 + (horse ? 12 : 22) * s, sz * 5], horse ? 4 : 5, dk);   // 耳
  // 尾
  beam(B, [-L * 0.48, y + H * 0.3, 0], [-L * 0.58, y - H * 0.9, 0], horse ? 7 : 4, horse ? '#2a2018' : dk);
  if (horse) {
    B.box(-L * 0.04, y + H / 2 + 4, 0, 30, 8, W + 6, '#7a2a20');                // 鞍
    B.box(-L * 0.04, y + 2, W / 2 + 4, 4, H * 1.2, 4, '#3a2a20'); B.box(-L * 0.04, y + 2, -W / 2 - 4, 4, H * 1.2, 4, '#3a2a20');   // 镫带
    beam(B, [L * 0.8, y + H * 1.1, 0], [L * 1.25, y - 4, 0], 2, '#3a2a20');      // 缰绳拴在桩上
  } else for (const sz of [-1, 1]) B.box(-2, y + H * 0.2, sz * (W / 2 + 10), 30, 26, 14, '#a88a58');   // 驮筐
}
/** 板车：车厢（侧板、货）、两个辐条轮、长辕，辕头搁在地上 */
function cart(B: ArchBuilder) {
  B.box(0, 52, 0, 150, 8, 76, '#7a5a3a');
  for (const s of [-1, 1]) { B.box(0, 68, s * 36, 150, 24, 4, '#6a4a30'); for (let x = -64; x <= 64; x += 32) B.box(x, 68, s * 38, 5, 30, 5, '#5a3a24'); }
  B.box(-74, 68, 0, 4, 24, 76, '#6a4a30');
  // 车上的货：麻袋、筐、坛子
  B.box(-24, 72, -12, 56, 30, 40, '#c8b088'); B.box(-20, 96, 10, 40, 22, 30, '#d4c098'); cyl(B, 36, 56, 8, 16, 34, '#7a5a3a', 8); cyl(B, 36, 56, -20, 13, 28, '#9a6a3a', 8);
  // 轮子：外圈、轴、八根辐条（两面都有）
  for (const s of [-1, 1]) {
    const z = s * 46, r = 46, cy = 46;
    for (let i = 0; i < 12; i++) {
      const a0 = i / 12 * Math.PI * 2, a1 = (i + 1) / 12 * Math.PI * 2;
      beam(B, [Math.cos(a0) * r, cy + Math.sin(a0) * r, z], [Math.cos(a1) * r, cy + Math.sin(a1) * r, z], 7, '#4a3424');
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI; beam(B, [Math.cos(a) * r, cy + Math.sin(a) * r, z], [-Math.cos(a) * r, cy - Math.sin(a) * r, z], 4, '#5a4030'); }
    B.box(0, cy, z, 12, 12, 14, '#2a2018');
  }
  B.box(0, 46, 0, 8, 8, 100, '#3a2a1c');   // 轴
  // 车辕：两根长杆斜搁到地上
  for (const s of [-1, 1]) beam(B, [70, 52, s * 26], [190, 8, s * 22], 7, '#6a4a30');
  B.box(186, 6, 0, 8, 8, 52, '#5a4030');
}
/** 轿子：轿厢（四壁、轿窗、门帘）、攒尖的轿顶带宝顶、两根长轿杠搁在凳上 */
function sedan(B: PB) {
  const c = '#3e5a4a', r = '#7a2a20';
  B.box(0, 74, 0, 60, 92, 54, c);
  fq(B, -20, 20, 34, 104, 27.5, '#a8432f');            // 门帘
  for (let x = -16; x <= 16; x += 8) fq(B, x - 1, x + 1, 34, 104, 28, '#8a2a20');
  for (const s of [-1, 1]) B.quad([s * 30.5, 80, -14 * s], [s * 30.5, 80, 14 * s], [s * 30.5, 104, 14 * s], [s * 30.5, 104, -14 * s], '#d8c8a0');   // 轿窗
  B.box(0, 124, 0, 70, 8, 64, r);
  cone(B, 0, 128, 0, 46, 26, r, 4);
  B.box(0, 156, 0, 8, 10, 8, '#d8b040');
  for (const s of [-1, 1]) { beam(B, [-110, 60, s * 34], [110, 60, s * 34], 6, '#5a3a24'); B.box(s * 100, 28, 0, 10, 56, 70, '#6a4a30'); }
}

/** 一丛立体的树（柏、松、阔叶）：t = 'c' 柏（几层圆锥）、'p' 松（扁的层冠）、'b' 阔叶（几团） */
function grove(B: ArchBuilder, items: [number, number, number, string][], rnd: () => number) {
  for (const [x, z, s, t] of items) {
    const h = 160 * s, trunk = '#4a3a2a';
    B.box(x, h * 0.18, z, 10 * s, h * 0.36, 10 * s, trunk);
    if (t === 'c') { for (let i = 0; i < 3; i++) cone(B, x, h * (0.25 + i * 0.22), z, (34 - i * 8) * s, h * 0.42, sh('#3a5a3a', i * 0.04 - 0.05), 7); }
    else if (t === 'p') { for (let i = 0; i < 3; i++) cone(B, x + (rnd() - 0.5) * 10, h * (0.4 + i * 0.16), z, (58 - i * 14) * s, h * 0.2, sh('#3e5e40', i * 0.05), 8); }
    else {
      // 阔叶：几团上下两截的多面体（像一团团树冠），颜色略有深浅
      const g = rnd() < 0.5 ? '#5a7a44' : '#4e6e3e';
      for (let i = 0; i < 3; i++) blob(B, x + (rnd() - 0.5) * 44 * s, h * (0.55 + rnd() * 0.22), z + (rnd() - 0.5) * 34 * s, (30 + rnd() * 10) * s, sh(g, (rnd() - 0.5) * 0.18));
    }
  }
}

const KIT: Record<string, (B: PB, c: string, rnd: () => number) => void> = {
  stall: (B, c, rnd) => {
    // 摊位：木案，案上货，四根杆子撑一块布棚
    B.box(0, 30, 0, 110, 8, 56, '#8a6a48');
    for (const [x, z] of [[-48, -22], [48, -22], [-48, 22], [48, 22]]) B.box(x, 15, z, 5, 30, 5, '#5a4030');
    for (let i = 0; i < 4; i++) { const gx = -36 + i * 24; if (i % 2) B.box(gx, 42, rnd() * 10 - 5, 18, 16, 18, GOODS[(i * 3 + Math.floor(rnd() * 7)) % 7]); else cyl(B, gx, 34, 0, 9, 10, GOODS[(i + Math.floor(rnd() * 7)) % 7], 6); }
    for (const [x, z] of [[-58, -32], [58, -32], [-58, 34], [58, 34]]) B.box(x, 60, z, 4, 120, 4, '#6a5038');
    B.quad([-66, 112, 44], [66, 112, 44], [66, 128, -38], [-66, 128, -38], c);
    B.quad([66, 112, 44], [-66, 112, 44], [-66, 128, -38], [66, 128, -38], sh(c, -0.3));
    fq(B, -66, 66, 100, 112, 44, sh(c, -0.12));
  },
  umb: (B, c) => { B.box(0, 55, 0, 4, 110, 4, '#5a4030'); cone(B, 0, 98, 0, 62, 26, c, 12); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; beam(B, [0, 112, 0], [Math.cos(a) * 60, 98, Math.sin(a) * 60], 2, sh(c, -0.3)); } B.box(30, 16, 10, 50, 30, 40, '#9a7a50'); },
  goods: (B, c, rnd) => { for (let i = 0; i < 5; i++) cyl(B, (rnd() - 0.5) * 70, 0, (rnd() - 0.5) * 50, 12 + rnd() * 5, 16 + rnd() * 10, i % 2 ? c : '#b89a60', 6); },
  crate: (B, c) => { B.box(0, 18, 0, 40, 36, 40, '#8a6a48'); B.box(30, 14, 20, 34, 28, 34, '#9a7a50'); B.box(4, 46, 4, 30, 22, 30, sh(c, 0.1)); },
  barrel: (B) => { cyl(B, 0, 0, 0, 16, 40, '#7a5a3a', 8); cyl(B, 34, 0, 8, 15, 36, '#6a4a30', 8); },
  cart: (B) => cart(B),
  horse: (B, _c, rnd) => { animal(B, true, ['#6a4a34', '#3a302a', '#8a6a4a', '#b8b0a4'][Math.floor(rnd() * 4)]); B.box(110, 50, 0, 8, 100, 8, '#5a4030'); },
  donkey: (B) => { animal(B, false); B.box(92, 45, 0, 7, 90, 7, '#5a4030'); },
  sedan: (B) => sedan(B),
  well: (B) => {
    cyl(B, 0, 0, 0, 34, 30, '#9a958a', 8, '#2a3438');
    for (const s of [-1, 1]) B.box(s * 36, 50, 0, 7, 100, 7, '#6a5038');
    B.box(0, 98, 0, 84, 7, 7, '#5a4030');
    const T = tmp(); roof(T, 100, 56, 0, { roof: '#5a5650', rise: 22, tile: 10, flare: 8 }); app(B, T, 0, 0, 102, 28); done();
  },
  laundry: (B) => laundry(B, 0, 0),
  lamp: (B) => { B.box(0, 70, 0, 7, 140, 7, '#4a3a2a'); B.box(14, 138, 0, 30, 4, 4, '#4a3a2a'); lanternBox(B, 26, 116, 0, 20); },
  flag: (B, c) => {
    // 酒旗：高杆上一面长幡，写着「酒」
    B.box(0, 130, 0, 7, 260, 7, '#4a3a2a');
    // P4：旗面随风飘（系在杆上的那一边不动，越往外飘得越开）
    B.swayQuad([4, 140, 0], [64, 140, 0], [64, 250, 0], [4, 250, 0], c, [0, 1, 1, 0]);
    B.swayQuad([64, 140, 0], [4, 140, 0], [4, 250, 0], [64, 250, 0], sh(c, -0.25), [1, 0, 0, 1]);
    (B.plaques ??= []).push({ p: [8, 146, 0.4, 60, 146, 0.4, 60, 244, 0.4, 8, 244, 0.4], text: '酒', kind: 'banner', color: c, sw: [0.07, 0.93, 0.93, 0.07] });
  },
  notice: (B) => { for (const s of [-1, 1]) B.box(s * 50, 60, 0, 8, 120, 8, '#5a4030'); B.box(0, 82, 0, 110, 60, 6, '#7a5a3a'); fq(B, -46, 46, 60, 104, 3.2, '#e8dcc0'); for (let i = 0; i < 4; i++) fq(B, -40 + i * 22, -24 + i * 22, 66, 98, 3.5, i % 2 ? '#d8c8a0' : '#f0e8d0'); plaque(B, -40, 40, 106, 122, 3.5, '悬赏', 'board'); const T = tmp(); roof(T, 130, 30, 0, { roof: '#5a5650', rise: 14, tile: 9 }); app(B, T, 0, 0, 124, 15); done(); },
  lion: (B) => { B.box(0, 16, 0, 44, 32, 60, '#a8a296'); B.box(0, 52, -6, 34, 40, 34, '#b8b2a6'); B.box(0, 82, 6, 30, 26, 28, '#b0aa9e'); B.box(0, 70, 22, 22, 14, 10, '#9a948a'); },
  ding: (B) => { cyl(B, 0, 22, 0, 36, 40, '#5a4a30', 8, '#2a2418'); for (const [x, z] of [[-20, -16], [20, -16], [0, 22]]) B.box(x, 11, z, 7, 22, 7, '#4a3a24'); for (const s of [-1, 1]) B.box(s * 28, 72, 0, 6, 18, 18, '#5a4a30'); },
  huabiao: (B) => { B.box(0, 12, 0, 50, 24, 50, '#e8e4d8'); cyl(B, 0, 24, 0, 13, 300, '#eeeae2', 8); B.box(0, 290, 0, 70, 10, 14, '#e8e4d8'); B.box(0, 334, 0, 26, 20, 26, '#dcd8cc'); },
  rock: (B, _c, rnd) => { for (let i = 0; i < 3; i++) B.box((rnd() - 0.5) * 30, 24 + i * 26, (rnd() - 0.5) * 20, 50 - i * 12, 40, 40 - i * 8, sh('#8a8a80', (rnd() - 0.5) * 0.3)); },
  boat: (B) => {
    // 乌篷船：尖头尖尾的船身、船舷、拱篷、橹
    const hull = '#6a4a30';
    B.quad([-100, 4, 22], [100, 4, 22], [140, 26, 6], [-140, 26, 6], hull);
    B.quad([100, 4, -22], [-100, 4, -22], [-140, 26, -6], [140, 26, -6], sh(hull, -0.15));
    B.box(0, 14, 0, 200, 8, 46, sh(hull, 0.1));
    B.box(0, 24, 0, 230, 4, 50, '#4a3424');
    for (let i = 0; i < 5; i++) { const x = -40 + i * 20; B.quad([x - 10, 26, 26], [x + 10, 26, 26], [x + 10, 70, 0], [x - 10, 70, 0], '#3a3028'); B.quad([x + 10, 26, -26], [x - 10, 26, -26], [x - 10, 70, 0], [x + 10, 70, 0], '#342a24'); }
    beam(B, [-120, 30, 10], [-200, 0, 30], 4, '#5a4030');
  },
};
function kit(B: PB, p: P, rnd: () => number) {
  const D = KIT_DMG.skip;
  (p.items as [string, number, number, number, string?][]).forEach((it, idx) => {
    const f = KIT[it[0]]; if (!f) return;
    const T = tmp(); f(T, it[4] ?? '#c84a3a', rnd);
    // 城镇破坏：碎了 / 正在倒的那件不画（随机数照取，后面几件的样子不变）；碎了的在原处画残骸
    const sk = D?.get(idx);
    if (!sk) app(B, T, it[3] ?? 0, it[1], 0, it[2]);
    else if (sk === 'broken' && KIT_DMG.debris) { const R = tmp(); KIT_DMG.debris(R, it[0], it[4] ?? '#c84a3a', (KIT_DMG.seed + idx * 7919) >>> 0); app(B, R, it[3] ?? 0, it[1], 0, it[2]); done(); }
    done();
  });
}
/**
 * 城镇破坏（hd2d/townwreckGl.ts 重建替身时设，用完清掉）：skip 里的小件（ckit 的第几件）不画；broken 的由 debris 在原处画残骸
 * （本地坐标，正面朝 +z，脚下 y = 0）。平时 skip 是 null，照原样拼。
 */
export const KIT_DMG: { skip: Map<number, 'fall' | 'broken'> | null; debris: ((B: ArchBuilder, kind: string, color: string, seed: number) => void) | null; seed: number } = { skip: null, debris: null, seed: 0 };
/** 城镇破坏：ckit 构件里的第 idx 件单独拼进 B（转好朝向、中心在原点；随机数照原样取到这一件）——倒下的过程用 */
export function kitItemInto(B: ArchBuilder, piece: { seed: number; p: P }, idx: number): boolean {
  const items = piece.p.items as [string, number, number, number, string?][], rnd = mulberry32(piece.seed >>> 0);
  for (let i = 0; i < items.length; i++) {
    const it = items[i], f = KIT[it[0]]; if (!f) continue;
    const T = tmp(); f(T, it[4] ?? '#c84a3a', rnd);
    if (i === idx) { app(B as PB, T, it[3] ?? 0, 0, 0, 0); done(); return true; }
    done();
  }
  return false;
}

// ---------------------------------------------------------------- 城墙、城门、角楼
/** 城墙一段：沿本地 x，墙心在 z=0，out 是外侧（+1 = +z）；垛口在外侧、矮女墙在里侧；边城夯土墙不画砖缝、有夯层 */
function cityWall(B: ArchBuilder, len: number, h: number, t: number, col: string, mer: boolean, out: number, cap?: string, white?: boolean) {
  if (!mer) { wallX(B, -len / 2, len / 2, 0, h, t, col, cap ?? '#4a4e54'); if (white) B.box(0, 10, 0, len + 4, 20, t + 10, '#e8e4d8'); return; }
  const dk = sh(col, -0.14);
  B.box(0, h / 2, 0, len, h, t, col);
  B.box(0, 16, 0, len + 2, 32, t + 14, dk);                 // 墙脚
  B.box(0, h - 4, 0, len + 1, 8, t + 6, sh(col, 0.08));      // 墙顶压边
  // 外侧垛口（每个垛中间一个射孔）
  const zo = out * (t / 2 - 10), n = Math.max(1, Math.floor(len / 56));
  B.box(0, h + 12, zo, len, 24, 20, col);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (i + 0.5) * len / n;
    B.box(x, h + 36, zo, 30, 24, 20, i % 2 ? col : sh(col, -0.04));
    if (out > 0) fq(B, x - 3, x + 3, h + 30, h + 40, zo + 10.5, DARK); else bq(B, x - 3, x + 3, h + 30, h + 40, zo - 10.5, DARK);
  }
  B.box(0, h + 10, -out * (t / 2 - 8), len, 20, 14, sh(col, 0.04));   // 里侧女墙
  // 外墙面上几道砖缝 / 夯层的暗线、几块深浅不一的补墙
  for (let k = 1; k < 6; k++) { const y = h * k / 6; if (out > 0) fq(B, -len / 2, len / 2, y - 1.5, y + 1, t / 2 + 0.5, dk); else bq(B, -len / 2, len / 2, y - 1.5, y + 1, -t / 2 - 0.5, dk); }
  for (let i = 0; i < len / 260; i++) { const x = -len / 2 + ((i * 197) % Math.max(1, len - 80)) + 40, y = 40 + ((i * 131) % Math.max(1, h - 120)), c2 = sh(col, i % 2 ? 0.05 : -0.07); if (out > 0) fq(B, x - 40, x + 40, y, y + 50, t / 2 + 0.3, c2); else bq(B, x - 40, x + 40, y, y + 50, -t / 2 - 0.3, c2); }
}
function gateTower(B: PB, p: P, pal: ArchPalette) {
  const t = p.t as number, h = p.h as number, w = p.w as number, open = p.open as number, col = p.col as string, big = p.big as number;
  const roofC = (p.roof as string) || '#4e545c', wallT = t + 40;
  // 门洞两侧的墩、门洞上的过梁
  const side = (w - open) / 2;
  for (const s of [-1, 1]) B.box(s * (open / 2 + side / 2), h / 2, 0, side, h, wallT, col);
  B.box(0, h * 0.82, 0, open, h * 0.36, wallT, col);
  // 门洞：前后两面的拱券（暗色半圆 + 一圈券石）、洞里两侧墙（暗）
  const ya = h * 0.64, r = open / 2;
  for (const s of [-1, 1]) {
    const z = s * (wallT / 2 + 0.6);
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * Math.PI, a1 = (i + 1) / 8 * Math.PI;
      const P0: V = [Math.cos(a0) * r, ya + Math.sin(a0) * r * 0.5, z], P1: V = [Math.cos(a1) * r, ya + Math.sin(a1) * r * 0.5, z];
      if (s > 0) B.tri([0, ya, z], P0, P1, sh(col, -0.3)); else B.tri([0, ya, z], P1, P0, sh(col, -0.3));
      const Q0: V = [Math.cos(a0) * (r + 14), ya + Math.sin(a0) * (r * 0.5 + 14), z + s * 0.4], Q1: V = [Math.cos(a1) * (r + 14), ya + Math.sin(a1) * (r * 0.5 + 14), z + s * 0.4];
      if (s > 0) B.quad(P0, Q0, Q1, P1, sh(col, 0.1)); else B.quad(Q0, P0, P1, Q1, sh(col, 0.1));
    }
    B.box(s * (open / 2 - 1), ya / 2, 0, 2, ya, wallT, sh(col, -0.35));
  }
  if (p.palace) B.box(0, 12, 0, w + 10, 24, wallT + 10, '#e8e4d8');
  // 门洞上方的石匾：城名（外侧）
  // 匾放大：镜头拉到最远（0.22）时约一百像素宽，城名还认得出
  if (p.city) plaque(B, -Math.min(w * 0.4, 230), Math.min(w * 0.4, 230), ya + r * 0.5 + 14, ya + r * 0.5 + 92, wallT / 2 + 1.2, p.city, 'stone');
  // 垛口
  for (const s of [-1, 1]) { B.box(0, h + 12, s * (wallT / 2 - 10), w, 24, 18, col); for (let x = -w / 2 + 28; x < w / 2; x += 56) B.box(x, h + 36, s * (wallT / 2 - 10), 30, 24, 18, col); }
  // 门楼
  const tp: ArchPalette = { ...pal, roof: roofC, wall: p.palace ? '#a8402e' : '#8a3a2a', pillar: '#8a2e24', trim: '#3a2a20', accent: p.palace ? '#e0b040' : '#2a5a6a', stone: col };
  if (big === 2) {
    // 箭楼：高墙身，三排箭窗（每个窗一圈深框），顶上一圈垛口
    const bw = w * 0.92, bd = wallT * 0.8, bh = h * 0.5;
    B.box(0, h + bh / 2, 0, bw, bh, bd, sh(col, 0.06));
    for (let r2 = 0; r2 < 3; r2++) for (let i = 0; i < 7; i++) {
      const x = -bw / 2 + (i + 0.5) * bw / 7, y = h + bh * (0.2 + r2 * 0.26);
      fq(B, x - 14, x + 14, y - 3, y + 23, bd / 2 + 0.5, sh(col, -0.15)); fq(B, x - 9, x + 9, y, y + 18, bd / 2 + 0.9, DARK);
    }
    B.box(0, h + bh * 0.9, 0, bw + 10, 10, bd + 10, sh(col, 0.12));   // 腰檐线
    B.roof(0, h + bh, 0, bw / 2 + 26, bd / 2 + 26, bh * 0.5, { gable: 0.7, color: roofC, trim: sh(roofC, -0.35), lift: 18 });
    if (p.name) plaque(B, -bw * 0.22, bw * 0.22, h + bh * 0.8, h + bh * 0.99, bd / 2 + 1.5, p.name, 'gold');
    return;
  }
  const tw = big >= 1 ? w * 0.9 : w * 0.72, td = big >= 1 ? wallT * 0.78 : wallT * 0.6, th = big >= 1 ? h * 0.36 : h * 0.28;
  B.hall(0, h, td / 2, tw, td, th, td * (big >= 1 ? 0.62 : 0.5), tp, { tiers: big >= 1 ? 2 : 1, base: 10, gable: 0.6, steps: false });
  // 匾：门名
  if (p.name) plaque(B, -Math.min(tw * 0.22, 120), Math.min(tw * 0.22, 120), h + th * 0.6, h + th * 0.99, td / 2 + 3, p.name, 'gold');
  else fq(B, -tw * 0.12, tw * 0.12, h + th * 0.7, h + th * 0.95, td / 2 + 2, '#1e2a3a');
}
function cornerTower(B: ArchBuilder, p: P, pal: ArchPalette) {
  const t = p.t as number, h = p.h as number, s = (p.s as number) ?? 1, col = p.col as string, roofC = (p.roof as string) || '#4e545c';
  const bw = t * 1.5;
  B.box(0, h / 2, 0, bw, h, bw, sh(col, 0.04));
  B.box(0, 16, 0, bw + 14, 32, bw + 14, sh(col, -0.14));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * (bw / 2 - 10), h + 20, sz * (bw / 2 - 10), 20, 40, 20, col);
  const tp: ArchPalette = { ...pal, roof: roofC, wall: p.fancy ? '#a8402e' : '#8a3a2a', pillar: '#8a2e24', trim: '#3a2a20', accent: '#2a5a6a', stone: col };
  if (p.fancy) {
    // 紫禁城角楼：十字脊，几层檐交叠
    B.hall(0, h, bw * 0.3, bw * 0.6, bw * 0.6, 60 * s, 50 * s, tp, { tiers: 2, base: 6, gable: 0.4, steps: false });
    B.roof(0, h + 60 * s, -bw * 0.3 + bw * 0.3, bw * 0.5, bw * 0.24, 46 * s, { gable: 0.8, color: roofC, trim: sh(roofC, -0.35), lift: 10 });
    return;
  }
  B.hall(0, h, bw * 0.34, bw * 0.68, bw * 0.68, 70 * s, 70 * s, tp, { tiers: 2, base: 6, gable: 0.35, steps: false });
}

// ---------------------------------------------------------------- 桥、岸、坛、台、山
function bridge(B: ArchBuilder, p: P) {
  // 本地：桥沿 z 方向跨过去（长 len），宽 w（x）。桥面平（人能走），两侧栏板拱起，侧面画出拱券
  const L = p.len as number, w = p.w as number, white = !!p.white, c = white ? '#e8e4dc' : '#a8a296', hump = p.arch ? 30 : 12;
  B.box(0, 3, 0, w, 6, L, sh(c, 0.05));
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 6), n = 8;
    for (let i = 0; i < n; i++) {
      const z0 = -L / 2 + L * i / n, z1 = z0 + L / n;
      const h0 = 36 + hump * Math.sin(Math.PI * i / n), h1 = 36 + hump * Math.sin(Math.PI * (i + 1) / n);
      if (s > 0) { B.quad([x + 6, 0, z1], [x + 6, 0, z0], [x + 6, h0, z0], [x + 6, h1, z1], c); B.quad([x - 6, 0, z0], [x - 6, 0, z1], [x - 6, h1, z1], [x - 6, h0, z0], sh(c, -0.08)); }
      else { B.quad([x - 6, 0, z0], [x - 6, 0, z1], [x - 6, h1, z1], [x - 6, h0, z0], c); B.quad([x + 6, 0, z1], [x + 6, 0, z0], [x + 6, h0, z0], [x + 6, h1, z1], sh(c, -0.08)); }
      B.quad([x - 6, h0, z0], [x - 6, h1, z1], [x + 6, h1, z1], [x + 6, h0, z0], sh(c, 0.12));
      if (i % 2 === 0) B.box(x, Math.max(h0, h1) + 8, z0, 12, 16, 12, sh(c, 0.08));
    }
    if (p.arch) { const xx = s * (w / 2 + 0.6), r = L * 0.3; for (let i = 0; i < 6; i++) { const a0 = i / 6 * Math.PI, a1 = (i + 1) / 6 * Math.PI; const P0: V = [xx, Math.sin(a0) * 20, Math.cos(a0) * r], P1: V = [xx, Math.sin(a1) * 20, Math.cos(a1) * r]; if (s > 0) B.tri([xx, 0, 0], P1, P0, '#3a4a50'); else B.tri([xx, 0, 0], P0, P1, '#3a4a50'); } }
  }
}
/** 栈桥（码头）：木板桥面沿本地 +z 伸进水里，两排木桩 */
function pier(B: ArchBuilder, p: P) {
  const L = p.len as number, w = p.w as number;
  B.box(0, 14, L / 2, w, 8, L, '#8a6a48');
  for (let z = 20; z < L; z += 40) fq(B, -w / 2, w / 2, 17, 18.5, z, '#5a4030');
  for (let z = 30; z < L; z += 110) for (const s of [-1, 1]) B.box(s * (w / 2 - 6), 10, z, 12, 40, 12, '#4a3424');
  B.box(0, 20, L - 10, w + 20, 10, 24, '#6a4a30');
}
function teleportPad(B: ArchBuilder, p: P) {
  // 传送阵：三层圆台，台面一圈阵纹（夜里亮）、四角石柱
  const r = p.r as number;
  cyl(B, 0, 0, 0, r * 1.25, 8, '#9a9488', 16, '#b0aa9e');
  cyl(B, 0, 8, 0, r, 8, '#b8b2a4', 16, '#c8c2b4');
  for (let i = 0; i < 16; i++) { const a0 = i / 16 * Math.PI * 2, a1 = a0 + Math.PI / 16; const p0: V = [Math.cos(a0) * r * 0.8, 16.5, Math.sin(a0) * r * 0.8], p1: V = [Math.cos(a1) * r * 0.8, 16.5, Math.sin(a1) * r * 0.8], q1: V = [Math.cos(a1) * r * 0.7, 16.5, Math.sin(a1) * r * 0.7], q0: V = [Math.cos(a0) * r * 0.7, 16.5, Math.sin(a0) * r * 0.7]; B.glowQuad(q0, q1, p1, p0, '#9ac8e0'); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; B.box(Math.cos(a) * r * 1.1, 60, Math.sin(a) * r * 1.1, 18, 120, 18, '#8a8478'); B.glowQuad([Math.cos(a) * r * 1.1 - 6, 100, Math.sin(a) * r * 1.1 + 9.5], [Math.cos(a) * r * 1.1 + 6, 100, Math.sin(a) * r * 1.1 + 9.5], [Math.cos(a) * r * 1.1 + 6, 112, Math.sin(a) * r * 1.1 + 9.5], [Math.cos(a) * r * 1.1 - 6, 112, Math.sin(a) * r * 1.1 + 9.5], '#9ac8e0'); }
}
function altar(B: ArchBuilder, p: P) {
  const n = (p.tiers as number) ?? 3, r = p.r as number, c = (p.col as string) ?? '#eeeae0', sq = !!p.sq, th = 46;
  for (let i = 0; i < n; i++) {
    const ri = r * (1 + 0.32 * (n - 1 - i)), y = i * th;
    if (sq) { B.box(0, y + th / 2, 0, ri * 2, th, ri * 2, i % 2 ? c : sh(c, -0.04)); B.box(0, y + th + 5, 0, ri * 2 - 8, 10, ri * 2 - 8, sh(c, -0.12)); }
    else { cyl(B, 0, y, 0, ri, th, i % 2 ? c : sh(c, -0.04), 28, sh(c, 0.06)); cyl(B, 0, y + th, 0, ri - 6, 10, sh(c, -0.1), 28, sh(c, 0.06)); }
    for (let a = 0; a < 4; a++) { const dx = [0, 1, 0, -1][a], dz = [1, 0, -1, 0][a]; B.box(dx * (ri + 18), y + th / 2, dz * (ri + 18), dx ? 36 : ri * 0.28, th, dz ? 36 : ri * 0.28, sh(c, -0.08)); }   // 四出陛
  }
  if (p.top) { const y = n * th; if (sq) B.box(0, y + 4, 0, r * 1.2, 8, r * 1.2, p.top); else cyl(B, 0, y, 0, r * 0.6, 8, p.top, 20); }
}
function roundHall(B: ArchBuilder, p: P) {
  // 祈年殿：圆殿身，三重蓝檐，金顶
  const r = p.r as number, h = p.h as number, y0 = (p.base as number) ?? 0;
  cyl(B, 0, y0, 0, r, h * 0.32, '#8a2a20', 20, '#3a2a20');
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const x = Math.cos(a) * (r + 0.5), z = Math.sin(a) * (r + 0.5); if (z > 0) { const tx = -Math.sin(a), tz = Math.cos(a); B.glowQuad([x - tx * 18, y0 + 30, z - tz * 18], [x + tx * 18, y0 + 30, z + tz * 18], [x + tx * 18, y0 + h * 0.26, z + tz * 18], [x - tx * 18, y0 + h * 0.26, z - tz * 18], '#d8b878'); } }
  let y = y0 + h * 0.32, rr = r * 1.35;
  for (let i = 0; i < 3; i++) {
    cone(B, 0, y, 0, rr, h * 0.12, '#2a4a8a', 24);
    cyl(B, 0, y - 10, 0, rr, 10, '#3a2a20', 24);
    y += h * 0.1; rr *= 0.78;
    if (i < 2) { cyl(B, 0, y - h * 0.02, 0, rr * 0.82, h * 0.09, '#8a2a20', 20); y += h * 0.07; }
  }
  cone(B, 0, y, 0, rr * 0.6, h * 0.1, '#2a4a8a', 16);
  B.box(0, y + h * 0.11, 0, 16, 40, 16, '#d8b040');
}
function terrace(B: ArchBuilder, p: P) {
  const w = p.w as number, d = p.d as number, h = p.h as number, n = (p.tiers as number) ?? 3;
  for (let i = 0; i < n; i++) {
    const ww = w - i * 120, dd = d - i * 120, y = i * h;
    B.box(0, y + h / 2, -d / 2, ww, h, dd, i % 2 ? '#eeeae2' : '#e4e0d6');
    B.box(0, y + h + 6, -d / 2, ww - 6, 12, dd - 6, '#d8d4ca');
    for (let x = -ww / 2 + 30; x < ww / 2; x += 60) B.box(x, y + h + 20, -d / 2 + dd / 2 - 4, 6, 16, 6, '#f4f2ec');   // 望柱
  }
  B.quad([-90, 0, 120], [90, 0, 120], [90, n * h, -60 * n], [-90, n * h, -60 * n], '#e8e4dc');
}
function mound(B: ArchBuilder, p: P) {
  const w = p.w as number, d = p.d as number, h = p.h as number, n = (p.n as number) ?? 3;
  for (let i = 0; i < n; i++) { const k = 1 - i / (n + 0.6); B.box(0, i * h / n + h / n / 2, -d / 2, w * k, h / n, d * k, i % 2 ? '#6a8a5a' : '#5e7e50'); }
}
function bellTower(B: PB, p: P, pal: ArchPalette) {
  // 钟楼 / 鼓楼：砖台（台基、腰线、四面券门、一侧登台的踏步），台上重檐楼阁（鼓楼红墙，钟楼灰墙），檐下挂匾
  const w = p.w as number, drum = !!p.drum, h1 = w * 0.5, col = drum ? '#9a5a44' : '#8e8a80', zc = -w / 2;
  B.box(0, 12, zc, w + 24, 24, w + 24, sh(col, -0.15));
  B.box(0, h1 / 2, zc, w, h1, w, col);
  B.box(0, h1 * 0.52, zc, w + 8, 10, w + 8, sh(col, 0.12));   // 腰线
  B.box(0, h1 + 6, zc, w + 14, 12, w + 14, sh(col, 0.1));
  // 女墙
  for (const s of [-1, 1]) { B.box(0, h1 + 22, zc + s * (w / 2 + 2), w + 10, 20, 8, col); B.box(s * (w / 2 + 2), h1 + 22, zc, 8, 20, w + 10, col); }
  // 券门：每面一个，暗色门洞 + 半圆顶 + 一圈券石
  const ar = w * 0.13, ah = h1 * 0.36;
  const arch = (face: number) => {
    const T = tmp();
    fq(T, -ar, ar, 0, ah, 0.6, DARK);
    for (let i = 0; i < 8; i++) { const a0 = i / 8 * Math.PI, a1 = (i + 1) / 8 * Math.PI; T.tri([0, ah, 0.6], [Math.cos(a0) * ar, ah + Math.sin(a0) * ar, 0.6], [Math.cos(a1) * ar, ah + Math.sin(a1) * ar, 0.6], DARK); T.quad([Math.cos(a0) * ar, ah + Math.sin(a0) * ar, 0.8], [Math.cos(a0) * (ar + 12), ah + Math.sin(a0) * (ar + 12), 0.8], [Math.cos(a1) * (ar + 12), ah + Math.sin(a1) * (ar + 12), 0.8], [Math.cos(a1) * ar, ah + Math.sin(a1) * ar, 0.8], sh(col, 0.15)); }
    const r = face, dx = [0, 1, 0, -1][r] * w / 2, dz = [1, 0, -1, 0][r] * w / 2;
    app(B, T, r, dx, 0, zc + dz); done();
  };
  for (let f = 0; f < 4; f++) arch(f);
  // 踏步：东侧一道斜坡
  B.quad([w / 2 + 2, 0, zc + w * 0.45], [w / 2 + 70, 0, zc + w * 0.45], [w / 2 + 2, h1, zc - w * 0.05], [w / 2 + 2, h1, zc - w * 0.05], sh(col, 0.05));
  for (let i = 0; i < 8; i++) B.box(w / 2 + 30, h1 * (i + 0.5) / 8, zc + w * 0.45 - (w * 0.5) * (i + 0.5) / 8, 56, h1 / 8, w * 0.5 / 8, sh(col, i % 2 ? 0.02 : -0.04));
  const tp: ArchPalette = { ...pal, roof: '#4a5058', wall: drum ? '#a8402e' : '#8a3a2a', pillar: '#8a2e24', trim: '#3a2a20', accent: '#c89a3a', stone: col };
  B.hall(0, h1 + 12, -w * 0.12, w * 0.76, w * 0.76, w * 0.3, w * 0.3, tp, { tiers: 2, base: 8, gable: 0.55, steps: false });
  if (p.name) plaque(B, -w * 0.12, w * 0.12, h1 + 12 + 8 + w * 0.3 * 0.62, h1 + 12 + 8 + w * 0.3 * 0.95, -w * 0.12 + 3, p.name, 'gold');
}

// ---------------------------------------------------------------- 登记
const palOf = (c: PieceCtx, o?: Record<string, string>): ArchPalette => ({ ...c.pal, ...(o ?? {}) });
const rndOf = (c: PieceCtx) => mulberry32(c.piece.seed >>> 0);
function put(c: PieceCtx, f: (B: PB) => void, rot = (c.piece.p.r as number) ?? 0, lift = 0) {
  const T = tmp(); f(T); app(c.builder as PB, T, rot, c.x, c.y + lift, c.z); done();
}

registerPiece('ccourt', (c) => { const r = rndOf(c); const cp = cpal(c, c.piece.p, r); put(c, (B) => court(B, c.piece.p, r, cp)); });
registerPiece('cshop', (c) => { const r = rndOf(c); const cp = cpal(c, c.piece.p, r); put(c, (B) => shop(B, c.piece.p, r, cp)); });
registerPiece('chouse', (c) => {
  const p = c.piece.p, r = rndOf(c), cp = cpal(c, p, r);
  put(c, (B) => house(B, p.w, p.d, p.h, { roof: p.roof || cp.roof, wall: cp.wall, wood: cp.wood, lit: r() < 0.5, open: !!p.open, gran: !!p.gran, win: p.gran ? 0 : undefined, door: p.gran ? false : undefined, flat: cp.flat, snow: cp.snow, flare: 9 }));
});
registerPiece('chall', (c) => {
  const p = c.piece.p, pal = palOf(c, p.pal), base = (p.base as number) ?? 0;
  put(c, (B) => {
    if (p.pointed) {
      // 中和殿：方殿攒尖顶
      B.box(0, 8, -p.d / 2, p.w + 30, 16, p.d + 30, pal.stone);
      B.box(0, 16 + p.h / 2, -p.d / 2, p.w, p.h, p.d, pal.wall);
      B.roof(0, 16 + p.h, -p.d / 2, p.w / 2 + 40, p.d / 2 + 40, p.d * 0.55, { pointed: true, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: 16 });
      return;
    }
    B.hall(0, 0, 0, p.w, p.d, p.h, p.d * (p.tiers > 1 ? 0.62 : 0.5), pal, { tiers: p.tiers, base: Math.max(12, p.h * 0.14), opening: p.open ?? 0, gable: 0.55 });
    // 匾：殿名、寺名、衙署名，挂在檐下正中
    if (p.name) { const base2 = Math.max(12, p.h * 0.14), y = base2 + p.h * 0.62; plaque(B, -Math.min(p.w * 0.2, 95), Math.min(p.w * 0.2, 95), y, y + Math.min(48, p.h * 0.3), 3.5, p.name, 'gold'); }
  }, p.r ?? 0, base);
});
registerPiece('cpagoda', (c) => {
  const p = c.piece.p, pal = palOf(c, p.pal), base = (p.base as number) ?? 0;
  put(c, (B) => {
    if (p.white) {
      // 白塔：方台、覆钵、十三天、宝盖
      B.box(0, 40, 0, p.w * 1.3, 80, p.w * 1.3, '#f0eee8');
      cyl(B, 0, 80, 0, p.w * 0.5, 60, '#f4f2ec', 16);
      cyl(B, 0, 140, 0, p.w * 0.42, p.w * 0.36, '#f6f4ee', 16);
      cone(B, 0, 140 + p.w * 0.36, 0, p.w * 0.42, p.w * 0.2, '#f0eee8', 16);
      cyl(B, 0, 140 + p.w * 0.5, 0, p.w * 0.12, p.h * 0.4, '#e8e6e0', 10);
      cone(B, 0, 140 + p.w * 0.5 + p.h * 0.4, 0, p.w * 0.3, 20, '#c8a040', 12);
      B.box(0, 140 + p.w * 0.5 + p.h * 0.4 + 34, 0, 14, 30, 14, '#d8b040');
      return;
    }
    B.pagoda(0, 0, -p.w * 0.65, p.w, p.h, p.n ?? 7, pal);
  }, 0, base);
});
registerPiece('cpav', (c) => { const p = c.piece.p, pal = palOf(c, p.pal); put(c, (B) => B.pavilion(0, 0, -p.w * 0.6, p.w, p.w * 1.4, pal), 0, p.lift ?? 0); });
registerPiece('cgatehouse', (c) => { const p = c.piece.p, r = rndOf(c), cp = cpal(c, { ...p, wl: 0.9 }, r); put(c, (B) => gatehouse(B, 0, -20, p.w, 150, { roof: cp.roof, wood: '#6e4630', red: true, flat: cp.flat, snow: cp.snow, wall: cp.wall }, p.name), 0); });
// 牌楼：三间四柱，跨在干道上；正中一块金字匾（两面都挂）
registerPiece('cpaifang', (c) => {
  const p = c.piece.p, w = p.w as number, h = (p.h as number) ?? 300;
  const pal = palOf(c, { pillar: p.stone ? '#a8a296' : '#8a2e24', roof: p.stone ? '#6a6e70' : '#4a5058', trim: '#3a3a40', accent: '#c89a3a', stone: '#9a968c' });
  put(c, (B) => {
    B.paifang(0, 0, 0, w, h, pal);
    const mid = w * 0.4, t = Math.max(4, w * 0.035);
    plaque(B, -mid * 0.32, mid * 0.32, h * 0.86, h * 0.98, t * 0.5 + 0.8, p.name as string, 'gold');
    plaque(B, mid * 0.32, -mid * 0.32, h * 0.86, h * 0.98, -t * 0.5 - 0.8, p.name as string, 'gold');
  });
});
// 斜着走的城墙（海岛城顺着岸线）：ang 是墙的走向（弧度，世界 x 轴起算、朝 +z 转为正），out = 1 时本地 +z 一侧是城外
registerPiece('cwallp', (c) => {
  const p = c.piece.p, T = tmp();
  cityWall(T, p.len, p.h, p.t, p.col, !!p.mer, p.out ?? 1, p.cap, false);
  (c.builder as ArchBuilder).appendAngle(T, p.ang, c.x, c.y, c.z); done();
});
registerPiece('cwall', (c) => {
  const p = c.piece.p, along = p.ax === 'x';
  put(c, (B) => cityWall(B, p.len, p.h, p.t, p.col, !!p.mer, p.out ?? 1, p.cap, !!p.white), along ? 0 : 1);
});
registerPiece('cgate', (c) => put(c, (B) => gateTower(B, c.piece.p, c.pal)));
registerPiece('ctower', (c) => put(c, (B) => cornerTower(B, c.piece.p, c.pal), 0));
registerPiece('cbridge', (c) => put(c, (B) => bridge(B, c.piece.p), c.piece.p.ax === 'x' ? 1 : 0));
registerPiece('cpier', (c) => put(c, (B) => pier(B, c.piece.p)));
registerPiece('cteleport', (c) => put(c, (B) => teleportPad(B, c.piece.p), 0));
registerPiece('ccurb', (c) => { const p = c.piece.p; put(c, (B) => { B.box(0, p.h / 2 - 6, 0, p.len, p.h, p.t, '#9a958a'); B.box(0, p.h - 4, 0, p.len, 6, p.t + 6, '#b0aa9e'); }, p.ax === 'x' ? 0 : 1); });
registerPiece('cbell', (c) => put(c, (B) => bellTower(B, c.piece.p, c.pal), 0));
registerPiece('caltar', (c) => put(c, (B) => altar(B, c.piece.p), 0));
registerPiece('cround', (c) => put(c, (B) => roundHall(B, c.piece.p), 0));
registerPiece('cterrace', (c) => put(c, (B) => terrace(B, c.piece.p), 0));
registerPiece('cmound', (c) => put(c, (B) => mound(B, c.piece.p), 0));
registerPiece('ckit', (c) => put(c, (B) => kit(B, c.piece.p, rndOf(c)), 0));
registerPiece('cgrove', (c) => put(c, (B) => grove(B, c.piece.p.items, rndOf(c)), 0));
