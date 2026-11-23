// 收官 H3：左侧任务列的「插槽」——第四轮的新手引导（「下一步」）、以后别的系统要往任务列里塞一条，都走这里，
// 不用再去 GameView 里加一个绝对定位的框（那正是以前主线目标、宗门任务、模组任务互相压的原因）。
//
// 用法：
//   import { setQuestEntries } from '../ui/questSlot';
//   setQuestEntries('guide', [{ key: 'next', kind: 'guide', title: '下一步：去坊市买一张传音符', text: '梁京东市', onClick: () => … }]);
//   setQuestEntries('guide', null);   // 撤掉自己那一组
// 任务列按 order（小的在上）排：引导默认 -10（最上面），主线 0，宗门 10，模组 20。
import { useSyncExternalStore } from 'react';

export interface QuestEntry {
  /** 组内唯一 */
  key: string;
  /** 'guide' 新手引导 / 'main' / 'sect' / 'mod' / 其它：决定左边那道色条 */
  kind: string;
  title: string;
  text?: string;
  /** 右侧小字（如 2/5） */
  progress?: string;
  /** 点一下（指路、打开面板……）；不给就不可点 */
  onClick?: () => void;
  order?: number;
}

const groups = new Map<string, QuestEntry[]>();
let snapshot: QuestEntry[] = [];
const subs = new Set<() => void>();
const ORDER: Record<string, number> = { guide: -10, main: 0, sect: 10, mod: 20 };

/** 设置（覆盖）某一组条目；传 null 撤掉这一组 */
export function setQuestEntries(owner: string, entries: QuestEntry[] | null): void {
  if (!entries || !entries.length) groups.delete(owner); else groups.set(owner, entries.map((e) => ({ ...e })));
  snapshot = [...groups.values()].flat().sort((a, b) => (a.order ?? ORDER[a.kind] ?? 30) - (b.order ?? ORDER[b.kind] ?? 30));
  for (const f of [...subs]) f();
}
export function getQuestEntries(): QuestEntry[] { return snapshot; }
export function useQuestEntries(): QuestEntry[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getQuestEntries, getQuestEntries);
}
