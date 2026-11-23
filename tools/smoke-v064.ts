// v0.64 冒烟：境界门槛 / 追杀与拦路者的境界上限 / 不屑对小辈出手 / 遣门下代劳 / 新招式实跑（不抛异常、不出 NaN）
// 运行：npx tsx tools/smoke-v064.ts
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { ENEMIES } = await import('../src/data/enemies') as any;
const { Enemy, realmDealK, realmTakeK } = await import('../src/world/combat') as any;
const { threatRealm, foeRealm } = await import('../src/world/demog');
const { SCHOOLS, schoolKit } = await import('../src/world/schools') as any;
const { XKITS, X_ELEM, X_MISC } = await import('../src/world/schools3');
const { supSlow } = await import('../src/world/suppress');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world') as any;

let fails = 0;
const check = (n: string, ok: boolean, x = '') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); if (!ok) fails++; };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
const l = LOCATIONS.find((q: any) => q.id === 'qixuan')!;
const c = g.combat, p = g.player, h = g.hero;
let X0 = l.x * WORLD_SCALE + 1400, Y0 = l.y * WORLD_SCALE + 900;
for (const [ox, oy] of [[1400, 900], [2600, 1800], [4200, 3000], [6500, 4500]]) { X0 = l.x * WORLD_SCALE + ox; Y0 = l.y * WORLD_SCALE + oy; if (!c.safeAt(X0, Y0) && terrain.walkFactor(X0, Y0) > 0) break; }
g.teleport(X0, Y0); g.paused = false;
const reset = () => { c.enemies.length = 0; c.allies.length = 0; c.projs.length = 0; c.foe.hz.length = 0; g.pursuit.reset(); g.teleport(X0, Y0); g.concealed = false; };
const run = (sec: number, invuln = true) => { for (let i = 0; i < sec * 30; i++) { g.modal = null; h.hp = Math.max(h.hp, 1); h.dead = false; c.invulnT = invuln ? 99 : 0; g.update(1 / 30); } };
const human = (id: string, dx: number, realm: number, stage = 0) => { const e = new Enemy(ENEMIES[id], p.x + dx, p.y, realm, stage); e.hx = e.x; e.hy = e.y; c.enemies.push(e); return e; };

// ---------------------------------------------------------------- 1. 境界门槛
check('炼气打筑基 ×0.78、挨筑基 ×1.18（原 ×0.06 / ×3.2）', near(realmDealK(1, false, 1), 0.78) && near(realmTakeK(1, 1), 1.18));
check('筑基打炼气 ×1.18、挨炼气 ×0.78（原 ×1.6 / ×0.35）', near(realmDealK(-1, false, 2), 1.18) && near(realmTakeK(-1, 2), 0.78));
check('炼气打结丹：两道门槛相乘 ≈0.48；符箓取平方根；同阶 ×1', near(realmDealK(2, false, 1), 0.78 * 0.62) && near(realmDealK(1, true, 1), Math.sqrt(0.78)) && realmDealK(0, false, 3) === 1 && realmTakeK(0, 3) === 1);
check('越往上门槛越高（炼气→筑基 最矮，元婴→化神 最高）', realmDealK(1, false, 1) > realmDealK(1, false, 2) && realmDealK(1, false, 2) > realmDealK(1, false, 3) && realmDealK(1, false, 3) > realmDealK(1, false, 4) && realmTakeK(1, 1) < realmTakeK(1, 4));
h.realm = 1; h.stage = 9; reset();
{ const foe = human('zhujixiu', 220, 2, 0), hp0 = foe.hp; let tot = 0; for (let i = 0; i < 10; i++) { const b = foe.hp; c.hitEnemy(foe, 60, { realm: 1, stCh: 0 }, p.x, p.y); tot += b - foe.hp; }
  check('炼气十层一记 60 点的法术打在筑基初期身上：平均掉血 ≥ 25（原先只有 2～3 点）', tot / 10 >= 25, `平均 ${(tot / 10).toFixed(1)} / 对方气血 ${hp0}`); }
check('威压迟滞按被压者分档：炼气 ×0.72 … 元婴 ×0.28（原一律 ×0.28）', supSlow(1) === 0.72 && supSlow(2) === 0.5 && supSlow(4) === 0.28);

// ---------------------------------------------------------------- 2. 谁会来追你 / 拦你
const dist = (realm: number, stage: number, bias: number, n = 3000) => { h.realm = realm; h.stage = stage; const cnt = [0, 0, 0, 0, 0, 0]; for (let i = 0; i < n; i++) { const r = threatRealm(g, p.x, p.y, Math.max(1, realm), bias, Math.random, realm >= 4); if (r) cnt[r.realm]++; } return cnt; };
const a = dist(1, 2, 0.6), b = dist(1, 11, 0.6), z = dist(2, 1, 0.6);
check('追杀炼气的：最高筑基，绝无结丹 / 元婴；筑基仍然会来', a[3] + a[4] + b[3] + b[4] === 0 && b[2] > 0, `炼气三层 ${a.slice(1, 4).join('/')} · 炼气十二层 ${b.slice(1, 4).join('/')}（炼气/筑基/结丹）`);
check('炼气前期：盯上你的大多是同阶', a[2] / Math.max(1, a[1] + a[2]) < 0.35, `筑基占 ${(100 * a[2] / Math.max(1, a[1] + a[2])).toFixed(0)}%`);
check('追杀筑基的：最高结丹，绝无元婴', z[4] === 0 && z[3] > 0, `筑基/结丹/元婴 ${z.slice(2, 5).join('/')}`);
const top = (realm: number) => { h.realm = realm; h.stage = 1; let m = 0; for (let i = 0; i < 4000; i++) m = Math.max(m, foeRealm(g, p.x, p.y, i % 2 ? 'leader' : 'evil').realm); return m; };
const t0 = top(0), t1 = top(1), t2 = top(2);
check('拦路的劫修 / 魔修 / 头目至多高你一个大境界', t0 <= 1 && t1 <= 2 && t2 <= 3, `凡人遇到的最高 ${t0} · 炼气 ${t1} · 筑基 ${t2}`);
h.realm = 1; check('调用方指定下限（剧情里只许结丹以上）仍然有效', foeRealm(g, p.x, p.y, 'rogue', Math.random, 3).realm === 3);

// ---------------------------------------------------------------- 3. 不屑对小辈出手
h.realm = 1; h.stage = 5; reset();
{ const big = human('jindan_mo', 260, 3, 0); run(2);
  check('结丹魔修就在眼前，却不屑对炼气小辈出手（只冷冷一瞥）', !big.aggro && big.snubbed === true, `safe=${c.safeAt(p.x, p.y)}`);
  c.hitEnemy(big, 30, { realm: 1, stCh: 0, skill: 'smoke' }, p.x, p.y); run(1);
  check('你先动手，他便不客气了', big.aggro === true);
  reset(); const mid = human('zhujixiu', 260, 2, 0); run(2);
  check('筑基劫修照样会对炼气出手', mid.aggro === true); }

// ---------------------------------------------------------------- 4. 追杀：无名追兵 / 遣门下代劳
h.realm = 1; h.stage = 9; reset();
{ let mx = 0, n = 0; for (let i = 0; i < 25; i++) { g.pursuit.cd = 0; if (g.pursuit.start({ reason: '冒烟', gap: 1 })) { n++; mx = Math.max(mx, g.pursuit.cur.realm); } g.pursuit.reset(); }
  check('对炼气发起 25 次追杀：来人最高筑基', n > 0 && mx <= 2, `成行 ${n} 次，最高境界 ${mx}`);
  const d = g.npcs.list.find((o: any) => o.alive && o.realm >= 3 && !o.beauty && !o.stay && !o.bond);
  if (!d) check('找一位结丹以上的 NPC 当仇家', false);
  else {
    d.grudge = 2; d.why = '冒烟测试'; d.proxyFail = 0;
    check(`${d.name}（大境界 ${d.realm}）与炼气的你有仇：自重身份，不亲自来`, g.rel.disdain(d) === true && g.rel.startHunt(d, true, true) === false && !g.pursuit.active);
    let ok = true, info = '';
    for (let k = 1; k <= 2; k++) {
      g.pursuit.reset(); g.pursuit.cd = 0;
      const sent = g.rel.sendProxy(d), it = g.pursuit.pending?.init;
      g.pursuit.pending = null; g.pursuit.cd = 0;
      const st = !!it && g.pursuit.start(it), P = g.pursuit.cur;
      ok = ok && sent && st && P.realm <= 2 && P.proxyOf === d.id; info += `第${k}回 ${P ? P.faction.name + '·大境界' + P.realm : '未成行'}；`;
      if (P) g.pursuit.end('escaped');
      ok = ok && d.proxyFail === k;
    }
    check('遣门下 / 雇人代劳两回，来人都不超过筑基，失手记在他头上', ok, info);
    check('接连两次失手——迫不得已，这才亲自出手', g.rel.disdain(d) === false && d.proxyFail === 2);
  }
  g.pursuit.reset(); }

// ---------------------------------------------------------------- 5. 招式表
const all: any[] = [...Object.values(XKITS).flat(), ...Object.values(X_ELEM).flat(), ...X_MISC].map((e: any) => e[1]);
const bad = Object.keys(XKITS).filter((k) => !SCHOOLS[k]);
check('新招式表里的门派 id 全都对得上', bad.length === 0, bad.join(','));
const mk = (school: string, realm: number) => { const e = new Enemy(ENEMIES[realm >= 2 ? 'zhujixiu' : 'bandit'], 0, 0, realm, 0); e.school = school; return schoolKit(e, false) as any[]; };
{ let minQ = 99, minZ = 99, dup = ''; const seen = new Set<string>();
  for (const k of Object.keys(SCHOOLS)) { for (let i = 0; i < 6; i++) { const q = mk(k, 1), zz = mk(k, 2); minQ = Math.min(minQ, q.length); minZ = Math.min(minZ, zz.length); for (const kit of [q, zz]) { const ids = kit.map((s) => s.id); if (new Set(ids).size !== ids.length) dup = k; kit.forEach((s) => seen.add(s.name)); } } }
  check('各派修士：炼气至少 4 招、筑基至少 6 招，同一人身上没有重复', minQ >= 4 && minZ >= 6 && !dup, `炼气最少 ${minQ} · 筑基最少 ${minZ}${dup ? ' 重复：' + dup : ''}`);
  const sx = new Set<string>(); for (let i = 0; i < 40; i++) mk('sanxiu', 2).forEach((s) => sx.add(s.name));
  check('四十个筑基散修，手里的招式各不相同', sx.size >= 30, `共见到 ${sx.size} 种招式`);
  console.log(`     本版新添招式 ${all.length} 式（各派 ${Object.values(XKITS).flat().length} · 散修功法 ${Object.values(X_ELEM).flat().length} · 散修杂学 ${X_MISC.length}）；炼气、筑基两境的修士总共会用到 ${seen.size} 种招式`); }

// ---------------------------------------------------------------- 6. 新招式实跑
h.realm = 2; h.stage = 1; h.hp = 1;
const pickSk = (pred: (s: any) => boolean) => all.find(pred)!;
const trial = (sk: any, dx: number, sec: number, prep?: (e: any) => void) => {
  reset(); const e = human('zhujixiu', dx, 2, 1); e.aggro = true; e.kit = [sk]; e.skT = 0; e.cdRanged = 99; prep?.(e);
  const x0 = p.x, atk0 = e.atk; let cast = false, hz = 0, pj = 0, moved = 0, atkMax = atk0, hpMax = e.hp;
  for (let i = 0; i < sec * 30; i++) { h.hp = 1; h.dead = false; g.modal = null; c.invulnT = 0; e.cdRanged = 99; g.update(1 / 30); if (e.lastSk === sk.id) cast = true; hz = Math.max(hz, c.foe.hz.length); pj = Math.max(pj, c.projs.length); moved = Math.max(moved, Math.abs(p.x - x0)); atkMax = Math.max(atkMax, e.atk); hpMax = Math.max(hpMax, e.hp); }
  return { e, cast, hz, pj, moved, atk0, atkMax, hpMax, fin: [p.x, p.y, e.x, e.y, e.hp, e.atk, h.hp].every(Number.isFinite) };
};
try {
  const r1 = trial(pickSk((s) => s.k === 'lines'), 320, 4); check('lines 数道光柱齐发', r1.cast && r1.hz >= 3 && r1.fin, `同屏预警 ${r1.hz}`);
  const r2 = trial(pickSk((s) => s.k === 'march'), 320, 4); check('march 一路炸过去', r2.cast && r2.hz >= 5 && r2.fin, `同屏预警 ${r2.hz}`);
  const r3 = trial(pickSk((s) => s.k === 'track'), 320, 5); check('track 连环追击', r3.cast && r3.hz >= 2 && r3.fin, `同屏预警 ${r3.hz}`);
  const r4 = trial(pickSk((s) => s.k === 'spiral'), 320, 4); check('spiral 旋转弹幕', r4.cast && r4.pj >= 9 && r4.fin, `同屏弹幕 ${r4.pj}`);
  const fs = pickSk((s) => s.k === 'fury' && !s.once), r5 = trial(fs, 320, fs.dur + 4, (e) => { e.hp = e.maxHp * 0.5; });
  check('fury 燃血：出手更重，到点散功（攻击复原）', r5.cast && near(r5.atkMax, r5.atk0 * fs.pow) && Math.abs(r5.e.atk - r5.atk0) < 1e-6 && r5.fin, `攻击 ${r5.atk0.toFixed(1)} → ${r5.atkMax.toFixed(1)} → ${r5.e.atk.toFixed(1)}`);
  const r6 = trial(pickSk((s) => s.leech && s.k === 'cone'), 150, 4, (e) => { e.hp = e.maxHp * 0.5; }); check('leech 吸取：命中后回补自身', r6.cast && r6.hpMax > r6.e.maxHp * 0.5 + 1 && r6.fin, `气血 ${(r6.e.maxHp * 0.5).toFixed(0)} → ${r6.hpMax.toFixed(0)}`);
  const r7 = trial(pickSk((s) => s.pull > 0 && s.k === 'beam'), 400, 4); check('pull 摄引：把你拖向他', r7.cast && r7.moved > 60 && r7.fin, `被拖动 ${r7.moved.toFixed(0)}`);
  const r8 = trial(pickSk((s) => s.pull < 0), 150, 4); check('pull<0 震退：把你推开', r8.cast && r8.moved > 60 && r8.fin, `被推开 ${r8.moved.toFixed(0)}`);
  // 混战：十个不同门派的筑基修士一起上，跑 15 秒
  reset(); const ks = Object.keys(SCHOOLS).sort(() => Math.random() - 0.5).slice(0, 10), used = new Set<string>(), es: any[] = [];
  ks.forEach((k, i) => { const e = human(i % 2 ? 'zhujixiu' : 'moxiu', 0, 2, i % 3); e.x = p.x + Math.cos(i * 0.63) * 380; e.y = p.y + Math.sin(i * 0.63) * 300; e.hx = e.x; e.hy = e.y; e.school = k; e.aggro = true; es.push(e); });
  for (let i = 0; i < 15 * 30; i++) { h.hp = 1; h.dead = false; g.modal = null; c.invulnT = 0; for (const e of es) { e.hp = Math.max(e.hp, e.maxHp * 0.4); if (e.lastSk) used.add(e.lastSk); } g.update(1 / 30); }
  check('十派修士围攻 15 秒：不抛异常、坐标与数值有限', [p.x, p.y, h.hp, ...es.flatMap((e) => [e.x, e.y, e.hp, e.atk])].every(Number.isFinite), `期间用了 ${used.size} 种招式，其中新招 ${[...used].filter((s) => s.startsWith('x_')).length} 种`);
} catch (err: any) { check('新招式实跑不抛异常', false, String(err?.stack ?? err).split('\n').slice(0, 4).join(' | ')); }

console.log(fails ? `\n${fails} 项未过` : '\n全部通过');
process.exit(fails ? 1 : 0);
