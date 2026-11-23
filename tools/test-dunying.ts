// 「遁影惊雷」回归：npx tsx tools/test-dunying.ts
// 覆盖：十二门新法术与卷轴 / 十七件新法器 · 寸阴凝世（敌人与敌方法术定住）· 万劫不磨 · 逆命回光 · 一线开天 · 搏命秘术的增益与代价
//       · 沧浪遁 / 覆海游（入水、气尽回岸）· 音爆分档 · 敌修秘术 · 逆天机缘四条悟法 · 特效绘制不报错
import { createCanvas } from './env';
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { ARTS } = await import('../src/data/arts');
const { NI_ARTS, MI_ARTS } = await import('../src/data/arts3');
const { itemDef } = await import('../src/data/items');
const { canonOwned } = await import('../src/data/market');
const { ART_LOOK } = await import('../src/data/artlooks');
const { WORLD_W, WORLD_H } = await import('../src/data/world');
const { boomTier } = await import('../src/world/nitian');
const { FxSys } = await import('../src/gl/fx');
const { drawNitianGL } = await import('../src/gl/nitiangl');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

let fails = 0;
const ok = (cond: any, msg: string) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const h = g.hero, p = g.player, c = g.combat, ni = c.ni, T = g.terrain;
const F = new FxSys(new Proxy({}, { get: () => () => {} }) as any);
const draw = () => drawNitianGL(F, c, (g as any).time, 1 / 30);
const step = (sec: number, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) { (g as any).time += dt; c.update(dt); } };
const full = () => { h.hp = 1; h.mp = 1; h.dead = false; };
const mk = (dx: number, realm = 2, stage = 1, def: any = ENEMIES.zhujixiu) => { const e = new Enemy(def, p.x + dx, p.y, realm, stage); e.aggro = true; c.enemies.push(e); return e; };
const clear = () => { c.enemies.length = 0; c.projs.length = 0; ni.reset(); (c as any).cds.clear(); c.dash = null; full(); };

// ---------- 数据
h.realm = 2; h.stage = 1; full();
for (const id of [...NI_ARTS, ...MI_ARTS]) if (!h.arts.some((a: any) => a.id === id)) h.arts.push({ id, xp: 0 });
ok([...NI_ARTS, ...MI_ARTS].every((id) => ARTS[id] && itemDef('scroll_art_' + id).scroll?.skill === id), '十二门新法术与卷轴齐全');
ok(NI_ARTS.every((id) => canonOwned('scroll_art_' + id)) && MI_ARTS.every((id) => !canonOwned('scroll_art_' + id)), '逆天四法不流通，秘术可流通');
const NEW_ART = ['art_liuying', 'art_songwen', 'art_luoxingsuo', 'art_qianyexia', 'art_chiyaohuan', 'art_hantanjian', 'art_zhenshanyin', 'art_jingxinling', 'art_fuyunsuo', 'art_xuanshefan', 'art_tuyanhulu', 'art_tengjia', 'art_yunwenyi', 'art_guiyuandun', 'art_zhuifenglv', 'art_qingyuzhou', 'art_jinghongsuo'];
ok(NEW_ART.every((id) => itemDef(id).art && ART_LOOK[id]), '十七件新法器与外观齐全');
ok(boomTier(400) === -1 && boomTier(651) === 0 && boomTier(837) === 1 && boomTier(1227) === 2 && boomTier(1702) === 3 && boomTier(2371) === 4, '音爆五档：炼气御舟 / 筑基 / 结丹 / 元婴 / 化神');

// ---------- 寸阴凝世
clear();
const e1 = mk(320); step(0.2);
c.cast('cunyin');
ok(ni.stasis, '寸阴凝世：时停生效');
c.projs.push({ fac: 'e', x: p.x + 200, y: p.y - 40, vx: -600, vy: 0, life: 0, max: 3, fx: 'blood', color: '220,40,60', dmg: 10, realm: 2, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 24, aoe: 0, size: 1, trail: [], lv: 0 } as any);
const ex = e1.x, prx = c.projs[c.projs.length - 1].x;
step(1.5); draw();
ok(e1.x === ex, '时停中敌人不动'); ok(c.projs.some((q: any) => q.fac === 'e' && q.x === prx), '时停中敌方法术定在半空');
step(3); draw();
ok(!ni.stasis, '时停结束'); ok(c.speedMul < 1, '光阴反噬：身法迟滞');
ok((c as any).cdLeft('cunyin') > 150, '寸阴凝世冷却极长');

// ---------- 万劫不磨
clear();
c.cast('wanjie'); c.hitPlayer(999999, 4, { k: 'burn', dur: 5, ch: 1 }, p.x + 20, p.y);
ok(h.hp === 1 && !c.pst.burn, '万劫不磨：伤害与异状不侵'); draw();
step(5); ok(ni.invT === 0 && c.pStats.def < g.stats.def, '金身褪去：防御下降'); draw();

// ---------- 逆命回光
clear(); h.hp = 0.2; h.mp = 0.1; (c as any).cds.set('huodan', 5); const life0 = h.lifeLost || 0;
c.cast('niming');
ok(h.hp === 1 && h.mp === 1 && (c as any).cdLeft('huodan') === 0 && Math.abs((h.lifeLost || 0) - life0 - 2) < 1e-6, '逆命回光：回满、冷却清零、折寿两载'); draw();

// ---------- 一线开天
clear(); const e2 = mk(420); c.lock = e2; const hp2 = e2.hp;
c.cast('kaitian'); draw(); ok(!!ni.kt && h.mp === 0, '一线开天：蓄势并抽空法力');
const k0: any = ni.kt && { ...ni.kt, base: 0, tg: !!ni.kt.tg }; const ev0 = e2.evadeN;
ok(!!k0 && k0.len >= 1500, '一线开天：射程取法术本来的一百五十丈（不受神识投放距离限制）');
step(1.1); draw();
if (!(e2.hp < hp2 || e2.dead)) console.log('  dbg kt', JSON.stringify(k0), 'e2', JSON.stringify({ dx: Math.round(e2.x - p.x), dy: Math.round(e2.y - p.y), hp: e2.hp, hp2, ev0, ev: e2.evadeN, hide: e2.hideT, gone: e2.gone, inList: c.enemies.includes(e2), n: c.enemies.length, safe: c.safeAt(p.x, p.y), ward: !!e2.ward, inv: ni.fs.get(e2)?.inv }));
ok(e2.hp < hp2 || e2.dead, '一线开天：线上之敌受创'); step(1); ok(!ni.kt, '一线开天收尾');

// ---------- 搏命秘术
clear(); const sm0 = c.speedMul;
c.cast('feixue'); ok(c.speedMul > sm0 * 2 && Math.abs(h.hp - 0.86) < 1e-6 && ni.booms.length > 0, '沸血惊鸿遁：遁速翻倍、耗血、音爆'); draw();
step(5.4); ok(c.speedMul < sm0, '沸血遁之后：血亏气虚');
clear(); const a0 = c.pStats.atk; c.cast('liemai'); ok(c.pStats.atk > a0 * 1.45, '裂脉诀：攻击大增'); draw(); step(8.4); ok(c.pStats.atk < a0, '裂脉诀之后：经脉受损');
clear(); const hp0 = g.stats.hp; c.cast('guyuan'); ok(g.stats.hp > hp0 * 1.35, '鼓元术：气血上限暴涨'); draw(); step(10.4); ok(g.stats.hp === hp0 && h.hp < 0.95, '鼓元术之后：本元亏空');
clear(); const d0 = c.pStats.def; c.cast('guixi'); ok(c.pStats.def > d0 * 1.8 && c.speedMul < 0.7, '玄龟闭息：防御近倍、身法迟缓'); draw();
clear(); h.mp = 0.1; c.cast('chousui'); ok(h.mp > 0.4 && h.hp < 0.85 && c.pStats.def < g.stats.def, '抽髓化元：以血换法力'); draw();
clear(); const e3 = mk(120); c.cast('pokong'); ok(!!c.dash && !!e3.st.stun, '破空一掠：掠出并震慑近敌'); draw(); step(0.4);

// ---------- 水遁
let river: [number, number] | null = null, shore: [number, number] | null = null;
for (let y = 600; y < WORLD_H - 600 && !(river && shore); y += 260) for (let x = 600; x < WORLD_W - 600; x += 260) {
  if (!river && T.isLand(x, y) && T.riverEdge(x, y) < -30) river = [x, y];
  if (!shore && T.walkFactor(x, y) > 0 && !T.isLand(x + 220, y) && !T.isLand(x + 300, y)) shore = [x, y];
  if (river && shore) break;
}
ok(!!river && !!shore, '地图上找得到江河与海岸');
if (river) {
  clear(); p.flying = false; p.x = river[0] + 150; p.y = river[1];
  c.cast('canglang'); step(0.2); draw();
  ok(!!ni.wd && ni.wd.inW && ni.waterK(p.x, p.y) > 2.4, '沧浪遁：纵身入河，河中遁速两倍半');
  step(11); ok(!ni.wd, '沧浪遁术散');
}
if (shore) {
  clear(); p.flying = false; p.x = shore[0]; p.y = shore[1];
  c.cast('fuhai'); step(0.2); draw();
  ok(!!ni.wd && !T.isLand(p.x, p.y) && ni.waterOk(p.x, p.y) && ni.waterK(p.x, p.y) > 2.2, '覆海游：纵身入海，海面可行');
  p.x += 400; step(16, 0.1); draw();
  ok(!ni.wd && T.isLand(p.x, p.y) && h.hp < 1, '覆海游气尽：被浪头卷回岸边并受内伤');
}
clear(); p.x = 3000; p.y = 3000;

// ---------- 敌修秘术
if (shore) { p.x = shore[0] - 500; p.y = shore[1]; for (let k = 0; k < 20 && (T.walkFactor(p.x, p.y) <= 0 || c.safeAt(p.x, p.y)); k++) p.x -= 200; }   // 找一处荒野
clear(); ni.invT = 999; h.realm = 1; h.stage = 6;   // 与劫修同阶（高出一个大境界他们会「见高人而退」）
const foes = [0, 1, 2, 3, 4, 5].map((i) => { const e = mk(650 + i * 40, 1, 6, ENEMIES.bandit); e.y += (i - 3) * 60; return e; });
for (let i = 0; i < 80; i++) {   // 每四分之一息把第三方（野怪、路过的修士）清出去，只留被测的六人
  step(0.25); c.enemies = c.enemies.filter((e: any) => foes.includes(e)); c.allies.length = 0;
  if (i === 32) for (const e of foes) if (!e.dead) e.hp = e.maxHp * 0.45;   // 打到半血：鼓元术 / 玄龟闭息也该出来了
}
draw(); h.realm = 2; h.stage = 1;
const used = foes.filter((e) => (ni.fs.get(e)?.used.size ?? 0) > 0).length;
if (used < 1) { console.log('  dbg safe', c.safeAt(p.x, p.y), 'walk', T.walkFactor(p.x, p.y)); for (const e of foes) { const s: any = ni.fs.get(e); console.log('  dbg', JSON.stringify({ aggro: e.aggro, flee: e.flee, fled: e.fled, dead: e.dead, gone: e.gone, hp: +(e.hp / e.maxHp).toFixed(2), d: Math.round(Math.hypot(e.x - p.x, e.y - p.y)), kit: s?.kit, cd: s && +s.cd.toFixed(1), k: s?.k, cast: !!e.cast, sup: e.sup, hide: e.hideT, st: Object.keys(e.st), cow: e.cowered })); } }
ok(foes.every((e) => e.dead || !!ni.fs.get(e)) && used >= 1, `敌修会用秘术（${used}/6 人用过）`);
ni.invT = 0;

// ---------- 逆天机缘
clear(); h.arts = h.arts.filter((a: any) => !NI_ARTS.includes(a.id)); (h as any).nt = undefined;
const sit = (sec: number) => { for (let t = 0; t < sec; t += 0.25) { p.sitting = true; c.enemies.length = 0; step(0.25, 0.25); } };   // 测试里不让野怪搅了静坐
if (river) { p.x = river[0] + 120; p.y = river[1]; sit(80); draw(); if (!h.arts.some((a: any) => a.id === 'cunyin')) console.log('  dbg', JSON.stringify((h as any).nt), p.sitting, h.dead, (ni as any).byRiver(p.x, p.y)); ok(h.arts.some((a: any) => a.id === 'cunyin'), '机缘：水畔静坐悟得寸阴凝世诀'); }
(g.weather as any).kind = 'storm'; sit(50); ok(h.arts.some((a: any) => a.id === 'kaitian'), '机缘：雷雨静坐悟得一线开天');
p.sitting = false; (g.weather as any).kind = 'clear';
clear(); h.hp = 0.1; for (let i = 0; i < 3; i++) (c as any).kill(mk(100));
ok(h.arts.some((a: any) => a.id === 'wanjie'), '机缘：三次濒死反杀悟得万劫不磨体');
clear(); h.realm = 1; h.stage = 4; for (let i = 0; i < 3; i++) (c as any).kill(mk(100, 2, 0));
ok(h.arts.some((a: any) => a.id === 'niming'), '机缘：三次越阶斩敌悟得逆命回光术');
ok(ni.hints().every((x: any) => x.got), '法术书「逆天机缘」四项皆已悟');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
