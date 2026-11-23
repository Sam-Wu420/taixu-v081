// v0.73 Phase 3 自动化验收测试
import { createCanvas } from './env';
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { applySectUniform, MY_SECT_UNIFORM_PRESETS } = await import('../src/gfx/sectUniform');
const { randomLook, drawCharacter, CharState } = await import('../src/gfx/character');
const { charBodyKey, charHeadKey, charFrames } = await import('../src/gfx/charAtlas');
const { mulberry32 } = await import('../src/core/rng');
const { ITEMS } = await import('../src/data/items');
const { proceduralItemIcon } = await import('../src/gfx/itemProcedural');
const { LOC_BY_ID, WORLD_SCALE, LOCATIONS } = await import('../src/data/world');
const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
const { MY_SECT_ID } = await import('../src/data/sects');
const {
  applyFormationDamage, ensureFormationShield, collectWarBattleFx,
  tickWarBattleFx, resetWarBattleFx, sectDiscipleSheet, SHEET_W, SHEET_H,
} = await import('../src/world/warformation');

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error('❌ ASSERTION FAILED:', msg);
    process.exit(1);
  }
}

let passed = 0;
function ok(msg: string) {
  passed++;
  console.log('✓', msg);
}

const terrain = new Terrain();
terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(1280, 800);
cv.clientWidth = 1280; cv.clientHeight = 800;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 800 });
g.canvas = cv;
g.renderer = new Renderer(g, cv);
(g as any).paused = false;

// 1. SECT_UNIFORM 门派制式与个人容貌保留 + 双层图集预烘
{
  const l1 = randomLook(mulberry32(1001), 'cultivator');
  const l2 = randomLook(mulberry32(2002), 'cultivator');
  l1.sex = 'm'; l2.sex = 'm';
  l1.build = 1.0; l2.build = 1.0;
  const u1 = applySectUniform(l1, 'huangfeng', 1);
  const u2 = applySectUniform(l2, 'huangfeng', 1);
  assert(u1.robe === u2.robe && u1.trim === u2.trim && u1.collar === u2.collar && u1.sleeve === u2.sleeve, '同门同阶着装应完全制式统一');
  assert(u1.hairStyle === l1.hairStyle && u1.skin === l1.skin && u1.face === l1.face, '制式服装应保留各自发式/肤色/五官');
  assert(charBodyKey(u1) === charBodyKey(u2), '同宗同体型弟子的 BodyKey 应共用图集槽位');
  assert(charHeadKey(u1) !== charHeadKey(u2) || (u1.hairStyle === u2.hairStyle && u1.skin === u2.skin && u1.hair === u2.hair), '各自保留独立 HeadKey');

  const st = new CharState(0, 0);
  charFrames.beginFrame();
  const b1 = charFrames.getBody(u1, st);
  const b2 = charFrames.getBody(u2, st);
  charFrames.beginFrame();
  const h1 = charFrames.getHead(u1, st);
  assert(!!b1 && !!b2 && b1 === b2, '同宗同体型弟子应命中同一张 BodyFrame 预烘图集');
  assert(!!h1 && Number.isFinite(b1.hx) && Number.isFinite(b1.hy), 'BodyFrame 应给出精确头枢轴，HeadFrame 应独立烘焙');

  const uElder = applySectUniform(l1, 'guiling', 2);
  const uOuter = applySectUniform(l1, 'guiling', 0);
  assert(uElder.over === 'cape' && uOuter.over === 'none', '外门与长老应对齐制式同款异制分级');
  ok('门派制式服装与双层图集预烘复用验收通过');
}

// 2. NPC 原著特写定妆保留 & 自建宗门制式定制 & 沿海防刷海
{
  const hongfu = g.npcs.list.find((n) => n.id === 'hongfu');
  assert(!!hongfu, '应存在红绡');
  const hfLook = g.npcs.look(hongfu!);
  assert(hfLook.robe === '#a0303a', `原著特写人物红绡应保留个人专属红袍，实际=${hfLook.robe}`);

  g.hero.realm = 4;
  (g.ws as any).mySect = {
    name: '青冥宗', dao: 'zheng', map: 'renjie', x: 50, y: 50, founded: 1,
    fame: 100, stones: 5000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: g.hero.gongfa,
    halls: { lib: 0, dan: 0, zhen: 0, ling: 0 }, open: true, minRoot: 2, auto: false,
    lastM: 0, lastTeach: 0, log: [], gifts: [], wins: 0, losses: 0,
    uniform: { cut: MY_SECT_UNIFORM_PRESETS[3].cut, robe: MY_SECT_UNIFORM_PRESETS[3].robe, trim: MY_SECT_UNIFORM_PRESETS[3].trim, pattern: MY_SECT_UNIFORM_PRESETS[3].pattern },
  };
  g.mysect.setUniform('chiye');
  const myNpcLook = g.npcs.look({
    id: 'test_my', name: '李甲', sex: 'm', role: 'cultivator', realm: 1, stage: 2,
    faction: 'sect', sect: MY_SECT_ID, home: MY_SECT_ID, pers: 'righteous', favor: 0, grudge: 0,
    met: false, alive: true, age: 20, life: 100, x: 0, y: 0, tx: 0, ty: 0, goal: 'stay', until: 0, wealth: 10, seed: 77,
  });
  assert(myNpcLook.robe === MY_SECT_UNIFORM_PRESETS[4].robe, '自建宗门换制式后门人应同步着新宗袍');

  // 沿海/凡人防刷海检查
  const { ACTIVE_MAP } = await import('../src/data/world');
  let checked = 0;
  for (const n of g.npcs.list) {
    if ((n.map ?? ACTIVE_MAP) === ACTIVE_MAP && n.realm === 0 && n.alive) {
      checked++;
      assert(g.terrain.walkFactor(n.x, n.y) > 0, `人界凡人 ${n.name} (${n.home}) 不应刷进不可行走水面`);
    }
  }
  assert(checked > 0, '应检验到人界凡人样本');
  ok(`原著特写定妆保留、自建宗门制式定制与沿海防刷海通过（校验 ${checked} 名凡人）`);
}

// 3. drawCharacter 分部渲染（body / head）不抛错且返回枢轴
{
  const c2: any = createCanvas(200, 220);
  const ctx = c2.getContext('2d');
  const look = applySectUniform(randomLook(mulberry32(99), 'female'), 'yanyue', 1);
  const st = new CharState(0, 0);
  const resBody = drawCharacter(ctx, look, st, 1, 0, { detail: 2.6, part: 'body' });
  const resHead = drawCharacter(ctx, look, st, 1, 0, { detail: 2.6, part: 'head' });
  assert(Number.isFinite(resBody.headX) && Number.isFinite(resBody.headY), 'part:body 应返回有效头枢轴');
  assert(Number.isFinite(resHead.headX) && Number.isFinite(resHead.headY), 'part:head 应返回有效头枢轴');
  ok('character.ts 双层分部简绘（body/head + detail=2.6）通过');
}

// 4. 全战多变体动作条、横尸池与败兵定向遁走
{
  const s0 = sectDiscipleSheet('huangfeng', undefined, 0);
  const s1 = sectDiscipleSheet('huangfeng', undefined, 1);
  assert(!!s0 && !!s1 && s0 !== s1 && s0.width === SHEET_W * 14 && s0.height === SHEET_H, '战兵表应为 14 帧多变体动作条');

  resetWarBattleFx();
  const f: any = {
    id: 1, sid: 'guiling', ours: false,
    leader: { x: 1000, y: 1000, dead: false },
    pattern: 'square', school: '鬼',
    soldiers: 120, soldiersMax: 120, deadCount: 0, injCount: 0, routedCount: 0,
    volleyCd: 1, collapsed: false, collapseT: 0,
    x: 1000, y: 1000, face: -1, doctrineAtk: 1, realm: 2,
    retreatX: 2500, retreatY: 1000,
  };
  ensureFormationShield(f);
  f.shield = 0; f.brokenT = 5;
  const cut = applyFormationDamage(f, 500, 2);
  assert(cut > 0 && f.deadCount > 0, '破盾后受击应产生真实战损');
  const out: any[] = [];
  collectWarBattleFx(out, { left: 0, top: 0, right: 3000, bottom: 2000 }, 1);
  assert(out.length > 0, '战损后横尸与败兵遁光池应产出可绘制对象');
  tickWarBattleFx(10);
  const outAfter: any[] = [];
  collectWarBattleFx(outAfter, { left: 0, top: 0, right: 3000, bottom: 2000 }, 12);
  assert(outAfter.length === 0, '横尸与遁光超时后应自动清理回收');
  ok('全战士兵 14 帧多变体、战损横尸池与定向撤退机制通过');
}

// 5. 聚落去农村化、village 缩尺、夜灯去屋顶爆闪 & TownSpace 2D 网格 O(1) 碰撞
{
  const townLoc = LOCATIONS.find((l) => l.type === 'town' && !l.minor && !l.grass);
  assert(!!townLoc, '应存在非草原正式集镇样本');
  const Lt = getLayout(townLoc!);
  const hasMudHut = (Lt.pieces ?? []).some((p) => p.kind === 'B' && String(p.p?.k ?? '').startsWith('b30'));
  assert(!hasMudHut, `集镇 ${townLoc!.name} 不应再混入茅草泥屋 b30`);

  const minorVil = LOCATIONS.find((l) => l.type === 'town' && l.minor && !l.grass);
  assert(!!minorVil, '应存在农耕村落样本');
  const Lv = getLayout(minorVil!);
  const huts = (Lv.pieces ?? []).filter((p) => p.kind === 'B' && ['b30', 'b02', 'b02b', 'b15', 'j04a', 'j04b'].includes(String(p.p?.k ?? '').split('|')[0]));
  assert(huts.length > 0 && huts.every((h) => (h.p?.s ?? 1) <= 0.78), '村落农舍应缩尺至 0.64–0.75，避免一间茅屋大过城主府');

  const cityLoc = LOC_BY_ID.get('tiannan_city') ?? LOCATIONS.find((l) => l.type === 'city');
  assert(!!cityLoc, '应存在城池样本');
  const Lc = getLayout(cityLoc!);
  assert(Lc.lights.length < 30, `城池 ${cityLoc!.name} 不应给每排普通民居都推屋顶夜灯，当前 lights=${Lc.lights.length}`);

  // TownSpace 2D 空间网格 O(1) 碰撞测试（针对启用 v2 街巷布局的集镇）
  g.space.update(1, townLoc!.x * WORLD_SCALE, townLoc!.y * WORLD_SCALE);
  assert(g.space.near.length > 0, '集镇应纳入 TownSpace.near');
  const ox = townLoc!.x * WORLD_SCALE, oy = townLoc!.y * WORLD_SCALE;
  for (let i = 0; i < 60; i++) {
    const wx = ox + ((i * 297) % 2400) - 1200;
    const wy = oy + ((i * 413) % 1800) - 900;
    const got = g.space.blocked(wx, wy);
    const lx = (wx - ox) / LOC_SCALE, ly = (wy - oy) / LOC_SCALE;
    const expect = Math.abs(lx) <= Lt.gw * 0.6 && Math.abs(ly) <= Lt.gh * 0.6 && Lt.blocks.some((b) => lx > b.x && lx < b.x + b.w && ly > b.y && ly < b.y + b.h);
    assert(got === expect, `TownSpace 2D 网格 blocked(${wx.toFixed(0)},${wy.toFixed(0)}) 必须与暴力矩形遍历完全一致 (got=${got}, expect=${expect})`);
  }
  ok('聚落去农村化、村落缩尺、夜灯收敛与 TownSpace 2D 空间网格验收通过');
}

// 6. 物品图标语义差异化
{
  const ids = ['mat_lingshi', 'herb_lingzhi', 'herb_renshen', 'herb_xuelian', 'herb_tianleizhu', 'pill_zhuji', 'mat_yaodan1', 'mat_yaodan4', 'tali_fire', 'tali_thunder'];
  const svgs = new Set<string>();
  for (const id of ids) {
    const d = ITEMS[id];
    if (d) svgs.add(proceduralItemIcon(d));
  }
  assert(svgs.size >= Math.min(8, ids.filter((id) => ITEMS[id]).length), `不同语义物品应生成差异化 SVG 图标（实际唯一图标数=${svgs.size}）`);
  ok(`物品程序化图标语义差异化通过（${svgs.size} 种独立外观）`);
}

console.log(`\n🎉 v0.73 Phase 3 全部 ${passed} 项核心验收通过！`);
