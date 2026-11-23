// 收官 P8（丁）：画中洞天（world/huajuan.ts）——无头测试。
// 画立在青霞谷藏经阁那层台上、位置按台算（不取随机数）；画里的景和走进去的秘境是同一份生成、按种子一致；
// 走过墨线才开始铺、没铺满前退得回来、铺满就进去；进去后那层画往外走才散；从画外之门出来落在画前、要先退出墨线才会再被吸进去；
// 没打完出来、再从画走进去接着打（秘境原样）；离屏画只在画在视野里、离得不远（或刚进画里、画还盖着）时重画；
// 人在画里存档，读回来还在画里；古画挂进洞府就是一处可反复进的小洞天（每幅一个种子）。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const W0 = await import('../src/data/world');
const HJ = await import('../src/world/huajuan');
const g = await G.createGame(() => {});
g.reset();
let ok = 0; const pass = (s: string) => { ok++; console.log('  ✓ ' + s); };
const rnd0 = Math.random; let calls = 0;
const noRandom = <T,>(f: () => T, what: string): T => { calls = 0; Math.random = () => { calls++; return rnd0(); }; try { return f(); } finally { Math.random = rnd0; assert.equal(calls, 0, `${what}：不该取 Math.random（取了 ${calls} 次）`); } };
const H = g.huajuan, mj = g.mijing, p = g.player;
const tick = (n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) { mj.update(dt); H.update(dt); } };

// 1. 画在哪：青霞谷藏经阁那层台上，按台算，两次算一样
const hf = W0.LOC_BY_ID.get('huangfeng')!;
g.teleport(hf.x * W0.WORLD_SCALE, hf.y * W0.WORLD_SCALE); g.space.update(1, p.x, p.y);
const ss = noRandom(() => H.scrolls(), '找画的位置');
assert.equal(ss.length, 1, '青霞谷立着一幅画');
const s = ss[0];
const H2 = new HJ.HuajuanSys(g); const s2 = H2.scrolls()[0];
assert.deepEqual([s.x, s.y], [s2.x, s2.y], '画的位置两次算一样');
for (const [dx, dy] of [[0, HJ.LINE], [0, HJ.LINE + 100], [-60, 60], [60, 20]]) assert.equal(g.space.blocked(s.x + dx, s.y + dy), false, '画前那段路没被挡');
pass(`「${s.name}」立在青霞谷 (${Math.round(s.x)}, ${Math.round(s.y)})，画前的路通`);

// 2. 画里的景就是那处秘境（同一份生成），按种子一致、不取随机数
const f1 = noRandom(() => mj.preview(s.spec), '预览'), f2 = mj.preview(s.spec);
assert.equal(JSON.stringify(f1.isles), JSON.stringify(f2.isles), '画里的石台按种子一致');
assert.ok((f1.isles?.length ?? 0) >= 3 && f1.rooms.some((r) => r.kind === 'boss') && f1.objs.some((o) => o.kind === 'chest'), '画里有石台、首领、宝匣');
pass(`画里 ${f1.isles!.length} 座石台（有首领、有宝匣），按种子一致`);

// 3. 离屏画什么时候重画：近、在镜头里才画；远了不画
g.teleport(s.x, s.y + HJ.LINE + 110); tick(2);
assert.equal(H.near, s, '走近了，对着这幅画');
assert.equal(H.paintWanted(s), true, '画在视野里、离得近：重画');
g.cam.x = s.x + 6000; assert.equal(H.paintWanted(s), false, '镜头看不到画：不画'); g.cam.x = s.x;
g.teleport(s.x + 4000, s.y); tick(1); assert.equal(H.paintWanted(s), false, '离得远：不画');
pass('离屏画只在画在视野里、离得不远时重画');

// 4. 走进去：过了墨线才开始铺，没铺满前退得回来，铺满就进去；进出不改 halted
g.teleport(s.x, s.y + HJ.LINE + 110); tick(3);
const h0 = g.halted;
assert.equal(H.k, 0, '墨线外不铺');
const walkTo = (y: number) => { const n = Math.ceil(Math.abs(y - p.y) / 6); const y0 = p.y; for (let i = 1; i <= n; i++) { p.y = y0 + (y - y0) * i / n; tick(1, 0.02); if (H.cur) break; } };
walkTo(s.y + HJ.LINE - HJ.RUN * 0.5);
assert.ok(H.k > 0.4 && H.k < 0.6 && Math.abs(H.cover - H.k) < 1e-9, `走进墨线一半：画铺了一半（${H.k.toFixed(2)}）`);
assert.equal(mj.active, false, '还没进去');
walkTo(s.y + HJ.LINE + 40); assert.equal(H.k, 0, '退出墨线：画收回去'); assert.equal(mj.active, false);
walkTo(s.y + 10);
assert.equal(mj.active, true, '铺满就进了画里'); assert.equal(H.cur, s);
g.updateUI(true); assert.equal((g as any).ui.region, '画中洞天', `第五轮返工：画里地区名写「画中洞天」：${(g as any).ui.region}`);
assert.equal(H.cover, 1, '刚进去时那层画还盖着'); assert.equal(g.halted, h0, '进画不改 halted'); assert.equal(g.modal, null);
assert.ok((g.ws.flags as any).hjIn?.id === s.id, '记下了人在哪幅画里');
// 进去以后往外走，画才散
const ex = p.x, ey = p.y;
for (let i = 1; i <= 50; i++) { p.x = ex + i * 6; tick(1, 0.02); }
assert.ok(H.cover < 0.1, `往外走了三百步，画散了（${H.cover.toFixed(2)}）`);
{ const c0 = H.cover; for (let i = 0; i < 40; i++) { p.x = ex; p.y = ey; tick(1, 0.02); } assert.ok(H.cover <= c0 + 1e-9, '走回落脚处，画也不再盖回来（只散不聚）'); }
assert.equal(H.paintWanted(s), H.cover > 0, '人在画里时，画还盖着才接着重画');
pass('过墨线铺开、退回收起、铺满进去、往外走才散；halted 不变');

// 5. 打一间石室再出来（不打完）：从画外之门出来，落在画前；要先退出墨线才会再被吸进去
const F0 = mj.floor!;
const roomsEntered = F0.rooms.filter((r) => r.entered).length;
// 走回入口那座古阵（画外之门）：先走开到门外、再走进阵心，云气遮满时出去
{
  const o = F0.objs.find((q) => q.kind === 'exit' && q.room === 0)!;
  for (let i = 1; i <= 80 && Math.hypot(p.x - o.x, p.y - o.y) < 420; i++) { p.x += 8; tick(1, 0.02); }
  const sx = p.x, sy = p.y;
  for (let i = 1; i <= 200 && mj.active; i++) { const t = Math.min(1, i / 120); p.x = sx + (o.x - sx) * t; p.y = sy + (o.y - sy) * t; tick(1, 0.03); }
}
tick(2);
assert.equal(mj.active, false); assert.equal(H.cur, null, '从画外之门出来了'); assert.equal((g.ws.flags as any).hjIn, undefined, '不再记着人在画里');
assert.ok(Math.abs(p.x - s.x) < 1 && Math.abs(p.y - (s.y + HJ.LINE + 60)) < 1, '落在画前、墨线外一步');
assert.equal(mj.gate, null, '出来的地方不另开云门（门就是这幅画）');
assert.ok(mj.core > 0.5 && mj.veil <= 0.5 + 1e-9, `出来那一刻还裹在画外之门的云里（门洞那团 ${mj.core.toFixed(2)}，整屏 ${mj.veil.toFixed(2)} 不超过上限）`);
for (let i = 1; i <= 80; i++) { p.y = s.y + HJ.LINE + 60 + i * 5; tick(1, 0.02); }
assert.ok(mj.veil < 0.01, '往外走，云散了');
// 再走进去：接着刚才那一层（秘境原样）
walkTo(s.y + 10);
assert.equal(mj.active, true, '退出墨线后再走进去，又进了画里');
assert.equal(mj.floor, F0, '没打完出来又回去：还是原来那一层');
assert.equal(mj.floor!.rooms.filter((r) => r.entered).length, roomsEntered);
pass('从画外之门出来落在画前、云往外走才散；没打完再从画走进去接着打');

// 6. 存档读档：人在画里存档，读回来还在画里；第六轮返工：打到哪一间也随存档走（原来读回来秘境重新生成，清过的石室、开过的宝匣全复原）
const Fs = mj.floor!;
const rClear = Fs.rooms.find((r) => r.i > 0 && r.kind !== 'boss')!;
rClear.entered = true; rClear.cleared = true; for (const e of rClear.foes) e.dead = true;
const chest = Fs.objs.findIndex((o) => o.kind === 'chest' && !o.hidden);
if (chest >= 0) Fs.objs[chest].used = true;
const usedBefore = Fs.objs.map((o) => !!o.used).join(''), clearedBefore = Fs.rooms.map((r) => r.cleared ? 1 : 0).join('');
assert.ok(g.save(1), '存档');
assert.ok((g.ws.flags as any).mjProg?.inside, '存档里记着秘境进度');
mj.leave('force'); tick(2);
assert.equal(mj.active, false);
g.teleport(hf.x * W0.WORLD_SCALE + 3000, hf.y * W0.WORLD_SCALE);
assert.ok(g.load('taixu_save_1'), '读档');
g.space.update(1, p.x, p.y); tick(3);
assert.equal(mj.active, true, '读回来人还在画里'); assert.equal(H.cur?.id, s.id);
assert.equal(mj.cur!.spec.seed, s.spec.seed);
assert.notEqual(mj.floor, Fs, '读档回来的是重新生成的一份');
assert.equal(mj.floor!.rooms.map((r) => r.cleared ? 1 : 0).join(''), clearedBefore, `清过的石室还是清过的：${clearedBefore}`);
assert.equal(mj.floor!.objs.map((o) => !!o.used).join(''), usedBefore, '开过的宝匣还是开过的');
assert.ok(rClear.i > 0 && mj.floor!.rooms[rClear.i].entered, '清过的那间不会再惊出妖物');
mj.leave('exit'); tick(2);
assert.equal(H.cur, null);
pass(`人在画里存档，读回来还在画里、接着上回打到的地方（清过 ${clearedBefore.split('1').length - 1} 间${chest >= 0 ? '、开过一个宝匣' : ''}）；出来照常`);

// 7. 古画：挂进洞府就是一处可反复进的小洞天（每幅一个种子）
{
  const a = HJ.homeScroll(0, 0, 7), b = HJ.homeScroll(0, 0, 7), c = HJ.homeScroll(0, 0, 8);
  assert.deepEqual(a.spec, b.spec, '同一幅古画（同一个种子）画里的天地一样');
  assert.notEqual(a.spec.seed, c.spec.seed, '不同的古画不一样');
  assert.equal(a.spec.theme, 'shanshui');
  pass('古画按种子各是一处小洞天');
}
// 8. 古画从哪来、怎么挂：画中洞天第一次打通，画里藏着一幅（只给一次）；挂进洞府，洞府门前就立起这幅画
{
  const C = await import('../src/world/cultivation');
  const h = g.hero, n0 = C.bagCount(h, 'misc_guhua');
  H.cur = s; noRandom(() => H.onBossDown(s.spec), '首领掉古画'); H.onBossDown(s.spec); H.cur = null;
  assert.equal(C.bagCount(h, 'misc_guhua'), n0 + 1, '画中洞天打通，得一幅古画（只给一次）');
  const b = h.bag.find((x) => x.id === 'misc_guhua')!;
  (g.ws as any).home = null;
  assert.equal(H.hang(b), false, '没有洞府挂不了');
  (g.ws as any).home = { map: W0.ACTIVE_MAP, x: p.x, y: p.y };
  const seed = Math.round(b.age ?? 0);
  assert.equal(H.hang(b), true, '在洞府跟前挂得上');
  assert.equal(C.bagCount(h, 'misc_guhua'), n0, '画从袋里拿出来了');
  const hs = H.scrolls().find((q) => q.id === 'home-' + seed);
  assert.ok(hs, '洞府门前立起了这幅画');
  assert.deepEqual(hs!.spec, HJ.homeScroll(0, 0, seed).spec, '画里的天地按这幅画的种子');
  // 寻常秘境首领：掉不掉按秘境种子，同一个种子结果一样
  const before = C.bagCount(h, 'misc_guhua'); const got: boolean[] = [];
  for (const sd of [1, 2, 3, 4, 5, 6, 7, 8]) { const c0 = C.bagCount(h, 'misc_guhua'); noRandom(() => H.onBossDown({ ...s.spec, theme: 'cave', seed: sd }), '首领掉古画'); got.push(C.bagCount(h, 'misc_guhua') > c0); }
  assert.ok(got.some(Boolean) && !got.every(Boolean), '寻常秘境的首领有的掉、有的不掉');
  assert.ok(C.bagCount(h, 'misc_guhua') > before);
  pass(`古画：画中洞天打通得一幅、寻常秘境首领按种子掉（8 个种子里掉了 ${got.filter(Boolean).length} 次），挂进洞府就立在门前`);
}
// 9. 第六轮返工：洞府门前挂一两三幅古画——各找一块空地（能站的平地、不压碰撞、不在路面石阶上），不挡洞门，画和画不叠，人走得到每幅画前
{
  const T = g.terrain, S = g.space;
  // 找一处门前平坦的地方当洞府（落脚点附近四面八方都能站）
  let home: { x: number; y: number } | null = null;
  for (let r = 0; r < 40000 && !home; r += 1500) for (let a = 0; a < 8 && !home; a++) {
    const x = hf.x * W0.WORLD_SCALE + Math.cos(a) * r, y = hf.y * W0.WORLD_SCALE + 4000 + Math.sin(a) * r;
    let ok = true; for (let dy = -200; dy <= 600 && ok; dy += 100) for (let dx = -600; dx <= 1100 && ok; dx += 150) if (!T.surface.sample(x + dx, y + dy).walkable || T.walkFactor(x + dx, y + dy) <= 0) ok = false;
    if (ok) home = { x, y };
  }
  assert.ok(home, '找得到一处平地当洞府');
  for (const n of [1, 2, 3]) {
    (g.ws as any).home = { map: W0.ACTIVE_MAP, x: home!.x, y: home!.y };
    (g.ws.flags as any).hjHome = [11, 12, 13].slice(0, n);
    g.teleport(home!.x, home!.y + 300); g.space.update(1, p.x, p.y);
    const sc = noRandom(() => H.scrolls().filter((q) => q.id.startsWith('home-')), '找古画的落点');
    assert.equal(sc.length, n, `挂了 ${n} 幅`);
    for (const q of sc) {
      assert.ok(Math.hypot(q.x - home!.x, q.y - home!.y) >= 260, `不挡洞门：${Math.round(q.x - home!.x)},${Math.round(q.y - home!.y)}`);
      for (let y = q.y + HJ.LINE + HJ.RUN + 100; y > q.y + 20; y -= 20) assert.ok(T.walkFactor(q.x, y) > 0 && T.surface.sample(q.x, y).walkable && !S.blocked(q.x, y), `人走得到画前：${q.id} y+${Math.round(y - q.y)}`);
      for (const o of sc) if (o !== q) assert.ok(Math.abs(o.x - q.x) >= q.w + 100 || Math.abs(o.y - q.y) > HJ.LINE + HJ.RUN + 150, `画和画不叠：${q.id} / ${o.id}`);
    }
  }
  pass('洞府门前挂一、二、三幅古画：各在空地上，不挡门、不相叠，画前走得到');
}
console.log(`\ntest-huajuan：${ok} 组全部通过`);
process.exit(0);
