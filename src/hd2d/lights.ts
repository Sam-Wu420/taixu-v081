// P2 光影：一帧里要照亮周围的光（灯笼、窗内灯火、主角身周、法术弹道与爆点、雷光）。
// 不给每盏灯一个真的 PointLight（城里夜里几百盏会拖垮着色器）：这里只收集位置、半径、颜色、强度，
// GLStage 在后期之前把每盏画成屏幕上的一块光斑，按场景深度还原出被照的那一点，算衰减和朝向，叠进一张半分辨率的「光照图」，
// 后期里用它去乘画面（夜里被灯照到的地面、墙面真的亮起来，而不是在上面盖一团光晕）。
//
// 坐标按 three 的约定：X = 世界 x，Y = 高度（绝对海拔），Z = 世界 y。
// 每盏 8 个数：x, y, z, 半径, r, g, b, 强度。

/** 一帧最多画多少盏：超出时按「强度 × 半径 ÷ 离镜头焦点的距离」取前面的 */
export const MAX_LIGHTS = 192;
/** 法术、爆点这类一闪而过的光另有上限：按重要度取前几盏，免得四十个敌人一起放法术时光斑铺满屏 */
export const MAX_FLASH_LIGHTS = 14;

export class LightList {
  readonly data = new Float32Array(MAX_LIGHTS * 8);
  n = 0;
  /** 候选：先全收下，帧末按分数挑 */
  private cand = new Float32Array(MAX_LIGHTS * 4 * 9);
  private nc = 0;
  private order: number[] = [];
  private fx = 0; private fz = 0;

  /** 每帧开头：清空，记下镜头焦点（用来给远处的灯降权） */
  begin(focusX: number, focusZ: number): void { this.nc = 0; this.n = 0; this.fx = focusX; this.fz = focusZ; }

  add(x: number, y: number, z: number, radius: number, r: number, g: number, b: number, intensity: number): void {
    if (!(intensity > 0.004) || !(radius > 1) || this.nc >= MAX_LIGHTS * 4) return;
    if (!Number.isFinite(x + y + z)) return;
    const o = this.nc * 9, c = this.cand;
    c[o] = x; c[o + 1] = y; c[o + 2] = z; c[o + 3] = radius; c[o + 4] = r; c[o + 5] = g; c[o + 6] = b; c[o + 7] = intensity;
    const d = Math.hypot(x - this.fx, z - this.fz);
    c[o + 8] = intensity * radius / (300 + d);
    this.nc++;
  }

  /** 帧末：按分数挑出最多 MAX_LIGHTS 盏写进 data */
  finish(): void {
    const n = this.nc, c = this.cand;
    let pick: number[];
    if (n <= MAX_LIGHTS) { pick = this.order; pick.length = 0; for (let i = 0; i < n; i++) pick.push(i); }
    else {
      pick = this.order; pick.length = 0;
      for (let i = 0; i < n; i++) pick.push(i);
      pick.sort((a, b) => c[b * 9 + 8] - c[a * 9 + 8]);
      pick.length = MAX_LIGHTS;
    }
    const D = this.data;
    for (let k = 0; k < pick.length; k++) { const o = pick[k] * 9; D.set(c.subarray(o, o + 8), k * 8); }
    this.n = pick.length;
  }
}

/** 一闪而过的光（法术命中、爆点、雷）：由 FxSys 登记，按寿命淡出；渲染器每帧把还亮着的交给 LightList */
export interface FlashLight { x: number; y: number; h: number; r: number; c: readonly [number, number, number]; i: number; t: number; life: number }
