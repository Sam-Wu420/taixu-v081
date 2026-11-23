// 收官 D（甲）：个人摊位窗口（照 DNF「个人商店」的结构）——标题「个人摊位」、摊主头像、摊名、吆喝气泡、一排排货格（空位是上锁的格子）、
// 选中后的详情与「购买 / 还价 / 掌眼」；底栏是你的灵石和「卖东西给他」。货、价钱、买卖都在 world/stall.ts。
// 外壳用界面底座的 LacquerModal（紧凑版、乌木漆底）；类名一律 stl-（不用全局 .wb-*：和 wanbao 模组撞名）。
// 动效只动 transform / opacity：开合（底座）、货格依次浮现、成交盖章、还价成败的小演出、买空的格子合上。
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Game } from '../world/game';
import type { NpcData } from '../world/npc';
import { PERS_NAME } from '../world/npc';
import * as C from '../world/cultivation';
import { itemDef } from '../data/items';
import { npcPortrait } from '../data/portraits';
import { audio } from '../world/audio';
import { STALL_CELLS, WARE_GLYPH, keeperTitle, type StallGood } from '../world/stall';
import { LacquerModal, ItemCell, Stone, PopNumber, Btn, InkToast, useInkToast, Tooltip, tierColor, fmtStone } from './kit';
import { ItemCard } from './Inventory';
import { Bust } from './ModalLayer';
import './stall.css';

const click = () => audio.sfx('click');
/** 收官 H2：还价成功前的真实开价（摊主 id|货 key|日子 → 价）。以前删除线显示的是「现价 ÷ 0.82」的估算，和还价前的开价对不上；
 *  记在模块里（关了窗口再开还在），不知道的（比如读档以后）就不画删除线，宁缺毋错 */
const WAS_PRICE = new Map<string, number>();
const wasKey = (game: Game, d: NpcData, key: string) => `${d.id}|${key}|${Math.floor(game.day)}`;
function useMode() {
  const get = () => { const w = typeof window === 'undefined' ? 1600 : window.innerWidth, h = typeof window === 'undefined' ? 900 : window.innerHeight; return h <= 520 ? 'land' : w <= 760 ? 'tall' : 'wide'; };
  const [m, setM] = useState<'wide' | 'tall' | 'land'>(get);
  useEffect(() => { const f = () => setM(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return m;
}

/** 摊位要的那几样接口（StallSys 自己；收官 B3 幽灵古船上的鬼市摊主另有一份，见 world/seaqiyu.ts 的 GhostStall） */
type StallLike = Pick<Game['stall'], 'info' | 'goods' | 'buy' | 'haggle' | 'hagChance' | 'probe' | 'offer' | 'sellTo'>;
export function StallPanel({ game, npc }: { game: Game; npc: string }) {
  const gv = game.jueyu.qiyu.vendor(npc);   // 收官 B3：鬼市摊主（'ghost:N'）
  const d = gv?.d ?? game.npcs.byId.get(npc);
  if (!d) return null;
  return <StallInner game={game} d={d} S={gv?.S ?? game.stall} pic={gv?.pic} />;
}

function StallInner({ game, d, S, pic }: { game: Game; d: NpcData; S: StallLike; pic?: string }) {
  const h = game.hero;
  const mode = useMode();
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [sel, setSel] = useState<string | null>(null);
  const [selB, setSelB] = useState<C.BagItem | null>(null);
  const [stamp, setStamp] = useState<{ t: string; k: number; tone: string } | null>(null);
  const [line, setLine] = useState<{ t: string; k: number } | null>(null);
  const [shake, setShake] = useState<{ key: string; n: number } | null>(null);
  const [closing, setClosing] = useState<Record<number, StallGood>>({});
  const [msg, say] = useInkToast(2600);
  const inf = S.info(d);
  const goods = S.goods(d);
  // 每件货一个固定的格子：新进的货落到第一个空格，卖空的那格合上（不让后面的格子往前挪）
  const slots = useRef(new Map<string, number>());
  const prev = useRef(new Map<string, StallGood>());
  {
    const used = new Set(slots.current.values());
    for (const gd of goods) if (!slots.current.has(gd.key)) { let i = 0; while (used.has(i)) i++; slots.current.set(gd.key, i); used.add(i); }
  }
  useEffect(() => {
    const now = new Map(goods.map((g) => [g.key, g] as [string, StallGood]));
    const gone: Record<number, StallGood> = {};
    for (const [k, g] of prev.current) if (!now.has(k)) { const i = slots.current.get(k); if (i !== undefined) { gone[i] = g; slots.current.delete(k); } }
    prev.current = now;
    if (Object.keys(gone).length) { setClosing((c) => ({ ...c, ...gone })); window.setTimeout(() => setClosing((c) => { const n = { ...c }; for (const i of Object.keys(gone)) delete n[+i]; return n; }), 650); }
  });
  // 第五轮：格子数按货量给（一行六格，凑整到整行），不再固定 24 格（六件货配十八个锁格）；STALL_CELLS 只是货的上限
  const nCells = Math.min(Math.max(STALL_CELLS, 6), Math.max(6, ...[goods.length, ...[...slots.current.values()].map((i) => i + 1)].map((n) => Math.ceil(n / 6) * 6)));
  const byIdx = new Map<number, StallGood>(); for (const g of goods) byIdx.set(slots.current.get(g.key)!, g);
  const cur = goods.find((g) => g.key === sel) ?? null;
  // 开窗口默认选中第一件
  useEffect(() => { if (!sel && goods[0]) setSel(goods[0].key); }, []);
  // 吆喝每八九息换一句
  useEffect(() => { const t = window.setInterval(re, 3000); return () => window.clearInterval(t); }, []);

  const stones = C.bagCount(h, 'mat_lingshi');
  const doStamp = (t: string, tone = 'zhu') => setStamp({ t, k: Date.now(), tone });
  const talk = (t: string) => setLine({ t, k: Date.now() });
  const shakeKey = (key: string) => setShake({ key, n: Date.now() });
  const lineNow = line && Date.now() - line.k < 3600 ? line.t : null;

  const buy = (g: StallGood) => {
    const err = S.buy(d, g);
    if (err) { audio.sfx('fail'); say(err); shakeKey(g.key); return; }
    audio.sfx('chime'); doStamp('成交');
    talk(['道友好眼力！', '承惠承惠。', '拿好，下回再来！', '这件跟了你，算它的造化。'][Math.floor(Date.now() / 997) % 4]);
    say(`购得 ${itemDef(g.id).name}　-${fmtStone(g.price)} 灵石`);
    game.updateUI(true); re();
  };
  const haggle = (g: StallGood) => {
    const before = g.price;
    const r = S.haggle(d, g); if (!r) return;
    if (r.ok) WAS_PRICE.set(wasKey(game, d, g.key), before);
    talk(r.line);
    if (r.ok) { audio.sfx('chime'); doStamp('让利', 'jade'); say(`还价成了：${fmtStone(g.price)} → ${fmtStone(r.price)} 灵石`); }
    else { audio.sfx('fail'); doStamp('不卖'); shakeKey(g.key); say(`${d.name}不高兴了，这件今天不卖你。`); }
    re();
  };
  const probe = (g: StallGood) => {
    const r = S.probe(d, g);
    audio.sfx(r.spottedFake ? 'fail' : 'click'); say(r.msg.length > 46 ? r.msg.slice(0, 45) + '…' : r.msg);
    if (r.spottedFake) { doStamp('伪'); talk('……（摊主眼神闪烁，把头扭向一边）'); }
    re();
  };
  const sellables = h.bag.filter((b) => C.shownCount(h, b) > 0 && S.offer(d, b) > 0);
  const curB = selB && h.bag.includes(selB) && C.shownCount(h, selB) > 0 ? selB : null;
  const sell = (b: C.BagItem) => {
    const p = S.offer(d, b), err = S.sellTo(d, b);
    if (err) { audio.sfx('fail'); say(err); talk(err.includes('收不起') ? '囊中羞涩，收不起啊……' : '这个我不收。'); return; }
    audio.sfx('chime'); doStamp('成交'); talk('东西不错，我收了。'); say(`卖出 ${itemDef(b.id).name}　+${fmtStone(p)} 灵石`);
    if (!h.bag.includes(b) || C.shownCount(h, b) <= 0) setSelB(null);
    game.updateUI(true); re();
  };
  const portrait = useMemo(() => pic ?? npcPortrait(d), [d, pic]);
  const look = useMemo(() => game.npcs.look(d), [d]);
  const cell = 'stl-cell';
  const shk = (key: string) => (shake && shake.key === key ? ' shake-' + (shake.n % 2) : '');

  return (
    <LacquerModal title="个人摊位" variant="lacquer" compact className={'stl m-' + mode} width={880} height={720} onClose={() => game.closeModal()} closeTip="离开摊位（Esc）">
      <div className="stl-body">
        {/* —— 左：摊主、摊名、吆喝、货格 */}
        <div className="stl-main">
          <section className="stl-head">
            <div className="stl-face">{portrait ? <div className="stl-portrait" style={{ backgroundImage: `url(${portrait})` }} /> : <Bust look={look} w={mode === 'wide' ? 96 : 64} h={mode === 'wide' ? 120 : 80} />}</div>
            <div className="stl-who">
              <div className="stl-name"><span className="stl-seal">{WARE_GLYPH[inf.ware]}</span><span className="stl-name-t">{inf.name}</span></div>
              <div className="stl-keeper">{d.name}<small>{keeperTitle(d, PERS_NAME[d.pers])}</small>{inf.urgent && <em className="stl-urgent">急用灵石</em>}</div>
              <div className={'stl-bubble' + (lineNow ? ' say' : '')} key={lineNow ? 'l' + line!.k : inf.shout}>{lineNow ?? inf.shout}</div>
            </div>
          </section>
          <nav className="stl-mode">
            <button className={tab === 'buy' ? 'on' : ''} onClick={() => { click(); setTab('buy'); }}>他的货 <small>{goods.length}</small></button>
            <button className={tab === 'sell' ? 'on' : ''} onClick={() => { click(); setTab('sell'); }}>卖给他 <small>{sellables.length}</small></button>
          </nav>
          {tab === 'buy' ? (
            <div className="stl-grid lq-scroll" key="buy">
              {Array.from({ length: nCells }, (_, i) => {
                const g = byIdx.get(i), cl = closing[i];
                if (!g) return (
                  <div key={'e' + i} className="stl-slot" style={{ ['--d' as string]: Math.min(i, 30) * 22 + 'ms' } as CSSProperties}>
                    <ItemCell lock className={cell} />
                    {cl && <ItemCell id={cl.id} tier={itemDef(cl.id).tier} className={cell + ' closing'} />}
                  </div>
                );
                const it = itemDef(g.id), seen = g.fake && g.ident, refused = g.hag === 'fail';
                return (
                  <div key={g.key} className="stl-slot" style={{ ['--d' as string]: Math.min(i, 30) * 22 + 'ms', ['--fd' as string]: ((i * 0.37) % 3).toFixed(2) + 's' } as CSSProperties}>
                    <ItemCell id={g.id} n={g.n} tier={it.tier} age={g.age} on={cur?.key === g.key} mark={seen ? '伪' : g.hag === 'ok' ? '让' : g.affix ? undefined : undefined}
                      className={cell + (refused ? ' refused' : '') + shk(g.key)} onClick={() => { click(); setSel(g.key); }}>
                      <span className="stl-price">{fmtStone(g.price)}</span>
                      {refused && <span className="stl-no">不卖</span>}
                    </ItemCell>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="stl-grid lq-scroll" key="sell">
              {sellables.length === 0 && <div className="stl-empty">袋里没有他肯收的东西。</div>}
              {sellables.map((b, i) => { const it = itemDef(b.id), p = S.offer(d, b), poor = p > d.wealth; return (
                <div key={(b.uid ?? b.id) + ':' + (b.age ?? '') + ':' + i} className="stl-slot" style={{ ['--d' as string]: Math.min(i, 30) * 18 + 'ms' } as CSSProperties}>
                  <ItemCell id={b.id} n={C.shownCount(h, b)} tier={it.tier} age={b.age} on={curB === b} off={poor} mark={b.fake && b.ident ? '伪' : undefined} className={cell} onClick={() => { click(); setSelB(b); }}>
                    <span className={'stl-price' + (poor ? ' poor' : '')}>{fmtStone(p)}</span>
                  </ItemCell>
                </div>
              ); })}
            </div>
          )}
        </div>

        {/* —— 右：选中的那件 */}
        <aside className="stl-side">
          {tab === 'buy' && cur ? (
            <div className="stl-detail" key={cur.key}>
              <div className="stl-card lq-scroll"><ItemCard game={game} b={{ id: cur.id, n: cur.n, age: cur.age, affix: cur.affix, fake: cur.fake, ident: cur.ident, sellerName: d.name }} id={cur.id} />
                {/* 第五轮：详情栏下半不留空——摊主的话、行情、掌眼、还价的把握（原来只在悬停说明里，手机上看不到） */}
                <ul className="stl-tips">
                  <li className="say"><b>{d.name}</b>「{lineNow ?? inf.shout}」</li>
                  <li><em>行情</em>万宝楼约 {fmtStone(cur.ref)} 灵石——{cur.price > cur.ref * 1.1 ? '开价偏高，可以还一还。' : cur.price < cur.ref * 0.92 ? '比行情便宜，可以下手。' : '和行情差不多。'}</li>
                  <li><em>掌眼</em>{cur.fake && cur.ident ? '看穿了：这是假货。' : cur.probed ? '掌过眼了，没看出毛病。' : '耗少许法力以神识辨真伪；地摊上偶有染色假丹、残缺伪简。'}</li>
                  <li><em>还价</em>{cur.hag === 'ok' ? '已让过一次价。' : cur.hag === 'fail' ? '还价砸了，这件今天不卖你。' : `每件只能还一次，把握约 ${Math.round(S.hagChance(d) * 100)}%。`}</li>
                </ul>
              </div>
              <div className="stl-deal">
                <div className="stl-pricebox">
                  <span className="stl-pl">开价</span>
                  <PopNumber value={cur.price} className="stl-pv" />
                  {cur.hag === 'ok' && WAS_PRICE.has(wasKey(game, d, cur.key)) && <s className="stl-was">{fmtStone(WAS_PRICE.get(wasKey(game, d, cur.key))!)}</s>}
                  <Tooltip tip={<>万宝楼行情约 <b>{fmtStone(cur.ref)}</b> 灵石。<br />{cur.price > cur.ref * 1.1 ? '开价比行情高——这摊主心黑。' : cur.price < cur.ref * 0.92 ? '比行情便宜，可以下手。' : '和行情差不多。'}</>}>
                    <span className="stl-ref">行情 {fmtStone(cur.ref)}</span>
                  </Tooltip>
                </div>
                <div className="stl-acts">
                  <Btn kind="zhu" className="stl-buy" disabled={stones < cur.price || cur.hag === 'fail' || !!(cur.fake && cur.ident)} onClick={() => buy(cur)}>{cur.fake && cur.ident ? '假货' : cur.hag === 'fail' ? '不卖' : '购买'}</Btn>
                  <Tooltip tip={cur.hag ? '每件只能还一次价。' : <>还一次价：成了便宜一截，砸了他不高兴、这件今天不卖你。<br />把握约 <b>{Math.round(S.hagChance(d) * 100)}%</b>（好感、口才、性情、境界都有关系）</>}>
                    <span><Btn kind="line" disabled={!!cur.hag} onClick={() => haggle(cur)}>还价</Btn></span>
                  </Tooltip>
                  <Tooltip tip="耗少许法力，以神识掌眼看真伪（地摊上偶有染色假丹、残缺伪简）">
                    <span><Btn kind="line" disabled={cur.probed || !!(cur.fake && cur.ident)} onClick={() => probe(cur)}>{cur.probed ? '已掌眼' : '掌眼'}</Btn></span>
                  </Tooltip>
                </div>
                {stones < cur.price && <div className="stl-warn">还差 {fmtStone(cur.price - stones)} 灵石</div>}
              </div>
            </div>
          ) : tab === 'sell' && curB ? (
            <div className="stl-detail" key={'s' + (curB.uid ?? curB.id)}>
              <div className="stl-card lq-scroll"><ItemCard game={game} b={curB} id={curB.id} />
                <ul className="stl-tips">
                  <li className="say"><b>{d.name}</b>「{lineNow ?? '拿来我瞧瞧。'}」</li>
                  <li><em>出价</em>{d.name}身上还有 {fmtStone(Math.max(0, Math.floor(d.wealth)))} 灵石，收你的东西最多出到这个数。</li>
                </ul>
              </div>
              <div className="stl-deal">
                <div className="stl-pricebox"><span className="stl-pl">他出价</span><PopNumber value={S.offer(d, curB)} className="stl-pv" /></div>
                <div className="stl-acts"><Btn kind="zhu" className="stl-buy" disabled={S.offer(d, curB) > d.wealth} onClick={() => sell(curB)}>卖给他</Btn></div>
                {S.offer(d, curB) > d.wealth && <div className="stl-warn">他身上只剩 {fmtStone(Math.max(0, Math.floor(d.wealth)))} 灵石，收不起这件</div>}
              </div>
            </div>
          ) : (
            <div className="stl-detail stl-none"><p>{tab === 'buy' ? (goods.length ? '点一格看看。' : '摊子上已经空了。') : '挑一件你想卖的。'}</p><p className="stl-tips say"><b>{d.name}</b>「{lineNow ?? inf.shout}」</p></div>
          )}
        </aside>
      </div>

      {/* —— 底栏 */}
      <footer className="stl-foot">
        <span className="stl-money"><Stone /><PopNumber value={stones} /><small>灵石</small></span>
        <Tooltip tip="他收你的东西，最多出到他身上的灵石。"><span className="stl-purse">摊主身家 <b>{fmtStone(Math.max(0, Math.floor(d.wealth)))}</b></span></Tooltip>
        <Btn kind="jade" className="stl-swap" onClick={() => { click(); setTab(tab === 'buy' ? 'sell' : 'buy'); }}>{tab === 'buy' ? '卖东西给他' : '回到他的摊子'}</Btn>
      </footer>
      {stamp && <div className={'stl-stamp ' + stamp.tone} key={stamp.k}>{stamp.t}</div>}
      <InkToast msg={msg} tone="jade" className="stl-toast" />
    </LacquerModal>
  );
}
