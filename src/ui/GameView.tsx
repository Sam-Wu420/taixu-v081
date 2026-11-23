import { ModalLayer } from './ModalLayer';
import { ModHuds } from './ModUi';
import { modx } from '../mod/hooks';
import { spriteJobs } from '../gfx/spriteJobs';
import { sprites } from '../gfx/sprites';
import { prof } from '../core/prof';
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as RPointerEvent } from 'react';
import type { Game, UIState } from '../world/game';
import { FOG_CELL } from '../world/game';
import { audio } from '../world/audio';
import { realmName } from '../data/realms';
import { LOCATIONS, LOC_BY_ID, WORLD_SCALE, MAP_NAME, MapId, ACTIVE_MAP } from '../data/world';
import { SECT_RANKS } from '../world/worldstate';

/** 宗门差事的种类名（SectTask.kind） */
const TASK_KIND_NAME: Record<string, string> = { kill: '猎杀', gather: '采集', deliver: '护送', patrol: '巡查' };
import { SettingsPanel, WorldMapPanel, makeFogCanvas, SEAL, SEAL_COLOR, loadAudio } from './Panels';
import { bindOf, keyLabel } from '../core/keymap';
import { Hotbar, SkillPanel } from './CombatUI';
import { BrawlHUD } from './BrawlHUD';
import { ZhenfaPanel } from './ZhenfaPanel';
import { FriendsPanel } from './FriendsPanel';
import { RealmHUD } from './RealmHUD';
import { CharPanel, BagPanel, AlchemyPanel, SecludePanel, SavePanel, DeathScreen } from './CultPanels';
import { GainOverlay } from './GainOverlay';
import { PursuitHUD, FlyHud } from './PursuitHUD';
import { SectBattleHUD } from './SectBattleHUD';
import { BossHUD } from './BossHUD';
import { hpfx } from './hpfx';   // r11-lock：血条打击感
import { LockPress, LOCK_HOLD_MS, lockButtonTap, lockButtonHold, lockButtonState } from '../world/locktarget';   // r13-lockbtn：手机「锁」按钮的判定
import { PartyFrames } from './PartyFrames';
import { FeudHud } from './FeudHud';   // 恩怨重做：顶上的热度血印
import { ChuanyinBadge, EnyuanTop, EnyuanPanels } from './Enyuan';   // 恩怨重做 · 第二批
import { WardrobePanel } from './Wardrobe';
import { CloudPanel } from './CloudPanel';
import { CaveScene } from './CaveScene';
import { joyFromDrag, JOY_REACH } from './joystick';   // r15-touchctl：摇杆推力换算（拉到边缘满速）
import { LayerGuard } from './LayerGuard';
import { ToastStrip } from './ToastStrip';   // r14-toast：「讯」角标、手机单行消息、消息记录
import { useTouch, useHudScale } from './kit';
import { preloadUiArt } from './kit/preload';   // 第五轮：储物袋底图、匾额、角花先拿下来   // 收官 H3：触屏状态可订阅、界面大小
import { CharPlaque, BuffRow, QuestColumn, ContextHints, HelpHint, ActionRing, TouchDock, drawerItems, useHudRects, type PanelOpener } from './Hud';   // 收官 H3：主界面各块
import { Compass, SeaButtons, JyStatus } from './Compass';   // 绝域的界面（world/jueyu.ts）；收官 B3 的海上圆钮
import { Coach } from './Coach';
import { CutIn } from './CutIn';   // r7：定格特写（world/impactfx.ts）
import { P2Show } from './P2Show';   // r8-p2：撼山客第二阶段的界面元素
import { HanshanQuake } from './HanshanQuake';   // r7：撼山客的动静   // 收官 I：新手引导的高亮与气泡（world/tutorial.ts）
import './screens.css';
import './hud.css';   // 收官 H3：主界面网格分区、电脑 / 手机横屏 / 手机竖屏三套版面   // 收官 H2：特殊弹窗与全屏层（舆图外壳、衣橱、破禁、坐化、洞府顶栏、获宝、过场、区域横幅）

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
  return useSyncExternalStore((f) => game.subscribe(f), () => game.ui, () => game.ui);   // 第三个参数：服务端渲染（tools/test-ui 冒烟）也能出
}
function useToasts(game: Game) {
  return useSyncExternalStore((f) => game.subscribeToasts(f), () => game.toasts, () => game.toasts);
}

// ---------- 小地图 ----------
// 第二十步：可缩放（滚轮 / ＋－ 按钮，记住档位），放大时用局部高清底图（分帧生成、缓存），
// 地名按重要程度排序、互不重叠：城 > 宗 > 镇 > 岛 > 险地 / 秘境 > 小村小洞；放大后显示地名。
const MM_SPANS = [150, 90, 52, 30, 15, 10];   // 每档显示的宏观单位跨度（1 单位 = 300 世界像素）；最大档 150/10 = 15 倍放大
const MM_KEY = 'taixu.minimapZoom';
/** 小地图上没探明的地方盖多厚的雾（0–1）：山川河路隔着一层薄雾看得见个大概，地名印章仍要探明才出；世界地图照旧盖实 */
const MM_FOG = 0.6;
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
    // 高清底图块（缓存）
    const tileFor = (tx: number, ty: number, scale: number, T: number) => {
      const key = `${tx},${ty},${scale}`;
      let t = tiles.get(key);
      if (!t) {
        const c = document.createElement('canvas'); c.width = c.height = T * scale;
        t = { cv: c, scale, T, tx, ty, used: frame };
        // 底色：无图标的缩略底图平滑放大（颜色本就是低频的）；其上按本档分辨率画清晰的河、路、山林图标
        const tg = c.getContext('2d')!; tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        const base = game.terrain.overviewBase ?? game.overview;
        tg.drawImage(base, tx * T - 1, ty * T - 1, T + 2, T + 2, -scale, -scale, (T + 2) * scale, (T + 2) * scale);
        game.terrain.overviewVectors(tg, tx * T, ty * T, T * scale, T * scale, scale);
        tiles.set(key, t);
        if (tiles.size > 256) { // 丢掉最久没用的
          let old: string | null = null, ou = Infinity; for (const [k2, v] of tiles) if (v.used < ou && v !== t) { ou = v.used; old = k2; }
          if (old) tiles.delete(old);
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
        // 视野伸到图外（飞在天穹草原、无边海上）：图外那一圈照当地的地色画，不再是一片空白纸
        const TW = game.terrain.W, TH = game.terrain.H;
        if (game.terrain.seam && (mx - SPAN / 2 < 0 || my - SPAN / 2 < 0 || mx + SPAN / 2 > TW || my + SPAN / 2 > TH)) {
          const n = 44, cw = cv.width / n, rgb = [0, 0, 0];
          for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const ux = mx - SPAN / 2 + (i + 0.5) / n * SPAN, uy = my - SPAN / 2 + (j + 0.5) / n * SPAN;
            if (ux >= 0.5 && uy >= 0.5 && ux < TW - 0.5 && uy < TH - 0.5) continue;
            game.terrain.groundColor(ux * WORLD_SCALE, uy * WORLD_SCALE, rgb);
            g.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`; g.fillRect(i * cw - 0.5, j * cw - 0.5, cw + 1, cw + 1);
          }
        }
        g.drawImage(game.overview, mx - SPAN / 2, my - SPAN / 2, SPAN, SPAN, 0, 0, cv.width, cv.height);
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
        // 迷雾图一格是 FOG_CELL 世界像素、合 FOG_CELL / WORLD_SCALE 个宏观单位。原来这里写死「除以 10」（按一格十个单位取），
        // 实际一格只有三个多单位——取到的是地图上别处的迷雾，主角脚下探明的那一片永远对不上，小地图就成了一张白纸
        { const fk = WORLD_SCALE / FOG_CELL; g.globalAlpha = MM_FOG; g.drawImage(fogCv, (mx - SPAN / 2) * fk, (my - SPAN / 2) * fk, SPAN * fk, SPAN * fk, 0, 0, cv.width, cv.height); g.globalAlpha = 1; }
        // 地名：按重要程度依次放，互不重叠
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const boxes: number[] = [];
        const free = (x0: number, y0: number, x1: number, y1: number) => { for (let i = 0; i < boxes.length; i += 4) if (x0 < boxes[i + 2] && x1 > boxes[i] && y0 < boxes[i + 3] && y1 > boxes[i + 1]) return false; return true; };
        const zoomed = ppu > 2.4, close = ppu > 4.2;
        const R0 = (ppu < 1.6 ? 3.6 : ppu < 2.4 ? 4.3 : ppu < 4.2 ? 5 : 5.6) * dpr;
        const fs = 10.5 * dpr;
        for (const l of sorted) {
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
      const key = `${SPAN.toFixed(2)}|${game.ui?.explored ?? 0}|${dpr}|${game.revealAll ? 1 : 0}`;
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
      drawHanshanMM(game, g, mx, my, k, c, cv.width, dpr);   // r7：撼山客——近处一个金色菱形点；有动静时边缘一个朝他的震动标记
      g.strokeStyle = 'rgba(47,140,120,0.85)'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(c, c, Math.max(4 * dpr, (game.senseRadius / WORLD_SCALE) * k), 0, Math.PI * 2); g.stroke();
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
      g.save(); g.translate(c, c); g.scale(dpr, dpr);
      g.fillStyle = '#a8352a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.restore();
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); zoomBy(e.deltaY < 0 ? 1 : -1); };
    cv.addEventListener('wheel', wheel, { passive: false });
    draw();
    const un = game.subscribe(draw);
    return () => { un(); cv.removeEventListener('wheel', wheel); };
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

/** r7：小地图上的撼山客（world/hanshan.ts）：近处是一个和普通人不一样的点（金色菱形、深色描边，惹怒时发红）；
 *  他在两万以内和妖兽打架时，小地图边缘朝他那边一个抖动的「))」震动标记 */
function drawHanshanMM(game: Game, g: CanvasRenderingContext2D, mx: number, my: number, k: number, c: number, W: number, dpr: number) {
  const H = game.hanshan; if (!H) return;
  const d = H.dot();
  if (d) {
    const dx = (d.x / WORLD_SCALE - mx) * k + c, dy = (d.y / WORLD_SCALE - my) * k + c, r = 3.6 * dpr;
    if (dx > -r && dy > -r && dx < W + r && dy < W + r) {
      g.save(); g.translate(dx, dy); g.rotate(Math.PI / 4);
      g.fillStyle = d.angry ? '#e0503a' : '#f0b860'; g.strokeStyle = '#2a1a0e'; g.lineWidth = 1.4 * dpr;
      g.fillRect(-r / 2 - 0.5 * dpr, -r / 2 - 0.5 * dpr, r + dpr, r + dpr); g.strokeRect(-r / 2 - 0.5 * dpr, -r / 2 - 0.5 * dpr, r + dpr, r + dpr);
      g.restore();
    }
  }
  const q = H.quakeInfo();
  if (q) {
    const now = performance.now(), R = W / 2 - 9 * dpr, jit = Math.sin(now / 37) * 1.2 * dpr;
    const ex = c + Math.cos(q.ang) * (R + jit), ey = c + Math.sin(q.ang) * (R + jit), pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 260));
    g.save(); g.translate(ex, ey); g.rotate(q.ang);
    g.strokeStyle = `rgba(200,70,30,${(0.5 + 0.45 * q.k) * pulse})`; g.lineWidth = 1.8 * dpr; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const rr = (3 + i * 3.2) * dpr; g.beginPath(); g.arc(-6 * dpr, 0, rr, -0.75, 0.75); g.stroke(); }
    g.fillStyle = `rgba(200,70,30,${0.85 * pulse})`; g.beginPath(); g.arc(-6 * dpr, 0, 1.8 * dpr, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

// ---------- 摇杆 ----------
// v0.52.4：推力写进 input.joyMag —— 推到底（>0.86）自动疾行，摇杆外圈会亮一圈
// 移植版 530843f / 658a4a8 修复搬入：
// 1) 拖动期间 window 上监听 pointermove/up，手指拖出摇杆范围不丢事件；
// 2) 输入向量 = 单位方向 × 力度（不能用夹紧后的位移除以真实位移，否则拖得越远越慢）。
function Joystick({ game }: { game: Game }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [mag, setMag] = useState(0);
  const active = useRef<number | null>(null);
  // r15-touchctl：推力换算挪到 ui/joystick.ts（方向一律单位向量，推力线性，拉出圈外不衰减）
  const move = (e: React.PointerEvent) => {
    const el = base.current!, r = el.getBoundingClientRect();
    const R = r.width / 2;
    const j = joyFromDrag(e.clientX - (r.left + R), e.clientY - (r.top + R), R * JOY_REACH);
    // 摇杆头的位移写在 zoom（界面大小）过的盒子里：屏幕上量到的像素除回去，头才正好跟着手指
    const s = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
    setKnob({ x: j.kx / s, y: j.ky / s });
    setMag(j.mag);
    game.input.joyMag = j.mag; game.input.joy.x = j.x; game.input.joy.y = j.y;
  };
  const end = (e?: React.PointerEvent) => {
    if (e && active.current !== null && e.pointerId !== active.current) return;   // 别的手指（按「升」「降」、技能）抬起不算松摇杆
    active.current = null; setKnob({ x: 0, y: 0 }); setMag(0); game.input.joy.x = 0; game.input.joy.y = 0; game.input.joyMag = 0;
  };
  useEffect(() => () => { game.input.joy.x = 0; game.input.joy.y = 0; game.input.joyMag = 0; }, [game]);
  return (
    <div className={'joystick' + (mag > 0.86 ? ' fast' : '')} ref={base}
      onPointerDown={(e) => { audio.unlock(); active.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ } move(e); }}
      onPointerMove={(e) => { if (active.current === e.pointerId) move(e); }}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
      <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      <span className="joystick-hint">疾行</span>
    </div>
  );
}

// ---------- 手机：御剑时的升降（按住）----------
// 收官 I：电脑右下有「升」「降」（ActionRing），手机以前没有，只能靠飞得快慢自然起落；入门一课的御剑那步也要用
// r15-touchctl：挪到右手边（和「剑」一竖排，在它上面），左手推摇杆、右手按住升降。
//   每根手指各记各的（按 pointerId）：一根手指松开只撤它自己那一下，摇杆那根手指的抬起、移动跟这里无关；
//   按下就抓住触点（setPointerCapture），手指在钮上稍微滑出去也不断；没按住的那一刻 climb 归零，卸下时也归零。
function ClimbPad({ game, alt }: { game: Game; alt: string }) {
  const held = useRef(new Map<number, 1 | -1>());
  const [on, setOn] = useState(0);   // 按着的方向（只给按钮换样子）
  const sync = () => {
    let s = 0; for (const v of held.current.values()) s += v;
    const d = s > 0 ? 1 : s < 0 ? -1 : 0;
    game.input.climb = d; setOn(d);
  };
  useEffect(() => () => { held.current.clear(); game.input.climb = 0; }, [game]);
  const down = (d: 1 | -1) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); audio.unlock();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
    held.current.set(e.pointerId, d); sync();
  };
  const upE = (e: React.PointerEvent) => { e.stopPropagation(); if (held.current.delete(e.pointerId)) sync(); };
  const ev = (d: 1 | -1) => ({ onPointerDown: down(d), onPointerUp: upE, onPointerCancel: upE, onLostPointerCapture: upE, onContextMenu: (e: React.MouseEvent) => e.preventDefault() });
  return (
    <div className="climb-pad">
      <button className={'round-btn small up' + (on > 0 ? ' held' : '')} aria-label="按住上升" {...ev(1)}>升<small>{alt}</small></button>
      <button className={'round-btn small dn' + (on < 0 ? ' held' : '')} aria-label="按住下降" {...ev(-1)}>降<small>下降</small></button>
    </div>
  );
}

// ---------- 手机：「剑」御剑 / 落地 ----------
// r15-touchctl：从菜单抽屉里拿出来，放在右手边（横屏在侧边一列左边、竖屏在「架」上面），飞起来以后「升」「降」出在它上面、它自己不挪地方。按下即起落（不等 click：
// 左手按着摇杆时，第二根手指的轻点在有的手机上不出 click）；飞着时青玉底、外圈一道光环慢慢转（只动 transform / opacity）。
function FlyButton({ game, flying }: { game: Game; flying: boolean }) {
  return (
    <button data-k="fly" className={'round-btn small fly-btn' + (flying ? ' active flying' : '')} aria-pressed={flying} aria-label={flying ? '落地' : '御剑'}
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); audio.sfx('click'); game.toggleFly(); }}
      onClick={(e) => { if (e.detail === 0) { audio.sfx('click'); game.toggleFly(); } }}   // 键盘（回车 / 空格）点的
      onContextMenu={(e) => e.preventDefault()}>
      剑<small>{flying ? '落地' : '御剑'}</small>
      <i className="fly-aura" aria-hidden />
    </button>
  );
}

// v0.60：元婴之后，任务栏下多一枚「开宗立派 / 本宗」的牌子——点开就是宗主大殿（人在天涯海角也能以传讯令牌理事）
function MySectChip({ game }: { game: Game }) {
  useUI(game);
  const s = game.ws.mySect;
  if (!s && game.hero.realm < 4) return null;
  return (
    <div className="sect-tracker" style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); game.openDialog(game.mysect.node()); }}>
      <div className="st-head">{s ? `${s.name} · 宗主` : '开宗立派'}</div>
      <div className="st-row">{s ? `门人 ${s.ds.length} · 库房 ${Math.floor(s.stones)}${s.tribute >= 1 ? ` · 待领供奉 ${Math.floor(s.tribute)}` : ''}${s.apps.length ? ` · 求拜 ${s.apps.length} 人` : ''}` : '元婴已成，可在此处自立山门（点此）'}</div>
    </div>
  );
}

// ---------- 手机：「锁」按钮 ----------
// r13-lockbtn：手机上没有 Tab 键，以前只能点单位锁定、又没任何提示。侧边一列（「闪」上面）加一枚「锁」：
//   点一下锁最合适的（敌对的先、近的先），再点换下一个，长按取消锁定（判定在 world/locktarget.ts，test-lock 测）；
//   锁着时朱红印章色，附近没有能锁的变灰（点了给一句短提示）。按着时外圈一道金环慢慢收拢，到点即取消——只动 transform / opacity。
const LOCK_NONE_TIP = '附近没有能锁定的目标';
function LockButton({ game }: { game: Game }) {
  const [st, setSt] = useState<'on' | 'idle' | 'none'>(() => lockButtonState(game.combat));
  const [holding, setHolding] = useState(false);
  const [tip, setTip] = useState<{ t: string; n: number } | null>(null);   // 按钮旁的一句短提示（顶上消息手机上一次只出一条、常排着队，等轮到就晚了）
  const press = useRef(new LockPress());
  const timer = useRef(0), tipT = useRef(0);
  const say = (t: string) => { setTip((o) => ({ t, n: (o?.n ?? 0) + 1 })); clearTimeout(tipT.current); tipT.current = window.setTimeout(() => setTip(null), 1800); };
  const refresh = () => setSt(lockButtonState(game.combat));
  useEffect(() => {
    const t = window.setInterval(refresh, 200);   // 五分之一秒看一次：锁着的人死了、走远了，按钮跟着变
    return () => { clearInterval(t); clearTimeout(timer.current); clearTimeout(tipT.current); };
  }, [game]);
  const hold = () => { if (lockButtonHold(game.combat)) { audio.sfx('click'); try { navigator.vibrate?.(18); } catch { /* 不支持震动 */ } } refresh(); };
  const tap = () => {
    const r = lockButtonTap(game.combat);   // 锁上 / 换人时「咔」一声由 LockTrack 出（同 Tab）
    if (r === 'none') { audio.sfx('click'); say(LOCK_NONE_TIP); }
    else if (r === 'only') { audio.sfx('click'); say('只有这一个目标 · 长按取消'); }
    refresh();
  };
  const end = (e: React.PointerEvent, cancel = false) => {
    e.stopPropagation(); clearTimeout(timer.current); setHolding(false);
    if (cancel) { press.current.cancel(); return; }
    const r = press.current.up(performance.now());
    if (r === 'tap') tap(); else if (r === 'hold') hold();
  };
  return (
    <button className={'round-btn small lock-btn ' + st + (holding ? ' holding' : '')} aria-label={st === 'none' ? LOCK_NONE_TIP : '锁定目标：点一下锁定 / 换下一个，长按取消'}
      onPointerDown={(e) => {
        e.stopPropagation(); e.preventDefault(); audio.unlock();
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* 合成事件 */ }
        press.current.down(performance.now()); setHolding(st === 'on');
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { if (press.current.poll(performance.now())) { setHolding(false); hold(); } }, LOCK_HOLD_MS + 15);
      }}
      onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}
      onContextMenu={(e) => e.preventDefault()}>
      锁<small>锁定</small>
      {tip && <span key={tip.n} className="lock-tip" role="status">{tip.t}</span>}
    </button>
  );
}

// ---------- 性能监视（F3）----------
function PerfHud({ game }: { game: Game }) {
  const [, f] = useState(0);
  useEffect(() => { const t = setInterval(() => f((x) => x + 1), 500); return () => clearInterval(t); }, []);
  if (!game.showPerf) return null;
  const p = game.perf, r = game.renderer;
  return <div className="perf-hud">
    逻辑 {p.updMs.toFixed(1)}ms · 绘制 {p.renMs.toFixed(1)}ms<br />
    {r?.stage
      ? <>{r.stage.softGPU ? <b style={{ color: '#d8534a' }}>⚠ 软件渲染（显卡没用上）</b> : '显卡'} {r.stage.gpuName.slice(0, 46)}<br /></>
      : <>Canvas2D 兼容渲染<br /></>}
    {r?.stage ? `WebGL · ${r.stage.W}×${r.stage.H} · ${r.stage.drawCalls} 次绘制 · 粒子 ${r.fx?.count ?? 0}` : 'Canvas2D'} · 世界层 ×{r?.dpr.toFixed(2)} · 画质 {['低', '中', '高'][r?.tier ?? 2]}<br />
    {p.fps.toFixed(0)} fps · 最慢一帧 {p.worstMs.toFixed(0)}ms · 卡顿(&gt;50ms) {r?.spikes ?? 0} 次{r?.stage?.gpuMs ? ` · GPU ${r.stage.gpuMs.toFixed(1)}ms` : ''}<br />
    {r?.stage?.gpuSec && Object.keys(r.stage.gpuSec).length ? <>GPU分段 {Object.entries(r.stage.gpuSec).map(([k2, v]) => `${k2} ${(v as number).toFixed(1)}`).join(' / ')}<br /></> : null}
    {r?.stage?.ground?.front ? `地表缓存 ${r.stage.ground.front.W}×${r.stage.ground.front.H} · 重画 ${r.stage.ground.rebuilds} 次` : '地表 —'} · 自动降档 {r?.qualityLevel ?? 0}/3<br />
    {(() => { const j = spriteJobs(); const st = sprites.stats; return `精灵 ${st.n} 张 ${st.mpx}MP · 后台生成 ${j.ok ? `开（${j.done} 张，均 ${j.avgMs.toFixed(0)}ms，排队 ${j.queued}）` : '关（主线程）'}`; })()}<br />
    树 {r?.stats.trees} · 草 {r?.stats.grass} · 敌 {game.combat.enemies.length} · NPC {game.npcs?.list.length ?? 0}
    {r?.stage?.ground ? ` · 地表本帧 ${((r.stage.ground as any).texelsThisFrame / 1000).toFixed(1)}k 纹素` : ''}<br />
    <span className="perf-top">{prof.report(8).map((x) => `${x.k} ${x.ms.toFixed(1)}`).join(' · ')}</span><br />
    {prof.spikes.length ? <>最近卡顿：{prof.spikes.slice(-2).map((x) => `${x.ms}ms←${x.top.map((y) => y.k).join('/')}`).join('；')}<br /></> : null}
    <button className="perf-btn" onClick={() => {
      const head = `taixu ${navigator.userAgent}\n${r?.stage ? `WebGL ${r.stage.W}×${r.stage.H} 绘制${r.stage.drawCalls}` : 'Canvas2D'} 世界层×${r?.dpr.toFixed(2)} 降档${r?.qualityLevel ?? 0} fps ${p.fps.toFixed(0)} 最慢 ${p.worstMs.toFixed(0)}ms 逻辑 ${p.updMs.toFixed(1)} 绘制 ${p.renMs.toFixed(1)}${r?.stage?.gpuMs ? ` GPU ${r.stage.gpuMs.toFixed(1)}` : ''}\n位置 ${Math.round(game.player.x)},${Math.round(game.player.y)} ${game.player.flying ? '飞行' : '步行'} 敌${game.combat.enemies.length} NPC${game.npcs?.list.length ?? 0}${r?.stage?.gpuSec && Object.keys(r.stage.gpuSec).length ? `\nGPU分段 ${Object.entries(r.stage.gpuSec).map(([k, v]) => `${k} ${(v as number).toFixed(1)}`).join(' / ')}` : ''}${r?.stage?.ground?.front ? `\n地表缓存 ${r.stage.ground.front.W}×${r.stage.ground.front.H} 重画${r.stage.ground.rebuilds} 开工${r.stage.ground.jobsStarted} 纹素/帧 ${Math.round(r.stage.groundTexels / 1000)}k 缩放${game.cam.zoom.toFixed(2)}` : ''}`;
      const txt = prof.text(head);
      try { navigator.clipboard.writeText(txt); } catch { /* 无剪贴板权限 */ }
      console.log(txt);
    }}>复制性能报告</button> <button className="perf-btn" onClick={() => prof.reset()}>重新计时</button>
  </div>;
}

// ---------- 主界面 ----------
// 收官 H3：主界面重排。以前二十多个元素各自绝对定位、互相撞（帮助条压人物牌、按钮网格压快捷栏和地点卡、手机上招牌被横幅盖住）；
// 现在 .hud 是一张 CSS 网格，分成几个区（data-hz），每区里的东西竖排、跟着内容长短走，谁也压不到谁：
//   电脑    左上 tl：人物牌、增益行 ┊ 顶栏 top：虚空读数 / 区域横幅 / 妖王血条 / 追杀条 / 目标框 / 消息 ┊ 右上 tr：日期、小地图（罗盘）、秘境图
//           左中 lc：队伍框、任务列（带插槽）、模组左上 HUD
//           左下 bl：键位提示「？」、模组左下 HUD ┊ 底部 bc：情境提示（叠在快捷栏上方）、遁光读数、快捷栏 ┊ 右下 br：常用键一圈 + 更多抽屉
//   手机横屏 / 竖屏各一套网格（styles 在 hud.css）：左下摇杆、右下拇指弧线上的法诀盘、菜单抽屉。
// 每区用 zoom: var(--hud-scale) 整体缩放（设置里的「界面大小」）；zoom 会参与排版，放大以后各区照样不重叠（transform 缩放做不到）。
// 模组契约：.mod-hud.pos-* 分到对应的区里画；.round-btn.mod-btn 在「更多」抽屉里；五个 ModSlot 在各面板里，没动。
export function GameView({ game, onExit }: { game: Game; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  type PanelId = '' | 'map' | 'settings' | 'char' | 'bag' | 'alchemy' | 'seclude' | 'save' | 'skills' | 'wardrobe' | 'cloud' | 'zhenfa' | 'friends';
  const [panel, setPanel] = useState<PanelId>('');
  // v0.57：模组替换了这个原版面板——改开模组的面板
  useEffect(() => {
    if (!panel || !modx) return;
    const r = modx.replacePanel(panel);
    if (r) { setPanel(''); setTimeout(() => game.openModal({ kind: 'mod', mod: r.mod, panel: r.panel }), 0); }   // 等这一轮的「开面板先关对话」处理完再开
  }, [panel]);
  const [dock, setDock] = useState(false);
  const [drawer, setDrawer] = useState(false);   // 电脑右下「更多」抽屉
  const [cave, setCave] = useState(false);  // v0.52.5：洞府独立场景
  const [travelFx, setTravelFx] = useState<{ to: MapId; via: 'portal' | 'edge' } | null>(null);
  const isTouch = useTouch();   // 收官 H3：转屏、接鼠标、拖窄窗口都会重新判定
  const hudScale = useHudScale();
  const drawerRef = useRef(drawer); drawerRef.current = drawer;
  const panelRef = useRef(panel); panelRef.current = panel;
  // r11-lock：血条打击感的画布（盖在界面上，不接点击）；低画质档只留闪光
  const hpfxRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const cv = hpfxRef.current; if (!cv) return; hpfx.attach(cv); hpfx.tier = () => game.renderer?.tier ?? 2; return () => hpfx.detach(cv); }, [game]);   // r11-lock：Esc 先取消手动锁定（没开面板时）

  useEffect(() => {
    loadAudio();
    game.attach(canvasRef.current!);
    game.onOpenMap = () => { audio.sfx('open'); setPanel((p) => (p === 'map' ? '' : 'map')); };
    game.chat?.probe();   // 太虚问道录：看看有没有对话后端
    game.onPanel = (id, force) => { audio.sfx('open'); setPanel((p) => (force ? id : p === id ? '' : id)); };
    game.onCave = (on) => { setCave(on); if (!on) setPanel(''); };
    // v0.52.9：React 卸载 / 热更新后 game.onCave 还指着旧闭包时，洞府场景会「说开没开、说关没关」——
    // 卸载时把回调摘掉并关掉场景状态，下次挂载重新绑定
    // （这一条兜住的是「进洞府后又触发一次组件重挂」这一类黑屏）
    // 换图：先放一段过场（传送阵白光 / 草原远行的水墨淡出），再存档重载
    game.onTravel = (to, via) => {
      setPanel('');
      // 跨图：先在虚空甬道里飞一段，再切换地图（目前切图仍要重新载入页面）；没有立体画面时沿用原来的遮罩过场
      if (game.nuoyi.start({ kind: via === 'portal' ? 'ancient' : 'edge', leaves: true, arrive: () => game.switchMap(to) })) return;
      game.paused = true; audio.sfx(via === 'portal' ? 'thunder' : 'whoosh'); setTravelFx({ to, via }); setTimeout(() => game.switchMap(to), via === 'portal' ? 2200 : 2600);
    };
    const unload = () => game.save(0);
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawerRef.current) { setDrawer(false); return; }   // 先收「更多」抽屉
        if (game.modal) { game.closeModal(); return; }
        if (!panelRef.current && game.combat.unlock()) { audio.sfx('click'); return; }   // r11-lock：手动锁着人时，Esc 先取消锁定（回到自动锁最近的敌人），再按一次才开设置
        setPanel((p) => (p ? '' : 'settings'));
        return;
      }
      // 收官 H3：「更多」抽屉的键（keymap 的 hudmore，可改键）；输入框里打字不算
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key.toLowerCase() === bindOf('hudmore') && !game.modal) { audio.sfx('click'); setDrawer((o) => !o); }
    };
    window.addEventListener('keydown', esc);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('visibilitychange', unload);
    return () => {
      game.detach(); game.onOpenMap = undefined; game.onPanel = undefined; game.onTravel = undefined; game.onAscend = undefined; game.onCave = undefined; setCave(false);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('visibilitychange', unload);
      window.removeEventListener('keydown', esc);
    };
  }, [game]);

  useEffect(() => {
    // 开面板就先收掉对话框：否则 z-index 55 的对话会压住 z-index 50 的面板，看着像坏了
    if (panel) { game.closeModal(true); setDrawer(false); }
    game.paused = panel !== '' || dock;
    game.input.keys.clear();
    game.tutorial.panel = panel; game.tutorial.dock = dock;   // 收官 I：新手引导要知道开着哪个面板（储物袋、地图那几步）
  }, [panel, dock]);
  useEffect(() => { if (isTouch) setDrawer(false); else setDock(false); }, [isTouch]);
  useEffect(() => { game.toastMax = isTouch ? 1 : 2; game.toastTouch = isTouch; }, [game, isTouch]);   // r14-toast：手机的停留时长、排队上限另算
  useEffect(() => { preloadUiArt(); }, []);   // 第五轮：开面板前先把底图拿下来   // 第五轮：顶上消息同时最多几条

  useHudRects(rootRef);
  const ui = useUI(game);
  const toasts = useToasts(game);
  if (!ui) return <canvas ref={canvasRef} className="game-canvas" />;
  const region = toasts.filter((t) => t.kind === 'region').slice(-1)[0];
  const normal = toasts.filter((t) => t.kind !== 'region');   // 第五轮：最多几条由 game.toastMax 管（电脑 2、手机 1），多的排队
  const moreN = game.toastQueue.length;
  const cnYear = cnNum(ui.date.year);
  // 有人可谈时把对方名写进按钮小字（最多三字），比浮一个气泡省地方
  const talkName = ui.talk && ui.talk.startsWith('与') ? (ui.talk.slice(1).replace(/交谈$/, '').slice(0, 3) || '交谈') : '交谈';
  const open: PanelOpener = (id) => { if (id === 'map') { audio.sfx('open'); setPanel('map'); } else setPanel(id as PanelId); };
  const inMijing = game.mijing.active;

  const minimap = (
    <div className="minimap-wrap" style={ui.xukong ? { visibility: 'hidden' } : undefined} title={`打开世界地图（${keyLabel(bindOf('map'))}）`}>
      <Minimap key={game.mapEpoch} game={game} onOpen={() => { audio.sfx('open'); setPanel('map'); }} />
      <div className="minimap-n">北</div>
      <div className="minimap-region">{ui.region}</div>
      <Compass game={game} />{/* 绝域（无边海）：罗盘、小地图锁死、法力流失警示、泅水提示 */}
    </div>
  );

  return (
    <div ref={rootRef} className={'game-root' + (isTouch ? ' touch' : '') + (panel ? ' panel-open' : '')} style={{ ['--hud-scale' as string]: hudScale } as React.CSSProperties}>
      <canvas ref={canvasRef} className="game-canvas" />
      <PerfHud game={game} />
      <EnyuanPanels game={game} />{/* 恩怨重做：江湖传音玉简、通缉榜 */}
      <HanshanQuake game={game} />{/* r7：撼山客在远处打架——屏幕边缘朝他那边的冲击光 */}
      <CutIn game={game} />{/* r7：终结一击的定格特写（半秒） */}<P2Show game={game} />{/* r8-p2：撼山客第二阶段的书法大字、横贯光线、速度线 */}
      <ModHuds only={['center']} />
      <div className="hud" style={(game.tianxiang.active || game.cinemaHideHud) ? { opacity: 0, pointerEvents: 'none', transition: 'opacity 0.55s ease' } : { transition: 'opacity 0.35s ease' }}>
        {/* 左上：人物牌 + 增益行 */}
        <div className="hz hz-tl" data-hz="tl">
          <CharPlaque game={game} ui={ui} />
          <BuffRow game={game} ui={ui} />
          <JyStatus game={game} />{/* 第五轮：灵力流失 / 回复减半的小牌，固定在人物牌下面这一区 */}
          <ToastStrip game={game} toasts={toasts} touch={isTouch} />
          <ChuanyinBadge game={game} />{/* 恩怨重做：江湖传音（有未读只亮数字，不整屏弹） */}{/* r14-toast：手机的消息挪到这里（窄单行、一次一条）；「讯」角标点开是消息记录 */}
        </div>
        {/* 左中：队伍框、任务列、模组左上 HUD */}
        <div className="hz hz-lc" data-hz="lc">
          {ui.party?.length ? <PartyFrames game={game} party={ui.party} /> : null}
          <QuestColumn game={game}><ModHuds only={isTouch ? ['top-left', 'bottom-left'] : ['top-left']} /><MySectChip game={game} /></QuestColumn>
        </div>
        {/* 顶栏堆叠 */}
        <div className="hz hz-top" data-hz="top">
          {ui.xukong && <div className="xukong-read">
            <div className="xk-where">{ui.xukong.where}</div>
            <div className="xk-sub">{ui.xukong.near ? `最近：${ui.xukong.near}` : ''}{ui.xukong.hint ? `　·　${ui.xukong.hint}` : ''}</div>
          </div>}
          {region && <div key={region.id} className="region-banner"><div className="brush" /><div className="t">{region.text}</div></div>}
          <BossHUD game={game} />{/* 首领条 + 锁定目标的大血条 */}
          <FeudHud game={game} />
          <EnyuanTop game={game} />{/* 恩怨重做：生死斗横幅、当地口碑 */}
          <PursuitHUD game={game} />
          {/* r11-lock：锁定目标的大血条并进了 BossHUD（与首领条同一套样式，首领条在上、目标条在下）；原来的小目标框 TargetFrame 不再挂 */}
          <ModHuds only={['top']} />
          {!isTouch && <div className="toasts">{normal.map((t) => <div key={t.id} className={'toast' + (t.kind === 'warn' ? ' warn' : t.kind === 'good' ? ' good' : '')}>{t.text}</div>)}{moreN > 0 && <div className="toast-more">还有 {moreN} 条</div>}</div>}{/* r14-toast：手机不在顶上正中弹消息了（挪到左上 ToastStrip） */}
        </div>
        {/* 右上：日期、小地图（无边海的罗盘挂在小地图左边）、秘境小图、模组右上 HUD */}
        <div className="hz hz-tr" data-hz="tr">
          <div className="date-box">
            <div className="date-season" style={{ background: SEASON_COLOR[ui.date.season] }}>{ui.date.season}</div>
            <div className="date-text">第{cnYear}年 · {MONTH[ui.date.month - 1]}<small>{ui.timeName} · {ui.weather}　{ui.regionParent && ui.regionParent !== ui.region ? `${ui.regionParent} · ` : ''}{ui.region}　探索 {(ui.explored * 100).toFixed(1)}%</small></div>
          </div>
          {inMijing ? <RealmHUD game={game} /> : minimap}
          <ModHuds only={['top-right']} />
        </div>

        {/* 左下：电脑是键位提示「？」和模组左下 HUD；手机是摇杆 */}
        <div className="hz hz-bl" data-hz="bl">
          {isTouch ? <Joystick game={game} /> : <><ModHuds only={['bottom-left']} /><HelpHint /></>}
        </div>
        {/* 底部居中：情境提示（快捷栏正上方）、遁光读数、快捷栏 */}
        <div className="hz hz-bc" data-hz="bc">
          <ContextHints game={game} ui={ui} touch={isTouch} blocked={panel !== '' || !!ui.dead} onTalent={() => setPanel('char')} />
          {!isTouch && <BrawlHUD game={game} touch={false} part="bars" />}{/* 第五轮：电脑的罡气条、架势提示排在遁光读数上面（以前浮着，和它叠在一起） */}
          <FlyHud game={game} />
          {!isTouch && !ui.dead && <Hotbar game={game} touch={false} />}
        </div>
        {/* 右下：电脑是常用键一圈 + 更多抽屉；手机是飞行一竖排（剑 / 升降）+ 侧边一列（菜单 / 疾行 / 锁定 / 闪避 / 交谈）+ 拇指弧线上的法诀盘 */}
        {/* r15-touchctl：手机「剑」和飞着（御剑、虚空）时的「升」「降」是一竖排，在右手这边——横屏在侧边一列的左边，竖屏在那一行上方靠右（「架」上面）；
            以前「剑」在菜单抽屉里、「升」「降」在左下摇杆上方（左手推摇杆就按不了） */}
        <div className="hz hz-br" data-hz="br">
          {!isTouch && <ActionRing game={game} ui={ui} open={open} drawer={drawer} setDrawer={setDrawer} />}
          {isTouch && <div className={'flight-pad' + (ui.flying ? ' flying' : '')}>
            {ui.flying && <ClimbPad game={game} alt={ui.altBand} />}
            <FlyButton game={game} flying={ui.flying} />
          </div>}
          {isTouch && (
            <div className="touch-side">
              <button className="round-btn small dock-main" onClick={() => { audio.sfx('open'); setDock(true); }}>≡<small>菜单</small>{drawerItems(game, ui, open, true).some((b) => b.badge || b.glow) && <i className="btn-dot" />}</button>
              <button className={'round-btn small run-btn' + (ui.run ? ' active' : '')}
                onClick={() => { audio.sfx('click'); game.input.run = !game.input.run; game.updateUI(true); }}>{ui.run ? '疾' : '步'}<small>{ui.run ? (ui.flying ? '遁光' : '疾行') : '步行'}</small></button>
              {game.ws.pets.length > 0 && <button className="round-btn small pet-btn" onClick={() => { audio.sfx('click'); game.talkPet(); }}>宠<small>灵宠</small></button>}
              <SeaButtons game={game} />{/* 收官 B3：灵舟（上下船）、下潜、上浮 */}
              <LockButton game={game} />{/* r13-lockbtn：点一下锁定 / 换下一个，长按取消 */}
              <button className="round-btn small dodge-btn" onClick={() => { audio.sfx('click'); game.combat.dodge(); }}>闪<small>闪避</small></button>
              <button className={'round-btn small talk-btn' + (ui.talk ? ' on' : '')} onClick={() => { audio.sfx('click'); game.interact(); }}>谈<small>{talkName}</small></button>
            </div>
          )}
          {isTouch && !ui.dead && <Hotbar game={game} touch />}
        </div>
        {/* 手机：功能抽屉 */}
        {isTouch && dock && <TouchDock game={game} ui={ui} open={open} onClose={() => setDock(false)} />}
        <BrawlHUD game={game} touch={isTouch} part={isTouch ? undefined : 'rest'} />{/* 近战：罡气条、架势提示、拼招面板；手机的架势按钮与四个大按钮（world/brawl.ts） */}
      </div>

      <canvas ref={hpfxRef} className="hpfx-layer" />{/* r11-lock：血条打击感的碎玉、滴血、回血光点（ui/hpfx.ts；有东西在动才画） */}
      {panel === 'map' && <WorldMapPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'settings' && <SettingsPanel game={game} onClose={() => setPanel('')} onExit={onExit} onSaves={() => setPanel('save')} />}
      {panel === 'char' && <CharPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'bag' && <BagPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'alchemy' && <AlchemyPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'seclude' && <SecludePanel game={game} onClose={() => setPanel('')} />}
      {panel === 'skills' && <SkillPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'zhenfa' && <ZhenfaPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'friends' && <FriendsPanel game={game} onClose={() => setPanel('')} />}
      {panel === 'save' && <SavePanel game={game} onClose={() => setPanel('')} onCloud={() => setPanel('cloud')} />}
      {panel === 'wardrobe' && <WardrobePanel game={game} onClose={() => setPanel('')} />}
      {panel === 'cloud' && <CloudPanel game={game} onClose={() => setPanel('')} />}
      {cave && <LayerGuard name="洞府" onError={() => game.leaveCave()}><CaveScene game={game} onClose={() => game.leaveCave()} /></LayerGuard>}{/* r14：一层出错只丢这一层，不再整屏黑 */}
      <LayerGuard name="对话框" onError={() => game.closeModal(true)}><ModalLayer game={game} /></LayerGuard>
      <Coach game={game} />{/* 收官 I：新手引导（z 62：盖得住面板和对话框，低于模组界面） */}
      <GainOverlay />
      <SectBattleHUD game={game} />
      {travelFx && <div className={'travel-fx ' + travelFx.via}>
        {travelFx.via === 'portal' && <><div className="tf-ring" /><div className="tf-ring r2" /><div className="tf-flash" /></>}
        <div className="tf-text"><div className="tf-to">{MAP_NAME[travelFx.to]}</div><div className="tf-sub">{travelFx.via === 'portal' ? '阵光冲天，虚空挪移……' : travelFx.to === 'dajin' ? '横穿天穹草原，顺舜江北上……' : '穿过草原，一路南归……'}</div></div>
      </div>}
      {ui.dead && <DeathScreen game={game} onExit={onExit} />}
    </div>
  );
}
