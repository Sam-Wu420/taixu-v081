// 别界的生成必须处处一样：同一界在 Node、各版本的浏览器里，地点的名字、坐标都得相同，否则存档会错位。
// 这里把前 40 界的地点（id、名字、类型、坐标）和山河轮廓做一个指纹，和记下的值比。
// 改了别界的生成规则、确实要换一套世界时，用 UPDATE=1 跑一遍，把打印的新指纹抄进 EXPECT（并在提交说明里写明旧存档的别界会变）。
// 浏览器里的核对：tools/edge-shot.mjs 进 realm-3 后读 window.__taixuLocs()（第五轮报告里做过，和这里一致）。
import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const W = await import('../src/data/world');
await import('../src/data/zhujie');
// 2026-11-14：合并城池第四轮后重记（别界按种子撒的城压在海边湖边时挪到近旁的整块陆地、城与城彼此推开，地点坐标变了）
const EXPECT = '296c19afed829f31df01676e324f6859c7e12f04';
const h = createHash('sha1');
let n = 0;
for (let i = 1; i <= 40; i++) {
  const id = `realm-${i}` as never;
  if (!W.setActiveMap(id)) continue;
  for (const l of W.LOCATIONS) { h.update(`${l.id}|${l.name}|${l.type}|${l.x.toFixed(3)}|${l.y.toFixed(3)};`); n++; }
  h.update(JSON.stringify(W.MAINLAND).slice(0, 4000));
}
const got = h.digest('hex');
if (process.env.UPDATE) console.log('新指纹', got);
assert.equal(got, EXPECT, `别界的生成变了（${n} 处地点）：指纹 ${got}`);
console.log(`PASS 别界生成可复现：前 40 界 ${n} 处地点、山河轮廓的指纹一致`);
