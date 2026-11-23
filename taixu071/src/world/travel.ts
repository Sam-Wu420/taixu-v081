import { AUTO_SAVE_KEY } from './saveKeys';
import { unzipSave } from './savezip';
// 第十六步：三图往来
// - 南荒 ⇄ 中州：走到南荒北缘（朔漠草原尽头）/ 中州南缘（天穹草原），横穿草原，耗时约四个月
// - 南荒 ⇄ 沧溟海：梁京城外灵石矿洞的上古传送阵 ⇄ 摇光岛的上古传送阵；须持“大挪移令”并灌注灵石（原著设定）
// - 换图 = 把目标图与落脚点写进存档，重新载入（所有地形、植被、NPC 缓存都按新图重建，最稳妥）
import type { Game } from './game';
import {
  ACTIVE_MAP, ACTIVE_WORLD, ALL_MAP_IDS, MAP_NAME, MAP_EXITS, EDGE_BLOCK_TEXT, PORTALS, MapId, LocDef, locHere, LOC_BY_ID,
  WORLD_SCALE, WORLD_W, WORLD_H, fromMap, toMap, mapSize,
} from '../data/world';
import { isPlayableWorld, worldDef, worldLawSuppression, worldOfMap, worldCurrencyId, worldCurrencyName, type WorldId, type CrossWorldReturnCost } from '../data/worldHierarchy';
import { ensureWorldSlice } from './worldstate';
import { appointRegentOnAscend } from './mysect';
import { DAYS_PER_YEAR, PORTAL_INTERACT_RADIUS, withinArrivalRadius } from './contracts';
import { TUNING } from '../data/tuning';
import * as C from './cultivation';
import type { Msg } from './cultivation';
import type { DNode } from './modal';

export interface TravelPending { map: MapId; x: number; y: number; via: 'portal' | 'edge' }

// 兼容已有调用者；编码实现与存档预检共用。
export { encodeFog, decodeFog } from './fog';

export class Travel {
  game: Game;
  pending: TravelPending | null = null;
  /** 长途结算失败时锁住自动存档，保留出发前的检查点，直到读档恢复。 */
  recoveryRequired = false;
  /** 最近一帧的移动方向（由 Game 写入） */
  dir = { x: 0, y: 0 };
  private edgeT = 0; private hintT = 0; private hinted = '';
  private checkpoint: string | null = null;
  private refund?: () => void;
  private undoTravelNews?: () => void;
  constructor(game: Game) { this.game = game; }

  update(dt: number) {
    const g = this.game, p = g.player;
    if (g.halted || this.pending) return;
    // 地图边缘：持续朝外走 0.7 秒 → 询问 / 提示
    const m = 360, d = this.dir;
    const edge = !p.moving ? null : p.y < m && d.y < -0.3 ? 'n' : p.y > WORLD_H - m && d.y > 0.3 ? 's' : p.x < m && d.x < -0.3 ? 'w' : p.x > WORLD_W - m && d.x > 0.3 ? 'e' : null;
    if (edge) this.edgeT += dt; else this.edgeT = Math.min(0, this.edgeT + dt);
    if (edge && this.edgeT > 0.7) { this.edgeT = -4; this.onEdge(edge); }
    // 走近传送阵：提示一次
    this.hintT -= dt;
    if (this.hintT <= 0) {
      this.hintT = 1;
      const pt = this.nearPortal();
      if (pt && this.hinted !== pt.here.id) { this.hinted = pt.here.id; g.toast(`此地有一座上古传送阵——按 T 或 G 上前查看。`, 'good'); }
      if (!pt) this.hinted = '';
    }
  }

  // ---------------------------------------------------------------- 边缘
  private onEdge(edge: 'n' | 's' | 'e' | 'w') {
    const g = this.game;
    const ex = MAP_EXITS[ACTIVE_MAP].find((e) => e.edge === edge);
    if (!ex) { g.toast(EDGE_BLOCK_TEXT[ACTIVE_MAP], 'warn'); return; }
    if (g.pursuit?.active) { g.toast('身后追兵未甩脱，此时远行无异于引狼入室。', 'warn'); return; }
    const weak = false;
    g.openDialog({
      speaker: ex.title, title: `${MAP_NAME[ACTIVE_MAP]} → ${MAP_NAME[ex.to]}`, mood: 'mystic',
      text: ex.text + (weak ? '\n\n（以你现在的修为，草原上随便一位法士都能取你性命——想清楚了再走。）' : ''),
      options: [
        { label: `启程（约 ${ex.days} 日）`, tone: 'gold', act: () => { this.crossEdge(ex.to, ex.days); return null; } },
        { label: '暂且不去', act: () => null },
      ],
    });
  }
  /** 横穿边境：落在目标图相对应的边缘，经度/纬度对齐 */
  crossEdge(to: MapId, days: number) {
    const g = this.game, p = g.player;
    const exit = MAP_EXITS[ACTIVE_MAP].find(e => e.to === to && e.days === days);
    const atEdge = exit && (exit.edge === 'n' ? p.y < 360 : exit.edge === 's' ? p.y > WORLD_H - 360 : exit.edge === 'w' ? p.x < 360 : p.x > WORLD_W - 360);
    if (!exit || !atEdge || g.pursuit?.active || g.hero.dead || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      g.toast('远行条件已变化，请重新确认边境路线。', 'warn'); return;
    }
    const [lx, ly] = fromMap(ACTIVE_MAP, p.x / WORLD_SCALE, p.y / WORLD_SCALE);
    const [tx, ty] = toMap(to, lx, ly);
    const S = mapSize(to);
    let x: number, y: number;
    if (exit.edge === 'n' || exit.edge === 's') {
      x = Math.min(S.W - 4, Math.max(4, tx)) * WORLD_SCALE;
      y = (exit.edge === 'n' ? S.H - 5 : 5) * WORLD_SCALE;
    } else {
      x = (exit.edge === 'w' ? S.W - 5 : 5) * WORLD_SCALE;
      y = Math.min(S.H - 4, Math.max(4, ty)) * WORLD_SCALE;
    }
    this.go(to, x, y, days, 'edge');
  }

  // ---------------------------------------------------------------- 传送阵
  nearPortals(): { def: typeof PORTALS[number]; here: LocDef; there: LocDef }[] {
    const p = this.game.player;
    const out: { def: typeof PORTALS[number]; here: LocDef; there: LocDef }[] = [];
    for (const def of PORTALS) {
      const a = locHere(def.a), b = locHere(def.b);
      if (a && withinArrivalRadius(p.x, p.y, a.x * WORLD_SCALE, a.y * WORLD_SCALE, PORTAL_INTERACT_RADIUS)) {
        const there = LOC_BY_ID.get(def.b);
        if (there) out.push({ def, here: a, there });
      }
      if (b && withinArrivalRadius(p.x, p.y, b.x * WORLD_SCALE, b.y * WORLD_SCALE, PORTAL_INTERACT_RADIUS)) {
        const there = LOC_BY_ID.get(def.a);
        if (there) out.push({ def, here: b, there });
      }
    }
    return out;
  }
  nearPortal(): { def: typeof PORTALS[number]; here: LocDef; there: LocDef } | null {
    return this.nearPortals()[0] ?? null;
  }
  /** T / G：在传送阵旁则打开传送阵对话，返回 true */
  tryPortal(): boolean {
    const pts = this.nearPortals(); if (!pts.length) return false;
    this.game.openDialog(this.portalNode(pts));
    return true;
  }
  private portalNode(arg: { def: typeof PORTALS[number]; here: LocDef; there: LocDef } | { def: typeof PORTALS[number]; here: LocDef; there: LocDef }[]): DNode {
    const pts = Array.isArray(arg) ? arg : [arg];
    const g = this.game, h = g.hero, f = g.ws.flags as any;
    const pt = pts[0], { def, here, there } = pt;
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const head = { speaker: here.name, title: pts.length > 1 ? `跨域大阵 · 启程他域` : here.map === there.map ? `域内传送阵 · 通往${there.name}` : `上古传送阵 · 通往${MAP_NAME[there.map]}`, mood: 'mystic' as const };
    if (h.realm < def.minRealm) return { ...head, text: `阵台由整块古玉砌成，阵纹古拙繁复，层层禁制若隐若现。\n\n以你如今的修为尚无法引动其阵眼。（需${def.minRealm >= 9 ? '真仙境' : def.minRealm >= 5 ? '化神期' : '筑基期'}）`, options: [{ label: '离开', act: () => null }] };
    if (def.token && !C.bagCount(h, def.token)) {
      if (here.id === 'chuansong' && !f.danuoyi) {
        return { ...head, text: '矿洞最深处，阵台旁倚着一具枯骨，衣衫早已朽烂，指骨却仍死死攥着一块巴掌大的古朴令牌，令上“大挪移”三字隐隐生光。\n\n看骨骼形制，此人生前修为极高，却身负重伤，似是从远方传送而来，终究没能撑过去。', options: [
          { label: '取下令牌', tone: 'gold', act: () => { if (!C.addItem(h, def.token, 1)) { g.toast('储物袋无法收下令牌，请整理后再试。', 'warn'); return this.portalNode(arg); } f.danuoyi = 1; g.toast('获得「大挪移令」——开启上古传送阵的钥匙。', 'good'); g.news('苏寒在灵石矿洞深处得到了一块大挪移令。', 'personal'); return this.portalNode(arg); } },
          { label: '离开', act: () => null },
        ] };
      }
      return { ...head, text: '阵台中央有一处令牌形状的凹槽。没有“大挪移令”，这座古阵便只是一堆死物。', options: [{ label: '离开', act: () => null }] };
    }
    const have = C.bagCount(h, curId), chased = !!g.pursuit?.active;
    const opts = pts.map((entry) => ({
      label: `传送至【${entry.there.map === ACTIVE_MAP ? entry.there.name : `${MAP_NAME[entry.there.map]}·${entry.there.name}`}】（${entry.def.cost} ${curName}，你有 ${have}）`,
      tone: 'gold' as const,
      disabled: have < entry.def.cost,
      act: () => {
        if (this.pending || this.recoveryRequired) return null;
        const np = Array.isArray(arg) ? this.nearPortals() : (() => { const x = this.nearPortal(); return x ? [x] : this.nearPortals(); })();
        const current = np.find((x) => x.here.id === entry.here.id && x.there.id === entry.there.id);
        if (h.dead || h.realm < entry.def.minRealm || (entry.def.token && !C.bagCount(h, entry.def.token)) || !current) { g.toast('传送条件已变化，请重新查看传送阵。', 'warn'); return null; }
        if (C.bagCount(h, curId) < entry.def.cost) { g.toast(`${curName}不足，无法传送。`, 'warn'); return null; }
        if (!g.save(0)) { g.toast(`传送前无法保存，未扣${curName}。${g.saveFailText()}`, 'warn'); return null; }
        let checkpoint: string | null = null;
        try { checkpoint = localStorage.getItem(AUTO_SAVE_KEY); } catch { /* storage unavailable */ }
        if (!checkpoint) { g.toast(`无法读取传送前检查点，未扣${curName}。`, 'warn'); return null; }
        const bag = h.bag.map(item => ({ ...item }));
        if (!C.exchangeItems(h, [{ id: curId, n: entry.def.cost }], [])) { g.toast(`${curName}不足或储物袋异常，无法传送。`, 'warn'); return null; }
        this.go(entry.there.map, entry.there.x * WORLD_SCALE, entry.there.y * WORLD_SCALE, 0, 'portal', () => { h.bag = bag; }, checkpoint);
        return null;
      },
    }));
    return { ...head, text: `${def.token ? '大挪移令嵌入阵眼，阵纹一道道亮起。' : '跨域大阵灵光流转，各处星标明晰可见。'}${chased ? '\n\n（身后追兵转瞬即至——此刻正是脱身的良机！）' : ''}`, options: [...opts, { label: '离开', act: () => null }] };
  }

  // ---------------------------------------------------------------- 动身
  go(to: MapId, x: number, y: number, days: number, via: 'portal' | 'edge', refund?: () => void, checkpoint?: string): boolean {
    const g = this.game;
    const toWorld = worldOfMap(to);
    const sameWorld = toWorld === ACTIVE_WORLD;
    if (this.pending || this.recoveryRequired || !ALL_MAP_IDS.includes(to) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(days) || days < 0 || (via !== 'portal' && via !== 'edge')) { refund?.(); return false; }
    if (!sameWorld && !isPlayableWorld(toWorld)) { refund?.(); return false; }
    this.checkpoint = checkpoint ?? null;
    if (days > 0) {
      const h = g.hero;
      let life = NaN;
      try { if (C.validCultivation(h)) life = C.maxLife(h); } catch { /* malformed runtime data */ }
      if (!C.validCultivation(h) || h.dead || !Number.isFinite(g.day + days) ||
          !Number.isFinite(h.age + days / DAYS_PER_YEAR) || !Number.isFinite(life)) {
        refund?.(); g.toast('行程或角色状态异常，未开始远行。', 'warn'); return false;
      }
      if (h.age + days / DAYS_PER_YEAR >= life) {
        refund?.(); g.toast('寿元不足以走完全程，此时不宜远行。', 'warn'); return false;
      }
      // 先把出发前的状态写成检查点：若存储不可用，不能先流逝时间和推进众生。
      if (!g.save(0)) { refund?.(); g.toast(`出发前无法保存，未开始远行。${g.saveFailText()}`, 'warn'); return false; }
      try { this.checkpoint = localStorage.getItem(AUTO_SAVE_KEY); } catch { this.checkpoint = null; }
      if (!this.checkpoint) { refund?.(); g.toast('无法读取出发前检查点，未开始远行。', 'warn'); return false; }
      try {
        const msgs: Msg[] = [];
        C.passDays(h, days, false, 1, msgs);
        g.day += days;
        g.clock = (g.clock + days * TUNING.dayCycle) % (TUNING.dayCycle * 10000);
        g.advanceWorldDays?.(days);
        g.npcs.daily(days);
      } catch (e) {
        console.warn('[travel] 行程结算失败，保留出发前检查点', e);
        refund?.(); this.recoveryRequired = true; g.paused = true;
        g.toast('行程结算中断，已保留出发前自动存档并暂停。请重新载入自动存档；当前运行状态可能已部分改变。', 'warn');
        return false;
      }
    }
    // 同图域内远程传送阵（灵界/仙界大图之间直接瞬移，无需重载）
    if (to === ACTIVE_MAP && via === 'portal') {
      g.combat.reset(); g.pursuit?.reset();
      g.teleport(x, y);
      g.toast('阵纹闪耀，已瞬息传送至彼端！', 'good');
      g.save(0);
      g.updateUI(true);
      return true;
    }
    this.pending = { map: to, x, y, via }; this.refund = refund;
    const news = g.ws.news.slice();
    this.undoTravelNews = () => { g.ws.news.splice(0, g.ws.news.length, ...news); };
    // 若跨界：先封存本界状态并切换目标位面分片（若保存失败则完整回滚）
    let undoCrossWorld: (() => void) | undefined;
    if (!sameWorld) {
      const ws = g.ws;
      const fromSlice = ensureWorldSlice(ws, ACTIVE_WORLD);
      const prevHome = ws.home, prevSites = ws.sites, prevBounties = ws.bounties, prevCaches = ws.caches, prevZf = ws.zf, prevWorld = ws.world;
      const prevSect = ws.sect, prevMySect = ws.mySect;
      const prevMasterId = prevMySect?.masterId;
      const prevMyLogLen = prevMySect?.log?.length ?? 0;
      const prevNpcs = g.npcs.list.slice();
      fromSlice.leftAtDay = g.day;
      fromSlice.home = prevHome ?? null;
      fromSlice.sites = prevSites;
      fromSlice.bounties = prevBounties;
      fromSlice.caches = prevCaches;
      fromSlice.zf = prevZf;
      if (prevMySect && prevMySect.masterId === undefined) {
        const regent = appointRegentOnAscend(prevMySect, g.day);
        if (regent) g.news(`苏寒破界离去，${prevMySect.name}暂由${regent}代掌宗务。`, 'personal');
      }
      fromSlice.sect = prevSect ?? null;
      fromSlice.mySect = prevMySect ?? null;
      const toSlice = ensureWorldSlice(ws, toWorld);
      ws.world = toWorld;
      ws.home = toSlice.home ?? null;
      ws.sites = toSlice.sites ?? {};
      ws.bounties = toSlice.bounties ?? [];
      ws.caches = toSlice.caches ?? [];
      ws.zf = toSlice.zf ?? [];
      ws.sect = toSlice.sect ?? null;
      ws.mySect = toSlice.mySect ?? undefined;
      g.npcs.archiveAndSwitchWorldNpcs(ACTIVE_WORLD, toWorld, ws);
      undoCrossWorld = () => {
        ws.world = prevWorld; ws.home = prevHome; ws.sites = prevSites; ws.bounties = prevBounties; ws.caches = prevCaches; ws.zf = prevZf;
        ws.sect = prevSect; ws.mySect = prevMySect;
        if (prevMySect) {
          prevMySect.masterId = prevMasterId;
          if (prevMySect.log && prevMySect.log.length > prevMyLogLen) prevMySect.log.splice(0, prevMySect.log.length - prevMyLogLen);
        }
        g.npcs.list = prevNpcs;
      };
    }
    g.news(via === 'portal' ? `苏寒催动传送阵，远赴${MAP_NAME[to]}。` : `苏寒跨越疆界，踏入${MAP_NAME[to]}。`, 'personal');
    if (!g.save(0)) {
      undoCrossWorld?.();
      this.undoTravelNews?.(); this.undoTravelNews = undefined;
      this.pending = null; this.refund?.(); this.refund = undefined;
      if (days > 0) {
        this.recoveryRequired = true; g.paused = true;
        g.toast('无法保存行程，已保留出发前自动存档并暂停。请重新载入自动存档；当前运行状态可能已部分改变。', 'warn');
      } else { this.checkpoint = null; g.toast(`无法保存行程，未切换地域。${via === 'portal' ? '传送费用已退回。' : ''}${g.saveFailText()}`, 'warn'); }
      return false;
    }
    g.combat.reset(); g.pursuit?.reset();
    if (g.onTravel) g.onTravel(to, via);
    else if (!g.switchMap(to)) { undoCrossWorld?.(); this.cancelFailedSwitch(); return false; }
    return true;
  }

  /** 换图准备或浏览器重载失败：优先还原出发前检查点。 */
  cancelFailedSwitch() {
    if (!this.pending) return;
    const via = this.pending.via;
    this.pending = null; this.refund?.(); this.refund = undefined;
    this.undoTravelNews?.(); this.undoTravelNews = undefined;
    if (this.checkpoint) {
      this.recoveryRequired = true; this.game.paused = true;
      if (this.recoverCheckpoint()) this.game.toast(`地域切换失败，已恢复出发前的自动存档。${via === 'portal' ? '传送费用已退回。' : ''}`, 'warn');
      return;
    }
    const saved = this.game.save(0);
    this.game.toast(saved ? '地域切换失败，已留在当前地域并保存；传送费用已退回。' : '地域切换失败，当前状态无法保存，自动存档仍可能指向目标地域；请先导出备份并检查存储权限。', 'warn');
  }

  /** 可重试：写回内存检查点，再经正式读档恢复；失败时继续保护自动档。 */
  recoverCheckpoint(): boolean {
    if (!this.recoveryRequired) return false;
    try {
      if (this.checkpoint) localStorage.setItem(AUTO_SAVE_KEY, this.checkpoint);
      if (!this.game.load(AUTO_SAVE_KEY)) throw new Error('checkpoint load failed');
      this.finishRecovery(); this.game.paused = false; this.game.updateUI(true);
      return true;
    } catch (e) {
      console.warn('[travel] 检查点恢复失败', e);
      this.recoveryRequired = true; this.game.paused = true;
      this.game.toast('检查点恢复失败。请检查本地存储权限，重试或先导出检查点；不要关闭页面。', 'warn');
      this.game.updateUI(true);
      return false;
    }
  }
  /** 导出明文供玩家留存；不写入其他存档位。 */
  recoveryBackup(): string | null {
    try { const raw = this.checkpoint ?? localStorage.getItem(AUTO_SAVE_KEY); return raw ? unzipSave(raw) : null; }
    catch { return null; }
  }
  finishRecovery() { this.checkpoint = null; this.recoveryRequired = false; }
}

/** 跨界飞升 / 下界返还校验结果（灵界 / 仙界扩展接口；未开放界域返回 ok=false）。 */
export interface CrossWorldGate {
  ok: boolean;
  from: WorldId;
  to: WorldId;
  direction: 'ascend' | 'descend' | 'same';
  reason?: string;
  suppression: number;
  returnCost?: CrossWorldReturnCost;
}

const PLANE_TIER = { mortal: 0, spirit: 1, immortal: 2 } as const;

/** 校验玩家当前是否满足跨界条件（当前人界为唯一开放界域，灵界/仙界仅做架构预留）。 */
export function canCrossWorld(hero: C.Hero, from: WorldId, to: WorldId, ws?: Game['ws'], day = 0): CrossWorldGate {
  const suppression = worldLawSuppression(hero.realm, to);
  if (from === to) return { ok: false, from, to, direction: 'same', reason: '已身处此界。', suppression };
  const fromDef = worldDef(from), toDef = worldDef(to);
  const direction = PLANE_TIER[toDef.plane] > PLANE_TIER[fromDef.plane] ? 'ascend' : 'descend';
  if (!isPlayableWorld(to)) {
    return { ok: false, from, to, direction, reason: `${toDef.name}尚未开启，此路暂封。`, suppression, returnCost: direction === 'descend' ? fromDef.returnCost : undefined };
  }
  if (hero.dead) return { ok: false, from, to, direction, reason: '肉身已陨，无法渡界。', suppression };
  if (direction === 'ascend') {
    // 已飞升并开启过的上界（例如回下界探亲后再返上界），允许直接通过界壁重返
    if (ws?.ascendedWorlds?.includes(to)) {
      return { ok: true, from, to, direction, suppression };
    }
    const cap = fromDef.realmCap;
    if (hero.realm < cap.maxRealm || (hero.realm === cap.maxRealm && hero.stage < cap.maxStage)) {
      return { ok: false, from, to, direction, reason: `须修炼至${fromDef.name}极境「${cap.label}」方能引动${toDef.name}接引之光。`, suppression };
    }
    return { ok: true, from, to, direction, suppression };
  }
  // 逆向返界（高界返低界：高代价 + 冷却 + 天道压制）
  const cost = fromDef.returnCost;
  const cd = ws?.worlds?.[from]?.returnCooldownUntil ?? 0;
  if (day < cd) {
    return { ok: false, from, to, direction, reason: `界壁余震未平，尚需 ${Math.ceil(cd - day)} 日方可再度逆行返界。`, suppression, returnCost: cost };
  }
  if (cost) {
    if (cost.lifeCost > 0 && hero.age + cost.lifeCost >= C.maxLife(hero)) {
      return { ok: false, from, to, direction, reason: `逆行返界须损寿元 ${cost.lifeCost} 载，所余寿元不足。`, suppression, returnCost: cost };
    }
    if (hero.mp < cost.mpRatio) {
      return { ok: false, from, to, direction, reason: `逆行返界须耗 ${(cost.mpRatio * 100).toFixed(0)}% 法力，当前法力不足。`, suppression, returnCost: cost };
    }
  }
  return { ok: true, from, to, direction, suppression, returnCost: cost };
}

