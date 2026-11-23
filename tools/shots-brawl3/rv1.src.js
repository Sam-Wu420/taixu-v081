// 反向（try=voidfall&rev=1）：魔尊一记重击把你砸下界——你成了流星（坠落途中）
const xk = g.xukong, V = xk.fall;
await until(() => V.mode === 'dropped', 8000);
await sleep(500);
freeze();
return { mode: V.mode, h: Math.round(xk.h) };
