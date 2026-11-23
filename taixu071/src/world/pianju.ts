// 第五十一步「天道」· 骗局池收尾四件：#8 结拜图谋 · #10 洞府以次充好 · #11 商队夹带 · #12 血婴哭声
//
// 与前作同一套写法：不造新贴纸，全部长在既有骨架上——
// 结拜走 relations.ts 的 bond、夺走的功法法宝走 renxin.ts 的 StolenBag 追回链、洞府走 home.ts 的灵脉 q、
// 商队走 happen.ts 的 caravan、血婴的魔修走 npcs.mkNpc（真名册，恩怨网如实记账）。
// 每一类骗局上过一次当，都会记入《苏寒随笔》，下次多出「（你想起上次……）」的辨识选项。

import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import type { NpcData, Pers } from './npc';
import type { PianjuFlags } from './worldstate';
import * as C from './cultivation';
import { itemDef } from '../data/items';
import { REALMS, realmName } from '../data/realms';
import { ACTIVE_MAP, ACTIVE_WORLD, WORLD_W, WORLD_H, WORLD_SCALE, LOCATIONS, LocDef } from '../data/world';
import { worldStoneScale, worldCurrencyId, worldCurrencyName, scaleFromMortalStones, planeDefaultEnemyId } from '../data/worldHierarchy';
import { cityTier } from '../data/market';
import { foeRealm } from './demog';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { CharState } from '../gfx/character';
import { audio } from './audio';
import { hapScamP } from './scampool';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** 血婴傀儡的哭声 */
const CRY = ['呜……呜呜……', '娘……我要娘……', '救……救救我……', '好冷……谁来抱抱我……'];
/** 魔道夹带的「货」 */
const CARGO = ['阴煞血珠', '生魂幡', '养尸土', '魔道密信', '血婴傀儡的残躯'];
/** 牙人手里的洞府名号 */
const CAVE_NAMES = ['青霭', '栖霞', '半月', '听泉', '卧云', '丹井', '白石', '松风'];

interface Baby {
  id: number; x: number; y: number; st: CharState; t: number; done: boolean;
  scam: boolean; cry: number; seen?: boolean;
  realm: number; stage: number; pers: Pers; name: string; npcIds: string[];
}

export class PianjuSys {
  game: Game;
  babies: Baby[] = [];
  focus: Baby | null = null; focusD = 1e9;
  private bid = 1;
  private spawnT = rand(55, 95);

  constructor(g: Game) { this.game = g; }
  reset() { this.babies = []; this.focus = null; this.focusD = 1e9; this.spawnT = rand(55, 95); }
  get pj(): PianjuFlags { return (this.game.ws.pj ??= {}); }
  private scamMul() { return this.game.daoxin?.scamMul?.() ?? 1; }

  // ========================================================================
  // 骗局 #12 · 血婴哭声——荒野小孩哭着求救，围上来的是炼它的魔修
  // ========================================================================
  private place(minK = 1.05, maxK = 1.45): { x: number; y: number } | null {
    const g = this.game, p = g.player, T = g.terrain, R = Math.max(900, g.senseRadius);
    for (let i = 0; i < 16; i++) {
      const an = Math.random() * TAU, d = R * rand(minK, maxK);
      const x = p.x + Math.cos(an) * d, y = p.y + Math.sin(an) * d * 0.85;
      if (x < 500 || y < 500 || x > WORLD_W - 500 || y > WORLD_H - 500) continue;
      if (!T.isLand(x, y) || T.walkFactor(x, y) < 0.35 || T.inLocZone(x, y, 700)) continue;
      return { x, y };
    }
    return null;
  }

  /** 指定生成（供自动化测试精确触发闭环） */
  spawnBaby(forceScam?: boolean): Baby | null {
    const pos = this.place(0.7, 1.1) ?? { x: this.game.player.x + 420, y: this.game.player.y + 160 };
    const g = this.game;
    const scam = forceScam ?? (Math.random() < 0.68 * this.scamMul());
    const rs = foeRealm(g, pos.x, pos.y, 'rogue', Math.random, Math.max(1, g.hero.realm - 1), g.hero.realm + 1);
    const b: Baby = {
      id: this.bid++, x: pos.x, y: pos.y, st: new CharState(pos.x, pos.y), t: 0, done: false,
      scam, cry: 0, realm: rs.realm, stage: rs.stage, pers: scam ? pick<Pers>(['ruthless', 'greedy']) : 'kind',
      name: scam ? '血婴傀儡' : '迷路的孩童', npcIds: [],
    };
    b.st.setAction('sit');
    this.babies.push(b);
    return b;
  }

  private babyNode(b: Baby): DNode {
    const g = this.game, h = g.hero;
    const rx = g.renxin;
    const recall = rx?.hasExp2?.('blood_baby' as any);
    const probeCh = clamp(0.34 + (rx?.discernBonus?.('blood_baby' as any) ?? 0) + (h.realm - b.realm) * 0.18 + (h.gongfa === 'dayan' ? 0.16 : 0) + (h.arts.some((a) => a.id === 'mingqing') ? 0.12 : 0), 0.06, 0.95);
    const burst = (alerted: boolean) => {
      b.done = true; this.dropBaby(b);
      h.hp = Math.max(0.06, h.hp - (alerted ? 0.34 : 0.24));
      h.mp = Math.max(0.05, h.mp - 0.2);
      const days = Math.round(rint(7, 15) * (this.game.daoxin?.hurtMul?.() ?? 1));
      C.inflictDaoHurt(h, days, '血婴傀儡当胸炸开，阴煞入体');
      const n = rint(2, 3);
      const names: string[] = [];
      for (let i = 0; i < n; i++) {
        const rs = i === 0 ? { realm: b.realm, stage: b.stage } : foeRealm(g, b.x, b.y, 'minion', Math.random, 1, b.realm);
        const school = pick(['yinluo', 'tiansha', 'guiling', 'yuling']);
        const d = this.game.daoxin?.mkNpc?.({
          realm: rs.realm, stage: rs.stage, pers: 'ruthless', faction: 'demon', sect: school,
          x: b.x + rand(-520, 520), y: b.y + rand(-380, 380), why: '炼化血婴傀儡，守株待兔',
        });
        const def = rs.realm >= 3 ? ENEMIES.jindan_mo ?? ENEMIES.zhujixiu : rs.realm >= 2 ? ENEMIES.zhujixiu : ENEMIES.bandit;
        const e = new Enemy(def, d ? d.x : b.x, d ? d.y : b.y, clamp(rs.realm, 1, 5), clamp(rs.stage, 0, REALMS[clamp(rs.realm, 1, 5)].hp.length - 1));
        e.name = i === 0 ? '炼婴魔修' : '魔道同伙'; e.school = school; e.hx = e.x; e.hy = e.y;
        if (d) { e.npcId = d.id; b.npcIds.push(d.id); }
        if (alerted) { e.busy = true; e.hp = Math.max(1, Math.round(e.maxHp * 0.8)); }   // 被看破后先吃暗亏：气血八成上阵
        else e.aggro = true;
        g.combat.enemies.push(e);
        if (d) names.push(d.name);
      }
      audio.sfx('boom'); g.juice?.(0.35, 9);
      g.renderer?.burst(b.x, b.y - 30, '#c03040');
      g.toast(`那「孩子」在你怀里骤然干瘪——是一具血婴傀儡！阴煞炸开，你胸口气血翻涌（染上 ${days} 日道伤），四周林子里转出${n}名魔修：${names.join('、')}。`, 'warn');
      g.news(`荒野血婴傀儡伤人，${names[0] ?? '魔修'}一流又在炼婴。`, 'rumor');
      rx?.recordExp2?.('blood_baby' as any, 'loss', '血婴哭声', `你抱起了荒野里哭泣的「孩子」，那是一具血婴傀儡。阴煞入体，魔修围上——修仙界里，哭声最响的地方往往最不该去。`);
      g.updateUI(true);
      return null;
    };
    const opts: DOpt[] = [];
    opts.push({
      label: '上前抱起那孩子', tone: 'love', hint: '荒山野岭，怎会有凡人幼童独自啼哭？',
      act: () => (b.scam ? burst(false) : this.mortalChild(b)),
    });
    opts.push({
      label: '（凝神以神识探他周身气息）', tone: 'gold', hint: `看穿机率约 ${Math.round(probeCh * 100)}%${recall ? ' · 你想不起上次的琵琶，却记得上次的哭声' : ''}`,
      act: () => {
        if (Math.random() < probeCh) {
          b.seen = true;
          if (!b.scam) return this.mortalChild(b, true);
          return {
            speaker: '', title: '神识所见', mood: 'danger',
            text: `你的神识轻轻覆过去——那「孩子」没有心跳，没有呼吸，只有一团被阴煞裹住的死气，脐下嵌着一枚血色符骨。\n\n而在三十丈外的林子里，${b.realm >= 3 ? '两' : '几'}道气息正伏在土坡后，一动不动地盯着这里。\n\n（血婴傀儡：炼它的人就在附近，等你俯身的那一刻。）`,
            options: [
              { label: '先下手为强！', tone: 'bad', hint: '他们尚未起身，先吃你一记法术（气血八成上阵）', act: () => { audio.sfx('sword'); return burst(true); } },
              { label: '悄然退走，绕开这片山坡', tone: 'good', hint: '不沾这摊事；《苏寒随笔》记下一笔', act: () => { b.done = true; this.dropBaby(b); g.toast('你敛了气息，绕开那片林子。身后哭声渐弱，终于没了。', 'info'); this.game.renxin?.recordExp2?.('blood_baby' as any, 'see', '血婴哭声·看破', `一声神识扫过去，你就看穿了那是血婴傀儡与林后的魔修。看穿，比打赢更要紧。`); return null; } },
              { label: '（放一把火烧了那林子）', tone: 'bad', hint: '火起则伏兵自乱', disabled: h.mp < 0.3, act: () => { h.mp -= 0.25; g.renderer?.burst(b.x + 300, b.y + 120, '#ff9a3a'); audio.sfx('fire'); g.toast('一道火符落进林子，伏兵惊叫着扑出来——衣袍带火，先自乱了阵脚。', 'good'); return burst(true); } },
            ],
          } as DNode;
        }
        b.seen = true;
        g.toast('你的神识刚探过去，那哭声戛然而止——被察觉了！', 'warn');
        return burst(true);
      },
    });
    if (recall) opts.push({
      label: '（你想起上次那声哭……远远绕开）', tone: 'good', hint: '阅历：吃过一次亏，就该长记性',
      act: () => { b.done = true; this.dropBaby(b); if (b.scam) { g.toast('你绕开了那声哭。走出半里，身后传来一声不甘的尖啸——果然是局。', 'info'); g.renxin?.recordExp2?.('blood_baby' as any, 'see', '血婴哭声·记性', '又一次听见荒野里的哭声，你连头都没回。随笔上的字，是要拿来用的。'); } else { g.toast('你绕开了那孩子。三日后听闻山中弃婴为野兽所噬……你沉默了很久。（江湖信义 -2）', 'warn'); g.jianghu?.addCred?.(-2, '见死不救'); } return null; },
    });
    opts.push({ label: '（不理会，径直走开）', act: () => { b.done = true; this.dropBaby(b); if (!b.scam) { g.toast('你没有停下。后来听说那孩子没能走出山里。（江湖信义 -2）', 'warn'); g.jianghu?.addCred?.(-2, '见死不救'); } return null; } });
    return {
      speaker: '', title: '荒野 · 哭声', mood: 'mystic',
      text: `前面的灌木丛里传来小孩的哭声，一声一声，在空旷的山野里传得很远。\n\n「${pick(CRY)}」\n\n四下无人家，也无车马痕迹。孩子的衣角露在叶子外头，一动不动。\n\n（${g.daoxin?.tierName?.() ?? '凡人'}档：哭声十有八九是局，但也真有过迷路的凡人孩子。）`,
      options: opts,
    };
  }

  /** 真心求救的凡人孩子：送回去，涨信义与声望 */
  private mortalChild(b: Baby, seen = false): DNode | null {
    const g = this.game;
    b.done = true; this.dropBaby(b);
    if (seen) g.toast('神识扫过：是个活生生的凡人孩子，冻得发抖，并无埋伏。', 'info');
    const town = LOCATIONS.filter((l) => l.map === ACTIVE_MAP).sort((a, c) => Math.hypot(a.x * WORLD_SCALE - b.x, a.y * WORLD_SCALE - b.y) - Math.hypot(c.x * WORLD_SCALE - b.x, c.y * WORLD_SCALE - b.y))[0];
    return {
      speaker: '孩童', title: '凡人 · 约莫七八岁', mood: 'normal',
      text: `是个凡人孩子，脸颊冻得青紫，怀里死死抱着一只破布老虎。\n\n「我、我跟阿爹上山采药……有野兽……阿爹跑掉了……」他哭得说不出整话。\n\n（最近的镇子是${town?.name ?? '白石镇'}，约莫百余里。）`,
      options: [
        {
          label: `送他回${town?.name ?? '镇上'}`, tone: 'good', hint: '江湖信义 +4、正道声望 +2，其父母必有谢礼',
          act: () => {
            const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
            const pay = scaleFromMortalStones(rint(20, 60) * worldStoneScale(Math.min(4, g.hero.realm), ACTIVE_WORLD), ACTIVE_WORLD);
            C.addItem(g.hero, cId, pay);
            g.jianghu?.addCred?.(4, '送迷童归家');
            g.ws.rep = clamp(g.ws.rep + 2, -100, 100);
            const got = g.gainInsightExp(Math.round(C.need(g.hero) * 0.01));
            g.news(`你将山中迷路的孩童送回${town?.name ?? '镇上'}，其父母叩首相谢。`, 'personal');
            g.toast(`孩子的父母捧着${pay} ${cName}跪谢，你扶起他们，转身走了。（修为 +${Math.round(got)}、信义 +4、声望 +2）`, 'good');
            g.updateUI(true);
            return null;
          },
        },
        { label: '给他一枚辟谷丹与几块灵石，指条路', act: () => { const n = C.bagCount(g.hero, 'pill_juqi'); if (n > 0) C.removeItem(g.hero, 'pill_juqi', 1); g.jianghu?.addCred?.(2, '指点迷童'); g.toast('你塞给他一枚丹药和几块灵石，指了指镇子的方向。（信义 +2）', 'good'); return null; } },
        { label: '（修仙之人，不管凡尘事）', act: () => { g.jianghu?.addCred?.(-2, '见死不救'); g.toast('你看了他一眼，御起遁光走了。孩子在身后哭得更响了。（信义 -2）', 'warn'); return null; } },
      ],
    };
  }

  private dropBaby(b: Baby) { const i = this.babies.indexOf(b); if (i >= 0) this.babies.splice(i, 1); if (this.focus === b) { this.focus = null; this.focusD = 1e9; } }

  // ========================================================================
  // 骗局 #8 · 结拜图谋——主动求结拜的「义兄」，看上的是你的功法与本命法宝
  // ========================================================================
  /** relations.ts 结拜成功时调用：贪狠之人有一成半到两成的图谋 */
  armSwornTrap(d: NpcData): boolean {
    const g = this.game;
    if (!d || d.bond !== 'sworn') return false;
    if ((this.pj.sworn ?? []).some((s) => s.id === d.id)) return false;
    const rate = 0.2 * this.scamMul();
    if (!g.renxin?.rollScam?.(d.pers, rate)) return false;
    (this.pj.sworn ??= []).push({ id: d.id, name: d.name, day: Math.floor(g.day) + rint(25, 70), stage: 0 });
    return true;
  }

  private swornTick() {
    const g = this.game;
    const list = this.pj.sworn ?? [];
    for (const s of list) {
      if (s.done || s.stage > 0) continue;
      if (g.day < s.day) continue;
      const d = g.npcs.byId.get(s.id);
      if (!d || !d.alive) { s.done = true; continue; }
      s.stage = 1;
      const node = this.swornNode(s, d);
      if (!g.modal) { audio.sfx('chime'); g.openDialog(node); }
      else (g as any).visitQ = node;
      return;
    }
  }

  private swornNode(s: NonNullable<PianjuFlags['sworn']>[number], d: NpcData): DNode {
    const g = this.game, h = g.hero, rx = g.renxin;
    const recall = rx?.hasExp2?.('sworn_trap' as any);
    const senseCh = clamp(0.26 + (rx?.discernBonus?.('sworn_trap' as any) ?? 0) + (C.heroStats(h).sense || 0) / 900 + (h.gongfa === 'dayan' ? 0.2 : 0) + (h.realm - d.realm) * 0.14, 0.05, 0.94);
    /** 中了迷魂散：功法玉简 / 本命法宝 / 灵石被席卷，义兄遁走——接入既有的追回链 */
    const drugged = () => {
      s.stage = 2; s.done = true;
      const lost: string[] = [];
      const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
      const stones = C.bagCount(h, cId);
      const taken = Math.round(stones * rand(0.4, 0.75));
      if (taken > 0) { C.removeItem(h, cId, taken); lost.push(`${cName} ${taken}`); }
      const items: { id: string; n: number; age?: number }[] = [];
      // 一门功法玉简
      const sc = h.bag.filter((b) => b.id.startsWith('scroll_art_'));
      if (sc.length) { const b = pick(sc); C.removeItem(h, b.id, 1); lost.push(itemDef(b.id).name); items.push({ id: b.id, n: 1 }); }
      // 本命法宝（装备栏里的飞剑 / 护甲）
      const eq = h.equip && (h.equip.flight || h.equip.armor || h.equip.shield);
      if (eq && Math.random() < 0.65) {
        const slot = h.equip!.flight === eq ? 'flight' : h.equip!.armor === eq ? 'armor' : 'shield';
        h.equip![slot as 'flight'] = undefined;
        lost.push(itemDef(eq).name + '（本命法宝）'); items.push({ id: eq, n: 1 });
      }
      // 两三件值钱杂物
      const pool = h.bag.filter((b) => b.id !== cId && b.id !== 'mat_lingshi' && itemDef(b.id).price >= 200 && itemDef(b.id).type !== 'scroll');
      for (let i = 0; i < 2 && pool.length; i++) {
        const b = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        C.removeItem(h, b.id, b.n, b.age ?? 0); lost.push(itemDef(b.id).name); items.push({ id: b.id, n: b.n, age: b.age });
      }
      const days = Math.round(rint(12, 25) * (g.daoxin?.hurtMul?.() ?? 1));
      C.inflictDaoHurt(h, days, '被结拜义兄下了迷魂散，神识受创');
      g.day += 3;
      // 义兄成了死敌，赃物进了他的储物袋——大地图红字「夺」，去晚了东西真没了
      d.bond = undefined; d.favor = -70; d.shown = -70; d.grudge = 2; d.why = '下药夺你功法法宝';
      d.wealth += taken;
      d.bag = d.bag ?? {};
      for (const it of items) d.bag[it.id] = (d.bag[it.id] ?? 0) + it.n;
      (d.hate ??= []).push({ id: 'hero', v: 90, why: '结拜是假，图谋是真', day: Math.floor(g.day), blood: true });
      (g.ws.stolenBags ??= []).push({
        id: (Date.now() % 1e6) + 7, culpritId: d.id, culpritName: d.name, day: Math.floor(g.day),
        map: d.map ?? ACTIVE_MAP, stones: taken, items,
      });
      g.rel?.log(`结拜义兄${d.name}在酒里下了迷魂散，卷走你的${lost.join('、')}，连夜遁走。此仇不共戴天。`, 'bad');
      g.news(`你与${d.name}结拜不过两月，他便下药夺宝而逃——江湖上都知道了。`, 'personal');
      rx?.recordExp2?.('sworn_trap' as any, 'loss', '结拜图谋', `义兄${d.name}的一壶灵酒里下了迷魂散。醒来时功法玉简与本命法宝都不见了。他图的不是情分，是你身上那几样东西。`);
      audio.sfx('fail');
      g.toast(`你昏昏沉沉睡了三日。醒来时屋内一空——${lost.join('、')}全没了，${d.name}早已远遁（染上 ${days} 日道伤）。大地图上有红字「夺」：去晚了，东西真会被他花光卖掉。`, 'warn');
      g.updateUI(true);
      return null;
    };
    const reveal = (how: string) => {
      s.stage = 3; s.done = true;
      return {
        speaker: d.name, title: `${realmName(d.realm, d.stage)} · 你的结拜义兄`, mood: 'danger',
        text: `${how}\n\n他脸上的笑意一寸寸淡下去，袖中手指轻轻捻动——那是一撮无色无味的粉末。\n\n「……道友这是何意？」他声音低了半分。`,
        options: [
          { label: '当场翻脸，祭出法器！', tone: 'bad', hint: '他心虚先自乱了，气血八成上阵', act: () => { this.swornFight(d, 0.8); return null; } },
          {
            label: '隐忍不发，只把这事记在心里', tone: 'gold', hint: '不撕破脸：他会以为局还在，日后可当面揭穿',
            act: () => {
              d.favor = clamp(d.favor - 25, -100, 100); d.shown = d.favor;
              (d.hate ??= []).push({ id: 'hero', v: 30, why: '被你识破下药', day: Math.floor(g.day) });
              g.renxin?.recordExp2?.('sworn_trap' as any, 'see', '结拜图谋·隐忍', `你看破了${d.name}酒里的迷魂散，却没有当场翻脸。修仙界里，知道谁要害你，比立刻杀了他更有用。`);
              g.toast(`你笑着把酒盏推开：「今日身体不适，改日再饮。」他眼底闪过一丝疑色。（${d.name} 对你生了戒心）`, 'info');
              return null;
            },
          },
          {
            label: '以彼之道还施彼身——把那撮粉末抖回他壶里', tone: 'bad', hint: '需神识压得住他；得手则搜他的储物袋，信义 -4',
            disabled: h.realm < d.realm,
            act: () => {
              const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
              const stones = scaleFromMortalStones(Math.max(30, Math.round(d.wealth * 0.7)), ACTIVE_WORLD);
              d.wealth = Math.max(0, d.wealth - stones); C.addItem(h, cId, stones);
              const art = (d.arts ?? [])[0];
              if (art) { C.addItem(h, 'scroll_art_' + art, 1); d.arts = (d.arts ?? []).filter((a) => a !== art); }
              d.favor = -80; d.shown = -40; d.grudge = Math.max(d.grudge, 1);
              g.jianghu?.addCred?.(-4, '反下药夺袋');
              g.renxin?.recordExp2?.('sworn_trap' as any, 'see', '结拜图谋·反制', `你把迷魂散抖回了${d.name}自己的酒壶里。他睡了三日，你搜了他的储物袋——江湖规矩，本就是他先坏的。`);
              g.toast(`${d.name}一头栽倒在桌上。你搜出${cName} ${stones}${art ? `、《${art}》玉简` : ''}，抹去痕迹走了。（信义 -4，他醒后会记恨你）`, 'warn');
              g.updateUI(true);
              return null;
            },
          },
        ],
      } as DNode;
    };
    const opts: DOpt[] = [];
    opts.push({ label: '一饮而尽，尽兄弟之谊', tone: 'love', hint: `识得酒中有异的机率约 ${Math.round(senseCh * 100)}%`, act: () => (Math.random() < senseCh ? reveal('酒入口的一瞬，你舌尖尝到一丝极淡的涩——不是灵酒的甘冽，是迷魂散。你面上不动声色，暗地里已把一口真气含在舌下。') : drugged()) });
    opts.push({ label: '（先请义兄饮一杯）', hint: '试探：他若推辞，便是有鬼', act: () => { if (Math.random() < 0.55) return reveal('你把酒盏推了回去：「兄长先请。」他手一顿，笑意僵在脸上。'); g.toast('他哈哈一笑，仰头饮尽——那壶里果然没毒。毒在你这一盏里。（你已打草惊蛇）', 'warn'); s.stage = 2; s.done = true; d.favor = clamp(d.favor - 10, -100, 100); return null; } });
    if (recall) opts.push({ label: '（你想起上次那壶酒……推说不适，滴唇不沾）', tone: 'gold', hint: '阅历：识破而不撕破脸', act: () => { s.stage = 3; s.done = true; g.renxin?.recordExp2?.('sworn_trap' as any, 'see', '结拜图谋·记性', `又是一壶灵酒。你想起上一次的三日昏睡，笑着推开了酒盏。${d.name}的眼神，你看得很清楚。`); d.favor = clamp(d.favor - 15, -100, 100); g.toast(`「不巧，昨夜打坐岔了气，酒是万万喝不得的。」${d.name}眼底的失望一闪而过。（局没成，他还以为你不知道）`, 'info'); return null; } });
    opts.push({ label: '（起身告辞，这酒不喝也罢）', act: () => { s.stage = 0; s.day = Math.floor(g.day) + rint(20, 45); g.toast(`${d.name}挽留不住，面色有些不好看。这壶酒，他还会再斟一次。`, 'info'); return null; } });
    return {
      speaker: d.name, title: `${realmName(d.realm, d.stage)} · 你的结拜义兄`, mood: 'love',
      text: `结拜之后第${Math.max(1, rint(18, 60))}日，${d.name}遣人送来一坛灵酒，说是要与你「叙一叙兄弟情分」。\n\n酒是他亲手斟的，琥珀色，香气醇厚。他举盏看着你，笑意很暖：\n\n「贤弟，这一盏，我等了许久。」\n\n（他：${realmName(d.realm, d.stage)}　性格：${d.pers === 'ruthless' ? '狠辣' : d.pers === 'greedy' ? '贪财' : '难以捉摸'}）`,
      options: opts,
    };
  }

  private swornFight(d: NpcData, hpMul = 1) {
    const g = this.game;
    const def = d.realm >= 3 ? ENEMIES.jindan_mo ?? ENEMIES.zhujixiu : d.realm >= 2 ? ENEMIES.zhujixiu : ENEMIES.bandit;
    const e = new Enemy(def, g.player.x + rand(-260, 260), g.player.y + rand(-180, 180), clamp(d.realm, 1, 5), clamp(d.stage, 0, REALMS[clamp(d.realm, 1, 5)].hp.length - 1));
    e.name = d.name; e.npcId = d.id; e.hx = e.x; e.hy = e.y; e.yieldAt = 0.15;
    e.hp = Math.max(1, Math.round(e.maxHp * hpMul));   // 心虚先自乱了阵脚
    d.bond = undefined; d.favor = -60; d.grudge = Math.max(d.grudge, 1);
    g.combat.enemies.push(e);
    audio.sfx('sword');
    g.toast(`${d.name}见事败露，索性撕破脸皮，祭出法器！`, 'warn');
  }

  // ========================================================================
  // 骗局 #10 · 洞府以次充好——牙人卖你「上品灵脉洞府」，住进去发现灵脉早被抽干
  // ========================================================================
  brokerNode(loc: LocDef): DNode {
    const g = this.game, h = g.hero;
    const T = cityTier(loc);
    const month = Math.floor(g.day / 30);
    let s0 = ((loc.x * 1000 + loc.y) | 0) * 17 + month * 3;
    const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
    const brokerName = '宅务牙人·' + (['胡', '贾', '甄', '卞', '刁'][Math.floor(rnd() * 5)]);
    const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
    const listings = Array.from({ length: 3 }, (_, i) => {
      const adv = [1.9, 2.3, 2.7][i] + Math.round(rnd() * 2) * 0.05;
      const basePrice = Math.round([900, 2800, 7200][i] * Math.pow(2.6, Math.max(0, Math.min(4, h.realm - 1))) * (0.9 + rnd() * 0.3));
      const price = scaleFromMortalStones(basePrice, ACTIVE_WORLD);
      const seed = Math.floor(rnd() * 1e9);
      const fake = rnd() < 0.26 * this.scamMul();
      const nm = CAVE_NAMES[Math.floor(rnd() * CAVE_NAMES.length)] + '洞府';
      return { adv, price, seed, fake, nm, tier: 3 + i };
    });
    const cave = this.pj.cave;
    const opts: DOpt[] = [];
    for (const L of listings) {
      const has = !!g.ws.home;
      opts.push({
        label: `${L.nm}（灵脉 ×${L.adv.toFixed(2)}）　${L.price} ${cName}`,
        tone: 'gold', disabled: C.bagCount(h, cId) < L.price,
        hint: `${has ? '买下即迁居' : '买下即开府'} · 牙人拍着胸口保证：「这条灵脉，我亲手勘过三次。」`,
        act: () => {
          C.removeItem(h, cId, L.price);
          const site: any = { key: `broker_${loc.id}_${L.seed}`, kind: 'cave', x: clamp(loc.x * WORLD_SCALE + rand(-5200, 5200), 800, WORLD_W - 800), y: clamp(loc.y * WORLD_SCALE + rand(-4200, 4200), 800, WORLD_H - 800), tier: L.tier, seed: L.seed, zone: loc.name, region: loc.name };
          g.home.create(site, has);
          (g.ws.home as any).name = L.nm;
          const realQ = L.fake ? +(L.adv * rand(0.3, 0.42)).toFixed(2) : L.adv;
          (g.ws.home as any).q = realQ;
          (g.ws.home as any).chk = g.day;
          if (L.fake) {
            const bd = g.daoxin?.mkNpc?.({ name: brokerName.replace('宅务牙人·', ''), realm: 1, stage: rint(3, 8), pers: 'greedy', faction: 'merchant', x: loc.x * WORLD_SCALE, y: loc.y * WORLD_SCALE, map: loc.map, wealth: L.price, why: `卖了一座抽干灵脉的${L.nm}` });
            this.pj.cave = { broker: brokerName, brokerId: bd?.id, loc: loc.id, day: Math.floor(g.day) + rint(7, 16), q: realQ, adv: L.adv };
            g.toast(`契约立好，${brokerName}笑得见牙不见眼，当场把${cName}收进了袖里。`, 'good');
          } else {
            this.pj.cave = undefined;
            g.toast(`契约立好。这座${L.nm}的灵脉确实如牙人所言——住进去便知道了。（灵气 ×${realQ}）`, 'good');
          }
          g.updateUI(true);
          return null;
        },
      });
    }
    if (cave && cave.found && !cave.dealt) opts.unshift({ label: `找${cave.broker}算这笔账`, tone: 'bad', hint: '他还在城里挂牌营业', act: () => this.settleNode(cave) });
    opts.push({ label: '（神识探一探这牙人的心）', tone: 'gold', hint: '看穿他今日挂牌的三座洞府里有几座是空的', act: () => { const fakes = listings.filter((l) => l.fake).length; g.renxin?.recordExp2?.('cave_fake' as any, 'see', '牙人心事', `你以神识探过${brokerName}的心：他今日挂牌的三座洞府里，${fakes ? `有 ${fakes} 座灵脉早被抽干` : '灵脉都是真的'}。`); g.toast(fakes ? `你的神识掠过他眉心——三座洞府里有 ${fakes} 座是空的。他还在笑。` : '他的心思干干净净：这三座洞府的灵脉都是真的。', fakes ? 'warn' : 'good'); return null; } });
    opts.push({ label: '（不买，退出）', act: () => null });
    return {
      speaker: brokerName, title: `牙行 · ${loc.name}`, mood: 'normal',
      text: `牙行铺子里挂着几幅山水图，图上朱笔圈着灵脉走向。牙人一见你便起身长揖：\n\n「道友来得正巧！这三座洞府都是我们行里新收的，灵脉是我亲手勘过三次的——上品灵脉，住进去打坐一日顶外头三日。」\n\n他压低声音：「不瞒道友，问的人多，出手要快。」\n\n（${cName}：${C.bagCount(h, cId)}　${g.daoxin?.quotaOn?.() ? '凡人 / 天道档：牙人的话，信三分就好。' : ''}）`,
      options: opts,
    };
  }

  /** 住进去七八日，才发现灵气稀薄得可怜 */
  private caveTick() {
    const g = this.game;
    const cave = this.pj.cave;
    if (!cave || cave.found) return;
    if (g.day < cave.day) return;
    const hm = g.ws.home ? (g.ws.home as any).q ?? 1 : 1;
    if (hm >= cave.adv * 0.7) return;   // 没被坑
    cave.found = true;
    g.renxin?.recordExp2?.('cave_fake' as any, 'loss', '洞府以次充好', `牙人卖你的「上品灵脉」洞府，灵脉早被人抽干了：说是 ×${cave.adv.toFixed(2)}，实则只有 ×${cave.q.toFixed(2)}。契约上写得清清楚楚——「灵脉现况，买主自勘」。`);
    audio.sfx('fail');
    g.toast(`你在${g.ws.home?.name ?? '洞府'}里打坐七日，灵气稀薄得可怜——所谓上品灵脉，早被人抽干了！（灵气 ×${cave.q.toFixed(2)}，牙人却收了你 ×${cave.adv.toFixed(2)} 的价）`, 'warn');
    const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
    const fixCost = scaleFromMortalStones(1500, ACTIVE_WORLD);
    const node: DNode = {
      speaker: '', title: '洞府 · 灵脉枯竭', mood: 'danger',
      text: `你以神识一寸寸扫过洞府地底——那条「上品灵脉」只剩一道干涸的石缝，灵气早被人以阵法抽尽，连抽灵的法阵眼都没填平。\n\n契约上有一行小字：「灵脉现况，买主自勘。」\n\n（${cave.broker} 还在${LOCATIONS.find((l) => l.id === cave.loc)?.name ?? '城里'}挂牌营业。）`,
      options: [
        { label: '去城里找他算账', tone: 'bad', act: () => { g.toast('你收起契约，往城里去。', 'info'); return null; } },
        {
          label: '自布聚灵阵，把灵气补回来', hint: `花 ${fixCost} ${cName}，禁制升一阶、灵气 +0.5`,
          disabled: C.bagCount(g.hero, cId) < fixCost,
          act: () => {
            C.removeItem(g.hero, cId, fixCost);
            const hm0 = g.ws.home!; (hm0 as any).q = +(((hm0 as any).q ?? 1) + 0.5).toFixed(2); hm0.array = Math.min(3, hm0.array + 1);
            g.toast(`你以${cName}为眼，在洞府四角布下聚灵阵——灵气重新聚拢（现 ×${(hm0 as any).q}，禁制 ${hm0.array} 阶）。`, 'good');
            g.updateUI(true); return null;
          },
        },
        { label: '认了这一回，把话记在随笔上', act: () => { const got = g.gainInsightExp(Math.round(C.need(g.hero) * 0.006)); g.toast(`吃一堑长一智。你把那张契约折好，收进了储物袋最底层。（修为 +${Math.round(got)}）`, 'info'); g.updateUI(true); return null; } },
      ],
    };
    if (!g.modal) g.openDialog(node); else (g as any).visitQ = node;
  }

  private settleNode(cave: NonNullable<PianjuFlags['cave']>): DNode {
    const g = this.game, h = g.hero;
    const d = cave.brokerId ? g.npcs.byId.get(cave.brokerId) : null;
    const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
    const refund = scaleFromMortalStones(Math.round((cave.adv - cave.q) * 1800 * Math.pow(2.4, Math.max(0, Math.min(4, h.realm - 1)))), ACTIVE_WORLD);
    return {
      speaker: cave.broker, title: '牙行 · 算账', mood: 'danger',
      text: `你把那张契约拍在柜上：「灵脉呢？」\n\n${cave.broker}脸色变了三变，随即堆起笑：「道友莫急，灵脉这东西，枯荣有时——」\n\n${d ? `（他：${realmName(d.realm, d.stage)}　身后还站着两名护院。）` : ''}`,
      options: [
        {
          label: `索赔：退我 ${refund} ${cName}`, tone: 'gold', hint: '境界压得住、信义好，他就退',
          act: () => {
            const ok = clamp(0.4 + (h.realm - (d?.realm ?? 1)) * 0.22 + (g.ws.cred ?? 60) / 250, 0.08, 0.94);
            if (Math.random() < ok) {
              cave.dealt = true; C.addItem(h, cId, refund); if (d) d.wealth = Math.max(0, d.wealth - refund);
              g.jianghu?.addCred?.(2, '当面索回被骗灵石');
              g.toast(`${cave.broker}抹着汗退了 ${refund} ${cName}，连声赔罪。这一片的牙行都知道你不好惹。`, 'good');
              g.updateUI(true);
            } else {
              g.toast(`他忽然翻脸：「契约白纸黑字，灵脉现况买主自勘！道友若要动手，我这里也有护院！」`, 'warn');
              if (d) { d.favor = -50; d.grudge = Math.max(d.grudge, 1); this.swornFight(d, 1); }
            }
            return null;
          },
        },
        {
          label: '当众揭穿他，砸他的招牌', tone: 'good', hint: '正道声望 +4、信义 +3；他会记恨你',
          act: () => {
            cave.dealt = true; g.ws.rep = clamp(g.ws.rep + 4, -100, 100); g.jianghu?.addCred?.(3, '揭穿黑心牙人');
            if (d) { d.favor = -70; d.grudge = Math.max(d.grudge, 1); d.why = '被你当众砸了招牌'; }
            g.news(`${LOCATIONS.find((l) => l.id === cave.loc)?.name ?? '城里'}牙人${cave.broker}以抽干的灵脉充上品洞府，被一位修士当众揭穿。`, 'rumor');
            g.renxin?.recordExp2?.('cave_fake' as any, 'see', '洞府骗局·揭穿', `你把${cave.broker}的把戏当众抖了出来。城里再有人买洞府，都会先来问你一句。`);
            g.toast('你把干涸的灵脉石缝拓片往墙上一贴，围观的修士哗然。（声望 +4、信义 +3，牙人记恨上了）', 'good');
            return null;
          },
        },
        { label: '（不说话，直接动手）', tone: 'bad', hint: '信义 -4；打赢可搜他的柜子', act: () => { cave.dealt = true; g.jianghu?.addCred?.(-4, '在城里动手'); if (d) this.swornFight(d, 1); else g.toast('他早已从后门溜了。', 'warn'); return null; } },
        { label: '（罢了，转身出去）', act: () => null },
      ],
    };
  }

  // ========================================================================
  // 骗局 #11 · 商队夹带——报酬异常高的商队，箱子里是魔道的「货」
  // ========================================================================
  /** happen.ts 建商队时调用：约四分之一的护送是夹带，报酬也异常高 */
  armCaravan(d: any, forceScam?: boolean): boolean {
    const scam = forceScam ?? (Math.random() < hapScamP('caravan', this.scamMul()));
    d.smuggle = scam;
    if (scam) {
      d.reward = Math.round((d.reward ?? 100) * 1.9);
      d.cargo = pick(CARGO);
    }
    return scam;
  }
  /** 应下护送前，可以先以神识扫一遍货箱 */
  scanCargoOpt(x: any): DOpt | null {
    const g = this.game, h = g.hero, d = x.d;
    if (!d || d.engaged === 'go') return null;
    const ch = clamp(0.4 + (g.renxin?.discernBonus?.('smuggle' as any) ?? 0) + (h.realm - 1) * 0.1 + (h.gongfa === 'dayan' ? 0.18 : 0), 0.1, 0.95);
    return {
      label: '（神识悄悄扫一遍货箱）', tone: 'gold', hint: `看穿机率约 ${Math.round(ch * 100)}%；报酬高得反常的商队，箱子里未必是货`,
      act: () => {
        if (Math.random() < ch) {
          d.scanned = true;
          if (!d.smuggle) { g.toast('货箱里是茶叶、生丝与几筐药材——干干净净。', 'info'); return null; }
          g.renxin?.recordExp2?.('smuggle' as any, 'see', '商队夹带·看破', `报酬高出一倍的商队，箱子里装的是${d.cargo}。你神识扫过的时候就知道了——正道执法队迟早要拦。`);
          return {
            speaker: '商队主', title: '凡人 · 神色紧张', mood: 'danger',
            text: `你的神识掠过第三只木箱——箱底压着的是${d.cargo}，阴气森森。\n\n商队主察觉了什么，脸色发白：「道友……这趟货，你只要护到${d.town}，酬金翻倍，什么都不必问。」`,
            options: [
              { label: '（记下这件事，仍旧护送）', tone: 'bad', hint: '半路上正道执法队多半会拦', act: () => { g.toast('你什么也没说。酬金翻倍的事，从来不是白给的。', 'warn'); return null; } },
              { label: '不趟这浑水，转身就走', tone: 'good', act: () => { g.happen?.departNpc?.(x.npc, false); g.happen?.departNpc?.(x.npc2, false); x.npc = undefined; x.npc2 = undefined; x.done = true; (g.happen as any)?.drop?.(x); g.toast('你摇头退开：「这趟货，另请高明。」商队主的脸更白了。（信义无损）', 'info'); return null; } },
              { label: '把货箱的事说破，要他加价三倍', tone: 'gold', hint: '玩家也能骗人：封口费；信义 -3', act: () => { const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD); const pay = scaleFromMortalStones(Math.round((d.reward ?? 100) * 2), ACTIVE_WORLD); C.addItem(g.hero, cId, pay); g.jianghu?.addCred?.(-3, '收商队封口费'); d.reward = Math.round((d.reward ?? 100) * 0.6); g.toast(`商队主咬牙又摸出 ${pay} ${cName}：「道友高抬贵手。」你把东西收了，心里明白这一路不会太平。（信义 -3）`, 'warn'); g.updateUI(true); return null; } },
            ],
          } as DNode;
        }
        g.toast('你的神识刚碰到货箱，商队主便警觉地看了过来——什么也没扫出来，反倒打草惊蛇。', 'warn');
        return null;
      },
    };
  }

  /** 半路上正道执法队拦下商队（happen.ts 在 prog ≈ 0.45 时调用） */
  onSmuggle(x: any): DNode | null {
    const g = this.game, h = g.hero, d = x.d;
    if (!d || !d.smuggle || d.smuggled) return null;
    d.smuggled = true;
    const cartX = x.x ?? g.player.x, cartY = x.y ?? g.player.y;
    const n = rint(2, 3);
    const law: Enemy[] = [];
    const sect = pick(['huangfeng', 'qingxu', 'jujian', 'yanyue']);
    for (let i = 0; i < n; i++) {
      const rs = foeRealm(g, cartX, cartY, i === 0 ? 'leader' : 'minion', Math.random, Math.max(1, h.realm - 1), h.realm + 1);
      const dn = g.daoxin?.mkNpc?.({ realm: rs.realm, stage: rs.stage, pers: i === 0 ? 'righteous' : 'cautious', faction: 'sect', sect, x: cartX + rand(-420, 420), y: cartY + rand(-300, 300), why: '巡查魔道夹带' });
      const defId = planeDefaultEnemyId(ACTIVE_WORLD, rs.realm >= 3 ? 'eliteRogue' : 'rogue');
      const def = ENEMIES[defId] ?? (rs.realm >= 3 ? ENEMIES.jindan_mo ?? ENEMIES.zhujixiu : rs.realm >= 2 ? ENEMIES.zhujixiu : ENEMIES.bandit);
      const cr = clamp(rs.realm, 1, REALMS.length - 1);
      const e = new Enemy(def, dn?.x ?? cartX + 200, dn?.y ?? cartY + 120, cr, clamp(rs.stage, 0, REALMS[cr].hp.length - 1));
      e.name = i === 0 ? '执法队首' : '执法弟子'; e.busy = true; e.tag = 'law'; e.hx = e.x; e.hy = e.y;
      if (dn) e.npcId = dn.id;
      g.combat.enemies.push(e); x.foes?.push?.(e); law.push(e);
    }
    const master = g.daoxin?.mkNpc?.({ realm: 1, stage: rint(4, 9), pers: 'greedy', faction: 'merchant', x: cartX, y: cartY, why: `夹带${d.cargo}的商队主`, favor: 20 });
    audio.sfx('clang');
    g.toast(`官道上落下三道遁光——${sectName(sect)}执法队横剑拦住了商队：「箱子里是什么，自己打开！」`, 'warn');
    const reward = d.reward ?? 100;
    const fight = () => {
      for (const e of law) { e.busy = false; e.aggro = true; }
      d.engaged = 'law'; x.done = true;
      g.ws.rep = clamp(g.ws.rep - 14, -100, 100);
      g.jianghu?.addCred?.(-2, '与正道执法队动手');
      g.renxin?.recordExp2?.('smuggle' as any, 'loss', '商队夹带·拒捕', `你替一支夹带${d.cargo}的商队护了半程，末了与${sectName(sect)}执法队动了手。正道声望 -14，魔名一起，从此这条路不好走了。`);
      g.news(`有人在官道上与${sectName(sect)}执法队动手，护的是一支夹带魔货的商队。`, 'rumor');
      return null;
    };
    return {
      speaker: '执法队首', title: `${sectName(sect)} · 巡查`, mood: 'danger',
      text: `箱盖掀开，阴气扑面——${d.cargo}。\n\n「好大的胆子！」执法队首的目光落到你身上，「这位道友，你是护送的修士？」\n\n商队主腿一软跪了下来：「仙师明鉴，这位道友只是收钱护镖，箱中之物他并不知情……」\n\n（他知道你在神识里扫过这箱子${d.scanned ? '——你也早就知道' : ''}。报酬翻倍的事，从来不是白给的。）`,
      options: [
        {
          label: '交出货物，据实说明', tone: 'good', hint: `正道声望 +5、信义 +3；护送报酬（${reward} 灵石）作废`,
          act: () => {
            g.happen?.departFoes?.(law, '走！');
            g.happen?.departNpc?.(x.npc, false); g.happen?.departNpc?.(x.npc2, false); x.npc = undefined; x.npc2 = undefined;
            x.done = true; (g.happen as any)?.drop?.(x); d.engaged = 'seized';
            g.ws.rep = clamp(g.ws.rep + 5, -100, 100); g.jianghu?.addCred?.(3, '交出魔货');
            if (master) { master.favor = -60; master.grudge = Math.max(master.grudge, 1); master.why = '害他丢了魔货'; }
            g.renxin?.recordExp2?.('smuggle' as any, 'see', '商队夹带·交出', `你把${d.cargo}交给了${sectName(sect)}执法队。报酬没了，商队主记恨上了，但正道的路上还有你的位置。`);
            g.toast(`执法队收起魔货，对你拱手：「道友深明大义。」报酬就此作废，商队主看你的眼神像淬了毒。（声望 +5、信义 +3）`, 'good');
            g.updateUI(true); return null;
          },
        },
        {
          label: '（早知箱中是魔货）反手拿下商队主，将功折罪', tone: 'gold',
          disabled: !d.scanned, hint: d.scanned ? '你在神识扫箱时就知道，说得清来龙去脉' : '你没事先查过货箱，说不清自己是不是同伙',
          act: () => {
            g.happen?.departFoes?.(law, '走！');
            g.happen?.departNpc?.(x.npc, false); g.happen?.departNpc?.(x.npc2, false); x.npc = undefined; x.npc2 = undefined;
            x.done = true; (g.happen as any)?.drop?.(x);
            g.ws.rep = clamp(g.ws.rep + 8, -100, 100); g.jianghu?.addCred?.(5, '揭发魔货夹带');
            const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
            const bonus = scaleFromMortalStones(Math.round(reward * 1.2), ACTIVE_WORLD);
            C.addItem(h, cId, bonus);
            if (master) { master.faction = 'demon'; master.favor = -90; master.grudge = 2; master.why = '被你揭发，血仇'; (master.hate ??= []).push({ id: 'hero', v: 90, why: '揭发夹带', day: Math.floor(g.day), blood: true }); }
            g.renxin?.recordExp2?.('smuggle' as any, 'see', '商队夹带·将功折罪', `你在半路上拿下商队主，把${d.cargo}连同人一起交给了执法队。赏金照给，仇家也照结——那人如今是魔道中人，会来找你。`);
            g.toast(`你一把扣住商队主脉门：「箱中魔货，我早已察觉，正要将他拿下。」执法队大喜，另给 ${bonus} ${cName}。（声望 +8、信义 +5，商队主与你结下血仇）`, 'good');
            g.updateUI(true); return null;
          },
        },
        { label: '拒捕！', tone: 'bad', hint: `正道声望 -14、信义 -2；打赢则${d.cargo}与报酬都归你`, act: fight },
        {
          label: '弃了商队，遁光而走', tone: 'bad', hint: '护送失败、信义 -6；执法队会记住你的脸',
          act: () => {
            x.done = true; (g.happen as any)?.drop?.(x); g.jianghu?.addCred?.(-6, '弃商队于执法队');
            g.ws.rep = clamp(g.ws.rep - 5, -100, 100);
            if (g.daoxin?.hardcore?.()) g.renxin?.recordExp2?.('smuggle' as any, 'loss', '商队夹带·弃队', '你丢下商队遁走了。执法队记下了你的脸——天道档里没有能糊弄过去的事。');
            g.toast('你遁光一起，眨眼已在十里之外。身后传来执法队的呼喝与商队主的哭喊。（信义 -6、声望 -5，护送失败）', 'warn');
            return null;
          },
        },
      ],
    };
  }

  /** 打赢执法队：货与酬金都归你，魔名一起 */
  onLawWon(e: Enemy) {
    const g = this.game;
    if (e.tag !== 'law') return;
    const d = g.npcs.byId.get(e.npcId ?? '');
    if (d) { d.grudge = Math.max(d.grudge, 1); d.why = '执法时被你打伤'; }
    const cId = worldCurrencyId(ACTIVE_WORLD), cName = worldCurrencyName(ACTIVE_WORLD);
    const stones = scaleFromMortalStones(rint(60, 200) * worldStoneScale(Math.min(4, g.hero.realm), ACTIVE_WORLD), ACTIVE_WORLD);
    C.addItem(g.hero, cId, stones);
    g.ws.rep = clamp(g.ws.rep - 4, -100, 100);
    g.toast(`你打退了执法队，搜出${cName} ${stones}。此事传开，正道各派都记住了你的脸。（声望 -4）`, 'warn');
    g.updateUI(true);
  }

  // ========================================================================
  // 每帧 / 日结算 / 绘制 / 标记
  // ========================================================================
  update(dt: number) {
    const g = this.game, p = g.player;
    this.focus = null; this.focusD = 1e9;
    for (const b of this.babies) {
      b.t += dt; b.cry += dt;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < 240 && d < this.focusD) { this.focus = b; this.focusD = d; }
      if (d > 6000) this.dropBaby(b);
      // 哭声随风飘来
      if (d < 1800 && b.cry > 7 && !b.done) { b.cry = 0; if (Math.random() < 0.5) g.toast(`风里飘来小孩的哭声：「${pick(CRY)}」`, 'info'); }
    }
    // 生成：荒野里偶有哭声（天骄档稀些）
    this.spawnT -= dt * (g.daoxin?.tier === 'tianjiao' ? 0.55 : 1);
    if (this.spawnT <= 0) {
      this.spawnT = rand(70, 130);
      if (this.babies.length < 2 && !g.hero.dead && !g.combat.enemies.length && g.alt < 0.4 && !g.isFlying) this.spawnBaby();
    }
  }

  daily(days: number) {
    void days;
    this.swornTick();
    this.caveTick();
  }

  interact(): boolean {
    if (!this.focus) return false;
    audio.sfx('open');
    this.game.openDialog(this.babyNode(this.focus));
    return true;
  }

  collect(out: { y: number; draw: (g: G) => void }[], view: { left: number; top: number; right: number; bottom: number }, t: number) {
    const g = this.game;
    for (const b of this.babies) {
      if (b.x < view.left - 300 || b.x > view.right + 300 || b.y < view.top - 300 || b.y > view.bottom + 300) continue;
      const v = Math.max(g.life.vis({ x: b.x, y: b.y }), 0.25);
      out.push({ y: b.y, draw: (ctx) => this.drawBaby(ctx, b, v, t) });
    }
  }

  private drawBaby(ctx: G, b: Baby, v: number, t: number) {
    const x = b.x, y = b.y;
    ctx.save(); ctx.globalAlpha *= v;
    // 哭声的涟漪
    const k = (t * 0.55) % 1;
    ctx.strokeStyle = `rgba(220,225,240,${0.22 * (1 - k)})`; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const kk = (k + i / 3) % 1; ctx.beginPath(); ctx.ellipse(x, y - 46, 26 + kk * 90, 12 + kk * 40, 0, 0, TAU); ctx.stroke(); }
    // 小小的身影（缩在灌木边）
    ctx.fillStyle = 'rgba(30,26,22,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + 6, 20, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a6a58';
    ctx.beginPath(); ctx.moveTo(x - 13, y + 6); ctx.quadraticCurveTo(x - 15, y - 26, x, y - 30); ctx.quadraticCurveTo(x + 15, y - 26, x + 13, y + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8c8a8'; ctx.beginPath(); ctx.arc(x, y - 38, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a20'; ctx.beginPath(); ctx.arc(x, y - 42, 11, Math.PI, TAU); ctx.fill();
    // 抱膝的手与破布老虎
    ctx.strokeStyle = '#e8c8a8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 11, y - 16); ctx.quadraticCurveTo(x - 2, y - 6, x + 8, y - 14); ctx.stroke();
    ctx.fillStyle = '#b08850'; ctx.beginPath(); ctx.ellipse(x + 12, y - 10, 8, 6, 0.3, 0, TAU); ctx.fill();
    // 泪
    ctx.fillStyle = 'rgba(190,220,255,0.85)';
    const ty = (t * 26) % 18;
    ctx.beginPath(); ctx.ellipse(x - 5, y - 34 + ty, 1.8, 3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 5, y - 34 + (ty + 9) % 18, 1.8, 3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (this.focus === b) {
      ctx.save();
      const fs = Math.max(12, 14 / Math.max(0.5, this.game.cam.zoom));
      ctx.font = `${fs}px "Noto Serif SC",serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,12,0.8)';
      ctx.strokeText('【T】哭声', x, y - 74); ctx.fillStyle = '#ffe6b0'; ctx.fillText('【T】哭声', x, y - 74);
      ctx.restore();
    }
  }

  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const b of this.babies) out.push({ x: b.x, y: b.y, glyph: '哭', color: b.seen ? (b.scam ? '#d05a5a' : '#9fd08a') : '#c8d0e8', name: '荒野里的哭声' });
    return out;
  }

  chances(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] {
    const out: { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] = [];
    if (this.focus) out.push({ t: '荒野哭声', d: '孩子哭着求救——十有八九是血婴傀儡，可也确实有过迷路的凡人孩子。', x: this.focus.x, y: this.focus.y, hot: true });
    const cave = this.pj.cave;
    if (cave && cave.found && !cave.dealt) out.push({ t: '洞府的账', d: `${cave.broker} 卖你的「上品灵脉」是抽干的，他还在城里挂牌。`, tone: 'warn' });
    const sworn = (this.pj.sworn ?? []).filter((s) => !s.done);
    for (const s of sworn) out.push({ t: '义兄的酒', d: `${s.name} 说要与你叙一叙兄弟情分……大约还有 ${Math.max(0, Math.ceil(s.day - this.game.day))} 日。`, tone: 'mystic' });
    return out;
  }
}

function sectName(id: string) {
  const l = LOCATIONS.find((x) => x.id === id);
  return l ? l.name : '正道';
}
