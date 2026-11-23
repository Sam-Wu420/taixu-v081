// P11 万宝楼的界面：寄售行（搜、筛、排序、买）、求购榜（交货、贴求购）、我的寄售（挂货、撤货、领钱）、行情（涨跌、账目）。
// 画风：宣纸底、乌木鎏金匾额、金玉祥云角花（贴图由 our-codex-image 生成，见 src/assets/wanbao）；动效只动 transform / opacity。
// 收官 H0：外壳、匾额、页签、按钮、格子、灵石、提示条、盖章改用界面底座 src/ui/kit（类名 lq-），万宝楼自己的版面类名改 wbl-（原来的全局 .wb-* 和 wanbao 模组撞名）。
import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../world/game';
import type { LocDef } from '../data/world';
import { itemDef, ITEM_LIST, TIER_NAMES, type ItemDef } from '../data/items';
import * as C from '../world/cultivation';
import { audio } from '../world/audio';
import { WANBAO, WB_ZONE_NAME, wbZoneOf, tradable, type WbListing, type WbOrder } from '../world/wanbao';
import { ItemGlyph } from './ItemIcon';
import { MAP_NAME } from '../data/world';
import { statText } from '../data/gear';   // 收官 D：寄售装备显示词条
import { LacquerModal, InkTabs, ItemCell, InkToast, useInkToast, Stamp, TIER_INK as TIER_COLOR, fmtStone as fmt } from './kit';
import './wanbao.css';

type Cat = 'all' | 'artifact' | 'weapon' | 'pill' | 'herb' | 'material' | 'yaodan' | 'talisman' | 'scroll';
const CATS: { k: Cat; name: string; seal: string }[] = [
  { k: 'all', name: '全部', seal: '全' }, { k: 'artifact', name: '法宝法器', seal: '器' }, { k: 'weapon', name: '兵器', seal: '兵' }, { k: 'pill', name: '丹药', seal: '丹' },
  { k: 'herb', name: '灵草', seal: '草' }, { k: 'material', name: '炼材', seal: '材' }, { k: 'yaodan', name: '妖丹', seal: '丹' },
  { k: 'talisman', name: '符箓', seal: '符' }, { k: 'scroll', name: '功法玉简', seal: '简' },
];
const catOf = (it: ItemDef): Cat => (it.id.startsWith('mat_yaodan') ? 'yaodan' : it.gear?.slot === 'weapon' ? 'weapon' : (it.type as Cat));   // 近战兵器单列一类
const WHY_CLS: Record<string, string> = { 破境: 'red', 续命: 'purple', 疗伤: 'green', 自用: 'ink', 炼器: 'ink', 收藏: 'ink' };
type Tab = 'market' | 'orders' | 'mine' | 'trend';
type SortK = 'name' | 'tier' | 'n' | 'left' | 'price' | 'cheap';
const click = () => audio.sfx('click');

/** 近十二个月成交均价的小折线 */
function Spark({ data, w = 64, h = 20, big }: { data: number[]; w?: number; h?: number; big?: boolean }) {
  if (data.length < 2) return <span className="wbl-spark-none">{big ? '尚无成交记录' : '—'}</span>;
  const lo = Math.min(...data), hi = Math.max(...data), r = hi - lo || 1;
  const pts = data.map((v, i) => [i / (data.length - 1) * w, h - 2 - (v - lo) / r * (h - 4)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg className={'wbl-spark' + (big ? ' big' : '')} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {big && <path d={d + ` L${w} ${h} L0 ${h} Z`} className="area" />}
      <path d={d} className={up ? 'up' : 'down'} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={big ? 3 : 2} className={up ? 'up' : 'down'} />
    </svg>
  );
}

export function WanbaoPanel({ game, loc }: { game: Game; loc: LocDef }) {
  const W = game.wanbao, h = game.hero, z = wbZoneOf(loc);
  const zoneName = WB_ZONE_NAME[z] ?? MAP_NAME[z as keyof typeof MAP_NAME] ?? z;
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [tab, setTab] = useState<Tab>('market');
  const [cat, setCat] = useState<Cat>('all');
  const [q, setQ] = useState(''); const [tier, setTier] = useState(-1);
  const [pmin, setPmin] = useState(''); const [pmax, setPmax] = useState('');
  const [afford, setAfford] = useState(false);
  const [sort, setSort] = useState<{ k: SortK; up: boolean }>({ k: 'price', up: true });
  const [sel, setSel] = useState<WbListing | null>(null);
  const [qty, setQty] = useState(1);
  const [stamp, setStamp] = useState(0);
  const [shake, setShake] = useState(0);
  const [msg, say] = useInkToast(2600);
  const money = C.bagCount(h, 'mat_lingshi');
  const S = W.S;

  // —— 寄售行
  const all = W.listingsIn(z);
  const counts = useMemo(() => { const c: Record<string, number> = { all: 0 }; for (const l of all) { const k = catOf(itemDef(l.item)); c[k] = (c[k] ?? 0) + 1; c.all++; } return c; }, [all.length, S.seq]);
  const rows = useMemo(() => {
    const lo = Number(pmin) || 0, hi = Number(pmax) || Infinity, ql = q.trim();
    const out = all.filter((l) => {
      const it = itemDef(l.item);
      if (cat !== 'all' && catOf(it) !== cat) return false;
      if (tier >= 0 && it.tier !== tier) return false;
      if (ql && !it.name.includes(ql)) return false;
      if (l.price < lo || l.price > hi) return false;
      if (afford && l.price > money) return false;
      return true;
    });
    const val = (l: WbListing): number | string => { const it = itemDef(l.item); switch (sort.k) { case 'name': return it.name; case 'tier': return it.tier; case 'n': return l.n; case 'left': return l.until; case 'cheap': return l.price / W.ref(z, l.item, l.age); default: return l.price; } };
    out.sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' ? x.localeCompare(y as string, 'zh') : (x as number) - (y as number); return sort.up ? r : -r; });
    return out;
  }, [all.length, S.seq, cat, tier, q, pmin, pmax, afford, sort, money]);
  const [shown, setShown] = useState(60);
  const listKey = `${cat}|${tier}|${q}|${pmin}|${pmax}|${afford}|${sort.k}|${sort.up}`;
  useEffect(() => setShown(60), [listKey]);
  const th = (k: SortK, label: string, cls = '') => (
    <button className={'wbl-th ' + cls + (sort.k === k ? ' on' : '')} onClick={() => { click(); setSort((s) => (s.k === k ? { k, up: !s.up } : { k, up: k !== 'tier' && k !== 'n' })); }}>
      {label}<i>{sort.k === k ? (sort.up ? '▲' : '▼') : '△'}</i>
    </button>
  );
  const buy = () => {
    if (!sel) return;
    const err = W.buy(sel.id, qty);
    if (err) { setShake((x) => x + 1); say(err); return; }
    audio.sfx('chime'); setStamp((x) => x + 1);
    say(`购得 ${itemDef(sel.item).name}${qty > 1 ? ' ×' + qty : ''}，付 ${fmt(sel.price * qty)} 灵石`);
    const left = W.S.listings.find((l) => l.id === sel.id);
    if (!left || left.n <= 0) window.setTimeout(() => setSel(null), 700); else setQty(1);
    re();
  };

  // —— 我的寄售
  const bag = h.bag.filter((b) => tradable(itemDef(b.id)) && b.n > 0 && !b.worn && !(b.fake && b.ident));   // 收官 D：装备也能挂了——一件一单，词条跟着走（wanbao.consign 的 piece）
  const [pick, setPick] = useState<number>(-1);
  const pb = pick >= 0 ? bag[pick] : null;
  const pRef = pb ? W.ref(z, pb.id, pb.age) : 0;
  const [cn, setCn] = useState(1); const [cp, setCp] = useState(0); const [cd, setCd] = useState(15);
  useEffect(() => { if (pb) { setCn(1); setCp(pRef); } }, [pick]);
  const consign = () => {
    if (!pb) return;
    const err = W.consign(pb.id, cn, cp, pb.age, cd, loc, pb);
    if (err) { setShake((x) => x + 1); say(err); return; }
    say(`${itemDef(pb.id).name}${cn > 1 ? ' ×' + cn : ''} 已挂上万宝楼`); setPick(-1); re();
  };
  const collect = () => { const r = W.collect(); if (r.stones || r.items) { audio.sfx('gather'); say(`领得 ${fmt(r.stones)} 灵石${r.items ? `、退回的货 ${r.items} 件` : ''}`); } re(); };
  const pending = S.payout > 0 || S.returned.length > 0;

  // —— 求购榜
  const orders = W.ordersIn(z).slice().sort((a, b) => b.price / W.ref(z, b.item) - a.price / W.ref(z, a.item));
  const [oq, setOq] = useState(''); const [on, setOn] = useState(1); const [op, setOp] = useState(0); const [od, setOd] = useState(30);
  const oItem = useMemo(() => ITEM_LIST.find((it) => tradable(it) && it.name === oq.trim()) ?? null, [oq]);
  useEffect(() => { if (oItem) setOp(W.ref(z, oItem.id)); }, [oItem?.id]);

  // —— 行情
  const movers = useMemo(() => Object.entries(S.idx).filter(([k]) => k.startsWith(z + '|')).map(([k, v]) => ({ id: k.slice(z.length + 1), v })).sort((a, b) => Math.abs(b.v - 1) - Math.abs(a.v - 1)).slice(0, 16), [S.seq, S.lastMonth]);

  const left = (l: { until: number }) => { const d = Math.max(0, l.until - game.day); return d >= 1 ? `${Math.ceil(d)} 日` : '将满'; };
  const vs = (l: WbListing) => { const r = l.price / W.ref(z, l.item, l.age) - 1; return Math.abs(r) < 0.03 ? <span className="wbl-vs even">平</span> : <span className={'wbl-vs ' + (r < 0 ? 'low' : 'high')}>{r < 0 ? '低' : '高'} {Math.round(Math.abs(r) * 100)}%</span>; };

  return (
    <LacquerModal title="万宝楼" variant="paper" className="wbl" onClose={() => game.closeModal()} closeTip="离开（Esc）">
        <div className="lq-head wbl-head">
          <span className="wbl-loc">{loc.name}分号 · {zoneName}价区</span>
          <span className="wbl-money"><b className="lq-stone" /><b className="lq-pop" key={money}>{fmt(money)}</b><small>灵石</small></span>
          {pending && <button className="wbl-collect" onClick={collect}>待领 {fmt(S.payout)} 灵石{S.returned.length ? ` · 货 ${S.returned.reduce((a, r) => a + r.n, 0)} 件` : ''}　领取</button>}
        </div>
        <InkTabs<Tab> value={tab} onChange={(k) => { click(); setTab(k); setSel(null); }} items={[{ k: 'market', label: '寄售行' }, { k: 'orders', label: '求购榜', badge: orders.length || undefined }, { k: 'mine', label: '我的寄售', badge: W.mine().length || undefined }, { k: 'trend', label: '行情' }]} />

        {tab === 'market' && <div className={'wbl-body' + (sel ? ' detail' : '')}>
          <aside className="wbl-cats">
            {CATS.map((c) => (
              <button key={c.k} className={cat === c.k ? 'on' : ''} onClick={() => { click(); setCat(c.k); }}>
                <span className="seal">{c.seal}</span>{c.name}<small>{counts[c.k] ?? 0}</small>
              </button>
            ))}
            <div className="wbl-cat-note">一价区一座楼：{zoneName}各大城的万宝楼看到的是同一批货。成交抽 {Math.round(W.fee * 100)}%。</div>
          </aside>
          <section className="wbl-main">
            <div className="wbl-search">
              <label className="wbl-q"><i>⌕</i><input value={q} placeholder="搜物品名，如「筑基丹」" onChange={(e) => setQ(e.target.value)} /></label>
              <select value={tier} onChange={(e) => setTier(Number(e.target.value))}><option value={-1}>品阶 · 不限</option>{TIER_NAMES.map((t, i) => <option key={i} value={i}>{t}</option>)}</select>
              <span className="wbl-range"><input value={pmin} placeholder="最低价" onChange={(e) => setPmin(e.target.value.replace(/\D/g, ''))} />～<input value={pmax} placeholder="最高价" onChange={(e) => setPmax(e.target.value.replace(/\D/g, ''))} /></span>
              <label className={'wbl-chk' + (afford ? ' on' : '')}><input type="checkbox" checked={afford} onChange={(e) => setAfford(e.target.checked)} />只看买得起</label>
              <span className="wbl-found">共 {rows.length} 单</span>
            </div>
            <div className="wbl-table">
              <div className="wbl-tr wbl-thead">{th('name', '物品', 'c-name')}{th('tier', '品阶', 'c-tier')}{th('n', '数量', 'c-n')}<span className="wbl-th c-seller">卖家</span>{th('left', '剩余', 'c-left')}{th('price', '单价', 'c-price')}{th('cheap', '比行情', 'c-vs')}</div>
              <div className="wbl-rows" key={listKey}>
                {rows.length === 0 && <div className="wbl-empty">楼里眼下没有合意的货。换个条件看看，或去求购榜贴一张求购。</div>}
                {rows.slice(0, shown).map((l, i) => { const it = itemDef(l.item); return (
                  <button key={l.id} className={'wbl-tr wbl-row' + (sel?.id === l.id ? ' on' : '') + (l.seller === 'hero' ? ' mine' : '')} style={{ animationDelay: `${Math.min(i, 18) * 22}ms` }} onClick={() => { click(); setSel(l); setQty(1); }}>
                    <span className="c-name"><ItemGlyph id={it.id} className="wbl-ico" style={{ color: TIER_COLOR[it.tier] }} /><b style={{ color: TIER_COLOR[it.tier] }}>{it.name}</b>{l.age ? <small>{l.age}年</small> : null}</span>
                    <span className="c-tier"><em className={'lq-tier t' + it.tier}>{TIER_NAMES[it.tier]}</em></span>
                    <span className="c-n">{l.n}</span>
                    <span className="c-seller">{l.sellerName}</span>
                    <span className="c-left">{left(l)}</span>
                    <span className="c-price"><b className="lq-stone sm" />{fmt(l.price)}</span>
                    <span className="c-vs">{vs(l)}</span>
                  </button>); })}
                {rows.length > shown && <button className="wbl-more" onClick={() => setShown((s) => s + 60)}>再看 {Math.min(60, rows.length - shown)} 单</button>}
              </div>
            </div>
          </section>
          <aside className={'wbl-detail' + (sel ? ' open' : '')}>
            {sel && (() => { const it = itemDef(sel.item), ref = W.ref(z, sel.item, sel.age), max = Math.max(1, Math.min(sel.n, Math.floor(money / sel.price))); return (
              <div className={'wbl-card' + (shake ? ' shake-' + (shake % 2) : '')} key={sel.id}>
                <button className="wbl-card-x" title="收起" onClick={() => { click(); setSel(null); }}>›</button>
                <div className="wbl-card-top"><ItemGlyph id={it.id} className="wbl-ico big" style={{ color: TIER_COLOR[it.tier] }} px={96} /><div><div className="wbl-card-name" style={{ color: TIER_COLOR[it.tier] }}>{it.name}{sel.age ? <small>　{sel.age}年</small> : null}</div><em className={'lq-tier t' + it.tier}>{TIER_NAMES[it.tier]}</em></div></div>
                <p className="wbl-card-desc">{it.desc}</p>
                <div className="wbl-kv"><span>卖家</span><b>{sel.sellerName}</b></div>
                <div className="wbl-kv"><span>本区行情</span><b><i className="lq-stone sm" />{fmt(ref)}</b>{vs(sel)}</div>
                <div className="wbl-kv"><span>挂单剩余</span><b>{sel.n} 件 · {left(sel)}</b></div>
                <div className="wbl-chart"><div className="wbl-chart-t">近十二月成交均价</div><Spark data={W.history(z, sel.item)} w={220} h={56} big /></div>
                {sel.seller !== 'hero' ? <>
                  <div className="wbl-qty"><button onClick={() => setQty((x) => Math.max(1, x - 1))}>－</button><input value={qty} onChange={(e) => setQty(Math.max(1, Math.min(sel.n, Number(e.target.value.replace(/\D/g, '')) || 1)))} /><button onClick={() => setQty((x) => Math.min(sel.n, x + 1))}>＋</button><button className="mx" onClick={() => setQty(max)}>最多</button></div>
                  <div className="wbl-total">合计 <b className="lq-stone" /><b>{fmt(sel.price * qty)}</b>{sel.price * qty > money && <small className="no">灵石不足</small>}</div>
                  <button className="lq-btn lq-btn-zhu wbl-buy" disabled={sel.price * qty > money} onClick={buy}>买下</button>
                </> : <div className="wbl-hint">这是你自己挂的货（到「我的寄售」里撤下）。</div>}
                <Stamp text="成交" k={stamp} />
              </div>); })()}
          </aside>
        </div>}

        {tab === 'orders' && <div className="wbl-body one">
          <section className="wbl-main">
            <div className="wbl-table">
              <div className="wbl-tr wbl-thead o"><span className="wbl-th c-name">求购物品</span><span className="wbl-th c-n">数量</span><span className="wbl-th c-price">出价</span><span className="wbl-th c-vs">比行情</span><span className="wbl-th c-seller">求购人</span><span className="wbl-th c-why">缘由</span><span className="wbl-th c-left">剩余</span><span className="wbl-th c-act" /></div>
              <div className="wbl-rows">
                {orders.length === 0 && <div className="wbl-empty">眼下没有人贴求购。</div>}
                {orders.map((o: WbOrder, i) => { const it = itemDef(o.item), have = C.bagCount(h, o.item), r = o.price / W.ref(z, o.item) - 1; return (
                  <div key={o.id} className={'wbl-tr wbl-row o' + (o.buyer === 'hero' ? ' mine' : '')} style={{ animationDelay: `${Math.min(i, 18) * 22}ms` }}>
                    <span className="c-name"><ItemGlyph id={it.id} className="wbl-ico" style={{ color: TIER_COLOR[it.tier] }} /><b style={{ color: TIER_COLOR[it.tier] }}>{it.name}</b></span>
                    <span className="c-n">{o.n}</span>
                    <span className="c-price" title={o.dep !== undefined ? `赊购：只押了定金 ${fmt(o.dep)}，交货先得定金，余款他日后按月还（进待领）` : undefined}><b className="lq-stone sm" />{fmt(o.price)}{o.dep !== undefined && <small className="dim">（赊·定金{fmt(o.dep)}）</small>}</span>
                    <span className="c-vs"><span className={'wbl-vs ' + (r > 0.03 ? 'low' : r < -0.03 ? 'high' : 'even')}>{r > 0.03 ? `高 ${Math.round(r * 100)}%` : r < -0.03 ? `低 ${Math.round(-r * 100)}%` : '平'}</span></span>
                    <span className="c-seller">{o.buyerName}</span>
                    <span className="c-why"><em className={'wbl-why ' + WHY_CLS[o.why]}>{o.why}</em></span>
                    <span className="c-left">{left(o)}</span>
                    <span className="c-act">{o.buyer === 'hero' ? <button className="lq-btn lq-btn-line" onClick={() => { W.unpost(o.id); say('已撤下，押金退回待领'); re(); }}>撤下</button>
                      : <button className="lq-btn lq-btn-jade" disabled={!have} title={have ? `袋里有 ${have} 件` : '袋里没有'} onClick={() => { const now = W.fillNow(o), owe = o.dep !== undefined ? o.price - o.dep : 0, e = W.fill(o.id, 1); if (e) { say(e); setShake((x) => x + 1); } else { say(owe > 0 ? `交货一件，先得定金 ${fmt(now)} 灵石，余款 ${fmt(owe)} 记在${o.buyerName}账上，按月还进待领` : `交货一件，得 ${fmt(now)} 灵石`); setStamp((x) => x + 1); } re(); }}>交货{have ? `（有${have}）` : ''}</button>}</span>
                  </div>); })}
              </div>
            </div>
            <div className="wbl-post">
              <span className="wbl-post-t">贴求购</span>
              <input list="wbl-items" value={oq} placeholder="物品名" onChange={(e) => setOq(e.target.value)} />
              <datalist id="wbl-items">{ITEM_LIST.filter(tradable).map((it) => <option key={it.id} value={it.name} />)}</datalist>
              <span>数量</span><input className="n" value={on} onChange={(e) => setOn(Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1))} />
              <span>单价</span><input className="n" value={op} onChange={(e) => setOp(Number(e.target.value.replace(/\D/g, '')) || 0)} />
              {[15, 30, 60].map((d) => <button key={d} className={'lq-btn lq-btn-pill' + (od === d ? ' on' : '')} onClick={() => setOd(d)}>{d}日</button>)}
              <button className="lq-btn lq-btn-jade" disabled={!oItem || op <= 0 || on * op > money} onClick={() => { const e = W.post(oItem!.id, on, op, od, loc); if (e) say(e); else { say(`已贴出求购：${oItem!.name} ×${on}，押 ${fmt(on * op)} 灵石`); setOq(''); } re(); }}>押 {fmt(on * op)} 贴出</button>
              {oItem && <small>行情 {fmt(W.ref(z, oItem.id))}</small>}
            </div>
          </section>
        </div>}

        {tab === 'mine' && <div className="wbl-body mine">
          <section className="wbl-bag">
            <div className="lq-sec wbl-sec">储物袋（可寄售的）</div>
            <div className="wbl-grid">
              {bag.length === 0 && <div className="wbl-empty">袋里没有能寄售的东西。</div>}
              {bag.map((b, i) => { const it = itemDef(b.id); return (
                <ItemCell key={b.id + ':' + (b.age ?? 0) + ':' + i} bg="paper" className="paper" id={it.id} n={b.n} tier={it.tier} age={b.age} on={pick === i} title={it.name} onClick={() => { click(); setPick(i); }} />); })}
            </div>
            {pb && <div className="wbl-consign">
              <div className="wbl-card-name" style={{ color: TIER_COLOR[itemDef(pb.id).tier] }}>{itemDef(pb.id).name}{pb.age ? <small>　{pb.age}年</small> : null}</div>
              {pb.affix?.length ? <div className="wbl-affix">{pb.affix.map((a, i) => <span key={i}>◆ {statText(a.k, a.v)}</span>)}</div> : null}
              <div className="wbl-kv"><span>本区行情</span><b><i className="lq-stone sm" />{fmt(pRef)}</b><Spark data={W.history(z, pb.id)} /></div>
              <div className="wbl-kv"><span>数量</span><input type="range" min={1} max={pb.n} value={cn} onChange={(e) => setCn(Number(e.target.value))} /><b>{cn} / {pb.n}</b></div>
              <div className="wbl-kv"><span>单价</span><input className="n" value={cp} onChange={(e) => setCp(Number(e.target.value.replace(/\D/g, '')) || 0)} />
                {[[0.8, '八折'], [0.9, '九折'], [1, '行情'], [1.2, '一倍二']].map(([k, n]) => <button key={n} className="lq-btn lq-btn-pill" onClick={() => setCp(Math.round(pRef * (k as number)))}>{n}</button>)}</div>
              <div className="wbl-kv"><span>挂多久</span>{[7, 15, 30].map((d) => <button key={d} className={'lq-btn lq-btn-pill' + (cd === d ? ' on' : '')} onClick={() => setCd(d)}>{d}日</button>)}</div>
              <div className="wbl-kv"><span>卖出后到手</span><b><i className="lq-stone sm" />{fmt(Math.round(cp * cn * (1 - W.fee)))}</b><small>（抽成 {Math.round(W.fee * 100)}%；低于行情卖得快，高了可能挂到期也没人要）</small></div>
              <button className="lq-btn lq-btn-zhu wbl-buy" disabled={cp <= 0} onClick={consign}>挂上万宝楼</button>
            </div>}
          </section>
          <section className="wbl-my">
            <div className="lq-sec wbl-sec">我挂的货</div>
            {W.mine().length === 0 && <div className="wbl-empty">还没有挂货。</div>}
            {W.mine().map((l) => { const it = itemDef(l.item); return (
              <div key={l.id} className="wbl-myrow"><ItemGlyph id={it.id} className="wbl-ico" style={{ color: TIER_COLOR[it.tier] }} /><b style={{ color: TIER_COLOR[it.tier] }}>{it.name}</b>{l.affix?.length ? <small className="wbl-affix in">{l.affix.map((a) => statText(a.k, a.v)).join('　')}</small> : null}<span>×{l.n}</span><span><i className="lq-stone sm" />{fmt(l.price)}</span>{vs(l)}<span className="dim">{left(l)}</span><button className="lq-btn lq-btn-line" onClick={() => { W.cancel(l.id); say('已撤下，货退回待领'); re(); }}>撤下</button></div>); })}
            {W.myOrders().length > 0 && <><div className="lq-sec wbl-sec">我贴的求购</div>{W.myOrders().map((o) => <div key={o.id} className="wbl-myrow"><ItemGlyph id={o.item} className="wbl-ico" /><b>{itemDef(o.item).name}</b><span>×{o.n}</span><span><i className="lq-stone sm" />{fmt(o.price)}</span><span className="dim">{left(o)}</span><button className="lq-btn lq-btn-line" onClick={() => { W.unpost(o.id); re(); }}>撤下</button></div>)}</>}
            <div className="lq-sec wbl-sec">近来成交</div>
            {S.log.length === 0 && <div className="wbl-empty">还没有成交。</div>}
            {S.log.slice(0, 10).map((x, i) => <div key={i} className="wbl-log"><span className="dim">第 {Math.floor(x.day / 360) + 1} 年 {Math.floor(x.day % 360 / 30) + 1} 月</span>{x.text}</div>)}
          </section>
        </div>}

        {tab === 'trend' && <div className="wbl-body one">
          <section className="wbl-main trend">
            <div className="wbl-ledger">
              <div><span>挂单</span><b>{all.length}</b></div><div><span>求购</span><b>{orders.length}</b></div>
              <div><span>累计成交（各地）</span><b>{fmt(S.ledger.trades)}</b></div><div><span>楼里抽成（各地）</span><b>{fmt(S.ledger.fee)}</b></div><div><span>滞销收购（各地）</span><b>{fmt(S.ledger.buyout)}</b></div>
            </div>
            <div className="lq-sec wbl-sec">{zoneName}价区 · 行情变动最大的</div>
            {movers.length === 0 && <div className="wbl-empty">行情每月结算一次。过上一两个月再来看。</div>}
            <div className="wbl-movers">
              {movers.map((m, i) => { const it = itemDef(m.id), up = m.v >= 1; return (
                <div key={m.id} className="wbl-mover" style={{ animationDelay: `${i * 30}ms` }}>
                  <ItemGlyph id={it.id} className="wbl-ico" style={{ color: TIER_COLOR[it.tier] }} /><b style={{ color: TIER_COLOR[it.tier] }}>{it.name}</b>
                  <span className={'wbl-pct ' + (up ? 'up' : 'down')}>{up ? '涨' : '跌'} {Math.round(Math.abs(m.v - 1) * 100)}%</span>
                  <span><i className="lq-stone sm" />{fmt(W.ref(z, m.id))}</span><Spark data={W.history(z, m.id)} />
                </div>); })}
            </div>
          </section>
        </div>}
        <InkToast msg={msg} />
    </LacquerModal>
  );
}
