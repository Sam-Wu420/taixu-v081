// 天工试场的界面（1.3）：参照 Garry's Mod 的刷物菜单（Q 菜单），换成水墨画风。
//  · 左：法宝匣——顶部一排标签；左边目录树（搜索、收藏、最近、原版按种类/五行/品阶、模组各一节）；中间图标格；左下生成选项。
//  · 右：工具面板——工具 / 模组 / 设置；快速过滤；工具按类分组（模组的工具各成一组）；选中工具，下面是它的参数（「属性」工具就是属性表）。
//  · 上：阵枢——计时、暂停单步、倍速、撤销、收起、出阵。
// 游戏始终看得见：两块面板都能收成一条边；窄屏时一次只开一块。
// 1.3.7 手机：
//  · 顶栏占住主界面「顶栏堆叠」（.hz-top）最上面一格，首领条、锁定目标条排在它下面，不再互相盖住（电脑、手机都是）；
//  · 触屏时顶栏缩成一枚小药丸（试 · 匣 · 具 · 暂停 · 更多），「更多」展开整条；
//  · 法宝匣、工具面板默认收起，点「匣」「具」展开成抽屉（竖屏是底部弹出），用完自动收起；
//  · 落子、点选类工具在底部出一条操作条，带明显的「取消 / 完成」；长按条目改数据；属性表的数字点一下弹输入框。
import { css } from './style.js';
import { FACETS } from './catalog.js';

const WEATHER = [[null, '常', '天时自转'], ['clear', '晴', '晴'], ['rain', '雨', '雨'], ['storm', '雷', '雷雨'], ['snow', '雪', '雪'], ['fog', '雾', '雾'], ['sand', '沙', '风沙']];
const SPEEDS = [0.25, 0.5, 1, 2, 4];
const SCENES = [['duel', '斗法试场', '三名同境修士，试试法术连招'], ['dummy', '木桩阵', '五具不还手的木桩，量每秒伤害'], ['tide', '妖兽潮', '十六只妖兽四面围来'], ['war', '两军对垒', '四十对四十，压力测试'], ['war1000', '千人混战', '五百友方修士对五百敌方修士，筑基中期'], ['guard', '护法', '四名友方修士随行'], ['home', '回到阵心', '传回入阵的位置']];
const QUIET = [['noSpawn', '不刷野怪'], ['noNpc', '不来路人']];
const RULES = [['god', '无敌', '不受任何伤害'], ['lock', '锁住气血', '气血法力始终是满的'], ['infMp', '法力不耗', '法力始终是满的'], ['nocd', '无冷却', '放完立刻能再放'], ['oneHit', '一击必杀', '打中敌对单位就倒'], ['fly', '能飞', '不论境界都能御空'], ['stealth', '不被发现', '敌人察觉不到你'], ['ai', '单位心智', '关掉后全场单位原地不动'], ['noSpawn', '不刷野怪', '野外的妖兽、海兽不再刷出来'], ['noNpc', '不来路人', '过路的人、劫道的、奇遇和追杀都不来']];
/** 内置工具：[分组, [[id, 名字, 图标, 说明]]] */
const TOOLS = [
  ['属性', [['props', '万物属性', 'tl_props', '点世界里任何东西（主角、单位、灵宠、人物）看它的属性、改数值；法宝匣里右键任何条目，改它的数据'], ['heal', '回满', 'tl_heal', '点单位或主角：气血法力回满、异常尽消'], ['team', '立场', 'tl_team', '点单位：改成下面选定的立场']]],
  ['生成', [['spawn', '落子', 'tl_spawn', '在法宝匣里点一个人物或妖兽，再在地上左键落子（可连点），右键收手'], ['scene', '预设场景', 'tl_scene', '一键摆好常用的阵势']]],
  ['移除', [['remove', '移除', 'tl_remove', '点单位把它撤下（世界原有的也行）；撤销能放回来']]],
  ['复制', [['copy', '复制', 'tl_copy', '点单位，在旁边复制一个一模一样的']]],
  ['定身', [['freeze', '定身', 'tl_freeze', '点单位：钉在原地，照样出手'], ['ai', '心智', 'tl_rules', '点单位：关掉 / 打开它的 AI（关了就原地不动、不出手）']]],
  ['挪移', [['move', '挪移', 'tl_move', '拖动单位换位置；点空地，主角瞬间过去']]],
  ['异常', [['status', '施加异常', 'tab_status', '点单位或主角，施加下面选定的异常']]],
  ['时间天气', [['time', '天时', 'tl_time', '天气、时辰、倍速、暂停']]],
  ['场地', [['field', '规则', 'tl_rules', '无敌、无冷却、一击必杀……全场规则'], ['units', '场中单位', 'tl_units', '场上所有单位，点一下选中'], ['corpse', '尸身', 'tl_corpse', '倒下的单位留尸；清理尸身'], ['log', '试场记录', 'tl_log', '入阵以来做过的事']]],
];
const ACT_HINT = { beast: '左键落子 · 右键改数据', human: '左键落子 · 右键改数据', npc: '左键召来 / 切磋 · 右键属性', art: '左键习得 / 施放 · 右键改数据', gongfa: '左键改修 · 右键改数据', item: '左键收入储物袋 · 右键改数据', pet: '左键收养随行 · 右键改数据', status: '左键施加给选中的目标' };
const ACT_HINT_T = { beast: '点一下落子 · 长按改数据', human: '点一下落子 · 长按改数据', npc: '点一下召来 / 切磋 · 长按属性', art: '点一下习得 / 施放 · 长按改数据', gongfa: '点一下改修 · 长按改数据', item: '点一下收入储物袋 · 长按改数据', pet: '点一下收养随行 · 长按改数据', status: '点一下施加给选中的目标' };
/** 触屏：这些工具是「到场上点一下」的，选中后收起抽屉、底部出操作条 */
const WORLD_TOOL = { remove: '点单位把它撤下', copy: '点单位，在旁边复制一个', freeze: '点单位定身 / 解除', ai: '点单位关掉 / 打开心智', move: '拖动单位换位置 · 点空地主角瞬移', heal: '点单位或主角回满', team: '点单位改成选定的立场', status: '点单位或主角施加异常' };
/** 触屏：选中就直接去场上点的（没有要先选的参数） */
const WORLD_NOW = new Set(['remove', 'copy', 'freeze', 'ai', 'move']);
/** 触屏判定：网址 ?touch=1/0 强制；游戏里跟主界面（.game-root.touch，B 版和原版都有）；标题页看是不是粗指针 */
function touchNow() {
  try { const q = new URLSearchParams(location.search).get('touch'); if (q === '1') return true; if (q === '0') return false; } catch { /* */ }
  try { const gr = document.querySelector('.game-root'); if (gr) return gr.classList.contains('touch'); } catch { /* */ }
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
}
const UIKEY = 'shahe.ui', FAVKEY = 'shahe.fav', RECKEY = 'shahe.recent';
const store = { get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };

export function createUi(X) {
  const { S, IMG, TABS } = X;
  const style = document.createElement('style'); style.textContent = css(IMG); document.head.appendChild(style);
  const root = document.createElement('div'); root.className = 'sh-root'; document.body.appendChild(root);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ic = (k, cls = '') => `<i class="sh-ic ${cls}" style="--m:url('${IMG[k] ?? ''}')"></i>`;
  const P = Object.assign({ ic: 64, w: 0, names: true, tips: true, calm: false, box: true, tools: true, tw: 300 }, store.get(UIKEY, {}));
  const savePrefs = () => store.set(UIKEY, P);
  const fav = store.get(FAVKEY, {}), rec = store.get(RECKEY, {});
  const D = { tab: 'beast', node: {}, open: new Set(['orig', 'mods']), q: '', qty: 10, petLv: 5, dur: 6, gate: { who: 'self', realm: 2, place: 'arena', scene: '' }, optsOpen: true, ttab: 'tools', tq: '', closed: new Set(), toolParams: {}, page: null };

  root.innerHTML = `
  <div class="sh-gate" hidden></div>
  <div class="sh-ink"></div>
  <div class="sh-hud" hidden>
    <header class="sh-top"></header>
    <section class="sh-box">
      <nav class="sh-tabs"></nav>
      <div class="sh-bxb">
        <aside class="sh-side">
          <label class="sh-srch">${ic('tr_search')}<input class="sh-search" placeholder="搜名字、id……" /></label>
          <div class="sh-tree"></div>
          <div class="sh-opts"></div>
        </aside>
        <div class="sh-main"><div class="sh-mh"></div><div class="sh-grid"></div></div>
      </div>
      <div class="sh-rail"></div>
      <button class="sh-fold" data-a="fold-box" title="收起 / 展开法宝匣"><svg viewBox="0 0 10 10"><path d="M6.5 1.5L3 5l3.5 3.5"/></svg></button>
      <div class="sh-grip" title="拖动改宽度"></div>
      <button class="sh-dx" data-a="dx-box" title="收起法宝匣" aria-label="收起法宝匣">×</button>
    </section>
    <aside class="sh-tools">
      <nav class="sh-ttabs"><button data-tt="tools">${ic('tl_tools')}<span>工具</span></button><button data-tt="mods">${ic('tr_mods')}<span>模组</span></button><button data-tt="set">${ic('tl_settings')}<span>设置</span></button></nav>
      <div class="sh-tbody"></div>
      <button class="sh-fold" data-a="fold-tools" title="收起 / 展开工具"><svg viewBox="0 0 10 10"><path d="M3.5 1.5L7 5 3.5 8.5"/></svg></button>
      <div class="sh-tmini"></div>
      <button class="sh-dx" data-a="dx-tools" title="收起工具" aria-label="收起工具">×</button>
    </aside>
    <div class="sh-modebar" hidden></div>
    <div class="sh-hint" hidden></div>
    <div class="sh-feed"></div>
    <div class="sh-pop" hidden></div>
    <div class="sh-menu" hidden></div>
    <div class="sh-ttip" hidden></div>
  </div>
  <div class="sh-toast"></div>`;
  const $ = (s) => root.querySelector(s);
  const hud = $('.sh-hud'), box = $('.sh-box'), tools = $('.sh-tools'), pop = $('.sh-pop'), menu = $('.sh-menu'), tip = $('.sh-ttip'), gateEl = $('.sh-gate');
  const grid = $('.sh-grid'), tree = $('.sh-tree'), opts = $('.sh-opts'), tbody = $('.sh-tbody');
  const narrow = () => innerWidth <= 900;
  // 1.3.7：触屏时两块面板是抽屉，开关只记在这一回（T），不写进电脑的偏好（P.box / P.tools）
  let touch = false;
  const T = { box: false, tools: false };
  const isOpen = (k) => (touch ? T[k] : P[k]);
  /** 开 / 关法宝匣（'box'）或工具面板（'tools'）。触屏一次只开一块；电脑窄屏也一次一块 */
  function show(k, v) {
    const other = k === 'box' ? 'tools' : 'box';
    if (touch) { T[k] = v; if (v) T[other] = false; }
    else { P[k] = v; if (v && narrow()) P[other] = false; savePrefs(); }
    applyPrefs(); if (k === 'box' && v) moveInk($('.sh-tabs .sh-tab.on'));
  }
  /** 触屏：用完一样东西，收起抽屉露出战场 */
  const doneT = () => { if (touch && (T.box || T.tools)) { T.box = T.tools = false; applyPrefs(); } };
  function applyPrefs() {
    root.style.setProperty('--ic', P.ic + 'px');
    if (P.w) box.style.setProperty('--bw', P.w + 'px'); else box.style.removeProperty('--bw');
    tools.style.setProperty('--tw', P.tw + 'px');
    root.classList.toggle('sh-nonames', !P.names); root.classList.toggle('sh-calm', !!P.calm);
    box.classList.toggle('shut', !isOpen('box')); tools.classList.toggle('shut', !isOpen('tools'));
    hud.classList.toggle('drawer', touch && (T.box || T.tools));
    $('.sh-top [data-a="tbox"]')?.classList.toggle('on', isOpen('box')); $('.sh-top [data-a="ttools"]')?.classList.toggle('on', isOpen('tools'));
    renderMode?.();
  }
  /** 重新判定触屏；变了就换布局 */
  function syncTouch() {
    const t = touchNow(); if (t === touch) return false;
    touch = t; root.classList.toggle('sh-touch', t); T.box = T.tools = false;
    if (S.active && !hud.hidden) { renderTop(); applyPrefs(); renderBox(); renderTools(); placing(); }
    return true;
  }
  root.classList.toggle('sh-touch', touch = touchNow());
  applyPrefs();

  // ---------------------------------------------------------------- 入阵卷轴
  let gatePaused = false;
  function gate(open) {
    if (!open) { gateEl.classList.remove('in'); setTimeout(() => { gateEl.hidden = true; }, 260); const g = X.G(); if (gatePaused && g) { g.paused = false; gatePaused = false; } return; }
    const title = !X.started(), g = title ? null : X.G();
    if (g && !g.paused) { g.paused = true; gatePaused = true; }
    syncTouch();
    const R = X.U.REALMS ?? [];
    const G0 = D.gate; D.title = title;
    const hasSave = X.hasSave();
    if (title && !hasSave) G0.who = 'test';
    gateEl.innerHTML = `<div class="sh-gbg" style="background-image:url('${IMG.splash}')"></div>
      <div class="sh-gcard">
        <h1>天工试场</h1><p class="sh-sub">以阵为界，演法试宝。阵中所得所失，出阵即散。</p>
        <div class="sh-gsec"><b>以何身入阵</b><div class="sh-optc">
          <button class="sh-opt ${G0.who === 'self' ? 'on' : ''}" data-who="self" ${title && !hasSave ? 'disabled' : ''}><i>本</i><span>本尊</span><small>${title ? (hasSave ? '读取最近的存档，带着修为法宝入阵' : '还没有存档') : '带着眼下的修为、法宝与灵宠'}</small></button>
          <button class="sh-opt ${G0.who === 'test' ? 'on' : ''}" data-who="test"><i>化</i><span>化身</span><small>${title && !hasSave ? '开一局新的，另择境界试炼' : '另择一个境界试炼'}</small></button></div>
          <div class="sh-realms" ${G0.who === 'test' ? '' : 'hidden'}>${R.map((r, i) => (i ? `<button class="sh-chip ${G0.realm === i ? 'on' : ''}" data-grealm="${i}">${esc(r.name)}</button>` : '')).join('')}</div></div>
        <div class="sh-gsec"><b>阵设何处</b><div class="sh-seg" data-k="place">${[['arena', '云上演武台'], ['here', '原地'], ['wild', '荒野空地'], ['town', '最近城镇']].map(([k, n]) => `<button class="${G0.place === k ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
        <div class="sh-gsec"><b>开场</b><div class="sh-seg" data-k="scene">${[['', '空场'], ['duel', '斗法'], ['dummy', '木桩阵'], ['tide', '妖兽潮']].map(([k, n]) => `<button class="${G0.scene === k ? 'on' : ''}" data-v="${k}">${n}</button>`).join('')}</div></div>
        <div class="sh-gsec"><b>外来单位</b><div class="sh-seg sh-quiet">${QUIET.map(([k, n]) => `<button class="${S[k] ? 'on' : ''}" data-quiet="${k}">${n}</button>`).join('')}</div><small class="sh-qnote">亮着＝挡在阵外（野外刷怪、海兽、路人、劫道、别的模组生成的单位）；阵里随时可在右侧「设置」改</small></div>
        <p class="sh-warn">${title && !hasSave ? '没有存档：开一局临时的新游戏入阵，出阵即回主界面，什么都不留下。' : '入阵前会自动存一次档；阵中一律不存档，读档、刷新页面也都回到入阵之前。改过的法术、法宝数据出阵时一并还原。'}</p>
        <div class="sh-grow"><button class="sh-go" data-a="go"><span>入阵</span></button><button class="sh-btn ghost" data-a="gate-close">罢了</button></div>
        <p class="sh-keys sh-tkeys">入阵后：屏幕上方的「试」是阵枢——「匣」开法宝匣、「具」开工具，「⋯」里有倍速、撤销、收起和出阵；挑好妖兽点地面落子，底部的「取消」收手；长按条目改数据。</p>
        <p class="sh-keys sh-mkeys">入阵后：<kbd>\`</kbd> 收起 / 展开界面　<kbd>左键</kbd> 落子 · 点选 · 拖动　<kbd>右键</kbd>/<kbd>Esc</kbd> 收手　<kbd>Del</kbd> 移除　<kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销　<kbd>Ctrl</kbd>+<kbd>D</kbd> 复制　法宝匣里 <kbd>右键</kbd> 改数据</p>
      </div>`;
    gateEl.hidden = false; requestAnimationFrame(() => gateEl.classList.add('in'));
  }
  gateEl.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) { if (ev.target === gateEl || ev.target.classList.contains('sh-gbg')) gate(false); return; }
    const G0 = D.gate;
    if (t.dataset.who) { G0.who = t.dataset.who; gateEl.querySelectorAll('.sh-opt').forEach((b) => b.classList.toggle('on', b === t)); gateEl.querySelector('.sh-realms').hidden = G0.who !== 'test'; return; }
    if (t.dataset.grealm) { G0.realm = +t.dataset.grealm; gateEl.querySelectorAll('[data-grealm]').forEach((b) => b.classList.toggle('on', b === t)); return; }
    if (t.dataset.quiet) { const k = t.dataset.quiet; X.setCtl(k, !S[k]); t.classList.toggle('on', !!S[k]); return; }
    const seg = t.closest('.sh-seg'); if (seg) { G0[seg.dataset.k] = t.dataset.v; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); return; }
    if (t.dataset.a === 'gate-close') return gate(false);
    if (t.dataset.a === 'go') {
      const r = t.getBoundingClientRect();
      inkWipe(r.left + r.width / 2, r.top + r.height / 2, () => {
        gateEl.hidden = true; gateEl.classList.remove('in');
        const g = X.G(); if (gatePaused && g) { g.paused = false; gatePaused = false; }
        const opt = { who: G0.who, realm: G0.realm, stage: 0, place: G0.place, scene: G0.scene || undefined };
        if (D.title) X.bootFromTitle(opt); else X.enter(opt);
      });
    }
  });
  function inkWipe(x, y, mid) {
    const ink = $('.sh-ink'); ink.style.setProperty('--x', x + 'px'); ink.style.setProperty('--y', y + 'px');
    ink.className = 'sh-ink grow';
    setTimeout(() => { try { mid?.(); } finally { ink.className = 'sh-ink fade'; setTimeout(() => { ink.className = 'sh-ink'; }, 700); } }, 520);
  }

  // ---------------------------------------------------------------- 阵枢（顶栏）
  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function renderTop() {
    const k = SPEEDS.indexOf(S.speed);
    const pause = `<button class="sh-db big" data-c="pause" title="${S.paused ? '继续' : '暂停'}" aria-label="${S.paused ? '继续' : '暂停'}">${S.paused ? '<svg viewBox="0 0 20 20"><path d="M6 4l10 6-10 6z"/></svg>' : '<svg viewBox="0 0 20 20"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z"/></svg>'}</button>`;
    const step = `<button class="sh-db" data-c="step" ${S.paused ? '' : 'disabled'} title="单步（一帧）" aria-label="单步"><svg viewBox="0 0 20 20"><path d="M4 4l8 6-8 6zM13 4h3v12h-3z"/></svg></button>`;
    const speed = `<span class="sh-speed" style="--k:${k < 0 ? 2 : k}"><span class="sh-ind"></span>${SPEEDS.map((v) => `<button data-c="speed" data-v="${v}" class="${S.speed === v ? 'on' : ''}">${v === 0.25 ? '¼' : v === 0.5 ? '½' : v}×</button>`).join('')}</span>`;
    const undo = `<button class="sh-db" data-c="undo" ${S.undo.length ? '' : 'disabled'} title="撤销（Ctrl+Z）${S.undo.length ? '：' + esc(S.undo[S.undo.length - 1].label) : ''}" aria-label="撤销"><svg viewBox="0 0 20 20"><path d="M8 5L3 9.5 8 14v-3c4 0 6.5 1 8.5 4-.5-4.5-3-8-8.5-8z"/></svg><em>${S.undo.length || ''}</em></button>`;
    const clear = '<button class="sh-db" data-c="clear" title="清场" aria-label="清场"><svg viewBox="0 0 20 20"><path d="M7 3h6l.5 2H17v2H3V5h3.5zM5 8h10l-1 9H6z"/></svg></button>';
    const clock = `<span class="sh-clock">${fmt((performance.now() - S.t0) / 1000)}</span>`;
    if (touch) {
      // 触屏：一枚小药丸；「⋯」展开整条（倍速、单步、撤销、清场、收起、出阵）
      $('.sh-top').innerHTML = `<button class="sh-seal" data-a="tmore" title="阵枢" aria-label="阵枢">试</button>
        <button class="sh-pb ${isOpen('box') ? 'on' : ''}" data-a="tbox" title="法宝匣"><b>匣</b></button><button class="sh-pb ${isOpen('tools') ? 'on' : ''}" data-a="ttools" title="工具"><b>具</b></button>
        ${pause}<button class="sh-pb more" data-a="tmore" title="更多" aria-label="更多"><b>⋯</b></button>
        <div class="sh-tx"><div class="sh-txr">${clock}${step}${speed}</div>
          <div class="sh-txr">${undo}${clear}<button class="sh-tb" data-a="hide">收起界面</button><button class="sh-tb sh-exit" data-a="exit">出阵</button></div></div>`;
      return;
    }
    $('.sh-top').innerHTML = `<i class="sh-seal">试</i><b>天工试场</b>${clock}
      <span class="sh-tg">${pause}${step}</span>${speed}<span class="sh-tg">${undo}${clear}</span>
      <button class="sh-tb" data-a="hide" title="收起界面（\` 键）">收起</button><button class="sh-tb sh-exit" data-a="exit">出阵</button>`;
  }
  $('.sh-top').addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t || t.disabled) return;
    const c = t.dataset.c, a = t.dataset.a, top = $('.sh-top'); stamp(t);
    if (c === 'pause') X.setCtl('paused', !S.paused);
    else if (c === 'step') X.step();
    else if (c === 'speed') X.setCtl('speed', +t.dataset.v);
    else if (c === 'undo') X.undo();
    else if (c === 'clear') X.clearAll();
    else if (a === 'tmore') { if (!S.hud) { X.toggle(); return; } top.classList.toggle('open'); }
    else if (a === 'tbox') { top.classList.remove('open'); if (!S.hud) X.toggle(); show('box', !isOpen('box')); }
    else if (a === 'ttools') { top.classList.remove('open'); if (!S.hud) X.toggle(); show('tools', !isOpen('tools')); }
    else if (a === 'hide') { top.classList.remove('open'); X.toggle(); }
    else if (a === 'exit') confirmExit(t);
  });
  // 触屏：点别处收起展开的阵枢
  const closeTopX = (ev) => { const top = $('.sh-top'); if (top.classList.contains('open') && !top.contains(ev.target) && !pop.contains(ev.target)) top.classList.remove('open'); };
  document.addEventListener('pointerdown', closeTopX, true);
  // 顶栏占住主界面「顶栏堆叠」最上面一格：跟着 .hz-top 的位置放，并让 .hz-top 往下让出这一格（首领条、锁定目标条照常排在下面）
  let dockKey = '';
  function dockTop() {
    const top = $('.sh-top'), de = document.documentElement;
    const hz = S.active && !hud.hidden ? document.querySelector('.game-root .hud > .hz-top') : null;
    if (!hz || !hz.offsetParent) {
      if (dockKey) { dockKey = ''; de.classList.remove('sh-on'); for (const v of ['--sh-top-pad', '--sh-top-pl', '--sh-top-pr']) de.style.removeProperty(v); top.style.removeProperty('left'); top.style.removeProperty('top'); }
      return;
    }
    const r = hz.getBoundingClientRect(), h = top.offsetHeight || 40;
    // 电脑：两块面板开着时，让顶栏堆叠只排在两块面板之间的空当里（首领条、目标条、提示不钻到面板底下）
    let pl = 0, pr = 0;
    if (!touch && S.hud) {
      const zoom = parseFloat(getComputedStyle(hz).zoom) || 1;
      const bR = box.classList.contains('shut') ? 0 : box.getBoundingClientRect().right + 18, tL = tools.classList.contains('shut') ? innerWidth : tools.getBoundingClientRect().left - 18;
      const a = Math.max(0, bR + 6 - r.left), b = Math.max(0, r.right - (tL - 6));
      if (r.width - a - b >= 300) { pl = a / zoom; pr = b / zoom; }
    }
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${h},${Math.round(pl)},${Math.round(pr)}`; if (key === dockKey) return; dockKey = key;
    top.style.left = Math.round(r.left + r.width / 2) + 'px'; top.style.top = Math.round(r.top) + 'px';
    de.style.setProperty('--sh-top-pad', (h + 6) + 'px'); de.style.setProperty('--sh-top-pl', pl + 'px'); de.style.setProperty('--sh-top-pr', pr + 'px'); de.classList.add('sh-on');
  }
  function confirmExit(btn) {
    popOn(btn, '出阵？', [['出阵，一切复原', () => { const r = btn.getBoundingClientRect(); inkWipe(r.left + r.width / 2, r.top + r.height / 2, () => X.exit()); }], ['再留一会', () => {}]], '阵中的单位、所得的宝物、改过的修为与数据都会散去，回到入阵前那份存档。');
  }

  // ---------------------------------------------------------------- 法宝匣：标签
  /** 模组登记的整页：(globalThis.__shahePages ??= {})[模组id] = [{ id, name, icon?, items?(), render?(el, sandbox) }] */
  function modPages() {
    const out = [], live = new Set((X.catalog().mods ?? []).map((m) => m.id));
    for (const [mid, list] of Object.entries(globalThis.__shahePages ?? {})) {
      if (!live.has(mid) || !Array.isArray(list)) continue;
      list.forEach((p, i) => { if (p && p.name && (typeof p.render === 'function' || typeof p.items === 'function')) out.push({ ...p, key: `page:${mid}:${p.id ?? i}`, mod: mid }); });
    }
    return out;
  }
  function renderTabs() {
    const pages = modPages(), show = pages.slice(0, 3), more = pages.slice(3);
    const cur = D.tab;
    $('.sh-tabs').innerHTML = TABS.map((t, i) => `<button class="sh-tab ${cur === t.id ? 'on' : ''}" data-tab="${t.id}" style="--i:${i}" title="${t.name}">${ic(t.icon)}<span>${t.name}</span></button>`).join('')
      + (show.length ? '<i class="sh-tsep"></i>' : '')
      + show.map((p, i) => `<button class="sh-tab mod ${cur === p.key ? 'on' : ''}" data-tab="${esc(p.key)}" style="--i:${TABS.length + i}" title="${esc(p.name)}">${p.icon ? `<img src="${esc(p.icon)}" alt="">` : `<b>${esc(String(p.name)[0])}</b>`}<span>${esc(p.name)}</span></button>`).join('')
      + (more.length ? `<button class="sh-tab more ${more.some((p) => p.key === cur) ? 'on' : ''}" data-a="more" title="更多模组页"><span>更多 ▾</span></button>` : '')
      + '<i class="sh-tink"></i>';
    const r = $('.sh-tabs').querySelector('.sh-tab.on'); moveInk(r);
    $('.sh-rail').innerHTML = TABS.map((t) => `<button class="sh-rb ${cur === t.id ? 'on' : ''}" data-tab="${t.id}" title="${t.name}">${ic(t.icon)}</button>`).join('');
  }
  function moveInk(el) {
    const ink = $('.sh-tink'); if (!ink) return;
    if (!el) { ink.style.opacity = 0; return; }
    requestAnimationFrame(() => { const nav = $('.sh-tabs'), a = nav.getBoundingClientRect(), b = el.getBoundingClientRect(); ink.style.opacity = 1; ink.style.width = b.width + 'px'; ink.style.transform = `translateX(${b.left - a.left + nav.scrollLeft}px)`; });
  }
  function openTab(id) {
    closePop(); closeMenu();
    if (S.place) X.stopPlace();
    D.tab = id; D.q = ''; $('.sh-search').value = '';
    if (!isOpen('box')) show('box', true);
    renderTabs(); renderBox(true);
  }
  $('.sh-tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'more') { const pages = modPages().slice(3); openMenu(b, pages.map((p) => [p.name, () => openTab(p.key), p.key === D.tab])); return; }
    stamp(b); openTab(b.dataset.tab);
  });
  $('.sh-rail').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) openTab(b.dataset.tab); });

  // ---------------------------------------------------------------- 法宝匣：目录树
  const isPage = () => D.tab.startsWith('page:');
  const curPage = () => modPages().find((p) => p.key === D.tab) ?? null;
  const entriesOf = (tab) => (X.catalog()[tab] ?? []);
  const favOf = (tab) => (fav[tab] ??= []);
  const recOf = (tab) => (rec[tab] ??= []);
  const facetVals = (list, f) => { const m = new Map(); for (const e of list) for (const v of e.facets?.[f] ?? []) m.set(v, (m.get(v) ?? 0) + 1); return [...m]; };
  /** 当前标签的树：{ id, name, icon, count, kids, filter } */
  function buildTree() {
    const tab = D.tab;
    if (tab === 'field') return [['scenes', '预设场景', 'tl_scene'], ['units', '场中单位', 'tl_units'], ['sky', '天时', 'tl_time'], ['rules', '规则', 'tl_rules'], ['log', '试场记录', 'tl_log']].map(([id, name, icon]) => ({ id, name, icon }));
    if (tab === 'preset') return [{ id: 'mine', name: '我的预设', icon: 'tab_preset', count: X.presetList().length }, { id: 'scenes', name: '预设场景', icon: 'tl_scene' }];
    if (isPage()) return [{ id: 'all', name: curPage()?.name ?? '模组页', icon: 'tr_mods' }];
    const all = entriesOf(tab), fs = FACETS[tab] ?? [], cat = X.catalog();
    const base = all.filter((e) => !e.mod), mods = new Map();
    for (const e of all) if (e.mod) { if (!mods.has(e.mod)) mods.set(e.mod, []); mods.get(e.mod).push(e); }
    const facetNodes = (list, pre) => {
      if (!fs.length) return [];
      const first = facetVals(list, fs[0]);
      const out = first.length > 1 ? first.map(([v, n]) => ({ id: `${pre}|${fs[0]}|${v}`, name: v, count: n, filter: (e) => (e.facets?.[fs[0]] ?? []).includes(v) })) : [];
      for (const f of fs.slice(1)) { const vals = facetVals(list, f); if (vals.length > 1) out.push({ id: `${pre}|by|${f}`, name: `按${f}`, icon: 'tr_folder', kids: vals.map(([v, n]) => ({ id: `${pre}|${f}|${v}`, name: v, count: n, filter: (e) => (e.facets?.[f] ?? []).includes(v) })) }); }
      return out;
    };
    const nodes = [
      { id: 'all', name: '全部', icon: 'tr_origin', count: all.length, filter: () => true, flat: true },
      { id: 'fav', name: '收藏', icon: 'tr_fav', count: favOf(tab).filter((id) => all.some((e) => e.id === id)).length, filter: (e) => favOf(tab).includes(e.id) },
      { id: 'recent', name: '最近用过', icon: 'tr_recent', count: recOf(tab).filter((id) => all.some((e) => e.id === id)).length, filter: (e) => recOf(tab).includes(e.id), order: (a) => a.sort((x, y) => recOf(tab).indexOf(x.id) - recOf(tab).indexOf(y.id)) },
      { id: 'orig', name: '原版', icon: 'tr_origin', count: base.length, filter: (e) => !e.mod, kids: facetNodes(base, 'orig').map((n) => ({ ...n, filter: n.filter ? ((f) => (e) => !e.mod && f(e))(n.filter) : undefined, kids: n.kids?.map((k) => ({ ...k, filter: ((f) => (e) => !e.mod && f(e))(k.filter) })) })) },
    ];
    if (mods.size) nodes.push({ id: 'mods', name: '模组', icon: 'tr_mods', count: [...mods.values()].reduce((s, a) => s + a.length, 0), filter: (e) => !!e.mod,
      kids: [...mods].map(([mid, list]) => { const m = (cat.mods ?? []).find((x) => x.id === mid); return { id: 'mod:' + mid, name: m?.name ?? mid, img: m?.icon, count: list.length, filter: (e) => e.mod === mid,
        kids: facetNodes(list, 'mod:' + mid).filter((n) => !n.kids).map((n) => ({ ...n, filter: ((f) => (e) => e.mod === mid && f(e))(n.filter) })) }; }) });
    return nodes;
  }
  let treeIndex = new Map();
  function renderTree() {
    const nodes = buildTree(); treeIndex = new Map();
    const sel = D.node[D.tab] ?? (D.tab === 'field' ? 'scenes' : D.tab === 'preset' ? 'mine' : 'all');
    const row = (n, depth) => {
      treeIndex.set(n.id, n);
      const kids = n.kids?.length ? n.kids : null, open = D.open.has(n.id);
      return `<div class="sh-node ${sel === n.id ? 'on' : ''} ${n.count === 0 ? 'empty' : ''}" data-node="${esc(n.id)}" style="--d:${depth}">
          ${kids ? `<button class="sh-tw ${open ? 'open' : ''}" data-tw="${esc(n.id)}" aria-label="展开"><svg viewBox="0 0 10 10"><path d="M3.5 2L7 5 3.5 8"/></svg></button>` : '<i class="sh-tw0"></i>'}
          ${n.img ? `<img class="sh-nimg" src="${esc(n.img)}" alt="">` : n.icon ? ic(n.icon) : '<i class="sh-dot"></i>'}<span>${esc(n.name)}</span>${n.count !== undefined ? `<small>${n.count}</small>` : ''}</div>`
        + (kids ? `<div class="sh-kids ${open ? 'open' : ''}"><div>${kids.map((k) => row(k, depth + 1)).join('')}</div></div>` : '');
    };
    tree.innerHTML = nodes.map((n) => row(n, 0)).join('');
  }
  tree.addEventListener('click', (ev) => {
    const tw = ev.target.closest('[data-tw]');
    if (tw) { const id = tw.dataset.tw; if (D.open.has(id)) D.open.delete(id); else D.open.add(id); tw.classList.toggle('open'); tw.closest('.sh-node').nextElementSibling?.classList.toggle('open'); return; }
    const n = ev.target.closest('[data-node]'); if (!n) return;
    D.node[D.tab] = n.dataset.node; D.q = ''; $('.sh-search').value = '';
    tree.querySelectorAll('.sh-node.on').forEach((x) => x.classList.remove('on')); n.classList.add('on');
    const node = treeIndex.get(n.dataset.node); if (node?.kids?.length && !D.open.has(node.id)) { D.open.add(node.id); n.querySelector('.sh-tw')?.classList.add('open'); n.nextElementSibling?.classList.add('open'); }
    renderMain(true);
  });
  $('.sh-search').addEventListener('input', (ev) => { D.q = ev.target.value; renderMain(true); });

  // ---------------------------------------------------------------- 法宝匣：图标格
  function visible() {
    const tab = D.tab, all = entriesOf(tab), q = D.q.trim().toLowerCase();
    if (q) return all.filter((e) => e.key.includes(q) || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q));
    const n = treeIndex.get(D.node[tab] ?? 'all') ?? treeIndex.get('all');
    const out = all.filter(n?.filter ?? (() => true));
    n?.order?.(out);
    return out;
  }
  function thumbHtml(e) {
    const u = X.thumbs.get(e);
    return u ? `<img src="${esc(u)}" alt="" loading="lazy" draggable="false">` : `<b class="sh-glyph" style="--tone:${e.tone}">${esc(e.glyph)}</b>`;
  }
  const cell = (e, i) => `<button class="sh-cell${S.place?.id === e.id ? ' placing' : ''}${favOf(D.tab).includes(e.id) ? ' fav' : ''}" data-id="${esc(e.id)}" data-c="${e.cat}" style="--tone:${e.tone};--i:${Math.min(i, 30)}">
    <span class="sh-th${X.thumbs.has(e) ? ' pic' : ''}">${thumbHtml(e)}</span><span class="sh-nm">${esc(e.name)}</span><i class="sh-star" data-star="${esc(e.id)}" title="收藏">★</i></button>`;
  function renderMain(anim) {
    const mh = $('.sh-mh');
    box.classList.toggle('page', isPage() && typeof curPage()?.render === 'function');
    if (D.tab === 'field') return renderField();
    if (D.tab === 'preset') return renderPresetTab();
    if (isPage()) return renderPage();
    const es = visible(), node = treeIndex.get(D.node[D.tab] ?? 'all');
    mh.innerHTML = `<b>${D.q.trim() ? `搜「${esc(D.q.trim())}」` : esc(node?.name ?? '全部')}</b><small>${es.length} 种 · ${(touch ? ACT_HINT_T : ACT_HINT)[D.tab] ?? ''}</small>
      <label class="sh-size" title="图标大小">${ic('tab_field', 'sm')}<input type="range" min="40" max="120" step="4" value="${P.ic}" data-size></label>`;
    const cap = 600;
    grid.className = 'sh-grid cells' + (anim ? ' anim' : '');
    grid.innerHTML = es.length ? es.slice(0, cap).map(cell).join('') + (es.length > cap ? `<p class="sh-more">还有 ${es.length - cap} 种，搜一搜</p>` : '')
      : `<p class="sh-empty">${D.node[D.tab] === 'fav' ? (touch ? '还没有收藏——点图标右上角的 ★' : '还没有收藏——把鼠标放在图标上，点右上角的 ★') : D.node[D.tab] === 'recent' ? '还没用过这一类' : '匣中空空'}</p>`;
    if (anim) grid.scrollTop = 0;
  }
  /** 缩略图画好了：把格子里还是字形的换成图（一帧一次） */
  let thumbRaf = 0;
  function thumbsReady() {
    if (thumbRaf) return;
    thumbRaf = requestAnimationFrame(() => {
      thumbRaf = 0;
      if (!S.active || !grid.classList.contains('cells')) return;
      const list = entriesOf(D.tab);
      for (const c of grid.querySelectorAll('.sh-th:not(.pic)')) {
        const b = c.parentElement, e = list.find((x) => x.id === b.dataset.id); if (!e) continue;
        const u = X.thumbs.get(e); if (!u) continue;
        c.classList.add('pic', 'fresh'); c.innerHTML = `<img src="${esc(u)}" alt="" draggable="false">`;
      }
      const th = tbody.querySelector('.sh-ph:not(.pic)'); if (th) renderCP();
    });
  }
  grid.addEventListener('input', (ev) => { if (ev.target.dataset.size !== undefined) { P.ic = +ev.target.value; root.style.setProperty('--ic', P.ic + 'px'); savePrefs(); } });
  $('.sh-mh').addEventListener('input', (ev) => { if (ev.target.dataset.size !== undefined) { P.ic = +ev.target.value; root.style.setProperty('--ic', P.ic + 'px'); savePrefs(); } });
  const entryOf = (el) => (X.catalog()[el.dataset.c] ?? []).find((x) => x.id === el.dataset.id);
  grid.addEventListener('click', (ev) => {
    const st = ev.target.closest('[data-star]');
    if (st) { ev.stopPropagation(); const a = favOf(D.tab), id = st.dataset.star, i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.unshift(id); store.set(FAVKEY, fav); st.parentElement.classList.toggle('fav', i < 0); stamp(st); renderTree(); return; }
    const t = ev.target.closest('button'); if (!t) return;
    if (lp.fired) { lp.fired = false; return; }   // 长按已经打开了属性，这一下不算点
    if (D.tab === 'field' || D.tab === 'preset') return fieldClick(t);
    if (isPage()) return pageClick(t);
    if (t.dataset.id) clickCell(t);
  });
  function cellProps(t) {
    const e = entryOf(t); if (!e) return;
    const key = dataKey(e); if (!key) { toast('异常没有数据表可改', 'warn'); return; }
    openProps(key); stamp(t);
  }
  grid.addEventListener('contextmenu', (ev) => {
    const t = ev.target.closest('.sh-cell'); if (!t) return;
    ev.preventDefault();
    if (touch || lp.fired) return;   // 触屏走自己的长按（安卓长按也会发 contextmenu，别开两回）
    cellProps(t);
  });
  // 触屏：长按条目 = 右键（改数据）
  const lp = { t: 0, x: 0, y: 0, fired: false };
  grid.addEventListener('pointerdown', (ev) => {
    lp.fired = false; clearTimeout(lp.t);
    if (ev.pointerType === 'mouse') return;
    const c = ev.target.closest('.sh-cell'); if (!c || !c.dataset.id) return;
    lp.x = ev.clientX; lp.y = ev.clientY;
    lp.t = setTimeout(() => { if (!c.isConnected) return; lp.fired = true; try { navigator.vibrate?.(12); } catch { /* */ } cellProps(c); }, 520);
  });
  grid.addEventListener('pointermove', (ev) => { if (lp.t && Math.hypot(ev.clientX - lp.x, ev.clientY - lp.y) > 9) { clearTimeout(lp.t); lp.t = 0; } });
  for (const k of ['pointerup', 'pointercancel']) grid.addEventListener(k, () => { clearTimeout(lp.t); lp.t = 0; });
  const dataKey = (e) => (e.kind === 'npc' ? 'npc:' + e.id : e.table ? `data:${e.table}:${e.id}` : null);
  function openProps(key) {
    X.select(key); setTool('props');
    if (!isOpen('tools') || (touch && T.box)) show('tools', true);
    if (D.ttab !== 'tools') { D.ttab = 'tools'; renderTools(); }
  }
  function clickCell(el) {
    const e = entryOf(el); if (!e) return;
    closePop();
    if (e.kind === 'enemy') {
      if (S.place?.id === e.id) { X.stopPlace(); return; }
      X.startPlace({ id: e.id, name: e.name }); pushRecent(D.tab, e.id); doneT(); return;   // 触屏：收起抽屉，去地上点
    }
    if (e.yewushe) return popOn(el, e.name, [['召来开打（从人身打起）', () => X.yewusheAct('fight')], ['直接打魔躯形态', () => X.yewusheAct('demon')], ['看他演招（人身 · 打木桩）', () => X.yewusheAct('demo')], ['看魔躯演招（打木桩）', () => X.yewusheAct('demoDemon')]], e.meta);
    if (e.hanshan) return popOn(el, e.name, [['召到身旁', () => X.hanshanAct('call')], ['切磋一场', () => X.hanshanAct('spar')], ['惹怒他（真打）', () => X.hanshanAct('angry')], ['看他演招（打木桩）', () => X.hanshanAct('demo')]], e.meta);
    if (e.npc) return popOn(el, e.name, [['召来身旁', () => X.npcAct(e.id, 'call')], ['切磋一场', () => X.npcAct(e.id, 'spar')], ...(X.npcMine?.(e.id) ? [['移出试场', () => X.npcAct(e.id, 'drop')]] : []), ['属性', () => openProps('npc:' + e.id)]], e.meta);
    if (e.cat === 'art') return popOn(el, e.name, [['习得', () => X.learn(e.id)], ['施放', () => X.cast(e.id)], ['习得并施放', () => { X.learn(e.id); X.cast(e.id); }], ['改数据', () => openProps(dataKey(e))]], e.meta);
    if (e.cat === 'gongfa') return popOn(el, e.name, [['改修此功法', () => X.gongfa(e.id)], ['改数据', () => openProps(dataKey(e))]], e.desc);
    // 触屏：领宝、收宠、施加异常不收抽屉（常常连着点好几样），底部提示一声
    if (e.cat === 'item') { X.give(e.id, D.qty); float(el, `+${D.qty}`); if (touch) toast(`${e.name} ×${D.qty} 收入储物袋`, 'good'); return; }
    if (e.cat === 'pet') { X.pet(e.id, D.petLv); float(el, '随行'); if (touch) toast(`${e.name} 随行`, 'good'); return; }
    if (e.cat === 'status') { const t = target(); X.status(e.id, t.id, D.dur); float(el, t.name); pushRecent('status', e.id); if (touch) toast(`${e.name} → ${t.name}`, 'good'); return; }
  }
  function pushRecent(tab, id) { const a = recOf(tab), i = a.indexOf(id); if (i >= 0) a.splice(i, 1); a.unshift(id); a.length = Math.min(a.length, 24); store.set(RECKEY, rec); }
  const target = () => { const id = S.sel; if (!id || id === 'player' || !/^S\d+$/.test(id)) return { id: 'player', name: '主角' }; const o = S.objs.get(id); return o ? { id, name: o.def.name } : { id: 'player', name: '主角' }; };

  // 悬停说明
  let tipT = 0, tipFor = null;
  grid.addEventListener('pointerover', (ev) => {
    const c = ev.target.closest('.sh-cell'); if (!c || c === tipFor || !P.tips || touch || ev.pointerType !== 'mouse') return;
    tipFor = c; clearTimeout(tipT); tip.hidden = true;
    tipT = setTimeout(() => {
      const e = entryOf(c); if (!e || !c.isConnected) return;
      tip.innerHTML = `<b>${esc(e.name)}</b><small>${esc(e.meta)}</small>${e.desc && e.desc !== e.meta ? `<p>${esc(String(e.desc).slice(0, 120))}</p>` : ''}<em>${(touch ? ACT_HINT_T : ACT_HINT)[e.npc ? 'npc' : D.tab] ?? ''}</em><code>${esc(e.id)}</code>`;
      tip.hidden = false; const r = c.getBoundingClientRect(), W = tip.offsetWidth, Hh = tip.offsetHeight;
      tip.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left + r.width / 2 - W / 2)) + 'px';
      tip.style.top = (r.bottom + Hh + 12 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - Hh - 6)) + 'px';
      tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in');
    }, 380);
  });
  grid.addEventListener('pointerleave', () => { clearTimeout(tipT); tip.hidden = true; tipFor = null; });
  grid.addEventListener('pointerdown', () => { clearTimeout(tipT); tip.hidden = true; });

  // ---------------------------------------------------------------- 法宝匣：试场 / 预设 / 模组页
  function renderField() {
    const node = D.node.field ?? 'scenes', mh = $('.sh-mh');
    grid.className = 'sh-grid flow';
    const g = X.G(), ph = g ? g.dayPhase : 0;
    if (node === 'scenes') { mh.innerHTML = '<b>预设场景</b><small>一键摆阵；撤销能整个撤掉</small>'; grid.innerHTML = scenesHtml(); }
    else if (node === 'units') { const us = [...S.objs.values()].filter(X.alive); mh.innerHTML = `<b>场中单位</b><small>${us.length} 个 · 点一下选中，右侧看属性</small>`; grid.innerHTML = unitsHtml(us); }
    else if (node === 'sky') { mh.innerHTML = `<b>天时</b><small>${esc(g?.timeName?.() ?? '')}</small>`; grid.innerHTML = skyHtml(ph); }
    else if (node === 'rules') { mh.innerHTML = '<b>规则</b><small>只在阵里有效</small>'; grid.innerHTML = rulesHtml(); }
    else if (node === 'log') { mh.innerHTML = '<b>试场记录</b>'; grid.innerHTML = logHtml(); }
  }
  const scenesHtml = () => `<div class="sh-scenes">${SCENES.map(([k, n, d], i) => `<button class="sh-scene" data-scene="${k}" style="--i:${i}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>`;
  /** 1.3.8：召来的世界人物也列进「场中单位」（点一下看属性，属性页里能移出试场） */
  const mineHtml = () => [...S.npcMine.keys()].map((id) => { const a = X.G()?.npcs?.active?.get(id); if (!a?.d?.alive) return ''; const k = 'npc:' + id; return `<button class="sh-unit ${S.sel === k ? 'on' : ''}" data-sel="${k}" style="--c:rgb(210,150,90)"><i></i>${esc(a.d.name)}<small>召来的人物${a.enemy ? ' · 切磋中' : ''}</small></button>`; }).join('');
  const unitsHtml = (us) => `<div class="sh-units">${us.length ? us.map((o) => `<button class="sh-unit ${S.sel === o.id ? 'on' : ''}" data-sel="${o.id}" style="--c:rgb(${X.TEAM_COL[o.team]})"><i></i>${esc(o.def.name)}<small>${X.TEAM_NAME[o.team]}${o.noAI ? ' · 止' : o.frozen ? ' · 定' : ''}${o.follow ? ' · 随' : ''}${o.ext ? ' · 原有' : ''}</small><em style="width:${Math.round(100 * Math.max(0, o.e.hp) / o.e.maxHp)}%"></em></button>`).join('') + mineHtml() : mineHtml() || '<p class="sh-tip">场中还没有单位——到「人物」「妖兽」里挑</p>'}</div>`;
  const skyHtml = (ph) => `<div class="sh-envr"><div class="sh-wx">${WEATHER.map(([k2, g2, n]) => `<button data-wx="${k2 ?? ''}" class="${S.weather === k2 ? 'on' : ''}" title="${n}">${g2}</button>`).join('')}</div>
    <div class="sh-time"><span class="sh-sun" style="--p:${ph}"></span><input type="range" min="0" max="1" step="0.005" value="${ph.toFixed(3)}" data-clock><small data-live="tname">${esc(X.G()?.timeName?.() ?? '')}</small></div></div>`;
  const rulesHtml = () => `<div class="sh-rules">${RULES.map(([k, n, d]) => `<button class="sh-rule ${S[k] ? 'on' : ''}" data-rule="${k}"><i class="sh-sw"></i><b>${n}</b><small>${d}</small></button>`).join('')}</div>`;
  const logHtml = () => `<div class="sh-log">${S.logs.slice(-120).reverse().map((l) => `<p class="${l.tone}"><i>${fmt(l.t)}</i>${esc(l.text)}</p>`).join('') || '<p class="sh-tip">——</p>'}</div>`;
  function renderPresetTab() {
    const node = D.node.preset ?? 'mine', mh = $('.sh-mh'), Pl = X.presetList();
    grid.className = 'sh-grid flow';
    if (node === 'scenes') { mh.innerHTML = '<b>预设场景</b>'; grid.innerHTML = scenesHtml(); return; }
    mh.innerHTML = `<b>我的预设</b><small>${Pl.length} 个 · 存的是场中单位（相对主角的位置）、规则、天时</small>`;
    grid.innerHTML = `<div class="sh-psave"><input class="sh-pname" placeholder="给眼下的阵势起个名" maxlength="20" /><button class="sh-btn sm jade" data-a="psave">存</button></div>
      ${Pl.length ? Pl.map((p, i) => `<div class="sh-preset" style="--i:${i}"><div><b>${esc(p.name)}</b><small>${p.objs.length} 个单位 · ${new Date(p.at).toLocaleString()}</small></div><button class="sh-btn sm" data-pload="${esc(p.name)}">载入</button><button class="sh-btn sm ghost" data-pdel="${esc(p.name)}">删</button></div>`).join('') : '<p class="sh-tip">还没有自己的预设</p>'}`;
  }
  function fieldClick(t) {
    if (t.dataset.wx !== undefined) { X.setCtl('weather', t.dataset.wx || null); renderMain(); return; }
    if (t.dataset.scene) { X.scene(t.dataset.scene); stamp(t); setTimeout(doneT, 160); return; }
    if (t.dataset.rule) { X.setCtl(t.dataset.rule, !S[t.dataset.rule]); stamp(t); renderMain(); return; }
    if (t.dataset.a === 'psave') { const n = grid.querySelector('.sh-pname').value.trim() || `阵势 ${new Date().toLocaleTimeString()}`; X.savePreset(n); return; }
    if (t.dataset.pload) { X.loadPreset(t.dataset.pload); return; }
    if (t.dataset.pdel) { X.delPreset(t.dataset.pdel); return; }
    if (t.dataset.sel) { openProps(t.dataset.sel); return; }
  }
  grid.addEventListener('input', (ev) => { if (ev.target.dataset.clock !== undefined) { X.setClock(+ev.target.value); ev.target.previousElementSibling?.style.setProperty('--p', ev.target.value); } });
  function renderPage() {
    const p = curPage(), mh = $('.sh-mh'); if (!p) { D.tab = 'beast'; renderTabs(); renderBox(); return; }
    const m = (X.catalog().mods ?? []).find((x) => x.id === p.mod);
    mh.innerHTML = `<b>${esc(p.name)}</b><small>${esc(m?.name ?? p.mod)} 登记的整页</small>`;
    if (typeof p.render === 'function') { grid.className = 'sh-grid flow page'; grid.innerHTML = ''; try { p.render(grid, X); } catch (err) { grid.innerHTML = `<p class="sh-empty">这一页出错了：${esc(err?.message ?? err)}</p>`; } return; }
    let items = []; try { items = p.items() ?? []; } catch { items = []; }
    D.pageItems = items;
    grid.className = 'sh-grid cells';
    grid.innerHTML = items.length ? items.map((it, i) => `<button class="sh-cell" data-pi="${i}" style="--tone:${esc(it.tone ?? '#7a3a5a')};--i:${Math.min(i, 30)}" title="${esc(it.desc ?? '')}"><span class="sh-th${it.thumb ? ' pic' : ''}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : `<b class="sh-glyph" style="--tone:${esc(it.tone ?? '#7a3a5a')}">${esc(String(it.glyph ?? it.name ?? '?').slice(0, 1))}</b>`}</span><span class="sh-nm">${esc(it.name)}</span></button>`).join('') : '<p class="sh-empty">这一页是空的</p>';
  }
  function pageClick(t) {
    const it = D.pageItems?.[+t.dataset.pi]; if (!it || typeof it.act !== 'function') return;
    X.runTool({ name: it.name, act: it.act }); float(t, '✓');
  }

  // ---------------------------------------------------------------- 法宝匣：左下生成选项
  function renderOpts() {
    const o = S.opt, R = X.U.REALMS ?? [], tab = D.tab;
    let body = '';
    if (tab === 'beast' || tab === 'human') {
      const st = R[o.realm]?.stages ?? [];
      body = `<div class="sh-fr"><label>立场</label><div class="sh-seg sm" data-k="team">${Object.entries(X.TEAM_NAME).map(([k, n]) => `<button class="${(o.follow ? 'ally' : o.team) === k ? 'on' : ''}" data-v="${k}" style="--c:rgb(${X.TEAM_COL[k]})">${n}</button>`).join('')}</div></div>
        <div class="sh-fr"><label>境界</label><select class="sh-sel" data-o="realm">${R.map((r, i) => `<option value="${i}" ${o.realm === i ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
          ${st.length > 1 ? `<select class="sh-sel" data-o="stage">${st.map((s, i) => `<option value="${i}" ${o.stage === i ? 'selected' : ''}>${esc(typeof s === 'string' ? s : s?.name ?? i)}</option>`).join('')}</select>` : ''}</div>
        <div class="sh-fr"><label>数量</label><div class="sh-step"><button data-n="-1">−</button><b>${o.count}</b><button data-n="1">＋</button></div>${[1, 5, 10, 20].map((n) => `<button class="sh-chip sm ${o.count === n ? 'on' : ''}" data-cnt="${n}">${n}</button>`).join('')}</div>
        <div class="sh-checks">${[['noAI', '关闭 AI'], ['noP', '无视主角'], ['follow', '加入主角队伍'], ['corpse', '保留尸体']].map(([k, n]) => `<label class="sh-ck"><input type="checkbox" data-ck="${k}" ${o[k] ? 'checked' : ''}><i></i>${n}</label>`).join('')}</div>`;
    } else if (tab === 'item') body = `<div class="sh-fr"><label>每次领</label>${[1, 10, 99, 999].map((n) => `<button class="sh-chip sm ${D.qty === n ? 'on' : ''}" data-qty="${n}">×${n}</button>`).join('')}</div><p class="sh-tip">点图标直接收入储物袋</p>`;
    else if (tab === 'pet') body = `<div class="sh-fr"><label>等级 <b>${D.petLv}</b></label><input type="range" min="1" max="10" value="${D.petLv}" class="sh-range" data-petlv></div><p class="sh-tip">点图标收养并随行（满四只则替换随行那只）</p>`;
    else if (tab === 'status') { const t = target(); body = `<div class="sh-fr"><label>时长</label>${[3, 6, 15, 60].map((n) => `<button class="sh-chip sm ${D.dur === n ? 'on' : ''}" data-dur="${n}">${n} 秒</button>`).join('')}</div><p class="sh-tip">施加于：<b>${esc(t.name)}</b>（在世界里点选别的单位可换目标）</p>`; }
    else if (tab === 'art') body = '<p class="sh-tip">点图标：习得 / 施放（越过境界与法力限制，朝准星方向）</p>';
    else if (tab === 'gongfa') body = '<p class="sh-tip">点图标改修为主修功法</p>';
    opts.hidden = !body;
    opts.innerHTML = body ? `<button class="sh-oh ${D.optsOpen ? 'open' : ''}" data-a="opts"><svg viewBox="0 0 10 10"><path d="M3.5 2L7 5 3.5 8"/></svg>${tab === 'beast' || tab === 'human' ? '生成选项' : '选项'}</button><div class="sh-ob ${D.optsOpen ? 'open' : ''}"><div>${body}</div></div>` : '';
  }
  opts.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    const o = S.opt;
    if (t.dataset.a === 'opts') { D.optsOpen = !D.optsOpen; t.classList.toggle('open'); t.nextElementSibling.classList.toggle('open'); return; }
    if (t.dataset.n) { o.count = Math.max(1, Math.min(50, o.count + +t.dataset.n)); renderOpts(); return; }
    if (t.dataset.cnt) { o.count = +t.dataset.cnt; renderOpts(); return; }
    const seg = t.closest('.sh-seg'); if (seg?.dataset.k === 'team') { o.team = t.dataset.v; if (o.team !== 'ally') o.follow = false; renderOpts(); return; }
    if (t.dataset.qty) { D.qty = +t.dataset.qty; renderOpts(); return; }
    if (t.dataset.dur) { D.dur = +t.dataset.dur; renderOpts(); return; }
  });
  opts.addEventListener('change', (ev) => {
    const t = ev.target, o = S.opt;
    if (t.dataset.o === 'realm') { o.realm = +t.value; o.stage = Math.min(o.stage, (X.U.REALMS[o.realm]?.stages?.length ?? 1) - 1); renderOpts(); }
    if (t.dataset.o === 'stage') o.stage = +t.value;
    if (t.dataset.ck) { o[t.dataset.ck] = t.checked; if (t.dataset.ck === 'follow' && t.checked) o.team = 'ally'; renderOpts(); }
  });
  opts.addEventListener('input', (ev) => { if (ev.target.dataset.petlv !== undefined) { D.petLv = +ev.target.value; ev.target.previousElementSibling.querySelector('b').textContent = D.petLv; } });
  function renderBox(anim) { renderTree(); renderOpts(); renderMain(anim); }

  // 法宝匣宽度：拖右边缘
  (() => {
    const grip = $('.sh-grip'); let d = null;
    grip.addEventListener('pointerdown', (ev) => { d = { x: ev.clientX, w: box.getBoundingClientRect().width }; try { grip.setPointerCapture(ev.pointerId); } catch { /* */ } box.classList.add('sizing'); ev.preventDefault(); });
    grip.addEventListener('pointermove', (ev) => { if (!d) return; const w = Math.max(420, Math.min(innerWidth - 40, d.w + ev.clientX - d.x)); box.style.setProperty('--bw', w + 'px'); });
    grip.addEventListener('pointerup', () => { if (!d) return; d = null; box.classList.remove('sizing'); P.w = Math.round(box.getBoundingClientRect().width); savePrefs(); moveInk($('.sh-tabs .sh-tab.on')); });
    grip.addEventListener('dblclick', () => { P.w = 0; savePrefs(); applyPrefs(); });
  })();
  root.addEventListener('click', (ev) => {
    const dx = ev.target.closest('.sh-dx'); if (dx) { show(dx.dataset.a === 'dx-box' ? 'box' : 'tools', false); return; }
    const f = ev.target.closest('.sh-fold'); if (!f) return;
    if (f.dataset.a === 'fold-box') show('box', !isOpen('box'));
    else show('tools', !isOpen('tools'));
  });
  $('.sh-tmini').addEventListener('click', () => show('tools', true));

  // ---------------------------------------------------------------- 工具面板
  function modToolGroups() {
    const cat = X.catalog(), byMod = new Map();
    for (const t of cat.tool) { if (!byMod.has(t.mod)) byMod.set(t.mod, []); byMod.get(t.mod).push(t); }
    return [...byMod].map(([mid, list]) => { const m = (cat.mods ?? []).find((x) => x.id === mid); return { mod: mid, name: m?.name ?? mid, icon: m?.icon ?? '', tools: list }; });
  }
  function renderTools() {
    tools.querySelectorAll('[data-tt]').forEach((b) => b.classList.toggle('on', b.dataset.tt === D.ttab));
    if (D.ttab === 'mods') return renderModsTab();
    if (D.ttab === 'set') return renderSetTab();
    tbody.innerHTML = `<label class="sh-tf">${ic('tr_search')}<input class="sh-tq" placeholder="过滤工具……" value="${esc(D.tq)}"></label><div class="sh-tlist"></div><div class="sh-cp"></div>`;
    renderToolList(); renderCP();
  }
  function renderToolList() {
    const q = D.tq.trim().toLowerCase(), list = tbody.querySelector('.sh-tlist'); if (!list) return;
    const match = (n, d) => !q || n.toLowerCase().includes(q) || (d ?? '').toLowerCase().includes(q);
    const groups = TOOLS.map(([g, ts]) => ({ id: g, name: g, tools: ts.filter(([, n, , d]) => match(n, d) || g.includes(q)).map(([id, n, icn, d]) => ({ id, name: n, icon: icn, desc: d })) }))
      .concat(modToolGroups().map((m) => ({ id: 'mod:' + m.mod, name: m.name, img: m.icon, mod: true, tools: m.tools.filter((t) => match(t.name, t.meta) || m.name.toLowerCase().includes(q)).map((t) => ({ id: `mod:${t.id}`, name: t.name, glyph: t.glyph, tone: t.tone, img: t.icon, desc: t.meta })) })))
      .filter((g) => g.tools.length);
    list.innerHTML = groups.length ? groups.map((g) => `<div class="sh-tg2 ${D.closed.has(g.id) && !q ? 'shut' : ''} ${g.mod ? 'mod' : ''}"><button class="sh-tgh" data-tg="${esc(g.id)}"><svg viewBox="0 0 10 10"><path d="M3.5 2L7 5 3.5 8"/></svg>${g.img ? `<img src="${esc(g.img)}" alt="">` : ''}<span>${esc(g.name)}</span><small>${g.tools.length}</small></button>
      <div class="sh-tgb"><div>${g.tools.map((t) => `<button class="sh-tool ${S.tool === t.id ? 'on' : ''}" data-tool="${esc(t.id)}" title="${esc(t.desc ?? '')}">${t.icon ? ic(t.icon) : t.img ? `<img src="${esc(t.img)}" alt="">` : `<b style="--tone:${esc(t.tone ?? '#7a3a5a')}">${esc(t.glyph ?? '?')}</b>`}<span>${esc(t.name)}</span></button>`).join('')}</div></div></div>`).join('')
      : '<p class="sh-tip" style="padding:10px">没有对得上的工具</p>';
  }
  tbody.addEventListener('input', (ev) => {
    if (ev.target.classList.contains('sh-tq')) { D.tq = ev.target.value; renderToolList(); return; }
    if (ev.target.dataset.clock !== undefined) { X.setClock(+ev.target.value); ev.target.previousElementSibling?.style.setProperty('--p', ev.target.value); }
    if (ev.target.dataset.set) setPref(ev.target);
  });
  function setTool(id) {
    X.setTool(id);
    tbody.querySelectorAll('.sh-tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
    renderCP(); renderMini(); renderMode();
    const t = TOOLS.flatMap(([, ts]) => ts).find(([tid]) => tid === S.tool);
    if (S.tool !== 'props' && !touch) hint(t ? `<b>${t[1]}</b>　${t[3]}` : `<b>${esc(X.toolById(S.tool)?.name ?? '')}</b>　在世界里点一下施放　<kbd>Esc</kbd> 换回属性`, 2600);
  }
  // ---- 工具的参数区（「属性」工具 = 属性表）
  let cpFields = [], cpKey = null, cpScroll = 0;
  function renderCP() {
    const cp = tbody.querySelector('.sh-cp'); if (!cp) return;
    const t = S.tool, keep = cpKey === S.sel && t === 'props' ? cp.scrollTop : 0;
    cpFields = []; cpKey = null;
    let html = '';
    const head = (title, desc, icon) => `<div class="sh-cph">${icon ? ic(icon) : ''}<b>${esc(title)}</b></div>${desc ? `<p class="sh-tip">${esc(desc)}</p>` : ''}`;
    const def = TOOLS.flatMap(([, ts]) => ts).find(([id]) => id === t);
    if (t === 'props') html = sheetHtml();
    else if (t.startsWith('mod:')) {
      const tl = X.toolById(t);
      html = tl ? `${head(tl.name, tl.desc ?? tl.meta)}${paramsHtml(t, tl.params)}<div class="sh-acts"><button class="sh-btn jade" data-a="run">在主角前方施放</button>${touch ? '<button class="sh-btn" data-a="go-world">到场上点一下施放 ▸</button>' : ''}</div><p class="sh-tip">也可以直接在世界里点一下：在那儿施放。放出来的单位同样能点选、撤销。</p>` : head('工具已不在', '登记它的模组可能停用了');
    } else if (def) {
      html = head(def[1], touch && t === 'spawn' ? '在法宝匣里点一个人物或妖兽，再点地面落子（可连点），底部的「取消」收手' : def[3], def[2]);
      if (touch && WORLD_TOOL[t] && !WORLD_NOW.has(t)) html += `<div class="sh-acts"><button class="sh-btn jade" data-a="go-world">选好了，到场上点单位 ▸</button></div>`;
      if (t === 'team') html += `<div class="sh-seg" data-k="tteam">${Object.entries(X.TEAM_NAME).map(([k, n]) => `<button class="${S.toolOpt.team === k ? 'on' : ''}" data-v="${k}" style="--c:rgb(${X.TEAM_COL[k]})">${n}</button>`).join('')}</div>`;
      if (t === 'heal') html += '<div class="sh-acts"><button class="sh-btn sm jade" data-a="heal-p">回满主角</button></div>';
      if (t === 'spawn') { const rl = [...recOf('beast'), ...recOf('human')].slice(0, 10).map((id) => X.U.ENEMIES[id]).filter(Boolean); html += `<p class="sh-tip">生成选项（立场、境界、数量、关闭 AI……）在法宝匣左下。</p>${rl.length ? `<div class="sh-wrap">${rl.map((d) => `<button class="sh-chip" data-placeq="${esc(d.id)}">${esc(d.name)}</button>`).join('')}</div>` : ''}${S.place ? `<p class="sh-tip">正在落子：<b>${esc(S.place.name)}</b></p>` : ''}`; }
      if (t === 'scene') html += scenesHtml();
      if (t === 'remove') html += `<div class="sh-acts"><button class="sh-btn sm bad" data-a="clear">清场</button>${/^S\d+$/.test(S.sel ?? '') ? '<button class="sh-btn sm" data-a="rm-sel">移除选中的</button>' : ''}</div>`;
      if (t === 'copy') html += /^S\d+$/.test(S.sel ?? '') ? '<div class="sh-acts"><button class="sh-btn sm" data-a="dup-sel">复制选中的</button></div>' : '';
      if (t === 'freeze' || t === 'ai') html += `<div class="sh-rules">${rulesHtml().match(/<button class="sh-rule[^"]*" data-rule="ai">.*?<\/button>/)?.[0] ?? ''}</div>`;
      if (t === 'move') html += '<div class="sh-acts"><button class="sh-btn sm" data-a="home">回到阵心</button><button class="sh-btn sm" data-a="gather">全部挪到身旁</button></div>';
      if (t === 'status') html += `<div class="sh-wrap">${Object.entries(X.STATUS).map(([k, n]) => `<button class="sh-chip ${S.toolOpt.status === k ? 'on' : ''}" data-tst="${k}">${n}</button>`).join('')}</div><div class="sh-fr"><label>时长</label>${[3, 6, 15, 60].map((n) => `<button class="sh-chip sm ${S.toolOpt.dur === n ? 'on' : ''}" data-tdur="${n}">${n} 秒</button>`).join('')}</div>`;
      if (t === 'time') { const g = X.G(); html += skyHtml(g ? g.dayPhase : 0) + `<div class="sh-fr"><label>倍速</label>${SPEEDS.map((v) => `<button class="sh-chip sm ${S.speed === v ? 'on' : ''}" data-tspd="${v}">${v}×</button>`).join('')}</div>`; }
      if (t === 'field') html += rulesHtml();
      if (t === 'units') html += unitsHtml([...S.objs.values()].filter(X.alive));
      if (t === 'corpse') html += `<p class="sh-tip">场上尸身：<b>${S.corpses.length}</b> 具。新落子是否留尸在法宝匣左下「保留尸体」。</p><div class="sh-acts"><button class="sh-btn sm" data-a="corpse-clear">清理尸身</button></div>`;
      if (t === 'log') html += logHtml();
    }
    cp.innerHTML = html;
    tbody.classList.toggle('sheet', !!cpKey);
    cp.classList.remove('in'); void cp.offsetWidth; cp.classList.add('in');
    if (keep) cp.scrollTop = keep;
    live();
  }
  function paramsHtml(tid, params) {
    if (!params?.length) return '';
    const v = (D.toolParams[tid] ??= {});
    return `<div class="sh-params">${params.map((p, i) => {
      const k = p.key ?? 'p' + i; if (v[k] === undefined) v[k] = p.default ?? (p.type === 'bool' ? false : p.type === 'select' ? (p.options?.[0]?.value ?? p.options?.[0]) : p.min ?? 0);
      const lab = `<label title="${esc(p.hint ?? '')}">${esc(p.label ?? k)}</label>`;
      if (p.type === 'bool') return `<div class="sh-row">${lab}<button class="sh-switch ${v[k] ? 'on' : ''}" data-tp="${esc(k)}" data-tpt="bool"><i></i></button></div>`;
      if (p.type === 'select') return `<div class="sh-row">${lab}<select class="sh-sel" data-tp="${esc(k)}">${(p.options ?? []).map((o) => { const ov = o?.value ?? o, ol = o?.label ?? o; return `<option value="${esc(ov)}" ${String(ov) === String(v[k]) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select></div>`;
      return `<div class="sh-row">${lab}<input class="sh-num" type="number" data-tp="${esc(k)}" min="${p.min ?? ''}" max="${p.max ?? ''}" step="${p.step ?? 1}" value="${esc(v[k])}"></div>`;
    }).join('')}</div>`;
  }
  // ---- 属性表
  function sheetHtml() {
    const key = S.sel;
    const sh = key ? X.sheet(key) : null;
    if (!sh) return `<div class="sh-empty2">${ic('tl_props', 'big')}<b>万物属性</b><p>在世界里点任何东西——主角、妖兽、修士、灵宠、路过的人物——这里列出它的属性，${touch ? '数字左右拖动改，点一下直接输入' : '拖动数字就能改'}。</p><p>法宝匣里<b>${touch ? '长按' : '右键'}</b>任何条目（法术、法宝、妖兽……），改它的数据。</p><p class="sh-tip">只在试场里生效，出阵全部还原；每一改都能撤销（${touch ? '阵枢「⋯」里的 ↶' : 'Ctrl+Z'}）。</p>
      <div class="sh-acts"><button class="sh-btn sm jade" data-a="sel-player">看主角</button>${X.G()?.pets?.ent ? '<button class="sh-btn sm" data-a="sel-pet">看灵宠</button>' : ''}</div></div>`;
    cpKey = key;
    const th = sh.portrait ? `<img src="${esc(sh.portrait)}" alt="" onerror="this.remove()">` : sh.thumb ? (() => { const u = X.thumbs.get(sh.thumb); return u ? `<img src="${esc(u)}" alt="">` : ''; })() : '';
    const nChanged = sh.groups.reduce((s, gr) => s + gr.fields.filter((f) => X.changed(key, f)).length, 0);
    let h = `<div class="sh-sheet"><div class="sh-ih"><span class="sh-ph ${th ? 'pic' : ''}" style="--tone:${esc(sh.tone)}">${th || `<b>${esc(sh.glyph)}</b>`}</span><div><b>${esc(sh.title)}</b><small>${esc(sh.sub)}</small></div>
      <button class="sh-x" data-a="desel" title="不看了">×</button></div>
      <div class="sh-sbar"><button class="sh-btn sm ${nChanged ? '' : 'ghost'}" data-a="reset-all" ${nChanged ? '' : 'disabled'} title="把这张表里改过的都放回原值">恢复原值${nChanged ? ` · ${nChanged}` : ''}</button></div>`;
    if (sh.live) h += sh.live.map(([k, n]) => `<div class="sh-bar ${k}"><i data-live="${k}"></i><span data-live="${k}t">${n}</span></div>`).join('');
    if (sh.unit) h += `<div class="sh-bar hp"><i data-live="uhp"></i><span data-live="uhpt"></span></div><div class="sh-meter"><div><small>五息内每秒伤害</small><b data-live="dps">0</b></div><div><small>累计承伤</small><b data-live="dmg">0</b></div><canvas width="120" height="34" data-live="spark"></canvas></div>`;
    if (sh.note) h += `<p class="sh-note">${esc(sh.note)}</p>`;
    for (const gr of sh.groups) {
      const gid = `${key.split(':')[0]}|${gr.name}`, shut = D.closed.has(gid);
      h += `<div class="sh-grp ${shut ? 'shut' : ''}"><button class="sh-gh" data-grp="${esc(gid)}"><svg viewBox="0 0 10 10"><path d="M3.5 2L7 5 3.5 8"/></svg>${esc(gr.name)}<small>${gr.fields.length}</small></button><div class="sh-gb"><div>`;
      for (const f of gr.fields) {
        const i = cpFields.push(f) - 1, v = f.get(), ch = X.changed(key, f);
        const lab = `<label title="${esc([f.hint, f.orig && f.orig !== f.label ? `字段：${f.orig}` : ''].filter(Boolean).join('\n'))}">${esc(f.label)}${f.hint ? '<i class="sh-q">释</i>' : ''}</label>`;
        let ctl = '';
        if (f.type === 'number') ctl = `<div class="sh-scrub ${f.blank && v === undefined ? 'blank' : ''}" data-fi="${i}" data-v="${v ?? 0}" title="左右拖动改数值（Shift 快、Alt 细），双击直接输入"><b>${v === undefined ? '—' : fmtN(v)}</b><i></i></div>`;
        else if (f.type === 'bool') ctl = `<button class="sh-switch ${v ? 'on' : ''}" data-fi="${i}" data-fb="1"><i></i></button>`;
        else if (f.type === 'select') ctl = `<select class="sh-sel" data-fi="${i}">${(f.options ?? []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v ?? '') ? 'selected' : ''}>${esc(ol)}</option>`).join('')}${f.options?.some(([ov]) => String(ov) === String(v ?? '')) ? '' : `<option selected value="${esc(v ?? '')}">${esc(v ?? '—')}</option>`}</select>`;
        else if (f.type === 'seg') ctl = `<div class="sh-seg sm">${f.options.map(([ov, ol]) => `<button class="${ov === v ? 'on' : ''}" data-fi="${i}" data-fv="${esc(ov)}" style="--c:rgb(${X.TEAM_COL[ov] ?? '47,107,94'})">${esc(ol)}</button>`).join('')}</div>`;
        else if (f.type === 'color') ctl = `<label class="sh-color"><input type="color" data-fi="${i}" value="${toHex(v)}"><span style="background:${toCss(v)}"></span><code>${esc(v ?? '—')}</code></label>`;
        else if (f.type === 'text') ctl = `<input class="sh-txt" data-fi="${i}" value="${esc(v ?? '')}" maxlength="24">`;
        h += `<div class="sh-row ${ch ? 'changed' : ''}" data-row="${i}">${lab}${ctl}<button class="sh-rst" data-rst="${i}" title="恢复原值${ch ? '：' + esc(fmtAny(X.origOf(key, f))) : ''}" ${ch ? '' : 'tabindex="-1"'}>↺</button></div>`;
      }
      h += '</div></div></div>';
    }
    if (sh.acts?.length) h += `<div class="sh-acts">${sh.acts.map(([a, n, tone]) => `<button class="sh-btn sm ${tone ?? ''}" data-sa="${a}">${n}</button>`).join('')}</div>`;
    return h + '</div>';
  }
  const fmtN = (v) => { if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '—'); const a = Math.abs(v); return a >= 1e8 ? (v / 1e8).toFixed(2) + '亿' : a >= 1e5 ? (v / 1e4).toFixed(1) + '万' : a >= 100 ? String(Math.round(v)) : a >= 10 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 1000) / 1000); };
  const fmtAny = (v) => (typeof v === 'number' ? fmtN(v) : typeof v === 'boolean' ? (v ? '开' : '关') : v === undefined ? '（无）' : String(v));
  const toHex = (v) => { if (typeof v !== 'string') return '#888888'; if (/^#[0-9a-f]{6}$/i.test(v)) return v; const m = v.match(/^(\d+),\s*(\d+),\s*(\d+)$/); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : '#888888'; };
  const toCss = (v) => (typeof v === 'string' && /^\d+,\s*\d+,\s*\d+$/.test(v) ? `rgb(${v})` : typeof v === 'string' ? v : 'transparent');
  const setF = (i, v) => { const f = cpFields[i]; if (f && cpKey) X.setField(cpKey, f, v); };
  // 拖动改数（像拨算盘）：拖时只改显示，松手才生效；双击输入
  let scrubbing = null;
  tbody.addEventListener('pointerdown', (ev) => {
    const s = ev.target.closest('.sh-scrub'); if (!s || ev.button !== 0 || s.querySelector('input')) return;
    // 触屏：不拦默认动作——竖着划交给浏览器滚动（会发 pointercancel），横着拖才改数；不抢指针，等真横拖了再抢
    const tch = ev.pointerType !== 'mouse';
    scrubbing = { el: s, x: ev.clientX, y: ev.clientY, v0: +s.dataset.v, v: +s.dataset.v, moved: false, tch, id: ev.pointerId };
    if (!tch) { try { s.setPointerCapture(ev.pointerId); } catch { /* */ } ev.preventDefault(); }
    s.classList.add('drag');
  });
  tbody.addEventListener('pointercancel', () => { const d = scrubbing; if (!d) return; scrubbing = null; d.el.classList.remove('drag'); d.el.style.setProperty('--d', 0); d.el.querySelector('b') && (d.el.querySelector('b').textContent = fmtN(d.v0)); });
  tbody.addEventListener('pointermove', (ev) => {
    const d = scrubbing; if (!d) return;
    const s = d.el, f = cpFields[+s.dataset.fi], dx = ev.clientX - d.x;
    if (d.tch && !d.moved) { if (Math.abs(dx) < 8) return; d.moved = true; try { s.setPointerCapture(d.id); } catch { /* */ } }
    if (Math.abs(dx) > 2) d.moved = true; if (!f) return;
    const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1, step = f.step ?? 1;
    let v = d.v0 + Math.round(dx / 4) * step * k; v = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, v));
    if (step >= 1) v = Math.round(v); else v = Math.round(v / (step * (ev.altKey ? 0.1 : 1))) * step * (ev.altKey ? 0.1 : 1);
    d.v = +v.toFixed(6); s.querySelector('b').textContent = fmtN(d.v); s.style.setProperty('--d', Math.max(-1, Math.min(1, dx / 160)));
  });
  tbody.addEventListener('pointerup', () => {
    const d = scrubbing; if (!d) return; scrubbing = null;
    d.el.classList.remove('drag'); d.el.style.setProperty('--d', 0);
    if (d.moved && d.v !== d.v0) setF(+d.el.dataset.fi, d.v);
    else if (!d.moved && d.tch) editScrub(d.el);   // 触屏：点一下就弹输入框（手机没有双击习惯）
  });
  tbody.addEventListener('dblclick', (ev) => { const s = ev.target.closest('.sh-scrub'); if (s) editScrub(s); });
  function editScrub(s) {
    if (s.querySelector('input')) return;
    const f = cpFields[+s.dataset.fi]; if (!f) return;
    const cur = f.get();
    const inp = document.createElement('input'); inp.className = 'sh-scrin'; inp.inputMode = (f.min ?? -1) >= 0 ? 'decimal' : 'text'; inp.enterKeyHint = 'done'; inp.value = cur === undefined ? '' : Math.round(cur * 1e4) / 1e4;
    s.querySelector('b').replaceWith(inp); inp.focus({ preventScroll: true }); inp.select();
    let done = false;
    const fin = (ok) => { if (done) return; done = true; const v = parseFloat(inp.value); if (ok && Number.isFinite(v)) setF(+s.dataset.fi, Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, v))); else renderCP(); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); e.stopPropagation(); });
    inp.addEventListener('blur', () => fin(true), { once: true });
  }
  tbody.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.fi !== undefined && t.tagName === 'SELECT') { const f = cpFields[+t.dataset.fi]; const o = f?.options?.find(([ov]) => String(ov) === t.value); setF(+t.dataset.fi, o ? o[0] : t.value); return; }
    if (t.dataset.fi !== undefined && t.type === 'color') { const f = cpFields[+t.dataset.fi], old = f?.get(); const hex = t.value; const v = typeof old === 'string' && /^\d+,/.test(old) ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',') : hex; setF(+t.dataset.fi, v); return; }
    if (t.dataset.fi !== undefined && t.classList.contains('sh-txt')) { setF(+t.dataset.fi, t.value); return; }
    if (t.dataset.tp !== undefined) { const v = (D.toolParams[S.tool] ??= {}); v[t.dataset.tp] = t.type === 'number' ? +t.value : t.value; return; }
    if (t.dataset.set) setPref(t);
  });
  tbody.addEventListener('click', (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    if (t.dataset.tt) return;
    if (t.dataset.tg) { const g = t.closest('.sh-tg2'); g.classList.toggle('shut'); if (g.classList.contains('shut')) D.closed.add(t.dataset.tg); else D.closed.delete(t.dataset.tg); return; }
    if (t.dataset.tool) { stamp(t); setTool(S.tool === t.dataset.tool && t.dataset.tool !== 'props' ? 'props' : t.dataset.tool); if (touch && WORLD_NOW.has(S.tool)) setTimeout(doneT, 160); return; }
    if (t.dataset.grp) { const g = t.closest('.sh-grp'); g.classList.toggle('shut'); if (g.classList.contains('shut')) D.closed.add(t.dataset.grp); else D.closed.delete(t.dataset.grp); return; }
    if (t.dataset.fb) { const f = cpFields[+t.dataset.fi]; if (f) { stamp(t); setF(+t.dataset.fi, !f.get()); } return; }
    if (t.dataset.fv !== undefined && t.dataset.fi !== undefined) { stamp(t); setF(+t.dataset.fi, t.dataset.fv); return; }
    if (t.dataset.rst !== undefined) { const f = cpFields[+t.dataset.rst]; if (f && cpKey && X.changed(cpKey, f)) { stamp(t); X.resetField(cpKey, f); } return; }
    if (t.dataset.tpt === 'bool') { const v = (D.toolParams[S.tool] ??= {}); v[t.dataset.tp] = !v[t.dataset.tp]; t.classList.toggle('on', v[t.dataset.tp]); return; }
    if (t.dataset.sa) return sheetAct(t.dataset.sa, t);
    if (t.dataset.scene) { X.scene(t.dataset.scene); stamp(t); setTimeout(doneT, 160); return; }
    if (t.dataset.rule) { X.setCtl(t.dataset.rule, !S[t.dataset.rule]); renderCP(); return; }
    if (t.dataset.wx !== undefined) { X.setCtl('weather', t.dataset.wx || null); renderCP(); return; }
    if (t.dataset.sel) { X.select(t.dataset.sel); setTool('props'); return; }
    if (t.dataset.placeq) { const d = X.U.ENEMIES[t.dataset.placeq]; if (d) { X.startPlace({ id: d.id, name: d.name }); doneT(); } return; }
    if (t.dataset.tst) { S.toolOpt.status = t.dataset.tst; renderCP(); return; }
    if (t.dataset.tdur) { S.toolOpt.dur = +t.dataset.tdur; renderCP(); return; }
    if (t.dataset.tspd) { X.setCtl('speed', +t.dataset.tspd); renderCP(); return; }
    const seg = t.closest('.sh-seg'); if (seg?.dataset.k === 'tteam') { S.toolOpt.team = t.dataset.v; renderCP(); return; }
    const a = t.dataset.a; if (!a) return;
    stamp(t);
    if (a === 'go-world') doneT();
    else if (a === 'desel') X.select(null);
    else if (a === 'reset-all') X.resetAll(S.sel);
    else if (a === 'sel-player') X.select('player');
    else if (a === 'sel-pet') X.select('pet');
    else if (a === 'run') { const tl = X.toolById(S.tool), g = X.G(); if (tl && g) X.runTool(tl, { x: g.player.x + 260 * (Math.sin(g.player.st?.yaw ?? 1) >= 0 ? 1 : -1), y: g.player.y }, D.toolParams[S.tool]); }
    else if (a === 'heal-p') X.heal('player');
    else if (a === 'clear') X.clearAll();
    else if (a === 'rm-sel') X.remove(S.sel);
    else if (a === 'dup-sel') X.duplicate(S.sel);
    else if (a === 'home') X.scene('home');
    else if (a === 'gather') { const g = X.G(); let n = 0; for (const o of S.objs.values()) if (X.alive(o)) { X.bringHere(o.id); n++; } toast(`挪来 ${n} 个单位`); }
    else if (a === 'corpse-clear') { const c = S.corpses.splice(0); toast(`清理 ${c.length} 具尸身`); renderCP(); }
    else if (a === 'reset-thumbs') { X.thumbs.reset(); renderMain(); toast('缩略图重画中'); }
    else if (a === 'clear-fav') { for (const k of Object.keys(fav)) delete fav[k]; for (const k of Object.keys(rec)) delete rec[k]; store.set(FAVKEY, fav); store.set(RECKEY, rec); renderTree(); toast('收藏与最近已清空'); }
    else if (a === 'reset-ui') { Object.assign(P, { ic: 64, w: 0, names: true, tips: true, calm: false, box: true, tools: true, tw: 300 }); savePrefs(); applyPrefs(); renderSetTab(); }
    else if (a === 'mod-goto') gotoMod(t.dataset.mid, t.dataset.where);
  });
  function sheetAct(a) {
    const id = S.sel;
    if (a === 'heal') X.heal(id);
    else if (a === 'here') X.bringHere(id);
    else if (a === 'dup') X.duplicate(id);
    else if (a === 'rm') X.remove(id);
    else if (a === 'call' || a === 'spar' || a === 'drop') X.npcAct(id.slice(4), a);
    else if (a === 'def') { const sh = X.sheet(id); if (sh?.unit) X.select('data:enemies:' + sh.unit.def.id); else if (sh?.defLink) X.select(`data:${sh.defLink.table}:${sh.defLink.id}`); }
  }
  tools.querySelector('.sh-ttabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tt]'); if (!b) return; stamp(b); D.ttab = b.dataset.tt; renderTools(); });
  // ---- 模组 / 设置
  function renderModsTab() {
    const cat = X.catalog(), pages = modPages();
    const count = (mid) => { const n = {}; for (const k of ['human', 'beast', 'item', 'art', 'gongfa', 'pet']) n[k] = (cat[k] ?? []).filter((e) => e.mod === mid).length; return n; };
    const NAME = { human: '人物', beast: '妖兽', item: '物品', art: '法术', gongfa: '功法', pet: '灵宠' };
    tbody.innerHTML = `<div class="sh-mods">${(cat.mods ?? []).filter((m) => m.id !== 'shahe').map((m, i) => {
      const n = count(m.id), nt = cat.tool.filter((t) => t.mod === m.id).length, np = pages.filter((p) => p.mod === m.id).length;
      const parts = Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${NAME[k]} ${v}`);
      const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
      return `<div class="sh-modc" style="--i:${i}">${m.icon ? `<img src="${esc(m.icon)}" alt="">` : `<b>${esc(m.name[0])}</b>`}<div><b>${esc(m.name)}</b><small>${esc(m.version ?? '')}${m.author ? ' · ' + esc(m.author) : ''}</small>
        <p>${parts.length ? parts.join(' · ') : '没往匣里加东西'}${nt ? ` · 工具 ${nt}` : ''}${np ? ` · 整页 ${np}` : ''}</p>
        <span>${best?.[1] ? `<button class="sh-btn sm" data-a="mod-goto" data-mid="${esc(m.id)}" data-where="${best[0]}">看内容</button>` : ''}${nt ? `<button class="sh-btn sm" data-a="mod-goto" data-mid="${esc(m.id)}" data-where="tools">看工具</button>` : ''}</span></div></div>`;
    }).join('') || '<p class="sh-tip" style="padding:12px">除了试场自己，没有别的模组</p>'}</div>`;
  }
  function gotoMod(mid, where) {
    if (where === 'tools') { D.ttab = 'tools'; D.tq = ''; D.closed.delete('mod:' + mid); renderTools(); tbody.querySelector(`[data-tg="mod:${CSS.escape(mid)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    D.open.add('mods'); D.node[where] = 'mod:' + mid; openTab(where);
  }
  function renderSetTab() {
    tbody.innerHTML = `<div class="sh-sets">
      <h4>外来单位</h4>
      ${QUIET.map(([k, n]) => `<div class="sh-row"><label>${n}</label><button class="sh-switch ${S[k] ? 'on' : ''}" data-quiet="${k}"><i></i></button></div>`).join('')}
      <p class="sh-tip">开着时，野外刷怪、海兽、路人、劫道、别的模组生成的单位一律挡在阵外，已经进来的半息内清走；你落的子、同伴和灵宠不受影响。</p>
      <h4>界面</h4>
      ${touch ? '' : `<div class="sh-row"><label>图标大小</label><input type="range" min="40" max="120" step="4" value="${P.ic}" data-set="ic"></div>`}
      <div class="sh-row"><label>图标下显示名字</label><button class="sh-switch ${P.names ? 'on' : ''}" data-setb="names"><i></i></button></div>
      ${touch ? '' : `<div class="sh-row"><label>悬停说明</label><button class="sh-switch ${P.tips ? 'on' : ''}" data-setb="tips"><i></i></button></div>`}
      <div class="sh-row"><label>少些动效</label><button class="sh-switch ${P.calm ? 'on' : ''}" data-setb="calm"><i></i></button></div>
      ${touch ? '' : `<div class="sh-row"><label>工具栏宽</label><input type="range" min="240" max="460" step="10" value="${P.tw}" data-set="tw"></div>`}
      <div class="sh-acts"><button class="sh-btn sm" data-a="reset-thumbs">重画缩略图</button><button class="sh-btn sm" data-a="clear-fav">清空收藏与最近</button><button class="sh-btn sm ghost" data-a="reset-ui">界面复原</button></div>
      ${touch ? '<h4>手指操作</h4><p class="sh-tip">屏幕上方「试」药丸：匣＝法宝匣、具＝工具、⋯＝倍速 · 单步 · 撤销 · 清场 · 收起界面 · 出阵。<br>法宝匣里点一下用、长按改数据、点 ★ 收藏；挑好妖兽后点地面落子，底部的「取消」收手。<br>属性表：数字左右拖动改，点一下直接输入。</p>' : ''}
      <h4 class="sh-mkeys">按键</h4><p class="sh-keys sh-mkeys"><kbd>\`</kbd>/<kbd>F2</kbd> 收起 · 展开　<kbd>Esc</kbd> 收手 / 换回属性 / 取消选中　<kbd>Del</kbd> 移除选中　<kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销　<kbd>Ctrl</kbd>+<kbd>D</kbd> 复制选中<br>法宝匣：<kbd>左键</kbd> 用 · <kbd>右键</kbd> 改数据 · ★ 收藏　属性表：数字<kbd>左右拖</kbd>改，<kbd>双击</kbd>输入，<kbd>Shift</kbd> 快 <kbd>Alt</kbd> 细</p>
      <h4>给模组作者</h4><p class="sh-tip">登记试场工具：<code>(globalThis.__shaheTools ??= {})[模组id] = [{ name, desc, glyph, icon?, params?, act(ctx) }]</code>；登记整页：<code>(globalThis.__shahePages ??= {})[模组id] = [{ id, name, icon?, items?() | render?(el, sandbox) }]</code>。超过三页收进「更多 ▾」。</p></div>`;
  }
  function setPref(t) { const k = t.dataset.set; P[k] = +t.value; savePrefs(); applyPrefs(); }
  tbody.addEventListener('click', (ev) => { const q = ev.target.closest('[data-quiet]'); if (q) { const k = q.dataset.quiet; X.setCtl(k, !S[k]); q.classList.toggle('on', !!S[k]); return; } });
  tbody.addEventListener('click', (ev) => { const b = ev.target.closest('[data-setb]'); if (!b) return; const k = b.dataset.setb; P[k] = !P[k]; b.classList.toggle('on', P[k]); savePrefs(); applyPrefs(); });
  function renderMini() {
    const t = TOOLS.flatMap(([, ts]) => ts).find(([id]) => id === S.tool), tl = !t && X.toolById(S.tool);
    $('.sh-tmini').innerHTML = `${t ? ic(t[2]) : `<b>${esc(tl?.glyph ?? '工')}</b>`}<span>${esc(t ? t[1] : tl?.name ?? '工具')}</span>`;
  }

  // ---------------------------------------------------------------- 浮层、提示、实时刷新
  function float(el, text) { const f = document.createElement('i'); f.className = 'sh-float'; f.textContent = text; el.appendChild(f); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); setTimeout(() => f.remove(), 900); }
  function stamp(el) { el.classList.remove('stamp'); void el.offsetWidth; el.classList.add('stamp'); }
  function popOn(el, title, acts, desc) {
    const r = el.getBoundingClientRect();
    pop.innerHTML = `<b>${esc(title)}</b>${desc ? `<p>${esc(desc)}</p>` : ''}<div>${acts.map(([n], i) => `<button class="sh-btn sm ${i === 0 ? 'jade' : ''}" data-pi="${i}">${n}</button>`).join('')}</div>`;
    pop.hidden = false;
    const W = pop.offsetWidth, Hh = pop.offsetHeight;
    pop.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.right + 8 + W > innerWidth ? r.left - W - 8 : r.right + 8)) + 'px'; pop.style.top = Math.max(8, Math.min(innerHeight - Hh - 8, r.top)) + 'px';
    pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
    pop.onclick = (ev) => {
      const b = ev.target.closest('[data-pi]'); if (!b) return;
      const had = T.tools; acts[+b.dataset.pi][1](); stamp(b); setTimeout(closePop, 160);
      if (touch && !(T.tools && !had)) setTimeout(doneT, 120);   // 触屏：用完收起抽屉（刚打开属性的除外）
    };
  }
  function closePop() { let c = false; if (!pop.hidden) { pop.hidden = true; pop.classList.remove('in'); c = true; } if (closeMenu()) c = true; return c; }
  function openMenu(el, items) {
    const r = el.getBoundingClientRect();
    menu.innerHTML = items.map(([n, , on], i) => `<button class="${on ? 'on' : ''}" data-mi="${i}">${esc(n)}</button>`).join('');
    menu.hidden = false; const W = menu.offsetWidth;
    menu.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left)) + 'px'; menu.style.top = r.bottom + 4 + 'px';
    menu.classList.remove('in'); void menu.offsetWidth; menu.classList.add('in');
    menu.onclick = (ev) => { const b = ev.target.closest('[data-mi]'); if (!b) return; closeMenu(); items[+b.dataset.mi][1](); };
  }
  function closeMenu() { if (menu.hidden) return false; menu.hidden = true; return true; }
  root.addEventListener('pointerdown', (ev) => { if (!pop.hidden && !pop.contains(ev.target) && !ev.target.closest('.sh-cell')) { pop.hidden = true; } if (!menu.hidden && !menu.contains(ev.target) && !ev.target.closest('[data-a="more"]')) closeMenu(); }, true);
  let hintT = 0;
  function hint(html, ms) { const h = $('.sh-hint'); h.innerHTML = html; h.hidden = false; h.classList.remove('in'); void h.offsetWidth; h.classList.add('in'); clearTimeout(hintT); if (ms) hintT = setTimeout(() => { if (!S.place) h.hidden = true; }, ms); }
  function toast(s, tone = 'info') { const t = $('.sh-toast'); t.textContent = s; t.className = 'sh-toast show ' + tone; clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'sh-toast'; }, 3200); }
  function feed(e) {
    if (!S.active) return;
    const f = $('.sh-feed'), p = document.createElement('p'); p.className = e.tone; p.innerHTML = `<i>${fmt(e.t)}</i>${esc(e.text)}`;
    f.appendChild(p); while (f.children.length > 5) f.firstChild.remove();
    setTimeout(() => p.classList.add('out'), 5200); setTimeout(() => p.remove(), 6000);
    if (S.tool === 'log') { const l = tbody.querySelector('.sh-log'); if (l) l.outerHTML = logHtml(); }
    if (D.tab === 'field' && D.node.field === 'log') renderMain();
  }
  function placing() {
    const h = $('.sh-hint');
    grid.querySelectorAll('.sh-cell').forEach((c) => c.classList.toggle('placing', c.dataset.id === S.place?.id));
    if (S.place && !touch) hint(`<b>${esc(S.place.name)}</b> 落子中　<kbd>左键</kbd> 落下（可连点）　<kbd>右键</kbd>/<kbd>Esc</kbd> 收手`);
    else h.hidden = true;
    if (S.tool === 'spawn') renderCP();
    renderMode();
  }
  // 触屏：底部操作条——落子中（名字、数量、取消），或者正拿着一件「到场上点」的工具（说明、换工具、完成）
  var modeKey = '';   // eslint-disable-line no-var -- applyPrefs 在建界面时就会调到 renderMode，用 var 免得撞上暂时性死区
  function renderMode() {
    const el = root.querySelector('.sh-modebar'); if (!el) return;
    const tl = S.active && S.tool?.startsWith?.('mod:') ? X.toolById(S.tool) : null;
    const on = touch && S.active && !hud.hidden && S.hud && !(T.box || T.tools) && (S.place || WORLD_TOOL[S.tool] || tl);
    if (!on) { if (!el.hidden) { el.hidden = true; modeKey = ''; } return; }
    const key = S.place ? `p|${S.place.id}|${S.opt.count}|${S.opt.follow ? 'ally' : S.opt.team}` : `t|${S.tool}`;
    if (key === modeKey && !el.hidden) return; modeKey = key;
    if (S.place) {
      const e = [...entriesOf('beast'), ...entriesOf('human')].find((x) => x.id === S.place.id);
      const team = S.opt.follow ? 'ally' : S.opt.team;
      el.innerHTML = `<span class="sh-mth">${e ? thumbHtml(e) : '<b class="sh-glyph">子</b>'}</span><div class="sh-mtx"><b>${esc(S.place.name)}</b><small><i style="--c:rgb(${X.TEAM_COL[team] ?? '168,53,42'})"></i>${esc(X.TEAM_NAME[team] ?? '')} · 点地面落下，可连点</small></div>
        <div class="sh-step"><button data-mn="-1" aria-label="少一个">−</button><b>${S.opt.count}</b><button data-mn="1" aria-label="多一个">＋</button></div>
        <button class="sh-btn bad" data-a="place-stop">取消</button>`;
    } else {
      const t = TOOLS.flatMap(([, ts]) => ts).find(([id]) => id === S.tool);
      el.innerHTML = `<span class="sh-mth">${t ? ic(t[2]) : `<b class="sh-glyph" style="--tone:${esc(tl?.tone ?? '#7a3a5a')}">${esc(tl?.glyph ?? '工')}</b>`}</span><div class="sh-mtx"><b>${esc(t ? t[1] : tl?.name ?? '工具')}</b><small>${esc(WORLD_TOOL[S.tool] ?? '点地面施放')}</small></div>
        <button class="sh-btn" data-a="mode-tools">设置</button><button class="sh-btn bad" data-a="mode-stop">完成</button>`;
    }
    el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    placeMode();
  }
  /** 操作条放在摇杆和右下按钮列之间；放不下（竖屏）就抬到它们上面 */
  function placeMode() {
    const el = root.querySelector('.sh-modebar'); if (!el || el.hidden) return;
    const box = (sel) => { let r = null; for (const c of document.querySelectorAll(sel)) { const b = c.getBoundingClientRect(); if (!b.width || !b.height) continue; r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right) } : { l: b.left, t: b.top, r: b.right }; } return r; };
    const L = box('.game-root .hud > .hz-bl > *'), R = box('.game-root .hud > .hz-br > *'), w = el.offsetWidth;
    let x = innerWidth / 2, y = null;
    if (L || R) {
      const a = L ? L.r + 8 : 8, b = R ? R.l - 8 : innerWidth - 8;
      if (b - a >= w) x = Math.min(Math.max((a + b) / 2, a + w / 2), b - w / 2);
      else y = Math.min(L?.t ?? innerHeight, R?.t ?? innerHeight) - 8;   // 抬到摇杆 / 按钮列上面
    }
    el.style.left = Math.round(x) + 'px';
    if (y !== null) el.style.bottom = Math.max(8, Math.round(innerHeight - y)) + 'px'; else el.style.removeProperty('bottom');
  }
  root.querySelector('.sh-modebar').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return; stamp(b);
    if (b.dataset.mn) { S.opt.count = Math.max(1, Math.min(50, S.opt.count + +b.dataset.mn)); renderMode(); if (D.tab === 'beast' || D.tab === 'human') renderOpts(); return; }
    const a = b.dataset.a;
    if (a === 'place-stop') X.stopPlace();
    else if (a === 'mode-stop') setTool('props');
    else if (a === 'mode-tools') show('tools', true);
  });
  function live() {
    dockTop(); placeMode();
    if (!S.active || hud.hidden) return;
    const ck = $('.sh-clock'); if (ck) ck.textContent = fmt((performance.now() - S.t0) / 1000);
    const g = X.G(); if (!g) return;
    const cp = tbody.querySelector('.sh-cp');
    if (cp && S.tool === 'props' && cpKey) {
      const set = (k, f) => { const el = cp.querySelector(`[data-live="${k}"]`); if (el) f(el); };
      if (cpKey === 'player') {
        const h = g.hero, s = g.stats;
        set('hp', (el) => { el.style.width = (h.hp * 100).toFixed(1) + '%'; }); set('hpt', (el) => { el.textContent = `气血 ${fmtN(h.hp * s.hp)} / ${fmtN(s.hp)}`; });
        set('mp', (el) => { el.style.width = (h.mp * 100).toFixed(1) + '%'; }); set('mpt', (el) => { el.textContent = `法力 ${fmtN(h.mp * s.mp)} / ${fmtN(s.mp)}`; });
      } else if (/^S\d+$/.test(cpKey)) {
        const o = S.objs.get(cpKey);
        if (o) {
          const e = o.e;
          set('uhp', (el) => { el.style.width = (100 * Math.max(0, e.hp) / e.maxHp).toFixed(1) + '%'; }); set('uhpt', (el) => { el.textContent = `${fmtN(Math.max(0, e.hp))} / ${fmtN(e.maxHp)}`; });
          set('dps', (el) => { el.textContent = Math.round(X.dps(o)); }); set('dmg', (el) => { el.textContent = Math.round(o.dmg); });
          set('spark', (cv) => spark(cv, o));
        }
      }
      for (const s of cp.querySelectorAll('.sh-scrub')) {
        if (scrubbing?.el === s || s.querySelector('input')) continue;
        const f = cpFields[+s.dataset.fi]; if (!f) continue;
        let v; try { v = f.get(); } catch { continue; }
        if (v === undefined) continue;
        if (+s.dataset.v !== v) { s.dataset.v = v; s.querySelector('b').textContent = fmtN(v); }
      }
    }
    const tn = root.querySelector('[data-live="tname"]'); if (tn) tn.textContent = g.timeName?.() ?? '';
    for (const b of root.querySelectorAll('.sh-unit')) { const o = S.objs.get(b.dataset.sel); const em = b.querySelector('em'); if (o && em) em.style.width = Math.round(100 * Math.max(0, o.e.hp) / o.e.maxHp) + '%'; }
  }
  function spark(cv, o) {
    const c = cv.getContext('2d'), W = cv.width, Hh = cv.height, t = performance.now(), N = 25, bins = new Array(N).fill(0);
    for (const [ht, a] of o.hits) { const k = Math.floor((t - ht) / 200); if (k >= 0 && k < N) bins[N - 1 - k] += a; }
    const m = Math.max(1, ...bins); c.clearRect(0, 0, W, Hh);
    bins.forEach((v, i) => { const h = v / m * (Hh - 4); c.fillStyle = i === N - 1 ? '#a8352a' : 'rgba(47,107,94,0.75)'; c.fillRect(i * (W / N) + 1, Hh - h, W / N - 2, h); });
  }
  let liveTimer = null, objsRaf = 0;
  let resizeT = 0, inspSel = null;
  const onResize = () => {
    if (!touch && narrow() && P.box && P.tools) { P.tools = false; applyPrefs(); }
    moveInk($('.sh-tabs .sh-tab.on'));
    // 主界面转屏 / 接鼠标后会重判触屏（约 120ms 后），晚一点跟上
    clearTimeout(resizeT); resizeT = setTimeout(() => { syncTouch(); dockKey = ''; dockTop(); }, 220);
  };
  addEventListener('resize', onResize);

  // ---------------------------------------------------------------- 对外
  return {
    gate, toast, feed, placing, closePop, thumbsReady, setTool,
    recent: (tab, id) => pushRecent(tab, id),
    toolParams: (tid) => D.toolParams[tid] ?? {},
    entered() {
      const ink = $('.sh-ink'); if (D.title) { D.title = false; ink.className = 'sh-ink fade'; setTimeout(() => { ink.className = 'sh-ink'; }, 700); }
      D.tab = TABS.some((t) => t.id === D.tab) || modPages().some((p) => p.key === D.tab) ? D.tab : 'beast';
      touch = touchNow(); root.classList.toggle('sh-touch', touch); T.box = T.tools = false; inspSel = null;   // 触屏：两块抽屉默认收起
      if (!touch && narrow() && P.box && P.tools) P.tools = false;
      hud.hidden = false; hud.classList.remove('in', 'tucked'); void hud.offsetWidth; hud.classList.add('in');
      applyPrefs();
      renderTop(); renderTabs(); renderBox(true); renderTools(); renderMini(); renderMode();
      dockKey = ''; dockTop(); requestAnimationFrame(() => { dockKey = ''; dockTop(); });
      clearInterval(liveTimer); liveTimer = setInterval(live, 200); $('.sh-feed').innerHTML = '';
    },
    exited() { hud.hidden = true; closePop(); clearInterval(liveTimer); $('.sh-hint').hidden = true; tip.hidden = true; cpKey = null; $('.sh-top').classList.remove('open'); renderMode(); dockTop(); },
    hud() { hud.classList.remove('in'); hud.classList.toggle('tucked', !S.hud); $('.sh-top').classList.remove('open'); if (!S.hud) { closePop(); tip.hidden = true; } renderMode(); },
    dock: () => { if (S.active) renderTop(); },
    insp() {
      if (!S.active) return;
      if (S.tool === 'props' || S.tool === 'units' || S.tool === 'copy' || S.tool === 'remove') renderCP();
      // 触屏只在「新点选了一样东西」时拉开抽屉（改数、撤销时不再自己弹出来）
      const fresh = S.sel !== inspSel; inspSel = S.sel;
      if (S.sel && S.tool === 'props' && !isOpen('tools') && (!touch || fresh)) show('tools', true);
    },
    objs() {
      if (!S.active || objsRaf) return;
      objsRaf = requestAnimationFrame(() => {
        objsRaf = 0;
        if (D.tab === 'field' && (D.node.field ?? 'scenes') === 'units' && !grid.contains(document.activeElement)) renderMain();
        if (S.tool === 'units' || S.tool === 'corpse') renderCP();
        if (D.tab === 'status') renderOpts();
      });
    },
    presets() { if (D.tab === 'preset') { renderTree(); renderMain(); } },
    destroy() {
      clearInterval(liveTimer); clearTimeout(resizeT); removeEventListener('resize', onResize); document.removeEventListener('pointerdown', closeTopX, true);
      document.documentElement.classList.remove('sh-on'); for (const v of ['--sh-top-pad', '--sh-top-pl', '--sh-top-pr']) document.documentElement.style.removeProperty(v);
      root.remove(); style.remove();
    },
  };
}
