// P11 百年经济模拟器：不带画面，把新开局的世界一路快进，按月记下灵石存量、人口、物价、每条进水口出水口和总账调节的读数，
// 出一份带曲线的报告（docs/P11-经济模拟/report.html）并按三条验收线判过不过。
// 用法：npx tsx tools/sim-economy.ts [--years=100] [--mode=both|on|off] [--seed=1] [--out=路径.html]
//   on＝总账自动调节开着（游戏里就是这样）；off＝关掉调节作对照；both＝两种各跑一遍，画在一起。
import './env';
import fs from 'node:fs';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const YEARS = Number(arg('years', '100')), MODE = arg('mode', 'both'), SEED = Number(arg('seed', '1'));
// 固定随机数：两种模式对照时起点一样
let s0 = SEED >>> 0 || 1;
Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const E = await import('../src/world/econ');
const LV = await import('../src/world/living');
const REALM_NAME = ['凡人', '炼气', '筑基', '结丹', '元婴', '化神'];

interface Month { y: number; perHead: number; total: number; cult: number; heads: number[]; byRealm: number[]; idxMed: number; idxP10: number; idxP90: number; listings: number; orders: number; k: number; fee: number; buyout: number }
interface Run { mode: string; months: Month[]; years: { y: number; flows: Record<string, number> }[]; ms: number; t: Record<string, number>; brk: string }

async function run(mode: 'on' | 'off'): Promise<Run> {
  s0 = SEED >>> 0 || 1;
  E.ECON.on = true; E.ECON.f = {}; E.ECON.t = {}; E.ECON.noRegulate = mode === 'off';
  { const B = LV.BREAK_STAT; for (const k of ['tries', 'ups', 'pillTries', 'pillUps', 'hurt'] as const) B[k].fill(0); B.src = {}; }
  const g = await G.createGame(() => {}); g.reset();
  const W = g.wanbao, t0 = performance.now();
  const months: Month[] = [], years: Run['years'] = [];
  const STEP = 10, day0 = g.day;
  for (let m = 0; m < YEARS * 12; m++) {
    for (let d = 0; d < 30; d += STEP) { g.day += STEP; g.npcs.daily(STEP); W.daily(); g.auction.daily(); g.fellows.daily(); }
    const M = E.moneySupply(g), S = W.S;
    const idx = Object.entries(S.idx).filter(([k]) => k.startsWith('TN|')).map(([, v]) => v);
    for (const k of Object.keys(S.hist)) if (k.startsWith('TN|') && !(k in S.idx)) idx.push(1);
    idx.sort((a, b) => a - b);
    const q = (p: number) => (idx.length ? idx[Math.min(idx.length - 1, Math.floor(p * idx.length))] : 1);
    months.push({ y: (g.day - day0) / 360, perHead: M.perHead, total: M.total, cult: M.cultivators, heads: M.heads, byRealm: M.byRealm.map((v, i) => v / Math.max(1, M.heads[i])),
      idxMed: q(0.5), idxP10: q(0.1), idxP90: q(0.9), listings: S.listings.length, orders: S.orders.length, k: W.econK, fee: W.fee, buyout: W.buyoutK });
    if ((m + 1) % 12 === 0) { years.push({ y: (m + 1) / 12, flows: { ...E.ECON.f } }); E.ECON.f = {}; }
    if ((m + 1) % 120 === 0) process.stdout.write(`  [${mode}] ${(m + 1) / 12} 年：人均 ${Math.round(M.perHead)}，修士 ${M.cultivators}，物价中位 ${q(0.5).toFixed(2)}，挂单 ${S.listings.length}\n`);
  }
  const B = LV.BREAK_STAT;
  const brk = `冲关成功（炼气→筑基／筑基→结丹／结丹→元婴）${B.ups.slice(1).join('／')}，其中服丹 ${B.pillUps.slice(1).join('／')}（服丹冲关 ${B.pillTries.slice(1).join('／')} 次）；破境丹来路 ${Object.entries(B.src).map(([k, v]) => k + ' ' + v).join('、')}`;
  return { mode, months, years, ms: performance.now() - t0, t: { ...E.ECON.t }, brk };
}

const runs: Run[] = [];
for (const m of MODE === 'both' ? (['off', 'on'] as const) : [MODE as 'on' | 'off']) runs.push(await run(m));

// —— 验收线（以第一年年底为基准：开局头一年在铺货、在找平衡）
function judge(r: Run) {
  const M = r.months, base = M[Math.min(11, M.length - 1)].perHead;
  const ratios = M.slice(12).map((x) => x.perHead / base);
  const end = ratios.length ? ratios[ratios.length - 1] : 1;
  const yearMed: number[] = [];
  for (let y = 1; y < r.years.length; y++) { const a = M.slice(y * 12, y * 12 + 12).map((x) => x.idxMed); if (a.length) yearMed.push(a.reduce((s, v) => s + v, 0) / a.length); }
  const h0 = M[Math.min(11, M.length - 1)].heads, h1 = M[M.length - 1].heads;
  const pop = [1, 2, 3].map((i) => ({ realm: REALM_NAME[i], from: h0[i], to: h1[i], ok: Math.abs(h1[i] - h0[i]) <= Math.max(6, h0[i] * 0.3) }));
  const money = { ok: end >= 0.67 && end <= 1.5 && Math.min(...ratios, 1) >= 0.5 && Math.max(...ratios, 1) <= 2, end, min: Math.min(...ratios, 1), max: Math.max(...ratios, 1) };
  const price = { ok: yearMed.every((v) => v >= 0.8 && v <= 1.25), min: Math.min(...yearMed, 1), max: Math.max(...yearMed, 1) };
  return { money, price, pop, ok: money.ok && price.ok && pop.every((p) => p.ok) };
}
const verdicts = runs.map((r) => ({ mode: r.mode, ...judge(r) }));

// —— 报告（纯 SVG，不依赖外部库）
const COLORS: Record<string, string> = { off: '#a8352a', on: '#2f6b5e' };
const RC = ['#8a8270', '#3f7a62', '#3a6a9a', '#b8802a', '#7a3a9a', '#a8352a'];
type Series = { name: string; color: string; pts: [number, number][]; dash?: boolean };
function chart(title: string, series: Series[], opt: { band?: [number, number]; ref?: number; yfmt?: (v: number) => string } = {}) {
  const W = 640, H = 220, L = 58, R = 12, T = 26, B = 28;
  const xs = series.flatMap((s) => s.pts.map((p) => p[0]));
  const ys = series.flatMap((s) => s.pts.map((p) => p[1])).concat(opt.band ?? [], opt.ref !== undefined ? [opt.ref] : []);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys); if (y0 === y1) { y0 -= 1; y1 += 1; } const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (v: number) => L + (v - x0) / (x1 - x0 || 1) * (W - L - R), Y = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const f = opt.yfmt ?? ((v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('zh-CN') : v.toFixed(2)));
  let s = `<svg viewBox="0 0 ${W} ${H}" class="ch"><text x="${L}" y="16" class="t">${title}</text>`;
  for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4; s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="g"/><text x="${L - 6}" y="${Y(v) + 4}" class="yl">${f(v)}</text>`; }
  for (let i = 0; i <= 5; i++) { const v = x0 + (x1 - x0) * i / 5; s += `<text x="${X(v)}" y="${H - 8}" class="xl">${Math.round(v)} 年</text>`; }
  if (opt.band) s += `<rect x="${L}" width="${W - L - R}" y="${Y(opt.band[1])}" height="${Math.max(0, Y(opt.band[0]) - Y(opt.band[1]))}" class="band"/>`;
  if (opt.ref !== undefined) s += `<line x1="${L}" x2="${W - R}" y1="${Y(opt.ref)}" y2="${Y(opt.ref)}" class="ref"/>`;
  for (const se of series) s += `<path d="${se.pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ')}" stroke="${se.color}" class="ln${se.dash ? ' dash' : ''}"/>`;
  s += `<g class="lg">${series.map((se, i) => `<g transform="translate(${L + 8 + i * 118},${T + 6})"><line x1="0" x2="16" y1="0" y2="0" stroke="${se.color}" class="ln${se.dash ? ' dash' : ''}"/><text x="20" y="4">${se.name}</text></g>`).join('')}</g>`;
  return s + '</svg>';
}
const name = (m: string) => (m === 'on' ? '自动调节' : '不调节');
const baseOf = (r: Run) => r.months[Math.min(11, r.months.length - 1)].perHead;
const charts: string[] = [];
charts.push(chart('人均存量（修士身上平均有多少灵石，不含凡人，以第一年年底为 1）', runs.map((r) => ({ name: name(r.mode), color: COLORS[r.mode], dash: r.mode === 'off', pts: r.months.map((m) => [m.y, m.perHead / baseOf(r)] as [number, number]) })), { band: [0.67, 1.5], ref: 1 }));
charts.push(chart('物价指数（南荒，所有交易过的东西的中位数）', runs.map((r) => ({ name: name(r.mode), color: COLORS[r.mode], dash: r.mode === 'off', pts: r.months.map((m) => [m.y, m.idxMed] as [number, number]) })), { band: [0.8, 1.25], ref: 1 }));
for (const r of runs) charts.push(chart(`各境界人数（${name(r.mode)}）`, [1, 2, 3, 4].map((i) => ({ name: REALM_NAME[i], color: RC[i], pts: r.months.map((m) => [m.y, m.heads[i]] as [number, number]) })), { yfmt: (v) => String(Math.round(v)) }));
for (const r of runs) charts.push(chart(`各境界人均身家（${name(r.mode)}，对数刻度）`, [1, 2, 3, 4].map((i) => ({ name: REALM_NAME[i], color: RC[i], pts: r.months.map((m) => [m.y, Math.log10(Math.max(1, m.byRealm[i]))] as [number, number]) })), { yfmt: (v) => Math.round(Math.pow(10, v)).toLocaleString('zh-CN') }));
const on = runs.find((r) => r.mode === 'on');
if (on) charts.push(chart('总账调节的读数（自动调节）', [
  { name: '灵脉产出倍数', color: '#3a6a9a', pts: on.months.map((m) => [m.y, m.k] as [number, number]) },
  { name: '抽成 ×10', color: '#a8352a', pts: on.months.map((m) => [m.y, m.fee * 10] as [number, number]) },
  { name: '收购折扣 ×2', color: '#b8802a', pts: on.months.map((m) => [m.y, m.buyout * 2] as [number, number]) },
]));
charts.push(chart('万宝楼挂单数（各地合计）', runs.map((r) => ({ name: name(r.mode), color: COLORS[r.mode], dash: r.mode === 'off', pts: r.months.map((m) => [m.y, m.listings] as [number, number]) })), { yfmt: (v) => String(Math.round(v)) }));
const flowTable = runs.map((r) => {
  const keys = [...E.FAUCETS, ...E.SINKS] as string[];
  const avg = (k: string, a: number, b: number) => { const ys = r.years.slice(a, b); return ys.reduce((s, y) => s + (y.flows[k] ?? 0), 0) / Math.max(1, ys.length); };
  const n = r.years.length;
  const spans = ([['第 1–10 年', 0, 10], ['第 41–50 年', 40, 50], [`第 ${n - 9}–${n} 年`, n - 10, n]] as [string, number, number][]).filter((x) => x[2] <= n && x[1] >= 0);
  return `<h3>${name(r.mode)}：每年的进水口与出水口（灵石／年，平均；死者带走的不在表里）</h3><div class="wrap"><table><tr><th></th>${spans.map((s) => `<th>${s[0]}</th>`).join('')}</tr>${keys.map((k) => `<tr><td>${(E.FAUCETS as readonly string[]).includes(k) ? '进' : '出'}·${E.FLOW_NAME[k]}</td>${spans.map((s) => `<td>${Math.round(avg(k, s[1], s[2])).toLocaleString('zh-CN')}</td>`).join('')}</tr>`).join('')}</table></div>`;
}).join('');
const vtab = verdicts.map((v) => `<tr><td>${name(v.mode)}</td><td class="${v.money.ok ? 'ok' : 'no'}">${v.money.ok ? '过' : '不过'}（末年 ${v.money.end.toFixed(2)}，最低 ${v.money.min.toFixed(2)}，最高 ${v.money.max.toFixed(2)}）</td><td class="${v.price.ok ? 'ok' : 'no'}">${v.price.ok ? '过' : '不过'}（${v.price.min.toFixed(2)}–${v.price.max.toFixed(2)}）</td><td class="${v.pop.every((p) => p.ok) ? 'ok' : 'no'}">${v.pop.map((p) => `${p.realm} ${p.from}→${p.to}${p.ok ? '' : ' ✗'}`).join('，')}</td></tr>`).join('');
const page = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>百年经济模拟</title><style>
:root{--ink:#26231e;--paper:#f3ecdc;--line:#d8ccb0}body{margin:0;background:var(--paper);color:var(--ink);font-family:'Noto Serif SC','Songti SC',serif;padding:24px 16px}main{max-width:1340px;margin:0 auto}
h1{font-size:26px;margin:0 0 4px}h3{font-size:17px;margin:22px 0 8px}.sub{color:#6a5c44;font-size:14px;margin-bottom:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,620px),1fr));gap:14px}
.ch{width:100%;background:#fbf7ec;border:1px solid var(--line);border-radius:4px}.ch .t{font-size:14px;font-weight:700;fill:#2a2016}.ch .g{stroke:#e6dcc4}.ch .yl{font-size:10px;fill:#7a6a50;text-anchor:end}.ch .xl{font-size:10px;fill:#7a6a50;text-anchor:middle}
.ch .ln{fill:none;stroke-width:1.8}.ch .dash{stroke-dasharray:5 4}.ch .band{fill:rgba(47,107,94,.08)}.ch .ref{stroke:#9a8a6a;stroke-dasharray:2 3}.ch .lg text{font-size:11px;fill:#3a2e1e}
table{border-collapse:collapse;font-size:13px;background:#fbf7ec;width:100%;max-width:900px}td,th{border:1px solid var(--line);padding:5px 9px;text-align:right}td:first-child,th:first-child{text-align:left}.ok{color:#1f5a4c;font-weight:700}.no{color:#a8352a;font-weight:700}
.wrap{overflow-x:auto}</style></head><body><main><h1>百年经济模拟</h1><div class="sub">新开局的世界快进 ${YEARS} 年（每 10 日一步，NPC 照常过日子、在万宝楼买卖）；随机种子 ${SEED}；生成于 ${new Date().toLocaleString('zh-CN')}。绿色带是验收范围，虚线是不调节的对照。</div>
<h3>验收</h3><div class="wrap"><table><tr><th>模式</th><th>人均存量在 0.67–1.5 倍之间（全程 0.5–2）</th><th>物价中位数每年都在 0.8–1.25</th><th>炼气、筑基、结丹人数偏离 ≤ 三成</th></tr>${vtab}</table></div>
<div class="grid" style="margin-top:14px">${charts.join('')}</div>${flowTable}</main></body></html>`;
const out = arg('out', 'docs/P11-经济模拟/report.html');
fs.writeFileSync(out, page);
fs.writeFileSync(out.replace(/\.html$/, '.json'), JSON.stringify({ verdicts, runs: runs.map((r) => ({ mode: r.mode, ms: Math.round(r.ms), t: r.t, years: r.years, months: r.months.filter((_, i) => i % 3 === 0) })) }));
for (const v of verdicts) console.log(`${name(v.mode)}：${v.ok ? '全部过' : '没过'}　人均存量末年 ${v.money.end.toFixed(2)}（${v.money.min.toFixed(2)}–${v.money.max.toFixed(2)}）　物价 ${v.price.min.toFixed(2)}–${v.price.max.toFixed(2)}　人口 ${v.pop.map((p) => `${p.realm}${p.from}→${p.to}`).join(' ')}`);
// 11e：调参看的几样读数——拍卖成交率（大城＝雄城 / 天下名城）、破境丹求购与成交、宗门月俸百年倍数、调节读数
for (const r of runs) {
  const t = r.t, n = r.years.length, avg = (k: string, a: number, b: number) => r.years.slice(a, b).reduce((s, y) => s + (y.flows[k] ?? 0), 0) / Math.max(1, Math.min(b, n) - a);
  const rate = (p: string) => { const ok = (t[p + '_npc'] ?? 0) + (t[p + '_me'] ?? 0), all = ok + (t[p + '_pass'] ?? 0) + (t[p + '_shill'] ?? 0); return `${ok}/${all}（${all ? Math.round(ok / all * 100) : 0}%），均价 ${ok ? Math.round((t[p + '_v'] ?? 0) / ok) : 0}`; };
  const ks = r.months.map((m) => m.k), last = r.months[r.months.length - 1];
  console.log(`[${r.mode}] 拍卖 大城 ${rate('aucBig')}；小城 ${rate('aucSmall')}`);
  console.log(`[${r.mode}] 破境丹 求购 ${t.kpOrder ?? 0} 张（其中赊购 ${t.kpCredit ?? 0}）、求购成交 ${t.kpOrderFill ?? 0}、楼里直接买到 ${t.kpBuy ?? 0}、拍卖会拍得 ${t.kpAuc ?? 0}；赊丹 ${t.kpLoan ?? 0} 回（真用上 ${t.kpLoanUsed ?? 0}）：借出 ${t.loanV ?? 0}，还回 ${t.repV ?? 0}，求购落空退回 ${t.unwindV ?? 0}，借款人死了认亏 ${t.lossV ?? 0}，出借人死了销账 ${t.voidV ?? 0}`);
  console.log(`[${r.mode}] 宗门月俸 第1–10年 ${Math.round(avg('salary', 0, 10))}／年 → 末十年 ${Math.round(avg('salary', n - 10, n))}／年（${(avg('salary', n - 10, n) / Math.max(1, avg('salary', 0, 10))).toFixed(2)} 倍）；调节读数 末月 灵脉 ${last.k.toFixed(2)} 抽成 ${last.fee.toFixed(3)} 收购 ${last.buyout.toFixed(2)}，灵脉全程最低 ${Math.min(...ks).toFixed(2)}`);
  console.log(`[${r.mode}] ${r.brk}`);
  console.log(`[${r.mode}] 境界人数 第1年末 ${r.months[11].heads.slice(1, 5).join('/')} → 末年 ${last.heads.slice(1, 5).join('/')}；末年各境界人均身家 ${last.byRealm.slice(1, 5).map((v) => Math.round(v)).join('/')}`);
}
console.log('报告', out, runs.map((r) => `${r.mode} ${Math.round(r.ms / 1000)}s`).join(' '));
