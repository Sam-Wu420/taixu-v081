import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { CharState, HANLI_LOOK, drawCharacter, type Action, type Look } from '../src/gfx/character';
import { WORLD_W, WORLD_H } from '../src/data/world';

Object.assign(globalThis, {
  window: { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);
game.input.keys.add('d');
game.combat.cast('huodan');
assert.ok(game.combat.castT > 0);
for (let i = 0; i < 10; i++) {
  game.update(1 / 60);
  assert.equal(game.player.st.action, 'cast', '走动施法应保持连续动作');
  assert.equal(game.player.st.castN, 1, '一次施法只能切换一次施法式');
  assert.ok(game.player.st.actionT > i / 60, '动作时间应随帧推进');
}
for (let i = 0; i < 15; i++) game.update(1 / 60);
assert.notEqual(game.player.st.action, 'cast');
game.combat.cds.clear(); game.combat.cast('huodan'); game.update(1 / 60);
assert.equal(game.player.st.action, 'cast'); assert.equal(game.player.st.castN, 2);
game.player.flying = true; game.hero.realm = 2;
game.combat.cds.clear(); game.combat.cast('huodan'); game.update(1 / 60);
assert.equal(game.player.st.action, 'fly', '飞行施法按既有动作优先级保持飞行');

const canvas = createCanvas(400, 400), ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const actions: Action[] = ['walk', 'run', 'cast', 'fly'];
type Scenario = { label: string; dt: number[]; look: Look; strands?: string[] };
const scenarios: Scenario[] = [
  { label: '60Hz', dt: [1 / 60], look: HANLI_LOOK },
  { label: '144Hz', dt: [1 / 144], look: HANLI_LOOK },
  { label: '变帧与 100ms 卡顿', dt: [1 / 144, 1 / 60, 1 / 144, 1 / 60], look: HANLI_LOOK },
  { label: '长发披风披帛', dt: [1 / 60, 1 / 144], look: { ...HANLI_LOOK, hero: false, sex: 'f', hairStyle: 'long', over: 'cape', shawl: '#f0dbe5' }, strands: ['hairLong', 'capeL', 'capeR', 'capeM', 'shawlL', 'shawlR'] },
  { label: '马尾', dt: [1 / 60, 1 / 144], look: { ...HANLI_LOOK, hero: false, hairStyle: 'ponytail' }, strands: ['pony'] },
];
for (const scenario of scenarios) {
  const a = new CharState(0, 0), b = new CharState(WORLD_W - 2000, WORLD_H - 2000);
  for (const st of [a, b]) { st.t = 0; st.seed = 17; }
  let elapsed = 0, maxDrift = 0, maxStretch = 0, samples = 0, firstDivergence = '';
  for (let frame = 0; frame < 140; frame++) {
    const dt = scenario.label.startsWith('变帧') && frame === 50 ? 0.1 : scenario.dt[frame % scenario.dt.length]; elapsed += dt;
    const dx = Math.sin(elapsed * 2) * 100, dy = Math.cos(elapsed * 1.7) * 60;
    const vx = Math.cos(elapsed * 2) * 200, vy = -Math.sin(elapsed * 1.7) * 102;
    const action = actions[Math.floor(elapsed / 0.6) % actions.length];
    for (const [st, ox, oy] of [[a, 0, 0], [b, WORLD_W - 2000, WORLD_H - 2000]] as const) {
      st.x = ox + dx; st.y = oy + dy; st.vx = vx; st.vy = vy;
      st.lift += ((action === 'fly' ? 50 : 0) - st.lift) * Math.min(1, dt * 4);
      st.setAction(action); st.faceToward(vx, vy, false); st.update(dt);
      ctx.setTransform(1, 0, 0, 1, 200 - st.x, 310 - st.y);
      drawCharacter(ctx, scenario.look, st, 1, dt);
      for (const s of st.strands.values()) for (let i = 1; i < s.n; i++) {
        assert.ok(Number.isFinite(s.x[i]) && Number.isFinite(s.y[i]), '布料坐标必须有限');
        maxStretch = Math.max(maxStretch, Math.hypot(s.x[i] - s.x[i - 1], s.y[i] - s.y[i - 1]) / s.len);
        samples++;
      }
      for (const s of st.springs.values()) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.vx) && Number.isFinite(s.vy), '衣物弹簧必须有限');
    }
    assert.deepEqual([...a.strands.keys()], [...b.strands.keys()]);
    for (const [key, sa] of a.strands) {
      const sb = b.strands.get(key)!;
      for (let i = 0; i < sa.n; i++) {
        const drift = Math.hypot(sb.x[i] - (WORLD_W - 2000) - sa.x[i], sb.y[i] - (WORLD_H - 2000) - sa.y[i]);
        if (drift > 0.01 && !firstDivergence) firstDivergence = frame + ':' + key + ':' + i + ':' + drift.toFixed(6);
        maxDrift = Math.max(maxDrift, drift);
      }
    }
  }
  assert.ok(samples > 0);
  for (const key of scenario.strands ?? []) assert.ok(a.strands.has(key), '应绘制到 ' + key);
  assert.ok(maxStretch < 12, '衣料不应被拉到不合理的长度');
  console.log(scenario.label + ': segments=' + samples + ', max stretch=' + maxStretch.toFixed(3) + ', near/far drift=' + maxDrift.toFixed(6) + ' world units' + (firstDivergence ? ', first=' + firstDivergence : ''));
  assert.ok(maxDrift < 0.01, '地图边缘布料应与相同行为的近坐标布料接近');
}
console.log('PASS 真实施法状态及真实角色绘制、远坐标布料和变帧');
