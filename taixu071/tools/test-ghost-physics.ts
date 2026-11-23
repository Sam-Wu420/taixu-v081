import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { CharState, HANLI_LOOK, drawCharacter, dressLook, DEFAULT_WARDROBE } = await import('../src/gfx/character');
const { equipmentAppearance } = await import('../src/gfx/equipmentAppearance');
const { collectCombat } = await import('../src/world/combatfx');
const { YuanyingSys } = await import('../src/world/yuanying');
const cv = createCanvas(600, 500), ctx = cv.getContext('2d') as any;
const base = dressLook(HANLI_LOOK, { ...DEFAULT_WARDROBE.f, outfit: 'guangxiu', ribbon: '#c03040' });
const equipped = equipmentAppearance(base, { armor: 'art_xuepifeng' }, true);
const st = new CharState(200, 300); st.t = 1; st.setAction('run'); st.speed = 200; st.vx = 180;
for (let i = 0; i < 15; i++) { st.x += 2; st.update(1 / 60); drawCharacter(ctx, equipped, st, 1.5, 1 / 60); }
function state(s: any) {
  return JSON.stringify({ last: s.last, hp: s.hp, hands: s.hands.map((x: any) => Array.from(x)),
    strands: Array.from(s.strands, ([k, v]: any) => [k, Array.from(v.x), Array.from(v.y), Array.from(v.ox), Array.from(v.oy), v.len, v.lastSeen, v.prevH]),
    springs: Array.from(s.springs, ([k, v]: any) => [k, { ...v }]) });
}
assert.ok(st.strands.size > 0 && st.springs.size > 0);
const before = state(st), ox = st.x, oy = st.y;
st.x += 180; st.y -= 50; drawCharacter(ctx, equipped, st, 3.5, 0, { ghost: true }); st.x = ox; st.y = oy;
assert.equal(state(st), before, 'ghost draw must not mutate main strands, springs, pose or hands');
const empty = new CharState(220, 300); drawCharacter(ctx, equipped, empty, 1.5, 0, { ghost: true });
assert.equal(empty.strands.size, 0); assert.equal(empty.springs.size, 0);
const fake: any = { units: [], summons: [], loot: [], acts: { collect() {} }, shield: null,
  ghosts: [{ x: 350, y: 260, yaw: 1.5, t: 0, dur: 1 }], decoy: { x: 130, y: 230 },
  game: { player: { look: base, st }, hero: { equip: { armor: 'art_xuepifeng' }, wardrobe: { showEquipment: true } } } };
const out: any[] = []; collectCombat(fake, out, { left: 0, top: 0, right: 600, bottom: 500 }, 1, 1 / 60);
assert.equal(out.length, 2);
const yaw = st.yaw; for (const d of out) d.draw(ctx);
assert.equal(st.x, ox); assert.equal(st.y, oy); assert.equal(st.yaw, yaw); assert.equal(state(st), before);
// 元婴真实绘制入口：开关甲外观后画面应变化，且叠色层不重复改动本体物理。
const hero: any = { equip: { armor: 'art_xuepifeng' }, wardrobe: { showEquipment: false } };
const game: any = { player: { x: 240, y: 300, look: base, st: new CharState(240, 300) }, hero, time: 1 };
const ying = new YuanyingSys(game); ying.trail = []; ying.motes = [];
game.player.st.t = 1; game.player.st.seed = 42;
ctx.clearRect(0, 0, 600, 500); ying.drawYing(ctx, 0, 1.2); const a = cv.toDataURL();
hero.wardrobe.showEquipment = true; game.player.st = new CharState(240, 300); game.player.st.t = 1; game.player.st.seed = 42;
ctx.clearRect(0, 0, 600, 500); ying.drawYing(ctx, 0, 1.2); const b = cv.toDataURL();
assert.notEqual(a, b, 'yuan ying should display equipped appearance');
console.log('ghost physics: ghost overlays, ghost/decoy callbacks, player physics and yuan ying equipment passed');
