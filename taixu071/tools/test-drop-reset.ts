// 回归：受保护补发掉落不随战斗重置凭空消失（v0.71 补）
//   1) resetCombatKeepingDrops：只留「受保护、未收取、未在收取中」的那些，且对象原样留在原坐标
//   2) protectedLoot：秘境里连入口石台上那份也算（与 save() 取法一致）
//   3) 真死 / 坐化：脚边掉落随遗物入碑（合并同名条目 + 碑文补一句），下一世在碑前取回
//   4) 调用点：trueDeath 确实把脚边掉落交给了碑；掳走 / 救援路径走的是保留版的 reset
import './env';
import assert from 'node:assert/strict';
(globalThis as any).window = { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const storage = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
const { Game } = await import('../src/world/game');
const { DaoxinSys } = await import('../src/world/daoxin');
const { RenxinSys } = await import('../src/world/renxin');
const C = await import('../src/world/cultivation');

let n = 0, bad = 0;
const ok = (c: any, msg: string) => { n++; if (!c) { bad++; console.log('  ✗', msg); } else console.log('  ok   ' + msg); };

console.log('一、resetCombatKeepingDrops 只留受保护的那些');
{
  const blocked = { x: 100, y: 200, id: 'mat_yaodan', n: 2, t: 3, blocked: true };
  const collecting = { x: 1, y: 2, id: 'herb_lingcao', n: 1, t: 1, blocked: true, collecting: true };
  const collected = { x: 1, y: 2, id: 'herb_lingcao', n: 1, t: 1, blocked: true, collected: true };
  const plain = { x: 5, y: 6, id: 'mat_yaodan', n: 1, t: 0 };
  const fake: any = { combat: { loot: [blocked, collecting, collected, plain], reset() { this.loot = []; } } };
  const kept = Game.prototype.resetCombatKeepingDrops.call(fake);
  ok(kept === 1, `保住 1 件（实际 ${kept}）`);
  ok(fake.combat.loot.length === 1, '重置后只留下这一件');
  ok(fake.combat.loot[0] === blocked, '留的是同一个对象（坐标与 t、blocked 都原样）');
  ok(fake.combat.loot[0].x === 100 && fake.combat.loot[0].y === 200, '坐标没被搬动——走回去还能捡');
  // 没有掉落时也不报错、也不产生空数组元素
  const empty: any = { combat: { loot: [], reset() { this.loot = []; } } };
  ok(Game.prototype.resetCombatKeepingDrops.call(empty) === 0 && empty.combat.loot.length === 0, '没有补发掉落时是空操作');
}

console.log('二、protectedLoot 把秘境入口石台那份也算上');
{
  const a = { x: 10, y: 20, id: 'mat_yaodan', n: 1, t: 0, blocked: true };
  const fake: any = {
    combat: { loot: [a] },
    mijing: { cur: { back: { x: 900, y: 800 }, stashLoot: [{ x: 1, y: 2, id: 'mat_yaodan', n: 4, t: 0, blocked: true }] } },
  };
  const list = Game.prototype.protectedLoot.call(fake);
  ok(list.length === 2, `地上 1 + 石台 1（实际 ${list.length}）`);
  ok(list[0].x === 900 && list[0].y === 800, '石台那份按秘境入口坐标记');
  ok(list[1].id === 'mat_yaodan' && list[1].n === 1, '地上的那份也在');
  fake.mijing.cur = null;
  ok(Game.prototype.protectedLoot.call(fake).length === 1, '不在秘境时只算地上');
  const broken: any = { combat: { loot: [{ x: 1, y: 1, id: 'x', n: 1, t: 0, blocked: true, collected: true }] } };
  ok(Game.prototype.protectedLoot.call(broken).length === 0, '已收走的不算');
}

console.log('三、真死 / 坐化：脚边掉落随遗物入碑');
{
  const hero: any = C.newHero();
  hero.name = '测试真人';
  const fake: any = {
    hero, player: { x: 3000, y: 4000 },
    day: 720, clock: 0, ws: { hearts: {}, exp2: [], sect: null, rep: 0, cred: 60, flags: {} },
    st: { pending: undefined, deaths: 0 }, tier: 'fanren',
  };
  fake.game = fake;
  const st: any = DaoxinSys.prototype.onTrueDeath.call(fake, '测试凶手', '死于回归测试', undefined, [
    { id: 'mat_lingshi', n: 3 }, { id: 'mat_lingshi', n: 2 },
    { id: '', n: 5 }, { id: 'mat_yaodan', n: -1 }, null,
  ]);
  ok(st && st.legacy, '碑立起来了');
  const ling = st.legacy.items.filter((x: any) => x.id === 'mat_lingshi');
  ok(ling.length === 1 && ling[0].n === 5, `同名条目合并（实际 ${JSON.stringify(ling)}）`);
  ok(!st.legacy.items.some((x: any) => x.id === '' || x.n <= 0), '非法条目被丢掉（空 id / 负数 / null）');
  ok(st.bio.some((l: string) => l.includes('脚边尚散着 2 件')), '碑文补了一句「脚边尚散着 N 件」');
  ok(typeof st.legacy.stones === 'number', '灵石照旧单独记');
  // 没有脚边掉落时不写那一句
  const st2: any = DaoxinSys.prototype.onTrueDeath.call(fake, '测试凶手', '再次陨落', undefined, []);
  ok(!st2.bio.some((l: string) => l.includes('脚边尚散着')), '没有脚边掉落时不多写一句');
}

console.log('四、调用点：trueDeath 把脚边掉落交给碑');
{
  let handed: any = null, resetKept = false;
  const g: any = {
    hero: { hp: 100 }, player: { x: 1, y: 1 },
    combat: { reset() { resetThis = true; } },
    pursuit: { reset() {} },
    protectedLoot: () => [{ x: 1, y: 1, id: 'mat_yaodan', n: 2 }],
    daoxin: { onTrueDeath: (_k: string, _c: string, _id?: string, drops?: any[]) => { handed = drops; return { bio: [] }; }, deathNode: () => ({}) },
    updateUI() {}, openDialog() {},
  };
  let resetThis = false;
  (RenxinSys as any).prototype.trueDeath.call({ game: g }, '凶手', undefined, '死于测试');
  ok(Array.isArray(handed) && handed.length === 1 && handed[0].id === 'mat_yaodan' && handed[0].n === 2, `碑收到 1 条脚边掉落（实际 ${JSON.stringify(handed)}）`);
  ok(resetThis, '战斗照常重置（敌人与弹道都要清）');
}

console.log(`\n结果：通过 ${n - bad}，失败 ${bad}`);
if (bad) process.exit(1);
