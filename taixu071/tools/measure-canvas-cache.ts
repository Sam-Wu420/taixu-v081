// 量一下各家程序化 canvas 缓存在「所有区域变体都生成」时的常驻画布内存。
// 只测量、不改行为；用来判断 canvas LRU 是否值得做。
import './env';

const VARIANTS = ['', 'dark', 'snow', 'rose'];
const seen = new Set<any>();
let totalBytes = 0;

function account(cv: any) {
  if (!cv || seen.has(cv)) return;
  seen.add(cv);
  const w = cv.width | 0, h = cv.height | 0;
  if (w > 0 && h > 0) totalBytes += w * h * 4;
}

function measure(name: string, keys: string[], build: (k: string) => any) {
  let n = 0;
  for (const k of keys) {
    for (let i = 0; i < VARIANTS.length; i++) {
      let out: any;
      try { out = build(k); } catch { continue; }
      if (!out) continue;
      n++;
      if (Array.isArray(out)) for (const c of out) account(c);
      else account(out);
    }
  }
  console.log(`  ${name.padEnd(20)} 条目 ${String(n).padStart(4)}  累计 ${(totalBytes / 1048576).toFixed(1)} MB`);
}

const props = await import('../src/gfx/townProps');
const houses = await import('../src/gfx/townHouses');
const shops = await import('../src/gfx/townShops');
const scenic = await import('../src/gfx/scenicProps');
const gates = await import('../src/gfx/townGates');

console.log('全量生成后的常驻画布内存：');
measure('townProps', Object.keys(props.TOWN_PROP_TYPES), (k) => props.townPropMips(k));
measure('townHouses', houses.TOWN_HOUSE_KEYS, (k) => houses.townHouseMips(k));
measure('townShops', shops.TOWN_SHOP_KEYS, (k) => shops.townShopMips(k));
measure('sectBuildings', shops.SECT_BUILDING_KEYS, (k) => shops.townShopMips(k));
measure('specialBuildings', shops.SPECIAL_BUILDING_KEYS, (k) => shops.townShopMips(k));
measure('scenicProps', scenic.SCENIC_PROP_KEYS, (k) => scenic.scenicPropMips(k));
measure('townGates', gates.TOWN_GATE_KEYS, (k) => gates.townGateMips(k));

console.log(`\n合计（去重后）: ${(totalBytes / 1048576).toFixed(1)} MB / ${seen.size} 张画布`);
