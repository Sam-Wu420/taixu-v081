// 第五步：城镇与宗门——坊市、丹药铺、法器阁、酒楼、客栈、传送阵、拍卖会；拜入宗门、贡献、任务、藏经阁、俸禄、晋升
import { modx } from '../mod/hooks';
import { ZHEN } from '../data/zhenfa';
import type { Game } from './game';
import { LOCATIONS, LOC_BY_ID, locHere, LocDef, WORLD_SCALE, ACTIVE_MAP } from '../data/world';
import { ITEM_LIST, itemDef, ItemDef, herbAgeMul } from '../data/items';
import { ENEMY_LIST, ENEMIES } from '../data/enemies';
import { REALMS } from '../data/realms';
import * as C from './cultivation';
import { mulberry32 } from '../core/rng';
import { isWeaponItem, WEAPON_ITEMS } from '../data/gear';
import { NODE_CELL } from './nodes';
import type { DNode, DOpt, Shop, ShopStock } from './modal';
import { SECT_RANKS, SECT_RANK_NEED, SECT_RANK_REALM, SectTask, cachedShopStock } from './worldstate';
import { dirName } from './sites';
import { XSECTS, OLD_SECT, X_DEMON, X_BY_ID, sectDao, DAO_NAME, MY_SECT_ID } from '../data/sects';
import { GONGFA } from '../data/skills';
import { zoneOfLoc, shopLevel, pzOf, sellableAt, priceMul, yaodanCap, yaodanLv, ruleOf, sectCanOffer, canonOwned, ZONE_NAME, cityTier, auctionLevel, TIER_NAME, type Zone } from '../data/market';

/** 玩家所在处的市集分区：取本图最近的有名地点 */
export function zoneHere(g: Game): Zone {
  const px = g.player.x / WORLD_SCALE, py = g.player.y / WORLD_SCALE;
  let best: LocDef | null = null, bd = Infinity;
  for (const l of LOCATIONS) { if (l.minor || (l.type !== 'city' && l.type !== 'town' && l.type !== 'sect' && l.type !== 'isle')) continue; const d = Math.hypot(l.x - px, l.y - py); if (d < bd) { bd = d; best = l; } }
  return zoneOfLoc(best);
}

const DEMON = new Set(['guiling', 'hehuan', 'yuling', 'qianhuan', 'tiansha', 'yinluo', 'tianmo', ...X_DEMON]);
/** 各宗门藏经阁特色功法/法术（与原设对应） */
export const SECT_LIB: Record<string, string[]> = {
  huangfeng: ['scroll_qingyuan', 'scroll_art_qingyuanmang', 'scroll_art_yujian', 'scroll_art_huoshe', 'scroll_luoyan', 'scroll_tianyan', 'scroll_art_hutijiandun', 'scroll_art_jinren', 'scroll_art_shenxing', 'scroll_art_fengdun'],
  yanyue: ['scroll_art_bingzhui', 'scroll_art_huichun', 'scroll_art_hanbing', 'scroll_art_xuanbing', 'scroll_lianqi', 'scroll_art_shuidan', 'scroll_art_mihun', 'scroll_art_shuangren'],
  lingshou: ['scroll_art_yushou', 'scroll_art_tengfu', 'scroll_art_feisha', 'scroll_art_qingmu'],
  luoyun: ['scroll_art_huichun', 'scroll_art_tengfu', 'scroll_art_qingteng', 'scroll_art_yimu', 'scroll_lianqi', 'scroll_art_qingmu'],
  gujian: ['scroll_art_yujian', 'scroll_art_jianying'],
  jujian: ['scroll_art_yujian', 'scroll_art_jujianshu', 'scroll_art_fenjin', 'scroll_art_jianhe'],
  huadao: ['scroll_art_jinren', 'scroll_art_fenjin', 'scroll_art_qingfeng'],
  tianque: ['scroll_art_tiebu', 'scroll_art_jinzhong', 'scroll_art_feishi', 'scroll_art_huangsha'],
  qingxu: ['scroll_art_huichun', 'scroll_art_yufeng', 'scroll_art_qingteng', 'scroll_art_qingmu', 'scroll_art_dingshen'],
  qianzhu: ['scroll_art_kuilei', 'scroll_art_kunzhen'],
  yuling: ['scroll_art_yushou', 'scroll_art_yinhun'],
  tiansha: ['scroll_art_xuedun', 'scroll_art_xuelian'],
  jiyin: ['scroll_xuanyin', 'scroll_art_xueying', 'scroll_art_yinhun'],
  baiqiao: ['scroll_art_kuilei', 'scroll_art_kunzhen', 'scroll_art_diandao'],
  guiling: ['scroll_art_xueying', 'scroll_art_yinhun', 'scroll_art_xuedun', 'scroll_art_shihun', 'scroll_art_yinfeng'],
  tianmo: ['scroll_tuotian', 'scroll_art_xuelian', 'scroll_art_xuedun', 'scroll_art_hualong', 'scroll_art_shihun'],
  hehuan: ['scroll_art_xueying', 'scroll_art_yinhun'],
  yinluo: ['scroll_art_yinhun', 'scroll_art_xuelian', 'scroll_art_shihun'],
  taiyi: ['scroll_art_zhangxin', 'scroll_art_yinlei', 'scroll_art_leiwang', 'scroll_art_benlei', 'scroll_art_jiutianlei', 'scroll_art_leiguang'],
  tianlan: ['scroll_art_jingang', 'scroll_art_xiangjia', 'scroll_art_hualong', 'scroll_art_jinzhong'],
  qixuan: ['scroll_art_jingang', 'scroll_art_yufeng', 'scroll_art_feishi', 'scroll_art_qingfeng'],
};
// v0.60：新宗门的藏经阁（镇派心法 + 三门秘传 + 通行法术）；旧有各派补上镇派心法
for (const s of XSECTS) SECT_LIB[s.id] = ['scroll_' + s.gf, ...s.arts.map((a) => 'scroll_art_' + a), ...s.lib.map((a) => 'scroll_art_' + a)];
for (const [id, o] of Object.entries(OLD_SECT)) (SECT_LIB[id] ??= []).unshift('scroll_' + o.gf);
/** 山门前的一句介绍：镇派心法、藏经阁里的招牌 */
function sectBrief(id: string): string {
  const gf = GONGFA[X_BY_ID[id]?.gf ?? OLD_SECT[id]?.gf ?? ''];
  if (!gf) return '';
  const arts = (SECT_LIB[id] ?? []).filter((s) => s.startsWith('scroll_art_')).slice(0, 4).map((s) => itemDef(s).name).join('');
  return `\n\n镇派心法《${gf.name}》${arts ? `；藏经阁有${arts}等` : ''}。${X_BY_ID[id] ? `「${X_BY_ID[id].motto}」` : ''}`;
}

export interface AuctionLot { id: string; base: number; price: number;
  /** won＝你拍得 · lost＝别人拍走 · pass＝流拍 */
  done?: 'won' | 'lost' | 'pass'; who?: string; top?: boolean; age?: number;
  /** P11d：拍走的 NPC（id）、成交价、落到托手里（东西回了拍卖行） */
  whoId?: string; paid?: number; boughtIn?: boolean;
  /** P11d：寄拍人（价区里真实的 NPC，成交后拿九成） */
  from?: string; fromName?: string;
  /** 江湖篇：拍卖托（null = 此拍品没有托）、托已罢手、已被神识看穿；P11d：托是入座的哪位（NPC id） */
  shill?: string | null; shillId?: string; shillOut?: boolean; exposed?: boolean }

/** v0.70：清音门坊市的金雷竹底价（灵石） */
export const JINLEI_PRICE = 280000;

export class Towns {
  game: Game;
  constructor(game: Game) { this.game = game; }

  canEnter(l: LocDef | null) { return !!l && (l.type === 'city' || l.type === 'town' || l.type === 'sect' || (l.type === 'isle' && !l.minor) || l.id === 'tainan' || !!modx?.canEnter(l)); }
  isMajorTown(l: LocDef) { return l.type === 'city' || l.id === 'tianxing' || l.id === 'tainan' || l.id === 'kuixing'; }
  hasTeleport(l: LocDef) { return (l.type === 'city' && !l.minor) || (l.type === 'sect' && !!l.major) || l.id === 'tianxing' || l.id === 'chuansong' || l.id === 'kuixing'; }
  occupied(l: LocDef) { const ws = this.game.ws; return !!ws.flags.yueFallen && l.ox > 425 && l.ox < 590 && l.oy > 495 && l.map === 'tiannan' && (l.type === 'city' || l.type === 'town') && ws.rep > -20; }

  open(l: LocDef, fac?: string) {
    const g = this.game;
    if (modx?.openLoc(l)) return;
    // 城镇破坏（world/townwreck.ts）：欠着损坏账不还的城拒之门外（传送阵、悬赏榜照常）；半塌的铺子由掌柜在门口的临时摊上办事
    if (!this.twPass) {
      const n = g.combat?.wreck?.town.beforeOpen(l, fac, () => { this.twPass = true; try { this.open(l, fac); } finally { this.twPass = false; } });
      if (n) { g.openDialog(n); return; }
    }   // v0.56：模组的险地 / 秘地（进城也会在这里发 enter 事件）
    if (this.hasTeleport(l) && !g.ws.tp.includes(l.id)) { g.ws.tp.push(l.id); g.toast(`激活了${l.name}的传送阵`, 'good'); }
    g.openModal({ kind: 'town', loc: l, fac });
  }

  private twPass = false;
  // ------------------------------------------------------------ 商店
  tierOf(l: LocDef) { return shopLevel(l); }
  /**
   * 第三十七步：货按原设产地与稀有度上架，价格按价区浮动（妖丹：沧溟海便宜，南荒贵得离谱）
   * 第四十步：城池分五档——越大的城，货越多、越好：小镇多是大路货；大城几乎不摆凡品；雄城、天下名城的铺子里能见到拍卖会级的东西
   */
  shop(l: LocDef, kind: 'market' | 'pill' | 'artifact' | 'talisman'): Shop {
    const g = this.game;
    const month = Math.floor(g.day / 30);
    const z = zoneOfLoc(l), lvl = shopLevel(l), pz = pzOf(z), T = cityTier(l);
    const { key: cacheKey, stock } = cachedShopStock(g.ws, `town:${l.id}:${kind}`, month, () => {
      const rnd = mulberry32(((l.x * 1000 + l.y) | 0) * 31 + month * 7 + kind.length);
      const yCap = yaodanCap(pz, Math.min(3, lvl), rnd);
      const base: (it: ItemDef) => boolean = kind === 'pill' ? (it) => it.type === 'pill' : kind === 'artifact' ? (it) => it.type === 'artifact' : kind === 'talisman' ? (it) => it.type === 'talisman' || it.type === 'scroll' : (it) => it.type === 'herb' || it.type === 'material' || (it.type === 'pill' && it.tier <= 1) || it.type === 'talisman';
      const minTier = T >= 5 ? 2 : T >= 4 ? (kind === 'market' ? 1 : 2) : T >= 3 ? 1 : 0;
      const filt = (it: ItemDef) => base(it) && (it.tier >= minTier || (kind === 'market' && it.type === 'talisman' && it.tier >= 1));
      const pool = ITEM_LIST.filter((it) => filt(it) && it.id !== 'pill_zhuji' && sellableAt(it, z, lvl, yCap, l.id));
      const target = Math.min(lvl, 4);
      const gradeOf = (it: ItemDef) => (yaodanLv(it.id) ? (yaodanLv(it.id) >= yCap ? Math.min(3, lvl) : 1) : ruleOf(it).g);
      const wt = pool.map((it) => { const gr = gradeOf(it); return gr >= target ? 1.6 : gr === target - 1 ? 1 : gr === target - 2 ? 0.45 : 0.15; });
      const tot = wt.reduce((a, b) => a + b, 0);
      const pickW = () => { let r = rnd() * tot; for (let i = 0; i < pool.length; i++) { r -= wt[i]; if (r <= 0) return pool[i]; } return pool[pool.length - 1]; };
      const built: ShopStock[] = [];
      const k = 1 - this.game.hearts.bonus('luck');
      const add = (it: ItemDef) => {
        if (built.some((s) => s.id === it.id)) return;
        const g4 = ruleOf(it).g >= 4 && !yaodanLv(it.id) ? (T >= 5 ? 1.1 : 1.25) : 1;
        const age: number | undefined = undefined;   // v0.70：灵草不计年份
        built.push({ id: it.id, price: Math.max(1, Math.round(it.price * herbAgeMul(it, age ?? 0) * priceMul(it, z) * g4 * (0.9 + rnd() * 0.4) * k * (g.ws.rep < -40 ? 1.3 : 1) * (g.enyuan?.priceMul(l.id) ?? 1) /* 恩怨重做：本地口碑好打九折、坏了加价（按月随货单定价） */)), n: it.type === 'artifact' || it.type === 'scroll' || ruleOf(it).g >= 4 ? 1 : 1 + Math.floor(rnd() * (it.tier <= 1 ? 8 : 3 + (T >= 4 ? 2 : 0))), age });
      };
      const n = (kind === 'market' ? [8, 8, 10, 13, 16, 20] : [6, 6, 7, 9, 12, 15])[T] ?? 8;
      for (let i = 0; i < n * 4 && built.length < n && pool.length; i++) add(pickW());
      if (kind === 'market' && pz === 'LX') for (let lv = Math.max(1, yCap - 2); lv <= yCap; lv++) { const it = itemDef(`mat_yaodan${lv}`); if (it && rnd() < 0.75) add(it); }
      if (kind === 'pill' && pz === 'LX' && lvl >= 3 && rnd() < (T >= 5 ? 0.6 : 0.3)) { const it = itemDef('pill_zhuji'); add(it); const s0 = built.find((s) => s.id === it.id); if (s0) s0.n = 1; }
      if (kind === 'pill') for (const id of ['pill_huiqi', 'pill_liaoshang']) if (!built.some((s) => s.id === id)) { const it = itemDef(id); built.push({ id, price: Math.round(it.price * (0.9 + rnd() * 0.3)), n: 5 + Math.floor(rnd() * 6) }); }
      if (kind === 'market') for (const id of ['tal_pojin', 'tal_huifu']) if (!built.some((s) => s.id === id)) { const it = itemDef(id); built.push({ id, price: Math.round(it.price * (0.9 + rnd() * 0.3)), n: 3 + Math.floor(rnd() * 5) }); }
      {
        const star = l.id === 'yuanwu' || l.id === 'tianxing';
        const put = (id: string, cnt: number, kk = 1) => { if (built.some((s0) => s0.id === id)) return; const it = itemDef(id); built.push({ id, price: Math.max(1, Math.round(it.price * kk * (0.9 + rnd() * 0.3) * (star ? 0.85 : 1))), n: cnt }); };
        if (kind === 'market') {
          put('zf_qi', 12 + Math.floor(rnd() * 18));
          if (rnd() < (star ? 1 : 0.6)) put('zf_pan1', 1 + Math.floor(rnd() * 2));
          if (rnd() < 0.5 || star) put('zf_mat_mu', 4 + Math.floor(rnd() * 8));
          if (rnd() < 0.5 || star) put('zf_mat_mo', 2 + Math.floor(rnd() * 5));
          if (T >= 3 && (rnd() < 0.4 || star)) put('zf_mat_yu', 1 + Math.floor(rnd() * 4));
          if (T >= 3 && (rnd() < 0.3 || star)) put('zf_pan2', 1, 1.1);
          if (T >= 5 && rnd() < (star ? 0.6 : 0.2)) put('zf_pan3', 1, 1.2);
        }
        if (kind === 'talisman' || (kind === 'market' && star)) {
          const zPool = ZHEN.filter((zx) => zx.src === 'shop' && (zx.zd <= Math.max(1, T - 1) || star));
          const zn = star ? zPool.length : 1 + Math.floor(rnd() * 2);
          for (let i = 0; i < zn && zPool.length; i++) { const zx = zPool.splice(Math.floor(rnd() * zPool.length), 1)[0]; put('zt_' + zx.id, 1); }
          if (rnd() < 0.6 || star) put('zf_zhui', 1 + Math.floor(rnd() * 3));
          if (T >= 2 && (rnd() < 0.35 || star)) put('zf_qi2', 6 + Math.floor(rnd() * 6));
        }
      }
    // 收官 B3：灵舟——大城的法器阁常有乌篷灵舟，雄城以上偶有破浪灵舟。用自己的种子序列追加，不动上面抽货的随机数
    if (kind === 'artifact' && T >= 3) {
      const r2 = mulberry32(((l.x * 1000 + l.y) | 0) * 131 + month * 17 + 0xb0a7);
      for (const b of [{ id: 'lz_wupeng', lv: 3, ch: 0.85 }, { id: 'lz_polang', lv: 4, ch: 0.45 }]) if (T >= b.lv && r2() < b.ch) { const it = itemDef(b.id); built.push({ id: b.id, price: Math.round(it.price * priceMul(it, z) * (0.95 + r2() * 0.2)), n: 1 }); }
    }
    // 恩怨重做：坊市常备易容丹、传讯符。用自己的种子序列追加，不动上面抽货的随机数
    if (kind === 'market') {
      const r4 = mulberry32(((l.x * 1000 + l.y) | 0) * 191 + month * 37 + 0xfe0d);
      for (const id of ['pill_yirong', 'tal_chuanxun']) if (!built.some((s0) => s0.id === id)) { const it = itemDef(id); built.push({ id, price: Math.round(it.price * (0.9 + r4() * 0.3)), n: 2 + Math.floor(r4() * 4) }); }
    }
    // 近战兵器：法器阁每月摆两三件（城越大品阶越高，五品以上只能打出来）；村镇、小城的坊市也有一两件凡铁兵器，
    // 头一回进坊市就买得到一把凡铁剑。同样用自己的种子序列追加，不动上面抽货的随机数
    if (kind === 'artifact' || (kind === 'market' && T <= 2)) {
      const r3 = mulberry32(((l.x * 1000 + l.y) | 0) * 173 + month * 29 + (kind === 'market' ? 0x3a11 : 0x3a7f));
      const lo = kind === 'market' ? 0 : Math.max(0, T - 2), hi = kind === 'market' ? 0 : Math.min(4, T);
      const put = (it: ItemDef | undefined) => { if (it && !built.some((s0) => s0.id === it.id)) built.push({ id: it.id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * (0.95 + r3() * 0.2))), n: 1 }); };
      const nW = kind === 'market' ? 1 + (r3() < 0.4 ? 1 : 0) : 2 + Math.floor(r3() * 2);
      for (let i = 0; i < nW; i++) { const t = lo + Math.floor(r3() * (hi - lo + 1)); put(WEAPON_ITEMS[Math.floor(r3() * 3) * 7 + t]); }
      if (kind === 'market') put(itemDef('wpn_sword_0'));
    }
    // v0.70：金雷竹——人界只有清音门的坊市出售，每月至多一根，价比连城
    if (kind === 'market' && l.id === 'miaoyin' && !built.some((s0) => s0.id === 'mat_jinleizhu')) built.push({ id: 'mat_jinleizhu', price: Math.round((JINLEI_PRICE + rnd() * 40000) * ((g.ws.flags as any).zl?.st === 'done' ? 0.9 : 1)), n: 1 });   // 清音门客卿长老让一成
    // 好货排前
    built.sort((a, b) => itemDef(b.id).tier - itemDef(a.id).tier || b.price - a.price);
    return built;
  });
    // 第五十一步「天道」·资源限供：灵药按月按产区发货，发罄的货本月不再上架（天骄档不限）
    const soldOut = g.daoxin?.applyQuota(stock, l) ?? [];
    const title = { market: '坊市', pill: '丹药铺', artifact: '法器阁', talisman: '符箓斋' }[kind];
    const note = pz === 'LX' ? '海外坊市：妖丹、海兽材料便宜，灵草稀贵' : pz === 'DJ' ? '中州坊市：品类齐全，价钱也贵' : '南荒坊市：灵草不缺，妖丹奇贵';
    const tierNote = ['', '小地方，多是大路货。', '寻常城池，货色平平。', '大城，凡品已不上架。', '雄城，偶有拍卖会级的好货。', '天下名城，奇珍异宝云集。'][T];
    return { title: `${l.name} · ${title}`, desc: `【${TIER_NAME[T]}】${tierNote}每月换一批货，售完需待下月。` + note + (g.daoxin?.quotaNote(l) ?? '') + (soldOut.length ? `本月${soldOut.slice(0, 3).join('、')}已被同道买空。` : ''), stock, sellRate: 0.5, zone: z, loc: l.id, cacheKey };
  }
  /** 卖给这家店能得多少灵石（按价区） */
  sellPrice(shop: Shop, id: string, age = 0) {
    const it = itemDef(id);
    const z = (shop.zone as Zone | undefined) ?? zoneHere(this.game);
    return Math.max(1, Math.round(it.price * priceMul(it, z) * shop.sellRate * herbAgeMul(it, age) * (this.game.jianghu?.credSellMul() ?? 1)));   // 江湖篇：信义差的人坊市压价
  }
  buy(shop: Shop, s: ShopStock) {
    const g = this.game, h = g.hero;
    if (s.fake && s.ident) {
      g.toast('你已看破此物是伪劣假货，莫花冤枉钱！', 'warn');
      return false;
    }
    if (shop.currency === 'contrib') {
      const ss = g.ws.sect; if (!ss || ss.contrib < s.price) { g.toast('贡献不足', 'warn'); return false; }
      ss.contrib -= s.price;
    } else {
      if (C.bagCount(h, 'mat_lingshi') < s.price) { g.toast('灵石不足', 'warn'); return false; }
      C.removeItem(h, 'mat_lingshi', s.price);
    }
    if (s.fake) C.addFakeItem(h, s.id, 1, s.fake, s.seller, s.sellerName, s.age);
    else C.addItem(h, s.id, 1, s.age);
    g.daoxin?.useQuota(shop.loc ? LOC_BY_ID.get(shop.loc) : null, s.id, 1);   // 天道篇：从本月台账里扣掉
    s.n--;
    if (s.n <= 0) shop.stock.splice(shop.stock.indexOf(s), 1);
    // 若模组钩子复制了 shop.stock，同步扣减持久缓存里的对应货槽，确保关页重开绝不回滚
    if (shop.cacheKey && g.ws.shopCache?.[shop.cacheKey] && g.ws.shopCache[shop.cacheKey] !== shop.stock) {
      const arr = g.ws.shopCache[shop.cacheKey];
      const idx = arr.findIndex((x) => x.id === s.id && x.age === s.age && x.fake === s.fake);
      if (idx >= 0) { arr[idx].n--; if (arr[idx].n <= 0) arr.splice(idx, 1); }
    }
    g.toast(`购得 ${itemDef(s.id).name}`, 'good');
    return true;
  }
  sell(shop: Shop, id: string, age?: number) {
    const g = this.game, h = g.hero; const it = itemDef(id);
    if (id === 'mat_lingshi' || it.price <= 0) return false;
    // 收官 C：已穿的不能卖（装备 gear 打了记号的那件不算；法衣之类按 id 穿着的，只剩穿着那一件时不卖）
    const st = h.bag.find((b) => b.id === id && !b.worn && (age === undefined || b.age === age)); if (!st) { if (h.bag.some((b) => b.id === id && b.worn)) g.toast('穿在身上的不能卖，先卸下来。', 'warn'); return false; }
    if (Object.values(h.equip ?? {}).includes(id) && C.bagCount(h, id) <= 1) { g.toast('穿在身上的不能卖，先收起来。', 'warn'); return false; }
    if (h.hotbar.includes(id) && C.bagCount(h, id) <= 1) h.hotbar = h.hotbar.map((x) => (x === id ? null : x));
    C.removeItem(h, id, 1, st.age ?? 0);
    const p = this.sellPrice(shop, id, st.age ?? 0);
    C.addItem(h, 'mat_lingshi', p);
    return true;
  }

  // ------------------------------------------------------------ 客栈 / 酒楼
  rest(l: LocDef) {
    const g = this.game, h = g.hero;
    const cost = l.type === 'city' ? 5 : 2;
    if (C.bagCount(h, 'mat_lingshi') < cost) { g.toast('灵石不足', 'warn'); return; }
    C.removeItem(h, 'mat_lingshi', cost);
    h.hp = 1; h.mp = 1; g.day += 1; g.save(0);
    g.toast(`在${l.name}客栈歇息一夜，气血法力尽复，已自动存档。`, 'good');
  }
  tavern(l: LocDef): DNode {
    const g = this.game;
    const lines: string[] = [];
    const ev = g.events.upcoming().slice(0, 2);
    for (const e of ev) lines.push(e);
    const near = LOCATIONS.filter((x) => x.type === 'secret' && Math.hypot(x.x - l.x, x.y - l.y) < 70 && !g.isExplored(x.x * WORLD_SCALE, x.y * WORLD_SCALE));
    if (near.length) { const x = near[Math.floor(Math.random() * near.length)]; g.markKnown(x); lines.push(`邻桌的散修压低声音：「听说「${x.name}」那边有座古修洞府，禁制松动了……」（地图已标出）`); }
    const recent = g.ws.news.slice(-3).reverse().map((n) => `坊间都在传：${n.text}`);
    lines.push(...recent);
    // 江湖篇：说书先生的消息也走 Rumor 管道（多半是真的，偶尔是有人借他的嘴放的饵）
    if (g.jianghu && Math.random() < 0.45 && !g.jianghu.activeRumors().some((r) => r.src === 'book')) { const r = g.jianghu.tavernRumor(); if (r) lines.unshift(`说书先生醒木一拍：「${r.text}」（地图上已以「讯」标出——消息未必是真的）`); }
    if (!lines.length) lines.push('酒楼里人声嘈杂，说的都是些家长里短。');
    const back = () => this.tavern(l);
    const jOpts = g.jianghu ? [
      ...g.jianghu.verifyOpts(null, undefined, '酒楼掌柜', back),
      ...(g.jianghu.activeRumors().some((r) => !r.exposed && !r.byPlayer) ? [{ label: '花灵石买消息来源（这消息是谁放出来的？）', act: () => g.jianghu.buySourceNode(back) }] : []),
      { label: '让说书先生放风（散布假情报，调虎离山）', hint: '花灵石把仇家骗去扑空；他若活着回来，多半知道是你', act: () => g.jianghu.spreadRumorNode(back) },
    ] : [];
    return { speaker: `${l.name} · 酒楼`, title: '打听消息', text: lines.join('\n\n'), options: [{ label: '再要一壶酒（2 灵石）', disabled: C.bagCount(g.hero, 'mat_lingshi') < 2, act: () => { C.removeItem(g.hero, 'mat_lingshi', 2); return this.tavern(l); } }, ...jOpts, { label: '离开', act: () => null }] };
  }

  // ------------------------------------------------------------ 传送阵
  tpCost(a: LocDef, b: LocDef) { return Math.round(20 + Math.hypot(a.x - b.x, a.y - b.y) * 1.6); }
  teleportTo(from: LocDef, to: LocDef) {
    const g = this.game, cost = this.tpCost(from, to);
    if (C.bagCount(g.hero, 'mat_lingshi') < cost) { g.toast('灵石不足', 'warn'); return false; }
    C.removeItem(g.hero, 'mat_lingshi', cost);
    const z = g.terrain.locZones[LOCATIONS.indexOf(to)];
    let tx = to.x * WORLD_SCALE, ty = to.y * WORLD_SCALE + (z ? z.ry * 0.9 : 300);
    // P10：成片街坊的城落在城里的传送阵前（不然要落到两三万见方的城外）
    const tp = g.space?.anchor(to, 'tp');
    if (tp) { tx = tp.x; ty = tp.y; }
    for (let r = 0; r < 1500 && g.terrain.walkFactor(tx, ty) <= 0; r += 60) ty += 60;
    g.closeModal(true);
    // 位移本身不变（落点、耗时一天、提示）；有立体画面时包在虚空挪移的过程里，没有就立刻执行
    g.nuoyi.start({ kind: 'array', to: { x: tx, y: ty }, arrive: () => {
      g.teleport(tx, ty);
      g.day += 1;
      g.toast(`传送阵灵光一闪——已至${to.name}（耗费 ${cost} 灵石）`, 'good');
    } });
    return true;
  }

  // ------------------------------------------------------------ 拍卖会（城池，每季度一次，持续十日）
  // 第四十步：拍卖会也分档——小城拍的是筑基修士眼热的东西；雄城、天下名城（玄京九霄殿、观星城星罗殿拍卖）的压轴是元婴老怪也要争的灵宝
  auctionOpen(l: LocDef) { if (!this.isMajorTown(l)) return false; const d = Math.floor(this.game.day) % 90; return d >= 80; }
  /**
   * q：哪一季（缺省本季；季末结算上一季时传进来）。
   * cap（11e 分场，auction.house 给雄城、天下名城传）：在场买家的钱袋——正场的拍品只抽底价配得上它的（底价约原价×地域×0.75，
   * 买家心理价封顶在钱袋的八成），压轴（元婴期的灵宝丹药功法、原设点名的庚精天雷竹、压轴妖丹）照旧。不传就是原来的抽法。
   */
  auctionLots(l: LocDef, q = Math.floor(this.game.day / 90), cap?: number): AuctionLot[] {
    const rnd = mulberry32(((l.x * 977 + l.y * 13) | 0) + q * 101);
    // 第三十七步：拍品按原设产地——南荒拍不到沧溟海的高阶妖丹，沧溟海拍不到南荒七派把持的筑基丹；原设有主之宝一概不上台
    const z = zoneOfLoc(l), pz = pzOf(z), A = auctionLevel(l), yCap = yaodanCap(pz, A, rnd);
    const minPrice0 = [0, 0, 0, 150, 400, 2500, 8000][A], gLo = A <= 3 ? 2 : 3;
    const minPrice = cap !== undefined ? Math.min(minPrice0, Math.max(400, Math.round(cap * 0.2))) : minPrice0;
    const pool = ITEM_LIST.filter((it) => it.price >= minPrice && !yaodanLv(it.id) && (it.type !== 'misc' || it.price > 0) && !it.id.startsWith('lz_') && !isWeaponItem(it) && sellableAt(it, z, A, yCap, l.id, true) && ruleOf(it).g >= gLo);   // 收官 B3：灵舟不上拍卖（法器阁另行上架）
    const fit = cap !== undefined ? pool.filter((it) => it.price * priceMul(it, z) * 0.75 <= cap * 0.8) : pool;
    const main = fit.length >= 4 ? fit : pool;
    const wt = main.map((it) => { const r = ruleOf(it); return (r.g >= 4 ? (A >= 5 ? 3 : 2) : 1) * (r.minLv ? 2.5 : 1) * (A >= 6 ? 1 + it.tier * 0.25 : 1); });
    const tot = wt.reduce((a, b) => a + b, 0);
    const lots: AuctionLot[] = [];
    // v0.52.2：灵药拍品同样按药龄抬价，免得拍场成了低价收老药的后门
    const lot = (id: string, base: number, top = false) => { const it = itemDef(id); const age = it.type === 'herb' ? Math.round((it.herbBase ?? 50) * (1 + rnd() * (A >= 5 ? 6 : 2))) : undefined; const b = it.type === 'herb' ? Math.round(base * herbAgeMul(it, age ?? 0)) : base; return { id, base: b, price: b, top, age }; };
    const push = (id: string, base: number, top = false) => { if (!lots.some((x) => x.id === id)) lots.push(lot(id, base, top)); };
    const basePrice = (id: string, k = 1) => { const it = itemDef(id); return Math.round(it.price * priceMul(it, z) * (0.6 + rnd() * 0.3) * k); };
    const nLots = [0, 0, 0, 4, 5, 7, 9][A];
    for (let t = 0; t < 60 && lots.length < nLots && main.length; t++) {
      let r = rnd() * tot, it = main[0];
      for (let i = 0; i < main.length; i++) { r -= wt[i]; if (r <= 0) { it = main[i]; break; } }
      push(it.id, basePrice(it.id));
    }
    // 筑基丹：南荒、中州的中小拍卖会常客（雄城名城看不上）
    if (pz !== 'LX' && A <= 4 && rnd() < 0.5 && !lots.some((x) => x.id === 'pill_zhuji') && lots.length) lots[lots.length - 1] = lot('pill_zhuji', pz === 'TN' ? 1200 : 1500);
    // 压轴的妖丹：沧溟海常见，南荒难得一见
    if (rnd() < (pz === 'LX' ? 0.75 : pz === 'DJ' ? 0.35 : 0.3) + (A >= 5 ? 0.2 : 0)) push(`mat_yaodan${yCap}`, basePrice(`mat_yaodan${yCap}`, 1.1), A >= 5);
    // 雄城 / 名城的压轴：元婴期的灵宝、丹药、功法
    if (A >= 5) {
      const tops = pool.filter((it) => it.price >= minPrice0 && ((ruleOf(it).minLv ?? 0) >= 5 || it.tier >= 5));
      for (let i = 0; i < (A >= 6 ? 2 : 1) && tops.length; i++) { const it = tops[Math.floor(rnd() * tops.length)]; push(it.id, basePrice(it.id, 1.1), true); }
      // 原设：中州京城拍卖会上拍出过庚精；观星城大拍卖偶有一截天雷竹（清音门流出）
      if (l.id === 'jinjing' && rnd() < 0.4) push('mat_gengjing', basePrice('mat_gengjing'), true);
      if (l.id === 'tiantian' && rnd() < 0.25) push('mat_gengjing', basePrice('mat_gengjing'), true);
      if (l.id === 'tianxing' && rnd() < 0.12) { push('herb_tianleizhu', basePrice('herb_tianleizhu', 1.4), true); const t = lots.find((x) => x.id === 'herb_tianleizhu'); if (t) t.age = 1000 + Math.round(rnd() * 1500); }
    }
    // 压轴的放最后
    lots.sort((a, b) => Number(!!a.top) - Number(!!b.top) || a.base - b.base);
    return lots;
  }
  /** 本地拍卖会的风格（界面上提一句） */
  auctionNote(l: LocDef) { const z = zoneOfLoc(l), T = cityTier(l); return `${ZONE_NAME[z]}${T >= 5 ? (l.id === 'jinjing' ? '九霄殿大拍卖' : l.id === 'tianxing' ? '星罗殿大拍卖' : '大拍卖') : T >= 4 ? '大拍卖会' : '拍卖会'}`; }
  /** 竞价的人——越大的拍卖会，来的人境界越高 */
  auctionBidders(l: LocDef): string[] {
    const T = cityTier(l), map = l.map;
    const low = ['一位蒙面修士', '富态的商会掌柜', '白发老妪', '某世家公子', '黄衫少女', '独眼散修'];
    const mid = map === 'luanxing' ? ['星罗殿执事', '叛星盟长老', '玄阴岛弟子', '猎妖团团长'] : map === 'dajin' ? ['太一门长老', '叶家家主', '天魔宗执事', '归意门长老'] : ['栖云宗长老', '阴灵门弟子', '正一盟执事', '藏剑门剑修'];
    const high = map === 'luanxing' ? ['星罗殿的元婴长老（神识一扫全场）', '某位海外元婴老怪', '雅间里的元婴修士'] : map === 'dajin' ? ['天字号雅间里的元婴老怪', '叶家元婴老祖', '天魔宗元婴长老', '皇族供奉（元婴）'] : ['正一盟的元婴长老', '雅间里的元婴老怪', '阴灵门元婴长老'];
    return T >= 4 ? [...mid, ...high, ...high] : T >= 3 ? [...low, ...mid] : low;
  }

  // ------------------------------------------------------------ 宗门
  sectOf() { const s = this.game.ws.sect; return s ? LOC_BY_ID.get(s.id) ?? null : null; }
  joinReq(l: LocDef): { ok: boolean; why: string } {
    const g = this.game, h = g.hero;
    if (g.ws.sect) return { ok: false, why: `你已是${LOC_BY_ID.get(g.ws.sect.id)?.name}弟子` };
    if (g.ws.mySect) return { ok: false, why: '你已是一宗之主，岂能再拜他人山门' };
    if (g.ws.flags.betray?.includes(l.id)) return { ok: false, why: '此宗视你为叛徒' };
    const demon = DEMON.has(l.id);
    if (demon && g.ws.rep > -15) return { ok: false, why: '魔道宗门只收心狠手辣之辈（声望需 ≤ -15）' };
    if (!demon && g.ws.rep < -30) return { ok: false, why: '你恶名在外，正道宗门不收' };
    if (l.id === 'qixuan') return { ok: true, why: '' };
    if (l.id === 'huangfeng' && C.bagCount(h, 'item_shengxian') > 0) return { ok: true, why: '持问仙令可直接入门' };
    const need = l.major ? 5 : 3;
    if (h.realm < 1 || (h.realm === 1 && h.stage < need)) return { ok: false, why: `需炼气${['', '一', '二', '三', '四', '五', '六'][need]}层以上${l.id === 'huangfeng' ? '（或持问仙令）' : ''}` };
    return { ok: true, why: '' };
  }
  join(l: LocDef) {
    const g = this.game;
    const r = this.joinReq(l); if (!r.ok) { g.toast(r.why, 'warn'); return; }
    if (l.id === 'huangfeng' && C.bagCount(g.hero, 'item_shengxian') > 0) C.removeItem(g.hero, 'item_shengxian', 1);
    g.ws.sect = { id: l.id, rank: 0, contrib: 50, joined: g.day, lastPay: g.day, tasks: [], done: 0 };
    this.refreshTasks();
    g.news(`苏寒拜入${l.name}，成为外门弟子。`, 'personal');
    g.toast(`拜入${l.name}！每月可领俸禄，完成宗门任务换取贡献。`, 'good');
    if (DEMON.has(l.id)) g.ws.rep = Math.min(g.ws.rep, -20);
  }
  leave() {
    const g = this.game, s = g.ws.sect; if (!s) return;
    g.ws.flags.betray = [...(g.ws.flags.betray ?? []), s.id];
    g.news(`苏寒叛出${LOC_BY_ID.get(s.id)?.name}。`, 'personal');
    for (const n of g.npcs.list) if (n.sect === s.id && Math.random() < 0.4) n.grudge = 1;
    g.ws.sect = null;
  }
  /** 每月俸禄（在宗门领取） */
  pay() {
    const g = this.game, s = g.ws.sect; if (!s) return 0;
    const months = Math.floor((g.day - s.lastPay) / 30);
    if (months <= 0) return 0;
    const amt = months * [10, 25, 60, 150, 400][s.rank];
    s.lastPay += months * 30;
    C.addItem(g.hero, 'mat_lingshi', amt);
    return amt;
  }
  /** v0.52.9 指路：把一条宗门任务算成「去哪、干什么、大致多远」
   *  kill：地图上已经探到的目标怪里挑最近的；都没探到时指向宗门（任务板）并说明「未探明」
   *  gather：包裹里够了就回宗门交差，不够就指向附近（四格内）最近的一处该种灵草采集点
   *  patrol：直接指向要巡查的地点
   *  返回世界坐标 + 一句给玩家看的话（含方位与丈数） */
  taskWhere(t: SectTask): { x?: number; y?: number; spot: string; dist?: number } {
    const g = this.game;
    const p = g.player;
    const L = LOC_BY_ID.get(g.ws.sect?.id ?? '');
    const back = L && L.map === ACTIVE_MAP ? { x: L.x * WORLD_SCALE, y: L.y * WORLD_SCALE } : undefined;
    const have = Math.max(0, this.taskProgress(t));
    if (t.kind === 'catch') {
      const d = g.npcs.byId.get(t.target);
      if (!d || !d.alive) return back ? { x: back.x, y: back.y, spot: `回${L!.name}交差`, dist: Math.hypot(back.x - p.x, back.y - p.y) } : { spot: '回宗门交差' };
      if ((d.map ?? 'tiannan') !== ACTIVE_MAP) return { spot: `${d.name}不在此地域` };
      return { x: d.x, y: d.y, spot: `缉拿${d.name}（${Math.max(1, Math.round(Math.hypot(d.x - p.x, d.y - p.y) / 30))} 丈）`, dist: Math.hypot(d.x - p.x, d.y - p.y) };
    }
    if (t.kind === 'patrol') {
      const pl = locHere(t.target);
      return pl ? { x: pl.x * WORLD_SCALE, y: pl.y * WORLD_SCALE, spot: `巡查：${pl.name}`, dist: Math.hypot(pl.x * WORLD_SCALE - p.x, pl.y * WORLD_SCALE - p.y) } : { spot: '巡查地点不在此地域' };
    }
    if (t.kind === 'kill') {
      // 猎杀：已经探到的目标怪 > 有这种怪出没的凶地 / 妖兽巢 > 已探明的险地 > 宗门任务板
      const nm = ENEMIES[t.target]?.name ?? '目标';
      let best: any = null, bd = 1e12;
      for (const en of g.combat.enemies) {
        if (en.dead || en.def.id !== t.target) continue;
        const d = Math.hypot(en.x - p.x, en.y - p.y);
        if (d < bd && g.isExplored(en.x, en.y)) { bd = d; best = en; }
      }
      if (best) return { x: best.x, y: best.y, spot: `猎杀${nm}（${Math.max(1, Math.round(bd / 30))} 丈）`, dist: bd };
      const lair = g.combat.lairMarks?.().find((m: any) => m.name && m.name.includes(nm));
      if (lair) return { x: lair.x, y: lair.y, spot: `${lair.name}（${nm}巢）`, dist: Math.hypot(lair.x - p.x, lair.y - p.y) };
      // 没有已知巢穴：按这种妖兽的习性指方向——林里的往林指，雪线的往北指，魔道的往魔道地界指
      let home = this.beastHome(t.target);
      if (!home) home = this.beastRegion(t.target);
      if (home) return { x: home.x, y: home.y, spot: `${nm}${home.where}`, dist: Math.hypot(home.x - p.x, home.y - p.y) };
      return back ? { x: back.x, y: back.y, spot: `回宗门打听${nm}踪迹（尚未探明）` } : { spot: '尚未探明' };
    }
    // 采集：包里够了就回宗门；不够先找野生的，再指宗门藏经阁 / 丹房
    const it = itemDef(t.target);
    if (have >= t.need) return back ? { x: back.x, y: back.y, spot: `回${L!.name}交差`, dist: Math.hypot(back.x - p.x, back.y - p.y) } : { spot: '回宗门交差' };
    const node = this.nearestHerb(t.target);
    if (node) return { x: node.x, y: node.y, spot: `采${it.name}（野生，${Math.max(1, Math.round(node.d / 30))} 丈）`, dist: node.d };
    if (back && this.herbInLibrary(t.target)) return { x: back.x, y: back.y, spot: `${L!.name}藏经阁 / 丹房换${it.name}`, dist: Math.hypot(back.x - p.x, back.y - p.y) };
    return back ? { x: back.x, y: back.y, spot: `回宗门打听${it.name}下落`, dist: Math.hypot(back.x - p.x, back.y - p.y) } : { spot: '尚未探明' };
  }
  /** 本宗藏经阁 / 丹房本月是否换得到这件东西（决定采集任务是「去采」还是「去换」） */
  herbInLibrary(id: string): boolean {
    const g = this.game, s = g.ws.sect;
    const L = LOC_BY_ID.get(s?.id ?? '');
    if (!s || !L) return false;
    try {
      const sh = this.library(L);
      return sh.stock.some((x) => x.id === id && x.n > 0);
    } catch { return false; }
  }
  /** 某种妖兽「常出没」的地方：按危险度找附近同级的凶地 / 秘境，没有就取最近的同级野外 */
  beastHome(id: string): { x: number; y: number; where: string } | null {
    const g = this.game, p = g.player;
    const def = ENEMIES[id];
    if (!def) return null;
    const want = def.minDanger ?? 0;
    const cands = LOCATIONS.filter((l) => l.map === ACTIVE_MAP && (l.type === 'danger' || l.type === 'secret'));
    let best: { x: number; y: number; where: string } | null = null, bd = 1e12;
    for (const l of cands) {
      const x = l.x * WORLD_SCALE, y = l.y * WORLD_SCALE;
      // 只指「已探明」的地点；没探明的不指，免得把人往黑雾里引
      if (!g.isExplored(x, y)) continue;
      const d = Math.hypot(x - p.x, y - p.y) * (1 + Math.abs((l.danger ?? 1) - (want + 1)) * 0.35);
      if (d < bd) { bd = d; best = { x, y, where: `「${l.name}」一带` }; }
    }
    return best;
  }
  /** 按习性给出「哪里能碰见这种妖兽」：沿某个方向走一段就能进它的地带（不必等探明） */
  beastRegion(id: string): { x: number; y: number; where: string } | null {
    const g = this.game, p = g.player;
    const def = ENEMIES[id];
    if (!def) return null;
    // 八个方向各走 1800 / 3600 世界像素，看哪边符合这种妖兽的地带
    const dirs: [number, number, string][] = [[0, -1, '北'], [1, -1, '东北'], [1, 0, '东'], [1, 1, '东南'], [0, 1, '南'], [-1, 1, '西南'], [-1, 0, '西'], [-1, -1, '西北']];
    const snow = /雪|冰|霜|寒/.test(def.name);
    const demon = !!def.evil || (def as any).demon;
    const forest = /狼|虎|豹|狐|鹿|猴|熊|蟒|蛇|蛛|蜂|蚁|螳|鼠|鹰|雀|鹤/.test(def.name);
    let best: { x: number; y: number; where: string; sc: number } | null = null;
    for (const [dx, dy, nm] of dirs) for (const r of [1800, 3600, 5400] as number[]) {
      const x = p.x + dx * r, y = p.y + dy * r;
      const s = g.terrain.sample(x, y);
      if (s.land < 0.5) continue;                  // 海里不指
      let sc = 0;
      if (forest) sc += s.forest * 2;
      if (snow) sc += s.cold * 2.5;
      sc -= Math.abs(r - 2400) / 4000;             // 别指太远的
      if (!best || sc > best.sc) best = { x, y, where: `${forest ? '林深之处' : snow ? '雪线一带' : '荒野深处'}（往${nm}去找）`, sc };
    }
    return best ? { x: best.x, y: best.y, where: best.where } : null;
  }
  /** 视野 / 已探明区域里离玩家最近的一处该灵草采集点（含药王） */
  nearestHerb(id: string): { x: number; y: number; d: number } | null {
    const g = this.game, p = g.player;
    let best: { x: number; y: number; d: number } | null = null;
    // 采集点按格子哈希生成，不必依赖「当前可见列表」：在玩家周围三个采集格环内找最近的同种灵草
    const R = NODE_CELL * 4;
    for (let cy = Math.floor((p.y - R) / NODE_CELL); cy <= Math.floor((p.y + R) / NODE_CELL); cy++)
      for (let cx = Math.floor((p.x - R) / NODE_CELL); cx <= Math.floor((p.x + R) / NODE_CELL); cx++) {
        const d0 = Math.hypot((cx + 0.5) * NODE_CELL - p.x, (cy + 0.5) * NODE_CELL - p.y);
        if (d0 > R) continue;
        const n = g.nodes.at(cx, cy);   // 不生成新对象则返回 null
        if (!n || n.item !== id) continue;
        if (!g.nodes.available(n, g.day)) continue;
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (!best || d < best.d) best = { x: n.x, y: n.y, d };
      }
    return best;
  }

  refreshTasks() {
    const g = this.game, s = g.ws.sect; if (!s) return;
    const l = locHere(s.id);
    if (!l) return;   // 宗门不在本图：任务待回到宗门所在地图再刷新
    const rnd = mulberry32((g.day | 0) * 13 + l.x);
    const h = g.hero;
    const out: SectTask[] = [];
    const beasts = ENEMY_LIST.filter((e) => e.kind !== 'human' && e.minDanger <= 1 + h.realm && !e.zone);
    const evil = ENEMY_LIST.filter((e) => e.evil && e.minDanger <= 2 + h.realm);
    const herbs = ITEM_LIST.filter((it) => it.type === 'herb' && it.tier <= Math.max(1, h.realm));
    const k = Math.max(1, h.realm);
    const be = beasts[Math.floor(rnd() * beasts.length)];
    if (be) out.push({ id: 't' + g.day + 'a', kind: 'kill', text: `猎杀${be.name}`, target: be.id, need: 3 + Math.floor(rnd() * 4), have: g.ws.kills[be.id] ?? 0, reward: 40 * k, exp: 0.04, until: g.day + 90 });
    const ev = DEMON.has(s.id) ? beasts[Math.floor(rnd() * beasts.length)] : evil[Math.floor(rnd() * evil.length)];
    if (ev) out.push({ id: 't' + g.day + 'b', kind: 'kill', text: DEMON.has(s.id) ? `血祭：猎杀${ev.name}` : `除魔：斩杀${ev.name}`, target: ev.id, need: 2 + Math.floor(rnd() * 3), have: g.ws.kills[ev.id] ?? 0, reward: 70 * k, exp: 0.06, until: g.day + 120 });
    const hb = herbs[Math.floor(rnd() * herbs.length)];
    if (hb) out.push({ id: 't' + g.day + 'c', kind: 'gather', text: `上缴${hb.name}`, target: hb.id, need: 2 + Math.floor(rnd() * 3), have: 0, reward: 30 * k + hb.price / 4, exp: 0.02, until: g.day + 120 });
    const far = LOCATIONS.filter((x) => x.type === 'danger' && Math.hypot(x.x - l.x, x.y - l.y) < 90);
    const pl = far[Math.floor(rnd() * far.length)];
    if (pl) out.push({ id: 't' + g.day + 'd', kind: 'patrol', text: `巡查「${pl.name}」`, target: pl.id, need: 1, have: 0, reward: 50 * k, exp: 0.03, until: g.day + 120 });
    // 恩怨重做：缉凶——去拿下一名劫过人的劫修或作恶的散修 / 魔修（取上面之后的随机数，前面几条照旧）
    const crooks = g.npcs.list.filter((d) => d.alive && !d.canon && !d.bond && !d.beauty && !d.stay && !d.ros && !d.gz && (d.map ?? 'tiannan') === l.map && d.realm >= 1 && d.realm <= h.realm + 1 && d.sect !== s.id
      && ((d.robCd !== undefined) || ((d.pers === 'greedy' || d.pers === 'ruthless') && (d.faction === 'rogue' || d.faction === 'demon'))));
    if (crooks.length) {
      crooks.sort((a, b) => +(b.robCd !== undefined) - +(a.robCd !== undefined) || Math.hypot(a.x - l.x * WORLD_SCALE, a.y - l.y * WORLD_SCALE) - Math.hypot(b.x - l.x * WORLD_SCALE, b.y - l.y * WORLD_SCALE));
      const c = crooks[Math.floor(rnd() * Math.min(5, crooks.length))];
      out.push({ id: 't' + g.day + 'e', kind: 'catch', text: `缉凶：拿下${c.faction === 'demon' ? '魔修' : '劫修'}${c.name}`, target: c.id, need: 1, have: 0, reward: 80 * k, exp: 0.05, until: g.day + 120 });
    }
    s.tasks = out;
  }
  /** 击杀计数 / 巡查 → 任务进度 */
  onKill(defId: string) { const ws = this.game.ws; ws.kills[defId] = (ws.kills[defId] ?? 0) + 1; }
  onVisit(locId: string) { const s = this.game.ws.sect; if (!s) return; for (const t of s.tasks) if (t.kind === 'patrol' && t.target === locId && t.have < 1) { t.have = 1; this.game.toast(`宗门任务：已巡查${LOC_BY_ID.get(locId)?.name}，回宗门交差`, 'good'); } }
  taskProgress(t: SectTask) {
    const g = this.game;
    if (t.kind === 'kill') return Math.min(t.need, (g.ws.kills[t.target] ?? 0) - t.have);
    if (t.kind === 'gather') return Math.min(t.need, C.bagCount(g.hero, t.target));
    if (t.kind === 'catch') { const d = g.npcs.byId.get(t.target); return !d || !d.alive ? 1 : 0; }   // 恩怨重做：缉凶——人拿下了（伏诛）就能交差
    return t.have;
  }
  turnIn(t: SectTask) {
    const g = this.game, s = g.ws.sect; if (!s) return;
    if (this.taskProgress(t) < t.need) return;
    if (t.kind === 'gather') C.removeItem(g.hero, t.target, t.need);
    s.contrib += Math.round(t.reward); s.done++;
    C.temperDao(g.hero, 0.35);
    const msgs: C.Msg[] = []; C.gainExp(g.hero, C.need(g.hero) * C.INSIGHT * t.exp, msgs);
    s.tasks = s.tasks.filter((x) => x !== t);
    g.toast(`任务完成：贡献 +${Math.round(t.reward)}`, 'good');
    if (!s.tasks.length) this.refreshTasks();
  }
  promoteReq(): { ok: boolean; why: string } {
    const g = this.game, s = g.ws.sect; if (!s) return { ok: false, why: '' };
    const r = s.rank + 1; if (r >= SECT_RANKS.length) return { ok: false, why: '已是最高' };
    if (s.contrib + s.done * 0 < SECT_RANK_NEED[r] && totalContrib(s) < SECT_RANK_NEED[r]) return { ok: false, why: `累计贡献需 ${SECT_RANK_NEED[r]}` };
    if (g.hero.realm < SECT_RANK_REALM[r]) return { ok: false, why: `需${REALMS[SECT_RANK_REALM[r]].name}期` };
    return { ok: true, why: '' };
  }
  promote() { const g = this.game, s = g.ws.sect; if (!s || !this.promoteReq().ok) return; s.rank++; g.toast(`晋升为${LOC_BY_ID.get(s.id)?.name}${SECT_RANKS[s.rank]}！`, 'good'); g.news(`苏寒晋升${LOC_BY_ID.get(s.id)?.name}${SECT_RANKS[s.rank]}。`, 'personal'); }
  library(l: LocDef): Shop {
    const g = this.game, s = g.ws.sect!;
    const h = g.hero;
    const halfYear = Math.floor(g.day / 180);
    const { key: cacheKey, stock } = cachedShopStock(g.ws, `lib:${l.id}:r${s.rank}`, halfYear, () => {
      const ids = new Set<string>((SECT_LIB[l.id] ?? []).filter((id) => !canonOwned(id)));
      // 第三十七步：别派秘传不会出现在本宗藏经阁
      const pool = ITEM_LIST.filter((it) => it.type === 'scroll' && it.tier <= 1 + s.rank && it.price > 0 && sectCanOffer(it, l.id));
      const rnd = mulberry32(l.x * 7 + halfYear);
      for (let i = 0; i < 6 && pool.length; i++) ids.add(pool[Math.floor(rnd() * pool.length)].id);
      const built: ShopStock[] = [...ids].filter((id) => itemDef(id).name !== id).map((id) => ({ id, price: Math.max(20, Math.round(itemDef(id).price / 6)), n: 1 }));
      built.push({ id: 'pill_juqi', price: 15, n: 9 }, { id: 'pill_huiqi', price: 8, n: 9 }, { id: 'pill_liaoshang', price: 10, n: 9 });
      if (s.rank >= 1) built.push({ id: 'pill_zhuji', price: 900, n: 1 });
      if (s.rank >= 3) built.push({ id: 'pill_jiangchen', price: 6000, n: 1 });
      return built;
    });
    for (let i = stock.length - 1; i >= 0; i--) {
      const id = stock[i].id;
      if (id === 'scroll_' + h.gongfa || h.arts.some((a) => 'scroll_art_' + a.id === id)) stock.splice(i, 1);
    }
    return { title: `${l.name} · 藏经阁 / 丹房`, desc: '以宗门贡献兑换（每半年补配一次）', stock, sellRate: 0, currency: 'contrib', noSell: true, cacheKey };
  }
  sectNode(l: LocDef): DNode {
    if (l.id === MY_SECT_ID) return this.game.mysect.node();   // v0.60：自家山门 → 宗主大殿
    const g = this.game, s = g.ws.sect;
    if (!s || s.id !== l.id) {
      const r = this.joinReq(l);
      return { speaker: `${l.name} · 山门`, title: `${DAO_NAME[sectDao(l.id) ?? (DEMON.has(l.id) ? 'mo' : 'zheng')]}宗门`, text: `${l.desc}${sectBrief(l.id)}\n\n${r.ok ? '执事弟子打量着你：「可是来拜山的？」' : `执事弟子拦住了你：「${r.why}。」`}`, options: [{ label: '拜入山门', disabled: !r.ok, hint: r.why, act: () => { this.join(l); return this.sectNode(l); } }, { label: '离开', act: () => null }] };
    }
    const pay = this.pay();
    const pr = this.promoteReq();
    const lines = [`身份：${SECT_RANKS[s.rank]}　贡献：${s.contrib}　已完成任务：${s.done}`, pay ? `领取俸禄 ${pay} 灵石。` : '本月俸禄已领。'];
    const opts: DOpt[] = [];
    if (!s.tasks.length || s.tasks.every((t) => t.until < g.day)) this.refreshTasks();
    for (const t of s.tasks) {
      const p = Math.max(0, this.taskProgress(t));
      const w = this.taskWhere(t);
      const where = w.x !== undefined && w.y !== undefined ? `　→ ${w.spot}` : '';
      opts.push({
        label: `${p >= t.need ? '✔ 交付' : '任务'}：${t.text}（${p}/${t.need}）　+${Math.round(t.reward)} 贡献${where}`,
        tone: p >= t.need ? 'good' : undefined,
        // v0.52.9：任务项永远可点——已达成的交差，没达成的就地指路（以前未达成就按不动，玩家以为坏了）
        act: () => {
          if (p >= t.need) { this.turnIn(t); return this.sectNode(l); }
          if (w.x !== undefined && w.y !== undefined) g.setGuide(w.x, w.y, t.text);
          else g.toast('这处目标还没探明，先在地图上找找，或回宗门打听。', 'info');
          return this.sectNode(l);
        },
      });
    }
    opts.push({ label: '藏经阁 / 丹房（贡献兑换）', act: () => { g.openShop(this.library(l)); return null; } });
    opts.push({ label: `晋升${SECT_RANKS[s.rank + 1] ?? ''}`, disabled: !pr.ok, hint: pr.why, act: () => { this.promote(); return this.sectNode(l); } });
    opts.push({ label: '叛出宗门', tone: 'bad', act: () => ({ speaker: '心念', text: '叛出宗门，同门必视你为仇寇，此宗永不再收你。确定吗？', options: [{ label: '确定', tone: 'bad', act: () => { this.leave(); return null; } }, { label: '再想想', act: () => this.sectNode(l) }] }) });
    opts.push({ label: '离开', act: () => null });
    return { speaker: `${l.name}`, title: `${SECT_RANKS[s.rank]}`, text: lines.join('\n'), options: opts };
  }
}
function totalContrib(s: { contrib: number; done: number }) { return s.contrib + s.done * 40; }
