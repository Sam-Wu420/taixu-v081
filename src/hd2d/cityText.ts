// P10：城里匾额、招牌、幌子上的字。字用 Canvas 现场印进一张图集（不带图片文件），匾额是立体的四边面，按图集坐标贴字。
// 横匾 256×64（城门、钟鼓楼、衙署、店招、府第）；竖幌 64×256（酒、茶、药……一两个字）。
// 构件在拼网格时把匾记在 ArchBuilder 上（builder.plaques），buildings.ts 每块网格交出时另做一个贴字的小网格。
// 图集是 DataTexture：新印一块字只把这一块的几十行传上显卡（以前整张 2048² 画布连 mipmap 重传，
// 飞越时每进一片新街坊就卡一下，实测一条路线上几十帧超过 50 毫秒）。
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { makeCanvas } from '../core/canvas';

export type PlaqueKind = 'board' | 'gold' | 'stone' | 'banner';
/** 一块匾：四个角（本地坐标，a→b→c→d 逆时针为正面，a 左下、c 右上）、字、样式、底色（幌子用） */
export interface Plaque { p: number[]; text: string; kind: PlaqueKind; color?: string;
  /** P4：随风摆的幡上的字——四角的摆幅权重（和幡布用同一套，字跟着布一起摆） */
  sw?: readonly number[];
  /** 城镇破坏：这块字属于哪一件构件（buildings.ts 的构件标记；替身另画时原来的跟着藏） */
  pv?: number }

const W = 2048, H = 2048, HW = 256, HH = 64, VW = 64, VH = 256;
const H_ROWS = 24, V_TOP = H_ROWS * HH;   // 上面 24 行横匾（8×24 = 192 块），下面竖幌（32×2 = 64 块）
// scratch：一块字先印在这张小画布上，再读回像素拷进图集数据
let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, texture: DataTexture | null = null, data: Uint8Array | null = null;
const slots = new Map<string, [number, number, number, number]>();
let nextH = 0, nextV = 0;
const FONT = '"STKaiti","KaiTi","Kaiti SC","Noto Serif SC","SimSun",serif';

function init() {
  if (canvas) return;
  canvas = makeCanvas(HW, VH) as HTMLCanvasElement; ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  data = new Uint8Array(W * H * 4);
  texture = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace; texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter; texture.anisotropy = 4;
  texture.generateMipmaps = true; texture.needsUpdate = true;
}
export function textAtlas(): DataTexture { init(); return texture!; }

/** 字在图集里的 uv（u0, v0, u1, v1；v 向上）。图集满了返回 null（匾照样有，只是没字） */
export function textSlot(text: string, kind: PlaqueKind, color = '#a8432f'): [number, number, number, number] | null {
  init();
  if ((globalThis as { __noCityText?: boolean }).__noCityText) return null;   // 调试：不印字
  const key = kind + '|' + color + '|' + text;
  const hit = slots.get(key); if (hit) return hit;
  const g = ctx!, vertical = kind === 'banner';
  let ax: number, ay: number, w: number, h: number;
  if (vertical) { if (nextV >= 64) return null; ax = (nextV % 32) * VW; ay = V_TOP + Math.floor(nextV / 32) * VH; w = VW; h = VH; nextV++; }
  else { if (nextH >= 8 * H_ROWS) return null; ax = (nextH % 8) * HW; ay = Math.floor(nextH / 8) * HH; w = HW; h = HH; nextH++; }
  // 在小画布的左上角印，印完读回来
  const x = 0, y = 0;
  g.clearRect(0, 0, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (kind === 'banner') {
    g.fillStyle = color; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, 10); g.fillRect(x, y + h - 14, w, 14);
    g.fillStyle = '#1a1210'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = Math.min(4, text.length), fs = Math.min(52, (h - 30) / n);
    g.font = `bold ${fs}px ${FONT}`;
    for (let i = 0; i < n; i++) g.fillText(text[i], x + w / 2, y + 18 + (i + 0.5) * (h - 36) / n);
  } else {
    const bg = kind === 'stone' ? '#bdb6a6' : kind === 'gold' ? '#1e2a44' : '#2a1d14';
    const fg = kind === 'stone' ? '#2a241c' : '#e6c46a';
    g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = kind === 'stone' ? '#8a8476' : '#b8903c'; g.lineWidth = 5; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.min(44, (w - 24) / Math.max(1, text.length) * 1.05);
    g.font = `bold ${fs}px ${FONT}`;
    g.fillText(text, x + w / 2, y + h / 2 + 2, w - 20);
  }
  g.restore();
  // 拷进图集：DataTexture 的第 0 行在纹理底部（v = 0），所以画布第 r 行放到图集第 H-1-(ay+r) 行，uv 和以前（画布按 flipY 上传）一样
  const px = g.getImageData(0, 0, w, h).data, D = data!, T = texture!;
  for (let r = 0; r < h; r++) {
    const row = H - 1 - (ay + r), o = (row * W + ax) * 4;
    D.set(px.subarray(r * w * 4, (r + 1) * w * 4), o);
    T.addUpdateRange(o, w * 4);
  }
  T.needsUpdate = true;
  const uv: [number, number, number, number] = [ax / W, 1 - (ay + h) / H, (ax + w) / W, 1 - ay / H];
  slots.set(key, uv);
  return uv;
}
