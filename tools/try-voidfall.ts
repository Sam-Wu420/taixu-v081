// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=voidfall[&to=sea|land][&rev=1] —— 收官 E3「虚空一拳打进世界」。
// 全新开局：元婴，替你升出界外到巡航高度，挪到南荒某处的正上方（to=land：陆地；to=sea：海面），一个罡气已破的魔修在你面前。
//   · 默认：按住 PageDown 再按右键崩山（或技能栏「崩山」时按住下降），把他一拳砸下去——他成了流星坠向下界；
//     按空格（架势里的追击）俯冲追下去，落进界内后他嵌在坑里 / 沉在海里，接着打。按住 PageUp 就作罢。
//   · rev=1：反过来——一个体修魔头把你一拳砸下去；下坠途中按空格脱困，不按就一路砸进界内。
// 截图脚本用 window.__vf（对手、落点）和 window.__vfReady。
import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import { HOME, landing, pointToVoid } from '../src/data/zhujie';
import { ACTIVE_MAP } from '../src/data/world';
import { bindOf, keyLabel } from '../src/core/keymap';

type W = Window & { __vfReady?: boolean; __vf?: { e: Enemy; to: { x: number; y: number }; sea: boolean; rev: boolean } };

/** 在当前这张图上找一处落点：陆地（开阔、能走、不在城镇里）或深海（周围一大片都是海），离 (x0, y0) 越近越好 */
export function findDrop(g: Game, sea: boolean, x0: number, y0: number): { x: number; y: number } | null {
  const T = g.terrain;
  const ok = (x: number, y: number) => {
    if (sea) { for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (T.isLand(x + i * 700, y + j * 700)) return false; return true; }
    if (T.inLocZone(x, y, 2600)) return false;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const px = x + i * 300, py = y + j * 260; if (!T.isLand(px, py) || T.walkFactor(px, py) <= 0 || g.space.blocked(px, py)) return false; }
    return true;
  };
  for (let r = 0; r <= 260000; r += 2500) {
    const n = Math.max(1, Math.round(r / 2000));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
      if (!ok(x, y)) continue;
      // 从这一点的正上方降下来，确实落在这张图的这一点（不被挪到别处去）
      const v = pointToVoid(ACTIVE_MAP, x, y), L = landing(HOME, v.x, v.y);
      if (L && L.map === ACTIVE_MAP && Math.hypot(L.x - x, L.y - y) < 50) return { x, y };
    }
  }
  return null;
}

export function tryVoidfall(g: Game, params: URLSearchParams) {
  const sea = params.get('to') === 'sea', rev = params.get('rev') === '1';
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer); if (g.modal) g.closeModal(true);
    const h = g.hero, B = g.combat.brawl, p = g.player, xk = g.xukong;
    h.realm = 4; h.stage = 2; h.hp = 1; h.mp = 1;
    B.learn(true);
    ['bx_qishen', 'bx_lianquan', 'bx_bengshan', 'bx_suodi'].forEach((id, i) => { h.hotbar[i] = id; });
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    const to = findDrop(g, sea, p.x, p.y);
    if (!to) { g.toast('附近找不到合适的落点。', 'warn'); return; }
    // 先挪到落点的正上方再起飞升出界外（升出去时虚空里的位置就是这一点的正上方）
    g.teleport(to.x, to.y + (sea ? 0 : 0));
    g.combat.enemies.length = 0;
    if (!p.flying) g.toggleFly();
    window.setTimeout(() => {
      xk.leave(); g.input.keys.add('ascend');
      const up = window.setInterval(() => {
        if (g.modal) g.closeModal(true);
        if (xk.phase === 'none' || xk.lift < 0.999) return;
        g.input.keys.delete('ascend'); clearInterval(up);
        stage(g, to, sea, rev);
      }, 200);
    }, 900);
  }, 6500);
  g.toast('稍等片刻：替你升出界外、摆好对手。', 'good');
}

/** 到了巡航高度：摆一个对手进斗法，等镜头拉近后把他摆到你面前 */
function stage(g: Game, to: { x: number; y: number }, sea: boolean, rev: boolean) {
  const B = g.combat.brawl, xk = g.xukong, F = xk.fight, p = g.player;
  const v = pointToVoid(ACTIVE_MAP, to.x, to.y);
  xk.x = v.x; xk.y = v.y; xk.vx = xk.vy = 0;
  // 对手：体修魔修（会近战）。先刷进界内的名单再交给斗法（斗法会把界内的敌人收起来）
  const e = B.spawnBrawler(p.x, p.y, rev ? 5 : 4, 1);
  g.combat.enemies = g.combat.enemies.filter((q) => q !== e);
  e.name = rev ? '裂空魔尊' : '铁拳魔修'; e.maxHp = e.hp = e.maxHp * (rev ? 6 : 4);
  if (rev) e.boss = true;
  window.setTimeout(() => {
    xk.over = HOME;
    F.engage({ id: 'try-voidfall', name: e.name, x: xk.x + 5, y: xk.y, tier: e.realm, enemy: e });
    const wait = window.setInterval(() => {
      if (!F.handed) return;
      clearInterval(wait);
      e.x = p.x + 120; e.y = p.y + 6; e.flyH = p.z; e.hx = e.x; e.hy = e.y;
      g.combat.lock = e; g.combat.manual = true;
      if (!B.stance) B.toggleStance();
      const b = B.body(e);
      if (rev) {
        // 他扑上来一套「两拳一记重击」，你的罡气已经见底：重击落下就把你砸下去
        // 试玩：他下手留了分寸（只看坠界，不至于一套把你打死）；你的罡气已破，他贴上来一记重击
        e.atk *= 0.25; B.pb.poise = 0; B.pb.breakT = 4; g.hero.hp = 1; g.hero.mp = 1;
        e.x = p.x + 70;
        const ai = b.ai!; ai.pat = 'h'; ai.i = 0; ai.st = 'combo'; ai.t = 0.2; ai.cd = 0; ai.tg = null;
        g.toast(`${e.name}要把你砸下界去！被砸下去后按 ${keyLabel(bindOf('dodge'))}（手机「脱」）脱困，不按就一路砸进界内。`, 'warn');
      } else {
        // 罡气已破、一时不还手：等你往下砸
        b.poise = 0; b.breakT = 999; e.speed = 0; e.def = { ...e.def, melee: undefined, ranged: undefined }; e.kit = []; e.skT = 1e9;
        if (b.ai) b.ai.cd = 1e9;
        g.toast(`${e.name}罡气已破！按住 ${keyLabel(bindOf('descend'))} 再按右键崩山（或技能栏「崩山」），把他砸下${sea ? '海' : '地'}去；砸下去后按 ${keyLabel(bindOf('dodge'))} 俯冲追击。`, 'good');
      }
      (window as W).__vf = { e, to, sea, rev };
      (window as W).__vfReady = true;
    }, 100);
  }, 300);
}
