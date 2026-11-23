import './env';
import assert from 'node:assert/strict';
import { Matrix4, Texture, Vector3, Vector4 } from 'three';
import { HdGeometryBatch, type CharacterTriangles } from './hd-geometry-batch';
import type { HdItem } from '../src/hd2d/scene';

const boost = Math.SQRT2, batch = new HdGeometryBatch(new Texture(), new Texture(), () => 60);
const sprite: HdItem = { x: 30, y: 40, l: -2, r: 2, t: -10, b: 0,
  u0: 0.1, v0: 0.8, u1: 0.2, v1: 0.6, a: 0.5, air: false, seq: 0, k: 1, static: true };
const triangles: CharacterTriangles = { vertices: new Float32Array([
  -2, 0, 1, 0, 0, 1, 2, 0, 1, 0, 0, 1, 2, -10, 1, 0, 0, 1, -2, -10, 1, 0, 0, 1,
]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) };
const key = {};
const actor = { key, x: 30, y: 40, offsetX: 0, offsetY: 0, lift: 6, scale: 1, alpha: 1, seq: 1, revision: 1, triangles };
batch.begin(0, -1, 1, 0, boost); batch.addSprite(sprite); batch.addCharacter(actor); batch.end();
assert.equal(batch.mesh.instanceCount, 2);
const spriteMatrix = batch.mesh.getMatrixAt(0, new Matrix4());
const bottom = new Vector3(0, -0.5, 0).applyMatrix4(spriteMatrix);
const top = new Vector3(0, 0.5, 0).applyMatrix4(spriteMatrix);
assert(Math.abs(bottom.y - 60) < 1e-5); assert(Math.abs(top.y - (60 + 10 * boost)) < 1e-5);
assert.equal(spriteMatrix.elements[8], 1); assert.equal(spriteMatrix.elements[9], 0.5);
const uv = batch.mesh.getColorAt(0, new Vector4());
for (const [actual, expected] of [[uv.x, 0.1], [uv.y, 0.8], [uv.z, 0.2], [uv.w, 0.6]]) assert(Math.abs(actual - expected) < 1e-6);
const actorMatrix = batch.mesh.getMatrixAt(1, new Matrix4());
const actorTop = new Vector3(0, -10, 0).applyMatrix4(actorMatrix);
assert(Math.abs(actorTop.y - (60 + 16 * boost)) < 1e-5, '几何人物应使用地面高度和飞行高度');
assert.equal(actorMatrix.elements[8], 2);
const geometryId = batch.mesh.getGeometryIdAt(1), version = batch.mesh.geometry.getAttribute('position').version;
batch.begin(0, -1, 1, 0, boost); batch.addSprite(sprite); batch.addCharacter({ ...actor, x: 50 }); batch.end();
assert.equal(batch.mesh.getGeometryIdAt(1), geometryId);
assert.equal(batch.mesh.geometry.getAttribute('position').version, version, '人物移动时复用几何，只更新脚底变换');
assert.equal(batch.mesh.getMatrixAt(1, new Matrix4()).elements[12], 50);
batch.begin(0, -1, 1, 0, boost); batch.addCharacter({ ...actor, revision: 2 }); batch.end();
assert.equal(batch.mesh.getGeometryIdAt(1), geometryId);
assert(batch.mesh.geometry.getAttribute('position').version > version, 'Worker 返回新版本时更新几何');
assert.equal(batch.mesh.getVisibleAt(0), false, '消失的立板应隐藏');
batch.begin(0, -1, 1, 0, boost); batch.end();
assert.equal(batch.mesh.getVisibleAt(1), false, '消失的人物应隐藏');
batch.begin(0, -1, 1, 0, boost); batch.addCharacter(actor); batch.end();
assert.equal(batch.mesh.getVisibleAt(1), true, '重新出现时应恢复人物');
batch.dispose();

const waves = new HdGeometryBatch(new Texture(), new Texture(), () => 0), keys = Array.from({ length: 130 }, () => ({}));
const many: CharacterTriangles = { vertices: new Float32Array(1000 * 6), indices: new Uint32Array([0, 1, 2]) };
waves.begin(0, -1, 1, 0, boost);
for (const key of keys) waves.addCharacter({ ...actor, key, triangles: many });
waves.end();
assert.equal(waves.mesh.instanceCount, 130, '实例容量应随真实人物数量增长');
assert(waves.mesh.geometry.index!.array instanceof Uint32Array, '超过 65535 个顶点后应扩展索引位宽');
for (let frame = 0; frame < 121; frame++) {
  waves.begin(0, -1, 1, 0, boost); waves.addCharacter({ ...actor, key: keys[0], triangles: many }); waves.end();
}
assert.equal(waves.mesh.instanceCount, 1, '长期离屏的人物应释放几何槽');
waves.begin(0, -1, 1, 0, boost);
waves.addCharacter({ ...actor, key: keys[0], triangles: many });
for (let i = 1; i < keys.length; i++) waves.addCharacter({ ...actor, key: {}, triangles: many });
waves.end();
assert.equal(waves.mesh.instanceCount, 130, '清场后重新生成应复用或整理几何空间');
const larger: CharacterTriangles = { vertices: new Float32Array(2000 * 6), indices: many.indices };
waves.begin(0, -1, 1, 0, boost); waves.addCharacter({ ...actor, key: keys[0], revision: 2, triangles: larger }); waves.end();
assert.equal(waves.mesh.instanceCount, 130, '超出预留容量时只替换对应人物几何');
waves.dispose();
console.log('PASS 真实 Three 批次混排：UV、地表/飞行高度、位置更新、几何复用、扩容和连续波次');
