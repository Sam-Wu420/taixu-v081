// 第十六步：三图测试 —— 确定性生成 / 可达性 / 传送阵往返 / 边境往返 / 存档 v3 与旧档迁移 / 大事件与妖王所在图
// 用法：npx tsx tools/test-maps.ts        （总控：依次以不同 TAIXU_MAP 启动子进程，共享一个文件版 localStorage）
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PHASE = process.env.TM_PHASE;
if (!PHASE) {
  // 共享存档放系统临时目录（原来写死 /tmp，Windows 上落到 D:\tmp，目录不存在就直接失败）
  const store = path.join(os.tmpdir(), 'taixu-test-maps.json');
  fs.mkdirSync(path.dirname(store), { recursive: true });
  fs.writeFileSync(store, '{}');
  const run: [string, string][] = [
    ['gen', 'tiannan'], ['gen', 'luanxing'], ['gen', 'dajin'],
    ['portal_out', 'tiannan'], ['portal_in', 'luanxing'], ['portal_back', 'tiannan'],
    ['edge_out', 'tiannan'], ['edge_in', 'dajin'], ['edge_back', 'tiannan'],
    ['legacy_a', 'tiannan'], ['legacy_b', 'luanxing'], ['v057', 'tiannan'],
  ];
  let bad = 0;
  for (const [ph, map] of run) {
    console.log(`\n── ${ph} @ ${map}`);
    try {
      // 用当前的 node 和同样的加载参数（tsx）重跑本脚本：Windows 上不经 shell 调不到 npx（npx.cmd）
      const out = execFileSync(process.execPath, [...process.execArgv, process.argv[1]], { env: { ...process.env, TM_PHASE: ph, TAIXU_MAP: map, TM_STORE: store }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
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
(globalThis as any).__TAIXU_NORELOAD = true;
await import('./env');
const W = await import('../src/data/world') as any;
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const C = await import('../src/world/cultivation') as any;
const EN = await import('../src/data/enemies') as any;

const { ACTIVE_MAP, WORLD_SCALE: S, LOC_BY_ID, LOCATIONS } = W;
let fails = 0;
const check = (n: string, ok: boolean, x = '') => { console.log((ok ? 'ok  ' : 'FAIL') + ' ' + n + (x ? '  ' + x : '')); if (!ok) fails++; };
const done = () => { flush(); process.exit(fails ? 1 : 0); };
const t0 = Date.now();
const terrain = new Terrain(); terrain.build();
const tBuild = Date.now() - t0;
const g: any = new Game(terrain);
const lingshi = () => C.bagCount(g.hero, 'mat_lingshi');
const auto = () => JSON.parse(mem.taixu_save_auto ?? 'null');
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
const pick = (label: string) => { const o = g.modal?.node?.options?.find((o: any) => o.label.includes(label)); if (!o) return false; if (o.disabled) return 'disabled'; const nx = o.act(); if (nx) g.openDialog(nx); else g.closeModal(true); return true; };

if (PHASE === 'gen') {
  // 1. 确定性：同一张图建两次，陆地栅格逐格相同
  const t2 = new Terrain(); t2.build();
  let diff = 0; for (let i = 0; i < terrain.land.length; i++) if (Math.abs(terrain.land[i] - t2.land[i]) > 1e-6) diff++;
  check(`${W.MAP_NAME[ACTIVE_MAP]}：两次生成完全一致`, diff === 0, `${terrain.W}×${terrain.H} 生成 ${tBuild} ms`);
  const sz = W.mapSize(ACTIVE_MAP);
  check('图幅符合规格', terrain.W === sz.W && terrain.H === sz.H, `${sz.W}×${sz.H}`);
  // 2. 地点全在陆地、全在本图
  const wet = LOCATIONS.filter((l: any) => !terrain.isLand(l.x * S, l.y * S));
  check('所有地点都在陆地上', wet.length === 0, `${LOCATIONS.length} 处` + (wet.length ? ' 落水：' + wet.slice(0, 5).map((l: any) => l.name).join('、') : ''));
  check('地点都属于本图', LOCATIONS.every((l: any) => l.map === ACTIVE_MAP));
  // 第六轮返工：有名地点所在的地块，小地图上的地区名不落到「荒野」（归墟殿岛原来写荒野）；海岛写岛名或所属海域
  {
    const wild = LOCATIONS.filter((l: any) => !W.regionNameAt(l.x, l.y, terrain.isLand(l.x * S, l.y * S)));
    check('有名地点的地区名都不是荒野', wild.length === 0, wild.length ? '落到荒野：' + wild.slice(0, 8).map((l: any) => l.name).join('、') : `${LOCATIONS.length} 处`);
    if (ACTIVE_MAP === 'luanxing') { const xt = LOCATIONS.find((l: any) => l.id === 'xutian'); const r = xt && W.regionNameAt(xt.x, xt.y, true); check('归墟殿岛上写岛名、所属海域', !!r && r.name === '归墟殿' && r.parent !== '荒野', JSON.stringify(r)); }
  }
  // 3. 可达性：从主城出发，步行（宏观格 BFS）能到多少地点；沧溟海靠飞行
  if (ACTIVE_MAP !== 'luanxing') {
    // 搜路的范围：图内，加上本图这一侧的交界地带（南荒北缘外、中州南缘外的天穹草原，到中线为止，沿边只取两图都有的那一段——
    // 和 Game.bounds 放开的范围一样）。草原上的驿站、部落营地（genFrontier 的「图外」那一批）就在那里，以前只在图内搜，全算不可达
    const { W: MW, H: MH } = terrain, D = W.SEAM_DEPTH / 2, Dc = Math.ceil(D / S);
    const land = W.seamsOf(ACTIVE_MAP).filter((s: any) => !s.sea);
    const ext = { n: land.some((s: any) => s.side === 'n') ? Dc : 0, s: land.some((s: any) => s.side === 's') ? Dc : 0 };
    const GW = MW, GH = MH + ext.n + ext.s, seen = new Uint8Array(GW * GH);
    const inside = (x: number, y: number) => {   // 地图格坐标（可为负）
      if (x < 0 || x >= MW) return false;
      if (y >= 0 && y < MH) return true;
      const wx = (x + 0.5) * S, wy = (y + 0.5) * S;
      return land.some((s: any) => { const o = W.seamOut(ACTIVE_MAP, s, wx, wy), [a0, a1] = W.seamSpan(ACTIVE_MAP, s); return o > 0 && o < D && wx > a0 + 200 && wx < a1 - 200; });
    };
    const ok = (x: number, y: number) => inside(x, y) && terrain.walkFactor((x + 0.5) * S, (y + 0.5) * S) > 0;
    const idx = (x: number, y: number) => (y + ext.n) * GW + x;
    const start = LOC_BY_ID.get(ACTIVE_MAP === 'tiannan' ? 'huangfeng' : 'jinjing');
    const q: number[] = []; const sx = Math.round(start.x), sy = Math.round(start.y);
    seen[idx(sx, sy)] = 1; q.push(idx(sx, sy));
    while (q.length) { const i = q.pop()!; const x = i % GW, y = ((i / GW) | 0) - ext.n; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= GW || ny < -ext.n || ny >= MH + ext.s) continue; const j = idx(nx, ny); if (seen[j] || !ok(nx, ny)) continue; seen[j] = 1; q.push(j); } }
    const reach = (l: any) => { for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.round(l.x) + dx, y = Math.round(l.y) + dy; if (x >= 0 && x < GW && y >= -ext.n && y < MH + ext.s && seen[idx(x, y)]) return true; } return false; };
    const main = LOCATIONS.filter((l: any) => !l.island && ['city', 'sect', 'town', 'market'].includes(l.type));
    const miss = main.filter((l: any) => !reach(l));
    check('步行可达所有城镇宗门', miss.length === 0, `${main.length - miss.length}/${main.length}` + (miss.length ? ' 不可达：' + miss.slice(0, 6).map((l: any) => l.name).join('、') : ''));
  } else {
    const isles = LOCATIONS.filter((l: any) => l.island).length;
    check('沧溟海以海岛为主（飞行往来）', isles / LOCATIONS.length > 0.5, `${isles}/${LOCATIONS.length} 处在岛上`);
  }
  // 4. 妖王与大事件归属
  const lairs = EN.LAIRS.filter((l: any) => W.legacyHere(l.x, l.y)).map((l: any) => l.id).sort().join(',');
  const want: any = { tiannan: (x: string) => !/fengxi|dujiao|shuanggong/.test(x), luanxing: (x: string) => x.includes('lair_fengxi') && x.includes('lair_dujiao'), dajin: (x: string) => x.includes('lair_shuanggong') };
  check('妖王巢穴在正确的图', want[ACTIVE_MAP](lairs), lairs || '（无）');
  const { CANON_EVENTS } = await import('../src/world/events') as any;
  const xt = CANON_EVENTS.find((e: any) => e.id === 'xutian');
  const here = W.locHere(xt.loc);
  check(ACTIVE_MAP === 'luanxing' ? '归墟殿在沧溟海' : '归墟殿不在本图', ACTIVE_MAP === 'luanxing' ? !!here : !here);
  g.reset(); g.hero.realm = 3; g.hero.stage = 1; g.ws.flags.storyDone = 1;
  const s0 = (xt.year - 1) * 360 + (xt.month - 1) * 30;
  g.hero.realm = 2; g.day = s0 - 400; g.update(0.03); g.hero.realm = 3; g.day = s0 + 2; g.update(0.03);   // 第三十五步起境界门槛会提前开启：先压低境界，避免一开局就开过了
  const st = g.ws.events.xutian ?? g.ws.events['xutian#0'];
  check('第二十年归墟殿开启（全图皆有传闻）', st?.state === 'active', st?.state);
  if (here) { g.teleport(here.x * S, here.y * S + 300); g.modal = null; for (let i = 0; i < 12 && g.modal?.node?.speaker !== xt.name; i++) g.update(1 / 30); check('赶到归墟殿 → 触发事件', g.modal?.node?.speaker === xt.name, g.modal?.node?.speaker ?? 'none'); }
  // 5. 每图一个 NPC 社会：只有本图 NPC 处于活跃状态
  const home = LOC_BY_ID.get(ACTIVE_MAP === 'tiannan' ? 'huangfeng' : ACTIVE_MAP === 'luanxing' ? 'tianxing' : 'jinjing');
  g.reset(); g.ws.flags.storyDone = 1; g.modal = null; g.teleport(home.x * S, home.y * S + 400);
  // 等到身边有人活跃为止（最多 15 秒）。以前只等 1 秒：观星城一带本来就住在附近的人不多（重开一局后三千步内一个也没有），
  // 身边的人主要是名册门人（r_tianxing_*）和坐镇老怪（gz_*），它们由 Roster / Garrison 每 1.5 秒查一次、走近了才现身；
  // 重开前那一局把这个计时走到一半时，头一秒还轮不到（并非换图后没人激活：1.5 秒内就有二十几人）
  let waited = 0;
  for (; waited < 15 * 30; waited++) { g.modal = null; g.update(1 / 30); if (waited >= 30 && g.npcs.active.size) break; }
  const act = [...g.npcs.active.keys()].map((id: string) => g.npcs.byId.get(id)).filter(Boolean);
  check('活跃 NPC 全是本图居民', act.length > 0 && act.every((d: any) => (d.map ?? 'tiannan') === ACTIVE_MAP), `活跃 ${act.length} / 总 ${g.npcs.list.length}，${(Math.max(30, waited) / 30).toFixed(1)} 秒`);
  done();
}

if (PHASE === 'portal_out') {
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
  check('灵石不足时无法开启', pick('开启传送阵') === 'disabled');
  C.addItem(g.hero, 'mat_lingshi', 1000);
  g.closeModal(true); g.travel.tryPortal();
  const day0 = g.day;
  check('开启传送阵（600 灵石）', pick('开启传送阵') === true && lingshi() === 400, `余 ${lingshi()}`);
  const sv = auto();
  // 存档记的落点是南荒这边认得的摇光岛传送阵坐标；沧溟海建图时地点会按地形微调（这里差三格上下），读档落脚时再找能站的地方
  const dSave = Math.hypot(sv?.p?.x - lx.x * S, sv?.p?.y - lx.y * S) / S;
  check('存档 v3 记下目标图与落点', sv?.v === 3 && sv.map === 'luanxing' && sv.arrive === 'portal' && dSave < 10, `落点距传送阵 ${dSave.toFixed(1)} 格`);
  check('传送不耗时日', g.day === day0);
  // 换图现在是游戏内直接换（Game.switchMap → rebindMap + 读刚写的自动存档），不再整页刷新、也不再写 taixu.resume；
  // 刷新页面时按 taixu.map 进对应的图。换完：本进程已在沧溟海，人落在传送阵旁的陆地上，身上的东西还在
  const dHere = Math.hypot(g.player.x - lx.x * S, g.player.y - lx.y * S) / S;
  check('换图：游戏内直接换到沧溟海，taixu.map = luanxing', W.ACTIVE_MAP === 'luanxing' && mem['taixu.map'] === 'luanxing' && g.terrain.W === W.mapSize('luanxing').W);
  check('换图后人在摇光岛传送阵旁的陆地上（非飞行），灵石照旧', dHere < 40 && g.terrain.isLand(g.player.x, g.player.y) && !g.player.flying && lingshi() === 400, `距 ${dHere.toFixed(1)} 格`);
  check('本图迷雾已存入 fogs.tiannan', typeof sv?.fogs?.tiannan === 'string' && sv.fogs.tiannan.length > 10);
  done();
}

if (PHASE === 'portal_in') {
  const lx = LOC_BY_ID.get('chuansong_lx');
  check('沧溟海读档成功', g.load('taixu_save_auto') === true);
  const d = Math.hypot(g.player.x - lx.x * S, g.player.y - lx.y * S);
  check('落在摇光岛传送阵旁（陆地，非飞行）', d < 40 * S && terrain.isLand(g.player.x, g.player.y) && !g.player.flying, `距 ${(d / S).toFixed(1)} 格`);
  check('物品带过来了', lingshi() === 400 && C.bagCount(g.hero, 'tok_danuoyi') === 1);
  check('南荒迷雾仍保留在存档里', typeof g.fogs.tiannan === 'string');
  g.ws.flags.storyDone = 1; g.modal = null;
  for (let i = 0; i < 20; i++) { g.modal = null; g.update(1 / 30); }
  check('沧溟海可正常运行', !g.hero.dead);
  g.teleport(lx.x * S + 200, lx.y * S); g.modal = null;
  C.addItem(g.hero, 'mat_lingshi', 500);
  g.travel.tryPortal();
  check('回程：再开传送阵', pick('开启传送阵') === true && lingshi() === 300);
  check('回程存档目标为南荒', auto()?.map === 'tiannan' && mem['taixu.map'] === 'tiannan');
  check('沧溟海迷雾写入 fogs.luanxing', typeof auto()?.fogs?.luanxing === 'string');
  done();
}

if (PHASE === 'portal_back') {
  const cs = LOC_BY_ID.get('chuansong');
  check('回到南荒读档成功', g.load('taixu_save_auto') === true);
  check('落在梁国灵石矿洞传送阵旁', Math.hypot(g.player.x - cs.x * S, g.player.y - cs.y * S) < 40 * S && terrain.isLand(g.player.x, g.player.y));
  check('往返后灵石 300、令牌仍在', lingshi() === 300 && C.bagCount(g.hero, 'tok_danuoyi') === 1);
  check('两图迷雾都在', !!g.fogs.tiannan && !!g.fogs.luanxing);
  done();
}

// 南荒 ⇄ 中州：现在是无缝过境（Game.seamTick / crossSeam）——人自己朝北走或飞进天穹草原，过了中线悄悄换到中州，
// 不弹对话、不切画面，路上按走过的纵深折算天数（约 120 日）。以前是走到北缘弹提示、点「启程」直接跳过去 120 日，那一套已经没有了。
// 细节（边界放开、地貌一致、草原上存读档）在 test-seam、test-seam-cross 里测；这里只留端到端的一趟：
// 南荒 → 中州（换图后人在陆地上、日子有流逝）→ 中州读档 → 飞回南荒 → 南荒读档，三张图的迷雾一路都在。
const seamFly = (key: string, frames: number, until: () => boolean) => {
  g.input.keys.clear();
  let n = 0;
  for (; n < frames; n++) { if (g.modal) g.closeModal(true); g.paused = false; g.input.keys.add(key); g.update(0.1); g.combat.enemies.length = 0; g.player.flying = true; if (until()) break; }
  g.input.keys.clear();
  return n;
};
/** 原地落下（按 F 那一套：脚下是海或陡坡就落不下） */
const landHere = () => { g.player.flying = true; g.toggleFly(); return !g.player.flying; };
/** 过境途中弹出的「远行」类对话（以前的北上提示），无缝过境不该有 */
const watchDialogs = () => { const seen: string[] = []; const od = g.openDialog.bind(g); g.openDialog = (n: any) => { if (/→|中州|南荒/.test(n?.title ?? '')) seen.push(n.title); return od(n); }; return seen; };

if (PHASE === 'edge_out') {
  // 接着传送阵那一趟的存档走：身上带着南荒、沧溟海两张图的迷雾
  check('南荒读档（带着传送阵往返的迷雾）', g.load('taixu_save_auto') === true && !!g.fogs.luanxing);
  g.ws.flags.storyDone = 1; g.modal = null;
  g.hero.realm = 4; g.hero.stage = 0;   // 元婴：飞得快些，测试跑得动（过境本身与境界无关）
  // 东西海岸没有出口：只提示，不弹窗
  g.teleport(250, 300 * S); (g.travel as any).edgeT = 0; (g.travel as any).dir = { x: -1, y: 0 };
  let toast = ''; const ot = g.toast.bind(g); g.toast = (t: string, k: any) => { toast = t; ot(t, k); };
  for (let i = 0; i < 40; i++) { g.player.moving = true; (g.travel as any).dir = { x: -1, y: 0 }; g.travel.update(1 / 30); }
  check('西缘没有出口：只提示，不弹窗', !g.modal && toast.length > 0, toast.slice(0, 24));
  g.toast = ot;
  // 顺着天穹草原的商道往北飞，一直飞进中州。（以前取朔漠的经度：那条经线到了中州那边是东南的海湾，飞过去下面是水——
  // 这本来就是地理，飞着的人自己找陆地落，落不下会提示「身下是大海」；走路的人进不了水，得顺着商道走）
  const dialogs = watchDialogs(), day0 = g.day, age0 = g.hero.age;
  g.teleport(W.SEAM_ROAD[0][0], 1500); g.player.flying = true; g.combat.reset(); g.modal = null;
  const frames = seamFly('w', 60000, () => W.ACTIVE_MAP === 'dajin' && g.seamDepth < -2000);
  const days = g.day - day0, seam = W.seamsOf('dajin').find((s: any) => s.to === 'tiannan');
  check('自己飞过天穹草原进了中州（不弹远行对话）', W.ACTIVE_MAP === 'dajin' && g.seamDepth < -2000 && dialogs.length === 0, `${frames} 帧${dialogs.length ? '，弹了：' + dialogs.join('、') : ''}`);
  check('路上的日子按路程折算（约 120 日）', days > seam.days * 0.7 && days < seam.days * 1.8 && g.hero.age > age0, `+${days.toFixed(0)} 日`);
  const P = g.player;
  check('中州南缘落得下脚（陆地、站得住）', g.terrain.isLand(P.x, P.y) && g.terrain.walkFactor(P.x, P.y) > 0 && landHere(), `(${Math.round(P.x)}, ${Math.round(P.y)})`);
  // 迷雾：过境时把南荒的迷雾编进 fogs.tiannan，中州这一张在存档时写进 fogs.dajin（内存里没去过的图本来就没有这一项）
  const saved = g.save(0) === true ? auto() : null;
  check('在中州存档，三图迷雾都在存档里', saved?.map === 'dajin' && ['tiannan', 'luanxing', 'dajin'].every((m) => typeof saved?.fogs?.[m] === 'string' && saved.fogs[m].length > 3));
  done();
}

if (PHASE === 'edge_in') {
  check('中州读档成功', g.load('taixu_save_auto') === true);
  check('落在陆地上', terrain.isLand(g.player.x, g.player.y) && terrain.walkFactor(g.player.x, g.player.y) > 0 && !g.player.flying);
  // 危险度：中州按纬度定妖气（南境 5 级起，越北越凶，Combat.dangerCalc），城镇三千步内、官道上压低。
  // 以前取「落脚点往北 60 格」那一点，正好落在城镇或官道边上，量的是压低之后的数。改取那附近第一处离城镇、官道都远的野外
  let wild: { x: number; y: number } | null = null;
  for (let r = 40 * S; r < 200 * S && !wild; r += 10 * S) for (let a = 0; a < 12 && !wild; a++) {
    const x = g.player.x + Math.cos(a / 12 * Math.PI * 2) * r, y = g.player.y - Math.abs(Math.sin(a / 12 * Math.PI * 2)) * r;
    if (x < 0 || y < 0 || x > terrain.W * S || y > terrain.H * S || !terrain.isLand(x, y) || terrain.onRoad(x, y)) continue;
    if (LOCATIONS.some((l: any) => ['city', 'town', 'sect', 'isle'].includes(l.type) && Math.hypot(l.x * S - x, l.y * S - y) < 3200)) continue;
    wild = { x, y };
  }
  const dz = wild ? g.combat.dangerCalc(wild.x, wild.y) : null;
  check('中州野外危险度高', !!dz && dz.d >= 2, dz ? `d=${dz.d.toFixed(2)} 妖气 ${dz.k.toFixed(1)} 级` : '找不到野外');
  // 回程：往南飞回南荒
  g.ws.flags.storyDone = 1; g.modal = null; g.hero.realm = Math.max(g.hero.realm, 4);
  const dialogs = watchDialogs(), day0 = g.day;
  g.player.flying = true;
  seamFly('s', 60000, () => W.ACTIVE_MAP === 'tiannan' && g.seamDepth < -2000);
  check('自己飞回南荒（不弹远行对话）', W.ACTIVE_MAP === 'tiannan' && dialogs.length === 0 && g.day - day0 > 60);
  const P = g.player;
  check('南荒北缘落得下脚', g.terrain.isLand(P.x, P.y) && landHere(), `(${Math.round(P.x)}, ${Math.round(P.y)})`);
  check('回到南荒后存档', g.save(0) === true && auto()?.map === 'tiannan');
  done();
}

if (PHASE === 'edge_back') {
  check('回到南荒读档成功', g.load('taixu_save_auto') === true);
  check('落在南荒北缘陆地', terrain.isLand(g.player.x, g.player.y) && terrain.walkFactor(g.player.x, g.player.y) > 0 && !g.player.flying && g.player.y < 40 * S);
  check('三图迷雾都在', !!g.fogs.tiannan && !!g.fogs.dajin && !!g.fogs.luanxing);
  done();
}

if (PHASE === 'v057') {
  // 原版 v0.57 的存档（v3、有 map，没有 tn：南荒放大之前）：人站在城中心。如今的城是一两万见方的街坊城，
  // 旧坐标可能正好在一座房子里——读进来要落在城里的街上或城边能走的地方，不能卡在墙里、不能被挪到城外老远
  g.reset(); g.save(0);
  const base = auto();
  for (const [id, map] of [['jingzhou', 'tiannan'], ['yuejing', 'tiannan'], ['tianxing', 'luanxing']] as const) {
    const l = LOC_BY_ID.get(id), k = map === 'tiannan' ? W.TN_K : 1;
    // 城中心和城里八个方向各一处（旧城不大，旧存档的人都在中心一两千步内）
    let bad = 0, worst = 0, blockedAtFirst = 0;
    for (const [ox, oy] of [[0, 0], [900, 0], [-900, 0], [0, 700], [0, -700], [1500, 1100], [-1500, 1100], [1500, -1100], [-1500, -1100]]) {
      const d = JSON.parse(JSON.stringify(base)); delete d.tn; delete d.arrive; d.map = map;
      d.p = { x: (l.x * S + ox) / k, y: (l.y * S + oy) / k, flying: false };
      mem.taixu_save_1 = JSON.stringify(d);
      if (g.space.streetAt(l.x * S + ox, l.y * S + oy, true) && W.ACTIVE_MAP === map) blockedAtFirst++;
      const ok = g.load('taixu_save_1') === true, P = g.player, dd = Math.hypot(P.x - l.x * S - ox, P.y - l.y * S - oy) / S;
      // 原坐标正好落在如今的房子里时人就站在原处：身陷房子里时放行、能自己走出来（见 test-city-save），这里只要求没被挪出城、站在陆地上
      if (!(ok && W.ACTIVE_MAP === map && dd < 10 && g.terrain.isLand(P.x, P.y) && g.terrain.walkFactor(P.x, P.y) > 0 && !P.flying)) bad++;
      worst = Math.max(worst, dd);
    }
    check(`原版 v0.57 存档人在${l.name}城里：留在城里、站在陆地上（不挪出城）`, bad === 0, `9 处里 ${bad} 处不对，最远挪了 ${worst.toFixed(1)} 格；原坐标落在房子里的 ${blockedAtFirst} 处`);
  }
  done();
}

if (PHASE === 'legacy_a') {
  // 构造一份第十五步的旧存档：人在观星城（旧统一大地图坐标），无 map / fogs 字段
  g.reset(); g.save(0);
  const d = auto(); const tx = LOC_BY_ID.get('tianxing');
  const [lx, ly] = W.fromMap('luanxing', tx.x, tx.y);
  d.v = 2; delete d.map; delete d.fogs; delete d.arrive; d.p = { x: lx * S + 900, y: ly * S, flying: true };
  d.fog = 'x'; d.npcs = d.npcs.map((n: any) => { const { map, ...rest } = n; return rest; });
  mem.taixu_save_auto = JSON.stringify(d); mem['taixu.map'] = 'tiannan';
  const r = g.load('taixu_save_auto');
  // 换图是游戏内直接换：南荒这边读这份档，读出人在沧溟海，就地换到沧溟海再读一遍（以前是记下 taixu.resume、整页刷新）
  check('旧档人在观星城：南荒读档转交沧溟海', r === true && W.ACTIVE_MAP === 'luanxing' && mem['taixu.map'] === 'luanxing');
  const t2 = LOC_BY_ID.get('tianxing'), dd = Math.hypot(g.player.x - t2.x * S, g.player.y - t2.y * S) / S;
  check('转交后落在观星城里或城边能走的地方', dd < 20 && g.terrain.isLand(g.player.x, g.player.y) && g.terrain.walkFactor(g.player.x, g.player.y) > 0 && !g.player.flying && !g.space.streetAt(g.player.x, g.player.y, true), `距 ${dd.toFixed(1)} 格`);
  done();
}

if (PHASE === 'legacy_b') {
  const tx = LOC_BY_ID.get('tianxing');
  check('沧溟海读入旧档', g.load('taixu_save_auto') === true);
  const dd = Math.hypot(g.player.x - tx.x * S, g.player.y - tx.y * S) / S;
  check('迁移后落在观星城附近的陆地上（不卡在房子里）', dd < 20 && terrain.isLand(g.player.x, g.player.y) && !g.space.streetAt(g.player.x, g.player.y, true), `距 ${dd.toFixed(1)} 格`);
  check('NPC 按家乡分配到三图', g.npcs.list.some((n: any) => n.map === 'luanxing') && g.npcs.list.some((n: any) => (n.map ?? 'tiannan') === 'tiannan'));
  g.save(0);
  check('再存档已是 v3', auto()?.v === 3 && auto()?.map === 'luanxing');
  done();
}
