import {
  BatchedMesh, BufferAttribute, BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4,
  ShaderMaterial, Sphere, type Texture, Vector3, Vector4,
} from 'three';
import type { HdItem } from '../src/hd2d/scene';
import { prof } from '../src/core/prof';

export interface CharacterTriangles {
  /** x、y、预乘 r、g、b、a，与人物几何 Worker 的输出一致。 */
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface CharacterGeometryLayer {
  kind: 'geometry';
  key: object;
  offsetX: number; offsetY: number; lift: number; scale: number; alpha: number;
  revision: number; triangles: CharacterTriangles;
}

export interface GeometryCharacter extends Omit<CharacterGeometryLayer, 'kind'> {
  x: number; y: number; seq: number;
}

type Actor = { geometry: number; instance: number; revision: number; seen: number; vertices: number; indices: number };
type SortEntry = { index: number; start: number; count: number; z: number };
type Order = { depth: number; seq: number };

const VS = `
#include <batching_pars_vertex>
attribute vec4 aTint;
varying vec4 vTint; varying vec2 vUv; varying float vMode; varying float vAlpha;
void main() {
  #include <batching_vertex>
  vec4 coords = getBatchingColor(getIndirectIndex(gl_DrawID));
  vec4 w = batchingMatrix * vec4(position.xy, 0.0, 1.0);
  vUv = vec2(mix(coords.x, coords.z, uv.x), mix(coords.w, coords.y, uv.y));
  vTint = aTint; vMode = batchingMatrix[2][0]; vAlpha = batchingMatrix[2][1];
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = `
uniform sampler2D uMap; uniform sampler2D uStatic;
varying vec4 vTint; varying vec2 vUv; varying float vMode; varying float vAlpha;
void main() {
  if (vMode > 1.5) {
    vec4 c = vTint * vAlpha;
    if (c.a < 0.04) discard;
    gl_FragColor = c;
  } else {
    vec4 c = vMode > 0.5 ? texture2D(uStatic, vUv) : texture2D(uMap, vUv);
    float a = c.a * vAlpha;
    if (a < 0.04) discard;
    gl_FragColor = vec4(c.rgb * a, a);
  }
}`;

/** 将贴图立板和不同人物几何按同一深度顺序提交。 */
export class HdGeometryBatch {
  readonly mesh: BatchedMesh;
  private readonly material: ShaderMaterial;
  private readonly quad: number;
  private readonly actors = new Map<object, Actor>();
  private readonly sprites: number[] = [];
  private readonly order = new Map<number, Order>();
  private readonly matrix = new Matrix4();
  private readonly uv = new Vector4();
  private count = 0;
  private frame = 0;
  private upX = 0; private upY = -1; private rightX = 1; private rightZ = 0; private boost = 1;

  constructor(work: Texture, stationary: Texture, private readonly heightAt: (x: number, y: number) => number) {
    this.material = new ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true,
      premultipliedAlpha: true, depthWrite: true, depthTest: true, side: DoubleSide,
      uniforms: { uMap: { value: work }, uStatic: { value: stationary } } });
    this.mesh = new BatchedMesh(128, 8192, 16384, this.material);
    this.mesh.frustumCulled = false; this.mesh.perObjectFrustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.setCustomSort(list => {
      // Three 的批次列表带有实例 id，但 0.187 的类型声明漏写了它。
      (list as SortEntry[]).sort((a, b) => {
        const aa = this.order.get(a.index)!, bb = this.order.get(b.index)!;
        return bb.depth - aa.depth || aa.seq - bb.seq;
      });
    });
    const quad = new BufferGeometry();
    quad.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    quad.setAttribute('aTint', new Float32BufferAttribute(new Float32Array(16).fill(1), 4));
    quad.setIndex([0, 1, 2, 0, 2, 3]); quad.boundingSphere = new Sphere(new Vector3(), 0);
    this.quad = this.mesh.addGeometry(quad); quad.dispose();
  }

  begin(upX: number, upY: number, rightX: number, rightZ: number, boost: number): void {
    this.frame++; this.count = 0;
    this.upX = upX; this.upY = upY; this.rightX = rightX; this.rightZ = rightZ; this.boost = boost;
  }

  setStaticTexture(texture: Texture): void { this.material.uniforms.uStatic.value = texture; }

  addSprite(item: HdItem): void {
    const id = this.sprites[this.count] ?? this.newSprite();
    this.count++; this.mesh.setVisibleAt(id, true);
    const w = (item.r - item.l) * item.k, h = (item.b - item.t) * item.k;
    const dx = (item.l + item.r) * item.k * 0.5, dy = (item.t + item.b) * item.k * 0.5;
    this.matrix.set(this.rightX * w, 0, item.static ? 1 : 0, item.x + this.rightX * dx,
      0, h * this.boost, item.a, this.heightAt(item.x, item.y) - dy * this.boost,
      this.rightZ * w, 0, 1, item.y + this.rightZ * dx, 0, 0, 0, 1);
    this.mesh.setMatrixAt(id, this.matrix);
    this.mesh.setColorAt(id, this.uv.set(item.u0, item.v0, item.u1, item.v1));
    this.order.set(id, { depth: item.x * this.upX + item.y * this.upY, seq: item.seq });
  }

  addCharacter(item: GeometryCharacter): void {
    let actor = this.actors.get(item.key);
    if (!actor || actor.revision !== item.revision) {
      const start = prof.on ? performance.now() : 0;
      actor = this.updateCharacter(item, actor);
      if (prof.on) prof.add('R·人物几何更新入批', start);
    }
    actor.seen = this.frame; this.mesh.setVisibleAt(actor.instance, true);
    this.matrix.set(this.rightX * item.scale, 0, 2, item.x + this.rightX * item.offsetX,
      0, -this.boost * item.scale, item.alpha, this.heightAt(item.x, item.y) + (item.lift - item.offsetY) * this.boost,
      this.rightZ * item.scale, 0, 1, item.y + this.rightZ * item.offsetX, 0, 0, 0, 1);
    this.mesh.setMatrixAt(actor.instance, this.matrix);
    this.order.set(actor.instance, { depth: item.x * this.upX + item.y * this.upY, seq: item.seq });
  }

  end(): void {
    for (let i = this.count; i < this.sprites.length; i++) this.mesh.setVisibleAt(this.sprites[i], false);
    for (const [key, actor] of this.actors) if (actor.seen !== this.frame) {
      this.mesh.setVisibleAt(actor.instance, false);
      if (this.frame - actor.seen > 120) {
        this.mesh.deleteGeometry(actor.geometry); this.actors.delete(key); this.order.delete(actor.instance);
      }
    }
  }

  dispose(): void { this.mesh.dispose(); this.material.dispose(); this.actors.clear(); this.order.clear(); }

  private newSprite(): number {
    this.ensureInstance();
    const id = this.mesh.addInstance(this.quad); this.sprites.push(id);
    return id;
  }

  private updateCharacter(item: GeometryCharacter, actor: Actor | undefined): Actor {
    const { vertices, indices } = item.triangles, n = vertices.length / 6;
    const positions = new Float32Array(n * 3), colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const v = i * 6, p = i * 3, c = i * 4;
      positions[p] = vertices[v]; positions[p + 1] = vertices[v + 1];
      colors[c] = vertices[v + 2]; colors[c + 1] = vertices[v + 3]; colors[c + 2] = vertices[v + 4]; colors[c + 3] = vertices[v + 5];
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aTint', new BufferAttribute(colors, 4));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
    geometry.setIndex(new BufferAttribute(indices, 1)); geometry.boundingSphere = new Sphere(new Vector3(), 0);
    if (actor && (n > actor.vertices || indices.length > actor.indices)) {
      this.mesh.deleteGeometry(actor.geometry); this.order.delete(actor.instance); actor = undefined;
    }
    if (actor) {
      this.mesh.setGeometryAt(actor.geometry, geometry); actor.revision = item.revision;
    } else {
      const reservedVertices = Math.ceil(n * 1.5), reservedIndices = Math.ceil(indices.length * 1.5);
      this.ensureGeometry(reservedVertices, reservedIndices); this.ensureInstance();
      const id = this.mesh.addGeometry(geometry, reservedVertices, reservedIndices), instance = this.mesh.addInstance(id);
      this.mesh.setColorAt(instance, this.uv.set(0, 0, 1, 1));
      actor = { geometry: id, instance, revision: item.revision, seen: this.frame, vertices: reservedVertices, indices: reservedIndices };
      this.actors.set(item.key, actor);
    }
    geometry.dispose();
    return actor;
  }

  private ensureInstance(): void {
    if (this.mesh.instanceCount === this.mesh.maxInstanceCount) this.mesh.setInstanceCount(this.mesh.maxInstanceCount * 2);
  }

  private ensureGeometry(vertices: number, indices: number): void {
    if (this.mesh.unusedVertexCount >= vertices && this.mesh.unusedIndexCount >= indices) return;
    this.mesh.optimize();
    if (this.mesh.unusedVertexCount >= vertices && this.mesh.unusedIndexCount >= indices) return;
    const v = this.mesh.geometry.getAttribute('position').count, i = this.mesh.geometry.index!.count;
    this.mesh.setGeometrySize(Math.max(v * 2, v + vertices), Math.max(i * 2, i + indices));
  }
}
