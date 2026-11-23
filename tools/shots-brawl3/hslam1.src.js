// 界内（日常那一版）：御剑在高空的顶，把罡气已破的木人往下砸——流星直坠（火尾），截在半空（try=brawl&at=sea|默认&calm=1&foe=0）
g.combat.enemies = g.combat.enemies.filter((q) => q === W.dummy);
const d = W.dummy; p.flying = true; p.z = p.zTarget = 420; d.x = p.x + 110; d.y = p.y + 4; d.flyH = 420; g.combat.lock = d; g.combat.manual = true;
g.setZoom(0.7);
await sleep(900);
const b = B.body(d); b.poise = 0; b.breakT = 30; g.combat.cds.clear();
B.heavy(true);
await until(() => B.isAir(d) && B.peek(d).z < 260, 3000);
freeze();
return { z: B.peek(d).z, meteor: B.peek(d).meteor };
