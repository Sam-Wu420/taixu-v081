// r16 夜无赦：把生成好的原图（tools/out/yws-art/gen/*.png，外加样张 samples/）清底、裁边、压成 webp 放进 src/assets/yewushe/，
// 再重写 src/gfx/ywsTexData.ts（data URL 内联、按帧名查）。用法：node tools/yws-pack.mjs [--q=78] [--max=640]
// 清底和裁边用 tools/slice-sheet.mjs 的 --one（整张当一格）。已经压过、原图没变的跳过。最后打印合计体积（预算 6 MB）。
import { spawnSync } from 'node:child_process';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2), opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const Q = opt('q', '72'), MAX = opt('max', '600');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gen = path.join(root, 'tools/out/yws-art/gen'), samples = path.join(root, 'tools/out/yws-art/samples'), out = path.join(root, 'src/assets/yewushe');
fs.mkdirSync(out, { recursive: true });
// 原图名 → 帧名：yws_human_idle → yws_h_idle（样张的名字是全称）
const norm = (n) => n.replace(/^yws_human_/, 'yws_h_').replace(/^yws_half_/, 'yws_b_').replace(/^yws_demon_/, 'yws_m_');
const src = [];
for (const dir of [samples, gen]) if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.png')) src.push({ file: path.join(dir, f), name: norm(f.replace(/\.png$/, '')) });
// 画出来朝右的几张（其余都朝左）：切好以后左右翻一下
const FLIP = new Set(['yws_h_cast', 'yws_h_roar', 'yws_h_transform', 'yws_b_cast', 'yws_b_roar', 'yws_b_transform']);
let total = 0;
for (const s of src) {
  const dst = path.join(out, s.name + '.webp');
  if (!fs.existsSync(dst) || fs.statSync(dst).mtimeMs < fs.statSync(s.file).mtimeMs) {
    // 魔躯（几个人高）最长边 600；人身、半魔、特效在屏幕上小得多，给八成（480）
    const max = /^yws_m_/.test(s.name) ? MAX : String(Math.round(Number(MAX) * 0.8));
    const r = spawnSync(process.execPath, [path.join(root, 'tools/slice-sheet.mjs'), s.file, out, s.name, '--one', `--max=${max}`, `--q=${Q}`], { encoding: 'utf8' });
    if (r.status) { console.error('切图失败', s.name, r.stderr); continue; }
    process.stdout.write(r.stdout);
    if (FLIP.has(s.name)) {
      const im = await loadImage(dst), cv = createCanvas(im.width, im.height), g = cv.getContext('2d');
      g.translate(im.width, 0); g.scale(-1, 1); g.drawImage(im, 0, 0);
      fs.writeFileSync(dst, cv.encodeSync('webp', Number(Q))); console.log('  左右翻过来（原画朝右）', s.name);
    }
  }
  total += fs.statSync(dst).size;
}
const names = fs.readdirSync(out).filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, '')).sort();
const lines = [
  '// r16 夜无赦：首领贴图（src/assets/yewushe，帧对照表见那里的 说明.md），data URL 内联、懒加载（hd2d/bossthings.ts 用到时才 import）。',
  '// 由 tools/yws-pack.mjs 生成，别手改。还没生成出来的帧不在表里，bossthings 退回 gfx/ywsPlaceholder.ts 的占位剪影。',
  ...names.map((n, i) => `import t${i} from '../assets/yewushe/${n}.webp?inline';`),
  'export const YWS_SRC: Record<string, string> = {',
  ...names.map((n, i) => `  ${n}: t${i},`),
  '};',
  '',
];
fs.writeFileSync(path.join(root, 'src/gfx/ywsTexData.ts'), lines.join('\n'));
console.log(`\n${names.length} 张，合计 ${(total / 1024 / 1024).toFixed(2)} MB（预算 6 MB）`);

// —— 帧对照表 src/assets/yewushe/说明.md（格式照 src/assets/sea/说明.md）
const DESC = {
  idle: '待机（用户认可的样张）', walk: '走', hurt: '受击后仰', down: '倒地 / 跪倒', raise: '举过头（镰 / 爪）', windup: '收身蓄势', slash: '弓步下劈', sweep: '伏低平扫',
  upper: '上撩', slam: '砸地', stab: '弓步平伸长镰', spin: '回旋（背身）', throw: '甩出镰 / 甩臂', catch: '单手高举接镰', cast: '立身结印', grab: '空手前抓', fist: '直拳',
  roar: '仰头咆哮', guard: '格挡', dash: '疾冲', leap: '跃起', dive: '斜着往下扎', charge: '伏低蓄力', transform: '魔气爆体 / 亮相', summon: '单膝跪、手按地', claw: '前探下抓',
  fly: '空中展翼悬停', aw1_a: '觉醒一：血红魔身拧腰起手', aw1_b: '觉醒一：双爪交叉乱斩', aw1_c: '觉醒一：收势', aw2_face: '觉醒二：脸部特写（演出层）', aw2_wings: '觉醒二：正面展翼（演出层）',
};
const FX = { yws_scythe: '单独一柄噬魂镰（回旋魂镰的飞镰；魂镰最高阶）', yws_fx_fist: '巨大魔臂 + 拳（魔拳）', yws_fx_claw: '巨大五指魔爪（魔审、混沌弑仙）', yws_fx_ghost: '半透明鬼脸（鬼门关、灭世冲击）' };
const FORM = { h: '人身', b: '半魔', m: '魔躯' };
const rows = [];
for (const n of names) {
  const buf = fs.readFileSync(path.join(out, n + '.webp')), kb = Math.round(buf.length / 1024);
  // webp 的宽高（VP8X / VP8 / VP8L 三种头）
  let w = 0, h = 0; const t = buf.toString('ascii', 12, 16);
  if (t === 'VP8X') { w = 1 + buf.readUIntLE(24, 3); h = 1 + buf.readUIntLE(27, 3); } else if (t === 'VP8 ') { w = buf.readUInt16LE(26) & 0x3fff; h = buf.readUInt16LE(28) & 0x3fff; } else if (t === 'VP8L') { const b = buf.readUInt32LE(21); w = 1 + (b & 0x3fff); h = 1 + ((b >> 14) & 0x3fff); }
  const m = /^yws_([hbm])_(.+)$/.exec(n);
  rows.push(`| ${n} | ${m ? FORM[m[1]] : '特效'} | ${m ? DESC[m[2]] ?? m[2] : FX[n] ?? ''} | ${w}×${h} | ${kb} KB |`);
}
fs.writeFileSync(path.join(out, '说明.md'), `# 噬魂魔尊 · 夜无赦的贴图（r16，our-codex-image 生成，tools/yws-pack.mjs 清底压缩）

都朝左画、透明底，一张一个姿势（关键帧）；其余的动作靠程序动画补（src/world/yewushe-anim.ts 的招式表：卡帧、挤压拉伸、旋转、位移、残影、调色）。
哪一招用哪几帧、每帧停多久：见规格书 docs/夜无赦-参考视频动作分解.md（每招「帧」一节、文末「贴图清单」）。
原图在 tools/out/yws-art/gen（不进库），提示词由 tools/out/yws-art/poses.mjs 生成——人物描述直接取用户认可的三张样张（samples.json），只换姿势那一句。
最长边：魔躯 600、人身 / 半魔 / 特效 480，webp 质量 72。半魔没画的姿势借人身同名帧（立板调成紫）；魔躯没画的借相近的魔躯帧（见 yewushe-anim.ts 的 DEMON_BORROW）。
重打包：把新图放进 tools/out/yws-art/gen，跑 node tools/yws-pack.mjs（顺带重写 src/gfx/ywsTexData.ts 和这份表）。

| 文件 | 形态 | 内容 | 尺寸 | 体积 |
|---|---|---|---|---|
${rows.join('\n')}

合计 ${names.length} 张、${(total / 1024 / 1024).toFixed(2)} MB（预算 6 MB）。
`);

// —— 每帧脚在图的哪里（ax，0 = 图的左边）：量最底下一截不透明像素，分成一段段，取离全图「质量中心」最近的那一段的中点
//    （镰刃拖在地上的帧，最底下一截有刃也有脚——刃是离身子远的那一段，不选它）。写进 src/world/ywsFrameMeta.ts（yewushe-anim.ts 读）。
const meta = {};
for (const n of names) {
  if (!/^yws_[hbm]_/.test(n)) continue;
  const im = await loadImage(path.join(out, n + '.webp')), W = im.width, H = im.height, cv = createCanvas(W, H), g = cv.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let mx = 0, mn = 0; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const a = d[(y * W + x) * 4 + 3]; if (a > 128) { mx += x; mn++; } }
  const cx = mn ? mx / mn : W / 2;
  let bot = H - 1; while (bot > 0) { let any = false; for (let x = 0; x < W; x++) if (d[(bot * W + x) * 4 + 3] > 128) { any = true; break; } if (any) break; bot--; }
  const band = Math.max(4, Math.round(H * 0.07)), col = new Uint8Array(W);
  for (let y = Math.max(0, bot - band); y <= bot; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) col[x] = 1;
  const runs = []; for (let x = 0; x < W; x++) if (col[x]) { let e = x; while (e + 1 < W && (col[e + 1] || col[Math.min(W - 1, e + 2)] || col[Math.min(W - 1, e + 3)])) e++; runs.push([x, e]); x = e; }
  // 两只脚常是相邻的两段：离质量中心最近的那段，再并上离它不到图宽 15% 的段
  runs.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - cx) - Math.abs((b[0] + b[1]) / 2 - cx));
  let [x0, x1] = runs[0] ?? [W / 2, W / 2];
  for (const r of runs.slice(1)) if (Math.min(Math.abs(r[0] - x1), Math.abs(x0 - r[1])) < W * 0.15 && r[1] - r[0] < W * 0.25) { x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[1]); }
  // 腾空、疾冲的帧脚不着地（最底下是镰尖 / 爪尖）：取全图的质量中心
  meta[n] = +((/_(leap|dive|fly|dash|aw2_w+)$/.test(n) ? cx : (x0 + x1) / 2) / W).toFixed(3);
}
fs.writeFileSync(path.join(root, 'src/world/ywsFrameMeta.ts'), `// r16 夜无赦：每帧脚在贴图横向的位置（0 = 图的左边），由 tools/yws-pack.mjs 量出来，别手改（要改就在 yewushe-anim.ts 的 YWS_FRAME_META 里覆盖）。\nexport const YWS_FOOT_AX: Record<string, number> = ${JSON.stringify(meta, null, 1).replace(/"(\w+)":/g, '$1:')};\n`);
console.log('脚位', Object.entries(meta).map(([k, v]) => k.slice(4) + '=' + v).join(' '));
