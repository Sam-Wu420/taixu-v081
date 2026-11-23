// HD2D：UI 画布上「跟着人走」的东西（血条、名牌、伤害数字、法术关键图）怎么定位。
// 原 2D 用一个世界变换画全部；HD2D 下地面经过倾斜 / 旋转，整体套一个仿射会把字也压扁、转斜。
// 改为逐项锚定：把该项的地面锚点投到屏幕，再以屏幕正立、原比例画出（相对锚点的偏移 = 原 2D 的世界偏移 × 缩放）。
// 贴地的东西（阵法圈）用 ground：直接套地面的透视仿射，真正贴在倾斜的地面上。
// 方向（弹体朝向）用 dir：把世界里的速度方向投到屏幕上再取角度。
// 2D 模式下三者都为 null，调用处照原样画。
export const hdUi: {
  at: ((g: CanvasRenderingContext2D, x: number, y: number) => void) | null;
  ground: ((g: CanvasRenderingContext2D, x: number, y: number) => void) | null;
  dir: ((vx: number, vy: number) => number) | null;
} = { at: null, ground: null, dir: null };

/** 本帧是否有真实投影（阴影图生效）。为真时人物脚下的椭圆假影子不再画，免得出现两重影子 */
export const hdShadows = { active: false };