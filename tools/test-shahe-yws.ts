// 天工试场 1.3.9：人物库里召噬魂魔尊 · 夜无赦（用户 2026-11-19：沙盒 mod 没看到噬魂魔尊）。
// 无头游戏里装上试场（dist-mods/shahe-<manifest 版本>.fmod，要先 npx tsx tools/mod-pack.ts mods/shahe），在云上演武台里：
// 人物库里有他 → 召来开打（开着「不来路人」「不刷野怪」也不清走、真的在出招、不发「四十日」的降临提示）→ 撤销（人走、降临记录放回、不再冒出来）
// → 直接打魔躯 → 移除工具点他（不在原处重新现身）→ 人身 / 魔躯对木桩演招（木桩也不被清）→ 出阵读回入阵前的样子；全程模组不报错。
// 用 SHAHE_FMOD=dist-mods/shahe-1.3.8.fmod 跑能看到旧版没有他（这一项会失败）。
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
game.hero.realm = 3; game.hero.stage = 1;
assert(game.save(0));
const Y = (game as any).yewushe;
assert(Y, '这一版游戏有噬魂魔尊');
const cur0 = JSON.stringify(Y.s.cur ?? null);
const toasts: string[] = []; const t0 = game.toast.bind(game); (game as any).toast = (m: string, ...a: unknown[]) => { toasts.push(String(m)); return (t0 as any)(m, ...a); };
const errs = () => host.status.reduce((n, s) => n + (s.errors ?? 0), 0);

assert(sandbox.enter({ who: 'test', realm: 3, stage: 1, place: 'arena' }), '应能入阵');
assert.equal(sandbox.S.arena, true, '应在云上演武台');
sandbox.setCtl('god', true);
sandbox.setCtl('noSpawn', true); sandbox.setCtl('noNpc', true);
const run = (sec: number) => { for (let i = 0; i < sec * 30; i++) game.update(1 / 30); };
const P = game.player;
const objOf = (e: unknown) => [...sandbox.S.objs.values()].find((o: any) => o.e === e);

// 一、人物库里有他
sandbox.refreshCatalog();
const entry = sandbox.S.catalog.human.find((x: any) => x.id === 'yewushe');
assert(entry && entry.yewushe && entry.name.includes('噬魂魔尊'), '人物库里应有「噬魂魔尊 · 夜无赦」');

// 二、召来开打
sandbox.yewusheAct('fight');
assert(Y.ent, '召来后他应现身');
const e1 = Y.ent;
assert(Math.hypot(e1.x - P.x, e1.y - P.y) < 700, '他应降在主角跟前');
assert.equal(Y.mode, 'fight', '召来开打：应已开打');
assert(objOf(e1), '应收进试场（能点选、能撤）');
const cast0 = Y.log.length;
run(6);
assert(Y.ent === e1 && game.combat.enemies.includes(e1) && !e1.dead, '开着「不刷野怪 / 不来路人」，他不应被清走');
assert(Y.log.length > cast0, '他应真的在出招');
assert(!toasts.some((m) => m.includes('日内不除')), '试场里不发「四十日内不除」的降临提示');
// 三、撤销：人走、降临记录放回，过一阵也不再冒出来
sandbox.undo();
run(2);
assert(!Y.ent, '撤销后他应离开');
assert.equal(JSON.stringify(Y.s.cur ?? null), cur0, '撤销后降临记录放回召来之前');

// 四、直接打魔躯
sandbox.yewusheAct('demon');
assert(Y.ent && Y.form === 'demon' && Y.mode === 'fight', '应直接从魔躯形态开打');
assert(Y.ent.hp < Y.ent.maxHp * 0.5, '魔躯形态从四成气血打起');
run(3);
// 五、移除工具点他：不在原处重新现身
const ob = objOf(Y.ent) as any;
sandbox.remove(ob.id);
run(2);
assert(!Y.ent, '移除后不应在原处重新现身');
assert.equal(JSON.stringify(Y.s.cur ?? null), cur0, '移除后降临记录放回召来之前');

// 六、演招：人身、魔躯；木桩也收进试场（不被「不刷野怪」清走）
for (const [act, form] of [['demo', 'human'], ['demoDemon', 'demon']] as const) {
  sandbox.yewusheAct(act);
  assert(Y.ent && Y.mode === 'demo' && Y.form === form, `${act}：应在演招（${form}）`);
  const dummy = Y.demo?.tg;
  assert(dummy && objOf(dummy), `${act}：木桩应收进试场`);
  const n0 = Y.log.length;
  run(8);
  assert(game.combat.enemies.includes(dummy), `${act}：木桩不应被清走`);
  assert(Y.log.length > n0 || (Y.demo?.n ?? 0) > 0, `${act}：应在一招招演`);
}
assert.equal(errs(), 0, '模组回调不应出错');

// 七、出阵：读回入阵前
sandbox.exit();
run(1);
assert.equal(sandbox.S.active, false);
assert(!Y.ent || !game.combat.enemies.includes(Y.ent), '出阵后他不在');
assert.equal(JSON.stringify(Y.s.cur ?? null), cur0, '出阵后降临记录是入阵前的样子');
assert.equal(errs(), 0, '模组回调不应出错');
console.log('PASS 试场召噬魂魔尊：人物库有他；召来开打 / 直接魔躯 / 人身与魔躯演招都在出招，开着清场开关也不被清；撤销、移除后不再冒出来；出阵复原；模组无错');
process.exit(0);
