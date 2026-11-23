// 天气：晴 / 雨 / 雷雨 / 雪 / 雾 / 风沙。随地域与季节变化，屏幕空间绘制。
export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow' | 'fog' | 'sand';
export const WEATHER_NAME: Record<WeatherKind, string> = { clear: '晴', rain: '雨', storm: '雷雨', snow: '雪', fog: '雾', sand: '风沙' };

interface Drop { x: number; y: number; v: number; l: number; s: number }

/** 雪花小图（按半径分档烘好复用）：以前每片雪花都 beginPath+arc+fill，260 片就是 260 次路径 */
const FLAKE: HTMLCanvasElement[] = [];
function flakeSprite(r: number): HTMLCanvasElement {
  const i = Math.max(1, Math.min(4, Math.round(r)));
  let cv = FLAKE[i];
  if (cv) return cv;
  const d = Math.ceil(i * 2 + 2);
  cv = document.createElement('canvas'); cv.width = cv.height = d;
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(d / 2, d / 2, d / 2, 0, Math.PI * 2); g.fill();
  FLAKE[i] = cv;
  return cv;
}

export class Weather {
  kind: WeatherKind = 'clear';
  next: WeatherKind = 'clear';
  k = 0;           // 当前天气强度 0–1（渐入渐出）
  /** WebGL 模式：整屏填色（沙尘、雾、闪电白光）交给后期着色器 */
  noFills = false;
  /** 画质档（renderer.lowered）：≥1 时雨雪粒子减量、≥2 时再省掉地面水花 */
  quality = 0;
  timer = 25;
  flash = 0; flashCd = 6;
  wind = 0.4;      // 风力（影响树摆、雨斜）
  drops: Drop[] = [];
  forced: WeatherKind | null = null;
  /** 第四十六步/v0.80：地域偏向（烟雨湖多雨、竹海多雾、灵界灵雷交作、仙界祥雾瑞霞） */
  bias: 'rain' | 'fog' | 'spirit' | 'immortal' | null = null;
  onThunder?: () => void;

  /** ctx: 区域气候 */
  update(dt: number, env: { cold: number; arid: number; sea: boolean; season: number; map?: string }) {
    this.bias = env.map === 'lingjie' ? 'spirit' : env.map === 'xianjie' ? 'immortal' : this.bias === 'spirit' || this.bias === 'immortal' ? null : this.bias;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 50 + Math.random() * 70;
      this.next = this.forced ?? this.roll(env);
    }
    if (this.forced && this.next !== this.forced) this.next = this.forced;
    // 过渡：先淡出旧天气，再淡入新天气
    if (this.next !== this.kind) { this.k -= dt * 0.25; if (this.k <= 0) { this.k = 0; this.kind = this.next; } }
    else this.k = Math.min(1, this.k + dt * 0.2);
    const targetWind = this.kind === 'storm' ? 1.6 : this.kind === 'sand' ? 1.8 : this.kind === 'rain' ? 0.9 : this.kind === 'snow' ? 0.6 : 0.35;
    this.wind += (targetWind * (0.5 + 0.5 * this.k) - this.wind) * Math.min(1, dt * 0.5);
    if (this.kind === 'storm' && this.k > 0.5) {
      this.flashCd -= dt;
      if (this.flashCd <= 0) { this.flash = 1; this.flashCd = 4 + Math.random() * 9; setTimeout(() => this.onThunder?.(), 300 + Math.random() * 900); }
    }
    this.flash = Math.max(0, this.flash - dt * 2.5);
  }

  private roll(env: { cold: number; arid: number; sea: boolean; season: number; map?: string }): WeatherKind {
    const r = Math.random();
    if (this.bias === 'spirit') {
      if (env.cold > 0.45) return r < 0.45 ? 'snow' : r < 0.7 ? 'fog' : 'clear';
      if (env.sea || env.arid > 0.65) return r < 0.35 ? 'storm' : r < 0.55 ? 'fog' : 'clear';
      return r < 0.28 ? 'fog' : r < 0.46 ? 'rain' : r < 0.56 ? 'storm' : 'clear';
    }
    if (this.bias === 'immortal') {
      if (env.cold > 0.5) return r < 0.35 ? 'snow' : r < 0.65 ? 'fog' : 'clear';
      return r < 0.36 ? 'fog' : r < 0.46 ? 'rain' : 'clear';
    }
    if (this.bias === 'rain' && env.cold < 0.5 && r < 0.6) return r < 0.42 ? 'rain' : r < 0.5 ? 'storm' : 'fog';
    if (this.bias === 'fog' && r < 0.45) return r < 0.32 ? 'fog' : 'rain';
    if (env.arid > 0.75) return r < 0.3 ? 'sand' : 'clear';
    if (env.cold > 0.5 || (env.season === 3 && env.cold > 0.2)) return r < 0.45 ? 'snow' : r < 0.55 ? 'fog' : 'clear';
    if (env.season === 3) return r < 0.25 ? 'snow' : r < 0.35 ? 'fog' : 'clear';
    if (env.sea) return r < 0.2 ? 'storm' : r < 0.42 ? 'rain' : r < 0.52 ? 'fog' : 'clear';
    if (env.season === 1) return r < 0.14 ? 'storm' : r < 0.36 ? 'rain' : 'clear';
    return r < 0.22 ? 'rain' : r < 0.34 ? 'fog' : 'clear';
  }

  /** 画面暗化（雨天、雷雨） */
  get gloom() { return (this.kind === 'storm' ? 0.38 : this.kind === 'rain' ? 0.2 : this.kind === 'fog' ? 0.06 : this.kind === 'snow' ? 0.08 : this.kind === 'sand' ? 0.12 : 0) * this.k; }

  draw(g: CanvasRenderingContext2D, W: number, H: number, dt: number, camDX: number, camDY: number): boolean {
    const k = this.k;
    if (k <= 0.01 && this.flash <= 0) return false;
    let drew = false;
    const kind = this.kind;
    if (kind === 'rain' || kind === 'storm' || kind === 'snow' || kind === 'sand') {
      drew = true;
      const qd = this.quality >= 2 ? 0.45 : this.quality >= 1 ? 0.65 : 1;   // 降过档的机器雨雪粒子减量
      const want = Math.floor((kind === 'storm' ? 520 : kind === 'rain' ? 340 : kind === 'snow' ? 260 : 200) * k * qd * Math.min(1.4, (W * H) / (1280 * 800)));
      while (this.drops.length < want) this.drops.push(this.spawn(W, H, true));
      if (this.drops.length > want) this.drops.length = want;
      const wx = this.wind * (kind === 'snow' ? 40 : kind === 'sand' ? 380 : 160);
      g.save();
      if (kind === 'rain' || kind === 'storm') {
        g.strokeStyle = `rgba(210,222,232,${0.35 + 0.2 * k})`; g.lineWidth = 1;
        g.beginPath();
        for (const d of this.drops) {
          d.x += (wx - camDX * 0.6) * dt; d.y += (d.v - camDY * 0.6) * dt;
          if (d.y > H + 20 || d.x < -40 || d.x > W + 40) Object.assign(d, this.spawn(W, H, false));
          const lx = wx / d.v * d.l;
          g.moveTo(d.x, d.y); g.lineTo(d.x - lx, d.y - d.l);
        }
        g.stroke();
        // 地面水花（低画质就省了：纯氛围，一帧二十个随机 fillRect）
        if (this.quality < 2) {
          g.fillStyle = 'rgba(230,240,245,0.35)';
          for (let i = 0; i < 20 * k; i++) { const x = Math.random() * W, y = Math.random() * H; g.fillRect(x, y, 3, 1); }
        }
      } else if (kind === 'snow') {
        // 雪花改成烘好的小图 blit（原来是每片 arc + fill，260 片就是 260 条路径）
        for (const d of this.drops) {
          d.x += (wx + Math.sin(d.y * 0.02 + d.s * 6) * 22 - camDX * 0.6) * dt; d.y += (d.v - camDY * 0.6) * dt;
          if (d.y > H + 10 || d.x < -20 || d.x > W + 20) Object.assign(d, this.spawn(W, H, false));
          const r = d.s * 2.4 + 0.6, sp = flakeSprite(r), sz = Math.max(2, Math.round(r * 2 + 2));
          g.drawImage(sp, d.x - sz / 2, d.y - sz / 2, sz, sz);
        }
      } else {
        g.fillStyle = 'rgba(200,160,100,0.55)';
        for (const d of this.drops) {
          d.x += (wx - camDX * 0.6) * dt; d.y += (Math.sin(d.x * 0.01) * 30 - camDY * 0.6) * dt;
          if (d.x > W + 20 || d.y > H + 20 || d.y < -20 || d.x < -40) Object.assign(d, this.spawn(W, H, false), { x: -10 });
          g.fillRect(d.x, d.y, d.l * 0.6, 1.4);
        }
        if (!this.noFills) { g.fillStyle = `rgba(196,160,110,${0.28 * k})`; g.fillRect(0, 0, W, H); }
      }
      g.restore();
    }
    if (kind === 'fog' && !this.noFills) {
      drew = true;
      const t = performance.now() / 1000;
      g.save();
      for (let i = 0; i < 4; i++) {
        const y = H * (0.2 + i * 0.22) + Math.sin(t * 0.1 + i) * 20;
        const gr = g.createLinearGradient(0, y - H * 0.18, 0, y + H * 0.18);
        gr.addColorStop(0, 'rgba(236,236,230,0)'); gr.addColorStop(0.5, `rgba(236,236,230,${0.32 * k})`); gr.addColorStop(1, 'rgba(236,236,230,0)');
        g.fillStyle = gr; g.fillRect(0, y - H * 0.18, W, H * 0.36);
      }
      g.fillStyle = `rgba(230,232,228,${0.18 * k})`; g.fillRect(0, 0, W, H);
      g.restore();
    }
    if (this.flash > 0) {
      if (!this.noFills) { drew = true; g.fillStyle = `rgba(235,240,255,${this.flash * 0.55})`; g.fillRect(0, 0, W, H); }
      if (this.flash > 0.85) {
        drew = true;
        // 闪电
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2.2;
        let x = W * (0.2 + Math.random() * 0.6), y = 0;
        g.beginPath(); g.moveTo(x, y);
        while (y < H * 0.55) { x += (Math.random() - 0.5) * 60; y += 20 + Math.random() * 30; g.lineTo(x, y); }
        g.stroke();
      }
    }
    return drew;
  }

  private spawn(W: number, H: number, anywhere: boolean): Drop {
    const kind = this.kind;
    const v = kind === 'snow' ? 40 + Math.random() * 50 : kind === 'sand' ? 0 : 700 + Math.random() * 500;
    return { x: Math.random() * (W + 200) - 100, y: anywhere ? Math.random() * H : -20 - Math.random() * 60, v, l: kind === 'sand' ? 8 + Math.random() * 18 : 10 + Math.random() * 14, s: Math.random() };
  }
}

// ---------------------------------------------------------------- v0.48 时辰色罩表（意境一半在这张表里）
// 行：晨 / 午 / 暮 / 夜；列：晴 / 雨 / 雪 / 雾。值：[罩色, 强度]。雷雨按雨、风沙按晴（风沙自有整屏沙色）。
type Mask = [string, number];
export const MOOD_MASK: Record<'dawn' | 'noon' | 'dusk' | 'night', Record<'clear' | 'rain' | 'snow' | 'fog', Mask>> = {
  dawn: { clear: ['#cfe0d8', 0.12], rain: ['#a8b8b4', 0.2], snow: ['#dde4e8', 0.15], fog: ['#e2e0d4', 0.25] },
  noon: { clear: ['#ffffff', 0], rain: ['#6a7a88', 0.18], snow: ['#c8d0d4', 0.12], fog: ['#c8ccc8', 0.15] },
  dusk: { clear: ['#c89060', 0.15], rain: ['#4a5a64', 0.22], snow: ['#8a88a0', 0.15], fog: ['#a8a090', 0.2] },
  night: { clear: ['#2a3a4e', 0.3], rain: ['#1c2228', 0.4], snow: ['#b8c8d8', 0.25], fog: ['#22262a', 0.35] },
};
const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
/** 时辰权重：dayPhase 0=子夜 0.25=卯时 0.5=午 0.75=酉时 */
export function phaseWeights(dayPhase: number, night: number) {
  const bell = (c: number, w: number) => { let d = Math.abs(dayPhase - c); d = Math.min(d, 1 - d); return Math.max(0, 1 - d / w); };
  const dawn = bell(0.27, 0.09) * (1 - night * 0.6), dusk = bell(0.73, 0.09) * (1 - night * 0.6);
  const nt = night * (1 - Math.max(dawn, dusk) * 0.5);
  const noon = Math.max(0, 1 - dawn - dusk - nt);
  const s = dawn + dusk + nt + noon || 1;
  return { dawn: dawn / s, dusk: dusk / s, night: nt / s, noon: noon / s };
}
/** 当前色罩：返回 0–1 的 rgb 与强度 a（按时辰权重、天气强度混合） */
export function moodMask(dayPhase: number, night: number, kind: WeatherKind, k: number): [number, number, number, number] {
  const w = phaseWeights(dayPhase, night);
  const col = kind === 'rain' || kind === 'storm' ? 'rain' : kind === 'snow' ? 'snow' : kind === 'fog' ? 'fog' : 'clear';
  let r = 0, g = 0, b = 0, a = 0, ws = 0;
  for (const ph of ['dawn', 'noon', 'dusk', 'night'] as const) {
    const wk = w[ph]; if (wk <= 0) continue;
    const clear = MOOD_MASK[ph].clear, wet = MOOD_MASK[ph][col];
    const ca = hexRgb(clear[0]), cb = hexRgb(wet[0]);
    const kk = col === 'clear' ? 0 : k;
    const s = clear[1] * (1 - kk) + wet[1] * kk;
    const c = [ca[0] * (1 - kk) + cb[0] * kk, ca[1] * (1 - kk) + cb[1] * kk, ca[2] * (1 - kk) + cb[2] * kk];
    const ww = wk * s;
    r += c[0] * ww; g += c[1] * ww; b += c[2] * ww; ws += ww; a += s * wk;
  }
  return ws > 0 ? [r / ws, g / ws, b / ws, a] : [1, 1, 1, 0];
}
