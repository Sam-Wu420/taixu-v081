// P11 总账（world/econ.ts、Wanbao.regulate）：快进二十五年，修士人均灵石留在开局水平的 0.67–1.5 倍之间、调节读数不出范围、
// 凡人不再只攒不花、修士人数不再被凡人挤掉（补员按修士 / 凡人各自补）。百年的完整版见 tools/sim-economy.ts。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
let s0 = 7; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const E = await import('../src/world/econ');
const g = await G.createGame(() => {}); g.reset();
const W = g.wanbao;
E.ECON.on = true; E.ECON.f = {};
const heads = () => { let c = 0, m = 0, mw = 0; for (const d of g.npcs.list) if (d.alive && !d.canon) { if (d.faction === 'mortal') { m++; mw += d.wealth; } else if (d.realm >= 1) c++; } return { c, m, mw: mw / Math.max(1, m) }; };
const h0 = heads();
const per: number[] = [];
for (let mo = 0; mo < 25 * 12; mo++) {
  for (let d = 0; d < 30; d += 10) { g.day += 10; g.npcs.daily(10); W.daily(); g.fellows.daily(); }
  per.push(E.moneySupply(g).perHead);
}
const base = per[11], ratios = per.slice(12).map((v) => v / base), e = W.S.econ!;
assert.ok(e && e.base > 0, '总账记下了开局的基准');
assert.ok(Math.min(...ratios) >= 0.5 && Math.max(...ratios) <= 2, `人均存量全程在 0.5–2 倍：${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}`);
assert.ok(ratios[ratios.length - 1] >= 0.67 && ratios[ratios.length - 1] <= 1.5, `二十五年后在 0.67–1.5 倍：${ratios[ratios.length - 1].toFixed(2)}`);
assert.ok(e.k >= 0.6 && e.k <= 1.3 && e.fee >= 0.06 && e.fee <= 0.18 && e.buyout >= 0.25 && e.buyout <= 0.55, `调节读数在范围内：${JSON.stringify(e)}`);
assert.ok((E.ECON.f.splurge ?? 0) < 0, '身家上限在起作用（有人挥霍）');
const h1 = heads();
assert.ok(Math.abs(h1.c - h0.c) <= h0.c * 0.2, `修士人数没被凡人挤掉：${h0.c} → ${h1.c}`);
assert.ok(h1.mw < 500, `凡人人均身家有上限：${Math.round(h1.mw)}`);
assert.ok(g.npcs.list.every((d) => Number.isFinite(d.wealth) && d.wealth >= 0), '没有 NaN 或负数');
console.log(`PASS 总账：二十五年人均存量 ${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)} 倍（末年 ${ratios[ratios.length - 1].toFixed(2)}）；调节读数 产出 ${e.k.toFixed(2)} 抽成 ${e.fee.toFixed(3)} 收购 ${e.buyout.toFixed(2)}；修士 ${h0.c}→${h1.c}；凡人人均 ${Math.round(h0.mw)}→${Math.round(h1.mw)}`);
