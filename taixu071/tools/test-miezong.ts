// v0.62「灭宗大战」冒烟测试：npx tsx tools/test-miezong.ts
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOC_BY_ID } = await import('../src/data/world');
const { MY_SECT_ID } = await import('../src/data/sects');
const C = await import('../src/world/cultivation');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const SW = g.sectwar as any, S = SW.S, MS = g.mysect as any, MY = MY_SECT_ID;
g.hero.realm = 4; g.hero.stage = 1; C.addItem(g.hero, 'mat_lingshi', 3000000);
g.day = 4000;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = { name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: g.day - 3000, fame: 900, stones: 200000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 2, zhen: 2, ling: 5 }, open: false, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0 };
const ms = g.ws.mySect as any;
for (let i = 0; i < 180; i++) { const realm = i < 4 ? 4 : i < 20 ? 3 : i < 70 ? 2 : 1; ms.ds.push({ id: ms.seq++, name: '弟子' + i, sex: i % 2 ? 'm' : 'f', age: 30, root: 1 + (i % 5), realm, stage: i % 3, exp: 0.95, loyal: 70, rank: realm >= 3 ? 3 : realm >= 2 ? 1 : 0, job: i % 4 === 0 ? 'ye' : 'xiu', joined: g.day, arts: 0 }); }
MS.sync(); SW.initHolds();

// 1) 经济：一年月结
const st0 = ms.stones;
for (let m = 0; m < 12; m++) { g.day += 30; MS.daily(1); }
ok(ms.cut === 0.3 && ms.zhenE > 0, `旧存档补字段：抽成 ${ms.cut} · 阵力 ${ms.zhenE}/${MS.zhenMax()}`);
ok(ms.tribute > 0 && ms.qi > 0, `一年后：供奉 ${Math.floor(ms.tribute)} · 气运 ${ms.qi.toFixed(1)} · 献礼 ${ms.gifts.length} 种`);
ok(ms.stones > st0 * 0.3, `库房没有一年见底：${st0} → ${Math.floor(ms.stones)}`);
console.log('    境界分布', [1, 2, 3, 4].map((r) => `${r}:${ms.ds.filter((d: any) => d.realm === r).length}`).join(' '));
// 2) 面板
const run = (n: any, label: string) => { const o = n.options.find((x: any) => x.label.includes(label) && !x.disabled); return o ? o.act() : null; };
let n = MS.node(); ok(n.text.includes('护宗大阵') && n.text.includes('门人'), '宗主对话只留现状与几个入口');
ok(!!n.options.find((x: any) => x.label.includes('打开宗主大殿')), '对话里有「打开宗主大殿」');
const exp0 = g.hero.exp; run(n, '汲取宗门气运'); ok(ms.qi === 0, `汲取气运（修为 ${Math.floor(exp0)} → ${Math.floor(g.hero.exp)}）`);
const bag0 = C.bagCount(g.hero, 'mat_lingshi'); run(MS.node(), '收取供奉'); ok(C.bagCount(g.hero, 'mat_lingshi') > bag0 && ms.tribute < 1, '收取供奉入袋');
// v0.71：拨灵石 / 亲卫这些动作已并入面板，直接走公开接口
const s0 = ms.stones; MS.deposit(1000000); ok(ms.stones === s0 + Math.min(1000000, 3000000), `拨灵石入库 ${ms.stones - s0}`);
n = MS.zhenNode(); run(n, '注入灵石充能'); ok(ms.zhenE === MS.zhenMax(), `大阵充满 ${ms.zhenE}`); run(MS.zhenNode(), '变阵');
MS.guardSet(MS.guardCap()); ok(ms.guard.length > 0 && ms.guard.length <= MS.guardCap(), `亲卫 ${ms.guard.length} 人`);
// 3) 推演：百人会战 → 灭宗大战 → 破阵 → 发落
const foe = 'qingxu';
let w = SW.declare(MY, foe, '测试');
const u0 = SW.units(MY).length, f0 = SW.alive(foe);
let rep = SW.clash(w, { ma: 'wave', n: 50 }); console.log(rep.split('\n').map((l: string) => '    ' + l).join('\n'));
ok(/50 人/.test(rep), '遣 50 人出战，对面照人数迎战');
if (S.wars.includes(w) && !w.fall && w.tgt !== foe) { w.ini = 0; rep = SW.clash(w, { ma: 'all' }); console.log('    ' + rep.split('\n')[0] + ' ' + rep.split('\n')[1]); ok(rep.includes('灭宗大战'), '倾巢而出 → 灭宗大战（双方尽出）'); }
let guard = 0;
while (S.wars.includes(w) && !w.fall && guard++ < 30) { w.ini = 0; if (w.tgt === foe && SW.zhenHp(foe) > 0) SW.siege(w, { hero: true }); else SW.clash(w, { ma: 'all' }); }
ok(!!w.fall || !S.wars.includes(w), `${w.fall ? '败者听候发落' : '战事已了'}（我方 ${u0} → ${SW.units(MY).length}，对方 ${f0} → ${SW.alive(foe)}，共 ${w.wave} 阵）`);
if (w.fall) { const vn = SW.verdictNode(w); ok(vn.options.length >= 4, '发落面板四个选项'); const txt = SW.verdict(w, 'mie'); console.log(txt.split('\n').map((l: string) => '    ' + l).join('\n')); ok(S.gone?.[foe] && !SW.sects().includes(foe) && S.branch.includes(foe), '灭其道统：宗门除名、山门改分舵'); }
// 4) 实战：亲征
const foe2 = 'huangfeng'; g.closeModal?.(true);
w = SW.declare(MY, foe2, '测试二');
SW.march(w, { ma: 'wave', n: 60 });
let h = SW.hud(); ok(!!h && h.m0 > 0 && h.f0 > 0, `亲征开打：${h?.title} 我 ${h?.m0} 敌 ${h?.f0}`);
let maxF = 0, maxM = 0;
for (let i = 0; i < 240; i++) { g.update(1 / 30); maxF = Math.max(maxF, g.combat.enemies.filter((e: any) => e.team === 'sw:' + foe2 && !e.dead).length); maxM = Math.max(maxM, g.combat.allies.filter((e: any) => !e.dead).length); }
h = SW.hud(); ok(maxF > 0 && maxF <= 20 && maxM <= 16 + ms.guard.length, `同屏 敌 ≤${maxF} 我 ≤${maxM}；${h ? h.sub : '已收场'}`);
// 把敌人（含敌方战阵）杀光看收场
for (let k = 0; k < 400 && SW.battle; k++) { for (const e of SW.battle.foes) { e.hp = 0; e.dead = true; e.deathT = 0; } for (const f of SW.battle.formations) if (!f.ours && !f.collapsed) { f.soldiers = 0; f.collapsed = true; } SW.battle.rf.splice(0, 6); SW.battle.cmdRf.splice(0, 6); for (let i = 0; i < 20; i++) g.update(1 / 30); }
ok(!SW.battle, `大会战收场；战事${S.wars.includes(w) ? `继续，兵锋 ${SW.tgtName(w)}` : '已了'}`);
console.log('    大事记：', ms.log.slice(-3).map((l: any) => l.t).join(' | '));
console.log(fails ? `\n${fails} 项失败` : '\n灭宗大战：全部通过');
process.exit(fails ? 1 : 0);
