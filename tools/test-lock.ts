// r11-lock：锁定目标的测试——Tab 顺序（敌对优先、由近到远、鼠标指着的先锁）、取消锁定、目标死了自动转、
// 锁定换人的记录（锁定动画、「咔」一声只在手动锁上时）、态度配色、首领条 / 目标条怎么分、锁定跟随镜头（焦点、跟随距离、让镜头、弹簧不跳不过冲）、
// 立体标记（锁定环有深度、透视层深度写成最近、画面外时边缘箭头在边距框上）。
// r13-lockbtn：手机「锁」按钮（点一下锁上、再点切换、长按取消、没得锁变灰、按下 / 松手计时）；触屏点选的范围（手指比鼠标宽，飞着的、高大的点得中）。
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const { LOCATIONS, WORLD_SCALE } = await import('../src/data/world');
const { ENEMY_LIST } = await import('../src/data/enemies') as any;
const { Enemy } = await import('../src/world/combat');
const { lockStance, LOCK_SNAP, lockHeadH, lockButtonTap, lockButtonHold, lockButtonState, LockPress, LOCK_HOLD_MS, pickAtScreen } = await import('../src/world/locktarget');
const { LockCam, lockCamSetting, setLockCam, LOCKCAM_LEAN } = await import('../src/world/lockcam');
const { pickBoss, lockBarTarget } = await import('../src/ui/BossHUD');
const { Batch, FLOATS } = await import('../src/gl/batch');
const { FxSys } = await import('../src/gl/fx');
const { drawLockGL } = await import('../src/gl/lockgl');
const { ALT } = await import('../src/world/alt');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
const l = LOCATIONS.find((q) => q.id === 'qixuan')!;
g.hero.realm = 3; g.hero.stage = 1;
g.teleport(l.x * WORLD_SCALE + 900, l.y * WORLD_SCALE + 600);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH; cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); g.paused = false;
const c = g.combat, p = g.player, wolf = ENEMY_LIST.find((e: any) => e.id === 'wolf') ?? ENEMY_LIST[0];
let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++; };
const mk = (dx: number, dy: number, aggro = true) => { const e = new Enemy(wolf, p.x + dx, p.y + dy, 1, 3); e.aggro = aggro; c.enemies.push(e); return e; };
const reset = () => { c.enemies.length = 0; c.lock = null; c.manual = false; g.input.mouse = { active: false, x: 0, y: 0, t: -99, sx: NaN, sy: NaN }; c.lockTrack.reset(); };

// 1) 态度配色
{
  reset(); const a = mk(100, 0, true), b = mk(200, 0, false), d = mk(300, 0, true); d.ally = true; const s = mk(400, 0, true); s.spar = true;
  ok(lockStance(a) === 'foe' && lockStance(b) === 'neutral' && lockStance(d) === 'ally' && lockStance(s) === 'neutral', '态度：冲你来的敌对、没交手的中立、同阵友方、切磋算中立');
}
// 2) Tab 顺序：敌对的先，同一类由近到远；到头了从头再来
{
  reset(); const idle = mk(90, 0, false), a1 = mk(200, 0), a2 = mk(-320, 0), far = mk(g.senseRadius + 200, 0);
  const order = c.lockOrder();
  ok(order[0] === a1 && order[1] === a2 && order[2] === idle && !order.includes(far), 'Tab 顺序：敌对在前（由近到远），没交手的排后，神识外的不进');
  c.cycleLock(); const t1 = c.lock; c.cycleLock(); const t2 = c.lock; c.cycleLock(); const t3 = c.lock; c.cycleLock();
  ok(t1 === a1 && t2 === a2 && t3 === idle && c.lock === a1 && c.manual, 'Tab 按这个顺序轮换并循环');
  // 鼠标最近指着谁（两百以内），第一下先锁谁
  reset(); const n1 = mk(120, 0), n2 = mk(-400, 120);
  g.input.mouse = { active: true, x: n2.x + 30, y: n2.y - 10, t: g.time, sx: 0, sy: 0 };
  c.cycleLock();
  ok(c.lock === n2 && c.manual, '还没手动锁定时，Tab 先锁鼠标指着的那位');
  c.cycleLock();
  ok(c.lock !== n2 && c.lock === n1, '再按一下照顺序换下一个');
}
// 3) 取消锁定（Esc / 再点一次）
{
  reset(); const a = mk(150, 0); c.lock = a; c.manual = true;
  ok(c.unlock() === true && !c.manual && c.lock === null, 'unlock：取消手动锁定');
  ok(c.unlock() === false, '没有手动锁定时 unlock 返回 false（Esc 照常开设置）');
  c.refreshLock(1);
  ok(c.lock === a && !c.manual, '取消后回到自动锁定（最近的敌对）');
}
// 4) 目标死了 → 自动转下一个
{
  reset(); const a = mk(150, 0), b = mk(260, 0); c.lock = a; c.manual = true;
  a.dead = true; c.lock = null;   // 战斗里击杀时 combat 自己把 lock 清掉
  c.refreshLock(1);
  ok(c.lock === b && !c.manual, '手动锁着的目标死了：转到最近的敌对（自动）');
}
// 5) 锁定换人的记录
{
  reset(); const a = mk(150, 0), b = mk(260, 0);
  c.lock = a; c.manual = false; c.lockTrack.tick(c, 0.016);
  ok(c.lockTrack.cur === a && c.lockTrack.since === 0 && !c.lockTrack.hard && c.lockTrack.snaps === 0, '自动锁上：重放落定动画，但不算手动（不响）');
  for (let i = 0; i < 30; i++) c.lockTrack.tick(c, 0.016);
  ok(c.lockTrack.since > LOCK_SNAP, '锁定久了，落定动画走完');
  c.manual = true; c.lockTrack.tick(c, 0.016);
  ok(c.lockTrack.since === 0 && c.lockTrack.hard && c.lockTrack.snaps === 1, '同一个人从自动变成手动（按 Tab 确认）：重放、算一次手动锁上');
  c.lock = b; c.lockTrack.tick(c, 0.016);
  ok(c.lockTrack.cur === b && c.lockTrack.snaps === 2, '手动换人：又一次');
  c.lockTrack.tick(c, 0.016);
  ok(c.lockTrack.snaps === 2, '没换人不重复记');
  b.dead = true; c.lockTrack.tick(c, 0.016);
  ok(c.lockTrack.cur === null, '目标死了：记录清掉');
}
// 6) 首领条 / 目标条怎么分
{
  reset(); const boss = mk(300, 0); boss.blv = 8; const a = mk(150, 0);
  const B = pickBoss(g, null);
  ok(B === boss, '八级以上、交上手的是首领');
  c.lock = boss; ok(lockBarTarget(g, B) === null, '锁定的就是首领：不另出目标条（只出首领那一条）');
  c.lock = a; ok(lockBarTarget(g, B) === a, '锁定的不是首领：首领条之外另出目标条');
  boss.x = p.x + 2500; ok(pickBoss(g, boss) === boss, '首领离开两千二还挂着（两千六才放掉）');
  boss.x = p.x + 2700; ok(pickBoss(g, boss) === null, '离开两千六放掉');
}
// 7) 头顶标记高度
{
  reset(); const a = mk(150, 0);
  const h1 = lockHeadH(a, 1), h2 = lockHeadH(a, 0.5);
  ok(h1 > 60 && h2 > h1, `头顶标记在名牌上方（${Math.round(h1)}），拉远时让得更多（名牌字跟着放大）`);
}
// 8) 锁定跟随镜头
{
  reset(); setLockCam(true); const L = new LockCam();
  ok(lockCamSetting.on && store.get('taixu.lockcam') === '1', '设置：默认开，存本机');
  const a = mk(400, 0); c.lock = a; c.manual = true;
  let T = L.target(g);
  ok(!!T && Math.abs(T.x - 400 * LOCKCAM_LEAN) < 1 && L.w === 1, `焦点取连线上靠你的一点（${T && Math.round(T.x)} / 400）`);
  a.x = p.x + 5000; T = L.target(g);
  ok(T === null && L.w === 0, '离得太远就不跟');
  const far = Math.max(700, Math.min(1800, c.reach * 1.25));
  a.x = p.x + far * 0.9; T = L.target(g);
  ok(!!T && L.w > 0 && L.w < 1, `跟随距离边上渐渐放掉（权重 ${L.w.toFixed(2)}）`);
  a.x = p.x + 400; p.flying = true; p.z = ALT.lowMax + 200;
  ok(L.target(g) === null && L.yieldReason(g) === 'high', '御剑高空：让给高空镜头');
  p.flying = false; p.z = 0;
  // 弹簧：从 0 拉到 140，不跳（第一帧挪得很少）、不过冲、一秒内基本到位
  L.sync(0, 0); L.spring(140, 0, 1 / 60); const first = L.x;
  let maxX = 0; for (let i = 0; i < 120; i++) { L.spring(140, 0, 1 / 60); maxX = Math.max(maxX, L.x); }
  ok(first < 5 && maxX <= 140.01 && L.x > 135, `临界阻尼：第一帧 ${first.toFixed(2)}、最大 ${maxX.toFixed(2)}、两秒后 ${L.x.toFixed(2)}`);
  setLockCam(false); ok(!lockCamSetting.on && store.get('taixu.lockcam') === '0', '设置关掉也存本机');
  // 接进 game：关掉时照原来的写法偏三成二；打开时偏三成五
  c.lock = a; a.x = p.x + 400; a.y = p.y;
  for (let i = 0; i < 240; i++) g.update?.(1 / 60);
  const offLean = g.camLeanX;
  setLockCam(true);
  for (let i = 0; i < 240; i++) g.update?.(1 / 60);
  const onLean = g.camLeanX;
  ok(Math.abs(offLean - 400 * 0.32) < 40 && Math.abs(onLean - 400 * LOCKCAM_LEAN) < 40, `游戏里：关 ${Math.round(offLean)}，开 ${Math.round(onLean)}`);
}
// 9) 立体标记：锁定环有深度、透视层深度最近、画面外边缘箭头
{
  reset(); setLockCam(true);
  const a = mk(200, 0); c.lock = a; c.manual = true; c.lockTrack.tick(c, 1);
  const B = new Batch();
  const ox = p.x - CW / 2, oy = p.y - CH / 2;
  B.hd = { affine: [1, 0, -ox, 0, 1, -oy], heightAt: () => 0, heightScale: 1, heightBoost: 1, depthAt: () => 0.5, groundBounds: () => ({ l: ox, t: oy, r: ox + CW, b: oy + CH }) } as any;
  B.reset(p.x, p.y, 1, CW, CH, null);
  const F = new FxSys(B);
  drawLockGL(F, c, 1);
  let near = 0, deep = 0; for (let i = 0; i < B.n; i++) { const d = B.data[i * FLOATS + 8]; if (d === -1) near++; else if (Math.abs(d - 0.5) < 1e-6) deep++; }
  ok(B.n > 200 && deep > 100 && near > 20, `锁定环照常比深度（${deep} 个顶点），透视层和头顶箭头深度最近（${near} 个）`);
  // 头顶箭头在它的正上方
  let minY = Infinity, sx = 0, sn = 0; for (let i = 0; i < B.n; i++) { if (B.data[i * FLOATS + 8] !== -1) continue; const y = B.data[i * FLOATS + 1]; if (y < CH / 2 - 40) { sx += B.data[i * FLOATS]; sn++; minY = Math.min(minY, y); } }
  const sxAt = sn ? sx / sn : 0;
  ok(minY < CH / 2 - 60 && Math.abs(sxAt - (CW / 2 + 200)) < 40, `头顶箭头在目标正上方（${Math.round(sxAt)}, ${Math.round(minY)}）`);
  // 画面外：边缘箭头
  a.x = p.x + 2400; a.y = p.y + 100;
  B.reset(p.x, p.y, 1, CW, CH, null); drawLockGL(F, c, 1);
  let maxX = -Infinity, edgeY = 0; for (let i = 0; i < B.n; i++) { if (B.data[i * FLOATS + 8] !== -1) continue; const x = B.data[i * FLOATS]; if (x > maxX) { maxX = x; edgeY = B.data[i * FLOATS + 1]; } }
  ok(maxX > CW - 90 && maxX < CW + 20 && edgeY > 100 && edgeY < CH - 100, `目标在画面外：右边缘出箭头（${Math.round(maxX)}, ${Math.round(edgeY)}）`);
  // 没锁定：什么都不画
  c.lock = null; B.reset(p.x, p.y, 1, CW, CH, null); drawLockGL(F, c, 1);
  ok(B.n === 0, '没有锁定时不画');
}
// 10) r13-lockbtn：手机「锁」按钮——点一下锁上、再点切换、长按取消；没得锁时变灰；按下 / 松手的计时
{
  reset(); setLockCam(true);
  ok(lockButtonState(c) === 'none' && lockButtonTap(c) === 'none' && c.lock === null && !c.manual, '附近没有能锁的：按钮灰、点了不锁（给提示）');
  const idle = mk(90, 0, false), a1 = mk(200, 0), a2 = mk(-320, 0);
  c.refreshLock(1);   // 自动锁定先落在最近的敌对 a1 上
  ok(lockButtonState(c) === 'idle', '有能锁的、还没手动锁：按钮常态');
  ok(lockButtonTap(c) === 'locked' && c.lock === a1 && c.manual && lockButtonState(c) === 'on', '点一下：锁最合适的（敌对的先、近的先），按钮高亮');
  ok(lockButtonTap(c) === 'next' && c.lock === a2 && c.manual, '再点：换下一个敌对的');
  ok(lockButtonTap(c) === 'next' && c.lock === idle, '再点：轮到没交手的');
  ok(lockButtonTap(c) === 'next' && c.lock === a1, '到头了从头再来');
  ok(lockButtonHold(c) === true && !c.manual && c.lock === null && lockButtonState(c) === 'idle', '长按：取消锁定，按钮回常态');
  ok(lockButtonHold(c) === false, '没手动锁定时长按什么也不做');
  // 手动点选锁着的那位不在顺序里（走出神识了）：点「锁」从头锁最合适的
  c.lock = a2; c.manual = true; a2.x = p.x + g.senseRadius + 300;
  ok(lockButtonTap(c) === 'locked' && c.lock === a1, '锁着的人走出神识：点「锁」重新锁最合适的');
  // 只剩一个能锁的：再点不换（提示长按取消）
  reset(); const solo = mk(150, 0);
  ok(lockButtonTap(c) === 'locked' && c.lock === solo && lockButtonTap(c) === 'only' && c.lock === solo && c.manual, '只有一个能锁的：再点还是它（提示长按取消）');
  // 锁着的死了：按钮跟着回常态 / 变灰
  solo.dead = true; ok(lockButtonState(c) === 'none', '锁着的死了、附近没别人：按钮变灰');
  // 计时：短按是点一下；按住到时长 poll 触发一次、松手不再算；计时器没赶上时松手照长按办；被打断作废
  const P = new LockPress();
  P.down(1000); ok(!P.poll(1000 + LOCK_HOLD_MS - 1) && P.up(1000 + 120) === 'tap' && !P.pressing, `短按（120 毫秒）算点一下`);
  P.down(2000); const fired = P.poll(2000 + LOCK_HOLD_MS); const again = P.poll(2000 + LOCK_HOLD_MS + 50);
  ok(fired && !again && P.up(2000 + LOCK_HOLD_MS + 200) === null, `按住 ${LOCK_HOLD_MS} 毫秒：触发一次长按，松手不再算点一下`);
  P.down(3000); ok(P.up(3000 + LOCK_HOLD_MS + 5) === 'hold', '计时器没赶上、松手时已过时长：照长按办');
  P.down(4000); P.cancel(); ok(P.up(4100) === null && !P.poll(5000), '被系统打断（pointercancel）：这一下作废');
  // 整套按钮动作连起来：点一下锁上 → 再点换人 → 长按取消
  reset(); const b1 = mk(160, 0), b2 = mk(-260, 40);
  const press = (ms: number, t0: number) => { P.down(t0); const h = P.poll(t0 + ms); const r = P.up(t0 + ms); if (h || r === 'hold') lockButtonHold(c); else if (r === 'tap') lockButtonTap(c); };
  press(90, 10000); ok(c.lock === b1 && c.manual, '按钮：点一下锁上');
  press(110, 11000); ok(c.lock === b2 && c.manual, '按钮：再点切换');
  press(LOCK_HOLD_MS + 80, 12000); ok(!c.manual && c.lock === null, '按钮：长按取消');
}
// 11) r13-lockbtn：触屏点选——手指的点中范围比鼠标宽；飞着的、高大的按身子投影点得中
{
  reset();
  const a = mk(300, 0);
  // 没有立体画面时退回地面距离：离身子中段 85 的点，鼠标（半宽 26 → 70）点不中，手指（38 → 102）点得中
  const hd0 = g.renderer.hd; g.renderer.hd = null;
  ok(pickAtScreen(g, 0, 0, a.x + 85, a.y - 30) === null && pickAtScreen(g, 0, 0, a.x + 85, a.y - 30, 38) === a, '手指的点中范围比鼠标宽（地面距离）');
  // 立体画面：用一个简单投影（俯视 + 高度往上）——飞着的剑修点它身子（空中）点得中；高大的点它头顶附近也点得中
  const ox = p.x - CW / 2, oy = p.y - CH / 2;
  g.renderer.hd = { project: (x: number, y: number, z: number) => ({ x: x - ox, y: y - oy - z * 0.8 }) };
  const fly = mk(-200, -120); fly.flyH = 160;
  const fs = { x: fly.x - ox, y: fly.y - oy - (fly.lift + 160 + 60) * 0.8 };
  ok(pickAtScreen(g, fs.x, fs.y, 0, 0, 38) === fly, '飞着的：点它在空中的身子就锁得上');
  const big = mk(250, 260); (big as any).def = { ...big.def, look: { ...(big.def.look ?? {}), size: 2.2 } };
  const { beastSpriteTop } = await import('../src/gfx/beastTex');
  const stTop = beastSpriteTop('e:' + big.def.id, false), bodyH = stTop > 0 ? stTop * 0.95 : 70 * 2.2;   // 贴图妖兽按贴图高度，没贴图时按体型估
  const bh = { x: big.x - ox, y: big.y - oy - (big.lift + big.flyH + bodyH * 0.92) * 0.8 };
  ok(pickAtScreen(g, bh.x + 20, bh.y, 0, 0, 38) === big, '高大的：点它头顶附近也锁得上');
  ok(pickAtScreen(g, a.x - ox + 32, a.y - oy - 30, 0, 0, 26) === null && pickAtScreen(g, a.x - ox + 32, a.y - oy - 30, 0, 0, 38) === a, '立体画面里手指也比鼠标宽');
  g.renderer.hd = hd0;
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
