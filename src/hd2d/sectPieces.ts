// P10：宗门的立体构件（石阶、挡墙、长石桥、铁索桥、悬空峰的岩体、院落、香炉、石灯、碑、松……）。
// 用 registerPiece 登记，kind 以 s 开头免得和别处重名。
// 约定：s 开头的构件，p 里的长度一律是世界单位（不再乘 LOC_SCALE）；p.x2 / p.y2 这类「另一点」是地点本地的世界坐标（x 向东、y 向南）。
// 悬在半空的东西（悬空峰和它上面的殿阁）：p.on = { x, y, dz } 表示「以本地点 (x, y) 处的地面高度再加 dz」为脚下，而不是落在正下方的山坡上。
import { registerPiece, type PieceCtx } from './pieceKinds';
import { shadeOf, type ArchBuilder, type ArchPalette } from './arch';
import { chainDeck } from '../data/sectPlan';

type On = { x: number; y: number; dz: number };
type P = Record<string, any>;

const hash = (s: number, k: number) => { let h = Math.imul(s ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** 这一件脚下的高度：挂在悬空峰上的按 p.on 取，其余就是地面 */
const footOf = (c: PieceCtx): number => { const on = c.piece.p.on as On | undefined; return on ? c.groundAt(on.x, on.y) + on.dz : c.y; };
const palOf = (c: PieceCtx): ArchPalette => ({ ...c.pal, ...(c.piece.p.pal ?? {}) });

const STONE = '#9a9282', STONE_LIGHT = '#c4bca8', STONE_DARK = '#6a645a', WOOD = '#6a4a32', IRON = '#34322e';

/** 三角面，自动定朝向：法线背离 ref 点（构件只用单面材质，朝向错了会被剔掉） */
function triOut(B: ArchBuilder, a: number[], b: number[], c: number[], color: string, ref: readonly number[]) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const ox = (a[0] + b[0] + c[0]) / 3 - ref[0], oy = (a[1] + b[1] + c[1]) / 3 - ref[1], oz = (a[2] + b[2] + c[2]) / 3 - ref[2];
  if (nx * ox + ny * oy + nz * oz >= 0) B.tri(a, b, c, color); else B.tri(a, c, b, color);
}
function quadOut(B: ArchBuilder, a: number[], b: number[], c: number[], d: number[], color: string, ref: readonly number[]) {
  triOut(B, a, b, c, color, ref); triOut(B, a, c, d, color, ref);
}
/** 一段沿任意方向的「盒子」：从 a 到 b（水平），宽 w，底 y0、顶 y1 可以两头不一样（斜的扶手、桥面） */
function beam(B: ArchBuilder, ax: number, az: number, ay0: number, ay1: number, bx: number, bz: number, by0: number, by1: number, w: number, color: string, top = true) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
  const A0 = [ax + nx, ay0, az + nz], A1 = [ax - nx, ay0, az - nz], B0 = [bx + nx, by0, bz + nz], B1 = [bx - nx, by0, bz - nz];
  const A2 = [ax + nx, ay1, az + nz], A3 = [ax - nx, ay1, az - nz], B2 = [bx + nx, by1, bz + nz], B3 = [bx - nx, by1, bz - nz];
  const C = [(ax + bx) / 2, (ay0 + ay1 + by0 + by1) / 4, (az + bz) / 2];
  quadOut(B, A0, B0, B2, A2, color, C); quadOut(B, B1, A1, A3, B3, color, C);
  quadOut(B, A1, A0, A2, A3, shadeOf(color, -0.08), C); quadOut(B, B0, B1, B3, B2, shadeOf(color, -0.08), C);
  if (top) quadOut(B, A2, B2, B3, A3, shadeOf(color, 0.08), [C[0], C[1] - 1e4, C[2]]);
}

// ---------------------------------------------------------------- 殿阁（直接调 ArchBuilder，大小尊卑全靠参数）
/** 殿：p = { w, d, h(殿身高), roof(屋顶高), tiers, base(台基高), gable, open(门洞宽), lit } ；位置是正面中点 */
registerPiece('sHall', (c) => {
  const p = c.piece.p, y = footOf(c), pal = palOf(c), from = c.builder.vertexCount;
  if (p.stilts) stilts(c, c.x, c.z - p.d / 2, p.w * 0.58, p.d * 0.6, y);
  c.builder.hall(c.x, y, c.z, p.w, p.d, p.h, p.roof ?? p.d * 0.42, pal, { tiers: p.tiers ?? 1, base: p.base ?? p.h * 0.18, gable: p.gable ?? 0.55, opening: p.open ?? 0, steps: p.steps !== false });
  if (p.lit) {
    // 窗纸：檐下一排暖色的窗（白天是糊纸的窗格，夜里在夜色里显得亮）
    const base = p.base ?? p.h * 0.18, n = Math.max(2, Math.round(p.w / (p.h * 0.9)));
    for (let i = 0; i < n; i++) {
      const wx = c.x - p.w / 2 + p.w * (i + 0.5) / n;
      if (Math.abs(wx - c.x) < p.w * 0.12) continue;
      c.builder.box(wx, y + base + p.h * 0.55, c.z + 1.2, p.w / n * 0.5, p.h * 0.3, 1.5, p.win ?? '#f2d79a');
    }
  }
  if (p.glaze) c.builder.glaze(from);
});
/** 半悬在台沿外的楼阁底下：一排排木柱落到下面的山坡上，柱间斜撑（中心 cx, cz，半宽 hx、半深 hz，柱顶 y） */
function stilts(c: PieceCtx, cx: number, cz: number, hx: number, hz: number, y: number) {
  const B = c.builder;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = cx - hx + hx * 2 * i / 3, z = cz - hz + hz * 2 * j / 3, g = c.groundAt(x, z);
    if (g > y - 30) continue;
    B.box(x, (g + y) / 2, z, 22, y - g + 10, 22, '#5a4030');
    if (j < 3 && y - g > 120) beam(B, x, z, y - 120, y - 110, x, z + hz * 2 / 3, y - 20, y - 10, 10, '#4c3628');
  }
}
/** 楼阁 / 塔：p = { w, h, tiers } */
registerPiece('sPagoda', (c) => {
  const p = c.piece.p, y = footOf(c), B = c.builder;
  B.pagoda(c.x, y, c.z - p.w * 0.5, p.w, p.h, p.tiers ?? 5, palOf(c));
  if (p.stilts) stilts(c, c.x, c.z - p.w * 0.5, p.w * 0.65, p.w * 0.65, y);   // 半悬在崖外：木柱托着

});
/** 亭：p = { w, h } */
registerPiece('sPavilion', (c) => { const p = c.piece.p; c.builder.pavilion(c.x, footOf(c), c.z - p.w * 0.5, p.w, p.h ?? p.w * 1.5, palOf(c)); });
/** 牌坊：p = { w, h, stone } */
registerPiece('sGate', (c) => {
  const p = c.piece.p, pal = palOf(c);
  c.builder.paifang(c.x, footOf(c), c.z, p.w, p.h, p.stone ? { ...pal, pillar: STONE_LIGHT, roof: shadeOf(pal.roof, -0.1) } : pal);
});

// ---------------------------------------------------------------- 石阶
/** 石阶：本件位置是低的一头，p = { x2, y2（高的一头，本地世界坐标）, w }。踏步一级级的盒子，两侧垂带（斜的矮墙）和望柱 */
registerPiece('sStair', (c) => {
  const p = c.piece.p, B = c.builder;
  const ax = c.x, az = c.z, bx = p.x2, bz = p.y2, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, vx = -uz, vz = ux;
  const lo = c.groundAt(ax - ux * 30, az - uz * 30), hi = c.groundAt(bx + ux * 30, bz + uz * 30);
  const n = Math.max(4, Math.round(L / 34)), w = p.w, rise = (hi - lo) / n;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, cx = ax + dx * (t0 + t1) / 2, cz = az + dz * (t0 + t1) / 2;
    const top = lo + (hi - lo) * t1, bot = lo + (hi - lo) * t0 - 8;
    beam(B, ax + dx * t0, az + dz * t0, bot, top, ax + dx * t1, az + dz * t1, bot, top, w - 8, i % 2 ? STONE_LIGHT : shadeOf(STONE_LIGHT, -0.05));
    void cx; void cz;
  }
  // 垂带：两侧斜的矮墙，墙脚落到旁边的地面
  for (const s of [-1, 1]) {
    const ox = vx * s * (w / 2), oz = vz * s * (w / 2), seg = Math.max(2, Math.ceil(L / 120));
    for (let k = 0; k < seg; k++) {
      const t0 = k / seg, t1 = (k + 1) / seg;
      const xa = ax + dx * t0 + ox, za = az + dz * t0 + oz, xb = ax + dx * t1 + ox, zb = az + dz * t1 + oz;
      const ya = lo + (hi - lo) * t0, yb = lo + (hi - lo) * t1;
      const ga = Math.min(ya, c.groundAt(xa + vx * s * 60, za + vz * s * 60)) - 12, gb = Math.min(yb, c.groundAt(xb + vx * s * 60, zb + vz * s * 60)) - 12;
      beam(B, xa, za, Math.min(ga, gb), ya + 26, xb, zb, Math.min(ga, gb), yb + 26, 26, STONE);
    }
    // 望柱
    for (let d = 0; d <= L + 1; d += 140) {
      const t = Math.min(1, d / L), y = lo + (hi - lo) * t;
      B.box(ax + dx * t + ox, y + 46, az + dz * t + oz, 16, 40, 16, STONE_LIGHT);
    }
  }
  void rise;
});

// ---------------------------------------------------------------- 台沿：石栏 + 两级毛石墙
/**
 * 台沿一段：p.pts = [x, y, nx, ny, ...]（顺着台面轮廓的折线，n 朝外），p.perch 为真时只围石栏。
 * 台沿上是一道矮石栏（望柱 + 扶手，看得穿）；台面下是两级错落的毛石墙——第一级贴着台沿、第二级往外让出一步，
 * 青灰带苔色、块块深浅不一，墙顶的那一步长着苔；再往下就是自然的山坡（地形自己的岩面和树）。
 * 墙面的位置和地形在台沿外那一截陡坎（data/sectPlan.ts 的 dropAt：外伸 90 内落 300）对得上，墙脚埋进土里。
 * 外面地面不比台面低的那几截（相邻的台、石梁）不砌也不围。
 */
const RUBBLE = ['#6d7266', '#646b5d', '#74766a', '#5c6456', '#6a6e60'];
registerPiece('sWall', (c) => {
  const p = c.piece.p, B = c.builder, P = p.pts as number[], n = P.length / 4;
  for (let i = 0; i < n - 1; i++) {
    const ax = P[i * 4], az = P[i * 4 + 1], bx = P[i * 4 + 4], bz = P[i * 4 + 5];
    let nx = P[i * 4 + 2] + P[i * 4 + 6], nz = P[i * 4 + 3] + P[i * 4 + 7]; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const top = c.groundAt(mx - nx * 60, mz - nz * 60);
    const far = Math.min(c.groundAt(mx + nx * 130, mz + nz * 130), c.groundAt(mx + nx * 200, mz + nz * 200));
    const at = (d: number, y: number, end: 0 | 1) => end ? [bx + nx * d, y, bz + nz * d] : [ax + nx * d, y, az + nz * d];
    // 平地堆的小山（p.cut）：台沿外紧挨着就是缓坡的地方不砌墙、不围栏（台沿只是一道坎，人能走下去）；
    // 台沿外地面比台面高（后沿切进山坡）的地方砌一道护坡石墙，墙面朝台里
    if (p.cut) {
      const g70 = c.groundAt(mx + nx * 70, mz + nz * 70);
      if (g70 - top >= 30 && !p.perch) {
        const hi = g70 + 6, inRef = [mx + nx * 400, top + 100, mz + nz * 400];
        quadOut(B, at(26, top - 6, 0), at(26, top - 6, 1), at(26, hi, 1), at(26, hi, 0), RUBBLE[Math.floor(hash(c.piece.seed, i) * RUBBLE.length)], inRef);
        quadOut(B, at(26.5, top + (hi - top) * 0.55, 0), at(26.5, top + (hi - top) * 0.55, 1), at(26.5, top + (hi - top) * 0.55 + 6, 1), at(26.5, top + (hi - top) * 0.55 + 6, 0), '#4c5246', inRef);
        quadOut(B, at(26, hi, 0), at(26, hi, 1), at(70, hi, 1), at(70, hi, 0), p.moss ?? '#7c8170', [mx, hi - 1000, mz]);
        continue;
      }
      if (top - g70 < 35) continue;
    }
    if (top - far < 35) continue;
    const ref = [mx - nx * 300, top - 100, mz - nz * 300];
    // 石栏：望柱 + 扶手（两个面），能看穿
    B.box(ax - nx * 12, top + 24, az - nz * 12, 13, 48, 13, '#a9a493');
    quadOut(B, at(-16, top + 40, 0), at(-16, top + 40, 1), at(-8, top + 40, 1), at(-8, top + 40, 0), '#b4ae9c', [mx, top - 1000, mz]);
    quadOut(B, at(-8, top + 34, 0), at(-8, top + 34, 1), at(-8, top + 40, 1), at(-8, top + 40, 0), '#9e9886', ref);
    quadOut(B, at(-8, top + 12, 0), at(-8, top + 12, 1), at(-8, top + 16, 1), at(-8, top + 16, 0), '#9e9886', ref);
    if (p.perch) continue;
    const h = hash(c.piece.seed, i), col = RUBBLE[Math.floor(h * RUBBLE.length)], col2 = RUBBLE[Math.floor(hash(c.piece.seed, i + 50) * RUBBLE.length)];
    // 第一级：贴着台沿，墙面在外 45 处
    const g45 = c.groundAt(mx + nx * 50, mz + nz * 50), y0b = Math.max(top - 150, g45 - 25), j = (h - 0.5) * 10;
    quadOut(B, at(-4, top + 2, 0), at(-4, top + 2, 1), at(45, top + 2, 1), at(45, top + 2, 0), p.moss ?? '#7c8170', [mx, top - 1000, mz]);
    quadOut(B, at(45, top + 2, 0), at(45, top + 2, 1), at(45, y0b, 1), at(45, y0b, 0), col, ref);
    quadOut(B, at(45.5, top - 70 + j, 0), at(45.5, top - 70 + j, 1), at(45.5, top - 64 + j, 1), at(45.5, top - 64 + j, 0), '#4c5246', ref);
    // 第二级：往外让一步，台阶顶上长苔
    if (far < top - 170) {
      const y1t = top - 140 + j, g95 = c.groundAt(mx + nx * 100, mz + nz * 100), y1b = Math.max(top - 300, g95 - 25);
      if (y1t > g95 + 10) {
        quadOut(B, at(45, y1t, 0), at(45, y1t, 1), at(90, y1t, 1), at(90, y1t, 0), '#66724f', [mx, top - 1000, mz]);
        quadOut(B, at(90, y1t, 0), at(90, y1t, 1), at(90, y1b, 1), at(90, y1b, 0), col2, ref);
        quadOut(B, at(90.5, y1t - 70, 0), at(90.5, y1t - 70, 1), at(90.5, y1t - 64, 1), at(90.5, y1t - 64, 0), '#4c5246', ref);
      }
    }
  }
});

// ---------------------------------------------------------------- 桥
/** 长石桥（走在石梁上）：本件位置是一头，p = { x2, y2, w }。桥面一节节贴着石梁的高度，两侧石栏杆，桥身往下一截石拱的侧墙 */
registerPiece('sBridge', (c) => {
  const p = c.piece.p, B = c.builder, ax = c.x, az = c.z, bx = p.x2, bz = p.y2, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), vx = -dz / L, vz = dx / L;
  const n = Math.max(4, Math.round(L / 110));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, xa = ax + dx * t0, za = az + dz * t0, xb = ax + dx * t1, zb = az + dz * t1;
    const ya = c.groundAt(xa, za), yb = c.groundAt(xb, zb);
    // 桥身：两侧往下挂的石墙，中间开拱（拱洞用深色的半圆近似）
    beam(B, xa, za, Math.min(ya, yb) - 160, ya + 6, xb, zb, Math.min(ya, yb) - 160, yb + 6, p.w + 20, i % 2 ? STONE : shadeOf(STONE, -0.05));
    for (const s of [-1, 1]) {
      beam(B, xa + vx * s * p.w / 2, za + vz * s * p.w / 2, ya + 6, ya + 38, xb + vx * s * p.w / 2, zb + vz * s * p.w / 2, yb + 6, yb + 38, 14, STONE_LIGHT);
      B.box(xa + vx * s * p.w / 2, ya + 46, za + vz * s * p.w / 2, 18, 30, 18, STONE_LIGHT);
    }
  }
});
/**
 * 铁索桥：本件位置是一头，p = { x2, y2, w, a: On, b: On }（两头桥面的高度各按 On 取）。
 * 木板桥面垂成一道弧，两侧各两道铁索，两头各一对桥柱。
 */
registerPiece('sChain', (c) => {
  const p = c.piece.p, B = c.builder, a = p.a as On, b = p.b as On;
  const ax = c.x, az = c.z, bx = p.x2, bz = p.y2, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), vx = -dz / L, vz = dx / L;
  const ya = c.groundAt(a.x, a.y) + a.dz, yb = c.groundAt(b.x, b.y) + b.dz, n = Math.max(12, Math.round(L / 60));
  // 桥面的弧和地表的「桥面高度」是同一个式子（data/sectPlan.ts 的 chainDeck），人走在桥上脚正好踩在木板上
  const deck = (t: number) => chainDeck(ya, yb, L, t);
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    beam(B, ax + dx * t0, az + dz * t0, deck(t0) - 8, deck(t0), ax + dx * t1 - dx / n * 0.15, az + dz * t1 - dz / n * 0.15, deck(t1) - 8, deck(t1), p.w, i % 2 ? WOOD : shadeOf(WOOD, 0.12));
  }
  for (const s of [-1, 1]) for (const hgt of [14, 60]) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, off = s * p.w / 2;
      beam(B, ax + dx * t0 + vx * off, az + dz * t0 + vz * off, deck(t0) + hgt - 3, deck(t0) + hgt + 3, ax + dx * t1 + vx * off, az + dz * t1 + vz * off, deck(t1) + hgt - 3, deck(t1) + hgt + 3, 5, IRON);
    }
    for (const [x, z, y] of [[ax, az, ya], [bx, bz, yb]] as const) B.box(x + vx * s * (p.w / 2 + 8), y + 50, z + vz * s * (p.w / 2 + 8), 22, 110, 22, '#8a3a26');
  }
  // 吊索：每隔几节一根竖索
  for (let i = 2; i < n - 1; i += 3) for (const s of [-1, 1]) {
    const t = i / n; B.box(ax + dx * t + vx * s * p.w / 2, deck(t) + 32, az + dz * t + vz * s * p.w / 2, 3, 50, 3, IRON);
  }
});

// ---------------------------------------------------------------- 悬空峰
/**
 * 悬空峰的岩体：顶面是一块平的石台（半径 r），下面一圈圈往下收成倒悬的石锥（参照秘境石台底下的做法），
 * 岩面按高度分层着色，越往下越暗。p = { r, on, seed }
 */
registerPiece('sIsle', (c) => {
  const p = c.piece.p, B = c.builder, top = footOf(c), r = p.r as number, seed = p.seed ?? 1, N = 28;
  const rings: [number, number][] = [[0, 1], [-0.06, 1.02], [-0.22, 0.92], [-0.55, 0.7], [-0.95, 0.42], [-1.35, 0.18], [-1.7, 0.05]];
  const pt = (ri: number, i: number): number[] => {
    const a = (i % N) / N * Math.PI * 2, [dy, k0] = rings[ri];
    const jag = ri < 2 ? (hash(seed, i % N) - 0.5) * 0.06 : (hash(seed + ri * 17, i % N) - 0.5) * 0.26 + (hash(seed + 5, (i % N) >> 2) - 0.5) * 0.18;
    const rad = r * Math.max(0.03, k0 + jag);
    return [c.x + Math.cos(a) * rad, top + dy * r * (ri < 2 ? 1 : 0.9 + hash(seed + 9 + ri, i % N) * 0.25), c.z + Math.sin(a) * rad];
  };
  const rock = (ri: number) => ['#b8b2a2', '#9e988a', '#8a8578', '#77736a', '#666359', '#57554e'][Math.min(5, ri)];
  // 顶面：草皮与石板
  const down = [c.x, top - 1e5, c.z];
  for (let i = 0; i < N; i++) triOut(B, [c.x, top + 1, c.z], pt(0, i + 1), pt(0, i), hash(seed, i + 40) < 0.5 ? '#9aa070' : '#a4a878', down);
  for (let ri = 0; ri < rings.length - 1; ri++) for (let i = 0; i < N; i++) {
    const a = pt(ri, i), b = pt(ri, i + 1), d = pt(ri + 1, i), e = pt(ri + 1, i + 1), mid = [c.x, (a[1] + d[1]) / 2, c.z];
    triOut(B, a, b, d, rock(ri), mid); triOut(B, b, e, d, shadeOf(rock(ri), -0.06), mid);
  }
  const tip = [c.x + (hash(seed, 77) - 0.5) * r * 0.2, top - r * 1.95, c.z + (hash(seed, 78) - 0.5) * r * 0.2];
  for (let i = 0; i < N; i++) triOut(B, pt(rings.length - 1, i), pt(rings.length - 1, i + 1), tip, '#4c4a44', [c.x, top - r * 1.2, c.z]);
  // 几块垂下来的小石笋
  for (let k = 0; k < 5; k++) {
    const a = hash(seed, 90 + k) * Math.PI * 2, rr = r * (0.35 + hash(seed, 100 + k) * 0.3), x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr, y = top - r * (0.5 + hash(seed, 110 + k) * 0.4), s = r * 0.12;
    const tipK = [x, y - r * (0.5 + hash(seed, 120 + k) * 0.4), z], m = [x, y - r * 0.1, z];
    triOut(B, [x - s, y, z - s], [x + s, y, z - s], tipK, '#5c5a52', m); triOut(B, [x + s, y, z - s], [x + s, y, z + s], tipK, '#6a675e', m);
    triOut(B, [x + s, y, z + s], [x - s, y, z + s], tipK, '#76726a', m); triOut(B, [x - s, y, z + s], [x - s, y, z - s], tipK, '#625f57', m);
  }
});

// ---------------------------------------------------------------- 小件
/** 立体的松：一根干，三层收小的伞形枝叶（悬空峰上用；山坡上仍是立板的树） */
registerPiece('sPine', (c) => {
  const p = c.piece.p, B = c.builder, y = footOf(c), h = p.h ?? 260, seed = c.piece.seed;
  B.box(c.x, y + h * 0.3, c.z, h * 0.06, h * 0.6, h * 0.06, '#5a4232');
  for (let k = 0; k < 3; k++) {
    const yy = y + h * (0.42 + k * 0.2), r = h * (0.42 - k * 0.1), tip = [c.x, yy + h * 0.16, c.z], N = 7;
    const col = shadeOf('#3e5a3a', (hash(seed, k) - 0.5) * 0.2 + k * 0.05);
    for (let i = 0; i < N; i++) {
      const a0 = (i + hash(seed, 9) ) / N * Math.PI * 2, a1 = (i + 1 + hash(seed, 9)) / N * Math.PI * 2;
      const A = [c.x + Math.cos(a0) * r, yy - h * 0.05, c.z + Math.sin(a0) * r], Bp = [c.x + Math.cos(a1) * r, yy - h * 0.05, c.z + Math.sin(a1) * r];
      triOut(B, A, tip, Bp, col, [c.x, yy - h * 0.2, c.z]);
      triOut(B, A, Bp, [c.x, yy - h * 0.02, c.z], shadeOf(col, -0.25), [c.x, yy + h, c.z]);
    }
  }
});
/** 石灯：石座、灯柱、灯室（暖色的窗）、小攒尖顶 */
registerPiece('sLamp', (c) => {
  const B = c.builder, y = footOf(c), s = c.piece.p.s ?? 1;
  B.box(c.x, y + 6 * s, c.z, 34 * s, 12 * s, 34 * s, STONE);
  B.box(c.x, y + 40 * s, c.z, 12 * s, 56 * s, 12 * s, STONE_LIGHT);
  B.box(c.x, y + 74 * s, c.z, 30 * s, 22 * s, 30 * s, STONE);
  const glow = c.piece.p.glow ?? '#ffd88a';
  B.box(c.x, y + 74 * s, c.z, 32 * s, 12 * s, 18 * s, glow);
  B.box(c.x, y + 74 * s, c.z, 18 * s, 12 * s, 32 * s, glow);
  // 小攒尖顶：四个三角面
  const r = 24 * s, top = [c.x, y + 104 * s, c.z], cen = [c.x, y + 90 * s, c.z];
  const q = [[c.x - r, y + 86 * s, c.z - r], [c.x + r, y + 86 * s, c.z - r], [c.x + r, y + 86 * s, c.z + r], [c.x - r, y + 86 * s, c.z + r]];
  for (let i = 0; i < 4; i++) triOut(B, q[i], q[(i + 1) % 4], top, STONE_DARK, cen);
});
/** 香炉（鼎）：三足、圆肚（八边）、两耳、炉盖 */
registerPiece('sCenser', (c) => {
  const B = c.builder, y = footOf(c), s = c.piece.p.s ?? 1, bronze = '#6a5a3a';
  B.box(c.x, y + 8 * s, c.z, 120 * s, 16 * s, 120 * s, STONE);
  for (const [dx, dz] of [[-30, 20], [30, 20], [0, -30]]) B.box(c.x + dx * s, y + 34 * s, c.z + dz * s, 12 * s, 36 * s, 12 * s, bronze);
  B.box(c.x, y + 74 * s, c.z, 90 * s, 50 * s, 90 * s, bronze);
  B.box(c.x, y + 74 * s, c.z, 100 * s, 10 * s, 100 * s, shadeOf(bronze, 0.2));
  for (const sx of [-1, 1]) B.box(c.x + sx * 52 * s, y + 112 * s, c.z, 8 * s, 30 * s, 30 * s, bronze);
  B.roof(c.x, y + 99 * s, c.z, 46 * s, 46 * s, 30 * s, { pointed: true, color: shadeOf(bronze, -0.1), trim: bronze, lift: 6 * s, tile: 8 });
});
/** 碑：龟趺（矮石座）上一块高碑 */
registerPiece('sStele', (c) => {
  const B = c.builder, y = footOf(c), s = c.piece.p.s ?? 1;
  B.box(c.x, y + 12 * s, c.z, 70 * s, 24 * s, 90 * s, STONE_DARK);
  B.box(c.x, y + 24 * s + 70 * s, c.z, 54 * s, 140 * s, 14 * s, '#5e5a52');
  B.box(c.x, y + 24 * s + 148 * s, c.z, 62 * s, 16 * s, 18 * s, '#4e4a44');
});
/** 演武场的木桩、兵器架 */
registerPiece('sPost', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p;
  if (p.rack) {
    for (const sx of [-1, 1]) B.box(c.x + sx * 60, y + 50, c.z, 8, 100, 8, WOOD);
    B.box(c.x, y + 90, c.z, 130, 6, 8, WOOD); B.box(c.x, y + 40, c.z, 130, 6, 8, WOOD);
    for (let i = -2; i <= 2; i++) B.box(c.x + i * 22, y + 70, c.z + 6, 3, 110, 3, '#9aa0a8');
  } else {
    B.box(c.x, y + 45, c.z, 18, 90, 18, WOOD);
    B.box(c.x, y + 62, c.z, 60, 8, 8, shadeOf(WOOD, 0.1));
  }
});
/** 水池（瀑布落下的潭、放生池）：一圈石沿，水面 */
registerPiece('sPool', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p, w = p.w, d = p.d;
  const water = p.blood ? '#6a1a1c' : p.moon ? '#9cb0c8' : p.sea ? '#6f9aa4' : '#7fa0a0';
  if (p.round) {
    // 圆池（月池）：十六边的水面、一圈石沿，池心一轮白月
    const N = 16, r = w / 2;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      B.tri([c.x, y + 4, c.z], [c.x + Math.cos(a1) * r, y + 4, c.z + Math.sin(a1) * r], [c.x + Math.cos(a0) * r, y + 4, c.z + Math.sin(a0) * r], water);
      beam(B, c.x + Math.cos(a0) * r, c.z + Math.sin(a0) * r, y, y + 16, c.x + Math.cos(a1) * r, c.z + Math.sin(a1) * r, y, y + 16, 18, STONE_LIGHT);
      if (p.moon) { const rr = r * 0.25; B.tri([c.x, y + 5, c.z], [c.x + Math.cos(a1) * rr, y + 5, c.z + Math.sin(a1) * rr], [c.x + Math.cos(a0) * rr, y + 5, c.z + Math.sin(a0) * rr], '#f4f2ea'); }
    }
    return;
  }
  B.box(c.x, y + 3, c.z, w, 4, d, water);
  for (const s of [-1, 1]) { B.box(c.x + s * w / 2, y + 10, c.z, 16, 20, d + 16, STONE_LIGHT); B.box(c.x, y + 10, c.z + s * d / 2, w + 16, 20, 16, STONE_LIGHT); }
});
/** 药田：一畦畦的低垄，几种颜色的药草 */
registerPiece('sField', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p, w = p.w, d = p.d, cols = ['#6a9a58', '#7aa860', '#8ab070', '#5a8a62', '#9aa868'];
  B.box(c.x, y + 2, c.z, w, 3, d, '#8a7a5a');
  const rows = Math.max(2, Math.floor(d / 46));
  for (let i = 0; i < rows; i++) B.box(c.x, y + 7, c.z - d / 2 + d * (i + 0.5) / rows, w - 24, 10, d / rows * 0.6, cols[(c.piece.seed + i) % cols.length]);
});
/** 洞府：一堆嶙峋的岩石，正面一道深色的洞门，门上一小截屋檐和匾 */
registerPiece('sCave', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p, w = p.w ?? 260, seed = c.piece.seed, h = w * 0.7;
  const apex = [c.x + (hash(seed, 1) - 0.5) * w * 0.2, y + h, c.z - w * 0.3];
  const ring: number[][] = [];
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; ring.push([c.x + Math.cos(a) * w * (0.45 + hash(seed, i) * 0.15), y - 10, c.z - w * 0.3 + Math.sin(a) * w * (0.32 + hash(seed, i + 9) * 0.1)]); }
  for (let i = 0; i < 9; i++) triOut(B, ring[i], apex, ring[(i + 1) % 9], shadeOf('#8a867a', (hash(seed, i + 30) - 0.5) * 0.3), [c.x, y + h * 0.3, c.z - w * 0.3]);
  B.box(c.x, y + h * 0.22, c.z + 4, w * 0.24, h * 0.44, 10, '#2a2622');
  B.roof(c.x, y + h * 0.46, c.z + 10, w * 0.2, 22, 18, { gable: 0.9, color: c.pal.roof, trim: shadeOf(c.pal.roof, -0.35), lift: 6, tile: 8 });
  B.box(c.x, y + h * 0.56, c.z + 8, w * 0.16, 16, 4, c.pal.accent);
});
/**
 * 弟子院落：一圈矮院墙（南墙开门），北面正房、东西厢房，院里铺地。p = { w, d, lit }；位置是院落中心。
 * 外门成排成片地铺这个，一座院落一件，免得构件数失控。
 */
registerPiece('sYard', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p, w = p.w ?? 420, d = p.d ?? 340, pal = palOf(c), seed = c.piece.seed;
  const wallH = 46, t = 18, wc = '#d8d0bc', cap = pal.roof;
  B.box(c.x, y + 1.5, c.z, w - t, 3, d - t, '#cfc5a8');
  // 院墙：北、东、西整段，南墙中间开门（墙身一个盒子、墙帽一个盒子，院落成片地铺，顶点要省）
  const wallBox = (x: number, z: number, lx: number, lz: number) => { B.box(x, y + wallH / 2, z, lx, wallH, lz, wc); B.box(x, y + wallH + 4, z, lx + 10, 8, lz + 10, cap); };
  wallBox(c.x, c.z - d / 2, w, t); wallBox(c.x - w / 2, c.z, t, d); wallBox(c.x + w / 2, c.z, t, d);
  const gate = 70, side = (w - gate) / 2;
  wallBox(c.x - (gate + side) / 2, c.z + d / 2, side, t); wallBox(c.x + (gate + side) / 2, c.z + d / 2, side, t);
  B.roof(c.x, y + wallH + 10, c.z + d / 2, gate / 2 + 14, 16, 14, { gable: 0.9, color: cap, trim: shadeOf(cap, -0.35), lift: 5, tile: 8 });
  // 院门两侧一对灯笼
  for (const s of [-1, 1]) B.box(c.x + s * (gate / 2 + 10), y + wallH - 6, c.z + d / 2 + t / 2 + 8, 14, 18, 14, p.lit ? '#ffcf80' : '#c86a4a');
  // 正房（kind 2：两进，前面再一座过厅；kind 3：正房换成一座两层小楼）
  const mw = w * 0.56, md = Math.min(d * 0.3, 110), kind = p.kind ?? 1;
  // kind 3：正房是一座两层的小楼——宽、矮，上下两层都是歇山顶（不是塔）
  if (kind === 3) { const lz = c.z - d / 2 + t + md + 10; B.hall(c.x, y, lz, mw * 1.05, md, 58, md * 0.32, pal, { base: 8, gable: 0.9, steps: true }); B.hall(c.x, y + 8 + 58 + md * 0.16, lz - md * 0.12, mw * 0.82, md * 0.7, 46, md * 0.42, pal, { base: 1, gable: 0.9, steps: false }); }
  else B.hall(c.x, y, c.z - d / 2 + t + md + 4, mw, md, 62, md * 0.5, pal, { base: 8, gable: 0.8, steps: true });
  if (kind === 2) {
    B.hall(c.x, y, c.z + 30, w * 0.46, 80, 52, 42, pal, { base: 6, gable: 0.85, steps: true });
    B.box(c.x, y + wallH / 2, c.z - 40, w - t * 2, wallH * 0.8, t * 0.8, wc);   // 两进之间的隔墙
  }
  // 厢房（窄院只一侧有）
  const sw = Math.min(d * 0.4, 150), sd = Math.min(w * 0.17, 80), sz = kind === 2 ? c.z + d * 0.25 : c.z + 10;
  for (const s of [-1, 1]) {
    if (w < 360 && s > 0) continue;
    const hx = c.x + s * (w / 2 - t - sd / 2 - 6);
    B.box(hx, y + 26, sz, sd, 52, sw, pal.wall);
    B.roof(hx, y + 52, sz, sd / 2 + 12, sw / 2 + 12, sd * 0.42, { gable: 0.9, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: 6, tile: 11 });
    B.box(hx - s * (sd / 2 + 0.6), y + 30, sz, 1.2, 28, sw * 0.5, p.lit && hash(seed, s + 3) < 0.7 ? (p.win ?? '#f2d79a') : shadeOf(pal.pillar, -0.3));
  }
  // 院里一棵小树（树冠几块绿）
  if (hash(seed, 9) < 0.6) { const tx = c.x + (hash(seed, 10) - 0.5) * w * 0.3, tz = c.z + d * 0.18; B.box(tx, y + 25, tz, 8, 50, 8, '#5a4232'); B.box(tx, y + 62, tz, 46, 30, 46, hash(seed, 11) < 0.6 ? '#c8a03a' : '#5a7a4a'); }
  if (p.lit && kind !== 3) B.box(c.x, y + 8 + 62 * 0.55, c.z - d / 2 + t + md + 5.5, mw * 0.5, 18, 1.5, p.win ?? '#f2d79a');
});
/** 石狮：须弥座、蹲坐的身子、头与鬃（几块石头拼的，远看是一对石狮的剪影） */
registerPiece('sLion', (c) => {
  const B = c.builder, y = footOf(c), s = c.piece.p.s ?? 1, col = '#b4ac98';
  B.box(c.x, y + 20 * s, c.z, 70 * s, 40 * s, 90 * s, STONE);
  B.box(c.x, y + 70 * s, c.z - 10 * s, 50 * s, 60 * s, 56 * s, col);
  B.box(c.x, y + 112 * s, c.z + 6 * s, 46 * s, 42 * s, 40 * s, shadeOf(col, -0.08));
  B.box(c.x, y + 106 * s, c.z + 24 * s, 30 * s, 22 * s, 14 * s, shadeOf(col, 0.06));
  B.box(c.x + (c.piece.p.flip ? -1 : 1) * 18 * s, y + 52 * s, c.z + 26 * s, 20 * s, 18 * s, 22 * s, shadeOf(col, 0.1));
});
/** 平铺的石坪（演武场）：几乎贴地的一层，人站上去脚不陷 */
registerPiece('sSlab', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p;
  B.box(c.x, y + 1.5, c.z, p.w, 3, p.d, p.color ?? '#c8b890');
  for (const s of [-1, 1]) { B.box(c.x + s * p.w / 2, y + 4, c.z, 24, 8, p.d + 24, STONE_DARK); B.box(c.x, y + 4, c.z + s * p.d / 2, p.w + 24, 8, 24, STONE_DARK); }
});
/** 禁地：一圈高石柱围着一方石坛 */
registerPiece('sForbid', (c) => {
  const B = c.builder, y = footOf(c), r = c.piece.p.r ?? 260;
  B.box(c.x, y + 10, c.z, r * 1.1, 20, r * 1.1, STONE_DARK);
  B.box(c.x, y + 26, c.z, r * 0.7, 12, r * 0.7, c.pal.accent);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; B.box(c.x + Math.cos(a) * r, y + 140, c.z + Math.sin(a) * r, 34, 280, 34, '#5a564e'); B.box(c.x + Math.cos(a) * r, y + 286, c.z + Math.sin(a) * r, 46, 14, 46, c.pal.accent); }
});
/** 井：一圈石井栏、井上一个小辘轳架 */
registerPiece('sWell', (c) => {
  const B = c.builder, y = footOf(c);
  B.box(c.x, y + 14, c.z, 60, 28, 60, STONE); B.box(c.x, y + 27, c.z, 40, 3, 40, '#3c4a4c');
  for (const s of [-1, 1]) B.box(c.x + s * 26, y + 55, c.z, 6, 60, 6, WOOD);
  B.box(c.x, y + 82, c.z, 60, 6, 6, WOOD);
});
/** 晾衣杆：两根竖竿一根横竿，挂几件衣 */
registerPiece('sRack', (c) => {
  const B = c.builder, y = footOf(c), cols = ['#c8b48a', '#8a6a4a', '#d8d0bc', '#6a7a8a'];
  for (const s of [-1, 1]) B.box(c.x + s * 90, y + 45, c.z, 6, 90, 6, WOOD);
  B.box(c.x, y + 88, c.z, 190, 4, 4, WOOD);
  for (let i = 0; i < 4; i++) B.box(c.x - 60 + i * 40, y + 68, c.z, 28, 36, 2, cols[(c.piece.seed + i) % cols.length]);
});
/**
 * 连廊：从 (x, y) 沿 x 走到 (x2, y)，再沿 z 走到 (x2, y3)；一排红柱托一条两坡的廊顶，廊下铺石。p = { x2, y2, y3, w }
 */
registerPiece('sCorridor', (c) => {
  const p = c.piece.p, B = c.builder, w = p.w ?? 110, h = p.h ?? 90, pal = palOf(c);
  const legs: [number, number, number, number][] = [[c.x, c.z, p.x2, p.y2], [p.x2, p.y2, p.x2, p.y3 ?? p.y2]];
  for (const [ax, az, bx, bz] of legs) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 10) continue;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az), mx = (ax + bx) / 2, mz = (az + bz) / 2, y = c.groundAt(mx, mz);
    const lx = alongX ? L + w : w, lz = alongX ? w : L + w;
    B.box(mx, y + 5, mz, lx, 10, lz, STONE_LIGHT);
    const n = Math.max(2, Math.round(L / 90));
    for (let i = 0; i <= n; i++) for (const s of [-1, 1]) {
      const t = i / n, px = ax + (bx - ax) * t + (alongX ? 0 : s * w * 0.42), pz = az + (bz - az) * t + (alongX ? s * w * 0.42 : 0);
      B.box(px, y + 10 + h / 2, pz, 9, h, 9, pal.pillar);
    }
    B.box(mx, y + 10 + h, mz, lx * 1.02, 8, lz * 1.02, pal.trim);
    B.roof(mx, y + 18 + h, mz, lx / 2 + 16, lz / 2 + 16, 36, { gable: 1, color: pal.roof, trim: shadeOf(pal.roof, -0.35), lift: 4, tile: 10 });
  }
});

/** 湖面：顺着湖台的轮廓铺一片水（比台面略高，盖住底图），水里几片荷叶 */
registerPiece('sLake', (c) => {
  const B = c.builder, P = c.piece.p.pts as number[], n = P.length / 2, y = c.groundAt(c.x, c.z) + 12;
  const water = c.piece.p.moon ? '#8ea6bc' : '#7b9ea2';
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; triOut(B, [c.x, y, c.z], [P[j * 2], y, P[j * 2 + 1]], [P[i * 2], y, P[i * 2 + 1]], water, [c.x, y - 1000, c.z]); }
  for (let k = 0; k < 14; k++) {
    const i = Math.floor(hash(c.piece.seed, k) * n), t = 0.55 + hash(c.piece.seed, k + 30) * 0.35;
    const x = c.x + (P[i * 2] - c.x) * t, z = c.z + (P[i * 2 + 1] - c.z) * t;
    B.box(x, y + 1.5, z, 46, 2, 34, '#5f8a52');
  }
});
/** 剑冢的巨剑：一柄斜插在石座上的剑（剑身、剑格、剑柄） */
registerPiece('sSword', (c) => {
  const B = c.builder, y = footOf(c), h = c.piece.p.h ?? 400, lean = (hash(c.piece.seed, 1) - 0.5) * 0.25;
  B.box(c.x, y + 14, c.z, h * 0.28, 28, h * 0.2, STONE_DARK);
  const top = y + h, tx = c.x + lean * h;
  beam(B, c.x, c.z, y + 20, y + 40, tx, c.z, top - h * 0.18 - 20, top - h * 0.18, h * 0.07, '#b8c0c8');
  B.box(tx, top - h * 0.16, c.z, h * 0.24, h * 0.035, h * 0.06, '#8a7a4a');
  B.box(tx, top - h * 0.07, c.z, h * 0.03, h * 0.14, h * 0.03, '#4a3a2a');
});
/** 兽栏：一圈木栅，栏里一间草棚 */
registerPiece('sPen', (c) => {
  const B = c.builder, y = footOf(c), p = c.piece.p, w = p.w ?? 400, d = p.d ?? 300;
  for (const s of [-1, 1]) { B.box(c.x, y + 30, c.z + s * d / 2, w, 8, 8, WOOD); B.box(c.x + s * w / 2, y + 30, c.z, 8, 8, d, WOOD); }
  for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) { B.box(c.x - w / 2 + w * i / 6, y + 24, c.z + s * d / 2, 10, 48, 10, WOOD); B.box(c.x + s * w / 2, y + 24, c.z - d / 2 + d * i / 6, 10, 48, 10, WOOD); }
  B.box(c.x - w * 0.25, y + 28, c.z - d * 0.25, w * 0.3, 56, d * 0.25, '#a08a5a');
  B.roof(c.x - w * 0.25, y + 56, c.z - d * 0.25, w * 0.17, d * 0.15, 30, { gable: 1, color: '#a8905a', trim: '#7a6a42', lift: 3, tile: 9 });
});
/** 魔道的石碑柱：一根黑石柱，顶上一点幽光 */
registerPiece('sObelisk', (c) => {
  const B = c.builder, y = footOf(c), h = c.piece.p.h ?? 300, glow = c.piece.p.glow ?? '#c03030';
  B.box(c.x, y + 12, c.z, 70, 24, 70, '#3a3434');
  const tip = [c.x, y + h, c.z], m = [c.x, y + h * 0.5, c.z];
  const q = [[c.x - 26, y + 24, c.z - 26], [c.x + 26, y + 24, c.z - 26], [c.x + 26, y + 24, c.z + 26], [c.x - 26, y + 24, c.z + 26]];
  for (let i = 0; i < 4; i++) triOut(B, q[i], q[(i + 1) % 4], tip, i % 2 ? '#2a2628' : '#342e30', m);
  B.box(c.x, y + h * 0.72, c.z + 14, 14, 30, 4, glow);
});
/** 圆顶大殿（天穹圣殿）：一圈石柱廊、白墙、金色圆顶 */
registerPiece('sDome', (c) => {
  const B = c.builder, y = footOf(c), r = c.piece.p.r ?? 400, pal = palOf(c);
  B.box(c.x, y + 20, c.z, r * 2.4, 40, r * 2.4, STONE_LIGHT);
  B.yurt(c.x, y + 40, c.z, r, r * 1.6, pal.wall, pal.roof, pal.accent, '#6a4a2a');
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; B.box(c.x + Math.cos(a) * r * 1.12, y + 40 + r * 0.32, c.z + Math.sin(a) * r * 1.12, 24, r * 0.64, 24, STONE_LIGHT); }
});
