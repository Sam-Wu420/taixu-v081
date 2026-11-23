import assert from 'node:assert/strict';
import './env';
import { followCamera } from '../src/core/cameraFollow';
import { Terrain } from '../src/world/terrain';
import { Game } from '../src/world/game';

// 镜头因目标切换而向运动方向追赶：角色屏幕坐标沿该方向不能向后。
for (const hz of [30, 60, 120, 144]) for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]]) {
  let px = 1000, py = 2000, cx = px - 200 * dir[0], cy = py - 200 * dir[1];
  for (let i = 0; i < hz * 5; i++) {
    const step = 180 / hz, dx = step * dir[0], dy = step * dir[1]; px += dx; py += dy;
    // 敌人/取景中心突然切换，偏移沿、逆、横向变化。
    const off = (i % (hz * 2) < hz ? 220 : -180), side = (i % 37) * 2;
    const next = followCamera(cx, cy, px + off * dir[0] - side * dir[1], py + off * dir[1] + side * dir[0], 1 / hz, dx, dy, true);
    const relative = (dx - (next.x - cx)) * dir[0] + (dy - (next.y - cy)) * dir[1];
    assert.ok(relative >= -1e-9, `${hz}Hz direction ${dir} relative ${relative}`);
    cx = next.x; cy = next.y;
  }
}
assert.deepEqual(followCamera(0, 0, 100, 200, 1 / 60, 0, 0, false), { x: 10, y: 20 });
assert.deepEqual(followCamera(0, 0, 100, 200, 1 / 60, 1, 0, false), { x: 10, y: 20 });
assert.deepEqual(followCamera(0, 0, 100, 200, 1 / 60, 1, 0, true), { x: 1, y: 20 });
assert.deepEqual(followCamera(0, 0, 100, 200, 0, 1, 0, true), { x: 0, y: 0 });
// 向前分量受限时，横向运镜与停步后的追赶仍然存在。
assert.ok(followCamera(0, 0, 100, 200, 1 / 60, 1, 0, true).y > 0);
assert.ok(followCamera(0, 0, 100, 0, 1 / 60, 0, 0, true).x > 0);

// 高境界高速移动（携带 stepX/stepY 与视口安全夹紧）：人物保持居中不落后，也不会跑出移动端屏幕
{
  let px = 5000, py = 5000, cx = 5000, cy = 5000;
  const speed = 7100; // 大罗仙舟遁光级别
  for (let i = 0; i < 120; i++) {
    const dt = 1 / 60;
    const step = speed * dt;
    px += step;
    const next = followCamera(cx, cy, px, py, dt, step, 0, true, {
      stepX: step, stepY: 0, anchorX: px, anchorY: py, maxOffsetX: 130, maxOffsetY: 200,
    });
    assert.ok(Math.abs(next.x - px) < 1e-6, `camera must stay centered at high speed: lag=${next.x - px}`);
    cx = next.x; cy = next.y;
  }
}

// 真机模拟：竖屏移动端（390x844）高境界疾飞时，人物屏幕坐标始终居中、绝不出屏
{
  (globalThis as any).window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
  (globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const t = new Terrain();
  t.build();
  const g = new Game(t);
  g.reset();
  g.hero.realm = 12; // 大罗
  g.hero.equip = { flight: 'art_xuankong_yunzhou' };
  g.player.x = 120000; g.player.y = 93000;
  g.cam.x = g.player.x; g.cam.y = g.player.y;
  g.player.flying = true;
  g.input.joy = { x: 1, y: 0 };
  g.input.joyMag = 1;
  for (let i = 0; i < 60; i++) {
    g.modal = null;
    g.update(1 / 60);
    const screenOffX = Math.abs(g.player.x - g.cam.x) * g.cam.zoom;
    const screenOffY = Math.abs((g.player.y - g.player.st.lift * 0.5) - g.cam.y) * g.cam.zoom;
    assert.ok(screenOffX < 195 * 0.6, `portrait mobile X off-center too far: ${screenOffX}px`);
    assert.ok(screenOffY < 422 * 0.6, `portrait mobile Y off-center too far: ${screenOffY}px`);
  }
}

console.log('camera follow: movement-axis stability across 30–144 Hz, directions, framing shifts, stationary, high-speed centering, and cinematic bypass passed');
