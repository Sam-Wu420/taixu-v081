// 打击感（world/gore.ts、gl/goregl.ts）：暴击率吃天赋（会心）；受击溅血、血迹隔一会儿落地、二十多息后淡掉；
// 普通击杀被打飞、落地溅血再散；暴击击杀 / 超杀炸成碎块；首领分两段；最后一击放慢；虫类绿、鬼物不留血迹；
// 你和同伴挨打也溅血；血腥程度「关」时什么都没有。
import './env';
import assert from 'node:assert/strict';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const store: Record<string, string> = {};
(globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } };
(globalThis as any).sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./fixed-clock');
let s0 = 5; Math.random = () => { s0 = (Math.imul(s0, 1664525) + 1013904223) >>> 0; return s0 / 4294967296; };

const G = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const { ENEMIES } = await import('../src/data/enemies');
const { GORE } = await import('../src/world/gore');
const g = await G.createGame(() => {}); g.reset();
const c = g.combat as any, p = g.player, h = g.hero;
h.realm = 3; h.stage = 0;
const tick = (sec: number) => { for (let t = 0; t < sec; t += 0.05) { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 9; g.update(0.05); c.fxq.length = 0; } };
const spawn = (id: string, dx: number, realm = 1) => { const e = new Enemy(ENEMIES[id], p.x + dx, p.y, realm, 0); e.aggro = true; c.enemies.push(e); return e; };
const src = { realm: 3, stCh: 0 };

// 1. 暴击率吃天赋：底子一成，加「会心」后两成多
{
  const e = spawn('wolf', 200); e.maxHp = e.hp = 1e9;
  const rate = () => { let n = 0; for (let i = 0; i < 2000; i++) { c.fxq.length = 0; c.hitEnemy(e, 10, src, p.x, p.y); if (c.fxq.some((f: any) => f.k === 'hit' && f.crit)) n++; } return n / 2000; };
  const r0 = rate(); h.talents.push('t_huixin'); const r1 = rate(); h.talents.pop();
  assert.ok(r0 > 0.07 && r0 < 0.13, `底子一成：${r0}`); assert.ok(r1 > 0.18 && r1 < 0.27, `会心之后两成多：${r1}`);
  c.enemies.length = 0;
}

// 2. 受击：溅血事件、血迹隔一会儿出现、二十多息后淡掉
{
  c.gore.reset();
  const e = spawn('wolf', 200); e.maxHp = e.hp = 1e9;
  c.fxq.length = 0; c.hitEnemy(e, e.maxHp * 0.0000001 + 50, src, p.x, p.y);
  assert.ok(c.fxq.some((f: any) => f.k === 'blood' && f.kind === 'blood'), '打中妖兽：溅血');
  assert.equal(c.gore.stains.length, 0, '血点还在空中');
  tick(0.8); assert.ok(c.gore.stains.length > 0, `落地成血迹：${c.gore.stains.length}`);
  tick(GORE.stainLife + 1); assert.equal(c.gore.stains.length, 0, '二十多息后淡掉');
  c.enemies.length = 0;
}

// 3. 普通击杀：被打飞（离地）、落地溅血再散
{
  c.gore.reset();
  // 先量一下这一击实际打多少（境界差、防御都会改），再让它剩下刚好够这一击打死、不算超杀；碰上暴击（一成）就换一只再来
  let e: any = null;
  for (let t = 0; t < 8 && !(e?.dead && !e.gibbed); t++) {
    c.enemies.length = 0; c.gore.reset();
    const probe = spawn('wolf', 150); probe.maxHp = probe.hp = 1e9; c.texts.length = 0;
    c.hitEnemy(probe, 40, src, p.x, p.y); const d = Number(c.texts.find((x: any) => /^\d+$/.test(x.s))?.s ?? 40);
    c.enemies.length = 0; e = spawn('wolf', 150); e.maxHp = d * 10; e.hp = d * 0.8;
    c.hitEnemy(e, 40, src, p.x, p.y);
  }
  let maxLift = 0;
  assert.ok(e.dead && !(e as any).gibbed, '死了，没炸');
  for (let i = 0; i < 40 && c.enemies.includes(e); i++) { g.paused = false; c.spawnT = 9; g.update(0.025); maxLift = Math.max(maxLift, e.lift); }
  assert.ok(maxLift > 20, `被打飞离地：${maxLift}`);
  tick(0.8);
  assert.ok(c.gore.stains.length > 0, '落地溅了一地血');
  assert.ok(!c.enemies.includes(e), '落地后散掉');
}

// 4. 超杀：炸成碎块；暴击击杀同样
{
  c.gore.reset(); c.fxq.length = 0;
  const e = spawn('wolf', 150); e.hp = 20; e.maxHp = 1000;
  c.hitEnemy(e, 900, src, p.x, p.y);
  assert.ok(e.dead && (e as any).gibbed, '超杀：炸开');
  assert.ok(c.fxq.some((f: any) => f.k === 'gore'), '炸开的特效');
  assert.ok(c.gore.gibCount >= 4, `碎块：${c.gore.gibCount}`);
  const list: any[] = []; c.gore.collect(list); assert.ok(list.length === c.gore.gibCount && list.every((d) => d.hb && d.hx), '碎块立成立板');
  tick(2.5); assert.equal(c.gore.gibCount, 0, '碎块过一会儿消失');
}

// 5. 最后一击放慢；首领分两段炸
{
  c.gore.reset(); c.enemies.length = 0; g.slowT = 0;
  const b = spawn('dujiao', 200, 3); b.hp = 1; b.maxHp = 1e6;
  c.hitEnemy(b, 20, src, p.x, p.y); assert.ok(b.dead, '首领倒下');
  assert.ok(g.slowT > 0.3, `首领、最后一击：放慢 ${g.slowT}`);
  assert.ok(!(b as any).gibbed, '首领先迸裂，不立刻炸');
  for (let i = 0; i < 120 && !(b as any).gibbed; i++) { if (g.modal) g.closeModal(true); g.paused = false; c.spawnT = 9; g.update(0.025); }   // 放慢的时候游戏时间走得慢
  assert.ok((b as any).gibbed, '半息后整个炸开');
  tick(3);
}

// 6. 虫类绿、鬼物不留血迹
{
  c.gore.reset(); c.fxq.length = 0;
  const bug = spawn('spider', 150); bug.maxHp = bug.hp = 1e9; c.hitEnemy(bug, 50, src, p.x, p.y);
  assert.ok(c.fxq.some((f: any) => f.k === 'blood' && f.kind === 'ichor'), '虫类：体液');
  tick(1); assert.ok(c.gore.stains.every((s: any) => s.fluid === 'ichor'), '血迹是绿的');
  c.enemies.length = 0; c.gore.reset(); c.fxq.length = 0;
  const gh = Object.values(ENEMIES).find((d: any) => d.kind === 'ghost' && !d.lair) as any;
  const ge = spawn(gh.id, 150); ge.maxHp = ge.hp = 1e9; c.hitEnemy(ge, 50, src, p.x, p.y);
  assert.ok(c.fxq.some((f: any) => f.k === 'blood' && f.kind === 'ghost'), '鬼物：黑烟磷火');
  tick(1); assert.equal(c.gore.stains.length, 0, '鬼物不留血迹');
  c.enemies.length = 0;
}

// 7. 你和同伴挨打也溅血
{
  c.gore.reset(); c.fxq.length = 0; c.invulnT = 0; h.hp = 1;
  const w = spawn('wolf', 60, 3);
  c.hitPlayer(200, 3, undefined, w.x, w.y, w, true);   // 最后一项 true：绕过灵力护盾，专门看皮肉伤溅血
  assert.ok(c.fxq.some((f: any) => f.k === 'blood' && Math.abs(f.x - p.x) < 5), '你挨打：溅血');
  const d = g.npcs.list.find((n) => n.alive && n.realm >= 1 && !n.canon && !n.beauty && !n.ros && !n.gz)!;
  d.met = true; d.favor = 60; d.bond = 'companion'; d.bondUntil = g.day + 30; g.npcs.summon(d.id); tick(0.3);
  const a = g.npcs.followers()[0]; c.fxq.length = 0;
  c.gore.onAllyHit(a, 0.2, 0);
  assert.ok(c.fxq.some((f: any) => f.k === 'blood' && Math.abs(f.x - a.st.x) < 5), '同伴挨打：溅血');
  c.enemies.length = 0; h.hp = 1;
}

// 8. 血腥程度「关」：没有血、没有碎块（最后一击照样放慢）
{
  store['taixu.gore'] = '0'; c.gore.reset(); c.fxq.length = 0;
  const e = spawn('wolf', 150); e.hp = 20; e.maxHp = 1000;
  c.hitEnemy(e, 900, src, p.x, p.y);
  assert.ok(!c.fxq.some((f: any) => f.k === 'blood' || f.k === 'gore'), '关：没有血');
  assert.equal(c.gore.gibCount, 0, '关：不炸');
  tick(1); assert.equal(c.gore.stains.length, 0, '关：没有血迹');
  delete store['taixu.gore'];
}
console.log('PASS 打击感：暴击率吃会心、溅血与落地血迹（二十多息淡掉）、普通击杀打飞落地散、超杀与暴击击杀炸成碎块、首领两段炸、最后一击放慢、虫类绿鬼物不留血、你和同伴挨打也溅血、血腥程度可关');
