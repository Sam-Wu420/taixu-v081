import {
  ACTIVE_MAP,
  ACTIVE_WORLD,
  ALL_MAP_IDS,
  LOC_BY_ID,
  TN_DX,
  TN_OX,
  TN_SX,
  WORLD_SCALE,
  fromLegacyWorld,
  fromMap,
  mapSize,
  migrateHumanPoint,
  type MapId,
} from '../data/world';
import {
  LEGACY_HUMAN_MAP_IDS,
  isWorldId,
  worldOfMap,
  type LegacyHumanMapId,
} from '../data/worldHierarchy';
import { isLegacyHumanMapId } from './contracts';
import { decodeFog, encodeFog, parseFog } from './fog';
import { restoreSavedDrops, type SavedDrop } from './savedDrops';
import type { WorldDrop } from './combatDropSafety';
import { ensureWorldSlice, migrateSectState, type WorldState } from './worldstate';

export interface SaveLocationMigration {
  map: MapId;
  px: number;
  py: number;
  wk: number;
  ljScale: number;
  legacy: boolean;
  oldHumanMap: LegacyHumanMapId | null;
  hasOldLingjieFog: boolean;
  oldLingjie: boolean;
  oldTiannan: boolean;
}

export function resolveSaveLocation(
  d: any,
  worldScale: number = WORLD_SCALE,
  fogCell: number = 1000,
): SaveLocationMigration {
  // 地图比例变化（第三步 180 → 第四步 300）：坐标与迷雾按比例迁移
  const ws0 = d.ws ?? (d.hero?.arts ? 180 : 100);
  const wk = worldScale / ws0;
  // 第十六步：三图。旧存档（统一大地图）按位置迁到对应的新图
  const legacy = !d.map;
  const oldHumanMap: LegacyHumanMapId | null = !legacy && isLegacyHumanMapId(d.map) ? d.map : null;
  const hasOldLingjieFog = !legacy && typeof d.fogs?.lingjie === 'string' && parseFog(d.fogs.lingjie).length === 720 * 480;
  const oldLingjie = hasOldLingjieFog && d.map === 'lingjie';
  const oldTnW = Math.ceil(1000 * worldScale / fogCell);
  const oldTnH = Math.ceil(700 * worldScale / fogCell);
  const oldTiannan = !legacy && typeof d.fogs?.tiannan === 'string' && parseFog(d.fogs.tiannan).length === oldTnW * oldTnH;
  const ljScale = oldLingjie ? 1.5 : 1;

  let map: MapId = oldHumanMap ? 'renjie' : (d.map ?? 'renjie');
  let px = d.p.x * wk * ljScale + (oldHumanMap === 'tiannan' && oldTiannan ? TN_DX * worldScale : 0);
  let py = d.p.y * wk * ljScale;
  if (oldHumanMap) {
    const [rx, ry] = migrateHumanPoint(oldHumanMap, px / worldScale, py / worldScale);
    px = rx * worldScale;
    py = ry * worldScale;
  } else if (legacy) {
    const r = fromLegacyWorld(px, py);
    map = r.map;
    px = r.x;
    py = r.y;
  }
  return {
    map,
    px,
    py,
    wk,
    ljScale,
    legacy,
    oldHumanMap,
    hasOldLingjieFog,
    oldLingjie,
    oldTiannan,
  };
}

export function migrateSaveFogs(
  d: any,
  activeMap: MapId,
  explored: Uint8Array,
  mig: SaveLocationMigration,
  fogCell: number,
  worldScale: number,
  migrateLegacyFogFn: (fog: string, ws0: number) => Partial<Record<MapId, string>>,
): Partial<Record<MapId, string>> | null {
  explored.fill(0);
  if (d.fogs) {
    const fogs = { ...d.fogs } as Partial<Record<MapId, string>>;
    if (mig.hasOldLingjieFog) {
      const ljSz = mapSize('lingjie');
      const ljW = Math.ceil(ljSz.W * worldScale / fogCell);
      const ljH = Math.ceil(ljSz.H * worldScale / fogCell);
      const oldArr = new Uint8Array(720 * 480);
      decodeFog(d.fogs.lingjie, oldArr);
      const ljArr = activeMap === 'lingjie' ? explored : new Uint8Array(ljW * ljH);
      for (let y = 0; y < ljH; y++) {
        const oy = Math.min(479, Math.floor(y / 1.5));
        for (let x = 0; x < ljW; x++) {
          const ox = Math.min(719, Math.floor(x / 1.5));
          if (oldArr[oy * 720 + ox]) ljArr[y * ljW + x] = 1;
        }
      }
      fogs.lingjie = encodeFog(ljArr);
    }
    if (!d.fogs.renjie && LEGACY_HUMAN_MAP_IDS.some((m) => typeof d.fogs[m] === 'string')) {
      // 合并旧人界三图（天南/沧溟海/中州）迷雾至统一 renjie 迷雾（反向采样无空洞）
      const rSz = mapSize('renjie');
      const rW = Math.ceil(rSz.W * worldScale / fogCell);
      const rH = Math.ceil(rSz.H * worldScale / fogCell);
      const rArr = activeMap === 'renjie' ? explored : new Uint8Array(rW * rH);
      const cellM = fogCell / worldScale;
      const srcs: { arr: Uint8Array; w: number; h: number; ox: number; oy: number; sx: number; sy: number }[] = [];
      const tnSz = mig.oldTiannan
        ? { W: 1000, H: 700, ox: 0, oy: 262, sx: 1.6, sy: 1.6 }
        : { W: 4800, H: 2600, ox: TN_OX, oy: 262, sx: TN_SX, sy: 1.6 };
      const legacySpecs: Record<LegacyHumanMapId, { W: number; H: number; ox: number; oy: number; sx: number; sy: number }> = {
        tiannan: tnSz,
        luanxing: { W: 800, H: 840, ox: 600, oy: 280, sx: 2.0, sy: 2.0 },
        dajin: { W: 1200, H: 880, ox: 0, oy: 0, sx: 1.46, sy: 2.65 },
      };
      for (const om of LEGACY_HUMAN_MAP_IDS) {
        const fstr = d.fogs[om];
        if (typeof fstr !== 'string') continue;
        const ls = legacySpecs[om];
        const fw = Math.ceil(ls.W * worldScale / fogCell);
        const fh = Math.ceil(ls.H * worldScale / fogCell);
        const arr = new Uint8Array(fw * fh);
        decodeFog(fstr, arr);
        srcs.push({ arr, w: fw, h: fh, ox: ls.ox, oy: ls.oy, sx: ls.sx, sy: ls.sy });
      }
      for (let fy = 0; fy < rH; fy++) {
        const ry = (fy + 0.5) * cellM;
        for (let fx = 0; fx < rW; fx++) {
          const rx = (fx + 0.5) * cellM;
          const [lx, ly] = fromMap('renjie', rx, ry);
          for (const s of srcs) {
            const cx = Math.floor((lx - s.ox) * s.sx / cellM);
            const cy = Math.floor((ly - s.oy) * s.sy / cellM);
            if (cx >= 0 && cx < s.w && cy >= 0 && cy < s.h && s.arr[cy * s.w + cx]) {
              rArr[fy * rW + fx] = 1;
              break;
            }
          }
        }
      }
      fogs.renjie = encodeFog(rArr);
      for (const om of LEGACY_HUMAN_MAP_IDS) delete (fogs as any)[om];
      if (activeMap !== 'renjie' && !(mig.hasOldLingjieFog && activeMap === 'lingjie')) {
        decodeFog(fogs[activeMap], explored);
      }
    } else if (!(mig.hasOldLingjieFog && activeMap === 'lingjie')) {
      decodeFog(fogs[activeMap], explored);
    }
    return fogs;
  }
  if (d.fog) {
    const fogs = migrateLegacyFogFn(d.fog, mig.wk ? worldScale / mig.wk : 180);
    decodeFog(fogs[activeMap], explored);
    return fogs;
  }
  return null;
}

export function migrateSavedDrops(
  rawSavedDrops: Record<string, SavedDrop[]> | undefined,
  activeMap: MapId,
  mig: SaveLocationMigration,
  worldScale: number,
): { savedDrops: Partial<Record<MapId, SavedDrop[]>>; activeLoot: WorldDrop[] } {
  const savedDrops: Record<string, SavedDrop[]> = { ...(rawSavedDrops ?? {}) };
  const activeLoot = restoreSavedDrops(savedDrops[activeMap] ?? [], mig.wk * mig.ljScale);
  for (const om of LEGACY_HUMAN_MAP_IDS) {
    const oldList = savedDrops[om];
    if (!Array.isArray(oldList) || !oldList.length) {
      delete savedDrops[om];
      continue;
    }
    for (const dr of oldList) {
      const wx = dr.x * mig.wk + (om === 'tiannan' && mig.oldTiannan ? TN_DX * worldScale : 0);
      const wy = dr.y * mig.wk;
      const [rx, ry] = migrateHumanPoint(om, wx / worldScale, wy / worldScale);
      if (activeMap === 'renjie') {
        activeLoot.push({ x: rx * worldScale, y: ry * worldScale, id: dr.id, n: dr.n, t: 0, blocked: true });
      } else {
        (savedDrops.renjie ??= []).push({ x: rx * worldScale, y: ry * worldScale, id: dr.id, n: dr.n });
      }
    }
    delete savedDrops[om];
  }
  for (const mapId of ALL_MAP_IDS) {
    if (mapId !== activeMap && savedDrops[mapId]) {
      const dropScale = mig.wk * (mig.hasOldLingjieFog && mapId === 'lingjie' ? 1.5 : 1);
      savedDrops[mapId] = savedDrops[mapId].map((v) => ({ ...v, x: v.x * dropScale, y: v.y * dropScale }));
    }
  }
  return { savedDrops: savedDrops as Partial<Record<MapId, SavedDrop[]>>, activeLoot };
}

export function migrateWorldStateAndCoords(
  ws: WorldState,
  saveWorldId: unknown,
  mig: SaveLocationMigration,
  worldScale: number,
): void {
  ws.world = isWorldId(saveWorldId) ? saveWorldId : (isWorldId(ws.world) ? ws.world : ACTIVE_WORLD);
  const curWorldSlice = ensureWorldSlice(ws, ws.world);
  migrateSectState(ws.sect);
  for (const sl of Object.values(ws.worlds ?? {})) migrateSectState(sl?.sect);

  // 跨界宗门隔离迁移：若当前 ws.sect / ws.mySect 或当前位面分片仍残留着其他位面的宗门，则自动封存回对应位面分片
  if (curWorldSlice.sect) {
    const sloc = LOC_BY_ID.get(curWorldSlice.sect.id);
    const sworld = sloc ? worldOfMap(sloc.map) : undefined;
    if (sworld && sworld !== ws.world) {
      const oldSlice = ensureWorldSlice(ws, sworld);
      if (!oldSlice.sect) oldSlice.sect = curWorldSlice.sect;
      curWorldSlice.sect = null;
    }
  }
  if (curWorldSlice.mySect) {
    const mworld = worldOfMap(curWorldSlice.mySect.map);
    if (mworld !== ws.world) {
      const oldSlice = ensureWorldSlice(ws, mworld);
      if (!oldSlice.mySect) oldSlice.mySect = curWorldSlice.mySect;
      curWorldSlice.mySect = null;
    }
  }
  if (ws.sect) {
    const sloc = LOC_BY_ID.get(ws.sect.id);
    const sworld = sloc ? worldOfMap(sloc.map) : undefined;
    if (sworld && sworld !== ws.world) {
      const oldSlice = ensureWorldSlice(ws, sworld);
      if (!oldSlice.sect) oldSlice.sect = ws.sect;
      ws.sect = curWorldSlice.sect ?? null;
    }
  } else if (curWorldSlice.sect !== undefined) {
    ws.sect = curWorldSlice.sect;
  }
  if (ws.mySect) {
    const mworld = worldOfMap(ws.mySect.map);
    if (mworld !== ws.world) {
      const oldSlice = ensureWorldSlice(ws, mworld);
      if (!oldSlice.mySect) oldSlice.mySect = ws.mySect;
      ws.mySect = curWorldSlice.mySect ?? undefined;
    }
  } else if (curWorldSlice.mySect) {
    ws.mySect = curWorldSlice.mySect;
  }
  curWorldSlice.sect = ws.sect ?? null;
  curWorldSlice.mySect = ws.mySect ?? null;

  // 人界三图合图 & 灵界 1.5× 扩图坐标迁移
  const migWorldPt = (it: any, extraOx = false) => {
    if (!it) return;
    if (isLegacyHumanMapId(it.map)) {
      const om = it.map;
      const tnShift = om === 'tiannan' && mig.oldTiannan ? TN_DX * worldScale : 0;
      if (typeof it.x === 'number' && typeof it.y === 'number') {
        const [rx, ry] = migrateHumanPoint(om, (it.x + tnShift) / worldScale, it.y / worldScale);
        it.x = rx * worldScale;
        it.y = ry * worldScale;
      }
      if (extraOx && typeof it.ox === 'number') {
        const [rx, ry] = migrateHumanPoint(om, (it.ox + tnShift) / worldScale, (typeof it.oy === 'number' ? it.oy : it.y) / worldScale);
        it.ox = rx * worldScale;
        if (typeof it.oy === 'number') it.oy = ry * worldScale;
      }
      if (typeof it.tx === 'number' && typeof it.ty === 'number') {
        const [rx, ry] = migrateHumanPoint(om, (it.tx + tnShift) / worldScale, it.ty / worldScale);
        it.tx = rx * worldScale;
        it.ty = ry * worldScale;
      }
      it.map = 'renjie';
    } else if (mig.hasOldLingjieFog && it.map === 'lingjie') {
      if (typeof it.x === 'number') it.x *= 1.5;
      if (typeof it.y === 'number') it.y *= 1.5;
      if (extraOx && typeof it.ox === 'number') it.ox *= 1.5;
      if (extraOx && typeof it.oy === 'number') it.oy *= 1.5;
      if (typeof it.tx === 'number') it.tx *= 1.5;
      if (typeof it.ty === 'number') it.ty *= 1.5;
    }
  };
  const migWorldArr = (arr: any[] | undefined, extraOx = false) => {
    if (Array.isArray(arr)) for (const it of arr) migWorldPt(it, extraOx);
  };
  const migMySect = (ms: any) => {
    if (!ms || typeof ms.x !== 'number' || typeof ms.y !== 'number') return;
    if (isLegacyHumanMapId(ms.map)) {
      const om = ms.map;
      const [rx, ry] = migrateHumanPoint(om, ms.x + (om === 'tiannan' && mig.oldTiannan ? TN_DX : 0), ms.y);
      ms.x = Math.round(rx * 10) / 10;
      ms.y = Math.round(ry * 10) / 10;
      ms.map = 'renjie';
    } else if (mig.hasOldLingjieFog && ms.map === 'lingjie') {
      ms.x = Math.round(ms.x * 1.5 * 10) / 10;
      ms.y = Math.round(ms.y * 1.5 * 10) / 10;
    }
  };
  const migNpcEntry = (n: any) => {
    if (!n) return;
    if (isLegacyHumanMapId(n.map)) {
      const om = n.map;
      const tnShift = om === 'tiannan' && mig.oldTiannan ? TN_DX * worldScale : 0;
      if (typeof n.x === 'number' && typeof n.y === 'number') {
        const [rx, ry] = migrateHumanPoint(om, (n.x + tnShift) / worldScale, n.y / worldScale);
        n.x = rx * worldScale;
        n.y = ry * worldScale;
      }
      if (typeof n.tx === 'number' && typeof n.ty === 'number') {
        const [rtx, rty] = migrateHumanPoint(om, (n.tx + tnShift) / worldScale, n.ty / worldScale);
        n.tx = rtx * worldScale;
        n.ty = rty * worldScale;
      }
      n.map = 'renjie';
    } else if (mig.hasOldLingjieFog && n.map === 'lingjie') {
      if (typeof n.x === 'number') n.x *= 1.5;
      if (typeof n.y === 'number') n.y *= 1.5;
      if (typeof n.tx === 'number') n.tx *= 1.5;
      if (typeof n.ty === 'number') n.ty *= 1.5;
    }
  };
  const migFlags = (fl: any) => {
    if (!fl || typeof fl !== 'object') return;
    migWorldPt(fl.herald);
    migWorldPt(fl.great);
    for (const swObj of [fl.sectWar, fl.sw]) {
      if (!swObj || typeof swObj !== 'object') continue;
      if (Array.isArray(swObj.wars)) {
        for (const w of swObj.wars) {
          migWorldPt(w?.campA);
          migWorldPt(w?.campB);
        }
      }
      if (Array.isArray(swObj.marches)) migWorldArr(swObj.marches);
      if (Array.isArray(swObj.pendingBorders)) migWorldArr(swObj.pendingBorders);
    }
    const warJades = fl.war?.jade;
    if (Array.isArray(warJades)) {
      for (const j of warJades) {
        if (!j || typeof j.x !== 'number' || typeof j.y !== 'number') continue;
        const jm = j.map ?? mig.oldHumanMap;
        if (!isLegacyHumanMapId(jm) && !(mig.hasOldLingjieFog && jm === 'lingjie')) continue;
        j.map = jm;
        migWorldPt(j);
      }
    }
  };

  migMySect(ws.mySect);
  migWorldPt(ws.home);
  migWorldArr(ws.zf);
  migWorldArr(ws.bounties);
  migWorldArr(ws.caches, true);
  migWorldArr(ws.rumors);
  migFlags(ws.flags);
  migWorldArr((ws as any).fr?.invites);
  for (const sl of Object.values(ws.worlds ?? {})) {
    if (!sl) continue;
    migMySect(sl.mySect);
    migWorldPt(sl.home);
    migWorldArr(sl.zf);
    migWorldArr(sl.bounties);
    migWorldArr(sl.caches, true);
    migWorldArr((sl as any).rumors);
    migFlags(sl.flags);
    if (Array.isArray(sl.npcArchive)) for (const n of sl.npcArchive) migNpcEntry(n);
  }
}

export function migrateSavedNpcs(
  npcsIn: unknown,
  mig: SaveLocationMigration,
  worldScale: number,
): unknown {
  if (!Array.isArray(npcsIn)) return npcsIn;
  return npcsIn.map((n: any) => {
    const om = n?.map ?? (mig.oldHumanMap ?? (mig.oldLingjie ? 'lingjie' : 'renjie'));
    if (isLegacyHumanMapId(om)) {
      const tnShift = om === 'tiannan' && mig.oldTiannan ? TN_DX * worldScale : 0;
      const [rx, ry] = migrateHumanPoint(om, (n.x * mig.wk + tnShift) / worldScale, (n.y * mig.wk) / worldScale);
      const [rtx, rty] = migrateHumanPoint(om, (n.tx * mig.wk + tnShift) / worldScale, (n.ty * mig.wk) / worldScale);
      return {
        ...n,
        map: 'renjie',
        x: (rx * worldScale) / mig.wk,
        y: (ry * worldScale) / mig.wk,
        tx: (rtx * worldScale) / mig.wk,
        ty: (rty * worldScale) / mig.wk,
      };
    }
    if (mig.hasOldLingjieFog && om === 'lingjie') {
      return { ...n, map: 'lingjie', x: n.x * 1.5, y: n.y * 1.5, tx: n.tx * 1.5, ty: n.ty * 1.5 };
    }
    return n;
  });
}
