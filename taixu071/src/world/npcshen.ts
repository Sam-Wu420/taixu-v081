// v0.54.2：众修神通——灵力化形、元婴出窍不再是你一个人的本事
// - 敌修：结丹以上会化形（招式见 foeskills 的 shenKit：照旧先亮预警、到点落实），这里画出它的灵兽法相；
//   元婴敌修会元婴出窍：肉身就地盘坐（另算一个可打的目标，血薄），元婴缩成尺许、遁速与出手都更凶。
//   打破它的肉身，元婴被震回、眩晕一阵，还要折损一截气血——这是破绽
// - 同行友人：结丹以上的会化形助你（用的就是你的化形实体，从友人身上起手）；元婴友人会出窍，
//   肉身留在原地（敌人会去打它，打破了友人就得退下调息）；阵修友人会就地布困阵 / 庚金剑阵 / 回春阵
// - 一切照旧是代码绘制 + v0.53 灵兽画材，没有新贴图
import type { Game } from './game';
import type { Enemy } from './combat';
import type { Active } from './npc';
import type { Drawable } from './life';
import type { FxSys, RGB } from '../gl/fx';
import type { FoeSkill, Hz } from './foeskills';
import { Enemy as EnemyC } from './combat';
import { FORMS, type FormId, type FormDef, drawSpirit, spawnHuaxingFrom } from './huaxing';
import { ARTS } from '../data/arts';
import { REALMS } from '../data/realms';
import { CharState, drawCharacter } from '../gfx/character';
import { audio } from './audio';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (u: number) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const rgb = (s: string): RGB => { const p = s.split(',').map(Number); return [p[0] / 255, p[1] / 255, p[2] / 255]; };
const GOLD: RGB = [1, 0.85, 0.52];
/** 元婴相对肉身的缩放（同主角） */
const YING_S = 0.46;
const hashS = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** 敌修化形时现出的灵兽法相（只是画面） */
interface Spirit {
  f: FormDef; src: Enemy; foe: boolean;
  x: number; y: number; h: number; face: number; tilt: number; pose: 'idle' | 'attack';
  t: number; tele: number; end: number; gone: number; alpha: number; len: number;
  sx: number; sy: number; tx: number; ty: number; ang: number; hz: Hz[]; n: number;
}
/** 敌修出窍 */
interface FoeYing { e: Enemy; body: Enemy; t: number; max: number; atk0: number; sp0: number }
/** 友人出窍 */
interface AllyYing { a: Active; st: CharState; bx: number; by: number; t: number; max: number; shield: number; maxShield: number; hitT: number }
interface Pillar { x: number; y: number; t: number; dur: number }

export class NpcShen {
  spirits: Spirit[] = [];
  foeY: FoeYing[] = [];
  allyY = new Map<string, AllyYing>();
  private pillars: Pillar[] = [];
  /** 友人的神通冷却（按人记，Active 会被重建） */
  private cd = new Map<string, { hx: number; ying: number; zf: number }>();
  constructor(public game: Game) {}
  reset() { this.spirits = []; this.foeY = []; this.allyY.clear(); this.pillars = []; this.cd.clear(); }

  // ------------------------------------------------------------ 敌修化形 / 出窍
  /** FoeAI.start 出招时调用：hz 是这一招刚亮出的预警 */
  foeCast(e: Enemy, sk: FoeSkill, hz: Hz[], tx: number, ty: number) {
    if (sk.k === 'ying') { this.pillars.push({ x: e.x, y: e.y, t: 0, dur: 0.9 }); return; }
    const f = FORMS[sk.hx!]; if (!f) return;
    const ang = Math.atan2(ty - e.y, tx - e.x), face = tx >= e.x ? 1 : -1;
    const tele = sk.tele + (sk.k === 'rain' ? (sk.n ?? 6) * 0.12 : 0);
    const S: Spirit = { f, src: e, foe: !e.ally, x: e.x - face * 80, y: e.y + 10, h: f.air > 0 ? 60 : 0, face, tilt: 0, pose: 'idle', t: 0, tele, end: tele + 0.5, gone: 0, alpha: 0,
      len: f.len * (e.realm >= 4 ? 1.05 : 0.85), sx: e.x, sy: e.y, tx, ty, ang, hz, n: 0 };
    const h0 = hz[0];
    if (h0) { S.tx = h0.k === 'line' ? h0.x + Math.cos(h0.ang) * h0.len : h0.x; S.ty = h0.k === 'line' ? h0.y + Math.sin(h0.ang) * h0.len * 0.8 : h0.y; }
    if (f.id === 'gui') { S.end = (sk.dur ?? 8) + 0.6; S.x = e.x - 90; }
    if (f.id === 'long') { S.x = e.x - Math.cos(ang) * 150; S.y = e.y - Math.sin(ang) * 60; S.h = f.air; }
    this.spirits.push(S);
    this.game.combat.impact(S.x, S.y, 1, f.color);
    audio.sfx('chime');
  }
  /** 元婴出窍（敌修 / 与你同阵的修士） */
  foeOut(e: Enemy) {
    const g = this.game, c = g.combat;
    if (e.dead || this.foeY.some((y) => y.e === e)) return;
    const def = { ...e.def, id: e.def.id + ':shell', drops: [], name: `${e.name}·肉身` };
    const body = new EnemyC(def, e.x, e.y, e.realm, e.stage, e.sea);
    body.name = `${e.name}·肉身`; body.look = e.look; body.cs = new CharState(e.x, e.y);
    body.cs.yaw = body.cs.targetYaw = e.cs?.yaw ?? 0; body.cs.setAction('sit'); (body.cs as any).blend = 1;
    body.maxHp = body.hp = Math.round(e.maxHp * 0.3); body.dfn = e.dfn * 0.3; body.atk = 0;
    body.team = e.team; body.aggro = e.aggro; body.spar = e.spar; body.kit = []; body.hx = e.x; body.hy = e.y;
    (body as any).shell = e; (body as any).noP = (e as any).noP;
    if (e.ally) { body.ally = true; c.allies.push(body); } else c.enemies.push(body);
    const Y: FoeYing = { e, body, t: 14, max: 14, atk0: e.atk, sp0: e.speed };
    e.atk *= 1.3; e.speed *= 1.6; (e as any).ying = Y;
    this.foeY.push(Y);
    this.pillars.push({ x: e.x, y: e.y, t: 0, dur: 0.9 });
    // 出窍一刹的神识冲击：身周一圈（亮预警，躲得开）
    c.foe.zone(e, e.x, e.y, 360, 'gold', 1.1, 0.35, { k: 'stun', dur: 0.8, ch: 0.6 });
    c.texts.push({ x: e.x, y: e.y - 150, s: '元婴出窍', color: '#ffd890', source: e, t: 0, vy: -20, big: true });
    g.cinema(e.x, e.y - 60, 1.08, 0.8);
    audio.sfx('bell');
    if (!e.ally && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 2000) g.toast(`${e.name}元婴出窍！肉身盘坐原地——打破它的肉身，元婴会被震回。`, 'warn');
    else if (e.ally) g.toast(`${e.name}元婴出窍，杀入敌阵！`, 'good');
  }
  /** 敌修元婴归窍；broken = 肉身被打破 */
  private foeBack(Y: FoeYing, broken: boolean) {
    const g = this.game, c = g.combat, e = Y.e, b = Y.body;
    e.atk = Y.atk0; e.speed = Y.sp0; (e as any).ying = undefined;
    this.foeY = this.foeY.filter((y) => y !== Y);
    if (e.dead) { if (!b.dead) { b.dead = true; b.deathT = 0; } return; }
    c.addGhosts(e.x, e.y, b.x, b.y, 6, '255,215,140', 0.4);
    e.x = b.x; e.y = b.y; e.kx = e.ky = 0;
    if (e.cs) { e.cs.x = b.x; e.cs.y = b.y; e.cs.strands.clear(); e.cs.springs.clear(); }
    if (!b.dead) { const L = b.ally ? c.allies : c.enemies, k = L.indexOf(b); if (k >= 0) L.splice(k, 1); }
    this.pillars.push({ x: b.x, y: b.y, t: 0, dur: 0.5 });
    e.skCd['yy_out'] = Math.max(e.skCd['yy_out'] ?? 0, broken ? 60 : 30);
    if (broken) {
      e.st.stun = { t: 2.5, dps: 0 };
      e.hp = Math.max(1, e.hp - e.maxHp * 0.18);
      c.texts.push({ x: e.x, y: e.y - 140, s: '肉身被破·元婴震回', color: '#ffb070', source: e, t: 0, vy: -24, big: true });
      c.impact(e.x, e.y, 2, '255,200,120');
      if (!e.ally) g.toast(`${e.name}的肉身被打破，元婴被震回肉身，一时动弹不得！`, 'good');
    }
    audio.sfx('whoosh');
  }

  // ------------------------------------------------------------ 同行友人
  private cdOf(id: string) { let c = this.cd.get(id); if (!c) { c = { hx: 0, ying: 0, zf: 0 }; this.cd.set(id, c); } return c; }
  isYing(a: Active) { return this.allyY.has(a.d.id); }
  /** 友人助战时先看能不能施展神通；施展了返回 true（这一轮不再普通出手） */
  allyTurn(a: Active, tgt: Enemy): boolean {
    const g = this.game, d = a.d, now = g.time, C = this.cdOf(d.id), st = a.st;
    const R = REALMS[d.realm], s = Math.min(d.stage, R.atk.length - 1), atk = R.atk[s];
    const foes = g.combat.enemies.filter((e) => !e.dead && e.aggro && !(e as any).noP && Math.hypot(e.x - tgt.x, e.y - tgt.y) < 420).length;
    // 元婴：出窍
    if (d.realm >= 4 && !this.isYing(a) && now >= C.ying && Math.random() < 0.5) { C.ying = now + 55 + Math.random() * 20; this.allyOut(a); return true; }
    // 结丹以上：化形（两形之一，按人定）
    if (d.realm >= 3 && now >= C.hx) {
      C.hx = now + 16 + Math.random() * 8;
      const h = hashS(d.id), forms: FormId[] = ['long', 'feng', 'hu', 'peng', 'qilin', 'yuan'];
      const f = forms[(Math.random() < 0.5 ? h : h >>> 7) % forms.length];
      const sk = ARTS['hx_' + f]; if (!sk) return false;
      const dx = tgt.x - st.x, dy = tgt.y - st.y, dd = Math.hypot(dx, dy) || 1;
      st.setAction('cast'); st.faceToward(dx, dy);
      spawnHuaxingFrom(g.combat, sk, d.realm >= 4 ? 2 : 1, atk * sk.power * 0.75 * (this.isYing(a) ? 1.25 : 1), { realm: d.realm, stCh: sk.status?.ch ?? 0, status: sk.status, school: '神' },
        { x: tgt.x, y: tgt.y, dx: dx / dd, dy: dy / dd, target: tgt }, sk.radius ?? 0, st.x, st.y - st.lift, d.realm >= 4);
      a.bubble = { text: `化形·${FORMS[f].name}！`, t: 1.6 };
      return true;
    }
    // 阵修（约三成友人懂阵，结丹以上都会）：被围就布困阵 / 杀阵，你伤重就布回春阵
    const zfOk = d.realm >= 3 || hashS(d.id + 'zf') % 10 < 3;
    if (zfOk && d.realm >= 2 && now >= C.zf) {
      const hurt = g.hero.hp < 0.5;
      const id = hurt ? 'huichun' : foes >= 2 ? (d.realm >= 3 && Math.random() < 0.5 ? 'gengjin' : 'kun') : '';
      if (id) {
        const at = hurt ? g.player : tgt;
        if (g.zhenfa.allyDeploy(id, at.x, at.y, d.realm, atk * 1.2, d.name)) { C.zf = now + 50 + Math.random() * 25; st.setAction('cast'); return true; }
      }
    }
    return false;
  }
  private allyOut(a: Active) {
    const g = this.game, st = a.st;
    const body = new CharState(st.x, st.y); body.yaw = body.targetYaw = st.yaw; body.setAction('sit'); (body as any).blend = 1;
    const Y: AllyYing = { a, st: body, bx: st.x, by: st.y, t: 18, max: 18, shield: 1, maxShield: 1, hitT: 0 };
    this.allyY.set(a.d.id, Y);
    st.strands.clear(); st.springs.clear();
    this.pillars.push({ x: st.x, y: st.y, t: 0, dur: 0.9 });
    // 出窍神识冲击：身周之敌受创、或被震住
    for (const e of g.combat.enemies) if (!e.dead && e.aggro && !(e as any).noP && Math.hypot(e.x - st.x, (e.y - st.y) * 1.2) < 380) {
      const R = REALMS[a.d.realm], s = Math.min(a.d.stage, R.atk.length - 1);
      g.combat.hitEnemy(e, R.atk[s] * 2, { realm: a.d.realm, status: { k: 'stun', dur: 1, ch: 0.6 }, stCh: 0.6, school: '识' }, st.x, st.y);
    }
    g.combat.impact(st.x, st.y, 2, '255,215,140');
    a.bubble = { text: '元婴出窍！', t: 1.8 };
    audio.sfx('bell');
    g.toast(`${a.d.name}元婴出窍——肉身留在原地，别让敌人打破了。`, 'good');
  }
  private allyBack(Y: AllyYing, broken: boolean) {
    const g = this.game, a = Y.a, st = a.st;
    this.allyY.delete(a.d.id);
    g.combat.addGhosts(st.x, st.y, Y.bx, Y.by, 6, '255,215,140', 0.4);
    st.x = Y.bx; st.y = Y.by; a.d.x = st.x; a.d.y = st.y;
    st.strands.clear(); st.springs.clear();
    this.pillars.push({ x: Y.bx, y: Y.by, t: 0, dur: 0.5 });
    if (broken) { (a as any).downT = 8; a.hp = Math.min(a.hp, 0.35); a.bubble = { text: '肉身受创……我先调息。', t: 2.5 }; g.toast(`${a.d.name}的肉身被打破，元婴震回，只得退下调息。`, 'warn'); }
  }
  /** 敌人打在友人盘坐的肉身上（combat.tankHit 的 abody 分支）：frac 为气血比例 */
  hitAllyBody(a: Active, frac: number) {
    const Y = this.allyY.get(a.d.id); if (!Y) return;
    Y.shield -= frac * 1.4; Y.hitT = 0.25;
    this.game.combat.texts.push({ x: Y.bx, y: Y.by - 120, s: Y.shield > 0 ? `护光 -${Math.max(1, Math.round(frac * 140))}%` : '护光碎裂', color: '#ffd890', t: 0, vy: -40 } as any);
    if (Y.shield <= 0) this.allyBack(Y, true);
  }
  /** 仇恨目标：友人的肉身（combat.buildTanks） */
  bodies(): { x: number; y: number; a: Active }[] { const out: { x: number; y: number; a: Active }[] = []; for (const Y of this.allyY.values()) out.push({ x: Y.bx, y: Y.by, a: Y.a }); return out; }
  /** 友人元婴走不出肉身左近 */
  leash(a: Active) {
    const Y = this.allyY.get(a.d.id); if (!Y) return;
    const st = a.st, dx = st.x - Y.bx, dy = st.y - Y.by, d = Math.hypot(dx, dy), L = 900;
    if (d > L) { st.x = Y.bx + dx / d * L; st.y = Y.by + dy / d * L; a.d.x = st.x; a.d.y = st.y; }
  }

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    const g = this.game, c = g.combat;
    for (const q of this.pillars) q.t += dt; this.pillars = this.pillars.filter((q) => q.t < q.dur);
    // 法相
    for (const S of this.spirits) this.tickSpirit(S, dt);
    this.spirits = this.spirits.filter((S) => S.gone < 0.5);
    // 敌修出窍
    for (const Y of [...this.foeY]) {
      const e = Y.e, b = Y.body;
      const inList = (b.ally ? c.allies : c.enemies).includes(b) || (e.ally ? c.allies : c.enemies).includes(e);
      if (!inList) { this.foeY = this.foeY.filter((y) => y !== Y); continue; }
      if (e.dead) { this.foeBack(Y, false); continue; }
      if (b.dead) { this.foeBack(Y, true); continue; }
      Y.t -= dt;
      b.x = b.hx; b.y = b.hy; b.kx = b.ky = 0;
      if (b.cs) { b.cs.x = b.x; b.cs.y = b.y; b.cs.setAction('sit'); b.cs.update(dt); }
      const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy), L = 900;
      if (d > L) { e.x = b.x + dx / d * L; e.y = b.y + dy / d * L; }
      if (Y.t <= 0) this.foeBack(Y, false);
    }
    // 友人出窍
    for (const Y of [...this.allyY.values()]) {
      const a = Y.a;
      if (!a.d.alive || a.act !== 'follow' || g.npcs.active.get(a.d.id) !== a) { this.allyY.delete(a.d.id); continue; }
      Y.t -= dt; Y.hitT = Math.max(0, Y.hitT - dt);
      Y.st.x = Y.bx; Y.st.y = Y.by; Y.st.setAction('sit'); Y.st.update(dt);
      if (Y.t <= 0) this.allyBack(Y, false);
    }
  }
  private tickSpirit(S: Spirit, dt: number) {
    S.t += dt;
    const e = S.src, f = S.f;
    if (S.t > S.end || (e.dead && S.t < S.tele)) { S.gone += dt; S.alpha = Math.max(0, 1 - S.gone / 0.45); return; }
    S.alpha = Math.min(1, S.t / 0.3);
    const u = S.t / S.tele;
    switch (f.id) {
      case 'long': {   // 身后盘起 → 到点沿预警直线贯穿
        if (S.t < S.tele) { S.x += (e.x - Math.cos(S.ang) * 150 - S.x) * Math.min(1, dt * 4); S.face = Math.cos(S.ang) >= 0 ? 1 : -1; return; }
        S.pose = 'attack';
        const k = ease((S.t - S.tele) / 0.35);
        S.x = S.sx + (S.tx - S.sx) * k; S.y = S.sy + (S.ty - S.sy) * k;
        return;
      }
      case 'feng': {   // 冲上半空 → 敛翼俯冲到预警圈心
        const dive = S.tele - 0.32;
        if (S.t < dive) { S.h = 60 + ease(S.t / Math.max(0.1, dive)) * (f.air + 60); S.x += (e.x - S.face * 60 - S.x) * Math.min(1, dt * 3); S.sx = S.x; S.sy = S.y; return; }
        const k = clamp((S.t - dive) / 0.32, 0, 1);
        S.pose = 'attack'; S.tilt = 0.5 * k;
        S.x = S.sx + (S.tx - S.sx) * k * k; S.y = S.sy + (S.ty - S.sy) * k * k; S.h = (f.air + 120) * (1 - k * k);
        if (S.t > S.tele) { S.pose = 'idle'; S.tilt = 0; S.h += dt * 300; }
        return;
      }
      case 'hu': case 'qilin': {   // 伏身 → 扑 / 腾空落入预警圈
        const T = f.id === 'hu' ? 0.28 : 0.5, jump = S.tele - T;
        if (S.t < jump) { S.x += (e.x - S.face * 70 - S.x) * Math.min(1, dt * 4); S.y += (e.y + 6 - S.y) * Math.min(1, dt * 4); S.sx = S.x; S.sy = S.y; return; }
        const k = clamp((S.t - jump) / T, 0, 1);
        S.x = S.sx + (S.tx - S.sx) * ease(k); S.y = S.sy + (S.ty - S.sy) * ease(k); S.h = Math.sin(k * Math.PI) * (f.id === 'hu' ? 90 : 220);
        S.pose = k > 0.5 ? 'attack' : 'idle';
        return;
      }
      case 'peng': {   // 盘旋在预警上空，每处落雷时扑下一道雷光
        const cx = S.tx, cy = S.ty, a = S.t * 2.6;
        S.h = f.air * Math.min(1, S.t / 0.4);
        S.x = cx + Math.cos(a) * 200; S.y = cy + Math.sin(a) * 70; S.face = -Math.sin(a) >= 0 ? 1 : -1;
        for (const h of S.hz) if (h.fired && !(h as any).pengT) {
          (h as any).pengT = 1; S.pose = 'attack'; S.n++;
          this.game.combat.vfx.push({ kind: 'chain', x: S.x, y: S.y - S.h, x2: h.x, y2: h.y - 20, r: 0, t: 0, dur: 0.28, color: f.color, fx: 'lightning', seed: Math.random() * 1e6, w: 4 } as any);
        }
        if (S.pose === 'attack' && Math.random() < dt * 5) S.pose = 'idle';
        return;
      }
      case 'yuan': {   // 立于身侧，到点抡臂横扫
        S.x += (e.x - Math.cos(S.ang) * 40 - S.x) * Math.min(1, dt * 5); S.y += (e.y - 8 - S.y) * Math.min(1, dt * 5);
        S.face = Math.cos(S.ang) >= 0 ? 1 : -1;
        S.pose = u >= 0.85 ? 'attack' : 'idle';
        return;
      }
      case 'gui': {   // 盘踞身侧护身，敌修护体期间一直在
        S.x += (e.x - 90 - S.x) * Math.min(1, dt * 3); S.y += (e.y + 20 - S.y) * Math.min(1, dt * 3); S.face = 1;
        if (e.guardT <= 0 && S.t > 1) S.end = Math.min(S.end, S.t);
        return;
      }
    }
  }

  // ------------------------------------------------------------ 绘制
  collect(out: Drawable[]) {
    const t = this.game.time;
    for (const S of this.spirits) {
      const air = S.f.air > 0 || S.h > 1;
      out.push({ y: S.y + (air ? 60 : 0), k: 'D·众修化形', draw: (g) => {
        if (S.alpha <= 0.01) return;
        // 敌方法相脚下一圈暗红煞气，一眼分得清敌我
        g.save();
        g.fillStyle = `rgba(${S.foe ? '150,30,30' : '30,30,24'},${0.22 * S.alpha * clamp(1 - S.h / 500, 0.3, 1)})`;
        g.beginPath(); g.ellipse(S.x, S.y + 4, S.len * 0.22, S.len * 0.07, 0, 0, TAU); g.fill();
        g.restore();
        const grow = S.gone > 0 ? 1 + S.gone * 0.4 : 0.6 + 0.4 * ease(S.t / 0.35);
        drawSpirit(g, S.f, S.pose, S.x, S.y, S.h, S.len * grow, S.face, S.alpha, t + S.len, S.tilt);
        if (S.foe) {
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.18 * S.alpha;
          const cy = S.y - S.h - S.len * 0.15, gr = g.createRadialGradient(S.x, cy, 0, S.x, cy, S.len * 0.45);
          gr.addColorStop(0, 'rgba(255,60,50,0.6)'); gr.addColorStop(1, 'rgba(255,60,50,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(S.x, cy, S.len * 0.45, 0, TAU); g.fill(); g.restore();
        }
      } });
    }
    for (const Y of this.foeY) {
      const b = Y.body, k = clamp(b.hp / b.maxHp, 0, 1);
      out.push({ y: b.y + 1, k: 'D·众修出窍', draw: (g) => drawShield(g, b.x, b.y, k, b.hitFlash > 0 ? 1 : 0, t) });
      out.push({ y: Y.e.y - 2, k: 'D·众修出窍', draw: (g) => drawAura(g, Y.e.x, Y.e.y - Y.e.lift, t, clamp(Y.t / Y.max, 0, 1)) });
    }
    for (const Y of this.allyY.values()) {
      const a = Y.a;
      out.push({ y: Y.by, k: 'D·众修出窍', draw: (g) => {
        g.save(); g.fillStyle = 'rgba(40,40,30,0.3)'; g.beginPath(); g.ellipse(Y.bx, Y.by + 2, 24, 7, 0, 0, TAU); g.fill();
        g.globalAlpha *= 0.92; drawCharacter(g, a.look, Y.st, a.d.beauty ? 1.06 : 1, 0); g.restore();
        drawShield(g, Y.bx, Y.by, clamp(Y.shield / Y.maxShield, 0, 1), Y.hitT * 4, t);
      } });
    }
    for (const q of this.pillars) out.push({ y: q.y + 2, k: 'D·众修出窍', draw: (g) => drawPillar(g, q) });
  }
  /** 友人元婴：npc.drawOne 里调——缩小 + 金光（返回缩放，null = 没出窍） */
  allyScale(a: Active, g: G): number | null {
    const Y = this.allyY.get(a.d.id); if (!Y) return null;
    drawAura(g, a.st.x, a.st.y - a.st.lift, this.game.time, clamp(Y.t / Y.max, 0, 1));
    return YING_S;
  }
  glow(F: FxSys, t: number, dt: number) {
    for (const S of this.spirits) {
      if (S.alpha <= 0.02) continue;
      const c = rgb(S.f.color), x = S.x, y = S.y - S.h - 50;
      F.glow(x, y, S.len * 0.38, c, 0.15 * S.alpha);
      if (Math.random() < dt * 25) F.sparks(x + (Math.random() - 0.5) * S.len * 0.4, y + (Math.random() - 0.5) * 50, c, 1, 60, 0.6, 3);
    }
    for (const Y of this.foeY) { F.glow(Y.e.x, Y.e.y - Y.e.lift - 28, 60, GOLD, 0.14); F.glow(Y.body.x, Y.body.y - 60, 80, GOLD, 0.08); }
    for (const Y of this.allyY.values()) { F.glow(Y.a.st.x, Y.a.st.y - Y.a.st.lift - 28, 60, GOLD, 0.14); F.glow(Y.bx, Y.by - 60, 80, GOLD, 0.08 * (0.4 + 0.6 * Y.shield)); }
    for (const q of this.pillars) if (q.t < dt * 1.5) { F.flash(q.x, q.y - 120, 140, GOLD, 0.2); F.sparks(q.x, q.y - 60, GOLD, 30, 340, 0.9, 4); }
    void t;
  }
}

/** 盘坐肉身外的护体金光（钟形光罩 + 底环 + 余量条） */
function drawShield(g: G, x: number, y: number, k: number, flash: number, t: number) {
  const R = 56, H = 140;
  g.save(); g.globalCompositeOperation = 'lighter';
  const a = (0.25 + 0.5 * k) * (0.85 + 0.15 * Math.sin(t * 3)) + flash * 0.35;
  const gr = g.createRadialGradient(x, y - H * 0.45, 4, x, y - H * 0.45, H * 0.7);
  gr.addColorStop(0, `rgba(255,220,150,${0.05 * a})`); gr.addColorStop(0.7, `rgba(255,205,120,${0.15 * a})`); gr.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(x - R, y); g.bezierCurveTo(x - R * 1.15, y - H * 0.6, x - R * 0.5, y - H, x, y - H); g.bezierCurveTo(x + R * 0.5, y - H, x + R * 1.15, y - H * 0.6, x + R, y); g.closePath(); g.fill();
  g.strokeStyle = `rgba(255,224,160,${0.5 * a})`; g.lineWidth = 2; g.stroke();
  g.setLineDash([6, 10]); g.lineDashOffset = -t * 30; g.lineWidth = 1.5;
  g.beginPath(); g.ellipse(x, y, R * 1.3, R * 0.42, 0, 0, TAU); g.stroke(); g.setLineDash([]);
  g.restore();
  g.save();
  g.fillStyle = 'rgba(20,16,10,0.5)'; g.fillRect(x - 28, y - H - 12, 56, 5);
  g.fillStyle = k > 0.35 ? 'rgba(255,214,130,0.95)' : 'rgba(255,120,90,0.95)'; g.fillRect(x - 28, y - H - 12, 56 * k, 5);
  g.restore();
}
/** 元婴周身金光 + 头后光轮 + 余时金弧 */
function drawAura(g: G, x: number, y: number, t: number, k: number) {
  const br = 1 + 0.06 * Math.sin(t * 3), R = 58 * br;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(x, y - 26, 2, x, y - 26, R);
  gr.addColorStop(0, 'rgba(255,240,200,0.5)'); gr.addColorStop(0.45, 'rgba(255,205,120,0.22)'); gr.addColorStop(1, 'rgba(200,160,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y - 26, R, 0, TAU); g.fill();
  g.strokeStyle = `rgba(255,226,160,${0.5 + 0.2 * Math.sin(t * 4)})`; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y - 50, 14 * br, 0, TAU); g.stroke();
  g.restore();
  g.save(); g.strokeStyle = 'rgba(255,220,150,0.85)'; g.lineWidth = 2.5; g.lineCap = 'round';
  g.beginPath(); g.arc(x, y - 74, 9, -Math.PI / 2, -Math.PI / 2 + k * TAU); g.stroke(); g.restore();
}
function drawPillar(g: G, q: Pillar) {
  const u = q.t / q.dur, a = Math.sin(Math.min(1, u) * Math.PI), H = 460, w = 40 * (1 - u * 0.4);
  g.save(); g.globalCompositeOperation = 'lighter';
  const top = q.y - 40 - H * Math.min(1, u * 1.8);
  const gr = g.createLinearGradient(0, q.y, 0, top);
  gr.addColorStop(0, `rgba(255,235,180,${0.7 * a})`); gr.addColorStop(0.5, `rgba(255,210,130,${0.35 * a})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(q.x - w / 2, top, w, q.y - top);
  g.strokeStyle = `rgba(255,220,150,${0.6 * a})`; g.lineWidth = 3;
  g.beginPath(); g.ellipse(q.x, q.y, 46 + u * 50, 15 + u * 16, 0, 0, TAU); g.stroke();
  g.restore();
}
