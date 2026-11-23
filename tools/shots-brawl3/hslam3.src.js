// 接 hslam2：按一下追击——俯冲追砸，命中那一下
thaw();
B.pursue();
await until(() => !B.mv, 2000);
await sleep(120);
freeze();
return { hp: W.dummy.hp };
