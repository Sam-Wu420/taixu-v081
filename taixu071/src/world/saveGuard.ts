import { validateSavedDrops } from './savedDrops';
import { parseFog } from './fog';
import { REALMS } from '../data/realms';
import { bagTotals } from './inventoryNumbers';
import { isPlayableWorld, isWorldId, LEGACY_HUMAN_MAP_IDS, worldOfMap } from '../data/worldHierarchy';
export const SAVE_VERSION = 3;
// 写入存档前检查关键数值。JSON.stringify 会把 NaN/Infinity 悄悄变为 null，
// 应在覆盖旧存档前阻止。此处不是全量数值系统或存档 schema 校验。
export class SaveNumberError extends Error {
  constructor(public field: string) { super(`invalid save number: ${field}`); this.name = 'SaveNumberError'; }
}
export function validateSaveNumbers(data: {
  day: number; clock: number; p: { x: number; y: number };
  hero: { age: number; realm: number; stage: number; exp: number; hp: number; mp: number; bag: { id: string; n: number }[] };
}) {
  const values: [string, number][] = [
    ['day', data.day], ['clock', data.clock], ['p.x', data.p.x], ['p.y', data.p.y],
    ['hero.age', data.hero.age], ['hero.realm', data.hero.realm], ['hero.stage', data.hero.stage],
    ['hero.exp', data.hero.exp], ['hero.hp', data.hero.hp], ['hero.mp', data.hero.mp],
  ];
  for (const [field, value] of values) if (typeof value !== 'number' || !Number.isFinite(value)) throw new SaveNumberError(field);
  if (!Number.isInteger(data.hero.realm) || !REALMS[data.hero.realm]) throw new SaveNumberError('hero.realm');
  if (!Number.isInteger(data.hero.stage) || data.hero.stage < 0 || data.hero.stage >= REALMS[data.hero.realm].stages.length) throw new SaveNumberError('hero.stage');
  if (data.hero.exp < 0) throw new SaveNumberError('hero.exp');
  if (!Array.isArray(data.hero.bag) || !bagTotals(data.hero.bag)) throw new SaveNumberError('hero.bag');
}

/** 阻止 JSON 把任意深度的 NaN/Infinity 静默转成 null；循环及 BigInt 由 JSON 自身报错。 */
export function stringifySave(data: unknown): string {
  return JSON.stringify(data, (key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new SaveNumberError(key || 'root');
    return value;
  });
}

// 读档预检在修改游戏对象或切图之前执行。允许旧档缺少后来新增的可选字段，
// 但拒绝明确损坏的关键结构；这不是完整 schema，也不保证后续子系统不抛错。
export function validateSaveForLoad(d: any, maps: readonly string[], worldScale: number): void {
  const object = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const fail = (field: string): never => { throw new Error(`invalid save field: ${field}`); };
  const num = (v: any, field: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(field); };
  if (!object(d)) fail('root');
  // JSON.parse 可将 1e400 解析成 Infinity；嵌套在模组、世界与角色字段中同样危险。
  // __proto__ 在 Object.assign 到运行态对象时会修改对象原型，不能把它作为存档字段。
  // 迭代遍历避免深层存档耗尽调用栈；不拒绝未知字段，保留模组数据。
  const pending: any[] = [d], seen = new WeakSet<object>();
  while (pending.length) {
    const v = pending.pop();
    if (!v || typeof v !== 'object' || seen.has(v)) continue;
    seen.add(v);
    for (const key of Object.keys(v)) {
      if (key === '__proto__') fail('unsafe key');
      const value = v[key];
      if (typeof value === 'number' && !Number.isFinite(value)) fail('non-finite number');
      if (value && typeof value === 'object') pending.push(value);
    }
  }
  const okMap = (m: unknown): m is string => typeof m === 'string' && (maps.includes(m) || (maps.includes('renjie') && (LEGACY_HUMAN_MAP_IDS as readonly string[]).includes(m)));
  if (!object(d.p)) fail('p');
  num(d.p.x, 'p.x'); num(d.p.y, 'p.y');
  if (d.worldId != null && !isPlayableWorld(d.worldId)) fail('worldId');
  if (d.map != null && !okMap(d.map)) fail('map');
  if (d.worldId != null && d.map != null && worldOfMap(d.map) !== d.worldId) fail('worldId.map');
  if (d.ws != null) { num(d.ws, 'ws'); if (d.ws <= 0) fail('ws'); }
  const wk = worldScale / (d.ws ?? (d.hero?.arts ? 180 : 100));
  if (!Number.isFinite(wk) || !Number.isFinite(d.p.x * wk) || !Number.isFinite(d.p.y * wk)) fail('scaled position');
  for (const field of ['v', 'day', 'clock', 'zoom', 'time']) if (d[field] != null) num(d[field], field);
  if (d.zoom != null && d.zoom <= 0) fail('zoom');
  if (d.v != null && (!Number.isInteger(d.v) || d.v < 0 || d.v > SAVE_VERSION)) fail('v');
  if (d.hero != null) {
    if (!object(d.hero)) fail('hero');
    for (const field of ['age', 'realm', 'stage', 'exp', 'hp', 'mp']) if (d.hero[field] !== undefined) num(d.hero[field], `hero.${field}`);
    if (d.hero.bag !== undefined) {
      if (!Array.isArray(d.hero.bag)) fail('hero.bag');
      if (!bagTotals(d.hero.bag)) fail('hero.bag');
    }
    if (d.hero.stats != null) {
      if (!object(d.hero.stats)) fail('hero.stats');
      for (const k of ['meditateDays', 'gathered', 'pills', 'breaks', 'failed', 'alchemy']) {
        if (d.hero.stats[k] !== undefined) {
          num(d.hero.stats[k], `hero.stats.${k}`);
          if (d.hero.stats[k] < 0) fail(`hero.stats.${k}`);
        }
      }
    }
    for (const k of ['talents', 'looted']) if (d.hero[k] !== undefined &&
      (!Array.isArray(d.hero[k]) || d.hero[k].some((v: any) => typeof v !== 'string'))) fail(`hero.${k}`);
    if (d.hero.talentLevels !== undefined && (!Array.isArray(d.hero.talentLevels) ||
      d.hero.talentLevels.some((v: any) => !Number.isSafeInteger(v) || v < 0))) fail('hero.talentLevels');
    if (d.hero.pendingTalent != null && (!Array.isArray(d.hero.pendingTalent) ||
      d.hero.pendingTalent.some((v: any) => typeof v !== 'string'))) fail('hero.pendingTalent');
    if (Array.isArray(d.hero.arts) && d.hero.arts.some((a: any) => !object(a) || typeof a.id !== 'string' ||
      (a.xp !== undefined && (typeof a.xp !== 'number' || !Number.isFinite(a.xp) || a.xp < 0)))) fail('hero.arts');
    if (Array.isArray(d.hero.hotbar) && d.hero.hotbar.length === 9 &&
      d.hero.hotbar.some((v: any) => v !== null && typeof v !== 'string')) fail('hero.hotbar');
    if (d.hero.equip != null) {
      if (!object(d.hero.equip)) fail('hero.equip');
      for (const k of ['armor', 'shield', 'flight', 'boots']) if (d.hero.equip[k] != null && typeof d.hero.equip[k] !== 'string') fail(`hero.equip.${k}`);
    }
    if (d.hero.bottle !== undefined) {
      if (!object(d.hero.bottle)) fail('hero.bottle');
      if (!Number.isSafeInteger(d.hero.bottle.drops) || d.hero.bottle.drops < 0) fail('hero.bottle.drops');
      num(d.hero.bottle.charge, 'hero.bottle.charge');
      if (d.hero.bottle.charge < 0) fail('hero.bottle.charge');
    }
    if (d.hero.age !== undefined && d.hero.age < 0) fail('hero.age');
  }
  // 校验 load 实际采用的境界与小境界，避免在修改运行状态后访问不存在的境界。
  // 人界目前最高化神初期；未来新增世界需要显式迁移，不能静默截断未知境界。
  const modern = d.v >= 2 && d.hero;
  const realm = modern ? (d.hero.realm ?? 1) : (d.p.realm ?? 1);
  const stage = modern ? (d.hero.stage ?? 4) : (d.p.stage ?? 0);
  if (!Number.isInteger(realm) || !REALMS[realm]) fail(modern ? 'hero.realm' : 'p.realm');
  if (!Number.isInteger(stage) || stage < 0 || stage >= REALMS[realm].stages.length) fail(modern ? 'hero.stage' : 'p.stage');
  if (modern && d.hero.exp !== undefined && d.hero.exp < 0) fail('hero.exp');
  if (d.savedDrops !== undefined) validateSavedDrops(d.savedDrops, maps, wk);
  if (d.world != null && !object(d.world)) fail('world');
  if (d.world != null) {
    if (d.world.world !== undefined && !isWorldId(d.world.world)) fail('world.world');
    for (const k of ['hearts','flags','events','kills','sites','shopCache','auctions','worlds'])
      if (d.world[k] !== undefined && !object(d.world[k])) fail(`world.${k}`);
    for (const k of ['news','tp','hints','pets','letters','bounties','caches','zf','rumors','myArts','ascendedWorlds'])
      if (d.world[k] !== undefined && !Array.isArray(d.world[k])) fail(`world.${k}`);
    if (Array.isArray(d.world.ascendedWorlds) && d.world.ascendedWorlds.some((w: any) => !isWorldId(w))) fail('world.ascendedWorlds');
  }
  if (d.nodes != null && (!Array.isArray(d.nodes) || d.nodes.some((n: any) => !Array.isArray(n) || n.length < 2 || typeof n[0] !== 'string' || typeof n[1] !== 'number' || !Number.isFinite(n[1])))) fail('nodes');
  if (d.npcs != null) {
    if (!Array.isArray(d.npcs) || d.npcs.some((n: any) => !object(n))) fail('npcs');
    // 统一地图的旧档只合并人物状态，不读取坐标；三地图档要确保缩放后坐标可用。
    if (d.map != null) for (const n of d.npcs) {
      if (typeof n.id !== 'string' || !n.id || typeof n.name !== 'string') fail('npcs.identity');
      for (const k of ['x','y','tx','ty']) {
        num(n[k], `npcs.${k}`); if (!Number.isFinite(n[k] * wk)) fail(`npcs.${k}`);
      }
      for (const k of ['realm','stage','age','life']) num(n[k], `npcs.${k}`);
      if (!Number.isInteger(n.realm) || n.realm < 0 || !Number.isInteger(n.stage) || n.stage < 0) fail('npcs.realm');
      if (n.map != null && !okMap(n.map)) fail('npcs.map');
    }
  }
  if (d.fog != null) { if (typeof d.fog !== 'string') fail('fog'); try { parseFog(d.fog); } catch { fail('fog'); } }
  if (d.fogs != null) {
    if (!object(d.fogs)) fail('fogs');
    for (const v of Object.values(d.fogs)) if (v != null) {
      if (typeof v !== 'string') fail('fogs');
      try { parseFog(v as string); } catch { fail('fogs'); }
    }
  }
}
