// 可破坏物（E2）：礁石、巨石、枯树、残骸——被击飞的人撞上就碎。
//   · 野外按地形成片程序化摆放：海岸和浅海的礁石、山地的巨石、林地的枯树、海滩偶有残骸；秘境的台面上也摆一些。
//     按分块取种子（hash32(块坐标, 图)）用自己的随机序列——不动地形、刷怪这些已有路径上的 Math.random。
//   · 有血量和半径；被击飞的人撞上：碎（碎块复用 gore 的切块）、扬尘、碎石粒子、地上留碎石地贴；
//     撞的人吃二次撞击伤害（brawl.impactDmg → hitEnemy / hitPlayer），减速但继续飞。法术的大范围技（combat.aoe）也打得碎。
//   · 数量有上限，离远了回收；碎掉的记一阵子（同一处过一会儿才重新长出来）。
//   · 立板绘制走 combatfx 的 collectCombat（给 hx / hy / hb），外观用代码画（水墨岩石、礁石、枯树、船骸），不加贴图。
import type { BrawlSys } from './brawl';
import type { Drawable } from './life';
import { SpatialIndex } from './spatial';
import { mulberry32 } from '../core/rng';
import { hash32, brnd } from './brawlrng';
import { makeCanvas } from '../core/canvas';
import { ACTIVE_MAP } from '../data/world';
import { audio } from './audio';

export type RockKind = 'reef' | 'boulder' | 'tree' | 'wreck';
export interface Rock {
  id: number; key: string; kind: RockKind; v: number;
  x: number; y: number; r: number; h: number; s: number; flip: boolean;
  hp: number; maxHp: number; wet: boolean;
  /** 刚挨了一下（画面抖一抖） */
  hitT: number; dead: boolean;
}

export const BK = {
  /** 分块边长；在你周围多远以内摆；离远了多远回收 */
  chunk: 1000, radius: 2600, keep: 3600,
  /** 同时最多几块（超出的按远近丢） */
  max: 150,
  /** 碎了以后多久（秒）同一处才重新长出来 */
  regrow: 300,
  /** 撞碎它要的速度（低于这个只是撞停、弹开） */
  smashV: 360,
  /** 「血量」按你的攻力折算（一下几成攻力的范围技打掉多少）：巨石最硬 */
  hp: { reef: 1.6, boulder: 2.6, tree: 1.2, wreck: 1.0 } as Record<RockKind, number>,
} as const;
/** 各种的大小（半径、高度：世界单位） */
const SIZE: Record<RockKind, { r: [number, number]; h: [number, number] }> = {
  reef: { r: [44, 74], h: [60, 110] }, boulder: { r: [48, 86], h: [80, 150] }, tree: { r: [22, 30], h: [190, 280] }, wreck: { r: [46, 64], h: [70, 130] },
};
/** 每种画几个样子 */
const VARIANTS = 4;

export class BreakSys {
  rocks: Rock[] = [];
  private idx = new SpatialIndex<Rock>(256, 8);
  private chunks = new Map<string, Rock[]>();
  private gone = new Map<string, number>();
  private scanX = NaN; private scanY = NaN; private scope = ''; private scanT = 0; private clock = 0;
  private nid = 1;
  /** 测试 / 试玩：关掉自动摆放（只留手摆的） */
  manual = false;
  /** 测试用：碎了几块 */
  smashed = 0;
  constructor(readonly B: BrawlSys) {}
  private get g() { return this.B.combat.game; }
  get n() { return this.rocks.length; }

  reset() { this.rocks = []; this.chunks.clear(); this.idx.rebuild(this.rocks); this.scanX = NaN; this.scope = ''; }

  /** 现在是哪一片（换图、进出秘境就整个换掉） */
  private scopeKey(): string {
    const g = this.g;
    if (g.xukong?.active || g.xukong?.fight?.on || g.inCave) return '';
    if (g.mijing.active) { const cur = (g.mijing as unknown as { cur: { fi: number; spec: { id?: string; name?: string } } }).cur; return `mj:${cur.spec.id ?? cur.spec.name ?? ''}:${cur.fi}`; }
    if (g.offWorld) return '';
    return 'w:' + ACTIVE_MAP;
  }

  update(dt: number) {
    this.clock += dt;
    for (const r of this.rocks) if (r.hitT > 0) r.hitT = Math.max(0, r.hitT - dt);
    const g = this.g, p = g.player;
    this.scanT -= dt;
    const sc = this.scopeKey();
    if (sc !== this.scope) { this.rocks = []; this.chunks.clear(); this.scope = sc; this.scanX = NaN; this.idx.rebuild(this.rocks); }
    if (!sc || this.manual) return;
    if (this.scanT > 0 && Math.hypot(p.x - this.scanX, p.y - this.scanY) < 500) return;
    this.scanT = 0.6; this.scanX = p.x; this.scanY = p.y;
    this.scan(p.x, p.y);
  }

  /** 把你周围的分块摆上、远处的收掉 */
  private scan(px: number, py: number) {
    const C = BK.chunk, R = BK.radius;
    let changed = false;
    // 回收
    for (const [k, list] of this.chunks) {
      const [cx, cy] = k.split(',').map(Number);
      if (Math.abs((cx + 0.5) * C - px) > BK.keep || Math.abs((cy + 0.5) * C - py) > BK.keep) { this.chunks.delete(k); changed = true; void list; }
    }
    // 摆放（每次最多新摆 6 块地，摊开到几帧里）
    let made = 0;
    const x0 = Math.floor((px - R) / C), x1 = Math.floor((px + R) / C), y0 = Math.floor((py - R) / C), y1 = Math.floor((py + R) / C);
    for (let cx = x0; cx <= x1 && made < 6; cx++) for (let cy = y0; cy <= y1 && made < 6; cy++) {
      const k = cx + ',' + cy;
      if (this.chunks.has(k)) continue;
      this.chunks.set(k, this.fill(cx, cy)); made++; changed = true;
    }
    if (made >= 6) this.scanT = 0.05;   // 还没摆完：下一帧接着摆
    if (changed) this.rebuild(px, py);
  }
  private rebuild(px: number, py: number) {
    const all: Rock[] = [];
    for (const list of this.chunks.values()) for (const r of list) if (!r.dead) all.push(r);
    if (all.length > BK.max) { all.sort((a, b) => Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py)); all.length = BK.max; }
    this.rocks = all; this.idx.rebuild(all);
  }

  /** 一块地上摆什么：按地形挑（自己的随机序列，种子按块坐标和图取） */
  private fill(cx: number, cy: number): Rock[] {
    const g = this.g, T = g.terrain, C = BK.chunk, out: Rock[] = [];
    const rnd = mulberry32(hash32(cx, cy, this.scope.length, this.scope.charCodeAt(2) || 0, this.scope.charCodeAt(this.scope.length - 1) || 0, 7331));
    const mj = g.mijing.active;
    const tries = mj ? 4 : 6;
    for (let i = 0; i < tries; i++) {
      const x = (cx + rnd()) * C, y = (cy + rnd()) * C, roll = rnd(), v = Math.floor(rnd() * VARIANTS), sz = rnd(), flip = rnd() < 0.5;
      const key = `${this.scope}:${cx},${cy}:${i}`;
      const goneAt = this.gone.get(key);
      if (goneAt !== undefined && this.clock - goneAt < BK.regrow) continue;
      let kind: RockKind | null = null, wet = false;
      if (mj) {
        // 秘境：台面上摆几块墨石（离台边远一点，不堵桥）
        if (roll < 0.3 && g.mijing.walk(x, y) && g.mijing.walk(x + 120, y) && g.mijing.walk(x - 120, y) && g.mijing.walk(x, y + 90) && g.mijing.walk(x, y - 90)) kind = 'boulder';
      } else {
        const land = T.isLand(x, y), s = T.sample(x, y);
        if (!land) {
          // 浅海、近岸的水：礁石
          if (s.land > 0.3 && roll < 0.5) { kind = 'reef'; wet = true; }
        } else if (this.clear(x, y)) {
          if (s.land < 0.62) { if (roll < 0.28) kind = 'reef'; else if (roll < 0.34) kind = 'wreck'; }
          else if (s.elev > 0.42) { if (roll < 0.42) kind = 'boulder'; }
          else if (s.forest > 0.5) { if (roll < 0.3) kind = 'tree'; }
          else if (roll < 0.05) kind = 'boulder';
        }
      }
      if (!kind) continue;
      const S = SIZE[kind];
      const r = S.r[0] + (S.r[1] - S.r[0]) * sz, h = S.h[0] + (S.h[1] - S.h[0]) * sz;
      out.push({ id: this.nid++, key, kind, v, x, y, r, h, s: r / ((S.r[0] + S.r[1]) / 2), flip, hp: BK.hp[kind] * (0.8 + sz * 0.4), maxHp: BK.hp[kind] * (0.8 + sz * 0.4), wet, hitT: 0, dead: false });
    }
    return out;
  }
  /** 能不能摆：站得住、不在路上、不在城镇宗门里、不压屋舍、不在安全区 */
  private clear(x: number, y: number) {
    const g = this.g, T = g.terrain;
    if (T.walkFactor(x, y) <= 0 || T.onRoad(x, y) || T.inLocZone(x, y, 700)) return false;
    if (g.space.blocked(x, y) || g.space.blocked(x + 80, y) || g.space.blocked(x - 80, y)) return false;
    if (this.B.combat.safeAt(x, y)) return false;
    return true;
  }

  /** 手摆一块（测试、试玩入口） */
  place(kind: RockKind, x: number, y: number, size = 0.6, v = 0): Rock {
    if (!this.scope) this.scope = this.scopeKey();   // 手摆的算在当前这一片里（不然下一帧发现「换了片」就清掉了）
    const S = SIZE[kind], r = S.r[0] + (S.r[1] - S.r[0]) * size, h = S.h[0] + (S.h[1] - S.h[0]) * size;
    const rk: Rock = { id: this.nid++, key: `m:${this.nid}`, kind, v: v % VARIANTS, x, y, r, h, s: r / ((S.r[0] + S.r[1]) / 2), flip: (this.nid & 1) === 0, hp: BK.hp[kind], maxHp: BK.hp[kind], wet: kind === 'reef' && this.B.deepWater(x, y), hitT: 0, dead: false };
    const ck = Math.floor(x / BK.chunk) + ',' + Math.floor(y / BK.chunk);
    const list = this.chunks.get(ck) ?? []; list.push(rk); this.chunks.set(ck, list);
    this.rocks.push(rk); this.idx.rebuild(this.rocks);
    return rk;
  }

  /** (x, y) 附近的 */
  near(x: number, y: number, R: number): readonly Rock[] { return this.rocks.length ? this.idx.nearby(x, y, R) : this.rocks; }
  /** 一个半径 rad、离地 z 的身子在 (x, y) 撞没撞上哪一块 */
  hit(x: number, y: number, z: number, rad: number): Rock | null {
    if (!this.rocks.length) return null;
    for (const r of this.idx.nearby(x, y, rad + 100)) {
      if (r.dead || z > r.h * 0.9) continue;
      const dx = x - r.x, dy = (y - r.y) * 1.4;
      if (dx * dx + dy * dy < (r.r + rad) * (r.r + rad)) return r;
    }
    return null;
  }

  /** 打碎：碎块（复用 gore 的切块）、扬尘、碎石、地贴；返回碎了没有 */
  smash(r: Rock, dir: number, power: number) {
    if (r.dead) return false;
    r.dead = true; r.hp = 0; this.smashed++;
    this.gone.set(r.key, this.clock);
    if (this.gone.size > 3000) { const cut = this.clock - BK.regrow; for (const [k, t] of this.gone) if (t < cut) this.gone.delete(k); }
    const c = this.B.combat;
    c.fxq.push({ k: 'rubble', x: r.x, y: r.y, r: r.r, dir, power: Math.min(3, power), kind: r.kind, big: r.wet });
    // 碎块：把它此刻的样子切成几块飞散（gore 的切块，石头不溅血）
    try {
      const S = rockSprite(r.kind, r.v);
      if (S) c.gore.shatterImage(S.image, S.l * r.s, S.r * r.s, S.t * r.s, S.b * r.s, r.x, r.y, 0, dir, 'rock', brnd, r.flip);
    } catch { /* 无头测试没有画布 */ }
    // 野外破坏（world/wreck.ts）：巨石、礁石、船骸再碎成几大块滚开，不只是一把碎屑
    c.wreck?.chunksOf(r, dir, power);
    audio.sfx(r.kind === 'tree' || r.kind === 'wreck' ? 'break' : 'boom', r.x, r.y);
    this.idx.rebuild(this.rocks = this.rocks.filter((q) => !q.dead));
    return true;
  }
  /** 野外破坏：整块拔起来（不碎、不出特效；同一处照样过一阵才重新长出来）。返回拔没拔成 */
  lift(r: Rock): boolean {
    if (r.dead) return false;
    r.dead = true; r.hp = 0;
    this.gone.set(r.key, this.clock);
    this.idx.rebuild(this.rocks = this.rocks.filter((q) => !q.dead));
    return true;
  }
  /** 挨一下（法术的范围技）：amt 按攻力折算 */
  damage(r: Rock, amt: number, dir: number) {
    if (r.dead) return;
    r.hp -= amt; r.hitT = 0.25;
    if (r.hp <= 0) this.smash(r, dir, 1.4);
    else this.B.combat.fxq.push({ k: 'rubble', x: r.x, y: r.y, r: r.r * 0.5, dir, power: 0.4, kind: r.kind });
  }
  /** 你的范围技落在 (x, y)、半径 R、伤害 dmg（combat.aoe 调） */
  blast(x: number, y: number, R: number, dmg: number) {
    if (!this.rocks.length) return;
    const atk = Math.max(1, this.B.combat.pStats.atk);
    const k = dmg / atk;
    if (k < 0.35) return;   // 小打小闹（持续伤害的一跳）敲不动石头
    const hit: Rock[] = [];
    for (const r of this.idx.nearby(x, y, R + 90)) if (!r.dead && Math.hypot(r.x - x, (r.y - y) * 1.3) < R + r.r * 0.6) hit.push(r);
    for (const r of hit) this.damage(r, k * (R >= 150 ? 1 : 0.6), Math.atan2(r.y - y, r.x - x));
  }
  /** 人走路时被石头挡住：从石头里推出来（只推贴地的） */
  pushOut(x: number, y: number, z: number, rad: number): { x: number; y: number } | null {
    if (!this.rocks.length) return null;
    let ox = x, oy = y, moved = false;
    for (const r of this.idx.nearby(x, y, rad + 100)) {
      if (r.dead || z > r.h * 0.7) continue;
      const dx = ox - r.x, dy = (oy - r.y) * 1.4, d = Math.hypot(dx, dy), need = r.r * 0.8 + rad;
      if (d >= need) continue;
      const ux = d > 0.01 ? dx / d : 1, uy = d > 0.01 ? dy / d : 0;
      ox = r.x + ux * need; oy = r.y + uy * need / 1.4; moved = true;
    }
    return moved ? { x: ox, y: oy } : null;
  }

  /** 立板（combatfx.collectCombat 调） */
  collect(out: Drawable[], view: { left: number; top: number; right: number; bottom: number }) {
    for (const r of this.rocks) {
      if (r.dead || r.x < view.left - 300 || r.x > view.right + 300 || r.y < view.top - 100 || r.y > view.bottom + 400) continue;
      const S = rockSprite(r.kind, r.v); if (!S) continue;
      const k = r.s, shake = r.hitT > 0 ? Math.sin(r.hitT * 90) * 4 * r.hitT * 4 : 0;
      const l = (r.flip ? -S.r : S.l) * k, rr = (r.flip ? -S.l : S.r) * k;
      out.push({ y: r.y, k: 'D·礁石', hx: r.x, hy: r.y, hb: [l - 8, rr + 8, S.t * k - 8, S.b * k + 8], draw: (g) => {
        g.save(); g.translate(r.x + shake, r.y); if (r.flip) g.scale(-1, 1);
        g.drawImage(S.image as CanvasImageSource, S.l * k, S.t * k, (S.r - S.l) * k, (S.b - S.t) * k);
        g.restore();
      } });
    }
  }
}

// ------------------------------------------------------------ 外观：用代码画（水墨岩石、礁石、枯树、船骸）
interface RockSprite { image: HTMLCanvasElement; l: number; r: number; t: number; b: number }
const SPR = new Map<string, RockSprite | null>();
/** 画好的样子（相对脚底的范围 l r t b，世界单位；画布按两倍细绘） */
export function rockSprite(kind: RockKind, v: number): RockSprite | null {
  const key = kind + v;
  if (SPR.has(key)) return SPR.get(key)!;
  let s: RockSprite | null = null;
  try { s = paint(kind, v); } catch { s = null; }
  SPR.set(key, s);
  return s;
}
function paint(kind: RockKind, v: number): RockSprite {
  const S = SIZE[kind], R = (S.r[0] + S.r[1]) / 2, H = (S.h[0] + S.h[1]) / 2;
  const l = -R * 1.5 - 20, r = R * 1.5 + 20, t = -H * 1.25 - 30, b = R * 0.55 + 16, K = 2;
  const cv = makeCanvas((r - l) * K, (b - t) * K) as HTMLCanvasElement, g = cv.getContext('2d')!;
  g.setTransform(K, 0, 0, K, -l * K, -t * K);
  const rnd = mulberry32(hash32(kind.charCodeAt(0), kind.charCodeAt(1), v, 911));
  if (kind === 'tree') paintTree(g, H, rnd);
  else if (kind === 'wreck') paintWreck(g, R, H, rnd);
  else paintStone(g, R, H, rnd, kind === 'reef');
  return { image: cv, l, r, t, b };
}
type G2 = CanvasRenderingContext2D;
/** 一块水墨山石：不规则的轮廓、浓淡两层墨、皴擦的笔触、苔点；礁石更黑、带湿光、藤壶和脚下一圈白浪 */
function paintStone(g: G2, R: number, H: number, rnd: () => number, reef: boolean) {
  // 地上的影子 / 浪
  if (reef) {
    g.fillStyle = 'rgba(236,246,250,0.55)'; g.beginPath(); g.ellipse(0, 4, R * 1.35, R * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,170,190,0.35)'; g.beginPath(); g.ellipse(0, 2, R * 1.12, R * 0.33, 0, 0, Math.PI * 2); g.fill();
  } else { g.fillStyle = 'rgba(25,20,14,0.28)'; g.beginPath(); g.ellipse(0, 4, R * 1.2, R * 0.36, 0, 0, Math.PI * 2); g.fill(); }
  // 轮廓：底宽顶窄，几个起伏的峰
  const n = 14, pts: [number, number][] = [];
  const peaks = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = Math.PI * u;   // 从右到左绕上半圈
    const bump = 0.75 + 0.35 * Math.abs(Math.sin(u * Math.PI * peaks + rnd() * 0.6)) + (rnd() - 0.5) * 0.18;
    pts.push([Math.cos(a) * R * (1.05 + (rnd() - 0.5) * 0.15), -Math.sin(a) * H * bump]);
  }
  const body = () => { g.beginPath(); g.moveTo(R * 1.1, 2); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(-R * 1.1, 2); g.closePath(); };
  const top = reef ? [36, 40, 46] : [118, 112, 100], mid = reef ? [22, 26, 32] : [78, 72, 64], low = reef ? [12, 14, 18] : [42, 38, 34];
  const grd = g.createLinearGradient(-R * 0.4, -H, R * 0.5, 0);
  grd.addColorStop(0, `rgb(${top})`); grd.addColorStop(0.55, `rgb(${mid})`); grd.addColorStop(1, `rgb(${low})`);
  body(); g.fillStyle = grd; g.fill();
  // 淡墨的受光面
  g.save(); body(); g.clip();
  g.fillStyle = reef ? 'rgba(140,170,185,0.22)' : 'rgba(235,225,200,0.22)';
  g.beginPath(); g.ellipse(-R * 0.35, -H * 0.62, R * 0.55, H * 0.32, -0.4, 0, Math.PI * 2); g.fill();
  // 皴擦：斜向的干笔
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = (rnd() - 0.5) * R * 1.8, y = -rnd() * H * 0.95, L = 10 + rnd() * R * 0.5;
    g.strokeStyle = `rgba(${reef ? '5,8,12' : '20,16,12'},${0.25 + rnd() * 0.35})`; g.lineWidth = 1 + rnd() * 2.4;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + L * 0.4, y + L * 0.2, x + L * 0.2, y + L * 0.8); g.stroke();
  }
  // 裂纹
  g.strokeStyle = reef ? 'rgba(0,0,0,0.6)' : 'rgba(18,14,10,0.55)'; g.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) { let x = (rnd() - 0.5) * R, y = -H * (0.3 + rnd() * 0.5); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 16; y += 8 + rnd() * 10; g.lineTo(x, y); } g.stroke(); }
  if (reef) {
    // 湿光、藤壶、海草
    g.strokeStyle = 'rgba(200,235,255,0.55)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const x = (rnd() - 0.6) * R, y = -H * (0.4 + rnd() * 0.45); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8 + rnd() * 10, y - 3); g.stroke(); }
    for (let i = 0; i < 14; i++) { const x = (rnd() - 0.5) * R * 1.8, y = -rnd() * H * 0.35; g.fillStyle = `rgba(210,205,190,${0.5 + rnd() * 0.4})`; g.beginPath(); g.arc(x, y, 1.5 + rnd() * 2.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(40,80,60,0.55)'; for (let i = 0; i < 6; i++) { const x = (rnd() - 0.5) * R * 1.6; g.beginPath(); g.ellipse(x, -6 - rnd() * 10, 4, 10 + rnd() * 8, (rnd() - 0.5) * 0.6, 0, Math.PI * 2); g.fill(); }
  } else {
    // 苔点
    for (let i = 0; i < 12; i++) { const x = (rnd() - 0.5) * R * 1.4, y = -H * (0.55 + rnd() * 0.4); g.fillStyle = `rgba(${60 + rnd() * 30},${95 + rnd() * 30},${50 + rnd() * 20},${0.45 + rnd() * 0.3})`; g.beginPath(); g.arc(x, y, 2 + rnd() * 3, 0, Math.PI * 2); g.fill(); }
  }
  g.restore();
  // 浓墨勾边（只勾上半，下沿化开）
  g.strokeStyle = reef ? 'rgba(0,0,0,0.75)' : 'rgba(22,18,14,0.7)'; g.lineWidth = 2.6; g.lineJoin = 'round';
  g.beginPath(); for (let i = 0; i < pts.length; i++) { const [x, y] = pts[i]; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
  if (reef) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, R * 1.05, R * 0.3, 0, 0.1, Math.PI - 0.1); g.stroke(); }
}
/** 枯树：扭曲的主干，几根斜出的枯枝，枝头细如发丝 */
function paintTree(g: G2, H: number, rnd: () => number) {
  g.fillStyle = 'rgba(25,20,14,0.28)'; g.beginPath(); g.ellipse(0, 4, 40, 12, 0, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round'; g.lineJoin = 'round';
  const branch = (x: number, y: number, a: number, L: number, w: number, depth: number) => {
    const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L, mx = (x + ex) / 2 + (rnd() - 0.5) * L * 0.35, my = (y + ey) / 2 + (rnd() - 0.5) * L * 0.2;
    g.strokeStyle = `rgba(${34 + depth * 8},${28 + depth * 7},${24 + depth * 6},0.95)`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
    if (depth >= 4 || w < 1.2) return;
    const n = depth === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) branch(ex, ey, a + (rnd() - 0.5) * 1.3 + (i - (n - 1) / 2) * 0.5, L * (0.55 + rnd() * 0.2), w * 0.58, depth + 1);
  };
  // 根
  for (let i = 0; i < 3; i++) branch(0, -6, Math.PI * (0.15 + rnd() * 0.7) * (i === 1 ? 1 : 1), 26 + rnd() * 14, 6, 3);
  branch(0, 0, -Math.PI / 2 + (rnd() - 0.5) * 0.3, H * 0.42, 14, 0);
  branch(0, -H * 0.18, -Math.PI / 2 - 0.9 - rnd() * 0.4, H * 0.3, 8, 1);
  branch(0, -H * 0.26, -Math.PI / 2 + 0.8 + rnd() * 0.4, H * 0.26, 7, 1);
  // 树皮的白痕
  g.strokeStyle = 'rgba(220,210,190,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) { const y = -10 - rnd() * H * 0.35; g.beginPath(); g.moveTo(-3, y); g.lineTo(2, y - 9); g.stroke(); }
}
/** 船骸：半埋的龙骨、断桅、破帆 */
function paintWreck(g: G2, R: number, H: number, rnd: () => number) {
  g.fillStyle = 'rgba(25,20,14,0.3)'; g.beginPath(); g.ellipse(0, 4, R * 1.3, R * 0.38, 0, 0, Math.PI * 2); g.fill();
  // 船身：一弯弧
  g.fillStyle = 'rgb(70,50,34)'; g.strokeStyle = 'rgba(20,14,8,0.85)'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(-R * 1.25, -H * 0.18); g.quadraticCurveTo(0, H * 0.12, R * 1.2, -H * 0.42); g.lineTo(R * 1.05, -H * 0.5); g.quadraticCurveTo(0, -H * 0.08, -R * 1.1, -H * 0.3); g.closePath(); g.fill(); g.stroke();
  // 肋骨
  g.strokeStyle = 'rgba(58,40,26,0.95)'; g.lineWidth = 4;
  for (let i = 0; i < 5; i++) { const x = -R * 0.9 + i * R * 0.42, y = -H * 0.2 - i * H * 0.05; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y - H * (0.35 + rnd() * 0.15), x + 14, y - H * (0.42 + rnd() * 0.12)); g.stroke(); }
  // 断桅、破帆
  const mx = R * 0.2, my = -H * 0.3;
  g.strokeStyle = 'rgb(48,34,22)'; g.lineWidth = 5; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - 18, -H * 1.15); g.stroke();
  g.fillStyle = 'rgba(200,185,150,0.75)'; g.beginPath(); g.moveTo(mx - 16, -H * 1.05); g.quadraticCurveTo(mx + 30, -H * 0.9, mx + 12, -H * 0.62); g.lineTo(mx + 2, -H * 0.7); g.lineTo(mx - 8, -H * 0.6); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(90,70,40,0.6)'; g.lineWidth = 1; g.stroke();
}
