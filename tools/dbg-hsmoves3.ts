// 撼山客招式第三批（world/hsmoves3.ts）：虚空三招 + 终结技三招。无头，固定时钟和种子。
//   1. 千钧坠（他打木人桩）：起跳、踩落、伤害走 npcHit、巨坑（大坑留得住）、放射倒树、震屏；落点跟着对手、起跳后定死
//   2. 无极一击：蓄力时天地变黑白（只留两人）、出手有定格特写、拳路上的人都挨（npcHit）、远处山头缺一块（几秒后恢复）
//   3. 无极一击 · 海上（r7-fx3d：分海并进了无极一击）：拳路上是海就同一拳把海劈开（水墙）、线上的人挨；陆上犁出扇形长沟（wreck 的 fan 痕迹）；
//      「分海」不再是单独的招；终结技全屏演出（finisher）和立体特效（fx3d）都报了
//   4. 一拳破界 → 一脚还界（被打的是木人桩）：冲天、出天穹（藏起来）、他追上去、砸回落点（合法、大坑、撞击伤害）、他落回
//   5. 一拳破界 → 借星 → 一脚还界（被打的是你，元婴）：进了虚空（xukong 的状态）、他追进虚空斗法、斗法场里有陨石、一脚把你踢回下界、
//      落回界内（落点合法、大坑、坠地伤害走 hitPlayer、切磋不致死）、他落在你身边；halted 只在虚空那段、没有遮幕
//   6. 被打上天途中（界内那一段）按脱困：停在界内高空
//   7. 终结技频率上限（AI）：一场最多两次、两次隔开；强行出招不受限
//   8. 你学会的两招：法术书里有、能放（千钧坠的坑、伤害走 hitEnemy）；破界不到化神给提示；化神放出来、按追击冲天追上去、在虚空里把它砸回去
//   9. 这一批的招式路径上 Math.random 一次都不取
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 13; const seeded = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
Math.random = seeded;

const G = await import('../src/world/game');
const M3 = await import('../src/world/hsmoves3');
const FX = await import('../src/world/fx3d');
const { MOVES, moveArtId, learnMove } = await import('../src/world/brawlmoves');
const { ARTS } = await import('../src/data/arts');
const { ALT } = await import('../src/world/alt');
const g = await G.createGame(() => {}); g.reset();
const H = g.hanshan, c = g.combat as any, p = g.player, B = g.combat.brawl, xk = g.xukong, F = xk.fight, V = xk.fall;
const S = M3.hs3Of(g);
let h = g.hero;
c.spawnT = 1e9;
const closeAll = () => { for (let i = 0; i < 6 && g.modal; i++) g.closeModal(true); };

// ---- 每帧都查：没有遮幕 / 过场；halted 只在「身在虚空、没在斗法」那段
let watch = false, frames = 0, veil = 0, badHalt = 0, voidHalt = 0;
const held = new Set<string>();
const step = (sec: number, each?: () => void, dt = 1 / 40) => {
  for (let t = 0; t < sec - 1e-9; t += dt) {
    g.paused = false; closeAll(); for (const k of held) g.input.keys.add(k); c.spawnT = 1e9; each?.(); g.update(dt); c.fxq.length = 0;
    // 路人上前搭话（dialog）不算遮幕：那是世界里随机的 NPC，下一步 closeAll 就关；招式本身从不开对话
    if (watch) { frames++; if ((g.modal && g.modal.kind !== 'dialog') || g.nuoyi.active || g.paused) veil++; const talk = g.modal?.kind === 'dialog'; if (g.halted && !talk) { if (xk.phase === 'void' && !F.on) voidHalt++; else badHalt++; } }
  }
};
const until = (cond: () => boolean, max = 20, each?: () => void) => { for (let t = 0; t < max && !cond(); t += 0.05) step(0.05, each); return cond(); };

// ---- 伤害数钩子：hitEnemy / hitPlayer / npcHit
const n = { he: 0, hp: 0, nh: 0 };
for (const [k, key] of [['hitEnemy', 'he'], ['hitPlayer', 'hp'], ['npcHit', 'nh']] as const) { const f = c[k].bind(c); c[k] = (...a: any[]) => { n[key]++; return f(...a); }; }
// ---- Math.random：这一批的招式代码（begin / tick / end）里一次都不取；伤害结算（会心等）不算这一批的路径
let inMove = 0, rnd3 = 0;
const R0 = Math.random; Math.random = () => { if (inMove > 0) rnd3++; return R0(); };
for (const m of Object.values(M3.MOVES_HS3)) for (const k of ['begin', 'tick', 'end', 'can'] as const) { const f = (m as any)[k]; if (f) (m as any)[k] = (...a: any[]) => { inMove++; try { return f.apply(m, a); } finally { inMove--; } }; }
for (const k of ['hitEnemy', 'hitPlayer', 'npcHit']) { const f = c[k]; c[k] = (...a: any[]) => { const s = inMove; inMove = 0; try { return f(...a); } finally { inMove = s; } }; }
{ const f = S.tick.bind(S); S.tick = (dt: number) => { inMove++; try { return f(dt); } finally { inMove--; } }; }
{ const f = S.forceTick.bind(S); S.forceTick = (dt: number) => { inMove++; try { return f(dt); } finally { inMove--; } }; }

// ---- 场地：开阔平地（他待得住）；海边
const T = g.terrain;
const openField = (from: { x: number; y: number }, R0 = 0) => {
  const okF = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2600) || !H.okAt(cx, cy, 1500)) return false;
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) { const x = cx + i * 400, y = cy + j * 300; if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || (g as any).space.blocked(x, y) || c.safeAt(x, y)) return false; if (!T.canTraverse(cx, cy, x, y)) return false; }
    return true;
  };
  for (let r = R0; r <= R0 + 60000; r += 800) { const k = Math.max(1, Math.round(r / 500)); for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r; if (okF(x, y)) return { x, y }; } }
  throw new Error('找不到开阔地');
};
/** 海边：他站的陆地 + 朝海的方向（这一拳劈得开） */
const coast = (from: { x: number; y: number }) => {
  for (let r = 0; r <= 400000; r += 1500) {
    const k = Math.max(1, Math.round(r / 1500));
    for (let i = 0; i < k; i++) {
      const a = i / k * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r;
      if (!H.okAt(x, y, 300) || !S.landOk(x, y)) continue;
      for (let j = 0; j < 8; j++) { const b = j / 8 * Math.PI * 2, ux = Math.cos(b), uy = Math.sin(b); if (M3.seaLine(g, x + ux * 700, y + uy * 700, ux, uy) && B.deepWater(x + ux * 700, y + uy * 700)) return { x, y, ux, uy }; }
    }
  }
  throw new Error('找不到海边');
};

/** 把他摆在 (x, y)、等真人生成；你在旁边 */
const stage = (x: number, y: number, realm: number) => {
  xk.reset(); B.reset(); S.reset(); c.enemies.length = 0;
  h = g.hero; h.realm = realm; h.stage = 1; h.hp = 1; h.mp = 1;
  g.teleport(x - 260, y + 40); p.flying = false; p.z = 0; p.zTarget = 0;
  const s = H.s; s.angryUntil = undefined; s.lastSpar = undefined;
  H.place(x, y, 'stay');
  step(0.3);
  assert.ok(H.ent, '他生成了');
  return H.ent!;
};
const dummy = (x: number, y: number) => { const e = B.spawnDummy(x, y, g.hero.realm); return e; };
const perform = (id: string, tg: any) => { const r = H.perform(id, tg); return r; };
const runOf = () => B.runs.find((r: any) => r.user === H.ent);

// ================================================================ 1. 千钧坠
const field = openField(p, 2000);
{
  const e0 = stage(field.x, field.y, 3);
  const d = dummy(e0.x + 520, e0.y + 60);
  const hp0 = d.hp, nh0 = n.nh, W = c.wreck, fell0 = W.stats.felled;
  assert.ok(perform('qianjunzhui', d), '千钧坠出手');
  assert.ok(runOf()?.def.id === 'qianjunzhui', '在出招');
  // 他跳上了高空
  let top = 0; until(() => { top = Math.max(top, e0.z); return !runOf(); }, 6);
  assert.ok(top > 1000, `跃上高空：${top.toFixed(0)}`);
  assert.ok(S.log.includes('cutin-stomp'), '落地有定格特写（踩落）');
  assert.ok(S.log.includes('qianjun-apex') && S.log.includes('fin-墜'), '高空顿住（光柱标出落点）、落地的终结技全屏演出');
  assert.ok(FX.fx3dOf(g).dents.length > 0, '地面整片塌陷（立体的坑）');
  assert.ok(n.nh > nh0 && d.hp < hp0, `伤害走 npcHit：${hp0} → ${d.hp}`);
  assert.ok(Math.hypot(e0.x - d.x, e0.y - d.y) < 900 || B.isAir(d), '踩在对手身边');
  const pit = [...W.marks, ...((g.ws as any).wreck?.marks ?? [])].find((m: any) => m.k === 'pit' && Math.hypot(m.x - e0.x, m.y - e0.y) < 120);
  assert.ok(pit && pit.r >= 150, `巨坑（留得住的大坑）：${pit?.r}`);
  const felled = W.stats.felled - fell0;
  console.log(`1 千钧坠：跃到 ${top.toFixed(0)}，坑半径 ${pit.r.toFixed(0)}，倒树 ${felled} 棵，木人 ${Math.round(hp0)} → ${Math.round(d.hp)}`);
  // 落点：起跳后一阵还跟着对手，之后定死——你看清了能躲
  const e1 = stage(field.x, field.y, 3);
  B.reset(); c.enemies = c.enemies.filter((q: any) => q === e1);
  p.x = e1.x + 500; p.y = e1.y; p.st.x = p.x; p.st.y = p.y; h.hp = 1;
  const hp1 = h.hp;
  assert.ok(perform('qianjunzhui', null), '对你出千钧坠');
  step(M3.HS3.qianjun.crouch + M3.HS3.qianjun.rise * 0.8);
  // 落点已定：跑开
  p.x += 1100; p.st.x = p.x;
  until(() => !runOf(), 4);
  assert.ok(h.hp >= hp1 - 1e-6, `躲开了（落点定死后跑出圈外）：${hp1} → ${h.hp}`);
  console.log('1b 千钧坠：落点起跳后定死，跑出圈外躲得开');
}

// ================================================================ 2. 无极一击
{
  const e0 = stage(field.x, field.y, 3);
  const d = dummy(e0.x + 480, e0.y + 30);
  const hp0 = d.hp, nh0 = n.nh;
  assert.ok(perform('wuji', d), '无极一击出手');
  // r8-p2：不再整段蓄力天地变黑白——蓄力前半段画面照常，最后 0.3 息才压暗（背景暗、人和火亮着）
  step(0.4);
  assert.ok(S.vis.mono < 0.05 && S.vis.dim < 0.05, `蓄力前半段不压暗、不变灰：${S.vis.mono.toFixed(2)} / ${S.vis.dim.toFixed(2)}`);
  step(0.42);
  assert.ok(S.vis.dim > 0.4 && S.vis.mono < 0.05, `蓄力最后那一下压暗（不是变灰）：${S.vis.dim.toFixed(2)}`);
  assert.ok(S.vis.keep.includes(e0) && S.vis.keep.includes(d), '只有他和对手不压暗');
  assert.ok(S.vis.warns.some((w) => w.k === 'fan'), '地上有一片预警的扇面（拳路）');
  const fin0 = B.impact.stats.fin, ev0 = FX.fx3dOf(g).stats.ev, x00 = e0.x;
  until(() => S.log.includes('wuji-hit'), 3);
  assert.ok(Math.hypot(e0.x - x00, 0) > 250, `踩地冲刺到了它面前：冲了 ${Math.round(Math.abs(e0.x - x00))}`);
  assert.ok(S.log.includes('cutin-fist'), '出手有定格特写（拳头迎面）');
  assert.ok(B.impact.stats.fin > fin0 && S.log.includes('fin-無極'), '终结技全屏演出（白闪、黑白闪、集中线、「無極」大字）');
  assert.ok(FX.fx3dOf(g).stats.ev > ev0 + 10, `立体特效报了：${FX.fx3dOf(g).stats.ev - ev0} 件`);
  assert.ok(n.nh > nh0 && d.hp < hp0, '伤害走 npcHit');
  step(0.3);
  assert.ok(Math.hypot(d.x - e0.x, d.y - e0.y) > 900 || B.isAir(d), `被打的轰飞出去：${Math.round(Math.hypot(d.x - e0.x, d.y - e0.y))}`);
  const fan = [...c.wreck.marks, ...((g.ws as any).wreck?.marks ?? [])].find((m: any) => m.k === 'fan');
  assert.ok(fan && fan.r2 > fan.r && Math.hypot(fan.x2 - fan.x, fan.y2 - fan.y) > 600, `犁出扇形长沟（越往前越宽）：${fan?.r?.toFixed(0)} → ${fan?.r2?.toFixed(0)}`);
  const N = S.vis.notch;
  assert.ok(N && N.depth >= 180 && N.r > 300, '远处山头缺一块');
  step(1); assert.ok(S.vis.notch && S.vis.notch.k > 0.9, '缺口在');
  step(8); assert.equal(S.vis.notch, null, '几秒后恢复');
  assert.ok(S.vis.mono < 0.05, '颜色回来了');
  assert.ok(S.vis.dim < 0.05, '压暗收回去了');
  console.log(`2 无极一击：最后 0.3 息压暗、特写、拳路伤害，远山缺口 半径 ${N!.r.toFixed(0)} 深 ${N!.depth.toFixed(0)}，几秒后长回来`);
}

// ================================================================ 3. 无极一击 · 海上（原来的分海）
{
  assert.ok(!(M3.HS3_IDS as readonly string[]).includes('fenhai') && !('fenhai' in M3.MOVES_HS3), '「分海」不再单列');
  const cs = coast(field);
  const e0 = stage(cs.x, cs.y, 3);
  const d = dummy(cs.x + cs.ux * 780, cs.y + cs.uy * 780);
  d.flyH = 40;
  e0.tgP = false; e0.tgE = d;
  const hp0 = d.hp, nh0 = n.nh, sp0 = c.wreck.splits.length;
  assert.ok(perform('wuji', d), '无极一击出手（海上）');
  until(() => !runOf(), 5);
  assert.ok(S.log.includes('wuji-sea') && c.wreck.splits.length > sp0, '拳路上是海：同一拳把海劈开（破坏系统的 split：两边立水墙）');
  assert.ok(n.nh > nh0 && d.hp < hp0, '拳路上的人挨了（npcHit）');
  console.log('3 无极一击 · 海上：同一拳劈开海面；分海不再单列');
}

// ================================================================ 4. 破界 → 还界（木人桩）
{
  const e0 = stage(field.x, field.y, 3);
  const d = dummy(e0.x + 200, e0.y + 10);
  const hp0 = d.hp, nh0 = n.nh, x0 = d.x, y0 = d.y;
  { const st0 = S.strike.bind(S); (S as any).strike = (...a: any[]) => { const r = st0(...a); console.log('DBG strike', a[4], 'ok', r, 'trip', !!S.trip); return r; }; }
  { const lu0 = S.launchUp.bind(S); (S as any).launchUp = (...a: any[]) => { try { const r = lu0(...a); console.log('DBG launchUp', a[0], 'ret', r, 'trip', !!S.trip, 'logTail', S.log.slice(-3)); return r; } catch (err) { console.log('DBG launchUp ERR', err); throw err; } }; }
  assert.ok(perform('pojie', d), '一拳破界出手');
  until(() => S.log.includes('gone'), 4);
  console.log('DBG pojie', { log: S.log.slice(-8), trip: S.trip && { ph: S.trip.ph, t: S.trip.t, z: S.trip.z }, dh: d.lift, dhz: d.z, hideT: d.hideT, en: c.enemies.includes(d), hp0, hp: d.hp, nh: n.nh - nh0, ward: d.ward && { hp: d.ward.hp, max: d.ward.max }, guardT: d.guardT, dead: d.dead, gone: d.gone, ent: !!H.ent, entAtk: H.ent?.atk });
  assert.ok(S.log.includes('launch-e') && S.log.includes('gone'), '冲天、出了天穹');
  assert.ok(d.hideT > 0, '出了天穹：看不见、打不到');
  assert.ok(S.vis.pillars.length > 0 || S.log.includes('ripple-e'), '冲天的光柱、天上的涟漪');
  until(() => S.log.includes('hs-leap'), 3);
  assert.ok(S.log.includes('hs-leap'), '他追上天去');
  until(() => S.log.includes('drop-back'), 4);
  assert.ok(!(d.hideT > 0) && B.isAir(d), '带着火尾砸回来');
  until(() => !S.trip, 8);
  assert.equal(S.trip, null, '这一趟走完');
  assert.ok(n.nh > nh0 && d.hp < hp0, `伤害走 npcHit：${Math.round(hp0)} → ${Math.round(d.hp)}`);
  assert.ok(S.landOk(d.x, d.y), `落点合法（陆地野外、不在城里）：${Math.round(d.x)},${Math.round(d.y)}`);
  const L = Math.hypot(d.x - x0, d.y - y0);
  const pit = [...c.wreck.marks, ...((g.ws as any).wreck?.marks ?? [])].find((m: any) => m.k === 'pit' && Math.hypot(m.x - d.x, m.y - d.y) < 200);
  assert.ok(pit && pit.r >= 60, `落点有坑：${pit?.r}`);
  assert.ok(c.enemies.includes(e0) && e0.z < 5 && !(e0.hideT > 0), '他落回来了');
  assert.ok(Math.hypot(e0.x - d.x, e0.y - d.y) < 900, '落在它身边');
  console.log(`4 破界 → 还界（木人桩）：落点离出拳处 ${L.toFixed(0)}，坑 ${pit.r.toFixed(0)}`);
}

// ================================================================ 5. 破界 → 借星 → 还界（你）
{
  const e0 = stage(field.x, field.y, 4);
  assert.equal(e0.realm, 5, '他化神');
  c.enemies = c.enemies.filter((q: any) => q === e0);
  assert.ok(H.startSpar(), '切磋');
  p.x = e0.x + 150; p.y = e0.y + 10; p.st.x = p.x; p.st.y = p.y;
  const hp0 = h.hp, hpk0 = n.hp;
  watch = true; frames = veil = badHalt = voidHalt = 0;
  assert.ok(perform('pojie', null), '对你出一拳破界');
  until(() => S.log.includes('launch-p'), 2);
  assert.ok(S.log.includes('launch-p'), '你被打上天');
  until(() => xk.phase === 'climb', 2);
  assert.equal(xk.phase, 'climb', '走飞出天穹的通道（界内那一段）');
  until(() => xk.phase === 'void', 6);
  assert.equal(xk.phase, 'void', '进了虚空');
  until(() => F.on, 6);
  assert.ok(F.on && S.log.includes('hs-void'), '他破界追出来：虚空斗法');
  until(() => S.log.includes('huanjie'), 6);
  assert.ok(S.log.includes('huanjie'), '借星、还界');
  step(0.6);
  assert.ok(S.vis.rocks.length >= 1, `斗法场里有陨石：${S.vis.rocks.length}`);
  until(() => V.mode === 'dropped', 5);
  assert.equal(V.mode, 'dropped', '一脚把你踢回下界');
  const land = { x: S.trip?.lx ?? 0, y: S.trip?.ly ?? 0 };
  until(() => xk.phase === 'none', 15);
  assert.equal(xk.phase, 'none', '落回界内');
  until(() => !B.pb.air, 4);
  until(() => !S.trip, 8);
  watch = false;
  assert.equal(S.trip, null, '这一趟走完');
  assert.ok(Math.hypot(p.x - land.x, p.y - land.y) < 1500, `落在定好的落点附近：${Math.round(Math.hypot(p.x - land.x, p.y - land.y))}`);
  assert.ok(S.landOk(p.x, p.y) || B.deepWater(p.x, p.y), '落点合法');
  assert.ok(!c.safeAt(p.x, p.y), '不在城里');
  const pit = [...c.wreck.marks, ...((g.ws as any).wreck?.marks ?? [])].find((m: any) => m.k === 'pit' && Math.hypot(m.x - p.x, m.y - p.y) < 300);
  assert.ok(pit && pit.r >= 60, `大坑：${pit?.r}`);
  assert.ok(n.hp > hpk0 && h.hp < hp0, `伤害走 hitPlayer：${hp0} → ${h.hp.toFixed(3)}`);
  assert.ok(h.hp > 0 && !h.dead, '切磋不致死');
  assert.ok(c.enemies.includes(e0) && Math.hypot(e0.x - p.x, e0.y - p.y) < 1500, '他落回你身边');
  assert.equal(veil, 0, '没有遮幕 / 过场');
  assert.equal(badHalt, 0, `halted 只在虚空那段（界内 / 斗法里有 ${badHalt} 帧停住）`);
  assert.ok(voidHalt > 0 && voidHalt < frames * 0.4, `虚空那段停住 ${voidHalt} / ${frames} 帧`);
  console.log(`5 破界 → 借星 → 还界（你）：${frames} 帧，虚空里停住 ${voidHalt} 帧、别处 0；坑 ${pit.r.toFixed(0)}；气血 ${hp0} → ${h.hp.toFixed(2)}`);
  H.endSpar('abort');
}

// ================================================================ 6. 被打上天途中按脱困：停在界内高空
{
  const e0 = stage(field.x, field.y, 4);
  p.x = e0.x + 150; p.y = e0.y + 10; p.st.x = p.x; p.st.y = p.y;
  assert.ok(perform('pojie', null), '一拳破界');
  until(() => xk.phase === 'climb', 3);
  step(0.15);
  assert.equal(xk.phase, 'climb');
  assert.ok(B.key('dodge', false), '脱困键被接走');
  const h0 = xk.h;
  step(1);
  assert.equal(xk.phase, 'climb', '停在界内（没出天穹）');
  assert.ok(Math.abs(xk.h - h0) < 5 && xk.h > ALT.max, `停在高空：${h0.toFixed(0)} → ${xk.h.toFixed(0)}`);
  assert.equal(S.trip, null, '这一趟收了');
  assert.ok(S.log.includes('tech-climb'));
  // 按住下降回去
  held.add('descend'); until(() => xk.phase === 'none', 8); held.delete('descend'); g.input.keys.delete('descend');
  assert.equal(xk.phase, 'none', '自己降回去');
  console.log('6 途中脱困：停在界内高空，自己降回去');
}

// ================================================================ 7. 频率上限
{
  const e0 = stage(field.x, field.y, 3);
  S.big = [];
  const d = dummy(e0.x + 500, e0.y);
  e0.tgP = false; e0.tgE = d;
  assert.ok(M3.MOVES_HS3.wuji.can!(B, e0), '头一回：选得到');
  S.useBig();
  assert.ok(!M3.MOVES_HS3.wuji.can!(B, e0) && !M3.MOVES_HS3.qianjunzhui.can!(B, e0), '刚放过：隔开');
  g.time += M3.HS3.bigGap + 1;
  assert.ok(M3.MOVES_HS3.qianjunzhui.can!(B, e0), '隔够了：又能选');
  S.useBig();
  g.time += M3.HS3.bigGap + 1;
  assert.ok(!M3.MOVES_HS3.wuji.can!(B, e0) && !M3.MOVES_HS3.pojie.can!(B, e0), `一场最多 ${M3.HS3.bigMax} 次`);
  S.forcing = true; assert.ok(M3.MOVES_HS3.wuji.can!(B, e0), '强行出招不受限'); S.forcing = false;
  g.time += M3.HS3.bigWin;
  assert.ok(M3.MOVES_HS3.wuji.can!(B, e0), '下一场又有');
  // 别的会近战的人用不了他的招
  const other = B.spawnBrawler(e0.x + 900, e0.y, 3, 1);
  for (const m of Object.values(M3.MOVES_HS3)) assert.ok(!m.can!(B, other), `${m.name}：只有他会`);
  console.log('7 频率：一场最多两次、隔开 25 息；别人用不了');
}

// ================================================================ 8. 你学会的两招
{
  const e0 = stage(field.x, field.y, 2);
  c.enemies.length = 0;   // 他不在场也能用
  h.realm = 2; h.hp = 1; h.mp = 1;
  H.s.taught = ['qianjunzhui', 'pojie'];
  assert.ok(learnMove(h, 'qianjunzhui') && learnMove(h, 'pojie'), '学会');
  assert.ok(ARTS[moveArtId('qianjunzhui')] && ARTS[moveArtId('pojie')], '法术书里有（bxm_）');
  // 千钧坠
  const d = dummy(p.x + 500, p.y + 20);
  c.lock = d; c.manual = true;
  const hp0 = d.hp, he0 = n.he;
  c.cds.clear(); B.castArt(moveArtId('qianjunzhui'));
  assert.ok(B.pMove?.def.id === 'qianjunzhui', '千钧坠放出来了');
  let top = 0; until(() => { top = Math.max(top, B.playerLift + p.z); return !B.pMove; }, 5);
  assert.ok(top > 1000, `你也跃上高空：${top.toFixed(0)}`);
  assert.ok(n.he > he0 && d.hp < hp0, '伤害走 hitEnemy');
  assert.ok(Math.hypot(p.x - d.x, p.y - d.y) < 900 || B.isAir(d), '踩在它身边');
  // 破界：不到化神
  c.cds.clear(); h.mp = 1;
  let toast = ''; const t0 = g.toast.bind(g); (g as any).toast = (s: string, k: any) => { toast = s; return t0(s, k); };
  h.realm = 4; B.castArt(moveArtId('pojie'));
  assert.ok(!B.pMove && /化神/.test(toast), `不到化神给提示：${toast}`);
  // 秘境里（这一界没有虚空可去）
  h.realm = 5; Object.defineProperty(g.mijing, 'active', { get: () => true, configurable: true });
  B.castArt(moveArtId('pojie'));
  assert.ok(!B.pMove && /一拳破界/.test(toast), `没有虚空可去给提示：${toast}`);
  delete (g.mijing as any).active;
  (g as any).toast = t0;
  // 化神：放出来、它冲天；按追击冲天追上去、在虚空里把它砸回去
  step(1.5);
  const d2 = dummy(p.x + 160, p.y + 10); d2.maxHp = d2.hp = d2.maxHp * 3;
  c.lock = d2; c.manual = true; c.cds.clear(); h.mp = 1; S.reset(); S.log.length = 0;
  B.castArt(moveArtId('pojie'));
  assert.ok(B.pMove?.def.id === 'pojie', '一拳破界放出来了');
  until(() => S.log.includes('gone'), 4);
  assert.ok(d2.hideT > 0, '它出了天穹');
  watch = true; frames = veil = badHalt = voidHalt = 0;
  assert.ok(B.key('dodge', false), '追击键：冲天追上去');
  until(() => xk.phase === 'void', 8);
  assert.equal(xk.phase, 'void', '你也出了天穹');
  until(() => F.on && F.handed, 8);
  assert.ok(F.on && F.handed && c.enemies.includes(d2), '在虚空里追上它（斗法）');
  step(0.3);
  // 往下砸：按住下降 + 重击
  if (!B.stance) B.toggleStance();
  h.mp = 1; c.cds.clear(); held.add('descend'); g.input.keys.add('descend'); B.heavy(true); step(0.5); held.delete('descend'); g.input.keys.delete('descend');
  assert.equal(V.mode, 'meteor', '把它砸向下界（坠界）');
  watch = false;
  assert.equal(veil, 0); assert.equal(badHalt, 0, `halted 只在虚空那段：${badHalt}`);
  // 不追：它过几息自己摔回来
  F.finish('force'); xk.reset(); B.reset(); S.reset(); c.enemies.length = 0; g.teleport(field.x, field.y); p.flying = false; p.z = p.zTarget = 0; step(0.3); c.enemies.length = 0;
  const d3 = dummy(p.x + 160, p.y + 10); d3.maxHp = d3.hp = d3.maxHp * 3;
  c.lock = d3; c.manual = true; c.cds.clear(); h.mp = 1; S.log.length = 0;
  const he1 = n.he;
  B.castArt(moveArtId('pojie'));
  until(() => S.log.includes('drop-back'), M3.HS3.pojie.chase + 6);
  until(() => !S.trip, 5);
  assert.ok(!(d3.hideT > 0) && c.enemies.includes(d3), '不追：它自己摔回来');
  assert.ok(n.he > he1, '摔回来的撞击伤害算你的（hitEnemy）');
  assert.ok(S.landOk(d3.x, d3.y), '落点合法');
  console.log(`8 你学会的：千钧坠跃到 ${top.toFixed(0)}；破界不到化神 / 没有虚空给提示；化神打上天、冲天追上去在虚空里砸回去；不追自己摔回来`);
}

// ================================================================ 9. Math.random
assert.equal(rnd3, 0, `这一批的招式路径上 Math.random 取了 ${rnd3} 次`);
console.log('9 Math.random：0 次');
void ALT; void MOVES;
console.log('test-hsmoves3 通过');
