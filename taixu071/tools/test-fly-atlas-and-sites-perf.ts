import assert from 'node:assert/strict';
import './env';
import { WorldAtlas } from '../src/gl/worldAtlas';
import { Terrain } from '../src/world/terrain';
import { Game } from '../src/world/game';
import { ACTIVE_MAP, TN_DX, WORLD_SCALE } from '../src/data/world';
import { zipSave, unzipSave } from '../src/world/savezip';

function makeMockGl() {
  let nextTex = 1;
  let uploads = 0;
  let mipmaps = 0;
  const gl: any = {
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    LINEAR_MIPMAP_NEAREST: 0x2701,
    TEXTURE_MAX_LEVEL: 0x813d,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812f,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    createTexture: () => ({ id: nextTex++ }),
    deleteTexture: () => {},
    bindTexture: () => {},
    texParameteri: () => {},
    texImage2D: () => {},
    pixelStorei: () => {},
    texSubImage2D: () => { uploads++; },
    generateMipmap: () => { mipmaps++; },
  };
  return { gl: gl as WebGL2RenderingContext, getUploads: () => uploads, getMipmaps: () => mipmaps };
}

async function run() {
  // 1. WorldAtlas.ensure dirty flag behavior
  const { gl, getUploads, getMipmaps } = makeMockGl();
  const atlas = new WorldAtlas(gl, 512, 2);
  const cv: any = { width: 150, height: 190 };

  atlas.beginFrame();
  const e1 = atlas.ensure('PLAYER:FLY', cv, 150, 190, true);
  assert.ok(e1);
  assert.equal(getUploads(), 1);
  atlas.flushMipmaps();
  assert.equal(getMipmaps(), 1);

  // Static sprite with dirty=false reuses existing upload
  const staticCv: any = { width: 64, height: 64 };
  atlas.ensure('STATIC:1', staticCv, 64, 64);
  assert.equal(getUploads(), 2);
  atlas.beginFrame();
  atlas.ensure('STATIC:1', staticCv, 64, 64);
  assert.equal(getUploads(), 2, 'static sprite should skip re-upload when src is unchanged');

  // Reused canvas with dirty=true must re-upload in-place without leaking entries
  const e2 = atlas.ensure('PLAYER:FLY', cv, 150, 190, true);
  assert.ok(e2);
  assert.equal(e2!.px, e1!.px);
  assert.equal(e2!.py, e1!.py);
  assert.equal(getUploads(), 3, 'reused dynamic canvas with dirty=true must upload every frame');
  assert.equal(atlas.entryCount, 2);
  atlas.flushMipmaps();
  assert.equal(getMipmaps(), 2);

  // 2. SiteSys > 3000 seen sites does not thrash cache & reflects mutations immediately
  (globalThis as any).window = {
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    setTimeout, clearTimeout,
  };
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  const terrain = new Terrain();
  terrain.build();
  const g = new Game(terrain);
  const { SITE_CELL } = await import('../src/world/sites');
  const { LOC_BY_ID } = await import('../src/data/world');
  const anchor = LOC_BY_ID.get('qixuan');
  const cx0 = ACTIVE_MAP === 'renjie' && anchor ? Math.max(1, Math.floor((anchor.x * WORLD_SCALE) / SITE_CELL) - 65) : 1;
  const cy0 = ACTIVE_MAP === 'renjie' && anchor ? Math.max(1, Math.floor((anchor.y * WORLD_SCALE) / SITE_CELL) - 65) : 1;
  g.ws.sites = {};
  for (let cy = cy0; cy < cy0 + 130; cy++) {
    for (let cx = cx0; cx < cx0 + 130; cx++) {
      g.ws.sites[`${ACTIVE_MAP}|${cx},${cy}`] = { seen: 1 };
    }
  }
  const firstMarks = g.sites.marks();
  assert.ok(firstMarks.length > 3000, `expected >3000 marks, got ${firstMarks.length}`);

  const t0 = performance.now();
  for (let i = 0; i < 20; i++) g.sites.marks();
  const avgMs = (performance.now() - t0) / 20;
  assert.ok(avgMs < 12, `expected cached sites.marks() < 12ms, got ${avgMs.toFixed(2)}ms`);

  // Verify mark reflects state changes (done cooldown & expiry)
  const sample = firstMarks.find((m) => m.glyph !== '✓' && m.glyph !== '脉' && m.glyph !== '池' && m.glyph !== '庙' && m.glyph !== '碑');
  assert.ok(sample, 'expected at least one cooldown-able site mark');
  const cx = Math.floor(sample.x / SITE_CELL), cy = Math.floor(sample.y / SITE_CELL);
  const skey = `${ACTIVE_MAP}|${cx},${cy}`;
  const origGlyph = sample.glyph;
  g.ws.sites[skey].done = g.day + 100;
  const updated1 = g.sites.marks().find((m) => Math.hypot(m.x - sample.x, m.y - sample.y) < 1);
  assert.equal(updated1?.glyph, '✓', 'mark should immediately reflect done state');
  g.day += 105;
  const updated2 = g.sites.marks().find((m) => Math.hypot(m.x - sample.x, m.y - sample.y) < 1);
  assert.equal(updated2?.glyph, origGlyph, 'mark should immediately refresh when day passes done');

  // 3. incremental exploredCount matches exact array sum
  g.revealAround(true);
  g.markKnown({ id: 'test', name: '测试', type: 'city', map: ACTIVE_MAP, x: g.player.x / WORLD_SCALE, y: g.player.y / WORLD_SCALE, ox: 0, oy: 0 } as any);
  g.updateUI(true);
  let exact = 0;
  for (let i = 0; i < g.explored.length; i++) exact += g.explored[i];
  assert.ok(Math.abs(g.ui.explored - exact / g.explored.length) < 1e-12, 'exploredCount must match exact sum');

  // 4. zipSave/unzipSave lossless round-trip
  const sampleJson = JSON.stringify({
    msg: '太虚七一 · 风雷翅飞行与秘境奇遇测试',
    arr: Array.from({ length: 500 }, (_, i) => ({ id: i, name: '弟子甲' + (i % 17), x: 12345.67, y: 8910.11 })),
  });
  const z = zipSave(sampleJson);
  assert.equal(unzipSave(z), sampleJson);

  console.log(`PASS: fly-atlas & sites-perf (marks=${firstMarks.length}, avg=${avgMs.toFixed(2)}ms)`);
}

run();
