// 试玩入口：?auto=new&map=tiannan&try=huajuan —— 站在青霞谷藏经阁那层台上那幅画（溪山行旅）前，面朝画。
//   往前走过地上那道淡墨线，再往里走，画就铺满屏幕——走进画中洞天；画里入口那座古阵是「画外之门」。
//   &in=1 直接在画里；&home=1|2|3 在青霞谷附近一处灵脉上开洞府、门前挂一到三幅古画，人站在洞府门前往南一点、看着这几幅画（第六轮返工：查古画的落点）。
// 收官 P8（丁）。perf-acceptance.ts 的 try 分发处调 tryHuajuan(game, params)。
import type { Game } from '../src/world/game';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
import { LINE } from '../src/world/huajuan';
import { SITE_CELL } from '../src/world/sites';

export function tryHuajuan(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    window.clearInterval(closer);
    if (g.modal) g.closeModal(true);
    g.hero.realm = Math.max(g.hero.realm, 2);
    const hf = LOC_BY_ID.get('huangfeng')!;
    const nHome = Number(params.get('home') ?? 0);
    if (nHome > 0) { tryHome(g, hf.x * WORLD_SCALE, hf.y * WORLD_SCALE, Math.min(3, nHome), params); return; }
    g.teleport(hf.x * WORLD_SCALE, hf.y * WORLD_SCALE);
    g.space.update(1, g.player.x, g.player.y);
    const go = () => {
      const s = g.huajuan.scrolls()[0];
      if (!s) { window.setTimeout(go, 300); return; }
      g.teleport(s.x, s.y + LINE + 110);
      g.player.st.faceToward(0, -1); g.player.st.yaw = g.player.st.targetYaw;
      g.setZoom(Number(params.get('zoom') ?? 0.95)); g.cam.zoom = g.cam.targetZoom;
      if (params.get('in') === '1') g.huajuan.enter(s, false);
      document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
      const w = window as unknown as { __hj?: unknown; __hjReady?: boolean };
      w.__hj = { s }; w.__hjReady = true;
      g.toast(`「${s.name}」：往前走过地上那道墨线，走进画里。`, 'good');
    };
    window.setTimeout(go, 600);
  }, 6500);
}

/** 第六轮返工：在 (x0, y0) 附近找一处灵脉开洞府、门前挂 n 幅古画，人站在门前往南看着它们 */
function tryHome(g: Game, x0: number, y0: number, n: number, params: URLSearchParams) {
  const S = g.sites as unknown as { gen(cx: number, cy: number): { kind: string; x: number; y: number } | null };
  const c0x = Math.floor(x0 / SITE_CELL), c0y = Math.floor(y0 / SITE_CELL);
  let site: { kind: string; x: number; y: number } | null = null;
  // 挑一处门前平坦的灵脉（山坡上的灵脉门前本来就没有空地，查不出落点的好坏）
  const T = g.terrain, flat = (x: number, y: number) => { for (let dy = -200; dy <= 600; dy += 100) for (let dx = -600; dx <= 900; dx += 150) if (!T.surface.sample(x + dx, y + dy).walkable || T.walkFactor(x + dx, y + dy) <= 0) return false; return true; };
  for (let r = 2; r < 30 && !site; r++) for (let j = -r; j <= r && !site; j++) for (let i = -r; i <= r && !site; i++) { if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue; const q = S.gen(c0x + i, c0y + j); if (q?.kind === 'vein' && flat(q.x, q.y)) site = q; }
  if (!site) { g.toast('附近找不到灵脉', 'warn'); return; }
  g.teleport(site.x, site.y + 300);
  g.home.create(site as never);
  if (g.modal) g.closeModal(true);
  const f = g.ws.flags as { hjHome?: number[] };
  f.hjHome = [7, 8, 9].slice(0, n);
  const go = () => {
    const sc = g.huajuan.scrolls().filter((q) => q.id.startsWith('home-'));
    const h = g.ws.home!;
    const xs = [h.x, ...sc.map((q) => q.x)], cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    g.teleport(cx, h.y + 520);
    g.player.st.faceToward(0, -1); g.player.st.yaw = g.player.st.targetYaw;
    g.setZoom(Number(params.get('zoom') ?? 0.62)); g.cam.zoom = g.cam.targetZoom;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    const w = window as unknown as { __hj?: unknown; __hjReady?: boolean };
    w.__hj = { home: { x: h.x, y: h.y }, scrolls: sc.map((q) => ({ id: q.id, x: q.x, y: q.y })) }; w.__hjReady = true;
  };
  window.setTimeout(go, 1500);
}
