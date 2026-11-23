// 地图图例筛选：大地图（WorldMapPanel）与小地图（Minimap）共用同一份状态，
// 一处勾选，两处同步生效，并持久化到 localStorage。
//
// 两种模式（沿用 v0.60 的交互）：
//   默认           → 点某一类 = 隐藏 / 显示这一类（记在 hidden）
//   「全部隐藏」后  → 点某一类 = 只看这一类（记在 shown）
//
// key 的命名空间：
//   loc:<类型>  地点类型（城 / 镇 / 宗 / 险 / 秘 …）
//   mk:<字形>   地图标记（任务「任」、指路「指」、洞府「府」、战事「攻」……）
//   hero        自己的位置
import { useEffect, useState } from 'react';

export const MAPFILTER_KEY = 'fanren.mapfilter';
export const MAPDETAIL_KEY = 'fanren.mapdetail';

export type MapDetailMode = 'smart' | 'clean' | 'all';

/** 任务、指路、求援永远可见，不参与筛选（避免玩家把主线或好友求救关掉后找不到路） */
export const ALWAYS_MARK = new Set(['任', '指', '援']);
/** 清简模式下仍保留的核心高价值标记 */
export const CORE_MARK = new Set(['任', '指', '府', '秘', '秘？', '境', '宝', '夺', '赏', '援', '妖', '王', '攻', '营', '军', '运', '劫', '守', '舵', '墟', '战', '旗', '仇', '决', '约', '讯']);
/** 野外零碎点位（智能模式下中远景仅画图标不抢字位，清简模式下隐藏） */
export const AMBIENT_MARK = new Set(['墓', '脉', '碑', '潭', '庙', '药', '巢', '骸', '骨', '哭', '✓']);

/** 标记字形 → 图例名；图例只列当前地图里真的出现的那些 */
export const GLYPH_NAME: Record<string, string> = {
  府: '洞府',
  秘: '秘境', '秘？': '传闻秘境', 境: '高阶秘境',
  宝: '异宝', 夺: '夺宝', 赏: '悬赏', 援: '求援',
  妖: '妖王印', 王: '地标妖王',
  攻: '战事', 营: '宗门大营', 军: '军阵', 运: '辎重', 劫: '劫修', 守: '宗门据点', 舵: '分舵', 墟: '宗门故墟',
  战: '正魔战场', 旗: '集结点', 仇: '求助仇敌', 决: '决斗',
  约: '友人之约', 讯: '江湖传闻', 饵: '假消息', 争: '道心相争', 盗: '海盗', 哭: '荒野哭声',
  墓: '古墓', 脉: '灵脉', 碑: '古碑', 潭: '寒潭', 庙: '山神庙', 药: '药王', 巢: '兽巢', 骸: '遗骸', 骨: '古战场',
  '✓': '已探点位',
};

type State = { hidden: string[]; shown: string[]; all: boolean };

function load(): State {
  try {
    const raw = localStorage.getItem(MAPFILTER_KEY);
    if (!raw) return { hidden: [], shown: [], all: false };
    const o = JSON.parse(raw) as Partial<State>;
    return { hidden: Array.isArray(o.hidden) ? o.hidden : [], shown: Array.isArray(o.shown) ? o.shown : [], all: !!o.all };
  } catch { return { hidden: [], shown: [], all: false }; }
}

let state: State = load();
let detailMode: MapDetailMode = (() => {
  try {
    const v = localStorage.getItem(MAPDETAIL_KEY);
    return v === 'clean' || v === 'all' || v === 'smart' ? v : 'smart';
  } catch { return 'smart'; }
})();
let revision = 0;
const subs = new Set<() => void>();

function emit() {
  revision++;
  try { localStorage.setItem(MAPFILTER_KEY, JSON.stringify(state)); } catch { /* 无存储权限就只在本次生效 */ }
  subs.forEach((f) => { try { f(); } catch { /* */ } });
}

export function getMapDetailMode(): MapDetailMode { return detailMode; }
export function setMapDetailMode(mode: MapDetailMode) {
  if (detailMode === mode) return;
  detailMode = mode;
  revision++;
  try { localStorage.setItem(MAPDETAIL_KEY, mode); } catch { /* */ }
  subs.forEach((f) => { try { f(); } catch { /* */ } });
}
export function useMapDetailMode(): MapDetailMode {
  const [m, setM] = useState<MapDetailMode>(detailMode);
  useEffect(() => onMapFilterChange(() => setM(detailMode)), []);
  return m;
}

/** 筛选状态的版本号：任何一处改动都会 +1，用作重绘依赖 */
export function mapFilterRev() { return revision; }
export function isMapFilterAll() { return state.all; }
export function anyMapFilterOff() { return state.all || state.hidden.length > 0; }
export function onMapFilterChange(fn: () => void) { subs.add(fn); return () => { subs.delete(fn); }; }

function toggleIn(list: 'hidden' | 'shown', k: string) {
  const arr = state[list];
  const i = arr.indexOf(k);
  if (i >= 0) arr.splice(i, 1); else arr.push(k);
}

function isOff(k: string) { return state.all ? !state.shown.includes(k) : state.hidden.includes(k); }

/** 点某一类：默认切隐藏；「全部隐藏」后切"只看这一类" */
export function clickMapFilter(k: string) {
  if (ALWAYS_MARK.has(k.slice(3))) return;   // 永远可见的不给点
  if (state.all) toggleIn('shown', k); else toggleIn('hidden', k);
  emit();
}

/** 底部总开关：全部隐藏(进入只看模式) / 全部显示(清空筛选) */
export function toggleMapFilterAll() {
  if (anyMapFilterOff()) { state = { hidden: [], shown: [], all: false }; }
  else { state = { hidden: [], shown: [], all: true }; }
  emit();
}

/** 某个类别当前是不是关着的（图例项据此淡化） */
export function isMapFilterOff(k: string) { return isOff(k); }

export function isLocTypeVisible(type: string) { return !isOff('loc:' + type); }
export function isMarkVisible(glyph: string) {
  if (ALWAYS_MARK.has(glyph)) return true;
  return !isOff('mk:' + glyph);
}
export function isHeroVisible() { return !isOff('hero'); }
export function isTerritoryVisible() { return !isOff('territory'); }

/** 组件里订阅筛选变化：返回版本号，把它放进绘制依赖即可自动重绘 */
export function useMapFilterRev() {
  const [rev, setRev] = useState(revision);
  useEffect(() => onMapFilterChange(() => setRev(revision)), []);
  return rev;
}
