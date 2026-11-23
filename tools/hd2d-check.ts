import { HdScene } from '../src/hd2d/scene';
import type { HdStaticAtlas } from '../src/hd2d/staticAtlas';
import { CharacterFrameCache, type CharacterFrame } from '../src/gfx/character-cache';
import { BitmapFrame } from '../src/gfx/bitmap-frame';
import type { StaticImage } from '../src/hd2d/staticAtlas';
import { CharState, HANLI_LOOK, drawCharacter, randomLook, type Action, type Look } from '../src/gfx/character';
import { mulberry32 } from '../src/core/rng';
import { HdGeometryBatch, type CharacterTriangles } from './hd-geometry-batch';
import { GLStage, type PostParams } from '../src/gl/stage';
import { getLayout } from '../src/gfx/building';
import { LOC_BY_ID } from '../src/data/world';
import { Vector3, type CanvasTexture } from 'three';
import { Terrain } from '../src/world/terrain';
import { Game } from '../src/world/game';
import { VfxSprites } from '../src/gl/vfxsprites';
import { vfxImg } from '../src/gfx/vfxTex';

const result = document.querySelector<HTMLPreElement>('#result')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;
const stage = GLStage.create()!;
document.querySelector('#view')!.append(stage.canvas);
stage.resize(960, 540);
const height = (x: number, y: number) => 120 + Math.sin(x / 900) * 80 + Math.cos(y / 1100) * 70;
const scene = new HdScene(stage.canvas, stage.gl, height);
scene.resize(960, 540, 1);
const ground = document.createElement('canvas');
ground.width = ground.height = 256;
const paint = ground.getContext('2d')!;
paint.fillStyle = '#839568'; paint.fillRect(0, 0, 256, 256);
paint.strokeStyle = '#acb292';
for (let i = 0; i <= 256; i += 16) { paint.beginPath(); paint.moveTo(i, 0); paint.lineTo(i, 256); paint.moveTo(0, i); paint.lineTo(256, i); paint.stroke(); }
const overlay = document.createElement('canvas');
overlay.width = 960; overlay.height = 540;
const post: PostParams = {
  t: 0, mul: [1, 1, 1], warm: 0, dusk: 0,
  sense: { x: 480, y: 270, R: 1000, on: false, ink: [0, 0, 0], glow: [0, 0, 0], hide: 0, alarm: 0 },
  atmo: null, fog: [0, 0, 0, 0], fogBands: 0, flash: [0, 0, 0, 0], tint: [0, 0, 0, 0],
  vig: 0, hurt: 0, fade: 0, aberr: 0, bloom: 0, grain: 0, shocks: [], sat: 1,
};

run.onclick = async () => {
  let error = 0, cases = 0;
  for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, 5 * Math.PI / 4]) {
    for (const zoom of [0.4, 0.8, 1.3]) {
      scene.yaw = yaw; scene.begin(300, 200, zoom, 1);
      for (const [x, y] of [[300, 200], [100, 50], [700, 400]]) {
        const screen = scene.project(x, y), world = scene.unproject(screen.x, screen.y);
        const roundtrip = scene.project(world.x, world.y);
        error = Math.max(error, Math.hypot(roundtrip.x - screen.x, roundtrip.y - screen.y));
        const groundScreen = scene.ground(x, y);
        error = Math.max(error, Math.hypot(groundScreen.x - screen.x, groundScreen.y - screen.y));
        cases++;
      }
    }
  }
  scene.yaw = Math.PI / 4; scene.begin(0, 0, 0.45, 1);
  scene.syncGround(Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground })), 1024);
  const location = LOC_BY_ID.get('jingzhou')!;
  scene.buildings.sync([{ id: location.id, layout: getLayout(location), x: 0, y: 0 }], height);
  const cell = scene.alloc(0, 200, -24, 24, -110, 0, 1)!;
  scene.wctx.setTransform(cell.Z, 0, 0, cell.Z, cell.ox, cell.oy);
  scene.wctx.fillStyle = '#c93d2e'; scene.wctx.fillRect(-24, 90, 48, 110);
  const target = stage.worldTarget(960, 540);
  scene.render(target);
  stage.batch.reset(0, 0, 0.45, 960, 540, stage.atlas);
  post.world = target; stage.frame(overlay, 960, 540, 1, post);
  const pixels = new Uint8Array(960 * 540 * 4);
  stage.gl.readPixels(0, 0, 960, 540, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, pixels);
  let colored = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 40) colored++;
  const gl = stage.gl, point = scene.project(0, 200, 55);
  const px = Math.round(point.x), py = 539 - Math.round(point.y);
  const readPixel = () => { const pixel = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel]; };
  const original = readPixel(), white = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, white);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const drawEffect = (depth: number) => {
    stage.batch.reset(0, 0, 0.45, 960, 540, white);
    stage.batch.quadS(-1, point.x, point.y, 24, 24, 0, 0, 0, 1, 1, 0, [0, 0, 1, 1], 1, depth);
    stage.frame(overlay, 960, 540, 1, post);
    return readPixel();
  };
  const depth = scene.projectDepth(0, 200, height(0, 200) + 55 * scene.boost);
  const behind = drawEffect(depth + 0.02), front = drawEffect(depth - 0.02);
  const occluded = original.every((value, i) => value === behind[i]);
  const visible = front[2] > 150 && front[0] < 60;
  stage.batch.reset(0, 0, 0.45, 960, 540, stage.atlas);
  stage.frame(overlay, 960, 540, 1, post);
  gl.deleteTexture(white);

  vfxImg('fireball_head');
  await import('../src/gfx/vfxData');
  let image = vfxImg('fireball_head');
  for (let i = 0; !image && i < 200; i++) { await new Promise((resolve) => setTimeout(resolve, 25)); image = vfxImg('fireball_head'); }
  const terrain = new Terrain(); terrain.build();
  const game = new Game(terrain), combat = game.combat, sprites = new VfxSprites(stage);
  const viewDirection = scene.cam.getWorldDirection(new Vector3());
  const origin = new Vector3(0, height(0, 200) + 55 * scene.boost, 200);
  const right = scene.rightDir;
  const projectile = { fac: 'p' as const, x: 0, y: 0, vx: right.x, vy: right.y, life: 0.5, max: 2, fx: 'fireball' as const, color: '255,120,40', dmg: 0, realm: 1, stCh: 0, pierce: false, homing: false, hit: new Set<number>(), r: 1, aoe: 0, size: 1, trail: [] as [number, number][], lv: 0, visual: { groundOffsetY: 0, elevation: 0 } };
  combat.projs.push(projectile);
  const drawImageEffect = (distance: number) => {
    const pos = origin.clone().addScaledVector(viewDirection, distance);
    projectile.x = pos.x; projectile.y = pos.z; projectile.visual.elevation = (pos.y - height(pos.x, pos.z)) / scene.boost;
    stage.batch.reset(0, 0, 0.45, 960, 540, stage.atlas); stage.batch.hd = scene;
    sprites.draw(combat, 0);
    const textured = stage.batch.segs.some((segment) => segment.tex !== stage.atlas && segment.count > 0);
    stage.frame(overlay, 960, 540, 1, post);
    return { pixel: readPixel(), textured };
  };
  const imageBehind = drawImageEffect(80), imageFront = drawImageEffect(-80);
  const imageOccluded = imageBehind.pixel.every((value, i) => value === original[i]);
  const imageVisible = imageFront.pixel.some((value, i) => i < 3 && Math.abs(value - original[i]) > 15);
  stage.batch.reset(0, 0, 0.45, 960, 540, stage.atlas); stage.frame(overlay, 960, 540, 1, post);
  const groundUnderSample = scene.unproject(point.x, point.y);
  post.worldCamera = { inverse: scene.inverseViewProjection, x: groundUnderSample.x, y: groundUnderSample.y, zoom: 0.45, focusDepth: depth * 0.5 + 0.5, depthRange: 0 };
  post.sense.on = true; post.sense.R = 40; post.sat = 0;
  stage.frame(overlay, 960, 540, 1, post);
  const reconstructedSense = readPixel();
  post.sense.on = false; post.sat = 1;
  stage.frame(overlay, 960, 540, 1, post);
  const glError = gl.getError();
  const senseCorrect = original.every((value, i) => value === reconstructedSense[i]);
  const passed = error < 2 && colored > 400000 && occluded && visible && senseCorrect && !!image && imageBehind.textured && imageFront.textured && imageOccluded && imageVisible && glError === gl.NO_ERROR;
  result.textContent = JSON.stringify({ passed, projectionCases: cases, maxErrorPx: error, coloredPixels: colored, depth: { occluded, visible, original, behind, front, reconstructedSense }, imageDepth: { loaded: !!image, occluded: imageOccluded, visible: imageVisible, behind: imageBehind, front: imageFront }, glError, gpu: stage.gpuName, foregroundDrawCalls: scene.gl.info.render.calls }, null, 2);
};

document.querySelector<HTMLButtonElement>('#alpha-depth')!.onclick = () => {
  const zoom = 0.6, footY = -200, sampleHeight = 100, radius = 250;
  const chunks = Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground }));
  const target = stage.worldTarget(960, 540);
  const sample = (alpha: number, sense: boolean, legacyDepth: boolean) => {
    scene.yaw = 0; scene.begin(0, 0, zoom, 1);
    scene.syncGround(chunks, 1024); scene.buildings.sync([], height);
    const cell = scene.alloc(0, footY, -30, 30, -160, 0, 1, false, alpha)!;
    scene.wctx.setTransform(cell.Z, 0, 0, cell.Z, cell.ox, cell.oy);
    scene.wctx.fillStyle = '#d02010'; scene.wctx.fillRect(-30, footY - 160, 60, 160);
    scene.render(target);
    post.world = legacyDepth ? { ...target, groundDepth: target.depth } : target;
    post.worldCamera = { inverse: scene.inverseViewProjection, x: 0, y: 0, zoom, focusDepth: 0, depthRange: 0 };
    post.sense.on = sense; post.sense.R = radius * zoom; post.sat = 0;
    stage.batch.reset(0, 0, zoom, 960, 540, stage.atlas);
    stage.frame(overlay, 960, 540, 1, post);
    const p = scene.project(0, footY, sampleHeight), pixel = new Uint8Array(4);
    stage.gl.readPixels(Math.round(p.x), 539 - Math.round(p.y), 1, 1, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, pixel);
    return [...pixel];
  };
  const below = sample(0.039, true, true), above = sample(0.041, true, true);
  const groundBelow = sample(0.039, true, false), groundAbove = sample(0.041, true, false);
  const plainBelow = sample(0.039, false, false), plainAbove = sample(0.041, false, false);
  const delta = (a: number[], b: number[]) => Math.max(...a.slice(0, 3).map((v, i) => Math.abs(v - b[i])));
  const senseJump = delta(below, above), groundJump = delta(groundBelow, groundAbove), ordinaryDifference = delta(plainBelow, plainAbove);
  const point = scene.project(0, footY, sampleHeight), groundPoint = scene.unproject(point.x, point.y);
  const resized = stage.worldTarget(480, 270), oldDepthReleased = !stage.gl.isTexture(target.depth) && !stage.gl.isTexture(target.groundDepth)
    && !stage.gl.isFramebuffer(target.fb) && !stage.gl.isFramebuffer(target.groundFb);
  const resizedValid = stage.gl.isTexture(resized.depth) && stage.gl.isTexture(resized.groundDepth) && stage.gl.isFramebuffer(resized.groundFb);
  stage.worldTarget(960, 540);
  result.textContent = JSON.stringify({
    legacy: { alphaDepthReproduced: senseJump > ordinaryDifference + 20, senseJump, below, above },
    groundDepth: { stable: groundJump <= ordinaryDifference + 2, senseJump: groundJump, below: groundBelow, above: groundAbove },
    alpha: [0.039, 0.041], ordinaryDifference, plainBelow, plainAbove, oldDepthReleased, resizedValid,
    spriteWorldRadius: Math.abs(footY), groundWorldRadius: Math.hypot(groundPoint.x, groundPoint.y),
    radius, screen: point, glError: stage.gl.getError(),
  }, null, 2);
  post.sense.on = false; post.sat = 1;
};

let atlasCheckCount = 0;
document.querySelector<HTMLButtonElement>('#atlas-update')!.onclick = () => {
  const image = document.createElement('canvas'); image.width = 80 + atlasCheckCount++; image.height = 100;
  const g = image.getContext('2d')!; g.fillStyle = '#e02010'; g.fillRect(0, 0, image.width, image.height);
  const zoom = 1, target = stage.worldTarget(960, 540);
  const chunks = Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground }));
  const draw = (revision: number | null, source = image) => {
    scene.yaw = 0; scene.begin(0, 0, zoom, 1); scene.syncGround(chunks, 1024); scene.buildings.sync([], height);
    if (revision !== null) scene.allocStatic(0, 0, -40, 40, -100, 0,
      { image: source, l: -40, r: 40, t: -100, b: 0, revision }, false, 1, 1);
    scene.render(target);
    post.world = target; post.sense.on = false; post.sat = 1;
    stage.batch.reset(0, 0, zoom, 960, 540, stage.atlas); stage.frame(overlay, 960, 540, 1, post);
    return [-20, 20].map(x => {
      const p = scene.project(x, 0, 50), pixel = new Uint8Array(4);
      stage.gl.readPixels(Math.round(p.x), 539 - Math.round(p.y), 1, 1, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    });
  };
  const background = draw(null), first = draw(1);
  g.clearRect(0, 0, image.width, image.height); g.fillStyle = '#1020e0';
  g.fillRect(image.width / 2, 0, image.width / 2, image.height);
  const unchanged = draw(1), updated = draw(2);
  const same = (a: number[], b: number[]) => a.every((value, i) => value === b[i]);
  const red = first.every(pixel => pixel[0] > 180 && pixel[2] < 80);
  const stable = unchanged.every((pixel, i) => same(pixel, first[i]));
  const clear = same(updated[0], background[0]);
  const blue = updated[1][2] > 180 && updated[1][0] < 80;
  const atlas = (scene as unknown as { staticAtlas: HdStaticAtlas }).staticAtlas;
  const oldCell = atlas.get(image, 2);
  for (let i = 0; i < 121; i++) atlas.begin();
  const replacement = document.createElement('canvas'); replacement.width = image.width; replacement.height = image.height;
  const rg = replacement.getContext('2d')!; rg.fillStyle = '#10e020'; rg.fillRect(0, 0, replacement.width / 2, replacement.height);
  const replacementCell = atlas.get(replacement, 1);
  const recycled = draw(1, replacement);
  const reuse = replacementCell === oldCell && recycled[0][1] > 180 && same(recycled[1], background[1]);
  atlas.invalidate();
  const restored = draw(1, replacement);
  const recovery = restored.every((pixel, i) => same(pixel, recycled[i]));
  const glError = stage.gl.getError();
  result.textContent = JSON.stringify({ passed: red && stable && clear && blue && reuse && recovery && glError === stage.gl.NO_ERROR,
    red, stable, clear, blue, reuse, recovery, background, first, unchanged, updated, recycled, restored, glError }, null, 2);
};

document.querySelector<HTMLButtonElement>('#bitmap-atlas')!.onclick = () => {
  const target = stage.worldTarget(960, 540), key = {};
  const chunks = Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground }));
  const paint = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, second: boolean) => {
    ctx.clearRect(0, 0, 80, 100);
    ctx.fillStyle = second ? '#e0c010' : '#e02010'; ctx.fillRect(0, 0, 40, 50);
    ctx.fillStyle = second ? 'rgba(30,190,220,0.35)' : 'rgba(10,220,30,0.5)'; ctx.fillRect(40, 0, 40, 50);
    if (!second) { ctx.fillStyle = '#1020e0'; ctx.fillRect(0, 50, 40, 50); }
    ctx.fillStyle = 'rgba(210,40,180,0.25)'; ctx.fillRect(40, 50, 40, 50);
  };
  const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 100;
  const offscreen = new OffscreenCanvas(80, 100), cg = canvas.getContext('2d')!, og = offscreen.getContext('2d')!;
  const draw = (source: StaticImage, revision: number, flip = false) => {
    scene.yaw = 0; scene.begin(0, 0, 1, 1); scene.syncGround(chunks, 1024); scene.buildings.sync([], height);
    scene.allocStatic(0, 0, -40, 40, -100, 0,
      { image: source, key, l: -40, r: 40, t: -100, b: 0, revision, flip }, false, 0.8, 1);
    scene.render(target); post.world = target; post.sense.on = false; post.sat = 1;
    stage.batch.reset(0, 0, 1, 960, 540, stage.atlas); stage.frame(overlay, 960, 540, 1, post);
    const center = scene.ground(0, 0);
    return [[-20, -75], [20, -75], [-20, -25], [20, -25]].map(([dx, dy]) => {
      const pixel = new Uint8Array(4);
      stage.gl.readPixels(Math.round(center.x + dx), 539 - Math.round(center.y + dy), 1, 1, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, pixel);
      return [...pixel];
    });
  };
  const maxDiff = (a: number[][], b: number[][]) => Math.max(...a.flatMap((pixel, i) => pixel.map((v, c) => Math.abs(v - b[i][c]))));
  paint(cg, false); paint(og, false);
  const reference = draw(canvas, 1), first = new BitmapFrame(offscreen.transferToImageBitmap());
  const partial = draw(first, 2), atlas = (scene as unknown as { staticAtlas: HdStaticAtlas }).staticAtlas;
  atlas.invalidate(); const rebuilt = draw(first, 2);
  paint(cg, true); paint(og, true);
  const referenceChanged = draw(canvas, 3, true), second = new BitmapFrame(offscreen.transferToImageBitmap());
  const changed = draw(second, 4, true);
  atlas.invalidate(); const changedRebuilt = draw(second, 4, true);
  first.release(); second.release();
  const diffs = { partial: maxDiff(reference, partial), rebuilt: maxDiff(reference, rebuilt),
    changed: maxDiff(referenceChanged, changed), changedRebuilt: maxDiff(referenceChanged, changedRebuilt) };
  const glError = stage.gl.getError();
  result.textContent = JSON.stringify({ passed: Object.values(diffs).every(d => d <= 2) && glError === stage.gl.NO_ERROR,
    diffs, reference, partial, rebuilt, referenceChanged, changed, changedRebuilt, glError }, null, 2);
};

document.querySelector<HTMLButtonElement>('#character-cpu')!.onclick = () => {
  const zoom = 1, target = stage.worldTarget(960, 540);
  const chunks = Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground }));
  const draw = (frame: CharacterFrame | null) => {
    scene.yaw = 0; scene.begin(0, 0, zoom, 1); scene.syncGround(chunks, 1024); scene.buildings.sync([], height);
    if (frame) scene.allocStatic(0, 0, frame.l, frame.r, frame.t, frame.b,
      { image: frame.image, revision: frame.revision, l: frame.l, r: frame.r, t: frame.t, b: frame.b }, false, 1, 1);
    scene.render(target);
    post.world = target; post.sense.on = false; post.sat = 1;
    stage.batch.reset(0, 0, zoom, 960, 540, stage.atlas); stage.frame(overlay, 960, 540, 1, post);
    const pixels = new Uint8Array(960 * 540 * 4);
    stage.gl.readPixels(0, 0, 960, 540, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, pixels);
    return pixels;
  };
  const frameFor = (look: Look, action: Action, yaw: number, cpu: boolean) => {
    const st = new CharState(0, 0); st.t = 1.01; st.seed = 17; st.phase = 1.2; st.blend = 1;
    st.action = action; st.actionT = 0.22; st.castN = 2; st.yaw = st.targetYaw = yaw;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, options?: unknown): RenderingContext | null {
      const settings = id === '2d' && this.width === 1 && this.height === 1
        ? { ...(options as CanvasRenderingContext2DSettings), willReadFrequently: cpu } : options;
      return Reflect.apply(original, this, [id, settings]) as RenderingContext | null;
    } as typeof HTMLCanvasElement.prototype.getContext;
    let frame: CharacterFrame;
    try { frame = new CharacterFrameCache().prepare(look, st, 1.06, 0, 0.55); }
    finally { HTMLCanvasElement.prototype.getContext = original; }
    return { frame, readFrequently: frame.image.getContext('2d')!.getContextAttributes().willReadFrequently ?? false };
  };
  const background = draw(null);
  const looks: Look[] = [{ ...HANLI_LOOK, hero: false },
    { ...HANLI_LOOK, hero: false, hairStyle: 'ponytail', robe: '#874942', trim: '#3a3038', faceSeed: 12345 }];
  const actions: Action[] = ['idle', 'walk', 'cast', 'hit'];
  const cases = actions.map((action, i) => {
    const look = looks[i % looks.length], yaw = i * Math.PI / 4;
    const gpu = frameFor(look, action, yaw, false), cpu = frameFor(look, action, yaw, true);
    const before = draw(gpu.frame), after = draw(cpu.frame);
    let sum = 0, max = 0, over8 = 0, pixels = 0;
    for (let p = 0; p < before.length; p += 4) {
      if (![0, 1, 2].some(c => Math.abs(before[p + c] - background[p + c]) > 3 || Math.abs(after[p + c] - background[p + c]) > 3)) continue;
      pixels++;
      for (let c = 0; c < 3; c++) { const d = Math.abs(before[p + c] - after[p + c]); sum += d; max = Math.max(max, d); if (d > 8) over8++; }
    }
    const mean = sum / (pixels * 3), changed = over8 / (pixels * 3);
    const sourceWidth = gpu.frame.image.width, sourceHeight = gpu.frame.image.height;
    const gp = gpu.frame.image.getContext('2d')!.getImageData(0, 0, sourceWidth, sourceHeight).data;
    const cp = cpu.frame.image.getContext('2d')!.getImageData(0, 0, sourceWidth, sourceHeight).data;
    const describe = (data: Uint8ClampedArray) => {
      let minX = sourceWidth, minY = sourceHeight, maxX = -1, maxY = -1, weight = 0, sx = 0, sy = 0;
      for (let y = 0; y < sourceHeight; y++) for (let x = 0; x < sourceWidth; x++) {
        const a = data[(y * sourceWidth + x) * 4 + 3];
        if (a > 8) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
        weight += a; sx += x * a; sy += y * a;
      }
      return { bounds: [minX, minY, maxX, maxY], alphaCenter: [sx / weight, sy / weight] };
    };
    let interior = 0, interiorSum = 0, interiorOver8 = 0, boundaryDifferences = 0;
    for (let y = 1; y < sourceHeight - 1; y++) for (let x = 1; x < sourceWidth - 1; x++) {
      const p = (y * sourceWidth + x) * 4;
      let opaque = true;
      for (let dy = -1; dy <= 1 && opaque; dy++) for (let dx = -1; dx <= 1; dx++) {
        const a = ((y + dy) * sourceWidth + x + dx) * 4 + 3;
        if (gp[a] < 250 || cp[a] < 250) { opaque = false; break; }
      }
      const difference = Math.max(...[0, 1, 2, 3].map(c => Math.abs(gp[p + c] - cp[p + c])));
      if (opaque) { interior++; interiorSum += difference; if (difference > 8) interiorOver8++; }
      else if (difference > 8) boundaryDifferences++;
    }
    const shifts = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      let alphaDifference = 0;
      for (let y = 1; y < sourceHeight - 1; y++) for (let x = 1; x < sourceWidth - 1; x++)
        alphaDifference += Math.abs(gp[(y * sourceWidth + x) * 4 + 3] - cp[((y + dy) * sourceWidth + x + dx) * 4 + 3]);
      shifts.push({ dx, dy, alphaDifference });
    }
    shifts.sort((a, b) => a.alphaDifference - b.alphaDifference);
    return { action, yaw, gpuReadFrequently: gpu.readFrequently, cpuReadFrequently: cpu.readFrequently, pixels,
      mean, max, changedOver8: changed, source: { gpu: describe(gp), cpu: describe(cp), bestAlphaShift: shifts[0],
        interiorPixels: interior, interiorMeanMaxChannel: interiorSum / interior, interiorOver8, boundaryDifferences },
      passed: pixels > 100 && !gpu.readFrequently && cpu.readFrequently && mean < 0.75 && changed < 0.01 };
  });
  const glError = stage.gl.getError();
  result.textContent = JSON.stringify({ passed: cases.every(item => item.passed) && glError === stage.gl.NO_ERROR, cases, glError }, null, 2);
};

document.querySelector<HTMLButtonElement>('#character-alpha')!.onclick = () => {
  const target = stage.worldTarget(960, 540), zoom = 0.55, scale = 1.06, res = 0.2;
  const chunks = Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground }));
  const random = mulberry32(20261113);
  const stateFor = (action: Action, yaw: number) => {
    const state = new CharState(0, 0); state.t = 1.01; state.seed = 17; state.phase = 1.2; state.blend = 1;
    state.action = action; state.actionT = 0.32; state.castN = 2; state.yaw = state.targetYaw = yaw;
    return state;
  };
  const draw = (frame: CharacterFrame | null, alpha: number) => {
    scene.yaw = 0; scene.begin(0, 0, zoom, 1); scene.syncGround(chunks, 1024); scene.buildings.sync([], height);
    if (frame) scene.allocStatic(0, 0, frame.l, frame.r, frame.t, frame.b,
      { image: frame.image, l: frame.l, r: frame.r, t: frame.t, b: frame.b }, false, alpha, 1);
    scene.render(target); post.world = target; post.sense.on = false; post.sat = 1;
    stage.batch.reset(0, 0, zoom, 960, 540, stage.atlas); stage.frame(overlay, 960, 540, 1, post);
    const data = new Uint8Array(960 * 540 * 4);
    stage.gl.readPixels(0, 0, 960, 540, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, data);
    return data;
  };
  const background = draw(null, 1), center = scene.ground(0, 0);
  document.getElementById('alpha-comparison')?.remove();
  const view = document.createElement('div'); view.id = 'alpha-comparison';
  view.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-top:16px';
  document.getElementById('view')!.append(view);
  const thumbnail = (pixels: Uint8Array) => {
    const image = document.createElement('canvas'); image.width = 120; image.height = 140;
    image.style.cssText = 'display:inline-block;width:120px;height:140px';
    const g = image.getContext('2d')!, data = g.createImageData(120, 140);
    const left = Math.round(center.x - 60), top = Math.round(center.y - 120);
    for (let y = 0; y < 140; y++) for (let x = 0; x < 120; x++) {
      const from = ((539 - (top + y)) * 960 + left + x) * 4, to = (y * 120 + x) * 4;
      data.data.set(pixels.subarray(from, from + 4), to);
    }
    g.putImageData(data, 0, 0); return image;
  };
  const cases = [];
  for (const [index, action] of (['idle', 'walk', 'cast'] as Action[]).entries()) {
    const look = randomLook(random, 'cultivator'), yaw = index * Math.PI / 4;
    for (const alpha of [0.25, 0.5, 0.75]) {
      const flattened = new CharacterFrameCache().prepare(look, stateFor(action, yaw), scale, 0, res);
      const source = document.createElement('canvas'); source.width = flattened.image.width; source.height = flattened.image.height;
      const g = source.getContext('2d')!, st = stateFor(action, yaw);
      g.setTransform(res, 0, 0, res, 1 + 170 * scale * res, 1 + 330 * scale * res);
      g.globalAlpha = alpha; drawCharacter(g, look, st, scale, 0);
      const direct = draw({ ...flattened, image: source }, 1), flat = draw(flattened, alpha);
      let sum = 0, max = 0, changed = 0, pixels = 0;
      for (let p = 0; p < direct.length; p += 4) {
        if (![0, 1, 2].some(c => Math.abs(direct[p + c] - background[p + c]) > 3 || Math.abs(flat[p + c] - background[p + c]) > 3)) continue;
        pixels++; let difference = 0;
        for (let c = 0; c < 3; c++) { const d = Math.abs(direct[p + c] - flat[p + c]); sum += d; max = Math.max(max, d); difference = Math.max(difference, d); }
        if (difference > 8) changed++;
      }
      const box = document.createElement('div'), label = document.createElement('div');
      label.textContent = `${action} ${Math.round(yaw * 180 / Math.PI)}° alpha=${alpha}：原逐部件 / 整图淡出`;
      box.append(label, thumbnail(direct), thumbnail(flat)); view.append(box);
      cases.push({ action, yaw, alpha, pixels, mean: sum / (pixels * 3), max, changedOver8Percent: 100 * changed / pixels });
    }
  }
  result.textContent = JSON.stringify({ cases, glError: stage.gl.getError() }, null, 2);
};

document.querySelector<HTMLButtonElement>('#geometry-batch')!.onclick = () => {
  const target = stage.worldTarget(960, 540);
  const chunks = Array.from({ length: 16 }, (_, i) => ({ cx: i % 4 - 2, cy: Math.floor(i / 4) - 2, canvas: ground }));
  const image = (color: string) => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 120;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 80, 120);
    return canvas;
  };
  const red = image('#d02010'), green = image('#10d020'), blue = image('rgba(16,32,224,0.5)');
  const triangles: CharacterTriangles = { vertices: new Float32Array([
    -40, 0, 16 / 255, 208 / 255, 32 / 255, 1, 40, 0, 16 / 255, 208 / 255, 32 / 255, 1,
    40, -120, 16 / 255, 208 / 255, 32 / 255, 1, -40, -120, 16 / 255, 208 / 255, 32 / 255, 1,
  ]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) };
  const host = scene as unknown as { bb: { visible: boolean }; workTex: CanvasTexture; staticAtlas: HdStaticAtlas };
  const samples = () => {
    post.world = target; post.sense.on = false; post.sat = 1;
    stage.batch.reset(0, 0, 1, 960, 540, stage.atlas); stage.frame(overlay, 960, 540, 1, post);
    const data = new Uint8Array(960 * 540 * 4);
    stage.gl.readPixels(0, 0, 960, 540, stage.gl.RGBA, stage.gl.UNSIGNED_BYTE, data);
    return data;
  };
  const scenarios = [
    { yaw: 0, x: 0, y: 0, frontX: 0, frontY: 0, reversed: false },
    { yaw: Math.PI / 4, x: 130, y: 40, frontX: 130, frontY: 40, reversed: false, dynamicFront: true },
    { yaw: Math.PI / 2, x: -100, y: 90, frontX: -108, frontY: 94, reversed: false, buildings: true },
    { yaw: 3 * Math.PI / 4, x: 50, y: -120, frontX: 50, frontY: -120, reversed: true },
  ];
  const key = {}, cases = [];
  let batch: HdGeometryBatch | null = null;
  try { for (const s of scenarios) {
      scene.yaw = s.yaw; scene.begin(0, 0, 1, 1); scene.syncGround(chunks, 1024);
      const location = LOC_BY_ID.get('jingzhou')!;
      scene.buildings.sync(s.buildings ? [{ id: location.id, layout: getLayout(location), x: 0, y: 0 }] : [], height);
      const add = (source: HTMLCanvasElement, x: number, y: number, seq: number, dynamic = false) => {
        if (!dynamic) return scene.allocStatic(x, y, -40, 40, -120, 0,
          { image: source, l: -40, r: 40, t: -120, b: 0 }, false, 1, 1, seq);
        const cell = scene.alloc(x, y, -40, 40, -120, 0, 1, false, 1, 1, seq)!;
        const ctx = scene.wctx; ctx.save(); ctx.setTransform(cell.Z, 0, 0, cell.Z, cell.ox, cell.oy);
        ctx.drawImage(source, x - 40, y - 120); ctx.restore(); return true;
      };
      add(red, s.x, s.y, s.reversed ? 2 : 0); add(green, s.x, s.y, 1);
      add(blue, s.frontX, s.frontY, s.reversed ? 0 : 2, s.dynamicFront);
      if (batch) batch.mesh.visible = false;
      scene.render(target); const baseline = samples();
      if (!batch) { batch = new HdGeometryBatch(host.workTex, host.staticAtlas.texture, height); scene.scene.add(batch.mesh); }
      batch.mesh.visible = true;
      batch.begin(scene.upDir.x, scene.upDir.y, scene.rightDir.x, scene.rightDir.y, scene.boost);
      for (const item of scene.items) if (item.seq !== 1) batch.addSprite(item);
      batch.addCharacter({ key, x: s.x, y: s.y, offsetX: 0, offsetY: 0, lift: 0, scale: 1, alpha: 1, seq: 1, revision: 1, triangles });
      batch.end(); host.bb.visible = false;
      scene.render(target); const mixed = samples(); host.bb.visible = true;
      const center = scene.ground(s.x, s.y);
      let innerMax = 0, wholeSum = 0, wholeOver8 = 0;
      for (let p = 0; p < baseline.length; p += 4) for (let c = 0; c < 3; c++) {
        const d = Math.abs(baseline[p + c] - mixed[p + c]); wholeSum += d; if (d > 8) wholeOver8++;
        const x = p / 4 % 960, y = 539 - Math.floor(p / 4 / 960);
        if (x > center.x - 24 && x < center.x + 24 && y > center.y - 100 && y < center.y - 20) innerMax = Math.max(innerMax, d);
      }
      const sx = Math.round(center.x), sy = 539 - Math.round(center.y - 60), centerIndex = (sy * 960 + sx) * 4;
      cases.push({ yaw: s.yaw, reversed: s.reversed, dynamicFront: !!s.dynamicFront, buildings: !!s.buildings, baseline: [...baseline.slice(centerIndex, centerIndex + 4)],
        mixed: [...mixed.slice(centerIndex, centerIndex + 4)], innerMax,
        wholeMean: wholeSum / (960 * 540 * 3), wholeOver8, passed: innerMax <= 2 });
  } } finally {
    host.bb.visible = true;
    if (batch) { scene.scene.remove(batch.mesh); batch.dispose(); }
  }
  const multiDraw = !!stage.gl.getExtension('WEBGL_multi_draw'), glError = stage.gl.getError();
  result.textContent = JSON.stringify({ passed: cases.every(item => item.passed) && glError === stage.gl.NO_ERROR,
    multiDraw, cases, glError }, null, 2);
};
