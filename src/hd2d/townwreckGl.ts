// 城镇破坏的立体画面（world/townwreck.ts 定状态）：主角所在的那座城里，坏了的构件各建一个替身（townwreckGeo.ts 做后处理），
// 原来的那件由 buildings.setHidden 在顶点着色器里甩掉——不重烘整块，没东西坏的时候这里什么都不做。
// 小件倒下的过程：单独建一个这件的网格，绕脚下转过去（高的倒下、矮的塌下去），倒完换成替身里的残骸。
// 替身按状态的键（档、脚手架、哪几件碎了）缓存，变了才重建；一帧最多花 4 毫秒重建（至少一件），没轮上的下一帧接着建，
// 原来那件要等替身建好了才藏（不会一下子空着）。城墙的焦痕掉砖合成一个网格，账变了才重建。
import { BufferGeometry, Group, Mesh, Quaternion, Vector3 } from 'three';
import type { Game } from '../world/game';
import type { HdScene } from './scene';
import { ArchBuilder } from './arch';
import { KIT_DMG, kitItemInto } from './cityPieces';
import { damageHouse, kitDebris, lin, snapPiece, wallMarks, type WallMarkGeo } from './townwreckGeo';
import type { Plaque } from './cityText';
import type { TWPieceView, TWFall } from '../world/townwreck';
import { LOC_SCALE } from '../gfx/building';

/** 幌子上的字：开张的铺子按设施 */
const SIGN: Record<string, string> = { pill: '丹', rest: '客', tavern: '酒', artifact: '器', talisman: '符', market: '坊', auction: '拍' };
/** 高的小件倒下（绕脚下转九十度），其余的塌下去 */
const TALL = new Set(['lamp', 'flag', 'umb']);
const BUDGET_MS = 4;
type Built = { key: string; mesh: Mesh | null; plq: Mesh | null; cx: number; cz: number };
type FallM = { mesh: Mesh; plq: Mesh | null; f: TWFall; kind: string; drop: number; done: boolean };

export class TownWreckGl {
  readonly group = new Group();
  private loc: string | null = null;
  private built = new Map<number, Built>();
  private falls = new Map<string, FallM>();
  private wall: { key: string; mesh: Mesh | null } = { key: '', mesh: null };
  private hiddenKey = '';
  private S = new ArchBuilder(); private O = new ArchBuilder();
  /** 测试 / 量数：本帧建了几件、花了几毫秒 */
  readonly stats = { built: 0, ms: 0, live: 0, tS: 0, tPost: 0, tGeo: 0 };
  constructor(private readonly hd: HdScene) { hd.buildings.group.add(this.group); }

  update(game: Game, dt: number) {
    void dt;
    const TW = game.combat.wreck.town, B = this.hd.buildings;
    this.stats.built = 0; this.stats.ms = 0;
    const m = TW.here();
    const o = m ? B.origin(m.l.id) : null;
    if (!m || !o) { if (this.loc) this.clear(); return; }
    if (this.loc !== m.l.id) { this.clear(); this.loc = m.l.id; }
    this.group.position.set(o.x, 0, o.y);
    const view = TW.pieces(m), L = o.layout, ox = o.x, oy = o.y;
    const heightAt = this.hd.heightAt;
    // 修好了（不在样子表里了）：替身拿掉，原来的露出来
    for (const [pi, b] of this.built) if (!view.has(pi)) { this.drop(b); this.built.delete(pi); }
    // 要重建的：键变了的；先建有小件正在倒的（倒下那一刻原来那件得马上藏）
    const todo: TWPieceView[] = [];
    for (const pv of view.values()) { const b = this.built.get(pv.pi); if (!b || b.key !== pv.key) todo.push(pv); }
    todo.sort((a, b) => (b.key.includes('f') ? 1 : 0) - (a.key.includes('f') ? 1 : 0));
    const t0 = performance.now();
    for (const pv of todo) {
      if (this.stats.built > 0 && performance.now() - t0 > BUDGET_MS) break;
      const b = this.build(game, pv, L, ox, oy, heightAt);
      const old = this.built.get(pv.pi); if (old) this.drop(old);
      if (b) { this.built.set(pv.pi, b); this.stats.built++; } else this.built.delete(pv.pi);
    }
    this.stats.ms = performance.now() - t0;
    // 藏起来的 = 替身建好了的
    const hk = [...this.built.keys()].sort((a, b) => a - b).join(',');
    if (hk !== this.hiddenKey) { this.hiddenKey = hk; B.setHidden(this.built.size ? m.l.id : null, this.built.keys()); }
    // 倒下的过程
    const live = new Set<string>();
    for (const f of TW.falls) {
      if (f.loc !== m.l.id) continue;
      const k = f.pi + ':' + f.ii; live.add(k);
      let F = this.falls.get(k);
      if (!F) { const nf = this.makeFall(game, f, L, ox, oy, heightAt); if (!nf) continue; this.falls.set(k, F = nf); }
      F.f = f; this.pose(F, f.t / 0.75);
    }
    for (const [k, F] of this.falls) {
      if (live.has(k)) continue;
      // 倒完了：等替身里换成残骸了再拿掉（不会空一下）
      const pv = view.get(F.f.pi), b = this.built.get(F.f.pi);
      if (!pv || (b && b.key === pv.key && pv.items.get(F.f.ii) !== 'fall')) { this.group.remove(F.mesh); F.mesh.geometry.dispose(); if (F.plq) { this.group.remove(F.plq); F.plq.geometry.dispose(); } this.falls.delete(k); }
      else this.pose(F, 1);
    }
    // 城墙的焦痕掉砖
    const st = TW.state(m.l.id);
    const wk = st ? st.w.map((w) => `${w.pi}:${Math.round(w.x)}:${Math.round(w.y)}:${w.s.toFixed(1)}`).join('|') : '';
    if (wk !== this.wall.key) {
      this.wall.key = wk;
      if (this.wall.mesh) { this.group.remove(this.wall.mesh); this.wall.mesh.geometry.dispose(); this.wall.mesh = null; }
      if (st?.w.length) {
        const list: WallMarkGeo[] = [];
        for (const w of st.w) {
          const pc = L.pieces[w.pi]; if (!pc) continue;
          const along = pc.p.ax === 'x', t = (pc.p.t as number) ?? 200, X = ox + pc.x * LOC_SCALE, Y = oy + pc.y * LOC_SCALE;
          const fx = along ? w.x : X + w.n * t / 2, fy = along ? Y + w.n * t / 2 : w.y;
          list.push({ x: fx - ox, z: fy - oy, y: heightAt(fx, fy) + Math.min(w.z, ((pc.p.h as number) ?? 300) * 0.8), nx: along ? 0 : w.n, nz: along ? w.n : 0, s: w.s, seed: w.seed, col: lin((pc.p.col as string) ?? '#8e8a7e'), ground: heightAt(fx + (along ? 0 : w.n * 40), fy + (along ? w.n * 40 : 0)) });
        }
        this.O.clear(); wallMarks(this.O, list);
        if (this.O.vertexCount) { this.wall.mesh = new Mesh(this.O.build(), B.matFor(false)); this.group.add(this.wall.mesh); }
        this.O.clear();
      }
    }
    // 主角附近的替身用带镂空的材质（走到塌房背后也看得见人）
    const p = game.player;
    for (const b of this.built.values()) if (b.mesh) { const near = Math.abs(p.x - (ox + b.cx)) < 1400 && Math.abs(p.y - (oy + b.cz)) < 1400; const mm = B.matFor(near); if (b.mesh.material !== mm) b.mesh.material = mm; }
    this.stats.live = this.built.size;
  }

  /** 建一件构件的替身 */
  private build(game: Game, pv: TWPieceView, L: { pieces: { kind: string; x: number; y: number; seed: number; p: Record<string, any> }[] }, ox: number, oy: number, heightAt: (x: number, y: number) => number): Built | null {
    const B = this.hd.buildings, pc = L.pieces[pv.pi]; if (!pc) return null;
    const S = this.S, O = this.O, loc = this.loc!, tStart = performance.now();
    S.clear(); (S as ArchBuilder & { plaques?: Plaque[] }).plaques = [];
    let ok = false;
    if (pc.kind === 'ckit') {
      KIT_DMG.skip = pv.items; KIT_DMG.debris = kitDebris; KIT_DMG.seed = pv.seed;
      try { ok = B.buildPieceInto(loc, pv.pi, S, heightAt); } finally { KIT_DMG.skip = null; KIT_DMG.debris = null; }
    } else ok = B.buildPieceInto(loc, pv.pi, S, heightAt);
    if (!ok) return null;
    const tA = performance.now();
    let src = S, extra: Plaque[] = [];
    const ground = (x: number, z: number) => heightAt(ox + x, oy + z);
    if (pc.kind === 'cpaifang') {
      const st = pv.items.get(-1);
      if (st) { O.clear(); snapPiece(S, O, { seed: pv.seed, cutK: 0.42, rubble: st === 'broken', ground }); src = O; }
    } else if (pv.tier > 0) {
      const t = game.combat.wreck.town, m = t.here();
      const tg = m?.byId.get(pv.pi * 128);
      if (tg) {
        O.clear();
        const fr = FACE[(((pc.p.r as number) ?? 0) % 4 + 4) % 4];
        extra = damageHouse(S, O, { tier: pv.tier, seed: pv.seed, scaffold: pv.scaffold, fn: pv.fn, sign: pv.fn ? SIGN[pv.fn] : undefined,
          x0: tg.x0 - ox, z0: tg.y0 - oy, x1: tg.x1 - ox, z1: tg.y1 - oy, fx: pc.kind === 'ccourt' || pc.kind === 'B' ? 0 : fr[0], fz: pc.kind === 'ccourt' || pc.kind === 'B' ? 1 : fr[1], ground });
        src = O;
      }
    }
    const tB = performance.now();
    const plaques = [...((S as ArchBuilder & { plaques?: Plaque[] }).plaques ?? []), ...extra];
    let mesh: Mesh | null = null, plq: Mesh | null = null;
    if (src.vertexCount) { const geo = src.build(); geo.computeBoundingSphere(); mesh = new Mesh(geo, B.matFor(false)); this.group.add(mesh); }
    if (plaques.length) { plq = B.plaquesMesh(plaques); if (plq) this.group.add(plq); }
    S.clear(); O.clear();
    const tC = performance.now();
    this.stats.tS = Math.max(this.stats.tS, tA - tStart); this.stats.tPost = Math.max(this.stats.tPost, tB - tA); this.stats.tGeo = Math.max(this.stats.tGeo, tC - tB);
    return { key: pv.key, mesh, plq, cx: pc.x * LOC_SCALE, cz: pc.y * LOC_SCALE };
  }
  private drop(b: Built) {
    if (b.mesh) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); }
    if (b.plq) { this.group.remove(b.plq); b.plq.geometry.dispose(); }
  }
  /** 倒下的那一件：单独的网格，原点放在脚下（绕它转） */
  private makeFall(game: Game, f: TWFall, L: { pieces: { kind: string; x: number; y: number; seed: number; p: Record<string, any> }[] }, ox: number, oy: number, heightAt: (x: number, y: number) => number): FallM | null {
    const pc = L.pieces[f.pi]; if (!pc) return null;
    const S = this.S; S.clear(); (S as ArchBuilder & { plaques?: Plaque[] }).plaques = [];
    let px = pc.x * LOC_SCALE, pz = pc.y * LOC_SCALE, py = heightAt(ox + px, oy + pz), drop = 0;
    const kind = f.ii >= 0 ? ((pc.p.items as unknown[][])[f.ii]?.[0] as string) : 'paifang';
    if (f.ii >= 0) {
      if (!kitItemInto(S, pc, f.ii)) return null;
      const it = (pc.p.items as [string, number, number][])[f.ii];
      px += it[1]; pz += it[2];
    } else {
      if (!this.hd.buildings.buildPieceInto(this.loc!, f.pi, S, heightAt)) return null;
      // 整件是地点本地坐标：挪到以脚下为原点
      const R = S.raw();
      let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < R.count; i++) { const y = R.p[i * 3 + 1]; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let i = 0; i < R.count; i++) { R.p[i * 3] -= px; R.p[i * 3 + 1] -= py; R.p[i * 3 + 2] -= pz; }
      drop = (y1 - y0) * 0.42;
    }
    if (!S.vertexCount) return null;
    const geo: BufferGeometry = S.build(); geo.computeBoundingSphere();
    const mesh = new Mesh(geo, this.hd.buildings.matFor(false));
    mesh.position.set(px, py, pz);
    this.group.add(mesh);
    const pl = (S as ArchBuilder & { plaques?: Plaque[] }).plaques ?? [];
    let plq: Mesh | null = null;
    if (pl.length) { plq = this.hd.buildings.plaquesMesh(pl); if (plq) { plq.position.copy(mesh.position); this.group.add(plq); } }
    S.clear();
    void game;
    return { mesh, plq, f, kind, drop, done: false };
  }
  private q = new Quaternion(); private ax = new Vector3();
  /** u：0‥1 倒下的进度 */
  private pose(F: FallM, u: number) {
    u = Math.max(0, Math.min(1, u));
    const dir = F.f.dir, c = Math.cos(dir), s = Math.sin(dir);
    this.ax.set(s, 0, -c);   // 绕「地面上和倒向垂直的那根轴」转：竖着的朝倒向躺下去
    const m = F.mesh;
    if (F.kind === 'paifang') {
      // 上半截往下砸：歪一点、整个往下坠（下半截和替身里的断柱重合）
      const e = u * u;
      this.q.setFromAxisAngle(this.ax, 0.32 * e); m.quaternion.copy(this.q);
      m.scale.set(1, 1 - 0.25 * e, 1);
      m.position.y = m.userData.y0 ??= m.position.y; m.position.y = (m.userData.y0 as number) - F.drop * e;
    } else if (TALL.has(F.kind)) {
      // 先慢后快地倒下去，落地弹一下
      const th = u < 0.82 ? (Math.PI / 2) * Math.pow(u / 0.82, 2) : Math.PI / 2 - Math.sin((u - 0.82) / 0.18 * Math.PI) * 0.12;
      this.q.setFromAxisAngle(this.ax, th); m.quaternion.copy(this.q);
    } else {
      // 矮的：一歪、塌下去
      const e = 1 - Math.pow(1 - u, 2);
      this.q.setFromAxisAngle(this.ax, 0.35 * e); m.quaternion.copy(this.q);
      m.scale.set(1 + 0.15 * e, Math.max(0.15, 1 - 0.8 * e), 1 + 0.15 * e);
    }
    if (F.plq) { F.plq.quaternion.copy(m.quaternion); F.plq.scale.copy(m.scale); F.plq.position.copy(m.position); }
  }
  clear() {
    for (const b of this.built.values()) this.drop(b);
    this.built.clear();
    for (const F of this.falls.values()) { this.group.remove(F.mesh); F.mesh.geometry.dispose(); if (F.plq) { this.group.remove(F.plq); F.plq.geometry.dispose(); } }
    this.falls.clear();
    if (this.wall.mesh) { this.group.remove(this.wall.mesh); this.wall.mesh.geometry.dispose(); }
    this.wall = { key: '', mesh: null };
    if (this.hiddenKey) this.hd.buildings.setHidden(null, null);
    this.hiddenKey = ''; this.loc = null;
  }
}
const FACE: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
