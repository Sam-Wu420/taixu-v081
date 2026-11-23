// v0.53 验收：本命神通（化形授予 / 观兽悟形 / 七形出手）、元婴出窍、阵法禁制（布阵 / 收阵 / 破阵 / 敌阵 / 破禁之局 / 洞府禁制 / 存档往返）
// 用法：npx tsx tools/test-v053.ts
import './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__TAIXU_NORELOAD = true;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { ENEMIES } = await import('../src/data/enemies') as any;
const { Enemy } = await import('../src/world/combat');
const { HuaxingAct } = await import('../src/world/huaxing');
const { INS_NEED } = await import('../src/world/shentong');
const { ZHEN, ZHEN_BY_ID, wxNext } = await import('../src/data/zhenfa');
const { itemDef } = await import('../src/data/items');
const C = await import('../src/world/cultivation');

let fails = 0, n = 0;
const ok = (c: any, msg: string) => { n++; if (!c) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
g.reset();
const l = LOCATIONS.find((q) => q.id === 'qixuan')!;
{ let x = l.x * WORLD_SCALE + 900, y = l.y * WORLD_SCALE + 600;
  for (let r = 0; r < 20000 && (terrain.inLocZone(x, y, 1800) || terrain.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
  g.teleport(x, y); }
(g as any).paused = false; g.modal = null;
const tick = (sec: number, keep = true) => { for (let i = 0; i < sec * 30; i++) { if (keep) { g.hero.hp = Math.max(g.hero.hp, 0.5); } g.modal = null; g.update(1 / 30); } };
const spawn = (id: string, k: number, dx = 300, hp = 1e6) => { const out: any[] = []; for (let i = 0; i < k; i++) { const e = new Enemy(ENEMIES[id], g.player.x + dx + (i % 3) * 50, g.player.y + (i - 1) * 40, g.hero.realm, 1); e.aggro = true; e.maxHp = e.hp = hp; g.combat.enemies.push(e); out.push(e); } return out; };

console.log('一、本命神通的授予');
g.hero.realm = 2; g.hero.stage = 2; tick(1.2);
ok(!g.hero.arts.some((a) => a.id === 'hx_long'), '筑基期不会化形');
g.hero.realm = 3; g.hero.stage = 0; tick(1.2);
ok(g.hero.arts.some((a) => a.id === 'hx_long'), '结丹即悟「化形·青龙」');
ok(!g.hero.arts.some((a) => a.id === 'yuanying'), '结丹不会元婴出窍');
ok(!itemDef('scroll_art_hx_long').name.startsWith('《'), '神通没有卷轴（不进坊市 / 掉落）');

console.log('二、观兽悟形');
const tiger = new Enemy(ENEMIES.jinhu ?? ENEMIES.firetiger, g.player.x, g.player.y, 3, 1);
for (let i = 0; i < 12 && !g.hero.arts.some((a) => a.id === 'hx_hu'); i++) { g.shentong.onKill(tiger); tick(1.1); }
ok(g.hero.arts.some((a) => a.id === 'hx_hu'), `斩虎豹悟出「白虎」（每只 ${(1 + 3 * 1.5)} 点，需 ${INS_NEED}）`);
const pr = g.shentong.progress();
ok(pr.length === 7 && pr.find((f) => f.id === 'long')!.have, '七形进度表齐全');
const bear = new Enemy(ENEMIES.heixiong, 0, 0, 3, 1);
const before = g.hero.hx!.ins.yuan ?? 0; g.shentong.onKill(bear);
ok((g.hero.hx!.ins.yuan ?? 0) > before, '黑熊精计入魔猿');

console.log('三、七形出手');
for (const id of ['hx_long', 'hx_feng', 'hx_hu', 'hx_gui', 'hx_peng', 'hx_qilin', 'hx_yuan']) {
  g.combat.enemies = []; g.combat.acts.list = [];
  const es = spawn('boar', 4, 320);
  if (!g.hero.arts.some((a) => a.id === id)) g.hero.arts.push({ id, xp: 0 });
  (g.combat as any).cds.clear(); g.hero.mp = 1; g.combat.pst = {}; g.combat.invulnT = 99;
  g.combat.cast(id);
  const act = g.combat.acts.list.find((a) => a instanceof HuaxingAct) as any;
  let maxT = 0;
  for (let i = 0; i < 30 * 6; i++) { g.hero.hp = 1; g.hero.mp = Math.max(g.hero.mp, 0.5); g.update(1 / 30); maxT = i; if (!g.combat.acts.list.includes(act) && id !== 'hx_gui') break; }
  const dealt = es.reduce((s, e) => s + (e.maxHp - e.hp), 0);
  ok(act && (dealt > 0 || id === 'hx_gui'), `${id}：出手 ${act ? '✓' : '✗'}，造成伤害 ${Math.round(dealt)}，${(maxT / 30).toFixed(1)}s 内收势`);
}
// 玄武替你挨打
// v0.63 的灵力护盾在脱战时自动补满，会把这两记都吃掉（基准一记也掉 0 血，比不出玄武的用）。
// 这里先把它按下去，只测玄武化形的护身。
const ld = g.combat.lingdun, ldUp = ld.update.bind(ld); ld.hp = []; ld.update = () => {};
g.combat.acts.list = []; g.combat.enemies = []; (g.combat as any).cds.clear(); g.hero.mp = 1; g.combat.shield = null; g.combat.pst = {}; g.combat.invulnT = 0;
g.combat.cast('hx_gui'); tick(0.5);
const hp0 = g.hero.hp; g.combat.hitPlayer(g.combat.pStats.hp * 0.3, g.hero.realm, undefined, g.player.x + 10, g.player.y);
const lostWith = hp0 - g.hero.hp;
g.combat.acts.list = []; g.hero.hp = 1; g.combat.invulnT = 0;
const hp1 = g.hero.hp; g.combat.hitPlayer(g.combat.pStats.hp * 0.3, g.hero.realm, undefined, g.player.x + 10, g.player.y);
ok(lostWith < (hp1 - g.hero.hp) * 0.5, `玄武护身：受伤 ${(lostWith * 100).toFixed(1)}% vs 无玄武 ${((hp1 - g.hero.hp) * 100).toFixed(1)}%`);
ld.update = ldUp;

console.log('四、元婴出窍');
g.hero.realm = 4; g.hero.stage = 0; g.hero.hp = 1; g.hero.mp = 1; tick(1.2);
ok(g.hero.arts.some((a) => a.id === 'yuanying') && g.hero.arts.some((a) => a.id === 'yingshun'), '结婴即得「元婴出窍」「元婴瞬移」');
g.combat.enemies = []; g.combat.acts.list = [];
const near = spawn('boar', 3, 200);
const p = g.player, x0 = p.x, y0 = p.y;
(g.combat as any).cds.clear(); g.hero.mp = 1; g.combat.cast('yuanying');
ok(g.yuanying.active && g.yuanying.body!.x === x0, '出窍：肉身留在原地');
ok(near.some((e) => e.hp < e.maxHp), '出窍一刹神识冲击打中近敌');
const atkOut = g.combat.pStats.atk;
ok(g.speed > 0 && g.isFlying, '元婴凌空');
p.x += 5000; tick(0.2);
ok(Math.hypot(p.x - x0, p.y - y0) <= g.yuanying.leash + 1, '元婴走不出神识（被牵回）');
// 元婴照样能化形，且从元婴身上起手
g.combat.acts.list = []; (g.combat as any).cds.clear(); g.hero.mp = 1; g.combat.cast('hx_long');
const yAct = g.combat.acts.list.find((a) => a instanceof HuaxingAct) as any;
ok(yAct && Math.hypot(yAct.sx - p.x, yAct.sy - p.y) < 5 && yAct.ying, '元婴之身照样化形（起手在元婴、元婴加成）');
// 敌人打肉身：护光吸收，打碎后震回
const sh0 = g.yuanying.body!.shield;
g.yuanying.hitBody(g.combat.pStats.hp * 0.1, g.hero.realm);
ok(g.yuanying.body!.shield < sh0, '护光吸收肉身所受之伤');
g.yuanying.hitBody(g.combat.pStats.hp * 2, g.hero.realm);
ok(!g.yuanying.active && Math.hypot(p.x - x0, p.y - y0) < 1, '护光碎裂：元婴被震回肉身');
ok(g.combat.pst.stun && g.combat.pst.stun.t > 0, '震回后神魂眩晕');
g.combat.pst = {};
(g.combat as any).cds.clear(); g.hero.mp = 1; g.combat.cast('yuanying');
const atk1 = g.combat.pStats.atk;
g.combat.cast('yuanying');
ok(!g.yuanying.active && atk1 > g.combat.pStats.atk * 1.2, `再按归窍；出窍时攻击 ×${(atk1 / g.combat.pStats.atk).toFixed(2)}`);
void atkOut;
// 存档时元婴在外：存的是肉身位置
(g.combat as any).cds.clear(); g.hero.mp = 1; g.combat.cast('yuanying'); p.x += 300; g.save(1);
const sv = JSON.parse(store.get('taixu_save_1')!);
ok(Math.abs(sv.p.x - g.yuanying.body!.x) < 1, '出窍时存档：记的是肉身所在');
g.yuanying.back('manual');

console.log('五、阵法：布阵 / 效果 / 收阵');
g.hero.realm = 3; g.hero.stage = 0; tick(0.2);
ok(C.bagCount(g.hero, 'zf_pan1') >= 1 && C.bagCount(g.hero, 'zf_qi') >= 12, '入门阵具已配发（木阵盘 + 阵旗）');
C.addItem(g.hero, 'mat_lingshi', 99999); C.addItem(g.hero, 'zf_qi', 80); C.addItem(g.hero, 'zf_pan3', 1);
g.hero.zd = { xp: 400, known: ZHEN.map((z) => z.id) };
ok(g.zhenfa.lv >= 4 && g.zhenfa.maxActive() >= 2, `阵道「登堂入室」、玉阵盘可同时主持 ${g.zhenfa.maxActive()} 座`);
g.combat.enemies = [];
const trapped = spawn('boar', 3, 60);
const qi0 = C.bagCount(g.hero, 'zf_qi');
ok(g.zhenfa.deploy('kun'), '布下困阵');
ok(C.bagCount(g.hero, 'zf_qi') === qi0 - 4, '消耗四面阵旗');
const kun = g.zhenfa.list[0];
trapped[0].x = kun.x + kun.r * 3; tick(0.3);
ok(g.zhenfa.inside(kun, trapped[0].x, trapped[0].y, 5), '困阵：阵中之敌走不出阵界');
let rooted = false; for (let k = 0; k < 120; k++) { tick(1 / 30); if (trapped.some((e) => e.st.root)) rooted = true; }
ok(rooted, '困阵：定身');
ok(g.zhenfa.deploy('gengjin'), '再布庚金剑阵（第二座）');
const hpB = trapped.map((e) => e.hp);
tick(4);
ok(trapped.some((e, i) => e.hp < hpB[i]), '庚金剑阵：剑雨伤敌');
ok(!g.zhenfa.deploy('wulei'), '超过阵盘可主持数时布不成');
g.zhenfa.dismiss(g.zhenfa.list[1]);
tick(0.1);
ok(C.bagCount(g.hero, 'zf_qi') === qi0 - 4, '收阵：阵旗尽数收回');
// 阵眼被轰
kun.eye.hp = 0.01; trapped.forEach((e) => { e.def = { ...e.def, kind: 'human' }; });
for (let k = 0; k < 30; k++) { trapped.forEach((e) => { e.aggro = true; }); tick(1 / 30 * 2); }
ok(!g.zhenfa.list.includes(kun), '困在阵中的修士轰碎阵眼：阵破');
// 颠倒五行易伤 / 玄武减伤
g.combat.enemies = []; const w = spawn('boar', 1, 40);
g.zhenfa.deploy('wuxing'); tick(0.1);
ok(g.zhenfa.vuln(w[0]) > 1.3, '颠倒五行：阵中之敌易伤');
g.zhenfa.list.forEach((i) => g.zhenfa.dismiss(i, true)); tick(0.1);
g.zhenfa.deploy('xuanwu'); tick(0.1);
ok(g.zhenfa.takeMul(g.player.x, g.player.y) < 0.7, '玄武护阵：阵中减伤');
g.zhenfa.list.forEach((i) => g.zhenfa.dismiss(i, true)); tick(0.1);
g.zhenfa.deploy('juling'); tick(0.1);
ok(g.placeBonus().mult > 1.3, `聚灵阵：打坐倍率 ×${g.placeBonus().mult.toFixed(2)}`);

console.log('六、存档往返（阵法 / 阵道 / 悟形）');
g.save(2);
const g2 = new Game(terrain);
ok(g2.load('taixu_save_2'), '读档');
for (let i = 0; i < 3; i++) g2.update(1 / 30);
ok(g2.zhenfa.list.some((i) => i.id === 'juling'), '聚灵阵随存档还在');
ok(g2.zhenfa.lv === g.zhenfa.lv && g2.hero.arts.some((a) => a.id === 'hx_hu'), '阵道与化形都在');

console.log('七、敌阵');
g.zhenfa.list.forEach((i) => g.zhenfa.dismiss(i, true)); tick(0.1);
g.combat.enemies = []; g.hero.zd!.xp = 0;
const mo = new Enemy(ENEMIES.jindan_mo ?? ENEMIES.moxiu, g.player.x + 300, g.player.y, 3, 1); mo.aggro = true; mo.maxHp = mo.hp = 1e7; g.combat.enemies.push(mo);
(g.zhenfa as any).enemyCd = 0;
for (let k = 0; k < 80 && !g.zhenfa.list.some((i) => i.owner === 'e'); k++) { mo.aggro = true; (g.zhenfa as any).enemyCd = 0; tick(0.1); }
const foe = g.zhenfa.list.find((i) => i.owner === 'e');
ok(!!foe, '魔修布阵困你');
if (foe) {
  g.player.x = foe.x + foe.r * 4; tick(0.2);
  // v0.54.2：困阵 / 地火阵 / 迷踪阵困得住人；庚金、五雷两座杀阵冲得出去
  if (['kun', 'dihuo', 'mizong'].includes(foe.id)) ok(g.zhenfa.inside(foe, g.player.x, g.player.y, 5), `困在敌阵（${foe.def.name}）里出不去`);
  else ok(!g.zhenfa.inside(foe, g.player.x, g.player.y, 5), `杀阵（${foe.def.name}）冲得出去`);
  g.player.x = foe.eye.x; g.player.y = foe.eye.y + 10; tick(0.1);
  ok(g.zhenfa.focus === foe, '走到阵眼旁可破（即使看不穿，贴近也能察觉）');
  g.hero.mp = 1; g.zhenfa.interact(); tick(0.1);
  ok(!g.zhenfa.list.includes(foe), '破开敌阵阵眼');
}

console.log('八、破禁之局');
let solved = 0, fails2 = 0;
for (let trial = 0; trial < 300; trial++) {
  const tier = trial % 5;
  let res: boolean | null = null;
  const P = g.zhenfa.puzzle('测', tier, (r) => { res = r; });
  // 按规则解：生门起，每步找一个未破、属该五行的节点
  let guard = 0;
  while (!P.done && guard++ < 40) {
    const k = P.step === 0 ? P.start : P.nodes.findIndex((x) => !x.broken && x.w === P.next);
    if (k < 0) break;
    g.zhenfa.pick(P, k);
  }
  if (P.ok) solved++; else fails2++;
  void res;
}
ok(solved === 300, `按五行相生必能解开（${solved}/300）`);
{
  const P = g.zhenfa.puzzle('错', 2, () => {});
  const wrong = P.nodes.findIndex((x, k) => k !== P.start && x.w !== 'trap');
  g.hero.hp = 1; g.zhenfa.pick(P, wrong);
  ok(P.mistakes === 1 && g.hero.hp < 1, '点错：反噬伤血');
  let k = 0; while (!P.done && k++ < 10) g.zhenfa.pick(P, P.nodes.findIndex((x, j) => j !== P.start && !x.broken && x.w !== P.next && x.w !== 'trap'));
  ok(P.done && !P.ok, '错满次数：破禁失败');
  const Q = g.zhenfa.puzzle('时', 1, () => {}); g.zhenfa.tickPuzzle(Q, 999);
  ok(Q.done && !Q.ok, '时辰耗尽：破禁失败');
  ok(wxNext('mu') === 'huo' && wxNext('shui') === 'mu', '相生次序：木→火…水→木');
}

console.log('九、洞府禁制');
const site = { x: g.player.x + 200, y: g.player.y, key: 'testvein', seed: 7 } as any;
(g.sites as any).veinQ = () => 1.4;
g.home.create(site);
const L = g.zhenfa.homeLayers();
L.push('mizong'); ok(g.home.arr() >= 1, '洞府布迷踪阵：防贼');
L.push('juling'); ok(g.home.extraHerb() && g.home.placeMult() > 1.6, '洞府聚灵阵：灵气 +0.3、药园多收');
L.push('kun'); ok(g.home.arr() >= 2, '两重护府阵：困贼');

console.log('十、物品与阵图');
ok(ZHEN.filter((z) => z.src !== 'start').every((z) => itemDef('zt_' + z.id).scroll?.zhen === z.id), '每座阵都有阵图');
g.hero.zd = { xp: 0, known: ['kun', 'juling'] }; C.addItem(g.hero, 'zt_xuanwu', 1);
g.hero.realm = 2;
ok(g.learnScroll('zt_xuanwu') && g.zhenfa.knows('xuanwu'), '研读阵图学会玄武护阵');
ok(ZHEN_BY_ID.kun && ZHEN.length === 11, '十一座可布之阵');

console.log(`\n${n - fails}/${n} 通过`);
process.exit(fails ? 1 : 0);
