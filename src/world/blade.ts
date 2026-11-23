// 刃轨迹（兵器接进近战）：一个兵器动作在「出手时段」（ACTION_HIT）里，刃从握点到刃尖扫过的样子。
// 判定（brawl.ts：谁被这一刀砍中）和刀光（gl/bladegl.ts）共用这一份——刀光照着哪里亮，判定就认哪里。
//
// 做法：每种形制 × 每个动作，用标准身形（HANLI_LOOK，身高 1）把出手时段切成 N 份，各取一次 bladeAt，存下握点和刃尖（人物局部坐标）。
// 头一回用到时算一次（N 次姿势解算），之后只是查表；出手那一刻按出招者的位置、朝向、离地高度和身高换到地图坐标。
// 不取任何随机数（bladeAt 也不取：见 gfx/character.ts 的 bladeScratch）。
import { bladeAt, HANLI_LOOK, ACTION_HIT, ACTION_DUR, isWeaponAction, type Action, type Look, type WeaponAction } from '../gfx/character';
import { weaponForm, type WeaponKind, type WeaponForm } from '../data/weapons';

/** 画人物的比例（同 world/render.ts 的 PLAYER_SCALE、combatfx 里敌人的 1.06；这里不引 render.ts，免得循环引用） */
export const PSCALE = 1.12, ESCALE = 1.06;
/** 每个动作出手时段里取几份 */
export const BLADE_N = 7;
const CACHE = new Map<string, Float32Array>();

/** 某形制某动作的刃轨迹（人物局部坐标，身高 1）：BLADE_N 份 × [握点 x y z, 刃尖 x y z, 这一份在动作里的秒数] */
export function bladeLocal(kind: WeaponKind, form: WeaponForm, a: Action): Float32Array | null {
  if (kind === 'fist' || !isWeaponAction(a)) return null;
  const key = form + '|' + a;
  let T = CACHE.get(key);
  if (T) return T;
  const look: Look = { ...HANLI_LOOK, height: 1, weapon: { kind, tier: 2, form } };
  const [h0, h1] = ACTION_HIT[a as WeaponAction], dur = ACTION_DUR[a as WeaponAction];
  T = new Float32Array(BLADE_N * 7);
  for (let i = 0; i < BLADE_N; i++) {
    const t = h0 + (h1 - h0) * i / (BLADE_N - 1), b = bladeAt(look, a, t / dur);
    const o = i * 7;
    if (b) { T[o] = b.grip.x; T[o + 1] = b.grip.y; T[o + 2] = b.grip.z; T[o + 3] = b.tip.x; T[o + 4] = b.tip.y; T[o + 5] = b.tip.z; }
    T[o + 6] = t;
  }
  CACHE.set(key, T);
  return T;
}

/** 出招者的摆放：地图位置、朝向（和 CharState.yaw 同一约定：前方 = (sin yaw, cos yaw)）、离地高度、画人物的比例 × 身高 */
export interface Pose2 { x: number; y: number; yaw: number; lift: number; S: number }
/** 一份刃（地图坐标）：握点 g、刃尖 t（已按 ext 往外放），h 是离地高度 */
export interface Seg { gx: number; gy: number; gh: number; tx: number; ty: number; th: number }

/** 把局部刃轨迹换到地图坐标；ext = 刃往外放几倍（刀光、判定都比兵器本身长）。out 复用 */
export function bladeWorld(T: Float32Array, P: Pose2, ext: number, out: Seg[] = []): Seg[] {
  const cy = Math.cos(P.yaw), sy = Math.sin(P.yaw), S = P.S;
  out.length = 0;
  for (let i = 0; i < BLADE_N; i++) {
    const o = i * 7;
    const gx = T[o], gy = T[o + 1], gz = T[o + 2];
    const tx = gx + (T[o + 3] - gx) * ext, ty = gy + (T[o + 4] - gy) * ext, tz = gz + (T[o + 5] - gz) * ext;
    out.push({
      gx: P.x + (gx * cy + gz * sy) * S, gy: P.y + (-gx * sy + gz * cy) * S, gh: gy * S + P.lift,
      tx: P.x + (tx * cy + tz * sy) * S, ty: P.y + (-tx * sy + tz * cy) * S, th: ty * S + P.lift,
    });
  }
  return out;
}

/** 点 (px, py) 到线段 (ax, ay)–(bx, by) 的距离和最近点的参数 u */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; u: number } {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  const u = L2 > 1e-6 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return { d: Math.hypot(px - (ax + dx * u), py - (ay + dy * u)), u };
}

/**
 * 刃扫没扫到一个人：人看成脚下 (x, y)、半径 r、从 z 到 z + tall 的一根竖柱；每一份刃（握点到刃尖），以及相邻两份之间插的一份，
 * 只要地面上离它不到 r、最近那一点的高度落在柱子上下各让一点的范围里，就算砍中。
 */
export function bladeHits(segs: readonly Seg[], x: number, y: number, z: number, r: number, tall = 100): boolean {
  const n = segs.length;
  for (let i = 0; i < n * 2 - 1; i++) {
    let gx: number, gy: number, gh: number, tx: number, ty: number, th: number;
    if (i % 2 === 0) { const s = segs[i / 2]; gx = s.gx; gy = s.gy; gh = s.gh; tx = s.tx; ty = s.ty; th = s.th; }
    else { const a = segs[(i - 1) / 2], b = segs[(i + 1) / 2]; gx = (a.gx + b.gx) / 2; gy = (a.gy + b.gy) / 2; gh = (a.gh + b.gh) / 2; tx = (a.tx + b.tx) / 2; ty = (a.ty + b.ty) / 2; th = (a.th + b.th) / 2; }
    const q = segDist(x, y, gx, gy, tx, ty);
    if (q.d > r) continue;
    const h = gh + (th - gh) * q.u;
    if (h >= z - 40 && h <= z + tall + 40) return true;
  }
  return false;
}

/** 外观里的兵器 → 形制（没有兵器返回 null） */
export function formOfLook(look: Look | undefined): { kind: WeaponKind; form: WeaponForm } | null {
  const w = look?.weapon; if (!w || w.kind === 'fist') return null;
  return { kind: w.kind, form: weaponForm(w) };
}
