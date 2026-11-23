// v0.70 第二批验收：化神一成封顶、灵草只看数量、金雷竹只在清音门卖、修士按境界加强与亡命遁逃、元婴遁出（敌我）、彩蛋「天下共讨」、新开场
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
(globalThis as any).__TAIXU_NORELOAD = true;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { Enemy, HUMAN_BUFF } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { RECIPES } = await import('../src/data/recipes');
const { LOC_BY_ID } = await import('../src/data/world');
const { MY_SECT_ID } = await import('../src/data/sects');
const C = await import('../src/world/cultivation');
const { itemDef } = await import('../src/data/items');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;
let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const h = g.hero;

// ---------------- 一、化神一成封顶
h.realm = 4; h.stage = 2; h.exp = C.need(h);
C.addItem(h, 'item_yuanqi', 10); C.addItem(h, 'pill_zifu', 3);
ok(C.majorChance(h, 5, 0.5) <= C.HUASHEN_CAP + 1e-9, `冲击化神成功率显示不超一成（${(C.majorChance(h, 5, 0.5) * 100).toFixed(1)}%）`);
let wins = 0; for (let i = 0; i < 400; i++) { h.realm = 4; h.stage = 2; h.exp = C.need(h); C.addItem(h, 'item_yuanqi', 5); h.daoHurt = null; const r = C.tryBreak(h, 5, 0.9); if (r.ok) wins++; }
ok(wins / 400 < 0.16, `冲击化神实测成功率约一成（400 次成功 ${wins} 次）`);
h.realm = 1; h.stage = 3; h.daoHurt = null;

// ---------------- 二、灵草只看数量
h.bag = h.bag.filter((b) => itemDef(b.id)?.type !== 'herb');
C.addItem(h, 'herb_huangjing', 2, 50); C.addItem(h, 'herb_huangjing', 3, 300); C.addItem(h, 'herb_huangjing', 1);
ok(h.bag.filter((b) => b.id === 'herb_huangjing').length === 1 && C.bagCount(h, 'herb_huangjing') === 6, '同种灵草不分年份、合成一格');
ok(!RECIPES.some((r) => r.inputs.some((i) => i.minAge)), '配方里不再有年份要求');
const zj = RECIPES.find((r) => r.id === 'r_zhuji')!;
ok(zj.inputs.find((i) => i.id === 'herb_zihou')!.n === 2, `筑基丹：紫猴花百年 ×1 → ${zj.inputs.find((i) => i.id === 'herb_zihou')!.n} 株`);
h.bag.push({ id: 'herb_lingzhi', n: 2, age: 80 }, { id: 'herb_lingzhi', n: 1, age: 500 });
C.mergeHerbs(h);
ok(h.bag.filter((b) => b.id === 'herb_lingzhi').length === 1 && h.bag.find((b) => b.id === 'herb_lingzhi')!.age === undefined, '旧存档的分年份灵草读档合并');
h.bottle.drops = 1; const n0 = C.bagCount(h, 'herb_lingzhi');
C.useBottle(h, h.bag.find((b) => b.id === 'herb_lingzhi')!);
ok(C.bagCount(h, 'herb_lingzhi') === n0 + 2 && h.bottle.drops === 0, '墨露：一株化三（+2 株）');
for (const i of zj.inputs) C.addItem(h, i.id, i.n);
const chk = C.checkRecipe(h, zj);
ok(chk.ok, '凑齐株数即可炼筑基丹：' + chk.missing.join('、'));

// ---------------- 三、金雷竹只在清音门卖
const shopAt = (id: string) => g.towns.shop(LOC_BY_ID.get(id)!, 'market').stock.find((s) => s.id === 'mat_jinleizhu');
const jl = shopAt('miaoyin');
ok(!!jl && jl.price >= 250000, `清音门坊市有金雷竹（${jl?.price} 灵石）`);
ok(!shopAt('tianxing') && !shopAt('yuejing'), '别处坊市不卖金雷竹');

// ---------------- 四、修士按境界加强、亡命遁逃
const mk = (def: string, r: number, school = 'huangfeng') => { const e = new Enemy((ENEMIES as any)[def] ?? (ENEMIES as any).bandit, g.player.x + 300, g.player.y, r, 0); e.school = school; return e; };
// 斗法版把筑基也抬了一点（1.32，比炼气高一成上下）；结丹、元婴仍是大幅加强
ok(HUMAN_BUFF[2][0] <= 1.35 && HUMAN_BUFF[3][0] >= 1.45 && HUMAN_BUFF[4][0] >= 1.85, '筑基略强、结丹元婴大幅加强');
g.teleport(g.player.x - 6000, g.player.y + 2500); g.update(0.05);
let fled = 0;
for (let i = 0; i < 40; i++) {
  const e = mk('jindan_mo', 3); e.aggro = true; g.combat.enemies.push(e); e.hp = e.maxHp * 0.2;
  (g.combat as any).mind.tick(e, 0.05, g.player.x, g.player.y, 300, false, true);
  if (e.fled) fled++;
  e.dead = true;
}
ok(fled >= 30, `结丹残血亡命遁逃（40 人中 ${fled} 人逃，几乎都逃）`);
const yy = mk('jindan_mo', 4, 'guiling'); yy.aggro = true; g.combat.enemies.push(yy); yy.hp = yy.maxHp * 0.15;
(g.combat as any).mind.tick(yy, 0.05, g.player.x, g.player.y, 300, false, true);
ok(!yy.fled, '元婴不再两成血就跑，死战到底');

// ---------------- 五、元婴遁出
const n1 = g.combat.enemies.length;
g.combat.finish(yy);
const ying = g.combat.enemies.find((e) => (e as any).yingEsc && !e.dead);
ok(!!ying && g.combat.enemies.length === n1 + 1, '元婴修士肉身被毁，元婴破体而出');
ok(!!ying && Math.abs(ying.maxHp - yy.maxHp * 0.3) < 2 && ying.speed > yy.speed * 2, '元婴三成气血、遁速两倍有余');
if (ying) { g.combat.finish(ying); ok(!g.combat.enemies.some((e) => (e as any).yingEsc && !e.dead), '斩了元婴才算真死（不会再遁出）'); }
// 玩家
h.realm = 4; h.stage = 0; h.exp = 1000; h.hp = 0; h.dead = false; h.daoHurt = null;   // 前面四百次冲关可能已经折腾死了
(g.combat as any).playerDown();
ok(!!g.yingEsc && g.yuanying.active && !g.yuanying.body && Math.abs(h.hp - 0.35) < 1e-6 && !h.dead, '你的肉身被毁：元婴遁出，三成五气血再战');
const exp0 = h.exp;
for (let i = 0; i < 60 * 10; i++) { (g.combat as any).combatT = 99; (g as any).tickYingEscape(0.1); }
ok(!g.yingEsc && !g.yuanying.active && !!h.daoHurt && h.exp < exp0, '脱战一阵，元婴重塑肉身（道伤、修为倒退两成）');
h.hp = 0; (g.combat as any).playerDown(); h.hp = 0; (g.combat as any).invulnT = 0;
const downs: any[] = []; const orig = g.onPlayerDown.bind(g); (g as any).onPlayerDown = (k: any) => { downs.push(k); };
(g.combat as any).playerDown();
ok(downs.length === 1 && !g.yingEsc, '元婴再被打散才是真死');
(g as any).onPlayerDown = orig;
// 读档躲不掉代价
h.hp = 0; g.yingEsc = null; g.yuanying.reset(); (h as any).yingEscP = undefined; h.daoHurt = null;
(g.combat as any).playerDown(); g.save(0); g.yingEsc = null; g.yuanying.reset();
g.load('taixu_save_auto');
ok(!!g.hero.daoHurt && !(g.hero as any).yingEscP && !g.yingEsc, '元婴遁体时存的档，读档即按重塑肉身结算');

// ---------------- 六、彩蛋「天下共讨」
const SW = g.sectwar as any, S = SW.S, MS = g.mysect as any, MY = MY_SECT_ID;
g.hero.realm = 4; g.day = 4000;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = { name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: g.day - 3000, fame: 900, stones: 200000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 2, zhen: 2, ling: 5 }, open: false, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0 };
const ms = g.ws.mySect as any;
for (let i = 0; i < 120; i++) ms.ds.push({ id: ms.seq++, name: '弟子' + i, sex: 'm', age: 30, root: 2, realm: i < 10 ? 3 : 2, stage: 0, exp: 0.5, loyal: 70, rank: 1, job: 'xiu', joined: g.day, arts: 0 });
MS.sync(); SW.initHolds();
S.mieN = 1; ok(!SW.maybeCoalition(), '只灭一派：天下无事');
S.mieN = 2; while (g.modal) g.closeModal(true);
const w0 = S.wars.filter((w: any) => w.b === MY).length;
ok(SW.maybeCoalition() && S.wars.filter((w: any) => w.b === MY).length - w0 >= 5, `灭两派：天下共讨（${S.wars.filter((w: any) => w.b === MY).length - w0} 家宗门同时宣战）`);
ok(!SW.maybeCoalition(), '天下共讨只发动一回');
while (g.modal) g.closeModal(true);

// ---------------- 七、新开场（原创，不提夺舍）
g.reset(); g.story.start(); (g.story as any).opening();
const m: any = g.modal;
ok(!!m && /回春谷/.test(m.node.text) && !/夺舍/.test(JSON.stringify(m.node)), '新开场：回春谷往事，没有夺舍');
const d = g.npcs.byId.get('modaifu'); ok(!!d && !d.alive && !/夺舍/.test(d.deathNote ?? ''), `邹大夫的结局：${d?.deathNote}`);

console.log(`v070b: ${pass} 通过, ${fail} 失败`);
if (fail) process.exit(1);
