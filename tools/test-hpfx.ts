// r11-lock 血条打击感：碎片的宽度和位置算法、怎么反应（碎片 / 滴血 / 回血）、按状态认伤害类型、粒子池有上限且会回收。
await import('./env');
const { shardSpan, splitShards, classifyHp, hitKind, dotOn, HpFx, HEAVY, watchHp, newWatch } = await import('../src/ui/hpfx');
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

// 1) 宽度与位置：900 宽掉 20%（100% → 80%），碎片合宽 180、左沿在 720（锚点在左，贴住掉血后红条的右沿）
{
  const s = shardSpan(900, 1, 0.8);
  ok(near(s.left, 720) && near(s.width, 180), `900 宽掉 20%：左沿 ${s.left}、宽 ${s.width}`);
  const t = shardSpan(600, 0.55, 0.3);
  ok(near(t.left, 180) && near(t.width, 150), `600 宽从 55% 掉到 30%：左沿 ${t.left}、宽 ${t.width}`);
  const u = shardSpan(300, 0.2, -0.5);
  ok(near(u.left, 0) && near(u.width, 60), '掉过头（打死）按 0 算：左沿 0、宽 = 原来那截');
  ok(shardSpan(300, 0.4, 0.6).width === 0, '涨了不出碎片');
}
// 2) 切块：分界首尾正好是那一截的两头，各块宽度都为正，合起来正好是那一截
{
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const n of [1, 2, 3, 5]) {
    const xs = splitShards(720, 180, n, rnd);
    let sum = 0, pos = true; for (let i = 0; i < xs.length - 1; i++) { const w = xs[i + 1] - xs[i]; sum += w; if (!(w > 0)) pos = false; }
    ok(xs.length === n + 1 && near(xs[0], 720) && near(xs[xs.length - 1], 900) && near(sum, 180) && pos, `切成 ${n} 块：首 ${xs[0]}、尾 ${xs[xs.length - 1].toFixed(2)}、合宽 ${sum.toFixed(2)}`);
  }
}
// 3) 怎么反应
{
  ok(classifyHp(1, 0.9, false).type === 'shard' && !classifyHp(1, 0.9, false).heavy, '掉 10%：碎片（不算重击）');
  ok(classifyHp(1, 1 - HEAVY - 0.01, false).heavy, `掉超过 ${HEAVY * 100}%：重击`);
  ok(classifyHp(0.8, 0.79, true).type === 'drip', '燃烧 / 中毒时小口掉血：滴血');
  ok(classifyHp(0.8, 0.7, true).type === 'shard', '持续掉血时挨了一大下：照样碎');
  ok(classifyHp(0.5, 0.51, false).type === 'none' && classifyHp(0.5, 0.51, false, 0.025).type === 'heal', '回血：攒够 3% 才出一次灵气');
  ok(classifyHp(0.5, 0.5, false).type === 'none', '没变：不动');
}
// 4) 认伤害类型：这一帧新挂上的状态优先
{
  ok(hitKind({ burn: { t: 3, dps: 1 } }, new Set()) === 'fire', '新挂上燃烧 → 火');
  ok(hitKind({ burn: { t: 3, dps: 1 }, shock: { t: 1, dps: 0 } }, new Set(['burn'])) === 'thunder', '已经在烧、新挂上麻痹 → 雷');
  ok(hitKind({ freeze: { t: 2, dps: 0 } }, null) === 'ice' && hitKind({ poison: { t: 2, dps: 1 } }, null) === 'poison', '冰 / 毒');
  ok(hitKind({}, null) === 'normal' && hitKind(undefined, null) === 'normal', '没状态 → 寻常');
  ok(dotOn({ poison: { t: 1, dps: 1 } }) && !dotOn({ freeze: { t: 1, dps: 0 } }), '持续掉血只认燃烧、中毒');
}
// 5) 粒子池：有上限，走完回收（不挂画布时只记账不画）
{
  const F = new HpFx();
  const fakeCanvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }), getContext: () => null } as unknown as HTMLCanvasElement;
  F.attach(fakeCanvas);
  const bar = { getBoundingClientRect: () => ({ left: 100, top: 20, width: 900, height: 12 }) } as unknown as Element;
  F.damage(bar, 1, 0.8, 'normal', false);
  const n1 = F.count;
  ok(n1 >= 3 && n1 <= 5, `一次寻常掉血：墨晕 + 两三块碎玉（${n1} 个）`);
  for (let i = 0; i < 400; i++) F.damage(bar, 1, 0.5, 'fire', true);
  ok(F.count <= 280, `连打四百下：同时活着的不超过上限（${F.count}）`);
  for (let i = 0; i < 200; i++) F.step(0.05, null);
  ok(F.count === 0, '走完全部回收');
  F.tier = () => 0; F.damage(bar, 1, 0.6, 'normal', true);
  ok(F.count >= 1 && F.count <= 2, `低画质：只留右端闪光（墨晕 + 朱砂印，${F.count} 个，没有碎片）`);
}
// 6) watchHp：连着看一条血条
{
  const w = newWatch(1);
  ok(watchHp(w, null, 0.8, undefined).type === 'shard' && w.v === 0.8, '记下这一帧的数值');
  ok(watchHp(w, null, 0.79, { burn: { t: 2, dps: 1 } }).type === 'drip', '烧着：滴血');
  ok(watchHp(w, null, 0.6, undefined, 'mp').type === 'shard', '法力也认（蓝色轻量版）');
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
