// 主线开场（v0.70 原创重写）：回春谷采药少年苏寒，山洪后捡到无字残卷；黑狼帮为夺宝夜袭回春谷，
// 老郎中邹大夫护他出谷而死；他凭邹大夫留下的木牌上问仙大会，擂台上看三招学一招，被青霞谷收为外门弟子。之后完全自由。
// 旧版的任务链序章已移除（旧存档停在序章中途的，读档转为自由闯荡）。
import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import type { FxSys } from '../gl/fx';
import { LOC_BY_ID, LOCATIONS, WORLD_SCALE , ACTIVE_MAP } from '../data/world';
import { bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH as TOUCH } from '../core/touch';
import { ENEMIES } from '../data/enemies';
import { Enemy } from './combat';
import * as C from './cultivation';
import { itemDef } from '../data/items';
import { ARTS } from '../data/arts';
import { CharState, drawCharacter, Look } from '../gfx/character';
import { MO_LOOK, LI_LOOK, QUHUN_LOOK, JINGUANG_LOOK, JIA_LOOK, OUYANG_LOOK, YAN_LOOK, WAN_LOOK } from '../data/storylooks';
import { audio } from './audio';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface StoryState { step: string; f: Record<string, any> }
interface Actor { id: string; name: string; title: string; look?: Look; st?: CharState; x: number; y: number; prop?: 'bottle' | 'hut' | 'manor' | 'stall'; quest?: boolean; bubble?: string; hidden?: boolean }
interface FoeSpec { def: string; name?: string; realm: number; stage: number; hp?: number; atk?: number; look?: Look; boss?: boolean; tag?: string; height?: number }
interface Wave { foes: FoeSpec[]; intro?: string; introSpeaker?: string; introLook?: Look }
interface Fight { waves: Wave[]; wi: number; foes: Enemy[]; cx: number; cy: number; mind: boolean; onWin: () => void; retry: () => void; specials: Map<Enemy, { t: number; tag: string; pend?: { x: number; y: number; t: number } }> }

const CH_NAME: Record<number, string> = { 1: '序章', 2: '第一章', 3: '人界 · 自由' };

export class Story {
  game: Game;
  actors: Actor[] = [];
  focus: Actor | null = null;
  fight: Fight | null = null;
  cine: { kind: 'stars'; t: number; dur: number } | null = null;
  mind = 0;
  private A: Record<string, { x: number; y: number }> = {};
  private timers: { t: number; fn: () => void }[] = [];
  private introT = -1;

  constructor(game: Game) { this.game = game; }

  get S(): StoryState {
    const fl = this.game.ws.flags;
    if (!fl.story) fl.story = { step: 'free', f: {} };
    return fl.story as StoryState;
  }
  get active() { return this.S.step !== 'free'; }
  get chapter() { const s = this.S.step; return s.startsWith('c1') ? 1 : s.startsWith('c2') ? 2 : 3; }

  // ------------------------------------------------------------ 开局 / 读档
  /** 新开一局：开场回忆之后，苏寒已是青霞谷外门弟子，炼气五层，身怀问道残卷 */
  start() {
    this.game.ws.flags.story = { step: 'free', f: { opening: 'huangfeng' } } as StoryState;
    this.fight = null; this.cine = null; this.mind = 0; this.timers = []; this.actors = []; this.introT = -1;
    this.canonBackstory();
    this.openT = 1.0;
  }
  /** 开场往事：回春谷老郎中邹大夫为护苏寒，死在黑狼帮手里 */
  private canonBackstory() {
    this.hideCanon(false);
    const d = this.game.npcs.byId.get('modaifu') as any;
    if (d) { d.alive = false; d.deathNote = '为护苏寒出谷，死于黑狼帮之手'; this.game.npcs.active.delete('modaifu'); }
  }
  private openT = -1;
  private opening() {
    const g = this.game;
    const guide = () => this.N('青霞谷', '从今往后，路由你自己走：\n· 宗门（靠近山门按 G）：领俸禄、接任务、换取贡献；\n· 问道残卷 · 草木篇：每七日凝一滴墨露，滴在灵药上一株化三；\n· 问道残卷 · 观招篇：与人斗法，看得够多、挨得够多、躲得够多，便能把对方的功法学过来（法术书「问道残卷」页）；\n· 两年后的赤霄禁地，是筑基丹主药的唯一来源；\n· 梁国之外，还有南荒诸国、沧溟海、中州……\n\n活下去。然后，走得更远。', [this.O('好', undefined, { tone: 'gold' })], { mood: 'mystic' });
    const p3 = () => this.N('问仙大会', '南屏山下，问仙大会。\n\n测灵根的玉碑在你掌下只亮了一层灰光——伪灵根，五行驳杂，台下一片哄笑。\n\n可上了擂台，你只是看。对手第一招「流沙术」，你被困了个结实；第二招，你看清了他掐诀的手势；第三招，你躲开了。第四招——你学着他的样子，一掌按在地上，黄沙翻涌，把他困在了原地。\n\n满场寂静。怀里的残卷烫得像一块炭。\n\n青霞谷的执事长老看了你很久，在名册上写下一行字：「伪灵根，炼气五层……罢了。修仙一道，有时看的不是根骨。」', [this.O('踏入山门', guide, { tone: 'gold' })], { mood: 'mystic' });
    const p2 = () => this.N('回春谷之夜', '怀璧其罪。\n\n不知是谁走漏了风声，没过几天，黑狼帮的人连夜摸进回春谷——为首那人眼泛幽光，是个真正的修士。\n\n邹大夫一把将你推进药窖，压低声音：「别出声，天亮了往东走，别回头。」然后提着一把柴刀，挡在了门口。\n\n天亮时，你只找到一地狼藉。\n\n他的枕下压着一封信和一块刻着「问」字的旧木牌：「当年替青霞谷一位长老治过伤，他欠我一个人情。凭此牌，可上问仙大会，求一个入门的机会。——莫要报仇，好好活着。」', [this.O('收好木牌，往东走', p3)], { mood: 'danger' });
    this.say(this.N('回春谷', '梁国，白石镇外，回春谷。\n\n你叫苏寒，是谷里采药长大的孤儿。爹娘去得早，是谷中的老郎中邹大夫把你拉扯大——教你认药、熬汤，也教你几招防身的拳脚。\n\n十六岁那年夏天，一场山洪冲垮了半边山坡。你在溪谷乱石间捡到一卷巴掌宽的残卷：通篇无字，水泡不烂，火烧不着。\n\n当夜星光垂落，空白的卷首慢慢浮出四个古篆——「问道残卷」。卷尾，渗出了一滴乌亮的墨露。', [
      this.O('……', p2),
      this.O('跳过往事，直接踏入山门', guide),
    ], { mood: 'mystic' }));
    // v0.52.4：手机没有键盘，开局提示改说触屏操作
    g.hint('opening', TOUCH
      ? '提示：左手摇杆行走，推到底即疾行；右下法诀点一下即施法；右侧「谈」与人交谈，「≡」里是诸般法门。'
      : `提示：1–5 / 鼠标左右键 / X / V 施法，罗烟步闪身、御风诀赶路；${keyLabel(bindOf('sense'))} 神识外放，${keyLabel(bindOf('sit'))} 打坐，${keyLabel(bindOf('map'))} 地图。`);
  }
  resume() {
    this.fight = null; this.cine = null; this.mind = 0; this.timers = []; this.introT = -1;
    // 旧存档若停在序章 / 第一章中途：剧情直接结束，转为自由（序章不再出现）
    if (this.active) {
      const h = this.game.hero;
      h.bottle.owned = true; h.bottle.drops = Math.max(1, h.bottle.drops);
      if (C.bagCount(h, 'item_bottle') <= 0) C.addItem(h, 'item_bottle', 1);
      this.S.step = 'free';
      this.canonBackstory();
      this.game.toast('旧存档的序章剧情已结束，转为自由闯荡。', 'good');
    }
    if (!this.active) { this.actors = []; return; }
    this.anchors();
    if (this.chapter === 1) this.hideCanon(true);
    this.enter(this.S.step, true);
  }
  private hideCanon(h: boolean) {
    const n = this.game.npcs;
    for (const id of ['modaifu', 'lifeiyu']) { const d = n.byId.get(id) as any; if (d) { d.hidden = h; if (h) n.active.delete(id); } }
  }

  // ------------------------------------------------------------ 地点锚
  private spot(x: number, y: number, pad = 60, maxR = 2400, road = 0) {
    const T = this.game.terrain;
    for (let r = 0; r <= maxR; r += 50) {
      const n = r === 0 ? 1 : Math.max(8, Math.round(r / 40));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r * 0.013;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.75;
        if (T.walkFactor(px, py) > 0 && !T.inLocZone(px, py, pad) && !T.nearRiver(px, py) && (!road || (!T.nearRoad(px, py, road) && !T.nearRoad(px + 150, py - 80, road)))) return { x: px, y: py };
      }
    }
    return { x, y };
  }
  private zone(id: string) { const i = LOCATIONS.findIndex((l) => l.id === id); return this.game.terrain.locZones[i] ?? { x: (LOC_BY_ID.get(id)?.x ?? 0) * WORLD_SCALE, y: (LOC_BY_ID.get(id)?.y ?? 0) * WORLD_SCALE, rx: 300, ry: 220, id }; }
  private anchors() {
    const g = this.game, T = g.terrain;
    const q = this.zone('qixuan');
    this.A.valley = this.spot(q.x + q.rx + 1100, q.y + q.ry * 0.6 + 500, 80, 2400, 260);
    this.A.train = this.spot(q.x - q.rx * 0.4, q.y + q.ry + 260, 60);
    this.A.gate = this.spot(q.x + 200, q.y + q.ry + 700, 420);
    // 溪谷：回春谷附近最近的河道，取岸边可走的一点
    let best: { x: number; y: number } | null = null, bd = 1e12;
    const v = this.A.valley;
    for (let dy = -4200; dy <= 4200; dy += 70) for (let dx = -4200; dx <= 4200; dx += 70) {
      const x = v.x + dx, y = v.y + dy;
      if (!T.nearRiver(x, y)) continue;
      const d = dx * dx + dy * dy; if (d < bd && d > 1300 * 1300) { bd = d; best = { x, y }; }
    }
    let okBank = false;
    if (best) {
      const L = Math.sqrt(bd), ux = (v.x - best.x) / L, uy = (v.y - best.y) / L;
      let bx = best.x, by = best.y;
      for (let k = 0; k < 60 && (T.walkFactor(bx, by) <= 0 || T.nearRiver(bx, by)); k++) { bx += ux * 15; by += uy * 15; }
      if (Math.hypot(bx - best.x, by - best.y) < 700) { this.A.creek = { x: bx, y: by }; this.A.water = best; okBank = true; }
    }
    if (okBank) { /* ok */ } else { this.A.creek = this.spot(v.x + 1500, v.y + 900, 80); this.A.water = { x: this.A.creek.x + 60, y: this.A.creek.y + 30 }; }
    const j = this.zone('jiayuan');
    this.A.mofu = this.spot(j.x + j.rx * 0.25, j.y + j.ry + 160, 20, 2400, 90);
    this.A.duba = this.spot(j.x - j.rx - 1500, j.y + j.ry + 900, 450, 2400, 200);
    const t = this.zone('tainan');
    this.A.tainan = this.spot(t.x, t.y + t.ry + 160, 20);
    const h = this.zone('huangfeng');
    this.A.huangfeng = { x: h.x, y: h.y + h.ry * 0.6 };
  }

  // ------------------------------------------------------------ 演员
  private actor(id: string, name: string, title: string, look: Look | undefined, at: { x: number; y: number }, o: Partial<Actor> = {}) {
    const st = look ? new CharState(at.x, at.y) : undefined;
    if (st) st.faceToward(0, 1, true);
    const a: Actor = { id, name, title, look, st, x: at.x, y: at.y, ...o };
    this.actors = this.actors.filter((x) => x.id !== id);
    this.actors.push(a);
    return a;
  }
  private drop(id: string) { this.actors = this.actors.filter((x) => x.id !== id); }
  private get f() { return this.S.f; }

  private go(step: string) { this.S.step = step; this.enter(step); this.game.updateUI(true); }

  /** 进入某一步：布置演员（读档时 resume=true，不重复发放奖励） */
  private enter(step: string, _resume = false) {
    const A = this.A;
    this.actors = [];
    void step; void A;   // v0.70：旧序章已移除，不再生成剧情人物
  }

  // ------------------------------------------------------------ 目标与追踪
  goal(): { title: string; text: string; tx?: number; ty?: number } | null {
    const s = this.S.step, A = this.A, f = this.f, g = this.game;
    switch (s) {
    }
    return null;
  }
  tracker() {
    if (ACTIVE_MAP !== 'renjie') return null;
    if (!this.active) return null;
    const gl = this.goal(); if (!gl) return null;
    const p = this.game.player;
    const out: { ch: string; title: string; text: string; ang?: number; dist?: number; tx?: number; ty?: number } = { ch: CH_NAME[this.chapter], title: gl.title, text: gl.text };
    if (gl.tx !== undefined && gl.ty !== undefined) { out.tx = gl.tx; out.ty = gl.ty; out.ang = Math.atan2(gl.ty - p.y, gl.tx - p.x); out.dist = Math.hypot(gl.tx - p.x, gl.ty - p.y); }
    return out;
  }
  /** 宏观坐标（小地图标记） */
  marker() { const t = this.tracker(); return t && t.tx !== undefined ? { x: t.tx / WORLD_SCALE, y: t.ty! / WORLD_SCALE } : null; }

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    const g = this.game;
    if (ACTIVE_MAP !== 'renjie') return;   // 引导剧情只在人界
    if (this.openT > 0 && !g.paused && !g.modal && !g.pursuit?.cur) { this.openT -= dt; if (this.openT <= 0) this.opening(); }
    if (!this.active || g.hero.dead) return;
    const p = g.player, f = this.f, A = this.A;
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0); this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();
    if (g.paused) return;
    if (this.introT > 0) { this.introT -= dt; if (this.introT <= 0 && this.S.step === 'c1_intro') this.intro(); }
    this.mind += ((this.fight?.mind ? 1 : 0) - this.mind) * Math.min(1, dt * 2);
    // 焦点
    this.focus = null; let fd = 150;
    for (const a of this.actors) {
      if (a.prop === 'hut' || a.prop === 'manor' || a.prop === 'stall' || a.hidden) continue;
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < fd) { fd = d; this.focus = a; }
      if (a.st && d < 500) a.st.faceToward(p.x - a.x, p.y - a.y, false);
    }
    if (this.fight) this.fightTick(dt);
    if (this.cine) { this.cine.t += dt; this.starFx(); if (this.cine.t >= this.cine.dur) { this.cine = null; this.starsDone(); } }
    const near = (k: string, r: number) => Math.hypot(A[k].x - p.x, A[k].y - p.y) < r;
    void near;   // v0.70：旧序章步骤已移除
    // 寒毒（直到暖阳宝玉）
    if (f.handu && !f.cured) { f.hdT = (f.hdT ?? g.day + 20); if (g.day > f.hdT) { f.hdT = g.day + 25 + Math.random() * 20; g.toast('寒毒发作，你打了个寒战，指尖泛起一层青白。（邹府的暖阳宝玉可解）', 'warn'); } }
  }

  // ------------------------------------------------------------ 剧情对白
  private N(speaker: string, text: string, options: DOpt[], o: Partial<DNode> = {}): DNode { return { speaker, text, options, ...o }; }
  private O(label: string, act?: () => DNode | null | void, o: Partial<DOpt> = {}): DOpt { return { label, act, ...o }; }
  private say(n: DNode) { this.game.openDialog(n); }
  private reward(lines: string[]) { return lines.length ? `\n\n【${lines.join('　')}】` : ''; }
  private learn(id: string) { const h = this.game.hero; if (!h.arts.some((a) => a.id === id)) { h.arts.push({ id, xp: 0 }); const k = h.hotbar.findIndex((x) => !x); if (k >= 0) h.hotbar[k] = id; } return `习得：${ARTS[id].name}`; }
  private give(id: string, n = 1, age?: number) { C.addItem(this.game.hero, id, n, age); return `${itemDef(id).name}${n > 1 ? ' ×' + n : ''}`; }

  private intro() { /* v0.70：旧序章已移除（新开局直接自由闯荡） */ }
  private skipNode(): DNode { return this.N('序章', '序章已移除。', [this.O('好')]); }
  private skipAll() {
    const h = this.game.hero;
    h.bottle.owned = true; h.bottle.drops = Math.max(1, h.bottle.drops);
    if (C.bagCount(h, 'item_bottle') <= 0) C.addItem(h, 'item_bottle', 1);
    this.hideCanon(false);
    this.S.step = 'free'; this.actors = [];
    this.game.toast('序章已跳过。人界之大，任你行走。', 'good');
    this.game.updateUI(true);
  }

  interact(a: Actor) { void a; /* v0.70：旧序章人物已移除 */ }
  private moTask(): DNode { return this.N('……', '……', [this.O('好')]); }

  // ------------------------------------------------------------ 事件钩子
  onGather() {
    const s = this.S.step;
    if (s === 'c1_herb' || s === 'c1_bottle' || s === 'c1_herb2') {
      this.f.herbs = (this.f.herbs ?? 0) + 1;
      if (s === 'c1_herb2' && this.f.herbs >= 3) { const mo = this.actors.find((a) => a.id === 'mo'); if (mo) mo.quest = true; this.game.toast('灵草已够，回回春谷复命。', 'good'); }
    }
  }
  onBottle() { /* v0.70：旧序章的墨露剧情已移除 */ }
  onKill(_e: Enemy) { /* 由 fightTick 统一判定 */ }
  onSectJoin(id: string) { if (this.S.step === 'c2_huangfeng') this.finale(id); }
  /** 剧情战倒下：不受死亡惩罚，退出战斗并可重试 */
  onDown(): boolean {
    const fi = this.fight; if (!fi) return false;
    const g = this.game, h = g.hero;
    for (const e of fi.foes) { e.dead = true; e.deathT = 1; }
    g.combat.enemies = g.combat.enemies.filter((e) => !fi.foes.includes(e));
    this.fight = null;
    h.hp = 0.6; h.mp = Math.max(h.mp, 0.5); g.combat.invulnT = 2;
    g.toast(fi.mind ? '你的神识一阵剧痛，猛地挣脱出来——再来一次！（剧情战败不受惩罚）' : '你重伤遁走，捡回一条命。（剧情战败不受惩罚，可再次挑战）', 'warn');
    fi.retry();
    return true;
  }

  // ------------------------------------------------------------ 星光凝露
  private starFx() {
    const F = this.game.renderer?.fx; if (!F || !this.cine) return;
    const p = this.game.player, bx = p.x + 16, by = p.y - 70;
    const k = Math.min(1, this.cine.t / 1.5) * Math.min(1, (this.cine.dur - this.cine.t) / 1.2);
    for (let i = 0; i < 3; i++) if (Math.random() < k) {
      const sx = bx + rand(-520, 520), sy = by - rand(500, 900);
      const tt = rand(0.9, 1.5);
      F.emit({ x: sx, y: sy, vx: (bx - sx) / tt, vy: (by - sy) / tt, life: tt, s0: rand(5, 9), s1: 2, c: [0.75, 1, 0.85], a: 0.9, stretch: 0.02 });
    }
    if (Math.random() < k * 0.5) F.emit({ x: bx + rand(-8, 8), y: by + rand(-8, 8), vx: rand(-20, 20), vy: rand(-40, -10), life: 0.8, s0: 6, s1: 1, c: [0.5, 1, 0.6], a: 0.8 });
  }
  private starsDone() {
    const g = this.game, h = g.hero;
    h.bottle.drops = Math.max(1, h.bottle.drops); h.bottle.charge = 0;
    const F = g.renderer?.fx; if (F) { const p = g.player; F.flash(p.x + 16, p.y - 70, 50, [0.5, 1, 0.65]); }
    audio.sfx('chime');
    this.go('c1_ripen');
    this.say(this.N('夜', '夜深了。\n\n怀里的残卷越来越烫。你取出展开，只见点点星光像被一只看不见的手牵引着，从天幕上丝丝缕缕地垂落，没入空白的卷面。卷面亮起一层青蒙蒙的光晕，整整一夜，没有熄灭。\n\n天将破晓，光晕散去。卷首浮出了几行细若蚊足的古篆，卷尾则渗出一滴乌亮的墨露，凝而不散。', [this.O('……')], { mood: 'mystic' }));
  }

  // ------------------------------------------------------------ 邹大夫之夜
  private moNight() { /* 已移除 */ }
  private moHunt(fled = false) { void fled; }
  private mindFight() { /* 已移除 */ }
  private moWin(mind: boolean) { void mind; }

  // ------------------------------------------------------------ 黑狼帮 · 金阙上人
  private wolfFight() { /* 已移除 */ }
  private wolfWin() { /* 已移除 */ }

  // ------------------------------------------------------------ 独霸山庄
  private dubaFight() { /* 已移除 */ }

  // ------------------------------------------------------------ 终章
  private finale(sect: string) { void sect; }

  // ------------------------------------------------------------ 战斗
  private startFight(waves: Wave[], o: { mind?: boolean; onWin: () => void; retry: () => void }) {
    const p = this.game.player;
    if (o.mind) for (const e of this.game.combat.enemies) if (!e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 2000) { e.dead = true; e.deathT = 1; }
    this.fight = { waves, wi: -1, foes: [], cx: p.x, cy: p.y, mind: !!o.mind, onWin: o.onWin, retry: o.retry, specials: new Map() };
    this.nextWave();
  }
  private nextWave() {
    const fi = this.fight, g = this.game, p = g.player;
    if (!fi) return;
    fi.wi++;
    const w = fi.waves[fi.wi];
    if (!w) { const win = fi.onWin; this.fight = null; win(); return; }
    if (w.intro && fi.wi > 0) this.say(this.N(w.introSpeaker ?? '', w.intro, [this.O('……')], { mood: 'danger', look: w.introLook }));
    fi.foes = [];
    w.foes.forEach((s, i) => {
      const def = ENEMIES[s.def]; if (!def) return;
      const an = (i / Math.max(1, w.foes.length)) * TAU + rand(-0.3, 0.3);
      const d = s.boss ? 420 : rand(380, 560);
      let x = p.x + Math.cos(an) * d, y = p.y + Math.sin(an) * d * 0.7;
      if (!def.flying && g.terrain.walkFactor(x, y) <= 0) { x = p.x + Math.cos(an) * 200; y = p.y + Math.sin(an) * 140; }
      const e = new Enemy(def, x, y, Math.max(0, Math.min(5, s.realm)), Math.max(0, Math.min(12, s.stage)));
      if (s.name) e.name = s.name;
      if (s.hp) e.maxHp = e.hp = Math.round(e.hp * s.hp);
      if (s.atk) e.atk *= s.atk;
      if (s.look) e.look = { ...s.look };
      if (s.height && e.look) e.look.height = s.height;
      e.boss = !!s.boss; e.aggro = true; e.hx = x; e.hy = y;
      g.combat.enemies.push(e); fi.foes.push(e);
      if (s.tag) fi.specials.set(e, { t: s.tag === 'jinguang' ? 4 : 6, tag: s.tag });
      const F = g.renderer?.fx; if (F) F.smoke(x, y, 6, [0.2, 0.18, 0.16], 0.4, 20, 50);
    });
  }
  private fightTick(dt: number) {
    const fi = this.fight!, g = this.game, p = g.player, c = g.combat;
    // 敌人保持仇恨
    for (const e of fi.foes) if (!e.dead) { e.aggro = true; e.flee = false; }
    // 识海：限制活动范围
    if (fi.mind) {
      const dx = p.x - fi.cx, dy = p.y - fi.cy, d = Math.hypot(dx, dy);
      if (d > 620) { p.x = fi.cx + dx / d * 620; p.y = fi.cy + dy / d * 620; }
    } else if (Math.hypot(p.x - fi.cx, p.y - fi.cy) > 2200) {
      // 逃离：撤销本次战斗
      for (const e of fi.foes) e.dead = true;
      c.enemies = c.enemies.filter((e) => !fi.foes.includes(e));
      const retry = fi.retry; this.fight = null;
      g.toast('你脱离了战斗。（回到原地可再次挑战）', 'warn');
      retry(); return;
    }
    // 特殊招式
    for (const [e, sp] of fi.specials) {
      if (e.dead) continue;
      sp.t -= dt;
      if (sp.pend) {
        sp.pend.t -= dt;
        if (sp.pend.t <= 0) {
          const { x, y } = sp.pend; sp.pend = undefined;
          if (sp.tag === 'jinguang') {
            c.vfx.push({ kind: 'bigsword', x: e.x, y: e.y - 60, x2: x, y2: y - 20, r: 60, t: 0, dur: 0.7, color: '255,220,120', fx: 'bigsword', seed: Math.random() * 1e6 } as any);
            c.vfx.push({ kind: 'ring', x, y, r: 150, t: 0, dur: 0.5, color: '255,220,120', fx: 'gold' } as any);
            g.trauma = Math.min(1, g.trauma + 0.3);
            if (Math.hypot(p.x - x, p.y - y) < 135) c.hitPlayer(e.atk * 3.4, e.realm, { k: 'knock', dur: 0.3, ch: 1 }, x, y, e);
          }
        }
      } else if (sp.t <= 0) {
        if (sp.tag === 'jinguang') { sp.t = rand(5, 7); sp.pend = { x: p.x, y: p.y, t: 1.05 }; c.vfx.push({ kind: 'warn', x: p.x, y: p.y, r: 135, t: 0, dur: 1.05, color: '255,210,100' } as any); c.texts.push({ x: e.x, y: e.y - 120, s: '符宝！', color: '#ffd870', source: e, t: 0, vy: -30 } as any); }
        else if (sp.tag === 'mosoul') { sp.t = rand(7, 9); const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; p.x += dx / d * Math.min(160, d * 0.5); p.y += dy / d * Math.min(110, d * 0.35); g.hero.mp = Math.max(0, g.hero.mp - 0.12); g.hurtFlash = Math.max(g.hurtFlash, 0.6); c.texts.push({ x: p.x, y: p.y - 120, s: '神魂被扯动！', color: '#ff8070', t: 0, vy: -30 } as any); }
        else if (sp.tag === 'mo') { sp.t = rand(9, 12); c.texts.push({ x: e.x, y: e.y - 120, s: '尸虫丸！', color: '#a0e0a0', source: e, t: 0, vy: -30 } as any); }
      }
    }
    if (this.fight !== fi) return;
    if (fi.foes.every((e) => e.dead)) this.nextWave();
  }

  // ------------------------------------------------------------ 绘制
  collect(out: { y: number; draw: (g: G) => void }[], view: { left: number; top: number; right: number; bottom: number }, t: number, dt: number) {
    if (!this.active) return;
    const g = this.game;
    for (const a of this.actors) {
      if (a.hidden) continue;
      if (a.x < view.left - 400 || a.x > view.right + 400 || a.y < view.top - 400 || a.y > view.bottom + 300) continue;
      const v = g.life.vis(a); if (v <= 0.01) continue;
      out.push({ y: a.y, draw: (ctx) => this.drawActor(ctx, a, v, t, dt) });
    }
    if (this.cine && !g.renderer?.stage) {
      const p = g.player, k = Math.min(1, this.cine.t / 1.5) * Math.min(1, (this.cine.dur - this.cine.t) / 1.2);
      out.push({ y: p.y + 1, draw: (ctx) => { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 24; i++) { const u = (t * 0.6 + i / 24) % 1, sx = p.x + Math.sin(i * 7.3) * 500 * (1 - u) + 16, sy = p.y - 70 - (1 - u) * 800; ctx.strokeStyle = `rgba(170,255,200,${0.6 * k * u})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (p.x + 16 - sx) * 0.08, sy + 30); ctx.stroke(); } const gr = ctx.createRadialGradient(p.x + 16, p.y - 70, 0, p.x + 16, p.y - 70, 60); gr.addColorStop(0, `rgba(140,255,170,${0.7 * k})`); gr.addColorStop(1, 'rgba(140,255,170,0)'); ctx.fillStyle = gr; ctx.fillRect(p.x - 50, p.y - 140, 140, 140); ctx.restore(); } });
    }
  }
  private drawActor(ctx: G, a: Actor, v: number, t: number, dt: number) {
    ctx.save(); ctx.globalAlpha *= v;
    if (a.prop === 'hut') this.drawHut(ctx, a.x, a.y);
    else if (a.prop === 'manor') this.drawManor(ctx, a.x, a.y);
    else if (a.prop === 'stall') { ctx.fillStyle = '#6a4a2e'; ctx.fillRect(a.x - 50, a.y - 34, 100, 34); ctx.fillStyle = '#e6d8b0'; ctx.fillRect(a.x - 58, a.y - 40, 116, 8); ctx.fillStyle = '#b8a070'; for (let i = 0; i < 4; i++) ctx.fillRect(a.x - 42 + i * 24, a.y - 50, 14, 10); }
    else if (a.prop === 'bottle') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(a.x, a.y - 8, 0, a.x, a.y - 8, 46);
      gr.addColorStop(0, `rgba(150,255,180,${0.45 + 0.3 * pulse})`); gr.addColorStop(1, 'rgba(150,255,180,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(a.x, a.y - 8, 46, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#2f5a3a'; ctx.beginPath(); ctx.ellipse(a.x, a.y - 8, 7, 10, 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1e3a26'; ctx.fillRect(a.x - 2 + 5, a.y - 22, 4, 7);
      ctx.strokeStyle = 'rgba(200,255,210,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a.x - 2, a.y - 10, 4, 3.6, 5); ctx.stroke();
      for (let i = 0; i < 3; i++) { const u = (t * 0.5 + i / 3) % 1; ctx.fillStyle = `rgba(190,255,210,${(1 - u) * 0.8})`; ctx.beginPath(); ctx.arc(a.x + Math.sin(i * 5 + t) * 10, a.y - 14 - u * 40, 2, 0, TAU); ctx.fill(); }
    } else if (a.look && a.st) {
      a.st.update(dt);
      drawCharacter(ctx, a.look, a.st, 1, dt);
    }
    // 名字 / 任务标记
    if (a.name && a.look) {
      ctx.font = '15px "Ma Shan Zheng", "STKaiti", serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,16,12,0.6)'; ctx.fillText(a.name, a.x + 1, a.y - 168 + 1);
      ctx.fillStyle = this.focus === a ? '#ffe7a8' : '#f2e6c8'; ctx.fillText(a.name, a.x, a.y - 168);
    }
    if (a.quest) {
      const by = a.y - (a.look ? 196 : 60) + Math.sin(t * 3) * 5;
      ctx.font = 'bold 30px serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(40,20,0,0.5)'; ctx.fillText('！', a.x + 1, by + 2);
      ctx.fillStyle = '#ffcf4a'; ctx.fillText('！', a.x, by);
    }
    if (a.bubble && a.look) {
      ctx.font = '13px serif'; const w = ctx.measureText(a.bubble).width + 16;
      ctx.fillStyle = 'rgba(250,244,230,0.92)'; ctx.fillRect(a.x - w / 2, a.y - 150, w, 22);
      ctx.fillStyle = '#4a3a2a'; ctx.textAlign = 'center'; ctx.fillText(a.bubble, a.x, a.y - 134);
    }
    ctx.restore();
  }
  private drawHut(ctx: G, x: number, y: number) {
    // 茅草药庐：竹篱、土墙、草顶、药架
    ctx.fillStyle = 'rgba(30,24,18,0.22)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 150, 34, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b8a07a'; ctx.fillRect(x - 100, y - 110, 200, 110);
    ctx.fillStyle = '#a08860'; for (let i = 0; i < 6; i++) ctx.fillRect(x - 100, y - 100 + i * 18, 200, 2);
    ctx.fillStyle = '#3a2c20'; ctx.fillRect(x - 22, y - 70, 44, 70);
    ctx.fillStyle = '#d8c8a0'; ctx.fillRect(x + 40, y - 80, 36, 28); ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 2; ctx.strokeRect(x + 40, y - 80, 36, 28); ctx.beginPath(); ctx.moveTo(x + 58, y - 80); ctx.lineTo(x + 58, y - 52); ctx.stroke();
    const gr = ctx.createLinearGradient(x, y - 190, x, y - 100); gr.addColorStop(0, '#8a7448'); gr.addColorStop(1, '#6a5634');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 130, y - 100); ctx.quadraticCurveTo(x - 60, y - 170, x, y - 192); ctx.quadraticCurveTo(x + 60, y - 170, x + 130, y - 100); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(60,46,26,0.5)'; ctx.lineWidth = 1.5;
    for (let i = -120; i <= 120; i += 12) { ctx.beginPath(); ctx.moveTo(x + i * 0.2, y - 186); ctx.lineTo(x + i, y - 100); ctx.stroke(); }
    // 药架
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 3;
    for (const ox of [-170, -130]) { ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox, y - 70); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - 178, y - 60); ctx.lineTo(x - 122, y - 60); ctx.moveTo(x - 178, y - 30); ctx.lineTo(x - 122, y - 30); ctx.stroke();
    ctx.fillStyle = '#7a8a4a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(x - 170 + i * 14, y - 66, 6, 4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x - 168 + i * 14, y - 36, 6, 4, 0, 0, TAU); ctx.fill(); }
    // 竹篱
    ctx.strokeStyle = '#8a7a4a'; ctx.lineWidth = 2.5;
    for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(x + 110 + i * 10, y + 4); ctx.lineTo(x + 110 + i * 10, y - 30); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x + 106, y - 20); ctx.lineTo(x + 196, y - 20); ctx.stroke();
  }
  private drawManor(ctx: G, x: number, y: number) {
    ctx.fillStyle = 'rgba(30,24,18,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 8, 260, 50, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a7a6a'; ctx.fillRect(x - 240, y - 70, 480, 70);
    ctx.fillStyle = '#5a2a22'; ctx.fillRect(x - 40, y - 110, 80, 110);
    ctx.fillStyle = '#2a1a16'; ctx.fillRect(x - 28, y - 80, 56, 80);
    ctx.fillStyle = '#3a3634'; ctx.beginPath(); ctx.moveTo(x - 70, y - 104); ctx.lineTo(x, y - 150); ctx.lineTo(x + 70, y - 104); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3634'; ctx.fillRect(x - 250, y - 80, 500, 12);
    ctx.fillStyle = '#c8a050'; ctx.fillRect(x - 30, y - 100, 60, 14);
    ctx.fillStyle = '#2a1a10'; ctx.font = '11px serif'; ctx.textAlign = 'center'; ctx.fillText('独霸山庄', x, y - 89);
    ctx.fillStyle = '#c03020'; for (const ox of [-60, 60]) { ctx.beginPath(); ctx.ellipse(x + ox, y - 92, 9, 12, 0, 0, TAU); ctx.fill(); }
  }

  /** WebGL：任务光柱、星光凝露、瓶光 */
  drawGL(F: FxSys, t: number) {
    if (!this.active) return;
    const g = this.game, p = g.player;
    const gl = this.goal();
    if (gl && gl.tx !== undefined && gl.ty !== undefined) {
      const d = Math.hypot(gl.tx - p.x, gl.ty! - p.y);
      const k = clamp((g.senseRadius * 1.25 - d) / 300, 0, 1) * clamp((d - 120) / 200, 0, 1);
      if (k > 0) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
        F.beam(gl.tx, gl.ty!, gl.tx, gl.ty! - 520, 34, [1, 0.82, 0.45], 0.22 * k * pulse);
        F.glow(gl.tx, gl.ty!, 70, [1, 0.8, 0.4], 0.35 * k * pulse);
      }
    }
    const b = this.actors.find((a) => a.prop === 'bottle');
    if (b && g.life.vis(b) > 0.05) F.glow(b.x, b.y - 8, 40 + 8 * Math.sin(t * 3), [0.5, 1, 0.6], 0.5);
    if (this.cine) {
      const k = Math.min(1, this.cine.t / 1.5) * Math.min(1, (this.cine.dur - this.cine.t) / 1.2);
      F.glow(p.x + 16, p.y - 70, 60 + 14 * Math.sin(t * 5), [0.45, 1, 0.6], 0.7 * k);
      F.beam(p.x + 16, p.y - 70, p.x + 16, p.y - 900, 120, [0.6, 0.9, 1], 0.08 * k);
    }
    for (const a of this.actors) if (a.quest && a.look && g.life.vis(a) > 0.05) F.glow(a.x, a.y - 196, 26, [1, 0.8, 0.3], 0.35);
  }
}
