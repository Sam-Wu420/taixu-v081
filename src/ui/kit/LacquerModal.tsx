// 界面底座：漆器弹窗外壳——遮罩、外壳（宣纸 / 乌木两种底）、四角角花、匾额题字、关闭钮、开合动效、退场、捕获阶段 Esc。
// 子组件用 useLqClose() 拿到「带退场动画的关闭」。动效只动 transform / opacity（见记忆 css-filter-animation-jank）。
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { audio } from '../../world/audio';
import { Plaque } from './parts';
import cornerUrl from '../../assets/wanbao/corner.webp';
import paperUrl from '../../assets/wanbao/paper.webp';
import './kit.css';

const CloseCtx = createContext<() => void>(() => {});
/** 拿到所在弹窗的关闭（播退场动画后再真正关） */
export function useLqClose() { return useContext(CloseCtx); }
/** 退场动画时长（毫秒），和 kit.css 里 --lq-t-out 对齐 */
export const LQ_OUT_MS = 220;
/** 打开着的漆器弹窗（按打开先后）：Esc 只关最上面那个 */
const escStack: number[] = []; let escSeq = 0, escHold = 0;
/** 别处要自己用 Esc（改键时「按 Esc 取消」）：先 holdLqEsc()，用完调返回的函数放开 */
export function holdLqEsc(): () => void { escHold++; let done = false; return () => { if (!done) { done = true; escHold--; } }; }

export interface LacquerModalProps {
  /** 匾额题字；compact 时显示成标题栏文字 */
  title: string;
  /** 第六轮返工：手机横屏匾额太小时换用的短题字 */
  shortTitle?: string;
  onClose: () => void;
  /** 宣纸底 / 乌木漆底 */
  variant?: 'paper' | 'lacquer';
  /** 紧凑版：不挂匾额、角花缩小，给小窗口用 */
  compact?: boolean;
  /** 外壳额外类名（各面板自己的样式挂这里） */
  className?: string;
  /** 遮罩额外类名（例：储物袋保留旧的 modal-mask 给模组皮肤认） */
  maskClass?: string;
  /** 关闭钮额外类名（例：close-btn） */
  closeClass?: string;
  /** 外壳尺寸上限（像素）；窄屏一律全屏 */
  width?: number; height?: number;
  /** 关闭钮的提示 */
  closeTip?: string;
  /** 点遮罩是否关闭（默认关） */
  maskClose?: boolean;
  /** 关之前的处理（返回 false 不关） */
  beforeClose?: () => boolean | void;
  style?: CSSProperties;
  children: ReactNode;
}

export function LacquerModal({ title, shortTitle, onClose, variant = 'paper', compact, className = '', maskClass = '', closeClass = '', width, height, closeTip, maskClose = true, beforeClose, style, children }: LacquerModalProps) {
  const [closing, setClosing] = useState(false);
  const done = useRef(false);
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const beforeRef = useRef(beforeClose); beforeRef.current = beforeClose;
  const close = useCallback(() => {
    if (done.current) return;
    if (beforeRef.current?.() === false) return;
    done.current = true; audio.sfx('click'); setClosing(true);
    window.setTimeout(() => onCloseRef.current(), LQ_OUT_MS);
  }, []);
  // 捕获阶段拦 Esc：不让它再落到游戏的按键处理（否则会顺手打开设置之类）。
  // 收官 H2：叠着开的弹窗（设置上面再开改键）只让最上面那一个关——几个弹窗的监听器都挂在 window 上，
  // stopPropagation 拦不住同一目标上的其它监听器，以前按一次 Esc 会把设置连同改键一起关掉。
  useEffect(() => {
    const id = ++escSeq; escStack.push(id);
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escHold > 0 || escStack[escStack.length - 1] !== id) return;
      e.stopPropagation(); e.stopImmediatePropagation(); e.preventDefault(); close();
    };
    window.addEventListener('keydown', k, true);
    return () => { window.removeEventListener('keydown', k, true); const i = escStack.indexOf(id); if (i >= 0) escStack.splice(i, 1); };
  }, [close]);
  const shellStyle: CSSProperties = { ...style };
  if (width) (shellStyle as Record<string, string>)['--lq-w'] = width + 'px';
  if (height) (shellStyle as Record<string, string>)['--lq-h'] = height + 'px';
  if (variant === 'paper') shellStyle.backgroundImage = `url(${paperUrl})`;
  return (
    <CloseCtx.Provider value={close}>
      <div className={'lq-mask ' + maskClass + (closing ? ' out' : '')} onClick={maskClose ? close : undefined}>
        <div className={`lq-modal lq-${variant}${compact ? ' lq-compact' : ''}${closing ? ' out' : ''} ${className}`} style={shellStyle} onClick={(e) => e.stopPropagation()}>
          {['tl', 'tr', 'bl', 'br'].map((c) => <img key={c} className={'lq-corner ' + c} src={cornerUrl} alt="" draggable={false} />)}
          {compact ? <div className="lq-titlebar"><span>{title}</span></div> : <Plaque text={title} short={shortTitle} />}
          <button className={'lq-close ' + closeClass} onClick={close} title={closeTip ?? '关闭（Esc）'} aria-label="关闭">×</button>
          {children}
        </div>
      </div>
    </CloseCtx.Provider>
  );
}
