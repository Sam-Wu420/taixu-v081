// 接 vf2：按一下追击——俯冲追下去（途中）
thaw();
const xk = g.xukong, V = xk.fall;
B.key('dodge', false);
await sleep(700);
freeze();
return { plunge: V.plunge, h: Math.round(xk.h), phase: xk.phase };
