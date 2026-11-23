import assert from 'node:assert/strict';
import './env';
import { JSDOM } from 'jsdom';
import {
  WORLDS, WORLD_IDS, PLAYABLE_WORLD_IDS, isWorldId, isPlayableWorld, worldDef, worldOfMap,
  worldRealmCap, isAtWorldRealmCap, canAdvanceInWorld, worldLawSuppression, worldStatScale, worldSpeedScale,
  planeSpaceLaw, worldStoneScale, defaultMapOfWorld,
} from '../src/data/worldHierarchy';
import { ACTIVE_WORLD, MAP_SPECS, MAP_IDS, ALL_MAP_IDS, WORLD_SCALE, toMap, fromMap } from '../src/data/world';
import { REALMS, isAtRealmCap, canBreakRealm, smallBottleneck, realmCapLabel, realmDef, MAJOR_BREAKS, talentLevels, flyCruiseCap } from '../src/data/realms';
import { baseSenseRange, detailSenseRange, awarenessBaseRange } from '../src/world/senseRange';
import * as C from '../src/world/cultivation';
import { capRealm, canAdvance, pyramid } from '../src/world/demog';
import { newWorldState, ensureWorldSlice, recordWorldExit, elapsedDaysInWorld } from '../src/world/worldstate';
import { validateSaveForLoad, SAVE_VERSION } from '../src/world/saveGuard';
import { canCrossWorld } from '../src/world/travel';
import { ARTS } from '../src/data/arts';
import { SKILL_ICON, skillIconURL, skillFallbackIconURL } from '../src/gfx/skillIconData';
import { registerModItemIcon } from '../src/gfx/itemProcedural';
import { itemIconURL, itemFallbackIconURL } from '../src/ui/ItemIcon';

// 1. 世界注册表与三界归属
assert.deepEqual(WORLD_IDS, ['human', 'spirit', 'immortal']);
assert.deepEqual(PLAYABLE_WORLD_IDS, ['human', 'spirit', 'immortal']);
assert.equal(ACTIVE_WORLD, 'human');
assert.equal(isWorldId('human'), true);
assert.equal(isWorldId('spirit'), true);
assert.equal(isWorldId('void'), false);
assert.equal(isPlayableWorld('human'), true);
assert.equal(isPlayableWorld('spirit'), true);
assert.equal(isPlayableWorld('immortal'), true);
for (const mid of MAP_IDS) {
  assert.equal(MAP_SPECS[mid].worldId, 'human');
  assert.equal(worldOfMap(mid), 'human');
}
assert.equal(worldDef('spirit').returnCost?.lifeCost, 0);
assert.equal(worldDef('immortal').returnCost?.lifeCost, 0);

// 原生局部坐标直通验证（未来灵界/仙界地图无需强行映射到人界经纬）
MAP_SPECS.renjie.nativeOnly = true;
try {
  assert.deepEqual(toMap('renjie', 42, 77), [42, 77]);
  assert.deepEqual(fromMap('renjie', 42, 77), [42, 77]);
} finally {
  delete MAP_SPECS.renjie.nativeOnly;
}

// 2. 境界封顶去硬编码：人界止步化神初期 (5,0)，灵界/仙界允许继续突破
assert.deepEqual(worldRealmCap('human'), { maxRealm: 5, maxStage: 0, label: '化神初期' });
assert.equal(isAtWorldRealmCap(5, 0, 'human'), true);
assert.equal(isAtRealmCap(5, 0, 'human'), true);
assert.equal(canAdvanceInWorld(5, 0, 'human'), false);
assert.equal(canBreakRealm(5, 0, 'human'), false);
assert.equal(realmCapLabel('human'), '化神初期');

assert.equal(isAtRealmCap(5, 0, 'spirit'), false);
assert.equal(canAdvanceInWorld(5, 0, 'spirit'), true);
assert.equal(canBreakRealm(5, 0, 'spirit'), true);
assert.ok(smallBottleneck(4, 1, 'spirit'));
assert.equal(smallBottleneck(5, 0, 'human'), null);

// 法则压制：高界修士返下界按境界差折减
assert.equal(worldLawSuppression(5, 'human'), 1);
assert.ok(worldLawSuppression(6, 'human') < 1 && worldLawSuppression(6, 'human') >= 0.15);
assert.ok(worldLawSuppression(9, 'spirit') < 1);

// 3. 修炼与 NPC 边界按 worldId 生效
const hHuman = C.newHero();
hHuman.realm = 5; hHuman.stage = 0; hHuman.exp = 0;
assert.equal(C.gainExp(hHuman, 500, [], 'med', 'human'), 0);
assert.equal(C.bottleneck(hHuman, 'human'), 'none');
assert.equal(C.majorChance(hHuman, 1, 0, 'human'), 0);

const hSpirit = C.newHero();
hSpirit.realm = 5; hSpirit.stage = 0; hSpirit.exp = 0;
assert.ok(C.gainExp(hSpirit, 500, [], 'med', 'spirit') > 0);

const npcStub = { realm: 5, stage: 2, map: 'renjie' };
capRealm(npcStub, 'human');
assert.equal(npcStub.stage, 0);
assert.equal(canAdvance([], { id: 'n1', name: 'x', realm: 4, stage: 2, map: 'renjie' } as any), false);

// 4. 世界分区状态与存档校验
const ws = newWorldState();
assert.equal(ws.world, 'human');
assert.ok(ws.worlds?.human);
recordWorldExit(ws, 'human', 1000);
ensureWorldSlice(ws, 'spirit').flags = { visited: 1 };
assert.equal(elapsedDaysInWorld(ws, 'human', 1360), 360);
assert.equal(elapsedDaysInWorld(ws, 'immortal', 1360), 0);

const baseSave = {
  v: SAVE_VERSION,
  ws: WORLD_SCALE,
  map: 'renjie',
  p: { x: 1000, y: 1000 },
  hero: { age: 20, realm: 1, stage: 0, exp: 10, hp: 1, mp: 1, bag: [] },
  world: ws,
};
// 旧档无 worldId 保持兼容
assert.doesNotThrow(() => validateSaveForLoad(baseSave, MAP_IDS, WORLD_SCALE));
// 带 worldId: 'human' / 'spirit' 通过
assert.doesNotThrow(() => validateSaveForLoad({ ...baseSave, worldId: 'human' }, ALL_MAP_IDS, WORLD_SCALE));
assert.doesNotThrow(() => validateSaveForLoad({ ...baseSave, worldId: 'spirit', map: 'lingjie' }, ALL_MAP_IDS, WORLD_SCALE));
assert.doesNotThrow(() => validateSaveForLoad({ ...baseSave, worldId: 'immortal', map: 'xianjie' }, ALL_MAP_IDS, WORLD_SCALE));
assert.throws(() => validateSaveForLoad({ ...baseSave, worldId: 'spirit', map: 'renjie' }, ALL_MAP_IDS, WORLD_SCALE));
assert.throws(() => validateSaveForLoad({ ...baseSave, worldId: 'spirit', map: 'tiannan' }, ALL_MAP_IDS, WORLD_SCALE));
// 非法 worldId 或异常 world 分区拒绝加载
assert.throws(() => validateSaveForLoad({ ...baseSave, worldId: 'void' }, ALL_MAP_IDS, WORLD_SCALE));
assert.throws(() => validateSaveForLoad({ ...baseSave, world: { ...ws, worlds: 'bad' } }, ALL_MAP_IDS, WORLD_SCALE));
assert.throws(() => validateSaveForLoad({ ...baseSave, world: { ...ws, ascendedWorlds: ['void'] } }, ALL_MAP_IDS, WORLD_SCALE));

// 5. 跨界接口校验（人界化神初期可飞升灵界，元婴无法飞升；灵界大乘初期尚不足飞升仙界；高界逆返低界可行）
const hPreAscend = C.newHero();
hPreAscend.realm = 4; hPreAscend.stage = 2;
const gateLow = canCrossWorld(hPreAscend, 'human', 'spirit', ws, 100);
assert.equal(gateLow.ok, false);
assert.equal(gateLow.direction, 'ascend');
assert.ok(gateLow.reason && gateLow.reason.includes('灵界'));
const gateOk = canCrossWorld(hHuman, 'human', 'spirit', ws, 100);
assert.equal(gateOk.ok, true);
assert.equal(gateOk.direction, 'ascend');
const hSpiritEarly = C.newHero();
hSpiritEarly.realm = 8; hSpiritEarly.stage = 0;
assert.equal(canCrossWorld(hSpiritEarly, 'spirit', 'immortal', ws, 100).ok, false);
hSpiritEarly.stage = 2;
assert.equal(canCrossWorld(hSpiritEarly, 'spirit', 'immortal', ws, 100).ok, true);
const descGate = canCrossWorld(hHuman, 'spirit', 'human', ws, 100);
assert.equal(descGate.ok, true);
assert.equal(descGate.direction, 'descend');
assert.equal(descGate.returnCost?.lifeCost, 0);

// 6. 模组图标覆盖与程序回退分离一致性
const anyArtId = Object.keys(ARTS)[0];
assert.ok(anyArtId);
const prevSkill = SKILL_ICON[anyArtId];
SKILL_ICON[anyArtId] = 'https://invalid.example.invalid/mod-skill.png';
try {
  assert.equal(skillIconURL(anyArtId), 'https://invalid.example.invalid/mod-skill.png');
  const fbSkill = skillFallbackIconURL(anyArtId);
  assert.ok(fbSkill && fbSkill.startsWith('data:image/svg+xml;charset=utf-8,'));
} finally {
  if (prevSkill === undefined) delete SKILL_ICON[anyArtId];
  else SKILL_ICON[anyArtId] = prevSkill;
}
registerModItemIcon('mat_lingshi', 'https://invalid.example.invalid/mod-item.png');
try {
  assert.equal(itemIconURL('mat_lingshi'), 'https://invalid.example.invalid/mod-item.png');
  const fbItem = itemFallbackIconURL('mat_lingshi');
  assert.ok(fbItem && fbItem.startsWith('data:image/svg+xml;charset=utf-8,'));
} finally {
  registerModItemIcon('mat_lingshi', '');
}

// 7. React DOM 实测模组图标加载失败时的自动回退链（mod URL -> 程序图标 -> 字形/文字）
const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true, url: 'https://game.example' });
const w = dom.window as any;
(globalThis as any).window = w;
(globalThis as any).document = w.document;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { ItemGlyph } = await import('../src/ui/ItemIcon');
const { SkillIcon } = await import('../src/ui/SkillIcon');

const container = w.document.getElementById('root')!;
const root = createRoot(container);
const prevModSkill = SKILL_ICON[anyArtId];
SKILL_ICON[anyArtId] = 'https://invalid.example.invalid/broken-skill.png';
registerModItemIcon('mat_lingshi', 'https://invalid.example.invalid/broken-item.png');
try {
  await React.act(async () => {
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(ItemGlyph, { id: 'mat_lingshi', className: 'glyph' }),
        React.createElement(SkillIcon, { id: anyArtId, className: 'sk-glyph', fallbackText: '剑' }),
      ),
    );
  });
  let imgs = container.querySelectorAll('img');
  assert.equal(imgs.length, 2);
  assert.equal(imgs[0].getAttribute('src'), 'https://invalid.example.invalid/broken-item.png');
  assert.equal(imgs[1].getAttribute('src'), 'https://invalid.example.invalid/broken-skill.png');

  // 触发首次 onError -> 回退到程序生成 SVG
  await React.act(async () => {
    imgs[0].dispatchEvent(new w.Event('error'));
    imgs[1].dispatchEvent(new w.Event('error'));
  });
  imgs = container.querySelectorAll('img');
  assert.equal(imgs.length, 2);
  assert.ok(imgs[0].getAttribute('src')?.startsWith('data:image/svg+xml;charset=utf-8,'));
  assert.ok(imgs[1].getAttribute('src')?.startsWith('data:image/svg+xml;charset=utf-8,'));

  // 触发二次 onError -> 最终回退到字形 / 文字徽记 span
  await React.act(async () => {
    imgs[0].dispatchEvent(new w.Event('error'));
    imgs[1].dispatchEvent(new w.Event('error'));
  });
  assert.equal(container.querySelectorAll('img').length, 0);
  const spans = container.querySelectorAll('span');
  assert.equal(spans.length, 2);
  assert.equal(spans[1].textContent, '剑');
} finally {
  await React.act(async () => { root.unmount(); });
  if (prevModSkill === undefined) delete SKILL_ICON[anyArtId];
  else SKILL_ICON[anyArtId] = prevModSkill;
  registerModItemIcon('mat_lingshi', '');
}

// 8. 高境界逆返人界兼容：不倒扣小境界、法则压制生效、表外安全兜底、突破上限不锁死、跨界 NPC 读档不降级
{
  // 表外兜底：越界 ID 也不得抛错
  const hOut = C.newHero();
  hOut.realm = 99; hOut.stage = 0;
  assert.equal(realmDef(99).id, 12);
  assert.ok(C.maxLife(hOut) >= 2000);

  // 化神后期回人界触发 gainExp：仅阻断继续涨修为，绝不倒扣回初期
  const hLate = C.newHero();
  hLate.realm = 5; hLate.stage = 2; hLate.exp = 1000;
  assert.equal(C.gainExp(hLate, 5000, [], 'med', 'human'), 0);
  assert.equal(hLate.realm, 5);
  assert.equal(hLate.stage, 2);

  // 炼虚回人界：heroStats 受 worldLawSuppression(6, 'human') 压制，在灵界不受压制
  const hLianxu = C.newHero();
  hLianxu.realm = 6; hLianxu.stage = 1;
  const stHuman = C.heroStats(hLianxu, 'human');
  const stSpirit = C.heroStats(hLianxu, 'spirit');
  assert.ok(stHuman.atk < stSpirit.atk);
  assert.ok(Math.abs(stHuman.atk / stSpirit.atk - worldLawSuppression(6, 'human')) < 0.02);

  // 灵界内化神冲炼虚不再被 HUASHEN_CAP (0.10) 锁死，且逆天改命等级随 REALMS 自动延伸
  const h5 = C.newHero();
  h5.realm = 5; h5.stage = 2; h5.root = 'heaven';
  assert.ok(C.majorChance(h5, 3, 0, 'spirit') > C.HUASHEN_CAP);
  assert.ok(talentLevels().includes(27));

  // 本地灵石缩放按界域上限封顶、未知地图金字塔安全回落、WORLDS.maps 唯一真源自动注册地图归属
  assert.equal(worldStoneScale(8, 'human'), worldStoneScale(5, 'human'));
  assert.ok(worldStoneScale(8, 'spirit') > worldStoneScale(5, 'human'));
  assert.equal(defaultMapOfWorld('human'), 'renjie');
  assert.equal(pyramid('spirit_hub' as any, 4).length, 5);
  WORLDS.spirit.maps.push('spirit_hub');
  try {
    assert.equal(worldOfMap('spirit_hub'), 'spirit');
  } finally {
    WORLDS.spirit.maps.pop();
  }

  // NpcWorld.fromSave：人界原生非原著高阶按金字塔回落，而灵界出身随从保留真实境界
  const { NpcWorld } = await import('../src/world/npc');
  const nw = new NpcWorld({ rel: { genTies() {}, ensureTies() {} } } as any);
  nw.fromSave([
    { id: 'native_5', name: '本土化神', sex: 'm', role: 'cultivator', realm: 5, stage: 0, faction: 'rogue', home: 'huangfeng', pers: 'aloof', favor: 0, grudge: 0, met: false, alive: true, age: 800, life: 2000, x: 100, y: 100, tx: 100, ty: 100, goal: 'stay', until: 0, wealth: 0, seed: 1, map: 'renjie' },
    { id: 'spirit_6', name: '灵界来客', sex: 'f', role: 'cultivator', realm: 6, stage: 1, faction: 'rogue', home: 'huangfeng', pers: 'kind', favor: 60, grudge: 0, met: true, alive: true, age: 1200, life: 5000, x: 200, y: 200, tx: 200, ty: 200, goal: 'stay', until: 0, wealth: 0, seed: 2, map: 'renjie', originWorld: 'spirit' },
  ] as any);
  assert.equal(nw.byId.get('native_5')?.realm, 4);
  assert.equal(nw.byId.get('spirit_6')?.realm, 6);
  assert.equal(nw.byId.get('spirit_6')?.stage, 1);
}

// 9. 高级别空间压制系统：飞升压制（灵界/仙界同境界体魄/神识/遁速收敛）与神识大一圈控制
{
  // (a) 化神初期飞升灵界：同人同境界属性、神识内外圈、遁速均立即受到灵界空间法则压制
  const hHuashen = C.newHero();
  hHuashen.realm = 5; hHuashen.stage = 0;
  const stH = C.heroStats(hHuashen, 'human');
  const stS = C.heroStats(hHuashen, 'spirit');
  assert.equal(planeSpaceLaw('human').stat, 1);
  assert.ok(planeSpaceLaw('spirit').stat < 1 && planeSpaceLaw('immortal').stat < planeSpaceLaw('spirit').stat);
  assert.ok(Math.abs(stS.hp / stH.hp - planeSpaceLaw('spirit').stat) < 0.02);
  assert.ok(Math.abs(stS.atk / stH.atk - planeSpaceLaw('spirit').stat) < 0.02);
  assert.ok(Math.abs(stS.sense / stH.sense - planeSpaceLaw('spirit').stat) < 0.02);

  // 神识外圈、内圈、信息探察圈在飞升后收敛
  const outerH5 = baseSenseRange(stH.sense, 1, 380, 'human');
  const innerH5 = detailSenseRange(outerH5, 5, 'human');
  const outerS5 = baseSenseRange(stS.sense, 1, 380, 'spirit');
  const innerS5 = detailSenseRange(outerS5, 5, 'spirit');
  assert.ok(outerS5 < outerH5 * 0.8, `化神飞升灵界神识外圈应被压制 (${outerS5.toFixed(0)} < ${outerH5.toFixed(0)})`);
  assert.ok(innerS5 < innerH5 * 0.8, `化神飞升灵界神识内圈应被压制 (${innerS5.toFixed(0)} < ${innerH5.toFixed(0)})`);
  assert.ok(awarenessBaseRange(stS.sense, 1, 'spirit') < awarenessBaseRange(stH.sense, 1, 'human'));

  // (b) 灵界最高修为（大乘后期）vs 人界最高修为（化神初期）：外圈与内圈仅大一圈左右，不出现数值/视野膨胀
  const hDacheng = C.newHero();
  hDacheng.realm = 8; hDacheng.stage = 2;
  const stS8 = C.heroStats(hDacheng, 'spirit');
  const outerS8 = baseSenseRange(stS8.sense, 1, 380, 'spirit');
  const innerS8 = detailSenseRange(outerS8, 8, 'spirit');
  const outerRatio = outerS8 / outerH5;
  const innerRatio = innerS8 / innerH5;
  assert.ok(outerRatio > 1.12 && outerRatio < 1.38, `大乘外圈应只比人界化神大一圈左右，实际比=${outerRatio.toFixed(3)}`);
  assert.ok(innerRatio > 1.12 && innerRatio < 1.35, `大乘内圈应只比人界化神大一圈左右，实际比=${innerRatio.toFixed(3)}`);
  assert.ok(innerS8 < outerS8 * 0.88, '大乘内圈仍严格保留外圈余量');

  // (c) 大乘后期飞升仙界：再被仙界天道空间压制；至大罗金仙后期再大一圈
  const stI8 = C.heroStats(hDacheng, 'immortal');
  const outerI8 = baseSenseRange(stI8.sense, 1, 380, 'immortal');
  const innerI8 = detailSenseRange(outerI8, 8, 'immortal');
  assert.ok(stI8.atk < stS8.atk * 0.5);
  assert.ok(outerI8 < outerS8 && innerI8 < innerS8, '大乘初入仙界神识外/内圈再度受到仙界空间法则压制');
  const hDaluo = C.newHero();
  hDaluo.realm = 12; hDaluo.stage = 2;
  const stI12 = C.heroStats(hDaluo, 'immortal');
  const outerI12 = baseSenseRange(stI12.sense, 1, 380, 'immortal');
  const innerI12 = detailSenseRange(outerI12, 12, 'immortal');
  assert.ok(outerI12 > outerS8 * 1.05 && outerI12 < outerS8 * 1.3, '大罗巅峰外圈较灵界大乘再大一圈');
  assert.ok(innerI12 > innerS8 * 1.05 && innerI12 < innerS8 * 1.3, '大罗巅峰内圈较灵界大乘再大一圈');

  // (d) 遁速巡航上限与空间法则缩放单调且严格防膨胀
  assert.ok(worldSpeedScale(5, 'spirit') < worldSpeedScale(5, 'human'));
  assert.ok(worldSpeedScale(8, 'immortal') < worldSpeedScale(8, 'spirit'));
  assert.ok(flyCruiseCap(5, 1, 'spirit') < flyCruiseCap(5, 1, 'human'));
  assert.ok(flyCruiseCap(8, 1, 'spirit') > flyCruiseCap(5, 1, 'human'));
  assert.ok(flyCruiseCap(8, 1, 'spirit') < flyCruiseCap(5, 1, 'human') * 1.45, '灵界大乘巡航遁速稳步提升而不失控');
  assert.ok(worldStatScale(6, 'human') < worldStatScale(6, 'spirit'), '超界逆返下界叠加天道排斥');

  // (e) 同位面 Enemy 与 NpcWorld.senseOf 同步受高维空间压制，战斗与感知保持均衡
  const { Enemy } = await import('../src/world/combat');
  const { ENEMIES } = await import('../src/data/enemies');
  const { NpcWorld } = await import('../src/world/npc');
  const sampleDef = Object.values(ENEMIES)[0];
  const eHuman = new Enemy(sampleDef, 0, 0, 5, 0, false, 'human');
  const eSpirit = new Enemy(sampleDef, 0, 0, 5, 0, false, 'spirit');
  const eImmortal = new Enemy(sampleDef, 0, 0, 8, 2, false, 'immortal');
  const eSpiritPeak = new Enemy(sampleDef, 0, 0, 8, 2, false, 'spirit');
  assert.ok(Math.abs(eSpirit.atk / eHuman.atk - planeSpaceLaw('spirit').stat) < 0.02);
  assert.ok(Math.abs(eSpirit.speed / eHuman.speed - planeSpaceLaw('spirit').speed) < 0.02);
  assert.ok(eImmortal.maxHp < eSpiritPeak.maxHp && eImmortal.speed < eSpiritPeak.speed);
  const nwSpace = new NpcWorld({ rel: { genTies() {}, ensureTies() {} } } as any);
  WORLDS.spirit.maps.push('spirit_sense_test');
  try {
    const npcHumanSense = nwSpace.senseOf({ realm: 5, stage: 0, map: 'renjie' } as any);
    const npcSpiritSense = nwSpace.senseOf({ realm: 5, stage: 0, map: 'spirit_sense_test' } as any);
    const npcSpiritPeakSense = nwSpace.senseOf({ realm: 8, stage: 2, map: 'spirit_sense_test' } as any);
    assert.ok(npcSpiritSense < npcHumanSense * 0.8);
    assert.ok(npcSpiritPeakSense > npcHumanSense * 1.1 && npcSpiritPeakSense < npcHumanSense * 1.38);
  } finally {
    WORLDS.spirit.maps.pop();
  }
}

console.log('world-extension: world registry, realm caps, worldstate slices, saveGuard, travel gate & icon fallbacks passed');
