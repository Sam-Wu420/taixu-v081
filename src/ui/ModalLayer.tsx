// 第四～六步的界面：对话、交易、城镇、拍卖会、友人录、大事记
import { ChatBox } from './ChatBox';
import { modx } from '../mod/hooks';
import { ModUiNodes, ModSlot } from './ModUi';
import { cityTier, TIER_NAME } from '../data/market';
import { wbZoneOf } from '../world/wanbao';
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Game } from '../world/game';
import type { DNode, DOpt, Shop, ShopStock } from '../world/modal';
import type { LocDef } from '../data/world';
import { LOC_BY_ID, locHere } from '../data/world';
import { itemDef } from '../data/items';
import { REALMS, realmName } from '../data/realms';
import { BEAUTIES } from '../data/beauties';
import { CharState, drawCharacter, Look } from '../gfx/character';
import { SECT_RANKS, repName } from '../world/worldstate';
import * as C from '../world/cultivation';
import { audio } from '../world/audio';
import { ItemGlyph } from './ItemIcon';
import { portraitFor } from '../data/portraits';
import { PojinPanel } from './Pojin';
import { WanbaoPanel } from './WanbaoPanel';
import { AuctionHall } from './AuctionHall';
import { StallPanel } from './StallPanel';   // 收官 D：个人摊位
import { LqPanel } from './kit/LqPanel';   // 收官 H1：统一外壳
import { KeysHelp, TouchHelp } from './KeysHelp';   // 收官 H1：操作说明从 keymap 取
import { useTouch } from './kit';   // 收官 H2：useTouch（人脉录的页签、好感条随面板搬去 ui/Renmai.tsx）
import cornerUrl from '../assets/wanbao/corner.webp';
import { RenmaiPanel } from './Renmai';   // r20：人脉录重做
import { KoubeiLine } from './Enyuan';   // 恩怨重做：城镇里的本地口碑
import './dialog.css';   // 收官 H2：对话框新画风

import { TIER_INK as TIER_COLOR } from './kit/tier';   // 收官 H0：品阶色表收成一份
const TYPE_NAME: Record<string, string> = { pill: '丹药', herb: '灵草', material: '材料', talisman: '符箓', scroll: '功法', artifact: '法宝', misc: '杂物', gear: '装备' };
const click = () => audio.sfx('click');

function useModal(game: Game) { return useSyncExternalStore((f) => game.subscribeModal(f), () => game.modal, () => game.modal); }

export function ModalLayer({ game }: { game: Game }) {
  const m = useModal(game);
  if (!m) return null;
  if (m.kind === 'dialog') return <DialogBox key="dlg" game={game} node={m.node} />;
  if (m.kind === 'shop') return <ShopPanel game={game} shop={m.shop} />;
  if (m.kind === 'town') return <TownPanel game={game} loc={m.loc} fac={m.fac} />;
  if (m.kind === 'auction') return <AuctionHall game={game} loc={m.loc} />;   // P11d：真 NPC 竞价的拍卖厅（ui/AuctionHall.tsx）
  if (m.kind === 'wanbao') return <WanbaoPanel game={game} loc={m.loc} />;
  if (m.kind === 'stall') return <StallPanel key={m.npc} game={game} npc={m.npc} />;
  if (m.kind === 'chronicle') return <ChroniclePanel game={game} />;
  if (m.kind === 'relations') return <RenmaiPanel game={game} />;   // r20：人脉录重做（ui/Renmai.tsx）
  if (m.kind === 'help') return <HelpPanel game={game} />;
  if (m.kind === 'pojin') return <PojinPanel game={game} puzzle={m.puzzle} />;
  if (m.kind === 'mod') return <ModUiPanel key={m.mod + ':' + m.panel} game={game} mod={m.mod} panel={m.panel} />;
  return null;
}

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

// ---------------------------------------------------------------- 代码绘制的半身像（非立绘 NPC 不使用 AI 立绘）
export function Bust({ look, w = 150, h = 190, yaw = 1 }: { look: Look; w?: number; h?: number; yaw?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d')!;
    const S = 5.2 * (w / 150) * dpr;
    const st = new CharState(cv.width / 2, cv.height * 0.3 + 86 * S * look.height);
    st.yaw = (st as any).targetYaw = yaw * Math.PI / 4; st.setAction('idle'); (st as any).blend = 1; (st as any).seed = 3;
    let raf = 0, last = performance.now();
    for (let i = 0; i < 40; i++) { st.update(1 / 60); g.save(); drawCharacter(g, look, st, S, 1 / 60); g.restore(); g.clearRect(0, 0, cv.width, cv.height); }
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      st.update(dt);
      g.clearRect(0, 0, cv.width, cv.height);
      g.save(); drawCharacter(g, look, st, S, dt); g.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [look, w, h, yaw]);
  return <canvas ref={ref} className="bust" style={{ width: w, height: h }} />;
}

// ---------------------------------------------------------------- 对话
// 收官 H2：对话框换成新画风——宣纸底、鎏金双线框、四角角花；立绘探出卡顶；名牌是乌木鎏金的小匾；
// 正文打字机照旧（空格 / 回车 / 点卡片跳过）；选项是一列墨痕按钮：左边朱印数字（数字键照旧能选），
// 提示（hint）灰字常显（手机上没有悬停），不可选的印上「锁」字、整行压暗加斜纹，一眼看得出。四种情绪底色（mood）保留、换新配色。
// 模组对话节点的 portrait / mood / title / tone / hint 都照常显示；旧类名 .dlg-mask .dlg .dlg-opt .dlg-name … 都还在（清界皮肤认），另挂 .dialog。
// 版面：电脑「立绘 | 正文、选项」；手机横屏「立绘 | 正文 | 选项」左右排开省高度；手机竖屏立绘缩成小头像放在名牌左边。
/** 触屏没有键盘：把「（按 G）」「（靠近山门按 E）」这类括注去掉，免得手机上看着像坏了（IS_TOUCH 是活绑定，转屏 / 接鼠标后跟着变） */
const stripKeys = (s: string) => IS_TOUCH
  ? s.replace(/[（(][^（）()]{0,14}?按\s*[A-Za-z0-9?？↑↓←→][^（）()]{0,8}?[)）]/g, '')
      .replace(/[（(]\s*(?:键盘)?\s*[A-Za-z]\s*键\s*[)）]/g, '')
  : s;
const MOODS = new Set(['love', 'danger', 'mystic', 'normal']);

function DialogBox({ game, node }: { game: Game; node: DNode }) {
  const touch = useTouch();
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
  const mood = node.mood && MOODS.has(node.mood) ? node.mood : 'normal';
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
  const face = portrait ? <div className="dlg-portrait" style={{ backgroundImage: `url(${portrait})` }} />
    : node.look ? <Bust look={node.look} /> : <div className="dlg-seal">{node.speaker.slice(0, 1)}</div>;
  return (
    <div className="dlg-mask">
      <div className={`dlg dialog lq-dlg ${mood}${portrait ? ' has-portrait' : node.look ? ' has-bust' : ' has-seal'}${done ? ' done' : ''}${node.chat && game.chat?.available ? ' has-chat' : ''}`} onClick={() => setShown(full.length)}>
        {['tl', 'tr', 'bl', 'br'].map((c) => <img key={c} className={'dlg-corner ' + c} src={cornerUrl} alt="" draggable={false} />)}
        <div className="dlg-face">{face}</div>
        <div className="dlg-main">
          <div className="dlg-head">
            <span className="dlg-plate"><span className="dlg-name">{node.speaker}</span></span>
            {node.title && <span className="dlg-title">{node.title}</span>}
          </div>
          <div className="dlg-text lq-scroll">
            {full.slice(0, shown).split('\n').map((l, i) => <p key={i}>{l || ' '}</p>)}
            {!done && <i className="dlg-caret" aria-hidden />}
          </div>
          {!done && <div className="dlg-skip">{touch ? '轻点卡片看全文' : '空格 / 回车看全文'}</div>}
          {node.chat && game.chat?.available && <ChatBox game={game} target={node.chat} />}
        </div>
        {done && <DialogOptions options={node.options} pick={pick} />}
      </div>
    </div>
  );
}
/** 对话选项：一列墨痕按钮（导出给 tools/test-ui 直接检查长相） */
export function DialogOptions({ options, pick }: { options: DOpt[]; pick: (o: DOpt) => void }) {
  return (
    <div className="dlg-opts">
      {options.map((o, i) => (
        <button key={i} className={'dlg-opt' + (o.tone ? ' ' + o.tone : '') + (o.disabled ? ' off' : '')} style={{ ['--i' as string]: i } as React.CSSProperties}
          disabled={o.disabled} aria-disabled={o.disabled} onClick={(e) => { e.stopPropagation(); pick(o); }}>
          <kbd className="dlg-key">{o.disabled ? '锁' : i + 1}</kbd>
          <span className="dlg-ol">{o.label}</span>
          {o.hint && <small className="dlg-hint">{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 卷轴面板
/** 收官 H1：旧卷轴外壳换成界面底座（LqPanel = LacquerModal + 旧类名 .modal-mask / .scroll-panel / .cult-panel / .panel-head / .panel-title / .close-btn / .cult-body） */
function Scroll({ title, short, sub, onClose, children, wide, cls, top, compact }: { title: string; short?: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; cls?: string; top?: React.ReactNode; compact?: boolean }) {
  return <LqPanel title={title} shortTitle={short} sub={sub} onClose={onClose} wide={wide} compact={compact} top={top} cls={'cult-panel ' + (cls ?? '')}>{children}</LqPanel>;
}

// ---------------------------------------------------------------- 交易
function ShopPanel({ game, shop }: { game: Game; shop: Shop }) {
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [talk, setTalk] = useState(false);
  const h = game.hero;
  const contrib = shop.currency === 'contrib';
  const money = contrib ? game.ws.sect?.contrib ?? 0 : C.bagCount(h, 'mat_lingshi');
  const unit = contrib ? '贡献' : '灵石';
  const sellable = h.bag.filter((b) => b.id !== 'mat_lingshi' && itemDef(b.id).price > 0 && itemDef(b.id).type !== 'misc');
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
                <div style={{ display: 'flex', gap: 4 }}>
                  {canProbe && <button className="ink-btn small ghost" title="耗少许法力以神识辨认地摊货真伪" onClick={() => { const res = game.renxin.probeShopItem(s); game.toast(res.msg, res.spottedFake ? 'warn' : 'info'); audio.sfx(res.spottedFake ? 'fail' : 'click'); re(); }}>掌眼</button>}
                  <button className="ink-btn small" disabled={money < s.price || exposedFake} onClick={() => { if (game.towns.buy(shop, s)) audio.sfx('chime'); re(); }}>{exposedFake ? '假货' : '购买'}</button>
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
              <div className="sr-buy"><div className="sr-price">{p} 灵石</div>
                <button className="ink-btn small ghost" onClick={() => { game.towns.sell(shop, b.id, b.age); click(); re(); }}>卖出</button></div>
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
  const occupied = T.occupied(loc);
  const isSect = loc.type === 'sect';
  const big = loc.type === 'city' || loc.type === 'isle' || loc.id === 'tainan';
  type F = { seal: string; name: string; desc: string; act: () => void; dis?: string; cls?: string; key?: string };
  const fs: F[] = [];
  if (isSect) fs.push({ seal: '宗', name: loc.id === 'mysect' ? '宗主大殿' : game.ws.sect?.id === loc.id ? '宗门事务' : '山门', desc: loc.id === 'mysect' ? '门人、收徒、藏经阁发布功法、自创功法、宗门建设' : game.ws.sect?.id === loc.id ? `${SECT_RANKS[game.ws.sect.rank]} · 贡献 ${game.ws.sect.contrib}　任务、藏经阁、俸禄、晋升` : '拜入宗门，领取俸禄与任务', act: () => game.openDialog(T.sectNode(loc)), cls: 'gold' });
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
  fs.push({ seal: '栈', name: isSect ? '洞府' : '客栈', desc: isSect ? '歇息一夜，自动存档' : `住店一晚（${loc.type === 'city' ? 5 : 2} 灵石），气血法力尽复，自动存档`, act: () => { T.rest(loc); re(); } });
  if (T.hasTeleport(loc)) fs.push({ seal: '阵', name: '传送阵', desc: `已激活 ${game.ws.tp.length} 处，按路程收取灵石`, act: () => setTp(!tp) });
  if (game.wanbao.has(loc)) { const W = game.wanbao, n = W.ordersIn(wbZoneOf(loc)).length, got = W.S.payout > 0 || W.S.returned.length > 0; fs.push({ seal: '宝', name: '万宝楼', desc: got ? `你的寄售有了进账，待领 ${W.S.payout} 灵石` : `寄售、求购、看行情——楼里挂着 ${W.listingsIn(wbZoneOf(loc)).length} 单货，${n} 张求购`, act: () => game.openModal({ kind: 'wanbao', loc }), cls: 'gold' }); }
  if (T.isMajorTown(loc)) { const open = T.auctionOpen(loc); const d = Math.floor(game.day) % 90; fs.push({ seal: '拍', name: '拍卖会', desc: open ? `正在举行（还剩 ${90 - d} 日）` : `每季末举行，${80 - d} 日后开拍`, act: () => game.openModal({ kind: 'auction', loc }), dis: open ? undefined : '尚未开拍', cls: open ? 'gold' : '' }); }
  { const ob = game.happen.obtain.facility(loc.id); if (ob) fs.push({ seal: '客', name: ob.name, desc: ob.desc, act: () => game.openDialog(game.happen.obtain.node()), cls: 'gold' }); }
  for (const b of BEAUTIES) if (b.home === loc.id) { const s = game.ws.hearts[b.id]; const n = game.npcs.byId.get('b_' + b.id); if (n?.alive && (n.map ?? 'tiannan') === loc.map && Math.hypot(n.x - loc.x * 300, n.y - loc.y * 300) < 8000) fs.push({ seal: '缘', name: s?.met ? `拜访${b.name}` : '传闻中的仙子', desc: s?.met ? b.title : '听说此地住着一位女修……', act: () => game.hearts.talk(b.id), cls: 'love' }); }
  for (const f of game.enyuan.townFacs(loc)) fs.push(f);   // 恩怨重做 · 第二批：报官、通缉榜、请长老调停
  if (modx) for (const f of modx.townFacs(loc)) fs.push(f);   // v0.56：模组加的事务
  { const tw = game.combat.wreck.town.card(loc); if (tw) fs.push({ seal: '修', name: tw.name, desc: tw.desc, act: () => game.openDialog(tw.act()), cls: 'gold' }); }   // 城镇破坏：捐资修缮、赔损坏账（坊市管事）
  const SEAL_KEY: Record<string, string> = { 宗: 'sect', 市: 'market', 丹: 'pill', 器: 'artifact', 符: 'talisman', 宅: 'broker', 酒: 'tavern', 赏: 'board', 栈: 'rest', 阵: 'teleport', 拍: 'auction', 宝: 'wanbao' };
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
  // 收官 P8（丁）：人就在城里时，能走进去的设施卡上多一个「走过去」——地上指路，自己走进屋找掌柜（直接点卡片仍照旧开面板）
  const here = game.indoor.inLoc(loc);
  const walkTo = (key?: string) => { const r = here && key ? game.indoor.roomFor(loc, key) : null; return r && !game.indoor.collapsed(r) ? r : null; };   // 半塌的屋不指路进去
  return (
    <Scroll title={loc.name} sub={<span>【{TIER_NAME[cityTier(loc)]}】{(() => { const [y, j] = game.garrison.count(loc); return y + j ? `坐镇：元婴 ${y} · 结丹 ${j}　` : ''; })()}{loc.desc}　·　灵石 <b>{C.bagCount(h, 'mat_lingshi')}</b>　·　{repName(game.ws.rep)}</span>} onClose={() => game.closeModal()} wide cls="town-panel">
      {occupied && <div className="town-warn">梁国已沦陷，此地被魔道占据，商铺尽数关门。</div>}
      <KoubeiLine game={game} loc={loc} />{/* 恩怨重做：本地口碑 */}
      <div className="town-grid">
        {fs.map((f, i) => (
          <button key={i} data-fac={f.key} className={'town-fac ' + (f.cls ?? '')} style={{ ['--d' as string]: i * 28 + 'ms' } as React.CSSProperties} disabled={!!f.dis} onClick={() => { click(); f.act(); }}>
            <span className="tf-seal">{f.seal}</span><span className="tf-name">{f.name}</span><span className="tf-desc">{f.dis ?? f.desc}</span>
            {(() => { const r = walkTo(f.key); return r ? <span role="button" className="tf-walk" title="在地上指路，自己走进去找掌柜" style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 12, padding: '1px 8px', borderRadius: 10, background: 'rgba(29,74,90,0.12)', color: '#1d4a5a', border: '1px solid rgba(29,74,90,0.35)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); click(); game.closeModal(); game.indoor.guideTo(r); }}>走过去</span> : null; })()}
          </button>
        ))}
      </div>
      <ModSlot id="town" />
      {tp && <div className="tp-list">
        <div className="sec-title">传送阵<small>只能前往已激活的阵台（大城、大宗门）</small></div>
        {tps.length === 0 && <div className="hint">尚未激活其他传送阵。亲身抵达各大城池、宗门即可激活。</div>}
        {tps.map((l) => { const c = T.tpCost(loc, l); return <button key={l.id} className="tp-row" disabled={C.bagCount(h, 'mat_lingshi') < c} onClick={() => { audio.sfx('whoosh'); T.teleportTo(loc, l); }}><b>{l.name}</b><span>{c} 灵石</span></button>; })}
      </div>}
      <div className="hint" style={{ marginTop: 8 }}>{IS_TOUCH ? '点人交谈 · 点摊主的招牌开摊位 · 右上 × 离开' : `${keyLabel(bindOf('interact'))} 与城中之人交谈 · ${keyLabel(bindOf('hearts'))} 友人录 · ${keyLabel(bindOf('chronicle'))} 大事记 · Esc 离开`}</div>
    </Scroll>
  );
}

// 第二十九步的人脉录：r20 重做后拆到 ui/Renmai.tsx（亲族关系树、人际关系卡片、恩怨 / 宗门 / 记事 / 天下事）

// ---------------------------------------------------------------- 大事记
function ChroniclePanel({ game }: { game: Game }) {
  const ev = game.events.chronicle();
  const news = game.ws.news.slice().reverse().slice(0, 60);
  const s = game.ws.sect;
  const year = Math.floor(game.day / 360) + 1;
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const ch = game.chances();
  return (
    <Scroll title="大事记 · 机缘录" short="大事记" sub={<span>第{year}年　·　{repName(game.ws.rep)}（{game.ws.rep}）　·　{s ? `${LOC_BY_ID.get(s.id)?.name} ${SECT_RANKS[s.rank]}` : '散修'}</span>} onClose={() => game.closeModal()} wide>
      <div className="chron chron3">
        <div className="chron-col">
          <div className="sec-title">眼下机缘<small>能做、值得做的事</small></div>
          {ch.map((c, i) => (
            <div key={i} className={'chance' + (c.hot ? ' hot' : '') + (c.tone ? ' ' + c.tone : '')}>
              <div className="cc-head"><b>{c.t}</b>{c.x !== undefined && c.y !== undefined && <button className="cc-go" onClick={(e) => { e.stopPropagation(); audio.sfx('chime'); game.setGuide(c.x!, c.y!, c.t.trim()); re(); }} title="只在地图上标出，不关面板">指路</button>}</div>
              <div className="cc-desc">{c.d}</div>
            </div>
          ))}
          <div className="hint">闭关 30 日以上，出关时必有访客：宗门传讯、故交赠礼或散修报信。</div>
          {game.guide && <div className="hint" style={{ color: '#1d4a5a' }}>已在图上标出：指路 → {game.guide.name}　<button className="cc-go" onClick={() => { game.guide = null; re(); }}>取消</button></div>}
        </div>
        <div className="chron-col">
          <div className="sec-title">人界大势<small>人界大事，结局可被改变</small></div>
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
      <div className="hint">修为：{REALMS[game.hero.realm].name}　·　图例：红色为进行中的大事件（小地图上会闪烁标出战场）</div>
    </Scroll>
  );
}

// ---------------------------------------------------------------- 帮助
export const VERSION = 'v0.8.1 · 模组接口五代';
function HelpPanel({ game }: { game: Game }) {
  const [tab, setTab] = useState(0);
  const T = ['操作', '新玩法', '修炼', '战斗', '人界', '神识', '机缘', '神通', '阵法', '友人', '众生'];
  const body = [
    // 收官 H1：键位从 core/keymap 取（原来写死的 H 友人录、I 衣橱都过时了）
    <div key={0}>{IS_TOUCH ? <TouchHelp /> : <KeysHelp />}<p className="hint" style={{ marginTop: 8 }}>左上角目标卷轴显示主线目标与方向，点它自动前往；任务人物头顶有“！”。</p></div>,
    <div className="hd-intro guide-new" key={'new'}>
      <b>近战架势（{keyLabel(bindOf('brawl'))} / 鼠标中键）：</b>进了架势，左键轻击连段、右键崩山把人轰飞——轻点立刻出手，他朝鼠标所指之处飞（鼠标放在礁石上，他就撞礁石）；按住右键是定向：时间放慢，他身上一根箭头跟着鼠标转，沿途会撞上的东西发红光、落点画一个圈，松开出手（最多撑一息左右自动出手）。出手时按住 {ascendLabel()} 是上挑（打上天、在空中停一会儿再落下），按住 {keyLabel(bindOf('descend'))} 是往下砸。{keyLabel(bindOf('run'))} 欺身扑上去、{keyLabel(bindOf('dodge'))} 缩地追到他前头接着打，上挑起来的人是瞬移到他头顶、默认往下砸；自己被打飞时 {keyLabel(bindOf('dodge'))} 是脱困（耗灵力）；御剑时手上没人可追，{keyLabel(bindOf('dodge'))} 照常是上升。锁定的对手罡气已破时，他脚下有一根淡箭头预告这一下会把他打向哪。挨打先掉罡气，罡气打空了才会被轰飞。法术书「近战」里有同样四式，不进架势也能放进快捷栏用。手里有兵器就用兵器：兵器槽里的剑、刀锤、枪棍，或者结成本命的飞剑（握在手里当剑使），四式的名字和打法跟着兵器变——剑快而伤血重、重兵慢而横扫一片还有霸体、枪最长能穿人能挑；空着手就是拳脚。手机上快捷栏旁的「架」进架势，长按「崩」变成小摇杆定方向，按着时点「升」「降」选上挑 / 下砸。<br />
      <b>储物袋（{keyLabel(bindOf('bag'))}）：</b>格子能拖：拖到左右的装备槽穿上、拖回格子卸下、拖到下面的快捷栏放进去、拖出袋子是丢弃（会问一声）；双击或右键直接穿戴 / 服用。手机上长按起拖，点一下选中在底下出操作条。装备有发冠、腰带、护腕、戒指、玉佩五个新槽，每件带一到三条随机词条；玄龟、崩山两套集齐两件、四件另有加成；攻击法宝能拖到「本命法宝」槽结为本命。<br />
      <b>无边海：</b>离岸越远越凶——近海碧水如常；迷雾断层里灵力回得慢、飞不高、罗盘乱转；核心区灵力一直往外流、只能贴着海面飞、遁空梭失灵，还有飓风、鬼雾和空间裂缝。法力见底又没有载具就会落水泅渡，等法力回上来再起飞。<br />
      <b>秘境的云门：</b>秘境的入口、首领身后的古阵都是一团云门——人走进去（或飞进去），云越来越浓，浓到遮满那一刻就到了另一边，不弹窗、不黑屏；回头再走进去就出来了。<br />
      <b>摆摊：</b>大城的集市里，行商和散修会坐下摆摊，头顶挂着摊名和一句吆喝——点招牌（或和他交谈选「交易」）打开他的摊位：卖的是他储物袋里的真东西，价钱看行情和他的脾气；能还一次价（砸了这件就不卖你了），能掌眼看真假，也能把东西卖给他（他身上有多少灵石就收多少）。
    </div>,
    <div className="hd-intro" key={1}>打坐（{keyLabel(bindOf('sit'))}）时光阴 ×4，修为随灵根、功法、所在地灵气增长。修为满后遇小瓶颈需服丹冲关，大境界圆满后在角色面板冲击下一境界（筑基需筑基丹）。<br />问道残卷（开局即在身上）每七日凝一滴墨露，滴在灵草上一株化三；与人斗法时还能观招偷学（法术书「问道残卷」页）。高年份灵草提高炼丹成功率。<br />闭关（{keyLabel(bindOf('seclude'))}）可一次度过数月至十年，但人界大事不会等你。</div>,
    <div className="hd-intro" key={2}>9 格快捷栏，法术、法器与<b>符箓</b>任意摆放（符箓一次性消耗，栏位显示剩余张数，对高境界衰减较少）。法术分凡 / 黄 / 玄 / 地 / 天五品，熟练度初学 → 圆满会改变形态。<br />异状连携：冰冻 + 雷、定身 + 火、燃烧 + 风、中毒 + 火……<br />倒下不会坐化：损失一成修为与少量物品，在最近城镇醒来。越阶挑战九死一生，名牌颜色提示强弱。剧情战倒下不受惩罚，可直接重来。</div>,
    <div className="hd-intro" key={3}>人界约 450 人各有境界、宗门、性格与目标，会修炼、衰老、陨落，也会彼此斗法——你可以旁观、相助或捡漏。劫修专挑弱者下手，声望决定正魔两道对你的态度。<br />城镇：坊市、丹药铺、法器阁、符箓斋、酒楼、客栈、传送阵、拍卖会。宗门：俸禄、任务、藏经阁、晋升。<br />人界大事按年份发生（问仙大会、赤霄禁地、鸿家堡、魔道入侵、归墟殿、陨魔谷），提前一年在酒楼与大事记中传闻。</div>,
    <div className="hd-intro" key={4}>只有神识圈内的东西才是“真实”的——圈外是褪色的记忆水墨，看不到任何动静。奇遇、敌人、行人都要靠神识发现。<br />神识随境界与功法增长；天衍诀、养魂木等会改变神识的样貌与范围。{keyLabel(bindOf('sense'))} 外放神识（范围 ×2，持续消耗法力，再按一次收回），{keyLabel(bindOf('conceal'))} 敛息（范围缩小，但不易被更强者察觉）。<br />被更强的神识扫过时，圈边泛红、画面轻震——那意味着有人注意到你了。<br /><br /><b>遁术</b>：飞行中按住 {keyLabel(bindOf('run'))} 催动遁光（持续耗法力，期间不回蓝），越飞越高、视野越开阔。云雷双翼可施雷遁，血色披风可化血光遁。<br /><b>追杀</b>：身怀重宝、拍得宝物、斩杀魔修、夺得遗府后，可能被高一境界的修士以神识锁定追杀——硬拼九死一生。拉开距离出其锁定范围、遁地符 / 血遁隐去身形、敛息，或逃入宗门坊市，皆可脱身。顶部横幅显示锁定状态，屏幕边缘箭头指示追兵方位。<br /><br /><b>投放距离</b>：功法、法器、符箓最远只能打到神识范围的八成（外放神识时为外放范围的七成）——神识越强，出手越远。<br /><b>妖兽</b>：按传说分一至十级——一级相当炼气（再分下 / 中 / 上 / 顶阶），二至四级相当筑基，五至七级相当结丹，八至十级是已化形的大妖。五级以上周身缭绕妖气。双瞳鼠、阴芝马擅隐匿，需神识贴近或外放才能发现；土甲龙见人便逃，重伤时会土遁；云翅鸟会尖啸示警，引来附近妖兽。毒蛟、六翼霜蚣、风希等妖王只在固定巢穴出没，斩杀后三年才有新妖王占据。<br /><b>妖丹与炼器</b>：妖兽有一定几率留下同级妖丹（五级以上必有），妖丹会自行飞入怀中。右侧“丹器”按钮打开的丹房新增“炼器”页：以墨蛟鳍炼神风舟、墨蛟爪炼乌龙夺、雷鹏骨翅加金雷竹炼云雷双翼……在城镇或宗门借地火更稳，野外炼器成器率大减。</div>,
    <div className="hd-intro" key={5}><b>机缘：</b>神识扫过山野，会显出灵草王、修士遗骸、古修洞府、兽巢、灵脉、古碑、山神庙、灵池、古战场——走近按 {keyLabel(bindOf('interact'))}。守药妖兽若在熟睡，偷袭伤害 ×2.5；敛息潜近更稳妥。古修洞府有三重禁制，可强破、神识寻隙或用破禁符。<br /><b>洞府：</b>在灵脉上开辟洞府，种药园、布禁制，打坐灵气加成；坊市卖回府符（{keyLabel(bindOf('recall'))}）。<br /><b>灵宠：</b>兽巢偷来的灵卵会自动温养，破壳后随你出战、喂妖丹成长（{keyLabel(bindOf('pets'))}）。<br /><b>心魔劫：</b>结丹、结婴前会入幻境，幻境由你一路的经历生成，心境稳则成功率上升。</div>,
    <div className="hd-intro" key={6}><b>灵力化形（结丹）：</b>金丹一成，灵力可离体凝形——自然悟得「化形·青龙」。其余六形要「观兽悟形」：斩杀虎豹狼狮悟白虎、龟蟹鳄甲蛇悟玄武、带火字的妖兽悟火凤、鹰雕禽鸟悟雷鹏、鹿牛马羊悟麒麟、猿熊悟魔猿；妖兽境界越高、越是妖王，悟得越多（筑基时悟的也作数）。七形各有打法：青龙贯穿、火凤俯冲火海、白虎连扑破甲、玄武护身引敌、雷鹏连环雷击、麒麟踏地震晕、魔猿横扫击飞。法术书里选中任一化形可看参悟进度。<br /><br /><b>元婴出窍（元婴）：</b>元婴离体，肉身就地盘坐、罩着护体金光；元婴尺许大小，遁速倍增、法术伤害 +25%、所受伤害 ×0.75，出窍一刹神识冲击震慑四方。<b>元婴期化形与出窍叠加</b>：七形体形放大、威力再增并各多一段后招，元婴之身照样能化形。敌人专找毫无还手之力的肉身下手——护光碎了元婴会被震回、眩晕一息。元婴走不出神识之外；再按一次归窍。出窍时元婴瞬移更远、冷却减半，神识看得穿禁制阵眼。<br /><br /><b>旁人也会：</b>结丹以上的敌修也会化形（一形，元婴与首领两形），出招前地上照样亮预警，法相脚下带一圈暗红煞气；元婴敌修会元婴出窍——<b>打破它盘坐的肉身</b>，元婴被震回、眩晕一阵还要折损气血。结丹以上的同行友人会化形助你，元婴友人会出窍杀敌（肉身留在原地，护光被打破就得退下调息），懂阵的友人会就地布困阵、庚金剑阵，你伤重时布回春阵。</div>,
    <div className="hd-intro" key={7}><b>阵法禁制：</b>阵法与禁制本是一物——有人主持的叫阵法，前人留下、无人主持的叫禁制。按 {keyLabel(bindOf('zhenfa'))} 打开阵法盘：手持阵盘、按阵插旗、以灵石为阵眼，就地布阵；也可把阵放进快捷栏一键布阵。<br />· 困阵、迷踪阵、颠倒五行阵困敌乱敌；庚金剑阵、五雷阵、地火阵杀敌；玄武护阵挡飞矢、两仪微尘阵反震；聚灵阵助修炼、回春阵疗伤、敛息阵藏形。<br />· 阵盘品阶定威力与可同时主持的阵数；上品阵旗威力 +25%。收阵时阵旗尽数收回，阵眼被人轰碎则折损一半。<br />· 阵道：布阵、破阵、破禁、研读阵图都长阵道；阵道越高阵越强越大，「初窥门径」起看得穿禁制里的杀阵节点与敌阵阵眼。<br />· 精熟：每座阵各有「初成 → 小成 → 大成 → 圆满」，布得越多、阵中困敌越多越熟；威力、范围、时长、阵眼逐级增强，圆满时省一面阵旗。<br />· 魔道阵修会布阵对付你：困阵、迷踪阵（走到阵界又被雾兜回）困得住人；庚金剑阵、五雷阵、地火阵是杀阵，剑雨雷火专落你脚下。找到阵眼走过去按 {keyLabel(bindOf('interact'))} 破开；庚金、五雷两座杀阵也可直接冲出阵界。<br />· 遗府、古修遗骸的禁制可选「破禁之局」：从生门起按五行相生（木→火→土→金→水→木）逐一点破阵眼；破禁锥可稳稳钉碎一处。<br />· 洞府可叠布数重阵法禁制：防贼、困贼、聚灵、隐匿。</div>,
    <div className="hd-intro" key={8}>
      <b>友人录（{keyLabel(bindOf('hearts'))}）：</b>同行 · 知交 · 邀约三页。好感三十以上的人是知交，可当面邀其同行；不在身边的好友（好感四十以上）可传音相邀，按路程几日后赶到。同行最多三人（不含伴侣），可下令原地等候、跟上、散去。同行的友人替你出手挡刀。<br />
      <b>邀约：</b>好友会传音约你「同探洞府」或「被围求援」，应约后地图上标「约」。有真有假——表面热络、心里另有打算的人约你，会合处可能埋着伏兵。境界高出两层、神识外放、吃过亏的阅历、天衍诀或明清灵目，都能看出信里的蹊跷。爽约要掉好感。<br />
      <b>三方混战：</b>妖兽护领地，劫修、追兵闯进来照样挨咬，被咬的也会还手——被追杀时把追兵引进兽窝，坐收渔翁之利。
    </div>,
    <div className="hd-intro" key={9}>
      <b>众生行：</b>宗门左近常遇巡山弟子；野外有散修猎妖、两伙人斗法抢宝。这些人不冲你来、不进自动锁定；你帮忙会得一份，你先动手他们就翻脸。<br />
      <b>撼山客：</b>江湖上有个赤膊的大汉，不进城、不入宗门，满南荒的险地里找妖王打架，听说修为总比你高出一截。酒楼茶肆常有他的传闻；他走过的地方留着拳坑、断树和犁开的沟，越新越清楚，顺着走能追上他；离得近了，天边会一闪一闪、闷雷滚滚，小地图边上有个震动的记号。见过他一面，世界地图上就记着他最后出没的地方。<br />
      他不爱说话，却肯指点后辈——上前请教，他会先让你几招。撑得越久，他越看得起你。可别对他先动手，也别当他的面欺负手无寸铁的人。
    </div>,
    
  ];
  return (
    <Scroll title="修仙指南" sub={<span>{VERSION}</span>} onClose={() => game.closeModal()} wide cls="help-panel" top={<div className="tabs guide-tabs">{T.map((t, i) => <button key={i} className={tab === i ? 'on' : ''} onClick={() => { click(); setTab(i); }}>{t}</button>)}</div>}>
      {body[tab]}
    </Scroll>
  );
}
