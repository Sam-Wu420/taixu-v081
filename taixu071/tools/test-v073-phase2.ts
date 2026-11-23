import assert from 'node:assert/strict';
import { createCanvas } from './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { applyFormationDamage, ensureFormationShield, tickFormation } = await import('../src/world/warformation');

let ok = 0;
function check(cond: unknown, label: string) {
  assert(cond, `FAIL: ${label}`);
  ok++;
  console.log('ok  ', label);
}

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(1280, 800); cv.clientWidth = 1280; cv.clientHeight = 800; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

const SW = g.sectwar;
SW.initHolds();

// 1. 护阵灵盾：未破盾不死兵、异流派多法术共振、跨两境溢碎直秒、暂不做斩首秒炸阵
const w = SW.declare('guiling', 'huangfeng', '测试护盾');
g.hero.realm = 2; g.hero.stage = 1;
(g.ws as any).sect = { id: 'huangfeng', rank: 2, contrib: 100, joined: g.day, lastPay: g.day, tasks: [], done: 0, v8: true };
w.side = 1;
(SW as any).march(w, { ma: 'wave', n: 120 });
const B = (SW as any).battle!;
const fFoe = B.formations.find((f: any) => !f.ours)!;
const sh = ensureFormationShield(fFoe);
const s0 = fFoe.soldiers;
const cut1 = applyFormationDamage(fFoe, sh.shieldMax * 0.4, 2, g, { school: '剑' });
check(cut1 === 0 && fFoe.soldiers === s0 && (fFoe.shield ?? 0) < sh.shieldMax, `未破盾吸收伤害不死兵（盾 ${Math.round(fFoe.shield!)}/${sh.shieldMax}）`);

// 异流派共振测试
const shBeforeCombo = fFoe.shield!;
applyFormationDamage(fFoe, 100, 2, g, { school: '火' });
const diffCombo = shBeforeCombo - fFoe.shield!;
check(diffCombo > 110, `异流派多法术共振触发增伤（削盾 ${diffCombo.toFixed(1)}）`);

// 跨两境（元婴=4 打 筑基=2）溢碎直秒士兵
const sBeforeCrush = fFoe.soldiers;
const crushCut = applyFormationDamage(fFoe, 6000, 4, g, { school: '雷' });
check(crushCut > 0 && fFoe.soldiers < sBeforeCrush, `跨两境碾压溢碎直穿兵阵（一击折兵 ${crushCut}）`);

// 2. 修复 combat.ts:2052 —— 长飞行弹道全路径判阵（不再只在 life < dt*2.5 时判定）
const fFresh = B.formations.find((f: any) => !f.ours && !f.collapsed) ?? fFoe;
fFresh.collapsed = false; fFresh.soldiers = 80; fFresh.shield = 200; fFresh.shieldMax = 200; fFresh.brokenT = 0;
fFresh.leader.x = fFresh.x + 500; // 让阵眼站到阵侧，飞剑直接射入战阵兵墙
for (const e of g.combat.enemies) if (Math.hypot(e.x - (fFresh.x + 60), e.y - fFresh.y) < 100) e.x = fFresh.x + 500;
g.combat.projs.push({
  x: fFresh.x + 60, y: fFresh.y, vx: 300, vy: 0,
  life: 0.9, max: 2.0, dmg: 120, fx: 'sword', color: '150,220,255',
  fac: 'p', realm: 2, stCh: 0, pierce: false, homing: false, hit: new Set(),
  r: 18, aoe: 0, school: '剑', size: 1, trail: [],
} as any);
g.combat.update(0.016);
check((fFresh.shield ?? 200) < 200, `飞行中后期弹道(life=0.9s)仍正常命中战阵护盾（余 ${Math.round(fFresh.shield!)}）`);

// 3. 阵眼队长阵亡暂不秒炸阵 & 全军令切换
fFresh.leader.dead = true;
SW.setBattleOrder('hold');
tickFormation(fFresh, g, 0.2, B.formations, SW.battleOrderNow());
check(!fFresh.collapsed && fFresh.soldiers > 0 && SW.hud()?.order === 'hold', '阵眼阵亡暂不炸阵，且全军令切换为固守阵脚生效');

// 4. 友军尚存时主角战败由同门抢回大营救治（免死档）
g.hero.hp = 0;
(g.combat as any).playerDown();
check(!g.hero.dead && g.hero.hp > 0 && !(SW as any).battle, '友军尚存时主角战败被同门抢回大营救治且免除死档');

// 5. 拒绝强制对等：小残兵宗门不强行凑齐敌方兵力
const smallSplit = (SW as any).commitSplit('qingxu', 'wave', false, 6, 400);
check(smallSplit.total <= SW.combatTotal('qingxu') && smallSplit.total !== 400, `非强制对等点兵按自身兵池决定（出兵 ${smallSplit.total} ≠ 敌方 400）`);

// 6. 因果人物常规战保底豁免
const rosId = g.roster.idOf('huangfeng', 2);
const npc = g.roster.materialize('huangfeng', 2);
if (npc) { npc.met = true; npc.favor = 50; }
const protectedFlag = (SW as any).isProtectedCausal('huangfeng', 2);
check(protectedFlag === true, `已相熟/因果关联门人（${rosId}）受常规战死亡保底豁免`);

console.log(`\nv0.73 Phase 2 专项验收全部通过（${ok} 项）`);
