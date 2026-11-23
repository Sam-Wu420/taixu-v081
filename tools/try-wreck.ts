// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=wreck[&at=forest|rocks|coast|field][&demo=cone|line|radial|crack|hurl|split][&loop=1]
// —— 野外破坏（world/wreck.ts）。主角站在指定地貌里，左上角几个按钮各触发一次对应的破坏；&demo= 进场后自动来一次；&loop=1 每四息轮着来一遍。
//   at=forest  一片林子边上（默认）：放射、锥形、直线都朝林子里打，看树怎么倒、树桩、坑
//   at=rocks   开阔地上摆一圈巨石、礁石、船骸：碎成几大块；「拔扔」把身边的巨石拔起来扔出去
//   at=coast   海边：「分海」从岸边往海里劈开一道；放射砸在沙滩上
//   at=field   草地：坑、沟、龟裂贴在草地上，草被清掉 / 压伏
// 林子里、石头堆里还站着几个木人桩：接口只返回「范围里有谁、往哪边推、多大力」，这里演示调用方怎么自己打（hitEnemy + 近战击飞）。
// 截图：window.__wreck.fire('radial') 触发；__wreck.target 是这一下打在哪。
import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import type { WreckResult, WreckCarry } from '../src/world/wreck';

type Demo = 'cone' | 'line' | 'radial' | 'crack' | 'hurl' | 'split';
type Wn = Window & { __wreckReady?: boolean; __wreck?: { fire: (d: Demo) => void; target: { x: number; y: number }; at: string; dummies: Enemy[]; last: WreckResult | null; reset: () => void } };

/** 一片林子：块中心附近树够密、离城镇宗门远、地势平（山上树少）；返回林子中心 */
function forest(g: Game): { x: number; y: number } | null {
  const T = g.terrain, p = g.player, C = 1024, pcx = Math.floor(p.x / C), pcy = Math.floor(p.y / C);
  for (let r = 0; r <= 30; r++) for (let i = -r; i <= r; i++) for (const [cx, cy] of [[pcx + i, pcy - r], [pcx + i, pcy + r], [pcx - r, pcy + i], [pcx + r, pcy + i]]) {
    if (!T.hasChunk(cx, cy)) continue;
    const x = (cx + 0.5) * C, y = (cy + 0.5) * C, s = T.sample(x, y);
    if (s.forest < 0.5 || s.elev > 0.5 || !T.isLand(x, y) || T.inLocZone(x, y, 1800)) continue;
    const ts = T.getDecos(cx, cy).filter((d) => d.kind === 'tree');
    if (ts.length < 26) continue;
    // 林子里树最密的一处
    let best = null as { x: number; y: number; n: number } | null;
    for (const d of ts) { const n = ts.filter((o) => Math.hypot(o.x - d.x, o.y - d.y) < 380).length; if (!best || n > best.n) best = { x: d.x, y: d.y, n }; }
    if (best && best.n >= 10 && T.walkFactor(best.x, best.y + 520) > 0 && !g.space.blocked(best.x, best.y + 520)) return best;
  }
  return null;
}
/** 开阔平地（草地多）：周围 ±1200 × ±800 都站得住、没有屋舍、地势走得通 */
function field(g: Game): { x: number; y: number } | null {
  const T = g.terrain, p = g.player;
  const ok = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2400)) return false;
    const s = T.sample(cx, cy); if (s.forest > 0.45 || s.elev > 0.4 || s.arid > 0.6 || s.cold > 0.5) return false;
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) { const x = cx + i * 450, y = cy + j * 450; if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || g.space.blocked(x, y) || g.combat.safeAt(x, y)) return false; }
    return true;
  };
  for (let r = 0; r <= 60000; r += 900) { const n = Math.max(1, Math.round(r / 500)); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (ok(x, y)) return { x, y }; } }
  return null;
}
/** 一段海岸：脚下能走，某个方向七百到两千二都是海 */
function coast(g: Game): { x: number; y: number; ux: number; uy: number } | null {
  const T = g.terrain, p = g.player;
  const land = (x: number, y: number) => T.isLand(x, y) && T.walkFactor(x, y) > 0 && !g.space.blocked(x, y) && !g.combat.safeAt(x, y);
  for (let r = 0; r <= 60000; r += 900) {
    const n = Math.max(1, Math.round(r / 600));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, cx = p.x + Math.cos(a) * r, cy = p.y + Math.sin(a) * r;
      if (!land(cx, cy) || T.inLocZone(cx, cy, 2400)) continue;
      for (let d = 0; d < 8; d++) {
        const da = d / 8 * Math.PI * 2, ux = Math.cos(da), uy = Math.sin(da);
        let ok = true;
        for (let s = 100; s <= 450 && ok; s += 120) if (!land(cx - ux * s, cy - uy * s * 0.7)) ok = false;
        for (let s = 700; s <= 2400 && ok; s += 200) if (T.isLand(cx + ux * s, cy + uy * s)) ok = false;
        if (ok) return { x: cx, y: cy, ux, uy };
      }
    }
  }
  return null;
}

export function tryWreck(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const h = g.hero, c = g.combat, B = c.brawl, W = c.wreck, at = params.get('at') ?? 'forest';
    h.realm = 4; h.stage = 1; h.hp = 1; h.mp = 1;
    (c as unknown as { spawnT: number }).spawnT = 1e9;   // 不刷野怪（截图用）
    c.enemies.length = 0;
    let target = { x: 0, y: 0 }, aim = { x: 0, y: -1 }, shore: { x: number; y: number } | null = null;
    const p = g.player;
    if (at === 'coast') {
      const q = coast(g);
      // 御剑悬在近海上空（离岸五百）：分海整条在画面里，岸在画面另一侧
      if (q) { g.teleport(q.x + q.ux * 500, q.y + q.uy * 500); aim = { x: q.ux, y: q.uy }; shore = { x: q.x - q.ux * 80, y: q.y - q.uy * 80 }; }
    } else if (at === 'forest') {
      const f = forest(g);
      // 站在林子南边一点，林子在画面上方
      if (f) { g.teleport(f.x, f.y + 520); target = { x: f.x, y: f.y }; aim = { x: 0, y: -1 }; }
    } else { const f = field(g); if (f) g.teleport(f.x, f.y); }
    if (shore) { p.flying = true; p.z = p.zTarget = 56; } else { p.flying = false; p.z = p.zTarget = 0; }
    if (at !== 'forest') target = shore ?? { x: p.x + aim.x * 520, y: p.y + aim.y * 520 };
    const dummies: Enemy[] = [];
    const dummy = (x: number, y: number) => { const e = B.spawnDummy(x, y, 2); e.name = '木人桩'; e.kit = []; e.skT = 1e9; dummies.push(e); return e; };
    const placeRocks = () => {
      B.brk.reset(); B.brk.manual = true;
      const R = (k: 'reef' | 'boulder' | 'tree' | 'wreck', dx: number, dy: number, s = 0.6, v = 0) => B.brk.place(k, target.x + dx, target.y + dy, s, v);
      R('boulder', -260, -60, 0.9, 0); R('boulder', 220, -120, 0.8, 1); R('reef', 60, 160, 0.7, 2); R('wreck', -120, 260, 0.7, 0); R('boulder', 420, 160, 0.6, 2); R('tree', -420, 120, 0.7, 1);
      B.brk.place('boulder', p.x + 150, p.y - 30, 0.85, 3);   // 身边那块：拔起来扔
    };
    if (at === 'rocks' || at === 'field') placeRocks();
    const setupDummies = () => { for (const e of dummies) e.dead = true; c.enemies = c.enemies.filter((e) => !dummies.includes(e)); dummies.length = 0; if (at !== 'coast') { dummy(target.x - 180, target.y + 90); dummy(target.x + 200, target.y + 40); dummy(target.x + 30, target.y - 200); } };
    setupDummies();
    /** 调用方怎么打：照清单走 hitEnemy（伤害）和近战的击飞（launch），主角自己是出手的人不在清单上 */
    const apply = (r: WreckResult) => {
      const atk = c.pStats.atk;
      for (const u of r.units) {
        if (!u.e || u.player) continue;
        c.hitEnemy(u.e, atk * 0.25 * u.power, { realm: h.realm, stCh: 0, school: '体', brawl: 'wreck' } as never, u.x - u.ux * 40, u.y - u.uy * 40);
        if (u.launchable) B.launch(u.e, u.ux, u.uy, 260 + u.power * 160, 420 + u.power * 120, 'p', h.realm, atk, false);
      }
      api.last = r;
    };
    let held: WreckCarry | null = null, holdT = 0;
    const fire = (d: Demo) => {
      const dx = target.x - p.x, dy = target.y - p.y, dir = Math.atan2(dy, dx);
      if (d === 'radial') apply(W.radial(target.x, target.y, 560, 4.2, 'p'));
      else if (d === 'crack') apply(W.radial(p.x, p.y, 620, 3, 'p', { mark: 'crack' }));
      else if (d === 'cone') apply(W.cone(p.x + Math.cos(dir) * 120, p.y + Math.sin(dir) * 120, dir, 900, 0.42, 3.6, 'p'));
      else if (d === 'line') apply(W.line(p.x + Math.cos(dir) * 80, p.y + Math.sin(dir) * 80, p.x + Math.cos(dir) * 1300, p.y + Math.sin(dir) * 1300, 260, 3.2, 'p'));
      else if (d === 'hurl') {
        if (!B.brk.near(p.x, p.y, 500).some((r) => !r.dead)) B.brk.place('boulder', p.x + 150, p.y - 30, 0.85, 3);
        held = W.uproot(p.x, p.y, 500, 'rock') ?? W.uproot(p.x, p.y, 700, 'tree'); holdT = 0;
      } else if (d === 'split') {
        // 顺着海岸方向、离你两百五往外一点劈开（整条都在画面里）
        const ox = p.x + aim.x * 260, oy = p.y + aim.y * 260, px = -aim.y, py = aim.x;
        const r = W.split(ox - px * 900, oy - py * 900, ox + px * 900, oy + py * 900, 280, { dur: 2.5, power: 3.5 });
        g.toast(r.ok ? '分海：水面劈开，两边立起水墙，两息后合拢。' : `这里劈不开：${r.reason}`, r.ok ? 'good' : 'warn');
      }
    };
    // 拿着：举过头顶一会儿再扔向目标（每帧给位置）
    let last = performance.now();
    const tick = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (held && held.st !== 'done') {
        holdT += dt;
        if (held.st === 'held' || held.st === 'lift') { if (holdT > 0.5) W.hold(held, p.x, p.y - 10, 120 + Math.sin(holdT * 6) * 6, Math.sin(holdT * 3) * 0.15); }
        if (holdT > 1.3 && held.st === 'held') { W.hurl(held, p.x, p.y, target.x, target.y, { power: 3.5, arc: 0.28, src: 'p', onLand: apply }); }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const reset = () => { W.reset(); g.ws.wreck = undefined; if (at === 'rocks' || at === 'field') placeRocks(); setupDummies(); };   // 复原：连存档里的大坑一起清掉（试玩用）
    // 左上角的按钮（只用 transform / opacity 的动效：这里没有动效）
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;top:12px;z-index:9999;display:flex;gap:6px;flex-wrap:wrap;max-width:420px;font:14px/1.2 "STKaiti","KaiTi",serif';
    const NAMES: [Demo | 'reset', string][] = [['radial', '放射·砸坑'], ['crack', '震脚·龟裂'], ['cone', '锥形·一寸崩'], ['line', '直线·拳压'], ['hurl', '拔起·扔出'], ['split', '分海'], ['reset', '复原']];
    for (const [k, name] of NAMES) {
      const b = document.createElement('button'); b.textContent = name;
      b.style.cssText = 'padding:6px 10px;border:1px solid #c9a45c;background:rgba(30,22,14,0.82);color:#f3e2b8;border-radius:4px;cursor:pointer';
      b.onclick = (ev) => { ev.stopPropagation(); if (k === 'reset') reset(); else fire(k); };
      box.appendChild(b);
    }
    document.body.appendChild(box);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    if (params.get('zoom')) g.setZoom(Number(params.get('zoom')));
    g.updateUI(true);
    const api = { fire, target, at, dummies, last: null as WreckResult | null, reset };
    (window as Wn).__wreck = api;
    (window as Wn).__wreckReady = true;
    const demo = params.get('demo') as Demo | null;
    if (demo) window.setTimeout(() => fire(demo), 800);
    if (params.get('loop') === '1') { const order: Demo[] = at === 'coast' ? ['split', 'radial', 'line'] : ['radial', 'cone', 'line', 'crack', 'hurl']; let i = 0; window.setInterval(() => { if (i % order.length === 0) reset(); fire(order[i++ % order.length]); }, 4000); }
    g.toast(`野外破坏（${({ forest: '林子', rocks: '石头堆', coast: '海边', field: '草地' } as Record<string, string>)[at] ?? at}）：左上角的按钮各触发一次。接口只报范围里有谁，伤害和击飞由这里照清单自己打。`, 'good');
  }, 6500);
}
