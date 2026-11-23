// P10：各宗门的山（规划图）——青霞谷之外的大宗门按几种骨架生成，一般宗门 / 小门派是小号版本。
// 骨架：中轴层台式（axis）、环湖临水式（lake）、双峰夹谷式（twin）、崖壁栈阁式（cliff）、岛上式（isle）、小号（small）。
// 每家按门派特色（SECT_LOOK：特色、树种、是否魔道、尺寸）选骨架、配标志物；高度一律「相对基准面」，基准面取原地形（见 world/surface.ts）。
// 在山里的宗门台阶高差大（每层三五百）；在平地上的「堆一座和缓的小山」，总高差一千以内，山坡不低于原地面。
import type { GrandSectPlan, SectTerrace, SectStair, SectIsle, SectBridge, SectFall, SectPeak, SectMist, TerraceRole, SectYard, SectPath } from './sectPlan';
import { rectDist, onPlanStair } from './sectPlan';

export type SectVariant = 'hero' | 'axis' | 'lake' | 'twin' | 'cliff' | 'isle' | 'small';
/** 门派的样子：骨架、特色、山上的树、是否魔道（色调暗、灯火青红） */
export interface SectLook { variant: SectVariant; feature?: string; trees: string[]; demon?: boolean; k?: number }
export const SECT_LOOK: Record<string, Partial<SectLook>> = {
  huangfeng: { variant: 'hero', trees: ['ymaple', 'ymaple', 'ymaple', 'ymaple', 'ymaple', 'pine', 'pine', 'cypress', 'broad', 'maple'] },
  yanyue: { variant: 'lake', feature: 'moon', trees: ['plum', 'peach', 'cypress', 'willow', 'plum'] },
  luoyun: { variant: 'twin', feature: 'herb', trees: ['pine', 'broad', 'bamboo', 'peach', 'pine'] },
  yinluo: { variant: 'axis', feature: 'demon', demon: true, trees: ['dead', 'cypress', 'cypress', 'pine'] },
  qianzhu: { variant: 'axis', feature: 'bamboo', trees: ['bamboo', 'bamboo', 'bamboo', 'pine', 'cypress'] },
  gujian: { variant: 'cliff', feature: 'sword', trees: ['pine', 'pine', 'cypress', 'snowpine'] },
  guiling: { variant: 'twin', feature: 'demon', demon: true, trees: ['dead', 'cypress', 'pine', 'cypress'] },
  tianlan: { variant: 'axis', feature: 'dome', trees: ['dead', 'broad', 'cypress'] },
  tianmo: { variant: 'cliff', feature: 'demon', demon: true, trees: ['dead', 'cypress', 'dead'] },
  jiyin: { variant: 'isle', feature: 'demon', demon: true, trees: ['palm', 'dead', 'cypress'] },
  miaoyin: { variant: 'isle', feature: 'pink', trees: ['palm', 'peach', 'palm'] },
  // 一般宗门 / 小门派（小号版本，仍按特色配标志物）
  qixuan: { variant: 'small', feature: 'martial', trees: ['pine', 'broad', 'maple'] },
  lingshou: { variant: 'small', feature: 'beast', trees: ['pine', 'broad'] },
  qingxu: { variant: 'small', feature: 'temple', trees: ['pine', 'cypress', 'bamboo'] },
  huadao: { variant: 'small', feature: 'blade', trees: ['pine', 'maple'] },
  tianque: { variant: 'small', feature: 'fort', trees: ['cypress', 'pine'] },
  jujian: { variant: 'small', feature: 'sword', trees: ['pine', 'broad'] },
  baiqiao: { variant: 'small', trees: ['broad', 'bamboo'] },
  hehuan: { variant: 'small', feature: 'pink', demon: true, trees: ['peach', 'peach', 'plum'] },
  yuling: { variant: 'small', feature: 'demon', demon: true, trees: ['dead', 'pine'] },
  qianhuan: { variant: 'small', trees: ['cypress', 'bamboo'] },
  tiansha: { variant: 'small', feature: 'demon', demon: true, trees: ['dead', 'cypress'] },
  huayi: { variant: 'small', trees: ['cypress', 'pine'] },
  taiyi: { variant: 'small', feature: 'temple', trees: ['pine', 'cypress', 'plum'] },
};

function rng(seed: number) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
export function strSeed(id: string) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** 这个地点用哪种骨架：有专门设定的照设定；别界或没写的，大宗门按种子从几种里挑，其余用小号 */
export function lookOf(l: { id: string; major?: boolean; island?: number }, mountain: boolean): SectLook {
  const set = SECT_LOOK[l.id];
  if (set?.variant) return { trees: ['pine', 'pine', 'cypress', 'broad'], ...set } as SectLook;
  if (!l.major) return { variant: 'small', trees: ['pine', 'cypress', 'broad'], ...set } as SectLook;
  const pool: SectVariant[] = l.island ? ['isle'] : mountain ? ['axis', 'cliff', 'twin'] : ['axis', 'lake', 'twin'];
  return { variant: pool[strSeed(l.id) % pool.length], trees: ['pine', 'pine', 'cypress', 'broad'], ...set } as SectLook;
}

// ---------------------------------------------------------------- 搭骨架的小工具
class Kit {
  terraces: SectTerrace[] = []; stairs: SectStair[] = []; isles: SectIsle[] = []; bridges: SectBridge[] = [];
  falls: SectFall[] = []; peaks: SectPeak[] = []; mists: SectMist[] = [];
  constructor(readonly k: number) {}
  T(id: string, role: TerraceRole, name: string, x: number, y: number, w: number, h: number, rise: number, o: Partial<SectTerrace> = {}) {
    const k = this.k;
    const t: SectTerrace = { id, role, name, x: x * k, y: y * k, w: w * k, h: h * k, rise, r: Math.min(w, h) * k * 0.22, ...o };
    this.terraces.push(t); return t;
  }
  get(id: string) { return this.terraces.find((t) => t.id === id)!; }
  /** 台沿在 (x, y) 沿 (dx, dy) 方向走到哪里出了台面（找台沿的确切位置；台面是圆角、南沿鼓出的） */
  edge(t: SectTerrace, x: number, y: number, dx: number, dy: number) {
    let d = 0; while (d < 6000 && rectDist(t, x + dx * d, y + dy * d) < 0) d += 5;
    return d;
  }
  /** 从 a 台登上 b 台的石阶：竖着（沿 x = 定值）或横着（沿 y = 定值）；起点在 a 台里 120，终点停在 b 台沿里 10 */
  link(a: string, b: string, at: number, w: number, along: 'v' | 'h') {
    const A = this.get(a), B = this.get(b);
    if (along === 'v') {
      const dir = B.y < A.y ? -1 : 1, x = at;
      const ea = this.edge(A, x, A.y, 0, dir), y1 = A.y + dir * (ea - 120);
      const eb = this.edge(B, x, B.y, 0, -dir), y2 = B.y - dir * (eb - 10);
      this.stairs.push({ x1: x, y1, x2: x, y2, w, lo: a, hi: b });
    } else {
      const dir = B.x < A.x ? -1 : 1, y = at;
      const ea = this.edge(A, A.x, y, dir, 0), x1 = A.x + dir * (ea - 120);
      const eb = this.edge(B, B.x, y, -dir, 0), x2 = B.x - dir * (eb - 10);
      this.stairs.push({ x1, y1: y, x2, y2: y, w, lo: a, hi: b });
    }
  }
}

export interface VariantResult {
  terraces: SectTerrace[]; stairs: SectStair[]; isles: SectIsle[]; bridges: SectBridge[]; falls: SectFall[]; peaks: SectPeak[]; mists: SectMist[];
  rx: number; ry: number; cx: number; cy: number; apron: number; floor: number;
  gate: { x: number; y: number }; gateOut: { x: number; y: number }; spawn: { x: number; y: number };
}

/**
 * 按骨架生成。mountain：在山里（台阶高差大、地界大）；否则在平地上堆一座小山（总高差一千以内、地界摊开一点）。
 * 坐标与青霞谷一样：x 向东、y 向南，北面是高处。
 */
export function variantPlan(look: SectLook, mountain: boolean, seed: number): VariantResult {
  const r = rng(seed), k = look.k ?? (look.variant === 'small' ? 1 : mountain ? 1.45 : 1.25), step = mountain ? 420 : 170;
  const K = new Kit(k);
  let gateY = 0;
  if (look.variant === 'axis') {
    K.T('gate', 'gate', '山门广场', 0, 4300, 1500, 800, 0, { bulge: 120 });
    K.T('yardsW', 'yards', '弟子院落', -1750, 2900, 1900, 1200, step, { bulge: 100 });
    K.T('axis', 'axis', '外门', 0, 2850, 1300, 1300, step, { bulge: 80 });
    K.T('yardsE', 'yards', '弟子院落', 1750, 2900, 1900, 1200, step, { bulge: 100 });
    K.T('drill', 'drill', '演武场', 0, 1250, 3200, 1500, step * 2, { bulge: 120 });
    K.T('lib', 'library', '藏经阁', -2650, 1000, 1300, 1500, step * 2 + step / 2);
    K.T('garden', 'garden', '灵药园', 2700, 1100, 1400, 1500, step * 2 - step / 2);
    K.T('main', 'main', '主殿广场', 0, -400, 2800, 1500, step * 3, { bulge: 140 });
    K.T('top', 'top', '祖师殿', 0, -1950, 2000, 1100, step * 4, { bulge: 100 });
    K.link('gate', 'axis', 0, 300, 'v');
    K.link('axis', 'yardsW', 2900 * k, 180, 'h'); K.link('axis', 'yardsE', 2900 * k, 180, 'h');
    K.link('axis', 'drill', 0, 300, 'v');
    K.link('drill', 'lib', 1150 * k, 200, 'h'); K.link('garden', 'drill', 1000 * k, 200, 'h');
    K.link('drill', 'main', 0, 320, 'v'); K.link('main', 'top', -500 * k, 220, 'v'); K.link('main', 'top', 500 * k, 220, 'v');
    K.peaks.push({ x: 0, y: -1600 * k, r: 6500 * k, rise: step * 4 + (mountain ? 600 : 200) });
    if (mountain) { K.isles.push({ id: 'isleA', x: 2600 * k, y: -2300 * k, r: 420 * k, rise: step * 4 + 300, seed: seed & 255 }); K.bridges.push({ x1: 1000 * k - 10, y1: -1950 * k, x2: 2600 * k - 400 * k, y2: -2300 * k, a: 'top', b: 'isleA', kind: 'chain', w: 130 }); }
    gateY = 4300 * k;
  } else if (look.variant === 'lake') {
    K.T('lake', 'lake', '湖', 0, 600, 2600, 1700, -90, { r: 780 });
    K.T('gate', 'gate', '山门广场', 0, 2450, 1400, 700, 0, { bulge: 100 });
    K.T('cause', 'causeway', '湖心长堤', 0, 650, 240, 1800, 0, { causeway: true, r: 0 });
    K.T('isl', 'perch', '湖心亭', 750, 500, 420, 420, 0, { r: 200 });
    K.T('main', 'main', '主殿广场', 0, -1150, 2800, 1100, step, { bulge: 140 });
    K.T('yardsE', 'yards', '东院', 2450, 200, 1500, 2400, step / 2, { r: 360 });
    K.T('yardsW', 'garden', '西园', -2450, 200, 1500, 2400, step / 2, { r: 360 });
    K.T('top', 'top', '后殿', 0, -2450, 1800, 900, step * 2, { bulge: 80 });
    K.T('lib', 'library', '藏经阁', 2300, -1900, 1100, 900, step * 2 - step / 2);
    K.link('cause', 'main', 0, 260, 'v');
    K.link('yardsE', 'main', -900 * k, 200, 'h'); K.link('yardsW', 'main', -900 * k, 200, 'h');
    K.link('main', 'top', 0, 260, 'v'); K.link('main', 'lib', -1450 * k, 200, 'h');
    K.peaks.push({ x: 0, y: -1800 * k, r: 5500 * k, rise: step * 2 + (mountain ? 500 : 150) });
    K.mists.push({ x: 0, y: 600 * k, rx: 1100 * k, ry: 700 * k, rise: -40 });
    gateY = 2450 * k;
  } else if (look.variant === 'twin') {
    K.T('gate', 'gate', '谷口广场', 0, 1900, 1600, 1000, 0, { bulge: 140 });
    K.T('W1', 'yards', '西峰院落', -2300, 800, 1800, 1300, step, { bulge: 100 });
    K.T('W2', 'main', '西峰主殿', -2350, -800, 1600, 1200, step * 2, { bulge: 100 });
    K.T('W3', 'top', '西峰顶', -2350, -2200, 1200, 900, step * 3);
    K.T('E1', 'garden', '东峰园', 2300, 700, 1800, 1300, step + step / 3, { bulge: 100 });
    K.T('E2', 'mid', '东峰诸堂', 2350, -900, 1600, 1200, step * 2 + step / 3, { bulge: 100 });
    K.T('E3', 'library', '东峰阁', 2350, -2300, 1200, 900, step * 3 + step / 3);
    K.T('valley', 'drill', '谷中演武场', 0, 300, 1500, 1500, step / 2, { r: 300 });
    K.link('gate', 'valley', 0, 280, 'v');
    K.link('valley', 'W1', 600 * k, 200, 'h'); K.link('valley', 'E1', 500 * k, 200, 'h');
    K.link('W1', 'W2', -2350 * k, 240, 'v'); K.link('W2', 'W3', -2350 * k, 220, 'v');
    K.link('E1', 'E2', 2350 * k, 240, 'v'); K.link('E2', 'E3', 2350 * k, 220, 'v');
    const hi = step * 3;
    K.bridges.push({ x1: -2350 * k + 600 * k - 10, y1: -2250 * k, x2: 2350 * k - 600 * k + 10, y2: -2250 * k, a: 'W3', b: 'E3', kind: 'chain', w: 140 });
    K.peaks.push({ x: -2350 * k, y: -1500 * k, r: 4200 * k, rise: hi + (mountain ? 500 : 150) }, { x: 2350 * k, y: -1500 * k, r: 4200 * k, rise: hi + step / 3 + (mountain ? 500 : 150) });
    // 瀑布：山里的落在谷口；平地堆的小山里，从桥下山沟北边的崖上落进沟里（见 sectPlan.ts 的 knollRise）
    K.falls.push(mountain ? { x: 0, y: -1700 * k, dx: 0, dy: 1, w: 220, from: 'valley' } : { x: 0, y: -2250 * k - 420, dx: 0, dy: 1, w: 200, from: 'valley' });
    gateY = 1900 * k;
  } else if (look.variant === 'cliff') {
    K.T('gate', 'gate', '山门广场', 0, 2300, 1600, 700, 0, { bulge: 120 });
    K.T('C1', 'yards', '崖下院落', 0, 1150, 4000, 900, step, { bulge: 140 });
    K.T('C2', 'mid', '中层栈阁', 0, -100, 3600, 750, step * 2, { bulge: 120 });
    K.T('C3', 'main', '主殿', 0, -1300, 3000, 800, step * 3, { bulge: 120 });
    K.T('C4', 'top', '崖顶祖师殿', 0, -2450, 2000, 750, step * 4, { bulge: 100 });
    K.link('gate', 'C1', 0, 300, 'v'); K.link('C1', 'C2', -1400 * k, 240, 'v');
    K.link('C2', 'C3', 1200 * k, 240, 'v'); K.link('C3', 'C4', -600 * k, 240, 'v');
    K.peaks.push({ x: 0, y: -3600 * k, r: 6800 * k, rise: step * 4 + (mountain ? 1400 : 300) });
    K.falls.push({ x: 1700 * k, y: -1750 * k, dx: 0, dy: 1, w: 220, from: 'C3' });
    gateY = 2300 * k;
  } else if (look.variant === 'isle') {
    K.T('gate', 'gate', '码头', 0, 2050, 1100, 600, 0, { bulge: 120 });
    K.T('ring', 'yards', '岛上院落', 0, 900, 3000, 1300, step, { bulge: 160, r: 520 });
    K.T('main', 'main', '主殿', 0, -500, 2300, 1100, step * 2, { bulge: 140 });
    K.T('top', 'top', '岛顶', 0, -1600, 1300, 800, step * 3, { r: 360 });
    K.link('gate', 'ring', 0, 280, 'v'); K.link('ring', 'main', -700 * k, 240, 'v'); K.link('ring', 'main', 700 * k, 240, 'v'); K.link('main', 'top', 0, 240, 'v');
    K.peaks.push({ x: 0, y: -900 * k, r: 3800 * k, rise: step * 3 + 150 });
    gateY = 2050 * k;
  } else {
    // 小号：山门 → 院落 → 正殿，两三层台地，高差一两百
    const s = mountain ? 160 : 100;
    K.T('gate', 'gate', '山门', 0, 1300, 1000, 520, 0, { bulge: 80 });
    K.T('yards', 'yards', '院落', 0, 250, 2100, 1000, s, { bulge: 100 });
    K.T('main', 'main', '正殿', 0, -900, 1600, 900, s * 2, { bulge: 100 });
    if (r() < 0.6) K.T('side', 'garden', '偏院', 1650, -500, 900, 1000, s + s / 2);
    K.link('gate', 'yards', 0, 240, 'v'); K.link('yards', 'main', 0, 260, 'v');
    if (K.terraces.some((t) => t.id === 'side')) K.link('side', 'main', -700 * k, 180, 'h');
    K.peaks.push({ x: 0, y: -700 * k, r: 3000 * k, rise: s * 2 + 120 });
    gateY = 1300 * k;
  }
  const small = look.variant === 'small';
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const t of K.terraces) { x0 = Math.min(x0, t.x - t.w / 2); x1 = Math.max(x1, t.x + t.w / 2); y0 = Math.min(y0, t.y - t.h / 2); y1 = Math.max(y1, t.y + t.h / 2); }
  const pad = small ? 500 : 900, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const gateEdge = gateY + K.get('gate').h / 2 + (K.get('gate').bulge ?? 0) - 10;
  // 山门外的引道：一段石阶从地界外的原地面登上山门广场
  // 岛上的宗门：码头就是山门，外面是海，不修引道
  const isle = look.variant === 'isle', out = isle ? gateEdge - 60 : gateEdge + (small ? 700 : 1300);
  if (!isle) K.stairs.push({ x1: 0, y1: out, x2: 0, y2: gateEdge, w: small ? 260 : 340, lo: 'ground', hi: 'gate' });
  return {
    terraces: K.terraces, stairs: K.stairs, isles: K.isles, bridges: K.bridges, falls: K.falls, peaks: K.peaks, mists: K.mists,
    cx, cy, rx: (x1 - x0) / 2 + pad, ry: (y1 - y0) / 2 + pad, apron: small ? 700 : 1300, floor: mountain ? -700 : 0,
    gate: { x: 0, y: gateEdge }, gateOut: { x: 0, y: out }, spawn: { x: 0, y: gateY },
  };
}

/**
 * 院落台上摆院子：一行行，宽窄不一、前后错开；占不下的空当种树、打井、晾衣；每行院门前一条小径。
 * 石阶两头留出落脚处；院子摆好之后，从每个石阶口绕开院墙找一条路走到台上的汇点（台心往前三成），
 * 画成小径（宗门的步行网也是这样绕的，见 gfx/sectLayout.ts 的 linkOn），石阶口不会被成片的院墙堵死。
 * 结果写进规划（布局摆院子、底图画小径都用这一份）。
 */
export function placeYards(p: GrandSectPlan, seed: number): { yards: SectYard[]; paths: SectPath[] } {
  const r = rng(seed ^ 0x9a3d), yards: SectYard[] = [], paths: SectPath[] = [];
  for (const t of p.terraces) {
    if (t.role !== 'yards') continue;
    const hubY = t.y + t.h * 0.3;
    // 石阶两头各留一块 200 深的落脚处（院子不堵在石阶口前）
    const landing = (qx: number, qy: number) => p.stairs.some((s) => { const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1), ux = (s.x2 - s.x1) / L, uy = (s.y2 - s.y1) / L, a = (qx - s.x1) * ux + (qy - s.y1) * uy, side = Math.abs((qx - s.x1) * uy - (qy - s.y1) * ux); return side < s.w / 2 + 30 && ((a < 0 && a > -200) || (a > L && a < L + 200)); });
    const clear = (x0: number, y0: number, x1: number, y1: number) => {
      for (const [qx, qy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2], [(x0 + x1) / 2, (y0 + y1) / 2]]) {
        if (rectDist(t, qx, qy) > -80 || onPlanStair(p, qx, qy, 110) || landing(qx, qy)) return false;
      }
      return !onPlanStair(p, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.4) && !(Math.abs((x0 + x1) / 2 - t.x) < (x1 - x0) / 2 + 180 && t.w > 2600);
    };
    const mine: SectYard[] = [];
    for (let y = t.y + t.h / 2 + (t.bulge ?? 0) * 0.5 - 70; y > t.y - t.h / 2 + 260; ) {
      const kind = r() < 0.25 ? 2 : r() < 0.3 ? 3 : 1, d = kind === 2 ? 360 : 250 + r() * 50;
      let rowLo = Infinity, rowHi = -Infinity, gateY = -Infinity;
      for (let x = t.x - t.w / 2 + 50; x < t.x + t.w / 2 - 250; ) {
        const w = kind === 3 ? 300 + r() * 40 : 240 + r() * 120, cy = y - d / 2 - 10 - r() * 30, cx = x + w / 2;
        if (clear(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2 + 30) && r() < 0.88) {
          const q = { x: cx, y: cy, w, d, kind, lit: r() < 0.8, roof: r() < 0.5 ? 0 : 1, fill: '' }; yards.push(q); mine.push(q);
          rowLo = Math.min(rowLo, cx); rowHi = Math.max(rowHi, cx); gateY = Math.max(gateY, cy + d / 2);
          x += w + 40 + r() * 50;
        } else {
          if (clear(cx - 110, cy - 110, cx + 110, cy + 110)) { const q = r(); yards.push({ x: cx, y: cy, w: 0, d: 0, kind: 0, lit: false, roof: 0, fill: q < 0.55 ? 'tree' : q < 0.78 ? 'well' : 'rack' }); }
          x += 200;
        }
      }
      // 这一行院门前的小径
      if (rowHi > rowLo) paths.push({ x1: rowLo - 150, y1: gateY + 40, x2: rowHi + 150, y2: gateY + 40, w: 60 });
      y -= d + 60 + r() * 30;
    }
    // 每个石阶口绕开院墙走到汇点：按 60 一格找路、拉直，画成小径
    const blocked = (qx: number, qy: number) => rectDist(t, qx, qy) > -50 && !onPlanStair(p, qx, qy, 0) || mine.some((q) => Math.abs(qx - q.x) < q.w / 2 + 25 && Math.abs(qy - q.y) < q.d / 2 + 25);
    for (const s of p.stairs) for (const [sx, sy] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      if (rectDist(t, sx, sy) > 20) continue;
      const route = gridRoute(t, sx, sy, t.x, hubY, blocked);
      for (let i = 1; i < route.length; i++) paths.push({ x1: route[i - 1][0], y1: route[i - 1][1], x2: route[i][0], y2: route[i][1], w: 80 });
    }
  }
  return { yards, paths };
}
/** 台面上按 60 一格从 (ax, ay) 找路到 (bx, by)，绕开 blocked 的格子；拉直后返回折线（含两头）。找不到就返回直线 */
export function gridRoute(t: SectTerrace, ax: number, ay: number, bx: number, by: number, blocked: (x: number, y: number) => boolean): [number, number][] {
  const see = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 25)); for (let k = 1; k < n; k++) if (blocked(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)) return false; return true; };
  if (see(ax, ay, bx, by)) return [[ax, ay], [bx, by]];
  const C = 60, x0 = t.x - t.w / 2, y0 = t.y - t.h / 2, nx = Math.ceil(t.w / C) + 1, ny = Math.ceil((t.h + (t.bulge ?? 0)) / C) + 1;
  const cell = (x: number, y: number) => { const i = Math.round((x - x0) / C), j = Math.round((y - y0) / C); return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i; };
  const cx = (c: number) => x0 + (c % nx) * C, cy = (c: number) => y0 + Math.floor(c / nx) * C;
  const s0 = cell(ax, ay), s1 = cell(bx, by);
  if (s0 < 0 || s1 < 0) return [[ax, ay], [bx, by]];
  const prev = new Int32Array(nx * ny).fill(-2); prev[s0] = -1; const q = [s0];
  for (let qi = 0; qi < q.length && prev[s1] === -2; qi++) {
    const c = q[qi], i = c % nx, j = Math.floor(c / nx);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const u = i + di, v = j + dj; if (u < 0 || v < 0 || u >= nx || v >= ny) continue;
      const n = v * nx + u; if (prev[n] !== -2 || (n !== s1 && blocked(cx(n), cy(n)))) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[s1] === -2) return [[ax, ay], [bx, by]];
  const path: [number, number][] = []; for (let c = prev[s1]; c >= 0 && c !== s0; c = prev[c]) path.unshift([cx(c), cy(c)]);
  path.push([bx, by]);
  const out: [number, number][] = [[ax, ay]];
  for (let i = 0; i < path.length; ) {
    const [px, py] = out[out.length - 1];
    let j = path.length - 1; while (j > i && !see(px, py, path[j][0], path[j][1])) j--;
    out.push(path[j]); i = j + 1;
  }
  return out;
}
