// 试玩入口：?auto=new&map=tiannan&try=stall —— 全新开局，直接站到梁京城的集市里，周围几位摆着摊的人（头顶招牌，点一下开个人摊位），
// 摊主身上有钱（可以把东西卖给他们）；你身上给些灵石和几件能卖的东西。加 &open=1 直接打开最近那位的摊位窗口。
// 收官 D（甲）。perf-acceptance.ts 的 try 分发处调 tryStall(game, params)。
import type { Game } from '../src/world/game';
import * as C from '../src/world/cultivation';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';

export function tryStall(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    window.clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const loc = LOC_BY_ID.get(params.get('city') ?? 'yuejing') ?? LOC_BY_ID.get('yuejing')!;
    const S = g.stall, h = g.hero;
    h.realm = Math.max(h.realm, 2); h.stage = 0;
    // 今天这里自己来摆摊的人不够六位，就再请几位附近的散修来（只在试玩入口这么做）
    for (const d of g.npcs.list) {
      if (S.keepersAt(loc).size >= 7) break;
      if (d.alive && d.realm >= 1 && !d.canon && !d.beauty && !d.ros && !d.gz && (d.faction === 'rogue' || d.faction === 'merchant') && (d.map ?? 'tiannan') === loc.map) S.invite(d, loc);
    }
    const keep = [...S.keepersAt(loc).entries()];
    for (const [id] of keep) { const d = g.npcs.byId.get(id)!; d.wealth = Math.max(d.wealth, 3000 + (d.seed % 5) * 1500); }
    // 站到摊位最密的那一片：取离所有摊位中心最近的那个摊位，站在它南边的过道上
    const cx = keep.reduce((a, [, s]) => a + s.x, 0) / Math.max(1, keep.length), cy = keep.reduce((a, [, s]) => a + s.y, 0) / Math.max(1, keep.length);
    const near = keep.map(([, s]) => s).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0] ?? { x: loc.x * WORLD_SCALE, y: loc.y * WORLD_SCALE };
    g.teleport(near.x + 60, near.y + 230);
    const ls = C.itemListeners.splice(0);
    C.addItem(h, 'mat_lingshi', 30000);
    for (const [id, n] of [['herb_lingzhi', 5], ['pill_juling', 4], ['tal_fire', 6], ['mat_yaodan3', 2], ['gear_ring_1', 1], ['gear_crown_2', 1]] as [string, number][]) C.addItem(h, id, n);
    C.itemListeners.push(...ls);
    g.updateUI(true);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    // 人一到，今天的摊主都已坐好（平时人在眼前的摊主是自己走过去的）
    for (const t of [800, 1600, 2400]) window.setTimeout(() => S.settle(), t);
    if (params.get('open') === '1') window.setTimeout(() => { const id = keep.map(([k, s]) => [k, Math.hypot(s.x - g.player.x, s.y - g.player.y)] as const).sort((a, b) => a[1] - b[1])[0]?.[0]; const d = id ? g.npcs.byId.get(id) : null; if (d) S.open(d); }, 2500);
    (window as unknown as { __stallReady?: boolean }).__stallReady = true;
  }, 6500);
}
