// v0.72 + v0.73：古代军阵式百人战阵实体（1 筑基阵眼 + 100–200 炼气战兵）
// - 复用游戏原生人物引擎 drawCharacter + SECT_UNIFORM 制式服制 + 阵旗光幕 formationEffects
// - 6 变体×14 帧动作条（待机呼吸 / 6 帧行军 / 3 帧齐射 / 受击 / 倒地横尸），逐人微错拍、绝不千人一面
// - 战损落地生成环形缓冲横尸池（渐隐）、溃败修仙者定向御风/化虹遁走
import type { Game } from './game';
import type { Enemy } from './combat';
import type { Drawable } from './life';
import type { School } from '../data/arts';
import { EL_COL } from './foeskills';
import { MY_SECT_ID, X_BY_ID } from '../data/sects';
import { LOC_BY_ID } from '../data/world';
import { SECT_ROBE_OF } from './npc';
import { CharState, drawCharacter, randomLook } from '../gfx/character';
import { getDotSprite, getShadowSprite } from '../gfx/charAtlas';
import { applySectUniform, sectUniformSpec, type CustomSectUniform } from '../gfx/sectUniform';
import { formationEffectImage } from '../gfx/formationEffects';
import { mulberry32 } from '../core/rng';

export type FormPattern = 'square' | 'crane' | 'circle' | 'arrow' | 'crescent' | 'bagua';
export const FORM_PATTERNS: { id: FormPattern; name: string; atk: number; def: number; speed: number; desc: string }[] = [
  { id: 'square', name: '方阵', atk: 1.0, def: 1.18, speed: 100, desc: '八门方阵 · 十字阵道留白，防线厚实，不易被凿穿' },
  { id: 'crane', name: '鹤翼阵', atk: 1.15, def: 0.98, speed: 115, desc: '两翼张开包抄，左右翼尖交叉齐射，覆盖面广' },
  { id: 'arrow', name: '锋矢阵', atk: 1.24, def: 0.9, speed: 135, desc: '锥形突前、御道分明，行军最快，集火破甲' },
  { id: 'crescent', name: '偃月阵', atk: 1.18, def: 1.08, speed: 106, desc: '弯弧前抱、双角微收，弧面聚火攒射破翼，攻守兼备' },
  { id: 'bagua', name: '八卦两仪阵', atk: 1.06, def: 1.28, speed: 92, desc: '内两仪护台、外八卦八门簇立，灵盾自回极稳，八方轮射' },
  { id: 'circle', name: '四象环阵', atk: 0.96, def: 1.24, speed: 84, desc: '四象方簇环护中军将台，阵脚稳固，专御四面突袭' },
];

export type BattleOrder = 'charge' | 'hold' | 'protect';

export interface WarFormation {
  id: number;
  sid: string;
  /** 宗门显示名（含玩家自建宗门名，如「万剑宫」） */
  sectName?: string;
  /** 所属阵营标识（如「我方」「敌方」「攻方」「守方」） */
  sideLabel?: string;
  ours: boolean;
  leader: Enemy;
  pattern: FormPattern;
  school: School;
  soldiers: number;
  soldiersMax: number;
  deadCount: number;
  injCount: number;
  routedCount: number;
  volleyCd: number;
  collapsed: boolean;
  collapseT: number;
  _collapseDur?: number;
  _fallenSlots?: { x: number; y: number; v: number; fr: 12 | 13; flip: boolean }[];
  x: number;
  y: number;
  face: number;
  /** 战阵纵深朝向：1 = 南/正面朝下；-1 = 北/背面朝上 */
  faceY?: 1 | -1;
  /** 连续阵型朝向角（弧度：0=+x 右, +PI/2=+y 下, PI=-x 左, -PI/2=-y 上）与目标转向角 */
  faceAng?: number;
  targetFaceAng?: number;
  /** 阵内士兵平滑真实坐标、速度与朝向缓存（转向时沿轨迹走位，绝不瞬移） */
  _sx?: Float32Array;
  _sy?: Float32Array;
  _svx?: Float32Array;
  _svy?: Float32Array;
  _sFlip?: Uint8Array;
  _sFace?: Uint8Array; // 0 = front, 1 = side, 2 = back
  _sInit?: boolean;
  _moveHoldT?: number;
  lastShieldHitT?: number;
  doctrineAtk: number;
  /** v0.73：护阵灵盾机制（未破盾不死兵，同境可相持，跨两境溢碎直秒） */
  doctrineDef?: number;
  realm?: number;
  shield?: number;
  shieldMax?: number;
  shieldRegen?: number;
  brokenT?: number;
  /** 战阵法力/灵池：齐射与维盾耗灵，灵竭需短暂调息蓄灵，避免无休止连发 */
  mp?: number;
  mpMax?: number;
  mpRegen?: number;
  exhaustT?: number;
  lastHitSchool?: School;
  lastHitT?: number;
  leaderFellNote?: boolean;
  /** 军阵稳态锚点（不随头领身法瞬移跳变） */
  anchorX?: number;
  anchorY?: number;
  prevLeaderX?: number;
  prevLeaderY?: number;
  /** 检测到头领施展身法/瞬移后的驻阵冷却（秒） */
  dashHoldT?: number;
  /** 阵型朝向翻转冷却（防止原地高频左右闪动） */
  faceTurnCd?: number;
  /** 战阵本帧是否在行军移动（决定播放行军步态或立定持阵） */
  moving?: boolean;
  /** 开战集结期剩余秒数（大于 0 时战兵从阵后纵队奔赴列阵，停火待命） */
  musterT?: number;
  /** 是否为灭宗存亡死战（决定炼气战兵死伤溃比例：普通战 22% 亡 / 48% 伤 / 30% 溃；灭宗战 48% 亡 / 32% 伤 / 20% 溃） */
  extinction?: boolean;
  /** 停火标志（集结 / 行军 / 阵前叫阵阶段全阵停火） */
  holdFire?: boolean;
  /** 开打（clash）后切换的目标宗门阵型 */
  desiredPattern?: FormPattern;
  warId?: number;
  /** 战线战术槽位（横向翼展偏移 / 纵深排位偏移 / 主轴角），防止对峙及交战后全军吸成一竖串 */
  slotLineLat?: number;
  slotLineDepth?: number;
  lineAxisAng?: number;
  /** 集结完毕后行军开赴的阵前目标坐标 */
  deployTargetX?: number;
  deployTargetY?: number;
  /** 局部试探冲突小方阵归属（同一 skirmishGroup 内按 skirmishSide 互为敌阵） */
  skirmishGroup?: number;
  skirmishSide?: 0 | 1;
  bystander?: boolean;
  /** 最近一次齐射时刻（用于统一列阵出招动作） */
  lastVolleyT?: number;
  /** v0.73：最近一次受击抖动时刻 / 阵亡与溃退定向坐标（指向己方本营/后方） */
  lastHitAnimT?: number;
  retreatX?: number;
  retreatY?: number;
  /** 战后撤离/整编归营状态（非瞬间消失） */
  retreatMode?: 'return' | 'rout';
  retreatFadeT?: number;
  retreatFadeMax?: number;
  customUniform?: CustomSectUniform;
}

/** v0.73：初始化或补全战阵护盾与灵池参数（幂等，兼容旧构造器与测试） */
export function ensureFormationShield(f: WarFormation): { shield: number; shieldMax: number; shieldRegen: number; brokenT: number; realm: number; mp: number; mpMax: number; mpRegen: number; exhaustT: number } {
  const realm = f.realm ?? f.leader?.realm ?? 2;
  const pat = FORM_PATTERNS.find((q) => q.id === f.pattern) ?? FORM_PATTERNS[0];
  const minN = f.skirmishGroup !== undefined ? 4 : 12;
  const n = Math.max(minN, f.soldiersMax || f.soldiers);
  if (f.shieldMax === undefined || f.shield === undefined || f.shieldRegen === undefined) {
    const docDef = f.doctrineDef ?? 1;
    const rawS = f.skirmishGroup !== undefined ? (28 + n * 4.5) : (90 + n * 2.1);
    const maxS = Math.round(rawS * pat.def * docDef * Math.pow(1.65, Math.max(0, realm - 2)));
    f.realm = realm;
    f.shieldMax = maxS;
    f.shield = f.shield ?? maxS;
    f.shieldRegen = Math.max(3, maxS * 0.048);
    f.brokenT = f.brokenT ?? 0;
  }
  if (f.mpMax === undefined || f.mp === undefined || f.mpRegen === undefined) {
    const maxMp = Math.round((150 + n * 2.4) * Math.pow(1.45, Math.max(0, realm - 2)));
    f.mpMax = maxMp;
    f.mp = f.mp ?? maxMp;
    f.mpRegen = Math.max(7, maxMp * 0.046);
    f.exhaustT = f.exhaustT ?? 0;
  }
  return {
    shield: f.shield,
    shieldMax: f.shieldMax,
    shieldRegen: f.shieldRegen,
    brokenT: f.brokenT ?? 0,
    realm,
    mp: f.mp,
    mpMax: f.mpMax,
    mpRegen: f.mpRegen,
    exhaustT: f.exhaustT ?? 0,
  };
}

export const SHEET_W = 148;
export const SHEET_H = 196;
/** 帧 0..1=立定呼吸(idle), 帧 2..7=6帧行军(walk), 帧 8..10=3帧齐射(cast), 帧 11=受击(hit), 帧 12..13=倒地横尸 */
const SHEET_FRAMES = 14;
const SHEET_VARIANTS = 6;
export const SOLDIER_SCALE = 0.96;
const SHEET_CACHE = new Map<string, HTMLCanvasElement>();
const MAX_SHEETS = 640; // 覆盖各宗 × 6 变体（3男3女）× 5 半圆朝向

/** 战阵与行动/行军纵队共用的弟子缩放 LOD 参数：screenH 在 [7.5, 16] 区间平滑交叉淡入 */
export function discipleLodParams(z: number, dpr = 1) {
  const screenH = 150 * SOLDIER_SCALE * z * dpr;
  const lodU = Math.max(0, Math.min(1, (screenH - 7.5) / 8.5));
  const spriteFade = lodU * lodU * (3 - 2 * lodU);
  const dotFade = 1 - spriteFade;
  const effScale = Math.max(0.015, z * dpr);
  const dotScale = Math.min(14, Math.max(1.2, 0.44 / effScale));
  const dotRad = Math.min(28, Math.max(2.0, 2.2 / effScale));
  const wantShadow = screenH >= 28;
  return { screenH, lodU, spriteFade, dotFade, effScale, dotScale, dotRad, wantShadow };
}

export type DiscipleFacing = 'front' | 'diagF' | 'side' | 'diagB' | 'back';

export function facingToCode(df: DiscipleFacing): number {
  return df === 'back' ? 4 : df === 'diagB' ? 3 : df === 'side' ? 2 : df === 'diagF' ? 1 : 0;
}

export function codeToFacing(code: number): DiscipleFacing {
  return code === 4 ? 'back' : code === 3 ? 'diagB' : code === 2 ? 'side' : code === 1 ? 'diagF' : 'front';
}

export interface DiscipleFrameSpr {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
  key: string;
}

const FRAME_SPR_CACHE = new Map<string, DiscipleFrameSpr>();
const MAX_FRAME_SPRS = 4800;
const FLAG_SPR_CACHE = new Map<string, DiscipleFrameSpr>();

let _budgetActive = false;
let _bakesThisFrame = 0;
let _slicesThisFrame = 0;

/** 每渲染帧开始前调用：开启单帧离线预烘预算（每帧最多新烘 1 张动作条，杜绝 200ms 卡顿尖刺） */
export function beginDiscipleSheetFrame() {
  _budgetActive = true;
  _bakesThisFrame = 0;
  _slicesThisFrame = 0;
}

/** 按运动向量判定 8 方位朝向（5 组半圆模板 + 左右镜像），确保移动路线与人物面部朝向严格一致 */
export function facingFromVec(vx: number, vy: number, prevFlip = false): { facing: DiscipleFacing; flip: boolean } {
  const sp = Math.hypot(vx, vy);
  if (sp < 1e-4) return { facing: 'front', flip: prevFlip };
  const ang = Math.atan2(vx, vy);
  const absA = Math.abs(ang);
  let facing: DiscipleFacing;
  if (absA < Math.PI * 0.125) facing = 'front';
  else if (absA < Math.PI * 0.375) facing = 'diagF';
  else if (absA < Math.PI * 0.625) facing = 'side';
  else if (absA < Math.PI * 0.875) facing = 'diagB';
  else facing = 'back';
  const flip = (facing === 'front' || facing === 'back')
    ? (prevFlip ? vx < sp * 0.12 : vx < -sp * 0.12)
    : vx < 0;
  return { facing, flip };
}

interface BattleCorpse {
  x: number;
  y: number;
  sid: string;
  variant: number;
  frame: 12 | 13;
  face: number;
  t: number;
  dur: number;
  robe?: string;
  custom?: CustomSectUniform;
}

interface BattleRetreater {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  vz: number;
  sid: string;
  variant: number;
  face: number;
  realm: number;
  t: number;
  dur: number;
  robe?: string;
  custom?: CustomSectUniform;
}

const CORPSE_MAX = 1400;
const RETREAT_MAX = 360;
const CORPSE_POOL: BattleCorpse[] = [];
const RETREAT_POOL: BattleRetreater[] = [];
let LAST_VIEW: { left: number; top: number; right: number; bottom: number } | null = null;

export function getLastBattleView() {
  return LAST_VIEW;
}

export function resetWarBattleFx() {
  CORPSE_POOL.length = 0;
  RETREAT_POOL.length = 0;
  LAST_VIEW = null;
}

export function tickWarBattleFx(dt: number, view?: { left: number; top: number; right: number; bottom: number } | null) {
  for (let i = CORPSE_POOL.length - 1; i >= 0; i--) {
    CORPSE_POOL[i].t -= dt;
    if (CORPSE_POOL[i].t <= 0) CORPSE_POOL.splice(i, 1);
  }
  const v = view ?? LAST_VIEW;
  const offM = 240;
  for (let i = RETREAT_POOL.length - 1; i >= 0; i--) {
    const r = RETREAT_POOL[i];
    r.t -= dt;
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.z = Math.min(r.realm >= 2 ? 220 : 16, r.z + r.vz * dt);
    const lived = r.dur - r.t;
    const outOfView = !!v && lived >= 0.6 && (r.x < v.left - offM || r.x > v.right + offM || r.y < v.top - offM || r.y > v.bottom + offM + 80);
    if (r.t <= 0 || outOfView) { RETREAT_POOL.splice(i, 1); }
  }
}

export function collectWarBattleFx(
  out: Drawable[],
  view: { left: number; top: number; right: number; bottom: number },
  t: number,
  ren?: {
    pushAtlasSpr?: (...args: any[]) => boolean;
  },
) {
  if (Number.isFinite(view.left) && Number.isFinite(view.right) && (view.right - view.left) < 1e6) {
    LAST_VIEW = { left: view.left, top: view.top, right: view.right, bottom: view.bottom };
  }
  for (const c of CORPSE_POOL) {
    if (c.x < view.left - 120 || c.x > view.right + 120 || c.y < view.top - 120 || c.y > view.bottom + 120) continue;
    const alpha = Math.min(1, Math.max(0, c.t / 2.5)) * 0.92;
    if (alpha <= 0.01) continue;
    const spr = ren?.pushAtlasSpr ? sectDiscipleFrameSpr(c.sid, c.robe, c.variant, c.custom, 'front', c.frame) : null;
    const sheet = sectDiscipleSheet(c.sid, c.robe, c.variant, c.custom);
    const gl: Drawable['gl'] = spr && ren?.pushAtlasSpr
      ? (batch, occA) => ren.pushAtlasSpr!(batch, spr, c.x, c.y + 20, 1, 1, c.face < 0, alpha * occA, spr.key)
      : undefined;
    out.push({
      y: c.y - 8,
      k: 'D·战阵兵',
      gl,
      draw: (g) => {
        g.save();
        g.globalAlpha *= alpha;
        g.fillStyle = 'rgba(18,12,10,0.28)';
        g.beginPath();
        g.ellipse(c.x, c.y + 3, 18, 6, 0, 0, Math.PI * 2);
        g.fill();
        if (sheet) {
          g.translate(c.x, c.y);
          if (c.face < 0) g.scale(-1, 1);
          g.drawImage(sheet, c.frame * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.72, SHEET_W, SHEET_H);
        }
        g.restore();
      },
    });
  }
  for (const r of RETREAT_POOL) {
    if (r.x < view.left - 140 || r.x > view.right + 140 || r.y < view.top - 240 || r.y > view.bottom + 140) continue;
    const prog = 1 - r.t / r.dur;
    const alpha = Math.min(1, Math.max(0, r.t / 0.9));
    const isSwordLight = r.realm >= 2;
    const { facing, flip } = facingFromVec(r.vx, r.vy, r.face < 0);
    const frame = 2 + (Math.floor(t * 9 + prog * 12) % 6);
    const spr = !isSwordLight && ren?.pushAtlasSpr ? sectDiscipleFrameSpr(r.sid, r.robe, r.variant, r.custom, facing, frame) : null;
    const sheet = isSwordLight ? null : sectDiscipleSheet(r.sid, r.robe, r.variant, r.custom, facing);
    const gl: Drawable['gl'] = spr && ren?.pushAtlasSpr
      ? (batch, occA) => ren.pushAtlasSpr!(batch, getShadowSprite(), r.x, r.y + 2, 0.95, 0.95, false, alpha * occA, 'P2:shadow32')
        && ren.pushAtlasSpr!(batch, spr, r.x, r.y - r.z, 1, 1, flip, alpha * occA, spr.key)
      : undefined;
    out.push({
      y: r.y + (r.z > 20 ? 12000 : 0),
      k: isSwordLight ? 'D·其他' : 'D·战阵兵',
      gl,
      draw: (g) => {
        g.save();
        g.globalAlpha *= alpha;
        if (isSwordLight) {
          // 筑基以上：化为青/血色剑虹遁光掠向己方大营
          g.globalCompositeOperation = 'lighter';
          const col = r.sid === 'guiling' || r.sid === 'tiansha' || r.sid === 'tianmo' || r.sid === 'hehuan' ? '255,95,115' : '125,220,255';
          g.strokeStyle = `rgba(${col},${0.85 * alpha})`;
          g.lineWidth = 4.2;
          g.beginPath();
          g.moveTo(r.x - r.vx * 0.14, r.y - r.z + r.vz * 0.14);
          g.lineTo(r.x, r.y - r.z);
          g.stroke();
          g.fillStyle = `rgba(${col},${0.95 * alpha})`;
          g.beginPath();
          g.arc(r.x, r.y - r.z, 5.5, 0, Math.PI * 2);
          g.fill();
        } else {
          // 炼气期：神行符/御风步法定向撤退
          g.fillStyle = 'rgba(20,18,14,0.18)';
          g.beginPath();
          g.ellipse(r.x, r.y + 2, 10, 3.5, 0, 0, Math.PI * 2);
          g.fill();
          if (sheet) {
            g.translate(r.x, r.y - r.z);
            if (flip) g.scale(-1, 1);
            g.drawImage(sheet, frame * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.85, SHEET_W, SHEET_H);
          }
        }
        g.restore();
      },
    });
  }
}

function hashStr(s = 'default'): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function sheetKeyOf(sid: string, robe: string | undefined, v: number, custom: CustomSectUniform | undefined, facing: DiscipleFacing): string {
  const cKey = custom ? `${custom.cut}:${custom.robe}:${custom.trim}` : '';
  const fKey = facing === 'front' ? '' : `|${facing}`;
  return `${sid}|${robe ?? ''}|${v}|${cKey}|v5${fKey}`;
}

/** 离屏预烘某宗制式炼气弟子多变体×14帧动作条（复用 drawCharacter + SECT_UNIFORM + 简绘档） */
export function sectDiscipleSheet(
  sid: string,
  robe?: string,
  variant = 0,
  custom?: CustomSectUniform,
  facing: DiscipleFacing = 'front',
): HTMLCanvasElement | null {
  const v = ((variant % SHEET_VARIANTS) + SHEET_VARIANTS) % SHEET_VARIANTS;
  const key = sheetKeyOf(sid, robe, v, custom, facing);
  const hit = SHEET_CACHE.get(key);
  if (hit) {
    SHEET_CACHE.delete(key);
    SHEET_CACHE.set(key, hit);
    return hit;
  }
  if (typeof document === 'undefined') return null;

  // 单帧预算控制：若本帧已新烘至少 1 张图集，优先复用同宗最相近已缓存朝向，将额外变体平滑分摊到后续帧
  if (_budgetActive && _bakesThisFrame >= 1) {
    const nearFacing: DiscipleFacing = facing === 'diagF' ? 'front' : facing === 'diagB' ? 'back' : facing;
    const fallbacks = [
      SHEET_CACHE.get(sheetKeyOf(sid, robe, 0, custom, facing)),
      SHEET_CACHE.get(sheetKeyOf(sid, robe, v, custom, nearFacing)),
      SHEET_CACHE.get(sheetKeyOf(sid, robe, 0, custom, nearFacing)),
      SHEET_CACHE.get(sheetKeyOf(sid, robe, v, custom, 'front')),
      SHEET_CACHE.get(sheetKeyOf(sid, robe, 0, custom, 'front')),
    ];
    for (const fb of fallbacks) if (fb) return fb;
  }

  let cv: HTMLCanvasElement;
  try {
    cv = document.createElement('canvas');
    cv.width = SHEET_W * SHEET_FRAMES;
    cv.height = SHEET_H;
  } catch {
    return null;
  }
  const g = cv.getContext('2d');
  if (!g) return null;
  _bakesThisFrame++;

  const rnd = mulberry32((hashStr(sid) ^ (v * 0x9e3779b9)) >>> 0 || 101 + v);
  const rawLook = randomLook(rnd, v >= 3 ? 'female' : 'cultivator');
  rawLook.sex = v >= 3 ? 'f' : 'm';
  const look = applySectUniform(rawLook, sid, 0, robe ?? SECT_ROBE_OF(sid), custom);
  // 6 变体（0..2 男弟子 / 3..5 女弟子）：发型、衣摆/袖口、腰饰与背剑各有差异，保留宗门统一配色
  const maleHairs: Array<typeof look.hairStyle> = ['crown', 'bun', 'ponytail'];
  const femHairs: Array<typeof look.hairStyle> = ['halfup', 'twin', 'updo'];
  if (v < 3) {
    look.hairStyle = maleHairs[v];
    look.robeLen = v === 2 ? 'mid' : look.robeLen;
    look.skirt = v === 2 ? 'split' : look.skirt;
    look.waist = (['pouch', 'jade', 'gourd'] as const)[v];
    look.back = v === 1 ? 'sword' : look.back;
    if (v === 0) look.pin = 'jade';
  } else {
    const fv = v - 3;
    look.hairStyle = femHairs[fv];
    look.skirt = fv === 1 ? 'pleat' : look.skirt;
    look.pin = (['jade', 'flower', 'gold'] as const)[fv];
    look.ribbon = look.trim;
    look.waist = (['jade', 'pouch', 'jade'] as const)[fv];
    look.back = fv === 2 ? 'sword' : 'none';
    look.sash = look.belt;
  }
  look.height = 0.94 + ((v % 3) - 1) * 0.035 + (v >= 3 ? -0.025 : 0.015);
  look.build = 0.92 + ((v % 2) ? 0.06 : -0.04) + (v >= 3 ? -0.04 : 0.03);
  const cs = new CharState();
  const baseYaw = facing === 'back' ? Math.PI
    : facing === 'diagB' ? Math.PI * 0.75
      : facing === 'side' ? Math.PI * 0.5
        : facing === 'diagF' ? Math.PI * 0.25
          : 0;
  cs.yaw = baseYaw;
  cs.targetYaw = cs.yaw;

  for (let f = 0; f < SHEET_FRAMES; f++) {
    g.save();
    // 关键：每帧清掉上一次动作的过渡混叠，确保行走/施法/受击上半身姿态真实生效而非停在 idle
    cs.from = null;
    cs.blend = 1;
    cs.yaw = baseYaw;
    cs.targetYaw = baseYaw;
    if (f >= 12) {
      // 倒地横尸帧：横卧地表
      g.translate(f * SHEET_W + SHEET_W * 0.5, SHEET_H * 0.62);
      g.rotate(f === 12 ? -Math.PI * 0.48 : Math.PI * 0.48);
      g.translate(0, 32);
      cs.setAction('hit');
      cs.from = null;
      cs.blend = 1;
      cs.gait = null;
      cs.phase = 0;
      cs.actionT = 0.35;
      cs.t = 0.35 + v * 0.4;
    } else {
      g.translate(f * SHEET_W + SHEET_W * 0.5, SHEET_H * 0.85);
      if (f === 0) {
        cs.setAction('idle');
        cs.from = null;
        cs.blend = 1;
        cs.gait = null;
        cs.phase = 0;
        cs.actionT = 0;
        cs.t = 0.05 + v * 0.2;
      } else if (f === 1) {
        // 呼吸波峰 + 轻微戒备转身/起势，使待机双帧有真实躯干与衣摆起伏
        g.translate(0, -1.2);
        cs.setAction('idle');
        cs.from = null;
        cs.blend = 1;
        cs.gait = null;
        cs.yaw = baseYaw + (facing === 'side' ? 0.14 : (v & 1 ? 0.14 : -0.14));
        cs.targetYaw = cs.yaw;
        cs.phase = Math.PI * 0.5;
        cs.actionT = 0;
        cs.t = Math.PI / 2.2 + v * 0.2;
      } else if (f <= 7) {
        cs.setAction('walk');
        cs.from = null;
        cs.blend = 1;
        cs.gait = 'walk';
        cs.phase = ((f - 2) / 6) * Math.PI * 2;
        cs.actionT = 0.2;
        cs.t = f * 0.28 + v * 0.4;
      } else if (f <= 10) {
        cs.setAction('cast');
        cs.from = null;
        cs.blend = 1;
        cs.gait = null;
        cs.phase = 0;
        cs.actionT = 0.14 + (f - 8) * 0.13;
        cs.t = f * 0.28 + v * 0.4;
      } else {
        cs.setAction('hit');
        cs.from = null;
        cs.blend = 1;
        cs.gait = null;
        cs.phase = 0;
        cs.actionT = 0.22;
        cs.t = f * 0.28 + v * 0.4;
      }
    }
    try {
      drawCharacter(g, look, cs, SOLDIER_SCALE, 0, { detail: 2.6 });
    } catch {
      /* headless stub safe */
    }
    g.restore();
  }

  if (SHEET_CACHE.size >= MAX_SHEETS) {
    const first = SHEET_CACHE.keys().next().value;
    if (first !== undefined) SHEET_CACHE.delete(first);
  }
  SHEET_CACHE.set(key, cv);
  return cv;
}

/** 切分并缓存单帧精灵（148×196），供 WebGL WorldAtlas 实例化合批绘制（零 Canvas2D 回退） */
export function sectDiscipleFrameSpr(
  sid: string,
  robe?: string,
  variant = 0,
  custom?: CustomSectUniform,
  facing: DiscipleFacing = 'front',
  frame = 0,
): DiscipleFrameSpr | null {
  const sheet = sectDiscipleSheet(sid, robe, variant, custom, facing);
  if (!sheet || typeof document === 'undefined') return null;
  const v = ((variant % SHEET_VARIANTS) + SHEET_VARIANTS) % SHEET_VARIANTS;
  const fr = ((frame % SHEET_FRAMES) + SHEET_FRAMES) % SHEET_FRAMES;
  const sKey = sheetKeyOf(sid, robe, v, custom, facing);
  const key = `WF:${sKey}:${fr}`;
  const hit = FRAME_SPR_CACHE.get(key);
  if (hit && (hit as any)._src === sheet) {
    FRAME_SPR_CACHE.delete(key);
    FRAME_SPR_CACHE.set(key, hit);
    return hit;
  }
  if (_budgetActive && _slicesThisFrame >= 12 && fr > 0) {
    const fb0 = FRAME_SPR_CACHE.get(`WF:${sKey}:0`);
    if (fb0 && (fb0 as any)._src === sheet) return fb0;
  }
  try {
    const cv = document.createElement('canvas');
    cv.width = SHEET_W;
    cv.height = SHEET_H;
    const g = cv.getContext('2d');
    if (!g) return null;
    _slicesThisFrame++;
    g.drawImage(sheet, fr * SHEET_W, 0, SHEET_W, SHEET_H, 0, 0, SHEET_W, SHEET_H);
    const spr: DiscipleFrameSpr = { canvas: cv, w: SHEET_W, h: SHEET_H, ax: SHEET_W * 0.5, ay: SHEET_H * 0.85, key };
    (spr as any)._src = sheet;
    if (FRAME_SPR_CACHE.size >= MAX_FRAME_SPRS) {
      const first = FRAME_SPR_CACHE.keys().next().value;
      if (first !== undefined) FRAME_SPR_CACHE.delete(first);
    }
    FRAME_SPR_CACHE.set(key, spr);
    return spr;
  } catch {
    return null;
  }
}

function flagFrameSpr(flagKey: string, img: HTMLCanvasElement): DiscipleFrameSpr {
  const hit = FLAG_SPR_CACHE.get(flagKey);
  if (hit && hit.canvas === img) return hit;
  const spr: DiscipleFrameSpr = {
    canvas: img,
    w: img.width || 76,
    h: img.height || 102,
    ax: (img.width || 76) * 0.5,
    ay: (img.height || 102) * 0.94,
    key: `WF:flag:${flagKey}`,
  };
  FLAG_SPR_CACHE.set(flagKey, spr);
  return spr;
}

const SLOT_CACHE = new Map<string, [number, number][]>();

/** 中军将台留白判定：避开中心空场让筑基阵眼与军旗清晰立于阵心 */
function inCommandCore(x: number, y: number, rx = 68, ry = 60): boolean {
  return Math.hypot(x, y) < 64 || (x * x) / (rx * rx) + (y * y) / (ry * ry) < 1;
}

/** 解析宗门制式袍色用于远景 LOD 棋点，保持与近景弟子明度/色相一致（避免缩放跳闪） */
function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0.55, 0.65, 0.75];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export function formationTintRgb(sid: string, ours: boolean, custom?: CustomSectUniform): { r: number; g: number; b: number; css: string } {
  const sp = sectUniformSpec(sid, undefined, custom);
  const [rr, rg, rb] = hexToRgb01(sp.robe);
  // 78% 宗门原袍色 + 22% 敌我识别基色（温和提亮避免深色魔袍在地面上淹没，同时避免高饱和荧光闪烁）
  const fr = ours ? 0.36 : 0.92;
  const fg = ours ? 0.72 : 0.38;
  const fb = ours ? 0.98 : 0.34;
  const r = Math.min(1, Math.max(0.18, rr * 0.78 + fr * 0.22));
  const g = Math.min(1, Math.max(0.18, rg * 0.78 + fg * 0.22));
  const b = Math.min(1, Math.max(0.18, rb * 0.78 + fb * 0.22));
  const css = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  return { r, g, b, css };
}

/** 按《全面战争》横纵军阵规制生成相对阵心的士兵排布坐标（横列纵排整齐划一 + 阵眼将台留白） */
export function formationOffsets(pattern: FormPattern, count: number): [number, number][] {
  const n = Math.min(200, Math.max(0, count));
  const key = `${pattern}:${n}`;
  const hit = SLOT_CACHE.get(key);
  if (hit) return hit;

  const pts: [number, number][] = [];
  const pushSafe = (x: number, y: number, minGap = 45): boolean => {
    if (inCommandCore(x, y, 66, 56)) return false;
    for (let k = 0; k < pts.length; k++) {
      if (Math.hypot(pts[k][0] - x, pts[k][1] - y) < minGap) return false;
    }
    pts.push([x, y]);
    return true;
  };
  if (pattern === 'circle') {
    // 四象环阵：青龙/白虎/朱雀/玄武四象方簇环护中军将台，十字御道分明，非单调同心圈
    let ring = 0;
    while (pts.length < n && ring < 14) {
      const r = 108 + ring * 56;
      const cap = Math.max(12, Math.floor((2 * Math.PI * r) / 52));
      const gateHalf = 0.16;
      const candidates: number[] = [];
      for (let i = 0; i < cap; i++) {
        const a = (i / cap) * Math.PI * 2 + ring * 0.08;
        const mod90 = Math.abs(((a + Math.PI * 0.25) % (Math.PI * 0.5)) - Math.PI * 0.25);
        if (mod90 < gateHalf) continue;
        candidates.push(a);
      }
      const left = n - pts.length;
      const take = Math.min(left, candidates.length);
      for (let i = 0; i < take && pts.length < n; i++) {
        const a = candidates[Math.floor((i * candidates.length) / take)];
        // 轻微方角化拉扯（超椭圆指数效果），让四象阵簇显出古阵轮廓
        const ca = Math.cos(a), sa = Math.sin(a);
        const sq = 1 + 0.08 * Math.cos(a * 4);
        pushSafe(ca * r * sq, sa * r * 0.84 * sq);
      }
      ring++;
    }
  } else if (pattern === 'crescent') {
    // 偃月阵：前弧重盾弯月 + 双角锐出包抄 + 后翼拱卫中军，弧线层次饱满
    let layer = 0;
    while (pts.length < n && layer < 18) {
      const r = 110 + layer * 54;
      const span = 2.0 + Math.min(0.6, layer * 0.08);
      const countInArc = Math.max(7, Math.floor((r * span) / 48));
      for (let i = 0; i < countInArc && pts.length < n; i++) {
        const frac = countInArc === 1 ? 0 : (i / (countInArc - 1)) * 2 - 1;
        const a = frac * (span * 0.52);
        // 内凹面向前方（+X）：中段靠后拱卫、双角前伸成偃月之势
        const hornForward = Math.pow(Math.abs(frac), 1.45) * 140;
        const x = 148 - layer * 52 + hornForward - Math.cos(a) * 52;
        const y = Math.sin(a) * (r * 1.08);
        pushSafe(x, y);
      }
      layer++;
    }
  } else if (pattern === 'bagua') {
    // 八卦两仪阵：内层阴阳两仪弧拱卫将台 + 外层八卦八角方簇留出八门气脉巷道
    const innerN = Math.min(16, Math.max(8, Math.round(n * 0.16)));
    for (let i = 0; i < innerN && pts.length < n; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const idx = Math.floor(i / 2);
      const a = (side > 0 ? 0.28 : Math.PI + 0.28) + idx * 0.34;
      pushSafe(Math.cos(a) * 102, Math.sin(a) * 86);
    }
    const perCluster = Math.max(4, Math.ceil((n - pts.length) / 8));
    const cols = Math.max(2, Math.ceil(Math.sqrt(perCluster)));
    const rows = Math.max(2, Math.ceil(perCluster / cols));
    let ringStep = 0;
    while (pts.length < n && ringStep < 8) {
      for (let gIdx = 0; gIdx < 8 && pts.length < n; gIdx++) {
        const ga = (gIdx / 8) * Math.PI * 2 + Math.PI / 8;
        const ux = Math.cos(ga), uy = Math.sin(ga);
        const px = -uy, py = ux;
        const baseR = 205 + ringStep * 130;
        for (let r = 0; r < rows && pts.length < n; r++) {
          for (let c = 0; c < cols && pts.length < n; c++) {
            const radOff = baseR + r * 48;
            const latOff = (c - (cols - 1) * 0.5) * 48;
            const wx = ux * radOff + px * latOff;
            const wy = (uy * radOff + py * latOff) * 0.86;
            pushSafe(wx, wy);
          }
        }
      }
      ringStep++;
    }
  } else if (pattern === 'crane') {
    // 鹤翼阵：中军前盾横列 + 左右梯次斜掠展开的两翼纵横编队（整齐梯队，绝不散乱）
    const wingDepth = Math.max(3, Math.min(5, Math.ceil(Math.sqrt(n * 0.18))));
    const rankGap = 52;
    const fileGap = 48;
    // 先排中军后阵/护卫横排（2-3 排对称居中，避开中军将台）
    const centerCandidates: [number, number][] = [];
    for (let r = 0; r < 3; r++) {
      const x = 44 - r * rankGap;
      for (let f = -3; f <= 3; f++) {
        const y = f * fileGap;
        if (inCommandCore(x, y, 68, 58)) continue;
        centerCandidates.push([x, y]);
      }
    }
    const centerBudget = Math.min(centerCandidates.length, Math.max(8, Math.floor(n * 0.26)));
    for (let i = 0; i < centerBudget && pts.length < n; i++) {
      pts.push(centerCandidates[i]);
    }
    // 左右两翼按前倾梯队成排向外伸展
    let step = 0;
    while (pts.length < n && step < 24) {
      for (let d = 0; d < wingDepth && pts.length < n; d++) {
        for (const side of [1, -1]) {
          if (pts.length >= n) break;
          const x = 40 + step * 30 - d * rankGap;
          const y = side * (168 + step * 44 + d * 24);
          if (inCommandCore(x, y, 68, 58)) continue;
          let clash = false;
          for (let k = 0; k < pts.length; k++) {
            if (Math.hypot(pts[k][0] - x, pts[k][1] - y) < 44) { clash = true; break; }
          }
          if (!clash) pts.push([x, y]);
        }
      }
      step++;
    }
  } else if (pattern === 'arrow') {
    // 锋矢阵：尖锥锐出，后翼对称斜切，严格对齐行列步距且留出中军御道
    let row = 0;
    while (pts.length < n && row < 28) {
      const halfCols = Math.min(9, 1 + Math.floor(row * 0.68));
      const x = 226 - row * 52;
      if (row === 0) {
        pts.push([x, 0]);
      } else {
        const startY = row <= 2 ? 26 : 48;
        for (let c = 0; c < halfCols && pts.length < n; c++) {
          const yOff = startY + c * 48;
          if (!inCommandCore(x, yOff, 72, 62)) pts.push([x, yOff]);
          if (pts.length < n && !inCommandCore(x, -yOff, 72, 62)) pts.push([x, -yOff]);
        }
      }
      row++;
    }
  } else {
    // 全战标准横阵（square）：正面宽、纵深齐、横纵行列笔直对齐，纵横均衡不拉成细长条，中心留将台
    const rankGap = 54;
    const fileGap = 46;
    const ranks = Math.max(4, Math.min(10, Math.round(Math.sqrt(n * 0.65))));
    let files = Math.max(5, Math.ceil((n + 6) / ranks));
    // 若奇偶或中军留白导致容量不足，自增列数直到刚好容纳 n 名弟子
    while (ranks * files - 4 < n) files++;
    const xOrigin = ((ranks - 1) * 0.5) * rankGap;
    const yOrigin = ((files - 1) * 0.5) * fileGap;
    for (let r = 0; r < ranks && pts.length < n; r++) {
      const x = xOrigin - r * rankGap;
      for (let f = 0; f < files && pts.length < n; f++) {
        const y = f * fileGap - yOrigin;
        if (inCommandCore(x, y, 66, 56)) continue;
        pts.push([x, y]);
      }
    }
    // 极端大编队兜底补齐至第 ranks+1 排
    let extraR = ranks;
    while (pts.length < n && extraR < ranks + 6) {
      const x = xOrigin - extraR * rankGap;
      for (let f = 0; f < files && pts.length < n; f++) {
        const y = f * fileGap - yOrigin;
        if (inCommandCore(x, y, 66, 56)) continue;
        pts.push([x, y]);
      }
      extraR++;
    }
  }

  if (SLOT_CACHE.size > 64) SLOT_CACHE.clear();
  SLOT_CACHE.set(key, pts);
  return pts;
}

/** 计算战阵当前占地外包半轴（用于地面阵环、四角军旗、AOE 命中与对垒驻阵距离） */
export function formationBounds(pattern: FormPattern, count: number): { rx: number; ry: number } {
  const pts = formationOffsets(pattern, count);
  if (!pts.length) return { rx: 160, ry: 95 };
  let maxX = 110;
  let maxY = 70;
  for (let i = 0; i < pts.length; i++) {
    const ax = Math.abs(pts[i][0]);
    const ay = Math.abs(pts[i][1]);
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
  }
  return { rx: maxX + 46, ry: maxY + 32 };
}

export function formationFaceAngle(f: WarFormation): number {
  if (f.faceAng !== undefined && Number.isFinite(f.faceAng)) return f.faceAng;
  const fx = f.face < 0 ? -1 : 1;
  const fy = (f.faceY ?? 1) < 0 ? -0.45 : 0;
  return Math.atan2(fy, fx);
}

/** 计算旋转后的当前外包椭圆半轴（适应任意连续阵型朝向，按兵力/阵型/朝向缓存避免每帧重复三角函数与分配） */
export function rotatedFormationBounds(f: WarFormation): { rx: number; ry: number } {
  const n = Math.max(12, f.soldiers);
  const ang = formationFaceAngle(f);
  const cache = (f as any)._rotBoundsCache as { n: number; p: WarFormation['pattern']; ang: number; rx: number; ry: number } | undefined;
  if (cache && cache.n === n && cache.p === f.pattern && Math.abs(cache.ang - ang) < 1e-4) {
    return cache;
  }
  const b = formationBounds(f.pattern, n);
  const c = Math.abs(Math.cos(ang));
  const s = Math.abs(Math.sin(ang));
  const rx = b.rx * c + b.ry * s;
  const ry = b.ry * c + b.rx * s * 0.78;
  if (cache) {
    cache.n = n; cache.p = f.pattern; cache.ang = ang; cache.rx = rx; cache.ry = ry;
    return cache;
  }
  const next = { n, p: f.pattern, ang, rx, ry };
  (f as any)._rotBoundsCache = next;
  return next;
}

/** 精确检测世界坐标是否落在旋转后的阵型轮廓范围内（方阵按切角矩形、其余按阵廓贴合） */
export function isPointInFormation(f: WarFormation, wx: number, wy: number, pad = 0): boolean {
  const b = formationBounds(f.pattern, Math.max(12, f.soldiers));
  const maxR = Math.max(b.rx, b.ry) + pad + 18;
  const dx = wx - f.x;
  const rawDy = wy - f.y;
  if (dx > maxR || dx < -maxR || rawDy > maxR || rawDy < -maxR) return false;
  const ang = formationFaceAngle(f);
  const cosA = Math.cos(ang), sinA = Math.sin(ang);
  const ySquash = 1 - 0.22 * Math.abs(sinA);
  const dy = rawDy / Math.max(0.4, ySquash);
  const ox = dx * cosA + dy * sinA;
  const oy = -dx * sinA + dy * cosA;
  if (f.pattern === 'square') {
    const rx = b.rx + pad + 8, ry = b.ry + pad + 8;
    return Math.abs(ox) <= rx && Math.abs(oy) <= ry;
  }
  return Math.hypot(ox / Math.max(1, b.rx + pad + 8), oy / Math.max(1, b.ry + pad + 8)) <= 1;
}

export const FORMATION_FRONT_COS_MIN = 0.30; // ~±72.5° 正面扇区：仅战阵正面范围属于攻击范围

export function isInFormationFrontSector(
  f: WarFormation,
  wx: number,
  wy: number,
  cosMin = FORMATION_FRONT_COS_MIN,
): boolean {
  const ang = formationFaceAngle(f);
  const dx = wx - f.x;
  const dy = wy - f.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return true;
  const fwd = dx * Math.cos(ang) + dy * Math.sin(ang);
  return fwd > 0 && fwd / dist >= cosMin;
}

function wrapAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function slotOffsetRotated(ox0: number, oy0: number, cosA: number, sinA: number, absSinA: number): [number, number] {
  const lx = ox0 * cosA - oy0 * sinA;
  const ly = (ox0 * sinA + oy0 * cosA) * (1 - 0.22 * absSinA);
  return [lx, ly];
}

function ensureSoldierMotion(f: WarFormation) {
  if (!f._sx || f._sx.length < 200) {
    f._sx = new Float32Array(200);
    f._sy = new Float32Array(200);
    f._svx = new Float32Array(200);
    f._svy = new Float32Array(200);
    f._sFlip = new Uint8Array(200);
    f._sFace = new Uint8Array(200);
  }
  if (!f._sInit) {
    const pts = formationOffsets(f.pattern, Math.max(12, f.soldiers));
    const ang = formationFaceAngle(f);
    const cosA = Math.cos(ang), sinA = Math.sin(ang), absSinA = Math.abs(sinA);
    const initFace = facingFromVec(cosA, sinA, cosA < 0);
    const fCode = facingToCode(initFace.facing);
    const fl = initFace.flip ? 1 : 0;
    const musterSpawn = (f.musterT ?? 0) > 0.2;
    for (let i = 0; i < 200; i++) {
      const [ox0, oy0] = pts[i] ?? [0, 0];
      const [lx, ly] = slotOffsetRotated(ox0, oy0, cosA, sinA, absSinA);
      if (musterSpawn) {
        // 集结阶段：士兵自阵后纵队奔赴各自阵位，肉眼可见从整列纵队展开成横阵
        const rearDist = 340 + Math.floor(i / 8) * 44;
        const colLat = ((i % 8) - 3.5) * 42;
        const [rx, ry] = slotOffsetRotated(-rearDist, colLat, cosA, sinA, absSinA);
        f._sx[i] = f.x + rx;
        f._sy[i] = f.y + ry;
      } else {
        f._sx[i] = f.x + lx;
        f._sy[i] = f.y + ly;
      }
      f._svx[i] = 0;
      f._svy[i] = 0;
      f._sFlip[i] = fl;
      f._sFace[i] = fCode;
    }
    f._sInit = true;
  }
}

function stepSoldierMotion(f: WarFormation, dt: number, baseSpeed: number, dAng = 0, _prevAng?: number) {
  ensureSoldierMotion(f);
  const pts = formationOffsets(f.pattern, Math.max(0, f.soldiers));
  const ang = formationFaceAngle(f);
  const cosA = Math.cos(ang), sinA = Math.sin(ang), absSinA = Math.abs(sinA);
  const ySquash = 1 - 0.22 * absSinA;
  const b = formationBounds(f.pattern, Math.max(12, f.soldiers));
  const sx = f._sx!, sy = f._sy!, svx = f._svx!, svy = f._svy!, sFlip = f._sFlip!, sFace = f._sFace!;
  const spread = f.collapsed ? (2.5 - f.collapseT) * 95 : 0;
  const mustering = (f.musterT ?? 0) > 0;
  const maxCatchSpd = mustering ? Math.max(baseSpeed * 2.8, 310) : Math.max(baseSpeed * 2.4, 320);
  const velLerp = Math.min(1, dt * 8);
  const standFace = facingFromVec(cosA, sinA, cosA < 0);
  const standCode = facingToCode(standFace.facing);
  const clampToForm = !f.collapsed && !mustering;
  const turning = clampToForm && (Math.abs(dAng) > 1e-4 || (f.targetFaceAng !== undefined && Math.abs(wrapAngle(f.targetFaceAng - ang)) > 0.12));
  const clampRx = Math.max(40, b.rx - 4);
  const clampRy = Math.max(28, b.ry - 4);
  const clampEll = turning ? 1.28 : 1.06;

  for (let i = 0; i < pts.length; i++) {
    const oldSx = sx[i], oldSy = sy[i];
    const [ox0, oy0] = pts[i];
    const [lx, ly] = slotOffsetRotated(ox0, oy0, cosA, sinA, absSinA);
    const tx = f.x + lx + (spread ? Math.cos(i * 2.1) * spread : 0);
    const ty = f.y + ly + (spread ? Math.sin(i * 2.1) * spread * 0.65 : 0);
    const dx = tx - sx[i], dy = ty - sy[i];
    const d = Math.hypot(dx, dy);
    if (d > 1.5 && dt > 0) {
      const wantSpd = Math.min(maxCatchSpd, Math.max(baseSpeed * (turning ? 1.05 : 0.85), d * 4.2));
      const step = Math.min(d, wantSpd * dt);
      const ux = dx / d, uy = dy / d;
      sx[i] += ux * step;
      sy[i] += uy * step;
    }
    if (clampToForm) {
      // 柔和约束战兵在阵盘包络附近，转向时留出翼侧转弯弧度避免边界抽搐
      const cdx = sx[i] - f.x;
      const cdy = (sy[i] - f.y) / Math.max(0.4, ySquash);
      const lxC = cdx * cosA + cdy * sinA;
      const lyC = -cdx * sinA + cdy * cosA;
      const ellD = Math.hypot(lxC / clampRx, lyC / clampRy);
      if (ellD > clampEll) {
        const s = clampEll / ellD;
        const [clx, cly] = slotOffsetRotated(lxC * s, lyC * s, cosA, sinA, absSinA);
        sx[i] = f.x + clx;
        sy[i] = f.y + cly;
      }
    }
    const tvx = dt > 1e-4 ? (sx[i] - oldSx) / dt : 0;
    const tvy = dt > 1e-4 ? (sy[i] - oldSy) / dt : 0;
    svx[i] += (tvx - svx[i]) * velLerp;
    svy[i] += (tvy - svy[i]) * velLerp;
    const spd = Math.hypot(svx[i], svy[i]);
    if (spd > 14) {
      const mf = facingFromVec(svx[i], svy[i], sFlip[i] === 1);
      sFlip[i] = mf.flip ? 1 : 0;
      sFace[i] = facingToCode(mf.facing);
    } else {
      // 停阵立定时对齐整个方阵的连续朝向角
      sFlip[i] = Math.abs(cosA) > 0.16 ? (cosA < 0 ? 1 : 0) : sFlip[i];
      sFace[i] = standCode;
    }
  }
}

const FLAG_BY_SCHOOL: Partial<Record<School, string>> = {
  剑: 'zf_flag_jin',
  木: 'zf_flag_mu',
  御: 'zf_flag_mu',
  冰: 'zf_flag_shui',
  风: 'zf_flag_shui',
  火: 'zf_flag_huo',
  雷: 'zf_flag_jin',
  土: 'zf_flag_tu',
  魔: 'zf_flag_mo',
};

const OVERLAY_BOXES: [number, number, number, number][] = [];
export function resetFormationOverlayFrame() { OVERLAY_BOXES.length = 0; }

/** 绘制按阵型几何特化的远景兵棋轮廓路径（以战阵本地原点为中心，朝向 +X） */
function formationContourLocalPts(pattern: FormPattern, rx: number, ry: number): [number, number][] {
  if (pattern === 'arrow') {
    return [
      [rx * 1.12, 0],
      [-rx * 0.48, -ry * 1.06],
      [-rx * 1.04, -ry * 0.56],
      [-rx * 0.84, 0],
      [-rx * 1.04, ry * 0.56],
      [-rx * 0.48, ry * 1.06],
    ];
  }
  if (pattern === 'crane') {
    return [
      [rx * 1.04, -ry * 1.06],
      [rx * 0.42, -ry * 0.42],
      [rx * 0.42, ry * 0.42],
      [rx * 1.04, ry * 1.06],
      [0, ry * 1.04],
      [-rx * 0.96, ry * 0.44],
      [-rx * 0.96, -ry * 0.44],
      [0, -ry * 1.04],
    ];
  }
  if (pattern === 'crescent') {
    return [
      [rx * 1.02, -ry * 0.98],
      [rx * 0.34, -ry * 0.38],
      [rx * 0.34, ry * 0.38],
      [rx * 1.02, ry * 0.98],
      [-rx * 0.36, ry * 0.94],
      [-rx * 0.98, ry * 0.46],
      [-rx * 0.98, -ry * 0.46],
      [-rx * 0.36, -ry * 0.94],
    ];
  }
  if (pattern === 'bagua') {
    const out: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      out.push([Math.cos(a) * rx * 1.02, Math.sin(a) * ry * 1.02]);
    }
    return out;
  }
  // 方阵：完整囊括四角弟子与四角旗帜的切角矩形阵域
  const c = Math.min(rx, ry) * 0.14;
  return [
    [-rx + c, -ry],
    [rx - c, -ry],
    [rx, -ry + c],
    [rx, ry - c],
    [rx - c, ry],
    [-rx + c, ry],
    [-rx, ry - c],
    [-rx, -ry + c],
  ];
}

function traceFormationContour(g: CanvasRenderingContext2D, pattern: FormPattern, rx: number, ry: number) {
  g.beginPath();
  if (pattern === 'circle') {
    g.ellipse(0, 0, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
    return;
  }
  if (pattern === 'crane' || pattern === 'crescent') {
    const frontTip = pattern === 'crescent' ? 0.98 : 1.04;
    g.moveTo(rx * frontTip, -ry * 1.02);
    g.quadraticCurveTo(rx * 0.22, -ry * 0.18, rx * frontTip, ry * 1.02);
    g.lineTo(rx * 0.10, ry * 1.02);
    g.quadraticCurveTo(-rx * 1.02, 0, rx * 0.10, -ry * 1.02);
    g.closePath();
    return;
  }
  const pts = formationContourLocalPts(pattern, rx, ry);
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function traceStrategicShape(g: CanvasRenderingContext2D, pattern: FormPattern, rx: number, ry: number) {
  g.beginPath();
  if (pattern === 'arrow') {
    // 锋矢阵：尖锥破阵楔形
    g.moveTo(rx * 1.08, 0);
    g.lineTo(-rx * 0.55, -ry * 0.96);
    g.lineTo(-rx * 0.92, -ry * 0.42);
    g.lineTo(-rx * 0.72, 0);
    g.lineTo(-rx * 0.92, ry * 0.42);
    g.lineTo(-rx * 0.55, ry * 0.96);
    g.closePath();
  } else if (pattern === 'crane' || pattern === 'crescent') {
    // 鹤翼阵 / 偃月阵：双翼/弯弧包抄形
    const tip = pattern === 'crescent' ? 0.92 : 0.85;
    g.moveTo(rx * tip, -ry * 0.96);
    g.quadraticCurveTo(rx * 0.15, -ry * 0.18, rx * tip, ry * 0.96);
    g.lineTo(rx * 0.18, ry * 0.96);
    g.quadraticCurveTo(-rx * 0.92, 0, rx * 0.18, -ry * 0.96);
    g.closePath();
  } else if (pattern === 'bagua') {
    // 八卦两仪阵：正八角玄阵廓形
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = Math.cos(a) * rx * 0.96, py = Math.sin(a) * ry * 0.96;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
  } else if (pattern === 'circle') {
    // 四象环阵：圆角四象方廓
    g.ellipse(0, 0, rx * 0.96, ry * 0.96, 0, 0, Math.PI * 2);
  } else {
    // 方阵：规整重装军阵矩形（微切角）
    const c = Math.min(rx, ry) * 0.22;
    const x0 = -rx * 0.92, x1 = rx * 0.92, y0 = -ry * 0.88, y1 = ry * 0.88;
    g.moveTo(x0 + c, y0); g.lineTo(x1 - c, y0); g.lineTo(x1, y0 + c);
    g.lineTo(x1, y1 - c); g.lineTo(x1 - c, y1); g.lineTo(x0 + c, y1);
    g.lineTo(x0, y1 - c); g.lineTo(x0, y0 + c); g.closePath();
  }
}

function formationCollapseAlpha(f: WarFormation): number {
  const retreatAlpha = f.retreatFadeT !== undefined && f.retreatFadeMax
    ? Math.max(0, Math.min(1, f.retreatFadeT / Math.min(1.5, f.retreatFadeMax * 0.25)))
    : 1;
  if (!f.collapsed) return retreatAlpha;
  const dur = Math.max(2.5, f._collapseDur ?? 16.0);
  const fade = Math.max(0, Math.min(1, (f.collapseT / dur) * 2.8));
  return fade * 0.78 * retreatAlpha;
}

export function triggerFormationCollapse(f: WarFormation, game?: Game) {
  if (f.collapsed) return;
  const dur = 16.0;
  f.collapsed = true;
  f.collapseT = dur;
  f._collapseDur = dur;
  f.moving = false;
  if ((f.leader as any)?.warForm === f) (f.leader as any).warForm = undefined;

  // 保留破阵横尸残骸与折断阵旗，避免军阵破灭瞬间原地凭空消失
  const slots: { x: number; y: number; v: number; fr: 12 | 13; flip: boolean }[] = [];
  const cap = Math.min(32, Math.max(8, f.soldiersMax || 16));
  const ang = formationFaceAngle(f);
  const cosA = Math.cos(ang), sinA = Math.sin(ang), absSinA = Math.abs(sinA);
  if (f._sInit && f._sx && f._sy && f._sx.length > 0) {
    const n = f._sx.length;
    const step = Math.max(1, Math.floor(n / cap));
    for (let i = 0; i < n && slots.length < cap; i += step) {
      slots.push({
        x: f._sx[i] + (Math.random() - 0.5) * 18,
        y: f._sy[i] + (Math.random() - 0.5) * 12,
        v: (i + (i >> 2)) % SHEET_VARIANTS,
        fr: (slots.length & 1) ? 12 : 13,
        flip: Math.random() < 0.5,
      });
    }
  } else {
    const pts = formationOffsets(f.pattern, cap);
    for (let i = 0; i < pts.length; i++) {
      const [ox0, oy0] = pts[i];
      const [lx, ly] = slotOffsetRotated(ox0, oy0, cosA, sinA, absSinA);
      slots.push({
        x: f.x + lx + (Math.random() - 0.5) * 22,
        y: f.y + ly + (Math.random() - 0.5) * 14,
        v: i % SHEET_VARIANTS,
        fr: (i & 1) ? 12 : 13,
        flip: Math.random() < 0.5,
      });
    }
  }
  f._fallenSlots = slots;

  const bounds = formationBounds(f.pattern, Math.max(12, f.soldiersMax));
  game?.combat?.vfx.push({
    kind: 'ring',
    x: f.x,
    y: f.y,
    r: Math.max(160, bounds.rx * 0.95),
    t: 0,
    dur: 0.65,
    color: f.ours ? '140,205,255' : '255,145,105',
    fx: 'shock' as any,
  });
  game?.combat?.texts.push({ x: f.x, y: f.y - 96, s: '战阵破灭，旗折兵散！', color: '#ffd9a0', t: 0, vy: -26 });
}

/** 战阵地面阵环与中军将台圈（置于地面最底层，不打断 WebGL 角色实例化合批；远景自动切换为兵棋军阵底盘） */
export function drawFormationGround(g: CanvasRenderingContext2D, f: WarFormation, t: number, locked = false, z = 1) {
  if (f.soldiers <= 0 && (!f.collapsed || f.collapseT <= 0)) return;
  const baseBounds = formationBounds(f.pattern, f.collapsed ? Math.max(16, Math.round(f.soldiersMax * 0.55)) : Math.max(12, f.soldiers));
  const ang = formationFaceAngle(f);
  const absSinA = Math.abs(Math.sin(ang));
  const ySquash = 1 - 0.22 * absSinA;
  const sh = ensureFormationShield(f);
  const col = f.collapsed ? '155,135,112' : f.ours ? '92,188,255' : '242,102,82';
  const alpha = formationCollapseAlpha(f);

  // 远景（z < 0.38）平滑渐入兵棋阵型轮廓 + 单矢锋向（与内部点阵弟子叠加，绝不退化成孤立单矩形）
  if (z < 0.38) {
    const macroFade = Math.max(0, Math.min(1, (0.38 - z) / 0.14));
    const inv = 1 / Math.max(0.05, z);
    const broken = sh.brokenT > 0;
    const sr = sh.shieldMax > 0 ? Math.max(0, Math.min(1, sh.shield / sh.shieldMax)) : 0;
    g.save();
    g.translate(f.x, f.y + 4);
    g.scale(1, ySquash);
    g.rotate(ang);
    g.globalAlpha *= alpha * (0.35 + 0.65 * macroFade);

    // 轻量战术底衬，突出阵内全员队列点阵
    traceStrategicShape(g, f.pattern, baseBounds.rx, baseBounds.ry);
    g.fillStyle = `rgba(${col},${(f.collapsed ? 0.12 : 0.14) * macroFade})`;
    g.fill();

    // 单道清晰阵廓（有护盾时亮实线，破盾/溃灭时虚线警示，锁定时鎏金加粗）
    g.strokeStyle = locked && !f.collapsed
      ? 'rgba(255,220,115,0.95)'
      : f.collapsed
        ? 'rgba(195,165,132,0.7)'
        : broken
          ? (f.ours ? 'rgba(130,205,255,0.75)' : 'rgba(255,140,110,0.75)')
          : `rgba(${col},${0.58 + sr * 0.3})`;
    g.lineWidth = Math.min(28, (locked ? 2.8 : 1.8) * inv);
    if (f.collapsed || broken) g.setLineDash([7 * inv, 4 * inv]);
    g.stroke();
    g.setLineDash([]);

    if (f.collapsed) {
      // 破阵残骸交叉断戟印记
      const cr = Math.min(baseBounds.rx, baseBounds.ry) * 0.45;
      g.strokeStyle = 'rgba(220,180,135,0.68)';
      g.lineWidth = Math.min(26, 2.0 * inv);
      g.beginPath();
      g.moveTo(-cr, -cr); g.lineTo(cr, cr);
      g.moveTo(-cr, cr); g.lineTo(cr, -cr);
      g.stroke();
    } else {
      // 阵前单笔进攻锋向大箭头（清晰表达军阵朝向与压境方向）
      const tipX = baseBounds.rx + 22 * inv * Math.min(1.4, Math.max(0.6, z * 4.5));
      const headS = Math.min(44, 10 * inv);
      g.fillStyle = locked ? 'rgba(255,224,125,0.95)' : `rgba(${col},0.9)`;
      g.beginPath();
      g.moveTo(tipX + headS * 0.85, 0);
      g.lineTo(tipX - headS * 0.45, -headS * 0.62);
      g.lineTo(tipX - headS * 0.12, 0);
      g.lineTo(tipX - headS * 0.45, headS * 0.62);
      g.closePath();
      g.fill();
    }
    g.restore();
    if (macroFade >= 0.85) return;
  }

  const outerRx = baseBounds.rx + 28;
  const outerRy = baseBounds.ry + 22;

  // 近景（z >= 0.38）：隐藏外侧生硬几何框线，改用柔雾灵韵地晕 + 中军将台阵盘 + 锁定阵角金钩
  g.save();
  g.save();
  g.translate(f.x, f.y + 4);
  g.scale(1, ySquash);
  g.rotate(ang);
  if (!f.collapsed && sh.shield > 0) {
    // 柔散灵气护阵地晕（无生硬多边形外框，仅柔和灵晕渐隐）
    const sr = Math.max(0.2, sh.shield / Math.max(1, sh.shieldMax));
    const maxR = Math.max(outerRx, outerRy);
    g.save();
    g.scale(outerRx / maxR, outerRy / maxR);
    const rg = g.createRadialGradient(0, 0, maxR * 0.25, 0, 0, maxR);
    const rgb = f.ours ? '110,210,255' : '255,165,105';
    rg.addColorStop(0, `rgba(${rgb},${(0.05 + sr * 0.05) * alpha})`);
    rg.addColorStop(0.72, `rgba(${rgb},${(0.09 + sr * 0.08) * alpha})`);
    rg.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, maxR, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  if (f.collapsed) {
    // 近景阵盘碎裂焦痕
    g.globalAlpha *= 0.45 * alpha;
    g.strokeStyle = 'rgba(220,175,115,0.55)';
    g.lineWidth = 2.2;
    for (let k = 0; k < 5; k++) {
      const a0 = k * 1.25 + (f.id % 5) * 0.3;
      g.beginPath();
      g.moveTo(Math.cos(a0) * 18, Math.sin(a0) * 12);
      g.lineTo(Math.cos(a0 + 0.12) * baseBounds.rx * 0.72, Math.sin(a0 + 0.12) * baseBounds.ry * 0.72);
      g.stroke();
    }
  }
  if (locked && !f.collapsed) {
    // 锁定时仅在四角点缀金纹角标与中军金环，不再整块套虚线几何框
    g.globalAlpha = 0.85 * alpha;
    g.strokeStyle = 'rgba(255,214,110,0.92)';
    g.lineWidth = 2.6;
    const tick = 22;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = sx * outerRx * 0.94, cy = sy * outerRy * 0.94;
      g.beginPath();
      g.moveTo(cx - sx * tick, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy - sy * tick);
      g.stroke();
    }
  }
  g.restore();
  // 中军将台阵盘内环与仙道八方微刻、朝向矢标
  g.globalAlpha = (locked ? 0.8 : 0.45) * alpha;
  g.strokeStyle = locked ? 'rgba(255,214,110,0.95)' : `rgba(${col},0.72)`;
  g.lineWidth = locked ? 2.4 : 1.6;
  g.beginPath();
  g.ellipse(f.x, f.y + 4, 70, 44, 0, 0, Math.PI * 2);
  g.stroke();
  if (f.pattern === 'bagua') {
    g.globalAlpha = 0.36 * alpha;
    g.beginPath();
    g.ellipse(f.x, f.y + 4, 52, 32, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const ax = f.x + Math.cos(ang) * 78;
  const ay = f.y + 4 + Math.sin(ang) * 50;
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(ax - Math.cos(ang - 0.5) * 14, ay - Math.sin(ang - 0.5) * 10);
  g.moveTo(ax, ay);
  g.lineTo(ax - Math.cos(ang + 0.5) * 14, ay - Math.sin(ang + 0.5) * 10);
  g.stroke();
  g.restore();
}

/** 战阵上层护阵阵法罩（近景单层柔雾光幕笼罩全阵；远景收起线框穹顶，改绘清晰抗缩放军阵旗牌） */
export function drawFormationOverlay(g: CanvasRenderingContext2D, f: WarFormation, t: number, locked = false, z = 1, noDome = false) {
  if (f.soldiers <= 0 && (!f.collapsed || f.collapseT <= 0)) return;
  const baseBounds = formationBounds(f.pattern, Math.max(12, f.soldiers));
  const ang = formationFaceAngle(f);
  const cosA = Math.cos(ang), sinA = Math.sin(ang), absSinA = Math.abs(sinA);
  const ySquash = 1 - 0.22 * absSinA;
  const sh = ensureFormationShield(f);
  const pat = FORM_PATTERNS.find((p) => p.id === f.pattern) ?? FORM_PATTERNS[0];
  const alpha = formationCollapseAlpha(f);
  const macroView = z < 0.36;

  // 1. 仅近景绘制一层清透柔弧灵气光幕笼罩方阵（取消折线几何棱角底边，保留流畅仙道穹弧）
  if (!noDome && !macroView && !f.collapsed && sh.shield > 0) {
    const sr = Math.max(0.08, Math.min(1, sh.shield / Math.max(1, sh.shieldMax)));
    const hitPulse = f.lastShieldHitT !== undefined && t - f.lastShieldHitT >= 0 && t - f.lastShieldHitT < 0.35
      ? (1 - (t - f.lastShieldHitT) / 0.35)
      : 0;
    const lowFlicker = sr < 0.28 ? (0.8 + 0.2 * Math.sin(t * 22 + f.id)) : 1;
    const baseRx = baseBounds.rx + 26;
    const baseRy = baseBounds.ry + 20;
    const rx = Math.hypot(baseRx * cosA, baseRy * sinA);
    const ry = Math.hypot(baseRx * sinA, baseRy * cosA) * ySquash;
    const domeH = Math.max(124, ry * 0.8);
    const rgb = f.ours ? '110,218,255' : '255,152,92';
    const rimRgb = f.ours ? '185,242,255' : '255,205,148';

    g.save();
    g.globalAlpha *= alpha * lowFlicker;
    const grad = g.createRadialGradient(f.x, f.y - domeH * 0.34, rx * 0.14, f.x, f.y - domeH * 0.1, Math.max(rx, domeH * 1.15));
    grad.addColorStop(0, `rgba(${rgb},${(0.03 + hitPulse * 0.08) * (0.65 + 0.35 * sr)})`);
    grad.addColorStop(0.76, `rgba(${rgb},${(0.09 + hitPulse * 0.12) * (0.65 + 0.35 * sr)})`);
    grad.addColorStop(1, `rgba(${rimRgb},${0.20 + sr * 0.14 + hitPulse * 0.22})`);

    const cRx = baseRx * 1.02, cRy = baseRy * 1.02;
    const thetaExt = Math.atan2(-cRy * sinA, cRx * cosA);
    const ex0 = cRx * Math.cos(thetaExt) * cosA - cRy * Math.sin(thetaExt) * sinA;
    const ey0 = (cRx * Math.cos(thetaExt) * sinA + cRy * Math.sin(thetaExt) * cosA) * ySquash;
    const leftPt: [number, number] = ex0 <= 0 ? [f.x + ex0, f.y + 4 + ey0] : [f.x - ex0, f.y + 4 - ey0];
    const rightPt: [number, number] = ex0 <= 0 ? [f.x - ex0, f.y + 4 - ey0] : [f.x + ex0, f.y + 4 + ey0];
    const thetaRight = ex0 <= 0 ? thetaExt + Math.PI : thetaExt;

    g.beginPath();
    g.moveTo(leftPt[0], leftPt[1]);
    g.bezierCurveTo(leftPt[0], f.y - domeH * 1.14, rightPt[0], f.y - domeH * 1.14, rightPt[0], rightPt[1]);
    const steps = 18;
    for (let s = 1; s <= steps; s++) {
      const th = thetaRight - (s / steps) * Math.PI;
      const px0 = f.x + cRx * Math.cos(th) * cosA - cRy * Math.sin(th) * sinA;
      const py0 = f.y + 4 + (cRx * Math.cos(th) * sinA + cRy * Math.sin(th) * cosA) * ySquash;
      if (py0 >= Math.min(leftPt[1], rightPt[1]) - 6) g.lineTo(px0, py0);
      else {
        const thOpp = thetaRight + (s / steps) * Math.PI;
        g.lineTo(
          f.x + cRx * Math.cos(thOpp) * cosA - cRy * Math.sin(thOpp) * sinA,
          f.y + 4 + (cRx * Math.cos(thOpp) * sinA + cRy * Math.sin(thOpp) * cosA) * ySquash,
        );
      }
    }
    g.closePath();
    g.fillStyle = grad;
    g.fill();

    g.strokeStyle = `rgba(${rimRgb},${0.36 + sr * 0.26 + hitPulse * 0.25})`;
    g.lineWidth = 1.9 + hitPulse * 1.4;
    g.beginPath();
    g.moveTo(leftPt[0], leftPt[1]);
    g.bezierCurveTo(leftPt[0], f.y - domeH * 1.14, rightPt[0], f.y - domeH * 1.14, rightPt[0], rightPt[1]);
    g.stroke();
    g.restore();
  }

  // 2. 战阵中军铭牌、护盾条与灵池条（远景切换为屏幕抗缩放精简兵棋旗牌，全视角自适应防丢）
  if (!f.collapsed && f.soldiers > 0) {
    const broken = sh.brokenT > 0;
    const exhausting = (f.exhaustT ?? 0) > 0;
    const sName = f.sectName || LOC_BY_ID.get(f.sid)?.name || X_BY_ID[f.sid]?.name || f.sid;
    const sideTxt = f.sideLabel || (f.ours ? '我方' : '敌方');
    if (macroView) {
      const k = 1 / Math.max(0.008, z);
      const tf = g.getTransform();
      const pxRatio = Math.abs(tf.a / Math.max(1e-4, z)) || 1;
      const sx = tf.a * f.x + tf.c * f.y + tf.e;
      const sy = tf.b * f.x + tf.d * f.y + tf.f;
      const tag = `${sideTxt}·${sName} · ${pat.name.replace(/阵$/, '')}·${f.soldiers}${broken ? '!' : ''}`;
      g.save();
      g.globalAlpha *= alpha;
      g.font = `bold ${11 * k}px "Noto Serif SC","Songti SC",serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tw = typeof g.measureText === 'function' ? g.measureText(tag).width : tag.length * 11 * k * 0.9;
      const bw = 64 * k;
      const bh = 3.5 * k;
      const boxW = Math.max(bw + 16 * k, tw + 18 * k);
      const boxH = 24 * k;
      const bwScreen = Math.max(96, boxW * z) * pxRatio;
      const bhScreen = 26 * pxRatio;
      // 屏幕空间防重叠避让：上下多档 + 必要时微横错开，最高视角下绝不静默丢弃方队牌
      let offXWorld = 0;
      let offYWorld = 0;
      const stepY = 28 * k;
      const stepX = Math.max(98, boxW * z * 0.55) * k;
      const offsets: [number, number][] = [
        [0, 0], [0, -stepY], [0, stepY],
        [0, -stepY * 2], [0, stepY * 2],
        [-stepX, -stepY], [stepX, -stepY],
        [0, -stepY * 3],
      ];
      let placed = false;
      for (const [ox, oy] of offsets) {
        const xScr = sx + ox * z * pxRatio;
        const yScr = sy + oy * z * pxRatio;
        const bx0s = xScr - bwScreen * 0.5, bx1s = xScr + bwScreen * 0.5;
        const by0s = yScr - bhScreen * 0.5, by1s = yScr + bhScreen * 0.5;
        const hit = OVERLAY_BOXES.some(([ax0, ay0, ax1, ay1]) => !(bx1s < ax0 || bx0s > ax1 || by1s < ay0 || by0s > ay1));
        if (!hit) {
          OVERLAY_BOXES.push([bx0s, by0s, bx1s, by1s]);
          offXWorld = ox;
          offYWorld = oy;
          placed = true;
          break;
        }
      }
      if (!placed) {
        offYWorld = -stepY * 3;
      }

      const cx = f.x + offXWorld;
      const cy = f.y + offYWorld;
      const bx0 = cx - boxW * 0.5;
      const by0 = cy - boxH * 0.5;

      g.fillStyle = 'rgba(16,13,10,0.84)';
      g.beginPath();
      g.roundRect?.(bx0, by0, boxW, boxH, 4 * k);
      if (!g.roundRect) g.rect(bx0, by0, boxW, boxH);
      g.fill();
      g.strokeStyle = locked ? 'rgba(255,216,110,0.95)' : f.ours ? 'rgba(105,195,255,0.85)' : 'rgba(255,125,100,0.85)';
      g.lineWidth = (locked ? 1.8 : 1.1) * k;
      g.stroke();

      const by = by0 + boxH - 3.5 * k - bh;
      const textY = by0 + (by - by0) * 0.5 - 0.5 * k;
      g.fillStyle = broken ? '#ffd078' : f.ours ? '#d6f0ff' : '#ffd2c4';
      g.fillText(tag, cx, textY);

      const bx = cx - bw * 0.5;
      g.fillStyle = 'rgba(8,8,8,0.85)';
      g.fillRect(bx, by, bw, bh);
      const r = broken
        ? Math.max(0, Math.min(1, sh.brokenT / 7.5))
        : Math.max(0, Math.min(1, sh.shield / Math.max(1, sh.shieldMax)));
      g.fillStyle = broken ? '#e06040' : f.ours ? '#5fd4ff' : '#ffab68';
      g.fillRect(bx, by, bw * r, bh);
      g.restore();
      return;
    }

    g.save();
    g.globalAlpha *= alpha;
    g.font = 'bold 15px "Noto Serif SC","Songti SC",serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tag = `${sideTxt}·${sName} · ${pat.name} · 战兵 ${f.soldiers}${broken ? `（破盾 ${sh.brokenT.toFixed(1)}s）` : exhausting ? '（蓄灵调息）' : ''}`;
    const cy = f.y + 38;
    const bw = 152;
    const bh = 8;
    const mph = 5;
    const textW = g.measureText(tag).width;
    const boxW = Math.max(bw + 24, textW + 28);
    const boxH = 44;
    const bx0 = f.x - boxW * 0.5;
    const by0 = cy - 19;

    g.fillStyle = 'rgba(12,10,8,0.82)';
    g.beginPath();
    g.roundRect?.(bx0, by0, boxW, boxH, 6);
    if (!g.roundRect) g.rect(bx0, by0, boxW, boxH);
    g.fill();
    g.strokeStyle = locked ? 'rgba(255,216,110,0.95)' : f.ours ? 'rgba(115,205,255,0.72)' : 'rgba(255,140,110,0.72)';
    g.lineWidth = locked ? 2 : 1.2;
    g.stroke();

    g.lineWidth = 3;
    g.strokeStyle = 'rgba(12,10,8,0.9)';
    g.strokeText(tag, f.x, by0 + 12.5);
    g.fillStyle = broken ? '#ffd078' : exhausting ? '#a8d4f0' : f.ours ? '#c8ebff' : '#ffc5b4';
    g.fillText(tag, f.x, by0 + 12.5);

    const bx = f.x - bw / 2;
    const by = by0 + 25;
    g.fillStyle = 'rgba(8,8,8,0.85)';
    g.fillRect(bx - 1, by - 1, bw + 2, bh + mph + 4);
    if (broken) {
      const r = Math.max(0, Math.min(1, sh.brokenT / 7.5));
      g.fillStyle = '#e06040';
      g.fillRect(bx, by, bw * r, bh);
    } else {
      const r = Math.max(0, Math.min(1, sh.shield / Math.max(1, sh.shieldMax)));
      g.fillStyle = f.ours ? '#5fd4ff' : '#ffab68';
      g.fillRect(bx, by, bw * r, bh);
    }
    const mpR = Math.max(0, Math.min(1, sh.mp / Math.max(1, sh.mpMax)));
    g.fillStyle = exhausting ? '#7a94b0' : '#4a8fe8';
    g.fillRect(bx, by + bh + 2, bw * mpR, mph);
    g.restore();
  }
}

/** 收集战阵（阵盘地面光环 + 四角阵旗 + 百名炼气弟子 + 阵法护罩）进入 Y 排序可绘制队列 */
export function collectFormationDrawables(
  f: WarFormation,
  out: Drawable[],
  view: { left: number; top: number; right: number; bottom: number },
  t: number,
  locked = false,
  opts?: {
    splitLayers?: boolean;
    ren?: {
      pushAtlasSpr?: (...args: any[]) => boolean;
      warmAtlasSpr?: (spr: { canvas: HTMLCanvasElement; w: number; h: number }, key: string) => boolean;
    };
    z?: number;
    dpr?: number;
  },
) {
  if (f.soldiers <= 0 && (!f.collapsed || f.collapseT <= 0)) return;
  const bounds = rotatedFormationBounds(f);
  if (
    f.x < view.left - bounds.rx - 140 ||
    f.x > view.right + bounds.rx + 140 ||
    f.y < view.top - bounds.ry - 220 ||
    f.y > view.bottom + bounds.ry + 180
  ) {
    return;
  }

  ensureFormationShield(f);
  const alpha = formationCollapseAlpha(f);
  const ren = opts?.ren;
  const splitLayers = !!opts?.splitLayers;
  const z = opts?.z ?? 1;
  const dpr = opts?.dpr ?? 1;
  const screenH = 150 * SOLDIER_SCALE * z * dpr;

  // 1. 地面阵环与中军将台微光（非分层模式下直接排入 out）
  if (!splitLayers) {
    out.push({
      y: f.y - bounds.ry - 180,
      draw: (g) => drawFormationGround(g, f, t, locked, z),
    });
  }

  // 2. 四角大旗（随方阵朝向同步旋转，z >= 0.04 即可见大旗标示；阵破后保留折倒歪斜的残旗）
  const flagKey = f.ours ? (FLAG_BY_SCHOOL[f.school] ?? 'zf_flag_shui') : (FLAG_BY_SCHOOL[f.school] ?? 'zf_flag_mo');
  const flagImg = z >= 0.04 ? formationEffectImage(flagKey) : null;
  const fAng = formationFaceAngle(f);
  const fCosA = Math.cos(fAng), fSinA = Math.sin(fAng), fAbsSinA = Math.abs(fSinA);
  if (flagImg) {
    const baseB = formationBounds(f.pattern, Math.max(12, f.soldiers));
    const fxOff = baseB.rx * 0.84;
    const fyOff = baseB.ry * 0.78;
    const fSpr = !f.collapsed && ren?.pushAtlasSpr ? flagFrameSpr(flagKey, flagImg) : null;
    const fScaleX = 76 / Math.max(1, flagImg.width || 76);
    const fScaleY = 102 / Math.max(1, flagImg.height || 102);
    const flagZoomMul = z < 0.14 ? Math.min(1.6, 0.14 / Math.max(0.04, z)) : 1;
    const flagAlpha = alpha * (z < 0.10 ? Math.max(0.45, (z - 0.03) / 0.07) : 1);
    const corners: [number, number][] = [
      [-fxOff, -fyOff],
      [fxOff, -fyOff],
      [-fxOff, fyOff],
      [fxOff, fyOff],
    ];
    for (let ci = 0; ci < corners.length; ci++) {
      const [ox0, oy0] = corners[ci];
      const [ox, oy] = slotOffsetRotated(ox0, oy0, fCosA, fSinA, fAbsSinA);
      const fx = f.x + ox;
      const fy = f.y + oy;
      const fallenTilt = f.collapsed ? (ci % 2 === 0 ? -1.08 : 1.05) : 0;
      const gl: Drawable['gl'] = fSpr && ren?.pushAtlasSpr
        ? (batch, occA) => ren.pushAtlasSpr!(batch, fSpr, fx, fy, fScaleX * flagZoomMul, fScaleY * flagZoomMul, false, 0.88 * flagAlpha * occA, fSpr.key)
        : undefined;
      out.push({
        y: fy,
        k: 'D·战阵旗',
        gl,
        draw: (g) => {
          g.save();
          g.globalAlpha *= (f.collapsed ? 0.72 : 0.88) * flagAlpha;
          if (f.collapsed) {
            g.translate(fx, fy);
            g.rotate(fallenTilt);
            g.drawImage(flagImg, -38 * flagZoomMul, -96 * flagZoomMul, 76 * flagZoomMul, 102 * flagZoomMul);
          } else {
            g.drawImage(flagImg, fx - 38 * flagZoomMul, fy - 96 * flagZoomMul, 76 * flagZoomMul, 102 * flagZoomMul);
          }
          g.restore();
        },
      });
    }
  }

  // 2b. 阵破横尸残骸（远景缩为兵棋残标，中近景显出倒地横尸，不再原地凭空蒸发）
  const sheetCacheLocal = new Map<DiscipleFacing, (HTMLCanvasElement | null)[]>();
  const getSheet = (df: DiscipleFacing, variant: number) => {
    let arr = sheetCacheLocal.get(df);
    if (!arr) {
      arr = [0, 1, 2, 3, 4, 5].map((v) => sectDiscipleSheet(f.sid, undefined, v, f.customUniform, df));
      sheetCacheLocal.set(df, arr);
    }
    return arr[variant] ?? arr[0];
  };

  if (f.collapsed && f._fallenSlots?.length && z >= 0.14) {
    for (const s of f._fallenSlots) {
      if (s.x < view.left - 120 || s.x > view.right + 120 || s.y < view.top - 120 || s.y > view.bottom + 140) continue;
      let gl: Drawable['gl'];
      if (ren?.pushAtlasSpr) {
        const spr = sectDiscipleFrameSpr(f.sid, undefined, s.v, f.customUniform, 'front', s.fr);
        if (spr) {
          gl = (batch, occA) => ren.pushAtlasSpr!(batch, spr, s.x, s.y, 1, 1, s.flip, alpha * 0.9 * occA, spr.key);
        }
      }
      out.push({
        y: s.y,
        k: 'D·战阵兵',
        gl,
        draw: (g) => {
          const sheet = getSheet('front', s.v);
          g.save();
          g.globalAlpha *= alpha * 0.9;
          if (sheet) {
            g.translate(s.x, s.y);
            if (s.flip) g.scale(-1, 1);
            g.drawImage(sheet, s.fr * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.85, SHEET_W, SHEET_H);
          } else {
            g.fillStyle = f.ours ? '#5a8ab0' : '#a85a50';
            g.fillRect(s.x - 10, s.y - 4, 20, 7);
          }
          g.restore();
        },
      });
    }
  }

  // 3. 炼气战兵（全缩放保留完整百人方阵：GPU 实例化合批 + 宗门同色明度对齐的平滑交叉淡入过渡，绝不半途删兵、绝不缩远蒸发）
  const pts = formationOffsets(f.pattern, f.soldiers);
  const spread = f.collapsed ? (2.5 - Math.min(2.5, f.collapseT)) * 95 : 0;
  const casting = !f.collapsed && f.lastVolleyT !== undefined && t - f.lastVolleyT >= 0 && t - f.lastVolleyT < 0.48;
  const hitting = !f.collapsed && f.lastHitAnimT !== undefined && t - f.lastHitAnimT >= 0 && t - f.lastHitAnimT < 0.28;
  const walkStep = Math.floor(t * 7.5) % 6;
  const castStep = casting ? Math.min(2, Math.floor((t - f.lastVolleyT!) * 6.5)) : 0;

  const ang = formationFaceAngle(f);
  const cosA = Math.cos(ang), sinA = Math.sin(ang), absSinA = Math.abs(sinA);
  const hasSimPos = !!f._sInit && !!f._sx && !!f._sy && !!f._svx && !!f._svy && !!f._sFlip && !!f._sFace;
  const fallbackFace = facingFromVec(cosA, sinA, cosA < 0);
  // 平滑 LOD 过渡带（借鉴 vcmf/rts#188）：screenH 在 [7.5, 16] 区间实现精灵↔棋点的交叉淡入，绝不单帧闪烁跳变
  const { spriteFade, dotFade, dotScale, dotRad, wantShadow } = discipleLodParams(z, dpr);
  const tint = formationTintRgb(f.sid, f.ours, f.customUniform);
  const sprMemo = ren?.pushAtlasSpr ? new Map<number, DiscipleFrameSpr | null>() : null;
  const getSprCached = (variant: number, dFace: DiscipleFacing, frame: number): DiscipleFrameSpr | null => {
    if (!sprMemo) return null;
    const fc = dFace === 'front' ? 0 : dFace === 'diagF' ? 1 : dFace === 'side' ? 2 : dFace === 'diagB' ? 3 : 4;
    const mk = (variant << 7) | (fc << 4) | frame;
    let s = sprMemo.get(mk);
    if (s === undefined) {
      s = sectDiscipleFrameSpr(f.sid, undefined, variant, f.customUniform, dFace, frame);
      sprMemo.set(mk, s);
    }
    return s;
  };

  // 弟子列阵立定保持沉稳持阵：中远景仅用待机首帧避免百人抖动与图集频繁换页；近景偶发极轻缓呼吸与微调姿态
  const calmZoom = z < 0.35;
  const idleSoldierFrame = (i: number): number => {
    if (calmZoom) return 0;
    return Math.floor(t * 0.25 + i * 0.83) % 17 === 0 ? 1 : 0;
  };
  const idleBobY = (i: number, moving: boolean): number =>
    (calmZoom || moving || casting || hitting) ? 0 : Math.sin(t * 1.15 + i * 1.37) * 0.65;

  // 全缩放启用 Y 排片合批（中远景 z < 0.22 整阵 1 批；近景 z >= 0.22 最多分 6 条 Y 序横带），大幅削减每帧闭包与 sortByY 耗时
  if (ren?.pushAtlasSpr) {
    type BatchSoldier = { sx: number; sy: number; bobY: number; spr: DiscipleFrameSpr | null; flip: boolean; dFace: DiscipleFacing; variant: number; frame: number };
    const batchSoldiers: BatchSoldier[] = [];
    for (let i = 0; i < pts.length; i++) {
      let sx: number;
      let sy: number;
      let soldierMoving = !!f.moving;
      let flip = fallbackFace.flip;
      let dFace: DiscipleFacing = fallbackFace.facing;

      if (hasSimPos && i < f._sx!.length) {
        sx = f._sx![i];
        sy = f._sy![i];
        const spd = Math.hypot(f._svx![i], f._svy![i]);
        soldierMoving = soldierMoving || spd > 14;
        flip = f._sFlip![i] === 1;
        dFace = codeToFacing(f._sFace![i]);
      } else {
        const [ox0, oy0] = pts[i];
        const [lx, ly] = slotOffsetRotated(ox0, oy0, cosA, sinA, absSinA);
        sx = f.x + lx + (spread ? Math.cos(i * 2.1) * spread : 0);
        sy = f.y + ly + (spread ? Math.sin(i * 2.1) * spread * 0.65 : 0);
      }
      if (sx < view.left - 120 || sx > view.right + 120 || sy < view.top - 120 || sy > view.bottom + 140) continue;
      if (spriteFade <= 0.02) {
        batchSoldiers.push({ sx, sy, bobY: 0, spr: null, flip: false, dFace: 'front', variant: 0, frame: 0 });
        continue;
      }
      const variant = (i + (i >> 2)) % SHEET_VARIANTS;
      const frame = hitting && i % 4 === 0
        ? 11
        : casting
          ? 8 + ((castStep + (i % 2)) % 3)
          : soldierMoving
            ? 2 + ((walkStep + (i % 5)) % 6)
            : idleSoldierFrame(i);
      const bobY = idleBobY(i, soldierMoving);
      const spr = getSprCached(variant, dFace, frame);
      batchSoldiers.push({ sx, sy, bobY, spr, flip, dFace, variant, frame });
    }
    if (batchSoldiers.length) {
      if (spriteFade > 0.02) batchSoldiers.sort((a, b) => a.sy - b.sy);
      const dotSpr = getDotSprite();
      const shadowSpr = wantShadow ? getShadowSprite() : null;
      const bandSize = z < 0.22
        ? batchSoldiers.length
        : z < 0.35
          ? Math.max(24, Math.ceil(batchSoldiers.length / 3))
          : Math.max(12, Math.ceil(batchSoldiers.length / 6));
      for (let start = 0; start < batchSoldiers.length; start += bandSize) {
        const end = Math.min(batchSoldiers.length, start + bandSize);
        const stripY = z < 0.22 ? f.y : batchSoldiers[(start + end - 1) >> 1].sy;
        out.push({
          y: stripY,
          k: 'D·战阵兵',
          count: end - start,
          gl: (batch, occA) => {
            const baseA = alpha * occA;
            const resolved: (DiscipleFrameSpr | null)[] | null = spriteFade > 0.02 ? new Array(end - start).fill(null) : null;
            if (resolved) {
              for (let i = start; i < end; i++) {
                const s = batchSoldiers[i];
                let spr = s.spr;
                if (spr && ren.warmAtlasSpr && !ren.warmAtlasSpr(spr, spr.key)) {
                  const fb1 = getSprCached(0, s.dFace, 0);
                  const fb2 = getSprCached(0, 'front', 0);
                  if (fb1 && ren.warmAtlasSpr(fb1, fb1.key)) spr = fb1;
                  else if (fb2 && ren.warmAtlasSpr(fb2, fb2.key)) spr = fb2;
                  else return false;
                }
                resolved[i - start] = spr;
              }
            }
            if (dotFade > 0.02) {
              const da = baseA * dotFade;
              for (let i = start; i < end; i++) {
                const s = batchSoldiers[i];
                if (!ren.pushAtlasSpr!(batch, dotSpr, s.sx, s.sy - 6, dotScale, dotScale, false, da, 'P2:dot8', tint.r, tint.g, tint.b)) return false;
              }
            }
            if (resolved) {
              const sa = baseA * spriteFade;
              if (shadowSpr) {
                for (let i = start; i < end; i++) {
                  const s = batchSoldiers[i];
                  if (resolved[i - start] && !ren.pushAtlasSpr!(batch, shadowSpr, s.sx, s.sy + 2, 1.0, 1.0, false, sa, 'P2:shadow32')) return false;
                }
              }
              for (let i = start; i < end; i++) {
                const s = batchSoldiers[i];
                const spr = resolved[i - start];
                if (spr && !ren.pushAtlasSpr!(batch, spr, s.sx, s.sy + s.bobY, 1, 1, s.flip, sa, spr.key)) return false;
              }
            }
            return true;
          },
          draw: (g) => {
            for (let i = start; i < end; i++) {
              const s = batchSoldiers[i];
              if (dotFade > 0.02) {
                g.save();
                g.globalAlpha *= alpha * dotFade;
                g.fillStyle = tint.css;
                g.beginPath();
                g.arc(s.sx, s.sy - 6, dotRad, 0, Math.PI * 2);
                g.fill();
                g.restore();
              }
              if (spriteFade > 0.02) {
                const sheet = getSheet(s.dFace, s.variant);
                g.save();
                g.globalAlpha *= alpha * spriteFade;
                if (wantShadow) {
                  g.fillStyle = 'rgba(20,18,14,0.24)';
                  g.beginPath();
                  g.ellipse(s.sx, s.sy + 3, 14, 5, 0, 0, Math.PI * 2);
                  g.fill();
                }
                if (sheet) {
                  g.translate(s.sx, s.sy + s.bobY);
                  if (s.flip) g.scale(-1, 1);
                  g.drawImage(sheet, s.frame * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.85, SHEET_W, SHEET_H);
                } else {
                  g.fillStyle = tint.css;
                  g.fillRect(s.sx - 6, s.sy + s.bobY - 22, 12, 22);
                }
                g.restore();
              }
            }
          },
        });
      }
    }
  } else for (let i = 0; i < pts.length; i++) {
    let sx: number;
    let sy: number;
    let soldierMoving = !!f.moving;
    let flip = fallbackFace.flip;
    let dFace: DiscipleFacing = fallbackFace.facing;

    if (hasSimPos && i < f._sx!.length) {
      sx = f._sx![i];
      sy = f._sy![i];
      const spd = Math.hypot(f._svx![i], f._svy![i]);
      soldierMoving = soldierMoving || spd > 16;
      flip = f._sFlip![i] === 1;
      dFace = codeToFacing(f._sFace![i]);
    } else {
      const [ox0, oy0] = pts[i];
      const [lx, ly] = slotOffsetRotated(ox0, oy0, cosA, sinA, absSinA);
      sx = f.x + lx + (spread ? Math.cos(i * 2.1) * spread : 0);
      sy = f.y + ly + (spread ? Math.sin(i * 2.1) * spread * 0.65 : 0);
    }

    if (sx < view.left - 120 || sx > view.right + 120 || sy < view.top - 120 || sy > view.bottom + 140) continue;
    const variant = (i + (i >> 2)) % SHEET_VARIANTS;
    const frame = hitting && i % 4 === 0
      ? 11
      : casting
        ? 8 + ((castStep + (i % 2)) % 3)
        : soldierMoving
          ? 2 + ((walkStep + (i % 5)) % 6)
          : idleSoldierFrame(i);
    const bobY = idleBobY(i, soldierMoving);

    let gl: Drawable['gl'];
    if (ren?.pushAtlasSpr) {
      const spr = spriteFade > 0.02 ? getSprCached(variant, dFace, frame) : null;
      if (spr && dotFade <= 0.02) {
        gl = (batch, occA) => {
          let useSpr = spr;
          if (ren.warmAtlasSpr && !ren.warmAtlasSpr(useSpr, useSpr.key)) {
            const fb1 = getSprCached(0, dFace, 0);
            const fb2 = getSprCached(0, 'front', 0);
            if (fb1 && ren.warmAtlasSpr(fb1, fb1.key)) useSpr = fb1;
            else if (fb2 && ren.warmAtlasSpr(fb2, fb2.key)) useSpr = fb2;
            else return false;
          }
          return (!wantShadow || ren.pushAtlasSpr!(batch, getShadowSprite(), sx, sy + 2, 1.0, 1.0, false, alpha * occA, 'P2:shadow32'))
            && ren.pushAtlasSpr!(batch, useSpr, sx, sy + bobY, 1, 1, flip, alpha * occA, useSpr.key);
        };
      } else if (spr && dotFade > 0.02) {
        gl = (batch, occA) => {
          let useSpr = spr;
          if (ren.warmAtlasSpr && !ren.warmAtlasSpr(useSpr, useSpr.key)) {
            const fb1 = getSprCached(0, dFace, 0);
            const fb2 = getSprCached(0, 'front', 0);
            if (fb1 && ren.warmAtlasSpr(fb1, fb1.key)) useSpr = fb1;
            else if (fb2 && ren.warmAtlasSpr(fb2, fb2.key)) useSpr = fb2;
            else return false;
          }
          const okDot = ren.pushAtlasSpr!(batch, getDotSprite(), sx, sy - 6, dotScale, dotScale, false, alpha * dotFade * occA, 'P2:dot8', tint.r, tint.g, tint.b);
          const okSh = !wantShadow || ren.pushAtlasSpr!(batch, getShadowSprite(), sx, sy + 2, 1.0, 1.0, false, alpha * spriteFade * occA, 'P2:shadow32');
          const okSpr = ren.pushAtlasSpr!(batch, useSpr, sx, sy + bobY, 1, 1, flip, alpha * spriteFade * occA, useSpr.key);
          return okDot && okSh && okSpr;
        };
      } else {
        gl = (batch, occA) => ren.pushAtlasSpr!(batch, getDotSprite(), sx, sy - 6, dotScale, dotScale, false, alpha * occA, 'P2:dot8', tint.r, tint.g, tint.b);
      }
    }

    out.push({
      y: sy,
      k: 'D·战阵兵',
      gl,
      draw: (g) => {
        if (dotFade > 0.02) {
          g.save();
          g.globalAlpha *= alpha * dotFade;
          g.fillStyle = tint.css;
          g.beginPath();
          g.arc(sx, sy - 6, dotRad, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
        if (spriteFade > 0.02) {
          const sheet = getSheet(dFace, variant);
          g.save();
          g.globalAlpha *= alpha * spriteFade;
          g.fillStyle = 'rgba(20,18,14,0.24)';
          g.beginPath();
          g.ellipse(sx, sy + 3, 14, 5, 0, 0, Math.PI * 2);
          g.fill();
          if (sheet) {
            g.translate(sx, sy + bobY);
            if (flip) g.scale(-1, 1);
            g.drawImage(sheet, frame * SHEET_W, 0, SHEET_W, SHEET_H, -SHEET_W * 0.5, -SHEET_H * 0.85, SHEET_W, SHEET_H);
          } else {
            g.fillStyle = tint.css;
            g.fillRect(sx - 6, sy + bobY - 22, 12, 22);
          }
          g.restore();
        }
      },
    });
  }

  // 4. 阵法护罩与中军铭牌/护盾条/灵池条（非分层模式下直接排入 out）
  if (!splitLayers && (!f.collapsed && (f.soldiers > 0))) {
    out.push({
      y: f.y + bounds.ry + 40,
      draw: (g) => drawFormationOverlay(g, f, t, locked),
    });
  }
}

/** 更新战阵：古阵稳步行军（免疫头领身法瞬移）、对垒驻阵、护盾回充/破盾窗口、灵力蓄阵限制、转向防抖、合击齐射 */
export function tickFormation(f: WarFormation, game: Game, dt: number, peers: readonly WarFormation[] = [], order: BattleOrder = 'charge') {
  if (f.collapsed) {
    if ((f.leader as any)?.warForm === f) (f.leader as any).warForm = undefined;
    f.collapseT = Math.max(0, f.collapseT - dt);
    return;
  }

  if (f.soldiers <= 0) {
    triggerFormationCollapse(f, game);
    return;
  }

  const sh = ensureFormationShield(f);
  const leaderDown = f.leader.dead || f.leader.gone;
  if (!leaderDown) {
    (f.leader as any).warForm = f;
    (f.leader as any).warFormLeader = true;
    f.leader.hx = f.x;
    f.leader.hy = f.y;
  }
  const leaderInCore = !leaderDown && Math.hypot(f.leader.x - f.x, f.leader.y - f.y) <= 95;
  if (leaderDown && !f.leaderFellNote) {
    f.leaderFellNote = true;
    game.combat.texts.push({ x: f.x, y: f.y - 105, s: '阵眼阵亡，护阵灵盾回流减半！', color: f.ours ? '#ffb088' : '#ffe08a', t: 0, vy: -28 });
  }

  // 战阵灵力池（MP）蓄灵 / 调息计时
  if ((f.exhaustT ?? 0) > 0) {
    f.exhaustT = Math.max(0, (f.exhaustT ?? 0) - dt);
  }
  const mpOrderMul = f.ours && order === 'hold' ? 1.3 : 1.0;
  const mpExhaustMul = (f.exhaustT ?? 0) > 0 ? 1.75 : 1.0;
  const leaderCmdMul = leaderInCore ? 1.12 : 1.0;
  f.mp = Math.min(sh.mpMax, (f.mp ?? 0) + sh.mpRegen * (leaderDown ? 0.55 : leaderCmdMul) * mpOrderMul * mpExhaustMul * dt);

  // 护盾回充 / 破盾窗口计时（受击压制回充，灵力耗竭时回盾速度亦下降）
  const orderRegenMul = (f.ours && order === 'hold' ? 1.35 : 1.0) * (f.pattern === 'bagua' ? 1.25 : 1.0);
  const underFireMul = (game.time ?? 0) - (f.lastHitT ?? -99) < 2.2 ? 0.25 : 1.0;
  const mpShieldMul = (f.mp ?? 0) < sh.mpMax * 0.12 ? 0.55 : 1.0;
  if ((f.brokenT ?? 0) > 0) {
    f.brokenT = Math.max(0, (f.brokenT ?? 0) - dt);
    if (f.brokenT <= 0 && f.soldiers > 0) {
      f.shield = Math.round(sh.shieldMax * 0.42);
      game.combat.texts.push({ x: f.x, y: f.y - 95, s: '战阵重凝护盾！', color: f.ours ? '#9be5ff' : '#ffd29a', t: 0, vy: -24 });
    }
  } else if ((f.shield ?? 0) < sh.shieldMax) {
    f.shield = Math.min(sh.shieldMax, (f.shield ?? 0) + sh.shieldRegen * (leaderDown ? 0.45 : leaderCmdMul) * orderRegenMul * underFireMul * mpShieldMul * dt);
  }

  const pat = FORM_PATTERNS.find((q) => q.id === f.pattern) ?? FORM_PATTERNS[0];
  const bounds = rotatedFormationBounds(f);

  if (f.faceAng === undefined) f.faceAng = formationFaceAngle(f);
  if (f.targetFaceAng === undefined) f.targetFaceAng = f.faceAng;

  // --- 1. 免疫头领身法/瞬移/突进，维护稳态行军锚点（由方阵主控进退，消除队长与方阵互相拉扯） ---
  if (f.anchorX === undefined || f.anchorY === undefined) {
    f.anchorX = f.x;
    f.anchorY = f.y;
  }
  const prevLX = f.prevLeaderX ?? f.leader.x;
  const prevLY = f.prevLeaderY ?? f.leader.y;
  const leaderJump = Math.hypot(f.leader.x - prevLX, f.leader.y - prevLY);
  f.prevLeaderX = f.leader.x;
  f.prevLeaderY = f.leader.y;

  // 若单帧位移过大（瞬移/闪现/冲锋）或正在高速突进，战阵暂稳阵脚，绝不跟着全场乱飞
  const leaderSpeed = dt > 0.001 ? leaderJump / dt : 0;
  if (leaderJump > 65 || leaderSpeed > 360 || !!f.leader.windup) {
    f.dashHoldT = Math.max(f.dashHoldT ?? 0, 1.45);
  } else {
    f.dashHoldT = Math.max(0, (f.dashHoldT ?? 0) - dt);
  }

  // 找最近敌阵、优先级集火目标与友阵协同状态，计算对垒驻阵距离与阵营排开
  let nearestFoeForm: WarFormation | null = null;
  let nearestFoeDist = Infinity;
  let nearestFoeMinKeep = 560;
  let focusFoeForm: WarFormation | null = null;
  let focusFoeDist = Infinity;
  let focusScore = -Infinity;
  const hostileForms: { form: WarFormation; dist: number; minKeep: number }[] = [];
  let alliedHealthyAhead = 0;
  let alliedCount = 0;
  let repX = 0;
  let repY = 0;
  let peerPushX = 0;
  let peerPushY = 0;

  for (const o of peers) {
    if (o === f || o.collapsed || o.soldiers <= 0) continue;
    const dxo = f.x - o.x;
    const dyo = f.y - o.y;
    const isHostilePeer = f.skirmishGroup !== undefined && o.skirmishGroup === f.skirmishGroup
      ? o.skirmishSide !== f.skirmishSide
      : o.ours !== f.ours;
    if (isHostilePeer) {
      const d = Math.hypot(dxo, dyo) || 1;
      const ux = dxo / d, uy = dyo / d;
      let standoff: number;
      if (Math.abs(dxo) <= 2600 && Math.abs(dyo) <= 2600) {
        const oRot = rotatedFormationBounds(o);
        const myProj = Math.hypot(ux * bounds.rx, uy * bounds.ry);
        const oProj = Math.hypot(ux * oRot.rx, uy * oRot.ry);
        standoff = f.skirmishGroup !== undefined
          ? Math.max(380, myProj + oProj + 180)
          : Math.max(540, myProj + oProj + 240);
      } else {
        standoff = f.skirmishGroup !== undefined ? 520 : 720;
      }
      hostileForms.push({ form: o, dist: d, minKeep: standoff });
      if (d < nearestFoeDist) {
        nearestFoeDist = d;
        nearestFoeForm = o;
        nearestFoeMinKeep = standoff;
      }
      // 战术集火评分：优先抢杀已破盾 / 护盾残余 < 30% / 灵力耗竭 / 脆皮高攻敌阵
      const oMaxSh = Math.max(1, o.shieldMax ?? 1);
      const oShRatio = (o.shield ?? 0) / oMaxSh;
      let sc = -d * 0.25;
      if ((o.brokenT ?? 0) > 0) sc += 1600;
      else if (oShRatio < 0.3) sc += 750;
      if ((o.exhaustT ?? 0) > 0) sc += 450;
      if (o.pattern === 'arrow' || o.pattern === 'crescent' || o.pattern === 'crane') sc += 220;
      if (o.soldiers < 35) sc += 320;
      if (sc > focusScore) {
        focusScore = sc;
        focusFoeForm = o;
        focusFoeDist = d;
      }
      if (d < standoff) {
        const push = (standoff - d) / standoff;
        repX += ux * push * 340;
        repY += uy * push * 300;
      }
    } else {
      alliedCount++;
      const oMaxSh = Math.max(1, o.shieldMax ?? 1);
      if ((o.brokenT ?? 0) <= 0 && (o.exhaustT ?? 0) <= 0 && (o.shield ?? 0) > oMaxSh * 0.28) {
        alliedHealthyAhead++;
      }
      if (Math.abs(dxo) > 2200 || Math.abs(dyo) > 2200) continue;
      const d = Math.hypot(dxo, dyo) || 1;
      const ux = dxo / d, uy = dyo / d;
      const oRot = rotatedFormationBounds(o);
      // 同阵营严格按真实旋转包围盒分离，横阵纵深各留足 >= 240px 清晰通道
      const sepX = bounds.rx + oRot.rx + 240;
      const sepY = bounds.ry + oRot.ry + 240;
      const ellD = Math.hypot(dxo / sepX, dyo / sepY);
      if (ellD < 1.0) {
        const push = 1.0 - ellD;
        const pux = ellD > 1e-3 ? ux : (f.id % 2 === 0 ? 0.6 : -0.6);
        const puy = ellD > 1e-3 ? uy : (f.id % 2 === 0 ? 0.8 : -0.8);
        const pxv = pux * push * Math.max(260, sepX * 0.58);
        const pyv = puy * push * Math.max(260, sepY * 0.58);
        repX += pxv;
        repY += pyv;
        peerPushX += pxv;
        peerPushY += pyv;
      }
    }
  }
  const primaryFoeForm = focusFoeForm ?? nearestFoeForm;

  // 搜索非自身阵型的散敌作为推进目标（避免友军方阵追着自己队长原地绕圈）
  let nearestLooseFoe: Enemy | null = null;
  if (!nearestFoeForm) {
    let bd = 2600;
    const list = f.ours ? game.combat.enemies : game.combat.allies;
    for (const e of list) {
      if (e.dead || e.gone || e.hideT > 0) continue;
      const d = Math.hypot(e.x - f.x, e.y - f.y);
      if (d < bd) { bd = d; nearestLooseFoe = e; }
    }
  }

  // 保持两条战线堂堂对峙：已进入对垒射程 (foeHold) 时稳住阵脚，且保留横向槽位偏移，绝不向同一点塌缩成竖串
  const hasDeployTarget = f.deployTargetX !== undefined && f.deployTargetY !== undefined;
  const mustering = (f.musterT ?? 0) > 0;
  if (mustering) {
    f.musterT = Math.max(0, (f.musterT ?? 0) - dt);
  }
  const manualTacticLock = f.ours && (order === 'charge' || order === 'hold' || order === 'protect');
  const tacticalActive = !hasDeployTarget && !mustering && !f.holdFire && !manualTacticLock && !f.bystander;
  // 残阵后撤换防：护盾已破或灵力耗竭且另有完好友阵顶在前线时，略微后撤回盾蓄灵
  const needsWithdraw = tacticalActive && !!primaryFoeForm && alliedHealthyAhead >= 1 && ((f.brokenT ?? 0) > 0 || (f.exhaustT ?? 0) > 0);
  // 翼侧包抄迂回：己方多阵并列且翼侧阵型机动性强、敌主阵尚未破盾时，翼阵向敌阵侧翼切入避开正面硬撼
  const isFlankRole = tacticalActive && !needsWithdraw && alliedCount >= 1 && !!primaryFoeForm
    && (f.pattern === 'arrow' || f.pattern === 'crane' || f.pattern === 'crescent' || Math.abs(f.slotLineLat ?? 0) > 120)
    && (primaryFoeForm.brokenT ?? 0) <= 0
    && (primaryFoeForm.shield ?? 0) > (primaryFoeForm.shieldMax ?? 1) * 0.32;
  const flankSide = (f.slotLineLat ?? 0) !== 0 ? Math.sign(f.slotLineLat!) : (f.id % 2 === 0 ? 1 : -1);
  const flankAxis = f.lineAxisAng ?? primaryFoeForm?.faceAng ?? f.faceAng;
  const flankShift = isFlankRole ? flankSide * 420 : 0;

  const wingSpreadX = !hasDeployTarget && primaryFoeForm && f.slotLineLat !== undefined && f.lineAxisAng !== undefined
    ? -Math.sin(f.lineAxisAng) * f.slotLineLat * (isFlankRole ? 0.85 : 0.6)
    : -Math.sin(flankAxis) * flankShift;
  const wingSpreadY = !hasDeployTarget && primaryFoeForm && f.slotLineLat !== undefined && f.lineAxisAng !== undefined
    ? Math.cos(f.lineAxisAng) * f.slotLineLat * (isFlankRole ? 0.85 : 0.6)
    : Math.cos(flankAxis) * flankShift;

  let withdrawX = 0;
  let withdrawY = 0;
  if (needsWithdraw && primaryFoeForm) {
    const wx = f.x - primaryFoeForm.x, wy = f.y - primaryFoeForm.y, wd = Math.hypot(wx, wy) || 1;
    withdrawX = (wx / wd) * 280;
    withdrawY = (wy / wd) * 280;
  }

  const targetAnchorX = hasDeployTarget
    ? f.deployTargetX!
    : f.ours && order === 'protect'
      ? game.player.x
      : primaryFoeForm
        ? primaryFoeForm.x + wingSpreadX + withdrawX
        : !f.ours
          ? (nearestLooseFoe && Math.hypot(nearestLooseFoe.x - f.x, nearestLooseFoe.y - f.y) < Math.hypot(game.player.x - f.x, game.player.y - f.y) ? nearestLooseFoe.x : game.player.x)
          : nearestLooseFoe
            ? nearestLooseFoe.x
            : f.anchorX;
  const targetAnchorY = hasDeployTarget
    ? f.deployTargetY!
    : f.ours && order === 'protect'
      ? game.player.y
      : primaryFoeForm
        ? primaryFoeForm.y + wingSpreadY + withdrawY
        : !f.ours
          ? (nearestLooseFoe && Math.hypot(nearestLooseFoe.x - f.x, nearestLooseFoe.y - f.y) < Math.hypot(game.player.x - f.x, game.player.y - f.y) ? nearestLooseFoe.y : game.player.y)
          : nearestLooseFoe
            ? nearestLooseFoe.y
            : f.anchorY;
  const volleyRange = Math.max(1450, bounds.rx * 2 + 650);
  const dLeadAnchor = Math.hypot(targetAnchorX - f.anchorX, targetAnchorY - f.anchorY);
  const foeHold = !hasDeployTarget && !needsWithdraw && !isFlankRole && nearestFoeForm && nearestFoeDist < Math.min(nearestFoeMinKeep + 120, volleyRange * 0.85);
  const playerHold = !hasDeployTarget && !f.ours && !nearestFoeForm && Math.hypot(targetAnchorX - f.anchorX, targetAnchorY - f.anchorY) < 420;
  if (mustering) {
    // 集结阶段：旗台稳驻待战兵跑入阵位，暂不开拔
    f.anchorX = f.x;
    f.anchorY = f.y;
  } else if (hasDeployTarget) {
    const deploySpd = pat.speed * 1.45;
    const stepD = Math.min(dLeadAnchor, deploySpd * Math.max(0, dt));
    if (dLeadAnchor > 8) {
      f.anchorX += ((targetAnchorX - f.anchorX) / dLeadAnchor) * stepD;
      f.anchorY += ((targetAnchorY - f.anchorY) / dLeadAnchor) * stepD;
    }
  } else if (foeHold && nearestFoeForm) {
    // 锚点回拉至对垒线之外，防止两个对冲阵的 anchor 互相穿透导致间距被压扁
    const dxn = f.x - nearestFoeForm.x, dyn = f.y - nearestFoeForm.y, dn = Math.hypot(dxn, dyn) || 1;
    const minKeep = nearestFoeMinKeep;
    if (dn < minKeep) {
      f.anchorX = nearestFoeForm.x + (dxn / dn) * minKeep;
      f.anchorY = nearestFoeForm.y + (dyn / dn) * minKeep;
    } else {
      f.anchorX = f.x;
      f.anchorY = f.y;
    }
  } else if ((f.dashHoldT ?? 0) <= 0 && !playerHold && !(f.ours && order === 'hold')) {
    if (dLeadAnchor > 80) {
      const followRate = Math.min(1, dt * (f.ours && order === 'protect' ? 1.8 : 0.72));
      // 保留友阵横向间距，不被同一点位向心吸成一团
      f.anchorX += (targetAnchorX + peerPushX * 0.65 - f.anchorX) * followRate;
      f.anchorY += (targetAnchorY + peerPushY * 0.65 - f.anchorY) * followRate;
    }
  } else if (!foeHold && !playerHold && dLeadAnchor > 960 && (f.dashHoldT ?? 0) <= 0 && !(f.ours && order === 'hold')) {
    const followRate = Math.min(1, dt * 0.65);
    f.anchorX += (targetAnchorX + peerPushX * 0.65 - f.anchorX) * followRate;
    f.anchorY += (targetAnchorY + peerPushY * 0.65 - f.anchorY) * followRate;
  }
  if (peerPushX !== 0 || peerPushY !== 0) {
    f.anchorX += peerPushX * Math.min(1, dt * 1.4);
    f.anchorY += peerPushY * Math.min(1, dt * 1.4);
  }

  // 目标中心 = 军阵锚点 + 友/敌排开矢量；实际每帧位移严格受最大行军速度约束
  const tgtX = f.anchorX + repX;
  const tgtY = f.anchorY + repY;
  const mdx = tgtX - f.x;
  const mdy = tgtY - f.y;
  const mDist = Math.hypot(mdx, mdy);
  const orderSpeedMul = f.ours && order === 'charge' ? 1.15 : f.ours && order === 'hold' ? 0.65 : 1;
  const deployStepBase = hasDeployTarget && !mustering ? pat.speed * 1.45 : pat.speed;
  const maxStep = deployStepBase * orderSpeedMul * Math.max(0, dt);

  let stepX = 0;
  let stepY = 0;
  const moveStartDead = f.moving ? 14 : 26;
  if (mDist > moveStartDead && maxStep > 0) {
    const step = Math.min(mDist, maxStep);
    stepX = (mdx / mDist) * step;
    stepY = (mdy / mDist) * step;
    f.x += stepX;
    f.y += stepY;
  }
  const moveSpd = dt > 1e-4 ? Math.hypot(stepX, stepY) / dt : 0;
  if (mDist > (f.moving ? 16 : 30) && moveSpd > 26) {
    f.moving = true;
    f._moveHoldT = 0.28;
  } else {
    f._moveHoldT = Math.max(0, (f._moveHoldT ?? 0) - dt);
    if (f._moveHoldT <= 0 || mDist <= 12) f.moving = false;
  }

  // --- 2. 连续平滑转向：以战术接敌方向为主、仅长途开拔时随行进转向，滞回防抖杜绝抽搐 ---
  f.faceTurnCd = Math.max(0, (f.faceTurnCd ?? 0) - dt);
  const underRecentFlankHit = (game.time ?? 0) - (f.lastHitT ?? -99) < 1.5 && nearestFoeForm && !isInFormationFrontSector(f, nearestFoeForm.x, nearestFoeForm.y);
  if (underRecentFlankHit && f.faceTurnCd > 0.35) f.faceTurnCd = 0.35;
  const longMarching = f.moving && !foeHold && !playerHold && mDist > 120 && moveSpd > 48 && Math.hypot(stepX, stepY) > 1.2 && (!nearestFoeForm || nearestFoeDist > 1100);
  if (longMarching && f.faceTurnCd <= 0) {
    const marchAng = Math.atan2(stepY, stepX);
    if (Math.abs(wrapAngle(marchAng - f.targetFaceAng)) > 0.30) {
      f.faceTurnCd = Math.cos(marchAng) * Math.cos(f.faceAng) < 0 ? 1.25 : 0.75;
      f.targetFaceAng = marchAng;
    }
  } else if (f.faceTurnCd <= 0) {
    let lookX: number | null = null;
    let lookY: number | null = null;
    const lookForm = underRecentFlankHit ? nearestFoeForm : (primaryFoeForm && focusFoeDist < volleyRange * 1.1 ? primaryFoeForm : nearestFoeForm);
    if (lookForm) {
      lookX = lookForm.x;
      lookY = lookForm.y;
    } else if (!f.ours) {
      lookX = game.player.x;
      lookY = game.player.y;
    } else if (nearestLooseFoe) {
      lookX = nearestLooseFoe.x;
      lookY = nearestLooseFoe.y;
    }
    if (lookX !== null && lookY !== null) {
      const diffX = lookX - f.x;
      const diffY = lookY - f.y;
      const prevCos = Math.cos(f.faceAng);
      const wantAng = Math.atan2(diffY, diffX);
      const wantCos = Math.cos(wantAng);
      // 水平越线 <120px 滞回防抖：避免敌阵微幅左右错位时来回转面
      if (Math.abs(diffX) > 120 || wantCos * prevCos >= 0) {
        if (Math.abs(wrapAngle(wantAng - f.targetFaceAng)) > 0.30) {
          f.targetFaceAng = wantAng;
          f.faceTurnCd = wantCos * prevCos < 0 ? 1.35 : 0.80;
        }
      } else if (Math.abs(diffY) > 110) {
        const clampedX = prevCos >= 0 ? Math.max(12, Math.abs(diffX)) : -Math.max(12, Math.abs(diffX));
        const clampedAng = Math.atan2(diffY, clampedX);
        if (Math.abs(wrapAngle(clampedAng - f.targetFaceAng)) > 0.30) {
          f.targetFaceAng = clampedAng;
          f.faceTurnCd = 0.80;
        }
      }
    }
  }

  // 有界角速度连续旋阵（0.72 rad/s，转半圈约 4.3 秒，战兵随阵逐步走位旋面而非瞬间抽搐）
  const prevFaceAng = f.faceAng;
  const angDiff = wrapAngle(f.targetFaceAng - f.faceAng);
  const maxTurn = 0.72 * Math.max(0, dt);
  if (Math.abs(angDiff) <= maxTurn) f.faceAng = f.targetFaceAng;
  else f.faceAng = wrapAngle(f.faceAng + Math.sign(angDiff) * maxTurn);
  const dAng = wrapAngle(f.faceAng - prevFaceAng);

  const fCos = Math.cos(f.faceAng), fSin = Math.sin(f.faceAng);
  if (fCos > 0.2) f.face = 1;
  else if (fCos < -0.2) f.face = -1;
  if (fSin < -0.28) f.faceY = -1;
  else if (fSin > 0.18) f.faceY = 1;

  stepSoldierMotion(f, Math.max(0, dt), pat.speed * orderSpeedMul, dAng, prevFaceAng);

  if (f.soldiers <= 0) return;
  if (f.holdFire || mustering) {
    f.volleyCd = Math.max(f.volleyCd, 0.45);
    return;
  }

  // --- 3. 古代分阵型合击齐射（仅战阵正面扇区属于攻击范围；敌人在阵后方时需先旋阵正面接敌） ---
  f.volleyCd -= dt;
  if (f.volleyCd <= 0 && (f.exhaustT ?? 0) <= 0) {
    const p = game.player;
    const combat = game.combat;
    let tx = p.x;
    let ty = p.y - 36;
    let targetEnemy: Enemy | undefined;
    let bestD = volleyRange;
    let found = false;

    // 挑选正面扇区射程内评分最高的敌方战阵（优先集火已破盾/残盾敌阵）
    let volleyFoeForm: WarFormation | null = null;
    let volleyFoeScore = -Infinity;
    for (const h of hostileForms) {
      if (h.dist >= volleyRange || !isInFormationFrontSector(f, h.form.x, h.form.y)) continue;
      const oMaxSh = Math.max(1, h.form.shieldMax ?? 1);
      const sc = -h.dist * 0.25 + ((h.form.brokenT ?? 0) > 0 ? 1600 : (h.form.shield ?? 0) / oMaxSh < 0.3 ? 750 : 0) + (h.form.soldiers < 35 ? 320 : 0);
      if (sc > volleyFoeScore) {
        volleyFoeScore = sc;
        volleyFoeForm = h.form;
      }
    }
    const foeInFront = !!volleyFoeForm;
    const closeThreatR = foeInFront ? 460 : volleyRange;
    if (f.skirmishGroup !== undefined && f.bystander) {
      // 旁观局部试探：只对正面扇区内的敌对试探阵互射，不误击玩家
      if (foeInFront && volleyFoeForm) {
        tx = volleyFoeForm.x;
        ty = volleyFoeForm.y - 30;
        targetEnemy = volleyFoeForm.leader;
        found = true;
      }
    } else if (f.ours) {
      for (const e of combat.enemies) {
        if (e.dead || e.hideT > 0) continue;
        if (!isInFormationFrontSector(f, e.x, e.y)) continue;
        const d = Math.hypot(e.x - f.x, e.y - f.y);
        if (d < Math.min(bestD, closeThreatR)) { bestD = d; tx = e.x; ty = e.y - 36; targetEnemy = e; found = true; }
      }
    } else {
      if (isInFormationFrontSector(f, p.x, p.y)) {
        const dp = Math.hypot(p.x - f.x, p.y - f.y);
        if (dp < Math.min(bestD, closeThreatR)) { bestD = dp; tx = p.x; ty = p.y - 36; found = true; }
      }
      for (const a of combat.allies) {
        if (a.dead || a.gone) continue;
        if (!isInFormationFrontSector(f, a.x, a.y)) continue;
        const d = Math.hypot(a.x - f.x, a.y - f.y);
        if (d < Math.min(bestD, closeThreatR)) { bestD = d; tx = a.x; ty = a.y - 36; targetEnemy = a; found = true; }
      }
    }
    // 对面正面扇区有敌方战阵时优先列阵集火轰击高威胁/破盾敌阵（兵对兵）
    if ((!found || (foeInFront && bestD >= 420)) && foeInFront && volleyFoeForm) {
      tx = volleyFoeForm.x;
      ty = volleyFoeForm.y - 30;
      targetEnemy = volleyFoeForm.leader;
      found = true;
    }

    if (found) {
      const shots = f.skirmishGroup !== undefined
        ? Math.max(2, Math.min(5, Math.round(f.soldiers / 2)))
        : Math.max(4, Math.min(12, Math.round(f.soldiers / 18)));
      const volleyCost = f.skirmishGroup !== undefined
        ? Math.max(12, Math.round(10 + shots * 2.5))
        : Math.max(24, Math.round(18 + shots * 3.5));
      if ((f.mp ?? 0) < volleyCost) {
        f.exhaustT = 3.2;
        f.volleyCd = 1.2;
        combat.texts.push({ x: f.x, y: f.y - bounds.ry - 22, s: `${pat.name}·灵竭蓄阵`, color: '#9ed0f5', t: 0, vy: -24 });
        return;
      }
      f.mp = Math.max(0, (f.mp ?? 0) - volleyCost);
      const totalDmg = (14 + 4.2 * Math.sqrt(f.soldiers)) * f.doctrineAtk * pat.atk;
      const perDmg = Math.max(4, totalDmg / shots);
      const col = EL_COL[f.school] ?? (f.ours ? '130,210,255' : '255,140,95');
      const ang0 = Math.atan2(ty - (f.y - 30), tx - f.x);
      f.lastVolleyT = game.time ?? 0;

      for (let i = 0; i < shots; i++) {
        let ox = f.x;
        let oy = f.y - 32;
        let a = ang0;
        if (f.pattern === 'crane') {
          // 鹤翼阵：左右两翼翼尖交叉齐射，包抄收束
          const wing = i % 2 === 0 ? 1 : -1;
          const slot = Math.floor(i / 2) - shots * 0.25;
          ox = f.x + f.face * (bounds.rx * 0.25) + slot * 14 * f.face;
          oy = f.y - 30 + wing * (bounds.ry * 0.52);
          a = Math.atan2(ty - oy, tx - ox) + (Math.random() - 0.5) * 0.04;
        } else if (f.pattern === 'crescent') {
          // 偃月阵：弯弧双角前伸合围，向阵前一点交叉攒射
          const frac = shots <= 1 ? 0 : (i / (shots - 1)) * 2 - 1;
          ox = f.x + f.face * (bounds.rx * (0.18 + Math.abs(frac) * 0.36));
          oy = f.y - 30 + frac * (bounds.ry * 0.68);
          a = Math.atan2(ty - oy, tx - ox) + (Math.random() - 0.5) * 0.035;
        } else if (f.pattern === 'bagua') {
          // 八卦两仪阵：八门方位点轮番齐鸣，兼顾控场覆面
          const ga = (i / Math.max(1, shots)) * Math.PI * 2 + (game.time ?? 0) * 0.6;
          ox = f.x + Math.cos(ga) * (bounds.rx * 0.42);
          oy = f.y - 30 + Math.sin(ga) * (bounds.ry * 0.42);
          a = Math.atan2(ty - oy, tx - ox) + (Math.random() - 0.5) * 0.05;
        } else if (f.pattern === 'arrow') {
          // 锋矢阵：自锥尖集中齐射，弹道更密更准
          const spread = (i - (shots - 1) / 2) * 0.045;
          ox = f.x + f.face * (bounds.rx * 0.45);
          oy = f.y - 32 + (i - (shots - 1) / 2) * 10;
          a = ang0 + spread;
        } else if (f.pattern === 'circle') {
          // 四象环阵：沿阵环面向敌侧扇形齐发
          const spread = (i - (shots - 1) / 2) * 0.11;
          a = ang0 + spread;
          ox = f.x + Math.cos(a) * (bounds.rx * 0.45);
          oy = f.y - 30 + Math.sin(a) * (bounds.ry * 0.45);
        } else {
          // 方阵：前排横列齐射平推
          const spread = (i - (shots - 1) / 2) * 0.075;
          a = ang0 + spread;
          ox = f.x + f.face * (bounds.rx * 0.35) + Math.cos(a + Math.PI / 2) * ((i - (shots - 1) / 2) * 20);
          oy = f.y - 32 + Math.sin(a + Math.PI / 2) * ((i - (shots - 1) / 2) * 14);
        }

        const sp = f.pattern === 'arrow' ? 820 : f.pattern === 'crescent' ? 780 : 740;
        const formMul = f.pattern === 'arrow' ? 1.25 : f.pattern === 'crescent' ? 1.18 : f.pattern === 'crane' ? 1.12 : f.pattern === 'bagua' ? 1.08 : 1.0;
        const perFormDmg = (totalDmg * 0.72 * formMul) / Math.max(1, shots);
        const enemyForm = (targetEnemy as any)?.warForm as WarFormation | undefined;
        const enemyShielded = !!(enemyForm && !enemyForm.collapsed && (enemyForm.shield ?? 0) > 0);
        combat.projs.push({
          x: ox,
          y: oy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0,
          max: Math.max(1.8, (volleyRange + 180) / sp),
          dmg: perDmg,
          formDmg: perFormDmg,
          formRealm: Math.max(1, (f.realm ?? 2) - 1),
          fromForm: f.id,
          targetForm: foeInFront ? (volleyFoeForm ?? undefined) : undefined,
          fx: f.school === '剑' ? 'sword' : f.school === '火' ? 'fireball' : f.school === '冰' ? 'icicle' : 'talisman',
          color: col,
          fac: 'e',
          ally: f.ours,
          src: f.leader,
          tk: enemyShielded ? undefined : targetEnemy,
          realm: 1,
          stCh: 0,
          pierce: false,
          homing: false,
          hit: new Set(),
          r: 18,
          aoe: 0,
          school: f.school,
          size: 0.9,
          trail: [],
          trailLen: 4,
        } as any);
      }

      combat.vfx.push({ kind: 'ring', x: f.x, y: f.y, r: Math.min(130, bounds.rx * 0.55), t: 0, dur: 0.35, color: col, fx: 'shock' as any });
      if (f.soldiers >= 25) {
        combat.texts.push({ x: f.x, y: f.y - bounds.ry - 18, s: `${pat.name}·齐射！`, color: f.ours ? '#a8deff' : '#ffc19e', t: 0, vy: -28 });
      }
      if (leaderInCore && !f.leader.cast) {
        f.leader.cdRanged = Math.min(f.leader.cdRanged, 0.12);
        if (targetEnemy && !targetEnemy.dead) { f.leader.aggro = true; f.leader.tankRef = targetEnemy; f.leader.tankT = 2.0; }
      }
      f.volleyCd = ((f.ours && order === 'charge' ? 2.55 : 3.05) + Math.random() * 0.75) * (leaderInCore ? 0.92 : 1);
    } else {
      f.volleyCd = 0.5;
    }
  }
}

/** 战阵败兵定向御风/化虹撤退（面向己方大营/后方，真逃出视野外再消散） */
export function spawnFormationRetreaters(f: WarFormation, count: number, game?: Game) {
  const n = Math.min(64, Math.max(0, count));
  if (n <= 0) return;
  let rdx = f.retreatX !== undefined ? f.retreatX - f.x : -f.face * 420;
  let rdy = f.retreatY !== undefined ? f.retreatY - f.y : 0;
  if (f.retreatX === undefined && game?.player) {
    rdx = f.x - game.player.x;
    rdy = f.y - game.player.y;
  }
  const len = Math.hypot(rdx, rdy) || 1;
  const ux = rdx / len, uy = rdy / len;
  const bounds = formationBounds(f.pattern, Math.max(12, f.soldiers));
  for (let i = 0; i < n; i++) {
    const spread = (Math.random() - 0.5) * 0.62;
    const cs = Math.cos(spread), sn = Math.sin(spread);
    const vx0 = ux * cs - uy * sn, vy0 = ux * sn + uy * cs;
    const highRealm = i === 0 && (f.realm ?? 2) >= 2 && f.soldiers <= 0;
    const sp = highRealm ? 640 + Math.random() * 150 : 280 + Math.random() * 110;
    const dur = highRealm ? 14.0 + Math.random() * 3.0 : 20.0 + Math.random() * 4.0;
    if (RETREAT_POOL.length >= RETREAT_MAX) RETREAT_POOL.shift();
    RETREAT_POOL.push({
      x: f.x + (Math.random() - 0.5) * bounds.rx * 1.25,
      y: f.y + (Math.random() - 0.5) * bounds.ry * 1.05,
      vx: vx0 * sp,
      vy: vy0 * sp * 0.72,
      z: highRealm ? 18 : 4,
      vz: highRealm ? 95 : 8,
      sid: f.sid,
      variant: i % SHEET_VARIANTS,
      face: vx0 >= 0 ? 1 : -1,
      realm: highRealm ? Math.max(2, f.realm ?? 2) : 1,
      t: dur,
      dur,
      custom: f.customUniform,
    });
  }
}

/** v0.73：战阵受击（先削护阵灵盾——未破盾不死兵；同境相持；跨两境溢碎直秒；多法术异流派触发共振破盾） */
export function applyFormationDamage(
  f: WarFormation,
  rawDmg: number,
  attackerRealm: number,
  game?: Game,
  opts?: { school?: School; order?: BattleOrder; fromNpc?: boolean; hitX?: number; hitY?: number }
): number {
  if (f.collapsed || f.soldiers <= 0 || rawDmg <= 0) return 0;
  const sh = ensureFormationShield(f);
  const pat = FORM_PATTERNS.find((q) => q.id === f.pattern) ?? FORM_PATTERNS[0];
  const realmMul = attackerRealm >= 5 ? 2.8 : attackerRealm >= 4 ? 2.1 : attackerRealm === 3 ? 1.4 : attackerRealm === 2 ? 1.05 : 0.9;
  const bounds = formationBounds(f.pattern, f.soldiers);
  const circleGuard = (f.pattern === 'circle' || f.pattern === 'bagua') && !f.leader.dead && Math.hypot(f.leader.x - f.x, f.leader.y - f.y) <= bounds.rx * 0.95 ? 1.12 : 1.0;
  const holdDef = f.ours && opts?.order === 'hold' ? 1.2 : 1.0;

  let comboMul = 1.0;
  const now = game?.time ?? 0;
  if (opts?.school && f.lastHitSchool && f.lastHitSchool !== opts.school && now - (f.lastHitT ?? -99) <= 2.6) {
    comboMul = f.pattern === 'circle' ? 1.55 : f.pattern === 'bagua' ? 1.45 : 1.35;
    game?.combat?.texts.push({ x: f.x, y: f.y - 86, s: `阵盾共振 ×${comboMul.toFixed(2)}！`, color: '#9ff2ff', t: 0, vy: -30 });
  }
  let weakMul = 1.0;
  if (opts?.hitX !== undefined && opts?.hitY !== undefined) {
    const ang = formationFaceAngle(f);
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    const ySquash = 1 - 0.22 * Math.abs(sinA);
    const dx = opts.hitX - f.x, dy = (opts.hitY - f.y) / Math.max(0.4, ySquash);
    const lx = dx * cosA + dy * sinA;
    const ly = -dx * sinA + dy * cosA;
    if (f.pattern === 'arrow' && (lx < -bounds.rx * 0.1 || Math.abs(ly) > bounds.ry * 0.48)) {
      weakMul = 1.35;
      if (!opts.fromNpc && Math.random() < 0.35) game?.combat?.texts.push({ x: f.x, y: f.y - 98, s: '破锋矢侧翼 ×1.35！', color: '#ffd98a', t: 0, vy: -28 });
    } else if (f.pattern === 'crane' && Math.hypot(lx, ly) < bounds.rx * 0.45) {
      weakMul = 1.32;
      if (!opts.fromNpc && Math.random() < 0.35) game?.combat?.texts.push({ x: f.x, y: f.y - 98, s: '直插鹤翼中军 ×1.32！', color: '#ffd98a', t: 0, vy: -28 });
    } else if (f.pattern === 'crescent' && lx < -bounds.rx * 0.28) {
      weakMul = 1.3;
      if (!opts.fromNpc && Math.random() < 0.35) game?.combat?.texts.push({ x: f.x, y: f.y - 98, s: '抄击偃月阵背 ×1.30！', color: '#ffd98a', t: 0, vy: -28 });
    }
  }
  f.lastHitT = now;
  if (opts?.school) f.lastHitSchool = opts.school;

  const effectiveDmg = (rawDmg * realmMul * comboMul * weakMul) / (pat.def * circleGuard * holdDef);
  const realmGap = attackerRealm - sh.realm;
  let spillDmg = effectiveDmg;

  if ((f.shield ?? 0) > 0) {
    const absorbed = Math.min(f.shield!, effectiveDmg);
    f.shield = Math.max(0, f.shield! - absorbed);
    if (f.shield > 0) {
      // 护盾未破：吸收全额伤害，不死一兵一卒
      f.lastShieldHitT = now;
      if (Math.random() < 0.45) {
        game?.combat?.vfx.push({ kind: 'ring', x: f.x, y: f.y, r: Math.max(90, bounds.rx * 0.7), t: 0, dur: 0.28, color: f.ours ? '120,215,255' : '255,170,105', fx: 'shock' as any });
      }
      if (!opts?.fromNpc) {
        game?.combat?.texts.push({ x: f.x + (Math.random() - 0.5) * 56, y: f.y - 54, s: `阵盾 -${Math.max(1, Math.round(absorbed))}`, color: '#a8e2ff', t: 0, vy: -34 });
      }
      return 0;
    }
    // 护盾刚破碎：开启 7.5s 破盾窗口
    f.brokenT = 7.5;
    game?.combat?.vfx.push({ kind: 'ring', x: f.x, y: f.y, r: Math.max(150, bounds.rx * 0.9), t: 0, dur: 0.55, color: '255,215,120', fx: 'shock' as any });
    game?.combat?.texts.push({ x: f.x, y: f.y - 102, s: '护阵灵盾破碎！', color: f.ours ? '#ff9d80' : '#ffe38c', t: 0, vy: -30 });
    // 同阶或仅高一阶破盾只开破盾窗口不溢杀；跨两境以上绝对碾压时溢出伤害直穿阵内士兵（非玩家流弹限幅，免开战瞬间清场）
    if (realmGap < 2) return 0;
    spillDmg = Math.max(0, effectiveDmg - absorbed) * 1.45;
    if (spillDmg <= 0) return 0;
  }

  let cut = Math.min(f.soldiers, Math.max(1, Math.round(spillDmg / 22)));
  if (opts?.fromNpc) cut = Math.min(cut, Math.max(4, Math.round(f.soldiers * 0.14)));
  if (cut <= 0) return 0;

  f.lastHitAnimT = now;
  const dead = Math.round(cut * (f.extinction ? 0.48 : 0.22));
  const inj = Math.round(cut * (f.extinction ? 0.32 : 0.48));
  const rout = Math.max(0, cut - dead - inj);

  // 战损落地生成横尸（环形缓冲池控量，按真实阵兵坐标散布，一次性破阵/秒杀时留足战场横尸）
  const collapsedNow = f.soldiers - cut <= 0;
  const corpseTarget = collapsedNow ? Math.min(cut, dead + inj) : dead;
  if (corpseTarget > 0) {
    const pts = formationOffsets(f.pattern, Math.max(12, f.soldiers));
    const corpseN = Math.min(corpseTarget, 180);
    const ang = formationFaceAngle(f);
    const cosA = Math.cos(ang), sinA = Math.sin(ang), absSinA = Math.abs(sinA);
    const totalSlots = Math.max(1, pts.length);
    for (let i = 0; i < corpseN; i++) {
      const slotIdx = Math.max(0, totalSlots - 1 - Math.floor((i * totalSlots) / corpseN) % totalSlots);
      let cx: number, cy: number;
      if (f._sInit && f._sx && f._sy && slotIdx < f._sx.length) {
        cx = f._sx[slotIdx] + (Math.random() - 0.5) * 14;
        cy = f._sy[slotIdx] + (Math.random() - 0.5) * 10;
      } else {
        const [ox0, oy0] = pts[slotIdx] ?? [0, 0];
        const [lx, ly] = slotOffsetRotated(ox0, oy0, cosA, sinA, absSinA);
        cx = f.x + lx + (Math.random() - 0.5) * 18;
        cy = f.y + ly + (Math.random() - 0.5) * 12;
      }
      if (CORPSE_POOL.length >= CORPSE_MAX) CORPSE_POOL.shift();
      CORPSE_POOL.push({
        x: cx,
        y: cy,
        sid: f.sid,
        variant: i % SHEET_VARIANTS,
        frame: (i & 1) ? 12 : 13,
        face: Math.random() < 0.5 ? 1 : -1,
        t: 9.0,
        dur: 9.0,
        custom: f.customUniform,
      });
    }
  }

  f.soldiers -= cut;
  f.deadCount += dead;
  f.injCount += inj;
  f.routedCount += rout;

  if (rout > 0) spawnFormationRetreaters(f, Math.min(rout, 48), game);

  game?.combat?.texts.push({
    x: f.x + (Math.random() - 0.5) * 70,
    y: f.y - 68,
    s: `-${cut} 战兵`,
    color: f.ours ? '#ff9d8f' : '#ffe38c',
    t: 0,
    vy: -36,
  });

  if (f.soldiers <= 0) {
    const extraRout = rout > 0 ? Math.min(12, Math.max(4, Math.round(cut * 0.08))) : 14;
    spawnFormationRetreaters(f, extraRout, game);
    triggerFormationCollapse(f, game);
  }
  return cut;
}

/** 战后撤离/归营行军更新：返回 true 表示仍在场行进，false 表示已入营或真正走出视野外 */
export function tickPostFormation(f: WarFormation, dt: number): boolean {
  if (f.collapsed) {
    f.collapseT = Math.max(0, f.collapseT - dt);
    return f.collapseT > 0;
  }
  if (f.retreatFadeT === undefined) {
    f.retreatFadeMax = 14.0;
    f.retreatFadeT = 14.0;
  }
  f.retreatFadeT -= dt;
  if (f.faceAng === undefined) f.faceAng = formationFaceAngle(f);
  if (f.targetFaceAng === undefined) f.targetFaceAng = f.faceAng;
  const tx = f.retreatX ?? f.x + (f.ours ? -1600 : 1600);
  const ty = f.retreatY ?? f.y;
  const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
  const spd = f.retreatMode === 'rout' ? 280 : 240;
  if (d > 40) {
    const step = Math.min(d, spd * Math.max(0, dt));
    f.x += (dx / d) * step;
    f.y += (dy / d) * step;
    f.targetFaceAng = Math.atan2(dy, dx);
    const da = wrapAngle(f.targetFaceAng - f.faceAng);
    const maxT = 2.0 * Math.max(0, dt);
    f.faceAng = Math.abs(da) <= maxT ? f.targetFaceAng : wrapAngle(f.faceAng + Math.sign(da) * maxT);
    if (Math.abs(Math.cos(f.faceAng)) > 0.2) f.face = Math.cos(f.faceAng) >= 0 ? 1 : -1;
    f.moving = true;
  } else {
    f.moving = false;
  }
  stepSoldierMotion(f, Math.max(0, dt), spd);
  if (LAST_VIEW) {
    const b = rotatedFormationBounds(f);
    const offView = f.x + b.rx < LAST_VIEW.left - 320 || f.x - b.rx > LAST_VIEW.right + 320
      || f.y + b.ry < LAST_VIEW.top - 320 || f.y - b.ry > LAST_VIEW.bottom + 320;
    const minVisibleSec = f.retreatMode === 'return' ? 4.0 : 0.8;
    if (offView && (f.retreatFadeMax ?? 14) - f.retreatFadeT >= minVisibleSec) return false;
  }
  return f.retreatFadeT > 0 && d > 75;
}

