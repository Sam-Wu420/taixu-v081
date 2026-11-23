// 拼招（try=brawl&clash=1）：三选一阶段过半——对方摆出起手式；两股气劲相持；旁边的杂字压住了
await until(() => B.clash.on && B.clash.st.phase === 'pick', 6000);
await until(() => B.clash.st && B.clash.st.t > 0.56, 3000);
freeze();
return { clash: B.clash.hud(), texts: g.combat.texts.length };
