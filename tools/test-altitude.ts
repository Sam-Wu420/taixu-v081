// 真实高度与空战：升降与高度带、锁定自动对齐、近战够不够得着、弹道朝目标高度飞、范围技的圆柱与球、会飞的敌人追上来。
// 用真实的 Game 无界面地跑。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMY_LIST } = await import('../src/data/enemies');
const { ALT, settleAltitude, meleeReaches, bandName } = await import('../src/world/alt');
const g = await G.createGame(() => {});
g.reset();
g.hero.realm = 3; g.hero.stage = 0;
const p = g.player, c = g.combat as any;
// 野外随机刷的妖兽、劫修不该掺进来（同 test-melee）：测试期间不让环境刷怪的计时走到头
// 场上只许有这一节自己放的敌人。世界照常运转（众生斗法、奇遇遭遇、守药的妖兽……），它们随机冒出来的东西
// 会把主角打中、打死（2026-11-15 抓到过：两只野生山魈的弹道打中正在升空的炼气主角，随机挂掉约一成），与要测的高度规则无关
let allowed = new Set<unknown>();
const purge = () => { if (c.enemies.some((e: unknown) => !allowed.has(e))) { c.enemies = c.enemies.filter((e: unknown) => allowed.has(e)); } };
const step = (seconds: number, each?: () => void) => { for (let t = 0; t < seconds; t += 0.05) { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 9; purge(); each?.(); g.update(0.05); } };
/** 清场：只留指定的敌人，主角满血、不带无敌 */
const arena = (...foes: InstanceType<typeof Enemy>[]) => { allowed = new Set(foes); c.enemies.length = 0; /* 上一节的修士布下的阵、阵里还没落下的那一击，也清掉 */ g.zhenfa.list = g.zhenfa.list.filter((i: { owner: string }) => i.owner !== 'e'); g.zhenfa.fx.length = 0; c.projs.length = 0; c.strikes.length = 0; c.fields.length = 0; if (c.laterQ) c.laterQ.length = 0; g.pursuit.reset(); c.enemies.push(...foes); c.lock = null; g.hero.hp = 1; c.invulnT = 0; if (c.foe?.reset) c.foe.reset(); };
const spawn = (pick: (d: any) => boolean, dx: number, realm = 2) => { const def = ENEMY_LIST.find(pick)!; assert.ok(def, '找不到合适的敌人定义'); const e = new Enemy(def, p.x + dx, p.y, realm, 0); e.aggro = true; return e; };
const hover = (z: number) => { p.flying = true; p.z = p.zTarget = z; };
// 被打中的次数（伤害可能小到马上回满，看血量看不出来）
let hits = 0; { const hit0 = c.hitPlayer.bind(c); c.hitPlayer = (...a: unknown[]) => { hits++; return hit0(...a); }; }

// 0. 纯规则
assert.equal(bandName(0), '地面'); assert.equal(bandName(ALT.hover), '低空'); assert.equal(bandName(ALT.high), '高空');
assert.ok(meleeReaches(56, 0) && !meleeReaches(300, 0) && meleeReaches(300, 260));
{ let z = 200; for (let i = 0; i < 100; i++) z = settleAltitude(z, 0.05); assert.ok(Math.abs(z - ALT.lowMax) < 1, '低空与高空之间不停留：靠下的归到低空上沿'); }
{ let z = 240; for (let i = 0; i < 100; i++) z = settleAltitude(z, 0.05); assert.ok(Math.abs(z - ALT.high) < 1, '靠上的归到高空'); }

// 1. 升降：起飞悬停在低空；按住上升进高空、到顶为止；按住下降回到低空；落地归零
g.teleport(p.x - 5000, p.y + 3000); arena();
assert.equal(p.z, 0);
g.toggleFly(); step(1.5);
assert.ok(p.flying && Math.abs(p.z - ALT.hover) < 2, `起飞后悬停在 ${ALT.hover}：${p.z}`);
assert.ok(Math.abs(p.st.lift - p.z) < 0.01, '画面抬升跟着高度走');
g.input.keys.add('ascend'); step(1.3); g.input.keys.delete('ascend'); step(2.5);
assert.ok(Math.abs(p.z - ALT.high) < 3, `松手后吸到高空：${p.z}`);
g.input.keys.add('ascend'); step(3); g.input.keys.delete('ascend'); step(0.5);
assert.ok(Math.abs(p.z - ALT.max) < 2, `到顶：${p.z}`);
g.input.keys.add('descend'); step(4); g.input.keys.delete('descend'); step(0.5);
assert.ok(Math.abs(p.z - ALT.lowMin) < 2 && p.flying, `降到低空下沿、仍在飞：${p.z}`);
g.toggleFly(); step(1.2);
assert.ok(!p.flying && p.z === 0 && p.st.lift === 0, '落地归零');
// 炼气上不了高空
g.hero.realm = 1; g.toggleFly(); g.input.keys.add('ascend'); step(4); g.input.keys.delete('ascend'); step(0.5);
assert.ok(Math.abs(p.z - ALT.maxLow) < 2, `炼气只到低空上沿：${p.z}`);
g.toggleFly(); step(1); g.hero.realm = 3;

// 2. 近战：走兽够不着高空的你；你降到低空它就打得着
{
  const wolf = spawn((d) => !d.flying && d.kind !== 'human' && d.melee && !d.ranged, 36, 3);
  arena(wolf); hover(ALT.high);
  step(6, () => { wolf.x = p.x + 36; wolf.y = p.y; p.z = p.zTarget = ALT.high; c.lock = null; });
  assert.equal(hits, 0, '高空：走兽的扑咬够不着');
  assert.equal(wolf.flyH, 0, '走兽不会飞');
  step(6, () => { wolf.x = p.x + 36; wolf.y = p.y; p.z = p.zTarget = ALT.lowMin; c.lock = null; });
  assert.ok(hits > 0, '低空：被咬到了');
}

// 3. 会飞的追上来：筑基修士跟着你升到高空；禽类也是
{
  const xiu = spawn((d) => d.kind === 'human' && !d.flying, 400, 2), bird = spawn((d) => !!d.flying && d.kind !== 'human', -400, 2);
  assert.ok(xiu.canFly && bird.canFly);
  arena(xiu, bird); hover(ALT.high);
  // 禽类会俯冲下去再拉起来，收尾那一刻可能正在低处：取这段时间里到过的最高点（全量里偶发过一次 165）
  // 修士同理：会近战的修士会俯冲下来打一下再升回去，收尾那一刻也可能在低处（全量里偶发过一次 109）
  let birdTop = 0, xiuTop = 0;
  step(4, () => { p.z = p.zTarget = ALT.high; c.lock = null; g.hero.hp = 1; birdTop = Math.max(birdTop, bird.z); xiuTop = Math.max(xiuTop, xiu.z); });
  assert.ok(xiuTop > ALT.high - 80, `修士跟上来了：${xiuTop}`);
  assert.ok(Math.max(birdTop, bird.z) > ALT.high - 80, `禽类跟上来了：${birdTop}`);
  const lq = spawn((d) => d.kind === 'human' && !d.flying, 300, 1);
  assert.ok(!lq.canFly, '炼气修士不会飞');
}

// 4. 锁定自动对齐：锁住高处的敌人，你自己飞上去；按过升降键的两息半之内不被抢回
{
  const xiu = spawn((d) => d.kind === 'human' && !d.flying, 500, 2);
  arena(xiu); hover(ALT.hover); xiu.flyH = 260;
  step(3, () => { xiu.flyH = 260; xiu.x = p.x + 500; xiu.y = p.y; c.lock = xiu; g.hero.hp = 1; });
  assert.ok(Math.abs(p.z - 260) < 12, `自动飞到目标的高度：${p.z}`);
  g.input.keys.add('descend'); step(0.6, () => { xiu.flyH = 260; c.lock = xiu; }); g.input.keys.delete('descend');
  const held = p.zTarget; step(1, () => { xiu.flyH = 260; c.lock = xiu; });
  assert.ok(p.zTarget <= held + 1, '自己按过键，暂时不自动对齐');
}

// 5. 弹道：朝目标的高度飞；出手后你改了高度就躲开了
const shot = (fac: 'p' | 'e', x: number, z: number, vx: number, extra: object = {}) => ({ fac, visual: { groundOffsetY: 46, elevation: z }, x, y: p.y - 46, vx, vy: 0, life: 0, max: 3, fx: 'sword', color: '255,255,255', dmg: 50, realm: 2, stCh: 0, pierce: false, homing: false, hit: new Set<number>(), r: 20, aoe: 0, size: 1, trail: [], lv: 0, ...extra });
{
  arena(); hover(ALT.high); hits = 0;
  c.projs.push(shot('e', p.x - 600, 0, 900));               // 从地面打上来：出手时你在高空 → 朝高空飞
  step(1.2, () => { p.z = p.zTarget = ALT.high; });
  assert.equal(hits, 1, '朝你当时的高度飞，打中了');
  g.hero.hp = 1; c.invulnT = 0; hits = 0;
  c.projs.push(shot('e', p.x - 600, 0, 900));
  step(0.1, () => { p.z = p.zTarget = ALT.high; });
  step(1.2, () => { p.z = p.zTarget = ALT.lowMin; });       // 出手后急降
  assert.equal(hits, 0, '出手后改了高度：躲开了');
  // 你的法术：锁定了高处的敌人 → 弹道升上去打中；没锁定 → 平飞过去打不着
  const xiu = spawn((d) => d.kind === 'human' && !d.flying, 500, 2);
  arena(xiu); hover(ALT.hover);
  const pin = () => { xiu.flyH = 300; xiu.x = p.x + 500; xiu.y = p.y; xiu.aggro = false; p.z = p.zTarget = ALT.hover; g.hero.hp = 1; };
  pin(); const hp0 = xiu.hp;
  c.projs.push(shot('p', p.x + 30, ALT.hover, 900));
  step(1, () => { pin(); c.lock = null; });
  assert.equal(xiu.hp, hp0, '没锁定：法术从它脚下飞过');
  c.projs.push(shot('p', p.x + 30, ALT.hover, 900));
  c.lock = xiu; step(1, () => { pin(); c.lock = xiu; p.z = p.zTarget = ALT.hover; });
  assert.ok(xiu.hp < hp0, '锁定了：法术升上去打中');
}

// 6. 范围技：贴地的是圆柱，高空的敌人不受波及；放在它身上的是球
{
  const xiu = spawn((d) => d.kind === 'human' && !d.flying, 100, 2);
  arena(xiu); xiu.flyH = 300; const hp0 = xiu.hp, base = { realm: 3, stCh: 0 };
  c.aoe(xiu.x, xiu.y, 200, 50, base, 0);
  assert.equal(xiu.hp, hp0, '贴地的范围技从高空的敌人脚下过去');
  c.aoe(xiu.x, xiu.y, 200, 50, base, 300);
  assert.ok(xiu.hp < hp0, '放在它那个高度的范围技打中');
  const hp1 = xiu.hp; xiu.flyH = 60;
  c.aoe(xiu.x, xiu.y, 200, 50, base, 0);
  assert.ok(xiu.hp < hp1, '低空的敌人在圆柱之内');
}
// ---------------- P6 遗留（E2 第二轮补的）
// 7. 召唤物：贴地的傀儡够不着高空的敌人；会飞的心魔跟着目标的高度飞上去打得着
{
  const xiu = spawn((d) => d.kind === 'human' && !d.flying, 60, 2);
  arena(xiu); hover(ALT.high);
  const pin = () => { xiu.flyH = ALT.high; xiu.x = p.x + 60; xiu.y = p.y; xiu.aggro = false; p.z = p.zTarget = ALT.high; g.hero.hp = 1; };
  pin(); const hp0 = xiu.hp;
  c.summons.push({ kind: 'puppet', x: p.x + 40, y: p.y, t: 20, dmg: 500, cd: 0, target: xiu, phase: 0, facing: 1, n: 1, lv: 0, age: 9, atk: 0 });
  step(2, pin);
  assert.equal(xiu.hp, hp0, '贴地的傀儡够不着高空的敌人');
  assert.ok((c.summons[0].z ?? 0) < 5, `傀儡留在地上：${c.summons[0].z}`);
  c.summons.length = 0;
  c.summons.push({ kind: 'demon', x: p.x + 40, y: p.y, t: 20, dmg: 500, cd: 0, target: xiu, phase: 0, facing: 1, n: 1, lv: 0, age: 9, atk: 0 });
  step(3, pin);
  assert.ok((c.summons[0]?.z ?? 0) > ALT.high - 60, `心魔飞到目标的高度：${Math.round(c.summons[0]?.z ?? 0)}`);
  assert.ok(xiu.hp < hp0, '会飞的心魔打得着高空的敌人');
  c.summons.length = 0;
}
// 8. 灵宠：会飞的云翅鸟跟着你的高度走（有延迟）；走兽灵宠留在地上，近身扑咬够不着高空的目标
{
  arena(); hover(ALT.high);
  const ws = g.ws as any; ws.pets = [{ kind: 'yunchi', name: '小云', lv: 3, xp: 0, bond: 60, born: 0 }]; ws.petActive = 0;
  step(0.3, () => { p.z = p.zTarget = ALT.high; });
  const ent = (g.pets as any).ent;
  assert.ok(ent, '灵宠跟随实体');
  const z1 = ent.z; step(3, () => { p.z = p.zTarget = ALT.high; });
  assert.ok(z1 < ALT.high - 30 && ent.z > ALT.high - 40, `云翅鸟跟着你的高度上来（有延迟）：${Math.round(z1)} → ${Math.round(ent.z)}`);
  ws.pets = [{ kind: 'wolf', name: '小灰', lv: 3, xp: 0, bond: 60, born: 0 }]; ws.petActive = 0; (g.pets as any).ent = null;
  step(2, () => { p.z = p.zTarget = ALT.high; });
  assert.ok(((g.pets as any).ent?.z ?? 0) < 5, `走兽灵宠留在地上：${(g.pets as any).ent?.z}`);
  ws.pets = []; (g.pets as any).ent = null;
}
// 9. 法器：追着锁定的目标打（飞到它的高度），掠过时打不中高度差得远的旁人
{
  const { Act } = await import('../src/world/artacts');
  const lo = spawn((d) => d.kind === 'human' && !d.flying, 200, 2), hi = spawn((d) => d.kind === 'human' && !d.flying, 210, 2);
  arena(lo, hi); hover(ALT.hover); lo.flyH = 0; hi.flyH = ALT.max;
  class T extends Act { update() { /* 测试用 */ } }
  const act = new T(c, { target: lo, src: { realm: 3, stCh: 0 }, dmg: 100 } as any);
  const h0 = lo.hp, h1 = hi.hp;
  act.hit(lo, 200, p.x, p.y); act.hit(hi, 200, p.x, p.y);
  assert.ok(lo.hp < h0, '法器打得中它追的目标');
  assert.equal(hi.hp, h1, '高空的旁人（离你、离目标都远）打不中');
  assert.ok(!act.near(hi.x, hi.y, 200).includes(hi), '法器的范围也不算高度够不着的');
}
// 10. 阵法：贴地的圆柱——阵里低处的敌人挨打，高空的从阵顶上过去
{
  const lo = spawn((d) => d.kind === 'human' && !d.flying, 100, 2), hi = spawn((d) => d.kind === 'human' && !d.flying, 120, 2);
  arena(lo, hi); hi.flyH = ALT.high;
  const Z = g.zhenfa as any;
  const inst = { id: 'kun', def: { id: 'kun' }, x: p.x + 110, y: p.y, r: 300, owner: 'p', dead: false } as any;
  const inZ = (e: any) => Z.foesIn({ ...inst, map: undefined }).includes(e);
  Z.inside = (_i: any, x: number, y: number) => Math.hypot(x - inst.x, y - inst.y) < inst.r;
  assert.ok(inZ(lo) && !inZ(hi), '阵法只罩得住圆柱里的（高空的不算）');
  delete Z.inside;
}
// 11. 化形：法相在你的高度上，够不着高度差得远的敌人
{
  const lo = spawn((d) => d.kind === 'human' && !d.flying, 100, 2), hi = spawn((d) => d.kind === 'human' && !d.flying, 110, 2);
  arena(lo, hi); hover(ALT.hover); hi.flyH = ALT.max;
  const { HuaxingAct } = await import('../src/world/huaxing');
  const list = (HuaxingAct.prototype as any).foes.call({ c }, p.x + 100, p.y, 160);
  assert.ok(list.includes(lo) && !list.includes(hi), '化形打的是个球：高空的够不着');
}
// 12. 空中招式的预警圈画在它落下的那个高度（不再贴在地上）
{
  const { hzLift } = await import('../src/gl/foegl');
  assert.equal(hzLift({ z: 0 } as any), 0, '贴地的招式：预警圈在地上');
  assert.equal(hzLift({ z: ALT.high } as any), ALT.high, '空中的招式：预警圈画在那个高度');
}
console.log('PASS P6 遗留：召唤物 / 灵宠的真实高度、法器命中按高度、阵法是贴地的圆柱、化形是个球');
console.log(`PASS 真实高度与空战：升降与高度带（悬停 ${ALT.hover}、高空 ${ALT.high}、上限 ${ALT.max}，炼气只到 ${ALT.maxLow}）、锁定自动对齐、走兽够不着高空、会飞的追上来、弹道朝目标高度飞且可靠升降躲开、范围技的圆柱与球`);
