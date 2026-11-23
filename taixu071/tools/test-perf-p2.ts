// P2 回归测试：角色 16向×8姿态 帧图集、单帧烘焙预算、<12px 2px点配额、100 NPC 同屏合批提交
import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { CharState, HANLI_LOOK } from '../src/gfx/character';
import { readFileSync } from 'node:fs';
import { CHAR_FRAME_SCALE, CHAR_FRAME_W, charFrames, charLookKey, charPoseBucket, CHAR_DOT_LIMIT, getDotSprite, getShadowSprite } from '../src/gfx/charAtlas';
import { flierEnabled, setFlierEnabled, walkerDensity, setWalkerDensity, Life } from '../src/world/life';
import { WorldAtlas } from '../src/gl/worldAtlas';
import { WorldSpriteBatch } from '../src/gl/worldBatch';
import { isInFormationFrontSector, tickFormation, type WarFormation } from '../src/world/warformation';

// 1) Look 哈希去重 + 16×8 姿态分桶
const cloneLook = { ...HANLI_LOOK };
assert.equal(charLookKey(HANLI_LOOK), charLookKey(cloneLook), 'identical looks share frame atlas key');
const diffLook = { ...HANLI_LOOK, robe: '#a03030' };
assert.notEqual(charLookKey(HANLI_LOOK), charLookKey(diffLook));

const st = new CharState(0, 0);
st.yaw = Math.PI * 0.5;
st.action = 'walk';
st.phase = 2.0;
const b1 = charPoseBucket(st);
assert.equal(b1.dir16, 4);
assert.ok(b1.pose8 >= 1 && b1.pose8 <= 4);
st.action = 'sit';
assert.equal(charPoseBucket(st).pose8, 5);
st.action = 'fly';
assert.equal(charPoseBucket(st).pose8, 6);

// 2) 帧缓存命中与复用
charFrames.clear();
charFrames.beginFrame();
const f1 = charFrames.get(HANLI_LOOK, st);
assert.ok(f1, 'first frame bakes within budget');
const f2 = charFrames.get(cloneLook, st);
assert.strictEqual(f2, f1, 'second lookup with identical look reuses cached frame');
assert.equal(charFrames.bakes, 1);
assert.equal(charFrames.hits, 1);

// 3) 点配额上限（300）与重要人物例外
charFrames.beginFrame();
let okCount = 0;
for (let i = 0; i < CHAR_DOT_LIMIT + 50; i++) {
  if (charFrames.takeDot(false)) okCount++;
}
assert.equal(okCount, CHAR_DOT_LIMIT);
assert.equal(charFrames.takeDot(true), true, 'important actor bypasses dot cap');

// 4) 100 名人物在中景（12~40px）+ 远景（<12px）同屏合批进 WorldSpriteBatch
const tex = { id: 1 } as unknown as WebGLTexture;
const noop = () => {};
const mockGl = {
  TEXTURE_2D: 1, RGBA: 2, RGBA8: 3, UNSIGNED_BYTE: 4, LINEAR: 5, CLAMP_TO_EDGE: 6,
  TEXTURE_MIN_FILTER: 7, TEXTURE_MAG_FILTER: 8, TEXTURE_WRAP_S: 9, TEXTURE_WRAP_T: 10,
  UNPACK_PREMULTIPLY_ALPHA_WEBGL: 11,
  createTexture: () => tex, deleteTexture: noop, bindTexture: noop,
  texImage2D: noop, texSubImage2D: noop, texParameteri: noop, pixelStorei: noop,
} as unknown as WebGL2RenderingContext;
const atlas = new WorldAtlas(mockGl);
const batch = new WorldSpriteBatch();

const dot = getDotSprite();
const sh = getShadowSprite();
assert.equal(dot.w, 8);
assert.equal(sh.w, 32);

const t0 = performance.now();
atlas.beginFrame();
batch.reset();
charFrames.beginFrame();
// 先预热好 1 帧模板（模拟运行中大部分状态已在缓存中）
const cachedFrame = charFrames.get(HANLI_LOOK, st)!;
const dotEntry = atlas.ensure(dot.key, dot.canvas, dot.w, dot.h)!;
const shEntry = atlas.ensure(sh.key, sh.canvas, sh.w, sh.h)!;
const chEntry = atlas.ensure(cachedFrame.key, cachedFrame.canvas, cachedFrame.w, cachedFrame.h)!;

for (let i = 0; i < 100; i++) {
  batch.push(shEntry.tex, i * 16, 100, 32, 12, shEntry.u0, shEntry.v0, shEntry.u1, shEntry.v1, 1, 1, 1, 1, 0);
  batch.push(chEntry.tex, i * 16, 100, 96 * 0.25, 128 * 0.25, chEntry.u0, chEntry.v0, chEntry.u1, chEntry.v1, 1, 1, 1, 1, 0);
  batch.push(dotEntry.tex, i * 16, 200, 4, 4, dotEntry.u0, dotEntry.v0, dotEntry.u1, dotEntry.v1, 0.81, 0.37, 0.34, 1, 0);
}
const submitMs = performance.now() - t0;
assert.equal(batch.n, 300);
assert.equal(batch.segs.length, 1, '100 characters + shadows + dots share 1 atlas page = 1 batch segment');
assert.ok(submitMs < 15, `100-NPC batch submission took ${submitMs.toFixed(2)}ms`);

// Verify canvas stub works for dot/shadow sprites
assert.ok(createCanvas(8, 8));

// 5) 中景缩放区间（z=0.46, dpr=1.5 → screenH≈103px）必须命中 charFrames 与 GPU 合批，且 occAlpha 做邻近剔除
assert.ok(CHAR_FRAME_SCALE >= 0.75 && CHAR_FRAME_W >= 120, 'charFrames resolution supports crisp mid-zoom rendering');
const npcSrc = readFileSync(new URL('../src/world/npc.ts', import.meta.url), 'utf8');
const combatSrc = readFileSync(new URL('../src/world/combatfx.ts', import.meta.url), 'utf8');
const lifeSrc = readFileSync(new URL('../src/world/life.ts', import.meta.url), 'utf8');
const renderSrc = readFileSync(new URL('../src/world/render.ts', import.meta.url), 'utf8');
assert.ok(npcSrc.includes('screenH <= 125'), 'npc.ts enables charFrames & GL batch up to screenH <= 125');
assert.ok(combatSrc.includes('screenH <= 125'), 'combatfx.ts enables charFrames & GL batch up to screenH <= 125');
assert.ok(lifeSrc.includes('screenH <= 125') && lifeSrc.includes('pushAtlasSpr'), 'life.ts Walker uses charFrames & GL batch up to screenH <= 125');
assert.ok(renderSrc.includes('Math.abs(pl.x - o.x) <= reachX'), 'render.ts occAlpha culls distant objects before spriteMask/getImageData');

// 6) 氛围组开关（空中御剑路人 + 城镇无名行人密度）
setFlierEnabled(false);
assert.equal(flierEnabled(), false);
setFlierEnabled(true);
assert.equal(flierEnabled(), true);
setWalkerDensity(30);
assert.equal(walkerDensity(), 30);
setWalkerDensity(0);
assert.equal(walkerDensity(), 0);
setWalkerDensity(100);
assert.equal(walkerDensity(), 100);
const lifeInst = new Life();
lifeInst.pruneAmbient();

// 7) 战阵平滑转向 + 仅正面扇区属于攻击范围（阵后方敌人不进攻击范围，转向不瞬间抽搐）
const leaderStub: any = { id: 100, x: 0, y: 0, hx: 0, hy: 0, dead: false, gone: false, realm: 1, sub: 1 };
const fFront: WarFormation = {
  id: 901, sid: '青云剑宗', ours: true, leader: leaderStub,
  x: 0, y: 0, anchorX: 0, anchorY: 0, face: 1, faceY: 1, faceAng: 0, targetFaceAng: 0,
  pattern: 'square', soldiers: 36, soldiersMax: 36, school: '剑',
  volleyCd: 0, collapsed: false, collapseT: 0, moving: false,
  doctrineAtk: 1, doctrineDef: 1, mp: 500, mpMax: 500, musterT: 0,
};
assert.equal(isInFormationFrontSector(fFront, 600, 0), true, 'enemy directly in front is in attack sector');
assert.equal(isInFormationFrontSector(fFront, 450, 220), true, 'enemy in front-flank is in attack sector');
assert.equal(isInFormationFrontSector(fFront, -600, 0), false, 'enemy behind formation is NOT in attack sector');
assert.equal(isInFormationFrontSector(fFront, -80, 400), false, 'enemy on rear flank is NOT in attack sector');

const rearEnemy = { x: -550, y: 0, dead: false, hideT: 0, hp: 100, maxHp: 100, id: 1, def: { name: '劫修', ranged: false } };
const mockGame: any = {
  time: 10,
  sectwar: { formations: [fFront], doctrineMod: () => ({ atk: 1, def: 1 }) },
  player: { x: 2000, y: 0, dead: false, hp: 100, maxHp: 100 },
  combat: {
    enemies: [rearEnemy],
    allies: [],
    projs: [],
    texts: [],
    sparks: [],
  },
};
tickFormation(fFront, mockGame, 0.1, [fFront], 'hold');
assert.equal(mockGame.combat.projs.length, 0, 'formation must NOT shoot enemies behind it');
assert.ok(Math.abs(fFront.faceAng!) < 0.25, `formation turn must be gradual rather than instant snap (got faceAng=${fFront.faceAng})`);

console.log(`P2 tiered character pipeline passed (100-NPC batch submit ${submitMs.toFixed(2)}ms, 1 GPU segment)`);
