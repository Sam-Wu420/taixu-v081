// 收官 C（甲）：拖拽（全项目原来没有现成的）。pointer 事件自己写：
//   · 鼠标按下后拖过 6 像素起拖；触屏按住 0.22 秒不动起拖（这期间手指一动就当成滑动，交给浏览器滚列表）；
//   · 起拖后一个跟手的浮动图标（只改 transform），能放的目标加 .can（呼吸高亮），指着的目标加 .hot；
//   · 放手：落在 [data-drop] 上且允许 → onDrop；落在面板外 → onDrop(src, null)（丢弃 / 卸下 / 清掉）；其余 → onReject（放错抖一下）。
//   · 起拖以后吞掉这一次的 click，免得放手又点了一下。
// 目标元素写 data-drop="类型:键"，如 cell:12 / slot:crown / hb:3。

export interface DragSrc { kind: 'cell' | 'slot' | 'hb'; key: string; id: string }
export interface DndOpts {
  /** 面板根节点：放在它外面算「拖出面板」 */
  root: () => HTMLElement | null;
  canDrop: (src: DragSrc, target: string) => boolean;
  onDrop: (src: DragSrc, target: string | null) => void;
  onReject?: (src: DragSrc, target: string | null) => void;
  onStart?: (src: DragSrc) => void;
  onEnd?: () => void;
}
const MOUSE_PX = 6, TOUCH_MS = 220, TOUCH_SLOP = 10;

export class Dnd {
  dragging: DragSrc | null = null;
  private ghost: HTMLElement | null = null;
  private gw = 0; private gh = 0;
  private hot: HTMLElement | null = null;
  private timer = 0;
  private press: { src: DragSrc; el: HTMLElement; x: number; y: number; id: number; touch: boolean } | null = null;
  constructor(public o: DndOpts) {}

  /** 在可拖元素的 onPointerDown 里调 */
  down(e: React.PointerEvent | PointerEvent, el: HTMLElement, src: DragSrc) {
    if (this.dragging || (e.pointerType === 'mouse' && e.button !== 0)) return;
    this.cancelPress();
    const touch = e.pointerType !== 'mouse';
    this.press = { src, el, x: e.clientX, y: e.clientY, id: e.pointerId, touch };
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    if (touch) this.timer = window.setTimeout(() => { if (this.press) this.begin(this.press.x, this.press.y); }, TOUCH_MS);
  }

  private begin(x: number, y: number) {
    const p = this.press; if (!p) return;
    this.dragging = p.src;
    // 浮动图标：拷一份格子里的图标
    const r = p.el.getBoundingClientRect();
    const g = document.createElement('div');
    g.className = 'lq-ghost';
    g.innerHTML = p.el.querySelector('.lq-cell-ico, .inv-eq-ico, .hb-glyph')?.outerHTML ?? p.el.innerHTML;
    g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    this.gw = r.width; this.gh = r.height;
    document.body.appendChild(g); this.ghost = g;
    this.place(x, y);
    p.el.classList.add('lifted');
    // 标出能放的目标
    const root = this.o.root();
    root?.classList.add('dnd-on');
    root?.querySelectorAll<HTMLElement>('[data-drop]').forEach((t) => { if (this.o.canDrop(p.src, t.dataset.drop!)) t.classList.add('can'); });
    if (p.touch) { window.addEventListener('touchmove', this.block, { passive: false }); try { navigator.vibrate?.(12); } catch { /* */ } }
    this.o.onStart?.(p.src);
  }
  private place(x: number, y: number) { if (this.ghost) this.ghost.style.transform = `translate3d(${Math.round(x - this.gw / 2)}px, ${Math.round(y - this.gh / 2)}px, 0) scale(1.18)`; }
  private targetAt(x: number, y: number): HTMLElement | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest<HTMLElement>('[data-drop]') ?? null;
  }
  private block = (e: TouchEvent) => { if (this.dragging) e.preventDefault(); };
  private move = (e: PointerEvent) => {
    const p = this.press; if (!p || e.pointerId !== p.id) return;
    if (!this.dragging) {
      const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) { if (d > TOUCH_SLOP) this.cancelPress(); return; }
      if (d > MOUSE_PX) this.begin(e.clientX, e.clientY); else return;
    }
    e.preventDefault();
    this.place(e.clientX, e.clientY);
    const t = this.targetAt(e.clientX, e.clientY);
    if (t !== this.hot) { this.hot?.classList.remove('hot'); this.hot = t && t.classList.contains('can') ? t : null; this.hot?.classList.add('hot'); }
  };
  private up = (e: PointerEvent) => {
    const p = this.press; if (!p || e.pointerId !== p.id) return;
    if (!this.dragging) { this.cancelPress(); return; }
    const src = this.dragging;
    const t = this.targetAt(e.clientX, e.clientY), key = t?.dataset.drop ?? null;
    const root = this.o.root();
    const inside = !!root && (() => { const el = document.elementFromPoint(e.clientX, e.clientY); return !!el && root.contains(el); })();
    // 放手那一下的 click 吞掉
    const eat = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', eat, { capture: true } as EventListenerOptions), 60);
    this.finish();
    if (key && this.o.canDrop(src, key)) this.o.onDrop(src, key);
    else if (!inside) this.o.onDrop(src, null);
    else this.o.onReject?.(src, key);
  };
  private cancel = () => { this.finish(); };
  private cancelPress() {
    window.clearTimeout(this.timer);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel);
    this.press = null;
  }
  private finish() {
    const p = this.press;
    p?.el.classList.remove('lifted');
    this.cancelPress();
    window.removeEventListener('touchmove', this.block);
    this.ghost?.remove(); this.ghost = null;
    this.hot?.classList.remove('hot'); this.hot = null;
    const root = this.o.root();
    root?.classList.remove('dnd-on');
    root?.querySelectorAll('.can').forEach((t) => t.classList.remove('can'));
    const was = !!this.dragging;
    this.dragging = null;
    if (was) this.o.onEnd?.();
  }
  dispose() { this.finish(); }
}
