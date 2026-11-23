// 第五十步「江湖」：消息对象（Rumor 管道）· 玩家也能骗人 + 江湖信义（cred）· 骗局 #4 美人局 / #6 拍卖托 / #7 假悬赏 / #9 渡劫局 · 敌人心眼（诈败 / 渔翁 / 先礼后兵）
//
// 核心原则：人心篇让 NPC 学会了“表里不一”，江湖篇让“消息”本身学会说谎——
// 游戏里一切非亲眼所见的信息（传闻、托信、悬赏、拍卖喊价、劫修勒索）都可能是假的；
// 玩家的反制全是修仙味的玩法：多方印证、神识探查、灵石收买、或者赌一把。
// 玩家同样可以报假名号、卖假货、放假消息、分赃翻脸——但 hate/ties 网与 cred 会如实记账。

import type { Game } from './game';
import { enemyPerceptibility } from './senseSignals';
import type { NpcData } from './npc';
import { makeName, PERS_NAME } from './npc';
import type { DNode, DOpt } from './modal';
import type { Rumor, FakeSale, Bounty, JianghuFlags } from './worldstate';
import { credName } from './worldstate';
import { hapScamP } from './scampool';
import * as C from './cultivation';
import { ITEM_LIST, itemDef } from '../data/items';
import { REALMS, realmName } from '../data/realms';
import { ACTIVE_MAP, ACTIVE_WORLD, LOCATIONS, LOC_BY_ID, WORLD_SCALE, WORLD_W, WORLD_H, LocDef } from '../data/world';
import { worldStoneScale, worldCurrencyId, worldCurrencyName, scaleFromMortalStones, planeExchangeRate, clampWorldRealm, planeDefaultEnemyId, planeDefaultPillId, planeEncounterRange } from '../data/worldHierarchy';
import { ENEMIES } from '../data/enemies';
import { Enemy } from './combat';
import { loot, dirName } from './sites';
import { foeRealm } from './demog';
import { CharState } from '../gfx/character';
import { cultivator } from './melee';
import type { AuctionLot } from './town';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const SURN = ['王', '李', '赵', '孙', '周', '吴', '郑', '冯', '陈', '韦', '马', '朱', '胡', '林', '何', '高', '罗', '梁', '宋', '唐', '许', '邓', '萧'];
const PLACE = ['黑风坳', '断崖谷', '落雁坡', '乱石滩', '野狐岭', '青石涧', '枯松岭', '白骨滩', '鹰嘴崖', '迷雾泽', '赤岩谷', '古战场'];
const TREASURE = ['宝光冲天', '灵草异香十里可闻', '一座古修洞府禁制松动', '有人挖出了上古丹炉', '夜夜有雷光闪动，怕是地火灵脉'];
const SMEAR_WHAT = ['为人阴险、翻脸无情', '暗中与魔道勾结', '抢过同门的机缘', '欠了灵石不还', '在背后数落你修为低微'];

export interface AmbushGroup { leader: Enemy; foes: Enemy[]; t0: number; sprung: boolean; warned: boolean }

export class JianghuSys {
  game: Game;
  private seq = 1;
  /** 诈败埋伏 */
  ambushes: AmbushGroup[] = [];
  /** 渔翁 */
  fisher: Enemy | null = null; private fisherT = 0; private fisherCd = 90; private fisherState: 'watch' | 'strike' = 'watch';
  /** 美人局夜袭倒计时（由 happen 托管事件数据） */
  constructor(g: Game) { this.game = g; }

  // ========================================================================
  // 2.4 江湖信义（cred）—— 骗子玩法玩得起，但世界会用自己的规则回敬你
  // ========================================================================
  get cred(): number { const ws = this.game.ws; if (ws.cred === undefined) ws.cred = 60; return ws.cred; }
  credName() { return credName(this.cred); }
  addCred(dv: number, why?: string) {
    const ws = this.game.ws; const before = this.cred;
    ws.cred = clamp(Math.round(before + dv), 0, 100);
    if (why && Math.abs(dv) >= 2) this.game.toast(`江湖信义 ${dv > 0 ? '+' : ''}${dv}（${why}）· 现为「${this.credName()}」`, dv > 0 ? 'good' : 'warn');
    if (before >= 30 && ws.cred < 30) this.game.rel?.log('你的信义已坏到无人愿与你同行、坊市压你的价、求救无人来的地步。', 'bad');
  }
  /** 坊市压价：信义差的人，掌柜压价 */
  credSellMul(): number { const c = this.cred; return c < 15 ? 0.7 : c < 30 ? 0.82 : c < 45 ? 0.93 : c >= 85 ? 1.05 : 1; }
  /** 没人跟你组队 / 护法 */
  credBlocksTeam(): boolean { return this.cred < 30; }
  /** 求救没人来（追杀、救援事件中路人援手的概率乘数） */
  credHelpMul(): number { const c = this.cred; return c < 15 ? 0 : c < 30 ? 0.3 : c < 45 ? 0.7 : 1; }
  get jh(): JianghuFlags { return (this.game.ws.jh ??= {}); }

  // ========================================================================
  // 2.2 消息对象（Rumor 管道）
  // ========================================================================
  get rumors(): Rumor[] { return (this.game.ws.rumors ??= []); }
  activeRumors(): Rumor[] { const d = this.game.day; return this.rumors.filter((r) => !r.done && r.until > d); }

  private pushRumor(r: Omit<Rumor, 'id' | 'day' | 'until'> & { until?: number }): Rumor {
    const g = this.game;
    const full: Rumor = { ...r, id: this.seq++ + Math.floor(g.day) * 1000, day: Math.floor(g.day), until: r.until ?? Math.floor(g.day) + 60 };
    this.rumors.push(full);
    if (this.rumors.length > 40) this.rumors.splice(0, this.rumors.length - 40);
    return full;
  }
  /** 在玩家附近挑一处能走的野外落点 */
  private spot(minD = 2600, maxD = 6000): { x: number; y: number } | null {
    const g = this.game, p = g.player, T = g.terrain;
    for (let i = 0; i < 24; i++) {
      const an = Math.random() * Math.PI * 2, d = rand(minD, maxD);
      const x = p.x + Math.cos(an) * d, y = p.y + Math.sin(an) * d * 0.8;
      if (x < 600 || y < 600 || x > WORLD_W - 600 || y > WORLD_H - 600) continue;
      if (!T.isLand(x, y) || T.walkFactor(x, y) < 0.3 || T.inLocZone(x, y, 300)) continue;
      return { x, y };
    }
    return null;
  }
  private dirTxt(x: number, y: number) { const p = this.game.player; return `${dirName(x - p.x, y - p.y)}方约 ${Math.max(1, Math.round(Math.hypot(x - p.x, y - p.y) / 260))} 里`; }

  /** 由某个 NPC 放出一则“异宝/洞府”消息：诚实者说真话（偶尔半真），贪狠者按骗局率设饵（宝地其实是伏击圈） */
  makeTreasureRumor(src: NpcData | null, forceMotive?: Rumor['motive']): Rumor | null {
    const g = this.game, h = g.hero;
    const at = this.spot(); if (!at) return null;
    let motive: Rumor['motive'] = 'honest';
    if (forceMotive) motive = forceMotive;
    else if (src && g.renxin.rollScam(src.pers, 0.18)) motive = 'bait';
    const truth = motive === 'bait' ? 0 : Math.random() < 0.72 ? 1 : 0.5;
    const place = pick(PLACE), what = pick(TREASURE);
    const srcName = src ? src.name : '说书先生';
    const text = `${this.dirTxt(at.x, at.y)}的${place}，前几日${what}。${motive === 'bait' ? '去的人还不多，道友脚程快，该是能赶上头一波。' : truth === 0.5 ? '不过听说已有几拨人往那边去了。' : '消息还没传开，道友若有意，宜早不宜迟。'}`;
    return this.pushRumor({ text, truth, src: src?.id ?? 'book', srcName, motive, kind: 'treasure', map: ACTIVE_MAP, x: at.x, y: at.y, tier: clamp(h.realm, 0, 4) });
  }
  /** 托你带信：诚实者是家书/托付；借刀者的信里写的是“持信人可杀” */
  makeLetterRumor(src: NpcData): Rumor | null {
    const g = this.game;
    const foeTie = src.ties?.find((t) => t.k === 'foe' && g.npcs.byId.get(t.id)?.alive && (g.npcs.byId.get(t.id)!.map ?? 'renjie') === (src.map ?? 'renjie'));
    const friendTie = src.ties?.find((t) => t.k !== 'foe' && g.npcs.byId.get(t.id)?.alive && (g.npcs.byId.get(t.id)!.map ?? 'renjie') === (src.map ?? 'renjie'));
    const proxy = !!foeTie && g.renxin.rollScam(src.pers, 0.2);
    const tgtId = proxy ? foeTie!.id : friendTie?.id;
    if (!tgtId) return null;
    const tgt = g.npcs.byId.get(tgtId)!;
    const where = g.living?.whereText(tgt) ?? '附近';
    const text = `「道友若往${where}一带去，可否替在下捎一封信给${tgt.name}？${proxy ? '是……是一桩旧账，当面说不清，信里都写明白了。' : '家中长辈身子不好，托他带几味药回来。'}事成之后，${tgt.name}自会酬谢。」`;
    return this.pushRumor({ text, truth: proxy ? 0 : 1, src: src.id, srcName: src.name, motive: proxy ? 'proxy' : 'honest', kind: 'letter', targetId: tgtId, targetName: tgt.name, until: Math.floor(g.day) + 90 });
  }
  /** relations.ts 挑拨的升级版：狠毒之人放出“你的朋友在背后说你坏话”的假消息——玩家看得见、会上当 */
  onSmear(d: NpcData, f: NpcData): boolean {
    const g = this.game;
    if (Math.random() < 0.45) return false;   // 一半仍是暗地里的好感暗改
    if (this.activeRumors().some((r) => r.motive === 'smear' && r.targetId === f.id)) return false;
    const r = this.pushRumor({ text: `听人说，${f.name}近来在人前说你${pick(SMEAR_WHAT)}。`, truth: 0, src: d.id, srcName: d.name, motive: 'smear', kind: 'person', targetId: f.id, targetName: f.name, until: Math.floor(g.day) + 45 });
    g.rel?.log(`有人传话：${f.name}在背后说你的坏话。（消息真假难辨——可向旁人印证，或当面问明）`, 'bad');
    g.toast(`江湖传言：${f.name}在背后说你坏话？（N 人脉录 / 打听消息中可印证真伪）`, 'warn');
    void r;
    return true;
  }
  /** NPC「打听消息」：有一定概率给出一则 Rumor（而非写死的真话） */
  rumorLine(d: NpcData): string | null {
    const g = this.game;
    if (d.faction === 'mortal' || d.canon || d.beauty) return null;
    if (Math.random() > 0.38) return null;
    // 已经托过信 / 放过饵的人不重复
    if (this.activeRumors().some((r) => r.src === d.id)) return null;
    let r: Rumor | null = null;
    if (d.ties?.length && Math.random() < 0.3) r = this.makeLetterRumor(d);
    if (!r) r = this.makeTreasureRumor(d);
    if (!r) return null;
    if (r.kind === 'letter') {
      g.toast(`${d.name}托你带一封信给${r.targetName}。（信在储物袋外袋里；可先以神识一探）`, 'info');
      return r.text;
    }
    g.toast(`得到一则传闻（地图上已以「讯」标出）。消息未必是真的——可向旁人印证。`, 'info');
    return `${d.name}压低声音：「${r.text}」`;
  }
  /** 酒楼说书先生：讲一则（多半是真的）消息 */
  tavernRumor(): Rumor | null {
    const r = this.makeTreasureRumor(null, Math.random() < 0.12 ? 'bait' : undefined);
    if (r) r.srcName = '说书先生';
    return r;
  }
  rumorLabel(r: Rumor) {
    const st = r.exposed ? (r.truth >= 1 ? '【已证实】' : r.truth > 0 ? '【半真】' : '【假！】') : r.verified === 1 ? '【有旁证】' : r.verified === -1 ? '【对不上】' : '';
    return `${st}${r.kind === 'letter' ? `${r.srcName}托带给${r.targetName}的信` : r.kind === 'person' ? `${r.targetName}说你坏话？` : r.text.slice(0, 26) + '…'}（${r.srcName}）`;
  }
  /** 多方印证：拿一则传闻去问第二个来源——truth 低的会对不上 */
  corroborate(r: Rumor, d2: NpcData | null): string {
    const g = this.game, h = g.hero;
    const who = d2 ? d2.name : '掌柜';
    if (d2 && d2.id === r.src) return `${who}笑道：「这不就是我说的么？难道道友信不过在下？」`;
    const honest2 = !d2 || !(d2.pers === 'greedy' || d2.pers === 'ruthless') || Math.random() < 0.6;
    const ch = clamp(0.62 + g.renxin.discernBonus() * 0.5 + (h.realm >= 3 ? 0.08 : 0), 0.3, 0.95);
    if (r.truth >= 1) {
      r.verified = 1;
      return r.kind === 'letter' ? `${who}想了想：「${r.srcName}与${r.targetName}？是有这么回事，两家是旧识，常有书信往来。」` : `${who}点头：「这事我也听说了，${r.text.slice(0, 10)}……确有其事。」`;
    }
    if (honest2 && Math.random() < ch) {
      r.verified = -1; r.exposed = true;
      if (r.motive === 'smear') {
        const f = g.npcs.byId.get(r.targetId!); const s = g.npcs.byId.get(r.src);
        g.renxin.recordExp2('smear', 'see', '谗言离间', `有人传${f?.name}在背后说你坏话，向${who}一问便知是${s?.name ?? '小人'}搬弄是非。`);
        if (s) { s.favor = clamp(s.favor - 6, -100, 100); (s as any)._unmasked = true; }
        return `${who}一愣：「${f?.name}？他前日还替你说话来着！倒是${s?.name ?? '有人'}——那人向来爱搬弄是非，道友莫要中了离间之计。」`;
      }
      if (r.kind === 'letter') {
        g.renxin.recordExp2('letter', 'see', '借刀之信', `${r.srcName}托带给${r.targetName}的信，向${who}一问才知二人是死对头——信里写的多半是“持信人可杀”。`);
        return `${who}皱眉：「${r.srcName}与${r.targetName}？那两个是结了死仇的！他托你送信？——道友，这信你最好先看看再送。」`;
      }
      g.renxin.recordExp2('bait', 'see', '识破诱饵', `${r.srcName}口中${r.text.slice(0, 12)}……经${who}印证纯属子虚乌有，分明是聚人头的局。`);
      return `${who}摇头：「${r.text.slice(0, 8)}……？没听说。倒是前些日子有伙魔修在那一带转悠。道友，这消息怕是有人故意放出来的。」`;
    }
    if (r.truth === 0.5) { r.verified = 1; return `${who}道：「是有这回事，不过早几日就传开了。」`; }
    return `${who}含糊道：「这个……倒也听人提过一嘴，做不得准。」`;
  }
  /** 神识探查：消息来源就在眼前时，以读心判定其动机 */
  probeRumorOpt(d: NpcData, look: any, title: string, back: () => DNode, supLv = 0): DOpt | null {
    const g = this.game, h = g.hero;
    const r = this.activeRumors().find((x) => x.src === d.id && !x.exposed);
    if (!r || h.mp < 0.05) return null;
    return {
      label: `神识探查他方才所言真假（耗少许法力）`, hint: '以读心判其动机：神识越强、阅历越多越准',
      act: () => {
        h.mp = Math.max(0, h.mp - 0.05);
        const mr = g.renxin.mindRead(d, supLv);
        const ch = (mr.trueMind ? 0.92 : 0.3) + g.renxin.discernBonus('bait') + (g.senseBurstT > 0 ? 0.15 : 0);
        if (r.truth >= 1) { r.verified = 1; return { speaker: '神识感应', look, title, text: `${d.name}说话时心念平和、气机无滞——所言不虚。`, options: [{ label: '返回', act: back }] }; }
        if (Math.random() < ch) {
          r.exposed = true; r.verified = -1; (d as any)._unmasked = true;
          g.renxin.recordExp2(r.kind === 'letter' ? 'letter' : 'bait', 'see', r.kind === 'letter' ? '看破托信' : '看破诱饵', `${d.name}${r.kind === 'letter' ? '托你送的信' : '口中的宝地'}，神识一探便知其心口不一——${r.motive === 'proxy' ? '是想借你之手杀人' : '那是聚人头的伏击圈'}。`);
          return { speaker: '神识洞察', look, title: `${d.name} · 伪装已破`, mood: 'danger', text: `你神识悄然搭上他的气机——${d.name}嘴上殷切，心底却是一片冷笑：${r.motive === 'proxy' ? `「${r.targetName}见了信，自会替我收拾这小子……」` : '「又一个送上门的……到了地方，自有人招呼他。」'}`, options: [{ label: '心中有数了', tone: 'gold', act: back }] };
        }
        return { speaker: '神识感应', look, title, text: `${d.name}目光闪烁，神识波动却被他压得极稳，一时辨不出真假。`, options: [{ label: '返回', act: back }] };
      },
    };
  }
  /** 「多方印证」对话选项：把手头未证实的传闻拿去问眼前这个人 */
  verifyOpts(d: NpcData | null, look: any, title: string, back: () => DNode): DOpt[] {
    const list = this.activeRumors().filter((r) => !r.exposed && r.verified !== 1 && !r.byPlayer && r.src !== d?.id);
    if (!list.length) return [];
    return [{
      label: `向其印证传闻（${list.length} 则）`, hint: '多方印证：假消息经不起第二个来源对质',
      act: () => ({ speaker: d?.name ?? '掌柜', look, title, text: '你把听来的消息挑了一则，看似无意地提起——', options: [
        ...list.slice(0, 5).map((r) => ({ label: this.rumorLabel(r), act: () => ({ speaker: d?.name ?? '掌柜', look, title, text: this.corroborate(r, d), options: [{ label: '原来如此', act: back }] }) })),
        { label: '算了', act: back },
      ] }),
    }];
  }
  /** 灵石收买：花钱买“这消息是谁放出来的” */
  buySourceNode(back: () => DNode): DNode {
    const g = this.game, h = g.hero;
    const list = this.activeRumors().filter((r) => !r.exposed && !r.byPlayer);
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const fee = scaleFromMortalStones(30 * worldStoneScale(h.realm, ACTIVE_WORLD), ACTIVE_WORLD, 1);
    return { speaker: '酒楼掌柜', title: '买消息', text: `掌柜擦着杯子，眼皮也不抬：「消息嘛，坊里什么风声都刮得到。道友想问哪一桩？——${fee} ${curName}一桩。」`, options: [
      ...list.slice(0, 5).map((r) => ({ label: `${this.rumorLabel(r)} · ${fee} ${curName}`, disabled: C.bagCount(h, curId) < fee, act: () => {
        C.removeItem(h, curId, fee); r.exposed = true; r.verified = r.truth >= 1 ? 1 : -1;
        const s = g.npcs.byId.get(r.src);
        let t: string;
        if (r.truth >= 1) t = `掌柜凑近：「这事是真的。${r.srcName}那人虽不算正派，这回倒没扯谎。」`;
        else if (r.motive === 'smear') { t = `掌柜压低声音：「${r.targetName}说你坏话？没有的事。是${s?.name ?? r.srcName}四处放的风——他与你有过节吧？」`; g.renxin.recordExp2('smear', 'see', '买来的真相', `花 ${fee} ${curName}从掌柜处买到实情：${f0(r)}`); }
        else if (r.motive === 'proxy') { t = `掌柜摇头：「${r.srcName}与${r.targetName}是死对头。他托人送信，送信的多半有去无回。」`; g.renxin.recordExp2('letter', 'see', '买来的真相', `花 ${fee} ${curName}从掌柜处买到实情：${f0(r)}`); }
        else { t = `掌柜左右看看：「那地方？是${s ? `${s.name}那伙人` : '一伙魔修'}放的风声，专钓外地来的散修。去了的，没见回来过。」`; g.renxin.recordExp2('bait', 'see', '买来的真相', `花 ${fee} ${curName}从掌柜处买到实情：${f0(r)}`); }
        if (s) (s as any)._unmasked = true;
        return { speaker: '酒楼掌柜', title: '买消息', text: t, options: [{ label: '多谢掌柜', act: back }] };
      } })),
      { label: '不买了', act: back },
    ] };
    function f0(r: Rumor) { return r.kind === 'person' ? `${r.srcName}诋毁${r.targetName}以离间你们` : r.kind === 'letter' ? `${r.srcName}借你之手送“杀书”给${r.targetName}` : `${r.srcName}放出的宝地消息是伏击圈`; }
  }
  /** 收信人就在眼前：交信 / 先看信 */
  letterOpts(a: any, title: string, back: () => DNode): DOpt[] {
    const g = this.game, h = g.hero, d: NpcData = a.d;
    const r = this.activeRumors().find((x) => x.kind === 'letter' && x.targetId === d.id);
    if (!r) return [];
    const out: DOpt[] = [];
    if (!r.exposed) out.push({ label: `（先以神识透过信封一探 · ${r.srcName}托带的信）`, disabled: h.mp < 0.03, act: () => {
      h.mp = Math.max(0, h.mp - 0.03); r.exposed = true; r.verified = r.truth >= 1 ? 1 : -1;
      if (r.truth < 1) g.renxin.recordExp2('letter', 'see', '信中杀机', `神识透过信封，看清${r.srcName}托带给${d.name}的信上写着“持信人与我有旧怨，见信可杀”。`);
      return { speaker: '神识', title, look: a.look, text: r.truth >= 1 ? `信上不过是些家常托付：「……近来身子不济，烦请捎几味药回来……」确是封寻常书信。` : `你神识透过封蜡——信上只有一行小字：\n\n「持信者与我有旧怨，见信可杀。事成，前约照付。」\n\n${r.srcName}是要借${d.name}的手杀你！`, mood: r.truth >= 1 ? 'normal' : 'danger', options: [{ label: '……', act: back }] };
    } });
    out.push({ label: `把${r.srcName}托带的信交给他`, tone: r.exposed && r.truth < 1 ? 'bad' : 'good', act: () => {
      r.done = true;
      if (r.truth >= 1) {
        const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
        const pay = scaleFromMortalStones(40 * Math.pow(3, Math.max(0, d.realm - 1)), ACTIVE_WORLD, 1);
        C.addItem(h, curId, pay); g.rel?.addFavor(d, 15); this.addCred(2, '守信带到书信');
        const s = g.npcs.byId.get(r.src); if (s) g.rel?.addFavor(s, 10);
        return { speaker: d.name, title, look: a.look, text: `${d.name}展信读罢，神色一松：「原来是${r.srcName}的信……有劳道友跑这一趟。」他取出 ${pay} ${curName}奉上。\n\n（${d.name}好感 +15，${r.srcName}好感 +10，江湖信义 +2）`, options: [{ label: '举手之劳', act: back }] };
      }
      // 借刀之信
      if (r.exposed) {
        // 你明知是杀书还送来——是把计就计：当面拆穿，让收信人恨上写信的人
        const s = g.npcs.byId.get(r.src);
        if (s && g.living) { g.living.addHate(d, s, 55, `托人送杀书到他门前`, g.day); g.living.addHate(s, d, 20, `送信之事败露`, g.day); }
        g.rel?.addFavor(d, 8); this.addCred(1);
        return { speaker: d.name, title, look: a.look, mood: 'danger', text: `你当着他的面拆开信念了一遍。${d.name}脸色铁青，一把攥碎信纸：「${r.srcName}！好，好得很……」\n\n他深深看你一眼：「道友肯把话挑明，这份情我记下了。」\n\n（${d.name}与${r.srcName}的仇恨网已如实记账）`, options: [{ label: '告辞', act: back }] };
      }
      // 不知就里地送到了——
      g.renxin.recordExp2('letter', 'loss', '送上门的刀', `替${r.srcName}给${d.name}带信，信上写的却是“持信人可杀”。谨记：托信也要先看信。`);
      const willKill = d.pers === 'ruthless' || d.pers === 'greedy' || (d.hate?.some((x) => x.id === r.src) && d.realm >= h.realm);
      if (willKill) {
        d.favor = clamp(d.favor - 50, -100, 100); d.grudge = Math.max(d.grudge, 1); d.why = `受${r.srcName}之托取你性命`;
        g.npcs.toEnemy(a, true);
        return { speaker: d.name, title, look: a.look, mood: 'danger', text: `${d.name}拆信看了一眼，忽然笑了：「${r.srcName}倒会使唤人……」\n\n下一瞬，杀机暴起！`, options: [{ label: '中计了！', tone: 'bad', act: () => null }] };
      }
      return { speaker: d.name, title, look: a.look, mood: 'danger', text: `${d.name}拆信一看，冷冷把信纸推到你面前——上面写着「持信人可杀」。\n\n「${r.srcName}是想借我的手杀你。我与他有仇，却不替他杀人。」他挥挥手：「走吧，下回长个心眼。」`, options: [{ label: '冷汗涔涔', act: back }] };
    } });
    return out;
  }
  /** 「坏话」传闻：当面问明 */
  smearOpts(a: any, title: string, back: () => DNode): DOpt[] {
    const g = this.game, d: NpcData = a.d;
    const r = this.activeRumors().find((x) => x.motive === 'smear' && x.targetId === d.id && !x.done);
    if (!r) return [];
    return [{ label: '「听说你在背后说我……」（当面问明）', act: () => {
      r.done = true; r.exposed = true; r.verified = -1;
      const s = g.npcs.byId.get(r.src);
      if (s && g.living) g.living.addHate(d, s, 25, '在人前挑拨他与苏寒', g.day);
      g.rel?.addFavor(d, 5);
      g.renxin.recordExp2('smear', 'see', '当面问明', `有人传${d.name}说你坏话，你当面问明，原是${s?.name ?? '小人'}挑拨离间。`);
      return { speaker: d.name, title, look: a.look, text: `${d.name}愕然，随即怒道：「谁说的？！我何曾……」他略一思索，脸色沉下来：「${s ? `定是${s.name}！那人惯会搬弄是非。` : '是有人挑拨。'}道友肯当面问我，而不是暗地里疏远，${d.name}领情。」\n\n（好感 +5，离间之计已破）`, options: [{ label: '是我多心了', act: back }] };
    } }, { label: '（信以为真）从此与他疏远', tone: 'bad', act: () => {
      r.done = true; d.favor = clamp(d.favor - 30, -100, 100);
      if (r.truth === 0) g.renxin.recordExp2('smear', 'loss', '中了离间', `轻信传言与${d.name}疏远，事后才知是${r.srcName}的离间之计。`);
      return { speaker: d.name, title, look: a.look, text: `你冷冷别过脸去。${d.name}不明所以，讪讪地住了口。\n\n（好感 -30）`, options: [{ label: '……', act: back }] };
    } }];
  }

  // ========================================================================
  // 2.4 玩家也能骗人：报假名号 / 卖假货 / 散布假情报 / 分赃翻脸
  // ========================================================================
  /** 通用对话：冒充宗门执法弟子（吓退散修）；被同宗真弟子撞破则宗门声望大跌 */
  fakeNameOpt(a: any, title: string, back: () => DNode): DOpt | null {
    const g = this.game, h = g.hero, d: NpcData = a.d;
    if (d.canon || d.beauty || d.faction === 'mortal' || d.bond || (d as any)._bluffed) return null;
    if (!(d.grudge >= 1 || d.plan?.k === 'rob' || (d.pers === 'greedy' || d.pers === 'ruthless')) || d.favor >= 40) return null;
    const mySect = g.ws.sect?.id;
    const claim = mySect ?? pick(['huangfeng', 'yanyue', 'qingxu']);
    const sName = LOC_BY_ID.get(claim)?.name ?? '青霞谷';
    const real = !!mySect && mySect === claim;
    const ch = clamp(0.45 + (h.realm - d.realm) * 0.2 + (d.pers === 'cautious' ? 0.2 : d.pers === 'arrogant' ? -0.15 : 0) + (this.cred >= 65 ? 0.05 : 0), 0.08, 0.92);
    return { label: `${real ? '亮出' : '冒充'}${sName}执法弟子身份（约 ${Math.round(ch * 100)}%）`, hint: real ? '你确是本宗弟子' : '假冒宗门，被真弟子撞破则宗门声望大跌、信义受损', act: () => {
      (d as any)._bluffed = true;
      if (real || Math.random() < ch) {
        d.favor = clamp(d.favor + 12, -100, 100); if (d.grudge === 1) { d.grudge = 0; d.hunting = false; }
        if (d.plan?.k === 'rob') d.plan = undefined;
        if (!real && d.sect === claim) return this.bluffBusted(a, title, back, sName);
        if (!real && Math.random() < 0.15) { (g.ws.flags as any).fakeSectAt = { sect: claim, day: g.day }; }
        return { speaker: d.name, title, look: a.look, text: `你亮出一面令牌（${real ? '' : '其实是块旧玉牌'}），淡淡道：「${sName}执法弟子，奉命巡查。」\n\n${d.name}神色一凛，连忙拱手：「原来是${sName}的上差，失敬失敬……」态度登时客气了许多。`, options: [{ label: '哼。', tone: 'gold', act: back }] };
      }
      return this.bluffBusted(a, title, back, sName);
    } };
  }
  private bluffBusted(a: any, title: string, back: () => DNode, sName: string): DNode {
    const g = this.game, d: NpcData = a.d;
    d.favor = clamp(d.favor - 18, -100, 100);
    this.addCred(-5, '冒充宗门被识破');
    g.ws.rep = clamp(g.ws.rep - 3, -100, 100);
    if (Math.random() < 0.5) { g.rel?.log(`你冒充${sName}弟子之事传了出去，${sName}对你颇为不满。`, 'bad'); (g.ws.flags as any).fakeSectShame = ((g.ws.flags as any).fakeSectShame ?? 0) + 1; }
    return { speaker: d.name, title, look: a.look, mood: 'danger', text: `${d.name}盯着你的令牌看了半晌，忽然冷笑：「${sName}执法弟子的令牌是青玉制的，道友这块……是街边三灵石一块的货色吧？」\n\n（冒充败露：好感 -18，正道声望 -3，江湖信义 -5）`, options: [{ label: '……', act: back }] };
  }
  /** 兜售丹药（可掺假）：以伪灵粉染色低阶丹冒充高阶丹卖给 NPC——赚快钱，但 hate 网如实记账 */
  fakeSellNode(a: any, title: string, back: () => DNode): DNode {
    const g = this.game, h = g.hero, d: NpcData = a.d;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD), rate = planeExchangeRate(ACTIVE_WORLD);
    const pills = h.bag.filter((b) => itemDef(b.id).type === 'pill' && itemDef(b.id).price > 0 && !b.fake).slice(0, 6);
    const hasFen = C.bagCount(h, 'mat_weilingfen') > 0;
    const opts: DOpt[] = [];
    for (const b of pills) {
      const it = itemDef(b.id);
      const honestMortal = Math.round(it.price * 0.7 * (d.pers === 'greedy' ? 0.8 : 1));
      const honestLocal = scaleFromMortalStones(honestMortal, ACTIVE_WORLD, 1);
      const honestDeduct = honestLocal * rate;
      opts.push({ label: `如实卖出【${it.name}】（${honestLocal} ${curName}）`, disabled: d.wealth < honestDeduct, hint: d.wealth < honestDeduct ? '他囊中羞涩' : '', act: () => {
        const bag = d.bag ?? {}, count = bag[b.id] ?? 0;
        if (!Number.isSafeInteger(honestLocal) || honestLocal < 0 || !Number.isFinite(d.wealth) || d.wealth < honestDeduct || !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(count + 1)) return { speaker: d.name, title, look: a.look, text: '钱货有变，这笔买卖作罢。', options: [{ label: '离开', act: back }] };
        const prevWealth = d.wealth, hadBag = !!d.bag, hadItem = Object.prototype.hasOwnProperty.call(bag, b.id);
        d.bag = bag; d.wealth -= honestDeduct; bag[b.id] = count + 1;
        if (!C.exchangeSelectedItem(h, b, { id: curId, n: honestLocal })) {
          d.wealth = prevWealth; if (hadItem) bag[b.id] = count; else delete bag[b.id]; if (!hadBag) d.bag = undefined;
          return { speaker: d.name, title, look: a.look, text: `物品或${curName}数量有变，交易未完成。`, options: [{ label: '离开', act: back }] };
        }
        this.addCred(1); return { speaker: d.name, title, look: a.look, text: `${d.name}验过丹药，付了 ${honestLocal} ${curName}。「道友爽快。」`, options: [{ label: '还有别的事', act: back }] };
      } });
      const up = ITEM_LIST.filter((x) => x.type === 'pill' && x.tier === it.tier + 1 && x.price > it.price * 2 && !x.id.startsWith('pill_zhuji') === false ? true : x.type === 'pill' && x.tier === it.tier + 1 && x.price > it.price * 2);
      if (hasFen && up.length) {
        const fake = up[(d.seed + b.id.length) % up.length];
        const priceMortal = Math.round(fake.price * 0.65 * (d.pers === 'greedy' ? 0.85 : 1));
        const priceLocal = scaleFromMortalStones(priceMortal, ACTIVE_WORLD, 1);
        const priceDeduct = priceLocal * rate;
        const seeCh = clamp(0.12 + (d.realm - h.realm) * 0.18 + (d.pers === 'cautious' ? 0.25 : 0) + (d.role === 'alchemist' as any ? 0.4 : 0), 0.05, 0.85);
        let used = false;
        opts.push({ label: `以伪灵粉染成【${fake.name}】卖他（${priceLocal} ${curName} · 当场识破约 ${Math.round(seeCh * 100)}%）`, tone: 'bad', disabled: d.wealth < priceDeduct, hint: '得手降信义；他日后服用必知受骗，按被骗记仇、找你寻仇、坏你名声', act: () => {
          const failed = () => ({ speaker: d.name, title, look: a.look, text: '钱货或伪灵粉已变化，交易未完成。', options: [{ label: '离开', act: back }] });
          if (used || !h.bag.includes(b) || b.fake || !Number.isSafeInteger(b.n) || b.n <= 0 || C.bagCount(h, 'mat_weilingfen') < 1 || !Number.isSafeInteger(priceLocal) || priceLocal < 0 || !Number.isFinite(d.wealth) || d.wealth < priceDeduct) return failed();
          used = true;
          if (Math.random() < seeCh) {
            if (!C.exchangeItems(h, [{ id: 'mat_weilingfen', n: 1 }], [])) { used = false; return failed(); }
            d.favor = clamp(d.favor - 30, -100, 100); if (d.grudge < 1) { d.grudge = 1; d.why = '以假丹骗他'; }
            this.addCred(-6, '卖假丹当场被识破'); g.ws.rep = clamp(g.ws.rep - 2, -100, 100);
            if (g.living) g.living.addHate(d, { id: 'me' } as any, 30, '以假丹骗他', g.day);
            return { speaker: d.name, title, look: a.look, mood: 'danger', text: `${d.name}捻起丹药在鼻端一嗅，脸色骤变：「染色的${it.name}？！你当我是三岁孩童？」\n\n（好感 -30，结下仇怨，信义 -6）`, options: [{ label: '……', act: back }] };
          }
          const prevWealth = d.wealth, prevSeq = this.seq, hadSales = !!g.ws.fakeSales;
          const sales = (g.ws.fakeSales ??= []);
          const record = { id: this.seq++, buyerId: d.id, buyerName: d.name, item: fake.name, day: Math.floor(g.day), price: priceLocal };
          d.wealth -= priceDeduct; sales.push(record);
          if (!C.exchangeSelectedItem(h, b, { id: curId, n: priceLocal }, [{ id: 'mat_weilingfen', n: 1 }])) {
            d.wealth = prevWealth; this.seq = prevSeq; sales.splice(sales.indexOf(record), 1); if (!hadSales) g.ws.fakeSales = undefined; used = false; return failed();
          }
          this.addCred(-4, '以假丹骗人得手');
          return { speaker: d.name, title, look: a.look, text: `${d.name}对着日光看了看丹药的光泽，满意地付了 ${priceLocal} ${curName}：「好丹！道友这等好物还有没有？」\n\n（他迟早会服下这枚染色丹——到那时，hate 网会如实记下这笔账）`, options: [{ label: '告辞（快走）', act: back }] };
        } });
      }
    }
    if (!pills.length) opts.push({ label: '（储物袋里没有可卖的丹药）', disabled: true, act: back });
    if (!hasFen) opts.push({ label: '（想掺假？坊市杂货/鬼市有售「伪灵粉」）', disabled: true, act: back });
    opts.push({ label: '不卖了', act: back });
    return { speaker: d.name, title, look: a.look, text: `${d.name}瞥了眼你的储物袋：「道友有丹药要出手？拿来瞧瞧。」`, options: opts };
  }
  /** 酒楼：花灵石让说书人放风，把仇家调虎离山 */
  spreadRumorNode(back: () => DNode): DNode {
    const g = this.game, h = g.hero;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const fee = scaleFromMortalStones(60 * worldStoneScale(h.realm, ACTIVE_WORLD), ACTIVE_WORLD, 1);
    const foes = g.npcs.list.filter((d) => d.alive && !d.canon && (d.grudge >= 1 || (d.hate?.some((x) => x.id === 'me') ?? false) || d.hunting) && (d.map ?? 'renjie') === ACTIVE_MAP && !d.plan?.help);
    const opts: DOpt[] = foes.slice(0, 5).map((d) => ({ label: `放风：「某处异宝出世」，引${d.name}（${realmName(d.realm, d.stage)}${d.hunting ? ' · 正追杀你' : ''}）离开（${fee} ${curName}）`, disabled: C.bagCount(h, curId) < fee, act: () => {
      C.removeItem(h, curId, fee);
      const at = this.spot(5000, 9000) ?? { x: d.x + 4000, y: d.y };
      const r = this.pushRumor({ text: `${pick(PLACE)}有异宝出世（你让说书人放出的假消息）`, truth: 0, src: 'me', srcName: '你', motive: 'bait', kind: 'treasure', map: ACTIVE_MAP, x: at.x, y: at.y, targetId: d.id, targetName: d.name, byPlayer: true, until: Math.floor(g.day) + 25 });
      void r;
      d.hunting = false; d.chasing = false; d.huntAt = Math.max(d.huntAt ?? 0, Math.floor(g.day) + 22);
      d.plan = { k: 'explore', why: '听闻异宝出世，星夜赶去', until: Math.floor(g.day) + 20, t0: Math.floor(g.day), x: at.x, y: at.y };
      d.tx = at.x; d.ty = at.y;
      g.rel?.log(`你让说书人放出假消息，${d.name}信以为真，往${pick(PLACE)}去了（约二十日）。`, 'info');
      return { speaker: '说书先生', title: '放风', text: `说书先生把灵石揣进袖里，拍了拍醒木：「列位看官，且说那${PLACE[0]}——」\n\n不出三日，${d.name}便会听到这则“异宝出世”的消息，星夜赶去扑个空。二十日内他顾不上你——但他若活着回来，多半会知道是谁放的风。`, options: [{ label: '调虎离山', tone: 'gold', act: back }] };
    } }));
    if (!foes.length) opts.push({ label: '（眼下没有需要调开的仇家）', disabled: true, act: back });
    opts.push({ label: '算了', act: back });
    return { speaker: '说书先生', title: '放风', text: '说书先生凑过来，笑得意味深长：「道友想让谁听到点什么？老朽这张嘴，一个时辰能传遍半座城。」', options: opts };
  }
  /** 分赃时刻的红色选项：杀人夺宝一时爽，ties 网里他的师门 / 道侣 / 结拜兄弟记你一辈子 */
  onBetrayPartner(pn: string, pr: number, siteName: string) {
    const g = this.game;
    this.addCred(-10, '分赃翻脸、独吞宝物');
    const kin = g.npcs.list.filter((d) => d.alive && !d.canon && !d.beauty && d.faction !== 'mortal' && d.realm >= Math.max(1, pr - 1) && (d.map ?? 'renjie') === ACTIVE_MAP && d.grudge < 2);
    if (!kin.length || Math.random() > 0.65) return;
    const k = pick(kin); const rel = pick(['师兄', '道侣', '结拜兄弟', '同门师弟']);
    k.grudge = 2; k.favor = Math.min(k.favor, -60); k.why = `你在${siteName}翻脸杀害其${rel}${pn}夺宝`;
    k.hunting = false; k.huntAt = Math.floor(g.day) + rint(5, 20);
    if (g.living) g.living.addHate(k, { id: 'me' } as any, 90, `在${siteName}杀其${rel}${pn}夺宝`, g.day, true);
    g.rel?.log(`${pn}的${rel}${k.name}（${realmName(k.realm, k.stage)}）得知你在${siteName}翻脸夺宝，与你结下血仇。`, 'bad');
    g.news(`苏寒在${siteName}与同伴${pn}分赃翻脸、独吞遗宝。`, 'personal');
  }

  // ========================================================================
  // 2.3 骗局 #4：美人局 —— 天欢宗修士扮柔弱求护送，夜里摄魂
  // ========================================================================
  escortInviteNode(x: any, onAccept: () => void): DNode {
    const g = this.game, h = g.hero, d = x.d, n = x.npc;
    const opts: DOpt[] = [];
    if (g.renxin.hasExp2('meiren')) opts.push({ label: '（你想起上次夜里那声琵琶……口头应允，暗中以神识护住心神）', tone: 'gold', act: () => { d.guarded = true; onAccept(); return null; } });
    opts.push({ label: '神识探其根底（耗少许法力）', disabled: h.mp < 0.05, act: () => {
      h.mp = Math.max(0, h.mp - 0.05);
      const ch = clamp(0.38 + (h.realm - d.realm) * 0.25 + g.renxin.discernBonus('meiren') + (g.senseBurstT > 0 ? 0.15 : 0), 0.15, 0.95);
      if (d.scam && Math.random() < ch) {
        d.exposed = true;
        g.renxin.recordExp2('meiren', 'see', '识破美人局', `荒野遇自称遭劫的女修${d.name}求护送，神识探出其眉心桃花印记与天欢宗摄魂术的气息。`);
        return { speaker: '神识洞察', look: n.look, title: `${d.name} · 天欢宗`, mood: 'danger', text: `你神识一扫——她眉心有一点若隐若现的桃花印记，周身法力阴柔缠绵，分明是天欢宗的摄魂采补之术！所谓“遭劫”，不过是引你夜里卸下防备的戏码。`, options: [
          { label: '将计就计（应下护送，夜里反制她）', tone: 'gold', act: () => { d.guarded = true; onAccept(); return null; } },
          { label: '当面戳破，打发她走', act: () => { g.happen?.departNpc?.(x.npc, (d.realm ?? 1) >= 2); x.done = true; x.npc = undefined; return { speaker: d.name, look: n.look, text: `${d.name}眼波一转，掩口轻笑：「道友好锐的眼……既然瞒不过，妾身告退。」她化作一道粉光去了。`, options: [{ label: '……', act: () => null }] }; } },
          { label: '当场除魔', tone: 'bad', act: () => { this.escortTurn(x, true); return null; } },
        ] };
      }
      return { speaker: d.name, look: n.look, title: '气息虚弱', text: `你神识扫过，只觉她法力紊乱、气血亏虚${d.scam ? '，眉心似有一点淡粉，细看却又没了' : '，确是受了伤'}。\n\n她抬起泪眼：「道友……可是信不过妾身？」`, options: [
        { label: '护送她', tone: 'good', act: () => { onAccept(); return null; } },
        { label: '事有蹊跷，告辞', act: () => { g.happen?.departNpc?.(x.npc, (d.realm ?? 1) >= 2); x.done = true; x.npc = undefined; return null; } },
      ] };
    } });
    opts.push({ label: `护送她去${d.town}`, tone: 'good', act: () => { onAccept(); return null; } });
    opts.push({ label: '修仙界闲事莫管', act: () => { g.happen?.departNpc?.(x.npc, (d.realm ?? 1) >= 2); x.done = true; x.npc = undefined; return null; } });
    return { speaker: d.name, look: n.look, title: `女修 · ${realmName(d.realm, d.stage)} · 衣衫破损`, mood: 'love', text: `一名女修倚在树下，衣袂染尘，鬓发微乱，见你走近忙扶着树站起，盈盈一礼：\n\n「道友留步……妾身${d.name}，与师姐途中遭了劫修，失散至今。妾身法力耗尽，不敢独行，可否劳烦道友护送一程至${d.town}？妾身……必有重谢。」\n\n（护送约需一程路；入夜后会宿于野外）`, options: opts };
  }
  /** 夜里：摄魂 */
  escortNightNode(x: any): DNode {
    const g = this.game, h = g.hero, d = x.d, n = x.npc;
    if (!d.scam) {
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const pay = Math.max(1, Math.round(d.reward)); C.addItem(h, curId, pay);
      const gift = Math.random() < 0.5 ? pick(['pill_juling', planeDefaultPillId(ACTIVE_WORLD, 'liaoshang'), 'tal_pojin']) : null; if (gift) C.addItem(h, gift, 1);
      g.ws.rep = clamp(g.ws.rep + 2, -100, 100); this.addCred(2, '护送弱者守信');
      x.done = true; x.npc = undefined;
      return { speaker: d.name, look: n.look, mood: 'love', text: `夜深，篝火噼啪。${d.name}调息醒来，脸色好了许多，向你郑重一礼：「这一路多亏道友。前方不远便是${d.town}，妾身自己能走了。」\n\n她递上一只小袋：「区区薄礼，不成敬意。」\n\n获得：${curName} ${pay}${gift ? '、' + itemDef(gift).name : ''}（正道声望 +2，江湖信义 +2）`, options: [{ label: '保重', act: () => null }] };
    }
    const soulArt = h.gongfa === 'dayan' || h.arts.some((a) => a.id === 'mingqing');
    const resist = d.guarded ? 1 : clamp(0.22 + (h.realm - d.realm) * 0.25 + g.renxin.discernBonus('meiren') + (soulArt ? 0.2 : 0) + (C.bagCount(h, 'pill_yanghun') > 0 ? 0.08 : 0), 0.08, 0.92);
    if (Math.random() < resist) {
      g.renxin.recordExp2('meiren', 'see', '夜半惊醒', `护送“落难女修”${d.name}途中，夜里她琵琶声起、媚术摄魂，你${d.guarded ? '早有防备，神识一震将其魅术反震回去' : '神识一清，识破其天欢宗摄魂之术'}。`);
      this.escortTurn(x, !!d.guarded);
      return { speaker: d.name, look: n.look, mood: 'danger', text: `夜半，一缕若有若无的琵琶声钻进耳中，你的神识正一点点松软下去——\n\n忽地一凛！${d.guarded ? '你早候着这一刻，神识轰然一震' : '丹田灵力自行震荡，你猛然清醒'}：篝火对面，${d.name}指尖缠着粉色魂丝，眸中哪还有半点柔弱！\n\n「可惜了……」她舔了舔唇，「那便硬来吧。」`, options: [{ label: '天欢宗妖女！', tone: 'bad', act: () => null }] };
    }
    // 中招：摄魂采补
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const stones = C.bagCount(h, curId); const take = Math.round(stones * 0.35); if (take > 0) C.removeItem(h, curId, take);
    const vals = h.bag.filter((b) => itemDef(b.id).tier >= 1 && itemDef(b.id).price >= 100 && !Object.values(h.equip).includes(b.id) && b.id !== curId).sort((a, b) => itemDef(b.id).price - itemDef(a.id).price).slice(0, 2);
    const lostNames = vals.map((b) => { C.removeItem(h, b.id, 1, b.age ?? 0); return itemDef(b.id).name; });
    const days = rint(7, 20); C.inflictDaoHurt(h, days, '遭天欢宗摄魂采补');
    h.hp = Math.max(0.2, h.hp - 0.3); h.mp = Math.max(0, h.mp - 0.5);
    g.renxin.recordExp2('meiren', 'loss', '美人局', `护送“落难女修”${d.name}，夜里被其天欢宗摄魂术迷住心神，醒来${curName}去了三成、${lostNames.length ? lostNames.join('、') + '不翼而飞、' : ''}经脉受损${days}日。谨记：荒野柔弱女修，先探眉心。`);
    g.news(`有外地散修在荒野遭天欢宗女修设美人局，醒来囊中空空。`, 'rumor');
    x.done = true; x.npc = undefined;
    return { speaker: '……', mood: 'danger', text: `夜半，一缕琵琶声如水般漫过来。你想睁眼，眼皮却重逾千钧；篝火对面，${d.name}的身影在粉色光晕里摇曳，轻声哼着什么……\n\n再醒来已是日上三竿。篝火早熄，人已不见。你只觉丹田空荡、经脉刺痛——\n\n${curName}少了 ${take}${lostNames.length ? `，${lostNames.join('、')}不翼而飞` : ''}；经脉受损 ${days} 日。地上留着一枚桃花笺：「多谢道友相赠。」`, options: [{ label: '天欢宗……', tone: 'bad', act: () => null }] };
  }
  private escortTurn(x: any, guarded: boolean) {
    const g = this.game, d = x.d, n = x.npc; if (!n) return;
    const [rLo] = planeEncounterRange(ACTIVE_WORLD);
    const e = cultivator(n.x, n.y, clampWorldRealm(d.realm, ACTIVE_WORLD), clamp(d.stage, 0, 12), 'hehuan', `天欢宗·${d.name}`, { female: true });
    e.aggro = true; e.boss = true; e.maxHp = e.hp = Math.round(e.maxHp * 1.4); e.look = n.look; e.cs = new CharState(n.x, n.y); e.tag = 'meiren';
    if (guarded) e.hp = Math.round(e.maxHp * 0.6);
    g.combat.enemies.push(e); x.foes.push(e);
    const nh = guarded ? 1 : 2;
    for (let i = 0; i < nh; i++) { const an = Math.random() * Math.PI * 2; const m = cultivator(n.x + Math.cos(an) * 360, n.y + Math.sin(an) * 260, Math.max(rLo, d.realm - 1), rint(0, 3), 'hehuan', '天欢宗接应弟子'); m.aggro = true; g.combat.enemies.push(m); x.foes.push(m); }
    x.npc = undefined; x.d.engaged = 'fight';
    g.toast(guarded ? '你早有防备，魅术反震——她吃了暗亏！' : '天欢宗妖女撕下伪装，接应的同门从林中现身！', 'warn');
  }

  // ========================================================================
  // 2.3 骗局 #9：渡劫局 —— 求你护法的人，劫云里混着他雇来的杀手，护法的你才是真正目标
  // ========================================================================
  /** 给渡劫事件补充“这是不是局”的数据 */
  armTribul(d: any, forceScam?: boolean) {
    const g = this.game;
    d.scam = forceScam ?? (Math.random() < hapScamP('tribul'));
    if (!d.scam) return;
    const hirer = g.npcs.list.find((n) => n.alive && n.grudge >= 1 && (n.map ?? 'renjie') === ACTIVE_MAP && n.wealth >= 150) ?? g.npcs.list.find((n) => n.alive && (n.hate?.some((x) => x.id === 'me' && x.v >= 40) ?? false));
    d.hirer = hirer?.name ?? pick(['某位与你有过节的人', '暗处的买主']);
    d.hirerId = hirer?.id;
  }
  tribProbeOpts(x: any, onLeave: () => void, onStrike: () => void, onGuardedAccept: () => void): DOpt[] {
    const g = this.game, h = g.hero, d = x.d, n = x.npc;
    const out: DOpt[] = [];
    if (g.renxin.hasExp2('trib_trap') && !d.exposed) out.push({ label: '（你想起上次劫云里的杀手……应下护法，暗中留神四周）', tone: 'gold', act: () => { d.guarded = true; onGuardedAccept(); return null; } });
    out.push({ label: '先以神识探一探他与这片劫云（耗少许法力）', disabled: h.mp < 0.05, act: () => {
      h.mp = Math.max(0, h.mp - 0.05);
      const ch = clamp(0.4 + (h.realm - d.realm) * 0.25 + g.renxin.discernBonus('trib_trap') + (g.senseBurstT > 0 ? 0.15 : 0), 0.15, 0.95);
      if (d.scam && Math.random() < ch) {
        d.exposed = true;
        g.renxin.recordExp2('trib_trap', 'see', '识破渡劫局', `${d.name}佯装渡劫求你护法，神识探出劫云稀薄如幻、其丹田法力充盈——分明是${d.hirer}设下的杀局。`);
        return { speaker: '神识洞察', look: n.look, title: `${d.name} · 渡劫是假`, mood: 'danger', text: `你神识探去——头顶劫云稀薄得不成样子，雷光只在云层表面游走，分明是幻阵所化；而${d.name}丹田内法力充盈平稳，哪有半分冲关的凶险！\n\n再往四周一扫：林中伏着几道刻意收敛的气息。\n\n这是个局。护法的人才是猎物。背后多半是${d.hirer}。`, options: [
          { label: '转身就走', act: () => { onLeave(); return null; } },
          { label: '先下手为强（击杀设局者，引出杀手）', tone: 'bad', act: () => { onStrike(); return null; } },
          { label: '将计就计（假意护法，让杀手先吃暗亏）', tone: 'gold', act: () => { d.guarded = true; onGuardedAccept(); return null; } },
        ] };
      }
      return { speaker: n ? d.name : '劫云', look: n?.look, title: '劫云翻滚', text: `你神识探去，劫云中雷霆隐隐${d.scam ? '，云层却薄得有些古怪，再细看时一道雷光劈下，神识被震得生疼' : '，天威浩荡，不敢久探'}。\n\n${d.name}咬牙道：「道友……还请快些决断！」`, options: [{ label: '（回到抉择）', act: () => null }] };
    } });
    return out;
  }
  /** 护法波次：若是局，来的不是趁火打劫的邪修，而是冲你来的雇佣杀手；设局者也撕下伪装 */
  tribSpringTrap(x: any, nWave: number, humanFactory: (x0: number, y0: number, realm: number, stage: number, name: string) => Enemy): boolean {
    const g = this.game, h = g.hero, d = x.d, n = x.npc; if (!d.scam || !n) return false;
    d.robbed = true;   // 不再有“渡劫成败”的结算
    const k = nWave + (d.guarded ? 0 : 1);
    for (let i = 0; i < k; i++) {
      const an = Math.random() * Math.PI * 2;
      const realm = clampWorldRealm(h.realm + (i === 0 && Math.random() < 0.35 ? 1 : 0), ACTIVE_WORLD, true);
      const stage = clamp(h.stage + rint(0, 3), 0, REALMS[realm].stages.length - 1);
      const e = humanFactory(n.x + Math.cos(an) * 420, n.y + Math.sin(an) * 300, realm, stage, i === 0 ? `劫云下的杀手头目` : '劫云下的杀手');
      e.aggro = true; e.tag = 'tribscam'; if (i === 0) { e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 1.4); }
      if (d.guarded) e.hp = Math.round(e.hp * 0.55);
      g.combat.enemies.push(e); x.foes.push(e);
    }
    // 设局者：收了幻阵，要么加入围攻、要么遁走
    const fake = humanFactory(n.x, n.y, clampWorldRealm(d.realm, ACTIVE_WORLD), rint(0, 3), `设局者·${d.name}`);
    fake.look = n.look; fake.cs = new CharState(n.x, n.y); fake.tag = 'tribscam'; fake.aggro = true;
    if (d.guarded && Math.random() < 0.5) { fake.fled = true; fake.retreatT = 99; }
    g.combat.enemies.push(fake); x.foes.push(fake); x.npc = undefined;
    d.pend = []; d.end = g.time;   // 劫云散去
    if (d.guarded) g.renxin.recordExp2('trib_trap', 'see', '劫云反制', `${d.name}的渡劫局发动时你早有防备，抢先重创了${d.hirer}雇来的杀手。`);
    else g.renxin.recordExp2('trib_trap', 'loss', '渡劫局', `为${d.name}护法，劫云中扑出的却是${d.hirer}雇来取你性命的杀手——护法的你才是真正的目标。`);
    g.toast(`「${d.name}」忽然收了劫云——那劫云竟是幻阵！「${d.hirer}让我向道友问好。」`, 'warn');
    g.news(`有人以假渡劫设局，雇杀手围攻前来护法的修士。`, 'rumor');
    return true;
  }

  // ========================================================================
  // 2.3 骗局 #7：假悬赏 —— 榜上“妖修”其实是得罪了贴榜人的正派散修
  // ========================================================================
  /** 把一部分人形悬赏改成假悬赏（约 18%）：目标换成活世界名册中有名有姓的无辜修士 */
  markFakeOffers(offers: Bounty[], rnd: () => number) {
    const g = this.game;
    for (const o of offers) {
      if (o.def === 'beast' || o.fake !== undefined) continue;
      if (rnd() >= 0.18) { o.fake = false; continue; }
      const cands = g.npcs.list.filter((d) => d.alive && !d.canon && !d.beauty && !d.ros && !d.gz && d.faction !== 'demon' && d.faction !== 'mortal' && d.realm >= Math.max(1, o.realm - 1) && d.realm <= o.realm && (d.map ?? 'renjie') === ACTIVE_MAP && d.grudge === 0);
      if (!cands.length) { o.fake = false; continue; }
      const v = cands[Math.floor(rnd() * cands.length)];
      const posters = g.npcs.list.filter((d) => d.alive && !d.canon && (d.pers === 'greedy' || d.pers === 'ruthless' || d.pers === 'arrogant') && d.id !== v.id && (d.map ?? 'renjie') === ACTIVE_MAP && d.wealth >= 100);
      const p = posters.length ? posters[Math.floor(rnd() * posters.length)] : null;
      o.fake = true; o.npcId = v.id; o.name = `妖修·${v.name}`; o.realm = v.realm; o.stage = Math.min(v.stage, 12); o.def = planeDefaultEnemyId(ACTIVE_WORLD, 'eliteRogue');
      o.posterId = p?.id; o.poster = p?.name ?? '匿名';
      o.reward = Math.round(o.reward * 1.25);   // 诬告者出手大方
    }
  }
  /** 生成假悬赏目标：不先动手的“妖修”（其实是无辜散修） */
  spawnFakeTarget(b: Bounty): Enemy | null {
    const g = this.game; const v = b.npcId ? g.npcs.byId.get(b.npcId) : null;
    if (!v || !v.alive) { b.done = true; return null; }
    const r = clampWorldRealm(v.realm, ACTIVE_WORLD, true);
    const def = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, r >= 3 || ACTIVE_WORLD !== 'human' ? 'evil' : 'eliteRogue')] ?? ENEMIES.zhujixiu;
    const e = new Enemy(def, b.x, b.y, r, clamp(v.stage, 0, REALMS[r].hp.length - 1));
    e.name = v.name; e.hx = b.x; e.hy = b.y; e.busy = true; e.aggro = false; e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 1.6); e.tag = 'bounty:' + b.id; e.npcId = v.id;
    const act = (g.npcs as any).active?.find?.((a: any) => a.d.id === v.id); if (act) e.look = act.look;
    return e;
  }
  fakeBountyNode(b: Bounty, e: Enemy): DNode {
    const g = this.game, h = g.hero; const v = b.npcId ? g.npcs.byId.get(b.npcId) : null;
    const sect = v?.sect ? LOC_BY_ID.get(v.sect)?.name : '散修';
    const title = `${realmName(e.realm, e.stage)} · ${sect}`;
    const fight = (): DNode | null => { e.busy = false; e.aggro = true; (e as any).fakeKill = true; return null; };
    const spare = (): DNode => {
      b.done = true; b.exposed = true; e.dead = true; e.deathT = 0.9; e.spar = true; e.aggro = false;
      g.ws.rep = clamp(g.ws.rep + 3, -100, 100); this.addCred(3, '明辨假悬赏、放过无辜');
      if (v) { g.rel?.addFavor(v, 35); if (g.living) g.living.bio(v, `被诬为妖修遭悬赏，幸得苏寒明察`, g.day); }
      const poster = b.posterId ? g.npcs.byId.get(b.posterId) : null;
      if (poster) { this.jh.poster = { id: poster.id, name: poster.name, reward: b.reward, victim: v?.name ?? '', day: Math.floor(g.day) }; }
      g.renxin.recordExp2('fake_bounty', 'see', '假悬赏', `榜上“妖修·${v?.name}”其实是得罪了${b.poster}的${sect}修士。你没有不问青红皂白出手。`);
      return { speaker: v?.name ?? e.name, look: e.look, title, text: `${v?.name}长出一口气，深深一揖：「道友明鉴！${b.poster}那厮仗着有几个灵石，便拿坊市的榜来杀人……道友大恩，${v?.name}铭记于心。」\n\n（正道声望 +3，江湖信义 +3，${v?.name}好感 +35${poster ? `；贴榜人${poster.name}——下次见面可找他算账` : ''}）`, options: [{ label: '去吧', act: () => null }] };
    };
    const explain = (): DNode => ({ speaker: v?.name ?? e.name, look: e.look, title, text: `对方连连摆手，一脸苦涩：「道友且慢动手！在下${v?.name}，${sect}门下，何曾是什么妖修？\n\n是${b.poster}——他前些日子向在下强索一件法器不成，便花钱在坊市贴了这张榜，要借天下人的刀杀我！道友若不信，可去问问${sect}的人……」`, options: [
      { label: '盘问细节（阅历与神识越强越准）', act: () => {
        const ch = clamp(0.35 + g.renxin.discernBonus('fake_bounty') + (g.senseBurstT > 0 ? 0.2 : 0) + (h.realm - e.realm) * 0.15, 0.2, 0.95);
        if (Math.random() < ch) return { speaker: '察言观色', look: e.look, title, text: `你细细盘问他的师承、门中长老的名讳、与${b.poster}结怨的前后——他对答如流，眼神坦荡，并无半点魔修的阴戾煞气。\n\n榜是假的。`, options: [{ label: '放他走', tone: 'good', act: spare }, { label: '管他真假，赏金要紧', tone: 'bad', act: fight }] };
        return { speaker: '察言观色', look: e.look, title, text: `他说得入情入理，可魔修里巧舌如簧的也不少……你一时拿不准。`, options: [{ label: '神识探其有无魔气', act: () => probe() }, { label: '宁可信其有，动手', tone: 'bad', act: fight }, { label: '放他走', act: spare }] };
      } },
      { label: '神识探其有无魔气（耗少许法力）', disabled: h.mp < 0.05, act: () => probe() },
      { label: '放他走', act: spare },
      { label: '「榜上写得明白——拿命来！」', tone: 'bad', act: fight },
    ] });
    const probe = (): DNode => {
      h.mp = Math.max(0, h.mp - 0.05);
      const ch = clamp(0.55 + (h.realm - e.realm) * 0.2 + g.renxin.discernBonus('fake_bounty'), 0.3, 0.95);
      if (Math.random() < ch) return { speaker: '神识感应', look: e.look, title, text: `你神识细细扫过他周身——法力清正，经脉中并无半缕魔气血煞。榜上的“妖修”二字，是假的。`, options: [{ label: '放他走', tone: 'good', act: spare }, { label: '管他真假，赏金要紧', tone: 'bad', act: fight }] };
      return { speaker: '神识感应', look: e.look, title, text: `他护体灵光极稳，神识探不进去。`, options: [{ label: '放他走', act: spare }, { label: '动手', tone: 'bad', act: fight }] };
    };
    return { speaker: e.name, look: e.look, title: `悬赏目标 · ${title}`, mood: 'danger', text: `榜上的“妖修·${v?.name}”就在眼前。他并未动手，反倒后退一步，神色惊疑：\n\n「道友也是冲着那张榜来的？……在下冤枉啊！」`, options: [
      { label: '让他把话说完', act: explain },
      { label: '「少废话！」直接动手', tone: 'bad', act: fight },
    ] };
  }
  /** 杀了假悬赏目标：赏金照付，真相随之揭开——声望、信义重挫，hate/ties 血仇网如实接住 */
  onFakeBountyKill(b: Bounty) {
    const g = this.game; const v = b.npcId ? g.npcs.byId.get(b.npcId) : null;
    g.ws.rep = clamp(g.ws.rep - 15, -100, 100); this.addCred(-10, '错杀无辜');
    if (v && v.alive) { v.alive = false; v.deathNote = '被苏寒误作悬赏妖修所杀'; g.rel?.onPlayerKill(v, false); g.renxin.onNpcKilledByPlayer?.(v); }
    g.renxin.recordExp2('fake_bounty', 'loss', '错杀', `照榜斩杀“妖修·${v?.name ?? b.name}”，从其身上搜出${v?.sect ? LOC_BY_ID.get(v.sect)?.name ?? '宗门' : '散修'}身份玉牌——他是被${b.poster}诬告的无辜修士。他的亲族师门已记下这笔血债。`);
    g.news(`苏寒照悬赏榜斩杀的“妖修”${v?.name ?? ''}实为无辜散修，贴榜的${b.poster}与其有私怨。`, 'personal');
    g.toast(`你从尸身上搜出一枚身份玉牌——他不是妖修。榜是${b.poster}贴的假榜！（正道声望 -15，信义 -10，其亲族师门结下血仇）`, 'warn');
    const poster = b.posterId ? g.npcs.byId.get(b.posterId) : null;
    if (poster) this.jh.poster = { id: poster.id, name: poster.name, reward: b.reward, victim: v?.name ?? '', day: Math.floor(g.day) };
  }
  /** 找贴榜人算账 */
  posterOpt(a: any, title: string, back: () => DNode): DOpt | null {
    const g = this.game, h = g.hero, d: NpcData = a.d; const P = this.jh.poster;
    if (!P || P.id !== d.id) return null;
    return { label: `「${P.victim}的榜，是你贴的？」（揭穿假悬赏）`, tone: 'gold', act: () => {
      this.jh.poster = undefined;
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const rate = planeExchangeRate(ACTIVE_WORLD);
      const pay = Math.max(1, Math.round(P.reward * 2));
      const scared = h.realm > d.realm || (h.realm === d.realm && h.stage > d.stage + 2);
      if (scared && d.wealth >= pay * 0.5 * rate) {
        const got = Math.min(pay, Math.max(1, Math.floor(d.wealth / rate))); d.wealth -= got * rate; C.addItem(h, curId, got);
        d.favor = clamp(d.favor - 20, -100, 100); if (g.living) g.living.addHate(d, { id: 'me' } as any, 30, '揭穿其假悬赏并索赔', g.day);
        this.addCred(2); g.ws.rep = clamp(g.ws.rep + 2, -100, 100);
        return { speaker: d.name, title, look: a.look, text: `${d.name}脸色几变，终究在你的目光下矮了半截：「是……是在下一时糊涂……」他哆嗦着交出 ${got} ${curName}赔罪。\n\n（他嘴上服软，心里已把你记恨上了）`, options: [{ label: '下不为例', act: back }] };
      }
      d.favor = clamp(d.favor - 40, -100, 100); d.grudge = Math.max(d.grudge, 1); d.why = '揭穿其假悬赏';
      return { speaker: d.name, title, look: a.look, mood: 'danger', text: `${d.name}眯起眼：「榜是我贴的又如何？坊市收了灵石，白纸黑字——道友若不服，大可去坊市理论。」\n\n（他已视你为敌）`, options: [{ label: '走着瞧', tone: 'bad', act: back }] };
    } };
  }

  // ========================================================================
  // 2.3 骗局 #6：拍卖托 —— 大城拍卖会上有托抬价；神识扫视全场可看穿
  // ========================================================================
  /** 为拍品安排托（确定性：按城与季度） */
  planShills(loc: LocDef, lots: AuctionLot[], bidders: string[]) {
    let s = ((loc.x * 131 + loc.y * 17) | 0) + Math.floor(this.game.day / 90) * 7 + 11;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (const l of lots) { if (l.shill !== undefined) continue; l.shill = rnd() < 0.28 ? bidders[Math.floor(rnd() * bidders.length)] : null; }
  }
  /** 托的喊价：你一出价他就抬，直到约 2.2 倍底价才罢手（看穿后不再抬） */
  shillBid(l: AuctionLot): string | null {
    if (!l.shill || l.shillOut || l.exposed) return null;
    if (l.price >= l.base * 2.2) { l.shillOut = true; return null; }
    return Math.random() < 0.9 ? l.shill : null;
  }
  /** 神识扫视全场 */
  scanShill(l: AuctionLot): { found: boolean; text: string } {
    const g = this.game, h = g.hero;
    h.mp = Math.max(0, h.mp - 0.05);
    if (!l.shill) return { found: false, text: '你神识掠过全场：举牌的几位或喜或忧，倒都像是真心想要。' };
    if (l.exposed) return { found: true, text: `${l.shill}已被你看穿，正低头装作喝茶。` };
    const ch = clamp(0.45 + g.renxin.discernBonus('shill') + (h.realm >= 3 ? 0.15 : 0) + (g.senseBurstT > 0 ? 0.1 : 0), 0.25, 0.95);
    if (Math.random() < ch) {
      l.exposed = true; this.jh.shillSeen = (this.jh.shillSeen ?? 0) + 1;
      g.renxin.recordExp2('shill', 'see', '拍卖托', `拍卖会上看穿${l.shill}每每在你出价后才举牌、眼神却总往拍卖师那边瞟——是拍卖行安排的托。`);
      return { found: true, text: `你神识一扫：${l.shill}每次都在你出价之后才举牌，加价不多不少恰好一成；他从不看拍品，眼神总往拍卖师那边瞟——\n\n是托！被看穿后，他讪讪放下了牌子。` };
    }
    return { found: false, text: '场中人声嘈杂、神识交错，你一时看不出端倪。' };
  }
  /** 拍得时结算：被托抬了价就记一笔阅历 */
  onAuctionWon(l: AuctionLot, paid: number) {
    if (l.shill && !l.exposed && paid > l.base * 1.5) {
      this.game.renxin.recordExp2('shill', 'loss', '被托抬价', `拍卖会上被${l.shill}一路抬价，多花了约 ${Math.round(paid - l.base * 1.15)} 灵石才拍得${itemDef(l.id).name}——他是拍卖行的托。`);
      return `（事后你才听说：${l.shill}是拍卖行安排的托……）`;
    }
    return '';
  }

  // ========================================================================
  // 3.3 敌人心眼 —— 先礼后兵（勒索）/ 诈败诱敌 / 渔翁得利
  // ========================================================================
  /** 高阶劫修先传音勒索：交三成灵石是真饶——但他记住你好欺负；翻脸打赢，这一片劫修绕着你走 */
  extortNode(x: any): DNode | null {
    const g = this.game, h = g.hero;
    const foes: Enemy[] = x.foes.filter((e: Enemy) => !e.dead); const lead = foes[0]; if (!lead) return null;
    if (!(lead.realm > h.realm) || x.d.hunter || g.concealed) return null;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const have = C.bagCount(h, curId); const fee = Math.max(ACTIVE_WORLD === 'human' ? 30 : 2, Math.round(have * 0.3));
    const ex = this.jh.extort; const repeat = !!x.d.extortRepeat;
    const fight = () => { for (const e of foes) { e.busy = false; e.aggro = true; (e as any).extort = true; } x.d.engaged = true; x.d.extortFight = lead.name; return null; };
    const names = (() => { lead.name = repeat && ex ? ex.name : `${pick(SURN)}${pick(['老怪', '一刀', '阎罗', '三爷', '魔'])}`; return lead.name; })();
    const depart = (line: string) => {
      if (g.happen?.departFoes) g.happen.departFoes(foes, line);
      else for (const e of foes) { if (!e.dead) { e.busy = false; e.aggro = false; e.flee = true; e.cowered = true; e.retreatT = 16; (e as any).departing = true; (e as any).noP = true; if (e.realm >= 2) e.dun = 1; } }
      x.done = true;
    };
    return { speaker: names, title: `${realmName(lead.realm, lead.stage)} · 高你一阶`, mood: 'danger', text: `一道冰冷的传音钻进识海：\n\n「${repeat ? `又见面了，小子。上回那三成${curName}花得挺快——` : `${realmName(h.realm, h.stage)}的小辈，身上${curName}倒不少。`}交出三成（${fee} ${curName}），老夫便当没见过你。否则——」\n\n（他修为高过你一阶。给钱，他是真放人；不给，便是生死斗）`, options: [
      { label: `交出 ${fee} ${curName}`, disabled: have < fee, tone: 'gold', act: () => {
        C.removeItem(h, curId, fee);
        depart('识相！');
        this.jh.extort = { name: lead.name, realm: lead.realm, stage: lead.stage, day: Math.floor(g.day), n: (ex?.n ?? 0) + 1, paid: (ex?.paid ?? 0) + fee };
        g.renxin.recordExp2('extort', 'loss', '花钱消灾', `被${lead.name}（${realmName(lead.realm, lead.stage)}）传音勒索 ${fee} ${curName}。他记住了你好欺负。`);
        return { speaker: lead.name, mood: 'danger', text: `「识相。」几人收起法器转身化作遁光远去，传音却久久回荡：「小子，下月再会。」\n\n（他记住了你好欺负——下月多半还会来）`, options: [{ label: '……', act: () => null }] };
      } },
      { label: '「要钱没有，要命一条。」', tone: 'bad', act: fight },
      ...(g.ws.rep >= 60 || g.ws.rep <= -60 ? [{ label: '报上名号：「在下苏寒。」', act: (): DNode => { if (Math.random() < 0.5) { depart('告辞！'); return { speaker: lead.name, text: `对方沉默片刻：「……原来是你。罢了，今日不做这生意。」说罢转身御器离去。`, options: [{ label: '……', act: () => null }] }; } fight(); return { speaker: lead.name, mood: 'danger', text: '「苏寒？那更要留下点什么了。」', options: [{ label: '来吧', tone: 'bad', act: () => null }] }; } } as DOpt] : []),
    ] };
  }
  /** 翻脸打赢勒索者：威名传开 */
  onExtortWin(name: string) {
    const g = this.game;
    this.jh.feared = Math.floor(g.day) + 60; this.jh.extort = undefined;
    g.renxin.recordExp2('extort', 'see', '以战止勒', `翻脸击败勒索你的${name}，这一片的劫修六十日内都绕着你走。`);
    g.news(`勒索过路修士的${name}栽在了苏寒手里。`, 'personal');
    g.toast('你的凶名在这一带的劫修中传开了——六十日内，寻常劫修见你便避。', 'good');
  }
  feared(): boolean { return (this.jh.feared ?? 0) > this.game.day; }
  /** 诈败：狠辣敌人血量四成时假装遁逃，把你引进同伙包围圈 */
  layAmbush(e: Enemy, dirx: number, diry: number) {
    const g = this.game, c = g.combat;
    const n = 2 + (e.realm >= 3 ? 1 : 0); const foes: Enemy[] = [];
    const cx = e.x + dirx * 720, cy = e.y + diry * 560;
    for (let i = 0; i < n; i++) {
      const an = Math.random() * Math.PI * 2, R = rand(120, 220);
      const x = clamp(cx + Math.cos(an) * R, 300, WORLD_W - 300), y = clamp(cy + Math.sin(an) * R, 300, WORLD_H - 300);
      const rs = foeRealm(g, x, y, 'minion', Math.random, 1, e.realm);
      const r = clampWorldRealm(rs.realm, ACTIVE_WORLD, true);
      const def = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, r >= 2 ? 'eliteRogue' : 'rogue')] ?? ENEMIES.zhujixiu;
      const m = new Enemy(def, x, y, Math.min(r, e.realm), rs.stage);
      m.name = `${e.name}的伏兵`; m.busy = true; m.hx = x; m.hy = y; m.team = e.team; m.minion = true; (m as any).ambusher = true;
      c.enemies.push(m); foes.push(m);
    }
    this.ambushes.push({ leader: e, foes, t0: g.time, sprung: false, warned: false });
    (e as any).feint = true; e.retreatT = 3.4;
    c.texts.push({ x: e.x, y: e.y - 140, s: pick(['不好，先撤！', '今日算我栽了……', '走！']), color: '#ffd0a0', source: e, t: 0, vy: -20 } as any);
  }
  private ambushTick(_dt: number) {
    const g = this.game, p = g.player, c = g.combat;
    this.ambushes = this.ambushes.filter((a) => {
      const alive = a.foes.filter((f) => !f.dead && c.enemies.includes(f));
      if (!alive.length) return false;
      if (!a.sprung) {
        const cx = alive.reduce((s, f) => s + f.x, 0) / alive.length, cy = alive.reduce((s, f) => s + f.y, 0) / alive.length;
        const d = Math.hypot(cx - p.x, cy - p.y);
        // 神识外放：能看见伏兵——诈败就不灵了
        if (!a.warned && g.senseBurstT > 0) {
          // 外圈只报告可发现气息；不能通过埋伏提示旁路隐匿或泄露远处姓名。
          const detectable = alive.filter((f) => !f.affix?.yinOn && enemyPerceptibility(f, p.x, p.y, g.awarenessRadius, true) > 0.05);
          if (detectable.length) {
            const leaderSeen = enemyPerceptibility(a.leader, p.x, p.y, g.detailSenseRadius, true) > 0.05;
            const who = leaderSeen ? a.leader.name : '逃走的对手';
            a.warned = true; g.toast(`神识中：${who}逃去的方向伏着 ${detectable.length} 道气息——这是诈败诱敌！`, 'warn');
            g.renxin.recordExp2('feint', 'see', '识破诈败', `${who}佯装不敌遁逃，你神识外放察觉伏兵，没有追进包围圈。`);
          }
        }
        if (d < 330) {
          a.sprung = true;
          for (const f of alive) { f.busy = false; f.aggro = true; }
          if (!a.leader.dead) { a.leader.retreatT = 0; (a.leader as any).feint = false; a.leader.hp = Math.min(a.leader.maxHp, a.leader.hp + a.leader.maxHp * 0.12); c.texts.push({ x: a.leader.x, y: a.leader.y - 140, s: '中计了吧！', color: '#ff9a7a', source: a.leader, t: 0, vy: -22, big: true } as any); }
          g.toast(a.warned ? '你明知有伏，仍杀了进来——伏兵四起！' : '伏兵四起！——他方才是诈败诱敌！', 'warn');
          if (!a.warned) {
            const who = enemyPerceptibility(a.leader, p.x, p.y, g.detailSenseRadius, g.senseBurstT > 0) > 0.05 ? a.leader.name : '对手';
            g.renxin.recordExp2('feint', 'loss', '诈败诱敌', `追击佯装遁逃的${who}，一头扎进了他同伙的包围圈。谨记：狠辣之徒“败退”时，先放神识看看前方。`);
          }
          g.juice?.(0.06, 0.4);
          return true;
        }
        if (g.time - a.t0 > 25 || a.leader.dead || a.leader.gone) { for (const f of alive) if (!f.aggro) c.enemies = c.enemies.filter((o) => o !== f); return false; }
        return true;
      }
      return true;
    });
  }
  /** 渔翁：你和妖兽打到残血时，旁观的贪婪修士才动手 */
  private fisherTick(dt: number) {
    const g = this.game, h = g.hero, p = g.player, c = g.combat;
    if (this.fisher) {
      const f = this.fisher;
      if (f.dead || !c.enemies.includes(f) || f.gone) { this.fisher = null; this.fisherCd = 240; return; }
      this.fisherT += dt;
      if (this.fisherState === 'watch') {
        const lock = c.lock; const beastDead = !lock || lock.dead || lock.def.kind === 'human';
        if (h.hp < 0.3 || (beastDead && h.hp < 0.55)) {
          this.fisherState = 'strike'; f.busy = false; f.aggro = true;
          c.texts.push({ x: f.x, y: f.y - 140, s: '鹬蚌相争，渔翁得利——便宜我了！', color: '#ffd080', source: f, t: 0, vy: -22, big: true } as any);
          const seen = enemyPerceptibility(f, p.x, p.y, g.detailSenseRadius, g.senseBurstT > 0) > 0.05;
          const who = seen ? f.name : '一名观望的修士';
          g.toast(`${who}出手了——他等的就是你力竭的这一刻！`, 'warn');
          g.renxin.recordExp2('fisher', 'loss', '渔翁得利', `与妖兽恶战至残血时，${who}趁机出手。谨记：斗兽时，先看看四周有没有“观众”。`);
        } else if (h.hp > 0.72 || this.fisherT > 70 || (beastDead && h.hp >= 0.55)) {
          c.enemies = c.enemies.filter((o) => o !== f); this.fisher = null; this.fisherCd = 200;
          if (enemyPerceptibility(f, p.x, p.y, g.detailSenseRadius, g.senseBurstT > 0) > 0.05) g.toast(`远处观望的${f.name}见无机可乘，悻悻离去。`, 'info');
        } else {
          // 保持百丈距离观望
          const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
          if (d > 760) { f.x += dx / d * 150 * dt; f.y += dy / d * 150 * dt; }
          f.facing = dx > 0 ? 1 : -1;
        }
      }
      return;
    }
    this.fisherCd -= dt; if (this.fisherCd > 0) return;
    const lock = c.lock;
    if (!lock || lock.dead || lock.def.kind === 'human' || !lock.aggro || h.hp > 0.45 || c.safeAt(p.x, p.y)) return;
    if (c.enemies.some((e) => e.def.kind === 'human' && !e.dead && e.aggro)) return;
    if (Math.random() > 0.55) { this.fisherCd = 60; return; }
    const an = Math.random() * Math.PI * 2, R = Math.max(g.detailSenseRadius + 260, g.senseRadius * 1.08);
    const x = clamp(p.x + Math.cos(an) * R, 300, WORLD_W - 300), y = clamp(p.y + Math.sin(an) * R * 0.8, 300, WORLD_H - 300);
    if (!g.terrain.isLand(x, y)) { this.fisherCd = 30; return; }
    const rs = foeRealm(g, x, y, 'rogue', Math.random, 1, Math.max(1, h.realm));
    const [rLo] = planeEncounterRange(ACTIVE_WORLD);
    const realm = clampWorldRealm(Math.max(rs.realm, h.realm - (Math.random() < 0.5 ? 1 : 0)), ACTIVE_WORLD);
    const def = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, realm >= 2 ? 'eliteRogue' : 'rogue')] ?? ENEMIES.zhujixiu;
    const f = new Enemy(def, x, y, Math.max(rLo, realm), clamp(rs.stage, 0, REALMS[realm].hp.length - 1));
    f.name = `旁观的散修·${pick(SURN)}${pick(['三', '六', '九', '老', '铁'])}`; f.busy = true; f.aggro = false; f.hx = x; f.hy = y; (f as any).fisher = true;
    c.enemies.push(f); this.fisher = f; this.fisherT = 0; this.fisherState = 'watch';
    g.toast(`神识中：一名修士远远停在百丈外，不进也不退，似在观望你与妖兽的厮杀……`, 'warn');
  }

  // ========================================================================
  // 每帧 / 每日
  // ========================================================================
  tick(dt: number) {
    const g = this.game, p = g.player;
    this.ambushTick(dt);
    this.fisherTick(dt);
    // 传闻所指之处：走到跟前才知真假
    for (const r of this.activeRumors()) {
      if (r.kind !== 'treasure' || r.byPlayer || r.map !== ACTIVE_MAP || r.x === undefined) continue;
      if (Math.hypot(r.x - p.x, r.y! - p.y) > 240) continue;
      r.done = true; this.resolveTreasure(r);
      break;
    }
  }
  private resolveTreasure(r: Rumor) {
    const g = this.game, h = g.hero;
    if (r.truth >= 1) {
      const got = loot(g, clamp(r.tier ?? h.realm, 0, 4), 1.3, { scroll: 0.35, art: 0.3, map: 0.15 });
      g.toast(`${r.srcName}的消息是真的！在此处寻得：${got.join('、')}`, 'good');
      g.renxin.recordExp2('bait', 'see', '消息为真', `${r.srcName}所言${r.text.slice(0, 10)}……属实，寻得${got.join('、')}。`);
      return;
    }
    if (r.truth > 0) {
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const ls = scaleFromMortalStones(Math.round(rand(10, 30) * worldStoneScale(h.realm, ACTIVE_WORLD)), ACTIVE_WORLD, 1); C.addItem(h, curId, ls);
      g.toast(`此处确有打斗与挖掘的痕迹——可惜已被人捷足先登，只在草丛里拾到 ${ls} ${curName}。`, 'info');
      return;
    }
    // 设饵：魔修聚人头的局
    const n = 3 + (h.realm >= 3 ? 1 : 0);
    const evilDef = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, 'evil')] ?? ENEMIES.moxiu;
    for (let i = 0; i < n; i++) {
      const an = Math.random() * Math.PI * 2, R = rand(260, 420);
      const realm = clampWorldRealm(h.realm + (i === 0 && Math.random() < 0.3 ? 1 : 0) - (i > 1 && Math.random() < 0.5 ? 1 : 0), ACTIVE_WORLD, true);
      const def = ACTIVE_WORLD === 'human' && realm >= 3 ? (ENEMIES.jindan_mo ?? evilDef) : evilDef;
      const e = new Enemy(def, r.x! + Math.cos(an) * R, r.y! + Math.sin(an) * R * 0.8, realm, clamp(rint(0, 4), 0, REALMS[realm].hp.length - 1));
      e.name = i === 0 ? '设局的魔修头目' : '埋伏的魔修'; e.aggro = true; if (i === 0) e.boss = true;
      if (r.exposed) e.hp = Math.round(e.maxHp * 0.6);
      g.combat.enemies.push(e);
    }
    if (r.exposed) { g.toast('你明知是局仍来了——魔修们没料到你早有防备，先手重创！', 'warn'); g.renxin.recordExp2('bait', 'see', '将计就计', `明知${r.srcName}放出的“宝地”是伏击圈，仍有备而来，反杀设局魔修。`); }
    else { g.toast(`“宝地”空空如也——四面杀气骤起！${r.srcName}的消息是魔修聚人头的局！`, 'warn'); g.renxin.recordExp2('bait', 'loss', '宝地伏击', `轻信${r.srcName}口中“${r.text.slice(0, 10)}……”，赶到时四面皆是埋伏的魔修。谨记：异宝消息要多方印证。`); }
    g.juice?.(0.08, 0.5);
  }
  daily(days: number) {
    const g = this.game, day = Math.floor(g.day);
    // 假货败露：买家迟早服下那枚染色丹
    for (const s of g.ws.fakeSales ?? []) {
      if (s.found) continue;
      if (Math.random() < 0.06 * days + (day - s.day > 30 ? 0.3 : 0)) {
        s.found = true; const b = g.npcs.byId.get(s.buyerId); if (!b || !b.alive) continue;
        b.favor = clamp(b.favor - 45, -100, 100); if (b.grudge < 1) { b.grudge = 1; b.why = `买到你卖的假${s.item}`; }
        if (g.living) g.living.addHate(b, { id: 'me' } as any, 45, `服下你卖的假${s.item}`, g.day);
        this.addCred(-4, `${b.name}发现你卖的是假丹`); g.ws.rep = clamp(g.ws.rep - 3, -100, 100);
        g.rel?.log(`${b.name}服下你卖他的“${s.item}”，药力全无反遭丹毒——他知道被骗了，四处坏你名声。`, 'bad');
        g.news(`有人在坊市卖染色假丹，买主是${b.name}。`, 'rumor');
      }
    }
    // 先礼后兵：交过钱的，下月他再来
    const ex = this.jh.extort;
    if (ex && day - ex.day >= 28 && Math.random() < 0.5 * days && !g.combat.safeAt(g.player.x, g.player.y)) {
      const x = g.happen.spawnKind('robber');
      if (x && x.foes[0]) { x.d.extortRepeat = true; const lead = x.foes[0]; lead.name = ex.name; lead.boss = true; lead.maxHp = lead.hp = Math.round(lead.hp * 1.3); ex.day = day; g.toast(`神识中：上月勒索你的${ex.name}又来了——他记得你好欺负。`, 'warn'); }
    }
    // 玩家放出的假消息：仇家扑空回来，多半知道是谁放的风
    for (const r of this.rumors) {
      if (!r.byPlayer || r.done || !r.targetId) continue;
      if (day - r.day >= 20) {
        r.done = true; const d = g.npcs.byId.get(r.targetId); if (!d || !d.alive) continue;
        d.plan = undefined;
        if (Math.random() < 0.45) { d.favor = clamp(d.favor - 10, -100, 100); if (g.living) g.living.addHate(d, { id: 'me' } as any, 20, '放假消息调虎离山戏弄他', g.day); this.addCred(-3, `${d.name}查出假消息是你放的`); g.rel?.log(`${d.name}扑了个空回来，查出“异宝出世”是你让说书人放的风，恨意更深。`, 'bad'); }
        else g.rel?.log(`${d.name}扑了个空回来，没查出是谁放的风。`, 'info');
      }
    }
    // 冒充宗门的后账：被真弟子撞破
    const fs = (g.ws.flags as any).fakeSectAt;
    if (fs && day - fs.day >= 3) { delete (g.ws.flags as any).fakeSectAt; if (Math.random() < 0.5) { g.ws.rep = clamp(g.ws.rep - 6, -100, 100); this.addCred(-4, '冒充宗门弟子被真弟子撞破'); const sn = LOC_BY_ID.get(fs.sect)?.name ?? '宗门'; g.rel?.log(`${sn}真正的执法弟子听说有人冒充本宗行走江湖，查到了你头上。`, 'bad'); if (g.ws.sect?.id === fs.sect) g.ws.sect.contrib = Math.max(0, g.ws.sect.contrib - 100); } }
    // 过期传闻
    for (const r of this.rumors) if (!r.done && r.until <= day) r.done = true;
  }
  /** 事件完成的奖励里：信义高者报酬更丰，信义差者被压价 */
  rewardMul(): number { const c = this.cred; return c >= 85 ? 1.15 : c >= 65 ? 1.05 : c < 30 ? 0.75 : 1; }

  // ========================================================================
  // 地图标记 / 机缘面板
  // ========================================================================
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [];
    for (const r of this.activeRumors()) {
      if (r.kind !== 'treasure' || r.map !== ACTIVE_MAP || r.x === undefined) continue;
      if (r.byPlayer) { out.push({ x: r.x, y: r.y!, glyph: '饵', color: '#c0a0ff', name: `你放的假消息（调开${r.targetName}）` }); continue; }
      out.push({ x: r.x, y: r.y!, glyph: '讯', color: r.exposed ? (r.truth >= 1 ? '#a0e8a0' : '#ff8a8a') : r.verified === -1 ? '#ffb080' : '#e8d8a0', name: `传闻 · ${r.srcName}${r.exposed ? (r.truth >= 1 ? '（已证实）' : '（假！伏击圈）') : r.verified === -1 ? '（印证对不上）' : r.verified === 1 ? '（有旁证）' : '（未经证实）'}` });
    }
    return out;
  }
  chances(): { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] {
    const out: { t: string; d: string; x?: number; y?: number; hot?: boolean; tone?: string }[] = [];
    for (const r of this.activeRumors()) {
      if (r.byPlayer) continue;
      if (r.kind === 'treasure') out.push({ t: `传闻 · ${r.srcName}`, d: `${r.text.slice(0, 40)}… ${r.exposed ? (r.truth >= 1 ? '【已证实】' : '【假消息 · 伏击圈】') : r.verified === -1 ? '【印证对不上，多半有诈】' : r.verified === 1 ? '【有旁证】' : '【未经证实——可向旁人印证 / 酒楼买消息】'}`, x: r.x, y: r.y, tone: r.exposed && r.truth < 1 ? 'bad' : undefined });
      else if (r.kind === 'letter') out.push({ t: `托信 · ${r.srcName} → ${r.targetName}`, d: r.exposed ? (r.truth >= 1 ? '寻常家书，送到即可' : '信里写着“持信人可杀”！') : '找到收信人即可交付；可先以神识探一探信中内容' });
      else if (r.kind === 'person') out.push({ t: `传言 · ${r.targetName}说你坏话？`, d: r.exposed ? `是${r.srcName}挑拨离间` : '可当面问明，或向旁人印证', tone: 'bad' });
    }
    const P = this.jh.poster; if (P) out.push({ t: `假悬赏 · 贴榜人${P.name}`, d: `诬告${P.victim}为妖修——下次见到他可当面算账`, tone: 'bad' });
    if (this.feared()) out.push({ t: '威名', d: `这一带劫修闻你之名而避（还剩 ${Math.ceil((this.jh.feared ?? 0) - this.game.day)} 日）`, tone: 'good' });
    if (this.jh.extort) out.push({ t: `勒索 · ${this.jh.extort.name}`, d: `你交过 ${this.jh.extort.paid} 灵石买命，他记得你好欺负——下月还会来`, tone: 'bad' });
    return out;
  }
  /** 面板上的信义一行 */
  credText() { return `江湖信义 ${this.cred} · ${this.credName()}${this.cred < 30 ? '（无人愿与你同行、坊市压价、求救无人应）' : this.cred >= 85 ? '（同行者信你、坊市给价更高）' : ''}`; }
}
void PERS_NAME; void makeName; void LOCATIONS; void WORLD_SCALE;
export type { FakeSale };
