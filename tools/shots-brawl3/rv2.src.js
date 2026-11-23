// 接 rv1：没脱困，一路砸进界内——坠地那一刻之后一点
thaw();
const xk = g.xukong, V = xk.fall;
await until(() => V.log.includes('player-impact'), 10000);
await until(() => !B.pb.air, 3000);
await sleep(300);
freeze();
return { log: V.log.join(','), hp: g.hero.hp };
