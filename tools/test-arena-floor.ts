import './env';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Image, createCanvas } from '@napi-rs/canvas';
import { CanvasTexture, Scene, Vector2, type Texture } from 'three';
import { HdGround, type GroundBackdrop } from '../src/hd2d/scene';
import type { ModBundle } from '../src/mod/types';
import type { Drawable } from '../src/world/life';

const old = process.argv[2] === 'old';
const modPath = old ? '../验证/B-1000-verify-20261113-final/dist-mods/shahe-1.3.7.fmod' : `dist-mods/shahe-${JSON.parse(readFileSync('mods/shahe/manifest.json', 'utf8')).version}.fmod`;
const bundle = JSON.parse(readFileSync(modPath, 'utf8')) as ModBundle;
const images: DeferredImage[] = [];
class DeferredImage extends Image {
  private pending = '';
  constructor() { super(); images.push(this); }
  set src(value: string | Buffer) { this.pending = typeof value === 'string' ? value : value.toString(); }
  get src() { return this.pending; }
  async load() {
    await new Promise<void>((resolve, reject) => {
      this.onload = () => resolve(); this.onerror = reject;
      super.src = Buffer.from(this.pending.slice(this.pending.indexOf(',') + 1), 'base64');
    });
  }
}
const storage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.assign(globalThis, { Image: DeferredImage, window: Object.assign(new EventTarget(), { innerWidth: 960, innerHeight: 720, devicePixelRatio: 1, matchMedia: () => ({ matches: false }) }),
  localStorage: storage, sessionStorage: storage, location: { href: 'http://127.0.0.1:5202/?hd2d=1', search: '?hd2d=1' }, __TAIXU_NORELOAD: true });
const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const host = new ModHost(), loaded = await host.load(bundle); assert.equal(loaded.state, 'loaded', loaded.error);
Object.assign(globalThis, { __modHost: host });
const sandbox = (globalThis as typeof globalThis & { __shahe: { S: { origin: { x: number; y: number }; active: boolean; arena: boolean }; enter(o: { who: string; realm: number; stage: number; place: string; fresh: boolean }): boolean } }).__shahe;
const terrain = new Terrain(); terrain.build(); const game = new Game(terrain);
game.hero.realm = 2; game.hero.stage = 1; game.story['openT'] = -1; game.closeModal(true); game.paused = false;
game.canvas = Object.assign(new EventTarget(), { style: { cursor: '' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 720 }) }) as unknown as HTMLCanvasElement;
host.attach(game); host.start();
assert(sandbox.enter({ who: 'test', realm: 2, stage: 1, place: 'arena', fresh: true })); assert(sandbox.S.arena);
const viewRect = () => ({ left: game.cam.x - 480 / game.cam.zoom, top: game.cam.y - 360 / game.cam.zoom, right: game.cam.x + 480 / game.cam.zoom, bottom: game.cam.y + 360 / game.cam.zoom });
Object.assign(game, { renderer: { viewRect, resetStill() {} } });
const label = process.argv[3] ?? (old ? 'old' : 'new');
const out = `tools/out/edge-flicker/arena-floor-${label}`;
mkdirSync('tools/out/edge-flicker', { recursive: true });   // 截图、报告的输出目录不在仓库里（tools/out 不提交），自己建
const report: { name: string; origin: number[]; zoom: number; cameraOffset: number[]; png: string }[] = [];
function paint(name: string, ox: number, oy: number, zoom: number, dx: number, dy: number) {
  sandbox.S.origin = { x: ox, y: oy }; game.cam.x = ox + dx; game.cam.y = oy + dy; game.cam.zoom = zoom;
  const list: Drawable[] = []; host.collect(list); const ground = list.find(d => d.k === 'D·试场地面'); assert(ground);
  const canvas = createCanvas(960, 720), g = canvas.getContext('2d');
  g.setTransform(zoom, 0, 0, zoom, 480 - game.cam.x * zoom, 360 - game.cam.y * zoom);
  Object.defineProperty(performance, 'now', { configurable: true, value: () => 20000 });
  ground.draw(g as unknown as CanvasRenderingContext2D);
  delete (performance as Performance & { now?: () => number }).now;
  const png = `${out}-${name}.png`; writeFileSync(png, canvas.toBuffer('image/png'));
  report.push({ name, origin: [ox, oy], zoom, cameraOffset: [dx, dy], png });
}
async function loadAsset(name: string) {
  const image = images.find(i => i.src === bundle.files[`img/${name}.webp`]); assert(image, `missing ${name}`);
  await image.load(); assert(image.complete && image.naturalWidth > 0, `${name} did not load`);
}
paint('unready', 0, 0, .55, 0, 0);
await loadAsset('arena_stone');
paint('stone', 0, 0, .55, 0, 0);
await loadAsset('array'); await loadAsset('arena_clouds');
paint('all', 0, 0, .55, 0, 0);
paint('far', 248482.0492107327, 142722.7898241287, .55, 0, 0);
paint('overview', 248482.0492107327, 142722.7898241287, .25, 0, 100);
paint('east', 248482.0492107327, 142722.7898241287, .8, 1850, 0);
paint('south', 248482.0492107327, 142722.7898241287, 1.0, 0, 1900);
paint('close', 248482.0492107327, 142722.7898241287, 1.5, 0, 0);
game.reset(); assert(!sandbox.S.active, 'reset must exit the sandbox');
assert(sandbox.enter({ who: 'test', realm: 2, stage: 1, place: 'arena', fresh: true })); assert(sandbox.S.arena);
paint('reenter', 248582.0492107327, 142822.7898241287, .55, 0, 0);
if (process.argv.includes('--gpu-contract')) {
  const { Renderer } = await import('../src/world/render');
  const texture = new CanvasTexture(createCanvas(960, 720) as unknown as HTMLCanvasElement);
  const ground = new HdGround(new Scene(), () => 0, texture, 960, 720, 720);
  const state = ground as unknown as { decalMat: { uniforms: Record<string, { value: unknown }> } };
  let current: GroundBackdrop | null = null;
  const hd = { setGroundBackdrop(value: GroundBackdrop | null) { current = value; ground.setBackdrop(value); } };
  Object.assign(game, { renderer: { viewRect, resetStill() {}, hd, stage: { lost: false } } });
  paint('gpu-first', 248582.0492107327, 142822.7898241287, .55, 0, 0);
  assert(current, 'real sandbox must provide the GPU ground backdrop');
  const first = current as GroundBackdrop;
  assert(first.cloud && first.cloud.complete && first.cloud.naturalWidth > 0);
  assert.equal(state.decalMat.uniforms.uBackdropOn.value, 1); assert.equal(state.decalMat.uniforms.uCloudOn.value, 1);
  assert.deepEqual((state.decalMat.uniforms.uBackdropOrigin.value as Vector2).toArray(), [first.left, first.top]);
  assert.deepEqual((state.decalMat.uniforms.uBackdropSize.value as Vector2).toArray(), [first.width, first.height]);
  const initialTexture = state.decalMat.uniforms.uBackdrop.value as Texture; let disposed = 0;
  initialTexture.addEventListener('dispose', () => disposed++);
  paint('gpu-repeat', 248582.0492107327, 142822.7898241287, .55, 0, 0);
  assert.equal(state.decalMat.uniforms.uBackdrop.value, initialTexture, 'unchanged image should reuse its GPU texture');
  paint('gpu-resize', 248582.0492107327, 142822.7898241287, .8, 0, 0);
  assert.equal(disposed, 1, 'zoom bucket change must release the previous GPU texture');
  assert.notEqual(state.decalMat.uniforms.uBackdrop.value, initialTexture);
  sandbox.S.origin = { x: 248582.0492107327, y: 142822.7898241287 };
  game.cam.x = sandbox.S.origin.x; game.cam.y = sandbox.S.origin.y + 1900; game.cam.zoom = .55;
  const view = viewRect();
  function floorWithWater(water: boolean) {
    const canvas = createCanvas(960, 1440), ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 720, 960, 720);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 960, 720); ctx.clip();
    ctx.setTransform(.55, 0, 0, .55, 480 - game.cam.x * .55, 360 - game.cam.y * .55);
    let waterPixels = 0;
    if (water) {
      const renderer = Object.create(Renderer.prototype) as unknown as { ctx: CanvasRenderingContext2D; game: typeof game; drawWater(l: number, t: number, r: number, b: number, time: number): void };
      Object.assign(renderer, { ctx, game }); renderer.drawWater(view.left, view.top, view.right, view.bottom, 20);
      const before = ctx.getImageData(0, 0, 960, 720).data;
      for (let i = 3; i < before.length; i += 4) if (before[i]) waterPixels++;
    }
    const list: Drawable[] = []; host.collect(list); const floor = list.find(d => d.k === 'D·试场地面'); assert(floor);
    floor.draw(ctx as unknown as CanvasRenderingContext2D); ctx.restore();
    const kept = ctx.getImageData(0, 720, 960, 720).data;
    assert(kept.every((v, i) => v === [255, 0, 255, 255][i % 4]), 'clearing ground must preserve the lower character atlas');
    return { data: ctx.getImageData(0, 0, 960, 720).data, waterPixels };
  }
  const clean = floorWithWater(false), withWater = floorWithWater(true);
  let leftOver = 0; for (let i = 0; i < clean.data.length; i++) if (clean.data[i] !== withWater.data[i]) leftOver++;
  console.log(`real prior water: ${withWater.waterPixels} pixels, unexpected channels after floor: ${leftOver}`);
  assert(withWater.waterPixels > 100, 'real prior water should be visible at the arena edge');
  assert.equal(leftOver, 0, 'the opaque arena backdrop must cover water painted before it');
  game.reset(); assert.equal(current, null, 'exiting sandbox must remove the GPU backdrop');
  assert.equal(state.decalMat.uniforms.uBackdropOn.value, 0); assert.equal(state.decalMat.uniforms.uCloudOn.value, 0);
  ground.dispose(); texture.dispose();
  console.log('PASS actual sandbox GPU backdrop route: image/cloud uniforms, reuse, zoom revision and teardown');
}
writeFileSync(`${out}.json`, JSON.stringify({ path: modPath, cases: report }, null, 2));
console.log(`PASS ${old ? 'old' : 'new'} fmod: ${report.length} real ModHost floor draws; delayed stone/array/clouds and re-entry`);
