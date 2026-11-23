// 噬魂魔尊 · 夜无赦 招式第二批：裂魂爪、玄冥魔障（人半魔 = 玄冥魔障；魔躯 = 魔化本能 → 玄冥终焉）、魔障屏障、不灭魔啸、末劫天倾（魔躯接末劫狂想）、末劫陷阱、灭世重击（魔躯：灭世重击，或狂怒撕裂 → 灭世冲击）、魔审 · 犁魂。
// 对时版：时长、出手时刻、位移按画面线帧表（world/yewushe-anim.ts）走，见 yws-core.ts 的 ywsMove。规格：docs/夜无赦-参考视频动作分解.md §8、§15、§17–§20。
import type { MoveCtx } from './brawlmoves';
import type { Yewushe } from './yewushe';
import {
  addYws, at, D, F3, near, strike, aoe, scr, show, white, say, sfx, ghost, hr, ywsOf, TAU, clamp, C_VOID, C_BLOOD, C_HELL, C_MAGENTA,
  drag, origin, tgPos, every, ang, userPos, ywsMove, inStrip, posOf, shake } from './yws-core';
import type { RGB3 } from './fx3d';

const C_EMBER: RGB3 = [1.8, 0.55, 0.18];
const isBoss = (c: MoveCtx) => { const Y = ywsOf(c.B); return !!Y && !!c.user && c.user === Y.ent; };
const awayLaunch = (c: MoveCtx, x: number, y: number, D0: number, vz: number) => { const q = tgPos(c), L = Math.hypot(q.x - x, q.y - y) || 1; if (c.target) c.launch(c.target, (q.x - x) / L, (q.y - y) / L, D0, vz); };
/** 吞掉身周 R 以内飞来的法术 / 飞剑（魔障），返回吞了几件 */
function eat(c: MoveCtx, R: number): number {
  const u = userPos(c), F = F3(c); let n = 0;
  for (const pr of c.B.g.combat.projs) {
    if (pr.fac !== 'p' || pr.life > pr.max) continue;
    const z = pr.visual?.groundOffsetY ?? 40;
    if (Math.hypot(pr.x - u.x, pr.y + z - u.y) < R + 40) { pr.aoe = 0; pr.life = pr.max + 1; n++; F.impact(pr.x, pr.y + z, 140, pr.vx, pr.vy, { power: 0.6, warp: 0.3 }); F.soul(pr.x, pr.y + z, 120, { r: 120, dur: 0.3, n: 4, col: C_VOID }); }
  }
  if (n) { const d = D(c); d.eat = ((d.eat as number) ?? 0) + n; }
  return n;
}
/** 一层魔障（竖环绕着他转 + 光罩） */
function barrier(c: MoveCtx, R: number, key: string, t0: number, t1: number) {
  const u = userPos(c), F = F3(c), j = every(c, key, t0, t1, 0.12);
  if (j >= 0) { const a = j * 0.9; F.ring(u.x, u.y, 160, Math.cos(a), Math.sin(a), 0.35, { r: R, power: 0.5, col: j % 2 ? C_VOID : C_MAGENTA, dur: 0.3 }); if (j % 3 === 0) F.halo(u.x, u.y, 160, { r: R * 0.95, dur: 0.4, col: C_VOID }); }
}

// ==================================================================== §8 裂魂爪（魔躯）：黑烟一爆、举爪蓄 0.4 息，600 毫秒一扑三道橙红爪痕往上撩（身前 0–360，挑飞）
const LIEHUN = ywsMove({
  id: 'yws_liehun', name: '裂魂爪', glyph: '裂', color: '255,90,40', cd: 6, range: 420,
  desc: '身上炸开一团黑烟，烟散时一只魔爪已高举过头、爪尖燃着白红的火；蓄满一扑，三道比人还高的橙红爪痕从下往上撩，把人挑上天。（夜无赦·魔躯）',
  seq: () => ['liehun'],
  frame(c, _a, lt) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (at(c, 'smoke', 0.1)) { F.blast(u.x, u.y, 0.9 * d.sc, 'ink', { z: 160, r: 260 }); F.soul(u.x, u.y, 200, { r: 300, dur: 0.4, n: 10, col: C_BLOOD }); sfx('yws_dark', u.x, u.y); }
    if (lt > 0.2 && lt < 0.6) {
      const hz = 420, j = every(c, 'cg', 0.2, 0.6, 0.1);
      if (j >= 0) { F.halo(u.x, u.y, hz, { r: 90, dur: 0.14, col: C_EMBER }); for (let i = 0; i < 3; i++) { const a = hr(c, j, i) * TAU; F.jet(u.x, u.y, hz, Math.cos(a), Math.sin(a), { len: 160, power: 0.5, dz: hr(c, i, j) - 0.3, pal: 'fire' }); } }
    }
    if (at(c, 'sk', 0.7)) F.debris(u.x, u.y, { n: 10, r: 80, hot: true, dir: ang(c) + Math.PI, spread: 0.8 });
  },
  hit(c) {
    const d = D(c), u = userPos(c), F = F3(c), fx = u.x + d.ux * 150, fy = u.y + d.uy * 150, o = origin(c);
    ghost(c, o.x, o.y, 0, d.ux * 40, d.uy * 40, 0.3, '200,40,40');
    for (let i = 0; i < 3; i++) F.scythe(fx - d.uy * (i - 1) * 70, fy + d.ux * (i - 1) * 70, 160, { nx: -d.uy, ny: d.ux, nz: 0, e1: [d.ux, d.uy, -0.6], a0: 0, sweep: 2.2, r: 260 * d.sc, w: 70, dur: 0.38, col: i === 1 ? C_EMBER : C_HELL, power: 1.4, delay: i * 0.025 });
    F.flare(fx, fy, 140, { r: 260, mode: 'star', col: [1.8, 1.4, 0.8] }); F.blast(fx, fy, 1.1, 'fire', { z: 120, r: 160 });
    shake(c, 0.8); sfx('yws_claw', fx, fy); sfx('yws_heavy', fx, fy);
    if (inStrip(c, u.x, u.y, -20, 360, 200)) { strike(c, 0.07, 2, 'yws_liehun', { power: 1.5, uz: 1, stop: 0.09 }); if (c.target) c.up(c.target, 1.2); }
  },
});

// ==================================================================== §15 玄冥魔障：人身 / 半魔（1.6 息，五下：魔障砸地三下、一扫、往前推出去）；魔躯 魔化本能（跃起砸到对手身上 + 连打，七下）→ 玄冥终焉（三下大爆）
// 放的时候身周有魔障：飞来的法术被吞掉，吞得越多终焉越狠
const MOZHANG = ywsMove({
  id: 'yws_mozhang', name: '玄冥魔障', glyph: '障', color: '120,40,200', cd: 14, range: 600,
  desc: '身周罩起一层紫黑的魔障——飞来的法术一碰就被吞掉，魔障一下一下砸地震开贴身的人，最后往前推出去；魔躯时化成「魔化本能」跃起砸到你身上连撕，再炸成「玄冥终焉」。（夜无赦）',
  seq: (_c, f) => (f === 'demon' ? ['benneng', 'zhongyan'] : ['xuanming']),
  start(c) { D(c).eat = 0; say(c, '无用。', '#c8a0ff'); },
  enter(c, a) { const u = userPos(c); if (a === 'zhongyan') { F3(c).soul(u.x, u.y, 160, { r: 700, dur: 0.35, n: 30 }); sfx('yws_tele', u.x, u.y); } else sfx('yws_dark', u.x, u.y); },
  frame(c, a, lt) {
    const R = 300 * Math.sqrt(D(c).sc);
    if (a === 'xuanming' || a === 'benneng') { barrier(c, R, 'bar', 0, a === 'xuanming' ? 1.4 : 0.34, ); eat(c, R); }
    if (a === 'zhongyan' && lt < 0.33) scr(c, { dim: 0.5 * lt / 0.33 });
    if (a === 'zhongyan') scr(c, { dim: 0.45 });
  },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), sc = k.sc;
    if (k.anim === 'xuanming') {
      if (k.i < 3) { const fx = u.x + d.ux * (120 + k.i * 60), fy = u.y + d.uy * (120 + k.i * 60); F.column(fx, fy, { h: 1800, r: 110, dur: 0.45, col: [1.2, 0.3, 1.9] }); F.blast(fx, fy, 1.3, 'void', { z: 60, r: 220 }); F.flare(fx, fy, 80, { r: 260, mode: 'blast', col: [2, 1.2, 2.2] }); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; F.jet(fx, fy, 40, Math.cos(a), Math.sin(a), { len: 220, power: 0.8, dz: 1.2, pal: 'void' }); }
        F.ring(u.x, u.y, 20, 0, 0, 1, { r: 380, power: 0.9, col: k.i % 2 ? C_MAGENTA : C_VOID, dur: 0.3 }); F.dust(u.x, u.y, { r: 260 }); shake(c, 0.4); sfx('yws_heavy', u.x, u.y); if (aoe(c, u.x, u.y, 300, 0.02, 0.6, 'yws_xuanming', { stop: 0.03, power: 0.7, sfx: null })) awayLaunch(c, u.x, u.y, 140, 160); return; }
      if (k.i === 3) { F.scythe(u.x, u.y, 120, { nx: 0, ny: 0, nz: 1, e1: [-d.ux, -d.uy, 0], a0: -0.4, sweep: 3.6, r: 320, w: 80, dur: 0.35, col: C_MAGENTA }); sfx('yws_slash', u.x, u.y); if (inStrip(c, u.x, u.y, -100, 340, 220)) strike(c, 0.03, 1, 'yws_xuanming', { stop: 0.04, power: 0.9 }); return; }
      const K = 1 + Math.min(4, (d.eat as number) ?? 0) * 0.15, x = u.x + d.ux * 260, y = u.y + d.uy * 260;
      F.blast(x, y, 1.5 * K, 'void', { z: 120, r: 240 }); F.ring(x, y, 120, d.ux, d.uy, 0, { r: 420, power: 1.3, col: C_MAGENTA }); F.warp(x, y, 120, { r: 500, power: 1.1, dur: 0.5 }); white(c, 1); shake(c, 0.9); sfx('yws_big', x, y);
      if (inStrip(c, u.x, u.y, 0, 520, 240)) { strike(c, 0.05 * K, 1.8, 'yws_xuanming', { power: 1.5, stop: 0.08 }); awayLaunch(c, u.x, u.y, 500, 400); }
      return;
    }
    if (k.anim === 'benneng') {
      // 第一下：从半空砸到对手身上；之后贴身连撕；最后一吼震开
      if (k.i === 0) { F.blast(u.x, u.y, 1.6, 'void', { r: 260 }); F.ring(u.x, u.y, 8, 0, 0, 1, { r: 700, power: 1.4, col: C_BLOOD }); F.dent(u.x, u.y, 200, 50, 8); shake(c, 1); sfx('yws_big', u.x, u.y); if (aoe(c, u.x, u.y, 320, 0.05, 1.6, 'yws_benneng', { power: 1.4, stop: 0.07 })) awayLaunch(c, u.x, u.y, 200, 300); return; }
      const s = k.i % 2 ? 1 : -1;
      if (k.last) { F.ring(u.x, u.y, 160, 0, 0, 1, { r: 600, power: 1.3, col: C_MAGENTA }); F.warp(u.x, u.y, 160, { r: 600, power: 1.2, dur: 0.5 }); sfx('yws_roar', u.x, u.y); if (aoe(c, u.x, u.y, 380, 0.03, 1, 'yws_benneng', { power: 1.1, stop: 0.04 })) awayLaunch(c, u.x, u.y, 400, 300); return; }
      F.scythe(u.x + d.ux * 100, u.y + d.uy * 100, 150, { nx: -d.uy * 0.4, ny: d.ux * 0.4, nz: s, e1: [-d.uy * s, d.ux * s, 0.5], a0: 0, sweep: 2.2, r: 220, w: 60, dur: 0.24, col: s > 0 ? C_BLOOD : C_HELL, power: 1.2 });
      sfx('yws_claw', u.x, u.y); if (near(c, u.x, u.y, 300)) strike(c, 0.018, 0.6, 'yws_benneng', { stop: 0.03, power: 0.8, sfx: null });
      return;
    }
    // 玄冥终焉：三下，一下比一下大（吞得越多越狠）
    const K = 1 + Math.min(4, (d.eat as number) ?? 0) * 0.15, R = (360 + k.i * 140) * sc;
    F.blast(u.x, u.y, (1.2 + k.i * 0.5) * K, 'void', { z: 160, r: 220 + k.i * 60 }); F.ring(u.x, u.y, 10, 0, 0, 1, { r: R * 1.6, power: 1.2 + k.i * 0.2, col: k.i % 2 ? C_MAGENTA : C_VOID });
    if (k.last) { F.column(u.x, u.y, { h: 2600, r: 160, dur: 0.8, col: [0.9, 0.2, 1.4] }); F.warp(u.x, u.y, 160, { r: 900, power: 1.5, dur: 0.6 }); F.dust(u.x, u.y, { r: 900, power: 1.4 }); F.dent(u.x, u.y, 200, 40, 6); white(c, 1); show(c, { k: 'lines', dur: 0.4, col: '170,70,255' }); }
    shake(c, 0.6 + k.i * 0.3); sfx(k.last ? 'yws_big' : 'yws_heavy', u.x, u.y);
    if (aoe(c, u.x, u.y, R, (k.last ? 0.06 : 0.03) * K, 1.6, 'yws_zhongyan', { power: 1.2 + k.i * 0.2, stop: 0.06 }) && k.last) awayLaunch(c, u.x, u.y, 700, 520);
  },
});

// ==================================================================== §15 魔障屏障：0.5 息的应对——身周一层魔障，飞来的法术全吞掉（三形态都会）
const PINGZHANG = ywsMove({
  id: 'yws_pingzhang', name: '魔障屏障', glyph: '屏', color: '200,60,220', cd: 4, range: 3000,
  desc: '飞来的法术眼看要打中他，身周一层品红的魔障「嗡」地张开，法术、飞剑一碰就散成魂火。（夜无赦）',
  seq: () => ['pingzhang'],
  enter(c) { const u = userPos(c); F3(c).halo(u.x, u.y, 150, { r: 280, dur: 0.5, col: C_MAGENTA }); sfx('yws_dark', u.x, u.y); },
  frame(c) { barrier(c, 280, 'pz', 0, 0.45); eat(c, 280); },
  hit() { /* 无出手 */ },
});

// ==================================================================== §18 不灭魔啸：仰天长啸（人 / 半魔 五下，350–742；魔躯 六下，350–990），一圈圈冲击波掀开四周；魔躯末了「安魂泣」回血、出手更狠
const MOXIAO = ywsMove({
  id: 'yws_moxiao', name: '不灭魔啸', glyph: '啸', color: '230,60,80', cd: 16, range: 3000,
  desc: '仰天一声魔啸，一圈接一圈的冲击波把四周的人全掀开；魔躯时接一声低低的哀泣（安魂泣），四散的魂火被吸回他身上——伤口合上一些，出手更狠。（夜无赦）',
  seq: () => ['mosiao'],
  enter(c) { const u = userPos(c); F3(c).soul(u.x, u.y, 260, { r: 260, dur: 0.35, n: 8, col: C_BLOOD }); },
  frame(c, _a, lt) { if (lt > 0.35 && lt < 1.0) scr(c, { wash: [0.5, 0.02, 0.06, 0.3 * clamp((1.0 - lt) / 0.4, 0, 1)] }); },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), sc = k.sc, R = (500 + k.i * 80) * sc;
    F.ring(u.x, u.y, 60 + k.i * 50, 0, 0, 1, { r: R, power: 1.3 - k.i * 0.1, col: k.i % 2 ? C_VOID : C_BLOOD, dur: 0.45 });
    if (k.i === 0) { F.warp(u.x, u.y, 260, { r: 1000 * sc, power: 1.6, dur: 0.7 }); F.dust(u.x, u.y, { r: 900 * sc, power: 1.4 }); F.ripple(u.x, u.y, { amp: 18, reach: 1600 }); shake(c, 1.1); c.cam(0.6); sfx('yws_roar', u.x, u.y); show(c, { k: 'lines', dur: 0.6, col: '255,60,80' }); }
    if (k.i === 0 && aoe(c, u.x, u.y, R, 0.035, 1.2, 'yws_chouhen', { power: 1.2, stop: 0.06 })) awayLaunch(c, u.x, u.y, 560, 380);
    else if (k.i > 0 && !k.last) aoe(c, u.x, u.y, R * 0.8, 0.01, 0.3, 'yws_chouhen', { stop: 0, power: 0.4, sfx: null, noFx: true });
    if (k.last && k.form === 'demon') {
      F.soul(u.x, u.y, 160, { r: 900, dur: 0.7, n: 40, col: [0.9, 0.3, 1.2] }); F.column(u.x, u.y, { h: 1400, r: 70, dur: 0.6, col: [1.3, 0.15, 0.3] }); sfx('yws_soul', u.x, u.y);
      const Y = ywsOf(c.B); if (Y && isBoss(c) && c.user) { c.user.hp = Math.min(c.user.maxHp, c.user.hp + c.user.maxHp * 0.02); Y.dmgK = Math.max(Y.dmgK, 1.2); Y.buffT = Math.max(Y.buffT, 15); }
      aoe(c, u.x, u.y, 420 * sc, 0.02, 0.6, 'yws_anhun', { power: 0.6, stop: 0.03 });
    }
    void d;
  },
});

// ==================================================================== §19 末劫天倾：召下末劫——血红的魔光从天上一道道砸在对手身上（半魔 3 下，魔躯 4 下）；魔躯接「末劫狂想」（身周连环大爆，5 下）
const TIANQING = ywsMove({
  id: 'yws_tianqing', name: '末劫天倾', glyph: '倾', color: '255,50,40', cd: 14, range: 1000,
  desc: '他高举魂镰，天上裂开一道血口，一道道末劫魔光砸在对手身上，地面被砸出一个个坑；魔躯时接着「末劫狂想」——以他为中心炸开一连串冲天的大爆。（夜无赦·半魔 / 魔躯）',
  seq: (_c, f) => (f === 'demon' ? ['tianqing', 'kuangxiang'] : ['tianqing']),
  enter(c, a) { const u = userPos(c), F = F3(c); if (a === 'tianqing') { F.column(u.x, u.y, { h: 3000, r: 60, dur: 0.3, col: [1.6, 0.3, 0.3] }); sfx('yws_tele', u.x, u.y); } else { F.soul(u.x, u.y, 200, { r: 600, dur: 0.4, n: 20, col: C_EMBER }); } },
  frame(c, a, lt) { if (a === 'tianqing' && lt < 0.3) scr(c, { dim: 0.3 * lt / 0.3 }); if (a === 'tianqing' && lt >= 0.3 && lt < 1.2) scr(c, { dim: 0.45, black: 0.35 });   // r19：光柱落下时场景压暗三四成（他和对手留色）——不动镜头，靠明暗把他的剪影和紫黑光柱托出来
    if (a === 'kuangxiang') scr(c, { wash: [0.6, 0.05, 0.05, lt < 0.4 ? 0.2 : 0.4] }); },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), q = tgPos(c);
    if (k.anim === 'tianqing') {
      const off = k.i === 0 ? 0 : (hr(c, 30, k.i) - 0.5) * 260, x = q.x - d.uy * off, y = q.y + d.ux * off;
      // r19：落点的光柱改成紫黑为主（立体的烟柱，普通混合压暗）、只带一道血红的边；芯里一线细的暗红光，去掉火爆（原来一根粗的品红光柱 + 火团，偏红偏亮）
      F.pillar(x, y, { h: 3200, r: 105, dur: 0.55, col: [1.5, 0.06, 0.08] }); F.column(x, y, { h: 3200, r: 20, dur: 0.3, col: [0.55, 0.12, 1.0] }); F.blast(x, y, 1.1, 'void', { r: 180 }); F.ring(x, y, 8, 0, 0, 1, { r: 380, power: 0.9, col: C_BLOOD });
      F.dent(x, y, 120, 40, 6); F.debris(x, y, { n: 14, r: 120, power: 1.2 }); shake(c, 0.8); sfx('yws_heavy', x, y);
      try { c.B.g.combat.wreck.pit(x, y, 100, 2); } catch { /* 破坏系统出错不拖垮出招 */ }
      if (near(c, x, y, 220)) { strike(c, 0.04, 1.6, 'yws_tianqing', { power: 1.3, uz: -0.7, stop: 0.06 }); if (k.last) c.up(c.target, 1); }
      return;
    }
    // 末劫狂想：身上鼓起一团深蓝紫的魔气球（视频 205.88），一下比一下大，最后炸开
    F.halo(u.x, u.y, 200, { r: 260 + k.i * 70, dur: 0.3, col: [0.5, 0.3, 1.8] }); F.blast(u.x, u.y, 1.2 + k.i * 0.2, 'void', { z: 200, r: 200 + k.i * 50 }); F.ring(u.x, u.y, 200, Math.cos(k.i), Math.sin(k.i), 0.4, { r: 320 + k.i * 60, power: 1, col: [1.6, 0.7, 0.2], dur: 0.25 });
    // 末劫狂想：身周连环大爆（越往后越大），最后两下全屏变色、冲天
    const R = 260 + k.i * 90, a = ang(c) + k.i * 1.4, x = u.x + Math.cos(a) * (k.i ? 220 : 0), y = u.y + Math.sin(a) * (k.i ? 170 : 0);
    F.blast(x, y, 1.4 + k.i * 0.25, k.i % 2 ? 'fire' : 'void', { z: 100, r: R * 0.7 }); F.ring(x, y, 8, 0, 0, 1, { r: R * 1.8, power: 1.2, col: k.i % 2 ? C_HELL : C_BLOOD });
    if (k.i >= 3) { F.column(u.x, u.y, { h: 3200, r: 200, dur: 0.5, col: [1.6, 0.4, 0.2] }); F.ripple(u.x, u.y, { amp: 24, reach: 2000 }); white(c, 1); }
    shake(c, 0.8 + k.i * 0.15); sfx(k.last ? 'yws_big' : 'yws_heavy', x, y);
    if (aoe(c, u.x, u.y, 420 + k.i * 40, k.last ? 0.06 : 0.025, 1.6, 'yws_kuangxiang', { power: 1.3, stop: 0.05 }) && k.last) awayLaunch(c, u.x, u.y, 700, 700);
  },
});

// ==================================================================== §19 末劫陷阱：钻进地里（0.3–0.5 息）、在地下追到对手脚下，接连炸开四下（1.3–1.75 息），破土而出
const XIANJING = ywsMove({
  id: 'yws_xianjing', name: '末劫陷阱', glyph: '阱', color: '220,60,40', cd: 12, range: 900,
  desc: '他一头钻进地里，地面一道血光朝你脚下窜过来——你脚下接连炸开四下，最后他破土而出。（夜无赦）',
  seq: () => ['xianjing'],
  enter(c) { const u = userPos(c), F = F3(c); F.flare(u.x, u.y, 120, { r: 140, mode: 'star', col: [2, 1.2, 1] }); F.scorch(u.x, u.y, 160, { dur: 3 }); },
  frame(c, _a, lt) {
    const u = userPos(c), F = F3(c);
    if (at(c, 'sink', 0.2)) { F.debris(u.x, u.y, { n: 16, r: 120, power: 1.2 }); F.dust(u.x, u.y, { r: 260 }); sfx('yws_spike', u.x, u.y); }
    if (lt > 0.4 && lt < 1.3) { const j = every(c, 'tr', 0.4, 1.3, 0.08); if (j >= 0) { F.scorch(u.x, u.y, 70, { dur: 1.5 }); F.debris(u.x, u.y, { n: 3, r: 40, power: 0.6 }); } if (at(c, 'mark', 0.75)) { const q = tgPos(c); F.ring(q.x, q.y, 6, 0, 0, 1, { r: 360, power: 0.7, col: C_BLOOD }); F.scorch(q.x, q.y, 260, { dur: 2 }); } }
    if (at(c, 'up', 1.95)) { F.blast(u.x, u.y, 1, 'ink', { r: 160 }); F.debris(u.x, u.y, { n: 20, r: 160, power: 1.4, up: 1.4 }); sfx('yws_heavy', u.x, u.y); }
  },
  hit(c, k) {
    const u = userPos(c), F = F3(c), a = ang(c) + k.i * 1.7, x = u.x + Math.cos(a) * (k.i ? 120 : 0), y = u.y + Math.sin(a) * (k.i ? 90 : 0);
    F.blast(x, y, 1.1, 'void', { r: 180 }); F.ring(x, y, 6, 0, 0, 1, { r: 360, power: 1, col: C_BLOOD });
    for (let i = 0; i < 4; i++) { const b = i / 4 * TAU + a; F.spike(x + Math.cos(b) * 60, y + Math.sin(b) * 50, { h: 300, r: 46, tilt: 0.5, dir: b, dur: 0.8 }); }
    shake(c, 0.6); sfx('yws_spike', x, y);
    if (near(c, x, y, 240)) { strike(c, k.last ? 0.04 : 0.025, 1.2, 'yws_xianjing', { power: 1.1, uz: 1, stop: 0.04 }); if (k.last && c.target) c.up(c.target, 1); }
  },
});

// ==================================================================== §20 灭世重击：人 / 半魔 一闪冲 300 穿刺（200）、回手一刺（400）；魔躯 灭世重击（五下：冲、爪、三下魔焰爆）或 狂怒撕裂（冲上去三爪）→ 灭世冲击（三圈冲击波往前犁）
const MIESHI = ywsMove({
  id: 'yws_mieshi', name: '灭世重击', glyph: '灭', color: '255,40,60', cd: 14, range: 520,
  desc: '全身一黑一亮，一闪就冲到对手身上一记贯穿；魔躯时冲上去双爪狂撕，再一爪砸地，灭世冲击一圈圈往前犁出去。（夜无赦）',
  seq: (c, f) => (f === 'demon' ? (hr(c, 40) < 0.5 ? ['mieshi'] : ['kuangnu', 'mieshi_ring']) : ['mieshi']),
  enter(c, a) { const Y = ywsOf(c.B); if (a === 'mieshi_ring' && Y && isBoss(c)) Y.tele('灭世冲击', 0.4); },
  frame(c, a, lt) {
    const u = userPos(c), F = F3(c);
    if ((a === 'mieshi' && lt < 0.2) || (a === 'kuangnu' && lt < 0.3) || (a === 'mieshi_ring' && lt < 0.4)) { const j = every(c, 'g' + a, 0, 0.4, 0.1); if (j >= 0) F.soul(u.x, u.y, 200, { r: 400, dur: 0.3, n: 8, col: C_BLOOD }); scr(c, { dim: 0.3 }); }
    if (a === 'mieshi_ring') scr(c, { wash: [0.6, 0.04, 0.05, 0.3] });
  },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), o = origin(c);
    if (k.anim === 'mieshi') {
      if (k.i === 0) {
        // 一闪冲 300（360）：残影、穿刺
        for (let i = 1; i <= 3; i++) ghost(c, o.x + (u.x - o.x) * i / 4, o.y + (u.y - o.y) * i / 4, 0, d.ux * 30, d.uy * 30, 0.3, '220,40,60');
        F.smear(o.x, o.y, 120, u.x + d.ux * 160, u.y + d.uy * 160, 120, { w: 120, col: C_MAGENTA, dur: 0.4 }); F.smear(o.x, o.y, 140, u.x + d.ux * 200, u.y + d.uy * 200, 140, { w: 26, col: [2.2, 1.9, 2.2], dur: 0.3 });
        for (let i = 0; i < 4; i++) { const k2 = i / 3; F.blast(o.x + (u.x - o.x) * k2, o.y + (u.y - o.y) * k2, 0.9, 'ink', { z: 100, r: 150, delay: i * 0.03 }); F.dust(o.x + (u.x - o.x) * k2, o.y + (u.y - o.y) * k2, { r: 200, power: 0.9, col: [0.85, 0.75, 0.6] }); }
        white(c, 1); sfx('yws_slash', u.x, u.y);
        if (inStrip(c, o.x, o.y, -20, Math.hypot(u.x - o.x, u.y - o.y) + 160, 120)) strike(c, 0.05, 1.6, 'yws_mieshi', { power: 1.3, stop: 0.07 });
        return;
      }
      if (k.form !== 'demon' || k.i === 1) {
        const x = u.x + d.ux * 160, y = u.y + d.uy * 160;
        F.sonic(u.x + d.ux * 60, u.y + d.uy * 60, 120, d.ux, d.uy, 0, { power: 1.2, col: C_BLOOD }); F.blast(x, y, 1.1, 'void', { z: 110, r: 160 }); shake(c, 0.7); sfx('yws_heavy', x, y);
        if (inStrip(c, u.x, u.y, 0, 300, 140)) { strike(c, 0.055, 1.8, 'yws_mieshi', { power: 1.4, stop: 0.08 }); if (c.target) c.launch(c.target, d.ux, d.uy, 400, 300); }
        return;
      }
      // 魔躯后三下：魔焰在爪上炸开（越来越大）
      const x = u.x + d.ux * 180, y = u.y + d.uy * 180;
      F.blast(x, y, 1.2 + (k.i - 2) * 0.4, k.i % 2 ? 'fire' : 'void', { z: 140, r: 200 + (k.i - 2) * 60 }); F.ring(x, y, 140, d.ux, d.uy, 0.3, { r: 400 + (k.i - 2) * 160, power: 1.3, col: C_BLOOD });
      if (k.last) { white(c, 2); show(c, { k: 'beam', dur: 0.4, col: '255,60,60' }); F.dent(x, y, 200, 60, 8); F.ripple(x, y, { amp: 20, reach: 1600 }); }
      shake(c, 0.8 + (k.i - 2) * 0.3); sfx(k.last ? 'yws_big' : 'yws_heavy', x, y);
      if (inStrip(c, u.x, u.y, -20, 420, 220)) { strike(c, k.last ? 0.07 : 0.03, 1.6, 'yws_mieshi', { power: 1.5, stop: 0.07 }); if (k.last && c.target) c.launch(c.target, d.ux, d.uy, 600, 900); }
      return;
    }
    if (k.anim === 'kuangnu') {
      if (k.i === 0) ghost(c, o.x, o.y, 0, d.ux * 50, d.uy * 50, 0.3, '200,40,60');
      const q = tgPos(c), s = k.i % 2 ? 1 : -1;
      F.scythe(q.x, q.y, 130, { nx: -d.uy * 0.5, ny: d.ux * 0.5, nz: 0.8 * s, e1: [-d.uy * s, d.ux * s, 0.6], a0: 0, sweep: 2.0, r: 170, w: 44, dur: 0.22, col: k.i % 2 ? C_EMBER : C_BLOOD, power: 1.1 }); sfx('yws_claw', q.x, q.y);
      if (near(c, u.x + d.ux * 150, u.y + d.uy * 150, 260)) strike(c, 0.022, 0.7, 'yws_kuangnu', { stop: 0.03, power: 0.8, sfx: null });
      return;
    }
    // 灭世冲击：三圈冲击波，一圈比一圈远（往前犁出石柱）
    const R = 250 + k.i * 220, x = u.x + d.ux * R, y = u.y + d.uy * R;
    F.ring(u.x + d.ux * 100, u.y + d.uy * 100, 8, 0, 0, 1, { r: R * 1.2, power: 1.4, col: k.i % 2 ? C_MAGENTA : C_BLOOD });
    F.blast(x, y, 1.3, k.i % 2 ? 'fire' : 'void', { r: 180 }); for (const s of [-90, 90]) F.spike(x - d.uy * s, y + d.ux * s, { h: 420 + k.i * 60, r: 60, tilt: 0.4, dir: ang(c) + s * 0.012, dur: 1.2 });
    if (k.i === 0) { F.dent(u.x + d.ux * 100, u.y + d.uy * 100, 200, 60, 8); white(c, 2); show(c, { k: 'beam', dur: 0.5, col: '255,60,60' }); }
    try { c.B.g.combat.wreck.pit(x, y, 90, 2); } catch { /* 破坏系统出错不拖垮出招 */ }
    shake(c, 1); sfx(k.last ? 'yws_big' : 'yws_heavy', x, y);
    if (inStrip(c, u.x, u.y, 0, R + 150, 220)) { strike(c, k.last ? 0.08 : 0.03, 2, 'yws_mieshiring', { power: 1.6, uz: 0.8, stop: 0.08 }); if (k.last && c.target) c.launch(c.target, d.ux, d.uy, 600, 900); }
  },
});

// ==================================================================== §17 魔审 · 犁魂（魔躯）：一闪冲 300 一爪（0）、跃起扑下（125）、按着人往前犁 480（625）、砸进地里（1000）
const MOSHEN2 = ywsMove({
  id: 'yws_moshen2', name: '魔审 · 犁魂', glyph: '犁', color: '230,40,50', cd: 12, range: 520,
  desc: '一闪扑上来一爪，跃起压下去把人按在地上，按着不松往前犁出一道沟，最后连人带地砸进去。（夜无赦·魔躯）',
  seq: () => ['moshen2'],
  frame(c, _a, lt) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (d.held && lt > 0.63 && lt < 1.0) { drag(c, c.target, u.x + d.ux * 120, u.y + d.uy * 120, 0); const j = every(c, 'plow', 0.63, 1.0, 0.06); if (j >= 0) { F.debris(u.x + d.ux * 120, u.y + d.uy * 120, { n: 5, r: 60, power: 0.9, dir: ang(c) + Math.PI, spread: 0.7 }); F.scorch(u.x + d.ux * 120, u.y + d.uy * 120, 80, { dur: 3 }); try { if (j % 2 === 0) c.B.g.combat.wreck.pit(u.x + d.ux * 120, u.y + d.uy * 120, 60, 1); } catch { /* 破坏系统出错不拖垮出招 */ } } }
  },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), o = origin(c), x = u.x + d.ux * 120, y = u.y + d.uy * 120;
    if (k.i === 0) { ghost(c, o.x, o.y, 0, d.ux * 50, d.uy * 50, 0.3, '220,40,50'); F.smear(o.x, o.y, 120, u.x, u.y, 120, { w: 70, col: C_BLOOD, dur: 0.3 }); sfx('yws_claw', x, y); if (inStrip(c, o.x, o.y, 0, 460, 150)) strike(c, 0.03, 1, 'yws_moshen2', { stop: 0.05, power: 1 }); return; }
    if (k.i === 1) { F.scythe(x, y, 160, { nx: -d.uy, ny: d.ux, nz: 0, e1: [0, 0, 1], a0: 0.8, sweep: -2.4, r: 240, w: 70, dur: 0.3, col: C_BLOOD, power: 1.3 }); sfx('yws_slash', x, y); if (near(c, x, y, 300)) { strike(c, 0.03, 1, 'yws_moshen2', { stop: 0.05, power: 1, uz: -0.7 }); d.held = 1; } return; }
    if (k.i === 2) { F.dust(x, y, { r: 300 }); sfx('yws_heavy', x, y); if (d.held && near(c, x, y, 320)) strike(c, 0.03, 1, 'yws_moshen2', { stop: 0.03, power: 0.9 }); return; }
    F.blast(x, y, 1.6, 'void', { r: 240 }); F.ring(x, y, 8, 0, 0, 1, { r: 600, power: 1.4, col: C_BLOOD }); F.dent(x, y, 180, 60, 8); F.debris(x, y, { n: 24, r: 180, power: 1.4 }); white(c, 1); shake(c, 1.1); sfx('yws_big', x, y);
    if (near(c, x, y, 320)) { strike(c, 0.06, 2, 'yws_moshen2', { power: 1.6, uz: -1, stop: 0.1 }); if (c.target) c.up(c.target, 0.8); }
  },
});

let registered = false;
/** 第二批注册（yewushe.ts 的构造里调一次） */
export function registerYws2(Y: Yewushe) {
  void Y;
  if (registered) return; registered = true;
  addYws(LIEHUN, { forms: ['demon'] });
  addYws(MOZHANG, { forms: ['human', 'half', 'demon'] });
  addYws(PINGZHANG, { forms: ['human', 'half', 'demon'] });
  addYws(MOXIAO, { forms: ['human', 'half', 'demon'] });
  addYws(TIANQING, { forms: ['half', 'demon'], far: true });
  addYws(XIANJING, { forms: ['human', 'half', 'demon'], far: true });
  addYws(MIESHI, { forms: ['human', 'half', 'demon'] });
  addYws(MOSHEN2, { forms: ['demon'] });
  void [posOf];
}
