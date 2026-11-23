// 世界地图缩小以后：图外的地方和诸界。
//
// 地图本身按「这张图的宏观单位」画（一个宏观单位 = WORLD_SCALE 个界内单位）。缩到全图以下，外面一层按虚空坐标画
// （一个虚空单位 = VOID_SCALE 个界内单位，data/zhujie.ts），两种坐标之间只差一个平移和一个倍数：
//   人界的另外两张图、天穹草原、无边海 —— 用虚空里那张人界俯瞰图（world/xukongfx.ts 的 HomeMap，三张图拼起来、带人烟），
//                                        别的图的地形还没建过就先按海岸线垫底色，同时在后台分片建（每帧几毫秒），建好就补上；
//   人界的界壁 —— 浮陆的轮廓上一道淡金的光边，外面是虚空；
//   星域与三千界 —— 远的是一点色光，近了是一小团光晕，再近就是它的山河略图（和从虚空里看到的是同一张，hd2d/voidscene.ts 的 paintRealm），
//                  几档之间按屏幕上的大小交叉淡入，不会一下子从点跳成图。
// 名字撞上了就往下让一行，让不开才不画；界名在它的轮廓外沿正下方。
import type { Game } from '../world/game';
import { WORLD_SCALE, MAP_NAME, MAP_IDS, SEAM_DEPTH, SEA_DEPTH, type MapId } from '../data/world';
import { HOME, HOME_BOUNDS, HOME_RECTS, VOID_SCALE, REALM_KIND_NAME, starRegions, realmsNear, realmOutline, realmSketch, overRealm, pointToVoid, realmOfMap, realmDistance, voidLi, type Realm } from '../data/zhujie';
import { HomeMap } from '../world/xukongfx';
import { paintRealm } from '../hd2d/voidscene';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));

/** 地图那一边给的取景：宏观坐标 → 屏幕（CSS 像素） */
export interface MapView { X: (mx: number) => number; Y: (my: number) => number; k: number; W: number; H: number; cx: number; cy: number }

/** 人界里的几处大地名（大陆坐标）：三张图在各自矩形的正中，两片交界在交界的正中 */
const HOME_RECT_NAMES: { name: string; x: number; y: number; map?: MapId; sea?: boolean }[] = (() => {
  const tn = HOME_RECTS.tiannan, lx = HOME_RECTS.luanxing;
  const out: { name: string; x: number; y: number; map?: MapId; sea?: boolean }[] = MAP_IDS.map((m) => { const r = HOME_RECTS[m as keyof typeof HOME_RECTS]; return { name: MAP_NAME[m], x: r.x + r.w / 2, y: r.y + r.h / 2, map: m }; });
  out.push({ name: '天穹草原', x: tn.w * 0.6, y: -SEAM_DEPTH / 2 });
  out.push({ name: '无边海', x: tn.w + SEA_DEPTH / 2, y: Math.max(0, lx.y) + Math.min(tn.h, lx.y + lx.h) / 2 - Math.max(0, lx.y) / 2, sea: true });
  return out;
})();

let homeMap: HomeMap | null = null;
const realmImgs = new Map<number, { cv: HTMLCanvasElement; used: number }>();
let starTile: HTMLCanvasElement | null = null;

/** 虚空的底：深靛色，散着几点金色的星尘（一块 256 见方的贴片，随取景慢慢移，像隔得很远） */
function stars(): HTMLCanvasElement {
  if (starTile) return starTile;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  let s = 7; const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = rnd() < 0.85 ? 0.6 : 1.2, a = 0.15 + rnd() * 0.45;
    g.fillStyle = rnd() < 0.7 ? `rgba(232,206,140,${a})` : `rgba(170,200,230,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  return starTile = c;
}

/** 一界的轮廓（屏幕坐标的路径）：人界是圆角的方形，别界是有几处起伏的椭圆 */
function outlinePath(g: G, r: Realm, sx: number, sy: number, prx: number, pry: number, n = 64) {
  g.beginPath();
  for (let i = 0; i <= n; i++) { const th = (i / n) * TAU, q = realmOutline(r, th); const x = sx + Math.cos(th) * prx * q, y = sy + Math.sin(th) * pry * q; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath();
}

export class OuterMap {
  /** 这张图的原点在虚空里的哪儿；一个宏观单位合多少虚空单位 */
  private ax: number; private ay: number; private readonly s = WORLD_SCALE / VOID_SCALE;
  /** 诸界的外接范围（虚空坐标） */
  readonly bounds: { x0: number; y0: number; x1: number; y1: number };
  private frame = 0;
  constructor(private readonly game: Game, private readonly map: MapId) {
    const o = pointToVoid(map, 0, 0); this.ax = o.x; this.ay = o.y;
    let x0 = HOME.x - HOME.rx, x1 = HOME.x + HOME.rx, y0 = HOME.y - HOME.ry, y1 = HOME.y + HOME.ry;
    for (const R of starRegions()) { x0 = Math.min(x0, R.x - R.radius); x1 = Math.max(x1, R.x + R.radius); y0 = Math.min(y0, R.y - R.radius); y1 = Math.max(y1, R.y + R.radius); }
    this.bounds = { x0, y0, x1, y1 };
  }
  /** 虚空坐标 ↔ 这张图的宏观坐标 */
  mx(vx: number) { return (vx - this.ax) / this.s; }
  my(vy: number) { return (vy - this.ay) / this.s; }
  vx(mx: number) { return this.ax + mx * this.s; }
  vy(my: number) { return this.ay + my * this.s; }
  /** 缩到最小时整个诸界刚好装进画面：这是地图倍数的下限（macroW 是这张图的宏观宽度） */
  zMin(macroW: number, macroH: number) {
    const b = this.bounds, w = (b.x1 - b.x0) / this.s, h = (b.y1 - b.y0) / this.s;
    return Math.min(macroW / w, macroH / h) * 0.92;
  }
  /** 「看这一界」的倍数：人界（或你所在的别界）整个装进画面 */
  zRealm(macroW: number, macroH: number) {
    const r = realmOfMap(this.map), w = (r.rx * 2) / this.s, h = (r.ry * 2) / this.s;
    return Math.min(macroW / w, macroH / h) * 0.86;
  }
  /** 现在大约是哪一级取景（给按钮旁的字） */
  scaleName(pxPerVoid: number) {
    const home = realmOfMap(this.map), R = home.rx * pxPerVoid;
    return R > 260 ? (home === HOME ? '人界' : home.name) : R > 18 ? '星域' : '诸界';
  }
  /** 指针下是哪一界（虚空坐标） */
  pick(vx: number, vy: number, pxPerVoid: number): Realm | null {
    const near = realmsNear(vx, vy, 8 / pxPerVoid);
    for (const r of near) if (overRealm(r, vx, vy, 1) || Math.hypot(r.x - vx, r.y - vy) < 8 / pxPerVoid) return r;
    return null;
  }
  /** 一界的悬浮说明 */
  describe(r: Realm): string {
    const here = realmOfMap(this.map), p = this.game.player, me = pointToVoid(this.map, p.x, p.y);
    const kind = r === HOME ? '苏寒的故乡：南荒、中州、沧溟海三处大地，四周是海' : `${REALM_KIND_NAME[r.kind]} · ${r.region}`;
    const dist = r === here ? '你在此界' : `离你 ${voidLi(realmDistance(r, me.x, me.y))}`;
    return `${r.name}　${kind}　·　${dist}`;
  }

  /** 画外面那一层（在地图本身之前画）。Z 是地图倍数（1 = 全图） */
  draw(g: G, v: MapView, t: number) {
    this.frame++;
    const k = v.k, ppv = k / this.s;   // 屏幕像素 / 虚空单位
    const SX = (vx: number) => v.X(this.mx(vx)), SY = (vy: number) => v.Y(this.my(vy));
    const vcx = this.vx(v.cx), vcy = this.vy(v.cy), halfV = Math.hypot(v.W, v.H) / 2 / ppv;
    // 1. 虚空
    g.fillStyle = '#141a26'; g.fillRect(0, 0, v.W, v.H);
    {
      const tile = stars(), pat = g.createPattern(tile, 'repeat');
      if (pat) {
        const ox = -(vcx * ppv * 0.04) % 256, oy = -(vcy * ppv * 0.04) % 256;
        pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
        g.globalAlpha = 0.9; g.fillStyle = pat; g.fillRect(0, 0, v.W, v.H); g.globalAlpha = 1;
      }
      // 一层极淡的星云：靠着人界那一侧暖一点
      const hx = SX(HOME.x), hy = SY(HOME.y), hr = Math.max(v.W, HOME.rx * ppv * 3);
      const neb = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
      neb.addColorStop(0, 'rgba(90,70,60,0.35)'); neb.addColorStop(1, 'rgba(20,26,38,0)');
      g.fillStyle = neb; g.fillRect(0, 0, v.W, v.H);
    }
    // 2. 星域：一圈极淡的虚线和名字（太远太小、或者大过画面的不画）
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const placed: [number, number, number, number][] = [];
    const place = (x: number, y: number, w: number, h: number, tries = 3) => {
      for (let i = 0; i < tries; i++) {
        const b: [number, number, number, number] = [x - w / 2, y - h / 2 + i * h, w, h];
        if (!placed.some((q) => b[0] < q[0] + q[2] && b[0] + b[2] > q[0] && b[1] < q[1] + q[3] && b[1] + b[3] > q[1])) { placed.push(b); return b[1] + h / 2; }
      }
      return NaN;
    };
    for (const R of starRegions()) {
      const rr = R.radius * ppv, x = SX(R.x), y = SY(R.y);
      if (rr < 14 || rr > v.W * 3 || x + rr < 0 || x - rr > v.W || y + rr < 0 || y - rr > v.H) continue;
      const a = ramp(rr, 14, 40) * (1 - ramp(rr, v.W * 0.9, v.W * 2.4));
      g.strokeStyle = `rgba(214,188,130,${0.22 * a})`; g.lineWidth = 1; g.setLineDash([3, 6]);
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); g.setLineDash([]);
      const fs = Math.max(13, Math.min(30, rr * 0.16));
      g.font = `${fs}px 'Ma Shan Zheng', serif`;
      const ly = place(x, y - rr - fs * 0.9, g.measureText(R.name).width + 8, fs + 4, 1);
      if (!isNaN(ly)) { g.fillStyle = `rgba(226,204,150,${0.6 * a})`; g.fillText(R.name.split('').join(' '), x, ly); }
    }
    // 3. 诸界（人界另画）
    const here = realmOfMap(this.map);
    let budget = 1;   // 每帧最多现画一界的山河略图（一张几毫秒）
    const list = realmsNear(vcx, vcy, halfV + 6000);
    const labels: { r: Realm; x: number; y: number; R: number }[] = [];
    for (const r of list) {
      if (r === HOME) continue;
      const x = SX(r.x), y = SY(r.y), R = r.rx * ppv, Ry = r.ry * ppv;
      if (x + R < -4 || x - R > v.W + 4 || y + Ry < -4 || y - Ry > v.H + 4) continue;
      const [cr, cg, cb] = r.color;
      // 远看是一点光：样貌的颜色往暖白里调一半，深色的幽冥、炎墟在深底上才不会成了黑点
      if (R < 1.4) { g.fillStyle = `rgba(${(cr + 236) / 2 | 0},${(cg + 222) / 2 | 0},${(cb + 190) / 2 | 0},0.9)`; g.fillRect(x - 1, y - 1, 2, 2); continue; }
      // 光晕（远时它就是这一界）
      const glowA = 1 - ramp(R, 16, 40);
      if (glowA > 0.01) {
        const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(3, R * 1.6));
        gr.addColorStop(0, `rgba(${(cr + 236) / 2 | 0},${(cg + 222) / 2 | 0},${(cb + 190) / 2 | 0},${0.95 * glowA})`); gr.addColorStop(0.45, `rgba(${cr | 0},${cg | 0},${cb | 0},${0.45 * glowA})`); gr.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(3, R * 1.6), 0, TAU); g.fill();
      }
      // 山河略图（近时）
      const imgA = ramp(R, 12, 30);
      if (imgA > 0.01 && r !== here) {
        let im = realmImgs.get(r.index);
        if (!im && budget > 0) { budget--; im = { cv: paintRealm(r, realmSketch(r)), used: this.frame }; realmImgs.set(r.index, im); if (realmImgs.size > 48) { let old = -1, ou = Infinity; for (const [i, q] of realmImgs) if (q.used < ou) { ou = q.used; old = i; } realmImgs.delete(old); } }
        if (im) {
          im.used = this.frame;
          g.save(); outlinePath(g, r, x, y, R, Ry); g.clip(); g.globalAlpha = imgA;
          g.imageSmoothingEnabled = true; g.drawImage(im.cv, x - R, y - Ry, R * 2, Ry * 2); g.restore();
        }
      }
      // 界壁：轮廓上一道淡淡的光边
      if (R > 5) { g.strokeStyle = `rgba(${Math.min(255, cr + 80) | 0},${Math.min(255, cg + 80) | 0},${Math.min(255, cb + 80) | 0},${0.55 * ramp(R, 5, 14)})`; g.lineWidth = R > 40 ? 2 : 1; outlinePath(g, r, x, y, R * 1.02, Ry * 1.02, R > 40 ? 64 : 24); g.stroke(); }
      if (R > 3.5) labels.push({ r, x, y, R: Ry });
    }
    // 4. 人界：三张图拼成的俯瞰图，裁成浮陆的轮廓；外沿一道界壁
    {
      const x = SX(HOME.x), y = SY(HOME.y), R = HOME.rx * ppv, Ry = HOME.ry * ppv;
      if (x + R > 0 && x - R < v.W && y + Ry > 0 && y - Ry < v.H) {
        if (R > 6) {
          homeMap ??= new HomeMap();
          homeMap.update(9);   // 图外现算、别的图没建过就在后台分片建（开着地图时游戏停着，预算给大些），好了就补上
          const B = HOME_BOUNDS, bx = (B.x0 - B.cx) / VOID_SCALE, by = (B.y0 - B.cy) / VOID_SCALE, bw = (B.x1 - B.x0) / VOID_SCALE, bh = (B.y1 - B.y0) / VOID_SCALE;
          g.save(); outlinePath(g, HOME, x, y, R, Ry); g.clip();
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(homeMap.canvas, SX(bx), SY(by), bw * ppv, bh * ppv);
          g.restore();
        } else { g.fillStyle = 'rgb(216,190,130)'; g.beginPath(); g.arc(x, y, Math.max(2, R), 0, TAU); g.fill(); }
        // 界壁：一道细细的光边，向外晕开（不描粗线，免得像一圈画框）
        const wallA = 0.5 + 0.12 * Math.sin(t / 900);
        g.save(); g.shadowColor = 'rgba(240,220,160,0.9)'; g.shadowBlur = Math.max(4, Math.min(18, R * 0.03));
        g.strokeStyle = `rgba(250,236,196,${wallA})`; g.lineWidth = 1.2; outlinePath(g, HOME, x, y, R, Ry); g.stroke(); g.restore();
        // 三张图和两片交界的名字：人界在画面里大小合适时
        const nameA = ramp(R, 120, 220) * (1 - ramp(R, v.W * 2.2, v.W * 4));
        if (nameA > 0.02) {
          g.font = `${Math.max(16, Math.min(34, R * 0.07))}px 'Ma Shan Zheng', serif`;
          for (const q of HOME_RECT_NAMES) {
            const qx = SX((q.x - HOME_BOUNDS.cx) / VOID_SCALE), qy = SY((q.y - HOME_BOUNDS.cy) / VOID_SCALE);
            if (q.map === this.map) continue;   // 自己这张图有自己的大字
            g.lineWidth = 4; g.strokeStyle = `rgba(30,26,20,${0.55 * nameA})`; g.strokeText(q.name, qx, qy);
            g.fillStyle = q.sea ? `rgba(220,236,240,${0.85 * nameA})` : `rgba(250,240,214,${0.92 * nameA})`; g.fillText(q.name, qx, qy);
          }
        }
        if (R < v.W * 0.9) labels.unshift({ r: HOME, x, y, R: Ry });
      }
    }
    // 5. 界名：轮廓正下方，撞了往下让
    for (const L of labels) {
      const fs = L.r === HOME ? 18 : Math.max(11, Math.min(16, 9 + L.R * 0.08));
      g.font = `${fs}px 'Noto Serif SC', serif`;
      const name = L.r === HOME ? '人 界' : L.r.name, w = g.measureText(name).width + 8;
      const ly = place(L.x, L.y + L.R + fs * 0.9, w, fs + 4);
      if (isNaN(ly)) continue;
      g.fillStyle = L.r === here ? 'rgba(255,226,160,0.95)' : 'rgba(222,214,196,0.82)';
      g.fillText(name, L.x, ly);
    }
  }
}
