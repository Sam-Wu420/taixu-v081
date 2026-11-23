// HD2D 立板的绘制范围（相对脚底，世界单位；上为负）。宁大勿小：格子大一点只多占图集，小了会把画面裁掉。
export type Box = readonly [number, number, number, number];

/** 人形（drawCharacter）：宽袖、发冠、长兵器、头顶名牌都在里面；lift = 御器离地高度 */
export function charBox(scale = 1, lift = 0): Box { return [-170 * scale, 170 * scale, -330 * scale - lift, 70 * scale]; }
/** 妖兽：按外形大小放大 */
export function beastBox(size = 1, lift = 0): Box { return [-240 * size, 240 * size, -330 * size - lift, 80 * size]; }

export const hdBox = {
  mountain: (w: number, h: number): Box => [-w * 0.62, w * 0.62, -h * 1.25, h * 0.25],
  tree: (w: number, h: number): Box => [-w * 0.75, w * 0.75, -h * 1.2, h * 0.18 + 10],
  fall: (w: number, h: number): Box => [-w, w, -h - 120, w * 0.4],
  deco: (w: number, h: number): Box => [-w / 2 - 6, w / 2 + 6, -h - 6, 6],
  building: (w: number, h: number): Box => [-w * 0.62, w * 0.62, -h - 90, h * 0.3 + 30],
  wall: (len: number, hh: number): Box => [-len / 2 - 24, len / 2 + 24, -hh - 70, 50],
  piece: (zs: number): Box => [-340 * zs, 340 * zs, -860 * zs, 90 * zs],
  flag: [-70, 70, -280, 24] as Box,
  node: [-50, 50, -100, 24] as Box,
};
