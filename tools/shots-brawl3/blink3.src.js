// 接 plow3：缩地追击——残影拉成一串，截住再轰（截在落点那一刻）
thaw();
await sleep(60);
B.pursue();
await sleep(90);
freeze();
return { ghosts: B.ghosts.length };
