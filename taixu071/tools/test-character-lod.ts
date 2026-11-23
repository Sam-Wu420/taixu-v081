// v0.71 角色布料物理回归：npx tsx tools/test-character-lod.ts
//   目的：锁死「远看时丝带被钉在原地、拉成一条横贯屏幕的长线」这类 bug。
//   曾经为了省电把物理 dt 乘上 LOD 权重，权重=0 时丝带停止积分 → 头带 / 袖子拖出一条长线。
const CW = 480, CH = 360;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas } = await import('./env');
const { CharState, drawCharacter, HANLI_LOOK } = await import('../src/gfx/character');
const { LOD } = await import('../src/gfx/lod');

let pass = 0, fail = 0;
const ok = (c: any, m: string) => { if (c) { pass++; console.log('ok   ', m); } else { fail++; console.log('FAIL ', m); } };

const cv: any = createCanvas(CW, CH);
const ctx: any = cv.getContext('2d');
/** 丝带最远一段相对「一段长」的倍数：正常应该 ≈ 段数，被钉住时会拉到几十上百 */
const worstStretch = (st: any) => {
  let worst = 0, worstKey = '';
  for (const [key, s] of st.strands) {
    for (let i = 1; i < s.n; i++) {
      const d = Math.hypot(s.x[i] - s.x[0], s.y[i] - s.y[0]) / Math.max(1e-3, s.len);
      if (d > worst) { worst = d; worstKey = `${key}#${i}`; }
    }
  }
  return { worst, worstKey, n: st.strands.size };
};

console.log('一、远看（权重≈0，曾经冻结物理的那一档）时丝带不甩长线');
{
  const st: any = new CharState(60, 120);
  st.action = 'run'; st.gait = 'run'; st.vx = 180; st.vy = 0; st.t = 0;
  const scale = 12 / 170;                       // 屏上约 12px 高：clothK ≈ 0
  for (let i = 0; i < 120; i++) {
    st.x += 3; st.t += 1 / 60; st.update(1 / 60);
    drawCharacter(ctx, HANLI_LOOK, st, scale, 1 / 60);
  }
  const { worst, worstKey, n } = worstStretch(st);
  ok(n > 0, `生成了 ${n} 条丝带（头带 / 袖子 / 发丝）`);
  ok(worst < 40, `最远点 ${worst.toFixed(1)} 段长（${worstKey}）——没有被钉在旧坐标上`);
}

console.log('二、暂停帧（dt = 0）丝带整体跟随锚点');
{
  const st: any = new CharState(60, 120);
  st.action = 'idle'; st.t = 0;
  for (let i = 0; i < 30; i++) { st.t += 1 / 60; st.update(1 / 60); drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60); }
  const before = worstStretch(st);
  st.x += 400;                                  // 瞬移（换图 / 复活）
  drawCharacter(ctx, HANLI_LOOK, st, 1, 0);     // 冻结帧：只做跟随，不做积分
  const after = worstStretch(st);
  ok(after.worst <= Math.max(before.worst + 1, 12), `瞬移后仍贴合（${before.worst.toFixed(1)} → ${after.worst.toFixed(1)} 段长）`);
}

console.log('三、速度尖峰不会把丝带甩出去');
{
  const st: any = new CharState(60, 120);
  st.action = 'run'; st.gait = 'run'; st.t = 0;
  for (let i = 0; i < 20; i++) { st.t += 1 / 60; st.update(1 / 60); drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60); }
  st.vx = 20000; st.vy = -15000;                // 被击退 / 瞬移那一下的速度尖峰
  for (let i = 0; i < 10; i++) { st.x += 1; st.t += 1 / 60; st.update(1 / 60); drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60); }
  const { worst } = worstStretch(st);
  ok(worst < 40, `速度 2 万仍然受控：最远 ${worst.toFixed(1)} 段长`);
}

console.log('四、LOD 只影响画不画，不影响物理时间步');
{
  const small = 6 / 170, big = 300 / 170;
  const mk = () => { const s: any = new CharState(60, 120); s.action = 'run'; s.gait = 'run'; s.vx = 160; s.t = 0; return s; };
  const a = mk(), b = mk();
  for (let i = 0; i < 90; i++) {
    a.x += 2; b.x += 2; a.t += 1 / 60; b.t += 1 / 60;
    a.update(1 / 60); b.update(1 / 60);
    drawCharacter(ctx, HANLI_LOOK, a, small, 1 / 60);
    drawCharacter(ctx, HANLI_LOOK, b, big, 1 / 60);
  }
  const wa = worstStretch(a).worst, wb = worstStretch(b).worst;
  ok(Math.abs(wa - wb) < Math.max(6, wb * 0.6), `小尺寸 ${wa.toFixed(1)} vs 大尺寸 ${wb.toFixed(1)} 段长——同一套积分结果`);
  ok(LOD.biasNow() > 0, '自适应偏置不影响时间步（只改细节权重）');
}

console.log('五、衣摆轮廓允许受控摆动，但高速不能无限扩张');
{
  const measure = (speed: number) => {
    const st: any = new CharState(0, 0);
    st.action = speed > 0 ? 'run' : 'idle'; st.gait = speed > 0 ? 'run' : null;
    st.vx = speed; st.vy = 0;
    const zs = 240 / 170;
    let hem = 0;
    for (let i = 0; i < 120; i++) {
      st.speed = speed; st.t += 1 / 60; st.x += speed / 60; st.update(1 / 60);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CW, CH);
      ctx.setTransform(zs, 0, 0, zs, CW / 2 - st.x * zs, 380 - st.y * zs);
      drawCharacter(ctx, HANLI_LOOK, st, 1, 1 / 60);
      hem = Math.max(hem, (st as any).hemExtent ?? 0);
    }
    return hem;
  };
  const h0 = measure(0), hMax = measure(400);
  ok(h0 > 0, `静止时衣摆最远沿 ${h0.toFixed(2)} 个局部单位`);
  ok(hMax <= h0 * 1.65 + 1e-5, `极速时 ${hMax.toFixed(2)}，轮廓受控（${(hMax / h0).toFixed(3)}× 静止值）`);
}

// 7) 远景点化：屏上还有几十像素时必须照常画人，只有真的很小时才画点
//    （之前漏乘 CHAR_UNITS_H，结果所有人被判成 1 像素、全场人物消失——这条是那个 bug 的回归）
{
  const ink = (zs: number) => {
    const st: any = new CharState();
    st.x = 250; st.y = 420; st.t = 1; st.update(1 / 60);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, CW, CH);
    ctx.setTransform(zs, 0, 0, zs, CW / 2 - st.x * zs, 200 - st.y * zs);
    drawCharacter(ctx, HANLI_LOOK, st, 1.12, 1 / 60);
    const d = ctx.getImageData(0, 0, CW, CH).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 10) n++;
    return n;
  };
  const near = ink(1.2), tiny = ink(0.05);
  ok(near > 1000, `屏上约 124px 时正常绘制（墨迹 ${near}）`);
  ok(tiny > 0, `屏上约 5px 时仍由角色 LOD 绘制（墨迹 ${tiny}，不会消失）`);
}

console.log(`\n结果：通过 ${pass}，失败 ${fail}`);
if (fail) process.exit(1);
