// v0.54：秘境画材转换
// 用法：npx tsx tools/v054convert.ts [art-incoming/v054]
// 产出：src/assets/v054/*.webp + src/gfx/v054Data.ts（勿手改）
// - 地面 / 岩体 / 液面：无缝砖，缩到游戏用的尺寸；偏亮的主题（大殿、海宫、冰窟、沙城）统一压暗一档
// - 墙：横向无缝的立面条
// - 摆件 / 宝匣 / 灵草 / 入口：裁去空白、去掉孤立的抠图残点；按任务书的尺寸表定世界尺寸（人约 120 像素），存 1.5 倍
// - 古阵：黑底发光图（运行时按亮度抠 alpha，与 v053 同一套）
import { createCanvas, loadImage, Image } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.argv[2] || 'art-incoming/v054';
const OUT = 'src/assets/v054';
mkdirSync(OUT, { recursive: true });
const THEMES = ['cave', 'tomb', 'ice', 'fire', 'forest', 'desert', 'sea', 'palace', 'blood'];
/** 偏亮主题的压暗系数（地面要比人物低半档） */
const DIM: Record<string, number> = { palace: 0.74, sea: 0.72, ice: 0.78, desert: 0.82, cave: 0.9 };
const PERSON = 120, SAVE = 1.5;
/** 任务书里的尺寸（人高倍数）：生成图的 person_px 不可信，一律按这张表定世界尺寸。['w' 宽 | 'h' 高, 几个人] */
const SIZE: Record<string, ['w' | 'h', number]> = {
  prop_cave_bed: ['w', 1.5], prop_cave_furnace: ['h', 1], prop_cave_pillar: ['h', 2],
  prop_tomb_coffin: ['w', 1.6], prop_tomb_guardian: ['h', 1.5], prop_tomb_lamp: ['h', 1.2],
  prop_ice_pillar: ['h', 2], prop_ice_frozen: ['h', 1.3], prop_ice_crystal: ['w', 1],
  prop_fire_vent: ['w', 1.2], prop_fire_pillar: ['h', 2], prop_fire_altar: ['h', 1.2],
  prop_forest_roots: ['w', 2], prop_forest_bones: ['w', 1.5], prop_forest_shrine: ['h', 1.3],
  prop_desert_column: ['h', 1.5], prop_desert_beast: ['w', 1.5], prop_desert_urn: ['w', 1],
  prop_sea_coral: ['h', 2], prop_sea_wreck: ['w', 2.5], prop_sea_clam: ['w', 1.5],
  prop_palace_column: ['h', 2.5], prop_palace_censer: ['h', 1.3], prop_palace_throne: ['w', 1.5],
  prop_blood_altar: ['w', 1.8], prop_blood_banner: ['h', 2], prop_blood_spikes: ['w', 1.2],
  chest_1: ['w', 0.6], chest_2: ['w', 0.7], chest_3: ['w', 0.8], chest_open: ['w', 0.7],
  herb_1: ['w', 0.45], herb_2: ['w', 0.45], herb_3: ['w', 0.45],
  entrance_small: ['w', 2.5], entrance_mid: ['w', 4], entrance_big: ['w', 6],
};

type Kind = 'tile' | 'wall' | 'sprite' | 'glow';
interface Job { id: string; file: string; kind: Kind; size?: [number, number]; dim?: number }
const J: Job[] = [];
for (const t of THEMES) {
  J.push({ id: 'floor_' + t, file: `floor/floor_${t}.png`, kind: 'tile', size: [512, 512], dim: DIM[t] });
  J.push({ id: 'wall_' + t, file: `wall/wall_${t}.png`, kind: 'wall', size: [512, 192], dim: DIM[t] ? Math.min(1, DIM[t] + 0.08) : undefined });
  J.push({ id: 'rock_' + t, file: `rock/rock_${t}.png`, kind: 'tile', size: [256, 256] });
}
for (const l of ['water', 'lava', 'abyss', 'icelake', 'blood']) J.push({ id: 'liquid_' + l, file: `liquid/liquid_${l}.png`, kind: 'tile', size: [256, 256], dim: l === 'icelake' ? 0.82 : l === 'water' ? 0.85 : undefined });
const props = existsSync(join(ROOT, 'prop')) ? readdirSync(join(ROOT, 'prop')).filter((f) => f.endsWith('.png')) : [];
for (const f of props) J.push({ id: f.replace('.png', ''), file: 'prop/' + f, kind: 'sprite' });
for (const f of ['chest_1', 'chest_2', 'chest_3', 'chest_open', 'herb_1', 'herb_2', 'herb_3']) J.push({ id: f, file: `item/${f}.png`, kind: 'sprite' });
for (const f of ['gate_exit', 'gate_down']) J.push({ id: f, file: `item/${f}.png`, kind: 'glow', size: [384, 384] });
for (const f of ['entrance_small', 'entrance_mid', 'entrance_big']) J.push({ id: f, file: `world/${f}.png`, kind: 'sprite' });

/** 去掉孤立的抠图残点：只保留与最大连通块相连（或面积够大）的不透明像素 */
function cleanIslands(d: Uint8ClampedArray, w: number, h: number) {
  const lab = new Int32Array(w * h).fill(-1), sizes: number[] = [];
  const st: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] >= 0 || d[i * 4 + 3] < 24) continue;
    const id = sizes.length; let n = 0; lab[i] = id; st.push(i);
    while (st.length) { const k = st.pop()!; n++; const x = k % w, y = (k / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = ny * w + nx; if (lab[q] < 0 && d[q * 4 + 3] >= 24) { lab[q] = id; st.push(q); } } }
    sizes.push(n);
  }
  const big = Math.max(0, ...sizes), keep = sizes.map((s) => s >= Math.max(40, big * 0.02));
  for (let i = 0; i < w * h; i++) if (lab[i] >= 0 && !keep[lab[i]]) d[i * 4 + 3] = 0;   // 半透明羽边（未入连通块）保留
}
function bbox(d: Uint8ClampedArray, w: number, h: number, th = 20) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } : { x0, y0, x1, y1 };
}

interface Meta { w: number; h: number; ax?: number; ay?: number; ws?: number }
(async () => {
  const meta: Record<string, Meta> = {}, imports: string[] = [], rows: string[] = [], glow: string[] = [];
  let n = 0;
  for (const j of J) {
    const src = join(ROOT, j.file);
    if (!existsSync(src)) { console.warn('缺图', src); continue; }
    const im = await loadImage(readFileSync(src)) as Image;
    const W = im.width, H = im.height;
    let c: ReturnType<typeof createCanvas>;
    const m: Meta = { w: 0, h: 0 };
    if (j.kind === 'tile' || j.kind === 'wall' || j.kind === 'glow') {
      const [ow, oh] = j.size!;
      c = createCanvas(ow, oh); const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
      g.drawImage(im, 0, 0, ow, oh);
      if (j.dim) { g.globalCompositeOperation = 'multiply'; const v = Math.round(255 * j.dim); g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 6)})`; g.fillRect(0, 0, ow, oh); g.globalCompositeOperation = 'source-over'; }
      m.w = ow; m.h = oh;
      if (j.kind === 'glow') glow.push(j.id);
    } else {
      const c0 = createCanvas(W, H), g0 = c0.getContext('2d'); g0.drawImage(im, 0, 0);
      const id0 = g0.getImageData(0, 0, W, H), d0 = id0.data as unknown as Uint8ClampedArray;
      cleanIslands(d0, W, H); g0.putImageData(id0, 0, 0);
      const b = bbox(d0, W, H), pad = 4;
      const bx0 = Math.max(0, b.x0 - pad), by0 = Math.max(0, b.y0 - pad), bw = Math.min(W - 1, b.x1 + pad) - bx0 + 1, bh = Math.min(H - 1, b.y1 + pad) - by0 + 1;
      // 世界尺寸：原图像素 × (120 / 215)；存 1.5 倍
      const sz = SIZE[j.id] ?? ['h', 1.2], world = sz[1] * PERSON;
      const k = (sz[0] === 'w' ? world / bw : world / bh) * SAVE, ow = Math.max(8, Math.round(bw * k)), oh = Math.max(8, Math.round(bh * k));
      c = createCanvas(ow, oh); const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
      g.drawImage(c0, bx0, by0, bw, bh, 0, 0, ow, oh);
      // 落地点：最底下 4% 行内不透明像素的横向重心
      const od = g.getImageData(0, 0, ow, oh).data as unknown as Uint8ClampedArray, ob = bbox(od, ow, oh, 40);
      const band = Math.max(2, Math.round((ob.y1 - ob.y0) * 0.04)); let sx = 0, sn = 0;
      for (let y = ob.y1 - band; y <= ob.y1; y++) for (let x = ob.x0; x <= ob.x1; x++) { const a = od[(y * ow + x) * 4 + 3]; if (a > 40) { sx += x * a; sn += a; } }
      m.w = ow; m.h = oh; m.ws = +(1 / SAVE).toFixed(4); m.ax = +(sn ? sx / sn / ow : 0.5).toFixed(3); m.ay = +(ob.y1 / oh).toFixed(3);
    }
    meta[j.id] = m;
    writeFileSync(join(OUT, j.id + '.webp'), await c.encode('webp', j.kind === 'sprite' ? 88 : 82));
    imports.push(`import b${n} from '../assets/v054/${j.id}.webp?inline';`);
    rows.push(`  ${j.id}: b${n},`);
    n++;
  }
  writeFileSync('src/gfx/v054Data.ts', `// v0.54 秘境画材（外部 AI 绘制；tools/v054convert.ts 生成，勿手改）\n${imports.join('\n')}\n\nexport const V054_SRC: Record<string, string> = {\n${rows.join('\n')}\n};\n\n/** 尺寸；精灵另有 ws（存图倍率的倒数，乘上即世界尺寸）与落地点 ax/ay（宽高比例） */\nexport const V054_META: Record<string, { w: number; h: number; ax?: number; ay?: number; ws?: number }> = ${JSON.stringify(meta)};\n\nexport const V054_GLOW = new Set(${JSON.stringify(glow)});\n`);
  console.log(`v054：${n} 张`);
})();
