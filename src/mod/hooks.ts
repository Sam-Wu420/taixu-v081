// v0.56：游戏本体里给模组留的接入点。游戏代码只认这里的 modx（由 mod/host 挂上），不直接依赖模组宿主。
// 没有模组时 modx 为 null，所有接入点都是一次空判断。
import type { LocDef } from '../data/world';
import type { DNode, DOpt } from '../world/modal';
import type { Drawable } from '../world/life';

export interface ModTownFac { seal: string; name: string; desc: string; act: () => void; cls?: string }
export interface ModHudButton { key: string; glyph: string; label: string; badge: number; go: () => void }
export interface ModQuestRow { key: string; mod: string; title: string; text?: string; have?: number; need?: number; x?: number; y?: number; done?: boolean }

export interface ModBridge {
  /** 模组地点能否「进入」 */
  canEnter(l: LocDef): boolean;
  /** 打开模组的险地 / 秘地（返回 true 表示已处理，不再开城镇面板）；同时发 enter 事件 */
  openLoc(l: LocDef): boolean;
  /** 城镇面板里模组加的事务 */
  townFacs(l: LocDef): ModTownFac[];
  /** NPC 交谈：模组 NPC 的专属开场（null 走寻常交谈） */
  npcTalk(npcId: string, look: unknown, main: () => DNode): DNode | null | false;
  /** NPC 交谈菜单里模组加的选项 */
  talkOpts(npcId: string, look: unknown, title: string, back: () => DNode): DOpt[];
  /** 模组 NPC 的招呼语 */
  greet(npcId: string): string | null;
  /** 模组 NPC 能否收徒 */
  apprentice(npcId: string): boolean;
  /** 世界层：把模组的绘制排进 Y 排序列表 */
  collect(list: Drawable[]): void;
  /** 有模组在画会动的东西（渲染器别跳帧） */
  readonly animating: boolean;
  /** 右下角按钮 */
  buttons(): ModHudButton[];
  /** 任务栏 */
  quests(): ModQuestRow[];
  /** 快捷键：返回 true 表示被模组用了 */
  key(k: string): boolean;
  // ---------------- v0.57：前置钩子（发生之前交给模组改，或取消）
  /** 有模组挂了这个钩子吗（没有就别构造上下文，省事） */
  has(name: string): boolean;
  /** 依次交给各模组修改 ctx；模组可写 ctx.cancel = true 取消 */
  fire<T extends object>(name: string, ctx: T): T & { cancel?: boolean };
  /** 原版对话弹出前交给模组改（返回 null = 取消） */
  dialogHook(node: DNode): DNode | null;
  /** 物品：模组定义了用法 → 已处理返回 true */
  useItem(id: string): boolean;
  /** 这件物品有模组定义的用法（储物袋里显示「使用」） */
  canUse(id: string): boolean;
  /** 法术施放 / 命中时的模组回调 */
  artCast(id: string, at: { x: number; y: number; tx: number; ty: number; target: unknown }): void;
  artHit(id: string, e: unknown, dmg: number): void;
  /** 配乐场景：模组接管了这个场景（在放自己的曲子）返回 true */
  musicFor(state: string): boolean;
  /** 音效：模组替换或静音了这个音效返回 true */
  sfxFor(name: string, o: { x?: number; y?: number; vol?: number }): boolean;
  readonly sfxOverride: boolean;
  /** 原版面板里模组加的段落；模组替换掉的面板 */
  panelSlot(panelId: string): { key: string; title: string; nodes: unknown[] }[];
  replacePanel(panelId: string): { mod: string; panel: string } | null;
  /** 屏幕层 HUD */
  huds(): { key: string; pos: string; nodes: unknown[] }[];
  /** 模组面板：取标题与内容（每次刷新都调） */
  panel(mod: string, id: string): { title: string; sub?: string; nodes: unknown[] } | null;
}

export let modx: ModBridge | null = null;
export function setModx(b: ModBridge | null) { modx = b; }
