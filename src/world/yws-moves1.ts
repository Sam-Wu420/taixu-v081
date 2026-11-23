// 噬魂魔尊 · 夜无赦 招式第一批：人身、半魔的招（各招的魔躯版也写在这里）+ 两次变身。
// 对时版：每招 = 画面线帧表（world/yewushe-anim.ts）里的一段或几段，时长、出手时刻、位移都按帧表走（yws-core.ts 的 ywsMove）；这里只写每一下出手打什么、放什么特效和声音。
// 规格：docs/夜无赦-参考视频动作分解.md（§ = 规格书第几招）。规矩见 yws-core.ts 文件头：伤害走 strike / aoe，招式路径上不取 Math.random，特效走 fx3d。
import type { MoveCtx } from './brawlmoves';
import type { Yewushe } from './yewushe';
import {
  addYws, at, D, F3, posOf, userPos, near, pose, face, strike, aoe, scr, show, white, say, sfx, ghost, slashArc, hr,
  ywsOf, TAU, clamp, C_VOID, C_BLOOD, C_HELL, C_MAGENTA, drag, origin, tgPos, every, ang, ywsMove, fwd, inStrip, shake } from './yws-core';

const C_WHITE: [number, number, number] = [2.1, 1.9, 2.1];
const isBoss = (c: MoveCtx) => { const Y = ywsOf(c.B); return !!Y && !!c.user && c.user === Y.ent; };
const lift = (c: MoveCtx, who: MoveCtx['target'], k = 1) => { if (who) c.up(who, k); };
const knock = (c: MoveCtx, D0 = 300, vz = 380) => { const d = D(c); if (c.target) c.launch(c.target, d.ux, d.uy, D0, vz); };
/** 读条（大招、变身：首领血条下的蓄力条） */
const tele = (c: MoveCtx, name: string) => { const Y = ywsOf(c.B); if (Y && isBoss(c)) Y.tele(name, D(c).total as number); };

// ==================================================================== §1 堕魂诀（自强化）：人 1.12 息 / 半魔 0.8 息，无出手
const DUOHUN = ywsMove({
  id: 'yws_duohun', name: '堕魂诀', glyph: '堕', color: '160,60,220', cd: 40, range: 3000,
  desc: '半蹲收镰，身周一圈血红的光环往上溢，四周的游魂被他一口吸进身体——之后三十息出手多一成半。（夜无赦）',
  seq: () => ['duohun'],
  start(c) { say(c, '魂来。'); },
  enter(c) { const u = userPos(c), F = F3(c); F.ring(u.x, u.y, 110, D(c).ux, D(c).uy, 0, { r: 110, power: 0.8, col: C_BLOOD, dur: 0.35 }); F.scorch(u.x, u.y, 200, { dur: 4 }); sfx('yws_dark', u.x, u.y); },
  frame(c, _a, lt) {
    const u = userPos(c), F = F3(c), half = D(c).form === 'half', t1 = half ? 0.6 : 0.92;
    if (lt > 0.12 && lt < t1) scr(c, { dim: 0.5 });
    // r17：全屏演出——竖条紫光幕上浮过一张他咆哮的半身特写（视频 6.4–7.1 的人脸）
    if (every(c, 'face', 0.12, 0.15, 0.1) >= 0 && isBoss(c)) show(c, { k: 'img', img: half ? 'yws_b_roar' : 'yws_h_bust', dur: half ? 0.75 : 1.0, col: half ? '220,60,160' : '150,60,230', solid: true });   // r19：人身换成新画的半身特写（怒视镜头），实的紫光幕、入场一顿（p2show.css 的 .p2-img.solid）
    if (at(c, 'soul', 0.15)) { F.soul(u.x, u.y, 110, { r: 520, dur: 0.7, n: 28 }); sfx('yws_soul', u.x, u.y); }
    if (at(c, 'star', half ? 0.25 : 0.3)) { F.flare(u.x, u.y, 260, { r: 160, mode: 'star', col: [1.2, 1.8, 2.2] }); F.halo(u.x, u.y, 130, { r: 220, dur: 0.6, col: C_VOID }); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; F.soul(u.x + Math.cos(a) * 140, u.y + Math.sin(a) * 110, 160, { r: 60, dur: 0.4, n: 2, col: C_BLOOD }); } }
    if (at(c, 'buff', t1)) { const Y = ywsOf(c.B); if (Y && isBoss(c)) { Y.dmgK = 1.15; Y.buffT = 30; } }
  },
  hit() { /* 无出手 */ },
});

// ==================================================================== §2 魂镰三式：撩 → 斩 → 横扫 → 转身斩（4 下，1.7 息）；半魔接空斩 / 落魂锤（§3）；魔躯是魔爪三连（§4，3 下）
const SANSHI = ywsMove({
  id: 'yws_sanshi', name: '魂镰三式', glyph: '镰', color: '170,50,210', cd: 1.2, range: 360,
  desc: '魂镰三式：往上一撩、跨步一劈、平着一扫，再背身往后一挂；半魔时多一式——空斩，或倒提魂镰砸下的落魂锤；魔躯换成魔爪三连。（夜无赦）',
  seq(c, f) { if (f === 'demon') return hr(c, 4) < 0.35 ? ['mo_pugong', 'luohun'] : ['mo_pugong']; if (f === 'half') return ['pugong', hr(c, 4) < 0.5 ? 'kongzhan' : 'luohun']; return ['pugong']; },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), sc = k.sc;
    if (k.anim === 'pugong') {
      const arcs = [{ vertical: true, a0: -2.1, sweep: 2.6, r: 170 }, { vertical: true, a0: 1.1, sweep: -2.6, r: 200, col: C_BLOOD }, { r: 300, w: 80, a0: -0.5, sweep: 2.6 }, { vertical: true, a0: 2.6, sweep: 2.4, r: 180, dir: ang(c) + Math.PI, col: C_BLOOD }];
      slashArc(c, arcs[k.i]); sfx('yws_slash', u.x, u.y);
      const ok = k.i === 2 ? inStrip(c, u.x, u.y, 0, 300 * sc, 80 * sc) : k.i === 3 ? near(c, u.x, u.y, 170 * sc) : inStrip(c, u.x, u.y, -20, (k.i ? 220 : 180) * sc, 120 * sc);
      if (ok) { strike(c, [0.035, 0.045, 0.05, 0.055][k.i], [0.9, 1.1, 1.2, 1.4][k.i], 'yws_sanshi', { power: 0.9 + k.i * 0.15, stop: 0.05 }); if (k.i === 0) lift(c, c.target, 0.5); if (k.i === 3) knock(c, 260, 360); }
      if (k.i === 3) F.ring(u.x, u.y, 8, 0, 0, 1, { r: 260, power: 0.7, col: C_VOID, dur: 0.3 });
    } else if (k.anim === 'kongzhan') {
      // 一闪冲出 320，半空两刀
      slashArc(c, { vertical: true, a0: 1.2, sweep: -3, r: 230, w: 90, z: 160, col: k.i ? C_BLOOD : C_VOID, power: 1.3 }); sfx('yws_slash', u.x, u.y);
      if (k.i === 0) { const o = origin(c); F.smear(o.x, o.y, 140, u.x, u.y, 140, { w: 50, col: C_BLOOD, dur: 0.3 }); }
      if (inStrip(c, u.x - d.ux * 340, u.y - d.uy * 340, 0, 560, 90)) strike(c, 0.04, 1.3, 'yws_kongzhan', { power: 1.1, stop: 0.05 });
    } else if (k.anim === 'luohun') {
      const x = u.x + d.ux * 80, y = u.y + d.uy * 80, R = (k.form === 'demon' ? 300 : 260);
      F.blast(x, y, 1.2 * sc, 'void', { r: 200 * sc }); F.ring(x, y, 8, 0, 0, 1, { r: R * 1.4, power: 1.1, col: C_BLOOD }); F.debris(x, y, { n: 18, r: 140, power: 1.2 }); F.dust(x, y, { r: R * 1.5 });
      F.soul(x, y, 60, { r: 240, dur: 0.5, n: 10 }); F.dent(x, y, R * 0.5, 30, 5); shake(c, 0.7); sfx('yws_heavy', x, y);
      try { c.B.g.combat.wreck.pit(x, y, 90, 2); } catch { /* 破坏系统出错不拖垮出招 */ }
      if (aoe(c, x, y, R * sc, 0.07, 1.8, 'yws_luohun', { power: 1.3, stop: 0.06 })) lift(c, c.target, 0.9);
    } else {
      // 魔爪三连：爪 → 上撩 → 冲上去横斩
      const z = 150, fx = u.x + d.ux * 150, fy = u.y + d.uy * 150;
      F.scythe(fx, fy, z, { nx: -d.uy * 0.4, ny: d.ux * 0.4, nz: k.i === 1 ? 0 : 1, e1: [-d.ux, -d.uy, k.i === 1 ? -1 : 0], a0: 0, sweep: 2.2, r: 220 * sc, w: 70, dur: 0.3, col: k.i === 2 ? C_HELL : C_BLOOD, power: 1.3 });
      sfx('yws_claw', fx, fy);
      if (inStrip(c, u.x, u.y, 0, (k.i === 2 ? 420 : 280) * Math.sqrt(sc), 140)) { strike(c, 0.05, 1.4, 'yws_mopugong', { power: 1.2, stop: 0.05 }); if (k.i === 1) lift(c, c.target, 0.8); if (k.i === 2) knock(c, 360, 300); }
    }
  },
});

// ==================================================================== §3 魔气入体：人 → 半魔（1.27 息；70 毫秒推开、770 毫秒炸开 = 换半魔）
const RUTI = ywsMove({
  id: 'yws_ruti', name: '魔气入体', glyph: '魔', color: '200,40,80', cd: 1, range: 4000,
  desc: '魂镰插地，镰上的魔焰顺着手臂爬上半边身子——半边脸裂开暗红的纹，眼里烧起血光：半魔化。',
  seq: () => ['moqi'],
  start(c) { say(c, '……有点意思。', '#ff8aa0'); sfx('yws_morph', userPos(c).x, userPos(c).y); tele(c, '魔气入体'); },
  frame(c, _a, lt) {
    const u = userPos(c), F = F3(c);
    if (lt < 0.77) { F.aura('yws', u.x, u.y, u.z, 0.3 + lt * 1.4); scr(c, { dim: 0.35 * clamp(lt / 0.4, 0, 1) }); }
    if (at(c, 'ten', 0.2)) { F.soul(u.x, u.y, 120, { r: 600, dur: 0.9, n: 30 }); for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; F.tendril(u.x + Math.cos(a) * 260, u.y + Math.sin(a) * 200, 0, u.x, u.y, 140, { w: 26, dur: 0.6, n: 12 }); } }
  },
  hit(c, k) {
    const u = userPos(c), F = F3(c), d = D(c);
    if (k.i === 0) { F.ring(u.x, u.y, 8, 0, 0, 1, { r: 260, power: 0.7, col: C_VOID }); if (aoe(c, u.x, u.y, 200, 0.015, 0, 'yws_ruti', { power: 0.6, stop: 0 })) knock(c, 160, 160); return; }
    const Y = ywsOf(c.B); if (Y && isBoss(c)) Y.setForm('half');
    white(c, 1); F.blast(u.x, u.y, 1.2, 'void', { z: 100, r: 220 }); F.ring(u.x, u.y, 10, 0, 0, 1, { r: 520, power: 1.2, col: C_BLOOD, dur: 0.45 });
    F.warp(u.x, u.y, 120, { r: 600, power: 1, dur: 0.6 }); shake(c, 0.7); sfx('yws_roar', u.x, u.y); scr(c, { wash: [0.5, 0.03, 0.1, 0.45] });
    if (aoe(c, u.x, u.y, 360, 0.03, 0, 'yws_ruti', { power: 0.8, stop: 0 }) && c.target) c.launch(c.target, d.ux, d.uy, 380, 300);
  },
});

// ==================================================================== §4 天魔降身 · 末劫：半魔 → 魔躯（2.9 息；1.4 息显形 = 变身冲击波，身周 450 击飞），之后全程霸体
const JIANGSHEN = ywsMove({
  id: 'yws_jiangshen', name: '天魔降身 · 末劫', glyph: '劫', color: '255,40,60', cd: 1, range: 6000,
  desc: '魂镰举过头顶，天上裂开一道血口，一道魔光把他整个吞没——天魔真身破茧而出，数丈高，双角、魔翼，一声咆哮震出一圈冲击波。从此全程霸体。',
  seq: () => ['tianmo'],
  start(c) { say(c, '天魔……降身！', '#ff5060'); sfx('yws_morph', userPos(c).x, userPos(c).y); tele(c, '天魔降身 · 末劫'); },
  frame(c, _a, lt) {
    const u = userPos(c), F = F3(c), d = D(c);
    if (lt < 1.4) { scr(c, { dim: 0.55 * clamp(lt / 0.6, 0, 1), wash: [0.35, 0.02, 0.06, 0.4 * clamp(lt / 0.8, 0, 1)] }); F.aura('yws', u.x, u.y, u.z, 0.6 + lt * 0.8); }
    if (at(c, 'col', 0.2)) { F.column(u.x, u.y, { h: 5000, r: 160, dur: 1.3, col: [1.4, 0.15, 0.25] }); F.soul(u.x, u.y, 160, { r: 900, dur: 1.2, n: 40 }); show(c, { k: 'lines', dur: 1.2, col: '255,60,80' }); }
    if (at(c, 'gate', 0.5)) F.gate(u.x - d.ux * 150, u.y - d.uy * 150, { r: 150, dur: 1.3, dir: ang(c) });
    if (lt > 1.4 && lt < 2.4) F.wing('yws-wing', u.x, u.y, u.z + 160, Math.atan2(d.ux, d.uy), clamp((lt - 1.4) * 2, 0, 1.3), 420);
  },
  hit(c) {
    const u = userPos(c), F = F3(c), Y = ywsOf(c.B);
    if (Y && isBoss(c)) Y.setForm('demon');
    // r17：显形这一刻不洗白——压暗留色、大字直接砸，不放终结技的白闪 / 黑白闪
    white(c, 0); show(c, { k: 'word', word: '劫', side: 'r', dur: 0.9 }); scr(c, { dim: 0.5 });
    F.blast(u.x, u.y, 2.2, 'void', { z: 140, r: 320 }); F.ring(u.x, u.y, 12, 0, 0, 1, { r: 1200, power: 1.6, col: C_BLOOD, dur: 0.6 }); F.ring(u.x, u.y, 160, 0, 0, 1, { r: 900, power: 1.2, col: C_VOID, dur: 0.5, delay: 0.08 });
    F.warp(u.x, u.y, 150, { r: 1100, power: 1.6, dur: 0.8 }); F.dust(u.x, u.y, { r: 1100, power: 1.6 }); F.debris(u.x, u.y, { n: 30, r: 260, power: 1.6 }); F.dent(u.x, u.y, 260, 60, 4); F.ripple(u.x, u.y, { amp: 26, reach: 2600 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; F.spike(u.x + Math.cos(a) * 420, u.y + Math.sin(a) * 320, { h: 420, r: 60, dur: 2.2, tilt: 0.25, dir: a, delay: 0.05 + i * 0.03 }); }
    shake(c, 1.2); sfx('yws_big', u.x, u.y); sfx('yws_roar', u.x, u.y); scr(c, { wash: [0.4, 0.03, 0.08, 0.35] });
    if (aoe(c, u.x, u.y, 450, 0.06, 0, 'yws_jiangshen', { power: 1.5, stop: 0.1 }) && c.target) { const q = posOf(c, c.target); if (q) { const L = Math.hypot(q.x - u.x, q.y - u.y) || 1; c.launch(c.target, (q.x - u.x) / L, (q.y - u.y) / L, 900, 600); } }
  },
});

// ==================================================================== §6 摄魂魔爪：人身 空间裂缝里伸出一只魔手，抓住（330）、握爆（600）；魔躯 扑上去五连抓（70–370）
const MOZHUA = ywsMove({
  id: 'yws_mozhua', name: '摄魂魔爪', glyph: '爪', color: '170,60,220', cd: 7, range: 560,
  desc: '他抬手，身前撕开一道品红的空间裂缝，一只黑紫的巨手从裂缝里横冲出去扣住对手、一握炸开；魔躯时整个人扑上去，双爪连抓五下。（夜无赦）',
  seq: () => ['shehun'],
  frame(c, _a, lt) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (d.form === 'demon') return;
    if (at(c, 'star', 0.1)) F.flare(u.x, u.y, 260, { r: 80, mode: 'star', col: [1.2, 1.8, 2.2] });
    if (at(c, 'rift', 0.2)) { const x = u.x + d.ux * 90, y = u.y + d.uy * 90; F.ring(x, y, 120, d.ux, d.uy, 0, { r: 110, power: 0.6, col: C_MAGENTA, dur: 0.3 }); }
    if (at(c, 'hand', 0.2)) {
      // 魔手沿身前 120–520 的长条冲出去，打到第一个人停住
      const q = tgPos(c), hit = inStrip(c, u.x, u.y, 120, 520 * Math.sqrt(d.sc), 140), L = hit ? Math.hypot(q.x - u.x, q.y - u.y) : 520;
      d.g = hit ? 1 : 0; const ex = u.x + d.ux * L, ey = u.y + d.uy * L; d.hx = ex; d.hy = ey;
      F.tendril(u.x + d.ux * 90, u.y + d.uy * 90, 130, ex, ey, 110, { w: 90, dur: 0.75, n: 6, wave: 0.3, col: C_MAGENTA });
      F.halo(ex, ey, 110, { r: 120, dur: 0.4, col: C_VOID }); sfx('yws_claw', ex, ey);
    }
    if (d.g && lt > 0.33 && lt < 0.6) { const q = tgPos(c); drag(c, c.target, q.x - d.ux * 80 * (1 / 16), q.y - d.uy * 80 * (1 / 16)); }
  },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (k.form === 'demon') {
      const fx = u.x + d.ux * 140, fy = u.y + d.uy * 140, s = k.i % 2 ? 1 : -1;
      F.scythe(fx, fy, 150, { nx: -d.uy * 0.3, ny: d.ux * 0.3, nz: s, e1: [-d.uy * s, d.ux * s, 0.4], a0: 0, sweep: 2, r: 200, w: 50, dur: 0.22, col: k.i % 2 ? C_BLOOD : C_HELL, power: 1.2 });
      F.ring(fx, fy, 130, d.ux, d.uy, 0, { r: 120, power: 0.5, col: [0.6, 0.8, 1.6], dur: 0.2 }); sfx('yws_claw', fx, fy);
      if (k.i === 0) { const o = origin(c); ghost(c, o.x, o.y, 0, d.ux * 40, d.uy * 40, 0.3, '200,40,60'); F.dust(o.x, o.y, { r: 200 }); }
      if (inStrip(c, u.x, u.y, -20, 300 * Math.sqrt(d.sc), 160)) { strike(c, 0.022, 0.7, 'yws_mozhua', { stop: 0.03, power: 0.8, sfx: k.i % 2 ? null : 'yws_hit' }); if (k.last) { knock(c, 300, 340); shake(c, 0.6); } }
      return;
    }
    const x = (d.hx as number) ?? u.x, y = (d.hy as number) ?? u.y;
    if (k.i === 0) { if (d.g) { strike(c, 0.03, 1.1, 'yws_mozhua', { stop: 0.05, power: 0.9 }); F.ring(x, y, 110, d.ux, d.uy, 0.3, { r: 120, power: 0.6, col: [0.6, 0.8, 1.6] }); } return; }
    F.blast(x, y, 1.0 * d.sc, 'void', { z: 110, r: 160 }); F.flare(x, y, 110, { r: 200, mode: 'star', col: [1.8, 0.6, 1.6] });
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; F.jet(x, y, 110, Math.cos(a), Math.sin(a), { len: 260, power: 0.6, spread: 0.1, pal: 'void' }); }
    shake(c, 0.5); sfx('yws_heavy', x, y);
    if (d.g && near(c, x, y, 220)) { strike(c, 0.045, 1.6, 'yws_mozhua', { power: 1.3, stop: 0.07 }); knock(c, 160, 420); }
  },
});

// ==================================================================== §7 血镰乱舞：人身 原地十下（190–1360）；魔躯 五下闪冲 + 最后一道延到 900 的光带
const XUELIAN = ywsMove({
  id: 'yws_xuelian', name: '血镰乱舞', glyph: '舞', color: '200,40,70', cd: 8, range: 380,
  desc: '魂镰抡圆了转起来，紫黑、血红的刀光一层叠一层把身前削成一片，转完一记上撩把人挑上天；魔躯时连着几下闪冲，最后一爪拉出一道长长的光带。（夜无赦）',
  seq: () => ['xuelian'],
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), sc = k.sc;
    if (k.form === 'demon') {
      const L = k.last ? 900 : 420;
      F.scythe(u.x + d.ux * 120, u.y + d.uy * 120, 140, { nx: -d.uy * 0.3, ny: d.ux * 0.3, nz: 1, e1: [-d.ux, -d.uy, 0], a0: -0.3, sweep: 2.6, r: 260, w: 70, dur: 0.3, col: k.i % 2 ? C_MAGENTA : C_BLOOD, power: 1.3 });
      if (k.last) { F.smear(u.x, u.y, 130, u.x + d.ux * L, u.y + d.uy * L, 130, { w: 110, col: C_MAGENTA, dur: 0.45 }); white(c, 1); shake(c, 0.7); }
      ghost(c, u.x, u.y, 0, d.ux * 30, d.uy * 30, 0.25, '200,60,200'); sfx('yws_slash', u.x, u.y);
      if (inStrip(c, u.x, u.y, -40, L, k.last ? 160 : 140)) { strike(c, k.last ? 0.05 : 0.025, 0.8, 'yws_xuelian', { stop: 0.03, power: 0.9 }); if (k.last) knock(c, 400, 400); }
      return;
    }
    const big = k.i >= 8;
    slashArc(c, big ? { vertical: true, a0: k.i === 8 ? 1.2 : -2.2, sweep: k.i === 8 ? -2.8 : 2.8, r: 230, w: 90, col: C_BLOOD, power: 1.3 } : { dir: ang(c) + Math.PI + k.i * 1.3, r: 200, w: 70, sweep: 5.2, a0: -0.2, tilt: k.i % 2 ? 0.4 : -0.35, z: 90 + (k.i % 3) * 25, dur: 0.3, col: k.i % 2 ? C_BLOOD : C_VOID });
    if (k.i % 2 === 0) F.ring(u.x, u.y, 70, 0, 0, 1, { r: 260 * sc, power: 0.6, col: C_VOID, dur: 0.25 });
    if (k.i % 3 === 0) F.soul(u.x, u.y, 100, { r: 300 * sc, dur: 0.4, n: 8 });
    sfx('yws_slash', u.x, u.y);
    // 判定：身前 0–260、身后 0–120 的扁圆
    if (inStrip(c, u.x, u.y, -120, 260 * sc, 160 * sc)) { strike(c, big ? 0.04 : 0.014, big ? 1.2 : 0.5, 'yws_xuelian', { stop: big ? 0.06 : 0.025, power: big ? 1.2 : 0.7, sfx: k.i % 2 ? null : 'yws_hit' }); if (k.last) lift(c, c.target, 1); }
  },
});

// ==================================================================== §9 崩岳魔锤：人身 砸地（150，锤点 120）+ 前方火柱（400，120–300 挑飞）；魔躯 冥狱石林（逐段往前，末了品红爆）
const BENGYUE = ywsMove({
  id: 'yws_bengyue', name: '崩岳魔锤', glyph: '崩', color: '190,60,90', cd: 9, range: 560, learn: { realm: 3, mp: 0.12 },
  desc: '倒提魂镰把镰背当锤砸进地里——锤点炸开，前方的地里窜起一道冥火石柱把人挑飞；魔躯时一路砸出整片冥狱石林。（夜无赦亲传）',
  seq: () => ['bengyue'],
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), sc = k.sc;
    if (k.form !== 'demon') {
      if (k.i === 0) {
        const x = u.x + d.ux * 60, y = u.y + d.uy * 60;
        F.blast(x, y, 1.1, 'void', { r: 160 }); F.ring(x, y, 8, 0, 0, 1, { r: 380, power: 1.1, col: C_BLOOD }); F.dent(x, y, 110, 30, 6); F.debris(x, y, { n: 16, r: 120, power: 1.1 }); F.dust(x, y, { r: 300 });
        shake(c, 0.8); sfx('yws_heavy', x, y);
        try { c.B.g.combat.wreck.pit(x, y, 90, 2); } catch { /* 破坏系统出错不拖垮出招 */ }
        if (near(c, x, y, 140)) strike(c, 0.04, 1.6, 'yws_bengyue', { power: 1.2, uz: -0.5, stop: 0.06 });
      } else {
        for (let i = 0; i < 4; i++) { const x = u.x + d.ux * (140 + i * 55), y = u.y + d.uy * (140 + i * 55); F.spike(x, y, { h: 200 + i * 40, r: 44, tilt: 0.3, dir: ang(c), dur: 0.9, delay: i * 0.03 }); }
        const fx = u.x + d.ux * 210, fy = u.y + d.uy * 210; F.inferno(fx, fy, { r: 120, dur: 0.6, power: 0.9 }); F.column(fx, fy, { h: 900, r: 70, dur: 0.4, col: [1.6, 0.3, 0.3] });
        sfx('yws_spike', fx, fy);
        if (inStrip(c, u.x, u.y, 100, 320, 120)) { strike(c, 0.05, 1.8, 'yws_bengyue', { power: 1.3, uz: 1, stop: 0.06 }); lift(c, c.target, 1); }
      }
      return;
    }
    // 魔躯·冥狱石林（r17 照视频 95.9–97.5）：一爪按地，地裂往前窜，一簇簇紫色晶柱从近到远、由小变大斜着刺出地面，带紫雾；血红只作点缀
    if (k.i === 0) { const x = u.x + d.ux * 80, y = u.y + d.uy * 80; F.blast(x, y, 1.3, 'void', { r: 220 }); F.ring(x, y, 8, 0, 0, 1, { r: 520, power: 1.2, col: C_VOID }); F.dent(x, y, 160, 40, 8); F.ripple(x, y, { amp: 14, reach: 1200 }); shake(c, 1); sfx('yws_heavy', x, y); }
    if (k.i < 5) {
      const R = 120 + 150 * (k.i + 0.5), x = u.x + d.ux * R, y = u.y + d.uy * R, big = 0.55 + k.i * 0.22;
      F.scorch(x - d.ux * 75, y - d.uy * 75, 110, { dur: 3 }); F.scorch(x, y, 130, { dur: 3 });
      for (let j = 0; j < 4; j++) { const s2 = (hr(c, 30 + k.i, j) - 0.5) * 220, fw = (hr(c, 40 + k.i, j) - 0.5) * 80; F.spike(x - d.uy * s2 + d.ux * fw, y + d.ux * s2 + d.uy * fw, { h: (260 + hr(c, 50 + k.i, j) * 160) * big * 1.6, r: (40 + hr(c, 60 + k.i, j) * 30) * big, tilt: 0.25 + hr(c, 70 + k.i, j) * 0.25, dir: ang(c) + (hr(c, 80 + k.i, j) - 0.5) * 0.8, dur: 1.5, delay: j * 0.025, col: j === 3 && k.i % 2 ? [1.6, 0.25, 0.4] : undefined }); }
      F.dust(x, y, { r: 300 * big, power: 0.9, col: [0.45, 0.2, 0.7] }); F.soul(x, y, 80, { r: 200 * big, dur: 0.5, n: 6, col: [0.9, 0.4, 1.6] }); F.debris(x, y, { n: 5, r: 60 }); sfx('yws_spike', x, y);
      if (inStrip(c, u.x, u.y, R - 90, R + 90, 130 * Math.sqrt(sc))) strike(c, 0.025, 0.9, 'yws_shilin', { power: 1, stop: 0.03, uz: 0.5 });
      return;
    }
    for (let i = 0; i < 5; i++) { const R = 120 + i * 140; F.blast(u.x + d.ux * R, u.y + d.uy * R, 1.2, 'void', { r: 180, delay: i * 0.03 }); }
    F.smear(u.x, u.y, 80, u.x + d.ux * 900, u.y + d.uy * 900, 80, { w: 260, col: [1.4, 0.4, 2.0], dur: 0.4 }); white(c, 0); shake(c, 1.1); sfx('yws_big', u.x, u.y);
    if (inStrip(c, u.x, u.y, 80, 720, 130)) { strike(c, 0.06, 2, 'yws_shilin', { power: 1.6, uz: 1, stop: 0.08 }); lift(c, c.target, 1.3); }
  },
});

// ==================================================================== §10 回旋魂镰：锁链甩出钩人（80）、挂着绞（250）、一拽成白色旋盘飞回（580）；魔躯 竖着的巨大火轮（120、370）
const HUIXUAN = ywsMove({
  id: 'yws_huixuan', name: '回旋魂镰', glyph: '旋', color: '150,70,220', cd: 8, range: 700, learn: { realm: 3, mp: 0.1 },
  desc: '魂镰拴着一条锁链甩出去，钩住对手、挂在人身上绞，一拽——镰化成一面白色旋盘飞回手里，顺手把人拖到跟前；魔躯时甩出去的是一面竖着的巨大火轮。（夜无赦亲传）',
  seq: () => ['huixuan'],
  start(c) { const d = D(c), u = userPos(c), q = tgPos(c), R = d.form === 'demon' ? 640 : 520; d.hook = inStrip(c, u.x, u.y, 0, R + 40, 120) ? 1 : 0; d.ex = d.hook ? q.x : u.x + d.ux * R; d.ey = d.hook ? q.y : u.y + d.uy * R; },
  frame(c, _a, lt) {
    const d = D(c), F = F3(c), demon = d.form === 'demon', u = userPos(c), end = demon ? 0.5 : 0.75;
    if (d.hook && lt < end - 0.1) { const s = tgPos(c); d.ex = s.x; d.ey = s.y; }
    const ex = d.ex as number, ey = d.ey as number;
    if (at(c, 'chain', demon ? 0.05 : 0.08)) { F.tendril(u.x + d.ux * 60, u.y + d.uy * 60, 140, ex, ey, 110, { w: 12, dur: end, n: 30, wave: 0.15, col: [0.6, 0.85, 1.5] }); sfx('yws_wheel', u.x, u.y); }
    const j = every(c, 'sp', demon ? 0.12 : 0.1, end - 0.1, 0.05);
    if (j >= 0) {
      if (demon) { F.scythe(ex, ey, 200, { nx: -d.uy, ny: d.ux, nz: 0, e1: [0, 0, 1], a0: j * 1.3, sweep: 2.8, r: 200, w: 70, dur: 0.16, col: j % 2 ? C_HELL : C_VOID, power: 1.3 }); if (j % 2 === 0) F.ring(ex, ey, 200, -d.uy, d.ux, 0, { r: 220, power: 0.7, col: [1.8, 0.6, 0.2], dur: 0.2 }); }
      else F.scythe(ex, ey, 110, { nx: 0, ny: 0, nz: 1, e1: [Math.cos(j * 1.9), Math.sin(j * 1.9), 0], a0: 0, sweep: 2.4, r: 140, w: 46, dur: 0.18, col: j % 2 ? C_BLOOD : C_VOID });
    }
  },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), ex = d.ex as number, ey = d.ey as number, demon = k.form === 'demon';
    if (!k.last) { F.flare(ex, ey, 110, { r: 120, mode: 'star', col: [1.4, 0.6, 1.6] }); if (d.hook) strike(c, demon ? 0.04 : 0.022, 0.8, 'yws_huixuan', { stop: 0.04, power: 0.9 }); return; }
    // 一拽：旋盘 / 火轮飞回他身前，把人往身前拖 200
    if (demon) { F.blast(u.x, u.y, 1.2, 'fire', { z: 160, r: 160 }); F.flare(u.x, u.y, 160, { r: 200, mode: 'star', col: [2, 1, 1.6] }); white(c, 1); shake(c, 0.5); }
    else F.scythe(ex, ey, 120, { nx: -d.uy, ny: d.ux, nz: 0, e1: [0, 0, 1], a0: 0, sweep: 6.2, r: 110, w: 60, dur: 0.22, col: C_WHITE, power: 1.6 });
    F.smear(ex, ey, 120, u.x + d.ux * 60, u.y + d.uy * 60, 120, { w: demon ? 90 : 60, col: demon ? C_HELL : C_WHITE, dur: 0.25 }); sfx('yws_slash', u.x, u.y);
    if (d.hook) { strike(c, demon ? 0.05 : 0.035, 1.4, 'yws_huixuan', { stop: 0.05, power: 1.1, ux: -d.ux, uy: -d.uy }); const s = tgPos(c), L = Math.hypot(s.x - u.x, s.y - u.y), m = Math.max(0, Math.min(200, L - 150)); drag(c, c.target, s.x - d.ux * m, s.y - d.uy * m); }
  },
});

// ==================================================================== §11 幽冥刺：原地炸出一大朵黑刺（人 320、490 两下，身周 260；魔躯 160、285，身周 380 + 品红冲击环）
const YOUMING = ywsMove({
  id: 'yws_youming', name: '幽冥刺', glyph: '刺', color: '120,50,170', cd: 7, range: 420,
  desc: '身上白红一闪，压低一蹲——以他为中心炸出一大朵黑紫的尖刺，像海胆一样往四面戳出去，打两下；魔躯时刺更大，被刺中的人身上再炸开一圈品红冲击环。（夜无赦）',
  seq: () => ['youming'],
  frame(c) {
    const d = D(c), o = userPos(c), F = F3(c), demon = d.form === 'demon';
    if (!demon && at(c, 'flash', 0.06)) { F.flare(o.x, o.y, 120, { r: 160, mode: 'star', col: [2, 1.6, 1.8] }); F.ring(o.x, o.y, 110, 0, 0, 1, { r: 200, power: 0.6, col: C_BLOOD, dur: 0.2 }); }
    if (at(c, 'crouch', demon ? 0.02 : 0.16)) F.soul(o.x, o.y, 100, { r: demon ? 380 : 260, dur: 0.2, n: 8, col: C_VOID });
  },
  hit(c, k) {
    const d = D(c), o = userPos(c), F = F3(c), demon = k.form === 'demon', R = demon ? 380 : 260;
    if (k.i === 0) {
      const n = demon ? 18 : 16;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + hr(c, 5, i) * 0.2, low = i % 2 === 0; F.spike(o.x + Math.cos(a) * 30, o.y + Math.sin(a) * 24, { h: (low ? R * 1.15 : R * 0.85) * (0.85 + hr(c, 6, i) * 0.3), r: demon ? 46 : 32, tilt: low ? 1.25 : 0.8, dir: a, dur: 0.6, col: [1.5, 0.15, 0.35] }); }
      F.blast(o.x, o.y, 0.8, 'ink', { z: 100, r: 140 }); F.ring(o.x, o.y, 20, 0, 0, 1, { r: R * 1.4, power: 1, col: C_VOID }); shake(c, demon ? 0.8 : 0.5); sfx('yws_spike', o.x, o.y);
    }
    const n = aoe(c, o.x, o.y, R, k.i === 0 ? 0.035 : 0.045, 1.4, 'yws_youming', { stop: 0.05, power: 1, uz: 0.4, sfx: k.i === 0 ? 'yws_hit' : null });
    if (k.last && n) {
      const q = tgPos(c), L = Math.hypot(q.x - o.x, q.y - o.y) || 1;
      if (demon) { F.ring(q.x, q.y, 110, d.ux, d.uy, 0, { r: 280, power: 1.4, col: C_MAGENTA }); F.blast(q.x, q.y, 1, 'void', { z: 110, r: 160 }); sfx('yws_heavy', q.x, q.y); if (c.target) c.launch(c.target, (q.x - o.x) / L, (q.y - o.y) / L, 260, 700); }
      else lift(c, c.target, 0.7);
    }
  },
});

// ==================================================================== §12 劫轮：人身 蜷成一只卍字火轮往前碾 520（6 下，每 250 毫秒）；魔躯 死亡打击（压黑、穿身两下）→ 接劫光（三段光束）或裂影杀（吸人、穿身、八段斜切）
const JIELUN = ywsMove({
  id: 'yws_jielun', name: '劫轮', glyph: '轮', color: '190,50,200', cd: 10, range: 600, learn: { realm: 3, mp: 0.14 },
  desc: '他整个人蜷成一只血红紫黑的卍字火轮，往前一路碾过去，把人推着走、一下一下地绞；魔躯时化成「死亡打击」穿身而过，再接一记劫光或裂影杀。（夜无赦亲传）',
  seq: (c, f) => (f === 'demon' ? ['jielun', hr(c, 12) < 0.5 ? 'jieguang' : 'lieying'] : ['jielun']),
  enter(c, a) {
    const u = userPos(c), F = F3(c), d = D(c);
    if (a === 'jielun' && d.form === 'demon') { scr(c, { black: 0.9 }); sfx('yws_tele', u.x, u.y); }
    if (a === 'jieguang') { F.halo(u.x, u.y, 380, { r: 120, dur: 0.4, col: C_VOID }); sfx('yws_tele', u.x, u.y); }
    if (a === 'lieying') sfx('yws_dark', u.x, u.y);
  },
  frame(c, a, lt) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (a === 'jielun' && d.form !== 'demon') {
      // 火轮：竖着的卍字轮（三瓣旋臂）、身后拖白色尘浪
      const j = every(c, 'wh', 0.0, 1.62, 0.05);
      if (j >= 0) {
        for (let b = 0; b < 3; b++) { const a0 = j * 1.25 + b * TAU / 3; F.scythe(u.x, u.y, 150, { nx: -d.uy, ny: d.ux, nz: 0, e1: [0, 0, 1], a0, sweep: 1.9, r: 150, w: 90, dur: 0.14, col: b === 0 ? [2.2, 0.8, 0.25] : b === 1 ? C_BLOOD : C_HELL, power: 1.8 }); F.scythe(u.x, u.y, 150, { nx: -d.uy, ny: d.ux, nz: 0, e1: [0, 0, 1], a0: a0 + 0.3, sweep: 1.2, r: 175, w: 22, dur: 0.1, col: C_WHITE, power: 2 }); }
        if (j % 3 === 0) { F.flare(u.x, u.y, 150, { r: 90, mode: 'star', col: [2.2, 2, 1.8] }); F.ring(u.x, u.y, 150, -d.uy, d.ux, 0, { r: 230, power: 1, col: [2, 0.6, 0.2], dur: 0.2 }); F.dust(u.x - d.ux * 140, u.y - d.uy * 140, { r: 260, power: 1, col: [0.95, 0.9, 0.85] }); F.debris(u.x, u.y, { n: 4, r: 60, hot: true, dir: ang(c) + Math.PI, spread: 0.6 }); }
      }
      if (c.target && lt > 0.12 && lt < 1.62) { const q = tgPos(c); if (inStrip(c, u.x, u.y, -40, 200, 150)) drag(c, c.target, u.x + d.ux * 150 + (q.x - u.x - d.ux * ((q.x - u.x) * d.ux + (q.y - u.y) * d.uy)) * 0.5, u.y + d.uy * 150 + (q.y - u.y - d.uy * ((q.x - u.x) * d.ux + (q.y - u.y) * d.uy)) * 0.5); }
      if (at(c, 'pop', 1.62)) { F.debris(u.x, u.y, { n: 14, r: 100, hot: true }); F.flare(u.x, u.y, 110, { r: 140, mode: 'star', col: [1.8, 0.8, 0.6] }); }
    }
    if (a === 'jielun' && d.form === 'demon' && lt < 0.7) scr(c, { black: 0.85 * clamp((0.7 - lt) / 0.25, 0, 1) });   // 死亡打击：两下出手都在压黑的画面里（视频 116.8–117.5）
    if (a === 'lieying' && lt < 0.5 && c.target) { const q = tgPos(c), gx = u.x + d.ux * 260, gy = u.y + d.uy * 260, L = Math.hypot(q.x - gx, q.y - gy); if (L > 20 && Math.hypot(q.x - u.x, q.y - u.y) < 600) { const s = Math.min(1, 600 * (1 / 40) / L); drag(c, c.target, q.x + (gx - q.x) * s, q.y + (gy - q.y) * s); } if (at(c, 'pull', 0.05)) F.soul(gx, gy, 120, { r: 600, dur: 0.5, n: 20 }); }
    if (a === 'jieguang' && lt > 0.42 && lt < 0.93) scr(c, { black: 0.5 });
  },
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (k.anim === 'jielun' && k.form !== 'demon') {
      F.flare(u.x + d.ux * 90, u.y + d.uy * 90, 110, { r: 110, mode: 'star', col: [1.8, 0.5, 1.4] }); F.ring(u.x, u.y, 110, -d.uy, d.ux, 0, { r: 160, power: 0.7, col: C_HELL, dur: 0.2 }); sfx('yws_wheel', u.x, u.y);
      if (inStrip(c, u.x, u.y, -60, 220, 150)) strike(c, k.last ? 0.04 : 0.016, k.last ? 1.2 : 0.5, 'yws_jielun', { stop: 0.03, power: 0.8, sfx: k.i % 2 ? null : 'yws_hit' });
      if (k.last && c.target) knock(c, 300, 300);
      return;
    }
    if (k.anim === 'jielun') {
      // 死亡打击：已经穿到对手身后，身后两团品红十字星
      const o = origin(c); F.smear(o.x, o.y, 120, u.x, u.y, 120, { w: 90, col: C_WHITE, dur: 0.3 }); show(c, { k: 'beam', dur: 0.25, col: '255,80,200' });
      const q = tgPos(c); F.flare(q.x, q.y, 110, { r: 180, mode: 'star', col: [2, 0.5, 1.6] }); sfx('yws_slash', q.x, q.y);
      if (inStrip(c, o.x, o.y, -40, 480, 120)) strike(c, 0.04, 1.4, 'yws_siwang', { power: 1.3, stop: 0.07, ux: -d.ux, uy: -d.uy });
      return;
    }
    if (k.anim === 'jieguang') {
      // 三段光束（身前 80–620、宽 180），最后一段击倒
      const x0 = u.x + d.ux * 80, y0 = u.y + d.uy * 80, x1 = u.x + d.ux * 620, y1 = u.y + d.uy * 620;
      F.smear(x0, y0, 130, x1, y1, 130, { w: 180 - k.i * 50, col: k.last ? C_BLOOD : C_WHITE, dur: 0.25 }); F.flare(x0, y0, 130, { r: 220, mode: 'star', col: [2, 0.6, 1.6] });
      if (k.i === 0) { F.ring(u.x, u.y, 160, d.ux, d.uy, 0, { r: 420, power: 1.3, col: C_BLOOD }); shake(c, 0.8); }
      sfx(k.last ? 'yws_heavy' : 'yws_slash', x0, y0);
      if (inStrip(c, u.x, u.y, 60, 640, 100)) { strike(c, 0.035, 1.3, 'yws_jieguang', { power: 1.2, stop: 0.05 }); if (k.last) knock(c, 300, 200); }
      return;
    }
    // 裂影杀：穿身 → 一串斜切
    if (k.i === 0) { const o = { x: u.x - d.ux * 520, y: u.y - d.uy * 520 }; scr(c, { black: 0.85 }); F.smear(o.x, o.y, 120, u.x, u.y, 120, { w: 120, col: C_WHITE, dur: 0.3 }); show(c, { k: 'beam', dur: 0.3, col: '255,80,200' }); sfx('yws_slash', u.x, u.y); if (inStrip(c, o.x, o.y, 0, 540, 200)) strike(c, 0.04, 1.4, 'yws_lieying', { power: 1.3, stop: 0.08 }); return; }
    const q = tgPos(c);
    for (let i = 0; i < 8; i++) { const a = hr(c, 20, i) * TAU; F.scythe(q.x + Math.cos(a) * 30, q.y + Math.sin(a) * 30, 120, { nx: Math.cos(a) * 0.6, ny: Math.sin(a) * 0.6, nz: 0.6, e1: [Math.cos(a + 1.6), Math.sin(a + 1.6), 0.5], a0: 0, sweep: 1.6, r: 130, w: 30, dur: 0.25, col: C_MAGENTA, delay: i * 0.02 }); }
    sfx('yws_claw', q.x, q.y);
    if (near(c, q.x, q.y, 260)) { strike(c, 0.05, 1.6, 'yws_lieying', { power: 1.4, stop: 0.08 }); if (c.target) c.launch(c.target, -d.ux, -d.uy, 260, 400); }
  },
});

// ==================================================================== §13 冥触：人身 魔触钻出来缠住人（120、370、620）；魔躯 灾使两轮（170、340、840、1170）→ 魔呓（§13 变体）
const MINGCHU = ywsMove({
  id: 'yws_mingchu', name: '冥触', glyph: '触', color: '150,40,120', cd: 9, range: 620,
  desc: '对手脚下的地裂开，几条分节的魔触钻出来把人缠住勒紧；魔躯时身后浮出半透明的「灾使」连斩两轮，最后一句「魔呓」震得人魂魄发颤。（夜无赦）',
  seq: (c, f) => (f === 'demon' ? ['mingchu', 'moyi_summon'] : ['mingchu']),
  enter(c, a) { const q = tgPos(c), d = D(c); d.hx = q.x; d.hy = q.y; if (a === 'mingchu') { const F = F3(c); F.scorch(q.x, q.y, 200 * d.sc, { dur: 2 }); F.ring(q.x, q.y, 6, 0, 0, 1, { r: 260 * d.sc, power: 0.6, col: C_VOID }); } },
  frame(c, a, lt) {
    const d = D(c); scr(c, { dim: 0.2 * clamp(lt / 0.3, 0, 1) });
    if (a === 'mingchu' && d.form !== 'demon' && d.held && lt < 0.9) drag(c, c.target, d.hx as number, d.hy as number, 40);
  },
  hit(c, k) {
    const d = D(c), F = F3(c), hx = d.hx as number, hy = d.hy as number, u = userPos(c);
    if (k.anim === 'mingchu' && k.form !== 'demon') {
      if (k.i === 0) { const n = k.form === 'half' ? 5 : 4; for (let i = 0; i < n; i++) { const a = i / n * TAU + hr(c, i) * 0.6, R = 230; F.tendril(hx + Math.cos(a) * R, hy + Math.sin(a) * R * 0.8, -20, hx, hy, 100, { w: 34, dur: 0.95, n: 12, col: i % 2 ? C_BLOOD : [1.1, 0.2, 0.9], delay: i * 0.03 }); } F.debris(hx, hy, { n: 10, r: 200 }); sfx('yws_claw', hx, hy); }
      // 判定：身前 60–560、宽 160；缠住（定身、往他身前拖 150）
      if (inStrip(c, u.x, u.y, 60, 560, 160) || near(c, hx, hy, 160)) { d.held = 1; strike(c, k.last ? 0.035 : 0.022, 0.75, 'yws_mingchu', { stop: 0.04, power: 0.7, uz: 0.3 }); F.soul(hx, hy, 100, { r: 200, dur: 0.4, n: 6 }); if (k.last) { const q = tgPos(c); drag(c, c.target, q.x - d.ux * 150, q.y - d.uy * 150); } }
      return;
    }
    if (k.anim === 'mingchu') {
      // 灾使：身后浮出的半透明魔影隔空一斩（两轮），目标处 220 的爆
      const q = tgPos(c), bx = q.x + d.ux * 150, by = q.y + d.uy * 150;
      ghost(c, bx, by, 0, -d.ux * 20, -d.uy * 20, 0.5, '220,40,60');
      slashArc(c, { at: { x: bx, y: by }, dir: ang(c) + Math.PI, vertical: true, a0: 1.0, sweep: -2.6, r: 230, w: 90, col: k.i % 2 ? C_BLOOD : C_VOID, power: 1.2 }); sfx('yws_slash', q.x, q.y);
      if (k.i % 2) { F.blast(q.x, q.y, 1, 'void', { z: 100, r: 160 }); shake(c, 0.5); }
      if (inStrip(c, u.x, u.y, 60, 560, 160) || near(c, q.x, q.y, 220)) strike(c, k.i % 2 ? 0.035 : 0.02, 1, 'yws_zaishi', { power: 1.1, stop: 0.05 });
      return;
    }
    // 魔呓：身前 60–700、宽 320 的长条，三下，最后 360 的圆爆击飞
    const x = u.x + d.ux * 380, y = u.y + d.uy * 380;
    if (!k.last) { F.soul(x, y, 120, { r: 360, dur: 0.4, n: 10 }); F.warp(x, y, 110, { r: 360, power: 0.7, dur: 0.3 }); sfx('yws_dark', x, y); if (inStrip(c, u.x, u.y, 60, 700, 320)) strike(c, 0.015, 0.5, 'yws_moyiyu', { stop: 0.02, power: 0.6, sfx: null }); return; }
    const q = tgPos(c); F.blast(q.x, q.y, 1.4, 'void', { z: 110, r: 240 }); F.halo(q.x, q.y, 110, { r: 360, dur: 0.5, col: C_VOID }); show(c, { k: 'lines', dur: 0.35, col: '160,60,220' }); shake(c, 0.8); sfx('yws_heavy', q.x, q.y);
    if (near(c, q.x, q.y, 360) && inStrip(c, u.x, u.y, 0, 760, 360)) { strike(c, 0.05, 1.6, 'yws_moyiyu', { power: 1.4, stop: 0.08 }); knock(c, 300, 500); }
  },
});

// ==================================================================== §14 魔拳：人身 一拳轰出魔拳（120，身前 80–420、宽 160，打退 160）；魔躯 梦魇种（100，60 度扇形，挂梦魇 2.5 息）
const MOQUAN = ywsMove({
  id: 'yws_moquan', name: '魔拳', glyph: '拳', color: '200,50,90', cd: 8, range: 460,
  desc: '一拳轰出去，拳头上凝出一只巨大的魔拳把人打退；魔躯时一爪把「梦魇种」种进对手身上——两息半里魂魄一跳一跳地疼。（夜无赦）',
  seq: (_c, f) => (f === 'demon' ? ['menyan'] : ['moquan']),
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c);
    if (k.anim === 'moquan') {
      F.sonic(u.x + d.ux * 70, u.y + d.uy * 70, 120, d.ux, d.uy, 0, { power: 1.3, col: C_BLOOD }); F.jet(u.x + d.ux * 60, u.y + d.uy * 60, 120, d.ux, d.uy, { len: 380, power: 1.3, pal: 'void' });
      F.tendril(u.x - d.ux * 40, u.y - d.uy * 40, 150, u.x + d.ux * 360, u.y + d.uy * 360, 130, { w: 150, dur: 0.45, n: 5, wave: 0.15, col: [0.9, 0.2, 1.3] }); F.blast(u.x + d.ux * 340, u.y + d.uy * 340, 1.4, 'ink', { z: 130, r: 200 }); F.flare(u.x + d.ux * 340, u.y + d.uy * 340, 130, { r: 220, mode: 'star', col: [1.6, 0.6, 2] });
      F.ring(u.x + d.ux * 200, u.y + d.uy * 200, 120, d.ux, d.uy, 0, { r: 220, power: 1.1, col: C_VOID }); shake(c, 0.6); c.cam(0.5); sfx('yws_heavy', u.x, u.y);
      if (inStrip(c, u.x, u.y, 80, 420, 160)) { strike(c, 0.06, 1.9, 'yws_moquan', { power: 1.4, stop: 0.08 }); const q = tgPos(c); drag(c, c.target, q.x + d.ux * 160, q.y + d.uy * 160); }
      return;
    }
    const fx = u.x + d.ux * 200, fy = u.y + d.uy * 200;
    // 梦魇种：往前一挥爪，喷出一大片黑红的碎屑雾（60 度扇形）
    for (let i = 0; i < 7; i++) { const a = ang(c) + (i - 3) * 0.17; F.jet(u.x + d.ux * 80, u.y + d.uy * 80, 140, Math.cos(a), Math.sin(a), { len: 460, power: 1.1, spread: 0.25, pal: i % 2 ? 'ink' : 'fire', delay: i * 0.012 }); }
    F.debris(u.x + d.ux * 120, u.y + d.uy * 120, { n: 26, r: 120, power: 1.4, hot: true, dir: ang(c), spread: 0.55 }); F.blast(fx, fy, 1.1, 'ink', { z: 130, r: 200 });
    F.scythe(fx, fy, 130, { nx: 0, ny: 0, nz: 1, e1: [-d.ux, -d.uy, 0], a0: -0.5, sweep: 1.1, r: 300, w: 80, dur: 0.3, col: C_BLOOD, power: 1.2 }); sfx('yws_claw', fx, fy);
    const q = tgPos(c), dx = q.x - u.x, dy = q.y - u.y, L = Math.hypot(dx, dy) || 1;
    if (L < 420 && (dx * d.ux + dy * d.uy) / L > Math.cos(Math.PI / 6) && near(c, q.x, q.y, 1e9)) {
      strike(c, 0.04, 1.4, 'yws_menyan', { power: 1.1, stop: 0.05 });
      const Y = ywsOf(c.B); if (Y && isBoss(c) && c.target) Y.plantNightmare(c.target);
      F.halo(q.x, q.y, 100, { r: 90, dur: 0.6, col: C_BLOOD });
    }
  },
});

// ==================================================================== §16 鬼门关：人身 一扫开门（120），门里旋涡噬魂四下（250–625，最后一下门炸）；魔躯 先「鬼步」闪近 160，再五下（340–876）
const GUIMEN = ywsMove({
  id: 'yws_guimen', name: '鬼门关', glyph: '门', color: '140,60,210', cd: 12, range: 900, learn: { realm: 3, mp: 0.16 },
  desc: '对手身后的地里升起一扇石门，门洞里一面紫黑旋涡把人往里吸、一下一下地噬魂，最后门一炸；魔躯时先化黑烟「鬼步」闪到近前。（夜无赦亲传）',
  seq: () => ['guimen'],
  enter(c) { const q = tgPos(c), d = D(c); d.gx = q.x + d.ux * 170; d.gy = q.y + d.uy * 170; if (d.form === 'demon') { const u = userPos(c); F3(c).blast(u.x, u.y, 0.5, 'ink', { z: 90, r: 100 }); sfx('yws_shadow', u.x, u.y); } },
  frame(c, _a, lt) {
    const d = D(c), gx = d.gx as number, gy = d.gy as number, t0 = d.form === 'demon' ? 0.34 : 0.12;
    if (lt > t0 && c.target) { const q = tgPos(c), dd = Math.hypot(q.x - gx, q.y - gy); if (dd < 560 && dd > 60) { const s = Math.min(1, 260 / 40 / dd); drag(c, c.target, q.x + (gx - q.x) * s, q.y + (gy - q.y) * s); } }
  },
  hit(c, k) {
    const d = D(c), F = F3(c), gx = d.gx as number, gy = d.gy as number, sc = k.sc;
    if (k.i === 0) { F.gate(gx, gy, { r: 125 * Math.sqrt(sc), dur: d.form === 'demon' ? 1.1 : 1.2, dir: ang(c) + Math.PI }); F.debris(gx, gy, { n: 14, r: 160 }); F.dust(gx, gy, { r: 300 }); sfx('yws_gate', gx, gy); shake(c, 0.4); }
    if (!k.last) { F.ring(gx, gy, 140, -d.ux, -d.uy, 0, { r: 200 * sc, power: 1.1, col: C_MAGENTA, dur: 0.3 }); for (let i = 0; i < 3; i++) F.jet(gx, gy, 120 + i * 40, -d.ux, -d.uy, { len: 520 * sc, power: 1.3, spread: 0.35, pal: 'void', delay: i * 0.04 }); F.blast(gx - d.ux * 200, gy - d.uy * 200, 0.9, 'void', { z: 130, r: 160 });
      F.soul(gx, gy, 150, { r: 380 * sc, dur: 0.4, n: 10 }); if (near(c, gx, gy, 400 * sc)) strike(c, 0.014, 0.45, 'yws_guimen', { stop: 0.02, power: 0.5, sfx: k.i % 2 ? null : 'yws_hit', noFx: k.i % 2 === 1 }); return; }
    F.blast(gx, gy, 1.8 * sc, 'void', { z: 150, r: 280 * sc }); F.column(gx, gy, { h: 2200, r: 120 * sc, dur: 0.7, col: [1.0, 0.25, 1.4] }); F.ring(gx, gy, 10, 0, 0, 1, { r: 700 * sc, power: 1.4, col: C_VOID });
    F.warp(gx, gy, 150, { r: 620 * sc, power: 1.3, dur: 0.6 }); F.debris(gx, gy, { n: 22, r: 200, power: 1.3 }); white(c, 1); shake(c, 1); sfx('yws_big', gx, gy);
    if (aoe(c, gx, gy, 340 * sc, 0.06, 2.2, 'yws_guimen', { power: 1.5, stop: 0.08 })) knock(c, 380, 520);
  },
});

// ==================================================================== §17 魔审：冲 80 → 斩（200）、扫（300）、两记上撩（500、625）；魔躯五下
const MOSHEN = ywsMove({
  id: 'yws_moshen', name: '魔审', glyph: '审', color: '220,40,60', cd: 6, range: 440,
  desc: '一步抢上来——血红的一斩、一扫，再连着两记上撩把人挑起来审。专挑你蓄力的空当。（夜无赦）',
  seq: () => ['moshen'],
  hit(c, k) {
    const d = D(c), u = userPos(c), F = F3(c), demon = k.form === 'demon';
    if (k.i === 0) { white(c, 1); show(c, { k: 'lines', dur: 0.3, col: '230,40,60' }); F.arc(u.x + d.ux * 120, u.y + d.uy * 120, 110, { r: 260, mode: 'purple', sweep: 2.4, dur: 0.3 }); }
    const arcs = [{ vertical: true, a0: 1.2, sweep: -2.8, r: 220, col: C_BLOOD }, { r: 260, a0: -0.5, sweep: 3, w: 80 }, { vertical: true, a0: -2.2, sweep: 2.8, r: 220, col: C_BLOOD }, { vertical: true, a0: -2.0, sweep: 3.0, r: 260, w: 100, col: C_WHITE, power: 1.4 }, { vertical: true, a0: -2.0, sweep: 3.0, r: 280, w: 100, col: C_HELL, power: 1.5 }];
    if (demon) F.scythe(u.x + d.ux * 150, u.y + d.uy * 150, 150, { nx: -d.uy * 0.5, ny: d.ux * 0.5, nz: k.i % 2 ? 1 : -1, e1: [-d.ux, -d.uy, 0.4], a0: 0, sweep: 2.2, r: 240, w: 60, dur: 0.25, col: k.i % 2 ? C_BLOOD : C_HELL, power: 1.3 });
    else slashArc(c, arcs[k.i]);
    sfx(demon ? 'yws_claw' : 'yws_slash', u.x, u.y);
    if (inStrip(c, u.x, u.y, -30, 300 * Math.sqrt(k.sc), 140)) { strike(c, k.i === 0 ? 0.05 : 0.03, 1.2, 'yws_moshen', { power: 1.1, stop: k.i === 0 ? 0.1 : 0.04 }); if (k.i >= 2) lift(c, c.target, k.last ? 1.1 : 0.5); }
  },
});

let registered = false;
/** 第一批注册（yewushe.ts 的构造里调一次） */
export function registerYws1(Y: Yewushe) {
  void Y;
  if (registered) return; registered = true;
  addYws(DUOHUN, { forms: ['human', 'half'] });
  addYws(SANSHI, { forms: ['human', 'half', 'demon'] });
  addYws(RUTI, { forms: ['human'], cine: true });
  addYws(JIANGSHEN, { forms: ['half'], cine: true });
  addYws(MOZHUA, { forms: ['human', 'half', 'demon'] });
  addYws(XUELIAN, { forms: ['human', 'half', 'demon'] });
  addYws(BENGYUE, { forms: ['human', 'half', 'demon'] });
  addYws(HUIXUAN, { forms: ['human', 'half', 'demon'], far: true });
  addYws(YOUMING, { forms: ['human', 'half', 'demon'] });
  addYws(JIELUN, { forms: ['human', 'half', 'demon'] });
  addYws(MINGCHU, { forms: ['human', 'half', 'demon'] });
  addYws(MOQUAN, { forms: ['human', 'half', 'demon'] });
  addYws(GUIMEN, { forms: ['human', 'half', 'demon'], far: true });
  addYws(MOSHEN, { forms: ['human', 'half', 'demon'] });
  void [face, posOf, pose];
}
