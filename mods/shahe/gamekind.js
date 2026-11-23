// 1.4.0：认这是哪一个游戏——太虚问道录（v0.8 起：存档键 taixu_save_*、设置键 taixu.*、名字改成原创的）
// 还是凡人修仙传（原版 v0.57 / B 版：fanren_*）。v0.8.1 起游戏直接告诉模组（api.gameId）；更早的版本按网页标题、本机存档推断。
export function gameKind(api) {
  try { if (api && api.gameId) return api.gameId === 'taixu' ? 'taixu' : 'fanren'; } catch { /* */ }
  let title = '';
  try { title = typeof document !== 'undefined' ? document.title || '' : ''; } catch { /* */ }
  if (/太虚/.test(title)) return 'taixu';
  if (/凡人/.test(title)) return 'fanren';
  try { if (typeof localStorage !== 'undefined') for (let i = 0; i < localStorage.length; i++) if (/^taixu[._-]/.test(localStorage.key(i) || '')) return 'taixu'; } catch { /* */ }
  return 'fanren';
}
