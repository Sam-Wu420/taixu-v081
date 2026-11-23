// v0.52.2：自定义按键
// 一套「动作 → 键位」的映射，默认值与旧版完全一致；改过的键位存在 localStorage。
// 键位统一用小写 e.key（'w' / 'arrowup' / ' ' / '?' / 'f1'），鼠标键记作 'mouse0' / 'mouse2'。

import { isTouch } from './touch';   // 第五轮：说明文字里的键位分电脑 / 触屏两套说法

export type BindKey = string;

export interface KeyActionDef {
  id: string;
  name: string;
  group: string;
  def: BindKey;
  /** 只作说明，不参与绑定 */
  note?: string;
}

/** 全部可改的动作。Esc、F1、F3 固定，不在此列。
 *  v0.52.5：技能栏 1–9 也可改键；默认 6/7 给鼠标左右键、8/9 给 X / V，左手不离 WASD 就能放完九个技能。 */
export const KEY_ACTIONS: KeyActionDef[] = [
  { id: 'up', name: '向上 / 前行', group: '移动', def: 'w' },
  { id: 'down', name: '向下 / 后退', group: '移动', def: 's' },
  { id: 'left', name: '向左', group: '移动', def: 'a' },
  { id: 'right', name: '向右', group: '移动', def: 'd' },
  { id: 'run', name: '走 / 跑切换（轻点切换、按住临时；御剑时＝遁光加速）', group: '移动', def: 'shift' },
  { id: 'slot1', name: '技能栏 1', group: '技能', def: '1' },
  { id: 'slot2', name: '技能栏 2', group: '技能', def: '2' },
  { id: 'slot3', name: '技能栏 3', group: '技能', def: '3' },
  { id: 'slot4', name: '技能栏 4', group: '技能', def: '4' },
  { id: 'slot5', name: '技能栏 5', group: '技能', def: '5' },
  { id: 'slot6', name: '技能栏 6（鼠标左键：有敌时施放，无敌时点地前往）', group: '技能', def: 'mouse0' },
  { id: 'slot7', name: '技能栏 7（鼠标右键）', group: '技能', def: 'mouse2' },
  { id: 'slot8', name: '技能栏 8', group: '技能', def: 'x' },
  { id: 'slot9', name: '技能栏 9', group: '技能', def: 'v' },
  { id: 'dodge', name: '闪避', group: '战斗', def: ' ' },
  { id: 'lock', name: '切换锁定目标', group: '战斗', def: 'tab' },
  { id: 'sense', name: '神识探查', group: '战斗', def: 'q' },
  { id: 'conceal', name: '敛息藏形', group: '战斗', def: 'r' },
  // 字母键已全部占满、数字 7–0 留给模组，所以近战只加这一个切换键；架势里的出招复用鼠标、Shift、空格
  { id: 'brawl', name: '近战架势（切换；鼠标中键同效）', group: '战斗', def: 'capslock' },
  { id: 'gather', name: '采集灵物', group: '交互', def: 'e' },
  { id: 'interact', name: '交谈 / 奇遇 / 机缘（不含伴侣与灵宠）', group: '交互', def: 't' },
  { id: 'lover', name: '与同行伴侣交谈', group: '交互', def: 'i' },
  { id: 'town', name: '进城 / 入宗门', group: '交互', def: 'g' },
  { id: 'fly', name: '御剑 / 落地', group: '交互', def: 'f' },
  // 恩怨重做 · 第二批：带着队友交战时打坐用不上，这个键改开队伍指令菜单（掩护 / 包抄 / 护着我撤 / 别杀他）；字母键已占满、数字 7–0 和 F 键留给模组
  { id: 'sit', name: '打坐（带着队友交战时：队伍指令菜单）', group: '交互', def: 'z' },
  { id: 'recall', name: '收回洞府', group: '交互', def: 'y' },
  // 原先默认是反引号。用户的「天工试场」模组（shahe）在窗口捕获阶段就把反引号吃掉当开关，装了它遁空键就失灵；
  // 模组那边是老习惯，核心让一步，换到句号键（逗号是换装，挨着）
  { id: 'dunkong', name: '遁空（须祭着遁空梭）', group: '交互', def: '.' },
  // 收官 B3：灵舟——字母键已占满、数字 7–0 和 F2、F4、F6–F10 留给模组，默认放在分号上（遁空梭在句号上，两个出海的东西挨着）
  { id: 'boat', name: '灵舟：祭出 / 登船 / 上岸收舟', group: '交互', def: ';' },
  // 2026-11-17 用户嫌 PageUp / PageDown 离手太远：御剑（和虚空、海渊）里闪避本来就不起作用，「闪避键（默认空格）按住＝上升」（game.ts 里接的，
  // 这里的 ascend 是另一个备用键）；下降默认放到 C（拇指从空格一滑就到），角色面板让到 J、纪事让到引号键。PageDown 没被占用时仍是下降的备用键。
  // 不用 Ctrl / Alt：浏览器里 Ctrl+W 直接关标签页，拦不住。数字键 7–0 留给模组注册快捷键，不能占
  { id: 'ascend', name: '飞行时上升（按住；备用——御剑时闪避键也是上升）', group: '移动', def: 'pageup' },
  { id: 'descend', name: '飞行时下降（按住）', group: '移动', def: 'c' },
  { id: 'map', name: '世界地图', group: '界面', def: 'm' },
  { id: 'char', name: '角色 / 冲关', group: '界面', def: 'j' },
  { id: 'bag', name: '储物袋', group: '界面', def: 'b' },
  { id: 'alchemy', name: '丹房 / 器炉', group: '界面', def: 'l' },
  { id: 'seclude', name: '闭关', group: '界面', def: 'p' },
  { id: 'skills', name: '功法', group: '界面', def: 'k' },
  { id: 'zhenfa', name: '阵法盘（布阵 / 阵道）', group: '界面', def: '6' },
  { id: 'wardrobe', name: '换装', group: '界面', def: ',' },
  { id: 'pets', name: '灵宠：在旁则逗弄 / 否则打开名册', group: '交互', def: 'u' },
  { id: 'hearts', name: '友人录（同行 · 知交 · 邀约）', group: '界面', def: 'h' },
  { id: 'chronicle', name: '纪事', group: '界面', def: "'" },   // 方括号是立体画面转镜头用的，不能占
  { id: 'relations', name: '人物关系', group: '界面', def: 'n' },
  { id: 'war', name: '战报 / 传书', group: '界面', def: 'o' },
  { id: 'help', name: '修仙指南', group: '界面', def: '?' },
  { id: 'zoomIn', name: '放大', group: '界面', def: '=' },
  { id: 'zoomOut', name: '缩小', group: '界面', def: '-' },
  // 收官 H3：右下「更多」抽屉（常用键之外的功能都收在里面）。默认反斜杠：不占数字 7–0 和 F 键（留给模组）
  { id: 'hudmore', name: '更多功能（右下抽屉）', group: '界面', def: '\\' },
];

const STORE = 'taixu.keys.v2';   // v0.52.5 键位表大改（技能栏可改键、伴侣 / 灵宠分键），旧表作废
const DEFAULTS: Record<string, BindKey> = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a.def]));

/** 与旧逻辑共用的「方位键」：不管玩家把上键改成什么，移动/闪避的旧代码仍读 w a s d shift */
const CANON: Record<string, BindKey> = { up: 'w', down: 's', left: 'a', right: 'd', run: 'shift', ascend: 'ascend', descend: 'descend' };

function load(): Record<string, BindKey> {
  const out: Record<string, BindKey> = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null') as Record<string, string> | null;
    if (raw && typeof raw === 'object') {
      for (const id in raw) if (id in DEFAULTS && typeof raw[id] === 'string') out[id] = raw[id];
      // 2026-11-17 升降换键：存着的键位表里这三项还是旧默认（下降 PageDown、角色 C、纪事 J）、新键也没被别的动作占着，就跟着换成新默认
      const used = (k: string) => Object.keys(out).some((id) => out[id] === k);
      if (out.descend === 'pagedown' && out.char === 'c' && out.chronicle === 'j' && !used("'")) { out.descend = 'c'; out.char = 'j'; out.chronicle = "'"; }
    }
  } catch { /* 存档坏了就用默认 */ }
  return out;
}

let binds: Record<string, BindKey> = load();
let index = buildIndex();

function buildIndex() {
  const m = new Map<BindKey, string>();
  for (const id in binds) if (binds[id]) m.set(binds[id], id);
  return m;
}

function persist() {
  try { localStorage.setItem(STORE, JSON.stringify(binds)); } catch { /* */ }
}

/** 当前键位（只读快照） */
export function allBinds(): Record<string, BindKey> { return binds; }
export function bindOf(id: string): BindKey { return binds[id] ?? ''; }
/** 某个物理键绑给了哪个动作 */
export function actionOfKey(k: BindKey): string | undefined { return index.get(k); }
/** 该动作的方位键（供移动等旧逻辑读取） */
export function canonicalOf(id: string): BindKey { return CANON[id] ?? ''; }

/**
 * 改键。若新键已被别的动作占着，两者对调——不会出现「有动作没键」的死角。
 * 返回被对调的动作 id（没有则空串）。
 */
export function setBind(id: string, key: BindKey): string {
  if (!(id in DEFAULTS) || !key) return '';
  const other = index.get(key);
  const old = binds[id];
  binds[id] = key;
  let swapped = '';
  if (other && other !== id) { binds[other] = old; swapped = other; }
  index = buildIndex();
  persist();
  return swapped;
}

export function resetBinds() {
  binds = { ...DEFAULTS };
  index = buildIndex();
  persist();
}

/** 是否改过键（设置里显示「已自定义」） */
export function isCustom(): boolean {
  for (const id in DEFAULTS) if (binds[id] !== DEFAULTS[id]) return true;
  return false;
}

/** 键位显示名：给按钮和说明用 */
export function keyLabel(k: BindKey): string {
  if (!k) return '未设';
  if (k.startsWith('mouse')) {
    const n = +k.slice(5);
    return ['左键', '中键', '右键', '侧键 1', '侧键 2'][n] ?? `鼠标 ${n}`;
  }
  const special: Record<string, string> = {
    ' ': '空格', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
    shift: 'Shift', control: 'Ctrl', alt: 'Alt', tab: 'Tab', enter: 'Enter', escape: 'Esc',
    backspace: '退格', capslock: 'Caps', "'": '引号键', '?': '?', '/': '/', '=': '=', '-': '-', ',': ',', '.': '.',
    pageup: 'PgUp', pagedown: 'PgDn', home: 'Home', end: 'End', insert: 'Ins', delete: 'Del',   // 收官 I：引导文案里不再出现 pageup 这种原名
  };
  if (special[k]) return special[k];
  if (k.startsWith('f') && k.length <= 3 && +k.slice(1) >= 1) return k.toUpperCase();
  return k.length === 1 ? k.toUpperCase() : k;
}

// ---------------------------------------------------------------- 第五轮：说明文字里的键位
// 消息、物品说明、世界里的小标签以前写死「按 K」「（T）」「【T】」——改了键就对不上，手机上更是没有键盘。
// 一律从这里取：电脑写当前键位，触屏写按钮的说法（或不写）。
/** 「按 K 」：电脑「按 <当前键> 」（尾巴带一个空格，后面直接接动词），触屏换成给的说法（不给就是空串） */
export function pressKey(id: string, tap = ''): string { return isTouch() ? tap : `按 ${keyLabel(bindOf(id))} `; }
/** 括注「（T）」：电脑「（<当前键>）」，触屏写给的说法（不给就不写） */
export function keyNote(id: string, tap = ''): string { return isTouch() ? (tap ? `（${tap}）` : '') : `（${keyLabel(bindOf(id))}）`; }
/** 画在世界里的「【T】交谈」这类小标签的前缀：电脑「【<当前键>】」，触屏不写（点那个人 / 那件东西、或点「谈」就行） */
export function keyTag(id = 'interact'): string { return isTouch() ? '' : `【${keyLabel(bindOf(id))}】`; }
/** 只要键名（电脑），触屏给的说法 */
export function keyOr(id: string, tap: string): string { return isTouch() ? tap : keyLabel(bindOf(id)); }
/** 御剑时「上升」的键名：闪避键（默认空格）；它没设时才是备用的 ascend */
export function ascendLabel(): string { return keyLabel(bindOf('dodge') || bindOf('ascend')); }
