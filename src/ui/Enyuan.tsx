// 恩怨与江湖重做 · 第二批的界面（world/enyuan.ts）：
//   · 江湖传音：左上一个小玉简角标（有未读只亮一个数字，不整屏弹），点开是玉简面板——一条条消息、旁人的议论、能接的支线；
//   · 通缉榜：坊市 / 宗门里的「通缉榜」、报案后的「看看通缉榜」打开——木榜上贴着悬赏令，执法弟子、赏金客拿没拿到人一目了然；
//   · 顶栏：生死斗横幅、当地口碑小牌。
// 贴图（our-codex-image 生成）：玉简底板与边框、通缉榜木板、悬赏令底纸。图上不画字，字用游戏字体写。动效只动 transform / opacity。
import { useEffect, useReducer, useState } from 'react';
import type { Game } from '../world/game';
import type { Rumor } from '../world/worldstate';
import type { LocDef } from '../data/world';
import { realmName } from '../data/realms';
import { audio } from '../world/audio';
import { PH_NAME } from '../world/duobao';
import jadeBaseUrl from '../assets/feud/jade_base.webp';
import jadeFrameUrl from '../assets/feud/jade_frame.webp';
import boardUrl from '../assets/feud/board.webp';
import bountyUrl from '../assets/feud/bounty.webp';
import './enyuan.css';

/** 订阅 enyuan 的变化（新消息、开关面板）；另外每秒看一眼（口碑、生死斗） */
function useEy(game: Game, tick = 0) {
  const [, re] = useReducer((x: number) => x + 1, 0);
  useEffect(() => game.enyuan.sub(re), [game]);
  useEffect(() => { if (!tick) return; const id = window.setInterval(re, tick); return () => window.clearInterval(id); }, [tick]);
}
const when = (day: number) => `第${Math.floor(day / 360) + 1}年${Math.floor((day % 360) / 30) + 1}月`;

/** 左上：江湖传音的小玉简角标 */
export function ChuanyinBadge({ game }: { game: Game }) {
  useEy(game);
  const n = game.enyuan.unread();
  return (
    <button className={'cy-badge' + (n ? ' has' : '')} title={n ? `江湖传音（${n} 条新的）` : '江湖传音'} onPointerDown={(e) => e.stopPropagation()} onClick={() => { audio.sfx('click'); game.enyuan.openPanel(game.enyuan.panel === 'feed' ? null : 'feed'); }}>
      音{n > 0 && <i>{n > 99 ? '99+' : n}</i>}
    </button>
  );
}

/** 顶栏：生死斗横幅、当地口碑 */
export function EnyuanTop({ game }: { game: Game }) {
  useEy(game, 1000);
  const E = game.enyuan, du = E.S.duel, l = E.townHere();
  const k = l ? E.kbLine(l.id) : null;
  const db = game.duobao.banner();
  return (
    <>
      {du && <div className="ey-duel"><b>生死斗</b><span>{du.name}</span><small>赢了恩怨两清 · 输了赔三成灵石</small></div>}
      {db && <div className={'ey-db ph-' + db.ph}><b>夺宝局 · {PH_NAME[db.ph]}</b><span>{db.title}</span><small>{db.tip}</small>{db.gap > 0 ? <em className="on">空档 {db.gap} 息</em> : db.gap < 0 ? <em>空档 {-db.gap} 息后</em> : null}</div>}
      {l && k && k.cls && <div className={'ey-kb ' + k.cls} title={k.text}><b>{l.name}</b>口碑 · {k.tier}<small>{k.v > 0 ? '+' : ''}{k.v}</small></div>}
    </>
  );
}

/** 地点卡、城镇面板上的一行口碑 */
export function KoubeiLine({ game, loc }: { game: Game; loc: LocDef }) {
  if (!(loc.type === 'city' || loc.type === 'town' || loc.type === 'isle')) return null;
  const k = game.enyuan.kbLine(loc.id);
  return <div className={'ey-kb-line ' + k.cls}><b>本地口碑：{k.tier}</b>（{k.v > 0 ? '+' : ''}{k.v}）{k.text}</div>;
}

/** 面板层：江湖传音、通缉榜 */
export function EnyuanPanels({ game }: { game: Game }) {
  useEy(game);
  const p = game.enyuan.panel;
  useEffect(() => {
    if (!p) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); game.enyuan.openPanel(null); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [p, game]);
  if (p === 'feed') return <FeedPanel game={game} />;
  if (p === 'wanted') return <WantedPanel game={game} />;
  return null;
}

type Tab = 'all' | 'hook' | 'me' | 'amb';
function FeedPanel({ game }: { game: Game }) {
  const E = game.enyuan;
  const [tab, setTab] = useState<Tab>('all');
  useEffect(() => { E.readAll(); }, [E]);
  const all = E.feed();
  const list = all.filter((r) => (tab === 'all' ? true : tab === 'hook' ? !!r.hook : tab === 'amb' ? !!r.amb : !r.amb && /苏寒/.test(r.text)));
  const close = () => { audio.sfx('click'); E.openPanel(null); };
  const tabs: [Tab, string][] = [['all', '全部'], ['hook', '可接的事'], ['me', '说你的'], ['amb', '神识 · 传闻']];
  return (
    <div className="ey-mask" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cy-panel" style={{ backgroundImage: `url(${jadeBaseUrl})` }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="cy-frame" style={{ borderImageSource: `url(${jadeFrameUrl})` }} />
        <div className="cy-head"><b>江湖传音</b><small>你做的事会传开；求助、悬赏、组队从这里接</small><button className="cy-x" onClick={close}>×</button></div>
        <div className="cy-tabs">{tabs.map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { audio.sfx('click'); setTab(k); }}>{n}{k === 'hook' && all.some((r) => r.hook) ? <i>{all.filter((r) => r.hook).length}</i> : null}</button>)}</div>
        <div className="cy-list">
          {list.length === 0 && <div className="cy-empty">玉简里静悄悄的。江湖上的消息，会一条条传到这里。</div>}
          {list.map((r) => <FeedItem key={r.id} r={r} game={game} />)}
        </div>
      </div>
    </div>
  );
}
function FeedItem({ r, game }: { r: Rumor; game: Game }) {
  const E = game.enyuan, lab = E.hookLabel(r);
  return (
    <div className={'cy-item' + (r.amb ? ' amb' : '') + (r.hook ? ' hook' : '')}>
      <div className="cy-meta"><span className="cy-src">{r.srcName}</span><span>{when(r.day)}</span></div>
      <div className="cy-text">{r.text}</div>
      {r.talk?.map((t, i) => <div key={i} className="cy-talk">{t}</div>)}
      {lab && (E.hookLive(r) ? <button className="cy-go" onClick={() => { audio.sfx('click'); E.hookAct(r); }}>{lab}</button> : <span className="cy-gone">已了结</span>)}
    </div>
  );
}

function WantedPanel({ game }: { game: Game }) {
  const E = game.enyuan, S = E.S;
  const close = () => { audio.sfx('click'); E.openPanel(null); };
  const reps = [...S.reports].reverse();
  const can = E.reportable();
  const here = E.townHere();
  const ST: Record<string, [string, string]> = { open: ['缉拿中', 'open'], caught: ['已伏法', 'caught'], fled: ['在逃', 'fled'], dead: ['已身死', 'dead'] };
  return (
    <div className="ey-mask" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="eyw-panel" style={{ backgroundImage: `url(${boardUrl})` }} onPointerDown={(e) => e.stopPropagation()}>
        <div className="eyw-head"><b>通缉榜</b><small>报官后劫匪贴上来；执法弟子、赏金客去拿人，你也可以亲自去</small><button className="cy-x" onClick={close}>×</button></div>
        <div className="eyw-grid">
          {reps.length === 0 && <div className="eyw-empty">榜上空空。被人劫了，去坊市「报官」或宗门执法堂报案，劫匪就会贴到这里。</div>}
          {reps.map((r) => {
            const d = game.npcs.byId.get(r.npcId), [st, cls] = ST[r.status];
            return (
              <div key={r.id} className={'eyw-card ' + cls} style={{ backgroundImage: `url(${bountyUrl})` }}>
                <div className="eyw-t">通缉</div>
                <div className="eyw-name">{r.name}</div>
                <div className="eyw-realm">{realmName(r.realm, r.stage)}</div>
                <div className="eyw-crime">{r.npc ? r.npc.crime : '拦路劫掠'}</div>
                <div className="eyw-reward">赏 <b>{r.reward}</b> 灵石</div>
                <div className="eyw-from">{r.whereName}{r.at === 'sect' ? '执法堂' : '坊市'} · {when(r.day)}</div>
                {r.status === 'caught' && r.by && <div className="eyw-by">{r.by === '你' ? '你亲手拿下' : `${r.by}拿下`}{r.comp ? `，补偿 ${r.comp}` : ''}</div>}
                {r.status === 'open' && r.law && r.lawName && <div className="eyw-by">{r.lawName}正在追</div>}
                {r.status === 'open' && d?.alive && <button className="eyw-go" onClick={() => { audio.sfx('click'); game.setGuide(d.x, d.y, `通缉：${d.name}`); E.openPanel(null); }}>亲自缉拿</button>}
                <div className={'eyw-stamp ' + cls}>{st}</div>
              </div>
            );
          })}
        </div>
        {can.length > 0 && <div className="eyw-foot">还有 {can.length} 桩劫案没报：{can.map((r) => r.name).join('、')}{here ? <button onClick={() => { audio.sfx('click'); E.openPanel(null); game.openDialog(E.reportNode(here)); }}>就在{here.name}报官</button> : '（回坊市或宗门报案）'}</div>}
      </div>
    </div>
  );
}
