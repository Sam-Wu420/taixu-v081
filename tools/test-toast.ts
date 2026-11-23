// r14-toast：消息提示分级的测试——判级（紧要 / 重要 / 闲讯）、三档设置下的去向、打斗中闲讯先压着打完再补、
// 手机一次一条且排队不超过 2 条（多的只进「讯」）、「讯」角标未读数、模组的提示照弹、设置存进 localStorage、ToastStrip 出得来。
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
await import('./env');
const P = await import('../src/world/toastPolicy');
const { toastLevel, toastRoute, toastMode, setToastMode, toastMs, TOAST_MODE_KEY } = P;

let fails = 0;
const ok = (c: unknown, msg: string) => { if (!c) { fails++; console.error('✗ ' + msg); } else console.log('✓ ' + msg); };

// ---------- 判级 ----------
ok(toastLevel('神识中：东南边宝光一闪，两伙修士为一件出土的宝物打了起来！', 'info') === 'low', '神识中的旁人事件是闲讯');
ok(toastLevel('江湖传闻：赤霄禁地将于第3年开启', 'info') === 'low', '江湖传闻是闲讯');
ok(toastLevel('街上锣鼓喧天——谁家在迎亲。', 'info') === 'low', '路过的小事是闲讯');
ok(toastLevel('神识中：几个形迹可疑的修士正朝你这边围过来。', 'warn') === 'urgent', '神识中但冲着「你」来的警示是紧要');
ok(toastLevel('追兵赶上来了！', 'warn') === 'urgent', '警示是紧要');
ok(toastLevel('灵力不足。', 'info') === 'high', '自己操作的回应是重要');
ok(toastLevel('提示：按 F 采集神识中的灵物。', 'good') === 'high', '引导提示是重要');
ok(toastLevel('神识中：一头火狼盘踞在灵草旁。', 'warn', { lv: 'low' }) === 'low', '显式指定的级别优先');
ok(toastLevel('神识中：模组里发的一句话', 'info', { mod: true }) === 'high', '模组的提示至少是重要（不会被当闲讯吞掉）');
ok(toastLevel('模组警告', 'warn', { mod: true }) === 'urgent', '模组的警示是紧要');

// ---------- 去向 ----------
ok(toastRoute('urgent', 'quiet', true) === 'show', '紧要：安静档、打斗中也弹');
ok(toastRoute('high', 'important', true) === 'show' && toastRoute('high', 'quiet', false) === 'log', '重要：只显示重要的档照弹、安静档只记录');
ok(toastRoute('low', 'important', false) === 'log' && toastRoute('low', 'quiet', false) === 'log', '闲讯：只显示重要的 / 安静档只记录');
ok(toastRoute('low', 'all', false) === 'show' && toastRoute('low', 'all', true) === 'defer', '闲讯：全部显示档平时弹、打斗中压着');
ok(toastMs('high', true, false) === 3000 && toastMs('urgent', true, false) <= 3600 && toastMs('high', false, false) === 4200, '手机停留 3 秒左右，电脑照旧');

// ---------- 设置 ----------
store.clear();
ok(toastMode(true) === 'important' && toastMode(false) === 'all', '没设过：手机默认只显示重要的、电脑默认全部显示');
setToastMode('quiet'); ok(store.get(TOAST_MODE_KEY) === 'quiet' && toastMode(false) === 'quiet', '设置存进 localStorage');
store.set(TOAST_MODE_KEY, 'bogus'); ok(toastMode(true) === 'important', '存了坏值退回默认');
store.clear();

// ---------- 接进 Game ----------
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
// 恩怨重做 · 第二批：「神识中…」「江湖传闻…」这类闲讯默认收进江湖传音、不再走弹出；下面测的是旧的弹出分级，先关掉，最后再测收进传音
g.feedAmbient = false;
const reset = () => { g.toasts = []; g.toastQueue = []; g.toastDeferred = []; g.toastLog = []; g.combat.lock = null; g.combat.combatT = 99; g.combat.brawl.stance = false; };
const OLD = '神识中：一位白发老者坐在青石上，似在等人。';
const held = () => g.toastDeferred.some((t: any) => t.text === OLD);
const shown = () => g.toasts.filter((t: any) => t.kind !== 'region').map((t: any) => t.text);

// 手机、只显示重要的（默认）
reset(); g.toastTouch = true; g.toastMax = 1;
g.toast('神识中：东南边宝光一闪，两伙修士为一件出土的宝物打了起来！', 'info');
g.toast('江湖传闻：赤霄禁地将于第3年开启', 'info');
ok(shown().length === 0 && g.toastUnread === 2, '手机默认：闲讯不弹，「讯」角标记 2 条');
g.toast('灵力不足。', 'info'); g.toast('拾得 青锋剑', 'good'); g.toast('又一条回应', 'info'); g.toast('再一条回应', 'info'); g.toast('追兵赶上来了！', 'warn');
ok(shown().length === 1 && shown()[0] === '灵力不足。', '手机一次只显示 1 条');
ok(g.toastQueue.length <= 2 && g.toastQueue[0].text === '追兵赶上来了！', '手机排队最多 2 条，紧要的插到队头');
ok(g.toastLog.length === 7 && g.toastUnread === 4, '多出来的只留在记录里：2 条闲讯 + 挤掉的 2 条算未读，排着队的不算（' + g.toastUnread + '）');
g.readToastLog(); ok(g.toastUnread === 0, '打开记录后未读清零');

// 打斗中：全部显示档的闲讯压着，打完补弹；紧要照弹
reset(); g.toastTouch = false; g.toastMax = 2; setToastMode('all');
g.combat.lock = { dead: false };
ok(g.toastFighting(), '锁定着活目标算打斗中');
g.toast('神识中：一位白发老者坐在青石上，似在等人。', 'info');
g.toast('有人悬赏你的命！', 'warn');
ok(shown().length === 1 && shown()[0] === '有人悬赏你的命！' && g.toastDeferred.length === 1, '打斗中：闲讯压着，紧要照弹');
g.combat.lock = null; g.combat.brawl.stance = true; g.update(0.016);
ok(held(), '近战架势也算打斗中，不补弹');
g.combat.brawl.stance = false; g.combat.combatT = 2; g.update(0.016);
ok(held(), '刚出手 / 挨打（不到 4 息）也算打斗中');
g.combat.combatT = 99; g.update(0.016);
ok(!held() && (shown().includes(OLD) || g.toastQueue.some((t: any) => t.text === OLD)), '打完了补弹压着的闲讯');
// 压太久的不补
reset(); g.combat.lock = { dead: false };
g.toast('神识中：一片灵草丛，灵气氤氲。', 'info');
g.combat.lock = null; g.time += 60; g.update(0.016);
ok(!shown().includes('神识中：一片灵草丛，灵气氤氲。') && g.toastLog.some((e: any) => e.text === '神识中：一片灵草丛，灵气氤氲。' && !e.shown), '压了太久的闲讯不再补弹，只留在「讯」里');

// 安静档
reset(); setToastMode('quiet');
g.toast('灵力不足。', 'info'); g.toast('追兵赶上来了！', 'warn');
ok(shown().length === 1 && shown()[0] === '追兵赶上来了！', '安静档只弹紧要的');
store.clear();

// 模组的提示（mod 接口的 toast(text, tone) 走 { mod: true }）
reset(); g.toastTouch = true; g.toastMax = 1;
g.toast('神识中：模组发来一句', 'info', { mod: true });
ok(shown().length === 1, '手机默认档下，模组的提示照弹');

// 地名横幅不进记录、不受分级影响
reset(); g.toast('南荒 · 梁国', 'region');
ok(g.toasts.some((t: any) => t.kind === 'region') && g.toastLog.length === 0, '地名横幅照旧');

// ---------- 界面 ----------
const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { ToastStrip } = await import('../src/ui/ToastStrip');
reset(); g.toastTouch = true;
g.toast('江湖传闻：某处秘境现世', 'info'); g.toast('拾得 青锋剑', 'good');
const html = renderToString(React.createElement(ToastStrip, { game: g, toasts: g.toasts, touch: true }));
ok(html.includes('msg-badge') && html.includes('msg-line') && html.includes('拾得 青锋剑') && /<i>1<\/i>/.test(html), '手机：角标带未读数、单行消息出得来');
const html2 = renderToString(React.createElement(ToastStrip, { game: g, toasts: g.toasts, touch: false }));
ok(html2.includes('msg-badge') && !html2.includes('msg-line'), '电脑：只有角标（消息仍在顶上）');

// 恩怨重做 · 第二批：打开（默认）后，闲讯收进江湖传音，不弹、不占「讯」角标；冲着你来的照旧
g.feedAmbient = true; reset(); g.toastTouch = false; setToastMode('all');
const u0 = g.enyuan.unread();
g.toast('神识中：远处两个散修为一株灵草打了起来。', 'info');
ok(shown().length === 0 && g.toastLog.length === 0 && g.enyuan.unread() === u0 + 1, '闲讯收进江湖传音：不弹、不进「讯」');
g.toast('神识中：有人朝你扑了过来！', 'warn');
ok(shown().length === 1, '冲着你来的照弹');
console.log(fails ? `✗ ${fails} 项失败` : '消息提示分级：全部通过');
process.exit(fails ? 1 : 0);
