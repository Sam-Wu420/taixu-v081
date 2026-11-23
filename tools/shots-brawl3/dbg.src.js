const d = W.dummy; p.flying = true; p.z = p.zTarget = 420; d.x = p.x + 110; d.y = p.y + 4; d.flyH = 420; g.combat.lock = d; g.combat.manual = true;
await sleep(900);
const s0 = { dx: d.x - p.x, dy: d.y - p.y, z: d.z, fly: d.flyH, can: d.canFly, pz: p.z };
const b = B.body(d); b.poise = 0; b.breakT = 30; g.combat.cds.clear();
const pre = { hold: B.holdsPlayer, act: g.combat.canAct, cd: g.combat.cds.get("bx_bengshan"), st: B.stance, halted: g.halted, fly: g.isFlying, dead: g.hero.dead, xa: g.xukong.active }; B.heavy(true); const post = { wind: !!B.wind, q: !!B.queued, mv: B.mv ? B.mv.kind : null, log: B.log };
const log = [];
for (let i = 0; i < 40; i++) { await sleep(25); const bb = B.peek(d); log.push([Math.round(d.z), bb.air ? 1 : 0, bb.meteor, Math.round(bb.staggerT * 10)]); }
return { pre, post, s0, log: JSON.stringify(log), mv: !!B.mv };
