// 收官 E3「虚空一拳打进世界」（world/voidfall.ts）：用真实的 Game 无界面地跑，固定随机种子和假时钟。
//   1. 陆上：虚空斗法里对破了罡的对手往下砸 → 结局是「坠落」（流星、穿界壁）；按追击俯冲追下去 → 对手在界内的落点重新出现、
//      嵌在坑里（硬直）、血量接着算、撞击伤害走 hitEnemy；全程没有遮幕 / 过场、halted 一直为假、玩家一直能操作；
//   2. 海上：同样砸下去，落在海里沉下去（沉海的硬直）；
//   3. 没追下去：流星落定后斗法收场、回到寻常的虚空飞行；之后降进那一界，它就在落点；
//   4. 落点在另一张图（换图）：坠界的这一趟、对手、追杀都接得上；
//   5. 反过来：体修魔头一记重击把你砸下去；下坠途中能脱困（接着在虚空里斗）；
//   6. 不脱困：一路砸进界内，吃撞击伤害（hitPlayer）、硬直，对手追下来。
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
const { HOME, landing, pointToVoid, VOID_SCALE } = await import('../src/data/zhujie');
const WM = await import('../src/data/world');   // 当前地图是活绑定：要从模块对象上读
const { ALT } = await import('../src/world/alt');
const { VOIDFALL } = await import('../src/world/voidfall');
const { setModx } = await import('../src/mod/hooks');
const g = await G.createGame(() => {});
g.reset();
const p = g.player, xk = g.xukong, F = xk.fight, V = xk.fall, B = g.combat.brawl, c = g.combat as any;
const closeAll = () => { for (let i = 0; i < 6 && g.modal; i++) g.closeModal(true); };
/** 每一帧都查：没有遮幕 / 过场（弹窗、挪移甬道、暂停），halted 为假 */
let watch = false, haltedFrames = 0, veilFrames = 0, frames = 0;
const step = (seconds: number, each?: () => void) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.025) {
    g.paused = false; closeAll(); for (const k of held) g.input.keys.add(k); c.spawnT = 1e9; each?.(); g.update(0.025);
    if (watch) { frames++; if (g.halted) haltedFrames++; if (g.modal || g.nuoyi.active || g.paused) veilFrames++; }
  }
};
// 按住的键：弹窗会清空按键，每帧补回去
const held = new Set<string>();
const hold = (k: string, fn: () => void) => { held.add(k); g.input.keys.add(k); try { fn(); } finally { held.delete(k); g.input.keys.delete(k); } };
// damage 钩子：近战的每一下（含撞击、坠地）都数得到
let hooked = 0, hookedP = 0;
setModx(new Proxy({ has: (n: string) => n === 'damage', fire: (_n: string, ctx: any) => { if (ctx.to === 'enemy') hooked++; else hookedP++; return ctx; } } as any, { get: (t, k) => (k in t ? (t as any)[k] : () => null) }));

/** 在当前这张图上找落点（陆地 / 深海），并且从它正上方降下来确实落在这一点 */
const findDrop = (sea: boolean, x0: number, y0: number) => {
  const T = g.terrain;
  const ok = (x: number, y: number) => {
    if (sea) { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (T.isLand(x + i * 700, y + j * 700)) return false; return true; }
    if (T.inLocZone(x, y, 2600)) return false;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const px = x + i * 300, py = y + j * 260; if (!T.isLand(px, py) || T.walkFactor(px, py) <= 0 || (g as any).space.blocked(px, py)) return false; }
    return true;
  };
  for (let r = 0; r <= 300000; r += 2500) {
    const n = Math.max(1, Math.round(r / 2000));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
      if (!ok(x, y)) continue;
      const v = pointToVoid(WM.ACTIVE_MAP, x, y), L = landing(HOME, v.x, v.y);
      if (L && L.map === WM.ACTIVE_MAP && Math.hypot(L.x - x, L.y - y) < 50) return { x, y };
    }
  }
  throw new Error('找不到落点 ' + (sea ? '海' : '陆'));
};

/** 升到巡航高度，停在 (x, y) 的正上方 */
const ascendOver = (x: number, y: number) => {
  g.hero.realm = 4; g.hero.stage = 2; g.hero.mp = 1; g.hero.hp = 1;
  g.teleport(x, y); c.enemies.length = 0; g.pursuit.reset();
  if (!p.flying) g.toggleFly();
  step(0.5);
  assert.ok(xk.leave(), '能破界');
  hold('ascend', () => { for (let i = 0; i < 400 && !(xk.phase === 'void' && xk.lift > 0.995); i++) step(0.25, () => { c.enemies.length = 0; }); });
  assert.ok(xk.phase === 'void' && xk.lift > 0.995, `应在巡航高度：${xk.phase} ${xk.lift}`);
  const v = pointToVoid(WM.ACTIVE_MAP, x, y); xk.x = v.x; xk.y = v.y; xk.vx = xk.vy = 0; (xk as any).scanT = 0;
  step(0.3);
  assert.equal(xk.over, HOME, '脚下是人界');
};
/** 交手：一个体修魔修进斗法，镜头到位后摆到你面前 */
const engage = (realm: number, name: string, calm: boolean) => {
  const e = B.spawnBrawler(p.x, p.y, realm, 1);
  c.enemies = c.enemies.filter((q: any) => q !== e);
  e.name = name; e.maxHp = e.hp = e.maxHp * 4;
  F.engage({ id: 'vf-' + name, name, x: xk.x + 5, y: xk.y, tier: realm, enemy: e });
  for (let i = 0; i < 80 && !F.handed; i++) step(0.05);
  assert.ok(F.on && F.handed, '交手、镜头到位');
  e.x = p.x + 100; e.y = p.y + 4; e.flyH = p.z; e.hx = e.x; e.hy = e.y;
  c.lock = e; c.manual = true;
  if (!B.stance) B.toggleStance();
  const b = B.body(e);
  if (calm) { b.poise = 0; b.breakT = 999; e.speed = 0; e.def = { ...e.def, melee: undefined, ranged: undefined }; e.kit = []; e.skT = 1e9; if (b.ai) b.ai.cd = 1e9; }
  return e;
};
/** 往下砸：按住下降，重击 */
const smash = () => { g.hero.mp = 1; c.cds.clear(); hold('descend', () => { B.heavy(true); step(0.5); }); };

// ---------------------------------------------------------------- 1. 陆上：砸下去、追下去、在落点接着打
{
  const to = findDrop(false, p.x, p.y);
  ascendOver(to.x, to.y);
  const e = engage(4, '铁拳魔修', true);
  const hook0 = hooked;
  watch = true; haltedFrames = veilFrames = frames = 0;
  smash();
  assert.equal(V.mode, 'meteor', '结局是坠落：对手成了流星');
  assert.ok(F.on, '斗法还开着（落进界内才收场）');
  assert.ok(!c.enemies.includes(e), '对手不在斗法场里了');
  assert.ok(hooked > hook0, '往下砸那一拳走 hitEnemy（damage 钩子数得到）');
  const hpPunch = e.hp, maxHp = e.maxHp;
  assert.ok(hpPunch > 0 && hpPunch < maxHp, `挨了一拳还活着：${hpPunch}/${maxHp}`);
  // 流星往下掉，穿过界壁
  step(1.0);
  assert.ok(V.log.includes('crossed'), `穿过界壁（荡开符文涟漪）：${V.log.join(',')}`);
  assert.ok(!F.handed && F.camK < 0.2, `镜头拉回巡航的远近：${F.camK}`);
  // 按追击：俯冲追下去（自己按的；中途按住上升可以作罢——这里一路追到底）
  assert.ok(B.key('dodge', false), '追击键被坠界接走');
  assert.ok(V.plunge, '在俯冲');
  const hookChase = hooked;
  const tChase0 = g.time;
  for (let i = 0; i < 400 && xk.phase !== 'none'; i++) step(0.05);
  assert.equal(xk.phase, 'none', `落回了界内的高空：${xk.phase}`);
  const chaseT = g.time - tChase0;
  assert.ok(chaseT < 6, `俯冲追下去用不了几息：${chaseT.toFixed(2)}`);
  assert.ok(!F.on, '斗法收场了');
  assert.ok(c.enemies.includes(e), '对手被挂回界内的战斗');
  assert.ok(V.log.includes('replay'), `看得到它砸下去：${V.log.join(',')}`);
  // 等它落地
  const hp1 = hpPunch, hookA = hookChase;
  for (let i = 0; i < 60 && B.isAir(e); i++) step(0.05);
  assert.ok(!B.isAir(e), '落地了');
  const b = B.peek(e)!;
  assert.ok(b.staggerT > VOIDFALL.stunLand * 0.6, `嵌在坑里（硬直）：${b.staggerT}`);
  assert.ok(e.hp < hp1 && e.hp > 0, `落地的撞击吃了伤害、没死：${hp1} → ${e.hp}`);
  assert.ok(hooked > hookA, '坠地的撞击走 hitEnemy');
  assert.equal(e.maxHp, maxHp, '同一个对手（血量上限没变）');
  const d = Math.hypot(e.x - p.x, e.y - p.y);
  assert.ok(d < 3000, `落点就在你下方附近：${d.toFixed(0)}`);
  assert.ok(Math.hypot(e.x - to.x, e.y - to.y) < 2500, '落在它掉下去的那一点');
  assert.ok(e.aggro && e.tgP, '仇恨还在');
  watch = false;
  assert.equal(veilFrames, 0, '换图过程中没有任何遮幕 / 过场 / 暂停');
  assert.equal(haltedFrames, 0, `从出拳到落进界内 halted 一直为假（${frames} 帧）`);
  // 接着用界内的战斗打：御剑高度对它俯冲砸击
  g.hero.mp = 1; c.cds.clear();
  const hookB = hooked;
  B.heavy(false); step(1.2);
  assert.ok(hooked > hookB, '在界内接着打中了它');
  console.log(`  陆上：追下去 ${chaseT.toFixed(2)} 息；落点离人 ${d.toFixed(0)}；${frames} 帧 halted=0 遮幕=0`);
}

// ---------------------------------------------------------------- 2. 海上：沉海
{
  g.xukong.reset(); c.enemies.length = 0; B.reset(); step(0.2);
  const to = findDrop(true, p.x, p.y);
  ascendOver(to.x, to.y);
  const e = engage(4, '覆海魔修', true);
  smash();
  assert.equal(V.mode, 'meteor');
  hold('descend', () => { for (let i = 0; i < 400 && xk.phase !== 'none'; i++) step(0.05); });
  assert.equal(xk.phase, 'none', '只按住下降（不按追击）也能追下来，只是慢些');
  for (let i = 0; i < 60 && B.isAir(e); i++) step(0.05);
  const b = B.peek(e)!;
  assert.ok(b.subT > 0.8, `砸进海里沉下去（沉海的硬直）：${b.subT}`);
  assert.ok(e.hideT > 0, '沉在水下：打不到');
  for (let i = 0; i < 80 && b.subT > 0; i++) step(0.05);
  assert.ok(b.subT <= 0 && !(e.hideT > 0), '到点破水而出');
  console.log('  海上：沉海、破水而出');
}

// ---------------------------------------------------------------- 3. 没追下去：收场；降进那一界它就在落点
{
  g.xukong.reset(); c.enemies.length = 0; B.reset(); step(0.2);
  const to = findDrop(false, p.x + 30000, p.y);
  ascendOver(to.x, to.y);
  const e = engage(4, '断岳魔修', true);
  const exp0 = g.hero.exp;
  smash();
  assert.equal(V.mode, 'meteor');
  const hpP = e.hp;
  step(VOIDFALL.idleEnd + 3.5);
  assert.ok(e.hp < hpP && !e.dead, `带着坠落的伤活着：${hpP} → ${e.hp}`);
  assert.equal(g.hero.exp, exp0, '不追不算赢：这一场不结算');
  assert.equal(V.mode, 'none', '流星落定、没人追：收场');
  assert.ok(!F.on && xk.phase === 'void', '回到寻常的虚空飞行');
  assert.ok(V.pending && V.pending.e === e, '记下了落点');
  // 不从正上方降：先降到远处，再自己飞到落点附近，它也在
  xk.x += 400; (xk as any).scanT = 0; step(0.3);
  hold('descend', () => { for (let i = 0; i < 600 && xk.phase !== 'none'; i++) step(0.05); });
  assert.equal(xk.phase, 'none', '降回界内');
  assert.ok(!c.enemies.includes(e), '离落点远：还没碰上');
  const P = V.pending!; g.teleport(P.x + 3000, P.y); step(0.3);
  assert.ok(c.enemies.includes(e), '自己找到落点附近，它就在那儿');
  assert.ok(e.aggro && e.hp < hpP, '伤着、仇恨记着');
  assert.ok(V.log.includes('found'));
  console.log('  没追下去：之后降下来，它就在坑里');
}

// ---------------------------------------------------------------- 4. 落点在另一张图：换图也接得上
{
  g.xukong.reset(); c.enemies.length = 0; B.reset(); step(0.2);
  // 从南荒升出去，飞到中州的正上方再交手
  const to = findDrop(false, p.x, p.y);
  ascendOver(to.x, to.y);
  const dj = pointToVoid('dajin', 400000, 300000);
  xk.x = dj.x; xk.y = dj.y; (xk as any).scanT = 0; step(0.3);
  const L = landing(HOME, xk.x, xk.y)!;
  assert.equal(L.map, 'dajin', '脚下是中州');
  // 对手是追杀你的人（真的追杀：追进虚空的追兵）
  g.pursuit.reset(); (g.pursuit as any).cd = 0;
  assert.ok(g.debugPursuit(1), '起了一场追杀');
  const e = g.pursuit.cur!.e;
  c.enemies = c.enemies.filter((q: any) => q !== e);
  F.engage({ id: 'vf-chaser', name: e.name, x: xk.x + 5, y: xk.y, tier: e.realm, enemy: e });
  for (let i = 0; i < 80 && !F.handed; i++) step(0.05);
  e.x = p.x + 100; e.y = p.y + 4; e.flyH = p.z; c.lock = e; c.manual = true;
  { const b = B.body(e); b.poise = 0; b.breakT = 999; e.speed = 0; e.def = { ...e.def, melee: undefined, ranged: undefined }; e.kit = []; e.skT = 1e9; if (b.ai) b.ai.cd = 1e9; }
  g.hero.realm = Math.max(g.hero.realm, e.realm); (e as any).ward = undefined;   // 追兵的护体灵光会把这一拳整个吃掉（那是另一回事）：测试只管坠界
  smash();
  assert.equal(V.mode, 'meteor');
  B.key('dodge', false);
  watch = true; haltedFrames = veilFrames = 0;
  for (let i = 0; i < 400 && xk.phase !== 'none'; i++) step(0.05);
  watch = false;
  assert.equal(WM.ACTIVE_MAP, 'dajin', '换到了中州');
  assert.equal(xk.phase, 'none');
  assert.ok(c.enemies.includes(e), '换图后对手照样挂回界内');
  assert.equal(g.pursuit.cur?.e, e, '追杀接着');
  assert.equal(haltedFrames, 0, '换图这一趟 halted 也一直为假');
  assert.equal(veilFrames, 0);
  for (let i = 0; i < 60 && B.isAir(e); i++) step(0.05);
  assert.ok((B.peek(e)?.staggerT ?? 0) > 1 || (B.peek(e)?.subT ?? 0) > 0.5, '落地带硬直');
  g.pursuit.reset();
  console.log('  跨图：落在中州，接得上');
}

// ---------------------------------------------------------------- 5. 反过来：你被砸下去，途中脱困
{
  g.xukong.reset(); c.enemies.length = 0; B.reset(); step(0.2);
  const to = findDrop(false, p.x, p.y);
  ascendOver(to.x, to.y);
  const e = engage(5, '裂空魔尊', false);
  e.boss = true; e.atk *= 0.15;   // 只看坠界：别一拳把人打死
  B.pb.poise = 0; B.pb.breakT = 3; g.hero.hp = 1;
  // 魔尊一记重击落下（直接走 brawlfoe 的出手：两拳一记重击里的那一记）
  const ai = B.body(e).ai!; ai.pat = 'h'; ai.i = 0; ai.st = 'combo'; ai.t = 0.3; ai.cd = 0; ai.tg = null;
  e.x = p.x + 60; e.y = p.y;
  watch = true; haltedFrames = veilFrames = 0;
  for (let i = 0; i < 60 && V.mode !== 'dropped'; i++) step(0.025, () => { B.pb.breakT = Math.max(B.pb.breakT, 1); });
  assert.equal(V.mode, 'dropped', '被一记重击砸向下界');
  const h0 = xk.h;
  step(0.4);
  assert.ok(xk.h < h0 * 0.6, `一直往下坠：${h0.toFixed(0)} → ${xk.h.toFixed(0)}`);
  assert.ok(!g.halted, '坠落途中不是停住的虚空：能操作');
  // 方向照常能拨
  const vx0 = xk.x; hold('d', () => step(0.3)); assert.ok(xk.x > vx0, '下坠途中方向照常能拨');
  g.hero.mp = 1;
  assert.ok(B.key('dodge', false), '脱困键被接走');
  assert.equal(V.mode, 'none', '脱困了');
  assert.ok(g.hero.mp < 0.85, '脱困耗灵力');
  step(1.5);
  assert.ok(F.on && F.handed, '接着在虚空里斗（镜头又拉近）');
  assert.ok(c.enemies.includes(e), '对手追到身边');
  watch = false;
  assert.equal(haltedFrames, 0);
  console.log('  反向：被砸下去、途中脱困');

  // ---------------------------------------------------------------- 6. 不脱困：一路砸进界内
  B.pb.poise = 0; B.pb.breakT = 3; B.pb.techCd = 0; g.hero.hp = 1;
  const hpP = g.hero.hp, hook0 = hookedP;
  V.dropPlayer(e);
  assert.equal(V.mode, 'dropped');
  watch = true; haltedFrames = veilFrames = 0;
  for (let i = 0; i < 400 && xk.phase !== 'none'; i++) step(0.05);
  assert.equal(xk.phase, 'none', '砸进了界内');
  for (let i = 0; i < 60 && B.pb.air; i++) step(0.05);
  watch = false;
  assert.ok(!B.pb.air, '落了地');
  assert.ok(g.hero.hp < hpP, `坠地吃了伤害：${hpP} → ${g.hero.hp.toFixed(3)}`);
  assert.ok(hookedP > hook0, '坠地的撞击走 hitPlayer（damage 钩子）');
  assert.ok(B.pb.staggerT > 0.3 || B.pSubT > 0, '坠地的硬直');
  assert.ok(c.enemies.includes(e), '对手追下来了');
  assert.equal(haltedFrames, 0, '一路砸下来也没有停住的那一段');
  assert.equal(veilFrames, 0);
  step(2);
  assert.ok(Math.hypot(e.x - p.x, e.y - p.y) < 1500 && !B.isAir(e), '对手落在你身边');
  void ALT; void VOID_SCALE;
  console.log('  反向：没脱困，砸进界内吃了伤害，对手追下来');
}
// ---------------------------------------------------------------- 7. 界内（日常那一版）：御剑高空把人砸下去，一键追击俯冲
{
  g.xukong.reset(); c.enemies.length = 0; B.reset(); step(0.2);
  for (const sea of [false, true]) {
    const to = findDrop(sea, p.x, p.y);
    g.teleport(to.x, to.y); c.enemies.length = 0;
    if (!p.flying) g.toggleFly();
    p.z = p.zTarget = ALT.max; step(0.3);
    const e = B.spawnBrawler(p.x + 90, p.y, 3, 1);
    e.maxHp = e.hp = e.maxHp * 4; e.flyH = p.z; e.speed = 0; e.def = { ...e.def, melee: undefined, ranged: undefined, flying: false } as any; e.kit = []; e.skT = 1e9;
    const b = B.body(e); b.poise = 0; b.breakT = 999; if (b.ai) b.ai.cd = 1e9;
    c.lock = e; c.manual = true; g.hero.mp = 1; c.cds.clear();
    B.heavy(true);
    let wasMeteor = false;
    for (let i = 0; i < 20 && !wasMeteor; i++) { step(0.025); wasMeteor = B.isAir(e) && B.peek(e)!.meteor === 1; }
    assert.ok(wasMeteor && B.slamFoe === e, '御剑高度往下砸：成了流星');
    const hp0 = e.hp, hk = hooked;
    assert.ok(B.key('dodge', false), '一键追击');
    for (let i = 0; i < 80 && (B.isAir(e) || (B as any).mv); i++) step(0.025);
    step(0.3);
    assert.ok(hooked > hk && e.hp < hp0, '俯冲追砸打中了（' + (sea ? '海' : '陆') + '）');
    console.log('  界内' + (sea ? '海上' : '陆上') + '：高空砸落、一键追击俯冲打中');
  }
}
// ---------------------------------------------------------------- 8. 第三轮遗留：沉水与追兵土遁共用 hideT 互不干扰；目标没了罡气条不挂；敌人的大范围招式碎石
{
  g.xukong.reset(); c.enemies.length = 0; B.reset(); g.pursuit.reset(); step(0.2);
  const to = findDrop(true, p.x, p.y);
  g.teleport(to.x, to.y); if (!p.flying) g.toggleFly(); p.z = p.zTarget = 200; step(0.2);
  (g.pursuit as any).cd = 0; assert.ok(g.debugPursuit(1));
  const P = g.pursuit.cur!, e = P.e; e.x = p.x + 300; e.y = p.y; e.gone = false; (e as any).ward = undefined;   // 追兵刚起追时还在画面外（gone）：直接摆到身边
  if (!c.enemies.includes(e)) c.enemies.push(e);   // 追兵刚起追时还没进战斗名单
  B.meteorIn(e, 'p', 300, -2200, false);
  for (let i = 0; i < 40 && B.isAir(e); i++) step(0.025);
  const b = B.peek(e)!;
  assert.ok(b.subT > 0 && e.hideT > 0, '追兵被砸进海里沉下去（借 hideT 藏起来）');
  let earthDuring = false;
  for (let i = 0; i < 200 && b.subT > 0; i++) { step(0.025); if ((P as any).earth) earthDuring = true; if (b.subT > 0) assert.ok(e.hideT > 0, '沉着的时候一直藏着（追杀系统把它往下减，近战每帧补回去）'); }
  assert.ok(!earthDuring, '沉在水里时追杀系统不会起土遁');
  assert.ok(!(e.hideT > 0), '浮上来以后不再藏着');
  // 土遁中的追兵：砸不进水里；它土遁时近战不会把它的 hideT 清掉
  (P as any).earth = { x: e.x + 200, y: e.y }; e.hideT = 1.1;
  assert.ok(!B.launchable(e), '土遁潜行中的人不会被击飞 / 砸下去');
  b.subT = 0.01; b.subX = e.x; b.subY = e.y; B.track(e);
  step(0.05);
  assert.ok(e.hideT > 0.5, `浮上来那一下不清掉追兵的土遁：${e.hideT}`);
  // 交手对象被挪走（换图、救回、传送）：罡气条不再挂着
  (B as any).engage(e); assert.ok(B.hud().foe, '交手中有罡气条');
  c.enemies = c.enemies.filter((q: any) => q !== e); step(0.05);
  assert.equal(B.hud().foe, null, '对手不在战斗里了：罡气条收起');
  g.pursuit.reset();
  // 敌人的大范围招式碎石
  const L = findDrop(false, p.x, p.y); g.teleport(L.x, L.y); if (p.flying) g.toggleFly(); step(0.2);
  B.brk.reset(); B.brk.manual = true;
  const rk = B.brk.place('boulder', p.x + 400, p.y, 0.7, 0)!;
  const caster = B.spawnBrawler(p.x + 700, p.y, 3, 1);
  const hz: any = { k: 'circle', x: p.x + 420, y: p.y, r: 200, ang: 0, spread: 0, len: 0, w: 0, t: 0.6, tele: 0.5, dur: 3, el: 'fire', dmg: 1, realm: 3, fired: true, tick: 0, src: caster, big: true };
  c.foe.hz.push(hz); step(0.1);
  assert.ok(rk.dead, '敌人的大圈招式把巨石轰碎了');
  console.log('  遗留：沉水 / 土遁互不干扰；罡气条随目标收起；大范围招式碎石');
}
console.log('test-voidfall 通过');
