// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=hanshan&move=<招>[&on=me][&realm=1–5] —— 撼山客招式第三批（world/hsmoves3.ts）
//   move = pojie（一拳破界 → 一脚还界）、huanjie（同上：还界接在破界后面）、jiexing（借星：在虚空斗法里，所以是对你放的破界 → 借星 → 还界）、
//          wuji（无极一击；&sea=1 在近海放：他站在岸边、木人桩悬在海面上，一拳把海劈开——原来的「分海」）、qianjunzhui（千钧坠）
//   on=me：对你放（默认对着一个木人桩放）。&stay=1：第二阶段的招「再来一招」时不换地方（量帧时间：换地方要载新地形）。一拳破界 / 借星对你放时你至少是元婴（渡得过界壁），他是化神。
// 长招放一次就停；屏幕上方有「再来一招」按钮。截图脚本用 window.__hs3（他、木人桩、这一批的状态）和 window.__hs3Ready。
import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import { hs3Of, seaLine, HS3_IDS } from '../src/world/hsmoves3';
import { hsp2Of, P2_IDS } from '../src/world/hsp2';

type W = Window & { __hs3Ready?: boolean; __hs3?: { H: Game['hanshan']; d: Enemy | null; S: ReturnType<typeof hs3Of>; again: () => boolean } };

/** 这一批管的 move（try-hanshan 先问这里，别的批次再往下分） */
export const isHs3Move = (m: string | null) => !!m && ((HS3_IDS as readonly string[]).includes(m) || (P2_IDS as readonly string[]).includes(m));
/** r8-p2 第二阶段的招：靶子摆多远 */
const P2_DIST: Record<string, number> = { p2xuan: 230, p2yan: 430, p2sui: 330, p2zhui: 280, p2pao: 460, p2bahuang: 380, p2zhuri: 280, p2jie: 320 };
const distOf = (move: string) => P2_DIST[move] ?? (move === 'pojie' || move === 'huanjie' ? 480 : move === 'qianjunzhui' ? 560 : 460);

/**
 * 海边：他站的陆地（他待得住）+ 朝海的方向（这一拳劈得开）。
 * r7-fix：先找「往画面上方（斜着也行）劈」的海边——水墙是立着的板，沿画面横着劈时靠镜头这一侧的水墙正好把沟挡死，
 * 看上去只是一堵水；往上方劈，两边的水墙分在沟的左右、中间的海沟露出来。近处找不到再放宽到任何方向。
 */
function coast(g: Game, from: { x: number; y: number }) {
  const H = g.hanshan, S = hs3Of(g), B = g.combat.brawl;
  const up = g.renderer?.hd?.upDir ?? { x: 0, y: -1 };
  const dirs = Array.from({ length: 16 }, (_, j) => { const b = j / 16 * Math.PI * 2; return { ux: Math.cos(b), uy: Math.sin(b), d: Math.cos(b) * up.x + Math.sin(b) * up.y }; }).sort((p, q) => q.d - p.d);
  for (const [minDot, maxR] of [[0.6, 120000], [-2, 420000]] as const) {
    for (let r = 0; r <= maxR; r += 1500) {
      const k = Math.max(1, Math.round(r / 1500));
      for (let i = 0; i < k; i++) {
        const a = i / k * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r;
        if (!H.okAt(x, y, 300) || !S.landOk(x, y)) continue;
        for (const { ux, uy, d } of dirs) { if (d < minDot) break; if (seaLine(g, x, y, ux, uy) && B.deepWater(x + ux * 700, y + uy * 700) && S.landOk(x - ux * 300, y - uy * 300)) return { x, y, ux, uy }; }
      }
    }
  }
  return null;
}

/** r8-p2：推近的镜头里一棵树就能把人挡住——第二阶段的招找一片没有树的平地（森林度低、他待得住） */
function clearing(g: Game, from: { x: number; y: number }) {
  const T = g.terrain, H = g.hanshan, S = hs3Of(g);
  const ok = (cx: number, cy: number) => {
    if (T.sample(cx, cy).forest > 0.12) return false;   // 先看中心（大多数点在这里就排掉，省得每个点都取几十次地形）
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const x = cx + i * 380, y = cy + j * 320; if (T.sample(x, y).forest > 0.12 || !S.landOk(x, y)) return false; }
    return H.okAt(cx, cy, 600);
  };
  // 最多试 1500 个点（原来最坏要取几十万次地形，新开局碰上林子多的地方要卡几十秒，试玩页迟迟不就绪）
  let tries = 0;
  for (let r = 0; r <= 40000 && tries < 1500; r += 1200) { const k = Math.max(1, Math.min(48, Math.round(r / 900))); for (let i = 0; i < k && tries < 1500; i++, tries++) { const a = i / k * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r; if (ok(x, y)) return { x, y }; } }
  return null;
}
/** try-hanshan 摆好他之后调：等他生成，摆木人桩（或对你），出招 */
export function tryHs3Move(g: Game, params: URLSearchParams) {
  const move = params.get('move')!, onMe = params.get('on') === 'me' || move === 'jiexing', sea = move === 'wuji' && params.get('sea') === '1';
  const H = g.hanshan, S = hs3Of(g), B = g.combat.brawl, h = g.hero, p = g.player;
  // r8-p2：第二阶段的招——直接进第二阶段（燃身；解放那一招除外：它自己点火），强行出招（不看名额）；&phase=2 也直接进
  const P2S = hsp2Of(g), isP2 = (P2_IDS as readonly string[]).includes(move);
  if (isP2) { P2S.force = true; const q = clearing(g, H.ent ?? p); if (q) { H.place(q.x, q.y, 'stay'); g.teleport(q.x + 120, q.y + 260); } }
  const p2on = () => { if ((isP2 && move !== 'p2jie') || params.get('phase') === '2') P2S.ignite(); else if (move === 'p2jie') P2S.douse(); };
  // 破界对你放：你至少元婴（他化神）
  if (onMe && (move === 'pojie' || move === 'huanjie' || move === 'jiexing')) { h.realm = Math.max(4, h.realm); h.stage = 1; }
  // 无极一击 · 海上：挪到海边
  if (sea) {
    const c = coast(g, p);
    if (c) { H.place(c.x, c.y, 'stay'); const sd = S.landOk(c.x - c.ux * 260 - c.uy * 320, c.y - c.uy * 260 + c.ux * 320) ? 1 : -1; g.teleport(c.x - c.ux * 260 - c.uy * 320 * sd, c.y - c.uy * 260 + c.ux * 320 * sd); (window as unknown as { __hs3Coast: unknown }).__hs3Coast = c; }
    else g.toast('附近找不到海边。', 'warn');
  }
  let d: Enemy | null = null, noauto = params.get('noauto') === '1', performed = false;
  const go = () => {
    const e = H.ent; if (!e) return false;
    H.autoMoves = false;   // r7-polish：演示只放这一招（不然两招之间他自己编连招、追着靶子满场跑）
    g.combat.enemies = g.combat.enemies.filter((x) => x === e || x === d);
    S.big = [];
    if (sea) {
      const c = (window as unknown as { __hs3Coast?: { x: number; y: number; ux: number; uy: number } }).__hs3Coast;
      if (!d && !onMe && c) { d = B.spawnSparMan(c.x + c.ux * 780, c.y + c.uy * 780, h.realm); d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e12; d.flyH = 50; }
      // r7-polish：再来一招时两人都回原位（上一下把靶子打进海沟、他也追下了水，站位不对就劈不出来）
      if (c) {
        B.clear(e); e.x = c.x; e.y = c.y; e.flyH = 0; e.lift = 0; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; }
        if (d) { B.clear(d); d.dead = false; d.gone = false; d.hideT = 0; d.hp = d.maxHp; d.x = c.x + c.ux * 780; d.y = c.y + c.uy * 780; d.flyH = 50; d.lift = 0; if (d.cs) { d.cs.x = d.x; d.cs.y = d.y; } if (!g.combat.enemies.includes(d)) g.combat.enemies.push(d); }
      }
      if (onMe && c) { g.teleport(c.x + c.ux * 700, c.y + c.uy * 700); p.flying = true; p.z = p.zTarget = 56; }
    } else if (!onMe && (!d || d.dead || !g.combat.enemies.includes(d))) {
      const dist = distOf(move);   // r8-p2：无极一击 600 → 460（推近的镜头里两人同框）；r7-fx3d：离远一点，看得见踩地冲刺（你站在两人中间偏下，两人都要在你的神识圈里，不然看不见）
      d = B.spawnSparMan(e.x + dist, e.y + 30, h.realm); d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e12;
    } else if (!onMe && d) {
      // r8-p2：再来一招时靶子摆回原位（上一招把它轰飞到几千外，原来再来一招是冲着几千外的它放的）
      const dist = distOf(move);
      B.clear(d); d.hp = d.maxHp; d.x = e.x + dist; d.y = e.y + 30; d.flyH = 0; d.lift = 0; if (d.cs) { d.cs.x = d.x; d.cs.y = d.y; d.cs.lift = 0; }
    }
    // 你站在一旁看（镜头跟着你）：木人桩、他都在画面里
    if (!onMe && !sea) { const dx = (d?.x ?? e.x) - e.x; g.teleport(e.x + dx * 0.5 + 40, e.y + 200); }
    if (onMe && !sea) { g.teleport(e.x + (move === 'wuji' ? 620 : move === 'qianjunzhui' ? 560 : 480), e.y + 20); }
    if (!p.flying) { p.z = 0; p.zTarget = 0; }
    h.hp = 1; h.mp = 1;
    p2on();
    g.senseBurstT = Math.max(g.senseBurstT, 120);   // r7-fx3d：神识外放（圈子翻倍）——演示时他、靶子、被打飞的落点都在圈里看得见
    if (onMe) { if (H.mode !== 'spar') H.startSpar(); const sp = (H as unknown as { spar: { counterAt: number; yieldHits: number } | null }).spar; if (sp) { sp.yieldHits = 3; sp.counterAt = g.time; } }   // 切磋（不致死），让招直接让完
    e.cs?.faceToward((d ?? p).x - e.x, (d ?? p).y - e.y, false);
    // r7-polish：他的对手指到靶子上
    if (!onMe && d) { e.tgE = d; e.tgP = false; } else if (onMe) { e.tgE = null; e.tgP = true; }
    // r9：先把取景交给撼山客（真打的时候他放招前镜头本来就在两人身上；不然起手那一下镜头还在从远处推过来）
    if (!onMe && d) B.sideShot(e, d, 0.6);
    const skip = noauto; noauto = false;   // r8-p2：&noauto=1 进场不自己放第一招（录像：等「再来一招」再放，片头不带上一招的尾巴）
    window.setTimeout(() => { if (!onMe && d) { e.tgE = d; e.tgP = false; } if (!skip) { performed = true; (window as unknown as { __hs3T0: number }).__hs3T0 = g.time; H.perform(move, onMe ? null : d); } }, 500);
    return true;
  };
  const wait = window.setInterval(() => {
    if (!H.ent) return;
    clearInterval(wait);
    go();
    // 「再来一招」：长招放一次就停，点这个再来
    const btn = document.createElement('button');
    btn.textContent = '再来一招';
    Object.assign(btn.style, { position: 'fixed', top: '268px', right: '22px', zIndex: '30', padding: '6px 18px', font: '15px serif', color: '#f3e6c8', background: 'rgba(40,30,22,0.85)', border: '1px solid #b89a62', borderRadius: '4px', cursor: 'pointer' } as CSSStyleDeclaration);
    btn.onclick = () => { if (S.trip || B.runs.some((r) => r.user === H.ent)) return; g.xukong.reset(); B.reset(); go(); };
    document.body.appendChild(btn);
    (window as W).__hs3 = { H, get d() { return d; }, S, again: () => { if (S.trip) return false; const t0 = performance.now(), wait = () => { if (B.runs.some((r) => r.user === H.ent && !r.done) && performance.now() - t0 < 12000) window.setTimeout(wait, 100); else { B.clear(H.ent!); const bb = B.body(H.ent!) as { move: { done: boolean } | null }; if (bb.move?.done) bb.move = null; if (isP2 && performed && params.get('stay') !== '1') { const e = H.ent!, q = clearing(g, { x: e.x + 2600, y: e.y + 600 }); if (q) { e.x = e.hx = q.x; e.y = e.hy = q.y; if (e.cs) { e.cs.x = q.x; e.cs.y = q.y; } g.teleport(q.x + 120, q.y + 260); } } go(); }   /* 第二阶段的招：换一块干净的地（上一招的焦土、坑留在原处） */ }; wait(); return true; } };   // r8-p2：上一招（入口自动放的那一下）还没放完就等它放完再来
    window.setTimeout(() => { (window as W).__hs3Ready = true; }, 300);
  }, 100);
}
