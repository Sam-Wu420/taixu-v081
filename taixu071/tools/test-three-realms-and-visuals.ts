import './env';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCanvas } from './env';

(globalThis as any).window = {
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false }),
};
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
(globalThis as any).sessionStorage = {
  getItem: (k: string) => store.get('__s_' + k) ?? null,
  setItem: (k: string, v: string) => { store.set('__s_' + k, v); },
  removeItem: (k: string) => { store.delete('__s_' + k); },
};
(globalThis as any).__FANREN_NORELOAD = true;

const { planeMeta, planeEnemyTag, planeFactions, worldCurrencyId, worldCurrencyName } = await import('../src/data/worldHierarchy');
const { ENEMIES } = await import('../src/data/enemies');
const { Terrain } = await import('../src/world/terrain');
const { Game, SLOT_KEYS } = await import('../src/world/game');
const { lowerWorldSectRecords, ensureWorldSlice } = await import('../src/world/worldstate');
const { appointRegentOnAscend } = await import('../src/world/mysect');
const { CharState, HANLI_LOOK, drawCharacter, drawCloudUnderFeet } = await import('../src/gfx/character');
const { PLAYER_SCALE } = await import('../src/world/render');
const { AIRSHIP_BATTLE_SPEC } = await import('../src/world/warairship');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');

// 1) Part A: 三界动态配置注册表与灵/仙界模板校验
assert.equal(worldCurrencyId('human'), 'mat_lingshi');
assert.equal(worldCurrencyId('spirit'), 'mat_lingjing');
assert.equal(worldCurrencyId('immortal'), 'mat_xianyuan');
assert.equal(worldCurrencyName('spirit'), '灵晶');
assert.equal(worldCurrencyName('immortal'), '仙元石');
assert.equal(planeEnemyTag('spirit'), 'spirit');
assert.equal(planeEnemyTag('immortal'), 'immortal');
assert.ok(planeFactions('spirit').length >= 4);
assert.ok(planeFactions('immortal').length >= 3);
assert.equal(planeMeta('spirit').dangerK[0] > 0, true);
assert.equal(planeMeta('immortal').dangerK[0] > planeMeta('spirit').dangerK[0], true);
for (const eid of ['ling_sanxiu', 'ling_moyuan', 'xian_sanxiu', 'xian_huimo', 'xian_xunxian_shizhe']) {
  assert.ok(ENEMIES[eid], `missing enemy template ${eid}`);
}
console.log('ok   Part A: three-world metadata, currencies, factions and enemy templates verified');

// 2) Part B: 飞升跨界宗门隔离、自建宗门自动委任代掌门与旧档治愈
const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
g.onTravel = () => {};
g.hero.realm = 5;
g.hero.stage = 2;
g.ws.sect = { id: 'huangfeng', rank: 4, contrib: 5000, joined: 10, lastPay: 10, tasks: [], done: 12, v8: true };
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '太虚宗',
  dao: 'zheng',
  map: 'renjie',
  x: hf.x + 18,
  y: hf.y + 10,
  founded: 20,
  fame: 800,
  stones: 12000,
  tribute: 0,
  ds: [
    { id: 1, name: '林长风', sex: 'm', age: 48, root: 4, realm: 3, stage: 1, exp: 0.2, loyal: 88, rank: 2, job: 'xiu', joined: 25, arts: 2 },
    { id: 2, name: '韩石', sex: 'm', age: 29, root: 3, realm: 2, stage: 0, exp: 0.1, loyal: 75, rank: 1, job: 'ye', joined: 30, arts: 1 },
  ],
  seq: 3,
  apps: [],
  lib: [],
  gf: g.hero.gongfa,
  halls: { lib: 1, dan: 1, zhen: 1, ling: 1, dock: 0 },
  open: true,
  minRoot: 2,
  auto: false,
  lastM: 1,
  lastTeach: 0,
  log: [],
  gifts: [],
  wins: 0,
  losses: 0,
};
g.mysect.sync();

// 模拟直接飞升灵界
const ascended = g.ascendSpirit('orthodox');
assert.equal(ascended, true, 'ascendSpirit orthodox succeeded');
const hSlice = g.ws.worlds?.human;
assert.ok(hSlice?.sect && hSlice.sect.id === 'huangfeng' && hSlice.sect.rank === 4, 'human sect preserved in worlds.human');
assert.ok(hSlice?.mySect && hSlice.mySect.name === '太虚宗', 'human mySect preserved in worlds.human');
assert.equal(hSlice.mySect.masterId, 1, 'highest eligible disciple auto-appointed as regent on ascend');
assert.equal(g.ws.sect, null, 'upper world ws.sect starts empty after ascension');
assert.equal(g.ws.mySect, undefined, 'upper world ws.mySect starts empty after ascension');
assert.equal(lowerWorldSectRecords(g.ws, 'spirit').length, 1, 'lowerWorldSectRecords exposes human legacy in spirit world');

// 直接调用 appointRegentOnAscend 空名册分支
const emptySect: any = { name: '空山门', ds: [], log: [] };
assert.equal(appointRegentOnAscend(emptySect, 120), null);
assert.ok(emptySect.log[0].t.includes('封山守望'));

// 3) Part C: 体型统一 1.12、流云绘制、飞行高度与战船高度
assert.equal(PLAYER_SCALE, 1.12);
assert.equal(AIRSHIP_BATTLE_SPEC[1].zLift, 150);
assert.equal(AIRSHIP_BATTLE_SPEC[2].zLift, 200);
assert.equal(AIRSHIP_BATTLE_SPEC[3].zLift, 260);

const cv = createCanvas(360, 360);
const ctx = cv.getContext('2d') as any;
const hashDraw = (opts: { noDefaultMount: boolean; flightCloud?: boolean }) => {
  const st = new CharState(180, 265);
  st.t = 1;
  st.seed = 42;
  st.setAction('fly');
  ctx.clearRect(0, 0, 360, 360);
  drawCharacter(ctx, HANLI_LOOK, st, 1.5, 0, opts);
  return createHash('sha256').update(cv.toBuffer('image/png')).digest('hex');
};
const hPlain = hashDraw({ noDefaultMount: true });
const hSword = hashDraw({ noDefaultMount: false });
const hCloud = hashDraw({ noDefaultMount: true, flightCloud: true });
assert.notEqual(hPlain, hSword, 'bare noDefaultMount policy still intact');
assert.notEqual(hPlain, hCloud, 'flightCloud draws visible clouds under feet');
assert.notEqual(hSword, hCloud, 'flightCloud differs from sword mount');

ctx.clearRect(0, 0, 360, 360);
drawCloudUnderFeet(ctx, 180, 180, 0.5, 1.12, 2.0, '#c8ecff');
assert.ok(ctx.getImageData(180, 183, 1, 1).data[3] > 0, 'drawCloudUnderFeet renders visible pixels');

// 验证玩家飞行目标高度收敛到 96 + alt * 64
const g2 = new Game(terrain);
g2.hero.realm = 2;
g2.hero.mp = 1;
g2.player.flying = true;
g2.alt = 0.5;
g2.player.x = 120 * WORLD_SCALE;
g2.player.y = 120 * WORLD_SCALE;
for (let i = 0; i < 60; i++) g2.update(0.05);
assert.ok(g2.player.st.lift > 115 && g2.player.st.lift <= 130, `player flying lift converged near 128, got ${g2.player.st.lift.toFixed(1)}`);

console.log('ok   Part B & Part C: ascension sect isolation, regent appoint, flightCloud & heights verified');

// 4) Part D: 上界奇观巨物渲染、斩仙榜实战除名、灵界/仙界接引池（活人迁移·绝不复活故人）
const { renderLmStand } = await import('../src/gfx/landmark');
for (const sk of ['spirit_tree', 'star_array', 'thunder_pillar', 'immortal_palace', 'dao_monument'] as const) {
  const spr = renderLmStand({ k: sk, w: 320, h: 360, seed: 12345 }, 0.5);
  assert.ok(spr && spr.canvas.width > 100 && spr.canvas.height > 100, `colossal stand ${sk} rendered`);
}

const { completeImmortalRankKill } = await import('../src/world/higherPlane');
const pagesBefore = g2.hero.bag.find((b: any) => b.id === 'item_canjuan_page')?.n ?? 0;
const rankRes = completeImmortalRankKill(g2.hero, g2.ws, 'rank_beihan_pan');
assert.equal(rankRes.ok, true);
assert.ok(g2.ws.worlds?.immortal?.immortalRankDone?.includes('rank_beihan_pan'));
assert.equal((g2.hero.bag.find((b: any) => b.id === 'item_canjuan_page')?.n ?? 0), pagesBefore + 1);

// 验证化灵接引池严禁复活已故 NPC，仅接引下界在世弟子与故交
const g3 = new Game(terrain);
// 先在人界写入下界宗门与 1 活 1 死两名亲友
const h3Slice = ensureWorldSlice(g3.ws, 'human');
h3Slice.mySect = {
  name: '青阳宗', dao: 'zheng', map: 'renjie', x: 500, y: 500, founded: 1, fame: 400, stones: 5000, tribute: 0,
  ds: [{ id: 11, name: '李元', sex: 'm', age: 80, root: 4, realm: 4, stage: 1, exp: 0.2, loyal: 90, rank: 2, job: 'xiu', joined: 10, arts: 1 }],
  seq: 12, apps: [], lib: [], gf: 'changchun', halls: { lib: 0, dan: 0, zhen: 0, ling: 0, dock: 0, chi: 0 }, open: true, minRoot: 2, auto: false, lastM: 1, lastTeach: 0, log: [], gifts: [], wins: 0, losses: 0,
};
g3.npcs.list.push(
  { id: 'npc_alive', name: '莫彩环', sex: 'f', age: 42, life: 500, root: 'true', realm: 4, stage: 1, sect: 'huangfeng', rank: 3, map: 'renjie', x: 100, y: 100, gx: 100, gy: 100, favor: 80, rel: 'friend', alive: true, look: HANLI_LOOK, bio: '', met: true, mood: 0, gf: 'changchun' } as any,
  { id: 'npc_dead', name: '厉飞雨', sex: 'm', age: 85, life: 85, root: 'mortal', realm: 0, stage: 0, sect: '', rank: 0, map: 'renjie', x: 120, y: 120, gx: 120, gy: 120, favor: 90, rel: 'sworn', alive: false, look: HANLI_LOOK, bio: '', met: true, mood: 0, gf: 'generic' } as any,
);
g3.hero.realm = 6;
(g3.ws as any).mySect = {
  name: '青阳灵宗', dao: 'zheng', map: 'lingjie', x: 1200, y: 1200, founded: 100, fame: 600, stones: 100000, tribute: 0,
  ds: [], seq: 1, apps: [], lib: [], gf: 'taichu_jianjing', halls: { lib: 0, dan: 0, zhen: 0, ling: 0, dock: 0, chi: 1 }, open: true, minRoot: 2, auto: false, lastM: 1, lastTeach: 0, log: [], gifts: [], wins: 0, losses: 0,
};
g3.mysect.sync();
const cands = g3.mysect.ascendPoolCandidates();
assert.equal(cands.disciples.length, 1, 'lower-world living disciple listed');
assert.ok(cands.npcs.some((c) => c.n.id === 'npc_alive'), 'alive NPC listed as candidate');
assert.ok(!cands.npcs.some((c) => c.n.id === 'npc_dead'), 'deceased NPC never listed in eligible npcs');
assert.ok(cands.deadNpcs.some((n) => n.id === 'npc_dead'), 'deceased NPC listed separately as ineligible');
const deadAttempt = g3.mysect.ascendPullNpc('npc_dead');
assert.equal(deadAttempt.ok, false, 'deceased NPC must never be resurrected via ascend pool');
const aliveAttempt = g3.mysect.ascendPullNpc('npc_alive');
assert.equal(aliveAttempt.ok, true, 'alive 元婴 friend successfully guided to Spirit Realm sect');
assert.equal(g3.npcs.list.find((n: any) => n.id === 'npc_alive')?.map, 'lingjie', 'migrated NPC map updated to lingjie');
assert.equal(g3.npcs.list.find((n: any) => n.id === 'npc_dead')?.alive, false, 'deceased NPC stays dead');

console.log('ok   Part D: higher-plane colossal wonders, immortal rank combat hook, and ascend pool alive-only checks verified');

// ------------------------------------------------------------ Part E: 好友求救直接导航
const g4 = new Game(terrain);
const friend4 = g4.npcs.list.find((d) => d.alive && !d.beauty && (d.map ?? 'renjie') === 'renjie');
assert.ok(friend4, 'found living friend candidate on renjie');
if (friend4) {
  friend4.met = true; friend4.favor = 60; friend4.realm = 2;
  const invHelp = g4.friends.makeInvite('help', friend4);
  assert.ok(invHelp, 'created friend help invite');
  if (invHelp) {
    assert.ok(g4.friends.marks().some((m) => m.glyph === '援' && m.x === invHelp.x), 'unaccepted help invite emits pulsing 援 mark');
    assert.ok(g4.activeSosTargets().some((t) => t.inviteId === invHelp.id && t.urgent), 'activeSosTargets surfaces friend help invite');
    g4.hero.realm = 2; // 筑基可御剑
    g4.friends.acceptAndGo(invHelp);
    assert.equal(invHelp.accepted, true, 'acceptAndGo marks invite accepted');
    assert.ok(g4.guide && Math.abs(g4.guide.x - invHelp.x) < 1, 'acceptAndGo sets persistent map guide');
    assert.ok(g4.destination && Math.abs(g4.destination.x - invHelp.x) < 1, 'acceptAndGo sets active destination');
    assert.ok(g4.autoFlight && Math.abs(g4.autoFlight.x - invHelp.x) < 1, 'acceptAndGo starts autoFlight when player can fly');
    assert.ok(g4.friends.marks().some((m) => m.glyph === '约' && m.x === invHelp.x), 'accepted invite emits 约 mark');
  }
}
const { ALWAYS_MARK, isMarkVisible } = await import('../src/ui/mapFilter');
assert.equal(ALWAYS_MARK.has('援'), true, '援 mark is in ALWAYS_MARK');
assert.equal(isMarkVisible('援'), true, '援 mark is always visible');
g4.war.send({ kind: '求救', from: '测试道友', fromId: friend4?.id, text: '速来救我', x: 18000, y: 12000, until: g4.day + 5 }, true);
const jadeSos = g4.war.inbox.find((j) => j.kind === '求救');
assert.ok(jadeSos, 'jade SOS queued');
assert.ok(g4.activeSosTargets().some((t) => t.tag === '求救' && t.x === 18000), 'jade SOS included in activeSosTargets');
const jadeDn = g4.war.jadeNode(jadeSos!);
const jadeGo = jadeDn.options.find((o) => o.label.includes('直接导航'));
assert.ok(jadeGo, 'jade SOS node exposes direct navigation option');
jadeGo!.act!();
assert.ok(g4.guide && g4.guide.x === 18000 && g4.destination && g4.destination.x === 18000, 'jade SOS direct nav sets guide & destination');

// ------------------------------------------------------------ Part F: 好友求援未应约直抵、在途不临阵过期、及求助仇敌动态追踪
const friend5 = g4.npcs.list.find((d) => d.alive && !d.beauty && d !== friend4 && (d.map ?? 'renjie') === 'renjie');
assert.ok(friend5, 'found second living friend candidate');
if (friend5) {
  friend5.met = true; friend5.favor = 75; friend5.realm = 2; friend5.hidden = true;
  const invMap = g4.friends.makeInvite('help', friend5);
  assert.ok(!invMap, 'hidden NPC excluded from makeInvite');
  friend5.hidden = false;
  const inv2 = g4.friends.makeInvite('help', friend5);
  assert.ok(inv2, 'created unaccepted help invite');
  if (inv2) {
    // 模拟玩家只点击地图「援」标前往（未提前 accept），且途中跨日到期
    g4.setDestination(inv2.x, inv2.y, '测试求援');
    g4.day = inv2.until + 0.1;
    g4.friends.daily(1);
    assert.equal(!!inv2.done, false, 'en-route help invite does not expire mid-flight');
    // 抵达现场（即使未提前 accept）必须触发求援并召唤挚友与敌人
    g4.player.x = inv2.x + 120; g4.player.y = inv2.y;
    const foesBefore = g4.combat.enemies.length;
    g4.friends.update(0.05);
    assert.equal(inv2.accepted, true, 'arriving at unaccepted help invite auto-accepts');
    assert.equal(inv2.fired, true, 'arriving at help invite fires encounter');
    assert.ok(g4.npcs.active.has(friend5.id), 'rescued friend materializes at scene');
    assert.ok(g4.combat.enemies.length > foesBefore, 'rescue encounter spawns enemies');
  }
}

// 玉符「求助」目标移动时，自动寻路动态追踪最新坐标，且在 NPC 满员时仍优先入场
g4.combat.enemies = [];
const foeNpc = g4.npcs.list.find((d) => d.alive && !d.beauty && d !== friend4 && d !== friend5 && (d.map ?? 'renjie') === 'renjie');
assert.ok(foeNpc, 'found moving foe candidate');
if (foeNpc) {
  foeNpc.realm = Math.max(2, foeNpc.realm);
  g4.war.send({ kind: '求助', from: friend4?.name ?? '故友', fromId: friend4?.id, foeId: foeNpc.id, text: '助我除掉此贼', until: g4.day + 10 }, true);
  const sosReq = g4.activeSosTargets().find((t) => t.followNpcId === foeNpc.id);
  assert.ok(sosReq, 'activeSosTargets exposes followNpcId for 求助');
  g4.navigateTo(sosReq!.x, sosReq!.y, sosReq!.title, sosReq!.followNpcId);
  // 模拟目标在飞行途中走动并进入玩家附近（同时验证即使 active 已满 34 人也必须入场）
  foeNpc.x = g4.player.x + 900; foeNpc.y = g4.player.y + 450;
  foeNpc.tx = foeNpc.x + 200; foeNpc.ty = foeNpc.y + 100;
  g4.update(0.26);
  g4.update(0.26);
  g4.update(0.05);
  assert.ok(g4.npcs.active.has(foeNpc.id), 'priority 求助 target activates in npcs.active');
  const livePos = g4.npcs.active.get(foeNpc.id)!.st;
  assert.ok(g4.destination && Math.hypot(g4.destination.x - livePos.x, g4.destination.y - livePos.y) < 120, 'destination dynamically tracks moving foeNpc');
  assert.ok(g4.guide && Math.hypot(g4.guide.x - livePos.x, g4.guide.y - livePos.y) < 120, 'guide dynamically tracks moving foeNpc');
}
console.log('ok   Part F: unaccepted rescue arrival, en-route expiry hold, and dynamic NPC tracking verified');
console.log('ALL PASSED');
