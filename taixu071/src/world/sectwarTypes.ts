import type { Enemy } from './combat';
import type { MySect } from './mysect';
import type { CustomSectUniform } from '../gfx/sectUniform';
import { getShadowSprite, getDotSprite } from '../gfx/charAtlas';
import { MY_SECT_ID, X_BY_ID, sectDao, type Dao, type Scale } from '../data/sects';
import type { Drawable } from './life';
import type { SectSupply, SectFleet } from './worldstate';
import {
  type FormPattern,
  type WarFormation,
  type BattleOrder,
  sectDiscipleFrameSpr,
  sectDiscipleSheet,
  discipleLodParams,
  formationTintRgb,
  type DiscipleFacing,
  SHEET_W,
  SHEET_H,
} from './warformation';
import type { WarAirship } from './warairship';
import type { AirshipTier } from '../gfx/airship';

export interface CampBaseEntry {
  cv: HTMLCanvasElement;
  ox: number;
  oy: number;
}
export const CAMP_BASE_CACHE = new Map<string, CampBaseEntry>();
export const MAX_CAMP_BASE_CACHE = 24;

export type DiscipleBatchUnit = {
  x: number;
  y: number;
  lift: number;
  variant: number;
  facing: DiscipleFacing;
  frame: number;
  flipX: boolean;
};

export function pushWorldDisciple(
  out: Drawable[],
  ren: {
    pushAtlasSpr?: (...args: any[]) => boolean;
    warmAtlasSpr?: (spr: { canvas: HTMLCanvasElement; w: number; h: number }, key: string) => boolean;
    dpr?: number;
  } | undefined,
  x: number,
  y: number,
  k: string,
  sid: string,
  variant: number,
  facing: DiscipleFacing,
  frame: number,
  flipX: boolean,
  customUniform?: Parameters<typeof sectDiscipleFrameSpr>[3],
  z = 1,
  lift = 0,
  ours?: boolean,
) {
  const isMo = sectDao(sid) === 'mo';
  const isOurs = ours ?? (sid === MY || !isMo);
  const dpr = ren?.dpr ?? 1;
  const { spriteFade, dotFade, dotScale, dotRad, wantShadow } = discipleLodParams(z, dpr);
  const tint = formationTintRgb(sid, isOurs, customUniform);
  let usedVar = variant;
  let spr = spriteFade > 0.02 ? sectDiscipleFrameSpr(sid, undefined, usedVar, customUniform, facing, frame) : null;
  if (!spr && spriteFade > 0.02 && usedVar !== 0) {
    usedVar = 0;
    spr = sectDiscipleFrameSpr(sid, undefined, 0, customUniform, facing, frame);
  }
  const shadow = wantShadow && spriteFade > 0.02 ? getShadowSprite() : null;
  const dotSpr = getDotSprite();
  const swR = isMo ? 0.96 : 0.45, swG = isMo ? 0.36 : 0.85, swB = isMo ? 0.44 : 1.0;
  const sortY = lift > 0 ? y + lift * 2 : y;

  out.push({
    y: sortY,
    k,
    gl: ren?.pushAtlasSpr
      ? (batch, occA) => {
          let useSpr = spr;
          if (useSpr && spriteFade > 0.02 && ren.warmAtlasSpr && !ren.warmAtlasSpr(useSpr, useSpr.key)) {
            const fb1 = sectDiscipleFrameSpr(sid, undefined, 0, customUniform, facing, 0);
            const fb2 = sectDiscipleFrameSpr(sid, undefined, 0, customUniform, 'front', 0);
            if (fb1 && ren.warmAtlasSpr(fb1, fb1.key)) useSpr = fb1;
            else if (fb2 && ren.warmAtlasSpr(fb2, fb2.key)) useSpr = fb2;
            else return false;
          }
          let ok = true;
          const effectiveDotFade = useSpr ? dotFade : Math.max(dotFade, 0.72);
          if (effectiveDotFade > 0.02) {
            if (!ren.pushAtlasSpr!(batch, dotSpr, x, y - lift - 6, dotScale, dotScale, false, occA * effectiveDotFade, 'P2:dot8', tint.r, tint.g, tint.b, false)) ok = false;
          }
          if (useSpr && spriteFade > 0.02) {
            if (shadow && !ren.pushAtlasSpr!(batch, shadow, x, y + 2, 1.0, 1.0, false, occA * spriteFade, 'P2:shadow32', 1, 1, 1, false)) ok = false;
            if (lift > 0 && !ren.pushAtlasSpr!(batch, dotSpr, x, y - lift + 3, 2.2, 0.32, false, occA * 0.85 * spriteFade, 'P2:dot8', swR, swG, swB, false)) ok = false;
            if (!ren.pushAtlasSpr!(batch, useSpr, x, y - lift, 1, 1, flipX, occA * spriteFade, useSpr.key, 1, 1, 1, false)) ok = false;
          }
          return ok;
        }
      : undefined,
    draw: (ctx) => {
      const sheet = spriteFade > 0.02 ? sectDiscipleSheet(sid, undefined, usedVar, customUniform, facing) : null;
      const effectiveDotFade = sheet ? dotFade : Math.max(dotFade, 0.72);
      if (effectiveDotFade > 0.02) {
        ctx.save();
        ctx.globalAlpha *= effectiveDotFade;
        ctx.fillStyle = tint.css;
        ctx.beginPath();
        ctx.arc(x, y - lift - 6, dotRad, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (sheet && spriteFade > 0.02) {
        ctx.save();
        ctx.globalAlpha *= spriteFade;
        if (wantShadow) {
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath();
          ctx.ellipse(x, y + 3, lift > 0 ? 10 : 13, lift > 0 ? 4 : 5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (lift > 0) {
          ctx.fillStyle = isMo ? 'rgba(218,78,96,0.28)' : 'rgba(116,214,255,0.3)';
          ctx.beginPath();
          ctx.ellipse(x, y - lift + 3, 18, 5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = isMo ? '#ff8a98' : '#bceeff';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(x - 16, y - lift + 3);
          ctx.lineTo(x + 16, y - lift + 3);
          ctx.stroke();
        }
        ctx.translate(x, y - lift);
        if (flipX) ctx.scale(-1, 1);
        ctx.drawImage(sheet, frame * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.85, SHEET_W, SHEET_H);
        ctx.restore();
      }
    },
  });
  return true;
}

/** 行动/行军纵队合批渲染：与战场战阵采用完全一致的连续交叉淡入（screenH [7.5,16]）与 Y 分带合批 */
export function pushWorldDiscipleBatch(
  out: Drawable[],
  ren: {
    pushAtlasSpr?: (...args: any[]) => boolean;
    warmAtlasSpr?: (spr: { canvas: HTMLCanvasElement; w: number; h: number }, key: string) => boolean;
    dpr?: number;
  } | undefined,
  units: DiscipleBatchUnit[],
  k: string,
  sid: string,
  customUniform?: Parameters<typeof sectDiscipleFrameSpr>[3],
  z = 1,
  ours?: boolean,
) {
  if (!units.length) return;
  const isMo = sectDao(sid) === 'mo';
  const isOurs = ours ?? (sid === MY || !isMo);
  const dpr = ren?.dpr ?? 1;
  const { spriteFade, dotFade, dotScale, dotRad, wantShadow } = discipleLodParams(z, dpr);
  const tint = formationTintRgb(sid, isOurs, customUniform);
  const swR = isMo ? 0.96 : 0.45, swG = isMo ? 0.36 : 0.85, swB = isMo ? 0.44 : 1.0;

  units.sort((a, b) => (a.lift > 0 ? a.y + a.lift * 2 : a.y) - (b.lift > 0 ? b.y + b.lift * 2 : b.y));
  const dotSpr = getDotSprite();
  const shadowSpr = wantShadow && spriteFade > 0.02 ? getShadowSprite() : null;
  const sprMemo = ren?.pushAtlasSpr && spriteFade > 0.02 ? new Map<number, ReturnType<typeof sectDiscipleFrameSpr>>() : null;
  const getSprCached = (variant: number, dFace: DiscipleFacing, frame: number) => {
    if (!sprMemo) return null;
    const fc = dFace === 'front' ? 0 : dFace === 'diagF' ? 1 : dFace === 'side' ? 2 : dFace === 'diagB' ? 3 : 4;
    const mk = (variant << 7) | (fc << 4) | frame;
    let s = sprMemo.get(mk);
    if (s === undefined) {
      s = sectDiscipleFrameSpr(sid, undefined, variant, customUniform, dFace, frame)
        ?? (variant !== 0 ? sectDiscipleFrameSpr(sid, undefined, 0, customUniform, dFace, frame) : null);
      sprMemo.set(mk, s);
    }
    return s;
  };
  const sheetMemo = new Map<number, HTMLCanvasElement | null>();
  const getSheetCached = (dFace: DiscipleFacing, variant: number) => {
    const fc = dFace === 'front' ? 0 : dFace === 'diagF' ? 1 : dFace === 'side' ? 2 : dFace === 'diagB' ? 3 : 4;
    const mk = (variant << 3) | fc;
    let sh = sheetMemo.get(mk);
    if (sh === undefined) {
      sh = sectDiscipleSheet(sid, undefined, variant, customUniform, dFace)
        ?? (variant !== 0 ? sectDiscipleSheet(sid, undefined, 0, customUniform, dFace) : null);
      sheetMemo.set(mk, sh);
    }
    return sh;
  };

  const bandSize = z < 0.22 ? units.length : Math.max(12, Math.ceil(units.length / 6));
  for (let start = 0; start < units.length; start += bandSize) {
    const end = Math.min(units.length, start + bandSize);
    const mid = units[(start + end - 1) >> 1];
    const stripY = mid.lift > 0 ? mid.y + mid.lift * 2 : mid.y;
    out.push({
      y: stripY,
      k,
      count: end - start,
      gl: ren?.pushAtlasSpr
        ? (batch, occA) => {
            const resolved: (ReturnType<typeof sectDiscipleFrameSpr> | null)[] | null = spriteFade > 0.02 ? new Array(end - start).fill(null) : null;
            if (resolved) {
              for (let i = start; i < end; i++) {
                const u = units[i];
                let spr = getSprCached(u.variant, u.facing, u.frame);
                if (spr && ren.warmAtlasSpr && !ren.warmAtlasSpr(spr, spr.key)) {
                  const fb1 = getSprCached(0, u.facing, 0);
                  const fb2 = getSprCached(0, 'front', 0);
                  if (fb1 && ren.warmAtlasSpr(fb1, fb1.key)) spr = fb1;
                  else if (fb2 && ren.warmAtlasSpr(fb2, fb2.key)) spr = fb2;
                  else return false;
                }
                resolved[i - start] = spr;
              }
            }
            if (dotFade > 0.02) {
              const da = occA * dotFade;
              for (let i = start; i < end; i++) {
                const u = units[i];
                if (!ren.pushAtlasSpr!(batch, dotSpr, u.x, u.y - u.lift - 6, dotScale, dotScale, false, da, 'P2:dot8', tint.r, tint.g, tint.b, false)) return false;
              }
            }
            if (resolved) {
              const sa = occA * spriteFade;
              for (let i = start; i < end; i++) {
                const u = units[i];
                const spr = resolved[i - start];
                if (!spr) {
                  if (!ren.pushAtlasSpr!(batch, dotSpr, u.x, u.y - u.lift - 6, dotScale, dotScale, false, sa * 0.85, 'P2:dot8', tint.r, tint.g, tint.b, false)) return false;
                  continue;
                }
                if (shadowSpr && !ren.pushAtlasSpr!(batch, shadowSpr, u.x, u.y + 2, 1.0, 1.0, false, sa, 'P2:shadow32', 1, 1, 1, false)) return false;
                if (u.lift > 0 && !ren.pushAtlasSpr!(batch, dotSpr, u.x, u.y - u.lift + 3, 2.2, 0.32, false, sa * 0.85, 'P2:dot8', swR, swG, swB, false)) return false;
                if (!ren.pushAtlasSpr!(batch, spr, u.x, u.y - u.lift, 1, 1, u.flipX, sa, spr.key, 1, 1, 1, false)) return false;
              }
            }
            return true;
          }
        : undefined,
      draw: (ctx) => {
        if (dotFade > 0.02) {
          ctx.save();
          ctx.globalAlpha *= dotFade;
          ctx.fillStyle = tint.css;
          for (let i = start; i < end; i++) {
            const u = units[i];
            ctx.beginPath();
            ctx.arc(u.x, u.y - u.lift - 6, dotRad, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        if (spriteFade > 0.02) {
          for (let i = start; i < end; i++) {
            const u = units[i];
            const sheet = getSheetCached(u.facing, u.variant);
            if (!sheet) {
              ctx.save();
              ctx.globalAlpha *= spriteFade * 0.85;
              ctx.fillStyle = tint.css;
              ctx.beginPath();
              ctx.arc(u.x, u.y - u.lift - 6, dotRad, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              continue;
            }
            ctx.save();
            ctx.globalAlpha *= spriteFade;
            if (wantShadow) {
              ctx.fillStyle = 'rgba(0,0,0,0.22)';
              ctx.beginPath();
              ctx.ellipse(u.x, u.y + 3, u.lift > 0 ? 10 : 13, u.lift > 0 ? 4 : 5, 0, 0, Math.PI * 2);
              ctx.fill();
            }
            if (u.lift > 0) {
              ctx.fillStyle = isMo ? 'rgba(218,78,96,0.28)' : 'rgba(116,214,255,0.3)';
              ctx.beginPath();
              ctx.ellipse(u.x, u.y - u.lift + 3, 18, 5, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.strokeStyle = isMo ? '#ff8a98' : '#bceeff';
              ctx.lineWidth = 2.4;
              ctx.beginPath();
              ctx.moveTo(u.x - 16, u.y - u.lift + 3);
              ctx.lineTo(u.x + 16, u.y - u.lift + 3);
              ctx.stroke();
            }
            ctx.translate(u.x, u.y - u.lift);
            if (u.flipX) ctx.scale(-1, 1);
            ctx.drawImage(sheet, u.frame * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.85, SHEET_W, SHEET_H);
            ctx.restore();
          }
        }
      },
    });
  }
}
export const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const YEAR = 360;
/** 开局的太平年月（此前各派只有摩擦，不会自行开战） */
export const GRACE = 3 * YEAR;
export const MY = MY_SECT_ID;
/** 一名修士的战力（按大境界指数级拉开：1 结丹 ≈ 55 炼气，1 元婴 ≈ 420 炼气；小境界每层 +15%） */
export const PW = [0.3, 1, 8, 55, 420, 3200, 18000];
export const pwOf = (u: { realm: number; stage: number }) => (PW[u.realm] ?? 1) * (1 + 0.15 * u.stage);
export const OUTER_UNIT_PW = 1.85; // 一名外门炼气中期/后期战兵的基准战力

export type Mode = 'wave' | 'all' | 'hold';
export const ATK_NAME: Record<Mode, string> = { wave: '分波遣将', all: '倾巢而出', hold: '小股试探' };
export const DEF_NAME: Record<Mode, string> = { wave: '逐波增援', all: '全宗回援', hold: '只凭镇守' };
/** 每处据点的镇守人数 / 各等宗门的据点数 */
export const GAR: Record<Scale, number> = { da: 30, zhong: 18, xiao: 10 };
export const HOLDS: Record<Scale, number> = { da: 4, zhong: 3, xiao: 2 };
export const SCALE_W: Record<Scale, number> = { da: 0, zhong: 1, xiao: 2 };
/** v0.62：附庸月供（径入宗主供奉）/ 分舵月入 / 灭宗搜刮 / 赔款 */
export const VASSAL: Record<Scale, number> = { da: 3000, zhong: 1200, xiao: 500 };
export const BRANCH: Record<Scale, number> = { da: 4000, zhong: 1800, xiao: 800 };
export const MIE_LOOT: Record<Scale, number> = { da: 300000, zhong: 120000, xiao: 40000 };
export const END_LOOT: Record<Scale, number> = { da: 60000, zhong: 24000, xiao: 9000 };
/** 亲征时同屏的人数上限（敌 / 我）——后备打完一批补一批 */
export const FIELD_F = 20, FIELD_M = 16;

// ---------------------------------------------------------------- 联盟 / 世仇
export const OLD_ALLY: Record<string, string> = {};
for (const [k, ids] of Object.entries({
  梁国七派: ['huangfeng', 'yanyue', 'lingshou', 'qingxu', 'huadao', 'tianque', 'jujian'], 正一盟: ['luoyun', 'gujian', 'baiqiao'],
  魔门六宗: ['guiling', 'hehuan', 'yuling', 'qianhuan', 'tiansha', 'yinluo'], 列国盟: ['huayi', 'qianzhu'], 朔漠: ['tianlan', 'mulan'],
  中州魔道: ['tianmo'], 中州正道: ['taiyi', 'yejia'], 星罗殿: ['tianxing', 'miaoyin'], 叛星盟: ['leikong', 'jiyin'],
})) for (const id of ids) OLD_ALLY[id] = k;
export const allyOf = (id: string): string => X_BY_ID[id]?.ally ?? OLD_ALLY[id] ?? '';
export const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** 世仇（[甲, 乙, 缘由]）——同盟之内也可能有过节 */
export const FEUD_LIST: [string, string, string][] = [
  ['huangfeng', 'guiling', '阴灵门当年血洗青霞谷外围坊市的旧账'], ['yanyue', 'hehuan', '天欢宗屡屡掳掠凝霜宗女弟子'], ['lingshou', 'yuling', '驭兽一道的正统之争'],
  ['luoyun', 'yinluo', '幽罗宗盗掘栖云宗药园'], ['gujian', 'tiansha', '玄煞宗截杀藏剑门试剑弟子'], ['baiqiao', 'qianzhu', '天衍诀傀儡术的归属之争'],
  ['huadao', 'jujian', '刀剑孰强的百年意气之争'], ['taizhen', 'moyan', '太真门长老死于青阳魔火'], ['haoran', 'xuesha', '血煞教屠戮浩然阁治下凡人城池'],
  ['wanfa', 'jiyin', '玄阴祖师暗算万法门长老'], ['liulian', 'leikong', '叛星盟强征六合殿的猎妖船队'], ['tianxing', 'leikong', '逆星之乱'],
  ['leiyin', 'motuo', '佛魔相克，雷音宗誓平魔陀山'], ['tianshi', 'dusheng', '毒圣门毒杀天师府嫡传'], ['taiyi', 'tianmo', '中州正魔两道魁首之争'],
  ['jiuxian', 'motuo', '魔陀山魔修觊觎九霄宫女修'], ['xiaoji', 'wanyao', '万妖谷妖修屡犯北寒雪原'], ['tianfu', 'tianxingzong', '符阵两道的生意之争'],
];
export const FEUD = new Map(FEUD_LIST.map(([a, b, why]) => [key(a, b), why]));
export function daoBase(a: Dao, b: Dao): number {
  const k = [a, b].sort().join('-');
  return ({ 'mo-zheng': 38, 'fo-mo': 42, 'yao-zheng': 18, 'mo-mo': 12, 'mo-yao': 12, 'fo-yao': 15, 'mo-zhong': 14 } as Record<string, number>)[k] ?? 4;
}
/** 名册上有、心法表里没有登记的旧派 */
export const EXTRA_GF: Record<string, string> = { jiyin: 'xuanyin' };
export const SCHOOL_ALIAS: Record<string, string> = { tianxing: 'xinggong', leikong: 'nixing', tianlan: 'mulan', yejia: 'taiyi' };
/** 心法主修的那一系 → 战阵 */
export const ZHEN: Record<string, [string, 'atk' | 'def']> = {
  火: ['烈火燎原阵', 'atk'], 雷: ['九霄雷阵', 'atk'], 剑: ['万剑归宗阵', 'atk'], 魔: ['血煞魔阵', 'atk'], 冰: ['玄冰封天阵', 'atk'], 风: ['疾风游骑阵', 'atk'],
  阵: ['周天星斗大阵', 'def'], 土: ['厚土镇岳阵', 'def'], 体: ['金刚伏魔阵', 'def'], 符: ['万符护山阵', 'def'], 木: ['青木长生阵', 'def'], 御: ['万兽奔腾阵', 'atk'], 识: ['迷魂幻阵', 'def'], 身: ['游龙阵', 'atk'],
};
export interface Doctrine { gf: string; name: string; atk: number; def: number }

export interface Hold { o: string; g: number; isolated?: boolean; starved?: number; commanderId?: number; commanderName?: string; fortLv?: number }
export interface MarchEntity {
  id: number;
  warId: number;
  side: 0 | 1;
  sid: string;
  kind: 'army' | 'convoy';
  map: string;
  fromLocName?: string;
  fromX: number; fromY: number;
  toX: number; toY: number;
  departDay: number;
  arriveDay: number;
  /** 实时行军进度（现实秒数），保证玩家看大地图/御剑飞行时队列真实移动，同时兼容跳日推演 */
  rt?: number;
  rtDur?: number;
  /** 宗门山门校场集结倒计时（秒）：未归零前在宗门外集结列阵，归零后拔营开拔 */
  musterSec?: number;
  soldiers: number;
  pills: number;
  stones: number;
  /** 本支运丹队列是否占用一艘宗门一阶灵舟（无可用飞舟时降级为陆路运丹队，绝不凭空刷船） */
  usesShip?: boolean;
  /** 本支行军/迁营纵队护航战船阶位（真实占用宗门空闲飞舟库存） */
  airshipTier?: AirshipTier;
  /** 是否为大营拔营迁址编队（抵达新址后方正式迁移大营） */
  isCampRelocate?: boolean;
  /** 若由己方据点发兵，记录发兵据点 ID */
  fromHoldId?: string;
  done?: boolean;
  raided?: boolean;
  inRaid?: boolean;
  /** 玩家护送闭环状态 */
  escorted?: boolean;
  escortAmbushed?: boolean;
  escortWarned?: boolean;
  escortAwayT?: number;
}
export interface PendingBorderSkirmish {
  id: number;
  a: string; b: string;
  x: number; y: number;
  map: string;
  locName: string;
  until: number;
  fromAKind?: 'hold' | 'gate';
  fromALocId?: string;
  fromAName?: string;
  fromAX?: number; fromAY?: number;
  fromBKind?: 'hold' | 'gate';
  fromBLocId?: string;
  fromBName?: string;
  fromBX?: number; fromBY?: number;
  countA?: number;
  countB?: number;
  createdDay?: number;
  arriveDay?: number;
}
export interface SkirmishSource {
  kind: 'camp' | 'march' | 'hold' | 'gate';
  warId?: number;
  side?: 0 | 1;
  marchId?: number;
  locId?: string;
  sid: string;
  label: string;
  x: number;
  y: number;
  avail: number;
}
export interface SkirmishSquad {
  id: number;
  kind: 'border' | 'front' | 'raid' | 'escort_ambush';
  warId?: number;
  marchId?: number;
  borderId?: number;
  a: string; b: string;
  x: number; y: number;
  map: string;
  unitA: Enemy[];
  unitB: Enemy[];
  formA?: WarFormation;
  formB?: WarFormation;
  srcA?: SkirmishSource;
  srcB?: SkirmishSource;
  reservedA?: number;
  reservedB?: number;
  originTextA?: string;
  originTextB?: string;
  t: number;
  doneT?: number;
  resolved?: boolean;
}
export interface CampState {
  x: number; y: number; map: string;
  build: number;        // 0..1 筑营进度（0 集结点勘址待立营 / 0.4 哨栅 / 0.9 帅帐药帐 / 1.0 完备护营阵）
  pills: number;
  stones: number;
  soldiers: number;
  rally?: string;
  bySect?: Record<string, number>;
  /** 是否已有先遣弟子抵临集结点正式立营（未立营前仅在地图显示集结帅旗与勘址圈桩，不提前生成实体大营） */
  established?: boolean;
  /** 大营拔营迁往新址的在途迁营状态（待迁营纵队实景抵达新址后方切换坐标） */
  relocating?: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    map: string;
    marchId?: number;
  };
}
export interface WarOrder {
  id: number;
  warId: number;
  sid: string;
  kind: 'escort' | 'raid' | 'seize' | 'siege';
  title: string;
  desc: string;
  marchId?: number;
  targetId?: string;
  x: number; y: number;
  map: string;
  until: number;
  merit: number;
  done?: boolean;
}
export interface WarFacility {
  id: string;
  side: 0 | 1;
  kind: 'pillar' | 'depot' | 'scout';
  name: string;
  x: number;
  y: number;
  map: string;
  hp: number;
  maxHp: number;
  broken?: boolean;
  raidCd?: number;
}
export interface WarAttritionState {
  gaugeA: number;        // 0..100 A 方决战势能
  gaugeB: number;        // 0..100 B 方决战势能
  advA: number;          // 0.60..1.45 A 方开战优势系数
  advB: number;          // 0.60..1.45 B 方开战优势系数
  clashReady?: boolean;  // 是否已达开战阈值或触发总攻事件
  clashTrigger?: string; // 触发全面大战的事件名
  duelWinsA: number;
  duelWinsB: number;
  duelStreakA?: number;
  duelStreakB?: number;
  injuredRefs?: string[];
  killedRefs?: string[];
  facilities: WarFacility[];
}
export interface SWar {
  id: number; a: string; b: string; why: string; start: number;
  /** 眼下谁在攻（0 = a，1 = b）；tgt 是守方的据点或山门（= 守方宗门 id） */
  ini: 0 | 1; tgt: string;
  score: number; wave: number; next: number; streak: number; la: number; lb: number; log: string[];
  /** 你投了哪一边（门人应召 / 散修投效）；自家宗门参战不用这个 */
  side?: 0 | 1; wins?: number; lastFight?: number; lastAct?: number; allA?: number; allB?: number; called?: boolean;
  /** v0.62：fall = 败者听候发落之日；big = 已打过几场灭宗大战；zt = 攻打护宗大阵的次数；hz = 宗主上次轰击大阵之日 */
  fall?: number; big?: number; zt?: number; hz?: number;
  /** v0.73 Phase 4：大一统战区（联军协同 / 战前集结 / 边界大营） */
  campaign?: string;
  sideA?: string[]; sideB?: string[];
  sideAName?: string; sideBName?: string;
  phase?: 'prep' | 'battle';
  prepUntil?: number;
  lullUntil?: number;
  campA?: CampState;
  campB?: CampState;
  /** v0.75：战前拉锯破坏、优势系数、阵前对峙与斗将 */
  attrition?: WarAttritionState;
  /** 战线推进轨迹（每攻克一处据点便记下前次战线位置，方便太上/宗主回溯阵线推进） */
  frontTrail?: { x: number; y: number; name: string }[];
}
export interface SWState { hold: Record<string, Hold>; wars: SWar[]; ten: Record<string, number>; truce: Record<string, number>; seq: number; init?: number; myDef?: Mode; myInc?: number; myPattern?: FormPattern;
  /** v0.62：各派护宗大阵的阵力 / 已除名的宗门 / 本宗附庸 / 本宗分舵 */
  zhen?: Record<string, { hp: number; m: number }>; gone?: Record<string, number>; vassal?: Record<string, number>; branch?: string[];
  /** v0.70 彩蛋：本宗亲手除名的宗门数；qun = 天下共讨已发动的日子 */
  mieN?: number; qun?: number;
  /** v0.73：全宗战备后勤账本 & 战时全军令 & 版本迁移标识 & 行军大营军令与战后休整 */
  supply?: Record<string, SectSupply>; myOrder?: BattleOrder; v73?: number;
  /** v0.75：各宗门持久化飞舟舰队库存（战船与运丹灵舟共用） */
  fleet?: Record<string, SectFleet>;
  marches?: MarchEntity[]; marchSeq?: number;
  warOrders?: WarOrder[]; orderSeq?: number;
  recoverUntil?: Record<string, number>;
  lastDeclareDay?: Record<string, number>;
  pendingBorders?: PendingBorderSkirmish[];
  borderSeq?: number;
}
export interface Unit { ref: number; realm: number; stage: number; top: boolean; sid?: string }
export interface ActiveFrontDuel {
  warId: number;
  side: 0 | 1;
  mode: 'champion' | 'player' | 'wager';
  round: number;
  wins: number;
  losses: number;
  ally?: Enemy;
  foe: Enemy;
  foeSid: string;
  foeUnit?: Unit;
  x: number;
  y: number;
  t: number;
  doneT?: number;
  resolved?: boolean;
}
export interface Live {
  war: number; side: 0 | 1; wave: number; foes: Enemy[]; allies: Enemy[]; t: number; x: number; y: number;
  /** v0.62 / v0.72 大会战：rm / rf = 前线骨干；cmdRm / cmdRf = 结丹统帅/长老预备队；bossRm / bossRf = 存亡大战压轴底牌 */
  rm: Unit[]; rf: Unit[]; outerRm: number; outerRf: number;
  cmdRm: Unit[]; cmdRf: Unit[]; bossRm: Unit[]; bossRf: Unit[];
  cmdDeployedM?: boolean; cmdDeployedF?: boolean; bossDeployedF?: boolean;
  mForms0?: number; fForms0?: number;
  advM: number; advF: number;
  stage: 'muster' | 'march' | 'standoff' | 'clash';
  stageT: number;
  clashT?: number;
  parleyStep?: number;
  triggerEvent?: string;
  m0: number; f0: number; km: number; kf: number;
  outerKm: number; outerKf: number; outerJm: number; outerJf: number;
  formations: WarFormation[]; formSeq: number;
  airships: WarAirship[]; airshipSeq: number;
  rt: number; st: number; ft: number;
  standoffT: number;
  ma: Mode; md: Mode; gate: boolean; zhen: boolean; ea: number;
}

