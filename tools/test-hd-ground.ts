import './env';
import assert from 'node:assert/strict';
import { Box3, CanvasTexture, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Scene, ShaderMaterial, Vector2, Vector3, type Texture } from 'three';
import { ALL_LOCATIONS, WORLD_SCALE } from '../src/data/world';
import { getLayout, LOC_SCALE, setLayoutEnv } from '../src/gfx/building';
import { HdBuildings } from '../src/hd2d/buildings';
import { HdGround } from '../src/hd2d/scene';
import { CHUNK, Terrain } from '../src/world/terrain';
import { MOUNTAINS, SURFACE_MAX_HEIGHT } from '../src/world/surface';

const terrain = new Terrain();
terrain.build();
const heightAt = (x: number, y: number) => terrain.surfaceHeight(x, y);
const canvas = () => document.createElement('canvas');
const texture = new CanvasTexture(canvas());
const scene = new Scene();
const ground = new HdGround(scene, heightAt, texture, 2048, 2048, 4096);

const site = ALL_LOCATIONS.find(loc => loc.id === 'qixuan')!;
const zone = terrain.locZones.find(loc => loc.id === site.id)!;
const radius = Math.max(zone.rx, zone.ry) + 400;
const center = { x: site.x * WORLD_SCALE + Math.cos(1.57) * radius, y: site.y * WORLD_SCALE + Math.sin(1.57) * radius };
const cx = Math.floor(center.x / CHUNK), cy = Math.floor(center.y / CHUNK);
const chunks = [];
for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) chunks.push({ cx: x, cy: y, canvas: canvas() });
// 高山模式下新地块的网格分帧建（一帧最多 6 块，见 HdGround.sync）：第一帧建 6 块，第二帧补齐 9 块
ground.begin(center.x - 1600, center.y - 1600, 0.8);
ground.sync(chunks, CHUNK);
assert.equal(scene.children.length, MOUNTAINS ? 6 : 9, '一帧只建预算内的地块');
ground.begin(center.x - 1600, center.y - 1600, 0.8);
ground.sync(chunks, CHUNK);
scene.updateMatrixWorld(true);
assert.equal(scene.children.length, 9);
assert(scene.children.every(mesh => mesh.visible), '补建之后九块都可见');

const meshes = scene.children as Mesh[];
const decal = meshes[0].children[0] as Mesh;
const material = decal.material as ShaderMaterial;
assert.equal(material.uniforms.uMap.value, texture);
assert.equal(material.uniforms.uFraction.value, 0.5);
assert.deepEqual(material.uniforms.uOrigin.value.toArray(), [center.x - 1600, center.y - 1600]);
assert.deepEqual(material.uniforms.uScale.value.toArray(), [0.8 / 2048, 0.8 / 2048]);
assert.equal(material.depthTest, true);
assert.equal(material.depthWrite, false);
assert.equal(material.polygonOffsetFactor, -2);
assert.equal(material.polygonOffsetUnits, -2);

for (const mesh of meshes) {
  const overlay = mesh.children[0] as Mesh;
  assert.equal(overlay.geometry, mesh.geometry, '地贴与地形必须共用完全相同的三角面');
  assert.equal(overlay.material, material, '所有地贴应共用材质与工作纹理');
  assert.deepEqual(overlay.matrixWorld.elements, mesh.matrixWorld.elements, '地贴必须位于同一地表');
}

// 地形块边界的顶点和高度完全一致，透明图案不会因重叠而变深。
const west = meshes.find(mesh => mesh.position.x === cx * CHUNK + CHUNK / 2 && mesh.position.z === cy * CHUNK + CHUNK / 2)!;
const east = meshes.find(mesh => mesh.position.x === (cx + 1) * CHUNK + CHUNK / 2 && mesh.position.z === cy * CHUNK + CHUNK / 2)!;
const edge = (mesh: Mesh, x: number) => {
  const pos = mesh.geometry.getAttribute('position');
  return [...Array(pos.count).keys()].filter(i => pos.getX(i) === x).map(i => [pos.getZ(i), pos.getY(i)]);
};
assert.deepEqual(edge(west, CHUNK / 2), edge(east, -CHUNK / 2));

const ray = new Raycaster();
ray.layers.enable(1);   // 地贴在第 1 图层（阴影相机不画它）
let samples = 0, minHeight = Infinity, maxHeight = -Infinity;
for (let y = center.y - 600; y <= center.y + 600; y += 60) for (let x = center.x - 600; x <= center.x + 600; x += 60) {
  const mesh = meshes.find(m => m.position.x === Math.floor(x / CHUNK) * CHUNK + CHUNK / 2
    && m.position.z === Math.floor(y / CHUNK) * CHUNK + CHUNK / 2)!;
  ray.set(new Vector3(x, SURFACE_MAX_HEIGHT + 1000, y), new Vector3(0, -1, 0));
  const base = ray.intersectObject(mesh, false)[0];
  const overlay = ray.intersectObject(mesh.children[0], false)[0];
  assert(base && overlay);
  assert(Math.abs(base.distance - overlay.distance) < 1e-7, '坡面地贴与地形深度应一致');
  minHeight = Math.min(minHeight, base.point.y); maxHeight = Math.max(maxHeight, base.point.y); samples++;
}
assert(maxHeight - minHeight > 1, '测试应覆盖真实变化的地形');

const camera = new OrthographicCamera(-640, 640, 400, -400, 1, 40000);
const cameraHeight = heightAt(center.x, center.y), distance = 20000 / Math.SQRT2;
camera.position.set(center.x, cameraHeight + distance, center.y + distance);
camera.lookAt(center.x, cameraHeight, center.y);
camera.updateProjectionMatrix(); camera.updateMatrixWorld();
const overlays = meshes.map(mesh => mesh.children[0]);
let angledSamples = 0;
for (let sy = 40; sy < 800; sy += 40) for (let sx = 40; sx < 1280; sx += 40) {
  ray.setFromCamera(new Vector2(sx / 640 - 1, 1 - sy / 400), camera);
  const base = ray.intersectObjects(meshes, false)[0], overlay = ray.intersectObjects(overlays, false)[0];
  assert(base && overlay);
  assert(Math.abs(base.distance - overlay.distance) < 1e-7, '倾斜视角下地贴与地形深度应一致');
  angledSamples++;
}

let geometryDisposals = 0, textureDisposals = 0, groundMaterialDisposals = 0, decalMaterialDisposals = 0;
west.geometry.addEventListener('dispose', () => geometryDisposals++);
const westMaterial = west.material as ShaderMaterial;
(westMaterial.uniforms.uMap.value as Texture).addEventListener('dispose', () => textureDisposals++);
westMaterial.addEventListener('dispose', () => groundMaterialDisposals++);
material.addEventListener('dispose', () => decalMaterialDisposals++);
ground.begin(center.x - 1600, center.y - 1600, 0.8);
ground.sync(chunks, CHUNK);
assert.equal(west.geometry, (scene.children.find(mesh => mesh === west) as Mesh).geometry, '未变更的地形块应复用网格');
const replacement = chunks.map(ch => ch.cx === cx && ch.cy === cy ? { ...ch, canvas: canvas() } : ch);
ground.sync(replacement, CHUNK);
// 画布替换（预览换成正式）只换贴图：网格、法线和材质都留着
assert.deepEqual([geometryDisposals, textureDisposals, groundMaterialDisposals, decalMaterialDisposals], [0, 1, 0, 0]);
assert(scene.children.includes(west), '换画布不应重建网格');
ground.begin(center.x - 1600, center.y - 1600, 0.8);
ground.sync([], CHUNK);
assert(scene.children.every(mesh => !mesh.visible), '不在视野内的地块与地贴应一起隐藏');
ground.clear();
assert.equal(scene.children.length, 0);
assert.equal(decalMaterialDisposals, 0, '清空地形缓存应保留共用的地贴材质');
ground.dispose();
assert.equal(decalMaterialDisposals, 1);

// 原游戏住宅的屋顶仍应先于地贴被深度测试命中。
setLayoutEnv(null);
// 景州（jingzhou）成了街坊城，原游戏的 house 件已经没有了（城镇的房子现在是 'B' 件）：改取第一个有房子的城镇，
// 在它的房子上方往下打射线，找到第一个打中屋顶的点，再看那一点的地贴是否在屋顶之后
const town = ALL_LOCATIONS.find(l => l.type === 'town' && getLayout(l).pieces.some(piece => piece.kind === 'B' && !(piece.p as { prop?: boolean }).prop))!;
assert(town, '应有带房子的城镇');
const layout = getLayout(town);
const loc = { id: town.id, layout, x: town.x * WORLD_SCALE, y: town.y * WORLD_SCALE };
const buildingScene = new Scene(), buildingGround = new HdGround(buildingScene, heightAt, texture, 2048, 2048, 4096);
const buildings = new HdBuildings();
buildings.sync([loc], heightAt); buildings.group.updateMatrixWorld(true);
const box = new Box3().setFromObject(buildings.group);
assert(!box.isEmpty(), '城镇应建出房子');
let roofHit: ReturnType<Raycaster['intersectObject']>[number] | undefined, x = 0, y = 0;
for (let gz = box.min.z; gz <= box.max.z && !roofHit; gz += 16) for (let gx = box.min.x; gx <= box.max.x && !roofHit; gx += 16) {
  ray.set(new Vector3(gx, SURFACE_MAX_HEIGHT + 1000, gz), new Vector3(0, -1, 0));
  roofHit = ray.intersectObject(buildings.group, true)[0]; x = gx; y = gz;
}
buildingGround.begin(x - 1024, y - 1024, 1);
buildingGround.sync([{ cx: Math.floor(x / CHUNK), cy: Math.floor(y / CHUNK), canvas: canvas() }], CHUNK);
buildingScene.add(buildings.group); buildingScene.updateMatrixWorld(true);
ray.set(new Vector3(x, SURFACE_MAX_HEIGHT + 1000, y), new Vector3(0, -1, 0));
const groundHit = ray.intersectObject(buildingScene.children[0].children[0], false)[0];
assert(roofHit && groundHit && roofHit.distance < groundHit.distance, '建筑应遮挡身后的地贴');
buildings.dispose(); buildingGround.dispose(); texture.dispose();
console.log(`HD ground tests passed: ${samples} vertical and ${angledSamples} angled real slope samples, height span ${(maxHeight - minHeight).toFixed(2)}, shared chunk meshes and real building occlusion`);
