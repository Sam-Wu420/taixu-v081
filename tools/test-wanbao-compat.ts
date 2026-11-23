// 万宝阁 1.6.0「适配版本」与 v0.8.1 的模组接口：认游戏、版本范围、适配判断；核心两种包格式都认；api.gameId / gameVersion；天工试场认存档键
// npx tsx tools/test-wanbao-compat.ts
import './env';
import assert from 'node:assert/strict';
import { detectGame, inRange, compatOf, gamesText } from '../mods/wanbao/compat.js';
import { gameKind } from '../mods/shahe/gamekind.js';
import { validateBundle } from '../src/mod/validate';
(globalThis as any).window ??= { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
{ const s = new Map<string, string>(); (globalThis as any).localStorage ??= { getItem: (k: string) => s.get(k) ?? null, setItem: (k: string, v: string) => { s.set(k, v); }, removeItem: (k: string) => { s.delete(k); }, key: (i: number) => [...s.keys()][i] ?? null, get length() { return s.size; } }; }
const { GAME_VERSION } = await import('../src/mod/host');

const G = globalThis as any;
// 一、认游戏
let g = detectGame({ gameId: 'taixu', gameVersion: '0.8.1' });
assert.equal(g.id, 'taixu'); assert.equal(g.store, 'taixu'); assert.equal(g.ver, '0.8.1'); assert.match(g.label, /太虚问道录 v0\.8\.1/);
g = detectGame({ gameVersion: '0.57.0', unsafe: { scene3d() { return null; } } });
assert.equal(g.id, 'fanren-b', 'B 版：有立体画面接口'); assert.equal(g.store, 'fanren');
g = detectGame({ gameVersion: '0.57.0', unsafe: {} });
assert.equal(g.id, 'fanren', '原版 v0.57'); assert.equal(g.store, 'fanren');
G.document = { title: '太虚问道录 · 人界篇 v0.8' };
g = detectGame({ gameVersion: '0.57.0', unsafe: { scene3d() { return null; } } });
assert.equal(g.id, 'taixu', '作者的 v0.8：报 0.57.0，按标题认'); assert.equal(g.ver, '0.8'); assert.equal(g.store, 'taixu');
assert.equal(gameKind({}), 'taixu', '天工试场也按标题认出作者的 v0.8');
G.document = { title: '凡人修仙传' };
assert.equal(gameKind({}), 'fanren');
assert.equal(gameKind({ gameId: 'taixu' }), 'taixu', 'v0.8.1 起直接看 api.gameId');
delete G.document;

// 二、版本范围
assert.ok(inRange('0.8.1', '>=0.8')); assert.ok(!inRange('0.57.0', '>=0.8')); assert.ok(inRange('0.8.1', '0.8')); assert.ok(!inRange('0.9.0', '0.8'));
assert.ok(inRange('0.57.0', '0.57')); assert.ok(inRange('0.70.0', '>=0.62') && !inRange('0.70.0', '>=0.8'), '版本号按小数读：0.70 < 0.8'); assert.ok(inRange('1.0.0', '*')); assert.ok(inRange('0.8.3', '>=0.8 <0.9')); assert.ok(!inRange('0.9.0', '>=0.8 <0.9'));

// 三、适配判断
const T = detectGame({ gameId: 'taixu', gameVersion: '0.8.1' });
assert.equal(compatOf(undefined, T), 'unk', '没标：未标明');
assert.equal(compatOf({ taixu: '>=0.8' }, T), 'ok');
assert.equal(compatOf({ taixu: '>=0.9' }, T), 'bad', '标了但版本不够');
assert.equal(compatOf({ 'fanren-b': '*' }, T), 'bad', '只标了 B 版');
assert.equal(gamesText({ taixu: '>=0.8', 'fanren-b': '*' }), '太虚问道录 ≥0.8 · 凡人修仙传 B 版');

// 四、核心：两种格式都认、games 字段校验；模组接口报 gameId 和真实版本
const bundle = (format: string, extra: Record<string, unknown> = {}) => ({ format, manifest: { id: 'compatx', name: '适配测试', version: '1.0.0', author: 't', desc: 'd', ...extra }, main: 'index.js', files: { 'index.js': 'export default function setup(api) { globalThis.__compatApi = { id: api.gameId, name: api.gameName, ver: api.gameVersion }; }' } });
assert.equal(validateBundle(bundle('taixu-mod@1')), null);
assert.equal(validateBundle(bundle('fanren-mod@1')), null, '老格式照收');
assert.ok(validateBundle(bundle('other@1')));
assert.equal(validateBundle(bundle('taixu-mod@1', { games: { taixu: '>=0.8' } })), null);
assert.ok(validateBundle(bundle('taixu-mod@1', { games: ['taixu'] })), 'games 要是对象');
assert.equal(GAME_VERSION, '0.8.1');
const { ModHost } = await import('../src/mod/host');
const host = new ModHost();
const st = await host.load(bundle('fanren-mod@1') as any);
assert.equal(st.state, 'loaded', '老格式的包加载：' + (st as any).error);
assert.deepEqual(G.__compatApi, { id: 'taixu', name: '太虚问道录', ver: '0.8.1' });

// 五、核心的样式不许用全局 .wb-*（万宝阁模组的类名前缀；r20 恩怨的通缉榜用过一回，万宝阁的卡片整个变成绿板）
{
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const bad: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(css|tsx)$/.test(f)) { const t = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); const m = f.endsWith('.css') ? t.match(/\.wb-[\w-]+/g) : t.match(/className=\{?['"`][^'"`]*\bwb-(?!title-btn)[\w-]+/g); if (m) bad.push(p + '：' + [...new Set(m)].slice(0, 4).join(' ')); } } };
  walk('src');
  assert.equal(bad.length, 0, '核心里还有全局 .wb-* 类名：' + bad.join('；'));
}

console.log('PASS 适配版本：认得出太虚问道录（v0.8.1 报 gameId、作者 v0.8 按标题）/ B 版 / 原版；版本范围与适配判断；核心两种包格式都认；天工试场按游戏认存档键');
