// 收官 H3：界面上 HUD 占着的屏幕矩形（CSS 像素，相对游戏画布左上角）。
// GameView 每隔一会儿量一次各区（人物牌、任务列、顶栏堆叠、小地图……）写进来；画在画布上的东西（摊主招牌）读它来避让，
// 以前手机上摊主招牌常被顶部横幅、人物牌盖住，招牌自己却以为那里是空的。
// 放在 core：world/ 读它不用反过来依赖 ui/。
// 第五轮：量得更细——不再整区一块，而是区里真画了东西的那几块（漆牌、按钮、格子）；soft = 只显示不接点击（消息、地名横幅），
// 招牌压在它底下照样点得到（招牌优先躲开不 soft 的那些）。
export interface HudRect { x0: number; y0: number; x1: number; y1: number; soft?: boolean }
export const hudRects: HudRect[] = [];
export function setHudRects(list: HudRect[]): void { hudRects.length = 0; for (const r of list) hudRects.push(r); }
