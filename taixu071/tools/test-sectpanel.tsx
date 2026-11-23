// v0.71 宗门面板冒烟：npx tsx tools/test-sectpanel.tsx
//   一、未立派 → 引导页；二、落档后十二页全部渲染；三、面板动作全走 mysect 的公开接口
// 用 react-dom/server 直接渲染（与 tools/test-ui.tsx 同一套 Node 环境），不依赖真键盘与画布交互。
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
await import('./env');
const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { SectPanel } = await import('../src/ui/SectPanel');
const { LOC_BY_ID } = await import('../src/data/world');
const { REALMS } = await import('../src/data/realms');
const { GONGFA } = await import('../src/data/skills');
const C = await import('../src/world/cultivation');
const { BT_RULE_TEXT } = await import('../src/world/mysect');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
type Nav = 'overview' | 'roster' | 'jobs' | 'apps' | 'library' | 'build' | 'vault' | 'guard' | 'war' | 'rules' | 'arts' | 'log';
const render = (nav?: Nav) => renderToString(React.createElement(SectPanel, { game: g, onClose() {}, initial: nav }));
const has = (html: string, s: string) => html.includes(s);

console.log('一、尚未开宗立派');
{
  ok(!g.ws.mySect, '初始没有自家宗门');
  const html = render();
  ok(html.length > 800, `引导页渲染成功（${html.length} 字符）`);
  ok(has(html, '山门未立'), '给出「山门未立」');
  ok(has(html, '元婴'), '写明须元婴期');
  ok(has(html, '5000') || has(html, '5,000'), '写明立派灵石开销');
  ok(has(html, '开宗立派'), '有立派入口按钮');
  ok(has(html, '立派须备'), '写明立派须备哪几件');
  ok(has(html, '自立门户'), '写明「自立门户」的代价');
  ok(has(html, 'found-req'), '四件事各占一行（flex 行，长句自己折行）');
  ok(!has(html, '开宗立派…'), '「开宗立派」按钮不带省略号');
  ok(has(html, 'class="ok"') || has(html, 'class="no"'), '达成项有 ✔ / ✘ 标记');
}

console.log('二、落档（模拟 v0.60 之后的老存档）');
{
  const hf = LOC_BY_ID.get('huangfeng')!;
  g.hero.realm = 4; g.hero.stage = 0;
  C.addItem(g.hero, 'mat_lingshi', 200000);
  (g.ws as any).mySect = {
    name: '太虚门', dao: 'zheng', map: 'renjie', x: hf.x + 14, y: hf.y + 10, founded: 0,
    fame: 700, stones: 300000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: g.hero.gongfa,
    halls: { lib: 1, dan: 1, zhen: 1, ling: 1 }, open: true, minRoot: 2, auto: false,
    lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0,
  };
  g.mysect.sync();
  const ms = g.ws.mySect!;
  ok(ms.name === '太虚门', '自家宗门已落档');
  g.mysect.daily(0);
  ok(ms.cut === 0.3 && ms.reserve === 0 && ms.btRule === 1 && ms.btRate === 0.05, 'v0.62 新字段已补齐（抽成 / 保底 / 资格 / 用度）');
  ok((ms.zhenE ?? 0) > 0, `护宗大阵阵力已按级别补上（${Math.floor(ms.zhenE ?? 0)}）`);

  // 求拜者
  const mk = (name: string, root: number, realm: number) => ({ name, sex: 'm' as const, age: 20, root, realm, stage: realm === 1 ? 6 : 0, until: g.day + 60, note: '流落在外的炼气散修' });
  ms.apps.push(mk('林小七', 3, 1), mk('秦大牛', 5, 2), mk('陈无根', 1, 0));
  ok(has(render('apps'), '林小七'), '求拜者在「山门求拜者」页可见');
  ok(has(render(), '山门求拜者'), '概览里能看到求拜者入口');

  g.mysect.takeAll('root3');
  ok(ms.ds.length === 2 && ms.apps.length === 1, `批量收录只收三灵根以上（门人 ${ms.ds.length}，候着 ${ms.apps.length}）`);
  ok(g.mysect.takeApplicant(ms.apps[0]), '单个收录成功');
  ok(ms.ds.length === 3, '门人 3 人');

  const d = ms.ds.find((x) => x.name === '林小七')!;
  const exp0 = d.exp, stage0 = d.stage, realm0 = d.realm;
  ok(g.mysect.guide(d) === true, '指点一日');
  ok(g.mysect.taughtRecently(d), '本月的指点已用掉');
  ok(d.exp > exp0 || d.stage > stage0 || d.realm > realm0, '修为有推进（或已晋阶）');
  ok(g.mysect.guide(d) === false, '同一月不能再指点');
  const money0 = g.mysect.balance().total;
  ok(g.mysect.grantPill(d) === true && g.mysect.balance().total < money0, '赐丹成功且扣了灵石');

  d.stage = REALMS[1].stages.length - 1; d.exp = 1;
  const bi = g.mysect.breakInfo(d);
  ok(bi.bottleneck && bi.ready && bi.eligible && bi.spareOk, `瓶颈信息齐备（成算 ${Math.round(bi.chance * 100)}%，花费 ${bi.cost}）`);
  const r = g.mysect.breakthrough(d);
  ok(typeof r.msg === 'string' && r.msg.length > 4, `助其冲关有结果：${r.msg}`);

  const d2 = ms.ds.find((x) => x.realm >= 2) ?? ms.ds[0];
  d2.realm = 2; d2.stage = 0; d2.rank = 0;
  ok(g.mysect.canPromote(d2), '筑基门人可晋内门');
  ok(g.mysect.promote(d2) && d2.rank === 1, '晋升生效');

  const arts = g.mysect.publishableArts();
  ok(arts.length > 0, `可发布法术 ${arts.length} 门`);
  const n0 = ms.lib.length;
  ok(g.mysect.publishArt(arts[0].id) && ms.lib.length === n0 + 1, `《${arts[0].name}》录入藏经阁`);
  ok(!g.mysect.publishArt(arts[0].id), '同一门不会重复录入');
  const otherGf = Object.keys(GONGFA).find((k) => k !== ms.gf && GONGFA[k]?.rate > 0);
  ok(!!otherGf && g.mysect.setGf(otherGf!) && ms.gf === otherGf, `立《${GONGFA[otherGf!]?.name}》为镇派心法`);

  ok(g.mysect.buildHall('lib') && ms.halls.lib === 2, '藏经阁扩建至 2 级');
  ms.zhenE = 0;
  ok(g.mysect.chargeZhen() > 0, `大阵充能 ${Math.floor(ms.zhenE ?? 0)} 点`);
  g.mysect.setZhenMode('sha');
  ok(ms.zhenMode === 'sha', '变阵为诛邪万剑阵');
  g.mysect.setZhenMode('shou');

  g.mysect.guardSet(g.mysect.guardCap());
  ok((ms.guard ?? []).length > 0, `亲卫 ${(ms.guard ?? []).length}/${g.mysect.guardCap()} 人已点`);
  g.mysect.guardSet('clear');
  ok((ms.guard ?? []).length === 0, '遣散亲卫');

  ok(g.mysect.deposit(1000) === 1000, '拨灵石入库房');
  ok(g.mysect.withdraw(500) === 500, '从库房支取');
  ms.tribute = 1234; ms.gifts = [{ id: 'pill_juqi', n: 2 }];
  const col = g.mysect.collect();
  ok(col.stones === 1234 && col.gifts === 2, '收取供奉与门人献礼');

  const cut0 = ms.cut ?? 0.3;
  ok(g.mysect.cycleCut() !== cut0, '抽成档位切换生效');
  const res0 = ms.reserve ?? 0;
  ok(g.mysect.cycleReserve() !== res0, '库房保底线切换生效');
  const rate0 = ms.btRate ?? 0.05;
  ok(g.mysect.cycleRate() !== rate0, '冲关用度切换生效');
  const rule0 = ms.btRule ?? 1;
  ok(g.mysect.cycleRule() !== rule0, '冲关资格切换生效');
  g.mysect.cycleCut(); g.mysect.cycleReserve(); g.mysect.cycleRate(); g.mysect.cycleRule();

  ms.lastTeach = -999;
  const day0 = g.day;
  g.mysect.teach();
  ok(g.day > day0, '开坛讲法三日推进了日期');

  ms.qi = g.mysect.qiCap();
  ok(g.mysect.qiFill() >= 1, `宗门气运已积满（${Math.floor(ms.qi)}/${g.mysect.qiCap()}）`);
  g.mysect.claimQi();
  ok((ms.qi ?? 0) === 0, '汲取气运后清零');

  const wn = g.mysect.node();
  ok(!!wn && typeof wn.text === 'string', '宗主大殿对话树仍可用（面板与它并存）');
}

console.log('三、十二页全部渲染 + 关键内容');
{
  const NAVS: Nav[] = ['overview', 'roster', 'jobs', 'apps', 'library', 'build', 'vault', 'guard', 'war', 'rules', 'arts', 'log'];
  const pages: Record<string, string> = {};
  for (const n of NAVS) { pages[n] = render(n); ok(pages[n].length > 300, `「${n}」页渲染 ${pages[n].length} 字符`); }
  const miss = ['太虚门', '抽成', '护宗大阵'].filter((s) => !has(pages.overview, s));
  ok(!miss.length, `概览：宗门名 / 抽成 / 护宗大阵${miss.length ? `（缺 ${miss.join('、')}）` : ''}`);
  ok(!has(pages.overview, '十二页'), '页签行不再挂「十二页：…」那串提示');
  ok(has(pages.roster, '林小七'), '名册：门人姓名');
  ok(has(pages.jobs, '全派改派到此'), '差事：全派改派');
  ok(has(pages.library, '镇派心法'), '藏经阁：镇派心法');
  ok(has(pages.build, '护宗大阵') && (has(pages.build, '金光镇岳阵') || has(pages.build, '诛邪万剑阵')), '营造：护宗大阵与阵型');
  ok(has(pages.vault, '冲关用度') && has(pages.vault, '宗主抽成'), '库房：抽成 / 冲关用度 / 保底线');
  ok(has(pages.guard, '亲卫') || has(pages.guard, '随行'), '亲卫页');
  ok(has(pages.war, '镇守') && has(pages.war, '守御之策') && has(pages.war, '宣战'), '战事页：据点 / 守御 / 宣战');
  ok(has(pages.rules, '山门') && has(pages.rules, '门槛') && has(pages.rules, '执事自行收录'), '规矩页：山门 / 门槛 / 收录');
  ok(has(pages.arts, '自创功法'), '自创功法页');
  ok(has(pages.log, '立派') || has(pages.log, '击退'), '大事记页');

  // 未立派的宗门也能进战事/规矩之外的那些页（战事与规矩不依赖门人）
  ok(render('war').length > 300, '未立派时战事页也不报错');
}

console.log('四、收徒规矩');
{
  const ms = g.ws.mySect!;
  ok(g.mysect.recruitRate().perMonth > 0, `收徒速率约 ${g.mysect.recruitRate().perMonth.toFixed(1)} 人/月`);
  g.mysect.setOpen(false);
  ok(!ms.open && g.mysect.recruitRate().perMonth === 0, '关山门后速率归零');
  g.mysect.setOpen(true);
  g.mysect.setMinRoot(4);
  ok(ms.minRoot === 4, '门槛改成双灵根');
  g.mysect.setMinRoot(2);
  g.mysect.setAuto(true);
  ok(ms.auto === true, '改为执事自行收录');
  g.mysect.setAuto(false);
  ok(render('rules').includes('宗主亲自过目'), '规矩页渲染出当前收录方式');
}

console.log('五、宗门战事');
{
  const ms = g.ws.mySect!, sw = g.sectwar;
  // 先把门人补到够出兵
  for (let i = 0; i < 20; i++) ms.ds.push({ id: 900 + i, name: '战兵' + i, sex: 'm', age: 30, root: 3, realm: 1, stage: 3, exp: 0, loyal: 60, rank: 0, job: 'xiu', joined: 0, arts: 0 });
  sw.initHolds();
  const sum = sw.myWarSummary();
  ok(!!sum && sum.holdMax >= 2, `战事总览：据点上限 ${sum!.holdMax} · 可调 ${sum!.free} 人`);

  ok(sw.defList().length === 3, '守御之策三档');
  sw.setDefense('all'); ok(sw.defNow() === 'all', '切到全宗回援');
  sw.setDefense('hold'); ok(sw.defNow() === 'hold', '切到只凭镇守');
  sw.setDefense('wave');

  const cands = sw.holdCandidates(10);
  ok(cands.length > 0, `据点候选 ${cands.length} 处`);
  const free = cands.find((h) => !h.owner);
  if (free) {
    ok(sw.holdPlant(free.id, 6), `进驻无主之地（${free.name}）`);
    const g0 = sw.S.hold[free.id].g;
    ok(sw.holdAdd(free.id, 5) && sw.S.hold[free.id].g === g0 + 5, '增派五人');
    ok(sw.holdWithdraw(free.id, 5) && sw.S.hold[free.id].g === g0, '撤回五人');
    ok(sw.holdDrop(free.id), '弃守');
  }
  const foeHold = sw.holdCandidates(24).find((h) => h.owner && h.owner !== 'mysect');
  if (foeHold) {
    const w = sw.holdSeize(foeHold.id);
    ok(!!w, `强占${foeHold.name} → 与${foeHold.ownerName}开战`);
  }
  const ids = sw.sects('renjie').filter((s) => s !== 'mysect');
  ok(ids.length > 0, `本图 ${ids.length} 派`);
  const c1 = sw.canDeclare(ids[0]);
  ok(typeof c1.ok === 'boolean' && (c1.ok || !!c1.why), `宣战条件有说法（${c1.ok ? '可战' : c1.why}）`);
  const relWord = sw.relName('mysect', ids[0]);
  ok(['相安', '冷淡', '不睦', '对峙', '剑拔弩张'].includes(relWord), `与${sw.name(ids[0])}的关系：${relWord}`);

  const warPage = render('war');
  ok(has(warPage, '可调之兵') && has(warPage, '守御之策') && has(warPage, '据点'), '战事页：三块牌子 / 守御 / 据点');
  ok(has(warPage, '宣战'), '战事页：宣战区');
}

console.log('六、天下宗门');
{
  const sw = g.sectwar;
  const world = renderToString(React.createElement(SectPanel, { game: g, onClose() {}, initialTab: 'world' }));
  ok(world.length > 600, `天下宗门页渲染 ${world.length} 字符`);
  ok(has(world, '全部（') && has(world, '只看交战'), '筛选：份量 / 只看交战');
  const one = sw.sects('tiannan')[0];
  ok(has(world, sw.name(one)), `名录里能看见「${sw.name(one)}」`);
  ok(has(world, '宗法') && has(world, '据点'), '详情：宗法 / 据点');
  ok(has(world, 'sw-holds-inline'), '据点小签装在 flex 容器里（不随栏位撑满）');
  ok(has(world, '风声') || has(world, '已除名'), '原先只在玉符对话里的「风声 / 已除名」收进了这一页');
  ok(has(world, 'sw-subtabs') && has(world, '名录（'), '天下宗门分两页：名录 / 风声（风声是独立标签）');
  ok(Array.isArray(g.sectwar.hotPairs(20)), `风声数据可取：${g.sectwar.hotPairs(20).length} 对`);
  ok(has(world, '两派之间') && has(world, '声望'), '详情：两派之间的紧张度 + 与我的声望（不必再翻人脉录）');
  // 窄屏：名录固定高度自带滚动条，详情仍接在下面（一屏两边都看得见）
  (globalThis as any).window.innerWidth = 390;
  const worldNarrow = renderToString(React.createElement(SectPanel, { game: g, onClose() {}, initialTab: 'world' }));
  ok(has(worldNarrow, 'sect-list') && has(worldNarrow, 'sect-detail'), '窄屏：名录与详情同时在页（名录自己滚）');
  ok(has(worldNarrow, '本图') && has(worldNarrow, '全部（'), '窄屏：筛选与计数照常');
  (globalThis as any).window.innerWidth = 1280;
}

console.log('七、库房·收取供奉 / 老档缺字段 / 名册上限');
{
  const ms = g.ws.mySect!, S = g.mysect;
  // 库房：本月收支单（进项 → 归宗主 → 月例 → 冲关预算 → 结余）
  const v = render('vault');
  ok(has(v, '本月收支') && has(v, '库房结余'), '库房：有本月收支单与结余');
  ok(has(v, '归宗主') && has(v, '门人月例') && has(v, '本月冲关'), '库房：四笔（归宗主 / 月例 / 本月冲关）都列出来');
  // 没人够格冲关时，这一笔必须是 0——不能先把「用度上限」当支出扣掉
  const keepState = g.ws.mySect!.ds.map((d) => ({ d, stage: d.stage, exp: d.exp }));
  for (const { d } of keepState) { d.stage = 0; d.exp = 0; }
  const bt0 = g.mysect.btForecast();
  ok(bt0.ready === 0 && bt0.expect === 0, `没有够格的门人 → 本月冲关 0（ready ${bt0.ready} · expect ${bt0.expect}）`);
  const vNo = render('vault');
  ok(has(vNo, '这一笔不花'), '库里写明「眼下没人够格，这一笔不花」');
  for (const k of keepState) { k.d.stage = k.stage; k.d.exp = k.exp; }
  const si = g.sectwar.myMonthlyIncome();
  ok(si.holds >= 0 && si.branch >= 0 && si.vassal >= 0, `据点/分舵/附庸月入：${si.holds} / ${si.branch} / ${si.vassal}`);
  // 冲关用度该有 0% 一档；冲关资格该有四档（最后一档：天灵根或核心弟子以上）
  const ms2 = g.ws.mySect!;
  const rates: string[] = [];
  for (let i = 0; i < 8; i++) { const v = g.mysect.cycleRate(); rates.push(String(Math.round(v * 100))); }
  ok(rates.includes('0'), `冲关用度有 0% 档（切换经过：${rates.join(' → ')}）`);
  const rules: string[] = [];
  for (let i = 0; i < 6; i++) { const v = g.mysect.cycleRule(); rules.push(BT_RULE_TEXT[v]); }
  ok(rules.length && new Set(rules).size === 4, `冲关资格四档（${[...new Set(rules)].join(' / ')}）`);
  ok(rules.includes('天灵根或核心弟子以上'), '最后一档是「天灵根或核心弟子以上」');
  // 第四档：伪灵根外门不够格，天灵根够格
  while (BT_RULE_TEXT[ms2.btRule ?? 1] !== '天灵根或核心弟子以上') g.mysect.cycleRule();
  const pawn = { ...ms2.ds[0], root: 1, rank: 0 } as any, heaven = { ...ms2.ds[0], root: 5, rank: 0 } as any;
  ms2.ds.push(pawn, heaven);
  ok(!g.mysect.breakInfo(pawn).eligible && g.mysect.breakInfo(heaven).eligible, '第四档只放天灵根（或真传以上）进来');
  ms2.ds = ms2.ds.filter((d) => d !== pawn && d !== heaven);
  while (BT_RULE_TEXT[ms2.btRule ?? 1] !== '三灵根或内门以上') g.mysect.cycleRule();
  ok(has(v, '宗门用度'), '「宗主用度」已改名「宗门用度」');
  g.mysect.setOpen(false); g.mysect.setOpen(true);
  // 有供奉：按钮带金额，点一下真的进储物袋
  ms.tribute = 4321; ms.gifts = [];
  const before = C.bagCount(g.hero, 'mat_lingshi');
  const v1 = render('vault');
  ok(has(v1, '收取供奉') && has(v1, '4321'), '有供奉时按钮写明金额');
  const r1 = S.collect();
  ok(r1.stones === 4321 && C.bagCount(g.hero, 'mat_lingshi') === before + 4321, '收取供奉 → 灵石进储物袋');
  ok(S.collect().stones === 0, '收完再收不报错');
  // 无供奉：给一句话，而不是一颗「点了没反应」的灰按钮
  ms.tribute = 0; ms.gifts = [];
  const v2 = render('vault');
  ok(has(v2, '暂无待领供奉'), '无供奉时明说，而不是留一颗灰按钮');
  // 老档缺字段：进来不该整页抛错
  (ms as any).gifts = undefined; (ms as any).log = undefined; (ms as any).apps = undefined;
  ok(render('vault').length > 300 && render('overview').length > 300, '缺 gifts/log/apps 的老档照常渲染');
  ok(S.collect().stones === 0 && S.collect().gifts === 0, '缺 gifts 的老档收取不抛错');
  // 名册：灵根筛选 + 分页（不再截断前 N 名）
  const keep = ms.ds.slice();
  for (let i = 0; i < 160; i++) ms.ds.push({ id: 2000 + i, name: '门人' + i, sex: 'm', age: 25, root: 2 + (i % 4), realm: 1, stage: 2, exp: 0, loyal: 60, rank: 0, job: 'xiu', joined: 0, arts: 0 });
  const roster = render('roster');
  ok(has(roster, 'roster-filter') && has(roster, '灵根'), '名册：上方有灵根筛选');
  ok(['天灵根', '双灵根', '三灵根', '四灵根', '伪灵根'].every((r) => has(roster, r)), '名册：五等灵根都能筛');
  ok(has(roster, '下一页') && has(roster, '每页'), '名册：有分页（上一页 / 下一页）');
  ok(!has(roster, '列前'), '名册：不再截断前 N 名');
  ms.ds = keep;
}

  // 藏经阁：060 那套版式（统计三块 / 品阶页签 / 左四列格子 / 右详情 / 绿框已录）
  const lib = g.ws.mySect!;
  const keepLib = lib.lib.slice();
  if (!lib.lib.length) lib.lib = ['luoyan'];
  const lib1 = render('library');
  ok(has(lib1, 'lib-page') && has(lib1, 'lib-cols') && has(lib1, 'lib-detail'), '藏经阁：左四列格子 + 右详情（060 版式）');
  ok(has(lib1, '已收录') && has(lib1, '门人修炼加成') && has(lib1, '镇派心法'), '藏经阁：三块统计（收录进度 / 修炼加成 / 镇派心法）');
  ok(has(lib1, '只看未收录') && has(lib1, '凡阶') && has(lib1, '天阶'), '藏经阁：品阶页签 / 只看未收录');
  ok(/class="slot[^"]*\bon\b/.test(lib1), '藏经阁：选中的那一格有选中高亮（.slot.on）');
  ok(has(lib1, '已录入藏经阁：门人可修习'), '藏经阁：已收录的详情写明可修习');
  lib.lib = [];
  const lib2 = render('library');
  ok(has(lib2, '录入藏经阁（威望 +') && has(lib2, '耗法') && has(lib2, '冷却'), '藏经阁：未收录时详情里有录入按钮与数值');
  ok(!has(lib2, 'class="slot done"'), '藏经阁：没收录时格子不带 done 绿框');
  lib.lib = keepLib;

console.log('八、忠诚流水');
{
  const ms = g.ws.mySect!;
  const had = ms.ds.find((x) => x.loyalLog?.length);
  ok(!!had, '指点 / 赐丹 / 晋升这些动作都会留下忠诚流水');
  ok((had?.loyalLog?.[0]?.w ?? '').length > 0, `最近一条：${had?.loyalLog?.[0]?.w}（${had?.loyalLog?.[0]?.v}）`);
  ok(has(render('roster'), '忠诚近况'), '名册详情里有「忠诚近况」');
  const d2 = ms.ds.find((x) => x.exp < 0.5 && !g.mysect.breakInfo(x).bottleneck) ?? ms.ds[0];
  d2.t = undefined;
  const n0 = d2.loyalLog?.length ?? 0;
  g.mysect.guide(d2);
  ok(!!d2.loyalLog?.some((l) => l.w === '宗主亲自指点'), '指点后流水里出现「宗主亲自指点」');
  ok((d2.loyalLog?.length ?? 0) <= 5, `流水最多留 5 条（现 ${d2.loyalLog?.length ?? 0} 条，之前 ${n0} 条）`);
}

console.log('九、存档压缩（savezip）');
{
  const { Game: G } = await import('../src/world/game');
  const { unzipSave } = await import('../src/world/savezip');
  const plain = JSON.stringify({ v: 3, time: Date.now(), hero: g.hero, world: g.ws });
  ok(g.save(1), `存档一写入成功（明文约 ${plain.length} 字符）`);
  const raw = localStorage.getItem('fanren_save_1') ?? '';
  ok(raw.startsWith('z1:'), 'localStorage 里存的是压缩串（z1: 前缀）');
  const text = unzipSave(raw);
  ok(raw.length < text.length, `压缩后更短：${raw.length} < ${text.length}（约 ${((raw.length / text.length) * 100).toFixed(1)}%）`);
  const back = JSON.parse(text);
  ok(!!back.hero && !!back.meta, '解压回来是完整存档 JSON（hero / meta 都在）');
  const slots = G.listSlots();
  ok(slots[1] && !slots[1].empty && !!slots[1].realm, `存档列表仍读得出元信息：${slots[1]?.realm} · 第 ${slots[1]?.year} 年`);
  ok(!!G.latestSlot(), `latestSlot 能从压缩档里挑出最近一份：${G.latestSlot()}`);
  ok(g.load('fanren_save_1') !== false, 'load 能直接读压缩档');
}

console.log('十、存档失败的原因分得清');
{
  const ls = (globalThis as any).localStorage;
  const realSetItem = ls.setItem;
  const realWarn = console.warn;
  const failWith = (name: string, code?: string) => {
    ls.setItem = () => { const e: any = new Error('boom'); e.name = name; if (code) e.code = code; throw e; };
    console.warn = () => {};                    // game.save 失败会 warn，这里只测分类，不刷屏
    const r = g.save(1);
    const info = { ok: r, err: g.saveLastError, text: g.saveFailText() };
    ls.setItem = realSetItem; console.warn = realWarn;
    return info;
  };
  const q = failWith('QuotaExceededError', '22');
  ok(!q.ok && q.err === 'quota' && /存储已满/.test(q.text), `配额满 → ${q.text}`);
  const de = failWith('SecurityError');
  ok(!de.ok && de.err === 'denied' && /禁用/.test(de.text), `无存储权限 → ${de.text}`);
  const se = failWith('TypeError');
  ok(!se.ok && se.err === 'serialize' && /序列化/.test(se.text), `序列化失败 → ${se.text}`);
  ok(g.save(1) && g.saveLastError === '', '写成功时 saveLastError 归零');
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
