// 试玩入口：?auto=new&map=tiannan&try=indoor&kind=inn|tavern|shop|hall —— 站到那类建筑的门口、面朝里（自己走进去，屋顶就淡出）。
//   &in=1 直接站在屋里（掌柜跟前）；&fac=pill|artifact|talisman|market 挑哪一种铺子（kind=shop 时）；
//   &city=yuejing|jiayuan|… 挑哪座城（缺省梁京；hall 缺省青霞谷）；&night=1 入夜；&zoom=0.9 镜头远近；&n=0 同类的第几间；&rot=0..3 只挑门朝某向的（2 = 门朝北）。
// 收官 P8（丁）。perf-acceptance.ts 的 try 分发处调 tryIndoor(game, params)。
import type { Game } from '../src/world/game';
import { LOC_BY_ID } from '../src/data/world';
import { roomsOf, toWorld, clearRoomCache, type Room } from '../src/world/indoor';
import { getLayout } from '../src/gfx/building';
import { DAY_CYCLE } from '../src/world/game';

export function pickRoom(kind: string, params: URLSearchParams): Room | null {
  const loc = LOC_BY_ID.get(params.get('city') ?? (kind === 'hall' ? 'huangfeng' : 'yuejing'));
  if (!loc) return null;
  const fac = params.get('fac') ?? (kind === 'shop' ? 'pill' : '');
  const rot = params.get('rot');   // 第六轮返工：&rot=2 挑门朝北的（镜头那一侧是后宅）
  // 三张图眼下开张的铺子里恰好没有门朝北的（城里挑开店的铺面时没轮到）：试玩页里把这座城一间门朝北的铺面临时开成店（只在试玩页，查后宅淡出用）
  if (rot !== null && kind === 'shop' && !roomsOf(loc).some((r) => r.rot === Number(rot) && r.kind === 'shop')) {
    const L = getLayout(loc), pc = L.pieces.find((q) => q.kind === 'cshop' && ((((q.p as { r?: number }).r ?? 0) & 3) === Number(rot)) && !(q.p as { fn?: string }).fn);
    if (pc) { Object.assign(pc.p, { fn: fac || 'pill', name: '试开的铺子', two: 1 }); clearRoomCache(L); }
  }
  const list = roomsOf(loc).filter((r) => r.kind === kind && (!fac || r.fac === fac) && (rot === null || r.rot === Number(rot)));
  // 门朝南（朝镜头）的排前面：缺省镜头下看得最清楚
  list.sort((a, b) => (a.rot === 0 ? 0 : 1) - (b.rot === 0 ? 0 : 1));
  return list[Number(params.get('n') ?? 0)] ?? list[0] ?? null;
}

export function tryIndoor(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    window.clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const kind = params.get('kind') ?? 'inn';
    const r = pickRoom(kind, params);
    if (!r) { g.toast(`找不到能进的${kind}`, 'warn'); return; }
    g.hero.realm = Math.max(g.hero.realm, 2);
    if (params.get('night') === '1') g.clock = Math.ceil(g.clock / DAY_CYCLE) * DAY_CYCLE + DAY_CYCLE * 0.04;
    else g.clock = Math.ceil(g.clock / DAY_CYCLE) * DAY_CYCLE + DAY_CYCLE * 0.42;
    const P = g.indoor.plan(r);
    const inside = params.get('in') === '1';
    const [x, y] = inside ? toWorld(r, P.front.x, P.front.z) : toWorld(r, 0, r.plat + r.ramp + 70);
    g.teleport(x, y);
    // 面朝门里
    const [ix, iy] = toWorld(r, 0, -r.D / 2);
    g.player.st.faceToward(ix - x, iy - y); g.player.st.yaw = g.player.st.targetYaw;
    g.setZoom(Number(params.get('zoom') ?? (kind === 'hall' ? 0.7 : 0.95)));
    g.cam.zoom = g.cam.targetZoom;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    const w = window as unknown as { __indoor?: unknown; __indoorReady?: boolean };
    w.__indoor = { room: r, plan: P, door: toWorld(r, 0, 20), front: toWorld(r, P.front.x, P.front.z), out: toWorld(r, 0, r.plat + r.ramp + 70) };
    w.__indoorReady = true;
    g.toast(inside ? `在「${r.loc.name}·${r.name}」里。走到掌柜跟前按交谈键，开原来的面板。` : `「${r.loc.name}·${r.name}」门口：往里走，屋顶会淡出。`, 'good');
  }, 6500);
}
