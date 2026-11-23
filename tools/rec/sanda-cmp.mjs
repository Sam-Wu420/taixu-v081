// r9：撼山客对照图（左参考视频、右游戏，同一时刻）：游戏一侧按招式自己的钟截（tools/rec/cmp-shot.mjs），视频一侧用 ffmpeg 取对应时刻，
// tools/rec/cmp-compose.py 拼成一张竖排的图，放 tools/out/sanda-cmp/<招>.png。每一行左上角写视频时刻、右上角写招式钟的时刻和这一格是什么。
// 用法：node tools/rec/sanda-cmp.mjs [--port=5219] [--only=名字,名字]
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = arg('port', '5219'), ONLY = arg('only', '').split(',').filter(Boolean);
const OUT = resolve('tools/out/sanda-cmp'), RAW = join(OUT, 'raw'), REF = resolve('tools/out/ref-sanda/ref.mp4');
mkdirSync(RAW, { recursive: true });
const P1 = (m, burn = false) => ({ q: `try=hsp1&move=${m}&loop=0${burn ? '&burn=1' : ''}`, ready: '!!window.__p1Ready', trig: `window.__p1.go('${m}')` });
const P3 = (m) => ({ q: `try=hanshan&move=${m}&noauto=1`, ready: '!!window.__hs3Ready', trig: 'window.__hs3.again()' });
/** [名字, 页面, [[视频秒, 招式钟, 这一格]]]——时刻对齐：照视频的关键格（出手、命中、收招）对到招式自己钟上的同一个动作 */
const MOVES = [
  ['yicunbeng', P1('yicunbeng'), [[4.27, 0.3, '停半拍'], [4.34, 0.54, '一帧切出直拳'], [4.47, 0.66, '定住'], [4.6, 0.8, '收']]],
  ['jingang', P1('jingang'), [[7.6, 0.12, '右拳前举'], [8.0, 0.3, '头顶白光、全身金边'], [8.4, 0.6, '细金边、硬吃']]],
  ['duanmai', P1('duanmai'), [[11.94, 0.09, '伏身提脚跟'], [12.2, 0.25, '脚下蓄劲'], [12.42, 0.55, '后仰一脚'], [12.74, 0.9, '收']]],
  ['houfa', P1('houfa'), [[13.74, 0.03, '侧身'], [13.9, 0.09, '提膝、拳举到脑后'], [14.03, 0.15, '弓步顶肘'], [14.14, 0.26, '定住']]],
  ['zhuangshan', P1('zhuangshan'), [[15.5, 0.13, '沉马黄边'], [15.6, 0.24, '红边'], [15.7, 0.33, '一靠'], [15.9, 0.5, '竖环']]],
  ['suodi', P1('suodi'), [[21.7, 0.03, '伏身蹬地'], [21.9, 0.11, '人已经到了、残影'], [22.0, 0.17, '速度带、冲击刺'], [22.3, 0.27, '回身一拳']]],
  ['liuxing', P1('liuxing'), [[23.61, 0.09, '闪步一拳'], [23.75, 0.24, '贴身连打'], [23.95, 0.41, '红光勾拳'], [24.08, 0.55, '高侧踢']]],
  ['dingxin', P1('dingxin'), [[25.28, 0.09, '上步揽'], [25.35, 0.16, '一膝'], [25.68, 0.43, 'X 斩'], [25.78, 0.5, '再一顶爆开']]],
  ['yanhui', P1('yanhui'), [[31.8, 0.15, '扫腿'], [32.0, 0.33, '侧踢光柱'], [32.65, 0.44, '闪步追'], [33.7, 1.22, '腾空侧踢']]],
  ['shifang', P1('shifang'), [[32.0, 0.2, '侧踢'], [32.65, 0.42, '闪步追'], [33.7, 0.64, '腾空旋踢'], [33.8, 1.6, '砸落']]],
  ['yingzong', P1('yingzong'), [[35.48, 0.1, '伏身红边'], [35.55, 0.16, '化作蓝影冲'], [35.68, 0.21, '白闪、菱光'], [36.08, 0.64, '蓝影飞踹'], [36.28, 0.94, '真身一脚']]],
  ['燃身-一寸崩', P1('yicunbeng', true), [[4.27, 0.3, '燃身·停半拍'], [4.34, 0.54, '燃身·直拳带火'], [4.47, 0.66, '命中火爆']]],
  ['燃身-缩地', P1('suodi', true), [[21.7, 0.03, '燃身·蹬地'], [21.9, 0.11, '到了'], [22.3, 0.27, '回身一拳带火']]],
  ['赤阳罡-解放', P3('p2jie'), [[70.7, 0.3, '双拳收拢'], [71.3, 0.62, '胸前光核'], [71.7, 1.05, '压成暗紫红、全身赤红'], [72.5, 2.0, '一人多高的火里往前走'], [73.7, 3.02, '白闪、前方巨大白光'], [74.0, 3.35, '火海'], [74.3, 3.6, '冲到身后']]],
  ['赤焰回旋腿', P3('p2xuan'), [[27.5, 0.2, '横扫火弧'], [27.8, 0.53, '旋身火环'], [29.45, 1.72, '前冲一脚带火'], [30.0, 2.22, '高踢'], [30.5, 2.75, '火柱冲天']]],
  ['燕旋', P3('p2yan'), [[81.0, 0.05, '冲刺'], [81.3, 0.22, '飓风环'], [81.5, 0.4, '环往前撞'], [81.7, 0.52, '巨大白黄爆']]],
  ['碎心踢', P3('p2sui'), [[83.8, 0.17, '跳起旋踢、风刃'], [84.0, 0.33, '落地风刃'], [84.3, 0.68, '火轮撞心'], [84.5, 0.85, '橙黄火爆']]],
  ['坠火踢', P3('p2zhui'), [[96.3, 0.17, '起跳'], [96.5, 0.34, '一字马、光核'], [96.7, 0.5, '劈落、火柱贯下'], [96.8, 0.68, '白黄火爆'], [97.0, 0.82, '碎石四飞']]],
  ['炎阳炮拳', P3('p2pao'), [[100.0, 0.08, '旋身甩火'], [100.5, 0.4, '举拳蓄火'], [101.2, 0.62, '一冲一拳'], [101.3, 0.72, '火龙往前喷'], [101.5, 0.9, '打飞']]],
  ['霸皇蹴', P3('p2bahuang'), [[103.5, 0.52, '闪步穿身'], [104.0, 1.05, '一排火柱'], [104.5, 1.6, '踏着火柱'], [105.0, 2.05, '压暗高踢火龙'], [105.5, 2.55, '整屏红「爆」'], [105.75, 2.85, '「爆」「碎」'], [106.25, 3.28, '整屏白火爆'], [106.5, 3.42, '火星满屏']]],
  ['逐日', P3('p2zhuri'), [[126.7, 0.22, '胸口光核'], [127.0, 0.5, '压成紫黑、紫电'], [129.3, 1.5, '白黄爆'], [129.5, 1.7, '橙黄、光环'], [129.8, 2.02, '青蓝、速度线'], [130.7, 2.95, '黑底焦地'], [133.5, 3.92, '橙黄大爆'], [134.5, 4.85, '赤日炸开'], [135.25, 5.75, '整屏太阳'], [136.7, 7.2, '收尾光环']]],
  ['无极一击', P3('wuji'), [[100.0, 0.08, '旋身'], [100.5, 0.55, '弓步蓄力'], [101.0, 0.9, '踩地一冲'], [101.2, 1.0, '一拳'], [101.5, 1.3, '打飞、火龙']]],
  ['千钧坠', P3('qianjunzhui'), [[17.0, 0.2, '下蹲'], [17.33, 0.6, '跳上天'], [17.667, 0.95, '空中一拳带火圈'], [17.833, 1.25, '斜着砸下'], [18.0, 1.42, '四层爆炸'], [18.333, 1.75, '碎石、烟']]],
];
for (const [name, pg, pairs] of MOVES) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const times = pairs.map((p) => p[1]).join(',');
  console.log(`== ${name}`);
  const r = spawnSync('node', ['tools/rec/cmp-shot.mjs', PORT, pg.q, pg.ready, pg.trig, times, RAW, name], { encoding: 'utf8', timeout: 480000 });
  process.stdout.write(r.stdout.split('\n').filter((l) => l.trim()).map((l) => '  ' + l).join('\n') + '\n');
  const rows = [];
  for (const [v, t, lab] of pairs) {
    const vf = join(RAW, `${name}-v${v.toFixed(3)}.png`);
    if (!existsSync(vf)) spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(v), '-i', REF, '-frames:v', '1', vf]);
    rows.push({ video: vf, game: join(RAW, `${name}-${t.toFixed(2)}.png`), vl: `视频 ${v.toFixed(2)}s`, gl: `${name} ${t.toFixed(2)} ${lab}` });
  }
  const jf = join(RAW, `${name}.rows.json`); writeFileSync(jf, JSON.stringify(rows));
  const c = spawnSync('python', ['tools/rec/cmp-compose.py', jf, join(OUT, `${name}.png`)], { encoding: 'utf8' });
  console.log(c.status === 0 ? `  → ${join(OUT, name + '.png')}` : '  拼图失败 ' + c.stderr.slice(0, 300));
}
