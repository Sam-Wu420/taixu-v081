// v0.72 / v0.73 / v0.75：宗门大会战兵力条 + 阵前对峙态/势能优势系数 HUD
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import type { BattleOrder } from '../world/warformation';

const ORDERS: { id: BattleOrder; label: string }[] = [
  { id: 'charge', label: '全军冲阵' },
  { id: 'hold', label: '固守阵脚' },
  { id: 'protect', label: '护主防线' },
];

type StandoffSnap = NonNullable<ReturnType<Game['sectwar']['standoffHud']>>;
type EscortSnap = NonNullable<ReturnType<Game['sectwar']['escortHud']>>;

export function SectBattleHUD({ game }: { game: Game }) {
  const [on, setOn] = useState(false);
  const [stage, setStage] = useState<'muster' | 'march' | 'standoff' | 'clash'>('clash');
  const [order, setOrder] = useState<BattleOrder>('charge');
  const [standoff, setStandoff] = useState<StandoffSnap | null>(null);
  const [escort, setEscort] = useState<EscortSnap | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [clashHead, setClashHead] = useState({ title: '', m: 0, m0: 0, f: 0, f0: 0 });
  const title = useRef<HTMLDivElement>(null), ml = useRef<HTMLSpanElement>(null), fl = useRef<HTMLSpanElement>(null), bar = useRef<HTMLDivElement>(null), sub = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let was = false, lastMs = 0;
    const step = (forceNow = false) => {
      const now = performance.now();
      if (!forceNow && now - lastMs < 95) return;
      lastMs = now;
      let h: ReturnType<Game['sectwar']['hud']> = null;
      try { h = game.sectwar?.hud() ?? null; } catch { h = null; }
      if (!!h !== was) { was = !!h; setOn(was); }
      if (h) {
        setStandoff((prev) => (prev ? null : prev));
        setEscort((prev) => (prev ? null : prev));
        setStage((prev) => (prev === h!.stage ? prev : h!.stage));
        if (h.order) setOrder((prev) => (prev === h!.order ? prev : h!.order));
        setClashHead((prev) => (
          prev.title === h!.title && prev.m === h!.m && prev.f === h!.f && prev.m0 === h!.m0 && prev.f0 === h!.f0
            ? prev
            : { title: h!.title, m: h!.m, m0: h!.m0, f: h!.f, f0: h!.f0 }
        ));
        if (title.current && title.current.textContent !== h.title) title.current.textContent = h.title;
        const mTxt = `${h.mn} ${h.m}/${h.m0}${h.mForms ? ` [${h.mForms}阵·${h.mOuterField}兵]` : ''}`;
        if (ml.current && ml.current.textContent !== mTxt) ml.current.textContent = mTxt;
        const fTxt = `${h.fForms ? `[${h.fForms}阵·${h.fOuterField}兵] ` : ''}${h.f}/${h.f0} ${h.fn}`;
        if (fl.current && fl.current.textContent !== fTxt) fl.current.textContent = fTxt;
        const bW = `${Math.round((h.m / Math.max(1, h.m + h.f)) * 100)}%`;
        if (bar.current && bar.current.style.width !== bW) bar.current.style.width = bW;
        if (sub.current && sub.current.textContent !== h.sub) sub.current.textContent = h.sub;
        return;
      }
      let esc: EscortSnap | null = null;
      try { esc = game.sectwar?.escortHud?.() ?? null; } catch { esc = null; }
      setEscort((prev) => {
        if (!esc && !prev) return prev;
        if (
          esc && prev
          && esc.marchId === prev.marchId
          && Math.round(esc.progress * 100) === Math.round(prev.progress * 100)
          && esc.inAmbush === prev.inAmbush
          && esc.awayWarn === prev.awayWarn
          && esc.soldiers === prev.soldiers
        ) return prev;
        return esc;
      });
      let st: StandoffSnap | null = null;
      try { st = game.sectwar?.standoffHud() ?? null; } catch { st = null; }
      setStandoff((prev) => {
        if (!st && !prev) return prev;
        if (
          st && prev
          && st.warId === prev.warId
          && st.gauge === prev.gauge
          && st.advM === prev.advM
          && st.advF === prev.advF
          && st.clashReady === prev.clashReady
          && st.duelActive === prev.duelActive
          && st.duelWins === prev.duelWins
          && st.duelLosses === prev.duelLosses
        ) return prev;
        return st;
      });
    };
    step(true);
    const offFrame = game.onAfterFrame(() => step(false));
    const offUi = game.subscribe(() => step(true));
    return () => { offFrame(); offUi(); };
  }, [game]);

  if (on) {
    return (
      <div className={`sect-war-hud sect-battle-hud${collapsed ? ' is-collapsed' : ''}`}>
        <div className="sect-hud-head">
          <div className="sect-hud-title" ref={title}>{clashHead.title}</div>
          {collapsed && (
            <span className="sect-hud-pill-stat">我 {clashHead.m} : {clashHead.f} 敌</span>
          )}
          <button
            className="sect-hud-toggle"
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? '展开会战态势' : '收起省屏'}
          >
            {collapsed ? '展开' : '收起'}
          </button>
        </div>
        {!collapsed && (
          <>
            <div className="sect-hud-bar-row">
              <span className="sect-hud-side ours" ref={ml} />
              <div className="sect-hud-track">
                <div className="sect-hud-fill" ref={bar} />
              </div>
              <span className="sect-hud-side foe" ref={fl} />
            </div>
            <div className="sect-hud-sub" ref={sub} />
            <div className="sect-hud-acts">
              {ORDERS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`sect-hud-btn${order === o.id ? ' on' : ''}`}
                  onClick={() => { game.sectwar?.setBattleOrder?.(o.id); setOrder(o.id); }}
                >
                  {o.label}
                </button>
              ))}
              {stage === 'standoff' && (
                <button
                  type="button"
                  className="sect-hud-btn danger"
                  onClick={() => { const p = game.player; game.sectwar?.onPlayerAggressiveAtFront?.(p.x, p.y); }}
                >
                  提前抢攻
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const escortBanner = escort ? (
    <div className={`sect-war-hud sect-escort-hud${standoff ? ' under-standoff' : ''}${escort.inAmbush ? ' ambush' : escort.awayWarn ? ' warn' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sect-hud-head">
        <div className="sect-hud-title escort">
          {collapsed
            ? `护送 ${Math.round(escort.progress * 100)}% · ${escort.soldiers}人${escort.inAmbush ? ' ⚠伏击' : ''}`
            : `护送 · ${escort.sectName}${escort.kindLabel}（${escort.soldiers}人 · 丹${escort.pills} · 石${escort.stones}）`}
        </div>
        {!standoff && (
          <button
            className="sect-hud-toggle"
            type="button"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '展开' : '收起'}
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          <div className="sect-hud-bar-row">
            <div className="sect-hud-track slim">
              <div
                className={`sect-hud-fill ${escort.inAmbush ? 'ambush' : 'escort'}`}
                style={{ width: `${Math.round(escort.progress * 100)}%` }}
              />
            </div>
            <span className="sect-hud-pct">{Math.round(escort.progress * 100)}%</span>
          </div>
          <div className="sect-hud-sub">
            {escort.inAmbush ? '⚠ 敌修伏击拦路，斩尽伏兵即可继续护送' : escort.awayWarn ? '⚠ 已远离队列，速返车队身旁！' : '伴行至前线大营即结算战功与补给'}
          </div>
        </>
      )}
    </div>
  ) : null;

  if (!standoff) return escortBanner;
  const pct = Math.max(0, Math.min(100, standoff.gauge));
  return (
    <>
      <div className={`sect-war-hud sect-standoff-hud${standoff.clashReady ? ' ready' : ''}${collapsed ? ' is-collapsed' : ''}`}>
        <div className="sect-hud-head">
          <div className="sect-hud-title standoff">
            {collapsed
              ? `${standoff.myName}⚔${standoff.foeName} · 势${standoff.gauge}%`
              : `${standoff.title} · 【${standoff.roleTitle}】`}
          </div>
          <button
            className="sect-hud-toggle"
            type="button"
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? '展开' : '收起'}
          </button>
        </div>
        {!collapsed && (
          <>
            <div className="sect-hud-bar-row">
              <span className="sect-hud-side ours">
                {standoff.myName} ×{standoff.advM.toFixed(2)}
              </span>
              <div className="sect-hud-track">
                <div
                  className={`sect-hud-fill${standoff.clashReady ? ' gold' : ''}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="sect-hud-side foe">
                ×{standoff.advF.toFixed(2)} {standoff.foeName}
              </span>
            </div>
            <div className="sect-hud-sub">
              势能 {standoff.gauge}/100 · 斗将 {standoff.duelWins}胜/{standoff.duelLosses}负
              {standoff.duelActive ? ' · 【斗将中】' : standoff.clashReady ? ' · ✨ 可鸣鼓总攻！' : ' · 截粮/斗将可涨势能'}
            </div>
            <div className="sect-hud-acts">
              <button
                type="button"
                className="sect-hud-btn info"
                onClick={() => game.sectwar?.openStandoffMenuByWarId?.(standoff.warId)}
              >
                斗将 / 战策
              </button>
              <button
                type="button"
                className={`sect-hud-btn${standoff.clashReady ? ' gold' : ' danger'}`}
                onClick={() => game.sectwar?.triggerDecisiveClashFromHud?.(standoff.warId)}
              >
                {standoff.clashReady ? '🔥 鸣鼓总攻' : '破约强攻'}
              </button>
            </div>
          </>
        )}
      </div>
      {escortBanner}
    </>
  );
}
