// v0.73 Phase 5 专项验收：UI 精简去重、SectPanel 5 栏目收敛、全局天下宗门、批量买卖与批量炼丹/战备捐献
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
const { GameView } = await import('../src/ui/GameView');
const { ModalLayer } = await import('../src/ui/ModalLayer');
const { SectPanel } = await import('../src/ui/SectPanel');
const { AlchemyPanel } = await import('../src/ui/CultPanels');
const { LOC_BY_ID } = await import('../src/data/world');
const { RECIPES } = await import('../src/data/recipes');
const C = await import('../src/world/cultivation');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);

console.log('=== 一、UI 入口精简去重（江湖人物 + 全局天下宗门 + 快捷键） ===');
{
  // GameView 右侧按钮格：已合并友人/人脉/道侣为「人物」，不再单独挂「友人」「人脉」「道侣」按钮
  const gvHtml = renderToString(React.createElement(GameView, { game: g, onExit() {} }));
  ok(gvHtml.includes('众<small>人物</small>'), '主 HUD 右侧合并为单一「人物」入口');
  ok(!gvHtml.includes('<small>友人</small>') && !gvHtml.includes('<small>人脉</small>'), '主 HUD 不再重复出现「友人」「人脉」按钮');
  ok(gvHtml.includes('宗<small>天下</small>'), '未立派时主 HUD 宗门入口直标「天下」（全局可开）');

  // 统一「江湖人物」Modal（支持同行知交默认页 tab: 'party' 及全览页）
  g.openModal({ kind: 'relations', tab: 'party' });
  ok(g.modal?.kind === 'relations' && (g.modal as any).tab === 'party', '江湖人物可直达同行知交页（H 键同源）');
  const relPartyHtml = renderToString(React.createElement(ModalLayer, { game: g }));
  ok(relPartyHtml.includes('江湖人物') && relPartyHtml.includes('同行') && relPartyHtml.includes('知交') && relPartyHtml.includes('各派声望'), '江湖人物面板包含同行/知交/亲友/仇敌/各派声望');
  ok(relPartyHtml.includes('>江湖传言<'), '江湖人物面板保留「江湖传言」标签放回原位');
  g.closeModal();
  g.openModal({ kind: 'relations', tab: 'world' });
  const relWorldHtml = renderToString(React.createElement(ModalLayer, { game: g }));
  ok(relWorldHtml.includes('live-chron'), '「江湖传言」页签正确渲染 WorldChronicle 众生传闻流');
  g.closeModal();
  g.openModal({ kind: 'relations', tab: 'sect' });
  const relSectHtml = renderToString(React.createElement(ModalLayer, { game: g }));
  ok(relSectHtml.includes('天下宗门 &amp; 战事') || relSectHtml.includes('天下宗门 & 战事'), '各派声望页提供直达「天下宗门 & 战事」按钮');

  g.closeModal();
  g.openModal({ kind: 'relations' });
  ok(g.modal?.kind === 'relations' && !(g.modal as any).tab, '江湖人物默认全览页正常开启（N 键同源）');
  g.closeModal();
}

console.log('=== 二、未立派可看「天下宗门 & 战事」 + SectPanel 拆回「亲卫随心」与「宗门战事」6 栏目 ===');
{
  ok(!g.ws.mySect, '此时尚未开宗立派');
  const worldNoSect = renderToString(React.createElement(SectPanel, { game: g, initialTab: 'world', onClose() {} }));
  ok(worldNoSect.includes('天下宗门 &amp; 战事') || worldNoSect.includes('天下宗门 & 战事'), '未立派亦可打开「天下宗门 & 战事」');
  ok(worldNoSect.includes('战备') && worldNoSect.includes('疗伤丹'), '天下宗门详情展示各派战备物资（丹药/灵石/阵材）');

  const hf = LOC_BY_ID.get('huangfeng')!;
  g.hero.realm = 4; g.hero.stage = 0;
  (g.ws as any).mySect = {
    name: '太虚门', dao: 'zheng', map: 'tiannan', x: hf.x + 14, y: hf.y + 10, founded: 0,
    fame: 700, stones: 300000, tribute: 0, ds: [], seq: 1, apps: [], lib: [], gf: g.hero.gongfa,
    halls: { lib: 1, dan: 1, zhen: 1, ling: 1 }, open: true, minRoot: 2, auto: false,
    lastM: Math.floor(g.day / 30), lastTeach: -999, log: [], gifts: [], wins: 0, losses: 0,
  };
  g.mysect.sync();

  const mineHtml = renderToString(React.createElement(SectPanel, { game: g, onClose() {} }));
  const navMatch = mineHtml.match(/<div class="sect-nav">([\s\S]*?)<\/div>/);
  const btnCount = navMatch ? (navMatch[1].match(/<button/g)?.length ?? 0) : 0;
  ok(btnCount === 6, `SectPanel 左侧导航已拆分为 6 个独立栏目（实测 ${btnCount} 个）`);
  ok(['山门概览', '门人调遣', '藏经自创', '基建库房', '亲卫随心', '宗门战事'].every((t) => mineHtml.includes(t)), '6 大核心栏目（含独立「亲卫随心」「宗门战事」）齐备');
}

console.log('=== 三、坊市批量买卖（×1 / ×5 / ×10 / 全买·全卖） ===');
{
  const tn = LOC_BY_ID.get('tainan')!;
  const shop = g.towns.shop(tn, 'pill');
  const stock = shop.stock.find((s) => s.n >= 5) ?? shop.stock[0];
  ok(!!stock, `坊市有可批量购入商品（${stock?.id} 余 ${stock?.n}）`);
  const buyN = Math.min(5, stock.n);
  stock.n = Math.max(stock.n, 12);
  C.addItem(g.hero, 'mat_lingshi', stock.price * 20);
  const stonesBefore = C.bagCount(g.hero, 'mat_lingshi');
  const bagBefore = C.bagCount(g.hero, stock.id);

  // ShopPanel 渲染批量买入按钮（在批量购买库存尚足时检查）
  g.openModal({ kind: 'shop', shop });
  const shopHtml = renderToString(React.createElement(ModalLayer, { game: g }));
  ok(shopHtml.includes('×5') && shopHtml.includes('全买'), 'ShopPanel 买入区渲染「×5」「全买」批量按钮');
  g.closeModal();

  ok(g.towns.buy(shop, stock, 5), 'towns.buy(shop, stock, 5) 批量买入成功');
  ok(C.bagCount(g.hero, stock.id) === bagBefore + 5, `背包物品精确 +5（${bagBefore} -> ${C.bagCount(g.hero, stock.id)}）`);
  ok(C.bagCount(g.hero, 'mat_lingshi') === stonesBefore - stock.price * 5, '灵石精确扣除 5 倍单价');

  // 批量卖出测试
  const sellPrice = g.towns.sellPrice(shop, stock.id);
  const stonesBeforeSell = C.bagCount(g.hero, 'mat_lingshi');
  ok(g.towns.sell(shop, stock.id, undefined, 5), 'towns.sell(shop, id, undefined, 5) 批量卖出成功');
  ok(C.bagCount(g.hero, stock.id) === bagBefore, '批量卖出后背包数量精确扣回');
  ok(C.bagCount(g.hero, 'mat_lingshi') === stonesBeforeSell + sellPrice * 5, '批量卖出灵石精确入袋 5 倍');
  void buyN;
}

console.log('=== 四、批量炼丹 & 战备批量捐献 ===');
{
  const juqi = RECIPES.find((r) => r.id === 'pill_juqi') ?? RECIPES[0];
  for (const inp of juqi.inputs) C.addItem(g.hero, inp.id, inp.n * 10);
  const alchHtml = renderToString(React.createElement(AlchemyPanel, { game: g, onClose() {} }));
  ok(alchHtml.includes('×5') && alchHtml.includes('×10') && alchHtml.includes('全炼'), 'AlchemyPanel 渲染「×5」「×10」「全炼」批量炼丹按钮');
  ok(alchHtml.includes('战备捐献'), 'AlchemyPanel 渲染「战备捐献」标签');

  // 战备批量捐献
  C.addItem(g.hero, 'pill_liaoshang', 12);
  const pillBeforeDonate = C.bagCount(g.hero, 'pill_liaoshang');
  g.ws.sect = { id: 'huangfeng', rank: 1, contrib: 0, joined: 0 };
  const merit0 = g.war.merit;
  const sp0 = g.sectwar.supplyOf('huangfeng').pills;
  const dRes = g.sectwar.donateSupply('huangfeng', 'pill_liaoshang', 5);
  ok(dRes.ok && dRes.count === 5 && dRes.merit > 0 && dRes.contrib > 0, `批量捐献疗伤丹 ×5 成功：战功 +${dRes.merit}，贡献 +${dRes.contrib}`);
  ok(C.bagCount(g.hero, 'pill_liaoshang') === pillBeforeDonate - 5, '捐献后储物袋精确扣除 5 瓶');
  ok(g.war.merit === merit0 + dRes.merit, '战功精确累加');
  ok(g.sectwar.supplyOf('huangfeng').pills > sp0, '受捐宗门战备丹药库精确增加');
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
