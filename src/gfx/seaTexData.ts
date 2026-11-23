// 收官 B2：海兽贴图（src/assets/sea，对照表见那里的 说明.md），data URL 内联。
// 立板（2D 画法、模组看得到的那一套）走 beastTex 的登记；HD 场景里的大东西（触须、蛟身、鲸背）由 hd2d/seathings.ts 直接拿这些图建贴图。
import s0 from '../assets/sea/sb_guichi_0.webp?inline';
import s1 from '../assets/sea/sb_guichi_1.webp?inline';
import s2 from '../assets/sea/sb_guichi_2.webp?inline';
import s3 from '../assets/sea/sb_guichi_3.webp?inline';
import s4 from '../assets/sea/sb_guichi_4.webp?inline';
import s5 from '../assets/sea/sb_guichi_5.webp?inline';
import s6 from '../assets/sea/sb_mochu_0.webp?inline';
import s7 from '../assets/sea/sb_mochu_1.webp?inline';
import s8 from '../assets/sea/sb_mochu_2.webp?inline';
import s9 from '../assets/sea/sb_mochu_3.webp?inline';
import s10 from '../assets/sea/sb_mochu_4.webp?inline';
import s11 from '../assets/sea/sb_mochu_5.webp?inline';
import s12 from '../assets/sea/sb_liehai_0.webp?inline';
import s13 from '../assets/sea/sb_liehai_1.webp?inline';
import s14 from '../assets/sea/sb_liehai_2.webp?inline';
import s15 from '../assets/sea/sb_liehai_3.webp?inline';
import s16 from '../assets/sea/sb_liehai_4.webp?inline';
import s17 from '../assets/sea/sb_liehai_5.webp?inline';
import s18 from '../assets/sea/sb_chuanling_0.webp?inline';
import s19 from '../assets/sea/sb_chuanling_1.webp?inline';
import s20 from '../assets/sea/sb_chuanling_2.webp?inline';
import s21 from '../assets/sea/sb_chuanling_3.webp?inline';
import s22 from '../assets/sea/sb_chuanling_4.webp?inline';
import s23 from '../assets/sea/sb_chuanling_5.webp?inline';
import s24 from '../assets/sea/sb_leiyao_0.webp?inline';
import s25 from '../assets/sea/sb_leiyao_1.webp?inline';
import s26 from '../assets/sea/sb_leiyao_2.webp?inline';
import s27 from '../assets/sea/sb_leiyao_3.webp?inline';
import s28 from '../assets/sea/sb_leiyao_4.webp?inline';
import s29 from '../assets/sea/sb_leiyao_5.webp?inline';
import s30 from '../assets/sea/sb_mochu_arm_0.webp?inline';
import s31 from '../assets/sea/sb_mochu_arm_1.webp?inline';
import s32 from '../assets/sea/sb_liehai_body_0.webp?inline';
import s33 from '../assets/sea/sb_liehai_body_1.webp?inline';
import s34 from '../assets/sea/sb_fuhai.webp?inline';
// 收官 B3：灵舟（三阶）、幽灵古船、海底古魔遗迹（石门、残柱、宝箱）、潮汐祭坛
import s35 from '../assets/sea/sb_lingzhou.webp?inline';
import s36 from '../assets/sea/sb_ghostship.webp?inline';
import s37 from '../assets/sea/lz_wupeng.webp?inline';
import s38 from '../assets/sea/lz_xuangui.webp?inline';
import s39 from '../assets/sea/hy_ruin_gate.webp?inline';
import s40 from '../assets/sea/hy_pillar_0.webp?inline';
import s41 from '../assets/sea/hy_pillar_1.webp?inline';
import s42 from '../assets/sea/hy_pillar_2.webp?inline';
import s43 from '../assets/sea/hy_altar.webp?inline';
import s44 from '../assets/sea/hy_chest.webp?inline';
export const SEA_SRC: Record<string, string> = {
  sb_guichi_0: s0,
  sb_guichi_1: s1,
  sb_guichi_2: s2,
  sb_guichi_3: s3,
  sb_guichi_4: s4,
  sb_guichi_5: s5,
  sb_mochu_0: s6,
  sb_mochu_1: s7,
  sb_mochu_2: s8,
  sb_mochu_3: s9,
  sb_mochu_4: s10,
  sb_mochu_5: s11,
  sb_liehai_0: s12,
  sb_liehai_1: s13,
  sb_liehai_2: s14,
  sb_liehai_3: s15,
  sb_liehai_4: s16,
  sb_liehai_5: s17,
  sb_chuanling_0: s18,
  sb_chuanling_1: s19,
  sb_chuanling_2: s20,
  sb_chuanling_3: s21,
  sb_chuanling_4: s22,
  sb_chuanling_5: s23,
  sb_leiyao_0: s24,
  sb_leiyao_1: s25,
  sb_leiyao_2: s26,
  sb_leiyao_3: s27,
  sb_leiyao_4: s28,
  sb_leiyao_5: s29,
  sb_mochu_arm_0: s30,
  sb_mochu_arm_1: s31,
  sb_liehai_body_0: s32,
  sb_liehai_body_1: s33,
  sb_fuhai: s34,
  sb_lingzhou: s35,
  sb_ghostship: s36,
  lz_wupeng: s37,
  lz_xuangui: s38,
  hy_ruin_gate: s39,
  hy_pillar_0: s40,
  hy_pillar_1: s41,
  hy_pillar_2: s42,
  hy_altar: s43,
  hy_chest: s44,
};
