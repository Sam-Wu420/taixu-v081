// 犁水（try=brawl&at=sea&calm=1&foe=0）：贴着水面平着轰飞，V 形水墙和长白浪
const d = W.dummy; g.combat.enemies = g.combat.enemies.filter((q) => q === d);
d.x = p.x + 110; d.y = p.y + 4; d.flyH = 56; p.z = p.zTarget = 56; g.setZoom(0.75);
await sleep(500);
const b = B.body(d); b.poise = 0; b.breakT = 2; b.staggerT = 0; g.combat.cds.clear(); g.combat.lock = d;
g.input.mouse.active = true; g.input.mouse.x = p.x + 1400; g.input.mouse.y = p.y + 200; g.input.mouse.t = g.time;
B.heavy(false);
await until(() => B.isAir(d), 2000);
await sleep(520);
freeze();
return { air: B.isAir(d), z: Math.round(b.z) };
