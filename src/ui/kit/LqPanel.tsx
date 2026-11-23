// 收官 H1（甲）：卷轴式面板的统一外壳——把旧的两个外壳（CultPanels.Panel、ModalLayer.Scroll）和各文件里内联的
// `.modal-mask > .scroll-panel` 都换成界面底座的 LacquerModal（宣纸底、鎏金双线、四角角花、匾额题字、开合只动 transform / opacity）。
// 模组契约：旧类名照挂——遮罩 .modal-mask、外壳 .scroll-panel（及各面板自己的 cult-panel / settings / wide / xxx-panel）、
// 头 .panel-head、题字 .panel-title、副标题 .panel-sub、关闭 .close-btn、内容区 .cult-body；面板里的 <ModSlot> 照旧放在内容区末尾。
// 里面的旧部件（.tabs .ink-btn .slot .shop-row .town-fac .kv .hint .switch .skill-row .sec-title）由 lqpanel.css 换成底座的样子。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LacquerModal } from './LacquerModal';
import { FloatCard } from './float';
import { ModSlot } from '../ModUi';
import './lqpanel.css';

export interface LqPanelProps {
  title: string;
  /** 第六轮返工：手机横屏匾额上的短题字 */
  shortTitle?: string;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** 宽版（旧的 .wide） */
  wide?: boolean;
  /** 外壳上额外的类名（旧的 cult-panel、settings、xxx-panel 等照挂） */
  cls?: string;
  /** 模组插槽 id（char / alchemy / seclude / town……），放在内容区末尾 */
  slot?: string;
  /** 宣纸底（默认）/ 乌木漆底 */
  variant?: 'paper' | 'lacquer';
  /** 紧凑：不挂匾额，题字写在标题栏（小面板：设置、改键、闭关、存档……） */
  compact?: boolean;
  /** 尺寸上限（像素）；窄屏一律全屏 */
  width?: number; height?: number;
  /** 内容区自己管滚动（例：里面是左右两栏、各自滚） */
  bodyCls?: string;
  /** 页签之类放在内容区上面、不随内容滚走的东西 */
  top?: ReactNode;
  /** 底栏（不随内容滚走） */
  foot?: ReactNode;
  /** 内容自己带着 .cult-body（原来内联外壳的那几个面板）：外层滚动区不再挂 cult-body，免得两层 */
  bare?: boolean;
}

/**
 * 面板里只靠 title= 悬停才看得到的说明（几十处），统一换成底座的浮动说明卡：鼠标悬停出、触屏长按出（原生 title 手机上看不到）。
 * 做法是事件委托：指针落在带 title 的元素上，就把 title 挪到 data-lq-tip（免得系统提示和卡片叠着出），用 FloatCard 显示。
 */
function TitleTips() {
  const [tip, setTip] = useState<{ t: string; x: number; y: number } | null>(null);
  const timer = useRef(0), pressed = useRef(false);
  useEffect(() => {
    const find = (e: Event) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[title],[data-lq-tip]') as HTMLElement | null;
      if (!el || !el.closest('.lq-modal.lqp')) return null;
      const t = el.getAttribute('title'); if (t) { el.setAttribute('data-lq-tip', t); el.removeAttribute('title'); }
      return el.getAttribute('data-lq-tip') || null;
    };
    const over = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; const t = find(e); window.clearTimeout(timer.current); if (!t) { setTip(null); return; } const x = e.clientX, y = e.clientY; timer.current = window.setTimeout(() => setTip({ t, x, y }), 150); };
    const move = (e: PointerEvent) => { if (e.pointerType === 'mouse') setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p)); };
    const down = (e: PointerEvent) => {
      window.clearTimeout(timer.current);
      if (pressed.current) { pressed.current = false; setTip(null); }
      if (e.pointerType === 'mouse') { setTip(null); return; }
      const t = find(e); if (!t) return;
      const x = e.clientX, y = e.clientY - 40;
      timer.current = window.setTimeout(() => { pressed.current = true; setTip({ t, x, y }); }, 450);   // 长按出
    };
    const up = (e: PointerEvent) => { if (e.pointerType !== 'mouse') window.clearTimeout(timer.current); };
    document.addEventListener('pointerover', over); document.addEventListener('pointermove', move); document.addEventListener('pointerdown', down, true); document.addEventListener('pointerup', up);
    return () => { window.clearTimeout(timer.current); document.removeEventListener('pointerover', over); document.removeEventListener('pointermove', move); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up); };
  }, []);
  return tip ? <FloatCard at={{ x: tip.x, y: tip.y }} className="lq-tip">{tip.t}</FloatCard> : null;
}

export function LqPanel({ title, shortTitle, sub, onClose, children, wide, cls = '', slot, variant = 'paper', compact, width, height, bodyCls = '', top, foot, bare }: LqPanelProps) {
  const w = width ?? (wide ? 1000 : compact ? 520 : 640);
  const h = height ?? (wide ? 820 : 760);
  return (
    <LacquerModal title={title} shortTitle={shortTitle} variant={variant} compact={compact} onClose={onClose} maskClass="modal-mask" className={'scroll-panel lqp' + (wide ? ' wide' : '') + (compact ? ' lqp-compact' : '') + ' ' + cls} closeClass="close-btn" width={w} height={h}>
      <div className="lq-head panel-head lqp-head">
        <div className="panel-title lqp-title">{title}</div>
        {sub ? <div className="panel-sub lqp-sub">{sub}</div> : <div className="panel-sub lqp-sub empty" />}
      </div>
      {top}
      <div className={(bare ? '' : 'cult-body ') + 'lqp-body lq-scroll ' + bodyCls}>
        {children}
        {slot && <ModSlot id={slot} />}
      </div>
      {foot}
      <TitleTips />
    </LacquerModal>
  );
}
