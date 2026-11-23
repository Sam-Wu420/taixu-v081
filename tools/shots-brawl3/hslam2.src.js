// 接 hslam1：落地那一刻之后 0.35 息（大坑 / 冲天水柱），「追！」提示亮着
thaw();
await until(() => !B.isAir(W.dummy), 3000);
await sleep(380);
freeze();
return { chase: !!B.chaseTarget(), pieces: 0 };
