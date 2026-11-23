// v0.72 宗门金字塔 · 灵根功法一致 · 百人战阵 专项验收测试：npx tsx tools/test-v072.ts
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const { SECT_RANKS, migrateSectState } = await import('../src/world/worldstate');
const { ROOTS, rootBreakBonus } = await import('../src/data/realms');
const { SECT_DEFS, SECT_DEF } = await import('../src/world/roster');
const { scaleOf, SCALE_CAP, MY_SECT_ID } = await import('../src/data/sects');
const { sectDiscipleSheet, collectFormationDrawables, applyFormationDamage, formationOffsets, formationBounds, tickFormation } = await import('../src/world/warformation');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };

// 一、8 级统一宗门职位与旧档 v8 迁移
ok(SECT_RANKS.length === 8 && SECT_RANKS[0] === '杂役弟子' && SECT_RANKS[7] === '太上长老', `SECT_RANKS 8 级统一：${SECT_RANKS.join(' → ')}`);
const legacySect: any = { id: 'huangfeng', rank: 2, contrib: 100, joined: 0, lastPay: 0, tasks: [], done: 0 };
migrateSectState(legacySect);
ok(legacySect.v8 === true && legacySect.rank === 3, `旧档 v8 职位自动 +1 迁移（2 → ${legacySect.rank}）`);
migrateSectState(legacySect);
ok(legacySect.rank === 3, 'v8 迁移幂等（不重复 +1）');

// 二、三层万人金字塔 O(1) 兵池与抽调规则
const tot = SECT_DEFS.reduce((s, d) => s + d.n, 0);
ok(tot > 250000, `全界域 42 宗总门人规模 ${tot}`);
ok(SECT_DEFS.every((d) => d.n <= SCALE_CAP[scaleOf(d.id, d.n)]), '各宗人数均在 SCALE_CAP 上限内');
const pool0 = g.roster.poolState('huangfeng');
const o0 = { ...pool0.outer }, s0 = { ...pool0.servant };
const midP = g.roster.midPage('huangfeng', 1, 12);
const smp = g.roster.qiSample('huangfeng', 8, 42, 'outer');
ok(o0.a > 1000 && s0.a > 3000, `青霞谷数字池：外门 ${o0.a} · 杂役 ${s0.a}`);
ok(midP.items.length === 12 && smp.length === 8, 'O(1) 中坚分页与炼气点卯正常');
g.roster.damageOuter('huangfeng', 45, 35);
const pool1 = g.roster.poolState('huangfeng');
ok(pool1.outer.a === o0.a - 80 && pool1.outer.j === o0.j + 35, `外门战损入池（在战 ${o0.a}→${pool1.outer.a}，伤员 ${o0.j}→${pool1.outer.j}）`);
const picked = g.roster.pick('huangfeng', 15, 1, 2);
ok(picked.length > 0 && picked.every((d) => !d.title?.includes('杂役')), '出征抽调跳过杂役弟子');

// 三、灵根流速、破境加成与 NPC 灵根补齐
const rHeaven = ROOTS.find((r) => r.id === 'heaven')!;
const rFake = ROOTS.find((r) => r.id === 'fake')!;
const rootIds = new Set(ROOTS.map((r) => r.id));
ok(rHeaven.rate === 2.4 && rFake.rate === 0.45, '灵根流速统一（天灵根 2.4 / 伪灵根 0.45）');
ok(rootBreakBonus('heaven', 1) > rootBreakBonus('fake', 1), `破境加成随灵根分级（heaven ${rootBreakBonus('heaven', 1)} > fake ${rootBreakBonus('fake', 1)}）`);
const noRoot = g.npcs.list.filter((n) => typeof n.root !== 'string' || !rootIds.has(n.root));
ok(noRoot.length === 0, `全体 NPC 均持有合法灵根（${g.npcs.list.length} 人${noRoot.length ? `，缺 ${noRoot.length}: ${noRoot.slice(0, 3).map((n) => n.id + ':' + n.root).join(',')}` : ''}）`);

// 四、WarFormation 百人战阵实体 + AOE 削兵 + 斩首溃散
const sheet = sectDiscipleSheet('huangfeng');
ok(!!sheet && (sheet as any).width > 0, `战兵精灵表预烘成功（${(sheet as any).width}×${(sheet as any).height}）`);

// 开启一场大战并亲征触发百人战阵
(g.ws as any).sect = null;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = {
  name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: g.day - 3000,
  fame: 800, stones: 50000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan',
  halls: { lib: 1, dan: 1, zhen: 1, ling: 3 }, open: true, minRoot: 2, auto: false,
  lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0,
  outer: { a: 600, j: 0, c: 600 }, servant: { a: 900, j: 0, c: 900 },
};
g.mysect.sync();
const ms = g.ws.mySect!;
for (let i = 0; i < 40; i++) ms.ds.push({ id: ms.seq++, name: `战将${i}`, sex: 'm', age: 28, root: 3, realm: i < 4 ? 3 : 2, stage: 1, exp: 0, loyal: 85, rank: 2, job: 'xiu', joined: g.day, arts: 2 });
const SW = g.sectwar;
SW.initHolds();
for (const k of Object.keys(SW.S.truce)) delete SW.S.truce[k];
const w = SW.declare(MY_SECT_ID, 'qingxu', 'v072验收');
SW.setPattern('arrow');
ok(SW.patternNow() === 'arrow', '玩家战阵阵型切换生效（锋矢阵）');

g.hero.realm = 3; g.hero.stage = 1;
SW.march(w, { ma: 'wave', n: 260 });
const B = SW.battle!;
ok(!!B && B.formations.length >= 2, `大会战自动挂接百人战阵：共 ${B?.formations.length} 阵（敌我均出筑基阵眼 + 炼气兵阵）`);
const myForms = B.formations.filter((f) => f.ours);
const foeForms = B.formations.filter((f) => !f.ours);
ok(myForms.length >= 1 && (myForms[0].desiredPattern ?? myForms[0].pattern) === 'arrow', `我方阵型应用锋矢阵（士兵 ${myForms[0]?.soldiers} 人）`);
ok(foeForms.length >= 1 && foeForms[0].soldiers >= 12, `敌方战阵挂载成功（士兵 ${foeForms[0]?.soldiers} 人）`);

// 测试绘制列表收集 + 齐射弹道阵营
const drawOut: any[] = [];
for (const f of B.formations) collectFormationDrawables(f, drawOut, { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 }, 1.2);
ok(drawOut.length >= B.formations.length * 10, `战阵可绘制图元收集正常（${drawOut.length} 个绘制项）`);

// 推进三段列阵开战（集结 -> 推进 -> 叫阵对峙 -> 交锋）后再校验齐射弹道
for (let k = 0; k < 105; k++) SW.update(0.1);
const p0 = g.combat.projs.length;
for (let k = 0; k < 25; k++) SW.update(0.1);
const volleyProjs = g.combat.projs.slice(p0);
ok(volleyProjs.some((pr) => pr.fac === 'e'), `战阵合击齐射生成真实弹道（${volleyProjs.length} 发）`);

// 测试护阵灵盾：未破盾不死兵；破盾后进入破盾窗口，AOE 削兵三分账；暂不做斩首秒炸阵
const fTarget = foeForms[0];
const sBefore = fTarget.soldiers;
const cutUnbroken = applyFormationDamage(fTarget, 120, 2, g);
ok(cutUnbroken === 0 && fTarget.soldiers === sBefore, `未破盾时不死兵（护盾吸收，兵力保持 ${fTarget.soldiers}）`);
// 破开护盾并进入破盾窗口
applyFormationDamage(fTarget, 4000, 3, g);
const d0 = fTarget.deadCount, j0 = fTarget.injCount, r0 = fTarget.routedCount;
const cut = applyFormationDamage(fTarget, 550, 3, g);
const dd = fTarget.deadCount - d0, dj = fTarget.injCount - j0, dr = fTarget.routedCount - r0;
ok(cut > 0 && fTarget.soldiers === sBefore - cut && dd + dj + dr === cut,
  `破盾后 AOE 削兵三分账：${sBefore} → ${fTarget.soldiers}（本次亡${dd}/伤${dj}/溃${dr}）`);
SW.damageFormationArea(fTarget.x, fTarget.y, 260, 350, 'foe', 3);
ok(fTarget.soldiers < sBefore - cut && fTarget.soldiers > 0, `区域 AOE 同步削兵（余 ${fTarget.soldiers} 人）`);

// 阵眼队长阵亡：护盾回流减半但暂不触发全阵秒炸溃散
fTarget.leader.dead = true;
SW.update(0.05);
ok(fTarget.collapsed === false && fTarget.soldiers > 0, '阵眼筑基队长阵亡暂不秒炸战阵，保持大场面战阵演出');

const hud = SW.hud();
ok(!!hud && typeof hud.mForms === 'number' && typeof hud.fForms === 'number' && hud.sub.includes('阵'), `兵力条 HUD 正确输出战阵与伤亡摘要：${hud?.sub}`);

// 五、古代战阵打磨专项校验：疏朗列距 + 将台留白 + 免疫头领身法瞬移 + 朝向防抖 + 对垒驻阵
for (const pat of ['square', 'crane', 'circle', 'arrow'] as const) {
  const pts = formationOffsets(pat, 140);
  let minPair = Infinity;
  let minCore = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dc = Math.hypot(pts[i][0], pts[i][1]);
    if (dc < minCore) minCore = dc;
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < minPair) minPair = d;
    }
  }
  const b = formationBounds(pat, 140);
  ok(pts.length >= 120 && minPair >= 32 && minCore >= 60 && b.rx >= 180,
    `${pat} 队形疏朗且留出中军将台：${pts.length}人 最小间距=${minPair.toFixed(1)}px 将台净空=${minCore.toFixed(1)}px 半径=${Math.round(b.rx)}×${Math.round(b.ry)}`);
}

const fTest = myForms[0];
fTest.leader.dead = false; fTest.leader.gone = false;
const x0 = fTest.x, y0 = fTest.y;
fTest.leader.x += 520; fTest.leader.y -= 280; // 模拟头领施展身法/瞬移
tickFormation(fTest, g, 1 / 30, B.formations);
const jumpDist = Math.hypot(fTest.x - x0, fTest.y - y0);
ok(jumpDist < 20, `头领身法瞬移 590px 时战阵稳住阵脚不随动闪烁（仅位移 ${jumpDist.toFixed(2)}px）`);

// 测试朝向滞回防抖：刚开战若敌人微幅左右越线（<95px）或冷却期内不乱翻面
const faceBefore = fTest.face;
fTest.faceTurnCd = 0;
const fakeEnemy = foeForms[1] ?? foeForms[0];
if (fakeEnemy && !fakeEnemy.collapsed) {
  fakeEnemy.x = fTest.x - faceBefore * 50; // 仅越过 50px（低于 95px 滞回阈值）
  tickFormation(fTest, g, 1 / 30, [fTest, fakeEnemy]);
  ok(fTest.face === faceBefore, '敌军小幅越线（50px）战阵不原地左右闪面');
}

// 校验人脉录宗门层数自上而下且无「随机点卯」晦涩词
const fs = await import('node:fs');
const modalSrc = fs.readFileSync('src/ui/ModalLayer.tsx', 'utf8');
const idx1 = modalSrc.indexOf('第一层 · 宗门高层');
const idx2 = modalSrc.indexOf('第二层 · 中坚筑基');
const idx3 = modalSrc.indexOf('第三层 · 炼气兵池');
ok(idx1 > 0 && idx1 < idx2 && idx2 < idx3 && !modalSrc.includes('随机点卯') && modalSrc.includes('换一批'),
  '人脉录宗门三层按自上而下排列（第一层高层 → 第二层中坚 → 第三层炼气兵池）且文案改为「换一批」');

console.log(fails ? `\n${fails} FAIL` : '\nv0.72 全部验收通过');
process.exit(fails ? 1 : 0);
