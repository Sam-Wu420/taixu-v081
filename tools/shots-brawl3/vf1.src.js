// 虚空坠界（try=voidfall[&to=sea]）：罡气已破的魔修在面前，按住下降一记崩山——出拳那一下
const xk = g.xukong, V = xk.fall;
await sleep(1500);
g.combat.cds.clear(); g.hero.mp = 1;
B.heavy(true);
await until(() => V.mode === 'meteor', 2000);
await sleep(90);
freeze();
return { mode: V.mode, h: xk.h };
