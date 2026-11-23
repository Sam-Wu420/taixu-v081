// v0.70 验收：原创化（改名 / 红颜移除 / 问道残卷→问道残卷 / 旧存档换名）、元婴天阶神通与门派招式、问道残卷观招偷学
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
(globalThis as any).__FANREN_NORELOAD = true;
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { kitOf } = await import('../src/world/foeskills');
const { LOCATIONS, MAP_NAME, BIG_LABELS } = await import('../src/data/world');
const { SECT_DEFS } = await import('../src/world/roster');
const { BEAUTIES } = await import('../src/data/beauties');
const { ARTS } = await import('../src/data/arts');
const { itemDef } = await import('../src/data/items');
const { RENAME } = await import('../src/data/rename');
const { CJ_NEED } = await import('../src/world/canjuan');
const { unzipSave } = await import('../src/world/savezip');
/** 由新名查回旧名（不在测试里直接写旧名，免得改名工具把它也改掉） */
const O = (nw: string) => RENAME.find(([, b]) => b === nw)![0];

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const step = (n: number) => { for (let i = 0; i < n; i++) g.update(1 / 30); };

// ---------------- 一、原创化
const OLD = RENAME.map(([a]) => a).filter((a) => a.length >= 2);
const bad = (s: string) => OLD.find((a) => s.includes(a));
ok(!Object.values(MAP_NAME).some(bad), `三大地域名已改：${Object.values(MAP_NAME).join('、')}`);
ok(!LOCATIONS.some((l) => bad(l.name)), '地点名不含原著名：' + (LOCATIONS.find((l) => bad(l.name))?.name ?? ''));
ok(!BIG_LABELS.some((l: any) => bad(l.name)), '大地图上的大字不含原著名');
ok(!SECT_DEFS.some((s) => bad(s.name)), '宗门名不含原著名');
// 只查有名有姓的人物（随机起名的路人可能碰巧拼出两个同字，不算）
ok(!g.npcs.list.some((n) => (n.canon || n.ros) && bad(n.name)), '有名人物无原著人名：' + (g.npcs.list.find((n) => (n.canon || n.ros) && bad(n.name))?.name ?? ''));
ok(BEAUTIES.length === 0 && !g.npcs.list.some((n) => n.beauty), '红颜移除');
ok(itemDef('item_bottle').name === '问道残卷' && !itemDef('item_bottle').desc.includes('瓶'), '问道残卷 → 问道残卷');
ok(g.hero.name !== O('苏寒'), `主角改名：${g.hero.name}`);

// 旧存档：原著人名 / 地名换成新名字，红颜移除
g.save(0);
const raw = unzipSave(mem.get('fanren_save_auto')!) ?? mem.get('fanren_save_auto')!;
const d = JSON.parse(raw);
d.hero.name = O('苏寒');
d.npcs.push({ ...d.npcs[0], id: 'b_nangong', name: O('上官翎'), beauty: 'nangong', title: O('凝霜') + '宗' });
d.npcs[1].name = O('方啸云');
d.world.news = [{ text: `${O('苏寒')}在${O('青霞')}谷击败了${O('邹大夫')}。`, kind: 'personal', day: 1 }];
d.world.hearts = { nangong: { met: true, favor: 60, flags: {} } };
mem.set('fanren_save_auto', JSON.stringify(d));
ok(g.load('fanren_save_auto') !== false, '旧存档读入');
ok(g.hero.name === '苏寒', `旧存档主角名换成新名：${g.hero.name}`);
ok(!g.npcs.list.some((n) => n.name === O('方啸云') || n.name === O('上官翎')), '旧存档原著人名换掉、红颜移除');
ok(!g.npcs.list.some((n) => n.beauty) && Object.keys(g.ws.hearts).length === 0, '旧存档红颜与情缘清空');
ok(!(g.ws.news ?? []).some((n: any) => bad(n.text)), '旧存档传闻文字换名：' + (g.ws.news ?? []).map((n: any) => n.text).join('|'));

// ---------------- 二、门派招式与元婴天阶神通
const mk = (def: string, r: number, school: string) => { const e = new Enemy((ENEMIES as any)[def] ?? (ENEMIES as any).bandit, g.player.x + 260, g.player.y, r, 0); e.school = school; return e; };
const k1 = kitOf(mk('zhujixiu', 1, 'huangfeng')), k4 = kitOf(mk('jindan_mo', 4, 'guiling')), kr = kitOf(mk('zhujixiu', 4, 'sanxiu'));
ok(k1.filter((s) => !['heal', 'guard'].includes(s.k)).length >= 5, `炼气修士至少五式攻招（${k1.length}）`);
ok(k4.filter((s) => s.id === 't_guiling_1' || s.id === 't_guiling_2').length === 2, '元婴必带本派两门天阶神通：' + k4.filter((s) => s.id.startsWith('t_')).map((s) => s.name).join('、'));
ok(k4.some((s) => s.id === 'yy_fury'), '元婴有第二阶段（燃魂）');
ok(k4.length >= 14, `元婴招式数（${k4.length}）`);
ok(kr.some((s) => s.id.startsWith('t_e_')), '散修元婴也有本系天阶神通');

// ---------------- 三、问道残卷 · 观招
const cj = g.canjuan;
ok(cj.owned, '新开局即持有问道残卷');
const foeAI: any = (g.combat as any).foe;
const castAt = (e: any, sk: any) => { g.combat.enemies.push(e); foeAI.start(e, sk, g.player.x, g.player.y); };
// 黄阶：需 6 点；一人最多四成（2.4 点）
const a = mk('zhujixiu', 1, 'huangfeng'); const skA = kitOf(a).find((s) => s.id === 'hf_mang')!;
for (let i = 0; i < 5; i++) castAt(a, skA);
ok(Math.abs((cj.S.p['hf_mang'] ?? 0) - CJ_NEED[1] * 0.4) < 1e-6, `同一人最多学到四成（${cj.S.p['hf_mang']} / ${CJ_NEED[1]}）`);
// 换人再看：三成起入法术书（残篇）
const b = mk('zhujixiu', 1, 'huangfeng'); for (let i = 0; i < 3; i++) castAt(b, skA);
ok(g.hero.arts.some((x) => x.id === 'cj_hf_mang'), '三成起残卷功法入法术书');
ok(Math.abs(cj.powMul('cj_hf_mang') - 0.5) < 1e-6, `残篇威力五折（${cj.powMul('cj_hf_mang')}）`);
const c = mk('zhujixiu', 1, 'huangfeng'); for (let i = 0; i < 3; i++) castAt(c, skA);
ok(cj.S.got.includes('hf_mang') && cj.powMul('cj_hf_mang') === 1, '集齐领悟即全篇');
// 挨上 / 躲开
const before = cj.S.p['hf_fire'] ?? 0;
const e2 = mk('zhujixiu', 1, 'huangfeng'); const skF = kitOf(e2).find((s) => s.id === 'hf_fire') ?? kitOf(e2).find((s) => s.k === 'circle')!;
castAt(e2, skF); const afterSeen = cj.S.p[skF.id] ?? 0;
ok(afterSeen - before === 1, `看见 +1（${afterSeen - before}）`);
const hz: any[] = foeAI.hz.filter((h: any) => h.sid === skF.id);
if (hz.length) { cj.onHit(e2, skF.id, hz[0].cj); ok((cj.S.p[skF.id] ?? 0) - afterSeen === 2, '挨上 +2'); cj.onHit(e2, skF.id, hz[0].cj); ok((cj.S.p[skF.id] ?? 0) - afterSeen === 2, '同一次出手只记一次'); }
// 天阶：境界不到威力两成五
const y = mk('jindan_mo', 4, 'guiling'); const skT = kitOf(y).find((s) => s.id === 't_guiling_1')!;
ok(!!ARTS['cj_t_guiling_1'], '天阶神通已转成玩家功法');
(cj.S.p as any)['t_guiling_1'] = CJ_NEED[4]; cj.S.got.push('t_guiling_1');
g.hero.realm = 1; ok(Math.abs(cj.powMul('cj_t_guiling_1') - 0.25) < 1e-6, '炼气用天阶神通：两成五');
g.hero.realm = 3; ok(Math.abs(cj.powMul('cj_t_guiling_1') - 0.5) < 1e-6, '结丹用天阶神通：五成');
g.hero.realm = 4; ok(cj.powMul('cj_t_guiling_1') === 1, '元婴用天阶神通：十成');
ok(!SKIP(skT), '天阶神通可学');
function SKIP(sk: any) { return !ARTS['cj_' + sk.id]; }
// 护体 / 服丹 / 出窍学不来
ok(!ARTS['cj_h_pill'] && !ARTS['cj_yy_out'] && !ARTS['cj_h_guard'], '护体、服丹、出窍不算功法');
// 每一门转出来的功法都能施展（不报错、扣法力）
g.hero.realm = 4; g.hero.stage = 0; g.hero.mp = 1e9; let castErr = '';
const cjIds = Object.keys(ARTS).filter((id) => id.startsWith('cj_'));
for (const id of cjIds) { try { if (!g.hero.arts.some((x) => x.id === id)) g.hero.arts.push({ id, xp: 0 }); (g.combat as any).cds?.clear?.(); (g.combat as any).castT = 0; g.combat.cast(id); g.update(1 / 30); } catch (err: any) { castErr = id + '：' + err.message; break; } }
ok(!castErr, `全部 ${cjIds.length} 门残卷功法可施展${castErr ? '——' + castErr : ''}`);
step(30);
// 存档往返
g.save(0); const prog = JSON.stringify(cj.S); g.load('fanren_save_auto');
ok(JSON.stringify(g.canjuan.S) === prog, '残卷进度随存档');

console.log(`v070: ${pass} 通过, ${fail} 失败（残卷功法 ${cjIds.length} 门）`);
if (fail) process.exit(1);
