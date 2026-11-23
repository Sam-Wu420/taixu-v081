// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=gfx —— 光影（P2）与画面遗留（P3 / P4 / P10）的取景台。
// 同一地点、同一时辰能反复拍：改前改后对比用。
//   &at=huangfeng（默认，新开局的山门广场）| yuejing（梁京城中）| field（梁京城外的野地）| peak（附近最高的山脚下）| island（岛城，沧溟海要配 map=luanxing）
//   &hour=dawn | noon | dusk | night（定住时辰：每 0.1 秒把钟拨回去）
//   &shield=1  身侧祭出玄铁飞天盾；&at=smoke 站到最近一缕炊烟跟前
//   &zoom=0.6  镜头缩放；&yaw=0.4 方位角（弧度）；&reveal=1 全图已探（远景不被未探索的纸色盖住）
//   &fight=1   身边放一圈妖兽，每 0.7 息放一记法术（看法术照亮周围）
//   &drops=1   脚边撒几件不同品阶的掉落；&fly=1 御剑起飞；&zhen=1 身边布两座阵（看阵法光墙）
// 页面上留 window.__gfx：hour('night')、at('yuejing')、zoom(0.3)、cast() 供截图脚本换景。
import type { Game } from '../src/world/game';
import { DAY_CYCLE } from '../src/world/game';
import { Enemy } from '../src/world/combat';
import { ENEMIES } from '../src/data/enemies';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';
import { ITEM_LIST } from '../src/data/items';
import * as C from '../src/world/cultivation';
import { prof } from '../src/core/prof';

const HOURS: Record<string, number> = { dawn: 0.262, morning: 0.32, noon: 0.5, afternoon: 0.62, dusk: 0.738, night: 0.95, midnight: 0.02 };
type W = Window & { __gfx?: Record<string, unknown>; __gfxReady?: boolean };

function field(g: Game): { x: number; y: number } {
  const city = LOC_BY_ID.get('yuejing')!, x0 = city.x * WORLD_SCALE, y0 = city.y * WORLD_SCALE, T = g.terrain;
  for (let r = 9000; r <= 20000; r += 1000) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8 + 0.3, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
    if (g.combat.safeAt(x, y) || T.inLocZone(x, y, 1800)) continue;
    let ok = true;
    for (let j = 0; j < 8 && ok; j++) if (T.walkFactor(x + Math.cos(j * Math.PI / 4) * 500, y + Math.sin(j * Math.PI / 4) * 320) <= 0 || !T.isLand(x + Math.cos(j * Math.PI / 4) * 500, y + Math.sin(j * Math.PI / 4) * 320)) ok = false;
    if (ok) return { x, y };
  }
  return { x: x0, y: y0 + 9000 };
}
/** 附近最高的山：在出生点周围粗搜最高点，再退到它南边山脚一处站得住的地方，镜头朝北仰望 */
let peakYaw = 0;
function peak(g: Game): { x: number; y: number } {
  const T = g.terrain, p = g.player;
  let best = { x: p.x, y: p.y, h: -1 };
  for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) {
    const x = p.x + i * 1200, y = p.y + j * 1200, h = T.surfaceHeight(x, y);
    if (h > best.h) best = { x, y, h };
  }
  // 返工：原来要求山脚低于峰顶的三成五，青霞谷一带整片都高，永远找不到、落回原地。改成「比峰顶低三千以上、站得住」，
  // 先找南边（镜头默认朝北，正好仰望），再找东南、西南、东、西；镜头方位转到正对着山
  for (let d = 2000; d <= 24000; d += 500) for (const [ux, uy] of [[0, 1], [0.7, 0.7], [-0.7, 0.7], [1, 0], [-1, 0]]) {
    const x = best.x + ux * d, y = best.y + uy * d;
    if (T.surfaceHeight(x, y) < best.h - 3000 && T.walkFactor(x, y) > 0 && T.isLand(x, y) && !g.combat.safeAt(x, y)) { peakYaw = Math.atan2(best.x - x, -(best.y - y)); return { x, y }; }
  }
  return { x: best.x, y: best.y + 8000 };
}

export function tryGfx(g: Game, params: URLSearchParams): void {
  const w = window as W;
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  let hold: number | null = null, castT = 0;
  const api = {
    hour(name: string | number) {
      const ph = typeof name === 'number' ? name : HOURS[name] ?? 0.5;
      if (hold) clearInterval(hold);
      const set = () => { g.clock = (Math.floor(g.clock / DAY_CYCLE) + ph) * DAY_CYCLE; };
      set(); hold = window.setInterval(set, 100);
    },
    at(name: string) {
      const p = g.player;
      if (name === 'yuejing') { const c = LOC_BY_ID.get('yuejing')!; g.teleport(c.x * WORLD_SCALE + 900, c.y * WORLD_SCALE + 2600); }
      else if (name === 'field') { const f = field(g); g.teleport(f.x, f.y); }
      else if (name === 'peak') { const f = peak(g); g.teleport(f.x, f.y); g.camYaw = g.camYawTarget = peakYaw; }
      else if (name === 'fall') {
        // 最近的瀑布（第 n 个，&n=）：站到瀑布脚下南边一点，镜头朝北看
        const T = g.terrain, R = 60000, fs = T.allFallsIn(p.x - R, p.y - R, p.x + R, p.y + R).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
        const f = fs[Number(params.get('n') ?? 0)] ?? fs[0];
        if (f) { g.teleport(f.x, f.y + 700); (w as unknown as { __fall?: unknown }).__fall = { x: f.x, y: f.y, n: fs.length }; }
      }
      else if (name === 'smoke') {
        // 最近一处有炊烟的地点：站到第一缕炊烟南边一点（看炊烟立板）
        const R = g.renderer as unknown as { layout(l: unknown): { smoke: { x: number; y: number }[] } };
        let best: { x: number; y: number } | null = null, bd = Infinity;
        for (const l of LOC_BY_ID.values()) { if (l.type !== 'village' && l.type !== 'town') continue; if (Math.hypot(l.x * WORLD_SCALE - p.x, l.y * WORLD_SCALE - p.y) > 60000) continue; const L = R.layout(l); if (!L.smoke?.length) continue; const x = l.x * WORLD_SCALE + L.smoke[0].x * 1.5, y = l.y * WORLD_SCALE + L.smoke[0].y * 1.5, d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = { x, y }; } }
        if (best) g.teleport(best.x + 60, best.y + 250);
      }
      else if (name === 'island') { const c = LOC_BY_ID.get(params.get('loc') ?? 'tianxing') ?? LOC_BY_ID.get('tianxing'); if (c) g.teleport(c.x * WORLD_SCALE, c.y * WORLD_SCALE); }
      else if (name === 'huangfeng' && w.__gfx?.home) { const h = w.__gfx.home as { x: number; y: number }; g.teleport(h.x, h.y); }
      else if (LOC_BY_ID.get(name)) { const c = LOC_BY_ID.get(name)!; g.teleport(c.x * WORLD_SCALE, c.y * WORLD_SCALE); }
      // 落点要是在墙里、房子里（取景点是按城中心估的），就近找一处站得住的街面
      if (name !== 'huangfeng') {
        const T = g.terrain, ok = (x: number, y: number) => { g.space.update(1, x, y); return !g.space.blocked(x, y) && T.walkFactor(x, y) > 0; };
        if (!ok(p.x, p.y)) outer: for (let r = 150; r < 4000; r += 150) for (let k = 0; k < 16; k++) { const x = p.x + Math.cos(k * Math.PI / 8) * r, y = p.y + Math.sin(k * Math.PI / 8) * r; if (ok(x, y)) { g.teleport(x, y); break outer; } }
      }
      g.cam.x = p.x; g.cam.y = p.y;
    },
    zoom(z: number) { g.setZoom(z); },
    /** 身边一圈妖兽（不还手），供法术打 */
    foes(n = 8) {
      const p = g.player;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const e = new Enemy(ENEMIES[i % 2 ? 'redwolf' : 'wolf'], p.x + Math.cos(a) * 360, p.y + Math.sin(a) * 240, 1, 0); e.aggro = false; g.combat.enemies.push(e); }
    },
    cast(id?: string) {
      const ids = ['huodan', 'bingzhui', 'huoshe', 'fengren'];
      for (const k of ids) if (!g.hero.arts.some((a) => a.id === k)) g.hero.arts.push({ id: k, xp: 0 });
      g.combat.cast(id ?? ids[castT++ % ids.length]);
    },
    /** 身前一排掉落：每个品阶各一件（看光柱按品阶上色） */
    drops() {
      const p = g.player;
      for (let tier = 0; tier <= 6; tier++) {
        const d = ITEM_LIST.find((it) => it.tier === tier && it.type !== 'misc');
        if (d) g.combat.loot.push({ x: p.x - 420 + tier * 140, y: p.y + 160, id: d.id, n: 1, t: 1 });
      }
    },
    /** 身边布两座阵：右边玄武护阵（罩子）、左边一座杀阵（看光墙） */
    zhen() { const p = g.player; g.zhenfa.allyDeploy('xuanwu', p.x + 520, p.y - 60, 3, 10, '试阵'); g.zhenfa.allyDeploy(params.get('zhenid') ?? 'gengjin', p.x - 560, p.y + 40, 3, 10, '试阵'); },
    home: { x: g.player.x, y: g.player.y },
  };
  w.__gfx = api;
  (window as unknown as { __prof: typeof prof }).__prof = prof;   // 截图脚本里看长帧归因（prof.spikes）
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const h = g.hero; h.realm = Math.max(h.realm, 3); h.stage = 0; h.hp = 1; h.mp = 1;
    g.weather.forced = 'clear'; g.weather.kind = 'clear'; g.weather.k = 0;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    api.at(params.get('at') ?? 'huangfeng');
    api.hour(params.get('hour') ?? 'noon');
    if (params.get('zoom')) api.zoom(Number(params.get('zoom')));
    if (params.get('yaw')) g.camYaw = g.camYawTarget = Number(params.get('yaw'));
    if (params.get('fly') === '1' && !g.player.flying) g.toggleFly();
    if (params.get('fight') === '1') {
      api.foes();
      window.setInterval(() => { g.hero.mp = 1; g.combat.invulnT = 1; api.cast(); }, 700);
    }
    if (params.get('drops') === '1') api.drops();
    if (params.get('zhen') === '1') api.zhen();
    if (params.get('reveal') === '1') g.revealAll = true;
    if (params.get('shield') === '1') { C.addItem(g.hero, 'art_xuantie', 1); g.combat.castArtifact('art_xuantie'); }   // 法器盾（玄铁飞天盾）悬在身侧   // 全图已探：远景不被「未探索」的纸色盖住（看远山层、城的远景用）
    g.updateUI(true);
    w.__gfxReady = true;
  }, 6500);
}
