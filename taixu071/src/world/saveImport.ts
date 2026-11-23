import { ALL_MAP_IDS, WORLD_SCALE } from '../data/world';
import { renameText } from '../data/rename';
import { validateSaveForLoad } from './saveGuard';
import { zipSave } from './savezip';

export type ImportResult = 'ok' | 'invalid' | 'storage' | 'load' | 'rollbackFailed';
type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** 先预检，再写入并读档。失败时尽力恢复原档；不保证运行态事务回滚。 */
export function importRawSave(raw: string, key: string, storage: SaveStorage, load: (key: string) => boolean): ImportResult {
  let zipped: string;
  try {
    if (typeof raw !== 'string') return 'invalid';
    validateSaveForLoad(JSON.parse(renameText(raw)), ALL_MAP_IDS, WORLD_SCALE);
    zipped = zipSave(raw);
  } catch { return 'invalid'; }
  let old: string | null;
  try { old = storage.getItem(key); storage.setItem(key, zipped); } catch { return 'storage'; }
  try { if (load(key)) return 'ok'; } catch { /* 后续系统可能抛错，尽力还原目标档位 */ }
  try { if (old === null) storage.removeItem(key); else storage.setItem(key, old); }
  catch { return 'rollbackFailed'; }
  return 'load';
}
export function importErrorText(result: Exclude<ImportResult, 'ok'>): string {
  switch (result) {
    case 'invalid': return '存档内容损坏或关键数据无效，未覆盖存档三。';
    case 'storage': return '无法写入本地存档，请检查存储权限和容量。';
    case 'load': return '载入失败，已尝试恢复原存档三；当前运行状态可能已改变，请重新加载页面。';
    case 'rollbackFailed': return '载入失败且无法恢复存档三，请勿继续保存；使用备份恢复。';
  }
}
