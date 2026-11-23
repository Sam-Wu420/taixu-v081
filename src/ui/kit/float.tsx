// 界面底座：浮动卡片——Tooltip（鼠标悬停、触屏长按都能出；跟着鼠标走、贴到屏幕边会自己让开）、Popover（点开的小面板）、FloatCard（贴着某个元素放的卡片）。
// 都挂在 document.body 上（不被面板的 overflow 裁掉）；位置只改 transform。
import { cloneElement, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './kit.css';

type Pt = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
const PAD = 8;

/** 把一张宽 w 高 h 的卡放到点 p 旁边（右下优先，放不下翻到左 / 上），夹在屏幕里 */
export function placeNear(p: Pt, w: number, h: number, off = 16): Pt {
  const W = window.innerWidth, H = window.innerHeight;
  let x = p.x + off, y = p.y + off;
  if (x + w > W - PAD) x = p.x - off - w;
  if (y + h > H - PAD) y = H - PAD - h;
  return { x: Math.max(PAD, Math.min(W - PAD - w, x)), y: Math.max(PAD, y) };
}
/** 把卡放在一个元素旁边：右侧优先，放不下放左侧，再不行放上 / 下 */
export function placeBeside(b: Box, w: number, h: number, gap = 10): Pt {
  const W = window.innerWidth, H = window.innerHeight;
  let x: number, y: number;
  if (b.x + b.w + gap + w <= W - PAD) x = b.x + b.w + gap;
  else if (b.x - gap - w >= PAD) x = b.x - gap - w;
  else { x = Math.max(PAD, Math.min(W - PAD - w, b.x + b.w / 2 - w / 2)); y = b.y - gap - h >= PAD ? b.y - gap - h : b.y + b.h + gap; return { x, y: Math.max(PAD, Math.min(H - PAD - h, y)) }; }
  y = Math.max(PAD, Math.min(H - PAD - h, b.y + b.h / 2 - h / 2));
  return { x, y };
}

/** 一张挂在 body 上的浮动卡：给锚点（点或框），自己量尺寸、让开屏幕边 */
export function FloatCard({ at, box, className = '', children, interactive }: { at?: Pt | null; box?: Box | null; className?: string; children: ReactNode; interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const p = box ? placeBeside(box, w, h) : at ? placeNear(at, w, h) : null;
    if (!p) return;
    el.style.transform = `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`;
    el.style.opacity = '1';
  });
  if (typeof document === 'undefined' || (!at && !box)) return null;
  return createPortal(<div ref={ref} className={'lq-float ' + className + (interactive ? ' live' : '')} style={{ opacity: 0 }}>{children}</div>, document.body);
}

/** 悬停 / 长按出的说明。child 必须是一个 DOM 元素（会给它加上指针事件） */
export function Tooltip({ tip, children, delay = 120, className = '' }: { tip: ReactNode; children: ReactElement<any>; delay?: number; className?: string }) {
  const [at, setAt] = useState<Pt | null>(null);
  const timer = useRef(0), press = useRef<{ x: number; y: number; t: number } | null>(null), last = useRef<Pt>({ x: 0, y: 0 });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // 触屏长按出来的：下一次点别处就收
  useEffect(() => {
    if (!at || !press.current) return;
    const off = () => { setAt(null); press.current = null; };
    const t = window.setTimeout(() => window.addEventListener('pointerdown', off, { once: true }), 0);
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', off); };
  }, [at]);
  if (!tip) return children;
  const p = children.props;
  return <>
    {cloneElement(children, {
      onPointerEnter: (e: React.PointerEvent) => { p.onPointerEnter?.(e); if (e.pointerType !== 'mouse') return; last.current = { x: e.clientX, y: e.clientY }; window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAt({ ...last.current }), delay); },
      onPointerMove: (e: React.PointerEvent) => { p.onPointerMove?.(e); if (e.pointerType === 'mouse') { last.current = { x: e.clientX, y: e.clientY }; if (at) setAt({ ...last.current }); } else if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) window.clearTimeout(timer.current); },
      onPointerLeave: (e: React.PointerEvent) => { p.onPointerLeave?.(e); if (e.pointerType === 'mouse') { window.clearTimeout(timer.current); setAt(null); } },
      onPointerDown: (e: React.PointerEvent) => {
        p.onPointerDown?.(e);
        if (e.pointerType === 'mouse') return;
        press.current = { x: e.clientX, y: e.clientY, t: performance.now() };
        window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAt({ x: press.current!.x, y: press.current!.y - 40 }), 450);
      },
      onPointerUp: (e: React.PointerEvent) => { p.onPointerUp?.(e); if (e.pointerType !== 'mouse') window.clearTimeout(timer.current); },
      onPointerCancel: (e: React.PointerEvent) => { p.onPointerCancel?.(e); window.clearTimeout(timer.current); },
      // 系统自带的 title 会和这张卡叠着出，去掉
      title: undefined,
    })}
    {at && <FloatCard at={at} className={'lq-tip ' + className}>{tip}</FloatCard>}
  </>;
}

/** 点开的小面板：anchor 是触发它的元素（点它外面就收） */
export function Popover({ open, anchor, onClose, children, className = '' }: { open: boolean; anchor: HTMLElement | null; onClose: () => void; children: ReactNode; className?: string }) {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => { if (open && anchor) { const r = anchor.getBoundingClientRect(); setBox({ x: r.left, y: r.top, w: r.width, h: r.height }); } else setBox(null); }, [open, anchor]);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { const t = e.target as Node; if (anchor?.contains(t) || (t as HTMLElement).closest?.('.lq-popover')) return; onClose(); };
    const t = window.setTimeout(() => window.addEventListener('pointerdown', off), 0);
    return () => { window.clearTimeout(t); window.removeEventListener('pointerdown', off); };
  }, [open, anchor]);
  if (!open || !box) return null;
  return <FloatCard box={box} className={'lq-popover ' + className} interactive>{children}</FloatCard>;
}
