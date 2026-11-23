// 复现：修士法器招式（fq_*）在实战中的出手占比
// 固定随机种子，便于比较不同权重 / 配给下的出手占比
let seed = 0x2f6e2b1;
const randSeed = (n: number) => { seed = n; };
Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { kitOf } = await import('../src/world/foeskills');
const { gearOf } = await import('../src/world/foegear');
const { ITEMS } = await import('../src/data/items');
const { SCHOOLS } = await import('../src/world/schools');

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const p = g.player;
p.x = 120000; p.y = 93000;
g.hero.hp = g.hero.maxHp = 1e9;
g.hero.mp = 1e9;

const schoolIds = Object.keys(SCHOOLS).slice(0, 6);
const scenarios: { realm: number; school: string; def: string }[] = [
  { realm: 1, school: schoolIds[0], def: 'bandit' },
  { realm: 2, school: schoolIds[1], def: 'zhujixiu' },
  { realm: 3, school: schoolIds[2], def: 'jindan_mo' },
  { realm: 4, school: schoolIds[3], def: 'jindan_mo' },
  { realm: 4, school: 'guiling', def: 'jindan_mo' },
];

for (const [si, sc] of scenarios.entries()) {
  g.combat.reset(); g.combat.enemies = [];
  randSeed(0x51ed270b + si * 7919);   // 每个场景固定种子：配给与出手随机序列可复现
  const e = new Enemy((ENEMIES as any)[sc.def], p.x + 420, p.y, sc.realm, 0);
  e.school = sc.school; e.aggro = true; e.maxHp = e.hp = 1e9;
  g.combat.enemies.push(e);
  const kit = kitOf(e);
  const fqN = kit.filter((s: any) => s.id.startsWith('fq_')).length;
  const gear = gearOf(e);
  const casts: Record<string, number> = {};
  const lowArts = new Set<string>();
  let fq = 0, all = 0, lowFq = 0, lowAll = 0;
  const orig = g.combat.foe.start.bind(g.combat.foe);
  g.combat.foe.start = (en: any, sk: any, tx: number, ty: number) => {
    if (en === e) {
      casts[sk.id] = (casts[sk.id] ?? 0) + 1; all++; if (sk.id.startsWith('fq_')) fq++;
      if ((e as any).artLow) { lowAll++; if (sk.id.startsWith('fq_')) { lowFq++; lowArts.add(sk.id); } }
    }
    return orig(en, sk, tx, ty);
  };
  (g.combat as any).spawnT = 1e9;
  const T = 60, dt = 1 / 30;
  for (let i = 0; i < T / dt; i++) {
    g.modal = null; g.modalStack = [];
    g.combat.enemies = g.combat.enemies.filter((x: any) => x === e);
    g.hero.hp = g.hero.maxHp; g.combat.invulnT = 5;
    e.hp = e.maxHp * (i * dt >= 20 ? 0.45 : 1);   // 20 秒后压到半血以下，验证「法宝尽出」
    g.update(dt);
    // 让修士留在能出招的距离内；玩家原地不动
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > 620) { e.x = p.x + dx / d * 560; e.y = p.y + dy / d * 560; }
    if (d < 120) { e.x = p.x + dx / d * 180; e.y = p.y + dy / d * 180; }
  }
  g.combat.foe.start = orig;
  const top = Object.entries(casts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([id, n]) => `${id}×${n}`).join(' ');
  const ancient = gear?.arts.filter((id: string) => ITEMS[id]?.tier >= 5).length ?? 0;
  const shields = gear?.arts.filter((id: string) => ITEMS[id]?.art?.kind === 'shield').length ?? 0;
  console.log(`r${sc.realm} ${sc.school} ${sc.def}: 招式${kit.length} 法器招式${fqN}/${gear?.arts.length ?? 0}件 古宝${ancient} 盾${shields}，${T}s 出手${all}次，法器${fq}次（${(fq / Math.max(1, all) * 100).toFixed(0)}%）`);
  console.log(`    半血后：出手${lowAll}次，法器${lowFq}次，不同法器${lowArts.size}/${fqN}种${lowArts.size === fqN ? '（全部用遍）' : ''}`);
  if (lowArts.size !== fqN) console.log('    未用：', kit.filter((s: any) => s.id.startsWith('fq_') && !lowArts.has(s.id)).map((s: any) => `${s.id}[${s.k} ${s.min ?? 0}-${s.range}]`).join(' '));
  console.log('   ', top);
}
// 多元婴 / 化神随机配给检查：至少三件可祭出的古宝，且必有护盾法器
let bad = 0, minGu = 99, minArts = 99;
for (let i = 0; i < 24; i++) {
  randSeed(0x72a51f3 + i * 3571);
  const realm = i < 18 ? 4 : 5;
  const e = new Enemy((ENEMIES as any).jindan_mo, p.x + 400, p.y, realm, i % (realm === 4 ? 3 : 1));
  e.school = schoolIds[i % schoolIds.length];
  const gear = gearOf(e)!;
  const skills = new Set(kitOf(e).filter((s: any) => s.id.startsWith('fq_')).map((s: any) => s.id));
  const gu = gear.arts.filter((id: string) => ITEMS[id]?.tier >= 5 && skills.has('fq_' + id)).length;
  const sh = gear.arts.filter((id: string) => ITEMS[id]?.art?.kind === 'shield' && skills.has('fq_' + id)).length;
  minGu = Math.min(minGu, gu); minArts = Math.min(minArts, skills.size);
  if (gu < 3 || sh < 1) { bad++; console.log(`配给不足：r${realm} ${e.school} 古宝${gu} 盾${sh}`); }
}
console.log(`随机元婴/化神 24 人：最少可祭古宝 ${minGu} 件，最少法宝招式 ${minArts} 个，配给不足 ${bad} 人`);
process.exit(bad ? 1 : 0);
