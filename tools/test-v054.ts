// v0.54 验收：三方混战（妖兽护领地、劫修 / 追兵与妖兽互斗）
// 用法：npx tsx tools/test-v054.ts
import './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__TAIXU_NORELOAD = true;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { ENEMIES } = await import('../src/data/enemies') as any;
const { Enemy } = await import('../src/world/combat');
const C = await import('../src/world/cultivation');
const { MIJING_ON } = await import('../src/data/mijing');

let fails = 0, n = 0;
const ok = (c: any, msg: string) => { n++; if (!c) { fails++; console.log('  ✗', msg); } else console.log('  ✓', msg); };
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
g.reset();
const l = LOCATIONS.find((q) => q.id === 'qixuan')!;
{ let x = l.x * WORLD_SCALE + 900, y = l.y * WORLD_SCALE + 600;
  for (let r = 0; r < 20000 && (terrain.inLocZone(x, y, 1800) || terrain.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
  g.teleport(x, y); }
const HOME = { x: g.player.x, y: g.player.y };
(g as any).paused = false;
const tick = (sec: number) => { for (let i = 0; i < sec * 30; i++) { g.hero.hp = 1; g.modal = null; g.update(1 / 30); } };
const mk = (id: string, dx: number, dy: number, realm = 1) => { const e = new Enemy(ENEMIES[id], g.player.x + dx, g.player.y + dy, realm, 2); e.hx = e.x; e.hy = e.y; g.combat.enemies.push(e); return e; };
// 把气血抬到十万只是为了看得见互斗、不被打死。但斗法版的护体灵光按气血上限的成数生成，
// 十万气血的人会顶着一面一万血的罩子，妖兽那几十点伤害全被吃住——测试里先不让他开罩，只测互斗。
const bulk = (e: any) => { e.maxHp = e.hp = 1e5; (e as any).gearOn = true; e.ward = undefined; e.wardFrac = 0; };

console.log('一、劫修闯进狼窝');
g.combat.enemies = []; g.combat.invulnT = 999;
const bandit = mk('bandit', 500, 0); bandit.aggro = true; bulk(bandit);
const wolf = mk('wolf', 760, 0); wolf.maxHp = wolf.hp = 1e5;
ok(g.combat.teamOf(bandit) !== g.combat.teamOf(wolf), '劫修与野狼不再是一伙');
tick(6);
ok(wolf.aggro, '野狼察觉闯入领地的劫修');
ok(bandit.hp < bandit.maxHp, `野狼咬劫修（劫修掉血 ${Math.round(bandit.maxHp - bandit.hp)}）`);
ok(wolf.hp < wolf.maxHp, `劫修还手（野狼掉血 ${Math.round(wolf.maxHp - wolf.hp)}）`);

console.log('二、追兵被妖兽缠住');
g.combat.enemies = [];
const hunter = mk('bandit', 420, 0); hunter.aggro = true; (hunter as any).hunt = true; bulk(hunter);
const boar = mk('boar', 560, 40); boar.maxHp = boar.hp = 1e5;
for (let k = 0; k < 20 && !(hunter.hp < hunter.maxHp && boar.hp < boar.maxHp); k++) tick(1);
ok(hunter.hp < hunter.maxHp && boar.hp < boar.maxHp, '追兵与推山兽打了起来');

console.log('三、没动凶性的妖兽不惹事');
g.combat.enemies = [];
const shy = mk('zhijiao', 300, 0); shy.maxHp = shy.hp = 1e5;
const b2 = mk('bandit', 420, 0); b2.maxHp = b2.hp = 1e5;
tick(3);
ok(!shy.aggro || shy.hp === shy.maxHp, '炙角鹿（不主动伤人）不会扑劫修');

console.log('四、劫修之间不互斗');
g.combat.enemies = [];
const r1 = mk('bandit', 300, 0), r2 = mk('bandit', 360, 0); r1.aggro = r2.aggro = true;
ok(!g.combat.hostile(r1, r2), '两个劫修同仇敌忾');

console.log('五、友：知交、同行、传音相邀');
g.combat.enemies = [];
const fr = g.npcs.list.filter((d) => d.alive && d.realm >= 1 && !d.beauty && (d.map ?? 'tiannan') === 'tiannan').slice(0, 5);
fr.forEach((d, i) => { d.met = true; d.favor = 50 + i * 5; d.grudge = 0; d.pers = 'kind'; d.hunting = false; d.chasing = false; });
ok(g.friends.friends().length >= 5, `知交名册（${g.friends.friends().length} 人）`);
const near = fr[0]; near.x = g.player.x + 100; near.y = g.player.y; g.npcs.update(1 / 30);
let tries = 0, said = ''; while (g.npcs.activeOf(near.id)?.act !== 'follow' && tries++ < 20) said = g.friends.invite(near);
ok(g.npcs.activeOf(near.id)?.act === 'follow', '当面相邀，结伴同行');
const far = fr[1]; far.x = g.player.x + 60000; far.y = g.player.y;
tries = 0; while (!g.friends.S.remote.some((r) => r.id === far.id) && tries++ < 20) g.friends.invite(far);
ok(g.friends.S.remote.some((r) => r.id === far.id), '传音相邀：对方启程');
g.day += 9; g.friends.daily(1); tick(1.2);
ok(g.npcs.activeOf(far.id)?.act === 'follow', '几日后赶到身边');
g.friends.invite(fr[2]); g.friends.invite(fr[2]); g.friends.invite(fr[2]);
const fourth = fr[3]; tries = 0; while (tries++ < 10) g.friends.invite(fourth);
ok(g.friends.party().length + g.friends.S.remote.length <= 3, `同行最多三人（现 ${g.friends.party().length}）`);
g.friends.setWait(near, true); const wx = (near as any).waitAt.x; g.player.x += 900; tick(2);
ok(Math.abs(g.npcs.activeOf(near.id)!.st.x - wx) < 60, '原地等候：不跟着走');
g.friends.setWait(near, false); tick(3);
ok(Math.hypot(g.npcs.activeOf(near.id)!.st.x - g.player.x, g.npcs.activeOf(near.id)!.st.y - g.player.y) < 400, '下令跟上：赶回身边');
for (const a of g.friends.party()) g.friends.dismiss(a.d);
tick(1.2);
ok(g.friends.party().length === 0, '散去');

console.log('六、邀约：真心相约 / 求援 / 设局');
const honest = fr[4]; honest.pers = 'righteous'; honest.favor = 70; (honest as any).shown = 70;
const inv1 = g.friends.makeInvite('explore', honest)!;
ok(inv1 && !inv1.trap, '正直好友的邀约是真的');
g.friends.accept(inv1);
ok(g.friends.marks().some((m) => m.glyph === '约'), '地图标「约」');
const ls0 = C.bagCount(g.hero, 'mat_lingshi');
g.teleport(inv1.x, inv1.y); tick(0.5);
if (MIJING_ON) ok(inv1.done && g.mijing.S.ents.some((e) => e.src === 'invite' && e.npc === honest.id), '会合同探：会合处现出一座小秘境');
else ok(inv1.done && C.bagCount(g.hero, 'mat_lingshi') > ls0, '会合同探：一同破禁，得了机缘（秘境已撤回）');
ok(g.npcs.activeOf(honest.id)?.act === 'follow', '友人结伴同行，一道进去');
g.modal = null;
const inv2 = g.friends.makeInvite('help', honest)!; inv2.trap = false; g.friends.accept(inv2);
g.teleport(inv2.x, inv2.y); tick(0.5);
const foes2 = g.combat.enemies.filter((e) => !e.dead);
ok(foes2.length >= 3, `求援：赶到时 ${foes2.length} 个敌人围着他`);
const fav0 = honest.favor; foes2.forEach((e) => { e.hp = 0; g.combat.finish(e); }); tick(1.5);
ok(inv2.done && honest.favor > fav0, `解围：好感 +${Math.round(honest.favor - fav0)}`);
g.modal = null;
const bad = fr[2]; bad.pers = 'ruthless'; bad.favor = 35; (bad as any).shown = 60;
let inv3 = null as any; for (let k = 0; k < 30 && !(inv3 && inv3.trap); k++) inv3 = g.friends.makeInvite('explore', bad);
ok(inv3 && inv3.trap, '狠辣之人表面热络：邀约是局');
g.hero.realm = Math.min(5, bad.realm + 2); g.hero.stage = 0;
ok(g.friends.inviteText(inv3).includes('有诈'), '境界高两层：看出信里的蹊跷');
g.friends.accept(inv3); g.teleport(inv3.x, inv3.y); g.combat.invulnT = 999; tick(6);
ok(bad.grudge && bad.grudge >= 1 && g.combat.enemies.some((e) => !e.dead && e.team === 'fr:ambush'), '会合处伏兵四起、那人翻脸');

if (MIJING_ON) {
console.log('七、秘境');
g.hero.realm = 3; g.hero.stage = 0; g.combat.enemies = []; g.modal = null;
const wx0 = g.player.x, wy0 = g.player.y;
const pal = g.friends.party().length;
g.mijing.enter({ name: '测试洞府', tier: 2, theme: 'cave', seed: 4242, floors: 2, rooms: 8, lv: 5, boss: 'jinhu' });
ok(g.mijing.active && g.mijing.walk(g.player.x, g.player.y), '进入秘境：站在入口石室');
ok(g.combat.enemies.length === 0, '世界里的敌人暂时收起');
ok(g.friends.party().every((a) => Math.hypot(a.st.x - g.player.x, a.st.y - g.player.y) < 300) && g.friends.party().length === pal, `同行友人一同进来（${pal} 人）`);
const F0 = g.mijing.floor!;
ok(F0.rooms.length >= 6 && F0.rooms.some((r) => r.kind === 'boss') && F0.rooms.some((r) => r.kind === 'treasure'), `生成 ${F0.rooms.length} 间石室（含首领室、宝库）`);
// 连通：从入口走得到每一间（禁制门算通）
const reach = (F: any) => { const seen = new Uint8Array(F.gw * F.gh), st = [F.rooms[0].cy * F.gw + F.rooms[0].cx]; seen[st[0]] = 1;
  while (st.length) { const i = st.pop()!; for (const j of [i - 1, i + 1, i - F.gw, i + F.gw]) if (j >= 0 && j < seen.length && !seen[j] && (F.cells[j] === 1 || F.cells[j] === 2)) { seen[j] = 1; st.push(j); } }
  return F.rooms.every((r: any) => { for (let i = 0; i < F.roomOf.length; i++) if (F.roomOf[i] === r.i && seen[i]) return true; return false; }); };
ok(reach(F0), '每间石室都连得通');
// 多拼几张：不同种子、不同主题，都得连通、都得有首领，而且彼此不一样
{ const sigs = new Set<string>(); let allOk = true; const themes = ['cave', 'tomb', 'ice', 'fire', 'forest', 'desert', 'sea', 'palace', 'blood'];
  for (let k = 0; k < 36; k++) { const F = (g.mijing as any).gen({ name: 't', tier: 1 + (k % 3), theme: themes[k % 9], seed: 1000 + k * 7, floors: 1, rooms: 4 + (k % 9), lv: 3 }, 0);
    if (!reach(F) || !F.rooms.some((r: any) => r.kind === 'boss') || F.rooms.length < 3) allOk = false;
    sigs.add(F.rooms.map((r: any) => r.tpl).join(',') + F.gw + 'x' + F.gh); }
  ok(allOk, '36 张随机拼图：张张连通、张张有首领');
  ok(sigs.size === 36, `36 张拼图互不相同（${sigs.size} 种）`); }
const p0 = { x: g.player.x, y: g.player.y };
g.input.keys.add('w'); tick(4); g.input.keys.clear();
ok(g.mijing.walk(g.player.x, g.player.y), '往墙上走：被墙挡住');
const hall = F0.rooms.find((r: any) => (r.kind === 'hall' && !r.link) || r.kind === 'treasure')!;
const hc = g.mijing.roomC(hall); g.player.x = hc.x; g.player.y = hc.y; tick(0.3);
ok(hall.entered && hall.foes.length > 0, `走进石室：妖物现身（${hall.foes.length} 只，${hall.foes[0]?.name ?? ''}）`);
hall.foes.forEach((e) => { e.hp = 0; g.combat.finish(e); }); tick(0.5);
ok(hall.cleared, '妖物除尽：石室清空');
const chest = F0.objs.find((o) => o.kind === 'chest' && !o.hidden)!;
g.player.x = chest.x; g.player.y = chest.y + 30; tick(0.2);
const lsA = C.bagCount(g.hero, 'mat_lingshi'); g.interact(); g.modal = null;
ok(chest.used && C.bagCount(g.hero, 'mat_lingshi') > lsA, '开启宝匣得宝');
const door = F0.objs.find((o) => o.kind === 'door');
if (door) {
  ok(!g.mijing.walk(door.x, door.y), '禁制门：未破时走不过去');
  (g.mijing as any).openDoor(door);
  ok(g.mijing.walk(door.x, door.y), '破开禁制门：甬道通了');
} else ok(true, '（本局没有禁制门）');
const boss = F0.rooms.find((r) => r.kind === 'boss')!;
const bc = g.mijing.roomC(boss); g.player.x = bc.x; g.player.y = bc.y + 100; tick(0.3);
ok(boss.foes.some((e) => e.boss), `首领室：${boss.foes.find((e) => e.boss)?.name}`);
const stairs = F0.objs.find((o) => o.kind === 'stairs')!;
ok(stairs.hidden, '首领未除：去下一层的古阵不亮');
boss.foes.forEach((e) => { e.hp = 0; g.combat.finish(e); }); tick(0.5);
ok(F0.bossDead && !stairs.hidden, '首领伏诛：古阵亮起');
// 古阵现在是云门：先在门外站一下（刚进秘境要走出入口的云门才算数），再走进阵心，云遮满的那一刻到下一层
g.player.x = stairs.x; g.player.y = stairs.y + 600; tick(0.3); g.player.x = stairs.x; g.player.y = stairs.y + 20; tick(1.5);
ok(g.mijing.cur!.fi === 1, '踏上古阵：第二层');
g.save(1);
const sv = JSON.parse(store.get('taixu_save_1')!);
ok(Math.abs(sv.p.x - wx0) < 1 && Math.abs(sv.p.y - wy0) < 1, '秘境里存档：记的是入口外的位置');
g.mijing.leave();
ok(!g.mijing.active && Math.abs(g.player.x - wx0) < 1, '出秘境：回到入口');

console.log('八、大秘境 / 传闻真假');
const { MJ_BY_ID, mjOpen } = await import('../src/data/mijing');
const xs = MJ_BY_ID.xuese;
let openDays = 0; for (let d = 0; d < 3600; d += 10) if (mjOpen(xs, d).open) openDays += 10;
ok(openDays > 40 && openDays < 160, `赤霄禁地五年一开（十年里开 ${openDays} 日）`);
g.hero.realm = 3;
const fx = { kind: 'def', def: xs, x: 0, y: 0 } as any; (g.mijing as any).entFocus = fx;
const node = g.mijing.entNode()!;
ok(node.options[0].disabled, '结丹修士进不了赤霄禁地');
let fakeN = 0, n2 = 0;
for (let k = 0; k < 200; k++) { const e = g.mijing.rumor(); if (e) { n2++; if (e.fake) fakeN++; e.done = true; } }
ok(n2 > 150 && fakeN / n2 > 0.2 && fakeN / n2 < 0.5, `江湖传闻有真有假（假的 ${Math.round(fakeN / n2 * 100)}%）`);
const fe = g.mijing.rumor(1)!; fe.fake = 'ambush';
g.combat.enemies = []; g.teleport(fe.x, fe.y); tick(0.3);
ok(fe.done && g.combat.enemies.some((e) => e.team === 'mj:ambush'), '假传闻：劫修设伏');

} else {
  console.log('七、秘境（已撤回）');
  g.mijing.enter({ name: 't', tier: 1, theme: 'cave', seed: 1, floors: 1, rooms: 4, lv: 1 });
  ok(!g.mijing.active, '秘境已撤回：进不去');
  ok(g.mijing.marks().length === 0, '秘境已撤回：地图上没有秘境入口与传闻');
  { const n0 = g.mijing.S.ents.length; g.mijing.S.next = 0; g.mijing.daily(1); ok(g.mijing.S.ents.length <= n0, '秘境已撤回：不再生成传闻'); }
}
console.log('九、众生行');
g.teleport(HOME.x, HOME.y);
g.combat.enemies = []; g.modal = null; g.hero.realm = 2; g.hero.stage = 1; g.combat.invulnT = 0;
const Z = g.zhongsheng as any;
Z.hunt();
const H = Z.groups.find((x: any) => x.kind === 'hunt');
ok(!!H && H.units.length >= 2 && H.beasts.length >= 1, `散修猎妖：${H?.label}`);
ok(H && !g.combat.pickTarget()?.name?.startsWith('散修'), '猎妖散修不进你的自动锁定');
const hp0b = g.hero.hp;
for (let k = 0; k < 8; k++) { g.hero.mp = 1; tick(1); }
const bh = H.beasts.reduce((s: number, b: any) => s + (b.maxHp - b.hp), 0), uh = H.units.reduce((s: number, u: any) => s + (u.maxHp - u.hp), 0);
ok(bh > 0 && (uh > 0 || H.beasts.every((b: any) => b.dead)), `散修与妖兽真在厮杀（妖兽失血 ${Math.round(bh)}、散修失血 ${Math.round(uh)}）`);
ok(H.units.every((u: any) => u.dead || u.noP), '你不动手，他们不冲你来');
g.combat.enemies = []; Z.groups = []; Z.hunt();
const H2 = Z.groups.find((x: any) => x.kind === 'hunt'); const u0 = H2.units[0];
g.combat.hitEnemy(u0, 5, { realm: g.hero.realm, stCh: 0 }, g.player.x, g.player.y);
ok(H2.units.every((u: any) => !u.noP && u.aggro), '你先动手：一伙都翻脸');
void hp0b;
g.combat.enemies = []; Z.groups = [];
Z.duel();
const D = Z.groups.find((x: any) => x.kind === 'duel');
for (let k = 0; k < 10; k++) tick(1);
const dh = D.units.reduce((s: number, u: any) => s + (u.maxHp - u.hp), 0);
ok(dh > 0, `斗法抢宝：两伙修士互相出手（失血 ${Math.round(dh)}）`);
g.combat.enemies = []; Z.groups = [];
Z.crowd(g.player.x + 3000, g.player.y, '归墟殿');
const Cg = Z.groups.find((x: any) => x.kind === 'crowd');
const d0 = Math.hypot(Cg.units[0].x - (g.player.x + 3000), Cg.units[0].y - g.player.y);
tick(4);
const d1 = Math.hypot(Cg.units[0].x - (g.player.x + 3000), Cg.units[0].y - g.player.y);
ok(d1 < d0 - 300 && !Cg.units.some((u: any) => u.aggro), '秘境人潮：赶路不惹你');

console.log(`\n${n - fails}/${n} 通过`);
process.exit(fails ? 1 : 0);
