// 收官 H4：标题页、各子弹窗、开场字幕实拍（三种尺寸）。用法：node tools/shots-title/run.mjs [pc|land|tall] [端口]
// 先往本机存两座假碑（碑林按钮才出来），再依次点开立道心、碑林、关于、万民卷宗、QQ 群、设置，最后立道心进开场字幕。图在 tools/out/r4-ui/。
import { spawnSync } from 'node:child_process';
const which = process.argv[2] ?? 'pc', port = process.argv[3] ?? '5241';
const SIZE = { pc: '1600x900', land: '844x390', tall: '390x844' }[which];
const url = `http://127.0.0.1:${port}/?titledemo=mods${which === 'pc' ? '' : '&touch=1'}`;
const D = 'tools/shots-title/', O = `tools/out/r4-ui/title-${which}-`;
const steps = [['1-dao', 't1-dao'], ['2-steles', 't2-steles'], ['3-about', 't3-about'], ['4-cloud', 't4-cloud'], ['5-qq', 't5-qq'], ['6-settings', 't6-settings'], ['7-intro', 't7-intro']];
const args = ['tools/edge-shot.mjs', url, `--size=${SIZE}`, '--wait=3', `--eval=${D}t0-steles.js`, `--step=5|${O}0-menu.png`, ...steps.map(([o, s]) => `--step=0.2|${O}${o}.png|${D}${s}.js`)];
process.exit(spawnSync('node', args, { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).status ?? 1);
