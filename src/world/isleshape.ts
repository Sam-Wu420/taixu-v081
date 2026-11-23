// 秘境石台的轮廓。逻辑（哪些格子能落脚）、台面的画法、台底的岩体、小地图都要问同一个函数，所以单放一个不依赖别的文件。
//
// 四种形状：
//   0 八角台（四正面平、四角削去）——寻常秘境的主台和分台
//   1 圆台 ——首领的祭坛
//   2 自然浮岛（边缘起伏的一整块）——妖林这类「天然」的秘境（概念图 B）
//   3 碎岩（几条直边拼成的不规则多边形）——古墓、赤霄禁地这类「剑冢深渊」（概念图 D）
export type IsleShape = 0 | 1 | 2 | 3;

const TAU = Math.PI * 2;
const hash = (s: number, k: number) => { let h = Math.imul((s | 0) ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** 碎岩的顶点（单位圆里的极坐标），按种子定；算一次记住 */
const shards = new Map<number, { a: number; r: number }[]>();
function shardOf(seed: number) {
  let v = shards.get(seed);
  if (!v) {
    const n = 6 + Math.floor(hash(seed, 1) * 3);
    v = Array.from({ length: n }, (_, i) => ({ a: (i + 0.25 + hash(seed, 10 + i) * 0.5) / n * TAU, r: 0.76 + hash(seed, 40 + i) * 0.24 }));
    if (shards.size > 400) shards.clear();
    shards.set(seed, v);
  }
  return v;
}

/** 朝 a 方向（弧度）台沿离中心多远。r 是外接的半径：哪种形状都不会超出 r */
export function isleEdge(round: boolean, r: number, a: number, shape: number = round ? 1 : 0, seed = 0): number {
  if (shape === 2) {
    // 三个不同频率的起伏叠起来，相位按种子错开；最远不超过 r
    const p1 = hash(seed, 3) * TAU, p2 = hash(seed, 5) * TAU, p3 = hash(seed, 7) * TAU;
    return r * (0.86 - 0.065 * Math.sin(2 * a + p1) - 0.04 * Math.sin(3 * a + p2) - 0.03 * Math.sin(5 * a + p3));
  }
  if (shape === 3) {
    const v = shardOf(seed), n = v.length;
    let t = a % TAU; if (t < 0) t += TAU;
    // 找到夹住这个方向的两个顶点，求射线与这条边的交点
    let i = n - 1;
    for (let k = 0; k < n; k++) if (t >= v[k].a && (k === n - 1 || t < v[k + 1].a)) { i = k; break; }
    if (t < v[0].a) i = n - 1;
    const P = v[i], Q = v[(i + 1) % n];
    const px = Math.cos(P.a) * P.r, py = Math.sin(P.a) * P.r, ex = Math.cos(Q.a) * Q.r - px, ey = Math.sin(Q.a) * Q.r - py;
    const ux = Math.cos(t), uy = Math.sin(t), den = ux * ey - uy * ex;
    const d = Math.abs(den) < 1e-6 ? Math.min(P.r, Q.r) : (px * ey - py * ex) / den;
    return r * Math.max(0.5, Math.min(1, d));
  }
  if (round || shape === 1) return r;
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return r / Math.max(c, s, (c + s) / 1.42);
}
