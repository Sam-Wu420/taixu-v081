// 云存档客户端 —— 直接连本作的「万民卷宗」服务，不需要任何账号、仓库或令牌。
// 服务端只开两个口子：POST 追加一份、GET 读一份。没有删除接口，也没有改接口。
import type { Hero } from './cultivation';
import { realmName } from '../data/realms';

export interface CloudEntry {
  id: string; time: number; date: string; name: string; realm: string;
  region: string; year: number; age: number; play: string; game: string; note: string;
}
export interface CloudSnap {
  time: number; payload: string; hero: Hero; day: number; region: string; play: string; game: string; note: string;
}

const API = './api/cloud';
const CNT_KEY = 'fanren.cloud.mine';

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    let m = `服务返回 ${r.status}`;
    try { const j = await r.json(); if (j && j.error) m = j.error; } catch { /* */ }
    throw new Error(m);
  }
  return r.json() as Promise<T>;
}

/** 名册：新 → 旧 */
export async function cloudList(offset = 0, limit = 200, q = ''): Promise<{ total: number; whole: number; items: CloudEntry[] }> {
  const qs = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (q) qs.set('q', q);
  return get(`${API}/list?${qs}`);
}

export async function cloudStats(): Promise<number> {
  try { return (await get<{ total: number }>(`${API}/stats`)).total; } catch { return 0; }
}

/** 存一份。只写，不覆盖任何东西。 */
export async function cloudSave(snap: CloudSnap): Promise<{ id: string; no: number }> {
  const realm = realmName(snap.hero.realm, snap.hero.stage);
  const data = await packSave(snap.payload);
  const body = {
    time: snap.time,
    meta: {
      name: snap.hero.name || '苏寒', realm, region: snap.region,
      age: Math.floor(snap.hero.age), year: Math.floor(snap.day / 360) + 1,
      play: snap.play, game: snap.game, note: snap.note,
    },
    data,
  };
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let m = `服务返回 ${r.status}`;
    try { const j = await r.json(); if (j && j.error) m = j.error; } catch { /* */ }
    throw new Error(m);
  }
  const j = (await r.json()) as { id: string; no: number };
  markMine(j.id);
  return { id: j.id, no: j.no };
}

/** 取回一份 */
export async function cloudRead(id: string): Promise<{ time: number; meta: any; raw: string }> {
  const j = await get<{ time: number; meta: any; data: string }>(`${API}/one?id=${encodeURIComponent(id)}`);
  return { time: j.time, meta: j.meta, raw: await unpackSave(j.data) };
}

export function mineVersions(): string[] {
  try { return JSON.parse(localStorage.getItem(CNT_KEY) || '[]'); } catch { return []; }
}
function markMine(id: string) {
  try {
    const a = mineVersions();
    a.push(id);
    localStorage.setItem(CNT_KEY, JSON.stringify(a.slice(-50)));
  } catch { /* */ }
}

// ---------------------------------------------------------------- 压缩
export async function packSave(raw: string): Promise<string> {
  return 'gz1:' + await b64gzip(raw);
}
export async function unpackSave(body: string): Promise<string> {
  if (body.startsWith('gz1:')) return gunzipB64(body.slice(4));
  return body;
}
async function b64gzip(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const cs = (globalThis as any).CompressionStream;
  if (!cs) return 'b64:' + btoa(unescape(encodeURIComponent(s)));
  const stream = new Blob([bytes]).stream().pipeThrough(new cs('gzip'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let out = '';
  for (let i = 0; i < buf.length; i += 0x8000) out += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(out);
}
async function gunzipB64(s: string): Promise<string> {
  if (s.startsWith('b64:')) return decodeURIComponent(escape(atob(s.slice(4))));
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const ds = (globalThis as any).DecompressionStream;
  if (!ds) throw new Error('这台设备不支持解压');
  const stream = new Blob([buf]).stream().pipeThrough(new ds('gzip'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
