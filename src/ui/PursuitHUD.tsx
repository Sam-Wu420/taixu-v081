// 第十四步：追杀 HUD（顶部警示条 + 神识锁定条 + 屏幕边缘方位箭头）与遁光读数
// 收官 H3：警示条排进顶栏堆叠（GameView 的 .hz-top），不再自己绝对定位；方位箭头用屏幕坐标，挂到 .game-root 上（portal）；
// 遁光读数拆成 FlyHud，放在快捷栏正上方。锁定条只动 scaleX，「逼近」的脉冲改成一层红光的 opacity（原来动 box-shadow）。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IS_TOUCH } from '../core/touch';
import { bindOf, keyLabel } from '../core/keymap';   // 收官 H3：键位从 keymap 取（原来写死 Shift / F / R）
import type { Game } from '../world/game';
import { ARTS } from '../data/arts';

/** 遁光读数（快捷栏正上方一行） */
export function FlyHud({ game }: { game: Game }) {
  const fly = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const f = fly.current;
      if (f) {
        const p = game.player;
        // 御剑/遁速读数：桌面端显示在左下法术栏上方；触屏（移动端）不显示
        const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
        if (p.flying && !touch) {
          const sp = Math.round(game.speed * game.combat.speedMul / 10);
          const k = game.boostKind, b = p.boosting;
          const nm = b ? (k === 'thunder' ? '雷遁' : k === 'blood' ? '血光遁' : '催动遁光')
                       : (game.hero.equip?.flight ? '御器' : game.canFlyNative ? '御剑' : '御剑（体验）');
          f.style.display = 'flex';
          f.className = 'fly-hud' + (b ? ' boost ' + k : '');
          f.innerHTML = `<b>${nm}</b><span>遁速 ${sp} 丈/息</span>${b ? '' : `<i>${IS_TOUCH ? '点「疾」' : keyLabel(bindOf('run'))} 催动遁光</i>`}`;
        } else f.style.display = 'none';
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return <div className="fly-hud" ref={fly} style={{ display: 'none' }} />;
}

export function PursuitHUD({ game }: { game: Game }) {
  const [on, setOn] = useState(false);
  const bar = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null), dist = useRef<HTMLSpanElement>(null), state = useRef<HTMLSpanElement>(null);
  const arrow = useRef<HTMLDivElement>(null), title = useRef<HTMLSpanElement>(null), tips = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => { if (on && !root) setRoot(host.current?.closest('.game-root') ?? document.body); }, [on, root]);
  useEffect(() => {
    let raf = 0, was = false, tipSig = '';
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const inf = game.pursuit?.info();
      // ---- 追杀
      if (!!inf !== was) { was = !!inf; setOn(was); }
      if (!inf) return;
      if (title.current) title.current.textContent = `${inf.faction} · ${inf.name}（${inf.rank}）${inf.foes > 1 ? ` 等 ${inf.foes} 人` : ''}${inf.wave ? ` · 第 ${inf.wave + 1} 轮截杀` : ''}${inf.noFly ? ' · 禁空中' : ''}`;
      if (dist.current) dist.current.textContent = `相距 ${Math.round(inf.dist / 10)} 丈`;
      const locked = inf.dist < inf.lockR && !inf.lost;
      if (state.current) state.current.textContent = inf.lost ? '对方失去了你的踪迹……' : inf.safe > 0.02 ? `对方不敢擅闯 ${Math.round(inf.safe * 100)}%` : locked ? '神识锁定中' : `正在摆脱 ${Math.round(inf.out * 100)}%`;
      if (fill.current) {
        const v = inf.lost ? 0.5 : inf.safe > 0.02 ? inf.safe : locked ? 1 - inf.dist / inf.lockR : inf.out;
        fill.current.style.transform = `scaleX(${Math.max(0.02, Math.min(1, v)).toFixed(3)})`;
        fill.current.className = 'pu-fill ' + (locked && inf.safe <= 0.02 ? 'lock' : 'free');
      }
      if (bar.current) bar.current.classList.toggle('near', inf.dist < 900);
      // 方位箭头：对方在屏幕外时贴边指示
      const a = arrow.current, r = game.renderer;
      if (a && r) {
        const v = r.viewRect(), W = window.innerWidth, H = window.innerHeight;
        const sx = (inf.x - v.left) / (v.right - v.left) * W, sy = (inf.y - 60 - v.top) / (v.bottom - v.top) * H;
        const inside = sx > 30 && sx < W - 30 && sy > 30 && sy < H - 30;
        if (inside || inf.lost) a.style.display = 'none';
        else {
          const cx = W / 2, cy = H / 2, ang = Math.atan2(sy - cy, sx - cx);
          const k = Math.min((W / 2 - 46) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - 46) / Math.abs(Math.sin(ang) || 1e-6));
          a.style.display = 'block';
          a.style.transform = `translate(${cx + Math.cos(ang) * k}px, ${cy + Math.sin(ang) * k}px) rotate(${ang}rad)`;
          a.style.opacity = String(locked ? 0.95 : 0.5);
        }
      }
      // 对策提示（按身上实际有的手段）
      if (tips.current) {
        const h = game.hero, t: string[] = [];
        if (game.player.flying) t.push(`${keyLabel(bindOf('run'))} 催动遁光`); else if (game.canFlyNative || h.equip?.flight) t.push(`${keyLabel(bindOf('fly'))} 御器飞遁`);
        for (const id of ['xueyingdun', 'xuedun', 'tudun', 'luoyan']) if (h.arts.some((x) => x.id === id) && h.hotbar.includes(id)) t.push(`${keyLabel(bindOf('slot' + (h.hotbar.indexOf(id) + 1)))} ${ARTS[id].name}`);
        if (h.bag.some((b) => b.id === 'tal_escape')) t.push('遁地符');
        t.push(game.concealed ? '敛息中' : `${keyLabel(bindOf('conceal'))} 敛息`);
        t.push('逃入宗门/坊市');
        const s = t.join('　·　');
        if (s !== tipSig) { tipSig = s; tips.current.textContent = s; }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  if (!on) return null;
  return (
    <div className="pursuit" ref={(el) => { (bar as { current: HTMLDivElement | null }).current = el; (host as { current: HTMLDivElement | null }).current = el; }}>
      <i className="pu-glow" />
      <div className="pu-head"><em>追 杀</em><span ref={title} /><span className="pu-dist" ref={dist} /></div>
      <div className="pu-bar"><div className="pu-fill lock" ref={fill} /><span className="pu-state" ref={state} /></div>
      <div className="pu-tips" ref={tips} />
      {root && createPortal(<div className="pu-arrow" ref={arrow}><i /></div>, root)}
    </div>
  );
}
