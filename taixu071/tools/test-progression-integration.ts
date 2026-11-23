import assert from 'node:assert/strict';
import './env';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const C = await import('../src/world/cultivation');
const { smallBottleneck, MAJOR_BREAKS } = await import('../src/data/realms');
const { setModx } = await import('../src/mod/hooks');
const { Game } = await import('../src/world/game');
const { MijingSys } = await import('../src/world/mijing');
const { DaoxinSys } = await import('../src/world/daoxin');
const { PianjuSys } = await import('../src/world/pianju');

function setupHero() { const h = C.newHero(); h.stage = 5; h.exp = C.need(h) - 1; h.wuP = C.WU_MAX; h.wuM = Math.floor(h.age * 12); return h; }
function setupGame(h: C.Hero) {
  const messages: string[] = []; let dialog: any;
  const g: any = { hero: h, player: { x: 0, y: 0 }, ws: { rep: 0 }, day: 100, toast: (s: string) => messages.push(s), flushMsgs: (a: C.Msg[]) => a.forEach(x => messages.push(x.text)), updateUI() {}, news() {}, jianghu: { addCred() {} }, openDialog: (d: any) => { dialog = d; }, gainInsightExp: Game.prototype.gainInsightExp };
  return { g, messages, getDialog: () => dialog };
}
// 真实秘境交互入口：只到账 1 点，显示实际值，满瓶颈不再消耗池。
{
 const h = setupHero(), {g, getDialog} = setupGame(h); const mj = new MijingSys(g);
 const stele: any = { kind: 'stele', x: 0, y: 0 };
 mj.cur = { spec: { tier: 1, lv: 3, name: '测试' }, floors: [{ objs: [stele] }], fi: 0 } as any;
 mj.focus = stele; assert.equal(mj.interact(), true);
 assert.equal(h.exp, C.need(h)); assert.match(getDialog().text, /修为 \+1/); const pool = h.wuP;
 stele.used = false; mj.focus = stele; mj.interact(); assert.equal(h.wuP, pool); assert.match(getDialog().text, /修为 \+0/);
}
// 无瓶颈的小境界可自动晋升并展示消息；感悟枯竭及化神封顶如实显示 0。
{
 const h = C.newHero(); h.stage = 4; h.exp = C.need(h) - 1; h.wuP = C.WU_MAX; h.wuM = Math.floor(h.age * 12);
 const {g, messages, getDialog} = setupGame(h); const mj = new MijingSys(g);
 const stele: any = { kind: 'stele', x: 0, y: 0 };
 mj.cur = { spec: { tier: 1, lv: 3, name: '测试' }, floors: [{ objs: [stele] }], fi: 0 } as any;
 mj.focus = stele; mj.interact();
 assert.equal(h.stage, 5); assert.ok(h.exp > 0); assert.ok(messages.some(x => x.includes('晋入')));
 h.wuP = 0; stele.used = false; mj.focus = stele; const before = h.exp; mj.interact(); assert.equal(h.exp, before); assert.match(getDialog().text, /修为 \+0/);
 h.realm = 5; h.stage = 0; h.exp = C.need(h); stele.used = false; mj.focus = stele; mj.interact(); assert.equal(h.exp, C.need(h)); assert.match(getDialog().text, /修为 \+0/);
}
// 前世碑真实对话选项。
{
 const h = setupHero(), {g, messages} = setupGame(h); const d = new DaoxinSys(g);
 const node = d.steleNode({ id: 's', place: '荒野', bio: [], notes: [] } as any);
 node.options.find(x => x.label.includes('拜一拜'))!.act!();
 assert.equal(h.exp, C.need(h)); assert.ok(messages.some(x => x.includes('修为 +1')));
}
// 骗局的两个真实对话选项。
{
 const h = setupHero(), {g, messages, getDialog} = setupGame(h); const p: any = new PianjuSys(g);
 const node = p.mortalChild({ x: 0, y: 0, done: false }); node.options[0].act();
 assert.equal(h.exp, C.need(h)); assert.ok(messages.some((x: string) => x.includes('修为 +1')));
 h.exp = C.need(h) - 1; g.ws.home = { q: 0.1, array: 0 }; g.ws.pj = { cave: { found: false, day: 0, adv: 2, q: 0.1, broker: '某人' } };
 p.caveTick(); getDialog().options.find((x: any) => x.label.includes('认了这一回')).act();
 assert.equal(h.exp, C.need(h)); assert.ok(messages.some((x: string) => x.includes('修为 +1')));
}
// 模组取消时大小突破都不扣主丹、辅助物，不污染最近假药记录。
for (const major of [false, true]) {
 const h = C.newHero(); h.realm = major ? 3 : 1; h.stage = major ? 2 : 5; h.exp = C.need(h); h.bag = [];
 const id = major ? MAJOR_BREAKS[h.realm].item : smallBottleneck(h.realm, h.stage)!.item;
 C.addFakeItem(h, id, 2, 'dyed'); if (major) C.addItem(h, 'pill_ningpo', 1);
 C.takeLastFake(); const before = structuredClone(h); let seen = false;
 setModx({ has: (n: string) => n === 'breakthrough', fire: (_: string, ctx: any) => { seen = true; assert.deepEqual(h.bag, before.bag); return { ...ctx, cancel: true }; } } as any);
 assert.equal(C.tryBreak(h, 1).ok, false); assert.ok(seen); assert.deepEqual(h, before); assert.equal(C.takeLastFake(), null);
 // 钩子修改库存时拒绝后续自动扣除，不尝试回滚模组自身行为。
 setModx({ has: () => true, fire: (_: string, ctx: any) => { h.bag.push({id:'mat_lingshi', n:1}); return ctx; } } as any);
 C.tryBreak(h, 1); assert.equal(C.bagCount(h, id), 2);
 setModx(null);
 // 可用主丹被真实扣除，假药与辅助丹按旧规则处理。
 setModx({ has: () => true, fire: (_: string, ctx: any) => ({...ctx, chance: 0}) } as any);
 C.tryBreak(h, 1); assert.equal(C.bagCount(h, id), 1); if (major) assert.equal(C.bagCount(h, 'pill_ningpo'), 0);
 assert.equal(C.takeLastFake()?.fake, 'dyed'); setModx(null);
}
console.log('progression integration: real event rewards, display, mod cancellation and consumption passed');
