// r11-lock 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=lock[&at=foe|neutral|tree|off|boss|fly]
// 全新开局：结丹，找一片开阔平地，摆几个不动、不出手的对手，手动锁上其中一位（截图、看锁定标记和大血条用）：
//   foe      敌对的火狼（朱红），旁边一头没交手的狼（中立）
//   neutral  锁那头没交手的（金色）
//   tree     敌对的火狼前面（朝镜头一侧）摆两棵树挡着（看透视层）
//   off      锁一个在画面外的（拉近镜头），屏幕边缘出箭头
//   boss     一位八级以上的首领在打，同时锁一只普通的狼（两条血条上下排）；&lockboss=1 改锁首领
//   fly      锁一个御剑悬在高处的剑修（锁定环跟着高度走）
// 页面上 window.__lock = { game, foe, other, boss }，就绪后 window.__lockReady = true。
import type { Game } from '../src/world/game';
import { Enemy } from '../src/world/combat';
import { ENEMIES } from '../src/data/enemies';
import { cultivator } from '../src/world/melee';
import { openField } from './try-brawl';

type W = Window & { __lockReady?: boolean; __lock?: Record<string, unknown> };

export function tryLock(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const h = g.hero, at = params.get('at') ?? 'foe', c = g.combat;
    h.realm = 3; h.stage = 1; h.hp = 1; h.mp = 1;
    const f = openField(g); if (f) g.teleport(f.x, f.y);
    c.enemies.length = 0; (c as unknown as { spawnT: number }).spawnT = 1e9;
    const p = g.player;
    const calm = (e: Enemy) => { e.speed = 0; e.def = { ...e.def, melee: undefined, ranged: undefined }; e.kit = []; e.skT = 1e9; return e; };
    const wolfD = ENEMIES.redwolf ?? ENEMIES.wolf;
    const mk = (dx: number, dy: number, aggro: boolean, realm = 2) => { const e = calm(new Enemy(wolfD, p.x + dx, p.y + dy, realm, 1)); e.aggro = aggro; e.maxHp = e.hp = e.maxHp * 6; c.enemies.push(e); return e; };
    let foe = mk(360, -150, true), other = mk(-380, 60, false), boss: Enemy | null = null, lockOn: Enemy = foe;
    if (at === 'neutral') lockOn = other;
    if (at === 'neutral') { (other as unknown as { noP: boolean }).noP = true; other.aggro = false; }   // 中立的那头：不冲你来（noP：只有手动锁上才打得到）
    if (at === 'tree') {
      foe.x = p.x + 120; foe.y = p.y - 330;
      const B = c.brawl; B.brk.reset(); B.brk.manual = true;
      B.brk.place('tree', foe.x - 20, foe.y + 70, 1.1, 0); B.brk.place('tree', foe.x + 50, foe.y + 110, 1.0, 1);
    }
    if (at === 'off') { foe.x = p.x + Math.min(g.senseRadius * 0.85, 1500); foe.y = p.y + 260; g.setZoom(1.25); }
    if (at === 'boss') {
      const bd = ENEMIES.yinchi ?? ENEMIES.shiqin;
      boss = calm(new Enemy(bd, p.x - 120, p.y - 380, 5, 2)); boss.blv = Math.max(8, boss.blv); boss.aggro = true; c.enemies.push(boss);
      boss.hp = boss.maxHp * 0.72;
      if (params.get('lockboss') === '1') lockOn = boss;
    }
    if (at === 'fly') {
      const sw = calm(cultivator(p.x + 300, p.y - 200, 3, 1, 'huangfeng', '青霞谷剑修')); sw.aggro = true; sw.flyH = 160; c.enemies.push(sw); foe = sw; lockOn = sw;
      const keepUp = window.setInterval(() => { sw.flyH = 160; if (!g.running || sw.dead) clearInterval(keepUp); }, 50);   // 一直悬在高处（演示用）
    }
    foe.hp = foe.maxHp * 0.64;
    if (at !== 'off') g.setZoom(0.85);
    c.lock = lockOn; c.manual = true;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    g.updateUI(true);
    (window as W).__lock = { game: g, foe, other, boss };
    (window as W).__lockReady = true;
  }, 6500);
}
