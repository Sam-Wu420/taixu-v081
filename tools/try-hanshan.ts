// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=hanshan[&at=near|fight|spar|trail|rumor] —— 撼山客 · 岳千钧（world/hanshan.ts）
//   near  （默认）他就在你旁边站着（结丹修为，他是元婴）。走到跟前按交谈键（手机点他）搭话
//   fight 他在不远处打一头妖王（只打他、不冲你来），打完喝一口酒；你可以上前
//   spar  直接开始切磋：他先让三招，之后还手，不致死；撑得越久奖励越好
//   trail 你站在一串由旧到新的痕迹起点（拳坑、断树、犁开的沟），他在尽头
//   rumor 立刻报一条江湖传闻，并把他放在两万外打架：看天边的冲击光、听闷雷、看小地图边缘的震动标记
// 可选：&realm=1–5 你的境界（默认结丹）；&met=1 当作已经搭过话（名牌带名字）
// r7 招式第一批：&move=<招的 id>  他对着一个木人桩循环放这一招（截图、对照用）；&move=all 九招轮着放
//   id：suodi 缩地成寸、takong 踏空步、yicunbeng 一寸崩、quanya 拳压·开山、zhenjiao 震脚、qihe 气合、kongshou 空手接宝、jingang 金刚不坏、houfa 后发先至
//   接宝、气合：木人桩先朝他扔一柄飞剑 / 一团火（气合是三团）；金刚不坏：起手后飞来一柄剑让他硬吃
//   at=fight 时他打妖王会自动把这一批九招轮着秀一遍（中间夹着寻常拳脚），秀完照寻常的编排打
// &move=<招>[&on=me]：他放某一招（第三批 pojie / huanjie / jiexing / wuji / qianjunzhui，wuji 加 &sea=1 在海上放，见 tools/try-hs3.ts）
// &move=<招>[&on=me]：他对着木人桩（或你）循环放某一招（第二批的九招见 tools/try-hsmoves2.ts）
import { HS_BATCH1 } from '../src/world/hsmoves';
import { FOG_CELL, FOG_W, FOG_H, type Game } from '../src/world/game';

type W = Window & { __hsReady?: boolean; __hs?: Game['hanshan']; __game?: Game; __hsDummy?: unknown };

/** 找一片开阔平地：中心周围 ±1600 × ±900 都站得住、不在城镇宗门里、他也待得住 */
export function openField(g: Game, from: { x: number; y: number }, R0 = 0): { x: number; y: number } | null {
  const T = g.terrain, H = g.hanshan;
  const ok = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2600) || !H.okAt(cx, cy, 1500)) return false;
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) {
      const x = cx + i * 400, y = cy + j * 300;
      if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || g.space.blocked(x, y) || g.combat.safeAt(x, y)) return false;
      if (!T.canTraverse(cx, cy, x, y)) return false;
    }
    return true;
  };
  for (let r = R0; r <= R0 + 40000; r += 800) {
    const n = Math.max(1, Math.round(r / 500));
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = from.x + Math.cos(a) * r, y = from.y + Math.sin(a) * r; if (ok(x, y)) return { x, y }; }
  }
  return null;
}

/**
 * 招式演示清场（&move=…）：不相干的敌人清掉（野怪、守药 / 护巢的妖兽、伏击的……只留他、他的妖王和演示摆的靶子 bx_*），
 * 不刷怪；新手引导的情境小课（虚空、欺身……）记成上过、弹出来的收起；地点卡（青枫谷……）不出。都只在这一页里，不写存档以外的东西。
 */
export function clearStage(g: Game) {
  const c = g.combat, H = g.hanshan;
  const keep = (e: { def: { id: string } }) => e === H.ent || e === H.beast || String(e.def.id).startsWith('bx_');
  const tu = g.tutorial as unknown as { lessons: { id: string }[]; ctxCur: unknown; ensure(): { ctx: string[] } };
  // 他的招常把人拖、打出几千远（犁地一千八、十方弹、掷山……），跑出你神识照过的那一圈就进了探索迷雾（一片白纸）：他周围四千都照亮
  const reveal = (x: number, y: number, r: number) => {
    for (let gy = Math.floor((y - r) / FOG_CELL); gy <= Math.floor((y + r) / FOG_CELL); gy++) for (let gx = Math.floor((x - r) / FOG_CELL); gx <= Math.floor((x + r) / FOG_CELL); gx++) {
      if (gx >= 0 && gy >= 0 && gx < FOG_W && gy < FOG_H) g.explored[gy * FOG_W + gx] = 1;
    }
  };
  window.setInterval(() => {
    if (H.ent) reveal(H.ent.x, H.ent.y, 4000);
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    if (c.enemies.some((e) => !keep(e))) c.enemies = c.enemies.filter(keep);
    try { const s = tu.ensure(); for (const L of tu.lessons) if (!s.ctx.includes(L.id)) s.ctx.push(L.id); tu.ctxCur = null; } catch { /* 无引导 */ }
  }, 200);
  const css = document.createElement('style'); css.textContent = '.loc-card{display:none!important}'; document.head.appendChild(css);
}

export function tryHanshan(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const at = params.get('at') ?? 'near', h = g.hero, H = g.hanshan, c = g.combat;
    h.realm = Math.max(1, Math.min(5, Number(params.get('realm') ?? 3))); h.stage = h.realm === 1 ? 8 : 1; h.hp = 1; h.mp = 1;
    c.brawl.learn(true);
    (c as unknown as { spawnT: number }).spawnT = 1e9;   // 试玩：不刷野怪，免得抢镜
    const f = openField(g, g.player) ?? { x: g.player.x, y: g.player.y };
    g.teleport(f.x, f.y);
    c.enemies.length = 0;
    const p = g.player, day = Math.floor(g.day), s = H.s;
    if (params.get('met') === '1' || at === 'spar') { s.met = true; s.spotted = true; }
    s.angryUntil = undefined; s.lastSpar = undefined;
    const spot = (dx: number, dy: number) => { for (let k = 0; k < 24; k++) { const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, L = Math.hypot(dx, dy), x = p.x + Math.cos(a) * L, y = p.y + Math.sin(a) * L; if (H.okAt(x, y, 600) && !c.safeAt(x, y)) return { x, y }; } return { x: p.x + dx, y: p.y + dy }; };
    const move = params.get('move');
    if (move) { const q = spot(320, -40); H.place(q.x, q.y, 'stay'); s.met = true; s.spotted = true; }
    else if (at === 'fight') { const q = spot(640, -180); H.place(q.x, q.y, 'stay', { fight: true }); }
    else if (at === 'spar') { const q = spot(190, -20); H.place(q.x, q.y, 'stay'); }
    else if (at === 'trail') {
      // 一串痕迹：从你脚下往前一路排开，越往前越新，他在尽头
      let ang = 0, L = 800, n = 9;
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; let good = true; for (let i = 1; i <= n + 1 && good; i++) { const x = p.x + Math.cos(a) * L * i, y = p.y + Math.sin(a) * L * i * 0.8; if (!H.okAt(x, y, 300) || g.terrain.sample(x, y).elev > 0.38 || g.space.blocked(x, y)) good = false; } if (good) { ang = a; break; } }   // 平地上一路排开（山坡上地贴看不清）
      s.traces = [];
      const kinds = ['furrow', 'pit', 'tree', 'furrow', 'pit', 'furrow', 'tree', 'pit', 'furrow'] as const;
      for (let i = 0; i < n; i++) { const x = p.x + Math.cos(ang) * L * (i + 0.6), y = p.y + Math.sin(ang) * L * (i + 0.6) * 0.8; H.addTrace(s, x, y, kinds[i], ang + (i % 2 ? 0.3 : -0.2), 0.9 + (i % 3) * 0.2, day - 140 + i * 16); }
      const ex = p.x + Math.cos(ang) * L * (n + 0.8), ey = p.y + Math.sin(ang) * L * (n + 0.8) * 0.8;
      H.place(ex, ey, 'stay');
    } else if (at === 'rumor') {
      const q = openField(g, p, 17000) ?? { x: p.x + 18000, y: p.y };
      H.place(q.x, q.y, 'stay', { fight: true });
      H.rumorNow();
    } else { const q = spot(260, -60); H.place(q.x, q.y, 'stay'); }
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    if (move) clearStage(g);
    g.updateUI(true);
    (window as W).__hs = H;
    if (move && (move === 'all' || (HS_BATCH1 as readonly string[]).includes(move))) {   // 别的批次的招由各自的试玩脚本摆
      // 等他生成出来（下一帧）再摆木人桩、开始循环
      const t = window.setInterval(() => { if (H.ent) { clearInterval(t); (window as W).__hsDummy = H.startDemo(move as never); } }, 100);
    }
    if (at === 'spar' && !move) {
      // 等他生成出来（下一帧）再开打
      const t = window.setInterval(() => { if (H.ent) { clearInterval(t); H.startSpar(); if (params.get('phase') === '2') void import('../src/world/hsp2').then((m) => m.hsp2Of(g).ignite()); } }, 100);   // r8-p2：&phase=2 一开打就是第二阶段
    }
    if (!move) g.toast(at === 'fight' ? '前面有动静——一个赤膊大汉正和一头妖王硬碰硬。走近些看。' : at === 'trail' ? '地上有一道犁开的沟……顺着越来越新的痕迹走，能追上留下它们的人。' : at === 'rumor' ? '远处天边一闪一闪，闷雷滚滚——看小地图边缘的震动标记，朝那边去。' : at === 'spar' ? '切磋开始：他先让你三招（打中他三下），之后就要还手了。' : '你身边站着一个比常人高出一头的大汉。走到跟前按交谈键（手机点他）搭话。', 'good');
    // &move=<招>：第三批的招交给 tools/try-hs3.ts（它自己摆场面）；第一批的照上面 startDemo
    { const mv = params.get('move'); if (mv) void import('./try-hs3').then((m) => { if (m.isHs3Move(mv)) m.tryHs3Move(g, params); }); }
    window.setTimeout(() => { (window as W).__hsReady = true; }, 600);
    if (params.get('move')) void import('./try-hsmoves2').then((m) => m.tryHsMoves2(g, params));   // &move=<招>：先查第二批的招表（tools/try-hsmoves2.ts），不是这一批的返回 false
  }, 6500);
}
