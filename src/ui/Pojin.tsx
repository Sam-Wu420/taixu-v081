// v0.53：破禁之局——禁制阵盘上浮着若干阵眼节点，从「生门」起按五行相生（木→火→土→金→水→木）逐一点破。
// 点错遭反噬（气血受损），点到杀阵节点伤得更重；错满次数或时辰耗尽，这一局就破不成了。
// 阵道越高看得越清（杀阵节点现形、隐匿节点更少），元婴出窍时一切节点无所遁形。
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import type { Puzzle } from '../world/zhenfa';
import { WX_COLOR, WX_NAME, Wx } from '../data/zhenfa';
import { v53 } from '../gfx/v053Tex';
import * as C from '../world/cultivation';
import { audio } from '../world/audio';
import cornerUrl from '../assets/wanbao/corner.webp';   // 收官 H2：漆盘四角角花

const TAU = Math.PI * 2;

export function PojinPanel({ game, puzzle }: { game: Game; puzzle: Puzzle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  const [zhui, setZhui] = useState(false);
  const flash = useRef<{ k: number; t: number; bad: boolean } | null>(null);
  const P = puzzle;
  useEffect(() => {
    const cv = ref.current!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    // 收官 H2：手机横屏（矮屏）改成「阵盘在左、说明在右」，阵盘按高度取，不再缩成 170 像素的一小团
    const land = window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
    const S = land ? Math.min(520, window.innerHeight - 36, window.innerWidth * 0.48) : Math.min(520, window.innerWidth - 40, window.innerHeight - 250);
    cv.width = S * dpr; cv.height = S * dpr; cv.style.width = S + 'px'; cv.style.height = S + 'px';
    const g = cv.getContext('2d')!;
    let raf = 0, last = performance.now(), sig = '';
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      game.zhenfa.tickPuzzle(P, dt);
      const s2 = `${P.left | 0}|${P.done}|${P.step}|${P.mistakes}`; if (s2 !== sig) { sig = s2; force((x) => x + 1); }
      draw(g, cv.width, t / 1000, dpr);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P]);
  function nodeXY(W: number, k: number) { const n = P.nodes[k]; return { x: W / 2 + n.x * W * 0.34, y: W / 2 + n.y * W * 0.34 }; }
  function draw(g: CanvasRenderingContext2D, W: number, t: number, dpr: number) {
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#0d0f12'; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, TAU); g.fill();
    const board = v53('ui_board'), gj = v53('zf_gujin');
    g.save(); g.translate(W / 2, W / 2);
    if (gj) { g.save(); g.rotate(-t * 0.05); g.globalAlpha = 0.25; g.drawImage(gj, -W * 0.48, -W * 0.48, W * 0.96, W * 0.96); g.restore(); }
    if (board) { g.rotate(t * 0.03); g.globalAlpha = 0.9; g.drawImage(board, -W / 2, -W / 2, W, W); }
    else { g.strokeStyle = 'rgba(200,160,90,0.6)'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(0, 0, W * 0.46, 0, TAU); g.stroke(); }
    g.restore();
    // 节点之间的相生连线（已破的亮）
    g.save(); g.globalCompositeOperation = 'lighter';
    const R = W * 0.072;
    P.nodes.forEach((n, k) => {
      const { x, y } = nodeXY(W, k);
      const key = n.broken ? 'ui_node_broken' : n.veiled ? 'ui_node_broken' : n.w === 'trap' ? 'ui_node_trap' : 'ui_node_' + n.w;
      const im = v53(key);
      const bob = Math.sin(t * 2 + k) * 2 * dpr;
      const fl = flash.current && flash.current.k === k ? Math.max(0, 1 - (t - flash.current.t) / 0.5) : 0;
      g.globalAlpha = n.broken ? 0.45 : 1;
      if (im) g.drawImage(im, x - R, y - R + bob, R * 2, R * 2);
      else { g.fillStyle = n.veiled ? '#777' : n.w === 'trap' ? '#c33' : WX_COLOR[n.w as Wx]; g.beginPath(); g.arc(x, y + bob, R * 0.7, 0, TAU); g.fill(); }
      if (n.veiled && !n.broken) { g.globalAlpha = 0.9; g.fillStyle = '#e8dcc0'; g.font = `bold ${R * 0.9}px "Noto Serif SC", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('？', x, y + bob); }
      if (!n.veiled && !n.broken && n.w !== 'trap') { g.globalAlpha = 0.85; g.fillStyle = '#fff6e0'; g.font = `bold ${R * 0.55}px "Noto Serif SC", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(WX_NAME[n.w as Wx], x, y + R * 1.25 + bob); }
      if (P.step === 0 && k === P.start && !P.done) { g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); g.strokeStyle = '#ffe6a0'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(x, y + bob, R * 1.15, 0, TAU); g.stroke(); g.fillStyle = '#ffe6a0'; g.font = `${R * 0.45}px "Noto Serif SC", serif`; g.fillText('生门', x, y - R * 1.35 + bob); }
      if (fl > 0) { g.globalAlpha = fl; g.strokeStyle = flash.current!.bad ? '#ff5040' : '#fff0c0'; g.lineWidth = 6 * dpr; g.beginPath(); g.arc(x, y + bob, R * (1.1 + (1 - fl) * 0.6), 0, TAU); g.stroke(); }
    });
    g.restore();
    // 阵心：下一处该破的五行
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
    const nx = P.done ? (P.ok ? '破' : '合') : P.step === 0 ? '生' : WX_NAME[P.next!];
    g.fillStyle = P.done ? (P.ok ? '#ffe6a0' : '#ff7a60') : P.step === 0 ? '#ffe6a0' : WX_COLOR[P.next!];
    g.font = `bold ${W * 0.11}px "Ma Shan Zheng", "Noto Serif SC", serif`;
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 8 * dpr;
    g.fillText(nx, W / 2, W / 2);
    g.restore();
  }
  const click = (e: React.PointerEvent) => {
    if (P.done) return;
    const cv = ref.current!, rc = cv.getBoundingClientRect();
    const W = cv.width, px = (e.clientX - rc.left) / rc.width * W, py = (e.clientY - rc.top) / rc.height * W;
    let best = -1, bd = W * 0.09;
    P.nodes.forEach((_, k) => { const { x, y } = nodeXY(W, k); const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = k; } });
    if (best < 0) return;
    const r = game.zhenfa.pick(P, best, zhui);
    if (zhui) setZhui(false);
    flash.current = { k: best, t: performance.now() / 1000, bad: r === 'wrong' || r === 'trap' };
    if (r === 'wrong' || r === 'trap') game.juice(0.04, 0.3);
    force((x) => x + 1);
  };
  const finish = () => { audio.sfx('click'); game.closeModal(); P.onDone(P.ok); };
  const giveUp = () => { P.done = true; P.ok = false; P.log = '你收回神识，退了出来。'; force((x) => x + 1); };
  const h = game.hero, zh = C.bagCount(h, 'zf_zhui');
  return (
    // 收官 H2：换成乌木漆盘——鎏金双线框、四角角花、匾额式题字；按钮用底座的朱漆 / 玉色按钮（旧类名 .ink-btn 照挂）
    <div className="modal-mask pojin-mask">
      <div className="pojin lq-lacquer">
        {['tl', 'tr', 'bl', 'br'].map((c) => <img key={c} className={'pj-corner ' + c} src={cornerUrl} alt="" draggable={false} />)}
        <canvas ref={ref} className="pj-board" onPointerDown={click} />
        <div className="pj-side">
        <div className="pj-head"><b>{P.title}</b><span>破禁之局 · 时辰 <em>{Math.ceil(P.left)}</em> 息 · 反噬 <em className={P.mistakes ? 'bad' : ''}>{P.mistakes}/{P.maxMistakes}</em> · 阵眼 <em>{P.step}/{P.need}</em></span></div>
        <div className="pj-log">{P.log}</div>
        <div className="pj-legend">相生：<i style={{ color: WX_COLOR.mu }}>木</i>→<i style={{ color: WX_COLOR.huo }}>火</i>→<i style={{ color: WX_COLOR.tu }}>土</i>→<i style={{ color: WX_COLOR.jin }}>金</i>→<i style={{ color: WX_COLOR.shui }}>水</i>→<i style={{ color: WX_COLOR.mu }}>木</i>　「？」是隐匿的阵眼，{game.zhenfa.seeEyes ? '杀阵节点已现形（红色尖刺）' : '杀阵节点也藏在「？」里'}　气血 {Math.round(h.hp * 100)}%</div>
        <div className="pj-btns">
          {!P.done && <button className={'ink-btn lq-btn ' + (zhui ? 'lq-btn-jade jade' : 'lq-btn-line')} disabled={zh <= 0} onClick={() => setZhui((z) => !z)}>{zhui ? '选一处钉入……' : `破禁锥（${zh}）`}</button>}
          {!P.done && <button className="ink-btn lq-btn lq-btn-line" onClick={giveUp}>放弃</button>}
          {P.done && <button className={'ink-btn lq-btn ' + (P.ok ? 'lq-btn-zhu' : 'lq-btn-line')} onClick={finish}>{P.ok ? '禁制已破，继续' : '退出'}</button>}
        </div>
        </div>
      </div>
    </div>
  );
}
