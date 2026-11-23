import './env';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';

const resizeListeners = new Set<EventListenerOrEventListenerObject>();
const browserWindow = Object.assign(new EventTarget(), {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
});
const add = browserWindow.addEventListener.bind(browserWindow), remove = browserWindow.removeEventListener.bind(browserWindow);
browserWindow.addEventListener = (type, listener, options) => {
  if (type === 'resize' && listener) resizeListeners.add(listener);
  add(type, listener, options);
};
browserWindow.removeEventListener = (type, listener, options) => {
  if (type === 'resize' && listener) resizeListeners.delete(listener);
  remove(type, listener, options);
};

class TestResizeObserver {
  static instances: TestResizeObserver[] = [];
  connected = false;
  constructor(private readonly callback: ResizeObserverCallback) { TestResizeObserver.instances.push(this); }
  observe(): void { this.connected = true; }
  disconnect(): void { this.connected = false; }
  fire(): void { if (this.connected) this.callback([], this as unknown as ResizeObserver); }
}

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: browserWindow, ResizeObserver: TestResizeObserver,
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
  requestAnimationFrame: () => 1, cancelAnimationFrame() {}, requestIdleCallback: () => 1,
});
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
// 模块自己挂的全局监听不算在内（core/touch.ts 载入时挂一个「转屏、改窗口大小重新判定触屏」的监听，整个应用只有一个、不随进出游戏增减）：
// 这里只查 Renderer 进出游戏时挂上、摘掉的那个
resizeListeners.clear();
const terrain = new Terrain(); terrain.build();
const game = new Game(terrain);

function canvas(width: number, height: number): HTMLCanvasElement {
  const cv = createCanvas(width, height) as unknown as HTMLCanvasElement;
  const events = new EventTarget();
  Object.assign(cv, { clientWidth: width, clientHeight: height,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }) });
  return cv;
}

const first = canvas(640, 360);
game.attach(first);
const firstObserver = TestResizeObserver.instances[0];
assert.equal(resizeListeners.size, 1);
assert(firstObserver.connected);
Object.defineProperty(first, 'clientWidth', { value: 680, configurable: true });
browserWindow.dispatchEvent(new Event('resize'));
assert.equal(first.width, 680, '活动 Renderer 应响应窗口尺寸变化');
Object.defineProperty(first, 'clientWidth', { value: 700, configurable: true });
firstObserver.fire();
assert.equal(first.width, 700, '活动 Renderer 应响应画布尺寸观察');

game.detach();
assert.equal(resizeListeners.size, 0, '退出游戏时应解除窗口监听');
assert.equal(firstObserver.connected, false, '退出游戏时应断开尺寸观察');
Object.defineProperty(first, 'clientWidth', { value: 720, configurable: true });
browserWindow.dispatchEvent(new Event('resize')); firstObserver.fire();
assert.equal(first.width, 700, '已退出的 Renderer 不应继续调整旧画布');

const second = canvas(500, 300);
game.attach(second);
const secondObserver = TestResizeObserver.instances[1];
assert.equal(resizeListeners.size, 1, '重新进入只应注册一个窗口监听');
assert(secondObserver.connected);
Object.defineProperty(second, 'clientWidth', { value: 540, configurable: true });
browserWindow.dispatchEvent(new Event('resize'));
assert.equal(second.width, 540);
assert.equal(first.width, 700, '新 Renderer 的尺寸变化不能触及旧画布');
game.detach();
assert.equal(resizeListeners.size, 0);
assert.equal(secondObserver.connected, false);
console.log('Renderer lifecycle tests passed: real Game attach/detach/recreate, resize listener and observer');
