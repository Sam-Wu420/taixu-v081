import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Combat } = await import('../src/world/combat');
const { audio } = await import('../src/world/audio');
(audio.dir as any).hit = () => {};
const enemy = () => ({ dead: false, hideT: 0, hp: 1000, maxHp: 1000, dfn: 10, realm: 1, guardT: 0, st: {}, def: { id: 'x', kind: 'beast', hp: 1 }, x: 20, y: 30, anim: { hit: 0 }, kx: 0, ky: 0, hitFlash: 0 });
const hero: any = { hp: 1, realm: 1, equip: {}, dead: false };
const c: any = { game: { hero, player: { x: 0, y: 0, st: { lift: 0 } }, time: 1, juice() {}, hurtFlash: 0 }, pStats: { hp: 1000, def: 10 }, acts: { list: [] }, invulnT: 0, dash: null, lingdun: { hp: [], layers: 0 }, shield: null, pst: {}, enemies: [], U: [], texts: [], fxq: [], vfx: [], sparks: [], hitY: () => 30, foe: { phase() {} } };
const callEnemy = (e: any, raw: number) => Combat.prototype.hitEnemy.call(c, e, raw, { realm: 1, stCh: 0 }, 0, 0);
const callPlayer = (raw: number) => Combat.prototype.hitPlayer.call(c, raw, 1, undefined, 1, 1);
const random = Math.random; Math.random = () => 0.5;
try {
  let e = enemy(); callEnemy(e, 100); assert.equal(e.hp, 908);
  callPlayer(100); assert.equal(hero.hp, 0.908);
  hero.hp = 1; c.shield = { amt: 200, reflect: 0 }; callPlayer(100); assert.equal(hero.hp, 1); assert.equal(c.shield.amt, 108); c.shield = null;
  e = enemy(); (e as any).ward = { hp: 200, col: '255,255,255', t: 0 }; callEnemy(e, 100); assert.equal(e.hp, 1000); assert.equal((e as any).ward.hp, 108);
  for (const bad of [NaN, Infinity, -Infinity, -1]) {
    e = enemy(); callEnemy(e, bad); assert.equal(e.hp, 1000);
    hero.hp = 1; callPlayer(bad); assert.equal(hero.hp, 1);
    e = enemy(); Combat.prototype.npcHit.call(c, undefined, e as any, bad, 1, undefined, 0, 0); assert.equal(e.hp, 1000);
    const ref = { hp: 1, kind: 'puppet' }; Combat.prototype.tankHit.call(c, { k: 'summon', ref, x: 0, y: 0, w: 1 } as any, bad, 1, undefined, 0, 0); assert.equal(ref.hp, 1);
  }
  // 不可信的来源位置不能让击退/护盾方向成为 NaN，也不能先扣血。
  hero.hp = 1;
  for (const bad of [NaN, Infinity, -Infinity]) {
    Combat.prototype.hitPlayer.call(c, 100, 1, { k: 'knock', ch: 1, dur: 1 } as any, bad, 0);
    assert.equal(hero.hp, 1); assert.equal(c.game.player.x, 0); assert.equal(c.game.player.y, 0);
  }
  hero.hp = 1; c.pStats.hp = 0; callPlayer(100); assert.equal(hero.hp, 1); c.pStats.hp = 1000;
  c.shield = { amt: NaN }; callPlayer(100); assert.equal(hero.hp, 1); c.shield = null;
  c.lingdun.hp = [NaN]; callPlayer(100); assert.equal(hero.hp, 1); c.lingdun.hp = [];
  e = enemy(); (e as any).ward = { hp: NaN }; callEnemy(e, 100); assert.equal(e.hp, 1000);
  e = enemy(); Combat.prototype.npcHit.call(c, undefined, e as any, 100, 1, undefined, 0, 0); assert.ok(e.hp < 1000 && Number.isFinite(e.hp));
  const ref = { hp: 1, kind: 'puppet' }; Combat.prototype.tankHit.call(c, { k: 'summon', ref, x: 0, y: 0, w: 1 } as any, 100, 1, undefined, 0, 0); assert.ok(ref.hp < 1 && Number.isFinite(ref.hp));
  const tick = (st: any, dt: number, cb: (n: number) => void) => (Combat.prototype as any).tickStatuses.call(c, st, dt, cb);
  let sum = 0; const st: any = { burn: { t: 0.1, dps: 10 }, poison: { t: 0.5, dps: 4, stacks: 2 } };
  tick(st, 1, d => sum += d); assert.equal(sum, 5); assert.deepEqual(st, {});
  const broken: any = { burn: { t: Infinity, dps: 1 }, poison: { t: 1, dps: Infinity } }; tick(broken, 0.1, () => assert.fail()); assert.deepEqual(broken, {});
  const paused: any = { burn: { t: 1, dps: 2 } }; tick(paused, 0, () => assert.fail()); tick(paused, NaN, () => assert.fail()); assert.equal(paused.burn.t, 1);
  const root: any = { root: { t: 30 } }; tick(root, 1, () => assert.fail()); assert.equal(root.root.t, 29); // 部分既有控制状态没有 dps
  const s: any = {}; Combat.prototype.applyStatus.call(c, s, { k: 'burn', dur: Infinity, ch: 1 }, 10, null, 0, 0); assert.deepEqual(s, {});
} finally { Math.random = random; }
console.log('combat safety: normal direct hits, invalid damage/shields, NPC/summon, DOT expiry and invalid statuses passed');
