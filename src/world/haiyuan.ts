// 收官 B3：万丈海渊——海面以下的负高度层。挂在 game.jueyu.deep（world/jueyu.ts 的构造里建），由 jueyu.tick 每帧驱动。
//
// 用户要的（2026-11-15）：
//   · 在核心 / 断层的深水处可以下潜：泅水时按住下降键往下；贴着海面飞时按住下降键一头扎进去；在船上按住下降（玄龟宝船整船下沉，别的船是纵身跳下去）；
//     被海兽拖下去；被近战砸进海里（战斗线留的 combat.brawl.onSubmerge 回调接到这里）。上浮回海面同样是自己按着上升键浮上去。
//   · 水下的规则：没有避水手段（装备的避水 waterward、避水珠这类揣在身上的宝珠、避水丹、祭坛的加持、玄龟宝船的护罩）就按深度水压持续掉血；
//     闭气耗灵力（灵力见底改掉血）；移动变慢、法术弹道变慢；看得见的只有光——自己身边一圈、发光的东西、遗迹的灵光。
//   · 海底按种子放古魔遗迹（石门、残柱林、沉船）：守卫、一个小首领、宝箱、万年海灵芝；越深越险越值钱。
//   · 海兽在水下是完整可见的（黑影在这里就是本体：seabeast.view 在水下把黑影画成整条的立板）。
//
// 「深度」是游戏里的量（水压、亮度、危险、奖励），画面上海底就是地面：人浮在海底上方（立板抬高），越深越黑，只剩光源照亮——
// 这一层由后期着色器做（gl/seaGlsl.ts 的 seaUnder），不重建场景。进水、出水都是玩家自己按着键潜下去 / 浮上来，画面逐渐过渡，不闪白、不黑屏。
//
// 随机数：遗迹、海底深浅都按大陆坐标的哈希取（两张图看到的是同一处）；造敌人时它自己要取的几个 Math.random 临时换成自己的序列（同 seabeast.ts 的 quiet）。
import type { Game } from './game';
import { Enemy } from './combat';
import * as C from './cultivation';
import { mod as statMod } from './cultivation';
import { ENEMIES, lvRealm } from '../data/enemies';
import { WARD_CHARMS } from '../data/seabeasts';
import { gearDropId, weaponDrop, SETS } from '../data/gear';
import { ACTIVE_MAP, mapFrame, MAP_SEAMS } from '../data/world';
import { hashU, mulberry32 } from '../core/rng';
import { audio } from './audio';
import { C as AT } from '../gl/atlas';
import type { FxSys, RGB } from '../gl/fx';
import type { SeaView } from './seabeast';
import { seaImg } from '../gfx/seaImg';

const smooth01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sstep = (a: number, b: number, x: number) => smooth01((x - a) / (b - a));
const H = (a: number, b: number, s: number) => hashU(a | 0, b | 0, s | 0);
function quiet<T>(seed: number, f: () => T): T { const r = Math.random; Math.random = mulberry32(seed | 0); try { return f(); } finally { Math.random = r; } }

/** 能下潜的地方：离岸至少这么远（迷雾断层起） */
export const DIVE_FROM = 11000;
/** 下潜 / 上浮的速度（单位 / 息） */
const SINK_V = 260, RISE_V = 320;
/** 遗迹按大陆坐标分格 */
const RUIN_CELL = 24000;
/** 一处遗迹打完后多少个游戏日再长回来 */
const RUIN_RESPAWN = 90;
/** 1 单位深度折几丈（界面上写「下潜 N 丈」；海底最深约三千单位 ≈ 九千丈——万丈海渊） */
export const ZHANG = 3;

/** 海底一处古魔遗迹（大陆坐标） */
export interface Ruin { id: number; cx: number; cy: number; kind: 0 | 1 | 2; tier: 1 | 2 | 3; floor: number }
interface Guard { e: Enemy; ruin: number; boss: boolean; st: string; t: number; cd: number; seed: number; n: number; a: number; vx: number; vy: number }
interface Pulse { x: number; y: number; t0: number; sp: number; R: number; raw: number; realm: number; src: Enemy; hit: boolean }

export class Haiyuan {
  /** 人在水下 */
  active = false;
  /** 下潜了多深（单位，0 是海面）、此处海底多深、竖直速度 */
  d = 0; floor = 1500; vz = 0;
  /** 画面里「水下」的程度 0–1（入水、出水时渐变；后期着色器读） */
  k = 0;
  /** 避水丹的余效（秒） */
  buffT = 0;
  /** 祭坛的避水加持（秒；seaqiyu 写） */
  altarT = 0;
  /** 附近的遗迹（大陆坐标） */
  ruins: Ruin[] = [];
  /** 界面（Compass.tsx 读） */
  hud = { show: false, zhang: 0, floorZhang: 0, ward: 0, need: 0, hurt: 0, breath: 1, choke: false, boat: false, ruinDir: NaN, ruinDist: Infinity, ruinName: '', canDive: false };
  /** 跟着人一起在水下的敌人（被砸进海里的、追下来的）；不在里面的陆上 / 空中的敌人，人在水下时够不着 */
  private under = new WeakSet<Enemy>();
  private subs: { e: Enemy; t: number }[] = [];
  private slowed = new WeakSet<object>();
  private guards: Guard[] = [];
  private pulses: Pulse[] = [];
  private seen = new WeakSet<Enemy>();
  private holdD = 0; private hurtAcc = 0; private scanT = 0; private fdx = 0; private fdy = 0;
  private installed = false; private hinted = false; private warned = 0;
  private fxq: { k: 'in' | 'out' | 'chest' | 'gather' | 'boss'; x: number; y: number }[] = [];
  private gatherI = -1; private gatherT = 0;

  constructor(readonly game: Game) {}

  // ------------------------------------------------------------ 规则
  /** 这一点（本图坐标）能不能下潜 */
  canDiveAt(x: number, y: number): boolean {
    const g = this.game, J = g.jueyu;
    return !!(J.profile ?? MAP_SEAMS[ACTIVE_MAP]) && (J.profile?.medium.dive ?? true) && !g.offWorld && !g.terrain.isLand(x, y) && !J.footholdAt(x, y, true) && J.depthAt(x, y) >= DIVE_FROM;
  }
  /** 海底多深（大陆坐标）：迷雾断层五六百，核心两三千；带一点起伏 */
  floorAt(cx: number, cy: number): number {
    const sd = this.game.jueyu.homeDepth(cx, cy), n = H(Math.floor(cx / 3000), Math.floor(cy / 3000), 9201) * 0.5 + H(Math.floor(cx / 1100), Math.floor(cy / 1100), 9202) * 0.5;
    return Math.round((520 + 2500 * sstep(DIVE_FROM, 46000, sd)) * (0.85 + 0.3 * n));
  }
  /** 此刻需要多少避水才不受水压（越深越多）：三百单位以内不压，海底最深处要六成五 */
  needAt(d: number): number { return Math.max(0, Math.min(0.75, (d - 300) / 2700 * 0.65)); }
  /** 身上的避水：装备（玄龟套等）+ 揣着的宝珠 + 避水丹 + 祭坛加持（不封顶——这里只跟「需要多少」比） */
  ward(): number {
    const g = this.game, h = g.hero;
    let w = Math.max(0, statMod(h, 'waterward'));
    let charm = 0; for (const id in WARD_CHARMS) if (C.bagCount(h, id) > 0) charm = Math.max(charm, WARD_CHARMS[id]);
    w += charm + (this.buffT > 0 ? 0.45 : 0) + (this.altarT > 0 ? 0.5 : 0);
    return w;
  }
  /** 服避水丹（储物袋「服用」交过来） */
  drinkWard(): boolean {
    const g = this.game, h = g.hero;
    if (C.bagCount(h, 'hy_bishuidan') <= 0) return false;
    C.removeItem(h, 'hy_bishuidan', 1); this.buffT = 180; audio.sfx('chime');
    g.toast('服下避水丹，周身浮起一层淡青的水膜——一百八十息内避水 +45%。', 'good'); g.updateUI(true);
    return true;
  }
  /** 被拖下去（触须、船被拖沉）：人已经在水里就直接往下 */
  pullUnder(d0: number, why: string) {
    const g = this.game, p = g.player;
    if (this.active || !this.canDiveAt(p.x, p.y)) return;
    this.enter(d0, why);
    this.vz = 200;
  }

  // ------------------------------------------------------------ 进出水
  private enter(d0: number, why: string) {
    const g = this.game, p = g.player, J = g.jueyu, B = J.boat;
    if (B.aboard && !B.spec?.dive) { B.aboard = false; }
    this.active = true; this.d = d0; this.vz = 150; this.hurtAcc = 0; this.holdD = 0;
    p.flying = false; p.boosting = false; p.z = p.zTarget = 0; J.swimming = false;
    if (g.dunkong?.active) g.dunkong.retract();
    if (p.sitting) g.stand();
    const [cx, cy] = J.toHome(p.x, p.y); this.floor = this.floorAt(cx, cy);
    this.fxq.push({ k: 'in', x: p.x, y: p.y }); audio.sfx('land');
    // 收官 B4 / 打磨：同伴、灵宠不擅水性——明说它们留在海面上等你（浮上去就跟上），不然人一下水身边空了，像是把人弄丢了
    if (g.npcs.followers().length || g.pets?.ent) g.hint('sea-dive-party', '同行的人和灵宠不擅水性，都留在海面上等你——浮上去它们就跟上来。');
    if (why) g.toast(why, B.under ? 'info' : 'warn');
    if (!this.hinted) { this.hinted = true; g.hint('sea-abyss', `万丈海渊：按住 ${'下降'}键往下潜、上升键往上浮。三百单位往下就有水压，没有避水（玄龟套、避水珠、避水丹、祭坛加持、玄龟宝船）就持续掉血；闭气耗灵力，灵力见底改掉血。水下黑，只有光照得见——海底按种子散着古魔遗迹，越深越险越值钱。`); }
  }
  /**
   * 离了海：不管还潜着多深，立刻回到水面上（不放出水的水花和声音）。
   * 总审：原来靠 tick(0) 里的条件浮上来，可南荒的险地配置一直有值、dt=0 时深度又不变，
   * 人在水下被打死救回岸上、或被传送上岸后，水下的暗色、水压、「万丈海渊」面板就一直挂着
   */
  leave() { if (this.active) { this.surface(true); this.k = 0; this.updHud(); } }
  private surface(quiet = false) {
    const g = this.game, p = g.player, J = g.jueyu, B = J.boat;
    this.active = false; this.d = 0; this.vz = 0;
    if (B.under) { B.under = false; B.board(); }
    else if (!quiet) { J.swimming = !J.footholdAt(p.x, p.y) && !g.terrain.isLand(p.x, p.y); J.stagger = 0.2; }
    if (!quiet) { this.fxq.push({ k: 'out', x: p.x, y: p.y }); audio.sfx('land'); }
    // 跟下来的敌人：照近战那边的规矩破水而出（会御器的腾空、海里的妖物留在水里）
    for (const s of this.subs) if (!s.e.dead) { const b = g.combat.brawl.body(s.e); b.subT = 0.6; }
    this.subs = [];
  }
  /** 战斗线的回调（combat.brawl.onSubmerge）：有人被砸进了海里 */
  onSubmerge(who: Enemy | null, x: number, y: number) {
    const g = this.game, br = g.combat.brawl;
    if (!this.canDiveAt(x, y)) return;
    if (!who) {
      // 主角被砸进深水：不再「沉一息浮上来」，直接进海渊（沉得不深，自己往上浮或往下追）
      br.pSubT = 0; br.playerLift = 0;
      if (!this.active) this.enter(160, '被一拳砸进了海里——四周一下子暗了下来。按住上升键浮上去，或者就在水下接着打。');
      else this.d = Math.min(this.floor, this.d + 160);
      return;
    }
    // 敌人被砸进深水：多沉一阵（五息），人追下来就在水下接着打
    const b = br.body(who); b.subT = Math.max(b.subT, 5);
    this.subs.push({ e: who, t: g.time });
    if (this.active) this.bring(who);
    else g.hint('sea-chase', `${who.name}被砸进了海里，正往下沉——贴着海面按住下降键追下去，就在水下接着打。`);
  }
  /**
   * 给战斗线的公开入口（jueyu.dive 转过来）：把人带进水下层——who = null 是主角，否则是敌人；depth 下到多深。
   * 不在能下潜的深水处（近岸、陆上、鲸背）返回 false，调用方照旧处理（比如砸出水柱、浮回来）。
   */
  diveIn(who: Enemy | null, x: number, y: number, depth = 220): boolean {
    if (!this.canDiveAt(x, y)) return false;
    const g = this.game;
    if (!who) {
      if (!this.active) this.enter(depth, '一头扎进了海里——四周一下子暗了下来。按住上升键浮上去，或者就在水下接着打。');
      else this.d = Math.min(this.floor, Math.max(this.d, depth));
      return true;
    }
    if (this.active) { this.bring(who); who.x = x; who.y = y; }
    else { const b = g.combat.brawl.body(who); b.subT = Math.max(b.subT, 5); if (!this.subs.some((s) => s.e === who)) this.subs.push({ e: who, t: g.time }); }
    return true;
  }
  /** 这个敌人此刻在不在水下层（跟着人沉下来的、海里的妖兽在人下潜时都算） */
  isUnder(e: Enemy): boolean { return this.under.has(e) || (this.active && (this.game.seabeast.isMine(e) || this.isGuard(e))); }
  /** 把一个沉在水里的敌人接进水下的战场 */
  private bring(e: Enemy) {
    const g = this.game, b = g.combat.brawl.body(e);
    b.subT = 0; e.hideT = 0; this.under.add(e);
    if (!this.subs.some((s) => s.e === e)) this.subs.push({ e, t: g.time });
  }

  // ------------------------------------------------------------ 每帧（jueyu.tick 里，落水判定之前）
  reset() { this.active = false; this.d = 0; this.vz = 0; this.k = 0; this.subs = []; this.dropGuards(); this.pulses = []; this.holdD = 0; this.fxq.length = 0; this.ruins = []; this.scanT = 0; this.altarT = 0; }
  tick(dt: number) {
    const g = this.game, p = g.player, J = g.jueyu, k = g.input.keys;
    if (!this.installed) { this.installed = true; g.combat.brawl.onSubmerge = (who, x, y) => this.onSubmerge(who, x, y); }
    const f = mapFrame(ACTIVE_MAP);
    if (f.dx !== this.fdx || f.dy !== this.fdy) { const dx = f.dx - this.fdx, dy = f.dy - this.fdy; this.fdx = f.dx; this.fdy = f.dy; for (const q of this.pulses) { q.x += dx; q.y += dy; } }
    this.buffT = Math.max(0, this.buffT - dt); this.altarT = Math.max(0, this.altarT - dt);
    const desc = k.has('descend') || g.input.climb < 0, asc = k.has('ascend') || g.input.climb > 0;
    this.scanT -= dt; if (this.scanT <= 0) { this.scanT = 1; this.scan(); }
    if (!this.active) {
      this.k = Math.max(0, this.k - dt * 2.2);
      // 入水：泅水时按住下降；贴着海面飞（最低处）时按住下降；在船上按住下降
      const can = this.canDiveAt(p.x, p.y) && !g.combat.brawl.pb.air;
      const need = J.swimming ? 0.3 : J.boat.aboard ? 0.5 : p.flying && p.z <= ALT_LOW + 6 ? 0.5 : Infinity;
      this.holdD = desc && can && need < Infinity ? this.holdD + dt : 0;
      this.hud.canDive = can && need < Infinity;
      if (this.holdD >= need) {
        const B = J.boat, dive = B.aboard && !!B.spec?.dive;
        if (dive) B.under = true;
        this.enter(40, dive ? `${B.spec!.name}的龟甲合拢，护罩罩住船身，连人带船沉了下去。` : B.aboard ? '纵身跃出船舷，一头扎进了海里。' : p.flying ? '收了遁光，一头扎进海里。' : '深吸一口气，潜了下去。');
      }
      this.guardsTick(dt); this.updHud();
      return;
    }
    // 人已经站在陆地上了（在水下被打死救回岸上、被传送上岸）：同一张图里险地配置一直有值，要自己看脚下
    if (!J.profile || g.offWorld || g.inCave || g.xukong?.active || g.hero.dead || g.terrain.isLand(p.x, p.y)) { this.leave(); this.active = false; this.updHud(); return; }
    // 竖直：按住下降往下、上升往上；不按就慢慢悬着（避水不够的略往上漂）
    const want = desc ? SINK_V : asc ? -RISE_V : -12;
    this.vz += (want - this.vz) * Math.min(1, dt * 3);
    const [cx, cy] = J.toHome(p.x, p.y), fl = this.floorAt(cx, cy);
    this.floor += (fl - this.floor) * Math.min(1, dt * 2);
    this.d = Math.min(this.floor, this.d + this.vz * dt);
    if (this.d <= 0) { this.surface(); this.updHud(); return; }
    this.k = Math.min(1, this.k + dt * 1.6) * sstep(0, 60, this.d) + (1 - sstep(0, 60, this.d)) * Math.min(this.k, 0.5);
    if (p.sitting) g.stand();
    p.flying = false; p.z = p.zTarget = 0;
    // 水压、闭气
    const need = this.needAt(this.d), ward = this.ward(), B = J.boat;
    let hurt = 0;
    if (B.under && B.on) { B.damage(dt * (2 + this.d / 600), '水压挤碎'); if (!B.on) this.hud.boat = false; }
    else if (ward < need) hurt = (need - ward) / Math.max(need, 0.05) * (0.012 + 0.05 * this.d / 3000);
    const h = g.hero, breath = (B.under ? 0 : 0.004 * (1 + this.d / 1500)) * (ward >= need ? 0.5 : 1);
    h.mp = Math.max(0, h.mp - breath * dt);
    const choke = h.mp <= 0.001 && !B.under;
    if (choke) hurt += 0.025;
    this.hurtAcc += hurt * dt;
    if (this.hurtAcc > 0.02) { J.hurtFrac(this.hurtAcc, p.x, p.y, null); this.hurtAcc = 0; }   // 不逐次弹提示（下面隔十二息提醒一次，界面上另有常亮的警示）
    if (hurt > 0 && g.time - this.warned > 12) { this.warned = g.time; g.toast(choke ? '灵力耗尽，闭不住气了——快浮上去！' : `避水不够（${Math.round(ward * 100)}% / 需要 ${Math.round(need * 100)}%）：水压正一点点压碎你——浮浅一些，或备好避水的东西再来。`, 'warn'); }
    this.hud.hurt = hurt; this.hud.choke = choke; this.hud.ward = ward; this.hud.need = need;
    // 法术弹道在水里变慢（只改一次速度）
    for (const pr of g.combat.projs) { if (this.slowed.has(pr)) continue; if (Math.abs(pr.x - p.x) > 3000 || Math.abs(pr.y - p.y) > 3000) continue; this.slowed.add(pr); pr.vx *= 0.55; pr.vy *= 0.55; }
    // 跟下来的敌人；水面上的敌人够不着你
    for (const s of this.subs) if (!s.e.dead && !this.under.has(s.e) && g.combat.enemies.includes(s.e)) this.bring(s.e);
    const SB = g.seabeast;
    for (const e of g.combat.enemies) { if (e.dead || this.under.has(e) || this.isGuard(e) || ((SB.isMine(e) || e.sea) && !AIRBORNE.has(e.def.id))) continue; e.hideT = Math.max(e.hideT, 0.15); }   // 雷鳐、船灵在水面上空，也够不着
    // 遗迹：守卫、首领、宝箱、灵芝
    this.ruinTick(dt);
    this.guardsTick(dt);
    this.updHud();
  }

  // ------------------------------------------------------------ 遗迹
  /** 人四周 3×3 格：按格子的种子摆遗迹（两张图同一处） */
  private scan() {
    const g = this.game, J = g.jueyu;
    if (!J.profile || !J.profile.medium.dive) { this.ruins = []; return; }   // 收官 B4：别界的流沙、熔岩……下不去，没有海底遗迹
    const [pcx, pcy] = J.toHome(g.player.x, g.player.y), ci = Math.floor(pcx / RUIN_CELL), cj = Math.floor(pcy / RUIN_CELL), out: Ruin[] = [];
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) { const r = this.ruinIn(i, j); if (r) out.push(r); }
    this.ruins = out;
  }
  /** 一格里有没有遗迹（大陆坐标的格子；测试也直接调它验「按种子一致」） */
  ruinIn(i: number, j: number): Ruin | null {
    if (H(i, j, 9101) >= 0.62) return null;
    const cx = (i + 0.2 + 0.6 * H(i, j, 9102)) * RUIN_CELL, cy = (j + 0.2 + 0.6 * H(i, j, 9103)) * RUIN_CELL, sd = this.game.jueyu.homeDepth(cx, cy);
    if (sd < 14000) return null;
    const tier = (sd < 30000 ? 1 : sd < 42000 ? 2 : 3) as 1 | 2 | 3;
    return { id: (Math.imul(i, 92821) ^ Math.imul(j, 68917) ^ 0x5eed) >>> 0, cx, cy, kind: Math.floor(H(i, j, 9104) * 3) as 0 | 1 | 2, tier, floor: this.floorAt(cx, cy) };
  }
  ruinName(r: Ruin) { return ['古魔石门', '残柱林', '古修沉船'][r.kind] + ['', '（浅渊）', '（中渊）', '（深渊）'][r.tier]; }
  /** 打完了没有（多少日后长回来） */
  cleared(r: Ruin): boolean { const f = (this.game.ws.flags as Record<string, unknown>).hyRuin as Record<string, number> | undefined; const d = f?.[r.id]; return d !== undefined && this.game.day - d < RUIN_RESPAWN; }
  private ruinLocal(r: Ruin): [number, number] { return [r.cx + this.fdx, r.cy + this.fdy]; }
  /** 遗迹里的几样东西（相对遗迹中心，本图坐标）：石门 / 残柱 / 宝箱 / 灵芝 */
  pieces(r: Ruin): { key: string; x: number; y: number; H: number; face: number }[] {
    const [x, y] = this.ruinLocal(r), out: { key: string; x: number; y: number; H: number; face: number }[] = [];
    const s = r.id;
    if (r.kind === 0) {
      out.push({ key: 'hy_ruin_gate', x, y: y - 120, H: 520, face: 1 });
      for (let q = 0; q < 4; q++) { const a = -0.4 + q * 0.95 + H(s, q, 9111) * 0.4, rr = 520 + 200 * H(s, q, 9112); out.push({ key: `hy_pillar_${q % 3}`, x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.6, H: 300 + 160 * H(s, q, 9113), face: H(s, q, 9114) < 0.5 ? 1 : -1 }); }
      out.push({ key: 'hy_chest', x: x + 40, y: y + 60, H: 110, face: 1 });
    } else if (r.kind === 1) {
      for (let q = 0; q < 7; q++) { const a = q / 7 * Math.PI * 2 + H(s, q, 9115), rr = 380 + 260 * H(s, q, 9116); out.push({ key: `hy_pillar_${q % 3}`, x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.62, H: 280 + 220 * H(s, q, 9117), face: H(s, q, 9118) < 0.5 ? 1 : -1 }); }
      out.push({ key: 'hy_chest', x, y: y + 20, H: 110, face: -1 });
    } else {
      out.push({ key: 'sb_ghostship', x: x - 60, y: y - 160, H: 560, face: 1 });
      for (let q = 0; q < 2; q++) out.push({ key: `hy_pillar_${q + 1}`, x: x + (q ? 520 : -620), y: y + 120 + q * 60, H: 260, face: q ? -1 : 1 });
      out.push({ key: 'hy_chest', x: x + 160, y: y + 90, H: 120, face: 1 });
    }
    return out;
  }
  /** 灵芝长在哪（本图坐标） */
  private herbAt(r: Ruin): [number, number] { const [x, y] = this.ruinLocal(r); return [x - 260 + 120 * H(r.id, 1, 9121), y + 140]; }
  private ruinTick(dt: number) {
    const g = this.game, p = g.player, F = g.ws.flags as Record<string, unknown>;
    let near = -1;
    for (const r of this.ruins) {
      const [x, y] = this.ruinLocal(r), dd = Math.hypot(x - p.x, y - p.y);
      if (dd > 2600) continue;
      const deepEnough = this.d >= r.floor * 0.5;
      // 守卫：沉到遗迹一半深、靠近了才醒；首领守在门口，再近一些才出来
      if (deepEnough && !this.cleared(r) && dd < 1500 && !this.guards.some((q) => q.ruin === r.id)) this.spawnGuards(r);
      if (deepEnough && !this.cleared(r) && dd < 700 && !this.guards.some((q) => q.ruin === r.id && q.boss)) this.spawnBoss(r);
      // 万年海灵芝（中渊以下），沉到海底附近、在旁边待一息就采
      const hf = (F.hyHerb ??= {}) as Record<string, number>;
      if (r.tier >= 2 && this.d >= r.floor - 300 && !(hf[r.id] !== undefined && g.day - hf[r.id] < 60)) {
        const [hx, hy] = this.herbAt(r);
        if (Math.hypot(hx - p.x, hy - p.y) < 110) near = r.id;
      }
    }
    if (near !== this.gatherI) { this.gatherI = near; this.gatherT = 0; }
    if (near >= 0) {
      this.gatherT += dt;
      if (this.gatherT > 1.2) {
        const r = this.ruins.find((q) => q.id === near)!, hf = F.hyHerb as Record<string, number>;
        hf[r.id] = g.day; this.gatherI = -1;
        const [hx, hy] = this.herbAt(r);
        g.combat.loot.push({ x: p.x, y: p.y, id: r.tier >= 3 || H(r.id, Math.floor(g.day), 9122) < 0.5 ? 'mat_hy_haizhi' : 'mat_sb_lingcao', n: 1, t: 0.6 });
        this.fxq.push({ k: 'gather', x: hx, y: hy }); audio.sfx('gather');
        g.toast('残柱根下一株幽光莹莹的海灵芝，连根采了下来。', 'good');
      }
    }
  }
  private spawnEnemy(defId: string, x: number, y: number, seed: number): Enemy | null {
    const g = this.game, def = ENEMIES[defId]; if (!def?.lv) return null;
    const lv = def.lv[0] + (def.lv[1] > def.lv[0] && H(seed, 1, 9131) < 0.4 ? 1 : 0), rs = lvRealm(lv);
    const e = quiet(seed, () => new Enemy(def, x, y, rs.realm, rs.stage, true));
    (e as Enemy & { shell?: boolean }).shell = true; e.kit = []; e.aggro = true; e.hx = x; e.hy = y; e.facing = -1; e.flyH = 0;
    g.combat.enemies.push(e);
    return e;
  }
  private spawnGuards(r: Ruin) {
    const [x, y] = this.ruinLocal(r), n = 1 + r.tier + (r.kind === 1 ? 1 : 0);
    for (let q = 0; q < n; q++) {
      const a = q / n * Math.PI * 2 + H(r.id, q, 9141), seed = (r.id ^ (q * 7919) ^ Math.floor(this.game.day)) | 0;
      const e = this.spawnEnemy('sb_yiji_wei', x + Math.cos(a) * 600, y + Math.sin(a) * 380, seed); if (!e) continue;
      this.guards.push({ e, ruin: r.id, boss: false, st: 'circle', t: 0, cd: 1.5 + q * 0.6, seed, n: 3, a, vx: 0, vy: 0 });
    }
    this.game.toast(`${this.ruinName(r)}的暗处亮起几点紫光——渊墟守卫游了过来！`, 'warn');
  }
  private spawnBoss(r: Ruin) {
    const [x, y] = this.ruinLocal(r), seed = (r.id * 31 + 7) | 0;
    const e = this.spawnEnemy('sb_yiji_kui', x, y - 40, seed); if (!e) return;
    // 越深越凶：深渊的首领多一截血
    if (r.tier >= 3) { e.maxHp *= 1.4; e.hp = e.maxHp; }
    this.guards.push({ e, ruin: r.id, boss: true, st: 'idle', t: 0, cd: 2.5, seed, n: 3, a: 0, vx: 0, vy: 0 });
    this.fxq.push({ k: 'boss', x, y }); g_juice(this.game);
    this.game.toast('封印阵上的石像睁开了眼——镇渊古傀从石门里走了出来！', 'warn');
  }
  isGuard(e: Enemy) { return this.guards.some((q) => q.e === e); }
  private dropGuards() {
    const c = this.game.combat;
    for (const q of this.guards) { const i = c.enemies.indexOf(q.e); if (i >= 0 && !q.e.dead) c.enemies.splice(i, 1); if (c.lock === q.e) c.lock = null; }
    this.guards = [];
  }
  private rnd(q: Guard) { return H(q.seed, q.n++, 9151); }
  /** 守卫与首领的出手（都是 shell：寻常 AI 跳过它们）；伤害一律走 hitPlayer */
  private guardsTick(dt: number) {
    const g = this.game, p = g.player, c = g.combat, t = g.time;
    if (!this.guards.length && !this.pulses.length) return;
    // 人离开水下或走远了：守卫回到遗迹的暗处（拿掉，下次再来）
    for (const q of this.guards) {
      const e = q.e;
      (e as { seaHD?: boolean }).seaHD = g.seabeast.hdReady;
      if (e.dead) { if (!this.seen.has(e)) { this.seen.add(e); this.onDead(q); } continue; }
      if (!c.enemies.includes(e)) continue;
      if (!this.active || Math.hypot(e.x - p.x, e.y - p.y) > 3400) { const i = c.enemies.indexOf(e); if (i >= 0) c.enemies.splice(i, 1); if (c.lock === e) c.lock = null; q.st = 'gone'; continue; }
      q.t += dt; q.cd -= dt;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.facing = dx > 0 ? 1 : -1; e.lift = 60 + 18 * Math.sin(t * 1.7 + q.seed);
      if (!q.boss) {
        if (q.st === 'circle') {
          q.a += dt * 0.7;
          const tx = p.x + Math.cos(q.a) * 320, ty = p.y + Math.sin(q.a) * 220;
          this.swim(q, tx, ty, e.speed * 0.8, dt);
          if (q.cd <= 0 && d < 700) { q.st = 'lunge'; q.t = 0; q.vx = dx / d * 900; q.vy = dy / d * 900; e.anim.atk = 1; }
        } else if (q.st === 'lunge') {
          e.x += q.vx * dt; e.y += q.vy * dt;
          if (d < 110 && q.t < 0.6) { c.hitPlayer(e.atk * 1.2, e.realm, { k: 'slow', dur: 1.2, ch: 0.6 }, e.x, e.y, e); q.t = 0.6; }
          if (q.t > 0.7) { q.st = 'circle'; q.cd = 2 + 1.5 * this.rnd(q); e.anim.atk = 0; }
        }
      } else {
        // 首领：守着门口（离门太远就拽回来），咆哮放一圈封印波、甩出一扇紫火、半血时叫来两只守卫
        const r = this.ruins.find((x) => x.id === q.ruin);
        const [hx, hy] = r ? this.ruinLocal(r) : [e.hx, e.hy];
        const leash = Math.hypot(e.x - hx, e.y - hy);
        if (q.st === 'idle') {
          if (d > 260 && leash < 900) this.swim(q, p.x, p.y, e.speed, dt); else this.swim(q, hx, hy, e.speed * 0.6, dt);
          if (q.cd <= 0 && d < 1100) { const r2 = this.rnd(q); q.st = r2 < 0.5 ? 'pulseWind' : 'boltWind'; q.t = 0; }
          if (!q.a && e.hp < e.maxHp * 0.5 && r) { q.a = 1; for (let i = 0; i < 2; i++) { const s2 = (q.seed ^ (i * 977 + 3)) | 0, a = i * Math.PI; const ee = this.spawnEnemy('sb_yiji_wei', e.x + Math.cos(a) * 400, e.y + Math.sin(a) * 260, s2); if (ee) this.guards.push({ e: ee, ruin: q.ruin, boss: false, st: 'circle', t: 0, cd: 1.2, seed: s2, n: 3, a, vx: 0, vy: 0 }); } g.toast('镇渊古傀一声闷吼，封印阵里又游出两只守卫！', 'warn'); }
        } else if (q.st === 'pulseWind') {
          e.anim.atk = Math.min(1, q.t / 1.1);
          if (q.t > 1.1) { q.st = 'idle'; q.cd = 3.5 + 2 * this.rnd(q); this.pulses.push({ x: e.x, y: e.y, t0: t, sp: 520, R: 1300, raw: e.atk * 1.25, realm: e.realm, src: e, hit: false }); g.juice(0.03, 0.4); audio.sfx('boom'); }
        } else if (q.st === 'boltWind') {
          e.anim.atk = 1;
          if (q.t > 0.8) {
            q.st = 'idle'; q.cd = 3 + 1.5 * this.rnd(q);
            for (let i = 0; i < 5; i++) { const a = Math.atan2(dy, dx) + (i - 2) * 0.28, sp = 420; c.projs.push({ fac: 'e', visual: { groundOffsetY: 60, elevation: e.lift + 120 }, x: e.x, y: e.y - 60, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 3, fx: 'ghost', color: '200,130,255', dmg: e.atk * 0.85, realm: e.realm, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 34, aoe: 0, size: 1.2, trail: [], lv: 0, src: e } as never); }
            audio.sfx('fire');
          }
        }
        if (q.st === 'idle') e.anim.atk = Math.max(0, e.anim.atk - dt * 2);
      }
    }
    this.guards = this.guards.filter((q) => q.st !== 'gone' && !(q.e.dead && q.e.deathT > 1));
    // 封印波：一圈往外扩，碰到人一次
    for (const w of this.pulses) {
      const r = (t - w.t0) * w.sp;
      if (!w.hit && this.active) { const d = Math.hypot(p.x - w.x, (p.y - w.y) / 0.7); if (Math.abs(d - r) < 90) { w.hit = true; c.hitPlayer(w.raw, w.realm, { k: 'stun', dur: 0.5, ch: 0.5 }, w.x, w.y, w.src); } }
    }
    this.pulses = this.pulses.filter((w) => (t - w.t0) * w.sp < w.R);
  }
  private swim(q: Guard, tx: number, ty: number, sp: number, dt: number) {
    const e = q.e, dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); if (d < 4) return;
    const k = Math.min(1, dt * 3), v = Math.min(sp, d * 2.5);
    q.vx += (dx / d * v - q.vx) * k; q.vy += (dy / d * v - q.vy) * k;
    e.x += q.vx * dt; e.y += q.vy * dt; e.anim.move = Math.min(1, Math.hypot(q.vx, q.vy) / Math.max(1, sp)); e.anim.phase += dt * 6;
  }
  /** 守卫、首领死了：掉落用自己的序列；首领死了宝箱打开，遗迹记作打完 */
  private onDead(q: Guard) {
    const g = this.game, e = q.e, r = this.ruins.find((x) => x.id === q.ruin), c = g.combat;
    const drop = (id: string, n = 1) => c.loot.push({ x: e.x + (this.rnd(q) - 0.5) * 120, y: e.y + (this.rnd(q) - 0.5) * 60, id, n, t: 0 });
    if (!q.boss) { if (this.rnd(q) < 0.4) drop('mat_sb_guichi'); if (this.rnd(q) < 0.12) drop('mat_hy_chenmu'); return; }
    if (!r) return;
    const F = g.ws.flags as Record<string, unknown>; ((F.hyRuin ??= {}) as Record<string, number>)[r.id] = g.day;
    const [cx, cy] = this.ruinLocal(r), pc = this.pieces(r).find((x) => x.key === 'hy_chest');
    const qx = pc?.x ?? cx, qy = pc?.y ?? cy, R = () => this.rnd(q), put = (id: string, n = 1) => c.loot.push({ x: qx + (R() - 0.5) * 160, y: qy + 40 + (R() - 0.5) * 70, id, n, t: 0.4 });
    // 越深越值钱：浅渊一两样，深渊满满一箱
    put('mat_lingshi', Math.round((1800 + 2600 * R()) * r.tier * r.tier));
    put('mat_hy_gumo', r.tier >= 2 ? 1 + Math.floor(R() * r.tier) : (R() < 0.5 ? 1 : 0) || 1);
    if (R() < 0.5 + 0.2 * r.tier) put('mat_hy_yuantie', 1 + Math.floor(R() * r.tier));
    put('mat_hy_chenmu', 1 + Math.floor(R() * 3));
    // 玄龟套（出海的那一套）、随机装备、避水珠、定海珠、玄龟宝船
    if (R() < 0.35 + 0.15 * r.tier) { const P = SETS.xuangui.pieces; put(P[Math.floor(R() * P.length)]); }
    if (R() < 0.5) put(gearDropId((r.id ^ Math.floor(g.day)) | 0, 2 + r.tier));
    { const wd = weaponDrop(((r.id * 977) ^ Math.floor(g.day)) | 0, 2 + r.tier, 0.4); if (wd) c.loot.push({ x: qx - 50, y: qy + 46, id: wd.id, n: 1, t: 0.4, affix: [wd.affix] }); }   // 近战兵器线：宝箱里四成有一件兵器（自己的哈希，不取 R()）
    if (R() < 0.18 * r.tier) put('hy_bishuizhu');
    if (r.tier >= 3 && R() < 0.12) put('hy_dinghaizhu');
    if (r.tier >= 2 && R() < 0.06 * r.tier) put('lz_xuangui');
    if (R() < 0.6) put('hy_bishuidan', 1 + Math.floor(R() * 2));
    this.fxq.push({ k: 'chest', x: qx, y: qy }); audio.sfx('chime');
    g.toast(`镇渊古傀轰然碎裂，封印阵的紫光熄了——${this.ruinName(r)}里的宝箱自己弹开了！`, 'good');
    g.news?.(`苏寒在无边海底的${this.ruinName(r)}斩了镇渊古傀。`, 'personal');
  }

  // ------------------------------------------------------------ 界面、画面
  private updHud() {
    const g = this.game, Hd = this.hud, p = g.player;
    Hd.show = this.active; Hd.zhang = Math.round(this.d * ZHANG); Hd.floorZhang = Math.round(this.floor * ZHANG); Hd.breath = g.hero.mp; Hd.boat = g.jueyu.boat.under;
    if (!this.active) { Hd.hurt = 0; Hd.choke = false; Hd.ward = this.ward(); Hd.need = 0; }
    // 最近的遗迹：水下才感应得到（远远一个方位，不给准确距离）
    let best: Ruin | null = null, bd = Infinity;
    for (const r of this.ruins) { const [x, y] = this.ruinLocal(r), d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = r; } }
    if (best && this.active && bd < 9000) { const [x, y] = this.ruinLocal(best); Hd.ruinDir = Math.atan2(y - p.y, x - p.x); Hd.ruinDist = bd; Hd.ruinName = this.ruinName(best); } else { Hd.ruinDir = NaN; Hd.ruinDist = Infinity; Hd.ruinName = ''; }
  }
  /** 后期着色器：水下的程度、深浅、光源（世界坐标：自己、发光的东西、遗迹的灵光） */
  post(): { k: number; depth: number; surf: number; lights: { x: number; y: number; r: number; a: number; c: RGB }[] } | null {
    if (this.k < 0.003) return null;
    const g = this.game, p = g.player, L: { x: number; y: number; r: number; a: number; c: RGB }[] = [];
    const w = this.ward(), glow = 1 + Math.min(0.6, w * 0.6);
    L.push({ x: p.x, y: p.y, r: 420 * glow, a: 1.05, c: [0.75, 0.95, 1] });
    if (this.game.jueyu.boat.under) L.push({ x: p.x, y: p.y - 40, r: 700, a: 0.8, c: [0.55, 1, 0.9] });
    for (const r of this.ruins) { const [x, y] = this.ruinLocal(r); if (Math.hypot(x - p.x, y - p.y) < 3200) { L.push({ x, y, r: 820, a: this.cleared(r) ? 0.35 : 0.9, c: [0.62, 0.38, 1] }); if (r.tier >= 2) { const [hx, hy] = this.herbAt(r); L.push({ x: hx, y: hy, r: 260, a: 0.7, c: [0.45, 1, 0.85] }); } } }
    for (const q of this.guards) if (!q.e.dead && Math.hypot(q.e.x - p.x, q.e.y - p.y) < 2600) L.push({ x: q.e.x, y: q.e.y, r: q.boss ? 420 : 220, a: 0.55, c: [0.7, 0.45, 1] });
    for (const m of g.seabeast.lightsFor(p.x, p.y)) L.push(m);
    L.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    return { k: this.k, depth: Math.min(1, this.d / 2600), surf: this.active ? 1 - sstep(20, 220, this.d) : 0, lights: L.slice(0, 8) };
  }
  /** HD 场景：遗迹（石门、残柱、沉船、宝箱）和守卫、首领的立板（水下整个画出来，不按水线裁） */
  view(V: SeaView) {
    if (this.k < 0.05) return;
    const g = this.game, p = g.player, t = g.time;
    for (const r of this.ruins) {
      const [x, y] = this.ruinLocal(r); if (Math.hypot(x - p.x, y - p.y) > 3600) continue;
      // 沉到遗迹一半深时从黑里浮现出来
      const a = this.k * sstep(r.floor * 0.25, r.floor * 0.55, this.d);
      if (a < 0.02) continue;
      const open = this.cleared(r);
      for (const pc of this.pieces(r)) V.sprites.push({ key: pc.key, x: pc.x, y: pc.y, lift: 0, H: pc.key === 'hy_chest' && open ? pc.H * 1.05 : pc.H, face: pc.face, alpha: a, flash: 0, sx: 1, sy: 1, rot: 0, glow: pc.key === 'hy_ruin_gate' && !open ? 0.5 + 0.25 * Math.sin(t * 2) : 0.15, noClip: true, glowCol: [0.65, 0.45, 1], tint: pc.key === 'sb_ghostship' ? [0.45, 0.55, 0.58] : undefined });
    }
    for (const q of this.guards) {
      const e = q.e; if (!g.combat.enemies.includes(e)) continue;
      const A = e.anim as typeof e.anim & { dead?: number }, base = q.boss ? 'sb_mochu' : 'sb_guichi';
      const fr = e.dead ? 5 : A.hit > 0.3 ? 4 : A.atk > 0.5 ? (q.boss ? 3 : 2) : Math.floor(t * 2.5 + q.seed) % 2;
      V.sprites.push({ key: `${base}_${fr}`, x: e.x, y: e.y, lift: e.lift, H: q.boss ? 440 : 160, face: e.facing, alpha: e.dead ? Math.max(0, 1 - e.deathT / 0.8) : 1, flash: e.hitFlash > 0 ? 1 : 0, sx: 1, sy: 1 + 0.03 * Math.sin(t * 2 + q.seed), rot: e.dead ? 0.6 * e.facing : 0, glow: 0.45, noClip: true, glowCol: [0.75, 0.5, 1], tint: q.boss ? [0.62, 0.66, 0.7] : [0.6, 0.62, 0.85] });
    }
  }
  /** 特效：入水 / 出水的水花与一圈圈的涟漪、气泡、悬浮的微粒、遗迹的封印阵与灵光、首领的封印波 */
  drawGL(F: FxSys, dt: number) {
    const g = this.game, p = g.player, t = g.time, FOAM: RGB = [0.9, 0.97, 1], VIO: RGB = [0.62, 0.4, 1], BUB: RGB = [0.75, 0.95, 1];
    for (const e of this.fxq) {
      if (e.k === 'in') { F.shockRing(e.x, e.y, 220, FOAM, 0.6, 0.5, 0.8, true); F.sparks(e.x, e.y - 10, FOAM, 30, 520, 0.7, 5, -Math.PI / 2, 1.8); F.shock(e.x, e.y, 360, 10, 0.5); for (let i = 0; i < 24; i++) F.emit({ x: e.x + (Math.random() - 0.5) * 120, y: e.y + (Math.random() - 0.5) * 50, vy: -60 - Math.random() * 120, life: 1 + Math.random(), s0: 8 + Math.random() * 10, s1: 3, c: BUB, a: 0.8, add: 1, cell: AT.RingSoft }); }
      else if (e.k === 'out') { F.shockRing(e.x, e.y, 200, FOAM, 0.6, 0.5, 0.8, true); F.sparks(e.x, e.y - 10, FOAM, 26, 480, 0.7, 5, -Math.PI / 2, 1.6); }
      else if (e.k === 'chest') { F.flash(e.x, e.y - 40, 260, [1, 0.85, 0.5]); F.sparks(e.x, e.y - 30, [1, 0.85, 0.5], 40, 420, 1, 5, -Math.PI / 2, 2.4); F.shockRing(e.x, e.y, 300, VIO, 0.8, 0.5, 1, true); }
      else if (e.k === 'gather') { F.sparks(e.x, e.y - 20, [0.5, 1, 0.85], 24, 240, 0.9, 4, -Math.PI / 2, 1.2); F.flash(e.x, e.y - 20, 100, [0.5, 1, 0.85]); }
      else if (e.k === 'boss') { F.shockRing(e.x, e.y, 600, VIO, 0.9, 0.5, 1, true); F.shock(e.x, e.y, 700, 14, 0.7); }
    }
    this.fxq.length = 0;
    // 首领的封印波
    for (const w of this.pulses) { const r = (t - w.t0) * w.sp, k = 1 - r / w.R; F.ground(AT.RingSoft, w.x, w.y, r, 0, VIO, 0.7 * k, 1, 0.7); F.ground(AT.Ring, w.x, w.y, r * 0.98, 0, [0.9, 0.8, 1], 0.4 * k, 1, 0.7); }
    if (this.k < 0.05) return;
    // 遗迹：封印阵（没打完是紫的、在转；打完了淡下去）、灵芝的光、门里透出的光
    for (const r of this.ruins) {
      const [x, y] = this.ruinLocal(r); if (Math.hypot(x - p.x, y - p.y) > 3200) continue;
      const a = this.k * sstep(r.floor * 0.25, r.floor * 0.55, this.d); if (a < 0.02) continue;
      const open = this.cleared(r), on = open ? 0.25 : 1;
      // 封印阵：三道同心的光环（最里一道慢慢转着一圈裂纹），没打完是亮紫的，打完了只剩一圈淡光
      F.ground(AT.Ring, x, y + 30, 380, 0, VIO, 0.5 * a * on, 1, 0.55);
      F.ground(AT.Ring, x, y + 30, 300, 0, [0.85, 0.7, 1], 0.35 * a * on, 1, 0.55);
      F.ground(AT.Swirl, x, y + 30, 260, t * 0.2 * on, VIO, 0.28 * a * on, 1, 0.55);
      F.ground(AT.RingSoft, x, y + 30, 440 + 20 * Math.sin(t * 1.5), 0, VIO, 0.3 * a * on + 0.08 * a, 1, 0.55);
      if (!open && Math.random() < dt * 5) F.emit({ x: x + (Math.random() - 0.5) * 500, y: y + (Math.random() - 0.5) * 200, vy: -40, life: 2, s0: 10, s1: 3, c: VIO, a: 0.8 * a, add: 1, cell: AT.Glow });
      if (r.tier >= 2) { const [hx, hy] = this.herbAt(r), hf = ((g.ws.flags as Record<string, unknown>).hyHerb ?? {}) as Record<string, number>; if (!(hf[r.id] !== undefined && g.day - hf[r.id] < 60)) { F.glow(hx, hy - 20, 70 + 12 * Math.sin(t * 2.6), [0.45, 1, 0.85], 0.5 * a); if (Math.random() < dt * 3) F.emit({ x: hx, y: hy - 20, vy: -40, life: 1.4, s0: 9, s1: 2, c: [0.6, 1, 0.9], a: 0.9 * a, add: 1, cell: AT.Glow }); } }
    }
    if (!this.active) return;
    // 自己吐的气泡、身边悬浮的微粒（海雪）
    if (Math.random() < dt * 2.2) for (let i = 0; i < 3; i++) F.emit({ x: p.x + (Math.random() - 0.5) * 20, y: p.y - 70 - Math.random() * 20, z: -80, vx: (Math.random() - 0.5) * 20, vy: -90 - Math.random() * 60, life: 1.6, s0: 6 + Math.random() * 8, s1: 10, c: BUB, a: 0.7, add: 1, cell: AT.RingSoft });
    if (Math.random() < dt * 14) { const a = Math.random() * Math.PI * 2, r = 100 + Math.random() * 900; F.emit({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r * 0.7, z: -40 - Math.random() * 260, vx: (Math.random() - 0.5) * 14, vy: 6 + Math.random() * 10, life: 3 + Math.random() * 2, s0: 4, s1: 3, c: [0.75, 0.9, 0.95], a: 0.35 * (1 - this.d / 4000), add: 1, cell: AT.Glow }); }
    // 避水的水膜：周身一层淡青的光
    const w = this.ward(), need = this.needAt(this.d);
    if (w > 0.05) F.ring(p.x, p.y - 50, 70 + 4 * Math.sin(t * 3), [0.55, 0.95, 1], Math.min(0.35, 0.15 + w * 0.2), 1.1, true);
    if (w < need) F.ring(p.x, p.y - 50, 78 + 8 * Math.sin(t * 9), [1, 0.35, 0.3], 0.25 + 0.15 * Math.sin(t * 9), 1.1, true);
  }
  /** 纯 2D 回退：遗迹的几件（水下才画），加一层压暗 */
  draw2D(ctx: CanvasRenderingContext2D) {
    if (this.k < 0.05) return;
    const p = this.game.player;
    for (const r of this.ruins) {
      const [x, y] = this.ruinLocal(r); if (Math.hypot(x - p.x, y - p.y) > 3600) continue;
      for (const pc of this.pieces(r)) { const im = seaImg(pc.key); if (!im) continue; const w = pc.H * im.width / im.height; ctx.save(); ctx.globalAlpha = this.k; ctx.translate(pc.x, pc.y); ctx.scale(-pc.face, 1); ctx.drawImage(im, -w / 2, -pc.H, w, pc.H); ctx.restore(); }
    }
  }
  /** 测试 / 试玩 */
  get debug() { return { active: this.active, d: this.d, floor: this.floor, k: this.k, ward: this.ward(), need: this.needAt(this.d), guards: this.guards.length, boss: this.guards.some((q) => q.boss), ruins: this.ruins.length }; }
  /** 试玩 / 测试：直接把人放到水下 d 处 */
  debugDive(d: number) { const p = this.game.player; if (!this.active) this.enter(d, ''); this.d = d; this.k = 1; const [cx, cy] = this.game.jueyu.toHome(p.x, p.y); this.floor = this.floorAt(cx, cy); }
  /** 最近的一处遗迹（大陆坐标的格子里找；试玩入口用） */
  nearestRuin(x: number, y: number, R = 6): Ruin | null {
    const f = mapFrame(ACTIVE_MAP), cx = x - f.dx, cy = y - f.dy, ci = Math.floor(cx / RUIN_CELL), cj = Math.floor(cy / RUIN_CELL);   // 按此刻这张图的平移现算（刚换图那一帧也对）
    let best: Ruin | null = null, bd = Infinity;
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) { const r = this.ruinIn(i, j); if (!r) continue; { const B = this.game.bounds, x = r.cx + f.dx, y = r.cy + f.dy; if (!(x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1) || this.game.terrain.isLand(x, y)) continue; } const d = Math.hypot(r.cx - cx, r.cy - cy); if (d < bd) { bd = d; best = r; } }
    return best;
  }
  local(r: Ruin): [number, number] { const f = mapFrame(ACTIVE_MAP); return [r.cx + f.dx, r.cy + f.dy]; }
}
const ALT_LOW = 40;
/** 海兽里在水面上空的那几种（人在水下时它们够不着） */
const AIRBORNE = new Set(['sb_leiyao', 'sb_chuanling', 'sb_chuanling_deng', 'sb_tan_ying']);
function g_juice(g: Game) { g.juice(0.05, 0.7); audio.sfx('boom'); }
