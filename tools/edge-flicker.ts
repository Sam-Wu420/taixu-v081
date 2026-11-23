import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
import type { Game } from '../src/world/game';

const element = (id: string) => document.getElementById(id) as HTMLElement;
const status = element('edge-status'), readout = element('edge-readout');
let game: Game, mode: 'move' | 'walk' | 'rotate' | 'proof' | null = null, start = 0, proofAngle = 0;
let center = { x: 0, y: 0 };
function reset() {
  const location = LOC_BY_ID.get('huangfeng')!;
  game.reset(); game.story['openT'] = -1; game.closeModal(true);
  game.hero.realm = 1; game.hero.stage = 4; game.hero.hp = game.hero.mp = 1;
  center = { x: location.x * WORLD_SCALE - 700, y: location.y * WORLD_SCALE + 600 };
  game.teleport(center.x, center.y); game.space.update(1, center.x, center.y);
  game.cam.zoom = game.cam.targetZoom = 0.6;
  game.camYaw = game.camYawTarget = 0;
  game.clock = 100; game.setWeather('clear'); game.paused = false;
  setTimeout(() => { game.paused = true; }, 2200);
  game.revealAll = false; game.debugSeeAll = false;
  mode = null; status.textContent = '青霞谷西侧，冻结场景；可往返移动和转镜。';
}
element('edge-reset').onclick = reset;
element('edge-sweep').onclick = () => { mode = 'move'; start = performance.now(); };
element('edge-rotate').onclick = () => { mode = 'rotate'; start = performance.now(); };
element('edge-stop').onclick = () => { mode = null; game.input.keys.clear(); game.paused = true; };
element('edge-reveal').onclick = () => { game.revealAll = !game.revealAll; };
element('edge-sense').onclick = () => { game.debugSeeAll = !game.debugSeeAll; };
element('edge-freeze').onclick = () => { game.paused = !game.paused; };
const walkButton = document.createElement('button'); walkButton.textContent = '角色行走往返'; readout.before(walkButton);
walkButton.onclick = () => { mode = 'walk'; start = performance.now(); game.paused = false; };
for (const [label, angle] of [['闪烁点前一帧', 0.3656882531239978 * 19 / 20], ['闪烁点后一帧', 0.3656882531239978]] as const) {
  const button = document.createElement('button'); button.textContent = label;
  readout.before(button);
  button.onclick = () => { game.paused = true; game.cam.zoom = game.cam.targetZoom = 1; proofAngle = angle; mode = 'proof'; };
}
const ready = setInterval(() => {
  const candidate = (window as Window & { __game?: Game }).__game;
  if (!candidate?.running) return;
  clearInterval(ready); game = candidate; reset();
  let lastReadout = 0;
  const frame = (now: number) => {
    const time = (now - start) / 1000;
    if (mode === 'move') { game.cam.x = center.x + Math.sin(time * 0.7) * 520; game.cam.y = center.y + Math.sin(time * 0.4) * 250; }
    if (mode === 'walk') { game.input.keys.delete('a'); game.input.keys.delete('d'); game.input.keys.add(Math.floor(time / 8) % 2 ? 'a' : 'd'); }
    if (mode === 'rotate') game.camYaw = game.camYawTarget = Math.sin(time * 0.35) * Math.PI;
    if (mode === 'proof') { game.cam.x = 250544.47; game.cam.y = 139253.41; game.camYaw = game.camYawTarget = proofAngle; }
    if (now - lastReadout > 300) {
      lastReadout = now;
      readout.textContent = JSON.stringify({ player: { x: game.player.x, y: game.player.y }, cam: game.cam, yaw: game.camYaw, height: game.terrain.surfaceHeight(game.player.x, game.player.y), reveal: game.revealAll, senseOff: game.debugSeeAll, grass: game.renderer.stats.grass, trees: game.renderer.stats.trees, viewport: [innerWidth,innerHeight] }, null, 2);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
},100);
