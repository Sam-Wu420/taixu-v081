// 第五步：城镇与宗门——坊市、丹药铺、法器阁、酒楼、客栈、传送阵、拍卖会；拜入宗门、贡献、任务、藏经阁、俸禄、晋升
import { modx } from '../mod/hooks';
import { ZHEN } from '../data/zhenfa';
import type { Game } from './game';
import { LOCATIONS, LOC_BY_ID, locHere, LocDef, WORLD_SCALE, ACTIVE_MAP, ACTIVE_WORLD } from '../data/world';
import { worldCurrencyId, worldCurrencyName, scaleFromMortalStones, planeMeta, type WorldId } from '../data/worldHierarchy';
import { ITEM_LIST, itemDef, ItemDef, herbAgeMul } from '../data/items';
import { ENEMY_LIST, ENEMIES } from '../data/enemies';
import { REALMS } from '../data/realms';
import * as C from './cultivation';
import { mulberry32 } from '../core/rng';
import { NODE_CELL } from './nodes';
import type { DNode, DOpt, Shop, ShopStock } from './modal';
import { SECT_RANKS, SECT_RANK_NEED, SECT_RANK_REALM, SectTask, cachedShopStock } from './worldstate';
import { dirName } from './sites';
import { XSECTS, OLD_SECT, X_DEMON, X_BY_ID, sectDao, DAO_NAME, MY_SECT_ID } from '../data/sects';
import { GONGFA } from '../data/skills';
import { zoneOfLoc, zonePlane, shopLevel, pzOf, sellableAt, priceMul, yaodanCap, yaodanLv, ruleOf, sectCanOffer, canonOwned, ZONE_NAME, cityTier, auctionLevel, TIER_NAME, type Zone } from '../data/market';

function zoneWorld(z?: Zone): WorldId {
  const p = z ? zonePlane(z) : (ACTIVE_WORLD === 'human' ? 'mortal' : ACTIVE_WORLD);
  return p === 'spirit' ? 'spirit' : p === 'immortal' ? 'immortal' : 'human';
}

/** 玩家所在处的市集分区：取本图最近的有名地点 */
export function zoneHere(g: Game): Zone {
  const px = g.player.x / WORLD_SCALE, py = g.player.y / WORLD_SCALE;
  let best: LocDef | null = null, bd = Infinity;
  for (const l of LOCATIONS) { if (l.minor || (l.type !== 'city' && l.type !== 'town' && l.type !== 'sect' && l.type !== 'isle')) continue; const d = Math.hypot(l.x - px, l.y - py); if (d < bd) { bd = d; best = l; } }
  return zoneOfLoc(best);
}

const DEMON = new Set(['guiling', 'hehuan', 'yuling', 'qianhuan', 'tiansha', 'yinluo', 'tianmo', ...X_DEMON]);
/** 各宗门藏经阁特色功法/法术（与原著对应） */
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

export interface AuctionLot { id: string; base: number; price: number; done?: 'won' | 'lost'; who?: string; top?: boolean; age?: number;
  /** 江湖篇：拍卖托（null = 此拍品没有托）、托已罢手、已被神识看穿 */
  shill?: string | null; shillOut?: boolean; exposed?: boolean }

/** v0.70：清音门坊市的金雷竹底价（灵石） */
export const JINLEI_PRICE = 280000;

export class Towns {
  game: Game;
  constructor(game: Game) { this.game = game; }

  canEnter(l: LocDef | null) { return !!l && (l.type === 'city' || l.type === 'town' || l.type === 'sect' || (l.type === 'isle' && !l.minor) || l.id === 'tainan' || !!modx?.canEnter(l)); }
  isMajorTown(l: LocDef) { return l.type === 'city' || l.id === 'tianxing' || l.id === 'tainan' || l.id === 'kuixing'; }
  hasTeleport(l: LocDef) { return (l.type === 'city' && !l.minor) || (l.type === 'sect' && !!l.major) || l.id === 'tianxing' || l.id === 'chuansong' || l.id === 'kuixing'; }
  occupied(l: LocDef) { const ws = this.game.ws; return !!ws.flags.yueFallen && l.ox > 425 && l.ox < 590 && l.oy > 495 && l.map === 'renjie' && (l.type === 'city' || l.type === 'town') && ws.rep > -20; }

  open(l: LocDef, fac?: string) {
    const g = this.game;
    if (modx?.openLoc(l)) return;   // v0.56：模组的险地 / 秘地（进城也会在这里发 enter 事件）
    if (this.hasTeleport(l) && !g.ws.tp.includes(l.id)) { g.ws.tp.push(l.id); g.toast(`激活了${l.name}的传送阵`, 'good'); }
    g.openModal({ kind: 'town', loc: l, fac });
  }

  // ------------------------------------------------------------ 商店
  tierOf(l: LocDef) { return shopLevel(l); }
  /**
   * 第三十七步：货按原著产地与稀有度上架，价格按价区浮动（妖丹：沧溟海便宜，南荒贵得离谱）
   * 第四十步：城池分五档——越大的城，货越多、越好：小镇多是大路货；大城几乎不摆凡品；雄城、天下名城的铺子里能见到拍卖会级的东西
   */
  shop(l: LocDef, kind: 'market' | 'pill' | 'artifact' | 'talisman'): Shop {
    const g = this.game;
    const month = Math.floor(g.day / 30);
    const z = zoneOfLoc(l), zp = zonePlane(z), lvl = shopLevel(l), pz = pzOf(z), T = cityTier(l);
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
        built.push({ id: it.id, price: Math.max(1, Math.round(it.price * herbAgeMul(it, age ?? 0) * priceMul(it, z) * g4 * (0.9 + rnd() * 0.4) * k * (g.ws.rep < -40 ? 1.3 : 1))), n: it.type === 'artifact' || it.type === 'scroll' || ruleOf(it).g >= 4 ? 1 : 1 + Math.floor(rnd() * (it.tier <= 1 ? 8 : 3 + (T >= 4 ? 2 : 0))), age });
      };
      const n = (kind === 'market' ? [8, 8, 10, 13, 16, 20] : [6, 6, 7, 9, 12, 15])[T] ?? 8;
      for (let i = 0; i < n * 4 && built.length < n && pool.length; i++) add(pickW());
      if (zp === 'mortal' && kind === 'market' && pz === 'LX') for (let lv = Math.max(1, yCap - 2); lv <= yCap; lv++) { const it = itemDef(`mat_yaodan${lv}`); if (it && rnd() < 0.75) add(it); }
      if (zp === 'mortal' && kind === 'pill' && pz === 'LX' && lvl >= 3 && rnd() < (T >= 5 ? 0.6 : 0.3)) { const it = itemDef('pill_zhuji'); add(it); const s0 = built.find((s) => s.id === it.id); if (s0) s0.n = 1; }
      if (zp === 'mortal') {
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
      } else if (zp === 'spirit') {
        if (kind === 'pill') for (const id of ['pill_lingjing_huiqi', 'pill_lingjing_liaoshang', 'pill_huaxu']) if (!built.some((s) => s.id === id)) { const it = itemDef(id); built.push({ id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * (0.9 + rnd() * 0.3))), n: id === 'pill_huaxu' ? 2 : 4 + Math.floor(rnd() * 5) }); }
        if (kind === 'market') {
          for (const id of ['mat_tijie_muou', 'herb_ling_taiyicao', 'mat_ling_kongming']) {
            if (!built.some((s) => s.id === id)) { const it = itemDef(id); built.push({ id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * (0.9 + rnd() * 0.3))), n: 1 + Math.floor(rnd() * 2) }); }
          }
        }
        if (kind === 'talisman') {
          for (const id of ['tal_ling_tianlei', 'tal_pojin', 'tal_huifu']) {
            if (!built.some((s) => s.id === id)) { const it = itemDef(id); built.push({ id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * (0.9 + rnd() * 0.3))), n: 2 + Math.floor(rnd() * 3) }); }
          }
        }
        if (kind === 'artifact' && !built.some((s) => s.id === 'art_ling_feijian')) {
          const it = itemDef('art_ling_feijian');
          built.push({ id: it.id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * (0.9 + rnd() * 0.3))), n: 1 });
        }
      } else {
        if (kind === 'pill') for (const id of ['pill_xian_yunshen', 'pill_dingxian_zhenshuai']) if (!built.some((s) => s.id === id)) { const it = itemDef(id); built.push({ id, price: Math.max(1, Math.round(it.price * priceMul(it, z) * (0.9 + rnd() * 0.3))), n: 3 + Math.floor(rnd() * 4) }); }
      }
      // v0.70：金雷竹——人界只有清音门的坊市出售，每月至多一根，价比连城
      if (kind === 'market' && l.id === 'miaoyin' && !built.some((s0) => s0.id === 'mat_jinleizhu')) built.push({ id: 'mat_jinleizhu', price: Math.round((JINLEI_PRICE + rnd() * 40000) * ((g.ws.flags as any).zl?.st === 'done' ? 0.9 : 1)), n: 1 });   // 清音门客卿长老让一成
      built.sort((a, b) => itemDef(b.id).tier - itemDef(a.id).tier || b.price - a.price);
      return built;
    });
    // 第五十一步「天道」·资源限供：灵药按月按产区发货，发罄的货本月不再上架（天骄档不限）
    const soldOut = g.daoxin?.applyQuota(stock, l) ?? [];
    const title = { market: '坊市', pill: '丹药铺', artifact: '法器阁', talisman: '符箓斋' }[kind];
    const note = zp === 'spirit'
      ? `${ZONE_NAME[z]}：以灵晶交易`
      : zp === 'immortal'
        ? `${ZONE_NAME[z]}：以仙元石交易`
        : pz === 'LX' ? '海外坊市：妖丹、海兽材料便宜，灵草稀贵' : pz === 'DJ' ? '中州坊市：品类齐全，价钱也贵' : '南荒坊市：灵草不缺，妖丹奇贵';
    const tierNote = ['', '小地方，多是大路货。', '寻常城池，货色平平。', '大城，凡品已不上架。', '雄城，偶有拍卖会级的好货。', '天下名城，奇珍异宝云集。'][T];
    return { title: `${l.name} · ${title}`, desc: `【${TIER_NAME[T]}】${tierNote}每月换一批货，售完需待下月。` + note + (g.daoxin?.quotaNote(l) ?? '') + (soldOut.length ? `本月${soldOut.slice(0, 3).join('、')}已被同道买空。` : ''), stock, sellRate: 0.5, zone: z, loc: l.id, cacheKey };
  }
  /** 卖给这家店能得多少货币（按价区） */
  sellPrice(shop: Shop, id: string, age = 0) {
    const it = itemDef(id);
    const z = (shop.zone as Zone | undefined) ?? zoneHere(this.game);
    return Math.max(1, Math.round(it.price * priceMul(it, z) * shop.sellRate * herbAgeMul(it, age) * (this.game.jianghu?.credSellMul() ?? 1)));   // 江湖篇：信义差的人坊市压价
  }
  buy(shop: Shop, s: ShopStock, qty = 1) {
    const g = this.game, h = g.hero;
    if (!shop.stock.includes(s) || !Number.isSafeInteger(s.n) || s.n <= 0 || !Number.isSafeInteger(s.price) || s.price < 0) { g.toast('交易数据异常，未完成交易。', 'warn'); return false; }
    if (s.fake && s.ident) { g.toast('你已看破此物是伪劣假货，莫花冤枉钱！', 'warn'); return false; }
    const ss = shop.currency === 'contrib' ? g.ws.sect : null;
    const wId = zoneWorld(shop.zone as Zone | undefined);
    const curId = worldCurrencyId(wId), curName = worldCurrencyName(wId);
    const availMoney = ss ? ss.contrib : C.bagCount(h, curId);
    if (ss && !Number.isSafeInteger(ss.contrib)) { g.toast('贡献不足或数据异常', 'warn'); return false; }
    if (availMoney < s.price) { g.toast(ss ? '贡献不足或数据异常' : `${curName}不足`, 'warn'); return false; }
    const want = Math.max(1, Math.floor(qty));
    const maxAfford = s.price > 0 ? Math.floor(availMoney / s.price) : want;
    const arr = shop.cacheKey ? g.ws.shopCache?.[shop.cacheKey] : undefined;
    const cached = arr && arr !== shop.stock ? arr.find(x => x.id === s.id && x.age === s.age && x.fake === s.fake) : undefined;
    if (cached && cached !== s && (!Number.isSafeInteger(cached.n) || cached.n <= 0)) { g.toast('库存数据异常，未完成交易。', 'warn'); return false; }
    const n = Math.min(want, s.n, maxAfford, cached && cached !== s ? cached.n : want);
    if (n <= 0) { g.toast(ss ? '贡献不足或数据异常' : `${curName}不足`, 'warn'); return false; }
    const totalCost = s.price * n;
    if (!Number.isSafeInteger(totalCost) || totalCost < 0) { g.toast('交易金额异常，未完成交易。', 'warn'); return false; }
    // 货槽和贡献先预留，防止入袋通知重入超卖；背包交换失败则撤销预留。
    s.n -= n; if (cached && cached !== s) cached.n -= n;
    if (ss) ss.contrib -= totalCost;
    const ok = C.exchangeItems(h, ss ? [] : [{ id: curId, n: totalCost }], [{ id: s.id, n, age: s.age, fake: s.fake, ident: s.ident, seller: s.seller, sellerName: s.sellerName }]);
    if (!ok) { s.n += n; if (cached && cached !== s) cached.n += n; if (ss) ss.contrib += totalCost; g.toast('交易数据或背包数量异常，未完成交易。', 'warn'); return false; }
    let idx = shop.stock.indexOf(s); if (s.n <= 0 && idx >= 0) shop.stock.splice(idx, 1);
    if (cached && arr) { idx = arr.indexOf(cached); if (cached.n <= 0 && idx >= 0) arr.splice(idx, 1); }
    g.daoxin?.useQuota(shop.loc ? LOC_BY_ID.get(shop.loc) : null, s.id, n);
    g.toast(n > 1 ? `购得 ${itemDef(s.id).name} ×${n}` : `购得 ${itemDef(s.id).name}`, 'good');
    return true;
  }
  sell(shop: Shop, id: string, age?: number, qty = 1) {
    const g = this.game, h = g.hero; const it = itemDef(id);
    if (id === 'mat_lingshi' || id === 'mat_lingjing' || id === 'mat_xianyuan' || it.price <= 0) return false;
    const wId = zoneWorld(shop.zone as Zone | undefined);
    const curId = worldCurrencyId(wId), curName = worldCurrencyName(wId);
    const st = h.bag.find((b) => b.id === id && !(b.fake && b.ident) && (age === undefined || b.age === age)); if (!st) return false;
    const n = Math.max(1, Math.min(Math.floor(qty), st.n));
    const p = this.sellPrice(shop, id, st.age ?? 0);
    const total = p * n;
    if (!Number.isSafeInteger(total) || total <= 0 || !C.canAddItem(h, curId, total)) { g.toast(`交易价格或${curName}数量异常，未完成交易。`, 'warn'); return false; }
    if (!C.exchangeSelectedItem(h, st, { id: curId, n: total }, [], n)) { g.toast('交易数据或背包数量异常，未完成交易。', 'warn'); return false; }
    if (h.hotbar.includes(id) && C.bagCount(h, id) === 0) h.hotbar = h.hotbar.map((x) => (x === id ? null : x));
    if (n > 1) g.toast(`售出 ${it.name} ×${n}，得${curName} ${total}`, 'good');
    return true;
  }

  // ------------------------------------------------------------ 客栈 / 酒楼
  rest(l: LocDef) {
    const g = this.game, h = g.hero;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const cost = ACTIVE_WORLD === 'human' ? (l.type === 'city' ? 5 : 2) : 1;
    if (C.bagCount(h, curId) < cost) { g.toast(`${curName}不足`, 'warn'); return; }
    C.removeItem(h, curId, cost);
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
    // 近期拍卖会讯息（同图正在开拍 / 十日内即将开拍的城池）
    const aucOpen = LOCATIONS.filter((x) => x.map === ACTIVE_MAP && this.isMajorTown(x) && this.auctionSchedule(x).open)
      .map((x) => `${x.name}（剩 ${this.auctionSchedule(x).leftDays} 日）`);
    const aucSoon = LOCATIONS.filter((x) => x.map === ACTIVE_MAP && this.isMajorTown(x) && !this.auctionSchedule(x).open && this.auctionSchedule(x).waitDays <= 10)
      .sort((a, b) => this.auctionSchedule(a).waitDays - this.auctionSchedule(b).waitDays)
      .slice(0, 3)
      .map((x) => `${x.name}（${this.auctionSchedule(x).waitDays} 日后）`);
    if (aucOpen.length) lines.push(`席间修士议论：「${aucOpen.slice(0, 3).join('、')}眼下正开着拍卖会，手头宽裕的道友不妨去碰碰运气。」`);
    if (aucSoon.length) lines.push(`跑商的散修顺口提了一句：「过几日${aucSoon.join('、')}便要开拍了，听说有不少稀罕物事。」`);
    // 江湖篇：说书先生的消息也走 Rumor 管道（多半是真的，偶尔是有人借他的嘴放的饵）
    if (g.jianghu && Math.random() < 0.45 && !g.jianghu.activeRumors().some((r) => r.src === 'book')) { const r = g.jianghu.tavernRumor(); if (r) lines.unshift(`说书先生醒木一拍：「${r.text}」（地图上已以「讯」标出——消息未必是真的）`); }
    if (!lines.length) lines.push('酒楼里人声嘈杂，说的都是些家长里短。');
    const back = () => this.tavern(l);
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const wineCost = ACTIVE_WORLD === 'human' ? 2 : 1;
    const jOpts = g.jianghu ? [
      ...g.jianghu.verifyOpts(null, undefined, '酒楼掌柜', back),
      ...(g.jianghu.activeRumors().some((r) => !r.exposed && !r.byPlayer) ? [{ label: `花${curName}买消息来源（这消息是谁放出来的？）`, act: () => g.jianghu.buySourceNode(back) }] : []),
      { label: '让说书先生放风（散布假情报，调虎离山）', hint: `花${curName}把仇家骗去扑空；他若活着回来，多半知道是你`, act: () => g.jianghu.spreadRumorNode(back) },
    ] : [];
    return { speaker: `${l.name} · 酒楼`, title: '打听消息', text: lines.join('\n\n'), options: [{ label: `再要一壶酒（${wineCost} ${curName}）`, disabled: C.bagCount(g.hero, curId) < wineCost, act: () => { C.removeItem(g.hero, curId, wineCost); return this.tavern(l); } }, ...jOpts, { label: '离开', act: () => null }] };
  }

  // ------------------------------------------------------------ 传送阵
  tpCost(a: LocDef, b: LocDef) {
    const base = Math.round(20 + Math.hypot(a.x - b.x, a.y - b.y) * 1.6);
    return scaleFromMortalStones(base, ACTIVE_WORLD, 1);
  }
  teleportTo(from: LocDef, to: LocDef) {
    const g = this.game, cost = this.tpCost(from, to);
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    if (C.bagCount(g.hero, curId) < cost) { g.toast(`${curName}不足`, 'warn'); return false; }
    C.removeItem(g.hero, curId, cost);
    const z = g.terrain.locZones[LOCATIONS.indexOf(to)];
    let tx = to.x * WORLD_SCALE, ty = to.y * WORLD_SCALE + (z ? z.ry * 0.9 : 300);
    for (let r = 0; r < 1500 && g.terrain.walkFactor(tx, ty) <= 0; r += 60) ty += 60;
    g.teleport(tx, ty);
    g.day += 1;
    g.closeModal(true);
    g.toast(`传送阵灵光一闪——已至${to.name}（耗费 ${cost} ${curName}）`, 'good');
    return true;
  }

  // ------------------------------------------------------------ 拍卖会（按城池错峰：中小城每 30 日开拍 10 日；雄城/天下名城每 45 日开拍 15 日）
  // 第四十步：拍卖会也分档——小城拍的是筑基修士眼热的东西；雄城、天下名城（玄京九霄殿、观星城星罗殿拍卖）的压轴是元婴老怪也要争的灵宝
  auctionSchedule(l: LocDef): { open: boolean; period: number; span: number; cycle: number; leftDays: number; waitDays: number } {
    const T = cityTier(l);
    const period = T >= 4 ? 45 : 30;
    const span = T >= 4 ? 15 : 10;
    let hash = 0;
    for (let i = 0; i < l.id.length; i++) hash = (hash * 31 + l.id.charCodeAt(i)) >>> 0;
    const offset = ((hash ^ ((l.x * 7 + l.y * 13) | 0)) >>> 0) % period;
    const day = Math.floor(this.game.day) + offset;
    const pos = ((day % period) + period) % period;
    const start = period - span;
    const open = pos >= start;
    return {
      open,
      period,
      span,
      cycle: Math.floor(day / period),
      leftDays: open ? period - pos : 0,
      waitDays: open ? 0 : start - pos,
    };
  }
  auctionOpen(l: LocDef) { return this.isMajorTown(l) && this.auctionSchedule(l).open; }
  auctionLots(l: LocDef): AuctionLot[] {
    const g = this.game;
    const q = this.auctionSchedule(l).cycle;
    const rnd = mulberry32(((l.x * 977 + l.y * 13) | 0) + q * 101);
    // 第三十七步：拍品按原著产地——南荒拍不到沧溟海的高阶妖丹，沧溟海拍不到南荒七派把持的筑基丹；原著有主之宝一概不上台
    const z = zoneOfLoc(l), zp = zonePlane(z), pz = pzOf(z), A = auctionLevel(l), yCap = yaodanCap(pz, A, rnd);
    const minPrice = zp === 'immortal' ? [0, 0, 0, 100, 300, 800, 1500][A] : zp === 'spirit' ? [0, 0, 0, 150, 400, 1200, 2400][A] : [0, 0, 0, 150, 400, 2500, 8000][A];
    const gLo = A <= 3 ? 2 : 3;
    const pool = ITEM_LIST.filter((it) => it.price >= minPrice && !yaodanLv(it.id) && (it.type !== 'misc' || it.price > 0) && sellableAt(it, z, A, yCap, l.id, true) && ruleOf(it).g >= gLo);
    const wt = pool.map((it) => { const r = ruleOf(it); return (r.g >= 4 ? (A >= 5 ? 3 : 2) : 1) * (r.minLv ? 2.5 : 1) * (A >= 6 ? 1 + it.tier * 0.25 : 1); });
    const tot = wt.reduce((a, b) => a + b, 0);
    const lots: AuctionLot[] = [];
    // v0.52.2：灵药拍品同样按药龄抬价，免得拍场成了低价收老药的后门
    const lot = (id: string, base: number, top = false) => { const it = itemDef(id); const age = it.type === 'herb' ? Math.round((it.herbBase ?? 50) * (1 + rnd() * (A >= 5 ? 6 : 2))) : undefined; const b = it.type === 'herb' ? Math.round(base * herbAgeMul(it, age ?? 0)) : base; return { id, base: b, price: b, top, age }; };
    const push = (id: string, base: number, top = false) => { if (!lots.some((x) => x.id === id)) lots.push(lot(id, base, top)); };
    const basePrice = (id: string, k = 1) => { const it = itemDef(id); return Math.round(it.price * priceMul(it, z) * (0.6 + rnd() * 0.3) * k); };
    const nLots = [0, 0, 0, 4, 5, 7, 9][A];
    for (let t = 0; t < 60 && lots.length < nLots && pool.length; t++) {
      let r = rnd() * tot, it = pool[0];
      for (let i = 0; i < pool.length; i++) { r -= wt[i]; if (r <= 0) { it = pool[i]; break; } }
      push(it.id, basePrice(it.id));
    }
    // 筑基丹：南荒、中州的中小拍卖会常客（雄城名城看不上）
    if (zp === 'mortal' && pz !== 'LX' && A <= 4 && rnd() < 0.5 && !lots.some((x) => x.id === 'pill_zhuji') && lots.length) lots[lots.length - 1] = lot('pill_zhuji', pz === 'TN' ? 1200 : 1500);
    // 压轴的妖丹：沧溟海常见，南荒难得一见
    if (zp === 'mortal' && rnd() < (pz === 'LX' ? 0.75 : pz === 'DJ' ? 0.35 : 0.3) + (A >= 5 ? 0.2 : 0)) push(`mat_yaodan${yCap}`, basePrice(`mat_yaodan${yCap}`, 1.1), A >= 5);
    // 雄城 / 名城的压轴：人界为元婴灵宝/丹药，灵界为合体/大乘破境重宝与玄天之物，仙界为金仙/大罗仙丹与至宝
    if (zp === 'immortal') {
      const immTops = ['pill_jinxian', 'pill_daluo', 'pill_dingxian_zhenshuai', 'mat_faze_jingsi', 'mat_hundun_jingyuan', 'mat_suiyue_jinlu', 'mat_kuilei_hex', 'art_taiyi_xianjian', 'art_yuqing_baolian', 'art_xuankong_yunzhou'];
      const topPick = immTops.filter((id) => sellableAt(itemDef(id), z, A, yCap, l.id, true));
      for (let i = 0; i < (A >= 6 ? 2 : 1) && topPick.length; i++) {
        const id = topPick[Math.floor(rnd() * topPick.length)];
        push(id, Math.max(10, basePrice(id, 1.15)), true);
      }
      if (l.id === 'lingxiao_xiancheng' && rnd() < 0.25) push('item_canjuan_page', Math.max(180, basePrice('item_canjuan_page', 1.1)), true);
    } else if (zp === 'spirit') {
      const spiritTops = ['pill_ningxiang', 'pill_pojie', 'mat_leihai_jin', 'mat_taiyin_sui', 'mat_xuantian_pei', 'art_leihai_dun', 'herb_ling_tianxin', 'art_ling_feijian'];
      const topPick = spiritTops.filter((id) => sellableAt(itemDef(id), z, A, yCap, l.id, true));
      for (let i = 0; i < (A >= 6 ? 2 : 1) && topPick.length; i++) {
        const id = topPick[Math.floor(rnd() * topPick.length)];
        push(id, Math.max(20, basePrice(id, 1.15)), true);
      }
      if (l.id === 'tianyuan_cheng' && rnd() < 0.35) push('mat_xuantian_pei', Math.max(800, basePrice('mat_xuantian_pei', 1.1)), true);
    } else if (A >= 5) {
      const tops = pool.filter((it) => (ruleOf(it).minLv ?? 0) >= 5 || it.tier >= 5);
      for (let i = 0; i < (A >= 6 ? 2 : 1) && tops.length; i++) { const it = tops[Math.floor(rnd() * tops.length)]; push(it.id, basePrice(it.id, 1.1), true); }
      // 原著：中州京城拍卖会上拍出过庚精；观星城大拍卖偶有一截天雷竹（清音门流出）
      if (l.id === 'jinjing' && rnd() < 0.4) push('mat_gengjing', basePrice('mat_gengjing'), true);
      if (l.id === 'tiantian' && rnd() < 0.25) push('mat_gengjing', basePrice('mat_gengjing'), true);
      if (l.id === 'tianxing' && rnd() < 0.12) { push('herb_tianleizhu', basePrice('herb_tianleizhu', 1.4), true); const t = lots.find((x) => x.id === 'herb_tianleizhu'); if (t) t.age = 1000 + Math.round(rnd() * 1500); }
    }
    // 压轴的放最后
    lots.sort((a, b) => Number(!!a.top) - Number(!!b.top) || a.base - b.base);
    return lots;
  }
  /** 拍卖成交：价格、库存、物品与成交状态在发送入袋通知前一起确定。 */
  settleAuction(lot: AuctionLot, price: number): boolean {
    if (!lot || lot.done || !Number.isSafeInteger(price) || price < 0 || typeof lot.id !== 'string' || !lot.id) return false;
    const oldPrice = lot.price;
    lot.price = price; lot.done = 'won';
    const curId = worldCurrencyId(ACTIVE_WORLD);
    if (!C.exchangeItems(this.game.hero, [{ id: curId, n: price }], [{ id: lot.id, n: 1, age: lot.age }])) {
      lot.price = oldPrice; delete lot.done; return false;
    }
    return true;
  }
  /** 本地拍卖会的风格（界面上提一句） */
  auctionNote(l: LocDef) { const z = zoneOfLoc(l), T = cityTier(l); return `${ZONE_NAME[z]}${T >= 5 ? (l.id === 'jinjing' ? '九霄殿大拍卖' : l.id === 'tianxing' ? '星罗殿大拍卖' : '大拍卖') : T >= 4 ? '大拍卖会' : '拍卖会'}`; }
  /** 竞价的人——越大的拍卖会，来的人境界越高 */
  auctionBidders(l: LocDef): string[] {
    const T = cityTier(l), map = l.map;
    if (map === 'lingjie') {
      const mid = ['天渊圣域执事', '蛮荒妖族使者', '雷海散修', '上界商会管事', '黑袍化神修士'];
      const high = ['天渊城炼虚长老', '异族合体老祖（神念压场）', '雅间里的大乘尊者', '圣域供奉（合体后期）'];
      return T >= 4 ? [...mid, ...high, ...high] : [...mid, ...high];
    }
    if (map === 'xianjie') {
      const mid = ['北寒仙宫执事', '金源仙坊掌柜', '真仙散修', '仙域商盟使者'];
      const high = ['金仙大能（仙威莫测）', '玄仙长老', '雅间里的大罗修士', '灰界使者'];
      return T >= 4 ? [...mid, ...high, ...high] : [...mid, ...high];
    }
    const low = ['一位蒙面修士', '富态的商会掌柜', '白发老妪', '某世家公子', '黄衫少女', '独眼散修'];
    const hr = l.ox >= 630 && l.oy >= 290 ? 'luanxing' : l.oy < 262 ? 'dajin' : 'tiannan';
    const mid = hr === 'luanxing' ? ['星罗殿执事', '叛星盟长老', '玄阴岛弟子', '猎妖团团长'] : hr === 'dajin' ? ['太一门长老', '叶家家主', '天魔宗执事', '归意门长老'] : ['栖云宗长老', '阴灵门弟子', '正一盟执事', '藏剑门剑修'];
    const high = hr === 'luanxing' ? ['星罗殿的元婴长老（神识一扫全场）', '某位海外元婴老怪', '雅间里的元婴修士'] : hr === 'dajin' ? ['天字号雅间里的元婴老怪', '叶家元婴老祖', '天魔宗元婴长老', '皇族供奉（元婴）'] : ['正一盟的元婴长老', '雅间里的元婴老怪', '阴灵门元婴长老'];
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
    if (l.map === 'lingjie') {
      const reqR = l.major ? 5 : 4;
      if (h.realm < reqR) return { ok: false, why: `灵界大宗不收低阶散修，须${REALMS[reqR].name}期以上方可拜入` };
      return { ok: true, why: '' };
    }
    if (l.map === 'xianjie') {
      if (h.realm < 9) return { ok: false, why: '仙宗唯收真仙以上修士' };
      return { ok: true, why: '' };
    }
    if (l.id === 'qixuan') return { ok: true, why: '' };
    if (l.id === 'huangfeng' && C.bagCount(h, 'item_shengxian') > 0) return { ok: true, why: '持问仙令可直接入门' };
    const need = l.major ? 5 : 3;
    if (h.realm < 1 || (h.realm === 1 && h.stage < need)) return { ok: false, why: `需炼气${['', '一', '二', '三', '四', '五', '六'][need]}层以上${l.id === 'huangfeng' ? '（或持问仙令）' : ''}` };
    return { ok: true, why: '' };
  }
  join(l: LocDef) {
    const g = this.game;
    const r = this.joinReq(l); if (!r.ok) { g.toast(r.why, 'warn'); return; }
    const hasToken = l.id === 'huangfeng' && C.bagCount(g.hero, 'item_shengxian') > 0;
    if (hasToken) C.removeItem(g.hero, 'item_shengxian', 1);
    // 人界：炼气 1-5 层先入杂役，炼气 6+ 或筑基直入外门/内门；灵界：元婴外门、化神内门、炼虚核心、合体执事
    const initRank = l.map === 'lingjie'
      ? (g.hero.realm >= 7 ? 4 : g.hero.realm >= 6 ? 3 : g.hero.realm >= 5 ? 2 : 1)
      : l.map === 'xianjie'
        ? (g.hero.realm >= 11 ? 4 : g.hero.realm >= 10 ? 3 : 2)
        : (g.hero.realm >= 2 ? 2 : (hasToken || g.hero.stage >= 5) ? 1 : 0);
    g.ws.sect = { id: l.id, rank: initRank, contrib: 50, joined: g.day, lastPay: g.day, tasks: [], done: 0, v8: true };
    this.refreshTasks();
    g.news(`苏寒拜入${l.name}，成为${SECT_RANKS[initRank]}。`, 'personal');
    g.toast(`拜入${l.name}（${SECT_RANKS[initRank]}）！每月可领俸禄，完成宗门任务换取贡献。`, 'good');
    if (DEMON.has(l.id)) g.ws.rep = Math.min(g.ws.rep, -20);
  }
  leave() {
    const g = this.game, s = g.ws.sect; if (!s) return;
    const oldId = s.id;
    g.ws.flags.betray = [...(g.ws.flags.betray ?? []), oldId];
    g.news(`苏寒叛出${LOC_BY_ID.get(oldId)?.name}。`, 'personal');
    for (const n of g.npcs.list) if (n.sect === oldId && Math.random() < 0.4) n.grudge = 1;
    g.ws.sect = null;
    g.sectwar?.revokeSectOrders?.(oldId);
  }
  /** 每月俸禄（在宗门领取） */
  pay() {
    const g = this.game, s = g.ws.sect; if (!s) return 0;
    const months = Math.floor((g.day - s.lastPay) / 30);
    if (months <= 0) return 0;
    const sl = LOC_BY_ID.get(s.id);
    const wId = sl ? zoneWorld(zoneOfLoc(sl)) : ACTIVE_WORLD;
    const curId = worldCurrencyId(wId), curName = worldCurrencyName(wId);
    const baseAmt = months * ([6, 12, 30, 75, 180, 450, 1200, 3000][s.rank] ?? 10);
    const amt = wId === 'human' ? baseAmt : Math.max(1, Math.round(baseAmt / (wId === 'spirit' ? 60 : 200)));
    if (!Number.isSafeInteger(amt) || amt <= 0 || !Number.isFinite(s.lastPay + months * 30) || !C.canAddItem(g.hero, curId, amt)) { g.toast(`俸禄暂无法领取，请检查${curName}数量。`, 'warn'); return 0; }
    // 提前更新领取时间，避免入袋监听回调重入重复领取。
    const lastPay = s.lastPay; s.lastPay += months * 30;
    if (!C.addItem(g.hero, curId, amt)) { s.lastPay = lastPay; return 0; }
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
    const rnd = mulberry32((g.day | 0) * 13 + l.x + s.rank * 37);
    const h = g.hero;
    const rank = s.rank ?? 0;
    const out: SectTask[] = [];
    const curPlane = planeMeta(ACTIVE_WORLD).planeTag;
    const maxBeastDanger = ACTIVE_WORLD === 'human'
      ? (rank <= 1 ? Math.min(2, 1 + h.realm) : rank <= 3 ? 2 + h.realm : 3 + h.realm)
      : (rank <= 2 ? 4 : rank <= 4 ? 5 : 6);
    const beasts = ENEMY_LIST.filter((e) => (e.plane ?? 'mortal') === curPlane && (!e.maps || e.maps.includes(ACTIVE_MAP)) && !e.lair && e.kind !== 'human' && e.minDanger <= maxBeastDanger && (ACTIVE_WORLD !== 'human' || !e.zone));
    const evil = ENEMY_LIST.filter((e) => (e.plane ?? 'mortal') === curPlane && (!e.maps || e.maps.includes(ACTIVE_MAP)) && !e.lair && e.evil && e.minDanger <= (ACTIVE_WORLD === 'human' ? (rank <= 1 ? 1 + h.realm : 2 + h.realm) : maxBeastDanger));
    const maxHerbTier = rank <= 1 ? Math.max(1, Math.min(2, h.realm)) : Math.max(1, h.realm + (rank >= 4 ? 1 : 0));
    const herbs = curPlane !== 'mortal'
      ? ITEM_LIST.filter((it) => it.type === 'herb' && (it.plane === curPlane || (it.plane !== 'immortal' && it.tier >= 2 && it.tier <= 5)))
      : ITEM_LIST.filter((it) => it.type === 'herb' && it.plane !== 'spirit' && it.plane !== 'immortal' && it.tier <= maxHerbTier);
    const k = Math.max(1, h.realm) * (rank >= 4 ? 1.25 : rank >= 2 ? 1.1 : 1);
    const isDemon = DEMON.has(s.id);
    const be = beasts[Math.floor(rnd() * beasts.length)];
    const be2 = beasts.filter((x) => x !== be)[Math.floor(rnd() * Math.max(1, beasts.length - 1))] ?? be;
    const ev = isDemon ? beasts[Math.floor(rnd() * beasts.length)] : (evil[Math.floor(rnd() * evil.length)] ?? be);
    const hb = herbs[Math.floor(rnd() * herbs.length)];
    const hb2 = herbs.filter((x) => x !== hb)[Math.floor(rnd() * Math.max(1, herbs.length - 1))] ?? hb;
    const distScale = l.map === 'lingjie' ? 4.2 : l.map === 'xianjie' ? 2.5 : 1;
    const nearDanger = LOCATIONS.filter((x) => x.type === 'danger' && Math.hypot(x.x - l.x, x.y - l.y) < (rank <= 1 ? 55 : 95) * distScale);
    const secretOrHigh = LOCATIONS.filter((x) => (x.type === 'danger' || x.type === 'secret') && Math.hypot(x.x - l.x, x.y - l.y) < 110 * distScale);
    const pl = (rank >= 3 && secretOrHigh.length ? secretOrHigh : nearDanger)[Math.floor(rnd() * Math.max(1, (rank >= 3 && secretOrHigh.length ? secretOrHigh : nearDanger).length))];

    if (rank <= 1) {
      // 杂役 / 外门弟子：采办灵草、近郊清妖、山门外围巡山
      if (hb) out.push({ id: 't' + g.day + 'c1', kind: 'gather', text: `杂务采办：上缴${hb.name}`, target: hb.id, need: 2 + Math.floor(rnd() * 3), have: 0, reward: Math.round(32 * k + hb.price / 4), exp: 0.025, until: g.day + 120 });
      if (hb2) out.push({ id: 't' + g.day + 'c2', kind: 'gather', text: `丹房备料：上缴${hb2.name}`, target: hb2.id, need: 2 + Math.floor(rnd() * 2), have: 0, reward: Math.round(28 * k + hb2.price / 4), exp: 0.02, until: g.day + 120 });
      if (be) out.push({ id: 't' + g.day + 'a', kind: 'kill', text: `外门清野：驱除${be.name}`, target: be.id, need: 3 + Math.floor(rnd() * 3), have: g.ws.kills[be.id] ?? 0, reward: Math.round(42 * k), exp: 0.035, until: g.day + 90 });
      if (pl) out.push({ id: 't' + g.day + 'd', kind: 'patrol', text: `近郊哨探：巡查「${pl.name}」`, target: pl.id, need: 1, have: 0, reward: Math.round(45 * k), exp: 0.03, until: g.day + 120 });
    } else if (rank <= 3) {
      // 内门 / 核心弟子：宗门历练、除魔/血祭、凶地巡查与精良灵材
      if (be) out.push({ id: 't' + g.day + 'a', kind: 'kill', text: `内门试炼：猎杀${be.name}`, target: be.id, need: 3 + Math.floor(rnd() * 4), have: g.ws.kills[be.id] ?? 0, reward: Math.round(48 * k), exp: 0.045, until: g.day + 90 });
      if (ev) out.push({ id: 't' + g.day + 'b', kind: 'kill', text: isDemon ? `血祭历练：猎杀${ev.name}` : `除魔卫道：斩杀${ev.name}`, target: ev.id, need: 2 + Math.floor(rnd() * 3), have: g.ws.kills[ev.id] ?? 0, reward: Math.round(75 * k), exp: 0.06, until: g.day + 120 });
      if (hb) out.push({ id: 't' + g.day + 'c', kind: 'gather', text: `宗库征集：上缴${hb.name}`, target: hb.id, need: 2 + Math.floor(rnd() * 3), have: 0, reward: Math.round(35 * k + hb.price / 4), exp: 0.025, until: g.day + 120 });
      if (pl) out.push({ id: 't' + g.day + 'd', kind: 'patrol', text: `外派巡察：探查「${pl.name}」`, target: pl.id, need: 1, have: 0, reward: Math.round(58 * k), exp: 0.035, until: g.day + 120 });
    } else {
      // 执事 / 长老：镇压大凶、督办要务、督巡险地
      if (ev) out.push({ id: 't' + g.day + 'b', kind: 'kill', text: isDemon ? `长老血祭：猎杀${ev.name}` : `镇魔督剿：斩杀${ev.name}`, target: ev.id, need: 3 + Math.floor(rnd() * 3), have: g.ws.kills[ev.id] ?? 0, reward: Math.round(88 * k), exp: 0.07, until: g.day + 120 });
      if (be2) out.push({ id: 't' + g.day + 'a', kind: 'kill', text: `清理兽患：清剿${be2.name}`, target: be2.id, need: 4 + Math.floor(rnd() * 3), have: g.ws.kills[be2.id] ?? 0, reward: Math.round(60 * k), exp: 0.05, until: g.day + 90 });
      if (pl) out.push({ id: 't' + g.day + 'd', kind: 'patrol', text: `代宗巡镇：镇巡「${pl.name}」`, target: pl.id, need: 1, have: 0, reward: Math.round(72 * k), exp: 0.045, until: g.day + 120 });
      if (hb) out.push({ id: 't' + g.day + 'c', kind: 'gather', text: `库藏征调：上缴${hb.name}`, target: hb.id, need: 3 + Math.floor(rnd() * 2), have: 0, reward: Math.round(45 * k + hb.price / 3.5), exp: 0.03, until: g.day + 120 });
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
    return t.have;
  }
  turnIn(t: SectTask) {
    const g = this.game, s = g.ws.sect; if (!s) return;
    const reward = Math.round(t.reward);
    if (!s.tasks.includes(t) || !Number.isSafeInteger(t.need) || t.need <= 0 || !Number.isSafeInteger(reward) || reward < 0 || !Number.isSafeInteger(s.contrib) || !Number.isSafeInteger(s.contrib + reward) || !Number.isSafeInteger(s.done) || !Number.isSafeInteger(s.done + 1) || !Number.isFinite(t.exp) || t.exp < 0 || this.taskProgress(t) < t.need) return;
    if (t.kind === 'gather' && !C.exchangeItems(g.hero, [{ id: t.target, n: t.need }], [])) { g.toast('上缴物品异常，任务未完成。', 'warn'); return; }
    s.contrib += reward; s.done++;
    C.temperDao(g.hero, 0.35);
    const msgs: C.Msg[] = []; C.gainExp(g.hero, C.need(g.hero) * C.INSIGHT * t.exp, msgs);
    s.tasks = s.tasks.filter((x) => x !== t);
    g.toast(`任务完成：贡献 +${Math.round(t.reward)}`, 'good');
    if (!s.tasks.length) this.refreshTasks();
  }
  promoteReq(): { ok: boolean; why: string } {
    const g = this.game, s = g.ws.sect; if (!s) return { ok: false, why: '' };
    const r = s.rank + 1; if (r >= 6) return { ok: false, why: '已是宗门实权长老之极' };
    const sl = LOC_BY_ID.get(s.id);
    const wId = sl ? zoneWorld(zoneOfLoc(sl)) : ACTIVE_WORLD;
    if (wId === 'human' && r === 1 && g.hero.realm <= 1 && g.hero.stage < 5 && s.contrib < SECT_RANK_NEED[1]) return { ok: false, why: '须至炼气六层或积满 80 贡献方出杂役' };
    if (s.contrib + s.done * 0 < SECT_RANK_NEED[r] && totalContrib(s) < SECT_RANK_NEED[r]) return { ok: false, why: `累计贡献需 ${SECT_RANK_NEED[r]}` };
    const reqRealm = wId === 'spirit' ? ([4, 4, 5, 5, 6, 7][r] ?? 7) : wId === 'immortal' ? ([9, 9, 9, 10, 10, 11][r] ?? 11) : SECT_RANK_REALM[r];
    if (g.hero.realm < reqRealm) return { ok: false, why: `需${REALMS[reqRealm].name}期` };
    return { ok: true, why: '' };
  }
  promote() { const g = this.game, s = g.ws.sect; if (!s || !this.promoteReq().ok) return; s.rank++; g.toast(`晋升为${LOC_BY_ID.get(s.id)?.name}${SECT_RANKS[s.rank]}！`, 'good'); g.news(`苏寒晋升${LOC_BY_ID.get(s.id)?.name}${SECT_RANKS[s.rank]}。`, 'personal'); }
  library(l: LocDef): Shop {
    const g = this.game, s = g.ws.sect!;
    const h = g.hero;
    const halfYear = Math.floor(g.day / 180);
    const zp = zonePlane(zoneOfLoc(l));
    const { key: cacheKey, stock } = cachedShopStock(g.ws, `lib:${l.id}:r${s.rank}`, halfYear, () => {
      const ids = new Set<string>((SECT_LIB[l.id] ?? []).filter((id) => !canonOwned(id)));
      // 第三十七步：别派秘传不会出现在本宗藏经阁
      const pool = ITEM_LIST.filter((it) => it.type === 'scroll' && it.tier <= Math.max(zp === 'spirit' ? 4 : 1, s.rank + (zp === 'spirit' ? 1 : 0)) && it.price > 0 && sectCanOffer(it, l.id));
      const rnd = mulberry32(l.x * 7 + halfYear);
      for (let i = 0; i < 6 && pool.length; i++) ids.add(pool[Math.floor(rnd() * pool.length)].id);
      const built: ShopStock[] = [...ids].filter((id) => itemDef(id).name !== id).map((id) => ({ id, price: Math.max(20, Math.round(itemDef(id).price / (zp === 'spirit' ? 20 : 6))), n: 1 }));
      if (zp === 'spirit') {
        built.push({ id: 'pill_lingjing_huiqi', price: 25, n: 9 }, { id: 'pill_lingjing_liaoshang', price: 28, n: 9 });
        if (s.rank >= 2) built.push({ id: 'pill_huaxu', price: 420, n: 2 });
        if (s.rank >= 3) built.push({ id: 'pill_ningxiang', price: 1200, n: 1 });
        if (s.rank >= 5) built.push({ id: 'pill_pojie', price: 3200, n: 1 });
      } else if (zp === 'immortal') {
        built.push({ id: 'pill_xian_yunshen', price: 60, n: 9 }, { id: 'pill_dingxian_zhenshuai', price: 800, n: 2 });
        if (s.rank >= 3) built.push({ id: 'pill_zhenxian', price: 1400, n: 1 });
      } else {
        built.push({ id: 'pill_juqi', price: 15, n: 9 }, { id: 'pill_huiqi', price: 8, n: 9 }, { id: 'pill_liaoshang', price: 10, n: 9 });
        if (s.rank >= 2) built.push({ id: 'pill_zhuji', price: 900, n: 1 });
        if (s.rank >= 4) built.push({ id: 'pill_jiangchen', price: 6000, n: 1 });
      }
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
    const curName = worldCurrencyName(zoneWorld(zoneOfLoc(l)));
    const lines = [`身份：${SECT_RANKS[s.rank]}　贡献：${s.contrib}　已完成任务：${s.done}`, pay ? `领取俸禄 ${pay} ${curName}。` : '本月俸禄已领。'];
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
