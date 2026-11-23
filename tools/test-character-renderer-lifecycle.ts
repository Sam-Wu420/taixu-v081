import './env';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { Matrix4, OrthographicCamera, Raycaster, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import type { CharacterPaintBatchReply, CharacterPaintBatchRequest } from '../src/gfx/character-worker-protocol';
import type { CharacterWorkerPort } from '../src/gfx/character-worker-frames';
import type { GLStage } from '../src/gl/stage';
import type { HdScene as SceneType } from '../src/hd2d/scene';

const browserWindow = Object.assign(new EventTarget(), {
  innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
});
Object.assign(globalThis, { window: browserWindow,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  requestAnimationFrame: () => 1, cancelAnimationFrame() {}, requestIdleCallback: () => 1,
  ResizeObserver: class { observe() {} disconnect() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { HdScene } = await import('../src/hd2d/scene');
const { HdStaticAtlas } = await import('../src/hd2d/staticAtlas');
const { CharacterWorkerFrames } = await import('../src/gfx/character-worker-frames');
const { CharacterFrameCache } = await import('../src/gfx/character-cache');
const { CharState, HANLI_LOOK } = await import('../src/gfx/character');
const { paintCharacter } = await import('../src/gfx/character-worker-paint');
const { BitmapFrame } = await import('../src/gfx/bitmap-frame');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { collectCombat } = await import('../src/world/combatfx');

let closed = 0;
class PaintPort implements CharacterWorkerPort {
  onmessage: ((event: MessageEvent<CharacterPaintBatchReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request: CharacterPaintBatchRequest | null = null;
  terminated = false;
  postMessage(request: CharacterPaintBatchRequest): void { this.request = structuredClone(request); }
  terminate(): void { this.terminated = true; }
  drain(): void {
    const results = this.request!.requests.map(request => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
      const physics = paintCharacter(ctx, request);
      const image = Object.assign(canvas, { close: () => { closed++; } }) as unknown as ImageBitmap;
      return { image, physics: structuredClone(physics) };
    });
    this.request = null; this.onmessage!({ data: { results } } as MessageEvent<CharacterPaintBatchReply>);
  }
}

function gameCanvas(): HTMLCanvasElement {
  const canvas = createCanvas(800, 600) as unknown as HTMLCanvasElement, events = new EventTarget();
  Object.assign(canvas, { clientWidth: 800, clientHeight: 600,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) });
  return canvas;
}

/** 不建 WebGL 的 HdScene 夹具：相机、工作画布、立板材质的 uniform（含 HdScene.begin 每帧写的 uFold） */
function hdFixture(staticAtlas: InstanceType<typeof HdStaticAtlas> | null): SceneType {
  const work = document.createElement('canvas'); work.width = 2048; work.height = 4096;
  const hd = Object.assign(Object.create(HdScene.prototype) as SceneType, {
    work, wctx: work.getContext('2d')!, decalW: 2048, decalH: 2048, atlasH: 2048, staticAtlas,
    groundLayer: { begin() {} }, items: [], px: 0, py: 2048, rowH: 0,
    cam: new OrthographicCamera(-1, 1, 1, -1, 1, 40000), W: 800, H: 600,
    inverseMatrix: new Matrix4(), inverseViewProjection: new Float32Array(16), projected: new Vector3(),
    ray: new Raycaster(), ndc: new Vector2(), hit: new Vector3(), yaw: 0, pitch: 45,
    heightAt: () => 0, bbMat: new ShaderMaterial({ uniforms: { uStatic: { value: null }, uRight: { value: new Vector3() }, uFold: { value: new Vector4() }, uBoost: { value: 1 } } }),
  });
  hd.begin(1000, 1000, 0.55, 1);   // 相机就位（Canvas 回退时 viewRect 要反投影）
  return hd;
}

async function prepare() {
  const terrain = new Terrain(); terrain.build();
  const game = new Game(terrain); game.attach(gameCanvas());
  const ports = [new PaintPort(), new PaintPort()], cache = new CharacterFrameCache();
  const workers = new CharacterWorkerFrames(cache, async () => ports);
  await Promise.resolve(); await Promise.resolve();
  const state = new CharState(0, 0); state.t = 1; state.seed = 17;
  workers.beginFrame(); workers.prepare(HANLI_LOOK, state, 1, 0, 0.2, true, 0, 0); workers.endFrame();
  state.update(0.1);
  workers.beginFrame(); workers.prepare(HANLI_LOOK, state, 1, 0.1, 0.2, true, 120, 0); workers.endFrame();
  const activePort = ports.find(port => port.request)!; activePort.drain();
  const frame = workers.prepare(HANLI_LOOK, state, 1, 0, 0.2, true, 120, 0);
  assert(frame.image instanceof BitmapFrame);
  const atlas = new HdStaticAtlas(128); atlas.begin();
  const scenery = document.createElement('canvas'); scenery.width = scenery.height = 8;
  const sceneryCell = atlas.get(scenery)!;
  atlas.get(frame.image, frame.revision, frame.key);
  // GL 丢失时 Canvas 画法的 viewRect 仍按 hd 反投影出可见范围（真实 HdScene 有相机），夹具要带上相机这些
  const hd = hdFixture(atlas);
  const renderer = game.renderer;
  renderer.characterWorkers = workers; renderer.hd = hd;
  return { game, renderer, ports, atlas, scenery, sceneryCell };
}

const realm = await prepare();
realm.game.mijing.cur = { spec: { name: '测试', tier: 1, theme: 'cave', seed: 1, floors: 1, rooms: 3, lv: 1 },
  floors: [], fi: 0, back: { x: 0, y: 0, flying: false }, stash: [], t: 0, got: [], kills: 0 };
realm.renderer.stage = { lost: false } as GLStage;
let realmDraws = 0;
const realmHook = realm.renderer as unknown as { renderRealm(dt: number, gl: boolean): void };
realmHook.renderRealm = () => { realmDraws++; };
realm.renderer.render(0);
assert.equal(realmDraws, 1); assert.equal(realm.renderer.characterWorkers, null);
assert(realm.ports.every(port => port.terminated));
assert.equal(closed, 1, '进入秘境应释放正在使用的位图');
assert.equal(realm.atlas.get(realm.scenery), realm.sceneryCell, '静态场景素材应保留');
realm.game.mijing.cur = null; realm.renderer.stage = null; realm.renderer.hd = null;
realm.atlas.dispose(); realm.game.detach();

const lost = await prepare();
lost.renderer.stage = null;
lost.renderer.render(0);
assert.equal(lost.renderer.characterWorkers, null); assert(lost.ports.every(port => port.terminated));
assert.equal(closed, 2, 'GL 不可用时应释放 Worker 位图');
assert.equal(lost.atlas.get(lost.scenery), lost.sceneryCell);
lost.renderer.hd = null; lost.atlas.dispose(); lost.game.detach();

const battle = await prepare();
battle.atlas.dispose();
const hd = hdFixture(null), work = (hd as unknown as { work: HTMLCanvasElement }).work;
battle.renderer.ctx = work.getContext('2d')!; battle.renderer.hd = hd;
battle.game.player.x = battle.game.life.sense.x = 1000;
battle.game.player.y = battle.game.life.sense.y = 1000;
battle.game.life.sense.R = 10000; battle.game.cam.zoom = 0.55;
battle.game.combat.enemies = Array.from({ length: 100 }, (_, i) => new Enemy(ENEMIES.bandit, 1400 + i, 1000, 2, 1));
const view = { left: 0, top: 0, right: 3000, bottom: 2000 };
function battleFrame() {
  hd.begin(1000, 1000, 0.55, 1);
  const list: import('../src/world/life').Drawable[] = [];
  collectCombat(battle.game.combat, list, view, 1, 0.1, true);
  (battle.renderer as unknown as { drawListHD(list: typeof list, hd: SceneType): void }).drawListHD(list, hd);
}
battleFrame();
for (const enemy of battle.game.combat.enemies) enemy.cs!.update(0.1);
battleFrame();
while (battle.ports.some(port => port.request)) for (const port of battle.ports) if (port.request) port.drain();
battleFrame();
assert.equal(hd.items.filter(item => item.bitmap).length, 100, '真实战斗入口应将 100 个人物 Worker 位图加入图集');
const locked = battle.game.combat.enemies[0]; battle.game.combat.lock = locked;
battleFrame();
assert(hd.items.some(item => item.x === locked.x && !item.static), '锁定人物应回退实时绘制');
assert.equal(battle.renderer.characterWorkers!.release(locked.cs!), undefined);
const realmList: import('../src/world/life').Drawable[] = [];
collectCombat(battle.game.combat, realmList, view, 1, 0.1);
for (const item of realmList) item.draw(battle.renderer.ctx);
assert.equal(battle.renderer.characterWorkers!.release(battle.game.combat.enemies[1].cs!), undefined,
  '秘境 Canvas 收集应释放已接入 Worker 的人物');
hd.releaseCharacterFrames();
(hd as unknown as { staticAtlas: InstanceType<typeof HdStaticAtlas> }).staticAtlas.dispose();
battle.renderer.hd = null; battle.game.detach();
console.log('PASS 真实 Game/Renderer 切换秘境及 GL 回退：停止双 Worker、释放位图并保留静态场景素材');
console.log('PASS 真实 Game/战斗收集/Renderer：100 人 Worker 位图、锁定实时回退和秘境 Canvas 回退');
