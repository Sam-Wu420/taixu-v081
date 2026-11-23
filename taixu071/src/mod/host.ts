// v0.55：外挂模组的宿主——启动时读出已启用的模组、按依赖顺序加载、把它们注册的内容并进游戏的数据表，
// 进游戏后转发事件（开局 / 每帧 / 每日 / 击杀）。每个模组单独兜错：一个模组出错不拖垮游戏，连错太多自动停掉它的回调。
import type { Game } from '../world/game';
import type { Enemy } from '../world/combat';
import type { ModAPI, ModBundle, ModEvents, ModGame, ArtSkill, ItemDef, EnemyDef, Recipe, ModFoeSkill, ModEnemyDef, ModLocation, ModTownAction, ModTalkOption, ModNpcDef, ModLocInfo, ModNpcInfo, ModQuest, ModUiNode, ModDraw, ModDialog } from './types';
import { MOD_API } from './types';
import { validateBundle } from './validate';
import { modStore } from './store';
import { ARTS, ART_LIST } from '../data/arts';
import { ITEMS, ITEM_LIST, scrollItemOf } from '../data/items';
import { ENEMIES, ENEMY_LIST, lvRealm } from '../data/enemies';
import { SKILL_ICON } from '../gfx/skillIconData';
import { registerIcons } from '../gfx/icons';
import { registerModItemIcon } from '../gfx/itemProcedural';
import { Enemy as EnemyC } from '../world/combat';
import * as C from '../world/cultivation';
import { learnArt } from '../world/obtain';
import { RECIPES } from '../data/recipes';
import { MOD_KITS, EL_COL, type FoeSkill } from '../world/foeskills';
import { SECT_LIB } from '../world/town';
import { LOC_BY_ID, ALL_LOCATIONS, locsOf, fromMap, migrateHumanPoint, LEGACY_SPEC, ACTIVE_MAP, WORLD_SCALE, MAP_IDS, ALL_MAP_IDS, type LocDef, type MapId } from '../data/world';
import { LEGACY_HUMAN_MAP_IDS, type LegacyHumanMapId } from '../data/worldHierarchy';
import { REALMS } from '../data/realms';
import { BEAST_SPR, registerModSprite } from '../gfx/beastTex';
import { actionOfKey } from '../core/keymap';
import { audio } from '../world/audio';
import { setModx, type ModBridge, type ModTownFac, type ModHudButton, type ModQuestRow } from './hooks';
import type { Drawable } from '../world/life';
import type { NpcData } from '../world/npc';
import type { DNode, DOpt } from '../world/modal';
import { TABLES, TABLE_BY_NAME, plain, removeFromPools } from './tables';
import { ROOTS } from '../data/realms';
import { GONGFA, TALENTS } from '../data/skills';
import type { ModHooks, ModStatusDef, ModSetting } from './types';

export const GAME_VERSION = '0.57.0';

export interface ModStatus {
  id: string; name: string; version: string; author: string;
  state: 'loaded' | 'error' | 'disabled' | 'missing-dep';
  error?: string; added: { arts: number; items: number; enemies: number; recipes: number; locations: number; npcs: number }; errors: number;
  /** v2：改了多少处原版 / 别的模组的内容；与别的模组改同一处时的提示 */
  patched: number; warnings: string[];
}
/** v2：谁改过哪一处（「art:fengren.power」→ 模组 id），用来提示冲突 */
const PATCHED = new Map<string, string>();
const NEED_RECIPE: (keyof Recipe)[] = ['id', 'name', 'out', 'outN', 'inputs', 'base', 'days', 'reqRealm', 'desc'];
const SK_KINDS = new Set(['salvo', 'ring', 'circle', 'rain', 'cone', 'charge', 'leap', 'nova', 'beam', 'summon', 'guard', 'blink', 'heal', 'roar', 'lines', 'march', 'track', 'spiral', 'fury']);
/** 敌人招式：校验并夹紧（预警至少 0.3 秒、威力 ≤ 6——躲得开、不秒人） */
function cleanSkill(s: ModFoeSkill, who: string): FoeSkill {
  if (!s || typeof s.id !== 'string' || typeof s.name !== 'string') throw new Error(`${who} 的招式要写 id 与 name`);
  if (!SK_KINDS.has(s.k)) throw new Error(`招式「${s.name}」的类型 k=${String(s.k)} 不存在（可用：${[...SK_KINDS].join(' ')}）`);
  if (!(s.el in EL_COL)) throw new Error(`招式「${s.name}」的五行 el=${String(s.el)} 不存在（可用：${Object.keys(EL_COL).join(' ')}）`);
  if (s.k === 'summon' && (!s.minion || !ENEMIES[s.minion])) throw new Error(`召唤招式「${s.name}」的 minion 要写已有敌人 id`);
  const num = (v: unknown, d: number, lo: number, hi: number) => { const n = typeof v === 'number' && Number.isFinite(v) ? v : d; return Math.max(lo, Math.min(hi, n)); };
  return { ...s, cd: num(s.cd, 8, 1, 120), tele: num(s.tele, 0.8, 0.3, 4), pow: num(s.pow, 1.5, 0, 6), range: num(s.range, 500, 50, 1500) } as FoeSkill;
}
type Hooks = { [K in keyof ModEvents]: ModEvents[K][] };

/** 法术 / 物品 / 敌人的必填字段（模组写漏了给出明白的报错） */
const NEED_ART: (keyof ArtSkill)[] = ['id', 'name', 'school', 'tier', 'realm', 'cast', 'fx', 'mp', 'cd', 'power', 'range', 'color', 'desc', 'evo'];
const NEED_ITEM: (keyof ItemDef)[] = ['id', 'name', 'type', 'tier', 'price', 'desc', 'glyph'];
const NEED_ENEMY: (keyof EnemyDef)[] = ['id', 'name', 'kind', 'minDanger', 'maxDanger', 'hp', 'atk', 'def', 'speed', 'drops'];

/** v3：各地图的尺寸（地图坐标） */
const MAP_WH: Record<MapId, [number, number]> = {
  renjie: [3600, 2400],
  lingjie: [3600, 2400],
  xianjie: [2400, 1600],
};
const LOC_TYPES = new Set(['city', 'town', 'isle', 'danger', 'secret', 'inn']);
const NPC_ROLES = new Set(['cultivator', 'scholar', 'farmer', 'merchant', 'female', 'elder', 'guard', 'monk']);
const NPC_PERS = new Set(['righteous', 'greedy', 'cautious', 'arrogant', 'kind', 'ruthless', 'aloof']);
const NPC_FACTIONS = new Set(['sect', 'rogue', 'demon', 'mortal', 'merchant']);
const MOTIONS = new Set(['walk', 'stand', 'fly', 'float', 'slither', 'swim']);
const clampN = (v: unknown, lo: number, hi: number, d = lo) => { const n = typeof v === 'number' && Number.isFinite(v) ? v : d; return Math.max(lo, Math.min(hi, n)); };
const safeCol = (c: unknown, d: string) => typeof c === 'string' && /^\d{1,3},\d{1,3},\d{1,3}$/.test(c.replace(/\s/g, '')) ? c.replace(/\s/g, '') : d;
/** v5：模组状态（全局登记） */
const STATUSES = new Map<string, { def: ModStatusDef; mod: Mod }>();
const HOOK_NAMES = new Set<keyof ModHooks>(['damage', 'exp', 'breakthrough', 'useItem', 'shop', 'spawn', 'loot', 'dialog', 'music', 'sfx', 'enter', 'talk']);
const EXT_PANELS = new Set(['char', 'bag', 'alchemy', 'seclude', 'town']);
const REPL_PANELS = new Set(['char', 'bag', 'alchemy', 'seclude', 'skills', 'map', 'friends', 'zhenfa', 'wardrobe']);
const SET_KEY = (id: string) => 'fanren.mods.settings.' + id;
export function loadSettings(id: string): Record<string, unknown> { try { return JSON.parse(localStorage.getItem(SET_KEY(id)) ?? '{}') ?? {}; } catch { return {}; } }
export function saveSettings(id: string, o: Record<string, unknown>) { try { localStorage.setItem(SET_KEY(id), JSON.stringify(o)); } catch { /* */ } }
const cssCol = (c: unknown, d: string) => typeof c === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|[a-z]{3,20})$/i.test(c) ? c : d;

class Mod {
  hooks: Hooks = { start: [], tick: [], day: [], kill: [], realm: [], enter: [], talk: [], spar: [], use: [], craft: [], down: [], draw: [] };
  // v3：世界、人物、界面
  townActs: ModTownAction[] = [];
  talks: ModTalkOption[] = [];
  npcs: ModNpcDef[] = [];
  buttons: { id: string; glyph: string; label: string; onClick: (g: ModGame) => void; badge?: (g: ModGame) => number }[] = [];
  panels = new Map<string, { title: string; sub?: string; render: (g: ModGame) => ModUiNode[] }>();
  hotkeys = new Map<string, (g: ModGame) => void>();
  // v5
  pre: Record<string, ((g: ModGame, ctx: any) => void)[]> = {};
  itemUses = new Map<string, (g: ModGame, ctx: { id: string; consume: boolean }) => string | void>();
  artCasts = new Map<string, (g: ModGame, at: any) => void>();
  artHits = new Map<string, (g: ModGame, hit: any) => void>();
  huds = new Map<string, { pos: string; render: (g: ModGame) => ModUiNode[] }>();
  extends: { panel: string; title: string; render: (g: ModGame) => ModUiNode[] }[] = [];
  replaces = new Map<string, string>();
  settingDefs: ModSetting[] = [];
  st: ModStatus;
  dead = false;
  /** setup 中途出错时按倒序撤销已做的改动，失败的模组不留痕迹 */
  undo: (() => void)[] = [];
  constructor(public b: ModBundle) {
    const m = b.manifest;
    this.st = { id: m.id, name: m.name, version: m.version, author: m.author, state: 'loaded', added: { arts: 0, items: 0, enemies: 0, recipes: 0, locations: 0, npcs: 0 }, errors: 0, patched: 0, warnings: [] };
  }
}

export class ModHost implements ModBridge {
  mods: Mod[] = [];
  game: Game | null = null;
  status: ModStatus[] = [];
  private faces = new Map<Mod, ModGame>();
  /** v3：模组加的地点（id → 所属模组） */
  locs = new Map<string, Mod>();
  private pendingStore = new Map<string, Record<string, unknown>>();

  /** 读出并加载已启用的模组（建世界之前调用） */
  async loadEnabled(): Promise<void> {
    const en = modStore.enabled();
    const all = await modStore.list();
    const byId = new Map(all.map((b) => [b.manifest.id, b]));
    const want = all.filter((b) => en[b.manifest.id]);
    for (const b of all) if (!en[b.manifest.id]) this.status.push({ ...new Mod(b).st, state: 'disabled' });
    // 依赖排序：依赖先加载；缺依赖的不加载
    const order: ModBundle[] = [], seen = new Set<string>(), bad = new Set<string>();
    const visit = (b: ModBundle, path: string[]) => {
      const id = b.manifest.id;
      if (seen.has(id) || bad.has(id)) return;
      if (path.includes(id)) { bad.add(id); return; }
      for (const d of b.manifest.deps ?? []) {
        const dep = byId.get(d);
        if (!dep || !en[d]) { bad.add(id); this.status.push({ ...new Mod(b).st, state: 'missing-dep', error: `缺少依赖模组「${d}」（未安装或未启用）` }); return; }
        visit(dep, [...path, id]);
        if (bad.has(d)) { bad.add(id); this.status.push({ ...new Mod(b).st, state: 'missing-dep', error: `依赖模组「${d}」没能加载` }); return; }
      }
      seen.add(id); order.push(b);
    };
    for (const b of want) visit(b, []);
    const ok = modStore.unsafeOk();
    for (const b of order) {
      // 高级权限：玩家在模组面板里确认过这个版本才加载（模组更新后要重新确认）
      if (b.manifest.unsafe && ok[b.manifest.id] !== b.manifest.version) { this.status.push({ ...new Mod(b).st, state: 'error', error: '这个模组要求高级权限：在模组面板里点「启用」并确认后，重新载入' }); continue; }
      await this.load(b);
    }
  }
  /** 高级权限模组注册的世界层绘制（ctx 已是世界坐标） */
  draws: { mod: Mod; cb: (ctx: CanvasRenderingContext2D, g: unknown) => void }[] = [];


  /** 加载一个模组（也供测试直接调用） */
  async load(b: ModBundle): Promise<ModStatus> {
    const mod = new Mod(b);
    this.status = this.status.filter((s) => s.id !== b.manifest.id);
    const err = validateBundle(b);
    if (err) { mod.st.state = 'error'; mod.st.error = err; this.status.push(mod.st); return mod.st; }
    if (this.mods.some((m) => m.b.manifest.id === b.manifest.id)) { mod.st.state = 'error'; mod.st.error = '同一个模组加载了两次'; this.status.push(mod.st); return mod.st; }
    try {
      const setup = await importModule(b.files[b.main]);
      if (typeof setup !== 'function') throw new Error('入口文件没有默认导出 setup(api) 函数');
      await setup(this.api(mod));
      this.mods.push(mod);
    } catch (e) {
      mod.st.state = 'error'; mod.st.error = String((e as Error)?.message ?? e);
      for (const u of mod.undo.reverse()) try { u(); } catch { /* 尽力撤销 */ }
      mod.st.warnings = [];
      console.warn(`[模组 ${b.manifest.id}] 加载失败`, e);
    }
    this.status.push(mod.st);
    return mod.st;
  }

  private api(mod: Mod): ModAPI {
    const id = mod.b.manifest.id, pre = id + '_';
    const own = (cid: unknown, what: string) => {
      if (typeof cid !== 'string' || !cid.startsWith(pre) || !/^[a-z0-9_]+$/.test(cid)) throw new Error(`${what} id「${String(cid)}」须以「${pre}」开头，只用小写字母、数字、下划线`);
    };
    const need = <T>(d: T, keys: (keyof T)[], what: string) => { for (const k of keys) if ((d as any)[k] === undefined) throw new Error(`${what}「${(d as any).id}」缺少字段 ${String(k)}`); };
    const host = this;
    /** 记一笔「谁改了哪一处」，别的模组改过同一处就提示 */
    const undo = (f: () => void) => { mod.undo.push(f); };
    const unlist = <T>(arr: T[], x: T) => () => { const i = arr.lastIndexOf(x); if (i >= 0) arr.splice(i, 1); };
    const mark = (key: string) => {
      const prev = PATCHED.get(key);
      undo(() => { if (prev) PATCHED.set(key, prev); else PATCHED.delete(key); });
      if (prev && prev !== id) mod.st.warnings.push(`与模组「${prev}」同时修改了 ${key}，以本模组为准`);
      PATCHED.set(key, id); mod.st.patched++;
    };
    const tbl = (name: string) => { const t = TABLE_BY_NAME.get(name); if (!t) throw new Error(`没有数据表 ${name}（可用：${TABLES.map((x) => x.name).join(' ')}）`); return t; };
    const find = (t: import('./tables').TableSpec, r: any, key: string | number) => {
      if (!Array.isArray(r)) return r[key as string];
      if (t.key === 'index') return r[Number(key)];
      return r.find((x: any) => x?.[t.key ?? 'id'] === key);
    };
    /** 逐层合并（对象逐层，数组与值整体替换） */
    const deepApply = (key: string, target: Record<string, any>, f: Record<string, any>) => {
      for (const [k, v] of Object.entries(f)) {
        if (k === 'id' && target === f) continue;
        if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object' && !Array.isArray(target[k])) deepApply(`${key}.${k}`, target[k], v as Record<string, any>);
        else apply(key, target, { [k]: v });
      }
    };
    const apply = (key: string, target: Record<string, any>, f: Record<string, any>) => {
      if (!f || typeof f !== 'object') throw new Error(`修改 ${key} 要给一个对象`);
      for (const [k, v] of Object.entries(f)) {
        if (k === 'id') throw new Error(`不能改 ${key} 的 id`);
        if (v === undefined) continue;
        const had = k in target, old = target[k];
        undo(() => { if (had) target[k] = old; else delete target[k]; });
        target[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...v } : Array.isArray(v) ? v.slice() : v;
        mark(`${key}.${k}`);
      }
    };
    return {
      id, version: mod.b.manifest.version, gameVersion: GAME_VERSION, apiVersion: MOD_API,
      log: (...a) => console.log(`[模组 ${id}]`, ...a),
      content: {
        arts(defs) {
          for (const d of defs) {
            own(d.id, '法术'); need(d, NEED_ART, '法术');
            if (ARTS[d.id]) throw new Error(`法术 ${d.id} 已存在`);
            const { onCast, onHit, ...rest } = d as ArtSkill & { onCast?: (g: ModGame, at: any) => void; onHit?: (g: ModGame, hit: any) => void };
            const s = { ...rest } as ArtSkill;
            if (typeof onCast === 'function') mod.artCasts.set(s.id, onCast);
            if (typeof onHit === 'function') mod.artHits.set(s.id, onHit);
            ARTS[s.id] = s; ART_LIST.push(s);
            const sc = scrollItemOf(s); ITEMS[sc.id] = sc; ITEM_LIST.push(sc);
            undo(() => { delete ARTS[s.id]; delete ITEMS[sc.id]; unlist(ART_LIST, s)(); unlist(ITEM_LIST, sc)(); });
            mod.st.added.arts++;
          }
        },
        items(defs) {
          for (const d of defs) {
            own(d.id, '物品'); need(d, NEED_ITEM, '物品');
            if (ITEMS[d.id]) throw new Error(`物品 ${d.id} 已存在`);
            const it = { ...d } as ItemDef; ITEMS[it.id] = it; ITEM_LIST.push(it);
            undo(() => { delete ITEMS[it.id]; unlist(ITEM_LIST, it)(); });
            mod.st.added.items++;
          }
        },
        enemies(defs) {
          for (const d of defs) {
            own(d.id, '敌人'); need(d, NEED_ENEMY, '敌人');
            if (ENEMIES[d.id]) throw new Error(`敌人 ${d.id} 已存在`);
            if (d.kind !== 'human' && !d.look) throw new Error(`妖兽 ${d.id} 要写 look（身形、颜色）才画得出来`);
            const { skills, skillsReplace, ...rest } = d as ModEnemyDef;
            const e = { ...rest } as EnemyDef; ENEMIES[e.id] = e; ENEMY_LIST.push(e);
            undo(() => { delete ENEMIES[e.id]; delete MOD_KITS[e.id]; unlist(ENEMY_LIST, e)(); });
            if (skills?.length) MOD_KITS[e.id] = { skills: skills.map((x) => cleanSkill(x, e.id)), replace: !!skillsReplace };
            mod.st.added.enemies++;
          }
        },
        recipes(defs) {
          for (const d of defs) {
            own(d.id, '丹方'); need(d, NEED_RECIPE, '丹方');
            if (RECIPES.some((r) => r.id === d.id)) throw new Error(`丹方 ${d.id} 已存在`);
            if (!ITEMS[d.out]) throw new Error(`丹方 ${d.id} 的成品 ${d.out} 不是已有物品（先注册物品）`);
            for (const i of d.inputs) if (!ITEMS[i.id]) throw new Error(`丹方 ${d.id} 的材料 ${i.id} 不是已有物品`);
            const r = { ...d, base: Math.max(0.01, Math.min(1, d.base)) }; RECIPES.push(r); undo(unlist(RECIPES, r));
            mod.st.added.recipes++;
          }
        },
        enemySkills(enemyId, skills, opt) {
          if (!ENEMIES[enemyId]) throw new Error(`没有敌人 ${enemyId}`);
          const add = skills.map((x) => cleanSkill(x, enemyId)), cur = MOD_KITS[enemyId];
          undo(() => { if (cur) MOD_KITS[enemyId] = cur; else delete MOD_KITS[enemyId]; });
          MOD_KITS[enemyId] = opt?.replace || !cur ? { skills: add, replace: !!opt?.replace } : { skills: cur.skills.concat(add), replace: cur.replace };
          mark(`kit:${enemyId}`);
        },
        addDrops(enemyId, drops) {
          const e = ENEMIES[enemyId]; if (!e) throw new Error(`没有敌人 ${enemyId}`);
          for (const dr of drops) {
            if (!ITEMS[dr.id]) throw new Error(`掉落 ${dr.id} 不是已有物品`);
            const x = { ...dr, ch: Math.max(0, Math.min(1, dr.ch)) }; e.drops.push(x); undo(unlist(e.drops, x));
          }
          mod.st.patched++;
        },
        sectLibrary(sectId, itemIds) {
          const lib = SECT_LIB[sectId]; if (!lib) throw new Error(`没有宗门 ${sectId}（可用：${Object.keys(SECT_LIB).join(' ')}）`);
          for (const it of itemIds) { if (!ITEMS[it]) throw new Error(`藏经阁物品 ${it} 不存在`); if (!lib.includes(it)) { lib.push(it); undo(unlist(lib, it)); } }
          mod.st.patched++;
        },
        locations(defs) {
          for (const d of defs as ModLocation[]) {
            own(d.id, '地点'); need(d, ['id', 'name', 'type', 'map', 'x', 'y', 'desc'], '地点');
            if (LOC_BY_ID.has(d.id)) throw new Error(`地点 ${d.id} 已存在`);
            if (!LOC_TYPES.has(d.type)) throw new Error(`地点 ${d.id} 的类型 ${d.type} 不对（可用：${[...LOC_TYPES].join(' ')}）`);
            const isLeg = (LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(d.map);
            const legSpec = isLeg ? LEGACY_SPEC[d.map as LegacyHumanMapId] : null;
            const wh: [number, number] | undefined = legSpec ? [legSpec.W, legSpec.H] : MAP_WH[d.map as MapId];
            if (!wh) throw new Error(`地点 ${d.id} 的地图 ${d.map} 不对（可用：${MAP_IDS.join(' ')}）`);
            if (!(d.x >= 5 && d.x <= wh[0] - 5 && d.y >= 5 && d.y <= wh[1] - 5)) throw new Error(`地点 ${d.id} 的坐标 (${d.x}, ${d.y}) 出了地图（${d.map}：0–${wh[0]} × 0–${wh[1]}，是地图坐标，不是像素）`);
            const targetMap: MapId = isLeg ? 'renjie' : (d.map as MapId);
            const [mx, my] = isLeg ? migrateHumanPoint(d.map as LegacyHumanMapId, d.x, d.y) : [d.x, d.y];
            const [ox, oy] = fromMap(targetMap, mx, my);
            const l: LocDef = { id: d.id, name: String(d.name).slice(0, 12), type: d.type, map: targetMap, x: mx, y: my, ox, oy, desc: String(d.desc).slice(0, 200),
              danger: clampN(d.danger, 0, 5, { city: 0, town: 1, isle: 1, danger: 3, secret: 2, inn: 1 }[d.type]), scale: clampN(d.scale, 0.3, 2, d.type === 'inn' ? 0.5 : 1), major: !!d.major,
              label: d.label ? String(d.label).slice(0, 4) : undefined, seal: d.seal ? String(d.seal).slice(0, 1) : undefined, look: d.look === 'post' ? 'post' : d.type === 'inn' ? 'tea' : undefined };
            const list = locsOf(l.map);
            // 随机生成的小地点（野村、险地、小秘地）若和新地点挤在一起，让出位置（名字仍可查，旧存档不受影响）
            for (let i = list.length - 1; i >= 0; i--) {
              const o = list[i]; if (!o.minor || host.locs.has(o.id) || Math.hypot(o.x - l.x, o.y - l.y) > 30 * l.scale!) continue;
              list.splice(i, 1); undo(() => list.splice(i, 0, o));
            }
            list.push(l); ALL_LOCATIONS.push(l); LOC_BY_ID.set(l.id, l); host.locs.set(l.id, mod);
            undo(() => { unlist(list, l)(); unlist(ALL_LOCATIONS, l)(); LOC_BY_ID.delete(l.id); host.locs.delete(l.id); });
            mod.st.added.locations++;
          }
        },
        townAction(d) {
          need(d, ['id', 'seal', 'name', 'desc', 'act'], '城镇事务');
          if (typeof d.act !== 'function') throw new Error(`城镇事务 ${d.id} 的 act 要是函数`);
          const x = { ...d, seal: String(d.seal).slice(0, 1), name: String(d.name).slice(0, 10), desc: String(d.desc).slice(0, 80) };
          mod.townActs.push(x); undo(unlist(mod.townActs, x));
        },
        talkOption(d) {
          need(d, ['id', 'label', 'act'], '交谈选项');
          if (typeof d.act !== 'function') throw new Error(`交谈选项 ${d.id} 的 act 要是函数`);
          const x = { ...d, label: String(d.label).slice(0, 20) };
          mod.talks.push(x); undo(unlist(mod.talks, x));
        },
        itemUse(itemId, fn) {
          if (!ITEMS[itemId]) throw new Error(`没有物品 ${itemId}`);
          if (typeof fn !== 'function') throw new Error('itemUse 要给一个函数');
          mod.itemUses.set(itemId, fn); undo(() => mod.itemUses.delete(itemId)); mark(`use:${itemId}`);
        },
        artCast(artId, fn) {
          if (!ARTS[artId]) throw new Error(`没有法术 ${artId}`);
          mod.artCasts.set(artId, fn); undo(() => mod.artCasts.delete(artId)); mark(`cast:${artId}`);
        },
        artHit(artId, fn) {
          if (!ARTS[artId]) throw new Error(`没有法术 ${artId}`);
          mod.artHits.set(artId, fn); undo(() => mod.artHits.delete(artId)); mark(`hit:${artId}`);
        },
        status(def) {
          own(def?.id, '状态'); need(def, ['id', 'name'], '状态');
          if (STATUSES.has(def.id)) throw new Error(`状态 ${def.id} 已存在`);
          STATUSES.set(def.id, { def: { ...def, name: String(def.name).slice(0, 8) }, mod }); undo(() => STATUSES.delete(def.id));
        },
        npcs(defs) {
          for (const d of defs as ModNpcDef[]) {
            own(d.id, 'NPC'); need(d, ['id', 'name', 'sex', 'home', 'realm', 'stage'], 'NPC');
            if (mod.npcs.some((n) => n.id === d.id) || host.mods.some((m) => m.npcs.some((n) => n.id === d.id))) throw new Error(`NPC ${d.id} 已存在`);
            if (!LOC_BY_ID.has(d.home)) throw new Error(`NPC ${d.id} 的住处 ${d.home} 不是已有地点（模组地点要先注册）`);
            if (d.sex !== 'm' && d.sex !== 'f') throw new Error(`NPC ${d.id} 的 sex 只能是 'm' 或 'f'`);
            if (d.role && !NPC_ROLES.has(d.role)) throw new Error(`NPC ${d.id} 的 role ${d.role} 不对（可用：${[...NPC_ROLES].join(' ')}）`);
            if (d.pers && !NPC_PERS.has(d.pers)) throw new Error(`NPC ${d.id} 的 pers ${d.pers} 不对（可用：${[...NPC_PERS].join(' ')}）`);
            if (d.faction && !NPC_FACTIONS.has(d.faction)) throw new Error(`NPC ${d.id} 的 faction ${d.faction} 不对（可用：${[...NPC_FACTIONS].join(' ')}）`);
            const x: ModNpcDef = { ...d, name: String(d.name).slice(0, 12), realm: Math.round(clampN(d.realm, 0, 5)), stage: Math.round(clampN(d.stage, 0, 3)) };
            mod.npcs.push(x); undo(unlist(mod.npcs, x));
            mod.st.added.npcs++;
          }
        },
        patch: {
          art(aid, f) {
            const a = ARTS[aid]; if (!a) throw new Error(`没有法术 ${aid}`);
            apply(`art:${aid}`, a, f);
            const sc = ITEMS['scroll_art_' + aid];
            if (sc) { const old = { ...sc }; undo(() => Object.assign(sc, old)); Object.assign(sc, scrollItemOf(a)); }   // 卷轴的名字、说明、价格跟着改
          },
          item(iid, f) { const it = ITEMS[iid]; if (!it) throw new Error(`没有物品 ${iid}`); apply(`item:${iid}`, it, f); },
          enemy(eid, f) { const e = ENEMIES[eid]; if (!e) throw new Error(`没有敌人 ${eid}`); apply(`enemy:${eid}`, e, f); },
          recipe(rid, f) { const r = RECIPES.find((x) => x.id === rid); if (!r) throw new Error(`没有丹方 ${rid}`); apply(`recipe:${rid}`, r, f); },
        },
      },
      file: (name) => mod.b.files[name],
      icon(cid, fileName) {
        const url = mod.b.files[fileName];
        if (!url || !url.startsWith('data:image/')) throw new Error(`图标文件 ${fileName} 不存在或不是图片`);
        if (ARTS[cid]) SKILL_ICON[cid] = url;
        if (ITEMS[cid]) { registerIcons({ [cid]: url }); registerModItemIcon(cid, url); }
        if (ARTS[cid] && ITEMS['scroll_art_' + cid]) { const id = 'scroll_art_' + cid; registerIcons({ [id]: url }); registerModItemIcon(id, url); }
      },
      data: {
        tables: () => TABLES.map((t) => { const r = t.ref(); return { name: t.name, desc: t.desc, count: Array.isArray(r) ? r.length : Object.keys(r).length, add: !!t.add, remove: t.remove ?? false }; }),
        get: (table, key) => {
          const t = tbl(table), r = t.ref();
          if (key === undefined) return plain(r);
          return plain(find(t, r, key));
        },
        patch: (table, key, fields, opt) => {
          const t = tbl(table), r = t.ref(), cur = find(t, r, key);
          if (cur === undefined) throw new Error(`数据表 ${table} 里没有 ${String(key)}`);
          if (cur === null || typeof cur !== 'object') {   // 纯值（sectRanks、profDamage 的一格，tuning 的一项……）：直接换成新值
            const k = Array.isArray(r) ? Number(key) : key, old = (r as any)[k];
            if (typeof fields !== typeof old) throw new Error(`数据表 ${table} 的 ${String(key)} 要写${typeof old === 'number' ? '数字' : typeof old === 'string' ? '文字' : typeof old}`);
            undo(() => { (r as any)[k] = old; }); (r as any)[k] = fields as any; mark(`${table}:${key}`); t.sync?.(); return;
          }
          if (opt?.deep) deepApply(`${table}:${key}`, cur, fields); else apply(`${table}:${key}`, cur, fields);
          t.sync?.(); undo(() => t.sync?.());
        },
        add: (table, entry, key) => {
          const t = tbl(table), r = t.ref();
          if (!t.add) throw new Error(`数据表 ${table} 不能新增${['arts', 'items', 'enemies', 'recipes'].includes(table) ? `（请用 content.${table}）` : ''}`);
          if (Array.isArray(r)) {
            if (t.key === 'index') { r.push(entry as any); undo(unlist(r as any[], entry)); }
            else {
              const e = entry as Record<string, any>; own(e?.[t.key ?? 'id'], table); if (t.need) need(e, t.need as any, table);
              if (r.some((x: any) => x?.[t.key ?? 'id'] === e[t.key ?? 'id'])) throw new Error(`数据表 ${table} 里已有 ${e[t.key ?? 'id']}`);
              const x = { ...e }; r.push(x); undo(unlist(r as any[], x));
            }
          } else {
            const k = key ?? (entry as any)?.id; own(k, table);
            if (k in r) throw new Error(`数据表 ${table} 里已有 ${k}`);
            if (t.need) need(entry as any, t.need as any, table);
            (r as any)[k] = typeof entry === 'object' ? { ...(entry as object) } : entry; undo(() => { delete (r as any)[k]; });
          }
          t.sync?.(); undo(() => t.sync?.());
          mod.st.patched++;
        },
        remove: (table, key) => {
          const t = tbl(table), r = t.ref();
          if (!t.remove) throw new Error(`数据表 ${table} 不能删除`);
          if (t.remove === 'list') { if (!(r as any)[key]) throw new Error(`数据表 ${table} 里没有 ${key}`); undo(removeFromPools(table, String(key))); mark(`${table}:${key}.removed`); return; }
          if (Array.isArray(r)) {
            const i = t.key === 'index' ? Number(key) : r.findIndex((x: any) => x?.[t.key ?? 'id'] === key);
            if (!(i >= 0 && i < r.length)) throw new Error(`数据表 ${table} 里没有 ${key}`);
            const [x] = r.splice(i, 1); undo(() => r.splice(i, 0, x));
          } else {
            if (!(key in r)) throw new Error(`数据表 ${table} 里没有 ${key}`);
            const old = (r as any)[key]; delete (r as any)[key]; undo(() => { (r as any)[key] = old; });
          }
          t.sync?.(); undo(() => t.sync?.());
          mark(`${table}:${key}.removed`);
        },
      },
      hook(name, fn) {
        if (!HOOK_NAMES.has(name)) throw new Error(`没有 ${String(name)} 钩子（可用：${[...HOOK_NAMES].join(' ')}）`);
        if (typeof fn !== 'function') throw new Error('hook 要给一个函数');
        (mod.pre[name] ??= []).push(fn); undo(() => unlist(mod.pre[name], fn)());
      },
      settings: {
        get: <T>(k: string) => { const v = loadSettings(id)[k]; return (v !== undefined ? v : mod.settingDefs.find((s) => s.key === k)?.default) as T; },
        set: (k, v) => { const o = loadSettings(id); o[k] = v; saveSettings(id, o); },
      },
      world: {
        locations: () => ALL_LOCATIONS.map((l) => ({ id: l.id, name: l.name, type: l.type, map: l.map, x: l.x, y: l.y, major: !!l.major, minor: !!l.minor, danger: l.danger ?? 0 })),
      },
      on(ev, cb) {
        if (!(ev in mod.hooks)) throw new Error(`没有 ${String(ev)} 事件（可用：${Object.keys(mod.hooks).join(' ')}）`);
        (mod.hooks[ev] as unknown[]).push(cb);
      },
      ui: {
        button(d) {
          need(d, ['id', 'glyph', 'label', 'onClick'], '按钮');
          if (mod.buttons.length >= 4) throw new Error('一个模组最多加 4 个按钮');
          const x = { ...d, glyph: String(d.glyph).slice(0, 1), label: String(d.label).slice(0, 4) };
          mod.buttons.push(x); undo(unlist(mod.buttons, x));
        },
        panel(pid, d) {
          if (typeof d?.render !== 'function') throw new Error(`面板 ${pid} 要写 render 函数`);
          mod.panels.set(String(pid), { title: String(d.title ?? '').slice(0, 20), sub: d.sub ? String(d.sub).slice(0, 80) : undefined, render: d.render });
          undo(() => mod.panels.delete(String(pid)));
        },
        hud(hid, d) {
          if (typeof d?.render !== 'function') throw new Error(`HUD ${hid} 要写 render 函数`);
          if (mod.huds.size >= 3) throw new Error('一个模组最多 3 块 HUD');
          mod.huds.set(String(hid), { pos: ['top-left', 'top-right', 'bottom-left', 'top', 'center'].includes(d.pos as string) ? d.pos! : 'top-right', render: d.render });
          undo(() => mod.huds.delete(String(hid)));
        },
        extend(panel, d) {
          if (!EXT_PANELS.has(panel)) throw new Error(`面板 ${panel} 不能扩展（可用：${[...EXT_PANELS].join(' ')}）`);
          if (typeof d?.render !== 'function') throw new Error('extend 要写 render 函数');
          const x = { panel, title: String(d.title ?? '').slice(0, 20), render: d.render }; mod.extends.push(x); undo(unlist(mod.extends, x));
        },
        replace(panel, pid) {
          if (!REPL_PANELS.has(panel)) throw new Error(`面板 ${panel} 不能替换（可用：${[...REPL_PANELS].join(' ')}）`);
          mod.replaces.set(panel, String(pid)); undo(() => mod.replaces.delete(panel)); mark(`panel:${panel}`);
        },
        settings(defs) {
          if (!Array.isArray(defs)) throw new Error('settings 要给数组');
          for (const s of defs) { need(s as any, ['key', 'label', 'type', 'default'], '设置项'); if (!['bool', 'number', 'select', 'text'].includes(s.type)) throw new Error(`设置项 ${s.key} 的 type 不对（bool number select text）`); }
          mod.settingDefs = defs.slice(0, 30).map((s) => ({ ...s, label: String(s.label).slice(0, 30) }));
        },
        hotkey(key, cb) {
          const k = String(key).toLowerCase();
          if (!/^([a-z0-9]|f(2|4|6|7|8|9|10))$/.test(k)) throw new Error(`快捷键 ${key} 只能是一个字母、数字或 F2 F4 F6–F10`);
          if (actionOfKey(k as any)) throw new Error(`快捷键 ${key} 已被游戏占用（${actionOfKey(k as any)}）`);
          if (host.mods.some((m) => m.hotkeys.has(k)) || mod.hotkeys.has(k)) throw new Error(`快捷键 ${key} 已被别的模组占用`);
          mod.hotkeys.set(k, cb); undo(() => mod.hotkeys.delete(k));
        },
      },
      gfx: {
        sprite(target, d) {
          const key = target === 'player' ? 'p:hero' : String(target);
          if (!/^(e|n):[a-z0-9_]+$/.test(key) && key !== 'p:hero') throw new Error(`换图目标 ${target} 写法不对：'e:敌人id'、'n:NPC id' 或 'player'`);
          if (key.startsWith('e:') && !ENEMIES[key.slice(2)]) throw new Error(`没有敌人 ${key.slice(2)}`);
          if (!d?.frames?.idle?.length) throw new Error(`换图 ${target} 至少要有 idle 帧`);
          const frames: Record<string, string[]> = {};
          for (const [st, list] of Object.entries(d.frames)) {
            if (!list) continue;
            if (!['idle', 'walk', 'attack', 'hit'].includes(st)) throw new Error(`换图 ${target} 的动作 ${st} 不对（idle walk attack hit）`);
            frames[st] = (list as string[]).slice(0, 32).map((f) => {
              const u = f.startsWith('data:image/') ? f : mod.b.files[f];
              if (!u || !u.startsWith('data:image/')) throw new Error(`换图 ${target} 的帧 ${f} 不是包里的图片`);
              return u;
            });
          }
          if (d.motion && !MOTIONS.has(d.motion)) throw new Error(`换图 ${target} 的 motion ${d.motion} 不对（${[...MOTIONS].join(' ')}）`);
          const prev = BEAST_SPR[key];
          registerModSprite(key, { frames, fps: clampN(d.fps, 1, 30, 8), h: clampN(d.height, 10, 800, 108), f: d.facing === -1 ? -1 : 1, m: (d.motion ?? 'stand') as any, glow: d.glow ? safeCol(d.glow, '') || undefined : undefined });
          undo(() => { if (prev) BEAST_SPR[key] = prev; else delete BEAST_SPR[key]; });
          mark(`sprite:${key}`);
        },
      },
      unsafe: mod.b.manifest.unsafe ? {
        game: () => host.game,
        data: { ARTS, ART_LIST, ITEMS, ITEM_LIST, ENEMIES, ENEMY_LIST, RECIPES, SECT_LIB, MOD_KITS, LOC_BY_ID, ALL_LOCATIONS, BEAST_SPR, REALMS },
        onDraw(cb) { host.draws.push({ mod, cb }); },
      } : undefined,
      store: {
        get: <T>(k: string) => host.bag(id)[k] as T | undefined,
        set: (k, v) => { host.bag(id)[k] = v; },
      },
    };
  }
  /** 本模组的存档数据：进游戏前先放在内存里，进游戏后挂到世界状态上（随存档走） */
  private bag(id: string): Record<string, unknown> {
    const g = this.game;
    if (!g) { let b = this.pendingStore.get(id); if (!b) { b = {}; this.pendingStore.set(id, b); } return b; }
    const ws = g.ws as any; ws.mods ??= {}; return (ws.mods[id] ??= {});
  }

  // ------------------------------------------------------------ 进游戏后
  attach(g: Game) {
    if (this.game === g) return;
    this.game = g;
    this.faces.clear();
    const prev = g.combat.onKill;
    g.combat.onKill = (e: Enemy) => { prev?.(e); this.emit('kill', { id: e.def.id, name: e.name, realm: e.realm, x: e.x, y: e.y }); };
    // v3：切磋结束、被打倒、用物品、炼丹出炉
    const ps = g.combat.onSparEnd;
    g.combat.onSparEnd = (e: Enemy, won: boolean) => { ps?.(e, won); this.emit('spar', { npc: e.npcId ? this.npcInfo(e.npcId) : null, won }); };
    const wrap = <K extends 'usePill' | 'learnScroll' | 'brew' | 'onPlayerDown'>(k: K, after: (r: any, a: any[]) => void) => {
      const o = (g[k] as any).bind(g);
      (g as any)[k] = (...a: any[]) => { const r = o(...a); try { after(r, a); } catch (err) { console.warn('[模组] 事件转发出错', err); } return r; };
    };
    wrap('usePill', (_r, a) => this.emit('use', { id: String(a[0]) }));
    wrap('learnScroll', (_r, a) => this.emit('use', { id: String(a[0]) }));
    wrap('brew', (r, a) => this.emit('craft', { recipe: a[0]?.id, ok: !!r?.ok }));
    wrap('onPlayerDown', () => this.emit('down'));
    g.mods = this;
    if (this.mods.length) setModx(this);
  }
  /** 新开局 / 读档之后 */
  start() {
    const g = this.game; if (!g) return;
    const ws = g.ws as any; ws.mods ??= {};
    for (const [id, b] of this.pendingStore) ws.mods[id] = { ...b, ...(ws.mods[id] ?? {}) };
    this.pendingStore.clear();
    this.syncNpcs();
    this.lastRealm = g.hero.realm * 10 + g.hero.stage;
    this.emit('start');
  }
  /** v3：把模组 NPC 放进众生名册（存档里没有就新建；卸掉的模组的 NPC 从名册撤下） */
  private syncNpcs() {
    const g = this.game!, W = g.npcs;
    const live = new Set(this.mods.map((m) => m.b.manifest.id));
    const before = W.list.length;
    W.list = W.list.filter((d) => !d.mod || live.has(d.mod));
    for (const d of [...W.active.keys()]) if (!W.list.some((n) => n.id === d)) W.active.delete(d);
    for (const m of this.mods) for (const def of m.npcs) {
      const loc = LOC_BY_ID.get(def.home)!;
      let d = W.list.find((n) => n.id === def.id);
      if (!d) {
        let seed = 7; for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
        let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        const p = W.homeAt(loc, rnd, 840, 588);
        const R = REALMS[Math.max(1, def.realm)];
        d = { id: def.id, name: def.name, sex: def.sex, role: (def.role ?? (def.sex === 'f' ? 'female' : def.realm >= 3 ? 'elder' : 'cultivator')) as NpcData['role'], realm: def.realm, stage: def.stage,
          faction: def.faction ?? 'rogue', home: def.home, pers: def.pers ?? 'kind', favor: clampN(def.favor, -100, 100, 0), grudge: 0, met: false, alive: true,
          age: clampN(def.age, 1, 5000, 30), life: Math.max(R.life * 3, 1000), x: p.x, y: p.y, tx: p.x, ty: p.y, goal: 'stay', until: 0,
          wealth: 30 + def.realm * def.realm * 400, seed, canon: true, title: def.title, stay: !def.wander, map: loc.map, mod: m.b.manifest.id };
        W.list.push(d);
      }
      // 模组更新后：名字、称谓、外貌跟着新版本走（境界、好感等由存档决定）
      d.name = def.name; d.title = def.title; d.mod = m.b.manifest.id; d.mlook = def.look as NpcData['mlook'];
      W.active.get(d.id) && (W.active.get(d.id)!.look = W.look(d));
    }
    if (W.list.length !== before || this.mods.some((m) => m.npcs.length)) W.byId = new Map(W.list.map((n) => [n.id, n]));
  }
  /** 排队等着弹的模组对话 */
  queue: DNode[] = [];
  private lastRealm = -1;
  tick(dt: number) {
    const g = this.game;
    if (g && this.queue.length && !g.modal) g.openDialog(this.queue.shift()!);
    if (g) {   // 境界变化（突破、升层的结算点很多，这里统一看结果）
      const r = g.hero.realm * 10 + g.hero.stage;
      if (this.lastRealm >= 0 && r !== this.lastRealm) this.emit('realm', { realm: g.hero.realm, stage: g.hero.stage, major: Math.floor(r / 10) !== Math.floor(this.lastRealm / 10) });
      this.lastRealm = r;
    }
    this.tickStatuses(dt);
    this.emit('tick', dt);
  }
  day(days: number) { this.emit('day', days); }

  private emit<K extends keyof ModEvents>(ev: K, ...args: unknown[]) {
    if (!this.game || !this.mods.length) return;
    for (const m of this.mods) {
      if (m.dead) continue;
      const f = this.face(m);
      for (const cb of m.hooks[ev]) {
        try { (cb as (...a: unknown[]) => void)(f, ...args); }
        catch (e) { if (this.fail(m, ev, e)) break; }
      }
    }
  }
  /** 跑一段模组代码，出错记账、返回 undefined */
  private safe<T>(m: Mod, where: string, f: () => T): T | undefined {
    if (m.dead) return undefined;
    try { return f(); } catch (e) { this.fail(m, where, e); return undefined; }
  }
  /** 模组面板用：某个模组的设置项定义 */
  settingDefs(id: string): ModSetting[] { return this.mods.find((m) => m.b.manifest.id === id)?.settingDefs ?? []; }
  /** 记一次回调出错；累计 20 次停掉这个模组。返回 true 表示已停 */
  fail(m: Mod, where: string, e: unknown): boolean {
    m.st.errors++;
    if (m.st.errors <= 3) console.warn(`[模组 ${m.st.id}] ${where} 回调出错`, e);
    if (m.st.errors >= 20 && !m.dead) { m.dead = true; m.st.state = 'error'; m.st.error = `回调连续出错，已停用（${String((e as Error)?.message ?? e)}）`; this.game?.toast(`模组「${m.st.name}」出错太多，已暂停运行。`, 'warn'); }
    return m.dead;
  }

  // ------------------------------------------------------------ v3：给游戏本体的接入点（hooks.ts 的 ModBridge）
  locInfo(l: LocDef): ModLocInfo { return { id: l.id, name: l.name, type: l.type, map: l.map, x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, danger: l.danger ?? 0 }; }
  npcInfo(id: string): ModNpcInfo | null {
    const d = this.game?.npcs.byId.get(id); if (!d) return null;
    const here = (d.map ?? 'renjie') === ACTIVE_MAP, a = this.game!.npcs.activeOf(id);
    return { id: d.id, name: d.name, sex: d.sex, realm: d.realm, stage: d.stage, favor: Math.round(d.favor), alive: d.alive, faction: d.faction, home: d.home, title: d.title, met: d.met, bond: d.bond,
      x: here ? (a ? a.st.x : d.x) : null, y: here ? (a ? a.st.y : d.y) : null };
  }
  private withLook(n: DNode, look: unknown) { if (!n.portrait && look) n.look = look as DNode['look']; return n; }
  canEnter(l: LocDef) { return this.locs.has(l.id); }
  openLoc(l: LocDef) {
    const info = this.locInfo(l);
    if (this.has('enter') && this.fire('enter', { loc: info }).cancel) return true;   // v5：模组拦下了
    this.emit('enter', info);
    const m = this.locs.get(l.id);
    if (!m || l.type === 'city' || l.type === 'town' || l.type === 'isle') return false;
    // 险地 / 秘地：一段对话，选项是各模组给此地的事务
    const opts: DOpt[] = this.actsFor(l).map((x) => ({ label: x.name, hint: x.desc, act: () => { x.act(); return null; } }));
    opts.push({ label: '离开', act: () => null });
    this.game!.openDialog({ speaker: l.name, title: l.label ?? (l.type === 'danger' ? '险地' : l.type === 'inn' ? '驿站' : '秘地'), text: l.desc, options: opts, mood: l.type === 'inn' ? 'normal' : 'mystic' });
    return true;
  }
  private actsFor(l: LocDef): ModTownFac[] {
    const out: ModTownFac[] = [];
    const townish = l.type === 'city' || l.type === 'town' || l.type === 'isle' || l.type === 'sect';
    for (const m of this.mods) {
      if (m.dead) continue;
      for (const a of m.townActs) {
        const w = a.where ?? 'all';
        if (w === 'all' ? !townish : !(w.includes(l.id) || w.includes(l.type))) continue;
        out.push({ seal: a.seal, name: a.name, desc: a.desc, cls: 'mod', act: () => {
          const r = this.safe(m, 'townAction', () => a.act(this.face(m), this.locInfo(l)));
          if (r && typeof r === 'object') this.game!.openDialog(toNode(r as ModDialog));
        } });
      }
    }
    return out;
  }
  townFacs(l: LocDef) { return this.actsFor(l); }
  npcTalk(npcId: string, look: unknown, main: () => DNode): DNode | null | false {
    const info = this.npcInfo(npcId); if (!info) return null;
    if (this.has('talk') && this.fire('talk', { npc: info }).cancel) return false;   // v5：模组拦下了（多半自己弹了别的对话）
    this.emit('talk', info);
    for (const m of this.mods) {
      const def = m.npcs.find((n) => n.id === npcId);
      if (!def?.talk) continue;
      const r = this.safe(m, 'npc.talk', () => def.talk!(this.face(m), info));
      if (!r || typeof r !== 'object') return null;
      const n = this.withLook(toNode(r as ModDialog), look);
      n.options = n.options.filter((o) => o.label !== '告辞');
      n.options.push({ label: '其他事', act: () => main() }, { label: '告辞', act: () => null });
      n.chat = { kind: 'npc', id: npcId };
      return n;
    }
    return null;
  }
  talkOpts(npcId: string, look: unknown): DOpt[] {
    const info = this.npcInfo(npcId); if (!info) return [];
    const out: DOpt[] = [];
    for (const m of this.mods) {
      if (m.dead) continue;
      for (const t of m.talks) {
        if (t.who && !t.who.includes(npcId)) continue;
        if (t.when && !this.safe(m, 'talkOption.when', () => t.when!(info, this.face(m)))) continue;
        out.push({ label: t.label, hint: t.hint, tone: t.tone === 'jade' ? 'good' : t.tone, act: () => {
          const r = this.safe(m, 'talkOption', () => t.act(this.face(m), this.npcInfo(npcId) ?? info));
          return r && typeof r === 'object' ? this.withLook(toNode(r as ModDialog), look) : null;
        } });
      }
    }
    return out;
  }
  greet(npcId: string) {
    for (const m of this.mods) { const d = m.npcs.find((n) => n.id === npcId); if (d?.greet?.length) return String(d.greet[Math.floor(Math.random() * d.greet.length)]).slice(0, 300); }
    return null;
  }
  // ------------------------------------------------------------ v5：前置钩子与行为回调
  has(name: string) { return this.mods.some((m) => !m.dead && !!m.pre[name]?.length); }
  fire<T extends object>(name: string, ctx: T): T & { cancel?: boolean } {
    for (const m of this.mods) {
      if (m.dead) continue;
      for (const fn of m.pre[name] ?? []) { this.safe(m, 'hook:' + name, () => fn(this.face(m), ctx)); if ((ctx as any).cancel) return ctx as T & { cancel?: boolean }; }
    }
    return ctx as T & { cancel?: boolean };
  }
  dialogHook(node: DNode): DNode | null {
    if ((node as any).__mod) return node;
    const extra: DOpt[] = [], hidden = new Set<string>();
    const ctx = { speaker: node.speaker, title: node.title, text: node.text, options: node.options.map((o) => ({ label: o.label })),
      add: (o: ModDialog['options'][number]) => { const n = toNode({ speaker: node.speaker, text: '', options: [o] }); extra.push(n.options[0]); },
      hide: (label: string) => { hidden.add(String(label)); } };
    const c = this.fire('dialog', ctx);
    if (c.cancel) return null;
    const opts = node.options.filter((o) => !hidden.has(o.label));
    const last = opts.length && /告辞|离开|算了|作罢|关闭/.test(opts[opts.length - 1].label) ? opts.pop()! : null;
    return { ...node, text: String(c.text ?? node.text).slice(0, 4000), options: [...opts, ...extra, ...(last ? [last] : [])] };
  }
  canUse(id: string) { return this.mods.some((m) => !m.dead && m.itemUses.has(id)); }
  useItem(id: string) {
    const g = this.game; if (!g) return false;
    if (this.has('useItem') && this.fire('useItem', { id }).cancel) return true;
    for (const m of this.mods) {
      const fn = !m.dead && m.itemUses.get(id); if (!fn) continue;
      if (C.bagCount(g.hero, id) <= 0) return true;
      const ctx = { id, consume: true };
      const msg = this.safe(m, 'itemUse', () => fn(this.face(m), ctx));
      if (ctx.consume) C.removeItem(g.hero, id, 1);
      if (typeof msg === 'string' && msg) g.toast(msg.slice(0, 200), 'good');
      return true;
    }
    return false;
  }
  artCast(id: string, at: { x: number; y: number; tx: number; ty: number; target: unknown }) {
    for (const m of this.mods) { const fn = !m.dead && m.artCasts.get(id); if (fn) this.safe(m, 'artCast', () => fn(this.face(m), { x: at.x, y: at.y, tx: at.tx, ty: at.ty, target: (at.target as Enemy | null)?.id ?? null })); }
  }
  artHit(id: string, e: unknown, dmg: number) {
    const en = e as Enemy;
    for (const m of this.mods) { const fn = !m.dead && m.artHits.get(id); if (fn) this.safe(m, 'artHit', () => fn(this.face(m), { ref: en.id, id: en.def.id, amount: dmg })); }
  }
  private musicSt = ''; private musicOn = false;
  musicFor(state: string) {
    if (state === this.musicSt) return this.musicOn;
    this.musicSt = state;
    if (!this.has('music')) { if (this.musicOn) { audio.musicData(null, null); this.musicOn = false; } return false; }
    let owner: Mod | null = null;
    const ctx: { state: string; file?: string | null; vol?: number } = { state };
    for (const m of this.mods) { if (m.dead) continue; for (const fn of m.pre.music ?? []) { const before = ctx.file; this.safe(m, 'hook:music', () => fn(this.face(m), ctx)); if (ctx.file !== before) owner = m; } }
    const url = owner && ctx.file ? (ctx.file.startsWith('data:audio/') ? ctx.file : owner.b.files[ctx.file]) : null;
    if (url && url.startsWith('data:audio/')) { audio.musicData(`mod:${owner!.b.manifest.id}:bgm:${ctx.file!.length > 100 ? ctx.file!.length : ctx.file}`, url, clampN(ctx.vol, 0, 1.5, 0.8)); this.musicOn = true; return true; }
    if (this.musicOn) { audio.musicData(null, null); this.musicOn = false; }
    return false;
  }
  get sfxOverride() { return this.has('sfx'); }
  sfxFor(name: string, o: { x?: number; y?: number; vol?: number }) {
    const ctx: { name: string; file?: string | null; mute?: boolean } = { name };
    let owner: Mod | null = null;
    for (const m of this.mods) { if (m.dead) continue; for (const fn of m.pre.sfx ?? []) { const b = ctx.file; this.safe(m, 'hook:sfx', () => fn(this.face(m), ctx)); if (ctx.file !== b) owner = m; } }
    if (ctx.mute) return true;
    const url = owner && ctx.file ? (ctx.file.startsWith('data:audio/') ? ctx.file : owner.b.files[ctx.file]) : null;
    if (!url || !url.startsWith('data:audio/')) return false;
    audio.playData(`mod:${owner!.b.manifest.id}:sfx:${ctx.file!.length > 100 ? ctx.file!.length : ctx.file}`, url, { x: o.x, y: o.y, vol: o.vol });
    return true;
  }
  panelSlot(panelId: string) {
    const out: { key: string; title: string; nodes: unknown[] }[] = [];
    for (const m of this.mods) {
      if (m.dead) continue;
      m.extends.forEach((x, i) => { if (x.panel !== panelId) return; const nodes = this.safe(m, 'extend.render', () => x.render(this.face(m))); out.push({ key: `${m.b.manifest.id}:${i}`, title: x.title, nodes: Array.isArray(nodes) ? nodes : [] }); });
    }
    return out;
  }
  replacePanel(panelId: string) {
    for (const m of [...this.mods].reverse()) { const p = !m.dead && m.replaces.get(panelId); if (p && m.panels.has(p)) return { mod: m.b.manifest.id, panel: p }; }
    return null;
  }
  huds() {
    const out: { key: string; pos: string; nodes: unknown[] }[] = [];
    for (const m of this.mods) {
      if (m.dead) continue;
      for (const [hid, h] of m.huds) { const nodes = this.safe(m, 'hud.render', () => h.render(this.face(m))); if (Array.isArray(nodes) && nodes.length) out.push({ key: `${m.b.manifest.id}:${hid}`, pos: h.pos, nodes }); }
    }
    return out;
  }
  /** 模组状态：目标键（'hero' 或敌人 ref）→ 状态 id → 剩余秒数 */
  private sts = new Map<string, Map<string, number>>();
  addStatus(target: number | 'hero', id: string, dur: number) {
    const s = STATUSES.get(id); if (!s || !this.game) return false;
    const key = String(target); let m = this.sts.get(key); if (!m) { m = new Map(); this.sts.set(key, m); }
    const fresh = !m.has(id); m.set(id, Math.max(m.get(id) ?? 0, clampN(dur, 0.1, 600, 3)));
    if (fresh) {
      const p = target === 'hero' ? this.game.player : this.game.combat.enemies.find((e) => e.id === target);
      if (p) this.game.combat.texts.push({ x: p.x, y: p.y - 140, s: s.def.name, color: cssCol(s.def.color, '#d8b0ff'), t: 0, vy: -30 } as any);
      if (s.def.onApply) this.safe(s.mod, 'status.onApply', () => s.def.onApply!(this.face(s.mod), target));
    }
    return true;
  }
  private tickStatuses(dt: number) {
    if (!this.sts.size || !this.game) return;
    const alive = new Set(this.game.combat.enemies.filter((e) => !e.dead).map((e) => String(e.id)));
    for (const [key, m] of this.sts) {
      if (key !== 'hero' && !alive.has(key)) { this.sts.delete(key); continue; }
      const target: number | 'hero' = key === 'hero' ? 'hero' : Number(key);
      for (const [id, left] of m) {
        const s = STATUSES.get(id); if (!s) { m.delete(id); continue; }
        const l = left - dt;
        if (s.def.tick) this.safe(s.mod, 'status.tick', () => s.def.tick!(this.face(s.mod), target, dt, Math.max(0, l)));
        if (l <= 0) { m.delete(id); if (s.def.onExpire) this.safe(s.mod, 'status.onExpire', () => s.def.onExpire!(this.face(s.mod), target)); }
        else m.set(id, l);
      }
      if (!m.size) this.sts.delete(key);
    }
  }
  apprentice(npcId: string) { return this.mods.some((m) => m.npcs.some((n) => n.id === npcId && n.apprentice)); }
  get animating() { return this.draws.length > 0 || this.mods.some((m) => !m.dead && m.hooks.draw.length > 0); }
  private imgs = new Map<string, HTMLImageElement>();
  /** 世界层绘制：模组每次调用 d.xxx 记一笔，各按自己的脚底 y 排进遮挡顺序 */
  collect(list: Drawable[]) {
    if (!this.animating) return;
    // 高级权限模组：原始画布，画在一切之上
    for (const d of this.draws) if (!d.mod.dead) list.push({ y: 4e5, k: 'D·模组', draw: (c) => { c.save(); try { d.cb(c, this.game); } catch (e) { this.fail(d.mod, 'draw', e); } c.restore(); } });
    for (const m of this.mods) {
      if (m.dead || !m.hooks.draw.length) continue;
      const f = this.face(m), d = this.drawer(m, list);
      for (const cb of m.hooks.draw) this.safe(m, 'draw', () => cb(f, d));
    }
  }
  private drawer(m: Mod, list: Drawable[]): ModDraw {
    let n = 0;
    const push = (y: number, fn: (c: CanvasRenderingContext2D) => void) => {
      if (++n > 400 || !Number.isFinite(y)) return;
      list.push({ y, k: 'D·模组', draw: (c) => { c.save(); try { fn(c); } catch (e) { this.fail(m, 'draw', e); } c.restore(); } });
    };
    const img = (file: string) => {
      const u = file.startsWith('data:image/') ? file : m.b.files[file];
      if (!u || !u.startsWith('data:image/') || typeof Image === 'undefined') return null;
      let im = this.imgs.get(u); if (!im) { im = new Image(); im.src = u; this.imgs.set(u, im); }
      return im.complete && im.width ? im : null;
    };
    return {
      image: (file, x, y, w, h, o = {}) => push(y + h, (c) => {
        const im = img(file); if (!im) return;
        c.globalAlpha *= clampN(o.alpha, 0, 1, 1);
        c.translate(x + w / 2, y + h / 2); if (o.rot) c.rotate(o.rot); if (o.flip) c.scale(-1, 1);
        c.drawImage(im, -w / 2, -h / 2, w, h);
      }),
      circle: (x, y, r, color, o = {}) => push(y, (c) => {
        c.globalAlpha *= clampN(o.alpha, 0, 1, 1); c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
        if (o.fill === false) { c.strokeStyle = cssCol(color, '#fff'); c.lineWidth = clampN(o.width, 0.5, 50, 2); c.stroke(); } else { c.fillStyle = cssCol(color, '#fff'); c.fill(); }
      }),
      rect: (x, y, w, h, color, o = {}) => push(y + h, (c) => {
        c.globalAlpha *= clampN(o.alpha, 0, 1, 1);
        if (o.fill === false) { c.strokeStyle = cssCol(color, '#fff'); c.lineWidth = clampN(o.width, 0.5, 50, 2); c.strokeRect(x, y, w, h); } else { c.fillStyle = cssCol(color, '#fff'); c.fillRect(x, y, w, h); }
      }),
      line: (x1, y1, x2, y2, color, width = 2, alpha = 1) => push(Math.max(y1, y2), (c) => {
        c.globalAlpha *= clampN(alpha, 0, 1, 1); c.strokeStyle = cssCol(color, '#fff'); c.lineWidth = clampN(width, 0.5, 50, 2);
        c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      }),
      text: (text, x, y, o = {}) => push(y + 300000, (c) => {
        c.globalAlpha *= clampN(o.alpha, 0, 1, 1); c.fillStyle = cssCol(o.color, '#fff8e8');
        c.font = `${clampN(o.size, 8, 120, 22)}px serif`; c.textAlign = o.align ?? 'center';
        c.strokeStyle = 'rgba(20,16,10,0.7)'; c.lineWidth = 3; c.strokeText(String(text).slice(0, 80), x, y); c.fillText(String(text).slice(0, 80), x, y);
      }),
    };
  }
  buttons(): ModHudButton[] {
    const out: ModHudButton[] = [];
    for (const m of this.mods) {
      if (m.dead) continue;
      for (const b of m.buttons) out.push({ key: m.b.manifest.id + ':' + b.id, glyph: b.glyph, label: b.label,
        badge: b.badge ? clampN(this.safe(m, 'button.badge', () => b.badge!(this.face(m))), 0, 99, 0) : 0,
        go: () => { this.safe(m, 'button', () => b.onClick(this.face(m))); } });
    }
    return out;
  }
  quests(): ModQuestRow[] {
    const ws = this.game?.ws as any; if (!ws?.mods) return [];
    const out: ModQuestRow[] = [];
    for (const m of this.mods) {
      const qs = ws.mods[m.b.manifest.id]?.__quests as Record<string, ModQuest> | undefined; if (!qs) continue;
      for (const [k, q] of Object.entries(qs)) out.push({ key: m.b.manifest.id + ':' + k, mod: m.b.manifest.id, ...q });
    }
    return out;
  }
  key(k: string) {
    for (const m of this.mods) { const cb = m.hotkeys.get(k); if (cb && !m.dead) { this.safe(m, 'hotkey', () => cb(this.face(m))); return true; } }
    return false;
  }
  panel(modId: string, id: string) {
    const m = this.mods.find((x) => x.b.manifest.id === modId); const p = m?.panels.get(id); if (!m || !p) return null;
    const nodes = this.safe(m, 'panel.render', () => p.render(this.face(m)));
    return { title: p.title, sub: p.sub, nodes: Array.isArray(nodes) ? nodes : [{ type: 'text', text: '（面板出错了，详见控制台）', color: '#b8302a' }] };
  }

  /** 给模组看的游戏外观（只暴露这些；每个模组一份，任务、文件、面板按模组分开） */
  private face(m: Mod): ModGame {
    const had = this.faces.get(m); if (had) return had;
    const host = this, mid = m.b.manifest.id;
    const G = () => host.game!;
    const D = (id: string) => { const d = G().npcs.byId.get(id); if (!d) throw new Error(`没有这个人：${id}`); return d; };
    const file = (f: string, kind: 'audio' | 'image') => { const u = f.startsWith('data:') ? f : m.b.files[f]; return u && u.startsWith(`data:${kind}/`) ? u : null; };
    const quests = () => { const b = host.bag(mid) as any; return (b.__quests ??= {}) as Record<string, ModQuest>; };
    const f: ModGame = {
      get day() { return G().day; },
      get hero() {
        const g = G(), h = g.hero, p = g.player;
        return { name: h.name ?? '苏寒', realm: h.realm, stage: h.stage, hp: h.hp, mp: h.mp, x: p.x, y: p.y, map: ACTIVE_MAP,
          exp: Math.floor(h.exp), need: C.need(h), age: Math.floor(h.age), life: C.maxLife(h), root: h.root, gongfa: h.gongfa, talents: [...h.talents],
          rep: g.ws.rep, lingshi: C.bagCount(h, 'mat_lingshi'), kills: h.kills ?? 0,
          arts: h.arts.map((a) => ({ id: a.id, xp: a.xp })), bag: h.bag.map((b) => ({ id: b.id, n: b.n, age: b.age })) };
      },
      bagCount: (id) => C.bagCount(G().hero, id),
      giveItem: (id, n = 1) => { if (!ITEMS[id]) throw new Error(`没有物品 ${id}`); if (!C.addItem(G().hero, id, n)) throw new Error('物品数量无效或超出安全范围'); G().updateUI(true); },
      takeItem: (id, n = 1) => { const h = G().hero; if (!Number.isSafeInteger(n) || n < 0 || C.bagCount(h, id) < n) return false; if (C.removeItem(h, id, n) !== n) return false; G().updateUI(true); return true; },
      learnArt: (id) => { const ok = learnArt(G(), id); if (ok) G().updateUI(true); return ok; },
      knowsArt: (id) => G().hero.arts.some((a) => a.id === id),
      spawnEnemy: (id, dx = 300, dy = 0, realm) => {
        const def = ENEMIES[id]; if (!def) throw new Error(`没有敌人 ${id}`);
        const g = G(), p = g.player, rs = realm !== undefined ? { realm, stage: 1 } : lvRealm(def.lv?.[0] ?? 1);
        const e = new EnemyC(def, p.x + dx, p.y + dy, rs.realm, rs.stage, !g.terrain.isLand(p.x + dx, p.y + dy));
        e.aggro = true; g.combat.enemies.push(e);
      },
      toast: (text, tone = 'info') => G().toast(String(text).slice(0, 200), tone),
      news: (text) => G().news(String(text).slice(0, 200), 'personal'),
      dialog: (d) => {
        const node = toNode(d);
        // 别的对话 / 面板开着时先排队，等它关了再弹（不抢开场剧情）
        if (G().modal) host.queue.push(node); else G().openDialog(node);
      },
      openShop: (s) => {
        const stock = (s.items ?? []).slice(0, 60).map((it) => {
          const d = ITEMS[it.id]; if (!d) throw new Error(`商店里的物品 ${it.id} 不存在`);
          return { id: it.id, price: Math.max(0, Math.round(it.price ?? d.price)), n: Math.max(1, Math.min(999, Math.round(it.n ?? 1))) };
        });
        G().openShop({ title: String(s.title).slice(0, 30), desc: s.desc ? String(s.desc).slice(0, 300) : undefined, stock, sellRate: clampN(s.sellRate, 0, 1, 0.4), noSell: !!s.noSell });
      },
      // ---------------- 世界与人物
      get time() { const g = G(); return { phase: g.dayPhase, night: g.night }; },
      get nearLocation() { const l = G().nearbyLocation(); return l ? host.locInfo(l) : null; },
      location: (id) => { const l = LOC_BY_ID.get(id); return l ? host.locInfo(l) : null; },
      npc: (id) => host.npcInfo(id),
      addFavor: (id, n) => { const d = G().npcs.byId.get(id); if (!d) return null; d.favor = clampN(d.favor + clampN(n, -30, 30, 0), -100, 100); return Math.round(d.favor); },
      spar: (id) => {
        const g = G(), d = D(id); if (!d.alive || d.realm <= 0 || g.combat.enemies.some((e) => e.npcId === id && !e.dead)) return false;
        const a = g.npcs.activeOf(id) ?? g.npcs.summon(id); if (!a) return false;
        g.npcs.toEnemy(a, true, true); return true;
      },
      follow: (id, on) => { const g = G(), d = D(id); if (!d.alive) return false; if (on) return !!g.npcs.summon(id); g.npcs.dismiss(id); return true; },
      addExp: (n) => {
        const g = G(), h = g.hero, amt = clampN(n, 0, C.need(h) * 3, 0); if (!amt) return 0;
        const msgs: C.Msg[] = []; const gained = C.gainExp(h, amt, msgs); (g as any).flushMsgs?.(msgs); g.updateUI(true); return gained;
      },
      heal: (hp, mp = 0) => { const h = G().hero; h.hp = Math.min(1, h.hp + clampN(hp, 0, 1)); h.mp = Math.min(1, h.mp + clampN(mp, 0, 1)); G().updateUI(true); },
      teleport: (x, y) => {
        const g = G(), T = g.terrain;
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > T.W * WORLD_SCALE || y > T.H * WORLD_SCALE || T.walkFactor(x, y) <= 0) return false;
        g.teleport(x, y); return true;
      },
      rest: (days) => {
        const g = G(), n = Math.round(clampN(days, 1, 30, 1));
        g.passDays(n); g.npcs.catchUp(); g.hero.hp = 1; g.hero.mp = 1; g.updateUI(true);
      },
      tavern: (locId) => {
        const g = G(), l = locId ? LOC_BY_ID.get(locId) : g.nearbyLocation();
        if (!l) throw new Error(locId ? `没有地点 ${locId}` : '附近没有地点');
        const n = g.towns.tavern(l); n.speaker = `${l.name} · ${l.label ?? '茶馆'}`;
        if (g.modal && g.modal.kind !== 'dialog') host.queue.push(n); else g.openDialog(n);   // 从对话选项里调用：直接接着说
      },
      guide: (x, y, name) => { const g = G(); if (!name) { g.guide = null; return; } g.setGuide(x, y, String(name).slice(0, 30)); },
      quest: {
        set: (id, q) => {
          if (!q || typeof q.title !== 'string') throw new Error('任务要写 title');
          quests()[String(id)] = { title: q.title.slice(0, 30), text: q.text ? String(q.text).slice(0, 80) : undefined, have: q.have, need: q.need, x: q.x, y: q.y, done: !!q.done };
        },
        remove: (id) => { delete quests()[String(id)]; },
        get: (id) => quests()[String(id)] ?? null,
      },
      // ---------------- 表现
      fx: (kind, x, y, o = {}) => {
        if (!['ring', 'strike', 'pillar', 'flash', 'aura', 'beam'].includes(kind)) throw new Error(`特效类型 ${kind} 不对（ring strike pillar flash aura beam）`);
        G().combat.vfx.push({ kind, x, y, x2: o.x2, y2: o.y2, r: clampN(o.r, 5, 1500, 100), t: 0, dur: clampN(o.dur, 0.1, 5, 0.6), color: safeCol(o.color, '255,230,170'), fx: o.fx as any } as any);
      },
      floatText: (x, y, text, color = '#ffe8a0', big = false) => { G().combat.texts.push({ x, y, s: String(text).slice(0, 20), color: cssCol(color, '#ffe8a0'), t: 0, vy: -60, big } as any); },
      shake: (n) => { const g = G(); g.trauma = Math.min(1, g.trauma + clampN(n, 0, 1)); },
      flash: (color, a = 0.6) => { const g = G(), c = safeCol(color, '255,255,255').split(',').map((v) => Math.min(255, +v) / 255); g.modFlash = { c: [c[0], c[1], c[2]], a: clampN(a, 0, 1) }; },
      slowmo: (sec) => G().slowmo(clampN(sec, 0, 0.6)),
      sound: (fl, o = {}) => { const u = file(fl, 'audio'); if (!u) throw new Error(`声音 ${fl} 不是包里的 mp3 / ogg / wav`); audio.playData(`mod:${mid}:${fl.length > 100 ? fl.length + fl.slice(-40) : fl}`, u, { vol: clampN(o.vol, 0, 2, 1), rate: o.rate ? clampN(o.rate, 0.25, 4) : undefined, x: o.x, y: o.y }); },
      music: (fl, vol = 0.8) => {
        if (fl === null) { audio.musicData(null, null); return; }
        const u = file(fl, 'audio'); if (!u) throw new Error(`音乐 ${fl} 不是包里的 mp3 / ogg / wav`);
        audio.musicData(`mod:${mid}:bgm:${fl.length > 100 ? fl.length + fl.slice(-40) : fl}`, u, clampN(vol, 0, 1.5, 0.8));
      },
      // ---------------- v5：改主角
      setRealm: (realm, stage = 0) => { const h = G().hero; h.realm = Math.round(clampN(realm, 0, 5)); h.stage = Math.round(clampN(stage, 0, REALMS[h.realm].stages.length - 1)); h.exp = 0; G().updateUI(true); },
      setExp: (n) => { const h = G().hero; h.exp = Math.floor(clampN(n, 0, C.need(h))); G().updateUI(true); },
      addLife: (years) => { const h = G().hero; h.lifeBonus += clampN(years, -1000, 10000, 0); G().updateUI(true); },
      setRoot: (rid) => { if (!ROOTS.some((r) => r.id === rid)) throw new Error(`没有灵根 ${rid}`); G().hero.root = rid; G().updateUI(true); },
      setGongfa: (gid) => { if (!GONGFA[gid]) throw new Error(`没有功法 ${gid}`); G().hero.gongfa = gid; G().updateUI(true); },
      addTalent: (tid) => { if (!TALENTS.some((t) => t.id === tid)) throw new Error(`没有天赋 ${tid}`); const h = G().hero; if (h.talents.includes(tid)) return false; h.talents.push(tid); G().updateUI(true); return true; },
      removeTalent: (tid) => { const h = G().hero, i = h.talents.indexOf(tid); if (i < 0) return false; h.talents.splice(i, 1); G().updateUI(true); return true; },
      forgetArt: (aid) => { const h = G().hero, i = h.arts.findIndex((a) => a.id === aid); if (i < 0) return false; h.arts.splice(i, 1); h.hotbar = h.hotbar.map((x) => (x === aid ? null : x)); G().updateUI(true); return true; },
      setRep: (n) => { G().ws.rep = Math.round(clampN(n, -100, 100)); G().updateUI(true); },
      // ---------------- v5：战斗
      enemies: (radius = 1200) => {
        const g = G(), p = g.player, R = clampN(radius, 0, 20000, 1200);
        return g.combat.enemies.filter((e) => !e.dead && Math.hypot(e.x - p.x, e.y - p.y) <= R)
          .map((e) => ({ ref: e.id, id: e.def.id, name: e.name, x: e.x, y: e.y, hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), realm: e.realm, npcId: e.npcId }));
      },
      damage: (ref, amount, o = {}) => {
        const g = G(), e = g.combat.enemies.find((x) => x.id === ref && !x.dead); if (!e) return false;
        g.combat.hitEnemy(e, clampN(amount, 0, 1e9), { realm: g.hero.realm, stCh: 1, status: o.status as any }, g.player.x, g.player.y);
        return true;
      },
      hurtHero: (amount, realm) => { const g = G(); g.combat.hitPlayer(clampN(amount, 0, 1e9), realm ?? g.hero.realm, undefined, g.player.x, g.player.y); },
      addStatus: (target, sid, dur) => host.addStatus(target, sid, dur),
      hasStatus: (target, sid) => !!host['sts'].get(String(target))?.has(sid),
      // ---------------- v5：世界
      setWeather: (kind) => { const W = G().weather; if (kind !== null && !['clear', 'rain', 'storm', 'snow', 'fog', 'sand'].includes(kind)) throw new Error(`没有天气 ${kind}`); W.forced = kind as any; },
      travel: (map, locId) => {
        const isLegacy = (LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(map);
        if (!ALL_MAP_IDS.includes(map as MapId) && !isLegacy) throw new Error(`没有地图 ${map}（${ALL_MAP_IDS.join(' ')}）`);
        const targetMap: MapId = isLegacy ? 'renjie' : (map as MapId);
        const g = G();
        if (targetMap === ACTIVE_MAP && !locId && !isLegacy) return false;
        const legacyFilter = (x: LocDef) =>
          map === 'dajin' ? x.oy <= 350 : map === 'luanxing' ? x.ox <= 200 && x.oy > 350 : x.ox > 200 && x.oy > 350;
        const pool = isLegacy ? locsOf('renjie').filter(legacyFilter) : locsOf(targetMap);
        const l = (locId ? LOC_BY_ID.get(locId) : null) ?? pool.find((x) => x.type === 'city') ?? pool[0] ?? locsOf(targetMap)[0];
        if (!l || l.map !== targetMap) throw new Error(`地点 ${locId} 不在 ${map}`);
        return g.travel.go(targetMap, l.x * WORLD_SCALE, l.y * WORLD_SCALE + 300, 0, 'portal');
      },
      get story() { const t = G().story?.tracker(); return t ? { chapter: String(t.ch ?? ''), title: String(t.title ?? ''), text: String(t.text ?? '') } : null; },
      openPanel: (id) => { if (!m.panels.has(id)) throw new Error(`没有面板 ${id}（先 api.ui.panel 注册）`); G().openModal({ kind: 'mod', mod: mid, panel: id }); },
    };
    this.faces.set(m, f);
    return f;
  }
}

/** 模组对话 → 游戏对话节点（递归：next / act 返回的对话都转过去） */
function toNode(d: import('./types').ModDialog, depth = 0): DNode {
  if (!d || typeof d !== 'object') throw new Error('对话要是一个对象 { speaker, text, options }');
  if (depth > 40) throw new Error('对话嵌套太深');
  const node: DNode = {
    speaker: String(d.speaker ?? '').slice(0, 30), title: d.title ? String(d.title).slice(0, 30) : undefined, text: String(d.text ?? '').slice(0, 4000),
    mood: d.mood ?? 'mystic', portrait: typeof d.portrait === 'string' && d.portrait.startsWith('data:image/') ? d.portrait : undefined,
    options: (d.options ?? []).slice(0, 8).map((o) => ({
      label: String(o.label).slice(0, 40), hint: o.hint ? String(o.hint).slice(0, 80) : undefined, disabled: !!o.disabled,
      tone: o.tone === 'jade' ? 'good' as const : o.tone,
      act: () => {
        let r: unknown;
        try { r = o.act?.(); } catch (e) { console.warn('[模组] 对话选项出错', e); return null; }
        const nx = r && typeof r === 'object' ? r as import('./types').ModDialog : o.next;
        if (!nx) return null;
        try { return toNode(nx, depth + 1); } catch (e) { console.warn('[模组] 下一段对话写法不对', e); return null; }
      },
    })),
  };
  if (!node.options.length) node.options = [{ label: '告辞', act: () => null }];
  (node as any).__mod = node.speaker;   // 标记：这是模组的对话（试跑工具据此识别）
  return node;
}

/** 把模组代码当 ES 模块导入，取默认导出 */
async function importModule(code: string): Promise<unknown> {
  let url: string, revoke = false;
  const node = !!(globalThis as any).process?.versions?.node;   // Node（测试）只认 data: 网址；浏览器用 blob: 网址
  if (!node && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); revoke = true;
  } else {
    url = 'data:text/javascript;base64,' + (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(code))) : (globalThis as any).Buffer.from(code, 'utf8').toString('base64'));
  }
  try { const m = await import(/* @vite-ignore */ url); return m.default; }
  finally { if (revoke) URL.revokeObjectURL(url); }
}

export const modHost = new ModHost();
