import { useEffect, useRef, useState } from 'react';
import { goreLevel, setGoreLevel } from '../world/gore';
import { gfxSetting, setGfxOn } from '../hd2d/grade';   // 收官第四轮乙：设置里的「光影」开关
import { grainSetting, setGrainOn } from '../core/grain';   // r15-touchctl：设置里的「画面颗粒」开关
import { OuterMap } from './worldmapOuter';
import { realmOfMap, VOID_SCALE, type Realm } from '../data/zhujie';
import type { Game } from '../world/game';
import { FOG_W, FOG_H } from '../world/game';
import { audio } from '../world/audio';
import { KeyBindPanel } from './KeyBind';
import { LqPanel } from './kit/LqPanel';   // 收官 H1：统一外壳
import { LacquerModal } from './kit/LacquerModal';   // 收官 H2：舆图外壳
import { getHudScale, setHudScale, hudScaleRange, effHudScale } from './kit/hooks';   // 收官 H3：界面大小
import { KeysHelp, TouchHelp } from './KeysHelp';   // 收官 H1：操作说明从 keymap 取
import { bindOf, isCustom, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import { realmName } from '../data/realms';
import { ctxLessonsOn, setCtxLessonsOn } from '../world/tutorial';   // 收官 I：新手引导的两个开关
import { TOAST_MODES, toastMode, setToastMode, isToastMode } from '../world/toastPolicy';   // r14-toast：消息提示档位
import { atmoEnabled, setAtmo } from '../world/mood';
import { LOCATIONS, BIG_LABELS, WORLD_SCALE, MACRO_W, MACRO_H, LOC_TYPE_NAME, ACTIVE_MAP, MAP_NAME, MAP_IDS, MAP_EXITS } from '../data/world';
import { lockCamSetting, setLockCam } from '../world/lockcam';   // r11-lock
import { hsCamSetting, setHsCam } from '../world/hscam';   // 撼山客特写镜头（默认关）
// 三图之间的往来方式（舆图顶部的说明）
const MAP_ROUTE: Record<string, string> = {
  tiannan: '南荒：梁国七派、正一盟、魔门六宗、列国盟、朔漠草原与极西之地',
  luanxing: '沧溟海：经梁京城外灵石矿洞的上古传送阵（需大挪移令）',
  dajin: '中州：自南荒北缘横穿天穹草原，约四个月路程',
};

export const SEAL: Record<string, string> = { city: '城', town: '镇', sect: '宗', danger: '险', secret: '秘', isle: '岛', inn: '驿' };
export const SEAL_COLOR: Record<string, string> = { city: '#9a3b2c', town: '#8a6a3a', sect: '#2f6b5e', danger: '#5a1f2a', secret: '#3a5a8a', isle: '#2f6a80', inn: '#6a5a3a' };

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
    try { const raw = localStorage.getItem('taixu.treeDensity'); if (raw === null) return 1; const v = Number(raw); return Number.isFinite(v) && v >= 0 ? Math.min(8, Math.round(v)) : 1; } catch { return 1; }
  })();
  const tSlider = tStride === 0 ? 0 : 9 - tStride;
  // 收官 H1：外壳换成界面底座（LqPanel，紧凑标题栏）；旧类名 .modal-mask / .scroll-panel / .settings / .panel-head / .close-btn 照挂
  return (<>
    <LqPanel title="设置" onClose={onClose} compact width={600} cls="settings">
        <div className="set-list">
          <div className="set-row"><div>背景音乐与音效<small>程序生成的古琴、箫声与风声</small></div>
            <button className={'switch' + (audio.enabled ? ' on' : '')} onClick={() => { audio.unlock(); audio.setEnabled(!audio.enabled); saveAudio(); re(); }} /></div>
          <div className="set-row"><div>音乐音量</div>
            <input type="range" min={0} max={1} step={0.05} value={audio.musicVol} onChange={(e) => { audio.setMusicVol(+e.target.value); saveAudio(); re(); }} /></div>
          <div className="set-row"><div>音效音量</div>
            <input type="range" min={0} max={1} step={0.05} value={audio.sfxVol} onChange={(e) => { audio.setSfxVol(+e.target.value); audio.sfx('chime'); saveAudio(); re(); }} /></div>
          {/* 收官 H3：界面大小——主界面各区整体缩放（面板内部不受影响），记在本机 */}
          {/* 第五轮：手机上范围收窄（85%–110%），放太大会压住摇杆和法诀盘 */}
          <div className="set-row"><div>界面大小<small>人物牌、小地图、快捷栏、按钮等主界面整体缩放 · 当前 {Math.round(effHudScale(getHudScale(), IS_TOUCH) * 100)}%{IS_TOUCH ? '（手机上 85%–110%）' : ''}</small></div>
            <input type="range" min={hudScaleRange(IS_TOUCH)[0]} max={hudScaleRange(IS_TOUCH)[1]} step={0.05} value={effHudScale(getHudScale(), IS_TOUCH)} onChange={(e) => { setHudScale(+e.target.value); re(); }} /></div>
          {/* 收官 I：新手引导——重看入门一课、情境小课开关 */}
          {game && <div className="set-row"><div>新手引导<small>从头再上一遍入门一课（移动、交谈、装备、丹药、斗法、打坐、御剑、地图、宗门差事）</small></div>
            <button className="ink-btn" onClick={() => { click(); game.tutorial.replay(); onClose(); }}>重　看</button></div>}
          <div className="set-row"><div>情境小课<small>第一次遇到摆摊、秘境、无边海、拼招、追杀、虚空时，弹两三句提点</small></div>
            <button className={'switch' + (ctxLessonsOn() ? ' on' : '')} onClick={() => { click(); setCtxLessonsOn(!ctxLessonsOn()); re(); }} /></div>
          {/* r14-toast：消息提示档位（记在本机 taixu.toastMode；手机默认「只显示重要的」、电脑默认「全部显示」）。没弹的都在左上「讯」里 */}
          <div className="set-row"><div>消息提示<small>{TOAST_MODES.find((m) => m.id === toastMode(IS_TOUCH))?.desc}。没弹出来的都记在左上「讯」里，点开可看</small></div>
            <select className="ink-select" value={toastMode(IS_TOUCH)} onChange={(e) => { const v = e.target.value; if (isToastMode(v)) setToastMode(v); click(); re(); }}>
              {TOAST_MODES.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === (IS_TOUCH ? 'important' : 'all') ? '（默认）' : ''}</option>)}
            </select></div>
          {/* r11-lock：锁定跟随镜头（记在本机 taixu.lockcam，默认开） */}
          <div className="set-row"><div>锁定跟随镜头<small>锁定目标后镜头往对方那边偏一点、把两人框进画面（离太远就不跟）；御剑高空、虚空、海渊、近战演出时让给那边的镜头</small></div>
            <button className={'switch' + (lockCamSetting.on ? ' on' : '')} onClick={() => { click(); setLockCam(!lockCamSetting.on); re(); }} /></div>
          <div className="set-row"><div>撼山客出招特写<small>他放招时镜头推近、侧面取景把两人框进来；关着时镜头照常跟着你（默认关）</small></div>
            <button className={'switch' + (hsCamSetting.on ? ' on' : '')} onClick={() => { click(); setHsCam(!hsCamSetting.on); re(); }} /></div>
          {game && <>
            <div className="set-row"><div>画质
              <small>{game.renderer?.stage ? 'WebGL 特效渲染' : '兼容模式（Canvas2D）'}{game.renderer?.fixedQuality ? '' : ' · 自动'}
                {game.renderer?.stage ? <> · {game.renderer.stage.softGPU
                  ? <b style={{ color: '#b8443a' }}>显卡未启用（正在用 CPU 软件渲染，会很卡）</b>
                  : <>显卡 {game.renderer.stage.gpuName.replace(/^ANGLE \(|\)$/g, '').slice(0, 34)}</>}</> : null}
              </small></div>
              <select className="ink-select" value={game.renderer?.fixedQuality ? String(game.renderer.tier) : 'auto'} onChange={(e) => { const v = e.target.value; if (v === 'auto') { game.renderer.fixedQuality = false; } else game.renderer.setQuality(+v); try { localStorage.setItem('taixu.quality', v); } catch { /* */ } re(); }}>
                <option value="auto">自动（按帧率调）</option><option value="2">高（泛光 · 足分辨率）</option><option value="1">中</option><option value="0">流畅优先（低画质 · 关氛围特效）</option>
              </select></div>
            {/* 收官第四轮乙（画面线）：光影开关——高动态范围、点光源、时辰分色调、高度雾；关掉退回原来的画法（记在本机 taixu.gfx） */}
            <div className="set-row"><div>光影<small>灯火与法术照亮周围、晨昏层次、山谷薄雾；显卡吃力时可关</small></div>
              <button className={'switch' + (gfxSetting.on ? ' on' : '')} onClick={() => { click(); setGfxOn(!gfxSetting.on); re(); }} /></div>
            <div className="set-row"><div>血腥程度<small>受击溅血、血雾、地上血迹；暴击击杀会炸开</small></div>
              <select className="ink-select" value={String(goreLevel())} onChange={(e) => { setGoreLevel(+e.target.value); click(); re(); }}>
                <option value="0">关</option><option value="1">适中</option><option value="2">浓烈</option>
              </select></div>
            <div className="set-row"><div>HD2D 立体场景<small>[ ] 旋转镜头，滚轮缩放</small></div></div>
            <div className="set-row"><div>世界层分辨率<small>世界层每帧整张上传 GL：越低越省、画质略软；最右为不限制（HUD 文字不受影响）</small></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={0.8} max={1.7} step={0.05} style={{ width: 140 }}
                  value={game.renderer?.worldDprCap ? game.renderer.worldDprCap : 1.7}
                  onChange={(e) => { const v = Number(e.target.value); game.renderer?.setWorldDprCap(v >= 1.65 ? 0 : +v.toFixed(2), true); re(); }} />
                <span style={{ minWidth: 46, opacity: 0.85 }}>{game.renderer?.worldDprCap ? game.renderer.worldDprCap.toFixed(2) : '不限制'}</span>
              </div></div>
            {/* r15-touchctl：画面颗粒——后期那层按屏幕像素撒的暗点（兼容模式是宣纸纤维图）；关掉画面干净，渐变照样不出色带（记在本机 taixu.grain，默认开） */}
            <div className="set-row"><div>画面颗粒<small>画面上那层细砂似的纸纹颗粒；关掉画面更干净（手机上尤其明显）</small></div>
              <button className={'switch' + (grainSetting.on ? ' on' : '')} aria-label="画面颗粒" onClick={() => { click(); setGrainOn(!grainSetting.on); re(); }} /></div>
            <div className="set-row"><div>氛围层<small>月亮/星星/远山/云带等视差层；关闭后画面更干净（无 WebGL 时始终不画）</small></div>
              <button className={'switch' + (atmoEnabled() ? ' on' : '')} onClick={() => { click(); setAtmo(!atmoEnabled()); re(); }} /></div>
            <div className="set-row"><div>四季缓存<small>提前烘好另外三季的树，换季瞬间完成；原版默认关，开启后更吃内存/CPU</small></div>
              <button className={'switch' + (game.renderer?.seasonCache !== false ? ' on' : '')} onClick={() => { click(); game.renderer?.setSeasonCache(!(game.renderer?.seasonCache !== false)); re(); }} /></div>
            <div className="set-row"><div>树木密度<small>左稀右密：最左 0 = 不生成树，最右 100% = 全部；拖动后立即重算</small></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={0} max={8} step={1} style={{ width: 140 }} value={tSlider} onChange={(e) => {
                  const s = Math.round(+e.target.value);
                  const stride = s <= 0 ? 0 : 9 - s;
                  (globalThis as any).__treeDensity = stride;
                  (globalThis as any).__setTreeDensity?.(stride);
                  try { localStorage.setItem('taixu.treeDensity', String(stride)); } catch { /* */ }
                  re();
                }} />
                <span style={{ minWidth: 46, opacity: 0.85 }}>{tStride === 0 ? '无树' : `${Math.round(100 / tStride)}%`}</span>
              </div></div>
            <div className="set-row"><div>树木精灵清晰度<small>固定分辨率不再随缩放重烘；性能好选高，性能差选低（跟随缩放=原版）</small></div>
              <select className="ink-select" value={String(game.renderer?.treeSpriteZoom ?? 0)}
                onChange={(e) => { click(); game.renderer?.setTreeSpriteZoom(Number(e.target.value)); re(); }}>
                <option value="0">跟随缩放（原版）</option>
                <option value="1.5">高 1.50×（清晰，费内存）</option>
                <option value="1.25">中 1.25×</option>
                <option value="1">低 1.00×</option>
                <option value="0.8">最省 0.80×</option>
              </select></div>
            <div className="set-row"><div>山峰精灵清晰度<small>跟随缩放＝原版（低缩放时会重绘三档）；选固定档则缩放全程不重绘</small></div>
              <select className="ink-select" value={String(game.renderer?.mtnSpriteZoom ?? 0.75)}
                onChange={(e) => {
                  click();
                  const v = Number(e.target.value), r = game.renderer;
                  if (r) {
                    r.mtnSpriteZoom = v;
                    try { localStorage.setItem('taixu.mtnSprite', String(v)); } catch { /* */ }
                  }
                  re();
                }}>
                <option value="0">跟随缩放（原版）</option>
                <option value="0.5">省内存 0.50×（约 20MP）</option>
                <option value="0.75">中 0.75×（约 46MP，推荐）</option>
                <option value="1">高 1.00×（约 78MP，更清晰）</option>
                <option value="1.4">最高 1.40×（约 86MP，很费）</option>
              </select></div>
            <div className="set-row"><div>树风摆<small>原版默认开；关掉走轴对齐快路径，密林更流畅（树不再轻摆）</small></div>
              <button className={'switch' + (!game.renderer?.flatTrees ? ' on' : '')} onClick={() => { click(); const r = game.renderer; if (r) r.setTreeSway(r.flatTrees); re(); }} /></div>
            <div className="set-row"><div>性能监视<small>显示帧率与耗时（快捷键 F3）</small></div>
              <button className={'switch' + (game.showPerf ? ' on' : '')} onClick={() => { click(); game.showPerf = !game.showPerf; re(); }} /></div>
            {onSaves && <div className="set-row"><div>存档 / 读档<small>一个自动存档 + 三个手动存档位</small></div><button className="ink-btn" onClick={() => { click(); onSaves(); }}>打开</button></div>}
            <div className="set-row"><div>天气（体验）<small>强制指定天气，便于预览</small></div>
              <select className="ink-select" value={game.weather.forced ?? ''} onChange={(e) => { game.setWeather((e.target.value || null) as any); re(); }}>
                <option value="">自然变化</option><option value="clear">晴</option><option value="rain">雨</option><option value="storm">雷雨</option><option value="snow">雪</option><option value="fog">雾</option><option value="sand">风沙</option>
              </select></div>
            <div className="set-row"><div>时辰（体验）<small>拨动昼夜</small></div>
              <input type="range" min={0} max={1} step={0.01} value={game.dayPhase} onChange={(e) => { game.clock = +e.target.value * 240; re(); }} /></div>
            <div className="set-row"><div>显示全图（体验）<small>揭开所有迷雾，便于预览整个人界</small></div>
              <button className={'switch' + (game.revealAll ? ' on' : '')} onClick={() => { click(); game.revealAll = !game.revealAll; game.updateUI(); re(); }} /></div>
            <div className="set-row"><div>御剑飞行（体验）<small>炼气期本不能御剑，此为预览用，可飞越山海{IS_TOUCH ? '' : `（快捷键 ${keyLabel(bindOf('fly'))}）`}</small></div>
              <button className={'switch' + (game.player.flying ? ' on' : '')} onClick={() => { game.toggleFly(); re(); }} /></div>
            <div className="set-row"><div>地图点选瞬移（体验）<small>在世界地图上点击即直接传送，方便看遍各地</small></div>
              <button className={'switch' + (game.debugTeleport ? ' on' : '')} onClick={() => { click(); game.debugTeleport = !game.debugTeleport; re(); }} /></div>
          </>}
          <div className="set-row"><div>自定义按键<small>{isCustom() ? '已改过：点「改键」再调' : (IS_TOUCH ? '接蓝牙 / 外接键盘时用，默认仍是旧键位' : '键盘任意键，或鼠标左/中/右键；默认仍是旧键位')}</small></div>
            <button className="ink-btn" onClick={() => { click(); setKb(true); }}>改　键</button></div>
          <div className="set-row set-keys" style={{ display: 'block' }}>
            <div className="sec-title" style={{ marginTop: 4 }}>操作说明</div>
            {/* 收官 H1：键位从 core/keymap 取（改了键跟着变），手机一套说法 */}
            {IS_TOUCH ? <TouchHelp /> : <KeysHelp />}
          </div>
          {game && onExit && (
            <div className="set-row" style={{ borderBottom: 'none' }}>
              <div>返回标题<small>进度会自动保存</small></div>
              <button className="ink-btn" onClick={() => { click(); game.save(0); onExit(); }}>返回</button>
            </div>
          )}
        </div>
    </LqPanel>
    {kb && <KeyBindPanel onClose={() => { setKb(false); re(); }} />}
  </>);
}

function saveAudio() {
  try { localStorage.setItem('taixu_audio', JSON.stringify({ e: audio.enabled, m: audio.musicVol, s: audio.sfxVol })); } catch { /* */ }
}
export function loadAudio() {
  try {
    const d = JSON.parse(localStorage.getItem('taixu_audio') || 'null');
    if (d) { audio.setEnabled(!!d.e); audio.setMusicVol(d.m); audio.setSfxVol(d.s); }
  } catch { /* */ }
}

// ---------- 世界地图 ----------
// 第三十步：大地图可缩放（滚轮 / ＋－按钮 / 双指捏合 / 键盘 + -）与拖动平移；放大后叠加局部高清底图（河、路、山林矢量）
// B 版：缩到全图以下还能接着缩——先看到人界的另外两张图、天穹草原、无边海和界壁，再往外是星域和三千界（ui/worldmapOuter.ts）
const WM_ZMAX = 8;
/** 缩到全图以下时，地点印章、标记淡出到这个倍数为止 */
const WM_ZPLACE = 0.45;
export function WorldMapPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [hover, setHover] = useState<string>('');
  const [zl, setZl] = useState(1);
  const view = useRef({ z: 1, cx: MACRO_W / 2, cy: MACRO_H / 2 });
  const hoverRef = useRef(''); hoverRef.current = hover;
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const outer = useRef<OuterMap | null>(null);
  outer.current ??= new OuterMap(game, ACTIVE_MAP);
  const zMin = () => outer.current!.zMin(MACRO_W, MACRO_H);
  const [hoverRealm, setHoverRealm] = useState<Realm | null>(null);

  useEffect(() => {
    const fit = () => {
      // 收官 H2：外壳换成乌木漆底（匾额、角花），四周比旧卷轴多占一圈；矮屏（手机横屏）不挂匾额，地图尽量大
      const narrow = window.innerWidth < 760, short = window.innerHeight <= 520;
      const mw = Math.min(window.innerWidth - (narrow || short ? 24 : 110), 1200), mh = window.innerHeight - (short ? 96 : narrow ? 300 : 256);   // 第五轮：电脑上再留 20（1600×900 下外框下沿出屏约 9 像素）
      let w = mw, h = (w * MACRO_H) / MACRO_W;
      if (h > mh) { h = mh; w = (h * MACRO_W) / MACRO_H; }
      setSize({ w: Math.max(260, Math.floor(w)), h: Math.max(182, Math.floor(h)) });
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const clampView = () => {
    const v = view.current, O = outer.current!;
    v.z = Math.max(zMin(), Math.min(WM_ZMAX, v.z));
    // 正看着图外（别的图、海、别界）时最多放大到全图这一级：再大只有本图有细节，而且会被一下子拽回本图
    if (v.z >= 1 && (v.cx < 0 || v.cy < 0 || v.cx > MACRO_W || v.cy > MACRO_H)) v.z = 0.985;
    const hw = MACRO_W / (2 * v.z), hh = MACRO_H / (2 * v.z);
    if (v.z >= 1) { v.cx = Math.max(hw, Math.min(MACRO_W - hw, v.cx)); v.cy = Math.max(hh, Math.min(MACRO_H - hh, v.cy)); return; }
    // 缩到全图以下：中心可以挪到诸界范围里的任何地方（全图正好在画面里时，先停在原来的中心附近，免得一缩就跑偏）
    const b = O.bounds, x0 = O.mx(b.x0), x1 = O.mx(b.x1), y0 = O.my(b.y0), y1 = O.my(b.y1);
    v.cx = Math.max(Math.min(x0, MACRO_W / 2), Math.min(Math.max(x1, MACRO_W / 2), v.cx)); v.cy = Math.max(Math.min(y0, MACRO_H / 2), Math.min(Math.max(y1, MACRO_H / 2), v.cy));
  };
  /** 以屏幕点 (sx,sy)（CSS 像素，相对画布）为中心缩放 */
  const zoomAt = (f: number, sx = size.w / 2, sy = size.h / 2) => {
    const v = view.current, s = size.w / MACRO_W, k0 = s * v.z;
    const mx = v.cx + (sx - size.w / 2) / k0, my = v.cy + (sy - size.h / 2) / k0;
    const z0 = v.z;
    v.z = Math.max(zMin(), Math.min(WM_ZMAX, v.z * f));
    // 从放大处往外缩，先在「全图」停一下（滚轮一路滚下去也会先停在整张图上），再缩才出图
    if (z0 > 1.0001 && v.z < 1) v.z = 1;
    if (z0 < 0.999 && v.z > 1) v.z = 1;   // 从图外往里放大，同样先在全图停一下
    const k1 = s * v.z;
    v.cx = mx - (sx - size.w / 2) / k1; v.cy = my - (sy - size.h / 2) / k1;
    clampView(); setZl(v.z);
  };
  /** 取景对准虚空里的一处：(vx, vy) 居中，宽 span（虚空单位）的东西占画面七成 */
  const fitVoid = (vx: number, vy: number, span: number) => {
    const O = outer.current!, v = view.current;
    v.cx = O.mx(vx); v.cy = O.my(vy); v.z = Math.min(1, MACRO_W / ((span / (WORLD_SCALE / VOID_SCALE)) / 0.7));
    clampView(); setZl(v.z);
  };
  const centerHero = (z?: number) => {
    const v = view.current; if (z) v.z = z; else if (v.z < 3) v.z = 3;
    v.cx = game.player.x / WORLD_SCALE; v.cy = game.player.y / WORLD_SCALE; clampView(); setZl(v.z);
  };

  useEffect(() => {
    const cv = ref.current!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const g = cv.getContext('2d')!;
    // 迷雾：预先柔化一次（之后每帧只是缩放贴图，不再逐帧模糊）
    const fog0 = makeFogCanvas(game, undefined, 200);
    const fog = document.createElement('canvas'); fog.width = FOG_W * 6; fog.height = FOG_H * 6;
    { const fg = fog.getContext('2d')!; fg.imageSmoothingEnabled = true; try { fg.filter = 'blur(5px)'; } catch { /* */ } fg.drawImage(fog0, 0, 0, fog.width, fog.height); }
    {
      // 迷雾的四边羽化：缩到全图以下时，图外的地方不盖迷雾，硬边会在图边上留一块方框
      const f = Math.round(Math.min(fog.width, fog.height) * 0.035), rect = document.createElement('canvas'); rect.width = fog.width; rect.height = fog.height;
      const rg = rect.getContext('2d')!; rg.fillStyle = '#fff'; rg.fillRect(f, f, fog.width - 2 * f, fog.height - 2 * f);
      const mask = document.createElement('canvas'); mask.width = fog.width; mask.height = fog.height; const mg = mask.getContext('2d')!;
      try { mg.filter = `blur(${f * 0.6}px)`; } catch { /* */ } mg.drawImage(rect, 0, 0);
      const fg = fog.getContext('2d')!; fg.filter = 'none'; fg.globalCompositeOperation = 'destination-in'; fg.drawImage(mask, 0, 0); fg.globalCompositeOperation = 'source-over';
    }
    const tiles = new Map<string, { cv: HTMLCanvasElement; used: number }>(); let frame = 0;
    const tileFor = (tx: number, ty: number, scale: number, T: number, budget: { n: number }) => {
      const key = `${tx},${ty},${scale}`;
      let t = tiles.get(key);
      if (!t) {
        if (budget.n <= 0) return null; budget.n--;
        const c = document.createElement('canvas'); c.width = c.height = T * scale;
        const tg = c.getContext('2d')!; tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        const base = game.terrain.overviewBase ?? game.overview;
        tg.drawImage(base, tx * T - 1, ty * T - 1, T + 2, T + 2, -scale, -scale, (T + 2) * scale, (T + 2) * scale);
        game.terrain.overviewVectors(tg, tx * T, ty * T, T * scale, T * scale, scale);
        t = { cv: c, used: frame }; tiles.set(key, t);
        if (tiles.size > 200) { let old: string | null = null, ou = Infinity; for (const [k2, v] of tiles) if (v.used < ou && v !== t) { ou = v.used; old = k2; } if (old) tiles.delete(old); }
      }
      t.used = frame; return t;
    };
    let raf = 0;
    const s = size.w / MACRO_W; // 宏观单位 → CSS 像素（全图时）
    const draw = (t: number) => {
      frame++;
      const v = view.current, Z = v.z, k = s * Z, W2 = size.w / 2, H2 = size.h / 2;
      const X = (mx: number) => (mx - v.cx) * k + W2, Y = (my: number) => (my - v.cy) * k + H2;
      const on = (x: number, y: number, m = 40) => x > -m && y > -m && x < size.w + m && y < size.h + m;
      const hov = hoverRef.current;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#d9cdb0'; g.fillRect(0, 0, size.w, size.h);
      // 图外：人界的另外两张图、交界、界壁、星域与诸界（缩到全图以下才看得见）
      if (Z < 0.999) outer.current!.draw(g, { X, Y, k, W: size.w, H: size.h, cx: v.cx, cy: v.cy }, t);
      const placeA = Z >= 1 ? 1 : Math.max(0, Math.min(1, (Z - WM_ZPLACE) / (1 - WM_ZPLACE)));   // 地点、标记、大字跟着淡出
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = Z > 2 ? 'medium' : 'high';
      // 只取可见部分的源矩形来画（放大 8 倍时不再让整张底图参与缩放，省下大量填充）
      const mx0v = Math.max(0, v.cx - W2 / k), my0v = Math.max(0, v.cy - H2 / k), mx1v = Math.min(MACRO_W, v.cx + W2 / k), my1v = Math.min(MACRO_H, v.cy + H2 / k);
      const drawVis = (img: CanvasImageSource, iw: number, ih: number) => {
        const fx = iw / MACRO_W, fy = ih / MACRO_H;
        const sx0 = Math.max(0, Math.floor(mx0v * fx) - 1), sy0 = Math.max(0, Math.floor(my0v * fy) - 1);
        const sx1 = Math.min(iw, Math.ceil(mx1v * fx) + 1), sy1 = Math.min(ih, Math.ceil(my1v * fy) + 1);
        if (sx1 <= sx0 || sy1 <= sy0) return;
        g.drawImage(img, sx0, sy0, sx1 - sx0, sy1 - sy0, X(sx0 / fx), Y(sy0 / fy), (sx1 - sx0) / fx * k, (sy1 - sy0) / fy * k);
      };
      const t0 = performance.now();
      // 缩到全图以下：人界的三张图已经在外层那张拼好的俯瞰图里（边缘羽化过），本图的矩形缩略和迷雾跟着淡掉，免得留下一块方框
      const inHome = (MAP_IDS as string[]).includes(ACTIVE_MAP), selfA = Z >= 1 || !inHome ? 1 : Math.max(0, Math.min(1, (Z - 0.99) / 0.01));
      g.globalAlpha = selfA;
      if (selfA > 0) drawVis(game.overview, game.overview.width, game.overview.height);
      g.globalAlpha = 1;
      // 放大后：局部高清底图（每帧最多新画 4 块，其余先用缩略图顶着）
      if (k * dpr > 4.5 && game.terrain?.overviewVectors) {
        const scale = k * dpr > 4.6 ? 8 : k * dpr > 3.2 ? 6 : 4, T = scale >= 6 ? 24 : 32, budget = { n: 16 };
        const mx0 = v.cx - W2 / k, mx1 = v.cx + W2 / k, my0 = v.cy - H2 / k, my1 = v.cy + H2 / k;
        for (let ty = Math.floor(my0 / T); ty <= Math.floor(my1 / T); ty++) for (let tx = Math.floor(mx0 / T); tx <= Math.floor(mx1 / T); tx++) {
          if (tx < 0 || ty < 0 || tx * T >= game.terrain.W || ty * T >= game.terrain.H) continue;
          const tl = tileFor(tx, ty, scale, T, budget); if (!tl) continue;
          g.drawImage(tl.cv, X(tx * T) - 0.5, Y(ty * T) - 0.5, T * k + 1, T * k + 1);
        }
      }
      // 迷雾只在全图及以上画：缩出去以后整片人界都看得到地形，只盖本图会留下一块方框（地点印章照样按去没去过显示）
      g.globalAlpha = Z >= 1 ? 1 : Math.max(0, Math.min(1, (Z - 0.99) / 0.01));
      if (g.globalAlpha > 0) drawVis(fog, fog.width, fog.height);
      g.globalAlpha = 1;
      // 大区域名（放大后变淡，免得挡住细节）
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (Z < 0.999) {
        // 缩到全图以下：这张图的大名字写在图正中（地点印章已经淡了）；整张图小到一指宽时就不写了，免得压住界名
        const fsz = Math.max(16, Math.min(34, MACRO_W * k * 0.06)), nameA = (1 - placeA) * Math.max(0, Math.min(1, (MACRO_W * k - 90) / 80));
        g.font = `${fsz}px 'Ma Shan Zheng', serif`; g.lineWidth = 4; g.strokeStyle = `rgba(30,26,20,${0.5 * nameA})`;
        g.strokeText(MAP_NAME[ACTIVE_MAP] ?? '', X(MACRO_W / 2), Y(MACRO_H / 2)); g.fillStyle = `rgba(255,232,180,${0.95 * nameA})`; g.fillText(MAP_NAME[ACTIVE_MAP] ?? '', X(MACRO_W / 2), Y(MACRO_H / 2));
      }
      if (placeA > 0) for (const L of BIG_LABELS) {
        const fs = Math.max(13, L.size * 9 * s * 1.6) * Math.min(1.8, Math.sqrt(Z));
        g.font = `${fs}px 'Ma Shan Zheng', serif`;
        g.fillStyle = `rgba(40,34,26,${0.32 * placeA / Math.max(1, Z * 0.55)})`;
        g.fillText(L.name.split('').join(' '), X(L.at[0]), Y(L.at[1]));
      }
      // 陆路出口：图边的箭头
      if (Z < 1.5 && Z > 0.97) for (const ex of MAP_EXITS[ACTIVE_MAP]) {
        const north = ex.edge === 'n', y = north ? 22 : size.h - 22;
        g.font = `${Math.max(13, 15 * s * 1.6)}px 'Ma Shan Zheng', serif`;
        g.fillStyle = 'rgba(120,40,30,0.75)';
        g.fillText(`${north ? '↑' : '↓'} ${ex.to === 'dajin' ? '天穹草原 · 中州' : '朔漠草原 · 南荒'} ${north ? '↑' : '↓'}`, size.w / 2, y);
      }
      // 地点（先画已探索与重要地点，名字做简单避让；放大后全部显示名字）
      const placed: [number, number, number, number][] = [];
      const order = [...LOCATIONS].sort((a, b) => (b.id === hov ? 1 : 0) - (a.id === hov ? 1 : 0) || (b.major ? 1 : 0) - (a.major ? 1 : 0));
      const rz = Math.min(1.7, 1 + (Z - 1) * 0.14);
      if (placeA > 0) for (const l of order) {
        const wx = l.x * WORLD_SCALE, wy = l.y * WORLD_SCALE;
        const known = game.isExplored(wx, wy);
        if (!known && !l.major) continue;
        const x = X(l.x), y = Y(l.y);
        if (!on(x, y)) continue;
        const r = Math.max(4, 7 * s * 1.4) * (l.major ? 1.15 : 0.85) * rz;
        g.globalAlpha = (known ? 1 : 0.5) * placeA;
        g.fillStyle = SEAL_COLOR[l.type];
        g.fillRect(x - r, y - r, r * 2, r * 2);
        g.strokeStyle = 'rgba(250,240,220,0.9)'; g.lineWidth = 1; g.strokeRect(x - r + 1.5, y - r + 1.5, r * 2 - 3, r * 2 - 3);
        g.fillStyle = '#f7eedb'; g.font = `${r * 1.45}px 'Ma Shan Zheng', serif`;
        g.fillText(l.seal ?? SEAL[l.type], x, y + r * 0.08);
        if (l.major || k > 0.85 || hov === l.id) {
          const fs = Math.max(11, 11 * s * 1.2) * Math.min(1.45, 1 + (Z - 1) * 0.1);
          g.font = `${fs}px 'Noto Serif SC', serif`;
          const label = known ? l.name : l.name + '（传闻）';
          const tw = g.measureText(label).width;
          const box: [number, number, number, number] = [x - tw / 2 - 3, y + r + 2, tw + 6, fs + 4];
          const hit = placed.some(([bx, by, bw, bh]) => box[0] < bx + bw && box[0] + box[2] > bx && box[1] < by + bh && box[1] + box[3] > by);
          if (!hit || hov === l.id) {
            placed.push(box);
            g.fillStyle = hov === l.id ? 'rgba(255,248,230,0.98)' : 'rgba(246,239,222,0.85)'; g.fillRect(box[0], box[1], box[2], box[3]);
            g.fillStyle = '#2b2620'; g.fillText(label, x, y + r + 4 + fs / 2);
          }
        }
        g.globalAlpha = 1;
      }
      // 第十八步：机缘 / 洞府 / 悬赏 / 异宝
      // v0.52.9：标记按「任务 > 指路 > 其它」排序，名字逐行避让——宗门四条任务叠在一处时不再糊成一团
      const markList = (game.mapMarks?.() ?? []).slice().sort((a, b) => {
        const w = (m: { glyph: string }) => (m.glyph === '指' ? 3 : m.glyph === '任' ? 2 : 0);
        return w(a) - w(b);
      });
      const placedBoxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
      g.globalAlpha = placeA;
      if (placeA > 0) for (const m of markList) {
        const x = X(m.x / WORLD_SCALE), y = Y(m.y / WORLD_SCALE), r = Math.max(6, 8 * s) * rz;
        if (!on(x, y, 60 + (m.ring ? (m.ring / WORLD_SCALE) * k : 0))) continue;
        if (m.ring) { g.strokeStyle = m.color; g.globalAlpha = 0.6; g.setLineDash([3, 3]); g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, (m.ring / WORLD_SCALE) * k, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
        g.fillStyle = 'rgba(30,24,18,0.8)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = m.color; g.font = `${r * 1.4}px 'Ma Shan Zheng', serif`; g.fillText(m.glyph, x, y + r * 0.08);
        // v0.52.5：标记名字更早显示（原先要放很大才出现，玩家找不到东西）；任务 / 指路标记任何缩放都带名字
        if (k > 0.45 || Z > 1.4 || m.glyph === '任' || m.glyph === '指') {
          const fs = Math.max(10, 10 * s * rz);
          g.font = `${fs}px 'Noto Serif SC', serif`;
          const tw = g.measureText(m.name).width;
          let ty = y - r - 7;
          // 名字之间至少隔一行，撞上了就往上挪（最多挪 6 行，挪不下就不画）
          for (let guard = 0; guard < 6; guard++) {
            const box = { x0: x - tw / 2 - 2, y0: ty - fs, x1: x + tw / 2 + 2, y1: ty + 2 };
            const hit = placedBoxes.some((pb) => !(box.x1 < pb.x0 || box.x0 > pb.x1 || box.y1 < pb.y0 || box.y0 > pb.y1));
            if (!hit) { placedBoxes.push(box); break; }
            ty -= fs + 2; if (guard === 5) { ty = NaN; }
          }
          if (!isNaN(ty)) {
            g.fillStyle = 'rgba(246,239,222,0.82)'; g.fillRect(x - tw / 2 - 2, ty - fs, tw + 4, fs + 3);
            g.fillStyle = m.glyph === '任' ? 'rgba(110,70,0,0.95)' : m.glyph === '指' ? 'rgba(20,80,100,0.95)' : 'rgba(40,30,20,0.85)';
            g.fillText(m.name, x, ty);
          }
        }
      }
      // v0.52.5：放大地图时，迷雾已解开区域内的怪物显示名字与境界（宗门任务找怪不再靠瞎转）
      if (Z > 1.6) {
        const tasks = new Set((game.ws.sect?.tasks ?? []).filter((tk) => tk.kind === 'kill' && tk.until >= game.day).map((tk) => tk.target));
        g.font = `${Math.max(9, 9 * s * rz)}px 'Noto Serif SC', serif`;
        for (const en of game.combat.enemies) {
          if (en.dead || !game.isExplored(en.x, en.y)) continue;
          const x = X(en.x / WORLD_SCALE), y = Y(en.y / WORLD_SCALE); if (!on(x, y)) continue;
          const isTask = tasks.has(en.def.id);
          g.fillStyle = isTask ? '#ffd040' : en.boss ? '#ff4a30' : en.def.kind === 'human' ? '#c06060' : '#a04a30';
          g.beginPath(); g.arc(x, y, isTask ? 4.5 : 3, 0, Math.PI * 2); g.fill();
          if (isTask) { g.strokeStyle = '#ffd040'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.stroke(); }
          if (Z > 2.4 || isTask) { g.fillStyle = isTask ? 'rgba(90,60,0,0.95)' : 'rgba(60,30,20,0.85)'; g.fillText(`${isTask ? '任·' : ''}${en.name || en.def.name}·${realmName(en.realm, en.stage)}`, x, y - 9); }
        }
      }
      g.globalAlpha = 1;
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
      const sr = (game.senseRadius / WORLD_SCALE) * k;
      g.strokeStyle = 'rgba(63,160,140,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, Math.max(sr, 5), 0, Math.PI * 2); g.stroke();
      if (Z > 2.5) { g.fillStyle = 'rgba(63,160,140,0.08)'; g.fill(); }
      const pulse = (t / 1000) % 1.6 / 1.6;
      g.strokeStyle = `rgba(168,53,42,${1 - pulse})`; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 6 + pulse * 18, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#a8352a'; g.beginPath(); g.arc(px, py, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      (window as any).__wmMs = performance.now() - t0;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    // 滚轮缩放（以指针为中心）——必须非被动监听才能阻止页面滚动
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation();
      const r = cv.getBoundingClientRect();
      const f = Math.pow(view.current.z < 1 ? 1.0045 : 1.0018, -Math.max(-240, Math.min(240, e.deltaY * (e.deltaMode === 1 ? 30 : 1))));
      zoomAt(f, ((e.clientX - r.left) / r.width) * size.w, ((e.clientY - r.top) / r.height) * size.h);
    };
    cv.addEventListener('wheel', wheel, { passive: false });
    const key = (e: KeyboardEvent) => {
      if (e.key === '=' || e.key === '+') { zoomAt(view.current.z < 1 ? 2.2 : 1.4); e.preventDefault(); }
      else if (e.key === '-' || e.key === '_') { zoomAt(1 / (view.current.z < 1 ? 2.2 : 1.4)); e.preventDefault(); }
      else if (e.key === '0') { view.current.z = 1; view.current.cx = MACRO_W / 2; view.current.cy = MACRO_H / 2; clampView(); setZl(1); }
    };
    window.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(raf); cv.removeEventListener('wheel', wheel); window.removeEventListener('keydown', key); };
  }, [size]);

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
      if (!game.isExplored(l.x * WORLD_SCALE, l.y * WORLD_SCALE) && !l.major) continue;
      const d = Math.hypot(l.x - mx, l.y - my);
      if (d < bd) { bd = d; best = l.id; }
    }
    return best;
  };
  const onClick = (e: React.PointerEvent) => {
    const { mx, my } = toWorld(e);
    // 缩到图外：点一界就把取景挪过去、放大到看得清它；图外的空处不设目的地
    if (view.current.z < 1) {
      const inMap = mx >= 0 && my >= 0 && mx <= MACRO_W && my <= MACRO_H;
      if (!inMap || view.current.z < WM_ZPLACE) {
        const O = outer.current!, r = O.pick(O.vx(mx), O.vy(my), (size.w / MACRO_W) * view.current.z / (WORLD_SCALE / VOID_SCALE));
        if (r) { audio.sfx('click'); fitVoid(r.x, r.y, r.rx * 2.4); }
        return;
      }
    }
    const id = pickLoc(mx, my);
    const loc = LOCATIONS.find((l) => l.id === id);
    const wx = loc ? loc.x * WORLD_SCALE + 200 : mx * WORLD_SCALE, wy = loc ? loc.y * WORLD_SCALE + 360 : my * WORLD_SCALE;
    audio.sfx('click');
    if (game.debugTeleport) {
      game.teleport(wx, wy);
      game.toast(`（体验）瞬移至${loc ? loc.name : '此地'}。`);
    } else {
      // 只设目的地：手动接管即作废；想长期记住某地请用「指路」（大事记 / 老采药人）
      game.setDestination(wx, wy, loc ? loc.name : '目的地');
      game.toast(loc ? `已设定目的地：${loc.name}（${loc.label ?? LOC_TYPE_NAME[loc.type]}）` : '已设定目的地。');
    }
    onClose();
  };
  const onDown = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    pts.current.set(e.pointerId, { x: sx, y: sy });
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* */ }
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.current.z };
      if (drag.current) drag.current.moved = true;
    } else drag.current = { x: sx, y: sy, cx: view.current.cx, cy: view.current.cy, moved: false, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const { sx, sy } = local(e);
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: sx, y: sy });
    if (pinch.current && pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = pinch.current.z * d / Math.max(10, pinch.current.d);
      zoomAt(target / view.current.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
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
    const z = view.current.z, id = z >= WM_ZPLACE ? pickLoc(mx, my) : ''; if (id !== hover) setHover(id);
    if (z < 1 && !id) { const O = outer.current!, r = O.pick(O.vx(mx), O.vy(my), (size.w / MACRO_W) * z / (WORLD_SCALE / VOID_SCALE)); if (r !== hoverRealm) setHoverRealm(r); }
    else if (hoverRealm) setHoverRealm(null);
  };
  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    const D = drag.current;
    if (D && D.id === e.pointerId) { drag.current = null; if (!D.moved) onClick(e); }
  };
  const hovered = LOCATIONS.find((l) => l.id === hover);
  const zb = (f: number) => (e: React.MouseEvent) => { e.stopPropagation(); audio.sfx('click'); zoomAt(view.current.z < 1 || (f < 1 && view.current.z <= 1.001) ? (f > 1 ? 2.2 : 1 / 2.2) : f); };
  const ppv = (size.w / MACRO_W) * zl / (WORLD_SCALE / VOID_SCALE);
  const short = typeof window !== 'undefined' && window.innerHeight <= 520;

  return (
    // 收官 H2：外壳换成界面底座的乌木漆底（匾额「人界舆图」、四角角花、开合只动 transform / opacity、Esc 只关最上面一层）；
    // 旧类名 .modal-mask / .scroll-panel / .panel-head / .panel-title / .close-btn 照挂
    <LacquerModal title="人界舆图" variant="lacquer" compact={short} onClose={onClose} maskClass="modal-mask wm-mask" className="scroll-panel wm-panel" closeClass="close-btn">
        <div className="panel-head wm-head">
          <div className="panel-title wm-title">人界舆图 · {MAP_NAME[ACTIVE_MAP]}</div>
          <div className="panel-sub wm-sub">
            {hovered ? <><b style={{ color: 'var(--ink)' }}>{hovered.name}</b>　{game.isExplored(hovered.x * WORLD_SCALE, hovered.y * WORLD_SCALE) ? hovered.desc : '只闻其名，尚未亲至。'}</>
              : hoverRealm ? <>{outer.current!.describe(hoverRealm)}　<small>（点击看近）</small></>
              : `已探索 ${(game.ui.explored * 100).toFixed(1)}%　·　${IS_TOUCH ? '双指 / ＋－ 缩放' : '滚轮 / ＋－ 缩放'}（缩到全图以下能看到图外与诸界），拖动平移，点击设定目的地${game.debugTeleport ? '（体验：瞬移）' : ''}`}
          </div>
        </div>
        <div className="worldmap-wrap" style={{ width: size.w, height: size.h }}>
          <canvas ref={ref} className={'worldmap-canvas' + (zl > 1 ? ' zoomed' : '')} style={{ width: size.w, height: size.h }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => setHover('')} />
          <div className="wm-zoom">
            <button onClick={zb(1.5)} disabled={zl >= WM_ZMAX - 0.01} title="放大（滚轮 / +）">＋</button>
            <div className="wm-zl">{zl < 0.999 ? outer.current!.scaleName(ppv) : zl < 1.05 ? '全图' : `${zl.toFixed(1)}×`}</div>
            <button onClick={zb(1 / 1.5)} disabled={zl <= zMin() * 1.001} title="缩小（滚轮 / -）：缩到全图以下能看到图外与诸界">－</button>
            <button className="wm-me" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); centerHero(); }} title="以苏寒为中心">我</button>
            <button className="wm-me" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); view.current.z = 1; view.current.cx = MACRO_W / 2; view.current.cy = MACRO_H / 2; clampView(); setZl(1); }} title="看全图（0）">全</button>
            <button className="wm-me" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); const r = realmOfMap(ACTIVE_MAP); fitVoid(r.x, r.y, r.rx * 2.3); }} title="看这一界：图外的地方和界壁">界</button>
            <button className="wm-me" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); view.current.z = zMin(); const O = outer.current!, b = O.bounds; view.current.cx = O.mx((b.x0 + b.x1) / 2); view.current.cy = O.my((b.y0 + b.y1) / 2); clampView(); setZl(view.current.z); }} title="看诸界：三千界全貌">诸</button>
          </div>
        </div>
        <div className="map-tabs">{MAP_IDS.map((m) => <span key={m} className={m === ACTIVE_MAP ? 'on' : ''} title={MAP_ROUTE[m]}><b>{MAP_NAME[m]}</b>{m === ACTIVE_MAP ? '（你在此）' : m === 'luanxing' ? (ACTIVE_MAP === 'tiannan' ? '　经上古传送阵' : '　须先回南荒') : ACTIVE_MAP === 'luanxing' ? '　须先回南荒' : '　横穿天穹草原'}</span>)}</div>
        <div className="map-legend">
          {Object.keys(SEAL).map((k) => <span key={k}><i style={{ background: SEAL_COLOR[k] }}>{SEAL[k]}</i>{LOC_TYPE_NAME[k as keyof typeof LOC_TYPE_NAME]}</span>)}
          <span><i style={{ background: '#a8352a', borderRadius: '50%' }} />苏寒</span>
          <span><i style={{ border: '1.5px solid #3fa08c', borderRadius: '50%', background: 'transparent' }} />神识范围</span>
        </div>
    </LacquerModal>
  );
}
