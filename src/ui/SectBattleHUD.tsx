// v0.62：宗门大会战的兵力条（屏幕上方）——敌我各还剩多少人、后备多少、已斩多少
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';

export function SectBattleHUD({ game }: { game: Game }) {
  const [on, setOn] = useState(false);
  const title = useRef<HTMLDivElement>(null), ml = useRef<HTMLSpanElement>(null), fl = useRef<HTMLSpanElement>(null), bar = useRef<HTMLDivElement>(null), sub = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, was = false, n = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (n++ % 6) return;
      let h: ReturnType<Game['sectwar']['hud']> = null;
      try { h = game.sectwar?.hud() ?? null; } catch { h = null; }
      if (!!h !== was) { was = !!h; setOn(was); }
      if (!h) return;
      if (title.current) title.current.textContent = h.title;
      if (ml.current) ml.current.textContent = `${h.mn} ${h.m}/${h.m0}`;
      if (fl.current) fl.current.textContent = `${h.f}/${h.f0} ${h.fn}`;
      if (bar.current) bar.current.style.width = `${Math.round((h.m / Math.max(1, h.m + h.f)) * 100)}%`;
      if (sub.current) sub.current.textContent = h.sub;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  if (!on) return null;
  return (
    <div style={{ position: 'absolute', left: '50%', top: 56, transform: 'translateX(-50%)', zIndex: 14, pointerEvents: 'none', width: 'min(580px, 88vw)', padding: '6px 14px 8px', borderRadius: 6, background: 'linear-gradient(180deg, rgba(34,20,16,0.9), rgba(52,26,20,0.8))', border: '1px solid rgba(255,190,120,0.45)', boxShadow: '0 4px 18px rgba(0,0,0,0.4)', color: '#f6e6c8', fontSize: 13, textAlign: 'center' }}>
      <div ref={title} style={{ fontSize: 15, letterSpacing: 2, color: '#ffcf8a', fontWeight: 700 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span ref={ml} style={{ flex: '0 0 auto', color: '#bfe3ff', whiteSpace: 'nowrap' }} />
        <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'linear-gradient(90deg, #c0392b, #ff8a6a)', overflow: 'hidden' }}>
          <div ref={bar} style={{ height: '100%', width: '50%', background: 'linear-gradient(90deg, #3f8fd0, #8fd0ff)', transition: 'width .3s', boxShadow: '2px 0 0 #fff8' }} />
        </div>
        <span ref={fl} style={{ flex: '0 0 auto', color: '#ffb4a0', whiteSpace: 'nowrap' }} />
      </div>
      <div ref={sub} style={{ marginTop: 3, fontSize: 12, opacity: 0.85 }} />
    </div>
  );
}
