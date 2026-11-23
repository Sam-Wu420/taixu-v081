// 第十四步：追杀（“苏跑跑”）
// 被更强的修士以神识锁定：对方御器紧追、远远祭出飞剑逼你闪躲；
// 你要靠遁光、遁术、敛息、遁入宗门/坊市，才能把对方甩出神识之外。
// 追杀者平时不在战斗名单里（太远），靠近后作为一名强敌加入战斗；被追上就是一场越阶死战。
import { keyOr } from '../core/keymap';   // 第五轮
import type { Game } from './game';
import { threatRealm } from './demog';
import { Enemy } from './combat';
import { ENEMY_LIST, EnemyDef } from '../data/enemies';
import { REALMS, realmName, expNeed } from '../data/realms';
import { itemDef } from '../data/items';
import * as C from './cultivation';
import { audio } from './audio';
import type { NpcData } from './npc';
import { setHuntAt } from './feud';   // 恩怨重做：下一次追杀按天数 + 游玩时间
import { CharState } from '../gfx/character';
import { giveWard, blinkTo, dunOf } from './foemind';
import { foeBase } from './foegear';
import { pursuerKit } from './foeskills';
import { supSlow } from './suppress';
import { hunterChaseSpeed, chaseTargetSpeed, engageSpeed, HuntTarget } from './chasespeed';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Faction { id: string; name: string; robe: string; evil: boolean; color: string; fx: 'sword' | 'blood' | 'fireball' | 'ghost' }
const FACTIONS: Faction[] = [
  { id: 'guiling', name: '阴灵门', robe: '#2a1f34', evil: true, color: '170,90,230', fx: 'ghost' },
  { id: 'hehuan', name: '天欢宗', robe: '#7a2a48', evil: true, color: '255,120,170', fx: 'blood' },
  { id: 'yuling', name: '役灵宗', robe: '#3a3424', evil: true, color: '200,170,90', fx: 'fireball' },
  { id: 'tiansha', name: '玄煞宗', robe: '#3a0a14', evil: true, color: '230,40,50', fx: 'blood' },
  { id: 'sanxiu', name: '散修', robe: '#3c3c44', evil: false, color: '200,230,240', fx: 'sword' },
  { id: 'jiexiu', name: '劫修', robe: '#2a3440', evil: false, color: '220,220,200', fx: 'sword' },
];
const SURN = '王张刘陈杨赵周吴徐孙马朱胡郭何高罗郑梁谢宋唐许冯邓曹彭曾萧田董潘袁蔡蒋余叶程苏魏吕丁沈任姚卢钟陆秦尹孟温柳';
const MN = ['冥', '烈', '寒', '枭', '厉', '玄', '啸', '铁', '幽', '血', '鹤', '岳', '霄', '鸿', '沧', '峥', '戾', '魁'];
const TAUNT = ['小辈，交出东西，饶你不死！', '哪里逃！', '跑得了一时，跑不了一世。', '你的遁光，比你的修为有意思多了。', '老夫倒要看看，你还有几张遁符。', '束手就擒，留你全尸！'];

export interface PursuitInit {
  reason: string; gap?: number; faction?: string; name?: string; delay?: number;
  /** 第三十二步：真正的仇人亲自追来（取其姓名、境界、相貌） */
  npc?: NpcData; allies?: NpcData[]; why?: string;
  /** 第三十七步：指定高出几阶（调试 / 剧情）——不看当地有没有人敢来 */
  force?: boolean;
  /** 恩怨重做：练气期本不会被追杀；剧情、执法 / 寻仇队、你先手结下的血仇例外 */
  story?: boolean;
  /** v0.64：自重身份的前辈遣来的人——sect = 打着哪一派的旗号（用其功法）；proxyOf = 替哪位前辈出手（NPC id，失手会记在他头上） */
  sect?: string; evil?: boolean; proxyOf?: string;
}
/** 仇人的喊话 */
const WHY_TAUNT = (why: string, name: string) => [`苏寒！${why}——这笔账今日了结！`, `${why}，你以为躲得掉？`, `${name}在此，拿命来！`, '你的遁光再快，快得过我的神识么？', '上次让你跑了，这回我可是有备而来。'];

export interface Pursuer {
  e: Enemy; name: string; faction: Faction; reason: string;
  realm: number; stage: number;
  lockR: number; chase: number;
  t: number; outT: number; safeT: number; tauntT: number; longT: number;
  lastX: number; lastY: number; searching: boolean;
  lost: boolean;   // 失去踪迹（遁入地下/隐身）
  // ---------- 第三十二步 ----------
  npc?: NpcData; why?: string; prep: number;
  v: number;                 // 平滑后的遁速
  blinks: number; blinkCd: number;   // 剩余瞬移次数 / 冷却
  earthCd: number; earth: { x: number; y: number } | null;   // 土遁伏击
  wings: Enemy[];            // 同门 / 帮手
  // ---------- 第三十五步：九死一生 ----------
  waves: number; wave: number;       // 甩开后还会再截杀几次 / 已截杀几次
  jinkongCd: number;                 // 禁空令（结丹以上）
  /** v0.64：替哪位前辈出手（NPC id） */
  proxyOf?: string;
}
/** 帮手在头领身后的阵位（侧后两翼） */
const WING_OFS: [number, number][] = [[-170, -150], [-170, 150]];

export class PursuitSys {
  cur: Pursuer | null = null;
  pending: { init: PursuitInit; t: number } | null = null;
  /** 冷却：两次追杀之间至少隔这么多秒 */
  cd = 90;
  constructor(public g: Game) {}

  get active() { return !!this.cur; }
  reset() {
    const P = this.cur, g = this.g;
    if (P) for (const e of [P.e, ...P.wings]) {
      const i = g.combat.enemies.indexOf(e); if (i >= 0) g.combat.enemies.splice(i, 1);
      const d = e.npcId ? g.npcs?.byId.get(e.npcId) : undefined; if (d) d.chasing = false;
    }
    this.cur = null; this.pending = null; this.cd = 90;
  }

  /** 帮手：境界略低，罩一层薄些的护体灵光，跟着头领的遁光飞 */
  private mkWing(lead: Enemy, fac: Faction, realm: number, stage: number, name: string, d?: NpcData): Enemy {
    const g = this.g;
    realm = Math.max(1, Math.min(5, realm)); stage = Math.min(stage, REALMS[realm].stages.length - 1);
    const evil = d ? d.faction === 'demon' : fac.evil;
    const base = ENEMY_LIST.find((x) => x.id === (evil ? (realm >= 3 ? 'jindan_mo' : 'moxiu') : realm >= 2 ? 'zhujixiu' : 'bandit')) ?? lead.def;
    const def: EnemyDef = { ...base, id: 'pursuer_wing', name, title: d?.sect ? g.rel.sectName(d.sect) : fac.name, robe: d?.robe ?? fac.robe, evil, flying: true, aggro: 1e6, hp: 1.1, speed: 220,
      ranged: base.ranged ? { ...base.ranged, color: fac.color } : base.ranged };
    const w = new Enemy(def, lead.x, lead.y, realm, stage);
    w.name = name; w.aggro = false; w.pursuer = true; w.wing = true;
    if (d) { w.npcId = d.id; w.look = g.npcs.look(d); w.cs = new CharState(lead.x, lead.y); d.chasing = true; }
    w.school = d?.sect ?? lead.school;
    w.dunKind = lead.dunKind ?? dunOf(lead);
    if (realm >= 2) giveWard(g.combat, w, 0.15, evil ? '240,80,90' : '240,220,140', false);
    return w;
  }

  /** 帮手的阵位：远时紧随头领两翼，近了各自出手 */
  private tickWings(P: Pursuer, dt: number, dist: number) {
    const g = this.g, p = g.player, e = P.e;
    const hx = p.x - e.x, hy = p.y - e.y, hl = Math.hypot(hx, hy) || 1, fx = hx / hl, fy = hy / hl;
    P.wings.forEach((w, i) => {
      if (w.dead) return;
      w.hx = w.x; w.hy = w.y;
      const wd = Math.hypot(w.x - p.x, w.y - p.y);
      if (wd < 760 && dist < 1000 && e.hideT <= 0) {
        // 近身各自出手：身法按 engageSpeed —— 你拔腿就跑时，同境帮手同样咬得住（旧版只剩 foeBase，被步行甩开）
        const pv = Math.hypot(p.st?.vx ?? 0, p.st?.vy ?? 0);
        w.speed = engageSpeed(foeBase(w), w.realm, w.stage, { v: pv, flying: !!p.flying, boosting: !!p.boosting, realm: g.hero.realm });
        w.dun = pv > 200 ? Math.min(1, w.dun + dt * 4) : Math.max(0, w.dun - dt * 2.5); return;
      }
      const [ox, oy] = WING_OFS[i] ?? [-200, 0];
      const sx = e.x + fx * ox - fy * oy, sy = e.y + fy * ox + fx * oy;
      const dx = sx - w.x, dy = sy - w.y, dl = Math.hypot(dx, dy);
      if (dl > 2000) { w.x = sx; w.y = sy; w.trailReset = true; return; }
      const stun = w.st.freeze || w.st.stun || w.st.root;
      const sp = stun ? 0 : P.v * (dl > 120 ? 1.25 : 1);
      if (dl > 4) { const k = Math.min(1, sp * dt / dl); w.x += dx * k; w.y += dy * k; w.facing = dx > 0 ? 1 : -1; w.cs?.faceToward(dx, dy, false); }
      w.speed = 0; w.anim.move = 1;
      w.dun = e.dun > 0.15 || dl > 60 ? Math.min(1, w.dun + dt * 4) : Math.max(0, w.dun - dt * 2.5);
    });
  }
  /** 本次追杀的“摆脱”所需秒数（敛息更快） */
  get needOut() { return this.g.concealed ? 5 : 8; }   // 第三十五步：九死一生，需甩得更远更久

  /** 稍后触发（取宝后被人尾随等） */
  schedule(init: PursuitInit) {
    if (this.cur || this.pending || this.cd > 0) return false;
    this.pending = { init, t: init.delay ?? rand(6, 14) };
    return true;
  }

  start(init: PursuitInit): boolean {
    const g = this.g, h = g.hero, p = g.player;
    if (this.cur || h.realm < 1 || h.dead) return false;
    if (h.realm < 2 && !init.force && !init.story) return false;   // 恩怨重做：练气期不会被追杀（门槛提到筑基）
    const gap = init.gap ?? 1, d = init.npc;
    // 第三十七步：来追你的人，是这一带“自认吃得下你”的人——你境界越高，敢动手的越少（南荒几乎没人敢追杀元婴）
    let realm = 1, stage = 0;
    if (!d && init.force) { realm = Math.min(5, h.realm + gap); stage = gap > 0 ? Math.floor(rand(0, REALMS[realm].stages.length)) : REALMS[realm].stages.length - 1; }
    else if (!d) {
      const tr = threatRealm(g, p.x, p.y, Math.max(1, h.realm), gap > 0 ? 0.6 : 0.1, Math.random, h.realm >= 4);
      if (!tr) return false;
      realm = tr.realm; stage = realm === h.realm ? Math.max(tr.stage, Math.min(h.stage, REALMS[realm].stages.length - 1)) : tr.stage;
    }
    let fac = FACTIONS.find((f) => f.id === init.faction) ?? pick(FACTIONS);
    // v0.64：前辈遣来的门下——打着本门旗号、使本门功法
    if (!d && init.sect) { const evil = !!init.evil; fac = { id: init.sect, name: g.rel.sectName(init.sect), robe: evil ? '#3a0a14' : '#34445a', evil, color: evil ? '230,40,60' : '200,230,240', fx: evil ? 'blood' : 'sword' }; }
    let name = init.name ?? (SURN[Math.floor(Math.random() * SURN.length)] + pick(MN) + (Math.random() < 0.5 ? pick(MN) : ''));
    const prep = Math.min(3, d?.prep ?? 0);
    if (d) {   // 真仇人：用他自己的名号、境界与门派
      realm = Math.max(1, Math.min(5, d.realm)); stage = Math.min(d.stage, REALMS[realm].stages.length - 1); name = d.name;
      const evil = d.faction === 'demon', ghost = evil && d.seed % 2 === 0;
      const look = g.npcs.look(d);
      fac = { id: 'npc', name: d.sect ? g.rel.sectName(d.sect) : evil ? '魔道' : '散修', robe: d.robe ?? look.robe ?? '#3c3c44', evil, color: evil ? (ghost ? '170,90,230' : '230,40,60') : '200,230,240', fx: evil ? (ghost ? 'ghost' : 'blood') : 'sword' };
    }
    // v0.64：筑基追炼气——占着境界便托大：不带全副家当（气血、护体灵光都薄些）、遁光不那么急、甩掉了也不再燃血截杀
    const easy = h.realm <= 1 && realm > h.realm;
    const high = realm >= 4;   // 元婴追兵不再只有境界名头：气血、攻防、护体与法宝全部拉满
    const base = ENEMY_LIST.find((x) => x.id === (realm >= 3 ? 'jindan_mo' : 'zhujixiu')) ?? ENEMY_LIST[0];
    const r = base.ranged!;
    const def: EnemyDef = {
      ...base, id: 'pursuer', name, title: fac.name, robe: fac.robe, evil: fac.evil, flying: true, aggro: 1e6,
      hp: (easy ? 1.0 : 1.35) * (1 + prep * 0.1) * (high ? 1.3 : 1), atk: (easy ? 0.92 : 1.1) * (1 + prep * 0.06) * (high ? 1.2 : 1), def: (easy ? 1.0 : 1.1) * (high ? 1.15 : 1), speed: 230,
      ranged: { ...r, fx: fac.fx === 'ghost' ? 'blood' : fac.fx, color: fac.color, range: 640, cd: 1.5, count: realm >= 3 ? 3 : 1 },
      drops: [{ id: 'mat_lingshi', ch: 1, n: [60 * realm * realm, 140 * realm * realm] }, { id: realm >= 3 ? 'pill_jiangchen' : 'pill_zhuji', ch: 0.25 }, { id: 'tal_tianleizi', ch: 0.35 }, { id: realm >= 3 ? 'art_yueyang' : 'art_yinhui', ch: 0.3 }],
    };
    // 从身后、神识边缘之外出现
    const mv = p.st && Math.hypot(p.st.vx, p.st.vy) > 10;
    const back = mv ? Math.atan2(-p.st.vy, -p.st.vx) : Math.atan2(-(p.st ? Math.cos(p.st.yaw) : 1), -(p.st ? Math.sin(p.st.yaw) : 0));
    const d0 = rand(1500, 1900);
    const x = p.x + Math.cos(back + rand(-0.6, 0.6)) * d0, y = p.y + Math.sin(back + rand(-0.6, 0.6)) * d0 * 0.8;
    const e = new Enemy(def, x, y, realm, stage);
    e.name = name; e.aggro = false; e.boss = true; e.pursuer = true;
    if (d) { e.npcId = d.id; e.look = g.npcs.look(d); e.cs = new CharState(x, y); d.chasing = true; }
    e.school = d?.sect ?? (fac.id !== 'npc' ? fac.id : d && d.faction !== 'demon' ? 'sanxiu' : undefined);
    e.kit = pursuerKit(e);
    // 护体灵光：一出手就罩着；被打碎二十息后还能再撑起一次
    const wcol = fac.evil ? (fac.fx === 'ghost' ? '190,120,255' : '240,80,90') : '240,220,140';
    e.wardFrac = (easy ? 0.12 : 0.25) + prep * 0.1 + (high ? 0.08 : 0); e.wardCol = wcol; e.wardRe = easy ? 32 : high ? 16 : 20;
    giveWard(g.combat, e, e.wardFrac, wcol, false);
    const lockR = realm >= 4 ? 5200 : realm >= 3 ? 3400 : 2400;
    const chase = hunterChaseSpeed(realm, stage) * (easy ? 0.85 : 1);
    // 帮手：真仇人带上同门/亲友，或同宗的师兄弟；无名追兵偶尔也成群而来
    const wings: Enemy[] = [];
    const allies = (init.allies ?? []).filter((a) => a.alive && a !== d).slice(0, 2);
    if (d && !allies.length && d.sect && Math.random() < 0.45) {
      for (const o of g.npcs.list) if (allies.length < (realm >= 3 ? 2 : 1) && o !== d && o.alive && o.sect === d.sect && o.realm >= 1 && o.realm <= d.realm && !o.beauty && !o.bond && !o.stay && !o.canon && !g.npcs.activeOf(o.id)) allies.push(o);
    }
    for (const a of allies) wings.push(this.mkWing(e, fac, a.realm, a.stage, a.name, a));
    if (!d && realm >= 2 && Math.random() < (easy ? 0.15 : 0.4)) for (let i = 0; i < (realm >= 3 && Math.random() < 0.5 ? 2 : 1); i++) {
      const wr = Math.max(1, realm - 1);
      wings.push(this.mkWing(e, fac, wr, Math.floor(rand(0, REALMS[wr].stages.length)), SURN[Math.floor(Math.random() * SURN.length)] + pick(MN)));
    }
    wings.forEach((w, i) => { w.x = x + WING_OFS[i][0] * 0.7; w.y = y + WING_OFS[i][1] * 0.7; });
    this.cur = { e, name, faction: fac, reason: init.reason, realm, stage, lockR, chase, t: 0, outT: 0, safeT: 0, tauntT: rand(4, 7), longT: rand(4, 6), lastX: p.x, lastY: p.y, searching: false, lost: false,
      npc: d, why: init.why ?? d?.why, prep, v: chase, blinks: 1 + prep + (realm >= 4 ? 2 : 0), blinkCd: rand(5, 8), earthCd: rand(10, 16), earth: null, wings,
      waves: easy ? 0 : Math.min(2, (gap >= 1 ? 1 : 0) + (prep >= 2 ? 1 : 0) + (realm >= 3 && Math.random() < 0.5 ? 1 : 0)), wave: 0, jinkongCd: realm >= 3 ? rand(12, 18) : 1e9, proxyOf: init.proxyOf };
    const who = d ? `${name}${d.why ? '（' + d.why + '）' : ''}` : `${fac.name}${name}`;
    const extra = wings.length ? `，身后还跟着${wings.length === 1 ? '一名帮手' : '两名帮手'}` : '';
    g.toast(d ? `${who}——${realmName(realm, stage)}——以神识锁定了你，驾遁光杀来${extra}！${prep ? '看样子这回是有备而来。' : ''}` : `${init.reason}——${who}（${realmName(realm, stage)}）以神识锁定了你，御器追来${extra}！`, 'warn');
    audio.sfx('fail'); audio.sfx('thunder');
    g.hurtFlash = Math.max(g.hurtFlash, 0.5); g.juice(0.05, 0.4);
    if (g.renderer) g.renderer.sense.alarm = 1;
    if (d && realm >= h.realm + 2) g.toast(`${name}本不屑对小辈出手——可遣来的人接连折在你手里，这回是迫不得已，亲自来了。`, 'warn');
    g.hint('pursuit', `被追杀了！寻常追兵至多高你一个大境界——并非不可一战：能战则战，不敌则走。${keyOr('run', '点「疾」')} 催动遁光（飞行时）、用遁术或遁符、${keyOr('conceal', '') ? keyOr('conceal', '') + ' 敛息' : '菜单里点「敛息」'}，或逃进宗门/坊市；甩出对方神识范围数息即可脱身。`);
    return true;
  }

  /** 从外面结束这场追杀（追进虚空的追兵被甩掉、被斩） */
  finish(kind: 'escaped' | 'killed'): void { if (this.cur) this.end(kind); }
  private end(kind: 'escaped' | 'safe' | 'killed' | 'timeout' | 'dead') {
    const g = this.g, P = this.cur!, h = g.hero, who = `${P.faction.name}${P.name}`;
    const e = P.e;
    if (!e.dead) { const i = g.combat.enemies.indexOf(e); if (i >= 0) g.combat.enemies.splice(i, 1); }
    // 帮手：头领被逃脱 → 一并撤走；头领陨落 → 留下来拼命
    for (const w of P.wings) {
      if (w.dead) continue;
      if (kind === 'killed') { w.pursuer = false; w.wing = false; w.aggro = true; w.speed = foeBase(w); continue; }
      const i = g.combat.enemies.indexOf(w); if (i >= 0) g.combat.enemies.splice(i, 1);
    }
    const d = P.npc;
    if (d) {
      d.chasing = false;
      if (d.alive && kind !== 'killed') {
        // 恩怨重做：没杀成不再「下次来得更快更强」——扑空一次降一档热度、拉长间隔，连扑三次空就认栽（world/feud.ts）；只有你先手结下的血仇才回去养精蓄锐
        if (d.feudBy === 'hero') d.prep = Math.min(3, (d.prep ?? 0) + (kind === 'dead' ? 0 : 1));
        d.hunting = false; d.x = e.x; d.y = e.y;
        const gap = Math.round(rand(12, 30));
        if (kind !== 'dead') { g.rel.feud.miss(d, 'pursuit'); if (d.huntAt !== undefined) d.huntAt += gap; if (kind !== 'safe') g.rel.feud.sectWarn(d); }
        else setHuntAt(g, d, g.day + gap + 20);   // 恩怨重做：天数和游玩时间两个都到了才再来
      }
    }
    for (const w of P.wings) { const wd = w.npcId ? g.npcs.byId.get(w.npcId) : undefined; if (wd && (w.dead || kind !== 'killed')) { wd.chasing = false; if (!w.dead) { wd.x = w.x; wd.y = w.y; } } }
    this.cur = null; this.cd = 240;
    // v0.64：这是某位前辈遣来的人——没能取你性命便记他一次失手；接连两次，那位前辈才会「迫不得已」亲自出手
    if (P.proxyOf && kind !== 'dead') {
      const boss = g.npcs?.byId.get(P.proxyOf);
      if (boss && boss.alive) {
        boss.proxyFail = (boss.proxyFail ?? 0) + 1;
        if (boss.proxyFail >= 2) { boss.huntAt = g.day + Math.round(rand(20, 45)); g.rel.log(`${boss.name}遣来的人接连失手——这位${realmName(boss.realm, boss.stage)}修士坐不住了，怕是要亲自出手。`, 'bad'); g.toast(`${boss.name}遣来的人接连折戟。下回来的，只怕就是${boss.name}本人了——早做准备。`, 'warn'); }
        else g.rel.log(`${boss.name}遣来的人失了手，此事不会就此罢休。`, 'bad');
      }
    }
    if (kind === 'dead') return;
    const secs = Math.round(P.t);
    if (kind === 'killed') {
      const left = P.wings.filter((w) => !w.dead).length;
      g.toast(`反杀！${who}陨落，储物袋落在一旁。${left ? '帮手红了眼，扑上来拼命！' : ''}`, 'good');
      g.news(`苏寒被${who}（${realmName(P.realm, P.stage)}）追杀，竟越阶反杀之。`, 'personal');
      (h.stats as any).escapes = ((h.stats as any).escapes ?? 0) + 1;
      return;
    }
    const exp = expNeed(h.realm, h.stage) * C.INSIGHT * (kind === 'escaped' ? 0.03 : 0.015);
    C.gainExp(h, exp, []);
    (h.stats as any).escapes = ((h.stats as any).escapes ?? 0) + 1;
    if (d && d.alive && (d.grudge ?? 0) > 0) g.rel.log(d.gaveUp === Math.floor(g.day) ? `${d.name}追杀未果，认栽了。` : `${d.name}追杀未果，含恨而去。`, 'bad');
    const line = kind === 'safe' ? `${who}不敢在此动手，在外盘旋良久，恨恨而去。` : kind === 'timeout' ? `${who}终究没能追上，悻悻收了遁光。` : `甩开了${who}的神识锁定！`;
    g.toast(`${line}（历练 修为 +${Math.round(exp)}）`, 'good');
    audio.sfx('chime');
    g.news(`苏寒遭${who}（${realmName(P.realm, P.stage)}）追杀${secs > 60 ? '良久' : ''}，${kind === 'safe' ? '遁入城中才保住性命' : '凭遁术脱身'}。`, 'personal');
  }

  update(dt: number) {
    const g = this.g, h = g.hero, p = g.player;
    if (this.cd > 0) this.cd -= dt;
    if (this.pending && !this.cur) { this.pending.t -= dt; if (this.pending.t <= 0) { const it = this.pending.init; this.pending = null; this.start(it); } }
    if (g.noFlyT > 0) g.noFlyT = Math.max(0, g.noFlyT - dt);
    const P = this.cur; if (!P) return;
    if (h.dead) { this.end('dead'); return; }
    const e = P.e;
    if (e.dead) { this.end('killed'); return; }
    P.t += dt;
    const c = g.combat;
    const stealth = (c.buffs.until.stealth ?? 0) > g.time;
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy);
    const safe = c.safeAt(p.x, p.y);
    // 敛息时，锁定范围大减（但近在咫尺仍逃不掉）
    const lockR = P.lockR * (g.concealed ? 0.6 : 1);
    // 失踪：遁地/隐身——追杀者扑向最后看到的位置
    if (stealth) { if (!P.lost) { P.lost = true; P.searching = true; } }
    else if (P.lost) {
      P.lost = false;
      if (dist > lockR * 0.55) { g.toast(`${P.name}失去了你的踪迹！`, 'good'); this.end('escaped'); return; }
    }
    if (!P.lost) { P.lastX = p.x; P.lastY = p.y; }
    // 追击（移动全部由本系统驱动，避免战斗 AI 再叠加一份速度）
    // 遁速口径统一在 chasespeed.ts：追兵永远不会跟着玩家一起慢下来。
    // 遁空疾行时追兵跟不上：他只按自己的遁速追，不再按你的速度水涨船高
    const vx = p.st?.vx ?? 0, vy = p.st?.vy ?? 0, heroV = g.dunkong?.cruising ? Math.min(Math.hypot(vx, vy), P.chase) : Math.hypot(vx, vy);
    // 斗法版：追兵也会催动遁光——你飞遁逃命 / 被拉开了，他便全力催动一阵（次数有限：法力不济之后只能平飞）
    const PX = P as any;
    PX.dunN ??= 2 + e.realm + P.prep; PX.dunCd = (PX.dunCd ?? rand(1.5, 3)) - dt;
    if (PX.dunT > 0) PX.dunT -= dt;
    else if (PX.dunN > 0 && PX.dunCd <= 0 && e.realm >= 2 && !P.lost && !safe && !(e.hideT > 0) && (p.boosting ? dist > 420 : dist > 1300)) {
      PX.dunN--; PX.dunT = 5 + e.realm * 0.5 + P.prep; PX.dunCd = PX.dunT + rand(5, 7);
      c.texts.push({ x: e.x, y: e.y - 150, s: PX.dunN > 0 ? '催动遁光！' : '燃尽法力·遁光！', color: '#ffd9a0', t: 0, vy: -24, big: true });
      if (dist < 2400) g.toast(`${P.name}催动遁光，遁速暴涨！${PX.dunN > 0 ? '' : '（看样子他的法力也快见底了）'}`, 'warn');
      audio.sfx('whoosh');
    }
    const tgt: HuntTarget = { v: heroV, flying: !!p.flying, boosting: !!p.boosting, realm: h.realm };
    const ownHunt = chaseTargetSpeed(P.realm, P.stage, tgt);
    // 燃烧法力催动遁光时额外爆发；平追也绝不把自身遁速降到玩家慢走的速度。
    const want = PX.dunT > 0 ? Math.max(ownHunt, P.chase * 1.26) : ownHunt;
    P.v += (want - P.v) * Math.min(1, dt * (PX.dunT > 0 ? 2.4 : 1.8));
    // 土遁伏击：潜入地下，从你前方破土而出
    P.earthCd -= dt;
    if (e.hideT > 0) {
      e.hideT -= dt; e.dun = 0; e.speed = 0;
      if (e.hideT <= 0 && P.earth) {
        const { x: ex, y: ey } = P.earth; P.earth = null;
        c.fxq.push({ k: 'dunflash', x: ex, y: ey, x2: ex, y2: ey, kind: 'earth', color: '200,170,110' });
        e.x = ex; e.y = ey; e.kx = 0; e.ky = 0; if (e.cs) { e.cs.x = ex; e.cs.y = ey; } e.trailReset = true;
        c.foe.zone(e, ex, ey, 170, 'earth', 1.5, 0.4, { k: 'root', dur: 1.3, ch: 0.9 });
        c.texts.push({ x: ex, y: ey - 130, s: '破土！', color: '#e0c08a', t: 0, vy: -26, big: true });
        g.juice(0.06, 0.3); audio.sfx('break'); e.skT = 0.3; e.aggro = true;
      }
      this.tickWings(P, dt, dist); return this.tail(P, dt, dist, lockR, safe);
    }
    const tm = !P.lost && !safe && !e.cast && e.realm >= 2 && !(e.st.freeze || e.st.stun || e.st.root) && e.sup < 2;
    if (tm && P.earthCd <= 0 && !p.flying && heroV > 150 && dist > 650 && dist < 1800) {
      const lead = Math.min(1.4, dist / Math.max(P.v, 1) * 0.6), ax = p.x + vx * lead, ay = p.y + vy * lead;
      if (g.terrain.walkFactor(ax, ay) > 0 && !c.safeAt(ax, ay)) {
        P.earthCd = 25 - P.prep * 3; P.earth = { x: ax, y: ay }; e.hideT = 1.1;
        c.fxq.push({ k: 'dunflash', x: e.x, y: e.y, x2: e.x, y2: e.y, kind: 'earth', color: '200,170,110' });
        c.texts.push({ x: e.x, y: e.y - 130, s: '土遁！', color: '#e0c08a', t: 0, vy: -26 });
        if (c.lock === e) c.lock = null;
        audio.sfx('whoosh');
        this.tickWings(P, dt, dist); return this.tail(P, dt, dist, lockR, safe);
      }
    }
    // 血遁 / 雷遁 / 魔影遁：远了直接瞬移到你身后
    P.blinkCd -= dt;
    if (tm && P.blinks > 0 && P.blinkCd <= 0 && dist > 900 && dist < lockR * 0.9) {
      const ux = (e.x - p.x) / dist, uy = (e.y - p.y) / dist, R = rand(620, 740), a = Math.atan2(uy, ux) + rand(-0.5, 0.5);
      const nx = p.x + Math.cos(a) * R, ny = p.y + Math.sin(a) * R;
      if (!c.safeAt(nx, ny)) {
        P.blinks--; P.blinkCd = rand(9, 14) - P.prep;
        blinkTo(c, e, nx, ny, dunOf(e)); e.skT = Math.min(e.skT, 0.4); e.aggro = true;
        P.wings.forEach((w, i) => { if (!w.dead && Math.hypot(w.x - p.x, w.y - p.y) > 900) { const b = a + (i ? 0.9 : -0.9); blinkTo(c, w, p.x + Math.cos(b) * R * 1.1, p.y + Math.sin(b) * R * 0.85, dunOf(w)); } });
        g.juice(0.03, 0.2);
      }
    }
    // 截路：咬到近处而你还在闷头赶路（没催遁光）——同境 / 高境追兵直接闪到你前头拦住去路，
    // 并落下一道迟滞灵压。想走，就得拿出遁光、遁术、遁符这些真本事；光靠两条腿甩不掉同境修士。
    PX.cutCd = (PX.cutCd ?? rand(2.5, 4)) - dt;
    PX.runT = !p.boosting && heroV > Math.max(150, REALMS[Math.min(5, h.realm)].speed * 0.55) ? (PX.runT ?? 0) + dt : 0;
    if (tm && P.realm >= h.realm && PX.cutCd <= 0 && PX.runT > 1.2 && dist < 820 && heroV > 1) {
      const a = Math.atan2(vy, vx) + rand(-0.25, 0.25), R = rand(250, 330);
      const nx = p.x + Math.cos(a) * R + vx * 0.3, ny = p.y + Math.sin(a) * R * 0.85 + vy * 0.3;
      if (!c.safeAt(nx, ny)) {
        PX.cutCd = Math.max(5, rand(8, 11) - P.prep); PX.runT = 0;
        blinkTo(c, e, nx, ny, dunOf(e), '截路');
        c.foe.zone(e, p.x + vx * 0.3, p.y + vy * 0.3, 190, 'gold', 0.6, 0.4, { k: 'slow', dur: 2.2, ch: 1 });
        c.texts.push({ x: nx, y: ny - 150, s: pick(['哪里走！', '此路不通！', '留下吧！']), color: '#ffb0a0', t: 0, vy: -22, big: true });
        e.skT = Math.min(e.skT, 0.35); e.aggro = true; PX.eng = true;
        if (!PX.cutTold) { PX.cutTold = true; g.toast(`${P.name}身形一闪，抢到你前头截住了去路——光靠赶路甩不掉同境修士，催动遁光或用遁术！`, 'warn'); }
        audio.sfx('whoosh');
      }
    }
    // 截击：瞄着你将要到的位置追
    let tx = P.lastX, ty = P.lastY;
    if (!P.lost) { const lt = Math.min(1.2, dist / Math.max(P.v, 1)); tx += vx * lt; ty += vy * lt; }
    const ddx = tx - e.x, ddy = ty - e.y, dd = Math.hypot(ddx, ddy);
    // 近身交战圈（带滞回）：进圈后把走位交还给斗法 AI——会绕背、闪避、贴上来祭短程法宝，
    // 且身法不低于你此刻的速度（engageSpeed）。
    // 旧版追到 380~420 丈外就“停车”，战斗移速又被锁成 0：你走多慢，他就在身后跟多慢，永远贴不上来。
    const eng = !safe && !P.lost && dist < (PX.eng ? 640 : 480);
    PX.eng = eng;
    if (eng) {
      e.speed = engageSpeed(foeBase(e), P.realm, P.stage, tgt);
      e.dun = heroV > 200 ? Math.min(1, e.dun + dt * 4) : Math.max(0, e.dun - dt * 2.5);
    } else {
      // 圈外：位移只由本系统驱动（战斗移速置 0，避免双重叠加）；永远是追兵自身的境界遁速，不随玩家变慢。
      e.speed = 0;
      const hold = safe ? 520 : 0;   // 你躲进城里：他在城外盘旋，不进城
      if (dd > (P.lost ? 20 : 6) && dist > hold) {
        const sp = Math.max(0, P.v) * (P.lost ? 0.8 : 1) * (e.st.slow ? 0.5 : 1) * (e.st.freeze || e.st.stun || e.st.root ? 0 : 1) * (e.sup >= 2 ? 0 : e.sup === 1 ? supSlow(e.realm) : 1);
        const k = Math.min(1, sp * dt / dd);
        const nx = e.x + ddx * k, ny = e.y + ddy * k;
        if (!c.safeAt(nx, ny)) { e.x = nx; e.y = ny; }
        e.anim.move = 1; e.facing = ddx > 0 ? 1 : -1;
        if (e.cs) { e.cs.faceToward(ddx, ddy, false); }
        e.dun = Math.min(1, e.dun + dt * 4);
      } else e.dun = Math.max(0, e.dun - dt * 2.5);
    }
    this.jinkong(P, dt, dist, safe);
    e.hx = e.x; e.hy = e.y;   // 不受“离家太远”限制
    // 头领的位移：圈外由 PursuitSys 驱动（e.speed = 0），进了交战圈才交给战斗 AI（e.speed = engageSpeed）。
    // 两者互斥，不会双重叠加；绝不要再从追击速度里扣 foeBase。
    this.tickWings(P, dt, dist);
    this.tail(P, dt, dist, lockR, safe);
  }

  /** 战斗名单、远程飞剑、喊话、摆脱判定 */
  private tail(P: Pursuer, dt: number, dist: number, lockR: number, safe: boolean) {
    const g = this.g, c = g.combat, p = g.player, e = P.e;
    // 保持在战斗名单里（够近时）
    if (dist < 4200 && !c.enemies.includes(e)) c.enemies.push(e);
    for (const w of P.wings) if (!w.dead && Math.hypot(w.x - p.x, w.y - p.y) < 4200 && !c.enemies.includes(w)) c.enemies.push(w);
    // 远程飞剑：600–1500 之间每隔数息一记，逼你闪躲
    P.longT -= dt;
    if (!P.lost && !safe && P.longT <= 0 && dist > 560 && dist < 1500 && e.hideT <= 0) {
      P.longT = rand(3.5, 5.5);
      const ang = Math.atan2(p.y - 40 - (e.y - 70), p.x - e.x), spd = 1150;
      const r = e.def.ranged!;
      c.projs.push({ fac: 'e', visual: { groundOffsetY: 70, elevation: e.flyH + e.lift }, x: e.x, y: e.y - 70, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 0, max: 1700 / spd, fx: P.faction.fx === 'sword' ? 'sword' : r.fx, color: P.faction.color, dmg: e.atk * 1.3, realm: e.realm, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 30, aoe: 0, size: 1.3, trail: [], lv: 0 } as any);
      audio.sfx('sword');
    }
    // 喊话
    P.tauntT -= dt;
    if (P.tauntT <= 0 && !P.lost) { P.tauntT = rand(9, 15); if (dist < lockR) c.texts.push({ x: p.x, y: p.y - 150, s: `${P.name}：「${pick(P.why ? WHY_TAUNT(P.why, P.name) : TAUNT)}」`, color: '#ffb0a0', t: 0, vy: -16 } as any); }
    // 锁定期间神识圈泛红
    if (g.renderer && dist < lockR && !P.lost) g.renderer.sense.alarm = Math.max(g.renderer.sense.alarm, 0.45);
    // 摆脱判定
    if (safe) { P.safeT += dt; if (P.safeT > 15) { this.end('safe'); return; } }
    else P.safeT = Math.max(0, P.safeT - dt * 2);
    if (dist > lockR && !P.lost) { P.outT += dt; if (P.outT >= this.needOut) { if (!this.intercept(P)) this.end('escaped'); return; } }
    else P.outT = Math.max(0, P.outT - dt * 2);
    if (P.t > 300 && dist > 1500) this.end('timeout');
  }

  /** 第三十五步·九死一生：刚以为甩开，对方燃烧精血抢到你前头截住去路（或半路杀出截胡的劫修） */
  private intercept(P: Pursuer): boolean {
    if (P.wave >= P.waves) return false;
    const g = this.g, c = g.combat, p = g.player, e = P.e;
    if (e.st.freeze || e.st.stun || e.hp < e.maxHp * 0.25) return false;
    const ang = Math.atan2(p.y - e.y, p.x - e.x);   // 你逃的方向＝背离追兵
    let nx = 0, ny = 0, ok = false;
    for (let k = 0; k < 6 && !ok; k++) { const a = ang + (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.75), R = rand(950, 1200); nx = p.x + Math.cos(a) * R; ny = p.y + Math.sin(a) * R * 0.8; ok = !c.safeAt(nx, ny); }
    if (!ok) return false;
    P.wave++; P.outT = 0; P.lost = false; P.blinkCd = Math.max(P.blinkCd, 5); P.v = P.chase * 0.5;   // 精血亏损：遁速一时提不上来
    e.hp -= e.maxHp * 0.08;   // 燃烧精血
    blinkTo(c, e, nx, ny, 'blood'); e.aggro = true; e.skT = Math.min(e.skT, 0.5);
    if (!c.enemies.includes(e)) c.enemies.push(e);
    P.wings.forEach((w, i) => { if (!w.dead) { const b = ang + (i ? 0.7 : -0.7); blinkTo(c, w, p.x + Math.cos(b) * 1000, p.y + Math.sin(b) * 800, dunOf(w)); if (!c.enemies.includes(w)) c.enemies.push(w); } });
    // 截胡：劫修闻着血腥味半路杀出
    let third = '';
    if (P.wings.filter((w) => !w.dead).length < 2 && Math.random() < 0.45) {
      const jf = FACTIONS.find((f) => f.id === 'jiexiu') ?? P.faction;
      const nm = SURN[Math.floor(Math.random() * SURN.length)] + pick(MN);
      const wr = Math.max(1, P.realm - (Math.random() < 0.5 ? 1 : 0));
      const w = this.mkWing(e, jf, wr, Math.floor(rand(0, REALMS[wr].stages.length)), nm);
      const b = ang + rand(-0.9, 0.9); w.x = p.x + Math.cos(b) * 1100; w.y = p.y + Math.sin(b) * 880; w.school = 'jiexiu'; w.kit = undefined;
      P.wings.push(w); c.enemies.push(w); third = `，劫修${nm}也闻着血腥味从斜刺里杀了出来`;
    }
    g.toast(`九死一生——${P.name}燃烧精血，一道血光抢在你前头截住了去路${third}！`, 'warn');
    c.texts.push({ x: e.x, y: e.y - 150, s: '休想走！', color: '#ff7a6a', t: 0, vy: -20, big: true });
    g.hurtFlash = Math.max(g.hurtFlash, 0.45); g.juice(0.06, 0.4); audio.sfx('thunder');
    if (g.renderer) g.renderer.sense.alarm = 1;
    return true;
  }
  /** 禁空令：结丹以上的追兵把你的遁光硬生生压落地面（数息内无法再起） */
  private jinkong(P: Pursuer, dt: number, dist: number, safe: boolean) {
    const g = this.g, p = g.player, c = g.combat, e = P.e;
    P.jinkongCd -= dt;
    if (P.jinkongCd > 0 || !p.flying || safe || P.lost || dist > 1000 || e.st.stun || e.st.freeze) return;
    if (g.terrain.walkFactor(p.x, p.y) <= 0) return;   // 海上压不下来
    P.jinkongCd = rand(22, 30);
    p.flying = false; p.boosting = false; g.noFlyT = 3.5;
    c.vfx.push({ kind: 'ring', x: p.x, y: p.y, r: 260, t: 0, dur: 0.7, color: '255,200,120', fx: 'array' } as any);
    c.fxq.push({ k: 'impact', x: p.x, y: p.y, power: 1.4, color: '255,200,120' });
    c.foe.zone(e, p.x, p.y, 160, 'gold', 0.8, 0.5, { k: 'slow', dur: 2, ch: 1 });
    c.texts.push({ x: p.x, y: p.y - 160, s: '禁空！', color: '#ffd080', t: 0, vy: -22, big: true });
    g.toast(`${P.name}祭出禁空令——你的遁光被硬生生压落地面，三息内提不起来！`, 'warn');
    g.juice(0.07, 0.45); audio.sfx('boom'); g.updateUI();
  }

  /** HUD 用 */
  info() {
    const P = this.cur; if (!P) return null;
    const p = this.g.player, e = P.e, dist = Math.hypot(p.x - e.x, p.y - e.y);
    const lockR = P.lockR * (this.g.concealed ? 0.6 : 1);
    return { name: P.name, faction: P.faction.name, evil: P.faction.evil, rank: realmName(P.realm, P.stage), dist, lockR, out: P.outT / this.needOut, safe: P.safeT / 15, lost: P.lost, x: e.x, y: e.y, hp: e.hp / e.maxHp, reason: P.reason, wave: P.wave, waves: P.waves, noFly: this.g.noFlyT > 0, foes: 1 + P.wings.filter((w) => !w.dead).length };
  }
  /** 物品价值触发：取宝 / 拍卖 / 杀人之后 */
  maybe(reason: string, chance: number, gap = 1) {
    if (Math.random() < chance) return this.schedule({ reason, gap });
    return false;
  }
}

/** 物品是否值钱到会招人觊觎 */
export function covetValue(ids: string[]) { return ids.reduce((s, id) => s + (itemDef(id).price || 0), 0); }
