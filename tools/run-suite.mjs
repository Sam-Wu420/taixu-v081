// 全量测试，并行跑：node tools/run-suite.mjs [--jobs=4] [--only=seam,gore] [--part=k/n] [--out=目录]
//
// - 全量 = tools/test-*.ts + check-data + check-reachability，每项一个 npx tsx 子进程。
// - 按上次各项的耗时从长到短排（记在 tools/out/suite-times.json），慢的先开跑，最后不会剩一项拖着。
// - 卡时间的几项（断言里有「多少毫秒以内」的）放到最后单独跑：并行时 CPU 被挤，会误报「太慢」。
// - 默认 4 路：每个进程要建地形，占几百兆内存；内存宽裕可以 --jobs=6。
// - 每项的输出写到 --out 目录（默认 tools/out/suite/）下的 <名字>.log，总表 summary.txt；有失败时退出码为 1。
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, createWriteStream, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const jobs = Math.max(1, +arg('jobs', 4));
const out = arg('out', join(root, 'tools', 'out', 'suite'));
const only = arg('only', '')?.split(',').filter(Boolean);
/** 断言里卡着耗时的几项：最后单独跑 */
const SOLO = new Set(['test-living', 'test-city']);

let tests = readdirSync(join(root, 'tools')).filter((f) => /^test-.*\.ts$/.test(f)).map((f) => f.slice(0, -3));
tests.push('check-data', 'check-reachability');
if (only?.length) tests = tests.filter((t) => only.some((o) => t.includes(o)));
// --part=k/n：把全量按耗时从长到短排好后每 n 个取第 k 个（k 从 1 起）——内存紧、后台任务会被系统停掉时，分几批在前台跑完全量
const part = arg('part', '');
const timesFile = join(root, 'tools', 'out', 'suite-times.json');
const times = existsSync(timesFile) ? JSON.parse(readFileSync(timesFile, 'utf8')) : {};
const byTime = (a, b) => (times[b] ?? 20) - (times[a] ?? 20);
let par = tests.filter((t) => !SOLO.has(t)).sort(byTime), solo = tests.filter((t) => SOLO.has(t));
if (part) { const [k, n] = part.split('/').map(Number); par = par.filter((_, i) => i % n === k - 1); if (k !== n) solo = []; }
mkdirSync(out, { recursive: true });

const results = [];
const run = (name) => new Promise((done) => {
  const t0 = Date.now(), log = createWriteStream(join(out, name + '.log'));
  const p = spawn(process.execPath, [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join('tools', name + '.ts')], { cwd: root, env: process.env });
  p.stdout.pipe(log); p.stderr.pipe(log);
  const kill = setTimeout(() => p.kill(), 20 * 60 * 1000);
  p.on('close', (code) => {
    clearTimeout(kill); const sec = Math.round((Date.now() - t0) / 1000);
    times[name] = sec; results.push({ name, code: code ?? -1, sec });
    process.stdout.write(`${code === 0 ? 'ok  ' : 'FAIL'} ${name} ${sec}s  （${results.length}/${tests.length}）\n`);
    done();
  });
});

const t0 = Date.now();
const queue = [...par];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await run(queue.shift()); }));
for (const t of solo) await run(t);

const bad = results.filter((r) => r.code !== 0);
const total = Math.round((Date.now() - t0) / 1000);
writeFileSync(timesFile, JSON.stringify(times, null, 1));
writeFileSync(join(out, 'summary.txt'), results.map((r) => `${r.name} rc=${r.code} ${r.sec}s`).join('\n') + `\n共 ${results.length} 项，失败 ${bad.length} 项，用时 ${total} 秒（${jobs} 路并行）\n`);
console.log(`\n共 ${results.length} 项，过 ${results.length - bad.length}，失败 ${bad.length}，用时 ${Math.floor(total / 60)} 分 ${total % 60} 秒（${jobs} 路并行）`);
if (bad.length) { console.log('失败：' + bad.map((r) => r.name).join('、') + `\n日志在 ${out}`); process.exitCode = 1; }
