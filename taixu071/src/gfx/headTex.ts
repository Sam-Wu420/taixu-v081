// 旧头部贴图接口保留以兼容已有角色数据；所有角色统一使用人物引擎程序绘制。
export type HeadView = 'front' | 'q' | 'side' | 'qb' | 'back';
interface HeadImg { mips: HTMLCanvasElement[]; w: number; h: number; neckX: number; topY: number }
export function loadHeadTex() { /* 不再加载原版图片 */ }
export function headTex(_name:string, _view:HeadView, _targetH:number):{src:HTMLCanvasElement;img:HeadImg}|null { return null; }
export function headTexReady(_name:string) { return false; }
