// 试玩入口：/tools/perf-acceptance.html?auto=new&map=tiannan&try=jueyu&kind=sand —— 收官 B4：别界的险地。
// 全新开局，直接换到那一界（同虚空里降下去一样在游戏里换图，不重载页面），站在大陆外那一圈险地的边上（飞着）；
// 往外飞就依次进断层、核心，再往外是界壁罡风。
//   &kind=sea|sand|ice|lava|ming|miasma：沧海、瀚漠、寒渊、炎墟、幽冥、灵木（默认 sand）；kind=local：南荒的腐骨瘴泽（本界的小险地）
//   &at=edge|fog|core|abyss：站到哪一带（默认 edge＝岸外一点点）
//   &realm=2..5：境界（默认 4 元婴）；&n=序号：指定第几界（默认这种样貌里离人界最近的那一界）
//   &storm=1 身边强加一场天象（沙暴、暴雪、火雨……）；&fog=1 强加一片雾（蜃气、冰雾、灰烟、冥雾、毒瘴）；&tide=1 一阵裂隙潮（地陷、冰裂……）
//   &beast=guichi|mochu|liehai|chuanling|leiyao 身边破出一只（沙鳞鲨、流沙魔母、噬沙巨虫……）；&fall=1 灵力见底、落进介质里；&spot=1 挪到最近的安全点 / 热浪口边上
//   &zoom=0.62 镜头
import type { Game } from '../src/world/game';
import { realmAt, REALM_TOTAL } from '../src/data/zhujie';
import { KIND_MEDIUM } from '../src/world/jueyuLooks';
import { ACTIVE_MAP, WORLD_SCALE, mapSize, type MapId } from '../src/data/world';

const REALM: Record<string, number> = { zhuji: 2, jiedan: 3, yuanying: 4, huashen: 5 };
const KIND_OF: Record<string, string> = { sea: 'archipelago', sand: 'desert', ice: 'frost', lava: 'ember', ming: 'nether', miasma: 'spiritwood' };

/** 这种样貌里离人界最近的一界 */
function nearestRealm(kind: string): number {
  let best = 1, bd = Infinity;
  for (let i = 1; i <= REALM_TOTAL; i++) { const r = realmAt(i); if (r.kind !== kind) continue; const d = Math.hypot(r.x, r.y); if (d < bd) { bd = d; best = i; } if (i > 400 && bd < Infinity) break; }
  return best;
}

export function tryJueyu(g: Game, q: URLSearchParams) {
  const kind = q.get('kind') ?? 'sand', at = q.get('at') ?? 'edge';
  const rq = q.get('realm') ?? '4', realm = Math.max(1, Math.min(5, REALM[rq] ?? (Number(rq) || 4)));
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => clearInterval(closer), 9000);
  const panel = document.getElementById('perf-panel'); if (panel) panel.style.display = 'none';
  const h = g.hero; h.realm = realm; h.stage = 0; h.exp = 0; h.hp = 1; h.mp = 1;
  const p = g.player, J = g.jueyu;
  let map: MapId = ACTIVE_MAP;
  if (kind !== 'local') {
    const n = Number(q.get('n') ?? 0) || nearestRealm(KIND_OF[kind] ?? 'desert');
    map = `realm-${n}` as MapId;
    // 同虚空降界：记下去处，在游戏里换图（存档、换地形、读档），再把人放过去
    g.travel.pending = { map, x: 0, y: 0, via: 'portal' } as typeof g.travel.pending;
    g.switchMap(map);
    g.travel.pending = null;
  }
  const T = g.terrain;
  // 找险地边：从图心（腐骨瘴泽是湖心）沿十六个方向往外，找离岸距离到这一带起点的水面
  const go = () => {
    J.reset(); J.tick(0); J.F.ensure();
    const P2 = kind === 'local' ? J.zoneAt(1190 * 300, 895 * 300)!.P : J.profile!;
    const from = (id: string) => P2.bands.find((b) => b.id === id)?.from ?? 0;
    const want = at === 'core' ? from('core') + 1600 : at === 'fog' ? from('fog') + 1200 : at === 'abyss' ? P2.abyssFrom + 800 : 400;
    const pick = kind === 'local' ? J.seekDepth(want, 1190 * 300, 895 * 300, true, 26000) : J.seekDepth(want);
    g.teleport(pick.x, pick.y); p.flying = true; p.zTarget = p.z = 56; g.combat.reset(); J.reset();
    return pick;
  };
  const pick = go();
  window.setTimeout(() => {
    if (q.get('storm')) J.forceStorm(p.x + 1500, p.y - 300, 3800);
    if (q.get('fog')) J.forceFog(p.x + 700, p.y, 5200, 2300);
    if (q.get('tide')) J.forceTide(p.x, p.y, 8);
    if (q.get('fall')) h.mp = 0.002;
    if (q.get('spot')) {
      for (let k = 0; k < 4; k++) J.tick(0.05);
      const s = J.spotList.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      if (s) { g.teleport(s.x - s.r * 0.9, s.y + 40); p.flying = true; p.zTarget = p.z = 56; }
    }
    const b = q.get('beast'); if (b) window.setTimeout(() => g.seabeast.debugBreach(b as never, p.x + 420, p.y + 90), 900);
  }, 300);
  g.setZoom(Number(q.get('zoom') ?? 0.62));
  // 新开局的一串神通、传闻提示会盖住画面中间：进场后清一次，再给这一处险地的说明
  window.setTimeout(() => { const G2 = g as unknown as { toasts: unknown[]; toastListeners?: { forEach(f: (x: () => void) => void): void } }; G2.toasts = []; G2.toastListeners?.forEach((f) => f()); }, 3500);
  const P = J.profile;
  g.toast(`试玩：${P?.name ?? '险地'}（${P?.medium.name ?? ''}）。往外飞：${P?.bands.filter((x) => x.from < 1e8).map((x) => x.name).join(' → ')}。方向键飞行；法力见底会落进${P?.medium.name ?? '水'}里。`, 'good');
  (window as unknown as { __jueyu: unknown }).__jueyu = { kind, at, realm, map, x: pick.x, y: pick.y, d: pick.d, medium: KIND_MEDIUM[KIND_OF[kind] ?? ''] ?? 'local' };
}
