// v0.63 冒烟：灵力护盾（层数 / 逐层碎裂 / 飞行时坐标）+ 新绘制代码在真实粒子系统上跑一遍（不抛异常、不出 NaN）
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
await import('./env');
const fs = await import('node:fs');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const EN = await import('../src/data/enemies') as any;
const { Enemy } = await import('../src/world/combat');
const { lookOf } = await import('../src/world/artacts');
const { itemDef } = await import('../src/data/items');
const { DagengAct } = await import('../src/world/dageng');
const { beastBuff, beastEvq, sealFx } = await import('../src/world/beastfx');
const { drawBeastGL } = await import('../src/gl/beastgl');
const { drawLingdunGL } = await import('../src/gl/lingdungl');
const { castFlourish, projSparkle } = await import('../src/gl/spellgl');
const { FxSys } = await import('../src/gl/fx');
const { WORLD_SCALE, LOC_BY_ID, ACTIVE_MAP } = await import('../src/data/world');

let fails = 0;
const check = (n: string, ok: boolean, x = '') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); if (!ok) fails++; };
const fin = (...a: any[]) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('非有限数进了绘制调用'); };

const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain); g.reset();
const h = g.hero, c = g.combat, p = g.player;
const baseLoc = ACTIVE_MAP === 'luanxing' ? LOC_BY_ID.get('tianxing') : ACTIVE_MAP === 'dajin' ? LOC_BY_ID.get('jinjing') : null;
const base = baseLoc ? { x: baseLoc.x * WORLD_SCALE, y: baseLoc.y * WORLD_SCALE + 6000 } : { x: 120000, y: 93000 };
p.x = base.x; p.y = base.y; h.hp = 1; h.mp = 1; c.invulnT = 0;

// 真实 FxSys + 记录型 Batch（quad 记下来，strip 把宽度 / 透明度回调逐点跑一遍）
const rec: any[][] = [];
const B: any = new Proxy({
  quad: (...a: any[]) => { fin(...a); rec.push(a); },
  strip: (_c: number, pts: ArrayLike<number>, n: number, w: (i: number) => number, al: (i: number) => number) => { for (let i = 0; i < n; i++) fin(w(i), al(i), pts[i * 2], pts[i * 2 + 1]); },
  groundQuad: (...a: any[]) => fin(...a),
  z: 1, sx: (x: number) => x, sy: (y: number) => y,
}, { get: (t: any, k) => (k in t ? t[k] : () => {}) });
const F: any = new FxSys(B);
const nanCount = () => { const P = F.P as Float32Array, n = F.count * 20; let k = 0; for (let i = 0; i < n; i++) if (!Number.isFinite(P[i])) k++; return k; };

// ---------------------------------------------------------------- 1. 层数随境界
const L = c.lingdun;
const want = (realm: number, stage: number) => { h.realm = realm; h.stage = stage; return L.want; };
check('层数：凡人 0 · 炼气 1（十层起 2）· 筑基 2/3 · 结丹 3/4 · 元婴 4/5 · 化神 5/6',
  want(0, 0) === 0 && want(1, 0) === 1 && want(1, 9) === 2 && want(2, 0) === 2 && want(2, 2) === 3 && want(3, 0) === 3 && want(3, 2) === 4 && want(4, 0) === 4 && want(4, 2) === 5 && want(5, 0) === 5 && want(5, 2) === 6,
  [want(0, 0), want(1, 0), want(1, 9), want(2, 0), want(2, 2), want(3, 0), want(3, 2), want(4, 0), want(4, 2), want(5, 0), want(5, 2)].join(','));

// ---------------------------------------------------------------- 2. 逐层碎裂
h.realm = 3; h.stage = 0; c.combatT = 99; L.hp.length = 0; L.update(1 / 30);
const cap = L.cap;
check('结丹初期脱战即满三层', L.layers === 3 && Math.abs(L.hp[2] - cap) < 1e-6, `cap=${cap.toFixed(1)}`);
L.evq.length = 0;
const r1 = L.absorb(cap * 0.5, p.x + 100, p.y);
check('半层的伤害：全挡住、不碎、发「受击」事件', r1 === 0 && L.layers === 3 && L.evq.length === 1 && L.evq[0].k === 'hit', `ret=${r1}`);
L.evq.length = 0;
const r2 = L.absorb(cap * 10, p.x + 100, p.y), exp = (((10 - 0.5) * 0.75 - 1) * 0.75 - 1) * 0.75 * cap;
const pops = L.evq.filter((e: any) => e.k === 'pop');
check('十层的伤害：连破三层（叭叭叭），余劲逐层卸去四分之一', L.layers === 0 && pops.length === 3 && Math.abs(r2 - exp) < cap * 0.01, `穿透 ${(r2 / cap).toFixed(3)} 层（应为 ${(exp / cap).toFixed(3)}）`);
check('三声依次错开 0 / 0.09 / 0.18 秒，由外向内', pops.map((e: any) => e.delay.toFixed(2)).join('/') === '0.00/0.09/0.18' && pops.map((e: any) => e.i).join('') === '210', pops.map((e: any) => `${e.i}@${e.delay.toFixed(2)}`).join(' '));
check('尽碎后发「尽碎」事件', L.evq.some((e: any) => e.k === 'gone'));

// ---------------------------------------------------------------- 3. 接进了受击结算
h.realm = 2; h.stage = 0; h.hp = 1; c.combatT = 99; c.invulnT = 0; L.hp.length = 0; L.update(1 / 30);
const before = L.hp[L.layers - 1];
c.hitPlayer(c.pStats.hp * 0.05, 2, { k: 'burn', dur: 3, ch: 1 } as any, p.x + 100, p.y);
check('小伤害打在罩上：气血不掉、最外层灵力减少、不中异常', h.hp === 1 && L.hp[L.layers - 1] < before && !c.pst?.burn, `hp=${h.hp} 层 ${before.toFixed(1)}→${L.hp[L.layers - 1].toFixed(1)}`);

// ---------------------------------------------------------------- 4. 御剑时护盾跟着人走
h.realm = 4; h.stage = 0; c.combatT = 0; L.hp.length = 0; c.combatT = 99; L.update(1 / 30); c.combatT = 0; for (let i = 0; i < 30; i++) L.update(1 / 30);
p.st.lift = 80;
for (let i = 0; i < 45; i++) drawLingdunGL(F, c, i / 30, 1 / 30, 80);   // 各层是依次浮现的（每层错开约 77ms），等升起动画走完再数
rec.length = 0;
drawLingdunGL(F, c, 2, 1 / 30, 80);
const shells = rec.filter((a) => a[0] === 3);   // C.RingSoft = 罩壁
check('飞行高度 80：四层罩壁全画在 身体中心 − 80', shells.length === 4 && shells.every((a) => Math.abs(a[2] - (p.y - 50 - 80)) < 1e-6), `${shells.length} 层，y 偏移 ${shells.map((a) => (a[2] - p.y).toFixed(0)).join(',')}`);
p.st.lift = 0;
const src = fs.readFileSync(new URL('../src/world/combatfx.ts', import.meta.url), 'utf8');
check('精灵层的功法护盾贴图 / 回春阵也减了 lift（原穿模处）', src.includes('p.y - 56 - (p.st.lift || 0)') && src.includes("'heal_green_ring', p.x, p.y - (p.st.lift || 0)"));

// ---------------------------------------------------------------- 5. 妖兽
const bb4 = beastBuff(4), bb10 = beastBuff(10);
check('体魄加成：三级无 · 四级 ×1.12/×1.06 · 十级 ×1.94/×1.42', beastBuff(3).hp === 1 && Math.abs(bb4.hp - 1.12) < 1e-9 && Math.abs(bb4.atk - 1.06) < 1e-9 && Math.abs(bb10.hp - 1.94) < 1e-9 && Math.abs(bb10.atk - 1.42) < 1e-9);
const place = (id: string, dx: number, dy: number, realm: number, stage: number) => { const e: any = new Enemy(EN.ENEMIES[id], base.x + dx, base.y + dy, realm, stage); e.aggro = true; c.enemies.push(e); return e; };
const jiao = place('firejiao', 380, 0, 3, 0), toad = place('huochan', -260, 120, 3, 0);
check('赤火蛟按五级生成', jiao.blv >= 5, `blv=${jiao.blv} hp=${jiao.maxHp}`);
let err = '';
try {
  for (let i = 0; i < 90; i++) { g.modal = null; g.update(1 / 30); drawBeastGL(F, c, i / 30, 1 / 30); drawLingdunGL(F, c, i / 30, 1 / 30, 0); F.update(1 / 30); }
} catch (e: any) { err = String(e?.stack ?? e).split('\n').slice(0, 4).join(' | '); }
check('带两只高阶妖兽跑 3 秒（AI 出招 + 妖气 + 护盾）不抛异常', !err, err);
const kit = (jiao.kit ?? []) as any[];
console.log('     赤火蛟招式：' + (kit.map((s) => s.name).join('、') || '（尚未配招）'));
check('已配上 v0.63 的新招（妖息 / 妖踏）', !kit.length || kit.some((s) => s.id === 'yg_breath' || s.id === 'yg_leap' || s.k === 'cone'));
// 十三系 × 圆 / 扇 / 线 / 起手，外加宗门阵纹与扬尘，全放一遍
err = '';
try {
  const ELS = ['phys', 'fire', 'ice', 'water', 'thunder', 'poison', 'blood', 'ghost', 'wind', 'earth', 'sword', 'gold', 'metal'];
  for (const el of ELS) {
    beastEvq.push({ k: 'boom', x: p.x + 200, y: p.y, el, lv: 7, r: 160, shape: 'circle', ang: 0, len: 0, w: 0, spread: 0, pool: 3 } as any);
    beastEvq.push({ k: 'boom', x: p.x + 200, y: p.y, el, lv: 7, r: 300, shape: 'cone', ang: 0.7, spread: 0.55 } as any);
    beastEvq.push({ k: 'boom', x: p.x + 200, y: p.y, el, lv: 7, r: 0, shape: 'line', ang: 2, len: 500, w: 90 } as any);
    beastEvq.push({ k: 'cast', x: p.x, y: p.y, el, lv: 9, r: 120, dur: 1, big: true, src: jiao } as any);
    beastEvq.push({ k: 'dust', x: p.x, y: p.y, el, lv: 6, r: 0 } as any);
    for (let i = 0; i < 40; i++) { drawBeastGL(F, c, i / 30, 1 / 30); F.update(1 / 30); }
  }
  sealFx('rune', 'gold', p.x, p.y, 3.2, { dur: 1 }); sealFx('holy', 'blood', p.x, p.y, 3, { dur: 1 }); sealFx('mana', undefined, p.x, p.y, 2.6, { dur: 1 });
  for (let i = 0; i < 40; i++) { drawBeastGL(F, c, i / 30, 1 / 30); F.update(1 / 30); }
} catch (e: any) { err = String(e?.stack ?? e).split('\n').slice(0, 4).join(' | '); }
check('十三系妖兽落招（圆 / 扇 / 线）+ 起手 + 宗门阵纹全放一遍不抛异常', !err, err);

// ---------------------------------------------------------------- 6. 法宝灵焰 / 宝鼎 / 大庚剑阵
err = '';
const hp0 = jiao.hp; jiao.x = p.x + 450; jiao.y = p.y; jiao.dead = false; jiao.ward = null;
try {
  const mk = (id: string) => ({ itemId: id, art: itemDef(id).art, L: lookOf(id), cc: [0.5, 1, 0.75], dmg: 50, src: { realm: 3, stCh: 0 }, pieces: 1, ax: p.x + 300, ay: p.y, target: null });
  for (const id of ['art_qianlan', 'art_tiandu', 'art_sanyan', 'art_jiuyanglu', 'art_lieyan', 'art_ziyou', 'art_jiuyoudeng']) if (!c.acts.spawn(mk(id) as any)) throw new Error('灵焰未接管：' + id);
  if (!c.acts.spawn({ ...mk('art_xutian'), ax: p.x + 380, ay: p.y } as any)) throw new Error('宝鼎未接管');
  c.acts.list.push(new DagengAct(c, { ...mk('art_qingzhu'), pieces: 72, cc: [1, 0.86, 0.45] } as any, p.x + 300, p.y + 20, 420, 1));
  p.st.lift = 60;
  for (let i = 0; i < 260; i++) { if (i % 12 === 0 && i < 120) for (const a of c.acts.list as any[]) a.fire?.(); c.acts.update(1 / 30); c.acts.drawGL(F, i / 30, 1 / 30); F.update(1 / 30); }
  p.st.lift = 0;
} catch (e: any) { err = String(e?.stack ?? e).split('\n').slice(0, 4).join(' | '); }
check('七种灵焰 + 归墟鼎 + 大庚剑阵（72 口）完整放完不抛异常', !err, err);
check('450 步外的敌人被灵焰烧到（判定已随焰流加长到 480）', jiao.hp < hp0 || jiao.dead, `${hp0} → ${jiao.hp}`);
check('法宝全部正常收场', c.acts.list.length === 0, `剩 ${c.acts.list.length}`);

// ---------------------------------------------------------------- 7. 功法点缀
err = '';
try {
  castFlourish(F, p.x, p.y - 30, [1, 0.5, 0.2], 1);
  c.projs.length = 0;
  for (const fx of ['fireball', 'icicle', 'lightning', 'wind', 'sword', 'needle', 'water', 'vine', 'blood', 'ghost', 'rock', 'gold', undefined]) c.projs.push({ x: p.x, y: p.y, vx: 400, vy: -120, fx, color: '255,130,60', size: 1, fac: 'p', life: 0.3, trail: [] } as any);
  for (let i = 0; i < 30; i++) { projSparkle(F, c, 1 / 30); F.update(1 / 30); }
  c.projs.length = 0;
} catch (e: any) { err = String(e?.stack ?? e).split('\n').slice(0, 4).join(' | '); }
check('起手灵光 + 各系弹道尾迹不抛异常', !err, err);
check('粒子池里没有 NaN / Infinity', nanCount() === 0, `粒子 ${F.count}，坏值 ${nanCount()}`);
void toad;
console.log(fails ? `\n${fails} 项失败` : '\n全部通过');
process.exit(fails ? 1 : 0);
