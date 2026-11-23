// v0.61「宗门争锋」：宗门之间的战争
//   · 宗门分三等：大宗门（门人上限 400）· 中宗门（200）· 小宗门（120）——见 data/sects.ts 的 SECT_SCALE
//   · 关系：正魔不两立、佛魔相克、世仇、地盘相邻……每一对宗门有一条「紧张度」，日积月累，满了就开战
//   · 据点：各派在山门之外派弟子镇守附近的城镇（大 4 处 / 中 3 处 / 小 2 处），你走近能看见镇守弟子
//   · 开战：攻方一处处拔据点，拔光了打山门。两种打法——
//       「分波遣将」一波一波派弟子上去（折损小、进展慢）；
//       「倾巢而出」全宗召集、全面对轰（一战定胜负，输了元气大伤）
//     守方同理：「逐波增援」/「全宗回援」/「只凭镇守」
//   · 宗法：每派的镇派心法折成一套战阵（攻 / 守加成），正魔相争时同盟各派会派援军
//   · 伤亡都落在真名册上（roster.ts）：打一仗少一批人，战后再慢慢补
//   · 你：身为门人会收到召集玉符；散修可择一方投效；自立宗门后可派弟子镇守、宣战、调兵、亲征
// v0.62「灭宗大战」：
//   · 百人会战：一次遣 30 / 50 / 80 / 120 人乃至全宗出战，守方照着来敌的人数迎战；亲征时敌我后备源源上场（同屏三十余人），屏幕上方有兵力条
//   · 一方倾巢而出，另一方也只能尽出迎战——这就是灭宗大战：野战得胜则对方据点尽失、兵临山门
//   · 护宗大阵：打到山门须先破阵（宗主亲自轰击 / 遣弟子强攻 / 亲征破阵）；阵破之后才是山门之内的灭宗大战
//   · 发落：山门告破 / 对方乞和之后，由你决定——灭其道统 · 收编残部 · 纳为附庸 · 赔款罢兵
// 状态在 ws.flags.sw（随存档）；界面走通用对话面板。
import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import type { Jade } from './war';
import type { NpcData } from './npc';
import { ZHEN_MODE, type MySect, type ZhenMode } from './mysect';
import { Enemy } from './combat';
import { ENEMIES } from '../data/enemies';
import { LOC_BY_ID, ALL_LOCATIONS, WORLD_SCALE, WORLD_W, WORLD_H, ACTIVE_MAP, ACTIVE_WORLD, MAP_NAME, type LocDef } from '../data/world';
import { worldCurrencyId, worldCurrencyName, scaleFromMortalStones, toMortalStones, planeDefaultPillId, planeExchangeRate } from '../data/worldHierarchy';
import { REALMS, realmName } from '../data/realms';
import { GONGFA } from '../data/skills';
import { ARTS } from '../data/arts';
import { ITEMS, itemDef } from '../data/items';
import { sealFx } from './beastfx';
import * as C from './cultivation';
import { CharState, randomLook, drawCharacter, drawSwordUnderFeet } from '../gfx/character';
import { mulberry32 } from '../core/rng';
import { SECT_DEF, SECT_DEFS, member, rankOf, sectSegments, sectTitle } from './roster';
import { isActiveWorldMap, normalizeWorldMapId } from './contracts';
import { SCHOOLS } from './schools';
import { SECT_LIB } from './town';
import { GARRISON } from './garrison';
import { sectDao, sectGongfa, DAO_NAME, MY_SECT_ID, X_BY_ID, scaleOf, SCALE_NAME, SCALE_CAP, type Dao, type Scale } from '../data/sects';
import { dirName } from './sites';
import {
  FORM_PATTERNS, type FormPattern, type WarFormation, type BattleOrder,
  ensureFormationShield, collectFormationDrawables, tickFormation, tickPostFormation, applyFormationDamage, formationBounds, rotatedFormationBounds, isPointInFormation,
  drawFormationGround, drawFormationOverlay, resetFormationOverlayFrame, spawnFormationRetreaters,
  tickWarBattleFx, collectWarBattleFx, resetWarBattleFx, getLastBattleView,
  sectDiscipleFrameSpr, sectDiscipleSheet, discipleLodParams, formationTintRgb, facingFromVec, type DiscipleFacing, SHEET_W, SHEET_H,
} from './warformation';
import {
  drawAirshipEntity, airshipDirFromVec, type AirshipStyle, type AirshipTier,
} from '../gfx/airship';
import {
  AIRSHIP_BUILD_SPEC, AIRSHIP_MAT_STONE_PRICE,
  createWarAirship, tickWarAirship, turnAirshipToward, applyAirshipDamage, collectAirshipDrawables, isPointOnAirship,
  type WarAirship,
} from './warairship';
import { getShadowSprite, getDotSprite } from '../gfx/charAtlas';
import { type CustomSectUniform } from '../gfx/sectUniform';
import { worldOfMap, worldWarTier, warTierBand, canLeadWarFormation, canFightAsWarSoldier } from '../data/worldHierarchy';
import type { Drawable } from './life';
import type { School } from '../data/arts';
import { SECT_RANKS, defaultSectSupply, defaultSectFleet, type SectSupply, type SectFleet, type WorldState } from './worldstate';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));


import {
  YEAR, GRACE, MY, PW, pwOf, OUTER_UNIT_PW, ATK_NAME, DEF_NAME, GAR, HOLDS, SCALE_W,
  VASSAL, BRANCH, MIE_LOOT, END_LOOT, FIELD_F, FIELD_M, OLD_ALLY, allyOf, key,
  FEUD_LIST, FEUD, daoBase, EXTRA_GF, SCHOOL_ALIAS, ZHEN, shuffle,
  type Mode, type Doctrine, type Hold, type MarchEntity, type PendingBorderSkirmish,
  type SkirmishSource, type SkirmishSquad, type CampState, type WarOrder,
  type WarFacility, type WarAttritionState, type SWar, type SWState, type Unit,
  type ActiveFrontDuel, type Live,
} from './sectwarTypes';
export {
  GRACE, GAR, HOLDS, allyOf,
  type Mode, type Doctrine, type Hold, type MarchEntity, type PendingBorderSkirmish,
  type CampState, type WarOrder, type WarFacility, type WarAttritionState, type SWar,
} from './sectwarTypes';
import {
  buildAllianceCampClusters as buildAllianceCampClustersRender,
  collectSectWarWorld,
  collectSectWarFarWorld,
  sectColor as sectColorRender,
  sectTerritories as sectTerritoriesRender,
  holdBadges as holdBadgesRender,
  frontLines as frontLinesRender,
  type SectTerritory,
  type SectHoldBadge,
  type SectFrontLine,
  type SectWarRenderHost,
} from './sectwarRender';

export class SectWarSys {
  game: Game;
  private acc = 0; private pacc = 0; private dacc = 0;
  private battles: Live[] = [];
  hasActiveBattle(): boolean { return this.battles.length > 0; }
  get battle(): Live | null {
    if (this.battles.length <= 1) return this.battles[0] ?? null;
    const p = this.game?.player;
    if (!p) return this.battles[0];
    let best = this.battles[0];
    let bd = Math.hypot(best.x - p.x, best.y - p.y);
    for (let i = 1; i < this.battles.length; i++) {
      const b = this.battles[i];
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  set battle(v: Live | null) {
    if (v === null) this.battles.length = 0;
    else this.battles = [v];
  }
  hasBattleForWar(warId: number): boolean {
    return this.battles.some((b) => b.war === warId);
  }
  private removeBattleForWar(warId: number) {
    const g = this.game;
    const w = this.S.wars.find((x) => x.id === warId);
    for (let i = this.battles.length - 1; i >= 0; i--) {
      const B = this.battles[i];
      if (B.war !== warId) continue;
      for (const s of B.airships) {
        this.handleAirshipBattleAccounting(s, true);
        if (s.sunk) {
          if (s.wreckT > 0) this.postAirships.push(s);
          continue;
        }
        const sSide: 0 | 1 = s.ours ? B.side : (1 - B.side) as 0 | 1;
        const dest = this.returnDestFor(s.sid, undefined, sSide, s.x, s.y);
        const dist = Math.hypot(dest.x - s.x, dest.y - s.y);
        const dur = clamp(dist / 280 + 3.0, 14, 75);
        s.retreatTx = dest.x;
        s.retreatTy = dest.y;
        s.retreatMode = 'return';
        s.retreatFadeMax = dur;
        s.retreatFadeT = dur;
        this.postAirships.push(s);
      }
      for (const f of B.formations) {
        if ((f.leader as any)?.warForm === f) (f.leader as any).warForm = undefined;
        if (f.soldiers <= 0 && (!f.collapsed || f.collapseT <= 0)) continue;
        const fSide: 0 | 1 = f.ours ? B.side : (1 - B.side) as 0 | 1;
        const dest = this.returnDestFor(f.sid, undefined, fSide, f.x, f.y);
        const dist = Math.hypot(dest.x - f.x, dest.y - f.y);
        const dur = clamp(dist / 240 + 2.5, 14, 75);
        f.warId = warId;
        f.retreatMode = 'return';
        f.retreatX = dest.x;
        f.retreatY = dest.y;
        f.retreatFadeMax = dur;
        f.retreatFadeT = dur;
        this.postFormations.push(f);
      }
      const pushRem = (e: Enemy, ours: boolean) => {
        if (e.dead || e.gone) return;
        const eSid = (e as any).warRos?.[0] ?? (e as any).swOuterCapSid ?? (ours ? (w ? (B.side === 0 ? w.a : w.b) : MY) : (w ? (B.side === 0 ? w.b : w.a) : MY));
        const eSide: 0 | 1 = ours ? B.side : (1 - B.side) as 0 | 1;
        const dest = this.returnDestFor(eSid, undefined, eSide, e.x, e.y);
        const tx = dest.x + rand(-160, 160), ty = dest.y + rand(-110, 110);
        const flying = e.realm >= 1;
        const dur = clamp(Math.hypot(tx - e.x, ty - e.y) / (flying ? 420 : 230) + 2.5, 14, 75);
        const st = new CharState(e.x, e.y);
        st.faceToward(tx - e.x, ty - e.y, false);
        this.postActors.push({
          x: e.x, y: e.y, tx, ty, look: e.look, st, t: Math.random() * 2,
          dur, maxDur: dur, ours, name: e.shortName ?? e.name, flying, warId, sid: eSid,
        });
        e.gone = true;
      };
      for (const e of B.foes) pushRem(e, false);
      for (const e of B.allies) pushRem(e, true);
      this.battles.splice(i, 1);
    }
    g.combat.enemies = g.combat.enemies.filter((e) => !e.gone);
    g.combat.allies = g.combat.allies.filter((e) => !e.gone);
    if (!this.battles.length) g.combat.dismissAllies((e) => e.tag === 'war:ally');
  }
  /** 战后撤离/归营中的百人战阵与弟子实体（打完不瞬间蒸发，各自收兵归营或溃退离场） */
  private postFormations: WarFormation[] = [];
  private postAirships: WarAirship[] = [];
  private postActors: {
    x: number; y: number; tx: number; ty: number;
    look: any; st: CharState; t: number; dur: number; maxDur: number;
    ours: boolean; name: string; flying: boolean;
    warId?: number; sid?: string;
  }[] = [];
  /** 亲征/开拔赶赴前线时暂存的出兵规模，到达接战圈后生效 */
  private pendingOpt = new Map<number, { ma?: Mode; n?: number; triggerEvent?: string }>();
  /** 赴前线对峙时暂存的编队规模，待阵前鸣鼓总攻时投入 */
  private standoffOpt = new Map<number, { ma?: Mode; n?: number }>();
  private posted = new Map<string, string[]>(); private adopted = false;
  /** 安全开阔地位置缓存（避免每次 render 重搜） */
  private fpCache = new Map<string, { x: number; y: number; map: string }>();
  /** 世界实景局部交锋小队（边界摩擦 / 前线哨战 / 截粮护卫实战） */
  private skirmishes: SkirmishSquad[] = [];
  private skirmishSeq = 0;
  private skirmishCd = new Map<string, number>();
  private marchSupplyAcc = 0;
  /** 当前正在前线斗将台进行的单挑 */
  private activeDuel: ActiveFrontDuel | null = null;
  private _standoffToastAt = new Map<number, number>();
  private _lastStandoffTgtToast = new Map<string, number>();
  private _aggressiveAtFrontCd = 0;
  constructor(game: Game) { this.game = game; }
  get S(): SWState { const f = this.game.ws.flags as any; return (f.sw ??= { hold: {}, wars: [], ten: {}, truce: {}, seq: 0 }); }
  private get my(): MySect | undefined { return this.game.ws.mySect; }

  // ---------------------------------------------------------------- 宗门概况
  name(id: string) { return id === MY ? this.my?.name ?? '本宗' : sectTitle(id); }
  sideSects(w: SWar, side: 0 | 1): string[] {
    const arr = side === 0 ? w.sideA : w.sideB;
    return arr && arr.length ? arr : [side === 0 ? w.a : w.b];
  }
  sideName(w: SWar, side: 0 | 1): string {
    return side === 0 ? (w.sideAName ?? this.name(w.a)) : (w.sideBName ?? this.name(w.b));
  }
  sideCombatTotal(w: SWar, side: 0 | 1): number {
    let sum = 0;
    for (const sid of this.sideSects(w, side)) sum += this.combatTotal(sid);
    return sum;
  }
  dao(id: string): Dao { return id === MY ? this.my?.dao ?? 'zhong' : sectDao(id) ?? (SECT_DEF.get(id)?.demon ? 'mo' : 'zhong'); }
  scale(id: string): Scale { return id === MY ? this.game.mysect.scale() : scaleOf(id, SECT_DEF.get(id)?.n); }
  cap(id: string) { return SCALE_CAP[this.scale(id)]; }
  size(id: string) { return id === MY ? Math.max(this.my?.ds.length ?? 0, this.game.mysect.totalAlive()) : SECT_DEF.get(id)?.n ?? 0; }
  alive(id: string) { return id === MY ? this.game.mysect.totalAlive() : this.game.roster.aliveCount(id); }
  outerAvailable(id: string) { return id === MY ? this.game.mysect.outerAlive() : this.game.roster.outerAlive(id); }
  combatTotal(id: string) {
    if (id === MY) return this.units(id).length + this.outerAvailable(id);
    return this.game.roster.coreAliveCount(id) + this.outerAvailable(id);
  }
  /** 参与天下争锋的宗门（地图上有山门的） */
  sects(map?: string): string[] {
    const out: string[] = [];
    const gone = this.S.gone ?? {};
    const targetMap = map ? normalizeWorldMapId(map) : null;
    for (const d of SECT_DEFS) { const l = LOC_BY_ID.get(d.id); if (l && !gone[d.id] && (!targetMap || l.map === targetMap)) out.push(d.id); }
    const m = this.my; if (m && (!targetMap || normalizeWorldMapId(m.map) === targetMap) && LOC_BY_ID.get(MY)) out.push(MY);
    return out;
  }
  /** 核心参战骨干（仅第 1–2 层：掌门/长老/执事/核心/内门；绝不包含杂役弟子与散落万人的外门池） */
  units(sid: string): Unit[] {
    const g = this.game;
    if (sid === MY) return (this.my?.ds ?? []).filter((d) => d.realm >= 1).map((d) => ({ ref: d.id, realm: d.realm, stage: d.stage, top: false }));
    const def = SECT_DEF.get(sid); if (!def) return [];
    const ro = g.roster, out: Unit[] = [];
    for (const m of ro.members(sid)) {
      if (m.dead || m.rank === '杂役弟子' || ro.canonAt(sid, m.i) || g.npcs.byId.has(ro.idOf(sid, m.i))) continue;
      out.push({ ref: m.i, realm: m.realm, stage: m.stage, top: m.rank === '掌门' || m.rank === '太上长老' });
    }
    return out;
  }
  strength(sid: string) {
    let v = this.outerAvailable(sid) * OUTER_UNIT_PW;
    for (const u of this.units(sid)) v += pwOf(u);
    return v;
  }
  private spent(sid: string) { return sid === MY ? this.combatTotal(MY) < 4 : this.alive(sid) < this.size(sid) * 0.4; }
  /** 宗法：镇派心法折成的战阵 */
  doctrine(sid: string): Doctrine {
    const gid = sid === MY ? this.my?.gf : sectGongfa(sid) ?? EXTRA_GF[sid], g = gid ? GONGFA[gid] : undefined;
    if (!g) return { gf: '', name: '寻常战阵', atk: 1, def: 1 };
    const sch = Object.entries(g.school ?? {}).sort((x, y) => y[1] - x[1])[0];
    const z = sch ? ZHEN[sch[0]] : undefined, t = (g.tier ?? 1) * 0.02;
    const atk = 1 + (g.atk ?? 0) * 0.6 + (g.sword ?? 0) * 0.4 + (z?.[1] === 'atk' ? sch![1] * 0.35 : 0) + t;
    const def = 1 + (g.def ?? 0) * 0.6 + Math.max(0, g.hp ?? 0) * 0.4 + (g.mp ?? 0) * 0.2 + (z?.[1] === 'def' ? sch![1] * 0.35 : 0) + t;
    return { gf: g.name, name: z?.[0] ?? '两仪战阵', atk: Math.round(atk * 100) / 100, def: Math.round(def * 100) / 100 };
  }
  /** 本宗秘传（藏经阁里的招牌法术） */
  arts(sid: string): string[] {
    const ids = sid === MY ? (this.my?.lib ?? []) : (SECT_LIB[sid] ?? []).filter((s) => s.startsWith('scroll_art_')).map((s) => s.slice(11));
    return ids.map((a) => ARTS[a]?.name).filter(Boolean).slice(0, 4) as string[];
  }
  private docText(sid: string) { const d = this.doctrine(sid); return `${d.gf ? `《${d.gf}》· ` : ''}${d.name}（攻 ${d.atk >= 1 ? '+' : ''}${Math.round((d.atk - 1) * 100)}% · 守 ${d.def >= 1 ? '+' : ''}${Math.round((d.def - 1) * 100)}%）`; }

  // ---------------------------------------------------------------- 关系
  /** 计算两宗山门与各自连片据点之间的最短地理接触距离（地图单位） */
  sectContactDist(a: string, b: string): number {
    const la = LOC_BY_ID.get(a), lb = LOC_BY_ID.get(b);
    if (!la || !lb || la.map !== lb.map) return Infinity;
    const ptsA: LocDef[] = [la];
    const ptsB: LocDef[] = [lb];
    for (const id of this.holdsOf(a)) { const l = LOC_BY_ID.get(id); if (l && !this.S.hold[id]?.isolated) ptsA.push(l); }
    for (const id of this.holdsOf(b)) { const l = LOC_BY_ID.get(id); if (l && !this.S.hold[id]?.isolated) ptsB.push(l); }
    let best = Infinity;
    for (const pa of ptsA) for (const pb of ptsB) {
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (d < best) best = d;
    }
    return best;
  }
  /** 两派天生的敌意（-1 = 不同图 / 同盟，永不开战） */
  base(a: string, b: string): number {
    const la = LOC_BY_ID.get(a), lb = LOC_BY_ID.get(b); if (!la || !lb || la.map !== lb.map || a === b) return -1;
    if ((a === MY || b === MY) && this.S.vassal?.[a === MY ? b : a]) return -1;   // 附庸不叛
    const feud = FEUD.has(key(a, b)), al = allyOf(a);
    if (al && al === allyOf(b) && !feud) return -1;
    const contactD = this.sectContactDist(a, b);
    // 隔山隔海不接壤的宗门（非本宗且非世仇）不会莫名隔半张地图主动开打，避免出现超远跨图前线
    if (a !== MY && b !== MY && !feud && contactD > 135) return 0;
    let v = daoBase(this.dao(a), this.dao(b)) + (feud ? 30 : 0);
    const d = Math.min(contactD, Math.hypot(la.x - lb.x, la.y - lb.y));
    v += d < 60 ? 10 : d < 130 ? 5 : 0;
    if (a === MY || b === MY) { const o = a === MY ? b : a; v += clamp(-((this.game.rel.S.sect as Record<string, number>)[o] ?? 0), -20, 60) * 0.5; }
    return v;
  }
  /** 紧张度 0–120（满 100 开战） */
  tension(a: string, b: string): number { const b0 = this.base(a, b); return b0 < 0 ? 0 : this.S.ten[key(a, b)] ?? Math.min(90, b0); }
  private relWord(t: number) { return t >= 100 ? '不死不休' : t >= 80 ? '剑拔弩张' : t >= 55 ? '摩擦不断' : t >= 30 ? '互有提防' : '相安无事'; }
  warOf(sid: string): SWar | undefined { return this.S.wars.find((w) => w.a === sid || w.b === sid); }
  private between(a: string, b: string) { return this.S.wars.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)); }
  private att(w: SWar) { return w.ini === 0 ? w.a : w.b; }
  private def(w: SWar) { return w.ini === 0 ? w.b : w.a; }
  private tgtName(w: SWar) { const D = this.def(w); return w.tgt === D ? `${this.name(D)}山门` : LOC_BY_ID.get(w.tgt)?.name ?? '据点'; }
  private isZM(w: SWar) { const x = this.dao(w.a), y = this.dao(w.b); return (x === 'mo') !== (y === 'mo') && [x, y].some((d) => d === 'zheng' || d === 'fo'); }
  private title(w: SWar) { return `${this.name(w.a)} ⚔ ${this.name(w.b)}${this.isZM(w) ? '（正魔之争）' : ''}`; }
  /** 你在这场战事里站哪边 */
  sideOf(w: SWar): 0 | 1 | undefined {
    if (w.a === MY || w.sideA?.includes(MY)) return 0;
    if (w.b === MY || w.sideB?.includes(MY)) return 1;
    return w.side;
  }

  private holdDistMul(map: string) { return map === 'lingjie' ? 2.8 : map === 'xianjie' ? 2.2 : map === 'renjie' ? 1.25 : 1; }
  // ---------------------------------------------------------------- 据点
  private holdsMap(S = this.S): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const id of Object.keys(S.hold)) {
      const h = S.hold[id];
      if (!h || !LOC_BY_ID.has(id)) continue;
      let arr = m.get(h.o);
      if (!arr) { arr = []; m.set(h.o, arr); }
      arr.push(id);
    }
    return m;
  }
  private holdableLocs(map: string): LocDef[] {
    let cache = (SectWarSys as unknown as { _holdable?: Map<string, LocDef[]> })._holdable;
    if (!cache) {
      cache = new Map<string, LocDef[]>();
      for (const l of ALL_LOCATIONS) {
        if (!this.holdable(l)) continue;
        let arr = cache.get(l.map);
        if (!arr) { arr = []; cache.set(l.map, arr); }
        arr.push(l);
      }
      (SectWarSys as unknown as { _holdable?: Map<string, LocDef[]> })._holdable = cache;
    }
    return cache.get(map) ?? [];
  }
  holdsOf(sid: string): string[] { const S = this.S; return Object.keys(S.hold).filter((id) => S.hold[id].o === sid && LOC_BY_ID.has(id)); }
  private holdable(l: LocDef) { return (l.type === 'town' || l.type === 'city' || l.type === 'isle') && !SECT_DEF.has(l.id) && l.id !== MY && !GARRISON[l.id]; }
  /** 开局分地盘：各派就近轮询派弟子镇守（保底每宗至少 1 处附近据点，再按宗门体量补齐） */
  initHolds() {
    const S = this.S; if (S.init) return; S.init = 1;
    const ids = this.sects().filter((s) => s !== MY && !S.gone?.[s]).sort((a, b) => SCALE_W[this.scale(a)] - SCALE_W[this.scale(b)] || this.size(b) - this.size(a));
    // 第1轮：先按就近保底为每个宗门分配 1 处据点，避免小宗门周边被大宗门抢空
    for (const sid of ids) {
      const G = LOC_BY_ID.get(sid)!;
      const baseRange = Math.round(195 * this.holdDistMul(G.map));
      const cand = this.holdableLocs(G.map)
        .filter((l) => !S.hold[l.id])
        .map((l) => ({ l, d: Math.hypot(l.x - G.x, l.y - G.y) }))
        .filter((c) => c.d < baseRange)
        .sort((x, y) => x.d - y.d);
      if (cand[0]) {
        const sc = this.scale(sid);
        S.hold[cand[0].l.id] = { o: sid, g: GAR[sc] };
      }
    }
    // 第2轮：轮询扩张，按 HOLDS[sc] 配额把各宗剩余周边无主城镇收归门下
    const maxQuota = Math.max(...ids.map((s) => HOLDS[this.scale(s)]));
    for (let round = 1; round < maxQuota; round++) {
      const byOwner = this.holdsMap(S);
      for (const sid of ids) {
        const sc = this.scale(sid);
        if ((byOwner.get(sid)?.length ?? 0) >= HOLDS[sc]) continue;
        const G = LOC_BY_ID.get(sid)!;
        const holdRange = Math.round(155 * this.holdDistMul(G.map));
        const cand = this.holdableLocs(G.map)
          .filter((l) => !S.hold[l.id])
          .map((l) => ({ l, d: Math.hypot(l.x - G.x, l.y - G.y) }))
          .filter((c) => c.d < holdRange)
          .sort((x, y) => x.d - y.d);
        if (cand[0]) {
          S.hold[cand[0].l.id] = { o: sid, g: GAR[sc] };
          let arr = byOwner.get(sid); if (!arr) { arr = []; byOwner.set(sid, arr); }
          arr.push(cand[0].l.id);
        }
      }
    }
    this.refreshContiguousHolds();
  }

  /** NPC宗门平时主动派遣弟子占领高价值无主据点、加固工事、补齐薄弱防线并委任主将 */
  private aiClaimFreeHolds() {
    const S = this.S, ro = this.game.roster;
    const byOwner = this.holdsMap(S);
    const ids = this.sects().filter((s) => s !== MY && !S.gone?.[s] && !this.warOf(s));
    let changed = false;
    for (const sid of ids) {
      const sc = this.scale(sid);
      const curHolds = byOwner.get(sid) ?? [];
      const cap = HOLDS[sc] + 1;
      const combatTot = this.combatTotal(sid);
      const G = LOC_BY_ID.get(sid);

      // 1) 为已有据点补防、修筑工事并委任未出征的筑基以上主将
      const minGar = Math.max(8, Math.round(GAR[sc] * 0.72));
      for (const hid of curHolds) {
        const h = S.hold[hid];
        if (!h) continue;
        if (h.g < minGar && combatTot > GAR[sc] * 1.4 && Math.random() < 0.45) {
          h.g = Math.min(GAR[sc] + 10, h.g + Math.max(3, Math.round(GAR[sc] * 0.25)));
        }
        const curFort = h.fortLv ?? 0;
        const maxFort = sc === 'da' ? 3 : sc === 'zhong' ? 2 : 1;
        if (curFort < maxFort && combatTot > GAR[sc] * (1.8 + curFort * 0.7) && Math.random() < 0.18) {
          h.fortLv = curFort + 1;
        }
        if (h.commanderId === undefined && ro) {
          const used = new Set(curHolds.map((id) => S.hold[id]?.commanderId).filter((v): v is number => v !== undefined));
          const cand = ro.members(sid).find((m) => !m.dead && m.rank !== '杂役弟子' && m.rank !== '掌门' && m.rank !== '太上长老' && m.realm >= 2 && !used.has(m.i));
          if (cand) {
            h.commanderId = cand.i;
            h.commanderName = cand.name;
          }
        }
      }

      if (curHolds.length >= cap) continue;
      if (combatTot < Math.max(40, GAR[sc] * 1.5)) continue;
      if (!G) continue;
      const anchors: LocDef[] = [G];
      for (const hid of curHolds) {
        const l = LOC_BY_ID.get(hid);
        if (l && l.map === G.map) anchors.push(l);
      }
      const maxRange = Math.round(140 * this.holdDistMul(G.map));
      const candidates = this.holdableLocs(G.map);
      let best: { l: LocDef; score: number } | null = null;
      for (let i = 0; i < candidates.length; i++) {
        const l = candidates[i];
        if (S.hold[l.id]) continue;
        let minD = Infinity;
        for (let j = 0; j < anchors.length; j++) {
          const a = anchors[j];
          const d = Math.hypot(l.x - a.x, l.y - a.y);
          if (d < minD) minD = d;
        }
        if (minD <= maxRange) {
          const valBonus = l.type === 'city' ? 24 : l.type === 'isle' ? 14 : 0;
          const scLoc = valBonus - minD;
          if (!best || scLoc > best.score) best = { l, score: scLoc };
        }
      }
      if (best && Math.random() < 0.48) {
        S.hold[best.l.id] = { o: sid, g: Math.max(12, Math.round(GAR[sc] * 0.85)) };
        changed = true;
      }
    }
    if (changed) this.refreshContiguousHolds();
  }
  private nextTarget(att: string, def: string): string {
    const G = LOC_BY_ID.get(att), hs = this.holdsOf(def);
    if (!hs.length || !G) return def;
    // 智能目标优选：优先围剿敌方孤立断补飞地、守备薄弱/低工事据点及高价值城池，兼顾连片推进与避开战线扎堆
    const anchors = [att, ...this.holdsOf(att).filter((id) => !this.S.hold[id]?.isolated)]
      .map((id) => LOC_BY_ID.get(id))
      .filter((l): l is LocDef => !!l && l.map === G.map);
    const activeFronts: { x: number; y: number }[] = [];
    for (const ow of this.S.wars) {
      if (ow.fall || (ow.a === att && ow.b === def) || (ow.b === att && ow.a === def)) continue;
      const ol = LOC_BY_ID.get(ow.tgt);
      if (ol && ol.map === G.map) activeFronts.push({ x: ol.x * WORLD_SCALE, y: ol.y * WORLD_SCALE });
    }
    const targetCost = (id: string, l: LocDef) => {
      const h = this.S.hold[id];
      let cost = Math.hypot(l.x - G.x, l.y - G.y);
      for (const a of anchors) cost = Math.min(cost, Math.hypot(l.x - a.x, l.y - a.y));
      if (h?.isolated) cost -= 45;
      if (h) {
        cost += h.g * 0.7 + (h.fortLv ?? 0) * 18;
      }
      if (l.type === 'city') cost -= 12;
      for (const af of activeFronts) {
        if (Math.hypot(l.x * WORLD_SCALE - af.x, l.y * WORLD_SCALE - af.y) < 4800) {
          cost += 28;
          break;
        }
      }
      return cost;
    };
    return hs.map((id) => ({ id, c: targetCost(id, LOC_BY_ID.get(id)!) })).sort((x, y) => x.c - y.c)[0].id;
  }
  /** v0.73 Phase 4：检查据点是否因失去陆/海连通而成为「孤立飞地」 */
  isHoldIsolated(id: string): boolean {
    return !!this.S.hold[id]?.isolated;
  }
  /** v0.73 Phase 4：全盘更新各宗据点连片性与孤岛状态 */
  refreshContiguousHolds() {
    const S = this.S;
    const byOwner = new Map<string, string[]>();
    for (const id of Object.keys(S.hold)) {
      const h = S.hold[id];
      if (!h || !LOC_BY_ID.has(id)) continue;
      let arr = byOwner.get(h.o);
      if (!arr) { arr = []; byOwner.set(h.o, arr); }
      arr.push(id);
    }
    for (const [sid, ids] of byOwner) {
      const home = LOC_BY_ID.get(sid);
      if (!home) { for (const id of ids) S.hold[id].isolated = true; continue; }
      const reach = new Set<string>();
      const queue: LocDef[] = [home];
      if (sid === MY) {
        for (const bid of S.branch ?? []) {
          const bl = LOC_BY_ID.get(bid);
          if (bl && bl.map === home.map) queue.push(bl);
        }
      }
      while (queue.length) {
        const cur = queue.shift()!;
        for (const id of ids) {
          if (reach.has(id)) continue;
          const l = LOC_BY_ID.get(id);
          if (!l || l.map !== home.map) continue;
          const linkRange = (l.island || cur.island) ? Math.round(195 * this.holdDistMul(home.map)) : Math.round(130 * this.holdDistMul(home.map));
          if (Math.hypot(l.x - cur.x, l.y - cur.y) <= linkRange) {
            reach.add(id);
            queue.push(l);
          }
        }
      }
      for (const id of ids) {
        const iso = !reach.has(id);
        S.hold[id].isolated = iso;
        if (!iso) S.hold[id].starved = 0;
      }
    }
  }
  /** v0.73 Phase 4：孤立飞地补给惩罚（断补给超 30 日士气崩溃） */
  private tickHoldLogistics(days: number) {
    if (days <= 0) return;
    this.refreshContiguousHolds();
    const S = this.S;
    for (const id of Object.keys(S.hold)) {
      const h = S.hold[id];
      if (!h?.isolated) continue;
      const l = LOC_BY_ID.get(id);
      const war = this.warOf(h.o);
      if (war) h.starved = (h.starved ?? 0) + days;
      else h.starved = Math.max(0, (h.starved ?? 0) + days * 0.25);
      if ((h.starved ?? 0) >= 30) {
        const owner = h.o;
        delete S.hold[id];
        this.game.news(`${this.name(owner)}孤悬在外的飞地${l?.name ?? id}断粮日久，守军溃散弃守。`, 'rumor');
        if (owner === MY) this.game.toast(`孤立飞地 ${l?.name ?? id} 因断补给三十日，守军溃散！`, 'warn');
      }
    }
  }
  private myGar() { let n = 0; for (const id of this.holdsOf(MY)) n += this.S.hold[id].g; return n; }
  /** 统计某宗门当前已外派占用的人手（各据点驻守 + 在途行军/护卫 + 大营在营 + 野外交锋小队），实现全宗兵力守恒 */
  deployedTroopsOf(sid: string): number {
    const S = this.S;
    let total = 0;
    for (const id of Object.keys(S.hold)) {
      const h = S.hold[id];
      if (h && h.o === sid) total += Math.max(0, h.g);
    }
    for (const mc of this.activeMarches()) {
      if (mc.sid === sid) total += Math.max(0, mc.soldiers);
    }
    for (const w of S.wars) {
      if (w.fall) continue;
      for (const sIdx of [0, 1] as const) {
        const cmp = sIdx === 0 ? w.campA : w.campB;
        if (!cmp || cmp.soldiers <= 0) continue;
        if (cmp.bySect && cmp.bySect[sid] !== undefined) {
          total += Math.max(0, cmp.bySect[sid]);
        } else {
          const sects = this.sideSects(w, sIdx);
          if (sects.includes(sid)) {
            total += Math.round(cmp.soldiers / Math.max(1, sects.length));
          }
        }
      }
    }
    for (const sk of this.skirmishes) {
      for (const [src, list] of [[sk.srcA, sk.unitA], [sk.srcB, sk.unitB]] as const) {
        if (src && src.sid === sid && src.kind === 'gate') total += list.length;
      }
    }
    return total;
  }
  /** 某宗门尚留在山门后方的真实可调兵力（= 总可战人数 - 已外派镇守/在途/驻营兵力） */
  sectAvailablePool(sid: string): number {
    return Math.max(0, this.combatTotal(sid) - this.deployedTroopsOf(sid));
  }
  myFree() { return this.sectAvailablePool(MY); }
  private clampMyGar() { let over = this.myGar() - this.combatTotal(MY); const S = this.S; for (const id of this.holdsOf(MY).sort((x, y) => S.hold[y].g - S.hold[x].g)) { if (over <= 0) break; const cut = Math.min(over, S.hold[id].g); S.hold[id].g -= cut; over -= cut; } }
  private holdIncome(id: string) {
    const l = LOC_BY_ID.get(id), h = this.S.hold[id];
    if (!l || !h) return 0;
    const fortMult = 1 + (h.fortLv ?? 0) * 0.12 + (h.commanderId ? 0.15 : 0);
    const base = Math.round((l.type === 'city' ? 450 : l.minor ? 120 : 240) * (1 + Math.min(20, h.g) / 20) * fortMult);
    return h.isolated ? Math.round(base * 0.45) : base;
  }

  private holdDefMul(holdId: string): number {
    const h = this.S.hold[holdId];
    if (!h) return 1;
    return (1 + (h.fortLv ?? 0) * 0.14) * (h.commanderId ? 1.15 : 1);
  }
  private clearHoldCommanderByIds(ids: Set<number>) {
    if (!ids.size) return;
    for (const h of Object.values(this.S.hold)) {
      if (h.commanderId !== undefined && ids.has(h.commanderId)) {
        delete h.commanderId;
        delete h.commanderName;
      }
    }
  }
  private syncCampSect(cmp: CampState, sid: string, delta: number) {
    if (!delta) return;
    cmp.bySect ??= {};
    if (delta > 0) {
      cmp.bySect[sid] = (cmp.bySect[sid] ?? 0) + delta;
      return;
    }
    let rem = -delta;
    const cur = cmp.bySect[sid] ?? 0;
    if (cur > 0) {
      const take = Math.min(cur, rem);
      cmp.bySect[sid] = cur - take;
      rem -= take;
    }
    if (rem > 0) {
      const keys = Object.keys(cmp.bySect).sort((a, b) => (cmp.bySect![b] ?? 0) - (cmp.bySect![a] ?? 0));
      for (const k of keys) {
        if (rem <= 0) break;
        const v = cmp.bySect[k] ?? 0;
        if (v <= 0) continue;
        const take = Math.min(v, rem);
        cmp.bySect[k] = v - take;
        rem -= take;
      }
    }
  }

  /** 为本宗据点委任或卸任镇守主将（须筑基以上门人） */
  assignHoldCommander(holdId: string, discipleId?: number): { ok: boolean; msg: string } {
    const h = this.S.hold[holdId], m = this.my, l = LOC_BY_ID.get(holdId);
    if (!h || h.o !== MY || !m || !l) return { ok: false, msg: '仅可为本宗据点委任主将。' };
    if (discipleId === undefined) {
      delete h.commanderId;
      delete h.commanderName;
      this.game.updateUI(true);
      return { ok: true, msg: `已卸下${l.name}主将之职。` };
    }
    const d = m.ds.find((x) => x.id === discipleId && x.realm >= 2);
    if (!d) return { ok: false, msg: '须委任筑基以上门人担任据点主将。' };
    for (const id of Object.keys(this.S.hold)) {
      if (this.S.hold[id]?.commanderId === d.id) {
        delete this.S.hold[id].commanderId;
        delete this.S.hold[id].commanderName;
      }
    }
    h.commanderId = d.id;
    h.commanderName = d.name;
    (this.game.mysect as any).log(`委任${d.name}担任${l.name}镇守主将。`);
    this.game.updateUI(true);
    return { ok: true, msg: `已委任${d.name}镇守${l.name}（守御与收益提升）。` };
  }

  /** 本宗两处据点之间直接调防换防 */
  transferHoldGarrison(fromId: string, toId: string, count: number): { ok: boolean; msg: string } {
    const S = this.S, hA = S.hold[fromId], hB = S.hold[toId];
    const lA = LOC_BY_ID.get(fromId), lB = LOC_BY_ID.get(toId);
    if (!hA || !hB || hA.o !== MY || hB.o !== MY || fromId === toId || !lA || !lB) {
      return { ok: false, msg: '须在本宗两处不同据点之间调防。' };
    }
    const n = Math.min(Math.max(1, Math.floor(count)), Math.max(0, hA.g - 1));
    if (n <= 0) return { ok: false, msg: `${lA.name}至少须留一人守备。` };
    hA.g -= n;
    hB.g += n;
    (this.game.mysect as any).log(`自${lA.name}抽调 ${n} 名守军增防${lB.name}。`);
    this.game.updateUI(true);
    return { ok: true, msg: `已从${lA.name}调拨 ${n} 人赴${lB.name}协防。` };
  }

  /** 升级本宗据点防御工事（0 -> 3 级：护阵壁垒、烽燧哨塔、灵脉聚防） */
  upgradeHoldFort(holdId: string): { ok: boolean; msg: string } {
    const h = this.S.hold[holdId], m = this.my, l = LOC_BY_ID.get(holdId);
    if (!h || h.o !== MY || !m || !l) return { ok: false, msg: '仅可修筑本宗据点工事。' };
    const lv = h.fortLv ?? 0;
    if (lv >= 3) return { ok: false, msg: `${l.name}工事已臻至三级圆满。` };
    const cost = [450, 900, 1600][lv] ?? 1600;
    if (m.stones < cost) return { ok: false, msg: `宗门灵石不足（需 ${cost} 灵石）。` };
    m.stones -= cost;
    h.fortLv = lv + 1;
    (this.game.mysect as any).log(`耗资 ${cost} 灵石修筑${l.name}防御工事至 Lv.${h.fortLv}。`);
    this.game.updateUI(true);
    return { ok: true, msg: `${l.name}工事升至 Lv.${h.fortLv}！` };
  }

  /** 判断当前视口附近是否有活跃的局部交锋或战后撤离动画（供渲染器避免静态缓存冻帧） */
  hasActiveRenderUnitsNear(camX: number, camY: number, hw: number, hh: number): boolean {
    for (const sk of this.skirmishes) {
      if (Math.abs(sk.x - camX) < hw + 1200 && Math.abs(sk.y - camY) < hh + 1200) return true;
    }
    for (const pa of this.postActors) {
      if (Math.abs(pa.x - camX) < hw && Math.abs(pa.y - camY) < hh) return true;
    }
    for (const ps of this.postAirships) {
      if (Math.abs(ps.x - camX) < hw + 500 && Math.abs(ps.y - camY) < hh + 500) return true;
    }
    for (const B of this.battles) {
      for (const s of B.airships) {
        if (Math.abs(s.x - camX) < hw + 500 && Math.abs(s.y - camY) < hh + 500) return true;
      }
    }
    return false;
  }

  /** 返回当前地图正在活跃开战/列阵中的战区范围（供路人避让及战前清场用） */
  activeWarZones(map = ACTIVE_MAP): { x: number; y: number; r: number; warId: number }[] {
    const out: { x: number; y: number; r: number; warId: number }[] = [];
    for (const B of this.battles) {
      out.push({ x: B.x, y: B.y, r: 2800, warId: B.war });
    }
    for (const w of this.S.wars) {
      if (w.fall || w.phase !== 'battle') continue;
      if (this.hasBattleForWar(w.id)) continue;
      const fp = this.frontPos(w);
      if (fp && fp.map === map) out.push({ x: fp.x, y: fp.y, r: 1950, warId: w.id });
    }
    return out;
  }

  /** 判定坐标是否落入某场战事的大营或其外围阵线警戒哨卡内（及该营所属宗门阵营） */
  findCampIntrusion(x: number, y: number, map = ACTIVE_MAP): { w: SWar; side: 0 | 1; cmp: CampState; isOutpost: boolean; dist: number } | null {
    for (const w of this.S.wars) {
      if (w.fall) continue;
      for (const sIdx of [0, 1] as const) {
        const cmp = sIdx === 0 ? w.campA : w.campB;
        if (!cmp || cmp.map !== map) continue;
        const lay = this.campLayout(w, sIdx);
        const lx = x - cmp.x, ly = y - cmp.y;
        const inCore = Math.hypot(lx / Math.max(1, lay.rx + 180), ly / Math.max(1, lay.ry + 140)) <= 1;
        const inPerimeter = Math.hypot(lx / Math.max(1, lay.rx + 420), ly / Math.max(1, lay.ry + 320)) <= 1;
        if (inCore || inPerimeter) {
          return { w, side: sIdx, cmp, isOutpost: !inCore, dist: Math.hypot(lx, ly) };
        }
      }
    }
    return null;
  }

  /** v0.73：读取（或按宗门规模自动初始化）宗门战备后勤账本 */
  supplyOf(sid: string): SectSupply {
    const S = this.S;
    const map = (S.supply ??= {});
    let sp = map[sid];
    if (!sp) {
      const holds = this.holdsOf(sid).length;
      sp = defaultSectSupply(this.scale(sid), holds);
      if (sid === MY && this.my) sp.stones = Math.max(0, Math.round(this.my.stones));
      map[sid] = sp;
    }
    if (sid === MY && this.my) sp.stones = Math.max(0, Math.round(this.my.stones));
    return sp;
  }

  /** v0.73：伤员回流消耗疗伤丹药（有丹加速恢复、断丹缓慢自然康复） */
  consumeHealingPills(sid: string, wantHeal: number): number {
    if (wantHeal <= 0) return 0;
    const sp = this.supplyOf(sid);
    if (sp.pills <= 0) return 0;
    const needPills = Math.max(0.25, wantHeal * 0.5);
    const used = Math.min(sp.pills, needPills);
    sp.pills = Math.max(0, +(sp.pills - used).toFixed(2));
    return used;
  }

  /** v0.73：捐献或缴获战备物资入库（pills / stones / mats） */
  addSupply(sid: string, patch: { stones?: number; pills?: number; mats?: number }) {
    const sp = this.supplyOf(sid);
    if (patch.stones && Number.isFinite(patch.stones)) {
      if (sid === MY && this.my) { this.my.stones = Math.max(0, this.my.stones + patch.stones); sp.stones = Math.round(this.my.stones); }
      else sp.stones = Math.max(0, Math.round(sp.stones + patch.stones));
    }
    if (patch.pills && Number.isFinite(patch.pills)) sp.pills = Math.max(0, Math.min(sp.maxPills * 1.5, +(sp.pills + patch.pills).toFixed(2)));
    if (patch.mats && Number.isFinite(patch.mats)) sp.mats = Math.max(0, Math.round(sp.mats + patch.mats));
  }

  /** v0.73 Phase 5：批量捐献丹药 / 灵草 / 灵石 / 阵材充实宗门战备库（换战功与宗门贡献） */
  donateSupply(sid: string, itemId: string, qty = 1): { ok: boolean; count: number; merit: number; contrib: number; msg: string } {
    const g = this.game, h = g.hero;
    if (!sid || qty <= 0) return { ok: false, count: 0, merit: 0, contrib: 0, msg: '参数无效' };
    const it = itemDef(itemId);
    const have = C.bagCount(h, itemId);
    const n = Math.min(Math.max(1, Math.floor(qty)), have);
    if (n <= 0) return { ok: false, count: 0, merit: 0, contrib: 0, msg: `储物袋中并无${it.name}` };
    const taken = C.removeItem(h, itemId, n);
    if (taken <= 0) return { ok: false, count: 0, merit: 0, contrib: 0, msg: '扣除物品失败' };
    let meritGain = 0, contribGain = 0;
    if (itemId === 'mat_lingshi' || itemId === 'mat_lingjing' || itemId === 'mat_xianyuan') {
      const stoneScale = itemId === 'mat_lingjing' ? planeExchangeRate('spirit') : itemId === 'mat_xianyuan' ? planeExchangeRate('immortal') : 1;
      const eq = taken * stoneScale;
      this.addSupply(sid, { stones: eq });
      meritGain = Math.max(1, Math.floor(eq / 20));
      contribGain = Math.max(1, Math.floor(eq / 10));
    } else if (it.type === 'pill') {
      const pillVal = (1 + it.tier * 0.8) * taken;
      this.addSupply(sid, { pills: pillVal });
      meritGain = Math.max(2, Math.round((3 + it.tier * 4) * taken));
      contribGain = Math.max(2, Math.round((5 + it.tier * 6) * taken));
    } else if (it.type === 'herb') {
      const pillVal = (0.5 + it.tier * 0.45) * taken;
      this.addSupply(sid, { pills: pillVal });
      meritGain = Math.max(1, Math.round((2 + it.tier * 2.5) * taken));
      contribGain = Math.max(1, Math.round((3 + it.tier * 4) * taken));
    } else {
      const matVal = (0.8 + it.tier * 0.6) * taken;
      this.addSupply(sid, { mats: matVal });
      meritGain = Math.max(1, Math.round((2 + it.tier * 3) * taken));
      contribGain = Math.max(2, Math.round((4 + it.tier * 5) * taken));
    }
    g.war.merit += meritGain;
    if (g.ws.sect && g.ws.sect.id === sid) g.ws.sect.contrib += contribGain;
    else contribGain = 0;
    if (sid !== MY) g.rel.addSect(sid, Math.min(8, Math.max(0.5, meritGain * 0.08)));
    const msg = `向${this.name(sid)}捐献 ${it.name} ×${taken}：战功 +${meritGain}${contribGain ? `、贡献 +${contribGain}` : ''}`;
    g.toast(`已向${this.name(sid)}捐献 ${it.name} ×${taken}`, 'good');
    return { ok: true, count: taken, merit: meritGain, contrib: contribGain, msg };
  }

  /** 各宗战船坞等效等级（本宗读自宗门建筑 halls.dock，NPC 按宗门规模定阶） */
  dockLevelOf(sid: string): number {
    if (sid === MY) return this.my?.halls.dock ?? 0;
    return { xiao: 1, zhong: 3, da: 5 }[this.scale(sid)];
  }

  /** 读取或初始化宗门飞舟舰队库存（玩家自建宗门初始为 0，须建战船坞自造或战后缴获；NPC 依宗门底蕴持初始舰队） */
  fleetOf(sid: string): SectFleet {
    const map = (this.S.fleet ??= {});
    let fl = map[sid];
    if (!fl) {
      fl = defaultSectFleet(this.scale(sid), sid === MY);
      map[sid] = fl;
    }
    fl.damaged ??= { t1: 0, t2: 0, t3: 0 };
    fl.building ??= [];
    return fl;
  }

  /** 统计宗门当前正在战场悬停或正在执行运丹/行军护航任务占用中的飞舟（两线共用库存） */
  fleetBusy(sid: string): { t1: number; t2: number; t3: number } {
    let t1 = 0, t2 = 0, t3 = 0;
    for (const mc of this.activeMarches()) {
      if (mc.sid !== sid) continue;
      if (mc.kind === 'convoy' && mc.usesShip) t1++;
      else if (mc.kind !== 'convoy' && mc.airshipTier) {
        if (mc.airshipTier === 1) t1++;
        else if (mc.airshipTier === 2) t2++;
        else t3++;
      }
    }
    for (const B of this.battles) {
      for (const s of B.airships) {
        if (s.sid !== sid || s.sunk) continue;
        if (s.tier === 1) t1++;
        else if (s.tier === 2) t2++;
        else t3++;
      }
    }
    return { t1, t2, t3 };
  }

  /** 从宗门空闲完好飞舟中挑选一艘护航战船（严格受库存限制，不凭空刷船） */
  private pickEscortAirshipTier(sid: string, prefer: AirshipTier[] = [2, 1, 3]): AirshipTier | undefined {
    const avail = this.fleetAvailable(sid);
    for (const t of prefer) {
      const k = (`t${t}`) as 't1' | 't2' | 't3';
      if (avail[k] > 0) return t;
    }
    return undefined;
  }

  /** 计算实景战阵/战船/增援从己方大营方向出阵的起点（有近旁大营直出营门；maxDist=Infinity 时始终从真实大营门前出发） */
  private campDispatchOrigin(w: SWar | undefined, side: 0 | 1, fx: number, fy: number, ea: number, maxDist = 2300): { x: number; y: number } {
    const ux = Math.cos(ea), uy = Math.sin(ea);
    const sign = side === 0 ? -1 : 1;
    const cmp = w ? this.campPos(w, side) : null;
    if (cmp && cmp.map === ACTIVE_MAP) {
      const dx = cmp.x - fx, dy = cmp.y - fy;
      const d = Math.hypot(dx, dy);
      if (d > 400) {
        if (!Number.isFinite(maxDist) || d <= maxDist + 450) {
          // 从大营面向前线一侧的营门列阵出发
          const gateAdvance = Math.min(340, d * 0.18);
          return { x: cmp.x - (dx / d) * gateAdvance, y: cmp.y - (dy / d) * gateAdvance };
        }
        return { x: fx + (dx / d) * maxDist, y: fy + (dy / d) * maxDist };
      }
    }
    const fallbackDist = Number.isFinite(maxDist) ? maxDist : 2600;
    return { x: fx + ux * sign * fallbackDist, y: fy + uy * sign * fallbackDist };
  }

  /** 当前空闲可调派的完好飞舟数量 */
  fleetAvailable(sid: string): { t1: number; t2: number; t3: number } {
    const fl = this.fleetOf(sid);
    const busy = this.fleetBusy(sid);
    return {
      t1: Math.max(0, fl.t1 - busy.t1),
      t2: Math.max(0, fl.t2 - busy.t2),
      t3: Math.max(0, fl.t3 - busy.t3),
    };
  }

  /** 舰队总览（供宗门面板与天下宗门详情使用） */
  fleetSummary(sid: string) {
    const fl = this.fleetOf(sid);
    const busy = this.fleetBusy(sid);
    const avail = {
      t1: Math.max(0, fl.t1 - busy.t1),
      t2: Math.max(0, fl.t2 - busy.t2),
      t3: Math.max(0, fl.t3 - busy.t3),
    };
    const sp = this.supplyOf(sid);
    const dockLv = this.dockLevelOf(sid);
    const maxSlips = dockLv >= 4 ? 2 : dockLv >= 1 ? 1 : 0;
    return {
      dockLv,
      maxSlips,
      intact: { t1: fl.t1, t2: fl.t2, t3: fl.t3 },
      busy,
      avail,
      damaged: { t1: fl.damaged?.t1 ?? 0, t2: fl.damaged?.t2 ?? 0, t3: fl.damaged?.t3 ?? 0 },
      building: (fl.building ?? []).map((b) => ({ ...b })),
      mats: Math.floor(sp.mats),
      stones: sid === MY && this.my ? this.game.mysect.balance().total : Math.floor(sp.stones),
    };
  }

  private queueShipBuild(sid: string, tier: 1 | 2 | 3, useMySectPay: boolean): { ok: boolean; msg: string } {
    const dockLv = this.dockLevelOf(sid);
    const spec = AIRSHIP_BUILD_SPEC[tier];
    if (dockLv < spec.dockLvReq) {
      return { ok: false, msg: `建造${spec.name}须战船坞 ${spec.dockLvReq} 级（当前 ${dockLv} 级）` };
    }
    const fl = this.fleetOf(sid);
    const maxSlips = dockLv >= 4 ? 2 : 1;
    if ((fl.building?.length ?? 0) >= maxSlips) {
      return { ok: false, msg: `战船坞船台已满（当前同时可造 ${maxSlips} 艘，4 级船坞可扩至双船台）` };
    }
    const sp = this.supplyOf(sid);
    if (sp.mats < spec.mats) {
      return { ok: false, msg: `阵材不足（需 ${spec.mats} 份，当前 ${Math.floor(sp.mats)} 份）` };
    }
    if (useMySectPay) {
      if (!this.game.mysect.canPay(spec.stones)) {
        return { ok: false, msg: `灵石不足（需 ${spec.stones} 灵石）` };
      }
      if (!this.game.mysect.pay(spec.stones)) {
        return { ok: false, msg: '扣除灵石失败' };
      }
      if (this.my) sp.stones = Math.max(0, Math.round(this.my.stones));
    } else {
      if (sp.stones < spec.stones) return { ok: false, msg: '宗门灵石不足' };
      sp.stones = Math.max(0, Math.round(sp.stones - spec.stones));
    }
    sp.mats = Math.max(0, +(sp.mats - spec.mats).toFixed(1));
    const totalDays = Math.max(4, Math.round(spec.days * Math.max(0.55, 1 - (dockLv - 1) * 0.11)));
    fl.building!.push({ tier, remDays: totalDays, totalDays });
    if (sid === MY) {
      (this.game.mysect as any).log(`战船坞动工建造一艘${spec.name}（工期 ${totalDays} 日，耗灵石 ${spec.stones}、阵材 ${spec.mats}）。`);
      this.game.updateUI(true);
    }
    return { ok: true, msg: `已动工建造${spec.name}，预计 ${totalDays} 日后下水入列` };
  }

  /** 本宗战船坞动工造船 */
  buildAirship(tier: 1 | 2 | 3): { ok: boolean; msg: string } {
    if (!this.my) return { ok: false, msg: '尚未开宗立派' };
    return this.queueShipBuild(MY, tier, true);
  }

  /** 本宗战船坞抢修受损战船 */
  repairAirship(tier: 1 | 2 | 3): { ok: boolean; msg: string } {
    if (!this.my) return { ok: false, msg: '尚未开宗立派' };
    const dockLv = this.dockLevelOf(MY);
    if (dockLv < 1) return { ok: false, msg: '尚未建起战船坞（需 1 级以上）' };
    const fl = this.fleetOf(MY);
    const tk = (`t${tier}`) as 't1' | 't2' | 't3';
    if ((fl.damaged?.[tk] ?? 0) <= 0) return { ok: false, msg: '眼下没有此类受损待修战船' };
    const spec = AIRSHIP_BUILD_SPEC[tier];
    const sp = this.supplyOf(MY);
    if (sp.mats < spec.repairMats) return { ok: false, msg: `大修阵材不足（需 ${spec.repairMats} 份）` };
    if (!this.game.mysect.pay(spec.repairStones)) return { ok: false, msg: `灵石不足（需 ${spec.repairStones} 灵石）` };
    sp.stones = Math.max(0, Math.round(this.my.stones));
    sp.mats = Math.max(0, +(sp.mats - spec.repairMats).toFixed(1));
    fl.damaged![tk]--;
    fl[tk]++;
    (this.game.mysect as any).log(`战船坞大修一艘${spec.name}完毕，重回战备之列。`);
    this.game.updateUI(true);
    return { ok: true, msg: `${spec.name}已抢修完毕，重归舟师` };
  }

  /** 本宗采买炼舟阵材（1 阵材 = 180 灵石） */
  buyWarMats(qty = 10): { ok: boolean; msg: string } {
    if (!this.my) return { ok: false, msg: '尚未开宗立派' };
    const n = Math.max(1, Math.floor(qty));
    const cost = n * AIRSHIP_MAT_STONE_PRICE;
    if (!this.game.mysect.pay(cost)) return { ok: false, msg: `灵石不足（采买 ${n} 份阵材需 ${cost} 灵石）` };
    const sp = this.supplyOf(MY);
    sp.stones = Math.max(0, Math.round(this.my.stones));
    sp.mats = Math.round((sp.mats + n) * 10) / 10;
    this.game.updateUI(true);
    return { ok: true, msg: `已采买阵材 ${n} 份（耗 ${cost} 灵石）` };
  }

  /** v0.73：闭式推进各宗日度战备产出，并推进战船坞在建/维修/NPC 补造 */
  tickSupply(days: number) {
    if (days <= 0) return;
    const S = this.S;
    const gone = S.gone ?? {};
    const byOwner = this.holdsMap(S);
    for (const sid of this.sects()) {
      if (gone[sid]) continue;
      const sp = this.supplyOf(sid);
      const holds = byOwner.get(sid)?.length ?? 0;
      const base = defaultSectSupply(this.scale(sid), holds);
      sp.herbDaily = base.herbDaily;
      sp.stoneDaily = base.stoneDaily;
      sp.maxPills = base.maxPills;
      const danBonus = sid === MY && this.my ? 1 + (this.my.halls.dan ?? 0) * 0.25 : 1;
      sp.pills = Math.min(sp.maxPills, +(sp.pills + sp.herbDaily * danBonus * days).toFixed(2));
      if (sid !== MY) {
        sp.stones = Math.min(sp.maxPills * 400, Math.round(sp.stones + sp.stoneDaily * days));
        sp.mats = Math.min(sp.maxPills, Math.round((sp.mats + (0.25 + holds * 0.08) * days) * 10) / 10);
      } else if (this.my) {
        sp.stones = Math.max(0, Math.round(this.my.stones));
        const dockBonus = (this.my.halls.dock ?? 0) * 0.35;
        const matCap = Math.max(220, sp.maxPills);
        sp.mats = Math.min(matCap, Math.round((sp.mats + (0.4 + holds * 0.12 + dockBonus) * days) * 10) / 10);
      }

      // 推进战船坞在建队列
      const fl = this.fleetOf(sid);
      const dockLv = this.dockLevelOf(sid);
      if (fl.building && fl.building.length > 0 && dockLv >= 1) {
        const speedMul = 1 + Math.max(0, dockLv - 1) * 0.08;
        const remain: typeof fl.building = [];
        for (const ord of fl.building) {
          ord.remDays -= days * speedMul;
          if (ord.remDays <= 0) {
            const tk = (`t${ord.tier}`) as 't1' | 't2' | 't3';
            fl[tk]++;
            if (sid === MY) {
              const nm = AIRSHIP_BUILD_SPEC[ord.tier].name;
              (this.game.mysect as any).log(`战船坞捷报：新造「${nm}」下水入列！`);
              this.game.toast(`战船坞捷报：${nm}已建成入列！`, 'good');
            }
          } else {
            remain.push(ord);
          }
        }
        fl.building = remain;
      }

      // 战后受损战船自修（NPC 自动用库存阵材/灵石修复；本宗仅在留足保底线且船坞可用时缓修）
      if (dockLv >= 1 && fl.damaged) {
        for (const tier of [1, 2, 3] as const) {
          const tk = (`t${tier}`) as 't1' | 't2' | 't3';
          if ((fl.damaged[tk] ?? 0) <= 0) continue;
          const spec = AIRSHIP_BUILD_SPEC[tier];
          if (sid === MY && this.my) {
            if (this.my.stones > (this.my.reserve ?? 0) + spec.repairStones && sp.mats >= spec.repairMats) {
              this.my.stones -= spec.repairStones;
              sp.stones = Math.round(this.my.stones);
              sp.mats = Math.max(0, +(sp.mats - spec.repairMats).toFixed(1));
              fl.damaged[tk]--;
              fl[tk]++;
              (this.game.mysect as any).log(`战船坞修复受损${spec.name}，重回舟师编制。`);
            }
          } else if (sp.stones >= spec.repairStones + 800 && sp.mats >= spec.repairMats) {
            sp.stones -= spec.repairStones;
            sp.mats = Math.max(0, +(sp.mats - spec.repairMats).toFixed(1));
            fl.damaged[tk]--;
            fl[tk]++;
          }
        }
      }

      // NPC 宗门依规模自动补造沉毁的飞舟（绝不凭空刷新）
      if (sid !== MY && dockLv >= 1 && (fl.building?.length ?? 0) === 0) {
        const target = defaultSectFleet(this.scale(sid), false);
        const needTier: 1 | 2 | 3 | null =
          fl.t1 + (fl.damaged?.t1 ?? 0) < target.t1 ? 1
            : fl.t2 + (fl.damaged?.t2 ?? 0) < target.t2 ? 2
              : fl.t3 + (fl.damaged?.t3 ?? 0) < target.t3 ? 3
                : null;
        if (needTier) {
          const spec = AIRSHIP_BUILD_SPEC[needTier];
          if (sp.stones >= spec.stones + 1200 && sp.mats >= spec.mats) {
            this.queueShipBuild(sid, needTier, false);
          }
        }
      }
    }
  }

  /** 清洗单场战事的攻守双方宗门名单：同盟内战不拉全盟自己打自己，跨盟交战亦严禁任何宗门同时出现在攻守双方 */
  private sanitizeWarSides(w: SWar) {
    if (w.campaign) return;
    const alA = allyOf(w.a), alB = allyOf(w.b);
    const sameAlly = !!(alA && alA === alB);
    if (sameAlly) {
      // 同盟内部世仇/争端：只由当事双方自行对决，严禁把其余同盟宗门同时拉进攻守双方
      delete w.sideA;
      delete w.sideB;
      delete w.sideAName;
      delete w.sideBName;
      return;
    }
    const filterSide = (list: string[] | undefined, lead: string, opp: string, oppAl: string): string[] | undefined => {
      if (!list || list.length <= 1) return list;
      const out: string[] = [];
      const seen = new Set<string>();
      for (const sid of list) {
        if (!sid || seen.has(sid) || sid === opp) continue;
        if (sid !== lead && oppAl && allyOf(sid) === oppAl) continue;
        if (sid !== lead && this.between(sid, lead)) continue;
        seen.add(sid);
        out.push(sid);
      }
      if (!seen.has(lead)) out.unshift(lead);
      return out.length > 1 ? out : undefined;
    };
    w.sideA = filterSide(w.sideA, w.a, w.b, alB);
    w.sideB = filterSide(w.sideB, w.b, w.a, alA);
    if (w.sideA && w.sideB) {
      const setA = new Set(w.sideA);
      const setB = new Set(w.sideB);
      const cleanA: string[] = [];
      const cleanB: string[] = [];
      for (const sid of w.sideA) {
        if (sid === w.a || !setB.has(sid) || (alA && allyOf(sid) === alA)) cleanA.push(sid);
      }
      const finalA = new Set(cleanA);
      for (const sid of w.sideB) {
        if (sid === w.b || (!finalA.has(sid) && (!alB || !alA || allyOf(sid) !== alA))) cleanB.push(sid);
      }
      w.sideA = cleanA.length > 1 ? cleanA : undefined;
      w.sideB = cleanB.length > 1 ? cleanB : undefined;
    }
    if (!w.sideA || w.sideA.length <= 1) { delete w.sideA; delete w.sideAName; }
    if (!w.sideB || w.sideB.length <= 1) { delete w.sideB; delete w.sideBName; }
  }

  /** 正魔大战或同盟参战时，按同图同阵营自动拉起联军参战宗门列表 */
  private allianceSectsFor(lead: string, opp: string): string[] {
    const map = LOC_BY_ID.get(lead)?.map;
    const leadMo = this.dao(lead) === 'mo';
    const al = allyOf(lead);
    const oppAl = allyOf(opp);
    const peers = this.sects(map)
      .filter((x) => {
        if (x === lead || x === opp) return false;
        if ((this.dao(x) === 'mo') !== leadMo) return false;
        if (oppAl && allyOf(x) === oppAl) return false;
        if (FEUD.has(key(lead, x))) return false;
        if (this.between(lead, x)) return false;
        if (al && allyOf(x) === al) return true;
        return leadMo || (this.base(lead, x) < 20 && this.base(opp, x) >= 20);
      })
      .sort((a, b) => this.strength(b) - this.strength(a))
      .slice(0, 5);
    return [lead, ...peers];
  }

  private fillAllianceSides(w: SWar) {
    if (w.campaign) return;
    if (w.a === MY || w.b === MY) return;
    const alA = allyOf(w.a), alB = allyOf(w.b);
    if (alA && alA === alB) {
      this.sanitizeWarSides(w);
      return;
    }
    const isCoalition = this.isZM(w);
    if (!w.sideA || w.sideA.length <= 1) {
      const sa = isCoalition
        ? this.allianceSectsFor(w.a, w.b)
        : [w.a, ...this.sects(LOC_BY_ID.get(w.a)?.map).filter((x) => x !== w.a && x !== w.b && alA && allyOf(x) === alA && (!alB || allyOf(x) !== alB) && !FEUD.has(key(w.a, x)) && !this.between(w.a, x)).slice(0, 4)];
      if (sa.length > 1) {
        w.sideA = sa;
        w.sideAName = this.dao(w.a) === 'mo' ? '魔道联军' : '正道同盟';
      }
    }
    if (!w.sideB || w.sideB.length <= 1) {
      const oppSet = new Set(w.sideA ?? [w.a]);
      const sb = isCoalition
        ? this.allianceSectsFor(w.b, w.a).filter((x) => x === w.b || !oppSet.has(x))
        : [w.b, ...this.sects(LOC_BY_ID.get(w.b)?.map).filter((x) => x !== w.b && x !== w.a && !oppSet.has(x) && alB && allyOf(x) === alB && (!alA || allyOf(x) !== alA) && !FEUD.has(key(w.b, x)) && !this.between(w.b, x)).slice(0, 4)];
      if (sb.length > 1) {
        w.sideB = sb;
        w.sideBName = this.dao(w.b) === 'mo' ? '魔道联军' : '正道同盟';
      }
    }
    this.sanitizeWarSides(w);
  }

  /** 计算某方大营内各参战宗门的连片布局（单宗或联军多宗毗连成片） */
  private campLayout(w: SWar, sIdx: 0 | 1): {
    rx: number; ry: number; cx: number; cy: number; reach: number;
    subs: { sid: string; ox: number; oy: number }[];
  } {
    const cmp = sIdx === 0 ? w.campA : w.campB;
    const lv = cmp ? this.campLevel(cmp) : 1;
    const baseRx = lv === 1 ? 500 : lv === 2 ? 700 : 900;
    const baseRy = lv === 1 ? 300 : lv === 2 ? 420 : 540;
    const sects = this.sideSects(w, sIdx).slice(0, 8);
    if (sects.length <= 1) {
      return { rx: baseRx, ry: baseRy, cx: 0, cy: 0, reach: baseRx + 180, subs: [{ sid: sects[0] ?? (sIdx === 0 ? w.a : w.b), ox: 0, oy: 0 }] };
    }
    const fp = this.frontPos(w), cp = this.campPos(w, sIdx);
    const angToFront = fp && cp ? Math.atan2(fp.y - cp.y, fp.x - cp.x) : (sIdx === 0 ? 0 : Math.PI);
    const fx = Math.cos(angToFront), fy = Math.sin(angToFront);
    const px = -fy, py = fx;
    const subs: { sid: string; ox: number; oy: number }[] = [{ sid: sects[0], ox: 0, oy: 0 }];
    // 其余参战宗门按左右翼与后营紧邻主帅总营展开，组成「总营帐 + 各参与门派营帐」连片驻地
    const slots: [number, number][] = [
      [1, -0.15], [-1, -0.15],
      [0.58, -0.95], [-0.58, -0.95],
      [1.68, -0.52], [-1.68, -0.52],
      [0, -1.2],
    ];
    for (let i = 1; i < sects.length; i++) {
      const [lat, back] = slots[i - 1] ?? [((i % 2 ? 1 : -1) * Math.ceil(i / 2)), -0.95];
      const ox = px * lat * 330 + fx * back * 235;
      const oy = py * lat * 255 + fy * back * 185;
      subs.push({ sid: sects[i], ox, oy });
    }
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const s of subs) {
      if (s.ox < minX) minX = s.ox; if (s.ox > maxX) maxX = s.ox;
      if (s.oy < minY) minY = s.oy; if (s.oy > maxY) maxY = s.oy;
    }
    const padX = Math.max(320, baseRx * 0.5);
    const padY = Math.max(210, baseRy * 0.5);
    const cx = (minX + maxX) * 0.5, cy = (minY + maxY) * 0.5;
    const rx = Math.max(baseRx, (maxX - minX) * 0.5 + padX);
    const ry = Math.max(baseRy, (maxY - minY) * 0.5 + padY);
    return { rx, ry, cx, cy, reach: Math.hypot(rx, ry) * 0.92 + 180, subs };
  }

  /** v0.73：幂等老存档战争与后勤账本迁移 */
  migrateWarState() {
    this.initHolds();
    const S = this.S;
    S.supply ??= {};
    for (const sid of this.sects()) this.supplyOf(sid);
    for (const w of S.wars) {
      this.fillAllianceSides(w);
      const hadA = !!w.campA, hadB = !!w.campB;
      if (!hadA || !hadB) this.initCampsForWar(w);
      if (w.phase === 'battle') {
        if (!hadA && w.campA) { w.campA.established = true; w.campA.build = Math.max(0.5, w.campA.build); w.campA.soldiers = Math.max(120, w.campA.soldiers); }
        if (!hadB && w.campB) { w.campB.established = true; w.campB.build = Math.max(0.5, w.campB.build); w.campB.soldiers = Math.max(110, w.campB.soldiers); }
        // 若旧存档在先遣部队尚在行军未立营时便被提前置入 battle，恢复为 prep 待双方立营后再展开正式对峙
        if (!w.campaign && ((!w.campA?.established || w.campA.soldiers <= 0) || (!w.campB?.established || w.campB.soldiers <= 0))) {
          const hasArmyMarch = (S.marches ?? []).some((m) => m.warId === w.id && !m.done && m.kind === 'army');
          if (hasArmyMarch) w.phase = 'prep';
        }
      }
      this.relocateCampsIfNeeded(w, false);
    }
    if (S.v73 === 1) return;
    // 兼容旧版 war.ts (mulan / xing) 字段，防止老存档读入缺字段
    const f = this.game.ws.flags as any;
    if (f.war && typeof f.war === 'object') {
      for (const w of Object.values(f.war) as any[]) {
        if (w && typeof w === 'object' && w.score === undefined) w.score = 0;
      }
    }
    S.v73 = 1;
  }

  /** v0.73：退宗 / 辞职自立时，同步注销旧宗未履行的征召军令与待办传音玉符 */
  revokeSectOrders(oldSectId: string) {
    if (!oldSectId) return;
    const g = this.game;
    const S = this.S;
    for (const w of S.wars) {
      if (w.a === oldSectId || w.b === oldSectId) {
        w.called = false;
        if (w.side !== undefined && w.a !== MY && w.b !== MY) {
          const mine = w.side === 0 ? w.a : w.b;
          if (mine === oldSectId) w.side = undefined;
        }
      }
    }
    if (Array.isArray(S.warOrders)) {
      for (const ord of S.warOrders) {
        if (!ord.done && ord.sid === oldSectId) ord.done = true;
      }
    }
    const inbox = g.war?.inbox;
    if (Array.isArray(inbox)) {
      for (const j of inbox) {
        if (j.done) continue;
        const sw = j.sw !== undefined ? S.wars.find((x) => x.id === j.sw) : undefined;
        if (j.from === oldSectId || (sw && (sw.a === oldSectId || sw.b === oldSectId))) {
          j.done = true;
        }
      }
    }
  }

  // ---------------------------------------------------------------- 每日：紧张度、开战、战事推进
  daily(days: number) {
    const g = this.game, S = this.S; this.initHolds();
    this.tickSupply(days);
    this.tickHoldLogistics(days);
    this.tickMarchesAndCamps(days);
    for (const w of S.wars) this.tickAttrition(w, days);
    this.dacc += days;
    if (this.dacc >= 5) { const dd = this.dacc; this.dacc = 0; this.drift(dd); this.aiClaimFreeHolds(); }
    for (const w of [...S.wars]) this.tickWar(w);
    const m = this.my;
    if (m) {
      S.myInc ??= g.day;
      if (g.day - S.myInc >= 30) { const mo = Math.floor((g.day - S.myInc) / 30); S.myInc += mo * 30; let v = 0; for (const id of this.holdsOf(MY)) v += this.holdIncome(id);
        for (const id of S.branch ?? []) v += BRANCH[this.scale(id)];
        let vs = 0; for (const id of Object.keys(S.vassal ?? {})) vs += VASSAL[this.scale(id)];
        // v0.62：据点、分舵的进项按抽成归宗主；附庸的月供径入宗主供奉
        const tb = Math.round(v * (m.cut ?? 0.3)) * mo + vs * mo;
        m.stones += v * mo - (tb - vs * mo); m.tribute += tb; m.earned = (m.earned ?? 0) + tb; }
      this.clampMyGar();
    }
  }
  private canWar(sid: string) {
    if (this.warOf(sid)) return false;
    if ((this.S.recoverUntil?.[sid] ?? 0) > this.game.day) return false;
    if (sid === MY) { const m = this.my!; return this.combatTotal(MY) >= 12 && this.game.day - m.founded > 2 * YEAR; }
    return this.alive(sid) >= this.size(sid) * 0.6;
  }
  private drift(dd: number) {
    const g = this.game, S = this.S, allSects = this.sects(), maps = new Set(allSects.map((s) => LOC_BY_ID.get(s)!.map as string));
    const grace = g.day < GRACE;   // 开局头三年天下太平：只有摩擦，不起大战
    const byOwner = this.holdsMap(S);
    const ptsOf = new Map<string, LocDef[]>();
    const daoOf = new Map<string, Dao>();
    const allyOfSid = new Map<string, string | undefined>();
    for (const sid of allSects) {
      const l0 = LOC_BY_ID.get(sid);
      if (l0) {
        const pts: LocDef[] = [l0];
        for (const hid of byOwner.get(sid) ?? []) {
          const hl = LOC_BY_ID.get(hid);
          if (hl && !S.hold[hid]?.isolated) pts.push(hl);
        }
        ptsOf.set(sid, pts);
      }
      daoOf.set(sid, this.dao(sid));
      allyOfSid.set(sid, allyOf(sid));
    }
    const relSect = this.game.rel.S.sect as Record<string, number>;
    const vassals = S.vassal ?? {};
    const activeWarPairs = new Set<string>();
    for (const w of S.wars) activeWarPairs.add(key(w.a, w.b));
    const contactDistCached = (a: string, b: string): number => {
      const pa = ptsOf.get(a), pb = ptsOf.get(b);
      if (!pa || !pb) return Infinity;
      let best = Infinity;
      for (let i = 0; i < pa.length; i++) {
        const x1 = pa[i].x, y1 = pa[i].y;
        for (let j = 0; j < pb.length; j++) {
          const d = Math.hypot(x1 - pb[j].x, y1 - pb[j].y);
          if (d < best) best = d;
        }
      }
      return best;
    };
    for (const m of maps) {
      const ids = allSects.filter((s) => LOC_BY_ID.get(s)?.map === m);
      const hot: [string, string, number][] = [], warm: [string, string][] = [];
      const maxAutoDist = Math.round(155 * this.holdDistMul(m));
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i], b = ids[j];
        if ((a === MY || b === MY) && vassals[a === MY ? b : a]) continue;
        const k = key(a, b);
        const feud = FEUD.has(k);
        const al = allyOfSid.get(a);
        if (al && al === allyOfSid.get(b) && !feud) continue;
        const contactD = contactDistCached(a, b);
        if (a !== MY && b !== MY && !feud && contactD > 135) continue;
        const la = ptsOf.get(a)![0], lb = ptsOf.get(b)![0];
        let b0 = daoBase(daoOf.get(a)!, daoOf.get(b)!) + (feud ? 30 : 0);
        const d0 = Math.min(contactD, Math.hypot(la.x - lb.x, la.y - lb.y));
        b0 += d0 < 60 ? 10 : d0 < 130 ? 5 : 0;
        if (a === MY || b === MY) { const o = a === MY ? b : a; b0 += clamp(-(relSect[o] ?? 0), -20, 60) * 0.5; }
        if (b0 < 20) continue;
        if ((S.truce[k] ?? 0) > g.day || activeWarPairs.has(k)) continue;
        const tooFarToAutoWar = a !== MY && b !== MY && contactD > maxAutoDist;
        let cur = S.ten[k] ?? clamp(b0 + rand(-8, 10), 0, 82);
        const farFeudScale = tooFarToAutoWar ? 0.35 : 1;
        const cap = grace ? 99 : tooFarToAutoWar ? 95 : 120;
        cur = Math.min(cap, cur + dd * (b0 / 30) * 0.022 * farFeudScale * rand(0.3, 1.5)); S.ten[k] = cur;
        if (!tooFarToAutoWar) warm.push([a, b]);
        if (!tooFarToAutoWar && cur >= 100) hot.push([a, b, cur]);
      }
      // 边界摩擦：只说眼前这张图上的事，优先取两派势力最邻近的交界据点，且必须有双方真实出兵
      if (m === ACTIVE_MAP && warm.length && Math.random() < 1 - Math.pow(1 - 1 / 50, dd)) {
        const [a, b] = pick(warm), k = key(a, b);
        const la = LOC_BY_ID.get(a), lb = LOC_BY_ID.get(b);
        const midX = ((la?.x ?? 0) + (lb?.x ?? 0)) * 0.5, midY = ((la?.y ?? 0) + (lb?.y ?? 0)) * 0.5;
        const hs = [...(byOwner.get(a) ?? []), ...(byOwner.get(b) ?? [])].sort((id1, id2) => {
          const p1 = LOC_BY_ID.get(id1), p2 = LOC_BY_ID.get(id2);
          const d1 = p1 ? Math.hypot(p1.x - midX, p1.y - midY) : 9999;
          const d2 = p2 ? Math.hypot(p2.x - midX, p2.y - midY) : 9999;
          return d1 - d2;
        });
        const locId = hs.length ? hs[0] : a;
        const locDef = LOC_BY_ID.get(locId) ?? LOC_BY_ID.get(a);
        const at = locDef?.name ?? '两派交界处';
        if (locDef && locDef.map === ACTIVE_MAP) {
          const refX = locDef.x * WORLD_SCALE, refY = locDef.y * WORLD_SCALE;
          const baseA = this.nearestBaseFor(a, refX, refY, ACTIVE_MAP);
          const baseB = this.nearestBaseFor(b, refX, refY, ACTIVE_MAP);
          if (baseA && baseB && baseA.avail >= 4 && baseB.avail >= 4) {
            S.ten[k] = Math.min(grace ? 99 : 120, (S.ten[k] ?? 0) + rand(5, 12));
            const dx = baseB.x - baseA.x, dy = baseB.y - baseA.y, d = Math.hypot(dx, dy) || 1;
            const anchor = Math.hypot(refX - baseA.x, refY - baseA.y) <= Math.hypot(refX - baseB.x, refY - baseB.y) ? baseA : baseB;
            const sgn = anchor === baseA ? 1 : -1;
            const avoidFronts: { x: number; y: number; r: number }[] = [];
            for (const ow of S.wars) {
              if (ow.fall) continue;
              const ofp = this.frontPos(ow);
              if (ofp && ofp.map === ACTIVE_MAP) avoidFronts.push({ x: ofp.x, y: ofp.y, r: 4500 });
            }
            for (const opb of (S.pendingBorders ?? [])) {
              if (opb.map === ACTIVE_MAP) avoidFronts.push({ x: opb.x, y: opb.y, r: 3600 });
            }
            const pos = this.findOpenGround(
              anchor.x + (dx / d) * sgn * 2600,
              anchor.y + (dy / d) * sgn * 2600,
              ACTIVE_MAP,
              { minLocDist: 2300, avoid: avoidFronts },
            );
            S.pendingBorders ??= [];
            const keepBorders: PendingBorderSkirmish[] = [];
            for (const pb of S.pendingBorders) {
              if (pb.until >= g.day) keepBorders.push(pb);
              else this.returnPendingBorder(pb);
            }
            while (keepBorders.length > 5) {
              const drop = keepBorders.shift()!;
              this.returnPendingBorder(drop);
            }
            S.pendingBorders = keepBorders;
            const countA = this.drawFromSource(baseA, 7);
            const countB = this.drawFromSource(baseB, 7);
            if (countA > 0 && countB > 0) {
              S.borderSeq = (S.borderSeq ?? 0) + 1;
              S.pendingBorders.push({
                id: S.borderSeq, a, b, x: pos.x, y: pos.y, map: ACTIVE_MAP, locName: at, until: g.day + 35,
                fromAKind: baseA.kind === 'hold' ? 'hold' : 'gate',
                fromALocId: baseA.locId, fromAName: baseA.label, fromAX: baseA.x, fromAY: baseA.y,
                fromBKind: baseB.kind === 'hold' ? 'hold' : 'gate',
                fromBLocId: baseB.locId, fromBName: baseB.label, fromBX: baseB.x, fromBY: baseB.y,
                countA, countB, createdDay: g.day, arriveDay: g.day + 0.35,
              });
              g.news(`${this.name(a)}（自${baseA.label}）与${this.name(b)}（自${baseB.label}）的巡哨弟子在${at}${pick(['争夺一处灵石矿脉', '为一株灵药', '因口角', '为抢一头妖兽'])}大打出手，各有死伤。两派${this.relWord(S.ten[k])}。`, 'rumor');
            } else {
              if (countA > 0) this.returnToSource(baseA, countA);
              if (countB > 0) this.returnToSource(baseB, countB);
            }
          }
        }
      }
      hot.sort((x, y) => y[2] - x[2]);
      const lastMapWar = S.lastDeclareDay?.[m] ?? -999;
      const warCap = this.maxConcurrentWars(m, hot.length);
      const curMapWars = S.wars.filter((w) => LOC_BY_ID.get(w.a)?.map === m).length;
      const declareCd = curMapWars < Math.max(2, Math.floor(warCap * 0.5)) ? 75 : 150;
      if (g.day - lastMapWar >= declareCd) {
        for (const [a, b] of hot) {
          if (S.wars.filter((w) => LOC_BY_ID.get(w.a)?.map === m).length >= warCap) break;
          if (!this.canWar(a) || !this.canWar(b)) continue;
          // 强者先动手；玩家的宗门不会被代为宣战
          let A = this.strength(a) >= this.strength(b) ? a : b; if (Math.random() < 0.3) A = A === a ? b : a; if (A === MY) A = a === MY ? b : a;
          const D = A === a ? b : a;
          // 若同图已有同阵营/正魔同盟战事，直接并入现有同盟战线增援，避免同目标连刷多场同名「正道同盟 vs 魔道联军」导致每波结算一宗
          // 严禁把同盟内讧或与主战线阵营矛盾的战事误并入对立两侧，防止攻守双方出现同一宗门
          const existingCoalition = S.wars.find((ew) => {
            if (ew.campaign || ew.fall || LOC_BY_ID.get(ew.a)?.map !== m) return false;
            if (allyOf(A) && allyOf(A) === allyOf(D)) return false;
            const zmBoth = (this.dao(A) === 'mo') !== (this.dao(D) === 'mo') && this.isZM(ew);
            const s0 = this.sideSects(ew, 0), s1 = this.sideSects(ew, 1);
            if (s0.includes(A) && s0.includes(D)) return false;
            if (s1.includes(A) && s1.includes(D)) return false;
            const sameSide0 = s0.includes(A) || (zmBoth && this.dao(A) === this.dao(ew.a) && !s1.includes(A));
            const sameSide1 = s1.includes(D) || (zmBoth && this.dao(D) === this.dao(ew.b) && !s0.includes(D));
            const rev0 = s0.includes(D) || (zmBoth && this.dao(D) === this.dao(ew.a) && !s1.includes(D));
            const rev1 = s1.includes(A) || (zmBoth && this.dao(A) === this.dao(ew.b) && !s0.includes(A));
            return (sameSide0 && sameSide1) || (rev0 && rev1);
          });
          if (existingCoalition) {
            this.enlistIntoWar(existingCoalition, A, D);
            (S.lastDeclareDay ??= {})[m] = g.day;
            break;
          }
          // 避免不同战事在同一地理区域扎堆爆发（与已有战事或前线间距不足 5800px 时延后或转挑他区）
          const candTgt = this.nextTarget(A, D);
          const candLoc = LOC_BY_ID.get(candTgt);
          if (candLoc) {
            const cx = candLoc.x * WORLD_SCALE, cy = candLoc.y * WORLD_SCALE;
            const tooCrowded = S.wars.some((ew) => {
              if (ew.fall || LOC_BY_ID.get(ew.a)?.map !== m) return false;
              const efp = this.frontPos(ew);
              return !!efp && efp.map === m && Math.hypot(efp.x - cx, efp.y - cy) < 5800;
            });
            if (tooCrowded) continue;
          }
          this.declare(A, D, FEUD.get(key(a, b)) ?? ((this.dao(a) === 'mo') !== (this.dao(b) === 'mo') ? '正魔不两立' : pick(['争夺灵脉矿藏', '地盘之争', '门人被杀的血仇'])));
          break; // 同图每次漂移至多新起一场战事，避免第 3 年一到期同天扎堆连爆
        }
      }
    }
  }
  /** 判断是否为多宗参与的同盟大战（非剧情战役） */
  private isCoalitionWar(w: SWar): boolean {
    return !w.campaign && (this.sideSects(w, 0).length > 1 || this.sideSects(w, 1).length > 1);
  }
  /** 将新近卷入冲突的同道宗门并入现有同盟战线，扩编连营而不另起炉灶 */
  private enlistIntoWar(w: SWar, A: string, D: string) {
    const S = this.S, g = this.game;
    const s0Pre = this.sideSects(w, 0), s1Pre = this.sideSects(w, 1);
    const aIs0 = s0Pre.includes(A) || (!s1Pre.includes(A) && (s1Pre.includes(D) || this.dao(A) === this.dao(w.a)));
    const sIdxA: 0 | 1 = aIs0 ? 0 : 1;
    const sIdxD: 0 | 1 = (1 - sIdxA) as 0 | 1;
    let added = false;
    const addMember = (sid: string, sideIdx: 0 | 1) => {
      if (this.S.gone?.[sid]) return;
      const otherSects = this.sideSects(w, (1 - sideIdx) as 0 | 1);
      const oppLead = sideIdx === 0 ? w.b : w.a;
      const oppAl = allyOf(oppLead);
      if (otherSects.includes(sid) || (oppAl && allyOf(sid) === oppAl)) return;
      const arr = sideIdx === 0 ? (w.sideA ??= [w.a]) : (w.sideB ??= [w.b]);
      if (!arr.includes(sid)) {
        arr.push(sid);
        added = true;
        this.spawnMarch(w, sideIdx, 'army', { sid, soldiers: Math.min(110, Math.max(20, Math.round(this.combatTotal(sid) * 0.1))) });
      }
    };
    addMember(A, sIdxA);
    addMember(D, sIdxD);
    this.sanitizeWarSides(w);
    if ((w.sideA?.length ?? 0) > 1 && !w.sideAName) w.sideAName = this.dao(w.a) === 'mo' ? '魔道联军' : '正道同盟';
    if ((w.sideB?.length ?? 0) > 1 && !w.sideBName) w.sideBName = this.dao(w.b) === 'mo' ? '魔道联军' : '正道同盟';
    S.ten[key(A, D)] = 110;
    if (added) {
      g.news(`${this.name(A)}与${this.name(D)}积怨爆发，双方各赴已成阵势的${this.sideName(w, sIdxA)}与${this.sideName(w, sIdxD)}前线总营合兵！`, 'rumor');
      const mine = g.ws.sect?.id;
      if (mine && !w.called && canFightAsWarSoldier(worldOfMap(ACTIVE_MAP), g.hero.realm, g.hero.stage)) {
        const mySide: 0 | 1 | undefined = this.sideSects(w, 0).includes(mine) ? 0 : this.sideSects(w, 1).includes(mine) ? 1 : undefined;
        if (mySide !== undefined) {
          w.called = true;
          const sn = sectTitle(mine);
          g.war.send({ kind: '召集', from: `${sn}执法堂`, sw: w.id, side: mySide, text: `${this.name(A)}与${this.name(D)}积怨爆发，${sn}已合兵赶赴${this.tgtName(w)}前线总营。\n\n门下炼气六层以上战兵及筑基骨干速赴大营听候调遣。`, until: g.day + 90 });
        }
      }
    }
  }
  /**
   * v0.70 彩蛋「天下共讨」：自立宗门后亲手除名两派以上，天下宗门人人自危——
   * 本图还在的各派（附庸除外）共结同盟联军讨伐本宗（只建一盘统帅总营，不再拆散成十余场孤战）。
   */
  maybeCoalition(): boolean {
    const g = this.game, S = this.S, m = this.my;
    if (!m || S.qun || (S.mieN ?? 0) < 2) return false;
    S.qun = g.day;
    const foes = this.sects(m.map).filter((s) => s !== MY && !S.vassal?.[s] && !this.between(s, MY));
    if (!foes.length) return false;
    foes.sort((a, b) => this.strength(b) - this.strength(a));
    const lead = foes[0];
    const firstTgt = this.holdsOf(MY).length ? this.nextTarget(lead, MY) : MY;
    const w = this.declare(lead, MY, '天下共讨——此宗连灭两派，人人自危', firstTgt);
    w.sideA = [...foes];
    w.sideAName = '天下讨逆联军';
    w.sideB = [MY];
    w.sideBName = m.name;
    w.tgt = this.nextWarTarget(w, lead, MY);
    for (const s of foes) S.ten[key(s, MY)] = 110;
    this.initCampsForWar(w);
    this.relocateCampsIfNeeded(w, false);
    g.news(`天下震动！${m.name}连灭两派，${foes.length} 家宗门歃血为盟，于总营会师共讨${m.name}。`, 'canon');
    g.openDialog({ speaker: '天下大势', title: '天下共讨', mood: 'danger',
      text: `${m.name}连灭两派的消息传遍${MAP_NAME[m.map]}——\n\n各派掌门连夜聚首，歃血为盟：「今日是他们，明日便是我们！」\n\n${foes.length} 家宗门合军一处向${m.name}宣战，诸派连营齐压你的山门。\n\n（彩蛋「天下共讨」：守住山门、破其联军，或者……就此退隐？）`,
      options: [{ label: '来吧！', tone: 'bad', act: () => null }] });
    (g.mysect as any).log(`天下共讨：${foes.length} 家宗门结成联军同时宣战。`);
    return true;
  }
  /** 宣战（带战前集结、大营与行军押运调度） */
  declare(a: string, b: string, why: string, tgt?: string): SWar {
    const g = this.game, S = this.S; this.initHolds();
    this.fpCache.clear();
    const mapId = (LOC_BY_ID.get(a)?.map ?? LOC_BY_ID.get(b)?.map ?? ACTIVE_MAP) as string;
    const isCrossDao = (this.dao(a) === 'mo') !== (this.dao(b) === 'mo');
    if (isCrossDao && a !== MY && b !== MY && !tgt) {
      const existing = S.wars.find((ew) => {
        if (ew.campaign || ew.fall || LOC_BY_ID.get(ew.a)?.map !== mapId || !this.isZM(ew)) return false;
        const s0 = this.sideSects(ew, 0), s1 = this.sideSects(ew, 1);
        const same = s0.includes(a) && s1.includes(b);
        const rev = s0.includes(b) && s1.includes(a);
        return same || rev;
      });
      if (existing) {
        this.enlistIntoWar(existing, a, b);
        (S.lastDeclareDay ??= {})[mapId] = g.day;
        return existing;
      }
    }
    const w: SWar = {
      id: ++S.seq, a, b, why, start: g.day, ini: 0, tgt: tgt ?? b, score: 0, wave: 0,
      next: g.day + rand(8, 14), streak: 0, la: 0, lb: 0, log: [],
      phase: 'prep', prepUntil: g.day + 4,
    };
    this.fillAllianceSides(w);
    w.tgt = tgt ?? this.nextWarTarget(w, a, b);
    this.initCampsForWar(w);
    this.relocateCampsIfNeeded(w, false);
    this.ensureAttrition(w);
    S.wars.push(w); S.ten[key(a, b)] = 110;
    (S.lastDeclareDay ??= {})[mapId] = g.day;
    // 1) 双方先遣工兵斥候纵队（即刻从山门出发，抵达集结点方正式立营）+ 主力大军纵队（山门校场集结后拔营）
    const totalA = Math.min(180, Math.max(24, Math.round(this.combatTotal(a) * 0.14)));
    const totalB = Math.min(160, Math.max(20, Math.round(this.combatTotal(b) * 0.12)));
    const vanA = Math.min(48, Math.max(16, Math.round(totalA * 0.3)));
    const vanB = Math.min(44, Math.max(16, Math.round(totalB * 0.3)));
    // 为先遣/主力/据点纵队分配护航飞舟（保留至少 1 艘主战旗舰与 1 艘运丹一阶舟，避免全数占满后前线与运丹无舟可调）
    const pickArmyShip = (sid: string): AirshipTier | undefined => {
      const fl = this.fleetAvailable(sid);
      if (fl.t1 + fl.t2 + fl.t3 <= 1) return undefined;
      if (fl.t3 >= 2) return 3;
      if (fl.t2 >= 2) return 2;
      if (fl.t1 >= 2 && (fl.t2 >= 1 || fl.t3 >= 1)) return 1;
      if (fl.t1 >= 3) return 1;
      return undefined;
    };
    this.spawnMarch(w, 0, 'army', { soldiers: vanA, musterSec: 0, days: 1.6, airshipTier: pickArmyShip(a) });
    this.spawnMarch(w, 1, 'army', { soldiers: vanB, musterSec: 0, days: 1.6, airshipTier: pickArmyShip(b) });
    if (totalA - vanA >= 16) this.spawnMarch(w, 0, 'army', { soldiers: totalA - vanA, musterSec: 4.5, airshipTier: pickArmyShip(a) });
    if (totalB - vanB >= 16) this.spawnMarch(w, 1, 'army', { soldiers: totalB - vanB, musterSec: 4.5, airshipTier: pickArmyShip(b) });
    // 2) 各盟宗援军 + 双方所有连片已占据点发兵前往集结点
    for (const sIdx of [0, 1] as const) {
      const sideList = this.sideSects(w, sIdx);
      const peers = sideList.slice(1, 3);
      for (const psid of peers) {
        this.spawnMarch(w, sIdx, 'army', { sid: psid, soldiers: Math.min(120, Math.max(20, Math.round(this.combatTotal(psid) * 0.1))), musterSec: 3.5, airshipTier: pickArmyShip(psid) });
      }
      for (const hsSid of sideList) {
        for (const hid of this.holdsOf(hsSid)) {
          const h = S.hold[hid];
          if (!h || h.isolated || hid === hsSid || hid === w.tgt) continue;
          const hl = LOC_BY_ID.get(hid);
          if (!hl || hl.map !== mapId) continue;
          const sendG = Math.min(24, Math.max(4, Math.round(h.g * 0.45)));
          if (sendG < 4) continue;
          this.spawnMarch(w, sIdx, 'army', {
            sid: hsSid,
            fromLoc: hid,
            fromHoldId: hid,
            soldiers: sendG,
            musterSec: 1.5,
            days: 2.0,
            airshipTier: pickArmyShip(hsSid),
          });
        }
      }
    }
    this.spawnMarch(w, 0, 'convoy', { musterSec: 2.5 });
    this.spawnMarch(w, 1, 'convoy', { musterSec: 2.5 });
    const zm = this.isZM(w);
    g.news(`${this.name(a)}向${this.name(b)}宣战——${why}。${zm ? '正魔两道各派纷纷站队，' : ''}${this.name(a)}（${SCALE_NAME[this.scale(a)]}）于山门集结弟子，兵锋直指${this.tgtName(w)}。`, 'rumor');
    // 正魔开战，同道各派也跟着绷紧
    if (zm) for (const x of this.sects(LOC_BY_ID.get(a)?.map)) for (const y of [a, b]) { const k = key(x, y); if (x !== y && this.base(x, y) >= 30 && S.ten[k] !== undefined && !this.between(x, y)) S.ten[k] = Math.min(99, S.ten[k] + 4); }
    // 召集（人界炼气六层以上战兵及筑基以上骨干均可接令，含盟宗参战）
    const mine = g.ws.sect?.id;
    if (mine && canFightAsWarSoldier(worldOfMap(ACTIVE_MAP), g.hero.realm, g.hero.stage)) {
      const side: 0 | 1 | undefined = this.sideSects(w, 0).includes(mine) ? 0 : this.sideSects(w, 1).includes(mine) ? 1 : undefined;
      if (side !== undefined) {
        w.called = true; const sn = sectTitle(mine);
        g.war.send({ kind: '召集', from: `${sn}执法堂`, sw: w.id, side, text: `${why}。${this.name(a)}已向${this.name(b)}宣战，大军正在集结开拔，战场在${this.tgtName(w)}一带。\n\n${sn}门下弟子，凡炼气六层以上战兵及筑基骨干，速往前线大营听候调遣——斩敌记功，战功可换丹药法宝。临阵不至者，按门规论处。`, until: g.day + 90 });
      }
    }
    if (b === MY) { g.toast(`${this.name(a)}向${this.name(b)}宣战了！（宗门面板 → 宗门战事）`, 'warn'); (g.mysect as any).log(`${this.name(a)}以「${why}」为由，向本宗宣战。`); }
    if (a === MY) { w.lastAct = g.day; w.next = g.day; (g.mysect as any).log(`本宗向${this.name(b)}宣战，山门开始集结。`); }
    return w;
  }
  private tickWar(w: SWar) {
    const g = this.game, S = this.S; let guard = 0;
    if (this.hasBattleForWar(w.id)) return;   // 正在亲身厮杀：等这一阵打完
    if (w.fall) { if (g.day - w.fall > 120) this.verdict(w, 'pei'); return; }   // 败者听候发落；久不发落，按赔款了结
    if (w.phase === 'prep') {
      if (g.day < (w.prepUntil ?? 0)) return;
      if (!w.campaign) {
        const readyA = !!(w.campA?.established && w.campA.soldiers > 0);
        const readyB = !!(w.campB?.established && w.campB.soldiers > 0);
        if (!readyA || !readyB) {
          const hasArmyMarch = (S.marches ?? []).some((m) => m.warId === w.id && !m.done && m.kind === 'army');
          if (hasArmyMarch || g.day < (w.prepUntil ?? 0) + 6) return;
        }
      }
      w.phase = 'battle';
      this.ensureAttrition(w);
      this.note(w, `${this.sideName(w, 0)}与${this.sideName(w, 1)}集结完毕，两军于前线列阵对峙！`);
    }
    this.ensureAttrition(w);
    if (w.campaign) return; // 联军会战的宏观推演与落幕由 WarSys 与实景接战共同主导
    this.ensureValidWarTarget(w);
    const playerSide = this.sideOf(w);
    // 玩家已投效/参战的战事：不走固定日期自动倒计时强推，须由双方势能达阈值（或实力悬殊自然蓄满）或事件驱动总攻！
    if (playerSide !== undefined || w.a === MY || w.b === MY) {
      const attr = w.attrition!;
      const A = this.att(w), D = this.def(w);
      const isExtinctionGate = w.tgt === D && this.zhenHp(D) <= 0;
      if (!isExtinctionGate && A !== MY && g.day - w.start >= 25 && !(this.activeDuel?.warId === w.id) && !this.isPlayerInFrontlineStandoff(w)) {
        const attSide = w.ini, defSide = (1 - w.ini) as 0 | 1;
        const advAtt = this.advantageOf(w, attSide), advDef = this.advantageOf(w, defSide);
        if (advAtt <= 0.72 && advDef - advAtt >= 0.26 && (w.wave >= 1 || w.streak >= 1)) {
          const oldTgt = this.tgtName(w);
          if (w.wave >= 2 || (attSide === 0 ? w.score <= -25 : w.score >= 25)) {
            this.end(w, defSide, `${this.name(A)}统帅见拉锯之后势弱难支，撤兵放弃${oldTgt}`, true);
          } else {
            w.ini = defSide; w.streak = 0; w.zt = 0;
            w.tgt = this.nextWarTarget(w, this.att(w), this.def(w));
            this.resetAttritionAfterClash(w);
            this.relocateCampsIfNeeded(w, true);
            this.note(w, `${this.name(A)}统帅见拉锯之后战局不利，鸣金撤兵放弃强攻${oldTgt}，${this.name(D)}趁势转守为攻！`, true);
          }
          return;
        }
      }
      if (attr.clashReady && !this.hasBattleForWar(w.id)) {
        if (A !== MY && g.day >= w.next && (attr.gaugeA >= 100 || attr.gaugeB >= 100)) {
          this.clash(w);
          this.resetAttritionAfterClash(w);
        }
      }
      if (S.wars.includes(w) && g.day - w.start > 3 * YEAR) this.end(w, w.score >= 0 ? 0 : 1, '久战不决，两家各自罢兵', true);
      return;
    }
    while (S.wars.includes(w) && g.day >= w.next && guard++ < 4) {
      this.clash(w);
      this.resetAttritionAfterClash(w);
    }
    if (S.wars.includes(w) && g.day - w.start > 3 * YEAR) this.end(w, w.score >= 0 ? 0 : 1, '久战不决，两家各自罢兵', true);
  }
  private note(w: SWar, txt: string, loud = false) {
    const g = this.game; w.log.push(`第 ${Math.floor(g.day / YEAR) + 1} 年：${txt}`); if (w.log.length > 8) w.log.splice(0, w.log.length - 8);
    const mine = this.sideOf(w) !== undefined || w.a === g.ws.sect?.id || w.b === g.ws.sect?.id;
    if (mine) g.toast(txt, 'warn');
    if (loud && (mine || LOC_BY_ID.get(w.a)?.map === ACTIVE_MAP)) g.news(txt, 'rumor');
  }

  // ---------------------------------------------------------------- 接战（推演）
  private aiMode(w: SWar, sid: string, foe: string, attacking: boolean, gate: boolean): Mode {
    const g = this.game, last = (sid === w.a ? w.allA : w.allB) ?? -999;
    if (gate) return 'all';                                   // 山门决战：双方都是全宗压上
    if (g.day - last < 40) return 'wave';                     // 刚倾巢打过一场，还在休整
    const sideIdx: 0 | 1 = w.a === sid ? 0 : 1;
    const adv = this.advantageOf(w, sideIdx);
    const cmp = sideIdx === 0 ? w.campA : w.campB;
    const r = (this.strength(sid) / Math.max(1, this.strength(foe))) * adv;
    // 大营缺丹或势能处于明显劣势且非决战：先稳守待援蓄势
    if (cmp && cmp.pills < 6 && !attacking) return 'hold';
    if (!attacking && r < 0.55 && Math.random() < 0.65) return 'hold';
    // 势能大优且兵力压制：果断全军压上抢占战果；伤亡逼近四成时孤注一掷
    if (r >= 1.45 && adv >= 1.15 && Math.random() < 0.45) return 'all';
    if (this.alive(sid) < this.size(sid) * 0.45 && Math.random() < 0.35) return 'all';
    return 'wave';
  }
  /** 点兵（分核心骨干 + 外门炼气战兵池；完全按各宗真实兵池决定，绝不强制双方对等） */
  private commitSplit(sid: string, mode: Mode, attacking: boolean, gar: number, want?: number): { core: Unit[]; outer: number; total: number } {
    const us = this.units(sid);
    const outAvail = this.outerAvailable(sid);
    const n0 = us.length + outAvail;
    if (!n0) return { core: [], outer: 0, total: 0 };
    if (mode === 'all') {
      return { core: us.sort((a, b) => pwOf(b) - pwOf(a)), outer: outAvail, total: us.length + outAvail };
    }
    const pool = shuffle(us.filter((u) => !u.top));
    let n: number;
    if (attacking) {
      const poolCap = Math.max(0, this.sectAvailablePool(sid) + Math.round(n0 * 0.35));
      n = sid === MY
        ? Math.min(this.myFree(), want ?? Math.max(30, Math.round(this.myFree() * 0.4)))
        : Math.min(poolCap || n0, want ?? clamp(Math.round(n0 * (mode === 'hold' ? 0.08 : 0.22)), Math.min(n0, 12), Math.min(n0, 380)));
    } else {
      // 守方按自身真实驻军与宗门可用兵池迎战（分波不超过单波战线承载 340），绝不为了对称强行凑齐攻方人数
      n = mode === 'hold'
        ? Math.min(n0, Math.max(gar, Math.min(n0, 18)))
        : clamp(gar + Math.round(this.sectAvailablePool(sid) * 0.14), Math.min(n0, 12), Math.min(n0, 340));
    }
    if (!attacking && sid === MY) n = Math.min(n, this.myFree() + gar);
    n = Math.max(1, Math.min(pool.length + outAvail, Math.round(n)));
    // 核心层至多按比例出动，其余由外门炼气战兵补足
    const coreRatio = pool.length / Math.max(1, pool.length + outAvail);
    const minCore = n >= 16 ? 4 : n >= 6 ? 2 : 0;
    let coreN = Math.min(pool.length, 24, Math.max(minCore, Math.round(n * Math.min(0.45, Math.max(0.055, coreRatio)))));
    if (outAvail <= 0) coreN = Math.min(pool.length, n);
    const outerN = Math.min(outAvail, Math.max(0, n - coreN));
    if (coreN + outerN < n && pool.length > coreN) coreN = Math.min(pool.length, n - outerN);
    return { core: pool.slice(0, coreN), outer: outerN, total: coreN + outerN };
  }
  /** 兼容旧点兵接口 */
  private commit(sid: string, mode: Mode, attacking: boolean, gar: number, want?: number): Unit[] {
    return this.commitSplit(sid, mode, attacking, gar, want).core;
  }
  /** 名册上某人的称呼（战报用） */
  private uName(sid: string, u: Unit): string {
    if (sid === MY) { const d = this.my?.ds.find((x) => x.id === u.ref); return d ? `${d.name}（${realmName(d.realm, d.stage)}）` : '一名弟子'; }
    const def = SECT_DEF.get(sid); if (!def) return '一名修士';
    const m = member(def, u.ref, this.game.roster.gen(sid, u.ref)); return `${m.rank}${m.name}（${realmName(Math.min(m.realm, REALMS.length - 1), m.stage)}）`;
  }
  /** v0.73：判断名册人物是否为因果关联人物（原著角色/知交/道侣/相熟），常规战保底免随机暴毙 */
  private isProtectedCausal(sid: string, ref: number): boolean {
    if (sid === MY) {
      const d = this.my?.ds.find((x) => x.id === ref);
      return !!d && (d.rank >= 4 || d.loyal >= 92);
    }
    const ro = this.game.roster;
    if (ro.canonAt(sid, ref)) return true;
    const npc = this.game.npcs.byId.get(ro.idOf(sid, ref));
    return !!npc && !!(npc.canon || npc.met || npc.bond || npc.favor > 15);
  }
  /** 折损（核心骨干按名册划除 + 外门炼气战损三分账：普通战 22% 亡 / 48% 伤 / 30% 溃；灭宗死战 48% 亡 / 32% 伤 / 20% 溃） */
  private casualties(sid: string, us: Unit[], frac: number, outerN = 0, allowCausalDeath = false): { n: number; deadOuter: number; injOuter: number; hi: number; top: string } {
    const dead = us.filter((u) => {
      if (!allowCausalDeath && this.isProtectedCausal(sid, u.ref)) return false;
      return Math.random() < frac * (u.realm >= 4 ? 0.16 : u.realm === 3 ? 0.38 : u.realm === 2 ? 0.72 : 1);
    });
    const top = dead.length ? this.uName(sid, dead.reduce((x, y) => (pwOf(y) > pwOf(x) ? y : x))) : '';
    this.kill(sid, dead.map((u) => u.ref));
    let deadOuter = 0, injOuter = 0;
    if (outerN > 0) {
      const loss = Math.min(outerN, Math.round(outerN * frac));
      deadOuter = Math.round(loss * (allowCausalDeath ? 0.48 : 0.22));
      injOuter = Math.round(loss * (allowCausalDeath ? 0.32 : 0.48));
      this.damageOuterPool(sid, deadOuter, injOuter);
    }
    return { n: dead.length + deadOuter + injOuter, deadOuter, injOuter, hi: dead.filter((u) => u.realm >= 2).length, top };
  }
  private damageOuterPool(sid: string, dead: number, inj: number) {
    if (dead <= 0 && inj <= 0) return;
    if (sid === MY) this.game.mysect.damageOuter(dead, inj);
    else this.game.roster.damageOuter(sid, dead, inj);
  }
  private kill(sid: string, refs: number[]) {
    if (!refs.length) return;
    const g = this.game;
    if (sid === MY) {
      const m = this.my; if (!m) return; const ids = new Set(refs), fallen = m.ds.filter((d) => ids.has(d.id));
      m.ds = m.ds.filter((d) => !ids.has(d.id)); this.clearHoldCommanderByIds(ids); this.clampMyGar();
      if (fallen.length && !this.battles.length) (g.mysect as any).log(`宗门战事：${fallen.slice(0, 4).map((d) => d.name).join('、')}${fallen.length > 4 ? `等 ${fallen.length} 人` : ''}战死。`);
      return;
    }
    g.roster.kill(sid, refs);
  }
  private allyMul(sid: string, w: SWar) {
    if (sid === MY) return 1 + 0.08 * Math.min(4, Object.keys(this.S.vassal ?? {}).length);   // 附庸出兵助阵
    if (!this.isZM(w)) return 1;
    const al = allyOf(sid), m = LOC_BY_ID.get(sid)?.map; if (!al) return 1;
    return 1 + 0.06 * Math.min(3, this.sects(m).filter((x) => x !== sid && allyOf(x) === al && !this.warOf(x)).length);
  }
  private zhen(sid: string) { return sid === MY ? (this.my?.halls.zhen ?? 0) * 0.15 : { da: 0.3, zhong: 0.15, xiao: 0 }[this.scale(sid)]; }
  // ---------------------------------------------------------------- v0.62 护宗大阵
  private zst(sid: string) {
    const S = this.S; S.zhen ??= {};
    let z = S.zhen[sid];
    if (!z) { const m = Math.round(Math.max(120, this.strength(sid)) * { da: 0.9, zhong: 0.6, xiao: 0.4 }[this.scale(sid)]); z = S.zhen[sid] = { hp: m, m }; }
    return z;
  }
  zhenCap(sid: string) { return sid === MY ? this.game.mysect.zhenMax() : this.zst(sid).m; }
  zhenHp(sid: string) { return sid === MY ? Math.min(this.my?.zhenE ?? 0, this.zhenCap(MY)) : this.zst(sid).hp; }
  private zhenSet(sid: string, v: number) { if (sid === MY) { if (this.my) this.my.zhenE = Math.max(0, v); } else this.zst(sid).hp = Math.max(0, v); }
  zhenMode(sid: string): ZhenMode { if (sid === MY) return this.my?.zhenMode ?? 'shou'; const d = this.doctrine(sid); return d.name.includes('幻') ? 'huan' : d.atk > d.def ? 'sha' : 'shou'; }
  zhenName(sid: string) { return sid === MY ? ZHEN_MODE[this.zhenMode(MY)][0] : this.doctrine(sid).name.replace(/战?大?阵$/, '') + '护宗大阵'; }

  /** 攻守双方的打法：一方倾巢而出，另一方也只能尽出迎战——这就是灭宗大战 */
  private modes(w: SWar, opt: { ma?: Mode; md?: Mode }, gate: boolean): [Mode, Mode] {
    const S = this.S, A = this.att(w), D = this.def(w);
    let ma: Mode = opt.ma ?? this.aiMode(w, A, D, true, gate);
    let md: Mode = opt.md ?? (D === MY ? (gate ? 'all' : S.myDef ?? 'wave') : this.aiMode(w, D, A, false, gate));
    if (gate) { md = 'all'; if (A !== MY) ma = 'all'; }                              // 打到山门：守方退无可退；别派攻山也必是倾巢
    else if (A === MY) md = ma === 'all' ? 'all' : md === 'all' ? 'wave' : md;       // 你遣一波人去，对面也只出一波；你倾巢，对面必倾巢
    else if (D === MY) { if (md === 'all') ma = 'all'; }                             // 你全宗回援，来敌也只能全宗压上
    else if (ma === 'all' || md === 'all') { ma = 'all'; md = 'all'; }
    return [ma, md];
  }
  /** 打一阵（推演）。返回战报。ma / md：攻守双方的打法；n：攻方想派多少人 */
  clash(w: SWar, opt: { ma?: Mode; md?: Mode; n?: number } = {}): string {
    const g = this.game, S = this.S, A = this.att(w), D = this.def(w);
    this.ensureValidWarTarget(w);
    const gate = w.tgt === D;
    if (gate && this.zhenHp(D) > 0) return this.siege(w, opt);
    const [ma, md] = this.modes(w, opt, gate), big = ma === 'all' && md === 'all';
    const gar = gate ? Math.round(this.combatTotal(D) * 0.25) : S.hold[w.tgt]?.g ?? 0;
    const sa = this.commitSplit(A, ma, true, 0, opt.n), sd = this.commitSplit(D, md, false, gar, sa.total);
    const ua = sa.core, ud = sd.core;
    const da = this.doctrine(A), dd = this.doctrine(D);
    const sum = (us: Unit[], outN: number) => us.reduce((v, u) => v + pwOf(u), 0) + outN * OUTER_UNIT_PW;
    let pa = sum(ua, sa.outer) * da.atk * this.allyMul(A, w) * (this.dao(A) === 'fo' && this.dao(D) === 'mo' ? 1.1 : 1) * (ma === 'all' ? 1.1 : 1) * rand(0.85, 1.15);
    let pd = sum(ud, sd.outer) * dd.def * this.allyMul(D, w) * (gate ? 1.3 : 1.2 * this.holdDefMul(w.tgt)) * (md === 'all' ? 1.1 : 1) * rand(0.85, 1.15);
    // 宗主压阵
    if (A === MY && ma === 'all') pa += PW[g.hero.realm] * 2;
    if (D === MY && (md === 'all' || gate)) pd += PW[g.hero.realm] * 2;
    // 高阶压制系数：差两个大境界以上时形成碾压
    const topR = (us: Unit[], sid: string) => Math.max(sid === MY ? g.hero.realm : 1, us.reduce((m, u) => Math.max(m, u.realm), 1));
    const rGap = topR(ua, A) - topR(ud, D);
    if (rGap >= 2) { pa *= 1.35; pd *= 0.78; } else if (rGap <= -2) { pd *= 1.35; pa *= 0.78; }
    pa = Math.max(pa, 0.01); pd = Math.max(pd, 0.01);
    const win = pa > pd, r = Math.max(pa / pd, pd / pa), bk = big ? 1.5 : 1;
    // 败方折损两成起、悬殊则更惨；灭宗大战再加五成（败方至多折八成半）
    const lf = Math.min(big ? 0.85 : 0.55, (0.2 + 0.11 * Math.log2(r)) * bk), wf = Math.min(0.4, Math.max(0.03, 0.15 / r) * bk);
    const best = (sid: string, us: Unit[]) => (us.length ? this.uName(sid, us.reduce((x, y) => (pwOf(y) > pwOf(x) ? y : x))) : '');
    const ha = best(A, ua), hd = best(D, ud);
    const ca = this.casualties(A, ua, win ? wf : lf, sa.outer, big), cd = this.casualties(D, ud, win ? lf : wf, sd.outer, big);
    if (w.ini === 0) { w.la += ca.n; w.lb += cd.n; } else { w.lb += ca.n; w.la += cd.n; }
    if (ma === 'all') { if (A === w.a) w.allA = g.day; else w.allB = g.day; }
    if (md === 'all') { if (D === w.a) w.allA = g.day; else w.allB = g.day; }
    w.next = g.day + (big ? rand(20, 30) : rand(5, 10));
    const an = this.name(A), dn = this.name(D), tn = this.tgtName(w), head = big ? '灭宗大战' : `第 ${w.wave + 1} 阵`, res = win ? `${an}胜` : `${dn}守住了`;
    const lines = [
      `【${head} · ${tn}】`,
      `${an} ${sa.total} 人${ATK_NAME[ma]}${A === MY && ma === 'all' ? '，宗主亲自压阵' : ''}；${dn} ${sd.total} 人${DEF_NAME[md]}${D === MY && (md === 'all' || gate) ? '，宗主坐镇' : ''}。`,
      `${an}结「${da.name}」，${dn}布「${dd.name}」，两军${pick(['甫一照面便杀作一团', '法宝灵光遮天蔽日', '飞剑如蝗、符箓如雨', '自辰时杀到日暮'])}。`,
      win && cd.top ? `· ${an}${ha}阵斩${dn}${cd.top}` : !win && ca.top ? `· ${dn}${hd}阵斩${an}${ca.top}` : '',
      win && ca.top ? `· ${an}${ca.top}力战而亡` : !win && cd.top ? `· ${dn}${cd.top}力战而亡` : '',
      `战果：${res}。${an}折 ${ca.n} 人${ca.hi ? `（筑基以上 ${ca.hi}）` : ''}，${dn}折 ${cd.n} 人${cd.hi ? `（筑基以上 ${cd.hi}）` : ''}。`,
    ].filter(Boolean);
    this.note(w, `${head} · ${tn}：${an} ${sa.total} 人${ATK_NAME[ma]}，${dn} ${sd.total} 人${DEF_NAME[md]}——${res}。${an}折 ${ca.n} 人，${dn}折 ${cd.n} 人。`);
    this.after(w, win, big);
    return lines.join('\n');
  }
  /** 攻打护宗大阵（推演）：大阵未破，守方躲在阵后毫发无伤；攻方每冲一次都要丢下一批人。hero = 宗主亲自轰击 */
  siege(w: SWar, opt: { ma?: Mode; n?: number; hero?: boolean } = {}): string {
    const g = this.game, A = this.att(w), D = this.def(w), zm = this.zhenMode(D), hp0 = this.zhenHp(D), mx = Math.max(1, this.zhenCap(D)), zn = this.zhenName(D);
    let dmg = 0, ka = 0, n = 0;
    if (opt.hero) dmg = pwOf(g.hero) * 4 * rand(0.85, 1.2);
    else {
      const ma: Mode = opt.ma ?? (A === MY ? 'wave' : 'all'), sa = this.commitSplit(A, ma, true, 0, opt.n), ua = sa.core; n = sa.total;
      dmg = (ua.reduce((v, u) => v + pwOf(u), 0) + sa.outer * OUTER_UNIT_PW) * this.doctrine(A).atk * this.allyMul(A, w) * 0.5 * rand(0.85, 1.15);
      if (A === MY && ma === 'all') dmg += PW[g.hero.realm] * 2;
      ka = this.casualties(A, ua, zm === 'sha' ? 0.13 : 0.06, sa.outer).n;
      if (ma === 'all') { if (A === w.a) w.allA = g.day; else w.allB = g.day; }
    }
    if (zm === 'shou') dmg *= 0.7;
    const hp = Math.max(0, hp0 - dmg); this.zhenSet(D, hp);
    if (w.ini === 0) w.la += ka; else w.lb += ka;
    w.zt = (w.zt ?? 0) + 1; w.wave++;
    if (!opt.hero) w.next = g.day + (zm === 'huan' ? rand(14, 22) : rand(7, 11));
    const an = this.name(A), dn = this.name(D), who = opt.hero ? `${an}宗主亲自出手，` : `${an} ${n} 人`;
    const txt = hp <= 0
      ? `【破阵 · ${dn}山门】\n${who}猛攻护宗大阵「${zn}」——光幕寸寸碎裂，大阵告破！${ka ? `阵前折 ${ka} 人。` : ''}\n${dn}山门之内再无屏障，接下来便是双方尽出的灭宗大战。`
      : `【破阵 · ${dn}山门】\n${who}猛攻护宗大阵「${zn}」，光幕剧震，阵力尚余 ${Math.max(1, Math.round((hp / mx) * 100))}%。${ka ? `${dn}弟子躲在阵后以逸待劳，${an}阵前折 ${ka} 人。` : ''}`;
    this.note(w, txt.replace(/\n/g, ' '), hp <= 0);
    if (hp > 0 && A !== MY && w.zt >= 5) this.end(w, (1 - w.ini) as 0 | 1, `${an}久攻${dn}护宗大阵不下，锐气尽失，罢兵而去`, true);
    else this.settle(w);
    return txt;
  }
  /** 同盟剩余未失据点总数 */
  private coalitionHoldsCount(w: SWar, defSide: 0 | 1): number {
    let n = 0;
    for (const sid of this.sideSects(w, defSide)) n += this.holdsOf(sid).length;
    return n;
  }
  /** 战事下一目标：同盟战先清完敌盟全部据点再打主帅山门；单宗战走 nextTarget */
  private nextWarTarget(w: SWar, A: string, D: string): string {
    return this.isCoalitionWar(w) ? this.nextCoalitionTarget(w, A, D) : this.nextTarget(A, D);
  }
  /** 校正当前战场目标：防盟友据点被误重置成敌主帅山门 */
  private ensureValidWarTarget(w: SWar) {
    const S = this.S, A = this.att(w), D = this.def(w);
    if (this.isCoalitionWar(w)) {
      const defSide = (1 - w.ini) as 0 | 1;
      const defSet = new Set(this.sideSects(w, defSide));
      const owner = S.hold[w.tgt]?.o;
      if (w.tgt !== D && (!owner || !defSet.has(owner))) {
        w.tgt = this.nextCoalitionTarget(w, A, D);
      }
      return;
    }
    if (w.tgt !== D && S.hold[w.tgt]?.o !== D) w.tgt = this.nextTarget(A, D);
  }
  /** 同盟大战轮转下一处敌方同盟据点：全部据点清完后才指向核心山门展开灭宗决战 */
  private nextCoalitionTarget(w: SWar, A: string, D: string): string {
    const defSects = this.sideSects(w, (1 - w.ini) as 0 | 1);
    const G = LOC_BY_ID.get(A);
    const holds: string[] = [];
    for (const sid of defSects) holds.push(...this.holdsOf(sid));
    if (holds.length) {
      holds.sort((x, y) => {
        const lx = LOC_BY_ID.get(x)!, ly = LOC_BY_ID.get(y)!;
        return (G ? Math.hypot(lx.x - G.x, lx.y - G.y) : 0) - (G ? Math.hypot(ly.x - G.x, ly.y - G.y) : 0);
      });
      return holds[0];
    }
    return D;
  }
  /** 一阵打完：夺据点 / 破山门 / 攻守易势 / 力竭求和。big = 这一阵是灭宗大战 */
  private after(w: SWar, win: boolean, big = false) {
    const S = this.S; if (!S.wars.includes(w)) return;
    const A = this.att(w), D = this.def(w), gate = w.tgt === D, sgn = w.ini === 0 ? 1 : -1, L = LOC_BY_ID.get(w.tgt);
    const prevTgt = w.tgt;
    const prevFp = this.frontPos(w);
    const coalition = this.isCoalitionWar(w);
    const defSide = (1 - w.ini) as 0 | 1;
    w.wave++;
    if (big) w.big = (w.big ?? 0) + 1;
    if (win) {
      w.score = clamp(w.score + sgn * (gate ? 34 : big ? 30 : 16), -100, 100); w.streak = 0;
      if (gate) {
        const remHolds = coalition ? this.coalitionHoldsCount(w, defSide) : 0;
        const canCloseGate = !coalition || (big && Math.abs(w.score) >= 60 && w.wave >= 4) || (remHolds === 0 && (Math.abs(w.score) >= 60 || w.wave >= 4 || this.spent(D)));
        if (coalition && !canCloseGate) {
          w.tgt = this.nextCoalitionTarget(w, A, D);
          w.zt = 0;
          this.note(w, `【同盟会战·战局未决】${this.name(A)}虽挫「${this.name(D)}」前沿阵势，但对方同盟诸派（${this.sideSects(w, defSide).length}宗）尚存据点驰援，全线仍呈拉锯（战势 ${Math.round(Math.abs(w.score))}%），战火转赴${this.tgtName(w)}！`, true);
          if (w.tgt !== prevTgt && prevFp) {
            w.frontTrail ??= [];
            w.frontTrail.push({ x: prevFp.x, y: prevFp.y, name: L?.name ?? prevTgt });
            if (w.frontTrail.length > 6) w.frontTrail.splice(0, w.frontTrail.length - 6);
            this.relocateCampsIfNeeded(w, true);
          }
          this.settle(w);
          return;
        }
        this.gateFall(w);
        return;
      }
      if (big) {
        const holdOwner = S.hold[w.tgt]?.o ?? D;
        if (coalition) {
          const hs = this.holdsOf(holdOwner);
          for (const id of hs) S.hold[id] = { o: A, g: A === MY ? Math.min(12, this.myFree()) : GAR[this.scale(A)] };
          this.note(w, `决战大胜，${this.name(holdOwner)}外围防线崩溃：${hs.map((id) => LOC_BY_ID.get(id)!.name).join('、') || L?.name || '据点'}尽数易手！`, true);
          w.tgt = this.nextCoalitionTarget(w, A, D); if (w.tgt === D) w.zt = 0;
        } else {
          // 灭宗大战野战得胜：守方全线崩溃，所有据点一并易手，兵临山门
          const hs = this.holdsOf(D);
          for (const id of hs) S.hold[id] = { o: A, g: A === MY ? Math.min(12, this.myFree()) : GAR[this.scale(A)] };
          this.note(w, `灭宗大战，${this.name(D)}全线崩溃：${hs.map((id) => LOC_BY_ID.get(id)!.name).join('、') || '外围'}尽数易手，${this.name(A)}兵临${this.name(D)}山门！`, true);
          w.tgt = D; w.zt = 0;
        }
      } else {
        S.hold[w.tgt] = { o: A, g: A === MY ? Math.min(20, this.myFree()) : GAR[this.scale(A)] };
        this.note(w, `${this.name(A)}夺下${L?.name ?? '据点'}，留弟子镇守。`, true);
        w.tgt = coalition ? this.nextCoalitionTarget(w, A, D) : this.nextTarget(A, D); if (w.tgt === D) w.zt = 0;
      }
    } else {
      w.score = clamp(w.score - sgn * (big ? 30 : 12), -100, 100); w.streak++;
      if (big || w.streak >= 2) { w.ini = (1 - w.ini) as 0 | 1; w.streak = 0; w.zt = 0; w.tgt = coalition ? this.nextCoalitionTarget(w, D, A) : this.nextTarget(D, A); this.note(w, `${this.name(A)}${big ? '倾巢而出却大败而归' : '连攻不克'}，${this.name(D)}趁势反攻，兵锋指向${this.tgtName(w)}。`, true); }
    }
    if (w.tgt !== prevTgt && prevFp) {
      w.frontTrail ??= [];
      w.frontTrail.push({ x: prevFp.x, y: prevFp.y, name: L?.name ?? prevTgt });
      if (w.frontTrail.length > 6) w.frontTrail.splice(0, w.frontTrail.length - 6);
      this.relocateCampsIfNeeded(w, true);
    }
    this.settle(w);
  }
  /** 力竭：哪一方元气大伤便乞和——单宗败给你的听凭发落；同盟大战整盟一次性停战保留各宗 */
  private settle(w: SWar) {
    const S = this.S;
    const coalition = this.isCoalitionWar(w);
    for (const k of [0, 1] as const) {
      if (!S.wars.includes(w) || w.fall) continue;
      if (coalition) {
        const members = this.sideSects(w, k).filter((x) => !S.gone?.[x]);
        if (!members.length || !members.every((x) => this.spent(x))) continue;
        this.end(w, (1 - k) as 0 | 1, `${this.sideName(w, k)}诸派元气大伤，联军议和退兵`);
        continue;
      }
      const sid = k === 0 ? w.a : w.b; if (!this.spent(sid)) continue;
      const W = k === 0 ? w.b : w.a;
      if (W === MY) this.pend(w, `${this.name(sid)}元气大伤，遣使乞和`); else this.end(w, (1 - k) as 0 | 1, `${this.name(sid)}元气大伤，遣使求和`);
    }
  }
  /** 山门告破：单宗大战玩家胜出可四选一发落；同盟大战整盟一次性了结且战败各宗悉数保留 */
  private gateFall(w: SWar) {
    const A = this.att(w), D = this.def(w);
    if (this.isCoalitionWar(w)) {
      if (D === MY) this.myGateFall(A);
      this.end(w, w.ini, `${this.sideName(w, w.ini)}连克敌盟防线，终破${this.name(D)}山门`);
      return;
    }
    if (A === MY) { this.pend(w, `${this.name(D)}山门告破`); return; }
    if (D === MY) this.myGateFall(A);
    this.end(w, w.ini, `${this.name(A)}攻破${this.name(D)}山门`);
  }
  /** 自家山门被破：宗主尚在，道统不绝——但阵基被毁、门人星散、据点尽失 */
  private myGateFall(A: string) {
    const g = this.game, S = this.S, m = this.my; if (!m) return;
    const n0 = m.ds.length;
    m.ds = m.ds.filter((d) => d.rank >= 2 || Math.random() > 0.35);
    if (m.halls.zhen > 0) m.halls.zhen--;
    m.zhenE = 0; m.fame *= 0.75;
    for (const id of this.holdsOf(MY)) S.hold[id] = { o: A, g: SECT_DEF.has(A) ? GAR[this.scale(A)] : 8 };
    (g.mysect as any).log(`山门被${this.name(A)}攻破：护宗大阵阵基被毁，门人星散 ${n0 - m.ds.length} 人，据点尽失。`);
    g.toast(`${m.name}山门告破！护宗大阵被毁，门人星散 ${n0 - m.ds.length} 人——宗主尚在，道统不绝。`, 'warn');
  }
  /** 计算战后撤离目标坐标：战事仍在打且有大营则回大营，否则直接飞返本宗山门或最近友好据点 */
  private returnDestFor(sid: string, w: SWar | undefined, side: 0 | 1, fallbackX: number, fallbackY: number): { x: number; y: number } {
    if (w && this.S.wars.includes(w) && !w.fall) {
      const cp = this.campPos(w, side);
      if (cp && cp.map === ACTIVE_MAP) return { x: cp.x, y: cp.y };
    }
    if (sid === MY && this.my && this.my.map === ACTIVE_MAP) {
      return { x: this.my.x * WORLD_SCALE, y: this.my.y * WORLD_SCALE };
    }
    const gate = LOC_BY_ID.get(sid);
    if (gate && gate.map === ACTIVE_MAP) {
      return { x: gate.x * WORLD_SCALE, y: gate.y * WORLD_SCALE };
    }
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const hid of this.holdsOf(sid)) {
      const hl = LOC_BY_ID.get(hid);
      if (!hl || hl.map !== ACTIVE_MAP) continue;
      const hx = hl.x * WORLD_SCALE, hy = hl.y * WORLD_SCALE;
      const d = Math.hypot(hx - fallbackX, hy - fallbackY);
      if (d < bd) { bd = d; best = { x: hx, y: hy }; }
    }
    return best ?? { x: fallbackX, y: fallbackY };
  }
  /** 停战/灭宗/听候发落时，把仍在场撤离中的残阵、散兵与在途队列改道飞返各自山门（绝不向已拆除的空营或原地消失） */
  private redirectPostReturn(w: SWar) {
    for (const f of this.postFormations) {
      if (f.warId !== w.id || f.collapsed) continue;
      const side: 0 | 1 = w.a === f.sid || this.sideSects(w, 0).includes(f.sid) ? 0 : 1;
      const dest = this.returnDestFor(f.sid, undefined, side, f.retreatX ?? f.x, f.retreatY ?? f.y);
      f.retreatX = dest.x;
      f.retreatY = dest.y;
      const d = Math.hypot(dest.x - f.x, dest.y - f.y);
      const spd = f.retreatMode === 'rout' ? 280 : 240;
      f.retreatFadeMax = clamp(d / spd + 2.5, 14, 75);
      f.retreatFadeT = f.retreatFadeMax;
    }
    for (const a of this.postActors) {
      if (a.warId !== w.id) continue;
      const sid = a.sid ?? (a.ours ? w.a : w.b);
      const side: 0 | 1 = w.a === sid || this.sideSects(w, 0).includes(sid) ? 0 : 1;
      const dest = this.returnDestFor(sid, undefined, side, a.tx, a.ty);
      a.tx = dest.x + rand(-140, 140);
      a.ty = dest.y + rand(-100, 100);
      const d = Math.hypot(a.tx - a.x, a.ty - a.y);
      const spd = a.flying ? 420 : 230;
      a.maxDur = clamp(d / spd + 2.5, 14, 75);
      a.dur = a.maxDur;
    }
    for (const s of this.postAirships) {
      if (s.warId !== w.id || s.sunk) continue;
      const side: 0 | 1 = w.a === s.sid || this.sideSects(w, 0).includes(s.sid) ? 0 : 1;
      const dest = this.returnDestFor(s.sid, undefined, side, s.retreatTx ?? s.x, s.retreatTy ?? s.y);
      s.retreatTx = dest.x;
      s.retreatTy = dest.y;
      const d = Math.hypot(dest.x - s.x, dest.y - s.y);
      s.retreatFadeMax = clamp(d / 280 + 3.0, 14, 75);
      s.retreatFadeT = s.retreatFadeMax;
    }
  }
  /** 败者听候发落 */
  private pend(w: SWar, how: string) {
    const g = this.game; w.fall = g.day; w.next = g.day + 1e6;
    this.redirectPostReturn(w);
    this.note(w, `${how}——是和是灭，听凭${this.name(MY)}宗主发落。（宗门面板 → 宗门战事）`, true);
    try { if (!g.modal) g.openDialog(this.verdictNode(w)); } catch { /* */ }
  }
  /** 发落败者：赔款罢兵 / 纳为附庸 / 收编残部 / 灭其道统 */
  private verdict(w: SWar, kind: 'pei' | 'fu' | 'bian' | 'mie'): string {
    const g = this.game, S = this.S, m = this.my; if (!m || !S.wars.includes(w)) return '此战已了。';
    const mySide: 0 | 1 = w.a === MY ? 0 : 1, foe = mySide === 0 ? w.b : w.a, fn = this.name(foe), sc = this.scale(foe), cut = m.cut ?? 0.3;
    w.fall = undefined;
    if (kind === 'pei') { this.end(w, mySide, `${fn}纳款求和`); return `${fn}纳款求和，割地赔款。两家五年之内不再动兵。`; }
    if (kind === 'fu') {
      this.end(w, mySide, `${fn}俯首称臣，奉${m.name}为上宗`);
      (S.vassal ??= {})[foe] = g.day; (g.mysect as any).log(`${fn}俯首称臣，成为本宗附庸。`);
      return `${fn}自此奉${m.name}为上宗：每月上供灵石 ${VASSAL[sc]}（径入宗主供奉）；本宗再有战事，${fn}出兵助阵（每家附庸 +8% 战力）。两家永不相攻。`;
    }
    // 收编 / 灭宗：这一派就此除名
    const us = this.units(foe), hs = this.holdsOf(foe), foeOuter = this.outerAvailable(foe);
    let joined = 0;
    if (kind === 'bian') {
      const def = SECT_DEF.get(foe), room = Math.max(0, g.mysect.cap() - m.ds.length);
      if (def) for (const u of shuffle(us.slice()).slice(0, Math.min(room, Math.round(us.length * 0.5)))) {
        const mm = member(def, u.ref, g.roster.gen(foe, u.ref)), realm = clamp(mm.realm, 0, 4);
        m.ds.push({ id: m.seq++, name: mm.name, sex: mm.sex, age: [16, 24, 60, 180, 420][realm] * rand(0.8, 1.4), root: 2 + Math.floor(Math.random() * 3), realm, stage: Math.min(mm.stage, REALMS[realm].stages.length - 1), exp: Math.random() * 0.5, loyal: rand(30, 50), rank: realm >= 3 ? 3 : realm >= 2 ? 1 : 0, job: 'xiu', joined: g.day, arts: 0 });
        joined++;
      }
      const mergeN = Math.round(foeOuter * 0.45);
      if (mergeN > 0) { g.mysect.mergeOuter(mergeN); joined += mergeN; }
    }
    this.kill(foe, us.map((u) => u.ref));   // 名册清空：战死的、改换门庭的、星散的，都不再是这一派的人
    if (foeOuter > 0) this.damageOuterPool(foe, foeOuter, 0);
    const garCount = this.myFree() > 0 ? Math.min(10, Math.max(1, this.myFree())) : 0;
    for (const id of hs) S.hold[id] = { o: MY, g: garCount };
    (S.gone ??= {})[foe] = g.day; S.branch ??= []; if (!S.branch.includes(foe)) S.branch.push(foe);
    this.refreshContiguousHolds();
    S.mieN = (S.mieN ?? 0) + 1;
    if (S.vassal) delete S.vassal[foe];
    if (S.zhen) delete S.zhen[foe];
    const loot = Math.round(MIE_LOOT[sc] * (kind === 'mie' ? 1 : 0.4)), tb = Math.round(loot * cut);
    m.stones += loot - tb; m.tribute += tb; m.earned = (m.earned ?? 0) + tb; m.wins++;
    m.fame += { da: 300, zhong: 150, xiao: 70 }[sc] * (kind === 'mie' ? 1 : 0.7);
    // 缴获敌宗幸存飞舟（收编/灭宗后敌宗未沉战船归入本宗舟师）
    const foeFl = this.fleetOf(foe);
    const myFl = this.fleetOf(MY);
    const capT1 = foeFl.t1 > 0 ? Math.ceil(foeFl.t1 * 0.5) : 0;
    const capT2 = foeFl.t2 > 0 ? Math.ceil(foeFl.t2 * 0.5) : 0;
    const capT3 = foeFl.t3 > 0 ? Math.floor(foeFl.t3 * 0.5 + (kind === 'bian' ? 0.5 : 0)) : 0;
    myFl.t1 += capT1; myFl.t2 += capT2; myFl.t3 += capT3;
    foeFl.t1 = 0; foeFl.t2 = 0; foeFl.t3 = 0;
    if (foeFl.damaged) { foeFl.damaged.t1 = 0; foeFl.damaged.t2 = 0; foeFl.damaged.t3 = 0; }
    if (foeFl.building) foeFl.building = [];
    const capShipText = [capT1 ? `一阶灵舟 ${capT1}` : '', capT2 ? `二阶战舰 ${capT2}` : '', capT3 ? `三阶巨舟 ${capT3}` : ''].filter(Boolean).join('、');
    const got: string[] = [];
    if (kind === 'mie') {
      for (const id of shuffle((SECT_LIB[foe] ?? []).filter((x) => ITEMS[x])).slice(0, 4)) { (g.mysect as any).gift(id, 1); got.push(ITEMS[id].name); }
      const d = this.dao(foe), al = allyOf(foe);
      if (d === 'mo') g.ws.rep += 12; else g.ws.rep -= m.dao === 'zheng' ? 25 : m.dao === 'zhong' ? 12 : 6;
      // 天下震动：同盟、同道各派对本宗的敌意上涨
      for (const x of this.sects(LOC_BY_ID.get(MY)?.map)) { if (x === MY || this.base(MY, x) < 0) continue; const add = d === 'mo' ? (this.dao(x) === 'mo' ? 20 : 0) : al && allyOf(x) === al ? 30 : 10; if (add) S.ten[key(MY, x)] = Math.min(99, this.tension(MY, x) + add); }
    }
    // 收场（彻底清理在途队列、大营、军令、斗将、局部冲突与暂存出征参数）
    this.redirectPostReturn(w);
    this.pendingOpt.delete(w.id);
    this.standoffOpt.delete(w.id);
    if (this.activeDuel && this.activeDuel.warId === w.id) {
      this.cleanupDuelEntities(this.activeDuel);
      this.activeDuel = null;
    }
    if (S.marches) S.marches = S.marches.filter((mc) => mc.warId !== w.id);
    if (S.warOrders) for (const ord of S.warOrders) if (ord.warId === w.id) ord.done = true;
    w.campA = undefined; w.campB = undefined;
    const i = S.wars.indexOf(w); if (i >= 0) S.wars.splice(i, 1);
    for (const j of g.war.inbox) if (j.sw === w.id) j.done = true;
    this.disperseSkirmishesForWar(w.id);
    if (this.hasBattleForWar(w.id)) this.removeBattleForWar(w.id);
    for (const o of S.wars.filter((x) => x.a === foe || x.b === foe)) this.end(o, o.a === foe ? 1 : 0, `${fn}已为${m.name}所灭`, true);
    const holds = hs.map((id) => LOC_BY_ID.get(id)!.name).join('、');
    if (kind === 'mie') {
      g.news(`${m.name}攻破${fn}山门，鸡犬不留——${fn}道统断绝，自此除名！天下各派为之震动。`, 'rumor');
      (g.mysect as any).log(`灭${fn}满门：搜刮库藏灵石 ${loot}${got.length ? `，得${got.join('、')}` : ''}${capShipText ? `，缴获飞舟（${capShipText}）` : ''}；其山门改作本宗分舵。`);
      g.toast(`${fn}自此除名！得灵石 ${loot}（其中 ${tb} 归宗主）${capShipText ? ` · 缴获${capShipText}` : ''}`, 'good');
      this.game.updateUI(true);
      return `${fn}满门尽灭，道统断绝。\n\n· 搜刮库藏：灵石 ${loot}（按抽成 ${tb} 径入宗主供奉）${got.length ? `\n· 藏经阁秘卷：${got.join('、')}（在库房收取）` : ''}${capShipText ? `\n· 缴获舟师：${capShipText}` : ''}${holds ? `\n· 据点尽归本宗：${holds}` : ''}\n· ${fn}山门改作本宗分舵，月入 ${BRANCH[sc]} 灵石\n· 宗门威望大涨；${this.dao(foe) === 'mo' ? '诛灭魔宗，正道称快。' : '屠戮同道，天下侧目——各派对本宗的敌意上涨。'}`;
    }
    g.news(`${fn}山门告破，残部尽数改投${m.name}——${fn}就此除名。`, 'rumor');
    (g.mysect as any).log(`收编${fn}残部 ${joined} 人，得灵石 ${loot}${capShipText ? `，接管飞舟（${capShipText}）` : ''}；其山门改作本宗分舵。`);
    g.toast(`收编${fn}残部 ${joined} 人，${fn}就此除名。${capShipText ? `（接管${capShipText}）` : ''}`, 'good');
    this.game.updateUI(true);
    return `${fn}就此除名，残部 ${joined} 人改换门庭，拜入${m.name}（降卒忠诚不高，多讲法、多指点）。\n\n· 接收库藏：灵石 ${loot}（按抽成 ${tb} 径入宗主供奉）${capShipText ? `\n· 接管舟师：${capShipText}` : ''}${holds ? `\n· 据点尽归本宗：${holds}` : ''}\n· ${fn}山门改作本宗分舵，月入 ${BRANCH[sc]} 灵石`;
  }
  /** 战事落幕（同盟大战统算双方各宗停战与休整）。soft = 罢兵 / 求和（不割地） */
  end(w: SWar, winner: 0 | 1, how: string, soft = false) {
    const g = this.game, S = this.S, i = S.wars.indexOf(w); if (i < 0) return; S.wars.splice(i, 1);
    const W = winner === 0 ? w.a : w.b, L = winner === 0 ? w.b : w.a, k = key(w.a, w.b), GW = LOC_BY_ID.get(W);
    const coalition = this.isCoalitionWar(w);
    const side0 = this.sideSects(w, 0), side1 = this.sideSects(w, 1);
    S.ten[k] = 15; S.truce[k] = g.day + 5 * YEAR;
    if (coalition) {
      for (const sa of side0) for (const sb of side1) {
        const ck = key(sa, sb);
        S.ten[ck] = 15;
        S.truce[ck] = Math.max(S.truce[ck] ?? 0, g.day + 5 * YEAR);
      }
    }
    S.recoverUntil ??= {};
    for (const sid of side0.concat(side1)) {
      S.recoverUntil[sid] = Math.max(S.recoverUntil[sid] ?? 0, g.day + 180);
    }
    w.fall = undefined; if (S.zhen) { delete S.zhen[w.a]; delete S.zhen[w.b]; }   // 战后各派重整护宗大阵
    this.redirectPostReturn(w);
    // 将停战时视口附近尚在列的对峙方阵、对峙战船与营中守兵转为实景归宗飞返编队，绝不瞬间消失
    const lvEnd = getLastBattleView();
    const isNearVisible = (vx: number, vy: number) => lvEnd
      ? (vx >= lvEnd.left - 800 && vx <= lvEnd.right + 800 && vy >= lvEnd.top - 800 && vy <= lvEnd.bottom + 800)
      : Math.hypot(vx - g.player.x, vy - g.player.y) < 4200;
    for (const [zKey, zEntry] of this._standoffZoneCache.entries()) {
      const zIds = zKey.split(',').map((s) => Number(s));
      if (!zIds.includes(w.id)) continue;
      for (const sf of zEntry.forms) {
        if (!isNearVisible(sf.x, sf.y) && !this.hasBattleForWar(w.id)) continue;
        const side: 0 | 1 = side0.includes(sf.sid) ? 0 : 1;
        const dest = this.returnDestFor(sf.sid, undefined, side, sf.x, sf.y);
        const dist = Math.hypot(dest.x - sf.x, dest.y - sf.y);
        const dur = clamp(dist / 240 + 2.5, 14, 75);
        sf.warId = w.id;
        sf.retreatMode = 'return';
        sf.retreatX = dest.x;
        sf.retreatY = dest.y;
        sf.retreatFadeMax = dur;
        sf.retreatFadeT = dur;
        this.postFormations.push(sf);
      }
      for (const ss of zEntry.airships ?? []) {
        if (!isNearVisible(ss.x, ss.y)) continue;
        const side: 0 | 1 = side0.includes(ss.sid) ? 0 : 1;
        const dest = this.returnDestFor(ss.sid, undefined, side, ss.x, ss.y);
        const dist = Math.hypot(dest.x - ss.x, dest.y - ss.y);
        const dur = clamp(dist / 280 + 3.0, 14, 75);
        ss.warId = w.id;
        ss.retreatTx = dest.x;
        ss.retreatTy = dest.y;
        ss.retreatMode = 'return';
        ss.retreatFadeMax = dur;
        ss.retreatFadeT = dur;
        this.postAirships.push(ss);
      }
      this._standoffZoneCache.delete(zKey);
      this._standoffDispatched.delete(zKey);
    }
    for (const sIdx of [0, 1] as const) {
      const cmp = sIdx === 0 ? w.campA : w.campB;
      if (!cmp || cmp.map !== ACTIVE_MAP || !cmp.established || cmp.soldiers <= 0) continue;
      if (!isNearVisible(cmp.x, cmp.y)) continue;
      const leadSid = sIdx === 0 ? w.a : w.b;
      const ret = this.returnDestFor(leadSid, undefined, sIdx, cmp.x, cmp.y);
      const cnt = Math.min(10, Math.max(3, Math.round(cmp.soldiers / 18)));
      const sectDef = SECT_DEF.get(leadSid);
      const robe = leadSid === MY ? this.my?.uniform?.robe : sectDef?.robe;
      for (let k = 0; k < cnt; k++) {
        const sx = cmp.x + rand(-110, 110), sy = cmp.y + rand(-70, 70);
        const tx = ret.x + rand(-140, 140), ty = ret.y + rand(-100, 100);
        const dur = clamp(Math.hypot(tx - sx, ty - sy) / 420 + 2.5, 14, 75);
        const st = new CharState(sx, sy);
        st.faceToward(tx - sx, ty - sy, false);
        const look = randomLook(mulberry32((w.id * 719 + sIdx * 97 + k * 53) >>> 0), 'cultivator');
        if (robe) (look as any).robe = robe;
        this.postActors.push({
          x: sx, y: sy, tx, ty, look, st, t: Math.random() * 2,
          dur, maxDur: dur, ours: sIdx === w.side, name: this.name(leadSid), flying: true,
          warId: w.id, sid: leadSid,
        });
      }
      const shipTier = this.pickEscortAirshipTier(leadSid, [3, 2, 1]);
      if (shipTier) {
        const dur = clamp(Math.hypot(ret.x - cmp.x, ret.y - cmp.y) / 280 + 3.0, 14, 75);
        const ship = createWarAirship({
          id: -(w.id * 20 + sIdx + 1),
          warId: w.id,
          sid: leadSid,
          sectName: this.name(leadSid),
          ours: sIdx === w.side,
          tier: shipTier,
          style: this.dao(leadSid) === 'mo' ? 'mo' : 'zheng',
          x: cmp.x,
          y: cmp.y,
          tx: ret.x,
          ty: ret.y,
          crew: shipTier === 3 ? 28 : shipTier === 2 ? 16 : 9,
          customUniform: leadSid === MY ? this.my?.uniform : undefined,
        });
        ship.retreatTx = ret.x;
        ship.retreatTy = ret.y;
        ship.retreatMode = 'return';
        ship.retreatFadeMax = dur;
        ship.retreatFadeT = dur;
        this.postAirships.push(ship);
      }
    }
    if (S.marches) {
      const lv = getLastBattleView();
      for (const mc of S.marches) {
        if (mc.warId !== w.id || mc.done) continue;
        const pos = this.marchPos(mc);
        if (pos.map !== ACTIVE_MAP) continue;
        const inView = lv
          ? (pos.x >= lv.left - 600 && pos.x <= lv.right + 600 && pos.y >= lv.top - 600 && pos.y <= lv.bottom + 600)
          : Math.hypot(pos.x - g.player.x, pos.y - g.player.y) < 3600;
        if (!inView) continue;
        const ret = this.returnDestFor(mc.sid, undefined, mc.side, mc.fromX, mc.fromY);
        const cnt = Math.min(8, Math.max(2, Math.round(mc.soldiers / 20)));
        const sectDef = SECT_DEF.get(mc.sid);
        const robe = mc.sid === MY ? this.my?.uniform?.robe : sectDef?.robe;
        for (let k = 0; k < cnt; k++) {
          const d = Math.hypot(ret.x - pos.x, ret.y - pos.y);
          const dur = clamp(d / 420 + 2.5, 14, 75);
          const tx = ret.x + rand(-140, 140), ty = ret.y + rand(-100, 100);
          const st = new CharState(pos.x + rand(-80, 80), pos.y + rand(-55, 55));
          st.faceToward(tx - st.x, ty - st.y, false);
          const look = randomLook(mulberry32((mc.id * 977 + k * 131) >>> 0), 'cultivator');
          if (robe) (look as any).robe = robe;
          this.postActors.push({
            x: st.x, y: st.y, tx, ty,
            look,
            st, t: Math.random() * 2, dur, maxDur: dur,
            ours: mc.side === w.side, name: this.name(mc.sid), flying: true,
            warId: w.id, sid: mc.sid,
          });
        }
      }
      S.marches = S.marches.filter((mc) => mc.warId !== w.id);
    }
    w.campA = undefined; w.campB = undefined;
    if (S.warOrders) for (const ord of S.warOrders) if (ord.warId === w.id) ord.done = true;
    const lost = this.holdsOf(L).map((id) => ({ id, d: GW ? Math.hypot(LOC_BY_ID.get(id)!.x - GW.x, LOC_BY_ID.get(id)!.y - GW.y) : 0 })).sort((x, y) => x.d - y.d);
    const cede = soft ? [] : lost.slice(0, Math.ceil(lost.length / 2));
    for (const c of cede) S.hold[c.id] = { o: W, g: W === MY ? Math.min(6, this.myFree()) : GAR[this.scale(W)] };
    this.refreshContiguousHolds();
    const prefix = coalition ? `【同盟大战总决算】` : '';
    g.news(`${prefix}${this.sideName(w, 0)}与${this.sideName(w, 1)}之战落幕：${how}。${this.sideName(w, winner)}胜${cede.length ? `，${this.name(L)}割让${cede.map((c) => LOC_BY_ID.get(c.id)!.name).join('、')}` : ''}。此役${this.sideName(w, 0)}折损 ${w.la} 人，${this.sideName(w, 1)}折损 ${w.lb} 人。`, 'rumor');
    const m = this.my;
    if (m && W === MY) {
      const sc = this.scale(L), loot = Math.round(END_LOOT[sc] * (soft ? 0.3 : 1)), tb = Math.round(loot * (m.cut ?? 0.3));
      m.stones += loot - tb; m.tribute += tb; m.earned = (m.earned ?? 0) + tb; m.fame += { da: 120, zhong: 60, xiao: 30 }[sc] * (soft ? 0.4 : 1); m.wins++;
      (g.mysect as any).log(`与${this.name(L)}一战得胜（${how}），得赔款灵石 ${loot}，宗门威望大涨。`); g.toast(`${m.name}战胜${this.name(L)}！得赔款 ${loot} 灵石，威望大涨`, 'good');
    } else if (m && L === MY) {
      const lose = Math.round(m.stones * (soft ? 0.2 : 0.45)); m.stones -= lose; m.fame = Math.max(0, m.fame * 0.85); m.losses++;
      (g.mysect as any).log(`与${this.name(W)}一战失利（${how}），赔出灵石 ${lose}。`); g.toast(`${m.name}败于${this.name(W)}：赔出 ${lose} 灵石，威望受损`, 'warn');
    }
    if (w.side !== undefined) {
      const won = w.side === winner, bonus = won ? 60 + 30 * (w.wins ?? 0) : 10 * (w.wins ?? 0), sid = w.side === 0 ? w.a : w.b;
      g.war.merit += bonus; g.rel.addSect(sid, won ? 8 : 3);
      g.toast(`${this.sideName(w, 0)}与${this.sideName(w, 1)}之战结束——你所在的一方${won ? '胜了' : '败了'}`, won ? 'good' : 'warn');
    } else if (w.called && g.ws.sect && (g.ws.sect.id === w.a || g.ws.sect.id === w.b)) {
      g.rel.addSect(g.ws.sect.id, -8); g.toast(`宗门大战已了——你身为门人却临阵不至，${sectTitle(g.ws.sect.id)}对你颇为不满。`, 'warn');
    }
    for (const j of g.war.inbox) if (j.sw === w.id) j.done = true;
    for (const sid of side0.concat(side1)) this.promote(sid);
    this.pendingOpt.delete(w.id);
    this.standoffOpt.delete(w.id);
    if (this.activeDuel && this.activeDuel.warId === w.id) {
      this.cleanupDuelEntities(this.activeDuel);
      this.activeDuel = null;
    }
    this.disperseSkirmishesForWar(w.id);
    if (this.hasBattleForWar(w.id)) this.removeBattleForWar(w.id);
  }
  /** 战后提拔：空出来的长老 / 执事席位由后辈顶上（名册的日常补员只补弟子） */
  private promote(sid: string) {
    const def = SECT_DEF.get(sid); if (!def) return;
    const st = (this.game.ws.flags as any).ros?.[sid] as { d?: number[]; g?: Record<number, number> } | undefined; if (!st?.d?.length) return;
    for (const i of [...st.d]) {
      const rk = rankOf(def, i), ch = rk === '长老' || rk === '执事' ? 0.6 : rk === '掌门' || rk === '太上长老' ? 0.35 : 0;
      if (ch && !this.game.roster.canonAt(sid, i) && Math.random() < ch) { st.d.splice(st.d.indexOf(i), 1); (st.g ??= {})[i] = (st.g[i] ?? 0) + 1; }
    }
  }

  // ---------------------------------------------------------------- 安全开阔地寻址（营帐 / 战场绝不与城镇/山门/水域重叠）
  private findOpenGround(
    nearX: number,
    nearY: number,
    map: string,
    opt: { minLocDist?: number; avoid?: { x: number; y: number; r: number }[] } = {},
  ): { x: number; y: number; map: string } {
    const minLocBase = opt.minLocDist ?? 2550;
    const avoid = opt.avoid ?? [];
    const tr = (this.game as any).terrain;
    const W = tr?.W ? tr.W * WORLD_SCALE : 60000;
    const H = tr?.H ? tr.H * WORLD_SCALE : 60000;
    const locs: { x: number; y: number; r: number }[] = [];
    for (const l of LOC_BY_ID.values()) {
      if (l.map !== map) continue;
      const r = l.type === 'city' || l.type === 'sect' ? Math.max(minLocBase, 2650) : minLocBase;
      locs.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, r });
    }
    const inBounds = (x: number, y: number) => x >= 1500 && x <= W - 1500 && y >= 1500 && y <= H - 1500;
    const onLand = (x: number, y: number) => !tr?.walkFactor || tr.walkFactor(x, y) > 0;
    const clearOf = (x: number, y: number, scale = 1) => {
      for (const l of locs) if (Math.hypot(x - l.x, y - l.y) < l.r * scale) return false;
      for (const a of avoid) if (Math.hypot(x - a.x, y - a.y) < a.r * scale) return false;
      return true;
    };
    if (inBounds(nearX, nearY) && onLand(nearX, nearY) && clearOf(nearX, nearY, 1)) {
      return { x: nearX, y: nearY, map };
    }
    const rings = [450, 950, 1500, 2100, 2750, 3450, 4200, 5000, 5900, 7200, 8800, 10500];
    let bestDry: { x: number; y: number; score: number } | null = null;
    for (const rad of rings) {
      let bestAtRing: { x: number; y: number; dist: number } | null = null;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const cx = nearX + Math.cos(ang) * rad;
        const cy = nearY + Math.sin(ang) * rad;
        if (!inBounds(cx, cy) || !onLand(cx, cy)) continue;
        let locClear = Infinity;
        for (const l of locs) locClear = Math.min(locClear, Math.hypot(cx - l.x, cy - l.y) - l.r);
        let avoidClear = Infinity;
        for (const a of avoid) avoidClear = Math.min(avoidClear, Math.hypot(cx - a.x, cy - a.y) - a.r);
        const minClear = locClear < 0 ? locClear * 100 - 100000 : Math.min(locClear, avoidClear);
        if (!bestDry || minClear > bestDry.score) bestDry = { x: cx, y: cy, score: minClear };
        if (clearOf(cx, cy, 1)) {
          const d = Math.hypot(cx - nearX, cy - nearY);
          if (!bestAtRing || d < bestAtRing.dist) bestAtRing = { x: cx, y: cy, dist: d };
        }
      }
      if (bestAtRing) return { x: bestAtRing.x, y: bestAtRing.y, map };
    }
    if (bestDry) return { x: bestDry.x, y: bestDry.y, map };
    return { x: clamp(nearX, 1600, W - 1600), y: clamp(nearY, 1600, H - 1600), map };
  }

  // ---------------------------------------------------------------- 每帧：亲身上阵、镇守弟子现身、实景局部冲突
  private frontPos(w: SWar) {
    const L = LOC_BY_ID.get(w.tgt), G = LOC_BY_ID.get(this.att(w)); if (!L) return null;
    const avoidPeers: { x: number; y: number; r: number }[] = [];
    const peerKeys: string[] = [];
    for (const ow of this.S.wars) {
      if (ow.id >= w.id || ow.fall || ow.tgt === w.tgt) continue;
      const ol = LOC_BY_ID.get(ow.tgt);
      if (!ol || ol.map !== L.map) continue;
      const ofp = this.frontPos(ow);
      if (ofp && ofp.map === L.map) {
        avoidPeers.push({ x: ofp.x, y: ofp.y, r: 5200 });
        peerKeys.push(`${ow.id}:${Math.round(ofp.x)},${Math.round(ofp.y)}`);
      }
    }
    const keyFp = `${w.id}:${w.tgt}:${w.ini}:${L.x}:${L.y}:${G?.x ?? 0}:${G?.y ?? 0}|${peerKeys.join(';')}`;
    const cached = this.fpCache.get(keyFp);
    if (cached) return cached;
    const dx = (G?.x ?? L.x) - L.x, dy = (G?.y ?? L.y + 1) - L.y, d = Math.hypot(dx, dy) || 1;
    const isMajorGate = L.type === 'sect' || L.type === 'city';
    const pushDist = isMajorGate ? 3350 : 2350;
    const rawX = L.x * WORLD_SCALE + (dx / d) * pushDist;
    const rawY = L.y * WORLD_SCALE + (dy / d) * pushDist;
    const safe = this.findOpenGround(rawX, rawY, L.map as string, {
      minLocDist: isMajorGate ? 3050 : 2150,
      avoid: avoidPeers.length ? avoidPeers : undefined,
    });
    this.fpCache.set(keyFp, safe);
    if (this.fpCache.size > 40) this.fpCache.clear();
    return safe;
  }

  // ---------------------------------------------------------------- v0.75：战前长期拉锯、优势系数、阵前对峙与职阶斗将（方案 A：无静态设施，由大营/截杀运兵粮队/巡哨/斗将驱动）
  ensureAttrition(w: SWar): WarAttritionState {
    if (w.attrition) {
      if (w.attrition.facilities?.length) w.attrition.facilities = [];
      return w.attrition;
    }
    w.attrition = {
      gaugeA: 12,
      gaugeB: 12,
      advA: 1,
      advB: 1,
      clashReady: false,
      clashTrigger: undefined,
      duelWinsA: 0,
      duelWinsB: 0,
      duelStreakA: 0,
      duelStreakB: 0,
      injuredRefs: [],
      killedRefs: [],
      facilities: [],
    };
    return w.attrition;
  }

  private resetAttritionAfterClash(w: SWar) {
    const attr = this.ensureAttrition(w);
    attr.gaugeA = 25;
    attr.gaugeB = 25;
    attr.clashReady = false;
    attr.clashTrigger = undefined;
  }

  /** 决战前长期拉锯势能演化：无固定到期时间，仅实力极度悬殊（≥2.8倍）时约一月内快速积满开战阈值 */
  private tickAttrition(w: SWar, days: number) {
    if (days <= 0 || w.fall || w.phase !== 'battle') return;
    const attr = this.ensureAttrition(w);
    const sA = Math.max(1, this.sideSects(w, 0).reduce((s, sid) => s + this.strength(sid), 0));
    const sB = Math.max(1, this.sideSects(w, 1).reduce((s, sid) => s + this.strength(sid), 0));
    const ratio = Math.max(sA, sB) / Math.min(sA, sB);
    const dominant: 0 | 1 = sA >= sB ? 0 : 1;
    // 均势或常规拉锯仅微幅摩擦积势（约数月以上，须靠截粮、巡哨、斗将推满）；悬殊差距（≥2.8x）约 28~34 日蓄满
    const baseRate = ratio >= 2.8 ? 3.15 : 0.48;
    const addDom = days * baseRate * (ratio >= 2.8 ? 1 : 1.05);
    const addOther = days * (ratio >= 2.8 ? 0.45 : 0.42);
    if (dominant === 0) {
      attr.gaugeA = Math.min(100, +(attr.gaugeA + addDom).toFixed(2));
      attr.gaugeB = Math.min(100, +(attr.gaugeB + addOther).toFixed(2));
    } else {
      attr.gaugeB = Math.min(100, +(attr.gaugeB + addDom).toFixed(2));
      attr.gaugeA = Math.min(100, +(attr.gaugeA + addOther).toFixed(2));
    }
    if (!attr.clashReady && (attr.gaugeA >= 100 || attr.gaugeB >= 100)) {
      const winSide: 0 | 1 = attr.gaugeA >= attr.gaugeB ? 0 : 1;
      attr.clashReady = true;
      attr.clashTrigger = ratio >= 2.8
        ? `${this.sideName(w, winSide)}兵锋碾压·择日总攻`
        : `${this.sideName(w, winSide)}战前蓄势已满·决战将启`;
      if (this.sideOf(w) !== undefined || w.a === MY || w.b === MY) {
        this.note(w, `【决战契机】${attr.clashTrigger}！前线大阵随时可鸣鼓总攻。`, true);
      }
    }
  }

  /** 将破设施 / 截运兵 / 截粮车 / 斗将 / 哨战成果折算入开战势能与优势系数 */
  recordAttrition(w: SWar, winSide: 0 | 1, dGauge: number, dAdv: number, reason?: string) {
    const attr = this.ensureAttrition(w);
    const loseSide: 0 | 1 = (1 - winSide) as 0 | 1;
    if (winSide === 0) {
      attr.gaugeA = clamp(+(attr.gaugeA + dGauge).toFixed(2), 0, 100);
      attr.advA = clamp(+(attr.advA + dAdv).toFixed(3), 0.65, 1.45);
      attr.advB = clamp(+(attr.advB - dAdv * 0.72).toFixed(3), 0.60, 1.40);
    } else {
      attr.gaugeB = clamp(+(attr.gaugeB + dGauge).toFixed(2), 0, 100);
      attr.advB = clamp(+(attr.advB + dAdv).toFixed(3), 0.65, 1.45);
      attr.advA = clamp(+(attr.advA - dAdv * 0.72).toFixed(3), 0.60, 1.40);
    }
    w.score = clamp(w.score + (winSide === 0 ? 1 : -1) * Math.max(1, Math.round(dGauge * 0.25)), -100, 100);
    const gNow = winSide === 0 ? attr.gaugeA : attr.gaugeB;
    if (!attr.clashReady && gNow >= 100) {
      attr.clashReady = true;
      attr.clashTrigger = reason ? `${reason}·势能蓄满` : `${this.sideName(w, winSide)}乘势总攻`;
      this.note(w, `【决战契机已成】${reason ?? '连续克敌制胜'}，我方开战势能蓄满（100/100），可立即鸣鼓发动全面大战！`, true);
    } else if (reason && (this.sideOf(w) !== undefined || w.a === MY || w.b === MY)) {
      const advVal = winSide === 0 ? attr.advA : attr.advB;
      const g = this.game;
      if (winSide === this.sideOf(w) || (this.sideOf(w) === undefined && loseSide !== 0)) {
        g.toast(`${reason}：势能 +${Math.round(dGauge)}（${Math.round(gNow)}/100），开战优势系数 ×${advVal.toFixed(2)}`, 'good');
      }
    }
  }

  /** 计算某一方开战时的最终优势系数（结合截粮/护送/斗将/巡哨与大营丹药后勤） */
  advantageOf(w: SWar, side: 0 | 1): number {
    const attr = this.ensureAttrition(w);
    const base = side === 0 ? attr.advA : attr.advB;
    const pillFactor = this.campPillFactor(w, side);
    return clamp(+(base * (0.9 + pillFactor * 0.12)).toFixed(3), 0.58, 1.52);
  }

  isDecisiveReady(w: SWar): boolean {
    const attr = this.ensureAttrition(w);
    return !!(attr.clashReady || attr.gaugeA >= 100 || attr.gaugeB >= 100);
  }

  /** 按大地图存世宗门规模、空闲战力余量与区域紧张度动态计算同时开战上限 */
  maxConcurrentWars(mapId: string, hotPairs?: number): number {
    const S = this.S;
    const allIds = this.sects(mapId);
    const viable = allIds.filter((sid) => !S.gone?.[sid] && this.combatTotal(sid) >= 18);
    const n = viable.length;
    if (n < 2) return 0;
    const engaged = new Set<string>();
    let curMapWars = 0;
    for (const w of S.wars) {
      if (LOC_BY_ID.get(w.a)?.map !== mapId) continue;
      curMapWars++;
      for (const sid of this.sideSects(w, 0)) engaged.add(sid);
      for (const sid of this.sideSects(w, 1)) engaged.add(sid);
    }
    const freeSects = viable.filter((sid) => !engaged.has(sid)).length;
    let hotCount = hotPairs ?? 0;
    if (hotPairs === undefined) {
      for (let i = 0; i < viable.length; i++) {
        for (let j = i + 1; j < viable.length; j++) {
          const a = viable[i], b = viable[j];
          if ((S.ten[key(a, b)] ?? this.base(a, b)) >= 85 && !this.between(a, b)) hotCount++;
        }
      }
    }
    const baseCap = Math.floor(n / 3.2);
    const heatBonus = hotCount >= 6 ? 1 : 0;
    const maxAllowed = Math.max(2, Math.floor(n * 0.45));
    const desired = clamp(baseCap + heatBonus, 1, maxAllowed);
    // 若空闲未参战宗门已不足开新战，上限贴合当前已开战数 + 余量对数，避免死凑空战
    const slackCap = curMapWars + Math.floor(freeSects / 2);
    return Math.max(1, Math.min(desired, Math.max(curMapWars, slackCap)));
  }

  /** 玩家在当前战事中的职阶身份：leader(太上长老/宗主/长老点将)、officer(真传/核心/执事)、vanguard(外内门/外援同阶试锋) */
  playerWarRole(w: SWar, campSide?: 0 | 1): { role: 'leader' | 'officer' | 'vanguard'; title: string; isGrand?: boolean } {
    const g = this.game;
    const mine = g.ws.sect?.id;
    const side = campSide ?? this.sideOf(w);
    const sideSects = side !== undefined ? this.sideSects(w, side) : [];
    if (this.my && side !== undefined && sideSects.includes(MY)) {
      if (this.my.masterId !== undefined) {
        return { role: 'leader', title: `${this.my.name}太上长老`, isGrand: true };
      }
      return { role: 'leader', title: `${this.my.name}宗主`, isGrand: true };
    }
    const rank = g.ws.sect?.rank ?? 0;
    if (mine && side !== undefined && sideSects.includes(mine)) {
      if (rank >= 7) return { role: 'leader', title: `${this.name(mine)}${SECT_RANKS[rank] ?? '太上长老'}`, isGrand: true };
      if (rank >= 5) return { role: 'leader', title: `${this.name(mine)}${SECT_RANKS[rank] ?? '长老'}` };
      if (rank >= 3) return { role: 'officer', title: `${this.name(mine)}${SECT_RANKS[rank] ?? '核心弟子'}` };
      return { role: 'vanguard', title: `${this.name(mine)}${SECT_RANKS[rank] ?? (rank >= 1 ? '外门弟子' : '杂役弟子')}` };
    }
    if (g.hero.realm >= 3) return { role: 'officer', title: '客卿强援' };
    return { role: 'vanguard', title: '同道援军' };
  }

  private isPlayerInFrontlineStandoff(w: SWar): boolean {
    if (w.fall || w.phase !== 'battle' || this.hasBattleForWar(w.id)) return false;
    const side = this.sideOf(w);
    if (side === undefined) return false;
    const fp = this.frontPos(w);
    if (!fp || fp.map !== ACTIVE_MAP) return false;
    return Math.hypot(fp.x - this.game.player.x, fp.y - this.game.player.y) < 1950;
  }

  /** 兼容保留空桩：前线已精简静态设施，战前由大营/运兵车队/巡哨/斗将驱动 */
  hitFacilityByPlayer(_x: number, _y: number, _r: number, _dmg: number): boolean {
    return false;
  }

  hitFacilityByProj(_pr: { x: number; y: number; dmg: number; fac?: string }): boolean {
    return false;
  }

  raidFacility(_w: SWar, _facId: string): { ok: boolean; msg: string } {
    return { ok: false, msg: '前线已取消固定设施，请截杀敌方运兵粮队或发起阵前斗将。' };
  }

  /** 前线对峙 HUD 状态（玩家尚未全面开战但已抵达两军阵前时显示；刚打完收兵或战后冷却期不立即回弹占住顶部） */
  standoffHud() {
    const g = this.game, p = g.player;
    if (this.hasBattleForWar(-1) || this.battles.length > 0 || g.hero.dead) return null;
    if (this.postFormations.length > 0 || this.postActors.length > 0) return null;
    for (const w of this.S.wars) {
      if (w.fall || w.phase !== 'battle') continue;
      if (!w.campaign && (!w.campA?.established || w.campA.soldiers <= 0 || !w.campB?.established || w.campB.soldiers <= 0)) continue;
      if (w.lastFight !== undefined && g.day - w.lastFight < 2) continue;
      if (this.hasBattleForWar(w.id)) continue;
      const side = this.sideOf(w); if (side === undefined) continue;
      const fp = this.frontPos(w); if (!fp || fp.map !== ACTIVE_MAP) continue;
      if (Math.hypot(fp.x - p.x, fp.y - p.y) > 1950) continue;
      const attr = this.ensureAttrition(w);
      const foeSide: 0 | 1 = (1 - side) as 0 | 1;
      const gauge = side === 0 ? attr.gaugeA : attr.gaugeB;
      const advM = this.advantageOf(w, side);
      const advF = this.advantageOf(w, foeSide);
      const role = this.playerWarRole(w);
      const duel = this.activeDuel?.warId === w.id ? this.activeDuel : null;
      return {
        warId: w.id,
        title: `${this.tgtName(w)} · 两军阵前对峙`,
        myName: this.sideName(w, side),
        foeName: this.sideName(w, foeSide),
        gauge: Math.round(gauge),
        advM, advF,
        clashReady: this.isDecisiveReady(w),
        clashTrigger: attr.clashTrigger,
        role: role.role,
        roleTitle: role.title,
        duelActive: !!duel,
        duelMode: duel?.mode,
        duelWins: side === 0 ? attr.duelWinsA : attr.duelWinsB,
        duelLosses: side === 0 ? attr.duelWinsB : attr.duelWinsA,
      };
    }
    return null;
  }

  /** 前线「阵前对峙台」T 键交互入口 */
  frontInteractFocus(x: number, y: number): { dist: number; prompt: string; open: () => void } | null {
    const g = this.game;
    if (this.battles.length > 0 || g.hero.dead) return null;
    let best: { dist: number; prompt: string; open: () => void } | null = null;
    for (const w of this.S.wars) {
      if (w.fall || w.phase !== 'battle') continue;
      const side = this.sideOf(w); if (side === undefined) continue;
      this.ensureAttrition(w);
      const fp = this.frontPos(w);
      if (fp && fp.map === ACTIVE_MAP) {
        const dFp = Math.hypot(fp.x - x, fp.y - y);
        if (dFp < 420 && (!best || dFp < best.dist)) {
          best = {
            dist: dFp,
            prompt: `[T] 阵前对峙台 · 斗将 / 强攻总令`,
            open: () => this.openStandoffMenu(w),
          };
        }
      }
    }
    return best;
  }

  openStandoffMenuByWarId(warId: number) {
    const w = this.S.wars.find((x) => x.id === warId);
    if (w) this.openStandoffMenu(w);
  }

  private openStandoffMenu(w: SWar) {
    const node = this.standoffNode(w);
    if (node) this.game.openDialog(node);
  }

  /** 按职阶分化的「阵前对峙 & 斗将」交互树 */
  standoffNode(w: SWar): DNode | null {
    const g = this.game;
    const side = this.sideOf(w);
    if (side === undefined) return null;
    const foeSide: 0 | 1 = (1 - side) as 0 | 1;
    const attr = this.ensureAttrition(w);
    const gauge = Math.round(side === 0 ? attr.gaugeA : attr.gaugeB);
    const advM = this.advantageOf(w, side), advF = this.advantageOf(w, foeSide);
    const { role, title, isGrand } = this.playerWarRole(w);
    const ready = this.isDecisiveReady(w);
    const lines: string[] = [
      `两军于「${this.tgtName(w)}」前线摆开阵势对峙！在明确触发决战事件或一方势能蓄满前，双方互不越雷池。`,
      `当前身份：【${title}】`,
      `战前优势系数：我方 ×${advM.toFixed(2)} vs 敌方 ×${advF.toFixed(2)} ｜ 开战势能：${gauge}/100`,
    ];
    if (this.activeDuel?.warId === w.id) {
      lines.push(`阵前斗将正在进行中（${this.activeDuel.foe.name}）！`);
    } else if (ready) {
      lines.push(`✨ 开战阈值已达成（${attr.clashTrigger ?? '势能蓄满'}），随时可鸣鼓展开全面大战！`);
    } else {
      lines.push(`尚需积攒势能至 100，或截杀敌方运兵粮队、清剿巡哨、赢下阵前斗将，方可掌握先机发动总攻。`);
    }

    const options: DOpt[] = [];
    if (!this.activeDuel) {
      if (role === 'leader') {
        const mySects = this.sideSects(w, side);
        const champs = this.pickDuelChampions(mySects[0] ?? this.att(w));
        for (const ch of champs.slice(0, 2)) {
          options.push({
            label: `点将派遣「${ch.name}」(${REALMS[ch.realm]?.name ?? '修士'})出阵斗将`,
            act: () => {
              const r = this.startFrontDuel(w, 'champion', ch);
              g.toast(r.msg, r.ok ? 'info' : 'warn');
              return null;
            },
          });
        }
        options.push({
          label: isGrand ? `${title}亲自下场·三局赌胜定乾坤` : '宗主/长老亲自下场·三局赌胜定乾坤',
          act: () => {
            const r = this.startFrontDuel(w, 'wager');
            g.toast(r.msg, r.ok ? 'info' : 'warn');
            return null;
          },
        });
      } else if (role === 'officer') {
        options.push({
          label: '自请出战·阵前斩将立功',
          act: () => {
            const r = this.startFrontDuel(w, 'player');
            g.toast(r.msg, r.ok ? 'info' : 'warn');
            return null;
          },
        });
      } else {
        options.push({
          label: '同阶试锋·请缨出列挑战敌军先锋',
          act: () => {
            const r = this.startFrontDuel(w, 'player');
            g.toast(r.msg, r.ok ? 'info' : 'warn');
            return null;
          },
        });
      }
    }

    if (ready) {
      options.push({
        label: '🔥 鸣鼓总攻 · 正式开启全面大战！',
        tone: 'gold',
        act: () => { this.triggerDecisiveClash(w, attr.clashTrigger ?? '蓄势已满·鸣鼓总攻'); return null; },
      });
    } else if (role === 'leader') {
      options.push({
        label: '⚔ 强行擂鼓破约开战（势能未满，敌军战阵将保持完整戒备）',
        act: () => { this.triggerDecisiveClash(w, '主帅强令·擂鼓总攻', { ambush: false }); return null; },
      });
    } else {
      options.push({
        label: '🗡 阵前奇袭 · 违令强攻敌阵引爆全面大战！',
        act: () => { this.triggerDecisiveClash(w, '前锋违令抢攻·战端猝启', { ambush: true }); return null; },
      });
    }
    const leadSid = this.sideSects(w, side)[0] ?? (side === 0 ? w.a : w.b);
    const homeBroken = w.tgt === leadSid && this.zhenHp(leadSid) <= 0;
    if (role === 'leader' && !homeBroken) {
      options.push({
        label: '🏳 鸣金撤兵 · 拉锯不利，放弃当前战略目标',
        act: () => this.retreatNode(w, side),
      });
    }
    options.push({ label: '暂按兵不动，继续破坏敌方设施与截杀运兵', act: () => null });
    return { speaker: '两军阵前对峙台', title: this.sideName(w, side), mood: 'danger', text: lines.join('\n'), options };
  }

  /** 普通大战中主帅觉得拉锯之后不好打：主动撤退并放弃当前战略目标 */
  retreatNode(w: SWar, side: 0 | 1, from: 'standoff' | 'camp' = 'standoff'): DNode {
    const foeSide: 0 | 1 = (1 - side) as 0 | 1;
    const isAttacker = side === w.ini;
    const leadSid = this.sideSects(w, side)[0] ?? (side === 0 ? w.a : w.b);
    const atHomeGate = w.tgt === leadSid;
    const oldTgt = this.tgtName(w);
    const desc = isAttacker
      ? `久阵拉锯之下强攻「${oldTgt}」胜算不高。若此刻鸣金撤兵，可保全前线门人与建制，仅需让出攻势主动权。`
      : `若觉外围据点「${oldTgt}」拉锯难守，主帅可下令全军有序撤回后线、放弃此战略目标，以保宗门有生力量。`;
    const opts: DOpt[] = [];
    if (!atHomeGate || isAttacker) {
      opts.push({
        label: isAttacker ? `放弃强攻「${oldTgt}」，收兵让出攻势` : `放弃据点「${oldTgt}」，全军撤回后线`,
        tone: 'bad',
        act: () => { this.retreatFromStandoff(w, side, 'yield'); return null; },
      });
    }
    opts.push({
      label: `全线罢兵撤退（放弃此战，与${this.sideName(w, foeSide)}停战歇兵）`,
      tone: 'bad',
      act: () => { this.retreatFromStandoff(w, side, 'end'); return null; },
    });
    opts.push({
      label: from === 'camp' ? '再作权衡，返回大营帅帐' : '再作权衡，返回对峙台',
      act: () => (from === 'camp' ? this.warCampNode(w, side) : this.standoffNode(w)),
    });
    return { speaker: '中军议事帐', title: `${this.sideName(w, side)} · 鸣金撤兵`, mood: 'normal', text: desc, options: opts };
  }

  retreatFromStandoff(w: SWar, side: 0 | 1, mode: 'yield' | 'end'): boolean {
    const g = this.game, S = this.S;
    if (!S.wars.includes(w) || this.hasBattleForWar(w.id)) return false;
    if (this.activeDuel && this.activeDuel.warId === w.id) {
      this.cleanupDuelEntities(this.activeDuel);
      this.activeDuel = null;
    }
    const foeSide: 0 | 1 = (1 - side) as 0 | 1;
    const oldTgt = this.tgtName(w);
    if (mode === 'end') {
      this.end(w, foeSide, `${this.sideName(w, side)}统帅权衡拉锯形势后下令撤兵，放弃${oldTgt}`, true);
      g.toast(`已下令鸣金罢兵，全军有序撤出${oldTgt}战区。`, 'warn');
      return true;
    }
    if (side === w.ini) {
      w.ini = foeSide;
      w.streak = 0;
      w.zt = 0;
      w.tgt = this.nextWarTarget(w, this.att(w), this.def(w));
      this.resetAttritionAfterClash(w);
      this.relocateCampsIfNeeded(w, true);
      this.note(w, `${this.sideName(w, side)}统帅见拉锯不利，鸣金收兵放弃强攻${oldTgt}；${this.sideName(w, foeSide)}顺势转守为攻！`, true);
      g.toast(`已放弃强攻${oldTgt}，全军保全实力撤回。`, 'info');
      return true;
    }
    const leadSid = this.sideSects(w, side)[0] ?? (side === 0 ? w.a : w.b);
    if (w.tgt !== leadSid) {
      const A = this.att(w), D = this.def(w);
      S.hold[w.tgt] = { o: A, g: A === MY ? Math.min(12, this.myFree()) : GAR[this.scale(A)] };
      w.score = clamp(w.score + (w.ini === 0 ? 12 : -12), -100, 100);
      w.tgt = this.nextWarTarget(w, A, D);
      w.zt = 0;
      this.resetAttritionAfterClash(w);
      this.relocateCampsIfNeeded(w, true);
      this.note(w, `${this.sideName(w, side)}统帅见拉锯难守，有序撤兵放弃${oldTgt}，退保下一道防线。`, true);
      g.toast(`已弃守${oldTgt}并保全门人撤回后线。`, 'warn');
      return true;
    }
    return false;
  }

  private pickDuelChampions(sid: string): { ref: number; name: string; realm: number; stage: number; sid: string }[] {
    const g = this.game;
    const list: { ref: number; name: string; realm: number; stage: number; sid: string }[] = [];
    if (sid === MY && this.my) {
      for (const d of this.my.ds) {
        if (d.realm >= 1 && d.realm <= 3) list.push({ ref: d.id, name: d.name, realm: d.realm, stage: d.stage, sid });
      }
    } else {
      const def = SECT_DEF.get(sid); if (!def) return list;
      const seg = sectSegments(def);
      for (let i = 1; i < seg.outer[1] && list.length < 6; i++) {
        if (g.roster.isDead(sid, i) || g.roster.canonAt(sid, i)) continue;
        const m = member(def, i, g.roster.gen(sid, i));
        if (m.realm >= 2 && m.realm <= 3 && m.rank !== '太上长老') {
          list.push({ ref: i, name: m.name, realm: m.realm, stage: m.stage, sid });
        }
      }
    }
    list.sort((a, b) => b.realm - a.realm || b.stage - a.stage);
    return list;
  }

  /** 发起阵前斗将（支持点将派遣旁观 / 亲自试锋 / 三局赌斗） */
  startFrontDuel(w: SWar, mode: 'champion' | 'player' | 'wager', champ?: { ref: number; name: string; realm: number; stage: number; sid: string }): { ok: boolean; msg: string } {
    if (this.activeDuel) return { ok: false, msg: '阵前斗将已在进行中！' };
    if (this.hasBattleForWar(w.id)) return { ok: false, msg: '全面大战已打响，无法再单挑。' };
    const side = this.sideOf(w); if (side === undefined) return { ok: false, msg: '你尚未参与此战。' };
    const foeSide: 0 | 1 = (1 - side) as 0 | 1;
    const fp = this.frontPos(w); if (!fp || fp.map !== ACTIVE_MAP) return { ok: false, msg: '前线不在当前图域。' };
    const g = this.game;
    const attr = this.ensureAttrition(w);
    const killed = new Set(attr.killedRefs ?? []);
    const foeSects = this.sideSects(w, foeSide);
    const targetRealm = mode === 'champion' && champ ? champ.realm : clamp(g.hero.realm, 1, 3);
    let foeUnit: Unit | undefined;
    let foeSid = foeSects[0] ?? this.def(w);
    for (const s of foeSects) {
      const pool = this.units(s).filter((u) => !killed.has(`${s}:${u.ref}`) && !u.top && Math.abs(u.realm - targetRealm) <= (mode === 'wager' ? 1 : 0));
      const fallback = pool.length ? pool : this.units(s).filter((u) => !killed.has(`${s}:${u.ref}`) && !u.top && u.realm <= 3);
      if (fallback.length) {
        foeUnit = pick(fallback);
        foeSid = s;
        break;
      }
    }
    const L = LOC_BY_ID.get(w.tgt), G = LOC_BY_ID.get(this.att(w));
    const ea = Math.atan2((L?.y ?? 0) - (G?.y ?? 0), (L?.x ?? 0) - (G?.x ?? 0));
    const ux = Math.cos(ea), uy = Math.sin(ea);
    const foeX = fp.x + ux * 240, foeY = fp.y + uy * 240;
    const foe = foeUnit
      ? this.spawn(foeSid, foeUnit, foeX, foeY, false, false)
      : this.mkUnit(foeSid, foeX, foeY, targetRealm, false, false, targetRealm);
    if (!foe) return { ok: false, msg: '敌阵一时无人敢应战！' };
    foe.team = 'war:duel:foe';
    foe.aggro = true;
    foe.hx = fp.x; foe.hy = fp.y;
    (foe as any).warDuel = true;
    (foe as any).warDuelFoe = true;

    let ally: Enemy | undefined;
    if (mode === 'champion') {
      const allyX = fp.x - ux * 240, allyY = fp.y - uy * 240;
      const cSid = champ?.sid ?? (this.sideSects(w, side)[0] ?? MY);
      const chosenChamp = champ ?? this.pickDuelChampions(cSid)[0];
      ally = (chosenChamp
        ? this.spawn(cSid, { ref: chosenChamp.ref, realm: chosenChamp.realm, stage: chosenChamp.stage, top: false, sid: cSid }, allyX, allyY, true, false)
        : null)
        ?? this.mkUnit(cSid, allyX, allyY, 2, false, true, 3)
        ?? this.mkUnit(cSid, allyX, allyY, null, false, true, 3)
        ?? undefined;
      if (ally) {
        ally.team = 'war:duel:ally';
        ally.ally = true;
        ally.aggro = true;
        ally.hx = fp.x; ally.hy = fp.y;
        (ally as any).warDuel = true;
        (foe as any).noP = true; // 主帅派遣弟子斗将：敌将不直接攻玩家；但玩家偷袭插手会立刻破约！
        g.combat.allies.push(ally);
      }
    }
    g.combat.enemies.push(foe);
    this.activeDuel = {
      warId: w.id, side, mode, round: 1, wins: 0, losses: 0,
      ally, foe, foeSid, foeUnit, x: fp.x, y: fp.y, t: 0,
    };
    const msg = mode === 'champion'
      ? `鸣锣斗将！我方派遣「${ally?.shortName ?? '弟子'}」出列迎战「${foe.name}」（主帅阵前观战，切勿私自插手破坏规矩）！`
      : `阵前亮剑！「${foe.name}」纵身出阵应战，两军屏息观阵！`;
    return { ok: true, msg };
  }

  private tickDuel(dt: number) {
    const d = this.activeDuel;
    if (!d) return;
    const g = this.game;
    const w = this.S.wars.find((x) => x.id === d.warId);
    if (!w || w.fall || this.hasBattleForWar(w.id)) {
      this.cleanupDuelEntities(d);
      this.activeDuel = null;
      return;
    }
    d.t += dt;
    // 确保斗将双方始终面向彼此切磋，不乱跑
    if (d.ally && !d.ally.dead && !d.foe.dead) {
      const dx = d.foe.x - d.ally.x, dy = d.foe.y - d.ally.y;
      if (Math.hypot(dx, dy) > 160) {
        d.ally.hx = d.foe.x; d.ally.hy = d.foe.y;
        d.foe.hx = d.ally.x; d.foe.hy = d.ally.y;
      }
    }
    if (!d.resolved && (d.foe.dead || d.foe.gone || (d.ally && (d.ally.dead || d.ally.gone)))) {
      d.resolved = true;
      d.doneT = 1.8;
      const win = d.foe.dead || d.foe.gone;
      const attr = this.ensureAttrition(w);
      if (win) {
        d.wins++;
        if (d.foeUnit) {
          const refKey = `${d.foeSid}:${d.foeUnit.ref}`;
          if (d.foe.dead) {
            attr.killedRefs ??= [];
            if (!attr.killedRefs.includes(refKey)) attr.killedRefs.push(refKey);
            this.kill(d.foeSid, [d.foeUnit.ref]);
          } else {
            attr.injuredRefs ??= [];
            if (!attr.injuredRefs.includes(refKey)) attr.injuredRefs.push(refKey);
          }
        }
        if (d.side === 0) { attr.duelWinsA++; attr.duelStreakA = (attr.duelStreakA ?? 0) + 1; attr.duelStreakB = 0; }
        else { attr.duelWinsB++; attr.duelStreakB = (attr.duelStreakB ?? 0) + 1; attr.duelStreakA = 0; }
        const streak = d.side === 0 ? (attr.duelStreakA ?? 1) : (attr.duelStreakB ?? 1);
        const dg = d.mode === 'wager' ? 24 : 18;
        const da = d.mode === 'wager' ? 0.11 : 0.08;
        g.war.merit += d.mode === 'wager' ? 55 : 35;
        this.recordAttrition(w, d.side, dg, da, `阵前斗将斩退「${d.foe.shortName ?? d.foe.name}」`);
        this.fulfillWarOrders(w.id, ['seize', 'siege']);
        g.toast(`阵前斗将告捷！敌将「${d.foe.shortName ?? d.foe.name}」落败重创，我方士气大涨！`, 'good');
        if (streak >= 3 && !attr.clashReady) {
          attr.clashReady = true;
          attr.clashTrigger = '阵前斗将三连胜·全军乘势总攻';
          this.note(w, `我军阵前斗将三战三捷，敌军锐气尽丧！已可随时鸣鼓总攻！`, true);
        }
      } else {
        d.losses++;
        if (d.side === 0) { attr.duelWinsB++; attr.duelStreakB = (attr.duelStreakB ?? 0) + 1; attr.duelStreakA = 0; }
        else { attr.duelWinsA++; attr.duelStreakA = (attr.duelStreakA ?? 0) + 1; attr.duelStreakB = 0; }
        this.recordAttrition(w, (1 - d.side) as 0 | 1, 14, 0.06, '敌将阵前斗将得胜');
        g.toast(`我方出阵弟子不敌退回本阵，士气略挫。`, 'warn');
      }
    }
    if (d.resolved) {
      d.doneT = (d.doneT ?? 0) - dt;
      if (d.doneT <= 0) {
        this.cleanupDuelEntities(d);
        this.activeDuel = null;
      }
    }
  }

  private cleanupDuelEntities(d: ActiveFrontDuel) {
    if (d.ally && !d.ally.dead) d.ally.gone = true;
    if (d.foe && !d.foe.dead) { d.foe.gone = true; d.foe.dead = true; d.foe.deathT = 0.8; }
    this.game.combat.allies = this.game.combat.allies.filter((e) => !e.gone);
  }

  /** 观战时玩家出手暗算斗将敌方，立即破约触发全面大战 */
  onPlayerMeddleDuel(e: Enemy): boolean {
    const d = this.activeDuel;
    if (!d || e !== d.foe) return false;
    if (d.mode !== 'champion') return false;
    const w = this.S.wars.find((x) => x.id === d.warId);
    if (!w) return false;
    this.game.toast('主将阵前暗算破约！两军瞬间怒火沸腾，全面大战即刻爆发！', 'warn');
    this.triggerDecisiveClash(w, '主将破约暗算·战端猝启', { ambush: true });
    return true;
  }

  /** 玩家在阵前对峙态主动攻击/施法推进，或抢攻敌阵：若已蓄满或直接强攻则触发全面开战 */
  onPlayerAggressiveAtFront(x: number, y: number): boolean {
    const g = this.game;
    // 1) 若正在开战前的叫阵阶段（standoff），主动攻击直接打断叫阵进入交锋！
    for (const B of this.battles) {
      if (B.stage === 'standoff') {
        B.stage = 'clash';
        B.standoffT = 0;
        for (const f of B.formations) f.holdFire = false;
        g.toast('战端既破，无需多言！全军战阵齐声擂鼓放箭！', 'warn');
        return true;
      }
    }
    // 2) 若在战前长期对峙态且贴近敌军阵线，允许以「阵前抢攻」事件开启大战（避免误触，须真在阵前核心圈）
    if (this._aggressiveAtFrontCd > 0) return false;
    for (const w of this.S.wars) {
      if (!this.isPlayerInFrontlineStandoff(w) || this.activeDuel?.warId === w.id) continue;
      const fp = this.frontPos(w); if (!fp) continue;
      if (Math.hypot(x - fp.x, y - fp.y) < 340) {
        this._aggressiveAtFrontCd = 3;
        this.triggerDecisiveClash(w, '阵前抢攻·全面战端开启', { ambush: true });
        return true;
      }
    }
    return false;
  }

  /** 明确事件驱动触发全面大战（蓄势总攻 / 破约偷袭 / 主帅强令） */
  triggerDecisiveClash(w: SWar, reason: string, opt: { ma?: Mode; n?: number; ambush?: boolean } = {}): boolean {
    const side = this.sideOf(w);
    if (side === undefined || w.fall) return false;
    if (this.hasBattleForWar(w.id)) return false;
    if (w.phase === 'prep') w.phase = 'battle';
    const savedStandoff = this.standoffOpt.get(w.id);
    const effMa = opt.ma ?? savedStandoff?.ma;
    const effN = opt.n ?? savedStandoff?.n;
    const attr = this.ensureAttrition(w);
    attr.clashReady = true;
    attr.clashTrigger = reason;
    if (this.activeDuel && this.activeDuel.warId === w.id) {
      this.cleanupDuelEntities(this.activeDuel);
      this.activeDuel = null;
    }
    const fp = this.frontPos(w);
    if (!fp || fp.map !== ACTIVE_MAP) {
      this.pendingOpt.set(w.id, { ma: effMa, n: effN, triggerEvent: reason });
      return false;
    }
    if (Math.hypot(fp.x - this.game.player.x, fp.y - this.game.player.y) > 2200) {
      this.pendingOpt.set(w.id, { ma: effMa, n: effN, triggerEvent: reason });
      this.game.toast(`已下达「${reason}」军令，速赴${this.tgtName(w)}前线即可开战！`, 'warn');
      return false;
    }
    this.pendingOpt.delete(w.id);
    this.standoffOpt.delete(w.id);
    this.startBattle(w, side, fp, { ma: effMa, n: effN, triggerEvent: reason, ambush: opt.ambush });
    return true;
  }

  /** HUD 按钮直接鸣鼓开战（已蓄满势能时立时擂鼓，未蓄满时弹出阵前对峙台确认） */
  triggerDecisiveClashFromHud(warId: number) {
    const w = this.S.wars.find((x) => x.id === warId);
    if (!w) return;
    if (this.isDecisiveReady(w)) {
      const attr = this.ensureAttrition(w);
      this.triggerDecisiveClash(w, attr.clashTrigger ?? '蓄势已满·鸣鼓总攻');
      return;
    }
    this.openStandoffMenu(w);
  }

  update(dt: number) {
    if (!this.game.modal && (this.S.mieN ?? 0) >= 2 && !this.S.qun) this.maybeCoalition();   // v0.70 彩蛋「天下共讨」：等发落的对话收尾再发动
    if (this._aggressiveAtFrontCd > 0) this._aggressiveAtFrontCd = Math.max(0, this._aggressiveAtFrontCd - dt);
    this.tickDuel(dt);
    for (const B of [...this.battles]) this.battleTick(B, dt);
    // 实时推进在途行军纵队与运丹车队（大地图 / 世界视角下可见移动）
    this.tickRealtimeMarches(dt);
    // 战后收兵/溃退队列与战损横尸在场时统一推进（避免多战区并发时重复倍速消耗）
    tickWarBattleFx(dt);
    if (this.postFormations.length) {
      this.postFormations = this.postFormations.filter((f) => tickPostFormation(f, dt));
    }
    if (this.postAirships.length) {
      const lv = getLastBattleView();
      const keepShips: WarAirship[] = [];
      for (const s of this.postAirships) {
        if (s.sunk) {
          s.wreckT = Math.max(0, s.wreckT - dt);
          if (s.zLift > 0) s.zLift = Math.max(0, s.zLift - 260 * dt);
          if (s.wreckT > 0) keepShips.push(s);
          continue;
        }
        // 存活战船实景飞返大营或宗门山门，不得瞬间消失
        s.retreatFadeT = (s.retreatFadeT ?? s.retreatFadeMax ?? 18) - dt;
        const maxT = s.retreatFadeMax ?? 18;
        const elapsed = maxT - (s.retreatFadeT ?? 0);
        const tx = s.retreatTx ?? s.tx;
        const ty = s.retreatTy ?? s.ty;
        const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
        if (d > 20) {
          const curAng = turnAirshipToward(s, dx, dy, dt, { forceTarget: true });
          const wantAng = Math.atan2(dy, dx);
          let diff = wantAng - curAng;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const angErr = Math.abs(diff);
          const spd = angErr > 0.7 && d > 150 ? 225 : 280;
          const moveAng = d > 150 && angErr > 0.45 ? curAng : wantAng;
          const step = Math.min(d, spd * Math.max(0, dt));
          s.vx = Math.cos(moveAng) * spd;
          s.vy = Math.sin(moveAng) * spd;
          s.x += Math.cos(moveAng) * step;
          s.y += Math.sin(moveAng) * step;
        }
        const offView = !!lv && elapsed >= 4.5 && (s.x < lv.left - 440 || s.x > lv.right + 440 || s.y < lv.top - 440 || s.y > lv.bottom + 480);
        if ((s.retreatFadeT ?? 0) > 0 && d > 65 && !offView) keepShips.push(s);
      }
      this.postAirships = keepShips;
    }
    if (this.postActors.length) {
      const lv = getLastBattleView();
      for (let i = this.postActors.length - 1; i >= 0; i--) {
        const a = this.postActors[i];
        a.dur -= dt;
        a.t += dt;
        const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy) || 1;
        const spd = a.flying ? 420 : 230;
        if (d > 32) {
          const step = Math.min(d, spd * Math.max(0, dt));
          a.x += (dx / d) * step;
          a.y += (dy / d) * step;
          a.st.x = a.x; a.st.y = a.y; a.st.t = a.t;
          if (a.flying) {
            a.st.action = 'fly'; a.st.gait = 'fly'; a.st.lift = 58 + Math.sin(a.t * 4) * 5;
          } else {
            a.st.action = 'walk'; a.st.gait = 'walk'; a.st.phase = a.t * 6.5; a.st.lift = 0;
          }
          a.st.faceToward(dx, dy, false);
        } else {
          a.st.action = 'idle'; a.st.gait = null;
        }
        const offView = !!lv && (a.maxDur - a.dur) >= 6.0 && (a.x < lv.left - 520 || a.x > lv.right + 520 || a.y < lv.top - 520 || a.y > lv.bottom + 560);
        if (a.dur <= 0 || d <= 48 || offView) this.postActors.splice(i, 1);
      }
    }
    this.tickSkirmishes(dt);
    this.acc -= dt; if (this.acc > 0) return; this.acc = 1;
    try { this.guardTick(); } catch { /* */ }
    const g = this.game, p = g.player;
    this.checkMarchAndCampProximity();
    if (!g.modal && !g.pursuit.active && !(g.war as any).battle && !g.hero.dead) for (const w of this.S.wars) {
      const side = this.sideOf(w); if (side === undefined || w.fall) continue;
      if (this.hasBattleForWar(w.id)) continue;
      if (w.phase === 'prep') continue;
      const cmp = this.campPos(w, side);
      if (cmp && cmp.map === ACTIVE_MAP && Math.hypot(cmp.x - p.x, cmp.y - p.y) < 520) continue;
      const fp = this.frontPos(w); if (!fp || fp.map !== ACTIVE_MAP) continue;
      const pend = this.pendingOpt.get(w.id);
      const savedStandoff = this.standoffOpt.get(w.id);
      const attr = this.ensureAttrition(w);
      const dist = Math.hypot(fp.x - p.x, fp.y - p.y);
      // 唯有明确军令/会战总攻事件（pend / campaign / clashReady）才触发全面开战；刚结束战斗的战事有 2 日喘息冷却
      const postCooldown = !pend && w.lastFight !== undefined && g.day - w.lastFight < 2;
      if (!postCooldown && dist < 1700 && (pend || w.campaign || attr.clashReady)) {
        this.pendingOpt.delete(w.id);
        this.standoffOpt.delete(w.id);
        this.startBattle(w, side, fp, { ...(savedStandoff ?? {}), ...(pend ?? {}), triggerEvent: pend?.triggerEvent ?? attr.clashTrigger });
      } else if (!postCooldown && dist < 1750) {
        const lastT = this._standoffToastAt.get(w.id) ?? -999;
        const lastTgtT = this._lastStandoffTgtToast.get(w.tgt) ?? -999;
        if (g.time - lastT > 60 && g.time - lastTgtT > 25) {
          this._standoffToastAt.set(w.id, g.time);
          this._lastStandoffTgtToast.set(w.tgt, g.time);
          const myG = Math.round(side === 0 ? attr.gaugeA : attr.gaugeB);
          g.toast(`已抵「${this.tgtName(w)}」阵前对峙线（势能 ${myG}/100，可按 [T] 斗将/奇袭）`, 'info');
        }
      }
    }
    this.pacc -= 1; if (this.pacc <= 0) { this.pacc = 2; this.postTick(); }
  }
  /** 据点的镇守弟子：你走近才现身（名册真人），走远归队 */
  private postTick() {
    const g = this.game, P = g.player, S = this.S, npcs = g.npcs;
    if (!this.adopted) { this.adopted = true; for (const d of npcs.list) if ((d as any).war === 'sw' && d.alive) { const a = this.posted.get(d.home) ?? []; a.push(d.id); this.posted.set(d.home, a); } }
    for (const [lid, ids] of [...this.posted]) {
      const l = LOC_BY_ID.get(lid), h = S.hold[lid];
      const far = !l || l.map !== ACTIVE_MAP || Math.hypot(l.x * WORLD_SCALE - P.x, l.y * WORLD_SCALE - P.y) > 8000;
      if (far || !h || ids.some((id) => npcs.byId.get(id)?.sect !== h.o)) { for (const id of ids) { const d = npcs.byId.get(id); if (d) this.unpost(d); } this.posted.delete(lid); }
    }
    for (const lid of Object.keys(S.hold)) {
      const h = S.hold[lid]; if (this.posted.has(lid) || !SECT_DEF.has(h.o) || h.g <= 0) continue;
      const l = LOC_BY_ID.get(lid); if (!l || l.map !== ACTIVE_MAP || Math.hypot(l.x * WORLD_SCALE - P.x, l.y * WORLD_SCALE - P.y) > 5000) continue;
      const ds = [...g.roster.pick(h.o, 1, 2, 3, { skipTop: true }), ...g.roster.pick(h.o, 2, 1, 1, { skipTop: true })], ids: string[] = [];
      for (const d of ds) {
        (d as any).war = 'sw'; (d as any).t0 = d.title; d.title = `${sectTitle(h.o)}·镇守${l.name}`; d.home0 ??= d.home; d.home = lid; d.stay = true; d.map = l.map;
        if (!npcs.activeOf(d.id)) { const q = npcs.homeAt(l, Math.random, 900, 600); d.x = d.tx = q.x; d.y = d.ty = q.y; }
        ids.push(d.id);
      }
      this.posted.set(lid, ids);
    }
  }
  private unpost(d: NpcData) { (d as any).war = undefined; if ((d as any).t0) { d.title = (d as any).t0; (d as any).t0 = undefined; } d.stay = false; if (d.home0) { d.home = d.home0; d.home0 = undefined; } }

  private mkUnit(sid: string, x: number, y: number, realm: number | null, boss: boolean, ours: boolean, cap = 4, targetB?: Live): Enemy | null {
    const g = this.game, B = targetB ?? this.battle;
    let r = 1, stage = 0, nm = '', sectNm = '', shortNm = '', seed = Math.floor(Math.random() * 1e9), sex: 'm' | 'f' | undefined, robe: string | undefined, ros: [string, number] | undefined, dsId: number | undefined;
    if (sid === MY) {
      const m = this.my; if (!m) return null;
      const used = new Set(this.battles.flatMap((b) => b.allies).concat(B?.allies ?? []).map((e) => (e as any).swDs));
      const c = m.ds.filter((d) => d.realm >= 1 && !used.has(d.id) && (realm === null ? d.realm <= cap : d.realm === realm));
      if (!c.length) return null; const d = pick(c);
      r = clamp(d.realm, 1, 5); stage = d.stage; sectNm = m.name; shortNm = d.name; nm = `${sectNm}·${shortNm}`; sex = d.sex; seed = d.id * 7919 + 13; dsId = d.id;
    } else {
      const def = SECT_DEF.get(sid); if (!def) return null;
      const seg = sectSegments(def), maxK = Math.max(2, seg.outer[1]);
      const ro = g.roster, inField = new Set([...this.battles.flatMap((b) => [...b.foes, ...b.allies]), ...(B?.foes ?? []), ...(B?.allies ?? [])].filter((e) => !e.dead).map((e) => ((e as any).warRos as [string, number] | undefined)?.join(':')));
      let i = -1;
      if (boss) { let br = -1; for (let k = 1; k < Math.min(seg.coreEnd, 60); k++) { if (ro.isDead(sid, k) || ro.canonAt(sid, k)) continue; const m = member(def, k, ro.gen(sid, k)); if (m.rank === '太上长老' || m.realm > cap) continue; if (m.realm > br) { br = m.realm; i = k; } } }
      else for (let t = 0; t < 40 && i < 0; t++) {
        const k = 1 + Math.floor(Math.random() * (maxK - 1)); if (ro.isDead(sid, k) || ro.canonAt(sid, k) || inField.has(`${sid}:${k}`)) continue;
        const m = member(def, k, ro.gen(sid, k)); if (m.rank === '太上长老' || m.rank === '杂役弟子' || m.realm > cap || (realm !== null && m.realm !== realm)) continue;
        i = k;
      }
      if (i < 0) return null;
      const m = member(def, i, ro.gen(sid, i)); r = clamp(m.realm, 1, 5); stage = m.stage; sectNm = def.name; shortNm = m.name; nm = `${sectNm}·${shortNm}`; sex = m.sex; seed = m.seed; robe = def.robe; ros = [sid, i];
    }
    stage = Math.min(stage, REALMS[r].hp.length - 1);
    const e = new Enemy(ENEMIES[r >= 3 ? 'jindan_mo' : r >= 2 ? 'zhujixiu' : 'moxiu'], x, y, r, stage);
    e.look = randomLook(mulberry32(seed), sex === 'f' ? 'female' : r >= 3 ? 'elder' : 'cultivator');
    if (robe) (e.look as any).robe = robe;
    if (sex) (e.look as any).sex = sex;
    e.name = nm; e.sectName = sectNm; e.shortName = shortNm; e.school = SCHOOLS[sid] ? sid : SCHOOL_ALIAS[sid] ?? 'sanxiu'; e.aggro = true;
    (e as any).warRos = ros; (e as any).swDs = dsId;
    if (boss) { e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 2.4); e.atk *= 1.15; }
    if (ours) { e.tag = 'war:ally'; g.combat.addAlly(e); } else { e.team = `sw:${sid}`; g.combat.enemies.push(e); }
    return e;
  }
  // ---------------------------------------------------------------- v0.62 大会战（亲身上阵）
  /** 把名册上的某一个人放上战场（真人真名：倒下一个，名册上就少一个；u.ref < 0 时为外门战阵执事补位） */
  private spawn(sid: string, u: Unit, x: number, y: number, ours: boolean, boss = false): Enemy | null {
    const g = this.game;
    let r = 1, stage = 0, nm = '', sectNm = '', shortNm = '', seed = 1, sex: 'm' | 'f' | undefined, robe: string | undefined, ros: [string, number] | undefined, dsId: number | undefined;
    let outerCapSid: string | undefined;
    if (u.ref < 0) {
      r = clamp(u.realm, 1, 5);
      stage = u.stage;
      const capTitles = ['阵眼执事', '百人队正', '外门百长', '先锋管带', '护阵校尉'];
      shortNm = capTitles[Math.abs(u.ref + 1) % capTitles.length];
      if (sid === MY) {
        const m = this.my; if (!m) return null;
        sectNm = m.name;
        robe = m.uniform?.robe;
      } else {
        const def = SECT_DEF.get(sid); if (!def) return null;
        sectNm = def.name;
        robe = def.robe;
      }
      nm = `${sectNm}·${shortNm}`;
      seed = Math.abs(u.ref) * 4099 + sid.length * 131 + 7;
      outerCapSid = sid;
    } else if (sid === MY) {
      const m = this.my, d = m?.ds.find((x0) => x0.id === u.ref); if (!m || !d) return null;
      r = clamp(d.realm, 1, 5); stage = d.stage; sectNm = m.name; shortNm = d.name; nm = `${sectNm}·${shortNm}`; sex = d.sex; seed = d.id * 7919 + 13; dsId = d.id;
    } else {
      const def = SECT_DEF.get(sid); if (!def || g.roster.isDead(sid, u.ref)) return null;
      const m = member(def, u.ref, g.roster.gen(sid, u.ref)); r = clamp(m.realm, 1, 5); stage = m.stage; sectNm = def.name; shortNm = m.name; nm = `${sectNm}·${shortNm}`; sex = m.sex; seed = m.seed; robe = def.robe; ros = [sid, u.ref];
    }
    stage = Math.min(stage, REALMS[r].hp.length - 1);
    const e = new Enemy(ENEMIES[r >= 3 ? 'jindan_mo' : r >= 2 ? 'zhujixiu' : 'moxiu'], x, y, r, stage);
    e.look = randomLook(mulberry32(seed), sex === 'f' ? 'female' : r >= 3 ? 'elder' : 'cultivator');
    if (robe) (e.look as any).robe = robe;
    if (sex) (e.look as any).sex = sex;
    e.name = nm; e.sectName = sectNm; e.shortName = shortNm; e.school = SCHOOLS[sid] ? sid : SCHOOL_ALIAS[sid] ?? 'sanxiu'; e.aggro = true;
    (e as any).warRos = ros; (e as any).swDs = dsId;
    if (outerCapSid) (e as any).swOuterCapSid = outerCapSid;
    if (boss) { e.boss = true; e.maxHp = e.hp = Math.round(e.hp * 2.4); e.atk *= 1.15; }
    if (ours) { e.tag = 'war:ally'; g.combat.addAlly(e); } else { e.team = `sw:${sid}`; g.combat.enemies.push(e); }
    return e;
  }
  /** 开战清场：驱离战区范围内的闲杂路人、围观 NPC 与野生妖兽，防止敌修或路人混入战阵 */
  private clearBattlefieldNonCombatants(cx: number, cy: number, radius = 3000) {
    const g = this.game;
    const isWarUnit = (e: Enemy) => !!(e.tag?.startsWith('war:') || e.team?.startsWith('sw:') || e.team?.startsWith('sk:') || (e as any).warRos || (e as any).warForm || (e as any).warStandoff || (e as any).warSkirmish);
    for (const e of g.combat.enemies) {
      if (e.dead || e.gone || isWarUnit(e) || e.boss || e.pursuer || e.lairId) continue;
      if (Math.hypot(e.x - cx, e.y - cy) <= radius) {
        if (e.ecoId !== undefined) g.combat.eco.hibernateActor(e, g.time);
        e.gone = true;
      }
    }
    for (const a of g.npcs.active.values()) {
      if (!a.d.alive || a.enemy || a.d.bond || a.d.beauty || a.act === 'follow') continue;
      const dist = Math.hypot(a.st.x - cx, a.st.y - cy);
      if (dist <= radius) {
        const homeLoc = a.d.home ? LOC_BY_ID.get(a.d.home) : undefined;
        const ang = Math.atan2(a.st.y - cy, a.st.x - cx) || 0;
        const safeD = radius + 650;
        a.life = undefined;
        a.duel = undefined;
        if (homeLoc && homeLoc.map === ACTIVE_MAP) {
          a.d.tx = homeLoc.x * WORLD_SCALE + rand(-180, 180);
          a.d.ty = homeLoc.y * WORLD_SCALE + rand(-140, 140);
        } else {
          a.d.tx = cx + Math.cos(ang) * safeD;
          a.d.ty = cy + Math.sin(ang) * safeD;
        }
        a.act = a.d.realm >= 2 ? 'fly' : 'walk';
        (a as any).path = undefined;
        if (dist < radius * 0.65) {
          a.st.x = a.d.x = cx + Math.cos(ang) * (radius + 200);
          a.st.y = a.d.y = cy + Math.sin(ang) * (radius + 200);
        }
      }
    }
  }

  /** 开打：三段列阵开战（后阵汇聚成阵 → 齐步推进对峙线 → 阵前叫阵对峙 → 全面交锋），先结算战前优势系数并分层编组 */
  private startBattle(w: SWar, side: 0 | 1, fp: { x: number; y: number }, opt: { ma?: Mode; md?: Mode; n?: number; triggerEvent?: string; ambush?: boolean } = {}) {
    this.disperseSkirmishesForWar(w.id);
    this.clearBattlefieldNonCombatants(fp.x, fp.y, 3000);
    if (this.activeDuel && this.activeDuel.warId === w.id) {
      this.cleanupDuelEntities(this.activeDuel);
      this.activeDuel = null;
    }
    const g = this.game, S = this.S, A = this.att(w), D = this.def(w), mine = side === 0 ? w.a : w.b, foe = side === 0 ? w.b : w.a;
    this.ensureValidWarTarget(w);
    const gate = w.tgt === D, zhen = gate && this.zhenHp(D) > 0;
    if (A === MY && !opt.ma) {
      opt = gate && !zhen
        ? { ...opt, ma: 'all' }
        : { ...opt, ma: 'wave', n: opt.n ?? Math.min(this.myFree(), Math.max(180, Math.round(this.myFree() * 0.45))) };
    }
    let [ma, md] = this.modes(w, opt, gate);
    if (zhen) { if (ma === 'hold') ma = 'wave'; md = 'hold'; }
    const gar = gate ? Math.round(this.combatTotal(D) * 0.25) : S.hold[w.tgt]?.g ?? 0;
    const sa = this.commitSplit(A, ma, true, 0, opt.n), sd = this.commitSplit(D, md, false, gar, sa.total);
    const gset = new Set(this.my?.guard ?? []);
    const mgset = new Set(this.my?.masterGuard ?? []);
    const myMasterId = this.my?.masterId;
    const worldId = worldOfMap(ACTIVE_MAP);
    const attr = this.ensureAttrition(w);
    const killedSet = new Set(attr.killedRefs ?? []);
    const buildAlliedPool = (leadSid: string, leadSplit: { core: Unit[]; outer: number; total: number }, sideIdx: 0 | 1, mode: Mode) => {
      const sects = this.sideSects(w, sideIdx);
      const perSectBuckets: { captains: Unit[]; rest: Unit[] }[] = [];
      let totalOuter = leadSplit.outer;
      const collectSect = (sid: string, rawCore: Unit[]) => {
        const pool = rawCore
          .filter((u) => (sid !== MY || !gset.has(u.ref)) && !killedSet.has(`${sid}:${u.ref}`))
          .map((u) => ({ ...u, sid }))
          .sort((x, y) => {
            // 若委任掌门参战，掌门与掌门护卫优先协同编列
            if (sid === MY && myMasterId !== undefined) {
              const xm = x.ref === myMasterId || mgset.has(x.ref) ? 1 : 0;
              const ym = y.ref === myMasterId || mgset.has(y.ref) ? 1 : 0;
              if (xm !== ym) return ym - xm;
            }
            return pwOf(x) - pwOf(y);
          });
        const captains: Unit[] = [];
        const rest: Unit[] = [];
        for (const u of pool) {
          if (captains.length < 3 && u.realm < 3 && canLeadWarFormation(worldId, u.realm)) captains.push(u);
          else rest.push(u);
        }
        perSectBuckets.push({ captains, rest });
      };
      collectSect(leadSid, leadSplit.core);
      for (const asid of sects) {
        if (asid === leadSid) continue;
        const asp = this.commitSplit(asid, mode === 'all' ? 'wave' : mode, false, 0, Math.min(180, Math.max(40, Math.round(leadSplit.total * 0.45))));
        totalOuter += Math.round(asp.outer * 0.75);
        collectSect(asid, asp.core);
      }
      // 轮转编排各盟宗阵眼与核心修士，确保多方同盟同场并肩出战
      const captainsOut: Unit[] = [];
      const restOut: Unit[] = [];
      let moreCap = true;
      while (moreCap) {
        moreCap = false;
        for (const bk of perSectBuckets) {
          const u = bk.captains.shift();
          if (u) { captainsOut.push(u); moreCap = true; }
        }
      }
      let moreRest = true;
      while (moreRest) {
        moreRest = false;
        for (const bk of perSectBuckets) {
          const u = bk.rest.shift();
          if (u) { restOut.push(u); moreRest = true; }
        }
      }
      return { core: [...captainsOut, ...restOut], outer: totalOuter };
    };
    const attIdx: 0 | 1 = A === w.a ? 0 : 1;
    const defIdx: 0 | 1 = (1 - attIdx) as 0 | 1;
    const poolA = buildAlliedPool(A, sa, attIdx, ma);
    const poolD = buildAlliedPool(D, sd, defIdx, md);
    const rawRm = A === mine ? poolA.core : poolD.core;
    const rawRf = A === mine ? poolD.core : poolA.core;
    const outerRm = A === mine ? poolA.outer : poolD.outer;
    const outerRf = A === mine ? poolD.outer : poolA.outer;

    // 分层：Tier1 前线筑基及阵眼骨干；Tier2 结丹统帅/长老（危急方下场）；Tier3 仅存亡/灭宗大战（非破阵前哨）才额外压轴老祖 Boss
    const big = ma === 'all' && md === 'all';
    const isExtinction = big || (gate && !zhen);
    const splitTiers = (raw: Unit[], outerN: number, fallbackSid: string) => {
      const vanguard: Unit[] = [];
      const cmd: Unit[] = [];
      const boss: Unit[] = [];
      for (const u of raw) {
        if (isExtinction && (u.top || u.realm >= 4)) boss.push(u);
        else if (u.realm >= 3 || u.top) cmd.push(u);
        else vanguard.push(u);
      }
      cmd.sort((a, b) => (b.realm * 10 + b.stage) - (a.realm * 10 + a.stage));
      if (isExtinction && !boss.length && cmd.length > 1) {
        boss.push(cmd.shift()!);
      }
      // 保证拥有足够战兵方阵的阵眼队长：避免因高阶骨干留在 cmd 或宗门前期筑基弟子较少而仅剩 1 队出战
      const capMinRealm = warTierBand(worldId).captainMinRealm;
      const needCaps = outerN >= 24 ? clamp(Math.ceil(outerN / 55), 2, 5) : (outerN >= 12 ? 1 : 0);
      let capCount = vanguard.filter((u) => canLeadWarFormation(worldId, u.realm)).length;
      while (capCount < needCaps && cmd.length > 0) {
        const promoted = cmd.pop()!;
        vanguard.push(promoted);
        if (canLeadWarFormation(worldId, promoted.realm)) capCount++;
      }
      if (isExtinction) {
        while (capCount < needCaps && boss.length > 1) {
          const promoted = boss.pop()!;
          vanguard.push(promoted);
          if (canLeadWarFormation(worldId, promoted.realm)) capCount++;
        }
      }
      let synIdx = 1;
      while (capCount < needCaps) {
        vanguard.push({ ref: -(synIdx++), realm: capMinRealm, stage: 0, top: false, sid: fallbackSid });
        capCount++;
      }
      // 优先让可领阵眼的骨干排在前列，开局首批 16/20 人即可完整展开多座百人方阵
      vanguard.sort((a, b) => Number(canLeadWarFormation(worldId, b.realm)) - Number(canLeadWarFormation(worldId, a.realm)));
      return { vanguard, cmd, boss };
    };
    const tm = splitTiers(rawRm, outerRm, mine);
    const tf = splitTiers(rawRf, outerRf, foe);

    const foeSide: 0 | 1 = (1 - side) as 0 | 1;
    const holdBoost = !gate && S.hold[w.tgt] ? this.holdDefMul(w.tgt) : 1;
    const advM = clamp(+(this.advantageOf(w, side) * (D === mine ? holdBoost : 1)).toFixed(3), 0.58, 1.75);
    const advF = clamp(+(this.advantageOf(w, foeSide) * (D === foe ? holdBoost : 1)).toFixed(3), 0.58, 1.75);
    const L = LOC_BY_ID.get(w.tgt); let ea = L ? Math.atan2(L.y * WORLD_SCALE - fp.y, L.x * WORLD_SCALE - fp.x) : 0; if (A !== mine) ea += Math.PI;
    w.lastFight = g.day;
    if (this.battles.length === 0) {
      resetWarBattleFx();
      this.postFormations.length = 0;
      this.postAirships.length = 0;
      this.postActors.length = 0;
    }
    const triggerEvent = opt.triggerEvent ?? attr.clashTrigger ?? '鸣鼓总攻';
    const parleyDur = opt.ambush ? 1.4 : 5.5;
    const liveBattle: Live = {
      war: w.id, side, wave: 0, foes: [], allies: [], t: 0, x: fp.x, y: fp.y,
      rm: tm.vanguard, rf: tf.vanguard, outerRm, outerRf,
      cmdRm: tm.cmd, cmdRf: tf.cmd, bossRm: tm.boss, bossRf: tf.boss,
      advM, advF,
      stage: 'muster', stageT: 2.4, parleyStep: 0, triggerEvent,
      m0: rawRm.length + outerRm, f0: rawRf.length + outerRf,
      km: 0, kf: 0, outerKm: 0, outerJm: 0, outerKf: 0, outerJf: 0,
      formations: [], formSeq: 1, airships: [], airshipSeq: 1, rt: 1, st: 10, ft: 1, standoffT: parleyDur, ma, md, gate, zhen, ea,
    };
    this.battles.push(liveBattle);
    this.deployBattleAirships(liveBattle, mine, foe, big, isExtinction);
    this.reinforce(liveBattle, FIELD_F, FIELD_M);
    this.attachAirshipEscorts(liveBattle);
    g.toast(zhen ? `【${triggerEvent}】${this.name(D)}护宗大阵「${this.zhenName(D)}」之前——${A === mine ? '破阵之战启幕' : '护阵决战启幕'}！我(×${advM.toFixed(2)}) ${liveBattle.m0} 人 · 敌(×${advF.toFixed(2)}) ${liveBattle.f0} 人`
      : isExtinction ? `【${triggerEvent}·存亡决战】${this.sideName(w, side)}(×${advM.toFixed(2)}) ${liveBattle.m0} 人对${this.sideName(w, foeSide)}(×${advF.toFixed(2)}) ${liveBattle.f0} 人——不死不休！`
      : `【${triggerEvent}】${this.tgtName(w)}两军列阵开拔！我(×${advM.toFixed(2)}) ${liveBattle.m0} 人对敌(×${advF.toFixed(2)}) ${liveBattle.f0} 人！`, 'warn');
    g.juice?.(0.12, 0.6);
    const p = g.player; sealFx('rune', this.dao(foe) === 'mo' ? 'blood' : 'gold', p.x + Math.cos(ea) * 760, p.y + Math.sin(ea) * 600, zhen ? 6 : 3.6, { dur: 8, loop: true });
  }
  private schoolOf(sid: string): School {
    const gid = sid === MY ? this.my?.gf : sectGongfa(sid) ?? EXTRA_GF[sid], gf = gid ? GONGFA[gid] : undefined;
    const s = gf?.school ? Object.entries(gf.school).sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
    return (s as School) ?? '剑';
  }
  private patternOf(sid: string, ours: boolean, slotIdx = 0): FormPattern {
    if (ours && this.S.myPattern) return this.S.myPattern;
    const d = this.doctrine(sid);
    const sch = this.schoolOf(sid);
    let base: FormPattern;
    if (d.atk > d.def + 0.14 || sch === '火' || sch === '风' || sch === '御' || sch === '身') {
      base = 'arrow';
    } else if (sch === '剑' || sch === '雷' || sch === '冰' || sch === '魔') {
      base = 'crescent';
    } else if (sch === '阵' || sch === '识' || sch === '符') {
      base = 'bagua';
    } else if (d.def > d.atk + 0.14 || sch === '土' || sch === '体' || sch === '木') {
      base = 'circle';
    } else {
      base = 'crane';
    }
    if (slotIdx <= 0) return base;
    // 同一侧多座百人战阵按中军/两翼/后阵职责组合布阵，避免全军只摆单一阵型
    const wingCycle: FormPattern[] = base === 'arrow'
      ? ['arrow', 'crane', 'crescent', 'square']
      : base === 'crescent'
        ? ['crescent', 'crane', 'arrow', 'bagua']
        : base === 'bagua'
          ? ['bagua', 'circle', 'crane', 'crescent']
          : base === 'circle'
            ? ['circle', 'square', 'crescent', 'crane']
            : ['crane', 'arrow', 'bagua', 'circle'];
    return wingCycle[slotIdx % wingCycle.length];
  }
  /** 结算战船坠毁与战后重伤返坞大修（确保沉船永久扣减，重伤战船须修好方能再出征） */
  private handleAirshipBattleAccounting(ship: WarAirship, battleEnded: boolean) {
    if (ship.fleetHandled) return;
    const fl = this.fleetOf(ship.sid);
    const tk = (`t${ship.tier}`) as 't1' | 't2' | 't3';
    if (ship.sunk) {
      ship.fleetHandled = true;
      fl[tk] = Math.max(0, fl[tk] - 1);
      if (ship.sid === MY) {
        const nm = AIRSHIP_BUILD_SPEC[ship.tier].name;
        (this.game.mysect as any).log(`战损：一艘${nm}在战阵中被击沉坠毁，舟师实减一艘。`);
        this.game.toast(`战损：本宗${nm}被击沉！`, 'warn');
      }
      return;
    }
    if (battleEnded) {
      ship.fleetHandled = true;
      if (ship.hp < ship.maxHp * 0.55 && fl[tk] > 0) {
        fl[tk]--;
        fl.damaged ??= { t1: 0, t2: 0, t3: 0 };
        fl.damaged[tk]++;
        if (ship.sid === MY) {
          const nm = AIRSHIP_BUILD_SPEC[ship.tier].name;
          (this.game.mysect as any).log(`${nm}船体受创过半，退回战船坞大修（修好前方可再出征）。`);
          this.game.toast(`本宗${nm}重创返坞，须经修缮方可再战`, 'info');
        }
      }
    }
  }

  /** 战前双方按各自战船库存（与运丹灵舟共用库存，绝不凭空刷新）配属浮空战船及伴飞护法 */
  private deployBattleAirships(B: Live, mine: string, foe: string, big: boolean, isExtinction: boolean) {
    const ux = Math.cos(B.ea), uy = Math.sin(B.ea);
    const px = -uy, py = ux;
    const deploySide = (ours: boolean, sid: string, totalPower: number) => {
      const avail = this.fleetAvailable(sid);
      const wantTiers: AirshipTier[] = [];
      if (isExtinction || B.zhen || totalPower >= 150 || (big && scaleOf(sid) === 'da')) {
        wantTiers.push(3);
        if (totalPower >= 190) wantTiers.push(1);
      } else if (totalPower >= 65 || B.gate || scaleOf(sid) !== 'xiao') {
        wantTiers.push(2);
      } else if (totalPower >= 24) {
        wantTiers.push(1);
      }
      if (!wantTiers.length) return;
      const poolRem = { ...avail };
      const pickFromStock = (pref: AirshipTier): AirshipTier | null => {
        const order: AirshipTier[] = pref === 3 ? [3, 2, 1] : pref === 2 ? [2, 1, 3] : [1, 2];
        for (const t of order) {
          const k = (`t${t}`) as 't1' | 't2' | 't3';
          if (poolRem[k] > 0) { poolRem[k]--; return t; }
        }
        return null;
      };
      const tiers: AirshipTier[] = [];
      for (const pref of wantTiers) {
        const picked = pickFromStock(pref);
        if (picked) tiers.push(picked);
      }
      if (!tiers.length) return;
      const sign = ours ? -1 : 1;
      const w = this.S.wars.find((x) => x.id === B.war);
      const sideIdx: 0 | 1 = ours ? B.side : (1 - B.side) as 0 | 1;
      const campOrg = this.campDispatchOrigin(w, sideIdx, B.x, B.y, B.ea, 2150);
      const style: AirshipStyle = this.dao(sid) === 'mo' ? 'mo' : 'zheng';
      const sectName = this.name(sid);
      const customUniform = sid === MY ? this.my?.uniform : undefined;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const minCrewReq = tier === 3 ? 25 : tier === 2 ? 14 : 8;
        const availOuter = ours ? B.outerRm : B.outerRf;
        if (availOuter < minCrewReq + 6) continue;
        const wantCrew = tier === 3 ? 32 : tier === 2 ? 18 : 9;
        const crewAlloc = Math.min(wantCrew, Math.max(minCrewReq, Math.floor(availOuter * 0.25)));
        if (ours) B.outerRm -= crewAlloc; else B.outerRf -= crewAlloc;
        const backOff = 180 + (tier === 3 ? 120 : tier === 2 ? 70 : 30) + i * 160;
        const latOff = tiers.length > 1 ? (i === 0 ? -180 : 280) : (tier === 3 ? 0 : -110);
        // 开战时战船先自大营附近升空伴随战阵集结，随后统一起飞开赴前线战位
        const sx = campOrg.x + ux * sign * backOff + px * latOff;
        const sy = campOrg.y + uy * sign * backOff + py * latOff * 0.72;
        const deployTx = B.x + ux * sign * 360 + px * latOff;
        const deployTy = B.y + uy * sign * 360 + py * latOff * 0.72;
        const holdAtCamp = B.stage === 'muster';
        const ship = createWarAirship({
          id: B.airshipSeq++,
          warId: B.war,
          sid,
          sectName,
          ours,
          tier,
          style,
          x: sx,
          y: sy,
          tx: holdAtCamp ? sx : deployTx,
          ty: holdAtCamp ? sy : deployTy,
          crew: crewAlloc,
          customUniform,
        });
        const initShipDx = Math.hypot(deployTx - sx, deployTy - sy) > 20 ? deployTx - sx : (ours ? ux : -ux);
        const initShipDy = Math.hypot(deployTx - sx, deployTy - sy) > 20 ? deployTy - sy : (ours ? uy : -uy);
        turnAirshipToward(ship, initShipDx, initShipDy, 0, { instant: true });
        (ship as any).deployTx = deployTx;
        (ship as any).deployTy = deployTy;
        B.airships.push(ship);
      }
    };
    deploySide(true, mine, B.m0);
    deploySide(false, foe, B.f0);
  }
  private attachAirshipEscorts(B: Live) {
    for (const ship of B.airships) {
      const pool = ship.ours ? B.allies : B.foes;
      const wantEscort = ship.tier === 3 ? 6 : ship.tier === 2 ? 4 : 3;
      for (const e of pool) {
        if (ship.escorts.length >= wantEscort) break;
        if (!e.dead && !e.gone && e.realm >= 2 && !(e as any).warForm && !(e as any).warShipId) {
          (e as any).warShipId = ship.id;
          e.hx = ship.x; e.hy = ship.y;
          ship.escorts.push(e);
        }
      }
      while (ship.escorts.length < wantEscort) {
        const ang = (ship.escorts.length / Math.max(1, wantEscort)) * Math.PI * 2;
        const ex = ship.x + Math.cos(ang) * 180;
        const ey = ship.y + Math.sin(ang) * 110;
        const esc = this.mkUnit(ship.sid, ex, ey, 2, false, ship.ours, 3, B);
        if (!esc) break;
        (esc as any).warShipId = ship.id;
        esc.hx = ship.x; esc.hy = ship.y;
        if (ship.ours) B.allies.push(esc); else B.foes.push(esc);
        ship.escorts.push(esc);
      }
    }
  }
  private maybeAttachFormation(B: Live, e: Enemy, sid: string, ours: boolean) {
    const worldId = worldOfMap(ACTIVE_MAP);
    if (!canLeadWarFormation(worldId, e.realm)) return;
    const avail = ours ? B.outerRm : B.outerRf;
    if (avail < 12) return;
    const sameForms = this.battles.flatMap((b) => b.formations).filter((f) => !f.collapsed && f.ours === ours);
    const activeCount = B.formations.filter((f) => !f.collapsed && f.ours === ours).length;
    const w = this.S.wars.find((x) => x.id === B.war);
    const sideCount = w ? this.sideSects(w, ours ? B.side : (1 - B.side) as 0 | 1).length : 1;
    const maxForms = Math.min(7, Math.max(4, sideCount + 2));
    if (activeCount >= maxForms) return;
    // 按我方/敌方可用战兵池均匀拆分为多座战阵（避免首队一口吞完 100~200 兵导致只出战 1 队）
    const activeAttachedSoldiers = B.formations
      .filter((f) => !f.collapsed && f.ours === ours)
      .reduce((s, f) => s + f.soldiersMax, 0);
    const totalPool = avail + activeAttachedSoldiers;
    const desiredForms = totalPool >= 24 ? clamp(Math.ceil(totalPool / 55), 2, maxForms) : 1;
    const remSlots = Math.max(1, desiredForms - activeCount);
    let want = Math.min(avail, Math.max(12, Math.round(avail / remSlots)));
    if (avail > 160 && activeCount + 1 < maxForms) want = Math.min(want, 150);
    if (avail - want < 12) want = avail;
    if (want < 12) return;
    if (ours) B.outerRm -= want; else B.outerRf -= want;
    const combatPat = this.patternOf(sid, ours, activeCount);
    const pat: FormPattern = combatPat;
    const curBounds = formationBounds(pat, want);
    const maxBounds = formationBounds(combatPat, want);
    const estBounds = {
      rx: Math.max(curBounds.rx, maxBounds.rx),
      ry: Math.max(curBounds.ry, maxBounds.ry),
    };
    // 敌我两军沿着 B.ea 阵线轴单排一字横向展开（4~7 阵全部平铺在前排，避免后排滞留发呆，按真实旋转投影宽度动态留白）
    const ux = Math.cos(B.ea), uy = Math.sin(B.ea);
    const px = -uy, py = ux;
    const projLat = Math.hypot(px * estBounds.rx, py * estBounds.ry);
    const projDep = Math.hypot(ux * estBounds.rx, uy * estBounds.ry);
    const wingStride = Math.max(780, projLat * 2 + 220);
    const frontLineDepth = Math.max(760, projDep + 520);
    const singleRowSlots = [0, 1, -1, 2, -2, 3, -3, 4, -4];
    const slotOrder = singleRowSlots[activeCount] ?? (activeCount % 2 === 1 ? Math.ceil(activeCount / 2) : -Math.ceil(activeCount / 2));
    let latOffset = slotOrder * wingStride;
    let lineDepth = ours ? -frontLineDepth : frontLineDepth;
    const isOpening = B.stage === 'muster' || B.stage === 'march' || B.stage === 'standoff';
    let targetX = B.x + ux * lineDepth + px * latOffset;
    let targetY = B.y + uy * lineDepth + py * latOffset;
    const checkSlotClear = (tx: number, ty: number) => {
      for (const o of sameForms) {
        const ob = rotatedFormationBounds(o);
        const sepX = estBounds.rx + ob.rx + 180;
        const sepY = estBounds.ry + ob.ry + 180;
        const ox = o.deployTargetX ?? o.x, oy = o.deployTargetY ?? o.y;
        if (Math.hypot((tx - ox) / sepX, (ty - oy) / sepY) < 1.0) return false;
      }
      return true;
    };
    if (!checkSlotClear(targetX, targetY)) {
      for (const s of singleRowSlots) {
        const tryLat = s * wingStride;
        const tryDep = ours ? -frontLineDepth : frontLineDepth;
        const tx = B.x + ux * tryDep + px * tryLat;
        const ty = B.y + uy * tryDep + py * tryLat;
        if (checkSlotClear(tx, ty)) {
          latOffset = tryLat;
          lineDepth = tryDep;
          targetX = tx;
          targetY = ty;
          break;
        }
      }
    }
    const formSide: 0 | 1 = ours ? B.side : (1 - B.side) as 0 | 1;
    const campOrg = this.campDispatchOrigin(w, formSide, B.x, B.y, B.ea, 2100);
    // 开战集结与行军阶段：从大营附近侧翼展开摆好阵型，随后统一列阵开拔至前线作战位；战中增援亦由大营方向驰援
    const fx = isOpening
      ? campOrg.x + px * latOffset * 0.72
      : campOrg.x * 0.45 + (B.x + ux * lineDepth + px * latOffset) * 0.55;
    const fy = isOpening
      ? campOrg.y + py * latOffset * 0.72
      : campOrg.y * 0.45 + (B.y + uy * lineDepth + py * latOffset) * 0.55;
    e.x = fx;
    e.y = fy;
    e.hx = isOpening ? targetX : fx;
    e.hy = isOpening ? targetY : fy;
    e.hunt = false;
    if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; }
    (e as any).warFormLeader = true;
    const initFaceAng = ours ? B.ea : B.ea + Math.PI;
    const initFace = Math.cos(initFaceAng) >= 0 ? 1 : -1;
    const initFaceY: 1 | -1 = Math.sin(initFaceAng) < -0.25 ? -1 : 1;
    const doc = this.doctrine(sid);
    const homeLoc = LOC_BY_ID.get(sid);
    const rx = homeLoc && homeLoc.map === ACTIVE_MAP ? homeLoc.x * WORLD_SCALE : B.x + Math.cos(B.ea) * (ours ? -2400 : 2400);
    const ry = homeLoc && homeLoc.map === ACTIVE_MAP ? homeLoc.y * WORLD_SCALE : B.y + Math.sin(B.ea) * (ours ? -2400 : 2400);
    const advMult = ours ? B.advM : B.advF;
    const form: WarFormation = {
      id: B.formSeq++,
      sid,
      sectName: this.name(sid),
      sideLabel: ours ? '我方' : '敌方',
      ours,
      leader: e,
      pattern: pat,
      desiredPattern: combatPat,
      slotLineLat: latOffset,
      slotLineDepth: lineDepth,
      lineAxisAng: B.ea,
      school: this.schoolOf(sid),
      soldiers: want,
      soldiersMax: want,
      deadCount: 0,
      injCount: 0,
      routedCount: 0,
      volleyCd: 1.1 + Math.random() * 0.9,
      collapsed: false,
      collapseT: 0,
      x: fx,
      y: fy,
      anchorX: fx,
      anchorY: fy,
      prevLeaderX: e.x,
      prevLeaderY: e.y,
      face: initFace,
      faceY: initFaceY,
      faceAng: initFaceAng,
      targetFaceAng: initFaceAng,
      doctrineAtk: +(doc.atk * (0.85 + advMult * 0.15)).toFixed(3),
      doctrineDef: +(doc.def * (0.85 + advMult * 0.15)).toFixed(3),
      realm: e.realm,
      retreatX: rx,
      retreatY: ry,
      customUniform: sid === MY ? this.game.ws.mySect?.uniform : undefined,
      musterT: B.stage === 'muster' ? Math.max(1.2, B.stageT) + Math.floor(activeCount / 2) * 0.65 : 0,
      holdFire: B.stage !== 'clash',
      deployTargetX: isOpening ? targetX : undefined,
      deployTargetY: isOpening ? targetY : undefined,
      extinction: (B.ma === 'all' && B.md === 'all') || (B.gate && !B.zhen),
    };
    const sh = ensureFormationShield(form);
    if (advMult !== 1) {
      sh.shieldMax = Math.max(200, Math.round(sh.shieldMax * advMult));
      sh.shield = Math.min(sh.shieldMax, Math.round(sh.shield * advMult));
      form.shieldMax = sh.shieldMax;
      form.shield = sh.shield;
    }
    (e as any).warForm = form;
    B.formations.push(form);
  }
  /** 增援：开局自大营方向出阵摆好阵型再行军前压，战中增援亦沿大营进兵路驰援入阵（绝不在战心凭空闪现） */
  private reinforce(B: Live, nf: number, nm: number) {
    const g = this.game;
    const w = this.S.wars.find((x) => x.id === B.war); if (!w) return;
    const mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a;
    const ux = Math.cos(B.ea), uy = Math.sin(B.ea);
    const px = -uy, py = ux;
    const foeSide: 0 | 1 = (1 - B.side) as 0 | 1;
    const isOpening = B.stage === 'muster' || B.stage === 'march';
    const campM = this.campDispatchOrigin(w, B.side, B.x, B.y, B.ea, isOpening ? 2100 : 1450);
    const campF = this.campDispatchOrigin(w, foeSide, B.x, B.y, B.ea, isOpening ? 2100 : 1450);
    for (let k = 0; k < nf && B.rf.length; k++) {
      const u = B.rf.shift()!;
      const usid = u.sid ?? foe;
      const lat = (nf > 1 ? ((k / Math.max(1, nf - 1)) - 0.5) * 960 : 0) + rand(-65, 65);
      const sx = campF.x + px * lat * 0.72, sy = campF.y + py * lat * 0.64;
      const tx = B.x + ux * rand(560, 760) + px * lat, ty = B.y + uy * rand(560, 760) + py * lat * 0.8;
      const e = this.spawn(usid, u, sx, sy, false, false);
      if (e) {
        e.hx = tx; e.hy = ty;
        B.foes.push(e);
        if (Math.random() < 0.22) e.hunt = true;
        this.maybeAttachFormation(B, e, usid, false);
      }
    }
    for (let k = 0; k < nm && B.rm.length; k++) {
      const u = B.rm.shift()!;
      const usid = u.sid ?? mine;
      const lat = (nm > 1 ? ((k / Math.max(1, nm - 1)) - 0.5) * 860 : 0) + rand(-55, 55);
      const sx = campM.x + px * lat * 0.72, sy = campM.y + py * lat * 0.64;
      const tx = B.x - ux * rand(220, 420) + px * lat, ty = B.y - uy * rand(220, 420) + py * lat * 0.8;
      const e = this.spawn(usid, u, sx, sy, true);
      if (e) {
        e.hx = tx; e.hy = ty;
        B.allies.push(e);
        this.maybeAttachFormation(B, e, usid, true);
      }
    }
  }
  /** 两翼：没轮到上场的核心与外门后备，按战力互有折损（外门按三分账入库） */
  private wings(B: Live, w: SWar, mine: string, foe: string) {
    const sum = (us: Unit[], outN: number) => us.reduce((v, u) => v + pwOf(u), 0) + outN * OUTER_UNIT_PW;
    const atk = w.ini === B.side, dm = this.doctrine(mine), df = this.doctrine(foe);
    const pm = Math.max(0.01, sum(B.rm, B.outerRm) * (atk ? dm.atk : dm.def));
    const pf = Math.max(0.01, sum(B.rf, B.outerRf) * (atk ? df.def : df.atk));
    const k = Math.sqrt(clamp(pf / pm, 0.2, 5));
    if (B.rm.length && B.rf.length) {
      const base = Math.max(1, Math.round(Math.min(B.rm.length, B.rf.length) * 0.04));
      const allowCausal = B.ma === 'all' && B.md === 'all';
      const fell = (us: Unit[], sid: string, n: number) => {
        let c = 0;
        for (let i = 0; i < n && us.length; i++) {
          const j = Math.floor(Math.random() * us.length), u = us[j];
          if (!allowCausal && this.isProtectedCausal(sid, u.ref)) continue;
          if (u.realm >= 3 && Math.random() < 0.7) continue;
          us.splice(j, 1); this.kill(sid, [u.ref]); c++;
          if (sid === w.a) w.la++; else w.lb++;
        }
        return c;
      };
      B.km += fell(B.rm, mine, Math.round(base * k * rand(0.5, 1.4)));
      B.kf += fell(B.rf, foe, Math.round((base / k) * rand(0.5, 1.4)));
    }
    if (B.outerRm > 0 && B.outerRf > 0) {
      const isExt = (B.ma === 'all' && B.md === 'all') || (B.gate && !B.zhen);
      const dRate = isExt ? 0.48 : 0.22;
      const jRate = isExt ? 0.32 : 0.48;
      const oBase = Math.max(2, Math.round(Math.min(B.outerRm, B.outerRf) * 0.045));
      const oCutM = Math.min(B.outerRm, Math.round(oBase * k * rand(0.6, 1.3)));
      const oCutF = Math.min(B.outerRf, Math.round((oBase / k) * rand(0.6, 1.3)));
      B.outerRm -= oCutM; B.outerRf -= oCutF;
      const dM = Math.round(oCutM * dRate), jM = Math.round(oCutM * jRate);
      const dF = Math.round(oCutF * dRate), jF = Math.round(oCutF * jRate);
      this.damageOuterPool(mine, dM, jM); this.damageOuterPool(foe, dF, jF);
      B.outerKm += dM; B.outerJm += jM; B.km += dM + jM;
      B.outerKf += dF; B.outerJf += jF; B.kf += dF + jF;
      if (mine === w.a) { w.la += dM + jM; w.lb += dF + jF; } else { w.lb += dM + jM; w.la += dF + jF; }
    }
  }
  private syncFormationLosses(B: Live, w: SWar, mine: string, foe: string) {
    for (const f of B.formations) {
      const prevD = (f as any)._d ?? 0, prevJ = (f as any)._j ?? 0;
      const dD = f.deadCount - prevD, dJ = f.injCount - prevJ;
      if (dD > 0 || dJ > 0) {
        (f as any)._d = f.deadCount; (f as any)._j = f.injCount;
        this.damageOuterPool(f.sid, dD, dJ);
        const tot = dD + dJ;
        if (f.ours) { B.outerKm += dD; B.outerJm += dJ; B.km += tot; }
        else { B.outerKf += dD; B.outerJf += dJ; B.kf += tot; }
        if (f.sid === w.a) w.la += tot; else w.lb += tot;
      }
    }
    void mine; void foe;
  }
  private battleTick(B: Live, dt: number) {
    const g = this.game, p = g.player, w = this.S.wars.find((x) => x.id === B.war);
    if (!w) { this.removeBattleForWar(B.war); return; }
    const mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a;
    // 阵亡清点：倒下一个核心，名册上划掉一个
    for (const e of [...B.foes, ...B.allies]) if (e.dead && !(e as any).warCounted) {
      (e as any).warCounted = true;
      const r = (e as any).warRos as [string, number] | undefined, isFoe = B.foes.includes(e);
      if (r) { this.kill(r[0], [r[1]]); if (r[0] === w.a) w.la++; else w.lb++; if (isFoe && !e.npcKill && B.kf < 20) g.rel.addSect(r[0], -1.5); }
      if ((e as any).swDs !== undefined) { this.kill(MY, [(e as any).swDs]); if (w.a === MY) w.la++; else w.lb++; }
      if ((e as any).swOuterCapSid) { const osid = (e as any).swOuterCapSid as string; this.damageOuterPool(osid, 1, 0); if (osid === w.a) w.la++; else w.lb++; }
      if (isFoe) B.kf++; else B.km++;
      if (isFoe && !e.spar && !e.npcKill) {
        const m = e.boss ? 30 : 6 + e.realm * 3;
        g.war.merit += m;
        if (e.boss) g.combat.texts.push({ x: e.x, y: e.y - 90, s: `战功 +${m}`, color: '#ffd27a', t: 0, vy: -36 });
      }
    }
    // 百人战阵 tick（仅合入同战区 10000px 内近邻战事，避免跨大陆 O(F²) 互算距离）
    const order = this.battleOrderNow();
    let allFormations = B.formations;
    let allAirships = B.airships;
    if (this.battles.length > 1) {
      const nearF: WarFormation[] = [];
      const nearS: WarAirship[] = [];
      for (const b of this.battles) {
        if (b !== B && Math.hypot(b.x - B.x, b.y - B.y) > 10000) continue;
        for (const bf of b.formations) nearF.push(bf);
        for (const bs of b.airships) nearS.push(bs);
      }
      allFormations = nearF;
      allAirships = nearS;
    }
    for (const f of B.formations) tickFormation(f, g, dt, allFormations, order);
    // 浮空战船（飞舟）推进：护盾/炮击/防空连弩/战鼓增益/30秒断船残骸
    for (const ship of B.airships) {
      tickWarAirship(ship, dt, g, allAirships, allFormations, B.foes, B.allies, B.stage !== 'clash');
      if (ship.sunk) this.handleAirshipBattleAccounting(ship, false);
      if (!ship.sunk) {
        for (let i = 0; i < ship.escorts.length; i++) {
          const esc = ship.escorts[i];
          if (esc.dead || esc.gone) continue;
          const ang = g.time * 0.45 + (i / Math.max(1, ship.escorts.length)) * Math.PI * 2;
          esc.hx = ship.x + Math.cos(ang) * 195;
          esc.hy = ship.y + Math.sin(ang) * 125;
        }
      }
    }
    B.airships = B.airships.filter((s) => !s.sunk || s.wreckT > 0);
    this.syncFormationLosses(B, w, mine, foe);
    B.formations = B.formations.filter((f) => !f.collapsed || f.collapseT > 0);
    B.foes = B.foes.filter((e) => !e.dead && g.combat.enemies.includes(e));
    B.allies = B.allies.filter((e) => !e.dead && !e.gone);
    const nf = B.foes.length, nm = B.allies.length;

    // 三段列阵开战状态机：1) muster 后阵集结成阵 → 2) march 齐步推进至阵线 → 3) standoff 阵前叫阵对峙 → 4) clash 全面开火
    const activateClash = () => {
      B.stage = 'clash'; B.stageT = 0; B.standoffT = 0;
      for (const f of B.formations) {
        f.holdFire = false;
        f.deployTargetX = undefined;
        f.deployTargetY = undefined;
        const targetPat = f.desiredPattern ?? this.patternOf(f.sid, f.ours);
        if (f.pattern !== targetPat) {
          const prevRatio = f.shieldMax ? Math.min(1, (f.shield ?? 0) / f.shieldMax) : 1;
          f.pattern = targetPat;
          f.shieldMax = undefined;
          f.shieldRegen = undefined;
          const sh = ensureFormationShield(f);
          f.shield = Math.round(sh.shieldMax * prevRatio);
        }
      }
      for (const e of [...B.allies, ...B.foes]) (e as any).warStandoff = false;
    };
    const faceAll = Math.cos(B.ea) >= 0 ? 1 : -1;
    const foeVanguardGone = nf === 0 && B.rf.length === 0 && B.formations.every((f) => f.ours || f.collapsed || f.soldiers <= 0);
    if (B.stage !== 'clash' && foeVanguardGone) {
      activateClash();
    }
    if (B.stage === 'muster') {
      B.stageT -= dt;
      for (const f of B.formations) f.holdFire = true;
      for (const e of B.allies) { (e as any).warStandoff = true; (e as any).warStandoffFace = faceAll; }
      for (const e of B.foes) { (e as any).warStandoff = true; (e as any).warStandoffFace = -faceAll; }
      if (B.stageT <= 0) {
        B.stage = 'march';
        B.stageT = 2.2;
        for (const ship of B.airships) {
          if ((ship as any).deployTx !== undefined && (ship as any).deployTy !== undefined) {
            ship.tx = (ship as any).deployTx;
            ship.ty = (ship as any).deployTy;
            turnAirshipToward(ship, ship.tx - ship.x, ship.ty - ship.y, 0, { forceTarget: true });
          }
        }
        g.toast('战兵与战船于营前摆好阵势，统一列阵开赴战场！', 'info');
      }
    } else if (B.stage === 'march') {
      B.stageT -= dt;
      for (const f of B.formations) f.holdFire = true;
      for (const e of B.allies) { (e as any).warStandoff = true; (e as any).warStandoffFace = faceAll; }
      for (const e of B.foes) { (e as any).warStandoff = true; (e as any).warStandoffFace = -faceAll; }
      if (B.stageT <= 0) {
        // 保留每阵战术部署槽位（deployTargetX/Y），阵前叫阵对峙期全军整齐分排横阵站定
        B.stage = 'standoff';
        B.stageT = B.standoffT;
        const myChamp = B.allies.find((e) => !(e as any).warForm) ?? B.allies[0];
        if (myChamp) g.combat.texts.push({ x: myChamp.x, y: myChamp.y - 120, s: `「${this.sideName(w, B.side)}在此，何人敢来破阵！」`, color: '#bfe3ff', source: myChamp, t: 0, vy: -22, big: true });
      }
    } else if (B.stage === 'standoff') {
      B.standoffT = Math.max(0, B.standoffT - dt);
      B.stageT = B.standoffT;
      for (const f of B.formations) f.holdFire = true;
      for (const e of B.allies) {
        if ((e as any).warForm || e.realm < 2) { (e as any).warStandoff = false; continue; }
        const hitOrClose = e.hp < e.maxHp * 0.96 || (e.grudge && !e.grudge.dead && Math.hypot(e.grudge.x - e.x, e.grudge.y - e.y) < 340);
        (e as any).warStandoff = !hitOrClose;
        (e as any).warStandoffFace = faceAll;
      }
      for (const e of B.foes) {
        if ((e as any).warForm || e.realm < 2) { (e as any).warStandoff = false; continue; }
        const hitOrClose = e.hp < e.maxHp * 0.96 || (g.time - e.lastHitBy < 3) || Math.hypot(e.x - p.x, e.y - p.y) < 320;
        (e as any).warStandoff = !hitOrClose;
        (e as any).warStandoffFace = -faceAll;
      }
      if (!B.parleyStep && B.standoffT <= 2.6) {
        B.parleyStep = 1;
        const foeChamp = B.foes.find((e) => !(e as any).warForm) ?? B.foes[0];
        if (foeChamp) g.combat.texts.push({ x: foeChamp.x, y: foeChamp.y - 120, s: `「休要狂言，且看我${this.sideName(w, (1 - B.side) as 0 | 1)}大阵锋芒！」`, color: '#ffb4a0', source: foeChamp, t: 0, vy: -22, big: true });
      }
      const rushedFoe = B.formations.some((f) => !f.ours && !f.collapsed && isPointInFormation(f, p.x, p.y, 120));
      if (B.standoffT <= 0 || rushedFoe) {
        activateClash();
        const champ = B.foes.find((e) => !(e as any).warForm && e.realm >= 2) ?? B.allies.find((e) => !(e as any).warForm && e.realm >= 2);
        if (champ) g.combat.texts.push({ x: champ.x, y: champ.y - 120, s: rushedFoe ? '抢攻破阵 · 全军杀！' : '战鼓雷鸣 · 变阵交锋！', color: '#ffd888', source: champ, t: 0, vy: -26, big: true });
      }
    } else {
      for (const f of B.formations) {
        f.holdFire = false;
        const targetPat = f.desiredPattern ?? this.patternOf(f.sid, f.ours);
        if (f.pattern !== targetPat) {
          const prevRatio = f.shieldMax ? Math.min(1, (f.shield ?? 0) / f.shieldMax) : 1;
          f.pattern = targetPat;
          f.shieldMax = undefined;
          f.shieldRegen = undefined;
          const sh = ensureFormationShield(f);
          f.shield = Math.round(sh.shieldMax * prevRatio);
        }
      }
      for (const e of [...B.allies, ...B.foes]) (e as any).warStandoff = false;
    }

    // 身死 / 真正远遁跨区（按当前视口半对角线动态兜底，防止拉远缩放时战场仍在屏幕内就被强制撤场）
    const lvBattle = getLastBattleView();
    const viewHalfDiag = lvBattle ? Math.hypot((lvBattle.right - lvBattle.left) * 0.5, (lvBattle.bottom - lvBattle.top) * 0.5) : 0;
    const leaveDist = Math.max(12500, viewHalfDiag + 3200);
    if (g.hero.dead || Math.hypot(B.x - p.x, B.y - p.y) > leaveDist) { this.finish(B, w, false, g.hero.dead ? '你重伤败退' : '你远遁离开了战区'); return; }
    B.rt -= dt; if (B.rt <= 0) { B.rt = 1; this.reinforce(B, Math.min(5, FIELD_F - nf), Math.min(5, FIELD_M - nm)); }
    B.st -= dt; if (B.st <= 0) { B.st = rand(10, 15); if ((B.rm.length || B.outerRm > 0) && (B.rf.length || B.outerRf > 0)) this.wings(B, w, mine, foe); }
    // 助威：喊杀声
    B.ft -= dt;
    if (B.ft <= 0 && B.stage === 'clash') {
      B.ft = 1.4; const all = [...B.foes, ...B.allies];
      if (all.length) { const e = pick(all), ours = B.allies.includes(e); g.combat.texts.push({ x: e.x, y: e.y - 110, s: pick(ours ? ['杀！', '随宗主冲阵！', '护我山门！', '斩！'] : ['杀！', '踏平他们！', '休走！', '纳命来！']), color: ours ? '#bfe3ff' : '#ffb4a0', source: e, t: 0, vy: -30 }); }
    }

    // Tier 2 & Tier 3 分层登场：仅在全面交锋（clash）且战局进入危急/末期时才投入结丹统帅，非存亡大战绝不刷压轴 Boss
    const big = B.ma === 'all' && B.md === 'all';
    const isExtinction = big || (B.gate && !B.zhen);
    const activeFoeForms = B.formations.filter((f) => !f.ours && !f.collapsed && f.soldiers > 0);
    const activeAllyForms = B.formations.filter((f) => f.ours && !f.collapsed && f.soldiers > 0);
    B.fForms0 = Math.max(B.fForms0 ?? 0, B.formations.filter((f) => !f.ours).length);
    B.mForms0 = Math.max(B.mForms0 ?? 0, B.formations.filter((f) => f.ours).length);
    const foeFormsTotal = B.fForms0;
    const allyFormsTotal = B.mForms0;
    const ux = Math.cos(B.ea), uy = Math.sin(B.ea), px = -uy, py = ux;

    if (B.stage === 'clash') {
      const foeCrisis = (foeFormsTotal > 0 && activeFoeForms.length <= Math.floor(foeFormsTotal * 0.5))
        || B.kf >= Math.max(8, B.f0 * 0.45)
        || (B.rf.length === 0 && nf <= 2);
      if (!B.cmdDeployedF && B.cmdRf.length > 0 && foeCrisis) {
        B.cmdDeployedF = true;
        const names: string[] = [];
        const weakAllyForm = activeAllyForms.slice().sort((a, b) => ((a.shield ?? 0) / Math.max(1, a.shieldMax ?? 1)) - ((b.shield ?? 0) / Math.max(1, b.shieldMax ?? 1)))[0];
        for (let k = 0; k < 3 && B.cmdRf.length; k++) {
          const u = B.cmdRf.shift()!;
          const usid = u.sid ?? foe;
          const sx = B.x + ux * rand(560, 760) + px * ((k - 1) * 260);
          const sy = B.y + uy * rand(560, 760) + py * ((k - 1) * 200);
          const e = this.spawn(usid, u, sx, sy, false, false);
          if (e) {
            // 第一名敌方统帅直扑主角/战心，其余统帅分兵协同压制我方护盾受损或中坚战阵
            if (k > 0 && weakAllyForm) {
              e.hx = weakAllyForm.x; e.hy = weakAllyForm.y; e.hunt = true;
            } else {
              e.hx = B.x; e.hy = B.y; e.hunt = true;
            }
            B.foes.push(e);
            names.push(e.shortName ?? e.name);
            g.combat.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 95, t: 0, dur: 0.5, color: '255,155,115' });
          }
        }
        if (names.length) g.toast(`【危机救阵】敌方统帅长老「${names.join('、')}」见前线告急，分兵督战破局！`, 'warn');
      }

      const allyCrisis = (allyFormsTotal > 0 && activeAllyForms.length <= Math.floor(allyFormsTotal * 0.5))
        || B.km >= Math.max(8, B.m0 * 0.45)
        || (B.rm.length === 0 && nm <= 2);
      if (!B.cmdDeployedM && B.cmdRm.length > 0 && allyCrisis) {
        B.cmdDeployedM = true;
        const names: string[] = [];
        for (let k = 0; k < 3 && B.cmdRm.length; k++) {
          const u = B.cmdRm.shift()!;
          const usid = u.sid ?? mine;
          const sx = B.x - ux * rand(280, 420) + px * ((k - 1) * 240);
          const sy = B.y - uy * rand(280, 420) + py * ((k - 1) * 180);
          const e = this.spawn(usid, u, sx, sy, true, false);
          if (e) {
            e.hx = B.x; e.hy = B.y;
            B.allies.push(e);
            names.push(e.shortName ?? e.name);
            g.combat.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 95, t: 0, dur: 0.5, color: '150,220,255' });
          }
        }
        if (names.length) g.toast(`【统帅亲临】我方「${names.join('、')}」御剑压阵前来破局！`, 'good');
      }

      // 战场实时统帅指挥：1) 动态变阵适应敌我护盾态势；2) 统帅在场定期发动「帅旗鼓舞」回盾回灵
      let aiCmdT = ((B as any)._aiCmdT ?? 6.5) - dt;
      if (aiCmdT <= 0) {
        aiCmdT = 7.0;
        if (activeFoeForms.length && activeAllyForms.length) {
          const allyHeavyDef = activeAllyForms.filter((f) => f.pattern === 'square' || f.pattern === 'circle').length >= Math.ceil(activeAllyForms.length * 0.5);
          const foeLowSh = activeFoeForms.filter((f) => (f.brokenT ?? 0) > 0 || (f.shield ?? 0) < (f.shieldMax ?? 1) * 0.4).length >= Math.ceil(activeFoeForms.length * 0.5);
          for (let i = 0; i < activeFoeForms.length; i++) {
            const f = activeFoeForms[i];
            const nextPat: FormPattern = foeLowSh
              ? (i % 2 === 0 ? 'square' : 'bagua')
              : allyHeavyDef
                ? (i % 2 === 0 ? 'arrow' : 'crane')
                : this.patternOf(f.sid, false, i);
            if (f.desiredPattern !== nextPat) f.desiredPattern = nextPat;
          }
          // 若己方未在宗门面板锁定单一死阵型（!this.S.myPattern），友军统帅同样顺势变阵对敌
          if (!this.S.myPattern) {
            const foeHeavyDef = activeFoeForms.filter((f) => f.pattern === 'square' || f.pattern === 'circle').length >= Math.ceil(activeFoeForms.length * 0.5);
            const allyLowSh = activeAllyForms.filter((f) => (f.brokenT ?? 0) > 0 || (f.shield ?? 0) < (f.shieldMax ?? 1) * 0.4).length >= Math.ceil(activeAllyForms.length * 0.5);
            for (let i = 0; i < activeAllyForms.length; i++) {
              const f = activeAllyForms[i];
              const nextPat: FormPattern = allyLowSh
                ? (i % 2 === 0 ? 'square' : 'bagua')
                : foeHeavyDef
                  ? (i % 2 === 0 ? 'arrow' : 'crane')
                  : this.patternOf(f.sid, true, i);
              if (f.desiredPattern !== nextPat) f.desiredPattern = nextPat;
            }
          }
        }
      }
      (B as any)._aiCmdT = aiCmdT;

      // 敌方高阶统帅帅旗鼓舞（每 16s）：为未崩溃敌阵回复 18% 护盾与 25% 灵力
      if ((B.cmdDeployedF || B.foes.some((e) => !e.dead && e.realm >= 3)) && activeFoeForms.length) {
        let rallyCdF = ((B as any)._aiRallyCdF ?? 12.0) - dt;
        if (rallyCdF <= 0) {
          rallyCdF = 16.0;
          for (const f of activeFoeForms) {
            const smax = f.shieldMax ?? 500;
            f.shield = Math.min(smax, (f.shield ?? 0) + Math.round(smax * 0.18));
            f.mp = Math.min(f.mpMax ?? 200, (f.mp ?? 0) + Math.round((f.mpMax ?? 200) * 0.25));
            f.exhaustT = 0;
            g.combat.vfx.push({ kind: 'ring', x: f.x, y: f.y, r: 120, t: 0, dur: 0.45, color: '255,170,115', fx: 'shock' as any });
          }
          const cmdLeader = B.foes.find((e) => !e.dead && e.realm >= 3) ?? activeFoeForms[0].leader;
          g.combat.texts.push({ x: cmdLeader.x, y: cmdLeader.y - 115, s: '「敌将挥旗鼓阵 · 盾灵齐振！」', color: '#ffb98a', source: cmdLeader, t: 0, vy: -24, big: true });
        }
        (B as any)._aiRallyCdF = rallyCdF;
      }

      // 我方高阶统帅帅旗鼓舞（每 16s）：为未崩溃友阵回复 18% 护盾与 25% 灵力
      if ((B.cmdDeployedM || B.allies.some((e) => !e.dead && !e.gone && e.realm >= 3)) && activeAllyForms.length) {
        let rallyCdM = ((B as any)._aiRallyCdM ?? 10.0) - dt;
        if (rallyCdM <= 0) {
          rallyCdM = 16.0;
          for (const f of activeAllyForms) {
            const smax = f.shieldMax ?? 500;
            f.shield = Math.min(smax, (f.shield ?? 0) + Math.round(smax * 0.18));
            f.mp = Math.min(f.mpMax ?? 200, (f.mp ?? 0) + Math.round((f.mpMax ?? 200) * 0.25));
            f.exhaustT = 0;
            g.combat.vfx.push({ kind: 'ring', x: f.x, y: f.y, r: 120, t: 0, dur: 0.45, color: '130,220,255', fx: 'shock' as any });
          }
          const cmdLeader = B.allies.find((e) => !e.dead && !e.gone && e.realm >= 3) ?? activeAllyForms[0].leader;
          g.combat.texts.push({ x: cmdLeader.x, y: cmdLeader.y - 115, s: '「我军帅旗重振 · 护盾回灵！」', color: '#a8e6ff', source: cmdLeader, t: 0, vy: -24, big: true });
        }
        (B as any)._aiRallyCdM = rallyCdM;
      }

      // 仅存亡/灭宗大战（big || gate）在最后关头额外压轴护宗老祖/宗主 Boss（若无二阶结丹统帅在编，也直接准许压轴出阵，绝不死锁）
      if (isExtinction && (B.cmdDeployedF || B.cmdRf.length === 0) && !B.bossDeployedF && B.bossRf.length > 0 && B.rf.length === 0 && nf <= 3 && activeFoeForms.length <= 1) {
        B.bossDeployedF = true;
        while (B.bossRf.length) {
          const u = B.bossRf.shift()!;
          const usid = u.sid ?? foe;
          const sx = B.x + ux * 680, sy = B.y + uy * 680;
          const e = this.spawn(usid, u, sx, sy, false, true);
          if (e) {
            e.hx = B.x; e.hy = B.y; e.hunt = true;
            B.foes.push(e);
            g.combat.vfx.push({ kind: 'ring', x: e.x, y: e.y, r: 160, t: 0, dur: 0.65, color: '255,110,95', fx: 'shock' as any });
            g.toast(`【存亡死战】${e.name}携护宗底牌亲自下场，誓不退半步！`, 'warn');
          }
        }
      }
    }
    // 残敌合围：当敌阵与援军已清、仅余散落敌修远离战心时，牵引双方合围交锋，防止漏网散兵拖死战局
    if (B.stage === 'clash' && B.rf.length === 0 && activeFoeForms.length === 0 && nf > 0 && B.allies.length > 0) {
      const tgt = B.foes[0];
      for (const e of B.foes) {
        if (Math.hypot(e.x - B.x, e.y - B.y) > 880) {
          e.hx = B.x; e.hy = B.y; e.hunt = true;
        }
      }
      for (const a of B.allies) {
        if (!a.dead && !a.gone) {
          a.hx = tgt.x; a.hy = tgt.y; a.hunt = true;
        }
      }
    }

    // 胜负：只有在场核心、结丹统帅、存亡压轴 Boss 与在场战阵皆已破尽时，才会触发外门余众散兵/溃退
    // 敌方核心全灭时，我方高阶同门转而集火围攻尚存敌阵，不再站在原地发呆
    if (B.stage === 'clash' && nf === 0 && B.rf.length === 0 && (!B.cmdDeployedF ? B.cmdRf.length === 0 : true) && activeFoeForms.length > 0 && B.allies.length > 0) {
      const targetForm = activeFoeForms[0];
      let strikeAcc = ((B as any)._allyFormCd ?? 0) - dt;
      if (strikeAcc <= 0) {
        strikeAcc = 1.0;
        let sumDmg = 0;
        let maxRealm = 1;
        for (const a of B.allies) {
          if (a.dead || a.gone) continue;
          const dx = targetForm.x - a.x, dy = targetForm.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d > 420) {
            a.x += (dx / d) * Math.min(d - 320, 220);
            a.y += (dy / d) * Math.min(d - 320, 220);
          }
          sumDmg += 22 + a.realm * a.realm * 14;
          if (a.realm > maxRealm) maxRealm = a.realm;
        }
        if (sumDmg > 0) {
          applyFormationDamage(targetForm, sumDmg, maxRealm, g, { school: '剑', order, fromNpc: true, hitX: targetForm.x, hitY: targetForm.y });
          g.combat.vfx.push({ kind: 'ring', x: targetForm.x, y: targetForm.y, r: 95, t: 0, dur: 0.35, color: '130,215,255', fx: 'shock' as any });
        }
      }
      (B as any)._allyFormCd = strikeAcc;
    }
    // 敌方高阶或空闲散修在压制我方前排散兵时，亦协同集火我方护盾最薄的活跃战阵（避免敌修只会盲目追人）
    if (B.stage === 'clash' && nm <= 2 && B.rm.length === 0 && activeAllyForms.length > 0 && B.foes.length > 0) {
      const targetAllyForm = activeAllyForms.slice().sort((a, b) => ((a.shield ?? 0) / Math.max(1, a.shieldMax ?? 1)) - ((b.shield ?? 0) / Math.max(1, b.shieldMax ?? 1)))[0];
      let foeStrikeAcc = ((B as any)._foeFormCd ?? 0) - dt;
      if (foeStrikeAcc <= 0) {
        foeStrikeAcc = 1.15;
        let sumDmg = 0;
        let maxRealm = 1;
        for (const fUnit of B.foes) {
          if (fUnit.dead || (fUnit as any).warForm) continue;
          const dx = targetAllyForm.x - fUnit.x, dy = targetAllyForm.y - fUnit.y, d = Math.hypot(dx, dy) || 1;
          if (d > 440) {
            fUnit.x += (dx / d) * Math.min(d - 340, 210);
            fUnit.y += (dy / d) * Math.min(d - 340, 210);
          }
          sumDmg += 20 + fUnit.realm * fUnit.realm * 13;
          if (fUnit.realm > maxRealm) maxRealm = fUnit.realm;
        }
        if (sumDmg > 0) {
          applyFormationDamage(targetAllyForm, sumDmg, maxRealm, g, { school: '魔', order, fromNpc: true, hitX: targetAllyForm.x, hitY: targetAllyForm.y });
          g.combat.vfx.push({ kind: 'ring', x: targetAllyForm.x, y: targetAllyForm.y, r: 95, t: 0, dur: 0.35, color: '255,140,105', fx: 'shock' as any });
        }
      }
      (B as any)._foeFormCd = foeStrikeAcc;
    }
    if (B.stage === 'clash' && B.rf.length === 0 && B.cmdRf.length === 0 && (!isExtinction || B.bossRf.length === 0) && nf === 0 && activeFoeForms.length === 0 && B.outerRf > 0) {
      const rem = Math.min(8, B.outerRf);
      B.outerRf -= rem;
      for (let k = 0; k < rem; k++) {
        const lat = (rem > 1 ? ((k / (rem - 1)) - 0.5) * 620 : 0) + rand(-40, 40);
        const sx = B.x + ux * rand(460, 620) + px * lat, sy = B.y + uy * rand(460, 620) + py * lat * 0.72;
        const e = this.mkUnit(foe, sx, sy, 1, false, false, 1, B);
        if (e) { e.hx = B.x; e.hy = B.y; B.foes.push(e); }
        else { B.outerKf++; B.kf++; }
      }
      if (rem > 0 && !B.foes.length) B.outerRf = 0;
    }
    const activeFoeSoldiers = B.formations.reduce((s, f) => s + (!f.ours && !f.collapsed ? f.soldiers : 0), 0);
    const activeAllySoldiers = B.formations.reduce((s, f) => s + (f.ours && !f.collapsed ? f.soldiers : 0), 0);
    const activeFoeAirships = B.airships.filter((s) => !s.ours && !s.sunk);
    const activeAllyAirships = B.airships.filter((s) => s.ours && !s.sunk);
    const foeShipCrew = activeFoeAirships.reduce((s, sh) => s + Math.max(1, sh.crew), 0);
    const allyShipCrew = activeAllyAirships.reduce((s, sh) => s + Math.max(1, sh.crew), 0);
    // 若地面战阵与前线已尽破、敌方仍有浮空战船悬空，我方修士合力御空集火压制战船
    if (B.stage === 'clash' && nf === 0 && B.rf.length === 0 && activeFoeForms.length === 0 && activeFoeAirships.length > 0 && B.allies.length > 0) {
      let shipAcc = ((B as any)._allyShipCd ?? 0) - dt;
      if (shipAcc <= 0) {
        shipAcc = 1.0;
        const tgtShip = activeFoeAirships[0];
        let sumDmg = 0;
        let maxRealm = 1;
        for (const a of B.allies) {
          if (a.dead || a.gone) continue;
          const dx = tgtShip.x - a.x, dy = tgtShip.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d > 480) {
            a.x += (dx / d) * Math.min(d - 360, 220);
            a.y += (dy / d) * Math.min(d - 360, 220);
          }
          sumDmg += 24 + a.realm * a.realm * 14;
          if (a.realm > maxRealm) maxRealm = a.realm;
        }
        if (sumDmg > 0) {
          applyAirshipDamage(tgtShip, sumDmg, maxRealm, g, { fromNpc: true, school: '剑' });
          g.combat.vfx.push({ kind: 'ring', x: tgtShip.x, y: tgtShip.y - tgtShip.zLift * 0.7, r: 100, t: 0, dur: 0.35, color: '130,215,255', fx: 'shock' as any });
        }
      }
      (B as any)._allyShipCd = shipAcc;
    }
    if (B.stage === 'clash') B.clashT = (B.clashT ?? 0) + dt;
    const fLeft = B.rf.length + B.cmdRf.length + (isExtinction ? B.bossRf.length : 0) + B.foes.length + B.outerRf + activeFoeSoldiers + foeShipCrew;
    const mLeft = B.rm.length + B.cmdRm.length + B.allies.length + B.outerRm + activeAllySoldiers + allyShipCrew;
    const rout = !big && !B.zhen && B.f0 >= 10 && fLeft <= B.f0 * 0.25;
    const cmdRetreat = !isExtinction && B.stage === 'clash' && B.f0 >= 8 && (B.cmdDeployedF || B.cmdRf.length === 0) && (B.clashT ?? 0) >= 6 && (
      (activeFoeForms.length === 0 && (B.fForms0 ?? 0) > 0 && B.kf >= B.f0 * 0.42)
      || (fLeft <= B.f0 * 0.36 && mLeft >= Math.max(4, fLeft * 1.15))
    );
    if (fLeft > 0 && !rout && !cmdRetreat) { B.t = 0; return; }
    B.t += dt; if (B.t < 1.5) return;
    this.finish(B, w, true, cmdRetreat
      ? `${this.name(foe)}统帅见拉锯不利，鸣金收兵撤退，放弃${this.tgtName(w)}`
      : rout
        ? `${this.name(foe)}溃不成军，残部四散而逃`
        : `${this.name(foe)}出战之人尽数伏诛`);
  }
  private _standoffCache = new Map<number, { key: string; forms: WarFormation[] }>();

  /** 判定世界坐标是否处于宗门大战活跃前线/双方大营/在途行军区（严禁凭空刷出无关劫修与野生妖兽） */
  isWarZoneAt(x: number, y: number): boolean {
    const S = this.S;
    for (const B of this.battles) {
      if (Math.hypot(x - B.x, y - B.y) <= 3000) return true;
    }
    for (const w of S.wars) {
      if (w.fall) continue;
      const fp = this.frontPos(w);
      if (fp && fp.map === ACTIVE_MAP && Math.hypot(x - fp.x, y - fp.y) <= 2800) return true;
      for (const sIdx of [0, 1] as const) {
        const cmp = sIdx === 0 ? w.campA : w.campB;
        if (cmp && cmp.map === ACTIVE_MAP && Math.hypot(x - cmp.x, y - cmp.y) <= 2100) return true;
      }
      const attr = w.attrition;
      if (attr?.facilities) {
        for (const f of attr.facilities) {
          if (f.map === ACTIVE_MAP && Math.hypot(x - f.x, y - f.y) <= 1200) return true;
        }
      }
    }
    for (const mc of this.activeMarches()) {
      const pos = this.marchPos(mc);
      if (pos.map === ACTIVE_MAP && Math.hypot(x - pos.x, y - pos.y) <= 1050) return true;
    }
    return false;
  }

  private _standoffZoneCache = new Map<string, {
    key: string;
    tgtKey: string;
    warIds: number[];
    forms: WarFormation[];
    airships: WarAirship[];
    formedAt?: number;
    dur: number;
    arrived: boolean;
  }>();
  /** 持久记录每个战区对峙出营进度：仅在首次发起对峙时自大营行军一次，离开再重入战场绝不重走 */
  private _standoffDispatched = new Map<string, {
    tgtKey: string;
    warIds: number[];
    formedAt?: number;
    dur: number;
    arrived: boolean;
  }>();
  private _standoffFrameMemo: { t: number; l: number; top: number; r: number; b: number; sig: string; out: WarFormation[] } | null = null;
  private _majorLocsCache: { map: string; locs: { id: string; x: number; y: number; r: number }[] } | null = null;

  private pruneEndedStandoffCaches() {
    const activeBattleWars = new Set<number>();
    for (const w of this.S.wars) {
      if (!w.fall && w.phase === 'battle') activeBattleWars.add(w.id);
    }
    for (const [k, entry] of [...this._standoffZoneCache.entries()]) {
      if (!entry.warIds.some((id) => activeBattleWars.has(id))) {
        this._standoffZoneCache.delete(k);
      }
    }
    for (const [k, st] of [...this._standoffDispatched.entries()]) {
      if (!st.warIds.some((id) => activeBattleWars.has(id))) {
        this._standoffDispatched.delete(k);
      }
    }
  }

  /** 对峙态前线双军百人方阵（跨战事同战区合并同一战线、全军统一方阵多排纵深展开、绝不十字交叉或踩入山门） */
  private visibleStandoffFormations(view: { left: number; top: number; right: number; bottom: number }, t?: number): WarFormation[] {
    const frameSig = `${this.S.wars.length}:${this.battles.length}:${this.postFormations.length}:${this.skirmishes.length}`;
    if (
      t !== undefined && this._standoffFrameMemo
      && this._standoffFrameMemo.t === t
      && this._standoffFrameMemo.sig === frameSig
      && this._standoffFrameMemo.l === view.left
      && this._standoffFrameMemo.top === view.top
      && this._standoffFrameMemo.r === view.right
      && this._standoffFrameMemo.b === view.bottom
    ) {
      return this._standoffFrameMemo.out;
    }
    const out: WarFormation[] = [];
    const pad = 2800;
    const frontPad = 4200;

    type ZoneEntry = {
      w: SWar;
      fp: { x: number; y: number; map: string };
      srcA: SkirmishSource;
      srcB: SkirmishSource;
      inView: boolean;
    };
    const rectHasPt = (x: number, y: number, padPx: number) =>
      x >= view.left - padPx && x <= view.right + padPx && y >= view.top - padPx && y <= view.bottom + padPx;
    const segHitsView = (x0: number, y0: number, x1: number, y1: number, padPx: number) => {
      const rx0 = view.left - padPx, ry0 = view.top - padPx;
      const rx1 = view.right + padPx, ry1 = view.bottom + padPx;
      let t0 = 0, t1 = 1;
      const dx = x1 - x0, dy = y1 - y0;
      const clip = (p: number, q: number) => {
        if (Math.abs(p) < 1e-8) return q >= 0;
        const r = q / p;
        if (p < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
        return true;
      };
      return clip(-dx, x0 - rx0) && clip(dx, rx1 - x0) && clip(-dy, y0 - ry0) && clip(dy, ry1 - y0);
    };
    const allCandidates: ZoneEntry[] = [];
    for (const w of this.S.wars) {
      if (w.fall || w.phase !== 'battle' || this.hasBattleForWar(w.id)) continue;
      // 双方大营尚未正式建成且营中有兵之前，严禁在前线凭空刷出对峙军队与战船
      if (!w.campaign) {
        if (!w.campA?.established || w.campA.soldiers <= 0 || !w.campB?.established || w.campB.soldiers <= 0) continue;
      }
      this.sanitizeWarSides(w);
      // 只要处于交锋开战阶段（含休兵/夜间对峙期），在当前视口覆盖前线、大营或大营→前线行军连线时均应驱动与绘制对峙方阵
      // 若同战区已有玩家亲征实兵战团接战，只隐藏该战区对应的对峙假阵，不再一刀切清掉远处的其他战场
      const fp = this.frontPos(w);
      if (!fp || fp.map !== ACTIVE_MAP) continue;
      if (this.battles.some((B) => B.war === w.id || Math.hypot(B.x - fp.x, B.y - fp.y) < 4200)) continue;
      const srcA = this.resolveFrontSource(w, 0, fp.x, fp.y, fp.map);
      const srcB = this.resolveFrontSource(w, 1, fp.x, fp.y, fp.map);
      if (!srcA || !srcB) continue;
      let inView = rectHasPt(fp.x, fp.y, frontPad);
      if (!inView) {
        const cp0 = this.campPos(w, 0);
        const cp1 = this.campPos(w, 1);
        if (cp0 && cp0.map === ACTIVE_MAP && (rectHasPt(cp0.x, cp0.y, frontPad) || segHitsView(cp0.x, cp0.y, fp.x, fp.y, pad))) {
          inView = true;
        } else if (cp1 && cp1.map === ACTIVE_MAP && (rectHasPt(cp1.x, cp1.y, frontPad) || segHitsView(cp1.x, cp1.y, fp.x, fp.y, pad))) {
          inView = true;
        } else if (rectHasPt(srcA.x, srcA.y, pad) || rectHasPt(srcB.x, srcB.y, pad)
          || segHitsView(srcA.x, srcA.y, fp.x, fp.y, pad) || segHitsView(srcB.x, srcB.y, fp.x, fp.y, pad)) {
          inView = true;
        } else {
          for (const ce of this._standoffZoneCache.values()) {
            if (!ce.warIds.includes(w.id)) continue;
            if (ce.forms.some((f) => rectHasPt(f.x, f.y, pad)) || ce.airships.some((s) => rectHasPt(s.x, s.y, pad))) {
              inView = true;
              break;
            }
          }
        }
      }
      allCandidates.push({ w, fp, srcA, srcB, inView });
    }
    this.pruneEndedStandoffCaches();
    // 放大视角观察单侧大营门前出征时，仍连带保留同战区盟友战事，保持一致的 zoneId 与队列布局
    let grown = true;
    while (grown) {
      grown = false;
      for (const c of allCandidates) {
        if (c.inView) continue;
        if (allCandidates.some((m) => m.inView && (m.w.tgt === c.w.tgt || Math.hypot(m.fp.x - c.fp.x, m.fp.y - c.fp.y) < 4200))) {
          c.inView = true;
          grown = true;
        }
      }
    }
    const entries = allCandidates.filter((c) => c.inView);
    if (!entries.length) {
      if (t !== undefined) this._standoffFrameMemo = { t, l: view.left, top: view.top, r: view.right, b: view.bottom, sig: frameSig, out };
      return out;
    }

    // 1) 按目标据点/前线邻近度聚类为统一战区，同一战区只拉一条主轴横阵，消除多场战事十字交叉叠穿
    const clusters: ZoneEntry[][] = [];
    for (const ent of entries) {
      const hitIdx: number[] = [];
      for (let ci = 0; ci < clusters.length; ci++) {
        const match = clusters[ci].some((m) => m.w.tgt === ent.w.tgt || Math.hypot(m.fp.x - ent.fp.x, m.fp.y - ent.fp.y) < 4200);
        if (match) hitIdx.push(ci);
      }
      if (!hitIdx.length) {
        clusters.push([ent]);
      } else {
        const baseIdx = hitIdx[0];
        clusters[baseIdx].push(ent);
        for (let k = hitIdx.length - 1; k >= 1; k--) {
          clusters[baseIdx].push(...clusters[hitIdx[k]]);
          clusters.splice(hitIdx[k], 1);
        }
      }
    }

    const tr = (this.game as any).terrain;
    let majorLocs: { id: string; x: number; y: number; r: number }[];
    if (this._majorLocsCache && this._majorLocsCache.map === ACTIVE_MAP) {
      majorLocs = this._majorLocsCache.locs;
    } else {
      majorLocs = [];
      for (const l of LOC_BY_ID.values()) {
        if (l.map !== ACTIVE_MAP) continue;
        if (l.type === 'sect' || l.type === 'city') {
          majorLocs.push({ id: l.id, x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, r: 2650 });
        }
      }
      this._majorLocsCache = { map: ACTIVE_MAP, locs: majorLocs };
    }

    const placedZones: { x: number; y: number; r: number }[] = [];

    for (const grp of clusters) {
      grp.sort((a, b) => {
        const pa = (this.sideOf(a.w) !== undefined ? 100 : 0) - a.w.id * 0.01;
        const pb = (this.sideOf(b.w) !== undefined ? 100 : 0) - b.w.id * 0.01;
        return pb - pa;
      });
      const lead = grp[0];
      let zoneFp = { ...lead.fp };
      // 若不同战区之间前线依然靠近，沿外围空地避让错开，绝不发生两个战区十字交叠
      if (placedZones.some((pz) => Math.hypot(zoneFp.x - pz.x, zoneFp.y - pz.y) < pz.r)) {
        zoneFp = this.findOpenGround(zoneFp.x, zoneFp.y, ACTIVE_MAP, { minLocDist: 2600, avoid: placedZones });
      }
      placedZones.push({ x: zoneFp.x, y: zoneFp.y, r: 4800 });

      let axisX = lead.srcB.x - lead.srcA.x;
      let axisY = lead.srcB.y - lead.srcA.y;
      if (Math.hypot(axisX, axisY) < 60) {
        axisX = zoneFp.x - lead.srcA.x;
        axisY = zoneFp.y - lead.srcA.y;
      }
      if (Math.hypot(axisX, axisY) < 1) { axisX = 1; axisY = 0; }
      const axisD = Math.hypot(axisX, axisY);
      const axisUx = axisX / axisD, axisUy = axisY / axisD;

      const sects0 = new Set<string>();
      const sects1 = new Set<string>();
      let c0 = 0, c1 = 0;
      let side0Mine = false, side1Mine = false;
      for (const ent of grp) {
        const w = ent.w;
        const same0 = ent === lead
          || this.isSameCoalitionSide(w, 0, lead.w, 0)
          || (!this.isSameCoalitionSide(w, 0, lead.w, 1) && ((ent.srcA.x - zoneFp.x) * axisUx + (ent.srcA.y - zoneFp.y) * axisUy) <= 0);
        const s0Idx: 0 | 1 = same0 ? 0 : 1;
        const s1Idx: 0 | 1 = same0 ? 1 : 0;
        for (const sid of this.sideSects(w, s0Idx)) {
          if (!sects1.has(sid)) sects0.add(sid);
        }
        for (const sid of this.sideSects(w, s1Idx)) {
          if (!sects0.has(sid)) sects1.add(sid);
        }
        c0 += Math.round((s0Idx === 0 ? w.campA?.soldiers : w.campB?.soldiers) ?? (s0Idx === 0 ? ent.srcA.avail : ent.srcB.avail) ?? 0);
        c1 += Math.round((s1Idx === 0 ? w.campA?.soldiers : w.campB?.soldiers) ?? (s1Idx === 0 ? ent.srcA.avail : ent.srcB.avail) ?? 0);
        const ms = this.sideOf(w);
        if (ms === s0Idx) side0Mine = true;
        if (ms === s1Idx) side1Mine = true;
      }

      const list0 = [...sects0];
      const list1 = [...sects1];
      const warIds = grp.map((m) => m.w.id).sort((a, b) => a - b);
      const zoneId = warIds.join(',');
      const tgtKey = `${zoneId}|${grp.map((m) => m.w.tgt).sort().join(',')}`;
      const key = `${zoneId}|${Math.round(zoneFp.x)}:${Math.round(zoneFp.y)}:${Math.round(axisUx * 100)}:${Math.round(axisUy * 100)}:${c0}:${c1}:${list0.join(',')}:${list1.join(',')}:${side0Mine ? 1 : 0}${side1Mine ? 1 : 0}`;
      let cached = this._standoffZoneCache.get(zoneId);
      let dispatch = this._standoffDispatched.get(zoneId);
      if (dispatch && dispatch.tgtKey !== tgtKey) dispatch = undefined;

      if (!cached || cached.key !== key) {
        const forms: WarFormation[] = [];
        const airships: WarAirship[] = [];
        const buildSide = (
          sideTag: 0 | 1,
          sects: string[],
          fallbackSid: string,
          faceX: number,
          faceY: number,
          totalSoldiers: number,
          isOurs: boolean,
          hasPlayerSide: boolean,
          sideLabel: string,
        ) => {
          const px = -faceY, py = faceX;
          const countForms = clamp(
            Math.max(sects.length, totalSoldiers >= 210 ? 3 : 2, Math.min(8, Math.round(totalSoldiers / 115))),
            2,
            8,
          );
          const perForm = clamp(Math.round(totalSoldiers / countForms), 48, 120);
          const ang = Math.atan2(faceY, faceX);
          const fX = Math.cos(ang) >= 0 ? 1 : -1;
          const fY: 1 | -1 = Math.sin(ang) < -0.25 ? -1 : 1;
          const origSide: 0 | 1 = (lead.w.a === fallbackSid || this.sideSects(lead.w, 0).includes(fallbackSid)) ? 0 : 1;
          const campOrg = this.campDispatchOrigin(lead.w, origSide, zoneFp.x, zoneFp.y, Math.atan2(axisUy, axisUx), Infinity);

          // 对峙期各阵按宗门战阵职责分排展开，避免全军只摆单一菱形方阵
          const basePat = this.patternOf(sects[0] ?? fallbackSid, isOurs, 0);
          const b = formationBounds(basePat, perForm);
          const latHalf = Math.hypot(px * b.rx, py * b.ry) + 28;
          const depHalf = Math.hypot(faceX * b.rx, faceY * b.ry) + 24;

          const gapLat = 260;
          const gapDep = 360;
          const maxColsByWidth = Math.max(2, countForms);
          const ranks: string[][] = [];
          for (let i = 0; i < countForms; i++) {
            const fSid = sects[i % Math.max(1, sects.length)] ?? fallbackSid;
            const rIdx = Math.floor(i / maxColsByWidth);
            if (!ranks[rIdx]) ranks[rIdx] = [];
            ranks[rIdx].push(fSid);
          }

          let seq = 0;
          const frontDepthBase = Math.max(1040, depHalf * 2 + 500);
          const rankStride = depHalf * 2 + gapDep;

          for (let rIdx = 0; rIdx < ranks.length; rIdx++) {
            const row = ranks[rIdx];
            const totalW = row.length * latHalf * 2 + gapLat * Math.max(0, row.length - 1);
            let cursor = -totalW * 0.5;
            const baseDepth = frontDepthBase + rIdx * rankStride;
            for (let cIdx = 0; cIdx < row.length; cIdx++) {
              const fSid = row[cIdx];
              const pat = this.patternOf(fSid, isOurs, seq);
              const latPos = cursor + latHalf;
              cursor += latHalf * 2 + gapLat;
              const echelonBack = row.length >= 3 && (cIdx === 0 || cIdx === row.length - 1) ? 55 : 0;
              const depth = baseDepth + echelonBack;
              let fx = zoneFp.x - faceX * depth + px * latPos;
              let fy = zoneFp.y - faceY * depth + py * latPos;
              const gateLat = clamp(latPos * 0.35, -320, 320);
              const spawnX = campOrg.x + px * gateLat;
              const spawnY = campOrg.y + py * gateLat;
              const customUniform = fSid === MY ? this.my?.uniform : undefined;
              const leader = {
                x: fx, y: fy, dead: false, gone: false, realm: 2,
                shortName: `${this.name(fSid)}列阵`, name: `${this.name(fSid)}列阵`,
              } as unknown as Enemy;
              const sf: WarFormation = {
                id: -(lead.w.id * 1000 + sideTag * 100 + seq + 1),
                sid: fSid,
                sectName: this.name(fSid),
                sideLabel: hasPlayerSide ? (isOurs ? '我方' : '敌方') : sideLabel,
                ours: isOurs,
                leader,
                pattern: pat,
                desiredPattern: this.patternOf(fSid, isOurs),
                slotLineLat: latPos,
                slotLineDepth: depth,
                lineAxisAng: ang,
                school: this.schoolOf(fSid),
                soldiers: perForm,
                soldiersMax: perForm,
                deadCount: 0,
                injCount: 0,
                routedCount: 0,
                volleyCd: 99,
                collapsed: false,
                collapseT: 0,
                x: fx,
                y: fy,
                face: fX,
                faceY: fY,
                faceAng: ang,
                targetFaceAng: ang,
                anchorX: fx,
                anchorY: fy,
                moving: false,
                holdFire: true,
                doctrineAtk: 1,
                doctrineDef: 1,
                realm: 2,
                shield: 0,
                shieldMax: 1,
                shieldRegen: 0,
                brokenT: 0,
                mp: 100,
                mpMax: 100,
                customUniform,
              };
              (sf as any)._standoffSpawnX = spawnX;
              (sf as any)._standoffSpawnY = spawnY;
              (sf as any)._standoffDestX = fx;
              (sf as any)._standoffDestY = fy;
              (sf as any)._standoffFaceAng = ang;
              (sf as any)._standoffDelay = Math.floor(seq / 2) * 0.75;
              forms.push(sf);
              seq++;
            }
          }

          // 若该侧宗门真实库存拥有空闲飞舟，则同步自大营起飞护航战船悬停对峙阵地上空（绝不凭空刷船）
          const leadShipSid = sects[0] ?? fallbackSid;
          const standoffTier = this.pickEscortAirshipTier(leadShipSid, [3, 2, 1]);
          if (standoffTier) {
            const shipDestX = zoneFp.x - faceX * (frontDepthBase + 140) + px * 110;
            const shipDestY = zoneFp.y - faceY * (frontDepthBase + 140) + py * 110;
            const shipSpawnX = campOrg.x + px * 90;
            const shipSpawnY = campOrg.y + py * 90;
            const ship = createWarAirship({
              id: -(lead.w.id * 20 + sideTag + 1),
              warId: lead.w.id,
              sid: leadShipSid,
              sectName: this.name(leadShipSid),
              ours: isOurs,
              tier: standoffTier,
              style: this.dao(leadShipSid) === 'mo' ? 'mo' : 'zheng',
              x: shipDestX,
              y: shipDestY,
              tx: shipDestX,
              ty: shipDestY,
              crew: standoffTier === 3 ? 28 : standoffTier === 2 ? 16 : 9,
              customUniform: leadShipSid === MY ? this.my?.uniform : undefined,
            });
            const initFaceDx = t !== undefined && Math.hypot(shipDestX - shipSpawnX, shipDestY - shipSpawnY) > 20
              ? shipDestX - shipSpawnX
              : faceX;
            const initFaceDy = t !== undefined && Math.hypot(shipDestX - shipSpawnX, shipDestY - shipSpawnY) > 20
              ? shipDestY - shipSpawnY
              : faceY;
            turnAirshipToward(ship, initFaceDx, initFaceDy, 0, { instant: true });
            (ship as any)._standoffSpawnX = shipSpawnX;
            (ship as any)._standoffSpawnY = shipSpawnY;
            (ship as any)._standoffDestX = shipDestX;
            (ship as any)._standoffDestY = shipDestY;
            (ship as any)._standoffFaceAng = ang;
            (ship as any)._lastStandoffT = t;
            airships.push(ship);
          }
        };

        const hasPlayerInZone = side0Mine || side1Mine;
        const ours0 = hasPlayerInZone ? side0Mine : true;
        const ours1 = hasPlayerInZone ? side1Mine : false;
        buildSide(0, list0, lead.w.a, axisUx, axisUy, c0, ours0, hasPlayerInZone, lead.w.ini === 0 ? '攻方' : '守方');
        buildSide(1, list1, lead.w.b, -axisUx, -axisUy, c1, ours1, hasPlayerInZone, lead.w.ini === 1 ? '攻方' : '守方');

        // 整片战阵刚体向外推离山门护宗大阵/大城池，绝不单独推挤单个方阵破坏横排与纵深间距
        for (let pass = 0; pass < 3; pass++) {
          let shiftX = 0, shiftY = 0;
          for (const f of forms) {
            for (const ml of majorLocs) {
              const dxm = f.x - ml.x, dym = f.y - ml.y, dm = Math.hypot(dxm, dym);
              if (dm < ml.r) {
                const need = ml.r - dm + 160;
                const uxOut = dm > 1 ? dxm / dm : (zoneFp.x - ml.x) / Math.max(1, Math.hypot(zoneFp.x - ml.x, zoneFp.y - ml.y));
                const uyOut = dm > 1 ? dym / dm : (zoneFp.y - ml.y) / Math.max(1, Math.hypot(zoneFp.x - ml.x, zoneFp.y - ml.y));
                const sx = uxOut * need, sy = uyOut * need;
                if (Math.hypot(sx, sy) > Math.hypot(shiftX, shiftY)) {
                  shiftX = sx; shiftY = sy;
                }
              }
            }
          }
          if (Math.hypot(shiftX, shiftY) < 1) break;
          for (const f of forms) {
            f.x += shiftX; f.y += shiftY;
            f.anchorX = f.x; f.anchorY = f.y;
            f.leader.x = f.x; f.leader.y = f.y;
            (f as any)._standoffDestX = f.x;
            (f as any)._standoffDestY = f.y;
          }
          for (const ss of airships) {
            ss.x += shiftX; ss.y += shiftY;
            ss.tx = ss.x; ss.ty = ss.y;
            (ss as any)._standoffDestX = ss.x;
            (ss as any)._standoffDestY = ss.y;
          }
        }
        // 水域避让同样须满足与已有方阵互不叠压
        if (tr?.walkFactor) {
          for (const f of forms) {
            if (tr.walkFactor(f.x, f.y) <= 0) {
              const avoidPeers = forms.filter((o) => o !== f).map((o) => {
                const ob = rotatedFormationBounds(o);
                return { x: o.x, y: o.y, r: Math.max(ob.rx, ob.ry) + 320 };
              });
              const dry = this.findOpenGround(f.x, f.y, ACTIVE_MAP, { minLocDist: 2150, avoid: avoidPeers });
              f.x = dry.x; f.y = dry.y;
              f.anchorX = dry.x; f.anchorY = dry.y;
              f.leader.x = dry.x; f.leader.y = dry.y;
              (f as any)._standoffDestX = dry.x;
              (f as any)._standoffDestY = dry.y;
            }
          }
        }

        const standoffFormWalkSpd = (patId: FormPattern) => {
          const pat = FORM_PATTERNS.find((p) => p.id === patId) ?? FORM_PATTERNS[0];
          return pat.speed * 1.15; // 炼气弟子步行方阵真实步速（约 97–155 px/s）
        };
        const standoffShipFlySpd = 320; // 护航战船御空飞行速度
        let maxDur = 4.2;
        for (const f of forms) {
          const d = Math.hypot(((f as any)._standoffDestX ?? f.x) - ((f as any)._standoffSpawnX ?? f.x), ((f as any)._standoffDestY ?? f.y) - ((f as any)._standoffSpawnY ?? f.y));
          const delay = (f as any)._standoffDelay ?? 0;
          const fDur = delay + Math.max(4.2, d / standoffFormWalkSpd(f.pattern));
          if (fDur > maxDur) maxDur = fDur;
        }
        for (const ss of airships) {
          const d = Math.hypot(((ss as any)._standoffDestX ?? ss.x) - ((ss as any)._standoffSpawnX ?? ss.x), ((ss as any)._standoffDestY ?? ss.y) - ((ss as any)._standoffSpawnY ?? ss.y));
          const sDur = Math.max(4.2, d / standoffShipFlySpd);
          if (sDur > maxDur) maxDur = sDur;
        }
        const computedDur = maxDur;
        if (!dispatch) {
          dispatch = { tgtKey, warIds, formedAt: t, dur: computedDur, arrived: false };
          this._standoffDispatched.set(zoneId, dispatch);
        } else {
          dispatch.warIds = warIds;
          if (!dispatch.arrived) dispatch.dur = Math.max(dispatch.dur, computedDur);
          if (dispatch.formedAt === undefined && t !== undefined) dispatch.formedAt = t;
        }
        cached = {
          key,
          tgtKey,
          warIds,
          forms,
          airships,
          formedAt: dispatch.formedAt,
          dur: dispatch.dur,
          arrived: dispatch.arrived,
        };
        this._standoffZoneCache.set(zoneId, cached);
      }

      if (t !== undefined) {
        if (cached.formedAt === undefined) cached.formedAt = t;
        if (dispatch && dispatch.formedAt === undefined) dispatch.formedAt = cached.formedAt;
        const arrived = cached.arrived || !!dispatch?.arrived;
        if (!arrived && t - cached.formedAt >= cached.dur) {
          cached.arrived = true;
          if (dispatch) dispatch.arrived = true;
        }
        for (const f of cached.forms) {
          const sx = (f as any)._standoffSpawnX ?? f.x;
          const sy = (f as any)._standoffSpawnY ?? f.y;
          const dx = (f as any)._standoffDestX ?? f.x;
          const dy = (f as any)._standoffDestY ?? f.y;
          const pat = FORM_PATTERNS.find((p) => p.id === f.pattern) ?? FORM_PATTERNS[0];
          const walkSpd = pat.speed * 1.15;
          const delay = (f as any)._standoffDelay ?? 0;
          const elapsed = Math.max(0, t - cached.formedAt - delay);
          let frac = 1;
          if (!cached.arrived) {
            const fDur = Math.max(4.2, Math.hypot(dx - sx, dy - sy) / walkSpd);
            frac = clamp(elapsed / fDur, 0, 1);
          }
          f.x = sx + (dx - sx) * frac;
          f.y = sy + (dy - sy) * frac;
          f.anchorX = f.x; f.anchorY = f.y;
          f.leader.x = f.x; f.leader.y = f.y;
          f.moving = !cached.arrived && (t - cached.formedAt >= delay) && frac < 0.99;
          const standAng = (f as any)._standoffFaceAng ?? f.faceAng;
          const wantAng = f.moving && Math.hypot(dx - sx, dy - sy) > 20 ? Math.atan2(dy - sy, dx - sx) : standAng;
          f.faceAng = wantAng;
          f.targetFaceAng = wantAng;
          f.face = Math.cos(wantAng) >= 0 ? 1 : -1;
          f.faceY = Math.sin(wantAng) < -0.25 ? -1 : 1;
        }
        for (const ss of cached.airships) {
          const sx = (ss as any)._standoffSpawnX ?? ss.x;
          const sy = (ss as any)._standoffSpawnY ?? ss.y;
          const dx = (ss as any)._standoffDestX ?? ss.x;
          const dy = (ss as any)._standoffDestY ?? ss.y;
          let frac = 1;
          if (!cached.arrived) {
            const sDur = Math.max(4.2, Math.hypot(dx - sx, dy - sy) / 320);
            frac = clamp((t - cached.formedAt) / sDur, 0, 1);
          }
          ss.x = sx + (dx - sx) * frac;
          ss.y = sy + (dy - sy) * frac;
          ss.tx = dx; ss.ty = dy;
          const dtShip = Math.max(0, t - ((ss as any)._lastStandoffT ?? t));
          (ss as any)._lastStandoffT = t;
          if (!cached.arrived && frac < 0.99 && Math.hypot(dx - sx, dy - sy) > 20) {
            turnAirshipToward(ss, dx - sx, dy - sy, dtShip, { forceTarget: true });
          } else {
            const standAng = (ss as any)._standoffFaceAng ?? cached.forms.find((f) => f.sid === ss.sid)?.faceAng ?? 0;
            turnAirshipToward(ss, Math.cos(standAng), Math.sin(standAng), dtShip, { forceTarget: true });
          }
        }
      }

      const formPad = 900;
      for (const f of cached.forms) {
        if (f.x >= view.left - formPad && f.x <= view.right + formPad && f.y >= view.top - formPad && f.y <= view.bottom + formPad) {
          out.push(f);
        }
      }
    }

    if (t !== undefined) this._standoffFrameMemo = { t, l: view.left, top: view.top, r: view.right, b: view.bottom, sig: frameSig, out };
    return out;
  }

  /** 当前视口内可见的对峙护阵战船（随对峙战阵自大营起飞悬停，绝不凭空刷新） */
  private visibleStandoffAirships(view: { left: number; top: number; right: number; bottom: number }): WarAirship[] {
    const out: WarAirship[] = [];
    const pad = 2800;
    for (const entry of this._standoffZoneCache.values()) {
      const aliveStandoff = entry.warIds.some((id) => {
        const w = this.S.wars.find((x) => x.id === id);
        if (!w || w.fall || w.phase !== 'battle' || this.hasBattleForWar(w.id)) return false;
        if (!w.campaign && (!w.campA?.established || w.campA.soldiers <= 0 || !w.campB?.established || w.campB.soldiers <= 0)) return false;
        const fp = this.frontPos(w);
        if (!fp || fp.map !== ACTIVE_MAP) return false;
        return !this.battles.some((B) => B.war === w.id || Math.hypot(B.x - fp.x, B.y - fp.y) < 4200);
      });
      if (!aliveStandoff) continue;
      for (const s of entry.airships) {
        if (s.x >= view.left - pad && s.x <= view.right + pad && s.y >= view.top - pad && s.y <= view.bottom + pad) {
          out.push(s);
        }
      }
    }
    return out;
  }

  /** 地面战阵阵盘层（于排序表前绘制，不阻断 WebGL 角色实例化合批） */
  private skirmishFormsOnMap(): WarFormation[] {
    if (!this.skirmishes.length) return [];
    const out: WarFormation[] = [];
    for (const sk of this.skirmishes) {
      if (sk.map !== ACTIVE_MAP) continue;
      if (sk.formA && !sk.formA.collapsed && sk.formA.soldiers > 0) out.push(sk.formA);
      if (sk.formB && !sk.formB.collapsed && sk.formB.soldiers > 0) out.push(sk.formB);
    }
    return out;
  }

  drawFormationGround(ctx: CanvasRenderingContext2D, view: { left: number; top: number; right: number; bottom: number }, t: number, z = 1): boolean {
    const standoffForms = this.visibleStandoffFormations(view, t);
    const skirmishForms = this.skirmishFormsOnMap();
    if (!this.battles.length && !this.postFormations.length && !standoffForms.length && !skirmishForms.length) return false;
    let drew = false;
    const lockedF = this.game.combat?.lockForm;
    const go = (f: WarFormation, lk: boolean) => {
      drawFormationGround(ctx, f, t, lk, z);
      drew = true;
    };
    for (const B of this.battles) {
      for (const f of B.formations) {
        const b = rotatedFormationBounds(f);
        if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
        go(f, lockedF === f);
      }
    }
    for (const f of skirmishForms) {
      const b = rotatedFormationBounds(f);
      if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
      go(f, lockedF === f);
    }
    for (const f of standoffForms) {
      const b = rotatedFormationBounds(f);
      if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
      go(f, false);
    }
    for (const f of this.postFormations) {
      const b = rotatedFormationBounds(f);
      if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
      go(f, false);
    }
    return drew;
  }
  /** 上层护阵阵法罩（未破盾时笼罩全阵）与中军铭牌/护盾/灵池条 */
  drawFormationOverlays(ctx: CanvasRenderingContext2D, view: { left: number; top: number; right: number; bottom: number }, t: number, z = 1) {
    const standoffForms = this.visibleStandoffFormations(view, t);
    const skirmishForms = this.skirmishFormsOnMap();
    if (!this.battles.length && !this.postFormations.length && !standoffForms.length && !skirmishForms.length) return;
    resetFormationOverlayFrame();
    const lockedF = this.game.combat?.lockForm;
    const go = (f: WarFormation, lk: boolean) => {
      drawFormationOverlay(ctx, f, t, lk, z);
    };
    for (const B of this.battles) {
      for (const f of B.formations) {
        const b = rotatedFormationBounds(f);
        if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
        go(f, lockedF === f);
      }
    }
    for (const f of skirmishForms) {
      const b = rotatedFormationBounds(f);
      if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
      go(f, lockedF === f);
    }
    for (const f of standoffForms.slice().sort((a, b) => a.id - b.id)) {
      const b = rotatedFormationBounds(f);
      if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
      go(f, false);
    }
    for (const f of this.postFormations) {
      const b = rotatedFormationBounds(f);
      if (f.x < view.left - b.rx - 140 || f.x > view.right + b.rx + 140 || f.y < view.top - b.ry - 220 || f.y > view.bottom + b.ry + 180) continue;
      go(f, false);
    }
  }
  /** 收集战阵（地面阵环、阵旗、横尸、败兵遁光、战后归营/溃退队列与预烘炼气弟子方阵）进入渲染 Y 排序列表 */
  collectFormations(
    out: Drawable[],
    view: { left: number; top: number; right: number; bottom: number },
    t: number,
    opts?: {
      splitLayers?: boolean;
      ren?: {
        pushAtlasSpr?: (...args: any[]) => boolean;
        dpr?: number;
      };
      z?: number;
      dpr?: number;
    },
  ) {
    const lockedF = this.game.combat?.lockForm;
    const lockedShip = this.game.combat?.lockAirship;
    const viewZ = opts?.z ?? 1;
    collectWarBattleFx(out, view, t, opts?.ren);
    for (const B of this.battles) {
      for (const f of B.formations) collectFormationDrawables(f, out, view, t, lockedF === f, opts);
      collectAirshipDrawables(B.airships, out, view, t, lockedShip?.id, viewZ, opts?.ren);
    }
    collectAirshipDrawables(this.postAirships, out, view, t, undefined, viewZ, opts?.ren);
    for (const f of this.skirmishFormsOnMap()) {
      collectFormationDrawables(f, out, view, t, lockedF === f, opts);
    }
    for (const f of this.visibleStandoffFormations(view, t)) {
      collectFormationDrawables(f, out, view, t, false, opts);
    }
    collectAirshipDrawables(this.visibleStandoffAirships(view), out, view, t, undefined, viewZ, opts?.ren);
    for (const f of this.postFormations) collectFormationDrawables(f, out, view, t, false, opts);
    const pad = 160;
    for (const a of this.postActors) {
      if (a.x < view.left - pad || a.x > view.right + pad || a.y < view.top - pad || a.y > view.bottom + pad) continue;
      const alpha = Math.max(0, Math.min(1, a.dur / Math.min(2.0, a.maxDur * 0.35)));
      out.push({
        y: a.flying ? a.y + 12000 : a.y,
        k: 'D·战后撤离',
        draw: (ctx) => {
          ctx.save();
          ctx.globalAlpha *= alpha;
          ctx.fillStyle = 'rgba(20,18,14,0.24)';
          ctx.beginPath();
          ctx.ellipse(a.x, a.y + 4, a.flying ? 11 : 14, a.flying ? 4 : 5, 0, 0, Math.PI * 2);
          ctx.fill();
          a.st.x = a.x;
          a.st.y = a.y;
          if (a.flying) {
            if (a.st.lift <= 0) a.st.lift = 58;
            drawSwordUnderFeet(ctx, a.x, a.y - a.st.lift + 2, a.st.yaw, 1.05, a.t, a.ours ? '#9ee8ff' : '#ff9098');
          }
          drawCharacter(ctx, a.look, a.st, 1.12, 0.016);
          ctx.restore();
        },
      });
    }
  }
  /** 当前所有在场且未溃散的敌方战阵（支持多战区并发战阵与局部试探小方阵） */
  activeFoeFormations(): WarFormation[] {
    const out: WarFormation[] = [];
    for (const B of this.battles) {
      for (const f of B.formations) {
        if (!f.ours && !f.collapsed && f.soldiers > 0) out.push(f);
      }
    }
    for (const sk of this.skirmishes) {
      if (sk.map !== ACTIVE_MAP || sk.resolved) continue;
      if (sk.formA && !sk.formA.ours && !sk.formA.bystander && !sk.formA.collapsed && sk.formA.soldiers > 0) out.push(sk.formA);
      if (sk.formB && !sk.formB.ours && !sk.formB.bystander && !sk.formB.collapsed && sk.formB.soldiers > 0) out.push(sk.formB);
    }
    return out;
  }
  /** 计算战阵椭圆表面/内部距某坐标最近的点与到阵缘的距离 */
  formationClosestPoint(f: WarFormation, x: number, y: number): { x: number; y: number; dist: number; centerDist: number } {
    const b = rotatedFormationBounds(f);
    const dx = x - f.x, dy = y - f.y;
    const centerDist = Math.hypot(dx, dy);
    const norm = Math.hypot(dx / Math.max(1, b.rx), dy / Math.max(1, b.ry));
    if (norm <= 1) {
      return { x: f.x + dx * 0.35, y: f.y + dy * 0.35, dist: 0, centerDist };
    }
    const edgeX = f.x + dx / norm;
    const edgeY = f.y + dy / norm;
    const dist = Math.hypot(x - edgeX, y - edgeY);
    const aimX = f.x + (dx / norm) * 0.55;
    const aimY = f.y + (dy / norm) * 0.55;
    return { x: aimX, y: aimY, dist, centerDist };
  }
  /** 查找距指定坐标最近的敌方战阵（按阵型外缘真实距离判断） */
  nearestFoeFormation(x: number, y: number, maxRange: number, skip?: Set<number>): WarFormation | null {
    const list = this.activeFoeFormations();
    let best: WarFormation | null = null;
    let bd = maxRange;
    for (const f of list) {
      if (skip?.has(f.id)) continue;
      const pt = this.formationClosestPoint(f, x, y);
      if (pt.dist <= bd) {
        bd = pt.dist;
        best = f;
      }
    }
    return best;
  }
  /** 判定坐标是否位于指定战阵的实际旋转阵域内 */
  isPointInFormation(f: WarFormation, wx: number, wy: number, pad = 0): boolean {
    return isPointInFormation(f, wx, wy, pad);
  }
  /** 点击世界坐标命中敌方战阵（玩家可左键直接点击方阵锁定攻击） */
  pickFormationAt(wx: number, wy: number): WarFormation | null {
    const list = this.activeFoeFormations();
    let best: WarFormation | null = null;
    let bestScore = Infinity;
    for (const f of list) {
      if (!isPointInFormation(f, wx, wy, 42)) continue;
      const b = rotatedFormationBounds(f);
      const ell = Math.hypot((wx - f.x) / (b.rx + 42), (wy - f.y) / (b.ry + 42));
      if (ell < bestScore) {
        bestScore = ell;
        best = f;
      }
    }
    return best;
  }
  /** 法术 / AOE / 弹道对范围内战阵进行区域削盾与削兵（覆盖所有并发战区与局部试探小方阵） */
  damageFormationArea(x: number, y: number, r: number, dmg: number, target: 'foe' | 'ally' | 'both' = 'foe', attackerRealm = 1, school?: School, hitSet?: Set<number>, fromNpc = false) {
    if (dmg <= 0) return;
    const skForms = this.skirmishFormsOnMap();
    if (!this.battles.length && !skForms.length) return;
    const order = this.battleOrderNow();
    for (const B of this.battles) {
      for (const f of B.formations) {
        if (f.collapsed || f.soldiers <= 0) continue;
        if (target === 'foe' && f.ours) continue;
        if (target === 'ally' && !f.ours) continue;
        if (hitSet?.has(f.id)) continue;
        if (isPointInFormation(f, x, y, r + 32)) {
          hitSet?.add(f.id);
          applyFormationDamage(f, dmg, attackerRealm, this.game, { school, order, fromNpc, hitX: x, hitY: y });
        }
      }
    }
    for (const f of skForms) {
      if (f.collapsed || f.soldiers <= 0 || hitSet?.has(f.id)) continue;
      if (!fromNpc && f.bystander) continue;
      if (target === 'foe' && f.ours) continue;
      if (target === 'ally' && !f.ours) continue;
      if (isPointInFormation(f, x, y, r + 28)) {
        hitSet?.add(f.id);
        applyFormationDamage(f, dmg, attackerRealm, this.game, { school, order, fromNpc, hitX: x, hitY: y });
      }
    }
  }
  /** v0.73：全路径检测直飞/穿透弹道命中战阵（贴合实际旋转椭圆阵列范围，不锁定到单人） */
  hitFormationByProj(
    pr: { x: number; y: number; r: number; dmg: number; formDmg?: number; formRealm?: number; fromForm?: number; targetForm?: WarFormation | null; realm: number; school?: School; pierce?: boolean; hitForm?: Set<number> },
    targetSide: 'foe' | 'ours' = 'foe',
  ): boolean {
    const dmg = pr.formDmg ?? pr.dmg;
    const skForms = this.skirmishFormsOnMap();
    if ((!this.battles.length && !skForms.length) || dmg <= 0) return false;
    const order = this.battleOrderNow();
    const hitSet = (pr.hitForm ??= new Set<number>());
    const realm = pr.formRealm ?? pr.realm;
    const fromNpc = !!pr.fromForm;
    let hitAny = false;
    for (const B of this.battles) {
      for (const f of B.formations) {
        if (f.collapsed || f.soldiers <= 0 || hitSet.has(f.id)) continue;
        if (targetSide === 'foe' ? f.ours : !f.ours) continue;
        if (pr.fromForm && f.id === pr.fromForm) continue;
        if (isPointInFormation(f, pr.x, pr.y, pr.r + 36)) {
          hitSet.add(f.id);
          applyFormationDamage(f, dmg, realm, this.game, { school: pr.school, order, fromNpc, hitX: pr.x, hitY: pr.y });
          hitAny = true;
          if (!pr.pierce) return true;
        }
      }
    }
    const srcSkForm = pr.fromForm ? skForms.find((sf) => sf.id === pr.fromForm) : undefined;
    for (const f of skForms) {
      if (f.collapsed || f.soldiers <= 0 || hitSet.has(f.id)) continue;
      if (pr.fromForm && f.id === pr.fromForm) continue;
      if (srcSkForm) {
        if (f.skirmishGroup !== srcSkForm.skirmishGroup || f.skirmishSide === srcSkForm.skirmishSide) continue;
      } else {
        if (f.bystander && pr.targetForm !== f) continue;
        if (targetSide === 'foe' ? f.ours : !f.ours) continue;
      }
      if (isPointInFormation(f, pr.x, pr.y, pr.r + 32)) {
        hitSet.add(f.id);
        applyFormationDamage(f, dmg, realm, this.game, { school: pr.school, order, fromNpc, hitX: pr.x, hitY: pr.y });
        hitAny = true;
        if (!pr.pierce) return true;
      }
    }
    return hitAny;
  }
  /** 当前所有在场且未坠毁的敌方浮空战船（供玩家锁敌、远程弹道、范围法术命中） */
  activeFoeAirships(): WarAirship[] {
    const out: WarAirship[] = [];
    for (const B of this.battles) {
      for (const s of B.airships) {
        if (!s.ours && !s.sunk) out.push(s);
      }
    }
    return out;
  }
  /** 查找距指定世界坐标最近的敌方飞舟 */
  nearestFoeAirship(x: number, y: number, maxRange: number, skip?: Set<number>): WarAirship | null {
    let best: WarAirship | null = null;
    let bd = maxRange;
    for (const s of this.activeFoeAirships()) {
      if (skip?.has(s.id)) continue;
      const ay = s.y - s.zLift * 0.72;
      const d = Math.hypot(s.x - x, ay - y);
      if (d <= bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
  /** 点击世界坐标拾取敌方飞舟（支持击中船体高空立面与甲板） */
  pickAirshipAt(wx: number, wy: number): WarAirship | null {
    let best: WarAirship | null = null;
    let bestD = Infinity;
    for (const s of this.activeFoeAirships()) {
      if (!isPointOnAirship(s, wx, wy, 48)) continue;
      const d = Math.hypot(wx - s.x, wy - (s.y - s.zLift * 0.72));
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }
  /** 范围法术命中战船 */
  damageAirshipArea(x: number, y: number, r: number, dmg: number, target: 'foe' | 'ally' | 'both' = 'foe', attackerRealm = 1, hitSet?: Set<number>, fromNpc = false) {
    if (dmg <= 0 || !this.battles.length) return;
    for (const B of this.battles) {
      for (const s of B.airships) {
        if (s.sunk) continue;
        if (target === 'foe' && s.ours) continue;
        if (target === 'ally' && !s.ours) continue;
        if (hitSet?.has(s.id)) continue;
        if (isPointOnAirship(s, x, y, r + 36)) {
          hitSet?.add(s.id);
          applyAirshipDamage(s, dmg, attackerRealm, this.game, { fromNpc });
        }
      }
    }
  }
  /** 弹道命中战船 */
  hitAirshipByProj(
    pr: { x: number; y: number; r: number; dmg: number; formDmg?: number; formRealm?: number; realm: number; pierce?: boolean; hitShip?: Set<number>; fromShip?: number },
    targetSide: 'foe' | 'ours' = 'foe',
  ): boolean {
    const dmg = pr.formDmg ?? pr.dmg;
    if (!this.battles.length || dmg <= 0) return false;
    const hitSet = (pr.hitShip ??= new Set<number>());
    const realm = pr.formRealm ?? pr.realm;
    const fromNpc = !!pr.fromShip;
    let hitAny = false;
    for (const B of this.battles) {
      for (const s of B.airships) {
        if (s.sunk || hitSet.has(s.id)) continue;
        if (pr.fromShip && s.id === pr.fromShip) continue;
        if (targetSide === 'foe' ? s.ours : !s.ours) continue;
        if (isPointOnAirship(s, pr.x, pr.y, pr.r + 36)) {
          hitSet.add(s.id);
          applyAirshipDamage(s, dmg, realm, this.game, { fromNpc });
          hitAny = true;
          if (!pr.pierce) return true;
        }
      }
    }
    return hitAny;
  }
  /** 当前玩家锁定的敌方战阵态势（供顶部战阵 HUD 显示护盾、破盾黄金窗口与五行共振提示） */
  lockedFormationInfo(): {
    id: number;
    name: string;
    sectName: string;
    pattern: FormPattern;
    school: School;
    soldiers: number;
    soldiersMax: number;
    shield: number;
    shieldMax: number;
    brokenT: number;
    mp: number;
    mpMax: number;
    lastHitSchool?: School;
    resonanceHint: string;
    weakHint: string;
  } | null {
    const f = this.game.combat?.lockForm;
    if (!f || f.collapsed || f.soldiers <= 0 || f.ours) return null;
    if (!this.battles.some((B) => B.formations.includes(f)) && !this.skirmishFormsOnMap().includes(f)) return null;
    const sh = ensureFormationShield(f);
    const pat = FORM_PATTERNS.find((q) => q.id === f.pattern) ?? FORM_PATTERNS[0];
    const now = this.game.time ?? 0;
    const freshLast = f.lastHitSchool && now - (f.lastHitT ?? -99) <= 2.6 ? f.lastHitSchool : undefined;
    const weakHint = f.pattern === 'arrow'
      ? '锋矢·破盾猛而侧翼易破'
      : f.pattern === 'crane'
        ? '鹤翼·两翼齐射而中军薄'
        : f.pattern === 'crescent'
          ? '偃月·弧面攒射而阵背易受抄袭'
          : f.pattern === 'bagua'
            ? '八卦·八门自愈稳而怕异流派共振'
            : f.pattern === 'circle'
              ? '四象·固守阵眼而怕异流派共振'
              : '方阵·进退均衡';
    const resonanceHint = (f.brokenT ?? 0) > 0
      ? `破盾黄金窗口（${(f.brokenT ?? 0).toFixed(1)}s）· 速杀阵兵与阵眼！`
      : freshLast
        ? `上击「${freshLast}」· 换异流派法术命中触发阵盾共振 ×1.35`
        : '异流派法术连击（2.6s 内换系）触发阵盾共振 ×1.35';
    return {
      id: f.id,
      name: pat.name,
      sectName: this.name(f.sid),
      pattern: f.pattern,
      school: f.school,
      soldiers: f.soldiers,
      soldiersMax: f.soldiersMax,
      shield: Math.round(f.shield ?? 0),
      shieldMax: Math.max(1, sh.shieldMax),
      brokenT: f.brokenT ?? 0,
      mp: Math.round(f.mp ?? 0),
      mpMax: Math.max(1, sh.mpMax),
      lastHitSchool: freshLast,
      resonanceHint,
      weakHint,
    };
  }
  /** v0.73：友军尚存时战败由同门抢回大营救治，免无谓死档 */
  tryBattleRescue(): boolean {
    if (!this.battles.length) return false;
    const g = this.game, h = g.hero;
    for (const B of [...this.battles]) {
      const w = this.S.wars.find((x) => x.id === B.war);
      const aliveAllies = B.allies.filter((e) => !e.dead && !e.gone).length + B.rm.length + B.outerRm + B.formations.reduce((s, f) => s + (f.ours && !f.collapsed ? f.soldiers : 0), 0);
      if (!w || aliveAllies <= 0) continue;
      const mine = B.side === 0 ? w.a : w.b;
      h.dead = false;
      h.hp = 0.28;
      h.mp = Math.max(h.mp, 0.22);
      g.combat.invulnT = 3.2;
      C.inflictDaoHurt(h, 22, '战阵鏖战重伤，幸得同门抢回救治');
      this.finish(B, w, false, '你力战昏厥，同门舍命结阵将你抢回大营救治');
      const cmp = this.campPos(w, B.side);
      const L = LOC_BY_ID.get(mine);
      const targetPos = (cmp && cmp.map === ACTIVE_MAP)
        ? { x: cmp.x, y: cmp.y }
        : (mine === MY && this.my && this.my.map === ACTIVE_MAP)
          ? { x: this.my.x * WORLD_SCALE, y: this.my.y * WORLD_SCALE }
          : (L && L.map === ACTIVE_MAP)
            ? { x: L.x * WORLD_SCALE, y: L.y * WORLD_SCALE }
            : null;
      if (targetPos) {
        let sx = targetPos.x, sy = targetPos.y;
        for (let i = 0; i < 24 && g.terrain.walkFactor(sx, sy) <= 0; i++) {
          const a = i * 0.9, R = 200 + i * 60;
          sx = targetPos.x + Math.cos(a) * R;
          sy = targetPos.y + Math.sin(a) * R;
        }
        g.teleport(sx, sy);
      }
      g.toast('危急关头，同门结阵断后，拼死将你抢回大营救治！（已免去死档）', 'warn');
      return true;
    }
    return false;
  }
  /** 一场大会战收场。live = 你亲手打赢的；否则由余下的人按战力自己打完 */
  private finish(B: Live, w: SWar, live: boolean, why: string) {
    const g = this.game, mine = B.side === 0 ? w.a : w.b, foe = B.side === 0 ? w.b : w.a, A = this.att(w), D = this.def(w), big = B.ma === 'all' && B.md === 'all';
    this.syncFormationLosses(B, w, mine, foe);
    let won = live;
    if (!live) {
      const sum = (us: Unit[], es: Enemy[], outN: number) => us.reduce((v, u) => v + pwOf(u), 0) + es.reduce((v, e) => v + pwOf(e), 0) + outN * OUTER_UNIT_PW;
      const formM = B.formations.reduce((s, f) => s + (f.ours && !f.collapsed ? f.soldiers : 0), 0);
      const formF = B.formations.reduce((s, f) => s + (!f.ours && !f.collapsed ? f.soldiers : 0), 0);
      won = sum(B.rm, B.allies, B.outerRm + formM) * rand(0.8, 1.2) > sum(B.rf, B.foes, B.outerRf + formF) * rand(0.8, 1.2);
      const lose = (us: Unit[], sid: string, frac: number, outN: number) => {
        for (const u of us.splice(0)) if (Math.random() < frac * (u.realm >= 3 ? 0.4 : 1)) { this.kill(sid, [u.ref]); if (sid === w.a) w.la++; else w.lb++; if (sid === mine) B.km++; else B.kf++; }
        if (outN > 0) {
          const c = this.casualties(sid, [], frac, outN);
          if (sid === w.a) w.la += c.n; else w.lb += c.n;
          if (sid === mine) { B.km += c.n; B.outerKm += c.deadOuter; B.outerJm += c.injOuter; }
          else { B.kf += c.n; B.outerKf += c.deadOuter; B.outerJf += c.injOuter; }
        }
      };
      lose(B.rm, mine, won ? 0.12 : big ? 0.6 : 0.4, B.outerRm + formM);
      lose(B.rf, foe, won ? (big ? 0.6 : 0.4) : 0.12, B.outerRf + formF);
    }
    // 收场：不让在场弟子与方阵瞬间凭空蒸发，而是整编飞返大营或山门（如战事随即落幕，end() 会再接力改道直飞各自山门）
    const ux = Math.cos(B.ea), uy = Math.sin(B.ea);
    const myFallbackX = B.x - ux * 2200, myFallbackY = B.y - uy * 2200;
    const foeFallbackX = B.x + ux * 2400, foeFallbackY = B.y + uy * 2400;
    const myRet = this.returnDestFor(mine, w, B.side, myFallbackX, myFallbackY);
    const foeRet = this.returnDestFor(foe, w, (1 - B.side) as 0 | 1, foeFallbackX, foeFallbackY);

    for (const s of B.airships) {
      this.handleAirshipBattleAccounting(s, true);
      if (s.sunk) {
        if (s.wreckT > 0) this.postAirships.push(s);
        continue;
      }
      // 存活战船不瞬间消失，连同护航弟子一起沿着大营/山门路线飞返撤离
      const sSide: 0 | 1 = s.ours ? B.side : (1 - B.side) as 0 | 1;
      const dest = this.returnDestFor(s.sid, w, sSide, s.ours ? myRet.x : foeRet.x, s.ours ? myRet.y : foeRet.y);
      const dist = Math.hypot(dest.x - s.x, dest.y - s.y);
      const dur = clamp(dist / 280 + 3.0, 14, 75);
      s.retreatTx = dest.x;
      s.retreatTy = dest.y;
      s.retreatMode = 'return';
      s.retreatFadeMax = dur;
      s.retreatFadeT = dur;
      this.postAirships.push(s);
    }
    for (const f of B.formations) {
      if ((f.leader as any)?.warForm === f) (f.leader as any).warForm = undefined;
      if (f.soldiers <= 0 && (!f.collapsed || f.collapseT <= 0)) continue;
      const fSide: 0 | 1 = f.ours ? B.side : (1 - B.side) as 0 | 1;
      const dest = this.returnDestFor(f.sid, w, fSide, f.ours ? myRet.x : foeRet.x, f.ours ? myRet.y : foeRet.y);
      const dist = Math.hypot(dest.x - f.x, dest.y - f.y);
      const spd = f.ours ? 240 : 280;
      const dur = clamp(dist / spd + 2.5, 14, 75);
      f.warId = w.id;
      f.retreatMode = f.ours ? 'return' : 'rout';
      f.retreatX = dest.x;
      f.retreatY = dest.y;
      f.retreatFadeMax = dur;
      f.retreatFadeT = dur;
      this.postFormations.push(f);
    }

    const pushPostActor = (e: Enemy, ours: boolean) => {
      const eSid = (e as any).warRos?.[0] ?? (e as any).swOuterCapSid ?? (ours ? mine : foe);
      const eSide: 0 | 1 = ours ? B.side : (1 - B.side) as 0 | 1;
      const dest = this.returnDestFor(eSid, w, eSide, ours ? myRet.x : foeRet.x, ours ? myRet.y : foeRet.y);
      const tx = dest.x + rand(-180, 180);
      const ty = dest.y + rand(-120, 120);
      const flying = e.realm >= 1;
      const dist = Math.hypot(tx - e.x, ty - e.y);
      const dur = clamp(dist / (flying ? 420 : 230) + 2.5, 14, 75);
      const st = new CharState(e.x, e.y);
      st.faceToward(tx - e.x, ty - e.y, false);
      this.postActors.push({
        x: e.x, y: e.y, tx, ty,
        look: e.look, st, t: Math.random() * 2,
        dur, maxDur: dur, ours, name: e.shortName ?? e.name, flying,
        warId: w.id, sid: eSid,
      });
    };

    for (const e of B.foes) {
      if (!e.dead && !e.gone) {
        (e as any).warCounted = true;
        pushPostActor(e, false);
        e.gone = true;
      }
    }
    for (const e of B.allies) {
      if (!e.dead && !e.gone) {
        pushPostActor(e, true);
        e.gone = true;
      }
    }
    g.combat.enemies = g.combat.enemies.filter((e) => !e.gone);
    g.combat.allies = g.combat.allies.filter((e) => !e.gone);
    const bIdx = this.battles.indexOf(B);
    if (bIdx >= 0) this.battles.splice(bIdx, 1);
    w.lastFight = g.day; w.lastAct = g.day; w.next = Math.max(Math.min(w.next, g.day + 30), g.day + 5);
    this.resetAttritionAfterClash(w);
    const kind = B.zhen ? '破阵之战' : big ? '灭宗大战' : '会战', tally = `${this.name(mine)}出战 ${B.m0} 人、折 ${B.km} 人；${this.name(foe)}出战 ${B.f0} 人、折 ${B.kf} 人`;
    if (mine === MY) (g.mysect as any).log(`${this.tgtName(w)}${kind}${won ? '得胜' : '失利'}：出战 ${B.m0} 人，折 ${B.km} 人，斩敌 ${B.kf} 人。`);
    if (live) {
      w.wins = (w.wins ?? 0) + 1;
      const m = 40 + 20 * g.hero.realm + B.kf * 2; g.war.merit += m;
      const rawLing = Math.round(100 * Math.pow(2.6, Math.min(4, g.hero.realm)) * (1 + B.kf / 20));
      const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
      const ling = ACTIVE_WORLD === 'human' ? rawLing : scaleFromMortalStones(rawLing, ACTIVE_WORLD, 5);
      C.addItem(g.hero, curId, ling);
      if (mine !== MY) { g.rel.addSect(mine, 3); if (g.ws.sect?.id === mine) g.ws.sect.contrib += 30 + 20 * g.hero.realm; }
      g.toast(`${this.tgtName(w)}·${kind}大胜！${why}，缴获${curName} ${ling}`, 'good');
      this.fulfillWarOrders(w.id, ['seize', 'siege']);
      g.rel.log(`你在${this.tgtName(w)}为${this.name(mine)}打赢了一场${kind}。`, 'good');
      this.note(w, `苏寒亲自上阵，${this.name(mine)}在${this.tgtName(w)}${kind}大胜。${tally}。`);
    } else {
      g.toast(`${why}——余下的人自己把仗打完：${this.name(mine)}${won ? '胜了' : '败了'}。`, won ? 'info' : 'warn');
      this.note(w, `${this.tgtName(w)}${kind}：${this.name(mine)}${won ? '胜' : '败'}。${tally}。`);
    }
    g.juice?.(0.1, 0.5);
    if (w.campaign) {
      const st = g.war.st(w.campaign);
      if (live) {
        st.wins = (st.wins ?? 0) + 1;
        st.score = clamp(st.score + (B.side === 0 ? 12 : -12), -100, 100);
        w.score = st.score;
      } else {
        st.score = clamp(st.score + (won ? (B.side === 0 ? 6 : -6) : (B.side === 0 ? -6 : 6)), -100, 100);
        w.score = st.score;
      }
      w.wave++;
      return;
    }
    const atkWon = won === (w.ini === B.side);
    if (!B.zhen) { this.after(w, atkWon, big); return; }
    // 破阵之战：攻方得手则大阵受创 / 告破；守住了，攻方再冲几次不破便会退兵
    w.wave++; w.zt = (w.zt ?? 0) + 1;
    const zn = this.zhenName(D);
    if (atkWon) {
      if (live) { this.zhenSet(D, 0); this.note(w, `守阵弟子尽没，${this.name(A)}一举击碎「${zn}」阵眼——${this.name(D)}护宗大阵告破！接下来便是灭宗大战。`, true); }
      else { this.zhenSet(D, Math.max(0, this.zhenHp(D) - this.zhenCap(D) * 0.5)); this.note(w, `${this.name(A)}冲到阵前，「${zn}」光幕大损。`, true); }
    } else if (A !== MY && w.zt >= 5) this.end(w, (1 - w.ini) as 0 | 1, `${this.name(A)}久攻${this.name(D)}护宗大阵不下，锐气尽失，罢兵而去`, true);
    else this.note(w, `${this.name(A)}在「${zn}」前碰得头破血流。`);
    this.settle(w);
  }
  /** 大会战的战况（屏幕上方的兵力条，含阵型、全军令、三段流程阶段与战损三分账） */
  hud(): {
    title: string; mn: string; fn: string; m: number; m0: number; f: number; f0: number; sub: string;
    mForms: number; fForms: number; mOuterField: number; fOuterField: number; order: BattleOrder;
    stage: 'muster' | 'march' | 'standoff' | 'clash'; stageLabel: string; standoffT: number;
    advM: number; advF: number; triggerEvent?: string;
    loss?: { km: number; kf: number; outerKm: number; outerJm: number; outerKf: number; outerJf: number };
  } | null {
    const B = this.battle; if (!B) return null;
    const w = this.S.wars.find((x) => x.id === B.war); if (!w) return null;
    const big = B.ma === 'all' && B.md === 'all', D = this.def(w);
    const mForms = B.formations.filter((x) => x.ours && !x.collapsed);
    const fForms = B.formations.filter((x) => !x.ours && !x.collapsed);
    const mOuterField = mForms.reduce((s, x) => s + x.soldiers, 0);
    const fOuterField = fForms.reduce((s, x) => s + x.soldiers, 0);
    const allyShipCrew = B.airships.reduce((s, sh) => s + (sh.ours && !sh.sunk ? Math.max(1, sh.crew) : 0), 0);
    const foeShipCrew = B.airships.reduce((s, sh) => s + (!sh.ours && !sh.sunk ? Math.max(1, sh.crew) : 0), 0);
    const mRemain = B.rm.length + B.allies.length + B.outerRm + mOuterField + B.cmdRm.length + B.bossRm.length + allyShipCrew;
    const fRemain = B.rf.length + B.foes.length + B.outerRf + fOuterField + B.cmdRf.length + ((big || (B.gate && !B.zhen)) ? B.bossRf.length : 0) + foeShipCrew;
    const extraZones = this.battles.length > 1 ? ` (+${this.battles.length - 1}处并发战区)` : '';
    const stageLabel = B.stage === 'muster'
      ? `战兵集结成阵 (${Math.max(0, B.stageT).toFixed(1)}s)`
      : B.stage === 'march'
        ? `两军列阵推进 (${Math.max(0, B.stageT).toFixed(1)}s)`
        : B.stage === 'standoff'
          ? `阵前叫阵对峙 (${Math.max(0, B.standoffT).toFixed(1)}s)`
          : (B.cmdDeployedF || B.cmdDeployedM)
            ? (B.bossDeployedF ? '存亡死战·底牌尽出' : '统帅亲临·白热死斗')
            : '前锋战阵交锋';
    return {
      title: `${B.zhen ? '破阵之战' : big ? '灭宗大战' : w.campaign ? '大阵会战' : '宗门会战'} · ${this.tgtName(w)}${extraZones}`,
      mn: this.sideName(w, B.side), fn: this.sideName(w, (1 - B.side) as 0 | 1),
      m: mRemain, m0: B.m0, f: fRemain, f0: B.f0,
      mForms: mForms.length, fForms: fForms.length, mOuterField, fOuterField, order: this.battleOrderNow(),
      stage: B.stage, stageLabel, standoffT: B.standoffT, advM: B.advM, advF: B.advF, triggerEvent: B.triggerEvent,
      loss: { km: B.km, kf: B.kf, outerKm: B.outerKm, outerJm: B.outerJm, outerKf: B.outerKf, outerJf: B.outerJf },
      sub: `${B.zhen ? `「${this.zhenName(D)}」阵力 ${Math.round((this.zhenHp(D) / Math.max(1, this.zhenCap(D))) * 100)}%　` : ''}${stageLabel}　优势 我×${B.advM.toFixed(2)} vs 敌×${B.advF.toFixed(2)}　已斩 ${B.kf} · 已折 ${B.km}`,
    };
  }
  battleOrderNow(): BattleOrder { return this.S.myOrder ?? 'charge'; }
  setBattleOrder(o: BattleOrder) { this.S.myOrder = o; this.game.updateUI(true); }
  patternList() { return FORM_PATTERNS; }
  patternNow(): FormPattern { return this.S.myPattern ?? 'square'; }
  setPattern(p: FormPattern) { this.S.myPattern = p; this.game.updateUI(true); }
  /** 眼下能否御剑亲征（'' = 可以） */
  private marchWhy(w: SWar): string {
    const g = this.game, fp = this.frontPos(w);
    if (!fp) return '战场不明';
    if (fp.map !== ACTIVE_MAP) return `战场在${MAP_NAME[fp.map as keyof typeof MAP_NAME] ?? '别处'}，须先赶过去`;
    if (this.hasBattleForWar(w.id)) return '正在厮杀';
    if (g.hero.dead) return '重伤未愈';
    if (g.pursuit.active || (g.war as any).battle) return '眼下脱不开身';
    if ((g as any).inCave) return '先出洞府';
    return '';
  }
  /** 下令开拔赶赴前线强攻：标出路线、放出先遣/主力纵队并御剑前往，抵近前线后自动列阵接战 */
  dispatchToFront(w: SWar, opt: { ma?: Mode; n?: number } = {}) {
    const g = this.game, fp = this.frontPos(w), side = this.sideOf(w), why = this.marchWhy(w);
    if (!fp || side === undefined || why) { g.toast(why || '去不了前线', 'warn'); return; }
    if (w.phase === 'prep') { w.phase = 'battle'; w.prepUntil = g.day; }
    this.pendingOpt.set(w.id, opt);
    this.standoffOpt.delete(w.id);
    w.lastAct = g.day;
    const p = g.player;
    const dist = Math.hypot(fp.x - p.x, fp.y - p.y);
    if (dist < 1700) {
      this.pendingOpt.delete(w.id);
      this.startBattle(w, side, fp, opt);
      return;
    }
    const label = `${this.tgtName(w)}前线`;
    g.setGuide(fp.x, fp.y, label);
    if (g.hero.realm >= 2 && (g.isFlying || p.flying)) {
      g.startAutoFlight(fp.x, fp.y, label);
    } else {
      g.destination = { x: fp.x, y: fp.y, name: label };
    }
    const sid = side === 0 ? w.a : w.b;
    if (!this.activeMarches().some((m) => m.warId === w.id && m.side === side && m.kind === 'army')) {
      this.spawnMarch(w, side, 'army', { sid, soldiers: Math.min(280, Math.max(120, opt.n ?? 180)), musterSec: 1.5 });
    }
    g.toast(`大军已于山门集结开拔！请御剑赶赴${label}（地图已标出虚线）`, 'good');
  }

  /** 下令开拔赴前线列阵对峙：先集结行军、安营列阵对峙（斗将/截粮/袭扰蓄势），不直接开火强攻 */
  dispatchToStandoff(w: SWar, opt: { ma?: Mode; n?: number } = {}) {
    const g = this.game, fp = this.frontPos(w), side = this.sideOf(w), why = this.marchWhy(w);
    if (!fp || side === undefined || why) { g.toast(why || '去不了前线', 'warn'); return; }
    if (w.phase === 'prep') { w.phase = 'battle'; w.prepUntil = g.day; }
    this.pendingOpt.delete(w.id);
    this.standoffOpt.set(w.id, { ma: opt.ma, n: opt.n });
    w.lastAct = g.day;
    const p = g.player;
    const sid = side === 0 ? w.a : w.b;
    if (!this.activeMarches().some((m) => m.warId === w.id && m.side === side && m.kind === 'army')) {
      this.spawnMarch(w, side, 'army', { sid, soldiers: Math.min(280, Math.max(120, opt.n ?? 160)), musterSec: 2.0 });
    }
    const dist = Math.hypot(fp.x - p.x, fp.y - p.y);
    if (dist < 1700) {
      g.toast(`已在${this.tgtName(w)}阵前摆开对峙阵势，可按 [T] 斗将/奇袭或随时鸣鼓总攻！`, 'good');
      this.openStandoffMenu(w);
      return;
    }
    const label = `${this.tgtName(w)}对峙阵前`;
    g.setGuide(fp.x, fp.y, label);
    if (g.hero.realm >= 2 && (g.isFlying || p.flying)) {
      g.startAutoFlight(fp.x, fp.y, label);
    } else {
      g.destination = { x: fp.x, y: fp.y, name: label };
    }
    g.toast(`大军已集结开拔！赶赴${label}后将先行列阵对峙（斗将/截粮蓄势）`, 'good');
  }
  /** 宗主亲征（脚本/近距直接列阵用） */
  private march(w: SWar, opt: { ma?: Mode; n?: number } = {}) {
    const g = this.game, fp = this.frontPos(w), side = this.sideOf(w), why = this.marchWhy(w);
    if (!fp || side === undefined || why) { g.toast(why || '去不了前线', 'warn'); return; }
    let x = fp.x, y = fp.y;   // 落脚点：前线左近找一处能站人的地方
    for (let i = 0; i < 24 && g.terrain.walkFactor(x, y) <= 0; i++) { const a = i * 0.9, R = 200 + i * 60; x = fp.x + Math.cos(a) * R; y = fp.y + Math.sin(a) * R; }
    g.teleport(x, y);
    w.lastAct = g.day;
    this.startBattle(w, side, { x, y }, opt);
  }
  // ---------------------------------------------------------------- v0.62 亲卫
  private guards: Enemy[] = [];
  /** 亲卫：宗主点的随行门人——在野外跟在身边（秘境 / 洞府里不跟），死了就是真的死了 */
  private guardTick() {
    const g = this.game, m = this.my, p = g.player;
    for (const e of this.guards) if (e.dead && !(e as any).warCounted) { (e as any).warCounted = true; this.kill(MY, [(e as any).swDs]); g.toast(`亲卫${e.name}战死。`, 'warn'); }
    this.guards = this.guards.filter((e) => !e.dead && !e.gone && g.combat.allies.includes(e));
    const ids = m?.guard ?? [];
    if (!m || !ids.length || g.hero.dead || (g as any).inCave || (g as any).mijing?.active || (g as any).yuanying?.active) {
      if (this.guards.length) { g.combat.dismissAllies((e) => e.tag === 'sect:guard'); this.guards = []; }
      return;
    }
    m.guard = ids.filter((id) => m.ds.some((d) => d.id === id));
    for (const e of this.guards) if (!m.guard.includes((e as any).swDs)) e.gone = true;
    const have = new Set(this.guards.map((e) => (e as any).swDs));
    for (const id of m.guard) {
      if (have.has(id)) continue;
      const d = m.ds.find((x) => x.id === id); if (!d || d.realm < 1) continue;
      const a = Math.random() * 6.28, e = this.spawn(MY, { ref: id, realm: d.realm, stage: d.stage, top: false }, p.x + Math.cos(a) * 150, p.y + Math.sin(a) * 110, true);
      if (e) { e.tag = 'sect:guard'; e.aggro = false; this.guards.push(e); g.combat.vfx.push({ kind: 'blinkfx', x: e.x, y: e.y, r: 70, t: 0, dur: 0.5, color: '200,230,255' }); }
    }
  }

  // ---------------------------------------------------------------- 地图标记 / 玉符
  marks(): { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] {
    const out: { x: number; y: number; glyph: string; color: string; ring?: number; name: string }[] = [], S = this.S;
    const campPts: { x: number; y: number }[] = [];
    for (const w of S.wars) {
      const fp = this.frontPos(w); if (!fp || fp.map !== ACTIVE_MAP) continue;
      const mine = this.sideOf(w) !== undefined;
      out.push({ x: fp.x, y: fp.y, glyph: '攻', color: mine ? '#ff6a3a' : '#c8a080', ring: mine ? 1700 : undefined, name: `${this.title(w)}·${this.tgtName(w)}战场` });
      for (const sIdx of [0, 1] as const) {
        const cp = this.campPos(w, sIdx);
        const cmp = sIdx === 0 ? w.campA : w.campB;
        if (cp && cmp && cp.map === ACTIVE_MAP) {
          if (campPts.some((q) => Math.hypot(q.x - cp.x, q.y - cp.y) < 900)) continue;
          campPts.push({ x: cp.x, y: cp.y });
          const lv = this.campLevel(cmp);
          const sectCount = this.sideSects(w, sIdx).length;
          const campStage = cmp.build < 0.25 ? '勘址扎营中' : cmp.build < 0.75 ? '筑营施工中' : `Lv${lv}`;
          out.push({ x: cp.x, y: cp.y, glyph: '营', color: mine && this.sideOf(w) === sIdx ? '#ffd27a' : '#b8b0a0', name: `${this.sideName(w, sIdx)}${sectCount > 1 ? `(${sectCount}宗连营)` : '大营'}（${campStage}·守兵 ${cmp.soldiers}·丹药 ${Math.round(cmp.pills)}）` });
        }
      }
    }
    for (const mc of this.activeMarches()) {
      const pos = this.marchPos(mc);
      if (!pos || pos.map !== ACTIVE_MAP) continue;
      const w = S.wars.find((x) => x.id === mc.warId);
      const mine = w ? this.sideOf(w) : undefined;
      const isFoe = mine !== undefined && mine !== mc.side;
      out.push({
        x: pos.x, y: pos.y,
        glyph: mc.escorted ? '护' : pos.mustering ? '集' : isFoe ? '劫' : mc.kind === 'convoy' ? '运' : '军',
        color: mc.escorted ? '#ffe078' : isFoe ? '#ff8b4a' : mc.kind === 'convoy' ? '#7fd0ff' : '#ffd27a',
        name: `${this.name(mc.sid)}${mc.kind === 'convoy' ? '运丹车队' : '行军纵队'}（${pos.mustering ? '山门集结中' : mc.escorted ? `护送中 ${Math.round(pos.progress * 100)}%` : `${Math.round(pos.progress * 100)}%`}）`,
      });
    }
    for (const id of this.holdsOf(MY)) { const l = LOC_BY_ID.get(id)!; if (l.map === ACTIVE_MAP) out.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE + 260, glyph: '守', color: '#ffd27a', name: `${this.name(MY)}据点·${l.name}（镇守 ${S.hold[id].g} 人）` }); }
    for (const id of Object.keys(S.gone ?? {})) { const l = LOC_BY_ID.get(id), br = (S.branch ?? []).includes(id); if (l && l.map === ACTIVE_MAP) out.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE + 260, glyph: br ? '舵' : '墟', color: br ? '#ffd27a' : '#b8b0a0', name: br ? `${sectTitle(id)}（${this.name(MY)}分宗·分舵）` : `${sectTitle(id)}故地（道统已绝）` }); }
    return out;
  }
  private goFront(w: SWar) { const fp = this.frontPos(w), g = this.game; if (fp && fp.map === ACTIVE_MAP) { const label = `${this.tgtName(w)}前线`; g.setGuide(fp.x, fp.y, label); g.destination = { x: fp.x, y: fp.y, name: label }; g.toast(`前线在${this.tgtName(w)}一带（地图已标出「攻」与路线虚线）`, 'info'); } else g.toast(`战场在${MAP_NAME[(fp?.map ?? 'renjie') as keyof typeof MAP_NAME] ?? '别处'}，须先赶过去。`, 'info'); }
  /** 传音玉符 · 宗门召集 */
  jadeOpts(j: Jade, back: () => DNode): DOpt[] {
    const g = this.game, w = this.S.wars.find((x) => x.id === j.sw);
    if (!w) { j.done = true; return []; }
    if (w.side !== undefined) return [{ label: `赶赴前线（${this.tgtName(w)}）`, tone: 'gold', act: () => { this.goFront(w); return null; } }];
    return [
      { label: `应召，赶赴${this.tgtName(w)}前线`, tone: 'gold', act: () => { w.side = j.side ?? 0; this.goFront(w); return null; } },
      { label: '置之不理', act: () => { j.done = true; w.called = false; if (g.ws.sect) g.rel.addSect(g.ws.sect.id, -6); return back(); } },
    ];
  }

  // ---------------------------------------------------------------- v0.71 宗门面板：公开接口
  // 面板与对话树调的是同一批方法：战报细节仍在 myWarNode / warText 里，这里只做读写与摘要。
  /** 守御之策三档（面板上的三颗按钮） */
  defList(): { m: Mode; name: string; hint: string }[] {
    return [
      { m: 'wave', name: DEF_NAME.wave, hint: '敌人来攻据点时一批批往里填人：折损小，守得久' },
      { m: 'all', name: DEF_NAME.all, hint: '全宗回援：一战定生死，前方赢面大、后方空虚' },
      { m: 'hold', name: DEF_NAME.hold, hint: '只凭镇守的弟子硬扛，不另派援军' },
    ];
  }
  defNow(): Mode { return this.S.myDef ?? 'wave'; }
  setDefense(m: Mode) { this.S.myDef = m; this.game.updateUI(true); }
  /** 本宗战事总览：据点、可调之兵、月入、进行中的战事 */
  myWarSummary() {
    const m = this.my, S = this.S;
    if (!m) return null;
    const sc = this.scale(MY), hs = this.holdsOf(MY), brs = S.branch ?? [];
    let income = 0; for (const id of hs) income += this.holdIncome(id);
    let branchIncome = 0; for (const id of brs) branchIncome += BRANCH[this.scale(id)];
    return {
      holdMax: HOLDS[sc], holdCount: hs.length, income, branchIncome, free: this.myFree(), gar: this.myGar(),
      outerFree: this.game.mysect.outerAlive(), servantCount: this.game.mysect.servantAlive(), pattern: this.patternNow(),
      holds: hs.map((id) => ({
        id,
        name: LOC_BY_ID.get(id)?.name ?? id,
        g: S.hold[id]?.g ?? 0,
        income: this.holdIncome(id),
        commanderId: S.hold[id]?.commanderId,
        commanderName: S.hold[id]?.commanderName,
        fortLv: S.hold[id]?.fortLv ?? 0,
      })),
      branches: brs.map((id) => ({ id, name: sectTitle(id), income: BRANCH[this.scale(id)] })),
      wars: S.wars.filter((w) => w.a === MY || w.b === MY).map((w) => this.warBrief(w)),
      zhenHp: Math.round(this.zhenHp(MY)), zhenCap: this.zhenCap(MY), zhenName: this.zhenName(MY),
      vassal: Object.keys(S.vassal ?? {}), branch: brs, mieN: S.mieN ?? 0,
    };
  }
  isBranch(id: string) { return !!(this.S.branch ?? []).includes(id); }
  /** 一场战事的摘要（面板列表用；细节仍走 myWarNode） */
  warBrief(w: SWar) {
    return {
      id: w.id, title: this.title(w), zm: this.isZM(w), target: this.tgtName(w), wave: w.wave, la: w.la, lb: w.lb,
      attName: this.name(this.att(w)), attId: this.att(w), defName: this.name(this.def(w)), defId: this.def(w),
      mine: w.a === MY || w.b === MY, fall: !!w.fall, why: w.why,
    };
  }
  /** 与我宗的称呼：相安 / 冷淡 / 不睦 / 对峙 / 剑拔弩张 */
  relName(a: string, b: string) { const t = this.tension(a, b); return t >= 80 ? '剑拔弩张' : t >= 55 ? '对峙' : t >= 30 ? '不睦' : t >= 10 ? '冷淡' : '相安'; }
  /** 世仇缘由（没有则空串） */
  feudWhy(a: string, b: string) { const f = FEUD_LIST.find(([x, y]) => (x === a && y === b) || (x === b && y === a)); return f ? f[2] : ''; }
  /** 同盟名号（同气连枝的那一支；没有则空串） */
  allyName(sid: string) { return allyOf(sid); }
  /** 能不能向它宣战 */
  canDeclare(sid: string): { ok: boolean; why: string } {
    const m = this.my, S = this.S;
    if (!m) return { ok: false, why: '尚未开宗立派' };
    if (sid === MY) return { ok: false, why: '那是本宗' };
    if (this.between(MY, sid)) return { ok: false, why: '已在此战中' };
    if ((S.truce[key(MY, sid)] ?? 0) > this.game.day) return { ok: false, why: '停战之约未满' };
    if (this.combatTotal(MY) < 12) return { ok: false, why: '战兵不足十二（炼气六层以上）' };
    if (!LOC_BY_ID.has(sid)) return { ok: false, why: '这一图没有此派' };
    return { ok: true, why: '' };
  }
  /** 向它宣战（真的开打；调用方自行确认过一次） */
  declareOn(sid: string): SWar | null {
    if (!this.canDeclare(sid).ok) return null;
    this.game.rel.addSect(sid, -30);
    this.initHolds();
    return this.declare(MY, sid, `${this.my!.name}宗主一声令下`);
  }
  holdMax() { return HOLDS[this.scale(MY)]; }
  holdFull() { return this.holdsOf(MY).length >= this.holdMax(); }
  /** 据点候选：本图可镇守的城镇，本宗的排前面，其余按离山门远近 */
  holdCandidates(limit = 10) {
    const G = LOC_BY_ID.get(MY), S = this.S;
    if (!G) return [];
    return ALL_LOCATIONS.filter((l) => l.map === G.map && this.holdable(l))
      .map((l) => {
        const h = S.hold[l.id];
        return {
          id: l.id, name: l.name, type: l.type, desc: l.desc, x: l.x, y: l.y,
          dir: dirName(l.x - G.x, l.y - G.y),
          dist: Math.max(1, Math.round((Math.hypot(l.x - G.x, l.y - G.y) * WORLD_SCALE) / 260)),
          owner: h?.o ?? '', ownerName: h?.o ? this.name(h.o) : '无主', g: h?.g ?? 0, income: this.holdIncome(l.id),
          fortLv: h?.fortLv ?? 0, commanderId: h?.commanderId, commanderName: h?.commanderName,
        };
      })
      .sort((a, b) => (a.owner === MY ? -1 : b.owner === MY ? 1 : a.dist - b.dist))
      .slice(0, limit);
  }
  /** 检查某地点是否在本宗山门/连片据点邻近可辐射范围（<= 140 地图单位） */
  myHoldReachable(l: LocDef): boolean {
    const G = LOC_BY_ID.get(MY);
    if (!G || l.map !== G.map) return false;
    const anchors: LocDef[] = [G];
    for (const id of this.holdsOf(MY)) {
      const hl = LOC_BY_ID.get(id);
      if (hl && hl.map === G.map && !this.S.hold[id]?.isolated) anchors.push(hl);
    }
    for (const id of this.S.branch ?? []) {
      const bl = LOC_BY_ID.get(id);
      if (bl && bl.map === G.map) anchors.push(bl);
    }
    return anchors.some((a) => Math.hypot(a.x - l.x, a.y - l.y) <= Math.round(140 * this.holdDistMul(l.map)));
  }
  /** 进驻无主之地 */
  holdPlant(id: string, n: number): boolean {
    const S = this.S, m = this.my, l = LOC_BY_ID.get(id);
    if (!m || !l || !this.holdable(l) || S.hold[id] || this.holdFull() || this.myFree() < n || !this.myHoldReachable(l)) return false;
    S.hold[id] = { o: MY, g: n };
    this.refreshContiguousHolds();
    (this.game.mysect as any).log(`派 ${n} 名弟子进驻${l.name}。`);
    this.game.toast(`${m.name}弟子进驻${l.name}`, 'good');
    this.game.updateUI(true);
    return true;
  }
  /** 给本宗据点增派 / 撤回 */
  holdAdd(id: string, n = 5): boolean { const h = this.S.hold[id]; if (!h || h.o !== MY || this.myFree() < n) return false; h.g += n; this.game.updateUI(true); return true; }
  holdWithdraw(id: string, n = 5): boolean { const h = this.S.hold[id]; if (!h || h.o !== MY || h.g <= n) return false; h.g -= n; this.game.updateUI(true); return true; }
  holdDrop(id: string): boolean { const S = this.S, h = S.hold[id]; if (!h || h.o !== MY) return false; delete S.hold[id]; this.game.updateUI(true); return true; }
  /** 强占别派据点：没有战就打起来（返回这场战事） */
  holdSeize(id: string): SWar | null {
    const S = this.S, h = S.hold[id], m = this.my, l = LOC_BY_ID.get(id);
    if (!m || !h || !l || h.o === MY) return null;
    if ((S.truce[key(MY, h.o)] ?? 0) > this.game.day) return null;
    if (this.combatTotal(MY) < 12) return null;
    const w = this.between(MY, h.o);
    if (w) { w.ini = w.a === MY ? 0 : 1; w.tgt = id; w.streak = 0; w.lastAct = this.game.day; this.game.updateUI(true); return w; }
    this.game.rel.addSect(h.o, -30);
    this.initHolds();
    return this.declare(MY, h.o, `争夺${l.name}`, id);
  }

  // ---------------------------------------------------------------- 面板：天下宗门
  private statText(sid: string) { return `${SCALE_NAME[this.scale(sid)]} · ${DAO_NAME[this.dao(sid)]} · 总门人 ${this.alive(sid)}（可战 ${this.combatTotal(sid)}）`; }
  private warText(w: SWar) {
    const lean = w.score > 20 ? `${this.name(w.a)}占上风` : w.score < -20 ? `${this.name(w.b)}占上风` : '两家相持';
    return `${this.title(w)}\n起因：${w.why}　已打 ${w.wave} 阵，${lean}\n眼下${this.name(this.att(w))}主攻，兵锋指向${this.tgtName(w)}\n折损：${this.name(w.a)} ${w.la} 人 · ${this.name(w.b)} ${w.lb} 人`;
  }
  /** 风声：本图最紧张、又还没打起来的几对（面板「天下宗门」顶部用；原本只有玉符对话里有） */
  hotPairs(limit = 5) {
    const ids = this.sects(ACTIVE_MAP), out: { a: string; b: string; an: string; bn: string; t: number; word: string }[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (this.between(ids[i], ids[j])) continue;
      const t = this.tension(ids[i], ids[j]);
      if (t >= 55) out.push({ a: ids[i], b: ids[j], an: this.name(ids[i]), bn: this.name(ids[j]), t, word: this.relWord(t) });
    }
    return out.sort((x, y) => y.t - x.t).slice(0, limit);
  }
  /** 已除名的宗门（被灭 / 被收编的，都不在了） */
  goneSects() { return Object.keys(this.S.gone ?? {}).map((id) => sectTitle(id)); }
  /** 本宗每月从据点 / 分舵 / 附庸各得多少（据点和分舵按宗主抽成分账，附庸月供径入供奉） */
  myMonthlyIncome() {
    const S = this.S;
    let holds = 0; for (const id of this.holdsOf(MY)) holds += this.holdIncome(id);
    let branch = 0; for (const id of S.branch ?? []) branch += BRANCH[this.scale(id)];
    let vassal = 0; for (const id of Object.keys(S.vassal ?? {})) vassal += VASSAL[this.scale(id)];
    return { holds: Math.round(holds), branch, vassal };
  }

  node(): DNode {
    this.initHolds();
    const S = this.S, ids = this.sects(ACTIVE_MAP), cnt = { da: 0, zhong: 0, xiao: 0 };
    for (const s of ids) cnt[this.scale(s)]++;
    const wars = S.wars.filter((w) => LOC_BY_ID.get(w.a)?.map === ACTIVE_MAP), far = S.wars.length - wars.length;
    const lines = [
      `${MAP_NAME[ACTIVE_MAP]}现有 ${ids.length} 派（大 ${cnt.da} · 中 ${cnt.zhong} · 小 ${cnt.xiao}），眼下${wars.length ? ` ${wars.length} 场战事` : '尚无战事'}${far ? `，别处另有 ${far} 场` : ''}。`,
      '各派的规模、据点、宗法与恩怨都在「宗主大殿 · 天下宗门」里，这里只管眼下的战事。',
      wars.length ? '战事：\n' + wars.map((w) => `· ${this.title(w)}——争${this.tgtName(w)}，第 ${w.wave + 1} 阵`).join('\n') : '',
    ].filter(Boolean);
    const o: DOpt[] = wars.map((w): DOpt => ({ label: `战事：${this.title(w)}`, tone: 'bad', act: () => this.warNode(w) }));
    // v0.71：宗主有自家宗门时，门派名录并入「宗主大殿 · 天下宗门」——同一份东西不再有第二个入口；
    // 散修 / 尚未立派的人没有那个面板，仍走对话里的名录。
    o.push(this.my
      ? { label: '各派名录（宗主大殿 · 天下宗门）', tone: 'gold', act: () => { this.game.openModal({ kind: 'sect', tab: 'world' }); return null; } }
      : { label: `各派名录（规模 · 宗法战阵 · 据点）`, tone: 'gold', act: () => this.listNode(0) });
    if (this.my) o.push({ label: `${this.my.name}的战事（镇守 · 调兵 · 宣战）`, tone: 'good', act: () => this.myNode() });
    o.push({ label: '回传音玉符', act: () => this.game.war.inboxNode() }, { label: '收起', act: () => null });
    return { speaker: '天下大势', title: '宗门争锋', mood: 'danger', text: lines.join('\n\n'), options: o };
  }
  private listNode(page: number): DNode {
    const ids = this.sects(ACTIVE_MAP).sort((a, b) => SCALE_W[this.scale(a)] - SCALE_W[this.scale(b)] || this.alive(b) - this.alive(a)), per = 9, pages = Math.max(1, Math.ceil(ids.length / per));
    const o: DOpt[] = ids.slice(page * per, page * per + per).map((s): DOpt => ({ label: `【${SCALE_NAME[this.scale(s)][0]}】${this.name(s)}　${DAO_NAME[this.dao(s)]} · ${this.alive(s)} 人${this.warOf(s) ? ' · 战时' : ''}`, tone: this.warOf(s) ? 'bad' : undefined, act: () => this.sectNode(s, () => this.listNode(page)) }));
    if (pages > 1) o.push({ label: `下一页（${page + 1}/${pages}）`, act: () => this.listNode((page + 1) % pages) });
    o.push({ label: '返回', act: () => this.node() });
    return { speaker: '各派名录', title: MAP_NAME[ACTIVE_MAP], mood: 'normal', text: '【大】【中】【小】为宗门规模。点开可看一派的门人、宗法战阵、镇守的据点与恩怨。', options: o };
  }
  /** 一派的底细——战事对话里「看敌情」用，只留打仗相关的（规模/宗法/大阵/据点/战况）；
   *  秘传、恩怨、声望这些在「宗主大殿 · 天下宗门」里有更全的一页，不在这儿重复。 */
  sectNode(sid: string, back: () => DNode): DNode {
    const S = this.S, hs = this.holdsOf(sid), al = allyOf(sid);
    const w = this.warOf(sid);
    const lines = [
      this.statText(sid) + (al ? `　联盟：${al}` : ''),
      `宗法：${this.docText(sid)}`,
      `护宗大阵：「${this.zhenName(sid)}」阵力 ${Math.round(this.zhenHp(sid))}/${Math.round(this.zhenCap(sid))}${S.vassal?.[sid] ? '　【本宗附庸】' : ''}`,
      `据点：${hs.length ? hs.map((id) => `${LOC_BY_ID.get(id)!.name}（镇守 ${S.hold[id].g} 人）`).join('、') : '山门之外别无据点'}`,
      w ? `战时：${this.warText(w)}` : '',
    ].filter(Boolean);
    const o: DOpt[] = [];
    if (w) o.push({ label: '看这场战事', tone: 'bad', act: () => this.warNode(w) });
    o.push({ label: '返回', act: back });
    return { speaker: this.name(sid), title: SCALE_NAME[this.scale(sid)], mood: 'normal', text: lines.join('\n'), options: o };
  }
  warNode(w: SWar): DNode {
    const g = this.game, S = this.S;
    if (!S.wars.includes(w)) return this.node();
    if (w.a === MY || w.b === MY) return this.myWarNode(w);
    const o: DOpt[] = [], side = w.side, mine = g.ws.sect?.id;
    if (side !== undefined) o.push({ label: `赶赴前线（${this.tgtName(w)}）——你在${this.name(side === 0 ? w.a : w.b)}一方，已胜 ${w.wins ?? 0} 阵`, tone: 'gold', act: () => { this.goFront(w); return null; } });
    else for (const k of [0, 1] as const) {
      const sid = k === 0 ? w.a : w.b, foe = k === 0 ? w.b : w.a, own = mine === sid;
      o.push({ label: own ? `以门人身份参战（${this.name(sid)}）` : `以散修身份投效${this.name(sid)}`, tone: 'gold', disabled: g.hero.realm < 2 || mine === foe, hint: mine === foe ? '你是对面的门人' : '须筑基以上', act: () => { w.side = k; if (!own) g.rel.addSect(foe, -8); g.rel.addSect(sid, 4); this.goFront(w); return null; } });
    }
    o.push({ label: `${this.name(w.a)}的底细`, act: () => this.sectNode(w.a, () => this.warNode(w)) }, { label: `${this.name(w.b)}的底细`, act: () => this.sectNode(w.b, () => this.warNode(w)) }, { label: '返回', act: () => this.node() });
    return { speaker: '宗门之战', title: this.title(w), mood: 'danger', text: `${this.warText(w)}\n\n${w.log.length ? w.log.slice(-5).join('\n') : '两家还在调兵遣将，尚未接战。'}\n\n亲自到前线（地图上的「攻」）便会接战；你杀的每一个人，都从对面的名册上划掉。`, options: o };
  }

  // ---------------------------------------------------------------- 面板：自家宗门的战事
  myNode(): DNode {
    const g = this.game, m = this.my, S = this.S;
    if (!m) return this.node();
    this.initHolds(); this.clampMyGar();
    const hs = this.holdsOf(MY), sc = this.scale(MY), wars = S.wars.filter((w) => w.a === MY || w.b === MY);
    let inc = 0; for (const id of hs) inc += this.holdIncome(id);
    const lines = [
      this.statText(MY),
      `宗法：${this.docText(MY)}`,
      `据点 ${hs.length}/${HOLDS[sc]}：${hs.length ? hs.map((id) => `${LOC_BY_ID.get(id)!.name}（镇守 ${S.hold[id].g} 人）`).join('、') : '尚无'}${inc ? `　月入约 ${inc} 灵石` : ''}`,
      `可调之兵 ${this.myFree()} 人（在外镇守 ${this.myGar()} 人）　守御之策：${DEF_NAME[S.myDef ?? 'wave']}`,
      `护宗大阵：${this.zhenCap(MY) ? `「${this.zhenName(MY)}」阵力 ${Math.round(this.zhenHp(MY))}/${this.zhenCap(MY)}` : '尚未布阵——敌人一到山门便是灭宗大战'}`,
      ...(Object.keys(S.vassal ?? {}).length || (S.branch ?? []).length ? [`附庸：${Object.keys(S.vassal ?? {}).map((id) => sectTitle(id)).join('、') || '无'}　分舵：${(S.branch ?? []).map((id) => sectTitle(id) + '故地').join('、') || '无'}`] : []),
      wars.length ? wars.map((w) => `战事：${this.warText(w)}${w.fall ? '\n【败者听候发落】' : ''}`).join('\n') : '眼下本宗没有战事。',
    ];
    const o: DOpt[] = wars.map((w): DOpt => ({ label: `调兵：与${this.name(w.a === MY ? w.b : w.a)}之战`, tone: 'bad', act: () => this.myWarNode(w) }));
    o.push({ label: '派弟子镇守据点', tone: 'good', disabled: !this.combatTotal(MY), hint: '尚无可用门人', act: () => this.myHoldNode() });
    o.push({ label: '向他派宣战', tone: 'bad', disabled: this.combatTotal(MY) < 12, hint: '战兵不足十二（炼气六层以上）', act: () => this.myDeclareNode(0) });
    o.push({ label: `守御之策：${DEF_NAME[S.myDef ?? 'wave']}（点击切换）`, hint: '敌人来攻据点时：逐波增援 / 全宗回援 / 只凭镇守', act: () => { S.myDef = S.myDef === 'all' ? 'hold' : S.myDef === 'hold' ? 'wave' : 'all'; return this.myNode(); } });
    o.push({ label: '护宗大阵（充能 · 变阵 · 扩建）', tone: 'gold', act: () => g.mysect.zhenNode() });
    o.push({ label: '天下宗门大势', act: () => this.node() }, { label: '回宗门', act: () => { g.openModal({ kind: 'sect' }); return null; } });
    return { speaker: m.name, title: '宗门战事', mood: 'danger', text: lines.join('\n'), options: o };
  }
  private myHoldNode(): DNode {
    const m = this.my!, S = this.S, G = LOC_BY_ID.get(MY), sc = this.scale(MY), hs = this.holdsOf(MY);
    if (!G) return this.myNode();
    const cand = ALL_LOCATIONS.filter((l) => l.map === G.map && this.holdable(l)).map((l) => ({ l, d: Math.hypot(l.x - G.x, l.y - G.y) })).sort((x, y) => x.d - y.d).slice(0, 9);
    const o: DOpt[] = cand.map(({ l, d }): DOpt => {
      const h = S.hold[l.id], own = h?.o === MY;
      return { label: `${l.name}（${own ? `本宗镇守 ${h.g} 人` : h ? `${this.name(h.o)}镇守 ${h.g} 人` : '无主'} · ${dirName(l.x - G.x, l.y - G.y)}方 ${Math.max(1, Math.round((d * WORLD_SCALE) / 260))} 里）`, tone: own ? 'good' : h ? 'bad' : undefined, act: () => this.holdActNode(l) };
    });
    o.push({ label: '返回', act: () => this.myNode() });
    return { speaker: m.name, title: '镇守据点', mood: 'normal', text: `${SCALE_NAME[sc]}可镇守 ${HOLDS[sc]} 处据点（现 ${hs.length} 处）。据点按月有进项；镇守的弟子不能再调去别处。\n无主之地派人进驻即可；别派的据点只能强占——那就是开战。\n可调之兵 ${this.myFree()} 人。`, options: o };
  }
  private holdActNode(l: LocDef): DNode {
    const m = this.my!, S = this.S, h = S.hold[l.id], sc = this.scale(MY), full = this.holdsOf(MY).length >= HOLDS[sc], back = () => this.myHoldNode();
    const o: DOpt[] = [];
    if (h?.o === MY) {
      const fortLv = h.fortLv ?? 0;
      const fortCost = [450, 900, 1600][fortLv] ?? 1600;
      const otherHolds = this.holdsOf(MY).filter((id) => id !== l.id);
      const captains = m.ds.filter((d) => d.realm >= 2);
      o.push({ label: '增派五人', disabled: this.myFree() < 5, hint: '可调之兵不足', act: () => { this.holdAdd(l.id, 5); return this.holdActNode(l); } });
      o.push({ label: '撤回五人', disabled: h.g <= 5, hint: '至少留五人', act: () => { h.g -= 5; return this.holdActNode(l); } });
      o.push({
        label: fortLv >= 3 ? '防御工事：已满级 (Lv.3)' : `升级防御工事至 Lv.${fortLv + 1}（耗 ${fortCost} 灵石）`,
        tone: 'gold',
        disabled: fortLv >= 3 || m.stones < fortCost,
        hint: fortLv >= 3 ? '已是最高工事' : '宗门灵石不足',
        act: () => { const r = this.upgradeHoldFort(l.id); this.game.toast(r.msg, r.ok ? 'good' : 'warn'); return this.holdActNode(l); },
      });
      o.push({
        label: h.commanderName ? `更换/卸任主将（现任：${h.commanderName}）` : '委任镇守主将（须筑基以上门人）',
        tone: 'good',
        disabled: !captains.length && !h.commanderId,
        hint: '尚无筑基以上门人',
        act: (): DNode => ({
          speaker: l.name,
          title: '委任据点主将',
          mood: 'normal',
          text: `主将坐镇可使${l.name}月入额外 +15%、战时守军更加稳固。${h.commanderName ? `\n当前主将：${h.commanderName}` : ''}`,
          options: [
            ...(h.commanderId ? [{ label: '卸任当前主将', tone: 'bad' as const, act: () => { this.assignHoldCommander(l.id, undefined); return this.holdActNode(l); } }] : []),
            ...captains.slice(0, 8).map((d) => ({
              label: `${d.name}（${realmName(d.realm, d.stage)}）${h.commanderId === d.id ? ' · 现任' : ''}`,
              act: () => { const r = this.assignHoldCommander(l.id, d.id); this.game.toast(r.msg, 'good'); return this.holdActNode(l); },
            })),
            { label: '返回', act: () => this.holdActNode(l) },
          ],
        }),
      });
      if (otherHolds.length && h.g > 5) {
        o.push({
          label: '据点之间直接调防换防',
          act: (): DNode => ({
            speaker: l.name,
            title: '跨据点调防',
            mood: 'normal',
            text: `从${l.name}（现有 ${h.g} 人）抽调 5 人直接赴他处据点协防：`,
            options: [
              ...otherHolds.slice(0, 8).map((oid) => ({
                label: `调拨 5 人 → ${LOC_BY_ID.get(oid)?.name ?? oid}（现 ${S.hold[oid]?.g ?? 0} 人）`,
                act: () => { const r = this.transferHoldGarrison(l.id, oid, 5); this.game.toast(r.msg, r.ok ? 'good' : 'warn'); return this.holdActNode(l); },
              })),
              { label: '返回', act: () => this.holdActNode(l) },
            ],
          }),
        });
      }
      o.push({ label: '弃守此地', tone: 'bad', act: () => { delete S.hold[l.id]; return back(); } });
    } else if (!h) {
      const near = this.myHoldReachable(l);
      for (const n of [6, 12, 20]) o.push({ label: `进驻：派 ${n} 人镇守`, tone: 'good', disabled: full || !near || this.myFree() < n, hint: !near ? '距本宗势力过远，鞭长莫及' : full ? '据点已满（宗门规模所限）' : '可调之兵不足', act: () => { S.hold[l.id] = { o: MY, g: n }; this.refreshContiguousHolds(); (this.game.mysect as any).log(`派 ${n} 名弟子进驻${l.name}。`); this.game.toast(`${m.name}弟子进驻${l.name}`, 'good'); return back(); } });
    } else {
      const foe = h.o, w = this.between(MY, foe), truce = (S.truce[key(MY, foe)] ?? 0) > this.game.day;
      o.push({ label: w ? `已与${this.name(foe)}交战——把兵锋转向此地` : `强占——向${this.name(foe)}宣战`, tone: 'bad', disabled: truce || this.combatTotal(MY) < 12, hint: truce ? '停战之约未满' : '战兵不足十二', act: () => {
        if (w) { w.ini = w.a === MY ? 0 : 1; w.tgt = l.id; w.streak = 0; w.lastAct = this.game.day; return this.myWarNode(w); }
        this.game.rel.addSect(foe, -30); return this.myWarNode(this.declare(MY, foe, `争夺${l.name}`, l.id));
      } });
      o.push({ label: `${this.name(foe)}的底细`, act: () => this.sectNode(foe, () => this.holdActNode(l)) });
    }
    o.push({ label: '返回', act: back });
    return { speaker: l.name, title: h ? `${this.name(h.o)}据点 · 镇守 ${h.g} 人` : '无主之地', mood: 'normal', text: `${l.desc}\n\n${h?.o === MY ? `月入约 ${this.holdIncome(l.id)} 灵石。` : ''}可调之兵 ${this.myFree()} 人。`, options: o };
  }
  private myDeclareNode(page: number): DNode {
    const g = this.game, m = this.my!, S = this.S, per = 8;
    const ids = this.sects(m.map).filter((s) => s !== MY && !this.between(MY, s)).sort((a, b) => this.tension(MY, b) - this.tension(MY, a)), pages = Math.max(1, Math.ceil(ids.length / per));
    const mineP = Math.round(this.strength(MY) + PW[g.hero.realm] * 2);
    const o: DOpt[] = ids.slice(page * per, page * per + per).map((s): DOpt => {
      const truce = (S.truce[key(MY, s)] ?? 0) > g.day;
      return { label: `【${SCALE_NAME[this.scale(s)][0]}】${this.name(s)}　${DAO_NAME[this.dao(s)]} · ${this.alive(s)} 人 · 战力约 ${Math.round(this.strength(s))}${truce ? ' · 停战中' : ''}`, tone: 'bad', disabled: truce, hint: '停战之约未满', act: () => ({
        speaker: m.name, title: `向${this.name(s)}宣战？`, mood: 'danger',
        text: `${this.statText(s)}\n宗法：${this.docText(s)}\n据点：${this.holdsOf(s).map((id) => LOC_BY_ID.get(id)!.name).join('、') || '只有山门'}\n\n本宗战力约 ${mineP}（含宗主压阵），对方约 ${Math.round(this.strength(s))}。\n一旦宣战，须一处处拔掉对方的据点，最后攻打山门。打到山门须先攻破对方的护宗大阵（宗主亲自轰击 / 遣弟子强攻 / 亲征破阵）；阵破之后便是双方尽出的灭宗大战——赢了，是和是灭由你发落。`,
        options: [{ label: '宣战！', tone: 'bad', act: () => { g.rel.addSect(s, -30); return this.myWarNode(this.declare(MY, s, `${m.name}宗主一声令下`)); } }, { label: `${this.name(s)}的底细`, act: () => this.sectNode(s, () => this.myDeclareNode(page)) }, { label: '再想想', act: () => this.myDeclareNode(page) }],
      }) };
    });
    if (pages > 1) o.push({ label: `下一页（${page + 1}/${pages}）`, act: () => this.myDeclareNode((page + 1) % pages) });
    o.push({ label: '返回', act: () => this.myNode() });
    return { speaker: m.name, title: '宣战', mood: 'danger', text: `${MAP_NAME[m.map]}各派（按与本宗的紧张程度排）。本宗战力约 ${mineP}。`, options: o };
  }
  private report(w: SWar, txt: string): DNode {
    const m = this.my!, S = this.S;
    return { speaker: m.name, title: '战报', mood: 'danger', text: `${txt}\n\n${S.wars.includes(w) ? this.warText(w) : '此战已了。'}`, options: [{ label: '继续', act: () => (S.wars.includes(w) ? this.myWarNode(w) : this.myNode()) }] };
  }
  /** 列出可请求加派援兵的友宗 / 同盟 / 附庸宗门及其可用兵力 */
  allyReinforceCandidates(w: SWar): { sid: string; name: string; avail: number; relation: string }[] {
    const S = this.S;
    const map = LOC_BY_ID.get(w.a)?.map ?? ACTIVE_MAP;
    const mySide = this.sideOf(w) ?? 0;
    const foeLead = mySide === 0 ? w.b : w.a;
    const myAl = allyOf(MY);
    const out: { sid: string; name: string; avail: number; relation: string }[] = [];
    for (const sid of this.sects(map)) {
      if (sid === MY || sid === foeLead || S.gone?.[sid]) continue;
      if (this.between(MY, sid)) continue;
      const isVassal = !!S.vassal?.[sid];
      const isAl = (myAl && allyOf(sid) === myAl) || this.sideSects(w, mySide).includes(sid);
      const friendly = ((this.game.rel.S.sect as Record<string, number>)[sid] ?? 0) >= 20 || this.tension(MY, sid) <= 22;
      if (!isVassal && !isAl && !friendly) continue;
      const avail = this.sectAvailablePool(sid);
      if (avail < 12) continue;
      out.push({
        sid,
        name: this.name(sid),
        avail,
        relation: isVassal ? '附庸' : isAl ? '同盟' : '友好',
      });
    }
    return out.sort((a, b) => b.avail - a.avail).slice(0, 6);
  }

  /** 自由点兵 + 可选宗门加派援兵 + 集结开拔执行 */
  dispatchCustomForce(w: SWar, opt: { n: number; allySects?: string[]; toStandoff?: boolean; mode?: Mode }) {
    if (!this.S.wars.includes(w) || w.fall) return;
    const side = this.sideOf(w);
    if (side === undefined || this.marchWhy(w)) {
      this.game.toast(this.marchWhy(w) || '当前未参与此战或已议和停战，无法出兵。', 'warn');
      return;
    }
    const free = this.myFree();
    const foeLead = side === 0 ? w.b : w.a;
    const foeSet = new Set(this.sideSects(w, (1 - side) as 0 | 1));
    const allyList = (opt.allySects ?? []).filter((sid) =>
      sid !== MY && !this.S.gone?.[sid] && !foeSet.has(sid) && (this.S.truce[key(sid, foeLead)] ?? 0) <= this.game.day);
    if (free < 3 && !allyList.length) {
      this.game.toast('可调之兵不足三人，无法出兵。', 'warn');
      return;
    }
    const n = free >= 3 ? Math.min(free, Math.max(3, Math.round(opt.n))) : 0;
    if (allyList.length) {
      const sideKey = side === 0 ? 'sideA' : 'sideB';
      const cur = new Set(w[sideKey] ?? this.sideSects(w, side));
      for (const asid of allyList) {
        cur.add(asid);
        const avail = this.sectAvailablePool(asid);
        const sendN = Math.min(avail, Math.max(20, Math.round(avail * 0.35)));
        if (sendN >= 10) {
          this.spawnMarch(w, side, 'army', { sid: asid, soldiers: sendN, musterSec: 3.0 });
          this.note(w, `应${this.my?.name ?? '本宗'}征召，${this.name(asid)}派出 ${sendN} 名援军开拔赶赴前线！`);
        }
      }
      w[sideKey] = [...cur];
    }
    if (n < 3) return;
    const mode = opt.mode ?? (n >= this.combatTotal(MY) * 0.9 ? 'all' : 'wave');
    if (opt.toStandoff) this.dispatchToStandoff(w, { ma: mode, n });
    else this.dispatchToFront(w, { ma: mode, n });
  }

  /** 自由点兵与友宗加派援兵界面（支持任意人数步进微调 + 勾选盟友加派 + 集结对峙或强攻） */
  musterOrderNode(w: SWar, initN?: number, pickedAllies: string[] = []): DNode {
    if (w.fall) return this.verdictNode(w);
    const g = this.game, m = this.my!;
    const free = this.myFree(), why = this.marchWhy(w);
    const allies = this.allyReinforceCandidates(w);
    let n = clamp(initN ?? Math.min(free, Math.max(20, Math.round(free * 0.4))), Math.min(free, 3), Math.max(3, free));
    const allyTotal = pickedAllies.reduce((s, sid) => {
      const item = allies.find((a) => a.sid === sid);
      return s + (item ? Math.min(item.avail, Math.max(20, Math.round(item.avail * 0.35))) : 0);
    }, 0);
    const o: DOpt[] = [];
    for (const delta of [-50, -10, 10, 50]) {
      const next = clamp(n + delta, Math.min(free, 3), Math.max(3, free));
      o.push({
        label: delta < 0 ? `减兵 ${delta}` : `增兵 +${delta}`,
        disabled: next === n,
        act: () => this.musterOrderNode(w, next, pickedAllies),
      });
    }
    for (const frac of [0.2, 0.5, 1]) {
      const target = Math.max(Math.min(free, 3), Math.round(free * frac));
      o.push({
        label: frac === 1 ? `倾巢尽出 (${target} 人)` : `点兵 ${Math.round(frac * 100)}% (${target} 人)`,
        act: () => this.musterOrderNode(w, target, pickedAllies),
      });
    }
    for (const al of allies) {
      const on = pickedAllies.includes(al.sid);
      const sendN = Math.min(al.avail, Math.max(20, Math.round(al.avail * 0.35)));
      o.push({
        label: `${on ? '[✓ 已征召]' : '[ ] 征召'} ${al.name}（${al.relation} · 可调 ${al.avail}，出兵 ${sendN}）`,
        tone: on ? 'good' : undefined,
        act: () => {
          const next = on ? pickedAllies.filter((x) => x !== al.sid) : [...pickedAllies, al.sid];
          return this.musterOrderNode(w, n, next);
        },
      });
    }
    o.push({
      label: `集结开拔 → 阵前对峙（本宗 ${n} 人${allyTotal ? ` + 友宗 ${allyTotal} 人` : ''}）`,
      tone: 'gold',
      disabled: !!why || free < 3,
      hint: why || '可调之兵不足三人',
      act: () => { this.dispatchCustomForce(w, { n, allySects: pickedAllies, toStandoff: true }); return null; },
    });
    o.push({
      label: `集结开拔 → 直扑强攻（本宗 ${n} 人${allyTotal ? ` + 友宗 ${allyTotal} 人` : ''}）`,
      tone: 'good',
      disabled: !!why || free < 3,
      hint: why || '可调之兵不足三人',
      act: () => { this.dispatchCustomForce(w, { n, allySects: pickedAllies, toStandoff: false }); return null; },
    });
    o.push({ label: '返回', act: () => this.myWarNode(w) });
    return {
      speaker: m?.name ?? '宗门点兵台',
      title: `点将发兵 · 赴${this.tgtName(w)}`,
      mood: 'danger',
      text: `当前已点兵：本宗 ${n} / ${free} 人${allyTotal ? `，友宗援军约 ${allyTotal} 人` : ''}。\n开拔后将先于山门校场集结成列，再沿官道行军赶赴前线大营或直接列阵接战。`,
      options: o,
    };
  }

  /** 一波可以派多少人 */
  private sizes(free: number): number[] { const out = [30, 50, 80, 120].filter((n) => n <= free); if (!out.length && free >= 3) out.push(free); else if (free > 120) out.push(free); return out; }
  myWarNode(w: SWar): DNode {
    const g = this.game, m = this.my, S = this.S;
    if (!m || !S.wars.includes(w)) return this.myNode();
    if (w.fall) return this.verdictNode(w);
    const foe = w.a === MY ? w.b : w.a, mySide: 0 | 1 = w.a === MY ? 0 : 1, attacking = w.ini === mySide, D = this.def(w);
    this.ensureValidWarTarget(w);
    const wait = Math.ceil(w.next - g.day), free = this.myFree(), all = this.combatTotal(MY), fAll = this.combatTotal(foe);
    const gate = w.tgt === D, zhp = gate ? this.zhenHp(D) : 0, zcap = gate ? Math.max(1, this.zhenCap(D)) : 1, why = this.marchWhy(w), rest = `弟子休整中，还须 ${wait} 日`;
    const o: DOpt[] = [];
    o.push({
      label: `自由点兵与征召友宗援军（当前可调 ${free} 人）`,
      tone: 'gold',
      disabled: free < 3,
      hint: '可调之兵不足三人',
      act: () => this.musterOrderNode(w),
    });
    if (attacking) {
      if (gate && zhp > 0) {
        const cd = Math.ceil(5 - (g.day - (w.hz ?? -99))), nb = Math.min(free, Math.max(120, Math.round(free * 0.45)));
        o.push({ label: '宗主亲自轰击大阵（耗一日）', tone: 'gold', disabled: cd > 0, hint: `真元未复，还须 ${cd} 日`, act: () => { g.passDays(1, { skipSectwarDaily: true }); w.hz = g.day; w.lastAct = g.day; return this.report(w, this.siege(w, { hero: true })); } });
        o.push({ label: `赴阵前对峙（实战）：率 ${nb} 人开拔列阵对峙 · 斗将/断补蓄势后再破阵`, tone: 'gold', disabled: !!why || free < 3, hint: why || '可调之兵不足三人', act: () => { this.dispatchToStandoff(w, { ma: 'wave', n: nb }); return null; } });
        o.push({ label: `亲征破阵（实战）：率 ${nb} 人开拔直扑阵前强攻`, tone: 'good', disabled: !!why || free < 3, hint: why || '可调之兵不足三人', act: () => { this.dispatchToFront(w, { ma: 'wave', n: nb }); return null; } });
        for (const n of this.sizes(free)) o.push({ label: `遣 ${n} 人强攻大阵（推演）`, disabled: wait > 0, hint: rest, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: 'wave', n })); } });
        o.push({ label: `倾巢而出猛攻大阵（全宗 ${all} 人 · 推演）`, tone: 'bad', disabled: wait > 0, hint: rest, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: 'all' })); } });
      } else if (gate) {
        o.push({ label: `赴阵前对峙（实战）：率全宗 ${all} 人山门前叫阵对峙 · 斗将蓄势`, tone: 'gold', disabled: !!why, hint: why, act: () => { this.dispatchToStandoff(w, { ma: 'all' }); return null; } });
        o.push({ label: `灭宗大战 · 宗主亲征（实战）：率全宗 ${all} 人开拔直扑决战`, tone: 'good', disabled: !!why, hint: why, act: () => { this.dispatchToFront(w, { ma: 'all' }); return null; } });
        o.push({ label: `灭宗大战 · 坐镇推演：全宗 ${all} 人倾巢而出`, tone: 'bad', disabled: wait > 0, hint: rest, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: 'all' })); } });
      } else {
        const standN = Math.min(free, Math.max(120, Math.round(free * 0.45)));
        o.push({ label: `赴${this.tgtName(w)}前线列阵对峙（率 ${standN} 人集结扎营 · 斗将/截粮蓄势）`, tone: 'gold', disabled: !!why || free < 3, hint: why || '可调之兵不足三人', act: () => { this.dispatchToStandoff(w, { ma: 'wave', n: standN }); return null; } });
        for (const n of this.sizes(free)) o.push({ label: `遣 ${n} 人攻打${this.tgtName(w)}（对面依自身兵池迎战）`, tone: 'gold', act: () => this.sendNode(w, 'wave', n) });
        o.push({ label: `倾巢而出 · 灭宗大战（全宗 ${all} 人；对面 ${fAll} 人也必尽出）`, tone: 'bad', act: () => this.sendNode(w, 'all', all) });
      }
    } else {
      o.push({ label: `赴${this.tgtName(w)}列阵对峙（实战 · 守阵斗将/截粮蓄势）`, tone: 'gold', disabled: !!why, hint: why, act: () => { this.dispatchToStandoff(w); return null; } });
      o.push({ label: `即刻驰援${this.tgtName(w)}强攻（实战 · 直抵前线迎战）`, tone: 'good', disabled: !!why, hint: why, act: () => { this.dispatchToFront(w); return null; } });
      o.push({ label: `主动出击，夺回先手（转攻${this.name(foe)}）`, tone: 'gold', act: () => { w.ini = mySide; w.streak = 0; w.zt = 0; w.tgt = this.nextWarTarget(w, MY, foe); w.lastAct = g.day; w.next = Math.min(w.next, g.day + 3); return this.myWarNode(w); } });
    }
    const pay = Math.round(Math.max(500, m.stones * 0.2));
    o.push({ label: `遣使求和（赔灵石 ${pay}）`, disabled: m.stones < pay, hint: '库房灵石不足', act: () => { m.stones -= pay; this.end(w, (1 - mySide) as 0 | 1, `${m.name}遣使求和`, true); return this.myNode(); } });
    o.push({ label: `${this.name(foe)}的底细`, act: () => this.sectNode(foe, () => this.myWarNode(w)) }, { label: '返回', act: () => this.myNode() });
    const tip = attacking
      ? gate && zhp > 0 ? `兵临${this.name(foe)}山门，护宗大阵「${this.zhenName(foe)}」尚余阵力 ${Math.round(zhp)}/${Math.round(zcap)}。大阵不破，${this.name(foe)}弟子躲在阵后毫发无伤，我方每冲一次都要丢下一批人——宗主亲自轰击不折一人，亲征破阵则一战可破。`
        : gate ? `${this.name(foe)}护宗大阵已破，山门洞开。接下来是灭宗大战：双方尽出，不死不休；胜了，是和是灭由你发落。`
        : `本宗主攻。一次可遣数十上百人，对面照人数迎战；倾巢而出则双方尽出，一战定存亡。亲征（实战）：御剑直抵前线，门人随你冲阵。久不出兵（45 日），对面会反客为主。`
      : `${this.name(foe)}主攻，约 ${Math.max(0, wait)} 日后在${this.tgtName(w)}接战。守御之策：${DEF_NAME[S.myDef ?? 'wave']}（在「宗门战事」里切换）。${gate ? `本宗护宗大阵阵力 ${Math.round(this.zhenHp(MY))}/${this.zhenCap(MY)}。` : ''}`;
    return { speaker: m.name, title: `与${this.name(foe)}之战`, mood: 'danger', text: `${this.warText(w)}\n可调之兵 ${free} 人（在外镇守 ${this.myGar()} 人）\n\n${tip}\n\n${w.log.slice(-4).join('\n')}`, options: o };
  }
  /** 出兵：亲征（实战）还是坐镇（推演） */
  private sendNode(w: SWar, mode: Mode, n: number): DNode {
    const g = this.game, m = this.my!, foe = w.a === MY ? w.b : w.a, why = this.marchWhy(w), wait = Math.ceil(w.next - g.day), big = mode === 'all';
    const text = big
      ? `全宗上下 ${n} 人倾巢而出，宗主压阵。${this.name(foe)}也只能尽起 ${this.combatTotal(foe)} 人迎战——这是灭宗大战：\n· 胜：${this.name(foe)}全线崩溃，所有据点一并易手，兵临山门；\n· 败：本宗元气大伤，攻守易势。\n\n宗主亲征（实战）：御剑直抵前线，门人随你冲阵，敌我后备源源上场，杀一个少一个。\n坐镇山门（推演）：立见战报。`
      : `遣 ${n} 人攻打${this.tgtName(w)}，${this.name(foe)}会照着这个数迎战。\n\n宗主亲征（实战）：御剑直抵前线，门人随你冲阵，敌我后备源源上场；杀到对面折损七成半，敌军便溃。\n坐镇山门（推演）：立见战报。`;
    return {
      speaker: m.name, title: big ? '灭宗大战' : `遣 ${n} 人出战`, mood: 'danger', text,
      options: [
        { label: '赴前线列阵对峙（集结扎营 · 先斗将/截粮蓄势再开战）', tone: 'gold', disabled: !!why, hint: why, act: () => { this.dispatchToStandoff(w, { ma: mode, n }); return null; } },
        { label: '宗主亲征（实战 · 开拔赶赴前线直扑接战）', tone: 'good', disabled: !!why, hint: why, act: () => { this.dispatchToFront(w, { ma: mode, n }); return null; } },
        { label: '坐镇山门（推演）', tone: 'gold', disabled: wait > 0, hint: `弟子休整中，还须 ${wait} 日`, act: () => { w.lastAct = g.day; return this.report(w, this.clash(w, { ma: mode, n })); } },
        { label: '返回', act: () => this.myWarNode(w) },
      ],
    };
  }
  /** 发落败者 */
  private verdictNode(w: SWar): DNode {
    const g = this.game, m = this.my!, S = this.S;
    if (!S.wars.includes(w)) return this.myNode();
    const foe = w.a === MY ? w.b : w.a, fn = this.name(foe), sc = this.scale(foe), left = this.combatTotal(foe), nj = Math.min(Math.max(0, g.mysect.cap() - m.ds.length), Math.round(this.units(foe).length * 0.5)) + Math.round(this.outerAvailable(foe) * 0.45), mo = this.dao(foe) === 'mo';
    const done = (txt: string): DNode => ({ speaker: m.name, title: '发落', mood: 'danger', text: txt, options: [{ label: '继续', act: () => this.myNode() }] });
    return {
      speaker: m.name, title: `发落${fn}`, mood: 'danger',
      text: `${fn}已是砧上鱼肉（残部 ${left} 人）。是和是灭，宗主一言而决：\n\n· 灭其道统：鸡犬不留，${fn}自此除名。搜刮库藏 ${MIE_LOOT[sc]} 灵石与藏经阁秘卷，据点尽归本宗，山门改作分舵（月入 ${BRANCH[sc]}）。${mo ? '诛灭魔宗，正道称快。' : '屠戮同道，天下侧目——各派对本宗的敌意都会上涨。'}\n· 收编残部：${fn}除名，残部约 ${nj} 人改换门庭（忠诚不高），得库藏 ${Math.round(MIE_LOOT[sc] * 0.4)} 灵石，据点、山门尽归本宗。\n· 纳为附庸：${fn}保全道统，每月上供 ${VASSAL[sc]} 灵石（径入宗主供奉），本宗有战事时出兵助阵。\n· 赔款罢兵：得赔款 ${END_LOOT[sc]} 灵石，割其半数据点，五年不战。\n\n（一百二十日不发落，按赔款了结。）`,
      options: [
        { label: `灭其道统——${fn}自此除名`, tone: 'bad', act: () => ({ speaker: m.name, title: '灭宗', mood: 'danger', text: `当真要将${fn}连根拔起？此事一做，再无回头。`, options: [{ label: '斩草除根！', tone: 'bad', act: () => done(this.verdict(w, 'mie')) }, { label: '再想想', act: () => this.verdictNode(w) }] }) },
        { label: `收编残部（约 ${nj} 人来投）`, tone: 'gold', act: () => done(this.verdict(w, 'bian')) },
        { label: `纳为附庸（月供 ${VASSAL[sc]} 灵石）`, tone: 'good', act: () => done(this.verdict(w, 'fu')) },
        { label: `赔款罢兵（${END_LOOT[sc]} 灵石）`, act: () => done(this.verdict(w, 'pei')) },
        { label: `${fn}的底细`, act: () => this.sectNode(foe, () => this.verdictNode(w)) },
      ],
    };
  }

  // ---------------------------------------------------------------- v0.73 Phase 4：大一统阵线 · 营寨 · 地图行军 · 统帅军令
  private marchCharStates = new Map<number, CharState>();
  private campLevel(cmp: CampState): 1 | 2 | 3 {
    return cmp.build >= 0.95 ? 3 : cmp.build >= 0.5 ? 2 : 1;
  }

  /** 初始化双方边界集结点（先定集结勘址坐标，待山门/据点先遣弟子与飞舟实景抵达后才真正立营筑寨） */
  initCampsForWar(w: SWar) {
    const spA = this.supplyOf(w.a), spB = this.supplyOf(w.b);
    const takePillsA = Math.min(spA.pills * 0.4, 24), takePillsB = Math.min(spB.pills * 0.4, 24);
    if (!w.campA) {
      const posA = this.computeCampXY(w, 0);
      w.campA = {
        x: posA.x, y: posA.y, map: posA.map, build: 0,
        soldiers: 0,
        bySect: {},
        pills: Math.max(8, Math.round(takePillsA)),
        stones: Math.min(1200, Math.round(spA.stones * 0.15)),
        rally: w.a,
        established: false,
      };
    }
    if (!w.campB) {
      const posB = this.computeCampXY(w, 1);
      w.campB = {
        x: posB.x, y: posB.y, map: posB.map, build: 0,
        soldiers: 0,
        bySect: {},
        pills: Math.max(8, Math.round(takePillsB)),
        stones: Math.min(1200, Math.round(spB.stones * 0.15)),
        rally: w.b,
        established: false,
      };
    }
  }

  /** 收集联军全体参战宗门的山门与连片据点锚点 */
  private allianceAnchors(sects: string[], map: string, excludeId?: string): { x: number; y: number; w: number }[] {
    const out: { x: number; y: number; w: number }[] = [];
    for (const sid of sects) {
      const gate = LOC_BY_ID.get(sid);
      if (gate && gate.map === map) out.push({ x: gate.x * WORLD_SCALE, y: gate.y * WORLD_SCALE, w: 2.2 });
      for (const hid of this.holdsOf(sid)) {
        if (hid === excludeId || this.S.hold[hid]?.isolated) continue;
        const hl = LOC_BY_ID.get(hid);
        if (hl && hl.map === map) out.push({ x: hl.x * WORLD_SCALE, y: hl.y * WORLD_SCALE, w: 1 });
      }
    }
    return out;
  }

  /** 判断两场战事的某一方是否同属一方同盟/阵营（同宗、联军交叉、或正魔同盟且彼此全无敌对） */
  private isSameCoalitionSide(w1: SWar, s1: 0 | 1, w2: SWar, s2: 0 | 1): boolean {
    const a1 = this.sideSects(w1, s1);
    const a2 = this.sideSects(w2, s2);
    for (const x1 of a1) {
      for (const x2 of a2) {
        if (x1 !== x2 && this.between(x1, x2)) return false;
      }
    }
    const set2 = new Set(a2);
    for (const sid of a1) if (set2.has(sid)) return true;
    const lead1 = s1 === 0 ? w1.a : w1.b;
    const lead2 = s2 === 0 ? w2.a : w2.b;
    const al1 = allyOf(lead1), al2 = allyOf(lead2);
    if (al1 && al2 && al1 === al2) return true;
    const d1 = this.dao(lead1), d2 = this.dao(lead2);
    if (d1 === 'mo' && d2 === 'mo') return true;
    if (d1 === 'zheng' && d2 === 'zheng' && (lead1 === MY || lead2 === MY)) return true;
    return false;
  }

  private rawSideRearDir(w: SWar, side: 0 | 1, fp: { x: number; y: number; map: string }): { x: number; y: number } {
    const selfSects = this.sideSects(w, side);
    const foeSects = this.sideSects(w, side === 0 ? 1 : 0);
    const selfAnchors = this.allianceAnchors(selfSects, fp.map, w.tgt);
    const foeAnchors = this.allianceAnchors(foeSects, fp.map);
    const centroid = (pts: { x: number; y: number; w: number }[], fallbackId: string) => {
      if (!pts.length) {
        const fl = LOC_BY_ID.get(fallbackId);
        return fl ? { x: fl.x * WORLD_SCALE, y: fl.y * WORLD_SCALE } : { x: fp.x + (side === 0 ? -9000 : 9000), y: fp.y };
      }
      let sx = 0, sy = 0, sw = 0;
      for (const pt of pts) { sx += pt.x * pt.w; sy += pt.y * pt.w; sw += pt.w; }
      return { x: sx / sw, y: sy / sw };
    };
    const selfC = centroid(selfAnchors, side === 0 ? w.a : w.b);
    const foeC = centroid(foeAnchors, side === 0 ? w.b : w.a);
    let vx = selfC.x - fp.x, vy = selfC.y - fp.y, vd = Math.hypot(vx, vy);
    if (vd < 300) {
      const orig = LOC_BY_ID.get(side === 0 ? w.a : w.b);
      if (orig) { vx = orig.x * WORLD_SCALE - fp.x; vy = orig.y * WORLD_SCALE - fp.y; vd = Math.hypot(vx, vy); }
    }
    const ax = fp.x - foeC.x, ay = fp.y - foeC.y, ad = Math.hypot(ax, ay);
    let rx = (vd > 1 ? vx / vd : 0) * 0.65 + (ad > 1 ? ax / ad : 0) * 0.35;
    let ry = (vd > 1 ? vy / vd : 0) * 0.65 + (ad > 1 ? ay / ad : 0) * 0.35;
    let rd = Math.hypot(rx, ry);
    if (rd < 0.05) {
      rx = side === 0 ? -1 : 1; ry = 0; rd = 1;
    }
    return { x: rx / rd, y: ry / rd };
  }

  /** 计算己方后方半平面单位方向向量，确保双方大营分居战线两侧，不会扎到同一侧或敌方阵营 */
  private campSideDir(w: SWar, side: 0 | 1, fp: { x: number; y: number; map: string }): { x: number; y: number } {
    const d0 = this.rawSideRearDir(w, 0, fp);
    const d1 = this.rawSideRearDir(w, 1, fp);
    const dot = d0.x * d1.x + d0.y * d1.y;
    if (dot <= -0.25) return side === 0 ? d0 : d1;
    // 若双方同盟质心方向夹角过近，按攻防轴线强制对称分置到战线正反两侧
    const gA = LOC_BY_ID.get(w.a), gB = LOC_BY_ID.get(w.b);
    let ax = (gA && gB) ? (gA.x - gB.x) * WORLD_SCALE : (d0.x - d1.x);
    let ay = (gA && gB) ? (gA.y - gB.y) * WORLD_SCALE : (d0.y - d1.y);
    const ad = Math.hypot(ax, ay);
    if (ad > 100) { ax /= ad; ay /= ad; }
    else { ax = -d1.x || -1; ay = -d1.y || 0; const n = Math.hypot(ax, ay) || 1; ax /= n; ay /= n; }
    return side === 0 ? { x: ax, y: ay } : { x: -ax, y: -ay };
  }

  private computeCampXY(w: SWar, side: 0 | 1): { x: number; y: number; map: string } {
    const fp = this.frontPos(w);
    const originId = side === 0 ? w.a : w.b;
    const orig = LOC_BY_ID.get(originId);
    if (!fp || !orig) {
      const rx = (orig?.x ?? 0) * WORLD_SCALE, ry = (orig?.y ?? 0) * WORLD_SCALE;
      return this.findOpenGround(
        clamp(rx + (side === 0 ? -9600 : 9600), 2600, WORLD_W - 2600),
        clamp(ry, 2600, WORLD_H - 2600),
        (orig?.map ?? ACTIVE_MAP) as string,
        { minLocDist: 2550 },
      );
    }

    const rearDir = this.campSideDir(w, side, fp);
    const selfSects = this.sideSects(w, side);
    const foeSects = this.sideSects(w, side === 0 ? 1 : 0);
    const selfAnchors = this.allianceAnchors(selfSects, fp.map, w.tgt);
    const foeAnchors = this.allianceAnchors(foeSects, fp.map);
    const otherCmp = side === 0 ? w.campB : w.campA;

    const minDist = (x: number, y: number, pts: { x: number; y: number }[]) => {
      let best = Infinity;
      for (const pt of pts) best = Math.min(best, Math.hypot(x - pt.x, y - pt.y));
      return best;
    };

    const enemyCampAvoid: { x: number; y: number; r: number }[] = [];
    const alliedCampAvoid: { x: number; y: number; r: number }[] = [];
    const alliedClusterPool: { x: number; y: number; distFp: number }[] = [];

    for (const ow of this.S.wars) {
      if (ow.id === w.id) continue;
      for (const os of [0, 1] as const) {
        const oc = os === 0 ? ow.campA : ow.campB;
        if (!oc || oc.map !== fp.map) continue;
        if (this.isSameCoalitionSide(w, side, ow, os)) {
          alliedCampAvoid.push({ x: oc.x, y: oc.y, r: 460 });
          const dFp = Math.hypot(oc.x - fp.x, oc.y - fp.y);
          const proj = ((oc.x - fp.x) * rearDir.x + (oc.y - fp.y) * rearDir.y) / Math.max(1, dFp);
          const dFoe = minDist(oc.x, oc.y, foeAnchors);
          const dOther = otherCmp && otherCmp.map === fp.map ? Math.hypot(oc.x - otherCmp.x, oc.y - otherCmp.y) : Infinity;
          if (dFp >= 2800 && dFp <= 34000 && proj > -0.25 && dFoe >= 3600 && dOther >= 8400) {
            alliedClusterPool.push({ x: oc.x, y: oc.y, distFp: dFp });
          }
        } else {
          enemyCampAvoid.push({ x: oc.x, y: oc.y, r: 8400 });
        }
      }
    }

    const avoid: { x: number; y: number; r: number }[] = [
      { x: fp.x, y: fp.y, r: 5200 },
      ...enemyCampAvoid,
      ...alliedCampAvoid,
    ];
    if (otherCmp && otherCmp.map === fp.map) avoid.push({ x: otherCmp.x, y: otherCmp.y, r: 9200 });
    for (const fa of foeAnchors) avoid.push({ x: fa.x, y: fa.y, r: 4600 });

    const tr = (this.game as any).terrain;
    const W = tr?.W ? tr.W * WORLD_SCALE : WORLD_W;
    const H = tr?.H ? tr.H * WORLD_SCALE : WORLD_H;
    const locs: { x: number; y: number; r: number }[] = [];
    for (const l of LOC_BY_ID.values()) {
      if (l.map !== fp.map) continue;
      const r = l.type === 'city' || l.type === 'sect' ? 2950 : 2250;
      locs.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, r });
    }
    const isValidCamp = (cx: number, cy: number, clusterMode = false) => {
      if (cx < 1800 || cx > W - 1800 || cy < 1800 || cy > H - 1800) return false;
      if (tr?.walkFactor && tr.walkFactor(cx, cy) <= 0) return false;
      const dotRear = (cx - fp.x) * rearDir.x + (cy - fp.y) * rearDir.y;
      if (dotRear < (clusterMode ? 1200 : 2600)) return false; // 严格处于己方后方半平面内
      for (const l of locs) if (Math.hypot(cx - l.x, cy - l.y) < (clusterMode ? l.r * 0.85 : l.r)) return false;
      for (const a of avoid) if (Math.hypot(cx - a.x, cy - a.y) < a.r) return false;
      if (!clusterMode && foeAnchors.length && selfAnchors.length) {
        const dFoe = minDist(cx, cy, foeAnchors);
        const dSelf = minDist(cx, cy, selfAnchors);
        if (dFoe < dSelf - 1400 && dFoe < 9000) return false;
      }
      return true;
    };

    // 1) 同联盟集结优先：若战区内已有同盟总营位于己方安全侧，紧挨其旁毗连驻营（成片连营）
    if (alliedClusterPool.length) {
      alliedClusterPool.sort((a, b) => a.distFp - b.distFp);
      const base = alliedClusterPool[0];
      const perp = { x: -rearDir.y, y: rearDir.x };
      const clusterOffsets: [number, number][] = [
        [680, 140], [-680, 140], [620, 660], [-620, 660],
        [0, 760], [1080, -140], [-1080, -140], [1160, 660], [-1160, 660],
      ];
      for (const [lat, back] of clusterOffsets) {
        const cx = base.x + perp.x * lat + rearDir.x * back;
        const cy = base.y + perp.y * lat + rearDir.y * back;
        if (isValidCamp(cx, cy, true)) return { x: cx, y: cy, map: fp.map };
      }
    }

    // 2) 沿己方联军后撤轴线展开扇形候选点，在开阔安全区安营
    const nearestSelfD = selfAnchors.length ? minDist(fp.x, fp.y, selfAnchors) : 16000;
    const homeDist = Math.hypot(orig.x * WORLD_SCALE - fp.x, orig.y * WORLD_SCALE - fp.y);
    let offset = clamp(nearestSelfD * 0.48, 7600, 15500);
    if (homeDist > 3600 && homeDist < 14000) offset = Math.min(offset, Math.max(5800, homeDist * 0.78));

    const baseAng = Math.atan2(rearDir.y, rearDir.x);
    const fanAngles = [0, 0.35, -0.35, 0.68, -0.68, 1.0, -1.0];
    const distScales = [1.0, 0.84, 1.18, 1.35, 0.72];
    for (const sc of distScales) {
      const r = offset * sc;
      for (const da of fanAngles) {
        const ang = baseAng + da;
        const cx = fp.x + Math.cos(ang) * r;
        const cy = fp.y + Math.sin(ang) * r;
        if (isValidCamp(cx, cy)) return { x: cx, y: cy, map: fp.map };
      }
    }

    const rawX = clamp(fp.x + rearDir.x * offset, 2600, W - 2600);
    const rawY = clamp(fp.y + rearDir.y * offset, 2600, H - 2600);
    return this.findOpenGround(rawX, rawY, fp.map, { minLocDist: 2550, avoid });
  }

  /** 若旧营帐压到城池/山门/水域，或双方营寨靠得太近、落入敌侧半平面/敌境附近，则安全重选开阔地安营 */
  relocateCampsIfNeeded(w: SWar, forceAdvance = false) {
    const fp = this.frontPos(w);
    if (!fp) return;
    const overlapsAnyLoc = (cx: number, cy: number, map: string) => {
      for (const l of LOC_BY_ID.values()) {
        if (l.map !== map) continue;
        const minR = l.type === 'city' || l.type === 'sect' ? 2850 : 2250;
        if (Math.hypot(cx - l.x * WORLD_SCALE, cy - l.y * WORLD_SCALE) < minR) return true;
      }
      const tr = (this.game as any).terrain;
      if (tr?.walkFactor && tr.walkFactor(cx, cy) <= 0) return true;
      return false;
    };
    for (const sIdx of [0, 1] as const) {
      const cmp = sIdx === 0 ? w.campA : w.campB;
      if (!cmp) continue;
      const rearDir = this.campSideDir(w, sIdx, fp);
      const distFp = Math.hypot(cmp.x - fp.x, cmp.y - fp.y);
      const dotRear = (cmp.x - fp.x) * rearDir.x + (cmp.y - fp.y) * rearDir.y;
      const other = sIdx === 0 ? w.campB : w.campA;
      const tooCloseOther = other && other.map === cmp.map && Math.hypot(cmp.x - other.x, cmp.y - other.y) < 8200;
      const foeAnchors = this.allianceAnchors(this.sideSects(w, sIdx === 0 ? 1 : 0), cmp.map);
      const nearEnemyLoc = foeAnchors.some((fa) => Math.hypot(cmp.x - fa.x, cmp.y - fa.y) < 4400);
      let nearEnemyCamp = false;
      let strayFromOlderAlly = false;
      for (const ow of this.S.wars) {
        if (ow.id === w.id) continue;
        for (const os of [0, 1] as const) {
          const oc = os === 0 ? ow.campA : ow.campB;
          if (!oc || oc.map !== cmp.map) continue;
          if (!this.isSameCoalitionSide(w, sIdx, ow, os)) {
            if (Math.hypot(cmp.x - oc.x, cmp.y - oc.y) < 8000) {
              nearEnemyCamp = true;
              break;
            }
          } else if (ow.id < w.id) {
            const dAlly = Math.hypot(cmp.x - oc.x, cmp.y - oc.y);
            const dFpAlly = Math.hypot(oc.x - fp.x, oc.y - fp.y);
            if (dAlly > 1350 && dFpAlly <= 30000) strayFromOlderAlly = true;
          }
        }
        if (nearEnemyCamp) break;
      }
      const needMove = cmp.map !== fp.map || overlapsAnyLoc(cmp.x, cmp.y, cmp.map) || distFp < 4800 || dotRear < 1800 || tooCloseOther || nearEnemyLoc || nearEnemyCamp || strayFromOlderAlly || (forceAdvance && distFp > 24000);
      if (needMove) {
        const np = this.computeCampXY(w, sIdx);
        const oldX = cmp.x, oldY = cmp.y, oldMap = cmp.map;
        const isEst = cmp.established ?? (cmp.build >= 0.15);
        if (!isEst || oldMap !== np.map) {
          // 尚未立营（仅勘址集结点）或跨图换区：直接更新集结点并同步重指在途纵队目的地
          cmp.x = np.x;
          cmp.y = np.y;
          cmp.map = np.map;
          for (const mc of this.S.marches ?? []) {
            if (!mc.done && mc.warId === w.id && mc.side === sIdx && !mc.isCampRelocate && mc.map === np.map) {
              mc.toX = np.x;
              mc.toY = np.y;
            }
          }
        } else if (!cmp.relocating || Math.hypot(cmp.relocating.toX - np.x, cmp.relocating.toY - np.y) > 480) {
          // 已立营大营换址：必须由场景内实体的迁营弟子编队与护航战船从旧营行军至新址后才完成迁营，绝不瞬间瞬移
          const sid = sIdx === 0 ? w.a : w.b;
          if (cmp.relocating?.marchId) {
            const prevMc = (this.S.marches ?? []).find((m) => m.id === cmp.relocating!.marchId && !m.done);
            if (prevMc) prevMc.done = true;
          }
          const relocSoldiers = clamp(Math.round(Math.max(12, cmp.soldiers * 0.35)), 12, Math.max(12, cmp.soldiers || 24));
          const distReloc = Math.hypot(np.x - oldX, np.y - oldY);
          const shipTier = this.pickEscortAirshipTier(sid, [2, 1, 3]);
          const mc = this.spawnMarch(w, sIdx, 'army', {
            sid,
            fromXY: { x: oldX, y: oldY, map: oldMap, name: `${this.name(sid)}旧营` },
            toXY: { x: np.x, y: np.y },
            soldiers: relocSoldiers,
            pills: 0,
            stones: 0,
            days: clamp(distReloc / 3200, 1.0, 4.0),
            musterSec: 1.0,
            isCampRelocate: true,
            airshipTier: shipTier,
          });
          cmp.relocating = {
            fromX: oldX,
            fromY: oldY,
            toX: np.x,
            toY: np.y,
            map: np.map,
            marchId: mc.id,
          };
          if (oldMap === ACTIVE_MAP) {
            this.note(w, `${this.sideName(w, sIdx)}拔营迁址，护营弟子与飞舟正自旧营押运营盘前往新址！`);
          }
        }
      }
    }
  }

  /** 大营在地图上的世界坐标（设在己方往战区据点方向边界处） */
  campPos(w: SWar, side: 0 | 1): { x: number; y: number; map: string } | null {
    const cmp = side === 0 ? w.campA : w.campB;
    if (cmp) return { x: cmp.x, y: cmp.y, map: cmp.map };
    return this.computeCampXY(w, side);
  }

  /** 大营疗伤丹药对百人战阵护盾再生速度的影响（断丹时护盾回充大幅下跌） */
  campPillFactor(w: SWar, side: 0 | 1): number {
    const cmp = side === 0 ? w.campA : w.campB;
    if (!cmp) return 1;
    if (cmp.pills <= 0) return 0.35;
    if (cmp.pills < 4) return 0.65;
    return 1 + Math.min(0.25, (this.campLevel(cmp) - 1) * 0.1);
  }

  /** 计算某宗门尚未部署到大营/在途纵队/据点的真实后备可调兵力（严格守恒） */
  private availableMarchReserve(_w: SWar, _sIdx: 0 | 1, sid: string): number {
    if (this.S.gone?.[sid]) return 0;
    return this.sectAvailablePool(sid);
  }

  /** 派出地图行军纵队或运丹车队（每波兵力严格从宗门可用兵池核减并记账） */
  spawnMarch(
    w: SWar,
    side: 0 | 1,
    kind: 'army' | 'convoy',
    opt: {
      sid?: string;
      fromLoc?: string;
      fromHoldId?: string;
      toLoc?: string;
      fromXY?: { x: number; y: number; map: string; name?: string };
      toXY?: { x: number; y: number };
      soldiers?: number;
      pills?: number;
      stones?: number;
      days?: number;
      musterSec?: number;
      airshipTier?: AirshipTier;
      isCampRelocate?: boolean;
    } = {},
  ): MarchEntity {
    const S = this.S;
    S.marches ??= [];
    S.marchSeq = (S.marchSeq ?? 0) + 1;
    const sid = opt.sid ?? (side === 0 ? w.a : w.b);
    const fromLoc = opt.fromLoc ?? sid;
    const fromDef = LOC_BY_ID.get(fromLoc);
    const myGate = fromLoc === MY && this.my ? { x: this.my.x, y: this.my.y, map: this.my.map, name: this.my.name } : undefined;
    const cmp = this.campPos(w, side);
    const fp = this.frontPos(w);
    const toDef = opt.toLoc ? LOC_BY_ID.get(opt.toLoc) : undefined;
    const fromX = opt.fromXY ? opt.fromXY.x : (fromDef ? fromDef.x * WORLD_SCALE : (myGate ? myGate.x * WORLD_SCALE : (cmp?.x ?? 0)));
    const fromY = opt.fromXY ? opt.fromXY.y : (fromDef ? fromDef.y * WORLD_SCALE : (myGate ? myGate.y * WORLD_SCALE : (cmp?.y ?? 0)));
    const toX = opt.toXY ? opt.toXY.x : (toDef ? toDef.x * WORLD_SCALE : (cmp?.x ?? fp?.x ?? fromX + 1200));
    const toY = opt.toXY ? opt.toXY.y : (toDef ? toDef.y * WORLD_SCALE : (cmp?.y ?? fp?.y ?? fromY));
    const map = (opt.fromXY?.map ?? fromDef?.map ?? myGate?.map ?? cmp?.map ?? fp?.map ?? ACTIVE_MAP) as string;
    const sp = this.supplyOf(sid);
    // 运丹共用宗门一阶飞舟库存：有空闲一阶灵舟则派灵舟快运；库存不足/皆在外时改走陆路运丹押运队，绝不凭空刷船
    const usesShip = kind === 'convoy' ? this.fleetAvailable(sid).t1 > 0 : false;
    const rawPills = kind === 'convoy' ? Math.max(8, Math.min(24, Math.round(sp.pills * 0.25))) : 4;
    const rawStones = kind === 'convoy' ? Math.max(160, Math.min(1200, Math.round(sp.stones * 0.12))) : 100;
    const pills = opt.pills ?? (kind === 'convoy' && !usesShip ? Math.max(5, Math.round(rawPills * 0.6)) : rawPills);
    const stones = opt.stones ?? (kind === 'convoy' && !usesShip ? Math.max(100, Math.round(rawStones * 0.6)) : rawStones);
    const availPool = this.sectAvailablePool(sid);
    const rawSoldiers = opt.soldiers ?? (kind === 'convoy' ? 24 + Math.floor(Math.random() * 24) : 140 + Math.floor(Math.random() * 140));
    const soldiers = opt.isCampRelocate
      ? Math.max(8, Math.round(rawSoldiers))
      : availPool > 0
        ? Math.min(availPool, Math.max(1, Math.round(rawSoldiers)))
        : 0;
    const dist = Math.hypot(toX - fromX, toY - fromY);
    // 御剑飞行赶路：部队行军纵队御剑腾空赶赴前线（340px/s，低于高阶元婴/化神单人遁速）；一阶运丹灵舟快于陆路车队
    const marchSpeed = kind === 'convoy' ? (usesShip ? 240 : 112) : 340;
    const rtDur = clamp(dist / marchSpeed, opt.isCampRelocate ? 10 : 18, 220);
    const dur = opt.days ?? clamp(dist / 3600, 1.5, 12);
    const mc: MarchEntity = {
      id: S.marchSeq,
      warId: w.id,
      side,
      sid,
      kind,
      map,
      fromLocName: opt.fromXY?.name ?? fromDef?.name ?? myGate?.name ?? this.name(sid),
      fromX,
      fromY,
      toX,
      toY,
      departDay: this.game.day,
      arriveDay: this.game.day + dur,
      rt: 0,
      rtDur,
      musterSec: opt.musterSec ?? 0,
      soldiers,
      pills,
      stones,
      usesShip,
      airshipTier: opt.airshipTier,
      isCampRelocate: opt.isCampRelocate,
      fromHoldId: opt.fromHoldId,
    };
    S.marches.push(mc);
    return mc;
  }

  activeMarches(): MarchEntity[] {
    return (this.S.marches ?? []).filter((m) => !m.done);
  }

  /** 计算行军纵队 / 运丹车队当前世界坐标与进度（含山门集结阶段及弧线切线方向） */
  marchPos(m: MarchEntity): { x: number; y: number; map: string; dir: number; progress: number; mustering: boolean; musterRem: number } {
    if (!m.done && (m.musterSec ?? 0) > 0 && this.game.day < m.arriveDay) {
      const dx0 = m.toX - m.fromX, dy0 = m.toY - m.fromY;
      return {
        x: m.fromX,
        y: m.fromY,
        map: m.map,
        dir: Math.atan2(dy0, dx0),
        progress: 0,
        mustering: true,
        musterRem: m.musterSec ?? 0,
      };
    }
    const dur = Math.max(0.2, m.arriveDay - m.departDay);
    const dayT = (this.game.day - m.departDay) / dur;
    const rtT = (m.rt ?? 0) / Math.max(8, m.rtDur ?? 55);
    const t = m.done ? 1 : clamp(Math.max(dayT, rtT), 0, 1);
    const dx = m.toX - m.fromX, dy = m.toY - m.fromY, d = Math.hypot(dx, dy) || 1;
    const perp = m.kind === 'convoy' ? 280 : -220;
    const arc = Math.sin(t * Math.PI) * perp;
    const dArc = Math.cos(t * Math.PI) * Math.PI * perp;
    const vx = dx + (-dy / d) * dArc;
    const vy = dy + (dx / d) * dArc;
    return {
      x: m.fromX + dx * t + (-dy / d) * arc,
      y: m.fromY + dy * t + (dx / d) * arc,
      map: m.map,
      dir: Math.atan2(vy, vx),
      progress: t,
      mustering: false,
      musterRem: 0,
    };
  }

  private arriveMarch(mc: MarchEntity) {
    if (mc.done) return;
    mc.done = true;
    mc.inRaid = false;
    const wasEscorted = !!mc.escorted;
    mc.escorted = false;
    const w = this.S.wars.find((x) => x.id === mc.warId);
    if (!w) return;
    const cmp = mc.side === 0 ? w.campA : w.campB;
    const pillMul = wasEscorted ? 1.25 : 1;
    const stoneMul = wasEscorted ? 1.2 : 1;
    if (mc.isCampRelocate && cmp) {
      cmp.x = mc.toX;
      cmp.y = mc.toY;
      cmp.map = mc.map;
      cmp.established = true;
      cmp.relocating = undefined;
      for (const om of this.S.marches ?? []) {
        if (!om.done && om.warId === w.id && om.side === mc.side && !om.isCampRelocate && om.map === cmp.map) {
          om.toX = cmp.x;
          om.toY = cmp.y;
        }
      }
      this.note(w, `${this.sideName(w, mc.side)}迁营大队与护航战船抵达新址，前线新营正式扎立！`);
      return;
    }
    const newlyEstablished = !!cmp && !cmp.established;
    if (cmp) {
      cmp.established = true;
      cmp.soldiers += mc.soldiers;
      cmp.bySect ??= {};
      cmp.bySect[mc.sid] = (cmp.bySect[mc.sid] ?? 0) + mc.soldiers;
      cmp.pills = Math.min(72, +(cmp.pills + mc.pills * pillMul).toFixed(2));
      cmp.stones += Math.round(mc.stones * stoneMul);
      cmp.build = Math.min(1, +(cmp.build + (mc.kind === 'army' ? 0.34 : 0.22)).toFixed(3));
    }
    if (newlyEstablished && cmp) {
      this.note(w, `【先遣立营】${this.name(mc.sid)}先遣弟子抵临集结点，${this.sideName(w, mc.side)}前线大营正式筑起！`);
      if (cmp.map === ACTIVE_MAP && (this.sideOf(w) !== undefined || w.a === MY || w.b === MY)) {
        this.game.toast(`先遣弟子抵临集结点，${this.sideName(w, mc.side)}前线大营已立！`, 'info');
      }
    }
    if (wasEscorted) {
      const g = this.game;
      const meritGain = mc.kind === 'convoy' ? 22 : 18;
      g.war.merit += meritGain;
      g.rel.addSect(mc.sid, 3);
      this.note(w, `苏寒护送${this.name(mc.sid)}${mc.kind === 'convoy' ? '运丹车队' : '援军'}安抵大营，前线士气大振！`);
      this.recordAttrition(w, mc.side, mc.kind === 'convoy' ? 12 : 10, mc.kind === 'convoy' ? 0.06 : 0.05, `护送${this.name(mc.sid)}补给安抵大营`);
      this.fulfillWarOrders(w.id, ['escort']);
      if (g.guide && g.guide.name.includes('护送')) g.guide = null;
      g.toast(`护送${this.name(mc.sid)}${mc.kind === 'convoy' ? '运丹车队' : '纵队'}安抵大营！战功 +${meritGain}`, 'good');
      return;
    }
    if (mc.kind === 'convoy') {
      this.note(w, `${this.name(mc.sid)}运丹车队安抵前线大营，补充疗伤丹 ${Math.round(mc.pills)} 枚、灵石 ${mc.stones}。`);
    } else {
      this.note(w, `${this.name(mc.sid)}援军纵队（${mc.soldiers} 人）抵达前线大营。`);
    }
  }

  /** 实时帧间推进在途行军队列（含山门集结倒计时与随行护送伏击闭环），并按真实可用兵源与丹药储备补派行军/押运 */
  private tickRealtimeMarches(dt: number) {
    if (dt <= 0) return;
    const S = this.S, g = this.game, p = g.player;
    for (const mc of S.marches ?? []) {
      if (mc.done || mc.inRaid) continue;
      if (g.day >= mc.arriveDay) {
        this.arriveMarch(mc);
        continue;
      }
      if ((mc.musterSec ?? 0) > 0) {
        mc.musterSec = Math.max(0, (mc.musterSec ?? 0) - dt);
        if (mc.musterSec === 0 && mc.sid === MY && mc.map === ACTIVE_MAP) {
          g.toast(`${this.name(mc.sid)}出征纵队已在山门集结完毕，拔营启程！`, 'info');
        }
        continue;
      }
      const dur = mc.rtDur ?? (mc.kind === 'convoy' ? 68 : 50);
      mc.rt = (mc.rt ?? 0) + dt;
      if (mc.escorted) {
        const pos = this.marchPos(mc);
        const w = S.wars.find((x) => x.id === mc.warId);
        const dPlayer = pos.map === ACTIVE_MAP ? Math.hypot(pos.x - p.x, pos.y - p.y) : 999999;
        if (dPlayer <= 1650) {
          mc.escortAwayT = 0;
          mc.escortWarned = false;
          if (!mc.escortAmbushed && pos.progress >= 0.35 && pos.progress <= 0.85 && w && !w.fall && !this.hasBattleForWar(w.id)) {
            mc.escortAmbushed = true;
            this.spawnEscortAmbush(mc, w);
            continue;
          }
          g.setGuide(mc.toX, mc.toY, `护送${this.name(mc.sid)}至大营 (${Math.round(pos.progress * 100)}%)`);
        } else {
          mc.escortAwayT = (mc.escortAwayT ?? 0) + dt;
          if (!mc.escortWarned && mc.escortAwayT > 2.5) {
            mc.escortWarned = true;
            g.toast('你已远离护送队伍，请速回队列身旁继续护航！', 'warn');
          }
          if (mc.escortAwayT > 12) {
            mc.escorted = false;
            mc.escortAwayT = 0;
            if (g.guide && g.guide.name.includes('护送')) g.guide = null;
            g.toast('远离护送队列过久，此次护送行动中止。', 'warn');
          }
        }
      }
      if (mc.rt >= dur || g.day >= mc.arriveDay) this.arriveMarch(mc);
    }
    this.marchSupplyAcc += dt;
    if (this.marchSupplyAcc >= 8) {
      this.marchSupplyAcc = 0;
      for (const w of S.wars) {
        const fp = this.frontPos(w);
        if (!fp || fp.map !== ACTIVE_MAP || w.fall) continue;
        if (!w.campA || !w.campB) this.initCampsForWar(w);
        const active = this.activeMarches().filter((m) => m.warId === w.id);
        for (const sIdx of [0, 1] as const) {
          const sideMarches = active.filter((m) => m.side === sIdx);
          const cmp = sIdx === 0 ? w.campA! : w.campB!;
          const foeCmp = sIdx === 0 ? w.campB! : w.campA!;
          const hasConvoy = sideMarches.some((m) => m.kind === 'convoy');
          const hasArmy = sideMarches.some((m) => m.kind === 'army');

          let wantKind: 'army' | 'convoy' | null = null;
          // 1) 丹药告急时优先调度运丹补给车队
          if (cmp.pills < 11 && !hasConvoy) wantKind = 'convoy';
          // 2) 大营驻兵劣势或见底时优先抽调援军纵队
          else if ((cmp.soldiers < Math.max(45, Math.round(foeCmp.soldiers * 0.85))) && !hasArmy) wantKind = 'army';
          // 3) 双方全线静默时视兵丹盈余择优轮转增派
          else if (active.length === 0 && sideMarches.length === 0) {
            wantKind = cmp.pills < 20 ? 'convoy' : 'army';
          }
          if (!wantKind) continue;

          const cand = this.sideSects(w, sIdx)
            .map((sid) => ({ sid, res: this.availableMarchReserve(w, sIdx, sid) }))
            .filter((x) => x.res >= (wantKind === 'convoy' ? 8 : 20))
            .sort((a, b) => b.res - a.res);
          if (!cand.length) continue;
          const chosen = cand[0];
          const gap = Math.max(40, foeCmp.soldiers - cmp.soldiers + 40);
          const soldiers = wantKind === 'army'
            ? Math.min(chosen.res, Math.max(90, Math.min(280, gap)))
            : Math.min(chosen.res, Math.min(48, Math.max(16, Math.round(chosen.res * 0.15))));
          this.spawnMarch(w, sIdx, wantKind, {
            sid: chosen.sid,
            soldiers,
            airshipTier: wantKind === 'army' ? this.pickEscortAirshipTier(chosen.sid, [2, 3, 1]) : undefined,
          });
        }
      }
      if ((S.marches?.length ?? 0) > 40) S.marches = S.marches!.filter((m) => !m.done);
    }
  }

  /** 推进在途行军、运丹车队与边界大营逐步筑营（1–3 日成型） */
  tickMarchesAndCamps(days: number) {
    if (days <= 0) return;
    const S = this.S;
    const list = S.marches ?? [];
    for (const mc of list) {
      if (mc.done || mc.inRaid) continue;
      if (this.game.day >= mc.arriveDay) this.arriveMarch(mc);
    }
    for (const w of S.wars) {
      if (!w.campA || !w.campB) this.initCampsForWar(w);
      for (const sIdx of [0, 1] as const) {
        const cmp = sIdx === 0 ? w.campA! : w.campB!;
        // 仅当先遣弟子抵达集结点正式立营后，才逐步修筑营栅与阵法
        if ((cmp.established ?? (cmp.build >= 0.15)) && cmp.build < 1) {
          let buildStep = days * 0.28;
          if (cmp.stones >= 80) {
            const spend = Math.min(cmp.stones, Math.round(days * 60));
            cmp.stones -= spend;
            buildStep += (spend / 120) * 0.12;
          }
          cmp.build = Math.min(1, +(cmp.build + buildStep).toFixed(3));
        }
        // 大营日耗丹药维持战备；丹药不足时动用军费灵石就近采买补给
        if (cmp.pills > 0) cmp.pills = Math.max(0, +(cmp.pills - days * 0.6).toFixed(2));
        if (cmp.pills < 18 && cmp.stones >= 80) {
          const buyPacks = Math.min(Math.floor(cmp.stones / 80), Math.max(1, Math.ceil((18 - cmp.pills) / 3)));
          cmp.stones -= buyPacks * 80;
          cmp.pills = Math.min(72, +(cmp.pills + buyPacks * 3).toFixed(2));
        }
      }
      // 定期增派运丹补给车队（每宗战区保持最多 1–2 支在途车队，须有真实护卫兵力）
      const activeConvoys = this.activeMarches().filter((m) => m.warId === w.id && m.kind === 'convoy');
      if (activeConvoys.length < 2 && Math.random() < Math.min(0.6, days * 0.14)) {
        const sIdx: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        if (!activeConvoys.some((m) => m.side === sIdx)) {
          const cand = this.sideSects(w, sIdx)
            .map((sid) => ({ sid, res: this.availableMarchReserve(w, sIdx, sid) }))
            .filter((x) => x.res >= 8);
          if (cand.length) {
            const chosen = pick(cand);
            this.spawnMarch(w, sIdx, 'convoy', {
              sid: chosen.sid,
              soldiers: Math.min(chosen.res, 24 + Math.floor(Math.random() * 24)),
            });
          }
        }
      }
    }
    if (list.length > 40) {
      S.marches = list.filter((m) => !m.done);
    }
  }

  /** 截杀/突袭敌方在途行军纵队或运丹车队（野外遭遇结果与大营账本双向回写） */
  raidMarch(marchId: number): { ok: boolean; msg: string; pills: number; stones: number; merit: number } {
    const S = this.S, g = this.game;
    const mc = (S.marches ?? []).find((m) => m.id === marchId && !m.done);
    if (!mc) return { ok: false, msg: '该支队伍已经走远或散去了。', pills: 0, stones: 0, merit: 0 };
    const w = S.wars.find((x) => x.id === mc.warId);
    const stealPills = Math.max(2, Math.round(mc.pills * 0.75));
    const stealStones = Math.max(60, Math.round(mc.stones * 0.7));
    const meritGain = mc.kind === 'convoy' ? 28 : 42;
    mc.raided = true;
    mc.done = true;
    mc.soldiers = Math.max(0, Math.round(mc.soldiers * 0.25));
    // 战果回写到玩家储物袋、战功与敌方/己方后勤账本
    const pillCount = Math.max(1, Math.min(8, Math.round(stealPills / 3)));
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const pillId = planeDefaultPillId(ACTIVE_WORLD, 'liaoshang');
    const curAmt = ACTIVE_WORLD === 'human' ? stealStones : scaleFromMortalStones(stealStones, ACTIVE_WORLD, 2);
    C.addItem(g.hero, pillId, pillCount);
    C.addItem(g.hero, curId, curAmt);
    g.war.merit += meritGain;
    // 敌方大营与宗门后勤失血
    if (w) {
      const foeCmp = mc.side === 0 ? w.campA : w.campB;
      if (foeCmp) foeCmp.pills = Math.max(0, +(foeCmp.pills - stealPills * 0.5).toFixed(2));
      const mySide = this.sideOf(w);
      if (mySide !== undefined) {
        const myCmp = mySide === 0 ? w.campA : w.campB;
        if (myCmp) { myCmp.pills = Math.min(72, +(myCmp.pills + stealPills * 0.5).toFixed(2)); myCmp.stones += Math.round(stealStones * 0.5); }
      }
      this.note(w, `苏寒半路截杀${this.name(mc.sid)}${mc.kind === 'convoy' ? '运丹车队' : '行军纵队'}，缴获丹药 ${pillCount} 瓶、${curName} ${curAmt}！`, true);
      const winSide: 0 | 1 = mc.side === 0 ? 1 : 0;
      this.recordAttrition(w, winSide, mc.kind === 'convoy' ? 24 : 26, mc.kind === 'convoy' ? 0.11 : 0.12, `截杀${this.name(mc.sid)}${mc.kind === 'convoy' ? '运丹车队' : '援军'}`);
      this.fulfillWarOrders(w.id, ['raid']);
    }
    const spFoe = this.supplyOf(mc.sid);
    spFoe.pills = Math.max(0, +(spFoe.pills - stealPills * 0.4).toFixed(2));
    let shipSunkNote = '';
    if (mc.kind === 'convoy' && mc.usesShip) {
      const flFoe = this.fleetOf(mc.sid);
      if (flFoe.t1 > 0) flFoe.t1--;
      shipSunkNote = '，并击毁其一阶运丹灵舟';
      if (w) this.note(w, `${this.name(mc.sid)}一阶运丹灵舟半途被劫毁！`, true);
    }
    if (mc.kind === 'army' && mc.soldiers > 0) this.damageOuterPool(mc.sid, Math.max(4, Math.round(mc.soldiers * 0.4)), 2);
    g.rel.addSect(mc.sid, -8);
    const pillName = itemDef(pillId).name;
    const msg = `半路截杀${this.name(mc.sid)}${mc.kind === 'convoy' ? (mc.usesShip ? '运丹灵舟' : '运丹车队') : '行军纵队'}大获全胜！缴获${pillName} ×${pillCount}、${curName} ${curAmt}${shipSunkNote}，战功 +${meritGain}。`;
    g.toast(`截杀${this.name(mc.sid)}${mc.kind === 'convoy' ? (mc.usesShip ? '运丹灵舟' : '运丹车队') : '纵队'}得手！缴获${pillName} ×${pillCount}、${curName} ${curAmt}${shipSunkNote}`, 'good');
    return { ok: true, msg, pills: pillCount, stones: curAmt, merit: meritGain };
  }

  /** 接取随行护送：不直接消失或空口判胜，而是伴随车队/纵队行军、清除半路伏击并护送至大营方算成功 */
  escortMarch(marchId: number): { ok: boolean; msg: string } {
    const S = this.S, g = this.game;
    const mc = (S.marches ?? []).find((m) => m.id === marchId && !m.done);
    if (!mc) return { ok: false, msg: '该支队伍已经抵达大营了。' };
    mc.escorted = true;
    mc.escortAwayT = 0;
    mc.escortWarned = false;
    if ((mc.musterSec ?? 0) > 0) mc.musterSec = 0;
    const pos = this.marchPos(mc);
    const kindLabel = mc.kind === 'convoy' ? '运丹车队' : '行军纵队';
    g.setGuide(mc.toX, mc.toY, `护送${this.name(mc.sid)}至大营 (${Math.round(pos.progress * 100)}%)`);
    const msg = `已随行接护${this.name(mc.sid)}${kindLabel}！当前进度 ${Math.round(pos.progress * 100)}%，请伴行护卫至前线大营（途中须提防敌修伏击劫道）。`;
    g.toast(`开始护送${this.name(mc.sid)}${kindLabel}，请随队行进至前线大营！`, 'good');
    return { ok: true, msg };
  }

  /** 当前正在护送中的纵队/车队状态，供 HUD 显示护送进度与警示 */
  escortHud(): {
    marchId: number;
    sectName: string;
    kindLabel: string;
    progress: number;
    soldiers: number;
    pills: number;
    stones: number;
    inAmbush: boolean;
    awayWarn: boolean;
  } | null {
    const mc = this.activeMarches().find((m) => m.escorted);
    if (!mc) return null;
    const pos = this.marchPos(mc);
    return {
      marchId: mc.id,
      sectName: this.name(mc.sid),
      kindLabel: mc.kind === 'convoy' ? '运丹补给车队' : '行军纵队',
      progress: pos.progress,
      soldiers: mc.soldiers,
      pills: Math.round(mc.pills),
      stones: mc.stones,
      inAmbush: !!mc.inRaid,
      awayWarn: (mc.escortAwayT ?? 0) > 2.5,
    };
  }

  /** 统帅部军令：写入「眼下机缘」与大地图指路 */
  issueWarOrder(
    w: SWar,
    sid: string,
    kind: WarOrder['kind'],
    title: string,
    desc: string,
    targetId: string,
    merit = 35,
    daysValid = 30,
  ): WarOrder {
    const S = this.S;
    S.warOrders ??= [];
    S.orderSeq = (S.orderSeq ?? 0) + 1;
    const L = LOC_BY_ID.get(targetId);
    const fp = this.frontPos(w);
    const x = L ? L.x * WORLD_SCALE : (fp?.x ?? 0);
    const y = L ? L.y * WORLD_SCALE : (fp?.y ?? 0);
    const map = (L?.map ?? fp?.map ?? ACTIVE_MAP) as string;
    const ord: WarOrder = {
      id: S.orderSeq,
      warId: w.id,
      sid,
      kind,
      title,
      desc,
      targetId,
      x,
      y,
      map,
      merit,
      until: this.game.day + daysValid,
    };
    S.warOrders.push(ord);
    return ord;
  }

  activeWarOrders(): WarOrder[] {
    const day = this.game.day;
    return (this.S.warOrders ?? []).filter((o) => !o.done && o.until >= day);
  }

  completeWarOrder(orderId: number): boolean {
    const ord = (this.S.warOrders ?? []).find((o) => o.id === orderId && !o.done);
    if (!ord) return false;
    ord.done = true;
    this.game.war.merit += ord.merit;
    this.game.rel.addSect(ord.sid, 4);
    this.game.toast(`已达成军令「${ord.title}」`, 'good');
    return true;
  }

  private fulfillWarOrders(warId: number, kinds: WarOrder['kind'][]) {
    for (const ord of this.activeWarOrders()) {
      if (ord.warId === warId && kinds.includes(ord.kind)) {
        this.completeWarOrder(ord.id);
      }
    }
  }

  /** 向本方前线大营捐献战备丹药 / 货币 */
  donateSupplyToCamp(w: SWar, side: 0 | 1, kind: 'pill' | 'stone'): boolean {
    const g = this.game, cmp = side === 0 ? w.campA : w.campB;
    if (!cmp) return false;
    const pillId = planeDefaultPillId(ACTIVE_WORLD, 'liaoshang');
    if (kind === 'pill') {
      if (C.bagCount(g.hero, pillId) < 1) return false;
      C.removeItem(g.hero, pillId, 1);
      cmp.pills = Math.min(72, +(cmp.pills + 4).toFixed(2));
      g.war.merit += 12;
      g.toast(`已向大营补充${itemDef(pillId).name} ×1`, 'good');
      return true;
    }
    const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
    const amt = ACTIVE_WORLD === 'human' ? 200 : scaleFromMortalStones(300, ACTIVE_WORLD, 2);
    const eq = toMortalStones(amt, ACTIVE_WORLD);
    if (C.bagCount(g.hero, curId) < amt) return false;
    C.removeItem(g.hero, curId, amt);
    cmp.stones += eq;
    g.war.merit += 10;
    g.toast(`已向大营补充军费${curName} ${amt}`, 'good');
    return true;
  }

  /** 将 WarSys（朔漠之战 / 星罗殿逆星之战）同步为统一阵线 SWar */
  syncCampaignWar(opt: {
    campaign: string;
    sideA: string[];
    sideB: string[];
    sideAName: string;
    sideBName: string;
    targetLoc: string;
    why: string;
    side?: 0 | 1;
  }): SWar {
    const S = this.S, g = this.game;
    this.initHolds();
    const gone = S.gone ?? {};
    const liveA = opt.sideA.filter((id) => !gone[id]);
    const liveB = opt.sideB.filter((id) => !gone[id]);
    const sideA = liveA.length ? liveA : [...opt.sideA];
    const sideB = liveB.length ? liveB : [...opt.sideB];
    let w = S.wars.find((x) => x.campaign === opt.campaign);
    if (!w) {
      w = {
        id: ++S.seq,
        a: sideA[0],
        b: sideB[0],
        sideA,
        sideB,
        sideAName: opt.sideAName,
        sideBName: opt.sideBName,
        campaign: opt.campaign,
        why: opt.why,
        start: g.day,
        ini: 0,
        tgt: opt.targetLoc,
        score: 0,
        wave: 0,
        next: g.day + 1e6,
        streak: 0,
        la: 0,
        lb: 0,
        log: [],
        phase: 'prep',
        prepUntil: g.day + 4,
      };
      this.initCampsForWar(w);
      S.wars.push(w);
      this.spawnMarch(w, 0, 'army', { soldiers: 120 });
      this.spawnMarch(w, 1, 'army', { soldiers: 110 });
      this.spawnMarch(w, 0, 'convoy');
      this.spawnMarch(w, 1, 'convoy');
    } else {
      w.sideA = sideA;
      w.sideB = sideB;
      w.sideAName = opt.sideAName;
      w.sideBName = opt.sideBName;
    }
    if (opt.side !== undefined) w.side = opt.side;
    return w;
  }

  /** 启动联军大阵会战（取代旧散兵波次） */
  launchCampaignBattle(w: SWar, side: 0 | 1, fp: { x: number; y: number }, opt: { ma?: Mode; md?: Mode; n?: number } = {}) {
    if (this.hasBattleForWar(w.id)) return false;
    this.startBattle(w, side, fp, opt);
    return true;
  }

  /** 玩家按 T 交互时检测是否位于己方大营或分营范围内 */
  campFocus(x: number, y: number): { w: SWar; side: 0 | 1; dist: number; x: number; y: number } | null {
    if (this.game.hero.dead) return null;
    let best: { w: SWar; side: 0 | 1; dist: number; x: number; y: number } | null = null;
    for (const cl of this.buildAllianceCampClusters(ACTIVE_MAP)) {
      const w = cl.lead.w, side = cl.lead.sIdx;
      if (w.fall || this.hasBattleForWar(w.id)) continue;
      if (this.sideOf(w) !== side && !cl.nodes.some((n) => this.sideOf(n.w) === n.sIdx)) continue;
      const cp = cl.lead.cp;
      const reach = cl.isCoalition ? 820 : (this.campLayout(w, side).reach);
      const dHq = Math.hypot(cp.x - x, cp.y - y);
      if (dHq <= reach && (!best || dHq < best.dist)) {
        best = { w, side, dist: dHq, x: cp.x, y: cp.y };
      }
      for (const sc of cl.subCamps) {
        const dSub = Math.hypot(sc.x - x, sc.y - y);
        if (dSub <= 340 && (!best || dSub < best.dist)) {
          best = { w, side, dist: dSub, x: cp.x, y: cp.y };
        }
      }
    }
    return best;
  }

  /** 野外靠近行军纵队 / 运丹车队 / 敌营警戒哨卡时的即时交互与拦截；己方大营提示进帅帐 */
  private _lastMarchPromptAt = -1;
  private _lastCampPromptAt = -1;
  private _lastOutpostWarnAt = -1;
  private checkMarchAndCampProximity() {
    const g = this.game, p = g.player;
    if (this.battles.length || g.modal || g.pursuit.active || (g.war as any).battle || g.hero.dead) return;
    if (g.day - this._lastMarchPromptAt >= 0.8) {
      for (const mc of this.activeMarches()) {
        const pos = this.marchPos(mc);
        if (pos.map !== ACTIVE_MAP) continue;
        if (Math.hypot(pos.x - p.x, pos.y - p.y) < 420) {
          const w = this.S.wars.find((x) => x.id === mc.warId);
          if (!w) continue;
          this._lastMarchPromptAt = g.day;
          if (g.autoFlight) g.stopAutoFlight('前方遭遇行军车队，托管御剑停驻');
          g.openDialog(this.marchEncounterNode(mc, w));
          return;
        }
      }
    }
    if (g.day - this._lastCampPromptAt >= 1.5) {
      const cf = this.campFocus(p.x, p.y);
      if (cf) {
        this._lastCampPromptAt = g.day;
        if (g.autoFlight) g.stopAutoFlight('已抵达前线大营，按 T 可进帅帐议事');
      }
    }
    if (g.day - this._lastOutpostWarnAt >= 0.6) {
      const intr = this.findCampIntrusion(p.x, p.y, ACTIVE_MAP);
      if (intr) {
        const { w, side, cmp, isOutpost } = intr;
        const mySide = this.sideOf(w);
        const mineSect = g.ws.sect?.id;
        const sideSects = this.sideSects(w, side);
        const allied = (mySide !== undefined && mySide === side) || (!!mineSect && sideSects.includes(mineSect));
        if (!allied) {
          this._lastOutpostWarnAt = g.day;
          const campSid = side === 0 ? w.a : w.b;
          const isHostile = mySide !== undefined && mySide !== side;
          // 沿边外围哨卡与大营内圈：非己方成员强行闯入会被哨兵拦止退离营界，敌对状态则触发伏哨截杀
          const dx = p.x - cmp.x, dy = p.y - cmp.y;
          const d = Math.hypot(dx, dy) || 1;
          const lay = this.campLayout(w, side);
          const pushR = (isOutpost ? lay.rx + 460 : lay.rx + 260);
          if (g.autoFlight) g.stopAutoFlight(`${this.name(campSid)}前哨拦截禁行`);
          p.x = cmp.x + (dx / d) * pushR;
          p.y = cmp.y + (dy / d) * (pushR * (lay.ry / Math.max(1, lay.rx)));
          if (p.st) { p.st.x = p.x; p.st.y = p.y; }
          if (isHostile && !isOutpost && cmp.soldiers >= 4) {
            const take = Math.min(4, cmp.soldiers);
            cmp.soldiers -= take;
            this.syncCampSect(cmp, campSid, -take);
            for (let i = 0; i < take; i++) {
              const ang = Math.atan2(dy, dx) + (i - 1.5) * 0.35;
              const e = this.spawnSkirmishUnit(campSid, p.x - Math.cos(ang) * 260, p.y - Math.sin(ang) * 260, `camp:guard:${w.id}`, false, false, `${this.name(campSid)}护营卫哨`);
              if (e) e.hunt = true;
            }
            g.toast(`擅闯敌方${this.name(campSid)}大营重地！护营卫哨已杀出迎敌！`, 'warn');
          } else {
            g.toast(`${this.name(campSid)}外围哨卡喝止：「军营重地，闲人止步！」`, 'warn');
          }
        }
      }
    }
  }

  /** 野外遭遇行军纵队 / 运丹车队对话 */
  marchEncounterNode(mc: MarchEntity, w: SWar): DNode {
    const mySide = this.sideOf(w);
    const isFoe = mySide !== undefined && mySide !== mc.side;
    const isAlly = mySide !== undefined && mySide === mc.side;
    const kindLabel = mc.kind === 'convoy' ? '运丹补给车队' : '先遣行军纵队';
    const pos = this.marchPos(mc);
    const o: DOpt[] = [];
    if (isFoe || mySide === undefined) {
      o.push({
        label: `半路突袭截杀（与护卫弟子实战交锋 · 胜则缴获丹药灵石）`,
        tone: 'bad',
        act: () => {
          const n = this.spawnRaidSkirmish(mc, w);
          if (n <= 0) {
            const r = this.raidMarch(mc.id);
            return { speaker: '截杀战报', title: `${this.name(mc.sid)}${kindLabel}`, mood: 'danger', text: r.msg, options: [{ label: '收起', act: () => null }] };
          }
          return {
            speaker: `${this.name(mc.sid)}护卫队`,
            title: '敌军迎战！',
            mood: 'danger',
            text: `「何方狂徒，敢劫我${this.name(mc.sid)}军需！」\n\n${n} 名护卫弟子已拔剑结阵迎上（斩尽护卫即可缴获疗伤丹与灵石）。`,
            options: [{ label: '拔剑迎战！', tone: 'bad', act: () => null }],
          };
        },
      });
    }
    if (isAlly || mySide === undefined) {
      if (mc.escorted) {
        o.push({
          label: mc.inRaid ? '敌修伏击正酣，速速清剿护队！' : `正在随行护送（进度 ${Math.round(pos.progress * 100)}%）`,
          tone: 'gold',
          act: () => null,
        });
      } else {
        o.push({
          label: `随行护送至前线大营（途中护航防伏击 · 抵达结算战功与补给）`,
          tone: 'good',
          act: () => {
            const r = this.escortMarch(mc.id);
            return { speaker: '护送军令', title: `${this.name(mc.sid)}${kindLabel}`, mood: 'normal', text: r.msg, options: [{ label: '随队同行', tone: 'good', act: () => null }] };
          },
        });
      }
    }
    o.push({ label: '避让而过', act: () => null });
    return {
      speaker: `${this.name(mc.sid)}${kindLabel}`,
      title: `进度 ${Math.round(pos.progress * 100)}% · 护卫 ${mc.soldiers} 人`,
      mood: isFoe ? 'danger' : 'normal',
      text: `只见尘土飞扬，${this.name(mc.sid)}的一支${kindLabel}正沿着官道赶往前线——随行护卫约 ${mc.soldiers} 人，载有疗伤丹 ${Math.round(mc.pills)} 份、灵石 ${mc.stones}。`,
      options: o,
    };
  }

  /** 统一前线大营对话节点（帅帐整合：军情 / 随军开拔 / 援兵 / 撤兵 / 按真实身份区分军令 / 补给捐献） */
  warCampNode(w: SWar, side: 0 | 1): DNode {
    const g = this.game, cmp = side === 0 ? w.campA : w.campB;
    const lv = cmp ? this.campLevel(cmp) : 1;
    const tier = worldWarTier(worldOfMap(ACTIVE_MAP), g.hero.realm, g.hero.stage);
    const tierLabel = tier === 'grand' ? '老祖境战力' : tier === 'commander' ? '统帅境战力' : tier === 'captain' ? '阵眼境战力' : tier === 'soldier' ? '炼气境战力' : '后勤修为';
    const warRole = this.playerWarRole(w, side);
    const mine = g.ws.sect?.id;
    const sideSects = this.sideSects(w, side);
    const isMySectInSide = !!this.my && sideSects.includes(MY);
    const inThisSectSide = isMySectInSide || (!!mine && sideSects.includes(mine));
    const sectRank = isMySectInSide ? (this.my!.masterId !== undefined ? 7 : 6) : inThisSectSide ? (g.ws.sect?.rank ?? 0) : -1;
    const fp = this.frontPos(w);
    const hasOrder = this.activeWarOrders().some((o) => o.warId === w.id);
    const opts: DOpt[] = [];
    if (w.phase === 'prep') {
      opts.push({
        label: '随军开拔 · 赶赴前线列阵对峙（斗将/截粮蓄势）',
        tone: 'gold',
        act: () => {
          this.dispatchToStandoff(w);
          return null;
        },
      });
      opts.push({
        label: '随军强攻 · 直扑前线接战',
        tone: 'bad',
        act: () => {
          this.dispatchToFront(w);
          return null;
        },
      });
    } else if (fp && fp.map === ACTIVE_MAP) {
      opts.push({
        label: `前线列阵对峙（开拔前往${this.tgtName(w)}对峙 · 可斗将/袭扰后再总攻）`,
        tone: 'gold',
        act: () => {
          this.dispatchToStandoff(w);
          return null;
        },
      });
      opts.push({
        label: `领军强攻赴阵（直扑${this.tgtName(w)}前线立即开战）`,
        tone: 'bad',
        act: () => {
          this.dispatchToFront(w);
          return null;
        },
      });
    }
    opts.push({
      label: warRole.role === 'leader'
        ? (hasOrder ? `改拟帅令（身份：${warRole.title}）` : `下达帅令 · 钦定亲督之战务（身份：${warRole.title}）`)
        : (hasOrder ? `改换军令（身份：${warRole.title}）` : `领受老祖/帅帐军令（身份：${warRole.title}）`),
      tone: 'gold',
      act: () => this.warOrderPickNode(w, side, tier, warRole, sectRank, inThisSectSide),
    });
    opts.push({
      label: warRole.role === 'leader' ? '调拨援军 · 征召友宗驰援' : '传讯请援 · 向宗门/友宗请求援兵',
      tone: 'good',
      act: () => this.campReinforceNode(w, side),
    });
    opts.push({
      label: warRole.role === 'leader' ? '鸣金撤兵 · 权衡收兵/罢兵' : '撤退议事 · 禀明请退或建言撤兵',
      tone: 'bad',
      act: () => (warRole.role === 'leader' ? this.retreatNode(w, side, 'camp') : this.campDiscipleRetreatNode(w, side)),
    });
    const campPillId = planeDefaultPillId(ACTIVE_WORLD, 'liaoshang');
    const campCurId = worldCurrencyId(ACTIVE_WORLD), campCurName = worldCurrencyName(ACTIVE_WORLD);
    const campCurAmt = ACTIVE_WORLD === 'human' ? 200 : scaleFromMortalStones(300, ACTIVE_WORLD, 2);
    opts.push({ label: `捐献${itemDef(campPillId).name} ×1（大营丹药 +4 · 战功 +12）`, disabled: C.bagCount(g.hero, campPillId) < 1, act: () => { this.donateSupplyToCamp(w, side, 'pill'); return this.warCampNode(w, side); } });
    opts.push({ label: `捐献${campCurName} ${campCurAmt}（大营军费 · 战功 +10）`, disabled: C.bagCount(g.hero, campCurId) < campCurAmt, act: () => { this.donateSupplyToCamp(w, side, 'stone'); return this.warCampNode(w, side); } });
    opts.push({ label: `军需战功兑换（现有战功 ${g.war?.merit ?? 0}）`, tone: 'good', act: () => g.war.meritShopNode(() => this.warCampNode(w, side)) });
    if (w.campaign) {
      const wd = g.war;
      opts.push({ label: '前往联军大营军需处 / 邀同袍', act: () => wd.campNodeByCampaign(w.campaign) });
    }
    opts.push({ label: '离开大营', act: () => null });
    const campOrderText = warRole.role === 'leader'
      ? (hasOrder
        ? `\n· 当前帅令：已颁下（可随时入案改拟其他军务亲自督行）`
        : `\n· 帅令案：你既居「${warRole.title}」尊位，可于此钦定战务、下令三军协同行事`)
      : (hasOrder
        ? `\n· 当前在身军令：已领（可随时入榜改换其他军务）`
        : `\n· 军令榜：帅帐依你「${warRole.title}」身份列有三道差事，可自行择一领受`);
    return {
      speaker: `${this.sideName(w, side)}前线大营`,
      title: `${this.title(w)} · 筑营 Lv${lv}`,
      mood: 'danger',
      text: `营寨之中旌旗翻卷，${lv < 3 ? `工匠与战兵正在赶筑木栅与阵台（筑营进度 ${lv}/3）` : '三层重营、护营阵旗已然稳固'}。\n\n· 驻营兵力：${cmp?.soldiers ?? 0} 人\n· 营中疗伤丹：${Math.round(cmp?.pills ?? 0)} 份（${(cmp?.pills ?? 0) <= 0 ? '告罄！战阵护盾恢复大减' : '丹药充足'}）\n· 军费灵石：${cmp?.stones ?? 0}\n· 你的身份：${warRole.title}（${tierLabel}）${campOrderText}`,
      options: opts,
    };
  }

  /** 前线大营 · 请求援兵（向本方山门余兵与同图友宗请援开拔） */
  private campReinforceNode(w: SWar, side: 0 | 1): DNode {
    const g = this.game, cmp = side === 0 ? w.campA : w.campB;
    const warRole = this.playerWarRole(w);
    const sideSects = this.sideSects(w, side);
    const leadSid = sideSects[0] ?? (side === 0 ? w.a : w.b);
    const leadAvail = leadSid === MY ? this.myFree() : this.sectAvailablePool(leadSid);
    const lastReq = ((cmp as any)?.lastReinforceDay as number | undefined) ?? -99;
    const cdLeft = Math.max(0, Math.ceil(2 - (g.day - lastReq)));
    const sendMain = Math.min(leadAvail, Math.max(15, Math.round(leadAvail * 0.28)));
    const opts: DOpt[] = [];

    if (leadAvail >= 12) {
      opts.push({
        label: cdLeft > 0
          ? `向${this.name(leadSid)}山门请援（尚需整备 ${cdLeft} 日）`
          : `${warRole.role === 'leader' ? '调拨' : '传讯请调'}${this.name(leadSid)}援兵 ${sendMain} 人赴营`,
        tone: 'gold',
        disabled: cdLeft > 0 || sendMain < 10,
        act: () => {
          if (cmp) (cmp as any).lastReinforceDay = g.day;
          this.spawnMarch(w, side, 'army', { sid: leadSid, soldiers: sendMain, musterSec: 3.0 });
          this.note(w, `${warRole.title}自前线大营传讯请援，${this.name(leadSid)}山门抽调 ${sendMain} 名战兵整队驰援！`);
          g.toast(`已请调${this.name(leadSid)}援兵 ${sendMain} 人正自山门开拔赶赴大营！`, 'good');
          return this.warCampNode(w, side);
        },
      });
    }

    // 同阵营盟宗或本图友好宗门驰援
    const map = LOC_BY_ID.get(w.a)?.map ?? ACTIVE_MAP;
    const foeSet = new Set(this.sideSects(w, (1 - side) as 0 | 1));
    const allyCandidates = this.sects(map)
      .filter((sid) => sid !== leadSid && !this.S.gone?.[sid] && !foeSet.has(sid) && !this.between(leadSid, sid))
      .filter((sid) => {
        const sameSide = sideSects.includes(sid);
        const allySide = allyOf(leadSid) && allyOf(sid) === allyOf(leadSid);
        const friendly = ((g.rel.S.sect as Record<string, number>)[sid] ?? 0) >= 20 || this.tension(leadSid, sid) <= 25;
        return sameSide || allySide || friendly;
      })
      .map((sid) => ({ sid, avail: sid === MY ? this.myFree() : this.sectAvailablePool(sid), sameSide: sideSects.includes(sid) }))
      .filter((x) => x.avail >= 16)
      .sort((a, b) => Number(b.sameSide) - Number(a.sameSide) || b.avail - a.avail)
      .slice(0, 5);

    for (const ac of allyCandidates) {
      const sendAlly = Math.min(ac.avail, Math.max(15, Math.round(ac.avail * 0.25)));
      opts.push({
        label: `向${this.name(ac.sid)}${ac.sameSide ? '（同盟参战）' : '（友宗）'}求援 ${sendAlly} 人`,
        tone: 'good',
        disabled: cdLeft > 0,
        act: () => {
          const sideKey = side === 0 ? 'sideA' : 'sideB';
          const cur = new Set(w[sideKey] ?? this.sideSects(w, side));
          cur.add(ac.sid);
          w[sideKey] = [...cur];
          if (cmp) (cmp as any).lastReinforceDay = g.day;
          this.spawnMarch(w, side, 'army', { sid: ac.sid, soldiers: sendAlly, musterSec: 3.0 });
          this.note(w, `前线传书告急，${this.name(ac.sid)}遣 ${sendAlly} 名精锐赶赴大营助阵！`);
          g.toast(`${this.name(ac.sid)}已应援，派出 ${sendAlly} 人驰援前线！`, 'good');
          return this.warCampNode(w, side);
        },
      });
    }

    if (!opts.length) {
      opts.push({ label: '各处山门与友宗暂无可调余兵', disabled: true, act: () => this.campReinforceNode(w, side) });
    }
    opts.push({ label: '返回大营帅帐', act: () => this.warCampNode(w, side) });

    return {
      speaker: `${this.sideName(w, side)}前线大营 · 传讯台`,
      title: '请求援兵',
      mood: 'normal',
      text: `当前驻营兵力 ${cmp?.soldiers ?? 0} 人；${this.name(leadSid)}后方尚有可调之兵 ${leadAvail} 人。${cdLeft > 0 ? `\n\n距上次请援尚余整备期 ${cdLeft} 日，稍候再行催调。` : '\n\n请援发出后，援军纵队将自对应山门/据点真实开拔赶来（大地图可见行军路线）。'}`,
      options: opts,
    };
  }

  /** 弟子 / 客卿在大营内的撤退议事：请辞退下前线，或在劣势时向主帅建言鸣金撤兵 */
  private campDiscipleRetreatNode(w: SWar, side: 0 | 1): DNode {
    const g = this.game, cmp = side === 0 ? w.campA : w.campB;
    const foeCmp = side === 0 ? w.campB : w.campA;
    const warRole = this.playerWarRole(w);
    const badShape = (cmp?.pills ?? 0) <= 2 || (cmp?.soldiers ?? 0) < Math.max(20, (foeCmp?.soldiers ?? 0) * 0.72) || (side === 0 ? w.score <= -20 : w.score >= 20);
    const canPersuade = warRole.role === 'officer' || badShape;
    const opts: DOpt[] = [
      {
        label: '向帅帐禀明请退，暂离前线休整',
        tone: 'gold',
        act: () => {
          this.pendingOpt.delete(w.id);
          this.standoffOpt.delete(w.id);
          if (this.activeDuel?.warId === w.id && !this.activeDuel.ally) {
            this.cleanupDuelEntities(this.activeDuel);
            this.activeDuel = null;
          }
          const mySid = g.ws.sect?.id ?? this.sideSects(w, side)[0];
          const home = mySid ? LOC_BY_ID.get(mySid) : null;
          if (home && home.map === ACTIVE_MAP && cmp) {
            const ang = Math.atan2(home.y * WORLD_SCALE - cmp.y, home.x * WORLD_SCALE - cmp.x);
            g.player.x = cmp.x + Math.cos(ang) * 420;
            g.player.y = cmp.y + Math.sin(ang) * 420;
          } else if (cmp) {
            g.player.x = cmp.x + (side === 0 ? -420 : 420);
          }
          g.toast(`已向大营禀明暂退前线，保重真元后再赴战事。`, 'info');
          return null;
        },
      },
      {
        label: canPersuade ? '向主帅陈明利害 · 建言鸣金撤兵' : '建言主帅撤兵（当前我方尚占稳局，主帅未肯轻退）',
        tone: 'bad',
        disabled: !canPersuade,
        act: () => {
          this.retreatFromStandoff(w, side, 'yield');
          return null;
        },
      },
      { label: '返回大营帅帐', act: () => this.warCampNode(w, side) },
    ];
    return {
      speaker: `${this.sideName(w, side)}中军账`,
      title: `撤退议事 · ${warRole.title}`,
      mood: 'normal',
      text: `你当前身居「${warRole.title}」，虽无权擅自调停全宗大战，但若战局不利或自身伤重，可向帅帐禀明暂退前线休整；若我方兵力/丹药已现颓势（或身为核心/执事），亦可建言主帅鸣金撤兵、放弃当前苦战目标。\n\n当前营况：驻兵 ${cmp?.soldiers ?? 0} 人（敌营 ${foeCmp?.soldiers ?? 0} 人） · 疗伤丹 ${Math.round(cmp?.pills ?? 0)} 份。`,
      options: opts,
    };
  }

  /** 统帅部 / 主帅令案：leader 身份为钦定下令，弟子/客卿按真实身份自军令榜领命 */
  private warOrderPickNode(
    w: SWar,
    side: 0 | 1,
    _tier?: ReturnType<typeof worldWarTier>,
    warRole: { role: 'leader' | 'officer' | 'vanguard'; title: string; isGrand?: boolean } = this.playerWarRole(w, side),
    sectRank?: number,
    inThisSectSide?: boolean,
  ): DNode {
    const g = this.game;
    const mine = g.ws.sect?.id;
    const sideSects = this.sideSects(w, side);
    const isMySectInSide = !!this.my && sideSects.includes(MY);
    const inSide = inThisSectSide ?? (isMySectInSide || (!!mine && sideSects.includes(mine)));
    const rankNow = sectRank ?? (isMySectInSide ? (this.my!.masterId !== undefined ? 7 : 6) : inSide ? (g.ws.sect?.rank ?? 0) : -1);
    const mySid = isMySectInSide ? MY : (inSide && mine ? mine : (side === 0 ? w.a : w.b));
    const tgt = this.tgtName(w);
    const choices: Array<{ kind: WarOrder['kind']; title: string; desc: string; merit: number; hint: string }> =
      warRole.role === 'leader'
        ? [
            { kind: 'siege', title: '统筹破阵·直捣中军', desc: `以「${warRole.title}」之名传令三军总攻，并亲率主力赴${tgt}压阵破敌帅旗。`, merit: 68, hint: '下令总攻 · 战功 +68' },
            { kind: 'raid', title: '遣锐断粮·斩首袭营', desc: `下令奇兵与精锐穿插${tgt}敌后，亲自督战截毁敌方运丹车队与前哨补给线。`, merit: 58, hint: '下令断补 · 战功 +58' },
            { kind: 'escort', title: '督运重辎·稳固三军', desc: `调令各营稳固后勤，亲自督运大宗疗伤丹与军费重车抵${tgt}大营。`, merit: 50, hint: '督令稳军 · 战功 +50' },
          ]
        : inSide && rankNow <= 1
        ? [
            { kind: 'escort', title: '弟子押辎·护送丹药车队', desc: `领受宗门老祖/执事所派后勤差事，护送疗伤丹车队稳抵${tgt}大营。`, merit: 34, hint: '后勤护航 · 战功 +34' },
            { kind: 'seize', title: '守营协防·巡防阵台', desc: `在${tgt}大营与前沿哨卡间巡防协守，随同门筑牢营寨防线。`, merit: 36, hint: '守营协防 · 战功 +36' },
            { kind: 'raid', title: '斥候哨探·袭扰外围斥候', desc: `随前线斥候小阵侦察${tgt}敌情，顺势袭扰敌军外围巡哨与小队运兵。`, merit: 40, hint: '斥候哨探 · 战功 +40' },
          ]
        : inSide && rankNow === 2
        ? [
            { kind: 'seize', title: '内门试锋·随百人阵破盾', desc: `奉宗门老祖之令入列${tgt}前线百人战阵，与敌方同阶弟子正面试锋破盾。`, merit: 44, hint: '列阵试锋 · 战功 +44' },
            { kind: 'raid', title: '游击截道·截杀敌军散队', desc: `潜出${tgt}外围游击，截杀敌军巡哨小阵或运丹车队（地图「劫」标记）。`, merit: 48, hint: '游击断补 · 战功 +48' },
            { kind: 'escort', title: '护航中路·保送运兵粮队', desc: `护卫本宗发往${tgt}大营的援兵与丹药纵队，击退半途伏兵。`, merit: 40, hint: '护队安营 · 战功 +40' },
          ]
        : inSide && (rankNow === 3 || rankNow === 4)
        ? [
            { kind: 'seize', title: '核心领阵·阵前斗将破防', desc: `以「${warRole.title}」之责赴${tgt}前沿阵前斗将、协同战阵撕开敌军护盾。`, merit: 56, hint: '斗将攻坚 · 战功 +56' },
            { kind: 'raid', title: '奇袭敌后·焚毁敌营补给', desc: `统领干练弟子突袭${tgt}敌军运丹重车与巡哨小阵，动摇敌阵根基。`, merit: 54, hint: '奇袭断粮 · 战功 +54' },
            { kind: 'escort', title: '领队押运·保送重车入营', desc: `带队护送高阶丹药与灵石重车直入${tgt}大营，肃清沿途截杀敌修。`, merit: 46, hint: '重车护航 · 战功 +46' },
          ]
        : [
            { kind: 'raid', title: '客卿奇袭·截敌运丹车队', desc: `以「${warRole.title}」身份游走${tgt}外围，截杀敌军运丹车队（地图「劫」标记）。`, merit: 46, hint: '客卿袭扰 · 战功 +46' },
            { kind: 'escort', title: '受托护镖·稳护军辎赴营', desc: `护送己方运丹车队穿越战区直达${tgt}前线大营。`, merit: 40, hint: '护镖安营 · 战功 +40' },
            { kind: 'siege', title: '客卿助阵·破阵斩将', desc: `赴${tgt}正面战场驰援友阵，斩将夺旗。`, merit: 52, hint: '正面助战 · 战功 +52' },
          ];
    const roleDesc = warRole.role === 'leader'
      ? `你身居「${warRole.title}」尊位，乃是三军统帅，可在此钦定一道主帅军务、下令诸营协同推进，并亲自督行。`
      : inSide
        ? `老祖与执事依你当前宗门弟子品阶（${warRole.title}），为你分派了与弟子身份相称的三类差事（绝不越阶乱派督帅之责），你可按当下局势自行择一领命。`
        : `统帅部依你「${warRole.title}」外援身份，列出了三道客卿差事，任凭择一接令。`;
    return {
      speaker: warRole.role === 'leader' ? `${this.sideName(w, side)}帅帐 · 主帅令案` : `${this.sideName(w, side)}帅帐 · 老祖军令榜`,
      title: warRole.role === 'leader' ? `颁下帅令 · 身份：${warRole.title}` : `按阶领命 · 身份：${warRole.title}`,
      mood: 'normal',
      text: `${roleDesc}若途中战局生变，亦可回营改换其他军务。`,
      options: [
        ...choices.map((c) => ({
          label: `${c.title}（${c.hint}）`,
          tone: 'gold' as const,
          act: () => {
            this.S.warOrders = (this.S.warOrders ?? []).filter((o) => o.warId !== w.id);
            this.issueWarOrder(w, mySid, c.kind, c.title, c.desc, w.tgt, c.merit, 30);
            g.toast(warRole.role === 'leader' ? `已颁下帅令「${c.title}」——已写入「任务」与大地图！` : `已领军令「${c.title}」——已写入「任务」与大地图！`, 'good');
            return this.warCampNode(w, side);
          },
        })),
        { label: warRole.role === 'leader' ? '暂不下令，返回大营' : '暂不接令，返回大营', act: () => this.warCampNode(w, side) },
      ],
    };
  }

  private renderHost(): SectWarRenderHost {
    const self = this;
    return {
      game: this.game,
      get S() { return self.S; },
      get my() { return self.my; },
      get skirmishes() { return self.skirmishes; },
      dao: (sid) => self.dao(sid),
      name: (sid) => self.name(sid),
      scale: (sid) => self.scale(sid),
      between: (a, b) => self.between(a, b),
      def: (w) => self.def(w),
      tgtName: (w) => self.tgtName(w),
      sideOf: (w) => self.sideOf(w),
      sideSects: (w, side) => self.sideSects(w, side),
      sideName: (w, side) => self.sideName(w, side),
      campLevel: (c) => self.campLevel(c),
      campPos: (w, side) => self.campPos(w, side),
      frontPos: (w) => self.frontPos(w),
      isSameCoalitionSide: (w1, s1, w2, s2) => self.isSameCoalitionSide(w1, s1, w2, s2),
      isFrontlineStandoff: (w) => self.isFrontlineStandoff(w),
      hasBattleForWar: (warId) => self.hasBattleForWar(warId),
      activeMarches: () => self.activeMarches(),
      marchPos: (mc) => self.marchPos(mc),
      resolveFrontSource: (w, sideIdx, cx, cy, map) => self.resolveFrontSource(w, sideIdx, cx, cy, map),
      initHolds: () => self.initHolds(),
      sects: (map) => self.sects(map),
      holdsOf: (sid) => self.holdsOf(sid),
      combatTotal: (sid) => self.combatTotal(sid),
      zhenHp: (sid) => self.zhenHp(sid),
    };
  }

  private buildAllianceCampClusters(mapId: string) {
    return buildAllianceCampClustersRender(this.renderHost(), mapId);
  }

  collectWorld(
    out: Drawable[],
    view: { left: number; top: number; right: number; bottom: number },
    t: number,
    z = 1,
    ren?: {
      pushAtlasSpr?: (...args: any[]) => boolean;
      dpr?: number;
    },
    farSummary = false,
  ) {
    collectSectWarWorld(this.renderHost(), out, view, t, z, ren, farSummary);
  }

  collectFarWorld(ctx: CanvasRenderingContext2D, view: { left: number; top: number; right: number; bottom: number }, z: number) {
    collectSectWarFarWorld(this.renderHost(), ctx, view, z);
  }

  private isPlayerSide(sid: string, w?: SWar): boolean {
    if (sid === MY) return true;
    if (w && w.side !== undefined) return this.sideSects(w, w.side).includes(sid);
    return false;
  }

  /** 查询某宗门在指定坐标附近最近的真实可出兵基地（己方据点或山门） */
  private nearestBaseFor(sid: string, cx: number, cy: number, map: string): SkirmishSource | null {
    const S = this.S;
    if (S.gone?.[sid]) return null;
    const cands: SkirmishSource[] = [];
    for (const hid of this.holdsOf(sid)) {
      const l = LOC_BY_ID.get(hid);
      const h = S.hold[hid];
      if (!l || l.map !== map || !h || h.g <= 0) continue;
      cands.push({
        kind: 'hold', locId: hid, sid,
        label: `${l.name}守军`,
        x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE,
        avail: h.g,
      });
    }
    const gate = LOC_BY_ID.get(sid);
    if (gate && gate.map === map) {
      const garSum = this.holdsOf(sid).reduce((s, id) => s + (S.hold[id]?.g ?? 0), 0);
      const avail = sid === MY ? this.myFree() : Math.max(0, this.combatTotal(sid) - garSum);
      if (avail > 0) {
        cands.push({
          kind: 'gate', locId: sid, sid,
          label: `${gate.name}山门巡防`,
          x: gate.x * WORLD_SCALE, y: gate.y * WORLD_SCALE,
          avail,
        });
      }
    }
    if (!cands.length) return null;
    cands.sort((u, v) => Math.hypot(u.x - cx, u.y - cy) - Math.hypot(v.x - cx, v.y - cy));
    return cands[0];
  }

  /** 解析战事前线某一方真实可用的巡哨兵源（前线大营 -> 在途援军 -> 同图据点/山门） */
  private resolveFrontSource(w: SWar, sideIdx: 0 | 1, cx: number, cy: number, map: string): SkirmishSource | null {
    const leadSid = sideIdx === 0 ? w.a : w.b;
    const cmp = sideIdx === 0 ? w.campA : w.campB;
    const cp = this.campPos(w, sideIdx);
    if (cp && cp.map === map && (cmp?.soldiers ?? 0) > 0) {
      return {
        kind: 'camp', warId: w.id, side: sideIdx, sid: leadSid,
        label: `${this.sideName(w, sideIdx)}前线大营`,
        x: cp.x, y: cp.y, avail: cmp!.soldiers,
      };
    }
    const marches = this.activeMarches()
      .filter((m) => m.warId === w.id && m.side === sideIdx && m.map === map && !m.inRaid && m.soldiers > 0)
      .map((m) => ({ m, pos: this.marchPos(m) }))
      .sort((u, v) => Math.hypot(u.pos.x - cx, u.pos.y - cy) - Math.hypot(v.pos.x - cx, v.pos.y - cy));
    if (marches.length) {
      const { m, pos } = marches[0];
      return {
        kind: 'march', warId: w.id, side: sideIdx, marchId: m.id, sid: m.sid,
        label: `${this.name(m.sid)}${m.kind === 'convoy' ? '运丹车队' : '援军纵队'}`,
        x: pos.x, y: pos.y, avail: m.soldiers,
      };
    }
    const bases: SkirmishSource[] = [];
    for (const psid of this.sideSects(w, sideIdx)) {
      const b = this.nearestBaseFor(psid, cx, cy, map);
      if (b && b.avail > 0) bases.push(b);
    }
    if (!bases.length) return null;
    bases.sort((u, v) => Math.hypot(u.x - cx, u.y - cy) - Math.hypot(v.x - cx, v.y - cy));
    return bases[0];
  }

  /** 从真实兵源预留/扣出巡哨兵额 */
  private drawFromSource(src: SkirmishSource, want: number): number {
    const n = Math.min(Math.max(0, Math.floor(want)), Math.max(0, Math.floor(src.avail)));
    if (n <= 0) return 0;
    const S = this.S;
    if (src.kind === 'camp' && src.warId !== undefined && src.side !== undefined) {
      const w = S.wars.find((x) => x.id === src.warId);
      const cmp = w ? (src.side === 0 ? w.campA : w.campB) : undefined;
      if (!cmp || cmp.soldiers <= 0) return 0;
      const take = Math.min(n, cmp.soldiers);
      cmp.soldiers = Math.max(0, cmp.soldiers - take);
      this.syncCampSect(cmp, src.sid, -take);
      src.avail = cmp.soldiers;
      return take;
    }
    if (src.kind === 'march' && src.marchId !== undefined) {
      const mc = (S.marches ?? []).find((m) => m.id === src.marchId && !m.done);
      if (!mc || mc.soldiers <= 0) return 0;
      const take = Math.min(n, mc.soldiers);
      mc.soldiers = Math.max(0, mc.soldiers - take);
      src.avail = mc.soldiers;
      return take;
    }
    if (src.kind === 'hold' && src.locId && S.hold[src.locId]) {
      const h = S.hold[src.locId];
      const take = Math.min(n, h.g);
      h.g = Math.max(0, h.g - take);
      src.avail = h.g;
      return take;
    }
    // 山门巡防池受限于真实 combatTotal，实际阵亡才写入 roster/outer 战损
    src.avail = Math.max(0, src.avail - n);
    return n;
  }

  /** 将未阵亡的巡哨/退场幸存弟子归建回原兵源 */
  private returnToSource(src: SkirmishSource | undefined, count: number) {
    if (!src || count <= 0) return;
    const S = this.S;
    if (src.kind === 'camp' && src.warId !== undefined && src.side !== undefined) {
      const w = S.wars.find((x) => x.id === src.warId);
      const cmp = w ? (src.side === 0 ? w.campA : w.campB) : undefined;
      if (cmp) { cmp.soldiers += count; this.syncCampSect(cmp, src.sid, count); }
      return;
    }
    if (src.kind === 'march' && src.marchId !== undefined) {
      const mc = (S.marches ?? []).find((m) => m.id === src.marchId);
      if (mc && !mc.done) { mc.soldiers += count; return; }
      if (src.warId !== undefined && src.side !== undefined) {
        const w = S.wars.find((x) => x.id === src.warId);
        const cmp = w ? (src.side === 0 ? w.campA : w.campB) : undefined;
        if (cmp) { cmp.soldiers += count; this.syncCampSect(cmp, src.sid, count); }
      }
      return;
    }
    if (src.kind === 'hold' && src.locId && S.hold[src.locId] && S.hold[src.locId].o === src.sid) {
      S.hold[src.locId].g += count;
    }
  }

  /** 归还过期/取消的边界摩擦预留巡逻人数 */
  private returnPendingBorder(pb: PendingBorderSkirmish) {
    const S = this.S;
    if (pb.fromAKind === 'hold' && pb.fromALocId && S.hold[pb.fromALocId] && S.hold[pb.fromALocId].o === pb.a && (pb.countA ?? 0) > 0) {
      S.hold[pb.fromALocId].g += pb.countA!;
    }
    if (pb.fromBKind === 'hold' && pb.fromBLocId && S.hold[pb.fromBLocId] && S.hold[pb.fromBLocId].o === pb.b && (pb.countB ?? 0) > 0) {
      S.hold[pb.fromBLocId].g += pb.countB!;
    }
    pb.countA = 0;
    pb.countB = 0;
  }

  // ---------------------------------------------------------------- 世界实景局部交锋（边界摩擦 / 前线哨战 / 截粮实战）
  private spawnSkirmishUnit(sid: string, x: number, y: number, team: string, noPlayer: boolean, ours = false, warOrigin?: string, qiOnly = false): Enemy | null {
    const g = this.game;
    let r = 1, stage = 0, nm = '', sectNm = '', shortNm = '', seed = Math.floor(Math.random() * 1e9), sex: 'm' | 'f' | undefined, robe: string | undefined, ros: [string, number] | undefined, dsId: number | undefined;
    if (sid === MY) {
      const m = this.my; if (!m) return null;
      const c = m.ds.filter((d) => (qiOnly ? d.realm === 1 : d.realm >= 1 && d.realm <= 3));
      const pool = c.length ? c : (qiOnly ? m.ds.filter((d) => d.realm >= 1 && d.realm <= 3) : []);
      if (!pool.length) return null;
      const d = pick(pool);
      r = qiOnly ? 1 : clamp(d.realm, 1, 3); stage = qiOnly ? clamp(d.stage, 4, 8) : d.stage; sectNm = m.name; shortNm = d.name; nm = `${sectNm}·${shortNm}`; sex = d.sex; seed = d.id * 7919 + 17; dsId = d.id;
    } else {
      const def = SECT_DEF.get(sid); if (!def) return null;
      const seg = sectSegments(def), maxK = Math.max(2, seg.outer[1]);
      const ro = g.roster;
      let i = -1;
      for (let t0 = 0; t0 < 28 && i < 0; t0++) {
        const k = 1 + Math.floor(Math.random() * (maxK - 1));
        if (ro.isDead(sid, k) || ro.canonAt(sid, k)) continue;
        const m = member(def, k, ro.gen(sid, k));
        if (m.rank === '太上长老' || m.rank === '杂役弟子' || m.realm < 1 || m.realm > (qiOnly ? 1 : 3)) continue;
        i = k;
      }
      if (i < 0 && qiOnly) {
        for (let t0 = 0; t0 < 16 && i < 0; t0++) {
          const k = 1 + Math.floor(Math.random() * (maxK - 1));
          if (ro.isDead(sid, k) || ro.canonAt(sid, k)) continue;
          const m = member(def, k, ro.gen(sid, k));
          if (m.rank === '太上长老' || m.rank === '杂役弟子' || m.realm < 1 || m.realm > 3) continue;
          i = k;
        }
      }
      if (i < 0) return null;
      const m = member(def, i, ro.gen(sid, i));
      r = qiOnly ? 1 : clamp(m.realm, 1, 3); stage = qiOnly ? clamp(m.stage, 4, 8) : m.stage; sectNm = def.name; shortNm = m.name; nm = `${sectNm}·${shortNm}`; sex = m.sex; seed = m.seed; robe = def.robe; ros = [sid, i];
    }
    stage = Math.min(stage, REALMS[r].hp.length - 1);
    const e = new Enemy(ENEMIES[r >= 3 ? 'jindan_mo' : r >= 2 ? 'zhujixiu' : 'moxiu'], x, y, r, stage);
    e.look = randomLook(mulberry32(seed), sex === 'f' ? 'female' : r >= 3 ? 'elder' : 'cultivator');
    if (robe) (e.look as any).robe = robe;
    if (sex) (e.look as any).sex = sex;
    e.name = nm; e.sectName = sectNm; e.shortName = shortNm;
    if (warOrigin) e.warOrigin = warOrigin;
    e.school = SCHOOLS[sid] ? sid : SCHOOL_ALIAS[sid] ?? 'sanxiu';
    e.team = team;
    e.aggro = true;
    if (noPlayer && !ours) (e as any).noP = true;
    (e as any).warRos = ros;
    (e as any).swDs = dsId;
    (e as any).warSkirmish = true;
    if (ours) {
      e.tag = 'war:skirmish_ally';
      g.combat.addAlly(e);
      e.aggro = false;
    } else {
      g.combat.enemies.push(e);
    }
    return e;
  }

  private createSkirmishMiniForm(
    skId: number,
    skSide: 0 | 1,
    sid: string,
    x: number,
    y: number,
    tx: number,
    ty: number,
    soldiers: number,
    leader: Enemy,
    bystander: boolean,
    ours: boolean,
    kind: 'border' | 'front',
    retreatX: number,
    retreatY: number,
  ): WarFormation {
    const doc = this.doctrine(sid);
    const dx = tx - x, dy = ty - y;
    const faceAng = Math.atan2(dy || 0, dx || (skSide === 0 ? 1 : -1));
    const face: 1 | -1 = Math.cos(faceAng) >= 0 ? 1 : -1;
    const faceY: 1 | -1 = Math.sin(faceAng) < -0.25 ? -1 : 1;
    const pat: FormPattern = kind === 'border' ? pick(['square', 'crane']) : pick(['arrow', 'square', 'crane']);
    const form: WarFormation = {
      id: 1_000_000 + skId * 10 + skSide,
      sid,
      sectName: this.name(sid),
      sideLabel: kind === 'border' ? '巡哨小阵' : '前哨探阵',
      ours,
      leader,
      pattern: pat,
      desiredPattern: pat,
      school: this.schoolOf(sid),
      soldiers,
      soldiersMax: soldiers,
      deadCount: 0,
      injCount: 0,
      routedCount: 0,
      volleyCd: 1.0 + Math.random() * 0.8,
      collapsed: false,
      collapseT: 0,
      x,
      y,
      anchorX: x,
      anchorY: y,
      prevLeaderX: leader.x,
      prevLeaderY: leader.y,
      face,
      faceY,
      faceAng,
      targetFaceAng: faceAng,
      doctrineAtk: doc.atk,
      doctrineDef: doc.def,
      realm: leader.realm,
      retreatX,
      retreatY,
      customUniform: sid === MY ? this.game.ws.mySect?.uniform : undefined,
      skirmishGroup: skId,
      skirmishSide: skSide,
      bystander,
    };
    ensureFormationShield(form);
    (leader as any).warForm = form;
    return form;
  }

  private spawnSkirmishSquad(
    kind: 'border' | 'front',
    a: string, b: string,
    cx: number, cy: number, map: string,
    countEach: number, warId?: number, border?: PendingBorderSkirmish,
  ): SkirmishSquad | null {
    const w = warId !== undefined ? this.S.wars.find((x) => x.id === warId) : undefined;
    let srcA: SkirmishSource | null = null;
    let srcB: SkirmishSource | null = null;
    let wantA = countEach;
    let wantB = countEach;

    if (kind === 'front' && w) {
      srcA = this.resolveFrontSource(w, 0, cx, cy, map);
      srcB = this.resolveFrontSource(w, 1, cx, cy, map);
      if (!srcA || !srcB || srcA.avail <= 0 || srcB.avail <= 0) return null;
      const sectsA = this.sideSects(w, 0);
      const sectsB = this.sideSects(w, 1);
      const desired = Math.max(countEach, sectsA.length > 1 || sectsB.length > 1 ? Math.min(11, Math.max(countEach, Math.max(sectsA.length, sectsB.length) * 2 + 2)) : countEach);
      wantA = this.drawFromSource(srcA, desired);
      wantB = this.drawFromSource(srcB, desired);
    } else if (kind === 'border') {
      if (border && border.fromALocId && border.fromBLocId) {
        srcA = {
          kind: border.fromAKind === 'hold' ? 'hold' : 'gate',
          locId: border.fromALocId, sid: a,
          label: border.fromAName ?? `${this.name(a)}巡哨`,
          x: border.fromAX ?? cx - 1200, y: border.fromAY ?? cy,
          avail: border.countA ?? countEach,
        };
        srcB = {
          kind: border.fromBKind === 'hold' ? 'hold' : 'gate',
          locId: border.fromBLocId, sid: b,
          label: border.fromBName ?? `${this.name(b)}巡哨`,
          x: border.fromBX ?? cx + 1200, y: border.fromBY ?? cy,
          avail: border.countB ?? countEach,
        };
        wantA = Math.max(0, border.countA ?? countEach);
        wantB = Math.max(0, border.countB ?? countEach);
        border.countA = 0;
        border.countB = 0;
      } else {
        srcA = this.nearestBaseFor(a, cx, cy, map);
        srcB = this.nearestBaseFor(b, cx, cy, map);
        if (!srcA || !srcB || srcA.avail <= 0 || srcB.avail <= 0) return null;
        wantA = this.drawFromSource(srcA, countEach);
        wantB = this.drawFromSource(srcB, countEach);
      }
    }

    if (!srcA || !srcB || wantA <= 0 || wantB <= 0) {
      if (srcA && wantA > 0) this.returnToSource(srcA, wantA);
      if (srcB && wantB > 0) this.returnToSource(srcB, wantB);
      return null;
    }

    const id = ++this.skirmishSeq;
    const oursA = this.isPlayerSide(a, w);
    const oursB = this.isPlayerSide(b, w);
    // 玩家尚未加入任一方时，双方视玩家为旁观者（noPlayer）；若玩家已加入一方，敌方不应屏蔽玩家或友军
    const bystander = !oursA && !oursB;
    const unitA: Enemy[] = [], unitB: Enemy[] = [];
    const p = this.game.player;
    const safeMinR = this.game.detailSenseRadius + 220;

    // 严格从真实来源坐标/在途巡哨位现身，同时避开玩家神识内圈；未对峙前或大营出兵时直接自大营营门出发赶往交战地带
    const fromCamps = kind === 'front' && srcA.kind === 'camp' && srcB.kind === 'camp';
    const isPreStandoff = !!(kind === 'front' && w && w.phase === 'prep');
    const spawnOriginFor = (src: SkirmishSource, isBorder: boolean, pT: number) => {
      const dx = src.x - cx, dy = src.y - cy, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const spawnD = isBorder
        ? clamp(d <= 2600 ? d - (d - Math.min(d, 420)) * pT : Math.min(d, 420) + (1 - pT) * 900, 380, 2400)
        : (src.kind === 'camp'
          ? (d > 20000 ? 14000 : Math.max(220, d - 160))
          : (d <= 2200 ? Math.max(380, d - 160) : 460));
      let sx = cx + ux * spawnD, sy = cy + uy * spawnD;
      const pd = Math.hypot(sx - p.x, sy - p.y);
      if (pd < safeMinR) {
        const ang = Math.atan2(sy - p.y, sx - p.x) || 0;
        sx = p.x + Math.cos(ang) * safeMinR;
        sy = p.y + Math.sin(ang) * safeMinR;
      }
      return { x: sx, y: sy, ux, uy };
    };

    const pT = border
      ? clamp((this.game.day - (border.createdDay ?? this.game.day)) / Math.max(0.05, (border.arriveDay ?? this.game.day) - (border.createdDay ?? this.game.day)), 0, 1)
      : 1;
    const origA = spawnOriginFor(srcA, kind === 'border', pT);
    const origB = spawnOriginFor(srcB, kind === 'border', pT);
    const sectsA = w ? this.sideSects(w, 0) : [a];
    const sectsB = w ? this.sideSects(w, 1) : [b];
    const originTextA = kind === 'front' ? `出自${srcA.label}` : `出自${srcA.label}巡哨`;
    const originTextB = kind === 'front' ? `出自${srcB.label}` : `出自${srcB.label}巡哨`;

    // 局部边界摩擦与前哨散斗：自由游斗散阵；未开始正式对峙前从大营派出炼气期弟子，沿大营→交战地带铺开散斗
    const sidCapA = sectsA[0] ?? a;
    const sidCapB = sectsB[0] ?? b;
    const freeCountA = Math.min(wantA, isPreStandoff ? 5 : 7);
    const freeCountB = Math.min(wantB, isPreStandoff ? 5 : 7);
    if (wantA > freeCountA) this.returnToSource(srcA, wantA - freeCountA);
    if (wantB > freeCountB) this.returnToSource(srcB, wantB - freeCountB);

    const spawnFreeGroup = (
      sects: string[],
      fallbackSid: string,
      orig: { x: number; y: number; ux: number; uy: number },
      count: number,
      tag: string,
      originText: string,
      outArr: Enemy[],
    ) => {
      const pxPerp = -orig.uy, pyPerp = orig.ux;
      for (let i = 0; i < count; i++) {
        const sid = sects[i % sects.length] ?? fallbackSid;
        const ang = (i / Math.max(1, count)) * Math.PI * 2 + rand(-0.35, 0.35);
        const rad = i === 0 ? 0 : rand(58, 155);
        const sx = orig.x + Math.cos(ang) * rad;
        const sy = orig.y + Math.sin(ang) * rad * 0.72;
        const u = this.spawnSkirmishUnit(sid, sx, sy, tag, bystander, this.isPlayerSide(sid, w), originText, isPreStandoff);
        if (!u) continue;
        if (i === 0 && !isPreStandoff) u.maxHp = u.hp = Math.round(u.hp * 1.35);
        if (fromCamps) {
          // 抵达交战地带后按横翼铺开散斗，避免全员挤死在一点
          const lane = count > 1 ? ((i / (count - 1)) - 0.5) * 960 : 0;
          const depth = rand(-220, 260);
          u.hx = cx + pxPerp * (lane + rand(-110, 110)) + orig.ux * depth;
          u.hy = cy + pyPerp * (lane + rand(-110, 110)) + orig.uy * depth;
        } else {
          u.hx = cx + rand(-90, 90);
          u.hy = cy + rand(-65, 65);
        }
        u.hunt = true;
        outArr.push(u);
      }
    };

    spawnFreeGroup(sectsA, sidCapA, origA, freeCountA, `sk:${id}:a`, originTextA, unitA);
    spawnFreeGroup(sectsB, sidCapB, origB, freeCountB, `sk:${id}:b`, originTextB, unitB);

    if (unitA.length < freeCountA) this.returnToSource(srcA, freeCountA - unitA.length);
    if (unitB.length < freeCountB) this.returnToSource(srcB, freeCountB - unitB.length);

    if (!unitA.length || !unitB.length) {
      this.returnToSource(srcA, unitA.length);
      this.returnToSource(srcB, unitB.length);
      for (const e of [...unitA, ...unitB]) { e.gone = true; e.dead = true; e.deathT = 0.9; }
      return null;
    }

    const usedA = unitA.length;
    const usedB = unitB.length;
    const sk: SkirmishSquad = {
      id, kind, warId, borderId: border?.id, a, b, x: cx, y: cy, map,
      unitA, unitB, srcA, srcB, reservedA: usedA, reservedB: usedB,
      originTextA: srcA.label, originTextB: srcB.label, t: 0,
    };
    this.skirmishes.push(sk);
    return sk;
  }

  /** 截杀行军护卫实战：从行军纵队实际兵力中拨出护卫弟子迎战玩家，不超刷 */
  spawnRaidSkirmish(mc: MarchEntity, w: SWar): number {
    if (mc.done || mc.soldiers <= 0) return 0;
    const pos = this.marchPos(mc);
    const id = ++this.skirmishSeq;
    const count = Math.min(mc.soldiers, clamp(Math.round(mc.soldiers / 10), 4, 8));
    if (count <= 0) return 0;
    const origin = `出自${this.name(mc.sid)}${mc.kind === 'convoy' ? '运丹车队' : '行军纵队'}（自${mc.fromLocName ?? this.name(mc.sid)}发兵）`;
    const unitB: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const dist = 160 + (i % 2) * 70;
      const e = this.spawnSkirmishUnit(mc.sid, pos.x + Math.cos(ang) * dist, pos.y + Math.sin(ang) * dist, `sk:${id}:raid`, false, false, origin);
      if (e) {
        e.hx = pos.x; e.hy = pos.y;
        e.hunt = true;
        if (i === 0) { e.maxHp = e.hp = Math.round(e.hp * 1.6); e.atk *= 1.1; }
        unitB.push(e);
      }
    }
    if (!unitB.length) return 0;
    mc.soldiers = Math.max(0, mc.soldiers - unitB.length);
    mc.inRaid = true;
    this.skirmishes.push({
      id, kind: 'raid', warId: w.id, marchId: mc.id,
      a: MY, b: mc.sid, x: pos.x, y: pos.y, map: pos.map,
      unitA: [], unitB, reservedB: unitB.length, originTextB: origin, t: 0,
    });
    return unitB.length;
  }

  /** 护送途中的敌方伏击拦截实战：敌修挡道截杀，车队停步御敌，清剿完伏兵后恢复护送行进 */
  spawnEscortAmbush(mc: MarchEntity, w: SWar): number {
    if (mc.done) return 0;
    const g = this.game;
    const pos = this.marchPos(mc);
    const id = ++this.skirmishSeq;
    const foeSid = mc.side === 0 ? w.b : w.a;
    const foeSects = this.sideSects(w, (1 - mc.side) as 0 | 1);
    const pickFoeSid = foeSects[0] ?? foeSid;
    const count = 4;
    const originFoe = `出自${this.name(pickFoeSid)}劫道伏兵`;
    const originAlly = `出自${this.name(mc.sid)}护送队伍`;
    const unitA: Enemy[] = [];
    const unitB: Enemy[] = [];
    const ux = Math.cos(pos.dir), uy = Math.sin(pos.dir);
    for (let i = 0; i < count; i++) {
      const lat = (i - (count - 1) * 0.5) * 90;
      const ex = pos.x + ux * 280 - uy * lat;
      const ey = pos.y + uy * 280 + ux * lat;
      const e = this.spawnSkirmishUnit(pickFoeSid, ex, ey, `sk:${id}:ambush`, false, false, originFoe);
      if (e) {
        e.hx = pos.x; e.hy = pos.y; e.hunt = true;
        if (i === 0) { e.maxHp = e.hp = Math.round(e.hp * 1.45); e.atk *= 1.1; }
        unitB.push(e);
      }
    }
    const guardN = Math.min(2, mc.soldiers);
    for (let i = 0; i < guardN; i++) {
      const lat = (i - 0.5) * 70;
      const gx = pos.x + ux * 80 - uy * lat;
      const gy = pos.y + uy * 80 + ux * lat;
      const e = this.spawnSkirmishUnit(mc.sid, gx, gy, `sk:${id}:escort`, true, false, originAlly);
      if (e) { e.hx = pos.x; e.hy = pos.y; unitA.push(e); }
    }
    if (!unitB.length) return 0;
    mc.soldiers = Math.max(0, mc.soldiers - unitA.length);
    mc.inRaid = true;
    this.skirmishes.push({
      id, kind: 'escort_ambush', warId: w.id, marchId: mc.id,
      a: mc.sid, b: pickFoeSid, x: pos.x, y: pos.y, map: pos.map,
      unitA, unitB, reservedA: unitA.length, reservedB: unitB.length,
      originTextA: originAlly, originTextB: originFoe, t: 0,
    });
    g.combat.texts.push({ x: pos.x, y: pos.y - 120, s: `⚠ ${this.name(pickFoeSid)}伏兵劫道！`, color: '#ff9268', t: 0, vy: -20 });
    g.toast(`敌修伏击！「${this.name(pickFoeSid)}」截道拦路，快护住车队斩杀伏兵！`, 'warn');
    return unitB.length;
  }

  private disperseSkirmishesForWar(warId: number) {
    for (let i = this.skirmishes.length - 1; i >= 0; i--) {
      const sk = this.skirmishes[i];
      if (sk.warId !== warId || sk.kind === 'raid' || sk.kind === 'escort_ambush') continue;
      const aliveA = sk.unitA.filter((e) => !e.dead && !e.gone).length + (sk.formA && !sk.formA.collapsed ? sk.formA.soldiers : 0);
      const aliveB = sk.unitB.filter((e) => !e.dead && !e.gone).length + (sk.formB && !sk.formB.collapsed ? sk.formB.soldiers : 0);
      this.returnToSource(sk.srcA, aliveA);
      this.returnToSource(sk.srcB, aliveB);
      for (const e of [...sk.unitA, ...sk.unitB]) {
        if (!e.dead) { e.gone = true; e.dead = true; e.deathT = 0.9; }
      }
      this.skirmishes.splice(i, 1);
    }
  }

  /** 前线是否正处于休兵整备或夜间对峙巡防期（阵线不再全天候死磕打斗） */
  isFrontlineStandoff(w: SWar): boolean {
    if (w.fall || (w.phase ?? 'battle') !== 'battle') return false;
    if (w.lullUntil !== undefined && this.game.day < w.lullUntil) return true;
    return this.game.night > 0.72 && w.tgt !== this.def(w);
  }

  private tickSkirmishes(dt: number) {
    const g = this.game, p = g.player, S = this.S;
    for (const [k, v] of this.skirmishCd) {
      if (v - dt <= 0) this.skirmishCd.delete(k);
      else this.skirmishCd.set(k, v - dt);
    }
    // 1) 更新在场局部冲突与小方阵试探交锋（带真实 NPC 队长 + 门人战阵）
    for (let i = this.skirmishes.length - 1; i >= 0; i--) {
      const sk = this.skirmishes[i];
      sk.t += dt;
      const w = sk.warId !== undefined ? S.wars.find((x) => x.id === sk.warId) : undefined;
      for (const e of [...sk.unitA, ...sk.unitB]) {
        if (e.dead && !(e as any).warCounted) {
          (e as any).warCounted = true;
          const r = (e as any).warRos as [string, number] | undefined;
          if (r) this.kill(r[0], [r[1]]);
          if ((e as any).swDs !== undefined) this.kill(MY, [(e as any).swDs]);
          if (w) {
            const sid = sk.unitA.includes(e) ? sk.a : sk.b;
            if (sid === w.a) w.la++; else if (sid === w.b) w.lb++;
          }
          if ((sk.kind === 'raid' || sk.kind === 'escort_ambush') && !e.npcKill) {
            g.war.merit += 6 + e.realm * 2;
          }
        }
      }
      const aliveInCombat = (e: Enemy) => !e.dead && !e.gone && (e.ally ? g.combat.allies.includes(e) : g.combat.enemies.includes(e));
      sk.unitA = sk.unitA.filter(aliveInCombat);
      sk.unitB = sk.unitB.filter(aliveInCombat);

      if ((sk.formA || sk.formB) && sk.map === ACTIVE_MAP && !sk.resolved) {
        const targetsA = sk.formB && !sk.formB.collapsed && sk.formB.soldiers > 0 ? [sk.formB] : [];
        const targetsB = sk.formA && !sk.formA.collapsed && sk.formA.soldiers > 0 ? [sk.formA] : [];
        if (sk.formA && !sk.formA.collapsed && sk.formA.soldiers > 0) {
          tickFormation(sk.formA, g, dt, targetsA, 'charge');
          if (sk.unitA[0]) { sk.unitA[0].hx = sk.formA.x; sk.unitA[0].hy = sk.formA.y; }
        }
        if (sk.formB && !sk.formB.collapsed && sk.formB.soldiers > 0) {
          tickFormation(sk.formB, g, dt, targetsB, 'charge');
          if (sk.unitB[0]) { sk.unitB[0].hx = sk.formB.x; sk.unitB[0].hy = sk.formB.y; }
        }
        if (sk.formA && sk.formB) {
          sk.x = (sk.formA.x + sk.formB.x) * 0.5;
          sk.y = (sk.formA.y + sk.formB.y) * 0.5;
        }
      }
      if (w) {
        for (const [f, sid] of [[sk.formA, sk.a], [sk.formB, sk.b]] as const) {
          if (!f) continue;
          const prev = ((f as any)._warCountedDead as number | undefined) ?? 0;
          const diff = Math.max(0, f.deadCount - prev);
          if (diff > 0) {
            (f as any)._warCountedDead = f.deadCount;
            if (sid === w.a) w.la += diff; else if (sid === w.b) w.lb += diff;
          }
        }
      }

      const lvSk = getLastBattleView();
      const skViewHalfDiag = lvSk ? Math.hypot((lvSk.right - lvSk.left) * 0.5, (lvSk.bottom - lvSk.top) * 0.5) : 0;
      const skFarDist = Math.max(13500, skViewHalfDiag + 3200);
      const minSkDist = Math.min(
        Math.hypot(sk.x - p.x, sk.y - p.y),
        sk.unitA.length ? Math.hypot(sk.unitA[0].x - p.x, sk.unitA[0].y - p.y) : Infinity,
        sk.unitB.length ? Math.hypot(sk.unitB[0].x - p.x, sk.unitB[0].y - p.y) : Infinity,
      );
      const far = sk.map !== ACTIVE_MAP || minSkDist > skFarDist;
      if (far) {
        if (sk.kind === 'raid' && sk.marchId !== undefined) {
          const mc = (S.marches ?? []).find((m) => m.id === sk.marchId && !m.done);
          if (mc) { mc.soldiers += sk.unitB.length; mc.inRaid = false; }
        } else if (sk.kind === 'escort_ambush' && sk.marchId !== undefined) {
          const mc = (S.marches ?? []).find((m) => m.id === sk.marchId && !m.done);
          if (mc) { mc.soldiers += sk.unitA.length; mc.inRaid = false; mc.escorted = false; }
        } else {
          this.returnToSource(sk.srcA, sk.unitA.length + (sk.formA && !sk.formA.collapsed ? sk.formA.soldiers : 0));
          this.returnToSource(sk.srcB, sk.unitB.length + (sk.formB && !sk.formB.collapsed ? sk.formB.soldiers : 0));
        }
        for (const e of [...sk.unitA, ...sk.unitB]) { e.gone = true; e.dead = true; e.deathT = 0.9; }
        this.skirmishes.splice(i, 1);
        continue;
      }

      if (sk.kind === 'raid') {
        if (!sk.resolved && sk.unitB.length === 0 && sk.marchId !== undefined) {
          sk.resolved = true;
          const mc = (S.marches ?? []).find((m) => m.id === sk.marchId);
          if (mc) mc.inRaid = false;
          this.raidMarch(sk.marchId);
          this.skirmishes.splice(i, 1);
        }
        continue;
      }

      if (sk.kind === 'escort_ambush') {
        if (!sk.resolved && sk.unitB.length === 0 && sk.marchId !== undefined) {
          sk.resolved = true;
          const mc = (S.marches ?? []).find((m) => m.id === sk.marchId);
          if (mc) {
            mc.soldiers += sk.unitA.length;
            mc.inRaid = false;
          }
          for (const e of sk.unitA) { e.gone = true; e.dead = true; e.deathT = 0.9; }
          g.war.merit += 12;
          g.toast('劫道伏兵已肃清！车队重整旗鼓，继续赶往前线大营。', 'good');
          this.skirmishes.splice(i, 1);
        }
        continue;
      }

      const aliveFormA = sk.formA ? (!sk.formA.collapsed ? sk.formA.soldiers : 0) : 0;
      const aliveFormB = sk.formB ? (!sk.formB.collapsed ? sk.formB.soldiers : 0) : 0;
      const sideAUp = sk.unitA.length + aliveFormA > 0 && (!sk.formA || !sk.formA.collapsed || sk.unitA.length > 0);
      const sideBUp = sk.unitB.length + aliveFormB > 0 && (!sk.formB || !sk.formB.collapsed || sk.unitB.length > 0);
      if (!sk.resolved && (!sideAUp || !sideBUp)) {
        sk.resolved = true;
        sk.doneT = 3.5;
        const winA = sideAUp;
        const winner = winA ? sk.unitA : sk.unitB;
        const winForm = winA ? sk.formA : sk.formB;
        const winName = this.name(winA ? sk.a : sk.b);
        const tx = winner[0]?.x ?? winForm?.x ?? sk.x;
        const ty = winner[0]?.y ?? winForm?.y ?? sk.y;
        g.combat.texts.push({ x: tx, y: ty - 120, s: `${winName}胜！`, color: '#ffd27a', source: winner[0], t: 0, vy: -24 });
        if (w && sk.kind === 'front') {
          const sgn = winA ? 1 : -1;
          w.score = clamp(w.score + sgn * 3, -100, 100);
          this.recordAttrition(w, winA ? 0 : 1, 9, 0.04, '前哨遭遇战获胜');
          if (w.phase === 'prep') {
            // 未正式列阵对峙前：双方大营炼气弟子持续轮番出营散斗，不进入长休兵停火期
            this.skirmishCd.set(`war:${w.id}`, Math.min(this.skirmishCd.get(`war:${w.id}`) ?? 99, 5 + Math.random() * 3));
          } else {
            this.skirmishCd.set(`war:${w.id}`, 85 + Math.random() * 45);
            w.lullUntil = g.day + 1.5 + Math.random() * 2.5;
          }
        }
      }
      if (sk.resolved) {
        sk.doneT = (sk.doneT ?? 0) - dt;
        if (sk.doneT <= 0) {
          const keepA = sk.unitA.length + (sk.formA && !sk.formA.collapsed ? sk.formA.soldiers : 0);
          const keepB = sk.unitB.length + (sk.formB && !sk.formB.collapsed ? sk.formB.soldiers : 0);
          this.returnToSource(sk.srcA, keepA);
          this.returnToSource(sk.srcB, keepB);
          if (sk.formA && !sk.formA.collapsed && sk.formA.soldiers > 0) {
            spawnFormationRetreaters(sk.formA, Math.min(sk.formA.soldiers, 8));
          }
          if (sk.formB && !sk.formB.collapsed && sk.formB.soldiers > 0) {
            spawnFormationRetreaters(sk.formB, Math.min(sk.formB.soldiers, 8));
          }
          const cpA = sk.srcA ? { x: sk.srcA.x, y: sk.srcA.y } : (w ? this.campPos(w, 0) : null);
          const cpB = sk.srcB ? { x: sk.srcB.x, y: sk.srcB.y } : (w ? this.campPos(w, 1) : null);
          for (let ui = 0; ui < sk.unitA.length; ui++) {
            const e = sk.unitA[ui];
            if (e.dead) continue;
            (e as any).departing = true;
            (e as any).returnCamp = !!cpA;
            e.flee = true;
            e.aggro = false;
            (e as any).noP = true;
            e.retreatT = 32;
            if (cpA) {
              const ang = (ui / Math.max(1, sk.unitA.length)) * Math.PI * 2;
              e.hx = cpA.x + Math.cos(ang) * 42;
              e.hy = cpA.y + Math.sin(ang) * 28;
            }
          }
          for (let ui = 0; ui < sk.unitB.length; ui++) {
            const e = sk.unitB[ui];
            if (e.dead) continue;
            (e as any).departing = true;
            (e as any).returnCamp = !!cpB;
            e.flee = true;
            e.aggro = false;
            (e as any).noP = true;
            e.retreatT = 32;
            if (cpB) {
              const ang = (ui / Math.max(1, sk.unitB.length)) * Math.PI * 2;
              e.hx = cpB.x + Math.cos(ang) * 42;
              e.hy = cpB.y + Math.sin(ang) * 28;
            }
          }
          this.skirmishes.splice(i, 1);
        }
      }
    }

    if (g.hero.dead || this.skirmishes.length >= 8) return;

    // 2) 若玩家走近最近发生的「边界摩擦」，将已在途/对峙的巡哨小阵转入实景交锋（禁止刷在神识内圈）
    const safeMinSpawnD = g.detailSenseRadius + 240;
    if (S.pendingBorders?.length) {
      for (let i = S.pendingBorders.length - 1; i >= 0; i--) {
        const pb = S.pendingBorders[i];
        if (pb.until < g.day) { this.returnPendingBorder(pb); S.pendingBorders.splice(i, 1); continue; }
        if (pb.map !== ACTIVE_MAP || this.skirmishCd.has(`border:${pb.id}`)) continue;
        if (this.skirmishes.some((sk) => sk.borderId === pb.id)) continue;
        const pbDist = Math.hypot(pb.x - p.x, pb.y - p.y);
        if (pbDist < 5600 && pbDist >= safeMinSpawnD) {
          const sk = this.spawnSkirmishSquad('border', pb.a, pb.b, pb.x, pb.y, pb.map, 6, undefined, pb);
          if (sk) {
            this.skirmishCd.set(`border:${pb.id}`, 45);
            S.pendingBorders.splice(i, 1);
            const cntA = sk.unitA.length + (sk.formA?.soldiers ?? 0);
            const cntB = sk.unitB.length + (sk.formB?.soldiers ?? 0);
            g.toast(`${this.name(pb.a)}（${sk.originTextA ?? '巡哨'} ${cntA}人小阵）与${this.name(pb.b)}（${sk.originTextB ?? '巡哨'} ${cntB}人小阵）正在${pb.locName}外结阵试探！`, 'info');
            break;
          }
        }
      }
    }

    // 3) 大营建成后至正式列阵对峙前（prep 期）：不停自双方大营派出炼气期弟子赶往交战地带铺开散斗；
    //    正式开战非休整期（battle 期）：仅当双方大营确已立营有兵时，派出前哨试探小阵（绝不无营空刷）
    if (this.skirmishes.length < 8) {
      for (const w of S.wars) {
        if (w.fall || (w.phase !== 'prep' && w.phase !== 'battle')) continue;
        if (this.hasBattleForWar(w.id)) continue;
        if (w.phase === 'battle' && this.isFrontlineStandoff(w)) continue;
        if (!w.campaign && (!w.campA?.established || w.campA.soldiers <= 0 || !w.campB?.established || w.campB.soldiers <= 0)) continue;
        if (this.skirmishCd.has(`war:${w.id}`)) continue;
        const activeFrontForWar = this.skirmishes.filter((sk) => sk.warId === w.id && sk.kind === 'front').length;
        const maxWaves = w.phase === 'prep' ? 3 : 1;
        if (activeFrontForWar >= maxWaves) continue;
        const fp = this.frontPos(w);
        if (!fp || fp.map !== ACTIVE_MAP) continue;
        if (activeFrontForWar === 0 && this.skirmishes.some((sk) => sk.warId !== w.id && Math.hypot(sk.x - fp.x, sk.y - fp.y) < 3600)) continue;
        const distFp = Math.hypot(fp.x - p.x, fp.y - p.y);
        if (w.phase === 'prep') {
          const cp0 = this.campPos(w, 0), cp1 = this.campPos(w, 1);
          const nearZone = distFp <= 7600
            || (cp0 && cp0.map === ACTIVE_MAP && Math.hypot(cp0.x - p.x, cp0.y - p.y) <= 7200)
            || (cp1 && cp1.map === ACTIVE_MAP && Math.hypot(cp1.x - p.x, cp1.y - p.y) <= 7200);
          if (nearZone && w.campA!.soldiers >= 6 && w.campB!.soldiers >= 6) {
            const sk = this.spawnSkirmishSquad('front', w.a, w.b, fp.x, fp.y, fp.map, 5, w.id);
            if (sk) {
              this.skirmishCd.set(`war:${w.id}`, 7 + Math.random() * 3);
              break;
            }
          }
        } else {
          const mySide = this.sideOf(w);
          if (distFp <= 6200 && distFp >= Math.max(safeMinSpawnD, mySide !== undefined ? 1750 : 0)) {
            const sk = this.spawnSkirmishSquad('front', w.a, w.b, fp.x, fp.y, fp.map, 7, w.id);
            if (sk) break;
          }
        }
      }
    }
  }

  /** 为每个宗门生成稳定且区分度高的势力代表色（自建宗门鎏金、正道青翠靛蓝、魔道绛红紫砂、佛门金赭） */
  sectColor(sid: string): { stroke: string; fillRgb: string } {
    return sectColorRender(this.renderHost(), sid);
  }

  sectTerritories(map: string = ACTIVE_MAP): SectTerritory[] {
    return sectTerritoriesRender(this.renderHost(), map);
  }

  holdOwnerInfo(locId: string): { sid: string; name: string; g: number; isolated: boolean; isBranch?: boolean } | null {
    const h = this.S.hold[locId];
    if (h) return { sid: h.o, name: this.name(h.o), g: h.g, isolated: !!h.isolated };
    if ((this.S.branch ?? []).includes(locId)) return { sid: MY, name: `${this.name(MY)}分宗`, g: BRANCH[this.scale(locId)], isolated: false, isBranch: true };
    return null;
  }

  holdBadges(map: string = ACTIVE_MAP): SectHoldBadge[] {
    return holdBadgesRender(this.renderHost(), map);
  }

  frontLines(): SectFrontLine[] {
    return frontLinesRender(this.renderHost());
  }
}
