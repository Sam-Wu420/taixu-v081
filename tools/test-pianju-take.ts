// 回归：骗局「结拜图谋」中了迷魂散，义兄「卷走」你的本命法宝（飞遁器 / 法衣 / 护盾），原先只清了装备槽、东西还在袋里。
// node node_modules/tsx/dist/cli.mjs tools/test-pianju-take.ts
// 期望：被卷走的那一件真从袋里扣掉（同名的另一件留着），进了义兄的储物袋 + 夺袋记录（杀了他能追回：储物袋落地里有它）。
import { createCanvas } from './env';
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const C = await import('../src/world/cultivation');

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
let fails = 0;
const ok = (cond: any, msg: string) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const step = (n: number) => { for (let i = 0; i < n; i++) { g.update(1 / 30); if (g.modal) g.closeModal(true); } };
const toasts: string[] = []; const toast0 = g.toast.bind(g); g.toast = (s: string, ...a: any[]) => { toasts.push(s); return toast0(s, ...a); };
step(10);

const h = g.hero;
const d: any = [...g.npcs.byId.values()].find((x: any) => x.alive && x.realm >= 1 && x.faction !== 'mortal');
ok(!!d, '找一个修士当结拜义兄：' + d?.name);
d.bond = 'sworn'; d.bag = {};
for (const run of [['flight', 'art_qingyuzhou'], ['armor', 'art_yunwenyi']] as const) {
  const [slot, id] = run;
  h.equip.flight = undefined; h.equip.armor = undefined; h.equip.shield = undefined;
  h.bag = h.bag.filter((b: any) => !b.id.startsWith('scroll_art_') && b.id !== id);
  C.addItem(h, id, 2);                 // 两件同名：穿着一件，袋里还有一件
  // 两样更值钱的杂物摆在袋首（随机数取小值时「两三件值钱杂物」挑的是它们，不碰同名的那件）
  h.bag.unshift({ id: 'art_jinghongsuo', n: 1 }, { id: 'art_jinghongsuo', n: 1 });
  h.equip[slot] = id;
  const n0 = C.bagCount(h, id), bag0 = d.bag[id] ?? 0, sb0 = (g.ws.stolenBags ?? []).length;
  const s: any = { id: d.id, name: d.name, day: 0, stage: 1 };
  const node: any = (g.pianju as any).swornNode(s, d);
  // 第一个随机数：没识破酒里有异；之后的都取小值（本命法宝必被卷走）
  const r0 = Math.random; let k = 0; Math.random = () => (k++ === 0 ? 0.999 : 0.01);
  try { node.options[0].act(); } finally { Math.random = r0; }
  ok(s.stage === 2, `[${slot}] 中了迷魂散`);
  ok(h.equip[slot] === undefined, `[${slot}] 装备槽空了`);
  ok(C.bagCount(h, id) === n0 - 1, `[${slot}] 被卷走的那件真从袋里扣掉（${n0} → ${C.bagCount(h, id)}，应为 ${n0 - 1}）`);
  ok(C.bagCount(h, id) === 1, `[${slot}] 同名的另一件还在袋里`);
  ok((d.bag[id] ?? 0) === bag0 + 1, `[${slot}] 进了义兄的储物袋`);
  const sb = (g.ws.stolenBags ?? [])[sb0];
  ok(!!sb && sb.items.some((x: any) => x.id === id), `[${slot}] 夺袋记录里有它（可追回）`);
}
// 追回：杀了义兄，储物袋落地里有被卷走的法宝
{
  const loot = g.living.lootOf(d);
  ok(loot.items.some(([id]: any) => id === 'art_qingyuzhou') && loot.items.some(([id]: any) => id === 'art_yunwenyi'), '杀了他：储物袋落地里有被卷走的两件法宝');
}
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
