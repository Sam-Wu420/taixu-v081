// P10 城池新布局的无界面检查：npx tsx tools/test-city.ts [--all]
//   · 两座样板城（嘉禾城、梁京）院落 / 房屋数在目标范围、占地对
//   · 院落、铺面不压水、彼此不重叠
//   · 街巷连通：城外关厢的路口经城门能走到城里各处；导航点不落在碰撞块里
//   · 布局生成耗时；地形整平后城内高差
// --all：localStorage taixu.city=all，把南荒所有城都排一遍（铺开前自测）
import './env';
import assert from 'node:assert/strict';

// 参数：--sample 只看两座样板城；--map=dajin|luanxing 换图；--realm=编号 换到别界（按种子造的图）
const ALL = !process.argv.includes('--sample');
const argOf = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
(globalThis as { __TAIXU_CITY?: string }).__TAIXU_CITY = ALL ? 'all' : 'sample';
if (argOf('map')) (globalThis as { __TAIXU_MAP?: string }).__TAIXU_MAP = argOf('map');
await import('../src/data/zhujie');   // 别界的图由它登记
if (argOf('realm')) { const { setActiveMap } = await import('../src/data/world'); assert.ok(setActiveMap(`realm-${argOf('realm')}` as never), '换到别界失败'); }
const { Terrain } = await import('../src/world/terrain');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { getLayout, layoutLocation, LOC_SCALE } = await import('../src/gfx/building');
const { usesNewCity } = await import('../src/gfx/citySize');

const t0 = performance.now();
const terrain = new Terrain();
for (const _ of terrain.buildSteps()) void _;
console.log(`建地形（含全部 ${LOCATIONS.length} 处地点布局）${(performance.now() - t0).toFixed(0)} ms`);

type Rect = { x0: number; y0: number; x1: number; y1: number };
let fails = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { fails++; console.log('  ✗ ' + msg); } };
const targets: Record<string, { houses: [number, number]; edge: [number, number] }> = {
  jiayuan: { houses: [600, 1100], edge: [14000, 18500] },
  yuejing: { houses: [1000, 3600], edge: [25000, 32000] },
};
const cities = LOCATIONS.filter((l) => usesNewCity(l));
console.log(`当前地图 ${LOCATIONS.find((l) => l.map)?.map}：新布局的城 ${cities.length} 座`);
assert.ok(cities.length >= 1, '至少一座城');
for (const loc of cities) {
  // 生成耗时：重排几遍取中位数
  const ts: number[] = [];
  for (let k = 0; k < 5; k++) { const a = performance.now(); layoutLocation(loc); ts.push(performance.now() - a); }
  ts.sort((a, b) => a - b);
  const L = getLayout(loc) as ReturnType<typeof getLayout> & { cityInfo?: { courts: number; houses: number; pieces: number; blocks: number; extent: Rect; walls: Rect[]; grade: string } };
  const info = L.cityInfo!;
  assert.ok(L.final && info, loc.id + ' 应走新布局');
  const S = LOC_SCALE, ox = loc.x * WORLD_SCALE, oy = loc.y * WORLD_SCALE;
  const ext = info.extent, walls = info.walls;
  const wallEdge = Math.max(...walls.map((r) => r.x1)) - Math.min(...walls.map((r) => r.x0));
  const kinds: Record<string, number> = {};
  for (const p of L.pieces) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
  console.log(`\n${loc.name}（${loc.id}，${info.grade}，${(info as { style?: string }).style}）：院落 ${info.courts}、房屋约 ${info.houses} 间、构件 ${L.pieces.length}、碰撞块 ${L.blocks.length}、地面 ${L.ground.length}、灯 ${L.lights.length}、导航点 ${L.nav!.pts.length / 2}、落脚点 ${L.spots!.length}、门 ${L.doors!.length}`);
  console.log(`  城墙东西 ${wallEdge.toFixed(0)}、连护城河关厢占地 ${(ext.x1 - ext.x0).toFixed(0)} × ${(ext.y1 - ext.y0).toFixed(0)}（世界单位）；生成 ${ts[2].toFixed(1)} ms（5 次中位，最快 ${ts[0].toFixed(1)}）`);
  console.log('  构件：' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('、'));
  const tg = targets[loc.id];
  if (tg) {
    check(info.houses >= tg.houses[0] && info.houses <= tg.houses[1], `房屋数 ${info.houses} 不在 ${tg.houses}`);
    check(wallEdge + 2 * 1060 >= tg.edge[0] && wallEdge + 2 * 1060 <= tg.edge[1], `连护城河边长 ${wallEdge + 2120} 不在 ${tg.edge}`);
  }
  check(ts[2] < 60, `生成太慢 ${ts[2].toFixed(1)} ms`);
  // 店铺设施：原版每座城都有的这几样一样不少（townLayout.ts 的 city()）
  { const have = new Set((L.doors ?? []).map((d) => d.fn)); const miss = ['pill', 'artifact', 'talisman', 'rest', 'tavern', 'auction', 'market', 'board', 'teleport'].filter((f) => !have.has(f as never)); check(!miss.length, `缺设施 ${miss.join('、')}`); }
  // —— 院落、铺面：不压水、不重叠
  const foot: Rect[] = [];
  for (const p of L.pieces) {
    if (p.kind !== 'ccourt' && p.kind !== 'cshop') continue;
    const x = p.x * S, y = p.y * S, w = p.p.w as number, d = p.p.d as number, r = (p.p.r as number) ?? 0;
    const f = r === 0 ? { x0: x - w / 2, y0: y - d, x1: x + w / 2, y1: y } : r === 2 ? { x0: x - w / 2, y0: y, x1: x + w / 2, y1: y + d }
      : r === 1 ? { x0: x - d, y0: y - w / 2, x1: x, y1: y + w / 2 } : { x0: x, y0: y - w / 2, x1: x + d, y1: y + w / 2 };
    foot.push(f);
    let wet = 0;
    for (const [u, v] of [[f.x0 + 20, f.y0 + 20], [f.x1 - 20, f.y0 + 20], [f.x0 + 20, f.y1 - 20], [f.x1 - 20, f.y1 - 20], [(f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2]]) if (!terrain.isLand(ox + u, oy + v)) wet++;
    check(wet === 0, `${p.kind} 压在水上 @${x.toFixed(0)},${y.toFixed(0)}`);
  }
  {
    const G = new Map<string, number[]>(); let over = 0;
    foot.forEach((f, i) => { for (let gx = Math.floor(f.x0 / 1000); gx <= Math.floor(f.x1 / 1000); gx++) for (let gy = Math.floor(f.y0 / 1000); gy <= Math.floor(f.y1 / 1000); gy++) { const k = gx + ',' + gy; const a = G.get(k) ?? []; for (const j of a) { const g = foot[j]; if (f.x0 < g.x1 - 12 && f.x1 > g.x0 + 12 && f.y0 < g.y1 - 12 && f.y1 > g.y0 + 12) over++; } a.push(i); G.set(k, a); } });
    check(over === 0, `院落 / 铺面互相重叠 ${over} 处`);
  }
  // —— 连通：40 见方的格子，碰撞块不可走，从城外关厢的远端出发灌水
  {
    const C = 40, X0 = ext.x0 - 400, Y0 = ext.y0 - 400, nx = Math.ceil((ext.x1 - ext.x0 + 800) / C), ny = Math.ceil((ext.y1 - ext.y0 + 800) / C);
    const solid = new Uint8Array(nx * ny);
    for (const b of L.blocks) {
      const a0 = Math.max(0, Math.floor((b.x * S - X0) / C)), a1 = Math.min(nx - 1, Math.floor(((b.x + b.w) * S - X0) / C));
      const c0 = Math.max(0, Math.floor((b.y * S - Y0) / C)), c1 = Math.min(ny - 1, Math.floor(((b.y + b.h) * S - Y0) / C));
      for (let j = c0; j <= c1; j++) for (let i = a0; i <= a1; i++) solid[j * nx + i] = 1;
    }
    const seen = new Uint8Array(nx * ny), q: number[] = [0]; seen[0] = 1;
    for (let h = 0; h < q.length; h++) { const c = q[h], i = c % nx, j = (c - i) / nx; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const k = b * nx + a; if (seen[k] || solid[k]) continue; seen[k] = 1; q.push(k); } }
    const at = (x: number, y: number) => { const i = Math.floor((x - X0) / C), j = Math.floor((y - Y0) / C); return i >= 0 && j >= 0 && i < nx && j < ny ? j * nx + i : -1; };
    // 导航点：落在块里的、走不到的
    const P = L.nav!.pts; let inBlock = 0, unreach = 0;
    const bad: string[] = [];
    for (let i = 0; i < P.length; i += 2) {
      const k = at(P[i] * S, P[i + 1] * S);
      if (k < 0) continue;
      if (solid[k]) {
        inBlock++;
        if (bad.length < 12) { const x = P[i] * S, y = P[i + 1] * S; const bi = L.blocks.findIndex((b) => x >= b.x * S - C && x <= (b.x + b.w) * S + C && y >= b.y * S - C && y <= (b.y + b.h) * S + C); bad.push(`${x.toFixed(0)},${y.toFixed(0)}[${(info as any).blkTag?.[bi] ?? '?'}]`); }
      }
      else if (!seen[k]) unreach++;
    }
    console.log(`  连通：导航点 ${P.length / 2}，落在碰撞块里 ${inBlock}${bad.length ? '（' + bad.join(' ') + '）' : ''}，从城外走不到 ${unreach}`);
    check(inBlock <= P.length / 2 * 0.01, `导航点落在碰撞块里太多 ${inBlock}`);
    check(unreach <= P.length / 2 * 0.01, `走不到的导航点太多 ${unreach}`);
    // 城中心（进城面板）走得到
    const ck = at(0, 300);
    check(ck >= 0 && !!seen[ck] || !!seen[at(0, 0)], '城中心走不到');
    // 剧情 / 传送锚点：传送阵前（每座城）、邹府门口（嘉禾城）都在走得到的街上
    const anchors = (L as { anchors?: Record<string, { x: number; y: number }> }).anchors ?? {};
    for (const key of loc.id === 'jiayuan' ? ['tp', 'mofu', 'mofuIn'] : ['tp']) { const a = anchors[key]; const k2 = a ? at(a.x * S, a.y * S) : -1; check(!!a && k2 >= 0 && !!seen[k2], `锚点 ${key} 缺失或走不到`); }
    // 敞门的院子：从街上走得进里院（两进院垂花门里头那块院心）
    let open = 0, inOk = 0; const shut: string[] = [];
    for (const p of L.pieces) {
      if (p.kind !== 'ccourt' || !p.p.open) continue;
      open++;
      const w0 = p.p.w as number, d = p.p.d as number, big = p.p.k === 'big', w = big ? Math.round(w0 * 0.6) : w0;
      const cx = p.x * S + (big ? -w0 / 2 + w / 2 : 0), yF = p.y * S;
      const zMid = -8 - 0.3 * d, zH = -d + 23 + 110 + 30 + Math.min(190, d * 0.2);
      // 里院院心几处（荷花缸在正中，取两侧）
      let ok = false;
      for (const fx of [-0.18, -0.1, 0.1, 0.18]) for (const fy of [0.35, 0.5, 0.65]) { const k2 = at(cx + w * fx, yF + zMid + (zH - zMid) * fy); if (k2 >= 0 && seen[k2]) ok = true; }
      if (ok) inOk++; else if (shut.length < 6) shut.push(`${cx.toFixed(0)},${yF.toFixed(0)}`);
    }
    console.log(`  敞门院落 ${open} 座，走得进里院 ${inOk}${shut.length ? '（进不去：' + shut.join(' ') + '）' : ''}`);
    check(inOk >= open * 0.9, `敞门院落走不进去 ${open - inOk} 座`);
    // 导航图连通
    const adj = L.nav!.adj, comp = new Int32Array(adj.length).fill(-1); let nc = 0, big = 0;
    for (let i = 0; i < adj.length; i++) if (comp[i] < 0) { let n = 0; const st = [i]; comp[i] = nc; while (st.length) { const c = st.pop()!; n++; for (const v of adj[c]) if (comp[v] < 0) { comp[v] = nc; st.push(v); } } big = Math.max(big, n); nc++; }
    console.log(`  导航图 ${nc} 片，最大一片 ${big} / ${adj.length}`);
    // 海岛城：街可能被海湾隔成几片（各片之间是水，不硬接），只要求大半连着
    const isle = (info as { style?: string }).style === 'isle';
    check(big >= adj.length * (isle ? 0.75 : 0.97), `导航图不连通：最大一片只有 ${big}/${adj.length}`);
  }
  // —— 地形：城墙圈里高差
  {
    let lo = 1e9, hi = -1e9;
    for (const r of walls) for (let y = r.y0; y <= r.y1; y += 500) for (let x = r.x0; x <= r.x1; x += 500) { if (!terrain.isLand(ox + x, oy + y)) continue; const h = terrain.surface!.heightAt(ox + x, oy + y); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    // 护城河、关厢也要在平地上
    // 每块城墙圈外扩 1350（护城河外沿）一圈
    const pts: [number, number][] = [];
    for (const r of walls) {
      const m = { x0: r.x0 - 1350, y0: r.y0 - 1350, x1: r.x1 + 1350, y1: r.y1 + 1350 };
      for (let y = m.y0; y <= m.y1; y += 500) pts.push([m.x0, y], [m.x1, y]);
      for (let x = m.x0; x <= m.x1; x += 500) pts.push([x, m.y0], [x, m.y1]);
    }
    const others = LOCATIONS.filter((o) => o !== loc && Math.abs((o.x - loc.x) * WORLD_SCALE) < 20000 && Math.abs((o.y - loc.y) * WORLD_SCALE) < 20000);
    const nearOther = (x: number, y: number) => others.some((o) => Math.hypot((o.x - loc.x) * WORLD_SCALE - x, (o.y - loc.y) * WORLD_SCALE - y) < 2600);
    for (const [x, y] of pts) { if (!terrain.isLand(ox + x, oy + y) || nearOther(x, y)) continue; const h = terrain.surface!.heightAt(ox + x, oy + y); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    console.log(`  城内连护城河、关厢地面高差 ${(hi - lo).toFixed(0)}（${lo.toFixed(0)} ~ ${hi.toFixed(0)}）；地点范围半径 ${(L.gw * S * 0.42).toFixed(0)}`);
    check(hi - lo < 260, `城内高差太大 ${(hi - lo).toFixed(0)}`);
  }
}
console.log(fails ? `\n失败 ${fails} 项` : '\n全部通过');
process.exit(fails ? 1 : 0);
