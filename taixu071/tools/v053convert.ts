// v0.53：灵力化形 / 阵法禁制 画材转换
// 用法：npx tsx tools/v053convert.ts [art-incoming/v053]
// 产出：src/assets/v053/*.webp + src/gfx/v053Data.ts（勿手改）
// - 黑底发光图（manifest kind=black / ui）：按亮度抠出 alpha 并反预乘，任何底色上都能正常叠放
// - 透底实物（prop / item_icon / skill_icon / clear）：裁去空白边；道具按「旗高 ≈ 1.4 人」统一缩放，落地点从 alpha 实测
// - 元婴 7 张场景图已作废（元婴改由代码缩放主角绘制），一律跳过
import { createCanvas, loadImage, Image } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.argv[2] || 'art-incoming/v053';
const OUT = 'src/assets/v053';
mkdirSync(OUT, { recursive: true });

type Mode = 'glow' | 'alpha';
interface Job { id: string; file: string; mode: Mode; max: [number, number]; pad?: number; anchor?: boolean; trim?: boolean }

const J: Job[] = [];
const add = (id: string, file: string, mode: Mode, max: [number, number], o: Partial<Job> = {}) => J.push({ id, file, mode, max, ...o });
// —— 灵力化形：七兽两姿态 + 四张配套特效
for (const f of ['long', 'feng', 'hu', 'gui', 'peng', 'qilin', 'yuan']) for (const p of ['idle', 'attack']) add(`hx_${f}_${p}`, `huaxing/hx_${f}_${p}.png`, 'glow', f === 'long' ? [768, 448] : [640, 640], { trim: true });
add('hx_gather', 'huaxing/hx_gather.png', 'glow', [384, 384]);
add('hx_dissolve', 'huaxing/hx_dissolve.png', 'glow', [384, 384]);
add('hx_trail', 'huaxing/hx_trail.png', 'glow', [512, 128]);
add('hx_aura', 'huaxing/hx_aura.png', 'glow', [384, 384]);
// —— 阵纹圆盘与分层（贴地正圆：缩进 92% 留边，免得旋转时外圈火苗被画布切平）
for (const z of ['kun', 'mizong', 'wuxing', 'gengjin', 'wulei', 'dihuo', 'xuanwu', 'liangyi', 'juling', 'huichun', 'lianxi', 'gujin', 'hushan']) add(`zf_${z}`, `zhenfa/circle/zf_${z}.png`, 'glow', [640, 640], { pad: 0.92 });
for (const z of ['outer', 'band', 'bagua', 'core']) add(`zf_layer_${z}`, `zhenfa/circle/zf_layer_${z}.png`, 'glow', [512, 512], { pad: 0.96 });
// —— 光罩与光幕
add('zf_dome', 'zhenfa/dome/zf_dome.png', 'glow', [640, 480]);
add('zf_dome_crack', 'zhenfa/dome/zf_dome_crack.png', 'glow', [640, 480]);
add('zf_shatter', 'zhenfa/dome/zf_shatter.png', 'glow', [384, 384]);
add('zf_curtain', 'zhenfa/dome/zf_curtain.png', 'glow', [256, 256]);
add('zf_link', 'zhenfa/dome/zf_link.png', 'glow', [512, 64]);
// —— 阵中特效
add('zf_activate', 'zhenfa/fx/zf_activate.png', 'glow', [512, 512]);
add('zf_break', 'zhenfa/fx/zf_break.png', 'glow', [512, 512]);
add('zf_pillar', 'zhenfa/fx/zf_pillar.png', 'glow', [128, 512]);
add('zf_eye', 'zhenfa/fx/zf_eye.png', 'glow', [256, 256]);
add('zf_sword', 'zhenfa/fx/zf_sword.png', 'glow', [128, 384]);
add('zf_fire', 'zhenfa/fx/zf_fire.png', 'glow', [256, 384]);
add('zf_lightning', 'zhenfa/fx/zf_lightning.png', 'glow', [128, 512]);
add('zf_fog', 'zhenfa/fx/zf_fog.png', 'alpha', [384, 384]);
// —— 实物（落地点实测）
for (const f of ['jin', 'mu', 'shui', 'huo', 'tu', 'mo']) add(`zf_flag_${f}`, `zhenfa/prop/zf_flag_${f}.png`, 'alpha', [180, 300], { trim: true, anchor: true });
add('zf_eye_stone', 'zhenfa/prop/zf_eye_stone.png', 'alpha', [170, 170], { trim: true, anchor: true });
add('zf_eye_stone_ancient', 'zhenfa/prop/zf_eye_stone_ancient.png', 'alpha', [190, 190], { trim: true, anchor: true });
add('zf_stake', 'zhenfa/prop/zf_stake.png', 'alpha', [140, 170], { trim: true, anchor: true });
add('zf_disc_ground', 'zhenfa/prop/zf_disc_ground.png', 'alpha', [180, 180], { trim: true, anchor: true });
// —— 图标（96px，与旧图标同尺寸）
for (const f of ['skill_huaxing', 'form_long', 'form_feng', 'form_hu', 'form_gui', 'form_peng', 'form_qilin', 'form_yuan']) add(f, `huaxing/icon/${f}.png`, 'alpha', [96, 96]);
for (const f of ['skill_yuanying', 'skill_yy_blink', 'skill_yy_return']) add(f, `yuanying/icon/${f}.png`, 'alpha', [96, 96]);
for (const f of ['zhenpan_1', 'zhenpan_2', 'zhenpan_3', 'zhenpan_4', 'zhenqi_low', 'zhenqi_high', 'zhentu_low', 'zhentu_high', 'mat_zhenyu', 'mat_lingmo', 'mat_qimu', 'pojin_zhui']) add('icon_' + f, `zhenfa/icon/icon_${f}.png`, 'alpha', [96, 96], { trim: true });
for (const f of ['mizong', 'gengjin', 'wulei', 'dihuo', 'xuanwu', 'liangyi', 'huichun', 'lianxi', 'gujin', 'hushan']) add('zs_' + f, `zhenfa/skill/zs_${f}.png`, 'alpha', [96, 96]);
// —— 破禁之局
add('ui_board', 'zhenfa/ui/ui_board.png', 'glow', [768, 768], { pad: 0.94 });
for (const f of ['jin', 'mu', 'shui', 'huo', 'tu', 'trap', 'broken']) add('ui_node_' + f, `zhenfa/ui/ui_node_${f}.png`, 'glow', [160, 160]);

/** 黑底 → 透明（与 vfxconvert 同一套抠法：亮度定 alpha，再反预乘） */
function keyGlow(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const a0 = d[i + 3] / 255; if (a0 <= 0) continue;
    const m = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
    const na = a0 * Math.min(1, Math.pow(m, 0.9) * 1.08);
    if (na < 0.012) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    const sc = 1 / Math.max(m, 0.004);
    d[i] = Math.min(255, d[i] * sc); d[i + 1] = Math.min(255, d[i + 1] * sc); d[i + 2] = Math.min(255, d[i + 2] * sc);
    d[i + 3] = Math.round(na * 255);
  }
}
/** 白底抠图留下的白边：半透明且近白的像素压暗收边 */
function fringe(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]; if (a === 0 || a > 200) continue;
    if (Math.min(d[i], d[i + 1], d[i + 2]) > 225) d[i + 3] = Math.round(a * 0.35);
  }
}
function bbox(d: Uint8ClampedArray, w: number, h: number, th = 12) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } : { x0, y0, x1, y1 };
}

interface Meta { w: number; h: number; ax?: number; ay?: number }
(async () => {
  const meta: Record<string, Meta> = {};
  const imports: string[] = [], rows: string[] = [];
  let n = 0;
  for (const j of J) {
    const src = join(ROOT, j.file);
    if (!existsSync(src)) { console.warn('缺图', src); continue; }
    const im = await loadImage(readFileSync(src)) as Image;
    const W = im.width, H = im.height;
    const c0 = createCanvas(W, H), g0 = c0.getContext('2d');
    g0.drawImage(im, 0, 0);
    const id0 = g0.getImageData(0, 0, W, H);
    const d0 = id0.data as unknown as Uint8ClampedArray;
    // 黑底图不在这里抠：文件存 RGB（有损压缩小一个数量级），运行时首次取用再按亮度抠出 alpha（gfx/v053Tex.ts）
    if (j.mode === 'alpha') { fringe(d0); g0.putImageData(id0, 0, 0); }
    else { const tmp = new Uint8ClampedArray(d0); keyGlow(tmp); for (let i = 3; i < d0.length; i += 4) d0[i] = tmp[i]; }
    let b = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
    if (j.trim) { b = bbox(d0, W, H); if (j.mode === 'glow') { for (let i = 3; i < d0.length; i += 4) d0[i] = 255; }  const m = Math.round(Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.03); b = { x0: Math.max(0, b.x0 - m), y0: Math.max(0, b.y0 - m), x1: Math.min(W - 1, b.x1 + m), y1: Math.min(H - 1, b.y1 + m) }; }
    const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
    const pad = j.pad ?? 1;
    const k = Math.min(j.max[0] / bw, j.max[1] / bh);
    const ow = j.trim ? Math.round(bw * k) : j.max[0], oh = j.trim ? Math.round(bh * k) : j.max[1];
    const c = createCanvas(ow, oh), g = c.getContext('2d');
    if (j.mode === 'glow') { g.fillStyle = '#000'; g.fillRect(0, 0, ow, oh); }
    g.imageSmoothingEnabled = true; (g as any).imageSmoothingQuality = 'high';
    const dw = (j.trim ? ow : ow) * pad, dh = (j.trim ? oh : oh) * pad;
    g.drawImage(c0, b.x0, b.y0, bw, bh, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
    const m: Meta = { w: ow, h: oh };
    if (j.anchor) {
      // 落地点：最底下 4% 行内不透明像素的横向重心
      const od = g.getImageData(0, 0, ow, oh).data as unknown as Uint8ClampedArray;
      const ob = bbox(od, ow, oh, 40);
      const band = Math.max(2, Math.round((ob.y1 - ob.y0) * 0.04));
      let sx = 0, sn = 0;
      for (let y = ob.y1 - band; y <= ob.y1; y++) for (let x = ob.x0; x <= ob.x1; x++) { const a = od[(y * ow + x) * 4 + 3]; if (a > 40) { sx += x * a; sn += a; } }
      m.ax = +(sn ? sx / sn / ow : 0.5).toFixed(3); m.ay = +(ob.y1 / oh).toFixed(3);
    }
    meta[j.id] = m;
    writeFileSync(join(OUT, j.id + '.webp'), await c.encode('webp', j.mode === 'glow' ? 80 : 88));
    imports.push(`import a${n} from '../assets/v053/${j.id}.webp?inline';`);
    rows.push(`  ${j.id}: a${n},`);
    n++;
  }
  const ts = `// v0.53 画材（外部 AI 绘制；tools/v053convert.ts 生成，勿手改）\n${imports.join('\n')}\n\nexport const V053_SRC: Record<string, string> = {\n${rows.join('\n')}\n};\n\n/** 尺寸与落地点（ax/ay 为宽高比例） */\nexport const V053_META: Record<string, { w: number; h: number; ax?: number; ay?: number }> = ${JSON.stringify(meta)};\n\n/** 存成黑底 RGB、运行时按亮度抠 alpha 的图 */\nexport const V053_GLOW = new Set(${JSON.stringify(J.filter((j) => j.mode === 'glow').map((j) => j.id))});\n`;
  writeFileSync('src/gfx/v053Data.ts', ts);
  console.log(`v053：${n} 张`);
})();
