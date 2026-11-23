// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=nuoyi[&chase=0][&kind=array|ancient|talisman|rift|edge] —— 收官 P5 虚空挪移。
// 全新开局：筑基修为，一位结丹追兵（玄煞宗）在一千五百开外以神识锁定你，接着替你发动一次城镇传送阵——
//   开阵：脚下阵纹逐圈点亮、光柱升起；进甬道后追兵跟着闯进来，从身后往你身上掷飞剑：
//   落点先亮一圈红光（连一道来向的细光），看见就用方向键左右上下挪开，或按住 Shift（手机「疾行」）往前蹿、松开落回——躲开了剑擦身飞进深处；
//   躲不开就挨一下、身形一滞，追兵逼得更近。出阵后追兵在身边破空而出。
//   chase=0：没有追兵的一趟（对照：甬道里什么都不多出来）。一趟走完三息后自动再来一趟（共三趟）。
// 截图脚本用 window.__ny（就是 game.nuoyi）和 window.__nyReady。
import type { Game } from '../src/world/game';
import type { NuoyiKind } from '../src/world/nuoyi';

type W = Window & { __ny?: Game['nuoyi']; __nyReady?: boolean; __nyGo?: () => void };

export function tryNuoyi(g: Game, params: URLSearchParams) {
  const chase = params.get('chase') !== '0';
  const kind = (params.get('kind') ?? 'array') as NuoyiKind;
  // 开场对话、教程提示都替你关掉（挡着画面）
  window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    const h = g.hero, p = g.player;
    h.realm = 2; h.stage = 1; h.hp = 1; h.mp = 1;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    g.combat.enemies.length = 0;
    // 去处：往西两万多的一块能站的地（城镇传送阵的落点办法：往南找到能走的地为止）
    const home = { x: p.x, y: p.y };
    let tx = home.x - 24000, ty = home.y;
    for (let r = 0; r < 6000 && g.terrain.walkFactor(tx, ty) <= 0; r += 60) ty += 60;
    let trips = 0;
    const go = () => {
      if (g.nuoyi.active) return;
      h.hp = 1; h.mp = 1;
      const back = trips % 2 === 1, at = back ? { x: tx, y: ty } : home, dest = back ? home : { x: tx, y: ty };
      if (Math.hypot(p.x - at.x, p.y - at.y) > 50) g.teleport(at.x, at.y);
      if (chase) {
        // 结丹追兵锁着你、一千五百开外（逼到一千以内会把甬道截断，这里要看的是跟进甬道掷飞剑）
        // 试玩：他下手留了分寸（只看甬道里躲飞剑，不至于两三下把你打死）
        if (!g.pursuit.cur && g.pursuit.start({ reason: '试玩', gap: 1, force: true, faction: 'tiansha' }) && g.pursuit.cur) g.pursuit.cur.e.atk *= 0.3;
        const P = g.pursuit.cur;
        if (P) { P.lost = false; P.e.x = p.x + 1500; P.e.y = p.y; P.e.hx = P.e.x; P.e.hy = P.e.y; P.e.trailReset = true; delete P.e.st.stun; delete P.e.st.freeze; delete P.e.st.root; }
      }
      trips++;
      g.nuoyi.start({ kind, to: dest, arrive: () => { g.teleport(dest.x, dest.y); g.toast(`传送阵：到了。${chase ? '' : '（没被追杀的一趟）'}`, 'info'); } });
    };
    (window as W).__ny = g.nuoyi; (window as W).__nyGo = go; (window as W).__nyReady = true;
    g.toast(chase ? '结丹追兵锁住了你——替你发动传送阵。甬道里看见红圈就挪开（方向键），或按住 Shift 往前蹿。' : '替你发动传送阵（没有追兵）。', 'warn');
    window.setTimeout(go, 1200);
    // 一趟走完三息后再来一趟（共三趟）
    let idleT = 0;
    const loop = window.setInterval(() => {
      if (g.nuoyi.active) { idleT = 0; return; }
      idleT += 0.5;
      if (idleT >= 3 && trips < 3) { idleT = 0; go(); }
      if (trips >= 3 && idleT >= 3) clearInterval(loop);
    }, 500);
  }, 6500);
  g.toast('稍等片刻：替你摆好追兵、发动传送阵。', 'good');
}
