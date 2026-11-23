// 复现 / 回归：元婴后期玩家不同移动方式下，主追杀系统是否能按境界追上。
// 修复前：近身 700 内会从追兵速度里扣掉 foeBase，元婴追兵只剩三成多速度，
// 于是“玩家不飞只跑，御剑的元婴追兵却永远追不上”。
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { hunterChaseSpeed } = await import('../src/world/chasespeed');

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();

function run(pursuerRealm: number, pursuerStage: number, fly: boolean, runKey: boolean, slow = false) {
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.modalStack = []; g.input.keys.clear();
  const h = g.hero;
  h.realm = 4; h.stage = 2; h.hp = h.maxHp = 1e9; h.mp = 1e9; h.equip = {}; h.dead = false;
  g.player.x = 120000; g.player.y = 93000; g.player.flying = fly; g.player.boosting = false; g.player.running = false;
  g.concealed = false; g.senseBurstT = 0;
  if (!slow) g.input.keys.add('d');
  if (runKey) g.input.keys.add('shift');
  for (let i = 0; i < 10; i++) { g.modal = null; g.update(1 / 30); }
  g.pursuit.cd = 0;
  g.pursuit.start({ reason: 'test', gap: 0, force: true });
  const P = g.pursuit.cur;
  if (!P) { console.log('未能启动追杀，跳过'); return; }
  P.realm = pursuerRealm; P.stage = pursuerStage;
  P.e.realm = pursuerRealm; P.e.stage = pursuerStage;
  P.chase = hunterChaseSpeed(pursuerRealm, pursuerStage);
  P.lockR = pursuerRealm >= 4 ? 5200 : 3400;
  P.name = `元婴${['初期', '中期', '后期'][pursuerStage] ?? pursuerStage}追兵`;

  let minD = Infinity, t = 0, caught = false;
  for (let i = 0; i < 30 * 45; i++) {
    g.modal = null; g.modalStack = []; g.combat.invulnT = 5; g.update(1 / 30); h.hp = h.maxHp; t += 1 / 30;
    const C = g.pursuit.cur; if (!C) break;
    const d = Math.hypot(C.e.x - g.player.x, C.e.y - g.player.y); minD = Math.min(minD, d);
    if (d < 520) { caught = true; break; }
  }
  const C = g.pursuit.cur;
  console.log(`${pursuerRealm}-${pursuerStage} fly=${fly} run=${runKey} slow=${slow}: caught=${caught} minD=${minD.toFixed(0)} t=${t.toFixed(1)}s heroV=${Math.hypot(g.player.st.vx, g.player.st.vy).toFixed(0)} chaseV=${C ? C.v.toFixed(0) : '-'} eSpeed=${C?.e.speed}`);
}

run(4, 0, false, false, true);   // 慢走也必须被同境追兵咬住
run(4, 0, false, true);          // 元婴后期步行疾跑
run(4, 0, true, false);          // 平飞、不催遁光
run(4, 0, true, true);           // 同境催动遁光：应能拉开
run(5, 0, true, true);           // 高一境强追：仍应追上
process.exit(0);
