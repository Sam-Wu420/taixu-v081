// r8-p2 撼山客第二阶段的界面那一层（world/hsp2.ts 的 show）：觉醒大招里的书法大字（「爆」从左边砸进来、「碎」从右边）、
// 横贯全屏的白紫光线、横向速度线。整屏变红 / 压黑 / 变色在后期着色器里（不是遮幕）；这里只是几样快闪的界面元素。
// 动效只动 transform / opacity（p2show.css），不碰滤镜、阴影、宽高。动画放完（animationend）就收——录像放慢动画时也对得上。
import { useEffect, useState } from 'react';
import type { Game } from '../world/game';
import { hsp2Of, hsCine, type P2Ui } from '../world/hsp2';
import './p2show.css';

/** r17：全屏特写用的首领贴图（gfx/ywsTexData.ts 是几兆的内联图，用到时才动态加载，不进主包） */
let ywsSrc: Record<string, string> | null = null;
function ImgShow({ e, st, done }: { e: P2Ui; st: React.CSSProperties; done: () => void }) {
  const [src, setSrc] = useState<string | null>(ywsSrc?.[e.img ?? ''] ?? null);
  useEffect(() => { if (src || !e.img) return; let live = true; void import('../gfx/ywsTexData').then((m) => { ywsSrc = m.YWS_SRC; if (live) setSrc(m.YWS_SRC[e.img!] ?? null); }).catch(() => done()); return () => { live = false; }; }, [e.img]);
  return <div className={'p2-img' + (e.solid ? ' solid' : '')} style={st} aria-hidden><div className="p2-img-bg" onAnimationEnd={done} />{e.solid && <div className="p2-img-band" />}{src && <img className="p2-img-p" src={src} alt="" />}</div>;
}

/** 一组速度线（按事件 id 定，不取随机数）：纵向集中在中间、越靠中间越密越粗 */
function speedLines(id: number) {
  let s = (id * 2654435761) >>> 0;
  const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const out: { x: number; y: number; w: number; h: number; a: number; d: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const g = (r() + r() + r()) / 3 - 0.5, y = 50 + g * 70, mid = 1 - Math.min(1, Math.abs(g) * 2.2);
    out.push({ x: -10 + r() * 70, y, w: 18 + r() * 45 * (0.5 + mid), h: 1 + Math.round(r() * 5 * (0.3 + mid)), a: +(0.25 + 0.7 * mid * r()).toFixed(2), d: +(r() * 0.08).toFixed(3) });
  }
  return out;
}

export function P2Show({ game }: { game: Game }) {
  const [items, setItems] = useState<P2Ui[]>([]);
  useEffect(() => {
    const S = hsp2Of(game);
    let seen = S.ui.length ? S.ui[S.ui.length - 1].id : 0;
    const f = () => { const fresh = S.ui.filter((e) => e.id > seen); if (!fresh.length) return; seen = fresh[fresh.length - 1].id; setItems((q) => [...q, ...fresh].slice(-6)); };
    S.listeners.add(f);
    return () => { S.listeners.delete(f); };
  }, [game]);
  // r9：演大招时界面收起来（.game-root.hs-cine：任务列、技能栏、小地图、右下按钮圈、小牌淡出，血条留着；p2show.css，只动 opacity）
  useEffect(() => {
    let on = false;
    const iv = window.setInterval(() => {
      let now = false; try { now = hsCine(game); } catch { /* 不拖垮界面 */ }
      if (now === on) return; on = now;
      document.querySelector('.game-root')?.classList.toggle('hs-cine', on);
    }, 100);
    return () => { window.clearInterval(iv); document.querySelector('.game-root')?.classList.remove('hs-cine'); };
  }, [game]);
  const done = (id: number) => setItems((q) => q.filter((e) => e.id !== id));
  return (
    <>
      {items.map((e) => {
        const st = { ['--p2-dur' as string]: `${e.dur}s`, ['--p2-col' as string]: e.col ?? '255,255,255' } as React.CSSProperties;
        if (e.k === 'word') return <div key={e.id} className={'p2-word ' + (e.side ?? 'l')} style={st} aria-hidden><div className="p2-word-t" onAnimationEnd={() => done(e.id)}>{e.word}</div></div>;
        if (e.k === 'img') return <ImgShow key={e.id} e={e} st={st} done={() => done(e.id)} />;
        if (e.k === 'beam') return <div key={e.id} className="p2-beam" style={st} aria-hidden><div className="p2-beam-a" onAnimationEnd={() => done(e.id)} /><div className="p2-beam-b" /></div>;
        // r9：速度线——一条条粗细、长短、浓淡不一、两头尖的线，集中在画面中段（动作那一带），从右往左刷过去；不再是整屏等距的横线（像扫描线）
        return <div key={e.id} className="p2-lines" style={st} aria-hidden>{speedLines(e.id).map((l, i) => (
          <i key={i} className="p2-sl" onAnimationEnd={i === 0 ? () => done(e.id) : undefined}
            style={{ top: `${l.y}%`, left: `${l.x}%`, width: `${l.w}vw`, height: `${l.h}px`, ['--a' as string]: l.a, animationDelay: `${l.d}s` } as React.CSSProperties} />))}</div>;
      })}
    </>
  );
}
