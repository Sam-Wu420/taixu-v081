// 追杀逻辑测试：不同境界/遁法下能否摆脱
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
// 追逃里处处是随机（追兵出现的方位、截杀的时机、遁术成败、帮手……），同一份代码连跑几次结果不同（旧版本也是），
// 所以固定随机源：默认种子 1，SEED=n 换一个。各种子的通过率见提交说明。
{ let s = (Number(process.env.SEED ?? 1) * 2654435761) >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 光固定随机源还不够：同一个种子连跑几次结果仍不同。来源是真实时间进了逻辑——众生的日结算（NpcDayScheduler.pump）
// 每帧只做 2 毫秒，一帧做完几个人取决于机器快慢，谁先死、谁先挪窝跟着变，之后取随机数的顺序也全变了。
// 测试里换成假时钟：performance.now / Date.now 每读一次走 0.05 毫秒，每帧做的量固定（游戏里仍按真实时间分帧）
await import('./fixed-clock');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const WORLD = await import('../src/data/world');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
g.reset(); g.story['openT'] = -1;   // 开场白不弹（它会让人物停住一下）
// 只测追杀系统：每帧清掉追兵以外的敌人。测试站位（120000, 93000）在南荒放大以后落在离青霞谷很远的西部，
// 野外妖气七级上下，护领地的妖兽会扑上去和追兵厮杀（偶尔把结丹追兵咬死、或缠住他），结果就看野兽来没来（旧版本也偶有失败）
{ const up = g.update.bind(g); g.update = (dt: number) => { up(dt); const c = g.combat; c.enemies = c.enemies.filter((e: any) => e.pursuer || e.wing || e.npcId); }; }
let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };

function scenario(label: string, o: { realm: number; stage?: number; gap: number; fly: boolean; boost: boolean; flight?: string; conceal?: boolean; skill?: string; secs?: number; dir?: string; react?: boolean }) {
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.modalStack = [];
  const h = g.hero; h.realm = o.realm; h.stage = o.stage ?? 0; h.hp = 1; h.mp = 1; h.dead = false; h.equip = o.flight === 'art_xuepifeng' ? { armor: o.flight } : o.flight ? { flight: o.flight } : {};
  g.teleport(120000, 93000); g.player.flying = o.fly;   // 用传送归位：只改 player.x 的话，人物状态（st）还留在上一场的终点，下一帧又被拉回去 g.player.sitting = false; g.concealed = !!o.conceal; g.senseBurstT = 0;
  g.input.keys.clear(); g.input.keys.add(o.dir ?? 'd'); if (o.boost) g.input.keys.add('shift');
  // 一直按着方向键：游戏里随机弹出的对话 / 来信（openModal）会清掉按键，测试每帧把 g.modal 清掉，却没把键按回去，
  // 人就停在原地被追上——「所有逃脱都失败」的那一批结果就是这么来的
  const held = () => { const k = [...g.input.keys]; return () => { for (const x of k) g.input.keys.add(x); }; };
  let hold = held();
  // 先跑起来，追杀者从身后出现（按人物的速度定「身后」；没跑起来时按朝向，可能出现在前方——要等真的跑起来再开始）
  for (let i = 0; i < 60 && (i < 10 || Math.hypot(g.player.st.vx, g.player.st.vy) <= 10); i++) { g.modal = null; hold(); g.update(1 / 30); }
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: o.gap, force: true });
  const P = g.pursuit.cur; const d0 = Math.hypot(P.e.x - g.player.x, P.e.y - g.player.y);
  if (process.env.DBG) console.log('   START', label, 'p', Math.round(g.player.x), Math.round(g.player.y), 'e', Math.round(P.e.x), Math.round(P.e.y), 'd0', d0.toFixed(0), 'stv', Math.round(g.player.st.vx), Math.round(g.player.st.vy), 'fly', g.player.flying, 'noFly', g.noFlyT.toFixed(1), 'realm', P.realm, P.stage, 'chase', P.chase.toFixed(0));
  let minD = 1e9, end = '', t = 0, usedSkill = false, wave = 0, turns = 0;
  const dt = 1 / 30, N = (o.secs ?? 90) * 30;
  for (let i = 0; i < N; i++) {
    g.modal = null; hold();
    if (o.skill && !usedSkill && t > 2) { usedSkill = true; if (!h.arts.some((a: any) => a.id === o.skill)) h.arts.push({ id: o.skill, xp: 0 }); g.combat.cds?.delete?.(o.skill); g.combat.cast(o.skill); }
    g.update(dt); t += dt;
    // 第三十五步：被截杀后，玩家会转向避开前方的拦截者
    if (g.pursuit.cur && g.pursuit.cur.wave > wave) {
      wave = g.pursuit.cur.wave;
      if (process.env.DBG) console.log('   WAVE', t.toFixed(2), Math.round(g.player.x), Math.round(g.player.y), Math.round(g.pursuit.cur.e.x), Math.round(g.pursuit.cur.e.y));
      if (o.react) { const e = g.pursuit.cur.e, dx = g.player.x - e.x, dy = g.player.y - e.y; g.input.keys.clear(); g.input.keys.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'd' : 'a') : (dy > 0 ? 's' : 'w')); if (o.boost) g.input.keys.add('shift'); turns++; hold = held();
        // 九死一生：压箱底的遁术
        if (!h.arts.some((a: any) => a.id === 'xueyingdun')) h.arts.push({ id: 'xueyingdun', xp: 0 }); g.combat.cds?.delete?.('xueyingdun'); h.mp = Math.max(h.mp, 0.5); for (let k = 0; k < 8; k++) { g.modal = null; g.update(dt); t += dt; } g.combat.cast('xueyingdun'); if (process.env.DBG) console.log('   AFTER', Math.round(g.player.x), Math.round(g.player.y)); }
    }
    h.hp = Math.max(h.hp, 0.5); g.combat.invulnT = 5;   // 只测追逃，不测死活
    const c = g.pursuit.cur;
    if (!c) { end = 'escaped'; break; }
    const d = Math.hypot(c.e.x - g.player.x, c.e.y - g.player.y); minD = Math.min(minD, d);
    if (process.env.DBG && i % 3 === 0) console.log('   dbg', label, t.toFixed(2), d.toFixed(0), Math.round(g.player.x), Math.round(g.player.y), Math.round(c.e.x), Math.round(c.e.y), c.v.toFixed(0), [...g.input.keys].join(''), 'mv', g.combat.canMove, g.combat.canAct, 'root', g.combat.pst.root, 'dash', g.combat.dash, 'hold', g.combat.brawl.holdsPlayer, 'tx', g.tianxiang.active, 'fly', g.player.flying, 'sp', g.speed.toFixed(0), 'B', JSON.stringify(g.bounds), 'map', (WORLD as any).ACTIVE_MAP, 'jsp', g.jueyu.speedMul, 'prof', g.jueyu.profile?.id, 'blockT', g.blockedTimer);
    if (d < 500) { end = 'caught'; break; }
  }
  g.input.keys.clear();
  const res = end || 'ongoing';
  (scenario as any).wave = wave;
  console.log(`  [${label}] ${res} wave=${wave} t=${t.toFixed(1)}s d0=${d0.toFixed(0)} minD=${minD.toFixed(0)} mp=${h.mp.toFixed(2)} speed=${g.speed.toFixed(0)}`);
  return res;
}

// v0.8 合并后采用朋友版 v0.64+ 的追兵口径（chasespeed.ts）：遁速以追兵自身境界为保底，
// 玩家催动遁光时「同境会被拉开，高一大境仍能强追」；追兵自己也会催动遁光（次数 2+境界+备战层数）。
// 所以下面「高一大境」的几条断言是 caught，同境的才是 escaped。
check('筑基 平飞 vs 结丹：被追上', scenario('zj-plain', { realm: 2, gap: 1, fly: true, boost: false }) === 'caught');
check('筑基 催动遁光 vs 结丹：高一大境强追，直线逃仍被追上', scenario('zj-boost-straight', { realm: 2, gap: 1, fly: true, boost: true }) === 'caught');
check('筑基 催动遁光+转向+血影遁 vs 结丹：高一大境仍能强追', scenario('zj-boost', { realm: 2, gap: 1, fly: true, boost: true, react: true }) === 'caught');
check('结丹 催动遁光 vs 同境圆满：遁光可以拉开', scenario('jd-boost-same', { realm: 3, gap: 0, fly: true, boost: true, react: true, secs: 120 }) === 'escaped');
check('筑基 催动遁光+敛息 vs 结丹：敛息也甩不掉高一境', scenario('zj-boost-conceal', { realm: 2, gap: 1, fly: true, boost: true, conceal: true, react: true }) === 'caught');
check('炼气 步行 vs 筑基：被追上', scenario('lq-walk', { realm: 1, stage: 6, gap: 1, fly: false, boost: false }) === 'caught');
check('炼气 神风舟+遁光 vs 筑基：高一大境强追，舟也甩不掉', scenario('lq-boat', { realm: 1, stage: 6, gap: 1, fly: true, boost: true, flight: 'art_shenfeng', react: true }) === 'caught');
check('结丹 平飞 vs 元婴：被追上', scenario('jd-plain', { realm: 3, gap: 1, fly: true, boost: false }) === 'caught');
check('结丹 云雷双翼雷遁 vs 同境圆满：可摆脱', scenario('jd-thunder', { realm: 3, gap: 0, fly: true, boost: true, flight: 'art_fenglei', react: true, secs: 120 }) === 'escaped');
check('筑基 血影遁 vs 结丹：一遁脱身', scenario('zj-xueying', { realm: 2, gap: 1, fly: true, boost: false, skill: 'xueyingdun', secs: 12 }) === 'escaped');
// 站定时施展血影遁：应背离追兵遁出，而不是撞向对方
{
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.input.keys.clear();
  const h = g.hero; h.realm = 2; h.stage = 0; h.hp = 1; h.mp = 1; g.player.x = 120000; g.player.y = 93000; g.player.flying = false;
  for (let i = 0; i < 5; i++) { g.modal = null; g.update(1 / 30); }
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: 1, force: true });
  const e = g.pursuit.cur.e, d0 = Math.hypot(e.x - g.player.x, e.y - g.player.y);
  if (!h.arts.some((a: any) => a.id === 'xueyingdun')) h.arts.push({ id: 'xueyingdun', xp: 0 });
  g.combat.cds?.clear?.(); g.combat.cast('xueyingdun');
  const d1 = Math.hypot(e.x - g.player.x, e.y - g.player.y);
  check('站定施展血影遁：背离追兵遁出', d1 > d0 + 2000, `d0=${d0.toFixed(0)} d1=${d1.toFixed(0)} hp=${h.hp.toFixed(2)}`);
}
// 第三十五步：禁空令——结丹以上追兵把遁光压落地面，数息内飞不起来
{
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.input.keys.clear();
  const h = g.hero; h.realm = 3; h.stage = 0; h.hp = 1; h.mp = 1; h.dead = false; g.player.x = 120000; g.player.y = 93000; g.player.flying = true;
  for (let i = 0; i < 5; i++) { g.modal = null; g.update(1 / 30); }
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: 1, force: true });
  const P = g.pursuit.cur; P.e.x = g.player.x - 700; P.e.y = g.player.y; P.jinkongCd = 0;
  g.modal = null; g.update(1 / 30);
  const landed = !g.player.flying && g.noFlyT > 0;
  g.toggleFly();
  check('禁空令：遁光被压落、数息内无法再起', landed && !g.player.flying, `noFly=${g.noFlyT.toFixed(1)}`);
  g.noFlyT = 0;
}
// 逃进坊市：对方不敢擅闯
{
  g.combat.reset(); g.pursuit.reset(); g.modal = null;
  const h = g.hero; h.realm = 2; h.stage = 0; h.mp = 1; h.equip = {};
  const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
  const town = LOCATIONS.find((l: any) => l.id === 'tainan')!;
  g.player.x = town.x * WORLD_SCALE; g.player.y = town.y * WORLD_SCALE; g.player.flying = false; g.input.keys.clear();
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: 1, force: true });
  let t = 0; for (let i = 0; i < 30 * 25 && g.pursuit.cur; i++) { g.modal = null; g.update(1 / 30); t += 1 / 30; g.hero.hp = 1; }
  check('逃入坊市：对方不敢擅闯，最终离去', !g.pursuit.cur, `t=${t.toFixed(1)} safe=${g.combat.safeAt(g.player.x, g.player.y)}`);
}
// 被追上：成为战斗中的强敌
{
  g.combat.reset(); g.pursuit.reset(); g.modal = null;
  const h = g.hero; h.realm = 2; h.stage = 0; h.mp = 1; g.player.x = 120000; g.player.y = 93000; g.player.flying = false; g.input.keys.clear();
  g.pursuit.cd = 0; g.pursuit.start({ reason: 'test', gap: 1, force: true });
  const tt = g.toast.bind(g); g.toast = (s: string, k?: any) => { console.log('   toast:', s); return tt(s, k); };
  for (let i = 0; i < 30 * 12; i++) { g.modal = null; g.combat.invulnT = 5; g.update(1 / 30); g.hero.hp = 1; }
  const e = g.pursuit.cur?.e;
  check('站着不动：被追上并进入战斗', !!e && g.combat.enemies.includes(e) && e.aggro && g.combat.inCombat, e ? `d=${Math.hypot(e.x - g.player.x, e.y - g.player.y).toFixed(0)}` : '');
  e.hp = 0; for (let i = 0; i < 5; i++) g.update(1 / 30);
  check('击杀追杀者：追杀结束', !g.pursuit.cur);
}
// 第三十二步：真仇人亲自追杀（遁光、护体灵光、帮手；你先手结下的血仇，没杀成会准备得更充分再来）
{
  g.combat.reset(); g.pursuit.reset(); g.modal = null; g.input.keys.clear();
  const h = g.hero; h.realm = 2; h.stage = 0; h.mp = 1; h.hp = 1; h.equip = {}; g.player.x = 120000; g.player.y = 93000; g.player.flying = false;
  const d = g.npcs.list.find((x: any) => x.alive && x.realm >= 3 && !x.beauty && !x.canon && x.sect);
  const mates = g.npcs.list.filter((x: any) => x !== d && x.alive && x.realm >= 2 && !x.beauty && !x.canon).slice(0, 2);
  d.grudge = 2; d.why = '你杀了他的师弟'; d.prep = 0; d.feudBy = 'hero'; d.heat = 80;   // 恩怨重做：只有你先手结下的血仇，没杀成才回去养精蓄锐（受害一方的仇见 test-feud）
  const ok = g.rel.startHunt(d, false, true, mates);
  const P = g.pursuit.cur;
  check('仇人亲自追来（追杀系统接管）', ok && !!P && P.npc === d && P.e.npcId === d.id && d.chasing, P ? `${P.name} ${P.faction.name}` : '');
  check('追杀者罩着护体灵光', !!P?.e.ward && P.e.ward.hp > 0, P?.e.ward ? `ward=${Math.round(P.e.ward.hp)} / hp=${Math.round(P.e.maxHp)}` : '');
  check('带着两名帮手', P?.wings.length === 2 && P.wings.every((w: any) => w.wing && w.npcId), `wings=${P?.wings.length}`);
  // 护体灵光先吃伤害，打碎后对方僵直
  const e = P.e, hp0 = e.hp; g.combat.hitEnemy(e, e.ward.hp * 0.5, { realm: 3, stCh: 0 }, e.x, e.y);
  check('伤害先打在灵光上', e.hp === hp0 && e.ward && e.ward.hp > 0);
  g.combat.hitEnemy(e, e.ward.hp * 4 + 500, { realm: 3, stCh: 0 }, e.x, e.y);
  check('灵光破碎 → 僵直', !e.ward && !!e.st.stun);
  // 逃脱：下次准备更充分
  const day = g.day; g.pursuit.end = (g.pursuit as any).end; (g.pursuit as any).end('escaped');
  check('逃脱后仇人回去准备，下次再来', d.prep === 1 && !d.chasing && d.huntAt > day && !g.pursuit.cur && mates.every((m: any) => !m.chasing), `prep=${d.prep} huntAt=${d.huntAt - day}`);
  // 再来一次：有备而来（灵光更厚），击杀 → 仇人陨落，帮手留下拼命
  g.pursuit.cd = 0; g.rel.startHunt(d, true, true, mates);
  const P2 = g.pursuit.cur;
  check('有备而来：灵光更厚', P2 && P2.e.wardFrac > 0.3, `frac=${P2?.e.wardFrac}`);
  for (const w of P2.wings) { w.x = g.player.x + 300; w.y = g.player.y; if (!g.combat.enemies.includes(w)) g.combat.enemies.push(w); }
  P2.e.x = g.player.x + 200; P2.e.y = g.player.y; if (!g.combat.enemies.includes(P2.e)) g.combat.enemies.push(P2.e);
  P2.e.ward = undefined; P2.e.hp = 0;
  for (let i = 0; i < 5; i++) { g.modal = null; g.combat.invulnT = 5; g.update(1 / 30); }
  check('击杀仇人：其人陨落', !d.alive && !g.pursuit.cur, `alive=${d.alive}`);
  check('帮手留下拼命', P2.wings.some((w: any) => !w.dead && w.aggro && g.combat.enemies.includes(w)));
}
// 敌修布的困阵：阵里的人走不出去；用传送远遁出去的不会隔着半张图被拽回阵里；人在阵外也不会被吸进去。
// （追兵布过阵以后，上面的场景把人传送回起点，下一帧又被按回两万多步外的阵界上、站着挨追——就是这么查出来的）
{
  const { ZHEN_BY_ID } = await import('../src/data/zhenfa');
  const { ACTIVE_MAP } = await import('../src/data/world');
  g.combat.reset(); g.pursuit.reset(); g.zhenfa.reset(); g.modal = null; g.input.keys.clear();
  const h = g.hero, p = g.player, Z = g.zhenfa as any; h.realm = 2; h.stage = 0; h.hp = 1; h.mp = 1;
  g.teleport(120000, 93000); p.flying = false;
  const lay = (x: number, y: number) => { const z = ZHEN_BY_ID['kun'], r = z.r; const inst = Z.make({ id: 'kun', map: ACTIVE_MAP, x, y, r, left: 60, pow: 1, hi: false, flags: z.flags, eye: { x: x + r * 0.6, y, hp: 1e9, max: 1e9 } }, 'e'); Z.list.push(inst); return inst; };
  const step = (n: number, key?: string) => { for (let i = 0; i < n; i++) { g.modal = null; if (key) g.input.keys.add(key); h.hp = 1; g.combat.invulnT = 5; g.update(1 / 30); } };
  const k1 = lay(p.x, p.y);
  step(240, 'd');
  check('困阵：阵里的人走不出去', Z.inside(k1, p.x, p.y, 5), `离阵心 ${Math.round(Math.hypot(p.x - k1.x, p.y - k1.y))} / 阵半径 ${Math.round(k1.r)}`);
  g.input.keys.clear(); g.teleport(150000, 93000); step(10);
  check('困阵：传送远遁出去不会被拽回阵里', Math.abs(p.x - 150000) < 200, `x=${Math.round(p.x)}`);
  Z.reset(); const k2 = lay(p.x + 3000, p.y); const x0 = p.x; step(10);
  check('困阵：人在阵外不会被吸进去', Math.abs(p.x - x0) < 50 && !Z.inside(k2, p.x, p.y), `挪了 ${Math.round(p.x - x0)}`);
  Z.reset();
}
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
