// 云端模组平台的客户端：浏览 / 搜索 / 下载安装（接口见 platform/README.md）
import type { ModBundle } from './types';
import { validateBundle, cmpVersion, MOD_MAX_BYTES } from './validate';
import { modStore } from './store';

export interface StoreMod {
  id: string; name: string; version: string; author: string; desc: string; tags: string[];
  downloads: number; rating: number; ratings: number; updated: number; size: number; icon: boolean; unsafe?: boolean;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) { let msg = `${r.status}`; try { msg = (await r.json()).error ?? msg; } catch { /* */ } throw new Error(msg); }
  return r.json() as Promise<T>;
}

/**
 * 平台地址 + 接口路径。地址里带的查询参数（有些托管服务要 ?sharecode=… 才放行）原样带到每个请求上；
 * 地址末尾的 /、#/ 之类去掉。
 */
export function apiUrl(base: string, path: string, q: Record<string, string | number> = {}) {
  let u: URL;
  try { u = new URL(base.trim()); } catch { throw new Error('模组平台地址写法不对（要以 http:// 或 https:// 开头）'); }
  const root = u.origin + u.pathname.replace(/\/+$/, '');
  const sp = new URLSearchParams(u.search);
  for (const [k, v] of Object.entries(q)) sp.set(k, String(v));
  const qs = sp.toString();
  return root + path + (qs ? '?' + qs : '');
}

export const modClient = {
  async list(base: string, q = '', sort: 'downloads' | 'new' | 'rating' = 'downloads', page = 0): Promise<{ mods: StoreMod[]; total: number }> {
    if (!base) throw new Error('还没填模组平台的地址');
    return getJson(apiUrl(base, '/api/mods', { q, sort, page }));
  },
  iconUrl(base: string, id: string) { return apiUrl(base, `/api/mods/${encodeURIComponent(id)}/icon`); },
  /** 下载并安装（同 id 旧版本会被替换），默认装好即启用 */
  async install(base: string, id: string, enable = true): Promise<ModBundle> {
    const b = await getJson<ModBundle>(apiUrl(base, `/api/mods/${encodeURIComponent(id)}/download`));
    return this.add(b, enable);
  },
  /** 从本地文件导入（.fmod） */
  async importText(text: string, enable = true): Promise<ModBundle> {
    if (text.length > MOD_MAX_BYTES) throw new Error('模组包太大（上限 20MB）');
    let b: unknown;
    try { b = JSON.parse(text); } catch { throw new Error('不是有效的模组包（.fmod）'); }
    return this.add(b as ModBundle, enable);
  },
  async add(b: ModBundle, enable: boolean): Promise<ModBundle> {
    const err = validateBundle(b); if (err) throw new Error(err);
    await modStore.put(b);
    // 高级权限模组不自动启用：要玩家在面板里点「启用」、看过警告再说（更新后同样要重新确认）
    const ask = b.manifest.unsafe && modStore.unsafeOk()[b.manifest.id] !== b.manifest.version;
    const e = modStore.enabled();
    if (ask) { delete e[b.manifest.id]; modStore.setEnabled(e); }
    else if (enable) { e[b.manifest.id] = true; modStore.setEnabled(e); }
    return b;
  },
  /** 本地已装版本比平台旧？ */
  outdated(local: string | undefined, remote: string) { return !!local && cmpVersion(remote, local) > 0; },
};
