// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=townwreck[&city=yuejing|jiayuan|…][&demo=stall|house|street|repair|bill][&shop=pill]
// —— 城镇破坏与恢复（world/townwreck.ts）。主角站在指定城的集市里，左上角几个按钮各触发一次：
//   砸一排摊位（stall）   一个 radial 横扫一排摊位：碎裂倒下、留残骸，摊主惊叫躲开
//   连砸一座铺子（house）  对集市北边一座铺子撞三下（近战撞墙的入口 impact）：完好 → 破损 → 半塌；&shop=pill 砸的是丹药铺（半塌后门口摆临时摊）
//   街心放一个放射（street）街心一记 radial：石板碎裂、两边的摊子和屋瓦遭殃
//   快进两天（repair）     g.day 往后拨两个昼夜：看脚手架、工匠敲打、修好时的「焕然一新」
//   推到讨债门槛（bill）   损坏账加到门槛：城卫执事上来讨赔
//   捐资修缮、城墙（墙）、复原
// 截图：window.__town.fire('stall') 触发；window.__town.go('house') 把主角挪到那一处；就绪后 window.__townReady = true、#perf-panel 藏起来。
import type { Game } from '../src/world/game';
import type { TWTarget } from '../src/world/townwreck';

type Demo = 'stall' | 'house' | 'street' | 'repair' | 'bill' | 'donate' | 'wall' | 'paifang' | 'reset';
type Wn = Window & { __townReady?: boolean; __town?: { fire: (d: Demo) => void; go: (k: 'stall' | 'house' | 'street' | 'wall' | 'tp' | 'paifang') => void; pts: Record<string, { x: number; y: number }>; city: string } };

export function tryTown(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(async () => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const W0 = await import('../src/data/world');
    const { getLayout, LOC_SCALE } = await import('../src/gfx/building');
    const { TW } = await import('../src/world/townwreck');
    const C = await import('../src/world/cultivation');
    const h = g.hero, c = g.combat, TWS = c.wreck.town;
    h.realm = 4; h.stage = 1; h.hp = 1; h.mp = 1;
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    c.enemies.length = 0;
    const city = W0.LOC_BY_ID.get(params.get('city') ?? 'yuejing') ?? W0.LOC_BY_ID.get('yuejing')!;
    const L = getLayout(city) as ReturnType<typeof getLayout> & { anchors?: Record<string, { x: number; y: number }> };
    const ox = city.x * W0.WORLD_SCALE, oy = city.y * W0.WORLD_SCALE;
    // 集市：取摊位点（mkt*）里居中的那个；没有集市的城取坊市门口
    const mk = Object.entries(L.anchors ?? {}).filter(([k]) => k.startsWith('mkt')).map(([, v]) => v);
    const at0 = mk.length ? mk[Math.floor(mk.length / 2)] : (L.doors ?? []).find((d) => d.fn === 'market') ?? { x: 0, y: 0 };
    const mx = ox + at0.x * LOC_SCALE, my = oy + at0.y * LOC_SCALE;
    const p = g.player;
    g.teleport(mx, my + 160); p.flying = false; p.z = p.zTarget = 0;
    g.space.update(1, p.x, p.y);
    const M = TWS.modelOf(city)!;
    const near = (k: (t: TWTarget) => boolean, x: number, y: number) => M.T.filter(k).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    const stall = near((t) => t.sub === 'stall', mx, my) ?? M.T[0];
    const want = params.get('shop');
    // 门口没停车马轿子的那间（看得清门脸、门前的瓦砾）
    const clear = (t: TWTarget) => !L.pieces[t.pi].p.two && !L.pieces.some((pc) => pc.kind === 'ckit' && Math.hypot(ox + pc.x * LOC_SCALE - t.fx, oy + pc.y * LOC_SCALE - t.fy) < 260);
    const shop = want ? (M.T.find((t) => t.fn === want) ?? near((t) => t.sub === 'cshop', mx, my)) : (near((t) => t.sub === 'cshop' && t.r === 0 && !t.fn && clear(t), mx, my - 300) ?? near((t) => t.sub === 'cshop' && t.r === 0 && !t.fn, mx, my - 300));
    const wall = near((t) => t.k === 'wall' && t.sub === 'x', mx, my);
    const tp = M.T.find((t) => t.sub === 'cteleport');
    const pf = near((t) => t.sub === 'paifang' && t.r === 0, mx, my) ?? near((t) => t.sub === 'paifang', mx, my);
    // 牌坊附近的酒旗、灯杆（一并演示倒下）
    const pole = near((t) => t.sub === 'flag' || t.sub === 'lamp', mx, my);
    // 街心：离摊位行往南三百的那条过道（街巷导航点里离得最近的）
    const nav = L.nav?.pts ?? [];
    let street = { x: mx, y: my + 260 };
    { let bd = 1e18; for (let i = 0; i < nav.length; i += 2) { const x = ox + nav[i] * LOC_SCALE, y = oy + nav[i + 1] * LOC_SCALE, d = Math.abs(Math.hypot(x - mx, y - my) - 420); if (d < bd && y > my) { bd = d; street = { x, y }; } } }
    const pts: Record<string, { x: number; y: number }> = { stall: { x: stall.x, y: stall.y }, house: { x: shop.fx, y: shop.fy }, street, wall: wall ? { x: wall.x, y: wall.y } : street, tp: tp ? { x: tp.x, y: tp.y } : street, paifang: pf ? { x: pf.x, y: pf.y } : street, pole: pole ? { x: pole.x, y: pole.y } : street };
    const go = (k: keyof typeof pts | string) => {
      const q = pts[k] ?? street;
      // 站在它南边一点（东西在画面上方偏中）
      const dy = k === 'house' ? 150 : k === 'wall' ? 380 : k === 'paifang' ? 260 : 300;
      g.teleport(q.x, q.y + dy); p.flying = false; p.z = p.zTarget = 0; g.space.update(1, p.x, p.y);
    };
    const fire = (d: Demo) => {
      const st = () => TWS.state(city.id, true)!;
      if (d === 'stall') { const r = c.wreck.radial(stall.x + 120, stall.y, 420, 3.4, 'p', { mark: 'crack' }); g.toast(`砸了一排摊位：碎了 ${r.town?.broken ?? 0} 件（损坏账 ${Math.round(st().bill)} 块灵石）`, 'info'); }
      else if (d === 'house') {
        // 连撞三下（近战把人轰进房子的入口；这里算主角的）
        let k = 0; const hit = () => { TWS.impact(shop.fx, shop.fy + 30, -Math.PI / 2, 3, 'p'); if (++k < 3) window.setTimeout(hit, 380); else { const e = TWS.entry(st(), shop.id); g.toast(`铺子：${['完好', '破损', '半塌'][e?.t ?? 0]}（耐久 ${Math.round(e?.hp ?? shop.hp)} / ${Math.round(shop.hp)}）`, 'info'); } };
        hit();
      } else if (d === 'street') { const r = c.wreck.radial(street.x, street.y, 520, 4.2, 'p'); g.toast(`街心一记放射：小件 ${r.town?.broken ?? 0}、房子掉档 ${r.town?.tiers ?? 0}`, 'info'); }
      else if (d === 'repair') {
        g.day += TW.DAY * 2;
        const s = TWS.state(city.id); const n = s ? s.e.filter((e) => e.t > 0).length : 0, sc = s ? s.e.filter((e) => e.t > 0 && TWS.scaffolding(e)).length : 0;
        g.toast(n ? `快进两天：还有 ${n} 处在修（${sc} 处搭着脚手架）` : '快进两天：城里都修好了，焕然一新。', 'good');
      } else if (d === 'bill') { const s = st(); s.bill = Math.max(s.bill, TW.bill.demand + 5); s.ask = -1e9; g.toast('损坏账推到讨债门槛：城卫执事这就来。', 'warn'); }
      else if (d === 'donate') { const s = st(); const price = TWS.rushPrice(city); if (C.bagCount(h, 'mat_lingshi') < price + 50) C.addItem(h, 'mat_lingshi', price + 50); void s; g.openDialog(TWS.donateNode(city)); }
      else if (d === 'wall') { if (wall) { for (let i = 0; i < 3; i++) TWS.impact(wall.x + (i - 1) * 140, wall.y + 260, -Math.PI / 2, 3, 'p'); g.toast('城墙挨了几下：只留焦痕、掉几块砖，不塌、不开口子。', 'info'); } }
      else if (d === 'paifang') { if (pf) { const r = c.wreck.radial(pf.x, pf.y + 40, 260, 4.5, 'p', { mark: 'crack' }); g.toast(`牌坊挨了一记：${r.town?.broken ? '齐腰断开，上半截砸在脚下' : '没倒'}`, 'info'); } if (pole) c.wreck.cone(pole.x - 200, pole.y + 60, -0.3, 400, 0.4, 3, 'p'); }
      else if (d === 'reset') { TWS.clear(city); c.wreck.reset(); g.toast('复原：这座城的破坏全清了。', 'good'); }
    };
    // 左上角的按钮（这里没有动效）
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;top:12px;z-index:9999;display:flex;gap:6px;flex-wrap:wrap;max-width:460px;font:14px/1.2 "STKaiti","KaiTi",serif';
    const NAMES: [Demo, string][] = [['stall', '砸一排摊位'], ['house', '连砸铺子'], ['street', '街心放射'], ['repair', '快进两天'], ['bill', '推到讨债门槛'], ['donate', '捐资修缮'], ['wall', '砸城墙'], ['paifang', '砸牌坊'], ['reset', '复原']];
    for (const [k, name] of NAMES) {
      const b = document.createElement('button'); b.textContent = name;
      b.style.cssText = 'padding:6px 10px;border:1px solid #c9a45c;background:rgba(30,22,14,0.82);color:#f3e2b8;border-radius:4px;cursor:pointer';
      b.onclick = (ev) => { ev.stopPropagation(); if (k === 'house' || k === 'wall' || k === 'paifang') go(k); fire(k); };
      box.appendChild(b);
    }
    document.body.appendChild(box);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    if (params.get('zoom')) g.setZoom(Number(params.get('zoom')));
    if (params.get('hour')) {
      // 定住时辰（同 try-gfx：每 0.1 秒把钟拨回去）
      const H: Record<string, number> = { dawn: 0.25, noon: 0.5, dusk: 0.75, night: 0.95 }, ph = H[params.get('hour')!] ?? Number(params.get('hour')), DAY = 240;
      if (Number.isFinite(ph)) { const set = () => { g.clock = (Math.floor(g.clock / DAY) + ph) * DAY; }; set(); window.setInterval(set, 100); }
    }
    g.updateUI(true);
    // 开场的剧情对话、引导之类：试玩期间一律关掉（演示自己开的对话——讨债、捐资、临时摊——除外）
    const mine = new Set(['城卫执事', '坊市管事', '掌柜', '伙计']);
    window.setInterval(() => { const md = g.modal as { kind?: string; node?: { speaker?: string } } | null; if (md && !(md.kind === 'dialog' && mine.has(md.node?.speaker ?? '')) && md.kind !== 'town') g.closeModal(true); }, 300);
    (window as Wn).__town = { fire, go, pts, city: city.id };
    (window as Wn).__townReady = true;
    const demo = params.get('demo') as Demo | null;
    if (demo) { if (demo === 'house' || demo === 'wall' || demo === 'paifang') go(demo); window.setTimeout(() => fire(demo), 800); }
    g.toast(`城镇破坏（${city.name}）：左上角的按钮各触发一次；打坏的会自己修好，玩家打坏的记账。`, 'good');
  }, 6500);
}
