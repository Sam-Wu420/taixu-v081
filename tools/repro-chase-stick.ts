// 回归：追上之后「咬不咬得住」。
// 旧脚本（repro-pursuit-speed / repro-hunt-speed）只测“追进 520 丈”就结束，漏掉了玩家真正反馈的问题：
//   · 主追杀头领追到 380~420 丈外就停车，你走多慢他跟多慢，永远不贴身；
//   · 仇家 NPC 转成战斗单位后只剩斗法身法，且离出手处 3200 丈就脱战回家——御剑也追不上步行的元婴后期。
// 本脚本让元婴后期玩家持续赶路 22 秒，统计追兵贴身（< 450 丈）的时间占比与最远被甩开的距离。
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { hunterChaseSpeed } = await import('../src/world/chasespeed');
const { ACTIVE_MAP } = await import('../src/data/world');

let seed = 20240607;
const seeded = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗ 失败'} ${msg}`); if (!ok) fails++; };

function setup(fly: boolean) {
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.modalStack = []; g.input.keys.clear();
  const h = g.hero;
  h.realm = 4; h.stage = 2; h.hp = h.maxHp = 1e9; h.mp = 1e9; h.equip = {}; h.dead = false;
  g.player.x = 120000; g.player.y = 93000; g.player.flying = fly; g.player.boosting = false; g.player.running = false;
  g.concealed = false; g.senseBurstT = 0; g.combat.spawnT = 1e9; g.noFlyT = 0;
}
function step(keys: string[]) {
  g.modal = null; g.modalStack = []; g.input.keys.clear(); for (const k of keys) g.input.keys.add(k);
  g.combat.invulnT = 5; g.hero.hp = g.hero.maxHp; g.hero.mp = 1e9; g.combat.spawnT = 1e9;
  g.update(1 / 30);
}

/** 主追杀（PursuitSys） */
function main(label: string, fly: boolean, keys: string[], expectStick: boolean) {
  seed = 777; Math.random = seeded;
  setup(fly);
  for (let i = 0; i < 10; i++) step(keys);
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: 0, force: true });
  const P = g.pursuit.cur; if (!P) { console.log(`${label}：未能启动追杀，跳过`); return; }
  P.realm = 4; P.stage = 2; P.e.realm = 4; P.e.stage = 2; P.chase = hunterChaseSpeed(4, 2); P.lockR = 5200; P.waves = 0;
  let first = -1, near = 0, n = 0, maxAfter = 0, minD = 1e9, hv = 0, farLate = 0;
  for (let i = 0; i < 30 * (expectStick ? 22 : 30); i++) {
    step(keys);
    const C = g.pursuit.cur; if (!C) break;
    const d = Math.hypot(C.e.x - g.player.x, C.e.y - g.player.y); minD = Math.min(minD, d);
    hv = Math.max(hv, Math.hypot(g.player.st?.vx ?? 0, g.player.st?.vy ?? 0));
    if (first < 0 && d < 520) first = i / 30;
    if (first >= 0) { n++; if (d < 640) near++; maxAfter = Math.max(maxAfter, d); }
    if (i > 90) farLate = Math.max(farLate, d);
  }
  const frac = n ? near / n : 0;
  console.log(`${label}：玩家最高速=${hv.toFixed(0)} 首次追近=${first < 0 ? '无' : first.toFixed(1) + 's'} 最近=${minD.toFixed(0)} 贴身占比=${(frac * 100).toFixed(0)}% 追近后最远=${maxAfter.toFixed(0)} 追杀仍在=${!!g.pursuit.cur}`);
  if (expectStick) { check(first >= 0 && first < 8, '8 秒内追近'); check(frac > 0.8, '追近后八成以上时间咬在 640 丈（出招射程）内'); check(minD < 360, '真正贴身（进过 360 丈），而不是停在 400 丈外尾随'); }
  else check(!g.pursuit.cur || farLate > 1500, `催动遁光：同境追兵被拉开 / 甩掉（最远 ${farLate.toFixed(0)}，保命手段仍然有效）`);
}

/** 仇家 NPC 追杀（NpcWorld → toEnemy → 战斗 AI） */
function npcHunt() {
  seed = 4242; Math.random = seeded;
  setup(false);
  const p = g.player;
  const d = g.npcs.list.find((x: any) => x.alive && x.realm === 4 && !x.beauty && !x.canon && !x.bond && !x.stay && !x.sect)
    ?? g.npcs.list.find((x: any) => x.alive && !x.beauty && !x.canon && !x.bond && !x.stay && x.faction !== 'mortal');
  if (!d) { console.log('仇家 NPC：找不到可用 NPC，跳过'); return; }
  d.realm = 4; d.stage = 2; d.sect = undefined; d.map = ACTIVE_MAP;
  g.npcs.active.delete(d.id);
  d.x = p.x - 1500; d.y = p.y + 80; d.tx = p.x; d.ty = p.y; d.goal = 'travel'; d.hunting = false;
  for (let i = 0; i < 5; i++) step([]);
  g.rel.startHunt(d, true, true, undefined, true);
  const keys = ['d', 'shift'];
  let conv = -1, ox = 0, oy = 0, near = 0, n = 0, maxAfter = 0, lostAggro = 0, far = 0, safeFrames = 0;
  for (let i = 0; i < 30 * 26; i++) {
    step(keys);
    const a = g.npcs.activeOf(d.id), e = a?.enemy;
    const dist = Math.hypot(d.x - p.x, d.y - p.y);
    if (conv < 0 && e) { conv = i / 30; ox = e.x; oy = e.y; }
    if (conv >= 0) {
      n++; if (dist < 700) near++; maxAfter = Math.max(maxAfter, dist);
      const safeNow = g.combat.safeAt(p.x, p.y); if (safeNow) safeFrames++;   // 你躲进城镇：按设计追兵不进城，不算脱战
      if (e) { far = Math.max(far, Math.hypot(e.x - ox, e.y - oy)); if (!e.aggro && !e.dead && !safeNow && safeFrames === 0) lostAggro++; }
    }
  }
  const frac = n ? near / n : 0;
  console.log(`仇家 NPC（元婴后期追元婴后期，玩家纯跑步）：转敌=${conv < 0 ? '无' : conv.toFixed(1) + 's'} 出招射程内占比=${(frac * 100).toFixed(0)}% 最远=${maxAfter.toFixed(0)} 离出手处=${far.toFixed(0)} 脱战帧=${lostAggro} 途经安全区帧=${safeFrames}`);
  check(conv >= 0, '追上并转入战斗');
  check(frac > 0.7, '转敌后七成以上时间咬在 700 丈（出招射程）内');
  check(far > 5000 && lostAggro < 30, '被带出三千丈以外仍不脱战（不再被“离家太远”拴回去）');
}

// 顺序：先跑对全局状态最敏感的两个场景（仇家 NPC、遁光），避免上一场的禁空 / 迟滞残留造成误判
npcHunt();
main('主追杀·催动遁光', true, ['d', 'shift'], false);
main('主追杀·纯跑步', false, ['d', 'shift'], true);
main('主追杀·慢走', false, ['d'], true);
main('主追杀·御器平飞', true, ['d'], true);
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
