import type { BeastLook, BeastAnim } from './beast';
type G = CanvasRenderingContext2D;
type RGB = [number, number, number];
export declare function toad(g: G, L: BeastLook, col: RGB, A: BeastAnim): void;
export declare function ant(g: G, L: BeastLook, col: RGB, A: BeastAnim): void;
export declare function mantis(g: G, L: BeastLook, col: RGB, A: BeastAnim): void;
export declare function corpse(g: G, L: BeastLook, col: RGB, A: BeastAnim): void;
export declare function yaksha(g: G, L: BeastLook, col: RGB, A: BeastAnim): void;
export declare function demon(g: G, L: BeastLook, col: RGB, A: BeastAnim): void;
/** 狮禽兽等四足兽的羽翼（quad 内调用） */
export declare function quadWing(g: G, L: BeastLook, col: RGB, A: BeastAnim, x: number, y: number, far: boolean): void;
export {};
