// 法宝匣的条目：从游戏数据表现读（模组加的内容也在里面）。
// 每个条目带 facets（种类 / 五行 / 品阶……），目录树按它们细分；mod 记下出自哪个模组（内容 id 以「模组id_」开头）。
import { gameKind } from './gamekind.js';

export const TABS = [
  { id: 'human', name: '人物', icon: 'tab_human', place: true },
  { id: 'beast', name: '妖兽', icon: 'tab_beast', place: true },
  { id: 'item', name: '法宝·物品', icon: 'tab_item' },
  { id: 'art', name: '法术', icon: 'tab_art' },
  { id: 'gongfa', name: '功法', icon: 'tab_gongfa' },
  { id: 'pet', name: '灵宠', icon: 'tab_pet' },
  { id: 'status', name: '异常', icon: 'tab_status' },
  { id: 'field', name: '试场', icon: 'tab_field' },
  { id: 'preset', name: '预设', icon: 'tab_preset' },
];
/** 旧名（1.2 的 CATS），留给外面可能引用的代码 */
export const CATS = TABS;
const EL_COL = { 火: '#b4472e', 冰: '#4f86a8', 雷: '#5b62b0', 风: '#4f9a86', 土: '#9a7440', 木: '#5f8a3e', 剑: '#3f7f86', 体: '#9a6a3a', 御: '#a0782a', 魔: '#8a2433', 识: '#7a58a6', 阵: '#a08a2e', 身: '#4a7f9a', 符: '#a07a2a', 神: '#b08a30' };
const TIER_COL = ['#7a7a7a', '#5b8a5b', '#3f78a8', '#8a4fb0', '#c08a2a', '#c0392b', '#e0a800'];
export const ART_TIER = ['凡阶', '黄阶', '玄阶', '地阶', '天阶'];
export const ITEM_TIER = ['凡品', '下品', '中品', '上品', '极品', '古宝', '通天'];
const KIND_NAME = { beast: '妖兽', ghost: '鬼物', insect: '灵虫', human: '修士' };
export const ITEM_TYPE = { herb: '灵草', pill: '丹药', material: '材料', artifact: '法宝', talisman: '符箓', scroll: '卷轴', misc: '杂物', gift: '礼物', egg: '灵卵', gear: '装备' };   // B 版收官：新类别「装备」（发冠、腰带、护腕、戒指、玉佩）
export const ELEMENT = { fire: '火', ice: '冰', thunder: '雷', gold: '金', wood: '木', water: '水', earth: '土', yin: '阴', blood: '血' };
const CAST_NAME = { bolt: '弹道', fan: '扇形', nova: '自身爆发', burst: '落点爆发', cone: '锥形', beam: '光柱', strike: '天降', chain: '连锁', field: '区域', orbit: '环绕', dash: '冲刺', blink: '瞬移', buff: '增益', shield: '护盾', heal: '治疗', summon: '召唤', sense: '神识', melee: '近战', custom: '自定义' };
const LV_NAME = ['', '一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级', '九级', '十级'];
export const STATUS = { burn: '燃烧', freeze: '冰冻', shock: '麻痹', poison: '中毒', root: '定身', knock: '击退', break: '破甲', slow: '迟缓', stun: '眩晕' };
const STATUS_COL = { burn: '#c0502a', freeze: '#4f8fb8', shock: '#6a66c0', poison: '#5f8a3e', root: '#8a6a3a', knock: '#7a7a7a', break: '#a0782a', slow: '#4f7f9a', stun: '#a08a2e' };
const STATUS_DESC = { burn: '持续掉血', freeze: '冻住不能动、不能出手', shock: '短暂麻痹，打断出手', poison: '持续掉血，比燃烧慢而久', root: '脚下生根，能出手不能走', knock: '被打退几步', break: '防御减半', slow: '移速减半', stun: '头晕眼花，什么都做不了' };

/** 每个标签页的目录分面：[分面名, 取值函数]（取不到值的条目不进这一面） */
export const FACETS = {
  human: ['种类', '境界'], beast: ['种类', '等阶', '特性'], item: ['种类', '五行', '品阶'], art: ['流派', '品阶', '出手'], gongfa: ['种类'], pet: ['种类'], status: [],
};

export function buildCatalog(api, g) {
  const U = api.unsafe.data, out = { human: [], beast: [], item: [], art: [], gongfa: [], pet: [], status: [], tool: [] };
  const mods = new Map();
  for (const m of globalThis.__modHost?.mods ?? []) if (!m.dead) mods.set(m.b.manifest.id, m.b);
  const src = (id) => { const s = String(id), k = s.split('_')[0]; return mods.has(k) && s.includes('_') ? k : ''; };
  const tag = (...a) => a.filter(Boolean);
  for (const d of Object.values(U.ENEMIES ?? {})) {
    if (!d?.id || !d.name) continue;
    const human = d.kind === 'human';
    const lv = d.lv ? `${d.lv[0]}${d.lv[1] !== d.lv[0] ? '–' + d.lv[1] : ''} 级` : '';
    out[human ? 'human' : 'beast'].push({ id: d.id, cat: human ? 'human' : 'beast', kind: 'enemy', name: d.name, glyph: d.name.slice(-1),
      meta: [KIND_NAME[d.kind] ?? '', lv, d.title ?? '', d.flying ? '能飞' : '', d.lair ? '妖王' : ''].filter(Boolean).join(' · '),
      desc: d.title ?? '', tone: d.evil ? '#8a2433' : human ? '#3f5f7a' : '#5a6a4a', place: true, table: 'enemies', key: (d.name + d.id + (d.title ?? '')).toLowerCase(),
      facets: human ? { 种类: [d.evil ? '魔修' : '修士'] } : { 种类: [KIND_NAME[d.kind] ?? '其他'], 等阶: d.lv ? [LV_NAME[d.lv[0]] || `${d.lv[0]} 级`] : [], 特性: tag(d.lair && '妖王', d.flying && '能飞', d.evil && '魔物', d.hide && '擅隐匿') } });
  }
  // 有名有姓的人物（世界名册里活着的）：召来 / 切磋
  for (const n of g?.npcs?.list ?? []) {
    if (!n?.alive || !n.name || n.hidden) continue;
    if (!(n.canon || n.mod || n.beauty)) continue;
    out.human.push({ id: n.id, cat: 'human', kind: 'npc', npc: true, mod: n.mod ?? '', name: n.name, glyph: n.name.slice(-1),
      meta: [n.title ?? '', realmName(U, n.realm, n.stage)].filter(Boolean).join(' · '), desc: n.title ?? '', tone: '#7a4a2a', key: (n.name + n.id + (n.title ?? '')).toLowerCase(),
      facets: { 种类: tag('有名人物', n.beauty && (gameKind(api) === 'taixu' ? '知交' : '红颜')), 境界: [realmShort(U, n.realm)] } });
  }
  // 1.3.4：撼山客 · 岳千钧（B 版的游荡体修，不在世界名册里，单独一条）
  if (g?.hanshan) out.human.unshift({ id: 'hanshan', cat: 'human', kind: 'hanshan', hanshan: true, name: '撼山客 · 岳千钧', glyph: '撼',
    meta: '游荡南荒的体修大能 · 比你高一个大境界', desc: '可以召到身旁、切磋一场、惹怒他真打，或让他对木桩把招式一招招演一遍。', tone: '#8a3a1a', key: '撼山客岳千钧hanshan',
    facets: { 种类: ['有名人物'], 境界: [] } });
  // 1.3.9：噬魂魔尊 · 夜无赦（B 版的邪修世界首领，不在敌人表里——平时只在南荒陨魔谷外周期降临；单独一条）
  if (g?.yewushe) out.human.unshift({ id: 'yewushe', cat: 'human', kind: 'yewushe', yewushe: true, name: '噬魂魔尊 · 夜无赦', glyph: '魔',
    meta: '邪修世界首领 · 比你高一个大境界 · 人身 / 半魔 / 魔躯三形态', desc: '可以召来真打（从人身打起，或直接打魔躯形态），或让他对木桩把招式一招招演一遍。只降在南荒。', tone: '#6a1a3a', key: '噬魂魔尊夜无赦yewushe魔尊首领',
    facets: { 种类: ['有名人物', '魔修'], 境界: [] } });
  for (const a of Object.values(U.ARTS ?? {})) {
    if (!a?.id || !a.name) continue;
    out.art.push({ id: a.id, cat: 'art', kind: 'art', name: a.name, glyph: a.school ?? a.name[0], meta: `${a.school ?? ''}系 · ${ART_TIER[a.tier] ?? ''} · ${realmShort(U, a.realm)}可修`,
      desc: a.desc, tone: EL_COL[a.school] ?? '#4a5a6a', table: 'arts', key: (a.name + a.id + a.school).toLowerCase(),
      facets: { 流派: tag(a.school), 品阶: tag(ART_TIER[a.tier]), 出手: tag(CAST_NAME[a.cast] ?? a.cast) } });
  }
  let gf = {}; try { gf = api.data.get('gongfa') ?? {}; } catch { /* */ }
  for (const [id, d] of Object.entries(gf)) {
    out.gongfa.push({ id, cat: 'gongfa', kind: 'gongfa', name: d.name, glyph: d.name.slice(0, 1), meta: `${d.aux ? '辅修 · ' : ''}修炼 ×${d.rate} · 至${realmShort(U, d.maxRealm)}`, desc: d.desc, tone: '#3f6a5e', table: 'gongfa', key: (d.name + id).toLowerCase(),
      facets: { 种类: [d.aux ? '辅修' : '主修'] } });
  }
  for (const d of Object.values(U.ITEMS ?? {})) {
    if (!d?.id || !d.name || d.id.startsWith('scroll_art_')) continue;
    const el = d.art?.element ? ELEMENT[d.art.element] ?? d.art.element : '';
    out.item.push({ id: d.id, cat: 'item', kind: 'item', name: d.name, glyph: d.glyph || d.name[0], meta: `${ITEM_TYPE[d.type] ?? d.type} · ${ITEM_TIER[d.tier] ?? d.tier + '品'}${el ? ' · ' + el : ''}`,
      desc: d.desc, tone: TIER_COL[d.tier] ?? '#6a6a6a', table: 'items', key: (d.name + d.id + (ITEM_TYPE[d.type] ?? '')).toLowerCase(),
      facets: { 种类: [ITEM_TYPE[d.type] ?? d.type ?? '其他'], 五行: tag(el), 品阶: tag(ITEM_TIER[d.tier]) } });
  }
  let pets = {}; try { pets = api.data.get('pets') ?? {}; } catch { /* */ }
  for (const [id, d] of Object.entries(pets)) {
    out.pet.push({ id, cat: 'pet', kind: 'pet', name: d.name, glyph: d.name.slice(-1), meta: `${d.flying ? '能飞 · ' : ''}${d.ranged ? '远攻' : '近战'}`, desc: d.desc, tone: `rgb(${d.color ?? '200,160,90'})`, table: 'pets', key: (d.name + id).toLowerCase(),
      facets: { 种类: tag(d.flying && '能飞', d.ranged ? '远攻' : '近战', !d.look && '虫群') } });
  }
  // 模组登记的试场工具：(globalThis.__shaheTools ??= {})[模组id] = [{ name, desc, glyph, icon?, params?, act(ctx) }]
  for (const [mid, list] of Object.entries(globalThis.__shaheTools ?? {})) {
    if (!mods.has(mid) || !Array.isArray(list)) continue;
    list.forEach((t, i) => {
      if (!t || typeof t.act !== 'function' || !t.name) return;
      out.tool.push({ id: `${mid}:${i}`, cat: 'tool', mod: mid, name: String(t.name).slice(0, 16), glyph: String(t.glyph ?? t.name).slice(0, 1), meta: String(t.desc ?? '模组工具').slice(0, 60), desc: t.desc, tone: t.tone ?? '#7a3a5a', act: t.act,
        icon: typeof t.icon === 'string' ? t.icon : '', params: Array.isArray(t.params) ? t.params : [], key: (t.name + mid).toLowerCase() });
    });
  }
  for (const k of ['beast', 'human', 'art', 'gongfa', 'item', 'pet']) for (const e of out[k]) { e.mod ||= src(e.id); if (e.mod) e.meta += ` · ${mods.get(e.mod)?.manifest.name ?? e.mod}`; }
  out.mods = [...mods.values()].map((b) => ({ id: b.manifest.id, name: b.manifest.name, version: b.manifest.version, author: b.manifest.author ?? '',
    icon: typeof b.files?.[b.manifest.icon] === 'string' && b.files[b.manifest.icon].startsWith('data:image/') ? b.files[b.manifest.icon] : '' }));
  for (const [id, name] of Object.entries(STATUS)) out.status.push({ id, cat: 'status', kind: 'status', name, glyph: name[0], meta: STATUS_DESC[id] ?? id, desc: STATUS_DESC[id], tone: STATUS_COL[id], key: (name + id).toLowerCase(), facets: {} });
  return out;
}
export function realmName(U, r, s) { const R = U.REALMS?.[r]; if (!R) return ''; const st = R.stages?.[s]; return st ? `${R.name}${typeof st === 'string' ? st : st.name ?? ''}` : R.name; }
export function realmShort(U, r) { return U.REALMS?.[r]?.name ?? `第${r}境`; }
