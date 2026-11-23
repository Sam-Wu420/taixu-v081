// 试玩入口：?auto=new&try=bag —— 全新开局，袋里塞好各类别、各品阶的物品和十来件新装备（含玄龟、崩山两套、三种兵器各几阶，兵器槽穿一把），然后自动打开储物袋。
// 收官 C（甲）。perf-acceptance.ts 的 try 分发处调 tryBag(game)。
import type { Game } from '../src/world/game';
import * as C from '../src/world/cultivation';

export function tryBag(g: Game) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    window.clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const h = g.hero;
    h.realm = Math.max(h.realm, 3); h.stage = 0;
    const give: [string, number, number?][] = [
      // 装备：五槽各几阶 + 两套
      ['gear_crown_1', 1], ['gear_crown_4', 1], ['gear_belt_2', 1], ['gear_wrist_3', 1], ['gear_wrist_6', 1], ['gear_ring_0', 1], ['gear_ring_5', 1], ['gear_pendant_2', 1],
      ['gear_xg_crown', 1], ['gear_xg_belt', 1], ['gear_xg_ring', 1], ['gear_xg_pendant', 1], ['gear_bs_wrist', 1], ['gear_bs_belt', 1],
      // 近战兵器：剑、重兵（刀 / 锤）、长枪（枪 / 棍）各几阶
      ['wpn_sword_0', 1], ['wpn_sword_3', 1], ['wpn_sword_6', 1], ['wpn_heavy_1', 1], ['wpn_heavy_4', 1], ['wpn_spear_2', 1], ['wpn_spear_5', 1],
      // 法宝：护身四类 + 攻击法宝（可结本命）
      ['art_huanglin', 1], ['art_xuantie', 1], ['art_shenfeng', 1], ['art_tayun', 1], ['art_lvhuang', 1], ['art_zhuque', 1], ['art_jinguangzhuan', 1],
      // 丹药
      ['pill_juling', 6], ['pill_ningyuan', 2], ['pill_yanshou', 1], ['pill_peiying', 1], ['pill_wanshou', 1], ['pill_huanglong', 5],
      // 材料、灵草
      ['herb_zihou', 3, 80], ['herb_huolong', 2, 150], ['herb_jiuqu', 1, 600], ['mat_yaodan5', 2], ['mat_yaodan8', 1], ['mat_jinjiaolin', 1], ['mat_xuantie', 6], ['mat_lingshi', 24000],
      // 功法、符箓
      ['scroll_leidian', 1], ['scroll_qingyuan', 1], ['tal_thunder', 4], ['tal_tishen', 1], ['tal_tianleizi', 3],
      // 杂物
      ['egg_huli', 1], ['zf_pan2', 1],
    ];
    // 塞东西时先摘掉「获宝」提示的监听（否则几十件东西排队弹获宝动画，挡住储物袋）
    const ls = C.itemListeners.splice(0);
    for (const [id, n, age] of give) C.addItem(h, id, n, age);
    C.addFakeItem(h, 'pill_zhuji', 1, 'dyed', undefined, '鬼市摊贩');
    C.itemListeners.push(...ls);
    // 穿上几件，好看出装备栏、套装进度和对比
    // 兵器槽穿一把（&wpn=wpn_spear_5 之类可换；&wpn=none 不穿，看本命飞剑代握）
    const wp = new URLSearchParams(location.search).get('wpn') ?? 'wpn_sword_3';
    for (const id of ['gear_xg_crown', 'gear_xg_belt', 'gear_wrist_3', ...(wp === 'none' ? [] : [wp])]) { const b = h.bag.find((x) => x.id === id && !x.worn); if (b) C.wearGear(h, b); }
    g.combat.castArtifact('art_huanglin'); g.combat.castArtifact('art_tayun');
    C.bindBond(h, 'art_lvhuang');
    h.hotbar[6] = 'pill:pill_huiqi'; h.hotbar[7] = 'pill:pill_juling';
    g.updateUI(true);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    g.onPanel?.('bag', true);
    (window as unknown as { __bagReady?: boolean }).__bagReady = true;
  }, 6500);
}
