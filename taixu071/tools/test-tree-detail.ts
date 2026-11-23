// v0.71 树/角色「连续细节」冒烟：npx tsx tools/test-tree-detail.ts
//   验证细节量不是三档写死：det 连续取值时，叶簇/点叶数量单调变化（烘焙出来的墨迹量跟着单调）。
const CW = 512, CH = 512;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas } = await import('./env');
const { makeTree, TREE_DET } = await import('../src/gfx/tree');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

const cv: any = createCanvas(CW, CH);
const ctx: any = cv.getContext('2d');
const ink = (sp: any, det: number) => {
  const spr = makeTree(sp, 0 as any, 1234, 1, det);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  ctx.drawImage(spr.canvas, 20, 20, spr.w, spr.h);
  const d = ctx.getImageData(0, 0, CW, CH).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 16) n++;
  return n;
};

console.log('一、细节量连续：同一棵树，det 越小叶越少');
{
  const fine = (ink('broad', 1) + ink('broad', 0.85)) / 2;
  const coarse = (ink('broad', 0.65) + ink('broad', 0.45)) / 2;
  ok(fine > 0 && coarse > 0, `两档都有墨迹（细 ${fine.toFixed(0)} / 粗 ${coarse.toFixed(0)}）`);
  ok(fine > coarse, `细的一档更密：${(fine / coarse).toFixed(3)} 倍（叶簇按 det 抽稀、点叶数按 det 缩放）`);
  const a = ink('broad', 1), b = ink('broad', 0.45);
  ok(a > b, `最细 > 最粗（${a} > ${b}）——不是同一张图，只是随机抖动 ±3%`);
  ok(TREE_DET === 1, `烘焙结束后 TREE_DET 复位为 1（不污染后续绘制）`);
}

console.log('二、各树种都吃这个参数');
{
  const sps = ['broad', 'pine', 'cypress', 'bamboo', 'plum', 'willow'];
  const bad = sps.filter((sp) => { const a = ink(sp, 1), b = ink(sp, 0.45); return !(a > 0) || a < b * 0.98; });
  ok(bad.length === 0, `六个树种的 det=1 都不少于 det=0.45${bad.length ? `（异常：${bad.join(',')}）` : ''}`);
}

console.log('三、树形轮廓稳定（细了也不变形）');
{
  const a = makeTree('broad', 0 as any, 1234, 1, 1), b = makeTree('broad', 0 as any, 1234, 1, 0.45);
  const dh = Math.abs(a.h - b.h), dw = Math.abs(a.w - b.w);
  ok(dh < a.h * 0.15 && dw < a.w * 0.2, `轮廓尺寸基本一致（宽差 ${dw.toFixed(1)}px、高差 ${dh.toFixed(1)}px）`);
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
