// v0.54：秘境——可以走进去的独立场景
// - 进秘境不刷新页面：世界暂停一角，主角与同行友人被挪到世界地图之外的一块专属坐标里（REALM_OX 以东），
//   那里有秘境自己的石室、甬道、墙、禁制门、宝箱、首领；战斗、法术、法宝、阵法、化形、元婴出窍照常可用
// - 三级：小秘境（野外的前人洞府、江湖传闻、友人邀约随时生成，三到六间）· 中秘境（八处原设险地，十余间，首领）·
//   大秘境（赤霄禁地、归墟殿、封魔山、陨魔谷谷底：按原设节奏定期开启，多层，别家修士同场争宝）
// - 有真有假：江湖传闻里的秘境，到了可能是空山，也可能是劫修放消息设伏
// - 秘境里不存档：存档记的是入口所在
import { keyNote } from '../core/keymap';   // 第五轮：说明里的键位从 keymap 取，触屏换说法
import type { Game } from './game';
import type { Drawable } from './life';
import type { DNode } from './modal';
import { Enemy } from './combat';
import { ENEMIES, ENEMY_LIST, lvOf, lvRealm, lvWeight, type EnemyDef } from '../data/enemies';
import { THEMES, Theme, MIJING, MJ_BY_ID, MijingDef, MjTier, TIER_NAME, mjOpen, MIJING_ON } from '../data/mijing';
import { roomsFor, type RoomRole } from '../data/mjrooms';
import { ACTIVE_MAP, LOC_BY_ID, WORLD_SCALE, WORLD_W } from '../data/world';
import { REALMS } from '../data/realms';
import { GROUND_SRC } from '../gl/groundTexData';
import { drawBld, loadBld2, bldDim } from '../gfx/bldTex2';
import { v53, meta53, loaded53, warm53 } from '../gfx/v053Tex';
import { loot, pickArt, dirName, type Site } from './sites';
import { foeRealm } from './demog';
import { itemDef } from '../data/items';
import { gearDropId, weaponDrop } from '../data/gear';   // 收官 C（甲）：首领掉装备
import * as C from './cultivation';
import { audio } from './audio';
import { rollAffix } from './affix';
import { isleEdge, type IsleShape } from './isleshape';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 秘境坐标原点：世界地图以东。取比三张图都宽的一个固定值（最宽的中州 36 万），不随当前地图变 */
export const REALM_OX = 1400000, REALM_OY = 40000;   // 远在所有地图和交界地带之外（南荒放大后东缘加无边海已到 75 万）
/** 一格的边长。B 版放大了一倍（原先 48）：石室、通道都宽了一倍，斗法才施展得开 */
export const CELL = 96;
const FACE = 72;   // 墙的立面高度
const CH = 768;    // 底图分块（世界像素）
const CHS = 0.75;  // 底图分块的缩放

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export type RoomKind = 'entry' | 'hall' | 'treasure' | 'herb' | 'shrine' | 'boss';
export interface MjObj { kind: 'chest' | 'herb' | 'stele' | 'exit' | 'stairs' | 'door' | 'prop' | 'light' | 'deco'; x: number; y: number; key?: string; used?: boolean; tier?: number; cells?: number[]; open?: boolean; room?: number; s?: number; flip?: boolean; hidden?: boolean }
export interface MjRoom { i: number; x0: number; y0: number; x1: number; y1: number; kind: RoomKind; entered: boolean; cleared: boolean; foes: Enemy[]; d: number; rival?: boolean; tpl: string; cx: number; cy: number; spots: Record<string, [number, number][]> }
/** 一座悬空的石台（世界坐标）：圆的或八角的 */
export interface MjIsle { x: number; y: number; r: number; round: boolean; kind: RoomKind; seed: number;
  /** 轮廓：0 八角、1 圆、2 自然浮岛、3 碎岩（world/isleshape.ts） */
  shape: IsleShape }
/**
 * 主题变体（概念图 B、D，用户 2026-11-14 选作变体）：妖林是「自然浮岛」——草甸、边缘起伏、台沿挂瀑布；
 * 古墓和赤霄禁地是「剑冢深渊」——碎岩、暗色石面、裂缝透光、插着巨剑。其余主题是寻常的八角石台。
 */
export const MJ_SHAPE: Partial<Record<Theme, IsleShape>> = { forest: 2, tomb: 3, blood: 3, shanshui: 2 };
/** 两座石台之间的一条石桥（能走）或铁索（只是看的，要飞过去） */
export interface MjLink { ax: number; ay: number; bx: number; by: number; w: number }
export interface MjFloor { gw: number; gh: number; cells: Uint8Array; roomOf: Int16Array; rooms: MjRoom[]; objs: MjObj[]; chunks: Map<number, HTMLCanvasElement | null>; bossDead: boolean;
  /** 石台群的布局（没有就是旧的迷宫式）；bound 是罩住整座秘境的界壁（圆） */
  isles?: MjIsle[]; bridges?: MjLink[]; chains?: MjLink[]; bound?: { x: number; y: number; r: number };
  /** 台上立着的石柱（格子坐标、高度、柱头是否鎏金）：柱子占的那一格不能走 */
  pillars?: { cx: number; cy: number; h: number; gold: boolean }[] }
/** 第六轮返工：存档里的秘境进度（ws.flags.mjProg）：每层清了的石室、用过的物件、开了的禁制门（都是下标）、首领死没死 */
export interface MjProg { key: string; fi: number; kills?: number; inside: boolean; until?: number; fl: { c: number[]; u: number[]; o: number[]; b: 0 | 1 }[] }
export interface MjSpec { name: string; tier: MjTier; theme: Theme; seed: number; floors: number; rooms: number; lv: number; def?: MijingDef; siteKey?: string; entKey?: string; boss?: string;
  /** 规模系数（线性）：不给就按档次取 MJ_SIZE */
  size?: number }
/**
 * 石台群的规模（线性系数，1 = 2026-11-14 那版样板的大小）。用户看过样板说「副本还是太小」（2026-11-15）：
 * 那版整座约 4 屏宽、从入口出发哪儿都在两屏内。现在小秘境 2.5 倍、中 3.5 倍、大 5 倍——
 * 中档大约是主台 3 屏、祭坛 4.5 屏、石桥一屏多长。localStorage taixu.mijing.size 可整体再乘一个数（调手感用）。
 */
export const MJ_SIZE = [1, 2.5, 3.5, 5];
const MJ_SIZE_K = (() => { try { const v = typeof localStorage === 'undefined' ? NaN : Number(localStorage.getItem('taixu.mijing.size')); return v > 0.2 && v < 4 ? v : 1; } catch { return 1; } })();
export const mjSize = (spec: MjSpec) => Math.max(1, (spec.size ?? MJ_SIZE[spec.tier] ?? 1) * MJ_SIZE_K);
export interface MjEnt { key: string; map: string; x: number; y: number; name: string; theme: Theme; seed: number; tier: MjTier; lv: number; until: number; src: 'rumor' | 'invite'; fake?: 'empty' | 'ambush'; npc?: string; seen?: boolean; done?: boolean }
interface MjState { ents: MjEnt[]; next: number; cd: Record<string, number>; seq: number; log: string[] }

import { LOC_SCALE, type LocLayout } from '../gfx/building';
import { shuffleWith } from '../core/rng';
/** 摆件立板的范围（相对脚底，世界单位） */
const MJ_BOX = [-170, 170, -300, 60] as const;

/** 秘境的布局：石台群（默认）；localStorage taixu.mijing=maze 退回旧的拼图迷宫 */
const MJ_ISLES = (() => { try { return typeof localStorage === 'undefined' || localStorage.getItem('taixu.mijing') !== 'maze'; } catch { return true; } })();

export class MijingSys {
  /** 当前所在的秘境（null = 在大地图上） */
  cur: { spec: MjSpec; floors: MjFloor[]; fi: number; back: { x: number; y: number; flying: boolean }; stash: Enemy[]; t: number; got: string[]; kills: number } | null = null;
  focus: MjObj | null = null; focusD = 1e9;
  /** 大地图上：秘境入口的焦点 */
  entFocus: { kind: 'def'; def: MijingDef; x: number; y: number } | { kind: 'ent'; ent: MjEnt } | null = null; entFocusD = 1e9;
  private floorImg: HTMLImageElement | null = null; private floorKey = -1;
  private lastOk = { x: 0, y: 0 };
  private hint = 0;
  /** 最近一次站在地面上的位置（石台群式的秘境：没在飞又悬在虚空上时送回这里） */
  private lastLand = { x: 0, y: 0 };
  constructor(public game: Game) {}

  // ------------------------------------------------------------ 云门：无缝进出
  /**
   * 进出秘境不再是「按一下就换画面」（用户对无缝的要求：玩家自己走过去，不放过场、不闪、不切）：
   * 入口处升起一团云气（云门），人走（飞）进去，离门心越近门洞里那团云越浓；人走到门心、被那团云裹住的那一小段换到另一边——
   * 那边的门心同样裹在云里，往外走云就散。全程是玩家自己在走，想退回去转身就行。
   * 第五轮返工：云只贴着门心一带（core + spot，render.ts 按门的屏幕位置盖一团），整屏那层最浓 VEIL_MAX（看得见人影），不再满屏闪白。
   * 秘境里的古阵（入口的、首领身后的、通往下一层的）本身就是云门；不再弹「是否离开」。
   * 没打完就出来的，秘境原样留一阵（KEEP 秒），从同一道门回去接着打。
   */
  gate: { x: number; y: number; spec: MjSpec | null; until: number } | null = null;
  /** 给画面的整屏云气浓度 0..VEIL_MAX（已平滑；画面在 render.ts 里盖一层云）。第五轮返工：原来到门心要涨到 0.94 才换场，等于一次闪白 */
  veil = 0;
  /** 门洞里那一团云有多浓 0..1（只贴着门心一带铺开：人走到门心被它挡住，换场就发生在这一小段；门外的人和四周照样看得清） */
  core = 0;
  /** 那一团云在哪（世界坐标）；null = 眼下没有门 */
  spot: { x: number; y: number } | null = null;
  /** 整屏那层云最浓到多少：人影始终看得见，不再有「几乎全白」的帧 */
  static readonly VEIL_MAX = 0.5;
  private veilWant = 0;
  /** 刚从门里出来：要先走出云门，才会再被送回去（不然站在门心会来回换） */
  private armed = true;
  /** 不是从云门进来的（调试入口、测试直接 enter）：落地时不该裹着一团云，等走出门外再照常 */
  private quiet = false;
  private kept: { cur: NonNullable<MijingSys['cur']>; key: string; until: number } | null = null;
  private static readonly GATE_R = 460; private static readonly GATE_CORE = 90; private static readonly KEEP = 900;
  private keyOf(sp: MjSpec) { return [sp.name, sp.seed, sp.tier, sp.theme, sp.rooms, sp.floors, sp.size ?? ''].join('|'); }
  /** 离门心 d 远时云有多浓 */
  private veilAt(d: number) { return clamp(1 - (d - MijingSys.GATE_CORE) / (MijingSys.GATE_R - MijingSys.GATE_CORE), 0, 1); }
  /** 在大地图上开一道云门（原先这里是直接 enter）：门开在身前走得到的地方，人自己走进去 */
  openGate(spec: MjSpec) {
    const g = this.game, p = g.player, T = g.terrain;
    if (this.cur || !MIJING_ON) return;
    let gx = p.x, gy = p.y;
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 4, x = p.x + Math.cos(a) * 300, y = p.y + Math.sin(a) * 300;
      if (p.flying || (T.walkFactor(x, y) > 0 && T.canTraverse(p.x, p.y, x, y) && !g.space.blocked(x, y))) { gx = x; gy = y; break; }
    }
    this.gate = { x: gx, y: gy, spec, until: g.time + 180 }; this.armed = true;
    g.toast(`「${spec.name}」的入口荡开一团云气——走进去，便入秘境。`, 'region');
    audio.sfx('open');
  }
  /** 云气的涨落：每帧朝该有的浓度靠过去（突然出现的门也不会一下子盖满） */
  private veilTick(dt: number, want: number, at: { x: number; y: number } | null = null) {
    this.veilWant = want;
    let k = this.core + (want - this.core) * Math.min(1, dt * 5);
    if (want === 0 && k < 0.004) k = 0;
    this.setCore(k, at ? { x: at.x, y: at.y } : this.spot);
  }
  /** 门洞那团云的浓度定了，整屏那层随它走（贴近门心才起一层薄雾，最浓 VEIL_MAX）；画中洞天出来时由 huajuan 直接调 */
  setCore(k: number, at: { x: number; y: number } | null) {
    this.core = clamp(k, 0, 1); this.spot = this.core > 0 ? at : null;
    this.veil = this.core > 0 ? MijingSys.VEIL_MAX * this.core * this.core : 0;
  }
  /** 门口的云：一团团往上翻的白气，夹几点灵光（只是看的，真正盖住画面的是 veil 那一层） */
  private gateFx(x: number, y: number, dt: number) {
    const fx = this.game.renderer?.fx; if (!fx) return;
    if (Math.random() < dt * 14) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * MijingSys.GATE_R * 0.7; fx.smoke(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, 1, [0.93, 0.94, 0.92], 0.3, 30, 150); }
    if (Math.random() < dt * 5) fx.smoke(x, y - 40, 1, [0.97, 0.97, 0.95], 0.4, 60, 220);
    if (Math.random() < dt * 3) { const a = Math.random() * TAU; fx.glint(x + Math.cos(a) * 120, y + Math.sin(a) * 70 - 60, 10, [1, 0.92, 0.7], 0.6, 0.5); }
  }
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
    shuffleWith(roleQ, R);
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
    if (spec.tier >= 2) shuffleWith(rooms.filter((r) => r.kind === 'hall' && !(r as any).link), R).slice(0, spec.tier === 3 ? 2 : 1).forEach((r) => { r.rival = true; });
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
    return { gw, gh, cells: C2, roomOf: RO, rooms, objs, chunks: new Map(), bossDead: false };
  }

  /**
   * 石台群（2026-11-13 定稿，概念图在 重构v0.57\概念图\秘境：布局取 A、首领台取 C、界壁取 E）：
   * 入口是居中的主台，其余石室各是一座分台，围着主台摆一圈；首领的祭坛更大，单独在外侧。
   * 主台到每座分台、到祭坛各有一条石桥（能走）；相邻的分台之间只挂铁索（要飞过去）。没有墙、没有走廊。
   * 逻辑上仍是一张格子图（哪些格子能落脚），所以进石室刷怪、宝匣、小地图这些都照旧。
   */
  private genIsles(spec: MjSpec, fi: number): MjFloor {
    const R = rng(spec.seed * 31 + fi * 977 + 7);
    const pk = <X>(a: X[]) => a[Math.floor(R() * a.length)];
    const want = Math.max(3, spec.rooms + (fi > 0 ? -1 : 0)), sats = want - 2;
    const roleQ: RoomKind[] = [];
    const nT = Math.max(1, Math.round(sats * 0.22)), nH = Math.round(sats * 0.14), nS = Math.round(sats * 0.12);
    for (let k = 0; k < nT; k++) roleQ.push('treasure');
    for (let k = 0; k < nH; k++) roleQ.push('herb');
    for (let k = 0; k < nS; k++) roleQ.push('shrine');
    while (roleQ.length < sats) roleQ.push('hall');
    roleQ.length = sats; shuffleWith(roleQ, R);
    /** up：这座台的石桥通向哪座台（下标）。内圈和祭坛通主台，外圈通内圈里离它最近的那座 */
    type Node = { kind: RoomKind; cx: number; cy: number; r: number; round: boolean; up: number; shape?: IsleShape; seed?: number };
    // 所有尺寸都跟着规模系数走（格子边长不变，石台占的格子数变多）
    const K = mjSize(spec), sc = (v: number) => Math.max(1, Math.round(v * K));
    const HUB = sc(12), BOSS = sc(17), GAP = sc(8);
    const nodes: Node[] = [{ kind: 'entry', cx: 0, cy: 0, r: HUB, round: false, up: -1 }];
    const rs = roleQ.map(() => sc(8 + Math.floor(R() * 3))), rmax = Math.max(sc(9), ...rs), bossA = R() * TAU;
    // 分台多了（七座以上）排成内外两圈，不然一圈的周长撑得太开、主台到分台的桥太长
    const n1 = sats >= 7 ? Math.ceil(sats / 2) : sats, n2 = sats - n1;
    const ringD = (n: number, inner: number) => Math.max(inner, (n + 1) * (2 * rmax + sc(6)) / TAU);
    const D1 = ringD(n1, HUB + GAP + rmax), D2 = n2 ? ringD(n2, D1 + 2 * rmax + GAP) : 0;
    for (let k = 0; k < sats; k++) {
      const outer = k >= n1, n = outer ? n2 : n1, j = outer ? k - n1 : k;
      // 两圈都在首领那个方向空出一个位置：引桥从那儿穿出去
      const a = bossA + (j + 1) / (n + 1) * TAU + (R() - 0.5) * 0.1, d = (outer ? D2 : D1) + (R() - 0.5) * sc(3);
      nodes.push({ kind: roleQ[k], cx: Math.round(Math.cos(a) * d), cy: Math.round(Math.sin(a) * d), r: rs[k], round: R() < 0.3, up: 0 });
    }
    for (let i = 1 + n1; i < nodes.length; i++) {
      let best = 1, bd = 1e9;
      for (let j = 1; j <= n1; j++) { const d = Math.hypot(nodes[j].cx - nodes[i].cx, nodes[j].cy - nodes[i].cy); if (d < bd) { bd = d; best = j; } }
      nodes[i].up = best;
    }
    // 首领的祭坛在最外头：放大以后多留一段长引桥，走上去有「登坛」的那一程
    let DB = HUB + GAP + BOSS + sc(2) + (K > 1.5 ? sc(6) : 0);
    for (let t = 0; t < 900 && nodes.slice(1).some((n) => Math.hypot(n.cx - Math.cos(bossA) * DB, n.cy - Math.sin(bossA) * DB) < BOSS + n.r + sc(7)); t++) DB += 1;
    nodes.push({ kind: 'boss', cx: Math.round(Math.cos(bossA) * DB), cy: Math.round(Math.sin(bossA) * DB), r: BOSS, round: true, up: 0 });
    // 格子图
    const M0 = 8, minX = Math.min(...nodes.map((n) => n.cx - n.r)) - M0, minY = Math.min(...nodes.map((n) => n.cy - n.r)) - M0;
    for (const n of nodes) { n.cx -= minX; n.cy -= minY; }
    const gw = Math.max(...nodes.map((n) => n.cx + n.r)) + M0 + 1, gh = Math.max(...nodes.map((n) => n.cy + n.r)) + M0 + 1;
    const cells = new Uint8Array(gw * gh), roomOf = new Int16Array(gw * gh).fill(-1);
    // 形状：主题变体整座秘境换一种轮廓；剑冢的祭坛仍是圆坛
    const vshape = MJ_SHAPE[spec.theme];
    nodes.forEach((n, i) => { n.seed = spec.seed * 13 + i * 101 + fi; n.shape = vshape === 3 && n.kind === 'boss' ? 1 : vshape ?? (n.round ? 1 : 0); });
    const inside = (n: Node, x: number, y: number) => {
      if (n.shape! >= 2) { const ex = x - n.cx, ey = y - n.cy; return Math.hypot(ex, ey) <= isleEdge(false, n.r, Math.atan2(ey, ex), n.shape, n.seed); }
      const dx = Math.abs(x - n.cx), dy = Math.abs(y - n.cy); return n.round ? dx * dx + dy * dy <= n.r * n.r : dx <= n.r && dy <= n.r && dx + dy <= n.r * 1.42;
    };
    nodes.forEach((n, i) => { for (let y = n.cy - n.r; y <= n.cy + n.r; y++) for (let x = n.cx - n.r; x <= n.cx + n.r; x++) if (inside(n, x, y)) { cells[y * gw + x] = 1; roomOf[y * gw + x] = i; } });
    // 石桥：每座台通向它的上一座（内圈、祭坛通主台；外圈通内圈）。样板大小是三格宽，放大后五格宽
    const WX = (c: number) => REALM_OX + (c + 0.5) * CELL, WY = (c: number) => REALM_OY + (c + 0.5) * CELL;
    const bridges: MjLink[] = [], chains: MjLink[] = [], bh = K >= 2 ? 2 : 1;
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[nodes[i].up], b = nodes[i], len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      for (let t = 0; t <= len * 2; t++) {
        const k = t / (len * 2), x = a.cx + (b.cx - a.cx) * k, y = a.cy + (b.cy - a.cy) * k;
        for (let oy = -bh; oy <= bh; oy++) for (let ox = -bh; ox <= bh; ox++) { const gx = Math.round(x) + ox, gy = Math.round(y) + oy, q = gy * gw + gx; if (!cells[q]) cells[q] = 1; }
      }
      bridges.push({ ax: WX(a.cx), ay: WY(a.cy), bx: WX(b.cx), by: WY(b.cy), w: CELL * (bh * 2 + 1.3) });
    }
    // 铁索：同一圈里相邻的两台之间（内圈算上祭坛）。只是看的，要飞过去
    const ringOf = (list: Node[]) => {
      const ring = list.map((n) => ({ n, a: Math.atan2(n.cy - nodes[0].cy, n.cx - nodes[0].cx) })).sort((u, v) => u.a - v.a);
      for (let i = 0; i < ring.length && ring.length > 1; i++) {
        const a = ring[i].n, b = ring[(i + 1) % ring.length].n, dx = b.cx - a.cx, dy = b.cy - a.cy, d = Math.hypot(dx, dy) || 1;
        if (a === b || d - a.r - b.r > sc(26)) continue;
        chains.push({ ax: WX(a.cx + dx / d * a.r), ay: WY(a.cy + dy / d * a.r), bx: WX(b.cx - dx / d * b.r), by: WY(b.cy - dy / d * b.r), w: K >= 2 ? 20 : 14 });
      }
    };
    ringOf([...nodes.slice(1, 1 + n1), nodes[nodes.length - 1]]);
    if (n2 > 1) ringOf(nodes.slice(1 + n1, nodes.length - 1));
    // 石柱：祭坛四角四根高柱；别的台子边上几根残柱。柱子占的那一格不能走
    const pillars: NonNullable<MjFloor['pillars']> = [];
    nodes.forEach((n, i) => {
      // 放大后柱子更多更高：祭坛和主台一圈八根，分台的残柱按规模加
      const boss = n.kind === 'boss', big = K >= 2, cnt = boss || i === 0 ? (big ? 8 : 4) : Math.round((2 + Math.floor(R() * 3)) * Math.max(1, K * 0.6)), hk = 1 + (K - 1) * 0.3;
      for (let k = 0; k < cnt; k++) {
        const a = boss || i === 0 ? Math.PI / cnt + k * TAU / cnt : R() * TAU, rad = n.r * (boss ? 0.8 : i === 0 ? 0.84 : 0.86);
        const x = Math.round(n.cx + Math.cos(a) * rad), y = Math.round(n.cy + Math.sin(a) * rad), q = y * gw + x;
        if (roomOf[q] !== i || pillars.some((o) => Math.abs(o.cx - x) < 2 && Math.abs(o.cy - y) < 2)) continue;
        cells[q] = 0;
        pillars.push({ cx: x, cy: y, h: (boss ? 560 : i === 0 ? 300 : 90 + R() * 240) * hk, gold: boss });
      }
    });
    // 石室与预留的位置
    const rooms: MjRoom[] = nodes.map((n, i) => {
      const at = (k: number, of: number, rad: number, ph = 0): [number, number] => { const a = (k + ph) / of * TAU; return [Math.round(n.cx + Math.cos(a) * rad), Math.round(n.cy + Math.sin(a) * rad)]; };
      const spots: Record<string, [number, number][]> = {};
      // 台面大了，灯、摆件、点缀、妖物出没点都按规模加，不然台上空荡荡
      const nL = 4 * Math.max(1, Math.round(K / 1.6)), mP = Math.max(1, Math.round(K)), mD = Math.max(1, Math.round(K * K * 0.5)), nE = Math.round(7 * Math.max(1, K * 0.7)), mH = Math.max(1, Math.round(K * 0.8));
      spots.L = Array.from({ length: nL }, (_, k) => at(k, nL, n.r * 0.74, 0.5));
      { const len = n.kind === 'boss' ? 0 : (3 + Math.floor(R() * 3)) * mP, of = Math.max(6, len); spots.P = Array.from({ length: len }, (_, k) => at(k + R() * 0.5, of, n.r * 0.8)); }
      spots.d = Array.from({ length: (3 + Math.floor(R() * 3)) * mD }, () => at(R() * 8, 8, n.r * (0.3 + R() * 0.45)));
      spots.E = Array.from({ length: nE }, (_, k) => at(k, nE, n.r * 0.46, R()));
      if (n.kind === 'entry') spots.X = [[n.cx, n.cy - sc(4)]];
      if (n.kind === 'treasure') spots.C = [[n.cx, n.cy - 1], [n.cx - sc(3), n.cy], [n.cx + sc(3), n.cy]].slice(0, 1 + Math.floor(R() * 3)) as [number, number][];
      if (n.kind === 'herb') { const len = (4 + Math.floor(R() * 3)) * mH, of = Math.max(6, len); spots.H = Array.from({ length: len }, (_, k) => at(k, of, n.r * (len > 6 ? 0.3 + (k % 3) * 0.14 : 0.4), R() * 0.3)); }
      if (n.kind === 'shrine') spots.S = [[n.cx, n.cy - 1]];
      if (n.kind === 'boss') { spots.X = [[n.cx, n.cy + sc(6)]]; spots.C = [[n.cx - sc(4), n.cy - sc(3)], [n.cx + sc(4), n.cy - sc(3)]]; spots.B = [[n.cx, n.cy - sc(2)]]; }
      return { i, x0: n.cx - n.r, y0: n.cy - n.r, x1: n.cx + n.r, y1: n.cy + n.r, kind: n.kind, entered: false, cleared: false, foes: [], d: i === 0 ? 0 : n.kind === 'boss' ? 2 : 1, tpl: 'isle', cx: n.cx, cy: n.cy, spots };
    });
    if (spec.tier >= 2) shuffleWith(rooms.filter((r) => r.kind === 'hall'), R).slice(0, spec.tier === 3 ? 2 : 1).forEach((r) => { r.rival = true; });
    const T = THEMES[spec.theme], objs: MjObj[] = [];
    const W = ([cx, cy]: [number, number]) => ({ x: REALM_OX + (cx + 0.5) * CELL, y: REALM_OY + (cy + 0.75) * CELL });
    for (const r of rooms) {
      const sp = r.spots;
      for (const q of sp.P ?? []) if (R() < 0.85) objs.push({ kind: 'prop', ...W(q), key: pk(T.props), room: r.i, s: 0.75 + R() * 0.3, flip: R() < 0.5 });
      for (const q of sp.L ?? []) objs.push({ kind: 'light', ...W(q), key: pk(T.lights), room: r.i, s: 0.8 });
      for (const q of sp.d ?? []) if (R() < 0.8) objs.push({ kind: 'deco', ...W(q), key: pk(T.deco), room: r.i, s: 0.6 + R() * 0.3, flip: R() < 0.5 });
      if (r.kind === 'entry') for (const q of sp.X ?? []) objs.push({ kind: 'exit', ...W(q), room: r.i, key: 'p_e_tp_ancient' });
      if (r.kind === 'treasure') for (const q of sp.C ?? []) objs.push({ kind: 'chest', ...W(q), room: r.i, tier: spec.tier });
      if (r.kind === 'herb') for (const q of sp.H ?? []) objs.push({ kind: 'herb', ...W(q), room: r.i, tier: spec.tier });
      if (r.kind === 'shrine') for (const q of sp.S ?? []) objs.push({ kind: 'stele', ...W(q), room: r.i, key: pk(['p_stele_a', 'p_stele_b', 'p_e_valley_stele']) });
      if (r.kind === 'boss') {
        objs.push({ kind: fi < spec.floors - 1 ? 'stairs' : 'exit', ...W(sp.X![0]), room: r.i, key: fi < spec.floors - 1 ? 'p_e_tp_broken' : 'p_e_tp_ancient', hidden: true });
        for (const q of sp.C ?? []) objs.push({ kind: 'chest', ...W(q), room: r.i, tier: spec.tier + 1, hidden: true });
      }
      if (r.kind === 'hall' && R() < 0.15) objs.push({ kind: 'chest', x: REALM_OX + (r.cx + 0.5) * CELL, y: REALM_OY + (r.cy + 1.5) * CELL, room: r.i, tier: spec.tier });
    }
    const isles: MjIsle[] = nodes.map((n) => ({ x: WX(n.cx), y: WY(n.cy), r: (n.r + 0.75) * CELL, round: n.round, kind: n.kind, seed: n.seed!, shape: n.shape! }));
    const bx = REALM_OX + gw * CELL / 2, by = REALM_OY + gh * CELL / 2;
    const br = Math.max(...isles.map((q) => Math.hypot(q.x - bx, q.y - by) + q.r)) + CELL * (7 + (K - 1) * 3);
    return { gw, gh, cells, roomOf, rooms, objs, chunks: new Map(), bossDead: false, isles, bridges, chains, bound: { x: bx, y: by, r: br }, pillars };
  }
  private genFloor(spec: MjSpec, i: number): MjFloor { return MJ_ISLES ? this.genIsles(spec, i) : this.gen(spec, i); }
  // ------------------------------------------------------------ 第五轮返工：预生成（换场那一刻不卡）
  /** 走进画中洞天那一刻原来最长一帧三百多毫秒：生成、建地面画布、传贴图、建台底岩体、头一回画摆件全挤在换场那一两帧里 */
  private pre: { key: string; floors: MjFloor[] } | null = null;
  /**
   * 人走向云门 / 画的那一两秒里每帧调一次：一帧生成一层；都生成好了，再让画面线（renderer.prewarmRealm）一帧备一点
   * 落脚那一屏的地面画布与贴图、台底岩体、摆件的画法缓存。种子序列和 enter 现生成的是同一条，不取 Math.random
   */
  warm(spec: MjSpec) {
    if (this.cur || !MIJING_ON) return;
    const key = this.keyOf(spec), kept = this.kept && this.kept.key === key && this.game.time < this.kept.until ? this.kept.cur : null;
    let floors: MjFloor[];
    if (kept) floors = kept.floors;   // 没打完回去：秘境原样还在，只备画面
    else {
      if (this.pre?.key !== key) this.pre = { key, floors: [] };
      floors = this.pre.floors;
      if (floors.length < spec.floors) { floors.push(this.genFloor(spec, floors.length)); return; }
    }
    const fi = kept ? kept.fi : 0, F = floors[fi], arr = F.isles ? F.objs.find((o) => o.kind === 'exit' && o.room === 0) : null, c = this.roomC(F.rooms[0]);
    this.game.renderer?.prewarmRealm?.(spec, fi, F, arr ? { x: arr.x, y: arr.y } : { x: c.x, y: c.y + CELL }, <T>(fn: () => T) => this.withFloor(spec, F, fn));
  }
  /** 还没进去时按某一层借用 floor / cur 那几样（画地面、墙、摆件的函数都读 this.floor）：同步调用、用完即还 */
  private withFloor<T>(spec: MjSpec, F: MjFloor, fn: () => T): T {
    const c = this.cur; if (c) return fn();
    this.cur = { spec, floors: [F], fi: 0, back: { x: 0, y: 0, flying: false }, stash: [], t: 0, got: [], kills: 0 };
    try { return fn(); } finally { this.cur = null; }
  }
  /** 收官 P8（丁）：不进去、先看一眼这座秘境第一层的样子（画中洞天把它画在画上）。生成用秘境自己的种子序列，不取 Math.random */
  preview(spec: MjSpec): MjFloor { return MJ_ISLES ? this.genIsles(spec, 0) : this.gen(spec, 0); }
  /** 这一块世界范围里有没有台面或石桥（石台群式的秘境：没有就不必为它建地面画布——放大后九成的块是空的） */
  chunkHasFloor(x0: number, y0: number, x1: number, y1: number): boolean {
    const F = this.floor; if (!F || !F.isles) return true;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    for (const s of F.isles) { const dx = Math.max(0, Math.abs(s.x - cx) - hw), dy = Math.max(0, Math.abs(s.y - cy) - hh); if (dx * dx + dy * dy < (s.r + 40) ** 2) return true; }
    for (const b of F.bridges ?? []) {
      const vx = b.bx - b.ax, vy = b.by - b.ay, L2 = vx * vx + vy * vy || 1, t = clamp(((cx - b.ax) * vx + (cy - b.ay) * vy) / L2, 0, 1);
      if (Math.hypot(b.ax + vx * t - cx, b.ay + vy * t - cy) < Math.hypot(hw, hh) + b.w / 2 + 20) return true;
    }
    return false;
  }
  /** 身在界壁之内（石台群式的秘境飞行时用：飞得出台沿，飞不出界壁） */
  inBound(x: number, y: number): boolean {
    const b = this.floor?.bound; if (!b) return this.walk(x, y);
    return Math.hypot(x - b.x, y - b.y) < b.r - 90;
  }

  // ------------------------------------------------------------ 进 / 出
  enter(spec: MjSpec) {
    const g = this.game, p = g.player;
    if (this.cur || !MIJING_ON) return;
    if (g.yuanying?.active) g.yuanying.back('force');
    loadBld2();
    const back = { x: p.x, y: p.y, flying: p.flying };
    const stash = g.combat.enemies.filter((e) => !e.dead);
    g.combat.enemies = []; g.combat.projs = []; g.combat.fields = []; g.combat.strikes = []; g.combat.lock = null;
    const kept = this.kept; this.kept = null;
    if (kept && kept.key === this.keyOf(spec) && g.time < kept.until) {
      // 没打完出来又回去：秘境原样还在，惊动过又没杀完的妖物也还在
      this.cur = { ...kept.cur, back, stash };
      for (const r of this.floor!.rooms) if (r.entered && !r.cleared) for (const e of r.foes) if (!e.dead) g.combat.enemies.push(e);
    } else {
      // 第五轮返工：人走向门 / 画的那一两秒里已经生成好的，直接接过来（同一个种子序列，和现生成的一模一样）
      const pre = this.pre && this.pre.key === this.keyOf(spec) ? this.pre.floors : null;
      const floors: MjFloor[] = pre ? pre.slice() : [];
      for (let i = floors.length; i < spec.floors; i++) floors.push(this.genFloor(spec, i));
      this.cur = { spec, floors, fi: 0, back, stash, t: 0, got: [], kills: 0 };
      // 第六轮返工：读档回来（人在画里 / 秘境里存的档，或出来后留着那份）——接着上回打到的地方
      const pr = this.restoreProg(spec, floors);
      if (pr) { this.cur.fi = Math.max(0, Math.min(floors.length - 1, pr.fi)); this.cur.kills = pr.kills ?? 0; }
    }
    this.pre = null;
    this.placeAtEntry();
    this.quiet = this.core < 0.5; this.armed = false; this.gate = null;
    g.stand(); g.destination = null; g.gathering = null;
    p.flying = false;
    g.toast(`踏入「${spec.name}」（${TIER_NAME[spec.tier]}${spec.floors > 1 ? ` · ${spec.floors} 层` : ''}）——${THEMES[spec.theme].mood}`, 'region');
    audio.sfx('open');
    g.renderer?.resetStill();
    g.updateUI(true);
  }
  // ------------------------------------------------------------ 第六轮返工：打到哪儿随存档走
  /**
   * 存档前（Game.save 调）：人在秘境 / 画中洞天里，或刚出来、没打完的那份还留着（kept），把进度记进 ws.flags.mjProg——
   * 哪些石室清了、首领死没死、宝匣灵草古碑用没用、禁制门开没开、在第几层。不在就清掉。存档版本不升（旧档没有这一笔，照旧重新生成）
   */
  persist() {
    const g = this.game, f = g.ws.flags as Record<string, unknown>;
    const c = this.cur ?? (this.kept && g.time < this.kept.until ? this.kept.cur : null);
    if (!c || c.floors.length < c.spec.floors) {
      // 读档回来人在外头（在秘境里存的档，存的是门外那一点）、还没走回去：那份进度照「刚出来留着」算，留 KEEP 秒；到期才清
      const pr = f.mjProg as MjProg | undefined;
      if (pr?.inside) { pr.inside = false; pr.until = g.day + MijingSys.KEEP / 240; return; }
      if (pr && g.day <= (pr.until ?? -1)) return;
      delete f.mjProg; return;
    }
    const idx = <T,>(a: T[], ok: (x: T) => boolean) => a.reduce<number[]>((o, x, i) => { if (ok(x)) o.push(i); return o; }, []);
    const prog: MjProg = {
      key: this.keyOf(c.spec), fi: c.fi, kills: c.kills, inside: !!this.cur,
      // 出来了、留着的那份：留到哪一天（KEEP 秒按昼夜 240 秒一日折成日子）
      until: this.cur ? undefined : g.day + Math.max(0, this.kept!.until - g.time) / 240,
      fl: c.floors.map((F) => ({ c: idx(F.rooms, (r) => r.cleared), u: idx(F.objs, (o) => !!o.used), o: idx(F.objs, (o) => !!o.open), b: F.bossDead ? 1 : 0 })),
    };
    f.mjProg = prog;
  }
  /** 新生成的秘境按存档里的进度还原（同一个秘境、存档时人在里面，或留着的那份还没到期）；还原了返回 true */
  private restoreProg(spec: MjSpec, floors: MjFloor[]): MjProg | null {
    const g = this.game, f = g.ws.flags as { mjProg?: MjProg };
    const pr = f.mjProg;
    if (!pr || pr.key !== this.keyOf(spec) || (!pr.inside && !(g.day <= (pr.until ?? -1))) || pr.fl.length !== floors.length) return null;
    pr.fl.forEach((q, i) => {
      const F = floors[i];
      for (const k of q.c) { const r = F.rooms[k]; if (r) { r.entered = true; r.cleared = true; } }
      for (const k of q.u) { const o = F.objs[k]; if (o) o.used = true; }
      for (const k of q.o) { const o = F.objs[k]; if (o && o.kind === 'door') { o.open = true; for (const ci of o.cells ?? []) F.cells[ci] = 1; } }
      if (q.b) { F.bossDead = true; for (const r of F.rooms) if (r.kind === 'boss') { r.entered = true; r.cleared = true; for (const o of F.objs) if (o.room === r.i) o.hidden = false; } }
      F.chunks.clear();
    });
    return pr;
  }
  private placeAtEntry() {
    const g = this.game, p = g.player, F = this.floor!;
    const c = this.roomC(F.rooms[0]);
    // 落在入口古阵的阵心（云门的门心）：出来的那一刻两边都裹在云里，往外走云才散
    const arr = F.isles ? F.objs.find((o) => o.kind === 'exit' && o.room === 0) : null;
    p.x = arr ? arr.x : c.x; p.y = arr ? arr.y + 6 : c.y + CELL; p.st.x = p.x; p.st.y = p.y; p.st.strands.clear(); p.st.springs.clear();
    g.cam.x = p.x; g.cam.y = p.y;
    if (this.spot) this.spot = { x: p.x, y: p.y };   // 门洞那团云跟着换到这一边的门心（换场那一帧人仍裹在云里）
    this.lastOk = { x: p.x, y: p.y }; this.lastLand = { x: p.x, y: p.y };
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
    delete (g.ws.flags as { mjProg?: MjProg }).mjProg;   // 第六轮返工：存档里的进度作废（没打完留着的那份，下回存档时由 persist 从 kept 重记）
    if (why === 'exit') {
      // 外面那道门还在：没打完的，秘境留一阵，从这道门回去接着打；打完了的只是一团散去的云
      if (!done) this.kept = { cur, key: this.keyOf(sp), until: g.time + MijingSys.KEEP };
      this.gate = { x: cur.back.x, y: cur.back.y, spec: done ? null : sp, until: g.time + (done ? 30 : MijingSys.KEEP) }; this.armed = false;
    } else { this.gate = null; this.kept = null; this.setCore(0, null); this.veilWant = 0; }
    p.x = cur.back.x; p.y = cur.back.y; p.st.x = p.x; p.st.y = p.y; p.flying = cur.back.flying; p.st.strands.clear(); p.st.springs.clear();
    g.cam.x = p.x; g.cam.y = p.y;
    if (this.spot) this.spot = { x: p.x, y: p.y };   // 门洞那团云跟着换到外面的门心
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
    if (why !== 'down' && !this.kept) {
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
    const pts = shuffleWith((r.spots.E ?? []).slice(), R);
    // 放大后的石台：妖物分成两三群，各守一处，不再绕着台心站成一圈
    const K = mjSize(sp), herd = K >= 1.5 ? pts.slice(0, 3) : null;
    const put = (e: Enemy, k: number, n: number) => {
      const sp = e.boss && r.spots.B?.length ? r.spots.B[0] : herd ? null : pts.shift();
      let x: number, y: number;
      if (!sp && herd && herd.length && !(e.boss && r.spots.B?.length)) {
        const G = n >= 6 ? 3 : n >= 4 ? 2 : 1, q = herd[k % Math.min(G, herd.length)], an = R() * TAU, rr = CELL * (0.8 + R() * 2.4);
        x = REALM_OX + (q[0] + 0.5) * CELL + Math.cos(an) * rr; y = REALM_OY + (q[1] + 0.6) * CELL + Math.sin(an) * rr * 0.7;
      }
      else if (sp) { x = REALM_OX + (sp[0] + 0.5) * CELL; y = REALM_OY + (sp[1] + 0.6) * CELL; }
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
      const nAdd = Math.round((sp.tier + Math.floor(R() * 2)) * (K >= 1.5 ? 1.6 : 1));
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
    // 样板大小是每台三四只；放大后每台六到十二只（宝库、药圃少些），大台上另有一只带词缀的精英游荡
    const n0 = (r.kind === 'treasure' ? 2 : r.kind === 'herb' ? 2 : 3) + Math.floor(R() * (1 + sp.tier)) + (sp.tier === 3 ? 1 : 0);
    const n = K >= 1.5 ? Math.min(14, Math.round(n0 * (1.4 + K * 0.35))) : n0;
    for (let k = 0; k < n; k++) { const f = this.pickFoe(lv, sp.theme, R); if (f) put(new Enemy(f.def, 0, 0, f.realm, f.stage), k, n); }
    if (K >= 3 && r.kind === 'hall') {
      const f = this.pickFoe(lv + 1, sp.theme, R);
      if (f) { const e = new Enemy(f.def, 0, 0, f.realm, f.stage); rollAffix(e, 4, 1 + (sp.tier === 3 ? 1 : 0)); put(e, n, n + 1); }
    }
    void F;
  }

  // ------------------------------------------------------------ 每帧（秘境里）
  /** 因为离主角太远被清出战斗的秘境妖物（人回来再放回去；见 update 里判石室清空那段） */
  private away = new WeakSet<object>();
  update(dt: number) {
    const g = this.game, cur = this.cur, p = g.player;
    if (!cur) { this.worldTick(dt); return; }
    cur.t += dt;
    const F = this.floor!;
    // 主角：站着只能在石台和石桥上；飞着可以越过台沿，飞不出界壁。敌人、同行者留在石台上
    if (this.walk(p.x, p.y)) { this.lastOk = { x: p.x, y: p.y }; this.lastLand = { x: p.x, y: p.y }; }
    else if (p.flying && F.bound && this.inBound(p.x, p.y)) this.lastOk = { x: p.x, y: p.y };
    else if (p.flying && F.bound) { p.x = this.lastOk.x; p.y = this.lastOk.y; p.st.x = p.x; p.st.y = p.y; }
    else { const q = F.bound ? this.lastLand : this.lastOk; p.x = q.x; p.y = q.y; p.st.x = p.x; p.st.y = p.y; this.lastOk = { x: q.x, y: q.y }; }
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
      // 总审：秘境放大后一个首领台就比「离主角 5000 以外的敌人清出战斗」那条线大——把首领惊醒再飞远，它被清出战斗，
      // 原来就按「不在战斗里＝没了」算成伏诛、掉装备；巡一圈回来，石室里的妖物也少了一大半。
      // 现在：因为离得远被清出去的照样算活着（睡在原地），人回到四千以内就放回战斗里；只有不在战斗里、人又在近前的（逃走、被收服）才算没了
      const alive = rr.foes.filter((e) => {
        if (e.dead || e.gone || !(e.aggro || !e.team?.startsWith('mj:rival'))) return false;
        if (g.combat.enemies.includes(e)) return true;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > 4500) { this.away.add(e); return true; }          // 离得远被清出去的：记一笔，睡在原地
        if (!this.away.has(e)) return false;                       // 人在近前它却不在战斗里：逃了、被收了，照旧算没了
        if (d < 4200) { this.away.delete(e); g.combat.enemies.push(e); }
        return true;
      });
      if (alive.length === 0) {
        rr.cleared = true;
        cur.kills += rr.foes.filter((e) => e.dead).length;
        if (rr.kind === 'boss') {
          F.bossDead = true;
          for (const o of F.objs) if (o.room === rr.i) o.hidden = false;
          g.toast(cur.fi < cur.spec.floors - 1 ? '守关妖物伏诛，通往下一层的古阵亮了起来。' : '首领伏诛！石室深处的宝匣与出口的古阵同时亮起。', 'good');
          g.combat.impact(this.roomC(rr).x, this.roomC(rr).y, 3, '255,230,160');
          // 收官 C（甲）：首领掉一件装备（按秘境种子定是哪件，不多取随机数；词条在 addItem 的装备分支里摇）
          if (cur.fi === cur.spec.floors - 1) { const gid = gearDropId(cur.spec.seed + cur.kills, Math.floor(cur.spec.lv / 2) + cur.spec.tier - 1); C.addItem(g.hero, gid, 1); g.toast(`首领身上掉下一件「${itemDef(gid).name}」，已收进储物袋。`, 'good'); g.huajuan?.onBossDown(cur.spec);
            // 近战兵器线：首领另有四成机会掉一件兵器（自己的哈希，词条也用自己的种子摇——上面那件装备和后面的随机数都不受影响）
            const wd = weaponDrop(cur.spec.seed * 31 + cur.kills, Math.floor(cur.spec.lv / 2) + cur.spec.tier - 1, 0.4); if (wd) { C.addGearItem(g.hero, wd.id, wd.affix); g.toast(`首领的兵器也落在了地上：「${itemDef(wd.id).name}」，已收进储物袋。`, 'good'); } }   // 收官 P8（丁）：古画（按秘境种子定掉不掉，不取随机数）
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
    // 云门：离最近的一座古阵（没亮的不算）多远，云就多浓；走到阵心、云已遮满，就换到另一边
    {
      let best: MjObj | null = null, bd = 1e9;
      for (const o of F.objs) { if (o.hidden || (o.kind !== 'exit' && o.kind !== 'stairs')) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < bd) { bd = d; best = o; } this.gateFx(o.x, o.y, dt); }
      if (!F.isles) best = null;   // 旧的迷宫式仍按 T 出入
      if (!this.armed && bd > MijingSys.GATE_R * 0.8) this.armed = true;
      if (this.armed) this.quiet = false;
      this.veilTick(dt, best && !this.quiet ? this.veilAt(bd) : 0, best);
      // 换场：人到了门心、门洞里那团云已把人裹住（整屏只是一层薄雾）
      if (best && this.armed && bd < MijingSys.GATE_CORE && this.core > 0.94) {
        if (best.kind === 'stairs' && cur.fi < cur.floors.length - 1) {
          cur.fi++;
          g.combat.enemies = g.combat.enemies.filter((e) => e.dead); g.combat.projs = []; g.combat.fields = [];
          this.placeAtEntry(); this.armed = false;
          g.toast(`穿过古阵的云气——「${cur.spec.name}」第 ${cur.fi + 1} 层。`, 'region'); audio.sfx('whoosh');
          g.renderer?.resetStill();
        } else { this.leave('exit'); return; }
      }
    }
    this.hint -= dt;
    if (this.hint <= 0 && cur.t > 2 && cur.t < 3) { this.hint = 99; g.hint('mijing', '提示：秘境里走进新的石室才会惊动其中的妖物；宝箱、灵草、古碑、禁制门走近按 T。古阵裹着的那团云气就是门：走进阵心便出秘境（没打完的，一阵子内从原路回来还能接着打）；首领伏诛后出口亮起。'); }
  }
  /** T：宝箱 / 灵草 / 古碑 / 禁制门 / 出口 / 阶梯 */
  interact(): boolean {
    const o = this.focus, g = this.game, h = g.hero, cur = this.cur;
    if (!o || !cur) return false;
    const sp = cur.spec;
    const tierLoot = clamp(Math.max(1, sp.lv / 2.5) + (sp.tier - 1) * 0.6, 1, 5);
    switch (o.kind) {
      case 'chest': {
        o.used = true;
        const got = loot(g, Math.round(tierLoot), 1 + (o.tier ?? 1) * 0.3, { scroll: 0.3 + sp.tier * 0.1, art: 0.08 + sp.tier * 0.08, map: 0.06 });
        if (Math.random() < 0.25 + sp.tier * 0.1) { const zt = g.zhenfa?.ruinScroll?.(); if (zt) { C.addItem(h, zt, 1); got.push(itemDef(zt).name); } }
        if ((o.tier ?? 1) >= 3 && Math.random() < 0.5) { const a = pickArt(Math.round(tierLoot) + 1, sp.tier === 3 && Math.random() < 0.3); if (a) { C.addItem(h, a, 1); got.push(`【${itemDef(a).name}】`); } }
        cur.got.push(...got);
        g.combat.impact(o.x, o.y, 1, '255,230,160'); audio.sfx('chime');
        g.toast(`开启宝匣：${got.join('、')}`, 'good');
        return true;
      }
      case 'herb': {
        o.used = true;
        const pool = ['herb_lingzhi', 'herb_jinxin', 'herb_xuelian', 'herb_zihou', 'herb_tianling', 'herb_huolong', 'herb_bingpo', 'herb_xuejing', 'herb_yangshen'].filter((id) => itemDef(id).tier <= tierLoot + 1);
        const id = pool[Math.floor(Math.random() * pool.length)] ?? 'herb_lingzhi';
        const age = Math.round((60 + Math.random() * 140) * (1 + sp.tier * 0.8));
        const cnt = Math.max(2, Math.min(8, Math.round(age / 60)));   // v0.70：灵草只看数量
        C.addItem(h, id, cnt); cur.got.push(`${itemDef(id).name}×${cnt}`);
        g.toast(`采得${itemDef(id).name} ×${cnt}。秘境灵气浓郁，灵草长得远比外头茂盛。`, 'good'); audio.sfx('gather');
        return true;
      }
      case 'stele': {
        o.used = true;
        const exp = C.need(h) * (0.004 + sp.tier * 0.003);
        const got = C.wuTake ? C.wuTake(h, exp) : 0; h.exp += got;
        g.zhenfa?.gainXp?.(3);
        g.openDialog({ speaker: '古碑', title: sp.name, mood: 'mystic', text: `碑上的字迹大半剥落，只剩几行还能辨认——\n\n${STELE[Math.floor(Math.random() * STELE.length)]}\n\n你对着残碑参悟良久，若有所得。（修为 +${Math.round(got)}，阵道 +3）`, options: [{ label: '收回心神', act: () => null }] });
        return true;
      }
      case 'door': {
        const name = `${sp.name} · 禁制`;
        g.openDialog({ speaker: '禁制', title: '石门上灵光流转', mood: 'mystic', text: '一道光幕封住了甬道，光幕里五色阵眼明灭不定。后面隐约有宝光。', options: [
          { label: '推演破禁（破禁之局）', tone: 'gold', act: () => { g.zhenfa.openPuzzle(name, o.tier ?? 1, (ok) => { if (ok) this.openDoor(o); else g.toast('禁制合拢——可再试一次。', 'info'); }); return null; } },
          { label: `以破禁符强破（剩 ${C.bagCount(h, 'tal_pojin')}）`, disabled: C.bagCount(h, 'tal_pojin') <= 0, act: () => { C.removeItem(h, 'tal_pojin', 1); if (Math.random() < 0.8) this.openDoor(o); else { h.hp = Math.max(0.05, h.hp - 0.15); g.toast('破禁符化作飞灰，禁制反震——没破开。', 'warn'); } return null; } },
          { label: '离开', act: () => null },
        ] });
        return true;
      }
      case 'stairs': {
        if (cur.fi >= cur.floors.length - 1) return false;
        if (this.floor!.isles) { g.toast('古阵上云气翻涌——走进阵心，便到下一层。', 'info'); return true; }
        cur.fi++;
        g.combat.enemies = g.combat.enemies.filter((e) => e.dead); g.combat.projs = []; g.combat.fields = [];
        this.placeAtEntry();
        g.toast(`踏上古阵——「${sp.name}」第 ${cur.fi + 1} 层。`, 'region'); audio.sfx('whoosh');
        g.renderer?.resetStill();
        return true;
      }
      case 'exit': {
        const F = this.floor!, boss = F.rooms.find((r) => r.kind === 'boss');
        if (F.isles) { g.toast(boss && !F.bossDead ? '古阵上的云气就是门：走进阵心便出秘境。首领未除——一阵子内从外面那道云门回来，还能接着打。' : '古阵上的云气就是门：走进阵心便出秘境。', 'info'); return true; }
        g.openDialog({ speaker: sp.name, title: o.room === 0 ? '入口古阵' : '出口古阵', text: o.room === 0 && boss && !F.bossDead ? '古阵还能把你送回入口外头。此时退出，没搜检的石室就白白留给别人了。' : '古阵灵光大盛，随时可以离开。', options: [
          { label: '离开秘境', tone: 'gold', act: () => { this.leave('exit'); return null; } },
          { label: '再看看', act: () => null },
        ] });
        return true;
      }
    }
    return false;
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
    {
      const G = this.gate;
      if (G) {
        const d = Math.hypot(p.x - G.x, p.y - G.y);
        this.gateFx(G.x, G.y, dt);
        if (!this.armed && d > MijingSys.GATE_R * 0.8) this.armed = true;
        this.veilTick(dt, this.veilAt(d), G);
        if (G.spec && this.armed && d < MijingSys.GATE_R) this.warm(G.spec);   // 第五轮返工：人往门里走的这一两秒，把里面备好
        if (G.spec && this.armed && d < MijingSys.GATE_CORE && this.core > 0.94 && !g.offWorld && !g.xukong.active) { this.enter(G.spec); return; }
        if (d > MijingSys.GATE_R && (!G.spec || g.time > G.until)) this.gate = null;
        if (this.kept && g.time > this.kept.until) { this.kept = null; if (this.gate?.spec) this.gate.spec = null; }
      } else this.veilTick(dt, 0);
    }
    this.entFocus = null; this.entFocusD = 1e9;
    if (!MIJING_ON) return;
    for (const m of MIJING) {
      const l = m.loc ? LOC_BY_ID.get(m.loc) : null; if (!l || (l.map ?? 'tiannan') !== ACTIVE_MAP) continue;
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
    this.openGate({ name, tier: 1, theme: s.zone === 'cold' ? 'ice' : s.zone === 'demon' ? 'tomb' : 'cave', seed: s.seed, floors: 1, rooms: 3 + Math.min(3, s.tier + 1), lv, siteKey: s.key });
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
        { label: '进入秘境', tone: 'gold', act: () => { this.openGate({ name: e.name, tier: e.tier, theme: e.theme, seed: e.seed, floors: 1, rooms: 4 + ((e.seed >>> 3) % 3), lv: e.lv, entKey: e.key }); return null; } },
        { label: '暂且不去', act: () => null },
      ] };
    }
    const m = f.def, op = mjOpen(m, g.day), cd = this.S.cd[m.id] ?? -1;
    const lvOk = h.realm >= m.realmMin && h.realm <= m.realmMax;
    const why = !op.open ? `禁制未开（约 ${Math.ceil(op.days / 360 * 10) / 10} 年后开启）` : !lvOk ? (h.realm > m.realmMax ? `${REALMS[m.realmMax].name}以上的修士进不去（禁制所限）` : `需${REALMS[m.realmMin].name}期`) : g.day < cd ? `首领新除，秘境尚未复原（约 ${Math.ceil(cd - g.day)} 日）` : '';
    const party = g.npcs.followers().length;
    return { speaker: m.name, title: `${TIER_NAME[m.tier]}${m.period ? (op.open ? ` · 开启中（还剩 ${op.days} 日）` : ' · 未开') : ''}`, mood: 'mystic', text: `${m.desc}\n\n${THEMES[m.theme].mood}${party ? `\n\n同行 ${party} 人随你一同进去。` : '\n\n孤身入内凶险，可先去友人录邀人同行。'}`, options: [
      { label: `进入「${m.name}」`, tone: 'gold', disabled: !!why, hint: why, act: () => { this.openGate({ name: m.name, tier: m.tier, theme: m.theme, seed: ((g.day / 30) | 0) * 131 + m.id.length * 7919, floors: m.floors, rooms: m.rooms, lv: clamp(Math.max(lvOf(h.realm, h.stage), lvOf(m.realmMin, 0)), 1, 10), def: m, boss: m.boss }); return null; } },
      { label: '离开', act: () => null },
    ] };
  }
  interactWorld(): boolean { const n = this.entNode(); if (!n) return false; this.game.openDialog(n); return true; }
  marks(): { x: number; y: number; glyph: string; color: string; name: string }[] {
    const g = this.game, out: { x: number; y: number; glyph: string; color: string; name: string }[] = [];
    if (!MIJING_ON) return out;
    for (const e of this.S.ents) if (!e.done && e.map === ACTIVE_MAP) out.push({ x: e.x, y: e.y, glyph: e.src === 'rumor' ? '秘？' : '秘', color: '#c8a0ff', name: e.src === 'rumor' ? `传闻·${e.name}（真假未知）` : `${e.name}（友人相约）` });
    for (const m of MIJING) { const l = m.loc ? LOC_BY_ID.get(m.loc) : null; if (!l || (l.map ?? 'tiannan') !== ACTIVE_MAP) continue; const op = mjOpen(m, g.day); out.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE + 260, glyph: m.tier === 3 ? '境' : '秘', color: m.tier === 3 ? (op.open ? '#ffd070' : '#a89070') : '#b8a0e0', name: `${TIER_NAME[m.tier]}·${m.name}${m.period ? (op.open ? '（开启中）' : '（未开）') : ''}` }); }
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
      const l = m.loc ? LOC_BY_ID.get(m.loc) : null; if (!l || (l.map ?? 'tiannan') !== ACTIVE_MAP) continue;
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE + 260, op = mjOpen(m, g.day).open;
      const f = this.entFocus?.kind === 'def' && this.entFocus.def === m;
      one(x, y, m.tier === 3 ? 'v:entrance_big' : 'v:entrance_mid', m.tier === 3 ? '255,210,120' : '190,160,255', `${m.name}${keyNote('interact')}`, f, op, m.tier === 3 ? 420 : 340);
    }
    for (const e of this.S.ents) {
      if (e.done || e.map !== ACTIVE_MAP) continue;
      const near = Math.hypot(e.x - g.player.x, e.y - g.player.y) < g.senseRadius;
      if (!near) continue;
      if (e.fake) continue;   // 假的：到了才知道
      one(e.x, e.y, 'v:entrance_small', '190,160,255', `${e.name}${keyNote('interact')}`, this.entFocus?.kind === 'ent' && this.entFocus.ent === e, true, 300);
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
    if (!this.floorImg || this.floorKey !== T.floor) { const im = new Image(); im.src = GROUND_SRC[T.floor]; this.floorImg = im; this.floorKey = T.floor; }
    const im = this.floorImg;
    if (!im.complete || !im.naturalWidth) return T.face;
    const P = c.createPattern(im, 'repeat'); if (!P) return T.face;
    try { P.setTransform(new DOMMatrix().scale(1.3)); } catch { /* */ }
    return P;
  }
  /** 预烘焙一块底图：地面 + 岩体顶面 + 墙的立面 */
  private chunk(F: MjFloor, ix: number, iy: number): HTMLCanvasElement | null {
    const key = iy * 4096 + ix;
    if (F.chunks.has(key)) return F.chunks.get(key)!;
    if (typeof document === 'undefined') return null;
    const T = THEMES[this.cur!.spec.theme];
    const cv = document.createElement('canvas'); cv.width = Math.ceil(CH * CHS); cv.height = Math.ceil(CH * CHS);
    const c = cv.getContext('2d')!;
    const th = this.cur!.spec.theme;
    // 秘境画材还在解码：开局三息内宁可晚一帧烘，免得把代码画的底图永久烘进缓存
    const artOk = !!v53('floor_' + th) && !!v53('rock_' + th) && !!v53('wall_' + th);
    if (!artOk && this.cur!.t < 3) { warm53(['floor_' + th, 'rock_' + th, 'wall_' + th, 'liquid_' + LIQ[th]]); return null; }
    const pat = this.floorPattern(c);
    if (typeof pat === 'string' && !this.floorImg?.complete) return null;   // 地面图还没解码：下帧再烘
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
  drawFloor(c: G, view: { left: number; top: number; right: number; bottom: number }, all = false) {
    const F = this.floor; if (!F) return;
    const T = THEMES[this.cur!.spec.theme];
    c.fillStyle = T.rock; c.fillRect(view.left - 10, view.top - 10, view.right - view.left + 20, view.bottom - view.top + 20);
    const lx = view.left - REALM_OX, ty = view.top - REALM_OY, rx = view.right - REALM_OX, by = view.bottom - REALM_OY;
    let built = 0;
    for (let iy = Math.floor(ty / CH); iy <= Math.floor(by / CH); iy++) for (let ix = Math.floor(lx / CH); ix <= Math.floor(rx / CH); ix++) {
      if (ix < 0 || iy < 0 || ix * CH > F.gw * CELL || iy * CH > F.gh * CELL + FACE) continue;
      const key = iy * 4096 + ix;
      if (!F.chunks.has(key) && built >= 2 && !all) continue;
      if (!F.chunks.has(key)) built++;
      const cv = this.chunk(F, ix, iy);
      if (cv) c.drawImage(cv, REALM_OX + ix * CH - 0.5, REALM_OY + iy * CH - 0.5, CH + 1, CH + 1);
    }
  }
  /**
   * B 版立体画面：秘境是一座座悬在云雾里的石台，没有墙。这里只把石台中间的石墩（被地面围住的实心格子）立成矮石块，
   * 交给立体建筑去建。坐标以秘境原点为准，单位是地点布局的单位（世界单位 / LOC_SCALE）。
   */
  wallLayout(face: string, rock: string): LocLayout | null {
    const F = this.floor; if (!F) return null;
    const { gw, gh, cells } = F, K = 1 / LOC_SCALE;
    if (F.pillars) {
      // 石台群：台上的石柱（柱身一截、柱头一截）
      const pieces: LocLayout['pieces'] = [];
      const swords = MJ_SHAPE[this.cur?.spec.theme ?? 'cave'] === 3;
      for (const q of F.pillars) {
        const x = (q.cx + 0.5) * CELL * K, y = (q.cy + 0.5) * CELL * K, w = q.gold ? 96 : 74, sd = q.cx * 131 + q.cy;
        if (swords && !q.gold) {
          // 剑冢：一柄剑尖朝下插在石面上的巨剑——露在外面的是剑身、剑格、剑柄、剑首（一截截摞起来）
          const H = q.h * 2.6 + 160, flip = (sd & 1) === 1, bw = flip ? 22 : 84, bd = flip ? 84 : 22;
          pieces.push({ kind: 'box', x, y, seed: sd, p: { w: 150, d: 150, h: 16, col: '#34363e' } });
          pieces.push({ kind: 'box', x, y, seed: sd + 1, p: { w: bw, d: bd, h: H * 0.66, col: '#8d94a2' } });
          pieces.push({ kind: 'box', x, y, seed: sd + 2, p: { w: flip ? 34 : 250, d: flip ? 250 : 34, h: 26, y0: H * 0.66, col: '#5f5a4c', cap: '#8a7a4e' } });
          pieces.push({ kind: 'box', x, y, seed: sd + 3, p: { w: 30, d: 30, h: H * 0.22, y0: H * 0.66 + 26, col: '#3a3430' } });
          pieces.push({ kind: 'box', x, y, seed: sd + 4, p: { w: 52, d: 52, h: 40, y0: H * 0.88 + 26, col: '#8a7a4e' } });
          continue;
        }
        pieces.push({ kind: 'box', x, y, seed: sd, p: { w: w + 26, d: w + 26, h: 26, col: rock } });
        pieces.push({ kind: 'box', x, y, seed: sd + 1, p: { w, d: w, h: q.h, col: face, cap: q.gold ? '#c9a24a' : rock } });
        if (q.gold) {
          // 盘龙柱：一条鎏金的龙绕着柱身盘上去（一节节错开的小块），柱顶探出龙首
          const turns = 2.6, n = Math.max(14, Math.round(q.h / 34));
          for (let i = 0; i < n; i++) {
            const k = i / (n - 1), a = k * turns * TAU + (sd % 7), ox = Math.cos(a) * (w / 2 + 6) * K, oy = Math.sin(a) * (w / 2 + 6) * K, t = 26 - k * 8;
            pieces.push({ kind: 'box', x: x + ox, y: y + oy, seed: sd + 10 + i, p: { w: t, d: t, h: q.h / n * 1.5, y0: 30 + k * (q.h - 60), col: i % 2 ? '#c9a24a' : '#b08a38' } });
          }
          const a = turns * TAU + (sd % 7);
          pieces.push({ kind: 'box', x: x + Math.cos(a) * (w / 2 + 22) * K, y: y + Math.sin(a) * (w / 2 + 22) * K, seed: sd + 9, p: { w: 44, d: 44, h: 34, y0: q.h - 24, col: '#d8b24e', cap: '#f0d880' } });
        }
      }
      return { id: 'mj', pieces, ground: [], gw: gw * CELL * K, gh: gh * CELL * K, blocks: [], lights: [], pal: { roof: rock, wall: face, pillar: face, trim: rock, stone: rock, accent: rock, ground: rock }, smoke: [], flags: [] };
    }
    // 从图边往里灌：灌得到的实心格子是「外面」（虚空），灌不到的是石台中间的石墩
    const outside = new Uint8Array(gw * gh), stack: number[] = [];
    const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= gw || y >= gh) return; const i = y * gw + x; if (cells[i] !== 0 || outside[i]) return; outside[i] = 1; stack.push(i); };
    for (let x = 0; x < gw; x++) { push(x, 0); push(x, gh - 1); }
    for (let y = 0; y < gh; y++) { push(0, y); push(gw - 1, y); }
    while (stack.length) { const i = stack.pop()!, x = i % gw, y = (i / gw) | 0; push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1); }
    this.outsideMask = outside;
    const pieces: LocLayout['pieces'] = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw;) {
      if (cells[y * gw + x] !== 0 || outside[y * gw + x]) { x++; continue; }
      let n = 1; while (x + n < gw && n < 6 && cells[y * gw + x + n] === 0 && !outside[y * gw + x + n]) n++;
      const h = 46 + 26 * (((x * 7919 + y * 104729) >>> 0) % 100) / 100;
      pieces.push({ kind: 'box', x: (x + n / 2) * CELL * K, y: (y + 0.5) * CELL * K, seed: x * 131 + y, p: { w: n * CELL - 10, d: CELL - 10, h, col: face, cap: rock } });
      x += n;
    }
    return { id: 'mj', pieces, ground: [], gw: gw * CELL * K, gh: gh * CELL * K, blocks: [], lights: [], pal: { roof: rock, wall: face, pillar: face, trim: rock, stone: rock, accent: rock, ground: rock }, smoke: [], flags: [] };
  }
  private outsideMask: Uint8Array | null = null;
  /**
   * 石台群的台面：只画石台和石桥（水墨石板、台边墨线、台心的阵纹），其余地方留透明——那里没有地面，
   * 从台沿望下去是立体场景里的台底岩体和云海（hd2d/realm.ts）。
   */
  private drawIslesHD(c: G, F: MjFloor, x0w: number, y0w: number, x1w: number, y1w: number, stone: HTMLCanvasElement | null, tint: string) {
    c.clearRect(x0w - 4, y0w - 4, x1w - x0w + 8, y1w - y0w + 8);
    const th = this.cur?.spec.theme ?? 'cave';
    const pat = stone ? c.createPattern(stone, 'repeat') : null;
    if (pat) { try { pat.setTransform(new DOMMatrix().scale(560 / stone!.width)); } catch { /* */ } }
    const near = (x: number, y: number, r: number) => x + r > x0w && x - r < x1w && y + r > y0w && y - r < y1w;
    c.lineJoin = 'round'; c.lineCap = 'butt';
    // 石桥：一条石板路，两边各一道墨线
    for (const b of F.bridges ?? []) {
      if (!near((b.ax + b.bx) / 2, (b.ay + b.by) / 2, Math.hypot(b.bx - b.ax, b.by - b.ay) / 2 + b.w)) continue;
      const dx = b.bx - b.ax, dy = b.by - b.ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len * b.w / 2, ny = dx / len * b.w / 2;
      c.beginPath(); c.moveTo(b.ax + nx, b.ay + ny); c.lineTo(b.bx + nx, b.by + ny); c.lineTo(b.bx - nx, b.by - ny); c.lineTo(b.ax - nx, b.ay - ny); c.closePath();
      c.fillStyle = pat ?? '#cfcabb'; c.fill(); c.fillStyle = 'rgba(80,84,78,0.16)'; c.fill();
      c.strokeStyle = 'rgba(40,42,36,0.75)'; c.lineWidth = 3.4;
      c.beginPath(); c.moveTo(b.ax + nx, b.ay + ny); c.lineTo(b.bx + nx, b.by + ny); c.moveTo(b.ax - nx, b.ay - ny); c.lineTo(b.bx - nx, b.by - ny); c.stroke();
      // 桥栏的望柱：两边每隔一段一个小墨点
      c.fillStyle = 'rgba(52,54,48,0.7)';
      for (let d = 80; d < len - 40; d += 150) for (const sd of [-1, 1]) { c.beginPath(); c.arc(b.ax + dx / len * d + nx * sd * 0.9, b.ay + dy / len * d + ny * sd * 0.9, 7, 0, TAU); c.fill(); }
    }
    for (const s of F.isles ?? []) {
      if (!near(s.x, s.y, s.r + 20)) continue;
      const edge = (_round: boolean, r: number, a: number) => isleEdge(s.round, r, a, s.shape, s.seed);
      const wild = s.shape === 2, shard = s.shape === 3 || (MJ_SHAPE[th] === 3 && s.kind === 'boss'), boss = s.kind === 'boss';
      const N = wild || s.shape === 3 ? 192 : 96;
      const path = () => { c.beginPath(); for (let i = 0; i <= N; i++) { const a = i / N * TAU, r = edge(s.round, s.r, a); if (i) c.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); else c.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); } c.closePath(); };
      const hs = (k: number) => { const q = Math.sin(s.seed * 12.9898 + k * 78.233) * 43758.5453; return q - Math.floor(q); };
      if (wild) {
        // 自然浮岛：一片草甸（深浅草斑按种子撒），台心留一块铺石的坪，阵纹刻在石坪上
        // 收官 P8（丁）：画中山水（shanshui）的浮岛不是草甸，是留白的纸色上几点淡墨苔痕
        const ss = th === 'shanshui';
        path(); c.fillStyle = ss ? '#d9d4c3' : '#93a878'; c.fill();
        c.save(); path(); c.clip();
        const nB = Math.min(320, Math.round(s.r * s.r / 46000));
        for (let k = 0; k < nB; k++) {
          const a = hs(k) * TAU, d = Math.sqrt(hs(k + 500)) * s.r * 0.98, rr = s.r * (0.035 + hs(k + 900) * 0.085), x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d;
          if (!near(x, y, rr)) continue;
          c.fillStyle = ss ? (hs(k + 1300) < 0.5 ? 'rgba(46,48,44,0.14)' : 'rgba(244,240,228,0.32)') : hs(k + 1300) < 0.5 ? 'rgba(66,100,54,0.22)' : 'rgba(184,202,124,0.2)';
          c.beginPath(); c.ellipse(x, y, rr, rr * 0.62, hs(k + 77) * 3, 0, TAU); c.fill();
        }
        // 台沿一圈裸露的土石
        c.strokeStyle = 'rgba(92,78,52,0.42)'; c.lineWidth = 70; path(); c.stroke();
        c.strokeStyle = 'rgba(60,52,36,0.3)'; c.lineWidth = 16; path(); c.stroke();
        const Rp = s.r * (boss ? 0.68 : 0.5);
        c.beginPath(); c.arc(s.x, s.y, Rp, 0, TAU); c.fillStyle = pat ?? '#cfcabb'; c.fill(); c.fillStyle = ss ? 'rgba(236,232,220,0.22)' : 'rgba(96,118,74,0.16)'; c.fill();
        c.strokeStyle = 'rgba(58,66,46,0.55)'; c.lineWidth = 6; c.beginPath(); c.arc(s.x, s.y, Rp, 0, TAU); c.stroke();
      } else {
        path(); c.fillStyle = pat ?? '#cfcabb'; c.fill();
        c.fillStyle = tint; c.fill();
        c.save(); path(); c.clip();
        if (shard) {
          // 剑冢：石面压暗，裂缝里透出下面深渊的光（古墓幽蓝、赤霄禁地暗红）
          c.fillStyle = th === 'blood' ? 'rgba(40,18,18,0.5)' : 'rgba(22,26,40,0.52)'; path(); c.fill();
          const glow = th === 'blood' ? '255,96,72' : '150,180,255', nC = Math.min(70, Math.round(s.r / 70));
          c.lineCap = 'round'; c.lineJoin = 'round';
          for (let k = 0; k < nC; k++) {
            let a = hs(k * 3) * TAU, d = s.r * (0.12 + hs(k * 3 + 1) * 0.8), x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d, dir = hs(k * 3 + 2) * TAU;
            if (!near(x, y, 900)) continue;
            c.beginPath(); c.moveTo(x, y);
            for (let j = 0; j < 7; j++) { dir += (hs(k * 31 + j) - 0.5) * 1.5; const L = 60 + hs(k * 17 + j) * 150; x += Math.cos(dir) * L; y += Math.sin(dir) * L; c.lineTo(x, y); }
            c.strokeStyle = `rgba(${glow},0.26)`; c.lineWidth = 26; c.stroke();
            c.strokeStyle = `rgba(${glow},0.9)`; c.lineWidth = 6; c.stroke();
            c.strokeStyle = 'rgba(8,8,12,0.75)'; c.lineWidth = 1.4; c.stroke();
          }
          c.lineCap = 'butt';
        }
        // 台沿往里一圈墨晕、一圈压边的条石
        c.strokeStyle = shard ? 'rgba(10,10,16,0.34)' : 'rgba(54,56,50,0.20)'; c.lineWidth = 90; path(); c.stroke();
        c.strokeStyle = 'rgba(48,50,44,0.5)'; c.lineWidth = 2.2;
        c.beginPath(); for (let i = 0; i <= N; i++) { const a = i / N * TAU, r = edge(s.round, s.r, a) - 58; if (i) c.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); else c.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); } c.closePath(); c.stroke();
      }
      // 台心的阵纹：淡金的几圈同心环、放射的刻线；首领的祭坛是一幅八卦（剑冢里是冷白的）
      const R0 = s.r * (boss ? 0.58 : wild ? 0.4 : 0.42), gold = shard ? (th === 'blood' ? 'rgba(232,150,128,' : 'rgba(188,206,240,') : boss ? 'rgba(176,122,26,' : 'rgba(170,124,40,';
      c.lineCap = 'round';
      for (const [k, w, al] of [[1, 9, 0.7], [0.88, 4, 0.6], [0.56, 6, 0.65], [0.3, 4, 0.6]] as [number, number, number][]) { c.strokeStyle = gold + al + ')'; c.lineWidth = w; c.beginPath(); c.arc(s.x, s.y, R0 * k, 0, TAU); c.stroke(); }
      c.strokeStyle = gold + '0.6)'; c.lineWidth = 4;
      const spokes = boss ? 8 : 12;
      for (let i = 0; i < spokes; i++) { const a = i / spokes * TAU + (boss ? Math.PI / 8 : 0); c.beginPath(); c.moveTo(s.x + Math.cos(a) * R0 * 0.3, s.y + Math.sin(a) * R0 * 0.3); c.lineTo(s.x + Math.cos(a) * R0 * 0.56, s.y + Math.sin(a) * R0 * 0.56); c.stroke(); }
      if (boss) {
        // 八卦：八个方位各三道爻（有的断开），正中一幅太极
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * TAU, ca = Math.cos(a), sa = Math.sin(a);
          for (let j = 0; j < 3; j++) {
            const rr = R0 * (0.64 + j * 0.075), half = R0 * 0.13, broken = ((i * 3 + j * 5) % 7) < 3;
            c.strokeStyle = gold + '0.62)'; c.lineWidth = R0 * 0.034;
            const seg = (u0: number, u1: number) => { c.beginPath(); c.moveTo(s.x + ca * rr - sa * u0, s.y + sa * rr + ca * u0); c.lineTo(s.x + ca * rr - sa * u1, s.y + sa * rr + ca * u1); c.stroke(); };
            if (broken) { seg(-half, -half * 0.22); seg(half * 0.22, half); } else seg(-half, half);
          }
        }
        const r1 = R0 * 0.28;
        c.fillStyle = 'rgba(232,214,160,0.55)'; c.beginPath(); c.arc(s.x, s.y, r1, 0, TAU); c.fill();
        c.fillStyle = 'rgba(70,72,64,0.5)'; c.beginPath(); c.arc(s.x, s.y, r1, -Math.PI / 2, Math.PI / 2); c.arc(s.x, s.y + r1 / 2, r1 / 2, Math.PI / 2, -Math.PI / 2, true); c.arc(s.x, s.y - r1 / 2, r1 / 2, Math.PI / 2, -Math.PI / 2); c.fill();
        c.fillStyle = 'rgba(232,214,160,0.75)'; c.beginPath(); c.arc(s.x, s.y + r1 / 2, r1 * 0.12, 0, TAU); c.fill();
        c.fillStyle = 'rgba(70,72,64,0.6)'; c.beginPath(); c.arc(s.x, s.y - r1 / 2, r1 * 0.12, 0, TAU); c.fill();
      } else {
        // 八角星：两个错开的方框
        c.strokeStyle = gold + '0.62)'; c.lineWidth = 5;
        for (const off of [0, Math.PI / 4]) { c.beginPath(); for (let i = 0; i <= 4; i++) { const a = i / 4 * TAU + off; if (i) c.lineTo(s.x + Math.cos(a) * R0 * 0.86, s.y + Math.sin(a) * R0 * 0.86); else c.moveTo(s.x + Math.cos(a) * R0 * 0.86, s.y + Math.sin(a) * R0 * 0.86); } c.stroke(); }
      }
      if (s.r > 1800) {
        // 放大后的大台：台心的阵纹之外再铺一层——外圈一道条石镶边的环道、通向台沿的八条刻线、环道上一圈小阵眼，
        // 不然两三屏宽的台面只是一片石板
        const R1 = s.r * 0.74, n = boss ? 8 : 6;
        c.strokeStyle = 'rgba(60,62,54,0.16)'; c.lineWidth = s.r * 0.05; c.beginPath(); c.arc(s.x, s.y, R1, 0, TAU); c.stroke();
        for (const dr of [-0.025, 0.025]) { c.strokeStyle = 'rgba(48,50,44,0.45)'; c.lineWidth = 3; c.beginPath(); c.arc(s.x, s.y, R1 + s.r * dr, 0, TAU); c.stroke(); }
        c.strokeStyle = gold + '0.34)'; c.lineWidth = 5;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; c.beginPath(); c.moveTo(s.x + Math.cos(a) * R0 * 1.06, s.y + Math.sin(a) * R0 * 1.06); c.lineTo(s.x + Math.cos(a) * (R1 - s.r * 0.03), s.y + Math.sin(a) * (R1 - s.r * 0.03)); c.stroke(); }
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + (boss ? 0 : Math.PI / n), ex = s.x + Math.cos(a) * R1, ey = s.y + Math.sin(a) * R1, er = s.r * 0.07;
          c.fillStyle = 'rgba(226,214,180,0.5)'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill();
          c.strokeStyle = gold + '0.62)'; c.lineWidth = 5; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.stroke();
          c.lineWidth = 3; c.beginPath(); c.arc(ex, ey, er * 0.62, 0, TAU); c.stroke();
          c.beginPath(); for (let j = 0; j <= 3; j++) { const b = j / 3 * TAU + a; if (j) c.lineTo(ex + Math.cos(b) * er * 0.62, ey + Math.sin(b) * er * 0.62); else c.moveTo(ex + Math.cos(b) * er * 0.62, ey + Math.sin(b) * er * 0.62); } c.stroke();
        }
      }
      c.restore();
      path(); c.strokeStyle = 'rgba(38,40,34,0.8)'; c.lineWidth = 4; c.stroke();
    }
  }
  /**
   * B 版立体画面的地面：水墨的画法——
   *   虚空是留白的宣纸，飘着几抹淡墨的云气；石台、石桥铺水墨石板；台沿朝南的一面画出两层石壁和落在云里的淡影；
   *   台边一道墨线；水池是淡青的一汪。c 的变换已是世界坐标。
   */
  drawFloorHD(c: G, x0w: number, y0w: number, x1w: number, y1w: number, stone: HTMLCanvasElement | null, tint: string) {
    const F = this.floor; if (!F) return;
    if (F.isles) { this.drawIslesHD(c, F, x0w, y0w, x1w, y1w, stone, tint); return; }
    const { gw, gh, cells } = F;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= gw || y >= gh ? 0 : cells[y * gw + x]);
    const hs = (x: number, y: number, k: number) => { const q = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return q - Math.floor(q); };
    // 宣纸
    c.fillStyle = '#ebe6d6'; c.fillRect(x0w - 4, y0w - 4, x1w - x0w + 8, y1w - y0w + 8);
    // 云气：大团的淡墨，按世界里的格子摆（块与块之间接得上）
    const BC = 900;
    for (let by = Math.floor((y0w - 700) / BC); by <= Math.floor((y1w + 700) / BC); by++) for (let bx = Math.floor((x0w - 700) / BC); bx <= Math.floor((x1w + 700) / BC); bx++) {
      for (let k = 0; k < 2; k++) {
        const x = (bx + hs(bx, by, k + 40)) * BC, y = (by + hs(bx, by, k + 43)) * BC, r = 260 + hs(bx, by, k + 46) * 420;
        const gr = c.createRadialGradient(x, y, 0, x, y, r), dark = hs(bx, by, k + 49) < 0.5;
        gr.addColorStop(0, dark ? 'rgba(150,156,160,0.20)' : 'rgba(255,255,250,0.5)'); gr.addColorStop(1, dark ? 'rgba(150,156,160,0)' : 'rgba(255,255,250,0)');
        c.fillStyle = gr; c.save(); c.translate(x, y); c.scale(1.6, 0.6); c.translate(-x, -y); c.fillRect(x - r, y - r, r * 2, r * 2); c.restore();
      }
    }
    const cx0 = Math.floor((x0w - REALM_OX) / CELL) - 3, cy0 = Math.floor((y0w - REALM_OY) / CELL) - 4, cx1 = Math.ceil((x1w - REALM_OX) / CELL) + 3, cy1 = Math.ceil((y1w - REALM_OY) / CELL) + 2;
    const X = (x: number) => REALM_OX + x * CELL, Y = (y: number) => REALM_OY + y * CELL;
    const RIM = 64, RIM2 = 132;
    // 台沿朝南的石壁与落在云里的影：南邻是虚空的地面格，在它下面画
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      if (!at(x, y) || at(x, y + 1)) continue;
      const fx = X(x), fy = Y(y + 1);
      const sh = c.createLinearGradient(0, fy + RIM2 - 10, 0, fy + RIM2 + 150);
      sh.addColorStop(0, 'rgba(96,104,110,0.30)'); sh.addColorStop(1, 'rgba(96,104,110,0)');
      c.fillStyle = sh; c.fillRect(fx - 0.5, fy + RIM2 - 10, CELL + 1, 160);
      c.fillStyle = '#7d8178'; c.fillRect(fx - 0.5, fy + RIM - 1, CELL + 1, RIM2 - RIM + 1);
      c.fillStyle = '#9da197'; c.fillRect(fx - 0.5, fy - 0.5, CELL + 1, RIM + 0.5);
      // 石壁上的几道皴擦
      c.strokeStyle = 'rgba(54,56,50,0.32)'; c.lineWidth = 1.6;
      for (let k = 0; k < 3; k++) { const lx = fx + hs(x, y, k + 20) * CELL; c.beginPath(); c.moveTo(lx, fy + 4 + hs(x, y, k) * 12); c.lineTo(lx + (hs(x, y, k + 1) - 0.5) * 14, fy + RIM2 - 6 - hs(x, y, k + 2) * 30); c.stroke(); }
      c.strokeStyle = 'rgba(44,46,40,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy + RIM); c.lineTo(fx + CELL, fy + RIM); c.stroke();
    }
    // 石台、石桥的面
    const pat = stone ? c.createPattern(stone, 'repeat') : null;
    if (pat) { try { pat.setTransform(new DOMMatrix().scale(520 / stone!.width)); } catch { /* */ } }
    c.fillStyle = pat ?? '#cfcabb';
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (at(x, y)) c.fillRect(X(x) - 0.5, Y(y) - 0.5, CELL + 1, CELL + 1);
    // 各主题的一层淡色
    c.fillStyle = tint;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) if (at(x, y)) c.fillRect(X(x) - 0.5, Y(y) - 0.5, CELL + 1, CELL + 1);
    // 水池
    const th = this.cur!.spec.theme;
    const liq = ({ fire: ['rgba(214,120,70,0.85)', 'rgba(255,214,150,0.7)'], ice: ['rgba(196,222,236,0.9)', 'rgba(255,255,255,0.8)'], tomb: ['rgba(92,98,112,0.85)', 'rgba(190,196,214,0.5)'], blood: ['rgba(150,60,56,0.85)', 'rgba(232,150,140,0.6)'] } as Record<string, string[]>)[th] ?? ['rgba(142,186,190,0.88)', 'rgba(236,248,246,0.75)'];
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      if (at(x, y) !== 3) continue;
      c.fillStyle = liq[0]; c.fillRect(X(x) - 0.5, Y(y) - 0.5, CELL + 1, CELL + 1);
      c.strokeStyle = liq[1]; c.lineWidth = 2;
      for (let k = 0; k < 2; k++) { const wx = X(x) + 10 + hs(x, y, k + 60) * (CELL - 50), wy = Y(y) + 16 + hs(x, y, k + 63) * (CELL - 32); c.beginPath(); c.moveTo(wx, wy); c.quadraticCurveTo(wx + 16, wy - 7, wx + 34, wy); c.stroke(); }
    }
    // 台边的墨线；水池与地面之间一道淡线
    c.lineCap = 'round';
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const v = at(x, y); if (!v) continue;
      const edge = (nx: number, ny: number, ax: number, ay: number, bx: number, by: number) => {
        const n = at(nx, ny);
        if (n === v || (n && v !== 3 && n !== 3)) return;
        c.strokeStyle = n ? 'rgba(50,70,74,0.4)' : 'rgba(40,42,36,0.75)'; c.lineWidth = n ? 2 : 3.2;
        c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
      };
      edge(x, y - 1, X(x), Y(y), X(x + 1), Y(y)); edge(x - 1, y, X(x), Y(y), X(x), Y(y + 1));
      edge(x + 1, y, X(x + 1), Y(y), X(x + 1), Y(y + 1)); edge(x, y + 1, X(x), Y(y + 1), X(x + 1), Y(y + 1));
    }
    // 台面边缘往里一圈淡淡的墨晕（让台子有厚度感）
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      if (!at(x, y)) continue;
      const wash = (dx: number, dy: number) => {
        if (at(x + dx, y + dy)) return;
        const gx0 = dx > 0 ? X(x + 1) : X(x), gy0 = dy > 0 ? Y(y + 1) : Y(y);
        const gr = dx ? c.createLinearGradient(gx0, 0, gx0 - dx * 26, 0) : c.createLinearGradient(0, gy0, 0, gy0 - dy * 26);
        gr.addColorStop(0, 'rgba(60,62,56,0.22)'); gr.addColorStop(1, 'rgba(60,62,56,0)');
        c.fillStyle = gr; c.fillRect(X(x), Y(y), CELL, CELL);
      };
      wash(1, 0); wash(-1, 0); wash(0, 1); wash(0, -1);
    }
  }
  /** 摆件、宝箱、禁制门、出口（Y 排序） */
  collect(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, t: number) {
    const F = this.floor; if (!F) return;
    const T = THEMES[this.cur!.spec.theme], v = T.variant ? '|' + T.variant : '';
    for (const o of F.objs) {
      if (o.hidden) continue;
      if (o.x < view.left - 200 || o.x > view.right + 200 || o.y < view.top - 100 || o.y > view.bottom + 300) continue;
      const foc = this.focus === o;
      out.push({ y: o.kind === 'door' ? o.y + CELL : o.y, k: 'D·秘境', hx: o.x, hy: o.y, hb: MJ_BOX, draw: (c) => {
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
            c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(150,255,190,${0.25 + 0.15 * Math.sin(t * 3 + o.x)})`; c.beginPath(); c.ellipse(o.x, o.y - 6, 26, 10, 0, 0, TAU); c.fill(); c.restore();
            if (drawV(c, 'herb_' + (1 + (Math.floor(o.x * 7 + o.y * 13) % 3 + 3) % 3), o.x, o.y, 1)) break;
            c.save(); c.strokeStyle = '#3f7a48'; c.lineWidth = 2.5; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(o.x, o.y); c.quadraticCurveTo(o.x + k * 6, o.y - 18, o.x + k * 10, o.y - 30); c.stroke(); }
            c.fillStyle = '#d8604a'; c.beginPath(); c.arc(o.x, o.y - 32, 5, 0, TAU); c.fill(); c.restore();
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
          const label = { chest: '开启宝匣', herb: '采灵草', stele: '参悟古碑', exit: '古阵', stairs: '下一层', door: '破禁', prop: '', light: '', deco: '' }[o.kind] + keyNote('interact');
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
  mini(): { gw: number; gh: number; cells: Uint8Array; roomOf: Int16Array; rooms: MjRoom[]; px: number; py: number; objs: MjObj[]; isles?: MjIsle[]; bridges?: MjLink[]; bound?: { x: number; y: number; r: number } } | null {
    const F = this.floor; if (!F) return null;
    const { cx, cy } = this.cellAt(this.game.player.x, this.game.player.y);
    return { gw: F.gw, gh: F.gh, cells: F.cells, roomOf: F.roomOf, rooms: F.rooms, px: cx, py: cy, objs: F.objs, isles: F.isles, bridges: F.bridges, bound: F.bound };
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
