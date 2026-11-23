// 第四～六步的界面：对话、交易、城镇、拍卖会、红颜录、大事记
import { ChatBox } from './ChatBox';
import { modx } from '../mod/hooks';
import { ModUiNodes, ModSlot } from './ModUi';
import type { AuctionLot } from '../world/town';
import { cityTier, TIER_NAME } from '../data/market';
import { bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import { TUNING } from '../data/tuning';
import { RANKS, rankOf, SECT_DEF, SECT_DEFS, sectTitle } from '../world/roster';
import { memo, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Game } from '../world/game';
import type { DNode, DOpt, Shop, ShopStock } from '../world/modal';
import type { LocDef } from '../data/world';
import { LOC_BY_ID, locHere, ACTIVE_WORLD } from '../data/world';
import { WORLDS, worldCurrencyId, worldCurrencyName } from '../data/worldHierarchy';
import { itemDef } from '../data/items';
import { REALMS, realmDef, realmName } from '../data/realms';
import { BEAUTIES } from '../data/beauties';
import { CharState, drawCharacter, Look } from '../gfx/character';
import { SECT_RANKS, repName } from '../world/worldstate';
import * as C from '../world/cultivation';
import { audio } from '../world/audio';
import { ItemGlyph } from './ItemIcon';
import { TIER_COLOR as REL_COLOR, SECT_ALLY, allyGroup, SECT_HOSTILE, SECT_SIEGE, SECT_ELDER } from '../world/relations';
import type { Tier } from '../world/relations';
import type { Rank } from '../world/roster';
import type { NpcData } from '../world/npc';
import { PERS_NAME } from '../world/npc';
import { portraitFor } from '../data/portraits';
import { LifeCard, WorldChronicle } from './LivingUI';
import { FriendsBody } from './FriendsPanel';
import { PojinPanel } from './Pojin';
import { SectPanel } from './SectPanel';
import { dirName } from '../world/sites';

const TIER_COLOR = ['#5a544a', '#2f6b5e', '#2b5a8a', '#7a3a9a', '#b8802a', '#a8352a', '#d04a20'];
const TYPE_NAME: Record<string, string> = { pill: '丹药', herb: '灵草', material: '材料', talisman: '符箓', scroll: '功法', artifact: '法宝', misc: '杂物' };
const click = () => audio.sfx('click');

function useModal(game: Game) { return useSyncExternalStore((f) => game.subscribeModal(f), () => game.modal, () => game.modal); }

function ModalLayerInner({ game }: { game: Game }) {
  const m = useModal(game);
  if (!m) return null;
  if (m.kind === 'dialog') return <DialogBox key="dlg" game={game} node={m.node} />;
  if (m.kind === 'shop') return <ShopPanel game={game} shop={m.shop} />;
  if (m.kind === 'town') return <TownPanel game={game} loc={m.loc} fac={m.fac} />;
  if (m.kind === 'auction') return <AuctionPanel game={game} loc={m.loc} />;
  if (m.kind === 'hearts') return <HeartsPanel game={game} />;
  if (m.kind === 'chronicle') return <ChroniclePanel game={game} />;
  if (m.kind === 'relations') return <RelationsPanel game={game} initialTab={m.tab} />;
  if (m.kind === 'help') return <HelpPanel game={game} />;
  if (m.kind === 'sect') return <SectPanel game={game} initialTab={m.tab} onClose={() => game.closeModal()} />;
  if (m.kind === 'pojin') return <PojinPanel game={game} puzzle={m.puzzle} />;
  if (m.kind === 'mod') return <ModUiPanel key={m.mod + ':' + m.panel} game={game} mod={m.mod} panel={m.panel} />;
  return null;
}

/**
 * v0.71：弹窗外面包一层 memo。
 * 主循环每 0.18s 刷一次 HUD（`game.ui` 换新对象 → GameView 重渲染），而弹窗原先是 GameView 的子节点，
 * 于是面板里的名册（几百行）也跟着一秒重渲染五六次，点击要排在它后面——「点了半天才反应」。
 * 弹窗自己订阅模态变化（useModal），父组件的重渲染与它无关，这条路断掉即可。
 */
export const ModalLayer = memo(ModalLayerInner);

// ---------------------------------------------------------------- v0.56：模组面板（模组只给声明式的内容，这里负责画）
function ModUiPanel({ game, mod, panel }: { game: Game; mod: string; panel: string }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, []);
  const p = modx?.panel(mod, panel);
  if (!p) return null;
  return (
    <Scroll title={p.title} sub={p.sub} onClose={() => game.closeModal()} cls="mod-ui-panel">
      <div className="mui-body"><ModUiNodes nodes={p.nodes} mod={mod} onChange={() => force((x) => x + 1)} /></div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 代码绘制的半身像（非红颜 NPC 不使用 AI 立绘）
export function Bust({ look, w = 150, h = 190 }: { look: Look; w?: number; h?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(look);
  lookRef.current = look;
  const lookKey = JSON.stringify(look);
  useEffect(() => {
    const cv = ref.current!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    const curLook = lookRef.current;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d')!;
    const S = 5.2 * (w / 150) * dpr;
    const st = new CharState(cv.width / 2, cv.height * 0.3 + 86 * S * curLook.height);
    st.yaw = st.targetYaw = 0; st.t = 0; st.setAction('idle'); (st as any).blend = 1; (st as any).seed = 3;
    let raf = 0, last = performance.now();
    for (let i = 0; i < 40; i++) { st.update(1 / 60); g.save(); drawCharacter(g, lookRef.current, st, S, 1 / 60, { portrait: true }); g.restore(); g.clearRect(0, 0, cv.width, cv.height); }
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      st.update(dt);
      g.clearRect(0, 0, cv.width, cv.height);
      g.save(); drawCharacter(g, lookRef.current, st, S, dt, { portrait: true }); g.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lookKey, w, h]);
  return <canvas ref={ref} className="bust" style={{ width: w, height: h }} />;
}

// ---------------------------------------------------------------- 对话
const TOUCH_UI = IS_TOUCH;
/** 触屏没有键盘：把「（按 G）」「（靠近山门按 E）」这类括注去掉，免得手机上看着像坏了 */
const stripKeys = (s: string) => TOUCH_UI
  ? s.replace(/[（(][^（）()]{0,14}?按\s*[A-Za-z0-9?？↑↓←→][^（）()]{0,8}?[)）]/g, '')
      .replace(/[（(]\s*(?:键盘)?\s*[A-Za-z]\s*键\s*[)）]/g, '')
  : s;

function DialogBox({ game, node }: { game: Game; node: DNode }) {
  const [shown, setShown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const full = stripKeys(node.text);
  useEffect(() => {
    setShown(0);
    let n = 0;
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      n += 2;
      setShown(n);
      if (n >= full.length && timer.current) { clearInterval(timer.current); timer.current = null; }
    }, 22);
    return () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  }, [full]);
  /** 立即显示整段：先停掉打字定时器，否则下一帧会用旧的 n 把文字改回去 */
  const finish = () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setShown(full.length);
  };
  const done = shown >= full.length;
  const portrait = portraitFor(node, game.npcs?.list);
  const pick = (o: DOpt) => {
    if (o.disabled) return;
    audio.sfx(o.tone === 'love' ? 'chime' : 'click');
    const before = game.modal;
    const nx = o.act?.();
    if (nx) game.openDialog(nx);
    else if (game.modal === before) game.closeModal();
  };
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;   // 正在打字
      if (!done) { if (e.key === ' ' || e.key === 'Enter') finish(); return; }
      const i = +e.key - 1; if (i >= 0 && i < node.options.length) pick(node.options[i]);
    };
    window.addEventListener('keydown', kd); return () => window.removeEventListener('keydown', kd);
  });
  return (
    <div className="dlg-mask">
      <div className={'dlg ' + (node.mood ?? 'normal') + (node.chat && game.chat?.available ? ' has-chat' : '')} onClick={finish}>
        <div className="dlg-face">
          {portrait ? <div className="dlg-portrait" style={{ backgroundImage: `url(${portrait})` }} /> : node.look ? <Bust look={node.look} /> : <div className="dlg-seal">{node.speaker.slice(0, 1)}</div>}
        </div>
        <div className="dlg-main">
          <div className="dlg-head"><span className="dlg-name">{node.speaker}</span>{node.title && <span className="dlg-title">{node.title}</span>}</div>
          <div className="dlg-text">{full.slice(0, shown).split('\n').map((l, i) => <p key={i}>{l || '\u00a0'}</p>)}</div>
          {done && <div className="dlg-opts">
            {node.options.map((o, i) => (
              <button key={i} className={'dlg-opt' + (o.tone ? ' ' + o.tone : '')} disabled={o.disabled} onClick={(e) => { e.stopPropagation(); pick(o); }} title={o.hint}>
                <kbd>{i + 1}</kbd>{o.label}{o.disabled && o.hint && <small>（{o.hint}）</small>}
              </button>
            ))}
          </div>}
          {node.chat && game.chat?.available && <ChatBox game={game} target={node.chat} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 卷轴面板
export function Scroll({ title, sub, onClose, children, wide, cls }: { title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; cls?: string }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className={'scroll-panel cult-panel' + (wide ? ' wide' : '') + (cls ? ' ' + cls : '')} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><div className="panel-title">{title}</div><div className="panel-sub">{sub}</div><button className="close-btn" onClick={() => { click(); onClose(); }}>×</button></div>
        <div className="cult-body">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 交易
function ShopPanel({ game, shop }: { game: Game; shop: Shop }) {
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [talk, setTalk] = useState(false);
  const h = game.hero;
  const contrib = shop.currency === 'contrib';
  const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
  const money = contrib ? game.ws.sect?.contrib ?? 0 : C.bagCount(h, curId);
  const unit = contrib ? '贡献' : curName;
  const sellable = h.bag.filter((b) => b.id !== 'mat_lingshi' && b.id !== 'mat_lingjing' && b.id !== 'mat_xianyuan' && itemDef(b.id).price > 0 && itemDef(b.id).type !== 'misc');
  return (
    <Scroll title={shop.title.split(' · ').pop()!} sub={<span>{shop.title.split(' · ')[0]}　{shop.desc}　·　{unit} <b>{money}</b></span>} onClose={() => game.closeModal()} wide>
      {!contrib && game.chat?.available && <div className="shop-chat">{talk ? <ChatBox game={game} target={{ kind: 'keeper', shop }} compact /> : <button className="ink-btn ghost" onClick={() => setTalk(true)}>与{game.chat.nameOf({ kind: 'keeper', shop })}搭话（可以讲价）</button>}</div>}
      {!shop.noSell && <div className="tabs"><button className={mode === 'buy' ? 'on' : ''} onClick={() => setMode('buy')}>买入</button><button className={mode === 'sell' ? 'on' : ''} onClick={() => setMode('sell')}>卖出</button></div>}
      <div className="shop-list">
        {mode === 'buy' && shop.stock.map((s: ShopStock, i) => {
          const d = itemDef(s.id);
          const exposedFake = !!(s.fake && s.ident);
          const canProbe = !!shop.isStall && !s.ident && (d.type === 'pill' || d.type === 'scroll');
          return (
            <div key={s.id + i} className="shop-row">
              <ItemGlyph id={d.id} className="glyph" style={{ color: exposedFake ? '#b8302a' : TIER_COLOR[d.tier] }} />
              <div className="sr-main">
                <div className="sr-name" style={{ color: exposedFake ? '#b8302a' : TIER_COLOR[d.tier] }}>
                  {exposedFake ? `【伪劣】假${d.name}` : d.name}
                  <small className="sr-type">{TYPE_NAME[d.type]}{s.sellerName ? ` · 摊主 ${s.sellerName}` : ''}</small>
                </div>
                <div className="sr-desc">{exposedFake ? '已被神识识破的染色假丹/残缺伪简，切莫购买！' : d.desc}</div>
              </div>
              <div className="sr-buy"><div className="sr-price">{s.price} {unit}</div><small>余 {s.n}{s.quota !== undefined && s.quota <= 3 ? <b style={{ color: '#c98a4a' }}> · 本月仅剩</b> : ''}</small>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {canProbe && <button className="ink-btn small ghost" title="耗少许法力以神识辨认地摊货真伪" onClick={() => { const res = game.renxin.probeShopItem(s); game.toast(res.msg, res.spottedFake ? 'warn' : 'info'); audio.sfx(res.spottedFake ? 'fail' : 'click'); re(); }}>掌眼</button>}
                  <button className="ink-btn small" disabled={money < s.price || exposedFake} onClick={() => { if (game.towns.buy(shop, s, 1)) audio.sfx('chime'); re(); }}>{exposedFake ? '假货' : '购买'}</button>
                  {!exposedFake && s.n > 1 && ([5, 10] as const).filter((q) => s.n >= q).map((q) => (
                    <button key={q} className="ink-btn small ghost" disabled={money < s.price * q} onClick={() => { if (game.towns.buy(shop, s, q)) audio.sfx('chime'); re(); }}>{`×${q}`}</button>
                  ))}
                  {!exposedFake && s.n > 1 && (
                    <button className="ink-btn small ghost" disabled={money < s.price} onClick={() => { const maxQ = s.price > 0 ? Math.min(s.n, Math.floor(money / s.price)) : s.n; if (maxQ > 0 && game.towns.buy(shop, s, maxQ)) audio.sfx('chime'); re(); }}>全买</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {mode === 'buy' && !shop.stock.length && <div className="hint">货架已空。</div>}
        {mode === 'sell' && sellable.map((b, i) => {
          const d = itemDef(b.id);
          const p = game.towns.sellPrice(shop, b.id, b.age ?? 0);
          return (
            <div key={b.id + i + (b.age ?? '')} className="shop-row">
              <ItemGlyph id={d.id} className="glyph" style={{ color: TIER_COLOR[d.tier] }} />
              <div className="sr-main"><div className="sr-name" style={{ color: TIER_COLOR[d.tier] }}>{d.name}<small className="sr-type">持有 {b.n}</small></div><div className="sr-desc">{d.desc}</div></div>
              <div className="sr-buy"><div className="sr-price">{p} {curName}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="ink-btn small ghost" onClick={() => { game.towns.sell(shop, b.id, b.age, 1); click(); re(); }}>卖出</button>
                  {b.n > 1 && ([5, 10] as const).filter((q) => b.n >= q).map((q) => (
                    <button key={q} className="ink-btn small ghost" onClick={() => { game.towns.sell(shop, b.id, b.age, q); click(); re(); }}>{`×${q}`}</button>
                  ))}
                  {b.n > 1 && (
                    <button className="ink-btn small ghost" onClick={() => { game.towns.sell(shop, b.id, b.age, b.n); click(); re(); }}>全卖</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 城镇
function TownPanel({ game, loc, fac }: { game: Game; loc: LocDef; fac?: string }) {
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [tp, setTp] = useState(fac === 'teleport');
  const T = game.towns, h = game.hero;
  const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
  const restCost = ACTIVE_WORLD === 'human' ? (loc.type === 'city' ? 5 : 2) : 1;
  const occupied = T.occupied(loc);
  const isSect = loc.type === 'sect';
  const big = loc.type === 'city' || loc.type === 'isle' || loc.id === 'tainan';
  type F = { seal: string; name: string; desc: string; act: () => void; dis?: string; cls?: string; key?: string };
  const fs: F[] = [];
  if (isSect) fs.push({ seal: '宗', name: loc.id === 'mysect' ? '宗主大殿' : game.ws.sect?.id === loc.id ? '宗门事务' : '山门', desc: loc.id === 'mysect' ? '门人名册、收徒、藏经阁、宗门建设、库房、亲卫、宗门战事' : game.ws.sect?.id === loc.id ? `${SECT_RANKS[game.ws.sect.rank]} · 贡献 ${game.ws.sect.contrib}　任务、藏经阁、俸禄、晋升` : '拜入宗门，领取俸禄与任务', act: () => (loc.id === 'mysect' ? game.openModal({ kind: 'sect' }) : game.openDialog(T.sectNode(loc))), cls: 'gold' });
  if (!occupied) {
    fs.push({ seal: '市', name: '坊市', desc: '灵草、材料、符箓杂货', act: () => game.openShop(T.shop(loc, 'market')) });
    fs.push({ seal: '丹', name: '丹药铺', desc: '聚气丹、疗伤丹……货随产地（南荒筑基丹归七派把持）', act: () => game.openShop(T.shop(loc, 'pill')) });
    if (!isSect) fs.push({ seal: '摊', name: '鬼市地摊', desc: '散修私摊：偶有三折奇珍可捡漏，亦混有染色假丹与残篇玉简', act: () => game.openShop(game.renxin.ghostMarketShop(loc)) });
    fs.push({ seal: '鉴', name: '丹师掌眼', desc: '请坐堂老丹师查验丹药与功法玉简真伪，免遭假药反噬', act: () => game.openDialog(game.renxin.masterAppraiseNode(loc)) });
    if (big || isSect) fs.push({ seal: '器', name: '法器阁', desc: '飞剑、法盾、成套法器', act: () => game.openShop(T.shop(loc, 'artifact')) });
    if (big || isSect) fs.push({ seal: '符', name: '符箓斋', desc: '符箓与法术玉简', act: () => game.openShop(T.shop(loc, 'talisman')) });
  }
    if (!isSect && cityTier(loc) >= 3) fs.push({ seal: '宅', name: '宅务牙行', desc: '买一座洞府——牙人拍着胸口说灵脉是他亲手勘过三次的（天道篇：话信三分就好）', act: () => game.openDialog(game.pianju.brokerNode(loc)) });
  if (!isSect) fs.push({ seal: '酒', name: '酒楼', desc: '打听消息、传闻、秘境下落', act: () => game.openDialog(T.tavern(loc)) });
  if (!isSect || big) fs.push({ seal: '赏', name: '悬赏榜', desc: `缉拿凶徒、斩除妖兽，赏金由坊市担保（已接 ${(game.ws.bounties ?? []).filter((b) => !b.done && b.until > game.day).length}/3）`, act: () => game.openDialog(game.happen.boardNode(loc.id, loc.name)) });
  fs.push({ seal: '栈', name: isSect ? '洞府' : '客栈', desc: isSect ? '歇息一夜，自动存档' : `住店一晚（${restCost} ${curName}），气血法力尽复，自动存档`, act: () => { T.rest(loc); re(); } });
  if (T.hasTeleport(loc)) fs.push({ seal: '阵', name: '传送阵', desc: `已激活 ${game.ws.tp.filter((id) => locHere(id)).length} 处，按路程收取${curName}`, act: () => setTp(!tp) });
  if (T.isMajorTown(loc)) { const auc = T.auctionSchedule(loc); fs.push({ seal: '拍', name: '拍卖会', desc: auc.open ? `正在举行（还剩 ${auc.leftDays} 日）` : `每 ${auc.period} 日一届，${auc.waitDays} 日后开拍`, act: () => game.openModal({ kind: 'auction', loc }), dis: auc.open ? undefined : '尚未开拍', cls: auc.open ? 'gold' : '' }); }
  { const ob = game.happen.obtain.facility(loc.id); if (ob) fs.push({ seal: '客', name: ob.name, desc: ob.desc, act: () => game.openDialog(game.happen.obtain.node()), cls: 'gold' }); }
  for (const b of BEAUTIES) if (b.home === loc.id) { const s = game.ws.hearts[b.id]; const n = game.npcs.byId.get('b_' + b.id); if (n?.alive && (n.map ?? 'renjie') === loc.map && Math.hypot(n.x - loc.x * 300, n.y - loc.y * 300) < 8000) fs.push({ seal: '缘', name: s?.met ? `拜访${b.name}` : '传闻中的仙子', desc: s?.met ? b.title : '听说此地住着一位女修……', act: () => game.hearts.talk(b.id), cls: 'love' }); }
  if (modx) for (const f of modx.townFacs(loc)) fs.push(f);   // v0.56：模组加的事务
  const SEAL_KEY: Record<string, string> = { 宗: 'sect', 市: 'market', 丹: 'pill', 器: 'artifact', 符: 'talisman', 宅: 'broker', 酒: 'tavern', 赏: 'board', 栈: 'rest', 阵: 'teleport', 拍: 'auction' };
  for (const f of fs) f.key = SEAL_KEY[f.seal];
  // 第二十二步：从铺子门口进来——直接办事（铺子不开时，仍显示城镇总览）
  const facDone = useRef(false);
  useEffect(() => {
    if (!fac || facDone.current || fac === 'teleport') return;
    facDone.current = true;
    const f = fs.find((x) => x.key === fac);
    if (f && !f.dis) { f.act(); if (fac === 'rest') game.closeModal(); }
    else if (!f) game.toast(occupied ? '铺门紧闭，此地已被魔道占据。' : '此处暂不营业。', 'warn');
    else game.toast(f.dis!, 'warn');
  }, []);
  const tps = game.ws.tp.map((id) => locHere(id)!).filter((l) => l && l.id !== loc.id);   // 只列本图的传送阵
  return (
    <Scroll title={loc.name} sub={<span>【{TIER_NAME[cityTier(loc)]}】{(() => { const [y, j] = game.garrison.count(loc); return y + j ? `坐镇：${loc.map === 'xianjie' ? `金仙/玄仙 ${y} · 真仙 ${j}` : loc.map === 'lingjie' ? `大乘/合体 ${y} · 炼虚/化神 ${j}` : `元婴 ${y} · 结丹 ${j}`}　` : ''; })()}{loc.desc}　·　{curName} <b>{C.bagCount(h, curId)}</b>　·　{repName(game.ws.rep)}</span>} onClose={() => game.closeModal()} wide cls="town-panel">
      {occupied && <div className="town-warn">梁国已沦陷，此地被魔道占据，商铺尽数关门。</div>}
      <div className="town-grid">
        {fs.map((f, i) => (
          <button key={i} className={'town-fac ' + (f.cls ?? '')} disabled={!!f.dis} onClick={() => { click(); f.act(); }}>
            <span className="tf-seal">{f.seal}</span><span className="tf-name">{f.name}</span><span className="tf-desc">{f.dis ?? f.desc}</span>
          </button>
        ))}
      </div>
      <ModSlot id="town" />
      {tp && <div className="tp-list">
        <div className="sec-title">传送阵<small>只能前往已激活的阵台（大城、大宗门）</small></div>
        {tps.length === 0 && <div className="hint">尚未激活其他传送阵。亲身抵达各大城池、宗门即可激活。</div>}
        {tps.map((l) => { const c = T.tpCost(loc, l); return <button key={l.id} className="tp-row" disabled={C.bagCount(h, curId) < c} onClick={() => { audio.sfx('whoosh'); T.teleportTo(loc, l); }}><b>{l.name}</b><span>{c} {curName}</span></button>; })}
      </div>}
      <div className="hint" style={{ marginTop: 8 }}>T 与城中之人交谈 · H 友人录 · J 大事记 · Esc 离开</div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 拍卖会
type Lot = AuctionLot;
function AuctionPanel({ game, loc }: { game: Game; loc: LocDef }) {
  const q = game.towns.auctionSchedule(loc).cycle;
  const prefix = `auc_${loc.id}_`;
  const key = `${prefix}${q}`;
  const [lots, setLots] = useState<Lot[]>(() => {
    const store = (game.ws.auctions ??= {});
    for (const k of Object.keys(store)) if (k.startsWith(prefix) && k !== key) delete store[k];
    if (!Array.isArray(store[key])) {
      const built = game.towns.auctionLots(loc);
      game.jianghu?.planShills(loc, built, game.towns.auctionBidders(loc));
      store[key] = built;
    }
    return store[key];
  });   // 江湖骗局 #6：拍卖托（随存档保存，关页或读档不刷新拍品）
  const [cur, setCur] = useState(() => Math.max(0, lots.findIndex((l) => !l.done)));
  const [log, setLog] = useState<string[]>(['拍卖师敲响铜锣：「诸位道友，拍卖会正式开始！」']);
  const [lead, setLead] = useState<'me' | string | null>(null);
  const h = game.hero, curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD), money = C.bagCount(h, curId);
  const BIDDERS = game.towns.auctionBidders(loc);
  const lot = lots[cur];
  const upd = (l: Lot) => { const nl = lots.slice(); nl[cur] = l; (game.ws.auctions ??= {})[key] = nl; setLots(nl); };
  const npcBid = (l: Lot): string | null => {
    const r = l.price / l.base;
    const p = Math.max(0, 1.25 - r * 0.45) * (itemDef(l.id).id === 'pill_zhuji' ? 1.3 : 1) * (l.top ? 1.3 : 1);   // 第四十步：压轴之物争的人更多
    return Math.random() < p ? BIDDERS[Math.floor(Math.random() * BIDDERS.length)] : null;
  };
  const bid = (k: number) => {
    if (!lot || lot.done) return;
    const np = Math.round(lot.price * k);
    if (!Number.isSafeInteger(np) || np < 0) { game.toast('出价数据异常，未完成竞价。', 'warn'); return; }
    if (np > C.bagCount(h, curId)) { game.toast(`${curName}不足`, 'warn'); return; }
    click();
    const lines = [`你出价 ${np} ${curName}。`];
    const l2 = { ...lot, price: np };
    const shill = game.jianghu?.shillBid(l2) ?? null;
    const who = shill ?? npcBid(l2);
    if (who) { l2.price = Math.round(np * (shill ? 1.1 : 1.08 + Math.random() * 0.12)); if (!Number.isSafeInteger(l2.price)) { game.toast('竞价金额超出范围，未完成竞价。', 'warn'); return; } lines.push(shill ? `${who}不紧不慢地举牌：「${l2.price}。」` : `${who}冷笑一声：「${l2.price}！」`); setLead(who); }
    else { if (!game.towns.settleAuction(lot, np)) { game.toast(`拍品或${curName}数量异常，未完成成交。`, 'warn'); return; } lines.push('全场寂静……拍卖师连喊三声，一锤定音！'); l2.done = 'won'; audio.sfx('chime'); setLead('me'); game.toast(`拍得 ${itemDef(l2.id).name}`, 'good'); { const ex = game.jianghu?.onAuctionWon(l2, np); if (ex) lines.push(ex); } if (Math.random() < 0.3 && itemDef(l2.id).price > 3000) { lines.push('（你察觉到有几道神识在你身上停留了片刻……出城时小心些。）'); game.ws.flags.auctionMark = game.day; } }
    upd(l2); setLog((x) => [...x.slice(-8), ...lines]);
  };
  const pass = () => {
    if (!lot || lot.done) return;
    const who = lead && lead !== 'me' ? lead : BIDDERS[Math.floor(Math.random() * BIDDERS.length)];
    upd({ ...lot, done: 'lost', who }); setLog((x) => [...x.slice(-8), `${itemDef(lot.id).name}被${who}以 ${lot.price} ${curName}拍走。`]);
  };
  const next = () => { const i = lots.findIndex((l, j) => j > cur && !l.done); if (i >= 0) { setCur(i); setLead(null); setLog((x) => [...x.slice(-8), `下一件拍品：${itemDef(lots[i].id).name}，底价 ${lots[i].base} ${curName}。`]); } };
  return (
    <Scroll title={game.towns.auctionNote(loc)} sub={<span>{loc.name}（{TIER_NAME[cityTier(loc)]}）　·　{curName} <b>{money}</b></span>} onClose={() => game.closeModal()} wide>
      <div className="auc">
        <div className="auc-lots">
          {lots.map((l, i) => { const d = itemDef(l.id); return (
            <button key={i} className={'auc-lot' + (i === cur ? ' on' : '') + (l.done ? ' ' + l.done : '')} onClick={() => { if (!l.done) { setCur(i); setLead(null); } }}>
              <ItemGlyph id={d.id} className="glyph" style={{ color: TIER_COLOR[d.tier] }} /><span>{l.top ? '【压轴】' : ''}{d.name}</span><small>{l.done === 'won' ? '已拍得' : l.done === 'lost' ? `归${l.who}` : `底价 ${l.base}`}</small>
            </button>); })}
        </div>
        <div className="auc-main">
          {lot && <>
            <div className="bd-name" style={{ color: TIER_COLOR[itemDef(lot.id).tier] }}>{itemDef(lot.id).name}</div>
            <div className="bd-desc">{itemDef(lot.id).desc}</div>
            <div className="auc-price">当前价 <b>{lot.price}</b> {curName}{lead && !lot.done && <small>　领先：{lead === 'me' ? '你' : lead}</small>}</div>
            {!lot.done ? <div className="bd-actions">
              <button className="ink-btn small" onClick={() => bid(lead ? 1.1 : 1)}>{lead ? '加价一成' : '按底价出价'}</button>
              <button className="ink-btn small" onClick={() => bid(lead ? 1.3 : 1.25)}>{lead ? '加价三成' : '高出两成半'}</button>
              <button className="ink-btn small ghost" onClick={pass}>放弃</button>
              <button className="ink-btn small ghost" title="耗少许法力，以神识看看场中是谁在抬价（拍卖行常安排托）" disabled={h.mp < 0.05} onClick={() => { click(); const r = game.jianghu.scanShill(lot); setLog((x) => [...x.slice(-8), r.text]); if (r.found) upd({ ...lot, exposed: true }); }}>神识扫视全场</button>
              {lot.exposed && lot.shill && <small style={{ color: '#d08a7a' }}>（{lot.shill}是拍卖行的托，已被你看穿）</small>}
            </div> : <div className="bd-actions"><button className="ink-btn small jade" onClick={next}>下一件</button></div>}
          </>}
          <div className="auc-log">{log.map((l, i) => <p key={i}>{l}</p>)}</div>
        </div>
      </div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 红颜录
function HeartsPanel({ game }: { game: Game }) {
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const list = game.hearts.list();
  const [sel, setSel] = useState(() => list.find((x) => x.s?.met)?.b.id ?? list[0]?.b.id ?? '');
  const cur = list.find((x) => x.b.id === sel);
  if (!list.length || !cur) {
    return (
      <Scroll title="红颜录" sub={<span>情缘随心，故事由你书写</span>} onClose={() => game.closeModal()} wide cls="hearts-panel">
        <div className="empty">大道漫漫，尚未录得红颜旧事。</div>
      </Scroll>
    );
  }
  const met = !!cur.s?.met;
  const fv = cur.s?.favor ?? 0;
  const stageName = !met ? '未曾相识' : cur.s!.flags.parted ? '缘尽' : cur.s!.flags.companion ? '道侣' : fv >= 60 ? '倾心' : fv >= 30 ? '知己' : fv >= 10 ? '相熟' : fv > -10 ? '萍水相逢' : '嫌隙';
  return (
    <Scroll title="红颜录" sub={<span>情缘随心，故事由你书写</span>} onClose={() => game.closeModal()} wide cls="hearts-panel">
      <div className="hearts">
        <div className="hearts-list">
          {list.map(({ b, s }) => (
            <button key={b.id} className={'heart-card' + (sel === b.id ? ' on' : '') + (s?.met ? '' : ' unmet') + (s?.follow ? ' follow' : '')} onClick={() => { click(); setSel(b.id); }}>
              <div className="hc-img" style={{ backgroundImage: `url(${b.portrait})` }} />
              <div className="hc-name">{s?.met ? b.name : '？？？'}</div>
              {s?.follow && <div className="hc-tag">同行</div>}
              {(game.ws.letters ?? []).some((l) => l.from === b.id && !l.read) && <div className="hc-mail">信</div>}
            </button>
          ))}
        </div>
        <div className="heart-detail">
          <div className={'hd-portrait' + (met ? '' : ' unmet')} style={{ backgroundImage: `url(${cur.b.portrait})` }} />
          <div className="hd-info">
            <div className="hd-name">{met ? cur.b.name : '？？？'}<small>{met ? cur.b.title : ''}</small></div>
            <div className="hd-sub">{met ? `${realmName(cur.b.realm, cur.b.stage)} · ${stageName}` : stageName}</div>
            {met && <div className="favor"><div className="favor-bar"><i style={{ width: `${(fv + 100) / 2}%`, background: fv >= 0 ? 'linear-gradient(90deg,#e8a0b0,#d04a6a)' : '#5a544a' }} /></div><span>好感 {Math.round(fv)}</span></div>}
            <div className="hd-intro">{met ? cur.b.intro : '画中人眉目模糊，只余一个背影。'}</div>
            <div className="hd-hint">◈ {cur.hint}</div>
            {met && <div className="hd-bonus">同行加成：{cur.b.bonus.text}{game.heartx.keepBonus(cur.b.id) > 1 ? '（香囊随身 ×1.5）' : ''}</div>}
            {met && (() => { const f: any = cur.s!.flags; const mem = Object.keys(f.mem ?? {}).length; const keeps = [40, 60, 80].filter((k) => f['k' + k]).length; return <div className="hd-mem">共同回忆 {mem}/8　·　信物 {keeps}/3{f.lastDual ? '　·　曾共修' : ''}</div>; })()}
            {met && (() => { const ls = (game.ws.letters ?? []).filter((l) => l.from === cur.b.id).slice(-6).reverse(); if (!ls.length) return null; return (
              <div className="hd-letters">
                <div className="hd-lt-title">传音符 · 书信</div>
                {ls.map((l) => (
                  <button key={l.id} className={'hd-letter' + (l.read ? '' : ' unread')} onClick={() => { click(); game.openDialog(game.heartx.letterNode(l)); }}>
                    <span className="hl-kind">{({ chat: '闲书', req: '托付', sos: '求援', fest: '节信', jealous: '醋意', gift: '寄物' } as any)[l.kind] ?? '书'}</span>
                    <span className="hl-text">{l.text.replace(/\n/g, ' ').slice(0, 26)}…</span>
                    <span className="hl-day">第{Math.floor(l.day / 360) + 1}年{Math.floor((l.day % 360) / 30) + 1}月</span>
                  </button>
                ))}
              </div>
            ); })()}
            {met && (game.ws.flags as any).sos?.id === cur.b.id && (() => {
              const sos = (game.ws.flags as any).sos;
              return (
                <div className="bd-actions" style={{ marginBottom: 6 }}>
                  <button className="ink-btn small jade" onClick={() => { click(); game.navigateTo(sos.x, sos.y, `${cur.b.name}遇险`); game.closeModal(); }}>
                    {game.canFly ? '直接御剑驰援' : '直接导航驰援'}
                  </button>
                </div>
              );
            })()}
            {met && cur.s!.flags.companion && !cur.s!.flags.parted && (
              <div className="bd-actions">
                <button className={'ink-btn small' + (cur.s!.follow ? ' ghost' : ' jade')} onClick={() => { game.hearts.setFollow(cur.b.id, !cur.s!.follow); re(); }}>{cur.s!.follow ? '请她留下' : '邀她同行'}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 第二十九步：人脉录
const FACTION_NAME: Record<string, string> = { sect: '宗门', rogue: '散修', demon: '魔道', mortal: '凡人', merchant: '行商' };
const BOND_TEXT: Record<string, string> = { sworn: '义结金兰', master: '授业恩师', disciple: '座下弟子', companion: '结伴同行', guard: '雇佣护法' };
function RelationsPanel({ game, initialTab }: { game: Game; initialTab?: 'party' | 'friend' | 'foe' | 'sect' | 'log' | 'world' }) {
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const R = game.rel, S = R.S;
  const [tab, setTab] = useState<'party' | 'friend' | 'foe' | 'sect' | 'log' | 'world'>(() => initialTab ?? (R.hunters().length ? 'foe' : 'friend'));
  const known = R.known();
  const friends = known.filter((d) => d.alive && !d.grudge && d.favor > -15 && !d.beauty).sort((a, b) => (+!!b.bond - +!!a.bond) || b.favor - a.favor);
  const foes = known.filter((d) => d.alive && (d.grudge || d.favor <= -15 || d.hunting)).sort((a, b) => (+!!b.hunting - +!!a.hunting) || (b.grudge - a.grudge) || a.favor - b.favor);
  // 故人按栏分开：亲友栏只列已故亲友，仇敌栏只列已故仇敌，各自排在列表最末
  const deadFriendAll = known.filter((d) => !d.alive && !d.grudge && d.favor > -15 && !d.beauty)
    .sort((a, b) => (+!!b.bond - +!!a.bond) || b.favor - a.favor);
  const deadFoeAll = known.filter((d) => !d.alive && (d.grudge || d.favor <= -15))
    .sort((a, b) => (b.grudge ?? 0) - (a.grudge ?? 0) || a.favor - b.favor);
  const deadFriend = deadFriendAll.slice(0, 20), deadFriendRest = deadFriendAll.length - deadFriend.length;
  const deadFoe = deadFoeAll.slice(0, 20), deadFoeRest = deadFoeAll.length - deadFoe.length;
  const list = tab === 'friend' ? friends : tab === 'foe' ? foes : [];
  const [sel, setSel] = useState<string | null>(null);
  const [openSect, setOpenSect] = useState<string | null>(null);
  const [midPage, setMidPage] = useState<Record<string, number>>({});
  const [qiSeed, setQiSeed] = useState<Record<string, number>>({});
  const cur: NpcData | undefined = (sel ? game.npcs.byId.get(sel) : undefined) ?? list[0];
  // 第三十五步：宗门名册——所有宗门（有门人在册的）按同盟分组，附声望、门人、你杀过几人、原著人物
  const sectIds = new Set<string>(Object.keys(S.sect));
  for (const d of game.npcs.list) if (d.sect && LOC_BY_ID.get(d.sect)) sectIds.add(d.sect);
  for (const sd of SECT_DEFS) if (LOC_BY_ID.get(sd.id)) sectIds.add(sd.id);
  const groupOf = (id: string) => allyGroup(id)?.name ?? '';
  const sects = [...sectIds].map((id) => [id, S.sect[id] ?? 0] as [string, number])
    .sort((a, b) => (SECT_ALLY.findIndex((g) => g.ids.includes(a[0])) + 1 || 99) - (SECT_ALLY.findIndex((g) => g.ids.includes(b[0])) + 1 || 99) || a[1] - b[1]);
  const mySect = game.ws.sect?.id;
  const huntN = R.hunters().filter((d) => d.hunting).length;
  const partyN = game.friends.party().length;
  const invUnread = game.friends.S.invites.filter((v) => !v.accepted && !v.done && !v.declined).length;
  const sub = <span>声望 {repName(game.ws.rep)}（{game.ws.rep}）　·　同行 {partyN}　·　亲友 {friends.length}　·　仇敌 {foes.length}{huntN ? <b style={{ color: '#c0302a' }}>　·　{huntN} 人正在追杀你</b> : null}{R.wantedTotal() ? <b style={{ color: '#a8352a' }}>　·　悬赏 {R.wantedTotal()} {worldCurrencyName(ACTIVE_WORLD)}</b> : null}</span>;
  const Chip = ({ d }: { d: NpcData }) => { const t = R.tier(d) as Tier; return <span className="rel-chip" style={{ background: REL_COLOR[t] }}>{t}</span>; };
  const row = (d: NpcData) => (
    <button key={d.id} className={'rel-row' + (cur?.id === d.id ? ' on' : '') + (d.hunting ? ' hunt' : '')} onClick={() => { click(); setSel(d.id); }}>
      <Chip d={d} /><b>{d.name}</b><span className="rel-realm">{d.realm ? realmName(d.realm, d.stage) : '凡人'}</span>
      <span className="rel-where">{d.hunting ? '正循迹而来' : R.locName(d.home)}</span>
    </button>
  );
  return (
    <Scroll title="江湖人物" sub={sub} onClose={() => game.closeModal()} wide cls="rel-panel">
      <div className="rel-tabs">
        {([
          ['party', `同行${invUnread ? ` (${invUnread})` : ''}`],
          ['friend', `亲友 ${friends.length}`],
          ['foe', `仇敌 ${foes.length}`],
          ['sect', '宗门'],
          ['log', '恩怨'],
          ['world', '传言'],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            className={'rel-tab' + (tab === k ? ' on' : '') + (k === 'foe' && huntN ? ' alarm' : '')}
            onClick={(e) => {
              click();
              setTab(k);
              setSel(null);
              e.currentTarget.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }}
          >{l}</button>
        ))}
        {game.hearts.follower() && (
          <button
            className="rel-tab"
            onClick={() => { click(); game.closeModal(); game.openModal({ kind: 'hearts' }); }}
          >道侣 →</button>
        )}
      </div>
      {tab === 'party' && <FriendsBody game={game} />}
      {tab === 'world' && <WorldChronicle game={game} />}
      {(tab === 'friend' || tab === 'foe') && (
        <div className="rel-body">
          <div className="rel-list">
            {list.length === 0 && <div className="hint">{tab === 'friend' ? '尚无相熟之人。与人交谈、赠礼、论道、并肩御敌，都能结下交情。' : '眼下没有仇家——愿你一直这样走下去。'}</div>}
            {list.map(row)}
            {(() => {
              const gone = tab === 'foe' ? deadFoe : deadFriend;
              const rest = tab === 'foe' ? deadFoeRest : deadFriendRest;
              if (!gone.length) return null;
              return (
                <div className="rel-dead">
                  <div className="sec-title">
                    {tab === 'foe' ? '已故仇敌' : '已故亲友'} <small>（列在最末）</small>
                  </div>
                  {gone.map((d) => (
                    <div key={d.id} className="rel-gone" style={tab === 'foe' || d.grudge ? { color: '#a8352a' } : undefined}>
                      {d.name}
                      <small>{d.deathNote ?? '已故'}{d.grudge ? '　（与你有仇）' : d.bond ? '　（有羁绊）' : ''}</small>
                    </div>
                  ))}
                  {rest > 0 && <div className="hint">另有 {rest} 位未列出。</div>}
                </div>
              );
            })()}
          </div>
          {cur && (() => {
            const t = R.tier(cur) as Tier, ties = R.tiesText(cur);
            const sectN = cur.sect ? LOC_BY_ID.get(cur.sect)?.name : '';
            return (
              <div className="rel-detail">
                <div className="rel-bust"><Bust look={(game.npcs as any).look(cur)} /></div>
                <div className="rel-info">
                  <div className="hd-name">{cur.name}<small>{cur.title ?? ''}</small></div>
                  <div className="hd-sub">{cur.realm ? realmName(cur.realm, cur.stage) : '凡人'} · {sectN || FACTION_NAME[cur.faction]} · {PERS_NAME[cur.pers]} · <span style={{ color: REL_COLOR[t] }}>{t}</span></div>
                  <div className="favor"><div className="favor-bar"><i style={{ width: `${(cur.favor + 100) / 2}%`, background: cur.favor >= 0 ? 'linear-gradient(90deg,#9fd08a,#3f9a5a)' : 'linear-gradient(90deg,#d88a5a,#b8302a)' }} /></div><span>好感 {Math.round(cur.favor)}</span></div>
                  {cur.bond && <div className="rel-bond">◈ {BOND_TEXT[cur.bond]}{cur.bondUntil && (cur.bond === 'companion' || cur.bond === 'guard') ? `（余 ${Math.max(0, Math.ceil(cur.bondUntil - game.day))} 日）` : ''}</div>}
                  {cur.why && (cur.grudge > 0 || cur.hunting) && <div className="rel-why">✕ {cur.grudge >= 2 ? '血仇' : cur.hunting ? '追杀' : '旧怨'}：{cur.why}</div>}
                  {cur.vow && <div className="rel-bond">◈ 已对你立下心魔誓，此生不与你为敌</div>}
                  {cur.oath && <div className="rel-why">◈ 你曾对此人立誓：若伤其或其亲族，心魔反噬</div>}
                  <LifeCard game={game} d={cur} />
                  <div className="rel-ties">
                    <div className="hd-lt-title">人脉（{ties.length}）{ties.some((x) => x.k !== 'foe') ? <small>　杀了{cur.sex === 'f' ? '她' : '他'}，这些人会记恨你</small> : null}</div>
                    {ties.length === 0 && <div className="hint">孑然一身。</div>}
                    {ties.map(({ o, r, k }) => { const ot = R.tier(o) as Tier; return (
                      <button key={o.id} className={'rel-tie ' + k + (o.alive ? '' : ' gone')} onClick={() => { if (R.known().includes(o)) { click(); setSel(o.id); if (o.grudge || o.favor <= -15) setTab('foe'); else setTab('friend'); } }}>
                        <span className="rt-r">{r}</span><b>{o.met || o.alive === false ? o.name : o.name}</b>
                        <small>{!o.alive ? '已故' : o.met || o.grudge ? ot : '未曾谋面'}</small>
                      </button>
                    ); })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      {(tab === 'friend' || tab === 'foe') && (
        <div className="hint" style={{ marginTop: 10, opacity: 0.78, lineHeight: 1.7 }}>
          人脉录只记「相识之人」——交谈过、有恩怨或有羁绊的才入册（天下共 {game.npcs.list.length} 人）。
        </div>
      )}
      {tab === 'sect' && (
        <div className="rel-sects">
          <div className="hint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>这一页记<b>你与各宗门的个人声望</b>（跌至 {SECT_HOSTILE} 敌视、{SECT_SIEGE} 围剿、{SECT_ELDER} 长老出手）；点宗门名可展开金字塔名册。</span>
            <button className="ink-btn small jade" onClick={() => { click(); game.closeModal(); game.openModal({ kind: 'sect', tab: 'world' }); }}>查看「天下宗门 & 战事」→</button>
          </div>
          {sects.map(([id, v], i) => {
            const mem = game.npcs.list.filter((d) => d.sect === id);
            const alive = mem.filter((d) => d.alive), namedAll = mem.filter((d) => d.canon).sort((a, b) => b.realm - a.realm || b.stage - a.stage);
            // 掌门/长老/执事已在上面 leaders 里列过，原著人物列表里不再重复同一人
            const leaders = SECT_DEF.has(id) ? game.roster.leaders(id) : [];
            const leadNames = new Set(leaders.map((m) => m.name));
            const named = namedAll.filter((d) => !leadNames.has(d.name));   // 原著人物（已剔除管理层同名）
            const aliveLeaders = leaders.filter((m) => !m.dead);            // 上方只放活着的管理层
            const deadLeaders = leaders.filter((m) => m.dead);              // 已故管理层 → 下方
            const aliveNamed = named.filter((d) => d.alive);
            const deadNamed = named.filter((d) => !d.alive);
            const deadCount = deadLeaders.length + deadNamed.length;
            const kills = S.killed?.[id] ?? 0, grp = groupOf(id), prevGrp = i ? groupOf(sects[i - 1][0]) : null;
            const top = alive.reduce((m, d) => Math.max(m, d.realm), 0);
            return (
              <div key={id}>
                {grp !== prevGrp && <div className="sec-title" style={{ marginTop: i ? 10 : 2 }}>{grp || '其余宗门'}</div>}
                <div className="rel-sect" style={{ cursor: 'pointer' }} onClick={() => { click(); setOpenSect(openSect === id ? null : id); }}>
                  <b>{openSect === id ? '▾ ' : '▸ '}{sectTitle(id)}{SECT_DEF.has(id) ? <small style={{ fontWeight: 400 }}>　{game.roster.aliveCount(id)}人</small> : null}{id === mySect ? <small>（本门）</small> : null}</b>
                  <div className="favor-bar"><i style={{ width: `${(v + 100) / 2}%`, background: v >= 0 ? 'linear-gradient(90deg,#9fd08a,#3f9a5a)' : 'linear-gradient(90deg,#d88a5a,#b8302a)' }} /></div>
                  <span style={{ color: v <= SECT_SIEGE ? '#c0302a' : v <= SECT_HOSTILE ? '#d06a3a' : v >= 30 ? '#3f9a5a' : '#7a6a58' }}>{v <= SECT_ELDER ? '长老出手' : v <= SECT_SIEGE ? '围剿' : v <= SECT_HOSTILE ? '敌视' : v <= -15 ? '冷淡' : v >= 30 ? '友善' : '中立'} {Math.round(v)}</span>
                </div>
                {openSect === id && (
                  <div className="rel-roster" style={{ padding: '4px 10px 10px 22px', fontSize: 13, lineHeight: 1.7, color: '#4a3f34' }}>
                    {SECT_DEF.has(id) ? (() => {
                      const def = SECT_DEF.get(id)!;
                      const sm = game.roster.summary(id);
                      const pool = game.roster.poolState(id);
                      const mp0 = midPage[id] ?? 0;
                      const mid = game.roster.midPage(id, mp0, 10);
                      const midPages = Math.max(1, Math.ceil(mid.total / 10));
                      const mp = Math.min(mp0, midPages - 1);
                      const sample = game.roster.qiSample(id, 6, qiSeed[id] ?? 1, 'outer');
                      // canon 人物坐的槽位 -> 该槽位的品级
                      const seatRank = new Map<string, Rank>();
                      for (let si = 0; si < def.n; si++) {
                        const c = game.roster.canonAt(id, si);
                        if (c) seatRank.set(c, rankOf(def, si));
                      }
                      const rk = (r: Rank) => RANKS.indexOf(r);
                      const score = (realm: number, stage: number) => realm * 13 + stage;
                      type RowT = { k: string; name: string; rank: Rank; realmText: string; right: string; rightColor?: string; s: number };
                      const aliveRows: RowT[] = [
                        ...aliveLeaders.map((m) => ({ k: 'L' + m.i, name: m.name, rank: m.rank as Rank, realmText: m.realmText, right: '', s: score(m.realm, m.stage) })),
                        ...aliveNamed.map((d) => {
                          const t = R.tier(d) as Tier;
                          return { k: d.id, name: d.name, rank: (seatRank.get(d.id) ?? '内门弟子') as Rank, realmText: d.realm ? realmName(d.realm, d.stage) : '凡人', right: d.met ? t : '未曾谋面', rightColor: REL_COLOR[t], s: score(d.realm, d.stage) };
                        }),
                      ].sort((a, b) => rk(a.rank) - rk(b.rank) || b.s - a.s);
                      const deadRows: RowT[] = [
                        ...deadLeaders.map((m) => ({ k: 'L' + m.i, name: m.name, rank: m.rank as Rank, realmText: m.realmText, right: '已故', s: score(m.realm, m.stage) })),
                        ...deadNamed.map((d) => ({ k: d.id, name: d.name, rank: (seatRank.get(d.id) ?? '内门弟子') as Rank, realmText: d.realm ? realmName(d.realm, d.stage) : '凡人', right: '已故', s: score(d.realm, d.stage) })),
                      ].sort((a, b) => rk(a.rank) - rk(b.rank) || b.s - a.s);
                      const vacant = (['掌门', '太上长老', '长老', '执事'] as Rank[]).filter((r) => sm[r].alive === 0);
                      const line = (r: RowT, dim = false) => (
                        <div key={r.k} style={{ display: 'flex', gap: 10, alignItems: 'baseline', opacity: dim ? 0.5 : 1 }}>
                          <b style={{ fontWeight: 400, minWidth: 64 }}>{r.name}</b>
                          <small style={{ minWidth: 96 }}>{r.rank}</small>
                          <span style={{ minWidth: 64 }}>{r.realmText}</span>
                          <span style={{ color: r.rightColor ?? '#7a6a58' }}>{r.right}</span>
                        </div>
                      );
                      return (<>
                        <div>三层总门人 <b>{game.roster.aliveCount(id)}</b> / {SECT_DEF.get(id)!.n} 人　·　{RANKS.filter((r) => sm[r].n).map((r) => `${r} ${sm[r].alive}`).join(' · ')}{kills ? <b style={{ color: '#a8352a' }}>　·　死于你手 {kills} 人</b> : null}</div>
                        <div className="hint" style={{ fontSize: 11.5, opacity: 0.8 }}>规模、据点、宗法与恩怨在「宗主大殿 · 天下宗门」里。</div>
                        <div className="sec-title" style={{ fontSize: 12, marginTop: 6 }}>第一层 · 宗门高层（真实在册）</div>
                        {aliveRows.map((r) => line(r))}
                        {vacant.map((r) => (
                          <div key={'v' + r} style={{ display: 'flex', gap: 10, alignItems: 'baseline', opacity: 0.55 }}>
                            <b style={{ fontWeight: 400, minWidth: 64 }}>—</b>
                            <small style={{ minWidth: 96 }}>{r} · 空缺</small>
                            <span style={{ minWidth: 64 }} />
                            <span>待继任</span>
                          </div>
                        ))}
                        <div className="sec-title" style={{ fontSize: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>第二层 · 中坚筑基（共 {mid.total} 人 · 第 {mp + 1}/{midPages} 页）</span>
                          {midPages > 1 && (
                            <span style={{ display: 'flex', gap: 6 }}>
                              <button className="ink-btn small ghost" onClick={() => { click(); setMidPage((p) => ({ ...p, [id]: (mp - 1 + midPages) % midPages })); }}>上一页</button>
                              <button className="ink-btn small ghost" onClick={() => { click(); setMidPage((p) => ({ ...p, [id]: (mp + 1) % midPages })); }}>下一页</button>
                            </span>
                          )}
                        </div>
                        {mid.items.map((m) => line({ k: 'M' + m.i, name: m.name, rank: m.rank, realmText: realmName(m.realm, m.stage), right: m.dead ? '已故' : '', s: 0 }, m.dead))}
                        <div className="sec-title" style={{ fontSize: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>第三层 · 炼气兵池（外门战兵 {pool.outer.a} 在战 · {pool.outer.j} 养伤 / {pool.outer.c}；杂役 {pool.servant.a}/{pool.servant.c}）</span>
                          <button className="ink-btn small ghost" title="从外门炼气名册中另抽一批弟子查看" onClick={() => { click(); setQiSeed((s) => ({ ...s, [id]: (s[id] ?? 1) + 1 })); }}>换一批</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12, opacity: 0.9 }}>
                          {sample.map((m) => (
                            <span key={m.i}>{m.name}（{m.rank} · {realmName(m.realm, m.stage)}）</span>
                          ))}
                        </div>
                        {deadRows.length > 0 && (
                          <>
                            <div className="sec-title" style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>已故名录 {deadRows.length} 人</div>
                            {deadRows.map((r) => line(r, true))}
                          </>
                        )}
                      </>);
                    })() : <div>门人在册 {alive.length} 人{top ? `（最高 ${REALMS[top].name}）` : ''}{mem.length - alive.length ? `　·　已故 ${mem.length - alive.length}` : ''}{kills ? <b style={{ color: '#a8352a' }}>　·　死于你手 {kills} 人</b> : null}</div>}
                    {!named.length && !SECT_DEF.has(id) && <div className="hint">名册上多是无名弟子。</div>}
                  </div>
                )}
              </div>
            );
          })}
          {S.wanted.length > 0 && <><div className="sec-title" style={{ marginTop: 14 }}>悬赏榜</div>{S.wanted.map((w, i) => <div key={i} className="rel-wanted"><b>{w.amount} {worldCurrencyName(ACTIVE_WORLD)}</b>　{w.name}悬赏：{w.reason}<small>第{Math.floor(w.day / 360) + 1}年</small></div>)}</>}
        </div>
      )}
      {tab === 'log' && (
        <div className="rel-log">
          {S.log.length === 0 && <div className="hint">江湖平静。</div>}
          {S.log.slice().reverse().map((l, i) => <div key={i} className={'news ' + (l.kind === 'bad' ? 'canon' : l.kind === 'good' ? 'personal' : '')}><span>第{Math.floor(l.day / 360) + 1}年{Math.floor((l.day % 360) / 30) + 1}月</span>{l.text}</div>)}
        </div>
      )}
      <div className="hint" style={{ marginTop: 8 }}>与仇人狭路相逢时可赔礼、立誓或请人说和；把人打到半死，对方可能求饶。　·　<span onClick={re} style={{ cursor: 'pointer' }}>↻</span></div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 大事记
function ChroniclePanel({ game }: { game: Game }) {
  const ev = game.events.chronicle();
  const news = game.ws.news.slice().reverse().slice(0, 60);
  const s = game.ws.sect;
  const year = Math.floor(game.day / 360) + 1;
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const ch = game.chances();
  const sosList = game.activeSosTargets();
  return (
    <Scroll title="大事记 · 机缘录" sub={<span>第{year}年　·　{repName(game.ws.rep)}（{game.ws.rep}）　·　{s ? `${LOC_BY_ID.get(s.id)?.name} ${SECT_RANKS[s.rank]}` : '散修'}</span>} onClose={() => game.closeModal()} wide>
      <div className="chron chron3">
        <div className="chron-col">
          <div className="sec-title">任务<small>眼下可做、值得做的事</small></div>
          {sosList.map((t) => (
            <div key={t.id} className={'chance' + (t.urgent ? ' hot bad' : '')}>
              <div className="cc-head">
                <b>【{t.tag}】{t.title}</b>
                <span style={{ display: 'inline-flex', gap: 4 }}>
                  <button className="cc-go" onClick={(e) => { e.stopPropagation(); audio.sfx('chime'); if (t.jadeId) { const j = game.war.inbox.find((x) => x.id === t.jadeId); if (j && !j.accepted) j.accepted = true; } game.setGuide(t.x, t.y, t.title, t.followNpcId); re(); }} title="只在地图上标出，不关面板">指路</button>
                  <button className="cc-go" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); if (t.inviteId) { const inv = game.friends.S.invites.find((x) => x.id === t.inviteId); if (inv && !inv.accepted) game.friends.accept(inv); } if (t.jadeId) { const j = game.war.inbox.find((x) => x.id === t.jadeId); if (j && !j.accepted) j.accepted = true; } game.navigateTo(t.x, t.y, t.title, t.followNpcId); game.closeModal(); }} title="直接御剑 / 寻路赶去">导航</button>
                </span>
              </div>
              <div className="cc-desc">{t.detail} · {dirName(t.x - game.player.x, t.y - game.player.y)}方约 {Math.max(1, Math.round(Math.hypot(t.x - game.player.x, t.y - game.player.y) / 260))} 里</div>
            </div>
          ))}
          {ch.map((c, i) => (
            <div key={i} className={'chance' + (c.hot ? ' hot' : '') + (c.tone ? ' ' + c.tone : '')}>
              <div className="cc-head"><b>{c.t}</b>{c.x !== undefined && c.y !== undefined && <span style={{ display: 'inline-flex', gap: 4 }}><button className="cc-go" onClick={(e) => { e.stopPropagation(); audio.sfx('chime'); game.setGuide(c.x!, c.y!, c.t.trim()); re(); }} title="只在地图上标出，不关面板">指路</button><button className="cc-go" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); game.navigateTo(c.x!, c.y!, c.t.trim()); game.closeModal(); }} title="直接御剑 / 寻路赶去">导航</button></span>}</div>
              <div className="cc-desc">{c.d}</div>
            </div>
          ))}
          <div className="hint">闭关 30 日以上，出关时必有访客：宗门传讯、故交赠礼或散修报信。</div>
          {game.guide && <div className="hint" style={{ color: '#1d4a5a' }}>已在图上标出：指路 → {game.guide.name}　<button className="cc-go" onClick={() => { game.guide = null; re(); }}>取消</button></div>}
        </div>
        <div className="chron-col">
          <div className="sec-title">{WORLDS[ACTIVE_WORLD].name}大势<small>{ACTIVE_WORLD === 'human' ? '人界大事，结局可被改变' : `${WORLDS[ACTIVE_WORLD].name}大事，只显本界风波`}</small></div>
          {ev.map((e, i) => (
            <div key={i} className={'chron-ev ' + (e.state === '进行中' ? 'live' : e.state === '已参与' ? 'done' : e.state === '已错过' ? 'missed' : '')}>
              <div className="ce-head"><b>{e.name}</b><span>第{e.year}年{e.loc ? ' · ' + e.loc : ''}</span><em>{e.state}</em></div>
              <div className="ce-desc">{e.desc}{e.score !== undefined && e.state === '进行中' ? `（梁国斩杀魔修 ${e.score}/25）` : ''}</div>
            </div>
          ))}
        </div>
        <div className="chron-col">
          <div className="sec-title">江湖传闻</div>
          {news.length === 0 && <div className="hint">尚无传闻。多与人交谈、去酒楼坐坐。</div>}
          {news.map((n, i) => <div key={i} className={'news ' + (n.kind ?? '')}><span>第{Math.floor(n.day / 360) + 1}年{Math.floor((n.day % 360) / 30) + 1}月</span>{n.text}</div>)}
        </div>
      </div>
      <div className="hint">修为：{realmDef(game.hero.realm).name}　·　图例：红色为进行中的大事件（小地图上会闪烁标出战场）</div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 帮助
export const VERSION = 'v0.57 · 模组接口五代';
function HelpPanel({ game }: { game: Game }) {
  const [tab, setTab] = useState(0);
  const T = ['操作', '修炼', '战斗', '人界', '神识', '机缘', '神通', '阵法', '友人', '众生'];
  const body = [
    <div className="keys" key={0}>
      {TOUCH_UI ? <>
        <b>左手摇杆</b> 走动，推到底即<b>疾行</b>；也可以点右侧「疾」常开（御剑时为遁光加速，耗法力）<br />
        <b>点地面</b> 自动前往 · <b>点人</b> 直接走过去与他说话 · <b>点敌人</b> 锁定目标<br />
        <b>右下法诀盘</b> 点一下即施法，自动锁定最近的敌人（淡金环）<br />
        <b>「闪」</b> 闪避（无敌帧，躲开红色预警） · <b>「谈」</b> 交谈 / 查看奇遇 / 进门 / 踏传送阵<br />
        <b>「≡」菜单</b> 角色 · 储物袋 · 法术书 · 丹器 · 闭关 · 衣橱 · 地图 · 友人录 · 人脉 · 机缘 · 玉符 · 云存档 · 御剑 · 打坐 · 设置<br />
        <b>双指捏合</b> 缩放 · <b>点小地图</b> 开世界地图 · <b>点左上目标卷轴</b> 自动前往<br />
        走近灵物会浮出「采集」，走近城镇宗门会浮出「进入」——点它们即可。<br />
        接了蓝牙键盘的话，电脑那套键位一样管用（设置里可改键）。
      </> : <>
        <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键 / 点击地面 移动　·　<kbd>Shift</kbd> 疾行　·　<kbd>空格</kbd> 闪避（无敌帧，躲开红色预警）<br />
        <kbd>T</kbd> 交谈 / 查看奇遇　·　<kbd>G</kbd> 进城 / 入宗门　·　<kbd>H</kbd> 友人录　·　<kbd>N</kbd> 人脉录　·　<kbd>J</kbd> 大事记<br />
        <kbd>Z</kbd> 打坐　·　<kbd>E</kbd> 采集　·　<kbd>C</kbd> 角色 / 冲关　·　<kbd>B</kbd> 储物袋　·　<kbd>L</kbd> 丹房　·　<kbd>P</kbd> 闭关<br />
        <kbd>1</kbd>–<kbd>9</kbd> 施法　·　<kbd>K</kbd> 法术书　·　<kbd>I</kbd> 衣橱　·　<kbd>Q</kbd> 神识外放　·　<kbd>R</kbd> 敛息<br />
        <kbd>Y</kbd> 回洞府（需回府符）　·　<kbd>U</kbd> 灵宠　·　<kbd>T</kbd> 也用于机缘、悬赏、灵宠、洞府<br />
        <kbd>M</kbd> 世界地图　·　滚轮 / <kbd>+</kbd><kbd>-</kbd> 缩放　·　<kbd>?</kbd> 本帮助　·　<kbd>Esc</kbd> 关闭 / 设置<br />
        对话中可按数字键选择选项，空格跳过打字效果。<br />
        左上角目标卷轴显示主线目标与方向，<b>点击即可自动前往</b>；任务人物头顶有“！”。<br />
        手机：左下摇杆移动（推到底即疾行），右下 3×3 法诀盘施法，右侧「谈」交谈，双指缩放。
      </>}
    </div>,
    <div className="hd-intro" key={1}>打坐（{keyLabel(bindOf('sit'))}）时每 2 秒过 1 日（×{TUNING.meditateSpeed}），修为随灵根、功法、所在地灵气增长。修为满后遇小瓶颈需服丹冲关，大境界圆满后在角色面板冲击下一境界（筑基需筑基丹）。<br />问道残卷（开局即在身上）每七日凝一滴墨露，滴在灵草上一株化三；与人斗法时还能观招偷学（法术书「问道残卷」页）。高年份灵草提高炼丹成功率。<br />闭关（{keyLabel(bindOf('seclude'))}）可一次度过数月至十年，但人界大事不会等你。</div>,
    <div className="hd-intro" key={2}>9 格快捷栏，法术、法器与<b>符箓</b>任意摆放（符箓一次性消耗，栏位显示剩余张数，对高境界衰减较少）。法术分凡 / 黄 / 玄 / 地 / 天五品，熟练度初学 → 圆满会改变形态。<br />异状连携：冰冻 + 雷、定身 + 火、燃烧 + 风、中毒 + 火……<br />倒下不会坐化：损失一成修为与少量物品，在最近城镇醒来。越阶挑战九死一生，名牌颜色提示强弱。剧情战倒下不受惩罚，可直接重来。</div>,
    <div className="hd-intro" key={3}>人界约 450 人各有境界、宗门、性格与目标，会修炼、衰老、陨落，也会彼此斗法——你可以旁观、相助或捡漏。劫修专挑弱者下手，声望决定正魔两道对你的态度。<br />城镇：坊市、丹药铺、法器阁、符箓斋、酒楼、客栈、传送阵、拍卖会。宗门：俸禄、任务、藏经阁、晋升。<br />红颜八位，各有故事线；结为道侣后可同行助战。<br />人界大事按年份发生（问仙大会、赤霄禁地、鸿家堡、魔道入侵、归墟殿、陨魔谷），提前一年在酒楼与大事记中传闻。</div>,
    <div className="hd-intro" key={4}>只有神识圈内的东西才是“真实”的——圈外是褪色的记忆水墨，看不到任何动静。奇遇、敌人、行人都要靠神识发现。<br />神识随境界与功法增长；天衍诀、养魂木等会改变神识的样貌与范围。平时只探察精细圈之外的一小部分范围；Q 外放神识，使信息圈扩展至当前神识所能达到的范围（持续消耗法力，再按 Q 收回）。R 敛息时信息圈收至精细圈，精细圈不因敛息缩小，也较不易被更强者察觉。<br />被更强的神识扫过时，圈边泛红、画面轻震——那意味着有人注意到你了。<br /><br /><b>遁术</b>：飞行中按住 Shift 催动遁光（持续耗法力，期间不回蓝），越飞越高、视野越开阔。云雷双翼可施雷遁，血色披风可化血光遁。<br /><b>追杀</b>：身怀重宝、拍得宝物、斩杀魔修、夺得遗府后，可能被高一境界的修士以神识锁定追杀——硬拼九死一生。拉开距离出其锁定范围、遁地符 / 血遁隐去身形、敛息，或逃入宗门坊市，皆可脱身。顶部横幅显示锁定状态，屏幕边缘箭头指示追兵方位。<br /><br /><b>投放距离</b>：功法、法器、符箓的投放距离受精细圈及玩法神识范围约束（通常为后者八成，外放时为七成）——神识越强，出手越远。<br /><b>妖兽</b>：按传说分一至十级——一级相当炼气（再分下 / 中 / 上 / 顶阶），二至四级相当筑基，五至七级相当结丹，八至十级是已化形的大妖。五级以上周身缭绕妖气。双瞳鼠、阴芝马擅隐匿，需神识贴近或外放才能发现；土甲龙见人便逃，重伤时会土遁；云翅鸟会尖啸示警，引来附近妖兽。毒蛟、六翼霜蚣、风希等妖王只在固定巢穴出没，斩杀后三年才有新妖王占据。<br /><b>妖丹与炼器</b>：妖兽有一定几率留下同级妖丹（五级以上必有），妖丹会自行飞入怀中。右侧“丹器”按钮打开的丹房新增“炼器”页：以墨蛟鳍炼神风舟、墨蛟爪炼乌龙夺、雷鹏骨翅加金雷竹炼云雷双翼……在城镇或宗门借地火更稳，野外炼器成器率大减。</div>,
    <div className="hd-intro" key={5}><b>机缘：</b>神识扫过山野，会显出灵草王、修士遗骸、古修洞府、兽巢、灵脉、古碑、山神庙、灵池、古战场——走近按 T。守药妖兽若在熟睡，偷袭伤害 ×2.5；敛息潜近更稳妥。古修洞府有三重禁制，可强破、神识寻隙或用破禁符。<br /><b>洞府：</b>在灵脉上开辟洞府，种药园、布禁制，打坐灵气加成；坊市卖回府符（Y）。<br /><b>灵宠：</b>兽巢偷来的灵卵会自动温养，破壳后随你出战、喂妖丹成长（U）。<br /><b>红颜：</b>相熟之后会寄来传音符——闲话、托付、节日相约，偶尔是求援。好感到 40/60/80 会赠你信物；可约她同游（去处随时辰、天气、地形变化，共八种回忆），道侣好感 80 可在灵脉或洞府双修。<br /><b>心魔劫：</b>结丹、结婴前会入幻境，幻境由你一路的经历生成，心境稳则成功率上升。</div>,
    <div className="hd-intro" key={6}><b>灵力化形（结丹）：</b>金丹一成，灵力可离体凝形——自然悟得「化形·青龙」。其余六形要「观兽悟形」：斩杀虎豹狼狮悟白虎、龟蟹鳄甲蛇悟玄武、带火字的妖兽悟火凤、鹰雕禽鸟悟雷鹏、鹿牛马羊悟麒麟、猿熊悟魔猿；妖兽境界越高、越是妖王，悟得越多（筑基时悟的也作数）。七形各有打法：青龙贯穿、火凤俯冲火海、白虎连扑破甲、玄武护身引敌、雷鹏连环雷击、麒麟踏地震晕、魔猿横扫击飞。法术书里选中任一化形可看参悟进度。<br /><br /><b>元婴出窍（元婴）：</b>元婴离体，肉身就地盘坐、罩着护体金光；元婴尺许大小，遁速倍增、法术伤害 +25%、所受伤害 ×0.75，出窍一刹神识冲击震慑四方。<b>元婴期化形与出窍叠加</b>：七形体形放大、威力再增并各多一段后招，元婴之身照样能化形。敌人专找毫无还手之力的肉身下手——护光碎了元婴会被震回、眩晕一息。元婴走不出神识之外；再按一次归窍。出窍时元婴瞬移更远、冷却减半，神识看得穿禁制阵眼。<br /><br /><b>旁人也会：</b>结丹以上的敌修也会化形（一形，元婴与首领两形），出招前地上照样亮预警，法相脚下带一圈暗红煞气；元婴敌修会元婴出窍——<b>打破它盘坐的肉身</b>，元婴被震回、眩晕一阵还要折损气血。结丹以上的同行友人会化形助你，元婴友人会出窍杀敌（肉身留在原地，护光被打破就得退下调息），懂阵的友人会就地布困阵、庚金剑阵，你伤重时布回春阵。</div>,
    <div className="hd-intro" key={7}><b>阵法禁制：</b>阵法与禁制本是一物——有人主持的叫阵法，前人留下、无人主持的叫禁制。按 {keyLabel(bindOf('zhenfa'))} 打开阵法盘：手持阵盘、按阵插旗、以灵石为阵眼，就地布阵；也可把阵放进快捷栏一键布阵。<br />· 困阵、迷踪阵、颠倒五行阵困敌乱敌；庚金剑阵、五雷阵、地火阵杀敌；玄武护阵挡飞矢、两仪微尘阵反震；聚灵阵助修炼、回春阵疗伤、敛息阵藏形。<br />· 阵盘品阶定威力与可同时主持的阵数；上品阵旗威力 +25%。收阵时阵旗尽数收回，阵眼被人轰碎则折损一半。<br />· 阵道：布阵、破阵、破禁、研读阵图都长阵道；阵道越高阵越强越大，「初窥门径」起看得穿禁制里的杀阵节点与敌阵阵眼。<br />· 精熟：每座阵各有「初成 → 小成 → 大成 → 圆满」，布得越多、阵中困敌越多越熟；威力、范围、时长、阵眼逐级增强，圆满时省一面阵旗。<br />· 魔道阵修会布阵对付你：困阵、迷踪阵（走到阵界又被雾兜回）困得住人；庚金剑阵、五雷阵、地火阵是杀阵，剑雨雷火专落你脚下。找到阵眼走过去按 {keyLabel(bindOf('interact'))} 破开；庚金、五雷两座杀阵也可直接冲出阵界。<br />· 遗府、古修遗骸的禁制可选「破禁之局」：从生门起按五行相生（木→火→土→金→水→木）逐一点破阵眼；破禁锥可稳稳钉碎一处。<br />· 洞府可叠布数重阵法禁制：防贼、困贼、聚灵、隐匿。</div>,
    <div className="hd-intro" key={8}>
      <b>友人录（{keyLabel(bindOf('hearts'))}）：</b>同行 · 知交 · 邀约三页。好感三十以上的人是知交，可当面邀其同行；不在身边的好友（好感四十以上）可传音相邀，按路程几日后赶到。同行最多三人（含道侣），可下令原地等候、跟上、散去。同行的友人替你出手挡刀。<br />
      <b>邀约：</b>好友会传音约你「同探洞府」或「被围求援」，应约后地图上标「约」。有真有假——表面热络、心里另有打算的人约你，会合处可能埋着伏兵。境界高出两层、神识外放、吃过亏的阅历、天衍诀或明清灵目，都能看出信里的蹊跷。爽约要掉好感。<br />
      <b>三方混战：</b>妖兽护领地，劫修、追兵闯进来照样挨咬，被咬的也会还手——被追杀时把追兵引进兽窝，坐收渔翁之利。
    </div>,
    <div className="hd-intro" key={9}>
      <b>众生行：</b>宗门左近常遇巡山弟子；野外有散修猎妖、两伙人斗法抢宝。这些人不冲你来、不进自动锁定；你帮忙会得一份，你先动手他们就翻脸。
    </div>,
    
  ];
  return (
    <Scroll title="修仙指南" sub={<span>{VERSION}</span>} onClose={() => game.closeModal()} wide>
      <div className="tabs">{T.map((t, i) => <button key={i} className={tab === i ? 'on' : ''} onClick={(e) => { setTab(i); e.currentTarget.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }}>{t}</button>)}</div>
      {body[tab]}
    </Scroll>
  );
}
