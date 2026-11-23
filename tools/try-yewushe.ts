// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=yewushe[&at=spawn|fight][&move=<招>|all][&form=human|half|demon][&realm=1–5] —— 噬魂魔尊 · 夜无赦（world/yewushe.ts）
//   （默认）他降临在你前面不远处的开阔地上站着（结丹修为，他是元婴）；走进一千七以内就开打
//   at=spawn  看降临：先报一条江湖传闻，过两息天降血光、全服公告、地图上出「魔」字；你站在降临处外面，往前走就能看见他
//   at=fight  直接开打（他就在你跟前）；&form=half / demon 从半魔 / 魔躯开打
//   &move=<招的 id>  他对着一个木人桩循环放这一招（截图、对照用）；&move=all 这一形态会的招轮着放；&form= 指定形态
//     id：yws_duohun 堕魂诀、yws_sanshi 魂镰三式、yws_ruti 魔气入体、yws_jiangshen 天魔降身 · 末劫、yws_guibu 鬼步、yws_mozhua 摄魂魔爪、
//         yws_xuelian 血镰乱舞、yws_bengyue 崩岳魔锤、yws_huixuan 回旋魂镰、yws_youming 幽冥刺、yws_jielun 劫轮、yws_mingchu 冥触、
//         yws_moquan 魔拳、yws_guimen 鬼门关、yws_moshen 魔审；魔躯：yws_liehun 裂魂爪、yws_mozhang 玄冥魔障、yws_moxiao 不灭魔啸、yws_tianqing 末劫天倾（半魔也会）、
//         yws_mieshi 灭世重击、yws_shixian 永堕 · 混沌弑仙、yws_mochao 极恶魔潮、yws_moyi 末劫梵音 · 灭世魔翼（这几招用 &form=demon）
// window.__yws：首领本体；window.__ywsReady：摆好了
import { openField } from './try-hanshan';
import { FOG_CELL, FOG_W, FOG_H } from '../src/world/game';
import type { Game } from '../src/world/game';
import type { YwsForm } from '../src/world/yws-core';

type W = Window & { __ywsReady?: boolean; __yws?: Game['yewushe']; __ywsDummy?: unknown };

/** 招式演示清场：不相干的敌人清掉（只留他和演示摆的靶子 bx_*），不刷怪；新手引导的情境小课记成上过；地点卡不出；他周围四千照亮 */
function clearYws(g: Game) {
  const c = g.combat, Y = g.yewushe;
  const keep = (e: { def: { id: string } }) => e === Y.ent || String(e.def.id).startsWith('bx_');
  const tu = g.tutorial as unknown as { lessons: { id: string }[]; ctxCur: unknown; ensure(): { ctx: string[] } };
  const reveal = (x: number, y: number, r: number) => {
    for (let gy = Math.floor((y - r) / FOG_CELL); gy <= Math.floor((y + r) / FOG_CELL); gy++) for (let gx = Math.floor((x - r) / FOG_CELL); gx <= Math.floor((x + r) / FOG_CELL); gx++) if (gx >= 0 && gy >= 0 && gx < FOG_W && gy < FOG_H) g.explored[gy * FOG_W + gx] = 1;
  };
  window.setInterval(() => {
    if (Y.ent) reveal(Y.ent.x, Y.ent.y, 4000);
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    if (c.enemies.some((e) => !keep(e))) c.enemies = c.enemies.filter(keep);
    { const Z = (g as unknown as { zhenfa?: { list: { owner: string; dead?: boolean }[] } }).zhenfa; if (Z) for (const i of Z.list) if (i.owner === 'e') i.dead = true; }   // 演示靶子（劫修）会就地布阵：撤掉，别在画面里插一地阵旗
    try { const s = tu.ensure(); for (const L of tu.lessons) if (!s.ctx.includes(L.id)) s.ctx.push(L.id); tu.ctxCur = null; } catch { /* 无引导 */ }
  }, 200);
  const css = document.createElement('style'); css.textContent = '.loc-card,.quest-tracker,.sect-tracker,.qc-item,.quest-col{display:none!important}'; document.head.appendChild(css);   // 招式演示：地点卡、左边的任务栏都收起（不挡首领）
}

export function tryYewushe(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const at = params.get('at') ?? 'near', h = g.hero, Y = g.yewushe, c = g.combat;
    const move = params.get('move'), form = (['human', 'half', 'demon'].includes(params.get('form') ?? '') ? params.get('form') : 'human') as YwsForm;
    h.realm = Math.max(1, Math.min(5, Number(params.get('realm') ?? 3))); h.stage = h.realm === 1 ? 8 : 1; h.hp = 1; h.mp = 1;
    c.brawl.learn(true);
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    // 开阔地：没有树林、不在山上（招式看得清）
    let f = openField(g, g.player) ?? { x: g.player.x, y: g.player.y };
    for (let r = 2000; r < 60000; r += 2000) { const q = openField(g, g.player, r); if (q && Y.siteOk(q.x, q.y, true)) { f = q; break; } }
    g.teleport(f.x, f.y);
    c.enemies.length = 0;
    g.hanshan.place(f.x + 90000, f.y, 'stay');   // 撼山客挪远，别凑进来
    const p = g.player;
    const site = (dx: number, dy: number) => { for (let k = 0; k < 24; k++) { const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, L = Math.hypot(dx, dy), x = p.x + Math.cos(a) * L, y = p.y + Math.sin(a) * L; if (Y.siteOk(x, y, true)) return { x, y }; } for (let k = 0; k < 24; k++) { const a = Math.atan2(dy, dx) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.26, L = Math.hypot(dx, dy), x = p.x + Math.cos(a) * L, y = p.y + Math.sin(a) * L; if (Y.siteOk(x, y)) return { x, y }; } return { x: p.x + dx, y: p.y + dy }; };
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    (window as W).__yws = Y;
    if (at === 'spawn' && !move) {
      // 先报传闻，两息后降临（离你两千五：走几步就看得见）
      const s = Y.s, day = Math.floor(g.day);
      if (Y.ent) Y.despawn(false);
      s.cur = null; s.next = day + 30; s.rumored = false;
      Y.schedule(day);
      window.setTimeout(() => { const q = site(2500, -200); Y.descendNow(q); g.updateUI(true); }, 2200);
      g.toast('江湖上有了传闻……留意屏幕：两息后天降血光。', 'info');
    } else {
      const q = move ? site(330, -40) : at === 'fight' ? site(420, -60) : site(1500, -120);
      Y.descendNow(q, true);
      if (move) {
        clearYws(g);
        (window as W).__ywsDummy = Y.startDemo(move, form);   // 同一帧里接上演示（不先走一帧「开打」）
        const e = Y.ent, tg0 = (window as W).__ywsDummy as { x: number; y: number } | undefined; if (e) { g.teleport(tg0 ? e.x + (tg0.x - e.x) * 0.38 : e.x + 260, (tg0 ? e.y + (tg0.y - e.y) * 0.38 : e.y) + (form === "demon" ? -330 : 120));   // r17：镜头偏向首领（远程招靶子在六百外，取正中时首领被挤到画面边上）   // 魔躯三个半人高：镜头往上挪，头不出画   // 镜头对准两人正中（截对照图：首领不被左边的任务栏挡住）
          g.cam.zoom = g.cam.targetZoom = Number(params.get('zoom') ?? 1.2); }   // 你站在两人中间靠前一点（演示里他不打你），镜头推近
      } else if (at === 'fight') {
        const t = window.setInterval(() => { if (Y.ent) { clearInterval(t); Y.engage(); if (form !== 'human') { Y.setForm(form); const e = Y.ent; e.hp = e.maxHp * (form === 'half' ? 0.65 : 0.38); } } }, 100);
      } else g.toast('前方赤土上站着一个白发黑袍的人，手里那柄魂镰比人还高。走近一千七以内，他就会动手。', 'warn');
    }
    g.updateUI(true);
    window.setTimeout(() => { (window as W).__ywsReady = true; }, 900);
  }, 6500);
}
