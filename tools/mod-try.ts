// 模组试跑：打包一个模组文件夹，放进无头游戏里走一遍，逐项报告（给写模组的人和 AI 用）
// 用法：npx tsx tools/mod-try.ts mods/<模组文件夹>
// 检查：打包与校验 → setup 能否跑通、注册了什么 → 法术能否施放 → 妖兽能否刷出、击杀与掉落 → 开局对话 → 每帧 / 每日回调 → 存档往返
import './env';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';   // 路径里有中文或空格时 URL.pathname 是转义过的、盘符前还多一个斜杠，开发包里会找不到打包工具
const CW = 1280, CH = 800;
(globalThis as any).window = { innerWidth: CW, innerHeight: CH, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
(globalThis as any).sessionStorage = (globalThis as any).localStorage;
(globalThis as any).__TAIXU_NORELOAD = true;

// 模组开发包里没有游戏源码：本工具与打包工具都是编译好的 tools/*.mjs
declare const __MODKIT__: boolean | undefined;
const KIT = typeof __MODKIT__ !== 'undefined' && __MODKIT__;
const dir = process.argv[2];
if (!dir) { console.error(KIT ? '用法：node tools/mod-try.mjs mods/<模组文件夹>' : '用法：npx tsx tools/mod-try.ts mods/<模组文件夹>'); process.exit(1); }
const man = JSON.parse(readFileSync(join(resolve(dir), 'manifest.json'), 'utf8'));
let problems = 0, warns = 0;
const ok = (m: string) => console.log('  ✓ ' + m);
const bad = (m: string) => { problems++; console.log('  ✗ ' + m); };
const warn = (m: string) => { warns++; console.log('  ! ' + m); };

console.log(`一、打包「${man.name}」v${man.version}`);
try { if (KIT) execFileSync(process.execPath, [fileURLToPath(new URL('./mod-pack.mjs', import.meta.url)), dir], { stdio: 'pipe' }); else execFileSync('npx', ['tsx', 'tools/mod-pack.ts', dir], { stdio: 'pipe', shell: process.platform === 'win32' }); ok('打包、校验通过'); }
catch (e: any) { bad('打包失败：' + String(e.stderr || e.stdout || e.message).trim()); process.exit(1); }
const bundle = JSON.parse(readFileSync(`dist-mods/${man.id}-${man.version}.fmod`, 'utf8'));
const kb = JSON.stringify(bundle).length / 1024;
if (kb > 4096) warn(`模组包 ${kb.toFixed(0)} KB，偏大：玩家下载与浏览器存储都要占空间（图片请压缩成 webp）`);

const { ModHost } = await import('../src/mod/host');
const { ARTS } = await import('../src/data/arts');
const { ITEMS } = await import('../src/data/items');
const { ENEMIES } = await import('../src/data/enemies');
const { Terrain } = await import('../src/world/terrain');
const { Game } = await import('../src/world/game');
const { Enemy } = await import('../src/world/combat');
const C = await import('../src/world/cultivation');
const before = { arts: new Set(Object.keys(ARTS)), items: new Set(Object.keys(ITEMS)), enemies: new Set(Object.keys(ENEMIES)) };

console.log('二、加载（setup）');
const host = new ModHost();
const warnLog: string[] = [];
const ow = console.warn; console.warn = (...a: unknown[]) => { warnLog.push(a.map(String).join(' ')); };
const st = await host.load(bundle);
console.warn = ow;
if (st.state !== 'loaded') { bad(`setup 失败：${st.error}`); process.exit(1); }
const added = { arts: Object.keys(ARTS).filter((k) => !before.arts.has(k)), items: Object.keys(ITEMS).filter((k) => !before.items.has(k)), enemies: Object.keys(ENEMIES).filter((k) => !before.enemies.has(k)) };
ok(`setup 跑通：法术 ${added.arts.length}（${added.arts.join('、') || '—'}）· 物品 ${added.items.length} · 敌人 ${added.enemies.length}（${added.enemies.join('、') || '—'}）`);
if (st.added.recipes || st.patched) ok(`v2：丹方 ${st.added.recipes} · 改动已有内容 ${st.patched} 处`);
for (const w of st.warnings) warn(w);
for (const id of added.items) { const d = ITEMS[id]; if (!d.desc) warn(`物品 ${id} 没写 desc（玩家看不到说明）`); }
for (const id of added.enemies) for (const dr of ENEMIES[id].drops) if (!ITEMS[dr.id]) bad(`敌人 ${id} 的掉落 ${dr.id} 不是已有物品`);
for (const id of added.arts) { const s = ARTS[id]; if (s.power > 8) warn(`法术 ${id} 威力 ${s.power} 远超天阶上限（约 7），会破坏平衡`); if (s.mp < 0.02 && s.power > 1.5) warn(`法术 ${id} 几乎不耗法力却威力不低`); }

console.log('三、进游戏');
const terrain = new Terrain(); terrain.build();
const g = new Game(terrain); g.reset();
host.attach(g); host.start();
(g as any).paused = false; g.combat.invulnT = 1e9;
let dialogs = 0;
for (let i = 0; i < 90; i++) {
  const n = (g.modal as any)?.node;
  if (n?.__mod) {
    dialogs++;
    ok(`模组对话「${n.speaker}」：${n.text.slice(0, 30).replace(/\n/g, ' ')}…（${n.options.length} 个选项）`);
    try { n.options[0]?.act?.(); ok(`选第一个选项「${n.options[0]?.label}」无错`); } catch (e) { bad('对话选项出错：' + e); }
    g.modal = null;
  } else if (g.modal) g.closeModal(true);   // 游戏自己的开场剧情等，直接关掉
  g.update(1 / 30);
}
const hookErrs = () => host.status.find((s) => s.id === man.id)?.errors ?? 0;
for (let i = 0; i < 120; i++) { g.modal = null; g.update(1 / 30); }
if (hookErrs()) bad(`回调运行出错 ${hookErrs()} 次（前几条见下方日志）`); else ok('开局 + 4 秒每帧回调无错');

console.log('四、法术');
g.hero.realm = 3; g.hero.stage = 0;
for (const id of added.arts) {
  if (!g.hero.arts.some((a) => a.id === id)) g.hero.arts.push({ id, xp: 0 });
  g.combat.enemies = [];
  const dummy = new Enemy(ENEMIES.boar, g.player.x + 280, g.player.y, 1, 1); dummy.aggro = true; dummy.maxHp = dummy.hp = 1e7; g.combat.enemies.push(dummy);
  g.hero.mp = 1; (g.combat as any).cds.clear(); g.combat.lock = dummy;
  try { g.combat.cast(id); for (let i = 0; i < 45; i++) { g.modal = null; g.update(1 / 30); } } catch (e) { bad(`施放 ${id} 抛错：${e}`); continue; }
  const s = ARTS[id];
  const DMG = new Set(['bolt', 'fan', 'nova', 'burst', 'strike', 'cone', 'beam', 'chain', 'field', 'orbit', 'dash']);
  if (!DMG.has(s.cast)) ok(`施放 ${id}（${s.cast}，非伤害类）无错`);
  else if (s.power > 0 && dummy.hp >= 1e7) warn(`法术 ${id} 没打中正前方 280 像素的木桩（cast=${s.cast}，range=${s.range}）——确认出手方式与射程`);
  else ok(`施放 ${id}${s.power > 0 ? `，造成 ${Math.round(1e7 - dummy.hp)} 伤害` : ''}`);
}

console.log('五、妖兽');
for (const id of added.enemies) {
  const def = ENEMIES[id];
  // 在全图随机找点抽；限定地貌的，只在对应地貌的点上抽
  let rolled = false, tries = 0, spots = 0;
  const T = g.terrain;
  for (let k = 0; k < 6000 && !rolled && tries < 800 && def.kind !== 'ghost' && def.kind !== 'human'; k++) {
    const x = Math.random() * T.W * 300, y = Math.random() * T.H * 300;
    if (def.zone && g.combat.dangerCalc(x, y).zone !== def.zone) continue;
    spots++;
    for (let j = 0; j < 4 && !rolled; j++, tries++) rolled = g.combat.rollBeast(x, y, 0.5)?.def.id === id;
  }
  if (def.kind === 'human') ok(`修士 ${id}：由刷怪按地域 / 危险度选取`);
  else if (def.kind === 'ghost') ok(`鬼物 ${id}：野外不会自然刷出（只能由剧情 g.spawnEnemy 放出）`);
  else if (rolled) ok(`妖兽 ${id} 会在野外自然刷出`); else warn(`妖兽 ${id} 在南荒${def.zone ? `「${def.zone}」地貌的 ${spots} 个点上` : ''}抽 ${tries} 次没刷出：检查 lv / zone / regions / minDanger~maxDanger 是否太窄${def.zone && !spots ? '（南荒几乎没有这种地貌）' : ''}`);
  const e = new Enemy(def, g.player.x + 200, g.player.y, def.lv ? Math.min(4, Math.max(1, def.lv[0] <= 1 ? 1 : def.lv[0] <= 4 ? 2 : def.lv[0] <= 7 ? 3 : 4)) : 1, 1);
  g.combat.enemies = [e];
  const bag0 = JSON.stringify(g.hero.bag);
  try { g.combat.hitEnemy(e, 1e12, { realm: 9, stCh: 0 }, e.x, e.y); for (let i = 0; i < 10; i++) { g.modal = null; g.update(1 / 30); } ok(`击杀 ${id}（血 ${e.maxHp}，攻 ${Math.round(e.atk)}）${hookErrs() ? '' : '，kill 回调无错'}`); }
  catch (err) { bad(`击杀 ${id} 出错：${err}`); }
  void bag0;
}

console.log('五·二、专属招式');
{
  const { MOD_KITS, kitOf } = await import('../src/world/foeskills');
  const ids = Object.keys(MOD_KITS).filter((k) => ENEMIES[k] && MOD_KITS[k].skills.length);
  if (!ids.length) ok('没有自定义招式');
  // 离开城镇（城里妖兽不动手）
  { let x = g.player.x + 3000, y = g.player.y; const T = g.terrain;
    for (let r = 0; r < 40000 && (T.inLocZone(x, y, 1800) || T.walkFactor(x, y) <= 0); r += 400) { x += 400; y += 150; }
    g.teleport(x, y); }
  for (const id of ids) {
    const want = new Set(MOD_KITS[id].skills.map((x) => x.name)), seen = new Set<string>();
    const lv = ENEMIES[id].lv?.[0] ?? 1, realm = lv <= 1 ? 1 : lv <= 4 ? 2 : lv <= 7 ? 3 : 4;
    try {
      for (let round = 0; round < 3 && seen.size < want.size; round++) {
        g.combat.enemies = []; (g.combat.texts as any[]).length = 0;
        const e = new Enemy(ENEMIES[id], g.player.x + 260, g.player.y, realm, 1); e.aggro = true; e.maxHp = e.hp = 1e9; g.combat.enemies.push(e);
        for (let i = 0; i < 30 * 25 && seen.size < want.size; i++) {
          if (round === 1) e.hp = e.maxHp * 0.3;   // 第二轮压到残血，看大招
          g.hero.hp = Math.max(g.hero.hp, 0.5); g.modal = null; g.update(1 / 30);
          for (const t of g.combat.texts as any[]) if (want.has(t.s)) seen.add(t.s);
        }
      }
      const miss = [...want].filter((n) => !seen.has(n));
      if (miss.length) warn(`${ENEMIES[id].name}（${id}）对战 75 秒没放出：${miss.join('、')}——检查 range / min / hpBelow / cd`);
      else ok(`${ENEMIES[id].name}（${id}）专属招式都放出来了：${[...seen].join('、')}（全套 ${kitOf(new Enemy(ENEMIES[id], 0, 0, realm, 1)).length} 门）`);
    } catch (err) { bad(`${id} 放招式出错：${err}`); }
  }
  g.combat.enemies = [];
}

console.log('五·三、地点、人物、界面');
{
  const HK = await import('../src/mod/hooks'), X = HK.modx;
  const { LOC_BY_ID } = await import('../src/data/world');
  const m = host.mods.find((x) => x.b.manifest.id === man.id)!;
  const errs0 = hookErrs();
  for (const [lid, owner] of host.locs) {
    if (owner !== m) continue;
    const l = LOC_BY_ID.get(lid)!;
    const z = (g.terrain as any).locZones?.some((q: any) => q.id === lid);
    if (!z) warn(`地点 ${lid} 不在当前地图（${l.map}），本次试跑没法走过去看`);
    g.modal = null; g.towns.open(l);
    const kind = g.modal?.kind;
    ok(`地点「${l.name}」（${l.type}）能进入：${kind === 'town' ? '城镇面板' : kind === 'dialog' ? '对话' : kind ?? '没反应'}${X ? `，模组事务 ${X.townFacs(l).length} 项` : ''}`);
    for (const f of X?.townFacs(l) ?? []) { g.modal = null; try { f.act(); ok(`　事务「${f.name}」无错${g.modal ? `（弹出${g.modal.kind === 'dialog' ? '对话' : g.modal.kind}）` : ''}`); } catch (e) { bad(`　事务「${f.name}」出错：${e}`); } }
    g.modal = null;
  }
  for (const def of m.npcs) {
    const d = g.npcs.byId.get(def.id);
    if (!d) { bad(`NPC ${def.id} 没进名册`); continue; }
    const a = g.npcs.summon(def.id)!;
    g.modal = null; g.npcs.interact(a);
    const node = (g.modal as any)?.node;
    ok(`NPC「${d.name}」在名册里（${d.home}），交谈：${node ? `「${String(node.text).slice(0, 24).replace(/\n/g, ' ')}…」${node.options.length} 个选项` : '没弹对话'}`);
    try { node?.options?.[0]?.act?.(); } catch (e) { bad(`　NPC 对话第一项出错：${e}`); }
    g.npcs.dismiss(def.id); g.modal = null;
  }
  for (const b of X?.buttons() ?? []) if (b.key.startsWith(man.id + ':')) { g.modal = null; b.go(); ok(`按钮「${b.glyph}·${b.label}」点击无错${g.modal?.kind === 'mod' ? '，打开了面板' : ''}`); }
  for (const pid of m.panels.keys()) { const p = X?.panel(man.id, pid); ok(`面板「${p?.title}」渲染：${p?.nodes.length ?? 0} 项`); }
  if (m.hooks.draw.length) { const L: any[] = []; X?.collect(L); ok(`世界层绘制：本帧 ${L.length} 笔`); }
  g.modal = null;
  if (hookErrs() > errs0) bad(`这一段回调出错 ${hookErrs() - errs0} 次`);
}

console.log('六、过日子与存档');
// 过 60 天（每次半天），期间弹出的模组对话自动选第一项
let dayDialogs = 0;
for (let i = 0; i < 120; i++) {
  g.day += 0.5; (g as any).mods?.day(0.5);
  for (let k = 0; k < 3; k++) { g.update(1 / 30); const n = (g.modal as any)?.node; if (n?.__mod) { dayDialogs++; try { n.options[0]?.act?.(); } catch (e) { bad('对话选项出错：' + e); } g.modal = null; } else if (g.modal) g.closeModal(true); }
}
if (hookErrs()) bad(`过日子期间回调出错（累计 ${hookErrs()} 次）`); else ok(`过了 60 天（day 回调 120 次）无错${dayDialogs ? `，期间弹出模组对话 ${dayDialogs} 段` : ''}`);
const data = (g.ws as any).mods?.[man.id];
const dataKb = data ? JSON.stringify(data).length / 1024 : 0;
if (dataKb > 64) warn(`模组存档数据 ${dataKb.toFixed(1)} KB：存档在 localStorage 里（总共约 5MB），请精简`);
g.save(1);
const g2 = new Game(terrain);
if (!g2.load('taixu_save_1')) bad('存档读不回来'); else {
  const d2 = (g2.ws as any).mods?.[man.id];
  if (JSON.stringify(d2 ?? null) !== JSON.stringify(data ?? null)) bad('模组数据存档往返不一致（store 里放了不能转 JSON 的东西？）'); else ok(`存档往返：模组数据 ${data ? Object.keys(data).join('、') || '（空）' : '（无）'}`);
}
for (const id of added.items) if (C.bagCount(g.hero, id)) ok(`身上有 ${ITEMS[id].name} ×${C.bagCount(g.hero, id)}`);

const stF = host.status.find((s) => s.id === man.id)!;
if (stF.state !== 'loaded') bad(`最终状态：${stF.state}（${stF.error}）`);
if (warnLog.length) { console.log('\n—— 日志（前 6 条）——'); for (const l of warnLog.slice(0, 6)) console.log('  ' + l.slice(0, 300)); }
console.log(`\n${problems ? `✗ ${problems} 个问题` : '✓ 没有发现问题'}${warns ? `，${warns} 条提醒` : ''}。对话 ${dialogs} 段。`);
process.exit(problems ? 1 : 0);
