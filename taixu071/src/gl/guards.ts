// 护盾类光效（玩家法器盾 / 敌人护体罩 / 敌人格挡）统一到这里画。
// 以前这三处各写一套「Glow + RingSoft + Ring + KBubble + 六枚符印」，
// 结果调亮度要改三个文件、三套参数还容易改漏。
// 现在：亮度全部集中在 GUARD 表里，绘制只有一个 drawGuardShell；各处的差异（半径、
// 颜色、呼吸、显形度、符印数量/尺寸）都作为参数显式传进来，函数本身不替调用方做决定。
import { C } from './atlas';
import type { FxSys } from './fx';

type RGB = [number, number, number];

/** 护盾类光效的亮度表：以后调亮/调暗只改这里 */
export const GUARD = {
  // 玩家法器盾（受击 blockT 驱动）
  shieldGlow: (k: number, bt: number) => 0.10 + 0.05 * k + bt * 0.06,
  shieldRing: (k: number, bt: number) => 0.05 + 0.03 * k + bt * 0.05,
  shieldSeal: (bt: number) => (bt - 0.85) * 0.9,
  // 敌人护体灵光罩（剩余 k + 受击闪 flash + 呼吸 pul）
  wardShellGlow: (k: number) => 0.03 + 0.03 * k,
  wardRing: (k: number, flash: number, pul: number) => (0.10 + 0.10 * k) * pul + flash * 0.5,
  wardEdge: (k: number, flash: number) => 0.08 * k + flash * 0.45,
  wardBubble: (k: number, flash: number, pul: number) => (0.07 + 0.05 * k) * pul + flash * 0.4,
  wardSeal: (k: number, flash: number) => 0.15 * k + flash * 0.5,
  // 敌人格挡（guardT 驱动）
  guardRing: (k: number) => 0.18 * k,
  guardShellGlow: (k: number) => 0.06 * k,
  guardSeal: (k: number) => 0.25 * k,
} as const;

export interface ShellOpts {
  /** 主体中心（环 / 边 / 泡壳 / 绕行符印都以它为中心） */
  x: number; y: number;
  color: RGB;
  /** 显形度（敌人隐身/半隐时 <1），会乘到所有层上 */
  vis?: number;
  /** 径向底光 F.glow（中心可以不在 x,y，例如玩家法器盾的底光跟着盾牌本体走） */
  glowAt?: { x: number; y: number; r: number; a: number } | null;
  /** C.Glow 贴图底光（按宽高拉伸，各方的尺寸不同） */
  shellGlow?: { w: number; h: number; a: number; c?: RGB } | null;
  soft?: { w: number; h: number; a: number; c?: RGB } | null;      // C.RingSoft 主罩
  edge?: { w: number; h: number; a: number; c?: RGB } | null;      // C.Ring 白边
  bubble?: { w: number; h: number; rot: number; a: number; c?: RGB } | null;   // C.KBubble 泡壳
  /** 绕行符印（n 枚，椭圆轨道 rx/ry） */
  seals?: { n: number; size: number; rx: number; ry: number; spin: number; a: number; cell?: number; w?: number; c?: RGB } | null;
  /** 单枚符印（玩家盾挡格瞬间那一下） */
  seal1?: { x: number; y: number; size: number; rot: number; a: number; c?: RGB } | null;
}

export function drawGuardShell(F: FxSys, o: ShellOpts) {
  const vis = o.vis ?? 1;
  const A = (v: number) => v * vis;
  if (o.glowAt) F.glow(o.glowAt.x, o.glowAt.y, o.glowAt.r, o.color, A(o.glowAt.a));
  if (o.shellGlow) F.sprite(C.Glow, o.x, o.y, o.shellGlow.w, o.shellGlow.h, 0, o.shellGlow.c ?? o.color, A(o.shellGlow.a));
  if (o.soft) F.sprite(C.RingSoft, o.x, o.y, o.soft.w, o.soft.h, 0, o.soft.c ?? o.color, A(o.soft.a));
  if (o.edge) F.sprite(C.Ring, o.x, o.y, o.edge.w, o.edge.h, 0, o.edge.c ?? WHITE, A(o.edge.a));
  if (o.bubble) F.sprite(C.KBubble, o.x, o.y, o.bubble.w, o.bubble.h, o.bubble.rot, o.bubble.c ?? o.color, A(o.bubble.a));
  if (o.seal1) F.sprite(C.Seal, o.seal1.x, o.seal1.y, o.seal1.size, o.seal1.size, o.seal1.rot, o.seal1.c ?? o.color, A(o.seal1.a));
  if (o.seals) {
    const s = o.seals;
    for (let i = 0; i < s.n; i++) {
      const a = i / s.n * Math.PI * 2 + s.spin;
      F.sprite(s.cell ?? C.Seal, o.x + Math.cos(a) * s.rx, o.y + Math.sin(a) * s.ry, s.w ?? s.size, s.size, a, s.c ?? o.color, A(s.a));
    }
  }
}

const WHITE: RGB = [1, 1, 1];
