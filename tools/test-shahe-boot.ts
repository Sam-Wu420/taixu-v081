import './env';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const local = new Map<string, string>(), session = new Map<string, string>();
const storage = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => { map.set(key, String(value)); },
  removeItem: (key: string) => { map.delete(key); },
});
const browserWindow = Object.assign(new EventTarget(), {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
});
Object.assign(globalThis, {
  window: browserWindow,
  localStorage: storage(local), sessionStorage: storage(session),
  location: { href: 'http://127.0.0.1:5202/?hd2d=1', search: '?hd2d=1' },
  __TAIXU_NORELOAD: true,
});

const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const host = new ModHost();
const bundle = JSON.parse(readFileSync(`dist-mods/shahe-${JSON.parse(readFileSync('mods/shahe/manifest.json', 'utf8')).version}.fmod`, 'utf8'));
const status = await host.load(bundle);
assert.equal(status.state, 'loaded', status.error);
(globalThis as any).__modHost = host;
const sandbox = (globalThis as any).__shahe;

const options = { who: 'test', realm: 3, stage: 0, place: 'arena', scene: 'dummy' };
sandbox.bootFromTitle(options);
assert.deepEqual(JSON.parse(session.get('shahe.boot')!), { ...options, fresh: true });
assert.equal(new URL((globalThis as any).location.href).searchParams.get('auto'), 'new');

const terrain = new Terrain();
terrain.build();
const game = new Game(terrain);
const canvas = Object.assign(new EventTarget(), {
  style: { cursor: '' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }),
});
(game as any).canvas = canvas;
(game as any).bindInput();
const originalSurface = { height: terrain.surfaceHeight, traverse: terrain.canTraverse, sample: terrain.surface.sample };
let invalidations = 0;
const hd = { buildings: { group: { visible: true } }, invalidateTerrain: () => { invalidations++; } };
(game as any).renderer = { hd, resetStill() {} };
game.reset();
const initialPosition = { x: game.player.x, y: game.player.y };
host.attach(game);
host.start();
await new Promise(resolve => setTimeout(resolve, 450));

assert.equal(session.has('shahe.boot'), false);
assert.equal(sandbox.S.active, true);
assert.equal(game.hero.realm, 3, '化身应采用入阵时选择的结丹境界');
assert.equal(game.hero.stage, 0);
assert.equal(sandbox.S.arena, true, '应进入演武台');
assert.notDeepEqual({ x: game.player.x, y: game.player.y }, initialPosition);
assert.deepEqual(sandbox.S.origin, { x: game.player.x, y: game.player.y });
assert.equal(sandbox.S.objs.size, 5, '木桩阵应生成五具木桩');
assert([...sandbox.S.objs.values()].every((obj: any) => obj.team === 'dummy'));
assert(sandbox.S.logs.some((entry: any) => entry.text.includes('化身 · 结丹初期 · 云上演武台')));
assert(sandbox.S.logs.some((entry: any) => entry.text.includes('实际生成 5 个单位')));
const key = (target: string) => {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperties(event, {
    target: { value: { tagName: target } }, code: { value: 'F2' }, key: { value: 'F2' },
    ctrlKey: { value: false }, altKey: { value: false }, repeat: { value: false },
  });
  browserWindow.dispatchEvent(event);
  return event;
};
game.paused = true;
assert(key('BUTTON').defaultPrevented);
assert.equal(sandbox.S.hud, false, '暂停时按钮焦点下 F2 应收起界面');
key('BUTTON');
assert.equal(sandbox.S.hud, true, '再次按 F2 应展开界面');
assert(!key('INPUT').defaultPrevented);
assert.equal(sandbox.S.hud, true, '输入框应保留按键');
game.paused = false;
const center = { ...sandbox.S.origin };
const height = terrain.surfaceHeight(center.x, center.y);
assert.equal(terrain.surfaceHeight(center.x + 1000, center.y), height, '演武台应有平坦高度');
assert.deepEqual(terrain.surface.sample(center.x + 1000, center.y), { height, slope: 0, walkable: true });
assert(terrain.canTraverse(center.x, center.y, center.x + 1500, center.y));
assert(!terrain.canTraverse(center.x, center.y, center.x + 2000, center.y));
assert.equal(hd.buildings.group.visible, false);
assert.equal(invalidations, 1);

const selected = [...sandbox.S.objs.values()][0] as any;
const mouse = { x: center.x + 278, y: center.y + 182 };
sandbox.S.sel = selected.id;
sandbox.S.place = { name: '回归预览' };
sandbox.S.mouse = mouse;
const drawables: any[] = [];
host.collect(drawables);
const props = drawables.filter(d => d.k === 'D·演武台摆设');
const shadows = drawables.filter(d => d.k === 'D·演武台摆设阴影');
assert.equal(props.length, 14);
assert.equal(shadows.length, props.length);
for (let i = 0; i < props.length; i++) {
  const prop = props[i], shadow = shadows[i];
  assert.equal(shadow.y, prop.hy);
  assert.equal(shadow.hx, undefined, '摆设阴影应贴地');
  assert.equal(shadow.hb, undefined);
  assert.equal(typeof prop.hx, 'number');
  assert(Array.isArray(prop.hb), '摆设图片应使用立板');
  const ellipses: number[][] = [], images: any[][] = [];
  const ctx = {
    globalAlpha: 1, fillStyle: '',
    save() {}, restore() {}, beginPath() {}, fill() {},
    ellipse(...args: number[]) { ellipses.push(args); },
    drawImage(...args: any[]) { images.push(args); },
  };
  shadow.draw(ctx);
  assert.equal(ctx.globalAlpha, 0.25);
  assert.equal(ctx.fillStyle, '#1d1e1a');
  assert.equal(images.length, 0);
  prop.draw(ctx);
  assert.equal(ellipses.length, 1);
  assert.equal(images.length, 1);
  assert.equal(ctx.globalAlpha, 1);
  const [, x, y, w, h] = images[0];
  assert.deepEqual(ellipses[0], [prop.hx, prop.hy, w * 0.42, w * 0.13, 0, 0, Math.PI * 2]);
  assert.equal(x, prop.hx - w / 2);
  assert.equal(y, prop.hy - h * 0.97);
}
const texts: { text: string; x: number; y: number }[] = [];
const textCtx = {
  save() {}, restore() {}, strokeText() {},
  fillText(text: string, x: number, y: number) { texts.push({ text, x, y }); },
};
const mark = drawables.find(d => d.hx === selected.e.x && d.hy === selected.e.y && !d.k);
assert(mark?.hb, '单位标记应面向屏幕');
mark.draw(textCtx);
assert.equal(texts[0].text, '桩');
const previewLabel = drawables.find(d => d.hx === mouse.x && d.hy === mouse.y && !d.k);
assert(previewLabel?.hb, '落子文字应面向屏幕');
previewLabel.draw(textCtx);
assert.equal(texts[1].text, '回归预览');
const overlay = drawables.find(d => d.k === 'D·模组');
assert(overlay && overlay.hx === undefined && overlay.hb === undefined, '选择圈应贴地');
sandbox.S.place = null; sandbox.S.mouse = null;
const rings: number[][] = [];
const ringCtx = {
  save() {}, restore() {}, beginPath() {}, stroke() {},
  translate() {}, scale() {}, rotate() {}, drawImage() {},
  ellipse(...args: number[]) { rings.push(args); },
};
overlay.draw(ringCtx);
assert(rings.some(([x, y, radius]) => x === selected.e.x && y === selected.e.y && radius === 34 * (selected.scale ?? 1)), '选择圈应在单位脚下');
sandbox.S.sel = null;
(game as any).renderer = undefined;

(game.happen as any).hapT = 0;
(game.events as any).encT = 0;
const queued = { speaker: '测试', text: '排队中的对白', options: [] };
(game as any).visitQ = queued;
for (let i = 0; i < 90; i++) game.update(1 / 30);
assert.equal(game.modal, null, '临时新局入阵后不应弹出原游戏开场剧情');
assert.equal(game.hero.realm, 3, '开场后境界应保持');
assert.equal(sandbox.S.objs.size, 5, '开场后木桩应保留');
assert.equal(game.happen.haps.length, 0, '演武台不应自动生成奇遇');
assert.equal((game.happen as any).hapT, 0);
assert.equal((game.events as any).encT, 0);
assert.equal((game as any).visitQ, queued, '试场应保留待显示的对白');
(game as any).visitQ = null;
(game as any).renderer = { hd, resetStill() {} };
game.reset();
assert.equal(sandbox.S.active, false, '新开局应退出沙盒');
assert.equal(game.hero.realm, 1);
assert.equal(hd.buildings.group.visible, true);
assert.equal(invalidations, 2);
assert.equal(terrain.surfaceHeight, originalSurface.height);
assert.equal(terrain.canTraverse, originalSurface.traverse);
assert.equal(terrain.surface.sample, originalSurface.sample);
(game as any).renderer = undefined;

for (let i = 0; i < 40; i++) game.update(1 / 30);
assert.equal(game.modal?.kind, 'dialog');
sandbox.bootFromTitle(options);
host.start();
await new Promise(resolve => setTimeout(resolve, 450));
assert.equal(game.modal, null, '临时新局已出现的开场对白也应关闭');
assert.equal(game.hero.realm, 3);
assert.equal(sandbox.S.objs.size, 5);
game.reset();

assert(sandbox.enter({ ...options, fresh: true, place: 'wild' }));
const outdoorQueued = { speaker: '测试', text: '待试场结束显示', options: [] };
(game as any).visitQ = outdoorQueued;
(game.happen as any).hapT = 0;
const robber = game.happen.spawnKind('robber')!;
robber.foes[0].x = game.player.x + 100;
robber.foes[0].y = game.player.y;
game.update(1 / 30);
assert.equal(game.modal, null, '荒野的主动场景不应被自动对白中断');
assert.equal((game.happen as any).hapT, 0);
assert(!robber.d.engaged, '主动场景期间已有劫修不应发起对话');
sandbox.clearAll();
game.update(1 / 30);
assert.equal((game.modal as any)?.node, outdoorQueued, '主动场景结束后应恢复待显示对白');
game.closeModal(true);
game.happen.update(1 / 30);
assert((game.happen as any).hapT > 0, '荒野清场后应恢复正常奇遇更新');
assert(robber.d.engaged && game.modal?.kind === 'dialog', '清场后已有劫修应恢复原有对话行为');
game.closeModal(true);
game.happen.reset();
game.reset();

game.hero.realm = 2;
game.hero.stage = 1;
assert(game.save(0));
const savedPosition = { x: game.player.x, y: game.player.y };
const continued = new Game(terrain);
host.attach(continued);
let continuedFromTitle = false;
(globalThis as any).document.querySelectorAll = () => [{
  textContent: '继续仙途', disabled: false,
  click() { continuedFromTitle = true; assert(continued.load()); host.start(); },
}];
sandbox.bootFromTitle(options);
assert(continuedFromTitle, '有存档时应走继续游戏');
await new Promise(resolve => setTimeout(resolve, 450));
assert.equal(sandbox.S.active, true);
assert.equal(continued.hero.realm, 3);
assert.equal(sandbox.S.objs.size, 5);
sandbox.exit();
assert.equal(sandbox.S.active, false);
assert.equal(continued.hero.realm, 2, '出阵应还原入阵前存档的境界');
assert.equal(continued.hero.stage, 1);
assert.deepEqual({ x: continued.player.x, y: continued.player.y }, savedPosition);

assert(sandbox.enter({ who: 'test', realm: 2, stage: 1, fresh: true, place: 'arena' }));
sandbox.scene('war1000');
type WarObject = { team: 'ally' | 'foe'; e: import('../src/world/combat').Enemy };
const units = [...sandbox.S.objs.values()] as WarObject[];
assert.equal(units.length, 1000);
const friendly = units.filter(unit => unit.team === 'ally'), hostile = units.filter(unit => unit.team === 'foe');
assert.equal(friendly.length, 500); assert.equal(hostile.length, 500);
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const normalHp = new Enemy(ENEMIES.bandit, 0, 0, 2, 1).maxHp;
assert(units.every(({ e }) => e.def.id === 'bandit' && e.realm === 2 && e.stage === 1 && e.maxHp === normalHp && e.hp === normalHp));
assert(continued.combat.hostile(friendly[0].e, hostile[0].e));
assert(continued.combat.hostile(hostile[0].e, friendly[0].e));
sandbox.setCtl('god', true);
let hits = 0, frames = 0;
const npcHit = continued.combat.npcHit;
continued.combat.npcHit = function (...args) { hits++; npcHit.apply(this, args); };
while (hits === 0 && frames < 240) { continued.update(1 / 60); frames++; }
continued.combat.npcHit = npcHit;
assert(hits > 0, '千人预设必须经真实游戏更新产生单位受击');
sandbox.undo();
assert.equal(sandbox.S.objs.size, 0, '撤销应清除预设全部 1000 个单位');
assert(units.every(({ e }) => e.gone && !continued.combat.enemies.includes(e) && !continued.combat.allies.includes(e)));
console.log(`Sandbox war1000 passed: 500 allies, 500 foes, normal HP, ${hits} hits in ${frames} updates, undo cleared all`);
console.log('Sandbox fresh and saved title boots, story, scene and restore lifecycle passed');
