// 收官 I（甲）：新手引导的画面——高亮框、暗幕、气泡、地上的光圈、屏幕边上的方向箭头、完成时盖的「成」。
// 内容（说什么、指哪里）全由 world/tutorial.ts 给；这里只管画。
//   · 指界面元素：四块暗幕围出一个亮框（四个鎏金角），旁边一个带箭头的气泡；要拖的东西另在落点上画一个脉动的圈。
//     暗幕、角、圈都只动 transform / opacity（每帧在 rAF 里写 transform，不碰 width / top），整层 pointer-events: none——被指的东西照常能点。
//   · 指世界里的点：地上一个光圈（按 hd2d 场景投影到屏幕），出了画面就在屏幕边上出一个箭头指过去。
//   · 层级：z-index 62——压在面板（50）、对话框（55）上面（储物袋那步要指面板里的格子），低于模组界面（70–80）。
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { Game } from '../world/game';
import type { CoachTarget, CoachView, UiPick } from '../world/tutorial';
import { audio } from '../world/audio';
import { hudRects } from '../core/hudzones';   // HUD 各区占着的矩形（气泡尽量不压它们）
import './coach.css';

type R = { x0: number; y0: number; x1: number; y1: number };
const M = 10;   // 气泡离屏幕边的最小距离
/** 气泡压住时让位的 HUD 小块 */
const YIELD_SEL = '.hud .toast, .hud .toast-more, .hud .qc-item, .hud .qc-more, .hud .ctx-item, .hud .buff-row, .hud .target-frame, .hud .lock-hud, .hud .mod-hud, .hud .region-banner';

/** 按选择器（逗号分隔都算）找第一个看得见的元素；has 要求文字里含这几个字 */
function findEl(p: UiPick): HTMLElement | null {
  let list: NodeListOf<HTMLElement>;
  try { list = document.querySelectorAll<HTMLElement>(p.sel); } catch { return null; }
  for (const el of list) {
    if (p.has && !(el.textContent ?? '').includes(p.has)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3 || r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) continue;
    if (el.closest('[aria-hidden="true"]')) continue;   // 收起的抽屉
    return el;
  }
  return null;
}
const rectOf = (el: HTMLElement): R => { const r = el.getBoundingClientRect(); return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; };

export function Coach({ game }: { game: Game }) {
  const T = game.tutorial;
  const view = useSyncExternalStore((f) => T.subscribe(f), () => T.getView(), () => T.getView());
  const [, force] = useState(0);
  const dims = useRef<(HTMLDivElement | null)[]>([]);
  const corners = useRef<(HTMLDivElement | null)[]>([]);
  const dropRef = useRef<HTMLDivElement>(null), ringRef = useRef<HTMLDivElement>(null), edgeRef = useRef<HTMLDivElement>(null);
  const bubRef = useRef<HTMLDivElement>(null), tailRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<CoachView | null>(view); viewRef.current = view;
  const pos = useRef({ x: -9999, y: -9999, key: '' });
  const [stamp, setStamp] = useState(0);
  const stampSeen = useRef(T.stampK);

  // 盖章：tutorial.stampK 变了就盖一次
  useEffect(() => T.subscribe(() => { if (T.stampK !== stampSeen.current) { stampSeen.current = T.stampK; setStamp(T.stampK); } }), [T]);
  // 收起 / 展开、跳过确认这些都由 tutorial 发通知；这里再刷一次保险
  useEffect(() => { const t = window.setInterval(() => force((x) => x + 1), 1000); return () => window.clearInterval(t); }, []);

  useEffect(() => {
    let raf = 0, yT = 0, yAny = false;
    // 第五轮：气泡出现时让位——压在气泡底下的 HUD 小块（消息、任务列、情境提示、增益行、模组小框）淡下去、不接点击，
    // 别和气泡叠成一团（竖屏上消息、任务列、地点卡、气泡曾经全叠在上半屏）；被指着的那块（和亮框相交的）不让。五分之一秒量一次。
    const yieldHud = (bub: R | null, keep: R | null) => {
      if (!bub && !yAny) return;   // 总审·性能：没有气泡、也没有谁正让着位——原来这种时候每帧都把整份名单查一遍
      const now = performance.now(); if (bub && now - yT < 200) return; yT = now; yAny = false;
      const hit = (a: R, q: DOMRect) => a.x0 < q.right && a.x1 > q.left && a.y0 < q.bottom && a.y1 > q.top;
      for (const el of document.querySelectorAll<HTMLElement>(YIELD_SEL)) {
        let on = false;
        if (bub) { const r = el.getBoundingClientRect(); on = r.width > 2 && hit(bub, r) && !(keep && hit(keep, r)); }
        if (el.classList.contains('coach-yield') !== on) el.classList.toggle('coach-yield', on);
        if (on) yAny = true;
      }
    };
    const show = (el: HTMLElement | null | undefined, on: boolean) => { if (el) el.style.opacity = on ? '1' : '0'; };
    const tf = (el: HTMLElement | null | undefined, s: string) => { if (el) el.style.transform = s; };
    // 第五轮性能：找被指的界面元素、量它的位置、量气泡大小都会逼浏览器当场排版（HUD 每帧都在变，原来每帧排一次，
    // 海上那几场一秒要花几十毫秒在这上面）。改成每 120 毫秒量一次，其间沿用；换了一步立刻重量。气泡本来就是缓动跟过去的，看不出差别
    const DOM_MS = 120;
    const dom = { t: -1e9, key: '' as string, rect: null as R | null, drop: null as R | null, bw: 0, bh: 0, cx: 0, cy: 0 };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const v = viewRef.current, W = window.innerWidth, H = window.innerHeight;
      let rect: R | null = null, pt: { x: number; y: number } | null = null, off: { x: number; y: number; a: number } | null = null, drop: R | null = null; let heroBox: R | null = null;
      const tg: CoachTarget = v && !v.quiet && !T.collapsed ? v.target : null;
      const now = performance.now(), dkey = (v?.key ?? '') + '|' + (tg?.kind ?? '') + '|' + W + 'x' + H;
      const fresh = now - dom.t >= DOM_MS || dom.key !== dkey;
      if (fresh) { dom.t = now; dom.key = dkey; }
      if (tg?.kind === 'ui') {
        if (fresh) {
          dom.rect = null; dom.drop = null;
          for (const p of tg.picks) { const el = findEl(p); if (el) { dom.rect = rectOf(el); break; } }
          if (tg.drop && dom.rect) { const el = findEl(tg.drop); if (el) dom.drop = rectOf(el); }
        }
        rect = dom.rect; drop = dom.drop;
      } else if (tg?.kind === 'screen') rect = tg.get();
      else if (tg?.kind === 'world') {
        const hd = game.renderer?.hd;
        if (hd) {
          if (fresh) { const cr = game.canvas?.getBoundingClientRect?.(); dom.cx = cr?.left ?? 0; dom.cy = cr?.top ?? 0; }
          const ox = dom.cx, oy = dom.cy;
          const g0 = hd.project(tg.x, tg.y, 0), x = g0.x + ox, y = g0.y + oy;
          // 总审：指着世界里一处（云门、摊位……）时气泡别盖住主角——主角在屏幕上的那一块记下来，下面挑位置时算进去
          { const h0 = hd.project(game.player.x, game.player.y, 0), hx = h0.x + ox, hy = h0.y + oy; if (Number.isFinite(hx) && Number.isFinite(hy)) heroBox = { x0: hx - 46, y0: hy - 150, x1: hx + 46, y1: hy + 24 }; }
          if (Number.isFinite(x) && Number.isFinite(y) && x > 30 && x < W - 30 && y > 60 && y < H - 30) pt = { x, y };
          else if (Number.isFinite(x) && Number.isFinite(y)) {
            // 出了画面：从屏幕中心朝它的方向，贴着屏幕边放一个箭头
            const cx = W / 2, cy = H / 2, dx = x - cx, dy = y - cy, k = Math.min((W / 2 - 46) / Math.abs(dx || 1e-6), (H / 2 - 56) / Math.abs(dy || 1e-6));
            off = { x: cx + dx * k, y: cy + dy * k, a: Math.atan2(dy, dx) };
          } else {
            const p = game.player, dx = tg.x - p.x, dy = tg.y - p.y, a = Math.atan2(dy, dx);   // 投影不出来（镜头背面）：按世界方向估一个
            off = { x: W / 2 + Math.cos(a) * (W / 2 - 46), y: H / 2 + Math.sin(a) * (H / 2 - 56), a };
          }
        }
      }
      // 暗幕：四块，围出亮框（每块是 1×1 的元素，用 transform 拉到要盖的大小）
      const dimOn = !!(v && v.dim && rect && !T.collapsed && !v.quiet);
      const P = 6;
      if (dimOn && rect) {
        const x0 = Math.max(0, rect.x0 - P), y0 = Math.max(0, rect.y0 - P), x1 = Math.min(W, rect.x1 + P), y1 = Math.min(H, rect.y1 + P);
        const box = [[0, 0, W, y0], [0, y1, W, H - y1], [0, y0, x0, y1 - y0], [x1, y0, W - x1, y1 - y0]];
        box.forEach(([x, y, w, h], i) => { const el = dims.current[i]; tf(el, `translate(${x}px, ${y}px) scale(${Math.max(0, w)}, ${Math.max(0, h)})`); show(el, true); });
      } else dims.current.forEach((el) => show(el, false));
      // 亮框：四个鎏金角
      if (rect) {
        const x0 = rect.x0 - P, y0 = rect.y0 - P, x1 = rect.x1 + P, y1 = rect.y1 + P;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, sx, sy], i) => { tf(corners.current[i], `translate(${x}px, ${y}px) scale(${sx}, ${sy})`); show(corners.current[i], true); });
      } else corners.current.forEach((el) => show(el, false));
      // 落点圈（拖到这里）
      if (drop) { tf(dropRef.current, `translate(${(drop.x0 + drop.x1) / 2}px, ${(drop.y0 + drop.y1) / 2}px)`); show(dropRef.current, true); } else show(dropRef.current, false);
      // 地上的光圈 / 边上的箭头
      if (pt) { tf(ringRef.current, `translate(${pt.x}px, ${pt.y}px)`); show(ringRef.current, true); } else show(ringRef.current, false);
      if (off) { tf(edgeRef.current, `translate(${off.x}px, ${off.y}px) rotate(${off.a}rad)`); show(edgeRef.current, true); } else show(edgeRef.current, false);

      // 气泡：贴着目标放（下面放不下放上面，再不行放旁边），出不了屏；位置平滑跟过去
      const b = bubRef.current; if (!b || !v || v.quiet || T.collapsed) { yieldHud(null, null); return; }
      if (fresh || !dom.bw) { dom.bw = b.offsetWidth; dom.bh = b.offsetHeight; }
      const bw = dom.bw, bh = dom.bh;
      let x: number, y: number, tail: { x: number; y: number; dir: 'up' | 'down' | 'left' | 'right' } | null = null;
      let anchor: R | null = rect ?? (pt ? { x0: pt.x - 40, y0: pt.y - 170, x1: pt.x + 40, y1: pt.y + 16 } : off ? { x0: off.x - 24, y0: off.y - 24, x1: off.x + 24, y1: off.y + 24 } : null);
      if (anchor && drop) anchor = { x0: Math.min(anchor.x0, drop.x0 - 26), y0: Math.min(anchor.y0, drop.y0 - 30), x1: Math.max(anchor.x1, drop.x1 + 26), y1: Math.max(anchor.y1, drop.y1 + 26) };   // 要拖的东西和落点都别挡
      const ov = (a: R, q: R) => Math.max(0, Math.min(a.x1, q.x1) - Math.max(a.x0, q.x0)) * Math.max(0, Math.min(a.y1, q.y1) - Math.max(a.y0, q.y0));
      // 第五轮：打斗中画面中间（主角和对手所在）留空——情境小课的气泡不放进这一块
      const mid: R | null = v.fight ? { x0: W * 0.22, y0: H * 0.16, x1: W * 0.78, y1: H * 0.84 } : null;
      if (v.place === 'side') {
        // 靠边：沿右侧、左侧两条竖边从上往下找，挑压 HUD 最少、离中间最远的那一格（电脑上通常落在右上小地图下方）
        let bs = Infinity; x = W - bw - M; y = 70;
        for (const sx of [W - bw - M, M]) for (let sy = 60; sy <= H - bh - M; sy += 16) {
          const box: R = { x0: sx, y0: sy, x1: sx + bw, y1: sy + bh };
          let sc = (sx === M ? 1500 : 0) + sy * 0.5 + (mid ? ov(box, mid) * 6 : 0);
          for (const h of hudRects) sc += ov(box, h) * (h.soft ? 0.3 : 3);
          if (sc < bs) { bs = sc; x = sx; y = sy; }
        }
      } else if (v.place === 'corner') { x = W < 760 ? (W - bw) / 2 : M + 6; y = H - bh - (W < 760 ? 60 : 70); }
      else if (v.place === 'top' || !anchor) {
        x = (W - bw) / 2; y = v.place === 'top' || game.renderer == null ? 70 : Math.max(70, H - bh - (W < 760 ? 170 : 210));
        if (v.place !== 'top' && T.touch) y = Math.min(H * 0.22, H - bh - M);
      } else {
        // 四个候选位置（下、上、右、左），各自先夹进屏幕，再按「压住目标 / 落点 / HUD 多少」打分，挑最少挡东西的
        const cx = (anchor.x0 + anchor.x1) / 2, cy = (anchor.y0 + anchor.y1) / 2, G = 16;
        const A = anchor;
        const cands: { x: number; y: number; tail: typeof tail }[] = [
          { x: cx - bw / 2, y: A.y1 + G, tail: { x: cx, y: A.y1 + 4, dir: 'up' } },
          { x: cx - bw / 2, y: A.y0 - G - bh, tail: { x: cx, y: A.y0 - 4, dir: 'down' } },
          { x: A.x1 + G, y: cy - bh / 2, tail: { x: A.x1 + 4, y: cy, dir: 'left' } },
          { x: A.x0 - G - bw, y: cy - bh / 2, tail: { x: A.x0 - 4, y: cy, dir: 'right' } },
        ];
        // 总审：手机上打斗中指着出招钮（「欺」「追」）时，四个贴着它的位置都会盖住别的出招钮——多给一个不带尖角的位置：屏幕上部居中
        if (T.touch && v.fight) cands.push({ x: (W - bw) / 2, y: Math.max(64, H * 0.2), tail: null });
        let best = cands[0], bs = Infinity;
        cands.forEach((c, i) => {
          const cx2 = Math.max(M, Math.min(W - bw - M, c.x)), cy2 = Math.max(M, Math.min(H - bh - M, c.y));
          const box: R = { x0: cx2, y0: cy2, x1: cx2 + bw, y1: cy2 + bh };
          let sc = i * 400 + (Math.abs(cx2 - c.x) + Math.abs(cy2 - c.y)) * 30 + ov(box, A) * 8 + (mid ? ov(box, mid) * 6 : 0);
          // 开着面板时 HUD 都被遮罩盖着，不用躲；只显示的块（消息、地名横幅）压上去它们会让位（yieldHud），只算一点点——
          // 第五轮：以前一视同仁，被追杀小课的气泡为了躲开一串消息跑到右上角，压住日期和小地图
          if (!T.panel) for (const h of hudRects) sc += ov(box, h) * (h.soft ? 0.12 : T.touch && v.fight ? 20 : 1);   // 手机上打斗中，能点的钮（出招、摇杆）最不能盖
          if (heroBox) sc += ov(box, heroBox) * 5;
          if (sc < bs) { bs = sc; best = c; }
        });
        x = best.x; y = best.y; tail = best.tail;
      }
      x = Math.max(M, Math.min(W - bw - M, x)); y = Math.max(M, Math.min(H - bh - M, y));
      const P0 = pos.current;
      if (P0.key !== v.key || P0.x < -999) { P0.x = x; P0.y = y; P0.key = v.key; } else { P0.x += (x - P0.x) * 0.25; P0.y += (y - P0.y) * 0.25; }
      b.style.transform = `translate(${Math.round(P0.x)}px, ${Math.round(P0.y)}px)`;
      yieldHud({ x0: P0.x, y0: P0.y, x1: P0.x + bw, y1: P0.y + bh }, rect);
      const tl = tailRef.current;
      if (tl) {
        if (tail) {
          const tx = Math.max(P0.x + 14, Math.min(P0.x + bw - 14, tail.x)), ty = Math.max(P0.y + 14, Math.min(P0.y + bh - 14, tail.y));
          const ex = tail.dir === 'up' ? P0.y : tail.dir === 'down' ? P0.y + bh : 0;
          const rot = tail.dir === 'up' ? 0 : tail.dir === 'down' ? 180 : tail.dir === 'left' ? -90 : 90;
          const px = tail.dir === 'left' ? P0.x : tail.dir === 'right' ? P0.x + bw : tx, py = tail.dir === 'up' || tail.dir === 'down' ? ex : ty;
          tl.style.transform = `translate(${px}px, ${py}px) rotate(${rot}deg)`; tl.style.opacity = '1';
        } else tl.style.opacity = '0';
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); yieldHud(null, null); };
  }, [game, T]);

  const press = (k: Parameters<typeof T.press>[0]) => (e: React.PointerEvent | React.MouseEvent) => { e.stopPropagation(); audio.sfx('click'); T.press(k); force((x) => x + 1); };
  const ask = !!view && view.key.endsWith(':ask');
  const on = !!view;
  return (
    <div className={'coach' + (on ? ' on' : '') + (view?.lesson === 'ctx' ? ' ctx' : '')} aria-live="polite">
      {[0, 1, 2, 3].map((i) => <div key={'d' + i} className="coach-dim" ref={(el) => { dims.current[i] = el; }} />)}
      {[0, 1, 2, 3].map((i) => <div key={'c' + i} className="coach-corner" ref={(el) => { corners.current[i] = el; }}><i /></div>)}
      <div className="coach-drop" ref={dropRef}><i /><i /><span>放这里</span></div>
      <div className="coach-ring" ref={ringRef}><i /><i /><b /></div>
      <div className="coach-edge" ref={edgeRef}><i /></div>
      {/* 对话框开着、这一步又不指对话框里的东西：气泡先藏起来（任务列那一条「下一步」还在） */}
      {view && !view.quiet && !T.collapsed && <>
        <div className="coach-tail" ref={tailRef} />
        <div className={'coach-bub' + (ask ? ' ask' : '')} ref={bubRef} role="dialog" aria-label={view.title} onPointerDown={(e) => e.stopPropagation()}>
          <div className="coach-in" key={view.key.split(':').slice(0, 2).join(':')}>
            <div className="coach-head">
              <span className="coach-seal">{view.lesson === 'main' ? '引' : '识'}</span>
              <b className="coach-title">{view.title}</b>
              {view.total > 1 && <span className="coach-idx">{view.idx} / {view.total}</span>}
            </div>
            <p className="coach-text">{view.text}</p>
            {view.checks && view.checks.length > 0 && (
              <ul className="coach-checks">{view.checks.map((c, i) => <li key={i} className={c.ok ? 'ok' : ''} style={{ ['--i' as string]: i } as CSSProperties}><i />{c.t}</li>)}</ul>
            )}
            <div className="coach-btns">
              {ask ? <>
                <button className="coach-btn ghost" onClick={press('skip-no')}>继续学</button>
                <button className="coach-btn zhu" onClick={press('skip-yes')}>跳过</button>
              </> : view.buttons.map((k) => (
                k === 'skip' ? <button key={k} className="coach-btn link" onClick={press('skip')}>跳过引导</button>
                  : k === 'hide' ? <button key={k} className="coach-btn link" onClick={press('hide')}>收起</button>
                    : k === 'next' ? <button key={k} className="coach-btn zhu" onClick={press('next')}>下一条 ›</button>
                      : <button key={k} className="coach-btn zhu" onClick={press('ok')}>{view.lesson === 'main' ? '好' : '知道了'}</button>
              ))}
            </div>
          </div>
          {stamp > 0 && <div className="coach-stamp" key={stamp}>成</div>}
        </div>
      </>}
    </div>
  );
}
