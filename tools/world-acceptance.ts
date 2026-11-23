import { ACTIVE_MAP } from '../src/data/world';
import { DAY_CYCLE, SLOT_KEYS, type Game } from '../src/world/game';
import { terrainChunkJobs } from '../src/world/terrain-chunk-jobs';
import { RouteRunner, sceneMaps, sectRoute, townRoute, type SceneId } from './world-acceptance-routes';

type GameWindow = Window & { __game?: Game };
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = get<HTMLElement>('world-status'), readout = get<HTMLElement>('world-readout'), logNode = get<HTMLElement>('world-log');
const workerReadout = document.createElement('p');
readout.before(workerReadout);
const sceneButtons: Record<SceneId, HTMLButtonElement> = {
  qixuan: get('scene-qixuan'), huangfeng: get('scene-huangfeng'),
  jingzhou: get('scene-jingzhou'), yejia: get('scene-yejia'),
};
const controls = ['route-start', 'route-pause', 'route-reverse', 'rotate-left', 'rotate-right', 'zoom-out', 'zoom-in', 'fly', 'save', 'load', 'debug-reveal', 'debug-sense']
  .map(id => get<HTMLButtonElement>(id));
const safeOrigin = location.hostname === '127.0.0.1' && location.port === '5214';
const pendingKey = 'taixu.worldAcceptance.scene';
const logs: string[] = [];
let game: Game, runner: RouteRunner | null = null, autoReloaded = false, lastFrame = 0, lastDisplay = 0;
let reportedArrival = false, reportedStuck = false;

get('save-origin').textContent = safeOrigin ? '独立 5214 存档' : '请使用 127.0.0.1:5214';
function log(message: string): void {
  logs.unshift(`${new Date().toLocaleTimeString()}  ${message}`);
  logs.length = Math.min(logs.length, 20);
  logNode.textContent = logs.join('\n');
}
function enabled(active: boolean): void {
  for (const button of controls) button.disabled = !active || !safeOrigin;
}
function slot(): number { return ACTIVE_MAP === 'dajin' ? 2 : 3; }

function save(): boolean {
  if (!safeOrigin) return false;
  const ok = game.save(slot());
  log(ok ? `存档成功：${SLOT_KEYS[slot()]}，坐标 ${game.player.x.toFixed(1)}, ${game.player.y.toFixed(1)}` : '存档失败');
  return ok;
}
function load(align: boolean): boolean {
  if (!safeOrigin) return false;
  const before = { x: game.player.x, y: game.player.y }, ok = game.load(SLOT_KEYS[slot()]);
  if (!ok) { log('重载失败：当前地图没有可用存档'); return false; }
  if (align) runner?.align(); else runner?.rebase();
  const moved = Math.hypot(game.player.x - before.x, game.player.y - before.y);
  log(`重载成功：坐标 ${game.player.x.toFixed(1)}, ${game.player.y.toFixed(1)}，位置变化 ${moved.toFixed(1)}，足底高度 ${game.terrain.surfaceHeight(game.player.x, game.player.y).toFixed(1)}`);
  return true;
}

function select(id: SceneId): void {
  const map = sceneMaps[id];
  if (map !== ACTIVE_MAP) {
    sessionStorage.setItem(pendingKey, id);
    const url = new URL(location.href); url.searchParams.set('map', map);
    status.textContent = `正在进入${map === 'dajin' ? '中州' : '南荒'}，随后准备所选场景…`;
    location.assign(url.toString());
    return;
  }
  try {
    runner?.pause();
    game.reset(); game.story['openT'] = -1; game.closeModal(true); game.paused = false;
    game.hero.realm = 2; game.hero.stage = 1; game.hero.exp = 0; game.hero.hp = game.hero.mp = 1;
    if (!Object.values(game.stats).every(Number.isFinite)) throw new Error('角色派生数值无效');
    game.setWeather('clear'); game.clock = DAY_CYCLE * 0.5;
    game.input.keys.clear(); game.input.joy.x = game.input.joy.y = 0; game.input.joyMag = 0; game.input.run = false;
    game.camYaw = game.camYawTarget = 0;
    const route = id === 'qixuan' || id === 'huangfeng' ? sectRoute(game, id) : townRoute(game, id);
    const start = route.points[0];
    game.teleport(start.x, start.y); game.space.update(1, start.x, start.y);
    game.cam.zoom = game.cam.targetZoom = id === 'yejia' ? 0.8 : 1;
    game.updateUI(true);
    runner = new RouteRunner(game, route); autoReloaded = false; reportedArrival = false; reportedStuck = false;
    for (const [key, button] of Object.entries(sceneButtons)) button.classList.toggle('selected', key === id);
    enabled(true); status.textContent = `${route.name}已就绪；点击开始行走。`;
    log(`${route.name}：${route.description}；角色筑基中期，步行。`);
    show();
  } catch (error) {
    runner = null; enabled(false);
    status.textContent = `场景准备失败：${error instanceof Error ? error.message : String(error)}`;
    log(status.textContent);
  }
}

function show(): void {
  if (!runner) return;
  const p = game.player, surface = game.terrain.surface.sample(p.x, p.y);
  const renderer = game.renderer, atmo = renderer.atmoRect, hd = renderer.hd;
  const screen = hd?.ground(p.x, p.y);
  const depth = hd ? hd.depthAt(p.x, p.y, surface.height + p.st.lift * hd.boost) * 0.5 + 0.5 : null;
  const phase = game.halted ? '游戏对话或暂停' : runner.stuckSeconds >= 3 ? '卡住' : runner.arrived ? '已到达' : runner.active ? '行走中' : '已暂停';
  readout.textContent = `${runner.route.name} · ${phase} · ${runner.direction === 1 ? '正向' : '反向'}\n`
    + `坐标 ${p.x.toFixed(1)}, ${p.y.toFixed(1)} · 路点 ${runner.waypoint + 1}/${runner.route.points.length}\n`
    + `已走 ${runner.distance.toFixed(0)} / 路线 ${runner.length.toFixed(0)} · 卡住 ${runner.stuckSeconds.toFixed(1)} 秒\n`
    + `足底高度 ${surface.height.toFixed(1)} · 坡度 ${surface.slope.toFixed(3)} · ${surface.walkable ? '可落脚' : '陡坡'}\n`
    + `境界 ${game.hero.realm} 阶段 ${game.hero.stage} · ${p.flying ? '飞行' : '步行'} · 角度 ${(game.camYaw * 180 / Math.PI).toFixed(0)}° · 缩放 ${game.cam.zoom.toFixed(2)}\n`
    + `镜头 ${game.cam.x.toFixed(1)}, ${game.cam.y.toFixed(1)} · 主角屏幕 ${screen ? `${screen.x.toFixed(1)}, ${screen.y.toFixed(1)}` : '无 HD2D'} · 深度 ${depth === null ? '无' : depth.toFixed(5)}\n`
    + `氛围范围 ${atmo.x.toFixed(1)}, ${atmo.y.toFixed(1)} · ${atmo.w.toFixed(1)} × ${atmo.h.toFixed(1)}\n`
    + `神识 ${game.sense.toFixed(1)} · 半径 ${game.senseRadius.toFixed(1)} · 显示半径 ${renderer.sense.dispR.toFixed(1)} · 滤镜 ${game.revealAll && game.debugSeeAll ? '关闭' : '开启'}\n`
    + `探索雾 ${game.revealAll ? '隐藏' : '显示'} · 神识显色请求 ${game.debugSeeAll ? '开' : '关'} · 天光 ${game.light.toFixed(2)} · 夜色 ${game.night.toFixed(2)} · 天气 ${game.weather.kind}`;
  get<HTMLButtonElement>('debug-reveal').textContent = `揭示全图：${game.revealAll ? '开' : '关'}`;
  get<HTMLButtonElement>('debug-sense').textContent = `神识显色：${game.debugSeeAll ? '开' : '关'}`;
}

function showWorker(): void {
  const stats = terrainChunkJobs(game.terrain).stats;
  workerReadout.textContent = `地形 Worker ${stats.state} · 排队 ${stats.queued} · 工作中 ${stats.inflight ? '是' : '否'} · 完成 ${stats.completed} · 最近 ${stats.lastBakeMs.toFixed(1)} ms`;
}

function frame(now: number): void {
  const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  if (runner) {
    runner.step(dt);
    if (!autoReloaded && runner.active && runner.distance >= runner.length * 0.5) {
      autoReloaded = true;
      log('到达路线中段，执行自动存档并立即重载。');
      if (save()) load(false);
    }
    if (runner.arrived && !reportedArrival) { reportedArrival = true; log('到达路线终点；可反向行走。'); }
    if (runner.stuckSeconds >= 3 && !reportedStuck) { reportedStuck = true; log(`行走疑似受阻：路点 ${runner.waypoint + 1}，坐标 ${game.player.x.toFixed(1)}, ${game.player.y.toFixed(1)}`); }
    if (runner.stuckSeconds < 0.1) reportedStuck = false;
  }
  if (now - lastDisplay >= 250) { show(); showWorker(); lastDisplay = now; }
  requestAnimationFrame(frame);
}

for (const id of Object.keys(sceneButtons) as SceneId[]) sceneButtons[id].addEventListener('click', () => select(id));
get<HTMLButtonElement>('route-start').addEventListener('click', () => {
  if (runner?.arrived) { log('已到端点，请先点反向行走。'); return; }
  runner?.start(); log('开始沿路线行走。');
});
get<HTMLButtonElement>('route-pause').addEventListener('click', () => { runner?.pause(); log('已暂停路线行走。'); });
get<HTMLButtonElement>('route-reverse').addEventListener('click', () => { runner?.reverse(); reportedArrival = false; log('路线已反向。'); });
get<HTMLButtonElement>('rotate-left').addEventListener('click', () => { game.camYawTarget -= Math.PI / 4; });
get<HTMLButtonElement>('rotate-right').addEventListener('click', () => { game.camYawTarget += Math.PI / 4; });
get<HTMLButtonElement>('zoom-out').addEventListener('click', () => game.zoomBy(0.8));
get<HTMLButtonElement>('zoom-in').addEventListener('click', () => game.zoomBy(1.25));
get<HTMLButtonElement>('fly').addEventListener('click', () => {
  const before = game.player.flying; game.toggleFly();
  log(before === game.player.flying ? '飞行状态未改变，请查看游戏提示。' : game.player.flying ? '已切换飞行。' : '已落地步行。');
});
get<HTMLButtonElement>('save').addEventListener('click', () => { save(); });
get<HTMLButtonElement>('load').addEventListener('click', () => { load(true); });
get<HTMLButtonElement>('debug-reveal').addEventListener('click', () => {
  game.revealAll = !game.revealAll; game.renderer.resetStill(); show(); log(`揭示全图：${game.revealAll ? '开' : '关'}`);
});
get<HTMLButtonElement>('debug-sense').addEventListener('click', () => {
  game.debugSeeAll = !game.debugSeeAll; game.renderer.resetStill(); show(); log(`神识显色请求：${game.debugSeeAll ? '开' : '关'}`);
});

const ready = window.setInterval(() => {
  const candidate = (window as GameWindow).__game;
  if (!candidate?.running || !candidate.renderer) return;
  game = candidate; clearInterval(ready);
  if (!safeOrigin) { status.textContent = '请从 127.0.0.1:5214 打开此页；验收操作已禁用。'; return; }
  for (const button of Object.values(sceneButtons)) button.disabled = false;
  status.textContent = '正常新局已启动；请选择场景。';
  log(`已启动 ${ACTIVE_MAP === 'dajin' ? '中州' : '南荒'}，存读档限定于本测试 origin。`);
  const pending = sessionStorage.getItem(pendingKey);
  sessionStorage.removeItem(pendingKey);
  if (pending && Object.keys(sceneButtons).includes(pending)) select(pending as SceneId);
  requestAnimationFrame(frame);
}, 100);
