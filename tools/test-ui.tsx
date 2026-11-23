// 界面 SSR 冒烟：渲染各类弹窗，确保不抛异常
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const React = await import('react');
const { renderToString } = await import('react-dom/server');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOC_BY_ID } = await import('../src/data/world');
const { ModalLayer } = await import('../src/ui/ModalLayer');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const C = await import('../src/world/cultivation');
C.addItem(g.hero, 'mat_lingshi', 3000); C.addItem(g.hero, 'herb_lingzhi', 3, 40);
g.day = 85;
const r = (label: string) => { const html = renderToString(React.createElement(ModalLayer, { game: g })); console.log(label, html.length); };
g.openModal({ kind: 'town', loc: LOC_BY_ID.get('yuejing')! }); r('town');
g.openShop(g.towns.shop(LOC_BY_ID.get('yuejing')!, 'artifact')); r('shop');
g.closeModal(true); g.openModal({ kind: 'auction', loc: LOC_BY_ID.get('yuejing')! }); r('auction');
g.closeModal(true); g.hearts.talk('ziling'); r('dialog');
g.closeModal(true); g.openModal({ kind: 'hearts' }); r('hearts');
g.closeModal(true); g.openModal({ kind: 'chronicle' }); r('chron');
g.closeModal(true); g.openModal({ kind: 'town', loc: LOC_BY_ID.get('huangfeng')! }); r('sect-town');
g.openDialog(g.towns.sectNode(LOC_BY_ID.get('huangfeng')!)); r('sect');
// 收官 C（甲）：储物袋（新 Inventory，DNF 式）——各类物品与装备都塞一点，穿上几件再渲染
{
  g.closeModal(true);
  for (const id of ['gear_crown_2', 'gear_xg_belt', 'gear_bs_wrist', 'art_huanglin', 'art_lvhuang', 'pill_juling', 'scroll_leidian', 'tal_thunder', 'egg_huli']) C.addItem(g.hero, id, 1);
  C.wearGear(g.hero, g.hero.bag.find((b) => b.id === 'gear_xg_belt')!); C.bindBond(g.hero, 'art_lvhuang'); g.hero.hotbar[6] = 'pill:pill_juling';
  const { Inventory } = await import('../src/ui/Inventory');
  const html = renderToString(React.createElement(Inventory, { game: g, onClose() {} }));
  console.log('bag', html.length);
  if (!html.includes('modal-mask') || !html.includes('scroll-panel') || !html.includes('close-btn') || !html.includes('panel-head') || !html.includes('tabs') || !html.includes('slot')) { console.error('储物袋缺了模组皮肤认的旧类名'); process.exit(1); }
  if (!html.includes('data-drop="slot:weapon"') || !html.includes('inv-eq wpn')) { console.error('储物袋缺了兵器槽'); process.exit(1); }
  // 近战兵器线：兵器槽空着、本命是飞剑——槽里淡淡显出那口剑；穿上一把剑后槽里是那把剑、详情卡写着单手 / 双手
  if (!html.includes('inv-eq-ghost')) { console.error('兵器槽空着时没显出本命飞剑'); process.exit(1); }
  C.addItem(g.hero, 'wpn_spear_3', 1); C.wearGear(g.hero, g.hero.bag.find((b) => b.id === 'wpn_spear_3')!);
  const html2 = renderToString(React.createElement(Inventory, { game: g, onClose() {} }));
  if (!/inv-eq wpn full t3/.test(html2)) { console.error('穿上的兵器没进兵器槽'); process.exit(1); }
  const { ItemCard } = await import('../src/ui/Inventory');
  const card = renderToString(React.createElement(ItemCard, { game: g, id: 'wpn_heavy_4', b: undefined }));
  if (!card.includes('双手') || !card.includes('重兵')) { console.error('兵器详情卡没写种类和握法'); process.exit(1); }
  C.addItem(g.hero, 'wpn_spear_5', 1); const sp5 = g.hero.bag.find((b) => b.id === 'wpn_spear_5')!;
  const card2 = renderToString(React.createElement(ItemCard, { game: g, id: 'wpn_spear_5', b: sp5 }));
  if (!card2.includes('inv-cmp') || !card2.includes('紫电游龙枪')) { console.error('兵器详情卡没和身上那把对比'); process.exit(1); }
  console.log('bag weapon slot ok');
}
// 收官 H1（甲）：十几个卷轴式面板换成界面底座的外壳（LqPanel），模组皮肤认的旧类名都还在；收官 D：个人摊位窗口
{
  g.closeModal(true);
  const need = (label: string, html: string, cls: string[]) => { for (const c of cls) if (!html.includes(c)) { console.error(`${label}：缺了旧类名 ${c}`); process.exit(1); } if (!html.includes('lq-modal')) { console.error(`${label}：没换成新外壳`); process.exit(1); } };
  const SHELL = ['modal-mask', 'scroll-panel', 'panel-head', 'panel-title', 'close-btn'];
  const el = (C: any, p: any = {}) => renderToString(React.createElement(C, { game: g, onClose() {}, ...p }));
  const CP = await import('../src/ui/CultPanels');
  const { SkillPanel } = await import('../src/ui/CombatUI');
  const { ZhenfaPanel } = await import('../src/ui/ZhenfaPanel');
  const { FriendsPanel } = await import('../src/ui/FriendsPanel');
  const { CloudPanel } = await import('../src/ui/CloudPanel');
  const { KeyBindPanel } = await import('../src/ui/KeyBind');
  const { ModPanel } = await import('../src/ui/ModPanel');
  const { SettingsPanel } = await import('../src/ui/Panels');
  const panels: [string, string, string[]][] = [
    ['char', el(CP.CharPanel), [...SHELL, 'cult-body', 'cult-panel']],
    ['alchemy', el(CP.AlchemyPanel), [...SHELL, 'cult-body', 'tabs']],
    ['seclude', el(CP.SecludePanel), [...SHELL, 'cult-body', 'sec-opt']],
    ['save', el(CP.SavePanel), [...SHELL, 'cult-body', 'slot-row']],
    ['skills', el(SkillPanel), [...SHELL, 'cult-body', 'tabs', 'skill-row']],
    ['zhenfa', el(ZhenfaPanel), [...SHELL, 'cult-body']],
    ['friends', el(FriendsPanel), [...SHELL, 'cult-body', 'tabs']],
    ['cloud', el(CloudPanel), [...SHELL, 'cult-body']],
    ['keybind', el(KeyBindPanel), [...SHELL, 'ink-btn']],
    ['mods', el(ModPanel), [...SHELL, 'cult-body', 'tabs']],
    ['settings', el(SettingsPanel), [...SHELL, 'switch', 'settings', 'keys-help']],
  ];
  for (const [label, html, cls] of panels) { need(label, html, cls); console.log(label, html.length); }
  const modal = (m: any, label: string, cls: string[]) => { g.closeModal(true); g.openModal(m); const html = renderToString(React.createElement(ModalLayer, { game: g })); need(label, html, cls); console.log(label, html.length); return html; };
  modal({ kind: 'town', loc: LOC_BY_ID.get('yuejing')! }, 'town2', [...SHELL, 'cult-body', 'town-fac']);
  g.closeModal(true); g.openShop(g.towns.shop(LOC_BY_ID.get('yuejing')!, 'pill')); { const html = renderToString(React.createElement(ModalLayer, { game: g })); need('shop2', html, [...SHELL, 'shop-row', 'ink-btn', 'tabs']); }
  modal({ kind: 'relations' }, 'relations', [...SHELL, 'tabs']);
  // r20：人脉录重做——默认第一页是亲族关系树；有师父、义兄、仇家时各成一组，没有的关系不画；只有「对方对你」一排心灯
  {
    const ppl = g.npcs.list.filter((d) => d.alive && d.realm > 0 && !d.beauty && !d.bond).slice(0, 4);
    const [m, s, f] = ppl; const bak = ppl.map((d) => ({ bond: d.bond, met: d.met, favor: d.favor, grudge: d.grudge }));
    m.bond = 'master'; m.met = true; m.favor = 80; s.bond = 'sworn'; s.met = true; s.favor = 70; f.grudge = 2; f.favor = -90; f.met = true;
    const html = modal({ kind: 'relations' }, 'relations-tree', [...SHELL, 'tabs', 'rm-scroll', 'rm-rod', 'rm-hero']);
    for (const t of ['>师父<', '>义兄弟姐妹<', '>死敌<', 'rm-lamps', 'rm-badge', m.name, s.name, f.name]) if (!html.includes(t)) { console.error('人脉录关系树缺了 ' + t); process.exit(1); }
    if (html.includes('>徒弟<') || html.includes('>伴侣<')) { console.error('人脉录关系树画了不存在的关系'); process.exit(1); }
    ppl.forEach((d, i) => Object.assign(d, bak[i]));
  }
  const help = modal({ kind: 'help' }, 'help', [...SHELL, 'tabs', 'keys-help']);
  if (/>H<\/kbd> 红颜录|>I<\/kbd> 衣橱/.test(help)) { console.error('修仙指南里还有过时的键位'); process.exit(1); }
  modal({ kind: 'hearts' }, 'hearts2', SHELL); modal({ kind: 'chronicle' }, 'chron2', SHELL);
  // 窄屏（手机竖屏）也渲染一遍
  (globalThis as any).window.innerWidth = 390; (globalThis as any).window.innerHeight = 844;
  need('char-narrow', el(CP.CharPanel), SHELL);
  // 摊位
  const loc = LOC_BY_ID.get('yuejing')!; const S = g.stall;
  const d = g.npcs.list.find((x) => x.alive && x.realm >= 1 && (x.faction === 'rogue' || x.faction === 'merchant'))!;
  S.invite(d, loc);
  for (const w of ['wide', 'tall', 'land'] as const) {
    (globalThis as any).window.innerWidth = w === 'tall' ? 390 : w === 'land' ? 844 : 1600; (globalThis as any).window.innerHeight = w === 'tall' ? 844 : w === 'land' ? 390 : 900;
    g.closeModal(true); S.open(d);
    const html = renderToString(React.createElement(ModalLayer, { game: g }));
    if (!html.includes('个人摊位') || !html.includes('stl-grid') || !html.includes('lq-cell') || html.includes('wb-')) { console.error('摊位窗口没渲染出来（或用了全局 .wb-* 类名）'); process.exit(1); }
    console.log('stall-' + w, html.length);
  }
}
// 收官 H2（甲）：对话框新画风——模组对话节点的 portrait / mood / title / tone / hint 都得照常显示；不可选的有「锁」；旧类名都在
{
  (globalThis as any).window.innerWidth = 1600; (globalThis as any).window.innerHeight = 900;
  const fail = (m: string) => { console.error('对话框：' + m); process.exit(1); };
  for (const mood of ['normal', 'love', 'danger', 'mystic'] as const) {
    g.closeModal(true);
    g.openDialog({ speaker: '模组人物', title: '模组称谓·结丹', portrait: 'data:image/png;base64,AAAA', mood, text: '模组对话正文',
      options: [{ label: '选项甲', tone: 'love', hint: '模组提示甲', act: () => null }, { label: '选项乙', disabled: true, hint: '修为不足', act: () => null }, { label: '选项丙', tone: 'gold', act: () => null }] } as any);
    const html = renderToString(React.createElement(ModalLayer, { game: g }));
    for (const c of ['dlg-mask', 'dlg dialog', 'dlg-face', 'dlg-portrait', 'dlg-head', 'dlg-name', 'dlg-title', 'dlg-text']) if (!html.includes(c)) fail(`缺了类名 ${c}（${mood}）`);
    if (!html.includes(' ' + mood)) fail('mood 没挂到卡片上：' + mood);
    if (!html.includes('模组人物') || !html.includes('模组称谓·结丹') || !html.includes('data:image/png;base64,AAAA')) fail('speaker / title / portrait 没显示');
    // 打字机：SSR 时 shown=0，选项还没出来；正文先空着、带着光标
    if (!html.includes('dlg-caret')) fail('打字机光标没出来');
  }
  // 选项（打字完以后才出）：用 DialogBox 的完成态——直接渲染一遍静态的选项列表检查 tone / hint / disabled 的长相
  const { DialogOptions } = await import('../src/ui/ModalLayer');
  const oh = renderToString(React.createElement(DialogOptions, { pick() {}, options: [{ label: '选项甲', tone: 'love', hint: '模组提示甲', act: () => null }, { label: '选项乙', disabled: true, hint: '修为不足', act: () => null }, { label: '选项丙', tone: 'gold', act: () => null }] as any }));
  if (!oh.includes('dlg-opt love') || !oh.includes('dlg-opt gold') || !oh.includes('dlg-opt off') || !oh.includes('disabled=""')) fail('选项的 tone / disabled 没挂上');
  if (!oh.includes('模组提示甲') || !oh.includes('修为不足') || !oh.includes('>锁<') || !oh.includes('>1<') || !oh.includes('>3<')) fail('hint 灰字、数字键号、「锁」字没显示');
  const { DeathScreen } = await import('../src/ui/CultPanels');
  const dh = renderToString(React.createElement(DeathScreen, { game: g, onExit() {} }));
  if (!dh.includes('class="death"') || !dh.includes('d-title') || !dh.includes('ink-btn')) fail('坐化界面没渲染出来');
  console.log('dialog-moods ok, death', dh.length);
}
// 收官 H3（甲）：主界面——电脑、手机横屏、手机竖屏三种都渲染一遍；触屏判定可以跟着变（?touch=1 / 0 调试开关 + recheckTouch）；
// 各区都在、模组皮肤认的旧类名都在、键位从 keymap 取（「更多」抽屉的键可改）
{
  const fail = (m: string) => { console.error('主界面：' + m); process.exit(1); };
  const T = await import('../src/core/touch');
  const { GameView } = await import('../src/ui/GameView');
  const { setQuestEntries } = await import('../src/ui/questSlot');
  const { bindOf } = await import('../src/core/keymap');
  g.closeModal(true); g.updateUI(true);
  if (bindOf('hudmore') !== '\\') fail('「更多」抽屉的默认键不对：' + bindOf('hudmore'));
  setQuestEntries('guide', [{ key: 'next', kind: 'guide', title: '下一步：去坊市看看', text: '梁京东市', progress: '0/1' }]);
  const shot = (w: number, h: number, touch: '1' | '0') => {
    (globalThis as any).window.innerWidth = w; (globalThis as any).window.innerHeight = h;
    (globalThis as any).location = { search: '?touch=' + touch };
    T.recheckTouch();
    if (T.IS_TOUCH !== (touch === '1')) fail(`触屏判定没跟着变（${w}×${h} touch=${touch}）`);
    return renderToString(React.createElement(GameView, { game: g, onExit() {} }));
  };
  let changed = 0; const un = T.subscribeTouch(() => changed++);
  const pc = shot(1600, 900, '0'), land = shot(844, 390, '1'), tall = shot(390, 844, '1'), back = shot(1600, 900, '0');
  un();
  if (changed < 2) fail('触屏状态变了却没通知订阅者');
  for (const [label, html] of [['电脑', pc], ['横屏', land], ['竖屏', tall]] as [string, string][]) {
    for (const z of ['tl', 'lc', 'top', 'tr', 'bl', 'bc', 'br']) if (!html.includes(`data-hz="${z}"`)) fail(`${label}：缺了区 ${z}`);
    for (const c of ['char-card', 'bar hp', 'bar mp', 'bar exp', 'date-box', 'minimap-wrap', 'quest-col', 'qc-slot k-guide', 'hotbar', 'hb-slot', 'round-btn']) if (!html.includes(c)) fail(`${label}：缺了 ${c}`);
    if (!html.includes('下一步：去坊市看看')) fail(label + '：任务列插槽里的条目没显示');
    if (html.includes('wb-')) fail(label + '：用了全局 .wb-* 类名');
  }
  if (!pc.includes('game-root') || pc.includes('game-root touch')) fail('电脑版挂了 touch 类');
  for (const c of ['action-bar ring', 'btn-grid', 'ring-core', 'help-hint', 'help-tip', '更多']) if (!pc.includes(c)) fail('电脑：缺了 ' + c);
  if (pc.includes('joystick') || pc.includes('touch-side') || pc.includes('lock-btn')) fail('电脑版出现了摇杆 / 手机侧边按钮 / 「锁」');
  for (const [label, html] of [['横屏', land], ['竖屏', tall]] as [string, string][]) {
    if (!html.includes('game-root touch')) fail(label + '：.game-root 没挂 touch');
    for (const c of ['joystick', 'touch-side', 'dock-main', 'hotbar pad', 'lock-btn']) if (!html.includes(c)) fail(`${label}：缺了 ${c}`);
    if (html.includes('action-bar ring')) fail(label + '：手机上不该有电脑的一圈按钮');
  }
  if (back.includes('game-root touch')) fail('接回鼠标（touch=0）后没切回电脑布局');
  // 抽屉清单：电脑「更多」与手机菜单共用一份，模组按钮挂 .round-btn.mod-btn（这里没装模组，只查原版的几项）
  const { drawerItems } = await import('../src/ui/Hud');
  const items = drawerItems(g, g.ui, () => {}, false).map((b) => b.k), titems = drawerItems(g, g.ui, () => {}, true).map((b) => b.k);
  for (const k of ['zhenfa', 'alchemy', 'seclude', 'wardrobe', 'friends', 'relations', 'chronicle', 'war', 'settings', 'help']) if (!items.includes(k)) fail('「更多」抽屉缺了 ' + k);
  for (const k of ['char', 'bag', 'skills', 'map', 'fly', 'sit', 'cloud']) if (!titems.includes(k)) fail('手机菜单缺了 ' + k);
  setQuestEntries('guide', null);
  (globalThis as any).location = { search: '' }; T.recheckTouch();
  console.log('hud pc/land/tall ok', pc.length, land.length, tall.length);
}
// 收官 H4（甲）：开局流程——标题页（模组契约：.title-menu > button.menu-btn、「继续仙途」、以「模组」开头的按钮）、各子弹窗、开场字幕、加载画面
{
  const fail = (m: string) => { console.error('开局流程：' + m); process.exit(1); };
  (globalThis as any).window.innerWidth = 1600; (globalThis as any).window.innerHeight = 900;
  const Tt = await import('../src/ui/Title');
  const html = renderToString(React.createElement(Tt.TitleScreen, { onNew() {}, onContinue() {}, onLoadKey() {}, hasSave: true }));
  const menu = html.match(/<nav class="title-menu">([\s\S]*?)<\/nav>/)?.[1] ?? '';
  if (!menu) fail('没有 .title-menu');
  const btns = [...menu.matchAll(/<button class="menu-btn[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/[\s　\d]/g, ''));
  if (!btns.includes('继续仙途')) fail('没有文字为「继续仙途」的 .menu-btn：' + btns.join('、'));
  if (!btns.some((b) => b.startsWith('模组'))) fail('没有以「模组」开头的 .menu-btn');
  if ((menu.match(/<button/g) ?? []).length !== btns.length) fail('.title-menu 下有不是 .menu-btn 的按钮');
  for (const c of ['title-screen', 'title-logo', 'tt-scene', 'tt-far', 'tt-near', 'tt-hero', 'title-qq', 'title-footer', 'seal']) if (!html.includes(c)) fail('标题页缺了 ' + c);
  if (!html.includes('万民卷宗')) fail('标题页缺了「万民卷宗」入口');
  const steles = [{ id: 's1', name: '苏寒', tier: 'tiandao', age: 88, realm: '结丹初期', year: 12, killer: '墨蛟', place: '沧溟海', bio: ['生平一'], notes: ['随笔一'], legacy: { stones: 30, items: [{ id: 'x', n: 1 }] }, taken: false } as any];
  const sub: [string, string, string[]][] = [
    ['立道心', renderToString(React.createElement(Tt.DaoPick, { cur: 'taixu', hasSave: true, steles, onPick() {}, onClose() {} })), ['tt-dao-card', '天骄', '凡人', '天道', '立此道心', '覆盖']],
    ['碑林', renderToString(React.createElement(Tt.Steles, { steles, onClose() {} })), ['tt-stele', '之碑', '仍在凶手处']],
    ['关于', renderToString(React.createElement(Tt.About, { onClose() {} })), ['tt-about-sec', '入门一课']],
    ['QQ 群', renderToString(React.createElement(Tt.QQ, { onClose() {} })), ['qq-code', '1130830973']],
  ];
  for (const [label, h, cls] of sub) {
    for (const c of ['lq-modal', 'modal-mask', 'scroll-panel', ...cls]) if (!h.includes(c)) fail(`${label}：缺了 ${c}`);
    console.log('title-' + label, h.length);
  }
  const { CloudPanel } = await import('../src/ui/CloudPanel');
  const ch = renderToString(React.createElement(CloudPanel, { onClose() {}, onLoaded() {} }));
  if (!ch.includes('从卷宗取回一世') || ch.includes('存入卷宗')) fail('标题页的万民卷宗应只有「取回」');
  const { Intro } = await import('../src/ui/Intro');
  const ih = renderToString(React.createElement(Intro, { onDone() {} }));
  for (const c of ['intro', 'intro-line', 'intro-bottle', 'intro-skip', 'intro-dots']) if (!ih.includes(c)) fail('开场字幕缺了 ' + c);
  const { Loading } = await import('../src/ui/App');
  const lh = renderToString(React.createElement(Loading, { msg: '研墨铺纸…', p: 0.4 }));
  if (!lh.includes('loading') || !lh.includes('scaleX(0.400)') || !lh.includes('loading-tip')) fail('加载画面：进度条应是 scaleX、要有小贴士');
  // r10：御剑穿云——远山、两层云带、御剑的人、风线、阶段文字、灵气头；淡出时带 .out
  for (const c of ['ld-far', 'c-back', 'c-front', 'ld-hero', 'ld-trail', 'ld-wind', 'ld-msg', 'ld-head', 'tt-corner', 'role="progressbar"', 'aria-valuenow="40"']) if (!lh.includes(c)) fail('加载画面缺了 ' + c);
  if (!renderToString(React.createElement(Loading, { msg: '云开雾散…', p: 1, out: true })).includes('class="loading out"')) fail('加载画面淡出时应带 .out');
  for (const [w, hh] of [[844, 390], [390, 844]]) { (globalThis as any).window.innerWidth = w; (globalThis as any).window.innerHeight = hh; const x = renderToString(React.createElement(Tt.TitleScreen, { onNew() {}, onContinue() {}, hasSave: false })); if (!x.includes('menu-btn')) fail('手机尺寸标题页没渲染出来'); }
  (globalThis as any).window.innerWidth = 1600; (globalThis as any).window.innerHeight = 900;
  console.log('title ok', html.length, ih.length, lh.length);
}
// 收官 I（甲）：新手引导的画面层（Coach）挂在主界面里：上课时有气泡、步骤、跳过；层级 62 低于模组界面
{
  const fail = (m: string) => { console.error('新手引导：' + m); process.exit(1); };
  const { GameView } = await import('../src/ui/GameView');
  g.closeModal(true); g.tutorial.begin(); g.tutorial.tick(0.2);
  const html = renderToString(React.createElement(GameView, { game: g, onExit() {} }));
  for (const c of ['class="coach on"', 'coach-bub', 'coach-title', '行走与镜头', '跳过引导', 'coach-dim', 'coach-ring', 'coach-edge']) if (!html.includes(c)) fail('缺了 ' + c);
  if (!html.includes('下一步：行走与镜头')) fail('任务列里没有「下一步」');
  const css = (await import('node:fs')).readFileSync(new URL('../src/ui/coach.css', import.meta.url), 'utf8');
  const z = +(css.match(/\.coach \{[^}]*z-index: (\d+)/)?.[1] ?? 0);
  if (!(z > 55 && z < 70)) fail('引导层的 z-index 应在对话框（55）之上、模组界面（70）之下：' + z);
  g.tutorial.skip(); g.tutorial.tick(0.2);
  const h2 = renderToString(React.createElement(GameView, { game: g, onExit() {} }));
  if (h2.includes('coach-bub')) fail('跳过以后气泡还在');
  console.log('coach ok', html.length);
}
console.log('界面冒烟：全部通过');
