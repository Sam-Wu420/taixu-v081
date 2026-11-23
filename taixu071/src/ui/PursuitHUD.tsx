import { effectiveFlightMount } from '../world/flightMount';
// 第十四步：追杀 HUD（顶部警示条 + 神识锁定条 + 屏幕边缘方位箭头）与遁光读数
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { ARTS } from '../data/arts';

export function PursuitHUD({ game }: { game: Game }) {
  const [on, setOn] = useState(false);
  const bar = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), dist = useRef<HTMLSpanElement>(null), state = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLDivElement>(null), title = useRef<HTMLSpanElement>(null), tips = useRef<HTMLDivElement>(null);
  const fly = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let was = false, tipSig = '', flySig = '', lastTitle = '', lastDist = '', lastState = '', lastFillW = '', lastFillCls = '', lastNear = false, lastArrow = '';
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const step = () => {
      const inf = game.pursuit?.info();
      // ---- 遁光读数
      const f = fly.current;
      if (f) {
        const p = game.player;
        if (p.flying && !touch) {
          const sp = Math.round(game.speed * game.combat.speedMul / 10);
          const k = game.boostKind, b = p.boosting;
          const sig = `${sp}|${b ? 1 : 0}|${k}`;
          if (sig !== flySig) {
            flySig = sig;
            const nm = b ? (k === 'thunder' ? '雷遁' : k === 'blood' ? '血光遁' : '催动遁光')
                         : (effectiveFlightMount(game.hero) ? '御器' : '凌空');
            f.style.display = 'flex';
            f.className = 'fly-hud' + (b ? ' boost ' + k : '');
            f.innerHTML = `<b>${nm}</b><span>遁速 ${sp} 丈/息</span>${b ? '' : '<i>Shift 催动遁光</i>'}`;
          }
        } else if (flySig !== 'off') {
          flySig = 'off';
          f.style.display = 'none';
        }
      }
      // ---- 追杀
      if (!!inf !== was) { was = !!inf; setOn(was); }
      if (!inf) return;
      const tStr = `${inf.faction} · ${inf.name}（${inf.rank}）${inf.foes > 1 ? ` 等 ${inf.foes} 人` : ''}${inf.wave ? ` · 第 ${inf.wave + 1} 轮截杀` : ''}${inf.noFly ? ' · 禁空中' : ''}`;
      if (title.current && tStr !== lastTitle) { lastTitle = tStr; title.current.textContent = tStr; }
      const dStr = `相距 ${Math.round(inf.dist / 10)} 丈`;
      if (dist.current && dStr !== lastDist) { lastDist = dStr; dist.current.textContent = dStr; }
      const locked = inf.dist < inf.lockR && !inf.lost;
      const sStr = inf.lost ? '对方失去了你的踪迹……' : inf.safe > 0.02 ? `对方不敢擅闯 ${Math.round(inf.safe * 100)}%` : locked ? '神识锁定中' : `正在摆脱 ${Math.round(inf.out * 100)}%`;
      if (state.current && sStr !== lastState) { lastState = sStr; state.current.textContent = sStr; }
      if (fill.current) {
        const v = inf.lost ? 0.5 : inf.safe > 0.02 ? inf.safe : locked ? 1 - inf.dist / inf.lockR : inf.out;
        const wStr = `${Math.max(2, Math.min(100, v * 100)).toFixed(1)}%`;
        const cStr = 'pu-fill ' + (locked && inf.safe <= 0.02 ? 'lock' : 'free');
        if (wStr !== lastFillW) { lastFillW = wStr; fill.current.style.width = wStr; }
        if (cStr !== lastFillCls) { lastFillCls = cStr; fill.current.className = cStr; }
      }
      const near = inf.dist < 900;
      if (bar.current && near !== lastNear) { lastNear = near; bar.current.classList.toggle('near', near); }
      // 方位箭头：对方在屏幕外时贴边指示
      const a = arrow.current, r = game.renderer;
      if (a && r) {
        const v = r.viewRect(), W = window.innerWidth, H = window.innerHeight;
        const sx = (inf.x - v.left) / (v.right - v.left) * W, sy = (inf.y - 60 - v.top) / (v.bottom - v.top) * H;
        const inside = sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30;
        if (inside || inf.lost) {
          if (lastArrow !== 'hide') { lastArrow = 'hide'; a.style.display = 'none'; }
        } else {
          const cx = W / 2, cy = H / 2, ang = Math.atan2(sy - cy, sx - cx);
          const k = Math.min((W / 2 - 46) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - 46) / Math.abs(Math.sin(ang) || 1e-6));
          const aSig = `${Math.round(cx + Math.cos(ang) * k)},${Math.round(cy + Math.sin(ang) * k)},${ang.toFixed(2)},${locked ? 1 : 0}`;
          if (aSig !== lastArrow) {
            lastArrow = aSig;
            a.style.display = 'block';
            a.style.transform = `translate(${cx + Math.cos(ang) * k}px, ${cy + Math.sin(ang) * k}px) rotate(${ang}rad)`;
            a.style.opacity = String(locked ? 0.95 : 0.5);
          }
        }
      }
      // 对策提示（按身上实际有的手段）
      if (tips.current) {
        const h = game.hero, t: string[] = [];
        if (game.player.flying) t.push('Shift 催动遁光'); else if (game.canFlyNative || h.equip?.flight) t.push('F 御器飞遁');
        for (const id of ['xueyingdun', 'xuedun', 'tudun', 'luoyan']) if (h.arts.some((x) => x.id === id) && h.hotbar.includes(id)) t.push(`${h.hotbar.indexOf(id) + 1} ${ARTS[id].name}`);
        if (h.bag.some((b) => b.id === 'tal_escape')) t.push('遁地符');
        t.push(game.concealed ? '敛息中' : 'R 敛息');
        t.push('逃入宗门/坊市');
        const s = t.join('　·　');
        if (s !== tipSig) { tipSig = s; tips.current.textContent = s; }
      }
    };
    step();
    const offFrame = game.onAfterFrame(step);
    const offUi = game.subscribe(step);
    return () => { offFrame(); offUi(); };
  }, [game]);
  return (
    <>
      <div className="fly-hud" ref={fly} style={{ display: 'none' }} />
      {on && (
        <>
          <div className="pursuit" ref={bar}>
            <div className="pu-head"><em>追 杀</em><span ref={title} /><span className="pu-dist" ref={dist} /></div>
            <div className="pu-bar"><div className="pu-fill lock" ref={fill} /><span className="pu-state" ref={state} /></div>
            <div className="pu-tips" ref={tips} />
          </div>
          <div className="pu-arrow" ref={arrow}><i /></div>
        </>
      )}
    </>
  );
}
