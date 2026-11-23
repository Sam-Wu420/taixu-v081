// 试玩入口（撼山客招式第二批，world/hsmoves2.ts）：
//   perf-acceptance.html?auto=new&map=tiannan&try=hanshan&move=<招>[&on=me]
//     招：liuxing 流星百裂 / yanhui 燕回 / shifang 十方弹 / tiandi 天地往返 / dianxue 点穴延爆 / lidi 犁地 / lunren 抡人为棍 / yunxing 陨星坠 / zhishan 掷山
//     他对着一个人形陪练（劫修的样子，不还手、血很厚、每次复位）循环放这一招（抡人为棍身边多两个当「被砸的」；掷山的在七百多外）；&on=me 是对着你放（你被抓时连按方向键 / 空格、点屏幕挣脱）。
//     镜头：出招时近战的「撼山客取景」框住两人推近、按高度往上看，收招后缓回。
//   perf-acceptance.html?auto=new&map=tiannan&try=brawl&learn=hs2[&foe=0&calm=1]
//     你直接会燕回、十方弹、犁地（技能栏 5、X、V），对着木人桩放。
// 截图用（edge-shot 的 --step 脚本里调）：
//   await __hs2.go(T)   从头放一次，放到第 T 息时整个画面定住（逐帧固定步长，结果每次一样）；go() 不定格
//   await __hs2p.go(id, T)   你放这一招（learn=hs2 的入口）
import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import { HS2_MOVES, performHs2, learnHsBatch2, hs2ResetAi } from '../src/world/hsmoves2';
import { moveArtId } from '../src/world/brawlmoves';

type W = Window & { __hs2?: unknown; __hs2p?: unknown; __hs2Ready?: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 逐帧固定步长；定格 = 步长几乎为零（世界和特效一起停住，画面照常画） */
function stepper(g: Game) {
  g.debugFixedDt = 1 / 60;
  let t0 = g.time, stopAt = Infinity, onStop: (() => void) | null = null;
  const tick = window.setInterval(() => { if (g.time - t0 >= stopAt) { g.debugFixedDt = 1e-7; stopAt = Infinity; const f = onStop; onStop = null; f?.(); } }, 5);
  void tick;
  return {
    start(T?: number): Promise<void> {
      g.debugFixedDt = 1 / 60; t0 = g.time;
      if (T === undefined) { stopAt = Infinity; return Promise.resolve(); }
      stopAt = T;
      return new Promise((res) => { onStop = res; });
    },
    get frozen() { return g.debugFixedDt < 1e-4; },
  };
}
/** 镜头跟着几个人（取他们的中点，高处的人按半个高度算；默认远近） */
function follow(g: Game, pts: () => { x: number; y: number; z: number }[] | null) {
  const B = g.combat.brawl as unknown as { cameraTick(dt: number): boolean };
  const orig = B.cameraTick.bind(B);
  B.cameraTick = (dt: number) => {
    const P = pts(); if (!P || !P.length) return orig(dt);
    let x = 0, y = 0; for (const q of P) { x += q.x; y += q.y - q.z * 0.5; } x /= P.length; y /= P.length;
    const k = Math.min(1, dt * 5); g.cam.x += (x - g.cam.x) * k; g.cam.y += (y - 40 - g.cam.y) * k;
    return true;
  };
}

/** try=hanshan&move=…：这一批的招就接手，返回 true；不是这一批的返回 false（交给别的批次） */
export function tryHsMoves2(g: Game, params: URLSearchParams): boolean {
  const id = params.get('move') ?? '';
  if (!HS2_MOVES.some((m) => m.id === id)) return false;
  const onMe = params.get('on') === 'me', H = g.hanshan, c = g.combat, B = c.brawl;
  const wait = window.setInterval(() => {
    const e = H.ent; if (!e) return;
    clearInterval(wait);
    const S = stepper(g);
    hs2ResetAi(1e12);   // 他自己挑招关掉：只放这一招
    // 打架状态（不回平时、近战原型不出手）
    (H as unknown as { toFight(m: string): void }).toFight('brawl');
    (H as unknown as { brawling(): void }).brawling = () => { e.hp = e.maxHp; e.aggro = true; };
    const b = B.body(e); if (b.ai) b.ai.cd = 1e12;
    e.tgP = false; (e as unknown as { noP: boolean }).noP = true;
    // 场子：找一片少树的平地（犁地要跑一千八、树挡在镜头前面看不清），人和他都挪过去
    // r7-polish：先找几乎没树的（犁地一路狂奔一千八，树冠会把两个人整个盖住），找不到再放宽
    //   （出生地一带「林」都在五成以上：往外找远些，找到林不到一成二的就停；都没有就用最稀的那一处）
    const T = g.terrain, fmaxAt = (cx: number, cy: number): number => {
      if (T.inLocZone(cx, cy, 2600) || T.sample(cx, cy).forest > 0.3) return 9;
      let f = 0;
      for (let i = -3; i <= 7; i++) for (let j = -2; j <= 3; j++) { const x = cx + i * 300, y = cy + j * 260; if (!T.isLand(x, y) || T.walkFactor(x, y) <= 0 || g.space.blocked(x, y) || c.safeAt(x, y) || !T.canTraverse(cx, cy, x, y)) return 9; f = Math.max(f, T.sample(x, y).forest); if (f > 0.3) return 9; }
      return f;
    };
    let O = { x: e.x, y: e.y }, bestF = 9;
    search: for (let r = 0; r <= 160000; r += r < 30000 ? 700 : 1600) { const n = Math.max(1, Math.round(r / (r < 30000 ? 450 : 1400))); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r; const f = fmaxAt(x, y); if (f < bestF) { bestF = f; O = { x, y }; if (f <= 0.12) break search; } } }
    g.teleport(O.x - 140, O.y + 360);
    e.x = O.x; e.y = O.y; H.s.x = O.x; H.s.y = O.y;
    const far = id === 'zhishan', dx = far ? 760 : 210;
    let dummy: Enemy | null = null; const extras: Enemy[] = [];
    const mk = (x: number, y: number) => { const d = B.spawnSparMan(x, y, 3); d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e12; return d; };
    if (!onMe) dummy = mk(O.x + dx, O.y + 20);
    if (id === 'lunren') for (const [ox, oy] of [[150, -170], [-170, 150]]) { const d = mk(O.x + ox, O.y + oy); d.aggro = true; d.grudge = e; d.tgE = e; extras.push(d); }
    const p = g.player, h = g.hero;
    const keepHp = window.setInterval(() => { h.hp = Math.max(h.hp, 0.7); h.mp = 1; }, 200);
    void keepHp;
    const reset = () => {
      for (const r of [...B.runs]) r.done = true;
      B.clear(e); e.x = O.x; e.y = O.y; e.flyH = 0; e.lift = 0; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.setAction('idle'); }
      for (const k of Object.keys(e.skCd)) e.skCd[k] = 0;
      const put = (d: Enemy, x: number, y: number) => { B.clear(d); const bd = B.body(d); bd.subT = 0; bd.staggerT = 0; d.hideT = 0; d.dead = false; d.hp = d.maxHp; d.x = x; d.y = y; d.flyH = 0; d.lift = 0; if (d.cs) { d.cs.x = x; d.cs.y = y; d.cs.setAction('idle'); } if (!c.enemies.includes(d)) c.enemies.push(d); };
      if (dummy) put(dummy, O.x + dx, O.y + 20);
      extras.forEach((d, i) => put(d, O.x + [150, -170][i], O.y + [-170, 150][i]));
      B.pb.air = false; B.pb.staggerT = 0; B.playerLift = 0; c.pst = {}; c.invulnT = 0; p.flying = false; p.z = p.zTarget = 0;
      if (onMe) { p.x = O.x + dx; p.y = O.y + 20; } else { p.x = O.x - 140; p.y = O.y + 360; }
      p.st.x = p.x; p.st.y = p.y;
      B.ghosts.length = 0;
      try { c.wreck.marks.length = 0; } catch { /* */ }
      if (e.cs) e.cs.faceToward(dx, 20, false);
    };
    // 镜头：不另接管——出招时近战自己的「撼山客取景」（brawl.stageCam）框住两人、推近、按高度往上看
    let auto = true, busyUntil = 0;
    const once = (): boolean => { reset(); return performHs2(H, id, onMe ? null : dummy, true); };
    const api = {
      H, dummy, id,
      /** 从头放一次；T 给了就放到第 T 息定格 */
      async go(T?: number) {
        auto = false; S.start(); reset();
        for (let i = 0; i < 60 && (B.peek(e)?.move || B.runs.length); i++) { for (const r of [...B.runs]) r.done = true; await sleep(50); }
        await sleep(60);
        const ok = once(); const done = S.start(T); return ok ? done : Promise.reject(new Error('没放出来')); },
      unfreeze() { S.start(); },
    };
    (window as W).__hs2 = api;
    // 平时：循环放
    window.setInterval(() => {
      if (!auto || S.frozen) return;
      const busy = !!B.peek(e)?.move;
      if (busy) { busyUntil = g.time; return; }
      if (g.time - busyUntil > (id === 'zhishan' ? 2.4 : 1.3)) { once(); busyUntil = g.time; }
    }, 100);
    g.toast(`撼山客 · ${HS2_MOVES.find((m) => m.id === id)!.name}${onMe ? '（对着你；被抓时连按方向键 / 空格、点屏幕挣脱）' : ''}`, 'good');
    (window as W).__hs2Ready = true;
  }, 100);
  return true;
}

/** try=brawl&learn=hs2：你直接会这一批的三招（技能栏 5、X、V），对着木人桩放 */
export function learnHs2(g: Game) {
  const h = g.hero, B = g.combat.brawl, c = g.combat;
  h.realm = Math.max(3, h.realm);
  learnHsBatch2(h);
  h.hotbar[4] = moveArtId('yanhui'); h.hotbar[7] = moveArtId('shifang'); h.hotbar[8] = moveArtId('lidi');
  g.updateUI(true);
  const S = stepper(g);
  const W0 = window as W & { __brawl?: { dummy: Enemy } };
  const dummy = W0.__brawl?.dummy ?? null;
  const p = g.player, O = { x: p.x, y: p.y };
  follow(g, () => { const P = [{ x: p.x, y: p.y, z: B.playerLift }]; if (dummy && !dummy.dead && Math.hypot(dummy.x - p.x, dummy.y - p.y) < 2400) P.push({ x: dummy.x, y: dummy.y, z: dummy.z }); return P.length > 1 ? P : null; });
  (window as W).__hs2p = {
    async go(id: string, T?: number) {
      S.start();
      for (const r of [...B.runs]) r.done = true;
      await sleep(60);
      B.pb.air = false; B.playerLift = 0; c.pst = {}; c.cds.clear(); h.mp = 1; h.hp = 1;
      p.x = O.x; p.y = O.y; p.st.x = p.x; p.st.y = p.y;
      if (dummy) { B.clear(dummy); dummy.x = O.x + 230; dummy.y = O.y + 20; dummy.hp = dummy.maxHp; dummy.flyH = 0; dummy.lift = 0; dummy.hideT = 0; c.lock = dummy; c.manual = true; }
      try { c.wreck.marks.length = 0; } catch { /* */ }
      await sleep(60);
      c.castSlot(h.hotbar.indexOf(moveArtId(id)));
      return S.start(T);
    },
  };
  g.toast('你会了撼山客的燕回（5）、十方弹（X）、犁地（V）：对着木人桩放。', 'good');
}
