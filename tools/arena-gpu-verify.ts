import { CanvasTexture, LinearFilter, LinearSRGBColorSpace, OrthographicCamera, Scene, Vector2, WebGLRenderer } from 'three';
import { HdGround, type GroundBackdrop } from '../src/hd2d/scene';
import { ModHost } from '../src/mod/host';
import { Terrain } from '../src/world/terrain';
import { Game } from '../src/world/game';
import type { ModBundle } from '../src/mod/types';
import type { Drawable } from '../src/world/life';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = $<HTMLButtonElement>('run'), status = $('status'), result = $('result');
const W = 960, H = 720, size = 1024;
const reference = $<HTMLCanvasElement>('reference'), output = $<HTMLCanvasElement>('gpu');
reference.width = output.width = W; reference.height = output.height = H;
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
type Sandbox = { S: { origin: { x: number; y: number }; arena: boolean }; enter(o: { who: string; realm: number; stage: number; place: string; fresh: boolean }): boolean };
type RendererFixture = { stage: { lost: boolean } | null; hd: { setGroundBackdrop(b: GroundBackdrop | null): void }; viewRect(): { left: number; top: number; right: number; bottom: number } };
button.addEventListener('click', async () => {
  button.disabled = true; status.textContent = '加载实际沙盒并生成地形…';
  try {
    const host = new ModHost(), bundle = await (await fetch('/dist-mods/shahe-1.3.7.fmod')).json() as ModBundle;
    const loaded = await host.load(bundle); if (loaded.state !== 'loaded') throw new Error(loaded.error);
    Object.assign(globalThis, { __modHost: host });
    const sandbox = (globalThis as typeof globalThis & { __shahe: Sandbox }).__shahe;
    const terrain = new Terrain(); terrain.build(); const game = new Game(terrain);
    game.hero.realm = 2; game.hero.stage = 1; game.story['openT'] = -1; game.closeModal(true); game.paused = false;
    game.canvas = reference; host.attach(game); host.start();
    if (!sandbox.enter({ who: 'test', realm: 2, stage: 1, place: 'arena', fresh: true }) || !sandbox.S.arena) throw new Error('无法进入真实演武台');
    const gl = output.getContext('webgl2', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 不可用');
    const renderer = new WebGLRenderer({ canvas: output, context: gl, alpha: true, premultipliedAlpha: true });
    renderer.outputColorSpace = LinearSRGBColorSpace; renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    const scene = new Scene(), work = document.createElement('canvas'); work.width = W; work.height = H;
    const workCtx = work.getContext('2d')!, texture = new CanvasTexture(work); texture.minFilter = LinearFilter; texture.generateMipmaps = false;
    const ground = new HdGround(scene, () => 0, texture, W, H, H);
    let backdrop: GroundBackdrop | null = null, ox = 0, oy = 0, cx = 0, cy = 0, zoom = .55;
    const fixture: RendererFixture = {
      stage: { lost: false }, hd: { setGroundBackdrop(b) { backdrop = b; ground.setBackdrop(b); } },
      viewRect() { return { left: cx - W / (2 * zoom), top: cy - H / (2 * zoom), right: cx + W / (2 * zoom), bottom: cy + H / (2 * zoom) }; },
    };
    (game as unknown as { renderer: RendererFixture }).renderer = fixture;
    const white = document.createElement('canvas'); white.width = white.height = 2; const wg = white.getContext('2d')!; wg.fillStyle = '#fff'; wg.fillRect(0, 0, 2, 2);
    function draw(ctx: CanvasRenderingContext2D, accelerated: boolean) {
      const list: Drawable[] = []; host.collect(list); const d = list.find(q => q.k === 'D·试场地面'); if (!d) throw new Error('收集不到真实试场地面');
      fixture.stage = accelerated ? { lost: false } : null;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.setTransform(zoom, 0, 0, zoom, W / 2 - cx * zoom, H / 2 - cy * zoom);
      Object.defineProperty(performance, 'now', { configurable: true, value: () => 20000 });
      d.draw(ctx); Reflect.deleteProperty(performance, 'now');
    }
    sandbox.S.origin = { x: ox, y: oy }; cx = ox; cy = oy;
    for (let i = 0; i < 60; i++) { draw(workCtx, true); if ((backdrop as GroundBackdrop | null)?.cloud) break; await wait(50); }
    if (!(backdrop as GroundBackdrop | null)?.cloud) throw new Error('沙盒云海图片未就绪');
    await wait(150);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 40000), results = [];
    for (const test of [
      { name: '原点中心', x: 0, y: 0, z: .55, dx: 0, dy: 0 },
      { name: '远坐标中心', x: 248482.0492107327, y: 142722.7898241287, z: .55, dx: 0, dy: 0 },
      { name: '远坐标全景', x: 248482.0492107327, y: 142722.7898241287, z: .25, dx: 0, dy: 100 },
      { name: '东沿', x: 248482.0492107327, y: 142722.7898241287, z: .8, dx: 1850, dy: 0 },
      { name: '南沿', x: 248482.0492107327, y: 142722.7898241287, z: 1, dx: 0, dy: 1900 },
      { name: '近景', x: 248482.0492107327, y: 142722.7898241287, z: 1.5, dx: 0, dy: 0 },
    ]) {
      status.textContent = `校验 ${test.name}…`;
      ox = test.x; oy = test.y; zoom = test.z; cx = ox + test.dx; cy = oy + test.dy; sandbox.S.origin = { x: ox, y: oy };
      game.cam.x = cx; game.cam.y = cy; game.cam.zoom = zoom;
      draw(reference.getContext('2d')!, false); draw(workCtx, true); texture.needsUpdate = true;
      const view = fixture.viewRect(); ground.begin(view.left, view.top, zoom);
      const chunks = [];
      for (let y = Math.floor(view.top / size); y <= Math.floor(view.bottom / size); y++) for (let x = Math.floor(view.left / size); x <= Math.floor(view.right / size); x++) chunks.push({ cx: x, cy: y, canvas: white });
      ground.sync(chunks, size);
      camera.left = -W / 2 / zoom; camera.right = W / 2 / zoom; camera.top = H / 2 / zoom; camera.bottom = -H / 2 / zoom;
      camera.position.set(cx, 20000, cy); camera.up.set(0, 0, -1); camera.lookAt(cx, 0, cy); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.render(scene, camera);
      const pixels = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const expected = reference.getContext('2d')!.getImageData(0, 0, W, H).data;
      let total = 0, over5 = 0, over20 = 0, max = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < 3; k++) {
        const got = pixels[((H - 1 - y) * W + x) * 4 + k], want = expected[(y * W + x) * 4 + k], d = Math.abs(got - want);
        total += d; if (d > 5) over5++; if (d > 20) over20++; max = Math.max(max, d);
      }
      const n = W * H * 3; results.push({ name: test.name, mean: +(total / n).toFixed(3), over5Pct: +(100 * over5 / n).toFixed(3), over20Pct: +(100 * over20 / n).toFixed(3), max });
      await wait(0);
    }
    const rasterSize = 2048, rasterReference = document.createElement('canvas'), rasterGpu = document.createElement('canvas');
    rasterReference.width = rasterReference.height = rasterGpu.width = rasterGpu.height = rasterSize;
    const referenceTexture = new CanvasTexture(rasterReference), gpuTexture = new CanvasTexture(rasterGpu);
    referenceTexture.minFilter = gpuTexture.minFilter = LinearFilter; referenceTexture.generateMipmaps = gpuTexture.generateMipmaps = false;
    const referenceScene = new Scene(), gpuScene = new Scene();
    const referenceGround = new HdGround(referenceScene, () => 0, referenceTexture, rasterSize, rasterSize, rasterSize);
    const gpuGround = new HdGround(gpuScene, () => 0, gpuTexture, rasterSize, rasterSize, rasterSize);
    fixture.hd.setGroundBackdrop = b => { backdrop = b; gpuGround.setBackdrop(b); };
    let view = { left: 0, top: 0, right: 0, bottom: 0 };
    fixture.viewRect = () => view;
    const read = () => { const p = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
    const obliqueResults = [];
    for (const yaw of [0, Math.PI / 4, Math.PI / 2]) {
      status.textContent = `校验 45° 斜视、${Math.round(yaw * 180 / Math.PI)}° 方位…`;
      ox = 248482.0492107327; oy = 142722.7898241287; cx = ox; cy = oy; zoom = .55;
      game.cam.x = cx; game.cam.y = cy; game.cam.zoom = zoom; sandbox.S.origin = { x: ox, y: oy };
      const rx = Math.cos(yaw), ry = Math.sin(yaw), ux = Math.sin(yaw), uy = -Math.cos(yaw);
      const halfW = W / (2 * zoom), halfH = H / (2 * zoom * Math.SQRT1_2);
      const ex = Math.abs(rx * halfW) + Math.abs(ux * halfH), ey = Math.abs(ry * halfW) + Math.abs(uy * halfH);
      view = { left: cx - ex, top: cy - ey, right: cx + ex, bottom: cy + ey };
      const l = view.left - 400, t = view.top - 400, r = view.right + 400, b = view.bottom + 400;
      const rasterScale = Math.min(zoom, rasterSize / (r - l), rasterSize / (b - t));
      function drawRaster(canvas: HTMLCanvasElement, accelerated: boolean) {
        fixture.stage = accelerated ? { lost: false } : null;
        const ctx = canvas.getContext('2d')!; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, rasterSize, rasterSize);
        ctx.setTransform(rasterScale, 0, 0, rasterScale, -l * rasterScale, -t * rasterScale);
        const list: Drawable[] = []; host.collect(list); const floor = list.find(d => d.k === 'D·试场地面'); if (!floor) throw new Error('斜视场景缺少地面');
        Object.defineProperty(performance, 'now', { configurable: true, value: () => 20000 }); floor.draw(ctx); Reflect.deleteProperty(performance, 'now');
      }
      drawRaster(rasterReference, false); drawRaster(rasterGpu, true); referenceTexture.needsUpdate = gpuTexture.needsUpdate = true;
      const chunks = [];
      for (let y = Math.floor(t / size); y <= Math.floor(b / size); y++) for (let x = Math.floor(l / size); x <= Math.floor(r / size); x++) chunks.push({ cx: x, cy: y, canvas: white });
      referenceGround.begin(l, t, rasterScale); gpuGround.begin(l, t, rasterScale); referenceGround.sync(chunks, size); gpuGround.sync(chunks, size);
      camera.left = -W / 2 / zoom; camera.right = W / 2 / zoom; camera.top = H / 2 / zoom; camera.bottom = -H / 2 / zoom;
      const distance = 20000 * Math.SQRT1_2;
      camera.position.set(cx - ux * distance, distance, cy - uy * distance); camera.up.set(0, 1, 0); camera.lookAt(cx, 0, cy); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.render(referenceScene, camera); const expected = read(); renderer.render(gpuScene, camera); const actual = read();
      let total = 0, over5 = 0, over20 = 0, max = 0;
      for (let i = 0; i < actual.length; i += 4) for (let k = 0; k < 3; k++) {
        const d = Math.abs(actual[i + k] - expected[i + k]); total += d; if (d > 5) over5++; if (d > 20) over20++; max = Math.max(max, d);
      }
      const n = W * H * 3; obliqueResults.push({ yaw: Math.round(yaw * 180 / Math.PI), mean: +(total / n).toFixed(3), over5Pct: +(100 * over5 / n).toFixed(3), over20Pct: +(100 * over20 / n).toFixed(3), max });
      const pixels = new ImageData(W, H);
      for (let y = 0; y < H; y++) pixels.data.set(expected.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
      reference.getContext('2d')!.putImageData(pixels, 0, 0);
      await wait(0);
    }
    result.textContent = JSON.stringify({ topDown: results, oblique: obliqueResults }, null, 2);
    status.textContent = '已完成真实沙盒 GPU/Canvas 及 45° 斜视对照。左为原绘制，右为 GPU 地面，指标为每个 RGB 通道差异。';
    referenceGround.dispose(); gpuGround.dispose(); referenceTexture.dispose(); gpuTexture.dispose(); ground.dispose(); texture.dispose(); renderer.dispose();
  } catch (e) { status.textContent = `失败：${e instanceof Error ? e.stack : String(e)}`; }
  finally { button.disabled = false; }
});
