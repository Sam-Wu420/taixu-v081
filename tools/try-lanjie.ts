// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=lanjie —— 收官 P5「遁空途中被拦截」。
// 全新开局：元婴修为、祭着遁空梭；一位化神追兵在身后一千五百开外以神识锁定你，接着替你催动遁空梭（航向朝西）：
//   蓄势两息 → 疾行；片刻后他燃血抢到你航线前方——前方亮起红色的预警圈、一道血光、头顶冒字「前方有人截道！」，约一息后掠到那一点：
//   按方向键转向绕开（掠过时离那一点够远）就过去了；不转向就是硬闯：挨他一掌、遁空梭被迫收势，他就在身边。
//   一趟走完（收势或绕开后飞够几息）会替你再来一趟（共三趟），冷却替你清掉。
// 截图脚本用 window.__dk（就是 game.dunkong）和 window.__dkReady。
import type { Game } from '../src/world/game';

type W = Window & { __dk?: Game['dunkong']; __dkReady?: boolean; __dkGo?: () => void };

export function tryLanjie(g: Game) {
  window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    const h = g.hero, p = g.player, dk = g.dunkong;
    h.realm = 4; h.stage = 0; h.hp = 1; h.mp = 1;
    (h.equip ??= {} as typeof h.equip).flight = 'art_dunkongsuo';
    g.revealAll = true;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    g.combat.enemies.length = 0;
    const home = { x: p.x, y: p.y };
    let trips = 0;
    const go = () => {
      if (dk.active) return;
      h.hp = 1; h.mp = 1; dk.cooldown = 0;
      g.teleport(home.x, home.y);
      if (!p.flying) g.toggleFly();
      // 化神追兵在身后（东边）一千五百开外；试玩里他下手留了分寸
      if (!g.pursuit.cur && g.pursuit.start({ reason: '试玩', gap: 1, force: true, faction: 'guiling' }) && g.pursuit.cur) g.pursuit.cur.e.atk *= 0.3;
      const P = g.pursuit.cur;
      if (P) { P.lost = false; P.e.x = p.x + 1500; P.e.y = p.y; P.e.hx = P.e.x; P.e.hy = P.e.y; P.e.trailReset = true; delete P.e.st.stun; delete P.e.st.freeze; delete P.e.st.root; P.safeT = 0; }
      g.combat.enemies = g.combat.enemies.filter((e) => e === P?.e);
      g.destination = null; p.facing = -1; g.travel.dir.x = -1; g.travel.dir.y = 0;
      trips++;
      dk.start();
    };
    (window as W).__dk = dk; (window as W).__dkGo = go; (window as W).__dkReady = true;
    g.toast('化神追兵锁住了你——替你催动遁空梭（朝西）。疾行后前方亮起红圈就转向绕开，不转就是硬闯。', 'warn');
    window.setTimeout(go, 1200);
    let idleT = 0;
    const loop = window.setInterval(() => {
      if (dk.cruising && !dk.ambush && dk.t > 4) dk.retract('试玩：这一趟到此收势。', 'info');
      if (dk.active) { idleT = 0; return; }
      idleT += 0.5;
      if (idleT >= 3 && trips < 3) { idleT = 0; go(); }
      if (trips >= 3 && idleT >= 3) clearInterval(loop);
    }, 500);
  }, 6500);
  g.toast('稍等片刻：替你摆好追兵、催动遁空梭。', 'good');
}
