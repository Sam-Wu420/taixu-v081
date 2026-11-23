import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { drawCombatUI } from '../src/world/combatfx';
import {
  drawSenseMark,
  farSenseCellKey,
  resolveEnemyMarkKind,
  resolveMarkContext,
  resolveNpcMarkKind,
} from '../src/world/senseMarks';
import { setGuidanceFilter, clearGuidanceFilter } from '../src/world/guidanceFilter';
import { MY_SECT_ID } from '../src/data/sects';
import { ACTIVE_MAP } from '../src/data/world';

// 1. 8 类分类规则与伪装不泄露测试
const byId = new Map<string, any>([
  ['sect_disciple', { id: 'sect_disciple', sect: 'huangfeng', faction: 'sect', role: 'cultivator', favor: 0, grudge: 0, alive: true }],
  ['sect_elder', { id: 'sect_elder', sect: 'huangfeng', faction: 'sect', role: 'elder', title: '青霞谷长老', favor: 0, grudge: 0, alive: true }],
  ['my_elder', { id: 'my_elder', sect: MY_SECT_ID, faction: 'sect', role: 'cultivator', title: '自创宗门掌门', favor: 0, grudge: 0, alive: true }],
  ['friend_npc', { id: 'friend_npc', sect: 'qingxu', faction: 'sect', role: 'cultivator', favor: 45, grudge: 0, alive: true }],
  ['bond_npc', { id: 'bond_npc', faction: 'rogue', role: 'cultivator', bond: 'sworn', favor: 10, grudge: 0, alive: true }],
  ['beauty_npc', { id: 'beauty_npc', faction: 'rogue', role: 'female', beauty: 'nangong', favor: 0, grudge: 0, alive: true }],
  ['merchant_npc', { id: 'merchant_npc', faction: 'merchant', role: 'merchant', favor: 0, grudge: 0, alive: true }],
  ['evil_npc', { id: 'evil_npc', faction: 'demon', role: 'cultivator', favor: 0, grudge: 0, alive: true }],
  ['grudge_npc', { id: 'grudge_npc', faction: 'rogue', role: 'cultivator', favor: 0, grudge: 1, alive: true }],
  ['rogue_npc', { id: 'rogue_npc', faction: 'rogue', role: 'cultivator', favor: 0, grudge: 0, alive: true }],
]);

const gameMock: any = {
  day: 10,
  hero: { realm: 2, stage: 0 },
  player: { x: 0, y: 0 },
  detailSenseRadius: 2400,
  senseBurstT: 0,
  life: { sense: { x: 0, y: 0, R: 2400 }, vis: ({ x, y }: { x: number; y: number }) => Math.hypot(x, y) < 2400 ? 1 : 0 },
  ws: {
    sect: { id: 'huangfeng' },
    mySect: { name: '太虚门' },
    bounties: [{ id: 'b1', spawned: true, done: false, map: ACTIVE_MAP, until: 20 }],
  },
  happen: { isBountyRecognized: (e: any) => e.tag === 'bounty:b1' },
  npcs: { byId, active: new Map<string, any>(), focus: null },
};

const ctx = resolveMarkContext(gameMock);

assert.deepEqual(resolveNpcMarkKind({ d: byId.get('sect_disciple'), act: 'idle', ally: null, enemy: undefined }, ctx), { kind: 'sect', elder: false, priority: 50 });
assert.deepEqual(resolveNpcMarkKind({ d: byId.get('sect_elder'), act: 'idle', ally: null, enemy: undefined }, ctx), { kind: 'sect', elder: true, priority: 53 });
assert.deepEqual(resolveNpcMarkKind({ d: byId.get('my_elder'), act: 'idle', ally: null, enemy: undefined }, ctx), { kind: 'sect', elder: true, priority: 53 });
assert.equal(resolveNpcMarkKind({ d: byId.get('friend_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'ally');
assert.equal(resolveNpcMarkKind({ d: byId.get('bond_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'ally');
assert.equal(resolveNpcMarkKind({ d: byId.get('beauty_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'quest');
assert.equal(resolveNpcMarkKind({ d: byId.get('merchant_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'merchant');
assert.equal(resolveNpcMarkKind({ d: byId.get('rogue_npc'), act: 'idle', ally: null, enemy: undefined, life: { k: 'stall', dir: 0 } }, ctx).kind, 'merchant');
assert.equal(resolveNpcMarkKind({ d: byId.get('evil_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'evil');
assert.equal(resolveNpcMarkKind({ d: byId.get('grudge_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'hostile');
assert.equal(resolveNpcMarkKind({ d: byId.get('rogue_npc'), act: 'idle', ally: null, enemy: undefined }, ctx).kind, 'neutral');

// Combat 单位串联 npcId 保留原生身份，且未暴露邪恶/隐匿单位不提前泄密
const mkEnemy = (extra: any = {}) => ({
  x: 0, y: 0, name: '试', rankText: '筑基', dead: false, boss: false, aggro: false,
  hp: 100, maxHp: 100, level: 20, ally: false, def: { kind: 'human' }, anim: { flying: false }, st: {},
  ...extra,
});
assert.equal(resolveEnemyMarkKind(mkEnemy({ npcId: 'sect_elder' }), ctx).kind, 'sect');
assert.equal(resolveEnemyMarkKind(mkEnemy({ npcId: 'sect_elder' }), ctx).elder, true);
assert.equal(resolveEnemyMarkKind(mkEnemy({ npcId: 'friend_npc' }), ctx).kind, 'ally');
assert.equal(resolveEnemyMarkKind(mkEnemy({ npcId: 'merchant_npc' }), ctx).kind, 'merchant');
assert.equal(resolveEnemyMarkKind(mkEnemy({ tag: 'bounty:b1' }), ctx).kind, 'quest');
assert.equal(resolveEnemyMarkKind(mkEnemy({ tag: 'bounty:b1', aggro: true }), ctx).kind, 'hostile');
assert.equal(resolveEnemyMarkKind(mkEnemy({ def: { kind: 'human', evil: true } }), ctx).kind, 'evil');
assert.equal(resolveEnemyMarkKind(mkEnemy({ def: { kind: 'human', evil: true, hide: true } }), ctx).kind, 'neutral');
assert.equal(resolveEnemyMarkKind(mkEnemy({ def: { kind: 'beast' } }), ctx).kind, 'beast');
assert.equal(resolveEnemyMarkKind(mkEnemy({ def: { kind: 'beast' }, aggro: true }), ctx).kind, 'hostile');

// 2. Canvas 绘制：全 8 种标记均产生有效像素，且低缩放（z=0.04, z=0.02）NPC 与 Combat 标记均持续保留
const cv = createCanvas(800, 600);
const g = cv.getContext('2d') as any;
const kinds = ['hostile', 'ally', 'quest', 'sect', 'merchant', 'evil', 'beast', 'neutral'] as const;
for (let i = 0; i < kinds.length; i++) {
  g.clearRect(0, 0, 800, 600);
  drawSenseMark(g, 100, 100, 8, 2, kinds[i], { elder: kinds[i] === 'sect', boss: i === 0, locked: i === 1 });
  const img = g.getImageData(75, 75, 50, 50).data;
  let nonZero = 0;
  for (let p = 3; p < img.length; p += 4) if (img[p] > 0) nonZero++;
  assert.ok(nonZero > 20, `mark kind ${kinds[i]} should render visible pixels`);
}

// 3. 统一绘制路径测试：NpcWorld.active + Combat.units 在 z=0.04 下全部绘制在 uiCtx，不会消失
const npcEntries = [
  { id: 'n1', x: -1200, y: 0, d: byId.get('sect_elder') },
  { id: 'n2', x: -600, y: 0, d: byId.get('merchant_npc') },
  { id: 'n3', x: 600, y: 0, d: byId.get('beauty_npc') },
  { id: 'n4', x: 1200, y: 0, d: byId.get('evil_npc') },
];
for (const it of npcEntries) {
  gameMock.npcs.active.set(it.id, { d: it.d, st: { x: it.x, y: it.y, lift: 0 }, look: { height: 1 }, act: 'idle' });
}
const combatMock: any = {
  game: gameMock,
  units: [
    mkEnemy({ x: -1800, y: 0, def: { kind: 'beast' } }),
    mkEnemy({ x: 1800, y: 0, aggro: true }),
  ],
  lock: null,
  foe: { ultCharge: () => 0, ultFlash: 0 },
  texts: [],
};

const drawCalls: { kind: string; x: number }[] = [];
g.clearRect(0, 0, 800, 600);
g.setTransform(0.04, 0, 0, 0.04, 400, 300);
const origFillRect = g.fillRect.bind(g);
const origStroke = g.stroke.bind(g);
g.stroke = (...args: any[]) => {
  drawCalls.push({ kind: String(g.strokeStyle), x: 0 });
  return origStroke(...args);
};
drawCombatUI(g, combatMock, 0, 0.04);
g.stroke = origStroke;
g.fillRect = origFillRect;
// 4 NPC + 2 Combat = 6 个独立相隔 600+px（屏幕 24px > 12px 网格）的目标在 z=0.04 下全数保留
assert.ok(drawCalls.length >= 6, `expected >= 6 stroke marks at z=0.04, got ${drawCalls.length}`);

// 4. 屏幕网格拥挤防叠测试：同一个 12px 网格内只保留最高优先级代表（hostile 胜出），但 focus/locked 必定保留
assert.equal(farSenseCellKey(98, 98, 12), farSenseCellKey(101, 101, 12));
const crowdedCalls: string[] = [];
const g2 = createCanvas(800, 600).getContext('2d') as any;
g2.setTransform(0.02, 0, 0, 0.02, 400, 300);
const origS2 = g2.stroke.bind(g2);
g2.stroke = (...args: any[]) => { crowdedCalls.push(String(g2.strokeStyle)); return origS2(...args); };
const denseCombat: any = {
  game: {
    ...gameMock,
    npcs: { byId, active: new Map([['n_rogue', { d: byId.get('rogue_npc'), st: { x: 10, y: 0, lift: 0 }, look: { height: 1 }, act: 'idle' }]]), focus: null },
  },
  units: [
    mkEnemy({ x: 0, y: 0, def: { kind: 'human' } }),
    mkEnemy({ x: 20, y: 0, aggro: true }),
  ],
  lock: null,
  foe: { ultCharge: () => 0, ultFlash: 0 },
  texts: [],
};
drawCombatUI(g2, denseCombat, 0, 0.02);
g2.stroke = origS2;
// x=0,10,20 在 z=0.02 时全部落入同一个 12px 单元格，应只绘 1 个胜出标记（hostile）
assert.equal(crowdedCalls.length, 1);
assert.equal(crowdedCalls[0].toLowerCase(), '#ffe0ca');

// 5. 分类过滤：切到「机缘」时只保留 quest 类标记（含 beauty_npc）
const filterCalls: string[] = [];
const g3 = createCanvas(800, 600).getContext('2d') as any;
g3.setTransform(0.04, 0, 0, 0.04, 400, 300);
const origS3 = g3.stroke.bind(g3);
g3.stroke = (...args: any[]) => { filterCalls.push(String(g3.strokeStyle)); return origS3(...args); };
const selNone = () => false;
setGuidanceFilter(gameMock, '机缘', selNone);
drawCombatUI(g3, combatMock, 0, 0.04);
clearGuidanceFilter(gameMock, selNone);
g3.stroke = origS3;
assert.equal(filterCalls.length, 1);
assert.equal(filterCalls[0].toLowerCase(), '#fff5d6');

// 6. 低缩放高速平移抗闪烁：同一群 NPC 在 z=0.07 连续平移镜头时，胜出标记数量与坐标完全恒定
const panGame: any = {
  ...gameMock,
  npcs: {
    byId,
    focus: null,
    active: new Map([
      ['p1', { d: { ...byId.get('rogue_npc'), id: 'p1' }, st: { x: 0, y: 0, lift: 0 }, look: { height: 1 }, act: 'idle' }],
      ['p2', { d: { ...byId.get('rogue_npc'), id: 'p2' }, st: { x: 140, y: 20, lift: 0 }, look: { height: 1 }, act: 'idle' }], // ~9.9 CSS px at z=0.07
      ['p3', { d: { ...byId.get('sect_disciple'), id: 'p3' }, st: { x: 190, y: 30, lift: 0 }, look: { height: 1 }, act: 'idle' }], // ~13.4 CSS px from p1, higher priority
      ['p4', { d: { ...byId.get('merchant_npc'), id: 'p4' }, st: { x: 600, y: 120, lift: 0 }, look: { height: 1 }, act: 'idle' }],
    ]),
  },
};
const panCombat: any = { game: panGame, units: [], lock: null, foe: { ultCharge: () => 0, ultFlash: 0 }, texts: [] };
const baselineMarks: string[] = [];
for (const camX of [0, 17, 53, 97, 141, 219, 383]) {
  const gPan = createCanvas(1600, 900).getContext('2d') as any;
  gPan.setTransform(0.07, 0, 0, 0.07, 800 - camX * 0.07, 450);
  const drawn: string[] = [];
  const origArc = gPan.arc.bind(gPan);
  const origMoveTo = gPan.moveTo.bind(gPan);
  const origRect = gPan.rect.bind(gPan);
  gPan.arc = (x: number, y: number, ...rest: any[]) => { drawn.push(`arc:${Math.round(x)},${Math.round(y)}`); return origArc(x, y, ...rest); };
  gPan.moveTo = (x: number, y: number) => { drawn.push(`move:${Math.round(x)},${Math.round(y)}`); return origMoveTo(x, y); };
  gPan.rect = (x: number, y: number, w: number, h: number) => { drawn.push(`rect:${Math.round(x)},${Math.round(y)}`); return origRect(x, y, w, h); };
  drawCombatUI(gPan, panCombat, 0, 0.07);
  const sig = drawn.filter((s) => s.startsWith('arc:') || s.startsWith('rect:')).join('|');
  if (!baselineMarks.length) baselineMarks.push(sig);
  else assert.equal(sig, baselineMarks[0], `far NPC markers must stay identical across camera pan camX=${camX}`);
}

console.log('sense marks: 8 categories, npc-combat continuity, full-zoom persistence, pan-invariant dedup & guidance filter passed');
