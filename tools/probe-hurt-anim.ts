// r12-anim 探针：主角挨打的各种方式 + 按住方向键，逐帧记录动作，找「姿势卡住平移」
import './env';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 11; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const H2 = await import('../src/world/hsmoves2');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, h = g.hero, B = c.brawl as any, H = g.hanshan as any;
h.realm = 3; h.stage = 1;
const T = g.terrain as any;
T.walkFactor = () => 1; T.canTraverse = () => true; T.isLand = () => true;
(g.npcs as any).prestep = () => {};
(g as any).space.blocked = () => false;
c.safeAt = () => false; c.spawnT = 1e9; B.brk.manual = true;
let hold: string[] = [];
const frame = (dt = 1 / 60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; for (const k of hold) g.input.keys.add(k); g.update(dt); c.fxq.length = 0; };
const fresh = () => { c.enemies.length = 0; B.reset(); c.cds.clear(); c.invulnT = 0; h.hp = 1; h.mp = 1; c.pst = {}; c.hitT = 0; p.flying = false; p.z = 0; hold = []; g.input.keys.clear(); };

type Row = { t: number; a: string; at: number; x: number; y: number; lift: number; ph: number };
const DUMP: Record<string, Row[]> = {};
function rec(sec: number, each?: (t: number) => void): Row[] {
  const R: Row[] = [];
  for (let t = 0; t < sec; t += 1 / 60) { each?.(t); frame(); R.push({ t, a: p.st.action, at: p.st.actionT, x: p.x, y: p.y, lift: p.st.lift, ph: p.st.phase }); }
  return R;
}
/** 卡住：位置在动（> 40/秒）、动作不是走跑翻滚、且这个动作已经持续很久 */
function stuck(R: Row[], label: string) {
  const runs: { a: string; t0: number; t1: number; dist: number }[] = [];
  for (let i = 1; i < R.length; i++) {
    const r = R[i], q = R[i - 1], d = Math.hypot(r.x - q.x, r.y - q.y);
    const L = runs[runs.length - 1];
    if (L && L.a === r.a) { L.t1 = r.t; L.dist += d; } else runs.push({ a: r.a, t0: r.t, t1: r.t, dist: d });
  }
  DUMP[label] = R;
  console.log(`== ${label}`);
  for (const r of runs) console.log(`  ${r.a.padEnd(10)} ${r.t0.toFixed(2)}–${r.t1.toFixed(2)} 走了 ${Math.round(r.dist)}`);
}

// 1. 妖兽咬（hitPlayer 普通伤害），按住 d 走
{
  fresh();
  const e = new Enemy({ ...ENEMIES.yelang, speed: 0 }, p.x + 60, p.y, 2, 1); e.maxHp = e.hp = 1e7; c.enemies.push(e);
  hold = ['d'];
  const R = rec(2, (t) => { if (Math.round(t * 60) % 12 === 0) { c.invulnT = 0; c.hitPlayer(5, 1, undefined, p.x - 50, p.y, e); } h.hp = 1; });
  stuck(R, '1 连续被咬 + 按 d');
}
// 2. 被眩晕（stun 1.2s）期间被击退
{
  fresh();
  c.hitPlayer(5, 1, { k: 'stun', dur: 1.2, ch: 1 }, p.x - 50, p.y);
  const R = rec(2, (t) => { if (t < 1) p.x += 2; h.hp = 1; });
  stuck(R, '2 眩晕');
}
// 3. 被轰飞（launchPlayer），按住 d
{
  fresh();
  B.launchPlayer(1, 0, 600, 420, null);
  hold = ['d'];
  const R = rec(4, () => { h.hp = 1; });
  stuck(R, '3 轰飞 + 按 d');
}
// 4. 御剑时被往下砸
{
  fresh(); p.flying = true; p.z = 300; p.zTarget = 300;
  B.launchPlayer(1, 0, 400, -600, null, true);
  hold = ['d'];
  const R = rec(4, () => { h.hp = 1; });
  stuck(R, '4 御剑被砸下 + 按 d');
}
// 5. 撼山客擒拿（犁地 / 抡人 / 陨星坠）对你，之后按 d 走
for (const id of ['lidi', 'lunren', 'yunxing', 'liuxing', 'tiandi', 'shifang']) {
  fresh();
  H.place(p.x + 300, p.y - 100, 'stay');
  for (let i = 0; i < 30 && !H.ent; i++) frame();
  const e = H.ent; if (!e) { console.log('no hanshan'); break; }
  H.toFight('brawl'); e.aggro = true; e.tgP = false; H.brawling = () => { e.hp = e.maxHp; };
  const b = B.peek(e); if (b?.ai) b.ai.cd = 1e9;
  for (const m of H2.HS2_MOVES) e.skCd[m.id] = 0;
  H2.hs2ResetAi(1e9);
  e.atk = Math.max(1, e.atk * 0.02);
  p.x = e.x + 160; p.y = e.y;
  const ok = H2.performHs2(H, id, null, true);
  let n = 0; while (B.peek(e)?.move && n < 900) { frame(); h.hp = 1; n++; }
  hold = ['d'];
  const R = rec(5, () => { h.hp = 1; });
  stuck(R, `5 撼山客 ${id}（放出 ${ok}，招 ${(n / 60).toFixed(2)} 息）后按 d；brawl.act=${B.act} actT=${B.actT?.toFixed?.(1)}`);
  H.place(p.x + 90000, p.y, 'stay');
}
if (process.env.OUT) {
  const fs = await import('node:fs');
  const NL = String.fromCharCode(10), TAB = String.fromCharCode(9);
  const body = Object.entries(DUMP).map(([k, R]) => ['## ' + k, ['t', 'action', 'actionT', 'x', 'y', 'lift', 'phase'].join(TAB), ...R.map((r) => [r.t.toFixed(3), r.a, r.at.toFixed(3), r.x.toFixed(1), r.y.toFixed(1), r.lift.toFixed(1), r.ph.toFixed(2)].join(TAB))].join(NL)).join(NL + NL);
  fs.writeFileSync(process.env.OUT, body);
}
process.exit(0);
