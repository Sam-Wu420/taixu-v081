// 噬魂魔尊 · 夜无赦：邪修世界首领（周期降临、走近生成、三形态、出招编排、魔影随身、觉醒大招名额、打败后的奖励与传招）。
// 计划：C:\Users\10531\.claude\plans\polymorphic-juggling-ripple.md 第三、四、五步。招式在 world/yws-moves1/2/3.ts，共用的小工具在 yws-core.ts。
//
// 怎么存在（照撼山客 hanshan.ts、大夺宝 great.ts）：
//   · 平时只是存档里的一份（ws.flags.yewushe）：下一次降临在哪天、正在降临的地点和期限、打败过几次、传过哪几招——不建实体、不占性能。
//     每 200–320 游戏日降临一次（元婴以后 120–200 日）；降临前三十日出江湖传闻；降临那天天降血光（toast、震屏、整屏血红一闪、大事记 canon）、地图上出「魔」字。
//     四十日不打就离开；打败后一千日内不再来。选址在陨魔谷外围、魔门六宗的赤土边缘（避开城镇宗门的安全区），用自己的随机序列（mulberry32(hash32(种子, 第几次))）。
//   · 走近 8000 以内生成真身（一个 Enemy：自己 push 进 combat.enemies，不走刷怪路径），走远 9500 外收起；e.shell = true，由这里驱动（走位、出招、变身）。
//     生成时 Enemy 构造里的那几个 Math.random 换成自己的序列（外面的随机序列一个不动）。
//   · 境界比你高一个大境界（封顶化神），blv = 9：首领血条（ui/BossHUD.tsx 的 pickBoss）和锁定大血条自动挂上；名牌写境界不写妖兽等阶。
//
// 怎么打：
//   · 你走进一千七以内开打（或先动手）。三形态：人身 → 气血七成「魔气入体」进半魔 → 四成「天魔降身 · 末劫」进魔躯（换贴图、换招表、全程霸体、变身冲击波 + 全屏演出）。
//   · 编排「试探 → 连招 → 喘息 → 应对」：远近两组连招表（按形态）；应对 = 飞来的法术用鬼步闪开（魔躯用玄冥魔障挡）、你蓄重击时魔审抢先。
//   · 魔影随身（被动）：每次出手按自己的序列随机追加魔影追打（伤害走 hitPlayer / npcHit）。
//   · 觉醒大招只在魔躯时出，一场最多两次（bigOk / useBig，照撼山客的大招名额）；起手读条，首领血条下的蓄力条读 ultOf()。
//   · 你追出四千二、或倒下：他回到降临处、回满、变回人身。打败：天地间一声长啸，魂镰坠地——掉高阶魔道材料、法宝、灵石、魂镰（有就掉），传两招。
//
// 画法（占位）：画面线的立板（hd2d/bossthings.ts）做好前，他是一个人形（黑袍、长兵器），三形态换三套外观；
// 立板要的「当前形态 / 位置 / 朝向 / 在放哪一招、放到第几息 / 霸体 / 读条」集中在 view() 里一次给出。
import type { Game } from './game';
import { Enemy, realmTakeK } from './combat';
import type { EnemyDef } from '../data/enemies';
import { REALMS, realmName } from '../data/realms';
import { ACTIVE_MAP, WORLD_SCALE, WORLD_W, WORLD_H, MAP_NAME, type MapId } from '../data/world';
import { CharState, type Look } from '../gfx/character';
import { mulberry32 } from '../core/rng';
import { hash32 } from './brawlrng';
import { dirName } from './sites';
import * as C from './cultivation';
import { ITEMS, itemDef } from '../data/items';
import { learnMove, MOVES } from './brawlmoves';
import { startMove } from './brawlmoverun';
import type { MoveCtx } from './brawlmoves';
import { fx3dOf, ywsWingSweep } from './fx3d';
import { hsp2Of } from './hsp2';
import { audio } from './audio';
import { YWS, YWS_MOVES, FORM_NAME, TAU, clamp, animOf, type YwsForm } from './yws-core';
import { registerYws1 } from './yws-moves1';
import { poseAt, idlePose, walkPose, hurtPose, downPose, ghostTrail, moyingGhost, type YwsPose } from './yewushe-anim';   // 画面线帧表：立板的帧和程序姿态
import type { BossView, BossSprite } from '../hd2d/bossthings';
import { registerYws2 } from './yws-moves2';
import { registerYws3 } from './yws-moves3';

// ------------------------------------------------------------------ 存档
export interface YwsCur { map: string; x: number; y: number; day: number; until: number }
export interface YwsSave {
  v: 1; seed: number;
  /** 下一次降临的日子；这一轮的传闻报过没有 */
  next: number; rumored: boolean;
  /** 正在降临：哪张图、在哪、哪天来的、哪天走 */
  cur: YwsCur | null;
  /** 第几次降临（选址的种子）、打败过几次、上次打败的日子、见过他没有 */
  n: number; beats: number; lastBeat?: number; met?: boolean;
  /** 传过的招（技能 id，不带 bxm_） */
  taught?: string[];
}

/** 他能传的四招（打败一次传两招，按这个顺序） */
export const YWS_TEACH = ['yws_huixuan', 'yws_bengyue', 'yws_guimen', 'yws_jielun'] as const;
/** 掉落：高阶魔道材料（id, 数量下限, 上限）、法宝、魂镰（物品 id wpn_scythe_<品阶>，兵器种类由画面线加，有就掉） */
export const YWS_MATS: [string, number, number][] = [['mat_xueyan', 2, 4], ['mat_yuanhun', 3, 6], ['mat_shisha', 2, 4], ['mat_yaodan9', 1, 2], ['mat_yaodan10', 1, 1], ['item_yuanqi', 1, 2], ['mat_gengjing', 1, 2], ['mat_yanghunmu', 1, 2]];
export const YWS_TREASURE = ['art_xuemo', 'art_molongren', 'art_xuehun', 'art_wanhunfan', 'art_jiuyoudeng', 'art_guiluo'];
export const scytheItem = (tier: number) => `wpn_scythe_${clamp(Math.round(tier), 0, 6)}`;

/** 他的敌人定义（不进 ENEMIES：不进刷怪池、不改任何按表挑的随机序列） */
const YWS_DEF: EnemyDef = {
  id: 'yewushe', name: '噬魂魔尊', kind: 'human', robe: '#16101c', title: '魔修·魔尊', minDanger: 99, maxDanger: -1,
  hp: 3.2, atk: 1.4, def: 1.5, speed: 0, drops: [], aggro: 1, evil: true,
} as EnemyDef;

/**
 * 占位外观（画面线的立板来了以后不再用）：白发、黑袍披风、一柄比人还长的长兵器当魂镰；半魔半边身子发暗红；魔躯高大、通身暗紫红
 */
const LOOK_BASE: Look = {
  sex: 'm', height: 1.18, build: 1.2, skin: '#c9b8b0', hair: '#e8e4ee', hairStyle: 'long', fringe: 'part',
  robe: '#17111d', inner: '#3a0d18', trim: '#7a1626', belt: '#2a1a22', pants: '#120d16', boots: '#0d0a10',
  robeLen: 'long', sleeve: 'wide', collar: 'high', skirt: 'split', skirtColor: '#17111d', over: 'cape', overColor: '#2a0a14',
  waist: 'none', back: 'none', hand: 'none', idle: 'stand', pattern: 'cloud',
  weapon: { kind: 'spear', tier: 6, form: 'gun', color: '120,40,160' },
  face: { eye: 'narrow', eyeSize: 0.85, brow: 'thick', browW: 1.2, smile: -0.4, age: 0.3, iris: '#c01830' },
  head: { jaw: 0.95, width: 1, neck: 1 },
  body: { shoulder: 1.15, chest: 1.12, waist: 1, heft: 1.1, arm: 1.06, leg: 1.08 },
} as Look;
export const YWS_LOOKS: Record<YwsForm, Look> = {
  human: LOOK_BASE,
  half: { ...LOOK_BASE, height: 1.3, build: 1.3, skin: '#8a5a66', robe: '#240c18', trim: '#c0202e', overColor: '#4a0c1a', weapon: { kind: 'spear', tier: 6, form: 'gun', color: '200,40,60' }, face: { ...LOOK_BASE.face, iris: '#ff2a40' } } as Look,
  demon: { ...LOOK_BASE, height: 2.1, build: 1.75, skin: '#4a1c2a', hair: '#2a0a10', robe: '#3a0a1a', inner: '#6a0a18', trim: '#ff3040', overColor: '#1a0610', pants: '#2a0812', weapon: { kind: 'spear', tier: 6, form: 'gun', color: '255,50,70' }, body: { shoulder: 1.4, chest: 1.4, waist: 1.1, heft: 1.35, arm: 1.12, leg: 1.1 }, face: { ...LOOK_BASE.face, iris: '#ff4020' } } as Look,
};

/** 江湖传闻（降临前三十日）、降临、离开、打败 */
const RUMOR = [
  '江湖传闻：陨魔谷一带的魔修这些日子一个个销声匿迹，有人说谷底那柄噬魂镰又醒了——上古魔尊夜无赦，怕是要出世了。',
  '江湖传闻：魔门六宗的赤土上夜夜有血光冲天，阴灵门的长老闭门不出。都说「噬魂魔尊」的残魂找到了新的肉身。',
  '江湖传闻：有散修在陨魔谷外围捡到半截魂镰的碎片，回去当夜就疯了，嘴里一直念着一个名字——夜无赦。',
];
const SAY_ENGAGE = ['……又一个送上门的魂魄。', '你的魂，本尊收下了。', '跪下。'];

/** 一场打下来的记录（不存档） */
interface Fight { t0: number; big: number[]; react: number; ph: 'probe' | 'combo' | 'breath'; phT: number; len: number; queue: string[]; qi: number; gap: number; atkT: number; leashT: number; hits: number[]; hp: number; strafe: number }
/** 魔影随身：排队的魔影追打 */
interface Shadow { at: number; tg: Enemy | 'p'; ux: number; uy: number; i: number }

export class Yewushe {
  /** 真身（走近才有） */
  ent: Enemy | null = null;
  /** 立板贴图好了没有（render.ts 每帧经 bossReadyTo 写回）：好了就给真身打 bossHD，不进共享图集、不画占位人形 */
  hdReady = false;
  /** 魔影随身的魔影（立板 ghosts）：出现在哪、朝哪、什么时候出现（出手前 0.2 息）、选抓还是劈 */
  private ghostVis: { x: number; y: number; ux: number; uy: number; t0: number; k: number }[] = [];
  private readonly V: BossView = { sprites: [] };
  private readonly SPR: BossSprite = { id: 9701, key: 'yws_h_idle', x: 0, y: 0, z: 0, H: 235, face: -1, sx: 1, sy: 1, rot: 0, alpha: 1, flash: 0, glow: 0 };
  /** 这一刻的形态 */
  form: YwsForm = 'human';
  /** 平时（在降临处站着）/ 打 / 演示（试玩入口对着木人桩）/ 倒下（打败的那几息） */
  mode: 'idle' | 'fight' | 'demo' | 'dying' = 'idle';
  /** 招式伤害再乘这个（堕魂诀开着时多一成半） */
  dmgK = 1;
  /** 堕魂诀还剩多久 */
  buffT = 0;
  /** 编排开关（测试里一招一招手动放时关掉）；试玩入口强行出招（不看形态、名额、冷却） */
  autoMoves = true; force = false;
  /** 测试、试玩：下一招强行走这几段帧表（招里分支的变体：落魂锤、劫光、狂怒撕裂 → 灭世冲击……）；null = 招式自己挑 */
  forceSeq: string[] | null = null;
  /** 放过的招、发生过的事（测试、试玩页读） */
  castLog: string[] = []; log: string[] = [];
  /** 大招读条（首领血条的蓄力条读 ultOf） */
  ult: { name: string; t0: number; dur: number } | null = null;
  fight: Fight | null = null;
  shadows: Shadow[] = [];
  /** 梦魇种（魔拳 · 魔躯）：挂在谁身上、到什么时候、下一跳在什么时候（2.5 息、每 0.25 息一跳） */
  nightmares: { tg: Enemy | 'p'; until: number; next: number }[] = [];
  /** 试玩入口：对着木人桩循环放某一招（all = 轮着放） */
  demo: { id: string; tg: Enemy; t: number; n: number; hx: number; hy: number; ex: number; ey: number } | null = null;
  /** 帧上的随机序列（编排、魔影）：不碰 Math.random */
  private rnd = mulberry32(0x7e5e1);
  private cds = new Map<string, number>();
  private wsRef: unknown = null;
  private t = 0; private bloodT = 0; private dieT = 0;
  constructor(readonly game: Game) {
    registerYws1(this); registerYws2(this); registerYws3(this);
  }

  // ------------------------------------------------------------------ 存档
  get s(): YwsSave {
    const f = this.game.ws.flags as Record<string, unknown>;
    let s = f.yewushe as YwsSave | undefined;
    if (!s || s.v !== 1 || !Number.isFinite(s.next)) { s = this.fresh(); f.yewushe = s; }
    return s;
  }
  /** 这一局的种子：取活世界前几个人的种子（开局按 Math.random 生成的，每局不同、存档里固定）——这里一个 Math.random 都不取 */
  private seedOf(): number {
    let h = 0x6a09e667;
    const list = (this.game.npcs as unknown as { list?: { seed: number }[] })?.list ?? [];
    for (let i = 0; i < Math.min(8, list.length); i++) h = hash32(h, list[i].seed | 0);
    return h >>> 0;
  }
  private fresh(): YwsSave {
    const seed = this.seedOf(), day = Math.floor(this.game.day), r = mulberry32(hash32(seed, 0x51));
    return { v: 1, seed, next: day + YWS.first[0] + Math.floor(r() * (YWS.first[1] - YWS.first[0])), rumored: false, cur: null, n: 0, beats: 0 };
  }
  /** 他的境界：比你高一个大境界，封顶化神 */
  realmOf(): { realm: number; stage: number } {
    const h = this.game.hero, top = REALMS.length - 1;
    if (h.realm >= top) return { realm: top, stage: REALMS[top].hp.length - 1 };
    const r = Math.max(2, h.realm + 1), n = REALMS[r].hp.length;
    const st = h.realm <= 1 ? Math.min(n - 1, Math.floor(h.stage / 5)) : Math.min(n - 1, h.stage);
    return { realm: r, stage: st };
  }
  get active(): boolean { const c = this.s.cur; return !!c && c.map === ACTIVE_MAP; }

  // ------------------------------------------------------------------ 周期降临（日结算里、每帧半息问一句）
  /** 下一次的间隔：元婴以后更勤 */
  private gapOf(r: () => number): number { const G = this.game.hero.realm >= 4 ? YWS.gapYy : YWS.gap; return G[0] + Math.floor(r() * (G[1] - G[0] + 1)); }
  daily() { this.schedule(Math.floor(this.game.day)); }
  schedule(day: number) {
    const g = this.game, s = this.s, p = g.player;
    const r = mulberry32(hash32(s.seed, s.n, day, 0x5c));
    // 走了：四十日没人打（正打着、正倒下、试玩演示时不走：期限往后挪一天）
    if (s.cur && day > s.cur.until && this.ent && this.mode !== 'idle') s.cur.until = day + 1;
    if (s.cur && day > s.cur.until) {
      const c = s.cur; s.cur = null; s.rumored = false; s.next = day + this.gapOf(r);
      if (this.ent && this.mode !== 'dying') this.despawn(false);
      g.news('四十日里无人能破噬魂魔尊的魔焰——夜无赦收起魂镰，化作一道血光遁回陨魔谷深处。', 'rumor', day);
      this.log.push('leave'); void c;
      return;
    }
    if (s.cur) return;
    // 传闻：降临前三十日
    if (!s.rumored && day >= s.next - YWS.rumorLead) {
      s.rumored = true;
      const text = RUMOR[s.n % RUMOR.length];
      g.news(text, 'rumor', day); g.toast(text, 'info');
      this.log.push('rumor');
    }
    if (day < s.next) return;
    // 降临：只降在南荒（人在别的图时往后推一个月）
    if (ACTIVE_MAP !== 'tiannan' || g.offWorld) { s.next = day + 30; return; }
    const at = this.pickSite(mulberry32(hash32(s.seed, s.n, 0xd35)));
    s.cur = { map: ACTIVE_MAP, x: at.x, y: at.y, day, until: day + YWS.stay };
    s.n++; s.rumored = false;
    const far = Math.round(Math.hypot(at.x - p.x, at.y - p.y) / 30);
    g.news(`${dirName(at.x - p.x, at.y - p.y)}方天降血光，陨魔谷外的赤土裂开一道深渊——上古魔尊「噬魂魔尊 · 夜无赦」借尸重生，降临人间！（约 ${far} 丈外）`, 'canon', day);
    g.toast(`天降血光！噬魂魔尊夜无赦降临陨魔谷外围——地图上标「魔」，${YWS.stay} 日内不除，他便遁回深渊。（他比你高一个大境界）`, 'warn');
    g.juice(0.08, 0.45);   // r19：震动克制（原 0.9）
    this.bloodT = 2.2;
    audio.yws('yws_roar');
    this.log.push('descend');
  }
  /** 陨魔谷外围、魔门六宗的赤土边缘：陆地、走得通、离城镇宗门远、四周开阔（自己的随机序列） */
  pickSite(r: () => number): { x: number; y: number } {
    const zx = 300 * WORLD_SCALE, zy = 592 * WORLD_SCALE;
    for (let k = 0; k < 120; k++) {
      const a = Math.PI * 0.5 + r() * Math.PI, R = 5500 + r() * 14000;   // 陨魔谷西半边：朝魔门六宗那边
      const x = zx + Math.cos(a) * R, y = zy + Math.sin(a) * R * 0.85;
      if (this.siteOk(x, y, k < 80)) return { x, y };   // 前八十次要一片开阔地（没有树林：打起来看得清）
    }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU, x = zx + Math.cos(a) * 9000, y = zy + Math.sin(a) * 9000; if (this.siteOk(x, y)) return { x, y }; }
    return { x: zx - 7000, y: zy };
  }
  siteOk(x: number, y: number, open = false): boolean {
    const g = this.game, T = g.terrain;
    if (open) for (let i = 0; i < 9; i++) { const a = i / 8 * TAU, R = i ? 900 : 0, s = T.sample(x + Math.cos(a) * R, y + Math.sin(a) * R * 0.75); if (s.forest > 0.12 || s.elev > 0.45) return false; }
    if (x < 1200 || y < 1200 || x > WORLD_W - 1200 || y > WORLD_H - 1200) return false;
    if (!T.isLand(x, y) || T.walkFactor(x, y) < 0.3 || T.inLocZone(x, y, 1800) || g.combat.safeAt(x, y)) return false;
    // 避开阵法 / 禁制：打起来人被打飞进阵里，会被阵法打倒、送回城
    const Z = (g as unknown as { zhenfa?: { list: { x: number; y: number; r: number; map?: string; dead?: boolean }[]; inside(i: unknown, x: number, y: number, pad?: number): boolean } }).zhenfa;
    if (Z) for (const i of Z.list) if (!i.dead && (!i.map || i.map === ACTIVE_MAP) && Z.inside(i, x, y, 2200)) return false;
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, px = x + Math.cos(a) * 700, py = y + Math.sin(a) * 520; if (!T.isLand(px, py) || T.walkFactor(px, py) <= 0 || g.combat.safeAt(px, py)) return false; }
    return true;
  }

  // ------------------------------------------------------------------ 每帧
  tick(dt: number) {
    const g = this.game;
    if (g.ws !== this.wsRef) { this.wsRef = g.ws; this.dropLive(); try { this.syncTaught(); } catch { /* 存档还没就绪 */ } }
    this.t -= dt; if (this.t <= 0) { this.t = 0.5; try { this.schedule(Math.floor(g.day)); } catch { /* 地形没就绪 */ } }
    const F = fx3dOf(g); ywsWingSweep(F);
    if (this.bloodT > 0) { this.bloodT = Math.max(0, this.bloodT - dt); const k = Math.min(1, this.bloodT / 1.2); hsp2Of(g).scr({ wash: [0.55, 0.02, 0.05, 0.4 * k], keep: [] }); }
    if (this.buffT > 0) { this.buffT -= dt; if (this.buffT <= 0) this.dmgK = 1; }
    const s = this.s, cur = s.cur;
    if (this.ent && !g.combat.enemies.includes(this.ent)) this.dropLive();
    if (!cur || cur.map !== ACTIVE_MAP || g.offWorld) { if (this.ent) { if (this.mode === 'dying' && !g.offWorld) this.live(dt); else this.despawn(false); } return; }
    const p = g.player, e = this.ent, d = Math.hypot((e?.x ?? cur.x) - p.x, (e?.y ?? cur.y) - p.y);
    if (!e && d < YWS.spawnR && !g.hero.dead) this.spawn();
    else if (e && d > YWS.despawnR && this.mode !== 'dying') this.despawn(true);
    if (this.ent) this.live(dt);
  }

  // ------------------------------------------------------------------ 真身
  private spawn() {
    const g = this.game, s = this.s, cur = s.cur!, { realm, stage } = this.realmOf();
    const R = Math.random; Math.random = mulberry32(hash32(s.seed, s.n, cur.day, 0x5a));
    let e: Enemy;
    try { e = new Enemy(YWS_DEF, cur.x, cur.y, realm, stage); e.cs = new CharState(cur.x, cur.y); } finally { Math.random = R; }
    e.name = '噬魂魔尊 · 夜无赦'; e.boss = true; e.blv = 9; e.team = 'yewushe'; e.school = 'mo'; e.kit = []; e.skT = 1e9; e.cdRanged = 1e9; e.cdMelee = 1e9;
    e.evadeN = 0; e.blinkCd = 1e9; e.dodgeCd = 1e9;
    Object.defineProperty(e, 'rankText', { get: () => `${realmName(e.realm, e.stage)} · 魔尊`, configurable: true });
    (e as unknown as { veto: (x: Enemy) => boolean }).veto = (x) => this.veto(x);
    e.hx = e.x; e.hy = e.y; e.speed = 0;
    (e as unknown as { farKeep: boolean }).farKeep = true;   // 战斗的清理（五千外清掉）不管他：九千五外由这里收起
    this.ent = e; this.mode = 'idle'; this.fight = null; this.shadows = []; this.ult = null;
    this.setForm('human', true);
    this.applyStats(e, true);
    this.shell(e, true);
    g.combat.enemies.push(e);
    const B = g.combat.brawl, b = B.body(e); b.poiseMax = Math.round(B.poiseMaxOf(e) * 3); b.poise = b.poiseMax;
    this.log.push('spawn');
  }
  /** 收起：位置不写回（降临处是固定的） */
  despawn(keepHp = true) {
    const e = this.ent; if (!e) return;
    void keepHp;
    e.dead = true; e.deathT = 1; e.spar = true; e.aggro = false; e.gone = true;
    const c = this.game.combat; c.enemies = c.enemies.filter((x) => x !== e); if (c.lock === e) c.lock = null;
    if (this.demo?.tg) c.enemies = c.enemies.filter((x) => x !== this.demo!.tg);
    this.dropLive();
    this.log.push('despawn');
  }
  private dropLive() { this.nightmares = []; this.ent = null; this.mode = 'idle'; this.fight = null; this.demo = null; this.shadows = []; this.ult = null; this.form = 'human'; this.dmgK = 1; this.buffT = 0; }
  /** 按境界给足；full = 回满 */
  private applyStats(e: Enemy, full = false) {
    const { realm, stage } = this.realmOf(), R = REALMS[realm], st = Math.min(stage, R.hp.length - 1);
    const fr = full || !e.maxHp ? 1 : e.hp / e.maxHp;
    e.realm = realm; e.stage = st; e.level = realm * 13 + st;
    e.maxHp = Math.round(R.hp[st] * YWS_DEF.hp * 1.25 * YWS.hpK); e.hp = Math.max(1, Math.round(e.maxHp * fr));
    e.atk = R.atk[st] * YWS_DEF.atk * YWS.atkK; e.dfn = R.def[st] * YWS_DEF.def;
  }
  private shell(e: Enemy, on: boolean) { (e as unknown as { shell: boolean }).shell = on; }
  /** 换形态（外观、立板高、霸体、走得多快）；silent = 不记 */
  setForm(f: YwsForm, silent = false) {
    const e = this.ent; this.form = f;
    if (!silent) this.log.push('form-' + f);
    if (!e) return;
    e.look = YWS_LOOKS[f];
    (e as unknown as { keepH: number }).keepH = YWS.height[f];
    const B = this.game.combat.brawl, b = B.body(e);
    b.iron = f === 'demon';
    b.poiseMax = Math.round(B.poiseMaxOf(e) * (f === 'demon' ? 6 : f === 'half' ? 3.5 : 3)); b.poise = b.poiseMax; b.breakT = 0;
  }
  /** 霸体：魔躯全程；人身、半魔在放觉醒、变身时 */
  get armored(): boolean { const r = this.run(); return this.form === 'demon' || (!!r && !!YWS_MOVES.get(r.def.id)?.cine); }
  /** 正在放的那一招 */
  run(): MoveCtx | undefined { const e = this.ent; return e ? this.game.combat.brawl.peek(e)?.move : undefined; }
  get moving(): boolean { return !!this.run(); }

  /** 打不死（演示）/ 倒下（真打） */
  private veto(x: Enemy): boolean {
    if (this.mode === 'demo' || this.mode === 'idle') { x.hp = x.maxHp; return true; }
    if (this.mode === 'dying') { x.hp = 1; return true; }
    x.hp = 1; this.defeat(); return true;
  }

  private live(dt: number) {
    const g = this.game, e = this.ent!, B = g.combat.brawl, b = B.body(e);
    e.cdMelee = 1e9; e.skT = 1e9; e.cdRanged = 1e9;
    if (this.armored) { b.armorT = Math.max(b.armorT, 0.2); b.breakT = 0; }
    b.iron = this.form === 'demon';
    this.tickShadows(); this.tickNightmares();
    // 半魔、魔躯：身上的魔焰（每帧报；不报了就收）。魔躯背后的翼归画面线的立板画（常驻的立体魔翼试过：斜俯视角里成了头顶一大片黑影，挡画面），立体魔翼只在变身、灭世魔翼时张开
    if (this.form !== 'human' && this.mode !== 'dying') {
      const F = fx3dOf(g);
      F.aura('yws', e.x, e.y, e.z, this.form === 'demon' ? 1.3 : 0.6);
    }
    switch (this.mode) {
      case 'idle': this.idle(dt); break;
      case 'fight': this.fighting(dt); break;
      case 'demo': this.demoTick(dt); break;
      case 'dying': this.dying(dt); break;
    }
  }
  /** 平时：站在降临处，你走近了转过来看你；你走进一千七以内（或先动手）就开打 */
  private idle(dt: number) {
    const g = this.game, e = this.ent!, cs = e.cs!, p = g.player, cur = this.s.cur;
    this.shell(e, true); e.aggro = false; (e as unknown as { noP: boolean }).noP = false;
    if (e.hp < e.maxHp - 0.5) { e.hp = e.maxHp; this.engage(); return; }   // 先动手
    if (cur && !this.moving) { e.x = cur.x; e.y = cur.y; }
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    cs.x = e.x; cs.y = e.y; cs.lift = 0; cs.speed = 0; cs.setAction('idle');
    if (d < 2600) cs.faceToward(p.x - e.x, p.y - e.y, false);
    cs.update(dt);
    if (d < YWS.aggroR && !g.hero.dead && !g.combat.safeAt(p.x, p.y)) this.engage();
  }
  /** 开打 */
  engage() {
    const g = this.game, e = this.ent; if (!e || this.mode === 'fight') return;
    this.mode = 'fight'; e.aggro = true; e.hunt = true; e.tgP = true; e.spar = false;
    this.fight = { t0: g.time, big: [], react: 1, ph: 'probe', phT: 0, len: 1.6, queue: [], qi: 0, gap: 0, atkT: 0.6, leashT: 0, hits: [], hp: e.hp, strafe: this.rnd() < 0.5 ? 1 : -1 };
    const s = this.s;
    g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 240, s: SAY_ENGAGE[Math.floor(this.rnd() * SAY_ENGAGE.length) % SAY_ENGAGE.length], color: '#e9a0ff', t: 0, vy: -14, big: true } as never);
    if (!s.met) { s.met = true; g.news('在陨魔谷外的赤土上遇见噬魂魔尊夜无赦：白发黑袍，手里那柄魂镰比人还高，镰刃上缠着哀嚎的魂魄。', 'personal'); }
    g.toast('噬魂魔尊夜无赦提镰而来！气血七成、四成时他会两次变身，魔躯形态全程霸体、会放觉醒大招。', 'warn');
    g.combat.lock = e; g.combat.manual = true;
    audio.yws('yws_dark', e.x, e.y);
    this.log.push('engage');
    // 起手先放一记堕魂诀（自强化）
    this.cds.clear();
    if (this.autoMoves) this.fire('yws_duohun', null);
  }
  /** 脱战：回到降临处、回满、变回人身 */
  disengage(why: string) {
    const g = this.game, e = this.ent; if (!e) return;
    for (const r of g.combat.brawl.runs) if (r.user === e) r.done = true;
    g.combat.brawl.clear(e);
    this.mode = 'idle'; this.fight = null; this.ult = null; this.shadows = []; this.dmgK = 1; this.buffT = 0;
    this.setForm('human');
    this.applyStats(e, true);
    const cur = this.s.cur; if (cur) { e.x = cur.x; e.y = cur.y; e.flyH = 0; e.lift = 0; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; } }
    if (g.combat.lock === e) g.combat.lock = null;
    this.log.push('reset-' + why);
  }

  // ------------------------------------------------------------------ 打
  private fighting(dt: number) {
    const g = this.game, e = this.ent!, p = g.player, F = this.fight!, cur = this.s.cur;
    e.aggro = true; e.hunt = true;
    const d = Math.hypot(p.x - e.x, p.y - e.y);
    // 脱战：你倒下、你跑远（离他、离降临处都远）一阵子
    if (g.hero.dead) { this.disengage('dead'); return; }
    const far = (cur ? Math.hypot(p.x - cur.x, p.y - cur.y) > YWS.leashR : d > YWS.leashR) || g.combat.safeAt(p.x, p.y);
    F.leashT = far ? F.leashT + dt : 0;
    if (F.leashT > YWS.leashT) { this.disengage('leash'); return; }
    // 被打飞（人身、半魔破了罡气被你轰飞）：落地前不驱动
    const B = g.combat.brawl, b = B.body(e);
    if (b.air || b.staggerT > 0 || b.freezeT > 0) { this.shell(e, false); return; }
    // 罡气被打空（人身、半魔）：放下 shell 一小会儿，你的重击能把他轰飞
    this.shell(e, !(b.breakT > 0 && !this.armored && !this.moving));
    // 形态机：七成进半魔、四成进魔躯（招里不换：等这一招收了）
    if (!this.moving) {
      const k = e.hp / e.maxHp;
      if (this.form === 'human' && k <= YWS.halfAt) { if (!this.fire('yws_ruti', null, true)) this.setForm('half'); return; }
      if (this.form === 'half' && k <= YWS.demonAt) { if (!this.fire('yws_jiangshen', null, true)) this.setForm('demon'); return; }
    }
    if (this.autoMoves) this.direct(dt, d);
    if (!this.moving) this.steer(dt, d);
  }
  /** 走位：朝你走到想要的距离（试探时贴身、喘息时退开绕一绕） */
  private want = 200;
  private steer(dt: number, d: number) {
    const g = this.game, e = this.ent!, cs = e.cs!, p = g.player, T = g.terrain, F = this.fight;
    const dx = p.x - e.x, dy = p.y - e.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const sp = this.form === 'demon' ? 250 : this.form === 'half' ? 320 : 290;
    let mx = 0, my = 0;
    if (d > this.want + 60) { mx = ux; my = uy; }
    else if (d < this.want - 80) { mx = -ux; my = -uy; }
    if (F && F.ph === 'breath') { mx += -uy * F.strafe * 0.8; my += ux * F.strafe * 0.8; }
    const ml = Math.hypot(mx, my);
    let moving = false;
    if (ml > 0.05) {
      const v = sp * dt * Math.min(1, ml), nx = e.x + mx / ml * v, ny = e.y + my / ml * v;
      const cur = this.s.cur, inLeash = !cur || Math.hypot(nx - cur.x, ny - cur.y) < YWS.leashR;   // 不追出降临处四千二
      if (inLeash && T.walkFactor(nx, ny) > 0 && T.isLand(nx, ny) && T.canTraverse(e.x, e.y, nx, ny) && !g.combat.safeAt(nx, ny)) { e.x = nx; e.y = ny; moving = true; }
    }
    e.hx = e.x; e.hy = e.y;
    cs.x = e.x; cs.y = e.y; cs.lift = e.flyH + e.lift; cs.speed = moving ? sp : 0;
    cs.faceToward(ux, uy, false); e.facing = ux >= 0 ? 1 : -1;
    if ((e as unknown as { shell: boolean }).shell) { cs.setAction(moving ? (sp > 280 ? 'run' : 'walk') : 'idle'); cs.update(dt); }
    e.anim.move = moving ? 1 : 0;
  }
  /** 冲他来的法术 / 飞剑有几件（八百以内、朝着他飞） */
  private nIncoming(): number {
    const e = this.ent!; let n = 0;
    for (const pr of this.game.combat.projs) { if (pr.fac !== 'p' || pr.ally) continue; const dd = Math.hypot(pr.x - e.x, pr.y + (pr.visual?.groundOffsetY ?? 40) - e.y); if (dd < 800 && pr.vx * (e.x - pr.x) + pr.vy * (e.y - pr.y - 40) > 0) n++; }
    return n;
  }
  /** 你在蓄重击 */
  private winding(): boolean { const B = this.game.combat.brawl as unknown as { wind?: unknown }; return !!B.wind; }
  /** 编排：试探 → 连招 → 喘息 → 应对 */
  private direct(dt: number, d: number) {
    const F = this.fight!, g = this.game, e = this.ent!;
    F.phT += dt; F.react -= dt;
    if (e.hp < F.hp - 0.5) F.hits.push(g.time);
    F.hp = e.hp; F.hits = F.hits.filter((t) => g.time - t < 1.6);
    if (this.moving) return;
    // 应对：飞来的法术（魔障屏障吞掉）、你贴身蓄重击（魔审抢先）、被连着打（魔躯魔啸震开）
    if (F.react <= 0 && F.ph !== 'breath') {
      const n = this.nIncoming();
      if (n >= 1 && this.fire('yws_pingzhang', null)) { F.react = 2.2; return; }
      if (d < 380 && this.winding() && this.fire('yws_moshen', null)) { F.react = 2; return; }
      if (F.hits.length >= 4 && this.form === 'demon' && this.fire('yws_moxiao', null)) { F.react = 3; F.hits = []; return; }
    }
    switch (F.ph) {
      case 'probe': {
        this.want = 190;
        F.atkT -= dt;
        if (d < 330 && F.atkT <= 0) { if (this.fire('yws_sanshi', null)) F.atkT = 1.1 + this.rnd() * 0.6; else F.atkT = 0.3; }
        if (F.phT < F.len) return;
        F.queue = this.pickCombo(d); F.qi = 0; F.ph = 'combo'; F.phT = 0; F.gap = 0.1;
        return;
      }
      case 'combo': {
        F.gap -= dt; if (F.gap > 0) return;
        if (F.qi >= F.queue.length || F.phT > 14) { F.ph = 'breath'; F.phT = 0; F.len = 0.9 + this.rnd() * 1.1; return; }
        const id = F.queue[F.qi++];
        F.gap = this.fire(id, null) ? 0.22 : 0.05;
        return;
      }
      case 'breath': {
        this.want = 520;
        if (F.phT < F.len) return;
        F.ph = 'probe'; F.phT = 0; F.len = 1.4 + this.rnd() * 1.8; F.strafe = -F.strafe; F.atkT = 0.2;
        return;
      }
    }
  }
  /** 一套连招（按形态和远近；自己的随机序列）。魔躯：隔一阵来一记觉醒大招（名额有就放，放不出就跳过） */
  pickCombo(d: number): string[] {
    const f = this.form, R = () => this.rnd();
    const nearT: Record<YwsForm, string[][]> = {
      human: [['yws_sanshi', 'yws_mozhua'], ['yws_xuelian'], ['yws_bengyue'], ['yws_youming', 'yws_sanshi'], ['yws_mingchu'], ['yws_moquan'], ['yws_jielun'], ['yws_sanshi', 'yws_bengyue'], ['yws_mozhang'], ['yws_mieshi', 'yws_sanshi'], ['yws_moxiao']],
      half: [['yws_xuelian', 'yws_bengyue'], ['yws_sanshi', 'yws_moquan'], ['yws_jielun', 'yws_youming'], ['yws_mingchu', 'yws_xuelian'], ['yws_mozhua', 'yws_bengyue'], ['yws_moquan', 'yws_guimen'], ['yws_mozhang', 'yws_mieshi'], ['yws_moxiao', 'yws_sanshi']],
      demon: [['yws_liehun', 'yws_mieshi'], ['yws_xuelian', 'yws_liehun'], ['yws_bengyue', 'yws_moquan'], ['yws_tianqing'], ['yws_mieshi'], ['yws_jielun', 'yws_liehun'], ['yws_mingchu', 'yws_bengyue'], ['yws_moshen2'], ['yws_sanshi', 'yws_mozhang'], ['yws_youming', 'yws_moshen2']],
    };
    const farT: Record<YwsForm, string[][]> = {
      human: [['yws_huixuan'], ['yws_mozhua', 'yws_sanshi'], ['yws_guimen'], ['yws_xianjing'], ['yws_jielun'], ['yws_mieshi']],
      half: [['yws_huixuan', 'yws_mozhua'], ['yws_guimen', 'yws_xuelian'], ['yws_huixuan', 'yws_youming'], ['yws_mozhua', 'yws_moquan'], ['yws_tianqing'], ['yws_xianjing']],
      demon: [['yws_huixuan', 'yws_liehun'], ['yws_mozhua', 'yws_mieshi'], ['yws_tianqing'], ['yws_xianjing', 'yws_liehun'], ['yws_guimen', 'yws_liehun'], ['yws_moshen2']],
    };
    const L = d > 520 ? farT[f] : nearT[f];
    const q = L[Math.floor(R() * L.length) % L.length].slice();
    if (f === 'demon' && R() < 0.4) { const bigs = ['yws_shixian', 'yws_moyi']; q.push(bigs[Math.floor(R() * bigs.length) % bigs.length]); }   // 觉醒大招（名额不够就放不出、跳过）
    else if (f === 'demon' && R() < 0.3) q.push('yws_mochao');
    return q;
  }
  /** 放一招（编排、试玩、测试都走这里）。force：不看冷却、名额（试玩入口 / 变身） */
  fire(id: string, tg: Enemy | null, force = false): boolean {
    const e = this.ent; if (!e || e.dead || this.mode === 'dying') return false;
    const def = YWS_MOVES.get(id); if (!def) return false;
    const B = this.game.combat.brawl; if (B.peek(e)?.move) return false;
    const F = force || this.force;
    if (!F) {
      if (!def.forms.includes(this.form)) return false;
      if ((this.cds.get(id) ?? -1) > this.game.time) return false;
      if (def.big && !this.bigOk()) return false;
    }
    if (!startMove(B, def, e, tg ?? 'p')) return false;
    this.cds.set(id, this.game.time + def.cd);
    if (def.big && this.mode === 'fight') this.useBig();
    this.castLog.push(id); if (this.castLog.length > 96) this.castLog.shift();
    return true;
  }
  /** 觉醒大招的名额：魔躯、一场最多两次、两次之间至少隔一阵（试玩 / 强行出招不看） */
  bigOk(): boolean {
    if (this.force) return true;
    const F = this.fight; if (!F || this.form !== 'demon') return false;
    return F.big.length < YWS.bigMax && (!F.big.length || this.game.time - F.big[F.big.length - 1] >= YWS.bigGap);
  }
  useBig() { this.fight?.big.push(this.game.time); this.log.push('big'); }
  /** 冷却清零（试玩、测试） */
  clearCd() { this.cds.clear(); }

  // ------------------------------------------------------------------ 魔影随身（被动）
  /** 每次出手（招式的 init 调）：按自己的序列，几成几率追加魔影追打（觉醒、变身、自强化不追） */
  onCast(c: MoveCtx) {
    const def = YWS_MOVES.get(c.def.id); if (!def || def.cine || def.big || c.def.id === 'yws_duohun' || c.def.id === 'yws_pingzhang') return;
    const tg = c.target; if (!tg) return;
    if (this.rnd() >= YWS.shadowCh[this.form] && !this.force) return;
    const n = this.form === 'demon' ? 2 : 1, ux = c.dirX, uy = c.dirY;
    for (let i = 0; i < n; i++) this.shadows.push({ at: this.game.time + YWS.shadowDelay + i * 0.22 + 0.3, tg, ux, uy, i });
    this.log.push('shadow');
  }
  /** 魔影：从对手身后的地里冒出一个半透明的他，一镰横斩（伤害走 hitPlayer / npcHit） */
  private tickShadows() {
    const g = this.game, e = this.ent; if (!e || !this.shadows.length) return;
    const now = g.time, F = fx3dOf(g), B = g.combat.brawl, c = g.combat;
    for (let i = this.shadows.length - 1; i >= 0; i--) {
      const S = this.shadows[i]; if (now < S.at) continue;
      this.shadows.splice(i, 1);
      const tg = S.tg, p = g.player;
      const tx = tg === 'p' ? p.x : tg.x, ty = tg === 'p' ? p.y : tg.y;
      if (tg !== 'p' && tg.dead) continue;
      const side = S.i % 2 ? 1 : -1, sx = tx - S.ux * 150 + -S.uy * 60 * side, sy = ty - S.uy * 150 + S.ux * 60 * side;
      if (!this.hdReady) B.ghosts.push({ e, x: sx, y: sy, z: 0, t: 0, dur: 0.5, yaw: Math.atan2(S.ux, S.uy), color: '140,50,200', sx: S.ux * 40, sy: S.uy * 40 } as never);
      this.ghostVis.push({ x: sx, y: sy, ux: S.ux, uy: S.uy, t0: now - 0.2, k: (hash32(S.i, Math.round(S.at * 1000)) % 1000) / 1000 });
      F.scythe(sx, sy, 100, { nx: 0, ny: 0, nz: 1, e1: [-S.ux, -S.uy, 0], a0: -0.6, sweep: 3.4, r: 170, w: 56, dur: 0.36, col: [0.8, 0.45, 1.3] });
      F.soul(tx, ty, 90, { r: 160, dur: 0.4, n: 8 });
      audio.yws('yws_shadow', tx, ty);
      const inR = Math.hypot(tx - sx, ty - sy) < 260 && (tg !== 'p' || !g.hero.dead);
      if (!inR) continue;
      if (tg === 'p') { const ps = c.pStats, raw = YWS.shadowFrac * ps.hp / realmTakeK(e.realm - g.hero.realm, g.hero.realm) + ps.def * 0.8; B.hurtPlayer(raw, e.realm, sx, sy, e, 'yws_shadow'); }
      else { const raw = YWS.shadowFrac * tg.maxHp / (realmTakeK(clamp(e.realm - tg.realm, -3, 3), tg.realm) * 0.55) + tg.dfn * 0.8; c.npcHit(e, tg, raw, e.realm, undefined, sx, sy); }
      this.log.push('shadow-hit');
    }
  }

  /** 梦魇种：种在对手身上，2.5 息里每 0.25 息一跳（伤害走 hitPlayer / npcHit） */
  plantNightmare(tg: Enemy | 'p') { const t = this.game.time; this.nightmares = this.nightmares.filter((n) => n.tg !== tg); this.nightmares.push({ tg, until: t + 2.5, next: t + 0.25 }); this.log.push('nightmare'); }
  private tickNightmares() {
    const g = this.game, e = this.ent; if (!e || !this.nightmares.length) return;
    const now = g.time, c = g.combat, B = c.brawl, F = fx3dOf(g);
    this.nightmares = this.nightmares.filter((n) => now < n.until && (n.tg === 'p' ? !g.hero.dead : !n.tg.dead));
    for (const n of this.nightmares) {
      if (now < n.next) continue; n.next += 0.25;
      const x = n.tg === 'p' ? g.player.x : n.tg.x, y = n.tg === 'p' ? g.player.y : n.tg.y;
      F.soul(x, y, 100, { r: 90, dur: 0.25, n: 3, col: [1.5, 0.12, 0.16] });
      if (n.tg === 'p') { const ps = c.pStats; B.hurtPlayer(0.006 * ps.hp / realmTakeK(e.realm - g.hero.realm, g.hero.realm) + ps.def * 0.8, e.realm, e.x, e.y, e, 'yws_menyan'); }
      else c.npcHit(e, n.tg, 0.006 * n.tg.maxHp / (realmTakeK(clamp(e.realm - n.tg.realm, -3, 3), n.tg.realm) * 0.55) + n.tg.dfn * 0.8, e.realm, undefined, e.x, e.y);
      this.log.push('nightmare-hit');
    }
  }

  // ------------------------------------------------------------------ 倒下、奖励、传招
  private defeat() {
    const g = this.game, e = this.ent!, s = this.s, day = Math.floor(g.day);
    this.mode = 'dying'; this.dieT = 0; this.ult = null; this.shadows = [];
    for (const r of g.combat.brawl.runs) if (r.user === e) r.done = true;
    s.cur = null; s.beats++; s.lastBeat = day; s.rumored = false;
    s.next = day + YWS.rest + this.gapOf(mulberry32(hash32(s.seed, s.n, 0xbea7)));
    const got = this.reward();
    const learned = this.teachNext();
    g.news(`苏寒于陨魔谷外力斩噬魂魔尊夜无赦！魂镰坠地，上古魔魂烟消云散——魔门六宗为之震动。`, 'canon', day);
    g.toast(`噬魂魔尊夜无赦伏诛！获得：${got.join('、')}${learned.length ? `；学会了${learned.map((n) => '「' + n + '」').join('、')}（法术书里，可以拖进技能栏）` : ''}`, 'good');
    g.juice(0.2, 0.5);   // r19：震动克制（原 1.2）
    g.combat.texts.push({ anchor: { x: e.x, y: e.y, offsetY: -e.z }, x: e.x, y: e.y - 260, s: '……本尊……还会回来……', color: '#e9a0ff', t: 0, vy: -10, big: true } as never);
    const F = fx3dOf(g);
    F.blast(e.x, e.y, 2.2, 'void', { z: 120, r: 320 }); F.soul(e.x, e.y, 120, { r: 520, dur: 1.4, n: 40 }); F.column(e.x, e.y, { h: 3600, r: 140, dur: 1.6, col: [1.2, 0.3, 0.9] });
    audio.yws('yws_big', e.x, e.y);
    if (g.combat.lock === e) g.combat.lock = null;
    this.log.push('defeat');
  }
  private dying(dt: number) {
    const e = this.ent!, cs = e.cs!;
    this.dieT += dt; this.shell(e, true);
    cs.x = e.x; cs.y = e.y; cs.setAction('hit'); cs.update(dt);
    if (this.dieT > 1.6) { this.despawn(false); }
  }
  /** 掉落（自己的随机序列）：灵石、两三样高阶魔道材料、一件法宝、魂镰（物品表里有就掉）。直接进储物袋，返回清单 */
  reward(): string[] {
    const g = this.game, h = g.hero, s = this.s, r = mulberry32(hash32(s.seed, s.beats, 0x7015));
    const got: string[] = [];
    const ls = Math.round((30000 + r() * 60000) * (1 + 0.5 * Math.max(0, h.realm - 3))); C.addItem(h, 'mat_lingshi', ls); got.push(`灵石 ${ls}`);
    const mats = YWS_MATS.filter(([id]) => ITEMS[id]), n = 3 + (r() < 0.5 ? 1 : 0), used = new Set<string>();
    for (let k = 0; k < 20 && used.size < Math.min(n, mats.length); k++) {
      const [id, a, b] = mats[Math.floor(r() * mats.length) % mats.length]; if (used.has(id)) continue; used.add(id);
      const m = a + Math.floor(r() * (b - a + 1)); C.addItem(h, id, m); got.push(`${itemDef(id).name}${m > 1 ? '×' + m : ''}`);
    }
    const tr = YWS_TREASURE.filter((id) => ITEMS[id]), fresh = tr.filter((id) => C.bagCount(h, id) <= 0), pool = fresh.length ? fresh : tr;
    if (pool.length) { const id = pool[Math.floor(r() * pool.length) % pool.length]; C.addItem(h, id, 1); got.push(`【${itemDef(id).name}】`); }
    // 魂镰：最高一阶是他的本命魂镰（打败三次以上、或你已化神）
    const tier = clamp(h.realm + 1 + Math.max(0, s.beats - 1), 2, 6), sid = scytheItem(s.beats >= 3 || h.realm >= 5 ? 6 : Math.min(5, tier));
    if (ITEMS[sid]) { C.addItem(h, sid, 1); got.push(`【${itemDef(sid).name}】`); this.log.push('scythe-' + sid); }
    else this.log.push('scythe-none');
    this.log.push('reward-' + got.length);
    return got;
  }
  /** 传招：打败一次传两招（按 YWS_TEACH 的顺序）。返回这一次新学会的名字 */
  teachNext(): string[] {
    const s = this.s, h = this.game.hero, out: string[] = [];
    const taught = (s.taught ??= []);
    for (const id of YWS_TEACH) { if (out.length >= 2) break; if (taught.includes(id) || !MOVES.has(id)) continue; taught.push(id); if (learnMove(h, id)) out.push(MOVES.get(id)!.name); }
    this.log.push('teach-' + out.length);
    return out;
  }
  /** 读档：存档里记着传过、法术书里却没有的补上 */
  syncTaught() { const h = this.game.hero; for (const id of this.s.taught ?? []) if (MOVES.has(id)) learnMove(h, id); }

  // ------------------------------------------------------------------ 界面
  /** 首领血条下的蓄力条（0‥1；没在读条返回 0） */
  ultOf(e: Enemy | null): number { const u = this.ult; if (!u || !e || e !== this.ent) return 0; const k = (this.game.time - u.t0) / u.dur; if (k >= 1) { this.ult = null; return 0; } return Math.max(0.001, k); }
  /** 大招开始读条（招式的 begin 调） */
  tele(name: string, dur: number) { this.ult = { name, t0: this.game.time, dur }; audio.yws('yws_tele', this.ent?.x, this.ent?.y); this.log.push('tele-' + name); }
  /** 大招演出时收起界面（hsp2.hsCine 问这一句） */
  cine(): boolean { const r = this.run(); return !!r && !!YWS_MOVES.get(r.def.id)?.cine; }
  /** 地图标记 */
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const c = this.s.cur; if (!c || c.map !== ACTIVE_MAP) return [];
    const left = Math.max(1, Math.ceil(c.until - this.game.day));
    return [{ x: c.x, y: c.y, glyph: '魔', color: '#ff3a5a', ring: 1600, name: `噬魂魔尊 · 夜无赦降临（余 ${left} 日）` }];
  }
  /** 大事记「眼下机缘」 */
  chance(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string } | null {
    const c = this.s.cur, p = this.game.player; if (!c) return null;
    const left = Math.max(1, Math.ceil(c.until - this.game.day));
    if (c.map !== ACTIVE_MAP) return { t: '噬魂魔尊降临', d: `${MAP_NAME[c.map as MapId] ?? '南荒'}陨魔谷外，余 ${left} 日。`, tone: 'red' };
    return { t: '噬魂魔尊 · 夜无赦', d: `${dirName(c.x - p.x, c.y - p.y)}方约 ${Math.round(Math.hypot(c.x - p.x, c.y - p.y) / 30)} 丈，血光冲天。他比你高一个大境界——${left} 日内不除，他便遁回深渊。`, x: c.x, y: c.y, hot: true, tone: 'red' };
  }

  /**
   * 画面线的立板要的东西，一处给齐（hd2d/bossthings.ts 每帧调；world/yewushe-anim.ts 的 poseAt(anim, form, animT, { dist }) 取帧和程序姿态）：
   *   form 形态、x / y / z 位置（z 离地）、yaw 朝向（世界）、facing 左右、move 正在放的招（我们的 id，null = 走位 / 待机）、t 这一招放到第几息（招式自己的钟：顿帧时停住）、
   *   anim 帧表里的招 id（规格书「招式 id 一览」；招里换段时跟着换：空斩、落魂锤、劫光、裂影杀、魔呓、玄冥终焉、末劫狂想、末劫陷阱、狂怒撕裂、灭世冲击）、animT 这一段放到第几毫秒、
   *   dist 到对手多远（poseAt 的 opts.dist）、act 走位时的动作（idle / walk / run / hit）、armor 霸体、ult 读条 0‥1、h 立板高（世界单位）、flash 受击闪白、dying 倒下
   */
  state(): { form: YwsForm; x: number; y: number; z: number; yaw: number; facing: number; move: string | null; t: number; anim: string | null; animT: number; dist: number; act: string; armor: boolean; ult: number; h: number; flash: number; dying: boolean } | null {
    const e = this.ent; if (!e) return null;
    const r = this.run(), d = r?.data as { T?: number } | undefined, A = r ? animOf(r.def.id, (r.data as { form?: YwsForm }).form ?? this.form, r.data) : { anim: null, animT: 0 };
    const tg = r?.target, p = this.game.player, tx = tg === 'p' || !tg ? p.x : tg.x, ty = tg === 'p' || !tg ? p.y : tg.y;
    return {
      form: this.form, x: e.x, y: e.y, z: e.z, yaw: e.cs?.yaw ?? 0, facing: e.facing, move: r ? r.def.id : null, t: r ? (d?.T ?? r.t) : 0, anim: A.anim, animT: A.animT, dist: Math.hypot(tx - e.x, ty - e.y),
      act: e.cs?.action ?? 'idle', armor: this.armored, ult: this.ultOf(e), h: YWS.height[this.form], flash: e.hitFlash, dying: this.mode === 'dying',
    };
  }

  /**
   * 首领立板（hd2d/bossthings.ts 的 bossViewOf 每帧问）：一张 BossSprite。
   *   · 放招时：poseAt(帧表 id, 形态, 这一段的毫秒, { dist }) 取帧名和程序姿态；位置用 Enemy 的 x / y / z——招式那边已经按帧表的 dx / dy / lift 把人挪过去了，这里不再加；
   *   · 不放招：倒下 downPose、受击 hurtPose、走位 walkPose、站着 idlePose；
   *   · face = 朝向 · 镜头右方向 的正负（原画朝左）；冲刺残影按 ghostTrail 排（换成世界坐标）；魔影随身的魔影按 moyingGhost 塞进 ghosts。
   */
  view(): BossView | null {
    const e = this.ent, V = this.V; V.sprites.length = 0; if (!e) return V;
    (e as unknown as { bossHD: boolean }).bossHD = this.hdReady;
    const g = this.game, now = g.time, s = this.SPR, r = this.run(), form = this.form;
    const R = (g as unknown as { renderer?: { hd?: { rightDir: { x: number; y: number } } } }).renderer?.hd?.rightDir ?? { x: 1, y: 0 };
    let P: YwsPose, ux: number, uy: number, d: Record<string, unknown> | null = null;
    if (r) {
      d = r.data; const A = animOf(r.def.id, (d.form as YwsForm) ?? form, d);
      ux = d.ux as number; uy = d.uy as number;
      P = A.anim ? poseAt(A.anim, (d.form as YwsForm) ?? form, A.animT, { dist: (d.dist as number) ?? 400 }) : idlePose(form, now * 1000);
    } else {
      const yaw = e.cs?.yaw ?? 0; ux = Math.sin(yaw); uy = Math.cos(yaw);
      const b = g.combat.brawl.peek(e);
      if (this.mode === 'dying') P = downPose(form);
      else if (b && b.staggerT > 0 && form !== 'demon') P = hurtPose(form, Math.max(0, 0.3 - b.staggerT) * 1000);
      else if ((e.cs?.speed ?? 0) > 1) P = walkPose(form, now * 1000);
      else P = idlePose(form, now * 1000);
    }
    const face = ux * R.x + uy * R.y >= 0 ? 1 : -1;
    s.key = P.frame; s.x = e.x; s.y = e.y; s.z = Math.max(0, e.z); s.H = P.H; s.ax = P.ax; s.face = face;
    s.sx = P.sx; s.sy = P.sy; s.rot = P.rot; s.alpha = this.mode === 'dying' ? Math.max(0, 1 - this.dieT / 1.6) : P.alpha; s.flash = Math.max(P.flash, Math.min(1, e.hitFlash * 4));
    s.tint = P.tint; s.add = P.add; s.glow = P.glow; s.glowCol = P.glowCol; s.ghost = 0; s.shadow = P.alpha;
    const gh: NonNullable<BossSprite['ghosts']> = [];
    // 冲刺残影（帧表这一段 ghost > 0）
    if (r && d && P.ghost > 0 && d.sub) {
      const sox = (d.sox as number) ?? e.x, soy = (d.soy as number) ?? e.y;
      for (const q of ghostTrail(d.sub as string, (d.form as YwsForm) ?? form, ((d.T as number) - ((d.subT0 as number) ?? 0)) * 1000, { dist: (d.dist as number) ?? 400 }))
        gh.push({ x: sox + ux * q.dx, y: soy + uy * q.dx + q.dy, z: Math.max(0, q.lift), alpha: q.alpha * P.ghost, key: q.frame, sx: q.sx, sy: q.sy, rot: q.rot, H: q.H, ax: q.ax, face });
    }
    // 魔影随身：要出手的（出手前 0.2 息浮出，跟着对手）和刚出过手的
    const p = g.player;
    for (const S of this.shadows) {
      const t = (now - (S.at - 0.2)) * 1000; if (t < 0) continue;
      const tx = S.tg === 'p' ? p.x : S.tg.x, ty = S.tg === 'p' ? p.y : S.tg.y, side = S.i % 2 ? 1 : -1;
      this.pushMoying(gh, tx - S.ux * 150 - S.uy * 60 * side, ty - S.uy * 150 + S.ux * 60 * side, S.ux, S.uy, t, (S.i * 0.37) % 1, R);
    }
    this.ghostVis = this.ghostVis.filter((v) => now - v.t0 < 0.3);
    for (const v of this.ghostVis) this.pushMoying(gh, v.x, v.y, v.ux, v.uy, (now - v.t0) * 1000, v.k, R);
    s.ghosts = gh.length ? gh : undefined;
    V.sprites.push(s);
    return V;
  }
  private pushMoying(gh: NonNullable<BossSprite['ghosts']>, x: number, y: number, ux: number, uy: number, t: number, k: number, R: { x: number; y: number }) {
    const m = moyingGhost(this.form, t, k); if (!m) return;
    gh.push({ x: x - ux * m.back, y: y - uy * m.back, z: m.up, alpha: m.alpha, key: m.key, sx: m.sx, sy: m.sy, H: m.H, ax: m.ax, face: ux * R.x + uy * R.y >= 0 ? 1 : -1 });
  }

  // ------------------------------------------------------------------ 试玩入口 / 测试
  /** 立刻降临（at = 降临处；不给就按种子选址）。spawnNow：不等走近，立刻生成真身 */
  descendNow(at?: { x: number; y: number }, spawnNow = false) {
    const g = this.game, s = this.s, day = Math.floor(g.day);
    if (this.ent) this.despawn(false);
    s.cur = null; s.next = day; s.rumored = true;
    this.schedule(day);
    if (at && s.cur) { s.cur.x = at.x; s.cur.y = at.y; }
    if (spawnNow && s.cur) this.spawn();
  }
  /** 试玩入口：对着木人桩循环放一招（all = 这一形态会的招轮着放） */
  startDemo(id: string, form: YwsForm): Enemy | null {
    const e = this.ent; if (!e) return null;
    const B = this.game.combat.brawl;
    const far = !!YWS_MOVES.get(id)?.far;
    const tg = B.spawnSparMan(e.x + (far ? 640 : 230), e.y + 10, Math.max(1, e.realm - 1));
    tg.kit = []; tg.skT = 1e9; tg.cdRanged = 1e9; tg.aggro = false; tg.speed = 0;
    this.mode = 'demo'; this.fight = { t0: this.game.time, big: [], react: 9, ph: 'probe', phT: 0, len: 9, queue: [], qi: 0, gap: 0, atkT: 9, leashT: 0, hits: [], hp: e.hp, strafe: 1 };
    this.setForm(form);
    this.demo = { id, tg, t: 0.8, n: 0, hx: tg.x, hy: tg.y, ex: e.x, ey: e.y };
    return tg;
  }
  /** 这一形态会放的招（演示 all 轮着放） */
  formMoves(f: YwsForm): string[] { return [...YWS_MOVES.values()].filter((m) => m.forms.includes(f) && m.id !== 'yws_ruti' && m.id !== 'yws_jiangshen' && m.id !== 'yws_pingzhang').map((m) => m.id); }
  private demoTick(dt: number) {
    const D = this.demo!, e = this.ent!, g = this.game, B = g.combat.brawl, tg = D.tg;
    if (!g.combat.enemies.includes(tg)) { this.demo = null; this.mode = 'idle'; return; }
    e.hp = e.maxHp; tg.hp = tg.maxHp; this.shell(e, true);
    if (this.moving) return;
    D.t += dt;
    const list = D.id === 'all' ? this.formMoves(this.form) : [D.id];
    const id = list[D.n % Math.max(1, list.length)];
    const far = !!YWS_MOVES.get(id)?.far;
    if (D.t > 0.7) {
      const tb = B.peek(tg);
      if (!tb?.air && Math.hypot(tg.x - D.hx, tg.y - D.hy) > 20) { B.clear(tg); tg.x = D.hx; tg.y = D.hy; tg.flyH = 0; tg.lift = 0; tg.kx = tg.ky = 0; }
      const ex = D.hx - (far ? 640 : 230), ey = D.hy - 10;
      if (Math.hypot(e.x - ex, e.y - ey) > 20) { e.x = ex; e.y = ey; e.flyH = 0; e.lift = 0; }
      const cs = e.cs!; cs.x = e.x; cs.y = e.y; cs.lift = 0; cs.faceToward(tg.x - e.x, tg.y - e.y, false); cs.setAction('idle'); cs.update(dt);
    }
    if (D.t < 1.6) return;
    if (this.fire(id, tg, true)) { D.t = 0; D.n++; }
    else D.n++;
  }
}
