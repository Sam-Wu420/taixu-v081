// 第十六步：三图测试 —— 确定性生成 / 可达性 / 传送阵往返 / 边境往返 / 存档 v3 与旧档迁移 / 大事件与妖王所在图
// 用法：npx tsx tools/test-maps.ts        （总控：依次以不同 FANREN_MAP 启动子进程，共享一个文件版 localStorage）
import { execFileSync } from 'child_process';
import fs from 'fs';

const PHASE = process.env.TM_PHASE;
if (!PHASE) {
  const store = '/tmp/fanren-test-maps.json';
  fs.writeFileSync(store, '{}');
  const run: [string, string][] = [
    ['gen', 'renjie'], ['gen', 'lingjie'], ['gen', 'xianjie'],
    ['portal_local', 'renjie'],
    ['ascend_renjie', 'renjie'], ['ascend_lingjie', 'lingjie'],
    ['legacy_tn', 'renjie'], ['legacy_lx', 'renjie'], ['legacy_dj', 'renjie'],
  ];
  let bad = 0;
  for (const [ph, map] of run) {
    console.log(`\n── ${ph} @ ${map}`);
    try {
      const out = execFileSync('npx', ['tsx', 'tools/test-maps.ts'], { env: { ...process.env, TM_PHASE: ph, FANREN_MAP: map, TM_STORE: store }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
      process.stdout.write(out.split('\n').filter((l) => /^(ok|FAIL|  )/.test(l)).join('\n') + '\n');
    } catch (e: any) { bad++; process.stdout.write(String(e.stdout ?? '').split('\n').filter((l: string) => /^(ok|FAIL|  )/.test(l)).join('\n') + '\n' + String(e.stderr ?? '').slice(-600) + '\n'); }
  }
  console.log(bad ? `\n${bad} 个阶段失败` : '\n全部通过');
  process.exit(bad ? 1 : 0);
}

// ------------------------------------------------------------ 子进程
const STORE = process.env.TM_STORE!;
const mem: Record<string, string> = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const flush = () => fs.writeFileSync(STORE, JSON.stringify(mem));
const ls = { getItem: (k: string) => (k in mem ? mem[k] : null), setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = ls; (globalThis as any).sessionStorage = ls;
(globalThis as any).location = { search: '', href: 'http://localhost/', reload() {}, replace() {} };
await import('./env');
const W = await import('../src/data/world') as any;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const C = await import('../src/world/cultivation') as any;
const EN = await import('../src/data/enemies') as any;
const { unzipSave } = await import('../src/world/savezip') as any;

const { ACTIVE_MAP, WORLD_SCALE: S, LOC_BY_ID, LOCATIONS } = W;
const { createGame } = await import('../src/world/game');
let fails = 0;
const check = (n: string, ok: boolean, x = '') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); if (!ok) fails++; };
const done = () => { flush(); process.exit(fails ? 1 : 0); };
const t0 = Date.now();
const terrain = new Terrain(); terrain.build();
const tBuild = Date.now() - t0;
const g: any = new Game(terrain);
const lingshi = () => C.bagCount(g.hero, 'mat_lingshi');
const auto = () => (mem.fanren_save_auto ? JSON.parse(unzipSave(mem.fanren_save_auto)) : null);
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const pick = (label: string) => { const o = g.modal?.node?.options?.find((o: any) => o.label.includes(label)); if (!o) return false; if (o.disabled) return 'disabled'; const nx = o.act(); if (nx) g.openDialog(nx); else g.closeModal(true); return true; };

if (PHASE === 'gen') {
  // 1. 确定性：同一张图建两次，全图宏观采样逐格相同
  const t2 = new Terrain(); t2.build();
  let diff = 0;
  for (let my = 8; my < terrain.H; my += 17) {
    for (let mx = 8; mx < terrain.W; mx += 17) {
      const a = terrain.sample((mx + 0.5) * S, (my + 0.5) * S);
      const b = t2.sample((mx + 0.5) * S, (my + 0.5) * S);
      if (Math.abs(a.land - b.land) > 1e-6 || Math.abs(a.elev - b.elev) > 1e-6 || Math.abs(a.depth - b.depth) > 1e-6) diff++;
    }
  }
  check(`${W.MAP_NAME[ACTIVE_MAP]}：两次生成完全一致`, diff === 0, `${terrain.W}×${terrain.H} 生成 ${tBuild} ms`);
  const sz = W.mapSize(ACTIVE_MAP);
  check('图幅符合规格', terrain.W === sz.W && terrain.H === sz.H, `${sz.W}×${sz.H}`);
  // 2. 地点全在陆地、全在本图
  const wet = LOCATIONS.filter((l: any) => !terrain.isLand(l.x * S, l.y * S));
  check('所有地点都在陆地上', wet.length === 0, `${LOCATIONS.length} 处` + (wet.length ? ' 落水：' + wet.slice(0, 5).map((l: any) => l.name).join('、') : ''));
  check('地点都属于本图', LOCATIONS.every((l: any) => l.map === ACTIVE_MAP));
  // 3. 可达性：人界整图主大陆（含天南、天穹草原、中州）步行（宏观格 BFS）全连通，沧溟海以海岛为主
  if (ACTIVE_MAP === 'renjie') {
    const { W: MW, H: MH } = terrain; const seen = new Uint8Array(MW * MH);
    const ok = (x: number, y: number) => terrain.walkFactor((x + 0.5) * S, (y + 0.5) * S) > 0;
    const start = LOC_BY_ID.get('huangfeng')!;
    const q: number[] = []; const sx = Math.round(start.x), sy = Math.round(start.y);
    seen[sy * MW + sx] = 1; q.push(sy * MW + sx);
    while (q.length) { const i = q.pop()!; const x = i % MW, y = (i / MW) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const j = ny * MW + nx; if (seen[j] || !ok(nx, ny)) continue; seen[j] = 1; q.push(j); } }
    const reach = (l: any) => { for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.round(l.x) + dx, y = Math.round(l.y) + dy; if (x >= 0 && y >= 0 && x < MW && y < MH && seen[y * MW + x]) return true; } return false; };
    const main = LOCATIONS.filter((l: any) => !l.island && l.ox < 700 && ['city', 'sect', 'town', 'market'].includes(l.type));
    const miss = main.filter((l: any) => !reach(l));
    check('人界主大陆步行连通天南与大晋城镇宗门', miss.length === 0, `${main.length - miss.length}/${main.length}` + (miss.length ? ' 不可达：' + miss.slice(0, 6).map((l: any) => l.name).join('、') : ''));
    const isles = LOCATIONS.filter((l: any) => l.island).length;
    check('沧溟海群岛含海岛地点', isles >= 10, `${isles} 处在岛上`);
  }
  // 4. 妖王与大事件归属
  const lairs = EN.LAIRS.filter((l: any) => W.legacyHere(l.x, l.y)).map((l: any) => l.id).sort().join(',');
  if (ACTIVE_MAP === 'renjie') {
    check('人界整合全部妖王巢穴（天南/乱星海/大晋）', lairs.includes('lair_fengxi') && lairs.includes('lair_dujiao') && lairs.includes('lair_shuanggong'), lairs || '（无）');
    const { CANON_EVENTS } = await import('../src/world/events') as any;
    const xt = CANON_EVENTS.find((e: any) => e.id === 'xutian');
    const here = W.locHere(xt.loc);
    check('归墟殿在人界整图可直达', !!here);
    g.reset(); g.hero.realm = 3; g.hero.stage = 1; g.ws.flags.storyDone = 1;
    const s0 = (xt.year - 1) * 360 + (xt.month - 1) * 30;
    g.hero.realm = 2; g.day = s0 - 400; g.update(0.03); g.hero.realm = 3; g.day = s0 + 2; g.update(0.03);
    const st = g.ws.events.xutian ?? g.ws.events['xutian#0'];
    check('第二十年归墟殿开启（全图皆有传闻）', st?.state === 'active', st?.state);
    if (here) { g.teleport(here.x * S, here.y * S + 300); g.modal = null; for (let i = 0; i < 12 && g.modal?.node?.speaker !== xt.name; i++) g.update(1 / 30); check('赶到归墟殿 → 触发事件', g.modal?.node?.speaker === xt.name, g.modal?.node?.speaker ?? 'none'); }
  }
  // 5. 活跃 NPC 均属于当前地图
  const home = (ACTIVE_MAP === 'renjie' ? LOC_BY_ID.get('huangfeng') : null) ?? LOCATIONS.find((l: any) => l.type === 'city' || l.type === 'sect') ?? LOCATIONS[0];
  g.reset(); g.ws.flags.storyDone = 1; g.modal = null; g.teleport(home.x * S, home.y * S + 400);
  for (let i = 0; i < 30; i++) { g.modal = null; g.update(1 / 30); }
  const act = [...g.npcs.active.keys()].map((id: string) => g.npcs.byId.get(id)).filter(Boolean);
  check('活跃 NPC 全是本图居民', act.length > 0 && act.every((d: any) => (d.map ?? 'renjie') === ACTIVE_MAP), `活跃 ${act.length} / 总 ${g.npcs.list.length}`);
  done();
}

if (PHASE === 'portal_local') {
  for (const k of Object.keys(mem)) delete mem[k];
  g.reset(); g.ws.flags.storyDone = 1; g.modal = null;
  const cs = LOC_BY_ID.get('chuansong'), lx = LOC_BY_ID.get('chuansong_lx');
  g.teleport(cs.x * S + 200, cs.y * S);
  g.hero.realm = 1; g.hero.stage = 9;
  check('传送阵附近可交互', g.travel.tryPortal());
  check('炼气期无法催动', /需筑基期/.test(g.modal?.node?.text ?? '')); g.closeModal(true);
  g.hero.realm = 2; g.hero.stage = 2;
  g.travel.tryPortal();
  check('枯骨手中取得大挪移令', pick('取下令牌') === true && C.bagCount(g.hero, 'tok_danuoyi') === 1);
  C.removeItem(g.hero, 'mat_lingshi', lingshi());
  check('灵石不足时无法开启', pick('传送至【') === 'disabled');
  C.addItem(g.hero, 'mat_lingshi', 1000);
  g.closeModal(true); g.travel.tryPortal();
  const day0 = g.day;
  check('开启古阵直抵沧溟海（600 灵石）', pick('传送至【') === true && lingshi() === 400, `余 ${lingshi()}`);
  check('域内传送直接落到摇光岛传送阵旁且不耗时日', Math.hypot(g.player.x - lx.x * S, g.player.y - lx.y * S) < 40 * S && g.day === day0 && terrain.isLand(g.player.x, g.player.y));
  g.teleport(lx.x * S + 200, lx.y * S); g.modal = null;
  C.addItem(g.hero, 'mat_lingshi', 500);
  g.travel.tryPortal();
  check('回程：再开传送阵回梁国', pick('传送至【') === true && lingshi() === 300);
  check('回到梁国灵石矿洞传送阵旁', Math.hypot(g.player.x - cs.x * S, g.player.y - cs.y * S) < 40 * S && terrain.isLand(g.player.x, g.player.y));
  done();
}

if (PHASE.startsWith('legacy_')) {
  const oldMap = PHASE === 'legacy_tn' ? 'tiannan' : PHASE === 'legacy_lx' ? 'luanxing' : 'dajin';
  const anchorId = PHASE === 'legacy_tn' ? 'huangfeng' : PHASE === 'legacy_lx' ? 'tianxing' : 'jinjing';
  const loc = LOC_BY_ID.get(anchorId)!;
  const ls = W.LEGACY_SPEC[oldMap];
  const oldMx = (loc.ox - ls.ox) * ls.sx;
  const oldMy = (loc.oy - ls.oy) * ls.sy;
  g.reset(); g.save(0);
  const d = auto();
  d.v = 2; d.map = oldMap; delete d.fogs; delete d.arrive;
  d.p = { x: oldMx * S, y: oldMy * S, flying: true };
  d.npcs = d.npcs.map((n: any) => ({ ...n, map: oldMap, x: oldMx * S, y: oldMy * S, tx: oldMx * S, ty: oldMy * S }));
  mem.fanren_save_auto = JSON.stringify(d); mem['fanren.map'] = oldMap;
  check(`旧版 ${oldMap} 存档读入成功并原地迁移到 renjie`, g.load('fanren_save_auto') === true);
  const dd = Math.hypot(g.player.x - loc.x * S, g.player.y - loc.y * S) / S;
  check(`坐标精确还原到 ${loc.name} 附近`, dd < 5 && terrain.isLand(g.player.x, g.player.y), `距 ${dd.toFixed(2)} 格`);
  check('旧档 NPC 全部迁移至 renjie', g.npcs.list.every((n: any) => n.map === 'renjie'));
  g.save(0);
  check('再存档已落为 renjie v3', auto()?.v === 3 && auto()?.map === 'renjie');
  done();
}

if (PHASE === 'ascend_renjie') {
  for (const k of Object.keys(mem)) delete mem[k];
  g.reset(); g.ws.flags.storyDone = 1; g.modal = null;
  g.hero.realm = 5; g.hero.stage = 2;
  let traveled: string | null = null;
  g.onTravel = (to: string) => { traveled = to; };
  const ok = g.ascendSpirit('orthodox');
  check('人界化神后期圆满飞升灵界触发切图', ok && traveled === 'lingjie' && auto()?.map === 'lingjie', `map=${auto()?.map}`);
  done();
}

if (PHASE === 'ascend_lingjie') {
  const progs: number[] = [];
  const tCreate0 = Date.now();
  const glj: any = await createGame((p: number) => progs.push(p));
  const tCreate = Date.now() - tCreate0;
  check('灵界异步 createGame 进度分段推进且未超时卡死', progs.length >= 10 && progs[progs.length - 1] === 1 && tCreate < 25000, `steps=${progs.length}, ${tCreate}ms`);
  check('灵界 createGame 后 LRU 缓存回落至常规上限', (glj.terrain as any).macroCache.size <= 64, `size=${(glj.terrain as any).macroCache.size}`);
  check('灵界读入飞升存档成功', glj.load('fanren_save_auto') === true && glj.ws.world === 'spirit');
  check('灵界落点位于接引古台陆地', glj.terrain.isLand(glj.player.x, glj.player.y) && glj.ui.place.includes('接引古台'), glj.ui.place);
  glj.update(0.05);
  check('灵界运行帧更新正常', Number.isFinite(glj.player.x) && Number.isFinite(glj.player.y));
  done();
}
