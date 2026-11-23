// r10：地形生成的指纹——把建好的地形（陆地、深度、高程、气候、河道、道路栅格与线段、地点占地、地表高度抽样、全图缩略的像素）
// 统统做一个 SHA-256。加载分段让出线程前后各跑一次，指纹一样 = 固定种子路径上的结果逐位没变。
// 用法：npx tsx tools/check-terrain-hash.ts　（分段驱动方式和 createGame 一样：每 40 毫秒交还一次，中间真的 await 一下）
import './env';
import { createHash } from 'node:crypto';
import { Terrain } from '../src/world/terrain';
import { WORLD_W, WORLD_H } from '../src/data/world';

const h = createHash('sha256');
const put = (k: string, v: ArrayBufferView | string | undefined | null) => { h.update(k); if (v == null) h.update('null'); else if (typeof v === 'string') h.update(v); else h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); };
const t = new Terrain();
let n = 0, last = performance.now();
for (const _ of t.buildSteps()) { void _; n++; if (performance.now() - last > 40) { await new Promise((r) => setTimeout(r, 0)); last = performance.now(); } }
const T = t as unknown as Record<string, unknown>;
for (const k of ['land', 'depth', 'elev', 'arid', 'cold', 'forest', 'roadMask', 'riverMask', 'rivSegW', 'roadSegW']) put(k, T[k] as ArrayBufferView);
put('roads', JSON.stringify((T.roads as unknown[]) ?? null));
put('islands', JSON.stringify(T.islands ?? null));
put('locZones', JSON.stringify(T.locZones ?? null));
put('cityBoxes', JSON.stringify(T.cityBoxes ?? null));
// 地表高度：全图 97×97 个点抽样
const hs = new Float64Array(97 * 97);
for (let j = 0; j < 97; j++) for (let i = 0; i < 97; i++) hs[j * 97 + i] = t.surface.heightAt((i + 0.5) / 97 * WORLD_W, (j + 0.5) / 97 * WORLD_H);
put('surface', hs);
// 全图缩略：分段画，像素逐个算进去
const it = t.overviewSteps(1); let cv: HTMLCanvasElement | null = null;
for (;;) { const r = it.next(); if (r.done) { cv = r.value; break; } }
try { const d = cv!.getContext('2d')!.getImageData(0, 0, cv!.width, cv!.height).data; put('overview', d); } catch (e) { put('overview', 'n/a ' + String(e)); }
console.log(`地形指纹 ${h.digest('hex')}（分段 ${n} 步）`);
