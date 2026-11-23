// 第二十二步：城镇空间 —— 建筑碰撞、门（直达商铺）、街巷导航（行人与 NPC 走街而不穿墙）
// P10：成片街坊的城（L.final，几千个碰撞块、几千个导航点）：碰撞块按格子索引，寻路队列不再 shift，行人在玩家附近的街上走。
import { LOCATIONS, WORLD_SCALE, LocDef } from '../data/world';
import { getLayout, LOC_SCALE, LocLayout } from '../gfx/building';
import type { Door } from '../gfx/townLayout';

interface Near { l: LocDef; L: LocLayout; ox: number; oy: number }
/** 有街巷数据的布局：贴图建筑版（v2）或按最终尺寸排的新布局（final：成片街坊的城、占山的宗门） */
const spatial = (L: LocLayout) => !!(L.v2 || L.final);

/** 碰撞块的格子索引（布局坐标，每格 CELL 见方） */
const CELL = 200;
const blockGrids = new WeakMap<LocLayout, Map<number, number[]>>();
function blockGrid(L: LocLayout) {
  let g = blockGrids.get(L);
  if (!g) {
    g = new Map();
    L.blocks.forEach((b, i) => {
      for (let gx = Math.floor(b.x / CELL); gx <= Math.floor((b.x + b.w) / CELL); gx++) for (let gy = Math.floor(b.y / CELL); gy <= Math.floor((b.y + b.h) / CELL); gy++) {
        const k = (gx + 32768) * 65536 + gy + 32768; let a = g!.get(k); if (!a) g!.set(k, a = []); a.push(i);
      }
    });
    blockGrids.set(L, g);
  }
  return g;
}
/** 导航点的格子索引（找最近的点用） */
const NAV_CELL = 400;
const navGrids = new WeakMap<LocLayout, Map<number, number[]>>();
function navGrid(L: LocLayout) {
  let g = navGrids.get(L);
  if (!g) {
    g = new Map();
    const P = L.nav?.pts ?? [];
    for (let i = 0; i < P.length; i += 2) { const k = (Math.floor(P[i] / NAV_CELL) + 32768) * 65536 + Math.floor(P[i + 1] / NAV_CELL) + 32768; let a = g.get(k); if (!a) g.set(k, a = []); a.push(i / 2); }
    navGrids.set(L, g);
  }
  return g;
}
/** 离 (x, y)（布局坐标）最近的导航点 */
function nearestNav(L: LocLayout, x: number, y: number): number {
  const P = L.nav!.pts;
  if (P.length / 2 < 200) { let bi = -1, bd = 1e18; for (let i = 0; i < P.length; i += 2) { const d = (P[i] - x) ** 2 + (P[i + 1] - y) ** 2; if (d < bd) { bd = d; bi = i / 2; } } return bi; }
  const g = navGrid(L), cx = Math.floor(x / NAV_CELL), cy = Math.floor(y / NAV_CELL);
  for (let r = 0; r < 40; r++) {
    let bi = -1, bd = 1e18;
    for (let u = -r; u <= r; u++) for (let v = -r; v <= r; v++) {
      if (Math.max(Math.abs(u), Math.abs(v)) !== r) continue;
      for (const i of g.get((cx + u + 32768) * 65536 + cy + v + 32768) ?? []) { const d = (P[i * 2] - x) ** 2 + (P[i * 2 + 1] - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    }
    if (bi >= 0) return bi;
  }
  return -1;
}
/** 广度优先：s → e 的点序列（下标）；走不到返回 null */
function bfs(adj: number[][], s: number, e: number): number[] | null {
  const prev = new Int32Array(adj.length).fill(-2); prev[s] = -1;
  const q = new Int32Array(adj.length); let h = 0, t = 0; q[t++] = s;
  while (h < t) { const c = q[h++]; if (c === e) break; for (const nb of adj[c]) if (prev[nb] === -2) { prev[nb] = c; q[t++] = nb; } }
  if (prev[e] === -2) return null;
  const out: number[] = []; for (let c = e; c >= 0; c = prev[c]) out.push(c);
  return out.reverse();
}

export class TownSpace {
  near: Near[] = [];
  private t = 0;
  private cx = 1e12; private cy = 1e12;
  doorFocus: { door: Door; loc: LocDef; x: number; y: number; d: number } | null = null;

  /** 每帧：附近有街巷数据的地点（半秒刷新一次） */
  update(dt: number, px: number, py: number) {
    this.t -= dt;
    if (this.t <= 0 || Math.abs(px - this.cx) > 1500 || Math.abs(py - this.cy) > 1500) {
      this.t = 0.5; this.cx = px; this.cy = py;
      const prev = this.near;
      this.near = [];
      for (const l of LOCATIONS) {
        const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE;
        // 粗筛：城能有两三万见方，放宽到 24000
        const far = l.type === 'city' ? 24000 : 7000;
        if (Math.abs(ox - px) > far || Math.abs(oy - py) > far) continue;
        const L = getLayout(l);
        if (!spatial(L)) continue;
        if (Math.abs(ox - px) > L.gw * LOC_SCALE * 0.6 + 600 || Math.abs(oy - py) > L.gh * LOC_SCALE * 0.6 + 600) continue;
        this.near.push({ l, L, ox, oy });
      }
      // 收官返工：附近的街坊没变就沿用原来那个数组——远处 NPC 的粗模拟按它是不是同一个来判断前几帧算好的挡路结果还能不能用（npc.ts 的 prestep）
      if (prev.length === this.near.length && prev.every((n, i) => n.l === this.near[i].l && n.L === this.near[i].L)) this.near = prev;
    }
    // 门：脚下最近的一扇
    let best: TownSpace['doorFocus'] = null;
    for (const n of this.near) for (const d of n.L.doors ?? []) {
      const x = n.ox + d.x * LOC_SCALE, y = n.oy + d.y * LOC_SCALE;
      const r = d.fn === 'teleport' ? 230 : 120;
      const dd = Math.hypot((x - px) * 0.9, (y - py) * 1.3);
      if (dd < r && (!best || dd < best.d)) best = { door: d, loc: n.l, x, y, d: dd };
    }
    this.doorFocus = best;
  }

  /**
   * 收官 P8（丁）：能走进去的屋（world/indoor.ts）接管自己那一块的碰撞——屋里按墙和陈设挡（走不穿柜台），
   * 不归哪间屋管的点返回 undefined，照原来的碰撞块算。
   */
  override: ((x: number, y: number) => boolean | undefined) | null = null;
  /** 世界点是否被建筑 / 城墙挡住 */
  blocked(x: number, y: number): boolean {
    if (this.override) { const o = this.override(x, y); if (o !== undefined) return o; }
    for (const n of this.near) {
      const lx = (x - n.ox) / LOC_SCALE, ly = (y - n.oy) / LOC_SCALE;
      if (Math.abs(lx) > n.L.gw * 0.6 || Math.abs(ly) > n.L.gh * 0.6) continue;
      if (n.L.blocks.length < 64) { for (const b of n.L.blocks) if (lx > b.x && lx < b.x + b.w && ly > b.y && ly < b.y + b.h) return true; continue; }
      const list = blockGrid(n.L).get((Math.floor(lx / CELL) + 32768) * 65536 + Math.floor(ly / CELL) + 32768);
      if (list) for (const i of list) { const b = n.L.blocks[i]; if (lx > b.x && lx < b.x + b.w && ly > b.y && ly < b.y + b.h) return true; }
    }
    return false;
  }

  /** 新布局城池里的锚点（世界坐标）：tp = 传送阵前、mofu = 邹府门口……；没有返回 null */
  anchor(l: LocDef | undefined | null, key: string): { x: number; y: number } | null {
    if (!l) return null;
    const a = (getLayout(l) as LocLayout & { anchors?: Record<string, { x: number; y: number }> }).anchors?.[key];
    return a ? { x: l.x * WORLD_SCALE + a.x * LOC_SCALE, y: l.y * WORLD_SCALE + a.y * LOC_SCALE } : null;
  }

  /** 这处地点有街巷数据（行人只该沿街走，不该随手撒在城里） */
  isSpatial(l: LocDef) { return spatial(getLayout(l)); }

  /**
   * 读档落脚：(x, y) 落在某个有街巷数据的城镇 / 宗门的地界里时，给出离它最近的街巷导航点（世界坐标）；
   * onlyIfBlocked = true 时只在这一点被建筑 / 城墙挡住时才给（测试用来判断人是不是站在房子里）。不在这类地界里返回 null。
   * 远行落脚、旧统一大地图存档迁移要找落脚点：读档原来的「找陆地」避开一切地点的地界，
   * 人在如今一两万见方的街坊城里会被挪到城外上万步远——落到最近的街上才对。
   */
  streetAt(x: number, y: number, onlyIfBlocked = false): { x: number; y: number } | null {
    for (const l of LOCATIONS) {
      const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE, far = l.type === 'city' ? 24000 : 7000;
      if (Math.abs(ox - x) > far || Math.abs(oy - y) > far) continue;
      const L = getLayout(l);
      if (!spatial(L) || !L.nav || L.nav.pts.length < 2) continue;
      const lx = (x - ox) / LOC_SCALE, ly = (y - oy) / LOC_SCALE;
      if (Math.abs(lx) > L.gw * 0.5 || Math.abs(ly) > L.gh * 0.5) continue;
      if (onlyIfBlocked) { this.update(1, x, y); if (!this.blocked(x, y)) return null; }
      const i = nearestNav(L, lx, ly); if (i < 0) continue;
      return { x: ox + L.nav.pts[i * 2] * LOC_SCALE, y: oy + L.nav.pts[i * 2 + 1] * LOC_SCALE };
    }
    return null;
  }

  /** 某地点的街巷落脚点（世界坐标）；无街巷数据时返回 null */
  spot(l: LocDef, rnd: () => number = Math.random, ok?: (x: number, y: number) => boolean): { x: number; y: number } | null {
    const L = getLayout(l);
    if (!spatial(L) || !L.spots?.length) return null;
    const s = L.spots[Math.floor(rnd() * L.spots.length)];
    // 落脚点周围随手挪一点；挪到了站不住的地方（台沿的陡坡）就站回落脚点本身。随机数照取两个，次序不变
    const bx = l.x * WORLD_SCALE + s.x * LOC_SCALE, by = l.y * WORLD_SCALE + s.y * LOC_SCALE;
    const x = bx + (rnd() - 0.5) * 60, y = by + (rnd() - 0.5) * 40;
    return ok && !ok(x, y) ? { x: bx, y: by } : { x, y };
  }

  /** 沿街巷从 a 走到 b：返回途经点（世界坐标，不含起点）；不在城里则 null */
  route(ax: number, ay: number, bx: number, by: number): [number, number][] | null {
    for (const n of this.near) {
      const nav = n.L.nav; if (!nav || nav.pts.length < 4) continue;
      const toL = (x: number, y: number) => [(x - n.ox) / LOC_SCALE, (y - n.oy) / LOC_SCALE];
      const [alx, aly] = toL(ax, ay), [blx, bly] = toL(bx, by);
      if (Math.abs(alx) > n.L.gw * 0.55 || Math.abs(aly) > n.L.gh * 0.55) continue;
      const s = nearestNav(n.L, alx, aly), e = nearestNav(n.L, blx, bly);
      if (s < 0 || e < 0) return null;
      const ids = bfs(nav.adj, s, e);
      if (!ids) return null;
      const path: [number, number][] = ids.map((c) => [n.ox + nav.pts[c * 2] * LOC_SCALE, n.oy + nav.pts[c * 2 + 1] * LOC_SCALE]);
      path.push([bx, by]);
      return path;
    }
    return null;
  }

  /** 行人：在某地点街巷上随机一条路线。大城（上千个导航点）就在玩家附近的街上走，免得生在城另一头看不见 */
  wander(l: LocDef, from?: { x: number; y: number }): [number, number][] | null {
    const L = getLayout(l);
    const nav = L.nav; if (!spatial(L) || !nav || nav.pts.length < 4) return null;
    const ox = l.x * WORLD_SCALE, oy = l.y * WORLD_SCALE, n = nav.pts.length / 2;
    let s = Math.floor(Math.random() * n);
    const big = n > 300 && this.cx < 1e11;
    if (from) s = nearestNav(L, (from.x - ox) / LOC_SCALE, (from.y - oy) / LOC_SCALE);
    else if (big) {
      // 玩家附近 900~1800 处起步
      const a = Math.random() * Math.PI * 2, r = (900 + Math.random() * 900) / LOC_SCALE;
      s = nearestNav(L, (this.cx - ox) / LOC_SCALE + Math.cos(a) * r, (this.cy - oy) / LOC_SCALE + Math.sin(a) * r);
    }
    if (s < 0) return null;
    let ids: number[] | null = null;
    for (let k = 0; k < 4 && !(ids && ids.length > 1); k++) {
      let e = Math.floor(Math.random() * n);
      if (big) { const a = Math.random() * Math.PI * 2, r = (600 + Math.random() * 1800) / LOC_SCALE; e = nearestNav(L, nav.pts[s * 2] + Math.cos(a) * r, nav.pts[s * 2 + 1] + Math.sin(a) * r); }
      if (e >= 0 && e !== s) ids = bfs(nav.adj, s, e);
    }
    if (!ids || ids.length < 2) return null;
    return ids.map((c) => [ox + nav.pts[c * 2] * LOC_SCALE + (Math.random() - 0.5) * 70, oy + nav.pts[c * 2 + 1] * LOC_SCALE + (Math.random() - 0.5) * 50] as [number, number]);
  }
}
