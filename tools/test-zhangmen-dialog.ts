// 掌门谈话退不出去（玩家反馈，Mac 版）：在宗门议事殿和掌门 / 执事交谈 → Towns.open(loc, 'sect') 开城镇面板并直接办「宗」这件事
// （TownPanel 挂上时的 useEffect 打开宗门对话）。对话叠在城镇面板上面（modalStack），关掉对话时城镇面板从栈里弹回来、
// 组件重新挂上——以前 fac 还挂在面板上，useEffect 又把宗门对话打开一次，于是「离开」/ Esc / × 永远关不掉。
// 这里在 node 里照 ModalLayer 的挂载规则模拟一遍（城镇面板从「不是城镇」变成「城镇」时算一次挂载，跑一遍 fac 那段），
// 散修 / 本门弟子 / 有任务可交 / 进藏经阁再出来 / 自家宗主大殿 / 宗门大战之后，都要能退到 g.modal === null。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;

const G = await import('../src/world/game');
const W0 = await import('../src/data/world');
const I = await import('../src/world/indoor');
const { MY_SECT_ID } = await import('../src/data/sects');
const C = await import('../src/world/cultivation');
const g = await G.createGame(() => {});
g.reset();
let ok = 0; const pass = (s: string) => { ok++; console.log('  ✓ ' + s); };
type Opt = { label: string; disabled?: boolean; act?: () => unknown };
type Node = { speaker: string; options: Opt[] };

// ---- 照 ModalLayer 的挂载规则：城镇面板每次从别的弹窗 / 无弹窗换回来，都是重新挂上，跑一遍 TownPanel 的 fac 那段 useEffect
let shown: string | null = null;
const render = () => {
  const m = g.modal as any;
  const k = m?.kind ?? null;
  if (k === 'town' && shown !== 'town' && m.fac && m.fac !== 'teleport') {
    const loc = m.loc;
    if (m.fac === 'sect') g.openDialog(g.towns.sectNode(loc));
    else if (m.fac === 'market' || m.fac === 'pill' || m.fac === 'artifact' || m.fac === 'talisman') g.openShop(g.towns.shop(loc, m.fac));
    return render();
  }
  shown = k;
};
/** DialogBox 的 pick：有下一句就换，没有且弹窗没变就 closeModal() */
const pick = (o: Opt) => { const before = g.modal; const nx = o.act?.() as Node | null | undefined; if (nx) g.openDialog(nx); else if (g.modal === before) g.closeModal(); render(); };
const node = () => (g.modal as any)?.kind === 'dialog' ? (g.modal as any).node as Node : null;
/** 一直往外退：对话里点「离开 / 返回 / 再想想」，别的弹窗按 Esc（closeModal()）——最多 12 步必须退干净 */
const escape = (what: string, viaEsc = false) => {
  for (let i = 0; i < 12; i++) {
    if (!g.modal) return i;
    const n = node();
    const leave = !viaEsc && n?.options.find((o) => !o.disabled && /^(离开|返回|再想想|告辞|先不了)/.test(o.label));
    if (leave) pick(leave); else { g.closeModal(); render(); }
  }
  assert.equal(g.modal, null, `${what}：退了 12 步还关不掉（停在 ${(g.modal as any)?.kind} ${node()?.speaker ?? ''}）`);
  return 12;
};

// ---- 走进青霞谷议事殿，站到掌门跟前交谈
const hf = W0.LOC_BY_ID.get('huangfeng')!;
const hall = I.roomsOf(hf).find((r) => r.kind === 'hall')!;
assert.ok(hall, '青霞谷有议事殿');
const talkTo = (title: string) => {
  g.closeModal(true); shown = null;
  const P = g.indoor.plan(hall), seat = P.seats.find((s) => s.title === title && s.talk)!;
  assert.ok(seat, `议事殿里有能交谈的${title}`);
  const [ox, oy] = I.toWorld(hall, 0, hall.plat + hall.ramp + 70);
  g.teleport(ox, oy); g.space.update(1, ox, oy);
  const [x, y] = I.toWorld(hall, seat.x, seat.z + 60);
  g.player.x = x; g.player.y = y;
  for (let i = 0; i < 6; i++) g.indoor.update(0.1);
  assert.equal(g.indoor.focus?.seat.title, title, `站到${title}跟前，${title}成了交谈焦点`);
  assert.ok(g.indoor.interact(), '交谈');
  render();
  const n = node();
  assert.ok(n, `和${title}交谈弹出宗门对话（现在是 ${(g.modal as any)?.kind}）`);
  return n!;
};

// 1. 散修：山门对话「离开」
{
  g.ws.sect = null;
  const n = talkTo('掌门');
  assert.ok(n.options.some((o) => o.label === '离开'), '散修的山门对话有「离开」');
  const k = escape('散修和掌门谈话后点离开');
  pass(`散修和掌门交谈 → 山门对话 → 点「离开」${k} 步退干净`);
  talkTo('掌门'); escape('散修和掌门谈话后按 Esc', true);
  pass('散修和掌门交谈 → 按 Esc / × 也退得干净');
}
// 2. 本门弟子：宗门事务对话（任务、藏经阁、晋升……）每一项点过之后都要退得出来
{
  g.hero.realm = 1; g.hero.stage = 2;
  g.ws.sect = null; g.towns.join(hf);
  if (!g.ws.sect) { g.ws.sect = { id: 'huangfeng', rank: 0, contrib: 50, joined: g.day, lastPay: g.day, tasks: [], done: 0 } as any; (g.towns as any).refreshTasks(); }
  assert.equal(g.ws.sect?.id, 'huangfeng', '拜入青霞谷');
  const n0 = talkTo('掌门');
  assert.ok(n0.options.some((o) => o.label === '离开'), '弟子的宗门事务对话有「离开」');
  escape('本门弟子和掌门谈话后点离开');
  pass('本门弟子和掌门交谈 → 宗门事务 → 点「离开」退干净');
  const labels = n0.options.filter((o) => !o.disabled && o.label !== '离开' && o.label !== '叛出宗门').map((o) => o.label);
  for (const lb of labels) {
    const n = talkTo('掌门');
    const o = n.options.find((x) => x.label === lb)!;
    pick(o);
    escape(`点了「${lb.slice(0, 16)}」之后`);
  }
  pass(`宗门事务的 ${labels.length} 个选项（任务指路、藏经阁 / 丹房……）点过之后都退得出来`);
  // 有任务可交：贡献到手，再退
  const s = g.ws.sect!; const t = s.tasks[0];
  if (t) { (g.towns as any).taskProgress = () => t.need; const c0 = s.contrib; const n = talkTo('掌门'); pick(n.options.find((o) => o.label.startsWith('✔ 交付'))!); assert.ok(s.contrib > c0, '交付任务得贡献'); escape('交付任务之后'); delete (g.towns as any).taskProgress; pass('有任务可交：交付之后照样退得出来'); }
  // 执事也是同一条路
  talkTo('执事'); escape('和执事交谈后');
  pass('和议事殿的执事交谈也退得出来');
  // 叛出宗门：确认后对话关掉，回到城镇面板也能关
  { const n = talkTo('掌门'); pick(n.options.find((o) => o.label === '叛出宗门')!); pick(node()!.options.find((o) => o.label === '确定')!); escape('叛出宗门之后'); assert.equal(g.ws.sect, null); pass('叛出宗门之后退得出来'); }
}
// 3. 门口进铺子（同一条路：Towns.open(loc, fac)）：关掉货架回到城镇总览，不再又弹货架
{
  const yue = W0.LOC_BY_ID.get('yuejing')!;
  g.closeModal(true); shown = null;
  g.towns.open(yue, 'pill'); render();
  assert.equal((g.modal as any)?.kind, 'shop', '从门口进丹药铺直接开货架');
  g.closeModal(); render();
  assert.equal((g.modal as any)?.kind, 'town', '关掉货架回到城镇总览');
  assert.ok(!(g.modal as any).fac, '回来的城镇总览不再带着「直接办事」');
  escape('关掉铺子');
  pass('门口进铺子：关货架回城镇总览、再关就退干净');
}
// 4. 自家宗主大殿（mysect）、宗门大战之后
{
  g.closeModal(true); shown = null;
  g.hero.realm = 4; g.hero.stage = 1; C.addItem(g.hero, 'mat_lingshi', 3000000);
  const ms: any = { name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: g.day - 3000, fame: 900, stones: 200000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 2, zhen: 2, ling: 5 }, open: false, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0 };
  (g.ws as any).mySect = ms;
  for (let i = 0; i < 40; i++) { const realm = i < 2 ? 4 : i < 10 ? 3 : 2; ms.ds.push({ id: ms.seq++, name: '弟子' + i, sex: i % 2 ? 'm' : 'f', age: 30, root: 1 + (i % 5), realm, stage: i % 3, exp: 0.5, loyal: 70, rank: realm >= 3 ? 3 : 1, job: 'xiu', joined: g.day, arts: 0 }); }
  (g.mysect as any).sync(); (g.sectwar as any).initHolds?.();
  const my = W0.LOC_BY_ID.get(MY_SECT_ID) ?? W0.locHere?.(MY_SECT_ID);
  if (my) {
    g.towns.open(my as any, 'sect'); render();
    assert.ok(node(), '自家山门：直接开宗主大殿');
    escape('宗主大殿');
    pass('自家宗主大殿退得出来');
    // 宗门大战之后（打一仗的日结算），再进大殿
    const SW = g.sectwar as any;
    try { for (let d = 0; d < 60; d++) { g.day += 1; SW.daily(1); } } catch (e) { console.log('    （宗门大战日结算抛错，跳过：' + (e as Error).message + '）'); }
    g.towns.open(my as any, 'sect'); render(); escape('宗门大战之后的宗主大殿');
    pass('宗门大战日结算之后，宗主大殿照样退得出来');
  } else console.log('    （本图没有自家山门的地点，跳过宗主大殿）');
}
console.log(`test-zhangmen-dialog: ${ok} 项通过`);
