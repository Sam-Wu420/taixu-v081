import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
(globalThis as any).window ??= { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const { drawCombatUI } = await import('../src/world/combatfx');
const { tickFormation } = await import('../src/world/warformation');

const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  console.log('✓', msg);
};

// 1) 开战即现前线阵线 & 绝不因核心先死而瞬间炸毁敌阵结束战斗
const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv0: any = createCanvas(1280, 720);
cv0.clientWidth = 1280; cv0.clientHeight = 720;
cv0.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 });
g.canvas = cv0; g.renderer = new Renderer(g, cv0); (g as any).paused = false;
g.hero.realm = 2; g.hero.stage = 1;
g.hero.hp = g.combat.pStats.hp;

// 设黄枫谷 vs 天欢宗开战（含护宗/百人战阵），并让主角作为黄枫谷同盟入场
const SW = g.sectwar;
const hf = LOC_BY_ID.get('huangfeng')!;
g.teleport(hf.x * WORLD_SCALE, hf.y * WORLD_SCALE);
(g.ws as any).sect = 'huangfeng';

const w = (SW as any).declare('huangfeng', 'hehuan', 'test');
ok(!!w, '创建黄枫谷 vs 天欢宗战事');
g.day += 4;
SW.daily(4);
w.side = 0;
w.phase = 'battle';
w.next = g.day;
w.lastFight = g.day - 10;

// 验证走近前线大营不会强制弹窗，按 T (interact) 才打开大营帅帐对话
const mySide = (SW as any).sideOf(w) as 0 | 1;
const camp = SW.campPos(w, mySide);
ok(!!camp, '存在我方前线大营坐标');
if (camp) {
  g.teleport(camp.x, camp.y);
  g.closeModal?.(true);
  (SW as any).acc = 0;
  SW.update(0.1);
  ok(!g.modal, '靠近前线大营不会强行打断弹窗');
  g.interact();
  ok(!!g.modal && g.modal.kind === 'dialog', '大营内按 T 交互打开大营帅帐对话');
  g.closeModal?.(true);
}

// 飞抵前线进入对峙，再明确触发总攻进入前线会战
const fp = (SW as any).frontPos(w);
ok(!!fp, '存在前线接战点');
g.teleport(fp.x, fp.y);
(SW as any).acc = 0;
SW.update(0.1);
ok(!(SW as any).battle && !!SW.standoffHud(), '抵近前线先进入长期对峙态');
SW.triggerDecisiveClash(w, '鸣鼓总攻');
const B = (SW as any).battle;
ok(!!B, '触发总攻事件后进入前线会战');

const allyForms = B.formations.filter((f: any) => f.ours && !f.collapsed);
const foeForms = B.formations.filter((f: any) => !f.ours && !f.collapsed);
ok(allyForms.length >= 1 && foeForms.length >= 1, `双方开战即列阵：我方 ${allyForms.length} 阵 · 敌方 ${foeForms.length} 阵`);

// 验证敌我前线拉开明确对峙距离
const avg = (arr: any[]) => arr.reduce((s, x) => ({ x: s.x + x.x / arr.length, y: s.y + x.y / arr.length }), { x: 0, y: 0 });
const ac = avg(allyForms), fc = avg(foeForms);
const frontSep = Math.hypot(fc.x - ac.x, fc.y - ac.y);
ok(frontSep >= 600, `敌我前线阵线清晰对峙（初始间距 ${Math.round(frontSep)}px >= 600px）`);

// 推进若干帧战阵交锋，依然保持对峙距离，不会叠在一起
for (let i = 0; i < 30; i++) {
  for (const f of B.formations) tickFormation(f, g, 0.1, B.formations, SW.battleOrderNow());
}
const ac2 = avg(allyForms), fc2 = avg(foeForms);
const frontSep2 = Math.hypot(fc2.x - ac2.x, fc2.y - ac2.y);
ok(frontSep2 >= 240, `交锋推进后仍保持堂堂对峙间距（${Math.round(frontSep2)}px >= 240px）`);

// 核心 Bug 回归：把场上核心 Enemy 全杀光、清空 B.rf，但敌方百人战阵仍有战兵与护盾——战斗绝不能瞬间炸毁敌阵结束！
for (const e of [...B.foes]) g.combat.finish(e);
B.rf.length = 0;
SW.update(0.1);
SW.update(2.0);
const BAfter = (SW as any).battle;
const foeSoldiersLeft = BAfter?.formations.reduce((s: number, f: any) => s + (!f.ours && !f.collapsed ? f.soldiers : 0), 0) ?? 0;
ok(!!BAfter && foeSoldiersLeft > 0, `核心死光但敌阵尚存（${foeSoldiersLeft} 战兵）时不会瞬间炸阵结束战斗`);

// 清理战场
(SW as any).battle = null;

// 2) 名牌格式（门派·姓名·境界，无「友·」）、近景神识敌友标记、人群防叠字
const cv = createCanvas(1280, 720), ctx: any = cv.getContext('2d');
ctx.setTransform(1, 0, 0, 1, 640, 360);
const drawnTexts: string[] = [];
const drawnArcs: any[] = [];
const oldFillText = ctx.fillText.bind(ctx);
const oldArc = ctx.arc.bind(ctx);
ctx.fillText = (s: string, ...a: any[]) => { drawnTexts.push(s); return oldFillText(s, ...a); };
ctx.arc = (...a: any[]) => { drawnArcs.push(a); return oldArc(...a); };

const mkFakeUnit = (id: number, x: number, y: number, ally: boolean, sectName?: string) => ({
  id, x, y, name: `${sectName ? sectName + '·' : ''}修${id}`, shortName: `修${id}`, sectName,
  rankText: '筑基初期', dead: false, boss: id === 1, aggro: !ally, hp: 80, maxHp: 100,
  level: 20, ally, def: { kind: 'human' }, anim: { flying: false }, st: {},
});

const units = Array.from({ length: 12 }, (_, i) =>
  mkFakeUnit(i + 1, (i % 3) * 18, Math.floor(i / 3) * 6, i % 2 === 0, i % 2 === 0 ? '青霞谷' : '血煞宗'),
);
const fakeCombat: any = {
  game: { hero: { realm: 2, stage: 0 }, player: { x: 0, y: 0 }, life: { sense: { x: 0, y: 0, R: 1e6 } }, senseBurstT: 0 },
  units,
  lock: units[0],
  foe: { ultCharge: () => 0, ultFlash: 0 },
  texts: [],
};
drawCombatUI(ctx, fakeCombat, 0, 1);

ok(drawnTexts.every((t) => !t.startsWith('友·')), '名牌不再包含冗余「友·」前缀');
ok(drawnTexts.some((t) => t === '青霞谷·修1·筑基初期'), `名牌严格按「门派·姓名·境界」展示（实际：${drawnTexts.join(' | ')}）`);
ok(drawnTexts.length === units.length, `小规模战斗（<=24人）保留全部清晰名牌（${units.length} 人绘 ${drawnTexts.length} 个）`);
ok(drawnArcs.length >= 6, `近景为友方绘制神识内圈标记（arc ${drawnArcs.length} 次）`);

// 大规模混战（>24人）时自动防叠避让隐藏叠字名牌
const crowdedUnits = Array.from({ length: 30 }, (_, i) =>
  mkFakeUnit(100 + i, (i % 3) * 18, Math.floor(i / 3) * 6, i % 2 === 0, i % 2 === 0 ? '青霞谷' : '血煞宗'),
);
const crowdedTextsStart = drawnTexts.length;
drawCombatUI(ctx, { ...fakeCombat, units: crowdedUnits, lock: crowdedUnits[0] }, 0, 1);
const crowdedDrawn = drawnTexts.length - crowdedTextsStart;
ok(crowdedDrawn < crowdedUnits.length, `大规模混战（>24人）重叠时自动避让隐藏叠字名牌（${crowdedUnits.length} 人仅绘 ${crowdedDrawn} 个不重叠名牌）`);

// 3) NPC 名牌格式检查
const sampleNpc = g.npcs.list.find((n) => !!n.sect && n.realm >= 1);
if (sampleNpc) {
  const lbl = g.npcs.formatNpcLabel(sampleNpc);
  ok(lbl.includes('·') && !lbl.includes('〔'), `城镇/野外修士名牌格式为「门派·姓名·境界」：${lbl}`);
}

// 4) 远景缩略视角战争表现（兵棋军阵底盘 + 抗缩放旗牌，不画繁琐线框穹顶/小圆点）
{
  const { drawFormationGround, drawFormationOverlay, resetFormationOverlayFrame } = await import('../src/world/warformation');
  const f = allyForms[0];
  ok(!!f, '取得在阵战阵样本进行远近景渲染对比');
  let farBezier = 0, nearBezier = 0;
  let farTexts = 0;
  const origBez = ctx.bezierCurveTo.bind(ctx);
  const origFT = ctx.fillText.bind(ctx);
  ctx.bezierCurveTo = (...a: any[]) => { farBezier++; return origBez(...a); };
  ctx.fillText = (...a: any[]) => { farTexts++; return origFT(...a); };
  resetFormationOverlayFrame();
  drawFormationGround(ctx, f, 1.0, false, 0.14);
  drawFormationOverlay(ctx, f, 1.0, false, 0.14);
  ctx.bezierCurveTo = (...a: any[]) => { nearBezier++; return origBez(...a); };
  ctx.fillText = origFT;
  resetFormationOverlayFrame();
  drawFormationGround(ctx, f, 1.0, false, 1.0);
  drawFormationOverlay(ctx, f, 1.0, false, 1.0);
  ctx.bezierCurveTo = origBez;
  ok(farBezier === 0 && nearBezier > 0, `远景（z=0.14）收起繁琐护盾穹顶线框，近景保留（far=${farBezier}, near=${nearBezier}）`);
  ok(farTexts === 1, `远景（z=0.14）军阵旗牌仅绘制简洁单行兵牌（calls=${farTexts}）`);
}

console.log('ALL WAR FRONTLINE & READABILITY CHECKS PASSED');
process.exit(0);
