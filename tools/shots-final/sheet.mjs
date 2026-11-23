// 把 tools/out/final 里的若干张图拼成一张总览（每格上面写名字）。用法：node tools/shots-final/sheet.mjs 输出名 列数 图名1 图名2 ...（不带 .png）
import { createRequire } from 'node:module'; import path from 'node:path'; import fs from 'node:fs';
const require = createRequire(import.meta.url); const { loadImage, createCanvas } = require('@napi-rs/canvas');
const [out, colsS, ...names] = process.argv.slice(2); const cols = Number(colsS), D = 'tools/out/final/';
const ims = []; for (const n of names) { const f = path.resolve(D + n + '.png'); ims.push(fs.existsSync(f) ? await loadImage(f) : null); }
const cw = Math.floor(1600 / cols), ch = Math.round(cw * (ims.find(Boolean)?.height ?? 900) / (ims.find(Boolean)?.width ?? 1600)), rows = Math.ceil(names.length / cols);
const c = createCanvas(cw * cols, (ch + 22) * rows), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.font = '16px sans-serif';
names.forEach((n, i) => { const px = (i % cols) * cw, py = Math.floor(i / cols) * (ch + 22); x.fillStyle = '#fff'; x.fillText(n, px + 4, py + 16); if (ims[i]) x.drawImage(ims[i], px, py + 22, cw, ch); });
fs.writeFileSync(D + out + '.png', c.toBuffer('image/png')); console.log(D + out + '.png');
