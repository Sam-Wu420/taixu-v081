// v0.53 画材：灵兽灵体、阵纹、光罩、阵旗、破禁节点；v0.54 起兼管秘境画材（地面、墙、岩体、液面、摆件、宝匣、入口）
// 画材懒加载；没加载好时返回 null，调用方退回代码绘制。
// 黑底发光图存成 RGB（体积小一个数量级），首次取用时按亮度抠出 alpha 并反预乘，之后贴缓存——
// 抠图每帧最多做两张，避免一进战斗就卡一下。
import { SKILL_ICON } from './skillIconData';
import { registerIcons } from './icons';
import { ZHEN } from '../data/zhenfa';
type Src = HTMLImageElement | HTMLCanvasElement;
let SRC: Record<string, string> | null = null, META: Record<string, { w: number; h: number; ax?: number; ay?: number; ws?: number }> = {}, GLOW = new Set<string>();
let loading = false;
const IMG = new Map<string, HTMLImageElement>();
const READY = new Map<string, Src>();
let budget = 2, budgetFrame = -1;

function load() {
  if (SRC || loading) return; loading = true;
  // v0.54 的秘境画材（v054Data）随秘境一起撤回，不再打进包里。重开秘境时改回：
  //   Promise.all([import('./v053Data'), import('./v054Data')])，并把 V054_SRC / V054_META / V054_GLOW 合进来
  import('./v053Data').then((m) => {
    SRC = { ...m.V053_SRC }; META = { ...m.V053_META }; GLOW = new Set([...m.V053_GLOW]);
    // 技能图标：化形七形、元婴出窍；物品图标：阵盘、阵旗、材料、破禁锥、阵图
    const S = SRC;
    const sk: Record<string, string> = { yuanying: S.skill_yuanying, yingshun: S.skill_yy_blink };
    for (const f of ['long', 'feng', 'hu', 'gui', 'peng', 'qilin', 'yuan']) sk['hx_' + f] = S['form_' + f];
    for (const z of ZHEN) if (z.icon) sk['zf:' + z.id] = SKILL_ICON[z.icon] ?? S[z.icon];
    for (const k in sk) if (sk[k]) SKILL_ICON[k] = sk[k];
    const it: Record<string, string> = {
      zf_pan1: S.icon_zhenpan_1, zf_pan2: S.icon_zhenpan_2, zf_pan3: S.icon_zhenpan_3, zf_pan4: S.icon_zhenpan_4,
      zf_qi: S.icon_zhenqi_low, zf_qi2: S.icon_zhenqi_high, zf_mat_mu: S.icon_mat_qimu, zf_mat_mo: S.icon_mat_lingmo, zf_mat_yu: S.icon_mat_zhenyu, zf_zhui: S.icon_pojin_zhui,
    };
    for (const z of ['xuanwu', 'mizong', 'huichun', 'wuxing', 'gengjin']) it['zt_' + z] = S.icon_zhentu_low;
    for (const z of ['lianxi', 'wulei', 'dihuo', 'liangyi']) it['zt_' + z] = S.icon_zhentu_high;
    registerIcons(Object.fromEntries(Object.entries(it).filter(([, v]) => !!v)));
  }).catch(() => { loading = false; });
}
function frameNo() { return typeof performance !== 'undefined' ? Math.floor(performance.now() / 16) : 0; }

function keyed(im: HTMLImageElement): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings);
  if (!g) return null;
  g.drawImage(im, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    const na = Math.min(1, Math.pow(m, 0.9) * 1.08);
    if (na < 0.02) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    const sc = 1 / Math.max(m, 0.004);
    d[i] = Math.min(255, d[i] * sc); d[i + 1] = Math.min(255, d[i + 1] * sc); d[i + 2] = Math.min(255, d[i + 2] * sc);
    d[i + 3] = Math.round(na * 255);
  }
  g.putImageData(id, 0, 0);
  return c;
}

/** 取一张画材（解码、抠图完成才返回） */
export function v53(k: string): Src | null {
  const r = READY.get(k); if (r) return r;
  if (!SRC) { load(); return null; }
  let im = IMG.get(k);
  if (!im) {
    const u = SRC[k]; if (!u || typeof Image === 'undefined') return null;
    im = new Image(); im.src = u; IMG.set(k, im);
  }
  if (!im.complete || !im.naturalWidth) return null;
  if (!GLOW.has(k)) { READY.set(k, im); return im; }
  const f = frameNo(); if (f !== budgetFrame) { budgetFrame = f; budget = 2; }
  if (budget <= 0) return null;
  budget--;
  const c = keyed(im);
  if (!c) return null;
  READY.set(k, c);
  return c;
}
/** 预热：提前解码 / 抠图（进入结丹、打开阵法盘时调用） */
export function warm53(keys: string[]) { load(); for (const k of keys) v53(k); }
/** 原始数据 URL（界面 <img> 用；黑底图不适用） */
export function url53(k: string): string | undefined { if (!SRC) { load(); return undefined; } return SRC[k]; }
export function meta53(k: string) { return META[k]; }
export function loaded53() { return !!SRC; }
