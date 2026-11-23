// 1–12 阶人物脚底境界法阵：按各境界修行核心单独设计造型与动态（非简单换色圆环）
// 每个境界拆分为「底盘层 base（主阵纹/外廓）」与「动纹层 spin（逆转副纹/星轨/花瓣）」，
// 并叠加从脚底阵缘向身旁两侧升腾的光效灵烟与流光气丝；随「敛息 → 正常 → 外放」呈现「虚 → 半实 → 全实」层次递进。
import type { GLStage } from './stage';
import { type FxSys, type RGB, mixc, smokeCell, extOK } from './fx';
import { C } from './atlas';
import { LD_FIVE } from '../world/lingdun';

const TAU = Math.PI * 2;
const SZ = 512, HALF = SZ / 2;

export interface FootTex {
  base: HTMLCanvasElement;
  spin: HTMLCanvasElement;
  col: RGB;
  r: number;        // 世界基础半径（未压扁）
  rotA: number;     // base 转速 (rad/s)
  rotB: number;     // spin 转速 (rad/s)
}

const CACHE = new Map<number, FootTex>();

const COL: RGB[] = [
  [0.65, 0.65, 0.60], // 0 凡人
  [0.46, 0.88, 0.74], // 1 炼气：青岚水墨
  [0.34, 0.85, 0.90], // 2 筑基：青玉方基
  [0.98, 0.72, 0.28], // 3 结丹：三昧丹鼎
  [0.74, 0.52, 0.98], // 4 元婴：紫府太极
  [0.98, 0.78, 0.42], // 5 化神：五行宝莲
  [0.95, 0.65, 0.28], // 6 炼虚：太虚星轨
  [0.28, 0.92, 0.78], // 7 合体：万象法轮
  [0.72, 0.46, 1.00], // 8 大乘：紫霄劫雷
  [0.48, 0.84, 1.00], // 9 真仙：仙澜玉莲
  [0.24, 0.92, 0.92], // 10 玄仙：九宫星宿
  [1.00, 0.82, 0.26], // 11 金仙：太乙日轮
  [1.00, 0.93, 0.62], // 12 大罗：混沌无极
];

const RADIUS = [0, 38, 48, 56, 65, 74, 82, 88, 95, 100, 106, 112, 120];
const ROT_A =  [0,  0.22,  0.14,  0.20, -0.18,  0.16,  0.24,  0.26,  0.30,  0.18,  0.14,  0.22,  0.18];
const ROT_B =  [0, -0.34, -0.22, -0.35,  0.28, -0.26, -0.38, -0.40, -0.46, -0.28, -0.24, -0.34, -0.30];

function mkCv(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = SZ; cv.height = SZ;
  const g = cv.getContext('2d')!;
  g.translate(HALF, HALF);
  return [cv, g];
}

function rgbStr(c: RGB, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

/** 绘制标准多边形顶点 */
function poly(g: CanvasRenderingContext2D, n: number, r: number, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

/** 绘制尖瓣莲花 */
function drawLotus(g: CanvasRenderingContext2D, petals: number, rIn: number, rOut: number, rot: number, stroke: string, fill: string, lw = 2.4) {
  g.save();
  g.rotate(rot);
  for (let i = 0; i < petals; i++) {
    g.save();
    g.rotate((i / petals) * TAU);
    g.beginPath();
    g.moveTo(0, -rIn);
    g.quadraticCurveTo(rOut * 0.24, -(rIn + rOut) * 0.55, 0, -rOut);
    g.quadraticCurveTo(-rOut * 0.24, -(rIn + rOut) * 0.55, 0, -rIn);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    g.strokeStyle = stroke; g.lineWidth = lw; g.stroke();
    g.restore();
  }
  g.restore();
}

/** 构造第 realm 阶的专属脚底双层阵纹 */
function buildRealmFoot(realm: number): FootTex {
  const r = Math.max(0, Math.min(12, realm | 0));
  const c = COL[r];
  const main = rgbStr(c, 0.92);
  const soft = rgbStr(c, 0.36);
  const bright = 'rgba(255,248,225,0.92)';
  const [base, gb] = mkCv();
  const [spin, gs] = mkCv();

  // 轻微暗墨底托（确保在亮色地面同样锐利）
  if (r >= 1) {
    const bg = gb.createRadialGradient(0, 0, 24, 0, 0, 238);
    bg.addColorStop(0, 'rgba(8,12,16,0.06)');
    bg.addColorStop(0.75, 'rgba(8,12,16,0.22)');
    bg.addColorStop(1, 'rgba(8,12,16,0)');
    gb.fillStyle = bg; gb.beginPath(); gb.arc(0, 0, 238, 0, TAU); gb.fill();
  }

  // —— 1 炼气：清岚水墨三道游气弧（不画硬框，突出“气感”）
  if (r === 1) {
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU;
      const gr = gb.createLinearGradient(Math.cos(a0) * 180, Math.sin(a0) * 180, Math.cos(a0 + 1.5) * 180, Math.sin(a0 + 1.5) * 180);
      gr.addColorStop(0, rgbStr(c, 0)); gr.addColorStop(0.45, rgbStr(c, 0.85)); gr.addColorStop(1, rgbStr(c, 0.05));
      gb.strokeStyle = gr; gb.lineWidth = 5.5; gb.lineCap = 'round';
      gb.beginPath(); gb.arc(0, 0, 178 + (i % 2) * 14, a0, a0 + 1.55); gb.stroke();
    }
    gs.strokeStyle = soft; gs.lineWidth = 2; gs.setLineDash([12, 18]);
    gs.beginPath(); gs.arc(0, 0, 134, 0, TAU); gs.stroke();
  }

  // —— 2 筑基：外圆内方（道基稳固：青玉双环 + 旋转方璧 + 四象玉钉）
  else if (r === 2) {
    gb.strokeStyle = main; gb.lineWidth = 3.2;
    gb.beginPath(); gb.arc(0, 0, 204, 0, TAU); gb.stroke();
    gb.strokeStyle = soft; gb.lineWidth = 1.6;
    gb.beginPath(); gb.arc(0, 0, 188, 0, TAU); gb.stroke();
    // 内方璧
    gs.strokeStyle = main; gs.lineWidth = 3.2;
    poly(gs, 4, 152, Math.PI / 4); gs.stroke();
    gs.strokeStyle = bright; gs.lineWidth = 1.6;
    poly(gs, 4, 128, Math.PI / 4); gs.stroke();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * TAU) / 4;
      const x = Math.cos(a) * 152, y = Math.sin(a) * 152;
      gs.fillStyle = bright; gs.beginPath(); gs.arc(x, y, 6.5, 0, TAU); gs.fill();
      gs.strokeStyle = main; gs.lineWidth = 2; gs.stroke();
    }
  }

  // —— 3 结丹：三昧丹鼎三角阵 + 十二地支金篆刻盘
  else if (r === 3) {
    gb.strokeStyle = main; gb.lineWidth = 3.5;
    gb.beginPath(); gb.arc(0, 0, 212, 0, TAU); gb.stroke();
    gb.beginPath(); gb.arc(0, 0, 184, 0, TAU); gb.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      gb.strokeStyle = i % 3 === 0 ? bright : main; gb.lineWidth = i % 3 === 0 ? 3.6 : 2;
      gb.beginPath(); gb.moveTo(Math.cos(a) * 184, Math.sin(a) * 184); gb.lineTo(Math.cos(a) * 212, Math.sin(a) * 212); gb.stroke();
    }
    // 双逆向丹鼎三角（六芒金鼎）
    gs.strokeStyle = bright; gs.lineWidth = 2.8;
    poly(gs, 3, 174, -Math.PI / 2); gs.stroke();
    gs.strokeStyle = main; gs.lineWidth = 2.4;
    poly(gs, 3, 174, Math.PI / 2); gs.stroke();
    // 三鼎足丹火圈
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 3;
      gs.fillStyle = 'rgba(255,140,55,0.65)';
      gs.beginPath(); gs.arc(Math.cos(a) * 174, Math.sin(a) * 174, 10, 0, TAU); gs.fill();
      gs.fillStyle = bright; gs.beginPath(); gs.arc(Math.cos(a) * 174, Math.sin(a) * 174, 4, 0, TAU); gs.fill();
    }
  }

  // —— 4 元婴：紫府先天太极双鱼 + 八卦断续卦爻
  else if (r === 4) {
    // 外八卦盘
    gb.strokeStyle = main; gb.lineWidth = 2.6;
    gb.beginPath(); gb.arc(0, 0, 218, 0, TAU); gb.stroke();
    gb.beginPath(); gb.arc(0, 0, 152, 0, TAU); gb.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      gb.save(); gb.rotate(a);
      for (let k = 0; k < 3; k++) {
        const rr = 166 + k * 14;
        const broken = ((i >> k) & 1) === 1;
        gb.strokeStyle = k === 1 ? bright : main; gb.lineWidth = 4.2;
        if (broken) {
          gb.beginPath(); gb.arc(0, 0, rr, -0.24, -0.05); gb.stroke();
          gb.beginPath(); gb.arc(0, 0, rr, 0.05, 0.24); gb.stroke();
        } else {
          gb.beginPath(); gb.arc(0, 0, rr, -0.24, 0.24); gb.stroke();
        }
      }
      gb.restore();
    }
    // 中心手绘阴阳鱼轮廓（通透不涂死，留出站脚空间）
    const TR = 132;
    gs.strokeStyle = bright; gs.lineWidth = 2.8;
    gs.beginPath(); gs.arc(0, 0, TR, 0, TAU); gs.stroke();
    gs.fillStyle = 'rgba(180,120,255,0.18)';
    gs.beginPath();
    gs.arc(0, 0, TR, -Math.PI / 2, Math.PI / 2);
    gs.arc(0, TR / 2, TR / 2, Math.PI / 2, -Math.PI / 2, true);
    gs.arc(0, -TR / 2, TR / 2, Math.PI / 2, -Math.PI / 2);
    gs.fill();
    gs.strokeStyle = main; gs.lineWidth = 2.5;
    gs.beginPath();
    gs.arc(0, -TR / 2, TR / 2, -Math.PI / 2, Math.PI / 2);
    gs.arc(0, TR / 2, TR / 2, -Math.PI / 2, Math.PI / 2, true);
    gs.stroke();
    // 阴阳鱼眼
    gs.fillStyle = bright; gs.beginPath(); gs.arc(0, -TR / 2, 11, 0, TAU); gs.fill();
    gs.strokeStyle = main; gs.lineWidth = 3; gs.beginPath(); gs.arc(0, TR / 2, 11, 0, TAU); gs.stroke();
  }

  // —— 5 化神：五行相生五色宝莲（金木水火土五瓣花 + 五芒连线）
  else if (r === 5) {
    gb.strokeStyle = main; gb.lineWidth = 2.6;
    gb.beginPath(); gb.arc(0, 0, 214, 0, TAU); gb.stroke();
    // 五芒星连线
    gb.strokeStyle = soft; gb.lineWidth = 2.2;
    gb.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + ((i * 2) % 5) * (TAU / 5);
      const px = Math.cos(a) * 204, py = Math.sin(a) * 204;
      if (i === 0) gb.moveTo(px, py); else gb.lineTo(px, py);
    }
    gb.stroke();
    // 五片各呈五行真色的莲瓣
    for (let i = 0; i < 5; i++) {
      const c5 = LD_FIVE[i];
      gs.save(); gs.rotate((i / 5) * TAU);
      gs.beginPath();
      gs.moveTo(0, -56);
      gs.quadraticCurveTo(64, -138, 0, -206);
      gs.quadraticCurveTo(-64, -138, 0, -56);
      gs.closePath();
      gs.fillStyle = `rgba(${c5},0.22)`; gs.fill();
      gs.strokeStyle = `rgba(${c5},0.92)`; gs.lineWidth = 3; gs.stroke();
      gs.restore();
    }
    gs.strokeStyle = bright; gs.lineWidth = 2;
    gs.beginPath(); gs.arc(0, 0, 62, 0, TAU); gs.stroke();
  }

  // —— 6 炼虚：太虚裂隙交叉空间星轨（非传统对称圆盘，3 道交叉椭圆轨道 + 四方空间锚角）
  else if (r === 6) {
    // 三重交错空间轨道
    for (let i = 0; i < 3; i++) {
      gb.save(); gb.rotate((i * Math.PI) / 3);
      gb.strokeStyle = i === 0 ? bright : main; gb.lineWidth = 2.6;
      gb.beginPath(); gb.ellipse(0, 0, 218, 108, 0, 0, TAU); gb.stroke();
      gb.restore();
    }
    // 四方空间折角锚标 ⌜ ⌝ ⌞ ⌟
    for (let i = 0; i < 4; i++) {
      gs.save(); gs.rotate(Math.PI / 4 + (i * TAU) / 4);
      gs.strokeStyle = bright; gs.lineWidth = 3.5;
      gs.beginPath(); gs.moveTo(-22, -195); gs.lineTo(0, -212); gs.lineTo(22, -195); gs.stroke();
      gs.restore();
    }
    // 中心太虚黑洞细裂纹环
    gs.strokeStyle = main; gs.lineWidth = 2; gs.setLineDash([16, 10]);
    gs.beginPath(); gs.arc(0, 0, 96, 0, TAU); gs.stroke();
    gs.setLineDash([]);
  }

  // —— 7 合体：万象双生神戟莲轮（八方玉戟外刺 + 内外互锁齿莲）
  else if (r === 7) {
    gb.strokeStyle = main; gb.lineWidth = 3.2;
    gb.beginPath(); gb.arc(0, 0, 192, 0, TAU); gb.stroke();
    // 八方神戟锐刺（突出法相锋芒）
    for (let i = 0; i < 8; i++) {
      gb.save(); gb.rotate((i / 8) * TAU);
      gb.beginPath();
      gb.moveTo(-11, -182); gb.lineTo(0, -234); gb.lineTo(11, -182); gb.closePath();
      gb.fillStyle = rgbStr(c, 0.25); gb.fill();
      gb.strokeStyle = bright; gb.lineWidth = 2.2; gb.stroke();
      gb.restore();
    }
    // 逆转八角双框
    gs.strokeStyle = main; gs.lineWidth = 2.6;
    poly(gs, 4, 170, 0); gs.stroke();
    poly(gs, 4, 170, Math.PI / 4); gs.stroke();
    drawLotus(gs, 8, 52, 134, 0, bright, rgbStr(c, 0.14), 2.2);
  }

  // —— 8 大乘：紫霄天劫雷霆盘（九道锯齿闪电环 + 九座镇劫雷柱 + 六芒封劫印）
  else if (r === 8) {
    gb.strokeStyle = main; gb.lineWidth = 3;
    gb.beginPath(); gb.arc(0, 0, 214, 0, TAU); gb.stroke();
    // 锯齿劫雷外环
    gb.strokeStyle = bright; gb.lineWidth = 2.8;
    gb.beginPath();
    const N = 36;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const rr = i % 2 === 0 ? 226 : 196;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) gb.moveTo(px, py); else gb.lineTo(px, py);
    }
    gb.closePath(); gb.stroke();
    // 九座劫柱标记
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      gb.fillStyle = bright; gb.beginPath(); gb.arc(Math.cos(a) * 182, Math.sin(a) * 182, 5.5, 0, TAU); gb.fill();
    }
    // 封劫六芒星阵
    gs.strokeStyle = main; gs.lineWidth = 3;
    poly(gs, 3, 166, -Math.PI / 2); gs.stroke();
    poly(gs, 3, 166, Math.PI / 2); gs.stroke();
    gs.strokeStyle = bright; gs.lineWidth = 1.8;
    gs.beginPath(); gb.arc(0, 0, 92, 0, TAU); gs.beginPath(); gs.arc(0, 0, 92, 0, TAU); gs.stroke();
  }

  // —— 9 真仙：仙澜玉莲祥云阵（天青月白：流水云纹外圈 + 十二瓣晶莹仙莲）
  else if (r === 9) {
    gb.strokeStyle = main; gb.lineWidth = 2.6;
    gb.beginPath(); gb.arc(0, 0, 216, 0, TAU); gb.stroke();
    gb.strokeStyle = bright; gb.lineWidth = 2;
    gb.beginPath(); gb.arc(0, 0, 200, 0, TAU); gb.stroke();
    // 六朵卷云祥纹沿外圈舒展
    for (let i = 0; i < 6; i++) {
      gb.save(); gb.rotate((i / 6) * TAU);
      gb.strokeStyle = bright; gb.lineWidth = 3;
      gb.beginPath(); gb.arc(0, -198, 22, Math.PI * 1.1, Math.PI * 1.9); gb.stroke();
      gb.beginPath(); gb.arc(-20, -194, 12, Math.PI * 0.9, Math.PI * 1.85); gb.stroke();
      gb.restore();
    }
    drawLotus(gs, 12, 58, 178, 0, bright, 'rgba(195,242,255,0.16)', 2.2);
    gs.strokeStyle = main; gs.lineWidth = 2;
    gs.beginPath(); gs.arc(0, 0, 62, 0, TAU); gs.stroke();
  }

  // —— 10 玄仙：九宫洛书星宿盘（九宫方阵网格 + 四象二十八宿连星）
  else if (r === 10) {
    gb.strokeStyle = main; gb.lineWidth = 3.2;
    gb.beginPath(); gb.arc(0, 0, 220, 0, TAU); gb.stroke();
    gb.strokeStyle = soft; gb.lineWidth = 1.8;
    gb.beginPath(); gb.arc(0, 0, 178, 0, TAU); gb.stroke();
    // 四象星宿连线（4 组 7 星拱卫外环）
    for (let q = 0; q < 4; q++) {
      gb.save(); gb.rotate((q * TAU) / 4);
      gb.strokeStyle = bright; gb.lineWidth = 1.8;
      gb.beginPath();
      for (let s = 0; s < 5; s++) {
        const a = -0.36 + s * 0.18;
        const sr = 192 + (s % 2 ? 14 : -4);
        const sx = Math.cos(a) * sr, sy = Math.sin(a) * sr;
        if (s === 0) gb.moveTo(sx, sy); else gb.lineTo(sx, sy);
      }
      gb.stroke();
      for (let s = 0; s < 5; s++) {
        const a = -0.36 + s * 0.18, sr = 192 + (s % 2 ? 14 : -4);
        gb.fillStyle = bright; gb.beginPath(); gb.arc(Math.cos(a) * sr, Math.sin(a) * sr, 4.2, 0, TAU); gb.fill();
      }
      gb.restore();
    }
    // 九宫洛书方格阵
    gs.strokeStyle = main; gs.lineWidth = 2.4;
    const L = 114;
    gs.strokeRect(-L, -L, L * 2, L * 2);
    for (const k of [-L / 3, L / 3]) {
      gs.beginPath(); gs.moveTo(k, -L); gs.lineTo(k, L); gs.moveTo(-L, k); gs.lineTo(L, k); gs.stroke();
    }
    gs.strokeStyle = bright; gs.lineWidth = 2;
    poly(gs, 8, 152, Math.PI / 8); gs.stroke();
  }

  // —— 11 金仙：太乙大日金轮阵（十二道锋锐日芒金刺 + 双重黄金神莲）
  else if (r === 11) {
    // 十二道大日神芒（外廓极具辨识度）
    for (let i = 0; i < 12; i++) {
      gb.save(); gb.rotate((i / 12) * TAU);
      gb.beginPath();
      gb.moveTo(-12, -168); gb.lineTo(0, -238); gb.lineTo(12, -168); gb.closePath();
      gb.fillStyle = i % 2 === 0 ? 'rgba(255,215,90,0.34)' : 'rgba(255,245,195,0.22)'; gb.fill();
      gb.strokeStyle = bright; gb.lineWidth = 2; gb.stroke();
      gb.restore();
    }
    gb.strokeStyle = main; gb.lineWidth = 3.5;
    gb.beginPath(); gb.arc(0, 0, 174, 0, TAU); gb.stroke();
    drawLotus(gs, 12, 54, 154, 0, bright, 'rgba(255,220,100,0.18)', 2.4);
    drawLotus(gs, 6, 44, 114, Math.PI / 6, main, '', 2.2);
    gs.strokeStyle = bright; gs.lineWidth = 2.4;
    gs.beginPath(); gs.arc(0, 0, 56, 0, TAU); gs.stroke();
  }

  // —— 12 大罗：混沌无极大道盘（玄墨裂金外环 + 周天星刻 + 十二品大道白金莲 + 太初旋涡）
  else if (r === 12) {
    // 外圈玄金混沌环（深墨金边反差极大）
    gb.strokeStyle = 'rgba(22,18,14,0.85)'; gb.lineWidth = 18;
    gb.beginPath(); gb.arc(0, 0, 212, 0, TAU); gb.stroke();
    gb.strokeStyle = bright; gb.lineWidth = 3.2;
    gb.beginPath(); gb.arc(0, 0, 222, 0, TAU); gb.stroke();
    gb.strokeStyle = main; gb.lineWidth = 2.4;
    gb.beginPath(); gb.arc(0, 0, 202, 0, TAU); gb.stroke();
    // 36 道周天金刻 + 12 大道星点
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      gb.strokeStyle = i % 3 === 0 ? bright : main; gb.lineWidth = i % 3 === 0 ? 3.2 : 1.5;
      gb.beginPath(); gb.moveTo(Math.cos(a) * 192, Math.sin(a) * 192); gb.lineTo(Math.cos(a) * 224, Math.sin(a) * 224); gb.stroke();
    }
    // 逆转十二品混沌道莲 + 三道太初旋臂
    drawLotus(gs, 12, 62, 184, 0, bright, 'rgba(255,244,200,0.16)', 2.4);
    for (let i = 0; i < 3; i++) {
      gs.save(); gs.rotate((i / 3) * TAU);
      gs.strokeStyle = main; gs.lineWidth = 2.6;
      gs.beginPath(); gs.arc(46, 0, 46, 0, Math.PI * 1.15); gs.stroke();
      gs.restore();
    }
    gs.strokeStyle = bright; gs.lineWidth = 2.5;
    gs.beginPath(); gs.arc(0, 0, 60, 0, TAU); gs.stroke();
  }

  const res: FootTex = { base, spin, col: c, r: RADIUS[r], rotA: ROT_A[r], rotB: ROT_B[r] };
  CACHE.set(r, res);
  return res;
}

export function getRealmFoot(realm: number): FootTex {
  const r = Math.max(0, Math.min(12, realm | 0));
  return CACHE.get(r) ?? buildRealmFoot(r);
}

export interface FootStateOpts {
  concealed: boolean;
  burst?: boolean;
  sitting: boolean;
  flying: boolean;
}

/** WebGL 脚底境界法阵 + 身旁升腾光效烟雾（敛息虚 → 正常半实 → 外放全实） */
export function drawRealmFootGL(F: FxSys, S: GLStage, x: number, y: number, realmIn: number, t: number, dt: number, opts: FootStateOpts) {
  const r = Math.max(0, Math.min(12, realmIn | 0));
  if (r <= 0) return;
  const ft = getRealmFoot(r);
  const sq = 0.44;
  const burst = !!opts.burst && !opts.concealed;
  // 状态虚实：敛息(虚) → 正常(半实) → 外放(全实)
  const solidity = opts.concealed ? 0.12 : burst ? 1.0 : 0.62;
  const scaleK = opts.concealed ? 0.76 : burst ? 1.14 : opts.sitting ? 1.04 : 1.0;
  const spinK = (opts.sitting ? 0.65 : opts.flying ? 1.25 : 1.0) * (burst ? 1.28 : 1.0);
  const R = ft.r * scaleK;
  const D = R * 2;
  const aBase = (0.48 + Math.min(0.22, r * 0.018)) * solidity * (burst ? 1.28 : 1.0);
  const aSpin = (0.52 + Math.min(0.22, r * 0.018)) * solidity * (burst ? 1.28 : 1.0);

  const B = F.B;
  // 1. 脚底 2.5D 专属法阵（虚 → 半实 → 全实）
  B.tex(S.uploadStatic(ft.base));
  B.texQuad(x, y, D, t * ft.rotA * spinK, Math.min(1, aBase), burst ? 0.55 : 0.25, [1, 1, 1], sq);
  B.tex(S.uploadStatic(ft.spin));
  B.texQuad(x, y, D, t * ft.rotB * spinK, Math.min(1, aSpin), burst ? 0.75 : 0.42, [1, 1, 1], sq);

  // 2. 回到图集：身旁升腾光效烟雾 + 境界专属灵饰
  B.tex(S.atlas);
  const white: RGB = [1, 1, 1];
  const pale: RGB = mixc(ft.col, white, 0.46);
  const deep: RGB = mixc(ft.col, [0.06, 0.08, 0.12], 0.52);
  const smokeWispCell = extOK() ? C.KWisp1 : C.Wisp;
  const smokePuffCell = extOK() ? C.KSmoke2 : C.Smoke;

  // 2a. 连续升腾的光效灵烟柱（重点分布在人物左右身侧，中心人物留白不遮脸）
  const wispN = opts.concealed ? 2 : burst ? (7 + Math.min(5, Math.floor(r / 2))) : (4 + Math.min(4, Math.floor(r / 3)));
  const riseH = (56 + r * 6.5) * (opts.concealed ? 0.55 : burst ? 1.38 : 1.0);
  const wispA = opts.concealed ? 0.06 : burst ? (0.44 + r * 0.016) : (0.20 + r * 0.012);
  for (let i = 0; i < wispN; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const band = ((i >> 1) + 0.5) / Math.max(1, Math.ceil(wispN / 2));
    // 左右弧段角度集中在两侧 [-0.42π..0.42π] 与 [0.58π..1.42π]，避开正面遮脸
    const baseAn = side > 0 ? (-0.34 + band * 0.68) * Math.PI : (0.66 + band * 0.68) * Math.PI;
    const ph = ((t * (0.34 + (i % 3) * 0.08) * (burst ? 1.25 : 1) + i * 0.37) % 1 + 1) % 1;
    const ease = 1 - Math.pow(1 - ph, 1.5);
    const fade = Math.sin(ph * Math.PI);
    const rr = R * (0.74 + 0.24 * Math.sin(i * 2.1 + ph * 2));
    const sx = x + Math.cos(baseAn) * rr + Math.sin(ph * 5.2 + i * 1.9) * (6 + r * 0.5) * side;
    const sy = y + Math.sin(baseAn) * rr * sq - ease * riseH;

    let wc = i % 3 === 0 ? pale : ft.col;
    if (r === 5) wc = LD_FIVE[i % 5].split(',').map((v) => Number(v) / 255) as RGB;
    // 大罗交错玄墨底烟与白金圣烟
    const isDarkChaos = r === 12 && i % 3 === 1;
    const wSize = (18 + r * 1.6) * (0.75 + ease * 0.65) * (burst ? 1.2 : 1);
    const hSize = wSize * (1.75 + ease * 0.55);
    const tilt = side * (0.12 - ph * 0.16) + Math.sin(ph * 4 + i) * 0.08;

    F.sprite(smokePuffCell, sx, sy + 6, wSize * 1.25, hSize * 0.72, tilt, isDarkChaos ? deep : wc, wispA * 0.55 * fade, isDarkChaos ? 0 : 1);
    F.sprite(smokeWispCell, sx, sy, wSize * 0.72, hSize, tilt, isDarkChaos ? pale : (burst ? white : pale), wispA * 0.72 * fade, 1);
  }

  // 2b. 粒子池升腾光效烟雾 + 升华灵丝/星尘（持续袅袅向上漂浮）
  const emitRate = opts.concealed ? 0.6 : burst ? (14 + r * 2.4) : (4.5 + r * 1.0);
  if (Math.random() < dt * emitRate) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const an = (side > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.45;
    const rr = R * (0.68 + Math.random() * 0.34);
    const px = x + Math.cos(an) * rr;
    const py = y + Math.sin(an) * rr * sq - 2;
    let sc: RGB = Math.random() < 0.35 ? pale : ft.col;
    if (r === 5) sc = LD_FIVE[Math.floor(Math.random() * 5)].split(',').map((v) => Number(v) / 255) as RGB;
    const darkChaos = r === 12 && Math.random() < 0.25;
    // 柔光灵烟团
    F.emit({
      x: px, y: py,
      vx: side * (4 + Math.random() * 10),
      vy: -(28 + r * 2.8 + Math.random() * 24) * (burst ? 1.32 : 1),
      life: opts.concealed ? 0.45 : burst ? (0.9 + Math.random() * 0.55) : (0.7 + Math.random() * 0.45),
      s0: (10 + r * 1.1) * (burst ? 1.22 : 1),
      s1: (22 + r * 1.9) * (burst ? 1.32 : 1),
      rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 1.2,
      c: darkChaos ? deep : sc,
      a: opts.concealed ? 0.08 : burst ? 0.34 : 0.18,
      add: darkChaos ? 0 : 1,
      cell: smokeCell(),
      drag: 0.65,
    });
    // 伴随灵烟升起的光丝 / 星芒
    if (!opts.concealed && Math.random() < (burst ? 0.78 : 0.42)) {
      F.emit({
        x: px + (Math.random() - 0.5) * 8, y: py,
        vx: (Math.random() - 0.5) * 8,
        vy: -(44 + r * 3.8 + Math.random() * 34) * (burst ? 1.3 : 1),
        life: burst ? 0.85 : 0.65,
        s0: burst ? 3.8 : 2.6, s1: 0.5,
        c: Math.random() < 0.45 ? white : pale,
        a: burst ? 0.78 : 0.44,
        cell: r >= 9 ? C.Star : C.Streak,
        stretch: r >= 9 ? 0 : 0.08,
      });
    }
  }

  // 2c. 境界专属脚底动态点缀（随虚实同步缩放透明度）
  const detailA = opts.concealed ? 0.12 : burst ? 0.96 : 0.65;
  if (r === 2) {
    for (let i = 0; i < 4; i++) {
      const an = t * 0.9 * spinK + (i / 4) * TAU;
      F.sprite(C.Leaf, x + Math.cos(an) * R * 0.84, y + Math.sin(an) * R * 0.84 * sq, 10, 5.5, an + Math.PI / 2, pale, detailA * 0.75);
    }
  } else if (r === 3 && !opts.concealed) {
    for (let i = 0; i < 3; i++) {
      const an = -Math.PI / 2 + t * ft.rotB * spinK + (i / 3) * TAU;
      F.orb(x + Math.cos(an) * R * 0.72, y + Math.sin(an) * R * 0.72 * sq - 2, burst ? 3.1 : 2.3, [1, 0.65, 0.25], detailA);
    }
  } else if (r === 5) {
    for (let i = 0; i < 5; i++) {
      const an = (i / 5) * TAU - t * 0.85 * spinK;
      const oc = LD_FIVE[i].split(',').map((v) => Number(v) / 255) as RGB;
      F.orb(x + Math.cos(an) * R * 0.86, y + Math.sin(an) * R * 0.86 * sq - 2, burst ? 3.4 : 2.6, oc, detailA);
    }
  } else if (r === 8 && !opts.concealed && Math.random() < dt * (burst ? 8.5 : 3.5)) {
    const a0 = Math.random() * TAU, a1 = a0 + 0.45;
    F.bolt(
      x + Math.cos(a0) * R * 0.88, y + Math.sin(a0) * R * 0.88 * sq,
      x + Math.cos(a1) * R * 0.88, y + Math.sin(a1) * R * 0.88 * sq,
      Math.random() * 1e6, 7, burst ? 1.7 : 1.2, [0.85, 0.7, 1], detailA, 4, false,
    );
  } else if (r >= 9) {
    const n = r === 12 ? 9 : r === 11 ? 8 : 6;
    for (let i = 0; i < n; i++) {
      const an = (i / n) * TAU + t * 0.75 * spinK;
      F.orb(x + Math.cos(an) * R * 0.92, y + Math.sin(an) * R * 0.92 * sq - 2, (2.4 + (r - 9) * 0.22) * (burst ? 1.25 : 1), i % 2 ? white : pale, detailA);
    }
  }
}

/** Canvas2D 回退绘制（共用专属高清阵纹 + 身旁升腾柔光灵烟，同样支持 虚 → 半实 → 全实） */
export function drawRealmFoot2D(ctx: CanvasRenderingContext2D, x: number, y: number, realmIn: number, t: number, opts: FootStateOpts) {
  const r = Math.max(0, Math.min(12, realmIn | 0));
  if (r <= 0) return;
  const ft = getRealmFoot(r);
  const sq = 0.44;
  const burst = !!opts.burst && !opts.concealed;
  const solidity = opts.concealed ? 0.12 : burst ? 1.0 : 0.62;
  const scaleK = opts.concealed ? 0.76 : burst ? 1.14 : opts.sitting ? 1.04 : 1.0;
  const spinK = (opts.sitting ? 0.65 : opts.flying ? 1.25 : 1.0) * (burst ? 1.28 : 1.0);
  const R = ft.r * scaleK;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, sq);
  ctx.globalAlpha = solidity * 0.95;
  ctx.save(); ctx.rotate(t * ft.rotA * spinK); ctx.drawImage(ft.base, -R, -R, R * 2, R * 2); ctx.restore();
  ctx.save(); ctx.rotate(t * ft.rotB * spinK); ctx.drawImage(ft.spin, -R, -R, R * 2, R * 2); ctx.restore();
  ctx.restore();

  // 身旁往上升起的光效烟雾（Canvas2D 柔和径向雾团）
  const wispN = opts.concealed ? 2 : burst ? 10 : 5;
  const riseH = (52 + r * 6) * (opts.concealed ? 0.55 : burst ? 1.38 : 1.0);
  const cRgb = rgbStr(ft.col, 1).replace(/,1\)$/, '');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < wispN; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const ph = ((t * (0.36 + (i % 3) * 0.08) + i * 0.31) % 1 + 1) % 1;
    const ease = 1 - Math.pow(1 - ph, 1.5);
    const fade = Math.sin(ph * Math.PI) * (opts.concealed ? 0.08 : burst ? 0.42 : 0.22);
    if (fade <= 0.01) continue;
    const sx = x + side * (R * (0.65 + (i % 3) * 0.14) + Math.sin(ph * 5 + i) * 6);
    const sy = y - ease * riseH;
    const rad = (16 + r * 1.4) * (0.7 + ease * 0.7) * (burst ? 1.2 : 1);
    const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad);
    gr.addColorStop(0, `${cRgb},${fade})`);
    gr.addColorStop(0.5, `${cRgb},${fade * 0.4})`);
    gr.addColorStop(1, `${cRgb},0)`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(sx, sy, rad * 0.78, rad * 1.45, side * 0.1, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
