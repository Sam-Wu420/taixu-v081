// 虚空：从地面一路升上去，飞出一界的天穹，在诸界之间飞行，再一路降进另一界——全程由玩家自己操作，不切画面、不闪光。
//
// 只有一个量在变：离地高度 h（界内单位），按住上升 / 下降键改它，松手就悬停。镜头离人的远近与 h 成正比，
// 所以越升越高、大地连续地变小：
//   地面 … 高空的顶（420）            照常的界内飞行；
//   420 … 换手高度（一两千）          仍是界内的画面，镜头随高度拉远，云气渐浓（climb）；
//   换手高度 … 界壁 … 巡航的高度      画面换成「从外面看这一界」的立体模型（void）。换手发生在云层里：
//                                     两边画的是同一片地面（近地面有现画的细节图垫着），镜头的摆法也一样；
//   巡航的高度                         各界的穹顶都在脚下，人在一张平面上飞；镜头已拉到能看见整块浮陆。
// 降：飞到一界的正上方按住下降，原路降回去——到云层时人已落到那一界的地图上（必要时在游戏里换图），
//     界内的画面在底下备好后换手（dive），再降到高空的顶，就是寻常的飞行了。
// 遁速随高度变：贴地时就是界内的遁速，到巡航高度是它的一百倍（以界内单位计），所以画面上看起来一直是同样的快慢。
//
// 激战中、被追兵锁着也能走。元婴以下的追兵过不了界壁，出了界就跟丢了；元婴以上的会追出来，在虚空里追上了照样斗法。
// 虚空里被虚空兽（或追兵）贴近、或自己撞上去，就是即时斗法（见 voidfight.ts）：镜头拉近、换到界内那一套战斗，背景仍是虚空。
import type { Game } from './game';
import { ACTIVE_MAP, MAP_NAME, type MapId } from '../data/world';
import { HOME, VOID_SCALE, REALM_KIND_NAME, realmsNear, overRealm, realmDistance, realmOutline, voidLi, realmOfMap, pointToVoid, landing, type Realm } from '../data/zhujie';
import { ALT } from './alt';
import { audio } from './audio';

export const XUKONG = {
  /** 元婴方可肉身横渡虚空 */
  realm: 4,
  /** 在高空的顶上再按住上升多久才继续往上 */
  pushSeconds: 0.45,
  /** 升降的快慢：高度每秒变为原来的 e^rate 倍 */
  rate: 0.85,
  /** 界内的画面最远拉到这个缩放就换手 */
  zoomSwap: 0.2,
  /** 巡航高度的遁速是贴地时的多少倍（界内单位） */
  cruiseSpeed: 100,
  /** 滚轮：在随高度而定的镜头远近之上再乘一个倍数 */
  zoomUserMin: 0.2, zoomUserMax: 12,
  nearRadius: 60000,
} as const;
export type XukongPhase = 'none' | 'climb' | 'void' | 'dive';
const H0 = ALT.max;

import { VoidLife, VOIDLIFE } from './voidlife';
import { VoidFight, VOIDFIGHT } from './voidfight';
import { VoidFall } from './voidfall';
import { carryAcrossSeam } from './seamCarry';   // 收官 B4（P9 遗留）：同伴跟着降到别界

export class Xukong {
  phase: XukongPhase = 'none';
  /** 飞行平面那一层的东西：乱流、遗迹、虚空兽 */
  private _life?: VoidLife;
  get life(): VoidLife { return this._life ??= new VoidLife(this.game); }
  /** 虚空里的即时斗法 */
  private _fight?: VoidFight;
  get fight(): VoidFight { return this._fight ??= new VoidFight(this.game); }
  /** 收官 E3：虚空里一拳把人打进下界 / 被人打下去（见 voidfall.ts） */
  private _fall?: VoidFall;
  get fall(): VoidFall { return this._fall ??= new VoidFall(this.game); }
  /** 这一趟离开地面以来的秒数（画面里的流动用它） */
  clock = 0;
  /** 离地高度（界内单位）。climb / dive 时就是人物的 z；void 时除以 VOID_SCALE 是离大陆面的高度（虚空单位） */
  h: number = H0;
  /** 这一帧在升（1）、在降（-1）还是悬停（0） */
  dir: -1 | 0 | 1 = 0;
  /** 在虚空里的位置（虚空坐标）与速度 */
  x = 0; y = 0; vx = 0; vy = 0;
  /** 滚轮给的镜头倍数（越大越远） */
  zoomUser = 1; private zoomUserTarget = 1;
  /** 正下方的那一界；ref 是定「地面」用的那一界（离开它的上空后仍沿用，直到在巡航高度飞到另一界上空） */
  over: Realm | null = null; ref: Realm = HOME;
  /** 脚下的「地面」在飞行平面之下多深（虚空单位） */
  refDepth: number = HOME.depth;
  realms: Realm[] = [HOME];
  /** 穿过界壁那一下的涟漪 1 → 0，以及是往外穿（1）还是往里穿（-1） */
  ripple = 0; rippleDir: 1 | -1 = 1;
  /** 降回界内：人已落到界内的那张图上，正等地面备好（这时界内的画面在底下先画着） */
  warming = false;
  private warmT = 0;
  private push = 0; private scanT = 0; private hintT = 0; private hinted = false;
  /** 开始升空时界内的缩放、换手的高度 */
  private z0 = 0.5; hSwap: number = H0 * 2.5;
  /** r7 撼山客第三批（hsmoves3）：被一拳打上天 / 冲天追上去时，升降方向和快慢由那一拳接管；tick 每帧调（身在虚空、世界停住时也调） */
  force: { key: -1 | 0 | 1; k: number; tick?: (dt: number) => void } | null = null;

  constructor(private readonly game: Game) {}

  /** 身在界外、在飞（界内的世界停着不推进）。斗法时不算：那时界内那一套照常跑（人在斗法场里） */
  // E3：追着流星（或自己被砸下去）落进界内的那一小段（降到云层、等界内画面备好）也不算：界内已在跑，人是自己在飞
  get active() { return this.phase === 'void' && !this.fight.on && !(this.warming && this.fall.live); }
  /** 画面是「从外面看」的立体模型 */
  get inVoid() { return this.phase === 'void'; }
  /** 界内的那一段升降（高度和缩放由这里说了算） */
  get corridor() { return this.phase === 'climb' || this.phase === 'dive' || (this.phase === 'void' && this.warming && this.fall.live); }
  /** 界内画面该用的缩放（不归这里管时为 0） */
  get worldZoom(): number { return this.corridor || (this.phase === 'void' && this.warming) ? Math.max(XUKONG.zoomSwap, this.zoomAt(Math.min(this.h, this.hSwap))) : 0; }
  /** 高度 h 处、折算成界内缩放的镜头远近：与高度成反比 */
  zoomAt(h: number): number { return this.z0 * H0 / Math.max(H0, h); }
  /** 离大陆面多高（虚空单位），以及它占巡航高度的几成 0..1 */
  get alt(): number { return this.h / VOID_SCALE; }
  get lift(): number { return Math.max(0, Math.min(1, this.alt / this.refDepth)); }
  /** 云气的浓度 0..1：换手高度附近最浓，往上往下都渐淡 */
  get cloud(): number {
    if (this.phase === 'none') return 0;
    const k = this.h / this.hSwap;
    return k < 1 ? Math.max(0, Math.min(1, (k - 0.5) / 0.42)) : Math.max(0, Math.min(1, 1 - (k - 1.1) / 1.6));
  }
  /** 往上蓄势的进度 0..1 */
  get pushing(): number { return this.phase === 'none' ? Math.max(0, Math.min(1, this.push / XUKONG.pushSeconds)) : 0; }
  get viewRadius(): number { return Math.max(XUKONG.nearRadius, this.refDepth * 9 * this.zoomUser); }

  /** 现在为什么不能出界；能则返回 null */
  refusal(): string | null {
    const g = this.game;
    if (g.hero.realm < XUKONG.realm) return '天穹之上罡风如刀、再往上便是界壁——元婴之前，肉身渡不过去。';
    if (g.mijing?.active || g.inCave) return '此地自成一界，上不见天。';
    if (g.yuanying?.active) return '元婴离体时不可远离肉身。';
    if (g.nuoyi?.active) return '虚空挪移之中。';
    return null;
  }

  /** 在高空的顶上还按着上升：攒够时间就继续往上。由 Game 的升降逻辑每帧调用 */
  pushSky(held: boolean, dt: number): void {
    if (this.phase !== 'none') return;
    if (!held) { this.push = this.push > 0 ? Math.max(0, this.push - dt * 2) : Math.min(0, this.push + dt); return; }
    if (this.push < 0) { this.push = Math.min(0, this.push + dt); return; }
    const no = this.push === 0 ? this.refusal() : null;
    if (no) { this.game.toast(no, 'info'); this.push = -4; return; }
    this.push += dt;
    this.prepare();
    if (this.push >= XUKONG.pushSeconds) this.leave();
  }

  /** 开始往天外升（不经过蓄势；试玩入口和测试直接调） */
  leave(): boolean {
    if (this.phase !== 'none') return false;
    const g = this.game, p = g.player;
    const no = this.refusal();
    if (no) { g.toast(no, 'warn'); this.push = -4; return false; }
    g.stand(); g.gathering = null;
    if (!p.flying) p.flying = true;
    this.phase = 'climb'; this.dir = 1; this.clock = 0; this.push = 0; this.warming = false; this.ripple = 0;
    this.h = Math.max(H0, p.z); this.setBase(g.cam.zoom);
    this.zoomUser = this.zoomUserTarget = 1;
    this.ref = this.over = realmOfMap(ACTIVE_MAP); this.refDepth = this.ref.depth; this.realms = [this.ref];
    if (!this.hinted) g.toast('再往上便出了这方天地——按住上升继续，松手悬停，按住下降原路回去。', 'info');
    audio.sfx('whoosh');
    g.updateUI(true);
    return true;
  }
  private setBase(zoom: number) { this.z0 = Math.max(XUKONG.zoomSwap * 1.15, Math.min(1.2, zoom)); this.hSwap = H0 * this.z0 / XUKONG.zoomSwap; }

  zoomBy(f: number) { this.zoomUserTarget = Math.max(XUKONG.zoomUserMin, Math.min(XUKONG.zoomUserMax, this.zoomUserTarget / f)); }

  /** 画面那边把近地面的细节备好了没有（没有画面时一律算好了）。to 是要落到的图和位置 */
  private prepare(to?: { map: MapId; x: number; y: number }): boolean {
    const g = this.game, r = g.renderer as { xukongPrepare?: (map: MapId, x: number, y: number) => boolean } | undefined;
    if (!r?.xukongPrepare) return true;
    return to ? r.xukongPrepare(to.map, to.x, to.y) : r.xukongPrepare(ACTIVE_MAP, g.player.x, g.player.y);
  }

  private keyDir(): -1 | 0 | 1 {
    const g = this.game, k = g.input.keys;
    return ((k.has('ascend') || g.input.climb > 0 ? 1 : 0) - (k.has('descend') || g.input.climb < 0 ? 1 : 0)) as -1 | 0 | 1;
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.05);
    if (this.ripple > 0) this.ripple = Math.max(0, this.ripple - dt / 1.3);
    const V = this.fall;
    V.tick(dt);
    this.force?.tick?.(dt);
    if (this.phase === 'none') return;
    // E3：俯冲追击 / 被打落时，升降的方向和快慢由 voidfall 定（按住上升照样能作罢）
    const Fz = this.force, key0 = Fz ? Fz.key : this.keyDir(), key = this.dir = V.live ? V.steer(key0) : key0;
    const g = this.game, rate = Math.exp(XUKONG.rate * (V.live ? V.rateK(key) : Fz ? Fz.k : 1) * dt);
    this.clock += dt;
    this.zoomUser += (this.zoomUserTarget - this.zoomUser) * Math.min(1, dt * 7);
    if (this.phase === 'climb' || this.phase === 'dive') {
      // 界内的那一段：人照常由 Game 推着飞，这里只管高度（Game 据此定人物的 z 和镜头的缩放）
      const ready = this.prepare();
      if (key > 0) this.h *= rate; else if (key < 0) this.h /= rate;
      if (this.h <= H0) { this.h = H0; this.finish(); return; }
      if (this.h >= this.hSwap) {
        this.h = this.hSwap;
        if (key > 0 && ready) this.toVoid();   // 细节图还没画好就在云里稍等
      }
      return;
    }
    // —— 界外
    const F = this.fight;
    F.update(dt);
    if (F.on && !V.live) {
      // 斗法中：人由界内那一套推着飞，这里只让虚空里别的东西照常游动（又一头撞上来就一并拉进斗法）
      this.life.update(dt, this.x, this.y, 0, 0, this.speed, this.realms, true);
      this.scanT -= dt; if (this.scanT <= 0) this.scan();
      return;
    }
    this.fly(dt);
    // 飞行平面那一层的东西（乱流、遗迹、虚空兽）：升到那一层才碰得着
    this.life.update(dt, this.x, this.y, this.vx, this.vy, this.speed, this.realms, this.lift > 0.97 && !V.live);
    const top = this.refDepth * VOID_SCALE, o = this.over, to = o ? landing(o, this.x, this.y) : null;
    // 能降到多低：能进的界一直降到换手高度；进不去的降到它的穹顶上方；脚下没有界就降不下去
    const floor = to ? this.hSwap : o ? Math.min(top, (this.domeAt(o, this.x, this.y) + 260) * VOID_SCALE) : top;
    if (key < 0 && !to && this.h <= floor * 1.001) this.say(o ? `${o.name}的界壁凝实如铁，眼下还寻不到入界的门径。` : '脚下是无底的虚空——飞到一界的正上方再下降。');
    const before = this.alt;
    if (key > 0) this.h = Math.min(top, this.h * rate);
    else if (key < 0) this.h = Math.max(Math.min(floor, this.h), this.h / rate);
    if (this.h > top) this.h = top;
    // 穿过界壁的那一下
    const dome = this.domeAt(this.ref, this.x, this.y), now = this.alt;
    if (dome > 0 && (before - dome) * (now - dome) < 0) {
      this.ripple = 1; this.rippleDir = now > before ? 1 : -1; audio.sfx('chime');
      if (now > before && !this.hinted) { this.hinted = true; g.toast('已出界壁。再往上便是巡航的高度；滚轮可把镜头再拉远。飞到一界的正上方，按住下降便可进去。', 'info'); }
    }
    if (to && key < 0 && this.lift < 0.3 && !this.warming) this.prepare(to);   // 还在半空就先备着脚下的细节
    // 降进界内：进了云层就先把人落到那一界的图上，界内的画面在底下备着；备好了、也降到了换手高度，就交还给界内
    if (to && this.h <= this.hSwap * 1.7) {
      if (!this.warming && key < 0) { if (this.prepare(to)) this.arrive(to); else this.h = Math.max(this.h, this.hSwap * 1.7); }
    } else if (this.warming) this.warming = false;   // 又升回去了
    if (this.warming) {
      this.warmT += dt;
      if (this.h <= this.hSwap * 1.001 && key < 0 && (this.warmT > 5 || (this.warmT > (V.live ? 0.08 : 0.3) && !g.renderer?.streaming))) { this.phase = 'dive'; this.warming = false; this.h = this.hSwap; V.onDive(); g.updateUI(true); }
    }
  }

  /** 界内 → 界外：画面换手。此后界内的世界停住，追兵跟丢 */
  private toVoid() {
    const g = this.game, p = g.player;
    const v = pointToVoid(ACTIVE_MAP, p.x, p.y);
    this.x = v.x; this.y = v.y; this.vx = this.vy = 0; this.phase = 'void'; this.warming = false;
    // 收官 B4（P9 遗留）：同伴、灵宠不画进虚空（虚空场景只画你和虚空里的东西）——明说他们在界壁下等，降到哪一界就跟到哪一界
    if (g.npcs.followers().length || g.pets?.ent) g.hint('void-party', '同行的人和灵宠扛不住虚空罡风，留在界壁下等你——你降到哪一界，他们就跟到哪一界的落点；原路降回来也在。');
    this.ref = this.over = realmOfMap(ACTIVE_MAP); this.refDepth = this.ref.depth; this.scan();
    g.destination = null; g.combat.lock = null; p.boosting = false;
    if (g.dunkong.active) g.dunkong.reset();
    const P = g.pursuit?.cur;
    if (P && !P.lost && !P.e.dead) {
      if (P.e.realm >= XUKONG.realm) {
        // 元婴以上的追兵跟着破界追出来：在虚空里落在身后，照样追
        this.life.chase(P.e, P.name, this.x, this.y);
        g.toast(`${P.name}紧跟着破开界壁追了出来！`, 'warn');
      } else { P.lost = true; P.searching = true; g.toast(`${P.name}眼睁睁看着你没入云天之外，气机就此断了。`, 'info'); }
    }
    for (const e of g.combat.enemies) if (!e.dead) e.aggro = false;
    g.updateUI(true);
  }

  /** 界外 → 界内的前一半：人落到正下方那张图的那个位置（必要时在游戏里换图），画面仍是界外的，等地面备好 */
  private arrive(to: { map: MapId; x: number; y: number }) {
    this.fall.beforeArrive();   // E3：坠界的那场斗法到此收场（人回到界内），对手由 voidfall 放回界内
    this.life.loseChaser();   // 降回某一界：追出来的追兵就此跟丢
    const g = this.game, keep = { h: this.h, x: this.x, y: this.y, z0: this.z0, hSwap: this.hSwap, clock: this.clock, zu: this.zoomUser, realms: this.realms, ref: this.ref, hinted: this.hinted };
    g.dunkong.reset();
    let carried: string[] = [];
    if (to.map !== ACTIVE_MAP) {
      g.travel.pending = { map: to.map, x: to.x, y: to.y, via: 'portal' };
      // E3：换图要读档，读档会把坠界的这一趟、追杀、近战架势都清掉——先记下，换完接回来
      const fall = this.fall.snapshot(), chase = g.pursuit?.cur, stance = g.combat.brawl.stance;
      // 收官 B4（P9 遗留）：同行的人、灵宠跟着降过去——换图前把他们的所在地图、位置挪到落点身边（换图要先存档再读档，存档里就是新图的人了）；
      // 记下他们原来在哪，不再同行时由 seamCarry.returnCarried 送回原处。原先出界再降到别界，同伴就被留在了出界的地方
      // 读档时同行的人会按存档里原来的图被放回去（别界的图不在三图名单里），所以换图后再叫一遍（见下面 teleport 之后）
      { const p0 = g.player; carried = g.npcs.followers().map((a) => a.d.id); carryAcrossSeam(g, to.map, to.x - p0.x, to.y - p0.y, () => {}); }
      const ok = g.switchMap(to.map);
      if (ok && fall.mode !== 'none') { this.fall.restore(fall); if (chase && !g.pursuit.cur && fall.drop?.e === chase.e) g.pursuit.cur = chase; if (stance && !g.combat.brawl.stance) g.combat.brawl.toggleStance(); }
      g.travel.pending = null;
      if (!ok) return;   // 退回了「重新载入页面」的老办法：存档里已是新位置
      // 换图时读了一次档，读档把这里归零了：接回来
      this.phase = 'void'; this.h = keep.h; this.x = keep.x; this.y = keep.y; this.z0 = keep.z0; this.hSwap = keep.hSwap; this.clock = keep.clock; this.zoomUser = this.zoomUserTarget = keep.zu;
      this.realms = keep.realms; this.ref = this.over = keep.ref; this.refDepth = keep.ref.depth; this.hinted = keep.hinted;
    }
    const p = g.player;
    g.teleport(to.x, to.y);
    for (const id of carried) { const d = g.npcs.byId.get(id) as { alive?: boolean } | undefined; if (d?.alive !== false) g.npcs.summon(id); }   // 收官 B4（P9 遗留）：同伴跟到落点身边
    p.flying = true; p.sitting = false; p.z = p.zTarget = Math.min(this.h, this.hSwap); p.st.lift = p.z; p.st.setAction('fly');
    g.cam.y = p.y - p.st.lift * 0.5;
    this.warming = true; this.warmT = 0;
  }

  /** 降回了高空的顶：交还给寻常的飞行 */
  private finish() {
    const g = this.game, p = g.player;
    this.phase = 'none'; this.dir = 0; this.push = -0.6;
    p.z = p.zTarget = H0;
    this.fall.onCorridorEnd();   // E3：被打落的接着砸到地上 / 海里；追下来的交还寻常飞行
    g.updateUI(true);
  }

  /** 界外的飞行：方向键 / 摇杆定方向（按镜头的朝向）；遁空梭照常能用。遁速随高度变 */
  private fly(dt: number) {
    const g = this.game, p = g.player, k = g.input.keys, dk = g.dunkong;
    let mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + g.input.joy.x;
    let my = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0) + g.input.joy.y;
    if (g.camYaw && (mx || my)) { const c = Math.cos(g.camYaw), s = Math.sin(g.camYaw); const wx = mx * c - my * s, wy = mx * s + my * c; mx = wx; my = wy; }
    if (this.warming) { mx = 0; my = 0; }
    // E3 一键追击：俯冲时没按方向就自动朝流星的落点飞（一拨方向键就听你的——随时能拐走）
    const aim = this.fall.aim();
    if (aim && !this.warming && Math.hypot(mx, my) < 0.05) { const dx = aim.x - this.x, dy = aim.y - this.y, d = Math.hypot(dx, dy); if (d > 0.5) { const k = Math.min(1, d / Math.max(1, this.speed * 0.25)); mx = dx / d * k; my = dy / d * k; } }
    dk.update(dt);
    if (dk.active) { dk.steer(mx, my, dt); if (dk.phase === 'charging') { mx = 0; my = 0; } else { mx = Math.cos(dk.heading); my = Math.sin(dk.heading); } }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const L = this.life, sp = this.speed * dk.speedMul * (1 - (1 - VOIDLIFE.stormSlow) * L.storm), moving = len > 0.05;
    const ease = Math.min(1, dt * (moving ? 6 : 2.4));
    this.vx += ((moving ? mx * sp : 0) - this.vx) * ease; this.vy += ((moving ? my * sp : 0) - this.vy) * ease;
    let nx = this.x + (this.vx + L.push.x) * dt, ny = this.y + (this.vy + L.push.y) * dt;
    // 还在界壁之内：撞不出穹顶
    const r = this.ref, a = this.alt;
    if (a < this.domeAt(r, this.x, this.y)) {
      const dx = nx - r.x, dy = ny - r.y, th = Math.atan2(dy / r.ry, dx / r.rx), lim = realmOutline(r, th) * 1.025 * Math.sqrt(Math.max(0.02, 1 - (a / r.dome) * (a / r.dome))) * 0.998;
      const q = Math.hypot(dx / r.rx, dy / r.ry);
      if (q > lim) { nx = r.x + dx * lim / q; ny = r.y + dy * lim / q; }
    }
    this.x = Math.max(-4e6, Math.min(4e6, nx)); this.y = Math.max(-4e6, Math.min(4e6, ny));
    p.moving = moving; p.boosting = false;
    if (moving) { g.travel.dir.x = mx; g.travel.dir.y = my; if (Math.abs(mx) > 0.15) p.facing = mx > 0 ? 1 : -1; p.st.faceToward(mx, my, false); }
    p.st.vx = mx * g.speed; p.st.vy = my * g.speed; p.st.speed = moving ? g.speed : 0; p.st.setAction('fly');
    this.scanT -= dt;
    if (this.scanT <= 0) this.scan();
    this.over = this.realms.find((q) => overRealm(q, this.x, this.y)) ?? null;
    // 在巡航高度飞到另一界上空：「地面」换成它的大陆面（人始终在飞行平面上）
    const top = this.h >= this.refDepth * VOID_SCALE * 0.999;
    if (top && this.over && this.over !== this.ref) this.ref = this.over;
    if (top) { this.refDepth += (this.ref.depth - this.refDepth) * Math.min(1, dt * 1.5); this.h = this.refDepth * VOID_SCALE; }
  }
  /** 被一股力道从 (fx, fy) 那边推开一段（被虚空兽抽飞、全力遁走） */
  knock(fx: number, fy: number, dist: number): void {
    let dx = this.x - fx, dy = this.y - fy; const d = Math.hypot(dx, dy);
    if (d < 1) { dx = 1; dy = 0; } else { dx /= d; dy /= d; }
    this.x += dx * dist; this.y += dy * dist; this.vx = dx * this.speed * 0.5; this.vy = dy * this.speed * 0.5;
  }
  /** 虚空里按了交互：探查身边的遗迹 */
  interact(): boolean { return this.phase === 'void' && !this.fight.on && this.lift > 0.97 && this.life.interact(this.x, this.y); }
  /** 界壁在这一点上方多高（虚空单位，从大陆面算起）：穹顶是半个椭球，正中最高、越靠边越低，出了轮廓为 0 */
  domeAt(r: Realm, x: number, y: number): number {
    const dx = (x - r.x) / r.rx, dy = (y - r.y) / r.ry, q = Math.hypot(dx, dy) / (realmOutline(r, Math.atan2(dy, dx)) * 1.025);
    return q >= 1 ? 0 : r.dome * Math.sqrt(1 - q * q);
  }
  /** 这个高度的遁速（虚空单位 / 秒）：贴地时是界内遁速的原样，到巡航高度是它的 cruiseSpeed 倍 */
  get speed(): number { return this.game.speed / VOID_SCALE * Math.pow(XUKONG.cruiseSpeed, this.lift); }
  private scan() { this.scanT = 0.25; const all = realmsNear(this.x, this.y, this.viewRadius); this.realms = all.length > 400 ? all.slice(0, 400) : all; if (!this.realms.includes(this.ref)) this.realms.push(this.ref); }
  private say(s: string) { if (this.hintT <= this.clock) { this.game.toast(s, 'info'); this.hintT = this.clock + 5; } }

  /**
   * 给画面的镜头与人物位置（虚空坐标 / 单位）。镜头的摆法与界内完全一样：
   * 盯着人脚下偏北半个高度的那块「地面」，离它的远近与高度成正比——所以换手的那一帧，两边看到的是同一个画面。
   */
  view(screenH: number, boost: number) {
    const alt = this.alt, zoom = this.zoomAt(this.h) / this.zoomUser, tan = Math.tan(15 * Math.PI / 180);
    let D = screenH / 2 / zoom / tan / VOID_SCALE / this.game.combat.brawl.kickF;   // 近战的「镜头猛推」（坠界那一拳）
    // 人物抬起的高度：近地面时和界内一样带立板的高度补偿，升高后回到真实比例
    const k = Math.max(0, Math.min(1, (this.lift - 0.02) / 0.25)), up = alt * (boost + (1 - boost) * k * k * (3 - 2 * k));
    const heroY = -this.refDepth + up;
    let ty = this.y - alt * 0.5, ground = -this.refDepth;
    // 交手：镜头拉到界内斗法的远近，盯着人脚下斗法高度的那一层（和换手后界内镜头的摆法一样）。
    // 「人比盯着的那一点高多少」按镜头远近的比例来过渡（巡航时是 alt / D，斗法时是斗法高度 / D）：远近按对数拉近的途中，人始终在画面上同一处附近
    const f = this.fight.camK;
    if (f > 0) {
      const g = this.game, zf = this.fight.handed ? g.cam.zoom : VOIDFIGHT.zoom, Df = screenH / 2 / zf / tan / VOID_SCALE, za = (this.fight.handed ? g.player.st.lift : VOIDFIGHT.alt) * boost / VOID_SCALE;
      const lean = this.fight.handed ? (g.cam.x - g.player.x) / VOID_SCALE : 0;
      const rc = (heroY - ground) / D, rf = za / Df;
      D = Math.exp(Math.log(D) + (Math.log(Df) - Math.log(D)) * f);
      const off = (rc + (rf - rc) * f) * D;
      return { tx: this.x + lean * f, ty: this.y - off * 0.5, ground: heroY - off, D, heroY, alt, pxPerUnit: screenH / (2 * D * tan) };
    }
    return { tx: this.x, ty, ground, D, heroY, alt, pxPerUnit: screenH / (2 * D * tan) };
  }

  /** 给界面看的：身在何处、最近的别界、能不能入界 */
  info(): { where: string; near: string; hint: string } | null {
    if (!this.inVoid || this.alt < this.ref.dome * 0.6) return null;
    const o = this.over;
    const other = this.realms.find((r) => r !== o);
    const where = o ? `${o.region ? o.region + '·' : ''}${o.name} 上空` : '虚空';
    const near = other ? `${other.region ? other.region + '·' : ''}${other.name}（${REALM_KIND_NAME[other.kind]}） ${voidLi(realmDistance(other, this.x, this.y))}` : '';
    const t = this.lift > 0.97 ? this.life.target(this.x, this.y) : null;
    const V = this.fall;
    const hint = V.mode === 'meteor' ? (V.plunge ? '俯冲追击中——按住上升作罢' : '按追击俯冲追下去') : V.mode === 'dropped' ? '正往下界坠落——按脱困' : this.fight.on ? '斗法中——飞开足够远便算甩脱' : t ? `${t.name}——按交互键探查` : this.life.storm > 0 ? '身在空间乱流' : o && landing(o, this.x, this.y) ? '按住下降入界' : o ? '界壁未开' : '';
    return { where, near, hint };
  }

  /** 读档、新开局、身死时归零 */
  /** E3：脚下那一块先备着（落进界内时换手不卡） */
  prewarm(to: { map: MapId; x: number; y: number }): void { this.prepare(to); }
  reset(): void { this.force = null; this.fight.reset(); this.fall.reset(); this.life.reset(); this.phase = 'none'; this.dir = 0; this.push = 0; this.ripple = 0; this.warming = false; this.vx = this.vy = 0; this.h = H0; }
}
void MAP_NAME;
