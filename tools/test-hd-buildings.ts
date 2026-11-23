// 程序化中式建筑：每处地点合成一个网格；屋顶是曲面（举折、翼角起翘）；宗门等级影响正殿大小；
// 有护山大阵的宗门生成光罩；缓存、换等级重建与释放。
import assert from 'node:assert/strict';
import { Box3, BufferGeometry, Mesh, Vector3 } from 'three';
import { ALL_LOCATIONS } from '../src/data/world';
import { getLayout, LOC_SCALE, type LocLayout } from '../src/gfx/building';
import { ArchBuilder } from '../src/hd2d/arch';
import { HdBuildings, canModelPiece } from '../src/hd2d/buildings';

const origin = { x: 1000, y: 2000 }, ground = 12;
const palette = { roof: '#4a5868', wall: '#ece4d0', pillar: '#8a2e24', trim: '#5a3a28', stone: '#bdb6a4', accent: '#c89a3a' };

// ---- 1. 屋顶：檐口在 y0，正脊在 y0 + H；举折（中段低于直线）；四个翼角高于檐口中点
{
  const builder = new ArchBuilder();
  builder.roof(0, 100, 0, 200, 120, 80, { color: palette.roof, trim: '#222222', gable: 0.5, lift: 30 });
  const geometry = builder.build(), position = geometry.getAttribute('position'), tile = geometry.getAttribute('aTile');
  let top = -Infinity, corner = -Infinity, eaveMid = Infinity, mid = 0, midCount = 0, roofVertices = 0;
  for (let i = 0; i < position.count; i++) {
    if (tile.getY(i) < 0.5) continue;   // 只看屋面（封边、正脊的瓦面坐标为 0）
    roofVertices++;
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    top = Math.max(top, y);
    if (Math.abs(Math.abs(x) - 200) < 0.01 && Math.abs(Math.abs(z) - 120) < 0.01) corner = Math.max(corner, y);
    if (Math.abs(x) < 0.01 && Math.abs(Math.abs(z) - 120) < 0.01) eaveMid = Math.min(eaveMid, y);
    if (Math.abs(x) < 20 && Math.abs(Math.abs(z) - 60) < 8) { mid += y; midCount++; }
  }
  assert.ok(roofVertices > 500, '屋面应细分成曲面');
  assert.ok(Math.abs(top - 180) < 0.5, `正脊高度 ${top}`);
  assert.ok(Math.abs(eaveMid - 100) < 0.5, `檐口高度 ${eaveMid}`);
  assert.ok(Math.abs(corner - 130) < 0.5, `翼角应起翘 30：${corner}`);
  assert.ok(midCount > 0 && mid / midCount < 100 + 80 * 0.5 - 4, `举折：屋面中段 ${mid / midCount} 应低于直线坡`);
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) assert.ok(Math.abs(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 1e-3);
}

// ---- 2. 各类构件都能生成，且落在给定范围内
{
  const builder = new ArchBuilder();
  builder.hall(0, 0, 0, 300, 160, 90, 70, palette, { tiers: 2, opening: 60 });
  const hall = builder.vertexCount;
  builder.pagoda(600, 0, 0, 100, 400, 5, palette);
  builder.pavilion(900, 0, 0, 80, 120, palette);
  builder.paifang(1200, 0, 0, 260, 200, palette);
  builder.wall(1500, 0, 0, 300, 60, 30, 'x', '#8e8a7e', palette.roof);
  const box = new Box3().setFromBufferAttribute(builder.build().getAttribute('position') as never);
  assert.ok(hall > 2000 && builder.vertexCount > hall * 1.5);
  assert.ok(box.min.y >= -0.01, '不应有低于地面的顶点');
  assert.ok(box.max.y > 400 && box.max.y < 520, `塔高 ${box.max.y}`);
}

// ---- 3. 真实宗门布局：一处地点一个网格；等级 3 比等级 1 更高大；护山大阵生成光罩
// 这里验的是老布局的通用宗门建筑（按等级放大主殿、重檐）；青霞谷新的占山布局另见 tools/test-grand-sect.ts
(globalThis as { __TAIXU_SECT?: string }).__TAIXU_SECT = 'old';
const sect = ALL_LOCATIONS.find(l => l.id === 'huangfeng')!;
const layout: LocLayout = getLayout(sect);
assert.ok(layout.pieces.some(canModelPiece), '青霞谷应有可建模的建筑');
assert.ok(layout.barrier, '青霞谷有护山大阵');
const size = (tier: number) => {
  const buildings = new HdBuildings();
  buildings.sync([{ id: layout.id, layout, ...origin, tier }], () => ground);
  buildings.group.updateMatrixWorld(true);
  assert.equal(buildings.group.children.length, 1);
  // P10 起一处地点按 2400 见方分块、各块一个网格（成片的城上千座院落不能一帧拼完）：这里量整处地点的外包框和总顶点
  const loc = buildings.group.children[0], meshes = loc.children as Mesh<BufferGeometry>[];
  assert.ok(meshes.length >= 1, '应生成网格');
  const box = new Box3().setFromObject(loc), extent = box.getSize(new Vector3());
  assert.ok(box.min.y >= ground - 0.01, '建筑应立在地面上');
  const vertices = meshes.reduce((n, m) => n + m.geometry.getAttribute('position').count, 0);
  return { buildings, height: box.max.y - ground, extent, vertices, mesh: meshes[0] };
};
const big = size(3), small = size(1), town = size(0);
// 等级放大的是殿堂（主殿放大、重檐、高台基）。自 2221d81（宗门加后山藏经阁七层宝塔）起，整处地点最高的是那座不随等级变的塔，
// 量整处地点的高度分不出等级；这里只拿殿堂单独排一遍来比
const hallsOnly = (tier: number) => { const b = new HdBuildings(), L2 = { ...layout, pieces: layout.pieces.filter(p => p.kind === 'hall') };
  b.sync([{ id: 'halls', layout: L2, ...origin, tier }], () => ground); b.group.updateMatrixWorld(true);
  const h = new Box3().setFromObject(b.group).max.y - ground; b.dispose(); return h; };
const bigHall = hallsOnly(3), smallHall = hallsOnly(1);
assert.ok(bigHall > smallHall * 1.2, `大宗门殿堂 ${bigHall} 应明显高于小门派 ${smallHall}`);
assert.equal(big.buildings.fx.children.length, 1, '宗门应有护山光罩');
assert.equal(town.buildings.fx.children.length, 0, '不是宗门时不生成光罩');
const dome = big.buildings.fx.children[0] as Mesh;
assert.ok(Math.abs(dome.scale.x - layout.barrier!.rx * LOC_SCALE) < 1e-6);

// ---- 4. 缓存：同一布局不重建；换等级重建；清空后释放
{
  const { buildings, mesh } = big;
  let disposed = 0; mesh.geometry.addEventListener('dispose', () => disposed++);
  buildings.sync([{ id: layout.id, layout, ...origin, tier: 3 }], () => ground);
  assert.equal(buildings.group.children[0].children[0], mesh, '同一布局应复用网格');
  buildings.update(1.5, origin.x, origin.y);
  buildings.sync([{ id: layout.id, layout, ...origin, tier: 2 }], () => ground);
  assert.equal(disposed, 1, '换等级应释放旧网格');
  assert.equal(buildings.fx.children.length, 1);
  buildings.sync([], () => ground);
  assert.equal(buildings.group.children[0].visible, false);
  assert.equal(buildings.fx.children[0].visible, false, '不在视野内时光罩一起隐藏');
  buildings.dispose();
  assert.equal(buildings.group.children.length, 0);
  assert.equal(buildings.fx.children.length, 0);
}
console.log(`PASS 程序化中式建筑：屋顶举折与起翘、五类构件、宗门等级（殿堂 大 ${Math.round(bigHall)} / 小 ${Math.round(smallHall)} 高，${big.vertices} 顶点）、护山光罩、缓存与释放`);
