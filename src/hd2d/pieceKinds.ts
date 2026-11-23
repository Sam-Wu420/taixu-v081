// 立体构件登记表。布局里一件东西的 kind 在这里登记过，就由登记的函数往 ArchBuilder 里拼网格；
// 没登记的走 buildings.ts 里原有的那套。城的构件登记在 cityPieces.ts，宗门的在 sectPieces.ts。
import type { LocLayout, Piece } from '../gfx/building';
import type { ArchBuilder, ArchPalette } from './arch';

export interface PieceCtx {
  builder: ArchBuilder; piece: Piece; layout: LocLayout;
  /** 这处地点的配色，已并上这一件自己的 p.pal */
  pal: ArchPalette;
  /** 宗门等级：3 大宗门、2 一般、1 小门派、0 不是宗门 */
  tier: number;
  /** 这一件在「地点本地坐标」里的位置（世界单位，已乘 LOC_SCALE）：x 向东、z 向南，y 是脚下的地面高度 */
  x: number; y: number; z: number;
  /** 任意一点的地面高度：传的是本地坐标（相对地点中心，世界单位） */
  groundAt(lx: number, lz: number): number;
}
export type PieceBuilder = (c: PieceCtx) => void;

export const PIECE_KINDS = new Map<string, PieceBuilder>();
export function registerPiece(kind: string, fn: PieceBuilder) { PIECE_KINDS.set(kind, fn); }
