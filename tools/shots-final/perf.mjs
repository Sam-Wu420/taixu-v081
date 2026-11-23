// 收官总审：性能场景新旧版本交替量。用法：node tools/shots-final/perf.mjs --a=5202 --b=5247 [--scene=battle] [--rounds=3] [--seconds=30] [--repeats=2] [--qa=额外参数] [--qb=额外参数]
//   a、b 是两个开发服务器的端口（a＝现在的主线，b＝对照的旧提交开的工作副本）；一轮里 a、b 各跑一次，次序每轮对调。
//   页面参数：drive=free（帧间隔＝每帧更新加提交的实际耗时，不等显示）、nohide=1；画质两边都用默认的自适应（旧提交不认 q=）。--qa / --qb 给 a / b 各加一段参数，如 --qa="&gfx=0" 关掉光影对照。结果追加到 tools/out/final/perf.json。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const A = arg('a', '5202'), B = arg('b', ''), scene = arg('scene', 'battle'), rounds = Number(arg('rounds', '3')), seconds = arg('seconds', '30'), repeats = arg('repeats', '2');
mkdirSync('tools/out/final', { recursive: true });
const out = 'tools/out/final/perf.json', all = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : [];
const once = (port, tag, extra = '') => {
  const url = `http://127.0.0.1:${port}/tools/perf-acceptance.html?auto=new&map=tiannan&run=${scene}&drive=free&nohide=1${extra}&seconds=${seconds}&runs=${repeats}&warmup=5`;
  const r = spawnSync('node', ['tools/edge-shot.mjs', url, '--size=1600x900', '--wait=20', `--extra=${Number(seconds) * Number(repeats) + 240}`, '--eval=tools/shots-final/perf-wait.js'], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
  const m = /结果 (\[.*\])/.exec(r.stdout ?? ''); let rows = []; try { rows = m ? JSON.parse(m[1]) : []; } catch { /* */ }
  for (const x of rows) { all.push({ tag, port, scene, at: new Date().toISOString(), ...x }); console.log(`${tag}  p50 ${x.p50}  p95 ${x.p95}  max ${x.max}  avg ${x.avg}  >50ms ${x.over50}  帧 ${x.frames}  敌 ${x.enemies}  施法 ${x.casts}  ${x.valid ? '' : '（无效）'}`); }
  if (!rows.length) console.log(`${tag}  没出结果：${(r.stdout ?? '').split('\n').filter(Boolean).slice(-2).join(' | ')}`);
  writeFileSync(out, JSON.stringify(all, null, 1));
};
for (let i = 0; i < rounds; i++) { const order = B ? (i % 2 ? [[B, 'B 旧'], [A, 'A 新']] : [[A, 'A 新'], [B, 'B 旧']]) : [[A, 'A 新']]; for (const [p, t] of order) once(p, t, t.startsWith('A') ? arg('qa', '') : arg('qb', '')); }
