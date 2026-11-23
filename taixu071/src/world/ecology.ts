import type { AffixState } from './affix';

export const ECO_CHUNK = 2400;
export const ECO_ACTIVE_MAX = 48;
const ECO_MAX_CHUNKS = 320;
const ECO_BATCH_TICK = 8;

export type EcoState = 'hibernate' | 'active' | 'dead';

export interface VisRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface EcoPoint {
  x: number;
  y: number;
}

export interface EcoBeast {
  id: number;
  defId: string;
  chunk: [number, number];
  x: number;
  y: number;
  hx: number;
  hy: number;
  realm: number;
  stage: number;
  sea: boolean;
  maxHpMul: number;
  atkMul: number;
  affix?: AffixState;
  state: EcoState;
  aggro: boolean;
  hpPct: number;
  patrol?: EcoPoint[];
  patrolIdx?: number;
  lastSeen: number;
  respawnAt: number;
  /** 曾被实际唤醒/目击过；刚迁入视野边缘时先走淡入，避免突现 */
  seen?: boolean;
}

export interface EcoSeedSpec {
  defId: string;
  x: number;
  y: number;
  realm: number;
  stage: number;
  sea: boolean;
  maxHpMul: number;
  atkMul: number;
  affix?: AffixState;
  aggro?: boolean;
  patrol?: EcoPoint[];
}

export interface EcoActorLike {
  id: number;
  ecoId?: number;
  x: number;
  y: number;
  hx: number;
  hy: number;
  hp: number;
  maxHp: number;
  aggro: boolean;
  dead: boolean;
  gone?: boolean;
  boss?: boolean;
  pursuer?: boolean;
  ally?: boolean;
  lairId?: string;
  npcId?: string;
  spar?: boolean;
  def: { kind: string; id: string };
  affix?: AffixState;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function ecoChunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function ecoChunkOf(x: number, y: number): [number, number] {
  return [Math.floor(x / ECO_CHUNK), Math.floor(y / ECO_CHUNK)];
}

export function isOutsideVisRect(x: number, y: number, vis: VisRect, margin = 200): boolean {
  return x < vis.left - margin || x > vis.right + margin || y < vis.top - margin || y > vis.bottom + margin;
}

/**
 * 在视野外缘挑选一个可生成/迁入点，保证落点严格在 `vis + margin` 之外，
 * 同时尽量靠近目标区域 `(tx, ty)`，用于远景大视野时的边缘迁入。
 */
export function pickEdgeEntryOutsideView(
  tx: number,
  ty: number,
  vis: VisRect,
  worldW: number,
  worldH: number,
  margin = 240,
  rnd: () => number = Math.random,
): EcoPoint | null {
  const l = vis.left - margin;
  const r = vis.right + margin;
  const t = vis.top - margin;
  const b = vis.bottom + margin;
  const cands: EcoPoint[] = [];
  if (l > 120) cands.push({ x: Math.max(80, l - rnd() * 260), y: clamp(ty + (rnd() - 0.5) * 900, 80, worldH - 80) });
  if (r < worldW - 120) cands.push({ x: Math.min(worldW - 80, r + rnd() * 260), y: clamp(ty + (rnd() - 0.5) * 900, 80, worldH - 80) });
  if (t > 120) cands.push({ x: clamp(tx + (rnd() - 0.5) * 1200, 80, worldW - 80), y: Math.max(80, t - rnd() * 260) });
  if (b < worldH - 120) cands.push({ x: clamp(tx + (rnd() - 0.5) * 1200, 80, worldW - 80), y: Math.min(worldH - 80, b + rnd() * 260) });
  if (!cands.length) return null;
  cands.sort((a, q) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(q.x - tx, q.y - ty));
  return cands[Math.floor(rnd() * Math.min(2, cands.length))];
}

/**
 * P4 生态账本：
 * - 按生态区块持久记录妖兽/散修槽位（hibernate / active / dead）
 * - 玩家远离时休眠保存血量与位置，回访时唤醒（不再凭空蒸发）
 * - 新增补员严格限制在视野外 +200px，大视野无法绕开时改为边缘巡游迁入
 */
export class Ecology {
  slots = new Map<string, EcoBeast[]>();
  private byId = new Map<number, EcoBeast>();
  private nextId = 1;
  private tickKeys: string[] = [];
  private tickCursor = 0;
  private lastTickAt = 0;

  clear() {
    this.slots.clear();
    this.byId.clear();
    this.tickKeys.length = 0;
    this.tickCursor = 0;
    this.lastTickAt = 0;
  }

  private touchChunk(key: string, list: EcoBeast[]) {
    this.slots.delete(key);
    this.slots.set(key, list);
  }

  private evictFarChunks(px: number, py: number) {
    if (this.slots.size <= ECO_MAX_CHUNKS) return;
    let guard = this.slots.size;
    while (this.slots.size > ECO_MAX_CHUNKS && guard-- > 0) {
      let victimKey: string | null = null;
      let victimDist = -1;
      for (const [k, arr] of this.slots) {
        if (arr.some((b) => b.state === 'active')) continue;
        const [cx, cy] = k.split(',').map(Number);
        const mx = (cx + 0.5) * ECO_CHUNK;
        const my = (cy + 0.5) * ECO_CHUNK;
        const d = (mx - px) * (mx - px) + (my - py) * (my - py);
        if (d > victimDist) { victimDist = d; victimKey = k; }
      }
      if (!victimKey) break;
      const dropped = this.slots.get(victimKey);
      if (dropped) for (const b of dropped) this.byId.delete(b.id);
      this.slots.delete(victimKey);
    }
  }

  get size(): number {
    return this.byId.size;
  }

  get activeCount(): number {
    let n = 0;
    for (const b of this.byId.values()) if (b.state === 'active') n++;
    return n;
  }

  /** 将账本里与当前 enemies 不一致的孤立 active 清理（兼容外部直接清空 enemies 的场景/测试） */
  syncActive(enemies: readonly EcoActorLike[]) {
    const aliveIds = new Set<number>();
    for (const e of enemies) if (!e.dead && !e.gone && e.ecoId !== undefined) aliveIds.add(e.ecoId);
    for (const b of [...this.byId.values()]) {
      if (b.state === 'active' && !aliveIds.has(b.id)) {
        const key = ecoChunkKey(b.chunk[0], b.chunk[1]);
        const arr = this.slots.get(key);
        if (arr) {
          const idx = arr.indexOf(b);
          if (idx >= 0) arr.splice(idx, 1);
          if (!arr.length) this.slots.delete(key);
        }
        this.byId.delete(b.id);
      }
    }
  }

  /** 向指定生态区块补员；若整个区块落入视野内，则改从视野外沿生成并附带巡游迁入路径 */
  requestPopulate(
    chunk: [number, number],
    n: number,
    vis: VisRect,
    worldW: number,
    worldH: number,
    makeSeed: (x: number, y: number, migrating: boolean) => EcoSeedSpec | null,
    playerPos?: EcoPoint,
    avoidRadius = 200,
  ): EcoBeast[] {
    if (n <= 0) return [];
    const [cx, cy] = chunk;
    const key = ecoChunkKey(cx, cy);
    const list = this.slots.get(key) ?? [];
    const x0 = clamp(cx * ECO_CHUNK, 80, worldW - 80);
    const y0 = clamp(cy * ECO_CHUNK, 80, worldH - 80);
    const x1 = clamp((cx + 1) * ECO_CHUNK, 80, worldW - 80);
    const y1 = clamp((cy + 1) * ECO_CHUNK, 80, worldH - 80);
    let aliveTargetingChunk = list.filter((b) => b.state !== 'dead').length;
    for (const b of this.byId.values()) {
      if (b.state === 'dead') continue;
      if (b.chunk[0] === cx && b.chunk[1] === cy) continue;
      if (b.hx >= x0 && b.hx <= x1 && b.hy >= y0 && b.hy <= y1) aliveTargetingChunk++;
    }
    const need = Math.max(0, n - aliveTargetingChunk);
    if (!need) { this.touchChunk(key, list); return []; }
    const created: EcoBeast[] = [];

    for (let i = 0; i < need; i++) {
      let sx = 0, sy = 0, migrating = false;
      let patrol: EcoPoint[] | undefined;
      let found = false;
      for (let t = 0; t < 6; t++) {
        const tx = x0 + Math.random() * Math.max(1, x1 - x0);
        const ty = y0 + Math.random() * Math.max(1, y1 - y0);
        if (playerPos && Math.hypot(tx - playerPos.x, ty - playerPos.y) < avoidRadius) continue;
        if (isOutsideVisRect(tx, ty, vis, 200)) {
          sx = tx; sy = ty; found = true; break;
        }
      }
      if (!found) {
        // 整个目标区块都在可见视野内（例如极远缩放）：禁止视野内直接刷出，改为视野外巡游迁入
        const tx = (x0 + x1) * 0.5 + (Math.random() - 0.5) * ECO_CHUNK * 0.4;
        const ty = (y0 + y1) * 0.5 + (Math.random() - 0.5) * ECO_CHUNK * 0.4;
        const edge = pickEdgeEntryOutsideView(tx, ty, vis, worldW, worldH, 240);
        if (!edge) continue;
        sx = edge.x; sy = edge.y; migrating = true;
        patrol = [{ x: clamp(tx, 80, worldW - 80), y: clamp(ty, 80, worldH - 80) }];
      }
      if (playerPos && Math.hypot(sx - playerPos.x, sy - playerPos.y) < avoidRadius) continue;
      if (!isOutsideVisRect(sx, sy, vis, 200)) continue;

      const spec = makeSeed(sx, sy, migrating);
      if (!spec) continue;
      const beast: EcoBeast = {
        id: this.nextId++,
        defId: spec.defId,
        chunk: ecoChunkOf(spec.x, spec.y),
        x: spec.x,
        y: spec.y,
        hx: patrol ? patrol[0].x : spec.x,
        hy: patrol ? patrol[0].y : spec.y,
        realm: spec.realm,
        stage: spec.stage,
        sea: spec.sea,
        maxHpMul: spec.maxHpMul,
        atkMul: spec.atkMul,
        affix: spec.affix,
        state: 'hibernate',
        aggro: !!spec.aggro,
        hpPct: 1,
        patrol: spec.patrol ?? patrol,
        patrolIdx: 0,
        lastSeen: 0,
        respawnAt: 0,
        seen: false,
      };
      const bKey = ecoChunkKey(beast.chunk[0], beast.chunk[1]);
      const targetList = this.slots.get(bKey) ?? [];
      targetList.push(beast);
      this.touchChunk(bKey, targetList);
      this.byId.set(beast.id, beast);
      created.push(beast);
    }
    if (playerPos) this.evictFarChunks(playerPos.x, playerPos.y);
    return created;
  }

  /** 新在视野外生成并直接进入场的生态体登记入账本，供后续离开/回访休眠唤醒 */
  registerActive(e: EcoActorLike, maxHpMul = 1, atkMul = 1): EcoBeast {
    const ch = ecoChunkOf(e.x, e.y);
    const b: EcoBeast = {
      id: this.nextId++,
      defId: e.def.id,
      chunk: ch,
      x: e.x,
      y: e.y,
      hx: e.hx,
      hy: e.hy,
      realm: (e as any).realm ?? 1,
      stage: (e as any).stage ?? 0,
      sea: !!(e as any).sea,
      maxHpMul,
      atkMul,
      affix: e.affix,
      state: 'active',
      aggro: e.aggro,
      hpPct: clamp(e.hp / Math.max(1, e.maxHp), 0.05, 1),
      lastSeen: 0,
      respawnAt: 0,
      seen: true,
    };
    e.ecoId = b.id;
    const key = ecoChunkKey(ch[0], ch[1]);
    const list = this.slots.get(key) ?? [];
    list.push(b);
    this.touchChunk(key, list);
    this.byId.set(b.id, b);
    return b;
  }

  /** 把一个休眠体从旧区块迁到新区块 */
  migrate(b: EcoBeast, to: [number, number], destPos?: EcoPoint) {
    if (b.state !== 'hibernate') return;
    const oldKey = ecoChunkKey(b.chunk[0], b.chunk[1]);
    const oldList = this.slots.get(oldKey);
    if (oldList) {
      const idx = oldList.indexOf(b);
      if (idx >= 0) oldList.splice(idx, 1);
      if (!oldList.length) this.slots.delete(oldKey);
    }
    b.chunk = [to[0], to[1]];
    if (destPos) {
      b.patrol = [{ x: destPos.x, y: destPos.y }];
      b.patrolIdx = 0;
      b.hx = destPos.x;
      b.hy = destPos.y;
    }
    const newKey = ecoChunkKey(to[0], to[1]);
    const newList = this.slots.get(newKey) ?? [];
    newList.push(b);
    this.touchChunk(newKey, newList);
  }

  /** 远离时将敌方战斗实体休眠存回账本（保留血量百分比、坐标与词缀） */
  hibernateActor(e: EcoActorLike, now: number): boolean {
    if (e.dead || e.gone || e.boss || e.pursuer || e.ally || e.lairId || e.npcId || e.spar) return false;
    let b = e.ecoId !== undefined ? this.byId.get(e.ecoId) : undefined;
    if (!b) {
      // 普通野外刷新实体首次被休眠接管
      const ch = ecoChunkOf(e.x, e.y);
      b = {
        id: this.nextId++,
        defId: e.def.id,
        chunk: ch,
        x: e.x,
        y: e.y,
        hx: e.hx,
        hy: e.hy,
        realm: (e as any).realm ?? 1,
        stage: (e as any).stage ?? 0,
        sea: !!(e as any).sea,
        maxHpMul: 1,
        atkMul: 1,
        affix: e.affix,
        state: 'hibernate',
        aggro: e.aggro,
        hpPct: clamp(e.hp / Math.max(1, e.maxHp), 0.05, 1),
        lastSeen: now,
        respawnAt: 0,
        seen: true,
      };
      e.ecoId = b.id;
      const key = ecoChunkKey(ch[0], ch[1]);
      const list = this.slots.get(key) ?? [];
      list.push(b);
      this.touchChunk(key, list);
      this.byId.set(b.id, b);
    } else {
      b.x = e.x;
      b.y = e.y;
      b.hx = e.hx;
      b.hy = e.hy;
      b.aggro = e.aggro;
      b.hpPct = clamp(e.hp / Math.max(1, e.maxHp), 0.05, 1);
      b.state = 'hibernate';
      b.lastSeen = now;
      b.seen = true;
      const nc = ecoChunkOf(e.x, e.y);
      if (nc[0] !== b.chunk[0] || nc[1] !== b.chunk[1]) this.migrate(b, nc);
    }
    return true;
  }

  /** 击杀生态实体时更新账本槽位 */
  markDead(ecoId: number | undefined, now: number, respawnSec = 180) {
    if (ecoId === undefined) return;
    const b = this.byId.get(ecoId);
    if (!b) return;
    b.state = 'dead';
    b.hpPct = 0;
    b.aggro = false;
    b.lastSeen = now;
    b.respawnAt = now + respawnSec;
  }

  /**
   * 玩家移动后：
   * 1) 唤醒进入 activeR 的休眠体（从未现身者仍遵守不能在 visRect 内突现，除非正在边缘迁入且刚进入视野边界）
   * 2) 把离开 activeR * 1.25 的生态体转为休眠
   */
  updateActors<T extends EcoActorLike>(
    p: EcoPoint,
    activeR: number,
    vis: VisRect,
    now: number,
    enemies: T[],
    wakeBeast: (b: EcoBeast) => T | null,
    minSpawnDist = 0,
  ): { woke: number; hibernated: number } {
    this.syncActive(enemies);
    let hibernated = 0;
    const keepR = Math.max(activeR * 1.25, 3200);
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead || e.gone) continue;
      if (Math.hypot(e.x - p.x, e.y - p.y) > keepR) {
        if (this.hibernateActor(e, now)) {
          enemies.splice(i, 1);
          hibernated++;
        }
      }
    }

    let activeN = this.activeCount;
    let woke = 0;
    const cx0 = Math.floor((p.x - activeR) / ECO_CHUNK);
    const cx1 = Math.floor((p.x + activeR) / ECO_CHUNK);
    const cy0 = Math.floor((p.y - activeR) / ECO_CHUNK);
    const cy1 = Math.floor((p.y + activeR) / ECO_CHUNK);

    // 也检查相邻外圈正在迁入视野边缘的槽位
    for (let cy = cy0 - 1; cy <= cy1 + 1 && activeN < ECO_ACTIVE_MAX; cy++) {
      for (let cx = cx0 - 1; cx <= cx1 + 1 && activeN < ECO_ACTIVE_MAX; cx++) {
        const list = this.slots.get(ecoChunkKey(cx, cy));
        if (!list?.length) continue;
        for (const b of list) {
          if (activeN >= ECO_ACTIVE_MAX) break;
          if (b.state !== 'hibernate') continue;
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d > activeR) continue;
          // 从未出现过的新槽位严禁在屏幕视野或神识内圈内直接弹出；已现身过（休眠回访）同样不得在屏幕内或内圈边缘贴脸唤醒
          if (!isOutsideVisRect(b.x, b.y, vis, 32)) continue;
          if (minSpawnDist > 0 && d < minSpawnDist) continue;
          const spawned = wakeBeast(b);
          if (!spawned) continue;
          b.state = 'active';
          b.seen = true;
          b.lastSeen = now;
          spawned.ecoId = b.id;
          enemies.push(spawned);
          activeN++;
          woke++;
        }
      }
    }
    this.evictFarChunks(p.x, p.y);
    return { woke, hibernated };
  }

  /** 分批低频 tick：推进休眠体迁徙路径、清理到期的死亡槽位（每帧最多处理 8 个区块） */
  tick(now: number, vis?: VisRect, keepOut?: { x: number; y: number; r: number }) {
    if (!this.slots.size) { this.lastTickAt = now; return; }
    const elapsed = this.lastTickAt > 0 ? Math.max(0, now - this.lastTickAt) : 0;
    this.lastTickAt = now;
    if (this.tickCursor >= this.tickKeys.length) {
      this.tickKeys = [...this.slots.keys()];
      this.tickCursor = 0;
    }
    const n = Math.min(ECO_BATCH_TICK, this.tickKeys.length - this.tickCursor);
    const stepDt = Math.min(2, Math.max(0.1, elapsed * Math.max(1, this.tickKeys.length / ECO_BATCH_TICK)));
    for (let i = 0; i < n; i++) {
      const k = this.tickKeys[this.tickCursor++];
      const arr = this.slots.get(k);
      if (!arr) continue;
      for (let j = arr.length - 1; j >= 0; j--) {
        const b = arr[j];
        if (b.state === 'dead') {
          if (now >= b.respawnAt) {
            this.byId.delete(b.id);
            arr.splice(j, 1);
          }
          continue;
        }
        if (b.state === 'hibernate' && b.patrol?.length) {
          const idx = b.patrolIdx ?? 0;
          const tgt = b.patrol[idx];
          const dx = tgt.x - b.x, dy = tgt.y - b.y, d = Math.hypot(dx, dy);
          if (d < 40) {
            b.patrolIdx = idx + 1;
            if (b.patrolIdx >= b.patrol.length) b.patrol = undefined;
          } else if (!vis || isOutsideVisRect(b.x, b.y, vis, 120)) {
            const step = Math.min(d, 95 * stepDt);
            const nx = b.x + (dx / d) * step;
            const ny = b.y + (dy / d) * step;
            // 禁止休眠迁徙体在未入场前靠后台巡游直接踏入玩家神识内圈
            if (keepOut && Math.hypot(nx - keepOut.x, ny - keepOut.y) < keepOut.r) continue;
            b.x = nx;
            b.y = ny;
          }
        }
      }
      if (!arr.length) this.slots.delete(k);
    }
  }

  toSave(limit = 320, now = this.lastTickAt): any[] {
    const out: any[] = [];
    for (const b of this.byId.values()) {
      if (out.length >= limit) break;
      const respawnIn = b.state === 'dead' ? Math.max(0, Math.round(b.respawnAt - now)) : 0;
      out.push({
        defId: b.defId,
        x: Math.round(b.x),
        y: Math.round(b.y),
        hx: Math.round(b.hx),
        hy: Math.round(b.hy),
        realm: b.realm,
        stage: b.stage,
        sea: b.sea ? 1 : 0,
        maxHpMul: Math.round(b.maxHpMul * 1000) / 1000,
        atkMul: Math.round(b.atkMul * 1000) / 1000,
        affix: b.affix,
        state: b.state === 'active' ? 'hibernate' : b.state,
        aggro: b.aggro ? 1 : 0,
        hpPct: Math.round(b.hpPct * 1000) / 1000,
        lastSeen: 0,
        respawnIn,
        seen: b.seen ? 1 : 0,
      });
    }
    return out;
  }

  fromSave(raw: unknown) {
    this.clear();
    if (!Array.isArray(raw)) return;
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as any;
      if (typeof r.defId !== 'string' || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
      const ch = ecoChunkOf(r.x, r.y);
      // 读档后 g.time 从 0 重算：优先读取相对剩余重生秒数 respawnIn；旧档里的绝对 session respawnAt 截断至最多 180 秒，避免卡死生态槽位
      const respawnAt = r.state === 'dead'
        ? (Number.isFinite(r.respawnIn) ? Math.max(0, r.respawnIn) : Number.isFinite(r.respawnAt) ? Math.min(180, Math.max(0, r.respawnAt)) : 0)
        : 0;
      const b: EcoBeast = {
        id: this.nextId++,
        defId: r.defId,
        chunk: ch,
        x: r.x,
        y: r.y,
        hx: Number.isFinite(r.hx) ? r.hx : r.x,
        hy: Number.isFinite(r.hy) ? r.hy : r.y,
        realm: Number.isFinite(r.realm) ? r.realm : 1,
        stage: Number.isFinite(r.stage) ? r.stage : 0,
        sea: !!r.sea,
        maxHpMul: Number.isFinite(r.maxHpMul) ? r.maxHpMul : 1,
        atkMul: Number.isFinite(r.atkMul) ? r.atkMul : 1,
        affix: r.affix,
        state: r.state === 'dead' ? 'dead' : 'hibernate',
        aggro: !!r.aggro,
        hpPct: Number.isFinite(r.hpPct) ? clamp(r.hpPct, 0.05, 1) : 1,
        lastSeen: 0,
        respawnAt,
        seen: !!r.seen,
      };
      const key = ecoChunkKey(ch[0], ch[1]);
      const list = this.slots.get(key) ?? [];
      list.push(b);
      this.slots.set(key, list);
      this.byId.set(b.id, b);
    }
  }
}
