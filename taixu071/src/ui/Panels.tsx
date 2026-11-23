import { drawMapMarkLabel, mapMarkLabelBox } from '../gfx/mapMarkLabel';
import { prepareFuzzyQuery, fuzzyScoreFields } from './fuzzySearch';
import {
  ALWAYS_MARK, AMBIENT_MARK, GLYPH_NAME, anyMapFilterOff, clickMapFilter, getMapDetailMode, isHeroVisible,
  isLocTypeVisible, isMapFilterOff, isMarkVisible, isTerritoryVisible, setMapDetailMode, toggleMapFilterAll,
  useMapDetailMode, useMapFilterRev, type MapDetailMode,
} from './mapFilter';
import { enemyPerceptibility } from '../world/senseSignals';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { FOG_W, FOG_H, readToastMode, saveToastMode, TOAST_MODE_OPTIONS } from '../world/game';
import { audio } from '../world/audio';
import { KeyBindPanel, keyHint } from './KeyBind';
import { bindOf, isCustom, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import { TUNING } from '../data/tuning';
import { realmName } from '../data/realms';
import { atmoEnabled, grainEnabled, setAtmo, setGrain } from '../world/mood';
import { flierEnabled, setFlierEnabled, walkerDensity, setWalkerDensity } from '../world/life';
const TOUCH_UI = IS_TOUCH;
import { LOCATIONS, LOC_BY_ID, BIG_LABELS, WORLD_SCALE, MACRO_W, MACRO_H, LOC_TYPE_NAME, ACTIVE_MAP, ACTIVE_WORLD, MAP_NAME, MAP_IDS, MAP_EXITS, PORTALS, type MapId } from '../data/world';
import { WORLDS } from '../data/worldHierarchy';
// 各域地图说明（舆图顶部的悬停提示）
const MAP_ROUTE: Record<string, string> = {
  renjie: '人界全境：南荒、极西之地、朔漠与天穹草原、中州、沧溟海群岛与万里无边海合为一体，既可御遁光横渡山海，亦可借梁京古传送阵直通沧溟海',
  lingjie: '灵界全境：东有天渊圣域、西隔万里魔渊为蛮荒古境、北望无尽雷海与广寒碎域，三境相隔万里，可御遁光横渡或经域内传送阵瞬达',
  xianjie: '仙界全境：西北北寒仙域、中南金源仙域、极东灰界渊墟合为大千一图，其间仙脉断崖千里相隔，亦设远程仙阵互通',
};
function mapRouteLabel(m: MapId): string {
  if (m === ACTIVE_MAP) return '（你在此）';
  const ex = MAP_EXITS[ACTIVE_MAP]?.find((e) => e.to === m);
  if (ex) return `　${ex.title}（约 ${ex.days} 日）`;
  const po = PORTALS.find((p) => {
    const am = LOC_BY_ID.get(p.a)?.map, bm = LOC_BY_ID.get(p.b)?.map;
    return (am === ACTIVE_MAP && bm === m) || (bm === ACTIVE_MAP && am === m);
  });
  if (po) {
    const src = LOC_BY_ID.get(LOC_BY_ID.get(po.a)?.map === ACTIVE_MAP ? po.a : po.b);
    return `　经${src?.name ?? '传送阵'}${po.token ? '（需令牌）' : ''}`;
  }
  const hub = MAP_IDS[0];
  return `　须先至${MAP_NAME[hub]}`;
}

export const SEAL: Record<string, string> = { city: '城', town: '镇', sect: '宗', danger: '险', secret: '秘', isle: '岛', inn: '驿' };
export const SEAL_COLOR: Record<string, string> = { city: '#9a3b2c', town: '#8a6a3a', sect: '#2f6b5e', danger: '#5a1f2a', secret: '#3a5a8a', isle: '#2f6a80', inn: '#6a5a3a' };

/** 《文明6》/世界地图式合并疆域缓存：同势力山门/据点/分宗合并成连续大区块，剔除内部割裂线与放射虚线，仅保留双层国界外廓与质心宗名 */
interface CivTerritoryBlob {
  sid: string;
  name: string;
  stroke: string;
  fillRgb: string;
  isMine: boolean;
  allIsolated: boolean;
  loops: [number, number][][];
  centroid: [number, number] | null;
  areaCells: number;
}
let CIV_TER_CACHE_KEY = '';
let CIV_TER_CACHE: CivTerritoryBlob[] = [];

function chaikinSmoothClosed(pts: [number, number][], maxW: number, maxH: number): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push([
      Math.max(1, Math.min(maxW - 1, a[0] * 0.75 + b[0] * 0.25)),
      Math.max(1, Math.min(maxH - 1, a[1] * 0.75 + b[1] * 0.25)),
    ]);
    out.push([
      Math.max(1, Math.min(maxW - 1, a[0] * 0.25 + b[0] * 0.75)),
      Math.max(1, Math.min(maxH - 1, a[1] * 0.25 + b[1] * 0.75)),
    ]);
  }
  return out;
}

function getCivTerritoryLayer(game: Game): CivTerritoryBlob[] {
  const rawTers = game.sectwar?.sectTerritories?.(ACTIVE_MAP) ?? [];
  const terList: Array<{
    ter: typeof rawTers[number];
    visNodes: typeof rawTers[number]['nodes'];
  }> = [];
  const sigParts: string[] = [ACTIVE_MAP, String(MACRO_W), String(MACRO_H), game.terrain ? '1' : '0'];
  const claimedIds = new Set<string>();
  for (const ter of rawTers) {
    const visNodes = ter.nodes.filter((n) => {
      if (ter.isMine) return true;
      const loc = LOC_BY_ID.get(n.id);
      return !!(loc?.major || game.isExplored(n.x * WORLD_SCALE, n.y * WORLD_SCALE));
    });
    if (!visNodes.length) continue;
    terList.push({ ter, visNodes });
    sigParts.push(`${ter.sid}:${visNodes.map((n) => `${n.id}${n.isolated ? 'i' : ''}`).join(',')}`);
    for (const n of visNodes) claimedIds.add(n.id);
  }
  const sig = sigParts.join('|');
  if (CIV_TER_CACHE_KEY === sig) return CIV_TER_CACHE;
  CIV_TER_CACHE_KEY = sig;
  if (!terList.length) { CIV_TER_CACHE = []; return CIV_TER_CACHE; }

  const mapScale = ACTIVE_MAP === 'renjie' ? 1.3 : Math.min(2.6, Math.max(1, Math.min(MACRO_W / 1000, MACRO_H / 700)));
  const STEP = Math.max(5, Math.min(Math.round(10 * mapScale), Math.round(Math.max(MACRO_W, MACRO_H) / 160)));
  const GW = Math.max(8, Math.ceil(MACRO_W / STEP));
  const GH = Math.max(8, Math.ceil(MACRO_H / STEP));
  const owner = new Int16Array(GW * GH).fill(-1);

  type NodeSpec = { fi: number; x: number; y: number; rad2: number; weight: number; coastalCap2: number; minX: number; maxX: number; minY: number; maxY: number };
  const specs: NodeSpec[] = [];
  for (let fi = 0; fi < terList.length; fi++) {
    for (const n of terList[fi].visNodes) {
      const loc = LOC_BY_ID.get(n.id);
      const rad = (n.kind === 'gate' ? 88 : n.kind === 'branch' ? 74 : 68) * mapScale;
      const coastal = (loc?.type === 'isle' ? 42 : 24) * mapScale;
      const weight = n.kind === 'gate' ? 0.88 : n.isolated ? 1.14 : 1.0;
      specs.push({
        fi, x: n.x, y: n.y, rad2: rad * rad, weight, coastalCap2: coastal * coastal,
        minX: Math.max(0, Math.floor((n.x - rad) / STEP)),
        maxX: Math.min(GW - 1, Math.ceil((n.x + rad) / STEP)),
        minY: Math.max(0, Math.floor((n.y - rad) / STEP)),
        maxY: Math.min(GH - 1, Math.ceil((n.y + rad) / STEP)),
      });
    }
  }
  // 无主城/镇近旁保留中立缓冲，避免周边霸主疆界吞没中立城池
  const neutralSeeds: Array<{ x: number; y: number; r2: number }> = [];
  const neutralBuf2 = Math.pow(30 * mapScale, 2);
  for (const l of LOCATIONS) {
    if ((l.type === 'city' || l.type === 'town' || l.type === 'isle') && !claimedIds.has(l.id)) {
      neutralSeeds.push({ x: l.x, y: l.y, r2: neutralBuf2 });
    }
  }

  const T = game.terrain;
  const bestScore = new Float32Array(GW * GH).fill(1e12);
  const bestDist2 = new Float32Array(GW * GH).fill(1e12);
  const bestCoastal2 = new Float32Array(GW * GH).fill(0);
  for (const sp of specs) {
    for (let gy = sp.minY; gy <= sp.maxY; gy++) {
      const my = (gy + 0.5) * STEP;
      const dy = my - sp.y;
      const dy2 = dy * dy;
      if (dy2 > sp.rad2) continue;
      for (let gx = sp.minX; gx <= sp.maxX; gx++) {
        const mx = (gx + 0.5) * STEP;
        const dx = mx - sp.x;
        const d2 = dx * dx + dy2;
        if (d2 > sp.rad2) continue;
        const idx = gy * GW + gx;
        const sc = d2 * sp.weight;
        if (sc < bestScore[idx]) {
          bestScore[idx] = sc;
          bestDist2[idx] = d2;
          bestCoastal2[idx] = sp.coastalCap2;
          owner[idx] = sp.fi;
        }
      }
    }
  }
  // 地形海岸掩码 + 中立城镇缓冲剔除
  for (let gy = 0; gy < GH; gy++) {
    const my = (gy + 0.5) * STEP;
    for (let gx = 0; gx < GW; gx++) {
      const idx = gy * GW + gx;
      if (owner[idx] < 0) continue;
      const mx = (gx + 0.5) * STEP;
      if (T && !T.isLand(mx * WORLD_SCALE, my * WORLD_SCALE) && bestDist2[idx] > bestCoastal2[idx]) {
        owner[idx] = -1;
        continue;
      }
      for (let ni = 0; ni < neutralSeeds.length; ni++) {
        const ns = neutralSeeds[ni];
        const d2 = (mx - ns.x) * (mx - ns.x) + (my - ns.y) * (my - ns.y);
        if (d2 < ns.r2 && d2 < bestDist2[idx]) { owner[idx] = -1; break; }
      }
    }
  }

  // 对每个势力从合并网格抽取外轮廓边界边并缝合为平滑多边形
  const vk = (vx: number, vy: number) => vx * 4096 + vy;
  type OutEdge = { tx: number; ty: number; tk: number; dir: number; used: boolean };
  const result: CivTerritoryBlob[] = [];

  for (let fi = 0; fi < terList.length; fi++) {
    const { ter, visNodes } = terList[fi];
    const adj = new Map<number, OutEdge[]>();
    const addEdge = (fx: number, fy: number, tx: number, ty: number, dir: number) => {
      const fk = vk(fx, fy);
      let list = adj.get(fk);
      if (!list) { list = []; adj.set(fk, list); }
      list.push({ tx, ty, tk: vk(tx, ty), dir, used: false });
    };
    let areaCells = 0, sumX = 0, sumY = 0;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        if (owner[gy * GW + gx] !== fi) continue;
        areaCells++;
        sumX += (gx + 0.5) * STEP;
        sumY += (gy + 0.5) * STEP;
        if (gy === 0 || owner[(gy - 1) * GW + gx] !== fi) addEdge(gx, gy, gx + 1, gy, 0);
        if (gx === GW - 1 || owner[gy * GW + gx + 1] !== fi) addEdge(gx + 1, gy, gx + 1, gy + 1, 1);
        if (gy === GH - 1 || owner[(gy + 1) * GW + gx] !== fi) addEdge(gx + 1, gy + 1, gx, gy + 1, 2);
        if (gx === 0 || owner[gy * GW + gx - 1] !== fi) addEdge(gx, gy + 1, gx, gy, 3);
      }
    }
    if (!areaCells) continue;

    const loops: [number, number][][] = [];
    for (const [startK, edges] of adj) {
      for (const first of edges) {
        if (first.used) continue;
        first.used = true;
        const sx = Math.floor(startK / 4096), sy = startK % 4096;
        const raw: [number, number][] = [[sx, sy]];
        let curK = first.tk, curX = first.tx, curY = first.ty, curDir = first.dir;
        let guard = 0;
        while (curK !== startK && guard++ < 40000) {
          raw.push([curX, curY]);
          const cand = adj.get(curK);
          if (!cand || !cand.length) break;
          // 优先顺时针右转以在交叉格点贴合区域外缘
          const pref = [(curDir + 1) % 4, curDir, (curDir + 3) % 4, (curDir + 2) % 4];
          let chosen: OutEdge | undefined;
          for (const d of pref) { chosen = cand.find((e) => !e.used && e.dir === d); if (chosen) break; }
          if (!chosen) chosen = cand.find((e) => !e.used);
          if (!chosen) break;
          chosen.used = true;
          curX = chosen.tx; curY = chosen.ty; curK = chosen.tk; curDir = chosen.dir;
        }
        if (raw.length < 3) continue;
        // 剔除共线冗余点，再做两次 Chaikin 拐角平滑，呈现手绘世界地图国界曲线
        const simplified: [number, number][] = [];
        for (let i = 0; i < raw.length; i++) {
          const p0 = raw[(i - 1 + raw.length) % raw.length], p1 = raw[i], p2 = raw[(i + 1) % raw.length];
          const dx1 = p1[0] - p0[0], dy1 = p1[1] - p0[1], dx2 = p2[0] - p1[0], dy2 = p2[1] - p1[1];
          if (dx1 * dy2 - dy1 * dx2 !== 0) {
            simplified.push([Math.min(MACRO_W, p1[0] * STEP), Math.min(MACRO_H, p1[1] * STEP)]);
          }
        }
        if (simplified.length >= 3) {
          let smooth = chaikinSmoothClosed(simplified, MACRO_W, MACRO_H);
          smooth = chaikinSmoothClosed(smooth, MACRO_W, MACRO_H);
          loops.push(smooth);
        }
      }
    }
    const cx = sumX / areaCells, cy = sumY / areaCells;
    const gateNode = visNodes.find((n) => n.kind === 'gate');
    const labelAt: [number, number] = gateNode ? [cx * 0.65 + gateNode.x * 0.35, cy * 0.65 + gateNode.y * 0.35] : [cx, cy];
    result.push({
      sid: ter.sid,
      name: ter.name,
      stroke: ter.stroke,
      fillRgb: ter.fillRgb,
      isMine: ter.isMine,
      allIsolated: visNodes.every((n) => n.isolated),
      loops,
      centroid: labelAt,
      areaCells,
    });
  }
  CIV_TER_CACHE = result;
  return CIV_TER_CACHE;
}

// ---------- 迷雾遮罩（100×70，未探索处为宣纸色）----------
export function makeFogCanvas(game: Game, cv?: HTMLCanvasElement, alpha = 236) {
  const c = cv ?? document.createElement('canvas');
  c.width = FOG_W; c.height = FOG_H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(FOG_W, FOG_H);
  const all = game.revealAll;
  for (let i = 0; i < FOG_W * FOG_H; i++) {
    const k = i * 4;
    img.data[k] = 226; img.data[k + 1] = 217; img.data[k + 2] = 194;
    img.data[k + 3] = all || game.explored[i] ? 0 : alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- 设置 ----------
export function SettingsPanel({ onClose, game, onExit, onSaves }: { onClose: () => void; game?: Game; onExit?: () => void; onSaves?: () => void }) {
  const [, force] = useState(0);
  const [kb, setKb] = useState(false);
  const re = () => force((x) => x + 1);
  const click = () => audio.sfx('click');
  // 树木密度（0~8）：设置值优先，其次地形实例缓存，最后 localStorage / 默认 1（全部）
  const tStride = (() => {
    const g = globalThis as any;
    if (Number.isFinite(g.__treeDensity)) return Math.min(8, Math.max(0, Math.round(g.__treeDensity)));
    const t = (game?.terrain as any)?._treeStride;
    if (t !== undefined) return Math.min(8, Math.max(0, Math.round(t)));
    try { const raw = localStorage.getItem('fanren.treeDensity'); if (raw === null) return 1; const v = Number(raw); return Number.isFinite(v) && v >= 0 ? Math.min(8, Math.round(v)) : 1; } catch { return 1; }
  })();
  const tSlider = tStride === 0 ? 0 : 9 - tStride;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="scroll-panel settings" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><div className="panel-title">设置</div><button className="close-btn" onClick={onClose}>×</button></div>
        <div style={{ overflow: 'auto', maxHeight: '68vh', paddingRight: 4 }}>
          <div className="set-row"><div>背景音乐与音效<small>程序生成的古琴、箫声与风声</small></div>
            <button className={'switch' + (audio.enabled ? ' on' : '')} onClick={() => { audio.unlock(); audio.setEnabled(!audio.enabled); saveAudio(); re(); }} /></div>
          <div className="set-row"><div>音乐音量</div>
            <input type="range" min={0} max={1} step={0.05} value={audio.musicVol} onChange={(e) => { audio.setMusicVol(+e.target.value); saveAudio(); re(); }} /></div>
          <div className="set-row"><div>音效音量</div>
            <input type="range" min={0} max={1} step={0.05} value={audio.sfxVol} onChange={(e) => { audio.setSfxVol(+e.target.value); audio.sfx('chime'); saveAudio(); re(); }} /></div>
          {game && <>
            <div className="set-row"><div>快捷画质方案<small>仅设置画质档和帧率上限；分辨率、树木密度等仍可单独调整。</small></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => { game.renderer.setQuality(0); game.setFrameLimit(60); try { localStorage.setItem('fanren.quality', '0'); } catch { /* */ } re(); }}>集显优先 · 60</button>
                <button onClick={() => { game.renderer.setQuality(2); game.setFrameLimit(0); try { localStorage.setItem('fanren.quality', '2'); } catch { /* */ } re(); }}>高画质 · 不限帧</button>
                <button onClick={() => { game.renderer.fixedQuality = false; game.setFrameLimit(60); try { localStorage.setItem('fanren.quality', 'auto'); } catch { /* */ } re(); }}>自动 · 60</button>
              </div></div>
            <div className="set-row"><div>画质
              <small>{game.renderer?.stage ? 'WebGL 特效渲染' : '兼容模式（Canvas2D）'}{game.renderer?.fixedQuality ? '' : ' · 自动'}
                {game.renderer?.stage ? <> · {game.renderer.stage.softGPU
                  ? <b style={{ color: '#b8443a' }}>显卡未启用（正在用 CPU 软件渲染，会很卡）</b>
                  : <>显卡 {game.renderer.stage.gpuName.replace(/^ANGLE \(|\)$/g, '').slice(0, 34)}</>}</> : null}
              </small></div>
              <select className="ink-select" value={game.renderer?.fixedQuality ? String(game.renderer.tier) : 'auto'} onChange={(e) => { const v = e.target.value; if (v === 'auto') { game.renderer.fixedQuality = false; } else game.renderer.setQuality(+v); try { localStorage.setItem('fanren.quality', v); } catch { /* */ } re(); }}>
                <option value="auto">自动（按帧率调）</option><option value="2">高（泛光 · 足分辨率）</option><option value="1">中</option><option value="0">流畅优先（低画质 · 关氛围特效）</option>
              </select></div>
            <div className="set-row"><div>帧率上限<small>默认 60；不主动限制仍受浏览器和显示器刷新率约束。</small></div>
              <select className="ink-select" value={String(game.frameLimit)} onChange={(e) => { game.setFrameLimit(e.target.value); re(); }}>
                <option value="30">30 FPS</option><option value="60">60 FPS</option><option value="90">90 FPS</option><option value="120">120 FPS</option><option value="144">144 FPS</option><option value="0">不主动限制</option>
              </select></div>
            <div className="set-row"><div>世界层分辨率<small>世界层每帧整张上传 GL：越低越省、画质略软；最右为不限制（HUD 文字不受影响）</small></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={0.8} max={1.7} step={0.05} style={{ width: 140 }}
                  value={game.renderer?.worldDprCap ? game.renderer.worldDprCap : 1.7}
                  onChange={(e) => { const v = Number(e.target.value); game.renderer?.setWorldDprCap(v >= 1.65 ? 0 : +v.toFixed(2), true); re(); }} />
                <span style={{ minWidth: 46, opacity: 0.85 }}>{game.renderer?.worldDprCap ? game.renderer.worldDprCap.toFixed(2) : '不限制'}</span>
              </div></div>
            <div className="set-row"><div>WebGL 特效<small>关闭则使用兼容渲染（需重新进入游戏生效）</small></div>
              <button className={'switch' + (game.renderer?.stage ? ' on' : '')} onClick={() => { click(); try { localStorage.setItem('fanren.gl', game.renderer?.stage ? '0' : '1'); } catch { /* */ } game.toast('已保存，返回标题再进入游戏即可生效。'); re(); }} /></div>
            <div className="set-row"><div>胶片颗粒<small>纸纹与噪点后期（原版默认开；关闭后画面更干净锐利）</small></div>
              <button className={'switch' + (grainEnabled() ? ' on' : '')} onClick={() => { click(); setGrain(!grainEnabled()); re(); }} /></div>
            <div className="set-row"><div>氛围层<small>月亮/星星/远山/云带等视差层；关闭后画面更干净（无 WebGL 时始终不画）</small></div>
              <button className={'switch' + (atmoEnabled() ? ' on' : '')} onClick={() => { click(); setAtmo(!atmoEnabled()); re(); }} /></div>
            <div className="set-row"><div>空中御剑路人<small>高空随机飞过的御剑修士（纯视觉氛围装饰，无交互）</small></div>
              <button className={'switch' + (flierEnabled() ? ' on' : '')} onClick={() => { click(); setFlierEnabled(!flierEnabled()); game.life?.pruneAmbient(); re(); }} /></div>
            <div className="set-row"><div>消息提示<small>{TOAST_MODE_OPTIONS.find((o) => o.id === readToastMode())?.desc}。没弹出来的都记在左上「讯」里，点开可看</small></div>
              <select className="ink-select" value={readToastMode()} onChange={(e) => { click(); saveToastMode(e.target.value as 'all' | 'important' | 'quiet'); re(); }}>
                {TOAST_MODE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === (IS_TOUCH ? 'important' : 'all') ? '（默认）' : ''}</option>)}
              </select></div>
            <div className="set-row"><div>城镇无名路人<small>城镇、宗门街巷来往的无名行人及商队比例（0% = 关闭，可显著省绘制开销）</small></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={0} max={100} step={10} style={{ width: 140 }} value={walkerDensity()} onChange={(e) => {
                  setWalkerDensity(+e.target.value);
                  game.life?.pruneAmbient();
                  re();
                }} />
                <span style={{ minWidth: 46, opacity: 0.85 }}>{walkerDensity() <= 0 ? '关闭' : `${walkerDensity()}%`}</span>
              </div></div>
            <div className="set-row"><div>四季缓存<small>提前烘好另外三季的树，换季瞬间完成；原版默认关，开启后更吃内存/CPU</small></div>
              <button className={'switch' + (game.renderer?.seasonCache !== false ? ' on' : '')} onClick={() => { click(); game.renderer?.setSeasonCache(!(game.renderer?.seasonCache !== false)); re(); }} /></div>
            <div className="set-row"><div>树木密度<small>左稀右密：最左 0 = 不生成树，最右 100% = 全部；拖动后立即重算</small></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={0} max={8} step={1} style={{ width: 140 }} value={tSlider} onChange={(e) => {
                  const s = Math.round(+e.target.value);
                  const stride = s <= 0 ? 0 : 9 - s;
                  (globalThis as any).__treeDensity = stride;
                  (globalThis as any).__setTreeDensity?.(stride);
                  try { localStorage.setItem('fanren.treeDensity', String(stride)); } catch { /* */ }
                  re();
                }} />
                <span style={{ minWidth: 46, opacity: 0.85 }}>{tStride === 0 ? '无树' : `${Math.round(100 / tStride)}%`}</span>
              </div></div>
            <div className="set-row"><div>树风摆<small>原版默认开；关掉走轴对齐快路径，密林更流畅（树不再轻摆）</small></div>
              <button className={'switch' + (!game.renderer?.flatTrees ? ' on' : '')} onClick={() => { click(); const r = game.renderer; if (r) r.setTreeSway(r.flatTrees); re(); }} /></div>
            <div className="set-row"><div>自动运镜<small>飞行时缓缓拉远、战斗中偏向锁定目标、大招运镜；关掉则镜头完全按你的缩放来，不再自己动</small></div>
              <button className={'switch' + (game.autoCam ? ' on' : '')} onClick={() => { click(); game.setAutoCam(!game.autoCam); re(); }} /></div>
            <div className="set-row"><div>性能监视<small>显示帧率与耗时（快捷键 F3）</small></div>
              <button className={'switch' + (game.showPerf ? ' on' : '')} onClick={() => { click(); game.showPerf = !game.showPerf; re(); }} /></div>
            {onSaves && <div className="set-row"><div>存档 / 读档<small>一个自动存档 + 三个手动存档位</small></div><button className="ink-btn" onClick={() => { click(); onSaves(); }}>打开</button></div>}
            <div className="set-row"><div>天气（体验）<small>强制指定天气，便于预览</small></div>
              <select className="ink-select" value={game.weather.forced ?? ''} onChange={(e) => { game.setWeather((e.target.value || null) as any); re(); }}>
                <option value="">自然变化</option><option value="clear">晴</option><option value="rain">雨</option><option value="storm">雷雨</option><option value="snow">雪</option><option value="fog">雾</option><option value="sand">风沙</option>
              </select></div>
            <div className="set-row"><div>时辰（体验）<small>拨动昼夜</small></div>
              <input type="range" min={0} max={1} step={0.01} value={game.dayPhase} onChange={(e) => { game.clock = +e.target.value * TUNING.dayCycle; re(); }} /></div>
            <div className="set-row"><div>显示全图（体验）<small>揭开所有迷雾，便于预览整个人界</small></div>
              <button className={'switch' + (game.revealAll ? ' on' : '')} onClick={() => { click(); game.revealAll = !game.revealAll; game.updateUI(); re(); }} /></div>
            <div className="set-row"><div>御剑 / 御器飞行<small>{game.canFly ? '筑基后可凌空御剑；炼气期可乘神风舟等飞行法器（快捷键 F）' : '炼气期尚未筑基，须先祭出神风舟等飞行法器方可起飞'}</small></div>
              <button className={'switch' + (game.player.flying ? ' on' : '')} onClick={() => { game.toggleFly(); re(); }} /></div>
            <div className="set-row"><div>地图点选瞬移（体验）<small>在世界地图上点击即直接传送，方便看遍各地</small></div>
              <button className={'switch' + (game.debugTeleport ? ' on' : '')} onClick={() => { click(); game.debugTeleport = !game.debugTeleport; re(); }} /></div>
          </>}
          <div className="set-row"><div>自定义按键<small>{isCustom() ? '已改过：点「改键」再调' : (TOUCH_UI ? '接蓝牙 / 外接键盘时用，默认仍是旧键位' : '键盘任意键，或鼠标左/中/右键；默认仍是旧键位')}</small></div>
            <button className="ink-btn" onClick={() => { click(); setKb(true); }}>改　键</button></div>
          <div className="set-row" style={{ display: 'block' }}>
            <div style={{ marginBottom: 6 }}>操作说明</div>
            <div className="keys">
              {TOUCH_UI ? <>
                左手摇杆走动（推到底即疾行，「疾」可常开）　·　点地面前往　·　点人自动走过去交谈<br />
                点敌人锁定　·　右下法诀盘点一下即施法　·　「闪」闪避　·　「谈」交谈 / 查看 / 进门<br />
                「≡」菜单里是角色、储物袋、法术书、丹器、闭关、衣橱、地图、友人录、人脉、机缘、玉符、云存档<br />
                双指捏合缩放　·　点小地图开世界地图　·　走近灵物浮出「采集」，走近城镇浮出「进入」
              </> : <>
                电脑：{keyHint()}<br />
                <kbd>{keyLabel(bindOf('char'))}</kbd> 角色/冲关　·　<kbd>{keyLabel(bindOf('bag'))}</kbd> 储物袋　·　<kbd>{keyLabel(bindOf('alchemy'))}</kbd> 丹房　·　<kbd>{keyLabel(bindOf('seclude'))}</kbd> 闭关　·　<kbd>{keyLabel(bindOf('map'))}</kbd> 世界地图<br />
                <kbd>{keyLabel(bindOf('fly'))}</kbd> 御剑　·　<kbd>{keyLabel(bindOf('interact'))}</kbd> 交谈　·　<kbd>{keyLabel(bindOf('lock'))}</kbd> 换目标　·　<kbd>{keyLabel(bindOf('dodge'))}</kbd> 闪避　·　<kbd>1</kbd>–<kbd>9</kbd> 技能栏（固定）<br />
                <kbd>{keyLabel(bindOf('click'))}</kbd> 点地面前往 / 点敌攻击　·　滚轮或 <kbd>{keyLabel(bindOf('zoomIn'))}</kbd><kbd>{keyLabel(bindOf('zoomOut'))}</kbd> 缩放　·　<kbd>F3</kbd> 性能<br />
                手机：左下摇杆移动（推到底即疾行）　·　点人自动走过去交谈　·　双指缩放
              </>}
            </div>
          </div>
          {game && onExit && (
            <div className="set-row" style={{ borderBottom: 'none' }}>
              <div>返回标题<small>进度会自动保存</small></div>
              <button className="ink-btn" onClick={() => { click(); game.save(0); onExit(); }}>返回</button>
            </div>
          )}
        </div>
      </div>
      {kb && <KeyBindPanel onClose={() => { setKb(false); re(); }} />}
    </div>
  );
}

function saveAudio() {
  try { localStorage.setItem('fanren_audio', JSON.stringify({ e: audio.enabled, m: audio.musicVol, s: audio.sfxVol })); } catch { /* */ }
}
export function loadAudio() {
  try {
    const d = JSON.parse(localStorage.getItem('fanren_audio') || 'null');
    if (d) { audio.setEnabled(!!d.e); audio.setMusicVol(d.m); audio.setSfxVol(d.s); }
  } catch { /* */ }
}

// ---------- 世界地图 ----------
// 第三十步：大地图可缩放（滚轮 / ＋－按钮 / 双指捏合 / 键盘 + -）与拖动平移；放大后叠加局部高清底图（河、路、山林矢量）
const WM_ZMAX = Math.max(15, Math.ceil(15 * Math.max(MACRO_W / 1000, MACRO_H / 700)));
// 默认打开时聚焦在角色周围约 560 宏观单位跨度的区域（不再一上来显示全图卡顿且看不清自身位置）
const WM_INIT_Z = Math.max(2.2, Math.min(WM_ZMAX, MACRO_W / 560));
const clampWmView = (v: { z: number; cx: number; cy: number }) => {
  v.z = Math.max(1, Math.min(WM_ZMAX, v.z));
  const hw = MACRO_W / (2 * v.z), hh = MACRO_H / (2 * v.z);
  v.cx = Math.max(hw, Math.min(MACRO_W - hw, v.cx));
  v.cy = Math.max(hh, Math.min(MACRO_H - hh, v.cy));
  return v;
};
const LOC_TYPE_PRIO: Record<string, number> = { city: 600, sect: 500, town: 350, isle: 320, secret: 260, danger: 240, inn: 200 };
const locImportance = (l: (typeof LOCATIONS)[number]) => (l.major ? 1000 : 0) + (LOC_TYPE_PRIO[l.type] ?? 100) - (l.minor ? 450 : 0);
const markPriority = (g: string) => (g === '指' ? 5 : g === '任' ? 4 : g === '府' || g === '秘' || g === '秘？' || g === '境' || g === '宝' || g === '夺' || g === '攻' ? 3 : g === '赏' || g === '援' || g === '妖' || g === '王' || g === '营' ? 2 : g === '✓' ? 0 : 1);

const WM_TILE_PX = 192;
const WM_TIERS: readonly { minEff: number; scale: number; T: number }[] = [
  { minEff: 11.2, scale: 16, T: 12 },
  { minEff: 5.6, scale: 8, T: 24 },
  { minEff: 2.8, scale: 4, T: 48 },
  { minEff: 1.4, scale: 2, T: 96 },
  { minEff: 0.55, scale: 1, T: 192 },
];
const fadeBand = (v: number, lo: number, hi: number) => {
  const t = Math.max(0, Math.min(1, (v - lo) / Math.max(1e-4, hi - lo)));
  return t * t * (3 - 2 * t);
};

export function WorldMapPanel({ game, onClose, onOpenHigher }: { game: Game; onClose: () => void; onOpenHigher?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [hover, setHover] = useState<string>('');
  const [hoverMark, setHoverMark] = useState<{ x: number; y: number; glyph: string; name: string } | null>(null);
  const [zl, setZl] = useState(WM_INIT_Z);
  const [flyMode, setFlyMode] = useState(!!game.autoFlight || game.canFly);
  const [warHudOpen, setWarHudOpen] = useState(() => !TOUCH_UI && (typeof window === 'undefined' || window.innerWidth > 760));
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusLocId, setFocusLocId] = useState('');
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [, setWarTick] = useState(0);
  // 图例筛选与简繁模式：改一次版本号 +1，下面的绘制 effect 依赖它重画
  const filterRev = useMapFilterRev();
  const detailMode = useMapDetailMode();
  const view = useRef(clampWmView({ z: WM_INIT_Z, cx: game.player.x / WORLD_SCALE, cy: game.player.y / WORLD_SCALE }));
  const hoverRef = useRef(''); hoverRef.current = hover;
  const hoverMarkRef = useRef(hoverMark); hoverMarkRef.current = hoverMark;
  const focusLocRef = useRef(''); focusLocRef.current = focusLocId;
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number; mx: number; my: number } | null>(null);

  useEffect(() => {
    const fit = () => {
      const narrow = window.innerWidth < 760;
      // 预留高度：标题栏 + 缩放条 + 页签 + 图例（图例项多时 2~3 行）。
      // 再用 94vh 兜一次，保证面板（含上下木轴）不超出屏幕、不产生滚动。
      const mw = Math.min(window.innerWidth - (narrow ? 34 : 70), 1200);
      const reserved = narrow ? 330 : 250;
      const mh = Math.max(160, Math.min(
        window.innerHeight - reserved,
        Math.round(window.innerHeight * 0.94) - (narrow ? 210 : 170),
      ));
      let w = mw, h = (w * MACRO_H) / MACRO_W;
      if (h > mh) { h = mh; w = (h * MACRO_W) / MACRO_H; }
      setSize({ w: Math.max(260, Math.floor(w)), h: Math.max(160, Math.floor(h)) });
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  type SearchEntry =
    | { kind: 'loc'; l: (typeof LOCATIONS)[number]; score: number }
    | { kind: 'mark'; m: { x: number; y: number; glyph: string; color: string; name: string }; score: number };
  const searchResults = useMemo(() => {
    const fq = prepareFuzzyQuery(searchQ);
    if (!fq) return [] as SearchEntry[];
    const scored: SearchEntry[] = [];
    for (const l of LOCATIONS) {
      if (!l.major && !game.isExplored(l.x * WORLD_SCALE, l.y * WORLD_SCALE)) continue;
      const typeLabel = LOC_TYPE_NAME[l.type];
      const score = fuzzyScoreFields(fq, [
        { text: l.name, weight: 1, kind: 'primary' },
        { text: l.label, weight: 0.85, kind: 'primary' },
        { text: typeLabel, weight: 0.65, kind: 'primary' },
        { text: [l.name, l.label, typeLabel].filter(Boolean).join(' '), weight: 0.55, kind: 'secondary' },
        { text: l.desc, weight: 0.4, kind: 'secondary' },
      ]);
      if (score > 0) scored.push({ kind: 'loc', l, score });
    }
    for (const m of game.mapMarks?.() ?? []) {
      const gName = GLYPH_NAME[m.glyph] ?? m.glyph;
      const extra = m.glyph === '援' || m.glyph === '约' ? '求救 求援 好友 友人' : m.glyph === '仇' ? '求助 仇敌' : '';
      const score = fuzzyScoreFields(fq, [
        { text: m.name, weight: 1.05, kind: 'primary' },
        { text: gName, weight: 0.8, kind: 'primary' },
        { text: `${gName} ${m.name} ${extra}`, weight: 0.65, kind: 'secondary' },
      ]);
      if (score > 0) scored.push({ kind: 'mark', m, score });
    }
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ia = a.kind === 'loc' ? locImportance(a.l) : 100;
      const ib = b.kind === 'loc' ? locImportance(b.l) : 100;
      return ib - ia;
    });
    return scored.slice(0, 12);
  }, [searchQ, searchOpen, game]);

  const clampView = () => { clampWmView(view.current); };
  /** 以屏幕点 (sx,sy)（CSS 像素，相对画布）为中心缩放 */
  const zoomAt = (f: number, sx = size.w / 2, sy = size.h / 2) => {
    const v = view.current, s = size.w / MACRO_W, k0 = s * v.z;
    const mx = v.cx + (sx - size.w / 2) / k0, my = v.cy + (sy - size.h / 2) / k0;
    v.z = Math.max(1, Math.min(WM_ZMAX, v.z * f));
    const k1 = s * v.z;
    v.cx = mx - (sx - size.w / 2) / k1; v.cy = my - (sy - size.h / 2) / k1;
    clampView(); setZl(v.z);
  };
  const centerHero = (z?: number) => {
    const v = view.current; if (z) v.z = z; else if (v.z < 3) v.z = 3;
    v.cx = game.player.x / WORLD_SCALE; v.cy = game.player.y / WORLD_SCALE; clampView(); setZl(v.z);
  };
  const focusPoint = (wx: number, wy: number, z = 3.5) => {
    const v = view.current;
    v.z = Math.max(1, Math.min(WM_ZMAX, z));
    v.cx = wx / WORLD_SCALE;
    v.cy = wy / WORLD_SCALE;
    clampView();
    setZl(v.z);
  };
  const jumpToSearch = (item: SearchEntry) => {
    audio.sfx('click');
    setSearchOpen(false);
    if (item.kind === 'loc') {
      const l = item.l;
      setFocusLocId(l.id);
      setHoverMark(null);
      const minK = l.minor ? 2.6 : 1.5;
      const targetZ = Math.max(view.current.z, (minK * MACRO_W) / Math.max(1, size.w));
      focusPoint(l.x * WORLD_SCALE, l.y * WORLD_SCALE, targetZ);
    } else {
      const m = item.m;
      setFocusLocId('');
      setHoverMark(m);
      focusPoint(m.x, m.y, Math.max(view.current.z, 3.6));
    }
  };
  useEffect(() => {
    const id = setInterval(() => {
      if (warHudOpen && (game.sectwar?.frontLines?.()?.some((fl) => fl.map === ACTIVE_MAP) ?? false)) {
        setWarTick((n) => n + 1);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [warHudOpen, game]);

  useEffect(() => {
    const cv = ref.current!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const g = cv.getContext('2d')!;
    // 迷雾：限制最大边长 ≤ 1440（避免大图 6× 膨胀到 8640×4680 / 160MB+ 触发卡顿或内存崩溃）
    const fog0 = makeFogCanvas(game, undefined, 200);
    const fogScale = Math.max(1, Math.min(6, Math.floor(1440 / Math.max(FOG_W, FOG_H)) || 1));
    const fog = document.createElement('canvas'); fog.width = FOG_W * fogScale; fog.height = FOG_H * fogScale;
    {
      const fg = fog.getContext('2d')!; fg.imageSmoothingEnabled = true;
      try { fg.filter = `blur(${Math.max(1.5, +(5 * (fogScale / 6)).toFixed(1))}px)`; } catch { /* */ }
      fg.drawImage(fog0, 0, 0, fog.width, fog.height);
    }
    fog0.width = fog0.height = 0;

    // 静态底图层缓存（真分辨率地形切片、迷雾、地名、疆域、据点圈）：仅视口/悬停/筛选变化时重画，静止态 0 重绘开销
    const stCv = document.createElement('canvas'); stCv.width = cv.width; stCv.height = cv.height;
    const sg = stCv.getContext('2d')!;
    const baseSortedLocs = [...LOCATIONS].sort((a, b) => locImportance(b) - locImportance(a));
    const tiles = new Map<string, { cv: HTMLCanvasElement; used: number }>(); let frame = 0;
    const bakeTile = (tx: number, ty: number, scale: number, T: number, maxCache = 480) => {
      const key = `${tx},${ty},${scale}`;
      const hit = tiles.get(key);
      if (hit) { hit.used = frame; return hit; }
      const c = document.createElement('canvas'); c.width = c.height = WM_TILE_PX;
      const tg = c.getContext('2d')!;
      if (game.terrain?.overviewRows) {
        const img = tg.createImageData(WM_TILE_PX, WM_TILE_PX);
        game.terrain.overviewRows(img, tx * T, ty * T, scale, 0, WM_TILE_PX);
        tg.putImageData(img, 0, 0);
      } else {
        const base = game.terrain.overviewBase ?? game.overview;
        const ovS = base.width / game.terrain.W;
        tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        tg.drawImage(base, (tx * T - 1) * ovS, (ty * T - 1) * ovS, (T + 2) * ovS, (T + 2) * ovS, -scale, -scale, (T + 2) * scale, (T + 2) * scale);
      }
      game.terrain.overviewVectors(tg, tx * T, ty * T, WM_TILE_PX, WM_TILE_PX, scale);
      const t = { cv: c, used: frame };
      tiles.set(key, t);
      if (tiles.size > maxCache) {
        let old: string | null = null, ou = Infinity;
        // 严禁淘汰当前帧及近两帧刚用过的切片，彻底消除单屏内边烘焙边淘汰造成的矩形块停滞
        for (const [k2, v] of tiles) if (v.used < ou && v.used < frame - 2 && v !== t) { ou = v.used; old = k2; }
        if (old) { const ev = tiles.get(old); if (ev) ev.cv.width = ev.cv.height = 0; tiles.delete(old); }
      }
      return t;
    };
    let stKey = '', stPending = false, lastAnim = 0, raf = 0;
    let staticPlaced: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const s = size.w / MACRO_W; // 宏观单位 → CSS 像素（全图时）
    const paintStatic = (hov: string, foc: string, busy: boolean) => {
      const v = view.current, Z = v.z, k = s * Z, W2 = size.w / 2, H2 = size.h / 2;
      const X = (mx: number) => (mx - v.cx) * k + W2, Y = (my: number) => (my - v.cy) * k + H2;
      const on = (x: number, y: number, m = 40) => x > -m && y > -m && x < size.w + m && y < size.h + m;
      const rz = Math.min(1.65, 1 + (Z - 1) * 0.12);
      const dMode = getMapDetailMode();
      sg.setTransform(dpr, 0, 0, dpr, 0, 0);
      sg.fillStyle = '#d9cdb0'; sg.fillRect(0, 0, size.w, size.h);
      sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
      const mx0v = Math.max(0, v.cx - W2 / k), my0v = Math.max(0, v.cy - H2 / k), mx1v = Math.min(MACRO_W, v.cx + W2 / k), my1v = Math.min(MACRO_H, v.cy + H2 / k);
      const drawVis = (img: CanvasImageSource, iw: number, ih: number) => {
        const fx = iw / MACRO_W, fy = ih / MACRO_H;
        const sx0 = Math.max(0, Math.floor(mx0v * fx) - 1), sy0 = Math.max(0, Math.floor(my0v * fy) - 1);
        const sx1 = Math.min(iw, Math.ceil(mx1v * fx) + 1), sy1 = Math.min(ih, Math.ceil(my1v * fy) + 1);
        if (sx1 <= sx0 || sy1 <= sy0) return;
        sg.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, X(sx0 / fx), Y(sy0 / fy), (sx1 - sx0) / fx * k, (sy1 - sy0) / fy * k);
      };
      const baseOv = game.overview ?? game.terrain?.overviewBase;
      if (baseOv) drawVis(baseOv, baseOv.width, baseOv.height);
      let missingTiles = false;
      const effScale = k * dpr;
      const tier = effScale > 0.55 && game.terrain?.overviewVectors ? WM_TIERS.find((tr) => effScale > tr.minEff) : undefined;
      if (tier) {
        // 多级真分辨率切片：优先复用本档缓存；未命中时同时支持邻近粗/细缓存切片临时铺底，拖动/捏合也保留轻预算烘焙
        const { scale, T } = tier;
        const tx0 = Math.max(0, Math.floor(mx0v / T)), ty0 = Math.max(0, Math.floor(my0v / T));
        const tx1 = Math.min(Math.floor((game.terrain.W - 1) / T), Math.floor(mx1v / T));
        const ty1 = Math.min(Math.floor((game.terrain.H - 1) / T), Math.floor(my1v / T));
        const visTileCount = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
        const maxCache = Math.max(480, visTileCount * 2 + 120);
        const jobs: { tx: number; ty: number; d2: number }[] = [];
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          const hit = tiles.get(`${tx},${ty},${scale}`);
          if (hit) {
            hit.used = frame;
            sg.drawImage(hit.cv, X(tx * T) - 0.5, Y(ty * T) - 0.5, T * k + 1, T * k + 1);
          } else {
            let filled = false;
            // 先找更粗一档（放大时已存在缓存）
            for (const cTier of WM_TIERS) {
              if (cTier.scale >= scale) continue;
              const cx = Math.floor((tx * T) / cTier.T), cy = Math.floor((ty * T) / cTier.T);
              const coarse = tiles.get(`${cx},${cy},${cTier.scale}`);
              if (coarse) {
                coarse.used = frame;
                const sx = (tx * T - cx * cTier.T) * cTier.scale;
                const sy = (ty * T - cy * cTier.T) * cTier.scale;
                const sw = T * cTier.scale;
                sg.drawImage(coarse.cv, sx, sy, sw, sw, X(tx * T) - 0.5, Y(ty * T) - 0.5, T * k + 1, T * k + 1);
                filled = true;
                break;
              }
            }
            // 缩小时也尝试用细一档 2×2 子切片铺底，防止缩出挡位时闪回糊底图
            if (!filled) {
              const fTier = WM_TIERS.find((c) => c.scale === scale * 2);
              if (fTier) {
                const bx = tx * 2, by = ty * 2;
                for (let oy = 0; oy < 2; oy++) for (let ox = 0; ox < 2; ox++) {
                  const fine = tiles.get(`${bx + ox},${by + oy},${fTier.scale}`);
                  if (fine) {
                    fine.used = frame;
                    sg.drawImage(fine.cv, X((bx + ox) * fTier.T) - 0.5, Y((by + oy) * fTier.T) - 0.5, fTier.T * k + 1, fTier.T * k + 1);
                  }
                }
              }
            }
            const dx = tx * T + T * 0.5 - v.cx, dy = ty * T + T * 0.5 - v.cy;
            jobs.push({ tx, ty, d2: dx * dx + dy * dy });
          }
        }
        if (jobs.length) {
          jobs.sort((a, b) => a.d2 - b.d2);
          const deadline = performance.now() + (busy ? 4 : 16);
          let baked = 0;
          for (const j of jobs) {
            if (baked > 0 && performance.now() >= deadline) { missingTiles = true; break; }
            const tl = bakeTile(j.tx, j.ty, scale, T, maxCache);
            sg.drawImage(tl.cv, X(j.tx * T) - 0.5, Y(j.ty * T) - 0.5, T * k + 1, T * k + 1);
            baked++;
          }
        }
      }
      stPending = missingTiles;
      drawVis(fog, fog.width, fog.height);
      // 大区域名（放大后变淡，免得挡住细节）
      sg.textAlign = 'center'; sg.textBaseline = 'middle';
      for (const L of BIG_LABELS) {
        const lx = X(L.at[0]), ly = Y(L.at[1]);
        if (!on(lx, ly, 240)) continue;
        const fs = Math.max(13, L.size * 9 * s * 1.6) * Math.min(1.8, Math.sqrt(Z));
        sg.font = `${fs}px 'Ma Shan Zheng', serif`;
        sg.fillStyle = `rgba(40,34,26,${0.32 / Math.max(1, Z * 0.55)})`;
        sg.fillText(L.name.split('').join(' '), lx, ly);
      }
      // 陆路出口：图边的箭头
      if (Z < 1.5) for (const ex of MAP_EXITS[ACTIVE_MAP]) {
        const north = ex.edge === 'n', y = north ? 22 : size.h - 22;
        sg.font = `${Math.max(13, 15 * s * 1.6)}px 'Ma Shan Zheng', serif`;
        sg.fillStyle = 'rgba(120,40,30,0.75)';
        sg.fillText(`${north ? '↑' : '↓'} ${ex.title} ${north ? '↑' : '↓'}`, size.w / 2, y);
      }
      // 《文明6》/世界地图式宗门势力范围：同势力合并为连续有机疆域，内廓柔和晕染 + 外廓清晰国界 + 质心宗门国名
      if (isTerritoryVisible()) {
        const blobs = getCivTerritoryLayer(game);
        for (const blob of blobs) {
          if (!blob.loops.length) continue;
          sg.save();
          sg.beginPath();
          for (const lp of blob.loops) {
            if (lp.length < 3) continue;
            sg.moveTo(X(lp[0][0]), Y(lp[0][1]));
            for (let pi = 1; pi < lp.length; pi++) sg.lineTo(X(lp[pi][0]), Y(lp[pi][1]));
            sg.closePath();
          }
          sg.fillStyle = `rgba(${blob.fillRgb},${blob.isMine ? 0.22 : 0.14})`;
          sg.fill('evenodd');
          sg.save();
          sg.clip('evenodd');
          sg.strokeStyle = blob.stroke;
          sg.globalAlpha = blob.isMine ? 0.34 : 0.22;
          sg.lineWidth = Math.max(4, 7 * s * Math.min(1.4, Math.sqrt(Z)));
          sg.stroke();
          sg.restore();
          sg.strokeStyle = blob.stroke;
          sg.globalAlpha = blob.isMine ? 0.92 : 0.78;
          sg.lineWidth = Math.max(1.3, (blob.isMine ? 2.1 : 1.55) * s * Math.min(1.35, Math.sqrt(Z)));
          if (blob.allIsolated) sg.setLineDash([6, 4]);
          sg.stroke();
          sg.setLineDash([]);
          sg.restore();
        }
        const nameAlpha = 0.56 * (1 - fadeBand(Z, 1.35, 2.45));
        if (nameAlpha > 0.02) {
          sg.save();
          sg.textAlign = 'center'; sg.textBaseline = 'middle';
          for (const blob of blobs) {
            if (!blob.centroid || blob.areaCells < 8) continue;
            const lx = X(blob.centroid[0]), ly = Y(blob.centroid[1]);
            if (!on(lx, ly, 120)) continue;
            const fs = Math.max(12, Math.min(24, (11 + Math.sqrt(blob.areaCells) * 0.52) * s * Math.min(1.3, Z)));
            sg.font = `${fs}px 'Ma Shan Zheng', 'STKaiti', 'KaiTi', serif`;
            sg.lineWidth = Math.max(2.2, fs * 0.16);
            sg.strokeStyle = 'rgba(246,239,222,0.82)';
            sg.globalAlpha = nameAlpha;
            sg.strokeText(blob.name, lx, ly);
            sg.fillStyle = blob.stroke;
            sg.fillText(blob.name, lx, ly);
          }
          sg.restore();
        }
      }
      // 地点：按重要度排序 + 缩放平滑渐现 + 留白防重叠（消除硬阈值档位突变）
      sg.textAlign = 'center'; sg.textBaseline = 'middle';
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      let hovLoc: (typeof LOCATIONS)[number] | null = null;
      let focLoc: (typeof LOCATIONS)[number] | null = null;
      const drawLoc = (l: (typeof LOCATIONS)[number]) => {
        if (!isLocTypeVisible(l.type)) return;
        const isHot = hov === l.id || foc === l.id;
        const wx = l.x * WORLD_SCALE, wy = l.y * WORLD_SCALE;
        const known = game.isExplored(wx, wy);
        const x = X(l.x), y = Y(l.y);
        if (!on(x, y)) return;
        const isBranch = l.type === 'sect' && !!game.sectwar?.isBranch?.(l.id);
        const sealCol = isBranch ? '#b87a1c' : SEAL_COLOR[l.type];
        const sealGlyph = isBranch ? '舵' : (l.seal ?? SEAL[l.type]);
        const baseAlpha = known ? 1 : 0.72;
        sg.globalAlpha = baseAlpha;
        const r = Math.max(4.5, (l.major ? 8.2 : l.minor ? 5.2 : 6.8) * Math.max(0.85, Math.min(1.25, s * 3.5))) * rz;
        sg.fillStyle = sealCol;
        sg.fillRect(x - r, y - r, r * 2, r * 2);
        sg.strokeStyle = foc === l.id ? '#ffe280' : 'rgba(250,240,220,0.92)';
        sg.lineWidth = foc === l.id ? 2 : 1;
        sg.strokeRect(x - r + 1.2, y - r + 1.2, r * 2 - 2.4, r * 2 - 2.4);
        sg.fillStyle = '#f7eedb'; sg.font = `${r * 1.42}px 'Ma Shan Zheng', serif`;
        sg.fillText(sealGlyph, x, y + r * 0.08);
        const fs = Math.max(11.5, Math.min(15.5, 11.5 + (Z - 1) * 0.18));
        const font = `${fs}px 'Ma Shan Zheng', 'STKaiti', 'KaiTi', serif`;
        sg.font = font;
        const label = known ? (isBranch ? `${l.name}（分宗）` : l.name) : l.name + '（传闻）';
        const tw = sg.measureText(label).width;
        const seal = fs * 1.02, pad = fs * 0.38;
        const bw = tw + seal + pad * 3, bh = fs * 1.44;
        const bx = x - bw / 2, by = y + r + 4;
        const gap = 2;
        const box = { x0: bx - gap, y0: by - gap, x1: bx + bw + gap, y1: by + bh + gap };
        const hit = Z < 1.5 && placed.some((pb) => !(box.x1 < pb.x0 || box.x0 > pb.x1 || box.y1 < pb.y0 || box.y0 > pb.y1));
        if (!hit || isHot) {
          if (!hit) placed.push(box);
          const cr = bh * 0.18;
          sg.fillStyle = isHot ? 'rgba(255,249,234,0.98)' : 'rgba(246,239,222,0.92)';
          sg.strokeStyle = isHot ? 'rgba(184,122,28,0.95)' : isBranch ? 'rgba(184,122,28,0.85)' : 'rgba(60,50,40,0.72)';
          sg.lineWidth = Math.max(1, fs * 0.07);
          sg.beginPath();
          sg.moveTo(bx + cr, by); sg.lineTo(bx + bw - cr, by); sg.quadraticCurveTo(bx + bw, by, bx + bw, by + cr);
          sg.lineTo(bx + bw, by + bh - cr); sg.quadraticCurveTo(bx + bw, by + bh, bx + bw - cr, by + bh);
          sg.lineTo(bx + cr, by + bh); sg.quadraticCurveTo(bx, by + bh, bx, by + bh - cr);
          sg.lineTo(bx, by + cr); sg.quadraticCurveTo(bx, by, bx + cr, by);
          sg.fill(); sg.stroke();
          const isx = bx + pad, isy = by + (bh - seal) / 2;
          sg.fillStyle = sealCol;
          sg.fillRect(isx, isy, seal, seal);
          sg.fillStyle = '#f7eedb';
          sg.font = `${seal * 0.78}px 'Ma Shan Zheng', 'STKaiti', serif`;
          sg.fillText(sealGlyph, isx + seal / 2, isy + seal / 2 + seal * 0.04);
          sg.fillStyle = known ? '#2a2620' : '#5a544a';
          sg.font = font;
          sg.textAlign = 'left';
          sg.fillText(label, isx + seal + pad, by + bh / 2 + fs * 0.04);
          sg.textAlign = 'center';
        }
        sg.globalAlpha = 1;
      };
      for (const l of baseSortedLocs) {
        if (l.id === hov) { hovLoc = l; continue; }
        if (l.id === foc) { focLoc = l; continue; }
        drawLoc(l);
      }
      if (focLoc) drawLoc(focLoc);
      if (hovLoc) drawLoc(hovLoc);
      staticPlaced = placed;
    };

    const draw = (t: number) => {
      const v = view.current, Z = v.z, k = s * Z, W2 = size.w / 2, H2 = size.h / 2;
      const X = (mx: number) => (mx - v.cx) * k + W2, Y = (my: number) => (my - v.cy) * k + H2;
      const on = (x: number, y: number, m = 40) => x > -m && y > -m && x < size.w + m && y < size.h + m;
      const hov = hoverRef.current;
      const foc = focusLocRef.current;
      const hovM = hoverMarkRef.current;
      const dMode = getMapDetailMode();
      const busy = !!(drag.current?.moved || pinch.current);
      const key = `${v.cx.toFixed(3)}|${v.cy.toFixed(3)}|${v.z.toFixed(4)}|${hov}|${foc}|${game.ui?.explored ?? 0}|${game.revealAll ? 1 : 0}|${filterRev}`;
      const needStatic = key !== stKey || (stPending && !busy);
      if (!needStatic && !busy && t - lastAnim < 32) {
        raf = requestAnimationFrame(draw);
        return;
      }
      lastAnim = t;
      frame++;
      const t0 = performance.now();
      if (needStatic) {
        paintStatic(hov, foc, busy);
        stKey = key;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(stCv, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const rz = Math.min(1.65, 1 + (Z - 1) * 0.12);
      if (foc) {
        const fl = LOC_BY_ID.get(foc);
        if (fl) {
          const fx = X(fl.x), fy = Y(fl.y);
          if (on(fx, fy, 40)) {
            const p0 = (t / 900) % 1;
            g.save();
            g.strokeStyle = `rgba(218,162,48,${1 - p0})`;
            g.lineWidth = 2.4;
            g.beginPath(); g.arc(fx, fy, 10 + p0 * 22, 0, Math.PI * 2); g.stroke();
            g.restore();
          }
        }
      }
      if (isMarkVisible('攻')) {
        const seenMainVec = new Map<string, { x: number; y: number }>();
        const seenFrontRing = new Set<string>();
        for (const fl of game.sectwar?.frontLines?.() ?? []) {
          if (fl.map !== ACTIVE_MAP) continue;
          const ax = X(fl.ax / WORLD_SCALE), ay = Y(fl.ay / WORLD_SCALE);
          const bx0 = X(fl.bx / WORLD_SCALE), by0 = Y(fl.by / WORLD_SCALE);
          const cax = X(fl.campAX / WORLD_SCALE), cay = Y(fl.campAY / WORLD_SCALE);
          const cbx = X(fl.campBX / WORLD_SCALE), cby = Y(fl.campBY / WORLD_SCALE);
          const fx = X(fl.fx / WORLD_SCALE), fy = Y(fl.fy / WORLD_SCALE);
          if (!on(fx, fy, 420) && !on(ax, ay, 420) && !on(bx0, by0, 420)) continue;

          const drawSeg = (x1: number, y1: number, x2: number, y2: number, col: string, dash: number[], speed: number, w0: number) => {
            g.save();
            g.strokeStyle = col;
            g.globalAlpha = 0.2;
            g.lineWidth = w0 + 3;
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
            g.globalAlpha = 0.85;
            g.lineWidth = w0;
            g.setLineDash(dash);
            g.lineDashOffset = -(t * speed);
            g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
            g.restore();
          };

          // 战线推进历史轨迹（由已攻克点一路指向当前前线）
          if (fl.trail.length) {
            g.save();
            g.strokeStyle = 'rgba(214,164,75,0.65)';
            g.lineWidth = 1.6;
            g.setLineDash([3, 4]);
            g.beginPath();
            for (let ti = 0; ti < fl.trail.length; ti++) {
              const tx = X(fl.trail[ti].x / WORLD_SCALE), ty = Y(fl.trail[ti].y / WORLD_SCALE);
              if (ti === 0) g.moveTo(tx, ty); else g.lineTo(tx, ty);
              g.fillStyle = 'rgba(214,164,75,0.85)';
              g.fillRect(tx - 2.5, ty - 2.5, 5, 5);
            }
            g.lineTo(fx, fy);
            g.stroke();
            g.restore();
          }

          // 双方山门 → 前线大营（后勤补给虚线，远景缩略下轻描）
          const supAlpha = Z <= 1.25 ? 0.28 : 0.65;
          g.save(); g.globalAlpha *= supAlpha;
          drawSeg(ax, ay, cax, cay, fl.colA, [4, 5], 0.012, 1.1);
          drawSeg(bx0, by0, cbx, cby, fl.colB, [4, 5], 0.012, 1.1);
          g.restore();

          // 统一战线进攻方向：同一战区目标与同一阵营色系仅画一条主攻总矢（其余分营轻线汇向总营）
          const keyA = `${fl.tgtId}:${fl.colA}`;
          const keyB = `${fl.tgtId}:${fl.colB}`;
          const leadA = seenMainVec.get(keyA);
          if (!leadA) {
            seenMainVec.set(keyA, { x: cax, y: cay });
            drawSeg(cax, cay, fx, fy, fl.colA, [8, 4], 0.028, fl.attSide === 0 ? 2.5 : 1.7);
          } else {
            g.save(); g.globalAlpha *= 0.35;
            drawSeg(cax, cay, leadA.x, leadA.y, fl.colA, [3, 4], 0.01, 1.1);
            g.restore();
          }
          const leadB = seenMainVec.get(keyB);
          if (!leadB) {
            seenMainVec.set(keyB, { x: cbx, y: cby });
            drawSeg(cbx, cby, fx, fy, fl.colB, [8, 4], 0.028, fl.attSide === 1 ? 2.5 : 1.7);
          } else {
            g.save(); g.globalAlpha *= 0.35;
            drawSeg(cbx, cby, leadB.x, leadB.y, fl.colB, [3, 4], 0.01, 1.1);
            g.restore();
          }

          // 攻方统一推进方向箭头（每个战区攻方总矢只画一枚箭头）
          const attMain = fl.attSide === 0 ? (leadA ?? { x: cax, y: cay }) : (leadB ?? { x: cbx, y: cby });
          const attKey = `arrow:${fl.tgtId}:${fl.attSide === 0 ? fl.colA : fl.colB}`;
          if (!seenFrontRing.has(attKey)) {
            seenFrontRing.add(attKey);
            const attCol = fl.attSide === 0 ? fl.colA : fl.colB;
            const aAng = Math.atan2(fy - attMain.y, fx - attMain.x);
            const midX = (attMain.x + fx) * 0.5, midY = (attMain.y + fy) * 0.5;
            g.save();
            g.translate(midX, midY);
            g.rotate(aAng);
            g.fillStyle = attCol;
            g.beginPath();
            g.moveTo(7.5, 0); g.lineTo(-4.5, -5.5); g.lineTo(-2, 0); g.lineTo(-4.5, 5.5);
            g.closePath();
            g.fill();
            g.restore();
          }

          // 战区横贯阵线与交锋脉动环（同一目标仅绘制一次，防止叠成粗圈）
          if (!seenFrontRing.has(fl.tgtId)) {
            seenFrontRing.add(fl.tgtId);
            const ang = Math.atan2(cby - cay, cbx - cax) + Math.PI * 0.5;
            const halfSpan = Math.max(16, Math.min(34, 18 * s * rz));
            g.save();
            g.strokeStyle = fl.siege ? '#e04838' : '#d6a44b';
            g.globalAlpha = 0.78;
            g.lineWidth = 2.2;
            g.setLineDash([5, 3]);
            g.beginPath();
            g.moveTo(fx - Math.cos(ang) * halfSpan, fy - Math.sin(ang) * halfSpan);
            g.lineTo(fx + Math.cos(ang) * halfSpan, fy + Math.sin(ang) * halfSpan);
            g.stroke();
            g.setLineDash([]);
            const fpulse = ((t * (fl.activeBattle ? 1.5 : 0.8)) / 1000) % 1;
            g.strokeStyle = fl.activeBattle ? `rgba(232,68,52,${1 - fpulse})` : `rgba(214,164,75,${(1 - fpulse) * 0.7})`;
            g.lineWidth = fl.activeBattle ? 2.2 : 1.5;
            g.beginPath();
            g.arc(fx, fy, 7 + fpulse * (fl.activeBattle ? 22 : 14), 0, Math.PI * 2);
            g.stroke();
            g.restore();
          }
        }
        // 在途行军纵队与运丹车队实时行进轨迹（M 地图大局清晰可见，行进弧线与兵力标注）
        for (const mc of game.sectwar?.activeMarches?.() ?? []) {
          if (mc.map !== ACTIVE_MAP) continue;
          const mpos = game.sectwar.marchPos(mc);
          const fx0 = X(mc.fromX / WORLD_SCALE), fy0 = Y(mc.fromY / WORLD_SCALE);
          const tx0 = X(mc.toX / WORLD_SCALE), ty0 = Y(mc.toY / WORLD_SCALE);
          const mx = X(mpos.x / WORLD_SCALE), my = Y(mpos.y / WORLD_SCALE);
          if (!on(mx, my, 260) && !on(fx0, fy0, 260) && !on(tx0, ty0, 260)) continue;
          const col = game.sectwar.sectColor(mc.sid).stroke;
          const dx = mc.toX - mc.fromX, dy = mc.toY - mc.fromY, d = Math.hypot(dx, dy) || 1;
          const perp = mc.kind === 'convoy' ? 280 : -220;
          const cx0 = X((mc.fromX + dx * 0.5 + (-dy / d) * perp) / WORLD_SCALE);
          const cy0 = Y((mc.fromY + dy * 0.5 + (dx / d) * perp) / WORLD_SCALE);
          g.save();
          g.strokeStyle = col;
          g.globalAlpha = 0.72;
          g.lineWidth = mc.kind === 'army' ? 1.8 : 1.3;
          g.setLineDash([6, 4]);
          g.lineDashOffset = -(t * 0.025);
          g.beginPath();
          g.moveTo(fx0, fy0);
          g.quadraticCurveTo(cx0, cy0, tx0, ty0);
          g.stroke();
          g.setLineDash([]);
          g.globalAlpha = 1;
          g.fillStyle = mc.kind === 'convoy' ? '#7fd0ff' : '#ffd27a';
          g.beginPath();
          g.arc(mx, my, mc.kind === 'army' ? 4.8 : 3.8, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#1d1610';
          g.lineWidth = 1.2;
          g.stroke();
          const marchLblAlpha = mc.sid === 'my_sect' ? 1 : fadeBand(Z, 0.9, 1.35);
          if (marchLblAlpha > 0.04) {
            g.globalAlpha = marchLblAlpha;
            g.font = `bold ${Math.max(9.5, 10 * s)}px 'Noto Serif SC', serif`;
            g.textAlign = 'center';
            g.fillStyle = '#241c14';
            g.fillText(`${game.sectwar.name(mc.sid)}·${mc.kind === 'convoy' ? '车队' : `${mc.soldiers}人`}`, mx, my - 9);
          }
          g.restore();
        }
      }
      // 第十八步：机缘 / 洞府 / 悬赏 / 异宝
      // 平滑分级与重要度排序，且文字碰撞框同时避让城池/宗门铭牌
      const markList = (game.mapMarks?.() ?? []).slice().sort((a, b) => markPriority(b.glyph) - markPriority(a.glyph));
      const placedBoxes: { x0: number; y0: number; x1: number; y1: number }[] = staticPlaced.slice();
      for (const m of markList) {
        if (!isMarkVisible(m.glyph)) continue;
        const isHovM = !!(hovM && Math.abs(hovM.x - m.x) < 1 && Math.abs(hovM.y - m.y) < 1 && hovM.glyph === m.glyph);
        const isAmb = AMBIENT_MARK.has(m.glyph);
        if (dMode === 'clean' && isAmb && !isHovM) continue;
        const x = X(m.x / WORLD_SCALE), y = Y(m.y / WORLD_SCALE);
        if (!on(x, y, 60 + (m.ring ? (m.ring / WORLD_SCALE) * k : 0))) continue;
        // 除「清简」模式外，所有标记图标均完整绘出（不再把「✓」等已探/点位在低倍率下隐藏成不可辨的小灰点）
        const subtleChecked = m.glyph === '✓' && !isHovM && dMode === 'smart' && k < 1.5;
        const r = Math.max(5.5, 7.2 * Math.max(0.85, Math.min(1.2, s * 3.2))) * rz * (subtleChecked ? 0.88 : 1);
        g.save();
        g.globalAlpha = subtleChecked ? 0.86 : 1;
        if (m.ring) { g.strokeStyle = m.color; g.globalAlpha = 0.55; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, (m.ring / WORLD_SCALE) * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.globalAlpha = subtleChecked ? 0.86 : 1; }
        g.fillStyle = isHovM ? 'rgba(46,36,24,0.94)' : 'rgba(30,24,18,0.82)';
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        if (isHovM) { g.strokeStyle = '#ffe08a'; g.lineWidth = 1.6; g.stroke(); }
        g.fillStyle = m.color; g.font = `${r * 1.38}px 'Ma Shan Zheng', serif`; g.fillText(m.glyph, x, y + r * 0.08);
        const isCore = !isAmb;
        const labelAlpha = isHovM || m.glyph === '任' || m.glyph === '指' || dMode === 'all'
          ? 1
          : isCore
            ? fadeBand(k, 0.25, 0.5)
            : fadeBand(k, 0.9, 1.45);
        if (labelAlpha > 0.04) {
          const fs = Math.max(10, Math.min(12.5, 10 + (Z - 1) * 0.14));
          g.font = `${fs}px 'Noto Serif SC', serif`;
          const tw = g.measureText(m.name).width;
          let ty = y - r - 7;
          if (!isHovM) {
            const candY = [y - r - 7, y + r + fs * 0.85, y - r - 7 - (fs + 3), y + r + fs * 0.85 + (fs + 3), y - r - 7 - (fs + 3) * 2];
            let picked = false;
            for (const cy of candY) {
              const b = mapMarkLabelBox(x, cy, tw, fs);
              const box = { x0: b.x - 2, y0: b.y - 2, x1: b.x + b.width + 2, y1: b.y + b.height + 2 };
              const hit = placedBoxes.some((pb) => !(box.x1 < pb.x0 || box.x0 > pb.x1 || box.y1 < pb.y0 || box.y0 > pb.y1));
              if (!hit) { placedBoxes.push(box); ty = cy; picked = true; break; }
            }
            if (!picked) ty = dMode === 'all' ? y - r - 7 : NaN;
          }
          if (!isNaN(ty)) {
            g.globalAlpha = labelAlpha;
            const color = m.glyph === '任' ? 'rgba(110,70,0,0.95)' : m.glyph === '指' ? 'rgba(20,80,100,0.95)' : 'rgba(40,30,20,0.88)';
            drawMapMarkLabel(g, m.name, x, ty, tw, fs, color);
          }
        }
        g.restore();
      }
      // v0.52.5：放大地图时，迷雾已解开区域内的怪物平滑渐现名字与境界（宗门任务找怪不再靠瞎转）
      const enemyDotAlpha = dMode === 'all' ? 1 : fadeBand(Z, 1.35, 1.9);
      const enemyLabelAlpha = dMode === 'all' ? 1 : fadeBand(Z, 2.05, 2.65);
      if (enemyDotAlpha > 0.02) {
        const tasks = new Set((game.ws.sect?.tasks ?? []).filter((tk) => tk.kind === 'kill' && tk.until >= game.day).map((tk) => tk.target));
        g.font = `${Math.max(9, 9 * s * rz)}px 'Noto Serif SC', serif`;
        for (const en of game.combat.enemies) {
          if (!game.isExplored(en.x, en.y) || enemyPerceptibility(en, game.player.x, game.player.y, game.detailSenseRadius, game.senseBurstT > 0) <= .05) continue;
          const x = X(en.x / WORLD_SCALE), y = Y(en.y / WORLD_SCALE); if (!on(x, y)) continue;
          const isTask = tasks.has(en.def.id);
          g.save();
          g.globalAlpha = isTask ? Math.max(0.45, enemyDotAlpha) : enemyDotAlpha;
          g.fillStyle = isTask ? '#ffd040' : en.boss ? '#ff4a30' : en.def.kind === 'human' ? '#c06060' : '#a04a30';
          g.beginPath(); g.arc(x, y, isTask ? 4.5 : 3, 0, Math.PI * 2); g.fill();
          if (isTask) { g.strokeStyle = '#ffd040'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke(); }
          const elAlpha = isTask ? enemyDotAlpha : enemyLabelAlpha;
          if (elAlpha > 0.04) {
            g.globalAlpha = elAlpha;
            g.fillStyle = isTask ? 'rgba(90,60,0,0.95)' : 'rgba(60,30,20,0.85)';
            g.fillText(`${isTask ? '任·' : ''}${en.name || en.def.name}·${realmName(en.realm, en.stage)}`, x, y - 9);
          }
          g.restore();
        }
      }
      // 目的地：自动寻路打断后 destination 会清空，但仍保留 guide 的虚线导航
      const nav = game.destination ?? (game.guide && game.guide.map === ACTIVE_MAP ? game.guide : null);
      const px = X(game.player.x / WORLD_SCALE), py = Y(game.player.y / WORLD_SCALE);
      if (nav) {
        const dx = X(nav.x / WORLD_SCALE), dy = Y(nav.y / WORLD_SCALE);
        g.strokeStyle = '#a8352a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(dx - 6, dy - 6); g.lineTo(dx + 6, dy + 6); g.moveTo(dx + 6, dy - 6); g.lineTo(dx - 6, dy + 6); g.stroke();
        g.setLineDash([4, 5]); g.lineWidth = 1.5; g.strokeStyle = 'rgba(168,53,42,0.7)';
        g.beginPath(); g.moveTo(px, py); g.lineTo(dx, dy); g.stroke(); g.setLineDash([]);
      }
      // 玩家与神识
      const sr = (game.awarenessRadius / WORLD_SCALE) * k;
      g.strokeStyle = 'rgba(63,160,140,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, Math.max(sr, 5), 0, Math.PI * 2); g.stroke();
      if (Z > 2.5) { g.fillStyle = 'rgba(63,160,140,0.08)'; g.fill(); }
      // 虚线为精细实体圈；实线为外层粗略探察圈。
      const dr = (game.detailSenseRadius / WORLD_SCALE) * k;
      g.setLineDash([4, 3]); g.strokeStyle = 'rgba(155,100,62,0.85)'; g.beginPath(); g.arc(px, py, dr, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      const pulse = (t / 1000) % 1.6 / 1.6;
      if (isHeroVisible()) {
        g.strokeStyle = `rgba(168,53,42,${1 - pulse})`; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 6 + pulse * 18, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#a8352a'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      }
      (window as any).__wmMs = performance.now() - t0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // 滚轮缩放（以指针为中心）——必须非被动监听才能阻止页面滚动
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation();
      const r = cv.getBoundingClientRect();
      const f = Math.pow(1.0018, -Math.max(-240, Math.min(240, e.deltaY * (e.deltaMode === 1 ? 30 : 1))));
      zoomAt(f, ((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h);
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === '=' || e.key === '+') { zoomAt(1.4); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { zoomAt(1 / 1.4); e.preventDefault(); }
      else if (e.key === '0') { view.current.z = 1; clampView(); setZl(1); }
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf); cv.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key);
      fog.width = fog.height = 0;
      stCv.width = stCv.height = 0;
      cv.width = cv.height = 0;
      for (const t of tiles.values()) { t.cv.width = t.cv.height = 0; }
      tiles.clear();
    };
  }, [size, filterRev]);

  const local = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { sx: ((e.clientX - r.left) / r.width) * size.w, sy: ((e.clientY - r.top) / r.height) * size.h };
  };
  const toWorld = (e: React.PointerEvent) => {
    const { sx, sy } = local(e); const v = view.current, k = (size.w / MACRO_W) * v.z;
    return { mx: v.cx + (sx - size.w / 2) / k, my: v.cy + (sy - size.h / 2) / k };
  };
  const pickLoc = (mx: number, my: number) => {
    const k = (size.w / MACRO_W) * view.current.z;
    let best = '', bd = 14 / k;
    for (const l of LOCATIONS) {
      if (!isLocTypeVisible(l.type)) continue;
      if (l.minor && detailMode === 'clean' && l.id !== focusLocId) continue;
      if (l.minor && detailMode === 'smart' && k < 0.52 && l.id !== focusLocId) continue;
      if (!game.isExplored(l.x * WORLD_SCALE, l.y * WORLD_SCALE) && !l.major) continue;
      const d = Math.hypot(l.x - mx, l.y - my);
      if (d < bd) { bd = d; best = l.id; }
    }
    return best;
  };
  const pickMark = (mx: number, my: number) => {
    const k = (size.w / MACRO_W) * view.current.z;
    let best: { x: number; y: number; glyph: string; name: string } | null = null;
    let bd = 13 / k;
    for (const m of game.mapMarks?.() ?? []) {
      if (!isMarkVisible(m.glyph)) continue;
      if (detailMode === 'clean' && AMBIENT_MARK.has(m.glyph)) continue;
      const d = Math.hypot(m.x / WORLD_SCALE - mx, m.y / WORLD_SCALE - my);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };
  const onClick = (e: React.PointerEvent) => {
    const { mx, my } = toWorld(e);
    const id = pickLoc(mx, my);
    const loc = LOCATIONS.find((l) => l.id === id);
    const mk = !loc ? pickMark(mx, my) : null;
    const wx = loc ? loc.x * WORLD_SCALE + 200 : mk ? mk.x : mx * WORLD_SCALE;
    const wy = loc ? loc.y * WORLD_SCALE + 360 : mk ? mk.y : my * WORLD_SCALE;
    let followNpcId: string | undefined;
    if (mk) {
      if (mk.glyph === '援') {
        const inv = game.friends?.S?.invites?.find((v) => !v.done && !v.declined && !v.accepted && v.kind === 'help' && Math.hypot(v.x - mk.x, v.y - mk.y) < 30);
        if (inv) game.friends.accept(inv);
      } else if (mk.glyph === '仇') {
        const t = game.activeSosTargets().find((s) => s.followNpcId && Math.hypot(s.x - mk.x, s.y - mk.y) < 30);
        if (t) followNpcId = t.followNpcId;
      }
    }
    audio.sfx('click');
    if (game.debugTeleport) {
      game.teleport(wx, wy);
      game.toast(`（体验）瞬移至${loc ? loc.name : mk ? mk.name : '此地'}。`);
    } else if (flyMode) {
      game.startAutoFlight(wx, wy, loc ? loc.name : mk ? mk.name : '目的地', followNpcId);
    } else {
      // 只设目的地：手动接管即作废；想长期记住某地请用「指路」（大事记 / 老采药人）
      game.stopAutoFlight();
      game.setDestination(wx, wy, loc ? loc.name : mk ? mk.name : '目的地', followNpcId);
      game.toast(loc ? `已设定目的地：${loc.name}（${loc.label ?? LOC_TYPE_NAME[loc.type]}）` : mk ? `已设定目的地：${mk.name}` : '已设定目的地。');
    }
    onClose();
  };
  const onDown = (e: React.PointerEvent) => {
    setSearchOpen(false);
    const { sx, sy } = local(e);
    pts.current.set(e.pointerId, { x: sx, y: sy });
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* */ }
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = {
        d: Math.max(16, Math.hypot(a.x - b.x, a.y - b.y)),
        z: view.current.z,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      if (drag.current) drag.current.moved = true;
    } else drag.current = { x: sx, y: sy, cx: view.current.cx, cy: view.current.cy, moved: false, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: sx, y: sy });
    if (pinch.current && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      const k = (size.w / MACRO_W) * view.current.z;
      view.current.cx -= (midX - pinch.current.mx) / k;
      view.current.cy -= (midY - pinch.current.my) / k;
      pinch.current.mx = midX;
      pinch.current.my = midY;
      // 指数阻尼放大捏合手势跨度，避免手机屏上捏合一次只能变一点点
      const ratio = Math.max(0.2, d / pinch.current.d);
      const target = pinch.current.z * Math.pow(ratio, 1.55);
      zoomAt(target / view.current.z, midX, midY);
      return;
    }
    const D = drag.current;
    if (D && D.id === e.pointerId) {
      const dx = sx - D.x, dy = sy - D.y;
      if (!D.moved && Math.hypot(dx, dy) > 5) D.moved = true;
      if (D.moved) {
        const k = (size.w / MACRO_W) * view.current.z;
        view.current.cx = D.cx - dx / k; view.current.cy = D.cy - dy / k; clampView();
      }
      if (D.moved) return;
    }
    const { mx, my } = toWorld(e);
    const id = pickLoc(mx, my);
    if (id !== hover) setHover(id);
    const mk = id ? null : pickMark(mx, my);
    if (mk !== hoverMark && (mk?.x !== hoverMark?.x || mk?.y !== hoverMark?.y || mk?.glyph !== hoverMark?.glyph)) {
      setHoverMark(mk);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const wasPinching = !!pinch.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) {
      pinch.current = null;
      if (wasPinching && pts.current.size === 1) {
        // 双指松开其中一指后平滑交接给剩余单指拖拽，并标记 moved=true 防止误触落点
        const [remId, remPos] = [...pts.current.entries()][0];
        drag.current = { x: remPos.x, y: remPos.y, cx: view.current.cx, cy: view.current.cy, moved: true, id: remId };
        return;
      }
    }
    const D = drag.current;
    if (D && D.id === e.pointerId) { drag.current = null; if (!D.moved) onClick(e); }
    else if (pts.current.size === 0) { drag.current = null; }
  };
  const hovered = LOCATIONS.find((l) => l.id === hover);
  const zb = (f: number) => (e: React.MouseEvent) => { e.stopPropagation(); audio.sfx('click'); zoomAt(f); };
  const mapWars = (game.sectwar?.frontLines?.() ?? []).filter((fl) => fl.map === ACTIVE_MAP);
  const mapSosList = game.activeSosTargets();
  const hoveredOwn = hovered ? game.sectwar?.holdOwnerInfo?.(hovered.id) : null;
  const hoveredAuc = hovered && game.towns.isMajorTown(hovered) ? game.towns.auctionSchedule(hovered) : null;
  const subText = hovered
    ? `${hovered.name}${hoveredOwn ? ` [${hoveredOwn.isBranch ? hoveredOwn.name : `${hoveredOwn.isolated ? '孤立飞地 · ' : ''}${hoveredOwn.name}据点 · 镇守 ${hoveredOwn.g} 人`}]` : ''}　${game.isExplored(hovered.x * WORLD_SCALE, hovered.y * WORLD_SCALE) ? hovered.desc : '只闻其名，尚未亲至。'}${hoveredAuc ? (hoveredAuc.open ? `　·　【拍卖会正开 · 剩 ${hoveredAuc.leftDays} 日】` : `　·　拍卖会 ${hoveredAuc.waitDays} 日后`) : ''}`
    : hoverMark
      ? `【${GLYPH_NAME[hoverMark.glyph] ?? hoverMark.glyph}】${hoverMark.name}（点击即可设定前往）`
      : `已探索 ${(game.ui.explored * 100).toFixed(1)}%　·　${TOUCH_UI ? '双指 / ＋－ 缩放' : '滚轮 / ＋－ 缩放'}，拖动平移，点击设定目的地${game.debugTeleport ? '（体验：瞬移）' : ''}`;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="scroll-panel map-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head" style={{ width: size.w, maxWidth: '100%', boxSizing: 'border-box' }}>
          <div className="panel-title" style={{ flex: '0 0 auto' }}>{WORLDS[ACTIVE_WORLD].name}舆图 · {MAP_NAME[ACTIVE_MAP]}</div>
          <div className="panel-sub" title={subText} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--ink-soft)' }}>
            {hovered ? (
              <>
                <b style={{ color: 'var(--ink)' }}>{hovered.name}</b>
                {hoveredOwn ? ` [${hoveredOwn.isBranch ? hoveredOwn.name : `${hoveredOwn.isolated ? '孤立飞地 · ' : ''}${hoveredOwn.name}据点 · 镇守 ${hoveredOwn.g} 人`}]` : ''}
                {`　${game.isExplored(hovered.x * WORLD_SCALE, hovered.y * WORLD_SCALE) ? hovered.desc : '只闻其名，尚未亲至。'}`}
                {hoveredAuc ? (hoveredAuc.open ? `　·　【拍卖会正开 · 剩 ${hoveredAuc.leftDays} 日】` : `　·　拍卖会 ${hoveredAuc.waitDays} 日后`) : ''}
              </>
            ) : hoverMark ? (
              <><b style={{ color: 'var(--ink)' }}>【{GLYPH_NAME[hoverMark.glyph] ?? hoverMark.glyph}】</b>{hoverMark.name}</>
            ) : subText}
          </div>
          <button className="close-btn" style={{ flex: '0 0 auto' }} onClick={onClose}>×</button>
        </div>
        <div className="map-toolbar" style={{ width: size.w, maxWidth: '100%' }}>
          <div className="map-search-wrap">
            <input
              className="map-search"
              type="search"
              value={searchQ}
              placeholder="搜寻城池 / 宗门 / 求救 / 标记…"
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); if (!e.target.value.trim()) setFocusLocId(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault();
                  jumpToSearch(searchResults[0]);
                } else if (e.key === 'Escape') {
                  setSearchOpen(false);
                }
              }}
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="map-search-pop">
                {searchResults.map((entry, idx) => entry.kind === 'loc' ? (
                  <button key={`l:${entry.l.id}`} type="button" onClick={() => jumpToSearch(entry)}>
                    <i style={{ background: SEAL_COLOR[entry.l.type] }}>{entry.l.seal ?? SEAL[entry.l.type]}</i>
                    <span>{entry.l.name}</span>
                    <small>{entry.l.label ?? LOC_TYPE_NAME[entry.l.type]}</small>
                  </button>
                ) : (
                  <button key={`m:${idx}:${entry.m.name}`} type="button" onClick={() => jumpToSearch(entry)}>
                    <i style={{ background: '#9a352a', color: '#fff3dd' }}>{entry.m.glyph}</i>
                    <span>{entry.m.name}</span>
                    <small>{GLYPH_NAME[entry.m.glyph] ?? '标记'}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="map-mode-seg" title="调节地点与标记的显隐密度">
            {([
              ['smart', '智能', '显示全部标记图标；按缩放自动展开文字与小地点印章'],
              ['clean', '清简', '只看主城、宗门、城镇、秘境与任务战事，隐藏零碎小点与已探'],
              ['all', '详尽', '显示全部已探索地点、标记图标与完整文字标签'],
            ] as [MapDetailMode, string, string][]).map(([m, label, tip]) => (
              <button
                key={m}
                type="button"
                className={detailMode === m ? 'on' : ''}
                title={tip}
                onClick={() => { audio.sfx('click'); setMapDetailMode(m); }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="worldmap-wrap" style={{ width: size.w, height: size.h }}>
          <canvas ref={ref} className={'worldmap-canvas' + (zl > 1 ? ' zoomed' : '')} style={{ width: size.w, height: size.h }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { setHover(''); setHoverMark(null); }} />
          {mapWars.length > 0 && (
            <div
              className={`map-war-float${warHudOpen ? ' open' : ''}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: Math.min(310, Math.round(size.w * (TOUCH_UI || size.w < 540 ? 0.68 : 0.46))) }}
            >
              <div className="mwf-head">
                <b>战局（{mapWars.length}）</b>
                <button
                  type="button"
                  className="mwf-toggle"
                  onClick={() => setWarHudOpen((v) => !v)}
                >
                  {warHudOpen ? '收起' : '展开'}
                </button>
              </div>
              {warHudOpen && (
                <div className="mwf-list">
                  {mapWars.map((fl) => (
                    <div
                      key={fl.warId}
                      className="mwf-item"
                      onClick={() => { audio.sfx('click'); focusPoint(fl.fx, fl.fy, 3.6); }}
                      style={{ borderLeftColor: fl.attSide === 0 ? fl.colA : fl.colB }}
                      title="点击将舆图聚焦至此战线与双方大营"
                    >
                      <div className="mwf-row">
                        <span>{fl.nameA} ⚔ {fl.nameB}</span>
                        <em className={fl.siege ? 'siege' : ''}>{fl.stageLabel}</em>
                      </div>
                      <div className="mwf-meta">
                        营兵 {fl.campASoldiers}/{fl.campBSoldiers} · 丹 {fl.campAPills}/{fl.campBPills} · 折损 {fl.la}/{fl.lb}{fl.marchesActive ? ` · 在途${fl.marchesActive}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {mapSosList.length > 0 && (
            <div
              className="map-sos-float"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: Math.min(340, Math.round(size.w * 0.88)) }}
            >
              {mapSosList.slice(0, 3).map((t) => (
                <div key={t.id} className="msf-row">
                  <span className={'msf-tag' + (t.urgent ? ' urgent' : '')}>{t.tag}</span>
                  <span className="msf-title" title={t.detail}>{t.title}</span>
                  <button
                    type="button"
                    className="msf-btn"
                    onClick={() => {
                      audio.sfx('click');
                      focusPoint(t.x, t.y, Math.max(view.current.z, 3.6));
                      setHoverMark({ x: t.x, y: t.y, glyph: t.urgent ? '援' : '约', name: t.title });
                    }}
                  >定位</button>
                  <button
                    type="button"
                    className="msf-btn go"
                    onClick={() => {
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
                      onClose();
                    }}
                  >{game.canFly ? '御剑导航' : '直接导航'}</button>
                </div>
              ))}
            </div>
          )}
          <div className="wm-zoom">
            <button onClick={zb(1.5)} disabled={zl >= WM_ZMAX - 0.01} title="放大（滚轮 / +）">＋</button>
            <div className="wm-zl">{zl < 1.05 ? '全图' : `${zl.toFixed(1)}×`}</div>
            <button onClick={zb(1 / 1.5)} disabled={zl <= 1.001} title="缩小（滚轮 / -）">－</button>
            <button className="wm-me" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); centerHero(WM_ZMAX); }} title="以自己为中心，放到最大">我</button>
            <button className="wm-me" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); view.current.z = 1; clampView(); setZl(1); }} title="看全图（0）">全</button>
            <button
              className="wm-me"
              style={flyMode ? { background: 'var(--jade, #3a7c66)', color: '#fff' } : undefined}
              onClick={(e) => { e.stopPropagation(); audio.sfx('click'); setFlyMode((v) => !v); }}
              title="开启后点击地图将自动起飞御剑托管赶路（遇敌 / 劫粮 / 低灵力自动停驻）"
            >
              {flyMode ? '御剑✓' : '御剑'}
            </button>
          </div>
        </div>
        <div className="map-tabs">
          <span title={`${WORLDS[ACTIVE_WORLD].scale} · 极境 ${WORLDS[ACTIVE_WORLD].realmCap.label}`} style={{ opacity: 0.85 }}><b>{WORLDS[ACTIVE_WORLD].name}</b></span>
          {MAP_IDS.map((m) => <span key={m} className={m === ACTIVE_MAP ? 'on' : ''} title={MAP_ROUTE[m]}><b>{MAP_NAME[m]}</b>{mapRouteLabel(m)}</span>)}
          {onOpenHigher && (game.hero.realm >= 5 || ACTIVE_WORLD !== 'human' || (game.ws.ascendedWorlds?.length ?? 0) > 0) && (
            <button type="button" className="ink-btn small jade" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 12 }} onClick={() => { onClose(); onOpenHigher(); }}>
              跨界飞升 / 上界修行
            </button>
          )}
        </div>
        <div className="map-legend" style={{ width: size.w, maxWidth: '100%', minWidth: 0 }}>
          {(() => {
            // 图例筛选：点某一项 = 隐藏/显示这一类；点「全部隐藏」进入"只看选中类"模式。
            // 只列当前地图里真的出现的类别（天南没有「海岛」，乱星海才有）。
            const typesHere = new Set<string>(LOCATIONS.map((l) => l.type as string));
            const baseItems: { k: string; label: string; icon: any; off: boolean; title: string }[] = [];
            for (const k of Object.keys(SEAL)) {
              if (!typesHere.has(k)) continue;
              baseItems.push({
                k: 'loc:' + k, label: LOC_TYPE_NAME[k as keyof typeof LOC_TYPE_NAME] ?? k,
                icon: <i style={{ background: SEAL_COLOR[k] }}>{SEAL[k]}</i>,
                off: isMapFilterOff('loc:' + k), title: `点击隐藏 / 显示「${LOC_TYPE_NAME[k as keyof typeof LOC_TYPE_NAME] ?? k}」这类地点`,
              });
            }
            baseItems.push({
              k: 'hero', label: '自己', off: isMapFilterOff('hero'), title: '点击隐藏 / 显示你的位置',
              icon: <i style={{ background: '#a8352a', borderRadius: '50%', boxShadow: '0 0 0 1.5px #fff' }} />,
            });
            baseItems.push({
              k: 'territory', label: '势力范围', off: isMapFilterOff('territory'), title: '点击隐藏 / 显示各宗门势力疆域版图',
              icon: <i style={{ background: 'rgba(64,136,120,0.35)', border: '1.5px dashed #3d8072', borderRadius: '50%' }} />,
            });
            const glyphs = new Set<string>();
            for (const m of game.mapMarks?.() ?? []) if (!ALWAYS_MARK.has(m.glyph)) glyphs.add(m.glyph);
            const prior = ['府', '攻', '营', '军', '运', '劫', '守', '战', '秘', '秘？', '境', '宝', '夺', '赏', '援', '妖', '王'];
            const glyphList = [
              ...prior.filter((g) => glyphs.has(g)),
              ...[...glyphs].filter((g) => !prior.includes(g) && g !== '✓'),
              ...(glyphs.has('✓') ? ['✓'] : []),
            ];
            const extraItems = glyphList.map((g) => ({
              k: 'mk:' + g, label: GLYPH_NAME[g] ?? g,
              icon: <i style={{ background: 'rgba(30,24,18,0.78)', borderRadius: '50%', color: 'var(--paper-3)', ...(g.length > 1 ? { fontSize: 8.5, letterSpacing: '-0.08em' } : {}) }}>{g}</i>,
              off: isMapFilterOff('mk:' + g), title: `点击隐藏 / 显示「${GLYPH_NAME[g] ?? g}」标记`,
            }));
            const shownExtras = legendExpanded ? extraItems : extraItems.slice(0, 4);
            return (
              <>
                {baseItems.concat(shownExtras).map((it) => (
                  <span key={it.k} className={it.off ? 'off' : ''} title={it.title} style={{ cursor: 'pointer' }}
                    onClick={() => { audio.sfx('click'); clickMapFilter(it.k); }}>
                    {it.icon}{it.label}
                  </span>
                ))}
                {extraItems.length > 4 && (
                  <span
                    className="lg-more"
                    style={{ cursor: 'pointer', color: 'var(--jade)', fontWeight: 600 }}
                    onClick={() => { audio.sfx('click'); setLegendExpanded((v) => !v); }}
                  >
                    {legendExpanded ? '收起标记▴' : `+${extraItems.length - 4}项标记▾`}
                  </span>
                )}
              </>
            );
          })()}
          <span className={'lg-all' + (anyMapFilterOff() ? ' on' : '')}
            title={anyMapFilterOff() ? '把图例里所有类别都放出来' : '收起所有地点与标记（任务、指路始终可见）'}
            onClick={() => { audio.sfx('click'); toggleMapFilterAll(); }}>
            {anyMapFilterOff() ? '全部显示' : '全部隐藏'}
          </span>
          <span title="清晰感知与施法锁定边界（不参与筛选）"><i style={{ border: '1.5px dashed #9b643e', borderRadius: '50%', background: 'transparent' }} />清晰内圈</span>
          <span title="神识外圈探察范围（不参与筛选）"><i style={{ border: '1.5px solid #3fa08c', borderRadius: '50%', background: 'transparent' }} />神识外圈</span>
        </div>
      </div>
    </div>
  );
}
