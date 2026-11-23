// v0.54：秘境——可以走进去的独立场景
// - 进秘境不刷新页面：世界暂停一角，主角与同行友人被挪到世界地图之外的一块专属坐标里（REALM_OX 以东），
//   那里有秘境自己的石室、甬道、墙、禁制门、宝箱、首领；战斗、法术、法宝、阵法、化形、元婴出窍照常可用
// - 三级：小秘境（野外的前人洞府、江湖传闻、友人邀约随时生成，三到六间）· 中秘境（八处原著险地，十余间，首领）·
//   大秘境（赤霄禁地、归墟殿、封魔山、陨魔谷谷底：按原著节奏定期开启，多层，别家修士同场争宝）
// - 有真有假：江湖传闻里的秘境，到了可能是空山，也可能是劫修放消息设伏
// - 秘境里不存档：存档记的是入口所在
import type { Game } from './game';
import type { Drawable } from './life';
import type { DNode } from './modal';
import { Enemy } from './combat';
import type { WorldDrop } from './combatDropSafety';
import { ENEMIES, ENEMY_LIST, lvOf, lvRealm, lvWeight, type EnemyDef } from '../data/enemies';
import { THEMES, Theme, MIJING, MJ_BY_ID, MijingDef, MjTier, TIER_NAME, mjOpen, MIJING_ON } from '../data/mijing';
import { roomsFor, type RoomRole } from '../data/mjrooms';
import { ACTIVE_MAP, LOC_BY_ID, WORLD_SCALE, WORLD_W } from '../data/world';
import { REALMS } from '../data/realms';
import { groundTile, loadGroundTex } from '../gl/groundTex';
import { drawBld, loadBld2, bldDim } from '../gfx/bldTex2';
import { v53, meta53, loaded53 } from '../gfx/v053Tex';
import { drawHerbSprite, herbGlowRgb } from '../gfx/herbDraw';
import { planLoot, pickArt, dirName, type Site, type LootPlan } from './sites';
import { foeRealm } from './demog';
import { itemDef } from '../data/items';
import * as C from './cultivation';
import { audio } from './audio';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 秘境坐标原点：世界地图以东 */
export const REALM_OX = WORLD_W + 40000, REALM_OY = 40000;
export const CELL = 48;
const FACE = 72;   // 墙的立面高度
const CH = 768;    // 底图分块（世界像素）
const CHS = 0.75;  // 底图分块的缩放
// 可见区永不淘汰，余下保留最近使用的块；超大视野可暂时超过预算。
export const MIJING_CHUNK_BUDGET = 32;
export function trimMijingChunks(chunks: Map<number, HTMLCanvasElement | null>, visible: Set<number>, budget = MIJING_CHUNK_BUDGET) {
  for (const key of chunks.keys()) {
    if (chunks.size <= budget) break;
    if (!visible.has(key)) chunks.delete(key);
  }
}


function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export type RoomKind = 'entry' | 'hall' | 'treasure' | 'herb' | 'shrine' | 'boss';
export interface MjObj { kind: 'chest' | 'herb' | 'stele' | 'exit' | 'stairs' | 'door' | 'prop' | 'light' | 'deco'; x: number; y: number; key?: string; used?: boolean; tier?: number; cells?: number[]; open?: boolean; room?: number; s?: number; flip?: boolean; hidden?: boolean }
export interface MjRoom { i: number; x0: number; y0: number; x1: number; y1: number; kind: RoomKind; entered: boolean; cleared: boolean; foes: Enemy[]; d: number; rival?: boolean; tpl: string; cx: number; cy: number; spots: Record<string, [number, number][]> }
export interface MjFloor { gw: number; gh: number; cells: Uint8Array; roomOf: Int16Array; rooms: MjRoom[]; objs: MjObj[]; chunks: Map<number, HTMLCanvasElement | null>; bossDead: boolean }
export interface MjSpec { name: string; tier: MjTier; theme: Theme; seed: number; floors: number; rooms: number; lv: number; def?: MijingDef; siteKey?: string; entKey?: string; boss?: string }
export interface MjEnt { key: string; map: string; x: number; y: number; name: string; theme: Theme; seed: number; tier: MjTier; lv: number; until: number; src: 'rumor' | 'invite'; fake?: 'empty' | 'ambush'; npc?: string; seen?: boolean; done?: boolean }
interface MjState { ents: MjEnt[]; next: number; cd: Record<string, number>; seq: number; log: string[] }

export class MijingSys {
  /** 当前所在的秘境（null = 在大地图上） */
  cur: { spec: MjSpec; floors: MjFloor[]; fi: number; back: { x: number; y: number; flying: boolean }; stash: Enemy[]; stashLoot: WorldDrop[]; t: number; got: string[]; kills: number } | null = null;
  focus: MjObj | null = null; focusD = 1e9;
  /** 大地图上：秘境入口的焦点 */
  entFocus: { kind: 'def'; def: MijingDef; x: number; y: number } | { kind: 'ent'; ent: MjEnt } | null = null; entFocusD = 1e9;
  private chestPlans = new WeakMap<MjObj, LootPlan>();
  private herbPlans = new WeakMap<MjObj, { id: string; cnt: number }>();
  private floorPending = new WeakSet<MjFloor>();
  private lastOk = { x: 0, y: 0 };
  private hint = 0;
  constructor(public game: Game) {}
  get S(): MjState { const ws = this.game.ws as any; return (ws.mj ??= { ents: [], next: this.game.day + 15 + Math.random() * 15, cd: {}, seq: 1, log: [] }); }
  get active() { return !!this.cur; }
  get floor(): MjFloor | null { return this.cur ? this.cur.floors[this.cur.fi] : null; }

  // ------------------------------------------------------------ 坐标与碰撞
  cellAt(x: number, y: number) { return { cx: Math.floor((x - REALM_OX) / CELL), cy: Math.floor((y - REALM_OY) / CELL) }; }
  /** 秘境里此处能否落脚（墙、未开的禁制门都不行） */
  walk(x: number, y: number): boolean {
    const F = this.floor; if (!F) return false;
    const { cx, cy } = this.cellAt(x, y);
    if (cx < 0 || cy < 0 || cx >= F.gw || cy >= F.gh) return false;
    return F.cells[cy * F.gw + cx] === 1;
  }
  /** 房间中心（世界坐标） */
  roomC(r: MjRoom) { return { x: REALM_OX + (r.cx + 0.5) * CELL, y: REALM_OY + (r.cy + 0.5) * CELL }; }
  roomAt(x: number, y: number): MjRoom | null {
    const F = this.floor; if (!F) return null;
    const { cx, cy } = this.cellAt(x, y);
    if (cx < 0 || cy < 0 || cx >= F.gw || cy >= F.gh) return null;
    const k = F.roomOf[cy * F.gw + cx];
    return k >= 0 ? F.rooms[k] : null;
  }

  // ------------------------------------------------------------ 生成
  /** 拼图：从模板库里随机挑石室、随机旋转镜像，门对门用甬道接起来（data/mjrooms.ts） */
  private gen(spec: MjSpec, fi: number): MjFloor {
    const R = rng(spec.seed * 31 + fi * 977 + 7);
    const pk = <X>(a: X[]) => a[Math.floor(R() * a.length)];
    const want = Math.max(3, spec.rooms + (fi > 0 ? -1 : 0));
    const GW = 200, GH = 160;
    const cells = new Uint8Array(GW * GH), roomOf = new Int16Array(GW * GH).fill(-1), used = new Uint8Array(GW * GH);
    type Sock = { x: number; y: number; dx: number; dy: number; room: number; depth: number };
    const rooms: MjRoom[] = [];
    const socks: Sock[] = [];
    const conns: { a: number; b: number; cells: number[] }[] = [];
    const isLast = (n: number) => n === want - 1;
    // 先排好要拼哪些用途：入口 → 若干石室 / 宝库 / 药圃 / 碑室 / 过道 → 首领（最后、最远）
    const roleQ: RoomRole[] = [];
    const nT = Math.max(1, Math.round((want - 2) * 0.22)), nH = Math.round((want - 2) * 0.14), nS = Math.round((want - 2) * 0.12);
    for (let k = 0; k < nT; k++) roleQ.push('treasure');
    for (let k = 0; k < nH; k++) roleQ.push('herb');
    for (let k = 0; k < nS; k++) roleQ.push('shrine');
    while (roleQ.length < want - 2) roleQ.push('hall');
    roleQ.sort(() => R() - 0.5);
    const tplFor = (role: RoomRole) => {
      const pool = roomsFor(role, spec.theme); if (!pool.length) return roomsFor(role === 'link' ? 'link' : 'hall', spec.theme)[0];
      const tot = pool.reduce((a, t) => a + (t.w ?? 1), 0); let r = R() * tot;
      for (const t of pool) { r -= t.w ?? 1; if (r <= 0) return t; } return pool[0];
    };
    /** 旋转（0–3 个直角）与镜像 */
    const orient = (rows: string[], rot: number, mir: boolean) => {
      let g = rows.map((r) => r.split(''));
      if (mir) g = g.map((r) => r.reverse());
      for (let k = 0; k < rot; k++) { const h = g.length, w = g[0].length; const ng: string[][] = []; for (let x = 0; x < w; x++) { ng.push([]); for (let y = h - 1; y >= 0; y--) ng[x].push(g[y][x]); } g = ng; }
      return g;
    };
    const fits = (g: string[][], ox: number, oy: number) => {
      const h = g.length, w = g[0].length;
      if (ox < 2 || oy < 3 || ox + w > GW - 2 || oy + h > GH - 2) return false;
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) if (used[(oy + y) * GW + ox + x]) return false;
      return true;
    };
    const place = (role: RoomRole, g: string[][], ox: number, oy: number, depth: number, tpl: string): number => {
      const i = rooms.length, h = g.length, w = g[0].length;
      const spots: Record<string, [number, number][]> = {};
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = g[y][x], gx = ox + x, gy = oy + y, k = gy * GW + gx;
        used[k] = 1;
        if (c === '#' || c === '+') continue;
        cells[k] = c === 'W' ? 3 : 1; roomOf[k] = i;
        if (c !== 'W') { sx += gx; sy += gy; n++; }
        if (c !== '.' && c !== 'W') (spots[c] ??= []).push([gx, gy]);
      }
      // 门：边上的 +，朝外
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (g[y][x] !== '+') continue;
        const dx = x === 0 ? -1 : x === w - 1 ? 1 : 0, dy = y === 0 ? -1 : y === h - 1 ? 1 : 0;
        if (!dx && !dy) continue;
        socks.push({ x: ox + x, y: oy + y, dx, dy, room: i, depth });
      }
      const kind: RoomKind = role === 'link' ? 'hall' : role;
      // 石室「中心」取离重心最近的一块地面（环形、中有石墩水池的石室，几何中心可能是实心的）
      let ccx = n ? sx / n : ox + w / 2, ccy = n ? sy / n : oy + h / 2, best = 1e9, bx = ox + (w >> 1), by = oy + (h >> 1);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = g[y][x]; if (c === '#' || c === '+' || c === 'W') continue; const d = (ox + x - ccx) ** 2 + (oy + y - ccy) ** 2; if (d < best) { best = d; bx = ox + x; by = oy + y; } }
      rooms.push({ i, x0: ox, y0: oy, x1: ox + w - 1, y1: oy + h - 1, kind, entered: false, cleared: false, foes: [], d: depth, tpl, cx: bx, cy: by, spots, ...(role === 'link' ? { link: true } as any : {}) });
      return i;
    };
    /** 打通一个门：门本身与左右各一格（三格宽） */
    const openDoor = (s: { x: number; y: number; dx: number; dy: number }, out: number[]) => {
      for (let k = -1; k <= 1; k++) { const x = s.x + (s.dy ? k : 0), y = s.y + (s.dx ? k : 0), i = y * GW + x; if (!cells[i]) { cells[i] = 1; out.push(i); } used[i] = 1; }
    };
    const carve = (x0: number, y0: number, x1: number, y1: number, out: number[]) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const i = y * GW + x; if (!cells[i]) { cells[i] = 1; out.push(i); } used[i] = 1; }
    };
    // 入口居中
    { const t = tplFor('entry'); const g = orient(t.rows, Math.floor(R() * 4), R() < 0.5); place('entry', g, (GW >> 1) - (g[0].length >> 1), (GH >> 1) - (g.length >> 1), 0, t.id); }
    let attempts = 0, placedMain = 1;
    while (placedMain < want && attempts++ < 900 && socks.length) {
      const last = isLast(placedMain);
      // 首领挑最深的门；平常随机挑一个门（偏向深处，拼出纵深）；时不时塞一段过道
      const order = socks.slice().sort((a, b) => b.depth - a.depth);
      const s = last ? order[Math.floor(R() * Math.min(2, order.length))] : order[Math.floor(Math.pow(R(), 1.6) * order.length)];
      const role: RoomRole = last ? 'boss' : R() < 0.22 ? 'link' : roleQ[placedMain - 1] ?? 'hall';
      const t = tplFor(role);
      let done = false;
      for (let tr = 0; tr < 8 && !done; tr++) {
        const g = orient(t.rows, Math.floor(R() * 4), R() < 0.5), h = g.length, w = g[0].length;
        // 模板里朝反方向的门
        const cand: [number, number][] = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (g[y][x] === '+') { const dx = x === 0 ? -1 : x === w - 1 ? 1 : 0, dy = y === 0 ? -1 : y === h - 1 ? 1 : 0; if (dx === -s.dx && dy === -s.dy) cand.push([x, y]); }
        if (!cand.length) continue;
        const [cx, cy] = pk(cand);
        const len = 2 + Math.floor(R() * 4);
        const tx = s.x + s.dx * (len + 1), ty = s.y + s.dy * (len + 1);
        const ox = tx - cx, oy = ty - cy;
        // 甬道那几格也不能压着别的东西
        let clear = true;
        for (let k = 1; k <= len && clear; k++) for (let q = -2; q <= 2; q++) { const x = s.x + s.dx * k + (s.dy ? q : 0), y = s.y + s.dy * k + (s.dx ? q : 0); if (used[y * GW + x]) clear = false; }
        if (!clear || !fits(g, ox, oy)) continue;
        const ri = place(role, g, ox, oy, s.depth + 1, t.id);
        const cc: number[] = [];
        openDoor(s, cc);
        carve(s.x + s.dx - (s.dy ? 1 : 0), s.y + s.dy - (s.dx ? 1 : 0), tx - s.dx + (s.dy ? 1 : 0), ty - s.dy + (s.dx ? 1 : 0), cc);
        const ts = socks.find((q) => q.room === ri && q.x === tx && q.y === ty)!;
        openDoor(ts, cc);
        socks.splice(socks.indexOf(s), 1); socks.splice(socks.indexOf(ts), 1);
        conns.push({ a: s.room, b: ri, cells: cc });
        if (role !== 'link') placedMain++;
        done = true;
      }
      if (!done && R() < 0.3) socks.splice(socks.indexOf(s), 1);   // 这个门死活拼不上：封死
    }
    // 回环：两扇门正对、中间是空的，就打通（让地图有岔路有回头路）
    for (let a = 0; a < socks.length; a++) for (let b = a + 1; b < socks.length; b++) {
      const A = socks[a], B = socks[b];
      if (A.room === B.room || A.dx !== -B.dx || A.dy !== -B.dy) continue;
      const along = A.dx ? (B.x - A.x) * A.dx : (B.y - A.y) * A.dy, side = A.dx ? B.y - A.y : B.x - A.x;
      if (side !== 0 || along < 3 || along > 12) continue;
      let clear = true;
      for (let k = 1; k < along && clear; k++) for (let q = -1; q <= 1; q++) { const x = A.x + A.dx * k + (A.dy ? q : 0), y = A.y + A.dy * k + (A.dx ? q : 0); if (used[y * GW + x] && !(cells[y * GW + x])) clear = false; }
      if (!clear) continue;
      const cc: number[] = []; openDoor(A, cc); openDoor(B, cc);
      carve(A.x + (A.dy ? -1 : 0), A.y + (A.dx ? -1 : 0), B.x + (B.dy ? 1 : 0), B.y + (B.dx ? 1 : 0), cc);
      conns.push({ a: A.room, b: B.room, cells: cc });
      socks.splice(b, 1); socks.splice(a, 1); a--; break;
    }
    // 裁到用得着的范围
    let minX = GW, minY = GH, maxX = 0, maxY = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (cells[y * GW + x]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const ox0 = minX - 3, oy0 = minY - 4, gw = maxX - minX + 7, gh = maxY - minY + 8;
    const C2 = new Uint8Array(gw * gh), RO = new Int16Array(gw * gh).fill(-1);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const sx = x + ox0, sy = y + oy0; if (sx < 0 || sy < 0 || sx >= GW || sy >= GH) continue; C2[y * gw + x] = cells[sy * GW + sx]; RO[y * gw + x] = roomOf[sy * GW + sx]; }
    const mv = (i: number) => { const x = i % GW - ox0, y = Math.floor(i / GW) - oy0; return y * gw + x; };
    for (const r of rooms) { r.x0 -= ox0; r.x1 -= ox0; r.y0 -= oy0; r.y1 -= oy0; r.cx -= ox0; r.cy -= oy0; for (const k in r.spots) r.spots[k] = r.spots[k].map(([x, y]) => [x - ox0, y - oy0]); }
    for (const c of conns) c.cells = c.cells.map(mv);
    // 深度（按连通关系重算）
    const adj: number[][] = rooms.map(() => []);
    for (const c of conns) { adj[c.a].push(c.b); adj[c.b].push(c.a); }
    const dist = rooms.map(() => 1e9); dist[0] = 0; const q = [0];
    while (q.length) { const a = q.shift()!; for (const b of adj[a]) if (dist[b] > dist[a] + 1) { dist[b] = dist[a] + 1; q.push(b); } }
    rooms.forEach((r, i) => { r.d = dist[i]; });
    if (!rooms.some((r) => r.kind === 'boss')) { let bi = 1; rooms.forEach((r, i) => { if (!(r as any).link && r.d > rooms[bi].d) bi = i; }); if (rooms[bi]) rooms[bi].kind = 'boss'; }
    if (spec.tier >= 2) rooms.filter((r) => r.kind === 'hall' && !(r as any).link).sort(() => R() - 0.5).slice(0, spec.tier === 3 ? 2 : 1).forEach((r) => { r.rival = true; });
    // 摆件、宝箱、灵草、古碑、出口：按模板里预留的位置
    const T = THEMES[spec.theme], objs: MjObj[] = [];
    const W = ([cx, cy]: [number, number]) => ({ x: REALM_OX + (cx + 0.5) * CELL, y: REALM_OY + (cy + 0.75) * CELL });
    for (const r of rooms) {
      const sp = r.spots;
      for (const s of sp.P ?? []) if (R() < 0.85) objs.push({ kind: 'prop', ...W(s), key: pk(T.props), room: r.i, s: 0.75 + R() * 0.3, flip: R() < 0.5 });
      for (const s of sp.L ?? []) objs.push({ kind: 'light', ...W(s), key: pk(T.lights), room: r.i, s: 0.8 });
      for (const s of sp.d ?? []) if (R() < 0.8) objs.push({ kind: 'deco', ...W(s), key: pk(T.deco), room: r.i, s: 0.6 + R() * 0.3, flip: R() < 0.5 });
      if (r.kind === 'entry') for (const s of sp.X ?? []) objs.push({ kind: 'exit', ...W(s), room: r.i, key: 'p_e_tp_ancient' });
      if (r.kind === 'treasure') for (const s of sp.C ?? []) objs.push({ kind: 'chest', ...W(s), room: r.i, tier: spec.tier });
      if (r.kind === 'herb') for (const s of sp.H ?? []) objs.push({ kind: 'herb', ...W(s), room: r.i, tier: spec.tier });
      if (r.kind === 'shrine') for (const s of sp.S ?? []) objs.push({ kind: 'stele', ...W(s), room: r.i, key: pk(['p_stele_a', 'p_stele_b', 'p_e_valley_stele']) });
      if (r.kind === 'boss') {
        const xs = sp.X?.[0] ?? [r.cx, r.cy + 2];
        objs.push({ kind: fi < spec.floors - 1 ? 'stairs' : 'exit', ...W(xs), room: r.i, key: fi < spec.floors - 1 ? 'p_e_tp_broken' : 'p_e_tp_ancient', hidden: true });
        for (const s of sp.C ?? [[r.cx + 2, r.cy] as [number, number]]) objs.push({ kind: 'chest', ...W(s), room: r.i, tier: spec.tier + 1, hidden: true });
      }
      // 普通石室偶尔也有一只宝匣（模板里没留位置就挑一块空地）
      if (r.kind === 'hall' && !(r as any).link && R() < 0.15) objs.push({ kind: 'chest', x: REALM_OX + (r.cx + 0.5) * CELL, y: REALM_OY + (r.cy + 1.5) * CELL, room: r.i, tier: spec.tier });
    }
    // 宝库门前一道禁制（破禁之局）；中秘境以上的首领室有一半也封着
    for (const r of rooms) {
      if (r.kind !== 'treasure' && !(r.kind === 'boss' && spec.tier >= 2 && R() < 0.5)) continue;
      for (const c of conns.filter((e) => e.a === r.i || e.b === r.i)) {
        const door = c.cells.filter((i) => { const x = i % gw, y = Math.floor(i / gw); return x >= r.x0 - 2 && x <= r.x1 + 2 && y >= r.y0 - 2 && y <= r.y1 + 2 && C2[i] === 1 && RO[i] < 0; });
        if (!door.length) continue;
        for (const i of door) C2[i] = 2;
        const mx = door.reduce((s, i) => s + (i % gw), 0) / door.length, my = door.reduce((s, i) => s + Math.floor(i / gw), 0) / door.length;
        objs.push({ kind: 'door', x: REALM_OX + (mx + 0.5) * CELL, y: REALM_OY + (my + 0.5) * CELL, cells: door, open: false, tier: clamp(spec.tier + Math.floor(spec.lv / 3) - 1, 0, 4), room: r.i });
      }
    }
    // 模板装饰点和兜底坐标可能落在墙、水池或被隔开的区域。交互物必须落在
    // 可抵达的地面上；禁制门视作可打开，避免把门后的宝物错误搬到入口。
    const reachable = new Uint8Array(gw * gh), start = rooms[0].cy * gw + rooms[0].cx;
    const queue = [start]; reachable[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi], x = i % gw, y = Math.floor(i / gw);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const ni = ny * gw + nx;
        if (!reachable[ni] && (C2[ni] === 1 || C2[ni] === 2)) { reachable[ni] = 1; queue.push(ni); }
      }
    }
    for (const o of objs) {
      if (o.kind !== 'exit' && o.kind !== 'stairs' && o.kind !== 'chest' && o.kind !== 'herb' && o.kind !== 'stele') continue;
      const x = Math.floor((o.x - REALM_OX) / CELL), y = Math.floor((o.y - REALM_OY) / CELL);
      const index = y * gw + x;
      if (x >= 0 && y >= 0 && x < gw && y < gh && C2[index] === 1 && reachable[index]) continue;
      // 优先同室地面；只有房间自身没有可达地面时才允许其他区域。
      let best = -1, score = Infinity;
      for (const i of queue) {
        if (C2[i] !== 1) continue;
        const dx = i % gw - x, dy = Math.floor(i / gw) - y;
        const d = dx * dx + dy * dy + (RO[i] === o.room ? 0 : gw * gw + gh * gh);
        if (d < score) { score = d; best = i; }
      }
      if (best >= 0) { o.x = REALM_OX + (best % gw + 0.5) * CELL; o.y = REALM_OY + (Math.floor(best / gw) + 0.75) * CELL; }
    }
    return { gw, gh, cells: C2, roomOf: RO, rooms, objs, chunks: new Map(), bossDead: false };
  }

  // ------------------------------------------------------------ 进 / 出
  enter(spec: MjSpec) {
    const g = this.game, p = g.player;
    if (this.cur || !MIJING_ON) return;
    if (g.yuanying?.active) g.yuanying.back('force');
    loadBld2();
    const back = { x: p.x, y: p.y, flying: p.flying };
    const floors: MjFloor[] = [];
    for (let i = 0; i < spec.floors; i++) floors.push(this.gen(spec, i));
    const stash = g.combat.enemies.filter((e) => !e.dead);
    const stashLoot = g.combat.loot;
    g.combat.loot = [];
    g.combat.enemies = []; g.combat.projs = []; g.combat.fields = []; g.combat.strikes = []; g.combat.lock = null;
    this.cur = { spec, floors, fi: 0, back, stash, stashLoot, t: 0, got: [], kills: 0 };
    this.placeAtEntry();
    g.stand(); g.destination = null; g.gathering = null;
    p.flying = false;
    g.toast(`踏入「${spec.name}」（${TIER_NAME[spec.tier]}${spec.floors > 1 ? ` · ${spec.floors} 层` : ''}）——${THEMES[spec.theme].mood}`, 'region');
    audio.sfx('open');
    g.renderer?.resetStill();
    g.updateUI(true);
  }
  private placeAtEntry() {
    const g = this.game, p = g.player, F = this.floor!;
    const c = this.roomC(F.rooms[0]);
    p.x = c.x; p.y = this.walk(c.x, c.y + CELL) ? c.y + CELL : c.y; p.st.x = p.x; p.st.y = p.y; p.st.strands.clear(); p.st.springs.clear();
    g.cam.x = p.x; g.cam.y = p.y;
    this.lastOk = { x: p.x, y: p.y };
    F.rooms[0].entered = true; F.rooms[0].cleared = true;
    for (const a of g.npcs.followers()) { g.npcs.summon(a.d.id); a.st.x = p.x - 60; a.st.y = p.y + 30; }
  }
  /** 出秘境：回到入口 */
  leave(why: 'exit' | 'down' | 'force' = 'exit') {
    const g = this.game, p = g.player, cur = this.cur;
    if (!cur) return;
    const sp = cur.spec;
    const done = cur.floors[cur.floors.length - 1].bossDead;
    this.cur = null;
    // 秘境不能读档续进：仅将受保护的未拾取补发物带到入口，普通战利品仍留在秘境。
    const recovered = g.combat.loot.filter(d => d.blocked && !d.collected && !d.collecting)
      .map(d => ({ ...d, x: cur.back.x, y: cur.back.y, t: 0 }));
    g.combat.loot = [...cur.stashLoot, ...recovered];
    p.x = cur.back.x; p.y = cur.back.y; p.st.x = p.x; p.st.y = p.y; p.flying = cur.back.flying; p.st.strands.clear(); p.st.springs.clear();
    g.cam.x = p.x; g.cam.y = p.y;
    g.combat.enemies = cur.stash.filter((e) => !e.dead); g.combat.projs = []; g.combat.fields = []; g.combat.strikes = []; g.combat.lock = null;
    for (const a of g.npcs.followers()) g.npcs.summon(a.d.id);
    // 记账：小秘境（前人洞府）搜空了就不再有；中 / 大秘境首领一除，要过些日子才复原
    if (done) {
      g.hero.mijingDone = (g.hero.mijingDone ?? 0) + 1;
      g.hero.medStale = 0; // 闯过秘境生死磨砺，闭关郁结尽数涤荡
    } else if (cur.kills > 0 || cur.got.length > 0) {
      g.hero.medStale = Math.max(0, (g.hero.medStale ?? 0) - 0.35);
    }
    if (sp.siteKey && done) { const ws = g.ws as any; ws.sites ??= {}; (ws.sites[ACTIVE_MAP + '|' + sp.siteKey] ??= {}).layer = 3; }
    if (sp.entKey) { const e = this.S.ents.find((x) => x.key === sp.entKey); if (e && done) e.done = true; }
    if (sp.def && done) this.S.cd[sp.def.id] = g.day + (sp.tier === 3 ? 9999 : 60);
    if (why !== 'down') {
      const sum = cur.got.length ? `所得：${cur.got.slice(0, 12).join('、')}${cur.got.length > 12 ? ' 等' : ''}` : '一无所获。';
      g.toast(`出了「${sp.name}」。${done ? '首领已除，' : ''}斩敌 ${cur.kills}。${sum}`, done ? 'good' : 'info');
      if (done) g.news(`苏寒${sp.tier >= 2 ? '闯过' : '探罢'}「${sp.name}」，${sp.tier === 3 ? '满载而归' : '有所收获'}。`, 'personal');
    }
    audio.sfx('whoosh');
    g.renderer?.resetStill();
    g.updateUI(true);
  }

  // ------------------------------------------------------------ 敌人
  private pickFoe(lv: number, theme: Theme, R: () => number): { def: EnemyDef; realm: number; stage: number } | null {
    const T = THEMES[theme];
    const ok = (e: EnemyDef) => e.kind !== 'human' && !e.lair && !!e.lv && e.behave !== 'flee' && e.behave !== 'shy';
    let c = ENEMY_LIST.filter((e) => ok(e) && T.foes.test(e.name) && lvWeight(e, lv, true) > 0);
    if (!c.length) c = ENEMY_LIST.filter((e) => ok(e) && T.foes.test(e.name) && Math.abs((e.lv![0] + e.lv![1]) / 2 - lv) <= 2);
    if (!c.length) c = ENEMY_LIST.filter((e) => ok(e) && lvWeight(e, lv, true) > 0 && (theme === 'sea' ? e.zone === 'sea' : e.zone !== 'sea'));
    if (!c.length) return null;
    const def = c[Math.floor(R() * c.length)];
    const l = clamp(lv, def.lv![0], def.lv![1]);
    const rs = lvRealm(l, 8);
    return { def, ...rs };
  }
  private spawnRoom(r: MjRoom) {
    const g = this.game, cur = this.cur!, sp = cur.spec, F = this.floor!;
    const R = rng(sp.seed * 7 + r.i * 131 + cur.fi * 17);
    const c = this.roomC(r);
    const lv = clamp(sp.lv + (r.kind === 'boss' ? 1 : 0) + Math.floor(cur.fi / 2), 1, 10);
    // 模板里预留的妖物出没点（E）/ 首领站位（B），用完了再在石室中心附近找空地
    const pts = (r.spots.E ?? []).slice().sort(() => R() - 0.5);
    const put = (e: Enemy, k: number, n: number) => {
      const sp = e.boss && r.spots.B?.length ? r.spots.B[0] : pts.shift();
      let x: number, y: number;
      if (sp) { x = REALM_OX + (sp[0] + 0.5) * CELL; y = REALM_OY + (sp[1] + 0.6) * CELL; }
      else { const an = (k / Math.max(1, n)) * TAU + R(), rr = CELL * (1.5 + R() * 2); x = c.x + Math.cos(an) * rr; y = c.y + Math.sin(an) * rr * 0.6; }
      if (!this.walk(x, y)) { x = c.x; y = c.y; }
      e.x = x; e.y = y; e.hx = c.x; e.hy = c.y; e.aggro = true;
      g.combat.enemies.push(e); r.foes.push(e);
    };
    if (r.kind === 'boss') {
      const id = cur.fi === sp.floors - 1 ? sp.boss : undefined;
      const bd = id && ENEMIES[id] ? { def: ENEMIES[id], ...lvRealm(clamp(lv + 1, ENEMIES[id].lv?.[0] ?? 1, ENEMIES[id].lv?.[1] ?? 10), 10) } : this.pickFoe(lv + 1, sp.theme, R);
      if (bd) {
        const e = new Enemy(bd.def, c.x, c.y, bd.realm, bd.stage);
        e.boss = true; e.maxHp = e.hp = Math.round(e.maxHp * [1, 3, 4.5, 6][sp.tier]); e.name = (cur.fi === sp.floors - 1 ? '' : '守关·') + bd.def.name;
        put(e, 0, 1);
      }
      const nAdd = sp.tier + Math.floor(R() * 2);
      for (let k = 0; k < nAdd; k++) { const f = this.pickFoe(lv - 1, sp.theme, R); if (f) put(new Enemy(f.def, 0, 0, f.realm, f.stage), k + 1, nAdd + 1); }
      return;
    }
    if (r.rival) {
      // 别家修士：也来争宝。一半见人就动手，一半各行其是（你先动手他们才翻脸）
      const team = 'mj:rival' + r.i, hostile = R() < 0.5, n = 2 + Math.floor(R() * 2);
      for (let k = 0; k < n; k++) {
        const rk = foeRealm(g, c.x, c.y, 'rogue');
        const rr = clamp(g.hero.realm - (R() < 0.45 ? 1 : 0), 1, 5);
        const e = new Enemy(ENEMIES[rr >= 3 ? 'jindan_mo' : rr >= 2 ? 'zhujixiu' : 'bandit'], 0, 0, rr, rk.stage);
        e.name = pickName(R) + (hostile ? '（夺宝）' : '（探宝）'); e.team = team;
        put(e, k, n); e.aggro = hostile;
      }
      g.toast(hostile ? '石室里有另一伙修士——见了你，二话不说便祭出了法器！' : '石室里有另一伙修士在搜检，见你进来，冷冷看了一眼。（你不动手，他们也不动）', hostile ? 'warn' : 'info');
    }
    if (r.kind === 'entry' || r.kind === 'shrine' || (r as any).link) return;
    const n = (r.kind === 'treasure' ? 2 : r.kind === 'herb' ? 2 : 3) + Math.floor(R() * (1 + sp.tier)) + (sp.tier === 3 ? 1 : 0);
    for (let k = 0; k < n; k++) { const f = this.pickFoe(lv, sp.theme, R); if (f) put(new Enemy(f.def, 0, 0, f.realm, f.stage), k, n); }
    void F;
  }

  // ------------------------------------------------------------ 每帧（秘境里）
  update(dt: number) {
    const g = this.game, cur = this.cur, p = g.player;
    if (!cur) { this.worldTick(dt); return; }
    cur.t += dt;
    const F = this.floor!;
    // 主角、敌人、同行者都关在墙里
    if (this.walk(p.x, p.y)) this.lastOk = { x: p.x, y: p.y };
    else { p.x = this.lastOk.x; p.y = this.lastOk.y; p.st.x = p.x; p.st.y = p.y; }
    for (const e of g.combat.enemies) {
      const E = e as any;
      if (this.walk(e.x, e.y)) { E.mjx = e.x; E.mjy = e.y; }
      else if (E.mjx !== undefined) { e.x = E.mjx; e.y = E.mjy; e.kx = 0; e.ky = 0; }
    }
    for (const a of g.npcs.followers()) if (!this.walk(a.st.x, a.st.y) && Math.hypot(a.st.x - p.x, a.st.y - p.y) > 260) { a.st.x = p.x - 40; a.st.y = p.y + 20; a.d.x = a.st.x; a.d.y = a.st.y; }
    // 走进新的石室：妖物现身
    const r = this.roomAt(p.x, p.y);
    if (r && !r.entered) {
      r.entered = true;
      this.spawnRoom(r);
      if (r.kind === 'boss') { g.toast(cur.fi === cur.spec.floors - 1 ? `「${cur.spec.name}」最深处——守护此地的妖物醒了！` : '守关的妖物挡住了去路！', 'warn'); g.cinema(p.x, p.y - 80, 1.1, 1); audio.sfx('bell'); }
    }
    for (const rr of F.rooms) {
      if (!rr.entered || rr.cleared) continue;
      const alive = rr.foes.filter((e) => !e.dead && g.combat.enemies.includes(e) && (e.aggro || !e.team?.startsWith('mj:rival')));
      if (alive.length === 0) {
        rr.cleared = true;
        cur.kills += rr.foes.filter((e) => e.dead).length;
        if (rr.kind === 'boss') {
          F.bossDead = true;
          for (const o of F.objs) if (o.room === rr.i) o.hidden = false;
          g.toast(cur.fi < cur.spec.floors - 1 ? '守关妖物伏诛，通往下一层的古阵亮了起来。' : '首领伏诛！石室深处的宝匣与出口的古阵同时亮起。', 'good');
          g.combat.impact(this.roomC(rr).x, this.roomC(rr).y, 3, '255,230,160');
        }
      }
    }
    // 焦点
    this.focus = null; this.focusD = 1e9;
    for (const o of F.objs) {
      if (o.hidden || o.kind === 'prop' || o.kind === 'light' || o.kind === 'deco' || (o.used && o.kind !== 'exit' && o.kind !== 'stairs') || (o.kind === 'door' && o.open)) continue;
      const d = Math.hypot(o.x - p.x, (o.y - p.y) * 1.3);
      if (d < (o.kind === 'door' ? 150 : 110) && d < this.focusD) { this.focus = o; this.focusD = d; }
    }
    this.hint -= dt;
    if (this.hint <= 0 && cur.t > 2 && cur.t < 3) { this.hint = 99; g.hint('mijing', '提示：秘境里走进新的石室才会惊动其中的妖物；宝箱、灵草、古碑、禁制门走近按 T。首领伏诛后出口亮起，入口的古阵随时可退出。'); }
  }
  /** T：宝箱 / 灵草 / 古碑 / 禁制门 / 出口 / 阶梯 */
  interact(): boolean {
    const o = this.focus, g = this.game, h = g.hero, cur = this.cur;
    if (!o || !cur || !this.canInteract(o, cur)) return false;
    const sp = cur.spec;
    const tierLoot = clamp(Math.max(1, sp.lv / 2.5) + (sp.tier - 1) * 0.6, 1, 5);
    switch (o.kind) {
      case 'chest': {
        let plan = this.chestPlans.get(o);
        if (!plan) {
          plan = planLoot(g, Math.round(tierLoot), 1 + (o.tier ?? 1) * 0.3, { scroll: 0.3 + sp.tier * 0.1, art: 0.08 + sp.tier * 0.08, map: 0.06 });
          if (Math.random() < 0.25 + sp.tier * 0.1) { const zt = g.zhenfa?.ruinScroll?.(); if (zt) plan.items.push({id:zt,n:1,label:itemDef(zt).name}); }
          if ((o.tier ?? 1) >= 3 && Math.random() < 0.5) { const a = pickArt(Math.round(tierLoot) + 1, sp.tier === 3 && Math.random() < 0.3); if (a) plan.items.push({id:a,n:1,label:`【${itemDef(a).name}】`}); }
          this.chestPlans.set(o, plan);
        }
        // 在物品监听器通知之前标记宝匣，避免监听器重入导致重复领取。
        if (!C.exchangeItemsWithCommit(h, [], plan.items, () => { o.used = true; })) {
          g.toast('背包无法收纳宝匣中的物品，请整理后再开启。', 'warn'); return true;
        }
        this.chestPlans.delete(o);
        const got = plan.items.map(item => item.label);
        // 秘境坐标不在世界地图上，残图生成须以秘境入口为中心。
        if (plan.mapTier !== null) try { if (g.sites.makeCache(plan.mapTier, cur.back.x, cur.back.y)) got.push('一角残破的藏宝图'); } catch (e) { console.warn('[mijing] cache generation failed', e); }
        cur.got.push(...got);
        g.combat.impact(o.x, o.y, 1, '255,230,160'); audio.sfx('chime');
        g.toast(`开启宝匣：${got.join('、')}`, 'good');
        return true;
      }
      case 'herb': {
        let plan = this.herbPlans.get(o);
        if (!plan) {
          const pool = ['herb_lingzhi', 'herb_jinxin', 'herb_xuelian', 'herb_zihou', 'herb_tianling', 'herb_huolong', 'herb_bingpo', 'herb_xuejing', 'herb_yangshen'].filter((id) => itemDef(id).tier <= tierLoot + 1);
          const id = pool[Math.floor(Math.random() * pool.length)] ?? 'herb_lingzhi';
          const age = Math.round((60 + Math.random() * 140) * (1 + sp.tier * 0.8));
          plan = { id, cnt: Math.max(2, Math.min(8, Math.round(age / 60))) };
          this.herbPlans.set(o, plan);
        }
        const { id, cnt } = plan;
        if (!C.exchangeItemsWithCommit(h, [], [{id, n:cnt}], () => { o.used = true; })) { g.toast('背包无法收纳灵草，请整理后再采。', 'warn'); return true; }
        this.herbPlans.delete(o); cur.got.push(`${itemDef(id).name}×${cnt}`);
        g.toast(`采得${itemDef(id).name} ×${cnt}。秘境灵气浓郁，灵草长得远比外头茂盛。`, 'good'); audio.sfx('gather');
        return true;
      }
      case 'stele': {
        o.used = true;
        const exp = C.need(h) * (0.004 + sp.tier * 0.003);
        const got = g.gainInsightExp(exp);
        g.zhenfa?.gainXp?.(3);
        g.openDialog({ speaker: '古碑', title: sp.name, mood: 'mystic', text: `碑上的字迹大半剥落，只剩几行还能辨认——\n\n${STELE[Math.floor(Math.random() * STELE.length)]}\n\n你对着残碑参悟良久，若有所得。（修为 +${Math.round(got)}，阵道 +3）`, options: [{ label: '收回心神', act: () => null }] });
        return true;
      }
      case 'door': {
        const name = `${sp.name} · 禁制`;
        g.openDialog({ speaker: '禁制', title: '石门上灵光流转', mood: 'mystic', text: '一道光幕封住了甬道，光幕里五色阵眼明灭不定。后面隐约有宝光。', options: [
          { label: '推演破禁（破禁之局）', tone: 'gold', act: () => { if (!this.canInteract(o, cur)) return null; g.zhenfa.openPuzzle(name, o.tier ?? 1, (ok) => { if (!this.canInteract(o, cur)) return; if (ok) this.openDoor(o); else g.toast('禁制合拢——可再试一次。', 'info'); }); return null; } },
          { label: `以破禁符强破（剩 ${C.bagCount(h, 'tal_pojin')}）`, disabled: C.bagCount(h, 'tal_pojin') <= 0, act: () => { if (!this.canInteract(o, cur)) return null; if (C.removeItem(h, 'tal_pojin', 1) !== 1) { g.toast('破禁符不足，无法强破禁制。', 'warn'); return null; } if (Math.random() < 0.8) this.openDoor(o); else { h.hp = Math.max(0.05, h.hp - 0.15); g.toast('破禁符化作飞灰，禁制反震——没破开。', 'warn'); } return null; } },
          { label: '离开', act: () => null },
        ] });
        return true;
      }
      case 'stairs': {
        if (cur.fi >= cur.floors.length - 1) return false;
        // 楼梯只能向下；丢弃旧层画布但保留地图、事件等游戏状态。
        cur.floors[cur.fi].chunks.clear();
        cur.fi++;
        g.combat.enemies = g.combat.enemies.filter((e) => e.dead); g.combat.projs = []; g.combat.fields = [];
        this.placeAtEntry();
        g.toast(`踏上古阵——「${sp.name}」第 ${cur.fi + 1} 层。`, 'region'); audio.sfx('whoosh');
        g.renderer?.resetStill();
        return true;
      }
      case 'exit': {
        const F = this.floor!, boss = F.rooms.find((r) => r.kind === 'boss');
        g.openDialog({ speaker: sp.name, title: o.room === 0 ? '入口古阵' : '出口古阵', text: o.room === 0 && boss && !F.bossDead ? '古阵还能把你送回入口外头。此时退出，没搜检的石室就白白留给别人了。' : '古阵灵光大盛，随时可以离开。', options: [
          { label: '离开秘境', tone: 'gold', act: () => { if (this.canInteract(o, cur)) this.leave('exit'); return null; } },
          { label: '再看看', act: () => null },
        ] });
        return true;
      }
    }
    return false;
  }
  /** 焦点和对话选项可能跨帧失效；绝不能对其他楼层的对象执行操作。 */
  private canInteract(o: MjObj, cur: NonNullable<MijingSys['cur']>): boolean {
    const f = this.floor, p = this.game.player;
    return this.cur === cur && !!f && f.objs.includes(o) && !this.game.hero.dead && !o.hidden &&
      !(o.used && o.kind !== 'exit' && o.kind !== 'stairs') && !(o.kind === 'door' && o.open) &&
      Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(o.x - p.x, (o.y - p.y) * 1.3) < (o.kind === 'door' ? 150 : 110);
  }
  private openDoor(o: MjObj) {
    const F = this.floor!; o.open = true;
    for (const i of o.cells ?? []) F.cells[i] = 1;
    F.chunks.clear();
    this.game.toast('禁制光幕溃散，甬道通了。', 'good');
    this.game.combat.impact(o.x, o.y, 2, '160,220,255');
    audio.sfx('break');
  }

  // ------------------------------------------------------------ 大地图上：入口、传闻、真假
  private worldTick(dt: number) {
    const g = this.game, p = g.player, S = this.S;
    void dt;
    this.entFocus = null; this.entFocusD = 1e9;
    if (!MIJING_ON) return;
    for (const m of MIJING) {
      const l = m.loc ? LOC_BY_ID.get(m.loc) : null; if (!l || (l.map ?? 'renjie') !== ACTIVE_MAP) continue;
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE + 260;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < 260 && d < this.entFocusD) { this.entFocus = { kind: 'def', def: m, x, y }; this.entFocusD = d; }
    }
    for (const e of S.ents) {
      if (e.done || e.map !== ACTIVE_MAP) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (e.fake && d < 380) { this.fakeOut(e); continue; }
      if (!e.fake && d < 220 && d < this.entFocusD) { this.entFocus = { kind: 'ent', ent: e }; this.entFocusD = d; }
    }
  }
  /** 传闻是假的：空山，或者劫修设伏 */
  private fakeOut(e: MjEnt) {
    const g = this.game;
    e.done = true;
    if (e.fake === 'empty') { g.toast(`「${e.name}」一带空山寂寂，翻遍了也只有几块乱石——这消息是假的。`, 'info'); return; }
    const n = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU, x = e.x + Math.cos(an) * 260, y = e.y + Math.sin(an) * 160;
      const rk = foeRealm(g, x, y, 'rogue');
      const en = new Enemy(ENEMIES[rk.realm >= 2 ? 'zhujixiu' : 'bandit'], x, y, rk.realm, rk.stage);
      en.name = '放消息的劫修'; en.team = 'mj:ambush'; en.aggro = true; en.hx = e.x; en.hy = e.y;
      g.combat.enemies.push(en);
    }
    g.toast(`「${e.name}」哪有什么秘境——四面山石后跳出几个劫修：「又一个听信传闻的！」`, 'warn');
    g.renxin?.recordExp2?.('ruin_betray', 'loss', '秘境传闻是饵', `江湖上传「${e.name}」有秘境现世，赶去却是劫修设的局。传闻十有三四是假的，越是说得有鼻子有眼越要当心。`);
  }
  /** 江湖传闻：某处有秘境现世（有真有假） */
  daily(days: number) {
    const g = this.game, S = this.S;
    void days;
    S.ents = S.ents.filter((e) => !e.done && g.day < e.until);
    if (!MIJING_ON || g.day < S.next || this.cur) return;
    S.next = g.day + 16 + Math.random() * 18;
    const e = this.rumor();
    if (e) { g.news(`江湖传闻：${dirName(e.x - g.player.x, e.y - g.player.y)}边「${e.name}」一带有秘境现世。`, 'rumor'); g.toast(`江湖传闻：${dirName(e.x - g.player.x, e.y - g.player.y)}边「${e.name}」一带有秘境现世——地图上标了「秘？」。（传闻有真有假）`, 'info'); }
  }
  rumor(fakeP = 0.35): MjEnt | null {
    const g = this.game, p = g.player, T = g.terrain;
    for (let tries = 0; tries < 50; tries++) {
      const an = Math.random() * TAU, r = 3500 + Math.random() * 10000;
      const x = p.x + Math.cos(an) * r, y = p.y + Math.sin(an) * r;
      if (T.walkFactor(x, y) <= 0 || T.inLocZone(x, y, 600)) continue;
      const zone = g.combat.dangerCalc(x, y).zone;
      const theme: Theme = zone === 'cold' ? 'ice' : zone === 'arid' ? 'desert' : zone === 'demon' ? 'tomb' : zone === 'forest' ? 'forest' : Math.random() < 0.25 ? 'tomb' : 'cave';
      const roll = Math.random();
      const fake = roll < fakeP * 0.45 ? 'empty' : roll < fakeP ? 'ambush' : undefined;
      const lv = clamp(lvOf(g.hero.realm, g.hero.stage) + Math.floor(Math.random() * 2) - 1, 1, 9);
      const e: MjEnt = { key: 'mj' + (this.S.seq++), map: ACTIVE_MAP, x, y, name: NAMES[Math.floor(Math.random() * NAMES.length)], theme, seed: (Math.random() * 1e9) | 0, tier: 1, lv, until: g.day + 40, src: 'rumor', fake };
      this.S.ents.push(e);
      return e;
    }
    return null;
  }
  /** 友人相约：在会合处现出一座小秘境，一同进去 */
  inviteEntrance(x: number, y: number, npc: string, name: string): MjEnt {
    const g = this.game;
    const zone = g.combat.dangerCalc(x, y).zone;
    const theme: Theme = zone === 'cold' ? 'ice' : zone === 'arid' ? 'desert' : zone === 'demon' ? 'tomb' : 'cave';
    const e: MjEnt = { key: 'mj' + (this.S.seq++), map: ACTIVE_MAP, x: x + 120, y: y - 40, name, theme, seed: (Math.random() * 1e9) | 0, tier: 1, lv: clamp(lvOf(g.hero.realm, g.hero.stage), 1, 9), until: g.day + 20, src: 'invite', npc };
    this.S.ents.push(e);
    return e;
  }
  /** 前人洞府（sites 的 ruin）：走进去 */
  enterSite(s: Site, name: string) {
    const g = this.game;
    const lv = clamp(s.tier * 2 - 1 + (Math.random() < 0.3 ? 1 : 0), 1, 9);
    this.enter({ name, tier: 1, theme: s.zone === 'cold' ? 'ice' : s.zone === 'demon' ? 'tomb' : 'cave', seed: s.seed, floors: 1, rooms: 3 + Math.min(3, s.tier + 1), lv, siteKey: s.key });
    void g;
  }
  /** 大地图入口对话 */
  entNode(): DNode | null {
    const g = this.game, h = g.hero, f = this.entFocus;
    if (!f) return null;
    if (f.kind === 'ent') {
      const e = f.ent;
      const npc = e.npc ? g.npcs.byId.get(e.npc) : null;
      return { speaker: e.name, title: `${TIER_NAME[e.tier]} · ${THEMES[e.theme].name}`, mood: 'mystic', text: `${THEMES[e.theme].mood}${npc ? `\n\n${npc.name}在旁催道：「就是这里，走！」` : ''}`, options: [
        { label: '进入秘境', tone: 'gold', act: () => { this.enter({ name: e.name, tier: e.tier, theme: e.theme, seed: e.seed, floors: 1, rooms: 4 + Math.floor(Math.random() * 3), lv: e.lv, entKey: e.key }); return null; } },
        { label: '暂且不去', act: () => null },
      ] };
    }
    const m = f.def, op = mjOpen(m, g.day), cd = this.S.cd[m.id] ?? -1;
    const lvOk = h.realm >= m.realmMin && h.realm <= m.realmMax;
    const why = !op.open ? `禁制未开（约 ${Math.ceil(op.days / 360 * 10) / 10} 年后开启）` : !lvOk ? (h.realm > m.realmMax ? `${REALMS[m.realmMax].name}以上的修士进不去（禁制所限）` : `需${REALMS[m.realmMin].name}期`) : g.day < cd ? `首领新除，秘境尚未复原（约 ${Math.ceil(cd - g.day)} 日）` : '';
    const party = g.npcs.followers().length;
    return { speaker: m.name, title: `${TIER_NAME[m.tier]}${m.period ? (op.open ? ` · 开启中（还剩 ${op.days} 日）` : ' · 未开') : ''}`, mood: 'mystic', text: `${m.desc}\n\n${THEMES[m.theme].mood}${party ? `\n\n同行 ${party} 人随你一同进去。` : '\n\n孤身入内凶险，可先去友人录邀人同行。'}`, options: [
      { label: `进入「${m.name}」`, tone: 'gold', disabled: !!why, hint: why, act: () => { this.enter({ name: m.name, tier: m.tier, theme: m.theme, seed: ((g.day / 30) | 0) * 131 + m.id.length * 7919, floors: m.floors, rooms: m.rooms, lv: clamp(Math.max(lvOf(h.realm, h.stage), lvOf(m.realmMin, 0)), 1, 10), def: m, boss: m.boss }); return null; } },
      { label: '离开', act: () => null },
    ] };
  }
  interactWorld(): boolean { const n = this.entNode(); if (!n) return false; this.game.openDialog(n); return true; }
  marks(): { x: number; y: number; glyph: string; color: string; name: string }[] {
    const g = this.game, out: { x: number; y: number; glyph: string; color: string; name: string }[] = [];
    if (!MIJING_ON) return out;
    for (const e of this.S.ents) if (!e.done && e.map === ACTIVE_MAP) out.push({ x: e.x, y: e.y, glyph: e.src === 'rumor' ? '秘？' : '秘', color: '#c8a0ff', name: e.src === 'rumor' ? `传闻·${e.name}（真假未知）` : `${e.name}（友人相约）` });
    for (const m of MIJING) { const l = m.loc ? LOC_BY_ID.get(m.loc) : null; if (!l || (l.map ?? 'renjie') !== ACTIVE_MAP) continue; const op = mjOpen(m, g.day); out.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE + 260, glyph: m.tier === 3 ? '境' : '秘', color: m.tier === 3 ? (op.open ? '#ffd070' : '#a89070') : '#b8a0e0', name: `${TIER_NAME[m.tier]}·${m.name}${m.period ? (op.open ? '（开启中）' : '（未开）') : ''}` }); }
    return out;
  }

  // ------------------------------------------------------------ 绘制（大地图：入口）
  collectWorld(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, t: number) {
    const g = this.game;
    if (!MIJING_ON) return;
    const one = (x: number, y: number, key: string, glow: string, label: string, focused: boolean, open = true, ly = 160) => {
      if (x < view.left - 300 || x > view.right + 300 || y < view.top - 300 || y > view.bottom + 300) return;
      out.push({ y, k: 'D·秘境入口', draw: (c) => {
        c.save();
        c.globalCompositeOperation = 'lighter';
        const a = (open ? 0.5 : 0.18) + 0.2 * Math.sin(t * 2.5);
        const gr = c.createRadialGradient(x, y - 40, 4, x, y - 40, 150);
        gr.addColorStop(0, `rgba(${glow},${a})`); gr.addColorStop(1, `rgba(${glow},0)`);
        c.fillStyle = gr; c.beginPath(); c.ellipse(x, y - 40, 150, 110, 0, 0, TAU); c.fill();
        c.restore();
        if (!(key.startsWith('v:') && drawV(c, key.slice(2), x, y, 1)) && !drawBld(c, key.startsWith('v:') ? (key.includes('big') ? 'p_e_tp_ancient' : key.includes('mid') ? 'p_arch_ruin' : 'p_e_vortex') : key, x, y, t, 0.9)) { c.fillStyle = 'rgba(60,50,70,0.7)'; c.beginPath(); c.ellipse(x, y, 70, 26, 0, 0, TAU); c.fill(); }
        const vx = v53('zf_activate');
        if (vx && open) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25; c.translate(x, y); c.scale(1, 0.45); c.rotate(t * 0.3); c.drawImage(vx, -110, -110, 220, 220); c.restore(); }
        if (focused) { c.save(); c.font = 'bold 15px "Noto Serif SC", serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(20,16,10,0.6)'; c.fillText(label, x + 1, y - ly + 1); c.fillStyle = '#f2e0ff'; c.fillText(label, x, y - ly); c.restore(); }
      } });
    };
    for (const m of MIJING) {
      const l = m.loc ? LOC_BY_ID.get(m.loc) : null; if (!l || (l.map ?? 'renjie') !== ACTIVE_MAP) continue;
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE + 260, op = mjOpen(m, g.day).open;
      const f = this.entFocus?.kind === 'def' && this.entFocus.def === m;
      one(x, y, m.tier === 3 ? 'v:entrance_big' : 'v:entrance_mid', m.tier === 3 ? '255,210,120' : '190,160,255', `${m.name}（T）`, f, op, m.tier === 3 ? 420 : 340);
    }
    for (const e of this.S.ents) {
      if (e.done || e.map !== ACTIVE_MAP) continue;
      const near = Math.hypot(e.x - g.player.x, e.y - g.player.y) < g.senseRadius;
      if (!near) continue;
      if (e.fake) continue;   // 假的：到了才知道
      one(e.x, e.y, 'v:entrance_small', '190,160,255', `${e.name}（T）`, this.entFocus?.kind === 'ent' && this.entFocus.ent === e, true, 300);
    }
  }

  // ------------------------------------------------------------ 绘制（秘境里）
  /** v0.54 画材平铺图样（tile = 一块砖在世界里的边长） */
  private pat(c: G, id: string, tile: number): CanvasPattern | null {
    const im = v53(id); if (!im) return null;
    const P = c.createPattern(im, 'repeat'); if (!P) return null;
    try { P.setTransform(new DOMMatrix().scale(tile / (im.width || 1))); } catch { /* */ }
    return P;
  }
  private floorPattern(c: G): CanvasPattern | string {
    const T = THEMES[this.cur!.spec.theme];
    const art = this.pat(c, 'floor_' + this.cur!.spec.theme, 480); if (art) return art;
    const im = groundTile(T.floor); if (!im) { const F = this.floor; if (F) this.floorPending.add(F); loadGroundTex(); return T.face; }
    const P = c.createPattern(im, 'repeat'); if (!P) return T.face;
    try { P.setTransform(new DOMMatrix().scale(480 / im.width)); } catch { /* */ }
    return P;
  }
  /** 预烘焙一块底图：地面 + 岩体顶面 + 墙的立面 */
  private chunk(F: MjFloor, ix: number, iy: number): HTMLCanvasElement | null {
    const key = iy * 4096 + ix;
    if (F.chunks.has(key)) {
      const cached = F.chunks.get(key)!;
      F.chunks.delete(key); F.chunks.set(key, cached); // Map 顺序即 LRU
      return cached;
    }
    if (typeof document === 'undefined') return null;
    const T = THEMES[this.cur!.spec.theme];
    const cv = document.createElement('canvas'); cv.width = Math.ceil(CH * CHS); cv.height = Math.ceil(CH * CHS);
    const c = cv.getContext('2d')!;
    const th = this.cur!.spec.theme;
    // 原版秘境图片不再加载：先用程序色块画出石室，程序地表就绪后由 drawFloor 失效重烘。
    const pat = this.floorPattern(c);
    const rockPat = this.pat(c, 'rock_' + th, 320), liqPat = this.pat(c, 'liquid_' + LIQ[th], 256), wallIm = v53('wall_' + th);
    c.scale(CHS, CHS); c.translate(-ix * CH, -iy * CH);
    const x0 = Math.floor(ix * CH / CELL) - 1, y0 = Math.floor(iy * CH / CELL) - 1, x1 = Math.ceil((ix + 1) * CH / CELL) + 1, y1 = Math.ceil((iy + 1) * CH / CELL) + 2;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= F.gw || y >= F.gh ? 0 : F.cells[y * F.gw + x]);
    const hs0 = (x: number, y: number) => { const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return v - Math.floor(v); };
    // 岩体
    c.fillStyle = T.rock; c.fillRect(ix * CH, iy * CH, CH, CH);
    // 岩体压暗：它是衬托石室的山腹，不能和地面一样亮
    if (rockPat) { c.save(); c.translate(ix * CH, iy * CH); c.fillStyle = rockPat; c.globalAlpha = 0.9; c.fillRect(0, 0, CH, CH); c.globalAlpha = 0.42; c.fillStyle = '#0a0806'; c.fillRect(0, 0, CH, CH); c.restore(); }
    // 地面
    c.fillStyle = pat;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x, y)) c.fillRect(x * CELL - 0.5, y * CELL - 0.5, CELL + 1, CELL + 1);
    c.fillStyle = T.floorTint;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (at(x, y)) c.fillRect(x * CELL - 0.5, y * CELL - 0.5, CELL + 1, CELL + 1);
    // 水池 / 熔岩 / 深渊 / 冰湖
    const liq = ({ fire: ['#c8501e', '#ffb050'], sea: ['#1c4a5e', '#7fc8e0'], ice: ['#9cc4dc', '#e8f6ff'], tomb: ['#0c0a10', '#3a3448'], blood: ['#4a0c0c', '#c03030'] } as Record<string, string[]>)[this.cur!.spec.theme] ?? ['#24464a', '#8fc0c0'];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (at(x, y) !== 3) continue;
      c.fillStyle = liq[0]; c.fillRect(x * CELL - 0.5, y * CELL - 0.5, CELL + 1, CELL + 1);
      if (liqPat) { c.fillStyle = liqPat; c.globalAlpha = th === 'blood' ? 0.85 : 0.95; c.fillRect(x * CELL - 0.5, y * CELL - 0.5, CELL + 1, CELL + 1); c.globalAlpha = 1; }
      c.globalAlpha = liqPat ? 0.18 : 0.35; c.strokeStyle = liq[1]; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x * CELL + 8 + hs0(x, y) * 10, y * CELL + 14 + hs0(y, x) * 14); c.quadraticCurveTo(x * CELL + 24, y * CELL + 8 + hs0(x + 1, y) * 20, x * CELL + 40, y * CELL + 18 + hs0(x, y + 1) * 14); c.stroke();
      c.globalAlpha = 1;
      // 池岸：与地面相邻处一道深色描边
      c.strokeStyle = 'rgba(10,8,6,0.55)'; c.lineWidth = 2.5;
      if (at(x, y - 1) === 1) { c.beginPath(); c.moveTo(x * CELL, y * CELL); c.lineTo((x + 1) * CELL, y * CELL); c.stroke(); }
      if (at(x - 1, y) === 1) { c.beginPath(); c.moveTo(x * CELL, y * CELL); c.lineTo(x * CELL, (y + 1) * CELL); c.stroke(); }
      if (at(x + 1, y) === 1) { c.beginPath(); c.moveTo((x + 1) * CELL, y * CELL); c.lineTo((x + 1) * CELL, (y + 1) * CELL); c.stroke(); }
    }
    // 岩体顶面的墨点皴法
    const hs = (x: number, y: number, k: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
    c.fillStyle = T.ink;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (at(x, y)) continue;
      for (let k = 0; k < 3; k++) { c.globalAlpha = (0.18 + hs(x, y, k) * 0.2) * (rockPat ? 0.35 : 1); c.beginPath(); c.ellipse(x * CELL + hs(x, y, k + 3) * CELL, y * CELL + hs(x, y, k + 6) * CELL, 2 + hs(x, y, k + 9) * 7, 1.5 + hs(x, y, k + 9) * 4, 0, 0, TAU); c.fill(); }
    }
    c.globalAlpha = 1;
    // 墙的立面：地面格的北邻是岩体 → 在岩体格底部画一段立面
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!at(x, y) || at(x, y - 1)) continue;
      const fx = x * CELL, fy = y * CELL - FACE;
      if (wallIm) {
        // 墙的立面条：横向无缝，按格子的世界横坐标取对应的一段（相邻格子接得上）
        const tw = FACE * wallIm.width / wallIm.height, sx = ((fx % tw) + tw) % tw / tw * wallIm.width, sw = CELL / tw * wallIm.width;
        if (sx + sw <= wallIm.width) c.drawImage(wallIm, sx, 0, sw, wallIm.height, fx - 0.5, fy, CELL + 1, FACE);
        else { const w1 = wallIm.width - sx, d1 = w1 / sw * CELL; c.drawImage(wallIm, sx, 0, w1, wallIm.height, fx - 0.5, fy, d1 + 0.5, FACE); c.drawImage(wallIm, 0, 0, sw - w1, wallIm.height, fx + d1 - 0.5, fy, CELL - d1 + 1, FACE); }
        c.globalAlpha = 0.25; c.fillStyle = '#000'; c.fillRect(fx, fy + FACE - 6, CELL, 8); c.globalAlpha = 1;
        continue;
      }
      const gr = c.createLinearGradient(0, fy, 0, fy + FACE);
      gr.addColorStop(0, T.face); gr.addColorStop(1, T.faceDark);
      c.fillStyle = gr; c.fillRect(fx - 0.5, fy, CELL + 1, FACE);
      c.strokeStyle = T.ink; c.globalAlpha = 0.35; c.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { const lx = fx + hs(x, y, k + 20) * CELL; c.beginPath(); c.moveTo(lx, fy + 6 + hs(x, y, k) * 10); c.lineTo(lx + (hs(x, y, k + 1) - 0.5) * 8, fy + FACE - 4); c.stroke(); }
      c.globalAlpha = 0.7; c.lineWidth = 2.2; c.beginPath(); c.moveTo(fx, fy + 1); c.lineTo(fx + CELL, fy + 1); c.stroke();
      c.globalAlpha = 0.22; c.fillStyle = '#000'; c.fillRect(fx, fy + FACE - 6, CELL, 8);
      c.globalAlpha = 1;
    }
    // 东西两侧的墙脚墨线
    c.strokeStyle = T.ink; c.globalAlpha = 0.45; c.lineWidth = 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!at(x, y)) continue;
      if (!at(x - 1, y)) { c.beginPath(); c.moveTo(x * CELL, y * CELL); c.lineTo(x * CELL, (y + 1) * CELL); c.stroke(); }
      if (!at(x + 1, y)) { c.beginPath(); c.moveTo((x + 1) * CELL, y * CELL); c.lineTo((x + 1) * CELL, (y + 1) * CELL); c.stroke(); }
      if (!at(x, y + 1)) { c.beginPath(); c.moveTo(x * CELL, (y + 1) * CELL); c.lineTo((x + 1) * CELL, (y + 1) * CELL); c.stroke(); }
    }
    c.globalAlpha = 1;
    F.chunks.set(key, cv);
    return cv;
  }
  /** 底图：在世界层画布上（世界坐标变换已设好） */
  drawFloor(c: G, view: { left: number; top: number; right: number; bottom: number }) {
    const F = this.floor; if (!F) return;
    const T = THEMES[this.cur!.spec.theme];
    // 缓存曾以纯色回退烘焙时，程序画材就绪后重新烘焙。
    if (this.floorPending.has(F) && groundTile(T.floor)) { F.chunks.clear(); this.floorPending.delete(F); }
    c.fillStyle = T.rock; c.fillRect(view.left - 10, view.top - 10, view.right - view.left + 20, view.bottom - view.top + 20);
    const lx = view.left - REALM_OX, ty = view.top - REALM_OY, rx = view.right - REALM_OX, by = view.bottom - REALM_OY;
    let built = 0; const visible = new Set<number>();
    for (let iy = Math.floor(ty / CH); iy <= Math.floor(by / CH); iy++) for (let ix = Math.floor(lx / CH); ix <= Math.floor(rx / CH); ix++) {
      if (ix < 0 || iy < 0 || ix * CH > F.gw * CELL || iy * CH > F.gh * CELL + FACE) continue;
      const key = iy * 4096 + ix;
      visible.add(key);
      if (!F.chunks.has(key) && built >= 2) continue;
      if (!F.chunks.has(key)) built++;
      const cv = this.chunk(F, ix, iy);
      if (cv) c.drawImage(cv, REALM_OX + ix * CH - 0.5, REALM_OY + iy * CH - 0.5, CH + 1, CH + 1);
    }
    trimMijingChunks(F.chunks, visible);
  }
  /** 摆件、宝箱、禁制门、出口（Y 排序） */
  collect(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, t: number) {
    const F = this.floor; if (!F) return;
    const T = THEMES[this.cur!.spec.theme], v = T.variant ? '|' + T.variant : '';
    for (const o of F.objs) {
      if (o.hidden) continue;
      if (o.x < view.left - 200 || o.x > view.right + 200 || o.y < view.top - 100 || o.y > view.bottom + 300) continue;
      const foc = this.focus === o;
      out.push({ y: o.kind === 'door' ? o.y + CELL : o.y, k: 'D·秘境', draw: (c) => {
        switch (o.kind) {
          case 'prop': case 'deco': case 'light': {
            if (o.key!.startsWith('v:')) {
              if (o.kind === 'light') { c.save(); c.globalCompositeOperation = 'lighter'; const a = 0.35 + 0.12 * Math.sin(t * 6 + o.x); const gr = c.createRadialGradient(o.x, o.y - 50, 2, o.x, o.y - 50, 140); gr.addColorStop(0, `rgba(${T.ambient},${a})`); gr.addColorStop(1, `rgba(${T.ambient},0)`); c.fillStyle = gr; c.beginPath(); c.arc(o.x, o.y - 50, 140, 0, TAU); c.fill(); c.restore(); }
              if (drawV(c, o.key!.slice(2), o.x, o.y, o.kind === 'deco' ? 0.75 : 1, o.flip)) break;
            }
            const key = o.key! + (o.kind === 'light' ? '' : v);
            if (o.kind === 'light') { c.save(); c.globalCompositeOperation = 'lighter'; const a = 0.35 + 0.12 * Math.sin(t * 6 + o.x); const gr = c.createRadialGradient(o.x, o.y - 50, 2, o.x, o.y - 50, 140); gr.addColorStop(0, `rgba(${T.ambient},${a})`); gr.addColorStop(1, `rgba(${T.ambient},0)`); c.fillStyle = gr; c.beginPath(); c.arc(o.x, o.y - 50, 140, 0, TAU); c.fill(); c.restore(); }
            // 大件（古树、殿柱）按高度封顶，免得一棵树遮掉半间石室
            const dm = bldDim(o.key!); const sc = Math.min(o.s ?? 0.8, dm ? (o.kind === 'deco' ? 90 : 230) / dm.h : 1);
            if (!drawBld(c, key, o.x, o.y, t, sc, o.flip)) drawBld(c, o.key!, o.x, o.y, t, sc, o.flip);
            break;
          }
          case 'chest': {
            c.save(); if (o.used) c.globalAlpha *= 0.55;
            const ck = o.used ? 'chest_open' : (o.tier ?? 1) >= 3 ? 'chest_3' : (o.tier ?? 1) >= 2 ? 'chest_2' : 'chest_1';
            if (!drawV(c, ck, o.x, o.y, 1) && !drawBld(c, 'p_chest', o.x, o.y, t, 0.8)) { c.fillStyle = '#7a5a30'; c.fillRect(o.x - 26, o.y - 30, 52, 30); }
            if (!o.used) { c.globalCompositeOperation = 'lighter'; const gr = c.createRadialGradient(o.x, o.y - 30, 2, o.x, o.y - 30, 60); gr.addColorStop(0, `rgba(255,220,140,${0.4 + 0.2 * Math.sin(t * 4)})`); gr.addColorStop(1, 'rgba(255,220,140,0)'); c.fillStyle = gr; c.beginPath(); c.arc(o.x, o.y - 30, 60, 0, TAU); c.fill(); }
            c.restore(); break;
          }
          case 'herb': {
            if (o.used) break;
            const mjHerbs = ['herb_lingzhi', 'herb_jinxin', 'herb_xuelian', 'herb_zihou', 'herb_tianling', 'herb_bingpo', 'herb_xuejing', 'herb_nichang'];
            const hid = (o as any).herbId ?? mjHerbs[Math.abs(Math.floor(o.x * 7 + o.y * 13)) % mjHerbs.length];
            const glow = herbGlowRgb(hid);
            c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(${glow},${0.25 + 0.15 * Math.sin(t * 3 + o.x)})`; c.beginPath(); c.ellipse(o.x, o.y - 6, 26, 10, 0, 0, TAU); c.fill(); c.restore();
            if (drawV(c, 'herb_' + (1 + (Math.floor(o.x * 7 + o.y * 13) % 3 + 3) % 3), o.x, o.y, 1)) break;
            drawHerbSprite(c, hid, o.x, o.y, 1.4, t, { seed: Math.floor(o.x + o.y), soil: true });
            break;
          }
          case 'stele': { c.save(); if (o.used) c.globalAlpha *= 0.7; drawBld(c, o.key! + v, o.x, o.y, t, 0.9) || drawBld(c, o.key!, o.x, o.y, t, 0.9); c.restore(); break; }
          case 'exit': case 'stairs': {
            // 古阵：贴地的石砌阵台（画材是正上方俯视的黑底发光图，压扁后贴在地上缓缓转）
            const gi = v53(o.kind === 'exit' ? 'gate_exit' : 'gate_down');
            if (gi) { c.save(); c.translate(o.x, o.y - 10); c.scale(1, 0.48); c.rotate(t * (o.kind === 'stairs' ? -0.25 : 0.12)); c.globalAlpha = 0.95; c.drawImage(gi, -95, -95, 190, 190); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25 + 0.12 * Math.sin(t * 3); c.drawImage(gi, -95, -95, 190, 190); c.restore(); break; }
            drawBld(c, o.key!, o.x, o.y, t, 0.8);
            c.save(); c.globalCompositeOperation = 'lighter';
            const im = v53('zf_activate');
            if (im) { c.globalAlpha = 0.45; c.translate(o.x, o.y); c.scale(1, 0.45); c.rotate(t * 0.5); c.drawImage(im, -90, -90, 180, 180); }
            c.restore(); break;
          }
          case 'door': {
            if (o.open) break;
            const im = v53('zf_curtain');
            const vert = (o.cells ?? []).length > 0 && new Set((o.cells ?? []).map((i) => i % F.gw)).size <= 3;
            const w = vert ? CELL * 1.2 : CELL * 3.4, h = 150;
            c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.75 + 0.15 * Math.sin(t * 3);
            if (im) c.drawImage(im, o.x - w / 2, o.y - h + CELL * 0.5, w, h);
            else { c.fillStyle = 'rgba(150,200,255,0.4)'; c.fillRect(o.x - w / 2, o.y - h + CELL * 0.5, w, h); }
            c.restore(); break;
          }
        }
        if (foc) {
          const label = { chest: '开启宝匣', herb: '采灵草', stele: '参悟古碑', exit: '古阵', stairs: '下一层', door: '破禁', prop: '', light: '', deco: '' }[o.kind] + '（T）';
          c.save(); c.font = 'bold 15px "Noto Serif SC", serif'; c.textAlign = 'center';
          c.fillStyle = 'rgba(20,16,10,0.6)'; c.fillText(label, o.x + 1, o.y - 109); c.fillStyle = '#fff2cc'; c.fillText(label, o.x, o.y - 110); c.restore();
        }
      } });
    }
  }
  /** 秘境的幽暗：神识照得到的地方亮，远处沉入黑暗 */
  drawDark(c: G, view: { left: number; top: number; right: number; bottom: number }) {
    const cur = this.cur; if (!cur) return;
    const T = THEMES[cur.spec.theme], p = this.game.player;
    const R0 = 260 + Math.min(500, this.game.senseRadius * 0.35), R1 = R0 + 520;
    c.save();
    const gr = c.createRadialGradient(p.x, p.y - 30, R0, p.x, p.y - 30, R1);
    gr.addColorStop(0, 'rgba(8,6,10,0)'); gr.addColorStop(1, `rgba(8,6,10,${T.dark})`);
    c.fillStyle = gr; c.fillRect(view.left - 10, view.top - 10, view.right - view.left + 20, view.bottom - view.top + 20);
    c.restore();
  }
  /** 小地图数据（界面用） */
  mini(): { gw: number; gh: number; cells: Uint8Array; roomOf: Int16Array; rooms: MjRoom[]; px: number; py: number; objs: MjObj[] } | null {
    const F = this.floor; if (!F) return null;
    const { cx, cy } = this.cellAt(this.game.player.x, this.game.player.y);
    return { gw: F.gw, gh: F.gh, cells: F.cells, roomOf: F.roomOf, rooms: F.rooms, px: cx, py: cy, objs: F.objs };
  }
}

const NAMES = ['无名石窟', '山腹古洞', '枯井石室', '藤封石殿', '古修坐化地', '断崖洞府', '地下石宫', '苔封墓门', '寒潭水府', '荒冢地宫'];
const STELE = [
  '「……此地灵脉将竭，吾以残躯布下禁制，留待有缘……」',
  '「……炼气筑基，皆是筑台；结丹成婴，方算入门……」',
  '「……五行相生，阵眼自现；相克则乱，乱中取胜……」',
  '「……吾一生斩妖三千，临了才知，斩的不过是自己的心魔……」',
  '「……后来者若得此碑，切记：秘境之中，最险的不是妖兽，是同行之人……」',
];
function pickName(R: () => number) {
  const a = ['孙', '钱', '周', '吴', '郑', '冯', '陈', '韦', '沈', '杨', '朱', '秦'], b = ['青', '玄', '元', '守', '一', '道', '天', '无', '平', '松'], c = ['子', '风', '真', '明', '远', '岳', '云', '鹤', '川', '阳'];
  return a[Math.floor(R() * a.length)] + b[Math.floor(R() * b.length)] + c[Math.floor(R() * c.length)];
}

/** 各主题用哪种液面画材 */
const LIQ: Record<string, string> = { cave: 'water', tomb: 'abyss', ice: 'icelake', fire: 'lava', forest: 'water', desert: 'abyss', sea: 'water', palace: 'water', blood: 'blood' };
/** 画一张 v0.54 精灵（摆件、宝匣、灵草、入口）：落地点在 (x, y)，尺寸按转换时定好的世界尺寸 */
function drawV(c: G, id: string, x: number, y: number, s = 1, flip = false): boolean {
  const im = v53(id), M = meta53(id); if (!im || !M) return false;
  const k = (M.ws ?? 1) * s, dw = M.w * k, dh = M.h * k;
  const ax = M.ax !== undefined && M.ax > 0.35 && M.ax < 0.65 ? M.ax : 0.5;
  c.save(); c.translate(x, y); if (flip) c.scale(-1, 1);
  c.drawImage(im, -dw * ax, -dh * (M.ay ?? 1), dw, dh);
  c.restore();
  return true;
}
void loaded53;
