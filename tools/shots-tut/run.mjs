// 收官 I：新手引导逐步实拍（入门一课每一步、三种尺寸）。用法：node tools/shots-tut/run.mjs [pc|land|tall] [端口]
// 每个 sNN-*.js 是 edge-shot 的步骤脚本：用 game.tutorial.jump() 跳到那一步、摆好场面，跑完立刻截图。图在 tools/out/r4-ui/。
import { spawnSync } from 'node:child_process';
const which = process.argv[2] ?? 'pc', port = process.argv[3] ?? '5241';
const SIZE = { pc: '1600x900', land: '844x390', tall: '390x844' }[which];
const url = `http://127.0.0.1:${port}/?auto=new&tutorial=1${which === 'pc' ? '' : '&touch=1'}`;
const D = 'tools/shots-tut/', O = `tools/out/r4-ui/tut-${which}-`;
const steps = [
  ['02-talk', 's02-talk'], ['03-gear', 's03-gear'], ['04-bag', 's04-bag'], ['05-pill', 's05-pill'], ['05b-pilltab', 's05b-pilltab'], ['06-spell', 's06-spell'],
  ['07-brawl', 's07-brawl'], ['07b-stance', 's07b-stance'], ['08-sit', 's08-sit'], ['09-fly', 's09-fly'], ['09b-rise', 's09b-rise'], ['10-map', 's10-map'], ['10b-mapopen', 's10b-mapopen'],
  ['11-sect', 's11-sect'], ['11b-town', 's11b-town'], ['11c-dlg', 's11c-dlg'], ['12-end', 's12-end'],
];
const args = ['tools/edge-shot.mjs', url, `--size=${SIZE}`, '--wait=16', `--eval=${D}s00-ready.js`, `--out=${O}01-move.png`, ...steps.map(([o, s]) => `--step=0.3|${O}${o}.png|${D}${s}.js`)];
const r = spawnSync('node', args, { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
process.exit(r.status ?? 1);
