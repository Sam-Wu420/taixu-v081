// v0.71 全局 LOD 算法冒烟：npx tsx tools/test-lod.ts
const {
  BAND, CHAR, GONE, k, keep, geom, res, cadence, smooth, pxPerUnit, screenPx,
  noteFrame, biasNow, emaMs,
} = await import('../src/gfx/lod');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

console.log('一、smoothstep 与连续等级');
{
  ok(smooth(0, 1, -1) === 0 && smooth(0, 1, 2) === 1, '两端夹紧');
  ok(Math.abs(smooth(0, 1, 0.5) - 0.5) < 1e-9, '中点为 0.5');
  let mono = true, prev = -1;
  for (let i = 0; i <= 40; i++) { const v = smooth(0.3, 0.5, i / 100); if (v < prev - 1e-12) mono = false; prev = v; }
  ok(mono, '单调不减（缩放来回时不会忽有忽无）');
  ok(k(BAND.deco, 0.31) > 0 && k(BAND.deco, 0.31) < 1, '波段内是中间值（渐变而非开关）');
  ok(k(BAND.deco, 0.2) === 0 && k(BAND.deco, 0.4) === 1, '波段外取 0 / 1');
}

console.log('二、密度抽样 keep()：连续抽稀而不是成片消失');
{
  const hash = (i: number) => ((i * 2654435761) % 1000) / 1000;
  const ratio = (kk: number, level: number) => {
    let n = 0;
    for (let i = 0; i < 4000; i++) if (keep(level, kk, hash(i))) n++;
    return n / 4000;
  };
  const r = [1, 0.75, 0.5, 0.25, 0].map((kk) => ratio(kk, 2));
  ok(r[0] === 1, `满权重 100% 保留（${(r[0] * 100).toFixed(1)}%）`);
  ok(r[4] === 0, `零权重全不画（${(r[4] * 100).toFixed(1)}%）`);
  let mono = true; for (let i = 1; i < r.length; i++) if (r[i] > r[i - 1] + 1e-9) mono = false;
  ok(mono, `权重越低保留越少：${r.map((x) => (x * 100).toFixed(0) + '%').join(' → ')}`);
  const mid = ratio(0.5, 1);
  ok(mid > 0.05 && mid < 0.95, `半权重时第 1 档是中间密度（保留 ${(mid * 100).toFixed(0)}%）`);
  const lvl = [1, 2].map((lv) => { let n = 0; for (let i = 0; i < 4000; i++) if (keep(lv, 0.55, hash(i))) n++; return n / 4000; });
  ok(lvl[0] > lvl[1], `档位越高越早抽掉：第 1 档 ${(lvl[0] * 100).toFixed(0)}% vs 第 2 档 ${(lvl[1] * 100).toFixed(0)}%`);
  ok(keep(0, 0, 0.999) && keep(0, 0, 0), '第 0 档永远保留');
}

console.log('三、几何简化 geom()：顶点数连续收缩且不低于下限');
{
  const seq = [0, 0.25, 0.5, 0.75, 1].map((kk) => geom(16, kk, 4));
  ok(seq[0] === 4 && seq[4] === 16, `4 → 16：${seq.join(',')}`);
  let mono = true; for (let i = 1; i < seq.length; i++) if (seq[i] < seq[i - 1]) mono = false;
  ok(mono, '单调不减');
  ok(seq.every((n) => n >= 4), '任何权重下都不少于 4 个顶点（形状不碎）');
  ok(geom(14, 0.5, 6) >= 6 && geom(14, 0.5, 6) < 14, '下限 6 时半权重落在中间');
}

console.log('四、贴图降档 res()：只烘到够用');
{
  const steps = [0.4, 0.8, 1.4, 2.2].map((p) => res(p));
  ok(steps[0] === 0.5 && steps[3] === 2, `像素需求越小档越低：${steps.join(',')}`);
  let mono = true; for (let i = 1; i < steps.length; i++) if (steps[i] < steps[i - 1]) mono = false;
  ok(mono, '单调不减');
  ok(res(2.5, 1.5) === 1.5, 'max 上限生效');
}

console.log('五、更新节流 cadence()：越远越省');
{
  ok(cadence(1) === 1 && cadence(0) === 4, `满权重每帧 / 零权重每 4 帧：${cadence(1)} / ${cadence(0)}`);
  let mono = true; let prev = 99;
  for (let kk = 0; kk <= 1.001; kk += 0.1) { const c = cadence(kk); if (c > prev) mono = false; prev = c; }
  ok(mono, `权重越高间隔越短（单调不增）：${[0, 0.3, 0.6, 0.9, 1].map((x) => cadence(x)).join(',')}`);
}

console.log('六、标尺与全局自适应偏置');
{
  const E1 = pxPerUnit(1, 1), E2 = pxPerUnit(2, 2);
  ok(E1 > 0 && E2 > E1, `pxPerUnit 随缩放/像素比增大：${E1.toFixed(2)} → ${E2.toFixed(2)}`);
  ok(screenPx(100, 1, 1) > 0, 'screenPx 由世界尺寸换算屏幕像素');
  const b0 = biasNow();
  for (let i = 0; i < 400; i++) noteFrame(33);          // 模拟 30fps
  const bLow = biasNow();
  ok(bLow < b0, `掉帧后整体降细节：bias ${b0.toFixed(2)} → ${bLow.toFixed(2)}（EMA ${emaMs().toFixed(1)}ms）`);
  for (let i = 0; i < 4000; i++) noteFrame(8);          // 模拟 125fps
  const bHi = biasNow();
  ok(bHi > bLow, `帧有余量后慢慢补回：bias ${bLow.toFixed(2)} → ${bHi.toFixed(2)}`);
  ok(bHi <= 1.15 && bLow >= 0.75, `偏置夹在 0.75~1.15：${bLow.toFixed(2)}..${bHi.toFixed(2)}`);
  ok(noteFrame(9999) === false || biasNow() === bHi, '切后台回来的巨帧不计入');
}

console.log('七、波段表自洽');
{
  const bands = { ...BAND, ...CHAR };
  const bad = Object.entries(bands).filter(([, b]) => !(b[0] < b[1]));
  ok(bad.length === 0, `所有波段都是 [起, 满] 且起 < 满${bad.length ? `（异常：${bad.map(([n]) => n).join(',')}）` : ''}`);
  ok(GONE > 0 && GONE < 0.1, `不可见阈值 ${GONE}（低于它才真正跳过）`);
}

console.log('八、树：精灵 ↔ 林色块 连续换挡');
{
  const { TREE_TIER, treeTiers, mountainSizePx, farCanopyAlpha, canopyAlpha, mountainTextureDetail } = await import('../src/gfx/lod');
  const { coverColor } = await import('../src/gfx/tree');
  const { coverAlpha } = await import('../src/world/landCover');
  // 两段权重必须严格互补，否则换挡处画面会变亮/变暗（用户能看出来）
  let worst = 0, mono = true, prev = Infinity;
  for (let px = 0; px <= 12; px += 0.05) {
    const t = treeTiers(px);
    worst = Math.max(worst, Math.abs(t.sprite + t.cover - 1));
    if (t.cover > prev + 1e-12) mono = false; prev = t.cover;
  }
  ok(worst < 1e-9, `精灵权重 + 林色权重 ≡ 1（最大偏差 ${worst.toExponential(1)}）`);
  ok(mono, '树越大，林色权重单调不增（不会来回闪）');
  ok(treeTiers(0.5).cover === 1 && treeTiers(0.5).sprite === 0, `不足 ${TREE_TIER[0]}px 只剩林色块，不消失`);
  ok(treeTiers(20).sprite === 1 && treeTiers(20).cover === 0, '足够大时全是真树精灵');
  const mid = treeTiers((TREE_TIER[0] + TREE_TIER[1]) / 2);
  ok(mid.cover > 0 && mid.sprite > 0, '换挡带内两者并存（交叉淡入，而非硬切）');
  ok(Math.abs(coverAlpha(0.5) - 1) < 1e-9 && coverAlpha(20) === 0, 'coverAlpha 与 treeTiers().cover 同源');
  // 林色必须与真树同色：同树种/季节/调恒定，不同树种要能区分开（一片林子看得出是什么林）
  const a1 = coverColor('pine' as any, 0), a2 = coverColor('pine' as any, 0);
  ok(a1 === a2, `同一树种同季林色恒定（${a1}），缩放时不会跳色`);
  const set = new Set(['pine', 'peach', 'maple', 'bamboo'].map((sp: any) => coverColor(sp, 0)));
  ok(set.size >= 3, `不同树种能分出不同林色（${set.size} 种）`);
  ok(coverColor('pine' as any, 1) !== coverColor('pine' as any, 3) || coverColor('peach' as any, 1) !== coverColor('peach' as any, 3), '换季林色随之变化');
  // 山的整体不通过 alpha 隐去；远景只降内部点缀，8px 轮廓持续存在。
  const farCanopy = canopyAlpha(24), nearCanopy = canopyAlpha(51);
  ok(farCanopyAlpha(0.02, nearCanopy, farCanopy) === farCanopy, '最远摘要保留宏观林色基准');
  ok(farCanopyAlpha(0.045, canopyAlpha(32), farCanopy) === canopyAlpha(32), '摘要进入点与常规林层权重完全对齐');
  ok(farCanopyAlpha(0.055, nearCanopy, farCanopy) === nearCanopy, '摘要退出点与常规林层权重完全对齐');
  let cprev = farCanopy, cmono = true;
  for (let z = 0.02; z <= 0.055; z += 0.001) { const v = farCanopyAlpha(z, canopyAlpha(Math.round(32 + 224 * Math.max(0, Math.min(1, (z - .045) / .12)))), farCanopy); if (v > cprev + 1e-12) cmono = false; cprev = v; }
  ok(cmono, '林色权重跨宏观/常规交界平滑单调，避免 zoom 阈值明暗闪动');
  ok(mountainSizePx(0) === 8 && mountainSizePx(5) === 8 && mountainSizePx(12) === 12, '山影尺寸在 5px / 12px 交接处连续');
  let mprev = 0, mmono = true;
  for (let px = 0; px <= 30; px += 0.1) { const v = mountainSizePx(px); if (v < mprev - 1e-12) mmono = false; mprev = v; }
  ok(mmono, '山影从 8px 轮廓到真实尺寸单调生长');
  ok(mountainTextureDetail(0) === 0.15 && mountainTextureDetail(220) === 1, '山体内部细节由低到高，外轮廓始终不变');
  let tprev = 0, tmono = true;
  for (let px = 0; px <= 300; px += 1) { const v = mountainTextureDetail(px); if (v < tprev - 1e-12) tmono = false; tprev = v; }
  ok(tmono, '山体内部点缀随屏幕尺寸单调增减');
}

console.log('九、林色底：用「画不出来的那部分」决定浓淡');
{
  const { treeDeficit, canopyAlpha, farCanopyAlpha, TREES_PER_CHUNK } = await import('../src/gfx/lod');
  ok(treeDeficit(0) === 1, '一棵都画不出时缺口为 1（整片都是色块）');
  ok(treeDeficit(TREES_PER_CHUNK) === 0, `画满 ${TREES_PER_CHUNK} 棵时缺口为 0（林色底退场）`);
  ok(treeDeficit(TREES_PER_CHUNK * 3) === 0, '画得比够还多也不会变成负的');
  let prev = 2, mono = true;
  for (let cap = 0; cap <= 300; cap += 5) { const d = treeDeficit(cap); if (d > prev + 1e-12) mono = false; prev = d; }
  ok(mono, '能画的树越多，缺口单调变小（缩放时不会忽浓忽淡）');
  // farSummary 用 24 棵代表树，但摘要退出时应与当下常规权重精确相接。
  const near = canopyAlpha(51);
  ok(Math.abs(farCanopyAlpha(0.055, near, canopyAlpha(24)) - near) < 1e-9, '宏观摘要退出点与常规林色底无亮度跳变');
  ok(canopyAlpha(200) === 0, '近景画得全时完全不铺色');
  ok(canopyAlpha(0) <= 0.85 + 1e-9, `林色底有上限 ${canopyAlpha(0).toFixed(2)}，不会盖住地形`);
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
