// v0.54.2 验收：敌修与同行友人的化形 / 元婴出窍 / 布阵；敌阵种类；每座阵的精熟
// 用法：npx tsx tools/test-v0542.ts
import './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__FANREN_NORELOAD = true;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { ENEMIES } = await import('../src/data/enemies') as any;
const { Enemy } = await import('../src/world/combat');
const { HuaxingAct } = await import('../src/world/huaxing');
const { kitOf } = await import('../src/world/foeskills');
const { ZHEN_BY_ID, ZM_XP } = await import('../src/data/zhenfa');
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
const human = (realm: number, dx = 380, name?: string) => { const e = new Enemy(ENEMIES[realm >= 3 ? 'jindan_mo' : 'zhujixiu'], g.player.x + dx, g.player.y, realm, 1); if (name) e.name = name; e.aggro = true; e.maxHp = e.hp = 1e6; g.combat.enemies.push(e); return e; };
const clear = () => { g.combat.enemies = []; g.combat.acts.list = []; g.combat.foe.hz = []; g.shen.reset(); g.zhenfa.list = []; };
g.hero.realm = 3; g.hero.stage = 1;

console.log('一、敌修的神通招式');
clear();
const zj = human(2), jd = human(3, 380, '魔修甲'), yy = human(4, 380, '老魔乙');
ok(!kitOf(zj).some((s) => s.hx || s.k === 'ying'), '筑基修士不会化形');
ok(kitOf(jd).filter((s) => s.hx).length === 1 && !kitOf(jd).some((s) => s.k === 'ying'), `结丹修士一形（${kitOf(jd).filter((s) => s.hx).map((s) => s.name)}）`);
ok(kitOf(yy).filter((s) => s.hx).length === 2 && kitOf(yy).some((s) => s.k === 'ying'), `元婴修士两形 + 元婴出窍（${kitOf(yy).filter((s) => s.hx || s.k === 'ying').map((s) => s.name).join('、')}）`);
const again = new Enemy(ENEMIES.jindan_mo, 0, 0, 3, 1); again.name = '魔修甲';
ok(kitOf(again).find((s) => s.hx)?.hx === kitOf(jd).find((s) => s.hx)?.hx, '同一个人每次化的是同一形');

console.log('二、敌修化形：先亮预警，法相出手，到点落实');
for (const f of ['long', 'feng', 'hu', 'gui', 'peng', 'qilin', 'yuan']) {
  clear(); g.combat.invulnT = 0; g.combat.pst = {};
  const e = human(3, 300);
  const S = (g.combat.foe as any);
  const hp0 = g.hero.hp;
  // 用 shenKit 的模板：在 2..40 个名字里找一个修这一形的
  let skf: any = null;
  for (let k = 0; k < 400 && !skf; k++) { const t = Object.assign(new Enemy(ENEMIES.jindan_mo, 0, 0, 4, 1), { name: '试' + k }); skf = kitOf(t).find((s) => s.hx === f) ?? null; }
  e.kit = [skf]; e.skCd = {};
  S.start(e, skf, g.player.x, g.player.y);
  const sp = g.shen.spirits[0];
  ok(!!sp && sp.f.id === f, `「${skf.name}」现出${sp?.f.name ?? '?'}法相`);
  if (f !== 'gui') ok(g.combat.foe.hz.length > 0 && !g.combat.foe.hz[0].fired, '　地上先亮预警');
  for (let i = 0; i < 90; i++) { g.hero.hp = Math.min(g.hero.hp, 1); g.modal = null; g.update(1 / 30); }
  if (f === 'gui') ok(e.guardT > 0 || g.shen.spirits.length > 0, '　玄武护身：敌修护体');
  else ok(g.hero.hp < hp0 - 1e-4, `　站着不躲挨了一记（气血 ${(hp0 * 100).toFixed(0)}% → ${(g.hero.hp * 100).toFixed(0)}%）`);
  g.hero.hp = 1;
  tick(f === 'gui' ? 10 : 2);
  ok(g.shen.spirits.length === 0, '　法相化光散去');
}

console.log('三、敌修元婴出窍');
clear(); g.combat.invulnT = 99;
const old = human(4, 500, '老魔丙'); const atk0 = old.atk;
g.shen.foeOut(old);
const body = g.combat.enemies.find((e) => (e as any).shell === old)!;
ok(!!body && (old as any).ying, '出窍：原地留下盘坐的肉身（可打）');
ok(old.atk > atk0 * 1.2, '元婴出手更凶');
ok(body.maxHp < old.maxHp * 0.5 && body.def.drops.length === 0, '肉身血薄，打破不掉宝');
const hp1 = old.hp;
g.combat.hitEnemy(body, body.hp * 50, { realm: 4, stCh: 0 }, body.x, body.y); tick(0.2);
ok(!(old as any).ying && !!old.st.stun && old.hp < hp1, '打破肉身：元婴震回、眩晕、折损气血');
ok(!g.combat.enemies.some((e) => (e as any).shell === old && !e.dead), '肉身不在了');
clear();
const old2 = human(4, 500, '老魔丁');
g.shen.foeOut(old2); old2.x += 3000; tick(0.2);
ok(Math.hypot(old2.x - old2.hx, old2.y - old2.hy) < 1300, '元婴走不出肉身左近');
tick(15);
ok(!(old2 as any).ying && !g.combat.enemies.some((e) => (e as any).shell === old2), '时限到：元婴归窍，肉身收回');
clear(); g.combat.invulnT = 99;
const old3 = human(4, 360, '老魔戊'); old3.skT = 0;
let sawY = false, sawS = false;
for (let i = 0; i < 40 * 30 && !(sawY && sawS); i++) { old3.hp = old3.maxHp * 0.6; g.modal = null; g.hero.hp = 1; g.update(1 / 30); sawY ||= !!(old3 as any).ying; sawS ||= g.shen.spirits.length > 0; }
ok(sawS, '交手中元婴敌修自己会化形');
ok(sawY, '交手中元婴敌修自己会出窍');

console.log('四、同行友人');
clear(); g.combat.invulnT = 99;
const pick = (realm: number) => { const d = g.npcs.list.find((q) => q.alive && q.realm === realm && !q.beauty && (q.map ?? 'renjie') === 'renjie' && !g.npcs.activeOf(q.id))!; d.x = g.player.x + 80; d.y = g.player.y; d.hunting = false; d.chasing = false; return d; };
const d3 = pick(3);
const a3 = g.npcs.summon(d3.id)!;
ok(a3?.act === 'follow', `结丹友人${d3.name}同行`);
human(1, 360); human(1, 420); human(1, 380);
let hx = 0;
for (let i = 0; i < 30 * 30; i++) { g.modal = null; g.hero.hp = 1; g.update(1 / 30); hx = Math.max(hx, g.combat.acts.list.filter((x) => x instanceof HuaxingAct).length); }
ok(hx > 0, '结丹友人会化形助战（从友人身上起手）');
clear(); g.combat.invulnT = 99;
if (g.npcs.activeOf(d3.id)) g.npcs.active.delete(d3.id);
const d4 = pick(4); const a4 = g.npcs.summon(d4.id)!;
human(1, 360); human(1, 420);
let yg = false;
for (let i = 0; i < 40 * 30 && !yg; i++) { g.modal = null; g.hero.hp = 1; g.update(1 / 30); yg = g.shen.isYing(a4); }
ok(yg, `元婴友人${d4.name}会元婴出窍`);
if (yg) {
  ok(g.shen.bodies().length === 1, '肉身成了敌人的仇恨目标');
  g.shen.hitAllyBody(a4, 3); tick(0.1);
  ok(!g.shen.isYing(a4) && (a4 as any).downT > 0, '肉身被打破：友人元婴震回，退下调息');
}
clear(); g.npcs.active.delete(d4.id);
// 友人布阵：被围时布困阵 / 剑阵；你伤重时布回春阵
const dz = pick(3); const az = g.npcs.summon(dz.id)!;
human(1, 340); human(1, 380); human(1, 420);
let zf = '';
for (let i = 0; i < 40 * 30 && !zf; i++) { g.modal = null; g.hero.hp = 0.3; g.update(1 / 30); zf = g.zhenfa.list.find((x) => x.owner === 'a')?.id ?? ''; }
ok(zf === 'huichun', `你伤重时友人布下回春阵（${zf || '无'}）`);
if (zf) {
  const inst = g.zhenfa.list.find((x) => x.owner === 'a')!;
  ok(!g.ws.zf?.some((s: any) => s.id === inst.id && s.x === inst.x), '友人的阵不进你的存档');
  ok(g.zhenfa.focus !== inst, '友人的阵不能被你收走');
}
void az;
clear(); g.npcs.active.clear();

console.log('五、敌阵');
const seen = new Set<string>();
g.combat.invulnT = 0;
for (let k = 0; k < 200 && seen.size < 5; k++) {
  g.zhenfa.list = []; g.combat.enemies = [];
  const mo = human(3, 300);
  (g.zhenfa as any).enemyCd = 0; (g.combat as any).inCombatT = 0;
  for (let j = 0; j < 30 && !g.zhenfa.list.some((i) => i.owner === 'e'); j++) { mo.aggro = true; (g.zhenfa as any).enemyCd = 0; g.hero.hp = 1; g.modal = null; g.update(1 / 30); }
  const f = g.zhenfa.list.find((i) => i.owner === 'e'); if (f) seen.add(f.id);
}
ok(seen.size >= 4, `结丹敌修布的阵：${[...seen].map((id) => ZHEN_BY_ID[id].name).join('、')}`);
// 各敌阵的效果
for (const id of ['mizong', 'gengjin', 'wulei', 'kun']) {
  g.zhenfa.list = []; g.combat.enemies = [];
  const mo = human(3, 300);
  const inst = (g.zhenfa as any).make({ id, map: (await import('../src/data/world')).ACTIVE_MAP, x: g.player.x, y: g.player.y, r: 280, left: 26, pow: 1, hi: false, flags: 4, eye: { x: g.player.x + 2000, y: g.player.y, hp: 1, max: 1 } }, 'e');
  inst.src = mo; g.zhenfa.list.push(inst);
  g.hero.hp = 1; g.combat.pst = {};
  if (id === 'mizong') { g.player.x += 600; g.player.st.x = g.player.x; }
  let hurt = 0;
  for (let i = 0; i < 6 * 30; i++) { g.modal = null; const h0 = g.hero.hp; g.update(1 / 30); hurt += Math.max(0, h0 - g.hero.hp); g.hero.hp = Math.max(g.hero.hp, 0.5); mo.x = g.player.x + 2000; }
  if (id === 'mizong') ok(g.zhenfa.inside(inst, g.player.x, g.player.y), '迷踪阵：走出阵界又被雾兜回阵中');
  if (id === 'gengjin' || id === 'wulei') ok(hurt > 0.01, `${ZHEN_BY_ID[id].name}：站在阵里不停挨打（-${(hurt * 100).toFixed(0)}%）`);
  if (id === 'kun') ok(g.zhenfa.inside(inst, g.player.x, g.player.y, 5), '困阵：出不去');
}
g.zhenfa.list = []; g.combat.enemies = [];

console.log('六、每座阵的精熟');
g.hero.realm = 3; C.addItem(g.hero, 'zf_pan3', 1); C.addItem(g.hero, 'zf_qi', 400); C.addItem(g.hero, 'mat_lingshi', 200000);
g.zhenfa.st.xp = 400;
const r0 = (() => { g.zhenfa.deploy('kun'); const i = g.zhenfa.list.find((x) => x.owner === 'p')!; const r = i.r; g.zhenfa.dismiss(i, true); return r; })();
const m0 = g.zhenfa.mastXp('kun');
ok(m0 >= 2, `布一次长精熟（${m0}）`);
g.zhenfa.st.mast!.kun = ZM_XP[3];
ok(g.zhenfa.mastLv('kun') === 3 && g.zhenfa.flagsOf(ZHEN_BY_ID.kun) === 3, '圆满：困阵省一面阵旗');
g.zhenfa.deploy('kun'); const iK = g.zhenfa.list.find((x) => x.owner === 'p' && !x.dead)!;
ok(iK.r > r0 * 1.15 && iK.flags === 3, `圆满的困阵更大（${Math.round(r0)} → ${Math.round(iK.r)}）`);
g.zhenfa.dismiss(iK, true);
g.save(1);
const t2 = new Terrain(); t2.build(); const g2 = new Game(t2); g2.load('fanren_save_1');
ok(g2.zhenfa.mastLv('kun') === 3, '精熟随存档');

console.log(fails ? `${n - fails}/${n} 通过，${fails} 项失败` : `${n}/${n} 通过`);
process.exit(fails ? 1 : 0);
