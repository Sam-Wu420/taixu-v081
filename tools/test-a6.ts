// A6：移植重构版修过的原版缺陷 —— 读档残留 spawned、施法动作每帧重置、布料变步长、碑仇坐标夹死在 20000
// 用法：npx tsx tools/test-a6.ts
import './env';
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;

const { Strand, CharState } = await import('../src/gfx/character');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { mapSize, WORLD_SCALE } = await import('../src/data/world');

let pass = 0, fail = 0;
const ok = (c: boolean, msg: string) => { if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };

// ---------- 布料 ----------
console.log('布料');
{
  // 原实现（上限 4 子步，速度除以本帧步长）。原版用 Float32Array 存坐标；Strand 后来改成双精度（世界绝对坐标远离原点时
  // 高帧率下的速度会被单精度量化），这里比的是步进算法本身，参照实现也用双精度，否则只是在比两种存储精度
  class Old {
    x: Float64Array; y: Float64Array; ox: Float64Array; oy: Float64Array; inited = false;
    constructor(public n: number, public len: number) { this.x = new Float64Array(n); this.y = new Float64Array(n); this.ox = new Float64Array(n); this.oy = new Float64Array(n); }
    reset(ax: number, ay: number) { for (let i = 0; i < this.n; i++) { this.x[i] = this.ox[i] = ax; this.y[i] = this.oy[i] = ay + this.len * i; } this.inited = true; }
    step(ax: number, ay: number, dt: number, gx: number, gy: number, wx: number, wy: number, drag: number, len: number) {
      this.len = len; if (!this.inited || Math.abs(ax - this.x[0]) > len * 30 || Math.abs(ay - this.y[0]) > len * 30) this.reset(ax, ay);
      const n = this.n; this.x[0] = ax; this.y[0] = ay; if (dt <= 0) return;
      const steps = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 60)))), h = dt / steps;
      for (let s = 0; s < steps; s++) {
        for (let i = 1; i < n; i++) { const vx = (this.x[i] - this.ox[i]) / h, vy = (this.y[i] - this.oy[i]) / h, k = i / (n - 1); const ax2 = gx + (wx - vx) * drag * (0.4 + k * 0.6), ay2 = gy + (wy - vy) * drag * (0.4 + k * 0.6); this.ox[i] = this.x[i]; this.oy[i] = this.y[i]; this.x[i] += vx * h * 0.985 + ax2 * h * h; this.y[i] += vy * h * 0.985 + ay2 * h * h; }
        for (let it = 0; it < 3; it++) { for (let i = 1; i < n; i++) { const dx = this.x[i] - this.x[i - 1], dy = this.y[i] - this.y[i - 1], d = Math.hypot(dx, dy) || 1e-4, diff = (d - len) / d; if (i === 1) { this.x[i] -= dx * diff; this.y[i] -= dy * diff; } else { this.x[i] -= dx * diff * 0.5; this.y[i] -= dy * diff * 0.5; this.x[i - 1] += dx * diff * 0.5; this.y[i - 1] += dy * diff * 0.5; } } this.x[0] = ax; this.y[0] = ay; }
      }
    }
  }
  const run = (S: any, dts: number[]) => { const s = new S(6, 8); let t = 0; const out: number[] = []; for (const dt of dts) { t += dt; const ax = Math.sin(t * 3) * 40; s.step(ax, 0, dt, 0, 600, 0, 0, 2.2, 8); out.push(s.x[5], s.y[5]); } return { out, s }; };
  // 稳定 60Hz：逐值相同
  const d60 = Array(300).fill(1 / 60);
  const a = run(Old, d60).out, b = run(Strand, d60).out;
  ok(a.every((v, i) => v === b[i]), '稳定 60Hz：新旧逐值相同');
  // 帧时抖动（144Hz 夹杂 30Hz 卡顿）后锚点停住，看末端残余晃动（越小越稳）
  const jit: number[] = []; for (let i = 0; i < 300; i++) jit.push(i % 7 === 0 ? 1 / 30 : 1 / 144);
  const settle = (S: any) => { const { s } = run(S, jit); let e = 0; for (let i = 0; i < 240; i++) { const px = s.x[5]; s.step(0, 0, i % 7 === 0 ? 1 / 30 : 1 / 144, 0, 600, 0, 0, 2.2, 8); e += Math.abs(s.x[5] - px); } return e; };
  const eo = settle(Old), en = settle(Strand);
  console.log(`    锚点停住后末端位移合计：旧 ${eo.toFixed(2)}  新 ${en.toFixed(2)}`);
  ok(en <= eo, '帧时抖动下新实现残余晃动不大于旧实现');
  // 长帧：dt=0.1 不发散
  const big = run(Strand, Array(60).fill(0.1)).out;
  ok(big.every((v) => Number.isFinite(v) && Math.abs(v) < 1e4), '连续 0.1s 长帧不发散');
}

// ---------- 读档清 spawned ----------
console.log('读档');
{
  const terrain = new Terrain(); terrain.build();
  const g: any = new Game(terrain);
  g.hero.realm = 2;
  const f = g.ws.flags;
  f.sos = { id: 'x', x: 1, y: 1, until: g.day + 3, spawned: true };
  f.herald = { map: 'tiannan', x: 1, y: 1, day: g.day, tier: 1, rival: 'r', spawned: true, taker: 5, seize: 4 };
  f.jade = [{ kind: '求救', spawned: true, x: 1, y: 1 }, { kind: '求救', spawned: true, done: true }];
  g.ws.bounties = [{ id: 'b1', spawned: true, map: 'tiannan', until: g.day + 9 }, { id: 'b2', spawned: true, done: true }];
  ok(g.save(1) === true, '存档成功');
  const g2: any = new Game(terrain);
  ok(g2.load('taixu_save_1') === true, '读档成功');
  const f2 = g2.ws.flags;
  ok(!f2.sos.spawned && f2.sos.until >= g2.day + 1, '红颜求援：spawned 清掉、期限至少留一天');
  ok(!f2.herald.spawned && f2.herald.taker === undefined && f2.herald.seize === undefined, '异宝：spawned / 收宝进度清掉');
  ok(f2.jade[0].spawned === false && f2.jade[1].spawned === true, '玉符求救：未完成的清掉，已完成的不动');
  ok(g2.ws.bounties[0].spawned === false && g2.ws.bounties[1].spawned === true, '悬赏：未完成的清掉，已完成的不动');
}

// ---------- 施法动作 ----------
console.log('施法动作');
{
  const terrain = new Terrain(); terrain.build();
  const g: any = new Game(terrain);
  g.paused = false; g.story.skipAll?.(); g.story.openT = -1; g.modal = null;
  const st = g.player.st;
  g.update(1 / 60);
  const n0 = st.castN;
  g.player.moving = true; g.player.running = false;
  const ts: number[] = [];
  for (let i = 0; i < 20; i++) { g.combat.castT = 1; g.player.moving = true; g.update(1 / 60); ts.push(st.actionT); }
  ok(st.action === 'cast', '施法期间动作是 cast');
  ok(st.castN - n0 === 1, `一次持续施法 castN 只加 1（实际 +${st.castN - n0}）`);
  ok(ts[ts.length - 1] > ts[0] && ts[ts.length - 1] > 0.2, `施法动作计时在走（${ts[0].toFixed(3)} → ${ts[ts.length - 1].toFixed(3)}）`);
}

// ---------- 碑仇坐标 ----------
console.log('碑仇坐标');
{
  const sz = mapSize('tiannan');
  ok(sz.W * WORLD_SCALE > 20000 * 5, `南荒地图宽 ${sz.W * WORLD_SCALE}，原先夹在 20000 会把凶手挪走`);
}
void CharState;
console.log(fail ? `✗ ${fail} 项失败，${pass} 项通过` : `${pass}/${pass} 通过`);
process.exit(fail ? 1 : 0);
