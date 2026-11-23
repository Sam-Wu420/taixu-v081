// 第十八步「让游戏好玩起来」冒烟测试：机缘、洞府、灵宠、会动的奇遇、红颜书信与同游、心魔劫
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { createCanvas } = await import('./env');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { WORLD_W, WORLD_H, WORLD_SCALE, LOC_BY_ID } = await import('../src/data/world');
const C = await import('../src/world/cultivation');
const terrain = new Terrain(); terrain.build();
const g: any = new Game(terrain);
let errs = 0, oks = 0;
const ok = (c: any, s: string, extra = '') => { if (c) { oks++; console.log('ok  ', s, extra); } else { errs++; console.log('FAIL', s, extra); } };
const tick = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { g.modal = null; g.update(dt); } };
const guard = (name: string, f: () => void) => { try { f(); } catch (e: any) { errs++; console.log('ERR ', name, e?.stack?.split('\n').slice(0, 4).join(' | ')); } };
/** 依次点开对话：每层选第 pick 个可用选项，最多 depth 层 */
const walk = (node: any, depth = 4, pickF: (opts: any[]) => any = (o) => o[0]) => {
  const trail: string[] = [];
  for (let i = 0; i < depth && node; i++) {
    trail.push(`${node.title ?? node.speaker ?? '?'}[${(node.options ?? []).map((o: any) => o.label.slice(0, 10)).join('|')}]`);
    const opts = (node.options ?? []).filter((o: any) => !o.disabled && o.act);
    if (!opts.length) break;
    const o = pickF(opts); const r = o.act(); node = r ?? (g.modal?.kind === 'dialog' ? g.modal.node : null); g.modal = null;
  }
  return trail.join(' → ');
};
// 一个离屏画布，验证 collect 的绘制不抛错
const cv: any = createCanvas(400, 300); const ctx = cv.getContext('2d');
const drawAll = (list: any[]) => { for (const it of list) it.draw(ctx); return list.length; };
const view = () => ({ left: g.player.x - 1500, top: g.player.y - 1000, right: g.player.x + 1500, bottom: g.player.y + 1000 });

// ---------------------------------------------------------------- 1. 机缘密度
g.hero.realm = 2; g.hero.stage = 1;
// 机缘是按格子现算的（每处约两毫秒）：游戏里只查身边一小片，这里也只数梁国一带四分之一宽、四分之一高的一块
// （放大后的南荒数全图要十来分钟；原先还把已是世界单位的 WORLD_W 又乘了一遍 WORLD_SCALE）。这一块和放大前的整张南荒差不多大。
const all = g.sites.inRect(WORLD_W * 0.62, WORLD_H * 0.5, WORLD_W * 0.87, WORLD_H * 0.75);   // 梁国一带：从低阶到高阶的机缘都有
const byKind: Record<string, number> = {}; const byTier: Record<number, number> = {};
for (const s of all) { byKind[s.kind] = (byKind[s.kind] ?? 0) + 1; byTier[s.tier] = (byTier[s.tier] ?? 0) + 1; }
console.log('sites', all.length, JSON.stringify(byKind), JSON.stringify(byTier));
ok(all.length > 300, '南荒机缘数量充足', String(all.length));
ok(Object.keys(byKind).length >= 8, '机缘种类齐全', Object.keys(byKind).join(','));
// 青霞谷周边：P10 起青霞谷是一整座山（地界含过渡带两万见方），原来「宗门中心 8000 见方」整个落在山体里，机缘本就不放在宗门地界里；
// 改为数山脚一圈（地界外缘往外 4000 以内）的机缘
const hf = LOC_BY_ID.get('huangfeng')!; const hx = hf.x * WORLD_SCALE, hy = hf.y * WORLD_SCALE;
const { grandSectPlan, planReach } = await import('../src/data/sectPlan');
const HP = grandSectPlan(hf), HR = HP ? planReach(HP) : { cx: 0, cy: 0, rx: 0, ry: 0 };
const ring = (s: { x: number; y: number }) => { const dx = s.x - hx - HR.cx, dy = s.y - hy - HR.cy, e = Math.hypot(dx / (HR.rx + 4000), dy / (HR.ry + 4000)); return e <= 1 && (!HP || Math.hypot(dx / HR.rx, dy / HR.ry) > 1); };
const near = g.sites.inRect(hx + HR.cx - HR.rx - 4000, hy + HR.cy - HR.ry - 4000, hx + HR.cx + HR.rx + 4000, hy + HR.cy + HR.ry + 4000).filter(ring);
ok(near.length >= 6, '青霞谷周边（山脚一圈，地界外 4000 以内）有足够机缘', String(near.length));

// ---------------------------------------------------------------- 2. 每种机缘都能交互
const tried = new Set<string>();
for (const s of all) {
  if (tried.has(s.kind) || s.tier > 2) continue;
  tried.add(s.kind);
  guard('site ' + s.kind, () => {
    g.teleport(s.x + 60, s.y + 40); tick(3);
    // 守卫先清掉
    for (const e of g.combat.enemies) if (!e.dead) { e.dead = true; e.hp = 0; }
    g.sites.scanT = 0; g.sites.update(0.03);
    const f = g.sites.focus;
    ok(f && f.key === s.key, `机缘可聚焦：${s.kind}`, g.sites.name(s));
    let captured: any = null; const od = g.openDialog.bind(g); g.openDialog = (n: any) => { captured = n; };
    g.sites.interact(); g.openDialog = od;
    if (captured) console.log('     ', walk(captured, 4));
    ok(!!captured || s.kind === 'vein', `机缘对话：${s.kind}`);
  });
}
ok(tried.size >= 8, '交互覆盖种类', [...tried].join(','));
// 绘制
guard('sites.collect', () => { const near0 = all.find((s: any) => s.kind === 'ruin')!; g.teleport(near0.x + 100, near0.y); tick(2); const l: any[] = []; g.sites.collect(l, view(), 1, 0.03); ok(drawAll(l) > 0, 'sites.collect 有绘制', String(l.length)); });

// ---------------------------------------------------------------- 3. 洞府
guard('home', () => {
  const v = all.find((s: any) => s.kind === 'vein' && s.tier <= 1)!;
  g.home.create(v);
  ok(!!g.ws.home, '开辟洞府', g.ws.home?.name);
  g.teleport(g.ws.home.x + 80, g.ws.home.y); tick(3);
  const pb = g.placeBonus(); ok(pb.mult > 1.2, '洞府灵气加成', `${pb.name} ×${pb.mult.toFixed(2)}`);
  console.log('     ', walk(g.home.mainNode(), 3));
  console.log('     ', walk(g.home.gardenNode(), 3));
  const l: any[] = []; g.home.collect(l, view(), 1); ok(drawAll(l) > 0, 'home.collect 有绘制', String(l.length));
  ok(g.mapMarks().some((m: any) => m.glyph === '府'), '地图标出洞府');
  // 回府符
  for (const e of g.combat.enemies) { e.dead = true; e.hp = 0; }
  g.teleport(hx, hy); tick(40); C.addItem(g.hero, 'tal_huifu', 1); g.home.recall(); tick(2);
  ok(Math.hypot(g.player.x - g.ws.home.x, g.player.y - g.ws.home.y) < 600 || C.bagCount(g.hero, 'tal_huifu') === 0, '回府符', `${Math.round(Math.hypot(g.player.x - g.ws.home.x, g.player.y - g.ws.home.y))}`);
});

// ---------------------------------------------------------------- 4. 灵宠
guard('pets', () => {
  g.teleport(hx + 300, hy + 300);
  C.addItem(g.hero, 'egg_wolf', 1); g.pets.onEgg('egg_wolf');
  ok(!!g.ws.incubate, '灵卵开始温养');
  g.day += 400; tick(60);
  ok((g.ws.pets?.length ?? 0) >= 1, '灵卵破壳', g.ws.pets?.[0]?.name);
  ok(!!g.pets.ent, '灵宠跟随实体');
  console.log('     ', walk(g.pets.petNode(0), 2));
  const l: any[] = []; g.pets.collect(l); ok(drawAll(l) > 0, 'pets.collect 有绘制');
});

// ---------------------------------------------------------------- 5. 会动的奇遇
guard('happen', () => {
  const kinds: Record<string, number> = {};
  g.teleport(hx + 2500, hy + 1500);
  for (let i = 0; i < 4000; i++) {
    g.modal = null; g.update(0.1);
    for (const h of g.happen.haps) kinds[h.kind] = (kinds[h.kind] ?? 0) + 1;
    if (i % 400 === 0) { g.happen.haps.forEach((h: any) => { h.done = true; }); for (const e of g.combat.enemies) { e.dead = true; e.hp = 0; } g.teleport(g.player.x + 1800, g.player.y + (i % 800 ? 900 : -900)); g.hero.hp = 1; g.hero.dead = false; }
  }
  const seen = Object.keys(kinds);
  ok(seen.length >= 3, '奇遇种类会自行出现', seen.join(','));
  const l: any[] = []; g.happen.collect(l, view(), 1, 0.03); drawAll(l);
  const bn = g.happen.boardNode('tainan', '南屏小会');
  console.log('     ', walk(bn, 2, (o) => o.find((x: any) => !String(x.label).startsWith('【通缉】')) ?? o[0]));   // 恩怨的通缉（报官贴出来的）也排在榜上：这里要揭的是悬赏
  ok((g.ws.bounties ?? []).length >= 1, '揭下悬赏', g.ws.bounties?.[0]?.name);
});

// ---------------------------------------------------------------- 6. 红颜已按决策移除（BEAUTIES 为空，不再有书信/同游/信物）
ok((await import('../src/data/beauties')).BEAUTIES.length === 0, '知交系统已移除');

// ---------------------------------------------------------------- 7. 心魔劫
guard('xinmo', () => {
  const h = g.hero; h.realm = 2; h.stage = 2; h.exp = C.need(h) + 10; h.kills = 80;
  h.mijingDone = 6; h.stats.alchemy = 6;   // 大境界门槛：寻幽探秘 6、道法兼修 6
  ok(g.xinmo.needed(), '筑基圆满需渡心魔劫');
  const r0 = g.breakthrough(0); ok(r0.ok === false && g.modal?.kind === 'dialog', '心魔劫开启', g.modal?.node?.title);
  let node = g.modal?.node; const trail: string[] = [];
  for (let i = 0; i < 12 && node; i++) {
    trail.push(node.title);
    const o = node.options.find((x: any) => !x.disabled); g.modal = null;
    const r = o.act(); node = r ?? (g.modal?.kind === 'dialog' ? g.modal.node : null);
  }
  console.log('     ', trail.join(' → '));
  ok(h.realm === 3 || h.stats.failed > 0, '冲关已结算', `realm ${h.realm} failed ${h.stats.failed}`);
});

// ---------------------------------------------------------------- 8. 长跑：主循环带全部新系统
guard('soak', () => {
  g.modal = null; g.teleport(hx + 1200, hy - 800);
  for (let i = 0; i < 1500; i++) { g.modal = null; g.update(1 / 20); if (g.hero.dead) { g.hero.dead = false; g.hero.hp = 1; } }
  ok(true, '主循环 75 秒无异常');
});

console.log(`\n${oks} ok, errs ${errs}`);
process.exit(errs ? 1 : 0);
