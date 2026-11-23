// 虚空的平面部分：人界的俯瞰图（三张图的全图缩略拼成一张）、盖在画面上的那一层（界名、指向、界壁涟漪、天色、满屏的光）。
// 立体的部分（星渊、浮陆、穹顶）在 hd2d/voidscene.ts。
import type { Game } from './game';
import { mapOverview, mapTerrain, prebuildTerrain, mapPatchSteps } from './game';
import { MAP_IDS, WORLD_SCALE, mapMainland, locsOf, SEAM_DEPTH, SEA_ISLES, seamsOf, type MapId } from '../data/world';
import { HOME, HOME_BOUNDS, HOME_RECTS, REALM_KIND_NAME, realmDistance, voidLi, pointToVoid, realmOfMap, VOID_SCALE, type Realm } from '../data/zhujie';
import type { VoidPatch } from '../hd2d/voidscene';
import type { VoidScene } from '../hd2d/voidscene';
import type { Xukong } from './xukong';

/** 俯瞰图里的海色、草原色、还没建好的图先垫的陆地色 */
const SEA = '#497c88', STEPPE = '#a9ab78', LAND = '#a8bb7f';

/**
 * 把一张图上的城池、集镇、村落、宗门画到俯瞰图上——从天外看，人界得有人烟：城有城墙和街坊（国都正中是皇城），四周一圈田畴；
 * 镇是一小片屋顶，村是三五个屋顶；宗门是青瓦白墙的一簇。调用前画布要变换到「这张图的界内坐标」（一个单位 = 界内一个单位）。
 * x0..y1 是要画的范围（界内坐标），范围外的跳过；px 是一个像素合多少界内单位（太小的东西据此省掉）。
 */
export function paintSettlements(g: CanvasRenderingContext2D, map: MapId, x0: number, y0: number, x1: number, y1: number, px: number): void {
  const FIELD = ['#b9b673', '#a9b56a', '#c8bd7e', '#9fae62', '#d2c489', '#b0a863'];
  for (const l of locsOf(map)) {
    const t = l.type as string;
    if (t !== 'city' && t !== 'town' && t !== 'sect') continue;
    const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
    const capital = l.id === 'jinjing' || l.id === 'yuejing';
    const R = t === 'city' ? (capital ? 3000 : l.major ? 2500 : 2000) : t === 'sect' ? (l.major ? 2100 : 1500) : l.minor ? 420 : 950;
    if (x + R * 2.4 < x0 || x - R * 2.4 > x1 || y + R * 2.4 < y0 || y - R * 2.4 > y1) continue;
    let seed = 0; for (let i = 0; i < l.id.length; i++) seed = (Math.imul(seed, 31) + l.id.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // 田畴：城、镇、村外一圈拼布似的田块（宗门没有）
    if (t !== 'sect') {
      const n = t === 'city' ? 46 : l.minor ? 9 : 20, far = t === 'city' ? 2.2 : 2.6;
      g.globalAlpha = 0.78;
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = R * (0.95 + rnd() * (far - 0.95)), w = R * (0.22 + rnd() * 0.3), h = w * (0.5 + rnd() * 0.5);
        g.fillStyle = FIELD[Math.floor(rnd() * FIELD.length)];
        g.save(); g.translate(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9); g.rotate((rnd() - 0.5) * 0.5); g.fillRect(-w / 2, -h / 2, w, h); g.restore();
      }
      g.globalAlpha = 1;
    }
    if (t === 'city') {
      // 城墙、街坊、屋顶
      const w = R * 1.7, h = R * 1.45;
      g.fillStyle = '#6f685c'; g.fillRect(x - w / 2 - R * 0.07, y - h / 2 - R * 0.07, w + R * 0.14, h + R * 0.14);
      g.fillStyle = '#c9b996'; g.fillRect(x - w / 2, y - h / 2, w, h);
      const nx = capital ? 7 : 5, ny = capital ? 6 : 4, bw = w / nx, bh = h / ny;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        g.fillStyle = ['#7d6f5c', '#8a7a62', '#6e6558', '#94806a'][Math.floor(rnd() * 4)];
        g.fillRect(x - w / 2 + i * bw + bw * 0.12, y - h / 2 + j * bh + bh * 0.14, bw * 0.76, bh * 0.72);
      }
      if (capital) {
        // 皇城：正中偏北，朱墙金瓦
        g.fillStyle = '#8c2f24'; g.fillRect(x - w * 0.19, y - h * 0.36, w * 0.38, h * 0.44);
        g.fillStyle = '#e2b54a'; g.fillRect(x - w * 0.13, y - h * 0.31, w * 0.26, h * 0.13); g.fillRect(x - w * 0.1, y - h * 0.14, w * 0.2, h * 0.1);
      }
    } else if (t === 'sect') {
      // 宗门：一簇青瓦，中轴上几座大殿
      g.fillStyle = 'rgba(214,208,190,0.85)'; g.beginPath(); g.ellipse(x, y, R * 0.8, R * 0.66, 0, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 4; i++) { const hw = R * (0.42 - i * 0.07); g.fillStyle = i % 2 ? '#4f6a70' : '#3f5a66'; g.fillRect(x - hw, y + R * (0.42 - i * 0.3), hw * 2, R * 0.17); }
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) { g.fillStyle = '#5a6f73'; g.fillRect(x + sx * R * 0.6 - R * 0.12, y + R * (0.3 - i * 0.3), R * 0.24, R * 0.14); }
    } else {
      // 镇 / 村：一小片屋顶（小得不足一个像素的就点一个点）
      const n = l.minor ? 5 : 14, rw = l.minor ? R * 0.34 : R * 0.26;
      if (R * 2 < px * 1.6) { g.fillStyle = '#7a6850'; g.fillRect(x - px * 0.6, y - px * 0.6, px * 1.2, px * 1.2); continue; }
      if (!l.minor) { g.fillStyle = '#c9b996'; g.fillRect(x - R * 0.75, y - R * 0.6, R * 1.5, R * 1.2); }
      for (let i = 0; i < n; i++) {
        g.fillStyle = ['#7d6a52', '#8c7558', '#6f6250'][Math.floor(rnd() * 3)];
        g.fillRect(x + (rnd() - 0.5) * R * 1.3 - rw / 2, y + (rnd() - 0.5) * R * 1.0 - rw * 0.35, rw, rw * 0.7);
      }
    }
  }
}

/**
 * 人界的俯瞰图：把南荒、中州、沧溟海三张图的全图缩略按它们在人界里的位置拼到一张画布上。
 * 图外（天穹草原、无边海、四周的海和小岛）照 world/outland.ts 按大陆坐标现场算（和飞出图外时脚下的地是同一份），
 * 颜色从南荒全图缩略的边上取样，三张图的边缘再羽化着融进去，所以看不出矩形的接缝（世界地图缩小时放大看得很清楚）。
 * 别的图的地形可能还没建过——先按海岸线垫一块底色，同时在后台分片把它建出来，建好了再补上（rev 加一，画面那边据此重新上传）。
 */
export class HomeMap {
  readonly canvas: HTMLCanvasElement;
  rev = 0;
  private readonly have = new Set<MapId>();
  private painted = false;
  /** 图外那一层（低分辨率，按行分帧算） */
  private out: HTMLCanvasElement | null = null;
  private outJob: Generator<void, HTMLCanvasElement, void> | null = null;
  constructor() {
    const B = HOME_BOUNDS, W = 2048;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = Math.round(W * (B.y1 - B.y0) / (B.x1 - B.x0));
  }
  /** 每帧调一次：后台接着算图外、建还没建好的图，有新的就重画。budget 是这一帧最多花多少毫秒 */
  update(budget = 5): void {
    let fresh = !this.painted;
    const t0 = performance.now();
    if (!this.out) {
      this.outJob ??= this.outlandSteps();
      while (performance.now() - t0 < budget) { const r = this.outJob.next(); if (r.done) { this.out = r.value; this.outJob = null; fresh = true; break; } }
    }
    for (const m of MAP_IDS) {
      if (this.have.has(m)) continue;
      if (mapOverview(m) || prebuildTerrain(m, Math.max(1, budget - (performance.now() - t0)))) { this.have.add(m); fresh = true; this.out = null; this.outJob = null; }   // 一帧只建一张；建好了图外重算（多了一张图可问）
      break;
    }
    if (fresh) this.paint();
  }
  /** 取样：南荒全图缩略的右下角是深海，北缘那几行是草原的地色（南荒还没建就用默认色） */
  private palette() {
    const a = mapOverview('tiannan');
    const def = { sea: [73, 124, 136], land: [169, 171, 120] };
    if (!a) return def;
    try {
      const g = a.getContext('2d')!, d = g.getImageData(0, 0, a.width, 3).data, sea = g.getImageData(a.width - 4, a.height - 4, 1, 1).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 2] > d[i + 1] + 8) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }   // 偏蓝的是水，不算
      return { sea: [sea[0], sea[1], sea[2]], land: n ? [r / n, gg / n, b / n] : def.land };
    } catch { return def; }
  }
  /**
   * 图外：每个像素直接问游戏地形这一点是什么颜色（Terrain.groundColor，小地图画图外也用它）——交界地带的草原地峡、
   * 不通的边外铺的那圈海、无边海上的小岛，都和飞到那儿时看到的一样；图边上两边是同一个颜色，羽化以后看不出接缝。
   * 离哪几张图近就问哪几张（按距离加权，两张图之间的海一路化过去）；哪张图的地形还没建就先不问它，建好了重算。
   */
  private *outlandSteps(): Generator<void, HTMLCanvasElement, void> {
    const B = HOME_BOUNDS, N = 640, M = Math.round(N * (B.y1 - B.y0) / (B.x1 - B.x0)), cell = (B.x1 - B.x0) / N;
    const c = document.createElement('canvas'); c.width = N; c.height = M;
    const g = c.getContext('2d')!, img = g.createImageData(N, M), d = img.data;
    const maps = MAP_IDS.map((m) => ({ m, r: HOME_RECTS[m], t: mapTerrain(m) })).filter((q) => q.t);
    const col = [0, 0, 0];
    for (let j = 0; j < M; j++) {
      const gy = B.y0 + (j + 0.5) * cell;
      for (let i = 0; i < N; i++) {
        const gx = B.x0 + (i + 0.5) * cell, o = (j * N + i) * 4;
        // 图里由全图缩略盖住（只留羽化那一圈要垫底）
        if (MAP_IDS.some((m) => { const r = HOME_RECTS[m], ix = r.w * 0.06, iy = r.h * 0.06; return gx > r.x + ix && gx < r.x + r.w - ix && gy > r.y + iy && gy < r.y + r.h - iy; })) { d[o + 3] = 0; continue; }
        let R = 0, G = 0, Bb = 0, W = 0, A = 0;
        for (const q of maps) {
          const dx = Math.max(q.r.x - gx, 0, gx - q.r.x - q.r.w), dy = Math.max(q.r.y - gy, 0, gy - q.r.y - q.r.h), dist = Math.hypot(dx, dy);
          // 只问这张图「地形管得着」的范围：通着的边外是交界地带（深十几万），不通的边外是那圈六万宽的海；再远它给的是夹到边上的值
          const sn = seamsOf(q.m), lim = (side: string) => Math.max(56000, sn.find((z) => z.side === side)?.depth ?? 0);
          const room = Math.min(gx - (q.r.x - lim('w')), q.r.x + q.r.w + lim('e') - gx, gy - (q.r.y - lim('n')), q.r.y + q.r.h + lim('s') - gy);
          if (room <= 0) continue;
          // 离管得着的范围的边越近越淡（两万单位里化开），底下的海色慢慢露出来，不留一道方框
          const f = Math.min(1, room / 20000), fa = f * f * (3 - 2 * f); A = Math.max(A, fa);
          const w = fa / Math.pow(dist + 6000, 3);
          q.t!.groundColor(gx - q.r.x, gy - q.r.y, col);
          R += col[0] * w; G += col[1] * w; Bb += col[2] * w; W += w;
        }
        if (W > 0) { d[o] = R / W; d[o + 1] = G / W; d[o + 2] = Bb / W; d[o + 3] = Math.round(255 * A); } else d[o + 3] = 0;
      }
      if (j % 3 === 2) yield;
    }
    g.putImageData(img, 0, 0);
    yield;
    return c;
  }
  private paint() {
    this.painted = true; this.rev++;
    const B = HOME_BOUNDS, c = this.canvas, g = c.getContext('2d')!, k = c.width / (B.x1 - B.x0);
    const X = (x: number) => (x - B.x0) * k, Y = (y: number) => (y - B.y0) * k;
    const P = this.palette();
    g.fillStyle = `rgb(${P.sea.map((v) => v | 0).join(',')})`; g.fillRect(0, 0, c.width, c.height);
    /** 把一块画布四边羽化（f 像素宽）：先画一个缩进 f 的白矩形，再糊开当遮罩 */
    const feather = (t: HTMLCanvasElement, f: number) => {
      const w = t.width, h = t.height;
      const rect = document.createElement('canvas'); rect.width = w; rect.height = h; const rg = rect.getContext('2d')!;
      rg.fillStyle = '#fff'; rg.fillRect(f, f, w - 2 * f, h - 2 * f);
      const mask = document.createElement('canvas'); mask.width = w; mask.height = h; const mg = mask.getContext('2d')!;
      try { mg.filter = `blur(${f * 0.6}px)`; } catch { /* */ }
      mg.drawImage(rect, 0, 0);
      const tg = t.getContext('2d')!; tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, 0, 0); tg.globalCompositeOperation = 'source-over';
    };
    // 每张图在图边上的海色不一样深：先在它四周垫一圈它自己的海色，向外化开（再铺草原、贴图，草原那两条边不受影响）
    for (const m of MAP_IDS) {
      const r = HOME_RECTS[m], ov = this.have.has(m) ? mapOverview(m) : null;
      const w = Math.max(1, Math.round(r.w * k)), h = Math.max(1, Math.round(r.h * k));
      if (ov) {
        let sc = P.sea;
        try { const q = ov.getContext('2d')!.getImageData(ov.width - 3, ov.height - 3, 1, 1).data; sc = [q[0], q[1], q[2]]; } catch { /* */ }
        const F = Math.round(Math.min(w, h) * 0.12), halo = document.createElement('canvas'); halo.width = w + 2 * F; halo.height = h + 2 * F;
        const hg = halo.getContext('2d')!; hg.fillStyle = `rgb(${sc.map((v) => v | 0).join(',')})`; hg.fillRect(0, 0, halo.width, halo.height);
        feather(halo, F); g.drawImage(halo, X(r.x) - F, Y(r.y) - F);
      }
    }
    // 图外的草原：算好了就铺上（平滑放大），没算好先垫一块草色
    if (this.out) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(this.out, 0, 0, c.width, c.height); }
    else { const tn = HOME_RECTS.tiannan; g.fillStyle = STEPPE; g.fillRect(X(0), Y(-SEAM_DEPTH), tn.w * 0.94 * k, SEAM_DEPTH * k); }
    // 无边海上有名字的几座岛（图外那一层的碎岛分辨率不够，画出来是一块块方的，不画）
    {
      g.save(); g.fillStyle = `rgb(${P.land.map((v) => v | 0).join(',')})`; g.shadowColor = 'rgba(150,190,180,0.9)'; g.shadowBlur = 6;
      for (const q of SEA_ISLES) { g.beginPath(); g.ellipse(X(q.x), Y(q.y), Math.max(1.5, q.r * 0.7 * k), Math.max(1.2, q.r * 0.55 * k), 0.4, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
    for (const m of MAP_IDS) {
      const r = HOME_RECTS[m], ov = this.have.has(m) ? mapOverview(m) : null;
      const w = Math.max(1, Math.round(r.w * k)), h = Math.max(1, Math.round(r.h * k));
      // 先画到一张小画布上，四边羽化（宽度约是短边的 4%），再贴上去：矩形的边就化开了
      const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d')!;
      if (ov) {
        tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high'; tg.drawImage(ov, 0, 0, w, h);
        tg.save(); tg.scale(k, k); paintSettlements(tg, m, 0, 0, r.w, r.h, 1 / k); tg.restore();   // 人烟：城池、村镇、宗门
      } else {
        // 还没建好：按海岸线垫一块陆地色（底下是图外那一层的海）
        const poly = mapMainland(m);
        tg.fillStyle = LAND; tg.beginPath();
        poly.forEach((q, i) => { const px = q[0] * WORLD_SCALE * k, py = q[1] * WORLD_SCALE * k; if (i) tg.lineTo(px, py); else tg.moveTo(px, py); });
        tg.closePath(); tg.fill();
      }
      feather(t, Math.max(2, Math.round(Math.min(w, h) * 0.04)));
      g.drawImage(t, X(r.x), Y(r.y));
    }
    // 四边的海渐深
    const edge = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.34, c.width / 2, c.height / 2, c.width * 0.74);
    edge.addColorStop(0, 'rgba(42,88,112,0)'); edge.addColorStop(1, 'rgba(42,88,112,0.7)');
    g.fillStyle = edge; g.fillRect(0, 0, c.width, c.height);
  }
}

/**
 * 近地面的细节：从天外降下来，全图缩略放大到脚下只剩一片色块，所以现画两块局部的俯瞰图垫在脚下
 * （一块 2.4 万见方、一块 11 万见方，都是 512 像素），越近越清楚，接到界内画面时底色已经对得上。
 * 分片在后台画，每帧几毫秒。那张图的地形没建过的话先在后台建。
 */
export class GroundDetail {
  private map: MapId | null = null; private cx = 0; private cy = 0;
  private jobs: (Generator<void, HTMLCanvasElement | null, void> | null)[] = [null, null];
  private out: ({ canvas: HTMLCanvasElement; x0: number; y0: number; span: number; rev: number } | null)[] = [null, null];
  private rev = 0;
  static readonly SPANS = [24000, 110000];
  /** 每帧调一次：要落到哪张图的哪儿。返回细节备好了没有 */
  request(map: MapId, x: number, y: number): boolean {
    if (!prebuildTerrain(map, 6)) return false;
    if (map !== this.map || Math.hypot(x - this.cx, y - this.cy) > GroundDetail.SPANS[0] * 0.3) {
      if (map !== this.map) this.out = [null, null];
      this.map = map; this.cx = x; this.cy = y;
      this.jobs = GroundDetail.SPANS.map((span) => mapPatchSteps(map, (x - span / 2) / WORLD_SCALE, (y - span / 2) / WORLD_SCALE, span / WORLD_SCALE, span > 50000 ? 768 : 512));
    }
    const t0 = performance.now();
    for (let i = 0; i < 2; i++) {
      const job = this.jobs[i]; if (!job) continue;
      while (performance.now() - t0 < 5) {
        const r = job.next();
        if (r.done) {
          this.jobs[i] = null;
          if (r.value) {
            const span = GroundDetail.SPANS[i], x0 = this.cx - span / 2, y0 = this.cy - span / 2, cv = r.value, sc = cv.width / span;
            // 细节图上也画出城镇（贴近了就交给界内的画面）
            const c2 = cv.getContext('2d')!; c2.save(); c2.scale(sc, sc); c2.translate(-x0, -y0); paintSettlements(c2, map, x0, y0, x0 + span, y0 + span, 1 / sc); c2.restore();
            this.out[i] = { canvas: cv, x0, y0, span, rev: ++this.rev };
          }
          break;
        }
      }
      if (this.jobs[i]) return false;
    }
    return !!this.out[0] && !!this.out[1];
  }
  /** 给画面：两块细节图各自盖在这一界大陆面的哪一块上 */
  patches(): (VoidPatch | null)[] {
    const map = this.map; if (!map) return [null, null];
    const r = realmOfMap(map);
    return this.out.map((q) => {
      if (!q) return null;
      const a = pointToVoid(map, q.x0, q.y0), b = pointToVoid(map, q.x0 + q.span, q.y0 + q.span);
      const U = (vx: number) => (vx - (r.x - r.rx)) / (2 * r.rx), V = (vy: number) => 1 - (vy - (r.y - r.ry)) / (2 * r.ry);
      return { canvas: q.canvas, rev: q.rev, u0: U(a.x), v0: V(b.y), u1: U(b.x), v1: V(a.y) };
    });
  }
  get mapId() { return this.map; }
}

let tinted: HTMLCanvasElement | null = null;
/** 符文图染成金色（界壁涟漪上的字） */
function goldGlyphs(atlas: HTMLCanvasElement): HTMLCanvasElement {
  if (tinted) return tinted;
  const c = document.createElement('canvas'); c.width = atlas.width; c.height = atlas.height;
  const g = c.getContext('2d')!;
  g.drawImage(atlas, 0, 0);
  // 这层画布是透明的、叠在画面之上：字要的是「金色 + 按亮度的透明度」，底子若是不透明的黑，叠上去就是一块块黑砖
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] * d[i + 3] / 255; d[i] = 255; d[i + 1] = 224; d[i + 2] = 156; d[i + 3] = v; }
  g.putImageData(img, 0, 0);
  return tinted = c;
}

const FONT = '"Ma Shan Zheng","STKaiti","KaiTi","Kaiti SC","Noto Serif SC",serif';

/**
 * 收官 E3：坠向下界的流星。立板本身由 voidscene 画（VoidFigure 带高度），这里在画面上叠：
 *   · 一条朝上拖出去的火尾（白热的芯、橙金的焰、暗红的烟边，几缕抖动的焰丝和火星）；
 *   · 穿过界壁的那一下：界壁上以落点为心荡开几圈金色的符文涟漪（贴着水平面画，看着是摊在穹顶上的）；
 *   · 你自己被砸下去时，火尾拖在你身上。
 * 都是叠在画面最上层的 2D，只画几十条路径：不进粒子池，也不碰泛光（第一轮糊成一片白的教训）。
 */
function drawFall(ctx: CanvasRenderingContext2D, W: number, H: number, game: Game, scene: VoidScene, glyphs: HTMLCanvasElement | null): void {
  const xk = game.xukong, V = xk.fall, t = xk.clock;
  const at = { x: xk.x, y: xk.y };
  const tail = (x: number, y: number, h: number, size: number, heat: number, seed: number) => {
    const a = scene.toScreen(x, y, h, at), b = scene.toScreen(x, y, h + 400, at);
    if (!a.front) return;
    let ux = b.x - a.x, uy = b.y - a.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    const L = Math.min(H * 0.55, Math.max(110, size * 7)) * (0.6 + heat * 0.4), w = Math.max(9, size * 0.55);
    const nx = -uy, ny = ux;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // 外焰、内焰、白芯：三层收尖的火舌
    const layer = (len: number, wd: number, c0: string, c1: string, alpha: number, wob: number) => {
      const g = ctx.createLinearGradient(a.x, a.y, a.x + ux * len, a.y + uy * len);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.beginPath();
      const n = 10;
      ctx.moveTo(a.x + nx * wd, a.y + ny * wd);
      for (let i = 1; i <= n; i++) { const u = i / n, s = wd * (1 - u) * (1 - u * 0.2) + Math.sin(t * 23 + seed + u * 9) * wob * u; ctx.lineTo(a.x + ux * len * u + nx * s, a.y + uy * len * u + ny * s); }
      for (let i = n; i >= 0; i--) { const u = i / n, s = wd * (1 - u) * (1 - u * 0.2) + Math.sin(t * 19 + seed * 2 + u * 7) * wob * u; ctx.lineTo(a.x + ux * len * u - nx * s, a.y + uy * len * u - ny * s); }
      ctx.closePath(); ctx.fill();
    };
    layer(L, w * 1.9, 'rgba(255,120,40,0.85)', 'rgba(120,20,10,0)', 0.75 * heat + 0.2, w * 0.5);
    layer(L * 0.72, w * 1.15, 'rgba(255,200,90,0.95)', 'rgba(255,90,20,0)', 0.9, w * 0.3);
    layer(L * 0.42, w * 0.5, 'rgba(255,255,235,1)', 'rgba(255,210,120,0)', 1, w * 0.1);
    // 焰丝与火星：沿火尾往后飞散（按时间取相位，帧间连续）
    for (let i = 0; i < 14; i++) {
      const ph = (t * (1.4 + (i % 5) * 0.23) + i * 0.137 + seed) % 1, s = Math.sin(i * 12.9898 + seed) * 0.5;
      const px = a.x + ux * L * ph * 1.1 + nx * w * 2.2 * s * (0.3 + ph), py = a.y + uy * L * ph * 1.1 + ny * w * 2.2 * s * (0.3 + ph);
      ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = i % 3 ? 'rgb(255,190,90)' : 'rgb(255,250,220)';
      ctx.beginPath(); ctx.arc(px, py, 1.4 + (1 - ph) * 2.6, 0, Math.PI * 2); ctx.fill();
    }
    // 头上的一团白热光
    const R = w * 3.2, rg = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R);
    rg.addColorStop(0, 'rgba(255,255,240,0.95)'); rg.addColorStop(0.35, 'rgba(255,200,110,0.55)'); rg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.globalAlpha = 0.85; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  const m = V.figure();
  if (m) {
    // 立板在画面上多大（脚底到头顶）：按人物那一层的比例估
    const base = -xk.refDepth + m.h / VOID_SCALE;
    const a = scene.toScreen(m.vx, m.vy, base, at), b = scene.toScreen(m.vx, m.vy, base + 8, at);
    const size = Math.max(16, Math.abs(a.y - b.y) * 3);
    if (V.mode === 'meteor') tail(m.vx, m.vy, base + 2, size, m.fire, 1.7);
  }
  if (V.mode === 'dropped') tail(xk.x, xk.y, -xk.refDepth + xk.alt + 1, 40, 1, 4.1);
  // 穿过界壁：符文涟漪摊在穹顶上（水平的几圈，往外扩、渐淡）
  const rp = V.ripple;
  if (rp) {
    const age = 1 - rp.k, h0 = -xk.refDepth + rp.h / VOID_SCALE;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const ring = (R: number, alpha: number, lw: number) => {
      ctx.globalAlpha = alpha; ctx.strokeStyle = '#ffd890'; ctx.lineWidth = lw; ctx.beginPath();
      let first = true;
      for (let i = 0; i <= 48; i++) {
        const an = i / 48 * Math.PI * 2, s = scene.toScreen(rp.vx + Math.cos(an) * R, rp.vy + Math.sin(an) * R, h0, at);
        if (!s.front) { first = true; continue; }
        if (first) { ctx.moveTo(s.x, s.y); first = false; } else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
    };
    for (let i = 0; i < 4; i++) { const ph = Math.min(1, age * 1.15 + i * 0.12); ring(40 + ph * 900, (1 - ph) * 0.8, 2 + (1 - ph) * 5); }
    if (glyphs) {
      const A = goldGlyphs(glyphs), cell = A.width / 8, R = 120 + age * 650, n = 26;
      ctx.globalAlpha = Math.min(1, rp.k * 1.6);
      for (let i = 0; i < n; i++) {
        const an = i / n * Math.PI * 2 + age * 0.8, s = scene.toScreen(rp.vx + Math.cos(an) * R, rp.vy + Math.sin(an) * R, h0, at);
        if (!s.front) continue;
        const sz = 14 + (1 - age) * 16, id = (i * 11 + 5) % 64;
        ctx.drawImage(A, (id % 8) * cell, Math.floor(id / 8) * cell, cell, cell, s.x - sz / 2, s.y - sz / 2, sz, sz);
      }
    }
    // 落点那一下的闪光
    const c = scene.toScreen(rp.vx, rp.vy, h0, at);
    if (c.front && age < 0.4) { const R = 60 + age * 300, g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R); g.addColorStop(0, 'rgba(255,240,200,0.9)'); g.addColorStop(1, 'rgba(255,160,60,0)'); ctx.globalAlpha = 1 - age / 0.4; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
const css = (c: readonly number[], a = 1) => `rgba(${Math.round(Math.min(1, c[0] * 0.85 + 0.15) * 255)},${Math.round(Math.min(1, c[1] * 0.85 + 0.15) * 255)},${Math.round(Math.min(1, c[2] * 0.85 + 0.15) * 255)},${a})`;

/**
 * 盖在画面上的那一层（画在最上面的界面画布上）：
 *   各界的名字——看得见的标在穹顶上方，看不见的在画面边上给个指向和距离（升到界壁之上才显示）；
 *   穿过界壁那一下的涟漪——几圈荡开的光环，带两环流转的符文（压扁成水平的膜）；
 *   在高空的顶上蓄势往上时，人物头顶一圈渐满的弧。
 * 没有遮幕、没有闪光：升降全程看得见。
 */
export function drawXukongOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, dpr: number, game: Game, scene: VoidScene | null, glyphs: HTMLCanvasElement | null): void {
  const xk: Xukong = game.xukong;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const cx = W / 2, cy = H / 2;
  // —— 各界的名字
  const fade = Math.max(0, Math.min(1, (xk.lift - 0.55) / 0.3));
  if (scene && xk.inVoid && fade > 0.01) {
    const far = xk.zoomUser > 4, list = xk.realms.filter((r) => r !== xk.over).slice(0, far ? 16 : 6), at = xk;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const placed: [number, number][] = [];
    const label = (r: Realm, x: number, y: number, withDist: boolean, alpha: number) => {
      // 两个名字挤在一起时，后一个往上挪
      for (let n = 0; n < 4 && placed.some((q) => Math.abs(q[0] - x) < 130 && Math.abs(q[1] - y) < 34); n++) y -= 38;
      placed.push([x, y]);
      const name = (r.region && !far ? r.region + '·' : '') + r.name;
      ctx.globalAlpha = alpha * fade;
      ctx.font = `${r === HOME ? 19 : 16}px ${FONT}`;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(6,6,20,0.85)'; ctx.strokeText(name, x, y);
      ctx.fillStyle = css(r.color); ctx.fillText(name, x, y);
      if (withDist) {
        const sub = `${REALM_KIND_NAME[r.kind]} · ${voidLi(realmDistance(r, at.x, at.y))}`;
        ctx.font = `12px ${FONT}`; ctx.lineWidth = 3; ctx.strokeText(sub, x, y + 17);
        ctx.fillStyle = 'rgba(214,220,236,0.92)'; ctx.fillText(sub, x, y + 17);
      }
    };
    const mx = 96, top = 118, bottom = 150, yaw = game.camYaw || 0;
    // 飞行平面那一层的东西：乱流、遗迹、遗骨、虚空兽
    if (xk.lift > 0.9) for (const t of xk.life.near) {
      const s = scene.toScreen(t.x, t.y, 0, at);
      if (!s.front || s.x < 40 || s.x > W - 40 || s.y < top * 0.6 || s.y > H - bottom * 0.5) continue;
      const hot = t.kind === 'beast' && t.hot, name = t.kind === 'beast' ? (hot ? '！ ' : '') + t.name : t.name + (t.done ? '（已探）' : '');
      ctx.globalAlpha = (t.done ? 0.5 : 0.92) * fade;
      ctx.font = `${hot ? 16 : 14}px ${FONT}`; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(6,6,20,0.85)';
      const y = s.y - (t.kind === 'storm' ? 0 : 26);
      ctx.strokeText(name, s.x, y);
      ctx.fillStyle = hot ? 'rgb(255,120,90)' : t.kind === 'storm' ? 'rgb(170,190,255)' : t.kind === 'beast' ? 'rgb(190,170,255)' : 'rgb(255,226,160)';
      ctx.fillText(name, s.x, y);
    }
    for (const r of list) {
      const s = scene.toScreen(r.x, r.y, -r.depth + r.dome, at);
      if (s.front && s.x > mx * 0.5 && s.x < W - mx * 0.5 && s.y > top * 0.6 && s.y < H - bottom * 0.5) { label(r, s.x, Math.max(top * 0.7, s.y - 22), !far, 0.95); continue; }
      if (far) continue;
      // 看不见的：沿着它的方向，在画面边上标出来
      const wx = r.x - at.x, wy = r.y - at.y;
      let dx = wx * Math.cos(yaw) + wy * Math.sin(yaw), dy = (-wx * Math.sin(yaw) + wy * Math.cos(yaw)) * Math.SQRT1_2; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const tx = dx > 0 ? (W - mx - cx) / dx : dx < 0 ? (mx - cx) / dx : Infinity, ty = dy > 0 ? (H - bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
      const t = Math.min(tx, ty), ex = cx + dx * t, ey = cy + dy * t;
      ctx.globalAlpha = 0.9 * fade; ctx.fillStyle = css(r.color);
      ctx.save(); ctx.translate(ex + dx * 44, ey + dy * 30); ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
      label(r, ex, ey - 6, true, 0.9);
    }
    ctx.globalAlpha = 1;
  }
  // 收官 E3：坠向下界的流星、穿界壁的符文涟漪
  if (scene && xk.inVoid) drawFall(ctx, W, H, game, scene, glyphs);
  // 蓄势往上：人物头顶一圈渐满的弧
  const push = xk.pushing;
  if (push > 0.04) {
    ctx.strokeStyle = `rgba(255,226,150,${0.5 + push * 0.45})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy - 150, 46, 25, 0, -Math.PI / 2, -Math.PI / 2 + push * Math.PI * 2); ctx.stroke();
  }
  // —— 穿过界壁的涟漪：往外穿时从人身上荡开，往里穿时向人聚拢
  const rp = xk.ripple;
  if (rp > 0.004) {
    const out = xk.rippleDir > 0, age = out ? 1 - rp : rp, env = Math.min(1, (1 - rp) * 4 + 0.1) * Math.min(1, rp * 2.5), R = Math.max(W, H) * 0.6;
    ctx.save(); ctx.translate(cx, cy - 40); ctx.scale(1, 0.5);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ph = (age * 1.2 + i * 0.2) % 1, r = (0.05 + ph * 0.95) * R;
      ctx.globalAlpha = (1 - ph) * env * 0.6; ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 2 + (1 - ph) * 5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    if (glyphs) {
      const A = goldGlyphs(glyphs), cell = A.width / 8;
      for (let ring = 0; ring < 2; ring++) {
        const n = ring ? 34 : 22, r = R * (ring ? 0.5 : 0.3) * (0.35 + age * 0.75), size = r * 2 * Math.PI / n * 0.82, spin = xk.clock * (ring ? -0.22 : 0.3);
        ctx.globalAlpha = env * (ring ? 0.7 : 0.9);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2 + spin, id = (i * 7 + ring * 19) % 64;
          ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r); ctx.rotate(a + Math.PI / 2);
          ctx.drawImage(A, (id % 8) * cell, Math.floor(id / 8) * cell, cell, cell, -size / 2, -size / 2, size, size); ctx.restore();
        }
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
