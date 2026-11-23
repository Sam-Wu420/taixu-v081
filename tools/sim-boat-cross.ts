// 收官 B3：四个境界乘灵舟横渡无边海（南荒东岸 → 沧溟海西岸）的模拟，给交付说明里的「各境界能不能过、怎么过」。
// 两种海况：calm＝没有天象、没有海兽、不挨打（只看灵力和航程够不够）；wild＝天象、海兽都开着，人不还手（只驾船、法力低了就在船上打坐）。
// 用法：npx tsx tools/sim-boat-cross.ts [--mode=calm|wild] [--realm=2,3,4,5] [--boat=lz_wupeng]
import './env';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const W = await import('../src/data/world');
const G = await import('../src/world/game');
const C = await import('../src/world/cultivation');
const { shoreField } = await import('../src/world/jueyuField');
const g = await G.createGame(() => {});
g.reset(); shoreField.ensure();
const p = g.player, J = g.jueyu, B = J.boat;
const mode = arg('mode', 'calm'), realms = arg('realm', '2,3,4,5').split(',').map(Number), boatArg = arg('boat', '');
J.calm = mode === 'calm'; g.seabeast.off = mode === 'calm';
const Y = Number(arg("y", "120000"));   // 同 test-jueyu 的横渡（这一纬上近岸没有挡路的小岛）
let coast = 560000; for (let x = 520000; x <= W.WORLD_W; x += 250) if (g.terrain.isLand(x, Y)) coast = x;
const NAMES = ['凡人', '炼气', '筑基', '结丹', '元婴', '化神'];
for (const realm of realms) {
  if (W.ACTIVE_MAP !== 'tiannan') (g as any).crossSeam(W.MAP_SEAMS.luanxing!.find((s) => s.sea)!);
  g.hero.realm = realm; g.hero.stage = 0; g.hero.exp = 0; g.hero.hp = 1; g.hero.mp = 1;
  const id = boatArg || (realm <= 2 ? 'lz_wupeng' : 'lz_polang');
  C.addItem(g.hero, id, 1); (g.ws.flags as any).lz = { hp: {}, day: g.day };
  for (const k of ['pill_huiqi', 'pill_liaoshang']) C.addItem(g.hero, k, 10);
  g.teleport(coast + 700, Y); p.flying = true; p.z = p.zTarget = 56; g.combat.reset(); J.reset();
  for (let i = 0; i < 3; i++) g.update(0.1);
  B.deploy(id); for (let i = 0; i < 2; i++) g.update(0.1);
  let lastX = p.x, stuckT = 0, dodge = 0;
  let t = 0, sits = 0, sitT = 0, minMp = 1, minHp = 1, minBoat = 1, result = '', crossed = false, pills = 0;
  const t0 = g.day;
  while (t < 2400) {
    if (g.modal) g.closeModal(true); g.paused = false;
    if (mode === 'calm') { g.combat.invulnT = 1e9; g.combat.enemies.length = 0; }   // calm：只看灵力和航程（近岸、小岛边的野怪不算）
    g.input.keys.clear();
    if (!B.aboard && !J.swimming && !p.flying) { result = '靠岸了（未过）'; break; }
    if (B.aboard) {
      if (g.hero.mp < 0.15 && !p.sitting) { g.toggleSit(); sits++; }
      if (p.sitting && g.hero.mp > 0.85) g.stand();
      if (!p.sitting) { g.input.keys.add('d'); if (dodge > 0) { g.input.keys.add(Math.floor(t / 20) % 2 ? 'w' : 's'); dodge -= 0.1; } }
      stuckT += 0.1; if (stuckT >= 3) { if (p.x - lastX < 300 && !p.sitting) dodge = 4; stuckT = 0; lastX = p.x; }   // 被小岛挡住：南北绕一绕
      if (p.sitting) sitT += 0.1;
    } else if (J.swimming) {
      // 船碎了：嗑回气丹，能飞就飞，不能飞就重新祭（破船祭不出来就只能游）
      if (g.hero.mp < 0.3 && C.bagCount(g.hero, 'pill_huiqi') > 0) { g.usePill('pill_huiqi'); pills++; }
      g.input.keys.add('d');
    } else g.input.keys.add('d');
    if (g.hero.hp < 0.35 && C.bagCount(g.hero, 'pill_liaoshang') > 0) { g.usePill('pill_liaoshang'); pills++; }
    g.update(0.1); t += 0.1;
    if (process.env.DBG && Math.round(t * 10) % 100 === 0) console.log('  dbg', t.toFixed(0), Math.round(J.depth), J.band, B.aboard, J.swimming, p.flying, (g.combat.enemies.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) < 1500).map((e) => e.def.id)).join(','), B.on ? B.hpOf(id).toFixed(2) : '-', g.hero.hp.toFixed(2));
    minMp = Math.min(minMp, g.hero.mp); minHp = Math.min(minHp, g.hero.hp); if (B.on) minBoat = Math.min(minBoat, B.hpOf(id));
    if (g.hero.dead) { result = `死在海上（离岸 ${Math.round(J.depth)}）`; break; }
    if (W.ACTIVE_MAP === 'luanxing') crossed = true;
    if (crossed && J.depth < 3000) { result = '过去了'; break; }
  }
  if (!result) result = `40 分钟没过去（离岸 ${Math.round(J.depth)}，${W.ACTIVE_MAP}）`;
  console.log(`${NAMES[realm]}（${id}，${mode}）：${result}；用时 ${t.toFixed(0)} 息（${(g.day - t0).toFixed(0)} 日），船上打坐 ${sits} 回共 ${sitT.toFixed(0)} 息，法力最低 ${(minMp * 100).toFixed(0)}%，气血最低 ${(minHp * 100).toFixed(0)}%，船耐久最低 ${(minBoat * 100).toFixed(0)}%${B.on ? '' : '（船已碎 / 收）'}，嗑丹 ${pills} 颗`);
  B.recall(true);
}
process.exit(0);
