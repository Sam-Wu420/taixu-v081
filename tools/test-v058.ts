// v0.58 修复验收：大事件邀请框关了又弹 / 追杀「不管闲事」又弹 / 劫修 Esc 后呆站 / 施法动作卡第一帧 / 摇杆越拖越慢
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { LOC_BY_ID, WORLD_SCALE } = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
g.hero.realm = 2; g.hero.stage = 3;
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.log('  ✗', m); } };
const step = (n: number) => { for (let i = 0; i < n; i++) g.update(1 / 30); };

// ---- 1. 大事件邀请框：Esc 关闭 / 选「离开」后不再每帧重弹；离开范围再回来会弹
{
  // 问仙大会只对炼气期开放
  g.hero.realm = 1; g.hero.stage = 3;
  const { CANON_EVENTS } = await import('../src/world/events');
  const ev = CANON_EVENTS.find((e) => e.id === 'shengxian')!;
  delete g.ws.events['shengxian'];
  g.day = g.events.startDay(ev) + 1; g.update(0.03);
  while (g.modal) g.closeModal(true);
  const l = LOC_BY_ID.get('tainan')!;
  const near = () => g.teleport(l.x * WORLD_SCALE, l.y * WORLD_SCALE + 300);
  near();
  for (let i = 0; i < 20 && !(g.modal as any)?.node?.options?.some((o: any) => /离开/.test(o.label)); i++) { if (g.modal) g.closeModal(true); g.update(1 / 30); }
  const m: any = g.modal;
  console.log('  offer:', m?.node?.speaker, m?.node?.options?.map((o: any) => o.label).join('|'), JSON.stringify(g.ws.events['shengxian']));
  ok(!!m?.node?.options?.some((o: any) => /离开/.test(o.label)), '大事件邀请框应弹出');
  g.closeModal(true);           // 等同 Esc：没选任何选项
  step(60);
  ok(!g.modal, 'Esc 关闭后 2 秒内不应重弹（修前每帧重弹）');
  g.teleport(l.x * WORLD_SCALE + 40000, l.y * WORLD_SCALE); step(5);
  near(); step(10);
  const m2: any = g.modal;
  console.log('  offer2:', m2?.node?.speaker, m2?.node?.options?.map((o: any) => o.label).join('|'));
  ok(!!m2, '走出范围再回来应重新邀请');
  if (m2) {
    const leave = m2.node.options.find((o: any) => /离开/.test(o.label));
    g.closeModal(true); leave?.act();
    step(60);
    ok(!g.modal, '选「离开」后不应立刻重弹（修前冷却从未生效）');
  }
}

// ---- 2. 路遇追杀：「不管闲事」后不再反复弹
{
  g.teleport(LOC_BY_ID.get('qingniu')?.x! * WORLD_SCALE + 3000 || 30000, (LOC_BY_ID.get('qingniu')?.y ?? 100) * WORLD_SCALE);
  while (g.modal) g.closeModal(true);
  const x: any = g.happen.spawnKind('chase');
  ok(!!x, '追杀奇遇能生成');
  if (x) {
    x.npc.x = g.player.x + 200; x.npc.y = g.player.y; x.npc.st.x = x.npc.x; x.npc.st.y = x.npc.y;
    let opened = 0, left = false;
    for (let i = 0; i < 240; i++) {
      g.update(1 / 30);
      const m: any = g.modal;
      if (m && m.node.options?.some((o: any) => o.label === '不管闲事')) {
        opened++;
        if (!left) { const o = m.node.options.find((o: any) => o.label === '不管闲事'); g.closeModal(true); o.act(); left = true; }
        else g.closeModal(true);
      } else if (m) g.closeModal(true);
    }
    ok(opened === 1, `「不管闲事」后不应重弹（弹了 ${opened} 次）`);
  }
}

// ---- 3. 劫修：Esc 关闭对话后会动手，而不是一直呆站
{
  while (g.modal) g.closeModal(true);
  g.hero.realm = 1; g.hero.stage = 5;   // 别让劫修见了就跪
  const x: any = g.happen.spawnKind('robber');
  ok(!!x, '劫修奇遇能生成');
  if (x) {
    for (const e of x.foes) { e.x = g.player.x + 150; e.y = g.player.y; }
    let got = false;
    for (let i = 0; i < 90 && !got; i++) { g.update(1 / 30); if (g.modal) { got = true; g.closeModal(true); } }
    ok(got, '劫修拦路对话应弹出');
    step(5);
    ok(x.foes.some((e: any) => e.aggro && !e.dead) || x.done, 'Esc 关闭后劫修应动手（修前呆站）');
  }
  for (const e of g.combat.enemies) e.dead = true;
  step(3);
  while (g.modal) g.closeModal(true);
}

// ---- 4. 施法动作不再每帧重置
{
  g.hero.realm = 2;
  const st = g.player.st;
  g.combat.castT = 0.6;
  step(1);
  const n0 = st.castN;
  step(8);
  ok(st.action === 'cast', '施法期间动作应为 cast');
  ok(st.castN === n0, `施法期间 castN 不应每帧自增（${n0}→${st.castN}）`);
  ok(st.actionT > 0.15, `施法动作计时应累积（actionT=${st.actionT.toFixed(3)}，修前恒为 0）`);
}

console.log(`v058: ${pass} 通过, ${fail} 失败`);
if (fail) process.exit(1);
