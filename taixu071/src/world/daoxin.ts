// 第五十一步「天道」：道心难度分层（天骄 / 凡人 / 天道）· 死亡即碑与前世继承 · 资源限供 · 灵草争夺
//
// 核心原则：时间难度（天道节奏）已经压到原著水平，本版加的是**风险难度**与**决策难度**——
// 不加倍修为需求，而是让世界上的东西有数、让死有牙齿、让「强」有代价。
// 全部长在既有骨架上：market/town 的坊市货、nodes 的灵草、living 的销赃、relations 的恩怨、renxin 的随笔。

import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import type { DaoState, DaoTier, Stele, StolenBag } from './worldstate';
import { DAO_TIERS, DAO_TIER_IDX, SECT_RANKS, daoTierName, daoTierOf } from './worldstate';
import type { NpcData, Pers } from './npc';
import { makeName } from './npc';
import * as C from './cultivation';
import { itemDef } from '../data/items';
import { REALMS, realmName } from '../data/realms';
import { ACTIVE_MAP, LOCATIONS, MAP_NAME, WORLD_SCALE, LocDef, MapId, migrateHumanPoint } from '../data/world';
import { LEGACY_HUMAN_MAP_IDS, type LegacyHumanMapId } from '../data/worldHierarchy';
import { ZONE_NAME, cityTier, pzOf, zoneOfLoc, type PZone } from '../data/market';
import { foeRealm } from './demog';
import type { GatherNode } from './nodes';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { CharState, drawCharacter, randomLook, Look } from '../gfx/character';
import { BEAUTIES } from '../data/beauties';
import { audio } from './audio';
import { ZHUJI_HERBS, supplyOfZone, limitedItem, quotaSupplyIn } from './quota';
export * from './quota';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// 产量 / 月限的纯函数台账在 ./quota（坊市发货与节奏模拟 tools/test-tiandao.ts 共用一份，别处不再各算各的）
export const STELE_KEY = 'fanren.steles.v1';
export const DAO_KEY = 'fanren.daoxin';
const SAVE_KEYS = ['fanren_save_auto', 'fanren_save_1', 'fanren_save_2', 'fanren_save_3', 'fanren_step1_save'];
const MONTH = 30;

// ------------------------------------------------------------------ 灵草争夺
interface Contest {
  id: number; x: number; y: number; look: Look; st: CharState;
  name: string; realm: number; stage: number; pers: Pers; npcId: string;
  got: { item: string; n: number; age?: number }[];
  node: GatherNode; t: number; done: boolean;
}

export class DaoxinSys {
  game: Game;
  contests: Contest[] = [];
  focus: Contest | null = null; focusD = 1e9;
  steleFocus: Stele | null = null; steleFocusD = 1e9;
  private cid = 1;
  private noticeMonth = -1;

  constructor(g: Game) { this.game = g; }

  // ========================================================================
  // 3.2 道心难度分层——保自由度的标准答案：只可上调，不可下调
  // ========================================================================
  get st(): DaoState {
    const ws = this.game.ws;
    return (ws.dao ??= { tier: 'fanren', chosen: 0, quota: { m: -1, led: {} } });
  }
  get tier(): DaoTier { return this.st.tier ?? 'fanren'; }
  tierName() { return daoTierName(this.tier); }
  tierDef() { return daoTierOf(this.tier); }
  /** 天骄（剧情党）/ 凡人（默认推荐）/ 天道（单档盖写、死亡即碑） */
  is(t: DaoTier) { return this.tier === t; }
  hardcore() { return this.tier === 'tiandao'; }
  /** 战败重做、骗局池、资源限供是否全开 */
  quotaOn() { return this.tier !== 'tianjiao'; }

  /** 骗局频率系数：天骄档稀少，凡人档满开，天道档还要再凶一点 */
  scamMul() { return this.tier === 'tianjiao' ? 0.55 : this.tier === 'tiandao' ? 1.18 : 1; }
  /** 战败时被搜走的储物袋比例 */
  bagFrac(): [number, number] { return this.tier === 'tianjiao' ? [0.35, 0.6] : this.tier === 'tiandao' ? [0.85, 1] : [0.7, 1]; }
  /** 道伤天数系数 */
  hurtMul() { return this.tier === 'tianjiao' ? 0.55 : this.tier === 'tiandao' ? 1.25 : 1; }
  /** 天骄的补偿：道心通明（冲关 +8%），不加修为速度，免得破坏天道节奏 */
  breakBonus() { return this.tier === 'tianjiao' ? 0.08 : 0; }
  /** 天道档：战败有几率重伤不治（死亡即碑） */
  lethalChance(humanFoe: boolean, mortalEnemy: boolean) {
    if (this.tier !== 'tiandao') return 0;
    return mortalEnemy ? 1 : humanFoe ? 0.22 : 0.12;
  }
  /** 是否允许从存档点回溯复活 */
  reviveAllowed() { return this.tier !== 'tiandao'; }
  /** 天道档：本世只有一条命——不留备份，也不读备份（存档码 / 万民卷宗一并封住，
   *  否则「单存档自动盖写、死亡即碑」就是一句空话：打不过之前导一份，死了再导回来） */
  backupAllowed() { return this.tier !== 'tiandao'; }
  /** 备份被道心挡下来时的说法 */
  backupRefusal(act: '存' | '取'): string {
    return act === '存'
      ? '天道档：这一世只有一条命，留不下第二份。你陨落之处会立起一座碑——那才是你的存档。'
      : '天道档：不走回头路。取回旧页，等于把已经走完的路重走一遍，道心不许（要留备份，当初就别把道心砥砺到天道）。';
  }
  /** 机缘报酬 */
  rewardMul() { return this.tier === 'tianjiao' ? 1.15 : this.tier === 'tiandao' ? 0.92 : 1; }

  /** 立道心：只可上调（天骄 → 凡人 → 天道），不可下调 */
  setTier(t: DaoTier, silent = false): boolean {
    const cur = DAO_TIER_IDX[this.tier] ?? 1, nxt = DAO_TIER_IDX[t] ?? 1;
    if (nxt < cur) {
      if (!silent) this.game.toast(`道心已立，岂可反悔？（${this.tierName()}档不能降回${daoTierName(t)}）`, 'warn');
      return false;
    }
    if (nxt === cur) return true;
    this.st.tier = t; this.st.chosen = Math.floor(this.game.day); this.st.raised = (this.st.raised ?? 0) + 1;
    try { localStorage.setItem(DAO_KEY, t); } catch { /* */ }
    if (t === 'tiandao') {
      // 连旧版兼容档也不能留下；并立刻盖写唯一自动档，不能等下一个二十秒存档周期。
      try { for (const k of SAVE_KEYS) if (k !== 'fanren_save_auto') localStorage.removeItem(k); } catch { /* */ }
      this.game.save(0);
      this.game.toast('道心砥砺至「天道」：此后只有一座自动存档，随时盖写；陨落之处立碑，本世即终。', 'warn');
      this.game.rel?.log('你立下天道之誓——单档盖写，死亡即碑。江湖上再没有回头路。', 'bad');
      audio.sfx('break');
    } else if (!silent) {
      this.game.toast(`道心已立：「${daoTierName(t)}」。战败、骗局与货源都按此档行事（不可再降）。`, 'good');
    }
    this.game.renxin?.recordExp2?.('dao_oath' as any, 'see', `道心·${daoTierName(t)}`, `你在${Math.floor(this.game.day / 360) + 1}年立下「${daoTierName(t)}」道心，此后凶险与机缘都按此档行事。`);
    return true;
  }

  /** 开局选道心（与入魔 / 正道之选放在一起） */
  chooseNode(back?: () => DNode): DNode {
    const g = this.game;
    const opt = (t: DaoTier): DOpt => {
      const d = daoTierOf(t);
      return {
        label: `${d.name}　——　${d.short}`,
        tone: t === 'tiandao' ? 'bad' : t === 'fanren' ? 'gold' : 'good',
        hint: this.tier === t ? '（当前道心）' : DAO_TIER_IDX[t] < DAO_TIER_IDX[this.tier] ? '道心只可上调，此档已回不去' : d.warn ?? '',
        disabled: DAO_TIER_IDX[t] < DAO_TIER_IDX[this.tier],
        act: () => { this.setTier(t); return back ? back() : null; },
      };
    };
    return {
      speaker: '', title: '立道心', mood: 'mystic',
      text: `入道之前，先问自己一句：这一世，你要走哪条路？\n\n道心一立，天地便照它待你——选「天骄」，世界对你客气些；选「凡人」，你走的是苏寒走过的那条路；选「天道」，死了就是死了。\n\n（当前道心：${this.tierName()} · 只可上调，不可下调）`,
      options: [...DAO_TIERS.map((t) => opt(t.id)), { label: '（再想想）', act: () => null }],
    };
  }

  /** 角色面板 / 菜单里的「砥砺道心」 */
  raiseNode(): DNode {
    const up = DAO_TIERS.filter((t) => DAO_TIER_IDX[t.id] > DAO_TIER_IDX[this.tier]);
    return {
      speaker: '', title: '砥砺道心', mood: 'danger',
      text: up.length === 0
        ? `你已立在「${this.tierName()}」之上，人界再无更险的路。\n\n（天道档：单存档自动盖写，陨落即碑，本世即终。）`
        : `当前道心「${this.tierName()}」。\n\n道心只可上调，不可下调——往上调一档，战败更疼、骗局更多、货源更紧。${up.map((u) => `\n\n【${u.name}】${u.desc}`).join('')}`,
      options: [
        ...up.map((u) => ({ label: `砥砺至「${u.name}」`, tone: (u.id === 'tiandao' ? 'bad' : 'gold') as DOpt['tone'], hint: u.warn, act: () => { this.setTier(u.id); return null; } })),
        { label: '（罢了）', act: () => null },
      ],
    };
  }

  /** 新局开始时读取上次选定的道心（标题画面写入 localStorage） */
  adoptChosen() {
    try {
      const t = localStorage.getItem(DAO_KEY) as DaoTier | null;
      if (t && DAO_TIER_IDX[t] !== undefined) this.st.tier = t;
    } catch { /* */ }
    this.st.chosen = Math.floor(this.game.day);
  }

  // ========================================================================
  // 3.4 资源限供——坊市按月按产区发货；筑基丹主药全南荒一年就出那么多株
  // ========================================================================
  private month() { return Math.floor(this.game.day / MONTH); }
  private led(): Record<string, number> {
    const q = (this.st.quota ??= { m: -1, led: {} });
    if (q.m !== this.month()) { q.m = this.month(); q.led = {}; }
    return q.led;
  }
  /** 本月该产区该物的总产量（株 / 颗 / 件） */
  supplyOf(pz: PZone, id: string, month = this.month()): number { return supplyOfZone(pz, id, month); }
  /** 这件货是否受月限 */
  limited(id: string): boolean { return limitedItem(id); }
  /** 建店时按月限发货：发罄的货直接不上架（掌柜会告诉你本月已罄） */
  applyQuota(stock: { id: string; n: number; quota?: number }[], l: LocDef): string[] {
    if (!this.quotaOn()) return [];
    const pz = pzOf(zoneOfLoc(l)), led = this.led(), T = cityTier(l);
    const out: string[] = [];
    for (let i = stock.length - 1; i >= 0; i--) {
      const s = stock[i];
      if (!this.limited(s.id)) continue;
      const key = pz + '|' + s.id;
      const sup = quotaSupplyIn(pz, s.id, this.month(), T);   // 城越大，分到的月货越多
      const left = sup - (led[key] ?? 0);
      if (left <= 0) { out.push(itemDef(s.id).name); stock.splice(i, 1); continue; }
      if (s.n > left) s.n = left;
      s.quota = left;
    }
    return out;
  }
  /** 买走一件限量货：记入本月台账（全产区共用，别家铺子也就没了） */
  useQuota(l: LocDef | undefined | null, id: string, n = 1) {
    if (!this.quotaOn() || !l || !this.limited(id)) return;
    const key = pzOf(zoneOfLoc(l)) + '|' + id;
    const led = this.led();
    led[key] = (led[key] ?? 0) + n;
  }
  /** 本月已发罄的货（掌柜的一句话） */
  soldOutHere(l: LocDef): string[] {
    if (!this.quotaOn()) return [];
    const pz = pzOf(zoneOfLoc(l)), led = this.led(), T = cityTier(l);
    const out: string[] = [];
    for (const id of ['herb_zihou', 'herb_tianling', 'pill_zhuji', 'herb_lingzhi', 'pill_juling']) {
      const sup = quotaSupplyIn(pz, id, this.month(), T);
      if (sup > 0 && (led[pz + '|' + id] ?? 0) >= sup) out.push(itemDef(id).name);
    }
    return out;
  }
  quotaNote(l: LocDef): string {
    if (!this.quotaOn()) return '';
    const z = ZONE_NAME[zoneOfLoc(l)] ?? '本地';
    const so = this.soldOutHere(l);
    return `${z}灵药按月有数（限量供货）${so.length ? `，本月${so.join('、')}已罄` : ''}。`;
  }
  /** 每月一日的市声：新货到了 */
  daily(days: number) {
    void days;
    const m = this.month();
    if (this.noticeMonth < 0) { this.noticeMonth = m; return; }
    if (m !== this.noticeMonth) {
      this.noticeMonth = m;
      if (this.quotaOn() && Math.random() < 0.55) {
        const px = this.game.player?.x ?? 0, py = this.game.player?.y ?? 0;
        const nearLoc = LOCATIONS.reduce((best, l) => (Math.hypot(l.x * WORLD_SCALE - px, l.y * WORLD_SCALE - py) < Math.hypot(best.x * WORLD_SCALE - px, best.y * WORLD_SCALE - py) ? l : best), LOCATIONS[0]);
        const pz = pzOf(zoneOfLoc(nearLoc));
        this.game.toast(`新月伊始，${ZONE_NAME[pz === 'TN' ? 'tiannan' : pz === 'LX' ? 'luanxing' : 'dajin'] ?? '人界'}各处坊市重新发了一批灵药——上月发罄的货，这个月才有。`, 'info');
      }
    }
  }

  // ========================================================================
  // 3.4 灵草争夺——你采到一半，另一道神识也锁定了这里（赤霄禁地的味道洒进整个开放世界）
  // ========================================================================
  /** 采集结算时调用：返回 true 表示这批灵草被争夺接管了（尚未入袋） */
  contestGather(node: GatherNode, got: { item: string; n: number; age?: number }[]): boolean {
    const g = this.game;
    if (!this.quotaOn() || g.hero.dead || !got.length) return false;
    if (g.combat.enemies.length > 0) return false;
    const st = this.st;
    if ((st.contest ?? -99) > g.day - 12) return false;
    const it = itemDef(node.item);
    const precious = it.tier >= 3 || (node.kind === 'herb' && ZHUJI_HERBS.has(node.item)) || got.some((x) => (x.age ?? 0) >= 120);
    if (node.kind !== 'herb' && !precious) return false;
    if (!precious && it.tier < 2) return false;
    for (const l of LOCATIONS) if (l.map === ACTIVE_MAP && Math.hypot(l.x * WORLD_SCALE - node.x, l.y * WORLD_SCALE - node.y) < 3200) return false;
    const chance = (precious ? 0.34 : 0.2) * (this.tier === 'tiandao' ? 1.25 : 1);
    if (Math.random() > chance) return false;

    st.contest = Math.floor(g.day);
    st.contests = (st.contests ?? 0) + 1;
    const p = g.player;
    const rs = foeRealm(g, node.x, node.y, 'rogue', Math.random, Math.max(1, g.hero.realm - 1), g.hero.realm + 1);
    const pers: Pers = pick<Pers>(['greedy', 'greedy', 'ruthless', 'cautious']);
    let s0 = Math.floor(Math.random() * 1e9);
    const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    const d = this.mkNpc({
      name: makeName(rnd, rnd() < 0.3 ? 'f' : 'm'), realm: rs.realm, stage: rs.stage, pers,
      faction: 'rogue', x: node.x + rand(-160, 160), y: node.y + rand(-110, 110),
      why: `为${it.name}而来`,
    });
    const cx: Contest = {
      id: this.cid++, x: d.x, y: d.y, look: (randomLook as any)(rnd, d.role as any), st: new CharState(d.x, d.y),
      name: d.name, realm: d.realm, stage: d.stage, pers, npcId: d.id, got, node, t: 0, done: false,
    };
    this.contests.push(cx);
    st.pending = { items: got, npcId: d.id, name: cx.name };   // 灵草守恒：未结算前先记账（走远归他 / 读档归你 / 陨落入碑）
    const near = Math.hypot(cx.x - p.x, cx.y - p.y);
    g.renderer?.burst(node.x, node.y - 20, '#ffd98a');
    audio.sfx('whoosh');
    g.toast(near < 900 ? `另一道神识也锁定了这里——${cx.name}（${realmName(cx.realm, cx.stage)}）自林间转出，目光落在那株${it.name}上。` : `你察觉一道神识自远处扫过这片山坡，锁定了同一株${it.name}。`, 'warn');
    g.openDialog(this.contestNode(cx));
    return true;
  }

  private contestNode(cx: Contest): DNode {
    const g = this.game, h = g.hero;
    const it = itemDef(cx.node.item);
    const strong = h.realm >= cx.realm + 1 || (h.realm === cx.realm && h.stage >= cx.stage + 4);
    const goods = cx.got.map((x) => `${itemDef(x.item).name}${x.age && itemDef(x.item).type !== 'herb' ? `（${x.age}年）` : ''}×${x.n}`).join('、');
    const end = (next?: DNode | null) => next ?? null;
    const give = (frac: number, why: string) => {
      cx.done = true; this.dropContest(cx);
      const rd = g.npcs.byId.get(cx.npcId);
      const mine: string[] = [], left: string[] = [];
      for (const x of cx.got) {
        if (x.n <= 0) continue;
        // 你所得与他取走之和严格等于原采集数；他的那一半仍按 v0.51.3 真进其储物袋。
        const n = Math.min(x.n, Math.max(1, Math.round(x.n * frac)));
        C.addItem(h, x.item, n, x.age);
        mine.push(`${itemDef(x.item).name}${x.age && itemDef(x.item).type !== 'herb' ? `（${x.age}年）` : ''}×${n}`);
        const rest = x.n - n;
        if (rest > 0) {
          left.push(`${itemDef(x.item).name}×${rest}`);
          if (rd && rd.alive) { rd.bag ??= {}; rd.bag[x.item] = (rd.bag[x.item] ?? 0) + rest; }
        }
      }
      if (this.st.pending?.npcId === cx.npcId) this.st.pending = undefined;
      g.toast(`你与${cx.name}讲定了：${why}。你得 ${mine.join('、') || '寸草未得'}${left.length ? `，他取走 ${left.join('、')}` : ''}。`, 'good');
      g.renxin?.recordExp2('herb_contest' as any, 'see', '灵草之争·讲价', `在山野与人同争一株${it.name}，以言语讲定分成——修仙界的资源从来是有数的。`);
      g.updateUI(true);
      return null;
    };
    const fight = () => {
      cx.done = true;   // 先留在场上：打赢之后灵草与他的储物袋一并结算（onContestWon）
      const e = this.toEnemy(cx);
      g.combat.enemies.push(e);
      g.toast(`${cx.name}冷笑一声，祭出法器：「那就手底下见真章！」`, 'warn');
      audio.sfx('sword');
      return null;
    };
    const opts: DOpt[] = [];
    opts.push({
      label: `「道友也看中这株${it.name}？不如各取一半。」`, tone: 'good',
      hint: cx.pers === 'ruthless' ? '狠辣之人未必肯讲理' : cx.pers === 'greedy' ? '贪婪之人要得多些' : '谨慎之人多半肯分',
      act: () => {
        const ok = clamp(0.62 + (cx.pers === 'ruthless' ? -0.3 : cx.pers === 'cautious' ? 0.18 : 0.05) + (strong ? 0.22 : 0) + (g.ws.cred ?? 60) / 400, 0.08, 0.95);
        if (Math.random() < ok) return end(give(cx.pers === 'greedy' ? 0.45 : 0.55, cx.pers === 'greedy' ? '他要六成，你得四成半' : '对半分'));
        return end({
          speaker: cx.name, title: `${realmName(cx.realm, cx.stage)} · ${cx.pers === 'ruthless' ? '神色狠戾' : '眼里全是那株灵药'}`, look: cx.look, mood: 'danger',
          text: `「分？」他嗤笑一声，袖中法器已自鸣响，「天材地宝，有德者居之——道友，你的德，够么？」`,
          options: [{ label: '（动手！）', tone: 'bad', act: fight }, { label: '让与他，抽身而走', hint: '江湖信义 +1，吃一堑长一智', act: () => { cx.done = true; this.dropContest(cx); this.rivalTakes(cx, false); g.jianghu?.addCred?.(1, '灵草相让'); g.renxin?.recordExp2('herb_contest' as any, 'loss', '灵草之争·相让', `一株${it.name}被${cx.name}强夺而去。你记下了：讲理讲不通的时候，多半是因为拳头不够硬。`); return null; } }],
        } as DNode);
      },
    });
    if (strong) opts.push({
      label: '（神识直压其丹田）「此物我势在必得。」', tone: 'gold', hint: '境界压得住他：他会让，但可能记恨',
      act: () => {
        cx.done = true; this.dropContest(cx);
        for (const x of cx.got) C.addItem(h, x.item, x.n, x.age);
        if (this.st.pending?.npcId === cx.npcId) this.st.pending = undefined;
        const d = g.npcs.byId.get(cx.npcId);
        if (d && Math.random() < 0.4) { d.favor = clamp(d.favor - 25, -100, 100); d.grudge = Math.max(d.grudge, 1); d.why = `被你以神识压夺${it.name}`; g.rel?.log(`${cx.name}被你以神识压走灵药，面上赔笑，心里记下了。`, 'bad'); }
        g.toast(`你的神识如岳压顶，${cx.name}面色一白，拱手退开——${goods}尽入你手${d && d.grudge >= 1 ? '（他记恨上了）' : ''}。`, 'good');
        g.renxin?.recordExp2('herb_contest' as any, 'see', '灵草之争·神识压制', `以神识压退同争${it.name}的修士。境界高一头，山里的规矩便由你写。`);
        g.updateUI(true);
        return null;
      },
    });
    opts.push({ label: '让与他，转身就走', hint: '不结怨；江湖信义 +2', act: () => { cx.done = true; this.dropContest(cx); this.rivalTakes(cx, false); g.jianghu?.addCred?.(2, '灵草相让'); g.toast(`你把${it.name}让与${cx.name}，他愣了一愣，抱拳道：「道友高义，日后相见，自当报还。」（江湖信义 +2）`, 'good'); return null; } });
    opts.push({ label: '抢！（祭出法器）', tone: 'bad', hint: '赢了连他的储物袋一起拿；信义 -3、正道声望 -2，他若活着便结下梁子', act: fight });
    return {
      speaker: cx.name, title: `${realmName(cx.realm, cx.stage)} · 散修`, look: cx.look, mood: 'danger',
      text: `你指尖刚触到${it.name}的叶子，身后传来一声轻咳。\n\n「道友慢着。」一个${cx.pers === 'ruthless' ? '面容瘦削、目光如刀' : '衣着寻常'}的修士自林间转出，神识毫不掩饰地落在那株灵药上，「这株${it.name}，我三个月前就盯上了。」\n\n（他：${realmName(cx.realm, cx.stage)}　你：${realmName(h.realm, h.stage)}）`,
      options: opts,
    };
  }

  private toEnemy(cx: Contest): Enemy {
    const def = cx.realm >= 3 ? ENEMIES.jindan_mo ?? ENEMIES.zhujixiu : cx.realm >= 2 ? ENEMIES.zhujixiu : ENEMIES.bandit;
    const e = new Enemy(def, cx.x, cx.y, clamp(cx.realm, 1, 5), clamp(cx.stage, 0, REALMS[clamp(cx.realm, 1, 5)].hp.length - 1));
    e.name = cx.name; e.hx = cx.x; e.hy = cx.y; e.npcId = cx.npcId; e.yieldAt = 0.12;
    return e;
  }

  /** 造一个真名册 NPC（灵草争夺的对手、前世之碑的凶手都用它）——恩怨网、销赃链原样接住后果 */
  mkNpc(o: { name?: string; realm: number; stage: number; pers: Pers; faction?: NpcData['faction']; x: number; y: number; map?: MapId; bag?: Record<string, number>; wealth?: number; why?: string; id?: string; favor?: number; grudge?: number; sect?: string }): NpcData {
    const g = this.game;
    let s0 = Math.floor(Math.random() * 1e9);
    const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    const map = o.map ?? ACTIVE_MAP;
    const loc = LOCATIONS.filter((l) => l.map === map).sort((a, b) => Math.hypot(a.x * WORLD_SCALE - o.x, a.y * WORLD_SCALE - o.y) - Math.hypot(b.x * WORLD_SCALE - o.x, b.y * WORLD_SCALE - o.y))[0];
    const realm = clamp(o.realm, 1, 5), stage = clamp(o.stage, 0, REALMS[realm].stages.length - 1);
    const d: NpcData = {
      id: o.id ?? `dx_${Math.floor(g.day)}_${Math.floor(rnd() * 1e6)}`,
      name: o.name ?? makeName(rnd, rnd() < 0.3 ? 'f' : 'm'),
      sex: rnd() < 0.3 ? 'f' : 'm', role: realm >= 3 ? 'elder' : 'cultivator',
      realm, stage, faction: o.faction ?? 'rogue', sect: o.sect, home: loc?.id ?? 'kuangye',
      pers: o.pers, favor: o.favor ?? 0, shown: o.favor ?? 0, grudge: o.grudge ?? 0, met: false, alive: true,
      age: 20 + rnd() * REALMS[realm].life * 0.5, life: REALMS[realm].life * (0.9 + rnd() * 0.2),
      x: o.x, y: o.y, tx: o.x, ty: o.y, goal: 'stay', until: 0,
      wealth: o.wealth ?? Math.round(30 * Math.pow(4, realm) * (0.5 + rnd())), seed: Math.floor(rnd() * 1e9),
      map, bag: o.bag ?? {}, bio: o.why ? [{ d: Math.floor(g.day), t: o.why }] : [],
    };
    d.shown = g.renxin?.shownFavor?.(d) ?? d.favor;
    g.npcs.list.push(d); g.npcs.byId.set(d.id, d);
    return d;
  }

  private dropContest(cx: Contest) { const i = this.contests.indexOf(cx); if (i >= 0) this.contests.splice(i, 1); if (this.focus === cx) { this.focus = null; this.focusD = 1e9; } }

  /** v0.51.3 灵草守恒：不争而别，灵药归他——真进他的储物袋（日后杀他，lootOf 照掉），不再凭空蒸发 */
  private rivalTakes(cx: Contest, fled: boolean) {
    const g = this.game;
    const d = g.npcs.byId.get(cx.npcId);
    if (d && d.alive) for (const x of cx.got) d.bag[x.item] = (d.bag[x.item] ?? 0) + x.n;
    if (this.st.pending?.npcId === cx.npcId) this.st.pending = undefined;
    if (fled) {
      g.toast(`你走得远了。再回头时，${cx.name}已把那株${itemDef(cx.node.item).name}采入囊中，遁光而去。`, 'warn');
      g.renxin?.recordExp2('herb_contest' as any, 'loss', '灵草之争·失手', `采到一半的${itemDef(cx.node.item).name}被${cx.name}得了去——既不谈、也不让、也不动手，转身就走，东西自然是别人的。`);
    }
  }

  /** 打赢了争夺的对手：连他的储物袋一起拿（信义 / 声望照实记账） */
  onContestWon(e: Enemy) {
    const g = this.game;
    // 所有击杀都会经过这里：只有已选择动手的争夺对手才结算；普通击杀与重复 onKill 零副作用。
    const cx = this.contests.find((c) => c.done && !!e.npcId && c.npcId === e.npcId);
    if (!cx) return;
    for (const x of cx.got) C.addItem(g.hero, x.item, x.n, x.age);
    this.dropContest(cx);
    if (this.st.pending?.npcId === e.npcId) this.st.pending = undefined;
    const d = e.npcId ? g.npcs.byId.get(e.npcId) : null;
    const stones = d ? Math.min(d.wealth, Math.round(d.wealth * 0.8)) : rint(20, 80);
    if (stones > 0) { C.addItem(g.hero, 'mat_lingshi', stones); if (d) d.wealth -= stones; }
    g.jianghu?.addCred?.(-3, '抢夺灵草');
    g.ws.rep = clamp(g.ws.rep - 2, -100, 100);
    g.toast(`你夺下${e.name}的储物袋：灵石 ${stones}。此举传开，江湖上有人说你行事狠辣。（信义 -3、声望 -2）`, 'warn');
    g.renxin?.recordExp2('herb_contest' as any, 'loss', '灵草之争·动手', `为灵草与${e.name}动了手。东西拿到了，名声也坏了一点——修仙界里，抢来的机缘总要在别处还。`);
    g.updateUI(true);
  }

  // ========================================================================
  // 天道档：死亡即碑 · 下一世的世界里能遇到那座碑，和那个杀你的人
  // ========================================================================
  // v0.51.3：碑林读取按原文缓存——update / collect 每帧都要问一次碑，
  // 不能每帧 JSON.parse 一遍 localStorage（九座碑连碑文带遗物清单，白烧主线程）。
  // 原文变了（这一世立了新碑 / 另一页写入）缓存自然失效，跨世跨页仍然一致。
  private static _slRaw: string | null | undefined = undefined;
  private static _slArr: Stele[] = [];
  static readAll(): Stele[] {
    try {
      const raw = localStorage.getItem(STELE_KEY);
      if (raw === DaoxinSys._slRaw) return DaoxinSys._slArr;
      DaoxinSys._slRaw = raw;
      if (!raw) { DaoxinSys._slArr = []; return DaoxinSys._slArr; }
      const a = JSON.parse(raw);
      DaoxinSys._slArr = Array.isArray(a)
        ? a.filter((s) => s && s.ver === 'v0.51').map((s: Stele) => {
            if (typeof s.map === 'string' && (LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(s.map)) {
              const [rx, ry] = migrateHumanPoint(s.map as LegacyHumanMapId, s.x / WORLD_SCALE, s.y / WORLD_SCALE);
              return { ...s, map: 'renjie' as MapId, x: rx * WORLD_SCALE, y: ry * WORLD_SCALE };
            }
            return s;
          })
        : [];
      return DaoxinSys._slArr;
    } catch { return []; }
  }
  static writeAll(a: Stele[]) {
    const cut = a.slice(0, 9);
    try {
      localStorage.setItem(STELE_KEY, JSON.stringify(cut));
      DaoxinSys._slRaw = localStorage.getItem(STELE_KEY);
      DaoxinSys._slArr = cut.filter((s) => s && s.ver === 'v0.51');
    } catch { DaoxinSys._slRaw = undefined; }
  }
  allSteles() { return DaoxinSys.readAll(); }
  stelesHere(): Stele[] { return DaoxinSys.readAll().filter((s) => (s.map || 'renjie') === ACTIVE_MAP); }
  /** v0.52：把一座碑的改动写回碑林（碑前香火 / 前世之仇已报）。 */
  writeStele(s: Stele) {
    const all = DaoxinSys.readAll();
    const i = all.findIndex((x) => x.id === s.id);
    if (i >= 0) { all[i] = s; DaoxinSys.writeAll(all); }
  }

  /** 本世陨落：刻碑。碑文就是 bio 系统现成的生平。 */
  onTrueDeath(killer: string, cause: string, killerId?: string, extraDrops?: { id: string; n: number }[]): Stele {
    const g = this.game, h = g.hero, p = g.player;
    const day = Math.floor(g.day);
    const near = LOCATIONS.filter((l) => l.map === ACTIVE_MAP).sort((a, b) => Math.hypot(a.x * WORLD_SCALE - p.x, a.y * WORLD_SCALE - p.y) - Math.hypot(b.x * WORLD_SCALE - p.x, b.y * WORLD_SCALE - p.y))[0];
    const place = near ? `${MAP_NAME[ACTIVE_MAP]}·${near.name}以西${dirKm(near, p)}里` : `${MAP_NAME[ACTIVE_MAP]}荒野`;
    const hearts = BEAUTIES.filter((b) => g.ws.hearts[b.id]?.met).map((b) => b.name);
    const notes = (g.ws.exp2 ?? []).slice(-4).map((e) => `【${e.title}】${e.text}`);
    // 遗物：储物袋里的一切（装备栏与贴身之物随葬）
    const CUR_IDS = new Set(['mat_lingshi', 'mat_lingjing', 'mat_xianyuan']);
    const items: { id: string; n: number; age?: number }[] = h.bag.filter((b) => !CUR_IDS.has(b.id)).map((b) => ({ id: b.id, n: b.n, age: b.age }));
    // v0.51.3：争夺未结算就陨落——荒野上那把灵药他也一并捡了去（随遗物入碑，下一世照样追得回）
    const pend = this.st.pending;
    if (pend?.items?.length) { for (const x of pend.items) items.push({ id: x.item, n: x.n, age: x.age }); this.st.pending = undefined; }
    // v0.71：脚边受保护的补发掉落（背包拒收后留在原地、没来得及拾起）也一并随葬，合并同名条目
    let extraMerged = 0;
    if (extraDrops?.length) {
      for (const x of extraDrops) {
        if (!x || typeof x.id !== 'string' || !x.id || !Number.isFinite(x.n) || x.n <= 0) continue;
        const had = items.find((it) => it.id === x.id);
        if (had) had.n += x.n; else items.push({ id: x.id, n: x.n });
        extraMerged++;
      }
    }
    const stones = C.bagCount(h, 'mat_lingshi') + C.bagCount(h, 'mat_lingjing') * 1000 + C.bagCount(h, 'mat_xianyuan') * 10000;
    const bio: string[] = [
      `${h.name ?? '苏寒'}，${C.rootDef(h).name}，${C.gongfaDef(h).name ?? '杂修'}。`,
      `${Math.floor(day / 360) + 1}年${(day % 360) / 30 + 1 | 0}月，${cause}，殁于${place}，年${Math.floor(h.age)}岁，${realmName(h.realm, h.stage)}。`,
      g.ws.sect ? `${sectTitle(g.ws.sect.id)}${SECT_RANK_NAME[g.ws.sect.rank] ?? ''}，正道声望 ${g.ws.rep}，江湖信义 ${g.ws.cred ?? 60}。` : `一生未入宗门，散修到底。正道声望 ${g.ws.rep}，江湖信义 ${g.ws.cred ?? 60}。`,
      `平生斩敌 ${h.kills ?? 0}，${hearts.length ? `与${hearts.join('、')}有过一段情缘` : '孤身一人走完这条路'}。`,
      `殁于${killer}之手。储物袋（灵石 ${stones}、${items.length} 件物事）落在其手中。`,
    ];
    if (extraMerged) bio.push(`脚边尚散着 ${extraMerged} 件未及拾起的物事，也随你入了土，下一世在碑前寻得。`);
    const s: Stele = {
      id: Date.now() % 1e9, ver: 'v0.51', name: h.name ?? '苏寒', root: C.rootDef(h).name, gongfa: C.gongfaDef(h).name ?? '杂修',
      realm: realmName(h.realm, h.stage), age: Math.floor(h.age), day, year: Math.floor(day / 360) + 1,
      map: ACTIVE_MAP, x: Math.round(p.x), y: Math.round(p.y), place,
      sect: g.ws.sect?.id ?? null, rank: g.ws.sect ? SECT_RANK_NAME[g.ws.sect.rank] : undefined,
      rep: g.ws.rep, cred: g.ws.cred ?? 60, kills: h.kills ?? 0, tier: this.tier,
      killer, killerId, cause, bio, notes, legacy: { stones, items }, when: Date.now(),
    };
    const all = DaoxinSys.readAll();
    all.unshift(s);
    DaoxinSys.writeAll(all);
    this.st.deaths = (this.st.deaths ?? 0) + 1;
    // 本世所有入口一并封死，尤其不能只删自动档而留下 v1 的 fanren_step1_save。
    try {
      for (const k of SAVE_KEYS) localStorage.removeItem(k);
      sessionStorage.removeItem('fanren.resume');
    } catch { /* */ }
    return s;
  }

  /** 碑前：本世终结，另起一世（碑与凶手都留在下一世的世界里） */
  deathNode(s: Stele): DNode {
    return {
      speaker: '', title: '天道 · 碑', mood: 'danger',
      text: `${s.cause}。\n\n你倒在${s.place}，眼前最后看见的是${s.killer}的身影。\n\n数十年后，这里立起一座石碑，碑上刻着你的生平——\n\n${s.bio.join('\n')}\n\n（天道档：单存档已随之抹去，本世即终。下一世里，这座碑真在，${s.killer}也真在，你的储物袋还在他手里。）`,
      options: [
        { label: '另起一世（碑与仇人都在下一世等你）', tone: 'gold', act: () => { reincarnate(s.map); return null; } },
        { label: '（在碑前多坐一会儿）', act: () => this.deathNode(s) },
      ],
    };
  }

  /** 新一世开始：把前世的碑立进这个世界，并把凶手连同你的储物袋一起放回来 */
  seedLegacy(): Stele | null {
    const g = this.game;
    const all = DaoxinSys.readAll();
    const s = all.find((x) => !x.taken) ?? all[0];
    if (!s) return null;
    this.st.legacy = s.id;
    // 凶手带着你的储物袋，还活在这一世（就近落户，接入 living.ts 的买卖：他会花你的钱、卖你的药）
    const bag: Record<string, number> = {};
    for (const it of s.legacy.items) bag[it.id] = (bag[it.id] ?? 0) + it.n;
    const killerRealm = clamp(Math.max(2, Math.min(4, (REALMS.findIndex((r) => r.name === s.realm.slice(0, 2)) + 1) || 2)), 1, 4);
    const npcId = `stele_${s.id}`;
    // 转世可以连着开好几局：凶手已在名册里就沿用原身，绝不重复投放。
    // 否则同一座碑的仇家会一世一世地叠出来，大地图上留下永远销不掉的「夺」字。
    const old = g.npcs.byId.get(npcId);
    const d = old ?? this.mkNpc({
      id: npcId, name: s.killer.replace(/^(凶手|仇家)·?/, ''), realm: killerRealm, stage: rint(2, 6), pers: 'ruthless',
      faction: /魔|邪/.test(s.cause + s.killer) ? 'demon' : 'rogue',
      x: clamp(s.x + rand(-1800, 1800), 600, 20000), y: clamp(s.y + rand(-1400, 1400), 600, 20000),
      map: (s.map || 'renjie') as MapId, bag, wealth: Math.max(60, s.legacy.stones),
      why: `杀了${s.name}，得了他的储物袋`, grudge: 0, favor: -10,
    });
    if (!old) d.met = false;   // 原身已经照过面了，别把恩怨进度抹掉
    // 追踪：既有的「寻仇夺回」链原样接住——大地图红字「夺」，去晚了东西真没了
    const list = (g.ws.stolenBags ??= []);
    if (!list.some((b) => b.culpritId === npcId && !b.recovered)) {
      const sb: StolenBag = {
        id: (Date.now() % 1e6) + 1 + list.length, culpritId: d.id, culpritName: d.name, day: Math.floor(g.day),
        map: npcMapOf(d), stones: Math.max(60, s.legacy.stones),
        items: s.legacy.items.slice(0, 12).map((x) => ({ id: x.id, n: x.n, age: x.age })),
      };
      list.push(sb);
    }
    // 这一世的继承已经落地：碑上记 taken。下一世才会轮到再上一座碑，
    // 而不是把同一个凶手放出来第二遍（碑本身照旧立着、照旧可读可拜）。
    s.taken = true;
    const si = all.findIndex((x) => x.id === s.id); if (si >= 0) all[si] = s;
    DaoxinSys.writeAll(all);
    g.news(`${s.year}年前陨落于${s.place}的修士${s.name}，其遗物今在${d.name}手中——江湖上有人立了座碑。`, 'personal');
    return s;
  }

  /** 走近碑：读碑文 */
  steleNode(s: Stele): DNode {
    const g = this.game;
    s.read = true;
    const all = DaoxinSys.readAll(); const i = all.findIndex((x) => x.id === s.id); if (i >= 0) { all[i] = s; DaoxinSys.writeAll(all); }
    const sb = (g.ws.stolenBags ?? []).find((b) => b.culpritId === `stele_${s.id}`);
    const opts: DOpt[] = [];
    if (sb && !sb.recovered) opts.push({ label: '（记下此人——去把遗物夺回来）', tone: 'bad', hint: '大地图上有红字「夺」；去晚了他会把东西花光卖掉', act: () => { g.toast(`你把「${sb.culpritName}」这个名字刻进了心里。`, 'warn'); g.renxin?.recordExp2('stele' as any, 'see', '前世之碑', `你在${s.place}读了一座旧碑，碑上的人死于${s.killer}之手。你的储物袋还在他手里。`); return null; } });
    opts.push({ label: '拜一拜，转身离去', tone: 'good', hint: '同为修士，谁不是走在同一条路上', act: () => { g.jianghu?.addCred?.(1, '碑前一拜'); const got = g.gainInsightExp(Math.round(C.need(g.hero) * 0.004)); g.toast(`你在碑前拱了拱手。前人走过的路，如今在你脚下。（修为 +${Math.round(got)}、信义 +1）`, 'good'); g.updateUI(true); return null; } });
    // v0.52 碑前香火：一碑只祭一次——香火里浮起一缕前世残念，顺带问出夺袋仇家的近日行踪。
    if (!s.offered) opts.push({
      label: '上三炷香，为前人诵一遍往生咒', tone: 'gold',
      hint: '一碑只祭一次：得「前世残念」（修为、信义），并问出那人的下落',
      act: () => { g.openDialog(this.incenseNode(s)); return null; },
    });
    else opts.push({ label: '（香炉里那三炷香早已燃尽）', hint: '香火已尽，此碑只得一缕残念——多了，就是贪了', act: () => null });
    // 活人读碑只是读碑；deathNode 只能由 trueDeath / 寿元坐化打开。
    opts.push({ label: '（离开）', act: () => null });
    return {
      speaker: '', title: `无字碑 · ${s.place}`, mood: 'mystic',
      text: `荒草半掩着一座石碑，碑身被风雨磨得发白。你拂去苔痕，字是从前的人刻的：\n\n${s.bio.join('\n')}\n\n${s.notes.length ? `碑阴还刻着几行小字，像是随笔：\n${s.notes.map((n) => '· ' + n).join('\n')}\n\n` : ''}碑下压着半只锈蚀的香炉，早已无人来祭。`,
      options: opts,
    };
  }

  // ==========================================================================
  // v0.52 碑前香火（前世残念）：祭的是前人，暖的是自己——上一世的阅历，落成这一世的修为。
  // 一碑只祭一次：香火换一缕残念与一句下落；再拜只是敬意，不再是罗盘。
  // ==========================================================================
  incenseNode(s: Stele): DNode {
    const g = this.game, h = g.hero;
    const first = !s.offered;
    s.offered = true;
    this.writeStele(s);

    let gain = 0, same = false;
    if (first) {
      g.jianghu?.addCred?.(2, '碑前三炷香');
      same = !!s.gongfa && s.gongfa !== '杂修' && s.gongfa === C.gongfaDef(h).name;
      gain = Math.round(C.need(h) * (0.01 + C.INSIGHT * (same ? 0.9 : 0.45)));
      C.gainExp(h, gain, []);
      g.renxin?.recordExp2('stele_incense' as any, 'see', '碑前香火',
        `你在${s.place}替${s.name}上了三炷香。前人留世的最后一缕执念沉进灵台，化成这一世的几分修为。`);
    } else {
      g.jianghu?.addCred?.(1, '碑前一拜');
      gain = Math.round(C.need(h) * 0.004);
      C.gainExp(h, gain, []);
    }

    // 香灰问路：只问一句下落
    const d = g.npcs.byId.get(`stele_${s.id}`);
    const sb = (g.ws.stolenBags ?? []).find((b) => b.culpritId === `stele_${s.id}`);
    let clue: string;
    if (!first) clue = '你再问了一句。香灰冷冷的，什么也没有说——香火已尽，问不出更多了。';
    else if (!d || !d.alive) clue = `香灰忽然散了。${s.killer}已经不在人世——这一世的账，地府自会去算。`;
    else if (npcMapOf(d) !== ACTIVE_MAP) clue = `香灰朝外一飘，径直散了。${s.killer}早离开了${MAP_NAME[(s.map || 'renjie') as MapId] ?? '人界'}，听说去了${MAP_NAME[npcMapOf(d) as MapId] ?? '别处'}。`;
    else {
      const near = LOCATIONS.filter((l) => l.map === npcMapOf(d)).sort((a, b) => Math.hypot(a.x * WORLD_SCALE - d.x, a.y * WORLD_SCALE - d.y) - Math.hypot(b.x * WORLD_SCALE - d.x, b.y * WORLD_SCALE - d.y))[0];
      clue = `香灰轻轻一颤，斜斜偏向${bearing(d.x - (s.x || 0), d.y - (s.y || 0))}——${s.killer}近日在${near ? `${MAP_NAME[npcMapOf(d) as MapId] ?? ''}·${near.name}` : '荒野'}一带现身，离碑约${near ? dirKm(near, d) : '?'}里。${sb && !sb.recovered ? '大地图上那个红字「夺」，一直指着他。' : ''}`;
    }

    const head = first
      ? `碑下那只锈香炉里，三炷香静静燃着，青烟直上，散作一缕说不清的暖意，顺着灵台沉了下去。\n\n那是${s.name}留在世上的最后一缕执念，如今落在你身上。\n\n（前世残念：修为 +${gain}${same ? '——碑上那位与你同修一路功法，这点残念格外受用' : ''}；信义 +2）`
      : `你又拱了拱手。香炉里只剩冷灰。\n\n（修为 +${gain}，信义 +1）`;

    return {
      speaker: '', title: `碑前香火 · ${s.place}`, mood: 'mystic',
      text: `${head}\n\n${clue}`,
      options: [{ label: '收起残念，转身离去', tone: 'good', hint: '路，还得自己走', act: () => { g.updateUI(true); return null; } }],
    };
  }

  // ========================================================================
  // 每帧 / 绘制 / 大地图标记
  // ========================================================================
  update(dt: number) {
    const g = this.game, p = g.player;
    this.focus = null; this.focusD = 1e9;
    for (const cx of this.contests) {
      cx.t += dt; cx.st.update(dt);
      const d = Math.hypot(cx.x - p.x, cx.y - p.y);
      if (d > 5200) { this.rivalTakes(cx, true); this.dropContest(cx); continue; }   // 走远了：他采走（记账，不再无声蒸发）
      if (cx.done) continue;   // 已经动上手 / 讲定了：不再重复弹出对话
      if (d < 260 && d < this.focusD) { this.focus = cx; this.focusD = d; }
    }
    this.steleFocus = null; this.steleFocusD = 1e9;
    if (!this.hardcore() && DaoxinSys.readAll().length === 0) return;
    for (const s of this.stelesHere()) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < 210 && d < this.steleFocusD) { this.steleFocus = s; this.steleFocusD = d; }
    }
  }

  /** 最近可交互之物的距离（灵草争夺 / 前世之碑） */
  focusDist(): number {
    const a = this.focus ? this.focusD : 1e9, b = this.steleFocus ? this.steleFocusD : 1e9;
    return Math.min(a, b);
  }

  /** 天道档寿元耗尽：坐化即立碑 */
  onAgeDeath() {
    if (!this.hardcore()) return;
    const g = this.game;
    const dropped = g.protectedLoot().map((d) => ({ id: d.id, n: d.n }));   // 坐化时脚边未拾的补发掉落随遗物入碑
    g.combat.reset(); g.pursuit?.reset();
    const s = this.onTrueDeath('大限', '寿元耗尽，坐化于蒲团之上', undefined, dropped);
    g.openDialog(this.deathNode(s));
  }

  interact(): boolean {
    const g = this.game;
    if (this.steleFocus) { audio.sfx('open'); g.openDialog(this.steleNode(this.steleFocus)); return true; }
    if (this.focus) { g.openDialog(this.contestNode(this.focus)); return true; }
    return false;
  }

  collect(out: { y: number; draw: (g: G) => void }[], view: { left: number; top: number; right: number; bottom: number }, t: number, dt: number) {
    const g = this.game;
    for (const cx of this.contests) {
      if (cx.done) continue;   // 动了手的对手已化作敌人上场，不再画站着的人
      if (cx.x < view.left - 300 || cx.x > view.right + 300 || cx.y < view.top - 300 || cx.y > view.bottom + 300) continue;
      const v = Math.max(g.life.vis({ x: cx.x, y: cx.y }), 0.2);
      out.push({
        y: cx.y, draw: (ctx) => {
          ctx.save(); ctx.globalAlpha *= v;
          cx.st.update(0); drawCharacter(ctx, cx.look, cx.st, 1, dt);
          ctx.restore();
          ctx.save(); ctx.globalAlpha *= v;
          const fs = Math.max(12, 14 / Math.max(0.5, g.cam.zoom));
          ctx.font = `${fs}px "Noto Serif SC",serif`; ctx.textAlign = 'center';
          ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,12,0.75)';
          const lab = `【T】${cx.name} · ${realmName(cx.realm, cx.stage)}`;
          ctx.strokeText(lab, cx.x, cx.y - 150); ctx.fillStyle = '#ffe6b0'; ctx.fillText(lab, cx.x, cx.y - 150);
          ctx.restore();
        },
      });
    }
    for (const s of this.stelesHere()) {
      if (s.x < view.left - 400 || s.x > view.right + 400 || s.y < view.top - 400 || s.y > view.bottom + 400) continue;
      const v = Math.max(g.life.vis({ x: s.x, y: s.y }), 0.35);
      out.push({ y: s.y, draw: (ctx) => this.drawStele(ctx, s, v, t) });
    }
  }

  private drawStele(ctx: G, s: Stele, v: number, t: number) {
    const x = s.x, y = s.y, night = this.game.night;
    ctx.save(); ctx.globalAlpha *= v;
    // 荒草
    ctx.strokeStyle = 'rgba(90,110,60,0.55)'; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const gx = x - 90 + i * 14, gy = y + 24 - (i % 3) * 8; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + Math.sin(t * 1.4 + i) * 5, gy - 20, gx + Math.sin(t * 1.1 + i) * 9, gy - 34); ctx.stroke(); }
    // 碑座
    ctx.fillStyle = '#4a4740'; ctx.beginPath(); ctx.ellipse(x, y + 16, 74, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5b574e'; ctx.fillRect(x - 56, y - 6, 112, 24);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x - 56, y + 8, 112, 10);
    // 碑身
    const gr = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
    gr.addColorStop(0, '#6d6a60'); gr.addColorStop(0.45, '#8b8879'); gr.addColorStop(1, '#5e5b52');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(x - 40, y - 6); ctx.lineTo(x - 40, y - 168); ctx.quadraticCurveTo(x, y - 208, x + 40, y - 168); ctx.lineTo(x + 40, y - 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,26,20,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    // 苔痕与裂纹
    ctx.fillStyle = 'rgba(96,124,74,0.32)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(x - 30 + i * 12, y - 20 - i * 22, 9, 5, 0.4, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = 'rgba(30,26,20,0.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x + 12, y - 180); ctx.lineTo(x + 4, y - 120); ctx.lineTo(x + 18, y - 66); ctx.stroke();
    // 碑文（竖排）
    ctx.fillStyle = 'rgba(28,24,18,0.85)';
    ctx.font = 'bold 22px "Ma Shan Zheng","STKaiti","KaiTi",serif'; ctx.textAlign = 'center';
    const word = (s.name ?? '').slice(0, 4);
    for (let i = 0; i < word.length; i++) ctx.fillText(word[i], x + 8, y - 140 + i * 27);
    ctx.font = '13px "Noto Serif SC",serif'; ctx.fillStyle = 'rgba(40,34,26,0.7)';
    ctx.fillText(s.realm, x - 20, y - 120); ctx.fillText(`${s.year}年`, x - 20, y - 100);
    // 香炉
    ctx.fillStyle = '#6a5a44'; ctx.beginPath(); ctx.ellipse(x + 66, y + 12, 16, 7, 0, 0, TAU); ctx.fill();
    ctx.fillRect(x + 52, y - 4, 28, 16);
    // 夜里的孤魂香一点
    const gl = 0.25 + 0.5 * night + Math.sin(t * 2) * 0.06;
    const rg = ctx.createRadialGradient(x, y - 90, 0, x, y - 90, 120);
    rg.addColorStop(0, `rgba(210,225,255,${0.14 * gl + 0.05})`); rg.addColorStop(1, 'rgba(210,225,255,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y - 90, 120, 0, TAU); ctx.fill();
    ctx.restore();
    // 提示
    if (this.steleFocus === s) {
      ctx.save();
      const fs = Math.max(12, 14 / Math.max(0.5, this.game.cam.zoom));
      ctx.font = `${fs}px "Noto Serif SC",serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,12,0.8)';
      ctx.strokeText('【T】读碑', x, y - 216); ctx.fillStyle = '#e8f0ff'; ctx.fillText('【T】读碑', x, y - 216);
      ctx.restore();
    }
  }

  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const s of this.stelesHere()) out.push({ x: s.x, y: s.y, glyph: '碑', color: '#b8c8e8', ring: 1, name: `${s.name}之碑（${s.year}年）` });
    for (const cx of this.contests) if (!cx.done) out.push({ x: cx.x, y: cx.y, glyph: '争', color: '#e8c060', name: `${cx.name} 与你同争一株灵药` });
    return out;
  }

  chances(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] {
    const out: { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] = [];
    if (this.steleFocus) out.push({ t: '无字碑', d: '荒草里的一座石碑，碑上刻着一个人的生平。', x: this.steleFocus.x, y: this.steleFocus.y, hot: true });
    if (this.focus) out.push({ t: '灵草之争', d: `${this.focus.name} 也锁定了这株灵药——可谈、可分、可抢。`, x: this.focus.x, y: this.focus.y, hot: true });
    const all = DaoxinSys.readAll();
    if (all.length && !this.st.legacy) out.push({ t: '前世的碑', d: `江湖上有 ${all.length} 座旧碑，最近的一座在${all[0].place}。`, tone: 'mystic' });
    return out;
  }

  reset() {
    this.contests = []; this.focus = null; this.focusD = 1e9; this.steleFocus = null; this.steleFocusD = 1e9; this.noticeMonth = -1;
    // v0.51.3 灵草守恒：争夺正酣时存档退出——读档回来，采下的灵药先回你袋中（对手仍在名册上，梁子照旧）
    const pend = this.st.pending;
    if (pend?.items?.length) {
      for (const x of pend.items) C.addItem(this.game.hero, x.item, x.n, x.age);
      this.st.pending = undefined;
      this.game.toast('你摸了摸怀中——那日采下、未及分说的灵药还在，先收进储物袋再说。', 'info');
    }
  }
}

// ------------------------------------------------------------------ 杂项
const SECT_RANK_NAME = SECT_RANKS;
function sectTitle(id: string) {
  const l = LOCATIONS.find((x) => x.id === id);
  return l ? l.name : '宗门';
}
function dirKm(l: LocDef, p: { x: number; y: number }) {
  return Math.max(1, Math.round(Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) / 900));
}
function npcMapOf(d: NpcData): string { return d.map ?? 'renjie'; }
/** v0.52：碑前香灰问路用的方位词（不用罗盘，用修士的直觉）。 */
function bearing(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (a >= -22.5 && a < 22.5) return '正东';
  if (a >= 22.5 && a < 67.5) return '东南';
  if (a >= 67.5 && a < 112.5) return '正南';
  if (a >= 112.5 && a < 157.5) return '西南';
  if (a >= 157.5 || a < -157.5) return '正西';
  if (a >= -67.5 && a < -22.5) return '东北';
  if (a >= -112.5 && a < -67.5) return '正北';
  return '西北';
}
/** 转世：另起一世（碑留在 localStorage 里，下一世的世界里真能遇到） */
export function reincarnate(map?: string) {
  try {
    localStorage.setItem('fanren.map', map && (map === 'lingjie' || map === 'xianjie') ? map : 'renjie');
    sessionStorage.setItem('fanren.new', '1');
    sessionStorage.removeItem('fanren.resume');
    for (const k of ['fanren_save_auto', 'fanren_save_1', 'fanren_save_2', 'fanren_save_3']) localStorage.removeItem(k);
  } catch { /* */ }
  if (typeof location !== 'undefined' && !(globalThis as any).__FANREN_NORELOAD) location.reload();
}
