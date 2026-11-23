// r16 夜无赦：首领贴图（src/assets/yewushe，帧对照表见那里的 说明.md），data URL 内联、懒加载（hd2d/bossthings.ts 用到时才 import）。
// 由 tools/yws-pack.mjs 生成，别手改。还没生成出来的帧不在表里，bossthings 退回 gfx/ywsPlaceholder.ts 的占位剪影。
import t0 from '../assets/yewushe/yws_b_cast.webp?inline';
import t1 from '../assets/yewushe/yws_b_charge.webp?inline';
import t2 from '../assets/yewushe/yws_b_dash.webp?inline';
import t3 from '../assets/yewushe/yws_b_dive.webp?inline';
import t4 from '../assets/yewushe/yws_b_hurt.webp?inline';
import t5 from '../assets/yewushe/yws_b_idle.webp?inline';
import t6 from '../assets/yewushe/yws_b_leap.webp?inline';
import t7 from '../assets/yewushe/yws_b_roar.webp?inline';
import t8 from '../assets/yewushe/yws_b_slam.webp?inline';
import t9 from '../assets/yewushe/yws_b_slash.webp?inline';
import t10 from '../assets/yewushe/yws_b_spin.webp?inline';
import t11 from '../assets/yewushe/yws_b_summon.webp?inline';
import t12 from '../assets/yewushe/yws_b_sweep.webp?inline';
import t13 from '../assets/yewushe/yws_b_throw.webp?inline';
import t14 from '../assets/yewushe/yws_b_transform.webp?inline';
import t15 from '../assets/yewushe/yws_b_upper.webp?inline';
import t16 from '../assets/yewushe/yws_b_walk.webp?inline';
import t17 from '../assets/yewushe/yws_b_windup.webp?inline';
import t18 from '../assets/yewushe/yws_fx_claw.webp?inline';
import t19 from '../assets/yewushe/yws_fx_fist.webp?inline';
import t20 from '../assets/yewushe/yws_fx_ghost.webp?inline';
import t21 from '../assets/yewushe/yws_h_cast.webp?inline';
import t22 from '../assets/yewushe/yws_h_catch.webp?inline';
import t23 from '../assets/yewushe/yws_h_charge.webp?inline';
import t24 from '../assets/yewushe/yws_h_dash.webp?inline';
import t25 from '../assets/yewushe/yws_h_dive.webp?inline';
import t26 from '../assets/yewushe/yws_h_down.webp?inline';
import t27 from '../assets/yewushe/yws_h_fist.webp?inline';
import t28 from '../assets/yewushe/yws_h_grab.webp?inline';
import t29 from '../assets/yewushe/yws_h_guard.webp?inline';
import t30 from '../assets/yewushe/yws_h_hurt.webp?inline';
import t31 from '../assets/yewushe/yws_h_idle.webp?inline';
import t32 from '../assets/yewushe/yws_h_leap.webp?inline';
import t33 from '../assets/yewushe/yws_h_raise.webp?inline';
import t34 from '../assets/yewushe/yws_h_roar.webp?inline';
import t35 from '../assets/yewushe/yws_h_slam.webp?inline';
import t36 from '../assets/yewushe/yws_h_slash.webp?inline';
import t37 from '../assets/yewushe/yws_h_spin.webp?inline';
import t38 from '../assets/yewushe/yws_h_stab.webp?inline';
import t39 from '../assets/yewushe/yws_h_summon.webp?inline';
import t40 from '../assets/yewushe/yws_h_sweep.webp?inline';
import t41 from '../assets/yewushe/yws_h_throw.webp?inline';
import t42 from '../assets/yewushe/yws_h_transform.webp?inline';
import t43 from '../assets/yewushe/yws_h_upper.webp?inline';
import t44 from '../assets/yewushe/yws_h_walk.webp?inline';
import t45 from '../assets/yewushe/yws_h_windup.webp?inline';
import t46 from '../assets/yewushe/yws_m_aw1_a.webp?inline';
import t47 from '../assets/yewushe/yws_m_aw1_b.webp?inline';
import t48 from '../assets/yewushe/yws_m_aw1_c.webp?inline';
import t49 from '../assets/yewushe/yws_m_aw2_face.webp?inline';
import t50 from '../assets/yewushe/yws_m_aw2_wings.webp?inline';
import t51 from '../assets/yewushe/yws_m_cast.webp?inline';
import t52 from '../assets/yewushe/yws_m_charge.webp?inline';
import t53 from '../assets/yewushe/yws_m_claw.webp?inline';
import t54 from '../assets/yewushe/yws_m_dash.webp?inline';
import t55 from '../assets/yewushe/yws_m_dive.webp?inline';
import t56 from '../assets/yewushe/yws_m_down.webp?inline';
import t57 from '../assets/yewushe/yws_m_fist.webp?inline';
import t58 from '../assets/yewushe/yws_m_fly.webp?inline';
import t59 from '../assets/yewushe/yws_m_grab.webp?inline';
import t60 from '../assets/yewushe/yws_m_guard.webp?inline';
import t61 from '../assets/yewushe/yws_m_hurt.webp?inline';
import t62 from '../assets/yewushe/yws_m_idle.webp?inline';
import t63 from '../assets/yewushe/yws_m_leap.webp?inline';
import t64 from '../assets/yewushe/yws_m_raise.webp?inline';
import t65 from '../assets/yewushe/yws_m_roar.webp?inline';
import t66 from '../assets/yewushe/yws_m_slam.webp?inline';
import t67 from '../assets/yewushe/yws_m_summon.webp?inline';
import t68 from '../assets/yewushe/yws_m_sweep.webp?inline';
import t69 from '../assets/yewushe/yws_m_throw.webp?inline';
import t70 from '../assets/yewushe/yws_m_transform.webp?inline';
import t71 from '../assets/yewushe/yws_m_upper.webp?inline';
import t72 from '../assets/yewushe/yws_m_walk.webp?inline';
import t73 from '../assets/yewushe/yws_m_windup.webp?inline';
import t74 from '../assets/yewushe/yws_scythe.webp?inline';
import t75 from '../assets/yewushe/yws_h_bust.webp?inline';   // r19：堕魂诀全屏特写的人身半身像（MCP 新画，原图在 重构v0.57/概念图/夜无赦/；手加的一行，yws-pack 重跑时要把原图放进 gen/）
export const YWS_SRC: Record<string, string> = {
  yws_b_cast: t0,
  yws_b_charge: t1,
  yws_b_dash: t2,
  yws_b_dive: t3,
  yws_b_hurt: t4,
  yws_b_idle: t5,
  yws_b_leap: t6,
  yws_b_roar: t7,
  yws_b_slam: t8,
  yws_b_slash: t9,
  yws_b_spin: t10,
  yws_b_summon: t11,
  yws_b_sweep: t12,
  yws_b_throw: t13,
  yws_b_transform: t14,
  yws_b_upper: t15,
  yws_b_walk: t16,
  yws_b_windup: t17,
  yws_fx_claw: t18,
  yws_fx_fist: t19,
  yws_fx_ghost: t20,
  yws_h_cast: t21,
  yws_h_catch: t22,
  yws_h_charge: t23,
  yws_h_dash: t24,
  yws_h_dive: t25,
  yws_h_down: t26,
  yws_h_fist: t27,
  yws_h_grab: t28,
  yws_h_guard: t29,
  yws_h_hurt: t30,
  yws_h_idle: t31,
  yws_h_leap: t32,
  yws_h_raise: t33,
  yws_h_roar: t34,
  yws_h_slam: t35,
  yws_h_slash: t36,
  yws_h_spin: t37,
  yws_h_stab: t38,
  yws_h_summon: t39,
  yws_h_sweep: t40,
  yws_h_throw: t41,
  yws_h_transform: t42,
  yws_h_upper: t43,
  yws_h_walk: t44,
  yws_h_windup: t45,
  yws_m_aw1_a: t46,
  yws_m_aw1_b: t47,
  yws_m_aw1_c: t48,
  yws_m_aw2_face: t49,
  yws_m_aw2_wings: t50,
  yws_m_cast: t51,
  yws_m_charge: t52,
  yws_m_claw: t53,
  yws_m_dash: t54,
  yws_m_dive: t55,
  yws_m_down: t56,
  yws_m_fist: t57,
  yws_m_fly: t58,
  yws_m_grab: t59,
  yws_m_guard: t60,
  yws_m_hurt: t61,
  yws_m_idle: t62,
  yws_m_leap: t63,
  yws_m_raise: t64,
  yws_m_roar: t65,
  yws_m_slam: t66,
  yws_m_summon: t67,
  yws_m_sweep: t68,
  yws_m_throw: t69,
  yws_m_transform: t70,
  yws_m_upper: t71,
  yws_m_walk: t72,
  yws_m_windup: t73,
  yws_scythe: t74,
  yws_h_bust: t75,
};
