// 极远摘要（far summary）区块选择的微基准：
// 对比「每帧展开 Map + filter + 闭包 sort」与「按 epoch 缓存排序结果、每帧只过滤」的耗时。
// 运行：npx tsx tools/bench-far-chunks.ts [迭代次数]
//
// 这不是渲染真机基准，只测选择逻辑本身——真机里这段在每个极远帧都会跑一次。

const CHUNK = 1024;
const CAP = 4096;          // render.ts 里 farTreeChunks 的上限
const worldChunksX = 1407; // 4800*300 / CHUNK ≈ 1407（天南扩图后规格）
const worldChunksY = 762;  // 2600*300 / CHUNK ≈ 762

function makeChunks(n: number) {
  const map = new Map<number, { h: number }[]>();
  // 用确定性的伪随机铺满，模拟「已扫描过的区块」
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let cx = 0, cy = 0;
  while (map.size < n) {
    cx = Math.floor(rnd() * worldChunksX); cy = Math.floor(rnd() * worldChunksY);
    const key = cx * 4096 + cy;
    if (!map.has(key)) map.set(key, [{ h: 20 }, { h: 25 }]);
  }
  return map;
}

// ---------- 旧实现：每帧重建 ----------
function selectOld(map: Map<number, { h: number }[]>, fcx: number, fcy: number, l: number, t: number, r: number, b: number) {
  return [...map].filter(([key]) => {
    const cx = Math.floor(key / 4096), cy = key % 4096;
    return (cx + 1) * CHUNK >= l - 300 && cx * CHUNK <= r + 300 && (cy + 1) * CHUNK >= t - 300 && cy * CHUNK <= b + 300;
  }).sort(([a], [b2]) => {
    const dist = (k: number) => { const cx = Math.floor(k / 4096), cy = k % 4096; return (cx - fcx) ** 2 + (cy - fcy) ** 2; };
    return dist(a) - dist(b2) || a - b2;
  });
}

// ---------- 新实现：排序结果按 (相机块, epoch) 缓存，每帧只过滤 ----------
function makeNew() {
  let orderKey = '', order: number[] = [];
  return (map: Map<number, { h: number }[]>, epoch: number, fcx: number, fcy: number, l: number, t: number, r: number, b: number) => {
    const key = `${fcx},${fcy}|${epoch}`;
    if (key !== orderKey) {
      const keys = [...map.keys()];
      keys.sort((a, b2) => {
        const ax = Math.floor(a / 4096) - fcx, ay = (a % 4096) - fcy;
        const bx = Math.floor(b2 / 4096) - fcx, by = (b2 % 4096) - fcy;
        return (ax * ax + ay * ay) - (bx * bx + by * by) || a - b2;
      });
      order = keys; orderKey = key;
    }
    const out: [number, { h: number }[]][] = [];
    for (const k of order) {
      const cx = Math.floor(k / 4096), cy = k % 4096;
      if ((cx + 1) * CHUNK < l - 300 || cx * CHUNK > r + 300 || (cy + 1) * CHUNK < t - 300 || cy * CHUNK > b + 300) continue;
      const v = map.get(k); if (v) out.push([k, v]);
    }
    return out;
  };
}

const N = Number(process.argv[2] ?? 2000);
const map = makeChunks(CAP);
const fcx = Math.floor(worldChunksX / 2), fcy = Math.floor(worldChunksY / 2);
// 极远视野：整张图都在屏幕内
const l = 0, t = 0, r = worldChunksX * CHUNK, b = worldChunksY * CHUNK;

function bench(label: string, fn: () => unknown) {
  const first = fn(); // warmup
  const numeric = typeof first === 'number';
  const t0 = process.hrtime.bigint();
  let n = 0;
  for (let i = 0; i < N; i++) { const r = fn(); n += numeric ? (r as number) : (r as unknown[]).length; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const unit = numeric ? '计数' : '输出';
  console.log(`${label.padEnd(28)} ${(ms / N * 1000).toFixed(1).padStart(8)} µs/帧   (${N} 帧共 ${ms.toFixed(0)} ms, ${unit} ${(n / N).toFixed(0)})`);
  return ms / N;
}

console.log(`区块数 ${CAP}，视野覆盖全图，迭代 ${N} 次\n`);
const a = bench('旧：展开+filter+sort', () => selectOld(map, fcx, fcy, l, t, r, b));
const upd = makeNew();
const bnew = bench('新：缓存排序+过滤', () => upd(map, 1, fcx, fcy, l, t, r, b));
console.log(`\n每帧节省 ${((a - bnew) * 1000).toFixed(1)} µs，约 ${(a / bnew).toFixed(1)}×`);

// ---------- 山体：旧实现按视口矩形逐块 Map.get，新实现只遍历已扫到的区块 ----------
const MTN_CAP = 16384;
const mtn = makeChunks(MTN_CAP);
const mx0 = 0, mx1 = worldChunksX - 1, my0 = 0, my1 = worldChunksY - 1;

function selectMtnOld() {
  let n = 0;
  for (let cy = my0; cy <= my1; cy++) {
    if ((cy + 1) * CHUNK < t - 300 || cy * CHUNK > b + 300) continue;
    for (let cx = mx0; cx <= mx1; cx++) {
      if ((cx + 1) * CHUNK < l - 300 || cx * CHUNK > r + 300) continue;
      const v = mtn.get(cx * 4096 + cy);
      if (!v?.length) continue;
      n += v.length;
    }
  }
  return n;
}
function makeMtnNew() {
  let key = '', order: number[] = [];
  return (epoch: number) => {
    const k = `${epoch}`;
    if (k !== key) {
      const keys = [...mtn.keys()];
      keys.sort((x, y) => (x % 4096) - (y % 4096) || Math.floor(x / 4096) - Math.floor(y / 4096));
      order = keys; key = k;
    }
    let n = 0;
    for (const kk of order) {
      const cx = Math.floor(kk / 4096), cy = kk % 4096;
      if (cy < my0 || cy > my1 || cx < mx0 || cx > mx1) continue;
      const v = mtn.get(kk);
      if (!v?.length) continue;
      n += v.length;
    }
    return n;
  };
}

console.log(`\n山体：区块数 ${MTN_CAP}，视野覆盖全图，迭代 ${N} 次\n`);
const c = bench('旧：矩形逐块 Map.get', selectMtnOld);
const mnew = makeMtnNew();
const d = bench('新：遍历已扫区块', () => mnew(1));
console.log(`\n每帧节省 ${((c - d) * 1000).toFixed(1)} µs，约 ${(c / d).toFixed(1)}×`);

