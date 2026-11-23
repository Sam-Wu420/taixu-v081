// P11d 拍卖会的界面：一座拍卖厅——屏风前的展台上摆着当前拍品，台下坐着来竞价的真 NPC（立绘、名字、境界、来意），
// 有人举牌时号牌抬起、出不起的放下牌子变暗；拍卖师喊「一次、两次、三次」，铜锣一响、落槌盖「成交」。
// 左边拍品名录（落槌结果），右边竞价记录。动效只动 transform / opacity（见记忆 css-filter-animation-jank）。
// 收官 H0：外壳、匾额、角花、关闭、灵石、品阶签、提示条、席位说明卡改用界面底座 src/ui/kit（乌木漆底）。
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import type { LocDef } from '../data/world';
import { itemDef, TIER_NAMES } from '../data/items';
import { realmName } from '../data/realms';
import { cityTier, TIER_NAME } from '../data/market';
import { npcPortrait } from '../data/portraits';
import { PERS_NAME } from '../world/npc';
import * as C from '../world/cultivation';
import { audio } from '../world/audio';
import { needOf, niceUp, type AucHouse, type AucSeat, type AucResult } from '../world/auction';
import { ItemGlyph } from './ItemIcon';
import paperUrl from '../assets/wanbao/paper.webp';
import hallUrl from '../assets/auction/hall.webp';
import standUrl from '../assets/auction/stand.webp';
import gongUrl from '../assets/auction/gong.webp';
import { LacquerModal, InkToast, useInkToast, Tooltip, TIER_LIT as TIER_COLOR, fmtStone as fmt } from './kit';
import './auction.css';

const PADDLE = '甲乙丙丁戊己庚辛壬癸子丑';
const COUNT = ['', '一次', '两次', '三次'];
const WHY_CLS: Record<string, string> = { 破境: 'red', 续命: 'purple', 宗门: 'gold', 宿敌: 'foe', 豪客: 'ink', 淘宝: 'ink' };
const click = () => audio.sfx('click');
type Log = { id: number; t: string; k: 'sys' | 'npc' | 'me' | 'drop' | 'won' | 'lost' | 'pass' | 'scan' };
let logSeq = 0;

export function AuctionHall({ game, loc }: { game: Game; loc: LocDef }) {
  const A = game.auction, H = game.hero;
  const [h] = useState<AucHouse>(() => { const x = A.house(loc); x.came = true; return x; });
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [log, setLog] = useState<Log[]>(() => [{ id: ++logSeq, k: 'sys', t: h.lots.some((l) => l.done) ? '你回到座上。拍卖还在继续。' : '拍卖师敲响铜锣：「诸位道友，拍卖会正式开始！」' }]);
  const [count, setCount] = useState(0);
  const [raise, setRaise] = useState<{ id: string; n: number } | null>(null);
  const [stamp, setStamp] = useState<{ r: AucResult; n: number } | null>(null);
  const [intro, setIntro] = useState(2);
  const [msg, say] = useInkToast(2400);
  const busy = useRef(false);
  const money = C.bagCount(H, 'mat_lingshi');
  // 落槌那两秒，台上还是刚卖掉的那件（引擎已经换到下一件了）
  const lot = stamp ? stamp.r.lot : h.lots[h.cur], live = h.live, it = lot ? itemDef(lot.id) : null;
  const curIdx = stamp ? h.lots.indexOf(stamp.r.lot) : h.cur;
  const allDone = !stamp && (h.settled || !h.lots.some((l) => !l.done));
  const need = !stamp && lot && !lot.done ? needOf(lot, live) : 0;
  const push = (t: string, k: Log['k'] = 'sys') => setLog((x) => [...x.slice(-40), { id: ++logSeq, t, k }]);
  // 离席：你那口出价作废（关窗的动画、Esc 由底座的 LacquerModal 管）
  const beforeClose = () => { if (live.lead === 'me' && lot && !lot.done) { live.lead = null; live.price = lot.base; lot.price = lot.base; } };

  const bidLine = (s: AucSeat, p: number, shill?: boolean) => {
    const d = A.npc(s.id), P = fmt(p);
    if (shill) return `${s.name}不紧不慢地举牌：「${P}。」`;
    switch (d?.pers) {
      case 'arrogant': return `${s.name}冷笑一声，举牌：「${P}！」`;
      case 'ruthless': return `${s.name}面无表情，号牌一抬：${P}。`;
      case 'greedy': return `${s.name}犹豫片刻，咬牙加到 ${P}。`;
      case 'cautious': return `${s.name}小心翼翼地举牌：${P}。`;
      case 'aloof': return `${s.name}淡淡道：「${P}。」`;
      default: return `${s.name}举牌：「${P}。」`;
    }
  };
  const finish = (r: AucResult) => {
    setStamp({ r, n: Date.now() }); cnt.current = 0; setCount(0);
    audio.sfx(r.k === 'me' ? 'chime' : r.k === 'pass' ? 'click' : 'bell');
    for (const t of r.lines) push(t, r.k === 'me' ? 'won' : r.k === 'pass' ? 'pass' : 'lost');
    if (r.k === 'me') game.toast(`拍得 ${itemDef(r.lot.id).name}`, 'good');
    busy.current = true;
    window.setTimeout(() => {
      busy.current = false; setStamp(null); intr.current = 2; setIntro(2); setRaise(null); nextAt.current = performance.now() + 900;
      const nx = h.lots[h.cur];
      if (nx && !nx.done) push(`下一件拍品：${itemDef(nx.id).name}${nx.top ? '（压轴）' : ''}，底价 ${fmt(nx.base)} 灵石。`);
      else push('拍卖师收起木槌：「本场拍卖到此为止，多谢诸位道友捧场。」');
      re();
    }, 2300);
    re();
  };
  // 拍卖师的节奏：每拍一下，场上有人举牌就重新数，没人就数「一次、两次、三次」，数到三落槌。
  // 定时器只起一个（父组件重绘不打断节奏），每次走到点调用最新的 step
  const cnt = useRef(0), intr = useRef(2), nextAt = useRef(performance.now() + 1200);
  const setCnt = (v: number) => { cnt.current = v; setCount(v); };
  const step = useRef<() => void>(() => {});
  step.current = () => {
    const now = performance.now();
    if (now < nextAt.current) return;
    const L = h.lots[h.cur], lv = h.live;
    nextAt.current = now + (lv.meOut ? 420 : intr.current > 0 ? 1100 : 1250);
    if (busy.current || !L || L.done || h.settled) return;
    if (intr.current > 0) { intr.current--; setIntro(intr.current); return; }
    const keen = lv.lead === null ? 0.85 : lv.lead === 'me' ? 0.8 : 0.66;
    if (Math.random() < keen) {
      const e = A.npcAct(h);
      if (e.k === 'drop' || e.k === 'bid') for (const id of e.drops) { const s = A.seat(h, id); if (s && s.bid[h.cur]) push(`${s.name}摇了摇头，放下了号牌。`, 'drop'); }
      if (e.k === 'bid') { const s = A.seat(h, e.seat)!; push(bidLine(s, e.price, e.shill), 'npc'); setRaise({ id: e.seat, n: Date.now() }); setCnt(0); audio.sfx('click'); re(); return; }
    }
    if (cnt.current >= 2) { finish(A.hammer(h)); return; }
    if (cnt.current === 0 && lv.lead === null) push(`「${itemDef(L.id).name}，底价 ${fmt(L.base)}——可有道友出价？」`);
    setCnt(cnt.current + 1);
  };
  useEffect(() => { const iv = window.setInterval(() => step.current(), 90); return () => window.clearInterval(iv); }, []);

  const bid = (p: number) => {
    if (!lot || lot.done || busy.current) return;
    const err = A.playerBid(h, p);
    if (err) { say(err); return; }
    click(); setCnt(0); intr.current = 0; setIntro(0); nextAt.current = performance.now() + 1300; setRaise({ id: 'me', n: Date.now() });
    push(`你举起号牌：「${fmt(p)}。」`, 'me'); re();
  };
  const passLot = () => {
    if (!lot || lot.done || busy.current) return;
    click();
    if (live.lead === 'me') { live.lead = null; live.price = lot.base; lot.price = lot.base; }
    live.meOut = true; intr.current = 0; setIntro(0); push('你收起号牌，不再跟价。', 'me'); re();
  };
  const scan = () => {
    if (!lot || lot.done) return;
    click();
    const r = game.jianghu.scanShill(lot);
    push(r.text.replace(/\n+/g, ''), 'scan'); re();
  };
  const leaveAll = () => {
    click();
    const rs = A.settleAll(h);
    for (const r of rs) for (const t of r.lines) push(t, r.k === 'pass' ? 'pass' : 'lost');
    push('你起身离席。余下的拍品在你走后一一落槌。');
    re();
  };

  const opts: [string, number][] = lot && !lot.done ? (live.lead === null ? [['按底价', lot.base], ['高两成', niceUp(lot.base * 1.2)], ['高五成', niceUp(lot.base * 1.5)]]
    : [['跟一手', need], ['加一成', Math.max(need, niceUp(live.price * 1.1))], ['加三成', Math.max(need, niceUp(live.price * 1.3))]]) : [];
  const leadSeat = live.lead && live.lead !== 'me' ? A.seat(h, live.lead) : undefined;
  const shillSeen = lot?.exposed && lot.shillId;
  const total = h.lots.filter((l) => l.done === 'won').reduce((a, l) => a + (l.paid ?? 0), 0);

  return (
    <LacquerModal title={cityTier(loc) >= 4 ? '大拍卖' : '拍卖会'} variant="lacquer" className="ah" width={1280} height={800} onClose={() => game.closeModal()} beforeClose={beforeClose} closeTip="离席（Esc）">
        <div className="lq-head ah-head">
          <span className="ah-loc">{loc.name} · {game.towns.auctionNote(loc)}<small>【{TIER_NAME[cityTier(loc)]}】还剩 {Math.max(1, 90 - Math.floor(game.day) % 90)} 日</small></span>
          <span className="ah-money"><b className="lq-stone" />{fmt(money)}<small>灵石</small></span>
        </div>
        <div className="ah-body">
          {/* —— 拍品名录 */}
          <aside className="ah-cat" style={{ backgroundImage: `url(${paperUrl})` }}>
            <div className="ah-sec">拍品名录<small>{h.lots.length} 件</small></div>
            <div className="ah-lots">
              {h.lots.map((l, i) => { const d = itemDef(l.id), on = i === curIdx && (!l.done || !!stamp); return (
                <div key={i} className={'ah-lot' + (on ? ' on' : '') + (l.done ? ' ' + l.done : '')} style={{ animationDelay: `${i * 40}ms` }}>
                  <ItemGlyph id={d.id} className="ah-ico" style={{ color: TIER_COLOR[d.tier] }} />
                  <span className="ah-lot-n"><b style={{ color: TIER_COLOR[d.tier] }}>{l.top ? <em>压轴</em> : null}{d.name}</b>
                    <small>{l.done === 'won' ? <span className="me">你以 {fmt(l.paid ?? 0)} 拍得</span> : l.done === 'lost' ? `归${l.who} · ${fmt(l.paid ?? l.price)}` : l.done === 'pass' ? '流拍' : on ? `现价 ${fmt(live.price)}` : `底价 ${fmt(l.base)}`}</small></span>
                  {l.done === 'won' && <i className="ah-lot-seal">得</i>}
                </div>); })}
            </div>
            {total > 0 && <div className="ah-total">本场你花了 <b>{fmt(total)}</b> 灵石</div>}
          </aside>

          {/* —— 展台 */}
          <section className="ah-stage">
            <div className="ah-backdrop" style={{ backgroundImage: `url(${hallUrl})` }} />
            <div className="ah-vignette" />
            <img className={'ah-gong' + (stamp ? ' ring' : '')} key={'g' + (stamp?.n ?? 0)} src={gongUrl} alt="" draggable={false} />
            {stamp && <i className="ah-ripple" key={'r' + stamp.n} />}
            {!allDone && lot && it ? <>
              <div className="ah-show" key={'s' + curIdx}>
                <div className="ah-halo" style={{ ['--tc' as string]: TIER_COLOR[it.tier] }} />
                <div className="ah-float"><ItemGlyph id={it.id} className="ah-ico big" style={{ color: TIER_COLOR[it.tier] }} px={128} /></div>
                <img className="ah-stand" src={standUrl} alt="" draggable={false} />
              </div>
              <div className="ah-card" key={'c' + curIdx}>
                <div className="ah-name" style={{ color: TIER_COLOR[it.tier] }}>{lot.top && <em className="ah-top">压轴</em>}{it.name}{lot.age ? <small>　{lot.age}年</small> : null}</div>
                <div className="ah-tags"><em className={'lq-tier t' + it.tier}>{TIER_NAMES[it.tier]}</em>{lot.fromName && <span>寄拍：{lot.fromName}</span>}<span>第 {curIdx + 1} / {h.lots.length} 件</span></div>
                <p className="ah-desc">{it.desc}</p>
              </div>
              <div className="ah-board">
                <div className="ah-base"><span>底价</span><b>{fmt(lot.base)}</b></div>
                {stamp ? <div className="ah-now"><span>{stamp.r.k === 'pass' ? '流拍' : '成交'}</span><b className="ah-price"><i className="lq-stone" />{fmt(stamp.r.price || stamp.r.lot.paid || stamp.r.lot.base)}</b>
                  <small>{stamp.r.k === 'me' ? <span className="me">归你</span> : stamp.r.k === 'pass' ? '无人出价' : <>归 <b>{stamp.r.lot.who}</b></>}</small></div>
                : <div className="ah-now"><span>{live.lead ? '当前' : '起拍'}</span><b key={live.price + ':' + live.n} className="ah-price"><i className="lq-stone" />{fmt(live.lead ? live.price : lot.base)}</b>
                  <small>{live.lead === 'me' ? <span className="me">你领先</span> : leadSeat ? <>领先：<b>{leadSeat.name}</b>（{PADDLE[h.seats.indexOf(leadSeat)]}号）</> : '尚无人举牌'}</small></div>}
                <div className="ah-count">{[1, 2, 3].map((i) => <i key={i} className={count >= i || stamp ? 'on' : ''}>{'一二三'[i - 1]}</i>)}</div>
                {count > 0 && !stamp && <div className="ah-call" key={'k' + count}>{COUNT[count]}！</div>}
              </div>
            </> : <div className="ah-end">
              <div className="ah-end-t">本场拍卖已毕</div>
              {h.lots.map((l, i) => { const d = itemDef(l.id); return <div key={i} className="ah-end-r" style={{ animationDelay: `${i * 60}ms` }}><ItemGlyph id={d.id} className="ah-ico" style={{ color: TIER_COLOR[d.tier] }} /><b style={{ color: TIER_COLOR[d.tier] }}>{d.name}</b><span>{l.done === 'won' ? `你 · ${fmt(l.paid ?? 0)}` : l.done === 'lost' ? `${l.who} · ${fmt(l.paid ?? 0)}` : '流拍'}</span></div>; })}
            </div>}
            {stamp && <div className={'ah-hammer ' + stamp.r.k} key={'h' + stamp.n}>
              <svg className="ah-gavel" viewBox="0 0 120 120"><g><rect x="18" y="26" width="54" height="26" rx="6" fill="#5a2a14" stroke="#d8b465" strokeWidth="3" /><rect x="40" y="50" width="10" height="58" rx="4" fill="#3a1e10" stroke="#b8904a" strokeWidth="2" /><rect x="14" y="30" width="8" height="18" rx="2" fill="#d8b465" /><rect x="68" y="30" width="8" height="18" rx="2" fill="#d8b465" /></g></svg>
              <div className="ah-stamp">{stamp.r.k === 'pass' ? '流拍' : '成交'}</div>
              <div className="ah-stamp-who">{stamp.r.k === 'me' ? `你以 ${fmt(stamp.r.price)} 灵石拍得` : stamp.r.k === 'pass' ? '无人出价' : `归 ${stamp.r.lot.who}　${fmt(stamp.r.price || stamp.r.lot.paid || 0)} 灵石`}</div>
            </div>}
            {!allDone && lot && (!lot.done || stamp) && <div className="ah-ctrl">
              {live.meOut ? <span className="ah-out">你已不再跟价——看他们争吧。</span> : opts.map(([n, p]) => (
                <button key={n} className="ah-bid" disabled={p > money || live.lead === 'me' || !!stamp} onClick={() => bid(p)}><span>{n}</span><b>{fmt(p)}</b></button>
              ))}
              {!live.meOut && <button className="ah-ghost" disabled={!!stamp} onClick={passLot}>放弃此件</button>}
              <button className="ah-ghost" title="耗少许法力，以神识看看场中是谁在抬价（拍卖行常安排托）" disabled={H.mp < 0.05 || !!stamp} onClick={scan}>神识扫视全场</button>
              <button className="ah-ghost dim" title="余下的拍品不再看了，由场上诸位去争（你领先的那口作废）" onClick={leaveAll}>离席</button>
            </div>}
          </section>

          {/* —— 竞价记录 */}
          <aside className="ah-log" style={{ backgroundImage: `url(${paperUrl})` }}>
            <div className="ah-sec">竞价记录</div>
            <div className="ah-lines">
              {log.slice().reverse().map((l) => <p key={l.id} className={'ah-line ' + l.k}>{l.t}</p>)}
            </div>
          </aside>

          {/* —— 席位 */}
          <div className="ah-seats">
            {h.seats.length === 0 && <div className="ah-empty">今日场中冷清，没有几位道友来。</div>}
            {h.seats.map((s, i) => {
              const d = A.npc(s.id), out = !stamp && (live.out.includes(s.id) || (!!lot && !lot.done && A.limit(s, h.cur) < need && live.lead !== s.id)), lead = stamp ? stamp.r.lot.whoId === s.id : live.lead === s.id, up = raise?.id === s.id;
              const pic = d ? npcPortrait(d) : undefined, shill = shillSeen && lot?.shillId === s.id;
              // 席位说明：底座的 Tooltip（鼠标悬停、触屏长按都能出，贴屏幕边自己让开）
              const tip = d ? <>{s.name} · {realmName(d.realm, d.stage)} · {PERS_NAME[d.pers]}<br />{s.why === '破境' ? '卡在瓶颈，冲着破境丹来' : s.why === '续命' ? '寿元将尽，冲着延寿之物来' : s.pool ? '宗门长老，代宗门出价（同门凑了钱）' : s.why === '宿敌' ? '与你有仇' : s.why === '豪客' ? '身家丰厚，来看看' : '来淘合用的东西'}</> : null;
              return (
                <Tooltip key={s.id} tip={tip}>
                <div className={'ah-seat' + (out ? ' out' : '') + (lead ? ' lead' : '') + (shill ? ' shill' : '')} style={{ animationDelay: `${i * 45}ms` }}>
                  <div className={'ah-paddle' + (up ? ' up' : '')} key={up ? raise!.n : 'p'}><span>{PADDLE[i]}</span></div>
                  <div className="ah-face" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>{!pic && s.name.slice(0, 1)}</div>
                  <div className="ah-who"><b>{s.name}</b><small>{d ? realmName(d.realm, d.stage) : ''}</small></div>
                  <em className={'ah-why ' + WHY_CLS[s.why]}>{s.pool ? '代宗门' : s.why}</em>
                  {shill && <i className="ah-shill">托</i>}
                </div>
                </Tooltip>);
            })}
            <div className={'ah-seat me' + (live.lead === 'me' ? ' lead' : '')}>
              <div className={'ah-paddle' + (raise?.id === 'me' ? ' up' : '')} key={raise?.id === 'me' ? raise.n : 'pm'}><span>主</span></div>
              <div className="ah-face" style={{ backgroundImage: 'url(./art/hanli.webp)' }} />
              <div className="ah-who"><b>你</b><small>{realmName(H.realm, H.stage)}</small></div>
            </div>
          </div>
        </div>
        <InkToast msg={msg} tone="zhu" className="ah-msg" />
    </LacquerModal>
  );
}
