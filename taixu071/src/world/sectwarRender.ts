import type { Game } from './game';
import type { Drawable } from './life';
import type { MySect } from './mysect';
import type { CustomSectUniform } from '../gfx/sectUniform';
import { ACTIVE_MAP, LOC_BY_ID, WORLD_H, WORLD_SCALE, WORLD_W } from '../data/world';
import { SECT_DEF } from './roster';
import { type Dao, type Scale } from '../data/sects';
import { mulberry32 } from '../core/rng';
import { drawAirshipEntity, airshipDirFromVec, type AirshipStyle } from '../gfx/airship';
import { facingFromVec } from './warformation';
import { normalizeWorldMapId } from './contracts';
import {
  BRANCH,
  CAMP_BASE_CACHE,
  MAX_CAMP_BASE_CACHE,
  MY,
  pushWorldDisciple,
  pushWorldDiscipleBatch,
  type CampBaseEntry,
  type CampState,
  type DiscipleBatchUnit,
  type MarchEntity,
  type SWState,
  type SWar,
  type SkirmishSource,
  type SkirmishSquad,
} from './sectwarTypes';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface SectTerritory {
  sid: string;
  name: string;
  dao: Dao;
  stroke: string;
  fillRgb: string;
  isMine: boolean;
  gate: { x: number; y: number } | null;
  nodes: Array<{ id: string; name: string; x: number; y: number; r: number; kind: 'gate' | 'hold' | 'branch'; isolated: boolean; g: number }>;
}

export interface SectHoldBadge {
  id: string;
  x: number;
  y: number;
  owner: string;
  ownerName: string;
  g: number;
  col: string;
  isolated: boolean;
  isBranch?: boolean;
}

export interface SectFrontLine {
  warId: number;
  map: string;
  a: string;
  b: string;
  nameA: string;
  nameB: string;
  attSide: 0 | 1;
  tgtId: string;
  tgtName: string;
  score: number;
  wave: number;
  phase: 'prep' | 'battle';
  la: number;
  lb: number;
  campASoldiers: number;
  campAPills: number;
  campALv: number;
  campBSoldiers: number;
  campBPills: number;
  campBLv: number;
  holdsA: number;
  holdsB: number;
  marchesActive: number;
  stageLabel: string;
  trail: { x: number; y: number; name: string }[];
  ax: number;
  ay: number;
  bx: number;
  by: number;
  campAX: number;
  campAY: number;
  campBX: number;
  campBY: number;
  fx: number;
  fy: number;
  colA: string;
  colB: string;
  label: string;
  activeBattle: boolean;
  siege: boolean;
}

export interface SectWarRenderHost {
  game: Game;
  S: SWState;
  my: MySect | undefined;
  skirmishes: SkirmishSquad[];
  dao(sid: string): Dao;
  name(sid: string): string;
  scale(sid: string): Scale;
  between(a: string, b: string): SWar | undefined;
  def(w: SWar): string;
  tgtName(w: SWar): string;
  sideOf(w: SWar): 0 | 1 | undefined;
  sideSects(w: SWar, side: 0 | 1): string[];
  sideName(w: SWar, side: 0 | 1): string;
  campLevel(c: CampState): number;
  campPos(w: SWar, side: 0 | 1): { x: number; y: number; map: string } | null;
  frontPos(w: SWar): { x: number; y: number; map: string } | null;
  isSameCoalitionSide(w1: SWar, s1: 0 | 1, w2: SWar, s2: 0 | 1): boolean;
  isFrontlineStandoff(w: SWar): boolean;
  hasBattleForWar(warId: number): boolean;
  activeMarches(): MarchEntity[];
  marchPos(mc: MarchEntity): { x: number; y: number; map: string; dir: number; progress: number; mustering: boolean; musterRem: number };
  resolveFrontSource(w: SWar, sideIdx: 0 | 1, cx: number, cy: number, map: string): SkirmishSource | null;
  initHolds(): void;
  sects(map?: string): string[];
  holdsOf(sid: string): string[];
  combatTotal(sid: string): number;
  zhenHp(sid: string): number;
}

export function buildAllianceCampClusters(host: SectWarRenderHost, mapId: string): {
    lead: { w: SWar; sIdx: 0 | 1; cp: { x: number; y: number; map: string }; cmp: NonNullable<SWar['campA']>; fp: { x: number; y: number; map: string } | null };
    nodes: { w: SWar; sIdx: 0 | 1; cp: { x: number; y: number; map: string }; cmp: NonNullable<SWar['campA']>; fp: { x: number; y: number; map: string } | null }[];
    memberSects: string[];
    isCoalition: boolean;
    sideTitle: string;
    isMo: boolean;
    col: string;
    trimCol: string;
    lv: number;
    totalSoldiers: number;
    subCamps: {
      sid: string;
      sName: string;
      x: number;
      y: number;
      col: string;
      trim: string;
      custom?: CustomSectUniform;
    }[];
  }[] {
    type RawNode = { w: SWar; sIdx: 0 | 1; cp: { x: number; y: number; map: string }; cmp: NonNullable<SWar['campA']>; fp: { x: number; y: number; map: string } | null };
    const clusters: RawNode[][] = [];
    for (const w of host.S.wars) {
      const fpRaw = host.frontPos(w);
      const fp = fpRaw && fpRaw.map === mapId ? fpRaw : null;
      for (const sIdx of [0, 1] as const) {
        const cp = host.campPos(w, sIdx);
        const cmp = sIdx === 0 ? w.campA : w.campB;
        if (!cp || !cmp || cp.map !== mapId) continue;
        const node: RawNode = { w, sIdx, cp, cmp, fp };
        const matchedIndices: number[] = [];
        for (let ci = 0; ci < clusters.length; ci++) {
          if (clusters[ci].some((gn) => host.isSameCoalitionSide(w, sIdx, gn.w, gn.sIdx))) {
            matchedIndices.push(ci);
          }
        }
        if (!matchedIndices.length) {
          clusters.push([node]);
        } else {
          const baseIdx = matchedIndices[0];
          clusters[baseIdx].push(node);
          // 传递合并：若当前节点连接了多个原本分离的同盟子簇（如个人战事与十宗同盟），合并为单一总营集群
          for (let k = matchedIndices.length - 1; k >= 1; k--) {
            clusters[baseIdx].push(...clusters[matchedIndices[k]]);
            clusters.splice(matchedIndices[k], 1);
          }
        }
      }
    }

    const tr = (host.game as any).terrain;
    const W = tr?.W ? tr.W * WORLD_SCALE : WORLD_W;
    const H = tr?.H ? tr.H * WORLD_SCALE : WORLD_H;
    const locs: { x: number; y: number; r: number }[] = [];
    for (const l of LOC_BY_ID.values()) {
      if (l.map !== mapId) continue;
      locs.push({ x: l.x * WORLD_SCALE, y: l.y * WORLD_SCALE, r: l.type === 'city' || l.type === 'sect' ? 2650 : 1950 });
    }
    const occupiedSubPts: { x: number; y: number }[] = [];
    const preparedRaw = clusters.map((nodes) => {
      nodes.sort((a, b) => {
        const pa = (a.w.side === a.sIdx ? 100 : 0) + host.sideSects(a.w, a.sIdx).length * 10 - a.w.id * 0.01;
        const pb = (b.w.side === b.sIdx ? 100 : 0) + host.sideSects(b.w, b.sIdx).length * 10 - b.w.id * 0.01;
        return pb - pa;
      });
      const lead = nodes[0];
      const leadSid = lead.sIdx === 0 ? lead.w.a : lead.w.b;
      const sectSet = new Set<string>();
      let lv = 1;
      let totalSoldiers = 0;
      const seenCmp = new Set<NonNullable<SWar['campA']>>();
      for (const n of nodes) {
        for (const sid of host.sideSects(n.w, n.sIdx)) {
          if (sid === leadSid || !host.between(leadSid, sid)) sectSet.add(sid);
        }
        lv = Math.max(lv, host.campLevel(n.cmp));
        if (!seenCmp.has(n.cmp)) {
          seenCmp.add(n.cmp);
          totalSoldiers += n.cmp.soldiers;
        }
      }
      return { nodes, lead, leadSid, rawSects: [...sectSet], lv, totalSoldiers, seenCmp };
    });

    // 若同一主帅宗门因旁系盟友互相敌对而被拆进两个集群，合并其节点与兵力，绝不生成两座同名大营
    const byLead = new Map<string, typeof preparedRaw[number]>();
    const prepared: typeof preparedRaw = [];
    for (const p of preparedRaw) {
      const prev = byLead.get(p.leadSid);
      if (!prev) {
        byLead.set(p.leadSid, p);
        prepared.push(p);
      } else {
        prev.nodes.push(...p.nodes);
        for (const s of p.rawSects) if (!prev.rawSects.includes(s)) prev.rawSects.push(s);
        prev.lv = Math.max(prev.lv, p.lv);
        for (const n of p.nodes) {
          if (!prev.seenCmp.has(n.cmp)) {
            prev.seenCmp.add(n.cmp);
            prev.totalSoldiers += n.cmp.soldiers;
          }
        }
      }
    }

    // 全局去重归属：每个宗门（含主角宗门）在同一地图仅归属一座营寨集群，绝不同时既独立建大营又挂名他营分营
    const claimedSects = new Set<string>();
    for (const p of prepared) claimedSects.add(p.leadSid);

    return prepared.map(({ nodes, lead, leadSid, rawSects, lv, totalSoldiers }) => {
      const memberSects: string[] = [leadSid];
      for (const sid of rawSects) {
        if (sid === leadSid) continue;
        if (!claimedSects.has(sid)) {
          claimedSects.add(sid);
          memberSects.push(sid);
        }
      }
      const isCoalition = memberSects.length > 1;
      const isMo = host.dao(leadSid) === 'mo';
      const col = isMo ? '#b84252' : '#4a88b8';
      const trimCol = isMo ? '#e88b96' : '#e6c26b';
      const sideTitle = isCoalition ? host.sideName(lead.w, lead.sIdx) : host.name(leadSid);

      const subCamps: {
        sid: string;
        sName: string;
        x: number;
        y: number;
        col: string;
        trim: string;
        custom?: CustomSectUniform;
      }[] = [];

      if (isCoalition) {
        const hq = lead.cp;
        const fp = lead.fp;
        const angToFront = fp ? Math.atan2(fp.y - hq.y, fp.x - hq.x) : (lead.sIdx === 0 ? 0 : Math.PI);
        const rearAng = angToFront + Math.PI;
        const validSubPt = (sx: number, sy: number) => {
          if (sx < 1400 || sx > W - 1400 || sy < 1400 || sy > H - 1400) return false;
          if (tr?.walkFactor && tr.walkFactor(sx, sy) <= 0) return false;
          if (fp && Math.hypot(sx - fp.x, sy - fp.y) < 2200) return false;
          if (Math.hypot(sx - hq.x, sy - hq.y) < 1350) return false;
          for (const l of locs) if (Math.hypot(sx - l.x, sy - l.y) < l.r) return false;
          for (const op of occupiedSubPts) if (Math.hypot(sx - op.x, sy - op.y) < 1150) return false;
          return true;
        };

        const ring1Cap = Math.min(5, memberSects.length);
        for (let i = 0; i < memberSects.length; i++) {
          const sid = memberSects[i];
          const inRing2 = i >= ring1Cap;
          const idxInRing = inRing2 ? i - ring1Cap : i;
          const ringTotal = inRing2 ? Math.max(1, memberSects.length - ring1Cap) : ring1Cap;
          const baseRad = inRing2 ? 3350 : (memberSects.length <= 3 ? 1650 : 2100);
          // 对称排布在总营周围（外环错开半格角度插空，彼此留足间距，远近景名牌互不挤压）
          let baseAng: number;
          if (ringTotal <= 3 && !inRing2) {
            const frac = ringTotal === 1 ? 0 : (idxInRing / (ringTotal - 1)) - 0.5;
            baseAng = rearAng + frac * (ringTotal === 2 ? Math.PI * 0.72 : Math.PI * 1.08);
          } else {
            const span = Math.PI * 1.66;
            const frac = (idxInRing + 0.5) / ringTotal - 0.5;
            baseAng = rearAng + frac * span + (inRing2 ? span / (ringTotal * 2) : 0);
          }

          let chosenX = hq.x + Math.cos(baseAng) * baseRad;
          let chosenY = hq.y + Math.sin(baseAng) * baseRad;
          let placed = false;
          const angleDeltas = [0, 0.24, -0.24, 0.5, -0.5, 0.82, -0.82, 1.2, -1.2];
          const radScales = [1.0, 1.18, 1.38, 0.88];
          for (const rs of radScales) {
            for (const da of angleDeltas) {
              const cx = hq.x + Math.cos(baseAng + da) * baseRad * rs;
              const cy = hq.y + Math.sin(baseAng + da) * baseRad * rs;
              if (validSubPt(cx, cy)) {
                chosenX = cx;
                chosenY = cy;
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
          occupiedSubPts.push({ x: chosenX, y: chosenY });
          const sDaoMo = host.dao(sid) === 'mo';
          const robe = sid === MY ? host.my?.uniform?.robe : SECT_DEF.get(sid)?.robe;
          subCamps.push({
            sid,
            sName: host.name(sid),
            x: chosenX,
            y: chosenY,
            col: robe || (sDaoMo ? '#b84252' : '#4a88b8'),
            trim: sDaoMo ? '#e88b96' : '#e6c26b',
            custom: sid === MY ? host.my?.uniform : undefined,
          });
        }
      }

      return { lead, nodes, memberSects, isCoalition, sideTitle, isMo, col, trimCol, lv, totalSoldiers, subCamps };
    });
  }

  /** 地图实景绘制：同盟唯一总营 + 周围各参战宗门独立分营（静态离屏缓存 + 巡守弟子 WebGL 合批）、行军纵队与运丹车队 */
export function collectSectWarWorld(
  host: SectWarRenderHost,
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
    const campPad = 3600;
    const marchPad = 2200;
    const inCampView = (x: number, y: number) => x >= view.left - campPad && x <= view.right + campPad && y >= view.top - campPad && y <= view.bottom + campPad;
    const inMarchView = (x: number, y: number) => x >= view.left - marchPad && x <= view.right + marchPad && y >= view.top - marchPad && y <= view.bottom + marchPad;
    const S = host.S;
    const p = host.game.player;
    const showDetailedProps = z >= 0.16;

    // 1. 边界大营：极远沙盘模式（farSummary）交由 collectFarWorld 统管，避免灰圈底座在沙盘徽记下双重叠画
    if (!farSummary) {
      const clusters = buildAllianceCampClusters(host, ACTIVE_MAP);
      const drawTentStatic = (
        bctx: CanvasRenderingContext2D,
        tx: number,
        ty: number,
        sc: number,
        kind: 'main' | 'med' | 'soldier',
        tentCol: string,
        tentTrim: string,
      ) => {
        const main = kind === 'main';
        bctx.fillStyle = 'rgba(18,14,10,0.24)';
        bctx.beginPath();
        bctx.ellipse(tx + 2, ty + 9 * sc, 38 * sc, 14 * sc, 0, 0, Math.PI * 2);
        bctx.fill();
        bctx.fillStyle = main ? '#f5ead2' : kind === 'med' ? '#e2eee2' : '#e5d8bc';
        bctx.beginPath();
        bctx.moveTo(tx, ty - 40 * sc);
        bctx.lineTo(tx + 36 * sc, ty + 7 * sc);
        bctx.lineTo(tx, ty + 12 * sc);
        bctx.lineTo(tx - 36 * sc, ty + 7 * sc);
        bctx.closePath();
        bctx.fill();
        bctx.fillStyle = main ? '#dfd0b0' : kind === 'med' ? '#c8dac8' : '#d2c3a4';
        bctx.beginPath();
        bctx.moveTo(tx, ty - 40 * sc);
        bctx.lineTo(tx - 36 * sc, ty + 7 * sc);
        bctx.lineTo(tx, ty + 12 * sc);
        bctx.closePath();
        bctx.fill();
        bctx.strokeStyle = kind === 'med' ? '#4a9868' : tentCol;
        bctx.lineWidth = main ? 2.8 : 1.7;
        bctx.beginPath();
        bctx.moveTo(tx - 36 * sc, ty + 7 * sc);
        bctx.lineTo(tx, ty - 40 * sc);
        bctx.lineTo(tx + 36 * sc, ty + 7 * sc);
        bctx.stroke();
        bctx.fillStyle = '#3c2c20';
        bctx.beginPath();
        bctx.moveTo(tx, ty - 17 * sc);
        bctx.lineTo(tx + 8 * sc, ty + 10 * sc);
        bctx.lineTo(tx - 8 * sc, ty + 10 * sc);
        bctx.closePath();
        bctx.fill();
        if (main) {
          bctx.fillStyle = tentTrim;
          bctx.beginPath();
          bctx.arc(tx, ty - 42 * sc, 5.5, 0, Math.PI * 2);
          bctx.fill();
          bctx.strokeStyle = '#332214';
          bctx.lineWidth = 3.5;
          bctx.beginPath();
          bctx.moveTo(tx + 32 * sc, ty + 6);
          bctx.lineTo(tx + 32 * sc, ty - 108);
          bctx.stroke();
        }
      };

      const drawPalisadeAndGates = (
        bctx: CanvasRenderingContext2D,
        rx: number,
        ry: number,
        gateSide: number,
        col: string,
        postCount: number,
        towerDirs: number[][],
        props: { y: number; draw: () => void }[],
      ) => {
        const gateX = gateSide * rx * 0.92;
        for (let i = 0; i < postCount; i++) {
          const a = (i / postCount) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a);
          if (Math.abs(sa) < 0.24 && ca * gateSide > 0.72) continue;
          const px = ca * rx, py = sa * ry;
          props.push({
            y: py,
            draw: () => {
              bctx.fillStyle = '#3f2c1b';
              bctx.fillRect(px - 4.5, py - 28, 9, 30);
              bctx.fillStyle = '#684a2f';
              bctx.beginPath();
              bctx.moveTo(px - 4.5, py - 28);
              bctx.lineTo(px, py - 39);
              bctx.lineTo(px + 4.5, py - 28);
              bctx.closePath();
              bctx.fill();
              bctx.strokeStyle = '#533a24';
              bctx.lineWidth = 2.4;
              bctx.beginPath();
              bctx.moveTo(px - 14, py - 14);
              bctx.lineTo(px + 14, py - 14);
              bctx.stroke();
            },
          });
        }
        for (const gSideY of [-42, 42]) {
          props.push({
            y: gSideY,
            draw: () => {
              bctx.fillStyle = '#4e3722';
              bctx.fillRect(gateX - 7, gSideY - 62, 14, 64);
              bctx.fillStyle = col;
              bctx.fillRect(gateX + (gateSide > 0 ? 4 : -20), gSideY - 60, 16, 22);
            },
          });
        }
        for (const [sx, sy] of towerDirs) {
          const tx = sx * rx * 0.76, ty = sy * ry * 0.72;
          props.push({
            y: ty,
            draw: () => {
              bctx.fillStyle = 'rgba(0,0,0,0.24)';
              bctx.beginPath();
              bctx.ellipse(tx, ty + 8, 28, 11, 0, 0, Math.PI * 2);
              bctx.fill();
              bctx.strokeStyle = '#4e3722';
              bctx.lineWidth = 4;
              bctx.beginPath();
              bctx.moveTo(tx - 15, ty + 6); bctx.lineTo(tx - 11, ty - 62);
              bctx.moveTo(tx + 15, ty + 6); bctx.lineTo(tx + 11, ty - 62);
              bctx.stroke();
              bctx.fillStyle = '#6e4e31';
              bctx.fillRect(tx - 20, ty - 62, 40, 12);
              bctx.fillStyle = col;
              bctx.beginPath();
              bctx.moveTo(tx, ty - 90);
              bctx.lineTo(tx + 26, ty - 64);
              bctx.lineTo(tx - 26, ty - 64);
              bctx.closePath();
              bctx.fill();
            },
          });
        }
      };

      type CampTagReq = {
        id: number;
        ax: number;
        ay: number;
        prefOffY: number;
        text: string;
        borderCol: string;
        isCommand: boolean;
        minW: number;
      };
      type CampObsBox = { id: number; x0: number; y0: number; x1: number; y1: number };
      const campTagReqs: CampTagReq[] = [];
      const campObsBoxes: CampObsBox[] = [];
      let nextTagId = 1;

      for (const cl of clusters) {
        const { lead, memberSects, isCoalition, sideTitle, isMo, col, trimCol, lv, totalSoldiers, subCamps } = cl;
        const w = lead.w;
        const sIdx = lead.sIdx;
        const cp = lead.cp;
        const fp = lead.fp;
        const leadSid = sIdx === 0 ? w.a : w.b;
        const mySide = host.sideOf(w);
        const isAlliedCamp = (mySide === sIdx || cl.nodes.some((n) => host.sideOf(n.w) === n.sIdx)) && !w.fall && !host.hasBattleForWar(w.id);
        const cmpNow = sIdx === 0 ? w.campA : w.campB;
        const campEstablished = cmpNow?.established ?? ((cmpNow?.build ?? 1) >= 0.15);

        // 1A. 中心总营（同图同盟仅此一座）
        if (inCampView(cp.x, cp.y)) {
          const rx = isCoalition ? 560 : (lv === 1 ? 500 : lv === 2 ? 700 : 900);
          const ry = isCoalition ? 340 : (lv === 1 ? 300 : lv === 2 ? 420 : 540);
          const reach = rx + 260;
          const playerNearCamp = isAlliedCamp && (
            Math.hypot(cp.x - p.x, cp.y - p.y) <= reach ||
            subCamps.some((sc) => Math.hypot(sc.x - p.x, sc.y - p.y) <= 340)
          );
          const angToFront = fp ? Math.atan2(fp.y - cp.y, fp.x - cp.x) : (sIdx === 0 ? 0 : Math.PI);
          const gateSide = Math.cos(angToFront) >= 0 ? 1 : -1;
          const gateX = gateSide * rx * 0.92;
          const spokeAngles = subCamps.map((sc) => Math.atan2(sc.y - cp.y, sc.x - cp.x));

          const established = campEstablished;
          const buildFrac = cmpNow?.build ?? 1;
          const buildStage: 0 | 1 | 2 = !established ? 0 : buildFrac < 0.25 ? 0 : buildFrac < 0.65 ? 1 : 2;
          const drawHqBase = (bctx: CanvasRenderingContext2D) => {
            if (!established) {
              // 尚未有先遣弟子抵达：仅在集结点立「勘址圈桩」与集结界石（绝不提前刷出营帐木栅）
              bctx.fillStyle = 'rgba(116,96,68,0.12)';
              bctx.beginPath();
              bctx.ellipse(0, 8, rx * 0.62, ry * 0.6, 0, 0, Math.PI * 2);
              bctx.fill();
              bctx.strokeStyle = isMo ? 'rgba(218,96,112,0.58)' : 'rgba(228,184,88,0.68)';
              bctx.lineWidth = 2.2;
              bctx.setLineDash([12, 10]);
              bctx.beginPath();
              bctx.ellipse(0, 6, rx * 0.56, ry * 0.54, 0, 0, Math.PI * 2);
              bctx.stroke();
              bctx.setLineDash([]);
              const stakeN = 12;
              for (let k = 0; k < stakeN; k++) {
                const a0 = (k / stakeN) * Math.PI * 2;
                const px0 = Math.cos(a0) * rx * 0.56, py0 = Math.sin(a0) * ry * 0.54;
                bctx.fillStyle = '#533a24';
                bctx.fillRect(px0 - 3, py0 - 16, 6, 18);
              }
              bctx.fillStyle = '#4c3420';
              bctx.fillRect(-3, -124, 6, 128);
              return;
            }
            // 总营通往各分营的放射土道
            if (isCoalition && spokeAngles.length) {
              bctx.strokeStyle = 'rgba(148,124,92,0.34)';
              bctx.lineWidth = 26;
              bctx.lineCap = 'round';
              for (const sa of spokeAngles) {
                bctx.beginPath();
                bctx.moveTo(0, 0);
                bctx.lineTo(Math.cos(sa) * (rx + 180), Math.sin(sa) * (ry + 150));
                bctx.stroke();
              }
            }
            bctx.fillStyle = buildStage === 0 ? 'rgba(116,96,68,0.18)' : 'rgba(116,96,68,0.28)';
            bctx.beginPath();
            bctx.ellipse(0, 10, rx + 42, ry + 32, 0, 0, Math.PI * 2);
            bctx.fill();
            if (buildStage === 0) {
              // 初入勘址扎营：地基桩界线、拉绳围桩、工程架木、粮箱堆料、工兵营帐
              bctx.strokeStyle = 'rgba(218,184,116,0.58)';
              bctx.lineWidth = 2.2;
              bctx.setLineDash([12, 10]);
              bctx.beginPath();
              bctx.ellipse(0, 6, rx * 0.85, ry * 0.82, 0, 0, Math.PI * 2);
              bctx.stroke();
              bctx.setLineDash([]);
              const stakeN = 20;
              bctx.strokeStyle = 'rgba(182,148,96,0.72)';
              bctx.lineWidth = 1.6;
              for (let k = 0; k < stakeN; k++) {
                const a0 = (k / stakeN) * Math.PI * 2;
                const a1 = ((k + 1) / stakeN) * Math.PI * 2;
                const px0 = Math.cos(a0) * rx * 0.85, py0 = Math.sin(a0) * ry * 0.82;
                const px1 = Math.cos(a1) * rx * 0.85, py1 = Math.sin(a1) * ry * 0.82;
                bctx.fillStyle = '#533a24';
                bctx.fillRect(px0 - 3.5, py0 - 20, 7, 22);
                bctx.beginPath();
                bctx.moveTo(px0, py0 - 14);
                bctx.lineTo(px1, py1 - 14);
                bctx.stroke();
              }
              // 未合拢半截木栅架与工程木料堆
              for (const [lx, ly] of [[-130, -48], [120, -34], [-105, 68], [135, 60], [-210, 12], [210, -8]]) {
                bctx.fillStyle = '#755333';
                bctx.fillRect(lx - 24, ly - 9, 48, 15);
                bctx.strokeStyle = '#3d2815';
                bctx.lineWidth = 1.4;
                bctx.strokeRect(lx - 24, ly - 9, 48, 15);
                bctx.beginPath();
                bctx.moveTo(lx - 18, ly - 16);
                bctx.lineTo(lx + 18, ly - 2);
                bctx.moveTo(lx + 18, ly - 16);
                bctx.lineTo(lx - 18, ly - 2);
                bctx.stroke();
              }
              drawTentStatic(bctx, 0, -10, 1.25, 'soldier', col, trimCol);
              drawTentStatic(bctx, -84, 24, 0.9, 'soldier', col, trimCol);
              drawTentStatic(bctx, 88, 28, 0.9, 'med', col, trimCol);
              return;
            }
            bctx.fillStyle = 'rgba(148,124,92,0.24)';
            bctx.fillRect(-rx * 0.9, -24, rx * 1.8, 48);
            bctx.fillRect(-26, -ry * 0.84, 52, ry * 1.68);
            if (lv >= 2 || isCoalition) {
              bctx.strokeStyle = isMo ? `rgba(218,78,94,${lv >= 3 ? 0.44 : 0.28})` : `rgba(92,178,238,${lv >= 3 ? 0.44 : 0.28})`;
              bctx.lineWidth = lv >= 3 || isCoalition ? 2.4 : 1.7;
              bctx.setLineDash([16, 10]);
              bctx.beginPath();
              bctx.ellipse(0, 8, rx + 58, ry + 40, 0, 0, Math.PI * 2);
              bctx.stroke();
              bctx.setLineDash([]);
            }
            type CampProp = { y: number; draw: () => void };
            const props: CampProp[] = [];
            const fullPostCount = lv === 1 ? 44 : lv === 2 ? 58 : 72;
            const postCount = buildStage === 1 ? Math.round(fullPostCount * 0.55) : fullPostCount;
            const towerDirs = buildStage === 1
              ? [[gateSide, -0.7]]
              : (lv >= 3 || isCoalition ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : lv === 2 ? [[gateSide, -1], [gateSide, 1], [-gateSide, 0]] : [[gateSide, -0.85], [gateSide, 0.85]]);
            drawPalisadeAndGates(bctx, rx, ry, gateSide, col, postCount, towerDirs, props);

            props.push({
              y: -12,
              draw: () => {
                bctx.fillStyle = '#8b6f4e';
                bctx.fillRect(-82, -6, 164, 24);
                bctx.strokeStyle = '#5c452d';
                bctx.lineWidth = 1.6;
                bctx.strokeRect(-82, -6, 164, 24);
                drawTentStatic(bctx, 0, -14, isCoalition ? 2.1 : 1.85, 'main', col, trimCol);
              },
            });
            props.push({ y: -86, draw: () => drawTentStatic(bctx, -155, -86, 1.18, 'med', col, trimCol) });
            if (buildStage >= 2) {
              props.push({ y: -86, draw: () => drawTentStatic(bctx, 155, -86, 1.18, 'soldier', col, trimCol) });
              const rng = mulberry32(w.id * 997 + sIdx * 131 + 17);
              const ringCols = isCoalition ? [-360, -240, -120, 120, 240, 360] : lv === 1 ? [-270, -180, -90, 90, 180, 270] : lv === 2 ? [-420, -315, -210, -105, 105, 210, 315, 420] : [-580, -460, -340, -220, -110, 110, 220, 340, 460, 580];
              const ringRows = isCoalition ? [-210, -110, 105, 210] : lv === 1 ? [-175, -90, 95, 180] : lv === 2 ? [-250, -145, 105, 215, 305] : [-320, -205, -105, 110, 220, 330];
              for (const ry0 of ringRows) {
                for (const rx0 of ringCols) {
                  if (Math.abs(rx0) < 200 && Math.abs(ry0) < 115) continue;
                  if (Math.hypot(rx0 / (rx * 0.86), ry0 / (ry * 0.86)) > 1) continue;
                  const jx = rx0 + (rng() - 0.5) * 20;
                  const jy = ry0 + (rng() - 0.5) * 14;
                  const sc = 0.82 + rng() * 0.18;
                  props.push({ y: jy, draw: () => drawTentStatic(bctx, jx, jy, sc, 'soldier', col, trimCol) });
                }
              }
            }
            for (const [wx0, wy0] of [[-95, 46], [95, 46], [-210, 38], [210, 38]]) {
              props.push({
                y: wy0,
                draw: () => {
                  bctx.strokeStyle = '#4c3420';
                  bctx.lineWidth = 2.5;
                  bctx.beginPath();
                  bctx.moveTo(wx0 - 16, wy0); bctx.lineTo(wx0 - 14, wy0 - 24);
                  bctx.moveTo(wx0 + 16, wy0); bctx.lineTo(wx0 + 14, wy0 - 24);
                  bctx.moveTo(wx0 - 18, wy0 - 18); bctx.lineTo(wx0 + 18, wy0 - 18);
                  bctx.stroke();
                  bctx.strokeStyle = '#9aa8b6';
                  bctx.lineWidth = 1.6;
                  for (let k = -10; k <= 10; k += 6) {
                    bctx.beginPath(); bctx.moveTo(wx0 + k, wy0 + 2); bctx.lineTo(wx0 + k, wy0 - 26); bctx.stroke();
                  }
                },
              });
            }
            props.sort((a, b) => a.y - b.y);
            for (const pr of props) pr.draw();
          };

          const baseKey = `hq:${w.id}:${sIdx}:${established ? 1 : 0}:${lv}:${buildStage}:${gateSide}:${Math.round(rx)}:${Math.round(ry)}:${spokeAngles.map((a) => Math.round(a * 20)).join(',')}`;
          let base: CampBaseEntry | undefined;
          if (ren) {
            base = CAMP_BASE_CACHE.get(baseKey);
            if (base) {
              CAMP_BASE_CACHE.delete(baseKey);
              CAMP_BASE_CACHE.set(baseKey, base);
            } else if (typeof document !== 'undefined') {
              const padX = 240, padY = 220;
              const ox = Math.ceil(rx + padX), oy = Math.ceil(ry + padY);
              const cw = Math.ceil((rx + padX) * 2), ch = Math.ceil((ry + padY) * 2);
              const cv = document.createElement('canvas');
              cv.width = cw; cv.height = ch;
              const bctx = cv.getContext('2d');
              if (bctx) {
                bctx.save();
                bctx.translate(ox, oy);
                drawHqBase(bctx);
                bctx.restore();
                base = { cv, ox, oy };
                CAMP_BASE_CACHE.set(baseKey, base);
                if (CAMP_BASE_CACHE.size > MAX_CAMP_BASE_CACHE) {
                  const first = CAMP_BASE_CACHE.keys().next().value;
                  if (first !== undefined) CAMP_BASE_CACHE.delete(first);
                }
              }
            }
          }

          const relocMark = cmpNow?.relocating ? ' · 拔营迁址中' : '';
          const buildTag = !established
            ? '集结点(待先遣立营)'
            : buildStage === 0
              ? `勘址扎营(${Math.round(buildFrac * 100)}%)`
              : buildStage === 1
                ? `筑营中(${Math.round(buildFrac * 100)}%)`
                : `Lv${lv}`;
          const titleTxt = isCoalition
            ? `${sideTitle}${established ? `总营(${memberSects.length}宗)` : '集结总点'} · ${buildTag}${relocMark} · ${totalSoldiers}人`
            : `${sideTitle}${established ? '大营' : '集结点'} · ${buildTag}${relocMark} · ${totalSoldiers}人`;
          const baseRef = base;
          const hqSc = isCoalition ? 2.1 : 1.85;
          const flagLabel = isCoalition ? sideTitle.slice(0, 3) : host.name(leadSid).slice(0, 3);
          const hqTagId = nextTagId++;
          campObsBoxes.push({ id: hqTagId, x0: cp.x - rx * 0.55, y0: cp.y - ry * 0.55, x1: cp.x + rx * 0.55, y1: cp.y + ry * 0.4 });
          campTagReqs.push({
            id: hqTagId,
            ax: cp.x,
            ay: cp.y,
            prefOffY: Math.max(ry * 0.45, 160),
            text: titleTxt,
            borderCol: isCoalition ? '#f2cf78' : trimCol,
            isCommand: true,
            minW: 136,
          });
          out.push({
            y: cp.y + 40,
            k: 'D·宗门大营',
            draw: (ctx) => {
              ctx.save();
              if (baseRef) {
                ctx.drawImage(baseRef.cv, cp.x - baseRef.ox, cp.y - baseRef.oy);
                ctx.translate(cp.x, cp.y);
              } else {
                ctx.translate(cp.x, cp.y);
                drawHqBase(ctx);
              }
              const wave = Math.sin(t * 4.5 + cp.x * 0.01) * 6;
              const flgX = established ? 32 * hqSc : 2;
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.moveTo(flgX, -122);
              ctx.lineTo(flgX + 52, -109 + wave);
              ctx.lineTo(flgX + 38, -94 + wave * 0.7);
              ctx.lineTo(flgX, -84);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#fff5dc';
              ctx.font = 'bold 10.5px "Noto Serif SC", serif';
              ctx.textAlign = 'center';
              ctx.fillText(flagLabel, flgX + 22, -100 + wave * 0.45);
              if (established && showDetailedProps) {
                for (let fi = 0; fi < 4; fi++) {
                  const [fx0, fy0] = [[-70, 56], [72, 56], [-195, -26], [195, -26]][fi];
                  const fl = Math.sin(t * 11 + fi * 2.1) * 3;
                  ctx.fillStyle = 'rgba(255,140,45,0.22)';
                  ctx.beginPath();
                  ctx.ellipse(fx0, fy0 + 2, 22, 9, 0, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.fillStyle = '#4a3220';
                  ctx.fillRect(fx0 - 8, fy0, 16, 4);
                  ctx.fillStyle = '#ff8a2a';
                  ctx.beginPath();
                  ctx.moveTo(fx0 - 6, fy0 + 1);
                  ctx.lineTo(fx0 + fl * 0.4, fy0 - 16 - fl * 0.6);
                  ctx.lineTo(fx0 + 6, fy0 + 1);
                  ctx.closePath();
                  ctx.fill();
                  ctx.fillStyle = '#ffe078';
                  ctx.beginPath();
                  ctx.arc(fx0, fy0 - 5, 3.5, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              if (playerNearCamp && showDetailedProps) {
                const tip = '按 T 进帅帐议事';
                ctx.font = 'bold 13px "Noto Serif SC", serif';
                const tw = ctx.measureText(tip).width + 20;
                ctx.fillStyle = 'rgba(22,18,12,0.86)';
                ctx.fillRect(-tw * 0.5, -150, tw, 24);
                ctx.strokeStyle = 'rgba(255,220,140,0.95)';
                ctx.lineWidth = 1.2;
                ctx.strokeRect(-tw * 0.5, -150, tw, 24);
                ctx.fillStyle = '#fff2cc';
                ctx.textAlign = 'center';
                ctx.fillText(tip, 0, -134);
              }
              ctx.restore();
            },
          });

          // 帅帐护卫、营门守卫与四角/两翼哨岗（仅正式立营后驻守；未立营集结点只留勘址旗标）
          if (established) {
            const gateLook = facingFromVec(gateSide, 0);
            const sentryPosts: [number, number, number, number][] = [
              [-68, 22, gateSide, 0],
              [68, 22, gateSide, 0],
              [gateX - gateSide * 20, -34, gateSide, -0.15],
              [gateX - gateSide * 20, 34, gateSide, 0.15],
            ];
            if (lv >= 2 || isCoalition) {
              sentryPosts.push(
                [-rx * 0.68, -ry * 0.62, -1, -0.7],
                [rx * 0.68, -ry * 0.62, 1, -0.7],
                [-rx * 0.68, ry * 0.62, -1, 0.7],
                [rx * 0.68, ry * 0.62, 1, 0.7],
              );
            } else {
              sentryPosts.push(
                [gateSide * rx * 0.56, -ry * 0.66, gateSide, -0.7],
                [gateSide * rx * 0.56, ry * 0.66, gateSide, 0.7],
              );
            }
            for (let gi = 0; gi < sentryPosts.length; gi++) {
              const [ox, oy, fx, fy] = sentryPosts[gi];
              const gx = cp.x + ox, gy = cp.y + oy;
              const frame = Math.floor(t * 1.5 + gi) & 1;
              const gSid = memberSects[gi % memberSects.length] ?? leadSid;
              const dir = (ox === -68 || ox === 68) ? gateLook : facingFromVec(fx, fy);
              pushWorldDisciple(out, ren, gx, gy, 'D·营地弟子', gSid, gi % 6, dir.facing, frame, dir.flip, gSid === MY ? host.my?.uniform : undefined, z);
            }
          }
        }
        // 若大营正在迁往新址（即使旧营在视野之外，新址入画即绘「新营勘址令旗」，待迁营编队抵达后立起新营）
        if (cmpNow?.relocating && cmpNow.relocating.map === ACTIVE_MAP && inCampView(cmpNow.relocating.toX, cmpNow.relocating.toY)) {
          const nx = cmpNow.relocating.toX, ny = cmpNow.relocating.toY;
          const nLabel = `${sideTitle} · 新营勘址`;
          out.push({
            y: ny + 12,
            k: 'D·新营勘址',
            draw: (ctx) => {
              ctx.save();
              ctx.strokeStyle = isMo ? 'rgba(218,96,112,0.7)' : 'rgba(228,184,88,0.75)';
              ctx.lineWidth = 2.4;
              ctx.setLineDash([12, 8]);
              ctx.beginPath(); ctx.ellipse(nx, ny + 4, 240, 145, 0, 0, Math.PI * 2); ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = '#4c3420'; ctx.fillRect(nx - 2.5, ny - 92, 5, 96);
              ctx.fillStyle = isMo ? '#b84252' : '#4a88b8';
              ctx.beginPath(); ctx.moveTo(nx + 2.5, ny - 92); ctx.lineTo(nx + 48, ny - 76); ctx.lineTo(nx + 2.5, ny - 60); ctx.closePath(); ctx.fill();
              if (z >= 0.06) {
                ctx.font = 'bold 11px "Noto Serif SC", serif'; ctx.textAlign = 'center';
                const tw = Math.max(110, ctx.measureText(nLabel).width + 16);
                ctx.fillStyle = 'rgba(20,16,12,0.85)'; ctx.fillRect(nx - tw * 0.5, ny + 26, tw, 20);
                ctx.fillStyle = '#ffe6a4'; ctx.fillText(nLabel, nx, ny + 40);
              }
              ctx.restore();
            },
          });
        }

        // 1B. 围绕总营独立布设的各宗门分营（禁止把多宗硬合并为一处，各具独立营盘、帅帐、旗号与营名；仅正式立营后搭设分营）
        if (campEstablished) for (let si = 0; si < subCamps.length; si++) {
          const sub = subCamps[si];
          if (!inCampView(sub.x, sub.y)) continue;
          const srx = 240, sry = 152;
          const toHqX = cp.x - sub.x, toHqY = cp.y - sub.y;
          const sGateSide = toHqX >= 0 ? 1 : -1;
          const sGateX = sGateSide * srx * 0.92;
          const distHq = Math.hypot(toHqX, toHqY) || 1;
          const ux = toHqX / distHq, uy = toHqY / distHq;

          const drawSubBase = (bctx: CanvasRenderingContext2D) => {
            // 通向中心总营方向的行军联络道
            bctx.strokeStyle = 'rgba(148,124,92,0.34)';
            bctx.lineWidth = 22;
            bctx.lineCap = 'round';
            bctx.beginPath();
            bctx.moveTo(0, 0);
            bctx.lineTo(ux * Math.min(distHq * 0.72, 760), uy * Math.min(distHq * 0.72, 760));
            bctx.stroke();

            bctx.fillStyle = 'rgba(116,96,68,0.26)';
            bctx.beginPath();
            bctx.ellipse(0, 8, srx + 28, sry + 22, 0, 0, Math.PI * 2);
            bctx.fill();
            bctx.fillStyle = 'rgba(148,124,92,0.22)';
            bctx.fillRect(-srx * 0.86, -16, srx * 1.72, 32);

            const props: { y: number; draw: () => void }[] = [];
            drawPalisadeAndGates(bctx, srx, sry, sGateSide, sub.col, 26, [[sGateSide, -0.75], [sGateSide, 0.75]], props);
            props.push({
              y: -10,
              draw: () => {
                bctx.fillStyle = 'rgba(139,111,78,0.78)';
                bctx.fillRect(-52, -4, 104, 16);
                drawTentStatic(bctx, 0, -12, 1.42, 'main', sub.col, sub.trim);
              },
            });
            const srng = mulberry32((w.id * 997 + si * 313 + 73) >>> 0);
            for (const ry0 of [-86, 78]) {
              for (const rx0 of [-135, -62, 62, 135]) {
                if (Math.hypot(rx0 / (srx * 0.84), ry0 / (sry * 0.84)) > 1) continue;
                const jx = rx0 + (srng() - 0.5) * 14;
                const jy = ry0 + (srng() - 0.5) * 10;
                props.push({ y: jy, draw: () => drawTentStatic(bctx, jx, jy, 0.78, 'soldier', sub.col, sub.trim) });
              }
            }
            props.sort((a, b) => a.y - b.y);
            for (const pr of props) pr.draw();
          };

          const subKey = `sub:${w.id}:${sIdx}:${sub.sid}:${sGateSide}:${Math.round(toHqX * 0.05)},${Math.round(toHqY * 0.05)}`;
          let subBase: CampBaseEntry | undefined;
          if (ren) {
            subBase = CAMP_BASE_CACHE.get(subKey);
            if (subBase) {
              CAMP_BASE_CACHE.delete(subKey);
              CAMP_BASE_CACHE.set(subKey, subBase);
            } else if (typeof document !== 'undefined') {
              const padX = 280, padY = 260;
              const ox = Math.ceil(srx + padX), oy = Math.ceil(sry + padY);
              const cw = Math.ceil((srx + padX) * 2), ch = Math.ceil((sry + padY) * 2);
              const cv = document.createElement('canvas');
              cv.width = cw; cv.height = ch;
              const bctx = cv.getContext('2d');
              if (bctx) {
                bctx.save();
                bctx.translate(ox, oy);
                drawSubBase(bctx);
                bctx.restore();
                subBase = { cv, ox, oy };
                CAMP_BASE_CACHE.set(subKey, subBase);
                if (CAMP_BASE_CACHE.size > MAX_CAMP_BASE_CACHE) {
                  const first = CAMP_BASE_CACHE.keys().next().value;
                  if (first !== undefined) CAMP_BASE_CACHE.delete(first);
                }
              }
            }
          }

          const subRef = subBase;
          const subTag = `${sub.sName}分营`;
          const subTagId = nextTagId++;
          campObsBoxes.push({ id: subTagId, x0: sub.x - srx * 0.65, y0: sub.y - sry * 0.65, x1: sub.x + srx * 0.65, y1: sub.y + sry * 0.55 });
          campTagReqs.push({
            id: subTagId,
            ax: sub.x,
            ay: sub.y,
            prefOffY: Math.max(sry * 0.55, 110),
            text: subTag,
            borderCol: sub.trim,
            isCommand: false,
            minW: 102,
          });
          out.push({
            y: sub.y + 30,
            k: 'D·宗门大营',
            draw: (ctx) => {
              ctx.save();
              if (subRef) {
                ctx.drawImage(subRef.cv, sub.x - subRef.ox, sub.y - subRef.oy);
                ctx.translate(sub.x, sub.y);
              } else {
                ctx.translate(sub.x, sub.y);
                drawSubBase(ctx);
              }
              const wave = Math.sin(t * 4.5 + (sub.x + si * 70) * 0.01) * 5;
              const sc = 1.42;
              ctx.fillStyle = sub.col;
              ctx.beginPath();
              ctx.moveTo(32 * sc, -120);
              ctx.lineTo(32 * sc + 44, -108 + wave);
              ctx.lineTo(32 * sc + 33, -95 + wave * 0.7);
              ctx.lineTo(32 * sc, -86);
              ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#fff5dc';
              ctx.font = 'bold 10px "Noto Serif SC", serif';
              ctx.textAlign = 'center';
              ctx.fillText(sub.sName.slice(0, 3), 32 * sc + 18, -100 + wave * 0.45);
              if (showDetailedProps) {
                for (let fi = 0; fi < 2; fi++) {
                  const fx0 = fi === 0 ? -56 : 56, fy0 = 42;
                  const fl = Math.sin(t * 11 + fi * 2.1 + si) * 3;
                  ctx.fillStyle = 'rgba(255,140,45,0.22)';
                  ctx.beginPath();
                  ctx.ellipse(fx0, fy0 + 2, 18, 8, 0, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.fillStyle = '#4a3220';
                  ctx.fillRect(fx0 - 7, fy0, 14, 3.5);
                  ctx.fillStyle = '#ff8a2a';
                  ctx.beginPath();
                  ctx.moveTo(fx0 - 5, fy0 + 1);
                  ctx.lineTo(fx0 + fl * 0.4, fy0 - 14 - fl * 0.5);
                  ctx.lineTo(fx0 + 5, fy0 + 1);
                  ctx.closePath();
                  ctx.fill();
                }
              }
              ctx.restore();
            },
          });

          // 分营守卫站岗（帅帐左右 + 营门两侧，稳立警戒，不绕内圈跑圈）
          const subSentries: [number, number, number, number][] = [
            [-46, 16, sGateSide, 0],
            [46, 16, sGateSide, 0],
            [sGateX - sGateSide * 16, -24, sGateSide, -0.2],
            [sGateX - sGateSide * 16, 24, sGateSide, 0.2],
          ];
          for (let gi = 0; gi < subSentries.length; gi++) {
            const [ox, oy, fx, fy] = subSentries[gi];
            const gx = sub.x + ox, gy = sub.y + oy;
            const frame = Math.floor(t * 1.5 + gi + si) & 1;
            const sgDir = facingFromVec(fx, fy);
            pushWorldDisciple(out, ren, gx, gy, 'D·营地弟子', sub.sid, gi % 6, sgDir.facing, frame, sgDir.flip, sub.custom, z);
          }
        }
      }
      if (z >= 0.045 && campTagReqs.length) {
        out.push({
          y: 9e8,
          k: 'D·营地名牌',
          draw: (ctx) => {
            drawCampTagsPass(host, ctx, z, campTagReqs, campObsBoxes);
          },
        });
      }
    }

    // 1b. 前线休整对峙哨位（双方拉大阵线间距，哨兵移动与脸部朝向严格一致，后方配有百人列阵方阵）
    for (const w of S.wars) {
      if (w.fall || w.phase !== 'battle') continue;
      if (!w.campaign && (!w.campA?.established || w.campA.soldiers <= 0 || !w.campB?.established || w.campB.soldiers <= 0)) continue;
      if (host.hasBattleForWar(w.id)) continue;
      if (host.skirmishes.some((sk) => sk.warId === w.id && sk.kind === 'front')) continue;
      const fp = host.frontPos(w);
      if (!fp || fp.map !== ACTIVE_MAP) continue;
      if (inCampView(fp.x, fp.y)) {
        const srcA = host.resolveFrontSource(w, 0, fp.x, fp.y, fp.map);
        const srcB = host.resolveFrontSource(w, 1, fp.x, fp.y, fp.map);
        if (srcA && srcB) {
          const ax = srcA.x - fp.x, ay = srcA.y - fp.y;
          const bx = srcB.x - fp.x, by = srcB.y - fp.y;
          const ad = Math.hypot(ax, ay) || 1, bd = Math.hypot(bx, by) || 1;
          const uxA = ax / ad, uyA = ay / ad, uxB = bx / bd, uyB = by / bd;
          const pA = { x: fp.x + uxA * 760, y: fp.y + uyA * 560 };
          const pB = { x: fp.x + uxB * 760, y: fp.y + uyB * 560 };
          const moA = host.dao(w.a) === 'mo', moB = host.dao(w.b) === 'mo';
          const standoffTxt = host.game.night > 0.72 ? '前线对峙 · 夜间巡防' : host.isFrontlineStandoff(w) ? '前线对峙 · 休兵整备' : '前线对峙 · 斥候警戒';
          const tagA = `${host.name(w.a)}前哨(${srcA.kind === 'camp' ? '大营' : srcA.kind === 'march' ? '援军' : '守军'})`;
          const tagB = `${host.name(w.b)}前哨(${srcB.kind === 'camp' ? '大营' : srcB.kind === 'march' ? '援军' : '守军'})`;
          for (const [sid, pos, fux, fuy] of [
            [w.a, pA, -uxA, -uyA],
            [w.b, pB, -uxB, -uyB],
          ] as const) {
            const custom = sid === MY ? host.my?.uniform : undefined;
            for (let k = 0; k < 4; k++) {
              const patVel = k >= 2 ? Math.cos(t * 0.85 + pos.x * 0.01 + k) * 44 : 0;
              const pat = k >= 2 ? Math.sin(t * 0.85 + pos.x * 0.01 + k) * 52 : 0;
              const gx = pos.x + (k - 1.5) * 38;
              const gy = pos.y + (k % 2 === 0 ? -24 : 20) + pat;
              // 巡逻哨兵严格按真实位移速度矢量定朝向，彻底杜绝侧向/斜向漂移
              const isMovingPatrol = k >= 2 && Math.abs(patVel) > 4;
              const vx = isMovingPatrol ? 0 : fux;
              const vy = isMovingPatrol ? patVel : fuy;
              const fDir = facingFromVec(vx, vy);
              const fr = k >= 2 ? (2 + (Math.floor(t * 5 + k) % 6)) : (Math.floor(t * 2 + k) & 1);
              pushWorldDisciple(out, ren, gx, gy, 'D·前线哨兵', sid, k, fDir.facing, fr, fDir.flip, custom, z);
            }
          }
          out.push({
            y: fp.y + 10,
            k: 'D·前线哨位',
            draw: (ctx) => {
              ctx.save();
              for (const [pos, ux, mo, tag] of [
                [pA, -uxA, moA, tagA],
                [pB, -uxB, moB, tagB],
              ] as const) {
                ctx.fillStyle = 'rgba(116,96,68,0.22)';
                ctx.beginPath(); ctx.ellipse(pos.x, pos.y + 8, 110, 62, 0, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#4c3420'; ctx.fillRect(pos.x - 2, pos.y - 82, 4, 84);
                ctx.fillStyle = mo ? '#b84252' : '#4a88b8';
                ctx.beginPath(); ctx.moveTo(pos.x + 2, pos.y - 82); ctx.lineTo(pos.x + (ux >= 0 ? 40 : -40), pos.y - 68); ctx.lineTo(pos.x + 2, pos.y - 54); ctx.closePath(); ctx.fill();
                if (showDetailedProps) {
                  const fl = Math.sin(t * 10 + pos.x) * 2.4;
                  ctx.fillStyle = 'rgba(255,140,45,0.2)'; ctx.beginPath(); ctx.ellipse(pos.x + 28, pos.y + 14, 18, 7, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(pos.x + 23, pos.y + 14); ctx.lineTo(pos.x + 28 + fl * 0.3, pos.y + 1 - fl * 0.4); ctx.lineTo(pos.x + 33, pos.y + 14); ctx.closePath(); ctx.fill();
                }
                if (z >= 0.09) {
                  ctx.font = '11px "Noto Serif SC", serif'; ctx.textAlign = 'center';
                  const tw = Math.max(88, ctx.measureText(tag).width + 14);
                  ctx.fillStyle = 'rgba(20,16,12,0.75)'; ctx.fillRect(pos.x - tw * 0.5, pos.y + 26, tw, 18);
                  ctx.fillStyle = '#f0e2c4';
                  ctx.fillText(tag, pos.x, pos.y + 39);
                }
              }
              if (z >= 0.08) {
                ctx.fillStyle = 'rgba(20,16,12,0.76)'; ctx.fillRect(fp.x - 82, fp.y - 12, 164, 21);
                ctx.fillStyle = '#e8d4a2'; ctx.font = '11px "Noto Serif SC", serif'; ctx.textAlign = 'center';
                ctx.fillText(standoffTxt, fp.x, fp.y + 2);
              }
              ctx.restore();
            },
          });
        }
      }

      // 大营 ↔ 前线对峙阵地往返换防/增援弟子队列（大营有守兵时持续可见御剑调防往来，形成完整前线闭环）
      for (const sIdx of [0, 1] as const) {
        const cmp = sIdx === 0 ? w.campA : w.campB;
        const cp = host.campPos(w, sIdx);
        const hasEnRoute = host.activeMarches().some((m) => m.warId === w.id && m.side === sIdx);
        if (!cmp || (cmp.soldiers <= 0 && !hasEnRoute) || !cp || cp.map !== ACTIVE_MAP) continue;
        const sid = sIdx === 0 ? w.a : w.b;
        const custom = sid === MY ? host.my?.uniform : undefined;
        const dxCF = fp.x - cp.x, dyCF = fp.y - cp.y;
        const distCF = Math.hypot(dxCF, dyCF);
        if (distCF < 400) continue;
        const uxCF = dxCF / distCF, uyCF = dyCF / distCF;
        const pxCF = -uyCF, pyCF = uxCF;
        const lineX = fp.x - uxCF * Math.min(1080, distCF * 0.45);
        const lineY = fp.y - uyCF * Math.min(1080, distCF * 0.45);
        const legLen = Math.max(280, Math.hypot(lineX - cp.x, lineY - cp.y));
        const shuttleSpd = 260;
        for (let q = 0; q < 2; q++) {
          const outbound = q === 0;
          const phase = ((t * shuttleSpd) / legLen + q * 0.47 + sIdx * 0.23 + w.id * 0.19) % 1;
          const sx0 = outbound ? cp.x : lineX, sy0 = outbound ? cp.y : lineY;
          const tx0 = outbound ? lineX : cp.x, ty0 = outbound ? lineY : cp.y;
          const arcOff = (outbound ? 1 : -1) * Math.sin(phase * Math.PI) * 95;
          const cx0 = sx0 + (tx0 - sx0) * phase + pxCF * arcOff;
          const cy0 = sy0 + (ty0 - sy0) * phase + pyCF * arcOff;
          if (!inMarchView(cx0, cy0)) continue;
          const dirX = (tx0 - sx0), dirY = (ty0 - sy0);
          const sDir = facingFromVec(dirX, dirY);
          const uDir = Math.hypot(dirX, dirY) || 1;
          const bUx = dirX / uDir, bUy = dirY / uDir;
          const squadN = clamp(Math.round(cmp.soldiers / 45), 3, 6);
          const shuttleUnits: DiscipleBatchUnit[] = [];
          for (let k = 0; k < squadN; k++) {
            const back = k * 34;
            const lat = ((k % 2) - 0.5) * 28;
            const dpx = cx0 - bUx * back + pxCF * lat;
            const dpy = cy0 - bUy * back + pyCF * lat * 0.78;
            const lift = 60 + (k % 2) * 8 + Math.sin(t * 3.5 + k) * 4;
            const frame = 8 + ((k + Math.floor(t * 2)) % 2);
            shuttleUnits.push({ x: dpx, y: dpy, lift, variant: (k + q * 2) % 6, facing: sDir.facing, frame, flipX: sDir.flip });
          }
          pushWorldDiscipleBatch(out, ren, shuttleUnits, 'D·行军弟子', sid, custom, z);
          if (z >= 0.10) {
            const shutTag = outbound ? `${host.name(sid)}·营→阵换防` : `${host.name(sid)}·阵→营轮休`;
            out.push({
              y: cy0 + 48,
              k: 'D·营阵调防',
              draw: (ctx) => {
                ctx.save();
                ctx.font = '10px "Noto Serif SC", serif';
                ctx.textAlign = 'center';
                const tw = Math.max(82, ctx.measureText(shutTag).width + 12);
                ctx.fillStyle = 'rgba(20,16,12,0.72)';
                ctx.fillRect(cx0 - tw * 0.5, cy0 - 78, tw, 17);
                ctx.fillStyle = outbound ? '#bce8ff' : '#e6d6b0';
                ctx.fillText(shutTag, cx0, cy0 - 66);
                ctx.restore();
              },
            });
          }
        }
      }
    }

    // 1c. 边界摩擦在途巡哨队（在开打前即可在视野中看见两队自各自据点/山门走来对峙）
    if (S.pendingBorders?.length) for (const pb of S.pendingBorders) {
      if (pb.map !== ACTIVE_MAP || pb.until < host.game.day) continue;
      if (host.skirmishes.some((sk) => sk.borderId === pb.id)) continue;
      const pT = clamp((host.game.day - (pb.createdDay ?? host.game.day)) / Math.max(0.05, (pb.arriveDay ?? host.game.day) - (pb.createdDay ?? host.game.day)), 0, 1);
      const ax0 = pb.fromAX ?? pb.x - 1600, ay0 = pb.fromAY ?? pb.y;
      const bx0 = pb.fromBX ?? pb.x + 1600, by0 = pb.fromBY ?? pb.y;
      const da = Math.hypot(ax0 - pb.x, ay0 - pb.y) || 1, db = Math.hypot(bx0 - pb.x, by0 - pb.y) || 1;
      const standDist = 480;
      const endAX = pb.x + ((ax0 - pb.x) / da) * standDist, endAY = pb.y + ((ay0 - pb.y) / da) * standDist;
      const endBX = pb.x + ((bx0 - pb.x) / db) * standDist, endBY = pb.y + ((by0 - pb.y) / db) * standDist;
      const curAX = ax0 + (endAX - ax0) * pT, curAY = ay0 + (endAY - ay0) * pT;
      const curBX = bx0 + (endBX - bx0) * pT, curBY = by0 + (endBY - by0) * pT;
      if (!inCampView(curAX, curAY) && !inCampView(curBX, curBY)) continue;
      const moA = host.dao(pb.a) === 'mo', moB = host.dao(pb.b) === 'mo';
      const lblA = `${host.name(pb.a)}·${pb.fromAName ?? '宗门'}巡哨(${pb.countA ?? 4}人)`;
      const lblB = `${host.name(pb.b)}·${pb.fromBName ?? '宗门'}巡哨(${pb.countB ?? 4}人)`;
      for (const [sid, px, py, cnt] of [
        [pb.a, curAX, curAY, pb.countA ?? 4],
        [pb.b, curBX, curBY, pb.countB ?? 4],
      ] as const) {
        if (!inCampView(px, py)) continue;
        const dx = pb.x - px, dy = pb.y - py;
        const pDir = facingFromVec(dx, dy);
        const custom = sid === MY ? host.my?.uniform : undefined;
        for (let k = 0; k < Math.min(4, cnt); k++) {
          const gx = px + ((k % 2) - 0.5) * 32;
          const gy = py + (Math.floor(k / 2) - 0.5) * 26;
          const fr = pT < 1 ? (2 + (Math.floor(t * 7 + k) % 6)) : (Math.floor(t * 2 + k) & 1);
          pushWorldDisciple(out, ren, gx, gy, 'D·巡哨弟子', sid, k, pDir.facing, fr, pDir.flip, custom, z);
        }
      }
      out.push({
        y: (curAY + curBY) * 0.5 + 18,
        k: 'D·边界巡哨',
        draw: (ctx) => {
          ctx.save();
          for (const [px, py, mo, lbl] of [
            [curAX, curAY, moA, lblA],
            [curBX, curBY, moB, lblB],
          ] as const) {
            if (!inCampView(px, py)) continue;
            const faceLeft = pb.x < px;
            ctx.fillStyle = mo ? '#b84252' : '#4a88b8';
            ctx.fillRect(px - 1, py - 72, 3, 46);
            ctx.beginPath(); ctx.moveTo(px + 2, py - 72); ctx.lineTo(px + (faceLeft ? -26 : 26), py - 63); ctx.lineTo(px + 2, py - 54); ctx.closePath(); ctx.fill();
            if (z >= 0.09) {
              ctx.font = '11px "Noto Serif SC", serif'; ctx.textAlign = 'center';
              const tw = Math.max(96, ctx.measureText(lbl).width + 14);
              ctx.fillStyle = 'rgba(20,16,12,0.8)'; ctx.fillRect(px - tw * 0.5, py - 94, tw, 18);
              ctx.fillStyle = '#f8ecd0'; ctx.fillText(lbl, px, py - 81);
            }
          }
          ctx.restore();
        },
      });
    }

    // 2. 在途行军遁光簇与一阶运丹灵舟（与战场战阵采用完全一致的缩放交叉淡入与合批渲染，绝不抽稀人数或突然变点消失）
    for (const mc of host.activeMarches()) {
      const pos = host.marchPos(mc);
      if (pos.map !== ACTIVE_MAP || !inMarchView(pos.x, pos.y)) continue;
      const isMo = host.dao(mc.sid) === 'mo';
      const custom = mc.sid === MY ? host.my?.uniform : undefined;
      const ux = Math.cos(pos.dir), uy = Math.sin(pos.dir);
      const pxv = -uy, pyv = ux;
      const marchDir = facingFromVec(ux, uy);
      const shipDir8 = airshipDirFromVec(ux, uy);
      const shipStyle: AirshipStyle = isMo ? 'mo' : 'zheng';
      const renderN = clamp(mc.soldiers, 1, 360);

      if (mc.kind === 'convoy' && mc.usesShip) {
        // 运丹车队（有在编一阶灵舟可用时）：一阶轻型运丹灵舟 + 伴飞护法（疏朗环绕灵舟）
        const escortN = clamp(Math.min(renderN, 12), 2, 12);
        const escortUnits: DiscipleBatchUnit[] = [];
        for (let i = 0; i < escortN; i++) {
          const ang = t * 0.55 + (i / escortN) * Math.PI * 2;
          const radX = 115 + (i % 3) * 34;
          const radY = 72 + (i % 3) * 20;
          const sx = pos.x + Math.cos(ang) * radX;
          const sy = pos.y + Math.sin(ang) * radY;
          if (sx < view.left - 140 || sx > view.right + 140 || sy < view.top - 140 || sy > view.bottom + 160) continue;
          const lift = 86 + Math.sin(t * 3.1 + i * 1.4) * 6;
          const frame = pos.mustering ? (Math.floor(t * 2 + i) & 1) : (2 + (Math.floor(t * 6.5 + i * 0.41) % 6));
          escortUnits.push({ x: sx, y: sy, lift, variant: i % 6, facing: marchDir.facing, frame, flipX: marchDir.flip });
        }
        pushWorldDiscipleBatch(out, ren, escortUnits, 'D·运丹护法', mc.sid, custom, z);
        out.push({
          y: pos.y + 92 * 4,
          k: 'D·运丹灵舟',
          draw: (ctx) => {
            drawAirshipEntity(
              ctx,
              pos.x,
              pos.y,
              138,
              shipDir8,
              t,
              {
                tier: 1,
                style: shipStyle,
                bannerText: host.name(mc.sid).slice(0, 1) || '宗',
                convoyCargo: true,
              },
              {
                angle: pos.dir,
                shieldRatio: 0.72,
                scale: 0.85,
              },
            );
          },
        });
      } else if (mc.kind === 'convoy') {
        // 无可用一阶飞舟时：退回陆路运丹车队（木质丹药货车 + 徒步护卫弟子，绝不凭空刷船）
        const escortN = clamp(Math.min(renderN, 10), 2, 10);
        const escortUnits: DiscipleBatchUnit[] = [];
        for (let i = 0; i < escortN; i++) {
          const ang = (i / escortN) * Math.PI * 2;
          const sx = pos.x + Math.cos(ang) * 74;
          const sy = pos.y + Math.sin(ang) * 44;
          if (sx < view.left - 120 || sx > view.right + 120 || sy < view.top - 120 || sy > view.bottom + 140) continue;
          const frame = pos.mustering ? (Math.floor(t * 2 + i) & 1) : (2 + (Math.floor(t * 6 + i * 0.5) % 6));
          escortUnits.push({ x: sx, y: sy, lift: 0, variant: i % 6, facing: marchDir.facing, frame, flipX: marchDir.flip });
        }
        pushWorldDiscipleBatch(out, ren, escortUnits, 'D·运丹护卫', mc.sid, custom, z);
        out.push({
          y: pos.y + 8,
          k: 'D·陆路运丹队',
          draw: (ctx) => {
            ctx.save();
            ctx.translate(pos.x, pos.y);
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.beginPath(); ctx.ellipse(0, 10, 32, 11, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#5e3c22';
            ctx.fillRect(-24, -12, 48, 18);
            ctx.fillStyle = '#7c5332';
            ctx.fillRect(-20, -22, 40, 12);
            ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 2;
            ctx.strokeRect(-24, -12, 48, 18);
            ctx.fillStyle = '#2d1c0e';
            for (const wx of [-14, 14]) { ctx.beginPath(); ctx.arc(wx, 8, 6, 0, Math.PI * 2); ctx.fill(); }
            ctx.restore();
          },
        });
      } else {
        // 部队行军改为：松散遁光集群（全员保留、Y 分带合批与连续交叉淡入，缩放不丢人、不闪烁）
        const marchUnits: DiscipleBatchUnit[] = [];
        for (let i = 0; i < renderN; i++) {
          const h1 = Math.sin((mc.id * 131 + i * 73) * 1.37) * 0.5 + 0.5;
          const h2 = Math.cos((mc.id * 97 + i * 47) * 2.13) * 0.5 + 0.5;
          const rankFrac = i / Math.max(1, renderN);
          const backDist = rankFrac * (110 + Math.sqrt(renderN) * 32) + (h1 - 0.5) * 44;
          const latSpread = (h2 - 0.5) * (95 + Math.sqrt(renderN) * 24) + Math.sin(t * 1.3 + i) * 6;
          const sx = pos.x - ux * backDist + pxv * latSpread;
          const sy = pos.y - uy * backDist + pyv * latSpread * 0.76;
          if (sx < view.left - 120 || sx > view.right + 120 || sy < view.top - 120 || sy > view.bottom + 140) continue;
          // 行军纵队离开山门集结圈后，全员御剑/遁光腾空赶路，不再徒步跑跨州郡
          const lift = !pos.mustering ? 64 + (i % 3) * 8 + Math.sin(t * 3.4 + i) * 5 : 0;
          const frame = pos.mustering ? (Math.floor(t * 1.8 + i) & 1) : (8 + ((i + Math.floor(t * 2.2)) % 2));
          marchUnits.push({ x: sx, y: sy, lift, variant: i % 6, facing: marchDir.facing, frame, flipX: marchDir.flip });
        }
        pushWorldDiscipleBatch(out, ren, marchUnits, 'D·行军弟子', mc.sid, custom, z);
        if (mc.airshipTier) {
          const shipLift = mc.airshipTier === 3 ? 196 : mc.airshipTier === 2 ? 168 : 142;
          const shipScale = mc.airshipTier === 3 ? 0.92 : mc.airshipTier === 2 ? 0.86 : 0.82;
          out.push({
            y: pos.y + shipLift * 4,
            k: 'D·行军战船',
            draw: (ctx) => {
              drawAirshipEntity(
                ctx, pos.x, pos.y, shipLift, shipDir8, t,
                { tier: mc.airshipTier!, style: shipStyle, bannerText: host.name(mc.sid).slice(0, 1) || '宗' },
                { angle: pos.dir, shieldRatio: 0.78, scale: shipScale },
              );
            },
          });
        }
      }
      const shipTagYOff = (mc.kind === 'convoy' && mc.usesShip) || mc.airshipTier ? -198 : -114;
      const marchModeTag = mc.isCampRelocate
        ? (mc.airshipTier ? `拔营迁址·${mc.airshipTier}阶战船` : '拔营迁址')
        : mc.fromHoldId
          ? (`${mc.fromLocName ?? '据点'}发兵` + (mc.airshipTier ? `·${mc.airshipTier}阶战船` : ''))
          : (mc.airshipTier ? `御剑行军·${mc.airshipTier}阶战船` : '御剑行军');
      out.push({
        y: pos.y + ((mc.kind === 'convoy' && mc.usesShip) || mc.airshipTier ? 380 : 12),
        k: 'D·地图行军',
        draw: (ctx) => {
          ctx.save();
          if (pos.mustering) {
            ctx.strokeStyle = isMo ? 'rgba(201,75,88,0.55)' : 'rgba(228,184,88,0.62)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y + 4, 110, 62, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else if (mc.kind !== 'convoy') {
            // 遁光长尾流痕（替代尘土脚印）
            for (let k = 1; k <= 5; k++) {
              const ox = pos.x - ux * k * 46;
              const oy = pos.y - uy * k * 46 - 14;
              ctx.fillStyle = isMo ? `rgba(218,78,96,${0.22 - k * 0.035})` : `rgba(118,214,255,${0.22 - k * 0.035})`;
              ctx.beginPath();
              ctx.ellipse(ox, oy, 26 - k * 3.5, 9 - k * 1.2, pos.dir, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (mc.escorted) {
            ctx.strokeStyle = 'rgba(255,220,108,0.75)';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y + 4, 72, 38, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
          const tagYOff = shipTagYOff;
          const statusTag = pos.mustering
            ? `${mc.fromHoldId ? mc.fromLocName : '山门'}集结(${Math.ceil(pos.musterRem)}s)`
            : mc.escorted
              ? (mc.inRaid ? '护送遇伏!' : `护送中 ${Math.round(pos.progress * 100)}%`)
              : (mc.kind === 'convoy' ? (mc.usesShip ? '运丹灵舟' : '陆路运丹队') : marchModeTag);
          const labelTxt = `${host.name(mc.sid)}·${statusTag} ${mc.soldiers}人`;
          ctx.font = 'bold 12px "Noto Serif SC", serif';
          ctx.textAlign = 'center';
          const lw = Math.max(136, ctx.measureText(labelTxt).width + 20);
          ctx.fillStyle = 'rgba(20,16,12,0.84)';
          ctx.fillRect(pos.x - lw * 0.5, pos.y + tagYOff, lw, 22);
          ctx.strokeStyle = mc.escorted ? 'rgba(255,220,108,0.92)' : isMo ? 'rgba(216,96,112,0.8)' : 'rgba(228,184,88,0.8)';
          ctx.lineWidth = mc.escorted ? 1.5 : 1;
          ctx.strokeRect(pos.x - lw * 0.5, pos.y + tagYOff, lw, 22);
          ctx.fillStyle = mc.escorted ? '#ffe69a' : '#f8ecd0';
          ctx.fillText(labelTxt, pos.x, pos.y + tagYOff + 16);
          ctx.restore();
        },
      });
    }
  }

  /** 统一远近景营地名牌绘制与全局防重叠（避让其他名牌及所有总营/分营图标本体，杜绝缩放变脸与互相遮挡） */
function drawCampTagsPass(
  host: SectWarRenderHost,
    ctx: CanvasRenderingContext2D,
    z: number,
    reqs: {
      id: number;
      ax: number;
      ay: number;
      prefOffY: number;
      text: string;
      borderCol: string;
      isCommand: boolean;
      minW: number;
    }[],
    obsBoxes: { id: number; x0: number; y0: number; x1: number; y1: number }[],
  ) {
    if (!reqs.length) return;
    const k = z < 0.22 ? 1 / Math.max(0.025, z) : 1;
    const sorted = [...reqs].sort((a, b) => (a.isCommand === b.isCommand ? 0 : a.isCommand ? -1 : 1));
    const placed: [number, number, number, number][] = [];
    const padBox = 4 * k;

    const hitsAny = (id: number, x0: number, y0: number, x1: number, y1: number) => {
      for (const [px0, py0, px1, py1] of placed) {
        if (!(x1 < px0 || x0 > px1 || y1 < py0 || y0 > py1)) return true;
      }
      for (const ob of obsBoxes) {
        if (ob.id === id) continue;
        if (!(x1 < ob.x0 || x0 > ob.x1 || y1 < ob.y0 || y0 > ob.y1)) return true;
      }
      return false;
    };

    for (const req of sorted) {
      ctx.save();
      const fontPx = Math.round((req.isCommand ? 12 : 11) * k);
      ctx.font = `${req.isCommand ? 'bold ' : ''}${fontPx}px "Noto Serif SC", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = typeof ctx.measureText === 'function' ? ctx.measureText(req.text).width : req.text.length * fontPx * 0.9;
      const bw = Math.max(req.minW * k, tw + 20 * k);
      const bh = (req.isCommand ? 22 : 20) * k;

      const d0 = req.prefOffY;
      const candidates: [number, number][] = [
        [0, d0],
        [0, -d0],
        [bw * 0.56 + 18 * k, 0],
        [-(bw * 0.56 + 18 * k), 0],
        [bw * 0.48, d0 + bh * 0.65],
        [-bw * 0.48, d0 + bh * 0.65],
        [bw * 0.48, -d0 - bh * 0.65],
        [-bw * 0.48, -d0 - bh * 0.65],
        [0, d0 + bh * 1.25],
        [0, -d0 - bh * 1.25],
        [bw * 0.72, d0 + bh * 1.35],
        [-bw * 0.72, d0 + bh * 1.35],
        [0, d0 + bh * 2.5],
        [0, -d0 - bh * 2.5],
      ];

      let cx = req.ax;
      let cy = req.ay + d0;
      let chosen = false;
      for (const [ox, oy] of candidates) {
        const tx = req.ax + ox;
        const ty = req.ay + oy;
        const x0 = tx - bw * 0.5 - padBox;
        const x1 = tx + bw * 0.5 + padBox;
        const y0 = ty - bh * 0.5 - padBox;
        const y1 = ty + bh * 0.5 + padBox;
        if (!hitsAny(req.id, x0, y0, x1, y1)) {
          cx = tx;
          cy = ty;
          placed.push([x0, y0, x1, y1]);
          chosen = true;
          break;
        }
      }
      if (!chosen) {
        // 密集群营扩展网格搜索：优先兼顾避开其他图标与名牌，若仍受限则保证名牌之间绝对不压字
        outer: for (let ring = 1; ring <= 10; ring++) {
          for (const [mx, my] of [
            [0, ring], [0, -ring], [ring, 0], [-ring, 0],
            [ring * 0.7, ring * 0.7], [-ring * 0.7, ring * 0.7],
            [ring * 0.7, -ring * 0.7], [-ring * 0.7, -ring * 0.7],
          ]) {
            const tx = req.ax + mx * (bw * 0.45 + 10 * k);
            const ty = req.ay + d0 + my * (bh + 8 * k);
            const x0 = tx - bw * 0.5 - padBox;
            const x1 = tx + bw * 0.5 + padBox;
            const y0 = ty - bh * 0.5 - padBox;
            const y1 = ty + bh * 0.5 + padBox;
            if (!hitsAny(req.id, x0, y0, x1, y1)) {
              cx = tx; cy = ty;
              placed.push([x0, y0, x1, y1]);
              chosen = true;
              break outer;
            }
          }
        }
      }
      if (!chosen) {
        for (let step = 1; step <= 24; step++) {
          const ty = req.ay + d0 + (step % 2 === 1 ? 1 : -1) * Math.ceil(step / 2) * (bh + 10 * k);
          const x0 = req.ax - bw * 0.5 - padBox;
          const x1 = req.ax + bw * 0.5 + padBox;
          const y0 = ty - bh * 0.5 - padBox;
          const y1 = ty + bh * 0.5 + padBox;
          if (!placed.some(([px0, py0, px1, py1]) => !(x1 < px0 || x0 > px1 || y1 < py0 || y0 > py1))) {
            cx = req.ax;
            cy = ty;
            placed.push([x0, y0, x1, y1]);
            break;
          }
        }
      }

      if (Math.hypot(cx - req.ax, cy - (req.ay + d0)) > bh * 0.9) {
        ctx.strokeStyle = req.borderCol;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.0 * k;
        ctx.beginPath();
        ctx.moveTo(req.ax, req.ay);
        ctx.lineTo(cx, cy);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = req.isCommand ? 'rgba(26,20,13,0.9)' : 'rgba(20,16,12,0.86)';
      ctx.fillRect(cx - bw * 0.5, cy - bh * 0.5, bw, bh);
      ctx.strokeStyle = req.borderCol;
      ctx.lineWidth = (req.isCommand ? 1.4 : 1.1) * k;
      ctx.strokeRect(cx - bw * 0.5, cy - bh * 0.5, bw, bh);
      ctx.fillStyle = req.isCommand ? '#ffeaa8' : '#f8ecd0';
      ctx.fillText(req.text, cx, cy + 0.5 * k);
      ctx.restore();
    }
  }

  /** 远景缩略视角（z < 0.045 沙盘模式）：每个同盟严格仅 1 座中心总营，周围独立环绕各宗门分营，并在缩放到位时与近景沿用完全统一的营地名牌 */
export function collectSectWarFarWorld(host: SectWarRenderHost, ctx: CanvasRenderingContext2D, view: { left: number; top: number; right: number; bottom: number }, z: number) {
    const pad = 2600;
    const inv = 1 / Math.max(0.008, z);
    const clusters = buildAllianceCampClusters(host, ACTIVE_MAP);

    const drawnFrontBars = new Set<string>();
    const farTagReqs: {
      id: number; ax: number; ay: number; prefOffY: number; text: string; borderCol: string; isCommand: boolean; minW: number;
    }[] = [];
    const farObsBoxes: { id: number; x0: number; y0: number; x1: number; y1: number }[] = [];
    let nextFarTagId = 1;

    const drawTentIcon = (x: number, y: number, r: number, strokeCol: string, isCommand: boolean) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = isCommand ? 'rgba(26,20,14,0.92)' : 'rgba(22,18,14,0.84)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isCommand ? '#f2cf78' : strokeCol;
      ctx.lineWidth = (isCommand ? 2.2 : 1.4) * inv;
      ctx.stroke();
      if (isCommand) {
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 1.1 * inv;
        ctx.beginPath();
        ctx.arc(0, 0, r + 3.2 * inv, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = isCommand ? '#fff2cf' : '#ede0c2';
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.56);
      ctx.lineTo(r * 0.58, r * 0.42);
      ctx.lineTo(-r * 0.58, r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = strokeCol;
      ctx.fillRect(-r * 0.08, -r * 0.86, r * 0.14, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(r * 0.06, -r * 0.86);
      ctx.lineTo(r * 0.58, -r * 0.72);
      ctx.lineTo(r * 0.06, -r * 0.58);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    for (const cl of clusters) {
      const { lead, memberSects, isCoalition, sideTitle, isMo, col, trimCol, lv, totalSoldiers, subCamps } = cl;
      const cp = lead.cp;
      const cmpFar = lead.sIdx === 0 ? lead.w.campA : lead.w.campB;
      const estFar = cmpFar?.established ?? ((cmpFar?.build ?? 1) >= 0.15);

      // 1) 超远景全图摘要仅保留各交战前线短界标（不绘制横贯场景的虚线进攻线）
      for (const n of cl.nodes) {
        if (!n.fp || host.hasBattleForWar(n.w.id) || drawnFrontBars.has(n.w.tgt)) continue;
        drawnFrontBars.add(n.w.tgt);
        ctx.save();
        const angBar = Math.atan2(n.fp.y - n.cp.y, n.fp.x - n.cp.x) + Math.PI * 0.5;
        const span = 520;
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = n.w.tgt === host.def(n.w) ? '#f05a46' : '#f2c15a';
        ctx.lineWidth = 2.8 * inv;
        ctx.beginPath();
        ctx.moveTo(n.fp.x - Math.cos(angBar) * span, n.fp.y - Math.sin(angBar) * span);
        ctx.lineTo(n.fp.x + Math.cos(angBar) * span, n.fp.y + Math.sin(angBar) * span);
        ctx.stroke();
        ctx.restore();
      }

      const inView = cp.x >= view.left - pad && cp.x <= view.right + pad && cp.y >= view.top - pad && cp.y <= view.bottom + pad;
      const anySubInView = subCamps.some((sc) => sc.x >= view.left - pad && sc.x <= view.right + pad && sc.y >= view.top - pad && sc.y <= view.bottom + pad);
      if (!inView && !anySubInView) continue;

      const badgeR = (isCoalition ? 16 : 13.5) * inv;
      const subR = 9.5 * inv;

      // 2) 总营通往各宗门分营的统御联络线（实线，无虚线）
      if (estFar && isCoalition && subCamps.length) {
        ctx.save();
        ctx.strokeStyle = isMo ? 'rgba(224,107,122,0.48)' : 'rgba(126,196,244,0.48)';
        ctx.lineWidth = 1.6 * inv;
        for (const sc of subCamps) {
          ctx.beginPath();
          ctx.moveTo(cp.x, cp.y);
          ctx.lineTo(sc.x, sc.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3) 周围独立分营（每个宗门独立一座营盘与徽记，绝不揉成一团）
      if (estFar) for (const sc of subCamps) {
        if (sc.x < view.left - pad || sc.x > view.right + pad || sc.y < view.top - pad || sc.y > view.bottom + pad) continue;
        const subCol = sectColor(host, sc.sid).stroke;
        ctx.save();
        ctx.fillStyle = isMo ? 'rgba(150,48,60,0.16)' : 'rgba(65,125,180,0.16)';
        ctx.beginPath();
        ctx.ellipse(sc.x, sc.y, Math.max(250, 14 * inv), Math.max(165, 10 * inv), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = subCol;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.2 * inv;
        ctx.stroke();
        ctx.restore();

        drawTentIcon(sc.x, sc.y, subR, subCol, false);
        const subId = nextFarTagId++;
        farObsBoxes.push({ id: subId, x0: sc.x - subR * 1.2, y0: sc.y - subR * 1.2, x1: sc.x + subR * 1.2, y1: sc.y + subR * 1.2 });
        farTagReqs.push({
          id: subId,
          ax: sc.x,
          ay: sc.y,
          prefOffY: subR + 14 * inv,
          text: `${sc.sName}分营`,
          borderCol: sc.trim,
          isCommand: false,
          minW: 102,
        });
      }

      // 4) 中心总营（同盟唯一总帅营）
      if (inView) {
        ctx.save();
        ctx.fillStyle = isMo ? 'rgba(165,52,66,0.22)' : 'rgba(70,136,196,0.22)';
        ctx.beginPath();
        ctx.ellipse(cp.x, cp.y, Math.max(520, 22 * inv), Math.max(330, 15 * inv), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isCoalition ? '#f2cf78' : col;
        ctx.globalAlpha = 0.72;
        ctx.lineWidth = 1.8 * inv;
        ctx.stroke();
        ctx.restore();

        drawTentIcon(cp.x, cp.y, badgeR, isMo ? '#e06b7a' : '#7ec4f4', isCoalition);
        const hqId = nextFarTagId++;
        farObsBoxes.push({ id: hqId, x0: cp.x - badgeR * 1.25, y0: cp.y - badgeR * 1.25, x1: cp.x + badgeR * 1.25, y1: cp.y + badgeR * 1.25 });
        const label = !estFar
          ? `${sideTitle}${isCoalition ? '集结总点' : '集结点'}(待先遣立营)`
          : isCoalition
            ? `${sideTitle}总营(${memberSects.length}宗) · Lv${lv} · ${totalSoldiers}人`
            : `${sideTitle}大营 · Lv${lv} · ${totalSoldiers}人`;
        farTagReqs.push({
          id: hqId,
          ax: cp.x,
          ay: cp.y,
          prefOffY: badgeR + 16 * inv,
          text: label,
          borderCol: isCoalition ? '#f2cf78' : trimCol,
          isCommand: true,
          minW: 136,
        });
      }
    }
    drawCampTagsPass(host, ctx, z, farTagReqs, farObsBoxes);
    // 5) 在途行军纵队 / 运丹车队远景动态点（不画虚线路线）
    for (const mc of host.activeMarches()) {
      const pos = host.marchPos(mc);
      if (pos.map !== ACTIVE_MAP) continue;
      if (pos.x < view.left - pad || pos.x > view.right + pad || pos.y < view.top - pad || pos.y > view.bottom + pad) continue;
      ctx.save();
      ctx.fillStyle = mc.kind === 'convoy' ? '#7fd0ff' : '#ffd27a';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 7.5 * inv, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d1610';
      ctx.lineWidth = 1.5 * inv;
      ctx.stroke();
      ctx.restore();
    }
  }


export function sectColor(host: SectWarRenderHost, sid: string): { stroke: string; fillRgb: string } {
    if (sid === MY) return { stroke: '#d89624', fillRgb: '216,150,36' };
    let h = 2166136261;
    for (let i = 0; i < sid.length; i++) { h ^= sid.charCodeAt(i); h = Math.imul(h, 16777619); }
    const u = ((h >>> 0) % 1000) / 1000;
    const d = host.dao(sid);
    let hue: number, sat: number, lit: number;
    if (d === 'mo') {
      hue = (335 + u * 52) % 360; // 绛紫 ~ 暗红 ~ 朱砂
      sat = 64; lit = 48;
    } else if (d === 'fo') {
      hue = 36 + u * 16; // 禅金 ~ 古赭
      sat = 72; lit = 48;
    } else if (d === 'yao') {
      hue = 92 + u * 34; // 苍青 ~ 苔绿
      sat = 54; lit = 42;
    } else if (d === 'zhong') {
      hue = 250 + u * 44; // 青莲 ~ 靛紫
      sat = 52; lit = 48;
    } else {
      hue = 165 + u * 62; // 松青 ~ 碧翠 ~ 湛蓝
      sat = 58; lit = 44;
    }
    const hsl2rgb = (H: number, S: number, L: number): [number, number, number] => {
      const s = S / 100, l = L / 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
      const m = l - c / 2;
      const [r1, g1, b1] = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x] : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x];
      return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
    };
    const [r, g, b] = hsl2rgb(hue, sat, lit);
    return {
      stroke: `rgb(${r},${g},${b})`,
      fillRgb: `${r},${g},${b}`,
    };
  }

  /** 全图各宗门势力范围（山门核心 + 麾下据点 + 分宗疆域），供给大地图渲染清晰版图 */
export function sectTerritories(host: SectWarRenderHost, map: string = ACTIVE_MAP): Array<{
    sid: string;
    name: string;
    dao: Dao;
    stroke: string;
    fillRgb: string;
    isMine: boolean;
    gate: { x: number; y: number } | null;
    nodes: Array<{ id: string; name: string; x: number; y: number; r: number; kind: 'gate' | 'hold' | 'branch'; isolated: boolean; g: number }>;
  }> {
    const targetMap = normalizeWorldMapId(map);
    host.initHolds();
    const gone = host.S.gone ?? {};
    const out: SectTerritory[] = [];
    for (const sid of host.sects(targetMap)) {
      if (gone[sid]) continue;
      const gl = LOC_BY_ID.get(sid);
      const col = sectColor(host, sid);
      const sc = host.scale(sid);
      const gateR = sc === 'da' ? 42 : sc === 'zhong' ? 33 : 25;
      const nodes: Array<{ id: string; name: string; x: number; y: number; r: number; kind: 'gate' | 'hold' | 'branch'; isolated: boolean; g: number }> = [];
      if (gl && gl.map === targetMap) {
        nodes.push({ id: sid, name: host.name(sid), x: gl.x, y: gl.y, r: gateR, kind: 'gate', isolated: false, g: host.combatTotal(sid) });
      }
      for (const hid of host.holdsOf(sid)) {
        const hl = LOC_BY_ID.get(hid);
        const h = host.S.hold[hid];
        if (!hl || !h || hl.map !== targetMap) continue;
        nodes.push({ id: hid, name: hl.name, x: hl.x, y: hl.y, r: hl.type === 'city' ? 28 : 22, kind: 'hold', isolated: !!h.isolated, g: h.g });
      }
      if (sid === MY) {
        for (const bid of host.S.branch ?? []) {
          const bl = LOC_BY_ID.get(bid);
          if (!bl || bl.map !== targetMap) continue;
          nodes.push({ id: bid, name: bl.name, x: bl.x, y: bl.y, r: 28, kind: 'branch', isolated: false, g: BRANCH[host.scale(bid)] });
        }
      }
      if (nodes.length) {
        out.push({
          sid,
          name: host.name(sid),
          dao: host.dao(sid),
          stroke: col.stroke,
          fillRgb: col.fillRgb,
          isMine: sid === MY || sid === host.game.ws.sect?.id,
          gate: gl && gl.map === targetMap ? { x: gl.x, y: gl.y } : null,
          nodes,
        });
      }
    }
    return out;
  }

  /** 各据点（及已并入本宗的分宗山门）归属与守军信息（供给大地图显示全图势力控制区） */
export function holdBadges(host: SectWarRenderHost, map: string = ACTIVE_MAP): Array<{
    id: string;
    x: number; y: number;
    owner: string;
    ownerName: string;
    g: number;
    col: string;
    isolated: boolean;
    isBranch?: boolean;
  }> {
    const targetMap = normalizeWorldMapId(map);
    const out: Array<{ id: string; x: number; y: number; owner: string; ownerName: string; g: number; col: string; isolated: boolean; isBranch?: boolean }> = [];
    for (const [id, h] of Object.entries(host.S.hold)) {
      const l = LOC_BY_ID.get(id);
      if (!l || l.map !== targetMap) continue;
      if (l.id === h.o) continue; // 山门自身已有宗门大印
      const col = sectColor(host, h.o).stroke;
      out.push({
        id,
        x: l.x * WORLD_SCALE,
        y: l.y * WORLD_SCALE,
        owner: h.o,
        ownerName: host.name(h.o),
        g: h.g,
        col,
        isolated: !!h.isolated,
      });
    }
    for (const id of host.S.branch ?? []) {
      const l = LOC_BY_ID.get(id);
      if (!l || l.map !== targetMap) continue;
      out.push({
        id,
        x: l.x * WORLD_SCALE,
        y: l.y * WORLD_SCALE,
        owner: MY,
        ownerName: `${host.name(MY)}分宗`,
        g: BRANCH[host.scale(id)],
        col: sectColor(host, MY).stroke,
        isolated: false,
        isBranch: true,
      });
    }
    return out;
  }

  /** M 地图战线数据：供给大地图展示「山门 → 大营 → 阵线推进 → 在途行军 → 兵力战损总览」 */
export function frontLines(host: SectWarRenderHost): Array<{
    warId: number;
    map: string;
    a: string; b: string;
    nameA: string; nameB: string;
    attSide: 0 | 1;
    tgtId: string;
    tgtName: string;
    score: number;
    wave: number;
    phase: 'prep' | 'battle';
    la: number; lb: number;
    campASoldiers: number; campAPills: number; campALv: number;
    campBSoldiers: number; campBPills: number; campBLv: number;
    holdsA: number; holdsB: number;
    marchesActive: number;
    stageLabel: string;
    trail: { x: number; y: number; name: string }[];
    ax: number; ay: number;
    bx: number; by: number;
    campAX: number; campAY: number;
    campBX: number; campBY: number;
    fx: number; fy: number;
    colA: string; colB: string;
    label: string;
    activeBattle: boolean;
    siege: boolean;
  }> {
    const out: SectFrontLine[] = [];
    for (const w of host.S.wars) {
      const fp = host.frontPos(w);
      if (!fp) continue;
      const LA = LOC_BY_ID.get(w.a), LB = LOC_BY_ID.get(w.b);
      const ax = LA ? LA.x * WORLD_SCALE : fp.x - 1800;
      const ay = LA ? LA.y * WORLD_SCALE : fp.y;
      const bx = LB ? LB.x * WORLD_SCALE : fp.x + 1800;
      const by = LB ? LB.y * WORLD_SCALE : fp.y;
      const cA = host.campPos(w, 0);
      const cB = host.campPos(w, 1);
      const colA = host.dao(w.a) === 'mo' ? '#d95b68' : '#58a8e6';
      const colB = host.dao(w.b) === 'mo' ? '#d95b68' : '#58a8e6';
      const siege = w.tgt === host.def(w);
      const phase = w.phase ?? 'battle';
      const standoff = host.isFrontlineStandoff(w);
      const stageLabel = w.fall
        ? '胜负已分·待发落'
        : phase === 'prep'
        ? '集结筑营中'
        : siege
        ? (standoff ? '兵临山门·对峙休整' : host.zhenHp(host.def(w)) > 0 ? '兵临山门·破阵中' : '山门灭宗决战')
        : standoff
        ? `争夺「${host.tgtName(w)}」·对峙休整`
        : `争夺「${host.tgtName(w)}」·第 ${w.wave + 1} 阵`;
      out.push({
        warId: w.id,
        map: fp.map,
        a: w.a, b: w.b,
        nameA: host.sideName(w, 0),
        nameB: host.sideName(w, 1),
        attSide: w.ini,
        tgtId: w.tgt,
        tgtName: host.tgtName(w),
        score: Math.round(w.score),
        wave: w.wave,
        phase,
        la: w.la, lb: w.lb,
        campASoldiers: w.campA?.soldiers ?? 0,
        campAPills: Math.round(w.campA?.pills ?? 0),
        campALv: w.campA ? host.campLevel(w.campA) : 1,
        campBSoldiers: w.campB?.soldiers ?? 0,
        campBPills: Math.round(w.campB?.pills ?? 0),
        campBLv: w.campB ? host.campLevel(w.campB) : 1,
        holdsA: host.holdsOf(w.a).length,
        holdsB: host.holdsOf(w.b).length,
        marchesActive: host.activeMarches().filter((m) => m.warId === w.id).length,
        stageLabel,
        trail: w.frontTrail ?? [],
        ax, ay, bx, by,
        campAX: cA?.x ?? (ax + fp.x) * 0.5,
        campAY: cA?.y ?? (ay + fp.y) * 0.5,
        campBX: cB?.x ?? (bx + fp.x) * 0.5,
        campBY: cB?.y ?? (by + fp.y) * 0.5,
        fx: fp.x, fy: fp.y,
        colA, colB,
        label: `${host.name(w.a)} ⚔ ${host.name(w.b)}`,
        activeBattle: host.hasBattleForWar(w.id),
        siege,
      });
    }
    return out;
  }
