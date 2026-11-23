// v0.56/0.57：模组界面的公共画法——模组只给声明式的内容（文字、按钮、图片、进度条、物品、行列、分隔线），这里负责画；不执行模组给的 HTML。
// 用在：模组面板、屏幕 HUD、原版面板里模组加的段落。
import { useEffect, useState } from 'react';
import { itemDef } from '../data/items';
import { modx } from '../mod/hooks';
import { audio } from '../world/audio';
import { ItemGlyph } from './ItemIcon';

type UiN = { type: string; [k: string]: any };
const safeColor = (c: unknown) => typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\))$/i.test(c) ? c : undefined;

export function ModUiNodes({ nodes, mod, onChange }: { nodes: unknown[]; mod: string; onChange?: () => void }) {
  let count = 0;
  const R = (n: UiN, i: number, depth: number): React.ReactNode => {
    if (!n || typeof n !== 'object' || ++count > 400 || depth > 8) return null;
    switch (n.type) {
      case 'text': return <div key={i} className={'mui-text ' + (n.size ?? '')} style={{ color: safeColor(n.color), fontWeight: n.bold ? 'bold' : undefined }}>{String(n.text ?? '')}</div>;
      case 'button': return <button key={i} className={'ink-btn ' + (n.tone ?? '')} disabled={!!n.disabled} onClick={() => { audio.sfx('click'); try { n.onClick?.(); } catch (e) { console.warn(`[模组 ${mod}] 按钮出错`, e); } onChange?.(); }}>{String(n.label ?? '')}</button>;
      case 'image': return typeof n.src === 'string' && n.src.startsWith('data:image/') ? <img key={i} className="mui-img" src={n.src} alt="" style={{ width: Math.min(600, +n.w || 0) || undefined, height: Math.min(600, +n.h || 0) || undefined }} /> : null;
      case 'bar': { const k = Math.max(0, Math.min(1, (+n.value || 0) / Math.max(1e-9, +n.max || 1))); return <div key={i} className="mui-bar">{n.label && <span>{String(n.label)}</span>}<div className="mui-bar-bg"><div className="mui-bar-fg" style={{ width: `${k * 100}%`, background: safeColor(n.color) }} /></div></div>; }
      case 'item': { const d = itemDef(String(n.id)); return <div key={i} className="mui-item"><ItemGlyph id={d.id} className="glyph" />{d.name}{n.n ? ` ×${n.n}` : ''}</div>; }
      case 'row': case 'col': return <div key={i} className={'mui-' + n.type}>{(Array.isArray(n.children) ? n.children : []).map((c: UiN, j: number) => R(c, j, depth + 1))}</div>;
      case 'divider': return <hr key={i} className="mui-hr" />;
      default: return null;
    }
  };
  return <>{(nodes as UiN[]).map((n, i) => R(n, i, 0))}</>;
}

/** 每 0.5 秒刷新一次 */
function useTick(ms = 500) { const [, f] = useState(0); useEffect(() => { const t = setInterval(() => f((x) => x + 1), ms); return () => clearInterval(t); }, [ms]); return () => f((x) => x + 1); }

/** 原版面板里模组加的段落 */
export function ModSlot({ id }: { id: string }) {
  const re = useTick(700);
  const list = modx?.panelSlot(id) ?? [];
  if (!list.length) return null;
  return <>{list.map((s) => <div key={s.key} className="mod-slot"><div className="mod-slot-title">{s.title}</div><div className="mui-body"><ModUiNodes nodes={s.nodes} mod={s.key.split(':')[0]} onChange={re} /></div></div>)}</>;
}

/** 屏幕层 HUD。收官 H3：按位置分到主界面的各区里画（only 只画这几种 pos），类名 .mod-hud.pos-* 照旧 */
export function ModHuds({ only }: { only?: string[] } = {}) {
  const re = useTick(400);
  const list = (modx?.huds() ?? []).filter((h) => !only || only.includes(h.pos));
  if (!list.length) return null;
  return <>{list.map((h) => <div key={h.key} className={'mod-hud pos-' + h.pos}><ModUiNodes nodes={h.nodes} mod={h.key.split(':')[0]} onChange={re} /></div>)}</>;
}
