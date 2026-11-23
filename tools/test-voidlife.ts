// 虚空里的东西（空间乱流、上古残殿、巨兽遗骨、虚空兽）：位置按种子定、乱流减速耗法力、遗迹探一次有所得并记进存档、
// 虚空兽察觉后追人、追上就即时斗法。用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { VOIDLIFE } = await import('../src/world/voidlife');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, xk = g.xukong, L = xk.life;
const step = (seconds: number, each?: () => void) => { for (let t = 0; t < seconds - 1e-9; t += 0.025) { g.paused = false; each?.(); g.update(0.025); } };
const clear = () => { (g.combat as any).enemies.length = 0; g.pursuit.reset(); };
const hold = (k: string, fn: () => void) => { g.input.keys.add(k); try { fn(); } finally { g.input.keys.delete(k); } };
const closeAll = () => { for (let i = 0; i < 6 && g.modal; i++) g.closeModal(true); };

// 0. 升到巡航高度
g.teleport(150000, 110000); clear();
g.hero.realm = 4; g.hero.stage = 2; g.hero.mp = 1; g.hero.hp = 1;
g.toggleFly(); step(1, closeAll);
hold('ascend', () => { for (let i = 0; i < 400 && !(xk.phase === 'void' && xk.lift > 0.995); i++) step(0.25, () => { closeAll(); clear(); }); });
assert.ok(xk.phase === 'void' && xk.lift > 0.995, `应已升到巡航高度：${xk.phase} ${xk.lift}`);

// 1. 找东西：按格子扫一片虚空，四种都得有，而且离各界够远
const cell = (cx: number, cy: number) => (L as any).cell(cx, cy, xk.realms) as import('../src/world/voidlife').VoidThing[];
const all: import('../src/world/voidlife').VoidThing[] = [];
for (let cy = -30; cy <= 30; cy++) for (let cx = -30; cx <= 30; cx++) all.push(...cell(cx, cy));
const by = (k: string) => all.filter((t) => t.kind === k);
assert.ok(by('storm').length > 20 && by('ruin').length > 10 && by('bones').length > 5 && by('beast').length > 10, `四种都该有：${['storm', 'ruin', 'bones', 'beast'].map((k) => by(k).length).join(' / ')}`);
assert.deepEqual(cell(7, -3), cell(7, -3), '同一格永远是同一样东西');
assert.ok(all.every((t) => Math.hypot(t.x, t.y) > 9000), '人界上空没有这些');
/** 把人挪到虚空里的某处（巡航高度），周围的界重新扫一遍 */
const warp = (x: number, y: number) => { xk.x = x; xk.y = y; xk.vx = xk.vy = 0; (xk as any).scanT = 0; step(0.3, closeAll); };
const lonely = (t: { x: number; y: number }, kinds: string[], d: number) => !all.some((q) => q !== t && kinds.includes(q.kind) && Math.hypot(q.x - t.x, q.y - t.y) < d);

// 2. 乱流：进去遁速大减、法力流失；出来就恢复
{
  const s = by('storm').find((t) => lonely(t, ['beast'], 9000) && lonely(t, ['storm'], 16000))!;
  const s2 = by('storm').filter((t) => t !== s);
  assert.ok(lonely(s, ['storm'], 16000) || s2.length > 0);
  warp(s.x + s.r + 2500, s.y); g.hero.mp = 1;
  hold('d', () => step(1.0, closeAll));
  const v0 = Math.hypot(xk.vx, xk.vy);
  assert.equal(L.storm, 0); assert.ok(v0 > 500, `乱流外的遁速：${v0}`);
  warp(s.x + s.r * 0.3, s.y); g.hero.mp = 1;
  hold('a', () => step(0.5, closeAll));
  assert.ok(L.storm > 0.9, `应在乱流深处：${L.storm}`);
  assert.ok(Math.hypot(xk.vx, xk.vy) < v0 * (VOIDLIFE.stormSlow + 0.1), `乱流里遁速大减：${Math.hypot(xk.vx, xk.vy)} / ${v0}`);
  assert.ok(g.hero.mp < 0.99, `法力在流失：${g.hero.mp}`);
  assert.ok(xk.info()?.hint.includes('乱流'));
}

// 3. 残殿：飞近了能探查，探一次有所得，记进存档；再按就没反应了
{
  const r = by('ruin').find((t) => lonely(t, ['beast', 'storm'], 9000))!;
  warp(r.x + 5000, r.y);
  assert.equal(xk.interact(), false, '离得远探不了');
  warp(r.x + r.r + 200, r.y);
  assert.ok(xk.info()?.hint.includes(r.name), `界面该提示可以探查：${xk.info()?.hint}`);
  const stones0 = C.bagCount(g.hero, 'mat_lingshi'), exp0 = g.hero.exp, bag0 = g.hero.bag.length;
  assert.equal(xk.interact(), true); assert.ok(g.modal, '弹出抉择');
  const node = (g.modal as any).node ?? (g.modal as any).dialog ?? g.modal, opt = node.options?.[0];
  assert.ok(opt?.label.includes('搜'), `第一项是进去搜：${opt?.label}`);
  const next = opt.act(); assert.ok(next?.text, '搜完有结果');
  closeAll();
  assert.ok(C.bagCount(g.hero, 'mat_lingshi') > stones0 || g.hero.bag.length > bag0 || g.hero.exp > exp0, '有所得');
  assert.ok((g.ws as any).voidSeen[r.id], '探过的记在世界状态里（随存档走）');
  step(0.2, closeAll);
  assert.equal(xk.interact(), false, '探过的不能再探');
  assert.ok(g.save(1)); (g.ws as any).voidSeen = {}; assert.ok(g.load('taixu_save_1'));
  assert.ok((g.ws as any).voidSeen[r.id], '读档后仍记得');
}

// 4. 虚空兽：察觉后追人；追上了就是即时斗法（细节见 test-voidfight.ts）
{
  // 读档把虚空状态归零了：重新升上去
  g.hero.realm = 4; g.hero.stage = 2; g.hero.mp = 1; g.hero.hp = 1; clear();
  if (!p.flying) g.toggleFly(); step(1, closeAll);
  hold('ascend', () => { for (let i = 0; i < 400 && !(xk.phase === 'void' && xk.lift > 0.995); i++) step(0.25, () => { closeAll(); clear(); }); });
  assert.ok(xk.phase === 'void' && xk.lift > 0.995);
  const b = by('beast').find((t) => lonely(t, ['beast', 'storm'], 12000))!;
  warp(b.x + 2400, b.y);
  let seen: any = null;
  for (let i = 0; i < 80 && !xk.fight.on; i++) { step(0.25); seen = L.near.find((t) => t.kind === 'beast') ?? seen; }
  assert.ok(seen, '兽被放了出来');
  assert.ok(xk.fight.on, '站着不动会被追上，追上就斗法');
  assert.ok((xk.fight.foes[0]?.src as any)?.hot, '是察觉到人、追上来的那一头');
  assert.ok(!g.modal, '不弹抉择框');
  xk.fight.finish('fled'); step(1, closeAll);
}
console.log(`PASS 虚空里的东西：一片 61×61 格的虚空里有乱流 ${by('storm').length}、残殿 ${by('ruin').length}、遗骨 ${by('bones').length}、虚空兽 ${by('beast').length}；乱流减速耗法力；残殿探一次有所得并随存档；虚空兽会追人，追上就即时斗法`);
