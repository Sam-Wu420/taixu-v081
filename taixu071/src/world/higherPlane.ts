// 灵界（中千世界）与仙界（大千世界）核心玩法系统：
//   1. 双路线飞升灵界（正统接引台 / 空间节点偷渡）与大乘飞升仙界
//   2. 化灵池 / 化仙池保底兑换，避免跨界货币死锁
//   3. 灵界：三九/六九/九九天劫与替劫木偶、玄天混沌残胚三阶孕育、灵域据点收益
//   4. 仙界：大道法则树、三十六仙窍、斩三尸与身外化身、天人五衰与混沌净源、斩仙榜、岁月天书七页终局
//   5. 逆返下界天道排斥追踪（满 100 强制弹回上界，不死不删档）
import type { WorldId } from '../data/worldHierarchy';
import { ACTIVE_MAP, ACTIVE_WORLD, LOC_BY_ID, WORLD_SCALE, regionAt } from '../data/world';
import type { Hero, Msg } from './cultivation';
import { addItem, bagCount, removeItem } from './cultivation';
import { validCount } from './inventoryNumbers';
import { ensureWorldSlice, type WorldState } from './worldstate';

export type DaoLawId = 'time' | 'space' | 'samsara' | 'thunder' | 'sword' | 'element';

export interface DaoLawDef {
  id: DaoLawId;
  name: string;
  desc: string;
  bonusText: string;
}

export const DAO_LAWS: DaoLawDef[] = [
  { id: 'time', name: '时间大道', desc: '执掌光阴流速，战斗中加快法术调息并减缓敌人攻势。', bonusText: '每重：攻击 +5%，神识 +5%' },
  { id: 'space', name: '空间大道', desc: '袖里乾坤、缩地成寸，极大幅提升遁速与闪避身法。', bonusText: '每重：身法 +6%，防御 +4%' },
  { id: 'samsara', name: '轮回大道', desc: '洞悉生死因果，滋养元神寿元并化解天人五衰侵蚀。', bonusText: '每重：气血 +6%，衰劫抗性 +12%' },
  { id: 'thunder', name: '寂灭神雷', desc: '九霄至阳神雷大道，专克魔渊异族与灰界蚀道之物。', bonusText: '每重：法伤 +6%，对邪魔威慑提升' },
  { id: 'sword', name: '太乙剑道', desc: '万剑归宗、一剑破万法，极致的攻伐杀意。', bonusText: '每重：攻击 +7%' },
  { id: 'element', name: '五行造化', desc: '五行生生不息，绵长仙元底蕴与护体灵光。', bonusText: '每重：法力 +7%，防御 +5%' },
];

export interface XuantianState {
  stage: 0 | 1 | 2 | 3; // 0 未启 / 1 混沌初孕 / 2 雷火淬锋 / 3 成器
  progress: number;       // 0..100
  kind: 'sword' | 'ding' | null;
}

export interface HeroHigherPlaneState {
  tribulations?: number;
  tribCooldownUntil?: number;
  xuantian?: XuantianState;
  laws?: Partial<Record<DaoLawId, number>>;
  immortalAcupoints?: number;
  threeCorpses?: [boolean, boolean, boolean];
  avatar?: { active: boolean; power: number };
  fiveDecays?: { level: number; suppressedUntil: number; progress: number };
  canjuanPages?: number;
  canjuanTimeCooldownUntil?: number;
  ascendedSpiritVia?: 'orthodox' | 'smuggle';
  ascendedImmortal?: boolean;
  planeRejection?: number;
  ending?: 'samsara' | 'transcend' | null;
}

export function ensureHigher(h: Hero): HeroHigherPlaneState {
  return (h.higher ??= {
    tribulations: 0,
    tribCooldownUntil: 0,
    xuantian: { stage: 0, progress: 0, kind: null },
    laws: {},
    immortalAcupoints: 0,
    threeCorpses: [false, false, false],
    avatar: { active: false, power: 0 },
    fiveDecays: { level: 0, suppressedUntil: 0, progress: 0 },
    canjuanPages: 0,
    canjuanTimeCooldownUntil: 0,
    planeRejection: 0,
    ending: null,
  });
}

/** 计算灵仙界高阶养成对面板的综合倍率加成 */
export function higherStatMultipliers(h: Hero): { hp: number; mp: number; atk: number; def: number; sense: number; speed: number } {
  const hi = h.higher;
  if (!hi) return { hp: 1, mp: 1, atk: 1, def: 1, sense: 1, speed: 0 };
  const laws = hi.laws ?? {};
  const t = laws.time ?? 0;
  const sp = laws.space ?? 0;
  const sa = laws.samsara ?? 0;
  const th = laws.thunder ?? 0;
  const sw = laws.sword ?? 0;
  const el = laws.element ?? 0;
  const ac = Math.max(0, Math.min(36, hi.immortalAcupoints ?? 0));
  const corpses = (hi.threeCorpses ?? [false, false, false]).filter(Boolean).length;
  const decayLv = Math.max(0, Math.min(5, hi.fiveDecays?.level ?? 0));
  const decayPenalty = Math.max(0.55, 1 - decayLv * 0.08);
  return {
    hp: (1 + ac * 0.015 + sa * 0.06 + corpses * 0.14) * decayPenalty,
    mp: (1 + ac * 0.018 + el * 0.07 + corpses * 0.14) * decayPenalty,
    atk: (1 + ac * 0.016 + t * 0.05 + th * 0.06 + sw * 0.07 + corpses * 0.18) * decayPenalty,
    def: (1 + ac * 0.014 + sp * 0.04 + el * 0.05 + corpses * 0.12) * decayPenalty,
    sense: 1 + t * 0.05 + corpses * 0.12,
    speed: sp * 0.06,
  };
}

// ------------------------------------------------------------ 1. 飞升跨界
export interface AscendCheck { ok: boolean; reason?: string }

export function canAscendToSpirit(h: Hero, ws: WorldState, mode: 'orthodox' | 'smuggle'): AscendCheck {
  if (ACTIVE_WORLD !== 'human') return { ok: false, reason: '当前已不在人界。' };
  if (h.realm < 5) return { ok: false, reason: '需先证道化神，方能承受跨界空间罡风。' };
  if (mode === 'orthodox') {
    if (h.stage < 2) return { ok: false, reason: '正统接引台飞升需修至化神后期圆满。' };
    return { ok: true };
  }
  if (bagCount(h, 'tok_pojie') < 1) return { ok: false, reason: '偷渡空间节点至少须持有一枚《破界符》。' };
  return { ok: true };
}

/** 执行飞升灵界：若成功返回目标地图与坐标；偷渡失败不删档，重伤弹回梁京城外 */
export function performSpiritAscension(
  h: Hero,
  ws: WorldState,
  mode: 'orthodox' | 'smuggle',
): { ok: boolean; survived: boolean; map?: 'lingjie'; locId?: string; msgs: Msg[] } {
  const chk = canAscendToSpirit(h, ws, mode);
  if (!chk.ok) return { ok: false, survived: true, msgs: [{ text: chk.reason!, kind: 'warn' }] };
  const hi = ensureHigher(h);
  const msgs: Msg[] = [];
  if (mode === 'smuggle') {
    removeItem(h, 'tok_pojie', 1);
    const hasDing = bagCount(h, 'item_dingkongzhu') > 0;
    const rate = hasDing ? 0.88 : 0.45;
    if (Math.random() > rate) {
      h.hp = 0.2;
      h.mp = 0.1;
      h.lifeLost += 30;
      msgs.push({ text: '空间节点忽然崩塌，虚空罡风如万千利刃刮过元神！幸得半枚残符护主，你被空间乱流吐回人界，折损三十载寿元（不死，休养即可再试）。', kind: 'warn' });
      return { ok: false, survived: false, msgs };
    }
    if (hasDing) removeItem(h, 'item_dingkongzhu', 1);
    hi.ascendedSpiritVia = 'smuggle';
    ws.ascendedWorlds = [...new Set([...(ws.ascendedWorlds ?? []), 'spirit' as WorldId])];
    ensureWorldSlice(ws, 'spirit');
    if (bagCount(h, 'mat_lingjing') < 10) addItem(h, 'mat_lingjing', 12);
    addItem(h, 'pill_lingjing_huiqi', 2);
    msgs.push({ text: '你强行撕开空间节点，携定空微光冲破两界壁障，跌落于灵界·蛮荒古境！', kind: 'good' });
    return { ok: true, survived: true, map: 'lingjie', locId: 'manhuang_jishi', msgs };
  }
  hi.ascendedSpiritVia = 'orthodox';
  ws.ascendedWorlds = [...new Set([...(ws.ascendedWorlds ?? []), 'spirit' as WorldId])];
  ensureWorldSlice(ws, 'spirit');
  addItem(h, 'mat_lingjing', 24);
  addItem(h, 'pill_lingjing_huiqi', 3);
  addItem(h, 'pill_lingjing_liaoshang', 2);
  msgs.push({ text: '接引金柱贯穿天地，你从容踏破人界飞升障壁，降临灵界·天渊圣域接引古台！', kind: 'good' });
  return { ok: true, survived: true, map: 'lingjie', locId: 'tianyuan_feishengtai', msgs };
}

export function canAscendToImmortal(h: Hero, _ws: WorldState): AscendCheck {
  if (ACTIVE_WORLD !== 'spirit') return { ok: false, reason: '须在灵界方能引动飞升仙劫。' };
  if (h.realm < 8 || h.stage < 2) return { ok: false, reason: '需修至大乘后期圆满，方能叩响仙门。' };
  const tribs = h.higher?.tribulations ?? 0;
  if (tribs < 2) return { ok: false, reason: `飞升仙界须先行渡过至少 2 次高阶天劫以洗净凡骨（当前 ${tribs}/2）。` };
  return { ok: true };
}

export function performImmortalAscension(h: Hero, ws: WorldState): { ok: boolean; map?: 'xianjie'; locId?: string; msgs: Msg[] } {
  const chk = canAscendToImmortal(h, ws);
  if (!chk.ok) return { ok: false, msgs: [{ text: chk.reason!, kind: 'warn' }] };
  const hi = ensureHigher(h);
  hi.ascendedImmortal = true;
  ws.ascendedWorlds = [...new Set([...(ws.ascendedWorlds ?? []), 'immortal' as WorldId])];
  ensureWorldSlice(ws, 'immortal');
  // 踏入化仙池，赠送仙元石与蕴仙丹起步
  addItem(h, 'mat_xianyuan', 18);
  addItem(h, 'pill_xian_yunshen', 3);
  addItem(h, 'pill_zhenxian', 2);
  return {
    ok: true,
    map: 'xianjie',
    locId: 'beihan_xilianchi',
    msgs: [{ text: '仙门大开，九色仙霞接引元神飞升大千仙界！你降临北寒仙域·化仙古池，天地仙元滚滚灌体！', kind: 'good' }],
  };
}

// ------------------------------------------------------------ 2. 化灵池 / 化仙池保底兑换
export function exchangeCurrency(h: Hero, kind: 'stone2lingjing' | 'lingjing2xianyuan', count = 1): { ok: boolean; msg: string } {
  if (!validCount(count) || count <= 0) return { ok: false, msg: '数量无效。' };
  if (kind === 'stone2lingjing') {
    const cost = count * 5000;
    if (bagCount(h, 'mat_lingshi') < cost) return { ok: false, msg: `人界灵石不足 ${cost}（每 5000 灵石可经化灵池凝出 1 枚灵晶）。` };
    removeItem(h, 'mat_lingshi', cost);
    addItem(h, 'mat_lingjing', count);
    return { ok: true, msg: `化灵池灵雾翻涌，${cost} 块人界灵石已化为 ${count} 枚精纯灵晶。` };
  }
  const cost = count * 200;
  if (bagCount(h, 'mat_lingjing') < cost) return { ok: false, msg: `灵晶不足 ${cost}（每 200 灵晶可经化仙池凝出 1 枚仙元石）。` };
  removeItem(h, 'mat_lingjing', cost);
  addItem(h, 'mat_xianyuan', count);
  return { ok: true, msg: `化仙池仙光洗炼，${cost} 枚灵晶凝作 ${count} 枚仙元石。` };
}

// ------------------------------------------------------------ 3. 灵界：天劫、玄天之宝、灵域据点
export const TRIB_TIERS = [
  { tier: 1 as const, name: '三九小天劫', minRealm: 5, rate: 0.72, lifeGain: 80, rewardJing: 16, costJing: 5, cd: 120 },
  { tier: 2 as const, name: '六九重劫', minRealm: 6, rate: 0.58, lifeGain: 180, rewardJing: 36, costJing: 12, cd: 180 },
  { tier: 3 as const, name: '九九灭世大天劫', minRealm: 7, rate: 0.45, lifeGain: 360, rewardJing: 80, costJing: 25, cd: 240 },
];

export function triggerTribulation(h: Hero, ws: WorldState, day: number, tier: 1 | 2 | 3): { ok: boolean; passed: boolean; msgs: Msg[] } {
  const def = TRIB_TIERS.find((x) => x.tier === tier)!;
  if (ACTIVE_WORLD !== 'spirit' && ACTIVE_WORLD !== 'immortal') {
    return { ok: false, passed: false, msgs: [{ text: '人界天道残缺，无法引动大天劫，请至灵界或仙界迎劫。', kind: 'warn' }] };
  }
  if (h.realm < def.minRealm) return { ok: false, passed: false, msgs: [{ text: `修为不足，至少需化神以上方能承受${def.name}。`, kind: 'warn' }] };
  const hi = ensureHigher(h);
  if ((hi.tribCooldownUntil ?? 0) > day) {
    return { ok: false, passed: false, msgs: [{ text: `元神尚需调息，距离下次引劫还需 ${Math.ceil(hi.tribCooldownUntil! - day)} 日。`, kind: 'warn' }] };
  }
  if (bagCount(h, 'mat_lingjing') < def.costJing && bagCount(h, 'mat_xianyuan') < 1) {
    return { ok: false, passed: false, msgs: [{ text: `布下避劫阵眼需耗费 ${def.costJing} 灵晶。`, kind: 'warn' }] };
  }
  if (bagCount(h, 'mat_lingjing') >= def.costJing) removeItem(h, 'mat_lingjing', def.costJing);
  hi.tribCooldownUntil = day + def.cd;
  const hasMuou = bagCount(h, 'mat_tijie_muou') > 0;
  const bonus = Math.min(0.25, ((hi.laws?.thunder ?? 0) * 0.04) + (h.realm - def.minRealm) * 0.08 + (hasMuou ? 0.22 : 0));
  const pass = Math.random() < Math.min(0.95, def.rate + bonus);
  const msgs: Msg[] = [];
  if (pass) {
    hi.tribulations = (hi.tribulations ?? 0) + 1;
    const sp = ensureWorldSlice(ws, 'spirit');
    sp.tribulationCount = (sp.tribulationCount ?? 0) + 1;
    h.lifeBonus += def.lifeGain;
    h.senseBonus += tier * 0.08;
    addItem(h, 'mat_lingjing', def.rewardJing);
    if (tier >= 2) addItem(h, 'mat_leihai_jin', 1);
    msgs.push({ text: `九霄劫雷散去！你硬撼${def.name}而屹立不倒，寿元 +${def.lifeGain} 载，神识 +${tier * 8}%，天道降下灵晶 ×${def.rewardJing} 淬体！`, kind: 'good' });
    return { ok: true, passed: true, msgs };
  }
  if (hasMuou) {
    removeItem(h, 'mat_tijie_muou', 1);
    hi.tribulations = (hi.tribulations ?? 0) + 1;
    const sp = ensureWorldSlice(ws, 'spirit');
    sp.tribulationCount = (sp.tribulationCount ?? 0) + 1;
    h.hp = 0.4;
    msgs.push({ text: `绝杀劫雷垂落之际，《替劫木偶》凌空炸碎替你承受了九成劫威！虽元气大震，终归安然渡过${def.name}！`, kind: 'good' });
    return { ok: true, passed: true, msgs };
  }
  h.hp = 0.15; h.mp = 0.1; h.lifeLost += 25 * tier;
  msgs.push({ text: `${def.name}最后一道紫霄劫雷劈落，护体灵光溃散！幸得元神护主不灭，但气血重伤且折损 ${25 * tier} 载寿元。`, kind: 'warn' });
  return { ok: true, passed: false, msgs };
}

export function nurtureXuantian(h: Hero, choiceKind?: 'sword' | 'ding'): { ok: boolean; msg: string } {
  const hi = ensureHigher(h);
  const xt = (hi.xuantian ??= { stage: 0, progress: 0, kind: null });
  if (xt.stage === 3) return { ok: false, msg: '玄天灵宝已然孕育成形，威震三界！' };
  if (xt.stage === 0) {
    if (bagCount(h, 'mat_xuantian_pei') < 1) return { ok: false, msg: '需先获得《玄天混沌残胚》，方可开启玄天之宝孕育。' };
    removeItem(h, 'mat_xuantian_pei', 1);
    xt.stage = 1; xt.progress = 20; xt.kind = choiceKind ?? 'sword';
    return { ok: true, msg: `你以精血温养《玄天混沌残胚》，定下【${xt.kind === 'sword' ? '玄天斩灵剑' : '浑天玄鼎'}】雏形（第一阶：混沌初孕 20%）。` };
  }
  if (xt.stage === 1) {
    if (h.bottle.drops < 1) return { ok: false, msg: '第一阶混沌滋养需消耗 1 滴问道残卷《墨露》。' };
    h.bottle.drops -= 1;
    xt.progress += 40;
    if (xt.progress >= 100) { xt.stage = 2; xt.progress = 0; return { ok: true, msg: '问道墨露渗入残胚，混沌灵纹大亮——晋入第二阶【雷火淬锋】，请投入雷海精金或太阴寒髓开锋！' }; }
    return { ok: true, msg: `墨露滋养玄天灵胚，混沌初孕进度升至 ${xt.progress}%。` };
  }
  // stage === 2
  const hasJin = bagCount(h, 'mat_leihai_jin') > 0;
  const hasSui = bagCount(h, 'mat_taiyin_sui') > 0;
  if (!hasJin && !hasSui) return { ok: false, msg: '第二阶淬锋需投入《雷海精金》或《太阴寒髓》。' };
  if (hasJin) removeItem(h, 'mat_leihai_jin', 1); else removeItem(h, 'mat_taiyin_sui', 1);
  xt.progress += 50;
  if (xt.progress >= 100) {
    xt.stage = 3; xt.progress = 100;
    const outId = xt.kind === 'ding' ? 'art_xuantian_ding' : 'art_xuantian_jian';
    addItem(h, outId, 1);
    return { ok: true, msg: `天地异象降临！玄天之宝彻底出世——获得【${outId === 'art_xuantian_ding' ? '浑天玄鼎' : '玄天斩灵剑'}】！` };
  }
  return { ok: true, msg: `精材融入胚体，玄天淬锋进度 ${xt.progress}%。` };
}

export function claimSpiritDomain(h: Hero, ws: WorldState, day: number, locId: string): { ok: boolean; msg: string } {
  if (ACTIVE_WORLD !== 'spirit') return { ok: false, msg: '灵域角力仅在灵界有效。' };
  const loc = LOC_BY_ID.get(locId);
  if (!loc || loc.map !== ACTIVE_MAP) return { ok: false, msg: '请亲临本图灵界城池或宗门据点再行争夺灵域。' };
  if (h.realm < 6) return { ok: false, msg: '掌控灵界灵域至少需炼虚期修为以镇压地脉。' };
  const sp = ensureWorldSlice(ws, 'spirit');
  const doms = (sp.spiritDomains ??= {});
  if (doms[locId]?.owner === 'player') return { ok: false, msg: `${loc.name}灵域已归你名下。` };
  const cost = 30;
  if (bagCount(h, 'mat_lingjing') < cost) return { ok: false, msg: `布设镇域灵阵需消耗 ${cost} 枚灵晶。` };
  removeItem(h, 'mat_lingjing', cost);
  doms[locId] = { owner: 'player', ownerName: h.name, level: Math.max(1, h.realm - 5), yieldDay: day };
  return { ok: true, msg: `灵阵落成，你成功执掌【${loc.name}】一脉灵域，每三十日可自动聚生灵晶供奉！` };
}

export function collectSpiritDomains(h: Hero, ws: WorldState, day: number): Msg[] {
  const doms = ws.worlds?.spirit?.spiritDomains;
  if (!doms) return [];
  const msgs: Msg[] = [];
  let total = 0;
  for (const d of Object.values(doms)) {
    if (d.owner !== 'player') continue;
    const periods = Math.floor((day - d.yieldDay) / 30);
    if (periods > 0) {
      d.yieldDay += periods * 30;
      total += periods * (4 + d.level * 3);
    }
  }
  if (total > 0) {
    addItem(h, 'mat_lingjing', total);
    msgs.push({ text: `麾下灵界灵域按月产出供奉，入账灵晶 ×${total}。`, kind: 'good' });
  }
  return msgs;
}

// ------------------------------------------------------------ 4. 仙界：大道法则、三十六仙窍、斩三尸、五衰、斩仙榜、岁月天书
export function comprehendDaoLaw(h: Hero, lawId: DaoLawId): { ok: boolean; msg: string } {
  if (h.realm < 8) return { ok: false, msg: '大乘以下未窥仙门，尚无法刻画大道法则。' };
  const hi = ensureHigher(h);
  const laws = (hi.laws ??= {});
  const lv = laws[lawId] ?? 0;
  if (lv >= 5) return { ok: false, msg: `${DAO_LAWS.find((l) => l.id === lawId)?.name}已参悟至第五重圆满！` };
  const cost = lv + 1;
  if (bagCount(h, 'mat_faze_jingsi') < cost) return { ok: false, msg: `参悟下一重需《大道法则晶丝》 ×${cost}。` };
  removeItem(h, 'mat_faze_jingsi', cost);
  laws[lawId] = lv + 1;
  const def = DAO_LAWS.find((l) => l.id === lawId)!;
  return { ok: true, msg: `大道轰鸣！【${def.name}】突破至第 ${lv + 1} 重（${def.bonusText}）！` };
}

export function openImmortalAcupoint(h: Hero): { ok: boolean; msg: string } {
  if (h.realm < 9) return { ok: false, msg: '三十六仙窍须飞升成真仙后方可贯通。' };
  const hi = ensureHigher(h);
  const cur = hi.immortalAcupoints ?? 0;
  if (cur >= 36) return { ok: false, msg: '周天三十六仙窍已全数贯通！' };
  const cost = 3 + Math.floor(cur / 6) * 2;
  if (bagCount(h, 'mat_xianyuan') < cost) return { ok: false, msg: `冲开第 ${cur + 1} 仙窍需消耗仙元石 ×${cost}。` };
  removeItem(h, 'mat_xianyuan', cost);
  hi.immortalAcupoints = cur + 1;
  return { ok: true, msg: `仙元如瀑！周天第 ${cur + 1}/36 处仙窍轰然贯通，仙躯底蕴大涨！` };
}

export function severCorpse(h: Hero, idx: 0 | 1 | 2): { ok: boolean; msg: string } {
  if (h.realm < 11) return { ok: false, msg: '需证道太乙金仙以上，方能开启【斩三尸】秘术。' };
  const hi = ensureHigher(h);
  const arr = (hi.threeCorpses ??= [false, false, false]);
  const names = ['善尸', '恶尸', '执念尸'];
  if (arr[idx]) return { ok: false, msg: `你早已斩却「${names[idx]}」。` };
  const needSi = 3 + idx * 2;
  if (bagCount(h, 'mat_faze_jingsi') < needSi || bagCount(h, 'pill_jinxian') < 1) {
    return { ok: false, msg: `斩去${names[idx]}需《大道法则晶丝》×${needSi} 与《太乙斩尸丹》×1。` };
  }
  removeItem(h, 'mat_faze_jingsi', needSi);
  removeItem(h, 'pill_jinxian', 1);
  arr[idx] = true;
  const done = arr.filter(Boolean).length;
  hi.avatar = { active: true, power: done * 0.45 };
  return { ok: true, msg: `一道太乙剑光透体而出——「${names[idx]}」应声剥离化为身外化身！三尸已斩 ${done}/3，战斗化身护道威力倍增！` };
}

export function isInHuiyuanRegion(px?: number, py?: number): boolean {
  if (ACTIVE_MAP !== 'xianjie' || px === undefined) return false;
  if (py !== undefined) {
    const r = regionAt(px / WORLD_SCALE, py / WORLD_SCALE, true);
    if (r) return r.id === 'hy_west' || r.id === 'hy_east';
  }
  return px / WORLD_SCALE >= 1720;
}

export function tickFiveDecays(h: Hero, days: number, day: number, px?: number, py?: number): Msg[] {
  if (h.realm < 9) return [];
  const hi = ensureHigher(h);
  const fd = (hi.fiveDecays ??= { level: 0, suppressedUntil: 0, progress: 0 });
  if (fd.suppressedUntil > day) return [];
  const msgs: Msg[] = [];
  const sam = hi.laws?.samsara ?? 0;
  const inHuiyuan = isInHuiyuanRegion(px, py);
  const rate = (inHuiyuan ? 0.45 : 0.12) * Math.max(0.35, 1 - sam * 0.12);
  fd.progress += days * rate;
  if (fd.progress >= 100 && fd.level < 5) {
    fd.progress -= 100;
    fd.level += 1;
    msgs.push({ text: `仙体浮现灰败之气——【天人五衰】升至第 ${fd.level} 层！请速服《定仙镇衰丹》或以《混沌净源》洗炼！`, kind: 'warn' });
  }
  if (fd.level >= 5 && days > 0) {
    h.lifeLost += days * 0.5;
    if (Math.random() < 0.08) msgs.push({ text: '五衰圆满侵蚀仙魂，寿元正加速流逝！', kind: 'warn' });
  }
  return msgs;
}

export function suppressFiveDecays(h: Hero, day: number, method: 'pill' | 'chaos'): { ok: boolean; msg: string } {
  const hi = ensureHigher(h);
  const fd = (hi.fiveDecays ??= { level: 0, suppressedUntil: 0, progress: 0 });
  if (method === 'pill') {
    if (bagCount(h, 'pill_dingxian_zhenshuai') < 1) return { ok: false, msg: '缺少《定仙镇衰丹》。' };
    removeItem(h, 'pill_dingxian_zhenshuai', 1);
    fd.level = Math.max(0, fd.level - 1);
    fd.progress = 0;
    fd.suppressedUntil = Math.max(fd.suppressedUntil, day) + 360;
    return { ok: true, msg: '服下《定仙镇衰丹》，周身灰煞一清，天人五衰退散一层并稳固一年！' };
  }
  if (bagCount(h, 'mat_hundun_jingyuan') < 1) return { ok: false, msg: '缺少《混沌净源》。' };
  removeItem(h, 'mat_hundun_jingyuan', 1);
  fd.level = 0; fd.progress = 0;
  fd.suppressedUntil = Math.max(fd.suppressedUntil, day) + 1080;
  return { ok: true, msg: '混沌净源化作清流洗涤仙躯，所有天人五衰尽数荡平，三年内百劫不侵！' };
}

export interface ImmortalRankTarget {
  id: string; name: string; title: string; reqRealm: number;
  rewardXianyuan: number; rewardLaws: number; pageDrop: boolean;
}
export const IMMORTAL_RANK_LIST: ImmortalRankTarget[] = [
  { id: 'rank_beihan_pan', name: '寒煞散仙·魏绝', title: '斩仙榜第五十名（真仙境）', reqRealm: 9, rewardXianyuan: 25, rewardLaws: 2, pageDrop: true },
  { id: 'rank_jinyuan_gui', name: '金甲叛将·凌玄', title: '斩仙榜第三十名（玄仙境）', reqRealm: 10, rewardXianyuan: 50, rewardLaws: 4, pageDrop: true },
  { id: 'rank_lunhui_ying', name: '断魂使·墨苍', title: '斩仙榜第十五名（金仙境）', reqRealm: 11, rewardXianyuan: 90, rewardLaws: 6, pageDrop: true },
  { id: 'rank_huijie_zun', name: '灰道尊·蚀骨', title: '斩仙榜第三名（大罗境）', reqRealm: 12, rewardXianyuan: 180, rewardLaws: 10, pageDrop: true },
];

export function canSummonImmortalRank(h: Hero, ws: WorldState, id: string): { ok: boolean; target?: ImmortalRankTarget; msg: string } {
  if (ACTIVE_WORLD !== 'immortal') return { ok: false, msg: '《斩仙榜》律令只在仙界通行。' };
  const target = IMMORTAL_RANK_LIST.find((t) => t.id === id);
  if (!target) return { ok: false, msg: '榜上无此人。' };
  const im = ensureWorldSlice(ws, 'immortal');
  const done = (im.immortalRankDone ??= []);
  if (done.includes(id)) return { ok: false, msg: `「${target.name}」已被你正法，名字已自斩仙榜抹去。` };
  if (h.realm < target.reqRealm) return { ok: false, msg: `目标乃${target.title}，需至少同等大境界方能赴榜迎战。` };
  return { ok: true, target, msg: '' };
}

export function completeImmortalRankKill(h: Hero, ws: WorldState, id: string): { ok: boolean; msg: string } {
  const target = IMMORTAL_RANK_LIST.find((t) => t.id === id);
  if (!target) return { ok: false, msg: '榜上无此人。' };
  const im = ensureWorldSlice(ws, 'immortal');
  const done = (im.immortalRankDone ??= []);
  if (done.includes(id)) return { ok: false, msg: `「${target.name}」已在榜上除名。` };
  done.push(id);
  h.peerKills = (h.peerKills ?? 0) + 1;
  addItem(h, 'mat_xianyuan', target.rewardXianyuan);
  addItem(h, 'mat_faze_jingsi', target.rewardLaws);
  if (target.pageDrop) addItem(h, 'item_canjuan_page', 1);
  return {
    ok: true,
    msg: `【斩仙榜正法】你亲手将「${target.name}」斩于剑下！玉皇仙庭赐下仙元石 ×${target.rewardXianyuan}、法则晶丝 ×${target.rewardLaws}${target.pageDrop ? '，并获一页《岁月天书原章》' : ''}！`,
  };
}

export function challengeImmortalRank(h: Hero, ws: WorldState, id: string): { ok: boolean; msg: string } {
  const chk = canSummonImmortalRank(h, ws, id);
  if (!chk.ok || !chk.target) return { ok: false, msg: chk.msg };
  if (h.hp < 0.5 || h.mp < 0.4) return { ok: false, msg: '状态不佳，请先回复气血与仙元再赴榜战。' };
  h.hp = Math.max(0.25, h.hp - 0.35);
  h.mp = Math.max(0.15, h.mp - 0.4);
  return completeImmortalRankKill(h, ws, id);
}

export function canjuanTimeRewind(h: Hero, day: number): { ok: boolean; msg: string } {
  if (h.realm < 9) return { ok: false, msg: '仙界《岁月逆流》神通需真仙境方能引动残卷本源。' };
  const hi = ensureHigher(h);
  if ((hi.canjuanTimeCooldownUntil ?? 0) > day) {
    return { ok: false, msg: `岁月长河尚在平复，需等待 ${Math.ceil(hi.canjuanTimeCooldownUntil! - day)} 日。` };
  }
  if (bagCount(h, 'mat_suiyue_jinlu') > 0) removeItem(h, 'mat_suiyue_jinlu', 1);
  else if (h.bottle.drops >= 3) h.bottle.drops -= 3;
  else return { ok: false, msg: '引动岁月逆流需消耗 1 滴《岁月金露》或 3 滴问道墨露。' };
  hi.canjuanTimeCooldownUntil = day + 90;
  h.hp = 1; h.mp = 1; h.daoHurt = null; h.pillN = 0; h.healPillN = 0; h.medStale = 0;
  return { ok: true, msg: '问道残卷迸发金色时环！方才一瞬的伤势、丹毒与疲惫全数回溯清零，状态重回巅峰！' };
}

export function absorbCanjuanPages(h: Hero): { pages: number; msg?: string } {
  const hi = ensureHigher(h);
  const bagP = bagCount(h, 'item_canjuan_page');
  if (bagP > 0 && (hi.canjuanPages ?? 0) < 7) {
    const take = Math.min(bagP, 7 - (hi.canjuanPages ?? 0));
    removeItem(h, 'item_canjuan_page', take);
    hi.canjuanPages = (hi.canjuanPages ?? 0) + take;
    return { pages: hi.canjuanPages, msg: `《岁月天书原章》自行化作金篆飞入问道残卷（现已集齐 ${hi.canjuanPages}/7 页）！` };
  }
  return { pages: hi.canjuanPages ?? 0 };
}

export function triggerFinalEnding(h: Hero, choice: 'samsara' | 'transcend'): { ok: boolean; msg: string } {
  const hi = ensureHigher(h);
  const totalPages = (hi.canjuanPages ?? 0) + bagCount(h, 'item_canjuan_page');
  if (totalPages < 7) return { ok: false, msg: `需集齐七页《岁月天书原章》（当前 ${totalPages}/7）方能叩响太初终局。` };
  if (h.realm < 12) return { ok: false, msg: '需证道大罗巅峰，方能承载完整《岁月天书》的因果。' };
  absorbCanjuanPages(h);
  hi.ending = choice;
  if (choice === 'transcend') {
    h.lifeBonus += 999999;
    return { ok: true, msg: '七页《岁月天书》合而为一，你一指点碎时间枷锁，超脱三界众生之外，万劫不磨，道名永垂诸天！' };
  }
  h.lifeBonus += 10000;
  return { ok: true, msg: '你执笔写下新轮回印记，纵身投入太初时空长河——此世道果已化作下世道胎铭文，静待来生再踏仙途！' };
}

// ------------------------------------------------------------ 5. 逆返下界：天道排斥追踪
export function addPlaneRejection(h: Hero, amount: number): { level: number; warning?: string; forcedReturn: boolean } {
  const hi = ensureHigher(h);
  const next = Math.max(0, Math.min(100, (hi.planeRejection ?? 0) + amount));
  const prev = hi.planeRejection ?? 0;
  hi.planeRejection = next;
  if (next >= 100) {
    hi.planeRejection = 0;
    return { level: 100, warning: '下界天道排斥已达极致！虚空裂缝强行合拢，将你弹回上界！', forcedReturn: true };
  }
  if (next >= 70 && prev < 70) {
    return { level: next, warning: `天道排斥已积蓄至 ${Math.round(next)}%，继续动用高阶神通杀伐恐将被强行弹回上界！`, forcedReturn: false };
  }
  return { level: next, forcedReturn: false };
}

export function decayPlaneRejection(h: Hero, days: number) {
  if (!h.higher?.planeRejection) return;
  h.higher.planeRejection = Math.max(0, h.higher.planeRejection - days * 1.5);
}

/** 玩家所在界与可返回的上界目标 */
export function returnTargetWorldForHero(h: Hero, ws: WorldState, currentWorld: WorldId): WorldId | null {
  if (currentWorld === 'human') {
    if (ws.ascendedWorlds?.includes('immortal') && h.realm >= 9) return 'immortal';
    if (ws.ascendedWorlds?.includes('spirit') || h.realm >= 6) return 'spirit';
  } else if (currentWorld === 'spirit') {
    if (ws.ascendedWorlds?.includes('immortal') || h.realm >= 9) return 'immortal';
  }
  return null;
}

/** 飞升点距离工具（用于面板提示是否在接引台/飞仙台附近） */
export function nearLocation(px: number, py: number, locId: string, radius = 1400): boolean {
  const l = LOC_BY_ID.get(locId);
  if (!l || l.map !== ACTIVE_MAP) return false;
  return Math.hypot(px - l.x * WORLD_SCALE, py - l.y * WORLD_SCALE) <= radius;
}
