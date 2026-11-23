// 虚空里的即时斗法。
//
// 在虚空里飞，镜头离人很远、遁速是界内的上百倍——这个尺度上没法斗法。被虚空兽（或追进虚空的追兵）贴近，
// 或是自己飞去撞上一头，就「交手」：
//   1. 遁速落回界内的快慢，镜头在一息左右里从巡航的远近拉到界内斗法的远近（画面仍是虚空那边画的，背景连续）；
//   2. 镜头到位的那一帧换手：人和对手都落进图外一块专属的坐标（VOID_OX 以东，和秘境的办法一样），
//      界内那一套战斗——法术、法宝、锁定、高度、阵法、元婴——照常跑；背景仍是虚空那边实时画的星渊与诸界，垫在底下；
//   3. 打完（对手全灭）、或者自己飞开足够远（甩开），就交还：镜头拉回巡航的远近，人回到虚空里接着飞。
// 全程没有过场、没有弹窗、没有闪白；激战中也随时能飞开。
//
// 坐标：交手那一刻人在虚空里的位置是锚点（anchor），斗法场里的一点 (x, y) 对应虚空里的
//   anchor + ((x, y) - (VOID_OX, VOID_OY)) / VOID_SCALE —— 所以在斗法场里飞，虚空里的位置也跟着走，背景跟着流。
import type { Game } from './game';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { VOID_SCALE } from '../data/zhujie';
import { ALT } from './alt';
import { audio } from './audio';
import * as C from './cultivation';
import { hashU } from '../core/rng';

/** 斗法场的原点：远在所有地图、交界地带和秘境（140 万）之外 */
export const VOID_OX = 2600000, VOID_OY = 40000;

export const VOIDFIGHT = {
  /** 多近算撞上（虚空单位） */
  engage: 80,
  /** 交手时对手离人多远（界内单位）：换手那一刻对手在画面外，正朝这边扑来 */
  spawnMin: 1900, spawnMax: 2400,
  /** 离所有活着的对手都这么远就算甩开了（界内单位） */
  leave: 5200,
  /** 斗法时界内的镜头远近 */
  zoom: 0.5,
  /** 镜头拉近 / 拉远用多久（秒） */
  ease: 1.1,
  /** 斗法时人离「地面」多高（斗法场没有地面，这只是高度判定的基准） */
  alt: 120,
} as const;

/** 虚空里对手的来历：一头虚空兽（VoidLife 里的记录），或者一个追进虚空的追兵 */
export interface VoidFoeSrc {
  id: string; name: string; x: number; y: number; tier?: number;
  /** 追兵：直接用他在界内的那个敌人 */
  enemy?: Enemy;
  /** 交手结束后怎么处置这条记录：won＝被斩、fled＝被甩开、fell＝被一拳砸进了下界（E3，见 voidfall.ts） */
  onEnd?: (how: 'won' | 'fled' | 'fell', e: Enemy) => void;
}

/**
 * 收官 P9：交手那一刻「网格模型换立板」不硬切。时间轴按镜头拉近的进度 k（0..1，约 1.1 秒）走：
 *   0 → move：虚空里那头兽的网格模型从它原来的位置、大小、朝向，收拢到界内立板所在的位置、大小（size：网格的半翼展 ÷ 立板宽）、朝向（立板朝哪边），
 *             快到时边缘亮起；
 *   move → fade：两者重合（同一位置、同一朝向、同样大小）——立板淡入、网格同步淡出并再收拢一点（shrink），两者的显隐加起来始终是一整个；
 *   fade 之后只剩立板，到镜头到位时交给界内那一套。
 * 只用已有的画法（网格自己的边缘辉光、立板与网格的不透明度），不闪白、不黑屏、不停顿——玩家一直在操作。
 */
export const HANDOFF = { move: 0.45, fade: 0.62, size: 0.32, shrink: 0.75 } as const;
/** 收官返工：交接那一段单帧最多推进的秒数（慢帧也要一帧帧走完过渡：交叠那一段至少四五帧） */
export const HANDOFF_STEP = 0.04;
/**
 * 交接这一帧的样子：mesh 是网格模型（x / y 虚空坐标，r 同 VoidThing.r，a 朝向，flare 边缘亮起 0..1，liftK 往立板那一层靠的程度，fade 显几成）；
 * figAlpha 是立板显几成（和 mesh.fade 加起来是 1）
 */
export interface HandoffView { mesh: { x: number; y: number; r: number; a: number; flare: number; liftK: number; fade: number; seed: number } | null; figAlpha: number; x: number; y: number }
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 两个朝向之间按最短的方向插值 */
const lerpAngle = (a: number, b: number, t: number) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

/** 虚空兽的名字 → 敌人数据 */
const BEAST_DEF: Record<string, string> = { 噬灵鳐: 'xk_shilingyao', 虚空游鲲: 'xk_youkun', 裂界蠕龙: 'xk_liejie', 星骸蜃: 'xk_xinghaishen', 无相渊兽: 'xk_wuxiang' };
export const voidBeastDef = (name: string) => ENEMIES[BEAST_DEF[name] ?? 'xk_shilingyao'];

const smooth = (k: number) => k * k * (3 - 2 * k);
/** 会贴身近战的虚空兽：虚空游鲲（吞咬）、裂界蠕龙（缠甩）、无相渊兽（扑噬） */
const VOID_BRAWLERS = new Set(['xk_youkun', 'xk_liejie', 'xk_wuxiang']);

export class VoidFight {
  /** 正在交手（从撞上那一刻起，到交还为止） */
  on = false;
  /** 镜头已拉到斗法的远近、画面已换手到界内那一套 */
  handed = false;
  /** 镜头拉近的进度 0..1（拉远时往回走） */
  k = 0;
  /** 交还之后镜头还在往回拉 */
  private out = false;
  anchor = { x: 0, y: 0 };
  /** 交手前人在界内的位置（存档、身死时用） */
  back = { x: 0, y: 0, flying: true };
  /** from：收官 P9，交手那一刻这头兽在虚空里的网格模型的样子（位置、大小、朝向），交接从它开始；追兵本来就是立板，没有 */
  foes: { e: Enemy; src: VoidFoeSrc; from?: { x: number; y: number; r: number; a: number; seed: number } }[] = [];
  private stash: Enemy[] = [];
  private t = 0; private wonT = 0;
  constructor(private readonly game: Game) {}

  /** 镜头离斗法远近的成分（0＝巡航的远近，1＝斗法的远近）：交手时往上走，交还后往回走 */
  get camK(): number { return smooth(this.k); }
  /** 交手前后镜头的过渡还没完 */
  get easing(): boolean { return this.on || this.out; }

  /** 斗法场里的一点 → 虚空坐标 */
  toVoid(x: number, y: number) { return { x: this.anchor.x + (x - VOID_OX) / VOID_SCALE, y: this.anchor.y + (y - VOID_OY) / VOID_SCALE }; }
  /** 虚空坐标 → 斗法场里的一点 */
  toArena(x: number, y: number) { return { x: VOID_OX + (x - this.anchor.x) * VOID_SCALE, y: VOID_OY + (y - this.anchor.y) * VOID_SCALE }; }

  /** 撞上了：开始交手，或者（已在交手）把这一个也拉进来 */
  engage(src: VoidFoeSrc): void {
    const g = this.game, p = g.player, xk = g.xukong;
    if (this.foes.some((f) => f.src.id === src.id)) return;
    if (!this.on) {
      this.on = true; this.out = false; this.handed = false; this.t = 0; this.wonT = 0;
      this.anchor = { x: xk.x, y: xk.y };
      this.back = { x: p.x, y: p.y, flying: p.flying };
      // 界内的敌人先收起来（虚空里本来就停着，交还后放回去）；斗法场里从空的开始
      this.stash = g.combat.enemies.filter((e) => !e.dead && !this.isSrcEnemy(e, src));
      g.combat.enemies = []; g.combat.projs = []; g.combat.fields = []; g.combat.strikes = []; g.combat.lock = null;
      g.stand(); g.destination = null; g.gathering = null;
      if (g.dunkong.active) g.dunkong.reset();
      p.x = p.st.x = VOID_OX; p.y = p.st.y = VOID_OY; p.flying = true; p.sitting = false;
      p.z = p.zTarget = VOIDFIGHT.alt; p.st.lift = p.z; p.st.strands.clear(); p.st.springs.clear();
      g.cam.x = p.x; g.cam.y = p.y - p.z * 0.5;
      xk.vx = xk.vy = 0;
      audio.sfx('boom');
      g.toast(`${src.name}扑了上来——斗法！（飞开足够远便算甩脱）`, 'warn');
    }
    // 对手落在它在虚空里的方位上，离人两千多（换手时在画面外）
    const dx = src.x - this.anchor.x, dy = src.y - this.anchor.y, d = Math.hypot(dx, dy) || 1;
    const R = Math.max(VOIDFIGHT.spawnMin, Math.min(VOIDFIGHT.spawnMax, d * VOID_SCALE)) * (this.foes.length ? 1.15 : 1);
    const x = VOID_OX + dx / d * R + (this.game.player.x - VOID_OX), y = VOID_OY + dy / d * R + (this.game.player.y - VOID_OY);
    let e = src.enemy;
    if (e) { e.x = e.hx = x; e.y = e.hy = y; e.lpx = e.lpy = NaN; e.mvx = e.mvy = 0; e.vx = e.vy = 0; e.flee = false; e.gone = false; }
    else {
      const tier = src.tier ?? 4, def = voidBeastDef(src.name);
      e = new Enemy(def, x, y, Math.min(5, tier), tier >= 6 ? 2 : tier === 5 ? 0 : Math.floor(Math.random() * 3));
      e.name = src.name; e.boss = true;
      // 收官 P9：体形最大的三种虚空兽会贴身撕咬、叼住一甩（近战 AI，见 brawlfoe.ts）——罡气被它打空时，叼住一甩能把你甩下界去（见 voidfall.ts）
      if (VOID_BRAWLERS.has(def.id)) g.combat.brawl.markBrawler(e);
    }
    e.aggro = true; e.tgP = true; e.hunt = true; e.flyH = Math.max(e.flyH, VOIDFIGHT.alt * 0.6);
    g.combat.enemies.push(e);
    // 收官 P9：虚空兽是从网格模型交接过来的——记下它这一刻的样子；立板先朝着人（交接时网格转到同一个朝向）
    const t = src as Partial<{ kind: string; r: number; a: number; seed: number }>;
    const from = t.kind === 'beast' && t.r !== undefined ? { x: src.x, y: src.y, r: t.r, a: t.a ?? 0, seed: t.seed ?? 0 } : undefined;
    if (from) e.facing = this.game.player.x >= e.x ? 1 : -1;
    this.foes.push({ e, src, from });
  }

  /**
   * 收官 P9：交手那一刻网格换立板的这一帧（见 HANDOFF）。figW：立板这一帧在虚空里画多宽（虚空单位）；yaw：镜头朝向（立板朝右＝画面右方）。
   * 不是从网格交接过来的（追兵）、或已经换手到界内那一套：只给立板（figAlpha 1）。
   */
  handoff(f: VoidFight['foes'][number], figW: number, yaw: number, bodyW = 0, bodyH = 0): HandoffView {
    const q = this.toVoid(f.e.x, f.e.y), H = HANDOFF, k = this.k;
    if (!f.from || this.handed || !this.on) return { mesh: null, figAlpha: 1, x: q.x, y: q.y };
    const s = f.from, u = smooth(clamp01(k / H.move));
    // VoidThings 按 r × 2 缩放网格；网格身长 1.75 → 屏幕上的身长 = 3.5 × r。
    // 第五轮返工：原来按立板画布宽的固定比例收拢，画布里妖兽实际画出来的身子大小各种兽不一样（噬灵鳐只占画布三成），
    // 交手那一刻一大团发光的网格悬在一条小鱼头上——现在按立板上实际画出来的身子宽（bodyW，render 量的）收拢到同样长
    // 翼展（3.56 × r）在斜俯视下压扁约一半，也不能比身子高出太多（细长的裂界蠕龙）：两头取小
    const toR = bodyW > 0 ? Math.min(bodyW / 3.5, bodyH > 0 ? bodyH / 1.8 : Infinity) : figW * H.size / 2;
    const toA = yaw + ((f.e.facing || 1) > 0 ? 0 : Math.PI);
    const figAlpha = smooth(clamp01((k - H.move) / (H.fade - H.move)));
    const r = (s.r + (toR - s.r) * u) * (1 - (1 - H.shrink) * figAlpha);   // 交叠时再收拢一点
    const mesh = k >= H.fade ? null : {
      x: s.x + (q.x - s.x) * u, y: s.y + (q.y - s.y) * u, r, a: lerpAngle(s.a, toA, u),
      flare: smooth(clamp01((k - H.move * 0.6) / (H.move * 0.4))), liftK: u, fade: 1 - figAlpha, seed: s.seed,
    };
    return { mesh, figAlpha, x: q.x, y: q.y };
  }
  private isSrcEnemy(e: Enemy, src: VoidFoeSrc) { return !!src.enemy && e === src.enemy; }

  /** 每帧（Xukong.update 在交手时调）：镜头的进度、虚空里的位置跟着人走、判胜负和甩脱 */
  update(dt: number): void {
    const g = this.game, p = g.player, xk = g.xukong;
    if (!this.on) {
      if (this.out) { this.k = Math.max(0, this.k - dt / VOIDFIGHT.ease); if (this.k <= 0) this.out = false; }
      return;
    }
    this.t += dt;
    // E3：有人被砸下界（或你被砸下去）：镜头拉回巡航的远近、画面换回虚空，斗法场里不判胜负也不判甩脱（见 voidfall.ts）
    if (xk.fall.live) { this.k = Math.max(0, this.k - dt / VOIDFIGHT.ease); this.handed = false; return; }
    // 收官返工：网格换立板那一段（k < HANDOFF.fade）单帧最多按 HANDOFF_STEP 秒推进——交手那一刻常是慢帧（主循环一帧最多给 0.1 秒），
    // 两者交叠那一段（约 0.19 秒）原来一两帧就过去了；封顶后慢帧也一帧帧走完整个过渡（帧率正常时 dt 本来就小于封顶，不受影响）
    this.k = Math.min(1, this.k + (this.k < HANDOFF.fade ? Math.min(dt, HANDOFF_STEP) : dt) / VOIDFIGHT.ease);
    if (this.handed) this.specials(dt);   // 收官 B4 返工（P9）：噬灵鳐、星骸蜃的专属招式
    if (!this.handed && this.k >= 1) {
      this.handed = true;
      g.cam.zoom = g.cam.targetZoom = VOIDFIGHT.zoom;
      g.cam.x = p.x; g.cam.y = p.y - p.st.lift * 0.5;
      g.renderer?.resetStill();
      g.updateUI(true);
    }
    // 人在斗法场里飞，虚空里的位置跟着走
    const v = this.toVoid(p.x, p.y); xk.x = v.x; xk.y = v.y; xk.vx = xk.vy = 0;
    if (!p.flying) p.flying = true;
    if (g.hero.dead) return;
    const alive = this.foes.filter((f) => !f.e.dead);
    // 对手全灭：留一息让掉落和妖丹落下，再把斗法场里没拾的东西一并收起、交还
    if (!alive.length) { this.wonT += dt; if (this.wonT > 1.6) this.finish('won'); return; }
    this.wonT = 0;
    // 甩脱：离所有活着的对手都够远（遁空、催动遁光都算）
    // 虚空里的对手不认「家」：一直咬着人（界内的敌人离家太远、离人太远就会放弃，这里不让它放弃；敛息、遁术照样能甩开它）
    const hidden = (g.combat.buffs.until.stealth ?? 0) > g.time;
    let near = Infinity;
    for (const f of alive) {
      const d = Math.hypot(f.e.x - p.x, f.e.y - p.y); near = Math.min(near, d);
      f.e.hx = p.x; f.e.hy = p.y;
      if (!f.e.aggro && !f.e.flee && !hidden && d < VOIDFIGHT.leave * 0.8) { f.e.aggro = true; f.e.tgP = true; }
    }
    if (near > VOIDFIGHT.leave && this.t > 1.5) this.finish('fled');
  }

  /** 交还：人回到虚空里接着飞；对手按结局处置 */
  /** 在虚空斗法里倒下的时刻（倒下后的剧情文字据此改成虚空里的说法，见 renxin.ts） */
  downAt = -99;
  finish(how: 'won' | 'fled' | 'down' | 'force' | 'fall'): void {
    if (!this.on) return;
    if (how === 'down') this.downAt = this.game.time;
    const g = this.game, p = g.player, h = g.hero, xk = g.xukong;
    const v = this.toVoid(p.x, p.y);
    this.on = false; this.handed = false; this.out = how !== 'down' && how !== 'fall';
    if (how === 'down' || how === 'fall') this.k = 0;   // 坠界：镜头早已拉回巡航的远近
    for (const f of this.foes) {
      if (f.e.dead) f.src.onEnd?.('won', f.e);
      else {
        // 没打完的对手回到虚空里它所在的方位
        const q = this.toVoid(f.e.x, f.e.y); f.src.x = q.x; f.src.y = q.y;
        f.src.onEnd?.('fled', f.e);
      }
    }
    // 斗法场里还躺着的掉落：收进储物袋（人一走，那块坐标就没人去了）
    const left = g.combat.loot.filter((l) => l.x > VOID_OX - 200000);
    g.combat.loot = g.combat.loot.filter((l) => !(l.x > VOID_OX - 200000));
    if (how !== 'down') for (const l of left) C.addItem(h, l.id, l.n);
    const won = this.foes.filter((f) => f.e.dead), names = [...new Set(won.map((f) => f.src.name))];
    this.foes = [];
    g.combat.enemies = this.stash; this.stash = [];
    g.combat.projs = []; g.combat.fields = []; g.combat.strikes = []; g.combat.lock = null;
    // 人回到界内的老位置（虚空里时人本来就挂在出界的那一点上），虚空里的位置接着斗法场里飞到的地方
    p.x = p.st.x = this.back.x; p.y = p.st.y = this.back.y; p.flying = true; p.st.strands.clear(); p.st.springs.clear();
    p.z = p.zTarget = ALT.max;
    if (how !== 'fall') { xk.x = v.x; xk.y = v.y; xk.vx = xk.vy = 0; }   // 坠界：虚空里的位置一直由 xukong 的飞行推着，不再按斗法场换算
    g.renderer?.resetStill();
    if (how === 'won') {
      // 收官 B4 返工（P9）：倒下时的话按对手换——每种虚空兽一句，人（元婴追兵）是元婴遁入乱流
      const END: Record<string, string> = { 噬灵鳐: '噬灵鳐翼骨寸断，吸进去的灵光一缕缕散回星海。', 虚空游鲲: '游鲲庞大的身躯缓缓翻了过去，沉进无底的虚空。', 裂界蠕龙: '裂界蠕龙的身节一节节崩开，它撕开的界缝也跟着合拢了。', 星骸蜃: '星骸蜃一散，四周的星骸幻影一盏盏熄灭。', 无相渊兽: '无相渊兽没有形体的身子塌成一团黑雾，被虚空罡风吹散了。' };
      const lines = names.map((n) => END[n] ?? `${n}的肉身在罡风里碎去，一点元婴遁光没入乱流，再也追不上来了。`);
      g.toast(`斩了${names.join('、')}。${lines.join('')}四下又只剩无声的星海。`, 'good');
      if (names.length) g.news(`有人在虚空里斩了${names.join('、')}。`, 'canon');
      const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * 0.06 * won.length, msgs);
      audio.sfx('chime');
    } else if (how === 'fled') {
      g.toast('甩开了——身后的气机渐渐远了。', 'info');
      audio.sfx('whoosh');
    }
    g.updateUI(true);
  }

  /** 读档、新开局、身死时归零（不处置对手） */
  /** E3：把这个对手从斗法里拿出来（被砸下界 / 砸你下界后追下去），返回它的来历 */
  release(e: Enemy): VoidFoeSrc | null {
    const i = this.foes.findIndex((f) => f.e === e); if (i < 0) return null;
    const src = this.foes[i].src; this.foes.splice(i, 1); return src;
  }
  /** E3：斗法场里只剩坠落这一件事：画面换回虚空，镜头往回拉（斗法本身不收场） */
  toFall(): void { this.handed = false; this.game.renderer?.resetStill(); this.game.updateUI(true); }
  /** E3：被打落途中脱困：对手追到身边，接着斗（镜头再拉近） */
  resume(e: Enemy, src: VoidFoeSrc | null): void {
    const g = this.game, p = g.player;
    e.x = e.hx = p.x + 560; e.y = e.hy = p.y - 120; e.lpx = e.lpy = NaN; e.kx = e.ky = 0; e.aggro = true; e.tgP = true; e.hunt = true; e.flyH = Math.max(e.flyH, VOIDFIGHT.alt * 0.6); e.lift = 0;
    if (!g.combat.enemies.includes(e)) g.combat.enemies.push(e);
    this.foes.push({ e, src: src ?? { id: 'fall-' + e.name, name: e.name, x: g.xukong.x, y: g.xukong.y, enemy: e } });
    this.t = 0;
  }
  /**
   * 收官 B4 返工（P9 遗留）：另外两种虚空兽的专属招式（游鲲、蠕龙、渊兽的贴身撕咬见 brawlfoe.ts）。
   *   · 噬灵鳐「噬灵」：身边亮起一圈青紫的吸灵光环，一息半后收拢——那时还在圈里（九百以内）就被吸走一成二法力，它回一成气血。
   *     应对：看见光环往外拉开距离，或者趁它蓄势打断（蓄势时挨一下重的会散掉）。
   *   · 星骸蜃「星骸雨」：在你身边按落点撒下四五团星骸，先在地上亮一息二的圈，圈到时落下（一团扣一成半气血）。应对：走出圈。
   * 节奏和落点都按「斗法开始后的时刻 + 这只兽」取哈希，不取 Math.random；伤害走 hitPlayer。
   */
  private sp = new WeakMap<Enemy, { cd: number; wind: number; marks: { x: number; y: number; t: number }[]; hp0: number }>();
  private specials(dt: number) {
    const g = this.game, p = g.player, c = g.combat;
    for (const f of this.foes) {
      const e = f.e, id = e.def.id;
      if (e.dead || (id !== 'xk_shilingyao' && id !== 'xk_xinghaishen')) continue;
      let s = this.sp.get(e); if (!s) { s = { cd: 4 + 2 * hashU((e.id * 1e9) | 0, 1, 0x91), wind: 0, marks: [], hp0: e.hp }; this.sp.set(e, s); }
      const n = Math.floor(this.t * 10);
      if (id === 'xk_shilingyao') {
        if (s.wind > 0) {
          s.wind -= dt;
          if (s.hp0 - e.hp > e.maxHp * 0.08) { s.wind = 0; s.cd = 6; g.toast('一击打散了噬灵鳐的吸灵光环！', 'good'); continue; }   // 蓄势时挨了重的：被打断
          if (s.wind <= 0) {
            if (Math.hypot(p.x - e.x, p.y - e.y) < 900 && g.hero.mp > 0) { const take = Math.min(g.hero.mp, 0.12); g.hero.mp -= take; e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.1); g.toast('吸灵光环一收——一成多法力被噬灵鳐吸了过去！', 'warn'); audio.sfx('whoosh'); }
            s.cd = 7 + 3 * hashU((e.id * 1e9) | 0, n, 0x92);
          }
        } else if ((s.cd -= dt) <= 0) {
          s.wind = 1.5; s.hp0 = e.hp;
          c.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 900, t: 0, dur: 1.5, color: '170,120,255' } as never);
          c.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 600, t: 0, dur: 1.2, color: '200,160,255' } as never);
          audio.sfx('chime');
        }
      } else {
        // 星骸雨：落点按时刻取哈希
        for (const m of s.marks) {
          m.t -= dt;
          if (m.t <= 0) {
            if (Math.hypot(p.x - m.x, p.y - m.y) < 190) { const ps = (c as unknown as { pStats: { hp: number; def: number } }).pStats; c.hitPlayer(0.15 * ps.hp / 0.95 + ps.def * 0.8, e.realm, undefined, m.x, m.y, e); }
            c.vfx.push({ kind: 'ring', x: m.x, y: m.y, r: 260, t: 0, dur: 0.4, color: '255,230,170' } as never);
          }
        }
        if (s.marks.length && s.marks.every((m) => m.t <= 0)) { s.marks = []; audio.sfx('boom'); }
        if (!s.marks.length && (s.cd -= dt) <= 0) {
          const k = 4 + Math.floor(2 * hashU((e.id * 1e9) | 0, n, 0x93));
          for (let i = 0; i < k; i++) { const a = hashU((e.id * 1e9) | 0, n + i, 0x94) * Math.PI * 2, r = i === 0 ? 40 : 160 + 380 * hashU((e.id * 1e9) | 0, n + i, 0x95); const m = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, t: 1.2 + 0.15 * i }; s.marks.push(m); c.vfx.push({ kind: 'ring', x: m.x, y: m.y, r: 190, t: 0, dur: m.t, color: '255,210,140' } as never); }
          s.cd = 6 + 3 * hashU((e.id * 1e9) | 0, n, 0x96);
          g.toast('星骸蜃抖落一片星骸——地上亮圈的地方要砸下来了！', 'warn');
        }
      }
    }
  }
  reset(): void { this.on = false; this.handed = false; this.out = false; this.k = 0; this.foes = []; this.stash = []; }
}
