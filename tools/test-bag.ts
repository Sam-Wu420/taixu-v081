// 收官 C（甲）储物袋与整套装备的回归测试：npx tsx tools/test-bag.ts
// 格子位置稳定、旧存档补排位、整理、穿脱十个槽、属性加成进 mod()、套装加成、pill: 快捷栏、已穿不能卖、给装备时别的路径不多取随机数
import { createCanvas } from './env';
const CW = 1280, CH = 800;
const store = new Map<string, string>();
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };

const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Renderer } = await import('../src/world/render');
const C = await import('../src/world/cultivation');
const { itemDef, ITEMS } = await import('../src/data/items');
const { LOC_BY_ID } = await import('../src/data/world');
const { SETS, GEAR_ITEMS, BOND_MUL, gearDropId } = await import('../src/data/gear');

const terrain = new Terrain(); terrain.build();
const g = new Game(terrain);
const cv: any = createCanvas(CW, CH); cv.clientWidth = CW; cv.clientHeight = CH;
cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: CW, height: CH });
g.canvas = cv; g.renderer = new Renderer(g, cv); (g as any).paused = false;

let fails = 0;
const ok = (cond: any, msg: string) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const h = () => g.hero;
const posOf = (id: string) => h().bag.find((b) => b.id === id)?.pos;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

// ---------------------------------------------------------------- 1. 格子位置稳定
{
  g.hero = C.newHero(); C.ensureBagPos(g.hero);
  const before = new Map(h().bag.map((b) => [b, b.pos]));
  ok(h().bag.every((b) => b.pos !== undefined), '新开局：每一堆都有格子');
  const tabs = new Map<string, Set<number>>(); let dup = false;
  for (const b of h().bag) { const t = C.tabOf(b.id), s = tabs.get(t) ?? new Set(); if (s.has(b.pos!)) dup = true; s.add(b.pos!); tabs.set(t, s); }
  ok(!dup, '同一页签里格子不重号');
  C.addItem(g.hero, 'herb_lingzhi', 2, 30); C.addItem(g.hero, 'pill_juling', 1); C.addItem(g.hero, 'mat_xuantie', 3);
  ok([...before].every(([b, p]) => b.pos === p), '加了三样新东西，原来的格子一个都没挪');
  const pj = posOf('pill_juqi')!, ph = posOf('pill_huiqi')!;
  C.removeItem(g.hero, 'pill_juqi', 2);
  ok(posOf('pill_juqi') === undefined && posOf('pill_huiqi') === ph, '吃完一堆：那一格空出来，别的不动');
  C.addItem(g.hero, 'pill_yanshou', 1);
  ok(posOf('pill_yanshou') === pj, '再进一样丹药：落进刚空出来的第一个空格');
  C.addItem(g.hero, 'herb_lingzhi', 1);
  ok(h().bag.filter((b) => b.id === 'herb_lingzhi').length === 1 && h().bag.find((b) => b.id === 'herb_lingzhi')!.n === 3, '同类照旧堆叠（灵草只看数量，不记年份）');
  const b0 = h().bag.find((b) => b.id === 'tal_fire')!, b1 = h().bag.find((b) => b.id === 'tal_ice')!;
  const [p0, p1] = [b0.pos, b1.pos];
  C.moveBagItem(g.hero, b0, p1!);
  ok(b0.pos === p1 && b1.pos === p0, '拖到有东西的格子：两格互换');
  C.moveBagItem(g.hero, b0, 30);
  ok(b0.pos === 30 && b1.pos === p0, '拖到空格：只挪这一格');
}

// ---------------------------------------------------------------- 2. 整理
{
  C.sortBag(g.hero);
  let good = true;
  for (const t of C.BAG_TABS) { const ps = h().bag.filter((b) => C.tabOf(b.id) === t && C.shownCount(h(), b) > 0).map((b) => b.pos!).sort((a, b) => a - b); if (ps.some((p, i) => p !== i)) good = false; }
  ok(good, '整理：每个页签从第 0 格起连续排满');
  const pills = h().bag.filter((b) => C.tabOf(b.id) === 'pill').sort((a, b) => a.pos! - b.pos!);
  ok(pills.every((b, i) => i === 0 || itemDef(pills[i - 1].id).tier >= itemDef(b.id).tier), '整理：同页签按品阶从高到低');
}

// ---------------------------------------------------------------- 3. 旧存档补排位
{
  g.hero = C.newHero(); C.addItem(g.hero, 'herb_zihou', 2); C.addItem(g.hero, 'art_xuantie', 1);
  ok(g.save(1) === true, '存档');
  const raw = JSON.parse(store.get('taixu_save_1')!);
  const ids = raw.hero.bag.map((b: any) => `${b.id}:${b.n}`);
  for (const b of raw.hero.bag) delete b.pos;   // 模拟旧存档：没有 pos
  for (const b of raw.hero.bag) if (itemDef(b.id).type === 'herb') b.age = 300;   // 旧存档的灵草还带着年份
  raw.hero.hotbar[8] = 'pill:not_an_item';
  store.set('taixu_save_1', JSON.stringify(raw));
  const g2 = new Game(terrain);
  ok(g2.load('taixu_save_1') === true, '读旧存档成功');
  const ids2 = g2.hero.bag.map((b) => `${b.id}:${b.n}`);
  ok(JSON.stringify(ids) === JSON.stringify(ids2), '读档后东西一样不少、不串');
  ok(!g2.hero.bag.some((b) => itemDef(b.id).type === 'herb' && b.age !== undefined), '旧存档里灵草的年份被抹掉（只看数量）');
  ok(g2.hero.bag.every((b) => b.pos !== undefined), '读档后每一堆都补上了格子');
  const mats = g2.hero.bag.filter((b) => C.tabOf(b.id) === 'mat');
  ok(mats.map((b) => b.pos).join() === mats.map((_, i) => i).join(), '补排位按原来的顺序从 0 排起（看上去和旧版一样）');
  ok(g2.hero.hotbar[8] === null, '读档：快捷栏里不存在的丹药条目被清掉');
}

// ---------------------------------------------------------------- 4. 给装备时别的路径不多取随机数
{
  g.hero = C.newHero();
  const R = Math.random; let calls = 0;
  Math.random = () => { calls++; return R(); };
  C.addItem(g.hero, 'herb_huangjing', 3, 12); C.addItem(g.hero, 'pill_juqi', 2); C.addItem(g.hero, 'art_qingfeng', 1); C.addItem(g.hero, 'tal_fire', 4);
  C.addFakeItem(g.hero, 'pill_zhuji', 1, 'dyed', 'x', '某人'); C.removeItem(g.hero, 'pill_juqi', 1); C.sortBag(g.hero); C.ensureBagPos(g.hero); C.mod(g.hero, 'hp'); C.heroStats(g.hero);
  ok(calls === 0, `非装备的入袋、出袋、整理、算属性：一个随机数都不取（取了 ${calls} 个）`);
  C.addItem(g.hero, 'gear_ring_3', 2);
  ok(calls > 0, '给装备：在装备分支里摇词条');
  Math.random = R;
  const rings = h().bag.filter((b) => b.id === 'gear_ring_3');
  ok(rings.length === 2 && rings.every((b) => b.n === 1 && b.uid && b.affix && b.affix.length >= 1 && b.affix.length <= 3), '装备不堆叠：两件各占一格，各带 1–3 条词条');
  ok(rings[0].pos !== rings[1].pos && rings.every((b) => b.pos !== undefined), '每件装备自己找格子');
  // 词条固定序列
  const seq = [0.99, 0.0, 0.5, 0.2, 0.7, 0.1, 0.9];
  let k = 0; const old = C.gearRng.next; C.gearRng.next = () => seq[k++ % seq.length];
  C.addItem(g.hero, 'gear_belt_0', 1);
  C.gearRng.next = old;
  const belt = h().bag.find((b) => b.id === 'gear_belt_0')!;
  ok(belt.affix!.length === 3 && belt.affix![0].k === 'hp', '固定随机序列：词条可复现（3 条，第一条气血）');
}

// ---------------------------------------------------------------- 5. 穿脱十个槽 + 属性进 mod()
{
  g.hero = C.newHero(); g.hero.realm = 3; g.hero.stage = 0; g.combat.reset();
  const H = h();
  for (const id of ['gear_crown_2', 'gear_belt_2', 'gear_wrist_2', 'gear_ring_2', 'gear_pendant_2', 'art_huanglin', 'art_xuantie', 'art_shenfeng', 'art_tayun', 'art_lvhuang']) C.addItem(H, id, 1);
  const hp0 = C.mod(H, 'hp'), st0 = C.heroStats(H);
  for (const s of ['crown', 'belt', 'wrist', 'ring', 'pendant'] as const) { const b = H.bag.find((x) => x.id === `gear_${s}_2`)!; ok(C.wearGear(H, b).ok && b.worn === s && b.pos === undefined, `穿上${s}：打上记号、格子里不显示`); }
  for (const id of ['art_huanglin', 'art_xuantie', 'art_shenfeng', 'art_tayun']) g.combat.castArtifact(id);
  ok(C.bindBond(H, 'art_lvhuang'), '本命法宝：绑定一件攻击法宝');
  const keys = ['crown', 'belt', 'wrist', 'ring', 'pendant', 'armor', 'shield', 'flight', 'boots', 'bond'] as const;
  ok(keys.every((k) => !!(H.equip as any)[k]), '十个槽全都有东西：' + keys.map((k) => (H.equip as any)[k]).join(','));
  ok(keys.every((k) => C.wornIn(H, k)), 'wornIn 能找到每个槽上的那件');
  const want = ['gear_belt_2', 'gear_pendant_2'].reduce((a, id) => a + (itemDef(id).gear!.base.hp ?? 0), 0) + H.bag.filter((b) => b.worn).reduce((a, b) => a + (b.affix ?? []).filter((x) => x.k === 'hp').reduce((s, x) => s + x.v, 0), 0);
  ok(near(C.mod(H, 'hp') - hp0, want), `属性进 mod()：气血加成 ${(C.mod(H, 'hp') - hp0).toFixed(3)} = 基础 + 词条 ${want.toFixed(3)}`);
  ok(C.heroStats(H).hp > st0.hp, `heroStats 跟着涨：气血 ${st0.hp} → ${C.heroStats(H).hp}`);
  ok(C.mod(H, 'melee') > 0 && C.mod(H, 'poise') > 0, '新属性 melee / poise 从 mod() 读得到');
  ok(C.STAT_POISE === 'poise' && C.STAT_MELEE === 'melee' && C.STAT_WATERWARD === 'waterward' && C.STAT_WINDWARD === 'windward', '四个新属性名的常量导出');
  ok(H.bag.filter((b) => C.shownCount(H, b) > 0).every((b) => !b.worn) && H.bag.filter((b) => b.worn).length === 5, '已穿的五件仍在 bag 里，只是不显示');
  // 换装：同槽另一件
  C.addItem(H, 'gear_ring_5', 1);
  const r5 = H.bag.find((b) => b.id === 'gear_ring_5')!, r2 = H.bag.find((b) => b.id === 'gear_ring_2')!, p5 = r5.pos;
  C.wearGear(H, r5);
  ok(r5.worn === 'ring' && !r2.worn && r2.pos === p5 && H.equip.ring === 'gear_ring_5', '同槽换装：旧的落回新那件原来的格子');
  // 卸下
  const crown = C.unwearGear(H, 'crown', 40);
  ok(crown && !crown.worn && crown.pos === 40 && !H.equip.crown, '卸下发冠：放进指定的空格');
  g.combat.castArtifact('art_huanglin');
  ok(!H.equip.armor, '法衣再按一次是收起（仍走 castArtifact）');
  C.bindBond(H, 'art_lvhuang');
  ok(!H.equip.bond, '本命法宝再绑一次是解绑');
  ok(BOND_MUL > 1, '本命法宝有伤害加成');
  // 战败搜袋不动已穿的
  const keep = H.bag.filter((b) => b.worn).map((b) => b.uid).join();
  C.removeItem(H, 'gear_belt_2', 1);
  ok(H.bag.some((b) => b.id === 'gear_belt_2' && b.worn), 'removeItem 不扣已穿的那件');
  ok(H.bag.filter((b) => b.worn).map((b) => b.uid).join() === keep, '已穿的一件不少');
}

// ---------------------------------------------------------------- 6. 套装
{
  g.hero = C.newHero(); const H = h();
  const xg = SETS.xuangui.pieces;
  for (const id of xg) C.addItem(H, id, 1);
  for (const b of H.bag) b.affix = [];   // 去掉词条好算
  const ww0 = C.mod(H, 'waterward');
  C.wearGear(H, H.bag.find((b) => b.id === xg[0])!);
  const ww1 = C.mod(H, 'waterward');
  C.wearGear(H, H.bag.find((b) => b.id === xg[1])!);
  const ww2 = C.mod(H, 'waterward');
  const base2 = xg.slice(0, 2).reduce((a, id) => a + (itemDef(id).gear!.base.waterward ?? 0), 0);
  ok(near(ww2 - ww0, base2 + 0.25), `玄龟两件：避水 = 两件基础 ${base2} + 套装 0.25（得 ${(ww2 - ww0).toFixed(3)}）`);
  ok(ww1 - ww0 < 0.25, '一件没有套装加成');
  C.wearGear(H, H.bag.find((b) => b.id === xg[2])!); C.wearGear(H, H.bag.find((b) => b.id === xg[3])!);
  ok(C.setProgress(H).xuangui === 4 && C.mod(H, 'windward') >= 0.35, `玄龟四件：抗风 ${C.mod(H, 'windward').toFixed(3)}（含套装 0.35）`);
  ok(GEAR_ITEMS.length === 5 * 7 + 8 && GEAR_ITEMS.every((d) => ITEMS[d.id] && d.type === 'gear'), `装备表：五槽 × 七阶 + 两套八件 = ${GEAR_ITEMS.length} 件，都登记进了 ITEMS`);
  ok(/^gear_/.test(gearDropId(1234, 3)) && gearDropId(1234, 3) === gearDropId(1234, 3), '首领掉落按种子定、可复现');
}

// ---------------------------------------------------------------- 7. pill: 快捷栏
{
  g.hero = C.newHero(); g.combat.reset(); const H = h(); H.hp = 0.3;
  H.hotbar[4] = 'pill:pill_liaoshang';
  const n0 = C.bagCount(H, 'pill_liaoshang');
  g.combat.castSlot(4);
  ok(C.bagCount(H, 'pill_liaoshang') === n0 - 1 && H.hp > 0.3, '快捷栏丹药：按一下服一颗、回血');
  g.combat.castSlot(4);
  ok(C.bagCount(H, 'pill_liaoshang') === n0 - 1, '一息冷却内再按不服');
  C.removeItem(H, 'pill_liaoshang', 99);
  (g.combat as any).cds.clear();
  g.combat.castSlot(4);
  ok(H.hotbar[4] === 'pill:pill_liaoshang' && C.bagCount(H, 'pill_liaoshang') === 0, '吃完了：条目留着（格子变灰），按了只提示');
}

// ---------------------------------------------------------------- 8. 已穿不能卖
{
  g.hero = C.newHero(); const H = h();
  const loc = LOC_BY_ID.get('yuejing')!; const shop = g.towns.shop(loc, 'artifact');
  C.addItem(H, 'gear_crown_1', 1);
  const cr = H.bag.find((b) => b.id === 'gear_crown_1')!; C.wearGear(H, cr);
  ok(g.towns.sell(shop, 'gear_crown_1') === false && H.bag.includes(cr), '穿着的发冠不能卖');
  C.unwearGear(H, 'crown');
  ok(g.towns.sell(shop, 'gear_crown_1') === true && !H.bag.includes(cr), '卸下后就能卖');
  C.addItem(H, 'art_ruanwei', 1); H.equip.armor = 'art_ruanwei';
  ok(g.towns.sell(shop, 'art_ruanwei') === false, '祭出的法衣（只有这一件）不能卖');
}

// ---------------------------------------------------------------- 9. 按物品对象找
{
  g.hero = C.newHero(); const H = h();
  C.addFakeItem(H, 'pill_zhuji', 1, 'dyed', undefined, '某人');
  C.addItem(H, 'pill_zhuji', 1);
  const fake = H.bag.find((b) => b.fake)!;
  H.bag.reverse();   // 打乱下标
  const r = g.renxin.appraiseBagSlot(fake, true, 0);
  ok(r.isFake && fake.ident === true, '鉴定按物品对象找：袋子顺序变了也认得出那一堆');
  C.addFakeItem(H, 'pill_huiqi', 1, 'dyed', undefined, '某人');
  const fk2 = H.bag.find((b) => b.id === 'pill_huiqi' && b.fake)!, real = H.bag.find((b) => b.id === 'pill_huiqi' && !b.fake)!, n = real.n;
  H.bag.reverse();
  g.usePill('pill_huiqi', real);
  ok(real.n === n - 1 && fk2.n === 1, '服用指定那一堆（不按下标）：吃的是真丹那一堆，假的没动');
}

// ---------------------------------------------------------------- 10. 近战兵器：物品表、掉落不动原随机数、穿脱、heldWeapon 三种来源、存读档、旧存档
{
  const GR = await import('../src/data/gear');
  const { WEAPONS, WEAPON_TIERS } = await import('../src/data/weapons');
  const W = GR.WEAPON_ITEMS;
  ok(W.length === 21 && W.every((d) => ITEMS[d.id] === d && d.type === 'gear' && d.gear?.slot === 'weapon' && !!d.gear.weapon && (d.gear.base.melee ?? 0) > 0), '兵器表：剑、重兵、长枪各七阶共 21 件，都是 gear、槽位 weapon、以近战伤害为主');
  ok(new Set(W.map((d) => d.name)).size === 21 && W.every((d) => d.name === WEAPON_TIERS[d.gear!.weapon as 'sword'][d.tier].name), '兵器名字各不相同，和 weapons.ts 的品阶表一致');
  ok(GR.GEAR_SLOTS.length === 5 && !(GR.GEAR_SLOTS as string[]).includes('weapon') && GEAR_ITEMS.every((d) => d.gear?.slot !== 'weapon'), '老的五槽表、GEAR_ITEMS 里没有混进兵器');
  ok(['fist', 'sword', 'heavy', 'spear'].every((k) => WEAPONS[k as 'sword'].name && WEAPONS[k as 'sword'].desc) && WEAPONS.heavy.hands === 2 && WEAPONS.sword.hands === 1 && WEAPONS.spear.length > 95, '四种兵器的中文名、说明、握法、长度（长枪比人高）');
  // 固定种子：五槽的掉落逐位不变（下面这串校验和是加兵器之前那版 gearDropId 算出来的）
  let sig = 0; for (let s = 0; s < 4000; s++) for (const t of [0, 3, 6]) { const id = gearDropId(s * 7919 + 13, t); for (let i = 0; i < id.length; i++) sig = (Math.imul(sig, 31) + id.charCodeAt(i)) | 0; }
  const GEAR_SIG = 1602334406;
  ok(sig === GEAR_SIG, `五槽掉落的校验和没变（${sig}）`);
  const R = Math.random; let calls = 0; Math.random = () => { calls++; return R(); };
  const drops = Array.from({ length: 400 }, (_, i) => GR.weaponDrop(i * 31 + 5, 3));
  Math.random = R;
  const got = drops.filter(Boolean) as { id: string; affix: any[] }[];
  ok(calls === 0, `兵器掉落不取 Math.random（取了 ${calls} 个）`);
  ok(got.length > 80 && got.length < 220 && got.every((x) => ITEMS[x.id] && x.affix.length >= 1), `掉不掉兵器按哈希定（400 次掉了 ${got.length} 件，约三成五），每件带词条`);
  ok(JSON.stringify(GR.weaponDrop(777, 4)) === JSON.stringify(GR.weaponDrop(777, 4)), '兵器掉落可复现（同种子同一件、同一组词条）');
  ok(new Set(got.map((x) => x.id.split('_')[1])).size === 3, '三种兵器都会掉');

  // 穿脱
  g.hero = C.newHero(); g.hero.realm = 3; g.combat.reset(); const H = h();
  ok(C.heldWeapon(H).kind === 'fist' && C.heldWeapon(H).from === 'none', '新开局：空手（开局不给兵器）');
  ok(!H.bag.some((b) => GR.isWeaponItem(itemDef(b.id))), '新开局袋里没有兵器');
  C.addItem(H, 'wpn_sword_2', 1); C.addItem(H, 'wpn_heavy_3', 1); C.addItem(H, 'gear_wrist_2', 1);
  const sw = H.bag.find((b) => b.id === 'wpn_sword_2')!, hv = H.bag.find((b) => b.id === 'wpn_heavy_3')!;
  ok(C.slotOf('wpn_sword_2') === 'weapon' && C.tabOf('wpn_sword_2') === 'gear' && sw.affix && sw.uid, '兵器的槽位是 weapon、进「装备」页签、和别的装备一样带词条和独件编号');
  // 拖拽规则（储物袋的 canDrop 认 slotAccepts）：兵器只进兵器槽，兵器槽不收别的
  ok(C.slotAccepts('weapon', 'wpn_sword_2') && C.slotAccepts('weapon', 'wpn_spear_0') && !C.slotAccepts('wrist', 'wpn_heavy_3') && !C.slotAccepts('weapon', 'gear_wrist_2') && !C.slotAccepts('weapon', 'art_lvhuang') && C.slotAccepts('bond', 'art_lvhuang'), '拖拽规则：兵器只能拖进兵器槽，护腕、飞剑进不了兵器槽');
  const m0 = C.mod(H, 'melee');
  const p0 = sw.pos;
  ok(C.wearGear(H, sw).ok && sw.worn === 'weapon' && sw.pos === undefined && H.equip.weapon === 'wpn_sword_2', '穿上剑：打记号、格子里不显示、equip.weapon 记下');
  ok(C.mod(H, 'melee') > m0 + 0.05, `兵器的近战伤害进 mod()：${m0.toFixed(3)} → ${C.mod(H, 'melee').toFixed(3)}`);
  const hw = C.heldWeapon(H);
  ok(hw.kind === 'sword' && hw.item === 'wpn_sword_2' && hw.tier === 2 && hw.from === 'slot', 'heldWeapon：兵器槽里的剑（from slot）');
  C.wearGear(H, H.bag.find((b) => b.id === 'gear_wrist_2')!);
  ok(C.heldWeapon(H).kind === 'sword' && C.mod(H, 'melee') > m0 + 0.08, '护腕照穿，近战属性和兵器叠加');
  const hvPos = hv.pos;
  ok(C.wearGear(H, hv).ok && hv.worn === 'weapon' && !sw.worn && sw.pos === hvPos && C.heldWeapon(H).kind === 'heavy', '同槽换成重兵：剑落回重兵原来的格子');
  ok(C.wornIn(H, 'weapon') === hv, 'wornIn(weapon) 找得到');
  const loc = LOC_BY_ID.get('yuejing')!; const shop = g.towns.shop(loc, 'artifact');
  ok(g.towns.sell(shop, 'wpn_heavy_3') === false && H.bag.includes(hv), '穿着的兵器不能卖');
  const un = C.unwearGear(H, 'weapon', 44);
  ok(un === hv && !hv.worn && hv.pos === 44 && !H.equip.weapon && C.heldWeapon(H).kind === 'fist', '卸下兵器：放进指定格子，回到空手');
  void p0;
  // 本命法宝是剑类：握在手里当剑用
  C.addItem(H, 'art_lvhuang', 1); C.bindBond(H, 'art_lvhuang');
  const hb = C.heldWeapon(H);
  ok(hb.kind === 'sword' && hb.from === 'bond' && hb.item === 'art_lvhuang' && hb.tier === itemDef('art_lvhuang').tier, 'heldWeapon：槽空着、本命是飞剑 → 握着这口剑（from bond）');
  C.wearGear(H, sw);
  ok(C.heldWeapon(H).from === 'slot' && C.heldWeapon(H).item === 'wpn_sword_2', '兵器槽优先于本命飞剑');
  C.unwearGear(H, 'weapon'); C.bindBond(H, 'art_lvhuang');
  C.addItem(H, 'art_zhuque', 1); C.bindBond(H, 'art_zhuque');
  ok(C.heldWeapon(H).kind === 'fist', '本命是朱雀环（不是剑类）：仍是空手');
  // 主角外观跟着走
  const A = await import('../src/world/arms');
  C.bindBond(H, undefined); C.wearGear(H, sw); A.syncHeroArms(g);
  ok(g.player.look.weapon?.kind === 'sword' && g.player.look.weapon.tier === 2, '主角外观上挂着这把剑');
  const L1 = g.player.look; A.syncHeroArms(g);
  ok(g.player.look === L1, '没换兵器时外观对象不换（人物缓存按外观认）');
  C.unwearGear(H, 'weapon'); C.bindBond(H, 'art_lvhuang'); A.syncHeroArms(g);
  ok(g.player.look.weapon?.kind === 'sword' && g.player.look.weapon.color === itemDef('art_lvhuang').art!.color, '本命飞剑握在手里：外观带着那口剑的光色');
  C.bindBond(H, undefined); A.syncHeroArms(g);
  ok(!g.player.look.weapon, '都卸了：外观上没有兵器');

  // 存读档
  C.wearGear(H, hv);
  ok(g.save(2) === true, '穿着重兵存档');
  const g2 = new Game(terrain); ok(g2.load('taixu_save_2') === true, '读档');
  const hv2 = g2.hero.bag.find((b) => b.id === 'wpn_heavy_3')!;
  ok(hv2 && hv2.worn === 'weapon' && g2.hero.equip.weapon === 'wpn_heavy_3' && JSON.stringify(hv2.affix) === JSON.stringify(hv.affix) && C.heldWeapon(g2.hero).kind === 'heavy', '读档后兵器还穿着，词条原样');
  // 旧存档（没有 weapon 这一项、袋里没兵器）
  const raw = JSON.parse(store.get('taixu_save_2')!);
  const v0 = raw.v;
  raw.hero.bag = raw.hero.bag.filter((b: any) => !String(b.id).startsWith('wpn_')); delete raw.hero.equip.weapon;
  store.set('taixu_save_3', JSON.stringify(raw));
  const g3 = new Game(terrain); ok(g3.load('taixu_save_3') === true, '旧存档（没有兵器槽）照读');
  ok(C.heldWeapon(g3.hero).kind === 'fist' && !g3.hero.equip.weapon && C.wornIn(g3.hero, 'weapon') === undefined, '旧存档：空手、兵器槽空着');
  ok(g3.save(3) && JSON.parse(store.get('taixu_save_3')!).v === v0, '存档版本没升');
  // 兵器的记号乱了（模组直接改袋子）：读档时对齐
  const raw2 = JSON.parse(store.get('taixu_save_2')!); raw2.hero.equip.weapon = 'wpn_spear_6';
  store.set('taixu_save_3', JSON.stringify(raw2));
  const g4 = new Game(terrain); g4.load('taixu_save_3');
  ok(g4.hero.equip.weapon === 'wpn_heavy_3', '读档：equip.weapon 以袋里打了记号的那件为准');
}

if (fails > 0) { console.error(`\nFAILED: ${fails} assertions failed.`); process.exit(1); }
console.log('\n== 储物袋与整套装备：全部通过 ==');
