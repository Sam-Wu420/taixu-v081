// 界面底座：小部件——匾额、墨痕页签、四种按钮、物品格子、品阶签、灵石、面板内提示条、盖章、数字跳动、scaleX 的条。
// 类名一律 lq- 前缀（不再用全局 .wb-*：它和 wanbao 模组撞名）。动效只动 transform / opacity。
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { ItemGlyph } from '../ItemIcon';
import { tierColor, tierName, fmtStone } from './tier';
import plaqueUrl from '../../assets/wanbao/plaque.webp';
import './kit.css';

/**
 * 乌木鎏金匾额，字用游戏字体写（生成的汉字不可靠，匾额贴图是空白的）。
 * 第五轮：按字数自适应——四字起收字距（long），六字起再收（xl）；量一下字宽，超出匾心（匾宽的七成）就整行 scale 缩进去
 * （只动 transform；各档屏幕的匾额宽度不同，字号由 css 给上限，这里只管缩）。以前「大事记 · 机缘录」头尾两字露在匾外。
 */
export function Plaque({ text: full, small, className = '', short }: { text: string; small?: boolean; className?: string; short?: string }) {
  const box = useRef<HTMLDivElement>(null), tx = useRef<HTMLSpanElement>(null);
  // 第六轮返工：手机横屏（高不过 520）匾额只有 168×46，长题字缩到十二三像素——给了短题字就换成短的（大事记 · 机缘录 → 大事记）
  const [phoneLand, setPhoneLand] = useState(() => !!short && typeof window !== 'undefined' && window.innerHeight <= 520);
  useEffect(() => {
    if (!short) return;
    const on = () => setPhoneLand(window.innerHeight <= 520);
    window.addEventListener('resize', on); on();
    return () => window.removeEventListener('resize', on);
  }, [short]);
  const text = short && phoneLand ? short : full;
  useEffect(() => {
    const fit = () => {
      const b = box.current, t = tx.current; if (!b || !t) return;
      const room = Math.min(b.clientWidth, b.clientHeight * 2.97) * 0.7, w = t.scrollWidth;   // 贴图 contain 铺着（宽高比约 2.97），匾心约占图宽七成
      t.style.transform = room > 0 && w > room ? `scale(${(room / w).toFixed(3)})` : '';
    };
    fit();
    window.addEventListener('resize', fit);
    try { void document.fonts?.ready.then(fit); } catch { /* 无 FontFaceSet */ }
    const t2 = window.setTimeout(fit, 400);   // 匾额弹入、字体换上之后再量一次
    return () => { window.removeEventListener('resize', fit); window.clearTimeout(t2); };
  }, [text]);
  const n = text.replace(/\s/g, '').length;
  return (
    <div ref={box} className={'lq-plaque' + (small ? ' sm' : '') + (n >= 4 ? ' long' : '') + (n >= 6 ? ' xl' : '') + ' ' + className} style={{ backgroundImage: `url(${plaqueUrl})` }}>
      <span ref={tx} className="lq-plaque-t">{text}</span><i className="lq-sheen" />
    </div>
  );
}

export interface InkTab<K extends string> { k: K; label: ReactNode; badge?: number | string; title?: string }
/** 墨痕页签：底下一道朱墨痕，用 translateX 跟着选中的页签走。legacy=true 时同时带旧类名 .tabs（模组皮肤认它） */
export function InkTabs<K extends string>({ items, value, onChange, legacy, className = '' }: { items: InkTab<K>[]; value: K; onChange: (k: K) => void; legacy?: boolean; className?: string }) {
  const i = Math.max(0, items.findIndex((x) => x.k === value));
  return (
    <nav className={'lq-tabs' + (legacy ? ' tabs' : '') + ' ' + className} style={{ ['--n' as string]: items.length } as CSSProperties} role="tablist">
      {items.map((t) => (
        <button key={t.k} role="tab" aria-selected={t.k === value} className={t.k === value ? 'on' : ''} title={t.title} onClick={() => t.k !== value && onChange(t.k)}>
          {t.label}{t.badge ? <sup>{t.badge}</sup> : null}
        </button>
      ))}
      <span className="lq-tab-ink" style={{ transform: `translateX(${i * 100}%)` }} />
    </nav>
  );
}

/** 四种按钮：zhu 朱漆主按钮、jade 玉色小按钮、line 描边、pill 胶囊（小选项） */
export type BtnKind = 'zhu' | 'jade' | 'line' | 'pill';
export function Btn({ kind = 'line', on, className = '', children, ...rest }: { kind?: BtnKind; on?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`lq-btn lq-btn-${kind}${on ? ' on' : ''} ${className}`}>{children}</button>;
}
/** 类名版（有的地方要和旧类名并用，比如 ink-btn） */
export const btnCls = (kind: BtnKind, extra = '') => `lq-btn lq-btn-${kind} ${extra}`;

export interface ItemCellProps {
  id?: string | null;
  n?: number;
  /** 品阶（不给就按物品取） */
  tier?: number;
  age?: number;
  on?: boolean; off?: boolean; lock?: boolean;
  /** 角上的小字（如「伪」「穿」） */
  mark?: string;
  /** 漆底 / 纸底 */
  bg?: 'paper' | 'lacquer';
  className?: string;
  title?: string;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  children?: ReactNode;
  /** 透传给根节点的 data-* 等（拖拽用） */
  attrs?: Record<string, string | number | undefined>;
  /** 显示物品名（旧储物袋的样子） */
  name?: string;
}
/** 物品格子：图标（ItemGlyph）、数量角标、品阶边色、选中 / 禁用 / 上锁；四阶以上一道流光 */
export function ItemCell({ id, n, tier, age, on, off, lock, mark, bg = 'lacquer', className = '', title, style, onClick, children, attrs, name }: ItemCellProps) {
  const t = tier ?? 0;
  const col = tierColor(t, bg === 'paper' ? 'paper' : 'lacquer');
  return (
    <div {...attrs} role="button" tabIndex={-1} className={`lq-cell t${t}${on ? ' on' : ''}${off ? ' off' : ''}${lock ? ' lock' : ''}${id ? '' : ' empty'} ${className}`} title={title} style={{ ['--tc' as string]: col, ...style } as CSSProperties} onClick={onClick}>
      {id && <ItemGlyph id={id} className="lq-cell-ico" style={{ color: col }} />}
      {id && t >= 4 && <i className="lq-cell-flow" />}
      {name && <span className="lq-cell-nm">{name}</span>}
      {age !== undefined && age > 0 && <span className="lq-cell-age">{age >= 10000 ? Math.floor(age / 10000) + '万' : age}年</span>}
      {n !== undefined && n > 1 && <span className="lq-cell-n">{n >= 10000 ? (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万' : n}</span>}
      {mark && <span className="lq-cell-mark">{mark}</span>}
      {lock && <span className="lq-cell-lock">锁</span>}
      {children}
    </div>
  );
}

/** 品阶签 */
export function TierPill({ t, className = '' }: { t: number; className?: string }) { return <em className={`lq-tier t${Math.max(0, Math.min(6, t))} ${className}`}>{tierName(t)}</em>; }

/** 灵石：菱形 + 数字 */
export function Stone({ n, sm, unit, className = '' }: { n?: number; sm?: boolean; unit?: boolean; className?: string }) {
  return <span className={'lq-stone-n' + (sm ? ' sm' : '') + ' ' + className}><b className={'lq-stone' + (sm ? ' sm' : '')} />{n !== undefined && fmtStone(n)}{unit && <small>灵石</small>}</span>;
}
/** 只有菱形 */
export function StoneGem({ sm }: { sm?: boolean }) { return <b className={'lq-stone' + (sm ? ' sm' : '')} />; }

/** 面板内提示条：给一句话，显示两三秒自己收起 */
export function useInkToast(ms = 2600): [string, (s: string) => void] {
  const [msg, setMsg] = useState('');
  const say = (s: string) => { setMsg(s); window.setTimeout(() => setMsg((m) => (m === s ? '' : m)), ms); };
  return [msg, say];
}
export function InkToast({ msg, tone = 'ink', className = '' }: { msg: string; tone?: 'ink' | 'zhu' | 'jade'; className?: string }) {
  return <div className={`lq-toast ${tone}${msg ? ' on' : ''} ${className}`} role="status">{msg}</div>;
}

/** 盖章：k 变一次盖一次 */
export function Stamp({ text, k, className = '' }: { text: string; k: number; className?: string }) {
  if (!k) return null;
  return <div className={'lq-stamp ' + className} key={k}>{text}</div>;
}

/** 数字跳动：值变了就弹一下 */
export function PopNumber({ value, format = fmtStone, className = '' }: { value: number; format?: (n: number) => string; className?: string }) {
  return <b className={'lq-pop ' + className} key={value}>{format(value)}</b>;
}

/** scaleX 的条（不动 width），掉下去时后面留一截残影慢慢跟上 */
export function ScaleBar({ value, color, ghost = true, className = '' }: { value: number; color?: string; ghost?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const prev = useRef(v); const [ghostV, setGhostV] = useState(v);
  useEffect(() => {
    if (v >= prev.current) { setGhostV(v); prev.current = v; return; }
    prev.current = v;
    const t = window.setTimeout(() => setGhostV(v), 380);   // 先停一下再追上去
    return () => window.clearTimeout(t);
  }, [v]);
  return (
    <span className={'lq-bar ' + className} style={color ? { ['--bc' as string]: color } as CSSProperties : undefined}>
      {ghost && <i className="lq-bar-ghost" style={{ transform: `scaleX(${Math.max(v, ghostV)})` }} />}
      <i className="lq-bar-fill" style={{ transform: `scaleX(${v})` }} />
    </span>
  );
}

/** 小节标题（左边一道朱色竖线） */
export function SecTitle({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={'lq-sec ' + className}>{children}</div>; }
