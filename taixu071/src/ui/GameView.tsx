import { SenseGuidance } from './SenseGuidance';
import { CharacterPortrait } from './CharacterPortrait';
import { equipmentAppearance } from '../gfx/equipmentAppearance';
import { ModalLayer } from './ModalLayer';
import { ModHuds } from './ModUi';
import { modx } from '../mod/hooks';
import { spriteJobs } from '../gfx/spriteJobs';
import { sprites } from '../gfx/sprites';
import { prof } from '../core/prof';
import { TUNING } from '../data/tuning';
import { mapJoystickVector, JOY_RUN_MAG } from '../core/joystick';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import type { Game, UIState } from '../world/game';
import { audio } from '../world/audio';
import { MsgStrip } from './MsgStrip';
import { realmDef as getRealmDef, realmName } from '../data/realms';
import { MAP_NAME, MapId, ACTIVE_MAP, ACTIVE_WORLD, LOCATIONS, LOC_BY_ID, WORLD_SCALE, LOC_TYPE_NAME } from '../data/world';
import { worldCurrencyName } from '../data/worldHierarchy';
import { isHeroVisible, isLocTypeVisible, isMarkVisible, mapFilterRev, onMapFilterChange } from './mapFilter';
import { SECT_RANKS } from '../world/worldstate';

/** 宗门差事的种类名（SectTask.kind） */
const TASK_KIND_NAME: Record<string, string> = { kill: '猎杀', gather: '采集', deliver: '护送', patrol: '巡查' };
import { dirName } from '../world/sites';
import { SettingsPanel, WorldMapPanel, makeFogCanvas, SEAL, SEAL_COLOR, loadAudio } from './Panels';
import { bindOf, keyLabel } from '../core/keymap';
import { Hotbar, SkillPanel } from './CombatUI';
import { ZhenfaPanel } from './ZhenfaPanel';
import { FriendsPanel } from './FriendsPanel';
import { RealmHUD } from './RealmHUD';
import { CharPanel, BagPanel, AlchemyPanel, SecludePanel, HigherPlanePanel, SavePanel, DeathScreen } from './CultPanels';
import { GainOverlay } from './GainOverlay';
import { PursuitHUD } from './PursuitHUD';
import { SectBattleHUD } from './SectBattleHUD';
import { BossHUD } from './BossHUD';
import { WardrobePanel } from './Wardrobe';
import { CloudPanel } from './CloudPanel';
import { CaveScene } from './CaveScene';
import { IS_TOUCH as isTouch } from '../core/touch';

const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function cnNum(n: number): string {
  if (n <= 10) return CN[n];
  if (n < 20) return '十' + CN[n - 10];
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  return String(n);
}
const MONTH = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const SEASON_COLOR: Record<string, string> = { 春: '#6f9a5a', 夏: '#3f7f6f', 秋: '#b8803a', 冬: '#6a7f96' };

function useUI(game: Game): UIState {
  return useSyncExternalStore((f) => game.subscribe(f), () => game.ui, () => game.ui);
}
function useSlowUI(game: Game, ticks = 3) {
  const [, f] = useState(0);
  useEffect(() => {
    let n = 0;
    return game.subscribe(() => {
      if (++n >= ticks) { n = 0; f((x) => x + 1); }
    });
  }, [game, ticks]);
}
function useToasts(game: Game) {
  return useSyncExternalStore((f) => game.subscribeToasts(f), () => game.toasts, () => game.toasts);
}

// ---------- 小地图 ----------
// 第二十步：可缩放（滚轮 / ＋－ 按钮，记住档位），放大时用局部高清底图（分帧生成、缓存），
// 地名按重要程度排序、互不重叠：城 > 宗 > 镇 > 岛 > 险地 / 秘境 > 小村小洞；放大后显示地名。
const MM_SPANS = [150, 90, 52, 30, 15, 10];   // 每档显示的宏观单位跨度（1 单位 = 300 世界像素）；最大档 150/10 = 15 倍放大
const MM_KEY = 'fanren.minimapZoom';
const LOC_RANK: Record<string, number> = { city: 0, sect: 1, town: 2, isle: 3, danger: 4, secret: 4 };
const locRank = (l: (typeof LOCATIONS)[number]) => (l.minor ? 10 : 0) + (l.major ? -0.5 : 0) + (LOC_RANK[l.type] ?? 5);
interface MMTile { cv: HTMLCanvasElement; scale: number; T: number; tx: number; ty: number; used: number }
function Minimap({ game, onOpen }: { game: Game; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [zi, setZi] = useState(() => { const raw = localStorage.getItem(MM_KEY); const v = raw === null ? NaN : Number(raw); return Number.isFinite(v) && v >= 0 && v < MM_SPANS.length ? v : 1; });
  const ziRef = useRef(zi); ziRef.current = zi;
  const zoomBy = (d: number) => setZi((z) => { const n = Math.max(0, Math.min(MM_SPANS.length - 1, z + d)); try { localStorage.setItem(MM_KEY, String(n)); } catch { /* */ } return n; });
  useEffect(() => {
    const cv = ref.current!; const g = cv.getContext('2d')!;
    const fogCv = document.createElement('canvas');
    let span = MM_SPANS[ziRef.current];
    const tiles = new Map<string, MMTile>(); let frame = 0; let lastDraw = 0;
    const sorted = [...LOCATIONS].sort((a, b) => locRank(a) - locRank(b));
    // 高清底图块（缓存，使用真分辨率地形采样）
    const tileFor = (tx: number, ty: number, scale: number, T: number) => {
      const key = `${tx},${ty},${scale}`;
      let t = tiles.get(key);
      if (!t) {
        const c = document.createElement('canvas'); c.width = c.height = T * scale;
        t = { cv: c, scale, T, tx, ty, used: frame };
        const tg = c.getContext('2d')!;
        if (game.terrain?.overviewRows) {
          const img = tg.createImageData(c.width, c.height);
          game.terrain.overviewRows(img, tx * T, ty * T, scale, 0, c.height);
          tg.putImageData(img, 0, 0);
        } else {
          tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
          const base = game.terrain.overviewBase ?? game.overview;
          const ovS = base.width / game.terrain.W;
          tg.drawImage(base, (tx * T - 1) * ovS, (ty * T - 1) * ovS, (T + 2) * ovS, (T + 2) * ovS, -scale, -scale, (T + 2) * scale, (T + 2) * scale);
        }
        game.terrain.overviewVectors(tg, tx * T, ty * T, T * scale, T * scale, scale);
        tiles.set(key, t);
        if (tiles.size > 96) { // 丢掉最久没用的
          let old: string | null = null, ou = Infinity; for (const [k2, v] of tiles) if (v.used < ou && v !== t) { ou = v.used; old = k2; }
          if (old) { const ev = tiles.get(old); if (ev) ev.cv.width = ev.cv.height = 0; tiles.delete(old); }
        }
      }
      t.used = frame; return t;
    };
    // 第三十八步：静态层缓存——底图、高清图块、迷雾、地名印章（含中文描边字）只在缩放 / 迷雾变化、
    // 或玩家移出 20% 范围时重画；每次刷新只贴图 + 画会动的标记。以前每秒 8 次整套重画（字最贵）。
    const stCv = document.createElement('canvas'); let stKey = '', stX = 0, stY = 0, stT = 0;
    const paintStatic = (SPAN: number, mx: number, my: number, dpr: number, k: number) => {
      const cv = stCv, g = stCv.getContext('2d')!, c = stCv.width / 2;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = '#d9cdb0'; g.fillRect(0, 0, cv.width, cv.height);
        g.imageSmoothingEnabled = true;
        const ovS = game.overview.width / game.terrain.W;
        g.drawImage(game.overview, (mx - SPAN / 2) * ovS, (my - SPAN / 2) * ovS, SPAN * ovS, SPAN * ovS, 0, 0, cv.width, cv.height);
        // 放大后：局部高清底图覆盖在缩略图上
        const ppu = k / dpr;   // 每单位 CSS 像素
        if (ppu > 2.4 && game.terrain?.overviewVectors) {
          const scale = ppu > 4.2 ? 6 : 4, T = scale === 6 ? 24 : 32;
          const tx0 = Math.floor((mx - SPAN / 2) / T), tx1 = Math.floor((mx + SPAN / 2) / T);
          const ty0 = Math.floor((my - SPAN / 2) / T), ty1 = Math.floor((my + SPAN / 2) / T);
          const need = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
          // 视野里要贴的图块太多（放大到 3 倍以上时常见）→ 这一档不再烤高清块，
          // 直接用缩略底图，避免每帧都在生成/淘汰图块而看起来"一直加载地块"
          if (need > 120) {
            g.imageSmoothingEnabled = true;
          } else
          for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
            if (tx < 0 || ty < 0 || tx * T >= game.terrain.W || ty * T >= game.terrain.H) continue;
            const t = tileFor(tx, ty, scale, T);
            g.drawImage(t.cv, (tx * T - mx) * k + c - 0.5, (ty * T - my) * k + c - 0.5, T * k + 1, T * k + 1);
          }
        }
        const fogS = fogCv.width / game.terrain.W;
        g.drawImage(fogCv, (mx - SPAN / 2) * fogS, (my - SPAN / 2) * fogS, SPAN * fogS, SPAN * fogS, 0, 0, cv.width, cv.height);
        // 地名：按重要程度依次放，互不重叠
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const boxes: number[] = [];
        const free = (x0: number, y0: number, x1: number, y1: number) => { for (let i = 0; i < boxes.length; i += 4) if (x0 < boxes[i + 2] && x1 > boxes[i] && y0 < boxes[i + 3] && y1 > boxes[i + 1]) return false; return true; };
        const zoomed = ppu > 2.4, close = ppu > 4.2;
        const R0 = (ppu < 1.6 ? 3.6 : ppu < 2.4 ? 4.3 : ppu < 4.2 ? 5 : 5.6) * dpr;
        const fs = 10.5 * dpr;
        for (const l of sorted) {
          if (!isLocTypeVisible(l.type)) continue;
          const dx = (l.x - mx) * k + c, dy = (l.y - my) * k + c;
          if (dx < -10 || dy < -10 || dx > cv.width + 10 || dy > cv.height + 10) continue;
          if (!game.isExplored(l.x * WORLD_SCALE, l.y * WORLD_SCALE)) continue;
          const small = l.minor && !close;
          const r = small ? (zoomed ? 2.4 : 1.7) * dpr : R0 * (l.type === 'city' || l.type === 'sect' ? 1.12 : 1);
          if (!free(dx - r - 1, dy - r - 1, dx + r + 1, dy + r + 1)) continue;
          boxes.push(dx - r - 1, dy - r - 1, dx + r + 1, dy + r + 1);
          g.fillStyle = SEAL_COLOR[l.type];
          if (small) { g.globalAlpha = 0.8; g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; continue; }
          g.fillRect(dx - r, dy - r, r * 2, r * 2);
          g.fillStyle = '#f7eedb'; g.font = `${r * 1.5}px 'Ma Shan Zheng', serif`; g.fillText(l.seal ?? SEAL[l.type], dx, dy + 0.5);
          // 地名（放大后；城 / 宗在中档也显示）
          const showName = close || (zoomed && !l.minor) || (ppu >= 1.6 && (l.type === 'city' || l.type === 'sect'));
          if (showName) {
            g.font = `${fs}px 'Ma Shan Zheng', serif`;
            const tw = g.measureText(l.name).width;
            // 先试右侧，再试左侧、下方
            const cand: [number, number][] = [[dx + r + 3 + tw / 2, dy], [dx - r - 3 - tw / 2, dy], [dx, dy + r + fs * 0.75]];
            for (const [lx, ly] of cand) {
              const bx0 = lx - tw / 2 - 1, bx1 = lx + tw / 2 + 1, by0 = ly - fs * 0.55, by1 = ly + fs * 0.55;
              if (bx0 < 2 || bx1 > cv.width - 2 || by0 < 2 || by1 > cv.height - 2 || !free(bx0, by0, bx1, by1)) continue;
              boxes.push(bx0, by0, bx1, by1);
              g.lineWidth = 3 * dpr; g.strokeStyle = 'rgba(240,232,212,0.92)'; g.lineJoin = 'round'; g.strokeText(l.name, lx, ly + 0.5);
              g.fillStyle = l.type === 'city' || l.type === 'sect' ? '#4a2a1c' : '#3a3328'; g.fillText(l.name, lx, ly + 0.5);
              break;
            }
          }
        }
    };
    const draw = () => {
      // 小地图不需要跟主循环 60fps：订阅回调可能一帧来好几次，限到 10fps，
      // 既不掉信息量，也避免每帧重画标记/文字造成一卡一卡。
      const now = performance.now();
      if (now - lastDraw < 100) return;
      lastDraw = now;
      frame++;
      const size = cv.clientWidth || 156; const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(size * dpr)) { cv.width = cv.height = Math.round(size * dpr); }
      // 第三十八步：迷雾图随静态层一起重建
      // 档位切换时平滑过渡
      const target = MM_SPANS[ziRef.current];
      span += (target - span) * 0.35; if (Math.abs(span - target) < 0.3) span = target;
      const SPAN = span;
      const p = game.player; const mx = p.x / WORLD_SCALE, my = p.y / WORLD_SCALE;
      const k = cv.width / SPAN, c = cv.width / 2;
      const SW = Math.round(cv.width * 1.5);
      if (stCv.width !== SW) { stCv.width = stCv.height = SW; stKey = ''; }
      const key = `${SPAN.toFixed(2)}|${game.ui?.explored ?? 0}|${dpr}|${game.revealAll ? 1 : 0}|${mapFilterRev()}`;
      const moved = Math.abs(mx - stX) * k > cv.width * 0.2 || Math.abs(my - stY) * k > cv.width * 0.2;
      // 静态层（底图/雾/地名印章）重画较贵：最多 6.7 次/秒，避免探索时每帧重建造成一卡一卡
      if ((key !== stKey || moved) && now - stT > 150) {
        makeFogCanvas(game, fogCv); paintStatic(SPAN * 1.5, mx, my, dpr, k); stKey = key; stX = mx; stY = my; stT = now;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(stCv, c + (stX - mx) * k - SW / 2, c + (stY - my) * k - SW / 2);
      const zoomed = k / dpr > 2.4;
      // 神识圈 + 玩家
      for (const m of game.events.activeMarkers()) {
        const dx = (m.x - mx) * k + c, dy = (m.y - my) * k + c;
        const pr = (4 + 2 * Math.sin(performance.now() / 300)) * dpr;
        g.strokeStyle = 'rgba(200,40,40,0.9)'; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(Math.max(6, Math.min(cv.width - 6, dx)), Math.max(6, Math.min(cv.height - 6, dy)), pr + 4 * dpr, 0, Math.PI * 2); g.stroke();
      }
      const sm = game.story?.marker();
      if (sm) {
        const dx = Math.max(7 * dpr, Math.min(cv.width - 7 * dpr, (sm.x - mx) * k + c)), dy = Math.max(7 * dpr, Math.min(cv.height - 7 * dpr, (sm.y - my) * k + c));
        const pr = (5 + 1.5 * Math.sin(performance.now() / 250)) * dpr;
        g.save(); g.translate(dx, dy); g.rotate(Math.PI / 4); g.fillStyle = '#f0b830'; g.strokeStyle = '#5a3a10'; g.lineWidth = 1.5 * dpr; g.fillRect(-pr / 2, -pr / 2, pr, pr); g.strokeRect(-pr / 2, -pr / 2, pr, pr); g.restore();
      }
      // 第十八步：机缘 / 洞府 / 悬赏 / 异宝 / 求援
      for (const m of game.mapMarks?.() ?? []) {
        if (!isMarkVisible(m.glyph)) continue;
        let dx = (m.x / WORLD_SCALE - mx) * k + c, dy = (m.y / WORLD_SCALE - my) * k + c;
        const urgent = m.glyph === '宝' || m.glyph === '赏' || m.glyph === '援' || m.glyph === '府';
        if (!urgent && (dx < 0 || dy < 0 || dx > cv.width || dy > cv.height)) continue;
        const r = 4.2 * dpr;
        // 夹到圆形可视区（不是方形画布）：标记文字不会跑到圆盘外被裁掉
        const ccx = cv.width / 2, ccy = cv.height / 2, rmax = Math.max(r + 2, ccx - r - 2);
        const ddx = dx - ccx, ddy = dy - ccy, dd = Math.hypot(ddx, ddy);
        if (dd > rmax) { dx = ccx + ddx / dd * rmax; dy = ccy + ddy / dd * rmax; }
        g.fillStyle = 'rgba(30,24,18,0.75)'; g.beginPath(); g.arc(dx, dy, r + 1, 0, Math.PI * 2); g.fill();
        // 文字居中在圆点里（默认 start/alphabetic 会偏到右上）
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = m.color; g.font = `${r * 1.7}px 'Ma Shan Zheng', serif`; g.fillText(m.glyph, dx, dy + 0.5);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      }
      for (const d of game.npcs.visibleDots()) { const dx = (d.x / WORLD_SCALE - mx) * k + c, dy = (d.y / WORLD_SCALE - my) * k + c; g.fillStyle = d.c; g.beginPath(); g.arc(dx, dy, (zoomed ? 2.2 : 1.6) * dpr, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(47,140,120,0.85)'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(c, c, (game.awarenessRadius / WORLD_SCALE) * k, 0, Math.PI * 2); g.stroke();
      g.setLineDash([3 * dpr, 2 * dpr]); g.strokeStyle = 'rgba(145,83,44,0.9)';
      g.beginPath(); g.arc(c, c, (game.detailSenseRadius / WORLD_SCALE) * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      // 目的地：自动寻路被打断后 destination 会清空，但 guide 仍在——虚线继续指向导航目标
      const nav = game.destination ?? (game.guide && game.guide.map === ACTIVE_MAP ? game.guide : null);
      if (nav) {
        const dx = (nav.x / WORLD_SCALE - mx) * k + c, dy = (nav.y / WORLD_SCALE - my) * k + c;
        g.setLineDash([3 * dpr, 3 * dpr]); g.strokeStyle = 'rgba(168,53,42,0.8)';
        g.beginPath(); g.moveTo(c, c); g.lineTo(dx, dy); g.stroke(); g.setLineDash([]);
        g.strokeStyle = '#a8352a'; g.lineWidth = 1.5 * dpr;
        g.beginPath(); g.moveTo(dx - 4 * dpr, dy - 4 * dpr); g.lineTo(dx + 4 * dpr, dy + 4 * dpr);
        g.moveTo(dx + 4 * dpr, dy - 4 * dpr); g.lineTo(dx - 4 * dpr, dy + 4 * dpr); g.stroke();
      }
      if (isHeroVisible()) {
        g.save(); g.translate(c, c); g.scale(dpr, dpr);
        g.fillStyle = '#a8352a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
        g.restore();
      }
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); zoomBy(e.deltaY < 0 ? 1 : -1); };
    cv.addEventListener('wheel', wheel, { passive: false });
    draw();
    const un = game.subscribe(draw);
    // 大地图里改了图例筛选 → 小地图立刻跟着重画（游戏暂停时也要生效）
    const unFilter = onMapFilterChange(draw);
    return () => {
      un(); unFilter(); cv.removeEventListener('wheel', wheel);
      fogCv.width = fogCv.height = 0;
      stCv.width = stCv.height = 0;
      for (const t of tiles.values()) { t.cv.width = t.cv.height = 0; }
      tiles.clear();
    };
  }, [game]);
  const btn = (d: number) => (e: React.MouseEvent | React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); zoomBy(d); audio.sfx('click'); };
  return (
    <>
      <canvas ref={ref} onClick={onOpen} />
      <button className="mm-zoom in" disabled={zi >= MM_SPANS.length - 1} onClick={btn(1)} title="放大小地图（滚轮）">＋</button>
      <button className="mm-zoom out" disabled={zi <= 0} onClick={btn(-1)} title="缩小小地图（滚轮）">－</button>
    </>
  );
}

// ---------- 摇杆 ----------
// v0.52.4：推力写进 input.joyMag —— 推到底（>0.86）自动疾行，摇杆外圈会亮一圈
// 线性比例映射（mapJoystickVector）：轻推（<= 0.86）按推力比例控制速度，> 0.86 自动切至疾行/遁光并联动界面按钮
function Joystick({ game }: { game: Game }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [mag, setMag] = useState(0);
  const active = useRef<number | null>(null);
  const move = useCallback((e: PointerEvent) => {
    const el = base.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const R = r.width / 2;
    const prevRun = game.input.joyMag > JOY_RUN_MAG;
    const out = mapJoystickVector(e.clientX - (r.left + R), e.clientY - (r.top + R), R);
    setKnob({ x: out.knobX, y: out.knobY });
    setMag(out.mag);
    game.input.joyMag = out.mag;
    game.input.joy.x = out.x;
    game.input.joy.y = out.y;
    if ((out.mag > JOY_RUN_MAG) !== prevRun) game.updateUI(true);
  }, [game]);
  const end = useCallback(() => {
    const prevRun = game.input.joyMag > JOY_RUN_MAG;
    active.current = null; setKnob({ x: 0, y: 0 }); setMag(0);
    game.input.joy.x = 0; game.input.joy.y = 0; game.input.joyMag = 0;
    if (prevRun) game.updateUI(true);
  }, [game]);
  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (active.current !== null && e.pointerId === active.current) move(e); };
    const onUp = (e: PointerEvent) => { if (active.current !== null && e.pointerId === active.current) end(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', end);
      active.current = null;
      game.input.joy.x = 0; game.input.joy.y = 0; game.input.joyMag = 0;
    };
  }, [move, end]);
  return (
    <div className={'joystick' + (mag > JOY_RUN_MAG ? ' fast' : '')} ref={base}
      onPointerDown={(e) => { if (active.current !== null) return; audio.unlock(); active.current = e.pointerId; move(e.nativeEvent); }}>
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      <span className="joystick-hint">疾行</span>
    </div>
  );
}

// ---------- 主线目标卷轴 ----------
// v0.52.9：任务栏下面挂一条宗门任务指路——去哪、多远、还差几件，一眼能看见，点一下标到地图上
function SectTaskHint({ game }: { game: Game }) {
  useUI(game);
  const s = game.ws.sect;
  if (!s || !s.tasks.length) return null;
  const now = game.day;
  const list = s.tasks.filter((t) => t.until >= now).slice(0, 2);
  if (!list.length) return null;
  return (
    <div className="sect-tracker">
      <div className="st-head">{LOC_BY_ID.get(s.id)?.name ?? '宗门'} · {SECT_RANKS[s.rank]}</div>
      {list.map((t) => {
        const have = Math.max(0, game.towns.taskProgress(t)), done = have >= t.need;
        const w = game.towns.taskWhere(t);
        const d = w.x !== undefined && w.y !== undefined ? Math.max(1, Math.round(Math.hypot(w.x - game.player.x, w.y - game.player.y) / 30)) : 0;
        const dir = w.x !== undefined && w.y !== undefined ? dirName(w.x - game.player.x, w.y - game.player.y) : '';
        const left = Math.max(0, Math.ceil(t.until - now));   // 剩余天数
        return (
          <div key={t.id} className={'st-row' + (done ? ' done' : '')} onPointerDown={(e) => {
            e.stopPropagation();
            if (w.x === undefined || w.y === undefined) { game.toast('这处目标还没探明。', 'info'); return; }
            audio.sfx('click'); game.setDestination(w.x, w.y, t.text);
          }}>
            <b>{done ? '✔' : '·'} {t.text}</b><span>{have}/{t.need}</span>
            <em>{w.spot}{d ? `　${dir}方约 ${d} 丈` : ''}　·　赏 贡献+{Math.round(t.reward)}　余 {left} 日</em>
          </div>
        );
      })}
    </div>
  );
}

/** v0.56：模组任务（显示在宗门任务下方；点一下指路） */
function ModQuestHint({ game }: { game: Game }) {
  useSlowUI(game, 3);
  const list = modx?.quests().filter((q) => !q.done).slice(0, 3) ?? [];
  if (!list.length) return null;
  return (
    <div className="sect-tracker mod-tracker">
      {list.map((q) => {
        const has = q.x !== undefined && q.y !== undefined;
        const d = has ? Math.max(1, Math.round(Math.hypot(q.x! - game.player.x, q.y! - game.player.y) / 30)) : 0;
        return (
          <div key={q.key} className="st-row" onPointerDown={(e) => { e.stopPropagation(); if (has) { audio.sfx('click'); game.setDestination(q.x!, q.y!, q.title); } }}>
            <b>· {q.title}</b>{q.need ? <span>{q.have ?? 0}/{q.need}</span> : null}
            <em>{q.text ?? ''}{d ? `　${dirName(q.x! - game.player.x, q.y! - game.player.y)}方约 ${d} 丈` : ''}</em>
          </div>
        );
      })}
    </div>
  );
}

/** 好友求救 / 红颜求援 / 玉符急讯：有急讯时常驻一条直接导航提示，点一下即自动赶去 */
function SosHint({ game }: { game: Game }) {
  useSlowUI(game, 3);
  const list = game.activeSosTargets().slice(0, 3);
  if (!list.length) return null;
  return (
    <div className="sect-tracker sos-tracker">
      <div className="st-head" style={{ color: '#a8352a' }}>传音急讯 · 求援</div>
      {list.map((t) => {
        const d = Math.max(1, Math.round(Math.hypot(t.x - game.player.x, t.y - game.player.y) / 260));
        const dir = dirName(t.x - game.player.x, t.y - game.player.y);
        return (
          <div key={t.id} className="st-row" onPointerDown={(e) => {
            e.stopPropagation();
            audio.sfx('click');
            if (t.inviteId) {
              const inv = game.friends.S.invites.find((x) => x.id === t.inviteId);
              if (inv && !inv.accepted) game.friends.accept(inv);
            }
            if (t.jadeId) {
              const j = game.war.inbox.find((x) => x.id === t.jadeId);
              if (j && !j.accepted) j.accepted = true;
            }
            game.navigateTo(t.x, t.y, t.title, t.followNpcId);
          }}>
            <b style={{ color: t.urgent ? '#a8352a' : undefined }}>【{t.tag}】{t.title}</b>
            <span style={{ color: '#a8352a' }}>{game.canFly ? '御剑' : '导航'}▸</span>
            <em>{dir}方约 {d} 里 · {t.detail}（点击直接前往）</em>
          </div>
        );
      })}
    </div>
  );
}

function QuestTracker({ game }: { game: Game }) {
  useUI(game);
  const q = game.story?.tracker();
  if (!q) return null;
  const go = () => { if (q.tx !== undefined && q.ty !== undefined) { audio.sfx('click'); game.setDestination(q.tx, q.ty, q.title); game.toast(`开始导航：${q.title}`); } };
  return (
    <div className={'quest-tracker' + (q.tx !== undefined ? ' clickable' : '')} onPointerDown={(e) => { e.stopPropagation(); go(); }} title={q.tx !== undefined ? '点击自动前往' : ''}>
      <div className="qt-ch">{q.ch}</div>
      <div className="qt-title">{q.title}</div>
      <div className="qt-text">{q.text}</div>
      {q.ang !== undefined && q.dist !== undefined && q.dist > 160 && <div className="qt-dir"><span className="qt-arrow" style={{ transform: `rotate(${q.ang}rad)` }}>➤</span>约 {Math.max(1, Math.round(q.dist / 30))} 丈</div>}
    </div>
  );
}

// ---------- 性能监视（F3）----------
interface QItem {
  id: string; tag: string; tagClass: 'main' | 'side' | 'sect' | 'event' | 'bounty' | 'mod' | 'misc';
  kind: string; title: string; text: string; meta: string; count?: string;
  go?: () => void;
}

/** 抽屉展开内容：仅在 open 时挂载并订阅，收起态零计算、零重渲染 */
function QuestDrawerPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useSlowUI(game, 3);
  const [active, setActive] = useState('');

  // 导航：同步标出持久指路「指」并直接御剑 / 寻路前往
  const navTo = (x: number, y: number, name: string, inviteId?: number, jadeId?: number, followNpcId?: string) => {
    audio.sfx('click');
    if (inviteId) {
      const inv = game.friends.S.invites.find((v) => v.id === inviteId);
      if (inv && !inv.accepted) game.friends.accept(inv);
    }
    if (jadeId) {
      const j = game.war.inbox.find((v) => v.id === jadeId);
      if (j && !j.accepted) j.accepted = true;
    }
    game.navigateTo(x, y, name, followNpcId);
    onClose();
  };
  const items: QItem[] = [];
  for (const t of game.activeSosTargets()) {
    const d = Math.max(1, Math.round(Math.hypot(t.x - game.player.x, t.y - game.player.y) / 260));
    const dir = dirName(t.x - game.player.x, t.y - game.player.y);
    items.push({
      id: `sos:${t.id}`,
      tag: t.tag,
      tagClass: t.urgent ? 'main' : 'side',
      kind: `${t.tag} · ${t.name}`,
      title: t.title,
      text: `${t.detail}，${dir}方约 ${d} 里。点击右侧导航即可直接前往。`,
      meta: `${dir}方约 ${d} 里 · 余 ${t.daysLeft} 日`,
      go: () => navTo(t.x, t.y, t.title, t.inviteId, t.jadeId, t.followNpcId),
    });
  }
  const q = game.story?.tracker();
  if (q) {
    const d = q.dist ? Math.max(1, Math.round(q.dist / 30)) : 0;
    items.push({
      id: 'main', tag: '主线', tagClass: 'main', kind: q.ch, title: q.title, text: q.text,
      meta: d ? `约 ${d} 丈` : '', go: q.tx !== undefined && q.ty !== undefined
        ? () => navTo(q.tx!, q.ty!, q.title)
        : undefined,
    });
  }
  const s = game.ws.sect;
  if (s) for (const t of s.tasks.filter((x) => x.until >= game.day)) {
    const have = Math.max(0, game.towns.taskProgress(t)), done = have >= t.need;
    const w = game.towns.taskWhere(t);
    const d = w.x !== undefined && w.y !== undefined ? Math.max(1, Math.round(Math.hypot(w.x - game.player.x, w.y - game.player.y) / 30)) : 0;
    const dir = w.x !== undefined && w.y !== undefined ? dirName(w.x - game.player.x, w.y - game.player.y) : '';
    const left = Math.max(0, Math.ceil(t.until - game.day));
    const pay = Math.round(t.reward);
    items.push({
      id: `sect:${t.id}`, tag: '宗门', tagClass: 'sect',
      kind: `${LOC_BY_ID.get(s.id)?.name ?? '宗门'} · ${TASK_KIND_NAME[t.kind] ?? '差事'} · ${SECT_RANKS[s.rank] ?? ''}`,
      title: t.text,
      text: (done ? '差事已达成，回宗门交差即可。' : `前往${w.spot}完成差事，完成后回宗门交差。`) + `　赏 贡献+${pay} · 修为+${Math.round((t.exp ?? 0) * 100)}%`,
      count: `${have}/${t.need}`,
      meta: `${w.spot}${d ? ` · ${dir}方约 ${d} 丈` : ''} · 余 ${left} 日`,
      go: w.x !== undefined && w.y !== undefined ? () => navTo(w.x!, w.y!, t.text) : undefined,
    });
  }
  for (const mq of modx?.quests().filter((x) => !x.done).slice(0, 6) ?? []) {
    items.push({
      id: `mod:${mq.key}`, tag: '模组', tagClass: 'mod', kind: `模组 · ${mq.mod}`, title: mq.title,
      text: mq.text ?? '模组给的一桩事。', count: mq.need ? `${mq.have ?? 0}/${mq.need}` : undefined,
      meta: mq.text ?? '', go: mq.x !== undefined && mq.y !== undefined ? () => navTo(mq.x!, mq.y!, mq.title) : undefined,
    });
  }
  for (const e of game.events?.activeMarkers() ?? []) {
    items.push({
      id: `ev:${e.name}`, tag: '大事', tagClass: 'event', kind: '人界大事 · 正在发生', title: e.name,
      text: '大事正在发生，地图上已标出。', meta: '地图上已标出',
      go: () => navTo(e.x * WORLD_SCALE + 200, e.y * WORLD_SCALE + 360, e.name),
    });
  }
  for (const b of game.ws.bounties ?? []) {
    if (b.done || b.until <= game.day) continue;
    const on = b.map === ACTIVE_MAP;
    items.push({
      id: `bounty:${b.id}`, tag: '悬赏', tagClass: 'bounty', kind: `悬赏 · ${realmName(b.realm, b.stage)}`,
      title: `「${b.name}」`, text: `赏 ${b.reward} ${worldCurrencyName(ACTIVE_WORLD)}，余 ${Math.ceil(b.until - game.day)} 日。`,
      meta: on ? `${dirName(b.x - game.player.x, b.y - game.player.y)}方约 ${Math.max(1, Math.round(Math.hypot(b.x - game.player.x, b.y - game.player.y) / 30))} 丈` : '他处',
      go: on ? () => navTo(b.x, b.y, `悬赏·${b.name}`) : undefined,
    });
  }
  for (const [src, list] of [['人心', game.renxin?.chances()], ['江湖', game.jianghu?.chances()], ['道心', game.daoxin?.chances()], ['偏局', game.pianju?.chances()]] as const) {
    for (const c of (list ?? []) as { t: string; d: string; x?: number; y?: number }[]) {
      if (c.x === undefined || c.y === undefined) continue;
      items.push({
        id: `chance:${src}:${c.t}`, tag: '机缘', tagClass: 'misc', kind: `机缘 · ${src}`,
        title: c.t, text: c.d,
        meta: `${dirName(c.x - game.player.x, c.y - game.player.y)}方约 ${Math.max(1, Math.round(Math.hypot(c.x - game.player.x, c.y - game.player.y) / 30))} 丈`,
        go: () => navTo(c.x!, c.y!, c.t),
      });
    }
  }
  const cur = items.find((x) => x.id === active) ?? items[0];

  return (
    <div className="qd-panel" role="dialog" aria-label="任务">
      <div className="qd-head">
        <div>
          <div className="qd-title">任务</div>
          <div className="qd-sub">主线 · 支线 · 模组</div>
        </div>
        <button className="qd-back" onClick={onClose} aria-label="收起">←</button>
      </div>
      <div className="qd-scroll">
        {cur && (
          <div className="qd-detail">
            <div className="qd-kind">{cur.kind}</div>
            <h4>{cur.title}</h4>
            <p>{cur.text}</p>
            <div className="qd-detail-foot">
              {cur.count && <span className="qd-count">{cur.count}</span>}
              {cur.go && <button className="qd-go" onClick={cur.go}>导航</button>}
            </div>
          </div>
        )}
        {!cur && (
          <div className="qd-empty">
            <b>眼下无事</b>
            <p>暂时没有主线或支线机缘。去宗门看看差事，或在人间四处走走。</p>
          </div>
        )}
        <div className="qd-list">
          {items.map((it) => (
            <div key={it.id} className={'qd-row' + (cur?.id === it.id ? ' active' : '')} role="button" tabIndex={0}
              onClick={() => setActive(it.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(it.id); } }}>
              <span className={'qd-badge ' + it.tagClass}>{it.tag}</span>
              <span className="qd-tt">{it.title}</span>
              <span className="qd-right">
                {it.count && <span className="qd-cnt">{it.count}</span>}
                {it.go && <button className="qd-nav" onClick={(e) => { e.stopPropagation(); it.go!(); }}>导航</button>}
              </span>
              <span className="qd-meta">{it.meta}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 左侧「任务」抽屉（PC / 移动端通用）：主线/支线/大事/悬赏/机缘列表 + 详情；左侧竖签可上下拖动 */
function QuestDrawer({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const [tabPos, setTabPos] = useState<{ left: number; top: number } | null>(() => {
    try {
      const raw = localStorage.getItem('fanren.qdTabTop');
      const v = raw === null ? NaN : Number(raw);
      if (Number.isFinite(v)) return { left: 0, top: v };
    } catch { /* */ }
    return null;
  });
  const [dragging, setDragging] = useState(false);
  const tabRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; left: number; top: number; moved: boolean; t0: number; touch: boolean } | null>(null);
  const dragEnd = useRef(0);
  const openedAt = useRef(0);
  useEffect(() => {
    const h = tabRef.current?.offsetHeight ?? 100;
    setTabPos((p) => p ? { left: 0, top: Math.max(8, Math.min(window.innerHeight - h - 8, p.top)) } : p);
  }, []);
  useEffect(() => {
    const onResize = () => {
      const h = tabRef.current?.offsetHeight ?? 100;
      setTabPos((p) => p ? { left: 0, top: Math.max(8, Math.min(window.innerHeight - h - 8, p.top)) } : p);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const onDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (open) return;
    const r = tabRef.current?.getBoundingClientRect(); if (!r) return;
    drag.current = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, left: r.left, top: r.top,
      moved: false, t0: performance.now(), touch: e.pointerType !== 'mouse',
    };
    dragEnd.current = 0;
    setDragging(true);
    try { tabRef.current!.setPointerCapture(e.pointerId); } catch { /* */ }
  };
  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 12) d.moved = true;
    if (!d.moved) return;
    const w = tabRef.current?.offsetWidth ?? 34, h = tabRef.current?.offsetHeight ?? 100;
    setTabPos({
      left: Math.max(0, Math.min(window.innerWidth - w, d.left + dx)),
      top: Math.max(8, Math.min(window.innerHeight - h - 8, d.top + dy)),
    });
  };
  const onUp = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current; if (!d || e.pointerId !== d.id) return;
    try { tabRef.current?.releasePointerCapture(e.pointerId); } catch { /* */ }
    drag.current = null; setDragging(false);
    dragEnd.current = performance.now();
    const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    const tap = !d.moved || (performance.now() - d.t0 < 450 && dist < 28);
    if (tap) { openDrawer(); return; }
    const r = tabRef.current?.getBoundingClientRect();
    if (r) {
      const top = Math.max(8, Math.min(window.innerHeight - r.height - 8, r.top));
      try { localStorage.setItem('fanren.qdTabTop', String(top)); } catch { /* */ }
      setTabPos({ left: 0, top });
    }
  };
  const onCancel = () => { drag.current = null; dragEnd.current = performance.now(); setDragging(false); };
  const openDrawer = () => { openedAt.current = performance.now(); setOpen(true); };
  const onClick = () => {
    if (open) return;
    if (performance.now() - dragEnd.current < 500) return;
    openDrawer();
  };

  return (
    <div className={'qd-root' + (open ? ' open' : '')}>
      <button
        ref={tabRef}
        className={'qd-tab' + (dragging ? ' dragging' : '')}
        style={tabPos ? { left: tabPos.left, top: tabPos.top, transform: 'none', transition: dragging ? 'none' : undefined } : undefined}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(); } }}
        aria-label="展开任务"
      >任务</button>
      <div className="qd-scrim" onClick={() => { if (performance.now() - openedAt.current < 500) return; setOpen(false); }} />
      {open && <QuestDrawerPanel game={game} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ---------- 性能监视（F3）----------
function PerfHud({ game }: { game: Game }) {
  const [on, setOn] = useState(() => game.showPerf);
  const [, f] = useState(0);
  useEffect(() => {
    const sync = () => setOn(game.showPerf);
    const un = game.subscribe(sync);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F3') queueMicrotask(sync); };
    window.addEventListener('keydown', onKey);
    return () => { un(); window.removeEventListener('keydown', onKey); };
  }, [game]);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => f((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [on]);
  if (!on) return null;
  const p = game.perf, r = game.renderer;
  return <div className="perf-hud">
    逻辑 {p.updMs.toFixed(1)}ms · 绘制 {p.renMs.toFixed(1)}ms<br />
    {r?.stage
      ? <>{r.stage.softGPU ? <b style={{ color: '#d8534a' }}>⚠ 软件渲染（显卡没用上）</b> : '显卡'} {r.stage.gpuName.slice(0, 46)}<br /></>
      : <>Canvas2D 兼容渲染<br /></>}
    {r?.stage ? `WebGL · ${r.stage.W}×${r.stage.H} · ${r.stage.drawCalls} 次绘制 · 画布上传 世界 ${(r.stage.uploadMB ?? 0).toFixed(2)} / 氛围 ${(r.stage.atmoUploadMB ?? 0).toFixed(2)} MiB/帧（估算） · 粒子 ${r.fx?.count ?? 0}` : 'Canvas2D'} · 世界层 ×{r?.dpr.toFixed(2)} · 画质 {['低', '中', '高'][r?.tier ?? 2]}<br />
    {p.fps.toFixed(0)} fps · 最慢一帧 {p.worstMs.toFixed(0)}ms · 卡顿(&gt;50ms) {r?.spikes ?? 0} 次{r?.stage?.gpuMs ? ` · GPU ${r.stage.gpuMs.toFixed(1)}ms` : ''}<br />
    {r?.stage?.gpuSec && Object.keys(r.stage.gpuSec).length ? <>GPU分段 {Object.entries(r.stage.gpuSec).map(([k2, v]) => `${k2} ${(v as number).toFixed(1)}`).join(' / ')}<br /></> : null}
    {r?.stage?.ground?.front ? `地表缓存 ${r.stage.ground.front.W}×${r.stage.ground.front.H} · 重画 ${r.stage.ground.rebuilds} 次` : '地表 —'} · 自动降档 {r?.qualityLevel ?? 0}/3<br />
    {(() => {
      const s: any = r?.stats ?? {};
      const kr = typeof s.keepRatio === 'number' ? s.keepRatio : 1;
      const cn: any = (r as any)?.canopy;
      const cstate = !cn ? '' : ` · 林色 ${cn.ready ? '就绪' : `${Math.round((cn.progress ?? 0) * 100)}%`} ${cn.w}×${cn.h} 重烘${cn.bakes}`;
      return `远景：${r?.farSummary ? '宏观摘要' : '近景'} · 保留块 ${(kr * 100).toFixed(0)}% · ${s.dlPending ? '分帧补齐中' : '本帧遍历完'} · 树 ${s.trees ?? 0} 山 ${s.mtns ?? 0} 小件 ${s.decos ?? 0} 草 ${s.grass ?? 0}${cstate}`;
    })()}<br />
    {(() => { const j = spriteJobs(); const st = sprites.stats; return `精灵 ${st.n} 张 ${st.mpx}MP · 后台生成 ${j.ok ? `开（${j.done} 张，均 ${j.avgMs.toFixed(0)}ms，排队 ${j.queued}）` : '关（主线程）'}`; })()}<br />
    树 {r?.stats.trees} · 草 {r?.stats.grass} · 敌 {game.combat.enemies.length} · NPC {game.npcs?.list.length ?? 0}
    {r?.stage?.ground ? ` · 地表本帧 ${((r.stage.ground as any).texelsThisFrame / 1000).toFixed(1)}k 纹素` : ''}<br />
    <span className="perf-top">{prof.report(8).map((x) => `${x.k} ${x.ms.toFixed(1)}`).join(' · ')}</span><br />
    {prof.spikes.length ? <>最近卡顿：{prof.spikes.slice(-2).map((x) => `${x.ms}ms←${x.top.map((y) => y.k).join('/')}`).join('；')}<br /></> : null}
    <button className="perf-btn" onClick={() => {
      const head = `fanren ${navigator.userAgent}\n${r?.stage ? `WebGL ${r.stage.W}×${r.stage.H} 绘制${r.stage.drawCalls} 世界/氛围画布上传估算 ${(r.stage.uploadMB ?? 0).toFixed(2)}/${(r.stage.atmoUploadMB ?? 0).toFixed(2)} MiB/帧` : 'Canvas2D'} 世界层×${r?.dpr.toFixed(2)} 降档${r?.qualityLevel ?? 0} fps ${p.fps.toFixed(0)} 最慢 ${p.worstMs.toFixed(0)}ms 逻辑 ${p.updMs.toFixed(1)} 绘制 ${p.renMs.toFixed(1)}${r?.stage?.gpuMs ? ` GPU ${r.stage.gpuMs.toFixed(1)}` : ''}\n位置 ${Math.round(game.player.x)},${Math.round(game.player.y)} ${game.player.flying ? '飞行' : '步行'} 敌${game.combat.enemies.length} NPC${game.npcs?.list.length ?? 0}${r?.stage?.gpuSec && Object.keys(r.stage.gpuSec).length ? `\nGPU分段 ${Object.entries(r.stage.gpuSec).map(([k, v]) => `${k} ${(v as number).toFixed(1)}`).join(' / ')}` : ''}${r?.stage?.ground?.front ? `\n地表缓存 ${r.stage.ground.front.W}×${r.stage.ground.front.H} 重画${r.stage.ground.rebuilds} 开工${r.stage.ground.jobsStarted} 纹素/帧 ${Math.round(r.stage.groundTexels / 1000)}k 线段截断 源${r.stage.ground.sourceTruncations}/块${r.stage.ground.tileTruncations} 缩放${game.cam.zoom.toFixed(2)}` : ''}`;
      const txt = prof.text(head);
      try { navigator.clipboard.writeText(txt); } catch { /* 无剪贴板权限 */ }
      console.log(txt);
    }}>复制性能报告</button> <button className="perf-btn" onClick={() => prof.reset()}>重新计时</button> <button className="perf-btn" onClick={() => {
      // 结构化导出：下载成文件，方便贴给别人离线排序；下载被拦时退回剪贴板 + 控制台
      const env: Record<string, unknown> = {
        userAgent: navigator.userAgent,
        renderer: r?.stage ? 'WebGL' : 'Canvas2D',
        stage: r?.stage ? { w: r.stage.W, h: r.stage.H, drawCalls: r.stage.drawCalls, uploadMB: r.stage.uploadMB, atmoUploadMB: r.stage.atmoUploadMB, gpuMs: r.stage.gpuMs, gpuSec: r.stage.gpuSec } : null,
        dpr: r?.dpr, qualityLevel: r?.qualityLevel, tier: r?.tier, farSummary: r?.farSummary,
        fps: p.fps, worstMs: p.worstMs, updMs: p.updMs, renMs: p.renMs,
        zoom: game.cam.zoom, map: (game as any).mapId ?? null,
        player: { x: Math.round(game.player.x), y: Math.round(game.player.y), flying: game.player.flying },
        counts: { enemies: game.combat.enemies.length, npcs: game.npcs?.list.length ?? 0, trees: r?.stats.trees, grass: r?.stats.grass },
        canopy: r?.canopy ?? null,
      };
      const txt = prof.exportJSON(env);
      try {
        const blob = new Blob([txt], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `fanren-perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch { /* 下载被拦：下面走剪贴板 */ }
      try { navigator.clipboard.writeText(txt); } catch { /* 无剪贴板权限 */ }
      console.log(txt);
    }}>导出 JSON</button>
  </div>;
}

// ---------- 主界面 ----------
export function GameView({ game, onExit, onReady }: { game: Game; onExit: () => void; onReady?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  type PanelId = '' | 'map' | 'settings' | 'char' | 'bag' | 'alchemy' | 'seclude' | 'higher' | 'save' | 'skills' | 'wardrobe' | 'cloud' | 'zhenfa' | 'friends';
  const [panel, setPanel] = useState<PanelId>('');
  // v0.57：模组替换了这个原版面板——改开模组的面板
  useEffect(() => {
    if (!panel || !modx) return;
    const r = modx.replacePanel(panel);
    if (r) { setPanel(''); setTimeout(() => game.openModal({ kind: 'mod', mod: r.mod, panel: r.panel }), 0); }   // 等这一轮的「开面板先关对话」处理完再开
  }, [panel]);
  const [dock, setDock] = useState(false);
  const [cave, setCave] = useState(false);  // v0.52.5：洞府独立场景
  const [travelFx, setTravelFx] = useState<{ to: MapId; via: 'portal' | 'edge' } | null>(null);
  const [showHelp, setShowHelp] = useState(() => { try { return !localStorage.getItem('fanren_help_seen'); } catch { return true; } });

  useEffect(() => {
    loadAudio();
    game.attach(canvasRef.current!);
    let readySent = false;
    let readyRaf: number | undefined;
    let unsubAfterFrame: (() => void) | undefined;
    const emitReady = () => {
      if (readySent) return;
      readySent = true;
      unsubAfterFrame?.();
      unsubAfterFrame = undefined;
      onReadyRef.current?.();
    };
    const onFirstFrame = () => {
      if (readySent) return;
      const ready = game.frameNo >= 1 && (game.inCave || !game.renderer || game.renderer.isFirstFrameReady());
      if (!ready) return;
      unsubAfterFrame?.();
      unsubAfterFrame = undefined;
      if (typeof requestAnimationFrame === 'function') readyRaf = requestAnimationFrame(emitReady);
      else emitReady();
    };
    unsubAfterFrame = game.onAfterFrame?.(onFirstFrame);
    const readyFallback = setTimeout(emitReady, 1500);
    game.onOpenMap = () => { audio.sfx('open'); setPanel((p) => (p === 'map' ? '' : 'map')); };
    game.chat?.probe();   // 太虚问道录：看看有没有对话后端
    game.onPanel = (id, force) => { audio.sfx('open'); setPanel((p) => (force ? id : p === id ? '' : id)); };
    game.onCave = (on) => { setCave(on); if (!on) setPanel(''); };
    // v0.52.9：React 卸载 / 热更新后 game.onCave 还指着旧闭包时，洞府场景会「说开没开、说关没关」——
    // 卸载时把回调摘掉并关掉场景状态，下次挂载重新绑定
    // （这一条兜住的是「进洞府后又触发一次组件重挂」这一类黑屏）
    // 换图：先放一段过场（传送阵白光 / 草原远行的水墨淡出），再存档重载
    let travelTimer: ReturnType<typeof setTimeout> | undefined;
    game.onTravel = (to, via) => { game.paused = true; setPanel(''); audio.sfx(via === 'portal' ? 'thunder' : 'whoosh'); setTravelFx({ to, via }); travelTimer = setTimeout(() => { travelTimer = undefined; if (!game.switchMap(to)) { game.travel.cancelFailedSwitch(); game.paused = game.travel.recoveryRequired; setTravelFx(null); } }, via === 'portal' ? 2200 : 2600); };
    const t = setTimeout(() => { setShowHelp(false); try { localStorage.setItem('fanren_help_seen', '1'); } catch { /* */ } }, 14000);
    const unload = () => game.save(0);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (game.modal) { game.closeModal(); return; } setPanel((p) => (p ? '' : 'settings')); } };
    window.addEventListener('keydown', esc);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', unload);
    return () => {
      clearTimeout(t); clearTimeout(readyFallback); if (readyRaf !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(readyRaf); unsubAfterFrame?.(); if (travelTimer !== undefined) { clearTimeout(travelTimer); game.travel.cancelFailedSwitch(); game.paused = game.travel.recoveryRequired; } game.detach(); game.onOpenMap = undefined; game.onPanel = undefined; game.onTravel = undefined; game.onAscend = undefined; game.onCave = undefined; setCave(false);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', unload);
      window.removeEventListener('keydown', esc);
    };
  }, [game]);

  useEffect(() => {
    // 开面板就先收掉对话框：否则 z-index 55 的对话会压住 z-index 50 的面板，看着像坏了
    if (panel) game.closeModal(true);
    game.paused = game.travel.recoveryRequired || !!travelFx || panel !== '' || dock;
    // v0.71：全屏面板开着时世界是静止的——告诉主循环别再整幅重画（按钮才点得动）
    game.uiHold = game.paused;
    game.input.keys.clear();
  }, [panel, dock, travelFx]);

  const ui = useUI(game);
  const toasts = useToasts(game);
  if (!ui) return <canvas ref={canvasRef} className="game-canvas" />;
  const realmDef = getRealmDef(game.hero.realm);
  const expPct = Math.min(100, (ui.exp / ui.need) * 100);
  const region = toasts.filter((t) => t.kind === 'region').slice(-1)[0];
  const normal = toasts.filter((t) => t.kind !== 'region');
  // 普通消息改由左上「讯」条显示（不再刷屏中间），只有"急"级（追杀/危险）才仍落在中上方
  const urgentOnly = normal.filter((t) => t.lv === 'urgent');
  const loc = ui.nearby;
  const cnYear = cnNum(ui.date.year);
  const click = () => audio.sfx('click');
  // 有人可谈时把对方名写进按钮小字（最多三字），比浮一个气泡省地方
  const talkName = ui.talk && ui.talk.startsWith('与') ? (ui.talk.slice(1).replace(/交谈$/, '').slice(0, 3) || '交谈') : '交谈';

  return (
    <div className={"game-root" + (isTouch ? " touch" : "")}>
      <canvas ref={canvasRef} className="game-canvas" />
      <SenseGuidance game={game} />
      <PerfHud game={game} />
      {game.travel.recoveryRequired && <div role="alertdialog" aria-label="行程恢复" style={{position:'absolute',inset:0,zIndex:500,display:'grid',placeItems:'center',background:'rgba(20,16,12,.78)',color:'#f5e8c5'}}>
        <div style={{maxWidth:440,padding:24,background:'#30281d',border:'1px solid #b79b68',borderRadius:8,lineHeight:1.7}}>
          <h2>行程未能完成</h2>
          <p>出发前检查点已保留。请重试恢复；如果存储权限仍有问题，先导出检查点再关闭页面。</p>
          <button onClick={() => game.travel.recoverCheckpoint()}>恢复出发前存档</button>{' '}
          <button onClick={() => {
            const raw = game.travel.recoveryBackup();
            if (!raw) { game.toast('无法读取检查点，请检查存储权限。', 'warn'); return; }
            const url = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
            const a = document.createElement('a'); a.href = url; a.download = '太虚问道录_行程检查点.json'; a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>导出检查点</button>
        </div>
      </div>}
      {/* 手机：任务收进「眼下机缘」抽屉；电脑：任务提示常驻屏幕上方（突破天象或纯享录屏时自动隐去） */}
      {!(game.tianxiang.active || game.cinemaHideHud) && (
        <>
          {panel === '' && <QuestDrawer game={game} />}
          {!isTouch && <><QuestTracker game={game} /><div className="tracker-col"><SosHint game={game} /><SectTaskHint game={game} /><ModQuestHint game={game} /></div></>}
        </>
      )}
      {!(game.tianxiang.active || game.cinemaHideHud) && <ModHuds />}
      <div className="hud" style={(game.tianxiang.active || game.cinemaHideHud) ? { opacity: 0, pointerEvents: 'none', transition: 'opacity 0.55s ease' } : { transition: 'opacity 0.35s ease' }}>
        {/* 人物卡 + 消息角标「讯」：同一竖列排布，卡多高都不会叠在一起 */}
        <div className="char-stack">
        <div className="char-card">
          <div className="char-portrait"><CharacterPortrait look={equipmentAppearance(game.player.look, game.hero.equip, game.hero.wardrobe?.showEquipment === true)} /></div>
          <div className="char-info">
            <div className="char-name">苏寒 <span className="realm-badge" style={{ background: realmDef.color }}>{ui.realmText}</span>{ui.daoHurt && <span className="realm-badge" title={`${ui.daoHurt.why}（修炼速度-40%，法力上限-20%）`} style={{ background: '#9e2a24', marginLeft: 4 }}>道伤{ui.daoHurt.days}日</span>}</div>
            <div className="char-sub">{ui.rootName} · {Math.floor(ui.age)}岁 / 寿{ui.maxLife}<span className="sense-range"> · 神识 {ui.sense}</span></div>
            <div className="bar hp" title="气血"><div style={{ width: `${ui.hp * 100}%` }} /></div>
            <div className="bar mp" title="法力"><div style={{ width: `${ui.mp * 100}%` }} /></div>
            <div className={'bar exp' + (ui.bottleneck !== 'none' ? ' full' : '')} title={`修为 ${Math.floor(ui.exp)} / ${ui.need}`}><div style={{ width: `${expPct}%` }} /></div>
          </div>
        </div>
        {/* 消息角标「讯」：点开可回看消息记录；移动端还会在角标旁挂最新一条 */}
        <MsgStrip game={game} toasts={toasts} touch={isTouch} />
        </div>

        {/* 日期 + 小地图 */}
        <div className="top-right">
          <div className="date-box">
            <div className="date-season" style={{ background: SEASON_COLOR[ui.date.season] }}>{ui.date.season}</div>
            <div className="date-text">第{cnYear}年 · {MONTH[ui.date.month - 1]}<small>{ui.timeName} · {ui.weather}　{ui.regionParent && ui.regionParent !== ui.region ? `${ui.regionParent} · ` : ''}{ui.region}　探索 {(ui.explored * 100).toFixed(1)}%</small></div>
          </div>
          <div className="minimap-wrap" title={`打开世界地图（${keyLabel(bindOf('map'))}）；实线为神识探察圈，虚线为精细观察圈`}>
            {game.mijing.active ? <RealmHUD game={game} /> : <Minimap game={game} onOpen={() => { audio.sfx('open'); setPanel('map'); }} />}
            <div className="minimap-n">北</div>
            <div className="minimap-region">{ui.region}</div>
          </div>
          <div className="sense-list-host" />
        </div>

        {/* 提示 */}
        {showHelp && !isTouch && <div className="help-tip">{keyLabel(bindOf('up'))}{keyLabel(bindOf('left'))}{keyLabel(bindOf('down'))}{keyLabel(bindOf('right'))} 移动 · {keyLabel(bindOf('run'))} 疾行 · {keyLabel(bindOf('dodge'))} 闪避 · {keyLabel(bindOf('interact'))} 交谈 · {keyLabel(bindOf('town'))} 进城 · {keyLabel(bindOf('hearts'))} 友人录 · {keyLabel(bindOf('chronicle'))} 大事记·机缘 · {keyLabel(bindOf('war'))} 传音玉符 · {keyLabel(bindOf('help'))} 指南 · {keyLabel(bindOf('sit'))} 打坐 · {keyLabel(bindOf('gather'))} 采集 · {keyLabel(bindOf('slot1'))}–{keyLabel(bindOf('slot5'))} / {keyLabel(bindOf('slot6'))} / {keyLabel(bindOf('slot7'))} / {keyLabel(bindOf('slot8'))} / {keyLabel(bindOf('slot9'))} 施法（自动锁定最近敌人）· {keyLabel(bindOf('lover'))} 道侣 · {keyLabel(bindOf('pets'))} 灵宠 · {keyLabel(bindOf('lock'))} 切换目标· {keyLabel(bindOf('skills'))} 法术书 · {keyLabel(bindOf('sense'))} 神识外放 · {keyLabel(bindOf('conceal'))} 敛息 · {keyLabel(bindOf('char'))} 角色 · {keyLabel(bindOf('bag'))} 储物袋 · {keyLabel(bindOf('alchemy'))} 丹房 · {keyLabel(bindOf('seclude'))} 闭关 · {keyLabel(bindOf('map'))} 地图 · {keyLabel(bindOf('fly'))} 御剑 / 御器</div>}
        {ui.sitting && <div className="sit-banner"><div className="sb-t">打坐修炼中</div><div className="sb-s">2 秒 1 日 · ×{TUNING.meditateSpeed} · 每日 +{ui.expRate.toFixed(1)} 修为 · {ui.place}{ui.bottleneck !== 'none' ? ' · 已至瓶颈' : ''}</div></div>}
        {ui.pendingTalent && panel === '' && <button className="talent-alert" onClick={() => setPanel('char')}>逆天改命机缘已至——点此选择</button>}
        {(ui.gather || ui.gatherP >= 0) && !ui.sitting && panel === '' && (
          <button className="gather-tip" onClick={() => game.tryGather()}>
            {ui.gatherP >= 0 ? <>采集中…<span className="gp"><i style={{ width: `${ui.gatherP * 100}%` }} /></span></> : <>{!isTouch && <kbd>E</kbd>} 采集 {ui.gather!.name}</>}
          </button>
        )}

        {!isTouch && ui.talk && panel === '' && !game.modal && <button className="talk-tip" onClick={() => game.interact()}><kbd>T</kbd> {ui.talk}</button>}
        {/* 地点卡 */}
        {loc && panel === '' && !game.modal && !game.mijing.active && (
          <div className="loc-card" key={loc.id}>
            <div className="loc-head">
              <div className="loc-seal" style={{ background: SEAL_COLOR[loc.type] }}>{loc.seal ?? SEAL[loc.type]}</div>
              <div className="loc-name">{loc.name}</div>
              <div className="loc-type">{loc.label ?? LOC_TYPE_NAME[loc.type]}</div>
            </div>
            <div className="loc-desc">{loc.desc}</div>
            <div className="loc-actions">
              {game.towns.canEnter(loc) ? <button className="ink-btn" onClick={() => { audio.sfx('open'); game.enterTown(); }}>进入<span className="later">（{keyLabel(bindOf('town'))}）</span></button>
                : <span className="hint">{loc.type === 'secret' ? '神识之内，或有机缘' : loc.type === 'danger' ? '凶险之地，量力而行' : loc.type === 'inn' ? '路边歇脚处' : ''}</span>}
            </div>
          </div>
        )}

        {/* 右下按钮（桌面：全部平铺） */}
        {!isTouch && <div className="action-bar">
          <div className="zoom-col">
            <button className="round-btn small" onClick={() => { click(); game.zoomBy(1.25); }}>＋</button>
            <button className="round-btn small" onClick={() => { click(); game.zoomBy(0.8); }}>－</button>
          </div>
          <button className={'round-btn' + (ui.flying ? ' active' : '')} onClick={() => game.toggleFly()} title={`御剑 / 落地（${keyLabel(bindOf('fly'))}）`}>剑<small>{ui.flying ? '落地' : '御剑'}</small></button>
          <button className={'round-btn run-ind' + (ui.run ? ' active' : '')} onClick={() => { audio.sfx('click'); game.input.run = !game.input.run; game.updateUI(true); }} title={`${ui.flying ? '慢行 / 遁光' : '步行 / 疾行'}切换（轻点 ${keyLabel(bindOf('run'))}）`}>{ui.run ? '疾' : ui.flying ? '慢' : '步'}<small>{ui.run ? (ui.flying ? '遁光' : '疾行') : ui.flying ? '慢行' : '步行'}</small></button>
          <button className={'round-btn' + (ui.sitting ? ' active' : '')} onClick={() => game.toggleSit()}>坐<small>{ui.sitting ? '起身' : '打坐'}</small></button>
          <div className="zoom-col">
            <button className={'round-btn small' + (game.senseBurstT > 0 ? ' active' : '')} onClick={() => game.senseBurst()}>识<small>外放</small></button>
            <button className={'round-btn small' + (ui.concealed ? ' active' : '')} onClick={() => game.toggleConceal()}>敛<small>敛息</small></button>
          </div>
          <div className="btn-grid">
            <button className={'round-btn small' + (ui.pendingTalent || ui.bottleneck !== 'none' ? ' glow' : '')} onClick={() => { audio.sfx('open'); setPanel('char'); }}>修<small>角色</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('bag'); }}>袋<small>储物</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('skills'); }}>术<small>法术</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('zhenfa'); }}>阵<small>阵法</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('alchemy'); }}>丹<small>丹器</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('seclude'); }}>关<small>闭关</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('wardrobe'); }}>衣<small>衣橱</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); setPanel('map'); }}>图<small>地图</small></button>
            {(game.hero.realm >= 5 || ACTIVE_WORLD !== 'human' || (game.ws.ascendedWorlds?.length ?? 0) > 0) && (
              <button className="round-btn small" title="上界修行 · 跨界飞升" onClick={() => { audio.sfx('open'); setPanel('higher'); }}>界<small>飞升</small></button>
            )}
            <button className="round-btn small" title="江湖人物（同行 · 道侣 · 亲友 · 仇敌 · 宗门）" onClick={() => { audio.sfx('open'); game.openModal({ kind: 'relations' }); }}>众<small>人物</small>{(() => {
              const n = (game.heartx?.unread ?? 0) + game.friends.S.invites.filter((v) => !v.accepted && !v.done && !v.declined).length + (game.rel?.hunters().filter((d) => d.hunting).length ?? 0);
              return n > 0 ? <i className="btn-badge">{n}</i> : null;
            })()}</button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); game.openModal({ kind: 'chronicle' }); }}>记<small>机缘</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); game.openDialog(game.war.inboxNode()); }}>符<small>玉符</small>{game.war?.unread > 0 && <i className="btn-badge">{game.war.unread}</i>}</button>
            <button className={'round-btn small' + ((game.ws.mySect?.apps.length ?? 0) > 0 || (game.ws.mySect?.tribute ?? 0) >= 1 ? ' glow' : '')}
              title={game.ws.mySect ? `${game.ws.mySect.name} · 宗主大殿 & 天下宗门战事` : '天下宗门 & 战事（元婴及以上可开宗立派）'}
              onClick={() => { audio.sfx('open'); game.openModal({ kind: 'sect', tab: game.ws.mySect ? 'mine' : 'world' }); }}>宗<small>{game.ws.mySect ? '宗门' : '天下'}</small>
              {(game.ws.mySect?.apps.length ?? 0) > 0 && <i className="btn-badge">{game.ws.mySect!.apps.length}</i>}
            </button>
            {game.ws.pets.length > 0 && <button className="round-btn small" title={`灵宠名册（${keyLabel(bindOf('pets'))}）`} onClick={() => { audio.sfx('click'); game.talkPet(); }}>宠<small>灵宠</small></button>}
            <button className="round-btn small" onClick={() => { click(); setPanel('settings'); }}>设<small>设置</small></button>
            <button className="round-btn small" onClick={() => { audio.sfx('open'); game.openModal({ kind: 'help' }); }}>？<small>指南</small></button>
            {modx?.buttons().map((b) => <button key={b.key} className="round-btn small mod-btn" onClick={() => { audio.sfx('open'); b.go(); }}>{b.glyph}<small>{b.label}</small>{b.badge > 0 && <i className="btn-badge">{b.badge}</i>}</button>)}
          </div>
        </div>}

        {/* 手机：右侧一列「菜单 / 疾行 / 御剑 / 交谈」，道侣同行时多一颗；其余收进抽屉 */}
        {isTouch && (
          <div className="touch-side">
            <button className="round-btn small dock-main" onClick={() => { audio.sfx('open'); setDock(true); }}>≡<small>菜单</small></button>
            <button className={'round-btn small run-btn' + (ui.run ? ' active' : '')}
              onClick={() => { audio.sfx('click'); game.input.run = !game.input.run; game.updateUI(true); }}>{ui.run ? '疾' : ui.flying ? '慢' : '步'}<small>{ui.run ? (ui.flying ? '遁光' : '疾行') : ui.flying ? '慢行' : '步行'}</small></button>
            {game.hearts.follower() && <button className="round-btn small lover-btn" onClick={() => { audio.sfx('click'); game.talkLover(); }}>侣<small>道侣</small></button>}
            <button className={'round-btn small fly-btn' + (ui.flying ? ' active' : '')} title={`御剑 / 落地（${keyLabel(bindOf('fly'))}）`}
              onClick={() => { audio.sfx('click'); game.toggleFly(); }}>剑<small>{ui.flying ? '落地' : '御剑'}</small></button>
            <button className={'round-btn small talk-btn' + (ui.talk ? ' on' : '')}
              onClick={() => { audio.sfx('click'); game.interact(); }}>谈<small>{talkName}</small>
            </button>
          </div>
        )}

        {/* 手机：功能抽屉 */}
        {isTouch && dock && (
          <div className="dock-mask" onClick={() => setDock(false)}>
            <div className="dock-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="dock-head"><span className="dock-title">诸般法门</span><button className="close-btn" onClick={() => setDock(false)}>×</button></div>
              <div className="dock-grid">
                {([
                  { t: '修', n: '角色', glow: !!(ui.pendingTalent || ui.bottleneck !== 'none'), go: () => setPanel('char') },
                  { t: '袋', n: '储物袋', go: () => setPanel('bag') },
                  { t: '云', n: '云存档', go: () => setPanel('cloud') },
                  { t: '术', n: '法术书', go: () => setPanel('skills') },
                  { t: '阵', n: '阵法盘', go: () => setPanel('zhenfa') },
                  { t: '丹', n: '丹器', go: () => setPanel('alchemy') },
                  { t: '关', n: '闭关', go: () => setPanel('seclude') },
                  { t: '衣', n: '衣橱', go: () => setPanel('wardrobe') },
                  { t: '图', n: '地图', go: () => setPanel('map') },
                  ...((game.hero.realm >= 5 || ACTIVE_WORLD !== 'human' || (game.ws.ascendedWorlds?.length ?? 0) > 0) ? [{ t: '界', n: '飞升', go: () => setPanel('higher') }] : []),
                  { t: '众', n: '江湖人物', badge: (game.heartx?.unread ?? 0) + game.friends.S.invites.filter((v) => !v.accepted && !v.done && !v.declined).length + (game.rel?.hunters().filter((d) => d.hunting).length ?? 0), go: () => game.openModal({ kind: 'relations' }) },
                  { t: '记', n: '机缘', go: () => game.openModal({ kind: 'chronicle' }) },
                  { t: '符', n: '玉符', badge: game.war?.unread, go: () => game.openDialog(game.war.inboxNode()) },
                  { t: '坐', n: ui.sitting ? '起身' : '打坐', on: ui.sitting, go: () => game.toggleSit() },
                  { t: '识', n: '外放', on: game.senseBurstT > 0, go: () => game.senseBurst() },
                  { t: '敛', n: '敛息', on: ui.concealed, go: () => game.toggleConceal() },
                  { t: '宗', n: game.ws.mySect ? '宗门' : '天下宗门', glow: (game.ws.mySect?.apps.length ?? 0) > 0, badge: game.ws.mySect?.apps.length, go: () => game.openModal({ kind: 'sect', tab: game.ws.mySect ? 'mine' : 'world' }) },
                  ...(game.ws.pets.length > 0 ? [{ t: '宠', n: '灵宠', go: () => game.talkPet() }] : []),
                  { t: '设', n: '设置', go: () => setPanel('settings') },
                  { t: '？', n: '指南', go: () => game.openModal({ kind: 'help' }) },
                  ...(modx?.buttons().map((b) => ({ t: b.glyph, n: b.label, badge: b.badge, go: b.go })) ?? []),
                ] as { t: string; n: string; glow?: boolean; on?: boolean; badge?: number; go: () => void }[]).map((b) => (
                  <button key={b.n} className={'dock-item' + ('glow' in b && b.glow ? ' glow' : '') + ('on' in b && b.on ? ' on' : '')}
                    onClick={() => { audio.sfx('open'); setDock(false); b.go(); }}>
                    <span className="di-t">{b.t}</span>
                    <span className="di-n">{b.n}</span>
                    {'badge' in b && b.badge ? <i className="btn-badge">{b.badge}</i> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {isTouch && <Joystick game={game} />}
        {!ui.dead && <Hotbar game={game} touch={isTouch} />}
      </div>

      {panel === 'map' && <WorldMapPanel game={game} onClose={() => setPanel('')} onOpenHigher={() => setPanel('higher')} />}
      {panel === 'settings' && <SettingsPanel game={game} onClose={() => setPanel('')} onExit={onExit} onSaves={() => setPanel('save')} />}
      {panel === 'char' && <CharPanel game={game} onClose={() => setPanel('')} onOpenHigher={() => setPanel('higher')} />}
      {panel === 'bag' && <BagPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'alchemy' && <AlchemyPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'seclude' && <SecludePanel game={game} onClose={() => setPanel('')} />}
      {panel === 'higher' && <HigherPlanePanel game={game} onClose={() => setPanel('')} />}
      {panel === 'skills' && <SkillPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'zhenfa' && <ZhenfaPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'friends' && <FriendsPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'save' && <SavePanel game={game} onClose={() => setPanel('')} onCloud={() => setPanel('cloud')} />}
      {panel === 'wardrobe' && <WardrobePanel game={game} onClose={() => setPanel('')} />}
      {panel === 'cloud' && <CloudPanel game={game} onClose={() => setPanel('')} />}
      {cave && <CaveScene game={game} onClose={() => game.leaveCave()} />}
      <ModalLayer game={game} />
      <PursuitHUD game={game} />
      <SectBattleHUD game={game} />
      <BossHUD game={game} />
      {!(game.tianxiang.active || game.cinemaHideHud) && (
        <>
          <div className="toasts">{urgentOnly.map((t) => <div key={t.id} className={'toast' + (t.kind === 'warn' ? ' warn' : '')}>{t.text}</div>)}</div>
          {region && <div key={region.id} className="region-banner"><div className="brush" /><div className="t">{region.text}</div></div>}
        </>
      )}
      <GainOverlay />
      {travelFx && <div className={'travel-fx ' + travelFx.via}>
        {travelFx.via === 'portal' && <><div className="tf-ring" /><div className="tf-ring r2" /><div className="tf-flash" /></>}
        <div className="tf-text"><div className="tf-to">{MAP_NAME[travelFx.to]}</div><div className="tf-sub">{travelFx.via === 'portal' ? '阵光冲天，虚空挪移……' : '破空横渡，千里一瞬……'}</div></div>
      </div>}
      {ui.dead && <DeathScreen game={game} onExit={onExit} />}
    </div>
  );
}
