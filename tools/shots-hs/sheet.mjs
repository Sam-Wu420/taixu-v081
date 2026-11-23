// 把 tools/out/hs-review 里某一招的几帧裁出人物附近、放大拼成一行。用法：node tools/shots-hs/sheet.mjs 输出名 帧名1 帧名2 ...  [--crop=x,y,w,h]（默认画面中间 900×600）
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const require = createRequire(import.meta.url); const { loadImage, createCanvas } = require('@napi-rs/canvas');
const args = process.argv.slice(2), crop = (args.find((a) => a.startsWith('--crop=')) ?? '--crop=350,150,900,600').slice(7).split(',').map(Number);
const [out, ...names] = args.filter((a) => !a.startsWith('--')), D = 'tools/out/hs-review/';
const W = 640, H = Math.round(W * crop[3] / crop[2]);
const c = createCanvas(W * names.length, H + 20), x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.font = '14px sans-serif';
for (let i = 0; i < names.length; i++) { const f = path.resolve(D + names[i] + '.png'); if (!fs.existsSync(f)) continue; const im = await loadImage(fs.readFileSync(f)); x.drawImage(im, crop[0], crop[1], crop[2], crop[3], i * W, 20, W, H); x.fillStyle = '#fff'; x.fillText(names[i], i * W + 4, 15); }
fs.writeFileSync(D + out + '.png', c.toBuffer('image/png')); console.log(D + out + '.png');
