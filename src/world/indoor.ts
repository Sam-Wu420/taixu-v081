// 收官 P8（丁）：进客栈、酒楼、铺子、宗门大殿——原地分层，全无缝。
//
// 玩家自己走进门：这栋楼的屋顶和朝镜头那面墙在原地抖动溶解（hd2d/buildings.ts 的 roomFade），露出屋里；走出来淡回。
// 不切场景、不开面板、不停时间（halted 不变）。屋里的东西（地面、墙、柜台、货架、桌椅、灯）由 hd2d/indoorGl.ts 在人走近时现拼。
//
// 这里管：
//  · 哪些楼能进：成片街坊的城里开张的铺子（cityLayout 给 cshop 记了 p.fn）、占山宗门的正殿（议事殿）。按布局一次算好、缓存；
//    以后加类别（藏经阁、丹房……）= indoorPlan.ts 的 KINDS 加一份 + 这里 FAC_KIND / 认楼的规则加一行。
//  · 屋里的陈设（indoorPlan.ts，按楼的种子：同一栋每次一样）、碰撞（城内空间 TownSpace.override：屋里按陈设挡，走不穿柜台）、
//    室内地坪（地表 TerrainSurface.floorAt：人站在殿基、铺面石台上，门口一段缓坡）。
//  · 屋里的人：掌柜、伙计、执事、掌门、坐着的客人。按楼的种子生成外观；不是 NPC 名册里的人，不进日结算、不存档。
//  · 交谈：走到掌柜跟前按交谈键（或点他）→ 打开原来的设施面板（Towns.open(loc, fac)，和走到门口按键是同一条路）。
//
// 随机数：这里一个 Math.random 都不取（CharState 构造时会取，建人时临时换成自己的序列），布局生成、日结算的随机数次序不受影响。
import type { Game } from './game';
import type { Drawable } from './life';
import { LOC_SCALE, getLayout, type LocLayout, type Piece } from '../gfx/building';
import { WORLD_SCALE, type LocDef } from '../data/world';
import { mulberry32 } from '../core/rng';
import { CharState, drawCharacter, randomLook, type Look } from '../gfx/character';
import { charBox } from '../hd2d/boxes';
import { SECT_ROBE_OF } from './npc';
import { makePlan, KINDS, type Plan, type RoomKind, type Seat } from './indoorPlan';
import { audio } from './audio';

/** 城里开张的铺子：门上的 fn → 室内类别。拍卖行、悬赏榜、传送阵不进屋 */
export const FAC_KIND: Record<string, RoomKind> = { rest: 'inn', tavern: 'tavern', pill: 'shop', artifact: 'shop', talisman: 'shop', market: 'shop', sect: 'hall' };
const FACE: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
/** 人当作一个点走路：陈设的碰撞框外扩这么多，人不会半个身子嵌进柜台 */
const BODY = 14;
/** 墙厚（屋里的墙在室内框的边上往里占这么多） */
export const WALL_T = 8;

export interface Room {
  id: string; loc: LocDef; kind: RoomKind; fac: string; name: string;
  /** 门朝哪（0 南 1 东 2 北 3 西，世界方向） */
  rot: 0 | 1 | 2 | 3;
  /** 构件锚点（正面中点，世界坐标）：楼按这一点的地面高度摆，室内地坪在这一点上不起作用（见 floorAt） */
  ax: number; ay: number;
  /** 屋里净宽、净深（本地：x 横跨门面，z 从门口 0 往里到 -D） */
  W: number; D: number;
  /** 室内地坪比锚点地面高多少（铺面的石台、殿的台基） */
  base: number;
  /** 门前还有一段与地坪齐平的台面（殿前月台）：本地 z 从 0 到 plat；台阶 / 缓坡再往外 ramp 长、rampW 宽 */
  plat: number; ramp: number; rampW: number;
  /** 被这间屋接管碰撞的本地范围（盖住原布局里那一块实心碰撞） */
  claim: { x0: number; z0: number; x1: number; z1: number };
  /** 屋顶淡出的范围（本地）：A 盒里高过地坪的都溶掉；B 盒（门前凉棚、幌子）里高过地坪 strip 的溶掉 */
  fadeA: { x0: number; z0: number; x1: number; z1: number }; fadeB: { x0: number; z0: number; x1: number; z1: number } | null; strip: number;
  /** 第六轮返工：门朝北的铺子，镜头那一侧的后宅小屋（本地框）：人在前店里时它也溶掉（从地面往上），不然挡住屋里南沿 */
  fadeC?: { x0: number; z0: number; x1: number; z1: number } | null;
  seed: number;
  /** 世界坐标外接框（粗筛用，含缓坡） */
  bx0: number; by0: number; bx1: number; by1: number;
  /** 门外一点（世界）：「走过去」的指引落在这里 */
  doorX: number; doorY: number;
  ground?: number; plan?: Plan;
}
export interface Resident {
  room: Room; seat: Seat; st: CharState; look: Look; x: number; y: number;
  bubble: { text: string; t: number } | null; nextLine: number; li: number;
}

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** 本地 (lx, lz) → 世界（按门朝向转：本地 +z 是门外） */
export function toWorld(r: Room, lx: number, lz: number): [number, number] {
  switch (r.rot) { case 0: return [r.ax + lx, r.ay + lz]; case 1: return [r.ax + lz, r.ay - lx]; case 2: return [r.ax - lx, r.ay - lz]; default: return [r.ax - lz, r.ay + lx]; }
}
/** 世界 → 本地 */
export function toLocal(r: Room, x: number, y: number): [number, number] {
  const dx = x - r.ax, dy = y - r.ay;
  switch (r.rot) { case 0: return [dx, dy]; case 1: return [-dy, dx]; case 2: return [-dx, -dy]; default: return [dy, -dx]; }
}
/** 本地框 → 世界外接框 */
export function boxWorld(r: Room, b: { x0: number; z0: number; x1: number; z1: number }): [number, number, number, number] {
  const [ax, ay] = toWorld(r, b.x0, b.z0), [bx, by] = toWorld(r, b.x1, b.z1);
  return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
}

/** 一处地点布局里能进的楼（按布局缓存：布局对象不变，结果就不变） */
const roomCache = new WeakMap<LocLayout, Room[]>();
/** 试玩页用：改过布局里的铺面之后清掉这份布局的缓存 */
export function clearRoomCache(L: LocLayout) { roomCache.delete(L); }
export function roomsOf(loc: LocDef, L: LocLayout = getLayout(loc)): Room[] {
  let list = roomCache.get(L);
  if (list) return list;
  list = [];
  const ox = loc.x * WORLD_SCALE, oy = loc.y * WORLD_SCALE;
  L.pieces.forEach((pc, i) => {
    const r = pc.kind === 'cshop' ? shopRoom(loc, L, pc, i, ox, oy) : pc.kind === 'sHall' ? hallRoom(loc, L, pc, i, ox, oy) : null;
    if (r) list!.push(r);
  });
  roomCache.set(L, list);
  return list;
}
function finish(r: Room): Room {
  const pts = [boxWorld(r, r.claim), boxWorld(r, r.fadeA), boxWorld(r, { x0: -r.rampW / 2, z0: 0, x1: r.rampW / 2, z1: r.plat + r.ramp + 4 })];
  r.bx0 = Math.min(...pts.map((p) => p[0])); r.by0 = Math.min(...pts.map((p) => p[1])); r.bx1 = Math.max(...pts.map((p) => p[2])); r.by1 = Math.max(...pts.map((p) => p[3]));
  [r.doorX, r.doorY] = toWorld(r, 0, r.plat + r.ramp + 60);
  return r;
}
/** 城里开张的铺子（cityLayout 的 cshop，p.fn 有值）：只进前店（后宅仍是实心的） */
function shopRoom(loc: LocDef, _L: LocLayout, pc: Piece, i: number, ox: number, oy: number): Room | null {
  const p = pc.p as { fn?: string; w: number; d: number; r?: number; name?: string };
  const kind = p.fn ? FAC_KIND[p.fn] : undefined;
  if (!kind || !p.w || !p.d) return null;
  // 和 cityPieces.ts 的 shop() 一致：前店宽 w-14、深 min(250, d·0.48)，石台高 12
  const W = p.w - 14, D = Math.min(250, p.d * 0.48), w = p.w;
  return finish({
    id: `${loc.id}#${i}`, loc, kind, fac: p.fn!, name: p.name ?? '', rot: ((p.r ?? 0) & 3) as Room['rot'],
    ax: ox + pc.x * LOC_SCALE, ay: oy + pc.y * LOC_SCALE, W, D, base: 12, plat: 0, ramp: 36, rampW: Math.min(140, W * 0.5),
    claim: { x0: -w / 2 + 2, z0: -D - 2, x1: w / 2 - 2, z1: 1 },
    // 屋顶（前后出檐 40）、两头的山墙、门面、门前那条摆货的长凳；凉棚、灯笼、幌子在 B 盒里（高过地坪 28 的溶掉，街边的货筐留着）
    // 两头的博风板在前店宽 + 14 处（cityPieces 的 roof：X = fw/2 + 14），比地块宽出 7：盒子两侧多放 9，不然门朝东西的铺子屋顶溶了还剩两道斜线
    fadeA: { x0: -w / 2 - 9, z0: -D - 44, x1: w / 2 + 9, z1: 42 }, fadeB: { x0: -w / 2, z0: 42, x1: w / 2, z1: 180 }, strip: 28,
    // 门朝北（rot 2）：后宅在南边、正对镜头——从前店后墙往后到地块尽头再多出檐（后宅的屋顶出檐 40 上下），整座溶掉
    fadeC: ((p.r ?? 0) & 3) === 2 ? { x0: -w / 2 - 9, z0: -p.d - 56, x1: w / 2 + 9, z1: -D - 44 } : null,
    seed: (pc.seed ^ hashStr(loc.id)) >>> 0, bx0: 0, by0: 0, bx1: 0, by1: 0, doorX: 0, doorY: 0,
  });
}
/** 占山宗门的正殿（名牌「正殿」挂的那座）：议事殿。殿基高、殿前月台、正面台阶 */
function hallRoom(loc: LocDef, L: LocLayout, pc: Piece, i: number, ox: number, oy: number): Room | null {
  if (loc.type !== 'sect' || !L.final) return null;
  const p = pc.p as { w: number; d: number; h: number; base?: number; on?: unknown; stilts?: boolean };
  if (p.on || p.stilts) return null;
  const nm = L.names?.find((n) => n.t === '正殿');
  if (!nm || Math.abs(nm.x - pc.x) > 0.5 || Math.abs(nm.y - (pc.y - p.d * 0.5 / LOC_SCALE)) > 0.5) return null;
  const W = p.w, D = p.d, base = p.base ?? p.h * 0.18;
  // 和 ArchBuilder.hall 一致：台基比殿身前后多出 d·0.08 + base，正面三级踏步共 base·1.5 深、宽 max(w·0.3, 门洞·1.3)
  const plat = D * 0.08 + base, ramp = base * 1.6, rampW = Math.max(W * 0.3, 0) - 20, over = Math.max(8, p.h * 0.42);
  return finish({
    id: `${loc.id}#${i}`, loc, kind: 'hall', fac: 'sect', name: '议事殿', rot: 0,
    ax: ox + pc.x * LOC_SCALE, ay: oy + pc.y * LOC_SCALE, W, D, base, plat, ramp, rampW,
    // 原布局在殿身外扩一成的范围里是实心的：整块接管，月台两侧（殿身以外）仍挡着
    claim: { x0: -W * 0.55 - 2, z0: -D * 1.1 + 18, x1: W * 0.55 + 2, z1: plat + 2 },
    fadeA: { x0: -W / 2 - over - 12, z0: -D - over - 12, x1: W / 2 + over + 12, z1: plat + 2 }, fadeB: null, strip: 0,
    seed: (pc.seed ^ hashStr(loc.id)) >>> 0, bx0: 0, by0: 0, bx1: 0, by1: 0, doorX: 0, doorY: 0,
  });
}

export class IndoorSys {
  /** 主角附近的、能进的楼（半秒按城内空间的「附近地点」刷新一次） */
  near: Room[] = [];
  /** 主角此刻在哪间屋里（门槛往里算） */
  inside: Room | null = null;
  /** 正在溶掉 / 溶回屋顶的那一间，和溶掉的程度 0..1 */
  fadeRoom: Room | null = null; fade = 0;
  /** 交谈焦点：走到跟前的掌柜 / 执事 */
  focus: Resident | null = null; focusD = 1e9;
  /** 「走过去」的指引：哪间屋（画面在门口画光圈、在主角脚下画箭头） */
  guideRoom: Room | null = null;
  readonly residents = new Map<string, Resident[]>();
  private t = 0; private time = 0;
  private pending: Resident | null = null;
  constructor(public game: Game) {}

  /** 室内地坪（给地表 TerrainSurface.floorAt）：在屋里、殿前月台上是地坪高度，门口一段缓坡；别处 NaN */
  readonly floorFn = (x: number, y: number): number => {
    const list = this.near;
    for (let k = 0; k < list.length; k++) {
      const r = list[k];
      if (x < r.bx0 || x > r.bx1 || y < r.by0 || y > r.by1) continue;
      // 楼按锚点那一点的地面摆：那一点永远给地面
      if (Math.abs(x - r.ax) < 0.5 && Math.abs(y - r.ay) < 0.5) return NaN;
      const [lx, lz] = toLocal(r, x, y);
      if (lz < -r.D || lx < -r.W / 2 || lx > r.W / 2) continue;
      const f = this.floorY(r);
      if (lz <= 0) { let up = 0; for (const q of this.plan(r).raise) if (lx > q.x0 && lx < q.x1 && lz > q.z0 && lz < q.z1 && q.y > up) up = q.y; return f + up; }
      if (lz <= r.plat) return f;
      if (lz <= r.plat + r.ramp && Math.abs(lx) <= r.rampW / 2) {
        const g = this.game.terrain.surface.terrainHeightAt(x, y), k2 = (lz - r.plat) / r.ramp;
        return f + (g - f) * k2;
      }
    }
    return NaN;
  };
  /** 城内碰撞（给 TownSpace.override）：在某间屋接管的范围里，按屋里的墙和陈设回答挡不挡；不归任何屋管的返回 undefined */
  readonly blockFn = (x: number, y: number): boolean | undefined => {
    const list = this.near;
    for (let k = 0; k < list.length; k++) {
      const r = list[k];
      if (x < r.bx0 || x > r.bx1 || y < r.by0 || y > r.by1) continue;
      const [lx, lz] = toLocal(r, x, y), c = r.claim;
      if (lx < c.x0 || lx > c.x1 || lz < c.z0 || lz > c.z1) continue;
      return this.blockedLocal(r, lx, lz);
    }
    return undefined;
  };

  /** 屋里（本地坐标）这一点挡不挡：墙（门洞除外）、陈设；殿前月台在殿身宽度以内能走 */
  blockedLocal(r: Room, lx: number, lz: number): boolean {
    const W2 = r.W / 2, P = this.plan(r);
    if (lz > 0) return Math.abs(lx) > W2 - WALL_T;             // 殿前月台：殿身以外的那两截挡着（铺子 plat = 0，这里只剩门槛那一线）
    if (Math.abs(lx) > W2 - WALL_T - BODY * 0.4 || lz < -r.D + WALL_T + BODY * 0.4) return true;   // 两侧、后墙
    if (lz > -WALL_T - 2 && Math.abs(lx - P.door.x) > P.door.w / 2 - BODY * 0.5) return true;     // 前墙（门洞放行）
    if (lz > -WALL_T - 2 && this.collapsed(r)) { const [px, pz] = toLocal(r, this.game.player.x, this.game.player.y); if (!(Math.abs(px) < W2 && pz < -WALL_T && pz > -r.D)) return true; }   // 城镇破坏：半塌了不让进（人已经在屋里的照样走得出来）
    for (const s of P.solids) if (lx > s.x0 - BODY && lx < s.x1 + BODY && lz > s.z0 - BODY && lz < s.z1 + BODY) return true;
    return false;
  }
  /** 一间屋的陈设（按种子；第一次用到时排） */
  plan(r: Room): Plan { return r.plan ??= makePlan(r.kind, r.fac, r.W, r.D, r.seed); }
  /** 室内地坪的世界高度（锚点地面 + 石台 / 殿基） */
  floorY(r: Room): number { return (r.ground ??= this.game.terrain.surface.terrainHeightAt(r.ax, r.ay)) + r.base; }
  /** 主角站的这一点在不在这间屋里（门槛往里；殿算上殿前月台） */
  contains(r: Room, x: number, y: number, pad = 0): boolean {
    const [lx, lz] = toLocal(r, x, y);
    if (lz < -r.D - pad || Math.abs(lx) > r.W / 2 + pad) return false;
    if (lz <= 0) return true;
    // 门外：铺子只算门槛前那一小块（站在门面旁边的街上不算进屋）；殿算整个殿前月台
    return r.plat > 0 ? lz <= r.plat + pad : lz <= 26 + pad && Math.abs(lx) <= this.plan(r).door.w / 2 + 30 + pad;
  }
  /** 城镇破坏（world/townwreck.ts）：这间屋半塌了没有——半塌的不让进、屋里没人，掌柜在门口摆临时摊 */
  collapsed(r: Room): boolean { const pi = Number(r.id.slice(r.id.lastIndexOf('#') + 1)); return Number.isFinite(pi) && !!this.game.combat?.wreck?.town.collapsed(r.loc.id, pi); }
  private doorNoteT = -99;
  private colRooms = new Set<string>();
  /** 某地点里某种设施对应的那间屋（总览面板「走过去」用）；key 是设施面板的键（rest / tavern / pill / … / sect） */
  roomFor(loc: LocDef, key: string): Room | null { return roomsOf(loc).find((r) => r.fac === key) ?? null; }
  /** 主角此刻是否在这处地点里（城墙以内、宗门地界以内） */
  inLoc(loc: LocDef): boolean {
    const g = this.game, p = g.player;
    if (g.offWorld) return false;
    const L = getLayout(loc), ox = loc.x * WORLD_SCALE, oy = loc.y * WORLD_SCALE;
    return Math.abs(p.x - ox) < L.gw * LOC_SCALE * 0.5 && Math.abs(p.y - oy) < L.gh * LOC_SCALE * 0.5;
  }
  /** 「走过去」：地图上标指路，门口画光圈，主角脚下一枚箭头指过去（走进那间屋就收掉） */
  guideTo(r: Room) {
    const g = this.game;
    this.guideRoom = r;
    g.setGuide(r.doorX, r.doorY, `${r.loc.name}·${r.name || r.fac}`);
  }

  update(dt: number) {
    const g = this.game, p = g.player;
    this.time += dt;
    // 接上地表和城内空间的钩子（换图时这两样会换成新的对象）
    const S = g.terrain?.surface; if (S && S.floorAt !== this.floorFn) S.floorAt = this.floorFn;
    if (g.space && g.space.override !== this.blockFn) g.space.override = this.blockFn;
    if (g.offWorld) { this.near = []; this.inside = null; this.focus = null; this.fade = 0; this.fadeRoom = null; return; }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      const out: Room[] = [];
      for (const n of g.space.near) for (const r of roomsOf(n.l, n.L)) if (Math.abs(r.ax - p.x) < 3000 && Math.abs(r.ay - p.y) < 3000) out.push(r);
      this.near = out;
    }
    // 在哪间屋里：御剑飞在屋顶以上的不算（飞着掠过去，屋顶不该淡）
    const low = (p.z ?? 0) < 140;
    let ins: Room | null = null;
    if (low) for (const r of this.near) if (this.contains(r, p.x, p.y, this.inside === r ? 10 : 0)) { ins = r; break; }
    this.inside = ins;
    if (ins && this.fadeRoom !== ins) { if (this.fade <= 0.02 || !this.fadeRoom) this.fadeRoom = ins; }
    const want = ins && this.fadeRoom === ins ? 1 : 0;
    // 0.35 息溶完：够快、不闪；方向随时可以反过来（门槛上来回走，屋顶跟着来回）
    this.fade = want ? Math.min(1, this.fade + dt / 0.35) : Math.max(0, this.fade - dt / 0.35);
    if (this.fade <= 0 && !want) this.fadeRoom = ins;
    if (this.guideRoom && (ins === this.guideRoom || !g.guide)) this.guideRoom = null;
    // 城镇破坏：走到半塌的屋门口——说一声进不去、在门口的临时摊办事
    if (this.time - this.doorNoteT > 8) for (const r of this.near) if (r !== ins && Math.hypot(r.doorX - p.x, r.doorY - p.y) < 110 && this.collapsed(r)) { this.doorNoteT = this.time; g.toast(`${r.name || '铺子'}塌了半边，进不去了——掌柜在门口支了临时摊，在门口按交谈键照常办事。`, 'warn'); break; }
    this.tickResidents(dt);
  }

  // ------------------------------------------------------------ 屋里的人
  /** 主角离一间屋 900 以内才把人请出来；远了就收掉（不进名册、不存档） */
  private tickResidents(dt: number) {
    const g = this.game, p = g.player;
    const keep = new Set<string>();
    for (const r of this.near) {
      if (Math.hypot(r.ax - p.x, r.ay - p.y) > 1100) continue;
      keep.add(r.id);
      const col = this.collapsed(r);
      if (!this.residents.has(r.id) || col !== this.colRooms.has(r.id)) { this.residents.set(r.id, g.towns.occupied(r.loc) || col ? [] : this.makeResidents(r)); if (col) this.colRooms.add(r.id); else this.colRooms.delete(r.id); }   // 半塌了屋里没人；修好了人回来
    }
    for (const id of [...this.residents.keys()]) if (!keep.has(id)) this.residents.delete(id);
    this.focus = null; this.focusD = 1e9;
    for (const list of this.residents.values()) for (const a of list) {
      const st = a.st, s = a.seat;
      st.x = a.x; st.y = a.y; st.vx = st.vy = 0; st.speed = 0;
      st.setAction(s.sit ? 'sit' : 'idle');
      // 掌柜平时朝门口；主角走近了转过来看着他
      const [wx, wy] = this.dirWorld(a.room, s.fx, s.fz);
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      if (s.talk && d < 260 && !s.sit) st.faceToward(p.x - a.x, p.y - a.y); else st.faceToward(wx, wy);
      st.update(dt);
      if (a.bubble) { a.bubble.t -= dt; if (a.bubble.t <= 0) a.bubble = null; }
      if (s.lines?.length && this.time > a.nextLine && d < 520) {
        a.bubble = { text: s.lines[a.li++ % s.lines.length], t: 3.2 };
        a.nextLine = this.time + 9 + ((a.li * 7 + (hashStr(a.room.id) & 7)) % 9);
      }
      if (!s.talk) continue;
      const fd = Math.hypot(p.x - a.x, (p.y - a.y) * 1.3);
      if (fd < 170 && this.inside === a.room && fd < this.focusD) { this.focus = a; this.focusD = fd; }
    }
    // 点了掌柜走过去的：沿屋里的路一段段走（绕开桌凳、展台），到跟前就开口；半路自己动了方向键就作罢
    if (this.pending) {
      const a = this.pending;
      if (!this.residents.get(a.room.id)?.includes(a)) { this.pending = null; this.path = []; }
      else if (this.focus === a) { this.pending = null; this.path = []; g.destination = null; this.interact(); }
      else if (!g.destination) {
        const q = this.path[0];
        if (q && Math.hypot(q[0] - p.x, q[1] - p.y) < 34) { this.path.shift(); const n = this.path[0]; if (n) g.setDestination(n[0], n[1]); else this.pending = null; }
        else { this.pending = null; this.path = []; }
      }
    }
  }
  /** 本地朝向 → 世界朝向 */
  private dirWorld(r: Room, fx: number, fz: number): [number, number] { const [a, b] = toWorld(r, fx, fz), [c, d] = toWorld(r, 0, 0); return [a - c, b - d]; }
  private makeResidents(r: Room): Resident[] {
    const P = this.plan(r), out: Resident[] = [];
    const rnd = mulberry32((r.seed ^ 0x7e51de) >>> 0);
    const robe = r.kind === 'hall' ? SECT_ROBE_OF(r.loc.id) : undefined;
    P.seats.forEach((s, i) => {
      const role = s.role === 'keeper' ? (rnd() < 0.25 ? 'female' : 'merchant') : s.role === 'helper' ? (r.kind === 'hall' ? 'cultivator' : 'farmer') : s.role === 'head' || s.role === 'elder' ? 'elder' : s.role === 'deacon' ? 'cultivator' : rnd() < 0.3 ? 'female' : rnd() < 0.5 ? 'scholar' : 'cultivator';
      const look = randomLook(rnd, role as Parameters<typeof randomLook>[1]);
      if (robe) look.robe = robe;
      // CharState 构造时取 Math.random（t、seed）：临时换成这间屋自己的序列，不动全局随机数的次序
      const r0 = Math.random; let st: CharState;
      Math.random = rnd; try { st = new CharState(0, 0); } finally { Math.random = r0; }
      const [x, y] = toWorld(r, s.x, s.z);
      st.x = x; st.y = y; st.setAction(s.sit ? 'sit' : 'idle');
      const [wx, wy] = this.dirWorld(r, s.fx, s.fz); st.faceToward(wx, wy); st.yaw = st.targetYaw;
      out.push({ room: r, seat: s, st, look, x, y, bubble: null, nextLine: this.time + 2 + i * 3.5 + rnd() * 3, li: Math.floor(rnd() * 3) });
    });
    return out;
  }

  /** 交谈：打开原来的设施面板（和走到门口按交谈键同一条路：Towns.open → 设施面板自己办事） */
  interact(): boolean {
    const a = this.focus, g = this.game;
    if (!a) return false;
    const r = a.room;
    if (!g.towns.canEnter(r.loc)) return false;
    audio.sfx('open');
    // 客栈掌柜：先问一句再住。住店要扣灵石、过一天、存档，不能一开口就办了（走到门口按键那条老路是看着设施卡点的，不一样）
    if (r.fac === 'rest') {
      const cost = r.loc.type === 'city' ? 5 : 2;
      g.openDialog({ speaker: a.seat.title, look: a.look, text: `客官可要住店？上房一晚 ${cost} 灵石，歇上一夜，气血法力尽复。`, options: [
        { label: `住一晚（${cost} 灵石）`, tone: 'gold', act: () => { g.towns.rest(r.loc); return null; } },
        { label: '先不了', act: () => null },
      ] });
      return true;
    }
    g.towns.open(r.loc, r.fac);
    return true;
  }
  /** 点人（手机）：点中掌柜——近了直接开口，远了先走到他跟前 */
  click(wx: number, wy: number): boolean {
    const g = this.game, p = g.player;
    for (const list of this.residents.values()) for (const a of list) {
      if (!a.seat.talk) continue;
      if (Math.abs(wx - a.x) > 46 || wy < a.y - 150 || wy > a.y + 24) continue;
      if (this.focus === a) { this.interact(); return true; }
      const P = this.plan(a.room), [plx, plz] = toLocal(a.room, p.x, p.y);
      const route = this.route(a.room, plx, plz, P.front.x, P.front.z);
      this.path = (route ?? [[P.front.x, P.front.z]]).map(([x, z]) => toWorld(a.room, x, z));
      this.pending = a; g.setDestination(this.path[0][0], this.path[0][1]);
      return true;
    }
    return false;
  }

  /** 屋里的人进绘制列表（立板；脚下高度由室内地坪抬到屋里的地面上） */
  collect(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, _t: number, dt: number) {
    for (const list of this.residents.values()) for (const a of list) {
      if (a.x < view.left - 200 || a.x > view.right + 200 || a.y < view.top - 100 || a.y > view.bottom + 260) continue;
      out.push({ y: a.y, k: 'D·室内', hx: a.x, hy: a.y, hb: charBox(1, a.bubble ? 60 : 30), draw: (ctx) => this.drawOne(ctx, a, dt) });
    }
  }
  private drawOne(ctx: CanvasRenderingContext2D, a: Resident, dt: number) {
    const st = a.st, g = this.game, z = g.cam?.zoom ?? 1;
    ctx.save();
    drawCharacter(ctx, a.look, st, 1, dt);
    // 名牌：掌柜、执事近了就挂着；客人、伙计只在走到跟前、又没在说话时才挂（屋里人多，名牌一多就压成一片）
    const dd = Math.hypot(st.x - g.player.x, st.y - g.player.y), near = a.seat.talk ? dd < 700 : dd < 200 && !a.bubble;
    const fs = Math.max(11, 13 / Math.max(0.5, z)), y = st.y - (a.seat.sit ? 104 : 136);
    ctx.textAlign = 'center';
    if (near) {
      ctx.font = `${fs}px "Noto Serif SC","Songti SC",serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,12,0.7)'; ctx.fillStyle = a.seat.talk ? '#ffe2a8' : '#e8e0cc';
      ctx.strokeText(a.seat.title, st.x, y); ctx.fillText(a.seat.title, st.x, y);
      if (this.focus === a) { ctx.font = `${fs * 0.85}px "Noto Serif SC",serif`; ctx.fillStyle = 'rgba(255,240,200,0.95)'; ctx.strokeText('【交谈】', st.x, y - fs * 1.2); ctx.fillText('【交谈】', st.x, y - fs * 1.2); }
    }
    if (a.bubble) {
      const bf = Math.max(12, 14 / Math.max(0.5, z)), font = `${bf}px "Noto Serif SC","Songti SC",serif`;
      ctx.font = font;
      const w = ctx.measureText(a.bubble.text).width + bf, by = y - bf * (near ? 2.4 : 1);
      ctx.globalAlpha *= Math.min(1, a.bubble.t * 2);
      ctx.fillStyle = 'rgba(250,244,228,0.92)'; ctx.strokeStyle = 'rgba(60,40,30,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.rect(st.x - w / 2, by - bf * 0.95, w, bf * 1.5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a2018'; ctx.fillText(a.bubble.text, st.x, by + bf * 0.1);
    }
    ctx.restore();
  }
  /** 点掌柜走过去时的途经点（世界坐标） */
  private path: [number, number][] = [];
  /**
   * 屋里的寻路（本地坐标）：12 见方一格做广度优先，再把能直着走的拐点拉掉。门外一段（门前两百来步）也算进来，
   * 人从街上点掌柜，也会先走到门口再进去。走不到返回 null（测试用它查「门口到柜台连通」）
   */
  route(r: Room, ax: number, az: number, bx: number, bz: number): [number, number][] | null {
    const C = 12, x0 = -r.W / 2 - 60, x1 = r.W / 2 + 60, z0 = -r.D, z1 = r.plat + r.ramp + 240;
    const nx = Math.ceil((x1 - x0) / C) + 1, nz = Math.ceil((z1 - z0) / C) + 1, c = r.claim;
    const free = (lx: number, lz: number) => (lx >= c.x0 && lx <= c.x1 && lz >= c.z0 && lz <= c.z1) ? !this.blockedLocal(r, lx, lz) : lz > Math.max(0, r.plat);
    const cell = (x: number, z: number) => { const i = Math.round((x - x0) / C), j = Math.round((z - z0) / C); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
    const cx = (k: number) => x0 + (k % nx) * C, cz = (k: number) => z0 + Math.floor(k / nx) * C;
    let s = cell(ax, az), e = cell(bx, bz);
    if (s < 0 || e < 0) return null;
    // 起点、终点格子若刚好落在挡着的地方（贴着柜台站），就近挪到能走的格子
    const near = (k: number) => { if (free(cx(k), cz(k))) return k; for (let d = 1; d < 4; d++) for (let u = -d; u <= d; u++) for (let v = -d; v <= d; v++) { const q = k + v * nx + u; if (q >= 0 && q < nx * nz && free(cx(q), cz(q))) return q; } return -1; };
    s = near(s); e = near(e); if (s < 0 || e < 0) return null;
    const prev = new Int32Array(nx * nz).fill(-2); prev[s] = -1; const q = [s];
    for (let h = 0; h < q.length && prev[e] === -2; h++) {
      const k = q[h], i = k % nx, j = Math.floor(k / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const u = i + di, v = j + dj; if (u < 0 || v < 0 || u >= nx || v >= nz) continue;
        const n = v * nx + u; if (prev[n] !== -2 || !free(cx(n), cz(n))) continue;
        prev[n] = k; q.push(n);
      }
    }
    if (prev[e] === -2) return null;
    const pts: [number, number][] = []; for (let k = e; k >= 0; k = prev[k]) pts.unshift([cx(k), cz(k)]);
    const see = (a: [number, number], b: [number, number]) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5)); for (let t = 1; t < n; t++) if (!free(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n)) return false; return true; };
    const out: [number, number][] = []; let cur: [number, number] = [ax, az];
    for (let i = 0; i < pts.length;) { let j = pts.length - 1; while (j > i && !see(cur, pts[j])) j--; out.push(pts[j]); cur = pts[j]; i = j + 1; }
    out[out.length - 1] = [bx, bz];
    return out;
  }
  // —— 点地走路的绕行（收官总审：殿前月台是真的高台了，只有正中的台阶上得去；屋子只有门洞进得去）——
  private sv = { x: NaN, y: NaN, t: 0, re: 0, pts: [] as [number, number][] };
  /**
   * 点地走路时问一句：直着走过不去的（被月台的台沿、台阶的侧壁、屋墙挡住）给一个途经点，先走到那里；
   * 直线走得通、或路上没有能进的楼，返回 null。只在去处变了、或手头的途经点走完了才重算，不是每帧算。
   */
  steer(dest: { x: number; y: number }): [number, number] | null {
    const g = this.game, p = g.player, s = this.sv;
    if (!this.near.length || g.offWorld) { s.pts.length = 0; s.x = NaN; return null; }
    const moved = !(Math.abs(s.x - dest.x) < 30 && Math.abs(s.y - dest.y) < 30);
    if (moved || (!s.pts.length && this.time > s.t)) {
      s.x = dest.x; s.y = dest.y; s.t = this.time + 0.4;
      s.pts = this.detour(p.x, p.y, dest.x, dest.y) ?? [];
    }
    // 途经点算「到了」：离得不远、而且从脚下已经能直着走到下一个点，才翻到下一个（不然隔着台阶的侧壁就把拐点跳过去了）。
    // 走到跟前了下一个点却还直着走不到（人没有正好踩在拐点上，差一两步就擦到台阶侧壁外面）：从脚下重算一遍路
    for (let guard = 0; guard < 8; guard++) {
      const q = s.pts[0]; if (!q) break;
      const d = Math.hypot(q[0] - p.x, q[1] - p.y), n = s.pts[1];
      if (!n) { if (d < 12) s.pts.shift(); break; }
      if (d < 44 && this.clear(p.x, p.y, n[0], n[1])) { s.pts.shift(); continue; }
      if (d < 12 && this.time > s.re) { s.re = this.time + 0.25; s.pts = this.detour(p.x, p.y, dest.x, dest.y) ?? []; }
      break;
    }
    return s.pts[0] ?? null;
  }
  /** 走这一小步行不行：和主角真走路时问的是同一套（能站、屋墙陈设不挡、坡不过陡） */
  private stepOK(ax: number, ay: number, bx: number, by: number): boolean {
    const g = this.game, T = g.terrain;
    return T.walkFactor(bx, by) > 0 && !g.space.blocked(bx, by) && T.canTraverse(ax, ay, bx, by);
  }
  /**
   * 两点之间直着走不走得通。步子要碎（3 一步）：限坡是按「这一步的高差 ÷ 步长」算的，真走路一帧只挪两三个单位，
   * 台阶侧壁那种一道坎，步子大了会误判成能迈上去
   */
  private clear(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / 3));
    let px = ax, py = ay;
    for (let i = 1; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; if (!this.stepOK(px, py, x, y)) return false; px = x; py = y; }
    return true;
  }
  /**
   * 绕行路线（世界坐标的一串途经点）：挡在路上的那间屋周围 16 见方一格做广度优先，再把能直着走的拐点拉掉。
   * 直线本来就通、人不在这间屋附近、绕不过去，都返回 null（照旧直着走）。
   */
  detour(px: number, py: number, dx: number, dy: number): [number, number][] | null {
    const g = this.game, T = g.terrain, S = T.surface, sp = g.space;
    if (sp.blocked(px, py)) return null;   // 人已经陷在实心里：照旧放行走出来，不添乱
    // 只看前面一千来步：再远的走近了再说
    const full = Math.hypot(dx - px, dy - py); if (full < 30) return null;
    const k = Math.min(1, 1100 / full), ex = px + (dx - px) * k, ey = py + (dy - py) * k;
    // 这条线擦到哪间屋（含门前台阶）
    let r: Room | null = null;
    const n = Math.max(1, Math.ceil(full * k / 40));
    scan: for (const q of this.near) for (let i = 0; i <= n; i++) {
      const x = px + (ex - px) * i / n, y = py + (ey - py) * i / n;
      if (x > q.bx0 - 30 && x < q.bx1 + 30 && y > q.by0 - 30 && y < q.by1 + 30) { r = q; break scan; }
    }
    if (!r || this.clear(px, py, ex, ey)) return null;
    const C = 16, M = 160, x0 = r.bx0 - M, y0 = r.by0 - M, x1 = r.bx1 + M, y1 = r.by1 + M;
    if (px < x0 || px > x1 || py < y0 || py > y1) return null;
    const nx = Math.ceil((x1 - x0) / C) + 1, ny = Math.ceil((y1 - y0) / C) + 1;
    const tx = Math.min(x1, Math.max(x0, dx)), ty = Math.min(y1, Math.max(y0, dy)), inGrid = tx === dx && ty === dy;
    const cell = (x: number, y: number) => Math.round((y - y0) / C) * nx + Math.round((x - x0) / C);
    const cx = (c: number) => x0 + (c % nx) * C, cy = (c: number) => y0 + Math.floor(c / nx) * C;
    // 每格只问一次：能不能站（0 不能 1 能）、脚下多高
    const ok = new Int8Array(nx * ny).fill(-1), hh = new Float32Array(nx * ny);
    const free = (c: number) => { let v = ok[c]; if (v < 0) { const x = cx(c), y = cy(c); v = ok[c] = T.walkFactor(x, y) > 0 && !sp.blocked(x, y) ? 1 : 0; if (v) hh[c] = S.heightAt(x, y); } return v === 1; };
    // 相邻两格走不走得通：几乎一样高的直接放行；有高差的（台阶、台沿、侧壁）照真走路的规矩碎步问一遍
    const pass = (a: number, b: number) => free(b) && (Math.abs(hh[a] - hh[b]) <= 2 || this.clear(cx(a), cy(a), cx(b), cy(b)));
    const snap = (c: number) => { if (free(c)) return c; for (let d = 1; d < 5; d++) for (let v = -d; v <= d; v++) for (let u = -d; u <= d; u++) { const i = (c % nx) + u, j = Math.floor(c / nx) + v; if (i >= 0 && j >= 0 && i < nx && j < ny && free(j * nx + i)) return j * nx + i; } return -1; };
    const s = snap(cell(px, py)), e = snap(cell(tx, ty));
    if (s < 0 || e < 0) return null;
    const prev = new Int32Array(nx * ny).fill(-2); prev[s] = -1; const q = [s];
    for (let h = 0; h < q.length && prev[e] === -2; h++) {
      const c = q[h], i = c % nx, j = Math.floor(c / nx);
      if (i + 1 < nx && prev[c + 1] === -2 && pass(c, c + 1)) { prev[c + 1] = c; q.push(c + 1); }
      if (i > 0 && prev[c - 1] === -2 && pass(c, c - 1)) { prev[c - 1] = c; q.push(c - 1); }
      if (j + 1 < ny && prev[c + nx] === -2 && pass(c, c + nx)) { prev[c + nx] = c; q.push(c + nx); }
      if (j > 0 && prev[c - nx] === -2 && pass(c, c - nx)) { prev[c - nx] = c; q.push(c - nx); }
    }
    if (prev[e] === -2) return null;
    const pts: [number, number][] = []; for (let c = e; c >= 0; c = prev[c]) pts.unshift([cx(c), cy(c)]);
    if (inGrid && this.clear(pts[pts.length - 1][0], pts[pts.length - 1][1], dx, dy)) pts.push([dx, dy]);
    const out: [number, number][] = []; let cur: [number, number] = [px, py];
    for (let i = 0; i < pts.length;) { let j = pts.length - 1; while (j > i && !this.clear(cur[0], cur[1], pts[j][0], pts[j][1])) j--; out.push(pts[j]); cur = pts[j]; i = j + 1; }
    return out;
  }
  /** 交谈提示（HUD 的交谈键上写什么） */
  talkLabel(): string | null { return this.focus ? `与${this.focus.seat.title}交谈` : null; }
  /** 这间屋的类别配置（测试、画面用） */
  static conf(kind: RoomKind) { return KINDS[kind]; }
  /** 一个人在世界里的脚下（测试用） */
  facePoint(r: Room): [number, number] { const P = this.plan(r); return toWorld(r, P.front.x, P.front.z); }
  /** 门朝向的世界方向 */
  static faceDir(r: Room): [number, number] { return FACE[r.rot]; }
}
