// 收官 P8（丁）：画中洞天——一幅展开的画卷，画里是另一处天地；走进画里，就到了那处天地。全无缝。
//
// · 画：立在地上的一架卷轴（hd2d/huajuanGl.ts 画），画面不是贴图：画里那处秘境（和走进去以后是同一份生成：MijingSys.preview）
//   约 10 Hz 画进一张离屏画布，云在飘、妖物在台上走。只在画在视野里、离得不远时才重画。
// · 进：画前地上一道淡淡的墨线。人自己走过墨线、往画里走，画面就从画框里一点点铺满屏幕（镜头贴近画面）；
//   铺满的那一刻换到画中——那边落脚处同样被这幅画盖着，往外走画就像墨迹洇开一样散去。想退回去，转身就行（没铺满前都还在外面）。
// · 出：画里入口那座古阵就是「画外之门」（秘境的云门，留白的纸色）：走进阵心，云气遮满的那一刻回到画前，往外走云就散。
// · 没打完可以回去：秘境自己会把没打完的那一层留一阵（MijingSys 的 kept），从同一幅画再走进去接着打。
// · 存档：人在画里存档，存的是画前那一点，另记一笔「人在哪幅画里」（ws.flags.hjIn）；读档回来照旧走回画里。
// · 画从哪来：青霞谷藏经阁那层台上立着一幅（溪山行旅）；古画（misc_guhua）挂在自己洞府里，就是一处可以反复进的小洞天（每幅画一个种子）。
//
// 随机数：这里一个 Math.random 都不取。
import type { Game } from './game';
import type { MjSpec, MjFloor } from './mijing';
import { LOC_BY_ID, WORLD_SCALE, ACTIVE_MAP } from '../data/world';
import { grandSectPlan } from '../data/sectPlan';
import { getLayout, LOC_SCALE } from '../gfx/building';
import * as C from './cultivation';
import type { BagItem } from './cultivation';

export interface Scroll {
  id: string; map: string; name: string;
  /** 卷轴立在哪（世界坐标：架脚的正中），画面朝南 */
  x: number; y: number;
  /** 画心的宽、高（世界单位） */
  w: number; h: number;
  spec: MjSpec;
}
/** 画前那道墨线离画多远；走过墨线再往里 RUN 这么多，画就铺满 */
export const LINE = 150, RUN = 100;
/** 离画多远以内、又在视野里，才重画画里的景（离屏画布约 10 Hz） */
export const PAINT_NEAR = 1900;

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class HuajuanSys {
  /** 主角此刻对着的那幅画（附近最近的一幅；画面线据此画卷轴与离屏画） */
  near: Scroll | null = null;
  /** 走进画里的程度 0..1（过了墨线开始涨，到 1 就进去了） */
  k = 0;
  /** 画面盖着屏幕的程度 0..1：走进去时从画框铺满；进去以后往外走散开 */
  cover = 0;
  /** 进去之后：从哪一点开始往外走（盖着的画随离这点的远近散开） */
  private coverFrom: { x: number; y: number } | null = null;
  /** 出来之后：从哪一点开始往外走（云门的云随离这点的远近散开，由这里接管 MijingSys.veil） */
  private veilFrom: { x: number; y: number } | null = null;
  /** 人在哪幅画里 */
  cur: Scroll | null = null;
  /** 刚从画里出来：要先退出墨线外，才会再被吸进去 */
  private armed = true;
  private fixed: Scroll[] | null = null;
  /** 出来以后云门那层云的浓度（只降不升：往外走才散，站着不动就一直裹着） */
  private veilK = 0;
  private fixedFor = '';
  /** 画中秘境的预览（画上画的就是它）：按画缓存 */
  private previews = new Map<string, MjFloor>();
  constructor(public game: Game) {}

  /** 本图上的画：宗门里立着的那幅、洞府里挂着的古画 */
  scrolls(): Scroll[] {
    const g = this.game, out: Scroll[] = [];
    if (this.fixedFor !== ACTIVE_MAP) { this.fixed = null; this.fixedFor = ACTIVE_MAP; }
    if (this.fixed === null) this.fixed = this.placeFixed();
    out.push(...(this.fixed ?? []));
    const hung = (g.ws.flags as { hjHome?: number[] }).hjHome, home = g.ws.home;
    if (hung?.length && home && (home.map ?? 'tiannan') === ACTIVE_MAP) {
      // 洞府里挂的古画：沿洞府门前一排（洞府的落脚点 home.x, home.y 在门口）。第六轮返工：原来按固定的偏移摆（门东 240、490、740），
      // 不看空地和碰撞——落在坡上、路上、别的东西里，画前的路也不一定走得通。现在逐幅找空地（见 homeSpots），找不到才退回原来的偏移
      const key = `${ACTIVE_MAP}|${Math.round(home.x)}|${Math.round(home.y)}|${hung.slice(0, 3).join(',')}`;
      if (this.homeFor !== key) { const sp = this.homeSpots(home.x, home.y, Math.min(3, hung.length)); if (sp) { this.homeAt = sp; this.homeFor = key; } else this.homeAt = null; }
      hung.slice(0, 3).forEach((seed, i) => { const q = this.homeAt?.[i]; out.push(homeScroll(q ? q[0] : home.x + 240 + i * 250, q ? q[1] : home.y + 30, seed)); });
    }
    return out;
  }
  private homeAt: [number, number][] | null = null; private homeFor = '';
  /**
   * 第六轮返工：洞府门前给 n 幅古画找空地。每幅画占画宽加两边各六十，画前要留一条走得进去的路（墨线、铺满那一段再往外一百二）：
   * 这一片里每一格都要是能站的平地（不挡在殿阁 / 碰撞里、不陡、不是路面石阶），画前那段路两头高差不过四十；离洞门四个身位以外（不挡门），
   * 画和画（连同各自画前那条路）不叠。候选按「离门东侧那一排原来的位置」由近到远排，确定、不取随机数。
   * 空地要人在附近（城内空间、地形都备好了）才查得准：人离洞府还远就返回 null，过会儿再来
   */
  private homeSpots(hx: number, hy: number, n: number): [number, number][] | null {
    const g = this.game, S = g.space, T = g.terrain, p = g.player;
    if (Math.hypot(p.x - hx, p.y - hy) > 2600) return null;
    const W = 200, M = 60;
    const free = (x: number, y: number) => {
      if (Math.hypot(x - hx, y - hy) < 260 || (Math.abs(x - hx) < W / 2 + M + 80 && y > hy - 120 && y < hy + LINE + RUN + 200)) return false;   // 不挡洞门、洞门前那条路
      for (let dx = -(W / 2 + M); dx <= W / 2 + M; dx += 40) for (let dy = -40; dy <= LINE + RUN + 120; dy += 40) {
        const wx = x + dx, wy = y + dy;
        if (S?.blocked(wx, wy) || T.walkFactor(wx, wy) <= 0 || !T.surface.sample(wx, wy).walkable || T.surface.onRoadBed(wx, wy)) return false;
      }
      return Math.abs(T.surface.heightAt(x, y) - T.surface.heightAt(x, y + LINE + RUN)) < 40;
    };
    const cand: [number, number, number][] = [];
    for (let i = -24; i <= 24; i++) for (let j = -6; j <= 10; j++) { const x = hx + i * 50, y = hy + j * 40; cand.push([x, y, 0]); }
    const out: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      const px = hx + 240 + k * 250, py = hy + 30;
      for (const c of cand) c[2] = Math.hypot(c[0] - px, (c[1] - py) * 1.5);
      cand.sort((a, b) => a[2] - b[2]);
      const hit = cand.find(([x, y]) => !out.some(([ox, oy]) => Math.abs(ox - x) < W + 2 * M && Math.abs(oy - y) < LINE + RUN + 160) && free(x, y));
      if (!hit) return out.length ? [...out, ...Array.from({ length: n - out.length }, (_, q) => [hx + 240 + (k + q) * 250, hy + 30] as [number, number])] : null;
      out.push([hit[0], hit[1]]);
    }
    return out;
  }
  /** 青霞谷藏经阁那层台上的一幅：在台面上找一块空地（殿阁、石阶都让开），按台的位置算，不取随机数 */
  private placeFixed(): Scroll[] | null {
    const g = this.game, loc = LOC_BY_ID.get('huangfeng');
    if (!loc || (loc.map ?? 'tiannan') !== ACTIVE_MAP) return [];
    const P = grandSectPlan(loc), t = P?.terraces.find((q) => q.role === 'library');
    if (!P || !t) return [];
    const ox = loc.x * WORLD_SCALE, oy = loc.y * WORLD_SCALE, p = g.player;
    // 空地要人在附近（城内空间认得这座宗门）时才查得准：还远就先不放，过会儿再来
    if (!g.space?.near.some((n) => n.l.id === loc.id)) return null;
    const side = t.x < 0 ? -1 : 1, S = g.space, T = g.terrain;
    // 台上别的东西（亭、殿、塔、树、石灯……）的锚点：画和画前那段路离它们远一点（亭子没有碰撞，但亭顶会遮住画）
    // 各件的占地半径：殿按殿身加出檐、亭按亭顶、塔按塔身，别的按 120
    const reach = (pc: { kind: string; p: Record<string, any> }) => pc.kind === 'sHall' ? pc.p.w / 2 + (pc.p.h ?? 200) * 0.42 + 60 : pc.kind === 'sPavilion' ? (pc.p.w ?? 200) * 0.85 + 50 : pc.kind === 'sPagoda' ? (pc.p.w ?? 300) * 0.8 + 50 : 120;
    const L = getLayout(loc), things = L.pieces.filter((pc) => pc.kind !== 'sWall' && pc.kind !== 'sStair' && pc.kind !== 'sIsle' && pc.kind !== 'sChain' && pc.kind !== 'sBridge').map((pc) => [ox + pc.x * LOC_SCALE, oy + pc.y * LOC_SCALE, reach(pc)] as const);
    const free = (x: number, y: number) => {
      if (things.some(([px, py, r]) => Math.abs(px - x) < r + 150 && py > y - 160 - r && py < y + LINE + RUN + 120 + r)) return false;
      for (let dx = -150; dx <= 150; dx += 50) for (let dy = -40; dy <= LINE + RUN + 60; dy += 40) {
        const wx = x + dx, wy = y + dy;
        if (S.blocked(wx, wy) || T.walkFactor(wx, wy) <= 0 || !T.surface.sample(wx, wy).walkable) return false;
      }
      return Math.abs(T.surface.heightAt(x, y) - T.surface.heightAt(x, y + LINE + RUN)) < 40;
    };
    const cand: [number, number][] = [];
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 6; j++) cand.push([t.x - side * t.w * (-0.2 + i * 0.05), t.y - t.h * 0.36 + j * t.h * 0.1]);
    for (const [x, y] of cand) if (free(ox + x, oy + y)) {
      return [{ id: 'hf-xishan', map: loc.map ?? 'tiannan', name: '溪山行旅', x: ox + x, y: oy + y, w: 230, h: 300,
        spec: { name: '画中洞天·溪山行旅', tier: 1, theme: 'shanshui', seed: 51707, floors: 1, rooms: 4, lv: 2, size: 1.3 } }];
    }
    return [];
  }
  /**
   * 秘境首领伏诛（MijingSys 调）：古画的来源。画中洞天第一次打通，画里还藏着一幅（画中有画）；
   * 寻常秘境按秘境种子四成之一掉一幅（种子定掉不掉，不取随机数）。画的种子记在袋里那一堆的 age 上
   */
  onBossDown(spec: MjSpec) {
    const g = this.game, f = g.ws.flags as { hjGot?: Record<string, 1> };
    let seed = 0;
    if (spec.theme === 'shanshui') {
      const id = this.cur?.id; if (!id || id.startsWith('home-') || f.hjGot?.[id]) return;
      (f.hjGot ??= {})[id] = 1; seed = (spec.seed % 9973) + 17;
    } else if (hashStr('guhua' + spec.seed) % 4 === 0) seed = (spec.seed % 9973) + 1;
    if (!seed) return;
    C.addItem(g.hero, 'misc_guhua', 1, seed);
    g.toast(spec.theme === 'shanshui' ? '祭坛上的石匣里卷着一幅更小的画——画中有画。（古画：挂在自己洞府里，便能走进去）' : '首领身后的石龛里供着一卷古画，墨色里的云竟在动。（古画：挂在自己洞府里，便能走进去）', 'good');
  }
  /** 袋里的古画「挂进洞府」：人要在自己洞府跟前；最多挂三幅。成了返回 true */
  hang(b: BagItem): boolean {
    const g = this.game, home = g.ws.home, p = g.player, f = g.ws.flags as { hjHome?: number[] };
    if (b.id !== 'misc_guhua') return false;
    if (!home || (home.map ?? 'tiannan') !== ACTIVE_MAP || Math.hypot(home.x - p.x, home.y - p.y) > 900) { g.toast('古画要挂在自己的洞府里——先回洞府。', 'warn'); return false; }
    if ((f.hjHome?.length ?? 0) >= 3) { g.toast('洞府前已挂了三幅画，挂不下了。', 'warn'); return false; }
    const seed = Math.max(1, Math.round(b.age ?? 0) || (hashStr(String(g.day)) % 9973) + 1);
    C.removeItem(g.hero, 'misc_guhua', 1, b.age ?? 0);
    (f.hjHome ??= []).push(seed);
    g.toast('古画挂好了，就立在洞府门前。走过画前那道墨线，便能走进画里。', 'good');
    return true;
  }
  /** 画里那处秘境第一层的样子（画在画上的就是它） */
  preview(s: Scroll): MjFloor {
    let f = this.previews.get(s.id);
    if (!f) { f = this.game.mijing.preview(s.spec); this.previews.set(s.id, f); }
    return f;
  }
  /** 这幅画眼下要不要重画画里的景：人在世界里、离得不远、画在镜头看得到的范围里（画面线另按屏幕投影再裁一次） */
  paintWanted(s: Scroll): boolean {
    const g = this.game, c = g.cam, W = typeof window !== 'undefined' ? window.innerWidth : 1600, H = typeof window !== 'undefined' ? window.innerHeight : 900;
    if (g.offWorld && !this.cur) return false;
    if (g.offWorld) return this.cover > 0;   // 刚进画里、画还盖着屏幕：接着画（这时人看到的就是这幅画）
    if (Math.hypot(s.x - g.player.x, s.y - g.player.y) > PAINT_NEAR) return false;
    const z = Math.max(0.1, c.zoom ?? 1), hw = W / 2 / z + s.w, hh = H / 2 / z + s.h * 2;
    return Math.abs(s.x - c.x) < hw && Math.abs(s.y - c.y) < hh;
  }

  update(dt: number) {
    const g = this.game, p = g.player, mj = g.mijing, f = g.ws.flags as { hjIn?: { id: string; spec: MjSpec; bx: number; by: number } };
    // 读档回来：存档时人在画里——走回画里（不盖画，就是读档）
    if (f.hjIn && !this.cur && !mj.active && !g.offWorld) {
      const s = this.scrolls().find((q) => q.id === f.hjIn!.id) ?? { id: f.hjIn.id, map: ACTIVE_MAP, name: '', x: f.hjIn.bx, y: f.hjIn.by - LINE - 60, w: 230, h: 300, spec: f.hjIn.spec };
      this.enter(s, false);
      return;
    }
    if (this.cur) {
      if (!mj.active) {
        // 从画外之门出来了（或在里面倒下、被传送走）：落在画前，云门的云由这里接管——往外走才散；画不再盖着
        const s = this.cur; this.cur = null; delete f.hjIn;
        this.cover = 0; this.coverFrom = null; this.k = 0; this.armed = false;
        if (mj.gate) mj.gate = null;
        if (Math.hypot(p.x - s.x, p.y - (s.y + LINE + 60)) < 40) { this.veilFrom = { x: p.x, y: p.y }; this.veilK = mj.core; }
        return;
      }
      // 进去以后：画盖着屏幕，往外走就散
      if (this.coverFrom) {
        const d = Math.hypot(p.x - this.coverFrom.x, p.y - this.coverFrom.y);
        this.cover = Math.min(this.cover, clamp(1 - (d - 24) / 260, 0, 1));
        if (this.cover <= 0) this.coverFrom = null;
      }
      return;
    }
    if (this.veilFrom) {
      const d = Math.hypot(p.x - this.veilFrom.x, p.y - this.veilFrom.y);
      this.veilK = Math.min(this.veilK, clamp(1 - (d - 20) / 300, 0, 1));
      mj.setCore(this.veilK, this.veilFrom);   // 第五轮返工：门洞那团云裹着落脚处，整屏只是一层薄雾
      if (this.veilK <= 0.003) { mj.setCore(0, null); this.veilFrom = null; }
    }
    if (g.offWorld) { this.near = null; this.k = 0; this.cover = 0; return; }
    // 附近的画
    let best: Scroll | null = null, bd = 1e9;
    for (const s of this.scrolls()) { const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } }
    this.near = bd < 4000 ? best : null;
    const s = this.near;
    // 走进画里的程度：过了墨线才涨；飞在半空不算（落在画前才进得去）
    let k = 0;
    if (s && Math.abs(p.x - s.x) < s.w / 2 + 30 && (p.z ?? 0) < 60) k = clamp((s.y + LINE - p.y) / RUN, 0, 1);
    if (!this.armed && k <= 0.05) this.armed = true;
    // 第五轮返工：人走到画前、往墨线去的这一两秒，把画里那处秘境生成好、地面和贴图备好（换进去那一刻不再卡一下）
    if (s && this.armed && Math.abs(p.x - s.x) < s.w / 2 + 200 && p.y > s.y && p.y < s.y + LINE + 520) mj.warm(s.spec);
    this.k = this.armed ? k : 0;
    this.cover = this.k;
    if (s && this.armed && this.k >= 0.999) this.enter(s, true);
  }

  /** 走进画里：换到画中那处秘境（MijingSys.enter：没打完出来过的，接着原样）；from：是不是自己走进来的（是：画还盖着屏幕，往外走才散） */
  enter(s: Scroll, walked: boolean) {
    const g = this.game, mj = g.mijing, f = g.ws.flags as { hjIn?: unknown };
    if (mj.active) return;
    // 出来时落在画前、墨线外一步（不会一出来又被吸回去）
    const bx = s.x, by = s.y + LINE + 60;
    mj.enter(s.spec);
    if (!mj.cur) return;
    mj.cur.back = { x: bx, y: by, flying: false };
    this.cur = s; this.k = 0;
    f.hjIn = { id: s.id, spec: s.spec, bx, by };
    if (walked) { this.cover = 1; this.coverFrom = { x: g.player.x, y: g.player.y }; } else { this.cover = 0; this.coverFrom = null; }
  }
}

/** 洞府里挂的古画：每幅一个种子，画里的山水、妖物、宝物都按它生 */
export function homeScroll(x: number, y: number, seed: number): Scroll {
  const names = ['万壑松风', '寒江独钓', '早春', '秋山问道', '雪景寒林', '江山如画'];
  const nm = names[seed % names.length];
  return { id: 'home-' + seed, map: ACTIVE_MAP, name: nm, x, y, w: 200, h: 270,
    spec: { name: `画中洞天·${nm}`, tier: 1, theme: 'shanshui', seed: (seed * 7919 + hashStr(nm)) >>> 0, floors: 1, rooms: 3 + (seed % 3), lv: 2 + (seed % 4), size: 1.15 + (seed % 3) * 0.15 } };
}
