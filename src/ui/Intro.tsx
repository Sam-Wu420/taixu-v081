// 收官 H4（甲）：开场字幕。暗下来的远山做底、外圈鎏金细框；中间一只泛着玉光的残卷；
// 字是竖排墨字，一列列从右往左落下（手机横屏这类矮屏改横排）。点一下快进一行，右下可跳过。
// 动效只动 transform / opacity；样式在 title.css。
import { useEffect, useState, type CSSProperties } from 'react';
import farUrl from '../assets/title/far.webp';
import cornerUrl from '../assets/wanbao/corner.webp';
import './title.css';

const LINES: { t: string; em?: boolean; place?: boolean }[] = [
  { t: '南荒 · 梁国 · 镜州白石镇', place: true },
  { t: '一个寻常山村少年，身负四属性伪灵根，资质平平。' },
  { t: '机缘巧合，他拾得一只神秘的残卷……', em: true },
  { t: '此去没有既定的命数，也没有写好的结局。' },
  { t: '仙途漫漫，皆由你自己书写。', em: true },
];

/** 残卷的剪影（几笔路径，不用贴图） */
function Bottle() {
  return (
    <svg viewBox="0 0 92 132" aria-hidden>
      <defs>
        <linearGradient id="ib-g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#bff5d8" /><stop offset="0.45" stopColor="#4fbf8c" /><stop offset="1" stopColor="#1d6a4c" /></linearGradient>
      </defs>
      <path d="M38 6h16v6l-3 3v14c0 4 6 7 12 13 9 9 15 21 15 37 0 27-14 45-32 45S14 106 14 79c0-16 6-28 15-37 6-6 12-9 12-13V15l-3-3z" fill="url(#ib-g)" stroke="#d8f8e6" strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M36 4h20v6H36z" fill="#8a6424" />
      <path d="M30 66c4-8 10-12 16-13" stroke="#f2fff8" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" fill="none" />
      <circle cx="46" cy="86" r="9" fill="none" stroke="#e8fff2" strokeOpacity="0.45" strokeWidth="1.4" />
    </svg>
  );
}

export function Intro({ onDone }: { onDone: () => void }) {
  const [n, setN] = useState(1);
  useEffect(() => {
    if (n < LINES.length) { const t = setTimeout(() => setN(n + 1), 2300); return () => clearTimeout(t); }
    const t = setTimeout(onDone, 3400);
    return () => clearTimeout(t);
  }, [n]);
  const advance = () => { if (n < LINES.length) setN(n + 1); else onDone(); };
  return (
    <div className="intro" onClick={advance}>
      <div className="intro-bg"><img src={farUrl} alt="" draggable={false} /></div>
      <div className="intro-frame tt-frame">{['tl', 'tr', 'bl', 'br'].map((c) => <img key={c} className={'tt-corner ' + c} src={cornerUrl} alt="" draggable={false} />)}</div>
      <div className="intro-stage">
        <div className="intro-bottle"><Bottle /></div>
        <div className="intro-lines">
          {LINES.slice(0, n).map((l, i) => <div key={i} className={'intro-line' + (l.em ? ' em' : '') + (l.place ? ' place' : '')} style={{ ['--i' as string]: i } as CSSProperties}>{l.t}</div>)}
        </div>
      </div>
      <div className="intro-foot">
        <div className="intro-dots">{LINES.map((_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</div>
        <span className="intro-tap">点按继续</span>
      </div>
      <button className="intro-skip" onClick={(e) => { e.stopPropagation(); onDone(); }}>跳过 ›</button>
    </div>
  );
}
