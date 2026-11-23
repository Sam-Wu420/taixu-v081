// v0.61「宗门争锋」冒烟测试：npx tsx tools/test-sectwar.ts
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const { SECT_DEFS, SECT_DEF } = await import('../src/world/roster');
const { scaleOf, SCALE_CAP, SCALE_NAME, sectGongfa, MY_SECT_ID } = await import('../src/data/sects');
const { GONGFA } = await import('../src/data/skills');
const { SCHOOLS } = await import('../src/world/schools');
const { HOLDS } = await import('../src/world/sectwar');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const SW = g.sectwar, S = SW.S;
const dead = (sid: string) => SW.size(sid) - SW.alive(sid);

// 1) 规模三等
const cnt: any = { da: 0, zhong: 0, xiao: 0 };
for (const d of SECT_DEFS) cnt[scaleOf(d.id, d.n)]++;
ok(cnt.da >= 8 && cnt.zhong >= 10 && cnt.xiao >= 6, `宗门三等：大 ${cnt.da} · 中 ${cnt.zhong} · 小 ${cnt.xiao}`);
ok(SECT_DEFS.every((d) => d.n <= SCALE_CAP[scaleOf(d.id, d.n)]), '名册人数都不超过本等上限（12800 / 7200 / 3200）');
ok(scaleOf('tianmo') === 'da' && SECT_DEF.get('tianmo')!.n > 7200 && scaleOf('huangfeng') === 'zhong' && scaleOf('qingxu') === 'xiao', `天魔宗 ${SECT_DEF.get('tianmo')!.n} 人（大）· 青霞谷 ${SECT_DEF.get('huangfeng')!.n}（中）· 清微门 ${SECT_DEF.get('qingxu')!.n}（小）`);
console.log('   ', SECT_DEFS.map((d) => `${d.name}${SCALE_NAME[scaleOf(d.id, d.n)][0]}${d.n}`).join(' '));

// 2) 宗法审计：每派都得有镇派心法 / 战阵；斗法流派缺的列出来
const noGf: string[] = [], noKit: string[] = [], noArt: string[] = [];
for (const d of SECT_DEFS) {
  const doc = SW.doctrine(d.id);
  if (!doc.gf) noGf.push(d.name);
  if (!SCHOOLS[d.id] && !['tianxing', 'leikong', 'tianlan', 'yejia'].includes(d.id)) noKit.push(d.name);
  if (!SW.arts(d.id).length) noArt.push(d.name);
}
ok(!noGf.length, `每派都有镇派心法与战阵${noGf.length ? '——缺：' + noGf.join('、') : ''}`);
ok(!noKit.length, `每派都有斗法流派${noKit.length ? '——缺：' + noKit.join('、') : ''}`);
console.log('    藏经阁无秘传法术（只有心法）的：', noArt.join('、') || '无');
ok(['mulan', 'yejia', 'tianxing', 'leikong', 'miaoyin'].every((id) => !!GONGFA[sectGongfa(id)!]), '补齐五派镇派心法（朔漠 / 叶家 / 星罗殿 / 叛星盟 / 清音门）');
const dz = SW.doctrine('guiling'); console.log(`    阴灵门宗法：《${dz.gf}》${dz.name} 攻×${dz.atk} 守×${dz.def}`);

// 3) 据点
SW.initHolds();
const holds = Object.keys(S.hold);
ok(holds.length >= 30, `各派镇守据点共 ${holds.length} 处`);
ok(SECT_DEFS.every((d) => SW.holdsOf(d.id).length <= HOLDS[scaleOf(d.id, d.n)]), '据点数不超过规模所限（大 4 / 中 3 / 小 2）');
console.log('    阴灵门据点：', SW.holdsOf('guiling').map((id) => `${LOC_BY_ID.get(id)!.name}(${S.hold[id].g})`).join('、'), '｜青霞谷据点：', SW.holdsOf('huangfeng').map((id) => `${LOC_BY_ID.get(id)!.name}(${S.hold[id].g})`).join('、'));
ok(SW.base('huangfeng', 'guiling') > 60 && SW.base('huangfeng', 'yanyue') < 0, `正魔世仇敌意 ${SW.base('huangfeng', 'guiling')}；同盟之间不开战`);

// 4) 分波 vs 倾巢：折损
const w1 = SW.declare('guiling', 'huangfeng', '测试');
ok(S.wars.length === 1 && w1.tgt !== 'huangfeng', `宣战：先打据点 ${LOC_BY_ID.get(w1.tgt)?.name}`);
let d0 = dead('guiling') + dead('huangfeng');
console.log('   ', SW.clash(w1, { ma: 'wave', md: 'wave' }));
const dWave = dead('guiling') + dead('huangfeng') - d0; d0 += dWave;
ok(dWave > 0 && dWave < 60, `分波遣将：一阵折损 ${dWave} 人（落在名册上）`);
if (S.wars.includes(w1)) { console.log('   ', SW.clash(w1, { ma: 'all', md: 'all' })); const dAll = dead('guiling') + dead('huangfeng') - d0; ok(dAll > dWave, `倾巢而出 · 全面对轰：一阵折损 ${dAll} 人`); }
for (let i = 0; i < 200 && S.wars.includes(w1); i++) SW.clash(w1);
ok(!S.wars.includes(w1), `战事打到落幕（共 ${w1.wave} 阵；阴灵门折 ${w1.la} · 青霞谷折 ${w1.lb}）`);
ok(S.truce['guiling|huangfeng'] > g.day, '战后停战五年');
console.log('    战后：阴灵门', SW.alive('guiling'), '/', SW.size('guiling'), '据点', SW.holdsOf('guiling').length, '｜青霞谷', SW.alive('huangfeng'), '/', SW.size('huangfeng'), '据点', SW.holdsOf('huangfeng').length);

// 5) 自然开战：紧张度日积月累
for (const k of Object.keys(S.truce)) delete S.truce[k];
let yrs = 0; for (; yrs < 12 && !S.wars.length; yrs++) { g.day += 360; (SW as any).dacc = 0; (SW as any).drift(360); }
ok(S.wars.length > 0, `约 ${yrs} 年后自然开战：${S.wars.map((w) => `${SW.name(w.a)}→${SW.name(w.b)}（${w.why}）`).join('；')}`);
for (let i = 0; i < 30; i++) { g.day += 20; SW.daily(20); }
console.log('    推演 600 日后战事：', S.wars.length, '场；', (g.ws as any).news?.slice(-2).map((n: any) => n.text ?? n).join(' / '));

// 6) 身为门人：召集玉符 → 应召 → 亲身上阵
for (const w of [...S.wars]) SW.end(w, 0, '测试收场', true);
(SW as any).postActors.length = 0; (SW as any).postFormations.length = 0;
for (const k of Object.keys(S.truce)) delete S.truce[k];
g.hero.realm = 2; g.hero.stage = 1; (g.ws as any).sect = { id: 'yanyue', rank: 1, contrib: 0, joined: 0, lastPay: 0, tasks: [], done: 0 };
const w2 = SW.declare('hehuan', 'yanyue', '测试·世仇');
const jade = g.war.inbox.find((j) => j.sw === w2.id);
ok(!!jade && jade.kind === '召集', `召集玉符：${jade?.from}`);
const jn = g.war.jadeNode(jade!); const jo = jn.options.find((o) => o.label.startsWith('应召'));
ok(!!jo, `玉符选项：${jn.options.map((o) => o.label).join(' / ')}`);
jo!.act!();
ok(w2.side === 1, '已应召（凝霜宗一方）');
ok(SW.marks().some((m) => m.glyph === '攻'), '地图标出战场（攻）');
g.day += 5; SW.daily(5);
const fp = (SW as any).frontPos(w2);
g.teleport(fp.x, fp.y + 200); g.closeModal?.(true);
(SW as any).acc = 0; SW.update(0.1);
ok(!(SW as any).battle && !!SW.standoffHud(), '抵近前线先进入阵前对峙态，不擅自直接开火');
SW.triggerDecisiveClash(w2, '鸣鼓总攻');
const B = (SW as any).battle;
ok(!!B && B.foes.length >= 4, `接敌：${B?.foes.map((e: any) => e.name + '·' + e.realm).join('、')}`);
ok(!!B && B.allies.length >= 2 && B.allies.every((e: any) => e.ally), `同门 ${B?.allies.length} 人并肩：${B?.allies.map((e: any) => e.name).join('、')}`);
const m0 = g.war.merit, hd0 = dead('hehuan');
for (let wave = 0; wave < 35 && (SW as any).battle; wave++) {
  const sb = (SW as any).battle;
  for (const e of [...sb.foes]) g.combat.finish(e);
  for (const f of sb.formations) if (!f.ours && !f.collapsed) { f.deadCount += Math.round(f.soldiers * 0.5); f.injCount += Math.round(f.soldiers * 0.3); f.soldiers = 0; f.collapsed = true; f.collapseT = 0; }
  if (sb.rf.length === 0 && sb.cmdRf.length === 0 && sb.bossRf.length === 0 && sb.foes.length === 0) sb.outerRf = 0;
  SW.update(0.1); SW.update(3);
}
ok(!(SW as any).battle && (w2.wins ?? 0) === 1, `三波全歼，胜一阵（战功 ${m0} → ${g.war.merit}）`);
ok(dead('hehuan') - hd0 >= 10, `亲手所杀记入天欢宗名册：${dead('hehuan') - hd0} 人`);
ok(g.combat.allies.every((e: any) => e.gone || e.dead), '胜后同门收兵');
SW.end(w2, 1, '测试收场', true);

// 7) 自立宗门：镇守 / 宣战 / 分波 / 倾巢
(g.ws as any).sect = null;
const hf = LOC_BY_ID.get('huangfeng')!;
(g.ws as any).mySect = { name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: g.day - 3000, fame: 700, stones: 5000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: 'qingyuan', halls: { lib: 0, dan: 0, zhen: 1, ling: 3 }, open: true, minRoot: 2, auto: false, lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0 };
g.mysect.sync();
const ms = g.ws.mySect!;
for (let i = 0; i < 80; i++) ms.ds.push({ id: ms.seq++, name: `弟子${i}`, sex: 'm', age: 30, root: 3, realm: i < 4 ? 3 : i < 30 ? 2 : 1, stage: i % 3, exp: 0, loyal: 80, rank: 0, job: 'xiu', joined: g.day, arts: 2 });
ok(g.mysect.scale() === 'zhong' && g.mysect.cap() <= 200, `自家宗门：${SCALE_NAME[g.mysect.scale()]}，门人上限 ${g.mysect.cap()}`);
const mn = SW.myNode(); console.log('    宗门战事面板：', mn.options.map((o) => o.label).join(' / '));
const hn = mn.options.find((o) => o.label.startsWith('派弟子镇守'))!.act!() as any;
const free0 = SW.myFree();
const empty = hn.options.find((o: any) => o.label.includes('无主')), taken = hn.options.find((o: any) => /镇守 \d+ 人/.test(o.label) && !o.label.includes('本宗'));
if (empty) { const an = empty.act(); an.options.find((o: any) => o.label.includes('派 12 人')).act(); ok(SW.holdsOf(MY_SECT_ID).length === 1 && SW.myFree() === free0 - 12, `进驻无主之地：据点 1 处，可调之兵 ${free0} → ${SW.myFree()}`); }
else console.log('    （山门附近没有无主之地，跳过进驻）');
ok(!!taken, `别派据点：${taken?.label}`);
const tn = taken.act(); const seize = tn.options.find((o: any) => o.label.startsWith('强占'));
const wn = seize.act();
const w3 = S.wars.find((w) => w.a === MY_SECT_ID)!;
ok(!!w3 && wn.options.some((o: any) => o.label.startsWith('遣 ')) && wn.options.some((o: any) => o.label.startsWith('倾巢而出')), `强占 = 宣战（对${SW.name(w3?.b)}）：${wn.options.map((o: any) => o.label).join(' / ')}`);
const n0 = SW.alive(MY_SECT_ID);
const sendOpt = wn.options.find((o: any) => o.label.startsWith('遣 ')).act();
const r1 = sendOpt.options.find((o: any) => o.label.startsWith('坐镇山门')).act(); console.log('   ', r1.text.split('\n')[0]);
ok(w3.wave === 1, `派出一波：已打 1 阵，在世 ${n0} → ${SW.alive(MY_SECT_ID)}`);
if (S.wars.includes(w3)) {
  g.day += 30; const wn2 = SW.myWarNode(w3); const all = wn2.options.find((o: any) => o.label.startsWith('倾巢而出')) ?? wn2.options.find((o: any) => o.label.startsWith('主动出击'));
  let r2 = all!.act!() as any; if (!/战报/.test(r2.title ?? '')) r2 = r2.options.find((o: any) => o.label.startsWith('坐镇山门')).act();
  console.log('   ', r2.text.split('\n')[0]);
  ok(w3.wave >= 2, `倾巢而出：已打 ${w3.wave} 阵，在世剩 ${SW.alive(MY_SECT_ID)}`);
}
// 敌人来攻：蓄势满后按守御之策自动接战
if (S.wars.includes(w3)) { w3.ini = 1; w3.tgt = (SW as any).nextTarget(w3.b, MY_SECT_ID); w3.next = g.day; SW.recordAttrition(w3, 1, 100, 0.05, '敌军蓄势反扑'); const wv = w3.wave; SW.daily(1); ok(w3.wave > wv || !S.wars.includes(w3), `敌军来攻${SW.name(MY_SECT_ID)}：自动接战（${w3.log[w3.log.length - 1]?.slice(0, 60)}…）`); }
ok(g.war.inboxNode().options.some((o) => o.label.startsWith('天下大势')), '玉符面板有「天下大势 · 宗门争锋」入口');
const top = SW.node(); ok(top.text.includes('现有') && top.options.length >= 3, `天下大势面板：${top.options.map((o) => o.label).join(' / ')}`);
const sn = SW.sectNode('huangfeng', () => top); console.log('    ' + sn.speaker + '：' + sn.text.replace(/\n/g, ' ｜ '));
ok(SW.patternList().length === 6, '战阵阵型列表完整（6 种）');
// 8) 存档往返 + 跑几帧不报错
const json = JSON.stringify(g.ws.flags.sw); ok(json.length > 100 && !!JSON.parse(json).hold, `状态可存档（${json.length} 字节）`);
for (let i = 0; i < 120; i++) g.update(1 / 30);
ok(true, '带着战事跑 120 帧无异常');
console.log(fails ? `\n${fails} 项失败` : '\n宗门争锋：全部通过');
process.exit(fails ? 1 : 0);
