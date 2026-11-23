// 收官 B3：灵舟——用户定的「过海方式」。挂在 game.jueyu.boat（world/jueyu.ts 的构造里建），由 jueyu.tick 每帧驱动。
//
// 用户要的（2026-11-15）：
//   · 新法器「灵舟」，几个品阶（乌篷灵舟 / 破浪灵舟 / 玄龟宝船），越好越耐打、越省灵力。低阶的大城法器阁有卖，高阶的走海兽、遗迹首领、鬼市。
//   · 在水边 / 海面上祭出，人上船；船能载不会飞的人（炼气）入海。船上灵力流失降到四分之一（好船更少），能打坐回灵（核心区也回一点）；
//     移动是「驾船」：有惯性、有转向、随浪起伏、顺风快逆风慢；船上照常施法、近战；同伴、灵宠跟着上船。
//   · 耐久：触须缠船往下拖（要砍断）、飓风和巨浪打船、海兽撞船、空间裂缝扫到；归零船碎人落水（走已有的泅水）。
//     岸边 / 鲸背上修（耗材料），或收着慢慢自己回。飞着的人也能中途把船放出来歇脚（元婴横渡的正解：飞一段、歇一段、嗑丹药）。
//   · 存读档：人在船上存档、读档后还在船上；耐久随存档走（ws.flags.lz）。
//
// 怎么接（尽量不碰共享文件）：
//   · 人「站」在船上：每帧把人钉在甲板上（jueyu.tick 里，移动积分之后），立板抬到甲板高度（jueyu.sink 取正值）；
//     船是 jueyu 的落脚处（footholds）和载具（carriers），所以不会被当成落水、走动也不会被「前方是茫茫大海」拦下。
//   · 方向键不再推人，改推船（jueyu.speedMul 在船上返回 0，这里自己读键盘 / 摇杆 / 点地的去处）。
//   · 别的系统把人挪了（近战击飞、浪推、触须拽）：挪得慢就连船一起挪，被打飞了就「被撞下了船」——船停在原地，游回去或飞回去能再上。
//   · 伤害：人挨打时船的灵光护罩分担一部分（按品阶），同时扣耐久；天象和触须另算。全程不调 Math.random（画特效时粒子系统自己取的不算）。
import type { Game } from './game';
import * as C from './cultivation';
import { BOATS, type BoatSpec } from '../data/seabeasts';
import { itemDef } from '../data/items';
import { ACTIVE_MAP, mapFrame } from '../data/world';
import { hashU } from '../core/rng';
import { bindOf, keyLabel } from '../core/keymap';
import { audio } from './audio';
import { C as AT } from '../gl/atlas';
import type { FxSys, RGB } from '../gl/fx';
import type { GrabTarget, SeaView } from './seabeast';
import { seaImg } from '../gfx/seaImg';

interface LzFlags {
  /** 各灵舟的耐久（0–1）；没有记的就是满的 */
  hp: Record<string, number>;
  /** 上次按天回耐久时的日子 */
  day: number;
  /** 人在船上：哪条船、船在哪（大陆坐标）、船头朝向——读档后接着在船上 */
  ab?: { id: string; x: number; y: number; h: number } | null;
}

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const H = (a: number, b: number, s: number) => hashU(a | 0, b | 0, s | 0);
/** 第六轮返工：飓风打船（按船总耐久的比例）——雨带里每息、每个巨浪、每道落雷（再乘落雷的伤害比例） */
const STORM_RATE = 0.0068, STORM_WAVE = 0.0085, STORM_BOLT = 0.08;
/** 低于这个耐久祭不出来（破得四处漏水） */
export const BOAT_MIN_HP = 0.15;
/** 修补的材料：每样补几成（先用排在前面的） */
const REPAIR_MATS: [string, number][] = [['mat_hy_chenmu', 0.5], ['mat_hy_yuantie', 0.8], ['mat_sb_chuxu', 0.3], ['mat_xuantie', 0.25], ['mat_sb_guichi', 0.2]];

export class Lingzhou {
  /** 船在海上（不论人在不在船上） */
  on = false;
  /** 人在船上 */
  aboard = false;
  /** 哪条船（物品 id） */
  id = '';
  /** 船的位置（本图坐标）、速度、船头朝向（弧度，0 朝东） */
  x = 0; y = 0; vx = 0; vy = 0; head = Math.PI;
  /** 受击闪光、被触须往下拖的程度 0–1、随浪起伏的相位、转向的角速度（画面上侧倾用） */
  hitT = 0; sinkK = 0; bobT = 0; yawV = 0;
  /** 玄龟宝船随人沉进海渊（haiyuan 设） */
  under = false;
  /** 触须能缠的「船」这个目标（seabeast 的 GrabTarget） */
  readonly grab: GrabTarget;
  /** 界面（Compass.tsx 读） */
  hud = { show: false, name: '', hp: 1, aboard: false, act: '', held: false, warn: '', owned: false };
  private struggleT = 0; private held = false;
  private fdx = 0; private fdy = 0; private sync = true;
  private px = NaN; private py = NaN; private lastHp = -1; private waveT = 3; private wakeT = 0; private bumpT = 0;
  /** 船尾走过的点（画白浪尾迹）：x, y, 时刻 */
  private wake: { x: number; y: number; t: number }[] = [];
  private fxq: { k: 'deploy' | 'wreck' | 'wave' | 'bump' | 'recall'; x: number; y: number }[] = [];
  private hinted = false;

  constructor(readonly game: Game) {
    const g = game;
    this.grab = {
      kind: 'boat',
      pos: () => ({ x: this.x, y: this.y, z: 0 }),
      // 缠住船：船定住、慢慢往根上拽，一点点被拖下水（拖到底就船碎人落水）
      hold: (dt, rx, ry) => {
        this.held = true;
        this.vx *= Math.max(0, 1 - dt * 6); this.vy *= Math.max(0, 1 - dt * 6);
        const dx = rx - this.x, dy = ry - this.y, d = Math.hypot(dx, dy);
        if (d > 200) { this.x += dx / d * 50 * dt; this.y += dy / d * 50 * dt; }
        this.sinkK = Math.min(1, this.sinkK + dt * 0.09 * (this.spec?.dive ? 0.6 : 1));
        if (g.player.sitting) g.stand();
      },
      // 勒一下：按船的耐久折算（不按海魔的攻击力——那是按打人的量定的，拿来勒船三息就碎）。每息一勒，约十八点：
      // 乌篷灵舟八息、破浪灵舟十六息、玄龟宝船三十多息——破浪以上的船多半先被拖沉（往下拖要十一息左右），得赶紧砍
      hurt: (_raw, by) => { this.damage(18, '触须勒住船身', by.x, by.y); },
      // 挣扎：拼命划桨（方向键 / 摇杆）
      struggle: (dt) => {
        const k = g.input.keys, j = g.input.joy;
        const want = k.has('w') || k.has('a') || k.has('s') || k.has('d') || k.has('arrowup') || k.has('arrowdown') || k.has('arrowleft') || k.has('arrowright') || Math.hypot(j.x, j.y) > 0.3;
        if (want) this.struggleT += dt; return this.struggleT;
      },
      alive: () => this.on && this.aboard && !g.hero.dead,
    };
  }

  // ------------------------------------------------------------ 数据
  get spec(): BoatSpec | null { return BOATS[this.id] ?? null; }
  isBoat(id: string) { return !!BOATS[id]; }
  private get F(): LzFlags { const f = this.game.ws.flags as Record<string, unknown>; return ((f.lz as LzFlags | undefined) ??= { hp: {}, day: this.game.day }) as LzFlags; }
  hpOf(id: string) { return Math.max(0, Math.min(1, this.F.hp[id] ?? 1)); }
  private setHp(id: string, v: number) { this.F.hp[id] = Math.max(0, Math.min(1, v)); }
  /** 袋里有的灵舟，好的在前 */
  owned(): string[] { const h = this.game.hero; return Object.keys(BOATS).filter((id) => C.bagCount(h, id) > 0).sort((a, b) => itemDef(b).tier - itemDef(a).tier); }
  /** 能祭的最好那条 */
  best(): string | null { return this.owned().find((id) => this.hpOf(id) >= BOAT_MIN_HP) ?? null; }
  /** 船上灵力流失乘几（不在船上 1） */
  get drainK(): number { return this.aboard && this.spec ? this.spec.drainK : 1; }
  /** 甲板离水面多高（人立板抬多高），带一点随浪的起伏 */
  deckLift(): number {
    const s = this.spec; if (!s) return 0;
    const sw = this.game.jueyu.k.swell;
    return s.deck + Math.sin(this.bobT * 1.6) * (2 + 6 * sw) - this.sinkK * s.deck * 1.4;
  }
  /** 人站在甲板上的位置（本图坐标）：原画船头朝左，人站在船身中部偏后一点 */
  private deckPos(): [number, number] { const s = this.spec!, f = Math.cos(this.head) < 0 ? -1 : 1; return [this.x + s.deckX * -f * 0.6, this.y + 12]; }
  /** 停着的船上能不能落脚（jueyu.footholds 登记：飞回来按落地、或游到船边上） */
  standable(x: number, y: number): boolean {
    if (!this.on || this.under) return false;
    const s = this.spec; if (!s) return false;
    const L = s.H * 1.2;
    return Math.abs(x - this.x) < L * 0.5 && Math.abs(y - this.y - 6) < 70;
  }

  // ------------------------------------------------------------ 操作
  /** 灵舟键（可改键）、罗盘旁的「舟」按钮：在船上＝上岸 / 收舟；船停在旁边＝登船；否则祭出最好的那条 */
  toggle(): void {
    const g = this.game, p = g.player;
    if (this.aboard) { this.disembark(); return; }
    if (this.on && Math.hypot(this.x - p.x, this.y - p.y) < 260 && !p.flying) { this.board(); g.toast(`攀上了${this.spec?.name ?? '灵舟'}。`, 'info'); return; }
    const id = this.best();
    if (!id) { const o = this.owned(); g.toast(o.length ? `${itemDef(o[0]).name}破得四处漏水，祭不出来——上岸或到鲸背上「使用」它来修补。` : '储物袋里没有灵舟。大城的法器阁有卖乌篷灵舟。', 'warn'); return; }
    this.deploy(id);
  }
  /** 储物袋、快捷栏里「使用」一条灵舟（game.usePill 交过来）：在水边是祭出，在岸上且有破损是修补 */
  useItem(id: string): boolean {
    const g = this.game, p = g.player;
    if (this.aboard && this.id === id) { this.disembark(); return true; }
    if (this.aboard) { g.toast(`正乘着${this.spec?.name}，先上岸再换船。`, 'info'); return false; }
    const onLand = !p.flying && !g.jueyu.deep.active && (g.terrain.isLand(p.x, p.y) || g.jueyu.footholdAt(p.x, p.y));
    if (onLand && this.hpOf(id) < 0.999 && !this.waterNear(p.x, p.y, 140)) return this.repair(id);
    if (this.hpOf(id) < BOAT_MIN_HP) { g.toast(`${itemDef(id).name}破得四处漏水——到岸上或鲸背上「使用」它来修补。`, 'warn'); return false; }
    return this.deploy(id);
  }
  /** 祭出：在人脚下（或身边最近的水面）放下船，人上去 */
  deploy(id: string): boolean {
    const g = this.game, p = g.player, J = g.jueyu, s = BOATS[id];
    if (!s) return false;
    if (g.offWorld || g.inCave || g.xukong?.active || g.mijing?.active) { g.toast('此处无水可行舟。', 'info'); return false; }
    if (J.deep.active) { g.toast('人在水下，灵舟祭不出来——先浮上去。', 'warn'); return false; }
    { const no = J.boatRefusal(id); if (no) { g.toast(no, 'warn'); return false; } }   // 收官 B4：冰海行不得舟、熔岩只有宝船经得住
    if (C.bagCount(g.hero, id) <= 0) return false;
    const spot = this.waterNear(p.x, p.y, 520);
    if (!spot) { g.toast('附近没有能放船的水面——走到水边再祭。', 'warn'); return false; }
    if (this.on) this.recall(true);
    this.on = true; this.id = id; this.x = spot[0]; this.y = spot[1]; this.vx = this.vy = 0; this.sinkK = 0; this.hitT = 0; this.under = false;
    this.head = p.facing < 0 ? Math.PI : 0; this.wake.length = 0;
    this.board();
    this.fxq.push({ k: 'deploy', x: this.x, y: this.y }); audio.sfx('whoosh');
    const W = J.profile?.medium; g.toast(`祭出${s.name}${W && W.boatWord !== '灵舟' ? `（${W.name}上行的舟，人称${W.boatWord}）` : ''}，一步踏上船头。（方向键驾船；${keyLabel(bindOf('boat'))} 上岸 / 收舟；${keyLabel(bindOf('fly'))} 收舟起飞）`, 'good');
    if (!this.hinted) { this.hinted = true; g.hint('sea-boat', `灵舟：船上灵力流失只剩${Math.round(s.drainK * 100)}%，还能打坐回气（核心海域也回一点）。驾船有惯性，顺风快、逆风慢。被触须缠住要拼命划桨（方向键）或斩断触须；耐久见底船就碎了。`); }
    return true;
  }
  /** 人上船（船已经在水上） */
  board() {
    const g = this.game, p = g.player, J = g.jueyu;
    this.aboard = true; this.on = true;
    p.flying = false; p.boosting = false; p.z = p.zTarget = 0; J.swimming = false;
    if (g.dunkong?.active) g.dunkong.retract();
    const [x, y] = this.deckPos(); p.x = x; p.y = y; this.px = x; this.py = y;
    this.lastHp = g.hero.hp; this.struggleT = 0;
  }
  /** 收船（化作一道光收回袖中） */
  recall(silent = false) {
    if (!this.on) return;
    if (!silent) { this.fxq.push({ k: 'recall', x: this.x, y: this.y }); audio.sfx('whoosh'); }
    this.on = false; this.aboard = false; this.under = false; this.held = false; this.sinkK = 0;
  }
  /** 上岸 / 跳到鲸背、鬼船甲板上 / 收舟起飞；都不行（四面是海又不会飞）就不让收 */
  disembark(): boolean {
    const g = this.game, p = g.player, J = g.jueyu;
    if (J.deep.active && this.under) { g.toast('龟甲宝船正沉在海渊里——先浮上去再收船。', 'warn'); return false; }
    const land = this.landNear(p.x, p.y, 320);
    if (land) { this.aboard = false; p.x = land[0]; p.y = land[1]; this.recall(); g.toast(`收起${this.spec?.name ?? '灵舟'}，跳上了${g.terrain.isLand(land[0], land[1]) ? '岸' : '落脚处'}。`, 'info'); audio.sfx('land'); return true; }
    if (this.canFly()) {
      if (g.hero.mp < (J.profile?.swim.takeoff ?? 0.12)) { g.toast('灵力不足一成，提不起遁光——先在船上打坐缓一缓。', 'warn'); return false; }
      this.aboard = false; this.recall();
      p.flying = true; p.z = 20; p.zTarget = 56; audio.sfx('whoosh');
      g.toast('收起灵舟，御器而起。', 'info');
      return true;
    }
    g.toast('四面都是海，你又还不会御器飞行——收了船就得落水。靠岸、靠到鲸背上再收。', 'warn');
    return false;
  }
  /** 起飞前（jueyu.refuseFly 问）：在船上按御剑＝收舟起飞；灵力不够起不了 */
  beforeFly(): boolean {
    if (!this.aboard) return false;
    const g = this.game, J = g.jueyu;
    if (this.under) { g.toast('人在海渊里，御不了器——先浮上去。', 'warn'); return true; }
    if (g.hero.mp < (J.profile?.swim.takeoff ?? 0.12)) { g.toast('灵力不足一成，提不起遁光——先在船上打坐缓一缓。', 'warn'); return true; }
    this.aboard = false; this.recall(); g.player.z = 10;
    return false;
  }
  private canFly(): boolean { const g = this.game; return g.canFlyNative || !!g.hero.equip?.flight; }
  /** 触须刚缠上船：挣扎从头算 */
  struggleReset() { this.struggleT = 0; }
  /** 修补：先用材料（沉船古木、渊底玄铁、墨触须段、玄铁、鬼齿），没有就付灵石 */
  repair(id: string): boolean {
    const g = this.game, h = g.hero, s = BOATS[id], hp = this.hpOf(id);
    if (!s || hp >= 0.999) return false;
    for (const [m, k] of REPAIR_MATS) if (C.bagCount(h, m) > 0) {
      C.removeItem(h, m, 1); this.setHp(id, hp + k); audio.sfx('chime');
      g.toast(`用一份${itemDef(m).name}补好了${s.name}的裂口（耐久 ${Math.round(this.hpOf(id) * 100)}%）。`, 'good'); g.updateUI(true); return true;
    }
    const cost = Math.ceil(itemDef(id).price * 0.3 * (1 - hp));
    if (C.bagCount(h, 'mat_lingshi') < cost) { g.toast(`修补${s.name}要沉船古木、玄铁这类材料，或者 ${cost} 灵石。`, 'warn'); return false; }
    C.removeItem(h, 'mat_lingshi', cost); this.setHp(id, 1); audio.sfx('chime');
    g.toast(`花了 ${cost} 灵石，把${s.name}里外修补一新。`, 'good'); g.updateUI(true);
    return true;
  }

  // ------------------------------------------------------------ 伤害
  /** 扣耐久（点数，按船的总耐久折算；护罩亮一下） */
  damage(pts: number, why: string, _x?: number, _y?: number) {
    const g = this.game, s = this.spec; if (!s || !this.on || pts <= 0) return;
    const hp = this.hpOf(this.id) - pts / s.hp;
    this.setHp(this.id, hp); this.hitT = 1;
    if (hp <= 0) this.wreck(why);
    else if (hp < 0.25 && hp + pts / s.hp >= 0.25) g.toast(`${s.name}的耐久只剩两成多了——船身吱吱作响，快靠岸！`, 'warn');
  }
  /** 人挨了天象（裂缝、落雷）：船也跟着挨（jueyu.hurtPlayer 调） */
  onHazard(frac: number, kind?: 'strike') {
    if (!this.aboard || !this.spec) return;
    // 第六轮返工：落雷按船总耐久的比例打（一道一成五气血的雷约掉一成二耐久，护罩厚的少），不再按 160 点——破浪一道雷掉九成
    if (kind === 'strike') this.damage(frac * STORM_BOLT * this.stormK(this.spec) * this.spec.hp, '天雷劈中');
    else this.damage(frac * 160, '天象');
  }
  /** 天象打完人之后（jueyu.hurtPlayer 调）：这一下船已经按天象挨过了，人掉的血不再按「人挨了打」二次算到船上 */
  syncHp() { if (this.aboard) this.lastHp = this.game.hero.hp; }
  /** 飓风打船的倍率：护罩分担得越多挨得越少（按乌篷、破浪两条船的平均归一） */
  private stormK(s: BoatSpec): number { return (1 - s.shield) * (1 - s.shield) / 0.69; }
  /** 船碎了：人落水（走泅水），船留在袋里但耐久是零（得修） */
  wreck(why: string) {
    const g = this.game, s = this.spec;
    this.setHp(this.id, 0);
    this.fxq.push({ k: 'wreck', x: this.x, y: this.y });
    const was = this.aboard;
    this.on = false; this.aboard = false; this.held = false; this.sinkK = 0;
    g.juice(0.06, 0.6); audio.sfx('break');
    g.toast(`${s?.name ?? '灵舟'}${why === '天象' ? '' : `被${why}`}——船身四分五裂！${was ? '你一头栽进了海里。' : ''}`, 'warn');
    if (was && !this.under) { g.jueyu.swimming = true; g.jueyu.stagger = 0.6; }
    this.under = false;
  }

  // ------------------------------------------------------------ 每帧（jueyu.tick 里调，移动积分之后、落水判定之前）
  reset() { this.sync = true; this.on = false; this.aboard = false; this.under = false; this.held = false; this.wake.length = 0; this.fxq.length = 0; this.px = NaN; }
  tick(dt: number) {
    const g = this.game, p = g.player, J = g.jueyu, t = g.time;
    const f = mapFrame(ACTIVE_MAP);
    if (this.sync) { this.sync = false; this.fdx = f.dx; this.fdy = f.dy; this.restore(); }
    // 换了图（飞过中线）：船的本图坐标跟着平移
    if (f.dx !== this.fdx || f.dy !== this.fdy) { const dx = f.dx - this.fdx, dy = f.dy - this.fdy; this.x += dx; this.y += dy; this.px += dx; this.py += dy; for (const w of this.wake) { w.x += dx; w.y += dy; } this.fdx = f.dx; this.fdy = f.dy; }
    this.heal();
    this.hitT = Math.max(0, this.hitT - dt * 2.5);
    this.bumpT = Math.max(0, this.bumpT - dt);
    if (!this.on) { this.updHud(); this.save(); return; }
    if (g.offWorld || g.inCave || g.xukong?.active || g.mijing?.active || !J.profile) { this.recall(true); this.updHud(); this.save(); return; }
    const s = this.spec!;
    this.bobT += dt;
    if (this.aboard) this.aboardTick(dt, s, t);
    else this.parkedTick(dt);
    // 被触须拖下去的程度：没被缠着就慢慢浮回来
    if (!this.held) this.sinkK = Math.max(0, this.sinkK - dt * 0.35);
    else if (this.sinkK >= 1 && this.on) { this.wreck('触须拖进了海里'); if (!J.deep.active) J.deep.pullUnder(160, '触须把船连人拖进了海里！'); }
    this.held = false;
    // 尾迹
    this.wakeT -= dt;
    const sp = Math.hypot(this.vx, this.vy);
    if (this.wakeT <= 0 && this.on && !this.under) { this.wakeT = 0.07; if (sp > 40) { const L = s.H * 0.55; this.wake.push({ x: this.x - Math.cos(this.head) * L, y: this.y - Math.sin(this.head) * L * 0.55 + 4, t }); } }
    while (this.wake.length && (t - this.wake[0].t > 1.6 || this.wake.length > 28)) this.wake.shift();
    this.updHud(); this.save();
  }
  private aboardTick(dt: number, s: BoatSpec, t: number) {
    const g = this.game, p = g.player, J = g.jueyu, h = g.hero;
    // 别的系统挪了人：近战击飞（速度快）＝被撞下船；慢慢的推、拽＝连船一起挪
    if (this.px === this.px) {
      const dx = p.x - this.px, dy = p.y - this.py, d = Math.hypot(dx, dy);
      if (p.flying) { this.aboard = false; this.recall(); this.updHud(); return; }   // 别的途径起飞（兜底：toggleFly 已先收舟）
      if (d > 2) {
        const fast = d / Math.max(dt, 1e-3) > 1500 || g.combat.brawl.pb.air;
        if (fast) { this.aboard = false; g.toast(`被撞下了${s.name}！游回船边按 ${keyLabel(bindOf('boat'))} 再上，或飞回去落在船上。`, 'warn'); this.px = NaN; return; }
        const nx = this.x + dx, ny = this.y + dy;
        if (!g.terrain.isLand(nx, ny)) { this.x = nx; this.y = ny; }
      }
    }
    // 驾船：方向键（按相机朝向转成世界方向）、摇杆、点地的去处
    let mx = 0, my = 0;
    const k = g.input.keys;
    if (k.has('w') || k.has('arrowup')) my -= 1; if (k.has('s') || k.has('arrowdown')) my += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1; if (k.has('d') || k.has('arrowright')) mx += 1;
    mx += g.input.joy.x; my += g.input.joy.y;
    if (g.renderer?.hd && g.camYaw && (mx || my)) { const c = Math.cos(g.camYaw), sn = Math.sin(g.camYaw); const wx = mx * c - my * sn, wy = mx * sn + my * c; mx = wx; my = wy; }
    if (!mx && !my && g.destination) { const dx = g.destination.x - this.x, dy = g.destination.y - this.y, dd = Math.hypot(dx, dy); if (dd < 140) g.destination = null; else { mx = dx / dd; my = dy / dd; } }
    if (!g.combat.canMove || this.held) { mx = 0; my = 0; }
    const m = Math.min(1, Math.hypot(mx, my));
    // 风：顺风快、逆风慢；风本身也把船往下风推一点（绝域的罡风照样把船吹回来）
    const wv = J.wind, wl = Math.hypot(wv.x, wv.y), hx = Math.cos(this.head), hy = Math.sin(this.head);
    const along = wl > 1 ? (wv.x * hx + wv.y * hy) / wl * Math.min(1, wl / 700) : 0;
    const vmax = s.speed * (1 + 0.38 * along) * (this.under ? 0.7 : 1) * (g.input.run || k.has('shift') ? 1.15 : 1);
    if (m > 0.05) {
      const want = Math.atan2(my, mx), da = angDiff(this.head, want);
      // 船速快时转得开、停着时原地掉头慢一些（船有长度）
      const sp0 = Math.hypot(this.vx, this.vy), turn = s.turn * (0.55 + 0.45 * Math.min(1, sp0 / 200)) * dt;
      const step = Math.max(-turn, Math.min(turn, da)); this.head += step; this.yawV += (step / Math.max(dt, 1e-3) - this.yawV) * Math.min(1, dt * 4);
      const push = s.accel * m * (0.25 + 0.75 * Math.max(0, Math.cos(da)));
      this.vx += Math.cos(this.head) * push * dt; this.vy += Math.sin(this.head) * push * dt;
      if (p.sitting) g.stand();
    } else this.yawV *= Math.max(0, 1 - dt * 3);
    // 侧向的速度很快被水吃掉（船只能顺着船身走）；纵向的慢慢滑停
    const fwd = this.vx * hx + this.vy * hy, side = -this.vx * hy + this.vy * hx;
    const fwd2 = fwd * Math.exp(-dt * (m > 0.05 ? 0.35 : 0.8)), side2 = side * Math.exp(-dt * 3.2);
    this.vx = fwd2 * hx - side2 * hy; this.vy = fwd2 * hy + side2 * hx;
    const v = Math.hypot(this.vx, this.vy); if (v > vmax) { this.vx *= vmax / v; this.vy *= vmax / v; }
    // 浪：随浪起伏之外，大浪隔一阵打过来（飓风里更凶）
    const st = J.stormNear(p.x, p.y), band = st?.band ?? 0, gale = Math.min(1, J.abyss / 6000);
    const drift = 0.2 + 0.25 * band;
    let nx = this.x + (this.vx + wv.x * drift) * dt, ny = this.y + (this.vy + wv.y * drift) * dt;
    // 礁石、岸：撞上就停，快的时候磕一下
    if (g.terrain.isLand(nx, ny) || g.jueyu.qiyu.blocksBoat(nx, ny)) {
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 480 && this.bumpT <= 0) { this.bumpT = 1.5; this.damage((sp - 400) * 0.06, '礁石磕破');   /* 只有全速撞上去才磕坏；顶着岸慢慢推不掉耐久（原先每息一磕，顶着小岛开船能把船磕碎） */ this.fxq.push({ k: 'bump', x: nx, y: ny }); audio.sfx('land'); g.juice(0.02, 0.2); }
      this.vx *= -0.25; this.vy *= -0.25; nx = this.x; ny = this.y;
    }
    const B = g.bounds; this.x = Math.min(B.x1, Math.max(B.x0, nx)); this.y = Math.min(B.y1, Math.max(B.y0, ny));
    // 天象打船：雨带里的风浪、绝域的罡风
    // 第六轮返工：飓风按「船总耐久的几成」打、护罩厚的船挨得少（原来按点数打，雨带强度 1.0 时破浪灵舟三十息就从十成打到一成）。
    // 雨带强度 1.0：乌篷约八十息、破浪约一百息碎，玄龟宝船近三倍；风眼里不掉
    const sm = this.stormK(s);
    if (band > 0.25) this.damage(STORM_RATE * band * sm * s.hp * dt, '狂风巨浪打散');
    if (gale > 0) this.damage(9 * gale * dt, '罡风撕碎');
    this.waveT -= dt;
    if (this.waveT <= 0) {
      const n = Math.floor(t / 0.41), sw = Math.max(J.k.swell, band);
      this.waveT = 3.2 + 2.4 * H(n, 5, 8801) - band * 1.4;
      if (sw > 0.5) {
        const a = wl > 30 ? Math.atan2(wv.y, wv.x) : H(n, 6, 8802) * Math.PI * 2, P = 160 * sw;
        this.vx += Math.cos(a) * P; this.vy += Math.sin(a) * P;
        // 寻常的涌浪只晃船；飓风雨带里的巨浪、核心海域的狂涛才打船（原先每个浪头都掉耐久，乌篷灵舟没天象也撑不过一趟核心）
        this.damage(band > 0.3 ? STORM_WAVE * band * sm * s.hp : sw > 0.85 && !st?.eye ? 1.5 : 0, '巨浪打散'); this.fxq.push({ k: 'wave', x: this.x, y: this.y });
        if (band > 0.3 && H(n, 7, 8803) < 0.5) g.combat.texts.push({ x: p.x, y: p.y - 130, s: '巨浪打船', color: '#bfe0ea', t: 0, vy: -30 } as never);
      }
    }
    // 人挨了打：灵光护罩分担一部分，船跟着掉耐久
    if (this.lastHp >= 0 && h.hp < this.lastHp - 1e-4 && !h.dead) {
      const drop = this.lastHp - h.hp;
      h.hp = Math.min(1, h.hp + drop * s.shield);
      this.damage(drop * 260 * (1 - s.shield * 0.5), '海兽撞碎');
    }
    if (!this.aboard) return;   // 上面这一下把船打碎了
    // 人钉在甲板上
    const [x, y] = this.deckPos();
    p.x = x; p.y = y; p.flying = false; p.z = p.zTarget = 0; this.px = x; this.py = y; this.lastHp = h.hp;
    if (Math.abs(Math.cos(this.head)) > 0.2) p.facing = Math.cos(this.head) > 0 ? 1 : -1;
    if (m > 0.05) p.st.faceToward(Math.cos(this.head), Math.sin(this.head) * 0.4, false);
  }
  /** 船停着（人落水了、跳到别处了）：随风浪慢慢漂；人走远了自己收回袖中；人回到甲板上就算登船 */
  private parkedTick(dt: number) {
    const g = this.game, p = g.player, J = g.jueyu;
    const k = Math.exp(-dt * 0.9); this.vx *= k; this.vy *= k;
    const nx = this.x + (this.vx + J.wind.x * 0.12) * dt, ny = this.y + (this.vy + J.wind.y * 0.12) * dt;
    if (!g.terrain.isLand(nx, ny)) { this.x = nx; this.y = ny; }
    const d = Math.hypot(this.x - p.x, this.y - p.y);
    if (d > 2600 && !J.swimming) { this.recall(); g.toast(`${this.spec?.name ?? '灵舟'}化作一道光，自己飞回了你的袖中。`, 'info'); return; }
    // 飞回来落在船上 / 被打飞又落回甲板
    if (!p.flying && !J.swimming && !J.deep.active && !g.combat.brawl.pb.air && this.standable(p.x, p.y) && d < 140) { this.board(); g.toast(`落回了${this.spec?.name}上。`, 'info'); }
  }
  /** 收着的船按天回耐久（法器自己温养） */
  private heal() {
    const F = this.F, d = this.game.day - F.day;
    if (!(d > 0)) { if (!(F.day <= this.game.day)) F.day = this.game.day; return; }
    F.day = this.game.day;
    for (const id of Object.keys(F.hp)) { if (this.on && id === this.id) continue; const s = BOATS[id]; if (s) this.setHp(id, this.hpOf(id) + s.heal * d); }
  }
  /** 存档里记一笔（每帧，便宜）：人在船上就记着船在哪 */
  private save() {
    const F = this.F;
    F.ab = this.on && this.aboard ? { id: this.id, x: this.x - this.fdx, y: this.y - this.fdy, h: this.head } : null;
  }
  /** 读档 / 换图 / 新开局之后：存档里人在船上，就接着在船上（船放在人脚下） */
  private restore() {
    const g = this.game, p = g.player, ab = this.F.ab;
    if (!ab || !BOATS[ab.id] || C.bagCount(g.hero, ab.id) <= 0 || g.offWorld || g.inCave || !g.jueyu.profile) return;
    if (g.terrain.isLand(p.x, p.y)) return;
    this.on = true; this.id = ab.id; this.head = ab.h; this.x = p.x - BOATS[ab.id].deckX * (Math.cos(ab.h) < 0 ? 1 : -1) * 0.6; this.y = p.y - 12; this.vx = this.vy = 0;
    this.board();
  }
  private updHud() {
    const H2 = this.hud, s = this.spec, own = this.owned();
    H2.owned = own.length > 0;
    H2.show = this.on || (own.length > 0 && !!this.game.jueyu.hud.show);
    H2.name = s && this.on ? s.name : own.length ? itemDef(own[0]).name : '';
    H2.hp = s && this.on ? this.hpOf(this.id) : own.length ? this.hpOf(own[0]) : 1;
    H2.aboard = this.aboard;
    H2.act = this.aboard ? '收舟' : this.on ? '登船' : '祭舟';
    H2.held = this.sinkK > 0.05;
    H2.warn = this.sinkK > 0.05 ? `触须缠住了船，正往海里拖（${Math.round(this.sinkK * 100)}%）——拼命划桨（方向键）或斩断它！` : '';
  }

  // ------------------------------------------------------------ 小工具：找水、找岸
  /** 身边最近的一片能放船的水面（不是陆地、不是鲸背 / 鬼船甲板） */
  waterNear(x: number, y: number, R: number): [number, number] | null {
    const g = this.game, ok = (a: number, b: number) => !g.terrain.isLand(a, b) && !g.jueyu.footholdAt(a, b, true) && !g.jueyu.qiyu.blocksBoat(a, b);
    if (ok(x, y)) return [x, y];
    for (let r = 120; r <= R; r += 80) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return [px, py]; }
    return null;
  }
  /** 身边最近的一处能站的地方（岸、鲸背、鬼船甲板、祭坛礁盘） */
  private landNear(x: number, y: number, R: number): [number, number] | null {
    const g = this.game, ok = (a: number, b: number) => (g.terrain.isLand(a, b) && g.terrain.walkFactor(a, b) > 0) || g.jueyu.footholdAt(a, b, true);
    for (let r = 60; r <= R; r += 50) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (ok(px, py)) return [px, py]; }
    return null;
  }

  // ------------------------------------------------------------ 画面
  /** 同伴、灵宠站到甲板上（render 前调：npc / 宠物的每帧更新在这之前，这里摆好就是这一帧画出来的样子） */
  preRender() {
    if (!this.aboard || !this.spec) return;
    const g = this.game, s = this.spec, lift = this.deckLift(), f = Math.cos(this.head) < 0 ? -1 : 1;
    const spots = [-0.2, 0.22, -0.06, 0.3];   // 站在船身中段（太靠两头看着像站在水上）
    let i = 0;
    for (const a of g.npcs.followers()) {
      const off = spots[i++ % spots.length] * s.H * -f;
      a.st.x = this.x + off; a.st.y = this.y + 8; a.st.lift = lift; a.d.x = a.st.x; a.d.y = a.st.y;
      if (a.st.speed > 5 || (a.st as unknown as { action?: string }).action === 'fly') a.st.setAction('idle');
    }
    const pe = g.pets?.ent; if (pe) { pe.x = this.x + 0.18 * s.H * f; pe.y = this.y + 10; pe.z = lift; }
  }
  /** HD 场景：船身立板（水线以下裁掉）；玄龟宝船沉在海渊里时整条画出来 */
  view(V: SeaView) {
    if (!this.on) return;
    const s = this.spec!, t = this.game.time, sw = this.game.jueyu.k.swell;
    const roll = Math.sin(this.bobT * 1.3) * (0.02 + 0.035 * sw) - this.yawV * 0.06;
    const ch = Math.abs(Math.cos(this.head));
    V.sprites.push({
      under: true, key: s.tex, x: this.x, y: this.y - 2, lift: -s.H * 0.16 + Math.sin(this.bobT * 1.6) * (2 + 6 * sw) - this.sinkK * s.H * 0.55 + (this.under ? s.H * 0.2 : 0), H: s.H,
      face: Math.cos(this.head) < 0 ? -1 : 1, alpha: 1, flash: this.hitT * 0.35, sx: 0.78 + 0.22 * ch, sy: 1, rot: roll, glow: this.hitT * 0.8 + 0.1, noClip: this.under, glowCol: [0.55, 0.95, 1],
    });
    void t;
  }
  /** 特效：尾迹的白浪、船头破浪、受击时的灵光护罩、祭出 / 收回 / 船碎（jueyu.drawGL 末尾调） */
  drawGL(F: FxSys, dt: number) {
    const g = this.game, t = g.time, FOAM: RGB = [0.9, 0.96, 1], WATER: RGB = [0.82, 0.92, 0.96], SHIELD: RGB = [0.55, 0.95, 1];
    for (const e of this.fxq) {
      if (e.k === 'deploy') { F.shockRing(e.x, e.y, 260, FOAM, 0.6, 0.5, 0.8, true); F.sparks(e.x, e.y - 20, WATER, 26, 420, 0.7, 5, -Math.PI / 2, 2); F.flash(e.x, e.y - 60, 220, SHIELD); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; F.emit({ x: e.x + Math.cos(a) * 60, y: e.y + Math.sin(a) * 30, vx: Math.cos(a) * 220, vy: Math.sin(a) * 110 - 60, life: 0.8, s0: 26, s1: 8, c: SHIELD, a: 0.8, add: 1, cell: AT.Glow }); } }
      else if (e.k === 'recall') { F.flash(e.x, e.y - 60, 180, SHIELD); for (let i = 0; i < 14; i++) F.emit({ x: e.x + (Math.random() - 0.5) * 200, y: e.y - Math.random() * 80, vy: -420 - Math.random() * 200, life: 0.7, s0: 18, s1: 4, c: SHIELD, a: 0.9, add: 1, cell: AT.Glow }); }
      else if (e.k === 'wreck') {
        F.shockRing(e.x, e.y, 320, FOAM, 0.7, 0.5, 1, true); F.sparks(e.x, e.y - 30, WATER, 40, 640, 0.9, 6, -Math.PI / 2, 1.8);
        for (let i = 0; i < 22; i++) { const a = Math.random() * Math.PI * 2, v = 220 + Math.random() * 380; F.emit({ x: e.x + (Math.random() - 0.5) * 160, y: e.y - 20, z: -40 - Math.random() * 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 200, life: 1.2 + Math.random() * 0.6, s0: 30, s1: 18, c: [0.32, 0.22, 0.14], a: 0.95, add: 0, cell: AT.Streak, grav: 700, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 }); }
        F.flash(e.x, e.y - 60, 260, SHIELD);
      } else if (e.k === 'wave') { F.sparks(e.x, e.y - 30, WATER, 22, 460, 0.7, 6, -Math.PI / 2, 1.6); F.shockRing(e.x, e.y, 200, FOAM, 0.55, 0.5, 0.5, true); }
      else if (e.k === 'bump') { F.sparks(e.x, e.y - 10, [0.55, 0.45, 0.32], 14, 300, 0.5, 4, -Math.PI / 2, 2); }
    }
    this.fxq.length = 0;
    if (!this.on || this.under) return;
    const s = this.spec!, sp = Math.hypot(this.vx, this.vy), hx = Math.cos(this.head), hy = Math.sin(this.head), L = s.H * 0.62;
    // 白浪尾迹：船尾走过的路两侧各一道往外扩的浪线，中间一条渐宽渐淡的白沫
    const W = this.wake;
    if (W.length >= 2) {
      const mid: [number, number][] = [], lf: [number, number][] = [], rt: [number, number][] = [];
      for (let i = 0; i < W.length; i++) {
        const w = W[i], age = t - w.t, j = Math.min(W.length - 1, i + 1), ddx = W[j].x - W[Math.max(0, j - 1)].x, ddy = W[j].y - W[Math.max(0, j - 1)].y, dl = Math.hypot(ddx, ddy) || 1;
        const nx = -ddy / dl, ny = ddx / dl, spread = 30 + age * 150;
        mid.push([w.x, w.y]); lf.push([w.x + nx * spread, w.y + ny * spread * 0.6]); rt.push([w.x - nx * spread, w.y - ny * spread * 0.6]);
      }
      mid.push([this.x - hx * L * 0.85, this.y - hy * L * 0.5 + 4]);
      const k = Math.min(1, sp / 300);
      F.trail(mid, 36 * (0.5 + 0.5 * k), FOAM, 0.2 * k, AT.Beam, 0, 1);
      F.trail(lf, 8, FOAM, 0.32 * k, AT.Beam, 0, 1); F.trail(rt, 8, FOAM, 0.32 * k, AT.Beam, 0, 1);
    }
    // 船尾翻起的白沫、船头劈开的水花
    if (sp > 60 && Math.random() < dt * (6 + sp / 50)) F.emit({ x: this.x - hx * L * 0.8 + (Math.random() - 0.5) * 40, y: this.y - hy * L * 0.4 + 4, vx: -hx * 60 + (Math.random() - 0.5) * 50, vy: -hy * 30 - 20, life: 0.9, s0: 18, s1: 46, c: FOAM, a: 0.45, add: 0, cell: AT.Smoke, drag: 1.4, groundMotion: true });
    if (sp > 180 && Math.random() < dt * sp / 40) { const bx = this.x + hx * L * 0.85, by = this.y + hy * L * 0.45 + 4; F.sparks(bx, by - 8, WATER, 3, 160 + sp * 0.4, 0.45, 4, Math.atan2(hy * 0.5, hx) + Math.PI * (Math.random() < 0.5 ? 0.62 : -0.62) - Math.PI / 2 * 0, 0.9); }
    // 船身一圈水纹
    F.ground(AT.RingSoft, this.x, this.y + 6, L * (1.05 + 0.04 * Math.sin(t * 2)), this.head, FOAM, 0.06 + 0.06 * Math.min(1, sp / 300), 1, 0.42);
    // 灵光护罩：受击时亮一下；核心海域（灵力在流失）常年有一层很淡的光
    const shimmer = (this.game.jueyu.k.drain > 0.3 ? 0.07 : 0) + this.hitT * 0.45;
    if (shimmer > 0.01) { F.glow(this.x, this.y - s.H * 0.38, s.H * 0.95, SHIELD, shimmer); F.ring(this.x, this.y - s.H * 0.3, s.H * 0.62, SHIELD, shimmer * 1.2, 0.6, true); }
    if (this.sinkK > 0.05) for (let i = 0; i < 2; i++) if (Math.random() < dt * 8) F.emit({ x: this.x + (Math.random() - 0.5) * L, y: this.y + 4, vy: -50, life: 0.7, s0: 10, s1: 24, c: FOAM, a: 0.5, add: 0, cell: AT.RingSoft, groundMotion: true });
  }
  /** 纯 2D 回退：船画在世界坐标里（ctx 已是世界变换），人站在甲板上 */
  draw2D(ctx: CanvasRenderingContext2D) {
    if (!this.on) return;
    const s = this.spec!, im = seaImg(s.tex), f = Math.cos(this.head) < 0 ? -1 : 1, sw = this.game.jueyu.k.swell;
    const bob = Math.sin(this.bobT * 1.6) * (2 + 6 * sw), roll = Math.sin(this.bobT * 1.3) * (0.02 + 0.035 * sw);
    ctx.save(); ctx.translate(this.x, this.y + bob); ctx.rotate(roll);
    ctx.fillStyle = 'rgba(230,245,255,0.18)'; ctx.beginPath(); ctx.ellipse(0, 4, s.H * 0.7, s.H * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    if (im) { const w = s.H * im.width / im.height; ctx.scale(-f, 1); ctx.drawImage(im, -w / 2, -s.H * 0.84, w, s.H); }
    else { ctx.fillStyle = '#5a3d26'; ctx.beginPath(); ctx.ellipse(0, -s.H * 0.15, s.H * 0.6, s.H * 0.16, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  /** 尾迹（2D 回退）：几道淡白的弧 */
  wake2D(ctx: CanvasRenderingContext2D) {
    if (!this.on || this.wake.length < 2) return;
    ctx.save(); ctx.strokeStyle = 'rgba(235,248,255,0.45)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); this.wake.forEach((w, i) => (i ? ctx.lineTo(w.x, w.y) : ctx.moveTo(w.x, w.y))); ctx.stroke(); ctx.restore();
  }
  /** 测试 / 试玩：此刻的状态 */
  get debug() { return { on: this.on, aboard: this.aboard, id: this.id, hp: this.on ? this.hpOf(this.id) : -1, x: this.x, y: this.y, v: Math.hypot(this.vx, this.vy), head: this.head, sink: this.sinkK }; }
}
void smooth01;
