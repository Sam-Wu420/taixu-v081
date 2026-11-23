// 天工试场 · 沙盒：参照「太虚问道录重构」工程的沙盒模式，改造成本游戏的模组；1.3 起界面参照 Garry's Mod 的刷物菜单（Q 菜单）。
//
// 隔离：入阵前存一次档（自动存档位），试场里拦下一切存档；出阵时读回那份档 → 原样复原。
//       数据表（法术、法宝、妖兽……）的改动不在存档里：每一处第一次改时记下原值，出阵时逐一还原。
//       中途读别的档、关页面、热卸载本模组，都按「出阵」处理，存档始终是入阵前那份。
// 操作：法宝匣（左）选东西 → 世界里左键落子 / 右键收手；右侧工具面板选工具（属性、移除、复制、定身、挪移……）→ 点世界里的东西。
//       「属性」工具点到什么就列什么的属性表（主角、任何单位、灵宠、人物）；法宝匣里右键任何条目，列它的数据。
import { buildCatalog, TABS, CATS, STATUS, realmName } from './catalog.js';
import { createUi } from './ui.js';
import { createThumbs } from './thumbs.js';
import { createProps } from './props.js';
import { projectedDistance } from './projection.js';
import { ArenaFloorCache } from './arena-floor-cache.ts';
import { createSkyArena } from './sky-arena.js';
import { gameKind } from './gamekind.js';

/** 入阵前的自动存档键：太虚问道录是 taixu_save_auto，凡人修仙传是 fanren_save_auto（setup 时按游戏定） */
let SLOT = 'fanren_save_auto';
const DAY_CYCLE = 240, PRESET_KEY = 'shahe.presets', AIR_Y = 200000;
const TEAM_COL = { foe: '196,72,52', ally: '72,150,128', dummy: '200,160,80' };
const TEAM_NAME = { foe: '敌对', ally: '友方', dummy: '木桩' };
/** 云上演武台：八角石台的内切半径（世界像素）、要从绘制表里摘掉的景物（山树屋草、采集点、路人、名地……） */
const ARENA_R = 1900, OCT = Math.SQRT2;
/**
 * 1.3.3 浮空演武台（立体画面）：台悬在高空，台下是云海，原地形远在下面。
 * SKY_FAR：云海铺多大（台心起算）；这一圈里地面高度一律当作台面的海拔（御剑飞出台外是在云海上飞），
 * 最外的两成一段缓缓降回原地形的高度（往外一直飞，就穿过云层落回人间）；再往外一切照旧。
 * 台面海拔：这一圈里原地形最高处之上留出云层和台身，最低 4300（高过游戏自带的云海，自带的那层也会显出来），最高 10800。
 */
const SKY_FAR = 18000, SKY_RAMP = 0.8, SKY_MIN = 4300, SKY_MAX = 10800;
const HIDE = new Set(['D·山', 'D·山腰云', 'D·树', 'D·瀑布', 'D·地面小景', 'D·建筑', 'D·城墙', 'D·城中树', 'D·城中小件', 'D·旗帜', 'D·采集点', 'D·生灵(人兽)', 'D·名地', 'D·遗府奇遇', 'D·事件剧情']);
/** 数据表：直接改引用的（高级权限给的原表）与走 api.data.patch 的 */
const RAW_TABLE = { arts: 'ARTS', items: 'ITEMS', enemies: 'ENEMIES' };

/** @param {import('../sdk/taixu-mod').ModAPI} api */
export default function setup(api) {
  const PFX = gameKind(api); SLOT = PFX + '_save_auto';   // 1.4.0
  const U = api.unsafe.data;
  const G = () => api.unsafe.game();
  const H = () => globalThis.__modHost;
  const now = () => performance.now();
  let face = null;
  const IMG = { splash: api.file('img/splash.webp'), array: api.file('img/array.webp'), paper: api.file('img/paper.webp'), panel: api.file('img/panel_paper.webp'), panel2: api.file('img/panel_tools.webp'), stroke: api.file('img/stroke.webp') };
  const ICONS = ['tab_human', 'tab_beast', 'tab_item', 'tab_art', 'tab_gongfa', 'tab_pet', 'tab_status', 'tab_field', 'tab_preset', 'tr_search', 'tr_recent', 'tr_origin', 'tr_mods', 'tr_folder', 'tr_fav',
    'tl_props', 'tl_spawn', 'tl_remove', 'tl_copy', 'tl_freeze', 'tl_move', 'tl_time', 'tl_rules', 'tl_heal', 'tl_team', 'tl_units', 'tl_log', 'tl_settings', 'tl_tools', 'tl_scene', 'tl_corpse'];
  for (const k of ICONS) IMG[k] = api.file(`img/${k}.webp`);
  const pic = (f) => (typeof Image !== 'undefined' ? Object.assign(new Image(), { src: api.file(f) }) : null);
  const AR = { stone: pic('img/arena_stone.webp'), clouds: pic('img/arena_clouds.webp'), pillar: pic('img/arena_pillar.webp'), ding: pic('img/arena_ding.webp'), dummy: pic('img/arena_dummy.webp'), rack: pic('img/arena_rack.webp') };
  const arrayImg = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: IMG.array }) : null;
  const arenaFloor = new ArenaFloorCache(ARENA_R, drawPlatform);
  try { sessionStorage.removeItem('shahe.active'); } catch { /* */ }

  function quietPref(k) { try { const v = JSON.parse(localStorage.getItem('shahe.quiet') || '{}')[k]; return v === undefined ? true : !!v; } catch { return true; } }
  function saveQuiet() { try { localStorage.setItem('shahe.quiet', JSON.stringify({ noSpawn: S.noSpawn, noNpc: S.noNpc })); } catch { /* */ } }
  const S = {
    active: false, hud: true, key: SLOT, origin: { x: 0, y: 0 }, t0: 0, enterT: 0,
    god: false, lock: false, nocd: false, ai: true, infMp: false, oneHit: false, fly: false, stealth: false,
    // 1.3.2：不刷野怪、不来路人（默认开；改了记在本机，下次入阵照旧）
    noSpawn: quietPref('noSpawn'), noNpc: quietPref('noNpc'),
    speed: 1, paused: false, weather: null,
    objs: new Map(), seq: 0, sel: null, hover: null, place: null, mouse: null, drag: null,
    opt: { count: 1, realm: 1, stage: 2, team: 'foe', noAI: false, noP: false, follow: false, corpse: false },
    tool: 'props', toolOpt: { team: 'ally', status: 'burn', dur: 6 },
    heroOv: {}, orig: new Map(), dataOrig: new Map(), corpses: [],
    undo: [], logs: [], ripples: [], catalog: null,
    // 1.3.8：试场里召来 / 切磋的世界人物（有名人物、红颜、模组人物）：id → 召来前的去处（移出时放回）
    npcMine: new Map(),
  };

  // ---------------------------------------------------------------- 记录
  function log(text, tone = 'info') {
    const t = S.active ? (now() - S.t0) / 1000 : 0;
    const e = { t, text, tone }; S.logs.push(e); if (S.logs.length > 300) S.logs.shift();
    ui?.feed(e);
  }
  const pushUndo = (label, fn) => { S.undo.push({ label, fn }); if (S.undo.length > 120) S.undo.shift(); ui?.dock(); };
  function undo() { const u = S.undo.pop(); if (!u) return log('没有可撤销的操作', 'warn'); try { u.fn(); log(`撤销：${u.label}`); } catch (err) { log('撤销失败：' + (err?.message ?? err), 'bad'); } ui?.dock(); ui?.insp(); ui?.objs(); }

  // ---------------------------------------------------------------- 入阵 / 出阵（隔离）
  const patches = [];
  function patch(obj, key, wrap) {
    const own = Object.prototype.hasOwnProperty.call(obj, key), orig = obj[key];
    obj[key] = wrap(orig);
    patches.push(() => { if (own) obj[key] = orig; else delete obj[key]; });
    return orig;
  }
  /** 改 getter（stats、speed、canFlyNative 都是原型上的 getter）：在实例上盖一层，撤掉时删掉 */
  function patchGetter(obj, key, wrap) {
    let p = obj, d = null; while (p && !(d = Object.getOwnPropertyDescriptor(p, key))) p = Object.getPrototypeOf(p);
    if (!d?.get || Object.prototype.hasOwnProperty.call(obj, key)) return false;
    const orig = d.get;
    Object.defineProperty(obj, key, { configurable: true, enumerable: false, get() { return wrap.call(this, orig.call(this)); } });
    patches.push(() => { delete obj[key]; });
    return true;
  }
  function unpatch() { for (const u of patches.splice(0).reverse()) { try { u(); } catch { /* */ } } }

  function enter(opt = {}) {
    const g = G(); if (!g) return false;
    if (S.active) return true;
    if (g.hero.dead) { ui?.toast('身死道消之时入不得试场', 'bad'); return false; }
    if (g.mijing?.active || g.inCave || g.yuanying?.active) { ui?.toast('秘境、洞府、元婴出窍之时不能入阵', 'warn'); return false; }
    if (!opt.fresh && !g.save(0)) { ui?.toast('入阵前存档失败，没有入阵', 'bad'); return false; }
    if (opt.fresh) {
      // 新局的开场对话由 Story 延迟触发；临时试场里不应覆盖入阵画面。
      g.story.openT = -1;
      if (g.modal) g.closeModal(true);
    }
    S.key = opt.fresh ? null : SLOT;
    S.active = true; S.hud = true; S.t0 = S.enterT = now(); S.logs.length = 0; S.undo.length = 0; S.objs.clear(); S.sel = null; S.place = null; S.orig.clear(); S.heroOv = {}; S.corpses.length = 0;
    try { sessionStorage.setItem('shahe.active', '1'); } catch { /* */ }
    let warned = false;
    patch(g, 'save', () => function () { if (!warned) { warned = true; log('试场里不存档——出阵后一切复原', 'warn'); } return false; });
    const upd = patch(g, 'update', (orig) => function (dt) {
      const visit = quietWorld() ? this.visitQ : null;
      if (visit) this.visitQ = null;
      if (S.speed === 1) orig.call(this, dt);
      else { let t = dt * S.speed, n = 0; while (t > 1e-5 && n++ < 8) { const s = Math.min(t, 1 / 30); orig.call(this, s); t -= s; } }
      if (visit && !this.visitQ) this.visitQ = visit;
      if (!this.paused) { if (S.lock) this.hero.hp = 1; if (S.infMp || S.lock) this.hero.mp = 1; }   // 帧末再补满（战斗结算在 tick 之后）
      if (S.hud) { try { thumbs.pre(); } catch { /* */ } }
    });
    S.step = () => { const g2 = G(); g2.paused = false; try { upd.call(g2, 1 / 60); } finally { g2.paused = true; } };
    patch(g, 'onPlayerDown', () => function () {
      const h = this.hero; h.hp = 1; h.dead = false; if (this.combat) this.combat.invulnT = 2;
      ripple(this.player.x, this.player.y, '192,57,43', 260);
      log('你倒下了——试场护法为你续上一口气', 'bad');
    });
    patch(g, 'load', (orig) => function (key) { if (S.active) teardown('读档'); return orig.call(this, key); });
    patch(g, 'reset', (orig) => function (...a) { if (S.active) teardown('新开局'); return orig.apply(this, a); });
    // 主角的试场加成：气血 / 法力上限、攻防、神识、身法（只在阵里有效，出阵即撤）
    const O = () => S.heroOv;
    patchGetter(g, 'stats', function (s) { const o = O(); for (const k of ['hp', 'mp', 'atk', 'def', 'sense']) if (Number.isFinite(o[k])) s[k] = o[k]; if (Number.isFinite(o.move)) s.speed = (s.speed ?? 1) * o.move; return s; });
    patchGetter(g, 'speed', function (v) { return v * (O().move ?? 1); });
    patchGetter(g, 'canFlyNative', function (v) { return v || S.fly; });
    // 化身试炼：换一副境界
    if (opt.who === 'test') { try { face?.setRealm(opt.realm ?? 2, opt.stage ?? 0); g.hero.hp = g.hero.mp = 1; } catch { /* */ } }
    const at = opt.place === 'arena' ? findArena(g) : opt.place === 'wild' ? findWild(g) : opt.place === 'town' ? findTown(g) : null;
    if (at) g.teleport(at.x, at.y);
    S.origin = { x: g.player.x, y: g.player.y };
    S.arena = opt.place === 'arena' && !!at;
    hookWorld(g);
    if (S.noSpawn) clearPassers(g, 'noSpawn'); if (S.noNpc) clearPassers(g, 'noNpc');
    if (S.arena) arenaOn(g);
    hookCollect();
    S.catalog = buildCatalog(api, g);
    syncDraw(); bindInput(g);
    ripple(S.origin.x, S.origin.y, '230,200,120', 420);
    const place = S.arena ? '云上演武台' : at?.name ?? '原地';
    log(`入阵：${opt.who === 'test' ? '化身' : '本尊'} · ${realmName(U, g.hero.realm, g.hero.stage)} · ${place}`, 'good');
    if (opt.scene) { scene(opt.scene); log(`开场实际生成 ${S.objs.size} 个单位`, 'good'); }
    ui?.entered();
    return true;
  }
  /** 撤掉试场的一切改动（不读档） */
  function teardown(why) {
    const g = G();
    const arena = S.arena;
    if (arena) g?.renderer?.hd?.setGroundBackdrop?.(null);
    if (S.skyMesh) { try { S.skyMesh.dispose(); } catch (err) { console.warn('[天工试场] 撤浮空演武台出错', err); } S.skyMesh = null; }
    S.sky = null;
    unpatch(); unbindInput();
    if (arena) g?.renderer?.hd?.invalidateTerrain?.();
    if (arena) { try { g?.combat?.brawl?.brk?.reset?.(); } catch { /* */ } }   // 原地形的礁石、枯树按原样重摆
    dataRestore();
    S.active = false; S.place = null; S.sel = null; S.drag = null; S.hover = null; S.hsMine = false; S.ywsMine = null; S.npcMine.clear();
    if (g) {
      g.paused = false; if (S.weather !== null) { try { face?.setWeather(null); } catch { /* */ } }
      if (S.stealth && g.combat?.buffs?.until) g.combat.buffs.until.stealth = 0;
    }
    S.speed = 1; S.paused = false; S.weather = null; S.god = S.lock = S.nocd = S.infMp = S.oneHit = S.fly = S.stealth = false; S.ai = true; S.heroOv = {};
    S.objs.clear(); S.undo.length = 0; S.ripples.length = 0; S.arena = false; S.orig.clear(); S.corpses.length = 0; S.tool = 'props';
    try { sessionStorage.removeItem('shahe.active'); } catch { /* */ }
    syncDraw(); ui?.exited(why);
  }
  function exit() {
    const g = G(); if (!S.active || !g) return;
    // 临时新局：存档拦截一直留着（离开页面时游戏还会存一次），直接回主界面
    if (!S.key) { dataRestore(); try { const u = new URL(location.href); u.searchParams.delete('auto'); location.href = u.toString(); } catch { location.reload(); } return; }
    teardown('出阵');
    const ok = g.load(S.key);
    try { H()?.start?.(); } catch (err) { console.warn('[天工试场] 出阵后通知模组出错', err); }
    ui?.toast(ok ? '已出阵——试场里的一切都已散去，回到入阵之前' : '出阵读档失败：请从存档面板读「自动存档」', ok ? 'good' : 'bad');
  }
  function findWild(g) {
    const T = g.terrain, p = g.player;
    for (let k = 0; k < 400; k++) {
      const a = k * 2.39996, r = 1500 + k * 90, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (T.walkFactor(x, y) <= 0.5 || T.inLocZone?.(x, y, 900)) continue;
      let ok = true; for (let j = 0; j < 8 && ok; j++) { const b = j / 8 * Math.PI * 2; if (T.walkFactor(x + Math.cos(b) * 520, y + Math.sin(b) * 360) <= 0.3) ok = false; }
      if (ok && !g.combat.enemies.some((e) => !e.dead && Math.hypot(e.x - x, e.y - y) < 1500)) return { x, y, name: '荒野空地' };
    }
    return null;
  }
  /** 云上演武台：在本图找一块离城镇险地都远的地方（底下是山是水都无所谓，场里一律可走、景物不画） */
  function findArena(g) {
    const T = g.terrain, p = g.player;
    // 1.3.3：台悬在空中，底下是山是水是平地都一样；只挑四周的山不太高的地方（台不必升得太高），先找到的几处里取最低的
    let best = null;
    for (let k = 0, n = 0; k < 900 && n < 24; k++) {
      const a = k * 2.39996, r = 4000 + k * 120, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!T.isLand(x, y) || T.inLocZone?.(x, y, 3400)) continue;
      if (g.combat.enemies.some((e) => !e.dead && Math.abs(e.x - x) < 3000 && Math.abs(e.y - y) < 3000)) continue;
      n++;
      const peak = peakAround(T, x, y, 9000, 900);
      if (!best || peak < best.peak) best = { x, y, name: '云上演武台', peak };
      if (peak < 5200) break;
    }
    return best ?? findWild(g);
  }
  /** (x, y) 四周 R 以内原地形的最高处（网格取样） */
  function peakAround(T, x, y, R, step) {
    if (typeof T.surfaceHeight !== 'function') return 0;   // 1.3.5：原版（平面画面）的地形没有高度
    let m = -Infinity;
    for (let dy = -R; dy <= R; dy += step) for (let dx = -R; dx <= R; dx += step) {
      if (dx * dx + dy * dy > R * R) continue;
      const h = T.surfaceHeight(x + dx, y + dy); if (h > m) m = h;   // （原版地形没有高度：peakAround 开头就返回 0）
    }
    return Number.isFinite(m) ? m : 0;
  }
  /** 浮空台的海拔：云底压过这一圈里最高的山，台面再高出云底 800 */
  function skyLevels(T, x, y) {
    const peak = peakAround(T, x, y, SKY_FAR * SKY_RAMP, 600);
    const cloudY = Math.max(SKY_MIN - 800, Math.min(SKY_MAX - 800, peak + 260));
    return { top: cloudY + 800, cloudY, peak };
  }
  /** 正八角形：|dx|≤a、|dy|≤a、|dx|+|dy|≤a√2 */
  const inArena = (x, y) => { if (!S.arena) return false; const dx = Math.abs(x - S.origin.x), dy = Math.abs(y - S.origin.y); return dx <= ARENA_R && dy <= ARENA_R && dx + dy <= ARENA_R * OCT; };
  const quietWorld = () => S.noNpc || S.objs.size > 0 || (S.arena && inArena(G().player.x, G().player.y));
  const octPts = (a, cx, cy) => { const b = a * (OCT - 1); return [[a, -b], [a, b], [b, a], [-b, a], [-a, b], [-a, -b], [-b, -a], [b, -a]].map(([x, y]) => [cx + x, cy + y]); };
  const octPath = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  const ready = (im) => im && im.complete && im.naturalWidth > 0;
  const pats = new WeakMap();
  const pattern = (c, im) => { let p = pats.get(im); if (!p && ready(im)) { p = c.createPattern(im, 'repeat'); pats.set(im, p); } return p ?? null; };
  /** 台上的摆设：八角华表、香鼎、木人桩、兵器架（与人物一起按纵深排序） */
  function props() {
    const o = S.origin, a = ARENA_R, out = [];
    for (const [x, y] of octPts(a - 70, o.x, o.y)) out.push({ im: AR.pillar, x, y, h: 430 });
    out.push({ im: AR.ding, x: o.x, y: o.y - a * 0.62, h: 230 });
    for (let i = 0; i < 3; i++) out.push({ im: AR.dummy, x: o.x + a * 0.6 + (i === 1 ? 190 : 0), y: o.y - 300 + i * 300, h: 230 });
    out.push({ im: AR.rack, x: o.x - a * 0.64, y: o.y - 120, h: 220 }, { im: AR.rack, x: o.x - a * 0.64, y: o.y + 160, h: 220 });
    return out;
  }
  /** 暂停自动奇遇；原地和荒野没有试场单位时仍照常运行世界。 */
  function hookWorld(g) {
    for (const sys of [g.happen, g.events, g.pursuit, g.war, g.story, g.pianju]) {
      patch(sys, 'update', (orig) => function (dt) { if (!quietWorld()) return orig.call(this, dt); });
    }
    patch(g, 'pursuitTriggers', (orig) => function (dt) { if (!quietWorld()) return orig.call(this, dt); });
    // 世界人物在台上（或开着「不来路人」时）不更新；1.3.8：试场自己召来的人照常行动（跟随、切磋、切磋完回到身旁），也照常能交谈
    patch(g.npcs, 'update', (orig) => function (dt) { if (!S.noNpc && !inArena(g.player.x, g.player.y)) return orig.call(this, dt); mineTick(this, dt); });
    // 1.3.2：野外刷怪、海兽破水、撼山客游荡过来、散修劫道——开着「不刷野怪 / 不来路人」时都不来（试场里自己生成的单位不受影响）
    if (g.combat && typeof g.combat.spawnTick === 'function') patch(g.combat, 'spawnTick', (orig) => function (...a) { if (!S.noSpawn) return orig.apply(this, a); });
    if (g.seabeast && typeof g.seabeast.tick === 'function') patch(g.seabeast, 'tick', (orig) => function (...a) { if (!S.noSpawn) return orig.apply(this, a); try { this.idle?.(); } catch { /* */ } });   // 海里的黑影、破水的海兽：潜走
    if (g.fellows && typeof g.fellows.ambush === 'function') patch(g.fellows, 'ambush', (orig) => function (...a) { return S.noNpc ? false : orig.apply(this, a); });
    if (g.hanshan && typeof g.hanshan.tick === 'function') patch(g.hanshan, 'tick', (orig) => function (...a) { if (!S.noNpc || S.hsMine) return orig.apply(this, a); });   // 1.3.4：试场里自己召来的撼山客照常动
    // 1.3.9：试场召来的噬魂魔尊被「移除」了——连这次降临一起收掉（不然他的每帧逻辑看人离降临处近，下一帧又在原处现身）
    if (g.yewushe && typeof g.yewushe.tick === 'function') patch(g.yewushe, 'tick', (orig) => function (...a) {
      const M = S.ywsMine;
      if (M?.ob && !S.objs.has(M.ob.id)) { S.ywsMine = null; try { if (this.ent === M.ob.e) this.despawn(false); } catch { /* */ } restoreYws(this, M.snap); }
      return orig.apply(this, a);
    });
    patch(g.npcs, 'behave', (orig) => function (actor, dt) {
      if (S.npcMine.has(actor?.d?.id)) { settleMine(actor); return orig.call(this, actor, dt); }
      if (!quietWorld() || actor.act !== 'approach') return orig.call(this, actor, dt);
    });
  }
  /** 1.3.8：只更新试场召来的人（世界人物系统整个停着的时候），并替他们算「身旁可交谈的人」 */
  function mineTick(W, dt) {
    const g = G(); if (!g || g.paused || !W?.active) return;
    const p = g.player; let best = 190, focus = null;
    for (const id of [...S.npcMine.keys()]) {
      const a = W.active.get(id); if (!a) continue;
      try { W.behave(a, dt); } catch (err) { console.warn('[天工试场] 召来的人物更新出错', id, err); continue; }
      if (a.enemy || !a.d?.alive) continue;
      const dd = Math.hypot(a.st.x - p.x, a.st.y - p.y); if (dd < best) { best = dd; focus = a; }
    }
    W.focus = focus;
  }
  /**
   * 1.3.8：召来的人切磋完（或被别的系统撤出战场）——原来他回到「闲逛」，按日程走回远处的家、离远了被收起；
   * 台上世界人物不更新时更糟：一直挂着那个已撤出战场的敌人身份，人就画不出来了（「切磋完马上消失」）。
   * 试场里的改成：回到身旁接着跟着你，可以再切磋、交谈。真被打死的照原样处理。
   */
  function settleMine(a) {
    const e = a.enemy; if (!e) return;
    const C = G()?.combat; if (!C || C.enemies.includes(e) || (e.dead && !e.spar)) return;
    a.enemy = undefined; a.duel = undefined;
    a.d.x = a.st.x = e.x; a.d.y = a.st.y = e.y;
    if (a.d.alive) a.act = 'follow';
  }
  /** 入阵时 / 刚打开开关时：把已经在场的路人、野怪清走（试场自己生成的不动） */
  function clearPassers(g, which) {
    // 不刷野怪：妖兽、海兽、首领、别的模组生成的东西都清（有人名的路人归「不来路人」管；同伴、灵宠、召唤物带 ally，不动）
    if (which === 'noSpawn' || which === 'all') for (const e of [...g.combat.enemies]) { if (objOf(e) || e.dead || e.ally) continue; if (e.npcId) continue; const i = g.combat.enemies.indexOf(e); if (i >= 0) g.combat.enemies.splice(i, 1); }
    // 1.3.8：试场自己召来 / 切磋的人物不清
    if (which === 'noNpc' || which === 'all') {
      try { const A = g.npcs.active; if (!S.npcMine.size) A.clear(); else for (const id of [...A.keys()]) if (!S.npcMine.has(id)) A.delete(id); } catch { /* */ }
      try { if (g.hanshan?.ent && !S.hsMine) g.hanshan.despawn(); } catch { /* */ }
      for (const e of [...g.combat.enemies]) { if (!objOf(e) && !e.ally && e.npcId && !e.dead && !S.npcMine.has(e.npcId)) { const i = g.combat.enemies.indexOf(e); if (i >= 0) g.combat.enemies.splice(i, 1); } }
    }
  }
  /** 打开试场：场内处处可走、不算城镇、不刷怪不追杀；绘制时摘掉景物 */
  function arenaOn(g) {
    const T = g.terrain, o = S.origin, hd = g.renderer?.hd;
    // 1.3.3：立体画面里台悬在高空（云海上），台下的原地形不动；没有立体画面（2D 画法）、浮空台建不起来时仍是原地拉平
    let sky = null;
    S.skyMesh = null;
    if (hd) {
      const lv = skyLevels(T, o.x, o.y);
      try { S.skyMesh = createSkyArena(hd, { x: o.x, y: o.y, top: lv.top, cloudY: lv.cloudY, a: ARENA_R, far: SKY_FAR, images: { stone: AR.stone, array: arrayImg, clouds: AR.clouds } }); }
      catch (err) { console.warn('[天工试场] 浮空演武台建不起来，退回贴地画法', err); S.skyMesh = null; }
      if (S.skyMesh) sky = lv;
    }
    const height = sky ? sky.top : typeof T.surfaceHeight === 'function' ? T.surfaceHeight(o.x, o.y) : 0;
    const far2 = SKY_FAR * SKY_FAR, ramp0 = SKY_FAR * SKY_RAMP;
    /** 云海这一圈里吗（台心起算）。立体画面才有；2D 画法只有台面那一块 */
    const inSky = (x, y) => { if (!S.arena) return false; if (!sky) return inArena(x, y); const dx = x - o.x, dy = y - o.y; return dx * dx + dy * dy < far2; };
    /** 云海上的「地面」：台面海拔；最外的一段缓缓降回原地形（往外飞就穿过云层落回人间） */
    const skyH = (x, y, orig) => {
      const d = Math.hypot(x - o.x, y - o.y); if (d <= ramp0) return height;
      const k = Math.min(1, (d - ramp0) / (SKY_FAR - ramp0)), w = 1 - k * k * (3 - 2 * k);
      const h0 = orig(); return h0 + (height - h0) * w;
    };
    S.sky = sky ? { ...sky, top: height } : null;
    // 台上处处可走；台外是云海——走不过去，只能御剑飞；飞出云海这一圈就是原来的世界
    patch(T, 'walkFactor', (f) => function (x, y) { return inSky(x, y) ? (inArena(x, y) ? 1 : 0) : f.call(this, x, y); });
    patch(T, 'isLand', (f) => function (x, y) { return inSky(x, y) ? inArena(x, y) : f.call(this, x, y); });
    patch(T, 'inLocZone', (f) => function (x, y, pad) { return inSky(x, y) ? null : f ? f.call(this, x, y, pad) : null; });
    // 1.3.5：原版（平面画面）的地形没有 surfaceHeight / surface，这两处只在有的时候改
    if (typeof T.surfaceHeight === 'function') patch(T, 'surfaceHeight', (f) => function (x, y) { return inArena(x, y) ? height : sky && inSky(x, y) ? skyH(x, y, () => f.call(this, x, y)) : f.call(this, x, y); });
    if (T.surface && typeof T.surface.sample === 'function') patch(T.surface, 'sample', (f) => function (x, y) {
      if (inArena(x, y)) return { height, slope: 0, walkable: true };
      if (sky && inSky(x, y)) return { height: skyH(x, y, () => f.call(this, x, y).height), slope: 0, walkable: false };
      return f.call(this, x, y);
    });
    if (typeof T.canTraverse === 'function') patch(T, 'canTraverse', (f) => function (ax, ay, bx, by) { return inArena(ax, ay) ? inArena(bx, by) : f.call(this, ax, ay, bx, by); });
    if (hd) { patch(hd.buildings.group, 'visible', () => false); if (!sky) hd.invalidateTerrain?.(); }
    // 主角周围那张近地雾气贴图：在匀净的青石台面上会露出方边，台上不画。
    // 1.3.3：不能只把它停掉——P8 起立体画面的后期按世界坐标贴这张图、出界的地方取图边的颜色；停掉后它一直是入阵前（瞬移之前）
    // 那一帧的「未探迷雾」，图边的白雾被拉满整个画面（用户看到的满屏灰白）。改成每帧清空：后期贴上去的是一张透明图
    const Rr = g.renderer;
    if (Rr && typeof Rr.drawAtmosphere === 'function') patch(Rr, 'drawAtmosphere', () => function () {
      const a = this.atmoCtx, c = this.atmo; if (a && c) { a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, c.width, c.height); }
      this.atmoReady = true;
    });
    // 1.3.3：野草在立体画面里是直接摆进图集的立板（不经绘制表），云海这一圈里不长草
    if (Rr && typeof Rr.drawGrass === 'function') patch(Rr, 'drawGrass', (f) => function (...a) { if (!inSky(g.player.x, g.player.y)) return f.apply(this, a); });
    // 1.3.3：台底下原有的名地（古战场、迷雾谷……）不起雾、不压神识、不标名字；名山瀑布的名字、雾也不画
    const L = g.landmarks;
    if (L && typeof L.update === 'function') patch(L, 'update', (f) => function (dt) { if (!inSky(g.player.x, g.player.y)) return f.call(this, dt); this.cur = null; this.mist = 0; this.senseK = 1; });
    if (L && typeof L.drawOver === 'function') patch(L, 'drawOver', (f) => function (...a) { if (!inSky(g.player.x, g.player.y)) return f.apply(this, a); });
    const SC = g.scenery;
    if (SC && typeof SC.drawOver === 'function') patch(SC, 'drawOver', (f) => function (...a) { if (!inSky(g.player.x, g.player.y)) return f.apply(this, a); });
    // 1.3.3：近战打得碎的礁石、巨石、枯树、船骸（breakables.ts）按原地形摆在人身边——云海这一圈里不摆，摆过的收掉重摆
    const brk = g.combat?.brawl?.brk;
    if (sky && brk && typeof brk.fill === 'function') {
      patch(brk, 'fill', (f) => function (...a) { const out = f.apply(this, a); return Array.isArray(out) ? out.filter((r) => !inSky(r.x, r.y)) : out; });
      try { brk.reset(); } catch { /* */ }
    }
    patch(g, 'revealAll', () => true);
    // 台底下原有的灵草矿脉：看不见也采不到
    if (g.nodes?.nearest) patch(g.nodes, 'nearest', (f) => function (x, y, r, day) { return S.arena ? null : f.call(this, x, y, r, day); });
    g.player.flying = false;
  }
  /** 浮空台上：被击飞、挪开的人落回台沿以内（御剑的主角、会飞的妖兽不管） */
  function keepOnArena(g) {
    if (!S.arena || !S.sky) return;
    const a = ARENA_R - 30, o = S.origin;
    const clampXY = (e) => {
      let dx = e.x - o.x, dy = e.y - o.y;
      const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
      let ax = Math.min(Math.abs(dx), a), ay = Math.min(Math.abs(dy), a);
      const over = ax + ay - a * OCT; if (over > 0) { ax = Math.max(0, ax - over / 2); ay = Math.max(0, ay - over / 2); }
      if (ax === Math.abs(dx) && ay === Math.abs(dy)) return false;
      e.x = o.x + sx * ax; e.y = o.y + sy * ay; return true;
    };
    const far = (e) => Math.hypot(e.x - o.x, e.y - o.y) > SKY_FAR * SKY_RAMP;
    const P = g.player;
    if (!P.flying && !far(P) && clampXY(P) && P.st) { P.st.x = P.x; P.st.y = P.y; }
    for (const e of [...g.combat.enemies, ...g.combat.allies]) {
      if (e.dead || e.gone || e.__shThumb || e.def?.flying || far(e)) continue;
      if (clampXY(e)) { if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; } const ob = objOf(e); if (ob && (ob.noAI || ob.frozen || ob.team === 'dummy')) ob.hold = { x: e.x, y: e.y }; }
    }
    const pe = g.pets?.ent; if (pe && !far(pe)) clampXY(pe);
  }
  /** 渲染器收集绘制表：缩略图摘取、体型缩放、演武台景物过滤 */
  function hookCollect() {
    const Hh = H(); if (!Hh?.collect) return;
    patch(Hh, 'collect', (o) => function (list) {
      const r = o.call(this, list);
      if (!S.active) return r;
      try { thumbs.collect(list); } catch { /* */ }
      // 体型缩放：按纵坐标认出单位那一项，套一层缩放
      const big = []; for (const ob of S.objs.values()) if (ob.scale && ob.scale !== 1 && alive(ob)) big.push(ob);
      if (big.length) for (const it of list) for (const ob of big) {
        const e = ob.e; if (it.y !== e.y && it.y !== e.y + AIR_Y) continue;
        const d = it.draw, k = ob.scale; it.draw = (c) => { c.save(); c.translate(e.x, e.y); c.scale(k, k); c.translate(-e.x, -e.y); d(c); c.restore(); };
      }
      if (G().renderer?.hd && S.hud) {
        for (const ob of S.objs.values()) {
          if (!alive(ob)) continue;
          const e = ob.e, k = ob.scale ?? 1, col = TEAM_COL[ob.team];
          const mark = ob.team === 'dummy' ? '桩' : ob.noAI ? '止' : ob.frozen ? '定' : ob.follow ? '随' : '';
          if (mark) list.push({ y: e.y, hx: e.x, hy: e.y, hb: [0, 55 * k + 20, -24, 20], draw: (c) => { c.save(); c.globalAlpha = 0.75; c.fillStyle = `rgb(${col})`; c.font = '600 18px "Ma Shan Zheng", serif'; c.textAlign = 'center'; c.fillText(mark, e.x + 30 * k, e.y + 6); c.restore(); } });
        }
        if (S.place && S.mouse) {
          const { x, y } = S.mouse, n = S.opt.count, label = `${S.place.name}${n > 1 ? ' ×' + n : ''}`, top = 60 + 8 * Math.sqrt(n);
          list.push({ y, hx: x, hy: y, hb: [-200, 200, -top - 28, -top + 8], draw: (c) => { c.save(); c.font = '600 20px "Ma Shan Zheng", serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(30,24,16,0.75)'; c.fillStyle = '#f3e7c8'; c.strokeText(label, x, y - top); c.fillText(label, x, y - top); c.restore(); } });
        }
      }
      if (S.arena) {
        let w = 0; for (const d of list) if (!HIDE.has(d.k)) list[w++] = d; list.length = w;
        list.push({ y: -1e12, k: 'D·试场地面', draw: drawGround });
        const v = G().renderer?.viewRect?.();
        for (const q of props()) {
          if (!ready(q.im) || (v && (q.x < v.left - 300 || q.x > v.right + 300 || q.y < v.top - 50 || q.y - q.h > v.bottom + 50))) continue;
          const wd = q.h * q.im.naturalWidth / q.im.naturalHeight;
          list.push({ y: q.y, k: 'D·演武台摆设阴影', draw: (c) => { c.save(); c.globalAlpha = 0.25; c.fillStyle = '#1d1e1a'; c.beginPath(); c.ellipse(q.x, q.y, wd * 0.42, wd * 0.13, 0, 0, Math.PI * 2); c.fill(); c.restore(); } });
          list.push({ y: q.y, hx: q.x, hy: q.y, hb: [-wd / 2 - 4, wd / 2 + 4, -q.h, wd * 0.14 + 4], k: 'D·演武台摆设', draw: (c) => { c.save(); c.globalAlpha = 1; c.drawImage(q.im, q.x - wd / 2, q.y - q.h * 0.97, wd, q.h); c.restore(); } });
        }
      }
      return r;
    });
  }
  /** 云上演武台：底下云海缓缓流动；八角青石台（带台身侧壁与投影）；台心刻阵；台沿石栏 */
  function drawGround(c) {
    const g = G(), z = g.cam.zoom || 1, t = performance.now() / 1000, o = S.origin, a = ARENA_R;
    const v = g.renderer?.viewRect?.() ?? { left: g.cam.x - 1600, top: g.cam.y - 1000, right: g.cam.x + 1600, bottom: g.cam.y + 1000 };
    const L = v.left - 60, T0 = v.top - 60, W = v.right - v.left + 120, Hh = v.bottom - v.top + 120;
    const profiler = window.__prof, hd = g.renderer?.hd, stage = g.renderer?.stage;
    const revision = (ready(AR.stone) ? 1 : 0) + (ready(arrayImg) ? 2 : 0);
    let mark = profiler?.t() ?? 0;
    c.save();
    if (S.skyMesh) {
      // 1.3.3 浮空台：台面、台身、云海都是立体网格（sky-arena.js）。地贴只留给台上的影子、光圈、法术的地面效果——
      // 先清掉此前画进来的原地形地面（草、名地、城镇铺装），它们会经地贴贴到台面上
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
      S.skyMesh.update(t);
      c.restore(); profiler?.add('试场·浮空台', mark);
      return;
    }
    if (stage && !stage.lost && hd?.setGroundBackdrop) {
      // 旧地面会盖掉此前画入的水波与影子，裁剪区外的立板图集不能清除。
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
      const image = arenaFloor.prepare(c, revision), cloud = ready(AR.clouds) ? AR.clouds : null;
      hd.setGroundBackdrop({ canvas: image.canvas, version: image.version, left: o.x + image.left, top: o.y + image.top, width: image.width, height: image.height,
        cloud, cloudWidth: 1100, cloudHeight: cloud ? 1100 * cloud.naturalHeight / cloud.naturalWidth : 1100, cloudX: t * 14 % 1100, cloudY: t * 5 % 1100 });
      profiler?.add('试场·GPU底图准备', mark); mark = profiler?.t() ?? 0;
    } else {
      c.fillStyle = '#c9cdc8'; c.fillRect(L, T0, W, Hh);
      const cp = pattern(c, AR.clouds);
      if (cp) {
        const k = 1100 / (AR.clouds.naturalWidth || 1024), m = c.getTransform(), inset = 2 / Math.hypot(m.a, m.b);
        c.save();
        c.beginPath(); c.rect(L - 2200, T0 - 2200, W + 4400, Hh + 4400);
        const hole = octPts(a - inset, o.x, o.y);
        hole.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
        c.clip('evenodd');
        c.translate(t * 14 % 1100, t * 5 % 1100); c.scale(k, k); c.fillStyle = cp;
        c.fillRect((L - 1100) / k, (T0 - 1100) / k, (W + 2200) / k, (Hh + 2200) / k); c.restore();
      }
      profiler?.add('试场·云海', mark); mark = profiler?.t() ?? 0;
      arenaFloor.draw(c, o.x, o.y, revision);
      profiler?.add('试场·静态台面', mark); mark = profiler?.t() ?? 0;
    }
    c.lineJoin = 'round';
    c.strokeStyle = 'rgba(230,226,210,0.35)'; c.lineWidth = 3 / z; octPath(c, octPts(a - 64, o.x, o.y)); c.stroke();
    c.strokeStyle = 'rgba(40,42,36,0.55)'; c.lineWidth = 2 / z; octPath(c, octPts(a, o.x, o.y)); c.stroke();
    c.strokeStyle = 'rgba(60,62,56,0.35)'; c.lineWidth = 3 / z; octPath(c, octPts(a * 0.56, o.x, o.y)); c.stroke();
    c.restore();
    profiler?.add('试场·描边', mark);
  }
  function drawPlatform(c) {
    const a = ARENA_R, o = { x: 0, y: 0 }, top = octPts(a, 0, 0);
    c.fillStyle = 'rgba(40,46,52,0.22)'; octPath(c, top.map(([x, y]) => [x + 40, y + 230])); c.fill();
    c.fillStyle = '#55584f'; octPath(c, top.map(([x, y]) => [x, y + 120])); c.fill();
    c.fillStyle = '#6c6f66'; octPath(c, top.map(([x, y]) => [x, y + 56])); c.fill();
    const sp = pattern(c, AR.stone);
    octPath(c, top); c.fillStyle = '#8e928a'; c.fill();
    if (sp) { c.save(); octPath(c, top); c.clip(); const k = 360 / (AR.stone.naturalWidth || 1024); c.translate(o.x, o.y); c.scale(k, k); c.fillStyle = sp; c.fillRect(-a * 1.2 / k, -a * 1.2 / k, a * 2.4 / k, a * 2.4 / k); c.restore(); }
    if (ready(arrayImg)) { c.save(); octPath(c, top); c.clip(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.28; c.drawImage(arrayImg, o.x - a * 0.5, o.y - a * 0.5, a, a); c.restore(); }
    c.lineJoin = 'round';
    c.strokeStyle = '#6a6d64'; c.lineWidth = 64; octPath(c, octPts(a - 32, o.x, o.y)); c.stroke();
  }
  function findTown(g) {
    const map = (() => { try { return new URLSearchParams(location.search).get('map') || localStorage.getItem(PFX + '.map') || 'tiannan'; } catch { return 'tiannan'; } })();
    const p = g.player, WS = 300;
    let best = null, bd = Infinity;
    for (const l of api.world.locations()) {
      if ((l.map ?? 'tiannan') !== map || !['city', 'town'].includes(l.type)) continue;
      const d = Math.hypot(l.x * WS - p.x, l.y * WS - p.y); if (d < bd) { bd = d; best = l; }
    }
    if (!best) return null;
    const x = best.x * WS, y = best.y * WS + 260;
    const q = g.findLand?.(x, y) ?? { x, y };
    return { x: q.x, y: q.y, name: best.name };
  }

  // ---------------------------------------------------------------- 单位
  let Ecls = null;
  function enemyClass(g) {
    if (Ecls) return Ecls;
    if (!g) return null;
    const C = g.combat, any = C.enemies.find((e) => !e.__shThumb) ?? C.allies[0];
    if (any) return (Ecls = any.constructor);
    const n = C.enemies.length; g.debugSpawn([U.ENEMY_LIST[0].id], 1, 0, 99999);
    const e = C.enemies.splice(n)[0]; return (Ecls = e?.constructor ?? null);
  }
  /** 多只时排成葵花阵（越往外越疏），纵向压扁贴合俯视角 */
  function formation(n, x, y) {
    const out = []; if (n <= 1) return [{ x, y }];
    for (let i = 0; i < n; i++) { const r = 58 * Math.sqrt(i + 0.5), a = i * 2.39996; out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.72 }); }
    return out;
  }
  const byRef = (ref) => { for (const o of S.objs.values()) if (o.e.id === ref) return o; return null; };
  const alive = (o) => o && !o.e.dead && !o.e.gone;
  const objOf = (e) => { for (const o of S.objs.values()) if (o.e === e) return o; return null; };
  function setTeam(o, team) {
    const C = G().combat, e = o.e;
    let i = C.enemies.indexOf(e); if (i >= 0) C.enemies.splice(i, 1);
    i = C.allies.indexOf(e); if (i >= 0) C.allies.splice(i, 1);
    e.ally = false; e.busy = false; e.aggro = false; e.tgE = undefined;
    if (team === 'ally') { e.ally = true; e.hx = e.x; e.hy = e.y; C.allies.push(e); }
    else { C.enemies.push(e); if (team === 'foe') e.aggro = !o.noP; else e.busy = true; }
    o.team = team; o.hold = { x: e.x, y: e.y };
  }
  const FLAGS = ['noAI', 'frozen', 'noP', 'follow', 'corpse'];
  function make(defId, x, y, o) {
    const g = G(), def = U.ENEMIES[defId], E = enemyClass(g); if (!def || !E) return null;
    const e = new E(def, x, y, o.realm, o.stage);
    e.hx = x; e.hy = y;
    const ob = { id: 'S' + (++S.seq), e, def, team: o.team, hold: { x, y }, dmg: 0, hits: [], born: now(), scale: o.scale ?? 1 };
    for (const k of FLAGS) ob[k] = !!o[k];
    if (ob.noP) e.noP = true;
    S.objs.set(ob.id, ob); setTeam(ob, o.team);
    if (o.stats) applyStats(ob, o.stats);
    return ob;
  }
  function spawn(defId, x, y, o = S.opt, quiet = false) {
    const def = U.ENEMIES[defId]; if (!def) return [];
    const opt = o.follow ? { ...o, team: 'ally' } : o;
    const made = [];
    for (const p of formation(opt.count ?? 1, x, y)) { const ob = make(defId, p.x, p.y, opt); if (ob) { made.push(ob); ripple(p.x, p.y, TEAM_COL[opt.team], 90); } }
    if (!made.length) { log('刷不出来：没有拿到战斗单位的构造', 'bad'); return []; }
    const ids = made.map((m) => m.id);
    if (!quiet) { pushUndo(`放置 ${def.name}×${ids.length}`, () => ids.forEach((id) => remove(id, true))); log(`放置 ${def.name} ×${ids.length} · ${realmName(U, opt.realm, opt.stage)} · ${TEAM_NAME[opt.team]}${opt.follow ? ' · 随行' : ''}`); }
    ui?.recent?.('beast', defId);
    ui?.objs();
    return ids;
  }
  function snap(o) { const e = o.e; const s = { defId: o.def.id, x: e.x, y: e.y, realm: e.realm, stage: e.stage, team: o.team, scale: o.scale ?? 1, stats: { hp: e.hp, maxHp: e.maxHp, atk: e.atk, dfn: e.dfn, speed: e.speed } }; for (const k of FLAGS) s[k] = !!o[k]; return s; }
  function remove(id, quiet = false) {
    if (String(id).startsWith('npc:')) { dropNpc(String(id).slice(4)); return; }
    const o = S.objs.get(id); if (!o) return;
    const C = G().combat, e = o.e;
    // 1.3.8：试场召来的人正在切磋——移除就是把这个人移出试场
    if (e.npcId && S.npcMine.has(e.npcId)) { if (quiet) releaseNpc(e.npcId); else dropNpc(e.npcId); return; }
    let i = C.enemies.indexOf(e); if (i >= 0) C.enemies.splice(i, 1);
    i = C.allies.indexOf(e); if (i >= 0) C.allies.splice(i, 1);
    if (C.lock === e) C.lock = null;
    e.gone = true;   // 让接管它的框架（如 DrG 傀儡）立刻放手
    S.objs.delete(id); if (S.sel === id) select(null);
    if (!quiet) {
      pushUndo(`移除 ${o.def.name}`, () => { e.gone = false; S.objs.set(id, o); setTeam(o, o.team); select(id); });
      log(`移除 ${o.def.name}`);
    }
    ui?.objs();
  }
  function duplicate(id) {
    const o = S.objs.get(id); if (!alive(o)) return;
    const s = snap(o); s.x += 70; s.y += 36;
    const n = make(s.defId, s.x, s.y, s); if (!n) return;
    ripple(n.e.x, n.e.y, TEAM_COL[n.team], 90);
    pushUndo(`复制 ${o.def.name}`, () => remove(n.id, true)); select(n.id); log(`复制 ${o.def.name}`); ui?.objs();
  }
  function applyStats(o, st) {
    const e = o.e;
    for (const k of ['maxHp', 'atk', 'dfn', 'speed']) if (Number.isFinite(st[k])) e[k] = Math.max(k === 'maxHp' ? 1 : 0, st[k]);
    if (Number.isFinite(st.hp)) e.hp = Math.max(0, Math.min(e.maxHp, st.hp));
  }
  function setFlag(o, k, v) {
    const e = o.e; o[k] = !!v;
    if (k === 'noP') { e.noP = !!v; if (v && e.tgP) e.aggro = false; else if (!v && o.team === 'foe') e.aggro = true; }
    if (k === 'noAI' || k === 'frozen') { o.hold = { x: e.x, y: e.y }; if (!v && !o.noAI) { e.busy = o.team === 'dummy'; e.aggro = o.team === 'foe' && !o.noP; } }
    if (k === 'follow' && v && o.team !== 'ally') setTeam(o, 'ally');
  }
  const FLAG_NAME = { noAI: 'AI', frozen: '定身', noP: '无视主角', follow: '随行', corpse: '保留尸体' };
  /** 改单位 / 主角的一项（带撤销） */
  function edit(target, key, val) {
    const g = G();
    if (target === 'player') {
      const h = g.hero, before = { realm: h.realm, stage: h.stage, exp: h.exp, hp: h.hp, mp: h.mp };
      if (key === 'realm' || key === 'stage') { face?.setRealm(key === 'realm' ? val : h.realm, key === 'stage' ? val : (key === 'realm' ? 0 : h.stage)); h.exp = before.exp; }
      else if (key === 'hp' || key === 'mp') h[key] = Math.max(0.01, Math.min(1, val));
      else if (key === 'exp') h.exp = Math.max(0, val);
      pushUndo(`改主角 ${key}`, () => { face?.setRealm(before.realm, before.stage); Object.assign(h, before); });
      g.updateUI?.(true); ui?.insp(); return;
    }
    const o = S.objs.get(target); if (!alive(o)) return;
    const e = o.e;
    if (key === 'team') { const old = o.team, fol = o.follow; if (val !== 'ally') o.follow = false; setTeam(o, val); pushUndo(`改立场`, () => { o.follow = fol; setTeam(o, old); }); log(`${o.def.name} → ${TEAM_NAME[val]}`); }
    else if (FLAGS.includes(key)) { const old = !!o[key], oldTeam = o.team; setFlag(o, key, val); pushUndo(`${FLAG_NAME[key]} ${o.def.name}`, () => { if (o.team !== oldTeam) setTeam(o, oldTeam); setFlag(o, key, old); }); log(`${o.def.name} · ${FLAG_NAME[key]}${key === 'noAI' ? (val ? '关' : '开') : val ? '' : '（撤）'}`); }
    else if (key === 'scale') { const old = o.scale ?? 1; o.scale = Math.max(0.2, Math.min(5, +val || 1)); pushUndo(`体型 ${o.def.name}`, () => { o.scale = old; }); }
    else if (key === 'realm' || key === 'stage') {
      const s = snap(o), r = key === 'realm' ? val : e.realm, st = key === 'stage' ? val : (key === 'realm' ? Math.min(e.stage, (U.REALMS[val]?.stages?.length ?? 1) - 1) : e.stage);
      const n = make(o.def.id, e.x, e.y, { ...s, realm: r, stage: st, stats: undefined });
      if (!n) return; remove(o.id, true); select(n.id);
      pushUndo('改境界', () => { remove(n.id, true); e.gone = false; S.objs.set(o.id, o); setTeam(o, o.team); select(o.id); });
    } else {
      const old = { hp: e.hp, maxHp: e.maxHp, atk: e.atk, dfn: e.dfn, speed: e.speed };
      applyStats(o, { [key]: val });
      pushUndo(`改 ${o.def.name}`, () => applyStats(o, old));
    }
    ui?.insp(); ui?.objs();
  }
  function select(id) {
    S.sel = id;
    const o = id && !String(id).includes(':') && id !== 'player' && id !== 'pet' ? S.objs.get(id) : null;
    if (o && !o.e.dead) { try { G().combat.lock = o.team === 'ally' ? G().combat.lock : o.e; } catch { /* */ } }
    ui?.insp(); ui?.objs();
  }
  function clearAll() {
    const mine = [...S.npcMine.entries()];
    const all = [...S.objs.values()].filter((o) => alive(o) && !(o.e.npcId && S.npcMine.has(o.e.npcId))), corpses = S.corpses.splice(0);
    for (const id of [...S.objs.keys()]) remove(id, true);
    for (const [nid] of mine) releaseNpc(nid);   // 1.3.8：召来的人物一并送走
    const n = all.length + mine.length;
    if (n || corpses.length) pushUndo(`清场（${n}）`, () => {
      for (const o of all) { o.e.gone = false; S.objs.set(o.id, o); setTeam(o, o.team); }
      for (const [nid, rec] of mine) { S.npcMine.set(nid, rec); if (!face?.follow(nid, true)) S.npcMine.delete(nid); }
      S.corpses.push(...corpses); ui?.objs();
    });
    log(`清场：撤下 ${n} 个单位${corpses.length ? `、${corpses.length} 具尸身` : ''}`); ui?.objs();
  }
  function heal(target) {
    const g = G();
    if (target === 'player') { g.hero.hp = g.hero.mp = 1; for (const k of Object.keys(g.combat.pst)) delete g.combat.pst[k]; log('主角气血法力回满、异常尽消'); }
    else { const o = S.objs.get(target); if (!alive(o)) return; o.e.hp = o.e.maxHp; for (const k of Object.keys(o.e.st)) delete o.e.st[k]; o.dmg = 0; o.hits = []; log(`${o.def.name} 回满`); }
    ui?.insp();
  }
  function bringHere(target) { const o = S.objs.get(target); if (!alive(o)) return; const p = G().player, old = { x: o.e.x, y: o.e.y }; moveTo(o, p.x + 140, p.y + 20); pushUndo('挪到身旁', () => moveTo(o, old.x, old.y)); }
  function moveTo(o, x, y) { const e = o.e; e.x = x; e.y = y; e.hx = x; e.hy = y; o.hold = { x, y }; if (e.cs) { e.cs.x = x; e.cs.y = y; } }
  /** 世界原有的战斗单位（野怪、追兵、同阵修士、DrG 傀儡……）：点到就收进试场，从此能改能撤 */
  function adopt(e, team) {
    if (!e || e.__shThumb) return null;
    const had = objOf(e); if (had) return had;
    const ob = { id: 'S' + (++S.seq), e, def: e.def, team, hold: { x: e.x, y: e.y }, dmg: 0, hits: [], born: now(), ext: true, scale: 1 };
    for (const k of FLAGS) ob[k] = false;
    S.objs.set(ob.id, ob); ripple(e.x, e.y, TEAM_COL[team], 90); return ob;
  }

  // ---------------------------------------------------------------- 万物属性：改动、原值、数据表还原
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function dataRef(table, id) {
    if (RAW_TABLE[table]) return U[RAW_TABLE[table]]?.[id] ?? null;
    try { return api.data.get(table, id) ?? null; } catch { return null; }
  }
  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  /** 改数据表一处（第一次改时记下这一项顶层的原貌，出场整块放回） */
  function dataSet(table, id, path, v) {
    const top = path.split('.')[0], key = `${table}\u0001${id}\u0001${top}`;
    if (RAW_TABLE[table]) {
      const ref = dataRef(table, id); if (!ref) return;
      if (!S.dataOrig.has(key)) S.dataOrig.set(key, { had: Object.prototype.hasOwnProperty.call(ref, top), v: clone(ref[top]) });
      const parts = path.split('.'), last = parts.pop();
      if (path === 'status.k' && (v === '' || v == null)) { delete ref.status; return; }
      let o = ref; for (const k of parts) { if (o[k] == null || typeof o[k] !== 'object') o[k] = path.startsWith('status.') ? { k: 'burn', dur: 2, ch: 0.5 } : {}; o = o[k]; }
      if (v === undefined || v === '' && last === 'element') delete o[last]; else o[last] = v;
      return;
    }
    // 功法、灵宠种类：走正规的数据接口（拿到的是副本）
    const cur = dataRef(table, id); if (!cur) return;
    if (!S.dataOrig.has(key)) S.dataOrig.set(key, { had: top in cur, v: clone(cur[top]), patch: true });
    api.data.patch(table, id, { [top]: v === undefined ? (typeof cur[top] === 'boolean' ? false : 0) : v });
  }
  function dataRestore() {
    for (const [key, o] of S.dataOrig) {
      const [table, id, top] = key.split('\u0001');
      try {
        if (o.patch) { api.data.patch(table, id, { [top]: o.had ? o.v : (typeof o.v === 'boolean' ? false : 0) }); continue; }
        const ref = dataRef(table, id); if (!ref) continue;
        if (o.had) ref[top] = o.v; else delete ref[top];
      } catch (err) { console.warn('[天工试场] 还原数据表出错', key, err); }
    }
    S.dataOrig.clear();
  }
  const sameV = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(a)) : a === b);
  /** 属性表改一项：进撤销栈，记原值（「恢复原值」用） */
  function setField(key, f, v) {
    const old = f.get();
    if (sameV(old, v)) return;
    const ok = `${key}|${f.k}`; if (!S.orig.has(ok)) S.orig.set(ok, old);
    try { f.set(v); } catch (err) { log(`改不动：${err?.message ?? err}`, 'bad'); return; }
    if (!f.raw) pushUndo(`改 ${f.label}`, () => { try { f.set(old); } catch { /* */ } });
    G()?.updateUI?.(true);
    ui?.insp();
  }
  const origOf = (key, f) => S.orig.get(`${key}|${f.k}`);
  const changed = (key, f) => { const k = `${key}|${f.k}`; return S.orig.has(k) && !sameV(S.orig.get(k), f.get()); };
  function resetField(key, f) { const k = `${key}|${f.k}`; if (!S.orig.has(k)) return; setField(key, f, S.orig.get(k)); }
  function resetAll(key) {
    const sh = propsys.sheet(key); if (!sh) return;
    let n = 0; for (const gr of sh.groups) for (const f of gr.fields) if (changed(key, f)) { resetField(key, f); n++; }
    log(n ? `${sh.title}：${n} 项恢复原值` : `${sh.title}：没有改过`, n ? 'good' : 'info');
  }

  // ---------------------------------------------------------------- 法宝匣的其它动作
  function give(id, n) { const g = G(); g.debugGive(id, n); log(`领取 ${U.ITEMS[id]?.name ?? id} ×${n}`); ui?.recent?.('item', id); }
  function learn(id) { const ok = face?.learnArt(id); log(ok === false ? `${U.ARTS[id]?.name ?? id} 已会` : `习得 ${U.ARTS[id]?.name ?? id}`); ui?.recent?.('art', id); }
  function cast(id) { const g = G(); try { g.combat.cds?.delete(id); g.debugExec(id, 3); log(`施放 ${U.ARTS[id]?.name ?? id}`); ui?.recent?.('art', id); } catch (err) { log('施放失败：' + (err?.message ?? err), 'bad'); } }
  function gongfa(id) { try { face?.setGongfa(id); log(`改修 ${id}`); ui?.recent?.('gongfa', id); } catch (err) { log(String(err?.message ?? err), 'bad'); } }
  function petKinds() { try { return api.data.get('pets') ?? {}; } catch { return {}; } }
  function pet(kind, lv) {
    const g = G(), ws = g.ws; ws.pets ??= [];
    const k = petKinds()[kind] ?? {};
    const p = { kind, name: k.name ?? kind, lv: Math.max(1, Math.min(10, lv | 0)), xp: 0, bond: 100, born: g.day };
    if (ws.pets.length >= 4) ws.pets.splice(ws.petActive ?? 0, 1, p); else ws.pets.push(p);
    ws.petActive = ws.pets.indexOf(p); if (g.pets) g.pets.ent = null;
    log(`收养 ${p.name}（${p.lv} 级），已随行`); ui?.recent?.('pet', kind);
  }
  function status(kind, target, dur) {
    const g = G(), C = g.combat;
    if (!target || target === 'player') { C.applyStatus(C.pst, { k: kind, dur, ch: 1 }, (g.stats?.hp ?? 200) * 0.05, null, g.player.x, g.player.y); log(`主角 · ${STATUS[kind]} ${dur} 秒`); return; }
    const o = S.objs.get(target); if (!alive(o)) return;
    C.applyStatus(o.e.st, { k: kind, dur, ch: 1 }, o.e.maxHp * 0.06, o.e, g.player.x, g.player.y); log(`${o.def.name} · ${STATUS[kind]} ${dur} 秒`);
  }
  /**
   * 1.3.8：召来身旁、切磋一场的人收进试场（S.npcMine）：「不来路人」不清他，台上照常行动，切磋完回到身旁；
   * 移出试场 / 撤销时放回召来之前的去处。出阵读档，一切复原（阵里不存档）。
   */
  function npcAct(id, act) {
    if (act === 'drop') { dropNpc(id); return; }
    const fresh = !S.npcMine.has(id);
    try {
      if (fresh) claimNpc(id);
      let ok = false;
      if (act === 'call') { ok = !!face?.follow(id, true); log(ok ? `召来 ${npcName(id)}（会跟着你，按 E 交谈）` : `召不来 ${npcName(id)}`); }
      else if (act === 'spar') { ok = !!face?.spar(id); log(ok ? `与 ${npcName(id)} 切磋` : `${npcName(id)} 现在不能切磋`); }
      if (fresh && !ok) S.npcMine.delete(id);
      else if (fresh) pushUndo(`召来 ${npcName(id)}`, () => releaseNpc(id));
      ui?.recent?.('human', id); ui?.insp?.();
    } catch (err) { if (fresh) S.npcMine.delete(id); log(String(err?.message ?? err), 'bad'); }
  }
  /** 记下召来之前他在哪、要去哪（移出试场时放回去） */
  function claimNpc(id) {
    const d = G()?.npcs?.byId?.get(id); if (!d) return;
    S.npcMine.set(id, { x: d.x, y: d.y, tx: d.tx, ty: d.ty, goal: d.goal, home: d.home, hadMap: Object.prototype.hasOwnProperty.call(d, 'map'), map: d.map });
  }
  /** 移出试场：撤出战场、不再同行、从身旁收起，放回召来之前的去处 */
  function releaseNpc(id) {
    const g = G(), W = g?.npcs, m = S.npcMine.get(id); if (!m || !W) return;
    S.npcMine.delete(id);
    const C = g.combat;
    for (const e of [...C.enemies]) if (e.npcId === id) {
      const i = C.enemies.indexOf(e); if (i >= 0) C.enemies.splice(i, 1);
      if (C.lock === e) C.lock = null; e.gone = true;
      const o = objOf(e); if (o) { S.objs.delete(o.id); if (S.sel === o.id) select(null); }
    }
    try { W.dismiss(id); } catch { /* */ }
    W.active.delete(id); if (W.focus?.d?.id === id) W.focus = null;
    if (S.sel === 'npc:' + id) select(null);
    const d = W.byId.get(id);
    if (d) { d.x = m.x; d.y = m.y; d.tx = m.tx; d.ty = m.ty; d.goal = m.goal; d.home = m.home; if (m.hadMap) d.map = m.map; else delete d.map; }
    ui?.objs();
  }
  /** 「移出试场」（法宝匣、属性页、移除工具）：能撤销——撤销时再召回身旁 */
  function dropNpc(id) {
    if (!S.npcMine.has(id)) return false;
    const rec = S.npcMine.get(id), name = npcName(id), g = G();
    const ap = g?.npcs?.active?.get(id)?.st; if (ap) ripple(ap.x, ap.y, '168,53,42', 110);
    releaseNpc(id);
    pushUndo(`移出 ${name}`, () => { S.npcMine.set(id, rec); if (!face?.follow(id, true)) S.npcMine.delete(id); });
    log(`${name} 移出试场`);
    return true;
  }
  const npcName = (id) => G()?.npcs?.byId?.get(id)?.name ?? id;
  /** 1.3.4：撼山客 · 岳千钧——召到身旁 / 切磋 / 惹怒真打 / 对木桩演招（他只在南荒；不在世界名册里，用他自己的接口 game.hanshan） */
  function hanshanAct(act) {
    const g = G(), H = g?.hanshan; if (!H) { log('这一版游戏里没有撼山客', 'bad'); return; }
    const p = g.player, x = p.x + 280, y = p.y + 30;
    S.hsMine = true;
    try { H.s.met = true; H.s.spotted = true; } catch { /* */ }
    if (H.ent && H.mode !== 'calm' && act !== 'call') { try { H.toCalm(); } catch { /* */ } }
    if (H.ent) { const e = H.ent; e.x = e.hx = x; e.y = e.hy = y; if (e.cs) { e.cs.x = x; e.cs.y = y; } }
    else { H.place(x, y, 'stay'); try { H.tick(1 / 60); } catch (err) { log(`撼山客没能现身：${err?.message ?? err}`, 'bad'); } }
    const e = H.ent; if (!e) { log('撼山客没能现身——他只在南荒出没', 'bad'); S.hsMine = false; return; }
    // 收进试场（能点选、能撤）；立场只作标记，不交给试场按「木桩」钉住——他的走位和出手由他自己的编排管
    const ob = adopt(e, act === 'call' ? 'ally' : 'foe'); if (ob) ob.team = act === 'call' ? 'ally' : 'foe';
    try {
      if (act === 'spar') H.startSpar();
      else if (act === 'angry') H.provoke('hit');
      else if (act === 'demo') { const tg = H.startDemo('all'); const t2 = tg && adopt(tg, 'foe'); if (t2) t2.team = 'foe'; }   // 他召出的陪练也收进试场，免得被「不刷野怪」清走
    } catch (err) { log(String(err?.message ?? err), 'bad'); }
    pushUndo('召来撼山客', () => { try { H.despawn(); } catch { /* */ } if (ob) S.objs.delete(ob.id); S.hsMine = false; ui?.objs(); });
    log({ call: '撼山客到了身旁（按交谈键和他说话）', spar: '与撼山客切磋：他先让三招', angry: '撼山客动了真怒——他会真打', demo: '撼山客对着木桩一招招演给你看' }[act] ?? '撼山客', 'good');
    ui?.recent?.('human', 'hanshan'); ui?.objs();
  }
  /**
   * 1.3.9：噬魂魔尊 · 夜无赦——召来开打（人身打起 / 直接魔躯）、对木桩演招（人身 / 魔躯）。
   * 他是 B 版的世界首领：不在敌人表里，平时只在南荒陨魔谷外周期降临，用他自己的接口 game.yewushe（descendNow / engage / setForm / startDemo）。
   * 降在主角前面；降临的血光、吼声照放，但「四十日内不除他便遁回」那条提示和新闻不发（试场里没有期限）。
   * 他这次降临记在存档里：撤销 / 移除时放回召来之前的样子；出阵本来就读回入阵前的存档。
   */
  function yewusheAct(act) {
    const g = G(), Y = g?.yewushe; if (!Y) { log('这一版游戏里没有噬魂魔尊', 'bad'); return; }
    const p = g.player, demo = act === 'demo' || act === 'demoDemon';
    const old = S.ywsMine;
    const snap = old?.snap ?? (() => { try { return JSON.parse(JSON.stringify(Y.s)); } catch { return null; } })();
    if (old?.ob) S.objs.delete(old.ob.id);
    S.ywsMine = null;
    const at = { x: p.x + (demo ? 330 : 420), y: p.y - 40 };
    const mute = (k) => { const own = Object.prototype.hasOwnProperty.call(g, k), f = g[k]; g[k] = () => {}; return () => { if (own) g[k] = f; else delete g[k]; }; };
    const un = [mute('toast'), mute('news')];
    try { Y.tick(0); } catch { /* */ }   // 先让他认上当前这一局：刚开局还没走过一帧时，他第一帧会把手上的真身整个丢掉重来，召来的那个就成了没人管的空壳
    try { Y.descendNow(at, true); } catch (err) { log(`噬魂魔尊没能降临：${err?.message ?? err}`, 'bad'); } finally { un.forEach((f) => f()); }
    const e = Y.ent;
    if (!e) { restoreYws(Y, snap); log('噬魂魔尊没能降临——他只降在南荒', 'bad'); ui?.objs(); return; }
    const ob = adopt(e, 'foe'); if (ob) ob.team = 'foe';
    S.ywsMine = { ob, snap };
    try {
      if (demo) { const tg = Y.startDemo('all', act === 'demoDemon' ? 'demon' : 'human'); const t2 = tg && adopt(tg, 'foe'); if (t2) t2.team = 'foe'; }   // 他召出的木桩也收进试场，免得被「不刷野怪」清走
      else { Y.engage(); if (act === 'demon') { Y.setForm('demon'); e.hp = e.maxHp * 0.38; } }
    } catch (err) { log(String(err?.message ?? err), 'bad'); }
    pushUndo('召来噬魂魔尊', () => { const M = S.ywsMine; S.ywsMine = null; try { if (Y.ent === e) Y.despawn(false); } catch { /* */ } restoreYws(Y, M?.snap ?? snap); if (ob) S.objs.delete(ob.id); ui?.objs(); });
    log({ fight: '噬魂魔尊夜无赦提镰而来——气血七成、四成时两次变身', demon: '噬魂魔尊直接现出魔躯：全程霸体、会放觉醒大招', demo: '噬魂魔尊对着木桩把人身的招一招招演给你看', demoDemon: '噬魂魔尊现出魔躯，对着木桩把魔躯的招一招招演给你看' }[act] ?? '噬魂魔尊', 'good');
    ui?.recent?.('human', 'yewushe'); ui?.objs();
  }
  /** 把夜无赦的存档状态放回某一刻（就地改，别换对象：他的 s 是存档里的那一份） */
  function restoreYws(Y, snap) {
    if (!snap) return;
    try { const s = Y.s; for (const k of Object.keys(s)) if (!(k in snap)) delete s[k]; Object.assign(s, JSON.parse(JSON.stringify(snap))); } catch { /* */ }
  }
  /** 模组登记的试场工具（像 Garry's Mod 插件自带的工具）：跑一下，新冒出来的战斗单位都收进试场（可点选、可撤销） */
  function runTool(t, at, params) {
    const g = G(), C = g.combat, seen = new Set([...C.enemies, ...C.allies]);
    try { t.act({ game: g, mod: face, sandbox: ctx, at: at ?? S.mouse ?? { x: g.player.x + 240, y: g.player.y }, params: params ?? {} }); }
    catch (err) { log(`${t.name} 出错：${err?.message ?? err}`, 'bad'); return; }
    const ids = [...C.enemies, ...C.allies].filter((e) => !seen.has(e) && !e.__shThumb).map((e) => adopt(e, e.ally ? 'ally' : 'foe')?.id).filter(Boolean);
    if (ids.length) pushUndo(t.name, () => ids.forEach((id) => remove(id, true)));
    log(`${t.name}${ids.length ? `：${ids.length} 个单位入场` : ''}`); ui?.objs();
  }

  // ---------------------------------------------------------------- 试场：时间、天气、规则、预设场景
  const CTL_NAME = { god: '无敌', lock: '锁住气血', nocd: '无冷却', ai: '单位心智', infMp: '法力不耗', oneHit: '一击必杀', fly: '能飞', stealth: '不被发现', noSpawn: '不刷野怪', noNpc: '不来路人' };
  function setCtl(k, v) {
    S[k] = v;
    const g = G();
    if (k === 'paused') g.paused = !!v;
    if (k === 'ai' && v) for (const e of [...g.combat.enemies]) if (e.__shHold) { delete e.__shHold; const o = objOf(e); e.busy = o ? o.team === 'dummy' : false; e.aggro = o ? o.team === 'foe' && !o.noP : e.aggro; }
    if (k === 'weather') { try { face?.setWeather(v); } catch { /* */ } }
    if (k === 'stealth') { const B = g.combat?.buffs; if (B?.until) B.until.stealth = v ? g.time + 1 : 0; if (v) for (const e of g.combat.enemies) e.aggro = false; else for (const o of S.objs.values()) if (o.team === 'foe' && !o.noP && !o.noAI) o.e.aggro = true; }
    if (k === 'fly' && !v && g.player.flying && !g.canFlyNative) { try { g.toggleFly?.(); } catch { /* */ } }
    if (k === 'infMp' && v) g.hero.mp = 1;
    if (k === 'noSpawn' || k === 'noNpc') { saveQuiet(); if (v && S.active) clearPassers(g, k); }
    if (CTL_NAME[k]) log(`${CTL_NAME[k]}：${v ? '开' : '关'}`);
    if (k === 'speed') log(`模拟倍速 ×${v}`);
    ui?.dock(); ui?.insp();
  }
  function setClock(phase) { const g = G(); g.clock = Math.floor(g.clock / DAY_CYCLE) * DAY_CYCLE + phase * DAY_CYCLE; ui?.dock(); }
  function step() { if (!S.paused) setCtl('paused', true); S.step?.(); ui?.insp(); }
  const pickIds = (pred, n) => { const a = U.ENEMY_LIST.filter(pred); const out = []; for (let i = 0; i < n && a.length; i++) out.push(a[Math.floor(Math.random() * a.length)].id); return out; };
  function scene(id) {
    const g = G(), p = g.player, r = Math.max(1, g.hero.realm);
    const ids0 = new Set(S.objs.keys());
    const put = (defId, x, y, o) => make(defId, x, y, { count: 1, realm: r, stage: 2, team: 'foe', ...o });
    if (id === 'duel') { for (const [i, d] of pickIds((d) => d.kind === 'human', 3).entries()) put(d, p.x + 340, p.y - 120 + i * 120); log('斗法试场：三名同境修士'); }
    else if (id === 'dummy') {
      const d = pickIds((d) => d.kind === 'beast' && (d.hp ?? 1) >= 1, 1)[0];
      for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; const o = put(d, p.x + Math.cos(a) * 300, p.y + Math.sin(a) * 210, { team: 'dummy' }); if (o) applyStats(o, { maxHp: o.e.maxHp * 50, hp: o.e.maxHp * 50 }); }
      log('木桩阵：五具不还手、血量五十倍的木桩（属性表里看每秒伤害）');
    } else if (id === 'tide') { for (const [i, d] of pickIds((d) => d.kind !== 'human' && !d.lair, 16).entries()) { const a = i / 16 * Math.PI * 2; put(d, p.x + Math.cos(a) * 520, p.y + Math.sin(a) * 380, { realm: Math.max(1, r - 1) }); } log('妖兽潮：十六只低一境的妖兽围上来'); }
    else if (id === 'war') {
      const A = pickIds((d) => d.kind === 'human', 40), B = pickIds((d) => d.kind !== 'human' && !d.lair, 40);
      A.forEach((d, i) => put(d, p.x - 260 - (i % 8) * 70, p.y - 280 + Math.floor(i / 8) * 120, { team: 'ally' }));
      B.forEach((d, i) => put(d, p.x + 420 + (i % 8) * 70, p.y - 280 + Math.floor(i / 8) * 120));
      log('两军对垒：四十名友方修士对四十只妖兽（压力测试）');
    } else if (id === 'war1000') {
      for (const team of ['ally', 'foe']) for (const at of formation(500, p.x + (team === 'ally' ? -330 : 330), p.y)) {
        put('bandit', at.x, at.y, { team, realm: 2, stage: 1 });
      }
      log('千人混战：五百名友方修士对五百名敌方修士，均为筑基中期');
    } else if (id === 'guard') {
      for (const [i, d] of pickIds((d) => d.kind === 'human' && !d.evil, 4).entries()) put(d, p.x - 120 + i * 80, p.y + 120, { team: 'ally', follow: true });
      log('护法：四名友方修士随行护法');
    } else if (id === 'home') { const old = { x: p.x, y: p.y }; g.teleport(S.origin.x, S.origin.y); pushUndo('回到阵心', () => g.teleport(old.x, old.y)); log('回到阵心'); }
    const made = [...S.objs.keys()].filter((k) => !ids0.has(k));
    for (const k of made) { const o = S.objs.get(k); ripple(o.e.x, o.e.y, TEAM_COL[o.team], 80); }
    if (made.length) pushUndo('预设场景', () => made.forEach((k) => remove(k, true)));
    ui?.objs();
  }
  const presets = { list() { try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '[]'); } catch { return []; } }, save(a) { try { localStorage.setItem(PRESET_KEY, JSON.stringify(a)); } catch { /* */ } } };
  function savePreset(name) {
    const o = S.origin, a = presets.list().filter((x) => x.name !== name);
    a.unshift({ name, at: Date.now(), objs: [...S.objs.values()].filter((x) => alive(x) && !x.ext).map((x) => { const s = snap(x); return { ...s, x: s.x - o.x, y: s.y - o.y }; }), ctl: { god: S.god, lock: S.lock, nocd: S.nocd, ai: S.ai, speed: S.speed, infMp: S.infMp, oneHit: S.oneHit }, weather: S.weather, clock: G().dayPhase });
    presets.save(a.slice(0, 30)); log(`存为预设「${name}」（${a[0].objs.length} 个单位）`, 'good'); ui?.presets();
  }
  function loadPreset(name) {
    const P = presets.list().find((x) => x.name === name); if (!P) return;
    clearAll();
    const p = G().player;
    for (const s of P.objs) make(s.defId, p.x + s.x, p.y + s.y, s);
    for (const [k, v] of Object.entries(P.ctl ?? {})) S[k] = v;
    if (P.weather !== undefined) setCtl('weather', P.weather);
    if (Number.isFinite(P.clock)) setClock(P.clock);
    log(`载入预设「${name}」`, 'good'); ui?.objs(); ui?.dock();
  }
  function delPreset(name) { presets.save(presets.list().filter((x) => x.name !== name)); ui?.presets(); }

  // ---------------------------------------------------------------- 每帧：规则、守位、随行、尸身、统计
  let started = false;
  api.on('start', (g) => {
    face = g; started = true; titleHook.stop();
    // 从主界面「天工试场」进来的：进了游戏就直接入阵
    let boot = null; try { boot = JSON.parse(sessionStorage.getItem('shahe.boot') || 'null'); sessionStorage.removeItem('shahe.boot'); } catch { /* */ }
    if (boot && !S.active) setTimeout(() => { if (!enter(boot)) ui?.entered?.(); }, 350);
  });
  const SLOTS = ['_save_auto', '_save_1', '_save_2', '_save_3'].map((s) => PFX + s);
  const hasSave = () => { try { return SLOTS.some((k) => !!localStorage.getItem(k)); } catch { return false; } };
  /** 主界面入阵：记下选择 → 点「继续仙途」读最近的存档；没存档就开一局临时新游戏 */
  function bootFromTitle(opt) {
    const fresh = !hasSave();
    try { sessionStorage.setItem('shahe.boot', JSON.stringify({ ...opt, fresh })); } catch { /* */ }
    if (!fresh) {
      const btn = [...document.querySelectorAll('.title-menu button.menu-btn')].find((b) => b.textContent.replace(/[\s　]/g, '').startsWith('继续仙途'));
      if (btn && !btn.disabled) { btn.click(); return; }
    }
    try { const u = new URL(location.href); u.searchParams.set('auto', 'new'); location.href = u.toString(); } catch { /* */ }
  }
  // 主界面：在「继续仙途」下面加一枚「天工试场」
  const titleHook = (() => {
    if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return { stop() {} };
    let mine = null;
    const apply = () => {
      const menu = document.querySelector('.title-menu'); if (!menu || (mine && mine.isConnected)) return;
      const cont = [...menu.querySelectorAll('button.menu-btn')].find((b) => b.textContent.replace(/[\s　]/g, '').startsWith('继续仙途')); if (!cont) return;
      mine = document.createElement('button'); mine.className = 'menu-btn sh-title-btn'; mine.textContent = '天工试场'; mine.title = '沙盒模式：入阵演法试宝，出阵一切复原';
      mine.onclick = () => ui?.gate(true);
      cont.after(mine);
    };
    apply();
    const mo = new MutationObserver(apply); mo.observe(document.body, { childList: true, subtree: true });
    return { stop() { mo.disconnect(); }, resume() { apply(); mo.observe(document.body, { childList: true, subtree: true }); }, restore() { mo.disconnect(); mine?.remove(); } };
  })();
  // 1.3.2：在游戏里点「返回」回主界面时，游戏不发任何通知——试场的界面和改动原来一直挂着。这里隔一会儿看一眼：主界面出来了就收掉
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function' && typeof setInterval !== 'undefined') setInterval(() => {   // 1.3.3：无头测试里的假 document 没有 querySelector
    if (!started || !document.querySelector('.title-menu')) return;
    started = false;
    if (S.active) { try { teardown('回主界面'); } catch (err) { console.warn('[天工试场] 回主界面收场出错', err); } }
    else { try { ui?.exited?.(); } catch { /* */ } }
    titleHook.resume?.();
  }, 500);
  api.on('tick', (g, dt) => {
    face = g; started = true;
    if (!S.active) return;
    const game = G(), h = game.hero, C = game.combat, P = game.player;
    keepOnArena(game);
    // 1.3.4：开着「不刷野怪 / 不来路人」时每半息清一遍场——核心几十处刷怪口、别的模组（傀儡、神衣）生成的单位都算，试场自己落的子、你的同伴灵宠不动
    if ((S.noSpawn || S.noNpc) && (S.sweepT = (S.sweepT ?? 0) - dt) <= 0) { S.sweepT = 0.5; if (S.noSpawn) clearPassers(game, 'noSpawn'); if (S.noNpc) clearPassers(game, 'noNpc'); }
    if (S.lock) h.hp = 1;
    if (S.lock || S.infMp) h.mp = 1;
    if (S.nocd) { C.cds.clear(); }
    if (S.stealth && C.buffs?.until) C.buffs.until.stealth = Math.max(C.buffs.until.stealth ?? 0, game.time + 1);
    const t = now();
    let fi = 0;
    for (const o of [...S.objs.values()]) {
      const e = o.e;
      if (e.dead || e.gone || (!C.enemies.includes(e) && !C.allies.includes(e))) {
        if (!o.deadT) {
          o.deadT = t; log(e.spar && e.npcId && !e.gone ? `${e.name ?? o.def.name} 收手：切磋结束（承伤 ${Math.round(o.dmg)}）` : `${o.def.name} 倒下（承伤 ${Math.round(o.dmg)}）`); if (S.sel === o.id) select(null);
          if (o.corpse && e.dead && !e.gone) { S.corpses.push({ x: e.x, y: e.y, defId: o.def.id, name: o.def.name, scale: o.scale ?? 1, face: e.facing ?? 1, t: game.time }); if (S.corpses.length > 80) S.corpses.shift(); }
        }
        if (e.gone || t - o.deadT > 4000 || (!C.enemies.includes(e) && !C.allies.includes(e))) { S.objs.delete(o.id); ui?.objs(); }
        continue;
      }
      if (S.drag?.id === o.id) { moveTo(o, S.drag.x, S.drag.y); continue; }
      if (o.team === 'dummy' || o.noAI || !S.ai) hold(e, o.hold);
      else if (o.frozen) pin(e, o.hold);
      else o.hold = { x: e.x, y: e.y };
      if (o.follow && o.team === 'ally') {
        const a = (fi++) * 1.1 + 2.2, r = 130 + (fi % 3) * 40, hx = P.x + Math.cos(a) * r, hy = P.y + Math.sin(a) * r * 0.6;
        e.hx = hx; e.hy = hy;
        if (Math.hypot(e.x - P.x, e.y - P.y) > 1400) moveTo(o, hx, hy);
      }
      if (o.noP && e.tgP && e.aggro && !e.tgE) e.aggro = false;
      if (o.hits.length && t - o.hits[0][0] > 6000) o.hits = o.hits.filter((x) => t - x[0] < 6000);
    }
    if (!S.ai) for (const e of C.enemies) if (!e.dead && !objOf(e)) { e.__shHold ??= { x: e.x, y: e.y }; hold(e, e.__shHold); }
    for (const r of S.ripples) r.t += dt; S.ripples = S.ripples.filter((r) => r.t < r.dur);
  });
  function hold(e, p) { e.x = p.x; e.y = p.y; e.kx = 0; e.ky = 0; e.busy = true; e.aggro = false; e.cast = null; if (e.cs) { e.cs.x = p.x; e.cs.y = p.y; } }
  /** 定身：只钉住位置，照样出手 */
  function pin(e, p) { e.x = p.x; e.y = p.y; e.kx = 0; e.ky = 0; e.vx = 0; e.vy = 0; if (e.cs) { e.cs.x = p.x; e.cs.y = p.y; } }
  api.hook('spawn', (g, c) => { if (S.active && S.arena && inArena(c.x, c.y)) c.cancel = true; });   // 试场里不自然刷怪
  api.hook('damage', (g, c) => {
    if (!S.active) return;
    if (c.to === 'player') { if (S.god) { c.cancel = true; return; } return; }
    const o = byRef(c.ref);
    if (S.oneHit && c.to === 'enemy') {
      let e = o?.e; if (!e) for (const x of G().combat.enemies) if (x.id === c.ref) { e = x; break; }
      if (e && !e.ally) c.amount = Math.max(+c.amount || 0, (e.maxHp + e.dfn * 4) * 20 + 1e6);
    }
    if (!o) return;
    o.dmg += +c.amount || 0; o.hits.push([now(), +c.amount || 0]);
  });
  const dps = (o) => { const t = now(), a = o.hits.filter((x) => t - x[0] < 5000); if (!a.length) return 0; const span = Math.max(1, (t - a[0][0]) / 1000); return a.reduce((s, x) => s + x[1], 0) / Math.min(5, Math.max(span, 1)); };

  // ---------------------------------------------------------------- 世界里的指点：落子、点选、拖动、各工具
  /** 点到了什么：试场单位 / 世界原有的战斗单位 / 主角 / 灵宠 / 世界里的人物 */
  function hitAt(m, ev) {
    const g = G(), hd = ev && g.renderer?.hd, rect = g.canvas.getBoundingClientRect();
    const mouse = ev ? { x: ev.clientX - rect.left, y: ev.clientY - rect.top } : null;
    const distance = (x, y, height, lift = 0) => hd ? projectedDistance(hd, mouse, x, y, height + lift) : Math.hypot(x - m.x, y - height - m.y);
    const fat = ev?.pointerType === 'touch' ? 1.35 : 1;   // 1.3.7：手指比鼠标粗，点选范围放宽些
    let best = null, bd = 56 * fat;
    for (const o of S.objs.values()) { if (!alive(o)) continue; const k = o.scale ?? 1, d = distance(o.e.x, o.e.y, 34 * k, (o.e.lift || 0) + (o.e.flyH || 0) + (o.e.def.flying ? 120 : 0)) * 0.9 / Math.max(0.6, Math.sqrt(k)); if (d < bd) { bd = d; best = { k: o.id }; } }
    if (best) return best;
    for (const e of g.combat.units) { if (e.dead || e.gone || e.__shThumb) continue; const d = distance(e.x, e.y, 34, (e.lift || 0) + (e.flyH || 0) + (e.def.flying ? 120 : 0)) * 0.9; if (d < bd) { bd = d; best = { e }; } }
    if (best) return best;
    const p = g.player; if (distance(p.x, p.y, 40, p.st.lift) < 44 * fat) return { k: 'player' };
    const pe = g.pets?.ent; if (pe && distance(pe.x, pe.y, 24) < 40 * fat) return { k: 'pet' };
    for (const a of g.npcs?.active?.values?.() ?? []) { if (a.enemy) continue; const st = a.st; if (distance(st.x, st.y, 44, st.lift) < 42 * fat) return { k: 'npc:' + a.d.id }; }
    return null;
  }
  const keyOfHit = (h) => { if (!h) return null; if (h.k) return h.k; const o = adopt(h.e, h.e.ally ? 'ally' : 'foe'); ui?.objs(); return o?.id ?? null; };
  const isUnit = (k) => !!k && /^S\d+$/.test(k);
  /** 左键在世界里：按当前工具办事。返回 true = 吃掉这次点击 */
  function toolClick(h, ev) {
    const t = S.tool, k = h ? keyOfHit(h) : null;
    if (t.startsWith('mod:')) { const tl = toolById(t); if (tl) { runTool(tl, { ...S.mouse }, ui?.toolParams?.(t)); ripple(S.mouse.x, S.mouse.y, '160,90,140', 120); } return true; }
    if (!k) {
      if (t === 'move') { const g = G(), old = { x: g.player.x, y: g.player.y }; g.teleport(S.mouse.x, S.mouse.y); ripple(S.mouse.x, S.mouse.y, '230,200,120', 160); pushUndo('挪移主角', () => g.teleport(old.x, old.y)); log('挪移：主角瞬至'); return true; }
      if (t === 'props' && S.sel) { select(null); return false; }
      return false;
    }
    if (t === 'remove' && isUnit(k)) { const o = S.objs.get(k); ripple(o.e.x, o.e.y, '168,53,42', 110); remove(k); return true; }
    if (t === 'remove' && k.startsWith('npc:') && S.npcMine.has(k.slice(4))) { dropNpc(k.slice(4)); return true; }   // 1.3.8：召来的人物
    if (t === 'copy' && isUnit(k)) { duplicate(k); return true; }
    if (t === 'freeze' && isUnit(k)) { edit(k, 'frozen', !S.objs.get(k).frozen); return true; }
    if (t === 'ai' && isUnit(k)) { edit(k, 'noAI', !S.objs.get(k).noAI); return true; }
    if (t === 'team' && isUnit(k)) { edit(k, 'team', S.toolOpt.team); return true; }
    if (t === 'heal' && (isUnit(k) || k === 'player')) { heal(k); return true; }
    if (t === 'status' && (isUnit(k) || k === 'player')) { status(S.toolOpt.status, k, S.toolOpt.dur); return true; }
    // 属性、挪移以及其它工具：选中（单位可拖动）
    select(k);
    if (t !== 'props' && t !== 'move') ui?.setTool?.('props');
    if (isUnit(k) && ev) { const o = S.objs.get(k); S.drag = { id: k, x: o.e.x, y: o.e.y, ox: o.e.x - S.mouse.x, oy: o.e.y - S.mouse.y, sx: ev.clientX, sy: ev.clientY, from: { x: o.e.x, y: o.e.y }, moved: false }; }
    return true;
  }
  let unbinders = [];
  function bindInput(g) {
    const cv = g.canvas; if (!cv) return;
    const world = (ev) => g.screenToWorld(ev.clientX, ev.clientY);
    const move = (ev) => {
      if (!S.active) return;
      S.mouse = world(ev);
      if (S.drag) { const d = S.drag; d.x = S.mouse.x + d.ox; d.y = S.mouse.y + d.oy; d.moved ||= Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) > 4; const o = S.objs.get(d.id); if (o) moveTo(o, d.x, d.y); return; }
      if (S.hud) {
        const h = S.place ? null : hitAt(S.mouse, ev), hk = h ? (h.k ?? 'e') : null;
        S.hoverE = h?.e ?? null;
        if (hk !== S.hover || h?.e) { S.hover = hk; cv.style.cursor = h ? (S.tool === 'props' || S.tool === 'move' ? 'grab' : 'pointer') : S.place || S.tool.startsWith('mod:') || S.tool === 'move' ? 'crosshair' : ''; }
      }
    };
    const down = (ev) => {
      if (!S.active || !S.hud) return;
      S.mouse = world(ev);
      if (S.place) {
        ev.stopImmediatePropagation(); ev.preventDefault();
        if (ev.button === 2) { stopPlace(); return; }
        if (ev.button === 0) spawn(S.place.id, S.mouse.x, S.mouse.y, S.opt);   // 连续落子：右键 / Esc 收手
        return;
      }
      if (ev.button !== 0) return;
      const h = hitAt(S.mouse, ev);
      if (!toolClick(h, ev)) return;
      ev.stopImmediatePropagation(); ev.preventDefault();
      if (S.drag) { cv.style.cursor = 'grabbing'; try { cv.setPointerCapture(ev.pointerId); } catch { /* */ } }
    };
    const up = (ev) => {
      const d = S.drag; if (!d) return;
      S.drag = null; cv.style.cursor = S.hover ? 'grab' : '';
      try { cv.releasePointerCapture(ev.pointerId); } catch { /* */ }
      const o = S.objs.get(d.id);
      if (o && d.moved) { const from = d.from, to = { x: o.e.x, y: o.e.y }; pushUndo(`挪动 ${o.def.name}`, () => moveTo(o, from.x, from.y)); ripple(to.x, to.y, TEAM_COL[o.team], 60); log(`挪动 ${o.def.name}`); }
      ev.stopImmediatePropagation();
    };
    const ctx2 = (ev) => { if (S.active && S.place) { ev.preventDefault(); ev.stopImmediatePropagation(); } };
    cv.addEventListener('pointermove', move, true); cv.addEventListener('pointerdown', down, true); cv.addEventListener('pointerup', up, true); cv.addEventListener('contextmenu', ctx2, true);
    unbinders.push(() => { cv.removeEventListener('pointermove', move, true); cv.removeEventListener('pointerdown', down, true); cv.removeEventListener('pointerup', up, true); cv.removeEventListener('contextmenu', ctx2, true); cv.style.cursor = ''; });
  }
  function unbindInput() { for (const u of unbinders.splice(0)) { try { u(); } catch { /* */ } } }
  function startPlace(entry) { S.place = entry; const cv = G()?.canvas; if (cv) cv.style.cursor = 'crosshair'; ui?.placing(); }
  function stopPlace() { S.place = null; const cv = G()?.canvas; if (cv) cv.style.cursor = ''; ui?.placing(); }
  function setTool(id) { S.tool = id || 'props'; if (S.place) stopPlace(); const cv = G()?.canvas; if (cv) cv.style.cursor = S.tool.startsWith('mod:') || S.tool === 'move' ? 'crosshair' : ''; }
  const toolById = (id) => { const [, mid, i] = String(id).split(':'); return (S.catalog ?? catalogNow()).tool.find((t) => t.id === `${mid}:${i}`) ?? null; };
  const catalogNow = () => (S.catalog ??= buildCatalog(api, G()));

  // 键盘：` 入阵 / 收起界面；Esc 收手 / 取消选中；Delete 移除；Ctrl+Z 撤销；Ctrl+D 复制
  let f2Enabled = false;
  const onKey = (ev) => {
    // 1.3.4：落子中按 Esc 一律先收手——界面收起来了、焦点停在搜索框里、法宝匣折起来了都一样
    if (ev.key === 'Escape' && S.active && S.place) { stopPlace(); try { if (ev.target?.blur && ev.target !== document.body) ev.target.blur(); } catch { /* */ } ev.preventDefault(); ev.stopImmediatePropagation(); return; }
    const t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if ((ev.code === 'Backquote' || (f2Enabled && ev.code === 'F2')) && !ev.ctrlKey && !ev.altKey) {
      ev.preventDefault(); ev.stopImmediatePropagation(); if (!ev.repeat) toggle(); return;
    }
    if (!S.active || !S.hud) return;
    const stop = () => { ev.preventDefault(); ev.stopImmediatePropagation(); };
    if (ev.key === 'Escape') { if (ui?.closePop()) return stop(); if (S.place) { stopPlace(); return stop(); } if (S.tool !== 'props') { ui?.setTool?.('props'); return stop(); } if (S.sel) { select(null); return stop(); } }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && isUnit(S.sel)) { remove(S.sel); return stop(); }
    if (ev.ctrlKey && ev.key.toLowerCase() === 'z') { undo(); return stop(); }
    if (ev.ctrlKey && ev.key.toLowerCase() === 'd' && isUnit(S.sel)) { duplicate(S.sel); return stop(); }
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true);
  function toggle() {
    if (!S.active) { ui?.gate(true); return; }
    S.hud = !S.hud; if (!S.hud) stopPlace(); ui?.hud(); if (!S.hud) { const cv = G()?.canvas; if (cv) cv.style.cursor = ''; }
  }
  api.ui.button({ id: 'open', glyph: '试', label: '试场', onClick: () => toggle() });
  try { api.ui.hotkey('f2', () => toggle()); f2Enabled = true; } catch (err) { api.log('F2 被占用：', err?.message ?? err); }

  // ---------------------------------------------------------------- 世界层绘制（只在试场里挂上）
  function ripple(x, y, col, r = 120) { S.ripples.push({ x, y, col, r, t: 0, dur: 0.9 }); }
  function drawArray(c, x, y, r, rot, a) {
    if (!arrayImg?.complete || !arrayImg.naturalWidth) return;
    c.save(); c.globalAlpha = a; c.globalCompositeOperation = 'lighter';
    c.translate(x, y); c.scale(1, 0.56); c.rotate(rot);
    c.drawImage(arrayImg, -r, -r, r * 2, r * 2); c.restore();
  }
  function ring(c, x, y, r, col, a, w = 2) { c.save(); c.globalAlpha = a; c.strokeStyle = `rgb(${col})`; c.lineWidth = w; c.beginPath(); c.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2); c.stroke(); c.restore(); }
  const corpseImg = new Map();
  function drawCorpse(c, k) {
    let im = corpseImg.get(k.defId);
    if (!im) { const u = thumbs.get({ kind: 'enemy', id: k.defId }); if (u && typeof Image !== 'undefined') { im = Object.assign(new Image(), { src: u }); corpseImg.set(k.defId, im); } }
    const s = (k.scale ?? 1) * 1.3;
    c.save(); c.translate(k.x, k.y);
    c.globalAlpha = 0.28; c.fillStyle = '#2a2219'; c.beginPath(); c.ellipse(0, 2, 46 * s, 12 * s, 0, 0, Math.PI * 2); c.fill();
    if (im && im.complete && im.naturalWidth) { c.globalAlpha = 0.78; c.filter = 'grayscale(0.85) brightness(0.7) sepia(0.3)'; c.rotate(Math.PI / 2 * (k.face >= 0 ? -1 : 1) * 0.92); c.drawImage(im, -36 * s, -66 * s, 72 * s, 72 * s); c.filter = 'none'; }
    else { c.globalAlpha = 0.6; c.fillStyle = '#4a3f33'; c.font = `400 ${Math.round(26 * s)}px "Ma Shan Zheng", serif`; c.textAlign = 'center'; c.fillText('尸', 0, -6); }
    c.restore();
  }
  const drawFn = (c) => {
    if (!S.active) return;
    const t = now() / 1000, intro = Math.min(1, (now() - S.enterT) / 1200), ease = 1 - Math.pow(1 - intro, 3);
    const g = G(), P = g.player;
    // 阵心：一面缓缓转动的大阵
    if (Math.hypot(P.x - S.origin.x, P.y - S.origin.y) < 2600) drawArray(c, S.origin.x, S.origin.y, 480 * (0.4 + 0.6 * ease), t * 0.03, 0.16 + 0.5 * (1 - ease));
    for (const k of S.corpses) if (Math.abs(k.x - P.x) < 2600 && Math.abs(k.y - P.y) < 1800) drawCorpse(c, k);
    if (!S.hud) return;
    for (const o of S.objs.values()) {
      if (!alive(o)) continue;
      const e = o.e, col = TEAM_COL[o.team], sel = S.sel === o.id, hov = S.hover === o.id, k = o.scale ?? 1;
      if (sel) { drawArray(c, e.x, e.y, (62 + Math.sin(t * 3) * 3) * k, t * 0.9, 0.95); ring(c, e.x, e.y, (70 + (t * 40 % 30)) * k, col, 0.5 - (t * 40 % 30) / 60, 2); }
      ring(c, e.x, e.y, 34 * k, col, sel ? 0.95 : hov ? 0.85 : o.ext ? 0.25 : 0.42, hov || sel ? 3 : 1.6);
      const mark = o.team === 'dummy' ? '桩' : o.noAI ? '止' : o.frozen ? '定' : o.follow ? '随' : '';
      if (mark && !g.renderer?.hd) { c.save(); c.globalAlpha = 0.75; c.fillStyle = `rgb(${col})`; c.font = '600 18px "Ma Shan Zheng", serif'; c.textAlign = 'center'; c.fillText(mark, e.x + 30 * k, e.y + 6); c.restore(); }
    }
    if (S.hoverE && !objOf(S.hoverE)) ring(c, S.hoverE.x, S.hoverE.y, 36, '230,200,120', 0.7, 2.5);
    if (S.sel === 'player') { drawArray(c, P.x, P.y, 58, t * 0.9, 0.9); }
    else if (S.hover === 'player') ring(c, P.x, P.y, 34, '230,200,120', 0.8, 3);
    const pe = g.pets?.ent; if (pe && (S.sel === 'pet' || S.hover === 'pet')) ring(c, pe.x, pe.y, 28, '230,200,120', S.sel === 'pet' ? 0.95 : 0.7, 2.5);
    for (const a of g.npcs?.active?.values?.() ?? []) { const kk = 'npc:' + a.d.id; if (S.sel === kk || S.hover === kk) ring(c, a.st.x, a.st.y, 32, '210,150,90', S.sel === kk ? 0.95 : 0.7, 2.5); }
    // 落子预览
    if (S.place && S.mouse) {
      const n = S.opt.count, pts = formation(n, S.mouse.x, S.mouse.y), col = TEAM_COL[S.opt.follow ? 'ally' : S.opt.team];
      drawArray(c, S.mouse.x, S.mouse.y, 54 + 34 * Math.sqrt(n), -t * 0.8, 0.75);
      for (const q of pts) { c.save(); c.globalAlpha = 0.85; c.fillStyle = `rgba(${col},0.55)`; c.strokeStyle = `rgb(${col})`; c.lineWidth = 1.5; c.beginPath(); c.ellipse(q.x, q.y, 16, 8, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); }
      if (!g.renderer?.hd) { c.save(); c.font = '600 20px "Ma Shan Zheng", serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(30,24,16,0.75)'; c.fillStyle = '#f3e7c8';
      const label = `${S.place.name}${n > 1 ? ' ×' + n : ''}`; c.strokeText(label, S.mouse.x, S.mouse.y - 60 - 8 * Math.sqrt(n)); c.fillText(label, S.mouse.x, S.mouse.y - 60 - 8 * Math.sqrt(n)); c.restore(); }
    } else if (S.mouse && (S.tool.startsWith('mod:') || S.tool === 'move') && !S.hover) {
      drawArray(c, S.mouse.x, S.mouse.y, 46, -t * 0.8, 0.55);
    }
    for (const r of S.ripples) { const k = r.t / r.dur; ring(c, r.x, r.y, r.r * (0.3 + k * 0.9), r.col, (1 - k) * 0.9, 3 * (1 - k) + 1); }
  };
  api.unsafe.onDraw(drawFn);
  let drawEntry = null;
  function syncDraw() {
    const Hh = H(); if (!Hh?.draws) return;
    drawEntry ??= Hh.draws.find((d) => d.cb === drawFn) ?? null; if (!drawEntry) return;
    const has = Hh.draws.includes(drawEntry);
    if (S.active && !has) Hh.draws.push(drawEntry);
    else if (!S.active && has) Hh.draws.splice(Hh.draws.indexOf(drawEntry), 1);
  }
  queueMicrotask?.(() => syncDraw());

  // ---------------------------------------------------------------- 界面
  const thumbs = createThumbs({ G, U, H, enemyClass, onReady: () => ui?.thumbsReady?.() });
  const heroPortrait = () => { try { return new URL('./art/hanli.webp', location.href).href; } catch { return ''; } };
  const ctx = {
    S, U, IMG, TABS, CATS, STATUS, TEAM_NAME, TEAM_COL, realmName: (r, s) => realmName(U, r, s), G, api,
    enter, exit, toggle, bootFromTitle, hasSave, started: () => started, startPlace, stopPlace, select, remove, duplicate, edit, heal, bringHere, clearAll, undo, step, setCtl, setClock, scene,
    give, learn, cast, gongfa, pet, status, npcAct, npcMine: (id) => S.npcMine.has(id), hanshanAct, yewusheAct, runTool, refreshCatalog: () => { S.catalog = buildCatalog(api, G()); }, savePreset, loadPreset, delPreset, presetList: () => presets.list(), dps, alive,
    catalog: catalogNow, petKinds, thumbs, heroPortrait, setTool, toolById,
    dataRef, dataSet, dataRestore, setField, resetField, resetAll, changed, origOf,
    sheet: (k) => propsys.sheet(k), spawn,
    /** 测试用：在世界坐标 (x, y) 按当前工具点一下 */
    clickAt: (x, y) => { S.mouse = { x, y }; return toolClick(hitAt(S.mouse, null), null); },
  };
  const propsys = createProps(ctx);
  const ui = typeof document !== 'undefined' && document.head && document.body ? createUi(ctx) : null;

  // 热卸载（万宝阁）：在试场里就先出阵，再撤界面和监听
  // 万宝阁按游戏找清理函数：太虚问道录看 __taixuModCleanup，凡人修仙传看 __fanrenModCleanup——两处都登记
  const cleanup = () => {
    if (S.active) exit();
    dataRestore();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true);
    ui?.destroy(); titleHook.restore?.();
    delete globalThis.__fanrenModCleanup?.shahe; delete globalThis.__taixuModCleanup?.shahe; delete globalThis.__shahe;
  };
  (globalThis.__fanrenModCleanup ??= {}).shahe = cleanup; (globalThis.__taixuModCleanup ??= {}).shahe = cleanup;
  globalThis.__shahe = ctx;   // 调试 / 自动化测试用
}
