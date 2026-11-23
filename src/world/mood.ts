// v0.48「气韵」：不加一个新物件，专加"空气层"。
//  · 远山长卷三层（平远）：屏幕上缘横向视差平铺，按时辰色罩与大气透视染色；雨里远山化进雨里、雪天描一道雪线
//  · 天空意象：晨雾带 / 暮霞 / 昼间流云；夜里月轮（按月相：蛾眉 / 满月）与星汉
//  · 雨幕：镜头前第二层极淡斜雨丝
//  · 雁阵：每隔一阵横越镜头，配一声雁鸣；卯时晨钟、酉时暮鼓
//  · 留白雾带：镜头静止 >10 秒且不在战斗，屏幕边缘烟岚缓缓加浓——画面自己"收"成一幅立轴
//  · 后处理：宣纸纤维 + 淡墨洇染四角
// 贴图来自 docs 任务书 A–E 组（AI 初稿经 tools/mood-process.mjs 抠真 alpha、去棋盘格、做无缝）。
import type { Game } from './game';
import { phaseWeights } from './weather';
import { audio } from './audio';
import { prof } from '../core/prof';
import { grainSetting, setGrainOn } from '../core/grain';   // r15-touchctl：画面颗粒开关
import skyCloud from '../assets/mood/sky_cloud_band.webp?inline';
import skyDawn from '../assets/mood/sky_dawn_mist.webp?inline';
import skyDusk from '../assets/mood/sky_dusk_glow.webp?inline';
import skyStars from '../assets/mood/sky_starriver.webp?inline';
import moonFull from '../assets/mood/moon_full.webp?inline';
import moonCres from '../assets/mood/moon_crescent.webp?inline';
import rainVeil from '../assets/mood/rain_veil.webp?inline';
import mistBand from '../assets/mood/mist_band_1.webp?inline';
import mistPuff1 from '../assets/mood/mist_puff_1.webp?inline';
import mistPuff2 from '../assets/mood/mist_puff_2.webp?inline';
import geeseImg from '../assets/mood/wild_geese.webp?inline';
import sailImg from '../assets/mood/lone_sail.webp?inline';
import fishLight from '../assets/mood/fishing_light.webp?inline';
import smokeImg from '../assets/mood/cooking_smoke.webp?inline';
import reedImg from '../assets/mood/reed_marsh.webp?inline';
import lotusImg from '../assets/mood/lotus_withered.webp?inline';
import plumImg from '../assets/mood/plum_branch.webp?inline';
import paperImg from '../assets/mood/paper_grain.webp?inline';
import vigImg from '../assets/mood/ink_vignette.webp?inline';

const SRC = {
  sky_cloud_band: skyCloud, sky_dawn_mist: skyDawn, sky_dusk_glow: skyDusk, sky_starriver: skyStars,
  moon_full: moonFull, moon_crescent: moonCres, rain_veil: rainVeil,
  mist_band: mistBand, mist_puff_1: mistPuff1, mist_puff_2: mistPuff2,
  wild_geese: geeseImg, lone_sail: sailImg, fishing_light: fishLight, cooking_smoke: smokeImg,
  reed_marsh: reedImg, lotus_withered: lotusImg, plum_branch: plumImg,
  paper_grain: paperImg, ink_vignette: vigImg,
};
export type MoodImg = keyof typeof SRC;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type RGB = [number, number, number];
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------------------------------------------------------------- 胶片颗粒总开关
// r15-touchctl：开关挪到 core/grain.ts（设置面板与 GL 后期共用）；这里保留旧导出，纸纹层（drawPost）跟着走
export function grainEnabled(): boolean { return grainSetting.on; }
export function setGrain(on: boolean) { setGrainOn(on); }
// ---------------------------------------------------------------- 氛围层总开关
// 月亮/星星/远山/云带/水汽等视差层；关闭后画面更干净（无 WebGL 时这些层本来就不画）
const G = globalThis as any;
export function atmoEnabled(): boolean {
  if (G.__atmo === undefined) { try { G.__atmo = localStorage.getItem('taixu.atmo') !== '0'; } catch { G.__atmo = true; } }
  return G.__atmo !== false;
}
export function setAtmo(on: boolean) {
  G.__atmo = !!on;
  try {
    if (on) localStorage.removeItem('taixu.atmo');
    else localStorage.setItem('taixu.atmo', '0');
  } catch { /* */ }
}

// 天色锚点（宣纸上的淡彩，不是摄影天空）
const SKY_NOON: RGB = [226, 230, 222], SKY_DAWN: RGB = [214, 228, 220], SKY_DUSK: RGB = [222, 184, 142], SKY_NIGHT: RGB = [40, 52, 70];
const RAIN_SKY: RGB = [168, 178, 182], SNOW_SKY: RGB = [232, 236, 240], FOG_SKY: RGB = [230, 230, 222];

interface Geese { x: number; y: number; w: number; v: number; dir: number; t: number; honk2: boolean }

export class MoodLayer {
  private imgs = {} as Record<MoodImg, HTMLImageElement>;
  // v0.52.8：远景长卷（屏幕上缘那三层远山）已整块删除。
  // 它是纯装饰的「意境」层，每帧要在 CPU 上做三次全屏合成（染色 + 雪线 + 贴回），
  // 对游戏内容零贡献，收益却是所有开销里最贵的一块之一，玩家也明确说不要了。
  enabled = true;
  /** 留白雾带：静止时长 / 当前浓度 */
  private idle = 0; private idleK = 0;
  private lastCam = { x: 0, y: 0 };
  private geese: Geese | null = null; private geeseT = 70;
  private lastPh = -1;
  /** 供外部读：本帧时辰权重与天色 */
  w = { dawn: 0, noon: 1, dusk: 0, night: 0 };
  sky: RGB = SKY_NOON;

  constructor() {
    if (typeof Image === 'undefined') return;
    try { this.enabled = localStorage.getItem('fr_mood') !== '0'; } catch { /* 无痕模式 */ }
    for (const k of Object.keys(SRC) as MoodImg[]) { const im = new Image(); im.decoding = 'async'; im.src = SRC[k]; this.imgs[k] = im; }
  }
  img(k: MoodImg): HTMLImageElement | null { const im = this.imgs[k]; return im && im.complete && im.naturalWidth > 0 ? im : null; }
  // ---------------------------------------------------------------- 渲染用位图（预缩放到最小够用尺寸）
  // 性能：远景 / 天色贴图原图 1696~1884 宽，而画的时候只占屏幕高度的一小截（几百像素高）。
  // 每帧把 1884×512 的图现缩一次，软件栅格化要几十毫秒，GPU 后台线程也要占带宽。
  // 改成：第一次用到时缩到「按当前屏幕高度算出的所需像素」，之后每帧贴的是已缩好的小图。
  // 只在分配 / 屏幕尺寸变化 / 设备像素比变化时重建，平时零成本。
  private rend = {} as Partial<Record<MoodImg, { cv: HTMLCanvasElement; h: number; hint: number; at: number }>>;
  /** 该图在当前屏幕上需要多高（设备像素）。hint 为 CSS 像素高度，dpr 为设备像素比 */
  private needH(k: MoodImg, hint: number) {
    const im = this.img(k); if (!im) return 0;
    const dpr = (typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1);
    return Math.max(64, Math.min(im.naturalHeight, Math.ceil(hint * dpr)));
  }
  /** 取一张已按需缩小（且绝不放大）的位图。
   *  用光栅线程缩小大图很贵（1884px 的远景缩一次就是几十毫秒），所以：
   *  · 只在尺寸明显不够时才重建，并留 1.6 倍余量，镜头来回远近不会反复重建；
   *  · 但余量再大也不超过「原图尺寸」，且同一张图 1.5 秒内最多建一次（重建摊到多帧，不堵单帧）。 */
  private scaled(k: MoodImg, hintCss: number): HTMLCanvasElement | HTMLImageElement | null {
    const im = this.img(k); if (!im) return null;
    const h = this.needH(k, hintCss);
    const now = performance.now();
    const slot = this.rend[k];
    if (slot && slot.h >= h * 0.98) return slot.cv;
    if (slot && (now - slot.at < 1500)) return slot.cv;
    const want = Math.min(im.naturalHeight, Math.ceil(h * 1.6));
    const w = Math.max(1, Math.round(im.naturalWidth * want / im.naturalHeight));
    const cv = slot?.cv ?? document.createElement('canvas');
    if (cv.width !== w || cv.height !== want) { cv.width = w; cv.height = want; }
    const g = cv.getContext('2d')!;
    g.clearRect(0, 0, w, want);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
    g.drawImage(im, 0, 0, w, want);
    this.rend[k] = { cv, h: want, hint: h, at: now };
    return cv;
  }
  /** 预缩：资源就绪后按当前屏幕尺寸一次性缩好（在开场黑屏期间做完，不落在第一帧上） */
  warm(W: number, H: number) {
    const bandH = clamp(H * 0.3, 150, 380);
    (['sky_dawn_mist', 'sky_dusk_glow', 'sky_cloud_band', 'mist_band', 'sky_starriver', 'mist_puff_1', 'mist_puff_2'] as MoodImg[])
      .forEach((k) => { const im = this.img(k); if (im) this.scaled(k, k.startsWith('far') || k.startsWith('sky') ? bandH : Math.max(H * 0.24, 200)); });
  }
  /** 贴一张「内容 CSS 高 = cssH」的图，按预缩位图平铺 */
  private tiledS(g: CanvasRenderingContext2D, k: MoodImg, off: number, y: number, cssH: number, W: number) {
    const im = this.img(k); if (!im) return;
    const bmp = this.scaled(k, cssH) ?? im;
    const nw = (bmp instanceof HTMLCanvasElement ? bmp.width : im.naturalWidth);
    const nh = (bmp instanceof HTMLCanvasElement ? bmp.height : im.naturalHeight);
    const w = nw * cssH / nh;
    let x = ((off % w) + w) % w - w;
    for (; x < W; x += w) g.drawImage(bmp as CanvasImageSource, x, y, w + 1, cssH);
  }

  // ---------------------------------------------------------------- 逻辑
  update(dt: number, game: Game, camX: number, camY: number) {
    const ph = game.dayPhase;
    this.w = phaseWeights(ph, game.night);
    const wt = game.weather, k = wt.k;
    let sky = mix3(mix3(mix3(SKY_NOON, SKY_DAWN, this.w.dawn), SKY_DUSK, this.w.dusk / Math.max(0.001, this.w.dusk + this.w.noon + this.w.dawn) * (1 - this.w.night) ), SKY_NIGHT, this.w.night);
    if (wt.kind === 'rain' || wt.kind === 'storm') sky = mix3(sky, mix3(RAIN_SKY, SKY_NIGHT, this.w.night * 0.8), k * 0.75);
    else if (wt.kind === 'snow') sky = mix3(sky, mix3(SNOW_SKY, [70, 84, 104], this.w.night * 0.8), k * 0.6);
    else if (wt.kind === 'fog') sky = mix3(sky, mix3(FOG_SKY, [50, 54, 58], this.w.night * 0.8), k * 0.7);
    this.sky = sky;
    // 留白：镜头不动、不在战斗、没有对话面板
    const moved = Math.hypot(camX - this.lastCam.x, camY - this.lastCam.y);
    this.lastCam.x = camX; this.lastCam.y = camY;
    const calm = moved < 0.6 && !game.combat.inCombat && !game.player.flying;
    this.idle = calm ? this.idle + dt : 0;
    const want = this.idle > 10 ? 1 : 0;
    this.idleK += (want - this.idleK) * Math.min(1, dt * (want ? 0.35 : 2.5));
    // 晨钟暮鼓（时间跳跃时不响）
    if (this.lastPh >= 0 && ph - this.lastPh > 0 && ph - this.lastPh < 0.05) {
      if (this.lastPh < 0.25 && ph >= 0.25) audio.amb?.bell();
      if (this.lastPh < 0.745 && ph >= 0.745) audio.amb?.drum();
    }
    this.lastPh = ph;
    // 雁阵：白天、不下雨；秋天来得勤
    this.geeseT -= dt;
    if (!this.geese && this.geeseT <= 0) {
      const wet = wt.kind === 'rain' || wt.kind === 'storm' || wt.kind === 'sand';
      this.geeseT = (game.season === 2 ? 90 : 200) + Math.random() * 160;
      if (!wet && game.night < 0.35 && game.cam.zoom > 0.4) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        this.geese = { x: dir > 0 ? -0.3 : 1.3, y: 0.1 + Math.random() * 0.14, w: 0.22 + Math.random() * 0.1, v: 0.024 + Math.random() * 0.01, dir, t: 0, honk2: false };
        audio.amb?.geese(dir > 0 ? -0.6 : 0.6);
      }
    }
    if (this.geese) {
      const G = this.geese; G.t += dt; G.x += G.v * G.dir * dt;
      if (!G.honk2 && G.t > 14) { G.honk2 = true; audio.amb?.geese((G.x - 0.5) * 1.4); }
      if (G.x < -0.5 || G.x > 1.5) this.geese = null;
    }
  }

  /** 镜头可见度：缩到大地图时淡出（不挡地图） */
  private zoomK(z: number) { return clamp((z - 0.3) / 0.22, 0, 1); }

  private tiled(g: CanvasRenderingContext2D, im: HTMLImageElement, off: number, y: number, h: number, W: number) {
    const w = im.naturalWidth * h / im.naturalHeight;
    let x = ((off % w) + w) % w - w;
    for (; x < W; x += w) g.drawImage(im, x, y, w + 1, h);
  }

  // ---------------------------------------------------------------- 画：世界层之上、屏幕空间（会经过调色）
  drawBack(g: CanvasRenderingContext2D, W: number, H: number, game: Game, camX: number, z: number, GL: boolean, t: number) {
    if (!this.enabled) return;
    let _m = prof.t();
    // 调用方已用 setTransform(dpr,0,0,dpr,0,0) 把坐标换算到设备像素
    const zk = this.zoomK(z);
    // 性能：远景长卷只在世界层（世界画布）上画一次。GL 合成时世界层不再上传，
    // 之前这一整块（天色渐变 + 远山三层贴回 + 山根云 + 雾带）全都白画——整个「空气层」其实只供天空 / 雨幕 / 留白用。
    if (GL) { this.drawBackOverlay(g, W, H, game, t); return; }
    const wt = game.weather, k = wt.k, w = this.w, sky = this.sky;
    const rainK = wt.kind === 'rain' || wt.kind === 'storm' ? k : 0, snowK = wt.kind === 'snow' ? k : 0, fogK = wt.kind === 'fog' ? k : 0, sandK = wt.kind === 'sand' ? k : 0;
    const bandH = clamp(H * 0.3, 150, 380);
    const sx = camX * z;
    g.save();
    if (zk > 0.01 && atmoEnabled()) {
      // 1. 天色：上缘一抹淡彩，向下化开
      const sg = g.createLinearGradient(0, 0, 0, bandH * 0.75);
      sg.addColorStop(0, css(sky, 0.62 * zk)); sg.addColorStop(0.55, css(sky, 0.28 * zk)); sg.addColorStop(1, css(sky, 0));
      g.fillStyle = sg; g.fillRect(0, 0, W, bandH * 0.75);
      prof.add('M1┊天色渐变', _m); _m = prof.t();
      // 2. 天空意象：晨雾带 / 暮霞 / 昼间流云（在远山之后）
      const cloud = this.img('sky_cloud_band'), dawn = this.img('sky_dawn_mist'), dusk = this.img('sky_dusk_glow');
      const clearish = 1 - Math.max(rainK, fogK, sandK) * 0.8;
      if (dawn && w.dawn > 0.02) { g.globalAlpha = w.dawn * 0.85 * zk * clearish; this.tiledS(g, 'sky_dawn_mist', -sx * 0.02 - t * 3, bandH * 0.02, bandH * 0.42, W); }
      if (dusk && w.dusk > 0.02) { g.globalAlpha = w.dusk * 0.8 * zk * clearish; this.tiledS(g, 'sky_dusk_glow', -sx * 0.02 - t * 3, bandH * 0.06, bandH * 0.36, W); }
      if (cloud && w.noon + w.dawn > 0.05) { g.globalAlpha = (w.noon + w.dawn * 0.5) * 0.75 * zk * (1 - sandK); this.tiledS(g, 'sky_cloud_band', -sx * 0.035 - t * 6, -bandH * 0.02, bandH * 0.34, W); }
      g.globalAlpha = 1;
      prof.add('M2┊天色贴图', _m); _m = prof.t();
      // 4. 山脚的云：远山下缘化进一层烟岚（云断山根），再往下才是人间
      const hg = g.createLinearGradient(0, bandH * 0.45, 0, bandH * 1.15);
      hg.addColorStop(0, css(sky, 0)); hg.addColorStop(0.45, css(sky, 0.32 * zk)); hg.addColorStop(1, css(sky, 0));
      g.fillStyle = hg; g.fillRect(0, bandH * 0.45, W, bandH * 0.7);
      const band = this.img('mist_band');
      if (band && atmoEnabled()) { g.globalAlpha = 0.55 * zk * (1 - w.night * 0.5); const bw = W * 0.75, bh = bandH * 0.28, bmp = this.scaled('mist_band', bh) ?? band; for (let i = 0; i < 2; i++) { const x = ((-sx * (0.16 + i * 0.05) + t * (5 + i * 3) + i * W * 0.6) % (W + bw) + (W + bw)) % (W + bw) - bw; g.drawImage(bmp as CanvasImageSource, x, bandH * (0.58 + i * 0.12), bw, bh); } }
      // 5. 雁阵
      const geese = this.img('wild_geese');
      if (this.geese && geese) {
        const G = this.geese, gw = clamp(W * G.w, 200, 460), gh = gw * geese.naturalHeight / geese.naturalWidth;
        const x = G.x * W, y = G.y * H + Math.sin(G.t * 0.6) * 6;
        g.globalAlpha = 0.72 * zk * (1 - w.night);
        if (G.dir < 0) { g.translate(x, y); g.scale(-1, 1); g.drawImage(geese, -gw / 2, -gh / 2, gw, gh); }
        else g.drawImage(geese, x - gw / 2, y - gh / 2, gw, gh);
      }
    }
    g.restore();
    prof.add('M┊天色+远山', _m); _m = prof.t();
    g.save();
    // 6. 雨幕：镜头前第二层极淡斜雨丝
    if (rainK > 0.05) this.drawRainVeil(g, W, H, rainK, t);
    g.restore();
    prof.add('M┊雨幕', _m); _m = prof.t();
    // 7. 留白雾带：静止看风景时边缘烟岚加浓（雾天常驻一半）
    const ek = atmoEnabled() ? Math.max(this.idleK, fogK * 0.5) * zk : 0;
    if (ek > 0.02) {
      const band = (this.scaled('mist_band', Math.max(H * 0.24, 200)) ?? this.img('mist_band')) as CanvasImageSource | null, p1 = (this.scaled('mist_puff_1', Math.min(W, H) * 0.55 * 0.5) ?? this.img('mist_puff_1')) as CanvasImageSource | null, p2 = (this.scaled('mist_puff_2', Math.min(W, H) * 0.55 * 0.5) ?? this.img('mist_puff_2')) as CanvasImageSource | null;
      g.save();
      const tone = w.night > 0.5 ? 0.45 : 0.7;
      if (band) {
        g.globalAlpha = ek * tone;
        g.drawImage(band, -W * 0.1 + Math.sin(t * 0.05) * 30, H - H * 0.2, W * 1.2, H * 0.24);
        g.drawImage(band, -W * 0.15 - Math.sin(t * 0.04) * 30, H - H * 0.12, W * 1.3, H * 0.16);
        g.globalAlpha = ek * tone * 0.7;
        g.drawImage(band, -W * 0.05 + Math.cos(t * 0.03) * 40, bandH * 0.85, W * 1.1, H * 0.14);
      }
      if (p1 && p2) {
        const s = Math.min(W, H) * 0.55;
        g.globalAlpha = ek * tone * 0.85;
        g.drawImage(p1, -s * 0.45 + Math.sin(t * 0.07) * 12, H * 0.45, s, s);
        g.drawImage(p2, W - s * 0.55 + Math.cos(t * 0.06) * 12, H * 0.38, s, s);
      }
      g.restore();
    }
    prof.add('M┊留白雾', _m);
  }

  /** GL 模式：远景长卷已在世界画布上画过，这里只补「世界层之上」的雨幕与留白雾带 */
  private drawBackOverlay(g: CanvasRenderingContext2D, W: number, H: number, game: Game, t: number) {
    const zk = this.zoomK(game.cam.zoom), wt = game.weather, k = wt.k, w = this.w;
    const rainK = wt.kind === 'rain' || wt.kind === 'storm' ? k : 0, fogK = wt.kind === 'fog' ? k : 0;
    let _m = prof.t();
    if (rainK > 0.05) { g.save(); this.drawRainVeil(g, W, H, rainK, t); g.restore(); }
    prof.add('M┊雨幕', _m); _m = prof.t();
    const ek = atmoEnabled() ? Math.max(this.idleK, fogK * 0.5) * zk : 0;
    if (ek > 0.02) {
      const band = (this.scaled('mist_band', Math.max(H * 0.24, 200)) ?? this.img('mist_band')) as CanvasImageSource | null;
      const p1 = (this.scaled('mist_puff_1', Math.min(W, H) * 0.55 * 0.5) ?? this.img('mist_puff_1')) as CanvasImageSource | null;
      const p2 = (this.scaled('mist_puff_2', Math.min(W, H) * 0.55 * 0.5) ?? this.img('mist_puff_2')) as CanvasImageSource | null;
      const bandH = clamp(H * 0.3, 150, 380);
      g.save();
      const tone = w.night > 0.5 ? 0.45 : 0.7;
      if (band) {
        g.globalAlpha = ek * tone;
        g.drawImage(band, -W * 0.1 + Math.sin(t * 0.05) * 30, H - H * 0.2, W * 1.2, H * 0.24);
        g.drawImage(band, -W * 0.15 - Math.sin(t * 0.04) * 30, H - H * 0.12, W * 1.3, H * 0.16);
        g.globalAlpha = ek * tone * 0.7;
        g.drawImage(band, -W * 0.05 + Math.cos(t * 0.03) * 40, bandH * 0.85, W * 1.1, H * 0.14);
      }
      if (p1 && p2) {
        const s = Math.min(W, H) * 0.55;
        g.globalAlpha = ek * tone * 0.85;
        g.drawImage(p1, -s * 0.45 + Math.sin(t * 0.07) * 12, H * 0.45, s, s);
        g.drawImage(p2, W - s * 0.55 + Math.cos(t * 0.06) * 12, H * 0.38, s, s);
      }
      g.restore();
    }
    prof.add('M┊留白雾', _m);
  }

  /**
   * 雨幕：一层极淡的斜雨丝，视差与屏幕同步（世界层之上、留白之下）。
   *
   * 线上原实现是 `createPattern(rain_veil)` + `translate` + 满屏 `fillRect`。
   * 移植版（058-core-07-weather.js）实测这条全屏 pattern 通道在某些驱动上极慢，
   * 改成逐 tile `drawImage`：位置/缩放与 pattern 完全一致（含小数相位），逐像素等价，
   * 一屏约 70 个 tile，每个 drawImage 约 1µs，远便宜于一次满屏 pattern fill。
   */
  private drawRainVeil(g: CanvasRenderingContext2D, W: number, H: number, rainK: number, t: number) {
    const rv = this.img('rain_veil');
    if (!rv) return;
    const tw = Math.max(1, rv.naturalWidth || 1), th = Math.max(1, rv.naturalHeight || 1);
    const ox = (t * 90) % tw, oy = (t * 360) % th;
    g.save();
    g.globalAlpha = 0.55 * rainK;
    for (let y = oy - th; y < H; y += th) {
      for (let x = -ox; x < W; x += tw) g.drawImage(rv, x, y, tw, th);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- 画：夜空（不经调色，月与星自己发光）
  drawSky(g: CanvasRenderingContext2D, W: number, H: number, game: Game, z: number, camX: number) {
    if (!this.enabled || !atmoEnabled()) return;
    const zk = this.zoomK(z), wt = game.weather;
    const clear = wt.kind === 'clear' ? 1 : 1 - wt.k;
    const nk = clamp((game.night - 0.25) / 0.6, 0, 1) * clear * zk;
    if (nk < 0.02) return;
    const bandH = clamp(H * 0.3, 150, 380);
    g.save();
    // 星汉：深夜 + 晴
    const stars = this.img('sky_starriver');
    if (stars) { g.globalCompositeOperation = 'lighter'; const sa = Math.min(1, nk * 1.3); g.globalAlpha = sa; this.tiledS(g, 'sky_starriver', -camX * z * 0.01 - game.time * 0.5, -bandH * 0.04, bandH * 0.5, W); g.globalAlpha = sa * 0.6; this.tiledS(g, 'sky_starriver', -camX * z * 0.013 - game.time * 0.4 + 900, bandH * 0.02, bandH * 0.36, W); }
    // 月：按月相（每月 30 日），蛾眉月 / 满月，带淡淡月晕
    const day = Math.floor(game.day) % 30, full = day >= 10 && day <= 20;
    const im = this.img(full ? 'moon_full' : 'moon_crescent');
    if (im) {
      const r = bandH * (full ? 0.11 : 0.12), x = W * 0.6 - ((camX * z * 0.004) % 40), y = bandH * 0.24; // 避开右上角日期与小地图
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(x, y, r * 0.8, x, y, r * (full ? 4.2 : 3));
      halo.addColorStop(0, `rgba(240,232,200,${0.22 * nk})`); halo.addColorStop(0.35, `rgba(200,210,220,${0.08 * nk})`); halo.addColorStop(1, 'rgba(180,200,220,0)');
      g.globalAlpha = 1; g.fillStyle = halo; g.fillRect(x - r * 4.5, y - r * 4.5, r * 9, r * 9);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = nk * 0.95;
      const ar = im.naturalWidth / im.naturalHeight;
      g.drawImage(im, x - r * ar, y - r, r * 2 * ar, r * 2);
    }
    g.restore();
  }

  // ---------------------------------------------------------------- 后处理：宣纸纤维 + 淡墨四角
  drawPost(g: CanvasRenderingContext2D, W: number, H: number, GL: boolean) {
    if (!this.enabled) return;
    const pp = this.img('paper_grain'), vg = this.img('ink_vignette');
    g.save();
    if (pp && grainEnabled()) {
      // 线上原实现：createPattern(paper_grain) + 满屏 fillRect。
      // 移植版实测该通道在 Chromium/ANGLE(D3D11) 会掉进极慢路径（单次约 318ms），
      // 改为逐 tile drawImage（约十来次 blit，alpha 仍在合成时施加，逐像素等价）。
      const tw = Math.max(1, pp.naturalWidth || 1), th = Math.max(1, pp.naturalHeight || 1);
      g.globalCompositeOperation = GL ? 'source-over' : 'overlay';
      g.globalAlpha = GL ? 0.035 : 0.06;
      for (let y = 0; y < H; y += th) {
        for (let x = 0; x < W; x += tw) g.drawImage(pp, x, y, tw, th);
      }
    }
    if (vg) { g.globalCompositeOperation = 'source-over'; g.globalAlpha = GL ? 0.4 : 0.5; g.drawImage(vg, 0, 0, W, H); }
    g.restore();
  }

  /** 山腰云：给大山横一条烟岚（云断山腰 = 高远）。世界坐标，调用前须是世界变换 */
  drawWaistMist(ctx: CanvasRenderingContext2D, d: { x: number; y: number; w: number; h: number }, t: number, seed: number) {
    const band = this.img('mist_band'); if (!band || !this.enabled || !atmoEnabled()) return;
    const bw = d.w * (1.15 + seed * 0.4), bh = bw * 0.22;
    const x = d.x + Math.sin(t * 0.04 + seed * 9) * d.w * 0.1, y = d.y - d.h * (0.38 + seed * 0.14);
    ctx.save();
    ctx.globalAlpha = (0.5 + seed * 0.25) * (1 - this.w.night * 0.45);
    if (seed > 0.5) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(band, -bw / 2, -bh / 2, bw, bh); }
    else ctx.drawImage(band, x - bw / 2, y - bh / 2, bw, bh);
    ctx.restore();
  }
}

export const mood = new MoodLayer();
if (typeof window !== 'undefined') (window as any).__moodRef = { mood };
