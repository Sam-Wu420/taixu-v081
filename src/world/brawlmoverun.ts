// 特殊招式的运行（brawlmoves.ts 是注册表和接口；这里是起手、每帧推进、收场，以及招式能调的框架方法）。
// 伤害一律走 combat.hitEnemy / hitPlayer / npcHit；击飞、上挑、砸下、顿帧、镜头都转给 BrawlSys 现成的那一套。
import type { Enemy } from './combat';
import type { BrawlSys } from './brawl';
import { moveArtId, type MoveCtx, type SpecialMove } from './brawlmoves';
import type { Action } from '../gfx/character';
import { ACTION_DUR, isWeaponAction } from '../gfx/character';
import { REALMS } from '../data/realms';

/** 一招在进行中（就是招式拿到的上下文，多一个「已收场」） */
export interface MoveRun extends MoveCtx { done: boolean }

/** 出招者攻力、境界（主角：近战攻力） */
const atkOf = (B: BrawlSys, u: Enemy | null) => (u ? u.atk : B.patk);
const realmOf = (B: BrawlSys, u: Enemy | null) => (u ? u.realm : B.g.hero.realm);

/** 起手（user = null 是主角）。target 不给：主角找锁定的 / 面前最近的，敌人默认打主角。返回出没出得了手 */
export function startMove(B: BrawlSys, def: SpecialMove, user: Enemy | null, target?: Enemy | 'p' | null): boolean {
  const g = B.g, c = B.combat, h = g.hero, p = g.player, art = moveArtId(def.id), R = def.range ?? 600;
  if (user === null) {
    if (def.who === 'npc' || (def.can && !def.can(B, null))) return false;
    if (B.pMove || B.pb.air || B.pSubT > 0 || B.clash.st || h.dead || !c.canAct) return false;   // r7-hs2：被眩晕 / 被擒拿着不能起手
    if ((c.cds.get(art) ?? 0) > 0) return false;
    if (def.realm && h.realm < def.realm) { g.toast(`${def.name}要到${REALMS[def.realm].name}期才使得出来。`, 'info'); return false; }
    if (h.mp < (def.mp ?? 0) - 1e-6) { g.toast('灵力不足。', 'info'); return false; }
    if (target === undefined) {
      const L = c.lock;
      if (L && !L.dead && Math.hypot(L.x - p.x, L.y - p.y) <= R) target = L;
      else { let bd = R; target = null; for (const e of c.enemies) { if (e.dead || e.hideT > 0) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; target = e; } } }
    }
  } else {
    if (def.who === 'player' || (def.can && !def.can(B, user))) return false;
    const b = B.body(user); if (b.move || b.air || b.subT > 0 || user.dead) return false;
    if (target === undefined) target = 'p';
  }
  const ux0 = user ? user.x : p.x, uy0 = user ? user.y : p.y;
  const tx = target === 'p' ? p.x : target ? target.x : NaN, ty = target === 'p' ? p.y : target ? target.y : NaN;
  let dx = tx - ux0, dy = ty - uy0;
  if (!(Math.abs(dx) + Math.abs(dy) > 1e-3)) { const yaw = user ? (user.cs?.yaw ?? 0) : p.st.yaw; dx = Math.sin(yaw); dy = Math.cos(yaw); }
  const L = Math.hypot(dx, dy) || 1;
  const run = makeCtx(B, def, user, target ?? null, dx / L, dy / L);
  if (def.begin?.(run) === false) return false;
  if (user === null) { h.mp -= def.mp ?? 0; c.cds.set(art, def.cd); c.cdMax.set(art, def.cd); c.combatT = 0; B.pMove = run; }
  else { user.skCd[def.id] = def.cd; B.body(user).move = run; B.track(user); }
  B.runs.push(run);
  return true;
}

/** 每帧推进所有在进行的招式；出招者被打飞、沉水、倒下就收场（interrupted） */
export function tickMoves(B: BrawlSys, dt: number) {
  const g = B.g;
  for (let i = B.runs.length - 1; i >= 0; i--) {
    const r = B.runs[i], u = r.user;
    const intr = u ? u.dead || B.isAir(u) || (B.peek(u)?.subT ?? 0) > 0 || !(B.combat.enemies.includes(u) || B.combat.allies.includes(u)) : B.pb.air || B.pSubT > 0 || g.hero.dead;
    let alive = !r.done && !intr;
    if (alive) { r.t += dt; try { alive = r.def.tick(r, dt); } catch (err) { alive = false; if ((globalThis as { __TAIXU_DEV?: boolean }).__TAIXU_DEV) console.warn(err); } }
    if (alive) continue;
    r.done = true;
    B.runs.splice(i, 1);
    if (u) { const b = B.peek(u); if (b && b.move === r) b.move = undefined; } else if (B.pMove === r) B.pMove = null;
    try { r.def.end?.(r, intr); } catch { /* 招式自己的收场出错不拖垮战斗 */ }
    B.moveEnded();   // r12-anim：招式给主角摆的长时长姿势（被擒拿、招式进行中）收场后不再盖住走跑
  }
}

function makeCtx(B: BrawlSys, def: SpecialMove, user: Enemy | null, target: Enemy | 'p' | null, dirX: number, dirY: number): MoveRun {
  const g = B.g, c = B.combat;
  const who = (w: Enemy | 'p' | null): Enemy | 'p' | null => (w === null ? target : w);
  const run: MoveRun = {
    B, def, user, target, dirX, dirY, t: 0, data: {}, done: false,
    hit(w, k, kind) {
      const t = who(w); if (!t) return false;
      k *= B.moveHitK?.(run) ?? 1;   // r9：撼山客燃身时第一阶段的招也多一成半（world/hsp2.ts 挂的钩子）
      const ax = user ? user.x : g.player.x, ay = user ? user.y : g.player.y;
      if (!user) return t === 'p' ? false : B.dealTo(t, B.patk * k, kind, ax, ay);
      if (t === 'p') return B.hurtPlayer(user.atk * k, user.realm, ax, ay, user, kind);
      const hp0 = t.hp; c.npcHit(user, t, user.atk * k, user.realm, undefined, ax, ay); B.log?.push({ k: kind, who: t.name, dmg: hp0 - t.hp }); return t.hp < hp0;
    },
    launch(w, ux, uy, D, vz) {
      const t = who(w); if (!t) return false;
      if (t === 'p') { B.launchPlayer(ux, uy, D, vz, user); return true; }
      const ok = B.launch(t, ux, uy, D, vz, user ?? 'p', realmOf(B, user), atkOf(B, user), false);
      if (ok && !user) B.flung = t;
      return ok;
    },
    up(w, riseK = 1) {
      const t = who(w); if (!t) return false;
      if (t === 'p') { B.launchPlayer(dirX, dirY, 120, 1300, user); return true; }
      const ok = B.launchUp(t, dirX, dirY, realmOf(B, user), atkOf(B, user), false, riseK);
      if (ok && !user) B.flung = t;
      return ok;
    },
    slam(w) {
      const t = w ?? (target === 'p' ? null : target); if (!t || !B.launchable(t)) return false;
      const z0 = Math.max(t.z, 260);
      B.meteorIn(t, user ?? 'p', z0, -2200, false);
      return true;
    },
    place(w, x, y, z) {
      const t = w === null ? user ?? 'p' : w;
      if (t === 'p') { const p = g.player; p.x = x; p.y = y; p.st.x = x; p.st.y = y; if (z !== undefined && g.isFlying) { p.z = p.zTarget = z; } return; }
      t.x = x; t.y = y; t.kx = t.ky = 0;
      if (z !== undefined) { t.flyH = Math.max(0, z); t.lift = 0; }
      if (t.cs) { t.cs.x = x; t.cs.y = y; }
    },
    act(w, a: Action) {
      const t = w === null ? user ?? 'p' : w;
      const dur = isWeaponAction(a) ? ACTION_DUR[a] : 0.4;
      if (t === 'p') { B.playAct(a, dur); return; }
      t.cs?.restart(a);
    },
    freeze(t) {
      const tg = target;
      if (user) { const b = B.body(user); b.freezeT = Math.max(b.freezeT, t); } else B.pb.freezeT = Math.max(B.pb.freezeT, t);
      if (tg === 'p') B.pb.freezeT = Math.max(B.pb.freezeT, t); else if (tg) { const b = B.body(tg); b.freezeT = Math.max(b.freezeT, t); B.track(tg); }
    },
    cam(k) { B.punchCam(k); },
    shake(k) { g.juice(0, k); },
    fx(ev) { c.fxq.push(ev as never); },
  };
  return run;
}
