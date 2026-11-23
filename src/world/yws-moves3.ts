// 噬魂魔尊 · 夜无赦 招式第三批：两个觉醒大招（永堕 · 混沌弑仙、末劫梵音 · 灭世魔翼）和极恶魔潮。只在魔躯时放，觉醒一场最多两次（yewushe.ts 的 bigOk / useBig）。
// 对时版：时长、出手时刻、位移按画面线帧表（world/yewushe-anim.ts）走，见 yws-core.ts 的 ywsMove。规格：docs/夜无赦-参考视频动作分解.md §21–§23。
import type { MoveCtx } from './brawlmoves';
import type { Yewushe } from './yewushe';
import { addYws, D, F3, near, put, face, strike, aoe, scr, show, white, say, sfx, ghost, hr, ywsOf, TAU, clamp, C_VOID, C_BLOOD, C_MAGENTA, drag, origin, tgPos, every, ang, userPos, ywsMove, inStrip, shake } from './yws-core';
import type { RGB3 } from './fx3d';

const C_WHITE: RGB3 = [2.2, 1.9, 2.2];
const isBoss = (c: MoveCtx) => { const Y = ywsOf(c.B); return !!Y && !!c.user && c.user === Y.ent; };
const tele = (c: MoveCtx, name: string, dur: number) => { const Y = ywsOf(c.B); if (Y && isBoss(c)) Y.tele(name, dur); };
// r19：终结技的整屏白闪（impactfx.whiteF → 后期 uFlash，人和魔躯一起被刷白、再叠金光就成了一片橙）他不要：大字、集中线、黑白闪照旧，白闪清掉
const finisher = (c: MoveCtx, word: string) => { if (!c.user) return; try { const I = c.B.impact; I.finisher(word, { keep: [c.user, ...(c.target ? [c.target] : [])], ink: 1 }); I.whiteF = 0; } catch { /* 演出出错不拖垮出招 */ } };

// ==================================================================== §21 永堕 · 混沌弑仙（3.8 息）：0–0.8 聚混沌（读条）→ 0.8 扑上去吞人 → 1.0–2.6 混沌里九道镰光乱斩 → 2.8 十字光刃「弑」→ 3.1 混沌炸开
const SHIXIAN = ywsMove({
  id: 'yws_shixian', name: '永堕 · 混沌弑仙', glyph: '弑', color: '255,30,50', cd: 40, range: 1400,
  desc: '觉醒。混沌魔气在他身上聚成一团黑日，一闪就扑到你跟前把你吞进去——整片天地染成血红，混沌里镰光乱斩，最后两道横贯天地的十字光刃把一切斩开。（夜无赦·魔躯）',
  seq: () => ['shixian'],
  start(c) { tele(c, '永堕 · 混沌弑仙', 0.8); say(c, '永堕吧。', '#ff6070'); const o = userPos(c); F3(c).scorch(o.x, o.y, 360, { dur: 4 }); sfx('yws_tele', o.x, o.y); },
  frame(c, _a, lt) {
    const d = D(c), F = F3(c), o = origin(c);
    if (lt < 0.8) { scr(c, { dim: 0.6 * clamp(lt / 0.5, 0, 1) }); const j = every(c, 'g', 0, 0.75, 0.15); if (j >= 0) { F.soul(o.x, o.y, 300, { r: 900, dur: 0.5, n: 14, col: j % 2 ? C_BLOOD : C_VOID }); F.halo(o.x, o.y, 320, { r: 80 + j * 40, dur: 0.2, col: C_VOID }); } shake(c, 0.15 + lt * 0.2); }
    // r17：整屏压暗成深色（血红只染三成），他和对手留色——剪影清楚；不再提亮洗白
    // r19：光靠 dim 压不下去（白天的地面只暗三成，十字光刃两侧一片橙黄）——改用压黑（只剩他、对手和亮过 1 的光）：混沌里压六成、十字光刃那一下压到八成五，底色是视频那种深褐红
    if (lt >= 0.8 && lt < 2.7) scr(c, { wash: [0.3, 0.01, 0.03, 0.26], dim: 0.62, black: 0.75 });
    if (lt >= 2.7 && lt < 3.1) scr(c, { wash: [0.26, 0.01, 0.02, 0.1], dim: 0.7, black: 0.86 });   // 变色只留一成（染多了把橙金的光刃也染成粉白）
    if (lt >= 3.1) { const f = clamp((3.8 - lt) / 0.7, 0, 1); scr(c, { wash: [0.3, 0.02, 0.03, 0.24 * f], dim: 0.6 * f, black: 0.7 * f }); }
    if (d.held && lt > 0.8 && lt < 2.9) { const u = userPos(c); drag(c, c.target, u.x + d.ux * 160, u.y + d.uy * 160, 140); }
  },
  hit(c, k) {
    const d = D(c), F = F3(c), u = userPos(c), q = tgPos(c), hx = q.x, hy = q.y;
    if (k.i === 0) {
      // 扑上去：从起手处一闪到对手跟前，黑团吞人
      const o = origin(c), gx = hx - d.ux * 160, gy = hy - d.uy * 160;
      for (let i = 1; i <= 5; i++) ghost(c, o.x + (gx - o.x) * i / 6, o.y + (gy - o.y) * i / 6, 0, d.ux * 40, d.uy * 40, 0.35 + i * 0.04, i % 2 ? '200,30,50' : '120,40,180');
      F.smear(o.x, o.y, 200, gx, gy, 200, { w: 120, col: C_BLOOD, dur: 0.4 }); put(c, gx, gy); face(c, d.ux, d.uy); d.sox = gx; d.soy = gy;
      F.blast(hx, hy, 2.2, 'ink', { z: 140, r: 360 }); F.warp(hx, hy, 140, { r: 700, power: 1.4, dur: 0.6 }); shake(c, 1); sfx('yws_big', hx, hy);
      if (near(c, hx, hy, 520)) { d.held = 1; strike(c, 0.03, 1, 'yws_shixian', { power: 1.2, stop: 0.06 }); }
      return;
    }
    if (k.i <= 9) {
      const a = hr(c, 1, k.i) * TAU, b = (hr(c, 2, k.i) - 0.5) * 2.4;
      F.scythe(hx, hy, 150, { nx: Math.cos(a) * Math.sin(b), ny: Math.sin(a) * Math.sin(b), nz: Math.cos(b), e1: [Math.cos(a + 1), Math.sin(a + 1), hr(c, 3, k.i) - 0.5], a0: 0, sweep: 2.6, r: 220 + hr(c, 4, k.i) * 160, w: 70, dur: 0.24, col: k.i % 3 === 0 ? C_WHITE : k.i % 2 ? C_BLOOD : C_VOID, power: 1.3 });
      ghost(c, hx + Math.cos(a) * 220, hy + Math.sin(a) * 170, 0, -Math.cos(a) * 40, -Math.sin(a) * 40, 0.3, '200,30,60'); sfx('yws_slash', hx, hy);
      if (near(c, hx, hy, 420)) strike(c, 0.012, 0.45, 'yws_shixian', { stop: 0.02, power: 0.8, sfx: k.i % 2 ? null : 'yws_hit', noFx: k.i % 2 === 1 });
      return;
    }
    if (k.i === 10) {
      // 两道横贯全屏的十字光刃：按镜头的右方向摆成画面上的斜线（一头高、一头贴地往镜头这边），不是贴地的两条
      const Rd = (c.B.g as unknown as { renderer?: { hd?: { rightDir: { x: number; y: number } } } }).renderer?.hd?.rightDir ?? { x: 1, y: 0 }, dn = { x: -Rd.y, y: Rd.x };
      // r19：两道交叉光刃——亮芯一线白金、外缘一层橙金（窄），不要宽的血红外层和拖尾（那几层把两侧整片照亮）；光刃以外靠压黑保持暗
      for (const s of [-1, 1]) {
        // r19：十字画在最上面（smear 的 top：原来交点在他身后，被几丈高的魔躯挡住，只露出画面两角的两截），往镜头这边挪两百
        const fx = hx + dn.x * 200, fy = hy + dn.y * 200;
        const x0 = fx - Rd.x * 1300 * s - dn.x * 300, y0 = fy - Rd.y * 1300 * s - dn.y * 300, x1 = fx + Rd.x * 1300 * s + dn.x * 500, y1 = fy + Rd.y * 1300 * s + dn.y * 500;
        F.smear(x0, y0, 760, x1, y1, -40, { w: 72, col: [1.35, 0.42, 0.02], dur: 0.8, top: true });
        F.smear(x0, y0, 760, x1, y1, -40, { w: 24, col: [3.2, 2.7, 1.6], dur: 0.7, top: true });
      }
      { const fx = hx + dn.x * 200, fy = hy + dn.y * 200; F.flare(fx, fy, 360, { r: 85, mode: 'star', col: [2.0, 1.7, 1.2] }); F.halo(fx, fy, 360, { r: 70, dur: 0.4, col: [1.0, 0.45, 0.1] }); } void ang;
      white(c, 0); shake(c, 1.4); sfx('yws_big', hx, hy); sfx('yws_slash', hx, hy);   // 「弑」放到混沌炸开那一下（finisher 的黑白闪会盖住十字光刃）
      if (near(c, hx, hy, 500)) strike(c, 0.05, 1.8, 'yws_shixian', { power: 1.8, stop: 0.14 });
      return;
    }
    // r19：混沌炸开不再是一根粉白的粗光柱 + 火爆（整屏洗白）：紫黑爆团 + 一根细的暗血红光柱，十字收成两道细红线
    F.blast(hx, hy, 2.2, 'void', { z: 160, r: 360 });
    F.column(hx, hy, { h: 4000, r: 70, dur: 0.6, col: [0.7, 0.04, 0.12] });
    { const Rd = (c.B.g as unknown as { renderer?: { hd?: { rightDir: { x: number; y: number } } } }).renderer?.hd?.rightDir ?? { x: 1, y: 0 }, dn = { x: -Rd.y, y: Rd.x }, fx = hx + dn.x * 200, fy = hy + dn.y * 200;
      for (const s of [-1, 1]) F.smear(fx - Rd.x * 1300 * s - dn.x * 300, fy - Rd.y * 1300 * s - dn.y * 300, 760, fx + Rd.x * 1300 * s + dn.x * 500, fy + Rd.y * 1300 * s + dn.y * 500, -40, { w: 10, col: [1.6, 0.12, 0.08], dur: 0.45, top: true }); } F.ring(hx, hy, 10, 0, 0, 1, { r: 1700, power: 2, col: C_BLOOD }); F.ring(hx, hy, 200, 0, 0, 1, { r: 1200, power: 1.4, col: C_VOID, delay: 0.08 });
    F.warp(hx, hy, 160, { r: 1400, power: 2, dur: 0.8 }); F.dent(hx, hy, 340, 100, 10); F.ripple(hx, hy, { amp: 34, reach: 3000 }); F.debris(hx, hy, { n: 40, r: 320, power: 2 }); F.dust(hx, hy, { r: 1400, power: 2 });
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; F.spike(hx + Math.cos(a) * 520, hy + Math.sin(a) * 400, { h: 700, r: 90, tilt: 0.5, dir: a, dur: 2, delay: 0.05 + i * 0.02 }); }
    try { c.B.g.combat.wreck.pit(hx, hy, 260, 3); } catch { /* 破坏系统出错不拖垮出招 */ }
    shake(c, 1.6); c.cam(1); sfx('yws_big', hx, hy); d.held = 0; finisher(c, '弑');   // c.cam：落地那一下很短的镜头冲击（夜无赦在场时 brawl.cameraTick 换成 0.12 息、5% 以内的一缩一弹）
    if (aoe(c, hx, hy, 640, 0.12, 4, 'yws_shixian', { power: 2, stop: 0.12 }) && c.target) { const L = Math.hypot(hx - u.x, hy - u.y) || 1; c.launch(c.target, (hx - u.x) / L, (hy - u.y) / L, 900, 1000); }
  },
});

// ==================================================================== §22 极恶魔潮（1.51 息）：0–0.51 魔气在身后聚成黑潮（读条）→ 510 双掌一推，三波魔潮往前冲（510、680、845），潮头炸成旋涡
const MOCHAO = ywsMove({
  id: 'yws_mochao', name: '极恶魔潮', glyph: '潮', color: '150,40,220', cd: 30, range: 1300,
  desc: '他身后的魔气翻成一道黑潮，双掌往前一推——一道翻滚着魂火和魔触的魔潮往前冲出千尺，挡在前面的全被卷进去冲走，潮头炸成一个紫黑的旋涡。（夜无赦·魔躯）',
  seq: () => ['mochao'],
  start(c) { tele(c, '极恶魔潮', 0.51); say(c, '……淹没吧。', '#c890ff'); sfx('yws_dark', userPos(c).x, userPos(c).y); },
  frame(c, _a, lt) {
    const d = D(c), F = F3(c), o = origin(c), a = ang(c);
    if (lt < 0.51) { scr(c, { dim: 0.45 * clamp(lt / 0.3, 0, 1) }); const j = every(c, 'g', 0, 0.5, 0.1); if (j >= 0) { const b = o.x - d.ux * 260, e = o.y - d.uy * 260; F.soul(b, e, 260, { r: 600, dur: 0.4, n: 10, col: C_VOID }); F.halo(b, e, 260, { r: 160 + j * 30, dur: 0.15, col: C_VOID }); } }
    else scr(c, { wash: [0.25, 0.04, 0.45, 0.45 * clamp((1.51 - lt) / 0.5, 0, 1)], dim: 0.3 * clamp((1.51 - lt) / 0.5, 0, 1) });
    // 潮头往前推（0.51–1.1）
    const k = every(c, 'w', 0.51, 1.1, 0.04);
    if (k >= 0) {
      const R = 140 + k * 75, w = 120 + k * 10, x = o.x + Math.cos(a) * R, y = o.y + Math.sin(a) * R;
      F.blast(x - d.uy * (hr(c, k) - 0.5) * w, y + d.ux * (hr(c, k) - 0.5) * w, 1.3 + k * 0.04, k % 3 === 0 ? 'void' : 'ink', { z: 80 + hr(c, k, 2) * 140, r: w * 1.1 });
      F.blast(x + d.uy * (hr(c, k, 5) - 0.5) * w, y - d.ux * (hr(c, k, 5) - 0.5) * w, 1.0, 'ink', { z: 40, r: w * 0.9, delay: 0.02 }); F.dust(x, y, { r: w * 1.6, power: 0.9, col: [0.25, 0.15, 0.3] });
      F.jet(x, y, 80, d.ux, d.uy, { len: 300, power: 1.1, spread: 0.6, pal: 'void' });
      if (k % 3 === 0) { const s = (hr(c, k, 3) - 0.5) * 2 * w; F.tendril(x - d.uy * s, y + d.ux * s, -10, x + d.ux * 200 - d.uy * s * 0.5, y + d.uy * 200 + d.ux * s * 0.5, 160, { w: 30, dur: 0.6, n: 10, col: C_MAGENTA }); }
      if (k % 2 === 0) F.soul(x, y, 120, { r: w * 1.4, dur: 0.4, n: 6 });
      if (c.target && inStrip(c, o.x, o.y, 0, R + 80, w * 1.4)) { const q = tgPos(c); drag(c, c.target, q.x + d.ux * 40, q.y + d.uy * 40, 60); }
    }
  },
  hit(c, k) {
    const d = D(c), F = F3(c), o = origin(c), R = [500, 900, 1200][k.i] ?? 1200, x = o.x + d.ux * R, y = o.y + d.uy * R;
    if (k.i === 0) { white(c, 1); shake(c, 1); sfx('yws_big', o.x, o.y); sfx('yws_roar', o.x, o.y); show(c, { k: 'lines', dur: 1, col: '150,60,255' }); }
    F.ring(x, y, 120, d.ux, d.uy, 0, { r: 300 + k.i * 100, power: 1, col: C_VOID, dur: 0.3 }); sfx('yws_dark', x, y);
    if (!k.last) { if (inStrip(c, o.x, o.y, 0, R + 200, 260)) strike(c, 0.03, 1, 'yws_mochao', { stop: 0.03, power: 0.9 }); return; }
    F.blast(x, y, 2.4, 'void', { z: 120, r: 360 }); F.column(x, y, { h: 2800, r: 200, dur: 0.8, col: [1.0, 0.3, 1.6] }); F.ring(x, y, 10, 0, 0, 1, { r: 1300, power: 1.8, col: C_VOID });
    F.warp(x, y, 140, { r: 1000, power: -1.4, dur: 0.6 }); F.soul(x, y, 160, { r: 900, dur: 0.8, n: 40 }); F.debris(x, y, { n: 30, r: 260, power: 1.6 }); shake(c, 1.3); white(c, 2);
    if (inStrip(c, o.x, o.y, 0, R + 300, 300) || near(c, x, y, 520)) { strike(c, 0.08, 3, 'yws_mochao', { power: 1.8, stop: 0.1 }); if (c.target) c.up(c.target, 1.4); }
  },
});

// ==================================================================== §23 末劫梵音 · 灭世魔翼（6.0 息）：0–1.25 魔翼张开、梵音（读条）→ 1.25–1.75 升空 → 1.75–2.75 甩出飞旋血镰、天地碎裂 → 2.75–3.79 六道魔光砸下 → 4.5 通天魔柱「灭」
const MOYI = ywsMove({
  id: 'yws_moyi', name: '末劫梵音 · 灭世魔翼', glyph: '翼', color: '200,60,255', cd: 45, range: 1500,
  desc: '觉醒。背后一对遮天的魔翼张开，他升上半空，四下响起低沉的梵音；一柄飞旋的血镰甩出去，命中处天地像玻璃一样裂开，魔光从天上一道道砸下来，最后一根通天魔柱把一切抹平。（夜无赦·魔躯）',
  seq: () => ['moyi'],
  start(c) { tele(c, '末劫梵音 · 灭世魔翼', 1.25); say(c, '此世……当灭。', '#e0a0ff'); const q = tgPos(c), d = D(c); d.hx = q.x; d.hy = q.y; const o = userPos(c); sfx('yws_gate', o.x, o.y); F3(c).ring(o.x, o.y, 6, 0, 0, 1, { r: 600, power: 1, col: C_MAGENTA }); },
  frame(c, _a, lt) {
    const d = D(c), F = F3(c), u = userPos(c), o = origin(c), hx = d.hx as number, hy = d.hy as number;
    const wk = lt < 1.25 ? clamp(lt / 1.0, 0, 1) * 1.3 : lt < 4.0 ? 1.3 : clamp((5.0 - lt) / 1.0, 0, 1) * 1.3;
    if (lt < 5.0) F.wing('yws-moyi', u.x, u.y, u.z + 200, Math.atan2(d.ux, d.uy), wk, 620);
    if (lt < 1.25) { scr(c, { dim: 0.55 * clamp(lt / 0.6, 0, 1), wash: [0.2, 0.03, 0.35, 0.3 * clamp(lt / 0.8, 0, 1)] }); const j = every(c, 'g', 0.1, 1.2, 0.12); if (j >= 0) F.soul(o.x, o.y, 200, { r: 1100, dur: 0.5, n: 12, col: j % 2 ? C_MAGENTA : C_VOID }); }
    // r17：暗紫的空间（压暗为主、紫只染三成五），速度线减半；张翼时一张魔脸特写浮过（全屏放图）；「灭」字在十字光之后半息才砸下来
    // r19：dim 在白天的地面上只压三成，画面是一片灰米色——加压黑（只剩他、对手和亮过 1 的光）；紫只染两成半
    if (lt >= 1.25 && lt < 4.6) scr(c, { wash: [0.22, 0.03, 0.4, 0.25], dim: 0.55, black: 0.7 });
    if (lt >= 4.6) { const f = clamp((6.0 - lt) / 1.4, 0, 1); scr(c, { wash: [0.22, 0.03, 0.4, 0.25 * f], dim: 0.55 * f, black: 0.7 * f }); }
    if (lt > 1.0 && lt < 1.3 && every(c, 'ln', 1.0, 1.05, 0.1) >= 0) show(c, { k: 'lines', dur: 0.4, col: '170,60,255' });
    if (every(c, 'face', 0.35, 0.4, 0.1) >= 0) show(c, { k: 'img', img: 'yws_m_aw2_face', dur: 1.3, col: '150,60,255' });
    if (every(c, 'mie', 5.05, 5.1, 0.1) >= 0) show(c, { k: 'word', word: '灭', side: 'r', dur: 0.9 });
    // 1.75–2.1 飞旋的血镰飞到对手身上；2.1 天地碎裂
    const j = every(c, 'disc', 1.75, 2.1, 0.04);
    if (j >= 0) { if (j === 0) sfx('yws_wheel', u.x, u.y); const k = (j + 1) / 9, x = u.x + (hx - u.x) * k, y = u.y + (hy - u.y) * k; F.scythe(x, y, 200 * (1 - k) + 120 * k, { nx: -d.uy * 0.4, ny: d.ux * 0.4, nz: 1, e1: [Math.cos(j * 2.1), Math.sin(j * 2.1), 0], a0: 0, sweep: 4.5, r: 180, w: 60, dur: 0.14, col: C_BLOOD, power: 1.4 }); }
    if (every(c, 'shatter', 2.1, 2.12, 0.1) >= 0) {
      F.flare(hx, hy, 160, { r: 260, mode: 'star', col: [1.6, 1.3, 2.0] });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + hr(c, 7, i) * 0.4; F.jet(hx, hy, 160, Math.cos(a), Math.sin(a), { len: 500 + hr(c, 8, i) * 500, power: 0.9, dz: hr(c, 9, i) - 0.4, spread: 0.1, pal: 'frost' }); }
      F.ring(hx, hy, 160, d.ux, d.uy, 0.4, { r: 900, power: 1.4, col: C_WHITE }); F.warp(hx, hy, 160, { r: 900, power: 1.6, dur: 0.5 }); white(c, 1); shake(c, 1.2); sfx('yws_big', hx, hy);
      if (near(c, hx, hy, 420)) d.held = 1;
    }
    if (d.held && lt > 2.1 && lt < 4.4) drag(c, c.target, hx, hy, 60);
  },
  hit(c, k) {
    const d = D(c), F = F3(c), hx = d.hx as number, hy = d.hy as number;
    if (!k.last) {
      const a = hr(c, 11, k.i) * TAU, R = k.i % 3 === 0 ? 0 : 60 + hr(c, 12, k.i) * 360, x = hx + Math.cos(a) * R, y = hy + Math.sin(a) * R * 0.8;
      F.column(x, y, { h: 3200, r: 70 + hr(c, 13, k.i) * 50, dur: 0.4, col: k.i % 2 ? [1.3, 0.3, 1.8] : [1.6, 0.2, 0.5] }); F.blast(x, y, 1.1, 'void', { r: 160 }); F.ring(x, y, 8, 0, 0, 1, { r: 380, power: 0.9, col: C_MAGENTA });
      F.spike(x + 60, y, { h: 340, r: 50, tilt: 0.5, dir: a, dur: 1 }); F.spike(x - 60, y, { h: 300, r: 46, tilt: 0.5, dir: a + Math.PI, dur: 1 });
      shake(c, 0.6); if (k.i % 2 === 0) sfx('yws_heavy', x, y);
      if (near(c, x, y, 260)) strike(c, 0.022, 0.8, 'yws_moyi', { stop: 0.03, power: 1, sfx: null });
      return;
    }
    // r17：金色十字光——一道竖的通天光柱 + 一道横贯的金光，中心一团白爆；碎石、石柱减量并错开几帧放（这一刻原来一口气放太多、卡帧）
    const Rd = (c.B.g as unknown as { renderer?: { hd?: { rightDir: { x: number; y: number } } } }).renderer?.hd?.rightDir ?? { x: 1, y: 0 };
    F.column(hx, hy, { h: 6000, r: 90, dur: 1.0, col: [1.2, 0.75, 0.2] }); F.column(hx, hy, { h: 6000, r: 28, dur: 0.8, col: [1.8, 1.6, 1.2] });
    F.smear(hx - Rd.x * 1600, hy - Rd.y * 1600, 420, hx + Rd.x * 1600, hy + Rd.y * 1600, 420, { w: 80, col: [1.3, 0.8, 0.2], dur: 0.7 }); F.smear(hx - Rd.x * 1600, hy - Rd.y * 1600, 420, hx + Rd.x * 1600, hy + Rd.y * 1600, 420, { w: 20, col: [1.8, 1.6, 1.2], dur: 0.55 });
    F.flare(hx, hy, 420, { r: 220, mode: 'star', col: [1.8, 1.5, 2.0] }); F.blast(hx, hy, 2.0, 'void', { z: 160, r: 320 }); F.blast(hx, hy, 1.4, 'fire', { z: 200, r: 260, delay: 0.12 });
    F.ring(hx, hy, 10, 0, 0, 1, { r: 1800, power: 2, col: C_MAGENTA, delay: 0.05 }); F.warp(hx, hy, 200, { r: 1400, power: 2, dur: 0.9 }); F.dent(hx, hy, 380, 110, 10); F.ripple(hx, hy, { amp: 40, reach: 3200 });
    F.debris(hx, hy, { n: 14, r: 300, power: 2, delay: 0.1 }); F.dust(hx, hy, { r: 1400, power: 1.8, delay: 0.15 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; F.spike(hx + Math.cos(a) * 620, hy + Math.sin(a) * 480, { h: 800, r: 100, tilt: 0.55, dir: a, dur: 2.0, delay: 0.18 + i * 0.06 }); }
    try { c.B.g.combat.wreck.pit(hx, hy, 300, 3); } catch { /* 破坏系统出错不拖垮出招 */ }
    shake(c, 1.8); c.cam(1);   // r19：不闪白（白闪把魔躯刷白、再叠金柱就染成一片橙）
    sfx('yws_big', hx, hy); sfx('yws_roar', hx, hy); d.held = 0;
    if (aoe(c, hx, hy, 700, 0.13, 4.5, 'yws_moyi', { power: 2.2, stop: 0.14 }) && c.target) c.launch(c.target, d.ux, d.uy, 800, 1200);
  },
});

let registered = false;
/** 第三批注册（yewushe.ts 的构造里调一次） */
export function registerYws3(Y: Yewushe) {
  void Y;
  if (registered) return; registered = true;
  addYws(SHIXIAN, { forms: ['demon'], big: true, cine: true });
  addYws(MOCHAO, { forms: ['demon'], cine: true, far: true });   // 极恶魔潮不是觉醒，不占一场两次的名额（冷却长）
  addYws(MOYI, { forms: ['demon'], big: true, cine: true, far: true });
  void [inStrip];
}
