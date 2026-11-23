// 本地模组库：模组包存在浏览器的 IndexedDB 里（桌面版同样如此），启用名单存在 localStorage。
// 没有 IndexedDB 的环境（Node 测试）退回内存。
import type { ModBundle } from './types';

const DB = 'fanren-mods', OS = 'bundles', EN_KEY = 'fanren.mods.enabled', STORE_KEY = 'fanren.mods.store', UNSAFE_KEY = 'fanren.mods.unsafe';
const mem = new Map<string, ModBundle>();

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(OS)) r.result.createObjectStore(OS); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((res) => {
    if (!db) { res(undefined); return; }
    try {
      const t = db.transaction(OS, mode), q = f(t.objectStore(OS));
      q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
    } catch { res(undefined); }
  }));
}

export const modStore = {
  async list(): Promise<ModBundle[]> {
    const all = await tx<ModBundle[]>('readonly', (s) => s.getAll() as IDBRequest<ModBundle[]>);
    return all ?? [...mem.values()];
  },
  async get(id: string): Promise<ModBundle | undefined> {
    return (await tx<ModBundle>('readonly', (s) => s.get(id) as IDBRequest<ModBundle>)) ?? mem.get(id);
  },
  async put(b: ModBundle) { mem.set(b.manifest.id, b); await tx('readwrite', (s) => s.put(b, b.manifest.id)); },
  async remove(id: string) { mem.delete(id); await tx('readwrite', (s) => s.delete(id)); const e = this.enabled(); delete e[id]; this.setEnabled(e); },
  enabled(): Record<string, boolean> { try { return JSON.parse(localStorage.getItem(EN_KEY) ?? '{}') ?? {}; } catch { return {}; } },
  setEnabled(e: Record<string, boolean>) { try { localStorage.setItem(EN_KEY, JSON.stringify(e)); } catch { /* */ } },
  /** 玩家确认过「高级权限」的模组（id → 确认时的版本；模组更新后要重新确认） */
  unsafeOk(): Record<string, string> { try { return JSON.parse(localStorage.getItem(UNSAFE_KEY) ?? '{}') ?? {}; } catch { return {}; } },
  setUnsafeOk(id: string, ver: string | null) { const o = this.unsafeOk(); if (ver) o[id] = ver; else delete o[id]; try { localStorage.setItem(UNSAFE_KEY, JSON.stringify(o)); } catch { /* */ } },
  /** 云端模组平台的地址（可在模组面板里改；打包时也可用 VITE_MOD_STORE 预置） */
  storeUrl(): string {
    try { const v = localStorage.getItem(STORE_KEY); if (v) return v; } catch { /* */ }
    return ((import.meta as any).env?.VITE_MOD_STORE as string | undefined) ?? '';
  },
  setStoreUrl(u: string) { try { localStorage.setItem(STORE_KEY, u.trim().replace(/#.*$/, '').replace(/\/+$/, '')); } catch { /* */ } },
};
