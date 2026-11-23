// 对话立绘：v0.71 起一律走人物引擎（ModalLayer 里的 Bust）或模组内嵌图。
// 原先那套「原名 → public/art/npc|gen/*.webp」的 AI 立绘已随素材清理一并移除
// （2026-11 审计：portraitFor 早已只认 data: URL，npcPortrait/genericFor 没有任何调用方，
//  176 张 public/art 图片每份构建都白带 9.3MB）。图仍在 git 历史里。
import type { DNode } from '../world/modal';

/** 对话框要显示的立绘：只认模组显式内嵌的 data URL；原版对话用人物引擎的 look 或文字印章 */
export function portraitFor(node: DNode, _npcs?: unknown): string | undefined {
  return typeof node.portrait === 'string' && node.portrait.startsWith('data:image/') ? node.portrait : undefined;
}
