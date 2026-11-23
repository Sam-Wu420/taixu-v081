// 第六步：奇遇与世界大事
// - 原著大事件按游戏年份发生（问仙大会、赤霄禁地、鸿家堡之变、魔道入侵梁国、归墟殿、陨魔谷……），你可参与并改变结局
// - 神识之内的随机奇遇：天材地宝出世、受伤修士、古修遗府、妖兽护宝、高人点化、散修摆摊、魔修祭坛、灵草丛
import type { Game } from './game';
import { foeRealm } from './demog';
import { LOC_BY_ID, LOCATIONS, WORLD_SCALE, ACTIVE_WORLD, regionAt, locHere, locLabel } from '../data/world';
import { worldCurrencyId, worldCurrencyName, scaleFromMortalStones, clampWorldRealm, planeDefaultEnemyId, planeDefaultPillId, planeFactions, planeEncounterRange, type WorldId } from '../data/worldHierarchy';
import { ENEMIES, ENEMY_LIST, dangerRealm, bandRealm } from '../data/enemies';
import { Enemy } from './combat';
import { cultivator, newTeam, sectName, spawnAllies, YUE_SECTS } from './melee';
import { REALMS, realmName } from '../data/realms';
import * as C from './cultivation';
import { ITEM_LIST, itemDef } from '../data/items';
import { DAYS_PER_MONTH, DAYS_PER_YEAR, yearOfDay } from './contracts';
import type { DNode } from './modal';
import { CharState, drawCharacter, randomLook, Look } from '../gfx/character';
import type { NpcData } from './npc';
import { drawHerbSprite, herbGlowRgb } from '../gfx/herbDraw';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rand(a, b + 1));
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

interface Wave { list: [string, number][]; boss?: { def: string; name: string; realm: number; stage: number; npc?: string; hp?: number } }
interface CanonEvent {
  id: string; world?: WorldId; name: string; year: number; month: number; dur: number; repeat?: number;
  loc: string; radius: number; minRealm: number;
  /** 第三十五步：到达此境界（[大境界, 小层]）就提前开启，不必苦等年份；原年份作兜底 */
  gate?: [number, number];
  announce: string; intro: string; win: string; lose: string; missed: string;
  waves: (g: Game) => Wave[];
  reward: (g: Game) => string;
  onWin?: (g: Game) => void; onMiss?: (g: Game) => void; onStart?: (g: Game) => void;
  special?: 'shengxian' | 'invasion';
  /** 第三十七步：此事件里杂兵的境界区间（按原著：赤霄禁地只许炼气弟子进；归墟殿是结丹修士的场子） */
  foe?: [number, number];
}

export const CANON_EVENTS: CanonEvent[] = [
  {
    id: 'shengxian', gate: [1, 0], name: '问仙大会', year: 2, month: 3, dur: 120, loc: 'tainan', radius: 9, minRealm: 1, special: 'shengxian',
    announce: '七派将于明年春在南屏山举办问仙大会，广招有灵根的少年。持问仙令者，可直入青霞谷。',
    intro: '南屏小会人头攒动，各派执事高坐台上。散修们为了一枚问仙令争得面红耳赤——有人愿出两千灵石，也有人在擂台上以命相搏。',
    win: '你手握问仙令，众人或羡或妒。', lose: '', missed: '问仙大会已经落幕，几个幸运儿拿着问仙令进了青霞谷。',
    waves: () => [], reward: () => '',
  },
  {
    id: 'xuese', gate: [1, 7], name: '赤霄禁地试炼', year: 4, month: 6, dur: 40, repeat: 5, loc: 'xuese', radius: 10, minRealm: 1, foe: [1, 1],
    announce: '梁国七派将再度联手开启赤霄禁地。禁地中生满筑基丹主药，亦遍布妖兽与杀机。',
    intro: '禁地禁制缓缓开启，血雾弥漫。七派弟子一拥而入——这里没有同门，只有灵药和敌人。\n\n你察觉到不止一道不怀好意的神识，正黏在你身上。',
    win: '你带着满袋灵药走出血雾。身后，有人没能出来。', lose: '', missed: '赤霄禁地关闭了。据说这一次，七派弟子十不存三。',
    waves: () => [
      { list: [['spider', 2], ['heilin', 3]] },
      { list: [['bandit', 3]] },
      { list: [['facespider', 1], ['python', 1]], boss: { def: 'mojiao', name: '禁地墨蛟', realm: 1, stage: 12, hp: 3 } },
    ],
    reward: (g) => {
      const plan: C.InventoryOutput[] = [
        { id: 'herb_zihou', n: 1, age: 120 + rint(0, 200) },
        { id: 'herb_tianling', n: 1, age: 120 + rint(0, 200) },
        { id: 'herb_huangjing', n: 3, age: 110 + rint(0, 100) },
      ];
      if (Math.random() < 0.35) plan.push({ id: 'pill_zhuji', n: 1 });
      g.grantOrDrop(plan, '赤霄禁地试炼');
      return '百年紫猴花、天灵果、黄精（筑基丹主材）';
    },
  },
  {
    id: 'yanjia', gate: [2, 0], name: '鸿家堡之变', year: 9, month: 5, dur: 60, loc: 'yanling', radius: 9, minRealm: 2, foe: [1, 2],
    announce: '鸿家堡将为鸿家女儿择婿，七派与魔道皆有人前往。江湖传言，这场喜宴怕是要见血。',
    intro: '喜宴的红绸还未撤下，堡外便升起了冲天魔气。阴灵门少主何蝉狞笑着站在血光之中：「鸿家，今日除名！」\n\n七派弟子仓皇应战，到处是惨叫声。',
    win: '何蝉的魔影溃散，鸿家堡保住了。沈如嫣远远向你行了一礼。', lose: '', missed: '鸿家堡被阴灵门血洗，鸿家几乎满门覆灭。',
    waves: (g) => [
      { list: [['moxiu', 4]] },
      { list: [['moxiu', 2], ['bloodbat', 3]] },
      { list: [['moxiu', 2]], boss: { def: 'zhujixiu', name: '何蝉', realm: 2, stage: 2, npc: 'wangchan', hp: 3.2 } },
    ],
    reward: (g) => { g.ws.rep = clamp(g.ws.rep + 15, -100, 100); g.grantOrDrop([{ id: 'mat_lingshi', n: 800 }, { id: 'art_qingjiao', n: 1 }], '鸿家堡之变'); return '灵石 800、青蛟旗、正道声望 +15'; },
    onMiss: (g) => { const n = g.npcs.byId.get('yanruyan'); if (n && Math.random() < 0.5) g.npcs.die(n, '死于鸿家堡之变'); },
  },
  {
    id: 'modao', gate: [2, 1], name: '魔门六宗入侵梁国', year: 16, month: 3, dur: 600, loc: 'huangfeng', radius: 10, minRealm: 2, special: 'invasion', foe: [1, 2],
    announce: '魔门六宗在梁国边境集结，七派人心惶惶。一场大战，迫在眉睫。',
    intro: '青霞谷护山大阵在魔光下剧烈震颤。阴灵门、天欢宗的长老亲自督战，誓要踏平青霞谷。\n\n「南荒七派，今日便是你们的死期！」',
    win: '魔道长老伏诛，残余魔修溃逃出梁国。七派守住了梁国——这一次，历史改变了。', lose: '', missed: '七派节节败退，梁国沦陷于魔道之手。七派残部退往列国盟。',
    waves: () => [
      { list: [['moxiu', 5]] },
      { list: [['moxiu', 3], ['guijiang', 1], ['bloodbat', 3]] },
      { list: [['moxiu', 3]], boss: { def: 'jindan_mo', name: '阴灵门长老', realm: 3, stage: Math.random() < 0.5 ? 0 : 1, hp: 3 } },
    ],
    reward: (g) => { g.ws.rep = clamp(g.ws.rep + 30, -100, 100); g.ws.flags.yueHeld = true; g.grantOrDrop([{ id: 'mat_lingshi', n: 3000 }, { id: 'art_lvhuang', n: 1 }], '魔门六宗入侵梁国'); return '灵石 3000、绿煌剑、正道声望 +30'; },
    onStart: (g) => { g.ws.flags.invasion = true; },
    onWin: (g) => { g.ws.flags.invasion = false; },
    onMiss: (g) => { g.ws.flags.invasion = false; g.ws.flags.yueFallen = true; },
  },
  {
    id: 'xutian', gate: [3, 0], name: '归墟殿开启', year: 60, month: 8, dur: 90, loc: 'xutian', radius: 10, minRealm: 3, foe: [3, 3],
    announce: '沧溟海传出消息：归墟殿将在明年现世，殿中藏有通天灵宝归墟鼎与玄霜冰焰。沧溟海各方老怪蠢蠢欲动。',
    intro: '海天之间，一座古殿自雾中浮现。殿门前，冷天仁负手而立，身后是九幽极圣的门人。\n\n「归墟鼎，我冷天仁要了。不服的，上来送死。」',
    win: '冷天仁败退，你踏入归墟殿深处，冰焰的寒光映亮了你的脸。', lose: '', missed: '归墟殿关闭了。据说玄霜冰焰落入了某位元婴老怪之手。',
    waves: () => [
      { list: [['guijiang', 2], ['yinhun', 3]] },
      { list: [['jindan_mo', 2]] },
      { list: [['jindan_mo', 1]], boss: { def: 'jindan_mo', name: '冷天仁', realm: 3, stage: 2, npc: 'wentianren', hp: 3.5 } },
    ],
    // 第四十步：归墟殿的古宝厅——五行环、古宝花篮；偶有六丁天甲符、补天丹
    reward: (g) => {
      const roll = Math.random();
      const id = roll < 0.12 ? 'art_xutian' : roll < 0.55 ? 'art_qianlan' : 'art_bamen';
      const plan: C.InventoryOutput[] = [{ id, n: 1 }, { id: 'mat_lingshi', n: 8000 }];
      const ex: string[] = [];
      const gb = Math.random() < 0.5 ? 'art_wuxing' : 'art_huolan';
      if (Math.random() < 0.6) { plan.push({ id: gb, n: 1 }); ex.push(itemDef(gb).name); }
      if (Math.random() < 0.2) { plan.push({ id: 'tal_liuding', n: 1 }); ex.push(itemDef('tal_liuding').name); }
      if (Math.random() < 0.08) { plan.push({ id: 'pill_butian', n: 1 }); ex.push(itemDef('pill_butian').name); }
      g.grantOrDrop(plan, '归墟殿开启');
      return [itemDef(id).name, ...ex, '灵石 8000'].join('、');
    },
  },
  {
    id: 'zhuimo', gate: [3, 1], name: '陨魔谷异变', year: 120, month: 4, dur: 120, loc: 'zhuimo', radius: 10, minRealm: 3, foe: [3, 4],
    announce: '陨魔谷禁制日渐松动，上古魔气外泄。传说谷底封印着一具古魔分身。',
    intro: '谷底魔气如潮，一道漆黑的身影缓缓睁开了眼睛。那是上古遗留的魔物，单是威压，便让人神魂欲裂。',
    win: '古魔分身溃散，陨魔谷的封印重新稳固。你在谷底找到了上古修士的遗宝。', lose: '', missed: '陨魔谷魔气外泄，方圆百里化为死地。',
    waves: () => [
      { list: [['guijiang', 3], ['facespider', 2]] },
      { list: [['guijiang', 2]], boss: { def: 'guijiang', name: '古魔分身', realm: 4, stage: 2, hp: 4 } },
    ],
    reward: (g) => { g.grantOrDrop([{ id: 'art_yuanci', n: 1 }, { id: 'pill_peiying', n: 1 }], '陨魔谷异变'); return '元磁神山、培婴丹'; },
  },
  // ====================== 灵界（spirit）大事件 ======================
  {
    id: 'ling_moyuan', world: 'spirit', gate: [5, 0], name: '魔渊破防之战', year: 180, month: 4, dur: 90, repeat: 8, loc: 'ling_moyuan_liekou', radius: 11, minRealm: 5, foe: [5, 6],
    announce: '天渊圣域万里魔渊防线震动，魔渊大军与异族斥候连番叩关，天渊卫正四方急征人妖两族客卿。',
    intro: '黑压压的魔云压过万里魔渊，魔渊统领率悍匪妖兵直扑天渊哨台，两族修士正在阵前浴血拼杀！',
    win: '魔渊锋矢被生生折断，天渊卫士卒齐声欢呼。你的名号随战报传遍风元大陆。', lose: '', missed: '魔渊防线一番激战后暂趋平息，天渊圣域折损了数座外哨。',
    waves: () => [
      { list: [['ling_moyuan_zu', 3], ['ling_moyuan', 2]] },
      { list: [['ling_moyuan', 3], ['ling_taikong_mo', 1]] },
      { list: [['ling_moyuan', 2]], boss: { def: 'ling_taikong_mo', name: '魔渊督战尊者', realm: 6, stage: 1, hp: 3.2 } },
    ],
    reward: (g) => {
      g.ws.rep = clamp(g.ws.rep + 20, -100, 100);
      g.grantOrDrop([{ id: 'mat_lingjing', n: 120 }, { id: 'pill_ningxiang', n: 1 }, { id: 'mat_leihai_jin', n: 2 }], '魔渊破防之战');
      return '灵晶 120、凝相金丹、雷海精金 ×2、正道声望 +20';
    },
  },
  {
    id: 'ling_zhenling', world: 'spirit', gate: [6, 0], name: '真灵古冢现世', year: 260, month: 8, dur: 90, loc: 'ling_zhenling_zhong', radius: 11, minRealm: 6, foe: [6, 7],
    announce: '万妖圣境极东的真灵古冢传出太古灵啸，传闻真灵精血与混沌灵材正从地脉深处涌出。',
    intro: '古冢石门轰然开启，太古妖煞与各族散修同时涌入。想要夺得真灵遗宝，须先杀退挡路强敌。',
    win: '你在古冢深处镇压守灵凶兽，将太古遗宝与真灵残珍收入囊中。', lose: '', missed: '真灵古冢重归沉寂，古冢秘藏已被几位合体老祖瓜分。',
    waves: () => [
      { list: [['ling_huangyuan_xi', 2], ['ling_manhuang_ju', 2]] },
      { list: [['ling_sanxiu', 3], ['ling_hanbing_shou', 1]] },
      { list: [['ling_manhuang_ju', 2]], boss: { def: 'ling_manhuang_ju', name: '古冢太古猿魂', realm: 7, stage: 1, hp: 3.4 } },
    ],
    reward: (g) => {
      g.grantOrDrop([{ id: 'mat_lingjing', n: 220 }, { id: 'herb_ling_xuezhizhu', n: 2 }, { id: 'mat_taiyin_sui', n: 2 }], '真灵古冢现世');
      return '灵晶 220、万年血灵芝 ×2、太阴寒髓 ×2';
    },
  },
  {
    id: 'ling_leijie', world: 'spirit', gate: [7, 0], name: '九霄雷眼淬宝', year: 380, month: 5, dur: 90, loc: 'leihai_leiyan', radius: 11, minRealm: 7, foe: [7, 8],
    announce: '无尽雷海九霄雷眼将逢百年一遇的「天雷潮」，乃炼宝淬魂、寻觅玄天残胚的大机缘。',
    intro: '九霄之上紫电如瀑垂落，雷海金鹏与各方合体老怪皆盯上了雷眼中心那缕混沌宝光！',
    win: '你在万雷轰鸣中力压群雄，夺得雷眼孕育的奇珍！', lose: '', missed: '天雷潮逐渐平息，九霄雷眼再度被狂暴雷幕封锁。',
    waves: () => [
      { list: [['ling_leipeng', 3], ['ling_leijiao_shou', 2]] },
      { list: [['ling_sanxiu', 2], ['ling_leipeng', 2]] },
      { list: [['ling_leipeng', 1]], boss: { def: 'ling_taikong_mo', name: '雷眼镇守雷魔', realm: 8, stage: 0, hp: 3.6 } },
    ],
    reward: (g) => {
      const plan: C.InventoryOutput[] = [{ id: 'mat_lingjing', n: 400 }, { id: 'pill_pojie', n: 1 }, { id: 'mat_leihai_jin', n: 3 }];
      let ex = '';
      if (Math.random() < 0.45) { plan.push({ id: 'mat_xuantian_pei', n: 1 }); ex = '、玄天混沌残胚'; }
      g.grantOrDrop(plan, '九霄雷眼淬宝');
      return `灵晶 400、破劫大乘丹、雷海精金 ×3${ex}`;
    },
  },
  // ====================== 仙界（immortal）大事件 ======================
  {
    id: 'xian_suiyue', world: 'immortal', gate: [9, 1], name: '岁月遗迹潮汐', year: 520, month: 6, dur: 100, loc: 'jinyuan_suiyue_gu', radius: 11, minRealm: 9, foe: [9, 10],
    announce: '金源仙域岁月遗迹现出时光潮汐，金仙傀儡与岁月苍蛟涌动，据传有《岁月天书》残页浮现。',
    intro: '金源仙域裂开道道光阴长河，仙宫巡界傀儡与贪婪的散仙同时围向遗迹祭坛！',
    win: '你斩碎岁月封锁，在时光残殿中拾得法则晶丝与太初遗卷！', lose: '', missed: '时光潮汐消退，岁月遗迹再度隐入时间褶皱。',
    waves: () => [
      { list: [['xian_kuilei_weishi', 3], ['xian_sanxiu', 2]] },
      { list: [['xian_shijian_jiao', 2], ['xian_kuilei_weishi', 2]] },
      { list: [['xian_xunxian_shizhe', 1]], boss: { def: 'xian_shijian_jiao', name: '岁月古蛟尊', realm: 10, stage: 1, hp: 3.5 } },
    ],
    reward: (g) => {
      const plan: C.InventoryOutput[] = [{ id: 'mat_xianyuan', n: 260 }, { id: 'mat_faze_jingsi', n: 4 }, { id: 'mat_suiyue_jinlu', n: 2 }];
      let ex = '';
      if (Math.random() < 0.5) { plan.push({ id: 'item_canjuan_page', n: 1 }); ex = '、岁月天书原章'; }
      g.grantOrDrop(plan, '岁月遗迹潮汐');
      return `仙元石 260、大道法则晶丝 ×4、岁月金露 ×2${ex}`;
    },
  },
  {
    id: 'xian_huishixi', world: 'immortal', gate: [10, 0], name: '灰煞潮汐镇压', year: 700, month: 3, dur: 120, repeat: 10, loc: 'huiyuan_shixi', radius: 11, minRealm: 10, foe: [10, 11],
    announce: '灰界渊墟潮汐暴涨，灰界蚀仙兽与堕仙大举侵蚀仙域断崖，玉皇仙宫敕令各方真仙以上修士共赴镇压。',
    intro: '灰雾吞天蔽日，五衰气息扑面而来。数尊灰界蚀仙与蚀仙兽正撕扯着金源防线！',
    win: '灰煞狂潮被强行压回渊墟深处，你从蚀仙兽残躯中剥离出纯净的混沌净源！', lose: '', missed: '灰煞潮汐退去后，金源东境又多出百里死域。',
    waves: () => [
      { list: [['xian_huimo', 3], ['xian_huijie_shixiu', 2]] },
      { list: [['xian_huijie_shixiu', 3], ['xian_huimo', 2]] },
      { list: [['xian_huimo', 2]], boss: { def: 'xian_huijie_shixiu', name: '灰墟蚀道君', realm: 11, stage: 1, hp: 3.8 } },
    ],
    reward: (g) => {
      g.ws.rep = clamp(g.ws.rep + 25, -100, 100);
      g.grantOrDrop([{ id: 'mat_xianyuan', n: 500 }, { id: 'mat_hundun_jingyuan', n: 3 }, { id: 'pill_dingxian_zhenshuai', n: 1 }], '灰煞潮汐镇压');
      return '仙元石 500、混沌净源 ×3、定仙镇衰丹、正道声望 +25';
    },
  },
];

export function canonEventsForWorld(world: WorldId = ACTIVE_WORLD): CanonEvent[] {
  return CANON_EVENTS.filter((e) => (e.world ?? 'human') === world);
}

type EncKind = 'treasure' | 'wounded' | 'cave' | 'beast' | 'sage' | 'stall' | 'altar' | 'herbfield';
interface Enc { id: number; kind: EncKind; x: number; y: number; t: number; done: boolean; seen: boolean; data: any; st?: CharState; look?: Look; foes?: Enemy[] }

export class Events {
  game: Game;
  enc: Enc[] = [];
  focus: Enc | null = null;
  private encT = 25; private invT = 10; private nid = 1;
  active: { ev: CanonEvent; wave: number; foes: Enemy[]; engaged: boolean } | null = null;
  /** 自动弹出的邀请框被 Esc 关闭：进 40 秒冷却，避免关了立刻又弹；出范围后清冷却，回来再弹 */
  private pendingOffer: CanonEvent | null = null;
  constructor(game: Game) { this.game = game; }

  /** 只读取仍在场、已被发现的奇遇，不提前生成或揭示事件细节。 */
  knownSignals(): {x:number;y:number;kind:'奇遇气息'}[] {
    return this.enc.filter(e => e.seen && !e.done && Number.isFinite(e.x) && Number.isFinite(e.y))
      .map(e => ({x:e.x,y:e.y,kind:'奇遇气息' as const}));
  }

  get year() { return yearOfDay(this.game.day); }
  startDay(ev: CanonEvent, cycle = 0) { return (ev.year - 1 + cycle * (ev.repeat ?? 0)) * DAYS_PER_YEAR + (ev.month - 1) * DAYS_PER_MONTH - (this.game.ws.evShift?.[ev.id] ?? 0); }
  /** 提前开启的大事给足赶路时间（至少约 8 分钟现实时间） */
  durOf(ev: CanonEvent) { return this.game.ws.evShift?.[ev.id] ? Math.max(ev.dur, 240) : ev.dur; }
  /** 第三十五步：按境界推进——修为到了，大事就依次到来（每件间隔约 3 分钟，不会一齐涌来） */
  private gateTick() {
    const g = this.game, h = g.hero, ws = g.ws;
    const shift = ws.evShift ?? (ws.evShift = {});
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) {
      if (!ev.gate || shift[ev.id] !== undefined) continue;
      const [r, s] = ev.gate;
      if (h.realm < r || (h.realm === r && h.stage < s)) continue;
      const cyc = this.cycleOf(ev), st = ws.events[this.keyOf(ev, cyc)];
      if (st && st.state !== 'pending') { shift[ev.id] = 0; continue; }
      const s0 = this.startDay(ev, cyc);
      const at = Math.max(ws.evNext ?? 0, g.day + 45);
      if (s0 <= at) { shift[ev.id] = 0; continue; }
      shift[ev.id] = s0 - at;
      ws.evNext = at + 90;
    }
  }
  /** 第三十六步：下一件尚未开始的大事的开始日（闭关会在此前出关） */
  nextStart(): { day: number; name: string } | null {
    const g = this.game; let best: { day: number; name: string } | null = null;
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) {
      const cyc = this.cycleOf(ev), st = g.ws.events[this.keyOf(ev, cyc)];
      if (st && st.state !== 'pending') continue;
      if (g.hero.realm < ev.minRealm - 1) continue;
      const s0 = this.startDay(ev, cyc);
      if (s0 > g.day && (!best || s0 < best.day)) best = { day: s0, name: ev.name };
    }
    return best;
  }
  keyOf(ev: CanonEvent, cycle: number) { return ev.repeat ? `${ev.id}#${cycle}` : ev.id; }
  cycleOf(ev: CanonEvent) { if (!ev.repeat) return 0; const d = this.game.day - this.startDay(ev, 0); return Math.max(0, Math.floor(d / (ev.repeat * DAYS_PER_YEAR))); }

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    const g = this.game;
    if (g.paused || g.hero.dead) return;
    this.gateTick();
    this.timeline();
    this.canonTick();
    this.encTick(dt);
    if (g.ws.flags.invasion && ACTIVE_WORLD === 'human') this.invasionTick(dt);
  }
  private timeline() {
    const g = this.game, ws = g.ws;
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) {
      const cyc = this.cycleOf(ev), key = this.keyOf(ev, cyc), s0 = this.startDay(ev, cyc);
      const st = ws.events[key] ?? (ws.events[key] = { state: 'pending' });
      if (st.state === 'pending') {
        if (g.day >= s0 - 360 && !st.t) { st.t = 1; g.news(`【传闻】${ev.announce}`, 'canon'); g.toast(`江湖传闻：${ev.name}将于第${Math.floor(this.startDay(ev, cyc) / 360) + 1}年开启（J 查看大事记）`, 'info'); }
        if (g.day >= s0) { st.state = 'active'; st.t = s0; ev.onStart?.(g); g.news(`${ev.name}开始了！地点：${locLabel(ev.loc)}`, 'canon'); g.toast(`${ev.name}开始了——地点：${locLabel(ev.loc)}`, 'warn'); }
      }
      if (st.state === 'active' && g.day > s0 + this.durOf(ev)) {
        if (this.active?.ev === ev) this.disengage();
        if (this.pendingOffer === ev) this.pendingOffer = null;
        st.state = 'missed'; ev.onMiss?.(g);
        g.news(ev.missed, 'canon');
      }
    }
  }
  private canonTick() {
    const g = this.game, p = g.player;
    // Esc 关闭邀请框（没选选项）：进 40 秒冷却，不再每帧重弹
    if (this.pendingOffer) {
      const ev = this.pendingOffer;
      if (!g.modal) {
        this.pendingOffer = null;
        const resolved = this.active?.ev === ev || (this.cooldowns.get(ev.id) ?? 0) > g.time;
        if (!resolved) this.cooldowns.set(ev.id, g.time + 40);
      }
    }
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) {
      const key = this.keyOf(ev, this.cycleOf(ev)); const st = g.ws.events[key];
      if (!st || st.state !== 'active') continue;
      const l = locHere(ev.loc); if (!l) continue;   // 大事件不在本图
      const R = ev.radius * WORLD_SCALE;
      const d = Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y);
      if (this.active?.ev === ev) {
        if (d > R * 2.2) { this.disengage(); g.toast(`你离开了${ev.name}的战场。`, 'warn'); }
        else this.waveTick();
        continue;
      }
      // 冷却：Esc 关闭 / 选「离开」后 40 秒内不再弹；离开范围即解除，重新进入就弹
      const cd = this.cooldowns.get(ev.id) ?? 0;
      if (cd > g.time) {
        if (d > R) this.cooldowns.delete(ev.id);
        continue;
      }
      if (!this.active && d < R && !g.modal && !this.pendingOffer) this.offer(ev);
    }
  }
  private offer(ev: CanonEvent) {
    const g = this.game, h = g.hero;
    if (ev.special === 'invasion' && (g.ws.events[ev.id]?.score ?? 0) < 25) {
      // 魔道入侵：需先在梁国斩杀魔修，削弱攻势
      if (!g.ws.flags.invHint) { g.ws.flags.invHint = 1; g.openDialog({ speaker: '青霞谷', title: ev.name, text: `${ev.intro}\n\n严化尘传音：「魔道势大，单凭你一人杀不进去！先在梁国境内斩杀魔修，削弱其攻势（${g.ws.events[ev.id]?.score ?? 0}/25），再来助我等破敌！」`, options: [{ label: '领命', act: () => null }], mood: 'danger' }); }
      return;
    }
    const weak = h.realm < ev.minRealm;
    const node: DNode = { speaker: ev.name, title: `第${this.year}年 · ${locLabel(ev.loc)}`, text: ev.intro + (weak ? `\n\n（你的修为恐怕不足以应付——建议${REALMS[ev.minRealm].name}期以上）` : ''), mood: 'danger', options: [] };
    if (ev.special === 'shengxian') {
      node.options = [
        { label: '出两千灵石，买下一枚问仙令', disabled: C.bagCount(h, 'mat_lingshi') < 2000, hint: C.bagCount(h, 'mat_lingshi') < 2000 ? '灵石不足' : '', act: () => { if (C.removeItem(h, 'mat_lingshi', 2000) !== 2000) return { speaker: ev.name, text: '灵石不足。', options: [{ label: '好', act: () => null }] }; return this.shengxianWin(ev); } },
        { label: '登上擂台，连胜三场夺令', act: () => { this.engage(ev); return null; } },
        { label: '离开', act: () => { this.cool(ev); return null; } },
      ];
    } else node.options = [{ label: '参与其中', tone: 'gold', act: () => { this.engage(ev); return null; } }, { label: '暂且离开', act: () => { this.cool(ev); return null; } }];
    this.pendingOffer = ev;
    g.openDialog(node);
  }
  private cooldowns = new Map<string, number>();
  private cool(ev: CanonEvent) {
    this.cooldowns.set(ev.id, this.game.time + 40);
    this.pendingOffer = null;
    this.disengage();
  }
  private shengxianWin(ev: CanonEvent): DNode {
    const g = this.game; g.grantOrDrop([{ id: 'item_shengxian', n: 1 }], ev.name);
    this.resolve(ev, true, '问仙令');
    return { speaker: ev.name, text: `${ev.win}\n\n（获得问仙令：前往青霞谷可直接拜入山门）`, options: [{ label: '好', act: () => null }] };
  }
  private engage(ev: CanonEvent) {
    const g = this.game;
    if ((this.cooldowns.get(ev.id) ?? 0) > g.time && !this.active) { /* 允许重新参与 */ }
    this.pendingOffer = null;
    this.active = { ev, wave: 0, foes: [], engaged: true };
    this.spawnWave();
  }
  private disengage() { this.active = null; this.game.combat.dismissAllies((e) => e.tag === 'ev:ally'); }
  private spawnWave() {
    const g = this.game, a = this.active!; const p = g.player;
    let waves: Wave[];
    if (a.ev.special === 'shengxian') {
      const r = { realm: 1, stage: Math.min(12, g.hero.stage + 1) };
      waves = [0, 1, 2].map((i) => ({ list: [], boss: { def: 'bandit', name: ['擂台散修·赵', '擂台散修·孙', '擂台散修·欧阳'][i], realm: r.realm, stage: clamp(r.stage - 2 + i * 2, 0, 12), hp: 1.2 } }));
    } else waves = a.ev.waves(g);
    const w = waves[a.wave];
    if (!w) { this.resolve(a.ev, true); return; }
    a.foes = [];
    const dz = Math.max(1, a.ev.minRealm * 1.5);
    for (const [id, n] of w.list) for (let i = 0; i < n; i++) {
      const def = ENEMIES[id]; if (!def) continue;
      const [lo, hi] = a.ev.foe ?? [1, 3];
      const rk = def.kind === 'human' ? foeRealm(g, p.x, p.y, def.evil ? 'evil' : 'rogue', Math.random, lo, hi) : dangerRealm(dz + 1, Math.random);
      void dz;
      const an = Math.random() * TAU, d = rand(380, 620);
      const rr = Math.max(lo, Math.min(hi, rk.realm));
      const e = new Enemy(def, p.x + Math.cos(an) * d, p.y + Math.sin(an) * d * 0.7, rr, rr === rk.realm ? rk.stage : rr >= 2 ? rint(0, 1) : rint(4, 10));
      e.aggro = true; g.combat.enemies.push(e); a.foes.push(e);
    }
    if (w.boss) {
      const b = w.boss, def = ENEMIES[b.def];
      const an = Math.random() * TAU;
      const e = new Enemy(def, p.x + Math.cos(an) * 520, p.y + Math.sin(an) * 360, b.realm, b.stage);
      e.name = b.name; e.boss = true; e.aggro = true; e.maxHp = e.hp = Math.round(e.hp * (b.hp ?? 2.5));
      if (a.ev.special === 'shengxian') { e.spar = true; }
      if (b.npc) { const nd = g.npcs.byId.get(b.npc); if (nd && nd.alive) { e.look = g.npcs.look(nd); e.cs = new CharState(e.x, e.y); e.npcId = nd.id; e.school = nd.sect; } }
      g.combat.enemies.push(e); a.foes.push(e);
    }
    const mx = this.meleeWave(a.ev, a);
    g.toast(`${a.ev.name}：第${a.wave + 1}/${waves.length}波${w.boss ? `——${w.boss.name}现身！` : ''}${mx}`, 'warn');
  }
  /** 第三十九步·混战：大事件里从来不是所有人都冲你一个——分派系、补同阵、放进别路人马 */
  private meleeWave(ev: CanonEvent, a: { foes: Enemy[] }): string {
    const g = this.game, p = g.player, c = g.combat, [lo, hi] = ev.foe ?? [1, 3];
    const rk = (role: 'rogue' | 'leader' = 'rogue'): [number, number] => { const r = foeRealm(g, p.x, p.y, role, Math.random, lo, hi); const rr = clamp(r.realm, lo, hi); return [rr, rr === r.realm ? r.stage : rr >= 2 ? rint(0, 1) : rint(4, 10)]; };
    const at = (R0: number, R1: number) => { for (let k = 0; k < 10; k++) { const an = Math.random() * TAU, d = rand(R0, R1), x = p.x + Math.cos(an) * d, y = p.y + Math.sin(an) * d * 0.75; if (g.terrain.walkFactor(x, y) > 0) return { x, y }; } return { x: p.x + rand(-300, 300), y: p.y + rand(-200, 200) }; };
    const rival = (sid: string, nm: string, team: string, role: 'rogue' | 'leader' = 'rogue') => { const q = at(480, 760), [r, st] = rk(role); const e = cultivator(q.x, q.y, r, st, sid, nm); e.team = team; e.aggro = true; c.enemies.push(e); a.foes.push(e); return e; };
    if (ev.id === 'xuese') {
      // 赤霄禁地：七派弟子互相截杀，妖兽是另一伙——只有你自己
      const beast = newTeam('xuese:beast');
      for (const e of a.foes) { if (e.def.kind !== 'human') { e.team = beast; continue; } const sid = pick(YUE_SECTS.filter((x) => x !== 'huangfeng')); e.team = newTeam('xuese'); e.school = sid; e.name = `${sectName(sid)}弟子`; }
      for (let i = 0, n = rint(2, 3); i < n; i++) { const sid = pick(YUE_SECTS.filter((x) => x !== 'huangfeng')); rival(sid, `${sectName(sid)}弟子`, newTeam('xuese')); }
      return '（各派弟子与妖兽杀作一团）';
    }
    if (ev.id === 'yanjia' || ev.id === 'modao') {
      // 魔道来袭：七派同道与你并肩
      for (const e of a.foes) e.team = 'modao';
      const have = c.allies.filter((e) => !e.dead && !e.gone && e.tag === 'ev:ally').length, want = ev.id === 'modao' ? 5 : 4;
      const add = spawnAllies(g, p.x, p.y, Math.max(0, want - have), () => rk(), YUE_SECTS, 'ev:ally');
      for (const e of add) e.leaveAt = g.time + 900;
      return add.length ? `（${add.length}名七派同道赶来助阵）` : '';
    }
    if (ev.id === 'xutian' || ev.id === 'zhuimo') {
      // 归墟殿 / 陨魔谷：老怪们各怀鬼胎，阴物见活人就扑
      const ghost = newTeam(ev.id + ':ghost'), wen = newTeam('wen');
      for (const e of a.foes) { if (e.def.kind !== 'human') e.team = ghost; else if (ev.id === 'xutian' && (e.boss || a.foes.some((f) => f.boss))) e.team = wen; else e.team = newTeam(ev.id); }
      const pool = ev.id === 'xutian' ? ['xinggong', 'sanxiu', 'jiyin', 'jiexiu', 'nixing'] : ['taiyi', 'tianmo', 'huayi', 'sanxiu', 'luoyun', 'gujian'];
      for (let i = 0, n = rint(2, 3); i < n; i++) { const sid = pick(pool); rival(sid, `${sectName(sid)}${pick(['老怪', '长老', '散修'])}`, newTeam(ev.id), i === 0 ? 'leader' : 'rogue'); }
      return '（各路老怪也在殿前厮杀）';
    }
    if ((ev.world ?? 'human') !== 'human') {
      const factions = planeFactions(ev.world!);
      if (ev.id === 'ling_moyuan' || ev.id === 'xian_huishixi') {
        for (const e of a.foes) e.team = ev.id + ':foe';
        const have = c.allies.filter((e) => !e.dead && !e.gone && e.tag === 'ev:ally').length;
        const add = spawnAllies(g, p.x, p.y, Math.max(0, 3 - have), () => rk(), [...factions], 'ev:ally');
        for (const e of add) e.leaveAt = g.time + 900;
        return add.length ? `（${add.length}名同界道友赶来助阵）` : '';
      }
      const mob = newTeam(ev.id + ':mob');
      for (const e of a.foes) e.team = e.def.kind === 'human' ? newTeam(ev.id) : mob;
      for (let i = 0; i < 2; i++) {
        const sid = factions[Math.floor(Math.random() * factions.length)];
        rival(sid, `${sectName(sid)}${ev.world === 'immortal' ? '散仙' : '客卿'}`, newTeam(ev.id), i === 0 ? 'leader' : 'rogue');
      }
      return '（各方强者亦在此间厮杀抢夺）';
    }
    return '';
  }
  private waveTick() {
    const g = this.game, a = this.active!;
    const alive = a.foes.filter((e) => !e.dead && g.combat.enemies.includes(e));
    if (alive.length === 0) {
      if (a.ev.special === 'shengxian' && a.foes.some((e) => e.spar && (e as any).sparLost)) return;
      a.wave++; this.spawnWave();
    }
  }
  /** 擂台切磋输了 */
  onSpar(e: Enemy, won: boolean) {
    const a = this.active; if (!a || !a.foes.includes(e)) return false;
    if (!won) { this.game.toast('你被打下了擂台……可以稍后再来挑战。', 'warn'); this.disengage(); this.cool(a.ev); }
    return true;
  }
  private resolve(ev: CanonEvent, win: boolean, rewardText?: string) {
    const g = this.game;
    this.pendingOffer = null;
    const key = this.keyOf(ev, this.cycleOf(ev)); const st = g.ws.events[key] ?? (g.ws.events[key] = { state: 'active' });
    st.state = 'done'; st.result = win ? 'win' : 'lose';
    this.active = null; g.combat.dismissAllies((e) => e.tag === 'ev:ally');
    if (win && ev.special !== 'shengxian') g.pursuit.maybe(`${ev.name}中满载而归，早有人在暗处盯着`, 0.3, 1);
    if (ev.special === 'shengxian') { if (!rewardText) { g.grantOrDrop([{ id: 'item_shengxian', n: 1 }], ev.name); g.openDialog({ speaker: ev.name, text: `三战三胜！台下一片哗然。\n\n${ev.win}\n\n（获得问仙令）`, options: [{ label: '好', act: () => null }] }); } g.news('苏寒在南屏小会夺得问仙令。', 'personal'); return; }
    const rw = ev.reward(g);
    ev.onWin?.(g);
    const msgs: C.Msg[] = []; C.gainExp(g.hero, C.need(g.hero) * C.INSIGHT * 0.25, msgs);
    g.news(ev.win.split('。')[0] + '。', 'canon');
    g.openDialog({ speaker: ev.name, title: '大功告成', text: `${ev.win}\n\n获得：${rw}\n修为大进。`, options: [{ label: '好', act: () => null }], mood: 'mystic' });
  }
  private invasionTick(dt: number) {
    const g = this.game, p = g.player;
    this.invT -= dt; if (this.invT > 0) return; this.invT = rand(14, 26);
    const r = regionAt(p.x / WORLD_SCALE, p.y / WORLD_SCALE, true);
    if (r?.id !== 'yue' || g.combat.safeAt(p.x, p.y)) return;
    const R = g.senseRadius; const n = rint(1, 3);
    for (let i = 0; i < n; i++) {
      const an = Math.random() * TAU, d = R * rand(1.0, 1.3);
      const rs = foeRealm(g, p.x, p.y, i === 0 && Math.random() < 0.15 ? 'leader' : 'evil', Math.random, 1, 3); const e = new Enemy(ENEMIES[rs.realm >= 3 ? 'jindan_mo' : 'moxiu'] ?? ENEMIES.moxiu, p.x + Math.cos(an) * d, p.y + Math.sin(an) * d * 0.8, rs.realm, rs.stage);
      e.name = '魔道先锋'; e.team = 'modao'; g.combat.enemies.push(e);
    }
    // 第三十九步：七派的巡山弟子也在与先锋交手
    if (Math.random() < 0.45) { const add = spawnAllies(g, p.x, p.y, rint(1, 2), () => { const r = foeRealm(g, p.x, p.y, 'rogue', Math.random, 1, 2); return [r.realm, r.stage]; }, YUE_SECTS, 'inv:ally'); for (const e of add) { e.leaveAt = g.time + 150; e.name = `${sectName(e.school!)}巡山弟子`; } }
  }
  onKill(e: Enemy) {
    const g = this.game;
    if (g.ws.flags.invasion && e.def.evil) {
      const r = regionAt(e.x / WORLD_SCALE, e.y / WORLD_SCALE, true);
      if (r?.id === 'yue') { const st = g.ws.events.modao; if (st) { st.score = (st.score ?? 0) + 1; if (st.score === 25) g.toast('魔道攻势受挫！前往青霞谷，与七派一同破敌！', 'good'); } }
    }
    for (const x of this.enc) if (x.foes?.includes(e) && x.foes.every((f) => f.dead)) this.encCleared(x);
  }

  // ------------------------------------------------------------ 传闻 / 大事记
  rumorFor(_d: NpcData): string | null {
    const g = this.game;
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) {
      const key = this.keyOf(ev, this.cycleOf(ev)); const st = g.ws.events[key];
      if (st?.state === 'active') return `${ev.name}已经开始了！就在${locLabel(ev.loc)}。${ev.special === 'invasion' ? '梁国到处都是魔修，你千万小心。' : '去的人可不少。'}`;
      if (st?.state === 'pending' && g.day > this.startDay(ev, this.cycleOf(ev)) - 720) return `听说${ev.announce}`;
    }
    return null;
  }
  upcoming(): string[] {
    const g = this.game, out: string[] = [];
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) {
      const cyc = this.cycleOf(ev), key = this.keyOf(ev, cyc), st = g.ws.events[key];
      const y = Math.floor(this.startDay(ev, cyc) / 360) + 1;
      if (st?.state === 'active') out.push(`「${ev.name}」正在${locLabel(ev.loc)}进行！`);
      else if (st?.state === 'pending' && st.t) out.push(`第${y}年，${ev.name}将于${locLabel(ev.loc)}开启。`);
    }
    return out;
  }
  chronicle() {
    const g = this.game;
    return canonEventsForWorld(ACTIVE_WORLD).map((ev) => {
      const cyc = this.cycleOf(ev), key = this.keyOf(ev, cyc), st = g.ws.events[key];
      const y = Math.floor(this.startDay(ev, cyc) / 360) + 1;
      const known = !!st?.t || st?.state === 'active' || st?.state === 'done' || st?.state === 'missed';
      const state = !st || st.state === 'pending' ? (known ? '将至' : '未闻') : st.state === 'active' ? '进行中' : st.state === 'done' ? '已参与' : '已错过';
      return { name: known ? ev.name : '？？？', year: y, loc: known ? locLabel(ev.loc) : '', state, desc: known ? ev.announce : '尚无传闻。', score: ev.special === 'invasion' && st ? st.score ?? 0 : undefined };
    });
  }

  // ------------------------------------------------------------ 随机奇遇
  private encTick(dt: number) {
    const g = this.game, p = g.player;
    const R = g.senseRadius;
    // 清理
    this.enc = this.enc.filter((x) => !x.done && (g.time - x.t < 300) && Math.hypot(x.x - p.x, x.y - p.y) < Math.max(4000, R * 3));
    // 焦点
    this.focus = null; let best = 180;
    for (const x of this.enc) {
      const d = Math.hypot(x.x - p.x, x.y - p.y);
      if (!x.seen && d < g.detailSenseRadius * 0.95) { x.seen = true; g.toast(this.seenText(x), x.kind === 'altar' || x.kind === 'beast' ? 'warn' : 'info'); }
      if (x.kind !== 'beast' && x.kind !== 'altar' && d < best) { best = d; this.focus = x; }
      if (x.kind === 'treasure' && x.data.rivals && !x.foes && d < 520) {
        x.foes = [];
        for (let i = 0; i < x.data.rivals; i++) {
          const an = Math.random() * TAU;
          const rk = foeRealm(g, x.x, x.y, 'rogue');
          const r = clampWorldRealm(rk.realm, ACTIVE_WORLD, true);
          const def = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, r >= 2 ? 'eliteRogue' : 'rogue')] ?? ENEMIES.zhujixiu;
          const e = new Enemy(def, x.x + Math.cos(an) * 420, x.y + Math.sin(an) * 300, r, rk.stage);
          e.name = ACTIVE_WORLD === 'immortal' ? '闻讯而来的散仙' : '闻讯而来的散修'; e.aggro = true; e.team = newTeam('treasure'); g.combat.enemies.push(e); x.foes.push(e);
        }
        g.toast('灵光引来了旁人——几道遁光正朝这里疾驰！', 'warn');
      }
    }
    if (g.combat.safeAt(p.x, p.y) || g.combat.warZoneAt(p.x, p.y) || p.sitting) return;
    this.encT -= dt;
    if (this.encT > 0 || this.enc.length >= 2) return;
    this.encT = rand(32, 60) * (1 - C.mod(g.hero, 'luck' as any) * 0.5);
    this.spawnEnc();
  }
  private seenText(x: Enc) {
    return { treasure: '神识中：前方灵光冲天——似有天材地宝出世！', wounded: '神识中：有人倒在路旁，气息奄奄。', cave: '神识中：山壁上隐约有禁制灵光，像是一座古修洞府。', beast: `神识中：一头${x.data.name}盘踞在一株灵草旁。`, sage: '神识中：一位白发老者坐在青石上，似在等人。', stall: '神识中：荒郊野外，竟有人摆了个小摊。', altar: '神识中：血腥气扑面而来——魔修正在祭炼血坛！', herbfield: '神识中：一片灵草丛，灵气氤氲。' }[x.kind];
  }
  private spawnEnc() {
    const g = this.game, p = g.player, T = g.terrain, R = g.senseRadius;
    const roll = Math.random();
    const kind: EncKind = roll < 0.18 ? 'treasure' : roll < 0.32 ? 'wounded' : roll < 0.47 ? 'cave' : roll < 0.6 ? 'beast' : roll < 0.67 ? 'sage' : roll < 0.76 ? 'stall' : roll < 0.86 ? 'altar' : 'herbfield';
    const minD = Math.max(g.detailSenseRadius + 280, R * 1.15);
    const maxD = Math.max(minD + 360, R * 1.5);
    for (let tries = 0; tries < 10; tries++) {
      const an = Math.random() * TAU, d = rand(minD, maxD);
      const x = p.x + Math.cos(an) * d, y = p.y + Math.sin(an) * d * 0.85;
      if (T.walkFactor(x, y) <= 0 || T.inLocZone(x, y, 100) || g.combat.safeAt(x, y) || g.combat.warZoneAt(x, y)) continue;
      const e: Enc = { id: this.nid++, kind, x, y, t: g.time, done: false, seen: false, data: {} };
      const h = g.hero, dz = g.combat.dangerAt(x, y);
      if (kind === 'treasure' || kind === 'beast' || kind === 'herbfield') {
        const planeTag = ACTIVE_WORLD === 'human' ? 'mortal' : ACTIVE_WORLD;
        const planeHerbs = ITEM_LIST.filter((it) => it.type === 'herb' && (it.plane ?? 'mortal') === planeTag);
        const pool0 = planeHerbs.length ? planeHerbs : ITEM_LIST.filter((it) => it.type === 'herb' && it.tier <= Math.max(1, h.realm + (kind === 'treasure' ? 1 : 0)));
        const pool = pool0.length ? pool0 : ITEM_LIST.filter((it) => it.type === 'herb');
        e.data.herb = pool[Math.floor(Math.random() * pool.length)].id;
        e.data.age = kind === 'treasure' ? rint(100, 600) : rint(20, 150);
        e.data.rivals = kind === 'treasure' && Math.random() < 0.55 ? rint(1, 2) : 0;
      }
      if (kind === 'beast') {
        const rb = g.combat.rollBeast(x, y, 0.4, { noFlee: true });
        if (!rb) continue;
        const b = new Enemy(rb.def, x + 60, y + 20, rb.realm, rb.stage);
        b.name = rb.def.name + '·护宝'; b.boss = true; b.maxHp = b.hp = Math.round(b.hp * 2.2); b.hx = x; b.hy = y;
        g.combat.enemies.push(b); e.foes = [b]; e.data.name = rb.def.name;
      }
      if (kind === 'altar') {
        e.foes = [];
        const [rLo, rHi] = planeEncounterRange(ACTIVE_WORLD);
        const evilDef = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, 'evil')] ?? ENEMIES.moxiu;
        for (let i = 0; i < 3; i++) {
          const an2 = (i / 3) * TAU;
          const ms = foeRealm(g, x, y, i === 0 ? 'leader' : 'evil', Math.random, rLo, Math.min(rHi, rLo + 2));
          const m = new Enemy(evilDef, x + Math.cos(an2) * 120, y + Math.sin(an2) * 80, ms.realm, ms.stage);
          m.name = ACTIVE_WORLD === 'immortal' ? '血祭堕仙' : '血祭魔修'; m.hx = m.x; m.hy = m.y; g.combat.enemies.push(m); e.foes.push(m);
        }
      }
      if (kind === 'wounded' || kind === 'sage' || kind === 'stall') {
        let s = Math.floor(Math.random() * 1e9); const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        e.look = randomLook(rnd, kind === 'sage' ? 'elder' : kind === 'stall' ? 'merchant' : 'cultivator');
        e.st = new CharState(x, y); e.st.setAction(kind === 'wounded' ? 'sit' : kind === 'sage' ? 'sit' : 'idle'); e.st.faceToward(p.x - x, p.y - y);
        { const rs = foeRealm(g, x, y, kind === 'sage' ? 'boss' : 'rogue'); e.data.realm = rs.realm; e.data.stage = rs.stage; }
      }
      this.enc.push(e);
      return;
    }
  }
  private encCleared(x: Enc) {
    const g = this.game;
    if (x.done) return;
    if (x.kind === 'beast') { g.combat.dropLoot(x.x, x.y, x.data.herb, 1); x.done = true; g.toast(`${x.data.name}伏诛，灵草落入你手——注意拾取！`, 'good'); }
    if (x.kind === 'altar') {
      x.done = true; g.ws.rep = clamp(g.ws.rep + 6, -100, 100);
      const curId = worldCurrencyId(ACTIVE_WORLD);
      const amt = scaleFromMortalStones(60 * Math.max(1, g.hero.realm), ACTIVE_WORLD, 2);
      g.combat.dropLoot(x.x, x.y, curId, amt);
      const sk = g.combat.randomScroll(Math.min(5, g.hero.realm + 1)); if (sk) g.combat.dropLoot(x.x, x.y, sk, 1);
      g.toast('血坛已毁，正道声望 +6', 'good');
    }
  }
  interact(x: Enc | null = this.focus) {
    if (!x) return false;
    const g = this.game, h = g.hero;
    const close = (txt: string, title = '') => ({ speaker: title || '奇遇', text: txt, options: [{ label: '好', act: () => null }] } as DNode);
    if (x.kind === 'treasure' || x.kind === 'herbfield') {
      if (x.foes && x.foes.some((f) => !f.dead && g.combat.enemies.includes(f))) { g.toast('先打退来抢夺的人！', 'warn'); return true; }
      const it = itemDef(x.data.herb);
      // v0.70：灵草只看数量——年份越老，一处采得越多
      const n = (x.kind === 'herbfield' ? rint(2, 4) : 1) + Math.min(6, Math.floor((x.data.age ?? 0) / 80));
      const plan: C.InventoryOutput[] = [{ id: x.data.herb, n }];
      let extra = '';
      if (x.kind === 'treasure' && Math.random() < 0.25) { plan.push({ id: 'item_yuanqi', n: 1 }); extra = '\n\n灵根之下，还藏着一块天地元气晶！'; }
      g.grantOrDrop(plan, x.kind === 'treasure' ? '天材地宝' : '灵草丛');
      x.done = true; h.stats.gathered++;
      g.openDialog(close(`${x.kind === 'treasure' ? '灵光散去，' : '你采下'}${it.name}${n > 1 ? '×' + n : ''}${x.kind === 'treasure' ? '静静躺在你掌心，药香沁人心脾。' : '。'}${extra}`, x.kind === 'treasure' ? '天材地宝' : '灵草丛'));
      return true;
    }
    if (x.kind === 'wounded') {
      const name = ACTIVE_WORLD === 'immortal' ? '受伤的散仙' : '受伤的修士';
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const localPillId = planeDefaultPillId(ACTIVE_WORLD, 'liaoshang');
      const usePillId = C.bagCount(h, localPillId) > 0 ? localPillId : 'pill_liaoshang';
      const hasPill = C.bagCount(h, localPillId) > 0 || C.bagCount(h, 'pill_liaoshang') > 0;
      const pillLabel = itemDef(usePillId).name;
      g.openDialog({ speaker: name, title: realmName(x.data.realm, x.data.stage), look: x.look, mood: 'danger', text: '（他胸口一片血污，勉强睁开眼）道、道友……我遭劫修暗算……求你……', options: [
        { label: `喂他一颗${pillLabel}`, disabled: !hasPill, hint: hasPill ? '' : `需${pillLabel}`, tone: 'good', act: () => {
          if (C.removeItem(h, usePillId, 1) !== 1) return close(`储物袋中已无${pillLabel}。`, name);
          x.done = true; g.ws.rep = clamp(g.ws.rep + 4, -100, 100);
          const r = Math.random();
          if (r < 0.4) { const sk = g.combat.randomScroll(Math.min(5, x.data.realm)); if (sk) g.grantOrDrop([{ id: sk, n: 1 }], name); return close(`他缓过一口气，从怀中掏出一枚玉简：「救命之恩……这是我的家传法术，送给道友。」\n\n获得 ${sk ? itemDef(sk).name : '一句谢谢'}`, name); }
          if (r < 0.75) { const amt = scaleFromMortalStones(40 * Math.pow(3, Math.max(0, Math.min(4, x.data.realm) - 1)), ACTIVE_WORLD, 2); g.grantOrDrop([{ id: curId, n: amt }], name); return close(`他千恩万谢，硬塞给你一袋${curName}（${amt}）。`, name); }
          const l = LOCATIONS.find((l0) => l0.type === 'secret' && !g.isExplored(l0.x * WORLD_SCALE, l0.y * WORLD_SCALE) && Math.hypot(l0.x * WORLD_SCALE - x.x, l0.y * WORLD_SCALE - x.y) < 30000);
          if (l) { g.markKnown(l); return close(`「我本是去「${l.name}」寻宝的……那里有座洞府，禁制我破不开，便宜道友了。」\n\n（地图上已标出${l.name}）`, name); }
          return close('他向你深深一拜，化作遁光离去。正道声望 +4', name);
        } },
        { label: '搜刮他的储物袋', tone: 'bad', act: () => {
          x.done = true; g.ws.rep = clamp(g.ws.rep - 6, -100, 100);
          if (Math.random() < 0.25) {
            for (let i = 0; i < 2; i++) {
              const an = Math.random() * TAU; const rs = foeRealm(g, x.x, x.y, 'rogue');
              const r = clampWorldRealm(rs.realm, ACTIVE_WORLD, true);
              const def = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, r >= 2 ? 'eliteRogue' : 'rogue')] ?? ENEMIES.zhujixiu;
              const e = new Enemy(def, x.x + Math.cos(an) * 300, x.y + Math.sin(an) * 200, r, rs.stage);
              e.name = '埋伏的劫修'; e.aggro = true; g.combat.enemies.push(e);
            }
            return close('你的手刚碰到储物袋，那“伤者”猛地睁眼狞笑——是个陷阱！两道人影从暗处扑了出来！', '中计');
          }
          const amt = scaleFromMortalStones(60 * Math.pow(3, Math.max(0, Math.min(4, x.data.realm) - 1)), ACTIVE_WORLD, 2); g.grantOrDrop([{ id: curId, n: amt }], '搜刮');
          return close(`你取走了他的储物袋（${curName} ${amt}）。他眼中的光一点点熄灭了。\n\n（正道声望 -6）`, '搜刮');
        } },
        { label: '离开', act: () => null },
      ] });
      return true;
    }
    if (x.kind === 'cave') {
      const chance = clamp(0.35 + h.realm * 0.12 + (h.gongfa === 'dayan' ? 0.15 : 0), 0.2, 0.9);
      const tier = Math.min(6, h.realm + 1);
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const open = (): DNode => {
        const mp = 0.35; if (h.mp < mp) return close('法力不足，无法破禁。', '古修遗府');
        h.mp -= mp; x.done = true;
        if (Math.random() < chance) {
          const pool = ITEM_LIST.filter((it) => (it.type === 'artifact' || it.type === 'pill' || it.type === 'scroll') && it.tier >= 1 && it.tier <= tier && it.price > 0 && it.price < 200000);
          const got = [pool[Math.floor(Math.random() * pool.length)], pool[Math.floor(Math.random() * pool.length)]];
          const plan: C.InventoryOutput[] = got.map((it) => ({ id: it.id, n: 1 }));
          const amt = scaleFromMortalStones(50 * tier * tier, ACTIVE_WORLD, 3);
          plan.push({ id: curId, n: amt });
          g.grantOrDrop(plan, '古修遗府');
          g.pursuit.maybe('破禁时宝光冲霄，引来了觊觎之人', 0.22 + tier * 0.06, Math.random() < 0.7 ? 1 : 0);
          return close(`禁制如水波般荡开。石室中一具枯骨盘膝而坐，身前摆着几件遗物。\n\n获得：${got.map((it) => it.name).join('、')}、${curName} ${amt}`, '古修遗府');
        }
        h.hp = Math.max(0.05, h.hp - 0.3);
        const def = ENEMIES[planeDefaultEnemyId(ACTIVE_WORLD, 'spirit')] ?? ENEMY_LIST.filter((d0) => d0.kind === 'ghost')[0] ?? ENEMIES.yinhun;
        const gr = bandRealm(g.combat.dangerCalc(x.x, x.y).k + 1, Math.random, ACTIVE_WORLD);
        const e = new Enemy(def, x.x, x.y - 60, clampWorldRealm(gr.realm, ACTIVE_WORLD), gr.stage); e.name = '洞府守护残魂'; e.aggro = true; e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 1.8); g.combat.enemies.push(e);
        return close('禁制反噬！一道杀阵光芒击中了你，石室深处传来阴冷的低笑……', '禁制反噬');
      };
      const opts = [{ label: `强行破禁（耗三成半法力，把握约 ${Math.round(chance * 100)}%）`, act: open }];
      if (h.realm >= 2) opts.push({ label: '以神识探查禁制', act: () => ({ speaker: '古修遗府', text: chance > 0.6 ? '神识探入，禁制已残破大半，破之不难。' : chance > 0.4 ? '禁制尚存七分威力，内有杀阵，需小心。' : '禁制完好，杀机森然，以你的修为恐怕凶多吉少。', options: [{ label: '破禁', act: open }, { label: '离开', act: () => null }] }) });
      opts.push({ label: '离开', act: () => null });
      g.openDialog({ speaker: '古修遗府', title: '禁制', text: '山壁上刻着模糊的符文，灵光明灭。这是一座前人留下的洞府，禁制尚未完全失效。', options: opts, mood: 'mystic' });
      return true;
    }
    if (x.kind === 'sage') {
      const qs = [
        { q: '老者问：「修仙之人，最难过的是哪一关？」', a: ['心魔关', '雷劫', '灵根'], right: 0 },
        { q: '老者问：「遇强敌，是战是逃？」', a: ['知己知彼，量力而行', '宁死不退', '先跑再说'], right: 0 },
        { q: '老者问：「丹药与苦修，孰重？」', a: ['丹药为舟，苦修为桨', '只靠丹药', '只靠苦修'], right: 0 },
        { q: '老者问：「长生为何？」', a: ['为看更远的风景', '为凌驾众生', '不知道'], right: 0 },
      ];
      const q = qs[Math.floor(Math.random() * qs.length)];
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      g.openDialog({ speaker: '白发老者', title: '高人', look: x.look, mood: 'mystic', text: `（老者睁开眼，目光仿佛看透了你的一切）小友，坐。老夫问你一句话。\n\n${q.q}`, options: order.map((i) => ({ label: q.a[i], act: () => {
        x.done = true;
        if (i === q.right) { const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * 0.15, msgs); if (Math.random() < 0.5) { h.senseBonus += 0.03; return close('老者抚须大笑：「善！」他屈指一弹，一道灵光没入你的眉心——你的神识仿佛被洗过一般清明。\n\n修为大进，神识 +3%', '高人点化'); } h.lifeBonus += 5; return close('老者点点头：「孺子可教。」他赠你一枚丹药，服下后浑身暖洋洋的。\n\n修为大进，寿元 +5', '高人点化'); }
        const msgs: C.Msg[] = []; C.gainExp(h, C.need(h) * C.INSIGHT * 0.03, msgs);
        return close('老者摇摇头，闭目不语。再睁眼时，青石上已空无一人。\n\n（你仍有所得，修为小涨）', '高人点化');
      } })) });
      return true;
    }
    if (x.kind === 'stall') {
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const price = scaleFromMortalStones(300 * Math.max(1, h.realm), ACTIVE_WORLD, 2);
      g.openDialog({ speaker: '神秘摊主', title: '散修', look: x.look, text: `（摊上摆着几卷发黄的残卷）道友好眼光！这可是上古大能的功法残卷，${price}${curName}，童叟无欺！`, options: [
        { label: `买下（${price} ${curName}）`, disabled: C.bagCount(h, curId) < price, act: () => {
          if (C.removeItem(h, curId, price) !== price) return close(`${curName}不足。`, '散修');
          x.done = true;
          if (Math.random() < 0.5) { const sk = g.combat.randomScroll(Math.min(5, h.realm + 1)); if (sk) { g.grantOrDrop([{ id: sk, n: 1 }], '散修摊位'); return close(`你展开残卷——竟是真的！\n\n获得 ${itemDef(sk).name}`, '捡漏'); } }
          return close('你展开残卷，上面写着：「欲练此功，先去买块豆腐。」再抬头，摊主早已不见踪影。', '上当');
        } },
        { label: '不买', act: () => null },
      ] });
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ 绘制
  collect(out: { y: number; draw: (g: G) => void }[], view: { left: number; top: number; right: number; bottom: number }, t: number, dt: number) {
    const g = this.game;
    for (const x of this.enc) {
      if (x.x < view.left - 300 || x.x > view.right + 300 || x.y < view.top - 400 || x.y > view.bottom + 200) continue;
      const v = g.life.vis(x); if (v <= 0.01) continue;
      out.push({ y: x.y, draw: (ctx) => this.drawEnc(ctx, x, v, t, dt) });
    }
  }
  private drawEnc(ctx: G, x: Enc, v: number, t: number, dt: number) {
    ctx.save(); ctx.globalAlpha *= v;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + x.id);
    if (x.kind === 'treasure') {
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createLinearGradient(x.x, x.y - 900, x.x, x.y);
      gr.addColorStop(0, 'rgba(255,240,180,0)'); gr.addColorStop(0.7, `rgba(255,230,150,${0.25 + 0.15 * pulse})`); gr.addColorStop(1, 'rgba(255,250,220,0.7)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x.x - 16, x.y); ctx.lineTo(x.x - 50, x.y - 900); ctx.lineTo(x.x + 50, x.y - 900); ctx.lineTo(x.x + 16, x.y); ctx.fill();
      for (let i = 0; i < 10; i++) { const k = ((t * 0.4 + i / 10) % 1); ctx.fillStyle = `rgba(255,240,180,${(1 - k) * 0.8})`; ctx.beginPath(); ctx.arc(x.x + Math.sin(i * 7 + t) * 30 * k, x.y - k * 400, 3 + 3 * (1 - k), 0, TAU); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      this.herb(ctx, x.x, x.y, 1.3, t, (x.data?.id as string) || 'herb_zihou', x.id);
    } else if (x.kind === 'herbfield' || x.kind === 'beast') {
      const pool = ['herb_huangjing', 'herb_lingzhi', 'herb_jinxin', 'herb_nichang', 'herb_zihou', 'herb_tianling'];
      const n = x.kind === 'herbfield' ? 5 : 1;
      for (let i = 0; i < n; i++) {
        const hid = (x.data?.id as string) || pool[(x.id + i) % pool.length];
        this.herb(ctx, x.x + Math.cos(i * 2.4) * 40 * Math.min(1, i), x.y + Math.sin(i * 2.4) * 24 * Math.min(1, i), 1.05, t + i, hid, x.id * 11 + i);
      }
    } else if (x.kind === 'cave') {
      ctx.fillStyle = '#5a5248'; ctx.beginPath(); ctx.moveTo(x.x - 90, x.y); ctx.quadraticCurveTo(x.x - 100, x.y - 150, x.x, x.y - 170); ctx.quadraticCurveTo(x.x + 100, x.y - 150, x.x + 90, x.y); ctx.fill();
      ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.moveTo(x.x - 44, x.y); ctx.quadraticCurveTo(x.x - 46, x.y - 96, x.x, x.y - 104); ctx.quadraticCurveTo(x.x + 46, x.y - 96, x.x + 44, x.y); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(140,220,255,${0.4 + 0.4 * pulse})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x.x - 44, x.y); ctx.quadraticCurveTo(x.x - 46, x.y - 96, x.x, x.y - 104); ctx.quadraticCurveTo(x.x + 46, x.y - 96, x.x + 44, x.y); ctx.stroke();
      ctx.font = '18px serif'; ctx.fillStyle = `rgba(160,230,255,${0.5 + 0.4 * pulse})`; ctx.textAlign = 'center';
      for (let i = 0; i < 5; i++) ctx.fillText('封禁玄灵符'[i], x.x - 70 + i * 35, x.y - 120 - Math.sin(i * 0.8) * 20);
    } else if (x.kind === 'altar') {
      ctx.fillStyle = '#3a2224'; ctx.beginPath(); ctx.ellipse(x.x, x.y, 70, 30, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a1a20'; ctx.fillRect(x.x - 30, x.y - 60, 60, 60);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(230,40,50,${0.3 + 0.3 * pulse})`; ctx.beginPath(); ctx.ellipse(x.x, x.y - 70, 40, 60, 0, 0, TAU); ctx.fill();
    } else if (x.st && x.look) {
      x.st.update(dt);
      if (x.kind === 'wounded') { ctx.fillStyle = 'rgba(140,20,20,0.5)'; ctx.beginPath(); ctx.ellipse(x.x + 10, x.y + 6, 40, 12, 0, 0, TAU); ctx.fill(); }
      if (x.kind === 'stall') { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x.x + 30, x.y - 36, 90, 36); ctx.fillStyle = '#d8c8a0'; for (let i = 0; i < 3; i++) ctx.fillRect(x.x + 38 + i * 26, x.y - 44, 18, 8); }
      if (x.kind === 'sage') { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,240,200,${0.15 + 0.1 * pulse})`; ctx.beginPath(); ctx.ellipse(x.x, x.y - 60, 60, 90, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      drawCharacter(ctx, x.look, x.st, 1, dt);
    }
    if (this.focus === x && x.kind !== 'beast' && x.kind !== 'altar') {
      const z = this.game.cam.zoom, fs = Math.max(12, 14 / Math.max(0.5, z));
      ctx.globalCompositeOperation = 'source-over'; ctx.font = `${fs}px "Noto Serif SC",serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,16,12,0.7)'; ctx.strokeText('【T】查看', x.x, x.y - 190); ctx.fillStyle = '#fff0c8'; ctx.fillText('【T】查看', x.x, x.y - 190);
    }
    ctx.restore();
  }
  private herb(ctx: G, x: number, y: number, s: number, t: number, id = 'herb_jinxin', seed = 1) {
    const glow = herbGlowRgb(id);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(${glow},${0.26 + 0.16 * Math.sin(t * 3 + seed)})`;
    ctx.beginPath(); ctx.ellipse(x, y - 6, 22 * s, 9 * s, 0, 0, TAU); ctx.fill();
    ctx.restore();
    drawHerbSprite(ctx, id, x, y, 1.35 * s, t, { seed, soil: true });
  }
  /** 大事件战场标记（世界地图用） */
  activeMarkers() {
    const g = this.game; const out: { x: number; y: number; name: string }[] = [];
    for (const ev of canonEventsForWorld(ACTIVE_WORLD)) { const st = g.ws.events[this.keyOf(ev, this.cycleOf(ev))]; if (st?.state === 'active') { const l = locHere(ev.loc); if (l) out.push({ x: l.x, y: l.y, name: ev.name }); } }
    return out;
  }
}
