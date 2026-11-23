// P2 光影：按时辰、天气给后期的「分色调」和「高度雾 / 距离雾」参数。
// 用户的要求：越炫越好、一眼想玩，但别做成过饱和的手游风——克制地提气氛，高光留给法术和灵光；
// 雾、云、光晕只能点缀，不能糊住建筑和可玩的地方。所以这里的量都偏小，主角身边一圈不起雾。
import { itemDef, TIER_COLORS } from '../data/items';

type V3 = [number, number, number];

/**
 * 新光影的总开关：localStorage taixu.gfx=0 关（退回原来的画法，也是对照「改前」用的）；网址带 ?gfx=0 / ?gfx=1 会顺手写进去。
 * 画质最低一档另由渲染器关。
 */
export const gfxSetting = { on: (() => {
  try {
    if (typeof location !== 'undefined') { const q = new URLSearchParams(location.search).get('gfx'); if (q === '0' || q === '1') localStorage.setItem('taixu.gfx', q); }
    return typeof localStorage === 'undefined' || localStorage.getItem('taixu.gfx') !== '0';
  } catch { return true; }
})() };
/** 设置面板里的「光影」开关：立刻生效，记在本机（taixu.gfx） */
export function setGfxOn(on: boolean): void { gfxSetting.on = on; try { localStorage.setItem('taixu.gfx', on ? '1' : '0'); } catch { /* 隐私模式 */ } }

/** 以 c 为中心、半宽 w 的钟形权重（0..1），在一天的相位上首尾相接 */
function bell(phase: number, c: number, w: number): number {
  let d = Math.abs(phase - c); d = Math.min(d, 1 - d);
  const k = Math.max(0, 1 - d / w); return k * k * (3 - 2 * k);
}

// 四个时辰的调子：暗部色偏、亮部色偏、反差、饱和
const LOOK: Record<'dawn' | 'noon' | 'dusk' | 'night', { lo: V3; hi: V3; contrast: number; sat: number }> = {
  // 清晨：亮部金，暗部微冷（晨雾里的青）
  dawn: { lo: [0.95, 0.97, 1.05], hi: [1.08, 1.01, 0.84], contrast: 1.04, sat: 1.03 },
  // 正午：清透，只略提反差和饱和，色偏几乎为零
  noon: { lo: [0.99, 1.0, 1.02], hi: [1.02, 1.01, 0.99], contrast: 1.06, sat: 1.05 },
  // 黄昏：亮部橙，暗部偏紫
  dusk: { lo: [0.86, 0.8, 1.07], hi: [1.08, 0.95, 0.84], contrast: 1.1, sat: 1.04 },
  // 夜里：暗部蓝黑，亮部带月光的银青；反差拉开，饱和收一点
  night: { lo: [0.8, 0.88, 1.12], hi: [0.95, 1.0, 1.07], contrast: 1.1, sat: 0.88 },
};

/** 时辰分色调。phase 一天的相位（0 子夜、0.5 正午），night 0..1，gloom 阴天程度 0..1 */
export function gradeFor(phase: number, night: number, gloom: number) {
  const wd = bell(phase, 0.27, 0.085) * (1 - night), wk = bell(phase, 0.735, 0.085) * (1 - night), wn = night;
  const wm = Math.max(0, 1 - wd - wk - wn), sum = wd + wk + wn + wm;
  const mix = (f: (l: typeof LOOK.noon) => number) => (f(LOOK.dawn) * wd + f(LOOK.dusk) * wk + f(LOOK.night) * wn + f(LOOK.noon) * wm) / sum;
  // 阴天：色偏和反差都收一半（灰蒙蒙的天不该有金边）
  const g = 1 - gloom * 0.5, lerp = (v: number) => 1 + (v - 1) * g;
  const lo: V3 = [lerp(mix((l) => l.lo[0])), lerp(mix((l) => l.lo[1])), lerp(mix((l) => l.lo[2]))];
  const hi: V3 = [lerp(mix((l) => l.hi[0])), lerp(mix((l) => l.hi[1])), lerp(mix((l) => l.hi[2]))];
  // 反差的支点：夜里画面整体被压暗，支点跟着往下挪，不然一拉反差夜景全黑
  return { lo, hi, contrast: lerp(mix((l) => l.contrast)), sat: lerp(mix((l) => l.sat)), pivot: 0.42 - 0.22 * night };
}

/**
 * 高度雾与距离雾。viewD 镜头到主角的距离（缩放决定）；ground 主角脚下的海拔；mountains 是否高山模式。
 * - 远处淡淡的空气透视（距离雾），越远越融进雾色；
 * - 清晨贴着地面的薄雾（雾底低、随高度变淡得快）；
 * - 高山里比主角低的山谷积一层薄雾；
 * - 雾天加浓一些；主角身边 near 以内不起雾。
 */
export function fogFor(phase: number, night: number, gloom: number, fogWeather: number, viewD: number, ground: number, mountains: boolean) {
  const morning = bell(phase, 0.29, 0.07) * (1 - night), eve = bell(phase, 0.74, 0.07) * (1 - night);
  const max = Math.min(0.42, 0.1 + 0.2 * morning + 0.06 * eve + 0.06 * night + 0.08 * gloom + 0.16 * fogWeather);
  const noon: V3 = [0.84, 0.88, 0.92], dawnC: V3 = [0.97, 0.92, 0.84], duskC: V3 = [0.95, 0.8, 0.74], nightC: V3 = [0.56, 0.63, 0.8];
  const wm = Math.max(0, 1 - morning - eve - night), s = morning + eve + night + wm;
  const color: V3 = [0, 1, 2].map((i) => (dawnC[i] * morning + duskC[i] * eve + nightC[i] * night + noon[i] * wm) / s) as V3;
  return {
    density: 1 / (viewD * 1.5), near: viewD * 0.5, max, color,
    // 清晨的雾贴着地（变淡得快）；高山里雾底压到主角脚下以下，只填山谷
    base: ground + (mountains ? -120 : 20), falloff: 260 + 700 * (1 - morning),
  };
}

/** 掉落物的品阶（妖丹按中品算） */
export function lootTier(id: string): number { return id.startsWith('mat_yaodan') ? 2 : itemDef(id).tier ?? 1; }
/** 掉落物的光色：按品阶上色（与物品格子的品阶色一致） */
const lootCache = new Map<string, V3>();
export function lootGlow(id: string): V3 {
  let c = lootCache.get(id);
  if (!c) {
    const hex = TIER_COLORS[itemDef(id).tier] ?? '#c8c8c8', n = parseInt(hex.slice(1, 7), 16);
    c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; lootCache.set(id, c);
  }
  return c;
}
