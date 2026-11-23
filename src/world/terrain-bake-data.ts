type P = [number, number];
export interface FieldSite { id: string; type: string; x: number; y: number; look?: string }
/** 这张图的坐标比大陆坐标多出 (dx, dy)；n / s / e / w 是四条边外各有多深的交界地带（0＝那条边不通） */
export interface SeamFrame { dx: number; dy: number; n: number; s: number; e: number; w: number;
  /** 不通的那几条边外铺多宽的海（世界单位）：图边那一行的地貌在这一段里揉着化成深海，不在图边上截成一条直线 */
  ocean?: number;
  /**
   * 每条通着的边对面那张图沿着这条边的范围（本图的宏观坐标；n / s 是东西向的 [x0, x1]，e / w 是南北向的 [y0, y1]）。
   * 交界地带是一条地峡：从本图这条边的宽度渐渐收到对面那条边的宽度，两侧越过去就揉着化成海——两边算的是同一个梯形
   */
  span?: Partial<Record<'n' | 's' | 'e' | 'w', [number, number]>> }
export interface TerrainBakeData {
  W: number;
  H: number;
  land: Float32Array;
  elev: Float32Array;
  arid: Float32Array;
  cold: Float32Array;
  forest: Float32Array;
  depth: Float32Array;
  roadMask: Uint8Array;
  roadSegW: Float32Array;
  rivers: { pts: P[]; w: number }[];
  roads: { pts: P[]; major: boolean }[];
  zoneById: Map<string, { rx: number; ry: number }>;
  fieldSites: readonly FieldSite[];
  /** 图外的交界地带（没有就是 null） */
  seam: SeamFrame | null;
  /** 整张图的色调（没有就是 null） */
  tint: { land: [number, number, number]; sea: [number, number, number]; k: number } | null;
  /** P10：占山的大宗门（台地铺石板），见 world/sectGround.ts */
  grandSects: import('./sectGround').GrandSectGround[];
}
