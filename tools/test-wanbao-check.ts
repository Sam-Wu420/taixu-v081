// 万宝阁 1.5.4：检查更新连不上模组坊时要说出来（用户 2026-11-19：手机上检查更新没用——安卓外壳没联网权限，请求全失败，界面却写「全部都是最新版本」）。
// 直接用 mods/wanbao/versions.js 的 createVersions，假的 fetch 分几种情况：全连不上 / 网关回出错页 / 有的没上架（404，不算错）/ 有一个出错。
import assert from 'node:assert/strict';
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; } };
const { createVersions } = await import('../mods/wanbao/versions.js');
const cmpVer = (a: string, b: string) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
const mine = new Map([['drgnext', '1.2.4'], ['klkport', '1.2.1'], ['klkvoice', '1.1.1']].map(([id, v]) => [id, { manifest: { id, name: id, version: v } }]));
const make = () => createVersions({ plat: { url: (p: string) => 'https://store.test' + p }, cmpVer, validBundle: () => true, bundles: () => mine, note() {}, install: async () => true, onChange() {}, onProgress() {} });
const idOf = (u: string) => decodeURIComponent(u.split('/api/mods/')[1].split(/[/?]/)[0]);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

// 一、全连不上（安卓没联网权限、断网）
(globalThis as any).fetch = async () => { throw new TypeError('Failed to fetch'); };
let V = make(); const last0 = V.st.lastCheck;
await V.check({ noAuto: true });
assert.equal(V.st.updates.size, 0);
assert.ok(V.st.error?.all, '全连不上：应记成「连不上模组坊」');
assert.equal(V.st.lastCheck, last0, '全连不上：不记成「检查过了」');

// 二、网关回了一张出错页（200 但不是 JSON）
(globalThis as any).fetch = async () => new Response('<!doctype html><title>链接不完整</title>', { status: 200, headers: { 'content-type': 'text/html' } });
V = make(); await V.check({ noAuto: true });
assert.ok(V.st.error?.all, '回的不是 JSON：也算连不上');

// 三、正常：两个有新版，klkvoice 不在模组坊上（404）——不算错
(globalThis as any).fetch = async (u: string) => { const id = idOf(u); return id === 'klkvoice' ? json({ error: 'not found' }, 404) : json({ id, version: id === 'drgnext' ? '1.2.5' : '1.2.2' }); };
V = make(); await V.check({ noAuto: true });
assert.equal(V.st.error, null, '没上架的模组不算连不上');
assert.deepEqual([...V.st.updates.keys()].sort(), ['drgnext', 'klkport']);
assert.ok(V.st.lastCheck > 0);

// 四、有一个出错（500）：其余照常，记下「几个没查到」
(globalThis as any).fetch = async (u: string) => { const id = idOf(u); return id === 'klkport' ? json({ error: 'boom' }, 500) : id === 'klkvoice' ? json({}, 404) : json({ id, version: '1.2.5' }); };
V = make(); await V.check({ noAuto: true });
assert.ok(V.st.error && !V.st.error.all && V.st.error.n === 1 && /500/.test(V.st.error.msg), '一个出错：记成「1 个没查到」');
assert.deepEqual([...V.st.updates.keys()], ['drgnext']);
console.log('PASS 万宝阁检查更新：全连不上 / 网关出错页 → 说「连不上模组坊」且不记成检查过；没上架（404）不算错；有一个出错 → 其余照常、记下几个没查到');
