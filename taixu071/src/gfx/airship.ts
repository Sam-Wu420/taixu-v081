// 修仙界宗门飞舟（真 2.5D 八方向深腹古代楼船 + 多主题/高阶可扩展 + 离屏精灵缓存零帧率损耗）
import { makeCanvas } from '../core/canvas';

export type AirshipTier = 1 | 2 | 3 | (number & {});
export type AirshipStyle = 'zheng' | 'mo' | 'ling' | 'xian' | (string & {});
export type AirshipDir8 = 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'n' | 'ne';
export type AirshipBaseDir = 'e' | 'se' | 's' | 'ne' | 'n';

export interface AirshipTheme {
  id: string;
  label: string;
  hullLight: string;
  hullColor: string;
  hullShade: string;
  hullDeep: string;
  deckLight: string;
  deckColor: string;
  deckShade: string;
  keelColor: string;
  trimColor: string;
  trimBright: string;
  pillarColor: string;
  wallLight: string;
  wallColor: string;
  wallShade: string;
  roofHighlight: string;
  roofColor: string;
  roofShade: string;
  windowFrame: string;
  windowGlow: string;
  doorColor: string;
  sailLight: string;
  sailColor: string;
  sailEdge: string;
  flagColor: string;
  lanternColor: string;
  glowRgb: string;
  spiky?: boolean;
  ornament?: 'standard' | 'spiky' | 'lotus' | 'halo';
  drawExtra?: (g: CanvasRenderingContext2D, spec: AirshipVisualSpec, theme: AirshipTheme) => void;
}

export const AIRSHIP_THEMES: Record<string, AirshipTheme> = {
  zheng: {
    id: 'zheng',
    label: '人界正道',
    hullLight: '#a67a4e',
    hullColor: '#7a5433',
    hullShade: '#52361e',
    hullDeep: '#331f10',
    deckLight: '#d8b683',
    deckColor: '#bd9764',
    deckShade: '#967145',
    keelColor: '#2d1b0e',
    trimColor: '#e5bf62',
    trimBright: '#ffe79a',
    pillarColor: '#702a22',
    wallLight: '#f6efe2',
    wallColor: '#e8decb',
    wallShade: '#c4b69d',
    roofHighlight: '#477b91',
    roofColor: '#274f61',
    roofShade: '#183442',
    windowFrame: '#291a10',
    windowGlow: '#ffda6b',
    doorColor: '#7c2b21',
    sailLight: '#efe3c6',
    sailColor: '#d7c59d',
    sailEdge: '#735837',
    flagColor: '#2f658a',
    lanternColor: '#ffc254',
    glowRgb: '115,218,248',
    ornament: 'standard',
  },
  mo: {
    id: 'mo',
    label: '人界魔道',
    hullLight: '#5a3441',
    hullColor: '#3d222c',
    hullShade: '#26141b',
    hullDeep: '#160a0f',
    deckLight: '#472c37',
    deckColor: '#341f28',
    deckShade: '#22131a',
    keelColor: '#12080c',
    trimColor: '#df566b',
    trimBright: '#ff8a9c',
    pillarColor: '#4e121e',
    wallLight: '#3f2832',
    wallColor: '#2e1d25',
    wallShade: '#1d1117',
    roofHighlight: '#86283e',
    roofColor: '#591828',
    roofShade: '#380d18',
    windowFrame: '#12060a',
    windowGlow: '#ff5970',
    doorColor: '#450d18',
    sailLight: '#6e2230',
    sailColor: '#4c1621',
    sailEdge: '#c94c5f',
    flagColor: '#9b2133',
    lanternColor: '#ff4862',
    glowRgb: '238,76,98',
    spiky: true,
    ornament: 'spiky',
  },
  ling: {
    id: 'ling',
    label: '灵界宗门',
    hullLight: '#5a948c',
    hullColor: '#3a6660',
    hullShade: '#244540',
    hullDeep: '#162c29',
    deckLight: '#a6cfc7',
    deckColor: '#82afa7',
    deckShade: '#5d8780',
    keelColor: '#122623',
    trimColor: '#9ef0e2',
    trimBright: '#d6fff7',
    pillarColor: '#225954',
    wallLight: '#f4fbf9',
    wallColor: '#e2f0ed',
    wallShade: '#c0dad4',
    roofHighlight: '#367e90',
    roofColor: '#1d505e',
    roofShade: '#11343e',
    windowFrame: '#11303a',
    windowGlow: '#8dfae9',
    doorColor: '#1e5e59',
    sailLight: '#d5f5ef',
    sailColor: '#a7ded4',
    sailEdge: '#3e7f76',
    flagColor: '#257874',
    lanternColor: '#98fff0',
    glowRgb: '128,246,225',
    ornament: 'lotus',
  },
  xian: {
    id: 'xian',
    label: '仙界仙舫',
    hullLight: '#cfa052',
    hullColor: '#9e7434',
    hullShade: '#704f1e',
    hullDeep: '#4a3210',
    deckLight: '#f5deaa',
    deckColor: '#e2c484',
    deckShade: '#b89652',
    keelColor: '#422c0c',
    trimColor: '#ffe794',
    trimBright: '#fff6c9',
    pillarColor: '#802f28',
    wallLight: '#fdf9ef',
    wallColor: '#f3ead5',
    wallShade: '#d8caa9',
    roofHighlight: '#9264be',
    roofColor: '#623d86',
    roofShade: '#41255c',
    windowFrame: '#451815',
    windowGlow: '#fff2b0',
    doorColor: '#8d2f24',
    sailLight: '#fff4d4',
    sailColor: '#ebd49c',
    sailEdge: '#9b7430',
    flagColor: '#7c48a0',
    lanternColor: '#ffe888',
    glowRgb: '255,222,130',
    ornament: 'halo',
  },
};

export function registerAirshipTheme(theme: AirshipTheme) {
  AIRSHIP_THEMES[theme.id] = theme;
}

export interface AirshipVisualSpec {
  tier: AirshipTier;
  style: AirshipStyle;
  hullColor?: string;
  trimColor?: string;
  glowRgb?: string;
  bannerText?: string;
  convoyCargo?: boolean;
  customScale?: number;
}

export interface AirshipSpriteMetrics {
  w: number;
  h: number;
  ax: number;
  ay: number;
  halfL: number;
  halfW: number;
  hullH: number;
  worldScale: number;
  shieldRx: number;
  shieldRy: number;
  hullLength: number;
}

// 相对上版整体放大 2 倍（一阶 ~580px / 二阶 ~940px / 三阶 ~1440px，百米级修仙巨舟体量）
// 离屏画布按 1.35× 精度烘焙 + 1.48× 世界放大（合计 2.0× 真实尺寸），兼顾清晰度与显存占用
export const AIRSHIP_METRICS: Record<number, AirshipSpriteMetrics> = {
  1: { w: 620, h: 510, ax: 310, ay: 300, halfL: 184, halfW: 57, hullH: 65, worldScale: 1.48, shieldRx: 368, shieldRy: 252, hullLength: 580 },
  2: { w: 970, h: 780, ax: 485, ay: 465, halfL: 305, halfW: 94, hullH: 108, worldScale: 1.48, shieldRx: 608, shieldRy: 410, hullLength: 940 },
  3: { w: 1400, h: 1110, ax: 700, ay: 655, halfL: 467, halfW: 140, hullH: 162, worldScale: 1.48, shieldRx: 892, shieldRy: 608, hullLength: 1440 },
};

export function registerAirshipTier(tier: number, metrics: AirshipSpriteMetrics) {
  AIRSHIP_METRICS[tier] = metrics;
}

export function getAirshipMetrics(tier: AirshipTier): AirshipSpriteMetrics {
  return AIRSHIP_METRICS[tier] ?? AIRSHIP_METRICS[3];
}

/** 飞舟护罩/底影椭圆随 2.5D 航向角度旋转与透视压扁 */
export function getAirshipShieldAxes(tier: AirshipTier, angle: number, scale = 1): { rx: number; ry: number; rot: number } {
  const m = getAirshipMetrics(tier);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = m.shieldRx * Math.hypot(c, s * 0.72) * scale;
  const ry = m.shieldRy * (0.76 + 0.24 * Math.abs(c)) * scale;
  const rot = Math.atan2(s * 0.72, c);
  return { rx, ry, rot };
}

/** 计算飞舟连同护盾/尾焰的完整世界绘制包围盒与锚点（供 WebGL scratchDraw 与裁剪统一使用） */
export function getAirshipDrawBounds(tier: AirshipTier, scale = 1): { w: number; h: number; ax: number; ay: number } {
  const m = getAirshipMetrics(tier);
  const ds = (m.worldScale ?? 1) * scale;
  const shieldOffY = (tier === 3 ? 84 : tier === 2 ? 56 : 36) * scale;
  const maxExtX = Math.max(m.shieldRx, m.shieldRy) * scale;
  const maxExtY = Math.max(m.shieldRx * 0.72, m.shieldRy) * scale;
  const halfW = Math.max(m.ax * ds, (m.w - m.ax) * ds, maxExtX) + 40 * scale;
  const topH = Math.max(m.ay * ds, maxExtY + shieldOffY) + 40 * scale;
  const botH = Math.max((m.h - m.ay) * ds, maxExtY - shieldOffY) + 60 * scale;
  return {
    w: Math.ceil(halfW * 2),
    h: Math.ceil(topH + botH),
    ax: Math.ceil(halfW),
    ay: Math.ceil(topH),
  };
}

export function resolveAirshipTheme(spec: AirshipVisualSpec): AirshipTheme {
  const base = AIRSHIP_THEMES[spec.style] ?? AIRSHIP_THEMES.zheng;
  if (!spec.hullColor && !spec.trimColor && !spec.glowRgb) return base;
  return {
    ...base,
    hullColor: spec.hullColor ?? base.hullColor,
    hullLight: spec.hullColor ?? base.hullLight,
    trimColor: spec.trimColor ?? base.trimColor,
    glowRgb: spec.glowRgb ?? base.glowRgb,
  };
}

export function airshipDirFromVec(dx: number, dy: number): AirshipDir8 {
  if (dx * dx + dy * dy < 1e-4) return 'e';
  return airshipDirFromAngle(Math.atan2(dy, dx));
}

export function airshipDirFromAngle(ang: number): AirshipDir8 {
  if (!Number.isFinite(ang)) return 'e';
  let a = ang;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const oct = Math.round(a / (Math.PI / 4));
  const map: Record<number, AirshipDir8> = {
    0: 'e', 1: 'se', 2: 's', 3: 'sw', 4: 'w', '-4': 'w', '-3': 'nw', '-2': 'n', '-1': 'ne',
  };
  return map[oct] ?? 'e';
}

export function angleOfAirshipDir(dir: AirshipDir8): number {
  switch (dir) {
    case 'e': return 0;
    case 'se': return Math.PI * 0.25;
    case 's': return Math.PI * 0.5;
    case 'sw': return Math.PI * 0.75;
    case 'w': return Math.PI;
    case 'nw': return -Math.PI * 0.75;
    case 'n': return -Math.PI * 0.5;
    case 'ne': return -Math.PI * 0.25;
  }
}

export function resolveDir8(dir: AirshipDir8): { base: AirshipBaseDir; flip: 1 | -1; yaw: number } {
  switch (dir) {
    case 'e': return { base: 'e', flip: 1, yaw: 0 };
    case 'w': return { base: 'e', flip: -1, yaw: 0 };
    case 'se': return { base: 'se', flip: 1, yaw: Math.PI * 0.23 };
    case 'sw': return { base: 'se', flip: -1, yaw: Math.PI * 0.23 };
    case 's': return { base: 's', flip: 1, yaw: Math.PI * 0.5 };
    case 'ne': return { base: 'ne', flip: 1, yaw: -Math.PI * 0.23 };
    case 'nw': return { base: 'ne', flip: -1, yaw: -Math.PI * 0.23 };
    case 'n': return { base: 'n', flip: 1, yaw: -Math.PI * 0.5 };
  }
}

const SPRITE_CACHE = new Map<string, HTMLCanvasElement>();
const WRECK_CACHE = new Map<string, HTMLCanvasElement>();
const MAX_SPRITES = 384;

const AIRSHIP_YAW_STEP = Math.PI / 36; // 5° 步进，全周 72 连续朝向（半周 37 档镜像缓存）

export function resolveAirshipAnglePose(angle: number): { flip: 1 | -1; yaw: number; binKey: string } {
  let a = Number.isFinite(angle) ? angle : 0;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const flip: 1 | -1 = Math.cos(a) < -1e-4 ? -1 : 1;
  const rawYaw = flip === -1 ? (a >= 0 ? Math.PI - a : -Math.PI - a) : a;
  const bin = Math.max(-18, Math.min(18, Math.round(rawYaw / AIRSHIP_YAW_STEP)));
  const yaw = bin * AIRSHIP_YAW_STEP;
  return { flip, yaw, binKey: `a${bin}` };
}

// ===== 2.5D 斜俯视三维投影引擎 =====
type V3 = [number, number, number];
type P2 = [number, number];

interface Proj {
  yaw: number;
  cosY: number;
  sinY: number;
  tiltY: number;
  p: (v: V3) => P2;
  depth: (v: V3) => number;
}

function makeProj(yaw: number): Proj {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const tiltY = 0.56;
  const p = ([lx, ly, lz]: V3): P2 => {
    const wx = lx * cosY - ly * sinY;
    const wy = lx * sinY + ly * cosY;
    return [wx, wy * tiltY - lz];
  };
  const depth = ([lx, ly, lz]: V3): number => (lx * sinY + ly * cosY) + lz * 0.12;
  return { yaw, cosY, sinY, tiltY, p, depth };
}

function inkStroke(g: CanvasRenderingContext2D, color = 'rgba(22,14,10,0.85)', lw = 1.4) {
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.lineCap = 'round';
}

function poly2(g: CanvasRenderingContext2D, pts: P2[], fill?: string | CanvasGradient, stroke?: string, lw = 1.35) {
  if (pts.length < 3) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { inkStroke(g, stroke, lw); g.stroke(); }
}

function poly3(g: CanvasRenderingContext2D, pr: Proj, pts: V3[], fill?: string | CanvasGradient, stroke?: string, lw = 1.35) {
  poly2(g, pts.map(pr.p), fill, stroke, lw);
}

function line3(g: CanvasRenderingContext2D, pr: Proj, a: V3, b: V3, stroke: string, lw = 1.4) {
  const pa = pr.p(a), pb = pr.p(b);
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(pa[0], pa[1]);
  g.lineTo(pb[0], pb[1]);
  g.stroke();
}

function ring3(
  g: CanvasRenderingContext2D,
  pr: Proj,
  cx: number,
  cy: number,
  cz: number,
  rY: number,
  rZ: number,
  glowRgb: string,
  lw = 1.8,
) {
  g.save();
  const drawEllipse3 = (scale: number, alpha: number, width: number) => {
    g.strokeStyle = `rgba(${glowRgb},${alpha})`;
    g.lineWidth = width;
    g.beginPath();
    const segs = 20;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const pt = pr.p([cx, cy + Math.cos(a) * rY * scale, cz + Math.sin(a) * rZ * scale]);
      if (i === 0) g.moveTo(pt[0], pt[1]);
      else g.lineTo(pt[0], pt[1]);
    }
    g.stroke();
  };
  drawEllipse3(1.0, 0.88, lw);
  drawEllipse3(0.64, 0.48, Math.max(1.0, lw * 0.65));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    line3(
      g,
      pr,
      [cx, cy + Math.cos(a) * rY * 0.64, cz + Math.sin(a) * rZ * 0.64],
      [cx, cy + Math.cos(a) * rY, cz + Math.sin(a) * rZ],
      `rgba(${glowRgb},0.55)`,
      Math.max(1, lw * 0.55),
    );
  }
  g.restore();
}

/** 3D 古代重檐斗拱楼阁（含石阶基座、朱红廊柱与斗拱托梁、雕花回廊栏杆、大门牌匾、反宇飞檐瓦垄与脊兽宫灯） */
function drawPavilion3D(
  g: CanvasRenderingContext2D,
  pr: Proj,
  cx: number,
  cy: number,
  baseZ: number,
  len: number,
  wid: number,
  storyH: number,
  floors: number,
  theme: AirshipTheme,
  opts: { withDetail?: boolean; isMain?: boolean; taper?: number } = {},
) {
  const withDetail = opts.withDetail ?? true;
  const isMain = opts.isMain ?? false;
  const taper = opts.taper ?? 0.14;
  let z = baseZ;

  // 主殿底层须弥木石台基 + 前台阶梯（所有阶位保持统一真人尺度的单层楼高，大船以面积与开间取胜）
  if (isMain && withDetail) {
    const px = len * 0.56, py = wid * 0.56, pz = 5;
    const baseFaces: Array<{ pts: V3[]; c: V3; fill: string }> = [
      { pts: [[cx - px, cy + py, z], [cx + px, cy + py, z], [cx + px, cy + py, z + pz], [cx - px, cy + py, z + pz]], c: [cx, cy + py, z + 2.5], fill: theme.hullColor },
      { pts: [[cx - px, cy - py, z], [cx + px, cy - py, z], [cx + px, cy - py, z + pz], [cx - px, cy - py, z + pz]], c: [cx, cy - py, z + 2.5], fill: theme.hullShade },
      { pts: [[cx + px, cy - py, z], [cx + px, cy + py, z], [cx + px, cy + py, z + pz], [cx + px, cy - py, z + pz]], c: [cx + px, cy, z + 2.5], fill: theme.hullLight },
      { pts: [[cx - px, cy - py, z], [cx - px, cy + py, z], [cx - px, cy + py, z + pz], [cx - px, cy - py, z + pz]], c: [cx - px, cy, z + 2.5], fill: theme.hullShade },
    ];
    baseFaces.sort((a, b) => pr.depth(a.c) - pr.depth(b.c));
    for (const bf of baseFaces) poly3(g, pr, bf.pts, bf.fill, 'rgba(20,12,8,0.8)', 1.1);
    poly3(
      g,
      pr,
      [[cx - px, cy - py, z + pz], [cx + px, cy - py, z + pz], [cx + px, cy + py, z + pz], [cx - px, cy + py, z + pz]],
      theme.deckShade,
      'rgba(20,12,8,0.8)',
      1.1,
    );
    // 台基前向石木台阶（朝向 +X 前甲板）
    for (let st = 0; st < 3; st++) {
      const sx0 = cx + px + st * 3.5;
      const sx1 = sx0 + 4;
      const sz = z + pz - st * 1.6;
      poly3(
        g,
        pr,
        [[sx0, cy - Math.min(26, wid * 0.24), sz], [sx1, cy - Math.min(26, wid * 0.24), sz], [sx1, cy + Math.min(26, wid * 0.24), sz], [sx0, cy + Math.min(26, wid * 0.24), sz]],
        theme.deckLight,
        'rgba(20,12,8,0.75)',
        0.9,
      );
    }
    z += pz;
  }

  const sideOrder: Array<{ face: 'n' | 's' | 'e' | 'w'; center: V3 }> = [];
  for (let f = 0; f < floors; f++) {
    const fl = len * (1 - f * taper);
    const fw = wid * (1 - f * taper);
    // 每层理论层高保持人尺一致（底层挑高，上层清晰饱满），避免高阶或小舟楼层被压扁
    const fh = f === 0 ? storyH : Math.max(18, storyH * 0.88);
    const hx = fl * 0.5, hy = fw * 0.5;
    const z0 = z, z1 = z + fh;

    // 外挑回廊木台与雕花望柱栏杆（所有层都带回廊，越显楼阁层叠）
    if (withDetail && (f > 0 || isMain)) {
      const bdx = hx + 6.5, bdy = hy + 6.5;
      poly3(
        g,
        pr,
        [[cx - bdx, cy - bdy, z0], [cx + bdx, cy - bdy, z0], [cx + bdx, cy + bdy, z0], [cx - bdx, cy + bdy, z0]],
        theme.deckShade,
        'rgba(22,14,10,0.8)',
        1.1,
      );
      const railEdges: Array<[V3, V3]> = [
        [[cx - bdx, cy + bdy, z0], [cx + bdx, cy + bdy, z0]],
        [[cx - bdx, cy - bdy, z0], [cx + bdx, cy - bdy, z0]],
        [[cx + bdx, cy - bdy, z0], [cx + bdx, cy + bdy, z0]],
        [[cx - bdx, cy - bdy, z0], [cx - bdx, cy + bdy, z0]],
      ];
      for (const [ra, rb] of railEdges) {
        line3(g, pr, [ra[0], ra[1], z0 + 4.8], [rb[0], rb[1], z0 + 4.8], theme.trimColor, 1.25);
        line3(g, pr, [ra[0], ra[1], z0 + 2.4], [rb[0], rb[1], z0 + 2.4], theme.pillarColor, 0.85);
        const edgeLen = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]);
        const posts = Math.max(3, Math.round(edgeLen / 22));
        for (let pi = 0; pi <= posts; pi++) {
          const u = pi / posts;
          const px = ra[0] + (rb[0] - ra[0]) * u;
          const py = ra[1] + (rb[1] - ra[1]) * u;
          line3(g, pr, [px, py, z0], [px, py, z0 + 5.6], theme.pillarColor, 1.15);
        }
      }
    }

    sideOrder.length = 0;
    sideOrder.push(
      { face: 's', center: [cx, cy + hy, (z0 + z1) * 0.5] },
      { face: 'n', center: [cx, cy - hy, (z0 + z1) * 0.5] },
      { face: 'e', center: [cx + hx, cy, (z0 + z1) * 0.5] },
      { face: 'w', center: [cx - hx, cy, (z0 + z1) * 0.5] },
    );
    sideOrder.sort((a, b) => pr.depth(a.center) - pr.depth(b.center));

    const drawWallFace = (face: 'n' | 's' | 'e' | 'w') => {
      let corners: V3[];
      let wallFill: string;
      let isLong = false;
      if (face === 's') {
        corners = [[cx - hx, cy + hy, z0], [cx + hx, cy + hy, z0], [cx + hx, cy + hy, z1], [cx - hx, cy + hy, z1]];
        wallFill = theme.wallColor;
        isLong = true;
      } else if (face === 'n') {
        corners = [[cx - hx, cy - hy, z0], [cx + hx, cy - hy, z0], [cx + hx, cy - hy, z1], [cx - hx, cy - hy, z1]];
        wallFill = theme.wallShade;
        isLong = true;
      } else if (face === 'e') {
        corners = [[cx + hx, cy - hy, z0], [cx + hx, cy + hy, z0], [cx + hx, cy + hy, z1], [cx + hx, cy - hy, z1]];
        wallFill = theme.wallLight;
      } else {
        corners = [[cx - hx, cy - hy, z0], [cx - hx, cy + hy, z0], [cx - hx, cy + hy, z1], [cx - hx, cy - hy, z1]];
        wallFill = theme.wallShade;
      }
      poly3(g, pr, corners, wallFill, 'rgba(22,14,10,0.82)', 1.25);

      // 檐下投射深影 + 额枋横梁
      poly3(
        g,
        pr,
        [[corners[3][0], corners[3][1], z1 - fh * 0.22], [corners[2][0], corners[2][1], z1 - fh * 0.22], corners[2], corners[3]],
        'rgba(18,12,10,0.28)',
      );

      if (!withDetail) return;

      const a0 = corners[0], a1 = corners[1];
      // 额枋彩绘横梁 + 腰裙板线
      line3(g, pr, [a0[0], a0[1], z1 - fh * 0.16], [a1[0], a1[1], z1 - fh * 0.16], theme.pillarColor, 1.8);
      line3(g, pr, [a0[0], a0[1], z0 + fh * 0.18], [a1[0], a1[1], z0 + fh * 0.18], theme.trimColor, 1.0);

      // 朱红立柱（角柱 + 间柱）与斗拱托架小块
      const spanLen = isLong ? fl : fw;
      const bays = Math.max(2, Math.floor(spanLen / 20));
      for (let b = 0; b <= bays; b++) {
        const u = b / bays;
        const px = a0[0] + (a1[0] - a0[0]) * u;
        const py = a0[1] + (a1[1] - a0[1]) * u;
        line3(g, pr, [px, py, z0], [px, py, z1], theme.pillarColor, b === 0 || b === bays ? 2.2 : 1.6);
        // 柱头斗拱（横托短枋）
        const dp = pr.p([px, py, z1 - fh * 0.08]);
        g.fillStyle = theme.trimColor;
        g.fillRect(dp[0] - 2.6, dp[1] - 1.5, 5.2, 2.4);
      }

      // 门窗排布：底层东正面(面向前甲板)安放朱红格栅大门 + 金字匾额，其余开间配十字窗棂
      for (let b = 0; b < bays; b++) {
        const u0 = (b + 0.18) / bays;
        const u1 = (b + 0.82) / bays;
        const wx0 = a0[0] + (a1[0] - a0[0]) * u0;
        const wy0 = a0[1] + (a1[1] - a0[1]) * u0;
        const wx1 = a0[0] + (a1[0] - a0[0]) * u1;
        const wy1 = a0[1] + (a1[1] - a0[1]) * u1;

        const isDoor = isMain && f === 0 && face === 'e' && b === Math.floor(bays / 2);
        if (isDoor) {
          const dz0 = z0 + 1, dz1 = z0 + fh * 0.72;
          poly3(g, pr, [[wx0, wy0, dz0], [wx1, wy1, dz0], [wx1, wy1, dz1], [wx0, wy0, dz1]], theme.doorColor, theme.windowFrame, 1.1);
          // 对开中缝与铜门环
          const mx = (wx0 + wx1) * 0.5, my = (wy0 + wy1) * 0.5;
          line3(g, pr, [mx, my, dz0], [mx, my, dz1], theme.windowFrame, 1.1);
          const ringP = pr.p([mx, my, (dz0 + dz1) * 0.5]);
          g.fillStyle = theme.trimBright;
          g.beginPath(); g.arc(ringP[0] - 1.5, ringP[1], 1.3, 0, Math.PI * 2); g.arc(ringP[0] + 1.5, ringP[1], 1.3, 0, Math.PI * 2); g.fill();
          // 门上方金边匾额
          poly3(
            g,
            pr,
            [[wx0, wy0, dz1 + 2], [wx1, wy1, dz1 + 2], [wx1, wy1, z1 - 2], [wx0, wy0, z1 - 2]],
            theme.windowFrame,
            theme.trimColor,
            1.0,
          );
        } else {
          const wz0 = z0 + fh * 0.24;
          const wz1 = z0 + fh * 0.72;
          poly3(g, pr, [[wx0, wy0, wz0], [wx1, wy1, wz0], [wx1, wy1, wz1], [wx0, wy0, wz1]], theme.windowFrame);
          const pad = 0.09;
          const ix0 = wx0 + (wx1 - wx0) * pad, iy0 = wy0 + (wy1 - wy0) * pad;
          const ix1 = wx1 - (wx1 - wx0) * pad, iy1 = wy1 - (wy1 - wy0) * pad;
          poly3(g, pr, [[ix0, iy0, wz0 + 1.5], [ix1, iy1, wz0 + 1.5], [ix1, iy1, wz1 - 1.5], [ix0, iy0, wz1 - 1.5]], theme.windowGlow);
          line3(g, pr, [(ix0 + ix1) * 0.5, (iy0 + iy1) * 0.5, wz0 + 1.5], [(ix0 + ix1) * 0.5, (iy0 + iy1) * 0.5, wz1 - 1.5], theme.windowFrame, 0.95);
          line3(g, pr, [ix0, iy0, (wz0 + wz1) * 0.5], [ix1, iy1, (wz0 + wz1) * 0.5], theme.windowFrame, 0.95);
        }
      }
    };

    for (const s of sideOrder) drawWallFace(s.face);

    // 凹曲反宇飞檐屋顶（中间楼层用明晰腰檐防止遮挡上层立面，顶层保留饱满高脊）
    const isTopFloor = f === floors - 1;
    const rx = hx + Math.min(isTopFloor ? 18 : 13, Math.max(8, hx * 0.24));
    const ry = hy + Math.min(isTopFloor ? 18 : 13, Math.max(8, hy * 0.26));
    const roofRise = isTopFloor
      ? Math.min(24, Math.max(12, Math.min(fl, fw) * 0.16))
      : Math.min(13, Math.max(7.5, Math.min(fl, fw) * 0.11));
    const rzTop = z1 + roofRise;
    const ridgeX = isTopFloor ? hx * 0.28 : hx * 0.62;
    const eaveZ = z1 - 1.5;
    const cornerRaise = theme.spiky ? 7.5 : 5.5;
    const cSW: V3 = [cx - rx, cy + ry, eaveZ + cornerRaise];
    const cSE: V3 = [cx + rx, cy + ry, eaveZ + cornerRaise];
    const cNE: V3 = [cx + rx, cy - ry, eaveZ + cornerRaise];
    const cNW: V3 = [cx - rx, cy - ry, eaveZ + cornerRaise];
    const rW: V3 = [cx - ridgeX, cy, rzTop];
    const rE: V3 = [cx + ridgeX, cy, rzTop];

    const slopes: Array<{ pts: V3[]; fill: string; center: V3; ribCount: number }> = [
      { pts: [cNW, cNE, rE, rW], fill: theme.roofShade, center: [cx, cy - ry * 0.5, (eaveZ + rzTop) * 0.5], ribCount: Math.max(3, Math.round(fl / 24)) },
      { pts: [cSW, cSE, rE, rW], fill: theme.roofColor, center: [cx, cy + ry * 0.5, (eaveZ + rzTop) * 0.5], ribCount: Math.max(3, Math.round(fl / 24)) },
      { pts: [cSE, cNE, rE], fill: theme.roofHighlight, center: [cx + rx * 0.6, cy, (eaveZ + rzTop) * 0.5], ribCount: Math.max(2, Math.round(fw / 28)) },
      { pts: [cSW, cNW, rW], fill: theme.roofShade, center: [cx - rx * 0.6, cy, (eaveZ + rzTop) * 0.5], ribCount: Math.max(2, Math.round(fw / 28)) },
    ];
    slopes.sort((a, b) => pr.depth(a.center) - pr.depth(b.center));
    for (const sl of slopes) {
      poly3(g, pr, sl.pts, sl.fill, 'rgba(20,12,10,0.85)', 1.3);
      // 瓦垄竖线
      if (withDetail && sl.pts.length >= 3) {
        const b0 = sl.pts[0], b1 = sl.pts[1];
        const t0 = sl.pts.length === 4 ? sl.pts[3] : sl.pts[2];
        const t1 = sl.pts[2];
        for (let k = 1; k <= sl.ribCount; k++) {
          const u = k / (sl.ribCount + 1);
          const bx = b0[0] + (b1[0] - b0[0]) * u, by = b0[1] + (b1[1] - b0[1]) * u, bz = b0[2] + (b1[2] - b0[2]) * u - 3;
          const tx = t0[0] + (t1[0] - t0[0]) * u, ty = t0[1] + (t1[1] - t0[1]) * u, tz = t0[2] + (t1[2] - t0[2]) * u;
          line3(g, pr, [bx, by, bz], [tx, ty, tz], 'rgba(255,255,255,0.14)', 0.8);
        }
      }
    }

    // 鎏金/血色正脊、垂脊与正脊两端鸱吻兽角
    line3(g, pr, rW, rE, theme.trimColor, 2.5);
    for (const [cA, rP] of [[cSW, rW], [cSE, rE], [cNE, rE], [cNW, rW]] as [V3, V3][]) {
      line3(g, pr, cA, rP, theme.trimColor, 1.5);
    }
    if (withDetail) {
      for (const rp of [rW, rE]) {
        const p = pr.p(rp);
        g.fillStyle = theme.trimBright;
        g.beginPath();
        g.moveTo(p[0], p[1] - 5.5);
        g.lineTo(p[0] + 3, p[1] + 1);
        g.lineTo(p[0] - 3, p[1] + 1);
        g.closePath();
        g.fill();
      }
    }

    if (floors >= 2 && f < 2 && withDetail) {
      for (const lc of [cSW, cSE, cNE, cNW]) {
        const lp = pr.p(lc);
        g.strokeStyle = 'rgba(22,14,10,0.78)';
        g.lineWidth = 1.0;
        g.beginPath(); g.moveTo(lp[0], lp[1]); g.lineTo(lp[0], lp[1] + 5); g.stroke();
        g.fillStyle = theme.lanternColor;
        g.beginPath(); g.ellipse(lp[0], lp[1] + 8, 2.7, 3.8, 0, 0, Math.PI * 2); g.fill();
        inkStroke(g, 'rgba(22,14,10,0.75)', 0.85); g.stroke();
      }
    }

    z = rzTop - 1.2;
  }

  if (withDetail) {
    const tip = pr.p([cx, cy, z + 2]);
    g.fillStyle = `rgba(${theme.glowRgb},0.98)`;
    g.beginPath();
    if (theme.spiky) {
      g.moveTo(tip[0], tip[1] - 19);
      g.lineTo(tip[0] + 5.8, tip[1] + 2);
      g.lineTo(tip[0] - 5.8, tip[1] + 2);
      g.closePath();
    } else {
      g.arc(tip[0], tip[1] - 6, 5.4, 0, Math.PI * 2);
    }
    g.fill();
    inkStroke(g, 'rgba(22,14,10,0.8)', 1.1);
    g.stroke();
  }
}

/** 战鼓/点将青铜鼎炉（增添前甲板古代修仙战舰烟火气与仪式感） */
function drawDeckBrazier3D(g: CanvasRenderingContext2D, pr: Proj, cx: number, cy: number, z0: number, theme: AirshipTheme) {
  const base = pr.p([cx, cy, z0]);
  const top = pr.p([cx, cy, z0 + 16]);
  g.fillStyle = theme.hullDeep;
  inkStroke(g, theme.trimColor, 1.15);
  g.beginPath();
  g.ellipse(base[0], base[1], 9, 4.5, 0, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.fillStyle = theme.hullShade;
  g.beginPath();
  g.arc(top[0], top[1], 8.2, 0, Math.PI * 2);
  g.fill(); g.stroke();
  g.fillStyle = theme.lanternColor;
  g.beginPath();
  g.moveTo(top[0] - 4.5, top[1] - 2);
  g.quadraticCurveTo(top[0], top[1] - 18, top[0] + 4.5, top[1] - 2);
  g.closePath();
  g.fill();
}

/** 前甲板点将战鼓架 */
function drawWarDrum3D(g: CanvasRenderingContext2D, pr: Proj, cx: number, cy: number, z0: number, theme: AirshipTheme) {
  // 鼓架双立柱
  line3(g, pr, [cx, cy - 11, z0], [cx, cy - 11, z0 + 22], theme.pillarColor, 2.4);
  line3(g, pr, [cx, cy + 11, z0], [cx, cy + 11, z0 + 22], theme.pillarColor, 2.4);
  line3(g, pr, [cx, cy - 13, z0 + 21], [cx, cy + 13, z0 + 21], theme.trimColor, 2.0);
  // 鼓身红漆圆筒
  const pL = pr.p([cx - 7, cy, z0 + 13]);
  const pR = pr.p([cx + 7, cy, z0 + 13]);
  g.fillStyle = theme.doorColor;
  inkStroke(g, theme.trimColor, 1.2);
  g.beginPath();
  g.ellipse((pL[0] + pR[0]) * 0.5, (pL[1] + pR[1]) * 0.5, 11, 9, 0, 0, Math.PI * 2);
  g.fill(); g.stroke();
  // 牛皮鼓面
  g.fillStyle = '#efe0b8';
  g.beginPath();
  g.ellipse(pR[0], pR[1], 6.5, 7.5, 0, 0, Math.PI * 2);
  g.fill(); inkStroke(g, 'rgba(32,18,10,0.75)', 1.0); g.stroke();
}

/** 舷侧守御连弩炮台 */
function drawDeckBallista3D(g: CanvasRenderingContext2D, pr: Proj, cx: number, cy: number, z0: number, side: -1 | 1, theme: AirshipTheme) {
  const b0: V3 = [cx - 8, cy - 6, z0];
  const b1: V3 = [cx + 8, cy - 6, z0];
  const b2: V3 = [cx + 8, cy + 6, z0];
  const b3: V3 = [cx - 8, cy + 6, z0];
  poly3(g, pr, [b0, b1, b2, b3], theme.hullShade, theme.trimColor, 1.0);
  // 弩臂朝舷外伸出
  line3(g, pr, [cx, cy, z0 + 7], [cx + 5, cy + side * 18, z0 + 9], theme.trimBright, 1.8);
  line3(g, pr, [cx - 9, cy + side * 6, z0 + 8], [cx + 9, cy + side * 6, z0 + 8], theme.pillarColor, 1.8);
  line3(g, pr, [cx - 9, cy + side * 6, z0 + 8], [cx + 4, cy + side * 16, z0 + 9], 'rgba(255,240,200,0.7)', 0.9);
  line3(g, pr, [cx + 9, cy + side * 6, z0 + 8], [cx + 4, cy + side * 16, z0 + 9], 'rgba(255,240,200,0.7)', 0.9);
}

/** 船艏绞盘与缆绳卷 */
function drawCapstan3D(g: CanvasRenderingContext2D, pr: Proj, cx: number, cy: number, z0: number, theme: AirshipTheme) {
  const p0 = pr.p([cx, cy, z0]);
  const p1 = pr.p([cx, cy, z0 + 10]);
  g.fillStyle = theme.hullDeep;
  inkStroke(g, theme.trimColor, 1.0);
  g.beginPath(); g.ellipse(p0[0], p0[1], 8, 4.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = theme.deckShade;
  g.beginPath(); g.ellipse(p1[0], p1[1], 6, 3.5, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  line3(g, pr, [cx - 8, cy, z0 + 8], [cx + 8, cy, z0 + 8], theme.trimColor, 1.4);
  line3(g, pr, [cx, cy - 8, z0 + 8], [cx, cy + 8, z0 + 8], theme.trimColor, 1.4);
}

/** 运丹灵舟甲板封印木箱（替代单层小棚，保持全舟楼阁最低两层起） */
function drawCargoCrate3D(g: CanvasRenderingContext2D, pr: Proj, cx: number, cy: number, z0: number, lx: number, ly: number, hz: number, theme: AirshipTheme) {
  const hx = lx * 0.5, hy = ly * 0.5, z1 = z0 + hz;
  const faces: Array<{ pts: V3[]; c: V3; fill: string }> = [
    { pts: [[cx - hx, cy + hy, z0], [cx + hx, cy + hy, z0], [cx + hx, cy + hy, z1], [cx - hx, cy + hy, z1]], c: [cx, cy + hy, (z0 + z1) * 0.5], fill: '#8d643b' },
    { pts: [[cx - hx, cy - hy, z0], [cx + hx, cy - hy, z0], [cx + hx, cy - hy, z1], [cx - hx, cy - hy, z1]], c: [cx, cy - hy, (z0 + z1) * 0.5], fill: '#694726' },
    { pts: [[cx + hx, cy - hy, z0], [cx + hx, cy + hy, z0], [cx + hx, cy + hy, z1], [cx + hx, cy - hy, z1]], c: [cx + hx, cy, (z0 + z1) * 0.5], fill: '#a67a4d' },
    { pts: [[cx - hx, cy - hy, z0], [cx - hx, cy + hy, z0], [cx - hx, cy + hy, z1], [cx - hx, cy - hy, z1]], c: [cx - hx, cy, (z0 + z1) * 0.5], fill: '#694726' },
  ];
  faces.sort((a, b) => pr.depth(a.c) - pr.depth(b.c));
  for (const fc of faces) poly3(g, pr, fc.pts, fc.fill, 'rgba(24,14,8,0.82)', 1.15);
  poly3(g, pr, [[cx - hx, cy - hy, z1], [cx + hx, cy - hy, z1], [cx + hx, cy + hy, z1], [cx - hx, cy + hy, z1]], '#b38952', 'rgba(24,14,8,0.82)', 1.15);
  line3(g, pr, [cx, cy - hy, z1 + 0.5], [cx, cy + hy, z1 + 0.5], theme.trimColor, 1.8);
  const seal = pr.p([cx, cy, z1 + 0.8]);
  g.fillStyle = theme.lanternColor;
  g.beginPath(); g.arc(seal[0], seal[1], 2.4, 0, Math.PI * 2); g.fill();
}

function drawSquareMastSail3D(
  g: CanvasRenderingContext2D,
  pr: Proj,
  mx: number,
  my: number,
  baseZ: number,
  h: number,
  wSpan: number,
  theme: AirshipTheme,
  emblem?: string,
) {
  const mastTopZ = baseZ + h + 20;
  line3(g, pr, [mx, my, baseZ], [mx, my, mastTopZ], '#3a2617', 2.8);
  line3(g, pr, [mx, my - wSpan * 0.28, mastTopZ - 8], [mx, my + wSpan * 0.28, mastTopZ - 8], theme.trimColor, 1.8);
  const topP = pr.p([mx, my, mastTopZ + 4]);
  g.fillStyle = theme.trimBright;
  g.beginPath(); g.arc(topP[0], topP[1], 3.3, 0, Math.PI * 2); g.fill();

  const sparTopZ = baseZ + h;
  const sparBotZ = baseZ + h * 0.30;
  const pTL = pr.p([mx + 2, my - wSpan, sparTopZ]);
  const pTR = pr.p([mx + 2, my + wSpan, sparTopZ]);
  const pBL = pr.p([mx + 12, my - wSpan * 0.88, sparBotZ]);
  const pBR = pr.p([mx + 12, my + wSpan * 0.88, sparBotZ]);
  const pMT = pr.p([mx + 16, my, sparTopZ]);
  const pMB = pr.p([mx + 26, my, sparBotZ]);

  const sg = g.createLinearGradient(pTL[0], pTL[1], pBR[0], pBR[1]);
  sg.addColorStop(0, theme.sailLight);
  sg.addColorStop(1, theme.sailColor);

  g.beginPath();
  g.moveTo(pTL[0], pTL[1]);
  g.quadraticCurveTo(pMT[0], pMT[1], pTR[0], pTR[1]);
  g.quadraticCurveTo((pTR[0] + pBR[0]) * 0.5 + 8, (pTR[1] + pBR[1]) * 0.5, pBR[0], pBR[1]);
  g.quadraticCurveTo(pMB[0], pMB[1], pBL[0], pBL[1]);
  g.quadraticCurveTo((pBL[0] + pTL[0]) * 0.5 + 8, (pBL[1] + pTL[1]) * 0.5, pTL[0], pTL[1]);
  g.closePath();
  g.fillStyle = sg;
  g.fill();
  inkStroke(g, theme.sailEdge, 1.6);
  g.stroke();

  for (const u of [0.2, 0.4, 0.6, 0.8]) {
    const zR = sparBotZ + (sparTopZ - sparBotZ) * u;
    const bulge = 12 + Math.sin(u * Math.PI) * 14;
    const l = pr.p([mx + 5, my - wSpan * (0.88 + u * 0.12), zR]);
    const m = pr.p([mx + bulge, my, zR]);
    const r = pr.p([mx + 5, my + wSpan * (0.88 + u * 0.12), zR]);
    g.strokeStyle = theme.sailEdge;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(l[0], l[1]);
    g.quadraticCurveTo(m[0], m[1], r[0], r[1]);
    g.stroke();
  }

  const cp = pr.p([mx + 20, my, (sparBotZ + sparTopZ) * 0.52]);
  const rMark = Math.max(6, wSpan * 0.34);
  g.strokeStyle = theme.sailEdge;
  g.lineWidth = 1.6;
  g.beginPath(); g.arc(cp[0], cp[1], rMark, 0, Math.PI * 2); g.stroke();
  if (emblem) {
    g.fillStyle = theme.sailEdge;
    g.font = `bold ${Math.round(rMark * 1.1)}px "Noto Serif SC", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emblem.slice(0, 1), cp[0], cp[1]);
  }
}

function drawBanner3D(g: CanvasRenderingContext2D, pr: Proj, bx: number, by: number, bz: number, h: number, theme: AirshipTheme, text?: string) {
  line3(g, pr, [bx, by, bz], [bx, by, bz + h], '#382617', 2.4);
  const top = pr.p([bx, by, bz + h]);
  g.fillStyle = theme.trimColor;
  g.beginPath(); g.arc(top[0], top[1] - 2, 2.8, 0, Math.PI * 2); g.fill();
  const flyDir = Math.cos(pr.yaw) >= 0 ? -1 : 1;
  const fw = 32;
  g.fillStyle = theme.flagColor;
  g.beginPath();
  g.moveTo(top[0], top[1] + 2);
  g.quadraticCurveTo(top[0] + flyDir * fw * 0.5, top[1] + 5, top[0] + flyDir * fw, top[1] + 9);
  g.lineTo(top[0] + flyDir * fw * 0.76, top[1] + 19);
  g.lineTo(top[0] + flyDir * fw, top[1] + 29);
  g.quadraticCurveTo(top[0] + flyDir * fw * 0.5, top[1] + 32, top[0], top[1] + 34);
  g.closePath();
  g.fill();
  inkStroke(g, theme.trimColor, 1.3);
  g.stroke();
  if (text) {
    g.fillStyle = '#fff3d2';
    g.font = 'bold 13px "Noto Serif SC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text.slice(0, 1), top[0] + flyDir * fw * 0.42, top[1] + 18);
  }
}

function drawCannon3D(g: CanvasRenderingContext2D, pr: Proj, x0: number, y0: number, z0: number, len: number, rad: number, theme: AirshipTheme) {
  const x1 = x0 + len;
  const z1 = z0 + len * 0.22;
  const p0T = pr.p([x0, y0, z0 + rad]);
  const p0B = pr.p([x0, y0, z0 - rad]);
  const p1T = pr.p([x1, y0, z1 + rad * 0.78]);
  const p1B = pr.p([x1, y0, z1 - rad * 0.78]);
  poly2(g, [p0B, p1B, p1T, p0T], theme.hullShade, theme.trimColor, 1.4);
  for (const u of [0.35, 0.7]) {
    const rx = x0 + len * u, rz = z0 + len * 0.22 * u;
    line3(g, pr, [rx, y0, rz - rad * 0.85], [rx, y0, rz + rad * 0.85], theme.trimBright, 1.7);
  }
  ring3(g, pr, x1 + 2, y0, z1, rad * 1.15, rad * 1.15, theme.glowRgb, 1.6);
}

/** 3D 飞舟艉部建筑与推进系统（高起艉封盾板、雕花悬挑尾廊与宫灯、装甲聚灵尾喷匣、破风上下尾舵） */
function drawSternAssembly3D(
  g: CanvasRenderingContext2D,
  pr: Proj,
  L: number,
  W: number,
  H: number,
  tier: number,
  theme: AirshipTheme,
) {
  const sxFront = -L * 0.82;
  const sxBack = -L * 1.00;
  const hw = W * 0.56;
  const zDeck = 13;
  const zTop = tier === 1 ? 26 : tier === 2 ? 32 : 40;
  const zKeel = -H * 0.28;

  // 1) 艉下深水破风舵翼（立体舵板）
  const rudderRoot: V3 = [-L * 0.90, 0, zKeel + 2];
  const rudderMid: V3 = [-L * 1.06, 0, zKeel - (tier === 1 ? 10 : 16)];
  const rudderTip: V3 = [-L * 1.14, 0, zKeel - (tier === 1 ? 4 : 8)];
  const rudderTop: V3 = [sxBack, 0, zDeck - 2];
  poly3(
    g,
    pr,
    [rudderRoot, rudderMid, rudderTip, rudderTop],
    theme.spiky ? theme.pillarColor : theme.hullShade,
    'rgba(16,10,8,0.9)',
    1.35,
  );
  line3(g, pr, rudderMid, rudderTip, theme.trimColor, 1.4);

  // 2) 高起艉封盾板（木石雕花艉壁 + 两侧挑角护板）
  const transom: V3[] = [
    [sxBack, -hw * 0.72, zDeck - 4],
    [sxBack, hw * 0.72, zDeck - 4],
    [sxBack - 4, hw * 0.82, zTop],
    [sxBack - 4, -hw * 0.82, zTop],
  ];
  poly3(g, pr, transom, theme.hullColor, 'rgba(18,12,8,0.9)', 1.5);
  for (const side of [-1, 1] as const) {
    const flank: V3[] = [
      [sxFront, side * W * 0.84, 8],
      [sxBack, side * hw * 0.72, zDeck - 4],
      [sxBack - 4, side * hw * 0.82, zTop],
      [sxFront + 2, side * W * 0.82, zTop - 6],
    ];
    poly3(g, pr, flank, side > 0 ? theme.hullLight : theme.hullShade, 'rgba(18,12,8,0.88)', 1.35);
    line3(g, pr, flank[3], flank[2], theme.trimBright, 1.5);
  }

  // 3) 悬挑艉廊平台 + 雕花扶栏 + 凤尾/魔角脊饰
  const galBack = sxBack - (tier === 1 ? 10 : 14);
  const galTop: V3[] = [
    [sxFront + 4, -hw * 0.80, zTop - 4],
    [sxFront + 4, hw * 0.80, zTop - 4],
    [galBack, hw * 0.90, zTop],
    [galBack, -hw * 0.90, zTop],
  ];
  poly3(g, pr, galTop, theme.deckColor, 'rgba(20,12,8,0.88)', 1.35);
  const rZ = zTop + 6;
  line3(g, pr, [galBack, -hw * 0.90, rZ], [galBack, hw * 0.90, rZ], theme.trimBright, 1.6);
  line3(g, pr, [sxFront + 4, -hw * 0.80, rZ - 2], [galBack, -hw * 0.90, rZ], theme.trimColor, 1.4);
  line3(g, pr, [sxFront + 4, hw * 0.80, rZ - 2], [galBack, hw * 0.90, rZ], theme.trimColor, 1.4);
  for (const u of [-0.85, -0.42, 0, 0.42, 0.85]) {
    line3(g, pr, [galBack, hw * u, zTop], [galBack, hw * u, rZ + 1.5], theme.pillarColor, 1.3);
  }
  for (const side of [-1, 1] as const) {
    const finBase: V3 = [galBack + 2, side * hw * 0.86, zTop];
    const finMid: V3 = [galBack - (tier === 1 ? 10 : 16), side * hw * 1.02, zTop + (tier === 1 ? 10 : 15)];
    const finIn: V3 = [galBack + 6, side * hw * 0.56, zTop + 2];
    poly3(g, pr, [finBase, finMid, finIn], theme.spiky ? '#c8344c' : theme.roofHighlight, 'rgba(18,10,8,0.9)', 1.2);
    line3(g, pr, finBase, finMid, theme.trimBright, 1.4);
  }

  // 4) 艉壁中央阵纹徽记 + 左右悬灯笼
  const emblemP = pr.p([sxBack - 2, 0, (zDeck + zTop) * 0.5]);
  g.save();
  g.fillStyle = 'rgba(18,12,10,0.85)';
  g.beginPath(); g.arc(emblemP[0], emblemP[1], tier === 1 ? 6 : 9, 0, Math.PI * 2); g.fill();
  g.strokeStyle = theme.trimBright;
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(emblemP[0], emblemP[1], tier === 1 ? 6 : 9, 0, Math.PI * 2); g.stroke();
  g.fillStyle = `rgba(${theme.glowRgb},0.92)`;
  g.beginPath(); g.arc(emblemP[0], emblemP[1], tier === 1 ? 3 : 4.5, 0, Math.PI * 2); g.fill();

  for (const side of [-1, 1] as const) {
    const lHook = pr.p([galBack - 2, side * hw * 0.72, zTop - 1]);
    const lBall = pr.p([galBack - 2, side * hw * 0.72, zTop - 8]);
    g.strokeStyle = theme.trimColor;
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(lHook[0], lHook[1]); g.lineTo(lBall[0], lBall[1]); g.stroke();
    g.fillStyle = theme.lanternColor;
    g.beginPath(); g.arc(lBall[0], lBall[1], tier === 1 ? 2.8 : 3.8, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  // 5) 装甲聚灵尾喷匣（实心多面推进喷口 + 灵能聚环）
  const drawThrusterPod = (tx: number, ty: number, tz: number, rad: number) => {
    const podLen = rad * 1.45;
    const pBack = tx - podLen * 0.45;
    const pFront = tx + podLen * 0.65;
    poly3(g, pr, [[pFront, ty - rad * 0.8, tz + rad * 0.65], [pFront, ty + rad * 0.8, tz + rad * 0.65], [pBack, ty + rad * 0.58, tz + rad * 0.48], [pBack, ty - rad * 0.58, tz + rad * 0.48]], theme.hullLight, 'rgba(16,10,8,0.9)', 1.2);
    poly3(g, pr, [[pFront, ty - rad * 0.9, tz], [pBack, ty - rad * 0.68, tz], [pBack, ty - rad * 0.58, tz + rad * 0.48], [pFront, ty - rad * 0.8, tz + rad * 0.65]], theme.hullColor, 'rgba(16,10,8,0.9)', 1.15);
    poly3(g, pr, [[pFront, ty + rad * 0.9, tz], [pBack, ty + rad * 0.68, tz], [pBack, ty + rad * 0.58, tz + rad * 0.48], [pFront, ty + rad * 0.8, tz + rad * 0.65]], theme.hullShade, 'rgba(16,10,8,0.9)', 1.15);
    ring3(g, pr, pBack - 2, ty, tz, rad * 0.95, rad * 0.95, theme.glowRgb, tier >= 3 ? 2.4 : 1.9);
  };

  drawThrusterPod(-L * 1.01, 0, 8, W * 0.36);
  if (tier >= 2) {
    drawThrusterPod(-L * 0.95, -W * 0.54, 12, W * 0.22);
    drawThrusterPod(-L * 0.95, W * 0.54, 12, W * 0.22);
  }
}

function drawDetailedWing3D(
  g: CanvasRenderingContext2D,
  pr: Proj,
  L: number,
  W: number,
  tier: number,
  side: -1 | 1,
  theme: AirshipTheme,
) {
  // 后置阔展修仙机关灵羽/魔骨双翼：装于靠近船尾的后段船舷（-0.46L ~ -0.74L），翼展张角收敛为原角度的一半，贴合楼船流线
  const oldOut = tier === 1 ? W * 1.15 : tier === 2 ? W * 1.42 : W * 1.56;
  const oldBack = tier === 1 ? L * 0.10 : tier === 2 ? L * 0.12 : L * 0.13;
  const wingLen = Math.hypot(oldOut, oldBack);
  const halfOpenAngle = Math.atan2(oldOut, oldBack) * 0.5;
  const outSpan = wingLen * Math.sin(halfOpenAngle);
  const backSweep = wingLen * Math.cos(halfOpenAngle);
  const vaneCount = tier === 1 ? 3 : tier === 2 ? 4 : 5;
  const rx0 = -L * 0.46;
  const rx1 = -L * 0.74;
  const yBase = side * W * 0.89;
  const zBase = 5;

  // 1) 翼根榫座护甲（3D 雕花转枢基座，咬合船体后段船舷）
  const podInY = side * W * 0.80;
  const podOutY = side * (W * 0.89 + Math.min(18, outSpan * 0.16));
  const podPtsTop: V3[] = [
    [rx0, podInY, zBase + 10],
    [rx1, podInY, zBase + 8],
    [rx1 - 4, podOutY, zBase + 6],
    [rx0 - 2, podOutY, zBase + 8],
  ];
  const podPtsSide: V3[] = [
    [rx0 - 2, podOutY, zBase + 8],
    [rx1 - 4, podOutY, zBase + 6],
    [rx1 - 7, podOutY, zBase - 7],
    [rx0 - 4, podOutY, zBase - 6],
  ];
  const podPtsFront: V3[] = [
    [rx0, podInY, zBase + 10],
    [rx0 - 2, podOutY, zBase + 8],
    [rx0 - 4, podOutY, zBase - 6],
    [rx0, podInY, zBase - 6],
  ];
  poly3(g, pr, podPtsFront, theme.hullShade, 'rgba(16,10,8,0.90)', 1.35);
  poly3(g, pr, podPtsSide, theme.hullColor, 'rgba(16,10,8,0.90)', 1.4);
  poly3(g, pr, podPtsTop, theme.hullLight, 'rgba(16,10,8,0.90)', 1.4);
  line3(g, pr, podPtsTop[2], podPtsTop[3], theme.trimBright, 1.7);

  // 榫座聚灵转枢阵眼 + 前后护肩云纹拱
  const hubPos = pr.p([(rx0 + rx1) * 0.5 - 2, podOutY, zBase + 2]);
  const crestFront = pr.p([rx0 + 5, podOutY + side * 3, zBase + 10]);
  const crestBack = pr.p([rx1 - 5, podOutY + side * 3, zBase + 8]);
  g.save();
  g.strokeStyle = theme.trimBright;
  g.lineWidth = 1.9;
  g.beginPath();
  g.moveTo(crestFront[0], crestFront[1]);
  g.quadraticCurveTo(hubPos[0], hubPos[1] - 11, crestBack[0], crestBack[1]);
  g.stroke();
  g.fillStyle = 'rgba(16,10,8,0.94)';
  g.beginPath(); g.arc(hubPos[0], hubPos[1], tier === 1 ? 5.0 : tier === 2 ? 7.0 : 8.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = `rgba(${theme.glowRgb},0.96)`;
  g.beginPath(); g.arc(hubPos[0], hubPos[1], tier === 1 ? 2.6 : tier === 2 ? 4.0 : 5.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = theme.trimBright;
  g.lineWidth = 1.4;
  g.beginPath(); g.arc(hubPos[0], hubPos[1], tier === 1 ? 5.5 : tier === 2 ? 7.6 : 9.4, 0, Math.PI * 2); g.stroke();
  g.restore();

  // 2) 宽阔层叠羽片 / 魔骨翼膜（顺半角后掠展开，流线收束于船艉两侧）
  type VaneDraw = { depth: number; draw: () => void };
  const vanes: VaneDraw[] = [];
  for (let k = 0; k < vaneCount; k++) {
    const frac = k / Math.max(1, vaneCount - 1);
    const vSpan = outSpan * (1.0 - frac * 0.32);
    const vRootX = rx0 - frac * (L * 0.16);
    const vSweep = backSweep * (0.72 + frac * 0.34);
    const vChord = (tier === 1 ? 24 : tier === 2 ? 35 : 46) * (1.0 - frac * 0.12);
    const vLiftZ = zBase + 2 + (1 - frac) * (tier === 1 ? 3 : tier === 2 ? 5 : 6);

    const pRootFront: V3 = [vRootX, yBase + side * 4, zBase + 4];
    const pLeadArch: V3 = [vRootX - vSweep * 0.38, yBase + side * (vSpan * 0.54), zBase + 4 + (vLiftZ - zBase) * 0.65];
    const pTip: V3 = [vRootX - vSweep, yBase + side * vSpan, vLiftZ];
    const pTipBelly: V3 = [vRootX - vSweep - vChord * (theme.spiky ? 0.56 : 0.44), yBase + side * (vSpan * 0.78), vLiftZ - 2];
    const pTrailMid: V3 = [vRootX - vSweep * 0.52 - vChord * 0.90, yBase + side * (vSpan * 0.36), zBase + 1 + (vLiftZ - zBase) * 0.25];
    const pRootBack: V3 = [vRootX - vChord * 0.94, yBase + side * 2, zBase + 1];

    const vPts = [pRootFront, pLeadArch, pTip, pTipBelly, pTrailMid, pRootBack];
    const midV: V3 = [
      (pRootFront[0] + pTip[0] + pTrailMid[0]) / 3,
      (pRootFront[1] + pTip[1] + pTrailMid[1]) / 3,
      (pRootFront[2] + pTip[2] + pTrailMid[2]) / 3,
    ];

    vanes.push({
      depth: pr.depth(midV),
      draw: () => {
        const sPts = vPts.map(pr.p);
        const minY = Math.min(...sPts.map((q) => q[1]));
        const maxY = Math.max(...sPts.map((q) => q[1]));
        const vg = g.createLinearGradient(0, minY, 0, maxY + 4);
        if (theme.spiky) {
          vg.addColorStop(0, k % 2 === 0 ? '#922940' : '#731d31');
          vg.addColorStop(0.5, '#4c1121');
          vg.addColorStop(1, '#260812');
        } else {
          vg.addColorStop(0, k % 2 === 0 ? theme.sailLight : theme.roofHighlight);
          vg.addColorStop(0.55, k % 2 === 0 ? theme.sailColor : theme.roofColor);
          vg.addColorStop(1, theme.roofShade);
        }
        poly2(g, sPts, vg, theme.spiky ? 'rgba(18,6,10,0.92)' : 'rgba(24,14,8,0.88)', 1.45);

        line3(g, pr, pRootFront, pLeadArch, theme.trimBright, 1.7);
        line3(g, pr, pLeadArch, pTip, theme.trimColor, 1.55);
        line3(g, pr, pRootFront, pTipBelly, `rgba(${theme.glowRgb},${theme.spiky ? 0.58 : 0.70})`, 1.25);
        line3(g, pr, pRootFront, pTrailMid, theme.trimColor, 1.15);
        line3(g, pr, pLeadArch, pTrailMid, theme.trimColor, 1.1);
        line3(g, pr, pTipBelly, pTrailMid, `rgba(${theme.glowRgb},0.50)`, 1.2);

        if (theme.spiky) {
          const pClaw: V3 = [pTip[0] - 11, pTip[1] + side * 7, pTip[2] + 3];
          poly3(g, pr, [pLeadArch, pTip, pClaw], '#e2d5c4', 'rgba(18,8,10,0.92)', 1.1);
          const pSubClaw: V3 = [pTipBelly[0] - 7, pTipBelly[1] + side * 4.5, pTipBelly[2] + 2];
          poly3(g, pr, [pTip, pTipBelly, pSubClaw], '#cabaa6', 'rgba(18,8,10,0.88)', 0.95);
        } else {
          const pPlume: V3 = [pTip[0] - 12, pTip[1] + side * 7.5, pTip[2] + 1];
          line3(g, pr, pTip, pPlume, `rgba(${theme.glowRgb},0.58)`, 2.1);
          line3(g, pr, pTipBelly, [pTipBelly[0] - 9, pTipBelly[1] + side * 5.5, pTipBelly[2] + 1], `rgba(${theme.glowRgb},0.42)`, 1.6);
        }
      },
    });
  }
  vanes.sort((a, b) => a.depth - b.depth);
  for (const v of vanes) v.draw();

  // 3) 雕花双段主翼骨 + 分节鎏金箍环
  const sparTop0: V3 = [rx0, yBase + side * 3, zBase + 6];
  const sparMid: V3 = [rx0 - backSweep * 0.38, yBase + side * (outSpan * 0.54), zBase + 7];
  const sparEnd: V3 = [rx0 - backSweep * 0.96, yBase + side * (outSpan * 0.96), zBase + 7];
  const sparBot0: V3 = [rx0 - 6, yBase + side * 3, zBase + 1];
  const sparBotMid: V3 = [sparMid[0] - 5, sparMid[1], sparMid[2] - 5];
  const sparBotEnd: V3 = [sparEnd[0] - 3, sparEnd[1], sparEnd[2] - 3];

  poly3(g, pr, [sparTop0, sparMid, sparBotMid, sparBot0], theme.hullLight, 'rgba(18,12,8,0.9)', 1.35);
  poly3(g, pr, [sparMid, sparEnd, sparBotEnd, sparBotMid], theme.hullColor, 'rgba(18,12,8,0.9)', 1.3);
  line3(g, pr, sparTop0, sparMid, theme.trimBright, 1.85);
  line3(g, pr, sparMid, sparEnd, theme.trimColor, 1.55);

  for (const u of [0.28, 0.58, 0.84]) {
    const bx = sparTop0[0] + (sparEnd[0] - sparTop0[0]) * u;
    const by = sparTop0[1] + (sparEnd[1] - sparTop0[1]) * u;
    const bz = sparTop0[2] + (sparEnd[2] - sparTop0[2]) * u;
    line3(g, pr, [bx, by, bz + 2.0], [bx - 5, by, bz - 5.2], theme.trimBright, 2.5);
  }
}

function drawFigurehead3D(g: CanvasRenderingContext2D, pr: Proj, L: number, tier: number, theme: AirshipTheme) {
  const tip = pr.p([L * 1.03, 0, 28]);
  const sc = tier === 1 ? 1.28 : tier === 2 ? 1.95 : 2.75;
  const dirX = Math.cos(pr.yaw);
  const dirY = Math.sin(pr.yaw) * pr.tiltY;
  const ang = Math.atan2(dirY, dirX);
  g.save();
  g.translate(tip[0], tip[1]);
  g.rotate(ang);
  g.scale(sc, sc);
  if (theme.spiky) {
    poly2(g, [[-10, -7], [24, -14], [14, -3], [32, 3], [8, 9], [-8, 6]], '#5c1726', 'rgba(14,6,8,0.92)', 1.3);
    poly2(g, [[-4, -6], [-18, -22], [4, -10]], '#e2d3bf', 'rgba(18,10,10,0.85)', 1.0);
    poly2(g, [[-4, 5], [-16, 19], [4, 8]], '#e2d3bf', 'rgba(18,10,10,0.85)', 1.0);
    g.fillStyle = `rgba(${theme.glowRgb},0.98)`;
    g.beginPath(); g.arc(10, -2, 3.0, 0, Math.PI * 2); g.fill();
  } else {
    poly2(g, [[-10, -7], [18, -14], [30, -2], [16, 8], [-8, 7]], theme.trimColor, 'rgba(24,14,8,0.88)', 1.3);
    poly2(g, [[-2, -7], [-18, -20], [5, -10]], theme.trimBright, 'rgba(24,14,8,0.8)', 1.0);
    poly2(g, [[-2, 6], [-16, 17], [5, 9]], theme.trimBright, 'rgba(24,14,8,0.8)', 1.0);
    poly2(g, [[22, -5], [35, 1], [20, 4]], theme.trimBright, 'rgba(24,14,8,0.85)', 1.0);
    g.fillStyle = `rgba(${theme.glowRgb},0.98)`;
    g.beginPath(); g.arc(13, -3, 2.8, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/** 3D 厚重深腹楼船放样（三段饱满船腹 + 舷外悬廊木檐 + 古代斗拱建筑群） */
export function drawAirshipHull3D(g: CanvasRenderingContext2D, spec: AirshipVisualSpec, yaw = 0) {
  const m = getAirshipMetrics(spec.tier);
  const theme = resolveAirshipTheme(spec);
  const pr = makeProj(yaw);
  // 按 1.35× 比例放大基座细节，使得 2× 巨舟与弟子同框时细节比例恰如其分
  const L = m.halfL;
  const W = m.halfW;
  const H = m.hullH;
  const tier = spec.tier;

  // 饱满深腹纵剖站位（从艉到艏深腹平稳过渡，龙骨厚实）
  const stations: Array<[number, number, number, number]> = [
    [-1.00, 0.42, 16, -H * 0.24],
    [-0.78, 0.84, 8, -H * 0.72],
    [-0.40, 1.00, 3, -H * 0.98],
    [0.08, 1.00, 0, -H],
    [0.52, 0.88, 2, -H * 0.88],
    [0.82, 0.50, 10, -H * 0.48],
    [1.00, 0.08, 20, 2],
  ];

  const drawHullSide = (side: -1 | 1) => {
    const deckPts: V3[] = stations.map((s) => [s[0] * L, s[1] * W * side, s[2]]);
    // 上半船帮（较饱满向外微凸）、下半船腹（深弧收向龙骨）
    const upperMidPts: V3[] = stations.map((s) => [s[0] * L, s[1] * W * side * 0.96, s[2] * 0.55 + s[3] * 0.42]);
    const lowerMidPts: V3[] = stations.map((s) => [s[0] * L, s[1] * W * side * 0.58, s[2] * 0.20 + s[3] * 0.80]);
    const keelPts: V3[] = stations.map((s) => [s[0] * L, 0, s[3]]);

    const band1: V3[] = [...deckPts, ...[...upperMidPts].reverse()];
    const band2: V3[] = [...upperMidPts, ...[...lowerMidPts].reverse()];
    const band3: V3[] = [...lowerMidPts, ...[...keelPts].reverse()];

    const b1s = band1.map(pr.p);
    const minY1 = Math.min(...b1s.map((p) => p[1])), maxY1 = Math.max(...b1s.map((p) => p[1]));
    const hg1 = g.createLinearGradient(0, minY1, 0, maxY1 + 10);
    hg1.addColorStop(0, side > 0 ? theme.hullLight : theme.hullColor);
    hg1.addColorStop(1, side > 0 ? theme.hullColor : theme.hullShade);

    poly2(g, b1s, hg1, 'rgba(18,12,10,0.88)', 1.65);
    poly3(g, pr, band2, side > 0 ? theme.hullColor : theme.hullShade, 'rgba(18,12,10,0.88)', 1.55);
    poly3(g, pr, band3, side > 0 ? theme.hullShade : theme.keelColor, 'rgba(18,12,10,0.9)', 1.55);

    // 纵深船肋加固木梁 + 水平叠板弧线 + 嵌灵晶大射孔与护甲片
    for (let i = 1; i < stations.length - 1; i++) {
      const s = stations[i];
      line3(g, pr, [s[0] * L, s[1] * W * side, s[2]], [s[0] * L, s[1] * W * side * 0.58, s[2] * 0.2 + s[3] * 0.8], 'rgba(20,12,8,0.42)', 1.3);
      if (tier >= 2) {
        const lp = pr.p([s[0] * L, s[1] * W * side * 0.96, s[2] * 0.65 + s[3] * 0.30]);
        g.fillStyle = 'rgba(18,12,10,0.88)';
        g.beginPath(); g.arc(lp[0], lp[1], 5.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(${theme.glowRgb},0.95)`;
        g.beginPath(); g.arc(lp[0], lp[1], 3.2, 0, Math.PI * 2); g.fill();
      }
      // 二/三阶船腹下排护舰阵眼
      if (tier >= 3 && i >= 2 && i <= 4) {
        const bp = pr.p([s[0] * L, s[1] * W * side * 0.65, s[2] * 0.25 + s[3] * 0.72]);
        g.strokeStyle = theme.trimColor;
        g.lineWidth = 1.4;
        g.beginPath(); g.arc(bp[0], bp[1], 6, 0, Math.PI * 2); g.stroke();
      }
    }

    // 上下双道船舷鎏金/血纹腰线 + 船侧悬廊屋檐（类似参考图船腹外挑的古建飞檐栈道）
    for (let i = 0; i < stations.length - 1; i++) {
      const s0 = stations[i], s1 = stations[i + 1];
      line3(g, pr, [s0[0] * L, s0[1] * W * side * 0.99, s0[2] - 4], [s1[0] * L, s1[1] * W * side * 0.99, s1[2] - 4], theme.trimColor, tier >= 3 ? 2.6 : 1.9);
      line3(g, pr, [s0[0] * L, s0[1] * W * side * 0.94, s0[2] * 0.55 + s0[3] * 0.42], [s1[0] * L, s1[1] * W * side * 0.94, s1[2] * 0.55 + s1[3] * 0.42], theme.trimColor, 1.5);
    }
    if (tier >= 2) {
      // 船舷中段悬挑飞檐栈道（随建筑略微后移，极富古风楼船层次感）
      const gPts: V3[] = [
        [-L * 0.48, W * side * 1.00, 0],
        [L * 0.16, W * side * 0.96, 0],
        [L * 0.16, W * side * 1.15, -10],
        [-L * 0.48, W * side * 1.18, -10],
      ];
      poly3(g, pr, gPts, side > 0 ? theme.roofColor : theme.roofShade, 'rgba(18,12,10,0.85)', 1.3);
      line3(g, pr, gPts[3], gPts[2], theme.trimColor, 1.5);
    }
  };

  // 1) 先画双侧厚实船腹（在甲板下，确保 n/s 朝向严丝合缝）
  const farSide: -1 | 1 = pr.depth([0, -W, 0]) <= pr.depth([0, W, 0]) ? -1 : 1;
  const nearSide: -1 | 1 = farSide === -1 ? 1 : -1;
  const isFrontBackView = Math.abs(pr.cosY) < 0.15;
  if (!isFrontBackView) {
    drawDetailedWing3D(g, pr, L, W, tier, farSide, theme);
  }
  drawHullSide(farSide);
  drawHullSide(nearSide);

  // 2) 宽阔木甲板与道家阵纹演武场线
  const deckOutline: V3[] = [
    ...stations.map((s): V3 => [s[0] * L, s[1] * W * farSide, s[2]]),
    ...[...stations].reverse().map((s): V3 => [s[0] * L, s[1] * W * nearSide, s[2]]),
  ];
  const deckScreen = deckOutline.map(pr.p);
  const dMinY = Math.min(...deckScreen.map((p) => p[1])), dMaxY = Math.max(...deckScreen.map((p) => p[1]));
  const dg = g.createLinearGradient(0, dMinY, 0, dMaxY);
  dg.addColorStop(0, theme.deckLight);
  dg.addColorStop(0.55, theme.deckColor);
  dg.addColorStop(1, theme.deckShade);
  poly2(g, deckScreen, dg, 'rgba(20,12,8,0.88)', 1.7);

  // 甲板木缝 + 前甲板纵横道纹演武场线 + 货舱格栅 + 聚灵大阵八角阵盘
  for (let i = 1; i < stations.length - 1; i++) {
    const s = stations[i];
    line3(g, pr, [s[0] * L, -s[1] * W * 0.92, s[2]], [s[0] * L, s[1] * W * 0.92, s[2]], 'rgba(28,18,10,0.22)', 1.0);
  }
  for (const r of [-0.55, -0.28, 0.28, 0.55]) {
    line3(g, pr, [-L * 0.72, W * r * 0.85, 6], [L * 0.72, W * r * 0.65, 8], 'rgba(32,20,10,0.16)', 0.9);
  }
  // 前甲板纵轴中线与横向演武分界线
  line3(g, pr, [L * 0.08, 0, 2], [L * 0.92, 0, 14], 'rgba(42,26,14,0.46)', 1.7);
  line3(g, pr, [L * 0.34, -W * 0.72, 3], [L * 0.34, W * 0.72, 3], 'rgba(42,26,14,0.40)', 1.5);
  line3(g, pr, [L * 0.66, -W * 0.52, 6], [L * 0.66, W * 0.52, 6], 'rgba(42,26,14,0.40)', 1.5);

  if (tier >= 2) {
    // 演武前甲板嵌刻双环聚灵阵盘 + 四象阵眼
    const cxArr = L * 0.48;
    const rArr = W * 0.42;
    const arrCol = theme.spiky ? '210,70,88' : '78,52,26';
    ring3(g, pr, cxArr, 0, 4, rArr, rArr * 0.01, arrCol, 1.5);
    // 内切八角星阵纹
    for (let k = 0; k < 4; k++) {
      const a0 = (k / 4) * Math.PI * 2;
      const a1 = ((k + 1) / 4) * Math.PI * 2;
      line3(
        g,
        pr,
        [cxArr + Math.cos(a0) * rArr * 0.62, Math.sin(a0) * rArr * 0.62, 4.5],
        [cxArr + Math.cos(a1) * rArr * 0.62, Math.sin(a1) * rArr * 0.62, 4.5],
        `rgba(${arrCol},0.65)`,
        1.2,
      );
    }
    // 阵眼灵石节点
    for (const [dx, dy] of [[-rArr * 0.95, 0], [rArr * 0.95, 0], [0, -rArr * 0.95], [0, rArr * 0.95]]) {
      const np = pr.p([cxArr + dx * 0.75, dy, 4.5]);
      g.fillStyle = `rgba(${theme.glowRgb},0.9)`;
      g.beginPath(); g.arc(np[0], np[1], 3.2, 0, Math.PI * 2); g.fill();
    }
    // 中前段甲板货舱格栅
    const gx = L * 0.16, gw = L * 0.07, gy = W * 0.24;
    poly3(g, pr, [[gx - gw, -gy, 2.5], [gx + gw, -gy, 2.5], [gx + gw, gy, 2.5], [gx - gw, gy, 2.5]], 'rgba(26,16,10,0.55)', theme.trimColor, 1.1);
    for (let k = -2; k <= 2; k++) {
      line3(g, pr, [gx + k * gw * 0.35, -gy, 2.8], [gx + k * gw * 0.35, gy, 2.8], 'rgba(120,90,56,0.65)', 1.0);
    }
  }

  // 3) 地上古建群、精雕短侧翼、高帆、战鼓鼎炉与龙首按 3D 深度排序绘制
  type DeckItem = { zDepth: number; draw: () => void };
  const items: DeckItem[] = [];

  if (isFrontBackView) {
    items.push({
      zDepth: pr.depth([-L * 0.62, -W * 1.25, 10]),
      draw: () => drawDetailedWing3D(g, pr, L, W, tier, -1, theme),
    });
    items.push({
      zDepth: pr.depth([-L * 0.62, W * 1.25, 10]),
      draw: () => drawDetailedWing3D(g, pr, L, W, tier, 1, theme),
    });
  } else {
    // 远侧翼已在船体前绘制（确保船体/阁楼自然遮挡翼根），此处只压入近侧翼参与 3D 排序
    items.push({
      zDepth: pr.depth([-L * 0.62, nearSide * W * 1.25, 12]),
      draw: () => drawDetailedWing3D(g, pr, L, W, tier, nearSide, theme),
    });
  }

  items.push({
    zDepth: pr.depth([-L * 1.04, 0, 14]),
    draw: () => drawSternAssembly3D(g, pr, L, W, H, tier, theme),
  });

  items.push({
    zDepth: pr.depth([-L * 0.90, 0, 34]),
    draw: () => drawBanner3D(g, pr, -L * 0.90, 0, tier === 1 ? 26 : tier === 2 ? 32 : 40, tier === 1 ? 66 : tier === 2 ? 92 : 122, theme, spec.bannerText),
  });

  // 统一单层理论建筑高度（约 23 离屏像素），所有阶位舟上楼阁严格最低两层起（一阶 2 层 / 二阶 3+2 层 / 三阶 4+3+2 层）
  const STORY_H = 23;

  if (tier === 1) {
    // 一阶小舟主阁保持修长宽度（留出两侧护舷步道），整体后移至中后段并抬升甲板基准以清晰呈现双层重檐
    items.push({
      zDepth: pr.depth([-L * 0.33, 0, 28]),
      draw: () => drawPavilion3D(g, pr, -L * 0.33, 0, 6, L * 0.36, W * 1.08, STORY_H, 2, theme, { isMain: true, taper: 0.16 }),
    });
    items.push({
      zDepth: pr.depth([-L * 0.72, 0, 42]),
      draw: () => drawSquareMastSail3D(g, pr, -L * 0.72, 0, 12, 92, W * 0.78, theme, spec.bannerText),
    });
    if (spec.convoyCargo) {
      items.push({
        zDepth: pr.depth([L * 0.28, 0, 12]),
        draw: () => {
          drawCargoCrate3D(g, pr, L * 0.22, -W * 0.24, 3, 28, 22, 13, theme);
          drawCargoCrate3D(g, pr, L * 0.38, W * 0.22, 4, 24, 20, 11, theme);
        },
      });
    } else {
      items.push({
        zDepth: pr.depth([L * 0.56, 0, 14]),
        draw: () => drawCannon3D(g, pr, L * 0.40, 0, 15, 60, 7.0, theme),
      });
    }
  } else if (tier === 2) {
    items.push({
      zDepth: pr.depth([-L * 0.30, 0, 52]),
      draw: () => drawPavilion3D(g, pr, -L * 0.30, 0, 6, L * 0.40, W * 0.90, STORY_H, 3, theme, { isMain: true }),
    });
    items.push({
      zDepth: pr.depth([-L * 0.26, -W * 0.78, 30]),
      draw: () => drawPavilion3D(g, pr, -L * 0.26, -W * 0.78, 8, L * 0.25, W * 0.48, STORY_H * 0.88, 2, theme),
    });
    items.push({
      zDepth: pr.depth([-L * 0.26, W * 0.78, 30]),
      draw: () => drawPavilion3D(g, pr, -L * 0.26, W * 0.78, 8, L * 0.25, W * 0.48, STORY_H * 0.88, 2, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.16, 0, 12]),
      draw: () => drawDeckBrazier3D(g, pr, L * 0.16, 0, 4, theme),
    });
    items.push({
      zDepth: pr.depth([-L * 0.02, 0, 18]),
      draw: () => drawWarDrum3D(g, pr, -L * 0.02, 0, 3, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.72, 0, 12]),
      draw: () => drawCapstan3D(g, pr, L * 0.72, 0, 7, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.34, farSide * W * 0.80, 12]),
      draw: () => drawDeckBallista3D(g, pr, L * 0.34, farSide * W * 0.76, 3, farSide, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.34, nearSide * W * 0.80, 12]),
      draw: () => drawDeckBallista3D(g, pr, L * 0.34, nearSide * W * 0.76, 3, nearSide, theme),
    });
    items.push({
      zDepth: pr.depth([-L * 0.70, -W * 0.26, 48]),
      draw: () => drawSquareMastSail3D(g, pr, -L * 0.70, -W * 0.26, 12, 126, W * 0.62, theme, spec.bannerText),
    });
    items.push({
      zDepth: pr.depth([-L * 0.70, W * 0.26, 48]),
      draw: () => drawSquareMastSail3D(g, pr, -L * 0.70, W * 0.26, 12, 126, W * 0.62, theme, spec.bannerText),
    });
    items.push({
      zDepth: pr.depth([L * 0.64, 0, 18]),
      draw: () => {
        drawCannon3D(g, pr, L * 0.50, -W * 0.28, 16, 88, 9.5, theme);
        drawCannon3D(g, pr, L * 0.50, W * 0.28, 16, 88, 9.5, theme);
      },
    });
  } else {
    // 三阶：后移聚拢的四层重檐主殿 + 双侧三层耳阁 + 前双两层角楼哨亭 + 殿后三联高帆（全部建筑严格最低两层起）
    items.push({
      zDepth: pr.depth([-L * 0.32, 0, 74]),
      draw: () => drawPavilion3D(g, pr, -L * 0.32, 0, 6, L * 0.42, W * 0.94, STORY_H, 4, theme, { isMain: true }),
    });
    items.push({
      zDepth: pr.depth([-L * 0.28, -W * 0.82, 40]),
      draw: () => drawPavilion3D(g, pr, -L * 0.28, -W * 0.82, 8, L * 0.26, W * 0.48, STORY_H * 0.88, 3, theme),
    });
    items.push({
      zDepth: pr.depth([-L * 0.28, W * 0.82, 40]),
      draw: () => drawPavilion3D(g, pr, -L * 0.28, W * 0.82, 8, L * 0.26, W * 0.48, STORY_H * 0.88, 3, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.04, -W * 0.62, 30]),
      draw: () => drawPavilion3D(g, pr, L * 0.04, -W * 0.62, 8, L * 0.18, W * 0.40, STORY_H * 0.88, 2, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.04, W * 0.62, 30]),
      draw: () => drawPavilion3D(g, pr, L * 0.04, W * 0.62, 8, L * 0.18, W * 0.40, STORY_H * 0.88, 2, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.26, -W * 0.42, 12]),
      draw: () => drawDeckBrazier3D(g, pr, L * 0.26, -W * 0.42, 5, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.26, W * 0.42, 12]),
      draw: () => drawDeckBrazier3D(g, pr, L * 0.26, W * 0.42, 5, theme),
    });
    items.push({
      zDepth: pr.depth([-L * 0.05, 0, 22]),
      draw: () => drawWarDrum3D(g, pr, -L * 0.05, 0, 3, theme),
    });
    items.push({
      zDepth: pr.depth([L * 0.78, 0, 14]),
      draw: () => drawCapstan3D(g, pr, L * 0.78, 0, 8, theme),
    });
    for (const bx of [L * 0.30, L * 0.54]) {
      const by = bx > L * 0.4 ? W * 0.64 : W * 0.78;
      items.push({
        zDepth: pr.depth([bx, farSide * by, 14]),
        draw: () => drawDeckBallista3D(g, pr, bx, farSide * by, 4, farSide, theme),
      });
      items.push({
        zDepth: pr.depth([bx, nearSide * by, 14]),
        draw: () => drawDeckBallista3D(g, pr, bx, nearSide * by, 4, nearSide, theme),
      });
    }
    items.push({
      zDepth: pr.depth([-L * 0.70, -W * 0.40, 72]),
      draw: () => drawSquareMastSail3D(g, pr, -L * 0.70, -W * 0.40, 10, 180, W * 0.52, theme, spec.bannerText),
    });
    items.push({
      zDepth: pr.depth([-L * 0.72, 0, 82]),
      draw: () => drawSquareMastSail3D(g, pr, -L * 0.72, 0, 10, 204, W * 0.64, theme, spec.bannerText),
    });
    items.push({
      zDepth: pr.depth([-L * 0.70, W * 0.40, 72]),
      draw: () => drawSquareMastSail3D(g, pr, -L * 0.70, W * 0.40, 10, 180, W * 0.52, theme, spec.bannerText),
    });
    items.push({
      zDepth: pr.depth([L * 0.68, 0, 22]),
      draw: () => {
        drawCannon3D(g, pr, L * 0.54, -W * 0.28, 20, 124, 12.0, theme);
        drawCannon3D(g, pr, L * 0.54, W * 0.28, 20, 124, 12.0, theme);
      },
    });
  }

  items.push({
    zDepth: pr.depth([L * 1.05, 0, 24]),
    draw: () => drawFigurehead3D(g, pr, L, tier, theme),
  });

  if (theme.ornament === 'lotus') {
    items.push({
      zDepth: pr.depth([0, 0, -H * 0.7]),
      draw: () => {
        ring3(g, pr, -L * 0.45, 0, -H * 0.6, W * 0.55, 8, theme.glowRgb, 1.4);
        ring3(g, pr, L * 0.35, 0, -H * 0.55, W * 0.50, 8, theme.glowRgb, 1.4);
      },
    });
  } else if (theme.ornament === 'halo') {
    const hz = tier === 1 ? 76 : tier === 2 ? 136 : 190;
    const hr = tier === 1 ? 28 : tier === 2 ? 44 : 64;
    items.push({
      zDepth: pr.depth([-L * 0.34, 0, hz]),
      draw: () => {
        const hp = pr.p([-L * 0.34, 0, hz]);
        g.strokeStyle = `rgba(${theme.glowRgb},0.84)`;
        g.lineWidth = 2.4;
        g.beginPath();
        g.ellipse(hp[0], hp[1], hr, hr * 0.34, 0, 0, Math.PI * 2);
        g.stroke();
      },
    });
  }

  items.sort((a, b) => a.zDepth - b.zDepth);
  for (const it of items) it.draw();

  // 4) 仅画双侧甲板护栏细线与望柱
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i], s1 = stations[i + 1];
    line3(g, pr, [s0[0] * L, s0[1] * W * farSide, s0[2] + 5.5], [s1[0] * L, s1[1] * W * farSide, s1[2] + 5.5], theme.trimColor, 1.4);
    line3(g, pr, [s0[0] * L, s0[1] * W * nearSide, s0[2] + 5.5], [s1[0] * L, s1[1] * W * nearSide, s1[2] + 5.5], theme.trimBright, 1.6);
    line3(g, pr, [s0[0] * L, s0[1] * W * nearSide, s0[2]], [s0[0] * L, s0[1] * W * nearSide, s0[2] + 6], theme.pillarColor, 1.2);
  }

  theme.drawExtra?.(g, spec, theme);
}

/** 按半周偏航角与缓存键名离屏烘焙飞舟本体精灵 */
function getAirshipSpriteByYaw(spec: AirshipVisualSpec, yaw: number, dirKey: string): HTMLCanvasElement | null {
  const key = `${spec.tier}|${spec.style}|${dirKey}|${spec.hullColor ?? ''}|${spec.trimColor ?? ''}|${spec.glowRgb ?? ''}|${spec.bannerText ?? ''}|${spec.convoyCargo ? 1 : 0}`;
  const hit = SPRITE_CACHE.get(key);
  if (hit) {
    SPRITE_CACHE.delete(key);
    SPRITE_CACHE.set(key, hit);
    return hit;
  }
  if (typeof document === 'undefined') return null;
  const m = getAirshipMetrics(spec.tier);
  const cv = makeCanvas(m.w, m.h);
  const g = cv.getContext('2d');
  if (!g) return null;
  g.save();
  g.translate(m.ax, m.ay);
  drawAirshipHull3D(g, spec, yaw);
  g.restore();
  SPRITE_CACHE.set(key, cv);
  while (SPRITE_CACHE.size > MAX_SPRITES) {
    const first = SPRITE_CACHE.keys().next().value;
    if (first !== undefined) SPRITE_CACHE.delete(first);
    else break;
  }
  return cv;
}

/** 离屏缓存飞舟本体精灵 */
export function getAirshipSprite(spec: AirshipVisualSpec, dir: AirshipDir8 = 'e'): HTMLCanvasElement | null {
  const { base, yaw } = resolveDir8(dir);
  return getAirshipSpriteByYaw(spec, yaw, base);
}

/** 连续航向角版离屏缓存（5° 步进，支持 360° 平滑偏航） */
export function getAirshipSpriteForAngle(spec: AirshipVisualSpec, angle: number): HTMLCanvasElement | null {
  const { yaw, binKey } = resolveAirshipAnglePose(angle);
  return getAirshipSpriteByYaw(spec, yaw, binKey);
}

function getScorchedSpriteByYaw(spec: AirshipVisualSpec, yaw: number, dirKey: string): HTMLCanvasElement | null {
  const key = `${spec.tier}|${spec.style}|${dirKey}|${spec.hullColor ?? ''}|${spec.trimColor ?? ''}|${spec.glowRgb ?? ''}|${spec.bannerText ?? ''}|${spec.convoyCargo ? 1 : 0}`;
  const hit = WRECK_CACHE.get(key);
  if (hit) return hit;
  const baseSpr = getAirshipSpriteByYaw(spec, yaw, dirKey);
  if (!baseSpr) return null;
  const cv = makeCanvas(baseSpr.width, baseSpr.height);
  const cg = cv.getContext('2d');
  if (!cg) return baseSpr;
  cg.drawImage(baseSpr, 0, 0);
  cg.globalCompositeOperation = 'source-atop';
  cg.fillStyle = 'rgba(18,12,10,0.54)';
  cg.fillRect(0, 0, baseSpr.width, baseSpr.height);
  cg.globalCompositeOperation = 'source-over';
  WRECK_CACHE.set(key, cv);
  while (WRECK_CACHE.size > MAX_SPRITES) {
    const first = WRECK_CACHE.keys().next().value;
    if (first !== undefined) WRECK_CACHE.delete(first);
    else break;
  }
  return cv;
}

function drawFractureSplinters(g: CanvasRenderingContext2D, dir: -1 | 1, halfH: number, hullCol: string, trimCol: string) {
  g.save();
  for (let i = -3; i <= 3; i++) {
    const sy = i * (halfH * 0.22);
    const len = (12 + ((Math.abs(i) * 7) % 14)) * dir;
    g.fillStyle = i % 2 === 0 ? '#1c130e' : hullCol;
    g.beginPath();
    g.moveTo(0, sy - 3.5);
    g.lineTo(len, sy + (i % 2 === 0 ? 1.8 : -1.8));
    g.lineTo(0, sy + 4);
    g.closePath();
    g.fill();
    inkStroke(g, 'rgba(12,8,6,0.88)', 1.2);
    g.stroke();
  }
  g.strokeStyle = trimCol;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, -halfH * 0.65);
  g.lineTo(8 * dir, -halfH * 0.25);
  g.lineTo(-3 * dir, halfH * 0.2);
  g.lineTo(7 * dir, halfH * 0.55);
  g.stroke();
  g.restore();
}

/** 现场绘制连续朝向（或八向兼容）飞舟 */
export function drawAirshipEntity(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  lift: number,
  dirOrFace: AirshipDir8 | 1 | -1,
  t: number,
  spec: AirshipVisualSpec,
  opts: {
    angle?: number;
    shieldRatio?: number;
    chargeRatio?: number;
    wreck?: boolean;
    wreckFade?: number;
    scale?: number;
    noShadow?: boolean;
  } = {},
) {
  const dir: AirshipDir8 = dirOrFace === 1 ? 'e' : dirOrFace === -1 ? 'w' : dirOrFace;
  const pose = opts.angle !== undefined && Number.isFinite(opts.angle)
    ? resolveAirshipAnglePose(opts.angle)
    : (() => { const r = resolveDir8(dir); return { flip: r.flip, yaw: r.yaw, binKey: r.base }; })();
  const { flip, yaw, binKey } = pose;
  const m = getAirshipMetrics(spec.tier);
  const theme = resolveAirshipTheme(spec);
  const glow = theme.glowRgb;
  const scale = (opts.scale ?? 1) * (spec.customScale ?? 1);
  const drawScale = scale * (m.worldScale ?? 1);
  const spr = getAirshipSpriteByYaw(spec, yaw, binKey);

  g.save();
  if (opts.wreck) {
    const fade = opts.wreckFade ?? 1;
    g.globalAlpha *= fade;
    const gap = (36 + spec.tier * 18) * scale;
    const halfH = 98 * (spec.tier * 0.35 + 0.65);

    g.fillStyle = 'rgba(18,13,10,0.46)';
    g.beginPath();
    g.ellipse(x - gap * 1.1, y + 18 * scale, m.shieldRx * 0.44 * scale, m.shieldRy * 0.26 * scale, -0.1, 0, Math.PI * 2);
    g.ellipse(x + gap * 1.1, y + 24 * scale, m.shieldRx * 0.42 * scale, m.shieldRy * 0.25 * scale, 0.12, 0, Math.PI * 2);
    g.fill();

    const scorched = getScorchedSpriteByYaw(spec, yaw, binKey) ?? spr;
    const cutOffsets = [-14, 16, -12, 18, -16, 10];
    const drawHalf = (side: 'stern' | 'bow') => {
      g.save();
      const dx = side === 'stern' ? -gap * flip : gap * flip;
      const dy = (side === 'stern' ? -4 : 14) * scale;
      const rot = side === 'stern' ? -0.22 : 0.27;
      g.translate(x + dx, y + dy);
      g.scale(flip * drawScale, drawScale);
      g.rotate(rot);

      g.beginPath();
      const edgeX = side === 'stern' ? -m.ax - 40 : m.w - m.ax + 40;
      g.moveTo(edgeX, -m.ay - 40);
      for (let i = 0; i < cutOffsets.length; i++) {
        const cy = -m.ay - 20 + (i / (cutOffsets.length - 1)) * (m.h + 40);
        g.lineTo(cutOffsets[i], cy);
      }
      g.lineTo(edgeX, m.h - m.ay + 40);
      g.closePath();
      g.clip();
      if (scorched) g.drawImage(scorched, -m.ax, -m.ay);
      else drawAirshipHull3D(g, spec, yaw);
      g.restore();

      g.save();
      g.translate(x + dx, y + dy);
      g.scale(flip * drawScale, drawScale);
      g.rotate(rot);
      drawFractureSplinters(g, side === 'stern' ? 1 : -1, halfH * 0.72, theme.hullColor, theme.trimColor);
      g.restore();
    };
    drawHalf('stern');
    drawHalf('bow');

    g.fillStyle = theme.hullShade;
    inkStroke(g, 'rgba(14,10,8,0.85)', 1.5);
    for (let i = 0; i < 4; i++) {
      const px = x + ((i - 1.5) * 38 + Math.sin(i * 3.1) * 18) * scale;
      const py = y + (22 + (i % 2) * 16) * scale;
      g.save();
      g.translate(px, py);
      g.rotate((i - 1.5) * 0.48);
      g.fillRect(-18 * scale, -6 * scale, 36 * scale, 12 * scale);
      g.strokeRect(-18 * scale, -6 * scale, 36 * scale, 12 * scale);
      g.restore();
    }

    const fireR = (48 + spec.tier * 20) * scale;
    const fg = g.createRadialGradient(x, y - 12 * scale, 4, x, y - 12 * scale, fireR);
    fg.addColorStop(0, theme.spiky ? 'rgba(255,95,115,0.64)' : 'rgba(255,175,70,0.60)');
    fg.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = fg;
    g.beginPath(); g.arc(x, y - 12 * scale, fireR, 0, Math.PI * 2); g.fill();

    for (let i = 0; i < 10; i++) {
      const p = ((t * 0.45 + i * 0.11) % 1);
      const sx = x + Math.sin(t * 1.5 + i * 2.1) * 48 * scale + (i - 4.5) * 18 * scale;
      const sy = y - (24 + p * (170 + spec.tier * 58)) * scale;
      const sr = (30 + p * (52 + spec.tier * 16)) * scale;
      g.fillStyle = `rgba(30,26,24,${(1 - p) * 0.62})`;
      g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.fill();
      if (i % 2 === 0) {
        g.fillStyle = `rgba(${theme.spiky ? '255,90,105' : '255,168,65'},${(1 - p) * 0.94})`;
        g.beginPath(); g.arc(sx + Math.cos(t * 4 + i) * 14 * scale, sy + 12 * scale, 7.5 * scale, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    return;
  }

  const bob = Math.sin(t * 2.1 + x * 0.01) * 5.0;
  const sy = y - lift + bob;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  const shAng = opts.angle !== undefined && Number.isFinite(opts.angle) ? opts.angle : (flip < 0 ? Math.PI - yaw : yaw);
  const shProj = getAirshipShieldAxes(spec.tier, shAng, scale);

  if (!opts.noShadow) {
    g.fillStyle = 'rgba(16,14,12,0.28)';
    g.beginPath();
    g.ellipse(x, y + 10, shProj.rx * 0.66, shProj.ry * 0.34, shProj.rot, 0, Math.PI * 2);
    g.fill();
  }

  g.save();
  const mistG = g.createRadialGradient(x, sy + 48 * scale, 16, x, sy + 48 * scale, Math.max(shProj.rx, shProj.ry) * 0.72);
  mistG.addColorStop(0, `rgba(${glow},0.16)`);
  mistG.addColorStop(1, `rgba(${glow},0)`);
  g.fillStyle = mistG;
  g.beginPath();
  g.ellipse(x, sy + 48 * scale, shProj.rx * 0.72, shProj.ry * 0.34, shProj.rot, 0, Math.PI * 2);
  g.fill();
  g.restore();

  const drawJet = () => {
    g.save();
    g.translate(x, sy);
    g.scale(flip * drawScale, drawScale);
    g.globalCompositeOperation = 'lighter';
    const tailX = -m.halfL * 1.04 * cosY;
    const tailY = -m.halfL * 1.04 * sinY * 0.56 - 14;
    const jetLen = (80 + spec.tier * 48 + Math.sin(t * 14) * 14);
    const jx = tailX - jetLen * cosY;
    const jy = tailY - jetLen * sinY * 0.56;
    const gr = g.createLinearGradient(tailX, tailY, jx, jy);
    gr.addColorStop(0, `rgba(${glow},0.72)`);
    gr.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = gr;
    const perpX = -sinY * 0.56, perpY = cosY;
    const halfJ = 14 + spec.tier * 8;
    g.beginPath();
    g.moveTo(tailX + perpX * halfJ, tailY + perpY * halfJ);
    g.lineTo(jx, jy);
    g.lineTo(tailX - perpX * halfJ, tailY - perpY * halfJ);
    g.closePath();
    g.fill();
    g.restore();
  };

  const sternInFront = sinY < -0.15;
  if (!sternInFront) drawJet();

  g.save();
  g.translate(x, sy);
  g.scale(flip * drawScale, drawScale);
  if (spr) g.drawImage(spr, -m.ax, -m.ay);
  else drawAirshipHull3D(g, spec, yaw);

  const ch = opts.chargeRatio ?? 0;
  if (ch > 0.02) {
    g.globalCompositeOperation = 'lighter';
    const pr = makeProj(yaw);
    const muzzleDist = spec.tier === 1 ? m.halfL * 0.72 : m.halfL * 0.82;
    const muzzleZ = spec.tier === 1 ? 28 : spec.tier === 2 ? 38 : 49;
    const [mx, my] = pr.p([muzzleDist, 0, muzzleZ]);
    const r = (26 + ch * 42) * (spec.tier * 0.45 + 0.65);
    const cg = g.createRadialGradient(mx, my, 0, mx, my, r);
    cg.addColorStop(0, `rgba(255,255,240,${0.94 * ch})`);
    cg.addColorStop(0.5, `rgba(${glow},${0.68 * ch})`);
    cg.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = cg;
    g.beginPath(); g.arc(mx, my, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  if (sternInFront) drawJet();

  const sh = opts.shieldRatio ?? 0;
  if (sh > 0.01) {
    const { rx, ry, rot } = shProj;
    const cy = sy - (spec.tier === 3 ? 84 : spec.tier === 2 ? 56 : 36) * scale;
    g.save();
    const sg = g.createRadialGradient(x, cy, Math.min(rx, ry) * 0.3, x, cy, Math.max(rx, ry));
    sg.addColorStop(0, `rgba(${glow},0.03)`);
    sg.addColorStop(0.76, `rgba(${glow},${0.11 + sh * 0.09})`);
    sg.addColorStop(1, `rgba(${glow},${0.32 + sh * 0.24})`);
    g.fillStyle = sg;
    g.beginPath(); g.ellipse(x, cy, rx, ry, rot, 0, Math.PI * 2); g.fill();

    g.strokeStyle = `rgba(${glow},${0.45 + sh * 0.35})`;
    g.lineWidth = 2.4;
    g.beginPath(); g.ellipse(x, cy, rx, ry, rot, 0, Math.PI * 2); g.stroke();

    g.strokeStyle = `rgba(255,255,245,${0.25 + sh * 0.25})`;
    g.lineWidth = 1.4;
    const spin = (t * 0.6) % (Math.PI * 2);
    g.beginPath(); g.ellipse(x, cy, rx * 0.88, ry * 0.88, rot, spin, spin + 0.9); g.stroke();
    g.beginPath(); g.ellipse(x, cy, rx * 0.88, ry * 0.88, rot, spin + Math.PI, spin + Math.PI + 0.9); g.stroke();
    g.restore();
  }

  g.restore();
}
