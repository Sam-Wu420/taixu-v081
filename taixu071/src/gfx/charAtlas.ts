// P2 + v0.73：双层角色分级纹理缓存（Body 制式衣袍图集 + Head 容貌朝向图集 + <12px 远景 2px 点 + 共用脚影）
// - Body 仅按性别/体型档/宗门制式服制键缓存（同宗弟子共用，极大压低图集槽位）
// - Head 仅按肤色/发式/五官/16朝向缓存（不乘 8 姿态，单 NPC 仅占 16 槽且保留千人千面）
// - 全部预烘传入 detail: 2.6 简绘档，确保同样缩放下普通 NPC 比主角更简练
import { makeCanvas } from '../core/canvas';
import { CharState, drawCharacter, type Action, type Look } from './character';

export const CHAR_FRAME_W = 120;
export const CHAR_FRAME_H = 160;
export const CHAR_FRAME_AX = 60;
export const CHAR_FRAME_AY = 142;
export const HEAD_FRAME_W = 72;
export const HEAD_FRAME_H = 78;
/** 预烘像素尺度：150 世界像素高 → 112.5 像素实绘，覆盖 12~125px 屏幕区间清晰无锯齿 */
export const CHAR_FRAME_SCALE = 0.75;
/** 单帧最大离屏烘焙预算（ms），足够完成若干 Body+Head 成对烘焙，超出时回退避免群聚卡顿 */
export const CHAR_BAKE_BUDGET_MS = 4.5;
export const CHAR_DOT_LIMIT = 1200;
const CHAR_CACHE_MAX = 512;
const CHAR_BODY_MAX = 768;
const CHAR_HEAD_MAX = 1536;
const TAU = Math.PI * 2;

export interface CharFrame {
  key: string;
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

export interface BodyFrame extends CharFrame {
  /** 颈/头枢轴点（未缩放字符本地坐标，相对脚底原点） */
  hx: number;
  hy: number;
}

const lookKeyCache = new WeakMap<Look, string>();
const bodyKeyCache = new WeakMap<Look, string>();
const headKeyCache = new WeakMap<Look, string>();

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** 根据 Look 全部视觉字段生成稳定短键（WeakMap 缓存零分配） */
export function charLookKey(look: Look): string {
  let k = lookKeyCache.get(look);
  if (k) return k;
  const raw = JSON.stringify([
    look.sex, look.height, look.build, look.skin, look.hair, look.hairStyle,
    look.fringe, look.robe, look.inner, look.trim, look.belt, look.pants, look.boots,
    look.robeLen, look.sleeve, look.skirt, look.over, look.overColor, look.skirtColor,
    look.collar, look.waistline, look.cuff, look.sash, look.shawl,
    look.ribbon, look.back, look.waist, look.hand, look.idle,
    look.swordColor, look.hat, look.beard, look.pattern, look.face, look.head, look.body,
  ]);
  k = hashStr(raw);
  lookKeyCache.set(look, k);
  return k;
}

/** 躯干/服制共享键：同宗弟子共用少量模板 */
export function charBodyKey(look: Look): string {
  let k = bodyKeyCache.get(look);
  if (k) return k;
  const buildQ = Math.round((look.build ?? 1) * 4);
  const raw = JSON.stringify([
    look.sex, buildQ, look.robe, look.inner, look.trim, look.belt, look.pants, look.boots,
    look.robeLen, look.sleeve, look.skirt, look.over, look.overColor, look.skirtColor,
    look.collar, look.waistline, look.cuff, look.sash, look.shawl,
    look.back, look.waist, look.hand, look.idle, look.pattern,
  ]);
  k = hashStr(raw);
  bodyKeyCache.set(look, k);
  return k;
}

/** 头面/发式独立键：千人千面但只按 16 朝向烘焙 */
export function charHeadKey(look: Look): string {
  let k = headKeyCache.get(look);
  if (k) return k;
  const raw = JSON.stringify([
    look.sex, look.skin, look.hair, look.hairStyle, look.fringe,
    look.ribbon, look.hat, look.beard, look.pin, look.earring, look.huadian,
    look.face, look.head, look.headTex,
  ]);
  k = hashStr(raw);
  headKeyCache.set(look, k);
  return k;
}

/** 16 朝向 × 8 姿态（0=待机, 1..4=行步4相, 5=打坐, 6=御剑/飞行, 7=出手/受击） */
export function charPoseBucket(st: CharState): { dir16: number; pose8: number; action: Action; phase: number } {
  const normYaw = ((st.yaw % TAU) + TAU) % TAU;
  const dir16 = Math.round((normYaw / TAU) * 16) % 16;
  const act = st.action;
  if (act === 'sit') return { dir16, pose8: 5, action: 'sit', phase: 0 };
  if (act === 'cast' || act === 'hit' || act === 'dodge' || act === 'gather') {
    return { dir16, pose8: 7, action: act, phase: Math.floor(((st.phase % TAU) + TAU) % TAU / (TAU / 4)) * (TAU / 4) };
  }
  if (act === 'fly' || st.lift > 12) return { dir16, pose8: 6, action: 'fly', phase: 0 };
  if (act === 'walk' || act === 'run' || st.gait) {
    const p4 = Math.floor((((st.phase % TAU) + TAU) % TAU) / (TAU / 4)) % 4;
    return { dir16, pose8: 1 + p4, action: act === 'run' ? 'run' : 'walk', phase: (p4 + 0.5) * (TAU / 4) };
  }
  return { dir16, pose8: 0, action: 'idle', phase: 0 };
}

class CharFrameCache {
  private map = new Map<string, CharFrame>();
  private bodyMap = new Map<string, BodyFrame>();
  private headMap = new Map<string, CharFrame>();
  private bakeMs = 0;
  private dots = 0;
  private scratch = new CharState(0, 0);
  /** 统计：本帧命中/烘焙/降级次数 */
  hits = 0;
  bakes = 0;
  fallbacks = 0;

  beginFrame() {
    this.bakeMs = 0;
    this.dots = 0;
    this.hits = 0;
    this.bakes = 0;
    this.fallbacks = 0;
  }

  /** 为远景 <12px 实体申请一个 2px 点配额（上限 300） */
  takeDot(important = false): boolean {
    if (this.dots >= CHAR_DOT_LIMIT && !important) return false;
    this.dots++;
    return true;
  }

  private setupScratch(dir16: number, action: Action, phase: number, pose8: number, st: CharState) {
    const s = this.scratch;
    s.x = 0; s.y = 0; s.lift = 0;
    s.yaw = (dir16 / 16) * TAU;
    s.targetYaw = s.yaw;
    s.action = action;
    s.actionT = 0.25;
    s.phase = phase;
    const isFlyGait = st.gait === 'fly' || (pose8 === 7 && st.lift > 12);
    s.gait = isFlyGait ? 'fly' : (pose8 >= 1 && pose8 <= 4 ? (action === 'run' ? 'run' : 'walk') : null);
    s.speed = s.gait === 'run' ? 220 : s.gait === 'walk' ? 120 : (action === 'fly' || isFlyGait) ? 180 : 0;
    s.freeFlight = st.freeFlight;
    s.naturalFlight = st.naturalFlight;
    s.from = null; s.blend = 1;
    s.strands.clear(); s.springs.clear();
    return s;
  }

  /** 共享服制躯干图层（仅 body） */
  getBody(look: Look, st: CharState): BodyFrame | null {
    const bk = charBodyKey(look);
    const { dir16, pose8, action, phase } = charPoseBucket(st);
    const flyTag = (pose8 === 7 && (st.gait === 'fly' || st.lift > 12)) ? (st.freeFlight ? ':ffly' : ':fly') : '';
    const key = pose8 === 7 ? `CB:${bk}:${dir16}:${pose8}:${action}${flyTag}` : `CB:${bk}:${dir16}:${pose8}`;
    const hit = this.bodyMap.get(key);
    if (hit) {
      this.bodyMap.delete(key);
      this.bodyMap.set(key, hit);
      this.hits++;
      return hit;
    }
    if (this.bakeMs >= CHAR_BAKE_BUDGET_MS) {
      this.fallbacks++;
      return null;
    }
    const t0 = performance.now();
    const cv = makeCanvas(CHAR_FRAME_W, CHAR_FRAME_H);
    const g = cv.getContext('2d')!;
    const s = this.setupScratch(dir16, action, phase, pose8, st);
    g.save();
    g.translate(CHAR_FRAME_AX, CHAR_FRAME_AY);
    g.scale(CHAR_FRAME_SCALE, CHAR_FRAME_SCALE);
    const res = drawCharacter(g, look, s, 1 / Math.max(0.5, look.height || 1), 0, { detail: 2.6, part: 'body' });
    g.restore();
    this.bakeMs += Math.max(0.05, performance.now() - t0);
    this.bakes++;
    const frame: BodyFrame = {
      key, canvas: cv, w: CHAR_FRAME_W, h: CHAR_FRAME_H, ax: CHAR_FRAME_AX, ay: CHAR_FRAME_AY,
      hx: res.headX, hy: res.headY,
    };
    this.bodyMap.set(key, frame);
    while (this.bodyMap.size > CHAR_BODY_MAX) {
      const oldest = this.bodyMap.keys().next().value;
      if (!oldest) break;
      this.bodyMap.delete(oldest);
    }
    return frame;
  }

  /** 独立头面图层（仅 head，16 朝向） */
  getHead(look: Look, st: CharState): CharFrame | null {
    const hk = charHeadKey(look);
    const normYaw = ((st.yaw % TAU) + TAU) % TAU;
    const dir16 = Math.round((normYaw / TAU) * 16) % 16;
    const key = `CH:${hk}:${dir16}`;
    const hit = this.headMap.get(key);
    if (hit) {
      this.headMap.delete(key);
      this.headMap.set(key, hit);
      this.hits++;
      return hit;
    }
    if (this.bakeMs >= CHAR_BAKE_BUDGET_MS) {
      this.fallbacks++;
      return null;
    }
    const t0 = performance.now();
    const cv = makeCanvas(HEAD_FRAME_W, HEAD_FRAME_H);
    const g = cv.getContext('2d')!;
    const s = this.setupScratch(dir16, 'idle', 0, 0, st);
    const ox = HEAD_FRAME_W / 2, oy = 102;
    g.save();
    g.translate(ox, oy);
    g.scale(CHAR_FRAME_SCALE, CHAR_FRAME_SCALE);
    const res = drawCharacter(g, look, s, 1 / Math.max(0.5, look.height || 1), 0, { detail: 2.6, part: 'head' });
    g.restore();
    this.bakeMs += Math.max(0.05, performance.now() - t0);
    this.bakes++;
    const frame: CharFrame = {
      key, canvas: cv, w: HEAD_FRAME_W, h: HEAD_FRAME_H,
      ax: ox + res.headX * CHAR_FRAME_SCALE,
      ay: oy + res.headY * CHAR_FRAME_SCALE,
    };
    this.headMap.set(key, frame);
    while (this.headMap.size > CHAR_HEAD_MAX) {
      const oldest = this.headMap.keys().next().value;
      if (!oldest) break;
      this.headMap.delete(oldest);
    }
    return frame;
  }

  /** 兼容单层合烘（特殊角色/低频） */
  get(look: Look, st: CharState): CharFrame | null {
    const lk = charLookKey(look);
    const { dir16, pose8, action, phase } = charPoseBucket(st);
    const flyTag = (pose8 === 7 && (st.gait === 'fly' || st.lift > 12)) ? (st.freeFlight ? ':ffly' : ':fly') : '';
    const key = pose8 === 7 ? `CF:${lk}:${dir16}:${pose8}:${action}${flyTag}` : `CF:${lk}:${dir16}:${pose8}`;
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      this.hits++;
      return hit;
    }
    if (this.bakeMs >= CHAR_BAKE_BUDGET_MS) {
      this.fallbacks++;
      return null;
    }
    const t0 = performance.now();
    const cv = makeCanvas(CHAR_FRAME_W, CHAR_FRAME_H);
    const g = cv.getContext('2d')!;
    const s = this.setupScratch(dir16, action, phase, pose8, st);
    g.save();
    g.translate(CHAR_FRAME_AX, CHAR_FRAME_AY);
    g.scale(CHAR_FRAME_SCALE, CHAR_FRAME_SCALE);
    // drawCharacter 内部按 look.height 缩放，此处传 1/look.height 使所有身高共享统一 90px 基础模板，提交时再乘 S
    drawCharacter(g, look, s, 1 / Math.max(0.5, look.height || 1), 0, { detail: 2.6 });
    g.restore();
    this.bakeMs += Math.max(0.05, performance.now() - t0);
    this.bakes++;
    const frame: CharFrame = { key, canvas: cv, w: CHAR_FRAME_W, h: CHAR_FRAME_H, ax: CHAR_FRAME_AX, ay: CHAR_FRAME_AY };
    this.map.set(key, frame);
    while (this.map.size > CHAR_CACHE_MAX) {
      const oldest = this.map.keys().next().value;
      if (!oldest) break;
      this.map.delete(oldest);
    }
    return frame;
  }

  clear() {
    this.map.clear();
    this.bodyMap.clear();
    this.headMap.clear();
  }
}

export const charFrames = new CharFrameCache();

let dotSpr: { key: string; canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number } | null = null;
/** 8×8 白点纹理（实例化时靠 vCol 着色，区分敌我/宗门/美人/普通人） */
export function getDotSprite() {
  if (dotSpr) return dotSpr;
  const cv = makeCanvas(8, 8);
  const g = cv.getContext('2d')!;
  const gr = g.createRadialGradient(4, 4, 0, 4, 4, 4);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.92)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 8, 8);
  dotSpr = { key: 'P2:dot8', canvas: cv, w: 8, h: 8, ax: 4, ay: 4 };
  return dotSpr;
}

let shadowSpr: { key: string; canvas: HTMLCanvasElement; w: number; h: number; ax: number; ay: number } | null = null;
/** 32×12 脚影贴图（实例化合批复用，避免回落 Canvas2D ellipse） */
export function getShadowSprite() {
  if (shadowSpr) return shadowSpr;
  const cv = makeCanvas(32, 12);
  const g = cv.getContext('2d')!;
  g.fillStyle = 'rgba(26,24,18,0.32)';
  g.beginPath();
  g.ellipse(16, 6, 15, 5, 0, 0, TAU);
  g.fill();
  shadowSpr = { key: 'P2:shadow32', canvas: cv, w: 32, h: 12, ax: 16, ay: 6 };
  return shadowSpr;
}
