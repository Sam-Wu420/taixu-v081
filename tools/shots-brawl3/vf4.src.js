// 接 vf3：落进界内——它从你脚下砸下去，落地那一刻之后一点（大坑 / 水柱）
thaw();
const xk = g.xukong, V = xk.fall, e = W.e;
await until(() => V.log.includes('replay') || V.log.includes('lying'), 8000);
await until(() => !B.isAir(e), 3000);
await sleep(300);
freeze();
return { log: V.log.join(','), phase: xk.phase, stagger: B.peek(e)?.staggerT, sub: B.peek(e)?.subT };
