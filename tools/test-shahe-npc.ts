// 天工试场 1.3.8：试场里召来 / 切磋的世界人物（用户报：开着「不来路人」时召来的钟鼎道被清走；关着时切磋完人马上消失）。
// 无头游戏里装上试场（dist-mods/shahe-<manifest 版本>.fmod，要先 npx tsx tools/mod-pack.ts mods/shahe）和一个只加人物的小模组，
// 在云上演武台里对有名人物（钟鼎道）、模组人物各走一遍：开 / 关「不来路人」→ 召来身旁 → 切磋 → 切磋打完 → 再过 20 秒他还在台上、跟着你、能交谈；
// 能再切磋；别的路人照样清；移出试场 / 撤销；出阵后读回入阵前的样子。
// 用 SHAHE_FMOD=dist-mods/shahe-1.3.7.fmod 跑可以看到旧版的毛病（这一项会失败）。
import './env';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const local = new Map<string, string>(), session = new Map<string, string>();
const storage = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => { map.set(key, String(value)); },
  removeItem: (key: string) => { map.delete(key); },
});
const browserWindow = Object.assign(new EventTarget(), { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, matchMedia: () => ({ matches: false }) });
Object.assign(globalThis, {
  window: browserWindow, localStorage: storage(local), sessionStorage: storage(session),
  location: { href: 'http://127.0.0.1:5202/?hd2d=1', search: '?hd2d=1' }, __TAIXU_NORELOAD: true,
});

const { ModHost } = await import('../src/mod/host');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const host = new ModHost();
// 一个只加人物的小模组（代表 KLK 的流子、皐月这类模组人物）
const npcMod = {
  format: 'taixu-mod@1', main: 'index.js',
  manifest: { id: 'tnpc', name: '测试人物', version: '1.0.0', author: 't', desc: '', api: 3 },
  files: { 'index.js': `export default function setup(api) { api.content.npcs([{ id: 'tnpc_xia', name: '试剑客', sex: 'f', home: 'huangfeng', realm: 3, stage: 1, title: '游侠', role: 'female', pers: 'righteous', faction: 'rogue', favor: 20 }]); }` },
};
assert.equal((await host.load(npcMod as any)).state, 'loaded');
const ver = JSON.parse(readFileSync('mods/shahe/manifest.json', 'utf8')).version;
const fmod = process.env.SHAHE_FMOD ?? `dist-mods/shahe-${ver}.fmod`;
const st = await host.load(JSON.parse(readFileSync(fmod, 'utf8')));
assert.equal(st.state, 'loaded', st.error);
console.log('试场包：' + fmod);
(globalThis as any).__modHost = host;
const sandbox = (globalThis as any).__shahe;

const terrain = new Terrain();
terrain.build();
const game = new Game(terrain);
(game as any).canvas = Object.assign(new EventTarget(), { style: { cursor: '' }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) });
(game as any).bindInput();
game.reset();
host.attach(game);
host.start();
game.hero.realm = 2; game.hero.stage = 1;
assert(game.save(0));
const W = game.npcs;
const before = (id: string) => { const d = W.byId.get(id)!; return { x: d.x, y: d.y, active: W.active.has(id) }; };
const ZL = 'zhonglingdao', MOD = 'tnpc_xia';
const PASSER = W.list.find((d) => d.alive && !d.beauty && !d.canon && d.realm > 0 && d.id !== ZL && d.id !== MOD)!.id;
const saved = { [ZL]: before(ZL), [MOD]: before(MOD) };
assert(W.byId.get(MOD), '模组人物应进了众生名册');

assert(sandbox.enter({ who: 'test', realm: 4, stage: 0, place: 'arena' }), '应能入阵');
assert.equal(sandbox.S.arena, true, '应在云上演武台');
sandbox.setCtl('god', true);
const P = game.player;
const run = (sec: number) => { for (let i = 0; i < sec * 30; i++) game.update(1 / 30); };
const near = (id: string) => { const a = W.activeOf(id); return a ? Math.hypot(a.st.x - P.x, a.st.y - P.y) : Infinity; };
const sparFoe = (id: string) => game.combat.enemies.find((e) => e.npcId === id && !e.dead);
/** 切磋打到认输：和核心切磋结束同一条路（combat.ts：气血压到一成五以下） */
const endSpar = (id: string, won = true) => { const e = sparFoe(id)!; e.hp = e.maxHp * 0.15; e.dead = true; e.deathT = 0.9; game.combat.onSparEnd?.(e, won); };

function scenario(id: string, noNpc: boolean, label: string) {
  sandbox.setCtl('noNpc', noNpc);
  sandbox.npcAct(id, 'call');
  run(2);
  let a = W.activeOf(id);
  assert(a, `${label}：召来后应在身旁（没被清走）`);
  assert.equal(a!.act, 'follow', `${label}：召来后应跟着主角`);
  assert(near(id) < 500, `${label}：召来后应在主角近旁，实际 ${Math.round(near(id))}`);
  // 主角走开，他跟上（台上照常行动）
  const p0 = { x: P.x, y: P.y };
  P.x += 500; P.st.x = P.x;
  run(3);
  assert(near(id) < 400, `${label}：主角挪开后应跟过来，实际 ${Math.round(near(id))}`);
  P.x = p0.x; P.st.x = P.x;
  // 交谈：身旁可交谈的人就是他
  run(1);
  { const q = W.activeOf(id)!.st; P.x = q.x + 12; P.y = q.y; P.st.x = P.x; P.st.y = P.y; game.update(1 / 30); }
  assert.equal(W.focus?.d.id, id, `${label}：应能交谈（身旁可交谈的人是他）`);
  P.x = p0.x; P.y = p0.y; P.st.x = P.x; P.st.y = P.y;
  // 切磋
  sandbox.npcAct(id, 'spar');
  let e = sparFoe(id);
  assert(e && e.spar, `${label}：应开始切磋`);
  run(2);
  assert(game.combat.enemies.includes(e!) && !e!.dead, `${label}：切磋中不应被清走`);
  endSpar(id);
  run(20);
  a = W.activeOf(id);
  assert(a, `${label}：切磋完过 20 秒应还在`);
  assert(!a!.enemy, `${label}：切磋完应回到人物身份（否则画不出来）`);
  assert.equal(a!.act, 'follow', `${label}：切磋完应接着跟着主角`);
  assert(near(id) < 500, `${label}：切磋完应还在台上主角近旁，实际 ${Math.round(near(id))}`);
  assert(W.byId.get(id)!.alive);
  // 再切磋一场
  sandbox.npcAct(id, 'spar');
  e = sparFoe(id);
  assert(e, `${label}：应能再切磋`);
  endSpar(id, false);
  run(20);
  assert(W.activeOf(id) && !W.activeOf(id)!.enemy && near(id) < 500, `${label}：第二场切磋完也应还在`);
}

// 开着「不来路人」：有名人物、模组人物
scenario(ZL, true, '开开关·钟鼎道');
// 别的路人照样清
W.summon(PASSER); W.activeOf(PASSER)!.act = 'idle';
run(1);
assert(!W.activeOf(PASSER), '开着「不来路人」时别的路人照样清走');
assert(W.activeOf(ZL), '清路人时召来的钟鼎道不动');
scenario(MOD, true, '开开关·模组人物');
// v0.70 原创化后知交（红颜）表已清空，这里不再测红颜
// 关着「不来路人」
scenario(ZL, false, '关开关·钟鼎道');
scenario(MOD, false, '关开关·模组人物');

// 移出试场 / 撤销
sandbox.npcAct(MOD, 'drop');
assert(!W.activeOf(MOD), '移出试场后不在身旁');
assert.equal(sandbox.npcMine(MOD), false);
assert.deepEqual({ x: W.byId.get(MOD)!.x, y: W.byId.get(MOD)!.y }, { x: saved[MOD].x, y: saved[MOD].y }, '移出后放回召来之前的去处');
sandbox.undo();
run(1);
assert(W.activeOf(MOD) && near(MOD) < 500 && sandbox.npcMine(MOD), '撤销移出：再召回身旁');
// 切磋中用移除工具点他：整个人移出
sandbox.npcAct(MOD, 'spar');
const foe = sparFoe(MOD)!;
sandbox.setTool?.('remove');
sandbox.S.tool = 'remove';
sandbox.remove('npc:' + MOD);
assert(!W.activeOf(MOD) && !game.combat.enemies.includes(foe), '切磋中移出：人和对手身份都撤掉');
// 撤销召来：钟鼎道放回去
sandbox.clearAll();
assert(!W.activeOf(ZL), '清场应送走召来的人物');
sandbox.undo();
run(1);
assert(W.activeOf(ZL) && sandbox.npcMine(ZL), '撤销清场：召回');

// 出阵：读回入阵前
sandbox.exit();
assert.equal(sandbox.S.active, false);
assert.equal(sandbox.S.npcMine.size, 0);
for (const id of [ZL, MOD]) {
  const d = W.byId.get(id)!;
  assert.deepEqual({ x: Math.round(d.x), y: Math.round(d.y) }, { x: Math.round(saved[id].x), y: Math.round(saved[id].y) }, `出阵后 ${id} 回到入阵前的位置`);
  assert.notEqual(W.activeOf(id)?.act, 'follow', `出阵后 ${id} 不再跟着`);
}
console.log('试场召来人物：开 / 关「不来路人」两种情况下，钟鼎道与模组人物召来、跟随、交谈、切磋两场后 20 秒仍在台上；路人照清；移出 / 撤销 / 清场 / 出阵复原 都过');
