// 恩怨重做 · 第一批：受害者不再被追杀（world/feud.ts 与 relations / npc / pursuit / war / town 里的几处）
//   npx tsx tools/test-feud.ts
// 覆盖计划「验证」一节的十三种情况：交钱后不再被劫、自卫反杀只结旧怨、先手杀人结血仇、扑空三次认栽、换图不跟、
// 没目击者 / 易容认不出、城外守候到时限离开、出村预警、战书不去不升血仇、存读档热度不丢、组队、宗门护短、缉凶任务。
// 第二批 14–22 节；第三批 23–27 节：NPC 执法、NPC 主动找你、搭档、夺宝局、存读档。
import './env';
import { mulberry32 } from '../src/core/rng';
import './fixed-clock';
Math.random = mulberry32(Number(process.env.SEED ?? 7));
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const F0 = await import('../src/world/feud');
const { Roster, SECT_DEF } = await import('../src/world/roster');
const SECT_DEMON = (id?: string) => !!id && !!SECT_DEF.get(id)?.demon;
const EY = await import('../src/world/enyuan');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { ORDER_NAME } = await import('../src/world/party');
const C = await import('../src/world/cultivation');
const g = await G.createGame(() => {});
g.reset();
let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const R = g.rel, N = g.npcs, F = R.feud, h = g.hero;
const WILD = { x: 120000, y: 93000 };
g.player.x = WILD.x; g.player.y = WILD.y;
console.log('wild safe?', g.combat.safeAt(WILD.x, WILD.y), 'day', g.day);
g.day = Math.max(g.day, 500);   // 过了新手一年
const fresh = (pred: (d: any) => boolean) => N.list.find((d: any) => d.alive && !d.canon && !d.beauty && !d.stay && !d.bond && !d.ros && !d.gz && (d.map ?? 'tiannan') === W.ACTIVE_MAP && !(d.grudge > 0) && pred(d))!;
const kinOf = (d: any) => (d.ties ?? []).filter((t: any) => t.k === 'kin' || t.k === 'lover' || t.k === 'sworn' || t.k === 'master' || t.k === 'disciple').map((t: any) => N.byId.get(t.id)).filter((o: any) => o && o.alive && o.realm > 0 && !o.stay && !o.beauty);
const withKin = (pred: (d: any) => boolean = () => true): any => {
  const v = fresh((d) => d.realm >= 1 && d.faction !== 'demon' && kinOf(d).length > 0 && pred(d)) ?? fresh((d) => d.realm >= 1 && d.faction !== 'demon' && pred(d));
  if (!kinOf(v).length) { const o = fresh((d) => d !== v && d.realm >= 1 && !d.ties?.some((t: any) => t.id === v.id)); R.link(v, o, 'kin', '兄', '弟'); }   // 名册里有亲人的修士不多：现结一门亲
  return v;
};
const anyone = (pred: (d: any) => boolean = () => true) => fresh((d) => d.realm >= 1 && pred(d));
const near = (a: any, dx = 300) => { a.st.x = a.d.x = g.player.x + dx; a.st.y = a.d.y = g.player.y; };

// 1) 练气期被筑基劫道：拦路索财——交钱后六十日内不再被这个人劫
{
  h.realm = 1; h.stage = 3; C.addItem(h, 'mat_lingshi', 1000);
  const d: any = fresh((x) => x.realm === 2 && (x.pers === 'greedy' || x.pers === 'ruthless') && x.faction === 'rogue');
  const a: any = N.summon(d.id); a.act = 'idle'; near(a);
  const stones0 = C.bagCount(h, 'mat_lingshi');
  const node = F.shakedown(a, () => { throw new Error('不该动手'); }, () => 0.99);
  ok(node.options.length === 3 && /三成灵石/.test(node.options[0].label), `拦路索财三个选项：${node.options.map((o) => o.label).join(' / ')}`);
  node.options[0].act!();
  const paid = stones0 - C.bagCount(h, 'mat_lingshi');
  ok(paid === Math.round(stones0 * 0.3) && !(d.grudge > 0) && d.robCd >= g.day + 59, `交出三成（${paid}），不结仇，冷却到第 ${Math.round(d.robCd - g.day)} 日后`);
  // 六十日内：他神识扫到你也不扑
  let pounce = 0;
  for (let i = 0; i < 40; i++) { a.act = 'idle'; a.noticed = 2; a.enemy = undefined; near(a, 400); (N as any).senseCheck(); if (a.act === 'approach') pounce++; g.day += 1.4; }
  ok(pounce === 0, `五十多天里神识撞见 40 次，一次都没扑上来（${pounce}）`);
  // 冷却按游玩时间：过了六十日，但游玩时间不到十五分钟，仍不劫；两个都到了才可能再劫
  const tryPounce = (n: number) => { let c = 0; for (let i = 0; i < n; i++) { a.act = 'idle'; a.noticed = 2; a.enemy = undefined; near(a, 400); (N as any).senseCheck(); if (a.act === 'approach') { c++; a.act = 'idle'; (a as any).shake = false; } } return c; };
  ok(d.robP !== undefined && d.robP - F0.playOf(g) >= F0.ROB_PLAY_PAID - 1, `交钱后另记游玩冷却 ${Math.round((d.robP - F0.playOf(g)) / 60)} 分钟`);
  g.day = d.robCd + 5; R.daily(1);
  ok(F0.robGuard(g, d) && tryPounce(40) === 0, `过了六十日（第 ${Math.round(g.day)} 日），游玩时间才过 ${Math.round(F0.playOf(g) / 60)} 分钟：仍不劫`);
  g.ws.play = F0.playOf(g) + F0.ROB_PLAY_PAID - 60; R.daily(1);
  ok(F0.robGuard(g, d) && tryPounce(40) === 0, '游玩十四分钟：仍不劫');
  g.ws.play = F0.playOf(g) + 61; R.daily(1);
  ok(!F0.robGuard(g, d) && d.robCd === undefined && d.robP === undefined && tryPounce(40) > 0, '天数和游玩时间都到了：才可能再劫');
  // 反过来：游玩时间够了、天数没到，也不劫（读档、挂机都跳不过去）
  F0.setRobCd(g, d, 'fail'); g.ws.play = F0.playOf(g) + F0.ROB_PLAY_FAIL + 10;
  ok(F0.robGuard(g, d) && tryPounce(30) === 0, '劫道失败：游玩八分钟到了、三十日没到，仍不劫');
  g.day += F0.ROB_CD_FAIL + 1;
  ok(!F0.robGuard(g, d), '三十日也到了：冷却解除');
  // 饶命 / 买命钱：二十分钟
  F0.setRobCd(g, d, 'spare'); g.day += F0.ROB_CD_SPARE + 1;
  ok(F0.robGuard(g, d) && d.robP! - F0.playOf(g) === F0.ROB_PLAY_SPARE, '饶命：九十日过了，二十分钟游玩没到，仍在冷却');
  g.ws.play = F0.playOf(g) + F0.ROB_PLAY_SPARE; ok(!F0.robGuard(g, d), '饶命：二十分钟到了，冷却解除');
  F0.setRobCd(g, d, 'paid'); (globalThis as any).__robber = d.id;   // 存读档那一节再查
  // 逃：成功不结仇
  const d2: any = fresh((x) => x.realm === 2 && x !== d && x.faction === 'rogue');
  const a2: any = N.summon(d2.id); a2.act = 'idle'; near(a2);
  const n2 = F.shakedown(a2, () => {}, () => 0.0); n2.options[1].act!();
  ok(!(d2.grudge > 0) && d2.robCd > g.day, '逃掉了：不结仇，记冷却');
  // 打：他先动的手
  const d3: any = fresh((x) => x.realm === 2 && x !== d && x !== d2 && x.faction === 'rogue');
  const a3: any = N.summon(d3.id); a3.act = 'idle'; near(a3);
  let fought = false; F.shakedown(a3, () => { fought = true; }, () => 0.5).options[2].act!();
  ok(fought && F0.npcStarted(d3, g.day) && F.selfDef(d3), '拔剑：先手记在他身上，反杀算自卫');
  for (const x of [a, a2, a3]) { N.dismiss(x.d.id); x.act = 'idle'; }
  // 练气期不会被追杀
  g.pursuit.reset(); g.pursuit.cd = 0;
  ok(!g.pursuit.start({ reason: 't', gap: 1 }), '练气期：无名追兵不会来（门槛提到筑基）');
}
h.realm = 2; h.stage = 0;

// 2) 被劫后自卫反杀：劫匪亲族只结旧怨，不追杀
let oldKin: any;
{
  const v: any = withKin();
  F0.markAssail(v, 'npc', g.day);
  const kin = kinOf(v); oldKin = kin[0];
  R.onPlayerKill(v, F.selfDef(v)); N.die(v, '死于苏寒之手');
  ok(kin.every((o: any) => o.grudge === 1 && (o.heat ?? 0) < F0.HUNT_MIN && o.feudBy === 'npc' && o.huntAt === undefined), `自卫反杀：亲族 ${kin.map((o: any) => `${o.name}·仇${o.grudge}·热${o.heat}`).join('、')} 只结旧怨`);
  for (const o of kin) o.huntAt = g.day;
  R.daily(1);
  ok(kin.every((o: any) => !o.hunting && !o.chasing) && !g.pursuit.cur, '旧怨不发起追杀');
  // 目击者也站在受害者这边：他劫你时有人看见，亲友连说法都不讨
  const v2: any = withKin(); F0.markAssail(v2, 'npc', g.day, 2);
  const k2 = kinOf(v2); R.onPlayerKill(v2, F.selfDef(v2)); N.die(v2, '死于苏寒之手');
  ok(k2.every((o: any) => !(o.grudge > 0)), '劫你时有人目击：他理亏，亲族不结仇');
}

// 3) 你先手杀人：亲族结血仇，会追杀
let blood: any;
{
  const v: any = withKin(); F0.markAssail(v, 'hero', g.day);
  const kin = kinOf(v); blood = kin[0];
  ok(!F.selfDef(v), '你先动的手：不算自卫');
  R.onPlayerKill(v, F.selfDef(v)); N.die(v, '死于苏寒之手');
  ok(kin.every((o: any) => o.grudge === 2 && o.heat >= 72 && o.feudBy === 'hero'), `先手杀人：亲族血仇（${kin.map((o: any) => o.name + '·热' + o.heat).join('、')}）`);
  blood.map = W.ACTIVE_MAP; blood.x = g.player.x + 4000; blood.y = g.player.y; blood.huntAt = g.day; blood.huntP = 0; g.pursuit.reset(); g.pursuit.cd = 0;
  R.daily(1);
  ok(blood.hunting || blood.chasing || R.S.wanted.some((w: any) => w.by === blood.id) || (g.pursuit as any).pending, '血仇会出手（追杀 / 雇凶 / 悬赏）');
  g.pursuit.reset();
}

// 4) 追杀扑空三次就认栽：热度清零，仇降回旧怨
{
  const k = blood; k.heat = 90; k.grudge = 2; k.miss = 0;
  const hs: number[] = [];
  for (let i = 0; i < 3; i++) { F.miss(k, 'pursuit'); hs.push(k.heat); }
  ok(hs[0] < 88 && hs[1] < hs[0] && k.heat === 0 && k.grudge === 1 && k.huntAt === undefined, `扑空三次：热度 ${hs.join(' → ')}，认栽，仇降为旧怨`);
}

// 4b) 追杀间隔、搜捕时限、热度降温也按游玩时间
{
  const k: any = anyone(); k.grudge = 2; k.heat = 80; k.feudBy = 'hero'; k.miss = 0;
  F0.setHuntAt(g, k, g.day + 18);
  g.day += 30;
  ok(!F0.huntDue(g, k), `追杀的日子到了，游玩时间不到 ${F0.huntPlayGap(k) / 60} 分钟：不来`);
  g.ws.play = F0.playOf(g) + F0.huntPlayGap(k);
  ok(F0.huntDue(g, k), '两个都到了：才来');
  // 搜捕：到了最后见到你的地方，二十多息过了也还要搜满三分钟
  k.hunting = true; k.map = W.ACTIVE_MAP; k.seen = { day: g.day, x: g.player.x + 2000, y: g.player.y, map: W.ACTIVE_MAP }; k.x = k.seen.x; k.y = k.seen.y; k.search = g.day + F0.SEARCH_DAYS; k.searchP = undefined; k.chasing = false;
  (F as any).hotT = 0; (F as any).t = 0; F.frame(0.5);
  g.day += F0.SEARCH_DAYS + 1; (F as any).t = 0; F.frame(0.5);
  ok(k.hunting && k.search !== undefined, '搜捕：日子过了、游玩不到三分钟，还在搜');
  g.ws.play = F0.playOf(g) + F0.SEARCH_PLAY; (F as any).t = 0; F.frame(0.5);
  ok(!k.hunting && k.search === undefined && k.miss === 1, '搜满三分钟：扑空离开');
  // 热度：正常走着的光阴按游玩时间降（一分钟游玩，受害一方的仇降 10 点，不是三十日降 120 点）
  const v: any = anyone((x) => x !== k); v.grudge = 1; v.heat = 60; v.feudBy = 'npc'; v.map = W.ACTIVE_MAP; v.seen = { day: g.day, x: g.player.x, y: g.player.y, map: W.ACTIVE_MAP };
  F.heatDays(0); g.ws.play = F0.playOf(g) + 60; F.daily(30);
  ok(Math.abs((60 - v.heat) - 10) < 0.01, `一分钟游玩（光阴三十日）：受害一方的仇降 ${(60 - v.heat).toFixed(1)} 点`);
  F.heatDays(0); F.daily(10);
  ok(v.heat < 50 - 39, `远行 / 闭关跳过的十日照旧一日算一日（剩 ${v.heat.toFixed(1)}）`);
  k.grudge = 0; k.heat = 0; k.hunting = false; v.grudge = 0; v.heat = 0;
}

// 5) 换图后仇人不跟着跨图
{
  const k = anyone(); k.grudge = 2; k.heat = 80; k.feudBy = 'hero'; k.map = 'luanxing';
  const x0 = k.x; g.pursuit.reset(); g.pursuit.cd = 0;
  ok(!R.startHunt(k) && k.map === 'luanxing' && k.x === x0, '仇人在别的地图：不会被搬到你这张图来');
  const h0 = k.heat; F.daily(5); const fast = h0 - k.heat;
  const k2 = anyone((x) => x !== k); k2.grudge = 2; k2.heat = 80; k2.feudBy = 'hero'; k2.seen = { day: g.day, x: g.player.x, y: g.player.y, map: W.ACTIVE_MAP };
  F.daily(5); const slow = 80 - k2.heat;
  ok(fast > slow * 2, `别图的仇家热度降得更快（五日：别图 -${fast.toFixed(1)} / 本图 -${slow.toFixed(1)}）`);
  k.grudge = 0; k.heat = 0; k2.grudge = 0; k2.heat = 0;
}

// 6) 没有目击者，或者易容后，不会被认出
{
  const v: any = withKin(); F0.markAssail(v, 'hero', g.day);
  const kin = kinOf(v); R.onPlayerKill(v, false, { anon: true }); N.die(v, '死于荒野');
  ok(kin.every((o: any) => !(o.grudge > 0)), '没人看见：仇记在无名凶手头上，亲族不追杀你');
  const k: any = anyone(); k.grudge = 2; k.heat = 80; k.feudBy = 'hero'; F.see(k);
  ok(F.recognizes(k), '没易容：认得你');
  C.addItem(h, 'pill_yirong', 1); g.usePill('pill_yirong');
  ok(!F.recognizes(k) && F.disguised(), '服了易容丹：认不出你');
  k.huntAt = g.day; k.map = W.ACTIVE_MAP; R.daily(1);
  ok(!k.hunting && !k.chasing && k.huntAt > g.day, '易容期间：仇家不来追杀');
  (g.ws.flags as any).yirong = 0;
  ok(F.recognizes(k), '药效过了：又认得出');
  (h as any).wardrobe = { ...((h as any).wardrobe ?? { sex: 'm', dye: 0 }), outfit: 'zz_test_outfit' };
  ok(!F.recognizes(k), '换了衣着：认不出');
  delete (h as any).wardrobe; k.grudge = 0; k.heat = 0;
}

// 7) 守在城外等你的人到时限会离开
{
  const town = [...W.LOC_BY_ID.values()].find((l: any) => (l.type === 'town' || l.type === 'city') && l.map === W.ACTIVE_MAP && g.combat.safeAt(l.x * W.WORLD_SCALE, l.y * W.WORLD_SCALE))!;
  g.player.x = town.x * W.WORLD_SCALE; g.player.y = town.y * W.WORLD_SCALE;
  const k: any = anyone(); k.grudge = 2; k.heat = 80; k.feudBy = 'hero'; k.hunting = true; k.huntStart = g.day; k.x = g.player.x + 3000; k.y = g.player.y; k.miss = 0;
  (F as any).hotT = 0; (F as any).t = 0; F.frame(0.5);
  ok(k.waitUntil !== undefined && k.hunting, `你在${town.name}城里：他守在城外（等到第 ${Math.round(k.waitUntil - g.day)} 日后）`);
  g.day += F0.WAIT_DAYS + 0.5; (F as any).t = 0; F.frame(0.5);
  ok(k.hunting && k.waitUntil !== undefined, `二十日过了，游玩时间不到 ${F0.WAIT_PLAY / 60} 分钟：还在城外守着`);
  g.ws.play = F0.playOf(g) + F0.WAIT_PLAY; (F as any).t = 0; F.frame(0.5);
  ok(!k.hunting && k.miss === 1 && k.waitUntil === undefined, '天数和游玩时间都到了：离开，算一次扑空');
  // 8) 出村预警
  k.hunting = true; k.heat = 80; (F as any).hotT = 0; (F as any).t = 0; F.frame(0.5);
  (g.ws.flags as any).feudWarnDay = -99;
  g.player.x = town.x * W.WORLD_SCALE + 9000; g.player.y = town.y * W.WORLD_SCALE;
  if (g.terrain.inLocZone(g.player.x, g.player.y, 600)) g.player.y += 6000;
  const log0 = R.S.log.length; (F as any).t = 0; F.frame(0.5);
  const w = (g.ws.flags as any).feudWarn;
  ok(w && w.id === k.id && R.S.log.slice(log0).some((l: any) => /里外/.test(l.text)), `出村预警：${R.S.log.slice(log0).map((l: any) => l.text).join(' | ')}`);
  R.S.story.liusanniang = { warn: true }; (g.ws.flags as any).feudWarnDay = -99; (F as any).inZone = true; (F as any).t = 0; F.frame(0.5);
  ok(/柳三娘/.test(R.S.log[R.S.log.length - 1].text) && R.S.log[R.S.log.length - 1].text.includes(k.name), '柳三娘的密信点名谁在等你');
  k.hunting = false; k.grudge = 0; k.heat = 0;
  g.player.x = WILD.x; g.player.y = WILD.y;
}

// 9) 战书不去不会升成血仇
{
  const k: any = anyone(); k.grudge = 1; k.why = '旧怨';
  const rep0 = g.ws.rep;
  (g.war as any).expire({ id: 999, kind: '战书', from: k.name, fromId: k.id, text: '', until: g.day, done: false });
  ok(k.grudge === 1 && g.ws.rep === rep0 - 2, `战书不去：仍是旧怨（仇 ${k.grudge}），声望 -2`);
  k.grudge = 0;
}

// 10) 存读档后热度不丢（名册里的门人也是）
{
  const k: any = anyone(); k.grudge = 2; k.heat = 66; k.feudBy = 'hero'; k.miss = 1; F.see(k);
  const ros = g.roster.pick(N.list.find((d: any) => d.ros)?.ros ?? 'huangfeng', 1, 1, 9, { skipTop: true })[0] as any;
  if (ros) { ros.heat = 40; ros.met = false; ros.grudge = 0; ros.robCd = g.day + 30; }
  ok(!ros || Roster.notable(ros), '名册门人有热度 / 劫道冷却：算值得存档');
  (N.list.find((d: any) => d.hate?.length) as any)?.hate.push({ id: 'hero', v: 50, why: '旧档', day: 1 });
  ok(g.save(3), '存档');
  ok(g.load('taixu_save_3'), '读档');
  const k2: any = g.npcs.byId.get(k.id), r2: any = ros ? g.npcs.byId.get(ros.id) : null;
  ok(k2 && k2.heat === 66 && k2.feudBy === 'hero' && k2.miss === 1 && k2.seen?.look, '读档后热度、先手、扑空、最后见到你都在');
  ok(!ros || (r2 && r2.heat === 40 && r2.robCd > g.day), '名册门人的热度、冷却也在');
  ok(!g.npcs.list.some((d: any) => d.hate?.some((x: any) => x.id === 'hero')), "旧档 hate 里的 'hero' 读成 'me'");
  const rb: any = g.npcs.byId.get((globalThis as any).__robber);
  ok(F0.playOf(g) > 0 && rb && rb.robP > F0.playOf(g) && F0.robGuard(g, rb), `游玩时间随存档（${Math.round(F0.playOf(g))} 秒），读档后劫道冷却照旧（还剩 ${Math.round((rb?.robP - F0.playOf(g)) / 60)} 分钟）`);
}
const R2 = g.rel, N2 = g.npcs, F2 = R2.feud;
g.player.x = WILD.x; g.player.y = WILD.y; g.day = Math.max(g.day, 500); h.realm = 2; h.stage = 0;

// 11) 组队：带着队友劫修更少来；队友作证算自卫（他理亏）；队友杀的人记在队友头上
{
  const fresh2 = (pred: (d: any) => boolean) => N2.list.find((d: any) => d.alive && !d.canon && !d.beauty && !d.stay && !d.bond && !d.ros && !d.gz && (d.map ?? 'tiannan') === W.ACTIVE_MAP && !(d.grudge > 0) && !F0.robGuard(g, d) && pred(d))!;
  const rob: any = fresh2((x) => x.realm === 2 && x.stage >= 1 && (x.pers === 'greedy' || x.pers === 'ruthless') && x.faction === 'rogue');
  const ra: any = N2.summon(rob.id); ra.act = 'idle';
  const trial = () => { let n = 0; for (let i = 0; i < 60; i++) { ra.act = 'idle'; ra.noticed = 2; ra.enemy = undefined; rob.robCd = undefined; rob.robP = undefined; near(ra, 400); (N2 as any).senseCheck(); if (ra.act === 'approach') n++; } return n; };
  const solo = trial();
  const m1 = fresh2((x) => x.realm >= 2 && x !== rob), mates = [m1, fresh2((x) => x.realm >= 2 && x !== rob && x !== m1)].filter(Boolean);
  for (const m of mates) { m.bond = 'companion'; m.bondUntil = g.day + 30; N2.summon(m.id); }
  const team = trial();
  ok(team < solo * 0.5, `带着 ${mates.length} 名队友：劫修扑上来的次数 ${solo} → ${team}`);
  ok(F2.witnessesFor(ra) >= mates.length, `队友是证人（${F2.witnessesFor(ra)} 人）`);
  N2.dismiss(rob.id);
  // 队友作证：拦路的被你反杀，亲族不来讨说法
  const v: any = withKin((x) => !(x.robCd > g.day));
  F0.markAssail(v, 'npc', g.day, F2.mates().length);
  const kin = kinOf(v); R2.onPlayerKill(v, F2.selfDef(v)); N2.die(v, '死于苏寒之手');
  ok(kin.every((o: any) => !(o.grudge > 0)), '队友作证：他劫你在先，亲族自知理亏');
  // 队友杀的人记在队友头上
  const v2: any = withKin((x) => !(x.robCd > g.day) && !x.bond);
  const va: any = N2.summon(v2.id); va.act = 'idle'; near(va, 500);
  const e = N2.toEnemy(va, true); (e as any).lastBy = mates[0].id;
  const kin2 = kinOf(v2);
  N2.onEnemyKilled(e);
  ok(!v2.alive && v2.kb === mates[0].id && kin2.every((o: any) => !(o.grudge > 0) && o.hate?.some((x: any) => x.id === mates[0].id)), `队友${mates[0].name}杀的${v2.name}：亲族记恨的是队友，不是你`);
  for (const m of mates) { m.bond = undefined; N2.dismiss(m.id); }
}

// 12) 宗门：附近被以大欺小有人来救；远处被追杀发警告帖
{
  const sect = W.LOC_BY_ID.get('huangfeng')!;
  g.ws.sect = { id: 'huangfeng', rank: 0, contrib: 50, joined: g.day, lastPay: g.day, tasks: [], done: 0 } as any;
  h.realm = 1; h.stage = 5;
  g.player.x = sect.x * W.WORLD_SCALE + 6000; g.player.y = sect.y * W.WORLD_SCALE + 2000;
  const foe: any = N2.list.find((d: any) => d.alive && d.realm >= 3 && !d.canon && !d.beauty && d.sect !== 'huangfeng' && !d.bond)!;
  foe.grudge = 2; foe.heat = 80; foe.feudBy = 'hero'; foe.why = '测试';
  g.pursuit.reset(); g.pursuit.cd = 0;
  ok(g.pursuit.start({ reason: 't', npc: foe, story: true }), '结丹仇人追来（测试用剧情放行）');
  (F2 as any).helpT = -1e9; F2.sectRescue();
  const nHelp = N2.list.filter((d: any) => d.alive && d.sect === 'huangfeng' && (d.helpUntil ?? 0) > g.time).length; F2.sectRescue();
  ok(N2.list.filter((d: any) => d.alive && d.sect === 'huangfeng' && (d.helpUntil ?? 0) > g.time).length === nHelp, '救援有冷却：不会接连来好几位');
  const help = N2.list.find((d: any) => d.alive && d.sect === 'huangfeng' && (d.helpUntil ?? 0) > g.time);
  ok(!!help && help.realm >= foe.realm, `宗门附近：${help?.name}（${help?.realm}）赶来相护`);
  g.pursuit.reset();
  const h0 = foe.heat; foe.warned = undefined;
  ok(F2.sectWarn(foe) && foe.heat <= h0 - 40 && foe.warned !== undefined, `远处：宗门送警告帖，热度 ${h0} → ${foe.heat}`);
  ok(F2.sectWarn(foe) && F2.sectFoeOf(foe) === 'huangfeng', '不听警告：列为宗门仇敌');
  foe.grudge = 0; foe.heat = 0;
}

// 13) 「缉凶」宗门任务能接、能交
{
  const s: any = g.ws.sect;
  g.player.x = W.LOC_BY_ID.get('huangfeng')!.x * W.WORLD_SCALE; g.player.y = W.LOC_BY_ID.get('huangfeng')!.y * W.WORLD_SCALE;
  h.realm = 2;
  g.towns.refreshTasks();
  const t = s.tasks.find((x: any) => x.kind === 'catch');
  ok(!!t, `宗门任务里有缉凶：${t?.text}`);
  if (t) {
    const d: any = N2.byId.get(t.target);
    ok(g.towns.taskProgress(t) === 0 && !!g.towns.taskWhere(t).spot, `指路：${g.towns.taskWhere(t).spot}`);
    ok(F2.selfDef(d), '奉命缉凶：拿下他不算你先手');
    N2.die(d, '伏诛');
    const c0 = s.contrib; g.towns.turnIn(t);
    ok(s.contrib > c0 && !s.tasks.includes(t), `交差：贡献 ${c0} → ${s.contrib}`);
  }
}

// ================================================================ 第二批（world/enyuan.ts）
const E = g.enyuan, R3 = g.rel, N3 = g.npcs, F3 = R3.feud;
const hh = g.hero;   // 读档后 g.hero 换了一个对象：这一节用新的
const fresh3 = (pred: (d: any) => boolean) => N3.list.find((d: any) => d.alive && !d.canon && !d.beauty && !d.stay && !d.bond && !d.ros && !d.gz && (d.map ?? 'tiannan') === W.ACTIVE_MAP && !(d.grudge > 0) && !d.wanted && pred(d))!;
const near3 = (a: any, dx = 300) => { a.st.x = a.d.x = g.player.x + dx; a.st.y = a.d.y = g.player.y; };
g.player.x = WILD.x; g.player.y = WILD.y; hh.realm = 2; hh.stage = 3; g.pursuit.reset();
C.addItem(hh, 'mat_lingshi', 5000);
const feudOf = (d: any, g2 = 2) => { d.grudge = g2; d.heat = 80; d.feudBy = 'hero'; d.why = '测试结仇'; d.met = true; return d; };
const bandit = (dx: number) => { const e: any = new Enemy(ENEMIES.bandit, g.player.x + dx, g.player.y, 1, 1); e.aggro = true; g.combat.enemies.push(e); return e; };
const drop = (e: any) => { const i = g.combat.enemies.indexOf(e); if (i >= 0) g.combat.enemies.splice(i, 1); };
/** 前面几节留下的、还在打你的敌人（盘查翻脸、救援时招来的）清掉，免得算成「正在交战」 */
const calm = () => { const left = g.combat.enemies.filter((e: any) => !e.dead && e.aggro); console.log('     （清掉残留的交战对象', left.map((e: any) => e.name).join('、') || '无', '）'); for (const e of left) drop(e); };

// 14) 宗门出面化解死仇：贡献够、长老压得住才成
{
  const s: any = g.ws.sect; s.contrib = 2000;
  const el = E.sectElder();
  ok(!!el && el.realm >= 3, `能请出面的长辈：${el?.name}（${el?.realm}）`);
  const low: any = feudOf(fresh3((x) => x.realm === 2 && x.sect !== 'huangfeng'));
  const c0 = s.contrib, r1 = E.sectMediate(low);
  ok(r1.ok && low.grudge === 1 && low.heat <= 8 && !low.hunting && s.contrib === c0 - EY.mediateCost(low), `长老压得住：${low.name}死仇降为旧怨（热 ${low.heat}，贡献 ${c0} → ${s.contrib}）`);
  const big: any = feudOf(fresh3((x) => x.realm >= (el?.realm ?? 9) && x.sect !== 'huangfeng'));
  if (big) { const r2 = E.sectMediate(big); ok(!r2.ok && big.grudge === 2 && /压不住/.test(r2.why), `长老压不住：${r2.why}`); }
  s.contrib = 10; const mid: any = feudOf(fresh3((x) => x.realm === 1));
  const r3 = E.sectMediate(mid); ok(!r3.ok && /贡献不足/.test(r3.why) && mid.grudge === 2, '贡献不够：请不动');
  s.contrib = 2000;
  const hl = W.LOC_BY_ID.get('huangfeng')!;
  ok(E.townFacs(hl).some((f) => f.name === '请长老调停') && E.sectHallNode(hl).options.length >= 2, '宗门里能请长老调停');
  for (const x of [low, big, mid]) if (x) { x.grudge = 0; x.heat = 0; }
}

// 15) 化解恩怨：恩怨页的六种办法都在、能点
{
  const d: any = feudOf(fresh3((x) => x.realm === 2 && (x.ties ?? []).some((t: any) => N3.byId.get(t.id)?.alive)));
  d.lost = { stones: 40 };
  const t0 = d.ties.find((t: any) => N3.byId.get(t.id)?.alive); const fr: any = N3.byId.get(t0.id); fr.met = true; fr.favor = 70; if (!['friend', 'kin', 'sworn', 'master', 'disciple'].includes(t0.k)) t0.k = 'friend';
  R3.S.mediateCd = 0;
  const node = E.reconcileNode(d, undefined, () => 0);
  const labels = node.options.map((o: any) => o.label).join(' / ');
  ok(['赔礼', '退还夺来的东西', '说和', '宗门长辈', '心魔', '生死斗'].every((k) => labels.includes(k)), `化解办法：${labels}`);
  node.options.find((o: any) => /退还/.test(o.label))!.act!();
  ok(d.grudge === 1 && !d.lost, '退还夺来的东西：血仇降为旧怨');
  d.recP = 0;
  E.reconcileNode(d, undefined, () => 0).options.find((o: any) => /心魔/.test(o.label))!.act!();
  ok(d.grudge === 0 && d.oath && d.heat === 0, '立心魔誓：恩怨了结');
  // 买命钱会记下「夺来的东西」
  const v: any = fresh3((x) => x.realm === 1); v.wealth = 100; F0.markAssail(v, 'npc', g.day);
  const rel0 = (g.combat as any).release; (g.combat as any).release = () => {};
  R3.yieldNode(v, { npcId: v.id } as any, null, null).options.find((o: any) => /买命钱/.test(o.label))!.act!();
  (g.combat as any).release = rel0;
  ok(v.lost && v.lost.stones > 0, `索要买命钱后记下夺来的 ${v.lost?.stones} 灵石（化解时可退还）`);
  // 对峙时多出退还 / 宗门长辈 / 生死斗
  const k2: any = feudOf(fresh3((x) => x.realm === 2)); k2.lost = { stones: 10 };
  const pn = R3.parleyNode(k2, null, () => {}, () => {});
  ok(['退还', '宗门长辈', '生死斗'].every((k) => pn.options.some((o: any) => o.label.includes(k))), '对峙对话里也能退还、请长辈、约生死斗');
  k2.grudge = 0; k2.heat = 0;
}

// 16) 生死斗：赢了恩怨两清；输了赔三成灵石、仇降为旧怨
{
  const d: any = feudOf(fresh3((x) => x.realm === 2));
  ok(E.startDuel(d) && !!E.S.duel, '约下生死斗：擂台画在地上');
  const e: any = g.combat.enemies.find((x: any) => x.tag === 'eyduel:' + d.id);
  ok(!!e && e.spar, '对手是真人化成的敌人（点到为止，不出人命）');
  ok(E.marks().some((m) => m.glyph === '斗'), '地图上标出生死斗');
  ok(E.onSpar(e, true) && d.grudge === 0 && d.heat === 0 && !E.S.duel && d.duelDone !== undefined, '赢了：恩怨两清');
  drop(e);
  const d2: any = feudOf(fresh3((x) => x.realm === 2 && x !== d));
  E.startDuel(d2); const e2: any = g.combat.enemies.find((x: any) => x.tag === 'eyduel:' + d2.id);
  const st0 = C.bagCount(hh, 'mat_lingshi'); E.onSpar(e2, false);
  ok(d2.grudge === 1 && d2.heat === 0 && C.bagCount(hh, 'mat_lingshi') === st0 - Math.round(st0 * 0.3), `输了：赔三成灵石（${st0 - C.bagCount(hh, 'mat_lingshi')}），他出了气，仇降为旧怨`);
  drop(e2); d2.grudge = 0;
  for (const x of [d, d2]) N3.dismiss(x.id);
  C.addItem(hh, 'mat_lingshi', 3000);
}

// 17) 宗门之间的关系：同盟帮你、敌对挑衅盘查、开战按身份动手
{
  ok(EY.stanceOf('huangfeng', 'yanyue') === 'ally' && EY.stanceOf('huangfeng', 'guiling') === 'foe' && EY.stanceOf('huangfeng', 'mulan') === 'foe' && EY.stanceOf('leikong', 'jiyin') === 'ally', '宗门立场：梁国七派同盟、正魔对立、朔漠对南荒');
  const ally: any = fresh3((x) => x.sect === 'yanyue' && x.realm >= 1 && !(g.npcs as any).active.get(x.id)?.enemy) ?? g.roster.pick('yanyue', 1, 1, 4, { skipTop: true })[0];   // 名册里一时没有，就从宗门名册点一个
  const foe: any = fresh3((x) => SECT_DEMON(x.sect) && x.realm >= 2) ?? g.roster.pick('guiling', 1, 2, 4, { skipTop: true })[0];
  ok(E.dipLevel(ally).st === 'ally' && E.dipLevel(foe).st === 'foe' && E.dipLevel(foe).lv === 2, `敌对宗门（${foe.sect}）的弟子：盘查级`);
  const aa: any = N3.summon(ally.id); aa.act = 'idle'; near3(aa, 500);
  const mob = bandit(200);
  (E as any).helpP = -1e9; (E as any).dipT = 0; (E as any).t = 0; g.modal = null; E.frame(0.5);
  ok((ally.helpUntil ?? 0) > g.time, `同盟${ally.name}路过出手相助`);
  drop(mob); ally.helpUntil = undefined; N3.dismiss(ally.id);
  const fa: any = N3.summon(foe.id); fa.act = 'idle'; near3(fa, 400);
  const insp = E.dipInspectNode(fa, () => 0.99);
  ok(insp.options.length === 4 && /身份/.test(insp.options[0].label), `盘查对话：${insp.options.map((o: any) => o.label).join(' / ')}`);
  insp.options.find((o: any) => /不理/.test(o.label))!.act!();
  ok(!!fa.enemy && F0.npcStarted(foe, g.day), '不理他、他动手：先手记在他身上');
  if (fa.enemy) { drop(fa.enemy); fa.enemy = undefined; } N3.dismiss(foe.id);
  // 宗门开战：你是南荒这边的弟子，朔漠的人路上见了你直接动手
  const ws: any = g.war.st('mulan'); const ph0 = ws.phase; ws.phase = 'battle';
  const ml: any = fresh3((x) => (x.sect === 'mulan' || x.sect === 'tianlan') && x.realm >= 1) ?? g.roster.pick('mulan', 1, 1, 5, { skipTop: true })[0];
  if (ml) {
    const L = E.dipLevel(ml);
    ok(L.st === 'foe' && L.lv === 3 && L.war === '朔漠之战', '朔漠之战开打：朔漠的人对你是「动手」级');
    ml.map = W.ACTIVE_MAP; ml.grudge = 0; const ma: any = N3.summon(ml.id); ma.act = 'idle'; near3(ma, 600); ml.dipP = 0;
    (E as any).dipT = 0; (E as any).t = 0; g.modal = null; calm();
    const others = [...(N3 as any).active.values()].filter((o: any) => o.d !== ml); for (const o of others) o.d.dipP = 1e12;   // 只看他一个（一次只出一件事）
    E.frame(0.5); for (const o of others) o.d.dipP = undefined;
    ok(!!ma.enemy && F0.npcStarted(ml, g.day), '他扑上来，先手记在他身上');
    if (ma.enemy) { drop(ma.enemy); ma.enemy = undefined; } N3.dismiss(ml.id);
  } else ok(false, '名册里没有朔漠的人');
  ws.phase = ph0;
}

// 18) 队伍指令：掩护、包抄、护着我撤、别杀他；队友的底线
{
  calm();
  const m: any = fresh3((x) => x.realm >= 2 && x.pers === 'righteous'); m.bond = 'companion'; m.bondUntil = g.day + 30;
  const ma: any = N3.summon(m.id);
  const foeE = bandit(600); g.combat.lock = foeE;
  ok(g.combat.inCombat && E.squadKey() && E.menuOpen, '交战时按打坐键：开队伍指令菜单');
  E.squadKey(); ok(!E.menuOpen, '再按一次：收起');
  for (const o of ['cover', 'flank', 'escort', 'spare'] as const) { g.party.order(m.id, o); ok(m.order === o, `下令「${ORDER_NAME[o]}」`); }
  const pc = E.squadPos(ma, 'cover')!;
  ok(!!pc && pc.x > g.player.x && pc.x < foeE.x, `掩护：站在你和来敌之间（离你 ${Math.round(pc.x - g.player.x)}）`);
  const pf = E.squadPos(ma, 'flank')!; ok(!!pf && pf.x > foeE.x, '包抄：绕到锁定目标背后');
  const pe = E.squadPos(ma, 'escort')!; ok(!!pe && Math.hypot(pe.x - g.player.x, pe.y - g.player.y) < 260, '护着我撤：贴着你断后');
  ok(E.squadDmg('flank') > 1, '包抄伤害高些');
  g.party.order(m.id, 'spare');
  ok(m.spareId === String(foeE.id) && E.squadTarget(ma, 'spare', foeE) === foeE, '别杀他：记下锁定的那个人；他气血还多时照打');
  foeE.hp = foeE.maxHp * 0.2; ok(E.squadTarget(ma, 'spare', foeE) === null, '别杀他：只剩他、气血见底就停手');
  drop(foeE); g.combat.lock = null;
  const mortal: any = N3.list.find((d: any) => d.alive && d.realm === 0 && d.faction === 'mortal' && !d.canon);
  R3.onPlayerKill(mortal, false); N3.die(mortal, '死于苏寒之手');
  ok(m.sqW === 1 && m.bond === 'companion', `${m.name}（正直）劝你：下手太狠`);
  const y: any = fresh3((x) => x.realm === 1); E.onRuthless(y); R3.onPlayerKill(y, true); N3.die(y, '死于苏寒之手');
  ok(!m.bond && !N3.followers().some((a: any) => a.d === m), `再犯：${m.name}离队`);
}

// 19) 报官反悬赏：被劫 → 报案 → 上悬赏榜 → 执法弟子拿人 → 收到消息和补偿
{
  const rob: any = fresh3((x) => x.realm === 2 && x.faction === 'rogue');
  E.onRobbed(rob, 120);
  ok(E.reportable().some((r) => r.npcId === rob.id), '被劫后记下劫案，回城可报');
  const town = W.LOC_BY_ID.get('huangfeng')!;
  ok(E.reportNode(town).options.some((o: any) => o.label.includes(rob.name)), '宗门执法堂的报案对话里列着他');
  const rep = E.report(E.reportable().find((r) => r.npcId === rob.id)!, town)!;
  ok(!!rep && rep.status === 'open' && rob.wanted === rep.id, `报案：${rep.name}上了通缉（赏 ${rep.reward}）`);
  ok(g.happen.boardNode('qingniu', '白石镇').options.some((o: any) => /【通缉】/.test(o.label) && o.label.includes(rob.name)), '悬赏榜上列出通缉');
  ok(E.marks().some((m) => m.glyph === '缉'), '地图上标出通缉犯的大致方位');
  g.day = rep.dueDay + 1; E.daily(1);
  ok(rep.status === 'open', `日子到了、游玩时间没到（还差 ${Math.round((rep.dueP - F0.playOf(g)) / 60)} 分钟）：还没结果`);
  g.ws.play = rep.dueP + 1; const st0 = C.bagCount(hh, 'mat_lingshi'); const rnd0 = Math.random; Math.random = () => 0; E.daily(1); Math.random = rnd0;
  ok(rep.status === 'caught' && !rob.alive && C.bagCount(hh, 'mat_lingshi') > st0, `执法弟子拿住了${rob.name}：${rep.by}，补偿 ${rep.comp} 灵石`);
  ok(E.feed().some((r) => /拿住了劫匪/.test(r.text)), '江湖传音里传开');
  const rob2: any = fresh3((x) => x.realm === 2 && x.faction === 'rogue'); E.onRobbed(rob2, 50); const rep2 = E.report(E.reportable().find((r) => r.npcId === rob2.id)!, town)!;
  const s1 = C.bagCount(hh, 'mat_lingshi'); R3.onPlayerKill(rob2, true); N3.die(rob2, '死于苏寒之手');
  ok(rep2.status === 'caught' && C.bagCount(hh, 'mat_lingshi') === s1 + rep2.reward, `亲手拿下通缉犯：赏 ${rep2.reward}`);
}

// 20) 各地口碑：一城一本账、折扣、顺着商路传到邻城、随时间淡去；好口碑躲追兵，坏口碑被盘查
{
  const qn = W.LOC_BY_ID.get('qingniu')!;
  const tw = g.combat.wreck.town.state(qn.id, true)!; tw.good = 0;
  E.kbAdd(qn.id, 50, '测试');
  ok(E.kb(qn.id) === 50 && E.priceMul(qn.id) === 0.9 && E.kbLine(qn.id).tier === '口碑好', `口碑好：铺子九折（${E.kbLine(qn.id).text}）`);
  const nb = E.neighbors(qn.id);
  ok(nb.length > 0 && (E.S.kbQ ?? []).some((q) => q.to === nb[0].id), `顺着商路往邻城传：${nb.map((l) => l.name).join('、')}`);
  g.day += EY.KB.spreadDays + 1; g.ws.play = F0.playOf(g) + EY.KB.spreadPlay + 1; E.daily(1);
  ok(E.kb(nb[0].id) >= 19, `${nb[0].name}也听说了（+${Math.round(E.kb(nb[0].id))}）`);
  E.kbFade(10); ok(Math.abs(E.kb(qn.id) - 40) < 0.01, '十分钟游玩：淡去十点');
  g.player.x = qn.x * W.WORLD_SCALE; g.player.y = qn.y * W.WORLD_SCALE;
  ok(E.townHere()?.id === qn.id, '人在白石镇');
  E.kbAdd(qn.id, 20, '测试', false);
  const hunter: any = feudOf(fresh3((x) => x.realm === 2)); hunter.map = W.ACTIVE_MAP; hunter.hunting = true; hunter.heat = 80; F3.see(hunter);
  ok(E.inDanger(), '有人在找你');
  g.modal = null; (E as any).hideAskP = -1e9; (E as any).kbTownT = 0; (E as any).dipT = 99; (E as any).t = 0; E.frame(0.5);
  ok((g.modal as any)?.kind === 'dialog' && /进屋躲躲/.test((g.modal as any).node.title), '百姓招呼：「仙师进屋躲躲」');
  if ((g.modal as any)?.node) (g.modal as any).node.options[0].act(); g.modal = null;
  ok(!hunter.hunting && F0.marksOf(hunter.heat) < F0.marksOf(80) && !F3.recognizes(hunter) && g.concealed, `躲进屋：热度降一档（80 → ${hunter.heat}），追兵丢了目标`);
  g.ws.play = F0.playOf(g) + EY.KB.hideFor + 1; (E as any).t = 0; (E as any).kbTownT = 99; E.frame(0.5); g.concealed = false; hunter.grudge = 0; hunter.heat = 0;
  tw.good = -60; (E as any).kbInspP = {}; (E as any).lastTown = qn.id; (E as any).kbTownT = 0; (E as any).t = 0; g.modal = null; E.frame(0.5);
  ok((g.modal as any)?.kind === 'dialog' && /城卫/.test((g.modal as any).node.speaker) && E.priceMul(qn.id) === 1.2, '坏口碑：守卫盘查，铺子加价');
  if ((g.modal as any)?.node) (g.modal as any).node.options[0].act(); g.modal = null;
  ok(E.kb(qn.id) > -60, `认罚：口碑回升到 ${Math.round(E.kb(qn.id))}`);
  g.player.x = WILD.x; g.player.y = WILD.y;
}

// 21) 江湖传音：闲讯收进来不再弹，你做的事传开、被议论；支线从这里接；只裁传音自己
{
  g.toasts = []; g.toastQueue = []; const n0 = E.unread();
  g.toast('神识中：东边宝光一闪，两伙修士打了起来！', 'info');
  ok(!g.toasts.some((t: any) => t.text.startsWith('神识中')) && E.unread() === n0 + 1 && !!E.feed()[0].amb, '「神识中…」不再弹出，收进江湖传音');
  g.toast('江湖传闻：赤霄禁地将于第3年开启', 'info');
  ok(E.feed()[0].text.startsWith('江湖传闻') && !g.toasts.some((t: any) => t.text.startsWith('江湖传闻')), '「江湖传闻…」也收进来');
  g.toast('神识中：有人朝你冲过来了！', 'warn');
  ok(!E.feed()[0].text.includes('冲过来'), '冲着你来的紧要消息照弹');
  g.news('苏寒斩了劫匪某某，替过路商队解了围。', 'personal');
  ok(E.feed()[0].text.includes('苏寒斩了') && (E.feed()[0].talk?.length ?? 0) > 0, `你做的事传开、被议论：${E.feed()[0].talk?.[0]}`);
  g.war.send({ kind: '求助', from: '某修士', text: '道友救我！', until: g.day + 10 } as any, true); (E as any).t = 0; E.frame(0.5);
  const jr = E.feed().find((r) => r.hook?.k === 'jade');
  ok(!!jr && E.hookLabel(jr) === '看玉符', '求助玉符：传音里能接');
  E.S.hookDay = 0; E.S.hookP = 0; E.S.hookK = 1; E.daily(1);
  ok(E.feed().some((r) => r.hook?.k === 'bounty'), '悬赏：传音里能接');
  E.readAll(); ok(E.unread() === 0, '看过后未读清零');
  const R0 = g.ws.rumors!; R0.push({ id: 1, day: 1, text: '藏宝', truth: 1, src: 'book', srcName: '说书', motive: 'honest', kind: 'treasure', until: g.day + 99 } as any);
  for (let i = 0; i < 120; i++) E.news('测试消息' + i);
  ok(R0.filter((r) => r.kind === 'news').length <= 80 && R0.some((r) => r.kind === 'treasure' && r.text === '藏宝'), '传音最多留 80 条，不挤掉藏宝传闻');
  ok(!g.jianghu.activeRumors().some((r) => r.kind === 'news'), '传音不当可打听的传闻');
}

// 22) 存读档：报案、口碑、NPC 身上的新字段都在
{
  const d: any = fresh3((x) => x.realm === 1); d.lost = { stones: 33 }; d.met = false;
  ok(Roster.notable(d), '有「夺来的东西」的人算值得存档');
  const nRep = E.S.reports.length, kb0 = Math.round(E.kb('qingniu'));
  ok(g.save(3) && g.load('taixu_save_3'), '存档、读档');
  const d2: any = g.npcs.byId.get(d.id);
  ok(d2?.lost?.stones === 33 && g.enyuan.S.reports.length === nRep && Math.round(g.enyuan.kb('qingniu')) === kb0 && g.enyuan.feed().length > 0, '读档后：夺来的东西、通缉、口碑、传音都在');
}

// ================================================================ 第三批（world/zhifa.ts、laifang.ts、dazi.ts、duobao.ts）
const N4 = g.npcs, R4 = g.rel, E4 = g.enyuan, h4 = g.hero;   // 读档后 g.hero 换了对象：重新取
const fresh4 = (pred: (d: any) => boolean) => N4.list.find((d: any) => d.alive && !d.canon && !d.beauty && !d.stay && !d.bond && !d.ros && !d.gz && !d.orig && !d.mod && !d.hidden && (d.map ?? 'tiannan') === W.ACTIVE_MAP && !(d.grudge > 0) && d.wanted === undefined && !d.zf && d.db === undefined && !d.dazi && !N4.activeOf(d.id) && pred(d))!;
const act4 = () => (N4 as any).refreshActive();
const modalNode = () => (g.modal as any)?.node ?? (g.modal as any)?.dialog ?? g.modal;
g.player.x = WILD.x; g.player.y = WILD.y; h4.realm = 2; h4.stage = 3; g.pursuit.reset(); g.modal = null;
C.addItem(h4, 'mat_lingshi', 5000);
for (const e of g.combat.enemies.filter((e: any) => !e.dead && e.aggro)) { const i = g.combat.enemies.indexOf(e); g.combat.enemies.splice(i, 1); }

// 23) NPC 执法：NPC 之间的劫道被看见、被报案、上通缉榜；执法弟子真的出发去抓人，画面外赶路、当面斗法、结果进江湖传音
{
  const Z = g.zhifa;
  const bad: any = fresh4((x) => x.realm === 2 && x.faction === 'rogue'), vic: any = fresh4((x) => x.realm === 1 && x !== bad && x.faction !== 'mortal');
  bad.x = g.player.x + 40000; bad.y = g.player.y; vic.x = bad.x + 100; vic.y = bad.y;
  Z.S.nextDay = 0; Z.S.nextP = 0; Z.S.q = [];
  const r0 = Math.random; let used = 0; Math.random = () => { used++; return r0(); };
  Z.note(bad, vic, 'rob', g.day, 40, '青石岭', true);
  ok(Z.S.q.length === 1 && used === 0, '日结路径上只记一笔案底，不取 Math.random');
  Z.daily();
  Math.random = r0;
  const rep: any = E4.S.reports.find((r: any) => r.npcId === bad.id);
  ok(!!rep && rep.npc?.victim === vic.name && rep.status === 'open' && bad.wanted === rep.id, `当着你的面的劫道必有人报：${rep?.whereName}贴出通缉（${rep?.npc?.crime}）`);
  ok(used === 0, `报案、派人都不动 Math.random（${used}）`);
  ok(g.happen.boardNode('qingniu', '白石镇').options.some((o: any) => o.label.includes(bad.name) && o.label.includes('劫掠')), '悬赏榜上列出 NPC 之间的通缉');
  const c: any = Z.S.cases.find((x: any) => x.rep === rep.id), law: any = c && N4.byId.get(c.law);
  ok(!!law && law.zf?.tgt === bad.id && !!rep.lawName, `派出${rep?.lawName}（${law ? W.ACTIVE_MAP && law.realm : ''}）去拿人`);
  ok(E4.feed().some((r: any) => r.text.includes(law?.name) && r.text.includes('动身去拿')), '江湖传音：执法弟子动身');
  ok(E4.marks().some((m: any) => m.glyph === '执'), '地图上标出执法弟子');
  // 画面外：照直线赶路
  const d0 = Math.hypot(law.x - bad.x, law.y - bad.y);
  (Z as any).t = 0; for (let i = 0; i < 6; i++) { (Z as any).t = 0; Z.frame(0.5); }
  const d1 = Math.hypot(law.x - bad.x, law.y - bad.y);
  ok(d1 < d0 - 1000 || rep.status !== 'open', `画面外照直线追：${Math.round(d0)} → ${Math.round(d1)}`);
  for (let i = 0; i < 400 && rep.status === 'open' && rep.tries === 0; i++) { (Z as any).t = 0; Z.frame(0.5); }
  ok(rep.status !== 'open' || rep.tries > 0, `追上了，在后台按实力结算：${rep.status}${rep.tries ? '（第一回没拿住，又派了人）' : ''}`);
  // 当着你的面：两人都进了神识，追上了就斗法；执法的赢了押走归案
  const bad2: any = fresh4((x) => x.realm === 1 && x.faction === 'rogue'), vic2: any = fresh4((x) => x.realm === 1 && x !== bad2 && x.faction !== 'mortal');
  bad2.x = g.player.x + 600; bad2.y = g.player.y; vic2.x = bad2.x; vic2.y = bad2.y;
  Z.S.nextDay = 0; Z.S.nextP = 0; Z.note(bad2, vic2, 'kill', g.day, 30, '路边', true); Z.daily();
  const rep2: any = E4.S.reports.find((r: any) => r.npcId === bad2.id);
  const law2: any = rep2 && N4.byId.get(rep2.law);
  ok(!!law2, `第二桩：${rep2?.npc?.crime}，派出${rep2?.lawName}`);
  law2.x = bad2.x + 1500; law2.y = bad2.y; act4();
  const aL: any = N4.activeOf(law2.id), aC: any = N4.activeOf(bad2.id);
  ok(!!aL && !!aC, '两人都进了你的神识');
  if (aL) { aL.act = 'idle'; aL.enemy = undefined; } if (aC) { aC.act = 'idle'; aC.enemy = undefined; }
  (Z as any).t = 0; Z.frame(0.5);
  ok(aL.act === 'walk' && law2.tx === bad2.x && !!bad2.zfRun, '执法弟子朝他追过去，通缉犯见了往远处逃');
  ok(E4.S.reports.includes(rep2) && g.zhifa.chasingNow(rep2), '当面追着的，后台不结算');
  aL.st.x = law2.x = bad2.x + 300; aL.st.y = law2.y = bad2.y; aC.st.x = bad2.x; aC.st.y = bad2.y;
  (Z as any).t = 0; Z.frame(0.5);
  ok(!!aL.duel && aL.duel.foe === aC && aC.act === 'duel', '追上了：当场斗法（能插手）');
  (N4 as any).endDuel(aL, aC);
  ok(rep2.status === 'caught' && !bad2.alive && !law2.zf, `执法弟子赢了：${bad2.name}被押走归案`);
  ok(E4.feed().some((r: any) => r.text.includes('在路上追上了') && r.text.includes(bad2.name)), '江湖传音：在路上追上了通缉犯');
  // 你报的案：执法弟子从你报案的地方出发
  const rob3: any = fresh4((x) => x.realm === 2 && x.faction === 'rogue'); E4.onRobbed(rob3, 60);
  const town = W.LOC_BY_ID.get('huangfeng')!;
  g.player.x = town.x * W.WORLD_SCALE; g.player.y = town.y * W.WORLD_SCALE;
  const rep3: any = E4.report(E4.reportable().find((r: any) => r.npcId === rob3.id)!, town);
  const law3: any = rep3?.law && N4.byId.get(rep3.law);
  ok(!!law3 && Math.hypot(law3.x - g.player.x, law3.y - g.player.y) < 400 && N4.activeOf(law3.id)?.bubble, `你报了案：${rep3?.lawName}就在你身边领了通缉令出发`);
  g.player.x = WILD.x; g.player.y = WILD.y;
}

// 24) NPC 主动找你：按心愿来；冷却与上限；走到你身边开口；你不在就留言；回应影响后来（借钱来还、拜师进徒弟、求助报恩）
{
  const L = g.laifang;
  g.modal = null; L.S.cur = null; L.S.recent = []; L.S.nextDay = 0; L.S.nextP = 0;
  g.ws.play = Math.max(F0.playOf(g), 20 * 60);
  ok(L.ready(), '冷却过了、上限没满：可以来');
  // 借钱
  const poor: any = fresh4((x) => x.realm === 1 && x.pers === 'greedy' && x.faction !== 'mortal');
  poor.met = true; poor.favor = 30; poor.wealth = 1; poor.hate = []; poor.plan = undefined; poor.x = g.player.x + 3000; poor.y = g.player.y;
  ok(L.wishes(poor).some(([k]: any) => k === 'loan'), '手头紧的人想借钱');
  L.come(poor, 'loan');
  const ap: any = N4.activeOf(poor.id);
  ok(L.S.cur?.id === poor.id && ap?.act === 'walk' && Math.hypot(ap.st.x - g.player.x, ap.st.y - g.player.y) < 800, '他朝你走过来');
  ap.st.x = g.player.x + 150; ap.st.y = g.player.y; (L as any).t = 0; L.frame(1);
  const n1: any = modalNode();
  ok(!L.S.cur && n1?.speaker === poor.name && n1.options.some((o: any) => /借给他/.test(o.label)), `走到身边开口（对话一 · 借钱）：${n1?.text?.slice(0, 30)}……`);
  const st0 = C.bagCount(h4, 'mat_lingshi');
  n1.options.find((o: any) => /借给他/.test(o.label)).act(); g.modal = null;
  ok(!!poor.loan && C.bagCount(h4, 'mat_lingshi') < st0, `借给他 ${poor.loan?.amt} 灵石`);
  g.day = poor.loan.due + 1; g.ws.play = poor.loan.dueP + 1; poor.favor = 60;
  L.daily();
  ok(L.wishes(poor)[0]?.[0] === 'repay', '到期（天数和游玩时间都到了）：想来还钱');
  const n2: any = L.node(poor, ap, 'repay', null);
  const st1 = C.bagCount(h4, 'mat_lingshi'); n2.options[0].act();
  ok(!poor.loan && C.bagCount(h4, 'mat_lingshi') > st1, `连本带利还了 ${C.bagCount(h4, 'mat_lingshi') - st1} 灵石`);
  // 拜师
  const fan: any = fresh4((x) => x.realm === 1 && (x.pers === 'righteous' || x.pers === 'kind'));
  fan.met = true; fan.favor = 40;
  ok(L.wishes(fan).some(([k]: any) => k === 'apprentice'), '境界低、仰慕你的人想拜师');
  const n3: any = L.node(fan, null, 'apprentice', null);
  ok(n3.options.some((o: any) => /收他为徒/.test(o.label)), `对话二 · 拜师：${n3.text.slice(0, 24)}……`);
  n3.options.find((o: any) => /收他为徒/.test(o.label)).act();
  ok(fan.bond === 'disciple', '收下了：进了徒弟关系');
  // 求助 → 替他除了仇家 → 欠你人情 → 来报恩
  const weak: any = fresh4((x) => x.realm === 1 && x.faction !== 'mortal' && x.pers !== 'ruthless'), foe: any = fresh4((x) => x.realm === 2 && x !== weak);
  weak.met = true; weak.favor = 40; weak.hate = [{ id: foe.id, v: 70, why: `${foe.name}抢了我的灵草` }];
  ok(L.wishes(weak).some(([k]: any) => k === 'help') && L.foeOf(weak) === foe, '心里记着一桩打不过的仇：来求助');
  const n4: any = L.node(weak, null, 'help', null);
  ok(n4.text.includes(foe.name), `对话三 · 求助：${n4.text.slice(0, 30)}……`);
  n4.options[0].act();
  ok(weak.lfHelp === foe.id, '答应替他出头');
  R4.onPlayerKill(foe, true); N4.die(foe, '死于苏寒之手');
  ok(weak.owe === 2 && L.wishes(weak).some(([k]: any) => k === 'repay'), '你替他除了仇家：他欠你一份大人情，日后来报恩');
  // 讨说法（旧怨）
  const gr: any = fresh4((x) => x.realm === 1 && x.pers === 'righteous'); gr.met = true; gr.grudge = 1; gr.heat = 10; gr.why = '当众折辱于他'; gr.feudBy = 'npc';
  const n5: any = L.node(gr, null, 'grievance', null);
  ok(n5.options.some((o: any) => /先动的手/.test(o.label) && !o.disabled), '讨说法：能讲清是他那边先动的手');
  n5.options.find((o: any) => /先动的手/.test(o.label)).act();
  ok(gr.grudge === 0, '讲理的人听进去了：旧怨了结');
  // 上限：30 分钟里最多 3 次；两次之间要隔 25 日 + 5 分钟
  L.S.nextDay = 0; L.S.nextP = 0; const p0 = F0.playOf(g); L.S.recent = [p0 - 60, p0 - 120, p0 - 300];
  ok(!L.ready(), `30 分钟游玩里已来过 ${3} 次：不再来`);
  L.S.recent = [p0 - 31 * 60]; L.S.nextDay = g.day + 3;
  ok(!L.ready(), '日子没到：不来'); L.S.nextDay = 0; L.S.nextP = p0 + 60; ok(!L.ready(), '游玩时间没到：不来');
  L.S.nextP = 0; ok(L.ready(), '都到了：可以来');
  // 同一个人：120 日 + 30 分钟内不再来
  poor.lfP = F0.playOf(g); poor.lfDay = g.day; ok(!(L as any).cooled(poor), '同一个人刚来过：不再来');
  // 你不在：留言进江湖传音
  g.inCave = true; L.S.recent = []; L.S.nextDay = 0; L.S.nextP = 0;
  const cand: any = fresh4((x) => x.realm === 1 && x.faction !== 'mortal' && x.pers !== 'aloof'); cand.met = true; cand.favor = 35; cand.wealth = 1; cand.hate = []; cand.x = g.player.x + 2000; cand.y = g.player.y;
  L.leave(cand, 'loan'); g.inCave = false;
  const msg: any = E4.feed().find((r: any) => r.hook?.k === 'visit');
  ok(!!msg && E4.hookLabel(msg) === '看留言' && E4.hookLive(msg), `留言：${msg?.text}`);
  const mn: any = L.msgNode(Number(msg.hook.ref));
  ok(!!mn && /留言/.test(mn.title), '点开留言：隔空回话');
  mn.options[mn.options.length - 1].act();
  ok(!E4.hookLive(msg), '回过话的留言不再亮「可接」');
}

// 25) 搭档：伴侣、义兄弟、师徒设成固定搭档；跟着你、听指令；底线——劝你、离开你、反目成仇（进恩怨，先手算你）；主动提议
{
  const D = g.dazi;
  g.modal = null;
  const bro: any = fresh4((x) => x.realm === 2 && x.faction !== 'mortal' && x.faction !== 'demon');
  ok(!!D.why(bro), `没有名分的人不能做搭档：${D.why(bro)}`);
  bro.bond = 'sworn'; bro.favor = 80; bro.met = true; bro.pers = 'righteous'; bro.x = g.player.x + 500; bro.y = g.player.y;
  const opt: any = D.talkOpts({ d: bro, look: {} } as any, 't', () => null as any)[0];
  ok(!!opt && /固定搭档/.test(opt.label) && !opt.disabled, `交谈里：${opt?.label}`);
  ok(D.set(bro) && bro.dazi && D.cur() === bro && N4.activeOf(bro.id)?.act === 'follow', '设为固定搭档：跟着你');
  (R4 as any).tick = 0; R4.update(1.1);
  ok(N4.activeOf(bro.id)?.act === 'follow', '一直跟着（不像结伴三十日就走）');
  g.party.order(bro.id, 'cover');
  ok(bro.order === 'cover', '战斗里听第二批的队伍指令');
  ok(g.party.snapshot().some((m: any) => m.id === bro.id && m.dazi), '队伍框上标着「搭」');
  // 底线：正直的人能忍两回
  const inno1: any = fresh4((x) => x.realm === 1 && x.faction !== 'demon');
  E4.onHeroKill(inno1, false);
  ok(bro.dzQ === 1 && !bro.dzW, '无故杀人：记一笔');
  const inno2: any = fresh4((x) => x.realm === 1 && x.faction !== 'demon' && x !== inno1);
  E4.onHeroKill(inno2, false);
  const w: any = modalNode();
  ok(bro.dzW === 1 && bro.dazi && w?.speaker === bro.name && /劝/.test(w.title ?? ''), `忍到头先劝你：${w?.text?.slice(0, 26)}……`);
  w.options[0].act(); g.modal = null;
  const inno3: any = fresh4((x) => x.realm === 1 && x.faction !== 'demon' && x !== inno1 && x !== inno2);
  E4.onHeroKill(inno3, false); E4.onHeroKill(fresh4((x) => x.realm === 1 && x.faction !== 'demon' && x !== inno3), false);
  const lv: any = modalNode();
  ok(!bro.dazi && bro.bond === 'sworn' && bro.dzLeft !== undefined && /离去/.test(lv?.title ?? ''), '再犯：离开你（结义的名分还在）');
  ok(!!D.why(bro) && N4.activeOf(bro.id)?.act !== 'follow', `离开以后一阵子不肯回来：${D.why(bro)}`);
  g.modal = null;
  // 反目：温和的徒弟看你杀凡人
  const dis: any = fresh4((x) => x.realm === 1 && x.faction !== 'mortal' && x.faction !== 'demon'); dis.bond = 'disciple'; dis.favor = 70; dis.met = true; dis.pers = 'kind';
  D.set(dis);
  const mortal = () => fresh4((x) => x.realm === 0 && x.faction === 'mortal');
  E4.onHeroKill(mortal(), false); g.modal = null;
  ok(dis.dzW === 1 && dis.dazi, '杀凡人：温和的徒弟先劝');
  E4.onHeroKill(mortal(), false);
  const tn: any = modalNode();
  ok(!dis.dazi && !dis.bond && dis.grudge === 2 && dis.feudBy === 'hero' && /反目/.test(tn?.title ?? ''), '再犯（杀凡人）：反目成仇，断了师徒名分');
  ok(g.rel.feud.rows().some((r: any) => r.d === dis && r.by === 'hero'), '进了恩怨页：先手算你');
  g.modal = null;
  // 主动提议
  const sis: any = fresh4((x) => x.realm === 2 && x.faction !== 'mortal'); sis.bond = 'sworn'; sis.favor = 70; sis.met = true; sis.pers = 'arrogant';
  D.set(sis); D.S.propDay = 0; D.S.propP = 0; (D as any).t = 0; D.frame(1.1);
  ok(!!D.S.prop && E4.feed().some((r: any) => r.hook?.k === 'dazi'), `搭档主动提议：${D.S.prop?.text}`);
  const pn: any = D.propNode();
  ok(pn && pn.options.some((o: any) => /依你/.test(o.label)), '提议能点：依你 / 改日 / 以后少提');
  D.unset(sis);
}

// 26) 夺宝局：线索 → 踩点 → 找帮手 → 动手（偷 / 强攻）→ 脱身；被认出来进恩怨，没被认出来是无名凶手
{
  const B = g.duobao;
  g.modal = null; g.pursuit.reset(); g.player.x = WILD.x; g.player.y = WILD.y;
  B.S.job = null;
  const j: any = B.spawn('cave');
  ok(!!j && j.ph === 'lead' && j.guards.length >= 1 && !!j.tgt, `生成一局「洞府藏宝」：${j?.place} · ${j?.itemName} · 守着 ${1 + (j?.guards.length ?? 0)} 人`);
  const lead: any = E4.feed().find((r: any) => r.hook?.k === 'duobao' && r.hook.ref === j.id);
  ok(!!lead && E4.hookLabel(lead) === '接下这桩事', `江湖传音「可接的事」：${lead?.text}`);
  const ln: any = B.hookNode(j.id); ln.options[0].act();
  ok(j.ph === 'scout', '接下：去踩点');
  g.player.x = j.x + 2000; g.player.y = j.y; (B as any).t = 0; B.frame(0.5);
  const sn: any = modalNode();
  ok(j.ph === 'crew' && /时机/.test(sn?.text ?? ''), `踩点：看清守卫和时机——${(sn?.text ?? '').split('\n')[1]}`);
  g.modal = null;
  const cn0: any = B.crewNode(j), f0 = N4.followers().length;
  cn0.options.find((o: any) => /雇一名帮手/.test(o.label)).act();
  ok(j.hired.length === 1 && N4.followers().length === f0 + 1, '找帮手：雇了一个（跟着你，听队伍指令）');
  B.crewNode(j).options.find((o: any) => /去动手/.test(o.label)).act();
  ok(j.ph === 'strike', '去动手');
  g.player.x = j.x + 300; g.player.y = j.y; act4();
  j.p0 = F0.playOf(g); j.askP = 0; g.concealed = true; (B as any).t = 0; B.frame(0.5);
  const kn: any = modalNode();
  ok(/空档/.test(kn?.text ?? '') && kn.options.some((o: any) => /偷/.test(o.label)), `动手：${kn?.options.map((o: any) => o.label).join(' / ')}`);
  B.rnd = () => 0; g.modal = null;
  const res: any = B.steal(j);
  ok(C.bagCount(h4, j.item) >= 1 && j.ph === 'escape' && !j.known, `敛息趁空档偷：得手，没人认出来——${res?.text?.split('\n')[0]}`);
  ok(E4.feed().some((r: any) => r.text.includes('无名凶手') && r.text.includes(j.itemName)), '江湖上只知道是个「无名凶手」');
  ok(!B.members(j).some((d: any) => d.grudge > 0), '没人记你的仇');
  g.concealed = false;
  g.player.x = j.x + 9500; (B as any).t = 0; B.frame(0.5);
  ok(j.ph === 'done', '离开九里以外：脱身');
  // 怀宝之人：强攻、被认出来 → 进恩怨（先手算你），夺来的东西记着，能「退还」
  B.S.job = null; g.player.x = WILD.x; g.player.y = WILD.y;
  const j2: any = B.spawn('carrier');
  ok(!!j2 && j2.k === 'carrier' && !!N4.byId.get(j2.tgt)?.bag?.[j2.item], `生成一局「怀宝之人」：${N4.byId.get(j2?.tgt)?.name}身怀${j2?.itemName}`);
  j2.ph = 'strike'; g.player.x = j2.x + 300; g.player.y = j2.y; act4();
  B.attack(j2, false);
  const foes = B.members(j2).map((d: any) => N4.activeOf(d.id)?.enemy).filter(Boolean);
  ok(foes.length >= 1 && foes.every((e: any) => e.aggro), `强攻：${foes.length} 人转成敌人`);
  const tg: any = N4.byId.get(j2.tgt);
  ok(F0.heroStarted(tg, g.day), '强攻是你先动的手');
  for (const e of foes as any[]) e.aggro = false;   // 都跑了
  (B as any).t = 0; B.frame(0.5);
  ok(j2.ph === 'escape' && j2.known && tg.grudge === 2 && tg.feudBy === 'hero' && tg.lost?.item === j2.item, '被认出来：血仇、先手算你、夺来的东西记在账上');
  ok(g.enyuan.reconcileNode(tg).options.some((o: any) => /退还/.test(o.label)), '化解里能「退还夺来的东西」');
  ok(tg.hunting, '他会循迹找你');
  g.player.x = j2.x + 9500; (B as any).t = 0; B.frame(0.5);
  ok(j2.ph === 'done', '脱身了，但这笔账进了恩怨页');
}

// 27) 存读档：第三批的新字段都在
{
  const keep: any = fresh4((x) => x.realm === 1 && x.faction !== 'mortal'); keep.met = true; keep.loan = { amt: 25, day: g.day, due: g.day + 40, dueP: 1e9 };
  ok(Roster.notable(keep), '借了你钱的人算值得存档');
  const nZ = g.zhifa.S.cases.length, nM = g.laifang.S.msgs.length, dj = g.duobao.S.job?.id;
  ok(g.save(3) && g.load('taixu_save_3'), '存档、读档');
  const k2: any = g.npcs.byId.get(keep.id);
  ok(k2?.loan?.amt === 25 && g.zhifa.S.cases.length === nZ && g.laifang.S.msgs.length === nM && g.duobao.S.job?.id === dj, '读档后：借款、追捕、留言、夺宝局都在');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
