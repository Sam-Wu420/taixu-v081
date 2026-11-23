// 第三十七步：货有产地、宝有主人——坊市 / 拍卖 / 摊贩 / 藏经阁 / 掉落测试：npx tsx tools/test-market.ts
import { createCanvas } from './env';
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { locsOf, LOC_BY_ID } = await import('../src/data/world');
const { itemDef } = await import('../src/data/items');
const M = await import('../src/data/market');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
void createCanvas;
let fails = 0;
const ok = (c: any, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const T = g.towns;
const yd = (id: string) => M.yaodanLv(id);

type Seen = { owned: string[]; maxYd: Record<string, number>; ydPrice: Record<string, number[]>; items: Record<string, Set<string>> };
const seen: Seen = { owned: [], maxYd: {}, ydPrice: {}, items: {} };
const kinds = ['market', 'pill', 'artifact', 'talisman'] as const;
for (const map of ['tiannan', 'luanxing', 'dajin'] as const) {
  for (const l of locsOf(map)) {
    if (!['city', 'town', 'sect', 'isle'].includes(l.type as string)) continue;
    const z = M.zoneOfLoc(l), pz = M.pzOf(z);
    seen.items[pz] ??= new Set();
    for (let month = 0; month < 6; month++) {
      g.day = month * 30 + 3;
      for (const k of kinds) {
        const sh = T.shop(l, k);
        for (const s of sh.stock) {
          if (s.id === 'mat_jinleizhu' && l.id === 'miaoyin') continue;   // v0.70：金雷竹只在清音门出售（特例）
          if (M.canonOwned(s.id)) seen.owned.push(`${l.name}:${itemDef(s.id).name}`);
          seen.items[pz].add(s.id);
          const lv = yd(s.id);
          if (lv) { seen.maxYd[pz] = Math.max(seen.maxYd[pz] ?? 0, lv); (seen.ydPrice[pz + lv] ??= []).push(s.price); }
        }
      }
    }
  }
}
ok(seen.owned.length === 0, `坊市不卖原设有主之宝 ${seen.owned.slice(0, 5).join(' ')}`);
ok((seen.maxYd.TN ?? 0) <= 3, `南荒坊市妖丹最高 ${seen.maxYd.TN ?? 0} 级（≤3）`);
ok((seen.maxYd.LX ?? 0) >= 5 && (seen.maxYd.LX ?? 0) <= 6, `沧溟海坊市妖丹最高 ${seen.maxYd.LX} 级（5–6）`);
ok((seen.maxYd.DJ ?? 0) <= 4, `中州坊市妖丹最高 ${seen.maxYd.DJ ?? 0} 级（≤4）`);
const avg = (a?: number[]) => (a && a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const tn2 = avg(seen.ydPrice.TN2), lx2 = avg(seen.ydPrice.LX2);
console.log(`  二级妖丹：南荒 ${tn2.toFixed(0)}  沧溟海 ${lx2.toFixed(0)}`);
ok(!(tn2 < lx2 * 3), '二级妖丹在南荒至少贵三倍');
const y5 = itemDef('mat_yaodan5');
ok(y5.price * M.priceMul(y5, 'tiannan') > 5 * y5.price * M.priceMul(y5, 'luanxing'), `五级妖丹单价：南荒 ${Math.round(y5.price * M.priceMul(y5, 'tiannan'))} / 沧溟海 ${Math.round(y5.price * M.priceMul(y5, 'luanxing'))}`);
ok(!seen.items.TN.has('art_bamen') && !seen.items.TN.has('egg_jiao'), '南荒不卖沧溟海的八门金光镜仿品、蛟卵');
ok(!seen.items.LX.has('art_jinfu') && !seen.items.LX.has('art_wulong'), '沧溟海不卖青霞谷的金蚨子母刃、墨蛟法器');
ok(!seen.items.TN.has('pill_zhuji') && !seen.items.DJ.has('pill_zhuji'), '南荒 / 中州坊市不卖筑基丹（七派把持，只上拍卖或宗门兑换）');

// 卖出价按价区
const sh0 = T.shop(LOC_BY_ID.get('tianxing') ?? locsOf('luanxing')[0], 'market'), sh1 = T.shop(LOC_BY_ID.get('huangfeng')!, 'market');
ok(T.sellPrice(sh1, 'mat_yaodan3') > T.sellPrice(sh0, 'mat_yaodan3') * 4, `三级妖丹卖给南荒 ${T.sellPrice(sh1, 'mat_yaodan3')} / 卖给沧溟海 ${T.sellPrice(sh0, 'mat_yaodan3')}`);

// 拍卖会
const auc: Record<string, number> = {}; const aOwned: string[] = []; let tnTianyang = false;
for (const map of ['tiannan', 'luanxing', 'dajin'] as const) for (const l of locsOf(map)) {
  if (!(l.type === 'city' || l.type === 'isle')) continue;
  const pz = M.pzOf(M.zoneOfLoc(l));
  for (let q = 0; q < 30; q++) {
    g.day = q * 90 + 82;
    for (const lot of T.auctionLots(l)) {
      if (M.canonOwned(lot.id)) aOwned.push(lot.id);
      if (lot.id === 'art_tianyang' && pz === 'TN') tnTianyang = true;
      const lv = yd(lot.id); if (lv) auc[pz] = Math.max(auc[pz] ?? 0, lv);
    }
  }
}
console.log('  拍卖会最高妖丹', JSON.stringify(auc));
ok(aOwned.length === 0, `拍卖会不拍原设有主之宝 ${aOwned.slice(0, 4).join(' ')}`);
ok(!tnTianyang, '南荒拍卖会拍不到冷天仁的天阳鎏金针');
ok((auc.TN ?? 0) <= 5 && (auc.LX ?? 0) >= 6 && (auc.LX ?? 0) <= 7 && (auc.DJ ?? 0) <= 6, '拍卖会：南荒 ≤5 级、沧溟海 6–7 级、中州 ≤6 级；从无八九级');

// 摊贩
let npcBad = 0, npcYd = 0;
for (const d of g.npcs.list.filter((d) => d.alive && (d.faction === 'merchant' || d.faction === 'rogue')).slice(0, 120)) {
  for (const s of g.stall.goods(d) as { id: string }[]) {   /* 收官 D：摊贩卖的是自己袋里的真东西（world/stall.ts），不再按种子现编 */ if (M.canonOwned(s.id)) npcBad++; npcYd = Math.max(npcYd, yd(s.id)); }
}
ok(npcBad === 0, '摊贩不卖原设有主之宝');
ok(npcYd <= 4, `摊贩最高妖丹 ${npcYd} 级（≤4）`);

// 藏经阁
(g.ws as any).sect = { id: 'huangfeng', rank: 3, contrib: 0, joined: 0 };
const lib = T.library(LOC_BY_ID.get('huangfeng')!);
const foreign = lib.stock.filter((s) => { const r = M.ruleOf(itemDef(s.id)); return r.homes && !r.homes.includes('huangfeng'); });
ok(foreign.length === 0, `青霞谷藏经阁没有别派秘传 ${foreign.map((s) => s.id).join(' ')}`);
ok(lib.stock.every((s) => !M.canonOwned(s.id)), '藏经阁没有原设独门秘术');

// 掉落
const { pickArt } = await import('../src/world/sites');
let dropBad = 0;
g.hero.realm = 4;
for (let i = 0; i < 3000; i++) { const a = pickArt(4, i % 5 === 0); if (a && M.canonOwned(a)) dropBad++; const s = g.combat.randomScroll(4); if (s && M.canonOwned(s)) dropBad++; }
ok(dropBad === 0, '随机掉落不出原设有主之宝 / 独门秘术');

// 近战兵器：上架规则认得兵器；法器阁、小城坊市摆兵器（自己的种子）；老的拍卖会随机池不混进兵器
{
  const { WEAPON_ITEMS, isWeaponItem } = await import('../src/data/gear');
  const r = (id: string) => M.ruleOf(itemDef(id));
  ok(r('wpn_sword_0').g === 1 && r('wpn_heavy_3').g === 3 && r('wpn_spear_5').g === 4 && r('wpn_spear_5').minLv === 5 && r('wpn_sword_6').g === 5, '上架规则：兵器一二品处处有、三四品按档、五品雄城以上、六品不卖');
  ok(!M.sellableAt(itemDef('wpn_sword_6'), 'tiannan' as any, 6, undefined, undefined, true) && M.sellableAt(itemDef('wpn_sword_0'), 'tiannan' as any, 1), '六品兵器哪儿都不卖；凡铁剑村镇就有');
  let wArt = 0, wMkt = 0, shops = 0, smallMkt = 0, sword0 = 0, aucW = 0;
  for (const map of ['tiannan', 'luanxing'] as const) for (const l of locsOf(map)) {
    if (!['city', 'town', 'sect', 'isle'].includes(l.type as string)) continue;
    g.day = 33;
    const a = T.shop(l, 'artifact'); shops++; wArt += a.stock.filter((s) => isWeaponItem(itemDef(s.id))).length;
    if (M.cityTier(l) <= 2) { const m = T.shop(l, 'market'); smallMkt++; wMkt += m.stock.filter((s) => isWeaponItem(itemDef(s.id))).length; if (m.stock.some((s) => s.id === 'wpn_sword_0')) sword0++; }
    for (const lot of T.auctionLots(l)) if (isWeaponItem(itemDef(lot.id))) aucW++;
  }
  ok(wArt >= shops * 2, `法器阁每家都摆两三件兵器（${shops} 家共 ${wArt} 件）`);
  ok(sword0 === smallMkt && wMkt >= smallMkt, `村镇小城的坊市都能买到凡铁剑（${sword0}/${smallMkt}）`);
  ok(aucW === 0, '拍卖会的随机拍品池里没有兵器（老的随机序列不变）');
  const s1 = JSON.stringify(T.shop(LOC_BY_ID.get('yuejing')!, 'artifact').stock), s2 = JSON.stringify(T.shop(LOC_BY_ID.get('yuejing')!, 'artifact').stock);
  ok(s1 === s2, '同一个月同一家法器阁的货（含兵器）每次一样');
  ok(WEAPON_ITEMS.every((d) => M.priceMul(d, 'tiannan' as any) > 0), '兵器有价区倍率');
}

console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
