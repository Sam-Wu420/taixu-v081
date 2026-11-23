// 撼山客（world/hanshan.ts）：游荡、被发现、搭话、切磋、惹他。无头，固定时钟和种子。
//   1. 旧存档没有他：读得进来，给他一个初始位置（陆地野外、离开局四万外）
//   2. 游荡百日：每天的位置都在陆地野外、不进城；日推进路径上 Math.random 一次都不取；同一份存档两次模拟路线一样
//   3. 传闻按间隔出（离你越远越稀），文案轮着换；痕迹有上限、会过期
//   4. 存读档后位置、去向、痕迹、目击、切磋记录都在
//   5. 走近生成真人、走远收起（真人在 combat.enemies 里，收起后不在）；境界跟着你变（高一个大境界、封顶化神）
//   6. 切磋：让三招（这期间不还手）、之后还手、不致死、结束有话和奖励、冷却
//   7. 惹他：第一下只警告、第二下翻脸；真打致死（照寻常战败回城）；惹怒期间不搭话；过期消气
//   8. 他不走刷怪路径、不触发模组的 spawn 钩子
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 11, calls = 0;
const seeded = () => { calls++; s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };
Math.random = seeded;

const G = await import('../src/world/game');
const { HS, HS_MOVES } = await import('../src/world/hanshan');
const { setModx } = await import('../src/mod/hooks');
const g = await G.createGame(() => {}); g.reset();
const H = g.hanshan, c = g.combat as any, p = g.player;
let h = g.hero;   // 读档会换一个 hero 对象
c.spawnT = 1e9;
const ok = (x: number, y: number) => H.okAt(x, y, 0);
const frame = (dt = 1 / 60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; g.update(dt); c.fxq.length = 0; };
const run = (sec: number, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) frame(dt); };
const flags = g.ws.flags as any;

// 模组 spawn 钩子：数一数他有没有走刷怪那条路
let spawnHook = 0;
setModx(new Proxy({ has: (n: string) => n === 'spawn', fire: (n: string, ctx: any) => { if (n === 'spawn') spawnHook++; return ctx; } } as any, { get: (t, k) => (k in t ? (t as any)[k] : () => null) }));

// 1. 旧存档没有他
{
  delete flags.hanshan;
  const s = H.s;
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y), '给了初始位置');
  assert.ok(ok(s.x, s.y), `初始位置在陆地野外：${Math.round(s.x)},${Math.round(s.y)}`);
  assert.ok(Math.hypot(s.x - p.x, s.y - p.y) > 30000, `离开局远：${Math.round(Math.hypot(s.x - p.x, s.y - p.y))}`);
  assert.ok(H.stops().length >= 8, `南荒的落脚点够多：${H.stops().length}`);
  console.log(`1 初始：落脚点 ${H.stops().length} 处，离开局 ${Math.round(Math.hypot(s.x - p.x, s.y - p.y))}`);
}

// 2. 游荡百日：陆地野外、不进城；Math.random 零次；两次模拟一样
const walk = (days: number) => {
  const path: [number, number, string][] = [];
  const d0 = Math.floor(g.day);
  for (let i = 1; i <= days; i++) { g.day = d0 + i + 0.3; H.daily(); const s = H.s; path.push([Math.round(s.x), Math.round(s.y), s.mode]); }
  return path;
};
{
  p.x += 0; const snap = JSON.stringify(flags.hanshan), day0 = g.day;
  const c0 = calls;
  const A = walk(100);
  assert.equal(calls - c0, 0, `日推进路径上 Math.random 取了 ${calls - c0} 次`);
  for (const [x, y] of A) { assert.ok(ok(x, y), `第 n 天在陆地野外：${x},${y}`); assert.ok(!c.safeAt(x, y), `不进城镇宗门：${x},${y}`); }
  const moved = A.filter((q, i) => i && (q[0] !== A[i - 1][0] || q[1] !== A[i - 1][1])).length;
  assert.ok(moved >= 20, `百日里走动了 ${moved} 天`);
  const legs = new Set(A.map((q) => q[2])).size;
  assert.ok(legs === 2, '有赶路也有停留');
  flags.hanshan = JSON.parse(snap); g.day = day0; g.ws.news.length = 0;
  const B = walk(100);
  assert.deepEqual(B, A, '同一存档种子两次模拟路线相同');
  // 再走三百天：一直在野外
  const Cp = walk(300);
  for (const [x, y] of Cp) assert.ok(ok(x, y) && !c.safeAt(x, y), `四百日内一直在野外：${x},${y}`);
  console.log(`2 游荡：百日走动 ${moved} 天，Math.random 0 次，两次模拟一致；痕迹 ${H.s.traces.length} 处`);
}

// 3. 传闻按间隔；痕迹上限、过期
{
  const s = H.s;
  const rumors = g.ws.news.filter((n) => n.text.startsWith('江湖传闻：'));
  assert.ok(rumors.length >= 6, `四百日 ${rumors.length} 条传闻`);
  for (let i = 1; i < rumors.length; i++) { const gap = rumors[i].day - rumors[i - 1].day; assert.ok(gap >= HS.rumorNear && gap <= HS.rumorFar + 9, `传闻间隔 ${gap} 天`); }
  assert.ok(new Set(rumors.map((r) => r.text.replace(/江湖传闻：/, '').slice(-12))).size >= Math.min(5, rumors.length - 1), '文案轮着换');
  assert.ok(rumors.every((r) => /一带|的荒野|边/.test(r.text)), '带方位和地名');
  assert.ok(s.traces.length <= HS.traceMax, '痕迹有上限');
  assert.ok(s.traces.every((t) => g.day - t.d < HS.traceLife), '旧痕迹过期');
  // 离你近，报得勤
  const far = rumors.slice(-3).map((r, i, a) => (i ? r.day - a[i - 1].day : 0)).slice(1);
  console.log(`3 传闻 ${rumors.length} 条，例：${rumors[0].text}；末两段间隔 ${far.join('/')}`);
  const sv = JSON.parse(JSON.stringify(s)); sv.rumorAt = Math.floor(g.day); flags.hanshan = sv;
  p.x = s.x + 15000; p.y = s.y;
  const n0 = g.ws.news.length; g.day += 1; H.daily();
  const nearGap = H.s.rumorAt - Math.floor(g.day);
  assert.ok(g.ws.news.length > n0 && nearGap <= HS.rumorNear + 8, `两万以内报得勤：下一条 ${nearGap} 天后`);
}

// 4. 存读档
{
  const s = H.s;
  s.seen = { x: s.x, y: s.y, d: Math.floor(g.day), place: '测试山' }; s.spotted = true; s.spars = 2; s.best = 33; s.taught = ['yicunbeng', 'zhenjiao']; s.angryUntil = Math.floor(g.day) - 1; s.met = true;
  const want = JSON.stringify(s);
  p.x = s.x + 60000; p.y = s.y; if (!ok(p.x, p.y)) { p.x = s.x - 60000; }
  assert.ok(g.save(0), '存档');
  flags.hanshan.x += 777; flags.hanshan.traces = [];
  assert.ok(g.load(), '读档');
  assert.equal(JSON.stringify((g.ws.flags as any).hanshan), want, '位置、去向、痕迹、目击、切磋记录都在');
  assert.deepEqual(g.hanshan.taught(), ['yicunbeng', 'zhenjiao'], 'taught() 读回');
  // 旧存档（没有他）
  delete (g.ws.flags as any).hanshan; g.save(0); g.load();
  const s2 = g.hanshan.s;
  assert.ok(ok(s2.x, s2.y), '旧存档读进来给了初始位置');
  h = g.hero;
  console.log('4 存读档：一致；旧存档补上初始位置');
}

// 5. 走近生成、走远收起；境界
const near = (dx = 600) => {
  const s = H.s; let x = s.x + dx, y = s.y;
  for (let a = 0; a < 16 && !ok(x, y); a++) { x = s.x + Math.cos(a / 16 * Math.PI * 2) * dx; y = s.y + Math.sin(a / 16 * Math.PI * 2) * dx; }
  g.teleport(x, y); p.flying = false; p.z = 0;
};
{
  c.enemies.length = 0; h.realm = 2; h.stage = 1; h.hp = 1; h.mp = 1;
  const s = H.s; s.pin = Math.floor(g.day) + 999; s.mode = 'stay'; s.fight = false; s.until = Math.floor(g.day) + 999;
  near(HS.spawnR + 3000); run(0.5);
  assert.equal(H.ent, null, '远处不建实体');
  const sp0 = spawnHook;
  near(3000); run(0.5);
  assert.ok(H.ent && c.enemies.includes(H.ent), '走近生成真人');
  assert.equal(spawnHook, sp0, '不触发模组的 spawn 钩子');
  assert.equal(H.ent!.realm, 3, `比你高一个大境界：${H.ent!.realm}`);
  h.realm = 4; run(0.2); assert.equal(H.ent!.realm, 5, '你结婴了，他化神');
  h.realm = 5; run(0.2); assert.equal(H.ent!.realm, 5, '封顶化神');
  h.realm = 1; h.stage = 8; run(0.2); assert.equal(H.ent!.realm, 2, '炼气时他筑基');
  h.realm = 2; h.stage = 1; run(0.2);
  const e = H.ent!;
  assert.ok((e as any).noP, '平时不冲你来');
  assert.ok(!c.inCombat, '不算交战');
  near(HS.despawnR + 2500); run(0.5);
  assert.equal(H.ent, null, '走远收起');
  assert.ok(!c.enemies.includes(e), '收起后不在敌人里');
  console.log('5 生成 / 收起、境界跟随：通过');
}

// 6. 切磋：让三招、还手、不致死、奖励、冷却
{
  const s = H.s; s.angryUntil = undefined; s.lastSpar = undefined; s.spars = 0; s.best = 0; s.taught = []; s.tier = undefined; s.fight = false; s.mode = 'stay'; s.until = Math.floor(g.day) + 999;
  h.realm = 2; h.stage = 1; h.hp = 1; h.mp = 1;
  near(150); run(0.6);
  const e = H.ent!; assert.ok(e, '他在');
  assert.ok(H.focusD() < 1e9, '能搭话');
  assert.ok(H.talk() && g.modal?.kind === 'dialog', '对话框');
  const node = (g.modal as any).node;
  assert.ok(node.portrait?.includes('yueqianjun'), '立绘');
  assert.deepEqual(node.options.map((o: any) => o.label), ['请教一二（切磋）', '攀谈', '告辞']);
  assert.equal(H.plate, '撼山客 · 岳千钧', '搭过话后名牌带名字');
  const chat = node.options[1].act(); assert.ok(chat && chat.text.length > 8, '攀谈有话');
  g.closeModal(true);
  c.enemies = c.enemies.filter((x: any) => x === H.ent);   // 场子清干净（路过斗法的人别掺和进来）
  assert.ok(H.startSpar(), '开始切磋');
  const hp0 = h.hp;
  run(3);
  assert.ok(h.hp >= hp0 - 1e-6, `让招时不还手：${hp0} → ${h.hp}`);
  for (let i = 0; i < 3; i++) { c.hitEnemy(e, c.pStats.atk * 2, { realm: h.realm, stCh: 0, school: '体', brawl: 'light' }, p.x, p.y); run(0.4); }
  assert.ok(H.spar && H.spar.counterAt > 0, '挨了三下，开始还手');
  let minHp = 1, t = 0;
  // 场子一直清着（r8-p1：招式变了随机序列跟着变，有一回野地里游过来一头琉璃兽一爪把你打倒、送回城——那是野怪的事，不是切磋的）
  while (H.mode === 'spar' && t < 90) { c.enemies = c.enemies.filter((x: any) => x === H.ent); if (Math.hypot(e.x - p.x, e.y - p.y) > 600) near(150); run(0.5); t += 0.5; minHp = Math.min(minHp, h.hp); }
  if (H.mode !== 'calm') { const r = c.rivalNear(H.ent, H.ent!.x, H.ent!.y, 900); console.log('对手：', r?.name, r?.team, r?.aggro, r?.dead, c.enemies.includes(r), (H as any).beast?.name, (H as any).beast?.dead, H.ent!.aggro, H.ent!.tgE?.name); }
  assert.ok(H.mode !== 'spar' && !H.spar, `切磋打完了（${t.toFixed(1)} 息，mode=${H.mode} ent=${!!H.ent} hp=${h.hp.toFixed(2)} dead=${H.ent?.dead}）`);
  assert.ok(!h.dead && h.hp > 0.1, `不致死：最低 ${minHp.toFixed(2)}`);
  assert.ok(minHp < 0.9, `真还手了：最低 ${minHp.toFixed(2)}`);
  assert.ok(!e.dead && c.enemies.includes(e), '他原地收手，没走');
  for (let i = 0; i < 60 && !g.modal; i++) { g.paused = false; g.update(1 / 30); }   // 等对话框（这里不随手关掉）
  assert.ok(g.modal?.kind === 'dialog' && /撑了 \d+ 息/.test((g.modal as any).node.text), '结束有话');
  console.log(`6 切磋：${((g.modal as any).node.text as string).replace(/\n+/g, ' ')}`);
  g.closeModal(true);
  assert.equal(H.s.spars, 1); assert.ok((H.s.best ?? 0) > 0, '记下撑了多久');
  const again = H.node(true).options[0];
  assert.ok(again.disabled, '切磋有冷却');
  g.day += HS.sparCd + 1; H.daily();
  assert.ok(!H.node(true).options[0].disabled, '冷却过了能再来');
  // 撑满：按最好成绩解锁招式记录
  H.s.best = 61; (H as any).unlock(H.s);
  assert.deepEqual(H.taught(), HS_MOVES.filter((m) => !m.realm).map((m) => m.id), '撑过六十息：六招都记下（化神前没有破界）');
}

// 7. 惹他
{
  const s = H.s; s.angryUntil = undefined; h.hp = 1; h.mp = 1; h.realm = 2; h.stage = 1;
  near(200); run(0.5);
  const e = H.ent!;
  c.hitEnemy(e, 10, { realm: h.realm, stCh: 0 }, p.x, p.y); run(0.3);
  assert.equal(H.mode === 'angry', false, '第一下只警告');
  assert.ok((e as any).noP, '警告后照旧不冲你来');
  c.hitEnemy(e, 10, { realm: h.realm, stCh: 0 }, p.x, p.y); run(0.3);
  assert.equal(H.mode, 'angry', '再打就翻脸');
  assert.ok(H.angry, '记下惹怒');
  const px = p.x, py = p.y;
  let t = 0, far = 0; while (H.mode === 'angry' && !h.dead && t < 60) { if (Math.hypot(e.x - p.x, e.y - p.y) > 500 && H.ent) { p.x = H.ent.x + 120; p.y = H.ent.y; } run(0.5); t += 0.5; far = Math.max(far, Math.hypot(p.x - px, p.y - py)); }
  // 被打倒：他的怒气这一场到头（翻脸后照寻常战败处理，人被救走）；救回城的落点有时离原地不到三千（第二批合并后见过 2948），按「被挪走一大段」判
  assert.ok(H.mode !== 'angry' && far > 1500, `被打倒、救回城（${t.toFixed(1)} 息，挪走 ${Math.round(far)}）`);
  assert.ok(!h.dead, '照寻常战败处理，不是坐化');
  near(150); run(0.6);
  assert.ok(H.ent, '他还在');
  if (g.modal) g.closeModal(true);
  H.talk(); assert.ok(!g.modal, '惹怒期间不搭话');
  g.day += HS.angryDays + 1; H.daily();
  assert.ok(!H.angry, '过期消气');
  H.talk(); assert.ok(g.modal?.kind === 'dialog', '消气后又肯说话');
  g.closeModal(true);
  console.log('7 惹他：警告 → 翻脸 → 打倒回城 → 不搭话 → 消气');
}

// 8. 目击标记、小地图点
setModx(null as never);
{
  const m = g.mapMarks().find((q) => q.glyph === '撼');
  assert.ok(m && /撼山客 · 上次见于/.test(m.name), `世界地图目击标记：${m?.name}`);
  assert.ok(H.dot(), '近处小地图上有他');
  assert.equal(H.perform('heavy'), false, '平时不出招（perform 只在打架时有效）');
  let used = ''; H.registerMove('yicunbeng', (tg) => { used = tg ? tg.name : '你'; return true; });
  assert.ok(H.perform('yicunbeng') && used === '你', '挂上的招 perform 能调到');
}

// ================================================================ r7 招式第一批（world/hsmoves.ts、world/impactfx.ts）
//   9. 九招都注册在近战的特殊招式里；只有他能用（别的 NPC 挑不到；你只能学一寸崩、震脚）；不带 AI 权重（寻常 NPC 挑招一个随机数都不多取）
//  10. 每一招对着木人桩放出来、走完不抛错；伤害走 npcHit（数调用）、破坏系统被调到（wreck.stats.calls）；招式路径上 Math.random 0 次
//  11. 克制法修：气合把飞来的法术震碎、飞剑弹回去；空手接宝夹住飞剑几息再丢回去、一把捏灭火球；金刚不坏站着硬吃（那一下伤害大减、打不飞）再金光反震；
//      后发先至在你重击的前摇里一肘先到（打断你的重击，伤害走 hitPlayer）
//  12. 黑白闪、定格特写的频率上限；定格特写时世界几乎停住、半秒后恢复
//  13. 编排：切磋时试探 → 连招 → 喘口气喝酒 → 再来（真的放了招、也真的停下来喝了酒）；打妖王时九招轮着秀
//  14. 切磋撑过档位，他教会你一寸崩、震脚（法术书里有）；旧存档里答应过的，读档时补上
const MV = await import('../src/world/brawlmoves');
const HM = await import('../src/world/hsmoves');
const { ARTS } = await import('../src/data/arts');
const { IMP } = await import('../src/world/impactfx');
const B = c.brawl as InstanceType<typeof import('../src/world/brawl').BrawlSys>;
H.registerMove('yicunbeng', (tg) => H.cast('yicunbeng', tg));   // 第 8 段换成了假的，挂回去
// 招式路径上的 Math.random：直接调它的是 hsmoves / impactfx / brawlmoverun / hanshan 的代码才算（伤害函数 hitEnemy / npcHit 自己掷暴击、飘字抖动用的那几次是战斗原有的，不算招式的）
let mvRand = 0;
const NL = String.fromCharCode(10);
Math.random = () => { const st = new Error().stack ?? ''; if (/hsmoves|impactfx|brawlmoverun|hanshan.ts/.test(st.split(NL)[2] ?? '')) { mvRand++; if (process.env.HS_STACK && mvRand < 4) console.log(st.split(NL).slice(1, 12).join(NL)); } return seeded(); };
// 伤害：npcHit 的调用次数、模组 damage 钩子（打你那一下走 hitPlayer）
let npcN = 0, hookP = 0;
const npc0 = c.npcHit.bind(c); c.npcHit = (...a: any[]) => { npcN++; return npc0(...a); };
setModx(new Proxy({ has: (n: string) => n === 'damage', fire: (_n: string, ctx: any) => { if (ctx.to === 'player') hookP++; return ctx; } } as any, { get: (t, k) => (k in t ? (t as any)[k] : () => null) }));
// 招式里抛的错（tickMoves 会吞掉）：开发开关打开后会 console.warn，收集起来
(globalThis as any).__TAIXU_DEV = true;
const warns: string[] = []; const warn0 = console.warn; console.warn = (...a: any[]) => { warns.push(a.map(String).join(' ')); };
const stepF = (sec: number) => { for (let t = 0; t < sec; t += 1 / 60) frame(1 / 60); };
{
  for (const id of HM.HS_BATCH1) {
    const m = MV.MOVES.get(id);
    assert.ok(m && ARTS['bxm_' + id], `${id} 注册了`);
    assert.ok(!m!.ai, `${id} 不带 AI 权重（寻常 NPC 不会挑它）`);
    assert.equal(m!.can!(B, null), id === 'yicunbeng' || id === 'zhenjiao', `${id}：你能不能用`);
  }
  const other = B.spawnBrawler(p.x + 400, p.y, 3, 0); other.school = 'tixiu';
  for (const id of HM.HS_BATCH1) assert.equal(MV.MOVES.get(id)!.can!(B, other), false, `${id}：别的体修用不了`);
  c.enemies = c.enemies.filter((x: any) => x !== other);
  console.log('9 九招注册、只有他能用（你能学两招）：通过');
}
{
  const s = H.s; s.angryUntil = undefined; s.mode = 'stay'; s.fight = false; s.until = Math.floor(g.day) + 999; h.hp = 1; h.mp = 1; h.realm = 3; h.stage = 1;
  near(900); run(0.5);
  assert.ok(H.ent, '他在');
  B.log = [];
  const W = c.wreck, report: string[] = [];
  for (const id of HM.HS_BATCH1) {
    for (const x of c.enemies.filter((q: any) => String(q.def?.id).startsWith('bx_'))) c.enemies = c.enemies.filter((q: any) => q !== x);
    (H as any).toCalm(); g.zhenfa.reset(); h.hp = 1; run(0.1);   // 前几段（惹他）留下的阵别把你打倒、送回城（r8-p1：招式变了随机序列跟着变，碰上过一回）
    const tg = H.startDemo(id)!; assert.ok(tg, `${id}：摆好木人桩`);
    const n0 = H.castLog.length, w0 = W.stats.calls, npc1 = npcN, r0 = mvRand, warn1 = warns.length, log0 = B.log!.length;
    const S0 = { ...B.impact.stats } as Record<string, number>;
    let t = 0;
    while (t < 6 && !(H.castLog.length > n0 && !H.moving)) { stepF(0.1); t += 0.1; }
    assert.ok(H.castLog.length > n0, `${id}：放出来了`);
    assert.ok(!H.moving, `${id}：走完了（${t.toFixed(1)} 息）`);
    assert.equal(warns.length, warn1, `${id}：没抛错 ${warns.slice(warn1).join(' | ')}`);
    assert.equal(mvRand, r0, `${id}：招式路径上 Math.random ${mvRand - r0} 次`);
    const dmg = B.log!.slice(log0).filter((l) => l.k.startsWith('hs-')).length, wc = W.stats.calls - w0;
    const S1 = B.impact.stats as Record<string, number>, ds = Object.keys(S1).filter((k) => (S1[k] ?? 0) > (S0[k] ?? 0)).map((k) => `${k}+${S1[k] - (S0[k] ?? 0)}`).join(' ');
    report.push(`${id}：${t.toFixed(1)}息 伤害${dmg}下（npcHit ${npcN - npc1}）破坏${wc}次 ${ds}`);
    if (id !== 'kongshou' && id !== 'qihe' && id !== 'jingang') assert.ok(dmg > 0 && npcN > npc1, `${id}：打中木人桩、伤害走 npcHit`);
    if (id === 'yicunbeng' || id === 'quanya' || id === 'zhenjiao' || id === 'takong' || id === 'jingang') assert.ok(wc > 0, `${id}：调了破坏系统`);
    if (id === 'yicunbeng') assert.ok(S1.blast > (S0.blast ?? 0), '一寸崩：背后炸开');
    if (id === 'quanya') assert.ok(S1.press > (S0.press ?? 0), '拳压：一道直线');
    if (id === 'suodi') assert.ok(S1.blink > (S0.blink ?? 0), '缩地：只剩一道线');
    if (id === 'takong') assert.ok(S1.ring - (S0.ring ?? 0) >= 3, '踏空：每一步一圈气环');
  }
  console.log('10 九招对木人桩：\n   ' + report.join('\n   '));
}
{
  // 11. 克制法修
  const dummies = () => c.enemies.filter((q: any) => String(q.def?.id).startsWith('bx_'));
  const st = B.impact.stats as Record<string, number>;
  // 气合：三团火飞来 → 震碎；一柄飞剑 → 弹回去
  for (const x of dummies()) c.enemies = c.enemies.filter((q: any) => q !== x);
  (H as any).toCalm(); run(0.1);
  let tg = H.startDemo('qihe')!; H.demo = null; (H as any).mode = 'brawl'; H.autoMoves = false;   // 一招一招手动放
  const e = H.ent!;
  H.hurl(tg, 'fire', 3); H.hurl(tg, 'sword', 1);
  const fly = () => c.projs.filter((q: any) => q.tk === e).length;
  assert.equal(fly(), 4, '飞来四件');
  stepF(0.1);
  const sh0 = st.shatter ?? 0, rf0 = st.reflect ?? 0;
  assert.ok(H.cast('qihe', tg), '气合放出来');
  stepF(0.2);
  assert.ok((st.shatter ?? 0) - sh0 >= 3, `三团火被震碎：${(st.shatter ?? 0) - sh0}`);
  assert.ok((st.reflect ?? 0) - rf0 >= 1, `飞剑被弹回去：${(st.reflect ?? 0) - rf0}`);
  const back = c.projs.find((q: any) => q.src === e && q.fx === 'sword');
  assert.ok(back && back.tk === tg && back.vx * (tg.x - back.x) > 0, '弹回去的飞剑朝放它的人飞');
  assert.equal(fly(), 0, '冲他来的都没了');
  stepF(1);
  // 空手接宝：飞剑夹住几息再丢回去；火球一把捏灭
  const ca0 = st.caught ?? 0, th0 = st.thrown ?? 0, pi0 = st.pinch ?? 0;
  H.hurl(tg, 'sword'); stepF(0.05);
  e.skCd.kongshou = 0;
  assert.ok(H.cast('kongshou', tg), '空手接宝起手');
  let held = false, t = 0;
  while (t < 3 && H.moving) { stepF(0.05); t += 0.05; if (B.impact.held.length) held = true; if (held && (st.caught ?? 0) > ca0 && (st.thrown ?? 0) === th0) assert.equal(fly(), 0, '夹在指间时不在弹道里'); }
  assert.ok(held && (st.caught ?? 0) === ca0 + 1, '两指夹住了');
  assert.ok((st.thrown ?? 0) === th0 + 1, '丢回去了');
  assert.ok(c.projs.some((q: any) => q.src === e && q.tk === tg), '丢回去的剑朝木人桩飞');
  const npc2 = npcN; stepF(1.2);
  assert.ok(npcN > npc2, '丢回去的剑打中了（npcHit）');
  // 手动一招一招放时他自己也在寻常 AI 的追击里往前走；接宝物要看「飞来」的弹道，先把陪练放回试玩起始的距离
  tg.x = e.x + 620; tg.y = e.y + 10;
  H.hurl(tg, 'fire'); stepF(0.05); e.skCd.kongshou = 0;
  assert.ok(H.cast('kongshou', tg), '接火球起手'); stepF(1.2);
  assert.equal((st.pinch ?? 0), pi0 + 1, '一把捏灭火球');
  // 金刚不坏：站着硬吃——这期间挨的伤害退回八成五，打不飞；随后金光反震
  e.skCd.jingang = 0; e.hp = e.maxHp * 0.5;
  assert.ok(H.cast('jingang', tg), '金刚不坏起手');
  stepF(0.1);
  assert.ok(B.peek(e)!.iron && !B.launchable(e), '这期间打不飞');
  // 打他一下，紧接着让招式走一帧（中间不走别的：他平时的「被你打了」那套会把血补满，量不准）
  const hpA = e.hp, ab0 = st.absorbed ?? 0;
  c.hitEnemy(e, e.maxHp * 0.2, { realm: 9, stCh: 0 }, p.x, p.y);
  const raw = hpA - e.hp, mr = B.peek(e)!.move!; mr.t += 1 / 60; mr.def.tick(mr, 1 / 60);
  const lost = hpA - e.hp;
  assert.ok(raw > 0 && lost <= raw * 0.16, `那一下伤害大减：原本掉 ${Math.round(raw)}，实际只掉 ${Math.round(lost)}`);
  assert.ok((st.absorbed ?? 0) - ab0 >= raw * 0.84, '记下硬吃的量');
  stepF(0.05);
  assert.ok((st.absorbed ?? 0) > 0, '记下硬吃的量');
  let goldSeen = false; const push0 = c.fxq.push.bind(c.fxq); c.fxq.push = (...a: any[]) => { if (a.some((x) => x.k === 'hsgold')) goldSeen = true; return push0(...a); };
  stepF(0.8); c.fxq.push = push0;
  assert.ok(goldSeen, '金光反震');
  assert.ok(!B.peek(e)!.iron && !H.moving, '收场后照常能打飞');
  // 后发先至：你重击出手的前摇里，他侧身一肘先到——你的重击被打断，那一肘走 hitPlayer
  for (const x of dummies()) c.enemies = c.enemies.filter((q: any) => q !== x);
  stepF(0.3); p.x = e.x + 200; p.y = e.y; p.flying = false; p.z = 0; h.hp = 1; c.invulnT = 0; B.pb.freezeT = 0;
  c.lock = e; c.manual = true; e.skCd.houfa = 0;
  B.heavy(); stepF(0.02);
  assert.ok(B.heavyWinding && HM.windingAt(B, 'p'), '你在蓄重击');
  const hp0 = hookP;
  assert.ok(H.cast('houfa', null), '后发先至起手');
  stepF(0.3);
  assert.ok(!B.heavyWinding, '你的重击被打断');
  assert.ok(hookP > hp0, '那一肘走 hitPlayer（damage 钩子）');
  stepF(1.5); h.hp = 1;
  H.autoMoves = true;
  console.log('11 克制法修：气合震碎 / 弹回、空手接宝夹剑丢回 / 捏灭火球、金刚不坏硬吃 + 反震、后发先至打断重击：通过');
}
{
  // 12. 频率上限
  const I = B.impact;
  I.reset(); stepF(0.1);
  assert.ok(I.inkFlash(), '第一下黑白闪');
  assert.equal(I.inkK(), 1, '这一帧反相');
  // r7-fx3d：亮五帧（前三帧全反相、后两帧半反相），录屏按 30 帧取样也取得到
  stepF(1 / 60); assert.equal(I.inkK(), 1, '第一帧全反相');
  stepF(2 / 60 + 0.001); assert.ok(I.inkK() > 0.3 && I.inkK() < 1, `第四帧起半反相：${I.inkK()}`);
  stepF(3 / 60 + 0.001); assert.equal(I.inkK(), 0, '五帧后恢复');
  assert.equal(I.inkFlash(), false, `${IMP.inkGap} 息内不再闪`);
  // 一直想闪：记下真闪了的那几个时刻（世界时钟），任意 8 息里不超过 3 次、相邻两次至少隔 1.6 息
  H.autoMoves = false; I.reset(); const at: number[] = []; for (let t = 0; t < 12; t += 0.05) { stepF(0.05); h.hp = 1; if (I.inkFlash()) at.push(g.time); }   // 血补满：被打倒回城会整个重置战斗（也就清了这份记录）
  H.autoMoves = true;
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= IMP.inkGap - 1e-6, `相邻两次隔 ${(at[i] - at[i - 1]).toFixed(2)} 息`);
  for (const t0 of at) assert.ok(at.filter((t) => t >= t0 && t < t0 + IMP.inkWin).length <= IMP.inkMax, `任意 ${IMP.inkWin} 息里最多 ${IMP.inkMax} 次`);
  assert.ok(at.length >= 3, `一直想闪也闪得出来：${at.length} 次`);
  I.reset(); stepF(0.1);
  assert.ok(I.cutIn('fist', '一寸崩'), '第一次定格特写');
  // 2026-11-18：定格特写的立绘切入按用户要求关掉了（impactfx 的 CUT_SHOW）——计数照记，但不切图、世界不停
  if ((I.constructor as unknown as { cutShow: boolean }).cutShow) {
    assert.ok(B.worldK() < 0.1, `特写时世界几乎停住：${B.worldK()}`);
    let rt = 0; while (I.cutting && rt < 2) { B.update(1 / 60 * B.worldK()); rt += 1 / 60; }
    assert.ok(rt > 0.45 && rt < 0.6, `半秒（真实时间）后切出：${rt.toFixed(2)}`);
  } else assert.ok(!I.cutting && B.worldK() === 1, '特写关着：不切图、世界不停');
  assert.equal(B.worldK(), 1, '切出后恢复');
  assert.equal(I.cutIn('eyes'), false, `${IMP.cutGap} 息内不再切`);
  g.time += IMP.cutGap + 1; assert.ok(I.cutIn('eyes'), '隔够了能再切'); while (I.cutting) B.update(1 / 60 * B.worldK());
  g.time += IMP.cutGap + 1; assert.equal(I.cutIn('stomp'), false, `一场最多 ${IMP.cutPerFight} 次`);
  g.time += IMP.fightGap + 1; assert.ok(I.cutIn('stomp'), '新的一场又能切'); while (I.cutting) B.update(1 / 60 * B.worldK());
  console.log('12 黑白闪 / 定格特写的频率上限：通过');
}
{
  // 13. 编排：切磋时试探 → 连招 → 喘口气喝酒 → 再来
  for (const x of c.enemies.filter((q: any) => String(q.def?.id).startsWith('bx_'))) c.enemies = c.enemies.filter((q: any) => q !== x);
  (H as any).toCalm(); run(0.2);
  const e = H.ent!; const s = H.s; s.lastSpar = undefined; s.angryUntil = undefined;   // 第 11 段打了他好几下，惹恼了
  near(160); run(0.3);
  c.enemies = c.enemies.filter((x: any) => x === H.ent);
  assert.ok(H.startSpar(), '开始切磋');
  for (let i = 0; i < 3; i++) { c.hitEnemy(e, c.pStats.atk, { realm: h.realm, stCh: 0, school: '体', brawl: 'light' }, p.x, p.y); run(0.3); }
  const n0 = H.castLog.length; let drank = false, t = 0;
  while (H.mode === 'spar' && t < 40) { if (Math.hypot(e.x - p.x, e.y - p.y) > 600) { p.x = e.x + 150; p.y = e.y; } h.hp = 1; stepF(0.1); t += 0.1; if (e.cs?.action === 'drink') drank = true; if (drank && H.castLog.length - n0 >= 4) break; }
  const used = H.castLog.slice(n0);
  assert.ok(used.length >= 2, `切磋里放了招：${used.join('、')}`);
  assert.ok(drank, '连招之后喘口气喝了一口');
  console.log(`13 编排：切磋里 ${t.toFixed(1)} 息放了 ${used.join('、')}，中间喝了酒`);
  H.endSpar('abort'); run(0.3);
  // 打妖王：九招轮着秀
  s.fight = true; s.fought = false; s.mode = 'stay';
  const n1 = H.castLog.length; t = 0;
  while (t < 60 && new Set(H.castLog.slice(n1)).size < HM.HS_BATCH1.length) { if (Math.hypot(e.x - p.x, e.y - p.y) > 2000) { p.x = e.x + 900; p.y = e.y; } h.hp = 1; stepF(0.1); t += 0.1; if (!(H as any).beast && H.castLog.length === n1 && t > 5) break; }
  const shown = new Set(H.castLog.slice(n1));
  assert.ok(shown.size >= 8, `打妖王时把这一批轮着秀了（${shown.size}/9：${[...shown].join('、')}，${t.toFixed(1)} 息）`);
  console.log(`   打妖王：${t.toFixed(1)} 息秀了 ${[...shown].join('、')}`);
}
{
  // 14. 传招：撑过档位当场教会（法术书里多一门）；旧存档补上
  const s = H.s; h.arts = h.arts.filter((a: any) => !String(a.id).startsWith('bxm_'));
  s.taught = []; s.best = 0;
  s.best = 25; const got = (H as any).teach(['yicunbeng', 'zhenjiao', 'yanhui']);
  assert.deepEqual(got.map((m: any) => m.name), ['一寸崩', '震脚', '燕回'], '三招都教会了（第二批合进来以后燕回也有了）');
  assert.ok(h.arts.some((a: any) => a.id === 'bxm_yicunbeng') && h.arts.some((a: any) => a.id === 'bxm_zhenjiao'), '法术书里有');
  h.arts = h.arts.filter((a: any) => !String(a.id).startsWith('bxm_')); s.taught = ['yicunbeng'];
  H.syncTaught();
  assert.ok(h.arts.some((a: any) => a.id === 'bxm_yicunbeng') && !h.arts.some((a: any) => a.id === 'bxm_zhenjiao'), '读档补上答应过的');
  console.log('14 传招：通过');
}
console.warn = warn0;
assert.equal(warns.length, 0, `招式里没抛错：${warns.join(' | ')}`);
console.log('test-hanshan：全部通过');
process.exit(0);
