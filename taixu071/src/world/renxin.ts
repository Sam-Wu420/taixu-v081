// 第四十九步「人心」：表里两张脸 · 读心博弈 · 四大开放世界骗局 · 战败重做与道伤 · 《苏寒随笔》阅历
//
// 核心原则：全部长在现有活世界骨架（favor/grudge、ties/hate、plan、心声、happen、sites、market、living、xinmo）之上——
// 不造贴纸，只让“系统之间会说谎”，让每一次轻信和战败都真疼，也让神识与阅历成为修仙者真正的护身符。

import type { Game } from './game';
import type { NpcData, Pers } from './npc';
import { npcMap, makeName, PERS_NAME } from './npc';
import type { DNode, DOpt, FakeKind, Shop, ShopStock } from './modal';
import type { Exp2Entry, StolenBag } from './worldstate';
import * as C from './cultivation';
import { ITEM_LIST, itemDef } from '../data/items';
import { REALMS, realmName } from '../data/realms';
import { ACTIVE_MAP, ACTIVE_WORLD, LOCATIONS, LOC_BY_ID, WORLD_SCALE, WORLD_W, WORLD_H, LocDef } from '../data/world';
import { worldCurrencyId, worldCurrencyName, scaleFromMortalStones, toMortalStones, clampWorldRealm, planeEncounterRange } from '../data/worldHierarchy';
import { zoneOfLoc, priceMul, sellableAt } from '../data/market';
import { CharState, randomLook, Look } from '../gfx/character';
import { ENEMIES } from '../data/enemies';
import { Enemy } from './combat';
import { audio } from './audio';
import { dirName } from './sites';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** 各性格发起骗局的权重系数：综合事件池占比控制在 15%–25% 之间 */
export const SCAM_RATE_BY_PERS: Record<Pers, number> = {
  righteous: 0.01,
  kind: 0.01,
  aloof: 0.03,
  cautious: 0.04,
  arrogant: 0.14,
  greedy: 0.44,
  ruthless: 0.52,
};

/** 假心声台词库：贪婪 / 狠辣 / 老怪物表面一套背地一套 */
const MASK_LINES_GREEDY = [
  '这位道友好生面善，倒想结交一番。',
  '出门在外，最喜遇上这般和气同道。',
  '四海之内皆道友，相逢即是有缘。',
  '看道友气宇轩昂，日后必非池中之物。',
  '今日天朗气清，正宜与同道坐而论道。',
];
const MASK_LINES_RUTHLESS = [
  '修道之人当以和为贵，切莫妄动干戈。',
  '此地清幽，与道友偶遇也是一桩雅事。',
  '唉，近来劫修猖獗，道友独行可要多加小心。',
  '善哉，能在此处见着同道，实乃幸事。',
  '在下平生最敬重重情重义之人。',
];
const MASK_LINES_ELDER = [
  '老夫观此子心性纯良，倒有几分当年故人之姿。',
  '大道漫漫，能提携后辈一二，也是善缘。',
  '浮生若梦，恩怨皆空，老夫早已看淡了。',
  '后生可畏，人界未来的气运便在尔等身上了。',
];
const MASK_CRACKS = [
  '（眼神却似有若无地瞟向你腰间储物袋）',
  '（笑意盈盈，袖中五指却悄然扣紧）',
  '（话音温和，神识却在你护体灵光上轻轻一探）',
  '（眼底深处闪过一丝不易察觉的贪色）',
];

export type Exp2Id =
  | 'ruin_betray'
  | 'fake_item'
  | 'borrow_knife'
  | 'duoshe'
  | 'mask_read'
  | 'bag_robbed'
  | 'demon_captive'
  // 江湖篇
  | 'meiren' | 'shill' | 'fake_bounty' | 'trib_trap' | 'bait' | 'smear' | 'feint' | 'letter' | 'extort' | 'fisher' | 'fake_sale'
  // 天道篇
  | 'dao_oath' | 'herb_contest' | 'stele' | 'sworn_trap' | 'cave_fake' | 'smuggle' | 'blood_baby'
  // 天道终卷（v0.52）
  | 'stele_incense' | 'stele_avenged';

export class RenxinSys {
  game: Game;
  /** 最近一次命中的敌人（供战败时准确判定是谁击倒了你） */
  lastAttacker: Enemy | null = null;
  private stolenSeq = 1;

  constructor(g: Game) {
    this.game = g;
  }

  // ========================================================================
  // 2.5 阅历系统（《苏寒随笔》 ws.exp2）—— 吃亏长记性，把上当变成修仙成长曲线
  // ========================================================================
  get exp2List(): Exp2Entry[] {
    return (this.game.ws.exp2 ??= []);
  }

  hasExp2(id: Exp2Id): boolean {
    return this.exp2List.some((e) => e.id === id);
  }

  exp2Count(id?: Exp2Id): number {
    if (!id) return this.exp2List.reduce((s, e) => s + e.count, 0);
    return this.exp2List.filter((e) => e.id === id).reduce((s, e) => s + e.count, 0);
  }

  /** 阅历带来的综合辨识加成（0 .. 0.45）：影响假心声破绽率与假货鉴定率 */
  discernBonus(id?: Exp2Id): number {
    const specific = id ? Math.min(0.25, this.exp2Count(id) * 0.14) : 0;
    const total = Math.min(0.22, this.exp2List.length * 0.04);
    const artB = (this.game.hero.gongfa === 'dayan' ? 0.14 : 0) + (this.game.hero.arts.some((a) => a.id === 'mingqing') ? 0.12 : 0);
    return Math.min(0.55, specific + total + artB);
  }

  recordExp2(id: Exp2Id, kind: 'loss' | 'see', title: string, text: string) {
    const list = this.exp2List;
    const day = Math.floor(this.game.day);
    const ex = list.find((e) => e.id === id);
    if (ex) {
      ex.count += 1;
      ex.day = day;
      ex.kind = kind;
      ex.text = text;
    } else {
      list.push({ id, day, kind, title, text, count: 1 });
    }
    this.game.toast(`《苏寒随笔》记下一笔阅历：【${title}】（辨识心眼 +${Math.round(this.discernBonus(id) * 100)}%）`, kind === 'see' ? 'good' : 'info');
  }

  // ========================================================================
  // 2.1 表里系统 —— 每个 NPC 两张脸（favor 真实态度 / shown 表演态度）+ 心声泡读心博弈
  // ========================================================================
  /** 计算并同步 NPC 的表演态度 shown */
  shownFavor(d: NpcData): number {
    const g = this.game, h = g.hero;
    if (d.faction === 'mortal') {
      const s = clamp(d.favor + (h.realm >= 2 ? 12 : 0), -100, 100);
      (d as any).shown = s;
      return s;
    }
    // 死敌当面且修为不惧你时，不再演戏
    if (d.grudge >= 2 && (d.hunting || d.chasing || d.realm >= h.realm)) {
      (d as any).shown = d.favor;
      return d.favor;
    }
    let disguise = 0;
    const p = d.pers;
    if (p === 'righteous' || p === 'aloof' || p === 'kind') {
      // 正人君子、淡泊之人表里如一
      disguise = ((d.seed % 5) - 2);
    } else if (p === 'cautious' || p === 'arrogant') {
      // 谨慎者与傲慢者：你修为高时表面客气几分
      if (h.realm > d.realm && d.favor < 10) disguise = 14 + (d.seed % 10);
      else disguise = (d.seed % 7) - 3;
    } else if (p === 'greedy' || p === 'ruthless') {
      // 贪婪 / 狠辣者：越贪你的储物袋、越存歹心，表面反而越热情！
      const stones = toMortalStones(C.bagCount(h, worldCurrencyId(ACTIVE_WORLD)), ACTIVE_WORLD);
      const rich = stones >= 180 || h.bag.some((b) => itemDef(b.id).tier >= Math.max(2, d.realm));
      const plotting = d.plan?.k === 'rob' || d.grudge === 1 || d.favor < 5 || rich;
      if (plotting) {
        const baseMask = p === 'ruthless' ? 46 : 38;
        disguise = baseMask + (d.seed % 19) + (rich ? 10 : 0);
      } else {
        disguise = 18 + (d.seed % 12);
      }
    }
    const shown = clamp(Math.round(d.favor + disguise), p === 'greedy' || p === 'ruthless' ? Math.max(16, d.favor) : -100, 88);
    (d as any).shown = shown;
    return shown;
  }

  /** 此人是否正在伪装（笑里藏刀 / 表里不一） */
  isHypocrite(d: NpcData): boolean {
    if (d.faction === 'mortal') return false;
    const shown = this.shownFavor(d);
    return shown - d.favor >= 22 || ((d.pers === 'greedy' || d.pers === 'ruthless') && (d.plan?.k === 'rob' || d.grudge > 0 || d.favor < 0));
  }

  /**
   * 读心博弈判定：
   * - 你的境界 >= 对方 2 个大境界，或对方正受神识/威压压制（sup >= 1，或神识外放且高 1 大境界）→ 看穿真心声（泡边缘描金）
   * - 老怪物（结丹+ 且 ruthless）连被压制时的心声都是假的（除非高出 3 个大境界，或高 2 个大境界且兼修天衍诀/明清灵目）
   * - 未看穿时：伪装者显示表演心声；若玩家有阅历/神识专长，有概率露出破绽（crack）
   */
  mindRead(d: NpcData, supLv = 0): { trueMind: boolean; gold: boolean; crack: boolean; oldMonsterFake: boolean } {
    const g = this.game, h = g.hero;
    const gapRealm = h.realm - d.realm;
    const oldMonster = d.realm >= 3 && d.pers === 'ruthless';
    const hasSoulArt = h.gongfa === 'dayan' || h.arts.some((a) => a.id === 'mingqing');

    if (oldMonster) {
      const canPierceElder = gapRealm >= 3 || (gapRealm >= 2 && hasSoulArt && g.senseBurstT > 0);
      if (canPierceElder) return { trueMind: true, gold: true, crack: false, oldMonsterFake: false };
      const crackCh = (hasSoulArt ? 0.22 : 0.05) + this.discernBonus('mask_read') * 0.5;
      return { trueMind: false, gold: false, crack: Math.random() < crackCh, oldMonsterFake: true };
    }

    const suppressed = supLv >= 1 || (g.senseBurstT > 0 && gapRealm >= 1) || (hasSoulArt && gapRealm >= 1 && this.game.sense > (REALMS[d.realm]?.sense?.[0] ?? 20) * 2.2);
    if (gapRealm >= 2 || suppressed) {
      return { trueMind: true, gold: true, crack: false, oldMonsterFake: false };
    }

    if (!this.isHypocrite(d)) {
      // 坦荡之人本就不装，所言即所想（但不描金）
      return { trueMind: true, gold: false, crack: false, oldMonsterFake: false };
    }

    const crackCh = 0.08 + this.discernBonus('mask_read') + (g.senseBurstT > 0 ? 0.18 : 0);
    return { trueMind: false, gold: false, crack: Math.random() < crackCh, oldMonsterFake: false };
  }

  /** 生成最终头顶心声：真心声（可描金） vs 表演假心声（可带破绽） */
  filterThought(d: NpcData, realThought: string | null, supLv = 0): { text: string; gold: boolean; crack: boolean } | null {
    if (!realThought) return null;
    const mr = this.mindRead(d, supLv);
    if (mr.trueMind) {
      return { text: realThought, gold: mr.gold, crack: false };
    }
    const pool = mr.oldMonsterFake
      ? MASK_LINES_ELDER
      : d.pers === 'ruthless'
      ? MASK_LINES_RUTHLESS
      : MASK_LINES_GREEDY;
    let fakeText = pool[(d.seed + Math.floor(this.game.time / 7)) % pool.length];
    if (mr.crack) {
      fakeText += MASK_CRACKS[(d.seed + Math.floor(this.game.day)) % MASK_CRACKS.length];
    }
    return { text: fakeText, gold: false, crack: mr.crack };
  }

  /** 对话面板上显示的性格与好感：未看穿伪装前，贪狠之徒显示伪善标签与 shown 好感 */
  dialogPersona(d: NpcData, supLv = 0): { persLabel: string; favorText: string; seenThrough: boolean } {
    const shown = this.shownFavor(d);
    const mr = this.mindRead(d, supLv);
    const hyp = this.isHypocrite(d);
    const seen = (mr.trueMind && mr.gold) || (d as any)._unmasked;
    if (seen && hyp) {
      return {
        persLabel: `${PERS_NAME[d.pers]}（伪装和善）`,
        favorText: `真心 ${Math.round(d.favor)}（表面 ${Math.round(shown)}）`,
        seenThrough: true,
      };
    }
    if (!seen && hyp) {
      const fakePers = d.pers === 'ruthless' ? '温和' : '豪爽';
      return {
        persLabel: fakePers,
        favorText: `好感 ${Math.round(shown)}`,
        seenThrough: false,
      };
    }
    return {
      persLabel: PERS_NAME[d.pers],
      favorText: `好感 ${Math.round(d.favor)}`,
      seenThrough: seen,
    };
  }

  /** 伪善者的热情问候语（笑里藏刀） */
  maskedGreeting(d: NpcData): string | null {
    if (!this.isHypocrite(d) || (d as any)._unmasked) return null;
    if (d.grudge >= 2 && d.realm >= this.game.hero.realm) return null;
    const hName = realmName(this.game.hero.realm, this.game.hero.stage);
    const lines = [
      `（${d.name}满面春风地拱手迎上）这位${hName}的道友请留步！荒野相逢即是缘分，不知往何处仙游？`,
      `（对方笑容格外热络）哈哈，一见道友便觉投缘！近来这一带不太平，你我同道正该多亲近亲近。`,
      `（${d.name}稽首微笑，目光温和）道友气度凝练，想必师承不凡。若有闲暇，不妨与在下喝杯灵茶？`,
    ];
    return lines[d.seed % lines.length];
  }

  /** 交谈时的「察言观色 / 读心识人」选项 */
  inspectFaceOpt(d: NpcData, look: Look, title: string, back: () => DNode, supLv = 0): DOpt | null {
    if (d.faction === 'mortal' || (d as any)._unmasked) return null;
    const g = this.game, h = g.hero;
    if (h.mp < 0.05) return null;
    return {
      label: '凝神察言观色（耗少许神识法力）',
      hint: this.hasExp2('mask_read') ? '你已有识人阅历，更易看破伪装' : '探其言辞与神识波动是否表里如一',
      act: () => {
        h.mp = Math.max(0, h.mp - 0.05);
        const mr = this.mindRead(d, supLv);
        const hyp = this.isHypocrite(d);
        const rollCh = (mr.trueMind ? 0.95 : 0.32) + this.discernBonus('mask_read') + (h.realm - d.realm) * 0.22;
        if (mr.oldMonsterFake && h.realm - d.realm < 2 && Math.random() > 0.18 + this.discernBonus('mask_read') * 0.4) {
          return {
            speaker: '神识感应',
            look,
            title,
            text: `${d.name}气息渊深似海，面容慈和，滴水不漏。以你眼下的神识，竟看不出半点破绽——只觉此人城府深不可测。`,
            options: [{ label: '暗自留心', act: back }],
          };
        }
        if (hyp && Math.random() < rollCh) {
          (d as any)._unmasked = true;
          this.recordExp2('mask_read', 'see', '笑里藏刀', `${Math.floor(g.day / 360) + 1}年，看穿${d.name}表面热情客套（表面好感 ${this.shownFavor(d)}），实则心怀贪念歹意（真实好感 ${Math.round(d.favor)}）。`);
          return {
            speaker: '神识洞察',
            look,
            title: `${d.name} · 伪装已破`,
            mood: 'danger',
            text: `你借说话间隙将一缕神识悄然搭上对方气机——\n\n${d.name}嘴上满是客套笑意，袖底法力却暗暗蓄而不发，神识更是三番五次扫过你的储物袋！（表面好感 ${this.shownFavor(d)} → 真实态度 ${Math.round(d.favor)}，实为【${PERS_NAME[d.pers]}】之辈）`,
            options: [{ label: '心中有数了', tone: 'gold', act: back }],
          };
        }
        return {
          speaker: '神识感应',
          look,
          title,
          text: hyp
            ? `${d.name}言谈举止颇为热络，只是目光偶尔闪烁，一时还拿不准他心里打的什么算盘。`
            : `${d.name}气息平正，眼神坦荡，言辞与心念并无二致，确是个表里如一之人。`,
          options: [{ label: '返回', act: back }],
        };
      },
    };
  }

  // ========================================================================
  // 2.3 骗局频率控制 + 骗局 #2：假丹药 / 假玉简 + 神识/丹师掌眼鉴定 + 找卖家算账
  // ========================================================================
  /** 按性格判定是否设局（保证无性格指定时总体在 18%~22%，即 15%~25% 区间内） */
  rollScam(pers?: Pers, baseRate = 0.2): boolean {
    const mul = this.game.daoxin?.scamMul?.() ?? 1;   // 天道篇：道心档位——天骄档骗局稀少，天道档还要更凶
    if (!pers) return Math.random() < baseRate * mul;
    return Math.random() < Math.min(0.85, SCAM_RATE_BY_PERS[pers] * mul);
  }

  /** 给散修摊贩 / 黑市行商的货架按概率混入三折“捡漏”假丹药或假玉简（约占全部地摊 18–22%） */
  injectStallFakes(d: NpcData, stock: ShopStock[]) {
    if (d.faction === 'mortal' || d.canon) return;
    if (!this.rollScam(d.pers, 0.2)) return;
    const r = Math.max(1, this.game.hero.realm);
    const pillPool = r <= 1
      ? ['pill_zhuji', 'pill_jinsui', 'pill_huanglong']
      : r === 2
      ? ['pill_jiangchen', 'pill_juling', 'pill_dingyan']
      : ['pill_jiuqu', 'pill_ningyuan', 'pill_yanghun'];
    const scrollPool = r <= 1
      ? ['scroll_qingyuan', 'scroll_leidian', 'scroll_luoyan']
      : ['scroll_dayan', 'scroll_mingqing', 'scroll_xuanyin'];
    const isPill = (d.seed + Math.floor(this.game.day / 15)) % 3 !== 0;
    const targetId = isPill ? pillPool[d.seed % pillPool.length] : scrollPool[d.seed % scrollPool.length];
    const it = itemDef(targetId);
    if (!it || stock.some((s) => s.id === targetId)) return;
    // 三折到三八折诱人低价！
    const discount = 0.28 + ((d.seed % 10) / 100);
    const fakeKind: FakeKind = !isPill ? 'broken' : d.pers === 'ruthless' && d.seed % 3 === 0 ? 'toxic' : 'dyed';
    stock.unshift({
      id: targetId,
      price: Math.max(15, Math.round(it.price * discount)),
      origPrice: it.price,
      n: 1,
      fake: fakeKind,
      seller: d.id,
      sellerName: d.name,
      ident: false,
    });
  }

  /** 城镇新增「散修地摊（鬼市）」：七八成是散修急用钱甩卖的真货（真能捡漏），约二成是贪狠散修摆的染色假丹/残篇玉简 */
  ghostMarketShop(loc: LocDef): Shop {
    const g = this.game, z = zoneOfLoc(loc);
    const halfMonth = Math.floor(g.day / 15);
    const map = (g.ws.shopCache ??= {});
    const prefix = `ghost:${loc.id}@`;
    const cacheKey = `${prefix}${halfMonth}`;
    for (const k of Object.keys(map)) if (k.startsWith(prefix) && k !== cacheKey) delete map[k];
    if (!Array.isArray(map[cacheKey])) {
      let s = ((loc.x * 733 + loc.y * 911 + halfMonth * 131) >>> 0) || 1;
      const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const locals = g.npcs.list.filter(
        (d) => d.alive && !d.canon && !d.beauty && d.realm > 0 && npcMap(d) === (loc.map ?? ACTIVE_MAP) &&
          (d.home === loc.id || Math.hypot(d.x - loc.x * WORLD_SCALE, d.y - loc.y * WORLD_SCALE) < 18000)
      );
      const stock: ShopStock[] = [];
      const count = 6;
      const r = Math.max(1, g.hero.realm);
      for (let i = 0; i < count; i++) {
        const seller = locals.length ? locals[Math.floor(rnd() * locals.length)] : null;
        const isFake = seller
          ? rnd() < (seller.pers === 'ruthless' ? 0.45 : seller.pers === 'greedy' ? 0.38 : seller.pers === 'arrogant' ? 0.12 : 0.02)
          : rnd() < 0.2;
        if (isFake) {
          const baits = r <= 1
            ? ['pill_zhuji', 'pill_jinsui', 'scroll_qingyuan', 'pill_juling']
            : r === 2
            ? ['pill_jiangchen', 'pill_ningyuan', 'scroll_dayan', 'pill_yanghun']
            : ['pill_jiuqu', 'pill_yuanling', 'scroll_yuanci', 'pill_wanshou'];
          const id = baits[Math.floor(rnd() * baits.length)];
          if (stock.some((x) => x.id === id && x.fake)) continue;
          const it = itemDef(id);
          const fk: FakeKind = it.type === 'scroll' ? 'broken' : seller?.pers === 'ruthless' && rnd() < 0.35 ? 'toxic' : 'dyed';
          stock.push({
            id,
            price: Math.max(20, Math.round(it.price * priceMul(it, z) * (0.28 + rnd() * 0.1))),
            origPrice: it.price,
            n: 1,
            fake: fk,
            seller: seller?.id,
            sellerName: seller?.name ?? '蒙面摊主',
            ident: false,
          });
        } else {
          const pool = ITEM_LIST.filter(
            (it) => it.price > 0 && it.id !== 'mat_lingshi' && it.id !== 'mat_lingjing' && it.id !== 'mat_xianyuan' && it.type !== 'misc' && it.tier <= r + 1 && sellableAt(it, z, 2, r * 2, loc.id)
          );
          if (!pool.length) continue;
          const it = pool[Math.floor(rnd() * pool.length)];
          if (stock.some((x) => x.id === it.id && !x.fake)) continue;
          stock.push({
            id: it.id,
            price: Math.max(2, Math.round(it.price * priceMul(it, z) * (0.72 + rnd() * 0.24))),
            n: it.type === 'artifact' || it.type === 'scroll' ? 1 : 1 + Math.floor(rnd() * 3),
            age: it.type === 'herb' ? 15 + Math.floor(rnd() * 75) : undefined,
            seller: seller?.id,
            sellerName: seller?.name ?? '散修摊主',
          });
        }
      }
      stock.push({ id: 'mat_weilingfen', price: Math.round(40 * Math.pow(2, Math.max(0, r - 1))), n: 3 });
      map[cacheKey] = stock;
    }
    const stock = map[cacheKey];
    g.daoxin?.applyQuota(stock, loc);
    return {
      title: `${loc.name} · 散修鬼市地摊`,
      desc: '每半月换一茬散修摊主。偶有急用灵石的散修低价甩卖真货，亦混有染色假丹与残缺玉简——买前可凝神掌眼。',
      stock,
      sellRate: 0.45,
      zone: z,
      loc: loc.id,
      isStall: true,
      cacheKey,
    };
  }

  /** 在地摊购买前用神识暗自掌眼（不花钱，耗 6% 法力） */
  probeShopItem(s: ShopStock): { spottedFake: boolean; msg: string } {
    const g = this.game, h = g.hero;
    if (h.mp < 0.06) return { spottedFake: false, msg: '法力不足，难以凝聚神识探查。' };
    h.mp = Math.max(0, h.mp - 0.06);
    const it = itemDef(s.id);
    const chance = clamp(0.38 + (h.realm - Math.max(1, it.tier - 1)) * 0.18 + this.discernBonus('fake_item'), 0.18, 0.96);
    if (s.fake && Math.random() < chance) {
      s.ident = true;
      this.recordExp2(
        'fake_item',
        'see',
        '鬼市辨伪',
        `在坊市地摊一眼看破${s.sellerName ?? '摊贩'}兜售的三折「${it.name}」实为${s.fake === 'broken' ? '残缺伪简' : '染色假丹'}。`
      );
      if (s.seller) {
        const npc = g.npcs.byId.get(s.seller);
        if (npc) (npc as any)._caughtFake = it.name;
      }
      return {
        spottedFake: true,
        msg: s.fake === 'broken'
          ? `神识探入玉简——后半截经文全是乱凑的废话，倒练必致走火入魔！这是【残缺伪简】（摊主：${s.sellerName ?? '散修'}）。`
          : `神识扫过丹衣——外层涂着灵草汁染出的宝光，内芯却是几文钱一颗的淬体凡丸！这是【假${it.name}】（摊主：${s.sellerName ?? '散修'}）。`,
      };
    }
    return {
      spottedFake: false,
      msg: s.fake
        ? `此物表面灵光流转，封禁严密，以你眼下的神识一时未看出异样（把握约 ${Math.round(chance * 100)}%，亦可买下后找丹铺老丹师掌眼）。`
        : `神识细细扫过，药气纯正、灵纹自然，看不出做伪痕迹。`,
    };
  }

  /** 鉴定储物袋中的可疑丹药或玉简（byMaster=true 为城镇老丹师/符师掌眼，100% 准确） */
  appraiseBagSlot(bagIdx: number, byMaster = false, fee = 0): { ok: boolean; isFake: boolean; msg: string } {
    const g = this.game, h = g.hero;
    const b = h.bag[bagIdx];
    if (!b) return { ok: false, isFake: false, msg: '未选择物品。' };
    const it = itemDef(b.id);
    if (b.ident) {
      return { ok: true, isFake: !!b.fake, msg: b.fake ? `此物已鉴明是伪造的假${it.name}。` : `此物已鉴明为真品。` };
    }
    if (byMaster) {
      if (fee > 0) {
        const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
        if (C.bagCount(h, curId) < fee) return { ok: false, isFake: false, msg: `${curName}不足（需掌眼费 ${fee} ${curName}）。` };
        C.removeItem(h, curId, fee);
      }
    } else {
      if (h.mp < 0.08) return { ok: false, isFake: false, msg: '法力不足（神识探查需耗八分法力）。' };
      h.mp = Math.max(0, h.mp - 0.08);
    }

    const chance = byMaster ? 1 : clamp(0.42 + (h.realm - Math.max(1, it.tier - 1)) * 0.18 + this.discernBonus('fake_item'), 0.2, 0.96);
    if (b.fake) {
      if (Math.random() < chance) {
        b.ident = true;
        const who = b.sellerName ?? '奸商';
        this.recordExp2(
          'fake_item',
          'see',
          '慧眼识假',
          `${byMaster ? '请坐堂老丹师掌眼，' : '以神识剥开伪装，'}验出从${who}处购得的「${it.name}」实为${b.fake === 'broken' ? '残缺伪简' : '染色假丹'}！`
        );
        if (b.seller) {
          const sellerNpc = g.npcs.byId.get(b.seller);
          if (sellerNpc) {
            (sellerNpc as any)._soldPlayerFake = it.name;
            g.living?.addHate?.(sellerNpc, sellerNpc, 0, '', g.day); // 保持激活
          }
        }
        return {
          ok: true,
          isFake: true,
          msg: `${byMaster ? '老师傅拈起一嗅，冷笑一声：' : '神识刺入内里，顿现端倪：'}「${
            b.fake === 'broken'
              ? `这枚《${it.name}》玉简只刻了前三句真口诀，后面全是逆行经脉的催命符！`
              : `什么${it.name}！分明是拿低阶淬体丹浸了紫猴花汁染出来的假药！`
          }」${b.sellerName ? `（卖假货者：${b.sellerName}——找到他可当面索赔或出手严惩！）` : ''}`,
        };
      }
      return {
        ok: true,
        isFake: false,
        msg: '神识探查一圈，外层封灵蜡制得颇为老道，暂未看出明显破绽。（可去城中丹药铺请老师傅掌眼）',
      };
    }
    b.ident = true;
    return {
      ok: true,
      isFake: false,
      msg: `${byMaster ? '老师傅端详片刻，颔首道：「成色纯正，确是真品无疑。」' : '神识通透内外，灵韵浑然一体，确系真品。'}`,
    };
  }

  /** 城镇丹药铺 / 符箓斋的「请老师傅掌眼鉴宝」对话入口 */
  masterAppraiseNode(loc: LocDef): DNode {
    const g = this.game, h = g.hero;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const cands = h.bag
      .map((b, idx) => ({ b, idx, it: itemDef(b.id) }))
      .filter((x) => (x.it.type === 'pill' || x.it.type === 'scroll') && !(x.b.fake && x.b.ident));
    const opts: DOpt[] = cands.slice(0, 7).map(({ b, idx, it }) => {
      const fee = scaleFromMortalStones(Math.max(5, Math.round(it.price * 0.04)), ACTIVE_WORLD, 1);
      return {
        label: `请掌眼：${it.name}×${b.n}${b.ident ? '（已验真）' : ''}（${fee} ${curName}）`,
        disabled: b.ident || C.bagCount(h, curId) < fee,
        act: () => {
          const res = this.appraiseBagSlot(idx, true, fee);
          audio.sfx(res.isFake ? 'fail' : 'chime');
          return {
            speaker: `${loc.name} · 坐堂丹师`,
            title: '掌眼鉴伪',
            mood: res.isFake ? 'danger' : 'mystic',
            text: res.msg,
            options: [
              { label: '继续请教其他物件', act: () => this.masterAppraiseNode(loc) },
              { label: '多谢指点', act: () => null },
            ],
          };
        },
      };
    });
    opts.push({ label: '告辞', act: () => null });
    return {
      speaker: `${loc.name} · 坐堂丹师`,
      title: '丹药玉简 · 掌眼辨伪',
      text: '白发苍苍的老丹师推了推鼻梁上的水晶镜：「近来鬼市地摊上不少奸滑散修，拿淬体丹染色充作筑基灵丹、拿残篇充作古修玉简。道友若有拿不准的玩意儿，老朽替你掌掌眼。」',
      options: opts,
    };
  }

  /** 误服假丹后的追记：写入《苏寒随笔》并记下奸商姓名 */
  onConsumedFake(fk: { id: string; fake: FakeKind; seller?: string; sellerName?: string }) {
    const g = this.game, it = itemDef(fk.id);
    const who = fk.sellerName ?? '地摊奸商';
    this.recordExp2(
      'fake_item',
      'loss',
      '误服假丹',
      `轻信${who}的低价「${it.name}」，不曾验看便吞服入腹，落得丹毒攻心。切记：便宜莫贪，入口之丹必先以神识或丹师验过！`
    );
    if (fk.seller) {
      const d = g.npcs.byId.get(fk.seller);
      if (d) (d as any)._soldPlayerFake = it.name;
    }
  }

  /** 研读玉简时若为假玉简（残篇/逆脉伪简）：触发经脉反噬与道伤！返回 true 表示已拦截假玉简 */
  onTryLearnScroll(bagIdx: number): boolean {
    const g = this.game, h = g.hero;
    const b = h.bag[bagIdx];
    if (!b || !b.fake) return false;
    const it = itemDef(b.id);
    if (b.ident) {
      g.toast(`这枚${it.name}已是验明的残缺伪简，切莫强练！`, 'warn');
      return true;
    }
    b.n -= 1;
    h.bag = h.bag.filter((x) => x.n > 0);
    h.hp = Math.max(0.1, h.hp - 0.25);
    C.inflictDaoHurt(h, 12, `研读残缺假玉简${it.name}，经脉逆行受损`);
    const who = b.sellerName ?? '地摊奸商';
    if (b.seller) {
      const d = g.npcs.byId.get(b.seller);
      if (d) (d as any)._soldPlayerFake = it.name;
    }
    this.recordExp2(
      'fake_item',
      'loss',
      '伪简反噬',
      `未加鉴定便强行参悟从${who}处购得的${it.name}，岂料后半篇尽是逆乱经脉的错漏口诀，致吐血受道伤十二日。`
    );
    audio.sfx('fail');
    g.openDialog({
      speaker: '识海警兆',
      title: '假玉简反噬！',
      mood: 'danger',
      text: `你将神识沉入${it.name}，照着行功路线刚运完半个周天——\n\n丹田内灵力骤然逆冲！玉简后半截竟是胡乱拼凑的残篇伪诀！你喉头一甜，喷出一口淤血，经脉阵阵刺痛。\n\n（气血受损，染上 12 日「道伤·经脉受损」；卖假货者：${who}）`,
      options: [{ label: '可恶……记下此人了！', tone: 'bad', act: () => null }],
    });
    g.updateUI(true);
    return true;
  }

  /** 与卖过你假货的 NPC 交谈时，直接解锁当面对质索赔/动手选项！ */
  fakeSellerConfrontOpt(a: any, title: string, back: () => DNode): DOpt | null {
    const g = this.game, d: NpcData = a.d;
    const itemName = (d as any)._soldPlayerFake || (d as any)._caughtFake ||
      g.hero.bag.find((b) => b.fake && b.ident && b.seller === d.id && itemDef(b.id).name)?.id;
    if (!itemName) return null;
    const labelName = itemDef(itemName).name !== itemName ? itemDef(itemName).name : itemName;
    return {
      label: `兴师问罪：「你卖我的假${labelName}，该怎么算！」`,
      tone: 'bad',
      act: () => {
        const comp = Math.max(120, Math.round(220 * Math.pow(3, Math.max(0, d.realm - 1))));
        const coward = g.hero.realm > d.realm || d.pers === 'greedy';
        return {
          speaker: d.name,
          look: a.look,
          title,
          mood: 'danger',
          text: coward
            ? `（${d.name}脸色唰地变白，连退两步干笑）道、道友息怒！那批货也是小的从黑市收来的，一时走了眼……小的愿赔 ${comp} 灵石给道友压惊，只求高抬贵手！`
            : `（${d.name}冷笑一声，翻脸不认账）鬼市买货，离手不认！你自己眼拙看不出真假，倒来讹我？识相的赶紧滚！`,
          options: [
            ...(coward
              ? [{
                  label: `收下双倍赔偿（${comp} 灵石），饶他一回`,
                  tone: 'gold' as const,
                  act: () => {
                    const pay = Math.min(comp, Math.max(60, Math.round(d.wealth)));
                    d.wealth = Math.max(0, d.wealth - pay);
                    C.addItem(g.hero, 'mat_lingshi', comp);
                    delete (d as any)._soldPlayerFake;
                    delete (d as any)._caughtFake;
                    g.hero.bag = g.hero.bag.filter((b) => !(b.fake && b.ident && b.seller === d.id));
                    g.toast(`追回赔偿 ${comp} 灵石！`, 'good');
                    return null;
                  },
                }]
              : []),
            {
              label: '废话少说，拿命来赔！（师出有名，不减正道声望）',
              tone: 'bad',
              act: () => {
                delete (d as any)._soldPlayerFake;
                delete (d as any)._caughtFake;
                d.grudge = Math.max(1, d.grudge);
                const e = g.npcs.toEnemy(a, true);
                (e as any).righteous = true;
                a.bubble = { text: '敬酒不吃吃罚酒！', t: 3 };
                return null;
              },
            },
            { label: '暂且记下', act: back },
          ],
        };
      },
    };
  }

  // ========================================================================
  // 2.3 骗局 #5：夺舍老魔 —— 重伤“前辈”求渡灵力 → 神识对抗 / 复用 xinmo 幻境战！
  // ========================================================================
  duosheNode(
    elderName: string,
    elderRealm: number,
    isScam: boolean,
    look: Look,
    pos: { x: number; y: number },
    onFinish: () => void
  ): DNode {
    const g = this.game, h = g.hero;
    const hasMemory = this.hasExp2('duoshe');
    const opts: DOpt[] = [];

    // 1) 阅历反制选项：吃过一次亏或识破过一次后解锁！
    if (hasMemory) {
      opts.push({
        label: '（你想起邹居义与往昔夺舍凶险，退后三步，只隔空弹入一道灵气试探）',
        tone: 'gold',
        act: () => {
          onFinish();
          if (!isScam) {
            const reward = elderRealm >= 3 ? 'pill_yanghun' : 'pill_juling';
            C.addItem(h, reward, 1);
            return {
              speaker: elderName,
              look,
              mood: 'mystic',
              text: `老者微怔，随即苦笑着点点头：「小友谨慎得紧，怪不得能走到今日……也罢，这一缕灵气已够老夫压住心脉了。」\n\n他抛来一只玉瓶，化作清风远去。\n\n获得：${itemDef(reward).name}`,
              options: [{ label: '谨慎无大错', act: () => null }],
            };
          }
          return this.spawnDuosheBoss(elderName, elderRealm, look, pos, true);
        },
      });
    }

    // 2) 神识探查选项
    opts.push({
      label: '先不伸手，暗运神识探其丹田与泥丸宫（耗一成法力）',
      disabled: h.mp < 0.1,
      act: () => {
        h.mp = Math.max(0, h.mp - 0.1);
        const probeCh = clamp(0.42 + (h.realm - elderRealm) * 0.22 + this.discernBonus('duoshe'), 0.2, 0.95);
        if (isScam && Math.random() < probeCh) {
          onFinish();
          this.recordExp2('duoshe', 'see', '识破夺舍', `荒野遇重伤“前辈”${elderName}求渡灵力，神识探出其肉身早已生机断绝、泥丸宫内蛰伏着择人而噬的夺舍元神！`);
          return this.spawnDuosheBoss(elderName, elderRealm, look, pos, true);
        }
        return {
          speaker: elderName,
          look,
          title: '气息微弱',
          text: `你神识扫过，只觉老者经脉寸断、气若游丝${isScam ? '，泥丸宫处被一层古怪的灰雾遮掩，看不真切' : '，确是遭了重创，并无异状'}。\n\n老者剧烈咳嗽起来：「小友……再迟片刻，老夫这口气便散了……」`,
          options: [
            { label: '伸手抵住他背心，渡入一口灵力', tone: 'good', act: () => { onFinish(); return this.resolveDuosheTouch(elderName, elderRealm, isScam, look, pos); } },
            { label: '事有蹊跷，抽身便走', act: () => { onFinish(); return null; } },
          ],
        };
      },
    });

    // 3) 直接伸手渡入灵力
    opts.push({
      label: '上前扶住前辈，渡入一口精纯灵力',
      tone: 'good',
      act: () => {
        onFinish();
        return this.resolveDuosheTouch(elderName, elderRealm, isScam, look, pos);
      },
    });

    opts.push({ label: '修仙界闲事莫管，转身离开', act: () => { onFinish(); return null; } });

    return {
      speaker: elderName,
      look,
      title: `重伤老修士 · 似有${REALMS[clamp(elderRealm, 2, 4)].name}修为`,
      mood: 'mystic',
      text: `乱石旁倚坐着一位须发染血的老修士，胸前衣襟碎裂，气息奄奄。见你走近，他艰难地抬起眼皮：\n\n「小友留步……老夫遭仇家暗算，丹田将溃，只求小友渡一口灵力护住心脉三息。老夫储物袋中毕生珍藏与秘术玉简，愿尽数相赠……」`,
      options: opts,
    };
  }

  private spawnDuosheBoss(elderName: string, elderRealm: number, look: Look, pos: { x: number; y: number }, exposed: boolean): DNode {
    const g = this.game;
    const def = ENEMIES.yinhun;
    const r = clamp(elderRealm, 1, Math.min(4, g.hero.realm + 1));
    const e = new Enemy(def, pos.x, pos.y - 20, r, 3);
    e.name = `夺舍老魔·${elderName}残魂`;
    e.aggro = true;
    e.boss = true;
    e.maxHp = e.hp = Math.round(e.hp * 1.7);
    e.tag = 'duoshe_soul';
    g.combat.enemies.push(e);
    audio.sfx('fail');
    return {
      speaker: `夺舍老魔·${elderName}`,
      look,
      title: '图穷匕见！',
      mood: 'danger',
      text: exposed
        ? `被你一语道破，地上的“重伤老者”脖子咔嚓一歪，整具躯壳瞬间干瘪下去！一团碧绿妖异的元神自天灵盖冲出，发出夜枭般的厉啸：\n\n「好狡猾的小辈！既被你看破，本座便先灭你神魂，强占躯壳！」`
        : `老魔残魂尖啸而出，直扑你的面门！`,
      options: [{ label: '凝神迎战！', tone: 'bad', act: () => null }],
    };
  }

  private resolveDuosheTouch(elderName: string, elderRealm: number, isScam: boolean, look: Look, pos: { x: number; y: number }): DNode {
    const g = this.game, h = g.hero;
    if (!isScam) {
      // 真落难前辈：厚报！
      h.mp = Math.max(0.1, h.mp - 0.15);
      const pill = elderRealm >= 3 ? 'pill_yanghun' : 'pill_juling';
      const sc = g.combat.randomScroll(Math.min(4, elderRealm));
      C.addItem(h, pill, 2);
      if (sc) C.addItem(h, sc, 1);
      g.ws.rep = clamp(g.ws.rep + 5, -100, 100);
      return {
        speaker: elderName,
        look,
        title: '雪中送炭',
        mood: 'mystic',
        text: `一口精纯灵力渡入，老者灰败的脸上终于泛起一丝血色。他长吐一口浊气，郑重向你一揖：\n\n「老夫这条命是小友捡回来的！些许丹药与随身玉简，请务必收下。」\n\n获得：${itemDef(pill).name}×2${sc ? `、${itemDef(sc).name}` : ''}　（正道声望 +5）`,
        options: [{ label: '前辈保重', act: () => null }],
      };
    }

    // 夺舍老魔发动夺舍！
    const hasWood = C.bagCount(h, 'mat_yanghunmu') > 0;
    const mySoul = g.sense * (h.gongfa === 'dayan' ? 1.5 : 1) * (hasWood ? 1.35 : 1);
    const foeR = clampWorldRealm(elderRealm, ACTIVE_WORLD, true);
    const foeSoul = (REALMS[foeR]?.sense[2] ?? 60) * 0.85;

    // 神识碾压（如修成天衍诀或佩有养魂木）：当场反吞老魔元神！
    if (mySoul >= foeSoul * 1.45) {
      const gainSense = 4 + Math.max(1, elderRealm);
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      h.senseBonus += gainSense * 0.03;
      C.addItem(h, curId, scaleFromMortalStones(180 * Math.pow(3, elderRealm - 1), ACTIVE_WORLD, 1));
      this.recordExp2('duoshe', 'see', '反吞夺舍', `${elderName}妄图借求救夺舍于你，怎奈你神识远胜于他，识海中反将其残魂生生震碎吞噬，神识大进！`);
      audio.sfx('break');
      return {
        speaker: '识海反噬',
        look,
        title: '神识碾压 · 反吞残魂！',
        mood: 'mystic',
        text: `手掌相抵的一瞬，老者五指如铁钩扣死你的脉门，狂笑道：「好副年轻躯壳，归本座了！」一团黑绿元神顺经脉直扑你泥丸宫！\n\n然而他刚撞入你的识海，便见你神识浩瀚如渊${hasWood ? '、更有养魂木清光镇守' : ''}！老魔惊骇欲绝：「怎会如此强横——不！！」\n\n你心念一动，当场将其残魂碾碎反吞，神识修为暴涨！（永久神识 +${Math.round(gainSense * 3)}%，并拾得其遗留${curName}）`,
        options: [{ label: '（拍了拍衣袖，如同当年送走邹大夫）', tone: 'gold', act: () => null }],
      };
    }

    // 否则：进入识海夺舍幻境战（直接复用心魔战机制）！
    return {
      speaker: `夺舍老魔·${elderName}`,
      look,
      title: '夺舍入侵识海！',
      mood: 'danger',
      text: `手掌触及他背心的刹那，一股冰寒彻骨的尸体气息传来——他根本没有心跳！\n\n「桀桀桀……等了三年，总算等到个灵根尚可的替死鬼！」老者猛然暴起，眉心窜出一团凄厉血魂，硬生生撞入你的泥丸宫识海！\n\n天旋地转之间，你的神魂已被拖入识海幻境——守不住灵台，今日便要沦为他人躯壳！`,
      options: [
        {
          label: '紧守灵台，与老魔决战识海！',
          tone: 'bad',
          act: () => this.duosheIllusionBattle(elderName, elderRealm),
        },
      ],
    };
  }

  /** 复用 xinmo 幻境问答博弈的三重识海夺舍对抗 */
  private duosheIllusionBattle(elderName: string, elderRealm: number): DNode {
    const g = this.game, h = g.hero;
    const stages: { title: string; text: string; opts: { label: string; score: number; after: string }[] }[] = [
      {
        title: '第一重 · 威逼利诱',
        text: `识海翻涌如墨。${elderName}的元神化作遮天巨影压下：\n\n「痴儿！凭你这般资质，苦熬百年也不过一抔黄土。不如放开识海，本座替你修至元婴化神，替你名震天下，岂不快哉？」`,
        opts: [
          { label: '「纵是伪灵根一步一血，那也是我苏寒自己的道！」', score: 1, after: '一言喝出，灵台金光大盛，老魔巨影被震退三丈！' },
          { label: '（假意松开一丝识海防线，诱他孤军深入再合围绞杀）', score: 1, after: '老魔狂喜扑入，却撞上你早已布下的神识尖刺，惨嚎一声！' },
          { label: '（心神凛惧，拼命往后退缩固守）', score: -1, after: '气势一怯，黑雾趁机吞没了半片识海！' },
        ],
      },
      {
        title: '第二重 · 旧影噬心',
        text: `老魔见强攻不下，黑雾幻化出昔日青玄门回春谷的药庐——邹大夫与你一路杀过的亡魂齐齐伸手拽住你的双足：\n\n「你杀孽深重、孤身无依，谁还记得你是谁？睡吧，睡过去便不累了……」`,
        opts: [
          { label: '并指如剑，以清明神识直斩幻象根源！', score: 1, after: '剑意横扫识海，药庐与血影寸寸崩裂，显出老魔气急败坏的本体！' },
          { label: '与幻影纠缠辩解', score: -1, after: '你心神一乱，老魔趁隙咬去你一缕神魂本源！' },
        ],
      },
      {
        title: '第三重 · 元神死斗',
        text: `${elderName}的残魂已是强弩之末，竟不惜燃烧本源化作血色骷髅，做最后一扑：「小辈，要死一起死！」`,
        opts: [
          { label: '倾尽神识反扑，将这团无根残魂生生炼化吞噬！', score: 1, after: '两股神魂轰然对撞！老魔究竟失了肉身支撑，在惨叫声中化作最精纯的魂力散入你的识海！' },
          { label: '慌乱闪避', score: -1, after: '血色骷髅在识海中轰然自爆，震得你七窍溢血！' },
        ],
      },
    ];

    let score = h.gongfa === 'dayan' ? 1 : 0;
    const step = (i: number): DNode => {
      if (i >= stages.length) {
        if (score >= 1) {
          h.hp = Math.max(0.25, h.hp - 0.35);
          h.senseBonus += 0.1;
          const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
          const ls = scaleFromMortalStones(160 * Math.pow(3, Math.max(0, elderRealm - 1)), ACTIVE_WORLD, 1);
          C.addItem(h, curId, ls);
          this.recordExp2('duoshe', 'see', '夺舍惊魂', `遭老魔${elderName}突袭夺舍，于识海幻境死战三合将其反噬炼化，神识凝练大进。自此遇重伤陌生修士绝不贸然近身。`);
          audio.sfx('break');
          return {
            speaker: '识海清明',
            title: '反灭老魔 · 神识大进！',
            mood: 'mystic',
            text: `你猛然睁开双眼，冷汗已湿透重衣。面前那具枯槁躯壳早已化作枯骨，唯有一枚储物戒滚落尘埃。\n\n炼化了老魔残余的精纯魂力，你的神识比往日强韧了一大截！（神识永久提升 +10%，获${curName} ${ls}）`,
            options: [{ label: '好险……此地不宜久留！', tone: 'gold', act: () => null }],
          };
        } else {
          // 败北：问道残卷护主弹开残魂，但遭受重度道伤+折寿+掉修为
          h.hp = 0.12;
          h.mp = 0.05;
          h.lifeLost += 4;
          h.exp = Math.floor(h.exp * 0.8);
          C.inflictDaoHurt(h, 40, `险遭老魔${elderName}夺舍，神魂与经脉重创`);
          this.recordExp2('duoshe', 'loss', '险遭夺舍', `轻信重伤“前辈”${elderName}，险些在识海中被夺去肉身，幸赖怀中残卷微热惊退残魂，却落得四十日重度道伤、折寿四载。`);
          audio.sfx('fail');
          return {
            speaker: '死里逃生',
            title: '神魂重创 · 道伤缠身',
            mood: 'danger',
            text: `识海即将失守的一刹，你怀中的问道残卷骤然发烫，卷上古篆金光一闪，将老魔残魂硬生生震飞出去！\n\n老魔残魂惊怒交加，不敢再留，化作黑烟遁逃。你虽捡回一条性命，却七窍流血、神魂撕裂——\n\n（折损寿元 4 载、修为倒退两成，并染上 40 日重度「道伤·经脉受损」！）`,
            options: [{ label: '挣扎起身，速觅良药闭关疗伤……', tone: 'bad', act: () => null }],
          };
        }
      }
      const cur = stages[i];
      return {
        speaker: '识海夺舍战',
        title: cur.title,
        mood: 'danger',
        text: cur.text,
        options: cur.opts.map((o) => ({
          label: o.label,
          act: () => {
            score += o.score;
            return {
              speaker: '识海交锋',
              title: cur.title,
              mood: o.score > 0 ? 'mystic' : 'danger',
              text: `${o.after}\n\n${o.score > 0 ? '（灵台稳固 ↑）' : '（识海动摇 ↓）'}`,
              options: [{ label: '继续死战', act: () => step(i + 1) }],
            };
          },
        })),
      };
    };
    return step(0);
  }

  // ========================================================================
  // 3.1 战败重做 + 道伤 + 储物袋被搜与活世界销赃追回链 + 死敌补刀 + 魔窟脱困
  // ========================================================================
  onPlayerDown(killer?: Enemy | null): boolean {
    const g = this.game, h = g.hero, p = g.player;
    const foe = killer ?? this.lastAttacker;
    this.lastAttacker = null;

    // 0) 随行道侣 / 结拜同伴舍身护主保命链
    const followers = g.npcs?.followers() ?? [];
    if (followers.length > 0) {
      const guard = followers[0];
      guard.d.inj = g.day + 25;
      g.npcs.dismiss(guard.d.id);
      this.evacuateToNearestTown(false);
      h.hp = 0.28; h.mp = 0.2;
      C.inflictDaoHurt(h, 10, `战败重伤，蒙${guard.d.name}拼死护送脱险`);
      g.toast(`危急关头，${guard.d.name}拼着重伤架起遁光将你救回城中！（染上 10 日轻度道伤）`, 'warn');
      audio.sfx('fail');
      g.updateUI(true);
      return true;
    }

    const foeNpc = foe?.npcId ? g.npcs.byId.get(foe.npcId) ?? null : null;
    const isHuman = !!foe && (foe.def.kind === 'human' || !!foeNpc);
    const isMortalEnemy = !!(foeNpc && foeNpc.grudge >= 2);
    const isDemon = isHuman && (
      foeNpc?.faction === 'demon' ||
      foe?.def.id === 'moxiu' ||
      foe?.def.id === 'jindan_mo' ||
      ['guiling', 'hehuan', 'yuling', 'qianhuan', 'tiansha', 'yinluo', 'tianmo'].includes(foe?.school ?? '')
    );

    // 0.5) 天道档：死亡即碑——战败有几率重伤不治（死敌必死，人类修士两成二，妖兽一成二）
    const leth = g.daoxin?.lethalChance?.(isHuman, isMortalEnemy) ?? 0;
    if (leth > 0 && Math.random() < leth) {
      return this.trueDeath(foeNpc?.name ?? foe?.name ?? '重伤', foeNpc?.id, isMortalEnemy ? '死敌补刀，斩草除根' : isHuman ? '败于修士之手，重伤不治' : '为妖兽所伤，失血过多');
    }

    // 1) 死敌（grudge = 2）：绝不留手，直接补刀！
    if (isMortalEnemy && foeNpc) {
      return this.handleMortalEnemyFinish(foeNpc);
    }

    // 2) 魔修：35% 概率被掳回魔窟炼宝（醒来在魔修洞府，潜行/爆发微玩法逃脱）
    if (isDemon && Math.random() < 0.35) {
      return this.handleDemonCapture(foe!, foeNpc);
    }

    // 3) 劫修 / 仇家 / 人类修士：搜走储物袋（非装备栏非绑定物 70–100%），转入活世界 NPC 储物袋并生成「寻仇夺回」追踪！
    if (isHuman && foe) {
      return this.handleHumanLootBag(foe, foeNpc, isDemon);
    }

    // 4) 妖兽 / 残魂：只想吃肉不懂搜袋，路人救回城镇 + 12–24 日道伤
    const lostExp = Math.floor(C.need(h) * C.INSIGHT * 0.1);
    h.exp = Math.max(0, h.exp - lostExp);
    const lost: string[] = [];
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const ls = C.bagCount(h, curId);
    if (ls > 0) { const n = Math.ceil(ls * 0.1); C.removeItem(h, curId, n); lost.push(`${curName} ${n}`); }
    const pool = h.bag.filter((b) => b.id !== 'mat_lingshi' && b.id !== 'mat_lingjing' && b.id !== 'mat_xianyuan' && itemDef(b.id).price > 0 && itemDef(b.id).type !== 'artifact' && itemDef(b.id).type !== 'scroll');
    for (let i = 0; i < 2 && pool.length; i++) {
      const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      const n = Math.max(1, Math.floor(b.n * 0.35));
      C.removeItem(h, b.id, n, b.age ?? 0);
      lost.push(`${itemDef(b.id).name}×${n}`);
    }
    const hurtDays = Math.round(rint(12, 24) * (g.daoxin?.hurtMul?.() ?? 1));
    C.inflictDaoHurt(h, hurtDays, `被${foe?.name ?? '凶兽'}重创，经脉受损`);
    const town = this.evacuateToNearestTown(true);
    g.toast(
      `你被${foe?.name ?? '妖兽'}击倒昏死，幸得过路采药人救回${town?.name ?? '荒村'}。修为损 ${lostExp}，染上 ${hurtDays} 日「道伤·经脉受损」（修炼-40%、法力上限-20%）${lost.length ? '，遗落：' + lost.join('、') : ''}。`,
      'warn'
    );
    audio.sfx('fail');
    g.updateUI(true);
    return true;
  }

  /** 天道档：真死——立碑，本世即终（碑与凶手留在下一世的世界里） */
  trueDeath(killer: string, killerId: string | undefined, cause: string): boolean {
    const g = this.game;
    // 脚边还没拾起的补发掉落不算白丢：随遗物一并刻进碑里，下一世在碑前取回
    const dropped = g.protectedLoot().map((d) => ({ id: d.id, n: d.n }));
    g.combat.reset(); g.pursuit?.reset();
    g.hero.hp = 0; g.hero.dead = true;
    audio.sfx('fail');
    const s = g.daoxin.onTrueDeath(killer, cause, killerId, dropped);
    g.updateUI(true);
    g.openDialog(g.daoxin.deathNode(s));
    return true;
  }

  /** 死敌补刀：若有存档点则回档复活；若本局尚无任何存档，则重创折寿搜空袋子留一线生机 */
  private handleMortalEnemyFinish(foeNpc: NpcData): boolean {
    const g = this.game, h = g.hero;
    const latest = (g.constructor as any).latestSlot?.() as string | null;
    g.resetCombatKeepingDrops();   // 回档分支随后由 load() 用存档里的掉落覆盖；兜底分支留在原地
    g.pursuit?.reset();
    audio.sfx('fail');

    // 天道档：单存档已随时盖写，无路可回——死敌补刀就是真死
    if (!g.daoxin.reviveAllowed()) return this.trueDeath(foeNpc.name, foeNpc.id, '死敌补刀，斩草除根');

    if (latest) {
      // 有存档点：弹出死敌补刀界面，点击立即从存档点复活（在自动化测试无 UI 点击时也标记 pendingReviveSlot 并提供方法）
      (g.ws.flags as any).lastKilledByNemesis = foeNpc.name;
      g.openDialog({
        speaker: foeNpc.name,
        title: '血仇死敌 · 斩草除根！',
        mood: 'danger',
        text: `你护体灵光彻底碎裂，重重跌落尘埃。\n\n${foeNpc.name}一步步走到你身前，眼中没有半分怜悯：「${foeNpc.why ? foeNpc.why + '——' : ''}今日落在我手里，还想留活口不成？」\n\n寒光一闪，飞剑直贯丹田！（死敌绝不留手，须自最近存档点回溯重来，或常备替身符保命）`,
        options: [
          {
            label: '回溯天机（自最近存档点复活）',
            tone: 'bad',
            act: () => {
              g.load(latest);
              g.toast(`死敌补刀不留活口——已回溯至最近存档点。切记常备【替身符】！`, 'warn');
              return null;
            },
          },
        ],
      });
      return true;
    }

    // 极端兜底：全新开局尚未写入任何存档时，避免死档——师门巡山灵光惊走死敌，但储物袋被洗劫 + 60 日重度道伤 + 折寿 5 年
    this.lootHeroBagToNpc(foeNpc, 0.95);
    h.lifeLost += 5;
    C.inflictDaoHurt(h, 55, `遭死敌${foeNpc.name}补刀重创丹田，险些陨落`);
    const town = this.evacuateToNearestTown(true);
    g.openDialog({
      speaker: '九死一生',
      title: '死敌补刀 · 侥幸未死',
      mood: 'danger',
      text: `${foeNpc.name}一剑刺穿你的气海，正欲取你性命，天边忽有一道高阶修士遁光掠过！${foeNpc.name}一把扯走你的储物袋，恨恨遁去。\n\n你在${town?.name ?? '城郊'}血泊中醒来：储物袋几被搜空、折寿五载、经脉重创（道伤 55 日）！`,
      options: [{ label: '此仇必报……', tone: 'bad', act: () => null }],
    });
    g.updateUI(true);
    return true;
  }

  /** 劫修 / 仇家击倒玩家：搜走 70–100% 非装备栏物品，装进该 NPC 真实储物袋，生成追踪与销赃链 */
  private handleHumanLootBag(foe: Enemy, foeNpc: NpcData | null, isDemon: boolean): boolean {
    const g = this.game, h = g.hero;
    const culprit = foeNpc ?? this.promoteEnemyToLivingNpc(foe, isDemon);
    const bf = g.daoxin?.bagFrac?.() ?? [0.72, 1.0];   // 天道篇：道心档位决定被搜走多少
    const frac = rand(bf[0], bf[1]);
    const taken = this.lootHeroBagToNpc(culprit, frac);
    const hurtDays = Math.round((isDemon ? rint(26, 45) : rint(16, 36)) * (g.daoxin?.hurtMul?.() ?? 1));
    C.inflictDaoHurt(h, hurtDays, `败于${culprit.name}之手，经脉受创`);

    // 让夺袋者立刻动身去附近城镇坊市准备花钱销赃！
    const nearTowns = LOCATIONS.filter((l) => (l.type === 'town' || l.type === 'city' || l.type === 'isle') && (l.map ?? 'renjie') === ACTIVE_MAP)
      .sort((a, b) => Math.hypot(a.x * WORLD_SCALE - culprit.x, a.y * WORLD_SCALE - culprit.y) - Math.hypot(b.x * WORLD_SCALE - culprit.x, b.y * WORLD_SCALE - culprit.y));
    const destTown = nearTowns[0] ?? LOC_BY_ID.get(culprit.home);
    if (destTown) {
      culprit.plan = {
        k: 'trade',
        to: destTown.id,
        why: `去${destTown.name}坊市把刚从苏寒身上搜刮来的丹药灵物出手换成灵石`,
        until: g.day + rint(8, 18),
        t0: Math.floor(g.day),
        x: Math.round(destTown.x * WORLD_SCALE),
        y: Math.round(destTown.y * WORLD_SCALE),
      };
      culprit.goal = 'travel';
      culprit.tx = culprit.plan.x!;
      culprit.ty = culprit.plan.y!;
    }
    culprit.grudge = Math.max(1, culprit.grudge);
    culprit.why = culprit.why || '曾击倒你并夺走储物袋';
    culprit.met = true;

    const rec: StolenBag = {
      id: this.stolenSeq++,
      culpritId: culprit.id,
      culpritName: culprit.name,
      day: Math.floor(g.day),
      map: ACTIVE_MAP,
      stones: taken.stones,
      items: taken.items,
      spentStones: 0,
      soldItems: [],
      recovered: false,
    };
    (g.ws.stolenBags ??= []).push(rec);

    this.recordExp2(
      'bag_robbed',
      'loss',
      '败北失袋',
      `斗法不敌${culprit.name}，昏迷之际被搜走灵石 ${taken.stones} 与袋中大半家当，更落得 ${hurtDays} 日道伤。修仙界败北一次便倾家荡产，不可不慎！`
    );

    const town = this.evacuateToNearestTown(true);
    const lootSummary = [
      ...(taken.stones > 0 ? [`灵石 ${taken.stones}`] : []),
      ...taken.items.slice(0, 5).map((x) => `${itemDef(x.id).name}${x.n > 1 ? '×' + x.n : ''}`),
    ].join('、');

    audio.sfx('fail');
    g.openDialog({
      speaker: '储物袋被夺！',
      title: `重伤醒来 · 道伤 ${hurtDays} 日`,
      mood: 'danger',
      text: `你在剧痛中失去知觉，隐约感到有人粗暴地扯下你腰间的储物袋……\n\n三日后你在${town?.name ?? '路边破庙'}醒来：丹田经脉受损（道伤 ${hurtDays} 日：修炼速度 -40%、法力上限 -20%），身上的装备与贴身藏好的问道残卷尚在，但袋中财物已被【${culprit.name}】搜刮一空！\n\n被夺财物：${lootSummary || '随身杂物'}${taken.items.length > 5 ? ' 等' : ''}\n\n（地图上已标出红字「夺」追踪${culprit.name}行踪——他正赶往坊市销赃花钱，去晚了你的丹药宝物就真被他卖光花尽了！）`,
      options: [{ label: '咬牙调息，早日追回失物！', tone: 'bad', act: () => null }],
    });
    g.updateUI(true);
    return true;
  }

  /** 将无名野生劫修/魔修转正登记入 npcs.list，使其拥有真实储物袋与活世界买卖行为 */
  private promoteEnemyToLivingNpc(foe: Enemy, isDemon: boolean): NpcData {
    const g = this.game;
    const nearTown = LOCATIONS.find((l) => (l.type === 'town' || l.type === 'city') && (l.map ?? 'renjie') === ACTIVE_MAP) ?? LOCATIONS[0];
    const cleanName = foe.name.replace(/^(劫修头目|拦路劫修|赏金猎人·|趁火打劫的邪修)/, '') || makeName(Math.random, 'm');
    const fullName = cleanName.length >= 2 ? cleanName : makeName(Math.random, 'm');
    const id = 'robber_' + Math.floor(g.day) + '_' + Math.floor(Math.random() * 9999);
    const d: NpcData = {
      id,
      name: fullName,
      sex: 'm',
      role: 'cultivator',
      realm: clamp(foe.realm, 1, 4),
      stage: clamp(foe.stage, 0, REALMS[clamp(foe.realm, 1, 4)].stages.length - 1),
      faction: isDemon ? 'demon' : 'rogue',
      home: nearTown.id,
      pers: isDemon ? 'ruthless' : 'greedy',
      favor: -35,
      grudge: 1,
      met: true,
      alive: true,
      age: 28 + rint(0, 40),
      life: REALMS[clamp(foe.realm, 1, 4)].life,
      x: foe.x,
      y: foe.y,
      tx: foe.x,
      ty: foe.y,
      goal: 'travel',
      until: g.day + 30,
      wealth: 40 * foe.realm,
      seed: Math.floor(Math.random() * 1e9),
      map: ACTIVE_MAP,
      bag: {},
      arts: [],
    };
    g.npcs.list.push(d);
    g.npcs.byId.set(d.id, d);
    g.living?.ensure(d);
    return d;
  }

  /** 从主角储物袋搜走 70–100% 非装备、非主线绑定的物品与灵石，真放入 culprit 的 bag 与 wealth */
  lootHeroBagToNpc(culprit: NpcData, frac: number): { stones: number; items: { id: string; n: number; age?: number }[] } {
    const g = this.game, h = g.hero;
    g.living?.ensure(culprit);
    const equipped = new Set(Object.values(h.equip ?? {}).filter(Boolean) as string[]);
    const items: { id: string; n: number; age?: number }[] = [];

    // 搜走本界通行货币
    const curId = worldCurrencyId(ACTIVE_WORLD);
    const lsHave = C.bagCount(h, curId);
    const stones = Math.min(lsHave, Math.round(lsHave * frac));
    if (stones > 0) {
      C.removeItem(h, curId, stones);
      culprit.wealth = (culprit.wealth ?? 0) + stones;
    }

    // 搜走非装备栏、非 price===0 绑定信物的物品（70~100%）
    const snap = [...h.bag];
    for (const b of snap) {
      if (b.id === 'mat_lingshi' || b.id === 'mat_lingjing' || b.id === 'mat_xianyuan') continue;
      const def = itemDef(b.id);
      if (def.price <= 0 || def.type === 'misc') continue; // 问道残卷、大挪移令、问仙令等贴身秘宝不丢
      if (equipped.has(b.id)) continue;                    // 已祭出在装备栏上的护甲/飞行器/靴子不丢
      // 成叠之物必被搜走 frac 份（不会整叠漏掉）；单件才掷骰
      if (b.n === 1 && Math.random() > frac) continue;
      const takeN = b.n === 1 ? 1 : Math.max(1, Math.round(b.n * frac));
      b.n -= takeN;
      culprit.bag ??= {};
      culprit.bag[b.id] = (culprit.bag[b.id] ?? 0) + takeN;
      items.push({ id: b.id, n: takeN, age: b.age });
    }
    h.bag = h.bag.filter((b) => b.n > 0);
    // 清理快捷栏里已不在袋中的消耗符箓/未装备法器
    h.hotbar = h.hotbar.map((slot) => {
      if (!slot) return null;
      if (slot.startsWith('art:') || slot.startsWith('tal:')) {
        const iid = slot.slice(4);
        if (!equipped.has(iid) && !h.bag.some((b) => b.id === iid)) return null;
      }
      return slot;
    });
    return { stones, items };
  }

  /** 钩入 living.ts doTrade：当夺袋仇家在坊市卖货、买丹花钱时，真实消化赃物并提示玩家“去晚了东西真没了”！ */
  onNpcTradeDigest(d: NpcData, soldIds: string[], spentStones: number) {
    const list = this.game.ws.stolenBags;
    if (!list?.length) return;
    const sb = list.find((x) => !x.recovered && x.culpritId === d.id);
    if (!sb) return;
    let changed = false;
    for (const id of soldIds) {
      if (sb.items.some((x) => x.id === id)) {
        (sb.soldItems ??= []).push(itemDef(id).name);
        changed = true;
      }
    }
    if (spentStones > 0 && (sb.spentStones ?? 0) < sb.stones) {
      sb.spentStones = Math.min(sb.stones, (sb.spentStones ?? 0) + spentStones);
      changed = true;
    }
    if (changed && Math.random() < 0.5) {
      const where = LOC_BY_ID.get(d.plan?.to ?? d.home)?.name ?? '坊市';
      this.game.news(`传闻${d.name}在${where}大肆挥霍，出手了一批来路不明的丹药灵物。`, 'rumor');
    }
  }

  /** 当玩家追杀并斩杀夺袋仇家时，结算夺回战果 */
  onNpcKilledByPlayer(d: NpcData) {
    const list = this.game.ws.stolenBags;
    if (!list?.length) return;
    const g = this.game, h = g.hero;
    for (const sb of list) {
      if (!sb.recovered && sb.culpritId === d.id) {
        sb.recovered = true;
        const lostNames = sb.soldItems?.length ? `（其中${sb.soldItems.slice(0, 3).join('、')}已被其提前卖掉挥霍）` : '（所幸追得及时，大半原物尚在其储物袋中！）';
        this.game.toast(`手刃夺袋仇家${d.name}，夺回储物袋！${lostNames}`, 'good');
        // v0.52 前世之仇：夺回的不只是东西，还有上一世没走完的那口气。
        if (sb.culpritId.startsWith('stele_')) {
          const sid = Number(sb.culpritId.slice(6));
          const stele = g.daoxin?.allSteles?.().find((s) => s.id === sid);
          if (stele && !stele.avenged) {
            stele.avenged = true;
            g.daoxin?.writeStele?.(stele);
            const gain = Math.round(C.need(h) * C.INSIGHT * (1.2 + Math.min(2, stele.year * 0.02)));
            C.gainExp(h, gain, []);
            this.recordExp2('stele_avenged', 'see', '前世之仇已了',
              `${stele.place}那座碑上刻的名字，今日总算划去一笔。${d.name}伏诛，前世遗物归位——上一世欠下的这一口气，还清了。`);
            g.news(`${stele.place}的旧碑前有人焚香一炷：碑上那位修士的仇，报了。`, 'personal');
            g.toast(`碑上前尘一笔勾销。前人未走完的路，从今日起由你接着走。（修为 +${gain}）`, 'good');
          }
        }
      }
    }
  }

  /** 魔修掳人炼宝：醒来在魔修洞府/血池石牢，提供潜行/燃血破禁/引爆丹炉三种逃脱微玩法 */
  private handleDemonCapture(foe: Enemy, foeNpc: NpcData | null): boolean {
    const g = this.game, h = g.hero, p = g.player;
    // 找一处偏远险地或魔宗附近作为魔修洞窟坐标
    let cx = p.x, cy = p.y;
    for (let i = 0; i < 20; i++) {
      const an = Math.random() * Math.PI * 2, dist = rand(3200, 6500);
      const tx = clamp(p.x + Math.cos(an) * dist, 600, WORLD_W - 600);
      const ty = clamp(p.y + Math.sin(an) * dist, 600, WORLD_H - 600);
      if (g.terrain.isLand(tx, ty) && g.terrain.walkFactor(tx, ty) > 0.3 && !g.terrain.inLocZone(tx, ty, 500)) {
        cx = tx; cy = ty; break;
      }
    }
    p.x = cx; p.y = cy; p.st = new CharState(cx, cy); g.cam.x = cx; g.cam.y = cy;
    p.flying = false; p.sitting = false; g.destination = null; g.gathering = null;
    g.resetCombatKeepingDrops(); g.pursuit?.reset();   // 被掳走也要留着脚边的补发掉落：走回原处还能捡
    h.hp = 0.25; h.mp = 0.12; g.day += 2;
    C.inflictDaoHurt(h, 24, '被魔修掳入血煞洞窟，阴煞侵脉');

    const captorName = foeNpc?.name ?? foe.name ?? '黑煞魔修';
    const stealthCh = clamp(0.42 + (h.arts.some((a) => a.id === 'lianxi') ? 0.25 : 0) + (h.gongfa === 'dayan' ? 0.15 : 0), 0.3, 0.9);
    this.recordExp2('demon_captive', 'loss', '魔窟脱困', `战败落入魔修${captorName}之手，被拘于阴煞石窟拟作炼魂血食，九死一生方才脱困。`);

    audio.sfx('fail');
    g.openDialog({
      speaker: '阴煞魔窟',
      title: `被${captorName}掳走炼宝！`,
      mood: 'danger',
      text: `冰冷的血腥气将你呛醒——你并未死在荒野，而是被封住大半气海，扔在一座阴森的魔修洞府石牢里！\n\n隔着石栅，${captorName}正往血池丹炉下添置骨柴，你的储物袋就搁在洞口石案上：「待子时阴气最盛，便把这小子的精血元神一并抽出来祭幡……」\n\n（你经脉受创染上 24 日道伤，必须在子时前设法自救逃出魔窟！）`,
      options: [
        {
          label: `运转敛息术，趁其添柴背身摸回储物袋潜逃（把握约 ${Math.round(stealthCh * 100)}%）`,
          tone: 'gold',
          act: () => {
            if (Math.random() < stealthCh) {
              h.mp = 0.35;
              g.toast('你屏息如死石，顺着暗影摸回储物袋，悄无声息溜出了魔窟！', 'good');
              return null;
            }
            // 潜行失手：惊动魔修看守，储物袋抢回八成，带伤杀出！
            const guard = new Enemy(ENEMIES.moxiu, cx + 140, cy + 40, clamp(foe.realm, 1, 4), Math.max(0, foe.stage - 1));
            guard.name = `${captorName}的看守魔徒`;
            guard.aggro = true;
            g.combat.enemies.push(guard);
            g.toast('石门禁制微响——看守魔徒惊觉扑来！杀出去或祭符速遁！', 'warn');
            return null;
          },
        },
        {
          label: '逆转精血冲开禁制，顺手席卷炉边魔材强行杀出！（折寿 1 载，得魔材）',
          tone: 'bad',
          act: () => {
            h.lifeLost += 1;
            h.hp = 0.55; h.mp = 0.65;
            C.addItem(h, h.realm >= 2 ? 'mat_shisha' : 'mat_yaodan1', 1);
            const guard = new Enemy(ENEMIES.moxiu, cx + 180, cy + 30, clamp(foe.realm, 1, 4), Math.max(0, foe.stage - 1));
            guard.name = captorName;
            guard.hp = Math.round(guard.maxHp * 0.55); // 被血爆震伤
            guard.aggro = true;
            g.combat.enemies.push(guard);
            g.juice(0.08, 0.6);
            g.toast(`你喷出一口精血震碎禁制，一把抓回储物袋与炉边灵材！${captorName}被气浪掀翻，怒吼追来！`, 'warn');
            return null;
          },
        },
        {
          label: '暗引一缕火劲点炸血池丹炉，趁浓烟逃出生天（遗落两成本界灵钞，安全脱身）',
          act: () => {
            const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
            const ls = C.bagCount(h, curId);
            const dropLs = Math.round(ls * 0.22);
            if (dropLs > 0) C.removeItem(h, curId, dropLs);
            this.evacuateToNearestTown(false);
            g.toast(`轰然巨响中丹炉炸裂，黑烟弥漫洞窟！你抓起大半储物袋趁乱遁至安全处（遗落${curName} ${dropLs}）。`, 'info');
            return null;
          },
        },
      ],
    });
    g.updateUI(true);
    return true;
  }

  /** 将主角挪回最近的城镇落脚点并清理战斗状态 */
  private evacuateToNearestTown(addDays: boolean): LocDef | null {
    const g = this.game, h = g.hero, p = g.player;
    let best: LocDef | null = null, bd = 1e12;
    for (const l of LOCATIONS) {
      if (l.type !== 'town' && l.type !== 'city') continue;
      const d = Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y);
      if (d < bd) { bd = d; best = l; }
    }
    if (best) {
      const z = g.terrain.locZones[LOCATIONS.indexOf(best)];
      const tx = best.x * WORLD_SCALE;
      let ty = best.y * WORLD_SCALE + (z ? z.ry * 0.9 : 300);
      for (let r = 0; r < 1500 && g.terrain.walkFactor(tx, ty) <= 0; r += 60) ty += 60;
      p.x = tx; p.y = ty; p.st = new CharState(tx, ty); g.cam.x = tx; g.cam.y = ty;
    }
    h.hp = 0.3; h.mp = 0.3;
    if (addDays) g.day += 3;
    p.flying = false; p.sitting = false; g.destination = null; g.gathering = null;
    g.resetCombatKeepingDrops(); g.pursuit?.reset(); g.combat.fade = 1;   // 掉落留在跌倒处，不随救援消失
    return best;
  }

  // ========================================================================
  // 地图标记与大事记「眼下机缘」：实时追踪夺走你储物袋的仇家！
  // ========================================================================
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const g = this.game, out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const sb of g.ws.stolenBags ?? []) {
      if (sb.recovered) continue;
      const d = g.npcs.byId.get(sb.culpritId);
      if (!d || !d.alive) { sb.recovered = true; continue; }
      if (npcMap(d) !== ACTIVE_MAP) continue;
      out.push({
        x: d.x,
        y: d.y,
        glyph: '夺',
        color: '#ff3b30',
        ring: 450,
        name: `夺袋仇家：${d.name}（${realmName(d.realm, d.stage)}）`,
      });
    }
    return out;
  }

  chances(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] {
    const g = this.game, p = g.player;
    const out: { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] = [];
    for (const sb of g.ws.stolenBags ?? []) {
      if (sb.recovered) continue;
      const d = g.npcs.byId.get(sb.culpritId);
      if (!d || !d.alive) { sb.recovered = true; continue; }
      const onMap = npcMap(d) === ACTIVE_MAP;
      const far = `${dirName(d.x - p.x, d.y - p.y)}方约 ${Math.round(Math.hypot(d.x - p.x, d.y - p.y) / 30)} 丈`;
      const soldTxt = sb.soldItems?.length ? `（已变卖：${sb.soldItems.slice(0, 3).join('、')}！）` : '（尚未变卖干净，速去追杀夺回！）';
      out.push({
        t: `寻仇夺回 · ${d.name}`,
        d: `劫走了你的储物袋（灵石 ${sb.stones}、宝物 ${sb.items.length} 种）${soldTxt}${onMap ? '，现位于' + far : ''}`,
        x: onMap ? d.x : undefined,
        y: onMap ? d.y : undefined,
        hot: true,
        tone: 'bad',
      });
    }
    return out;
  }
}
