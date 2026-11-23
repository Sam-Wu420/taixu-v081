// 临时调试：结丹云雷双翼雷遁 vs 同境追兵，为何 2 秒就被追上
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
{ let s = (Number(process.env.SEED ?? 1) * 2654435761) >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
await import('./fixed-clock');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
g.reset(); g.story['openT'] = -1;
{ const up = g.update.bind(g); g.update = (dt: number) => { up(dt); const c = g.combat; c.enemies = c.enemies.filter((e: any) => e.pursuer || e.wing || e.npcId); }; }

function scenario(label: string, o: any) {
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.modalStack = [];
  const h = g.hero; h.realm = o.realm; h.stage = o.stage ?? 0; h.hp = 1; h.mp = 1; h.dead = false; h.equip = o.flight ? { flight: o.flight } : {};
  g.teleport(120000, 93000); g.player.flying = o.fly; g.player.sitting = false; g.concealed = !!o.conceal; g.senseBurstT = 0;
  g.input.keys.clear(); g.input.keys.add(o.dir ?? 'd'); if (o.boost) g.input.keys.add('shift');
  const held = () => { const k = [...g.input.keys]; return () => { for (const x of k) g.input.keys.add(x); }; };
  let hold = held();
  for (let i = 0; i < 60 && (i < 10 || Math.hypot(g.player.st.vx, g.player.st.vy) <= 10); i++) { g.modal = null; hold(); g.update(1 / 30); }
  console.log('BEFORE start', Math.round(g.player.x), Math.round(g.player.y), 'flying', g.player.flying, 'boost', g.player.boosting, 'speed', g.speed.toFixed(0), 'noFly', g.noFlyT.toFixed(1), 'bounds', JSON.stringify(g.bounds));
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: o.gap, force: true });
  const P = g.pursuit.cur; const d0 = Math.hypot(P.e.x - g.player.x, P.e.y - g.player.y);
  console.log('START', label, 'd0', d0.toFixed(0), 'realm', P.realm, P.stage, 'chase', P.chase.toFixed(0), 'v', P.v.toFixed(0), 'blinkCd', (P as any).blinkCd.toFixed(1), 'dunN', (P as any).dunN, 'wings', P.wings.length);
  const dt = 1 / 30, N = (o.secs ?? 10) * 30;
  let t = 0;
  for (let i = 0; i < N; i++) {
    g.modal = null; hold();
    g.update(dt); t += dt;
    if (g.pursuit.cur && g.pursuit.cur.wave > 0) { const e = g.pursuit.cur.e, dx = g.player.x - e.x, dy = g.player.y - e.y; g.input.keys.clear(); g.input.keys.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'd' : 'a') : (dy > 0 ? 's' : 'w')); if (o.boost) g.input.keys.add('shift'); hold = held(); }
    h.hp = Math.max(h.hp, 0.5); g.combat.invulnT = 5;
    const c = g.pursuit.cur;
    if (!c) { console.log('ESCAPED t=', t.toFixed(2)); return; }
    const d = Math.hypot(c.e.x - g.player.x, c.e.y - g.player.y);
    if (i % 4 === 0) console.log(`t=${t.toFixed(2)} p=${Math.round(g.player.x)},${Math.round(g.player.y)} v=${Math.hypot(g.player.st.vx, g.player.st.vy).toFixed(0)} fly=${g.player.flying ? 1 : 0} boost=${g.player.boosting ? 1 : 0} mp=${h.mp.toFixed(2)} | e=${Math.round(c.e.x)},${Math.round(c.e.y)} pv=${c.v.toFixed(0)} hideT=${(c.e.hideT ?? 0).toFixed(2)} d=${d.toFixed(0)}`);
    if (d < 500) { console.log('CAUGHT t=', t.toFixed(2)); return; }
  }
}
scenario('jd-thunder', { realm: 3, gap: 0, fly: true, boost: true, flight: 'art_fenglei', react: true, secs: 8 });
