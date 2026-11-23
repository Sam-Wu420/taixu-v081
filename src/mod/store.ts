// 本地模组库：模组包存在浏览器的 IndexedDB 里（桌面版同样如此），启用名单存在 localStorage。
// 没有 IndexedDB 的环境（Node 测试）退回内存。
import type { ModBundle } from './types';

const DB = 'taixu-mods', OS = 'bundles', EN_KEY = 'taixu.mods.enabled', STORE_KEY = 'taixu.mods.store', UNSAFE_KEY = 'taixu.mods.unsafe';
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
  /**
   * 随包附带的模组（桌面版 / 安卓版打包时放进 bundled-mods/）：页面旁边有 bundled-mods/index.json 就照单装上并启用。
   * 每个模组的每个版本只「种」一次（记在 taixu.mods.bundled）：玩家之后自己停用、卸载、换版本，都不会被改回来；
   * 已装的版本比随包的新也不动。开发服务器和网页版没有这个文件，什么都不做。
   */
  async seedBundled(): Promise<void> {
    if (typeof fetch === 'undefined' || typeof document === 'undefined') return;
    let list: unknown;
    try {
      const r = await fetch(new URL('bundled-mods/index.json', document.baseURI).href, { cache: 'no-store' });
      if (!r.ok || !/json/i.test(r.headers.get('content-type') ?? 'json')) return;
      list = await r.json();
    } catch { return; }
    if (!Array.isArray(list)) return;
    let seen: Record<string, string> = {};
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') ?? {}; } catch { /* */ }
    const en = this.enabled();
    for (const m of list as { id?: string; version?: string; file?: string }[]) {
      if (!m?.id || !m.version || !m.file || seen[m.id] === m.version) continue;
      try {
        const cur = await this.get(m.id);
        if (cur && verCmp(cur.manifest.version, m.version) > 0) { seen[m.id] = m.version; continue; }
        const r = await fetch(new URL(`bundled-mods/${m.file}`, document.baseURI).href, { cache: 'no-store' });
        if (!r.ok) continue;
        const b = await r.json() as ModBundle;
        if (b?.manifest?.id !== m.id) continue;
        await this.put(b);
        en[m.id] = true;
        if (b.manifest.unsafe) this.setUnsafeOk(m.id, b.manifest.version);
        seen[m.id] = m.version;
      } catch { /* 这一个没装上，下次启动再试 */ }
    }
    this.setEnabled(en);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* */ }
  },
};
const SEEN_KEY = 'taixu.mods.bundled';
/** 版本号比较（1.10.0 > 1.9.3） */
function verCmp(a: string, b: string): number {
  const x = a.split('.').map((s) => parseInt(s, 10) || 0), y = b.split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}
