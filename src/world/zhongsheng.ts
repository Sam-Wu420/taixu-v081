// v0.54：众生行——让人间真的热闹起来（只在你神识附近做细，远处照旧粗算）
// - 宗门巡山：走到大宗门左近，常能撞见三两个巡山弟子（宗门名册上的真人，能交谈、能结交）；与该宗结了深仇的，他们见你就动手
// - 散修猎妖：野外一伙散修正围着妖兽厮杀。你可以袖手、可以相助（妖兽伏诛后他们分你一份），也可以趁火打劫——动手他们就翻脸
// - 斗法抢宝：两伙修士为一件出土的宝物打得不可开交，打完胜者带宝离开；你插手、渔翁得利都行
// - 秘境开启：大秘境开启的日子，入口一带各路修士络绎不绝
// 这些人都「不冲你来」（noP）：不进自动锁定、你的同阵修士不打他们；你先动手，他们才翻脸。
import type { Game } from './game';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { LOCATIONS, LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP } from '../data/world';
import { SECT_DEF } from './roster';
import { MIJING, mjOpen, MIJING_ON } from '../data/mijing';
import { foeRealm } from './demog';
import { dirName } from './sites';
import * as C from './cultivation';

const TAU = Math.PI * 2;
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const SUR = ['孙', '钱', '周', '吴', '郑', '冯', '陈', '韦', '沈', '杨', '朱', '秦', '许', '何', '吕', '施', '张', '孔', '曹', '严'];
const GIV = ['青', '玄', '元', '守', '一', '道', '天', '无', '平', '松', '云', '鹤', '明', '远', '岳', '川', '阳', '真', '风', '石'];
const nm = () => pick(SUR) + pick(GIV) + (Math.random() < 0.5 ? pick(GIV) : '');

type Kind = 'patrol' | 'hunt' | 'duel' | 'crowd';
interface Group { kind: Kind; team: string; units: Enemy[]; beasts: Enemy[]; t: number; x: number; y: number; done?: boolean; helped?: boolean; tx?: number; ty?: number; label: string }

export class ZhongshengSys {
  groups: Group[] = [];
  private spawnT = 12; private seq = 1; private crowdNote = new Set<string>();
  constructor(public game: Game) {}
  reset() { this.groups = []; this.spawnT = 12; }

  update(dt: number) {
    const g = this.game, p = g.player, c = g.combat;
    if (g.mijing?.active || g.inCave) return;
    for (const G of this.groups) this.tick(G, dt);
    // 走远了 / 打完了：散去
    this.groups = this.groups.filter((G) => {
      const far = Math.hypot(G.x - p.x, G.y - p.y) > 4200;
      if (!(G.done || far || G.t > 240)) return true;
      // 散场：还「不冲你来」的人离场；已经和你翻脸的留在原地接着打（走远了才一并撤掉）
      for (const e of [...G.units, ...G.beasts]) { if (e.dead) continue; if (far || (e as any).noP) { const k = c.enemies.indexOf(e); if (k >= 0) c.enemies.splice(k, 1); } }
      return false;
    });
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 9 + Math.random() * 10;
    if (g.halted || g.hero.dead || c.inCombat || this.groups.length >= 3 || p.flying && g.alt > 0.6) return;
    if (g.terrain.inLocZone(p.x, p.y, 200)) return;   // 城里不刷
    // 先看有没有大秘境正开着
    for (const m of MIJING_ON ? MIJING : []) {
      if (m.tier !== 3 || !m.loc) continue;
      const l = LOC_BY_ID.get(m.loc); if (!l || (l.map ?? 'tiannan') !== ACTIVE_MAP || !mjOpen(m, g.day).open) continue;
      const ex = l.x * WORLD_SCALE, ey = l.y * WORLD_SCALE + 260;
      if (Math.hypot(ex - p.x, ey - p.y) < 9000) {
        if (!this.crowdNote.has(m.id)) { this.crowdNote.add(m.id); g.toast(`「${m.name}」禁制已开——一路上尽是赶往那边的修士。`, 'info'); }
        if (Math.random() < 0.7) { this.crowd(ex, ey, m.name); return; }
      }
    }
    // 宗门左近：巡山
    let sect: (typeof LOCATIONS)[number] | null = null, sd = 1e9;
    for (const l of LOCATIONS) { if (l.type !== 'sect' || (l.map ?? 'tiannan') !== ACTIVE_MAP || !SECT_DEF.get(l.id)) continue; const d = Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y); if (d < sd) { sd = d; sect = l; } }
    if (sect && sd < 7000 && sd > 1400 && Math.random() < 0.55) { this.patrol(sect.id); return; }
    const r = Math.random();
    if (r < 0.55) this.hunt(); else this.duel();
  }
  /** 你身旁一处空地（在你前方偏一点，不在城里、不在海上） */
  private spot(min = 650, max = 1100): { x: number; y: number } | null {
    const g = this.game, p = g.player, T = g.terrain;
    const yaw = p.st.yaw;
    for (let k = 0; k < 24; k++) {
      const an = Math.atan2(Math.cos(yaw), Math.sin(yaw)) + (Math.random() - 0.5) * 2.2, r = min + Math.random() * (max - min);
      const x = p.x + Math.cos(an) * r, y = p.y + Math.sin(an) * r;
      if (T.walkFactor(x, y) > 0 && !T.inLocZone(x, y, 300)) return { x, y };
    }
    return null;
  }
  private human(x: number, y: number, realm: number, stage: number, team: string, name: string): Enemy {
    const e = new Enemy(ENEMIES[realm >= 3 ? 'jindan_mo' : realm >= 2 ? 'zhujixiu' : 'bandit'], x, y, realm, stage);
    e.name = name; e.team = team; (e as any).noP = true; e.aggro = true; e.hx = x; e.hy = y;
    this.game.combat.enemies.push(e);
    return e;
  }
  // —— 散修猎妖
  private hunt() {
    const g = this.game, at = this.spot(); if (!at) return;
    const rb = g.combat.rollBeast(at.x, at.y, 0.2); if (!rb) return;
    const team = 'zs:hunt' + this.seq++, n = 2 + Math.floor(Math.random() * 2);
    const units: Enemy[] = [];
    for (let i = 0; i < n; i++) { const rk = foeRealm(g, at.x, at.y, 'rogue'); const r = Math.max(1, Math.min(rk.realm, rb.realm + (Math.random() < 0.4 ? 1 : 0))); units.push(this.human(at.x - 120 + i * 60, at.y + 80, r, rk.stage, team, `散修${nm()}`)); }
    const beasts: Enemy[] = [];
    const k = 1 + Math.floor(Math.random() * 2) + (rb.def.pack ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const e = new Enemy(rb.def, at.x + 80 + i * 50, at.y - 40 + i * 30, rb.realm, rb.stage);
      e.aggro = true; e.hx = at.x; e.hy = at.y; e.grudge = units[i % units.length]; e.grudgeT = g.time; e.tankRef = units[i % units.length]; e.tankT = 2;
      g.combat.enemies.push(e); beasts.push(e);
    }
    for (const u of units) { u.grudge = beasts[0]; u.grudgeT = g.time; u.tankRef = beasts[0]; u.tankT = 2; }
    this.groups.push({ kind: 'hunt', team, units, beasts, t: 0, x: at.x, y: at.y, label: `${n} 个散修围着${rb.def.name}厮杀` });
    g.toast(`神识中：${dirName(at.x - g.player.x, at.y - g.player.y)}边，几个散修正围着一头${rb.def.name}厮杀。`, 'info');
  }
  // —— 斗法抢宝
  private duel() {
    const g = this.game, at = this.spot(); if (!at) return;
    const ta = 'zs:duelA' + this.seq, tb = 'zs:duelB' + this.seq++;
    const units: Enemy[] = [];
    const rk = foeRealm(g, at.x, at.y, 'rogue');
    const sides: [string, number][] = [[ta, 1 + Math.floor(Math.random() * 2)], [tb, 1 + Math.floor(Math.random() * 2)]];
    sides.forEach(([team, n], si) => { for (let i = 0; i < n; i++) units.push(this.human(at.x + (si ? 120 : -120) + i * 30, at.y + i * 40, Math.max(1, rk.realm - (Math.random() < 0.4 ? 1 : 0)), rk.stage, team, `${si ? '散修' : '劫修'}${nm()}`)); });
    const A = units.filter((u) => u.team === ta), B = units.filter((u) => u.team === tb);
    for (const u of A) { u.grudge = B[0]; u.grudgeT = g.time; u.tankRef = B[0]; u.tankT = 2; }
    for (const u of B) { u.grudge = A[0]; u.grudgeT = g.time; u.tankRef = A[0]; u.tankT = 2; }
    this.groups.push({ kind: 'duel', team: ta + '|' + tb, units, beasts: [], t: 0, x: at.x, y: at.y, label: '两伙修士为一件出土的宝物斗法' });
    g.combat.vfx.push({ kind: 'pillar', x: at.x, y: at.y, r: 60, t: 0, dur: 2.5, color: '255,220,140' } as any);
    g.toast(`神识中：${dirName(at.x - g.player.x, at.y - g.player.y)}边宝光一闪，两伙修士为一件出土的宝物打了起来！`, 'info');
  }
  // —— 宗门巡山
  private patrol(sid: string) {
    const g = this.game, at = this.spot(700, 1200); if (!at) return;
    const def = SECT_DEF.get(sid)!;
    const rep = g.rel.sectRep(sid);
    const lo = 1, hi = Math.max(1, Math.min(2, g.hero.realm));
    const ds = g.roster.pick(sid, 2 + Math.floor(Math.random() * 2), lo, hi + 1, { skipTop: true });
    if (!ds.length) return;
    for (const d of ds) { d.x = at.x + (Math.random() - 0.5) * 120; d.y = at.y + (Math.random() - 0.5) * 60; d.tx = g.player.x + (Math.random() - 0.5) * 2400; d.ty = g.player.y + (Math.random() - 0.5) * 1600; d.title = `${def.name}巡山弟子`; d.map = ACTIVE_MAP as any; }
    if (rep <= -45) {
      // 与该宗结了深仇：一照面就动手
      const units: Enemy[] = [];
      for (const d of ds) { const a = g.npcs.summon(d.id); if (!a) continue; a.act = 'idle'; const e = g.npcs.toEnemy(a, true); if (e) { e.team = 'sect:' + sid; units.push(e); } }
      this.groups.push({ kind: 'patrol', team: 'sect:' + sid, units, beasts: [], t: 0, x: at.x, y: at.y, label: `${def.name}巡山弟子` });
      g.toast(`${def.name}的巡山弟子认出了你：「站住！你与本门的账，今日该算了！」`, 'warn');
      return;
    }
    this.groups.push({ kind: 'patrol', team: 'sect:' + sid, units: [], beasts: [], t: 0, x: at.x, y: at.y, label: `${def.name}巡山弟子` });
    g.toast(`${def.name}的巡山弟子从${dirName(at.x - g.player.x, at.y - g.player.y)}边山道走来。`, 'info');
  }
  // —— 秘境开启：赶路的人群
  private crowd(ex: number, ey: number, name: string) {
    const g = this.game, at = this.spot(800, 1300); if (!at) return;
    const team = 'zs:crowd' + this.seq++, n = 2 + Math.floor(Math.random() * 3);
    const units: Enemy[] = [];
    for (let i = 0; i < n; i++) { const rk = foeRealm(g, at.x, at.y, 'rogue'); const u = this.human(at.x + i * 40, at.y + (i % 2) * 40, rk.realm, rk.stage, team, `赶赴${name}的修士`); u.aggro = false; units.push(u); }
    this.groups.push({ kind: 'crowd', team, units, beasts: [], t: 0, x: at.x, y: at.y, tx: ex, ty: ey, label: `赶赴${name}的修士` });
  }

  private tick(G: Group, dt: number) {
    const g = this.game, c = g.combat;
    G.t += dt;
    const alive = G.units.filter((e) => !e.dead && c.enemies.includes(e));
    if (alive.length) { G.x = alive[0].x; G.y = alive[0].y; }
    if (G.kind === 'hunt') {
      const bAlive = G.beasts.filter((e) => !e.dead && c.enemies.includes(e));
      // 你打过这头妖兽（最后一次挨打在你出手之后）就算相助
      if (G.beasts.some((b) => b.lastHitBy > 0 && g.time - b.lastHitBy < 30 && !(b as any).npcLast)) G.helped = true;
      if (!bAlive.length && !G.done) {
        G.done = true;
        const friendly = alive.filter((u) => (u as any).noP);
        if (friendly.length && G.helped) {
          const ls = Math.round(20 * Math.pow(3, Math.max(1, friendly[0].realm)) * (0.6 + Math.random() * 0.6));
          C.addItem(g.hero, 'mat_lingshi', ls);
          g.toast(`${friendly[0].name}收起法器，冲你一拱手：「多谢道友援手！这一份是你的。」（灵石 +${ls}）`, 'good');
          g.ws.rep = Math.min(100, g.ws.rep + 1);
        } else if (friendly.length) g.toast(`${friendly[0].name}一伙剥了妖兽的皮，御器走了。`, 'info');
        for (const u of friendly) { u.dead = true; u.spar = true; u.deathT = 0.9; u.aggro = false; }
      }
      if (!alive.length && bAlive.length) { for (const b of bAlive) { b.grudge = undefined; b.tankRef = undefined; } G.done = G.t > 60; }
    } else if (G.kind === 'duel') {
      const [ta, tb] = G.team.split('|');
      const A = alive.filter((u) => u.team === ta && (u as any).noP), B = alive.filter((u) => u.team === tb && (u as any).noP);
      if (!G.done && (A.length === 0 || B.length === 0) && G.t > 2) {
        G.done = true;
        const win = A.length ? A : B;
        if (win.length) { g.toast(`${win[0].name}夺了宝物，化作一道遁光去了。`, 'info'); for (const u of win) { u.dead = true; u.spar = true; u.deathT = 0.9; u.aggro = false; } }
        else {
          // 两边都倒在你手里（或同归于尽）：宝物落地
          const pool = ['mat_xuantie', 'mat_chitong', 'mat_lingquan', 'zf_zhui', 'tal_pojin', 'pill_huiqi'];
          c.dropLoot(G.x, G.y, pick(pool), 1);
          const sk = c.randomScroll(Math.min(4, g.hero.realm + 1)); if (sk && Math.random() < 0.5) c.dropLoot(G.x + 30, G.y, sk, 1);
          g.toast('争夺的宝物滚落在地。', 'good');
        }
      }
    } else if (G.kind === 'crowd' && G.tx !== undefined) {
      for (const u of alive) {
        if (!(u as any).noP) continue;
        const dx = G.tx - u.x, dy = G.ty! - u.y, d = Math.hypot(dx, dy);
        if (d < 300) { u.dead = true; u.spar = true; u.deathT = 0.9; continue; }
        u.hx = u.x + dx / d * 400; u.hy = u.y + dy / d * 400;
        u.x += dx / d * 150 * dt; u.y += dy / d * 150 * dt; u.facing = dx > 0 ? 1 : -1;
      }
      if (!alive.length) G.done = true;
    }
    void TAU;
  }
}
