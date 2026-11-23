// 收官总审：把每个试玩入口和真实游戏页按尺寸实拍一遍。图和探针结果在 tools/out/final/（log.json 记每张图进没进场景）。
// 用法：node tools/shots-final/run.mjs [--port=5202] [--jobs=2] [--only=名字片段,片段] [--wait=10]
//   每个入口拍两张：探针（probe.js）等到入口摆好场面（性能面板藏起来）再过 6 秒一张（-a），再过 8 秒一张（-b）——有些场面是动的（拼招、坠落、海兽破水）。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = arg('port', '5202'), JOBS = Number(arg('jobs', '2')), WAIT = Number(arg('wait', '10')), ONLY = arg('only', '').split(',').filter(Boolean);
const OUT = 'tools/out/final/'; mkdirSync(OUT, { recursive: true });
const SIZE = { pc: '1600x900', land: '844x390', tall: '390x844' };
const T = (q) => `/tools/perf-acceptance.html?auto=new&map=tiannan&try=${q}`;
const all3 = ['pc', 'land', 'tall'], pc = ['pc'];
/** [名字, 路径, 尺寸] */
const LIST = [
  ['title', '/', all3], ['title-mods', '/?titledemo=mods', pc], ['loading', '/?shot=loading', all3],
  ['game', '/?auto=new', all3], ['tutorial', '/?auto=new&tutorial=1', all3],
  ['mijing', T('mijing'), all3], ['mijing-big-tomb', T('mijing&tier=3&theme=tomb'), pc], ['mijing-forest', T('mijing&theme=forest'), pc], ['mijing-gate', T('mijing&gate=1'), pc],
  ['bag', T('bag'), all3], ['stall', T('stall'), all3], ['stall-open', T('stall&open=1'), all3],
  ['brawl', T('brawl'), all3], ['brawl-clash', T('brawl&clash=1'), ['pc', 'tall']], ['brawl-rocks', T('brawl&at=rocks'), pc], ['brawl-sea', T('brawl&at=sea'), pc], ['brawl-school', T('brawl&foe=school'), pc],
  ['voidfall', T('voidfall'), pc], ['voidfall-sea', T('voidfall&to=sea'), pc], ['voidfall-rev', T('voidfall&rev=1'), pc],
  ['wubian', T('wubian'), all3],
  ...['shadow', 'fish', 'kraken', 'jiao', 'whale', 'wraith', 'ray', 'boat', 'abyss', 'ruin', 'ghostship', 'altar', 'swim', 'storm', 'rift', 'ghost'].map((a) => [`wubian-${a}`, T(`wubian&at=${a}`), pc]),
  ...['sea', 'sand', 'ice', 'lava', 'ming', 'miasma', 'local'].map((k) => [`jueyu-${k}`, T(`jueyu&kind=${k}&at=core`), pc]),
  ['jueyu-sand-fog', T('jueyu&kind=sand&at=fog'), pc], ['jueyu-lava-abyss', T('jueyu&kind=lava&at=abyss'), pc],
  ...['inn', 'tavern', 'shop', 'hall'].map((k) => [`indoor-${k}`, T(`indoor&kind=${k}&in=1`), k === 'inn' ? all3 : pc]),
  ['indoor-inn-out', T('indoor&kind=inn'), pc], ['indoor-tavern-night', T('indoor&kind=tavern&in=1&night=1'), pc],
  ['huajuan', T('huajuan'), pc], ['huajuan-in', T('huajuan&in=1'), pc],
  ['gfx-yuejing-night', T('gfx&at=yuejing&hour=night'), pc], ['gfx-field-dusk-fight', T('gfx&at=field&hour=dusk&fight=1'), pc], ['gfx-huangfeng-dawn', T('gfx&at=huangfeng&hour=dawn'), pc],
  ['gfx-drops', T('gfx&drops=1'), pc], ['gfx-zhen', T('gfx&zhen=1'), pc], ['gfx-off', T('gfx&at=yuejing&hour=night&gfx=0'), pc],
  ['nuoyi', T('nuoyi'), pc], ['lanjie', T('lanjie'), pc], ['dunkong', T('dunkong'), pc], ['xukong', T('xukong'), pc], ['voidfight', T('voidfight'), ['pc', 'tall']],
  ['party', T('party'), pc], ['auction', T('auction'), all3], ['wanbao', T('wanbao'), all3],
];
const jobs = [];
for (const [name, path, sizes] of LIST) for (const s of sizes) {
  const id = `${name}-${s}`;
  if (ONLY.length && !ONLY.some((o) => id.includes(o))) continue;
  jobs.push({ id, url: `http://127.0.0.1:${PORT}${path}${s === 'pc' ? '' : (path.includes('?') ? '&' : '?') + 'touch=1'}`, size: SIZE[s] });
}
const logPath = OUT + 'log.json';
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {};
function shoot(j, wait) {
  return new Promise((res) => {
    const c = spawn('node', ['tools/edge-shot.mjs', j.url, `--size=${j.size}`, `--wait=${wait}`, '--extra=170', '--eval=tools/shots-final/probe.js', `--out=${OUT}${j.id}-a.png`, `--step=8|${OUT}${j.id}-b.png|tools/shots-final/probe.js`],
      { env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
    let out = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
    c.on('exit', (code) => { const m = [...out.matchAll(/结果 (\{.*\})/g)].map((x) => { try { return JSON.parse(x[1]); } catch { return null; } }); res({ code, probes: m, tail: out.split('\n').filter(Boolean).slice(-2).join(' | ') }); });
  });
}
let next = 0, bad = 0;
async function worker() {
  for (;;) {
    const j = jobs[next++]; if (!j) return;
    let r = await shoot(j, WAIT);
    const isTitle = /title|loading/.test(j.id);
    const good = (x) => x.code === 0 && (isTitle || !!x.probes.at(-1)?.ready);
    if (!good(r)) r = await shoot(j, WAIT + 20);   // 没进场景（Vite 现编译、机器忙）：再拍一次
    const ok = good(r);
    if (!ok) bad++;
    log[j.id] = { ok, url: j.url, probes: r.probes, tail: ok ? undefined : r.tail };
    writeFileSync(logPath, JSON.stringify(log, null, 1));
    console.log(`${ok ? '✓' : '✗'} ${j.id}  ${JSON.stringify(r.probes.at(-1) ?? null)}`);
  }
}
console.log(`共 ${jobs.length} 张（每张两帧），${JOBS} 路`);
await Promise.all(Array.from({ length: JOBS }, worker));
console.log(bad ? `有 ${bad} 张没进场景，见 ${logPath}` : '全部进了场景');
process.exit(bad ? 1 : 0);
