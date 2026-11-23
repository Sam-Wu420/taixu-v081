// 撼山客第一阶段照参考视频还原（r8-p1）：world/hsmovesp1.ts（新四招）+ 换了动作的七招 + character.ts 的关键帧动作。无头，固定时钟和种子，平地。
//   1. 新四招（断脉腿、撞山靠、顶心膝、影踪连环踢）注册了、谁能用对（撞山靠你也能用，其余只有他）、不带 AI 权重
//   2. 十一招他对着木人都放得出、走完不抛错；伤害走 npcHit；攻力倍数合计、击飞距离和原来一致（七招）/ 和数值表一致（四招）；放招时侧面取景开着
//   3. 他打你：伤害走 hitPlayer（damage 钩子数得到），切磋时收着打
//   4. 你学会撞山靠：法术书里有、能放进技能栏、放得出（hitEnemy）、扣灵力进冷却
//   5. 关键帧动作：每个 p1 动作都挂了；卡帧（关键帧之间不插值）；出手那一帧拉长手脚；多重肢体 / 拖影帧的标记
//   6. 编排：pickCombo 的近身组里挑得到新四招
//   7. 这些招的路径上 Math.random 一次都不取（伤害结算 hitEnemy / hitPlayer / npcHit 自己的除外）
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = Number(process.env.SEED ?? 31), rndCalls = 0, counting = 0;
Math.random = () => { if (counting > 0) rndCalls++; s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const MV = await import('../src/world/brawlmoves');
const HP = await import('../src/world/hsmovesp1');
const HM = await import('../src/world/hsmoves');
const H2 = await import('../src/world/hsmoves2');
const CH = await import('../src/gfx/character');
const { ARTS } = await import('../src/data/arts');
const { setModx } = await import('../src/mod/hooks');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, H = g.hanshan, B = c.brawl as InstanceType<typeof import('../src/world/brawl').BrawlSys>;
const h = g.hero;

// 平地
const T = g.terrain as any;
T.walkFactor = () => 1; T.canTraverse = () => true; T.isLand = () => true;
(g.npcs as unknown as { prestep(dt: number): void }).prestep = () => {};
(g as any).space.blocked = () => false;
c.safeAt = () => false; c.spawnT = 1e9; B.brk.manual = true;
const frame = (dt = 1 / 60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; g.update(dt); c.fxq.length = 0; };
const run = (sec: number, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) frame(dt); };

// 伤害入口：计数 + 记下每一下的攻力倍数（npcHit 的原始伤害 ÷ 出招者攻力）；伤害结算自己的 Math.random 不算在招式头上
const N = { hitEnemy: 0, hitPlayer: 0, npcHit: 0 };
let kSum = 0;
for (const k of ['hitEnemy', 'hitPlayer', 'npcHit'] as const) {
  const f = c[k].bind(c);
  c[k] = (...a: any[]) => { N[k]++; if (k === 'npcHit') kSum += a[2] / Math.max(1e-9, a[0].atk); counting--; try { return f(...a); } finally { counting++; } };
}
// 击飞：记下打飞了谁、多远
const launches: { who: unknown; D: number }[] = [];
{ const f = B.launch.bind(B); (B as any).launch = (e: any, ux: number, uy: number, D: number, ...rest: any[]) => { launches.push({ who: e, D }); return f(e, ux, uy, D, ...rest); }; }
// 招式的 begin / tick / end 里：数 Math.random、记抛出的错
const ALL = ['yicunbeng', 'jingang', 'houfa', 'suodi', 'liuxing', 'yanhui', 'shifang', ...HP.HSP1_IDS];
const errs: string[] = [];
for (const id of ALL) {
  const d = MV.MOVES.get(id)!;
  assert.ok(d, `${id} 注册了`);
  for (const k of ['begin', 'tick', 'end'] as const) {
    const f = (d as any)[k]; if (!f) continue;
    (d as any)[k] = function (...a: unknown[]) { counting++; try { return f.apply(this, a); } catch (e) { errs.push(`${id}.${k}: ${(e as Error).stack}`); throw e; } finally { counting--; } };
  }
}
const home = { x: p.x + 20000, y: p.y };
function summon() {
  c.enemies.length = 0; B.reset(); B.log = []; g.zhenfa.reset();
  p.x = home.x; p.y = home.y; p.flying = false; p.z = 0; h.hp = 1; h.mp = 1; c.invulnT = 0; c.pst = {};
  H.place(p.x + 400, p.y - 300, 'stay');
  for (let i = 0; i < 30 && !H.ent; i++) frame();
  const e = H.ent!; assert.ok(e, '他生成了');
  (H as any).toFight('brawl'); e.aggro = true; e.tgP = false;
  (H as any).brawling = () => { e.hp = e.maxHp; };
  H.autoMoves = false;
  const b = B.peek(e)!; if (b.ai) b.ai.cd = 1e9;
  for (const k of Object.keys(e.skCd)) e.skCd[k] = 0;
  H2.hs2ResetAi(1e9);
  return e;
}
function dummy(dx: number, dy = 0) { const e = H.ent!; const d = B.spawnDummy(e.x + dx, e.y + dy, 3); d.name = '木人桩'; d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e12; return d; }
function fire(id: string, tg: any): boolean {
  if ((HM.HS_BATCH1 as readonly string[]).includes(id)) return H.cast(id as any, tg, false);
  if ((HP.HSP1_IDS as readonly string[]).includes(id)) return HP.performHsP1(H, id, tg, true);
  return H2.performHs2(H, id, tg, true);
}

// 1. 注册、谁能用
{
  for (const id of HP.HSP1_IDS) {
    const m = MV.MOVES.get(id)!;
    assert.ok(ARTS['bxm_' + id], `${id} 进了法术表`);
    assert.ok(!m.ai, `${id} 不带 AI 权重`);
    assert.equal(m.can!(B, null), id === 'zhuangshan', `${id}：你能不能用`);
  }
  const e = summon(); const other = B.spawnBrawler(e.x + 900, e.y, 3, 0);
  for (const id of HP.HSP1_IDS) { assert.equal(MV.MOVES.get(id)!.can!(B, other), false, `${id}：别的体修用不了`); assert.ok(MV.MOVES.get(id)!.can!(B, e), `${id}：他能用`); }
  console.log('1 新四招注册、只有他能用（撞山靠你也能学）：通过');
}

// 2. 十一招对木人：放得出、走完、伤害走 npcHit、攻力倍数合计 / 击飞和原来一致、侧面取景开着
const EXPECT: Record<string, { k?: number; D?: number; kMin?: number }> = {
  yicunbeng: { k: HM.HSM.yicunbeng.k, D: HM.HSM.yicunbeng.D },
  houfa: { k: HM.HSM.houfa.k, D: HM.HSM.houfa.D },
  suodi: { k: HM.HSM.suodi.k, D: HM.HSM.suodi.D },
  jingang: { kMin: 0.4, D: HM.HSM.jingang.D * 0.45 },   // 反震按远近衰减（和原来同一套 affect）
  liuxing: { k: H2.HS2K.liuxing.tick * 13 + H2.HS2K.liuxing.fin, D: 1700 },
  yanhui: { k: H2.HS2K.yanhui.pass * 5 + H2.HS2K.yanhui.fin, D: 1500 },
  shifang: { k: H2.HS2K.shifang.bounce * 7 + H2.HS2K.shifang.fin },
  duanmai: { k: HP.HSP1K.duanmai.k, D: HP.HSP1K.duanmai.D },
  zhuangshan: { k: HP.HSP1K.zhuangshan.k, D: HP.HSP1K.zhuangshan.D },
  dingxin: { k: HP.HSP1K.dingxin.knee + HP.HSP1K.dingxin.fin, D: HP.HSP1K.dingxin.D },
  yingzong: { k: HP.HSP1K.yingzong.tick * 5 + HP.HSP1K.yingzong.fin, D: HP.HSP1K.yingzong.D },
};
const report: string[] = [];
for (const id of ALL) {
  const e = summon();
  const d = dummy(id === 'yingzong' || id === 'suodi' ? 420 : 200, 0);
  if (id === 'jingang') window.setTimeout?.(() => {}, 0);
  const n0 = N.npcHit; kSum = 0; launches.length = 0; rndCalls = 0;
  assert.ok(fire(id, d), `${id}：放得出`);
  let t = 0, side = false;
  if (id === 'jingang') { run(0.25); c.hitEnemy(e, e.maxHp * 0.05, { realm: 9, stCh: 0 }, d.x, d.y); }   // 金刚不坏：让他硬吃一下才反震
  while (B.peek(e)?.move && t < 8) { frame(); t += 1 / 60; side ||= B.sideOn; }
  assert.ok(!B.peek(e)?.move, `${id}：走完了（${t.toFixed(2)} 息）`);
  assert.ok(N.npcHit > n0, `${id}：伤害走 npcHit（${N.npcHit - n0} 下）`);
  assert.ok(side, `${id}：放招时侧面取景开着`);
  const X = EXPECT[id], L = launches.filter((q) => q.who === d);
  if (X.k !== undefined) assert.ok(Math.abs(kSum - X.k) < 1e-6, `${id}：攻力倍数合计 ${kSum.toFixed(3)}，应为 ${X.k.toFixed(3)}`);
  if (X.kMin !== undefined) assert.ok(kSum >= X.kMin, `${id}：反震打中（${kSum.toFixed(3)}）`);
  if (X.D !== undefined) assert.ok(L.some((q) => q.D >= X.D! - 1e-6 && q.D <= (X.k !== undefined ? X.D! + 1e-6 : HM.HSM.jingang.D)), `${id}：击飞 ${L.map((q) => Math.round(q.D)).join('/') || '无'}，应为 ${Math.round(X.D)}`);
  if (id === 'shifang') assert.ok((B.log ?? []).some((l) => l.k === 'hs2-shifang-fin'), '十方弹：最后一下砸地');
  assert.equal(rndCalls, 0, `${id}：招式路径上 Math.random ${rndCalls} 次`);
  report.push(`${id} ${t.toFixed(2)}息 命中${N.npcHit - n0}下 倍数${kSum.toFixed(2)} 击飞${L.map((q) => Math.round(q.D)).join('/') || '-'}`);
}
assert.deepEqual(errs, [], '十一招都没抛错');
console.log('2 十一招对木人：\n   ' + report.join('\n   '));

// 3. 他打你：伤害走 hitPlayer（damage 钩子），新四招都打得到你
{
  let hook = 0;
  setModx(new Proxy({ has: (n: string) => n === 'damage', fire: (_n: string, ctx: any) => { if (ctx.to === 'player') hook++; return ctx; } } as any, { get: (t, k) => (k in t ? (t as any)[k] : () => null) }));
  for (const id of HP.HSP1_IDS) {
    const e = summon(); e.atk = Math.max(1, e.atk * 0.02);
    p.x = e.x + (id === 'yingzong' ? 420 : 200); p.y = e.y; h.hp = 1;
    const n0 = N.hitPlayer, k0 = hook; rndCalls = 0;
    assert.ok(HP.performHsP1(H, id, null, true), `${id}：对你放得出`);
    let t = 0; while (B.peek(e)?.move && t < 8) { frame(); t += 1 / 60; h.hp = Math.max(h.hp, 0.5); }
    assert.ok(N.hitPlayer > n0 && hook > k0, `${id}：打你走 hitPlayer（${N.hitPlayer - n0} 下）`);
    assert.equal(rndCalls, 0, `${id}（打你）：Math.random ${rndCalls} 次`);
    run(1.5);
  }
  setModx(null as any);
  console.log('3 他打你：走 hitPlayer：通过');
}

// 4. 你学会撞山靠
{
  c.enemies.length = 0; B.reset(); B.log = []; H.place(p.x + 60000, p.y, 'stay'); run(0.2);
  h.realm = 3; h.stage = 1; h.hp = 1; h.mp = 1;
  const got = HP.learnHsP1(h);
  assert.deepEqual(got, ['bxm_zhuangshan'], '学会撞山靠');
  assert.ok(h.arts.some((a) => a.id === 'bxm_zhuangshan'), '法术书里有');
  h.hotbar[4] = MV.moveArtId('zhuangshan');
  const d = B.spawnDummy(p.x + 200, p.y, 3); d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e9;
  c.lock = d; c.manual = true;
  const n0 = N.hitEnemy, mp0 = h.mp; launches.length = 0; rndCalls = 0;
  c.castSlot(4);
  assert.ok(B.pMove && B.pMove.def.id === 'zhuangshan', '技能栏放得出');
  let t = 0; while (B.pMove && t < 4) { frame(); t += 1 / 60; }
  assert.ok(N.hitEnemy > n0, '撞中了（hitEnemy）');
  assert.ok(launches.some((q) => q.who === d && q.D >= HP.HSP1K.zhuangshan.D - 1e-6), '撞飞出去');
  assert.ok(h.mp < mp0 - 0.05 && (c.cds.get('bxm_zhuangshan') ?? 0) > 0, '扣灵力、进冷却');
  assert.equal(rndCalls, 0, `你放撞山靠：Math.random ${rndCalls} 次`);
  console.log(`4 你学会撞山靠：${t.toFixed(2)} 息撞飞木人、扣灵力 ${(mp0 - h.mp).toFixed(2)}：通过`);
}

// 5. 关键帧动作：卡帧、拉长手脚、多重肢体 / 拖影帧
{
  const look = { ...CH.HANLI_LOOK };
  const st = new CH.CharState();
  const acts = ['p1Guard', 'p1Cross', 'p1Armor', 'p1Duanmai', 'p1Elbow', 'p1Kao', 'p1Dash', 'p1Jab', 'p1Upper', 'p1HighKick', 'p1SideKick', 'p1Sweep', 'p1JumpKick', 'p1Knee', 'p1Crouch', 'p1FlyKick'] as const;
  for (const a of acts) assert.ok(CH.isKeyTrack(a), `${a} 挂了关键帧`);
  const poseAt = (a: any, t: number) => { st.setAction(a); st.actionT = t; st.blend = 1; st.from = null; return { ...CH.advanceCharacterPose(look as any, st, 0) }; };
  // 卡帧：一寸崩停半拍那一段（0.24 → 0.42 之间）姿势不动（除了发抖：rootX / lean / twist 小幅抖动）
  const a1 = poseAt('p1Cross', 0.26), a2 = poseAt('p1Cross', 0.38);
  for (const k of ['rHip', 'rKn', 'lHip', 'lKn', 'rTx', 'rTy', 'rTz', 'rootY'] as const) assert.ok(Math.abs((a1 as any)[k] - (a2 as any)[k]) < 1e-9, `卡帧：${k} 在两个关键帧之间不变`);
  // 出手那一帧一下切过去，拳臂拉长
  const pre = poseAt('p1Cross', CH.P1T.cross.hit - 0.001), hit = poseAt('p1Cross', CH.P1T.cross.hit + 0.001);
  assert.ok(hit.rTz - pre.rTz > 20, `一帧切到直拳伸满（拳往前 ${(hit.rTz - pre.rTz).toFixed(1)}）`);
  assert.ok(hit.rArmS > 1.25 && hit.rHandS > 1.25 && pre.rArmS === 1, '出手那一帧拳臂拉长、拳头放大，之前原长');
  assert.ok(poseAt('p1Cross', 0.52).rArmS < hit.rArmS && poseAt('p1Cross', 0.7).rArmS === 1, '之后弹回原长');
  const k1 = poseAt('p1Duanmai', CH.P1T.duanmai.hit + 0.01);
  assert.ok(k1.rLegS > 1.3 && k1.lean < -0.8, '断脉腿：出脚那一帧腿拉长、身子后仰成一条线');
  // 画一次（多重肢体、拖影帧在 drawCharacter 里画：这里只确认不抛错、画了不止一份身子）
  let draws = 0;
  const ctx: any = new Proxy({}, { get: (_t, k) => (k === 'getTransform' ? () => ({ a: 1, b: 0 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'save' ? () => { draws++; } : () => {}), set: () => true });
  st.setAction('p1Cross'); st.actionT = CH.P1T.cross.hit + 0.02; st.from = null;
  const d0 = draws; CH.drawCharacter(ctx, look as any, st, 1, 0); const multi = draws - d0;
  st.actionT = 0.3; const d1 = draws; CH.drawCharacter(ctx, look as any, st, 1, 0); const single = draws - d1;
  assert.ok(multi > single * 2, `出手那一帧多画了几份身子（多重肢体）：${multi} / ${single}`);
  console.log('5 关键帧动作：卡帧、拉长手脚、多重肢体：通过');
}

// 6. 编排：近身组里挑得到新四招
{
  summon();
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) for (const id of (H as any).pickCombo(200, H.beast ?? null)) seen.add(id);
  for (const id of HP.HSP1_IDS) assert.ok(seen.has(id), `连招表里挑得到 ${id}`);
  console.log('6 编排：新四招在近身组里：通过');
}
console.log('test-hsp1：全部通过');
process.exit(0);
