// r7 定格特写（world/impactfx.ts 的 cutIn）：终结一击出手那一瞬，一条斜切的宽幅画面从右边甩进来（拳头迎面 / 眼神 / 高空踩落），
// 上下黑边压进来、速度线从画面上刷过去，半秒后甩出左边——同时世界几乎停住，切出后接着打。
// 不是遮幕：只占屏幕中间一条，四周照样看得见战场；动效只动 transform / opacity（cutin.css），不碰滤镜、阴影、宽高。
// r7-fx3d：终结技全屏演出（impactfx.finisher）的界面那两样也在这里——
//   · 漫画集中线：黑白放射状的细线从屏幕四周往中心收（一层静态的锥形渐变，整层缩放 + 淡入淡出），零点四秒；
//   · 书法大字砸屏：毛笔字（--title-font）从大到小砸下来、墨点溅开，停一会儿淡掉（定格特写之后才出，不和特写图打架）。
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { CUT_SRC, type CutIn as Cut, type FinEv } from '../world/impactfx';
import './cutin.css';

/** 墨溅：几滴大小不一的墨点（位置、大小按字算好，固定的样子） */
const SPLAT: [number, number, number, number][] = [
  [-34, -12, 4.2, 0.02], [36, 15, 3.4, 0.05], [-22, 24, 2.4, 0.06], [28, -24, 2, 0.04], [-44, 6, 1.6, 0.08], [46, -4, 1.4, 0.07],
  [9, 30, 1.6, 0.09], [-7, -30, 1.3, 0.05], [21, 27, 1, 0.1], [-38, -22, 1, 0.09], [40, 23, 0.8, 0.11], [-48, 17, 0.7, 0.12],
];

export function CutIn({ game }: { game: Game }) {
  const I = game.combat?.brawl?.impact;
  const [cut, setCut] = useState<Cut | null>(I?.cut ?? null);
  const [lines, setLines] = useState<FinEv | null>(null);
  const [word, setWord] = useState<FinEv | null>(null);
  const seen = useRef(0);
  useEffect(() => {
    if (!I) return;
    // 三张特写先解码好：头一回切入时不在那一帧现解码（量过：头一回一寸崩那一帧 61 毫秒）
    for (const src of Object.values(CUT_SRC)) { const im = new Image(); im.decoding = 'async'; im.src = src; void im.decode?.().catch(() => {}); }
    const f = () => {
      setCut(I.cut ? { ...I.cut } : null);
      const ev = I.fin;
      if (ev && ev.id !== seen.current) {
        seen.current = ev.id;
        if (ev.kind === 'lines') setLines({ ...ev }); else setWord({ ...ev });
      }
    };
    I.listeners.add(f);
    return () => { I.listeners.delete(f); };
  }, [I]);
  // 集中线、大字：动画放完（animationend）就收——不按计时器，动画被放慢（录像）时也对得上
  const wide = cut?.img === 'eyes';
  return (
    <>
      {lines && <div key={'l' + lines.id} className="hs-fin-lines" aria-hidden><div className="hs-fin-lines-a" onAnimationEnd={() => setLines((q) => (q?.id === lines.id ? null : q))} /><div className="hs-fin-lines-b" /></div>}
      {cut && (
        <div key={cut.id} className={'hs-cut ' + cut.img} aria-hidden style={{ ['--hs-cut-dur' as string]: `${cut.dur}s` } as React.CSSProperties}>
          <div className="hs-cut-bar top" />
          <div className="hs-cut-bar bot" />
          <div className={'hs-cut-band' + (wide ? ' wide' : '')}>
            <img className="hs-cut-img" src={CUT_SRC[cut.img]} alt="" draggable={false} />
            <div className="hs-cut-lines" />
            <div className="hs-cut-edge l" /><div className="hs-cut-edge r" />
            {cut.line && <div className="hs-cut-name">{cut.line}</div>}
          </div>
        </div>
      )}
      {word && (
        <div key={'w' + word.id} className={'hs-fin-word n' + Math.min(3, [...word.word].length)} aria-hidden>
          <div className="hs-fin-splat">
            {SPLAT.map(([x, y, s, d], i) => <i key={i} style={{ left: `calc(50% + ${x}vh)`, top: `calc(50% + ${y}vh)`, width: `${s}vh`, height: `${s * (0.8 + (i % 3) * 0.12)}vh`, animationDelay: `${d}s` }} />)}
          </div>
          <div className="hs-fin-text" onAnimationEnd={() => setWord((q) => (q?.id === word.id ? null : q))}>{word.word}</div>
        </div>
      )}
    </>
  );
}
