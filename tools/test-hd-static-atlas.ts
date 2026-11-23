import './env';
import assert from 'node:assert/strict';
import { InstancedBufferAttribute, Matrix4, OrthographicCamera, Raycaster, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { Drawable } from '../src/world/life';
import type { StaticSprite } from '../src/hd2d/staticAtlas';
import { BitmapFrame } from '../src/gfx/bitmap-frame';

const { HdStaticAtlas } = await import('../src/hd2d/staticAtlas');
const { HdScene } = await import('../src/hd2d/scene');
const { Renderer } = await import('../src/world/render');
const { Terrain, CHUNK } = await import('../src/world/terrain');
const { ALL_LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { getLayout, renderPiece, setLayoutEnv } = await import('../src/gfx/building');
const { hdBox } = await import('../src/hd2d/boxes');

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
const solid = (color: string) => {
  const c = canvas(6, 6), g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, 6, 6); return c;
};

const atlas = new HdStaticAtlas(8);
assert.equal(atlas.bytes, 16 * 16 * 4);
atlas.begin();
const pictures = ['red', 'green', 'blue', 'white', 'yellow'].map(solid);
const cells = pictures.slice(0, 4).map(image => atlas.get(image)!);
const version = atlas.texture.version;
assert.equal(atlas.get(pictures[0]), cells[0], '相同原画布应直接命中');
assert.equal(atlas.texture.version, version, '命中不能触发新的纹理上传');
assert.equal(atlas.get(pictures[4]), null, '预算已满时应使用动态回退');
for (let i = 0; i < 121; i++) atlas.begin();
const replacement = atlas.get(pictures[4])!;
assert.deepEqual(replacement, cells[0], '久未使用的页可重新分配');
assert.notDeepEqual(atlas.get(pictures[0]), cells[0], '旧页内容不能被误认作仍然有效');
atlas.dispose();

const mutable = solid('red'), dynamicAtlas = new HdStaticAtlas(32);
dynamicAtlas.begin();
const mutableCell = dynamicAtlas.get(mutable, 1)!;
const uploaded: { source: HTMLCanvasElement; x: number; y: number }[] = [];
let initialUploads = 0;
const fakeRenderer = {
  initTexture() { initialUploads++; },
  copyTextureToTexture(source: { image: HTMLCanvasElement }, _target: unknown, _region: null, position: Vector2) {
    uploaded.push({ source: source.image, x: position.x, y: position.y });
  },
} as never;
dynamicAtlas.flush(fakeRenderer);
assert.equal(initialUploads, 1); assert.equal(uploaded.length, 0);
const firstVersion = dynamicAtlas.texture.version;
const mg = mutable.getContext('2d')!; mg.clearRect(0, 0, mutable.width, mutable.height); mg.fillStyle = 'blue'; mg.fillRect(0, 0, 6, 6);
assert.equal(dynamicAtlas.get(mutable, 1), mutableCell);
assert.equal(dynamicAtlas.texture.version, firstVersion, '未更新 revision 的画布不应重复上传');
assert.equal(dynamicAtlas.get(mutable, 2), mutableCell, '内容变更应保留稳定槽位置');
const secondMutable = solid('white'); dynamicAtlas.get(secondMutable, 1);
dynamicAtlas.flush(fakeRenderer);
assert.equal(dynamicAtlas.texture.version, firstVersion, '更新单个槽位不能触发整图上传');
assert.deepEqual(uploaded, [{ source: mutable, x: 1, y: 57 }, { source: secondMutable, x: 9, y: 57 }]);
const mx = Math.floor((mutableCell.u0 + mutableCell.u1) * dynamicAtlas.canvas.width / 2);
const my = Math.floor((1 - (mutableCell.v0 + mutableCell.v1) / 2) * dynamicAtlas.canvas.height);
assert.deepEqual([...dynamicAtlas.canvas.getContext('2d')!.getImageData(mx, my, 1, 1).data], [255, 0, 0, 255],
  '分块上传时不应重复绘制图集备份画布');
dynamicAtlas.snapshot();
assert.deepEqual([...dynamicAtlas.canvas.getContext('2d')!.getImageData(mx, my, 1, 1).data], [0, 0, 255, 255]);
mg.fillStyle = 'green'; mg.fillRect(0, 0, 6, 6);
dynamicAtlas.get(mutable, 3);
dynamicAtlas.invalidate(); dynamicAtlas.flush(fakeRenderer);
assert.deepEqual([...dynamicAtlas.canvas.getContext('2d')!.getImageData(mx, my, 1, 1).data], [0, 128, 0, 255],
  '上下文恢复时整图应由最新画布重建');
assert.equal(dynamicAtlas.texture.version, firstVersion + 1);
mutable.width = 10;
assert.notEqual(dynamicAtlas.get(mutable, 4), mutableCell, '画布尺寸变化应重新分配槽位');
dynamicAtlas.dispose();

const stableAtlas = new HdStaticAtlas(16), stableKey = {}, base = solid('red');
stableAtlas.begin();
const baseCell = stableAtlas.get(base, 1, stableKey)!;
stableAtlas.flush(fakeRenderer);
const bitmapCanvas = solid('blue') as HTMLCanvasElement & { close(): void };
const bitmapPaint = bitmapCanvas.getContext('2d')!;
bitmapPaint.fillStyle = 'red'; bitmapPaint.fillRect(0, 0, 6, 3);
let closed = 0; bitmapCanvas.close = () => { closed++; };
const bitmap = new BitmapFrame(bitmapCanvas as unknown as ImageBitmap);
const bitmapCell = stableAtlas.get(bitmap, 2, stableKey)!;
assert.equal(bitmapCell.u0, baseCell.u0); assert.equal(bitmapCell.u1, baseCell.u1);
assert.equal(bitmapCell.v0, baseCell.v1); assert.equal(bitmapCell.v1, baseCell.v0, '位图上传使用反向 v');
bitmap.release(); assert.equal(closed, 0, '客户端释放后图集仍持有当前位图');
stableAtlas.flush(fakeRenderer); stableAtlas.invalidate(); stableAtlas.flush(fakeRenderer);
const px = Math.floor(bitmapCell.u0 * stableAtlas.canvas.width + 3);
const py = Math.floor((1 - bitmapCell.v1) * stableAtlas.canvas.height + 1);
assert.deepEqual([...stableAtlas.canvas.getContext('2d')!.getImageData(px, py, 1, 1).data], [0, 0, 255, 255],
  '整图备份应按分块上传方向重建位图');
for (let i = 0; i < 121; i++) stableAtlas.begin();
assert.equal(closed, 1, '过期槽释放图集引用后应关闭位图');
stableAtlas.dispose();

const closingAtlas = new HdStaticAtlas(16); closingAtlas.begin();
const stationary = solid('red'), stationaryCell = closingAtlas.get(stationary)!;
closingAtlas.flush(fakeRenderer);
const closingCanvas = solid('blue') as HTMLCanvasElement & { close(): void };
let clearClosed = 0; closingCanvas.close = () => { clearClosed++; };
const closingFrame = new BitmapFrame(closingCanvas as unknown as ImageBitmap);
closingAtlas.get(closingFrame, 1, {}); closingFrame.release();
const priorUploads = uploaded.length;
closingAtlas.clearBitmaps();
closingAtlas.flush(fakeRenderer);
assert.equal(clearClosed, 1, '退出 HD 视图应立即释放 Worker 位图');
assert.equal(uploaded.length, priorUploads, '已释放的位图不能留在上传队列');
assert.equal(closingAtlas.get(stationary), stationaryCell, '退出 HD 视图应保留其他静态素材');
closingAtlas.dispose();

const fullAtlas = new HdStaticAtlas(8); fullAtlas.begin();
for (let i = 0; i < 4; i++) fullAtlas.get(solid('white'));
const rejectedCanvas = solid('green') as HTMLCanvasElement & { close(): void };
let rejectedClosed = 0; rejectedCanvas.close = () => { rejectedClosed++; };
const rejected = new BitmapFrame(rejectedCanvas as unknown as ImageBitmap);
assert.equal(fullAtlas.get(rejected, 1, {}), null, '槽满应保留原动态回退');
rejected.release(); assert.equal(rejectedClosed, 1, '未取得槽时图集不能占用位图引用');
fullAtlas.dispose();

const terrain = new Terrain(); terrain.build();
// 原来取青玄门中心附近 3×3 块地面的装饰图、青玄门布局里的鼎。青玄门成了占山的大宗门（P10）：台面上不长野草野花，
// 布局里也没有原来的鼎了。改按地点表的顺序取第一处附近有至少 4 个装饰图的地点、第一处布局里有鼎的地点
const decoGlyphs = (l: typeof ALL_LOCATIONS[number]) => {
  const cx = Math.floor(l.x * WORLD_SCALE / CHUNK), cy = Math.floor(l.y * WORLD_SCALE / CHUNK), out = [];
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++)
    for (const d of terrain.getDecos(x, y)) if (d.kind === 'img') out.push(d);
  return out;
};
const glyphLoc = ALL_LOCATIONS.find(l => decoGlyphs(l).length >= 4);
assert(glyphLoc, '应有地点附近长着装饰图');
const glyphs = decoGlyphs(glyphLoc);
assert(glyphs.length >= 4);
setLayoutEnv(null);
// 鼎（ding）在现在的布局里已经没有了，取一样同类的静态摆件（石碑 / 石柱 / 方尖碑）画成精灵
const KINDS = ['ding', 'stele', 'pillar', 'obelisk'];
const loc = ALL_LOCATIONS.find(l => getLayout(l).pieces.some(item => KINDS.includes(item.kind)));
assert(loc, '应有布局里带静态摆件的地点');
const layout = getLayout(loc), piece = layout.pieces.find(item => KINDS.includes(item.kind))!;
const townSprite = renderPiece(piece, layout.pal, 1, 1);
const sources = [...glyphs.slice(0, 4).map(d => d.img), townSprite.canvas];

type Fixture = { renderer: Renderer; hd: HdScene; work: HTMLCanvasElement };
function fixture(): Fixture {
  const work = canvas(2048, 4096), wctx = work.getContext('2d')!;
  const hd = Object.assign(Object.create(HdScene.prototype), {
    work, wctx, decalW: 2048, decalH: 2048, atlasH: 2048, staticAtlas: null,
    groundLayer: { begin() {} }, items: [], px: 0, py: 2048, rowH: 0,
    cam: new OrthographicCamera(-1, 1, 1, -1, 1, 40000), W: 1280, H: 800,
    inverseMatrix: new Matrix4(), inverseViewProjection: new Float32Array(16), projected: new Vector3(),
    ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), yaw: 0, pitch: 45,
    heightAt: () => 0, bbMat: new ShaderMaterial({ uniforms: { uStatic: { value: null }, uRight: { value: new Vector3() }, uFold: { value: new Vector4() }, uBoost: { value: 1 } } }),
  }) as HdScene;
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    ctx: wctx, game: { cam: { zoom: 1 }, player: { x: -5000, y: -5000 } }, dpr: 1, W: 1280, H: 800,
  }) as Renderer;
  return { renderer, hd, work };
}

function makeList(cached: boolean, counts: { fixed: number; moving: number }, frame: number): Drawable[] {
  const list: Drawable[] = [];
  for (let i = 0; i < 20; i++) {
    const image = sources[i % sources.length], x = i === 0 ? -10 : 140 + i % 5 * 200, y = 170 + Math.floor(i / 5) * 160;
    const w = image.width, h = image.height, flip = i % 2 === 0, alpha = i % 3 === 0 ? 0.7 : 1;
    const sprite: StaticSprite = { image, l: -w / 2, r: w / 2, t: -h, b: 0, flip, alpha };
    list.push({ x, y, hx: x, hb: hdBox.deco(w, h), staticSprite: cached ? () => sprite : undefined,
      draw: g => {
        counts.fixed++; g.save(); g.globalAlpha = alpha;
        if (flip) { g.translate(x, 0); g.scale(-1, 1); g.drawImage(image, -w / 2, y - h, w, h); }
        else g.drawImage(image, x - w / 2, y - h, w, h);
        g.restore();
      } } as Drawable);
  }
  list.push({ y: 350, hx: 620, hb: [-20, 20, -60, 0], draw: g => {
    counts.moving++; g.fillStyle = frame % 2 ? '#ff0000' : '#0000ff'; g.fillRect(600, 290, 40, 60);
  } });
  return list;
}

function frame(f: Fixture, list: Drawable[]): void {
  f.hd.begin(640, 400, 1, 1);
  (f.renderer as unknown as { drawListHD(list: Drawable[], hd: HdScene): void }).drawListHD(list, f.hd);
}

function composed(f: Fixture): Uint8ClampedArray {
  const out = canvas(1280, 800), g = out.getContext('2d')!;
  g.fillStyle = '#e9dfc6'; g.fillRect(0, 0, out.width, out.height);
  const atlas = (f.hd as unknown as { staticAtlas: InstanceType<typeof HdStaticAtlas> | null }).staticAtlas;
  atlas?.snapshot();
  for (const item of f.hd.items) {
    const source = item.static ? atlas!.canvas : f.work;
    const sx = Math.min(item.u0, item.u1) * source.width, sy = (1 - item.v0) * source.height;
    const sw = Math.abs(item.u1 - item.u0) * source.width, sh = (item.v0 - item.v1) * source.height;
    const anchor = f.hd.ground(item.x, item.y), dx = anchor.x + item.l * item.k, dy = anchor.y + item.t * item.k;
    const dw = (item.r - item.l) * item.k, dh = (item.b - item.t) * item.k;
    g.save(); g.globalAlpha = item.a;
    if (item.u1 < item.u0) { g.translate(dx + dw, 0); g.scale(-1, 1); g.drawImage(source, sx, sy, sw, sh, 0, dy, dw, dh); }
    else g.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    g.restore();
  }
  return g.getImageData(0, 0, out.width, out.height).data;
}

function run(cached: boolean) {
  const f = fixture(), counts = { fixed: 0, moving: 0 };
  const start = performance.now();
  for (let i = 0; i < 30; i++) frame(f, makeList(cached, counts, i));
  return { f, counts, ms: performance.now() - start, pixels: composed(f) };
}

const baseline = run(false), optimized = run(true);
assert.deepEqual(baseline.counts, { fixed: 600, moving: 30 });
assert.deepEqual(optimized.counts, { fixed: 0, moving: 30 }, '固定画布应只填充一次，动态对象仍每帧绘制');
assert.equal(optimized.f.hd.items.length, baseline.f.hd.items.length);
let diff = 0, maxDiff = 0, changed = 0;
for (let i = 0; i < baseline.pixels.length; i++) {
  const d = Math.abs(baseline.pixels[i] - optimized.pixels[i]);
  diff += d; maxDiff = Math.max(maxDiff, d); if (d > 4) changed++;
}
console.log(JSON.stringify({ baselineMs: +baseline.ms.toFixed(2), optimizedMs: +optimized.ms.toFixed(2),
  baseline: baseline.counts, optimized: optimized.counts, staticBytes: 4096 * 4096 * 4,
  meanChannelDifference: diff / baseline.pixels.length, maxChannelDifference: maxDiff, channelsOver4: changed }));
assert(diff / baseline.pixels.length < 0.5, '缓存与原绘制的像素偏差过大');
assert(changed / baseline.pixels.length < 0.01, '缓存与原绘制的像素差异范围过大');

const delayed = fixture(), delayedCounts = { fixed: 0, moving: 0 };
const readyList = makeList(true, delayedCounts, 0);
const first = readyList[0], source = first.staticSprite!;
let ready = false;
first.staticSprite = () => ready ? source() : null;
frame(delayed, readyList);
assert.equal(delayedCounts.fixed, 1, '素材未就绪时应执行原绘制，不应缓存空白');
ready = true;
frame(delayed, readyList);
assert.equal(delayedCounts.fixed, 1);
assert(delayed.hd.items.every((item, i) => i === delayed.hd.items.length - 1 || item.static));

const changedSource = solid('purple');
const oldVersion = (delayed.hd as unknown as { staticAtlas: InstanceType<typeof HdStaticAtlas> }).staticAtlas.texture.version;
first.staticSprite = () => ({ image: changedSource, l: -3, r: 3, t: -6, b: 0 });
frame(delayed, readyList);
const changedAtlas = (delayed.hd as unknown as { staticAtlas: InstanceType<typeof HdStaticAtlas> }).staticAtlas;
assert.equal(changedAtlas.texture.version, oldVersion, '素材变更应排队分块上传');
const changedItem = delayed.hd.items.find(item => item.x === -10)!;
const pixelX = Math.floor((changedItem.u0 + changedItem.u1) * changedAtlas.canvas.width / 2);
const pixelY = Math.floor((1 - (changedItem.v0 + changedItem.v1) / 2) * changedAtlas.canvas.height);
changedAtlas.snapshot();
assert.deepEqual([...changedAtlas.canvas.getContext('2d')!.getImageData(pixelX, pixelY, 1, 1).data], [128, 0, 128, 255]);

const large = canvas(2047, 20), fallback = fixture(), fallbackCounts = { fixed: 0, moving: 0 };
const largeList: Drawable[] = [{ y: 350, hx: 640, hb: [-1023.5, 1023.5, -20, 0],
  staticSprite: () => ({ image: large, l: -1023.5, r: 1023.5, t: -20, b: 0 }),
  draw: () => { fallbackCounts.fixed++; } }];
frame(fallback, largeList);
assert.equal(fallbackCounts.fixed, 1, '超过页尺寸的素材应回退动态绘制');
assert.equal(fallback.hd.items[0].static, false);

const packed = optimized.f.hd as unknown as {
  aFoot: InstancedBufferAttribute; aBox: InstancedBufferAttribute; aUv: InstancedBufferAttribute; aA: InstancedBufferAttribute;
  bb: { count: number }; workTex: { needsUpdate: boolean }; target: object;
  groundScene: object;
  gl: { autoClear: boolean; resetState(): void; initTexture(): void; copyTextureToTexture(): void; setRenderTargetFramebuffer(): void; setRenderTarget(): void; render(scene: object): void; getContext(): object };
};
packed.aFoot = new InstancedBufferAttribute(new Float32Array(4096 * 3), 3);
packed.aBox = new InstancedBufferAttribute(new Float32Array(4096 * 4), 4);
packed.aUv = new InstancedBufferAttribute(new Float32Array(4096 * 4), 4);
packed.aA = new InstancedBufferAttribute(new Float32Array(4096 * 3), 3);
packed.bb = { count: 0 }; packed.workTex = { needsUpdate: false }; packed.target = {};
const passes: string[] = [];
packed.groundScene = {};
const context = { READ_FRAMEBUFFER: 1, DRAW_FRAMEBUFFER: 2, FRAMEBUFFER: 3, DEPTH_BUFFER_BIT: 4, NEAREST: 5,
  bindFramebuffer() {}, blitFramebuffer() { passes.push('depth-copy'); } };
packed.gl = { autoClear: true, resetState() {}, initTexture() {}, copyTextureToTexture() {}, setRenderTargetFramebuffer() {}, setRenderTarget() {},
  getContext() { return context; }, render(scene) { passes.push(scene === packed.groundScene ? 'ground' : 'world'); } };
// 高山模式（默认）下 render 还会更新宗门光效、画阴影图、画体积云：这些另有测试，这里只看地表、深度复制、立板三遍的顺序和立板批次
Object.assign(packed, { sectFx: { update() {} }, shadowU: { uLight: { value: new Vector3() }, uSnowHole: { value: new Vector4() } }, nightK: 0,
  renderShadows() {}, renderWorldClouds() {} });
optimized.f.hd.render({ fb: {}, groundFb: {}, w: 1280, h: 800 } as never);
assert.deepEqual(passes, ['ground', 'depth-copy', 'world']);
assert.equal(packed.gl.autoClear, true);
assert.equal(packed.bb.count, optimized.f.hd.items.length);
for (let i = 0; i < optimized.f.hd.items.length; i++) {
  const item = optimized.f.hd.items[i];
  assert.equal(packed.aA.getZ(i), item.static ? 1 : 0, '同一排序批次应为每个对象选择正确纹理');
  assert(Math.abs(packed.aA.getX(i) - item.a) < 1e-6);
}
console.log('HD static atlas tests passed');
