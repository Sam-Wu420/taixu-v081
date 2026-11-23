// r16 噬魂魔尊 · 夜无赦（world/yewushe.ts、yws-core.ts、yws-moves1/2/3.ts）。无头，固定时钟和种子。
//   1. 降临周期：开局给下一次的日子；前三十日出传闻；那天降临（选址在陨魔谷外围、魔门六宗边缘的野地，地图上「魔」字）；四十日不打就走；日推进路径上 Math.random 0 次
//   2. 选址：同一份存档两次选址一样；都在陆地野外、不在城镇宗门里
//   3. 存读档：降临状态、传过的招都存得住；旧存档没有这一项时补上
//   4. 走近生成、走远收起；境界比你高一个大境界、blv ≥ 8（首领血条挂得上）；名牌写境界
//   5. 每招都放得出、走得完、收得了场；伤害走 hitPlayer / npcHit / hitEnemy；招式路径上 Math.random 0 次
//   6. 形态切换：七成进半魔（魔气入体）、四成进魔躯（天魔降身 · 末劫：全程霸体、整屏演出）；脱战变回人身、回满
//   7. 觉醒大招名额：只在魔躯、一场最多两次、两次之间隔一阵；读条喂首领血条
//   8. 魔影随身：出手时按自己的序列追加魔影追打，伤害走 hitPlayer / npcHit
//   9. 打败：掉高阶魔道材料、法宝、灵石（魂镰：物品表里有就掉）；传两招；一千日内不再来
//  10. 学会的招你能放（伤害走 hitEnemy）
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 41; const seeded = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
Math.random = seeded;

const G = await import('../src/world/game');
const YC = await import('../src/world/yws-core');
const YW = await import('../src/world/yewushe');
const FX = await import('../src/world/fx3d');
const P2 = await import('../src/world/hsp2');
const { moveArtId, MOVES } = await import('../src/world/brawlmoves');
const { pickBoss } = await import('../src/ui/BossHUD');
const { ITEMS } = await import('../src/data/items');
const g = await G.createGame(() => {}); g.reset();
const Y = g.yewushe, c = g.combat as any, p = g.player, B = g.combat.brawl;
let h = g.hero;
c.spawnT = 1e9;
const closeAll = () => { for (let i = 0; i < 6 && g.modal; i++) g.closeModal(true); };
const step = (sec: number, each?: () => void, dt = 1 / 40) => { for (let t = 0; t < sec - 1e-9; t += dt) { g.paused = false; closeAll(); c.spawnT = 1e9; each?.(); g.update(dt); c.fxq.length = 0; } };
const until = (cond: () => boolean, max = 20, each?: () => void) => { for (let t = 0; t < max && !cond(); t += 0.05) step(0.05, each); return cond(); };

// ---- 伤害数钩子
const n = { he: 0, hp: 0, nh: 0 };
for (const [k, key] of [['hitEnemy', 'he'], ['hitPlayer', 'hp'], ['npcHit', 'nh']] as const) { const f = c[k].bind(c); c[k] = (...a: any[]) => { n[key]++; return f(...a); }; }
// ---- Math.random：招式代码（begin / tick / end / can）、首领每帧那一份（编排、走位、魔影）、日推进里一次都不取（伤害结算本身不算）
let inMove = 0, rndN = 0;
const R0 = Math.random; Math.random = () => { if (inMove > 0) rndN++; return R0(); };
const wrapMoves = () => { for (const m of YC.YWS_MOVES.values()) for (const k of ['begin', 'tick', 'end', 'can'] as const) { const f = (m as any)[k]; if (f && !f.__w) { const w = (...a: any[]) => { inMove++; try { return f.apply(m, a); } finally { inMove--; } }; (w as any).__w = 1; (m as any)[k] = w; } } };
wrapMoves();
for (const k of ['hitEnemy', 'hitPlayer', 'npcHit']) { const f = c[k]; c[k] = (...a: any[]) => { const s = inMove; inMove = 0; try { return f(...a); } finally { inMove = s; } }; }
for (const k of ['tick', 'schedule', 'daily'] as const) { const f = (Y as any)[k].bind(Y); (Y as any)[k] = (...a: any[]) => { inMove++; try { return f(...a); } finally { inMove--; } }; }

// ---- 场地：开阔平地（照 tools/try-hanshan.ts 的 openField）
const T = g.terrain;
const openField = (from: { x: number; y: number }, R0 = 0) => {
  const okF = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2600) || !g.hanshan.okAt(cx, cy, 1500)) return false;
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) { const x = cx + i * 400, y = cy + j * 300; if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || (g as any).space.blocked(x, y) || c.safeAt(x, y)) return false; if (!T.canTraverse(cx, cy, x, y)) return false; }
    return true;
  };
  for (let r = R0; r <= R0 + 60000; r += 800) { const k = Math.max(1, Math.round(r / 500)); for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r; if (okF(x, y)) return { x, y }; } }
  throw new Error('找不到开阔地');
};
const field = openField(p, 2000);
{ const zf = (g as any).zhenfa; if (zf) zf.update = () => {}; }   // 场地附近要是有阵法，你被打飞进去会被阵法打倒、送回城（和他无关），整个测试里阵法不动
const parkHanshan = () => { g.hanshan.place(p.x + 90000, p.y, 'stay'); };   // 撼山客挪远（别凑进来）
/** 摆场：他降临在 (x, y)，你在旁边 */
const stage = (x: number, y: number, realm = 3, dist = 900) => {
  B.reset(); c.enemies.length = 0; Y.force = false; Y.autoMoves = true;
  h = g.hero; h.realm = realm; h.stage = 1; h.hp = 1; h.mp = 1; h.dead = false;
  g.teleport(x - dist, y + 40); p.flying = false; p.z = 0; p.zTarget = 0;
  parkHanshan();
  Y.descendNow({ x, y }, true);
  step(0.1);
  assert.ok(Y.ent, '他生成了');
  return Y.ent!;
};
const dummy = (x: number, y: number) => { const e = B.spawnDummy(x, y, g.hero.realm); e.maxHp = e.hp = e.maxHp * 50; return e; };
const runOf = () => B.runs.find((r: any) => r.user === Y.ent);

// ================================================================ 1. 降临周期
{
  delete (g.ws.flags as any).yewushe;
  const day0 = Math.floor(g.day), s = Y.s;
  assert.ok(s.next >= day0 + YC.YWS.first[0] && s.next <= day0 + YC.YWS.first[1], `开局给了下一次的日子：第 ${s.next - day0} 日后`);
  parkHanshan();
  const r0 = rndN;
  const news = () => (g.ws as any).news?.length ?? 0;
  const nw0 = news();
  Y.schedule(s.next - YC.YWS.rumorLead - 1); assert.ok(!s.rumored, '传闻前一天：没有');
  Y.schedule(s.next - YC.YWS.rumorLead); assert.ok(s.rumored && Y.log.includes('rumor'), '降临前三十日：江湖传闻');
  Y.schedule(s.next);
  assert.ok(s.cur, '那天：降临');
  assert.ok(Y.log.includes('descend'), '天降血光（公告）');
  assert.ok(news() > nw0, '大事记里有');
  const cur = s.cur!;
  assert.ok(Y.siteOk(cur.x, cur.y), '降临处：陆地野外、离城镇宗门远');
  const zx = 300 * 300, zy = 592 * 300, dz = Math.hypot(cur.x - zx, cur.y - zy);
  assert.ok(dz < 22000 && cur.x < zx + 3000, `在陨魔谷外围、偏魔门六宗那边（离陨魔谷 ${Math.round(dz)}）`);
  const mk = Y.marks(); assert.ok(mk.length === 1 && mk[0].glyph === '魔', '地图上「魔」字');
  assert.ok(g.mapMarks().some((m) => m.glyph === '魔'), '地图标记接进了 game.mapMarks');
  assert.ok(g.chances().some((x) => x.t.includes('夜无赦')), '大事记「眼下机缘」里有');
  Y.schedule(cur.until); assert.ok(s.cur, '第四十日还在');
  Y.schedule(cur.until + 1); assert.ok(!s.cur && Y.log.includes('leave'), '四十日不打：走了');
  const gap = s.next - (cur.until + 1);
  assert.ok(gap >= YC.YWS.gap[0] && gap <= YC.YWS.gap[1], `下一次隔 ${gap} 日`);
  // 元婴以后更勤
  h.realm = 4; Y.schedule(s.next); const c2 = s.cur!; Y.schedule(c2.until + 1); const gap2 = s.next - (c2.until + 1); h.realm = 3;
  assert.ok(gap2 >= YC.YWS.gapYy[0] && gap2 <= YC.YWS.gapYy[1], `元婴以后隔 ${gap2} 日`);
  assert.equal(rndN - r0, 0, '日推进路径上 Math.random 0 次');
  console.log(`1 降临周期：开局 ${s.n} 次降临；传闻 → 降临（离陨魔谷 ${Math.round(dz)}）→ 四十日离开；间隔 ${gap} / 元婴后 ${gap2} 日`);
}

// ================================================================ 2. 选址：同一种子一样、都是野地
{
  const s = Y.s, pts: string[] = [];
  for (let k = 0; k < 6; k++) {
    const { mulberry32 } = await import('../src/core/rng');
    const { hash32 } = await import('../src/world/brawlrng');
    const a = Y.pickSite(mulberry32(hash32(s.seed, k, 0xd35))), b = Y.pickSite(mulberry32(hash32(s.seed, k, 0xd35)));
    assert.deepEqual(a, b, '同一种子两次选址一样');
    assert.ok(Y.siteOk(a.x, a.y), `第 ${k} 次选址是野地`);
    assert.ok(!c.safeAt(a.x, a.y) && !T.inLocZone(a.x, a.y, 1800), '不在宗门安全区里');
    pts.push(`${Math.round(a.x / 300)},${Math.round(a.y / 300)}`);
  }
  // 避开阵法：降临处旁边有一座阵（敌阵、禁制），这里就不算野地
  { const Z = (g as any).zhenfa, q = Y.pickSite((await import('../src/core/rng')).mulberry32(7)); assert.ok(Y.siteOk(q.x, q.y), '先找一处野地'); const inst = { x: q.x + 900, y: q.y, r: 400, dead: false }; Z.list.push(inst); assert.ok(!Y.siteOk(q.x, q.y), '旁边两千二以内有阵法：不降在这里'); Z.list.splice(Z.list.indexOf(inst), 1); assert.ok(Y.siteOk(q.x, q.y), '阵法撤了又可以'); }
  console.log('2 选址：' + pts.join('  '));
}

// ================================================================ 3. 存读档
{
  const s = Y.s; Y.schedule(s.next);
  const cur = { ...s.cur! }; s.taught = ['yws_huixuan'];
  assert.ok(g.save(0), '存档');
  (g.ws.flags as any).yewushe.cur = null;
  assert.ok(g.load(), '读档');
  const s2 = Y.s;
  assert.deepEqual(s2.cur, cur, '降临状态存住了');
  assert.deepEqual(s2.taught, ['yws_huixuan'], '传过的招存住了');
  step(0.05);
  assert.ok(g.hero.arts.some((a) => a.id === moveArtId('yws_huixuan')), '读档后法术书里补上传过的招');
  delete (g.ws.flags as any).yewushe; g.save(0); g.load();
  assert.ok(Number.isFinite(Y.s.next) && !Y.s.cur, '旧存档（没有他）读进来补上');
  h = g.hero; h.arts = h.arts.filter((a) => !a.id.startsWith('bxm_yws_'));
  console.log('3 存读档：降临状态、传过的招存得住；旧存档补上');
}

// ================================================================ 4. 走近生成、走远收起、境界、首领血条
{
  const e = stage(field.x, field.y, 3, 3000);
  assert.ok((e as any).shell, '由他自己驱动（shell）');
  assert.equal(e.realm, g.hero.realm + 1, '比你高一个大境界');
  assert.ok(e.blv >= 8 && e.boss, 'blv ≥ 8（首领血条）');
  assert.ok(e.rankText.includes('魔尊') && !e.rankText.includes('妖兽'), `名牌写境界：${e.rankText}`);
  assert.equal(Y.mode, 'idle', '你还没走近：站着');
  g.teleport(field.x - 1200, field.y); step(0.3);
  assert.equal(Y.mode, 'fight', '走进一千七：开打');
  assert.equal(pickBoss(g, null), e, '首领血条挂上他');
  g.teleport(field.x - 9800, field.y); step(0.2);
  assert.ok(!Y.ent && !c.enemies.includes(e), '走远：收起');
  g.teleport(field.x - 6000, field.y); step(0.2);
  assert.ok(Y.ent, '再走近：又生成');
  assert.equal(Y.ent!.hp, Y.ent!.maxHp, '回满');
  console.log(`4 生成：${e.rankText}，blv ${e.blv}；走近开打、首领血条挂上；走远收起、再来回满`);
}

// ================================================================ 5. 每招（每个形态的版本）都放得出、走得完、没被打断；伤害走 npcHit；Math.random 0
{
  const e0 = stage(field.x, field.y, 3, 3000);
  Y.autoMoves = false;
  wrapMoves();
  const rows: string[] = [], r0 = rndN; let maxErr = 0, nHits = 0;
  const FRAMES = new Set((await import('../src/world/yewushe-anim')).YWS_FRAMES);
  // 画面线帧表（yewushe-anim.ts 的 YWS_MOVES，规格书「招式 id 一览」）里的招 id：view().anim 必须是其中之一
  const ART_IDS = new Set(['duohun', 'pugong', 'moqi', 'kongzhan', 'luohun', 'tianmo', 'mo_pugong', 'shehun', 'xuelian', 'liehun', 'bengyue', 'huixuan', 'youming', 'jielun', 'jieguang', 'lieying', 'mingchu', 'moyi_summon', 'moquan', 'menyan', 'xuanming', 'benneng', 'zhongyan', 'pingzhang', 'guimen', 'moshen', 'moshen2', 'mosiao', 'tianqing', 'kuangxiang', 'xianjing', 'mieshi', 'kuangnu', 'mieshi_ring', 'shixian', 'mochao', 'moyi']), anims = new Set<string>();
  const noDmg = new Set(['yws_duohun', 'yws_pingzhang']);
  for (const m of YC.YWS_MOVES.values()) {
    const cells: string[] = [];
    for (const form of m.forms) {
      B.reset(); c.enemies = c.enemies.filter((x: any) => x === e0); B.body(e0).air = false;
      Y.mode = 'fight'; (Y as any).fight ??= { t0: g.time, big: [], react: 9, ph: 'probe', phT: 0, len: 9, queue: [], qi: 0, gap: 0, atkT: 9, leashT: 0, hits: [], hp: e0.hp, strafe: 1 };
      Y.setForm(form as any);
      e0.x = field.x; e0.y = field.y; e0.flyH = 0; e0.lift = 0; e0.hp = e0.maxHp; if (e0.cs) { e0.cs.x = e0.x; e0.cs.y = e0.y; }
      const d = dummy(e0.x + (m.far ? 520 : 200), e0.y + 10);
      Y.clearCd(); Y.force = true;
      const hp0 = d.hp, nh0 = n.nh, ev0 = FX.fx3dOf(g).stats.ev;
      Y.fire(m.id, d, true);
      assert.equal(runOf()?.def.id, m.id, `${m.id}（${form}）出手`);
      let air = false, rd: any = null;
      const done = until(() => !runOf(), 14, () => { if (B.body(e0).air) air = true; const rr = runOf(); if (rr) rd = rr.data; { const sv = Y.view(); const sp = sv?.sprites[0]; assert.ok(sp && FRAMES.has(sp.key) && Number.isFinite(sp.x + sp.y + sp.z + sp.H + sp.sx + sp.sy + sp.rot) && (sp.ghosts ?? []).every((q) => Number.isFinite(q.x + q.y + q.alpha)), `${m.id}（${form}）立板帧 ${sp?.key}`); } const v = Y.state(); if (v?.move) { assert.ok(v.anim && ART_IDS.has(v.anim), `${m.id}（${form}）view().anim = ${v.anim} 在画面线的帧表里`); anims.add(v.anim); } });
      assert.ok(done, `${m.id}（${form}）走完收场`);
      assert.ok(!air, `${m.id}（${form}）没被打断（他自己没被撞飞）`);
      if (!noDmg.has(m.id)) assert.ok(n.nh > nh0 && d.hp < hp0, `${m.id}（${form}）伤害走 npcHit：${n.nh - nh0} 下`);
      assert.ok(FX.fx3dOf(g).stats.ev > ev0, `${m.id}（${form}）立体特效报了`);
      // 对时：出手时刻和画面线帧表（ywsHits）一致，误差 ±1 帧（40 毫秒）；整招时长 = 各段 ywsMoveLen 之和
      const plan = YC.ywsPlan(rd.seq, form as any), log = rd.hitLog as { anim: string; i: number; T: number; want: number }[];
      assert.equal(log.length, plan.hits.length, `${m.id}（${form}）出手次数 = 帧表 ${plan.hits.length} 下（${rd.seq.join('→')}）`);
      for (let i = 0; i < plan.hits.length; i++) { const h = plan.hits[i], L = log[i]; assert.ok(L.anim === h.anim && L.i === h.i && Math.abs(L.T - h.t) <= 0.04 + 1e-6, `${m.id}（${form}）${h.anim} 第 ${h.i + 1} 下：帧表 ${Math.round(h.t * 1000)} 毫秒，实际 ${Math.round(L.T * 1000)}`); maxErr = Math.max(maxErr, Math.abs(L.T - h.t)); }
      assert.ok(Math.abs(rd.T - plan.total) <= 0.04 + 1e-6, `${m.id}（${form}）整招 ${Math.round(rd.T * 1000)} 毫秒，帧表 ${Math.round(plan.total * 1000)}`);
      nHits += plan.hits.length;
      cells.push(`${form} ${rd.seq.join('→')} ${Math.round(plan.total * 1000)}ms/${plan.hits.length} 下（伤 ${n.nh - nh0}）`);
      Y.force = false;
    }
    rows.push(`${m.name}（${m.id}）${cells.join(' / ')} 下`);
  }
  step(1.5);
  const V = P2.hsp2Of(g).vis;
  assert.ok(V.black < 0.01 && V.wash[3] < 0.01 && V.dim < 0.01, '收场后画面干净恢复');
  assert.equal(rndN - r0, 0, `招式路径上 Math.random 取了 ${rndN - r0} 次`);
  console.log(`5 ${rows.length} 招都放得出、走得完；对时 ${nHits} 下出手、最大误差 ${Math.round(maxErr * 1000)} 毫秒（view().anim 用到帧表 ${anims.size} 个 id）：\n   ` + rows.join('\n   '));
}

// ================================================================ 5c. 招里分支的变体也对时（落魂锤、魔躯落魂锤、劫光、狂怒撕裂 → 灭世冲击）
{
  const e0 = stage(field.x, field.y, 3, 3000);
  Y.autoMoves = false;
  const rows: string[] = [];
  for (const [id, form, seq] of [['yws_sanshi', 'half', ['pugong', 'luohun']], ['yws_sanshi', 'demon', ['mo_pugong', 'luohun']], ['yws_jielun', 'demon', ['jielun', 'jieguang']], ['yws_mieshi', 'demon', ['kuangnu', 'mieshi_ring']]] as const) {
    B.reset(); c.enemies = c.enemies.filter((x: any) => x === e0); B.body(e0).air = false;
    Y.mode = 'fight'; (Y as any).fight ??= { t0: g.time, big: [], react: 9, ph: 'probe', phT: 0, len: 9, queue: [], qi: 0, gap: 0, atkT: 9, leashT: 0, hits: [], hp: e0.hp, strafe: 1 }; Y.setForm(form);
    e0.x = field.x; e0.y = field.y; e0.flyH = 0; e0.lift = 0; e0.hp = e0.maxHp; if (e0.cs) { e0.cs.x = e0.x; e0.cs.y = e0.y; }
    const d = dummy(e0.x + 200, e0.y + 10);
    Y.clearCd(); Y.forceSeq = [...seq]; Y.fire(id, d, true); Y.forceSeq = null;
    let rd: any = null; until(() => !runOf(), 14, () => { const r = runOf(); if (r) rd = r.data; });
    const plan = YC.ywsPlan([...seq], form), log = rd.hitLog;
    assert.deepEqual(rd.seq, [...seq], `${id}（${form}）走 ${seq.join('→')}`);
    assert.equal(log.length, plan.hits.length, `${id}（${form}）出手次数`);
    plan.hits.forEach((h, i) => assert.ok(Math.abs(log[i].T - h.t) <= 0.04 + 1e-6, `${id}（${form}）${h.anim} 第 ${h.i + 1} 下：帧表 ${Math.round(h.t * 1000)}，实际 ${Math.round(log[i].T * 1000)}`));
    assert.ok(Math.abs(rd.T - plan.total) <= 0.04 + 1e-6, `${id}（${form}）整招时长`);
    rows.push(`${id} ${form} ${seq.join('→')} ${Math.round(plan.total * 1000)}ms/${plan.hits.length} 下`);
  }
  console.log('5c 变体对时：' + rows.join('；'));
}

// ================================================================ 5b. 冲你放：伤害走 hitPlayer
{
  const e0 = stage(field.x, field.y, 3, 3000);
  Y.autoMoves = false;
  const noDmg = new Set(['yws_duohun', 'yws_pingzhang']);
  let nOk = 0;
  for (const m of YC.YWS_MOVES.values()) {
    if (noDmg.has(m.id)) continue;
    B.reset(); c.enemies = c.enemies.filter((x: any) => x === e0); B.body(e0).air = false;
    Y.mode = 'fight'; (Y as any).fight ??= { t0: g.time, big: [], react: 9, ph: 'probe', phT: 0, len: 9, queue: [], qi: 0, gap: 0, atkT: 9, leashT: 0, hits: [], hp: e0.hp, strafe: 1 }; Y.setForm(m.forms[0] as any);
    e0.x = field.x; e0.y = field.y; e0.flyH = 0; e0.lift = 0; e0.hp = e0.maxHp; if (e0.cs) { e0.cs.x = e0.x; e0.cs.y = e0.y; }
    h.dead = false; h.hp = 1; g.teleport(e0.x + (m.far ? 520 : 200), e0.y + 10); p.z = 0;
    Y.clearCd(); Y.force = true;
    const hp0 = n.hp;
    Y.fire(m.id, null, true);
    assert.equal(runOf()?.def.id, m.id, `${m.id} 冲你出手`);
    until(() => !runOf(), 14, () => { h.dead = false; h.hp = 1; });
    assert.ok(n.hp > hp0, `${m.id} 打你走 hitPlayer`);
    nOk++; Y.force = false;
  }
  h.dead = false;
  console.log(`5b 冲你放的 ${nOk} 招伤害都走 hitPlayer`);
}

// ================================================================ 6. 形态切换
{
  const e = stage(field.x, field.y, 3, 600);
  step(0.3); assert.equal(Y.mode, 'fight', '开打');
  Y.autoMoves = false; until(() => !runOf(), 4);
  assert.equal(Y.form, 'human', '开场人身');
  e.hp = e.maxHp * 0.69;
  until(() => runOf()?.def.id === 'yws_ruti', 1);
  assert.equal(runOf()?.def.id, 'yws_ruti', '七成：放魔气入体');
  assert.ok(P2.hsCine(g), '变身时收起界面（hsCine）');
  until(() => !runOf(), 4);
  assert.equal(Y.form, 'half', '进半魔');
  e.hp = e.maxHp * 0.39;
  let wash = 0, dim = 0;
  until(() => runOf()?.def.id === 'yws_jiangshen', 1);
  assert.equal(runOf()?.def.id, 'yws_jiangshen', '四成：放天魔降身 · 末劫');
  assert.ok(Y.ultOf(e) > 0, '变身读条（首领血条的蓄力条）');
  until(() => !runOf(), 5, () => { wash = Math.max(wash, P2.hsp2Of(g).vis.wash[3]); dim = Math.max(dim, P2.hsp2Of(g).vis.dim); });
  assert.equal(Y.form, 'demon', '进魔躯');
  assert.ok(wash > 0.3 && dim > 0.3, `整屏演出（变色 ${wash.toFixed(2)}、压暗 ${dim.toFixed(2)}）`);
  assert.ok(B.body(e).iron && Y.armored && !B.launchable(e), '魔躯全程霸体：打不飞');
  assert.ok((e as any).keepH > 400, '魔躯立板高（后期留色遮罩按它）');
  assert.equal(Y.state()!.form, 'demon', 'view() 给出形态');
  { // 立板：view() 交给 bossthings 一张 BossSprite（帧在帧表里、魔躯三个半人高）；首领打 bossHD 要等 hdReady
    const AN = await import('../src/world/yewushe-anim'); const FR = new Set(AN.YWS_FRAMES);
    Y.hdReady = true; const v = Y.view()!, sp = v.sprites[0];
    assert.ok(v.sprites.length === 1 && FR.has(sp.key) && sp.key.startsWith('yws_m_'), `立板帧 ${sp.key}`);
    assert.ok(sp.H > 175 * 3, `魔躯立板高 ${Math.round(sp.H)}（三个半人高）`); assert.ok(Math.abs(sp.x - e.x) < 1e-6 && Math.abs(sp.y - e.y) < 1e-6, '立板就在他脚下（位移不叠两次）');
    assert.ok((e as any).bossHD === true, 'hdReady 后打上 bossHD'); Y.hdReady = false; Y.view(); assert.ok(!(e as any).bossHD, '贴图没好：不打');
  }
  // 魔躯的连招表
  const all = new Set<string>(); for (let i = 0; i < 40; i++) for (const id of Y.pickCombo(i % 2 ? 300 : 800)) all.add(id);
  assert.ok(all.has('yws_liehun') && all.has('yws_moshen2') && !all.has('yws_ruti') && !all.has('yws_duohun'), '魔躯：换了招表（裂魂爪、犁魂……，没有堕魂诀）');
  // 脱战：变回人身、回满
  g.teleport(e.x - 5200, e.y); step(YC.YWS.leashT + 0.6);
  assert.ok(Y.mode === "idle" && Y.form === "human" && e.hp === e.maxHp, '跑远脱战：回到降临处、人身、回满');
  console.log(`6 形态：人身 → 七成魔气入体 → 半魔 → 四成天魔降身（变色 ${wash.toFixed(2)}、霸体）→ 魔躯；脱战变回人身回满`);
}

// ================================================================ 7. 觉醒大招名额、读条
{
  const e = stage(field.x, field.y, 3, 600);
  step(0.3); Y.autoMoves = false; until(() => !runOf(), 4);
  assert.ok(!Y.bigOk(), '人身：没有大招名额');
  Y.setForm('demon');
  assert.ok(Y.bigOk(), '魔躯：有');
  Y.useBig(); assert.ok(!Y.bigOk(), '刚放过一次：要隔一阵');
  g.time += YC.YWS.bigGap + 1; assert.ok(Y.bigOk(), '隔够了：第二次');
  Y.useBig(); g.time += YC.YWS.bigGap + 1; assert.ok(!Y.bigOk(), '一场两次用完');
  // 走 fire（编排用的那条路）：觉醒一放得出、读条；紧接着觉醒二放不出；隔够了放得出；两次用完都放不出；极恶魔潮不占名额
  {
    const F0 = (Y as any).fight; F0.big = []; Y.clearCd(); h.dead = false; h.hp = 1;
    assert.ok(Y.fire('yws_shixian', null), '魔躯：觉醒一放得出');
    assert.ok(Y.ultOf(e) > 0 && Y.ult?.name.includes('混沌弑仙'), '觉醒一读条');
    assert.ok(P2.hsCine(g), '觉醒时界面收起（hsCine）');
    until(() => !runOf(), 8, () => { h.dead = false; h.hp = 1; });
    Y.clearCd(); assert.ok(!Y.fire('yws_moyi', null), '刚放过：觉醒二要等');
    assert.ok(Y.fire('yws_mochao', null) && F0.big.length === 1, '极恶魔潮不占名额'); until(() => !runOf(), 8, () => { h.dead = false; h.hp = 1; });
    g.time += YC.YWS.bigGap + 1; Y.clearCd(); assert.ok(Y.fire('yws_moyi', null), '隔够了：觉醒二'); until(() => !runOf(), 8, () => { h.dead = false; h.hp = 1; });
    g.time += YC.YWS.bigGap + 1; Y.clearCd(); assert.ok(!Y.fire('yws_shixian', null) && F0.big.length === 2, '一场两次用完：不再放');
    Y.setForm('half'); Y.clearCd(); F0.big = []; assert.ok(!Y.fire('yws_shixian', null), '不是魔躯：不放觉醒');
  }
  Y.tele('测试', 2); assert.ok(Y.ultOf(e) > 0 && Y.ultOf(e) < 1, '读条喂首领血条');
  step(2.1); assert.equal(Y.ultOf(e), 0, '读完收起');
  void e;
  console.log('7 觉醒大招：只在魔躯、一场两次、两次之间隔一阵；读条喂首领血条');
}

// ================================================================ 8. 魔影随身
{
  const e = stage(field.x, field.y, 3, 3000);
  Y.autoMoves = false; Y.mode = 'fight';
  (Y as any).fight = { t0: g.time, big: [], react: 9, ph: 'probe', phT: 0, len: 9, queue: [], qi: 0, gap: 0, atkT: 9, leashT: 0, hits: [], hp: e.hp, strafe: 1 };
  const d = dummy(e.x + 220, e.y + 10);
  const s0 = Y.log.filter((x) => x === 'shadow').length, sh0 = Y.log.filter((x) => x === 'shadow-hit').length, nh0 = n.nh, r0 = rndN;
  for (let i = 0; i < 12; i++) { Y.clearCd(); Y.fire('yws_sanshi', d, true); until(() => !runOf(), 3); step(0.8); }
  const s1 = Y.log.filter((x) => x === 'shadow').length - s0, sh1 = Y.log.filter((x) => x === 'shadow-hit').length - sh0;
  assert.ok(s1 >= 1 && s1 < 12, `十二次出手追加了 ${s1} 次魔影（按自己的序列，有几成几率）`);
  assert.ok(sh1 >= 1 && n.nh > nh0, `魔影打中 ${sh1} 下（走 npcHit）`);
  assert.equal(rndN - r0, 0, '魔影路径上 Math.random 0 次');
  console.log(`8 魔影随身：十二次出手追加 ${s1} 次、打中 ${sh1} 下`);
}

// ================================================================ 9. 打败：掉落、传招、一千日不来
{
  const e = stage(field.x, field.y, 3, 600);
  step(0.3); assert.equal(Y.mode, 'fight');
  h.arts = h.arts.filter((a) => !a.id.startsWith('bxm_yws_'));
  const ls0 = (await import('../src/world/cultivation')).bagCount(h, 'mat_lingshi');
  const day = Math.floor(g.day), beats0 = Y.s.beats;
  e.hp = 1; c.hitEnemy(e, 1e9, 3, 'p');   // 你的一击（走 hitEnemy → 他的 veto 接住、放倒下的那一段）
  step(0.1);
  assert.equal(Y.mode, 'dying', '倒下');
  assert.equal(Y.s.beats, beats0 + 1, '记一次打败');
  assert.ok(!Y.s.cur && Y.s.next >= day + YC.YWS.rest, `一千日内不再来（下一次第 ${Y.s.next - day} 日后）`);
  const C = await import('../src/world/cultivation');
  assert.ok(C.bagCount(h, 'mat_lingshi') > ls0, '灵石');
  assert.ok(YW.YWS_MATS.some(([id]) => C.bagCount(h, id) > 0), '高阶魔道材料');
  assert.ok(YW.YWS_TREASURE.some((id) => C.bagCount(h, id) > 0), '法宝');
  const sc = Y.log.filter((x) => x.startsWith('scythe-')).pop()!;
  for (let t = 0; t <= 6; t++) assert.ok(ITEMS['wpn_scythe_' + t], `物品表里有魂镰 wpn_scythe_${t}`);
  assert.equal(ITEMS.wpn_scythe_6.name, '噬魂本命魂镰', '最高阶是噬魂本命魂镰');
  assert.ok(sc !== 'scythe-none' && sc.startsWith('scythe-wpn_scythe_') && C.bagCount(h, sc.slice(7)) > 0, `魂镰真的掉了：${sc}`);
  const learned = YW.YWS_TEACH.filter((id) => h.arts.some((a) => a.id === moveArtId(id)));
  assert.equal(learned.length, 2, `传两招：${learned.join('、')}`);
  step(2); assert.ok(!Y.ent, '倒下后收起');
  // 第二次：再传两招
  Y.s.cur = null; Y.descendNow({ x: field.x, y: field.y }, true); step(0.1);
  g.teleport(field.x - 600, field.y); step(0.3);
  Y.ent!.hp = 1; c.hitEnemy(Y.ent!, 1e9, 3, 'p'); step(0.1);
  const learned2 = YW.YWS_TEACH.filter((id) => h.arts.some((a) => a.id === moveArtId(id)));
  assert.equal(learned2.length, 4, '第二次打败：四招都会了');
  step(2);
  // 第三次（打败三次以上）：掉本命魂镰
  const C6 = C.bagCount(h, 'wpn_scythe_6');
  Y.s.cur = null; Y.descendNow({ x: field.x, y: field.y }, true); step(0.1);
  g.teleport(field.x - 600, field.y); step(0.3);
  Y.ent!.hp = 1; c.hitEnemy(Y.ent!, 1e9, 3, 'p'); step(0.1);
  assert.ok(C.bagCount(h, 'wpn_scythe_6') > C6, '第三次打败：掉噬魂本命魂镰');
  step(2);
  console.log(`9 打败：灵石、材料、法宝（${sc}）；传招 ${learned.join('、')} → 第二次四招全会；下一次 ${Y.s.next - day} 日后`);
}

// ================================================================ 10. 学会的招你能放
{
  B.reset(); c.enemies.length = 0;
  h.realm = 4; h.hp = 1; h.mp = 1;
  g.teleport(field.x, field.y);
  const rows: string[] = [];
  for (const id of YW.YWS_TEACH) {
    const m = MOVES.get(id)!; if (m.who === 'npc') { rows.push(`${m.name}：占位，玩家版本待做`); continue; }
    B.reset(); c.enemies.length = 0;
    const d = dummy(p.x + (YC.YWS_MOVES.get(id)?.far ? 480 : 200), p.y + 10); c.lock = d; c.manual = true;
    c.cds.clear(); h.mp = 1; const he0 = n.he, hp0 = d.hp;
    B.castArt(moveArtId(id));
    assert.equal(B.pMove?.def.id, id, `${id}：你放出来了`);
    assert.ok(until(() => !B.pMove, 8), `${id}：走完`);
    assert.ok(n.he > he0 && d.hp < hp0, `${id}：伤害走 hitEnemy`);
    rows.push(`${m.name} ${n.he - he0} 下`);
  }
  console.log('10 学会的招你能放：' + rows.join('、'));
}

assert.equal(rndN, 0, `首领路径上 Math.random 一共取了 ${rndN} 次`);
console.log('11 Math.random：0 次');
console.log('test-yewushe 通过');
process.exit(0);
