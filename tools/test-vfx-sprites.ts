import assert from 'node:assert/strict';
import { register } from 'node:module';
import { Image } from '@napi-rs/canvas';
import { OrthographicCamera, Vector3 } from 'three';
import { createCanvas } from './env';
import { Batch, FLOATS, type HdProjection } from '../src/gl/batch';
import { VfxSprites } from '../src/gl/vfxsprites';

const imageHook = `
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function load(url, context, nextLoad) {
  if (url.includes('/src/assets/vfx/') && url.includes('?inline')) {
    const path = fileURLToPath(url.split('?')[0]);
    const data = 'data:image/webp;base64,' + readFileSync(path).toString('base64');
    return {format:'module',shortCircuit:true,source:'export default '+JSON.stringify(data)+';'};
  }
  return nextLoad(url,context);
}`;
register('data:text/javascript,' + encodeURIComponent(imageHook));
const imageLoads: Promise<void>[] = [];
class AssetImage extends Image {
  constructor() { super(); imageLoads.push(new Promise((resolve, reject) => { this.onload = () => resolve(); this.onerror = reject; })); }
  set src(value: string | Buffer) { super.src = typeof value === 'string' && value.startsWith('data:') ? Buffer.from(value.slice(value.indexOf(',') + 1), 'base64') : value; }
  get src() { return super.src; }
}
Object.assign(globalThis, {
  Image: AssetImage,
  window: { innerWidth: 640, innerHeight: 480, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { vfxImg, vfxProj, vfxColumn, vfxBurst, vfxRing } = await import('../src/gfx/vfxTex');
vfxImg('fireball_head'); await import('../src/gfx/vfxData'); await Promise.resolve();
for (const key of ['fireball_head', 'fireball_trail', 'thunder_blue_head', 'thunder_blue_burst', 'array_activate_ring', 'array_activate_burst']) assert.ok(vfxImg(key), `真实 ${key} 位图应创建`);
await Promise.all(imageLoads);
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrain = new Terrain(); terrain.build(); const game = new Game(terrain), combat = game.combat;
const B = new Batch(), atlas = {} as WebGLTexture;
const pages = new Map<WebGLTexture, HTMLCanvasElement>(), textures = new Map<HTMLCanvasElement, WebGLTexture>();
const stage = { batch: B, atlas, uploadStatic(canvas: HTMLCanvasElement): WebGLTexture {
  let tex = textures.get(canvas); if (!tex) { tex = {} as WebGLTexture; textures.set(canvas, tex); pages.set(tex, canvas); } return tex;
} };
const sprites = new VfxSprites(stage);
const W = 640, H = 480;
function reset() { combat.reset(); B.reset(W / 2, H / 2, 1, W, H, atlas); B.hd = null; }
function paint() {
  const c = createCanvas(W, H), g = c.getContext('2d');
  for (const segment of B.segs) {
    const source = segment.tex && pages.get(segment.tex); if (!source) continue;
    for (let i = segment.start; i < segment.start + segment.count; i += 6) {
      const a = i * FLOATS, b = (i + 1) * FLOATS, d = (i + 5) * FLOATS;
      g.save(); g.globalAlpha = B.data[a + 7];
      g.setTransform((B.data[b] - B.data[a]) / source.width, (B.data[b + 1] - B.data[a + 1]) / source.width,
        (B.data[d] - B.data[a]) / source.height, (B.data[d + 1] - B.data[a + 1]) / source.height, B.data[a], B.data[a + 1]);
      if (B.data[a + 2] > B.data[b + 2]) { g.translate(source.width, 0); g.scale(-1, 1); }
      g.drawImage(source as unknown as CanvasImageSource, 0, 0); g.restore();
    }
  }
  return g.getImageData(0, 0, W, H).data;
}
function compare(actual: Uint8ClampedArray, expected: Uint8ClampedArray, label: string) {
  let sum = 0, active = 0, delta = 0;
  for (let i = 0; i < actual.length; i++) { const diff = Math.abs(actual[i] - expected[i]); sum += diff; if (diff > 5) delta++; if (expected[i]) active++; }
  assert.ok(active > 100, `${label} 真实位图应画出像素`);
  const mean = sum / actual.length, changed = delta / active;
  assert.ok(mean < 0.08 && changed < 0.04, `${label}: mean=${mean}, ratio=${changed}`);
  console.log(`${label}: 平均通道差 ${mean.toFixed(4)}，变化通道比例 ${(changed * 100).toFixed(2)}%`);
}

reset(); game.player.x = 300; game.player.y = 340; game.player.st.lift = 120;
combat.projs.push({ fac: 'p', visual: { groundOffsetY: 46, elevation: 120 }, x: 305, y: 294, vx: 350, vy: 210, life: 0.5, max: 2, fx: 'fireball', color: '255,120,40', dmg: 0, realm: 1, stCh: 0, pierce: false, homing: false, hit: new Set(), r: 1, aoe: 0, size: 1, trail: [[245, 258], [280, 279]], lv: 0 });
sprites.draw(combat, 1.1); const proj = paint(), baseline = createCanvas(W, H), pg = baseline.getContext('2d');
const pr = combat.projs[0], len = Math.hypot(pr.trail[0][0] - pr.x, pr.trail[0][1] - pr.y);
assert.ok(vfxProj(pg as unknown as CanvasRenderingContext2D, 'fireball', pr.x, pr.y - pr.visual.elevation, Math.atan2(pr.vy, pr.vx), 74, len, 0.96, 1.1 + pr.x * 0.01));
compare(proj, pg.getImageData(0, 0, W, H).data, '火弹与拖尾');
const uploaded = textures.size;
B.reset(W / 2, H / 2, 1, W, H, atlas); sprites.draw(combat, 1.1);
assert.equal(textures.size, uploaded, '已上传的位图应复用原画布与纹理');

reset(); combat.vfx.push({ kind: 'strike', x: 320, y: 340, r: 110, t: 0.2, dur: 0.5, color: '160,210,255', fx: 'lightning', seed: 1.5 });
sprites.draw(combat, 0.2); const lightning = paint(), baseline2 = createCanvas(W, H), lg = baseline2.getContext('2d');
assert.ok(vfxColumn(lg as unknown as CanvasRenderingContext2D, 'thunder_blue_head', 320, 350, 460, 0.96, true));
assert.ok(vfxBurst(lg as unknown as CanvasRenderingContext2D, 'thunder_blue_burst', 320, 320, 99, 0.4, 0, 0.7));
compare(lightning, lg.getImageData(0, 0, W, H).data, '雷柱与爆发');

reset(); combat.fields.push({ x: 320, y: 240, r: 80, t: 0.2, dur: 1, fx: 'array', color: '255,220,100', dmg: 0, tick: 0, stCh: 0, lv: 0, realm: 1 });
sprites.draw(combat, 0.4); const array = paint(), baseline3 = createCanvas(W, H), ag = baseline3.getContext('2d');
ag.save(); ag.translate(320, 240); ag.scale(1, 0.55); assert.ok(vfxRing(ag as unknown as CanvasRenderingContext2D, 'array_activate_ring', 0, 0, 86.4, 0.8 * (0.2 / 0.3), 0.1)); ag.restore();
assert.ok(vfxBurst(ag as unknown as CanvasRenderingContext2D, 'array_activate_burst', 320, 240 - 80 * 0.17, 56, 0.2 / 0.6, 0, 1, 0.8));
compare(array, ag.getImageData(0, 0, W, H).data, '阵法与展开');

let projectedTrails = 0;
for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 3]) for (const zoom of [0.5, 1, 2]) for (const base of [0, 180]) for (const lift of [0, 120]) {
  reset();
  const pitch = Math.PI / 4, heightAt = (x: number, y: number) => base + x * 0.04 - y * 0.025;
  const target = new Vector3(300, heightAt(300, 340), 340), up = { x: Math.sin(yaw), y: -Math.cos(yaw) };
  const camera = new OrthographicCamera(-W / 2 / zoom, W / 2 / zoom, H / 2 / zoom, -H / 2 / zoom, 1, 40000);
  camera.position.set(target.x - up.x * Math.cos(pitch) * 20000, target.y + Math.sin(pitch) * 20000, target.z - up.y * Math.cos(pitch) * 20000);
  camera.up.set(0, 1, 0); camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  const screen = (x: number, y: number, h: number) => { const p = new Vector3(x, h, y).project(camera); return { x: (p.x + 1) * W / 2, y: (1 - p.y) * H / 2, depth: p.z }; };
  const o = screen(0, 0, 0), px = screen(1000, 0, 0), py = screen(0, 1000, 0), ph = screen(0, 0, 1);
  const hd: HdProjection = {
    affine: [(px.x - o.x) / 1000, (py.x - o.x) / 1000, o.x, (px.y - o.y) / 1000, (py.y - o.y) / 1000, o.y],
    heightAt, heightScale: o.y - ph.y, heightBoost: 1 / Math.cos(pitch), depthAt: (x, y, h) => screen(x, y, h).depth,
    groundBounds: () => ({ l: -10000, t: -10000, r: 10000, b: 10000 }),
  };
  B.reset(300, 340, zoom, W, H, atlas); B.hd = hd;
  const pr = { fac: 'p' as const, visual: { groundOffsetY: 46, elevation: lift }, x: 300, y: 294, vx: 100, vy: 80, life: 0.5, max: 2, fx: 'fireball', color: '255,120,40', dmg: 0, realm: 1, stCh: 0, pierce: false, homing: false, hit: new Set<number>(), r: 1, aoe: 0, size: 1, trail: [[80, 74], [300, 294]] as [number, number][], lv: 0 };
  combat.projs.push(pr); sprites.draw(combat, 0);
  assert.equal(B.n, 12, '应绘制真实贴图拖尾和弹头');
  const worldLength = Math.hypot(pr.trail[0][0] - pr.x, pr.trail[0][1] - pr.y), k = Math.min(260, worldLength) / worldLength;
  const tx = pr.x + (pr.trail[0][0] - pr.x) * k, ty = pr.y + (pr.trail[0][1] - pr.y) * k;
  const footY = pr.y + pr.visual.groundOffsetY, tailFootY = ty + pr.visual.groundOffsetY;
  const head = screen(pr.x, footY, heightAt(pr.x, footY) + (pr.visual.groundOffsetY + lift) * hd.heightBoost);
  const tail = screen(tx, tailFootY, heightAt(tx, tailFootY) + (pr.visual.groundOffsetY + lift) * hd.heightBoost);
  const dx = head.x - tail.x, dy = head.y - tail.y, distance = Math.hypot(dx, dy), dirX = dx / distance, dirY = dy / distance;
  const width = distance + 74 * 0.35 * zoom, center = -distance / 2 + 74 * 0.075 * zoom;
  const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.003, `${actual} != ${expected}`);
  close(B.data[FLOATS] - B.data[0], dirX * width);
  close(B.data[FLOATS + 1] - B.data[1], dirY * width);
  close((B.data[0] + B.data[FLOATS * 2]) / 2, head.x + dirX * center);
  close((B.data[1] + B.data[FLOATS * 2 + 1]) / 2, head.y + dirY * center);
  const headAngle = B.direction(pr.vx, pr.vy), headVertex = 6 * FLOATS;
  close(B.data[headVertex + FLOATS] - B.data[headVertex], Math.cos(headAngle) * 74 * zoom);
  close(B.data[headVertex + FLOATS + 1] - B.data[headVertex + 1], Math.sin(headAngle) * 74 * zoom);
  projectedTrails++;
}
console.log(`PASS 真实贴图拖尾与 Three 相机对照：${projectedTrails} 组 yaw/zoom/斜坡/飞行高度和世界长度上限`);

reset(); combat.vfx.push({ kind: 'strike', x: 320, y: 340, r: 110, t: 0.2, dur: 0.5, color: '160,210,255', fx: 'lightning', seed: 0 });
const hd: HdProjection = { affine: [0, -1, 700, 0.7, 0, 0], heightAt: () => 180, heightScale: 0.7, heightBoost: Math.SQRT2, depthAt: (x, y, h) => 0.7 + (x + y - h) / 100000, groundBounds: () => ({ l: -10000, t: -10000, r: 10000, b: 10000 }) };
B.hd = hd; sprites.draw(combat, 0.2);
assert.ok(B.n >= 12); for (let i = 0; i < B.n; i++) assert.notEqual(B.data[i * FLOATS + 8], -1, '关键贴图必须写入世界深度');
console.log('PASS 真实原图、Canvas 旧绘制与 Batch 像素对照；纹理缓存与 HD 深度');
