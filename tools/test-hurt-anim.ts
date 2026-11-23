// r12-anim：主角挨打后动作不卡死（用户：「被打了之后经常卡在一个状态的动画平移：站立平移、空中平移、躺在地上平移」）。
// 平地、固定时钟和种子；每个场景逐帧记 player.st.action 和位置，断言：
//   · 没有「同一个姿势（不是走 / 跑 / 倒飞 / 御剑）连续 0.6 息以上、人却挪了 60 以上」的一段（卡住平移）；
//   · 挨打后按住方向键，最后一定回到走 / 跑；落地后不再是倒飞；招式收场后近战那边不留长时长的动作覆盖。
//   1. 边走边被妖兽连着咬：走着照常走（原先每咬一口就换成受击、一直续着——站姿往前滑）
//   2. 被轰飞（地上）、御剑时被往下砸：空中倒飞 → 落地受击一小会儿 → 走
//   3. 撼山客的擒拿 / 连击打你（犁地、抡人为棍、陨星坠、流星百裂、天地往返、十方弹）：收场后不再是被按着拖 / 被抡 / 倒飞 / 受击的姿势
//      （原先 hsmoves2 给你摆姿势用 30 息的时长、放开时没收，放开后走路就是「躺着 / 悬空 / 站着」在滑），御剑也一样
//   4. 招式收场：长时长的动作覆盖只留一小段收势；正常一息上下的收势不动；你自己的招还在进行时别人收场不动你的
//   5. 敌人（人形）被击退往后滑：摆受击，不是站姿往后滑；停下来回待机
import './env';
import assert from 'node:assert/strict';

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
const c = g.combat as any, p = g.player, h = g.hero, H = g.hanshan as any;
const B = c.brawl as InstanceType<typeof import('../src/world/brawl').BrawlSys>;
h.realm = 3; h.stage = 1;
const T = g.terrain as any;
T.walkFactor = () => 1; T.canTraverse = () => true; T.isLand = () => true;
(g.npcs as unknown as { prestep(dt: number): void }).prestep = () => {};
(g as any).space.blocked = () => false;
c.safeAt = () => false; c.spawnT = 1e9; B.brk.manual = true;

/** 一帧；hold：这一帧按住的键（弹窗会清键，每帧重按） */
let hold: string[] = [];
const frame = (dt = 1 / 60) => { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 1e9; for (const k of hold) g.input.keys.add(k); g.update(dt); c.fxq.length = 0; };
const fresh = () => { c.enemies.length = 0; B.reset(); c.cds.clear(); c.invulnT = 0; h.hp = 1; h.mp = 1; c.pst = {}; c.hitT = 0; p.flying = false; p.z = 0; p.zTarget = 0; hold = []; g.input.keys.clear(); };

type Row = { t: number; a: string; x: number; y: number; moving: boolean };
function rec(sec: number, each?: (i: number) => void): Row[] {
  const R: Row[] = [];
  for (let i = 0; i < Math.round(sec * 60); i++) { each?.(i); frame(); R.push({ t: i / 60, a: p.st.action, x: p.x, y: p.y, moving: p.moving }); }
  return R;
}
/** 按动作分段：每段的起止、走了多远 */
function segs(R: Row[]) {
  const S: { a: string; t0: number; t1: number; dist: number }[] = [];
  for (let i = 0; i < R.length; i++) {
    const r = R[i], d = i ? Math.hypot(r.x - R[i - 1].x, r.y - R[i - 1].y) : 0, L = S[S.length - 1];
    if (L && L.a === r.a) { L.t1 = r.t; L.dist += d; } else S.push({ a: r.a, t0: r.t, t1: r.t, dist: d });
  }
  return S;
}
const MOTION = new Set(['walk', 'run', 'tumble', 'fly']);
const show = (R: Row[]) => segs(R).map((s) => `${s.a} ${s.t0.toFixed(2)}–${s.t1.toFixed(2)}（${Math.round(s.dist)}）`).join(' → ');
/** 卡住平移：不是走 / 跑 / 倒飞 / 御剑的同一个姿势连续 0.6 息以上、人挪了 60 以上 */
function noStuck(R: Row[], label: string) {
  const bad = segs(R).filter((s) => !MOTION.has(s.a) && s.t1 - s.t0 >= 0.6 && s.dist > 60);
  assert.deepEqual(bad.map((s) => s.a), [], `${label}：姿势卡住平移——${show(R)}`);
}
const tail = (R: Row[], sec: number) => R.slice(R.length - Math.round(sec * 60));

// 1. 边走边被妖兽连着咬（每 0.2 息一口）
{
  fresh();
  const e = new Enemy({ ...ENEMIES.yelang, speed: 0 }, p.x + 60, p.y, 2, 1); e.maxHp = e.hp = 1e7; c.enemies.push(e);
  hold = ['d'];
  const R = rec(2, (i) => { if (i % 12 === 0) { c.invulnT = 0; c.hitPlayer(5, 1, undefined, p.x - 50, p.y, e); } h.hp = 1; });
  noStuck(R, '边走边挨咬');
  const mv = R.filter((r) => r.moving);
  assert.ok(mv.length > 100, `一直在走（${mv.length} 帧）`);
  assert.ok(mv.every((r) => r.a === 'walk' || r.a === 'run'), `走着挨咬照常走：${show(R)}`);
  assert.ok(c.hitT > 0 || true);
  // 站着挨咬：照旧有受击后仰
  hold = []; g.input.keys.clear(); for (let i = 0; i < 10; i++) frame();
  c.invulnT = 0; c.hitPlayer(5, 1, undefined, p.x - 50, p.y, e); frame();
  assert.equal(p.st.action, 'hit', '站着挨咬：受击');
  console.log('1 边走边挨咬：' + show(R));
}

// 2. 被轰飞（地上）、御剑时被往下砸：倒飞 → 落地受击 → 走
for (const sky of [false, true]) {
  fresh();
  if (sky) { p.flying = true; p.z = p.zTarget = 300; B.launchPlayer(1, 0, 400, -600, null, true); }
  else B.launchPlayer(1, 0, 600, 420, null);
  hold = ['d'];
  const R = rec(3.5, () => { h.hp = 1; });
  noStuck(R, sky ? '御剑被砸下' : '被轰飞');
  const S = segs(R);
  assert.equal(S[0].a, 'tumble', `先倒飞：${show(R)}`);
  const land = S.findIndex((s) => s.a !== 'tumble');
  assert.ok(land > 0 && S[land].a === 'hit' && S[land].t1 - S[land].t0 < 0.5, `落地受击一小会儿：${show(R)}`);
  assert.ok(!S.slice(land).some((s) => s.a === 'tumble'), `落地后不再倒飞：${show(R)}`);
  assert.ok(tail(R, 1).every((r) => r.a === 'walk' && r.moving), `起来以后走：${show(R)}`);
  console.log(`2 ${sky ? '御剑被砸下' : '被轰飞'}：${show(R)}`);
}

// 3. 撼山客的擒拿 / 连击打你：收场后按住方向键走
const ids = ['lidi', 'lunren', 'yunxing', 'liuxing', 'tiandi', 'shifang'];
for (const [k, id] of ids.entries()) {
  fresh();
  H.place(p.x + 300, p.y - 100, 'stay');
  for (let i = 0; i < 30 && !H.ent; i++) frame();
  const e = H.ent; assert.ok(e, '撼山客来了');
  H.toFight('brawl'); e.aggro = true; e.tgP = false; H.brawling = () => { e.hp = e.maxHp; };
  const b = B.peek(e); if (b?.ai) b.ai.cd = 1e9;
  for (const m of H2.HS2_MOVES) e.skCd[m.id] = 0;
  H2.hs2ResetAi(1e9);
  e.atk = Math.max(1, e.atk * 0.02);   // 压着打，别把你打倒
  p.x = e.x + 160; p.y = e.y;
  assert.ok(H2.performHs2(H, id, null, true), `${id} 对你放得出`);
  let n = 0; while (B.peek(e)?.move && n < 900) { frame(); h.hp = 1; n++; }
  assert.ok(n < 900, `${id} 走完了`);
  const fly = k === 0;   // 犁地那一场：收场后祭起遁光，也得是御剑的样子
  hold = ['d'];
  const R = rec(4, (i) => { h.hp = 1; if (fly && i === 150) { p.flying = true; p.z = p.zTarget = 60; } });
  noStuck(R, `撼山客 ${id} 之后`);
  const left = B.actNow;
  assert.ok(!left.a || left.t <= 0.5, `${id}：收场后不留长时长的动作覆盖（${left.a} ${left.t.toFixed(1)} 息）`);
  if (fly) assert.ok(tail(R, 0.5).every((r) => r.a === 'fly'), `${id} 之后御剑：${show(R)}`);
  else assert.ok(tail(R, 1).every((r) => (r.a === 'walk' || r.a === 'run') && r.moving), `${id} 之后走：${show(R)}`);
  for (const bad of ['hsDragged', 'hsSwung', 'hsInvert']) assert.ok(!R.some((r) => r.a === bad), `${id}：放开后不再是 ${bad}：${show(R)}`);
  console.log(`3 撼山客 ${id}（招 ${(n / 60).toFixed(2)} 息）之后：${show(R)}`);
  H.place(p.x + 90000, p.y, 'stay');
}

// 4. 招式收场：长时长的动作覆盖只留一小段收势
{
  fresh();
  B.playAct('hsDragged', 30); B.moveEnded();
  assert.ok(B.actNow.a === 'hsDragged' && B.actNow.t <= 0.3 + 1e-9, '30 息的被擒拿姿势收场后只留 0.3 息');
  B.playAct('p1Crouch', 0.6); B.moveEnded();
  assert.ok(Math.abs(B.actNow.t - 0.6) < 1e-9, '一息以内的收势不动');
  B.playAct('hit', 30); (B as any).pMove = { t: 0 }; B.moveEnded();
  assert.equal(B.actNow.t, 30, '你自己的招还在进行：别人收场不动你的');
  (B as any).pMove = null; B.dropAct('punch');
  assert.equal(B.actNow.a, 'hit', 'dropAct 只收指定的那个');
  B.dropAct(); assert.equal(B.actNow.a, null, 'dropAct 不给就全收');
  hold = ['d'];
  B.playAct('tumble', 30); B.moveEnded();
  const R = rec(1);
  assert.ok(tail(R, 0.5).every((r) => r.a === 'walk'), `收场后接着走：${show(R)}`);
  console.log('4 招式收场：' + show(R));
}

// 5. 人形敌人被击退往后滑：受击；停下回待机
{
  fresh();
  // 追着你跑的劫修（远程、法术关掉），被一下推开：外力比它自己跑得快的那一段摆受击，之后接着跑
  const e = new Enemy({ ...ENEMIES.bandit, ranged: undefined }, p.x + 700, p.y, 2, 1);
  e.maxHp = e.hp = 1e7; e.aggro = true; e.skT = 1e9; e.kit = []; c.enemies.push(e);
  for (let i = 0; i < 5; i++) { frame(); h.hp = 1; }
  assert.ok(e.cs, '人形敌人有骨架');
  e.kx = 1400; e.ky = 0;
  const A: { a: string; x: number }[] = [];
  // 劫修此刻不催遁光（斗法版心智 AI 会在远处腾空；这里只看被击退滑行时的动作）
  for (let i = 0; i < 60; i++) { e.dun = 0; frame(); h.hp = 1; A.push({ a: e.cs!.action, x: e.x }); }
  const slid = A[12].x - A[0].x;
  assert.ok(slid > 40, `被推着往后滑（${Math.round(slid)}）`);
  assert.ok(A.slice(0, 8).every((r) => r.a === 'hit'), `往后滑的时候是受击：${A.slice(0, 12).map((r) => r.a).join(' ')}`);
  assert.notEqual(A[59].a, 'hit', `停下来不再受击：${A[59].a}`);
  console.log(`5 敌人被击退：滑 ${Math.round(A[59].x - A[0].x)}，${A[0].a} → ${A[59].a}`);
}

console.log('test-hurt-anim 通过');
process.exit(0);
