// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=hitfeel[&real=1][&demo=1][&q=0|1|2] —— r9-hitfeel 全游戏打击感
// 一片开阔平地，你站在左边、右边摆一个人形陪练（劫修，打不死、不还手）。截图脚本 / 控制台用 window.__hf：
//   await __hf.melee('fist'|'sword'|'heavy'|'spear', 1|2|3, T?)   真的出招打陪练（轻击 / 重击 / 破罡后重击把人轰飞），命中后再走 T 息定格
//   await __hf.hurt(big?, T?)            旁边一头火狼扑上来咬你一口（偏红的那一版）
//   await __hf.boom(pal, T?)             陪练脚下炸一个法术：fire / frost / thunder / venom / ink / void / gold / earth / wind / art（法器三档冲击）
//   __hf.npc()                           两拨人（劫修 vs 火狼）在你身边互殴（按真实时间走）
//   __hf.unfreeze()                      接着走；__hf.low(true) 画质压到低档（看轻量版）
//   __hf.demo()                          三十秒实战编排（录像用，按真实时间走）：连拳、各种兵器、法术、法器、挨打、NPC 互殴、打死精英
// 固定步长（1/60 息一帧）走；&real=1 按真实时间走。
import type { Game } from '../src/world/game';
import { Enemy } from '../src/world/combat';
import * as C from '../src/world/cultivation';
import { ENEMIES } from '../src/data/enemies';
import { weaponItemId, type WeaponKind } from '../src/data/weapons';
import { openField } from './try-hanshan';
import * as HFM from '../src/world/hitfeel';
import { resetHfGL } from '../src/gl/hitfeelgl';
const { hitFeel } = HFM;

type W = Window & { __hf?: unknown; __hfReady?: boolean };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 逐帧固定步长；定格 = 步长几乎为零（世界和特效一起停住，画面照常画） */
function stepper(g: Game, real: boolean) {
  g.debugFixedDt = real ? 0 : 1 / 60;
  return {
    run() { g.debugFixedDt = real ? 0 : 1 / 60; },
    freeze() { g.debugFixedDt = 1e-7; },
    get frozen() { return g.debugFixedDt > 0 && g.debugFixedDt < 1e-4; },
  };
}

export function tryHitfeel(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const c = g.combat, B = c.brawl, h = g.hero, p = g.player, hf = hitFeel(c);
    h.realm = 3; h.stage = 1; h.hp = 1; h.mp = 1;
    B.learn(true);
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    g.weather.forced = 'clear'; g.weather.kind = 'clear'; g.weather.k = 0;
    const q = params.get('q'); if (q !== null && g.renderer) g.renderer.setQuality(Number(q));
    // 场子：开阔、少树的平地
    const T = g.terrain;
    const fmax = (cx: number, cy: number) => { let m = 0; for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) m = Math.max(m, T.sample(cx + i * 260, cy + j * 220).forest); return m; };
    let f = openField(g, p) ?? { x: p.x, y: p.y }, best = fmax(f.x, f.y);
    for (let r = 0; r < 30 && best > 0.06; r++) { const o = openField(g, p, 2500 + r * 2500); if (!o) continue; const m = fmax(o.x, o.y); if (m < best) { best = m; f = o; } }
    g.teleport(f.x, f.y);
    c.enemies.length = 0;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    const css = document.createElement('style'); css.textContent = '.loc-card{display:none!important}'; document.head.appendChild(css);
    const mine = new Set<Enemy>();
    window.setInterval(() => {
      (c as unknown as { spawnT: number }).spawnT = 1e9; if (g.modal) g.closeModal(true);
      if (c.enemies.some((e) => !mine.has(e))) c.enemies = c.enemies.filter((e) => mine.has(e));
      h.hp = Math.max(h.hp, 0.6); h.mp = 1;
      try { const tu = g.tutorial as unknown as { lessons: { id: string }[]; ctxCur: unknown; ensure(): { ctx: string[] } }; const s = tu.ensure(); for (const L of tu.lessons) if (!s.ctx.includes(L.id)) s.ctx.push(L.id); tu.ctxCur = null; } catch { /* 无引导 */ }
    }, 200);
    const S = stepper(g, params.get('real') === '1');
    const O = { x: f.x, y: f.y };
    const R = () => g.renderer?.hd?.rightDir ?? { x: 1, y: 0 };
    // 兵器：兵器槽里穿一把（拳脚：卸下）
    const wield = (kind: WeaponKind) => {
      const ls = C.itemListeners.splice(0);
      for (const b of h.bag) if (b.worn === 'weapon') C.unwearGear(h, 'weapon');
      if (kind !== 'fist') { const id = weaponItemId(kind, 3); C.addItem(h, id, 1); const b = h.bag.filter((x) => x.id === id && !x.worn).pop(); if (b) C.wearGear(h, b); }
      C.itemListeners.push(...ls);
      B.syncWeapon(); g.updateUI(true);
    };
    let dummy: Enemy | null = null;
    const mkDummy = () => {
      const r = R(), x = O.x + r.x * 150, y = O.y + r.y * 150;
      if (!dummy || !c.enemies.includes(dummy) || dummy.dead) { dummy = B.spawnSparMan(x, y, 3); mine.add(dummy); }
      const d = dummy; d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e9; d.aggro = false; d.speed = 0; d.dead = false;
      B.clear(d); const bd = B.body(d); bd.breakT = 0; bd.staggerT = 0; bd.poise = bd.poiseMax;
      d.x = x; d.y = y; d.kx = d.ky = 0; d.flyH = 0; d.lift = 0;
      if (d.cs) { d.cs.x = x; d.cs.y = y; d.cs.setAction('idle'); d.cs.faceToward(-r.x, -r.y, false); d.cs.yaw = d.cs.targetYaw; }
      return d;
    };
    /** 陪练以外这一页摆的人（火狼、互殴的两拨）都收走：每一段只放这一段要展示的东西 */
    const clearExtra = () => { for (const e of [...mine]) if (e !== dummy) { mine.delete(e); e.dead = true; e.gone = true; } };
    const home = () => {
      B.pb.air = false; B.pb.staggerT = 0; B.playerLift = 0; c.pst = {}; c.invulnT = 0; p.flying = false; p.z = p.zTarget = 0;
      p.x = O.x; p.y = O.y; p.st.x = p.x; p.st.y = p.y; const r = R(); p.st.faceToward(r.x, r.y, false); p.st.yaw = p.st.targetYaw;
    };
    /** 等下一次命中定了档，再走 T 息定格 */
    const afterHit = async (T: number, n0: number) => {
      for (let i = 0; i < 400 && hf.stats.hit === n0; i++) await sleep(5);
      const t0 = g.time; for (let i = 0; i < 3000 && g.time - t0 < T; i++) { if (g.modal) g.closeModal(true); g.paused = false; await sleep(2); }
      S.freeze();
      return { ...hf.stats };
    };
    /** 让世界走 T 息（不定格）：前一个爆炸的火、烟散掉再拍下一个 */
    const waitGame = async (T: number) => { const t0 = g.time; for (let i = 0; i < 6000 && g.time - t0 < T; i++) { if (g.modal) g.closeModal(true); g.paused = false; await sleep(2); } };
    const atTime = async (T: number) => { const t0 = g.time; for (let i = 0; i < 3000 && g.time - t0 < T; i++) { if (g.modal) g.closeModal(true); g.paused = false; await sleep(2); } S.freeze(); return { ...hf.stats }; };
    const api = {
      hf, mod: HFM, get dummy() { return dummy; },
      stats: () => ({ ...hf.stats }),
      unfreeze() { S.run(); },
      freeze() { S.freeze(); },
      low(on: boolean) { g.renderer?.setQuality(on ? 0 : 2); },
      async melee(kind: WeaponKind, tier: 1 | 2 | 3, T = 0.035) {
        S.run(); clearExtra();
        wield(kind); home(); const d = mkDummy();
        c.lock = d; (c as unknown as { manual: boolean }).manual = true;
        for (let i = 0; i < 30; i++) await sleep(16);   // 兵器换手、镜头稳住
        home(); mkDummy(); c.cds.clear();   // 重击的冷却清掉（连着拍几档）
        const n0 = hf.stats.hit;
        if (tier === 1) B.light();
        else { if (tier === 3) { const b = B.body(d); b.poise = 0; b.breakT = 1.5; } B.heavy(); }
        return afterHit(T, n0);
      },
      async hurt(big = true, T = 0.035) {
        S.run(); clearExtra(); home();
        const r = R(), wolf = new Enemy(ENEMIES.redwolf, O.x - r.y * 40 + r.x * 120, O.y + r.x * 40 + r.y * 120, 3, 0); wolf.aggro = false; wolf.speed = 0; mine.add(wolf); c.enemies.push(wolf);
        for (let i = 0; i < 20; i++) await sleep(16);
        const n0 = hf.stats.hit; c.invulnT = 0;
        c.hitPlayer(big ? 900 : 120, 3, undefined, wolf.x, wolf.y, wolf);
        return afterHit(T, n0);
      },
      async boom(pal: string, T = 0.12) {
        S.run(); clearExtra();
        home(); mkDummy();
        await waitGame(T > 0 ? 2.2 : 0.05);
        if (T > 0) resetHfGL();   // 拍图：上一个爆炸留在同一处的冰霜印 / 毒斑先清掉（不然和这一个叠在一起，颜色是混的）
        const r = R(), x = O.x + r.x * 300, y = O.y + r.y * 300;
        const V: Record<string, [string, string, string, number]> = {
          fire: ['strike', 'flame', '255,140,60', 160], frost: ['ring', 'frost', '170,220,255', 170], thunder: ['strike', 'lightning', '190,200,255', 150],
          venom: ['ring', 'vine', '120,220,90', 160], ink: ['ring', 'ghost', '150,80,180', 160], void: ['ring', 'mind', '170,140,255', 170],
          gold: ['strike', 'gold', '255,220,120', 160], earth: ['strike', 'rock', '200,160,100', 160], wind: ['ring', 'tornado', '170,240,220', 170],
        };
        if (pal === 'art') c.impact(x, y, 3, '255,220,120');   // 法器三档冲击（法器砸下、神通落地都走 combat.impact）
        else { const v = V[pal] ?? V.fire; c.vfx.push({ kind: v[0], x, y, r: v[3], t: 0, dur: 0.6, color: v[2], fx: v[1], seed: 7 } as never); }
        return atTime(T);
      },
      /** 两拨人互殴：劫修 vs 毒蛛（在你身边，按真实时间走；和「挨打」那段的火狼分开） */
      npc() {
        S.run(); clearExtra(); home(); if (dummy) { mine.delete(dummy); dummy.dead = true; dummy.gone = true; dummy = null; }
        const r = R(), cx = O.x + r.x * 420, cy = O.y + r.y * 420;
        for (let i = 0; i < 3; i++) {
          const a = new Enemy(ENEMIES.bandit, cx - r.x * 160 + (i - 1) * 90 * -r.y, cy - r.y * 160 + (i - 1) * 90 * r.x, 2, 2); a.team = 'hf_a'; a.aggro = true; (a as unknown as { noP: boolean }).noP = true; mine.add(a); c.enemies.push(a);
          const b = new Enemy(ENEMIES.spider ?? ENEMIES.redwolf, cx + r.x * 160 + (i - 1) * 90 * -r.y, cy + r.y * 160 + (i - 1) * 90 * r.x, 2, 0); b.team = 'hf_b'; b.aggro = true; (b as unknown as { noP: boolean }).noP = true; mine.add(b); c.enemies.push(b);
        }
      },
      /** 三十秒实战（录像用） */
      async demo() {
        S.run();
        const step = async (ms: number) => { await sleep(ms); };
        // 1. 拳脚连段 → 重击 → 破罡轰飞
        for (const [kind, n] of [['fist', 4], ['sword', 3], ['heavy', 2], ['spear', 3]] as [WeaponKind, number][]) {
          wield(kind); home(); const d = mkDummy(); c.lock = d;
          await step(500);
          for (let i = 0; i < n; i++) { B.light(); await step(kind === 'heavy' ? 520 : 330); }
          B.heavy(); await step(900);
          const b = B.body(d); b.poise = 0; b.breakT = 1.5; home(); mkDummy(); B.heavy(); await step(1300);
        }
        wield('fist'); home(); mkDummy();
        // 2. 法术：各系炸一遍（法器三档冲击收尾）
        for (const pal of ['fire', 'frost', 'thunder', 'venom', 'ink', 'void', 'earth', 'art']) { await api.boom(pal, 0); S.run(); await step(900); }
        // 3. 挨打（火狼咬两口）
        await api.hurt(false, 0); S.run(); await step(500); await api.hurt(true, 0); S.run(); await step(900);
        // 4. NPC 互殴（火狼先收走：只看两拨人自己打）
        api.npc(); await step(5000);
        // 5. 打死一个首领（终）
        clearExtra(); home(); const e = new Enemy(ENEMIES.bandit, O.x + R().x * 160, O.y + R().y * 160, 3, 2); mine.add(e); c.enemies.push(e); e.boss = true; e.aggro = false; e.speed = 0;
        await step(300); c.hitEnemy(e, e.maxHp * 3, { realm: 3, stCh: 0, school: '火', skill: 'yanbao' }, p.x, p.y); await step(2000);
      },
    };
    (window as W).__hf = api;
    home(); mkDummy();
    g.setZoom(0.95);
    g.toast('全游戏打击感（r9-hitfeel）：控制台 __hf.melee / hurt / boom / npc / demo', 'good');
    (window as W).__hfReady = true;
    if (params.get('demo') === '1') void api.demo();
  }, 6500);
}
