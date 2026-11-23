// 人脉录（r20 重做）：横卷轴外框 + 左侧圆章导航；默认第一页「亲族关系」是一棵以你为中心的关系树，
// 「人际关系」是同一套人物小卡的网格（按亲疏远近排）；恩怨、宗门、记事、天下事几页功能照旧，只换进新卷轴。
//
// 数据（只读，不改世界逻辑）：
//   · 师父 / 徒弟 / 义兄弟姐妹 / 同行 / 护法 —— NpcData.bond（world/relations.ts 的 Bond）
//   · 伴侣 / 知交 —— ws.hearts（友人录；flags.companion＝伴侣，好感≥30 且未缘尽＝知己）
//   · 死敌 —— grudge ≥ 2 或正在追杀你的人
//   · 心灯 —— NPC 对你的好感 favor（-100…100）。游戏里只有「对方对你」这一个方向，没有「你对对方」，所以只画一排灯。
// 动效只动 transform / opacity；墨线「画出」和灵气流动用 Web Animations 动 SVG 的 stroke-dashoffset（不写进 CSS 的 @keyframes / transition）。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Game } from '../world/game';
import type { NpcData } from '../world/npc';
import { PERS_NAME } from '../world/npc';
import type { Tier } from '../world/relations';
import { TIER_COLOR as REL_COLOR, SECT_ALLY, allyGroup, SECT_HOSTILE, SECT_SIEGE, SECT_ELDER } from '../world/relations';
import { SECT_DEFS, SECT_DEF, sectTitle, RANKS, rankOf, type Rank } from '../world/roster';
import { scaleOf, SCALE_NAME, SCALE_CAP } from '../data/sects';
import { SECT_RANKS, repName } from '../world/worldstate';
import { LOC_BY_ID } from '../data/world';
import { REALMS, realmName } from '../data/realms';
import { BEAUTIES, type BeautyDef } from '../data/beauties';
import { npcPortrait } from '../data/portraits';
import { audio } from '../world/audio';
import { LacquerModal, ScaleBar, useTouch } from './kit';
import { LifeCard, WorldChronicle } from './LivingUI';
import { FeudPage } from './FeudHud';
import paperUrl from '../assets/renmai/paper.webp';
import rodUrl from '../assets/renmai/rod.webp';
import badgeUrl from '../assets/renmai/badge.webp';
import lampUrl from '../assets/renmai/lamp.webp';
import lampDarkUrl from '../assets/renmai/lamp_dark.webp';
import silMUrl from '../assets/renmai/sil_m.webp';
import silFUrl from '../assets/renmai/sil_f.webp';
import medalUrl from '../assets/renmai/medal.webp';
import goldUrl from '../assets/renmai/gold.webp';
import './renmai.css';

const click = () => audio.sfx('click');
// 卷轴杆、纸面、圆章、牌子、心灯这几张图开局闲下来时先拿下来（第一次开人脉录不至于先看到空框）
const KEEP: HTMLImageElement[] = [];
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Image !== 'undefined') {
  const go = () => { for (const u of [rodUrl, paperUrl, medalUrl, badgeUrl, lampUrl, lampDarkUrl, goldUrl]) { const im = new Image(); im.decoding = 'async'; im.src = u; KEEP.push(im); } };
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(go, { timeout: 8000 }); else if (typeof setTimeout === 'function') setTimeout(go, 4000);
}
const FACTION_NAME: Record<string, string> = { sect: '宗门', rogue: '散修', demon: '魔修', mortal: '凡人', merchant: '行商' };
const BOND_TEXT: Record<string, string> = { sworn: '义结金兰', master: '授业恩师', disciple: '座下弟子', companion: '结伴同行', guard: '雇佣护法' };

// ============================================================ 数据：人物卡
type Wire = 'gold' | 'jade' | 'blood';
export interface RmPerson {
  key: string; d?: NpcData; b?: BeautyDef;
  name: string; sex: 'm' | 'f'; realm: number; stage: number; portrait?: string;
  favor: number; tier: Tier | '知交'; alive: boolean;
  /** 六角牌：门派 / 身份 */
  badge: [string, string?];
  /** 这张卡挂在什么线上 */
  wire: Wire;
}
export interface RmGroup { k: string; label: string; side: 'L' | 'R'; row: 0 | 1 | 2; wire: Wire; people: RmPerson[] }

function badgeOf(d: NpcData): [string, string?] {
  if (d.sect) {
    const name = SECT_DEF.get(d.sect)?.name ?? LOC_BY_ID.get(d.sect)?.name ?? '';
    const def = d.ros ? SECT_DEF.get(d.ros) : undefined;
    const rank = def && d.rosI !== undefined ? rankOf(def, d.rosI) : /长老|掌门|宗主|谷主|执事/.test(d.title ?? '') ? (d.title ?? '').replace(/^.*?(太上长老|长老|掌门|宗主|谷主|执事).*$/, '$1') : SECT_RANKS[d.srk ?? 0] ?? '';
    return [name || '宗门', rank.replace('弟子', '') ? (/弟子|长老|掌门|执事|杂役/.test(rank) ? rank : rank + '弟子') : undefined];
  }
  return [FACTION_NAME[d.faction] ?? '散修'];
}
export function personOf(game: Game, d: NpcData, wire?: Wire): RmPerson {
  const t = game.rel.tier(d);
  return {
    key: d.id, d, name: d.name, sex: d.sex, realm: d.realm, stage: d.stage, portrait: npcPortrait(d), favor: d.favor, tier: t, alive: d.alive,
    badge: badgeOf(d), wire: wire ?? (t === '死敌' || t === '仇人' ? 'blood' : t === '同行' || t === '护法' ? 'jade' : 'gold'),
  };
}
function beautyPerson(game: Game, b: BeautyDef, companion: boolean): RmPerson {
  const s = game.ws.hearts[b.id]; const d = game.npcs.byId.get('b_' + b.id);
  return {
    key: 'b_' + b.id, d, b, name: b.name, sex: 'f', realm: d?.realm ?? b.realm, stage: d?.stage ?? b.stage, portrait: b.portrait,
    favor: s?.favor ?? 0, tier: companion ? '伴侣' : '知交', alive: d ? d.alive : true, badge: [b.title.replace(/(结丹|筑基|元婴|炼气|练气)?(修士|女修|弟子|小姐|之徒)$/, '').slice(0, 5) || '知交', companion ? '伴侣' : '知己'], wire: 'gold',
  };
}

/** 亲族关系树的分组：只按游戏里实际存在的关系分，没有的就不画 */
export function kinGroups(game: Game): RmGroup[] {
  const L = game.npcs.list.filter((d) => d.alive);
  const day = game.day;
  const by = (f: (d: NpcData) => boolean) => L.filter(f).sort((a, b) => b.favor - a.favor).map((d) => personOf(game, d));
  const dao: RmPerson[] = [], hy: RmPerson[] = [];
  for (const b of BEAUTIES) {
    const s = game.ws.hearts[b.id]; if (!s?.met || s.flags?.parted) continue;
    const d = game.npcs.byId.get('b_' + b.id); if (d && !d.alive) continue;
    if (s.flags?.companion) dao.push(beautyPerson(game, b, true));
    else if ((s.favor ?? 0) >= 30) hy.push(beautyPerson(game, b, false));
  }
  hy.sort((a, b) => b.favor - a.favor);
  const gs: RmGroup[] = [
    { k: 'master', label: '师父', side: 'L', row: 0, wire: 'gold', people: by((d) => d.bond === 'master') },
    { k: 'hongyan', label: '知交', side: 'R', row: 0, wire: 'gold', people: hy },
    { k: 'daolv', label: '伴侣', side: 'L', row: 1, wire: 'gold', people: dao },
    { k: 'sworn', label: '义兄弟姐妹', side: 'R', row: 1, wire: 'gold', people: by((d) => d.bond === 'sworn') },
    { k: 'disciple', label: '徒弟', side: 'L', row: 2, wire: 'gold', people: by((d) => d.bond === 'disciple') },
    { k: 'party', label: '同行 · 护法', side: 'R', row: 2, wire: 'jade', people: by((d) => (d.bond === 'companion' || d.bond === 'guard') && (d.bondUntil ?? 0) > day) },
    { k: 'foe', label: '死敌', side: 'R', row: 2, wire: 'blood', people: L.filter((d) => !d.bond && ((d.grudge ?? 0) >= 2 || d.hunting)).sort((a, b) => (+!!b.hunting - +!!a.hunting) || a.favor - b.favor).map((d) => personOf(game, d, 'blood')) },
  ];
  return gs.filter((g) => g.people.length > 0);
}

/** 人际关系：所有识得的人，按亲疏远近分段 */
const NEAR: { k: string; label: string; tiers: (Tier | '知交')[] }[] = [
  { k: 'kin', label: '生死之交', tiers: ['伴侣', '师父', '徒弟', '结拜'] },
  { k: 'party', label: '同行护法', tiers: ['同行', '护法'] },
  { k: 'zhiyou', label: '挚友', tiers: ['挚友'] },
  { k: 'hongyan', label: '知交', tiers: ['知交'] },
  { k: 'haoyou', label: '好友', tiers: ['好友'] },
  { k: 'xiangshi', label: '相识', tiers: ['相识', '陌生'] },
  { k: 'yanwu', label: '嫌隙', tiers: ['厌恶'] },
  { k: 'chou', label: '仇人', tiers: ['仇人'] },
  { k: 'sidi', label: '死敌', tiers: ['死敌'] },
];

// ============================================================ 小部件
/** 心灯：五盏。好感为正点亮金灯（末盏按余数半明），为负换成熄灭的铁灯（越恨越多） */
export function Lamps({ v, size = 15 }: { v: number; size?: number }) {
  const n = Math.min(5, Math.abs(v) / 20), full = Math.floor(n), part = n - full;
  const neg = v < 0;
  const cells: ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const on = i < full ? 1 : i === full ? part : 0;
    cells.push(<i key={i} className={'rm-lamp' + (neg ? ' neg' : '') + (on > 0 ? '' : ' off')} style={{ width: size, height: size, backgroundImage: `url(${neg ? lampDarkUrl : lampUrl})`, opacity: on > 0 ? 0.35 + 0.65 * on : undefined }} />);
  }
  return <span className={'rm-lamps' + (neg ? ' neg' : '')} title={`对方对你的好感 ${Math.round(v)}`}>{cells}</span>;
}
/** 头像：有立绘用立绘（截头肩），加载不出或没有就用水墨剪影 */
function Face({ p, big }: { p: { portrait?: string; sex: 'm' | 'f' }; big?: boolean }) {
  const sil = p.sex === 'f' ? silFUrl : silMUrl;
  const [src, setSrc] = useState(p.portrait || sil);
  useEffect(() => setSrc(p.portrait || sil), [p.portrait, sil]);
  return <span className={'rm-clip' + (big ? ' big' : '') + (src === sil ? ' sil' : '')}><img className="rm-face" src={src} alt="" draggable={false} loading="lazy" onError={() => setSrc(sil)} /></span>;
}
/** 境界金印：金色书法竖写两字，压在头像左上角 */
function RealmSeal({ realm }: { realm: number }) {
  const name = REALMS[realm]?.name ?? '凡人';
  return <span className="rm-seal"><b>{name.slice(0, 2)}</b></span>;
}

/** 人物小卡（树、网格、侧栏的「人脉」都用它） */
function PCard({ p, on, onPick, onHover, style, idx = 0 }: { p: RmPerson; on?: boolean; onPick: (p: RmPerson) => void; onHover?: (k: string | null) => void; style?: CSSProperties; idx?: number }) {
  const t = p.tier;
  return (
    <button className={'rm-card w-' + p.wire + (on ? ' on' : '') + (p.alive ? '' : ' gone') + (p.d?.hunting ? ' hunt' : '')} data-k={p.key}
      style={{ ['--i' as string]: idx, ...style } as CSSProperties}
      onClick={() => { click(); onPick(p); }} onPointerEnter={() => onHover?.(p.key)} onPointerLeave={() => onHover?.(null)}>
      <span className="rm-card-in">
        <span className="rm-frame"><Face p={p} /><RealmSeal realm={p.realm} />{p.d?.hunting ? <em className="rm-hunt">追</em> : null}</span>
        <span className="rm-name">{p.name}</span>
        <span className="rm-tier" style={{ color: t === '知交' ? '#c0587a' : undefined }}>{t}</span>
        <Lamps v={p.favor} />
        <span className="rm-badge" style={{ backgroundImage: `url(${badgeUrl})` }}><span>{p.badge[0]}</span>{p.badge[1] ? <span>{p.badge[1]}</span> : null}</span>
      </span>
    </button>
  );
}

// ============================================================ 亲族关系树：排版
const CW = 118, CH = 178, GAP = 14, MAXV = 5, LABEL = 28, COMB = 20;
const BH = CH + COMB + LABEL;          // 一组的高
const ROWGAP = 50;
const HERO_W = 176, HERO_H = 228;
const SIDE = HERO_W / 2 + 70;          // 组离中线多远
const GGAP = 56;                       // 同侧同一行两组之间
interface Placed { g: RmGroup; x: number; y: number; w: number; open: boolean }
function groupW(n: number, open: boolean) { const v = open ? Math.min(n, MAXV) : Math.min(n, 3); return open ? v * (CW + GAP) - GAP : 150 + 0 * v; }
function layout(groups: RmGroup[], fold: Record<string, boolean>) {
  const placed: Placed[] = [];
  const edge: Record<string, number> = {};
  for (const g of groups) {
    const open = !fold[g.k];
    const w = Math.max(groupW(g.people.length, open), 120);
    const key = g.side + g.row; const e = edge[key] ?? SIDE;
    const x = g.side === 'L' ? -e - w : e;
    edge[key] = e + w + GGAP;
    placed.push({ g, x, y: g.row * (BH + ROWGAP), w, open });
  }
  const minX = Math.min(-HERO_W / 2 - 20, ...placed.map((p) => p.x)), maxX = Math.max(HERO_W / 2 + 20, ...placed.map((p) => p.x + p.w));
  const PAD = 40;
  const ox = -minX + PAD;
  for (const p of placed) p.x += ox;
  const W = maxX - minX + PAD * 2, H = 3 * BH + 2 * ROWGAP + 10;
  const hx = ox, hy = (BH + ROWGAP) + CH + COMB / 2 - 70;   // 主角卡中心：第二行的梳线正好从卡的中下部穿过
  return { placed, W, H, hx, hy };
}
/** 一组的干线：从分组标签连到主角卡 */
function trunk(p: Placed, hx: number, hy: number) {
  const cx = p.x + p.w / 2;
  const top = hy - HERO_H / 2, bot = hy + HERO_H / 2;
  if (p.g.row === 0) { const ly = p.y + BH, bus = ly + 34; return `M${cx},${ly} V${bus} H${hx} V${top}`; }
  if (p.g.row === 2) { const ly = p.y, bus = ly - 34; return `M${cx},${ly} V${bus} H${hx} V${bot}`; }
  // 第二行：梳线高度横着连到主角卡侧边
  const cy = p.y + CH + COMB / 2;
  const inner = p.g.side === 'L' ? p.x + p.w : p.x;
  const side = p.g.side === 'L' ? hx - HERO_W / 2 : hx + HERO_W / 2;
  return `M${inner},${cy} H${side}`;
}

// ============================================================ 拖动 / 缩放
/** 字不小于原界面的缩放下限（卡上最小的字 13px × 0.85 ≈ 11px，和原界面最小的字一样） */
const READ = 0.85;
function usePanZoom(world: { W: number; H: number; hx: number; hy: number }, dep: unknown) {
  const vp = useRef<HTMLDivElement>(null);
  const [v, setV] = useState({ x: 0, y: 0, s: 1 });
  const vRef = useRef(v); vRef.current = v;
  const moved = useRef(false);
  /** 开场：整棵树放得下且字不小于原界面（缩放 ≥ READ）就全览；放不下就按 READ 的大小以主角为中心，其余拖着看。
   *  all=true：不管字大小，整棵树缩进来（⟲ 在「全览」和「看清」之间切换） */
  const fit = (all = false) => {
    const el = vp.current; if (!el) return;
    const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
    const sf = Math.max(0.3, Math.min(1, (w - 16) / world.W, (h - 12) / world.H));
    if (all || sf >= READ) { setV({ s: sf, x: (w - world.W * sf) / 2, y: Math.max(4, (h - world.H * sf) / 2) }); return; }
    const s = READ;
    setV({ s, x: Math.min(8, Math.max(w - world.W * s - 8, w / 2 - world.hx * s)), y: Math.min(6, Math.max(h - world.H * s - 6, h / 2 - world.hy * s)) });
  };
  const toggleFit = () => { const el = vp.current; if (!el) return; const sf = Math.min(1, (el.clientWidth - 16) / world.W, (el.clientHeight - 12) / world.H); fit(Math.abs(vRef.current.s - sf) > 0.02); };
  useLayoutEffect(() => { fit(); }, [world.W, world.H, dep]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = vp.current; if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit()); ro.observe(el); return () => ro.disconnect();
  }, [world.W, world.H]);   // eslint-disable-line react-hooks/exhaustive-deps
  const zoomAt = (k: number, cx?: number, cy?: number) => {
    const el = vp.current; if (!el) return;
    const o = vRef.current; const s = Math.max(0.3, Math.min(1.8, o.s * k));
    const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    setV({ s, x: px - (px - o.x) * (s / o.s), y: py - (py - o.y) * (s / o.s) });
  };
  useEffect(() => {
    const el = vp.current; if (!el) return;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; d: number; v: typeof v; cx: number; cy: number } | null = null;
    const snap = () => {
      const a = [...pts.values()]; const r = el.getBoundingClientRect();
      const cx = a.reduce((s, p) => s + p.x, 0) / a.length - r.left, cy = a.reduce((s, p) => s + p.y, 0) / a.length - r.top;
      const d = a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
      start = { x: cx, y: cy, d, v: vRef.current, cx, cy };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.rm-zoom, .rm-page')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = false; snap();
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId) || !start) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const a = [...pts.values()]; const r = el.getBoundingClientRect();
      const cx = a.reduce((s, p) => s + p.x, 0) / a.length - r.left, cy = a.reduce((s, p) => s + p.y, 0) / a.length - r.top;
      if (!moved.current && Math.hypot(cx - start.x, cy - start.y) < 6 && a.length < 2) return;
      if (!moved.current) { moved.current = true; try { el.setPointerCapture(e.pointerId); } catch { /* 无 */ } }
      const o = start.v;
      let s = o.s;
      if (a.length > 1 && start.d > 0) s = Math.max(0.3, Math.min(1.8, o.s * Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / start.d));
      setV({ s, x: cx - (start.cx - o.x) * (s / o.s), y: cy - (start.cy - o.y) * (s / o.s) });
    };
    let eatUntil = 0;
    const up = (e: PointerEvent) => { if (!pts.delete(e.pointerId)) return; if (pts.size) snap(); else { start = null; if (moved.current) eatUntil = performance.now() + 80; moved.current = false; } };
    const wheel = (e: WheelEvent) => {
      // 在一排横向卷动的卡上：横向滚轮 / Shift+滚轮照常横移，不缩放
      if ((e.target as HTMLElement).closest?.('.rm-strip-scroll') && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) return;
      e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); };
    // 拖过之后松手的那一下不算点卡片
    const clickCap = (e: MouseEvent) => { if (performance.now() < eatUntil) { e.stopPropagation(); e.preventDefault(); eatUntil = 0; } };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('click', clickCap, true);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); el.removeEventListener('click', clickCap, true); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return { vp, v, fit, toggleFit, zoomAt };
}

/** 墨线画出（每根错开）、灵气沿线流动：Web Animations 动 stroke-dashoffset */
function useInkDraw(root: React.RefObject<SVGSVGElement>, key: string, d0: number) {
  useEffect(() => {
    const svg = root.current; if (!svg || typeof (svg as any).animate !== 'function') return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anims: Animation[] = [];
    svg.querySelectorAll<SVGPathElement>('path.rm-draw').forEach((p) => {
      const i = Number(p.dataset.i ?? 0);
      if (reduce) { p.style.strokeDashoffset = '0'; return; }
      anims.push(p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 760, delay: d0 + i * 170, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'both' }));
    });
    if (!reduce) svg.querySelectorAll<SVGPathElement>('path.rm-flow').forEach((p) => {
      const dir = p.dataset.dir === '-1' ? -1 : 1;
      anims.push(p.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -60 * dir }], { duration: 2600, iterations: Infinity, easing: 'linear' }));
    });
    return () => anims.forEach((a) => a.cancel());
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
}

function TreeLegend({ cls = '' }: { cls?: string }) {
  return (
    <div className={'rm-tree-bar ' + cls}>
      <span className="rm-legend"><Lamps v={60} size={14} /> 心灯＝对方对你的好感<small>（金灯善意，熄灯恶意；游戏里只记「对方对你」这一个方向）</small></span>
      <span className="rm-legend-wires"><i className="lg gold" />亲近 <i className="lg jade" />同行 <i className="lg blood" />仇怨</span>
    </div>
  );
}

function KinTree({ game, sel, onPick, hero, late }: { game: Game; sel: string | null; onPick: (p: RmPerson) => void; hero: ReactNode; late: boolean }) {
  const groups = kinGroups(game);
  const sig = groups.map((g) => g.k + ':' + g.people.map((p) => p.key).join(',')).join('|');
  const [fold, setFold] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.filter((g) => g.people.length > 8).map((g) => [g.k, true])));
  const L = useMemo(() => layout(groups, fold), [sig, fold]);   // eslint-disable-line react-hooks/exhaustive-deps
  const { vp, v, toggleFit, zoomAt } = usePanZoom(L, JSON.stringify(fold));
  const [hot, setHot] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const lateAtMount = useRef(late);
  useInkDraw(svg, sig + JSON.stringify(fold), lateAtMount.current ? 60 : 520);
  const hotGroup = hot ? L.placed.find((p) => p.g.people.some((x) => x.key === hot) || p.g.k === hot)?.g.k : null;
  const selGroup = sel ? L.placed.find((p) => p.g.people.some((x) => x.key === sel))?.g.k : null;
  let seq = 0;
  return (
    <div className="rm-tree-wrap">
      <div className="rm-vp" ref={vp}>
        <div className="rm-world" style={{ width: L.W, height: L.H, transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` }}>
          <svg ref={svg} className="rm-wires" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`}>
            {L.placed.map((p) => {
              const d = trunk(p, L.hx, L.hy); const i = seq++;
              const lit = hotGroup === p.g.k || selGroup === p.g.k;
              return (
                <g key={p.g.k} className={'rm-wire ' + p.g.wire + (lit ? ' hot' : '')}>
                  <path className="rm-glow" d={d} />
                  <path className="rm-base rm-draw" d={d} pathLength={1} data-i={i} />
                  {p.g.wire === 'blood' ? <path className="rm-crack" d={d} /> : <path className="rm-flow" d={d} data-dir={p.g.row === 2 ? '1' : '-1'} />}
                </g>
              );
            })}
          </svg>
          {L.placed.map((p, gi) => {
            const { g } = p; const many = g.people.length > MAXV;
            const lit = hotGroup === g.k || selGroup === g.k;
            return (
              <div key={g.k} className={`rm-group r${g.row} ${g.side} w-${g.wire}` + (p.open ? '' : ' folded') + (lit ? ' hot' : '')} style={{ left: p.x, top: p.y, width: p.w, ['--gi' as string]: gi } as CSSProperties}>
                <button className="rm-glabel" title={many || !p.open ? (p.open ? '收起这一组' : '展开这一组') : undefined} onClick={() => { click(); setFold((f) => ({ ...f, [g.k]: !f[g.k] })); }}
                  onPointerEnter={() => setHot(g.k)} onPointerLeave={() => setHot(null)}>
                  {g.label}<small>{g.people.length}</small>{many || !p.open ? <i>{p.open ? '－' : '＋'}</i> : null}
                </button>
                {p.open ? (
                  <div className="rm-strip-box">
                    <div className={'rm-strip' + (many ? ' rm-strip-scroll' : '')}>
                      <div className="rm-strip-in" style={{ width: g.people.length * (CW + GAP) - GAP }}>
                        {g.people.map((x, i) => <PCard key={x.key} p={x} idx={gi * 2 + i} on={sel === x.key} onPick={onPick} onHover={setHot} />)}
                      </div>
                    </div>
                    {many && <>
                      <button className="rm-page l" aria-label="往左翻" onClick={(e) => { click(); (e.currentTarget.parentElement!.querySelector('.rm-strip-scroll') as HTMLElement).scrollBy({ left: -2 * (CW + GAP), behavior: 'smooth' }); }}>‹</button>
                      <button className="rm-page r" aria-label="往右翻" onClick={(e) => { click(); (e.currentTarget.parentElement!.querySelector('.rm-strip-scroll') as HTMLElement).scrollBy({ left: 2 * (CW + GAP), behavior: 'smooth' }); }}>›</button>
                    </>}
                  </div>
                ) : (
                  <button className="rm-stack" onClick={() => { click(); setFold((f) => ({ ...f, [g.k]: false })); }}>
                    {g.people.slice(0, 3).map((x, i) => <span key={x.key} style={{ ['--j' as string]: i } as CSSProperties}><Face p={x} /></span>)}
                    <b>{g.people.length} 人 · 点开</b>
                  </button>
                )}
              </div>
            );
          })}
          <div className="rm-hero" style={{ left: L.hx - HERO_W / 2, top: L.hy - HERO_H / 2, width: HERO_W, height: HERO_H }}>{hero}</div>
          {groups.length === 0 && <div className="rm-empty" style={{ left: L.hx + HERO_W / 2 + 30, top: L.hy - 60 }}>尚无师承、伴侣、结义、门徒。<br />与人论道、赠礼、并肩御敌，好感够了便可拜师、结拜、收徒；友人录里的缘分走到头，也会在这里落一笔。</div>}
        </div>
        <TreeLegend cls="in-tree" />
        <div className="rm-zoom">
          <button onClick={() => { click(); zoomAt(1.2); }} aria-label="放大">＋</button>
          <button onClick={() => { click(); zoomAt(1 / 1.2); }} aria-label="缩小">－</button>
          <button onClick={() => { click(); toggleFit(); }} title="全览 / 看清" aria-label="全览或看清">⟲</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================ 人际关系：卡片网格
function Circle({ game, sel, onPick }: { game: Game; sel: string | null; onPick: (p: RmPerson) => void }) {
  const R = game.rel;
  const [filter, setFilter] = useState<'all' | 'friend' | 'foe'>('all');
  const [more, setMore] = useState<Record<string, boolean>>({});
  const known = R.known();
  const people = known.filter((d) => d.alive && !d.beauty).map((d) => personOf(game, d));
  // 友人录里相识的知交（伴侣归「生死之交」）
  for (const b of BEAUTIES) {
    const s = game.ws.hearts[b.id]; if (!s?.met || s.flags?.parted) continue;
    const d = game.npcs.byId.get('b_' + b.id); if (d && !d.alive) continue;
    people.push(beautyPerson(game, b, !!s.flags?.companion));
  }
  const isFoe = (p: RmPerson) => p.tier === '厌恶' || p.tier === '仇人' || p.tier === '死敌' || !!p.d?.hunting;
  const nf = people.filter((p) => !isFoe(p)).length, nfoe = people.length - nf;
  // 作者 v0.8：故人按亲友 / 仇敌分开，各自排在最末（亲友只列已故亲友，仇敌只列已故仇敌）
  const deadFriendAll = known.filter((d) => !d.alive && !d.grudge && d.favor > -15 && !d.beauty).sort((a, b) => (+!!b.bond - +!!a.bond) || b.favor - a.favor);
  const deadFoeAll = known.filter((d) => !d.alive && (d.grudge || d.favor <= -15)).sort((a, b) => (b.grudge ?? 0) - (a.grudge ?? 0) || a.favor - b.favor);
  const goneSecs = ([['friend', '已故亲友', deadFriendAll], ['foe', '已故仇敌', deadFoeAll]] as const).filter(([k, , l]) => l.length && (filter === 'all' || filter === k));
  const show = people.filter((p) => filter === 'all' || (filter === 'foe') === isFoe(p));
  let ci = 0;
  return (
    <div className="rm-circle">
      <div className="rm-chips">
        {([['all', `全部 ${people.length}`], ['friend', `亲友 ${nf}`], ['foe', `仇敌 ${nfoe}`]] as const).map(([k, t]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => { click(); setFilter(k); }}>{t}</button>)}
        <span className="rm-chips-tip">由近及远：生死之交 → 同行 → 挚友、知交、好友、相识 → 嫌隙 → 仇人、死敌</span>
      </div>
      <div className="rm-circle-scroll">
        {show.length === 0 && <div className="hint">{filter === 'foe' ? '眼下没有仇家——愿你一直这样走下去。' : '尚无相熟之人。与人交谈、赠礼、论道、并肩御敌，都能结下交情。'}</div>}
        {NEAR.map((sec) => {
          const list = show.filter((p) => sec.tiers.includes(p.tier)).sort((a, b) => (sec.k === 'sidi' || sec.k === 'chou' || sec.k === 'yanwu' ? (+!!b.d?.hunting - +!!a.d?.hunting) || a.favor - b.favor : b.favor - a.favor));
          if (!list.length) return null;
          const cap = more[sec.k] ? list.length : 24;
          return (
            <section key={sec.k} className={'rm-sec s-' + sec.k}>
              <div className="rm-sec-h"><b>{sec.label}</b><small>{list.length} 人</small><i /></div>
              <div className="rm-grid">
                {list.slice(0, cap).map((p) => <PCard key={p.key} p={p} idx={Math.min(ci++, 24)} on={sel === p.key} onPick={onPick} />)}
                {list.length > cap && <button className="rm-more" onClick={() => { click(); setMore((m) => ({ ...m, [sec.k]: true })); }}>还有 {list.length - cap} 人<br />展开</button>}
              </div>
            </section>
          );
        })}
        {goneSecs.map(([k, label, all]) => (
          <section key={'gone-' + k} className="rm-sec s-gone">
            <div className="rm-sec-h"><b>{label}</b><small>{all.length} 人</small><i /></div>
            <div className="rm-gone-list">{all.slice(0, 20).map((d) => <span key={d.id} className="rel-gone" style={k === 'foe' ? { color: '#a8352a' } : undefined}>{d.name}<small>{d.deathNote ?? '已故'}{d.grudge ? '　（与你有仇）' : d.bond ? '　（有羁绊）' : ''}</small></span>)}{all.length > 20 && <span className="hint">另有 {all.length - 20} 位未列出。</span>}</div>
          </section>
        ))}
        <div className="hint" style={{ marginTop: 10, opacity: 0.78, lineHeight: 1.7 }}>人脉录只记「相识之人」——交谈过、有恩怨或有羁绊的才入册（天下共 {game.npcs.list.length} 人）。</div>
      </div>
    </div>
  );
}

// ============================================================ 详情侧栏（操作复用友人录 / 恩怨 / 结义的现有逻辑）
function Detail({ game, p, onClose, onPick, re, goFeud }: { game: Game; p: RmPerson; onClose: () => void; onPick: (id: string) => void; re: () => void; goFeud: () => void }) {
  const R = game.rel, F = game.friends, d = p.d;
  const [msg, setMsg] = useState('');
  const [sure, setSure] = useState(false);
  useEffect(() => { setMsg(''); setSure(false); }, [p.key]);
  const sectN = d?.sect ? LOC_BY_ID.get(d.sect)?.name : '';
  const t = p.tier;
  const ties = d ? R.tiesText(d) : [];
  const act = d ? game.npcs.activeOf(d.id) : undefined;
  const inParty = act?.act === 'follow';
  // 解除关系：复用对话里的「割袍断义 / 叛出师门 / 逐出师门」那一条（relations.talkOpts）
  const sever = d && (d.bond === 'sworn' || d.bond === 'master' || d.bond === 'disciple') ? R.talkOpts({ d, look: (game.npcs as any).look?.(d), bubble: null }, d.name, () => null as any).find((o) => o.tone === 'bad' && /断义|师门/.test(o.label)) : undefined;
  const say = (s: string) => { setMsg(s); re(); };
  return (
    <aside className="rm-detail" onPointerDown={(e) => e.stopPropagation()}>
      <button className="rm-detail-x" onClick={() => { click(); onClose(); }} aria-label="收起">×</button>
      <div className="rm-d-top">
        <div className="rm-d-face"><Face p={p} big /><RealmSeal realm={p.realm} /></div>
        <div className="rm-d-id">
          <div className="rm-d-name">{p.name}<small>{p.b ? p.b.title : d?.title ?? ''}</small></div>
          <div className="rm-d-sub">{p.realm ? realmName(p.realm, p.stage) : '凡人'} · {p.b ? (sectTitle(p.b.home) || '知交') : (sectN || FACTION_NAME[d!.faction])}{d ? <> · {PERS_NAME[d.pers]}</> : null} · <b style={{ color: t === '知交' ? '#c0587a' : REL_COLOR[t as Tier] }}>{t}</b></div>
          <div className="rm-d-favor"><Lamps v={p.favor} size={18} /><span>好感 {Math.round(p.favor)}</span></div>
          <ScaleBar className="favor-bar" value={(p.favor + 100) / 200} color={p.favor >= 0 ? '#b8892e' : '#8a2418'} />
        </div>
      </div>
      {d?.bond && <div className="rel-bond">◈ {BOND_TEXT[d.bond]}{d.bondUntil && (d.bond === 'companion' || d.bond === 'guard') ? `（余 ${Math.max(0, Math.ceil(d.bondUntil - game.day))} 日）` : ''}</div>}
      {p.b && <div className="rel-bond">◈ {t === '伴侣' ? '伴侣同心' : '知交'} · {p.b.bonus.text}</div>}
      {d?.why && ((d.grudge ?? 0) > 0 || d.hunting) && <div className="rel-why">✕ {(d.grudge ?? 0) >= 2 ? '血仇' : d.hunting ? '追杀' : '旧怨'}：{d.why}</div>}
      {d?.vow && <div className="rel-bond">◈ 已对你立下心魔誓，此生不与你为敌</div>}
      {d?.oath && <div className="rel-why">◈ 你曾对此人立誓：若伤其或其亲族，心魔反噬</div>}
      <div className="rm-d-acts">
        {p.b && <button className="ink-btn small jade" onClick={() => { audio.sfx('open'); game.onPanel?.('friends'); }}>打开友人录</button>}
        {d && !p.b && inParty && <>
          <button className="ink-btn small ghost" onClick={() => { click(); F.setWait(d, !F.isWaiting(d)); say(F.isWaiting(d) ? `${d.name}：「我在此等你。」` : `${d.name}跟了上来。`); }}>{F.isWaiting(d) ? '跟上' : '原地等候'}</button>
          <button className="ink-btn small ghost" onClick={() => { click(); F.dismiss(d); say(`${d.name}离队了。`); }}>散去</button>
        </>}
        {d && !p.b && !inParty && d.alive && !(d.grudge > 0) && F.friends().includes(d) && <button className="ink-btn small jade" disabled={F.partyFull()} onClick={() => { click(); say(F.invite(d)); }}>{F.where(d) === '就在附近' ? '邀其同行' : '传音相邀'}</button>}
        {d && (d.grudge ?? 0) > 0 && <button className="ink-btn small" title="赔礼、退还、托人说和、请宗门长辈、立心魔誓、约生死斗" onClick={() => { click(); game.openDialog(game.enyuan.reconcileNode(d)); }}>化解</button>}
        {d && ((d.grudge ?? 0) > 0 || d.hunting) && <button className="ink-btn small ghost" onClick={() => { click(); goFeud(); }}>看恩怨</button>}
        {d && !p.b && <span className="rm-d-where">{F.where(d)}</span>}
      </div>
      {msg && <div className="rm-d-msg">{msg}</div>}
      {d && <LifeCard game={game} d={d} />}
      {d && (
        <div className="rel-ties">
          <div className="hd-lt-title">{p.name}的人脉（{ties.length}）{ties.some((x) => x.k !== 'foe') ? <small>　杀了{d.sex === 'f' ? '她' : '他'}，这些人会记恨你</small> : null}</div>
          {ties.length === 0 && <div className="hint">孑然一身。</div>}
          {ties.map(({ o, r, k }) => { const ot = R.tier(o) as Tier; return (
            <button key={o.id} className={'rel-tie ' + k + (o.alive ? '' : ' gone')} onClick={() => { if (R.known().includes(o)) { click(); onPick(o.id); } }}>
              <span className="rt-r">{r}</span><b>{o.name}</b>
              <small>{!o.alive ? '已故' : o.met || o.grudge ? ot : '未曾谋面'}</small>
            </button>
          ); })}
        </div>
      )}
      {p.b && <div className="hd-intro rm-d-intro">{p.b.intro}</div>}
      {sever && (
        <div className="rm-d-sever">
          <button className={'rm-sever' + (sure ? ' sure' : '')} onClick={() => {
            if (!sure) { click(); setSure(true); return; }
            audio.sfx('fail'); const n = sever.act(); setSure(false);
            say(n && typeof n === 'object' && 'text' in n ? `${p.name}：${(n as any).text}` : '关系已解除。');
          }}>{sure ? `确定${sever.label}？再点一次` : `解除关系 · ${sever.label}`}</button>
        </div>
      )}
    </aside>
  );
}

// ============================================================ 宗门 / 记事（原样搬来）
function SectsPage({ game }: { game: Game }) {
  const R = game.rel, S = R.S;
  const [openSect, setOpenSect] = useState<string | null>(null);
  const sectIds = new Set<string>(Object.keys(S.sect));
  for (const d of game.npcs.list) if (d.sect && LOC_BY_ID.get(d.sect)) sectIds.add(d.sect);
  for (const sd of SECT_DEFS) if (LOC_BY_ID.get(sd.id)) sectIds.add(sd.id);
  const groupOf = (id: string) => allyGroup(id)?.name ?? '';
  const sects = [...sectIds].map((id) => [id, S.sect[id] ?? 0] as [string, number])
    .sort((a, b) => (SECT_ALLY.findIndex((g) => g.ids.includes(a[0])) + 1 || 99) - (SECT_ALLY.findIndex((g) => g.ids.includes(b[0])) + 1 || 99) || a[1] - b[1]);
  const mySect = game.ws.sect?.id;
  return (
    <div className="rel-sects rm-page-scroll">
      <div className="hint">宗门声望由你对其门人的所作所为累积。跌破 {SECT_HOSTILE}，门人见你便动手；跌破 {SECT_SIEGE}，执法堂派人围剿；跌破 {SECT_ELDER}，门中长老亲自出手。杀一派门人，同盟诸派也记一半的账。点宗门名可展开名册。</div>
      {sects.map(([id, v], i) => {
        const mem = game.npcs.list.filter((d) => d.sect === id);
        const alive = mem.filter((d) => d.alive), namedAll = mem.filter((d) => d.canon).sort((a, b) => b.realm - a.realm || b.stage - a.stage);
        // 掌门/长老/执事已在上面 leaders 里列过，留名人物列表里不再重复同一人
        const leaders = SECT_DEF.has(id) ? game.roster.leaders(id) : [];
        const leadNames = new Set(leaders.map((m) => m.name));
        const named = namedAll.filter((d) => !leadNames.has(d.name));   // 留名人物（已剔除管理层同名）
        const aliveLeaders = leaders.filter((m) => !m.dead);            // 上方只放活着的管理层
        const deadLeaders = leaders.filter((m) => m.dead);              // 已故管理层 → 下方
        const aliveNamed = named.filter((d) => d.alive);
        const deadNamed = named.filter((d) => !d.alive);
        const deadCount = deadLeaders.length + deadNamed.length;
        const kills = S.killed?.[id] ?? 0, grp = groupOf(id), prevGrp = i ? groupOf(sects[i - 1][0]) : null;
        const top = alive.reduce((m, d) => Math.max(m, d.realm), 0);
        return (
          <div key={id}>
            {grp !== prevGrp && <div className={'sec-title' + (i ? ' rel-gap' : ' rel-first')}>{grp || '其余宗门'}</div>}
            <div className="rel-sect rel-click" role="button" onClick={() => { click(); setOpenSect(openSect === id ? null : id); }}>
              <b>{openSect === id ? '▾ ' : '▸ '}{sectTitle(id)}{SECT_DEF.has(id) ? <small className="rel-n">　{game.roster.aliveCount(id)}人</small> : null}{id === mySect ? <small>（本门）</small> : null}</b>
              <ScaleBar className="favor-bar" value={(v + 100) / 200} color={v >= 0 ? '#3f9a5a' : '#b8302a'} />
              <span className={'rel-stand ' + (v <= SECT_SIEGE ? 'siege' : v <= SECT_HOSTILE ? 'hostile' : v >= 30 ? 'friend' : 'calm')}>{v <= SECT_ELDER ? '长老出手' : v <= SECT_SIEGE ? '围剿' : v <= SECT_HOSTILE ? '敌视' : v <= -15 ? '冷淡' : v >= 30 ? '友善' : '中立'} {Math.round(v)}</span>
            </div>
            {openSect === id && (
              <div className="rel-roster">
                {SECT_DEF.has(id) ? (() => {
                  const def = SECT_DEF.get(id)!;
                  const sm = game.roster.summary(id);
                  // 留名人物坐的槽位 -> 该槽位的品级
                  const seatRank = new Map<string, Rank>();
                  for (let si = 0; si < def.n; si++) {
                    const c = game.roster.canonAt(id, si);
                    if (c) seatRank.set(c, rankOf(def, si));
                  }
                  const rk = (r: Rank) => RANKS.indexOf(r);
                  const score = (realm: number, stage: number) => realm * 13 + stage;
                  type RowT = { k: string; name: string; rank: Rank; realmText: string; right: string; rightColor?: string; s: number };
                  const aliveRows: RowT[] = [
                    ...aliveLeaders.map((m) => ({ k: 'L' + m.i, name: m.name, rank: m.rank as Rank, realmText: m.realmText, right: '', s: score(m.realm, m.stage) })),
                    ...aliveNamed.map((d) => {
                      const t = R.tier(d) as Tier;
                      return { k: d.id, name: d.name, rank: (seatRank.get(d.id) ?? '内门') as Rank, realmText: d.realm ? realmName(d.realm, d.stage) : '凡人', right: d.met ? t : '未曾谋面', rightColor: REL_COLOR[t], s: score(d.realm, d.stage) };
                    }),
                  ].sort((a, b) => rk(a.rank) - rk(b.rank) || b.s - a.s);
                  const deadRows: RowT[] = [
                    ...deadLeaders.map((m) => ({ k: 'L' + m.i, name: m.name, rank: m.rank as Rank, realmText: m.realmText, right: '已故', s: score(m.realm, m.stage) })),
                    ...deadNamed.map((d) => ({ k: d.id, name: d.name, rank: (seatRank.get(d.id) ?? '内门') as Rank, realmText: d.realm ? realmName(d.realm, d.stage) : '凡人', right: '已故', s: score(d.realm, d.stage) })),
                  ].sort((a, b) => rk(a.rank) - rk(b.rank) || b.s - a.s);
                  // 高层空缺（掌门 / 太上长老 / 长老 / 执事）单独标出来
                  const vacant = (['掌门', '太上长老', '长老', '执事'] as Rank[]).filter((r) => sm[r].alive === 0);
                  const line = (r: RowT, dim = false) => (
                    <div key={r.k} className={'rel-mem' + (dim ? ' dead' : '')}>
                      <b className="c-name">{r.name}</b>
                      <small className="c-rank">{r.rank}</small>
                      <span className="c-realm">{r.realmText}</span>
                      <span className="c-tier" style={r.rightColor ? { color: r.rightColor } : undefined}>{r.right}</span>
                    </div>
                  );
                  return (<>
                    <div>{SCALE_NAME[scaleOf(id, SECT_DEF.get(id)!.n)]}（上限 {SCALE_CAP[scaleOf(id, SECT_DEF.get(id)!.n)]}）　名册 {game.roster.aliveCount(id)} / {SECT_DEF.get(id)!.n} 人　·　{RANKS.filter((r) => sm[r].n).map((r) => `${r} ${sm[r].alive}`).join(' · ')}{kills ? <b className="rel-red">　·　死于你手 {kills} 人</b> : null}</div>
                    {aliveRows.map((r) => line(r))}
                    {vacant.map((r) => (
                      <div key={'v' + r} className="rel-mem dead">
                        <b className="c-name">—</b>
                        <small className="c-rank">{r} · 空缺</small>
                        <span className="c-realm" />
                        <span className="c-dim">待继任</span>
                      </div>
                    ))}
                    {deadRows.length > 0 && (
                      <>
                        <div className="sec-title" style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>已故 {deadRows.length} 人</div>
                        {deadRows.map((r) => line(r, true))}
                      </>
                    )}
                  </>);
                })() : <div>门人在册 {alive.length} 人{top ? `（最高 ${REALMS[top].name}）` : ''}{mem.length - alive.length ? `　·　已故 ${mem.length - alive.length}` : ''}{kills ? <b className="rel-red">　·　死于你手 {kills} 人</b> : null}</div>}
                {!SECT_DEF.has(id) && named.map((d) => { const t = R.tier(d) as Tier; return (
                  <div key={d.id} className={'rel-mem' + (d.alive ? '' : ' dead')}>
                    <b className="c-name">{d.name}</b><small className="c-rank">{d.title ?? ''}</small>
                    <span className="c-realm">{d.realm ? realmName(d.realm, d.stage) : '凡人'}</span>
                    <span className="c-tier" style={d.alive ? { color: REL_COLOR[t] } : undefined}>{d.alive ? (d.met ? t : '未曾谋面') : '已故'}</span>
                  </div>
                ); })}
                {!named.length && !SECT_DEF.has(id) && <div className="hint">名册上多是无名弟子。</div>}
              </div>
            )}
          </div>
        );
      })}
      {S.wanted.length > 0 && <><div className="sec-title rel-gap">悬赏榜</div>{S.wanted.map((w, i) => <div key={i} className="rel-wanted"><b>{w.amount} 灵石</b>　{w.name}悬赏：{w.reason}<small>第{Math.floor(w.day / 360) + 1}年</small></div>)}</>}
    </div>
  );
}

// ============================================================ 外壳
type Tab = 'kin' | 'circle' | 'feud' | 'sect' | 'log' | 'world';
const NAV: { k: Tab; glyph: string; label: string }[] = [
  { k: 'kin', glyph: '亲', label: '亲族关系' },
  { k: 'circle', glyph: '交', label: '人际关系' },
  { k: 'feud', glyph: '怨', label: '恩怨' },
  { k: 'sect', glyph: '宗', label: '宗门' },
  { k: 'log', glyph: '记', label: '记事' },
  { k: 'world', glyph: '天', label: '天下事' },
];

export function RenmaiPanel({ game }: { game: Game }) {
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const touch = useTouch();
  const R = game.rel, S = R.S;
  const [tab, setTab] = useState<Tab>('kin');
  // 卷轴展开完（约 1.2 秒）之后再切页：卡片、墨线不用再等卷轴，立刻落位
  const [late, setLate] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setLate(true), 1300); return () => window.clearTimeout(t); }, []);
  const [selKey, setSelKey] = useState<string | null>(null);
  const known = R.known();
  const friendsN = known.filter((d) => d.alive && !d.grudge && d.favor > -15 && !d.beauty).length;
  const foesN = known.filter((d) => d.alive && (d.grudge || d.favor <= -15 || d.hunting)).length;
  const huntN = R.hunters().filter((d) => d.hunting).length;
  const hot = R.feud.topMarks() >= 3;
  // 选中的人（NPC id 或 b_知交）
  const selP: RmPerson | null = (() => {
    if (!selKey) return null;
    if (selKey.startsWith('b_')) { const b = BEAUTIES.find((x) => 'b_' + x.id === selKey); if (b && game.ws.hearts[b.id]?.met) return beautyPerson(game, b, !!game.ws.hearts[b.id]?.flags?.companion); }
    const d = game.npcs.byId.get(selKey); return d ? personOf(game, d) : null;
  })();
  const pick = (p: RmPerson) => setSelKey((k) => (k === p.key ? null : p.key));
  const go = (k: Tab) => { if (k === tab) return; click(); setTab(k); setSelKey(null); };
  const h = game.hero, hs = game.ws.sect;
  const heroCard = (
    <div className="rm-hero-in">
      <span className="rm-hero-frame"><Face p={{ portrait: './art/hanli.webp', sex: 'm' }} big /><RealmSeal realm={h.realm} /></span>
      <b className="rm-hero-name" style={{ backgroundImage: `url(${goldUrl})` }}>{(h as any).name || '苏寒'}</b>
      <small>{realmName(h.realm, h.stage)}{hs ? ` · ${sectTitle(hs.id)}` : ' · 散修'}</small>
    </div>
  );
  const sub = <span>声望 {repName(game.ws.rep)}（{game.ws.rep}）　·　亲友 {friendsN}　·　仇敌 {foesN}{huntN ? <b className="rel-alarm">　·　{huntN} 人正在追杀你</b> : null}{R.wantedTotal() ? <b className="rel-red">　·　悬赏 {R.wantedTotal()} 灵石</b> : null}</span>;
  return (
    <LacquerModal title="人脉录" onClose={() => game.closeModal()} maskClass="modal-mask rm-mask" closeClass="close-btn"
      className={'scroll-panel lqp cult-panel wide rel-panel rm-scroll' + (touch ? ' rm-touch' : '')} width={1520} height={880}>
      <img className="rm-rod l" src={rodUrl} alt="" draggable={false} />
      <img className="rm-rod r" src={rodUrl} alt="" draggable={false} />
      <div className="rm-paper" style={{ backgroundImage: `url(${paperUrl})` }} />
      <div className="lq-head panel-head lqp-head rm-head">
        <div className="panel-title lqp-title">人脉录</div>
        <div className="panel-sub lqp-sub">{sub}</div>
      </div>
      <div className="rm-body">
        <nav className="rm-nav tabs" role="tablist">
          {NAV.map((n, i) => {
            const badge = n.k === 'circle' && huntN ? '追' : n.k === 'feud' && hot ? '血' : '';
            const on = tab === n.k;
            return (
              <button key={n.k} role="tab" aria-selected={on} className={'rm-medal' + (on ? ' on' : '') + (i === 2 ? ' gap' : '')} onClick={() => go(n.k)} style={{ ['--i' as string]: i } as CSSProperties}>
                <span className="rm-medal-disc" style={{ backgroundImage: `url(${medalUrl})` }}><b>{n.glyph}</b></span>
                <span className="rm-medal-label">{n.label}{n.k === 'circle' ? ` ${friendsN + foesN}` : ''}</span>
                {badge && <sup>{badge}</sup>}
              </button>
            );
          })}
        </nav>
        <main className={'rm-main t-' + tab + (selP ? ' has-detail' : '') + (late ? ' late' : '')}>
          {tab === 'kin' && <KinTree game={game} sel={selKey} onPick={pick} hero={heroCard} late={late} />}
          {tab === 'circle' && <Circle game={game} sel={selKey} onPick={pick} />}
          {tab === 'feud' && <div className="rm-page-scroll rm-feud"><FeudPage game={game} onPick={(id) => { click(); setSelKey(id); }} /></div>}
          {tab === 'sect' && <SectsPage game={game} />}
          {tab === 'log' && (
            <div className="rel-log rm-page-scroll">
              {S.log.length === 0 && <div className="hint">江湖平静。</div>}
              {S.log.slice().reverse().map((l, i) => <div key={i} className={'news ' + (l.kind === 'bad' ? 'canon' : l.kind === 'good' ? 'personal' : '')}><span>第{Math.floor(l.day / 360) + 1}年{Math.floor((l.day % 360) / 30) + 1}月</span>{l.text}</div>)}
            </div>
          )}
          {tab === 'world' && <div className="rm-page-scroll"><WorldChronicle game={game} /></div>}
          {selP && <Detail key={selP.key} game={game} p={selP} onClose={() => setSelKey(null)} onPick={(id) => setSelKey(id)} re={re} goFeud={() => { setTab('feud'); }} />}
        </main>
      </div>
      <div className="hint rel-foot rm-foot">{tab === 'kin' ? <TreeLegend /> : null}与仇人狭路相逢时可赔礼、立誓或请人说和；把人打到半死，对方可能求饶。<button className="lq-btn lq-btn-pill rel-refresh" onClick={() => { click(); re(); }}>↻ 刷新</button></div>
    </LacquerModal>
  );
}
