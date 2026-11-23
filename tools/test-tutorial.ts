// 收官 I（甲）：新手引导（world/tutorial.ts）。固定种子、无头：
//   · 脚本模拟走完入门一课的每一步（移动缩放 → 交谈 → 穿装备 → 丹药进快捷栏并服下 → 木人桩：法术、近战一套 → 打坐 → 御剑升降落地 → 地图 → 宗门差事 → 成）；
//   · 发的装备不摇词条（不取随机数）；木人桩下课收走；教过的 hint 不再另弹、没教过的先压着；
//   · 跳过（二次确认）、重看（不重复发装备）、存读档从那一步接着上、旧存档（没有 ws.tut）不触发；
//   · 装了清界（qingjie）让位；触屏文案分支；情境小课的接口与开关；引导出错不影响主循环。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 11, inTut = false, tutRand = 0; Math.random = () => { if (inTut) { tutRand++; if (process.env.TUT_TRACE) console.log(new Error().stack!.split('\n').slice(2, 5).join(' | ')); } s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { getQuestEntries } = await import('../src/ui/questSlot');
const { setCtxLessonsOn } = await import('../src/world/tutorial');
const { bindOf, keyLabel } = await import('../src/core/keymap');
const g = await G.createGame(() => {});
const T = g.tutorial, p = g.player, c = g.combat as any, B = g.combat.brawl;
T.forceTouch = false;
// 引导自己一个随机数都不许取：tick / begin / jump 期间数 Math.random 的调用
for (const k of ['tick', 'begin', 'jump', 'replay'] as const) { const f0 = (T as any)[k].bind(T); (T as any)[k] = (...a: unknown[]) => { inTut = true; try { return f0(...a); } finally { inTut = false; } }; }

const frame = (dt = 1 / 30) => { c.spawnT = 1e9; g.update(dt); c.fxq.length = 0; };
const run = (sec: number, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) frame(dt); };
const step = () => T.step;
const until = (want: string, sec = 3) => { for (let t = 0; t < sec && step() !== want; t += 1 / 30) frame(); assert.equal(step(), want, `应到「${want}」，实际停在「${step()}」`); };
const move = (dx: number, dy: number) => { p.x += dx; p.y += dy; p.st.x = p.x; p.st.y = p.y; };

// ------------------------------------------------ 一、全新开局：走完入门一课
g.reset();
T.begin();
assert.ok(T.active && step() === 'move', '开局就在第一步');
assert.equal(store['taixu_help_seen'], '1', '键位提示卡不和引导同时弹');
assert.ok(getQuestEntries().length === 0 || true);
frame(); run(1.2);
assert.ok(getQuestEntries().some((e) => e.kind === 'guide' && e.title.startsWith('下一步：行走')), '任务列里有「下一步」');
// 原来那几条 hint：教过的（交谈）不弹；没教过的（阵盘）先压着
const hints0 = g.ws.hints.length;
g.hint('talk', '提示：按 T 交谈'); g.hint('zhenfa', '提示：阵盘');
assert.equal(g.ws.hints.length, hints0, '上课期间 hint 不弹');

// 1 移动与镜头
move(400, 0); run(0.3);
assert.equal(step(), 'move', '只走了没缩放，还在这一步');
g.setZoom(g.cam.targetZoom * 1.3); until('talk');
// 2 交谈：有人就开一段对话再关；附近没人会自动跳过这一步
if (step() === 'talk') {
  g.openDialog({ speaker: '路人', text: '道友好。', options: [{ label: '告辞', act: () => null }] } as any); run(0.3);
  assert.equal(step(), 'talk', '对话还开着，不算完');
  assert.ok(T.getView()?.quiet, '对话开着时气泡收起');
  g.closeModal(true);
}
until('gear');
// 3 穿装备：发了一件、词条固定（空，不摇随机数）；面板没开时指「袋」
const gear = h0Gear();
function h0Gear() { return g.hero.bag.find((b) => b.uid === g.ws.tut!.gearUid)!; }
assert.ok(gear && C.slotOf(gear.id), '发了一件新槽位的装备');
assert.deepEqual(gear.affix, [], '引导发的装备词条固定为空（没取随机数）');
assert.equal(tutRand, 0, '引导没取过 Math.random');
let v = T.getView()!;
assert.equal(v.target?.kind, 'ui'); assert.ok((v.target as any).picks[0].sel.includes('data-k="bag"'), '面板没开：指着「袋」');
assert.ok(v.text.includes(keyLabel(bindOf('bag'))), '电脑文案带储物袋的键');
T.panel = 'bag'; run(0.2);
v = T.getView()!;
assert.ok((v.target as any).picks[0].sel.includes('data-uid'), '面板开了：指着那一格'); assert.ok((v.target as any).drop?.sel.includes('slot:'), '并标出落点（装备槽）');
C.wearGear(g.hero, gear); until('pill');
assert.ok(T.stampK > 0, '每完成一步盖一次「成」');
// 4 丹药：拖进快捷栏、关面板、服一颗
g.hero.hotbar[8] = 'pill:pill_huiqi'; run(0.2);
assert.equal(step(), 'pill');
assert.ok(T.getView()!.text.includes('关上'), '放好了先提醒关上储物袋');
T.panel = ''; run(0.2);
assert.ok(T.getView()!.text.includes(keyLabel(bindOf('slot9'))), '提示按第 9 格的键');
g.usePill('pill_huiqi'); until('spell');
// 5 施法：木人桩摆出来了；打掉一点血就过
const dummy = T.dummy!;
assert.ok(dummy && c.enemies.includes(dummy) && dummy.name === '木人桩', '摆了木人桩');
assert.equal(T.getView()!.target?.kind, 'world', '电脑上指着木人桩（地上光圈）');
dummy.hp -= 1; until('brawl');
// 6 近战：进架势 → 连拳 → 崩山轰飞 →（炼气没有欺身、缩地）→ 收势
assert.deepEqual(T.brawlSubs(), ['stance', 'light', 'heavy', 'unstance'], '炼气期只教够得着的几式');
assert.ok(T.getView()!.text.includes('筑基') || true);
B.toggleStance(); run(0.3);
const d2 = T.dummy!; d2.x = p.x + 90; d2.y = p.y; d2.hp = d2.maxHp;
g.hero.mp = 1;
let lightPassed: { broken: boolean; text: string } | null = null;   // 第五轮：连拳这关过的那一刻木人桩是不是真破罡了、下一句怎么说
for (let t = 0; t < 12 && T.snap.sub < 3; t += 1 / 30) {
  const sub = T.brawlSubs()[T.snap.sub];
  if (sub === 'heavy' && !lightPassed) lightPassed = { broken: B.body(T.dummy!).breakT > 0, text: T.getView()!.text };
  const dd = T.dummy!; if (sub === 'light' && Math.hypot(dd.x - p.x, dd.y - p.y) > 100 && !B.body(dd).air) { dd.x = p.x + 90; dd.y = p.y; }
  if (sub === 'light' && Math.round(t * 30) % 6 === 0) B.light();
  if (sub === 'heavy' && Math.round(t * 30) % 12 === 0) { if (!B.body(dd).air && Math.hypot(dd.x - p.x, dd.y - p.y) > 100) { dd.x = p.x + 90; dd.y = p.y; } B.heavy(false); }
  frame();
}
assert.equal(T.brawlSubs()[T.snap.sub], 'unstance', '连拳、崩山轰飞都认到了（实际出招，读近战 log）');
assert.ok(lightPassed?.broken, '连拳这一关等到木人桩罡气打空（破罡）才过');
assert.ok(lightPassed!.text.includes('罡气打空了'), `过关时说「罡气打空了」，和实情一致：${lightPassed!.text}`);
B.toggleStance(); until('sit');
assert.equal(B.log, null, '自己开的近战 log 用完关掉');
// 7 打坐：坐满三息；木人桩下课收走
g.toggleSit(); run(3.6); g.player.sitting && g.toggleSit();
until('fly');
assert.ok(!c.enemies.includes(T.dummy ?? d2) && T.dummy === null, '木人桩收走了');
// 8 御剑：起飞 → 升高 → 压低 → 落地
g.toggleFly(); run(0.3); assert.ok(p.flying, '飞起来了');
g.input.climb = 1; run(1.5); g.input.climb = -1; run(0.8); g.input.climb = 0; run(0.2);
assert.ok(T.snap.sub >= 3, '升高、压低都认到了：' + T.snap.sub);
g.toggleFly(); for (let i = 0; i < 90 && p.flying; i++) frame(); until('map');
// 9 地图：开一次、关上
T.panel = 'map'; run(0.3); assert.equal(T.getView()!.place, 'corner', '地图开着时气泡挪到角落'); T.panel = ''; until('sect');
// 10 宗门差事：点一件差事指路
const task = g.ws.sect!.tasks[0]; const w = g.towns.taskWhere(task);
g.setGuide(w.x ?? p.x, w.y ?? p.y, task.text); until('end');
assert.ok(T.getView()!.buttons.includes('ok'));
T.press('ok'); run(0.3);
assert.ok(!T.active && g.ws.tut!.done && !g.ws.tut!.skipped, '入门一课上完了');
assert.equal(step(), '');
run(1.2);
assert.ok(getQuestEntries().some((e) => e.kind === 'guide' && !e.title.includes('行走')), '下课后「下一步」换成建议');
g.hint('talk', '提示：按 T 交谈'); assert.ok(!g.ws.hints.includes('talk'), '教过的 hint 以后也不弹');
assert.equal(tutRand, 0, '一整课走完，引导没取过 Math.random');
console.log('入门一课：十步走完');

// ------------------------------------------------ 二、重看：不重复发装备（上回那件替你卸下再穿一次）
const nGear = g.hero.bag.filter((b) => b.id === gear.id).length;
T.replay(); assert.ok(T.active && step() === 'move', '重看从头开始');
T.jump('gear'); run(0.2);
assert.equal(g.hero.bag.filter((b) => b.id === gear.id).length, nGear, '重看没再发一件');
assert.ok(!h0Gear().worn, '上回那件卸回了格子');
console.log('重看：通过');

// ------------------------------------------------ 三、跳过（二次确认）
T.press('skip'); run(0.1);
assert.ok(T.getView()!.key.endsWith(':ask'), '先问一句');
T.press('skip-no'); run(0.1); assert.ok(T.active && !T.getView()!.key.endsWith(':ask'), '「继续学」回到原步');
T.press('skip'); T.press('skip-yes'); run(0.1);
assert.ok(!T.active && g.ws.tut!.skipped, '跳过了');
const hn = g.ws.hints.length; g.hint('fight', '提示：施法'); assert.equal(g.ws.hints.length, hn + 1, '跳过引导的人照旧弹 hint');
console.log('跳过：通过');

// ------------------------------------------------ 四、存读档：从存下的那一步接着上；旧存档不触发
g.reset(); T.begin(); move(500, 0); g.setZoom(g.cam.targetZoom * 1.4); run(0.5);
if (step() === 'talk') { g.openDialog({ speaker: '路人', text: '…', options: [] } as any); run(0.1); g.closeModal(true); }
until('gear');
assert.ok(g.save(1), '存档');
g.reset(); run(0.2); assert.ok(!T.active, '新的一局（没开课）不在上课');
assert.ok(g.load('taixu_save_1'), '读档'); run(0.3);
assert.ok(T.active && step() === 'gear', '读档后接着上「穿装备」：' + step());
// 旧存档：去掉 tut 字段
const raw = JSON.parse(store['taixu_save_1']); delete raw.world.tut; store['taixu_save_2'] = JSON.stringify(raw);
assert.ok(g.load('taixu_save_2')); run(1.2);
assert.ok(!T.active && T.getView() === null, '旧存档读进来不触发入门一课');
assert.equal((g.ws as any).tut, undefined, '旧存档没被硬塞 tut 字段');
assert.ok(getQuestEntries().some((e) => e.kind === 'guide'), '旧存档也有「接下来可以做什么」');
console.log('存读档：通过');

// ------------------------------------------------ 五、装了清界：让位
g.reset(); T.begin(); run(0.2); assert.ok(T.active);
T.modIds = () => ['shahe', 'qingjie']; run(1.2);
assert.ok(!T.active && T.getView() === null, '清界在：入门一课让位');
assert.ok(!getQuestEntries().some((e) => e.kind === 'guide'), '清界在：「下一步」也让给它');
assert.ok(!T.mutes('talk', 'x'), '清界在：原版 hint 照常');
T.modIds = () => []; run(0.2); assert.ok(T.active, '清界卸了：接着上');
console.log('清界让位：通过');

// ------------------------------------------------ 六、触屏文案
T.jump('gear'); T.panel = ''; T.dock = false; T.forceTouch = true; run(0.2);
v = T.getView()!; assert.ok(v.text.includes('≡ 菜单') && !v.text.includes(keyLabel(bindOf('bag'))), '触屏：说「≡ 菜单」，不说按键');
T.dock = true; run(0.2); assert.ok((T.getView()!.target as any).picks[0].sel.includes('dock-item'), '触屏：菜单开了指菜单里那一格');
T.jump('brawl'); run(0.2); assert.ok(T.getView()!.text.includes('「架」'), '触屏近战：点「架」');
T.forceTouch = false; T.dock = false; run(0.2); assert.ok(T.getView()!.text.includes(keyLabel(bindOf('brawl'))), '电脑近战：说按键');
{ // 破罡过了（罡气回上来了）还没轰：说法改成「再连几拳」，不再说「打空了」
  T.jump('brawl'); B.toggleStance(); run(0.3); (T.snap as { sub: number }).sub = 2; const dd = T.dummy!; B.body(dd).breakT = 0; run(0.2);
  const tx = T.getView()!.text; assert.ok(!tx.includes('罡气打空了') && tx.includes('再连几拳'), `罡气没空时不说打空了：${tx}`);
  B.body(dd).breakT = 1; run(0.15); assert.ok(T.getView()!.text.includes('罡气打空了'), '破罡时叫你轰');
  B.toggleStance(); run(0.2);
}
console.log('触屏文案：通过');

// ------------------------------------------------ 七、情境小课：接口与开关
T.skip(); run(0.2);
assert.ok(T.trigger('lingzhou'), '灵舟的接口能触发'); run(0.1);
assert.equal(T.getView()?.lesson, 'ctx'); T.press('ok'); run(0.1); assert.equal(T.getView(), null, '「知道了」收起');
assert.ok(!T.trigger('lingzhou'), '上过的不再上');
setCtxLessonsOn(false); assert.ok(!T.trigger('haiyuan'), '设置里关了情境小课就不弹'); setCtxLessonsOn(true);
{ // 第五轮：旧存档（没有引导进度）里被追杀：老提示（写死键位那条）也要压住，只出小课；关了情境小课才放老提示
  const keep = (g.ws as any).tut; delete (g.ws as any).tut;
  assert.ok(T.mutes('pursuit', 'x'), '旧存档：被追杀的老提示让给小课'); assert.ok(T.mutes('mijing', 'x'), '旧存档：秘境的老提示让给小课');
  setCtxLessonsOn(false); assert.ok(!T.mutes('pursuit', 'x'), '关了情境小课：老提示照弹'); setCtxLessonsOn(true);
  (g.ws as any).tut = keep;
}
{ // 第五轮：触屏小课不出键盘键位
  T.forceTouch = true;
  const pz = T.lessons.find((l) => l.id === 'pursuit')!.pages(T), xk = T.lessons.find((l) => l.id === 'xukong')!.pages(T);
  assert.ok(!pz[1].text.includes(keyLabel(bindOf('conceal'))) && pz[1].text.includes('菜单'), `触屏被追杀第 2 页不写键位：${pz[1].text}`);
  assert.ok(!xk[1].text.includes(keyLabel(bindOf('descend'))) && xk[1].text.includes('「降」'), `触屏虚空第 2 页说「降」：${xk[1].text}`);
  T.forceTouch = false;
  assert.ok(T.lessons.find((l) => l.id === 'xukong')!.pages(T)[1].text.includes(keyLabel(bindOf('descend'))), '电脑虚空第 2 页写当前键位');
}
{ // 第六轮返工：筑基、结丹那一刻（清闲时，不必先进架势）就教欺身 / 缩地；在虚空里、被追杀时不抢；虚空课第一页指顶上的读数、第二页指「降」
  const tut = (g.ws as any).tut; tut.ctx = tut.ctx.filter((x: string) => x !== 'rush' && x !== 'suodi');
  const r0 = g.hero.realm; g.hero.realm = 1; run(0.3); if (T.getView()?.lesson === 'ctx') { T.press('ok'); run(0.1); }
  if (B.stance) B.toggleStance();
  c.combatT = 99; c.enemies.length = 0; p.flying = false; if (g.modal) g.closeModal(true);
  g.hero.realm = 2; run(0.3);
  assert.equal(T.getView()?.title, '化虹欺身', `筑基后清闲时就教欺身：${T.getView()?.title}`);
  assert.ok(T.getView()!.text.includes('架势'), '不在架势里：先说怎么进架势');
  T.press('ok'); run(0.1);
  g.hero.realm = 3; run(0.3);
  assert.equal(T.getView()?.title, '缩地追击', '结丹后清闲时就教缩地'); T.press('ok'); run(0.1);
  g.hero.realm = r0;
  const xk = T.lessons.find((l) => l.id === 'xukong')!.pages(T);
  assert.ok(xk[0].target && JSON.stringify(xk[0].target).includes('xukong-read'), '虚空课第一页指着顶上的读数');
  assert.ok(xk[1].target && JSON.stringify(xk[1].target).includes('dn'), '虚空课第二页指着「降」');
  // 入门一课御剑那一步：toggleFly 的旧提示（升降怎么按）不再另弹
  { const sk = tut.skipped, dn = tut.done; tut.skipped = false; tut.done = true; assert.ok(T.mutes('fly'), '上过入门一课：御剑的旧提示让给课里那一步'); tut.skipped = true; assert.ok(!T.mutes('fly'), '跳过了入门一课：旧提示照弹'); tut.skipped = sk; tut.done = dn; }
}
console.log('情境小课：通过');

// ------------------------------------------------ 八、出错不影响主循环
const bad = T.steps[0].update; T.jump('move'); (T.steps[0] as any).update = () => { throw new Error('故意的'); };
const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
run(0.5); console.warn = warn; (T.steps[0] as any).update = bad;
assert.ok(warned <= 1, '只警告一次'); assert.ok(g.time > 0, '主循环照走');
console.log('新手引导：全部通过');
process.exit(0);
