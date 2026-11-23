// 回归：夺宝局「怀宝之人」被你杀了，东西只是随储物袋落了地；你没捡就走，了结时却照样说「到手」。
// node node_modules/tsx/dist/cli.mjs tools/test-duobao-end.ts
// 期望：了结看袋里真有没有——捡了才算到手（done）；没捡就是落在原地（fail），提示 / 恩怨页 / 江湖消息都不说到手。
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

const B = g.duobao, N = g.npcs, h = g.hero;
const NPCMOD = await import('../src/world/npc'), WORLD = await import('../src/data/world');
h.realm = Math.max(1, h.realm);
/** 生成一局怀宝之人，强攻，把怀宝之人杀了（储物袋落地），守卫都跑了 */
let wild: { x: number; y: number } | undefined;
function killCarrier(): any {
  g.modal = null; g.combat.loot = []; B.S.job = null;
  const p = g.player;
  // 找一个能当「怀宝之人」的修士（不在城镇安全区），人站到他一万步开外，生成的就是怀宝之人这一种
  const { npcMap } = NPCMOD, { ACTIVE_MAP } = WORLD;
  const ok3 = (d: any) => d.alive && npcMap(d) === ACTIVE_MAP && d.realm >= 1 && d.realm <= Math.min(5, h.realm + 1) && d.faction !== 'mortal' && !d.canon && !d.beauty && !d.bond && !d.stay && !d.gz && !d.orig && !d.mod && !d.hidden && !d.zf && d.db === undefined && !d.dazi && !d.hunting && !d.chasing && d.wanted === undefined && !(d.grudge > 0) && !N.activeOf(d.id);
  let cand: any = N.list.find((d: any) => ok3(d) && !g.combat.safeAt(d.x, d.y));
  // 野外能用的人不多：没有就挑一个，挪到上一局那片野地里歇脚
  if (!cand && wild) { cand = N.list.find(ok3); cand.x = wild.x + 300; cand.y = wild.y; }
  wild ??= { x: cand.x, y: cand.y };
  p.x = cand.x + 10000; p.y = cand.y; if (g.combat.safeAt(p.x, p.y)) p.x = cand.x - 10000;
  const j: any = B.spawn('carrier');
  ok(!!j && j.k === 'carrier' && !!N.byId.get(j.tgt)?.bag?.[j.item], `生成一局怀宝之人：${N.byId.get(j?.tgt)?.name}身怀${j?.itemName}`);
  h.bag = h.bag.filter((b: any) => b.id !== j.item);
  j.ph = 'strike'; p.x = j.x + 300; p.y = j.y; N.refreshActive();
  B.attack(j, false);
  const t: any = N.byId.get(j.tgt), e: any = N.activeOf(t.id)?.enemy;
  ok(!!e, '强攻：怀宝之人转成敌人');
  e.hp = 0; e.dead = true; N.onEnemyKilled(e);
  ok(!t.alive && g.combat.loot.some((l: any) => l.id === j.item), `怀宝之人死了，${j.itemName}随储物袋落地`);
  for (const d of B.members(j)) { const a = N.activeOf(d.id); if (a?.enemy) a.enemy.aggro = false; }
  (B as any).t = 0; B.frame(0.5);
  ok(j.ph === 'escape', '打完：进入脱身');
  return j;
}
const leave = (j: any) => { g.combat.enemies = g.combat.enemies.filter((e: any) => !e.dead && e.aggro); g.player.x = j.x + 9500; g.player.y = j.y; (B as any).t = 0; B.frame(0.5); };

// 一、没捡就走
{
  const j = killCarrier();
  toasts.length = 0;
  leave(j);
  ok(C.bagCount(h, j.item) === 0, '袋里确实没有');
  ok(j.ph === 'fail', `没捡：了结为失手（ph = ${j.ph}）`);
  ok(!toasts.some((s) => s.includes(`${j.itemName}到手`)) && !(j.end ?? '').includes('脱了身。没人') && !(j.end ?? '').includes(`带着${j.itemName}`), `没捡：不说到手——${toasts.find((s) => s.includes('夺宝局')) ?? ''} / ${j.end}`);
}
// 二、捡起来再走
{
  const j = killCarrier();
  const l = g.combat.loot.find((x: any) => x.id === j.item);
  g.player.x = l.x; g.player.y = l.y; step(30);
  ok(C.bagCount(h, j.item) >= 1, `走到储物袋跟前捡起${j.itemName}`);
  toasts.length = 0;
  leave(j);
  ok(j.ph === 'done' && toasts.some((s) => s.includes(`${j.itemName}到手`)), `捡了：到手（ph = ${j.ph}）`);
}
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
