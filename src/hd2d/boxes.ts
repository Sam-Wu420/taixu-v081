// HD2D 立板的绘制范围（相对脚底，世界单位；上为负）。宁大勿小：格子大一点只多占图集，小了会把画面裁掉。
export type Box = readonly [number, number, number, number];

/** 人形（drawCharacter）：宽袖、发冠、长兵器、头顶名牌都在里面；lift = 御器离地高度 */
export function charBox(scale = 1, lift = 0): Box { return [-170 * scale, 170 * scale, -330 * scale - lift, 70 * scale]; }
/** 妖兽：按外形大小放大 */
export function beastBox(size = 1, lift = 0): Box { return [-240 * size, 240 * size, -330 * size - lift, 80 * size]; }

// GC 优化：同类装饰物 w/h 往往相同（同一种树、同一种山），缓存结果避免每帧重复创建数组
function cachedBox(fn: (a: number, b: number) => Box): (a: number, b: number) => Box {
  const cache = new Map<string, Box>();
  return (a: number, b: number) => {
    // 量化到整数，同种装饰物的 w/h 一致就能命中
    const key = (Math.round(a) * 10000 + Math.round(b)) | 0;
    let v = cache.get(String(key));
    if (!v) { v = fn(a, b); cache.set(String(key), v); if (cache.size > 200) cache.clear(); }
    return v;
  };
}

export const hdBox = {
  mountain: cachedBox((w: number, h: number): Box => [-w * 0.62, w * 0.62, -h * 1.25, h * 0.25]),
  tree: cachedBox((w: number, h: number): Box => [-w * 0.75, w * 0.75, -h * 1.2, h * 0.18 + 10]),
  fall: cachedBox((w: number, h: number): Box => [-w, w, -h - 120, w * 0.4]),
  deco: cachedBox((w: number, h: number): Box => [-w / 2 - 6, w / 2 + 6, -h - 6, 6]),
  building: cachedBox((w: number, h: number): Box => [-w * 0.62, w * 0.62, -h - 90, h * 0.3 + 30]),
  wall: cachedBox((len: number, hh: number): Box => [-len / 2 - 24, len / 2 + 24, -hh - 70, 50]),
  piece: (zs: number): Box => [-340 * zs, 340 * zs, -860 * zs, 90 * zs],
  flag: [-70, 70, -280, 24] as Box,
  node: [-50, 50, -100, 24] as Box,
};
