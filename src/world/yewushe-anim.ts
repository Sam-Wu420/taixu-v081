// r16 夜无赦：「招式 → 帧序列 + 程序姿态」表（画面线）。规格书：docs/夜无赦-参考视频动作分解.md（下面每招注释里的「§N」就是规格书的第 N 招）。
// 贴图每招只画关键帧，其余靠这里的程序动画补：
//   · 卡帧：关键帧之间不插值（照撼山客）——一段就是「这一帧、停多久」；
//   · 出手那一帧拉伸 + 顿帧：hit 段一开头是夸张的拉伸（sx 1.2 / sy 0.88），60 毫秒里回到这一段自己的挤压量；
//     命中之后直接切到收招帧，不过渡；起手段（wind）是反向的蓄势（sx 0.92 / sy 1.07）；
//   · 位移：每段写到这一段结束时人在哪（dx 前冲、dy 横移、lift 离地），段内按 ease 走：snap 一开头就到（瞬移、闪步）、
//     lin 匀速、out 先快后慢（冲刺刹住）、in 先慢后快（下扎）、arc 抛物线（跃起、砸地，照 seabeast.ts 的 leapStep：lift = 起点→终点的直线 + 4·H·u·(1−u)）；
//     tgt: true 的段 dx 是「到目标距离的几成」（玩法传 opts.dist；瞬移到目标身上、钻地追人用）；
//   · 旋转、残影、辉光、闪白、调色、透明度也按段给（段内不变）。
//
// ───────────────────────────── 给玩法线的接口 ─────────────────────────────
//   poseAt(moveId, form, t毫秒, opts?) → YwsPose { frame, H, ax, sx, sy, rot, dx, dy, lift, alpha, ghost, glow, glowCol?, flash, tint?, add?, hit, seg, done }
//     frame  贴图帧名（交给 bossthings 的 key）；H 立板高度（已乘这一帧的高矮比例）、ax 脚在贴图横向的位置——原样交给 bossthings
//     dx     朝前（面朝方向）走了多远，dy 横向（本图 y），lift 离地多高（负 = 沉到地下）——都是相对这招开始时的站位，世界单位
//     alpha  立板透明度（化成火轮、钻进地里时为 0；魔躯放灾使时半透明）
//     hit    这一刻在出手段里（伤害、顿帧、震屏按 ywsHits(id, form) 的时刻发，这个只是给画面用的标记）
//     done   这招放完了（t 超过总长）；seg 当前第几段
//     opts.dist  到目标的距离（tgt 段用；不给按 400）
//   怎么摆到世界里（玩法线照这个写，试玩页 tools/try-ywsart.ts 就是这么摆的）：
//     出招那一刻记下站位 (x0, y0) 和朝向单位向量 u（朝目标）；这一刻 x = x0 + u.x·dx − u.y·dy，y = y0 + u.y·dx + u.x·dy，z = lift。
//     立板的 face（画面上朝左 / 朝右）= sign(u · hd.rightDir)，原画朝左，bossthings 按 face 翻；rot 已经按「朝前倒」给，不用管左右。
//     H、ax、sx、sy、rot、alpha、flash、glow、glowCol、tint、add 原样抄进 BossSprite；ghost > 0 时把 BossSprite.ghost 设成它（bossthings 按轨迹自动排残影）。
//   idlePose(form, t毫秒)：待机的呼吸起伏；walkPose(form, t毫秒)：走路；hurtPose(form, t毫秒)：受击（0–300 毫秒）；downPose(form)：倒地
//   ywsMoveLen(id, form)：整招多长（毫秒）；ywsHits(id, form)：每下出手的时刻（毫秒）；ywsHasForm(id, form)：这招这个形态能不能放
//   ghostTrail(id, form, t, opts?)：往回推的几个残影（定格截图、或玩法想要稳定的残影时用；平时 bossthings 按实时轨迹自动排）
//   YWS_MOVES[id].name / .forms / .sec：修仙版招名、能放的形态、规格书第几招
//   YWS_MOVE_IDS：所有招的 id（试玩页 &move=all 按这个顺序轮着放）
//   YWS_FRAMES：所有会用到的帧名（BossThings 会按形态自己预热，不必手动）
//   moyingGhost(form, t, k)：§5 魔影随身的魔影（塞进 BossSprite.ghosts）
// 帧名：yws_<形态>_<姿势>，形态 h 人身 / b 半魔 / m 魔躯；某形态没画的姿势按 borrow() 借（半魔借人身同名帧、调紫；魔躯借相近的魔躯帧）。
// ──────────────────────────────────────────────────────────────────────

import { YWS_FOOT_AX } from './ywsFrameMeta';

export type YwsForm = 'human' | 'half' | 'demon';
export const YWS_FORM_CODE: Record<YwsForm, 'h' | 'b' | 'm'> = { human: 'h', half: 'b', demon: 'm' };
const CODE_FORM: Record<string, YwsForm> = { h: 'human', b: 'half', m: 'demon' };
/** 立板高度（世界单位；主角约 175）：人身高出一头、半魔再大一点、魔躯三个半人高 */
export const YWS_FORM_H: Record<YwsForm, number> = { human: 235, half: 250, demon: 620 };

type RGB = [number, number, number];
type Ease = 'snap' | 'lin' | 'out' | 'in' | 'arc';
export interface YwsSeg {
  /** 姿势名（帧名的后半截） */
  p: string;
  /** 停多久（毫秒） */
  ms: number;
  /** 这一段的挤压拉伸（默认 1） */
  sx?: number; sy?: number;
  /** 前倾（度，正 = 朝前倒） */
  rot?: number;
  /** 段末的位置（相对起手站位）：前冲、横移、离地；不写 = 和上一段末一样 */
  dx?: number; dy?: number; lift?: number;
  /** dx 按到目标距离的比例算（1 = 正好到目标身上） */
  tgt?: boolean;
  /** 段内怎么走（默认 lin；写了 arcH 默认 arc） */
  ease?: Ease;
  /** arc 的额外高度（抛物线顶比两头直线高出多少） */
  arcH?: number;
  /** 残影强度 0–1、辉光 0–1.5、闪白 0–1、透明度 0–1 */
  ghost?: number; glow?: number; flash?: number; alpha?: number;
  /** 辉光颜色、调色 */
  glowCol?: RGB; tint?: RGB; add?: RGB;
  /** 出手段：开头 60 毫秒拉伸、顿帧 */
  hit?: boolean;
  /** 起手段：反向蓄势 */
  wind?: boolean;
  /** 抖动（蓄力、咆哮）：像素级的左右颤 */
  shake?: number;
}
export interface YwsMove {
  /** 修仙版招名 */
  name: string;
  /** 规格书第几招 */
  sec: number;
  /** 哪些形态能放 */
  forms: YwsForm[];
  /** 帧序列（人身用；半魔没写 half 也用这个，帧换成 b_） */
  segs: YwsSeg[];
  half?: YwsSeg[];
  /** 魔躯有自己的写法时 */
  demon?: YwsSeg[];
}
export interface YwsPose {
  frame: string; H: number; ax: number;
  sx: number; sy: number; rot: number; dx: number; dy: number; lift: number;
  alpha: number; ghost: number; glow: number; glowCol?: RGB; flash: number; tint?: RGB; add?: RGB;
  hit: boolean; seg: number; done: boolean;
}

// ================================================================ 帧
/** 每种形态画了哪些姿势（贴图清单见规格书「四、贴图清单」和 src/assets/yewushe/说明.md） */
export const YWS_POSES: Record<YwsForm, readonly string[]> = {
  human: ['idle', 'walk', 'hurt', 'down', 'raise', 'windup', 'slash', 'sweep', 'upper', 'slam', 'stab', 'spin', 'throw', 'catch', 'cast', 'grab', 'fist', 'roar', 'guard', 'dash', 'leap', 'dive', 'charge', 'transform', 'summon'],
  half: ['idle', 'walk', 'hurt', 'windup', 'slash', 'sweep', 'upper', 'slam', 'dash', 'leap', 'dive', 'charge', 'cast', 'roar', 'transform', 'throw', 'spin', 'summon'],
  demon: ['idle', 'walk', 'hurt', 'down', 'raise', 'windup', 'claw', 'upper', 'sweep', 'slam', 'grab', 'fist', 'dash', 'leap', 'dive', 'charge', 'cast', 'roar', 'transform', 'summon', 'throw', 'guard', 'fly',
    'aw1_a', 'aw1_b', 'aw1_c', 'aw2_face', 'aw2_wings'],
};
/** 魔躯没画的姿势借谁（人身的镰刀姿势 → 魔躯的爪子姿势） */
const DEMON_BORROW: Record<string, string> = { slash: 'claw', stab: 'claw', spin: 'sweep', catch: 'grab', raise: 'raise', guard: 'guard' };
/** 人身没画的（只有魔躯有的）借谁 */
const HUMAN_BORROW: Record<string, string> = { claw: 'slash', fly: 'leap', aw1_a: 'windup', aw1_b: 'slash', aw1_c: 'sweep', aw2_face: 'roar', aw2_wings: 'roar' };
const posesOf = (form: YwsForm) => new Set(YWS_POSES[form]);
const POSE_SET: Record<YwsForm, Set<string>> = { human: posesOf('human'), half: posesOf('half'), demon: posesOf('demon') };
/** 半魔借人身帧时的调色（偏紫、发暗） */
const HALF_BORROW_TINT: RGB = [0.82, 0.68, 1];

/** 帧名：形态 + 姿势；半魔没画的借人身同名帧（返回 borrowed = true，调成紫色），魔躯 / 人身没画的按 *_BORROW 借，再不行用待机 */
export function ywsFrameOf(form: YwsForm, pose: string): { frame: string; borrowed: boolean } {
  if (POSE_SET[form].has(pose)) return { frame: `yws_${YWS_FORM_CODE[form]}_${pose}`, borrowed: false };
  if (form === 'half') { const r = ywsFrameOf('human', pose); return { frame: r.frame, borrowed: true }; }
  const p = (form === 'demon' ? DEMON_BORROW : HUMAN_BORROW)[pose];
  return { frame: `yws_${YWS_FORM_CODE[form]}_${p && POSE_SET[form].has(p) ? p : 'idle'}`, borrowed: false };
}
export function ywsFrame(form: YwsForm, pose: string): string { return ywsFrameOf(form, pose).frame; }
/** 所有帧名（预热用） */
export const YWS_FRAMES: readonly string[] = (Object.keys(YWS_POSES) as YwsForm[]).flatMap((f) => YWS_POSES[f].map((p) => `yws_${YWS_FORM_CODE[f]}_${p}`));
/** 特效贴图（玩法 / 特效线直接拿帧名用，bossthings 的 ghosts[] 也认） */
export const YWS_FX_FRAMES = ['yws_scythe', 'yws_fx_fist', 'yws_fx_claw', 'yws_fx_ghost'] as const;

/** 每帧的高矮比例（乘在形态高度上）和脚在贴图横向的位置（0 = 图的左边，朝左画）。
 *  生成的图都按外框裁过：举镰的帧比待机高、伏低的帧矮、镰刀往前伸很远的帧脚不在正中——这里按切好的图逐帧量（src/assets/yewushe/说明.md 有原图尺寸）。 */
export const YWS_FRAME_META: Record<string, { h: number; ax: number }> = {};
/** 按姿势的默认值（三种形态同一个姿势构图差不多；个别帧在 YWS_FRAME_META 里单独改）。
 *  h：这张图的高 = 站直身高的几倍（举镰过头的帧 > 1，伏低的帧 < 1）；ax：脚在图的哪里（镰刀往前伸的帧，人在图的右半边） */
const POSE_META: Record<string, { h: number; ax: number }> = {
  idle: { h: 1, ax: 0.5 }, walk: { h: 1, ax: 0.32 }, hurt: { h: 1, ax: 0.55 }, down: { h: 0.6, ax: 0.5 }, raise: { h: 1.25, ax: 0.45 }, windup: { h: 0.8, ax: 0.45 },
  slash: { h: 0.72, ax: 0.62 }, sweep: { h: 0.6, ax: 0.72 }, upper: { h: 1.2, ax: 0.55 }, slam: { h: 0.78, ax: 0.62 }, stab: { h: 0.62, ax: 0.72 }, spin: { h: 1, ax: 0.55 },
  throw: { h: 0.95, ax: 0.72 }, catch: { h: 1.25, ax: 0.5 }, cast: { h: 1.1, ax: 0.5 }, grab: { h: 0.85, ax: 0.6 }, fist: { h: 0.9, ax: 0.5 }, roar: { h: 1.1, ax: 0.5 },
  guard: { h: 0.9, ax: 0.5 }, dash: { h: 0.62, ax: 0.55 }, leap: { h: 0.9, ax: 0.5 }, dive: { h: 0.95, ax: 0.5 }, charge: { h: 0.6, ax: 0.6 }, transform: { h: 1.05, ax: 0.5 },
  summon: { h: 0.7, ax: 0.6 }, claw: { h: 0.85, ax: 0.6 }, fly: { h: 1.1, ax: 0.5 }, aw1_a: { h: 0.9, ax: 0.55 }, aw1_b: { h: 0.9, ax: 0.55 }, aw1_c: { h: 0.85, ax: 0.55 },
  aw2_face: { h: 1, ax: 0.5 }, aw2_wings: { h: 1.1, ax: 0.5 },
};
function metaOf(frame: string) {
  const m = YWS_FRAME_META[frame]; if (m) return m;
  const p = POSE_META[frame.replace(/^yws_[hbm]_/, '')] ?? { h: 1, ax: 0.5 }, ax = YWS_FOOT_AX[frame];
  return ax === undefined ? p : { h: p.h, ax };   // 脚位优先用量出来的（tools/yws-pack.mjs），高矮按姿势的默认
}

// ================================================================ 播放
const segsOf = (m: YwsMove, form: YwsForm) => (form === 'demon' ? m.demon : form === 'half' ? m.half : undefined) ?? m.segs;
const cacheLen = new Map<string, number>();
export function ywsMoveLen(id: string, form: YwsForm): number {
  const k = id + form; let L = cacheLen.get(k);
  if (L === undefined) { const m = YWS_MOVES[id]; L = m ? segsOf(m, form).reduce((a, s) => a + s.ms, 0) : 0; cacheLen.set(k, L); }
  return L;
}
/** 每下出手的时刻（毫秒，出手段的开头） */
export function ywsHits(id: string, form: YwsForm): number[] {
  const m = YWS_MOVES[id]; if (!m) return [];
  const out: number[] = []; let t = 0;
  for (const s of segsOf(m, form)) { if (s.hit) out.push(t); t += s.ms; }
  return out;
}
export function ywsHasForm(id: string, form: YwsForm): boolean { return !!YWS_MOVES[id]?.forms.includes(form); }

const easeOf = (e: Ease, u: number) => e === 'snap' ? 1 : e === 'out' ? 1 - (1 - u) * (1 - u) : e === 'in' ? u * u : u;
const formGlow = (form: YwsForm) => form === 'demon' ? 0.35 : form === 'half' ? 0.25 : 0;

/** 某招某一刻的姿态 */
export function poseAt(id: string, form: YwsForm, t: number, opts?: { dist?: number }): YwsPose {
  const m = YWS_MOVES[id];
  if (!m) return idlePose(form, t);
  const S = segsOf(m, form), dist = opts?.dist ?? 400;
  const dxOf = (s: YwsSeg, prev: number) => s.dx === undefined ? prev : s.tgt ? s.dx * dist : s.dx;
  let x = 0, y = 0, z = 0, t0 = 0, i = 0;
  for (; i < S.length - 1 && t >= t0 + S[i].ms; i++) { const s = S[i]; x = dxOf(s, x); y = s.dy ?? y; z = s.lift ?? z; t0 += s.ms; }
  const s = S[i], u = Math.max(0, Math.min(1, (t - t0) / Math.max(1, s.ms))), lt = t - t0;
  const x1 = dxOf(s, x), y1 = s.dy ?? y, z1 = s.lift ?? z;
  const ease: Ease = s.ease ?? (s.arcH ? 'arc' : 'lin'), k = ease === 'arc' ? u : easeOf(ease, u);
  let lift = z + (z1 - z) * k;
  if (ease === 'arc') lift += 4 * (s.arcH ?? 0) * u * (1 - u);
  let sx = s.sx ?? 1, sy = s.sy ?? 1;
  // 出手：一开头拉长、压扁（朝前甩出去），60 毫秒里收回这一段自己的量——不插姿势，只弹一下形
  if (s.hit && lt < 60) { const w = 1 - lt / 60; sx *= 1 + 0.2 * w; sy *= 1 - 0.12 * w; }
  // 起手：反向蓄势（往回缩、拔高），越到段末越明显
  if (s.wind) { sx *= 1 - 0.08 * u; sy *= 1 + 0.07 * u; }
  // 「@m:姿势」：这一段用别的形态的帧和身高（变身招跨形态：天魔降身后半段已经是魔躯）
  const fm = /^@([hbm]):(.+)$/.exec(s.p), ff: YwsForm = fm ? CODE_FORM[fm[1]] : form;
  const F = ywsFrameOf(ff, fm ? fm[2] : s.p), meta = metaOf(F.frame);
  let dx = x + (x1 - x) * k;
  if (s.shake) dx += Math.sin(t * 0.09) * s.shake;
  const tint = s.tint ?? (F.borrowed ? HALF_BORROW_TINT : undefined);
  return {
    frame: F.frame, H: YWS_FORM_H[ff] * meta.h, ax: meta.ax,
    sx, sy, rot: (s.rot ?? 0) * Math.PI / 180, dx, dy: y + (y1 - y) * k, lift,
    alpha: s.alpha ?? 1, ghost: s.ghost ?? 0, glow: s.glow ?? formGlow(ff), glowCol: s.glowCol, flash: s.flash ?? 0, tint, add: s.add,
    hit: !!s.hit, seg: i, done: t >= ywsMoveLen(id, form),
  };
}

function still(form: YwsForm, pose: string, ex: Partial<YwsPose> = {}): YwsPose {
  const F = ywsFrameOf(form, pose), meta = metaOf(F.frame);
  return { frame: F.frame, H: YWS_FORM_H[form] * meta.h, ax: meta.ax, sx: 1, sy: 1, rot: 0, dx: 0, dy: 0, lift: 0, alpha: 1, ghost: 0, glow: formGlow(form), flash: 0,
    tint: F.borrowed ? HALF_BORROW_TINT : undefined, hit: false, seg: 0, done: false, ...ex };
}
/** 待机：慢慢的呼吸起伏（魔躯更沉、更慢），斗篷的飘动在贴图里 */
export function idlePose(form: YwsForm, t: number): YwsPose {
  const b = Math.sin(t / 1000 * (form === 'demon' ? 1.6 : 2.2));
  return still(form, 'idle', { sx: 1 - 0.012 * b, sy: 1 + 0.02 * b, glow: form === 'demon' ? 0.35 + 0.1 * b : form === 'half' ? 0.25 + 0.08 * b : 0 });
}
/** 走路：待机帧和走路帧交替，一步一顿（人 260 / 魔躯 380 毫秒一步），落脚那一下压一点 */
export function walkPose(form: YwsForm, t: number): YwsPose {
  const P = form === 'demon' ? 380 : 260, step = Math.floor(t / P), u = (t % P) / P, k = 1 - u;
  return still(form, step % 2 ? 'walk' : 'idle', { sx: 1 + 0.03 * k, sy: 1 - 0.035 * k, rot: 4 * Math.PI / 180, lift: form === 'demon' ? 0 : 4 * Math.sin(u * Math.PI) });
}
/** 受击：一帧闪白、往后仰一点再回来（0–300 毫秒；魔躯霸体只闪不仰） */
export function hurtPose(form: YwsForm, t: number): YwsPose {
  const u = Math.min(1, t / 300), back = form === 'demon' ? 0 : Math.sin(u * Math.PI);
  return still(form, form === 'demon' && t > 90 ? 'idle' : 'hurt', { flash: t < 60 ? 1 : 0, rot: -8 * back * Math.PI / 180, dx: -14 * back, sx: 1 + 0.06 * (1 - u), sy: 1 - 0.05 * (1 - u) });
}
/** 倒地（死亡收尾；人身 / 半魔跪地，魔躯跪倒） */
export function downPose(form: YwsForm): YwsPose { return still(form, 'down', { glow: 0 }); }

/** 往回推的残影：每隔 stepMs 一个，越往后越淡（离当前位置太近的不要） */
export function ghostTrail(id: string, form: YwsForm, t: number, opts?: { dist?: number }, n = 4, stepMs = 45): (YwsPose & { alpha: number })[] {
  const cur = poseAt(id, form, t, opts), out: (YwsPose & { alpha: number })[] = [];
  for (let i = 1; i <= n; i++) {
    const tt = t - i * stepMs; if (tt < 0) break;
    const q = poseAt(id, form, tt, opts);
    if (Math.hypot(q.dx - cur.dx, q.dy - cur.dy, q.lift - cur.lift) < 12 * i) continue;
    out.push({ ...q, alpha: 0.6 - i * 0.11 });
  }
  return out;
}

/**
 * §5 魔影随身（被动）：出手命中后在首领身后浮出的半透明魔影——返回一个残影，玩法塞进 BossSprite.ghosts（bossthings 按 ghostCol 染成紫黑）。
 * t 是魔影出现后的毫秒数（0–300：前 80 渐显、200 出手、后 120 淡出）；k 是招式自己的伪随机数（0–1，选抓还是劈），别用 Math.random。
 * 位置给的是相对首领脚下、沿朝向的偏移（back 往后、up 离地），由玩法换成世界坐标。
 */
export function moyingGhost(form: YwsForm, t: number, k: number): { key: string; H: number; ax: number; alpha: number; back: number; up: number; sx: number; sy: number } | null {
  if (t < 0 || t > 300) return null;
  const a = t < 80 ? t / 80 : t > 180 ? Math.max(0, (300 - t) / 120) : 1;
  const strike = t >= 200 ? 1 : 0, key = strike ? (k < 0.5 ? 'yws_m_claw' : 'yws_m_upper') : 'yws_m_windup';
  const H = YWS_FORM_H[form === 'demon' ? 'demon' : form] * (form === 'demon' ? 1.15 : 1.6);
  return { key, H, ax: YWS_FOOT_AX[key] ?? 0.5, alpha: 0.45 * a, back: strike ? -60 : 40, up: 10, sx: 1 + 0.08 * strike, sy: 1 };
}

// ================================================================ 招式表（逐招照规格书的「帧」一节）
// 写法：S(姿势, 毫秒, 其他)；R(姿势, 总毫秒, 几下, 其他) = 同一帧拆成几段、每段开头一下 hit（多段伤害）。
const S = (p: string, ms: number, ex: Partial<YwsSeg> = {}): YwsSeg => ({ p, ms, ...ex });
const R = (p: string, ms: number, n: number, ex: Partial<YwsSeg> = {}): YwsSeg[] => Array.from({ length: n }, () => ({ p, ms: Math.round(ms / n), hit: true, ...ex }));
const BLACK: RGB = [0.08, 0.05, 0.1], INK: RGB = [0.02, 0.0, 0.04],   // r19：INK 当辉光色 = 一圈暗色描边（bossthings 的辉光是预乘透明度的普通混合，暗色也画得出）
  PURPLE: RGB = [0.6, 0.3, 1], MAGENTA: RGB = [1, 0.3, 0.85], RED: RGB = [1, 0.15, 0.12], WHITE: RGB = [1, 1, 1], GOLD: RGB = [1, 0.8, 0.3], ORANGE: RGB = [1, 0.55, 0.15];
const H_ = ['human', 'half'] as YwsForm[], ALL = ['human', 'half', 'demon'] as YwsForm[], M_ = ['demon'] as YwsForm[];

/** 魔躯的普攻（§4）：爪 → 上撩 → 冲 → 横斩 */
const MO_PUGONG: YwsSeg[] = [S('windup', 100, { wind: true }), S('claw', 160, { hit: true, dx: 60 }), S('upper', 160, { hit: true }), S('dash', 200, { dx: 260, ghost: 1, ease: 'out' }), S('sweep', 200, { hit: true, dx: 320, flash: 0.3 }), S('idle', 250)];

export const YWS_MOVES: Record<string, YwsMove> = {
  // §1 堕魂诀：起手结印 → 演出中咆哮（压暗、紫光幕、红魔纹）
  duohun: { name: '堕魂诀', sec: 1, forms: H_, segs: [S('cast', 120, { wind: true }), S('roar', 800, { glow: 1.2, glowCol: PURPLE, add: [0.25, 0.1, 0.4], shake: 1 }), S('idle', 200, { glow: 0.4, glowCol: PURPLE })],
    half: [S('cast', 100, { wind: true }), S('roar', 500, { glow: 1.2, glowCol: MAGENTA, add: [0.3, 0.05, 0.25] }), S('idle', 200)] },
  // §2 魂镰三式：撩 → 斩（+ 贴地）→ 横扫 + 转身斩
  pugong: { name: '魂镰三式', sec: 2, forms: ALL, segs: [
    S('idle', 100, { wind: true }), S('upper', 260, { hit: true, dx: 20 }),
    S('windup', 110, { wind: true }), S('slash', 140, { hit: true, dx: 70, rot: 8 }), S('sweep', 200, { dx: 90, sy: 0.95 }),
    S('raise', 120, { wind: true }), S('stab', 160, { hit: true, dx: 150, ghost: 0.5, ease: 'out' }), S('raise', 100), S('spin', 260, { hit: true, dx: 170 }), S('idle', 250)],
    demon: MO_PUGONG },
  // §3 魔气入体：化魔（人身）→ 半魔化（变黑剪影 → 通红 → 炸开）
  moqi: { name: '魔气入体', sec: 3, forms: ['human'], segs: [
    S('roar', 70, { wind: true }), S('transform', 400, { glow: 1.2, glowCol: PURPLE, add: [0.3, 0.15, 0.6], shake: 3, hit: true }),
    S('cast', 100, { tint: [0.2, 0.18, 0.24] }), S('@b:transform', 200, { tint: BLACK, add: [1, 0.15, 0.1], flash: 0.4, glow: 1, glowCol: WHITE }),
    S('@b:roar', 300, { hit: true, glow: 1.5, glowCol: RED, shake: 6 }), S('@b:idle', 200, { glow: 0.5 })] },
  // §3 空斩（半魔普攻派生）：一步冲到面前、两道血红月牙
  kongzhan: { name: '空斩', sec: 3, forms: H_, segs: [S('windup', 80, { wind: true }), S('dash', 40, { dx: 320, ease: 'snap', ghost: 1 }), S('slash', 120, { hit: true, tint: [0.3, 0.25, 0.35] }), S('slash', 120, { hit: true }), S('idle', 260)] },
  // §3 落魂锤：下蹲 → 跃起 → 悬停 → 斜扎 → 砸地
  luohun: { name: '落魂锤', sec: 3, forms: ALL, segs: [
    S('charge', 100, { wind: true }), S('leap', 200, { lift: 260, dx: 60, ease: 'out' }), S('leap', 200, { dx: 120, lift: 280 }),
    S('dive', 300, { dx: 300, lift: 0, ease: 'in', ghost: 0.8, rot: 20 }), S('slam', 200, { hit: true, sy: 0.85, shake: 6 }), S('idle', 300)],
    demon: [S('charge', 120, { flash: 1 }), S('leap', 500, { lift: 0, arcH: 420, dx: 200 }), S('claw', 200, { lift: 0 }), S('dive', 160, { dx: 300, ease: 'in', ghost: 1 }), S('slam', 300, { hit: true, shake: 10, sy: 0.88 }), S('idle', 200)] },
  // §4 天魔降身 · 末劫：半魔 → 魔躯（这招在半魔形态放；前半段是半魔帧，后半段是魔躯帧——帧名直接写死形态）
  tianmo: { name: '天魔降身 · 末劫', sec: 4, forms: ['half'], segs: [], half: [
    S('cast', 200, { wind: true }), S('roar', 300, { flash: 0.6, glow: 1.5, glowCol: MAGENTA }),
    S('transform', 700, { tint: BLACK, glow: 1, glowCol: WHITE, shake: 2 }), S('transform', 200, { tint: BLACK, glow: 1.2, glowCol: GOLD }),
    S('@m:transform', 200, { tint: BLACK, glow: 1.5, glowCol: RED, hit: true }), S('@m:transform', 500, { shake: 5, glow: 0.8, glowCol: RED }), S('@m:roar', 500), S('@m:idle', 300)] },
  // §4 魔躯普攻（单独 id，玩法在魔躯形态的普攻用它）
  mo_pugong: { name: '魔爪三连', sec: 4, forms: M_, segs: MO_PUGONG },
  // §6 摄魂魔爪：举手 → 魔手飞出抓住 → 一握光爆
  shehun: { name: '摄魂魔爪', sec: 6, forms: ALL, segs: [S('idle', 60), S('cast', 140, { wind: true }), S('grab', 130), S('grab', 270, { hit: true }), S('grab', 200, { hit: true }), S('idle', 250)],
    demon: [S('windup', 70, { wind: true }), S('grab', 60, { dx: 180, ease: 'snap', ghost: 1, hit: true }), S('claw', 80, { hit: true }), S('grab', 80, { hit: true }), S('claw', 80, { hit: true }), S('grab', 80, { hit: true }), S('windup', 70), S('idle', 250)] },
  // §7 血镰乱舞：亮剪影起手 → 原地八下（白黑月牙交替）→ 两道大弧
  xuelian: { name: '血镰乱舞', sec: 7, forms: ALL, segs: [
    S('cast', 120, { flash: 0.8, add: [0.4, 0.3, 0.6] }), S('raise', 70),
    S('upper', 120, { hit: true }), S('slash', 120, { hit: true, shake: 1 }), S('upper', 120, { hit: true }), S('slash', 120, { hit: true, shake: 1 }), S('upper', 120, { hit: true }), S('slash', 120, { hit: true, shake: 1 }),
    S('spin', 120, { hit: true }), S('upper', 120, { hit: true }), S('raise', 70), S('slash', 140, { hit: true, rot: 6 }), S('upper', 140, { hit: true }), S('idle', 250)],
    demon: [S('windup', 260, { wind: true }),
      ...[0, 1, 2].flatMap((i) => [S('dash', 70, { dx: 40 * (i + 1), ease: 'snap', tint: BLACK, glow: 1, glowCol: MAGENTA, hit: true }), S('claw', 130)]),
      S('dash', 70, { dx: 160, ease: 'snap', tint: BLACK, glow: 1, glowCol: MAGENTA, hit: true }), S('sweep', 200, { hit: true, flash: 0.4, dx: 200 }), S('idle', 270)] },
  // §8 裂魂爪（魔躯）：黑烟爆 → 举爪蓄 → 往前上一挑
  liehun: { name: '裂魂爪', sec: 8, forms: M_, segs: [S('windup', 100), S('roar', 100, { tint: [0.3, 0.25, 0.35] }), S('raise', 400, { glow: 1, glowCol: RED, shake: 2, wind: true }),
    S('upper', 100, { dx: 160, ease: 'snap', hit: true, flash: 0.3, ghost: 1 }), S('sweep', 100, { dx: 200, sy: 0.9 }), S('idle', 250)] },
  // §9 崩岳魔锤：举镰 → 砸地（剪影一帧）→ 火往前窜 → 火柱；魔躯 = 冥狱石林
  bengyue: { name: '崩岳魔锤', sec: 9, forms: ALL, segs: [S('idle', 50), S('raise', 100, { wind: true }), S('slam', 100, { hit: true, tint: [0.25, 0.2, 0.3], sy: 0.88 }), S('slam', 150), S('slam', 150, { hit: true }), S('idle', 250)],
    demon: [S('raise', 120, { wind: true, glow: 1, glowCol: RED }), S('slam', 125, { hit: true, sy: 0.88, shake: 4 }), ...R('slam', 625, 4, { shake: 2 }), S('roar', 250, { hit: true, flash: 0.2 }), S('idle', 350)] },
  // §10 回旋魂镰：亮剪影 → 锁链甩出钩住 → 挂着转 → 拽回接住
  huixuan: { name: '回旋魂镰', sec: 10, forms: ALL, segs: [S('cast', 80, { flash: 0.8, wind: true }), S('throw', 170, { hit: true }), S('throw', 240, { hit: true }), S('throw', 90), S('catch', 170, { hit: true }), S('idle', 250)],
    demon: [S('throw', 120, { tint: BLACK, glow: 1, glowCol: RED }), S('throw', 250, { hit: true }), S('grab', 125, { flash: 0.5, hit: true }), S('idle', 250)] },
  // §11 幽冥刺：闪白 → 黑剪影蹲 → 原地爆刺（打两边）→ 收
  youming: { name: '幽冥刺', sec: 11, forms: ALL, segs: [S('idle', 60), S('cast', 100, { flash: 1, add: [0.6, 0.1, 0.1] }), S('charge', 160, { tint: BLACK, glow: 1, glowCol: WHITE, sy: 0.9, wind: true }), S('roar', 170, { hit: true }), S('roar', 170, { hit: true }), S('idle', 200)],
    demon: [S('charge', 160, { tint: BLACK, glow: 1, glowCol: GOLD, wind: true }), S('roar', 125, { hit: true }), S('roar', 250, { hit: true, shake: 4 }), S('idle', 300)] },
  // §12 劫轮：蜷身 → 化成火轮往前碾（立板隐藏，特效画火轮）→ 现身；魔躯 = 死亡打击（压黑穿身）
  jielun: { name: '劫轮', sec: 12, forms: ALL, segs: [S('spin', 120, { wind: true, add: [0.6, 0.1, 0.05] }), ...Array.from({ length: 6 }, (_, i) => S('spin', 250, { alpha: 0, hit: true, dx: 520 * (i + 1) / 6 })), S('raise', 120, { flash: 0.6 }), S('idle', 250)],
    demon: [S('windup', 120, { wind: true }), S('dash', 80, { dx: 420, ease: 'snap', alpha: 0.15, ghost: 1 }), S('dash', 250, { tint: BLACK, glow: 1, glowCol: RED, hit: true }), S('dash', 250, { tint: BLACK, glow: 1, glowCol: RED, hit: true }), S('idle', 500)] },
  // §12 劫光（魔躯）：蓄 → 头顶光环 → 压黑光束三段
  jieguang: { name: '劫光', sec: 12, forms: M_, segs: [S('charge', 250, { wind: true, glow: 0.8, glowCol: RED }), S('cast', 170, { tint: BLACK, glow: 1, glowCol: MAGENTA }), ...R('fist', 510, 3), S('idle', 300)] },
  // §12 裂影杀（魔躯）：吸怪 → 红描边 → 压黑穿过 → 品红斜切一串
  lieying: { name: '裂影杀', sec: 12, forms: M_, segs: [S('cast', 500, { shake: 1 }), S('charge', 170, { flash: 0.3, glow: 1, glowCol: RED }), S('dash', 170, { dx: 520, ease: 'snap', alpha: 0.2, ghost: 1 }), S('dash', 170, { tint: BLACK, glow: 1, glowCol: RED, hit: true }), S('idle', 170, { hit: true }), S('idle', 300)] },
  // §13 冥触：结印 → 黑烟 + 触手窜出去缠住；魔躯 = 灾使（暗红魂火轮廓，两轮缠 + 黑洞爆）
  mingchu: { name: '冥触', sec: 13, forms: ALL, segs: [S('cast', 120, { wind: true }), S('summon', 250, { hit: true }), S('summon', 250, { hit: true }), S('summon', 250, { hit: true }), S('idle', 250)],
    demon: [S('summon', 170, { alpha: 0.5, add: [0.5, 0.05, 0.05], glow: 1, glowCol: RED }), S('summon', 170, { alpha: 0.5, add: [0.5, 0.05, 0.05], glow: 1, glowCol: RED, hit: true }), S('summon', 330, { alpha: 0.5, add: [0.5, 0.05, 0.05], glow: 1, glowCol: RED, hit: true, shake: 5 }),
      S('idle', 170, { flash: 1 }), S('summon', 330, { alpha: 0.5, add: [0.5, 0.05, 0.05], glow: 1, glowCol: RED, hit: true }), S('summon', 330, { alpha: 0.5, add: [0.5, 0.05, 0.05], glow: 1, glowCol: RED, hit: true, shake: 5 }), S('idle', 250)] },
  // §13 魔呓（魔躯）：黄描边 → 触手潮 → 大爆
  moyi_summon: { name: '魔呓', sec: 13, forms: M_, segs: [S('cast', 250, { glow: 1, glowCol: GOLD }), ...R('summon', 500, 3, { alpha: 0.6, add: [0.5, 0.05, 0.05], glow: 1, glowCol: RED }), S('roar', 250, { hit: true, flash: 0.3 }), S('idle', 300)] },
  // §14 魔拳：缩身（身后长出魔臂）→ 一拳打出 → 血雾；魔躯 = 梦魇种
  moquan: { name: '魔拳', sec: 14, forms: H_, segs: [S('windup', 120, { wind: true, flash: 0.6 }), S('fist', 250, { hit: true }), S('fist', 250), S('idle', 250)] },
  menyan: { name: '梦魇种', sec: 14, forms: M_, segs: [S('windup', 100, { wind: true }), S('claw', 250, { hit: true }), S('idle', 400)] },
  // §15 玄冥魔障：闪白 → 挂镰 → 冥柱 → 横线十字 → 光球爆；魔躯另有魔化本能 / 玄冥终焉
  xuanming: { name: '玄冥魔障', sec: 15, forms: H_, segs: [S('cast', 170, { flash: 1, wind: true }), S('slam', 160), S('slam', 170, { hit: true }), S('slam', 170, { hit: true }), S('sweep', 170, { hit: true }), S('throw', 170, { hit: true }), S('throw', 170), S('idle', 170, { hit: true }), S('idle', 250)] },
  benneng: { name: '魔化本能', sec: 15, forms: M_, segs: [S('charge', 170, { wind: true, glow: 1, glowCol: GOLD }), S('leap', 170, { lift: 500, ease: 'snap', alpha: 0.3 }), S('slam', 170, { dx: 1, tgt: true, lift: 0, ease: 'snap', hit: true, shake: 8 }),
    S('claw', 170, { hit: true }), S('slam', 170, { hit: true }), S('claw', 170, { hit: true }), S('slam', 170, { hit: true }), S('sweep', 330, { hit: true }), S('roar', 170, { hit: true, flash: 0.5 }), S('idle', 300)] },
  zhongyan: { name: '玄冥终焉', sec: 15, forms: M_, segs: [S('charge', 330, { tint: BLACK, glow: 1, glowCol: GOLD, wind: true }), S('summon', 330, { hit: true }), S('roar', 330, { hit: true, shake: 10 }), S('roar', 170, { hit: true }), S('idle', 300)] },
  // §15 魔障屏障：只叠气泡（帧不变，给 guard 一下）
  pingzhang: { name: '魔障屏障', sec: 15, forms: ALL, segs: [S('guard', 300, { glow: 1, glowCol: MAGENTA }), S('idle', 200)] },
  // §16 鬼门关：蓄 → 挥镰开门 → 洪流 → 门收；魔躯 = 鬼步（先冲半步）
  guimen: { name: '鬼门关', sec: 16, forms: ALL, segs: [S('windup', 120, { wind: true }), S('sweep', 130, { hit: true }), ...R('cast', 500, 4), S('cast', 250), S('idle', 250)],
    demon: [S('charge', 170, { wind: true }), S('dash', 170, { dx: 160, ease: 'snap', ghost: 1, add: [0.5, 0.1, 0.4] }), ...R('cast', 670, 5), S('idle', 330)] },
  // §17 魔审：红扇 → 巨爪横拍 → 光柱上撩
  moshen: { name: '魔审', sec: 17, forms: ALL, segs: [S('windup', 100, { wind: true }), S('dash', 100, { dx: 80 }), S('slash', 100, { hit: true }), S('sweep', 200, { hit: true }), S('upper', 125, { hit: true }), S('upper', 125, { hit: true, flash: 0.5 }), S('upper', 100), S('idle', 250)],
    demon: [S('roar', 100, { wind: true, add: [0.6, 0.05, 0.05] }), S('dash', 100), S('claw', 100, { hit: true }), S('sweep', 200, { hit: true }), S('upper', 100, { hit: true }), S('upper', 150, { hit: true, flash: 0.5 }), S('upper', 100, { hit: true }), S('idle', 250, { tint: BLACK })] },
  // §17 魔审第二式（魔躯，有距离时）：犁地冲 → 翻身上撩 → 扑下犁地 → 火
  moshen2: { name: '魔审 · 犁魂', sec: 17, forms: M_, segs: [S('dash', 125, { dx: 300, ease: 'snap', ghost: 1, hit: true }), S('leap', 375, { lift: 0, arcH: 260, dx: 240, hit: true }), S('dive', 125, { lift: 0 }),
    S('claw', 375, { dx: 480, hit: true }), S('slam', 125, { hit: true }), S('idle', 250)] },
  // §18 不灭魔啸：身后魔影 → 整屏白 → 声波五下
  mosiao: { name: '不灭魔啸', sec: 18, forms: ALL, segs: [S('cast', 70), S('roar', 210, { wind: true }), S('roar', 70, { flash: 0.6 }), ...R('roar', 490, 5, { shake: 3, glow: 1, glowCol: MAGENTA }), S('idle', 210, { glow: 0.6, glowCol: MAGENTA }), S('idle', 150)],
    demon: [S('roar', 280, { wind: true, tint: [0.55, 0.5, 1], glow: 1, glowCol: ORANGE }), S('roar', 70, { flash: 0.6 }), ...R('roar', 770, 6, { shake: 5, glow: 1, glowCol: MAGENTA }), S('transform', 140), S('idle', 200)] },
  // §19 末劫天倾（主招，魔躯）：白描边蓄 → 目标脚下品红光柱四段
  tianqing: { name: '末劫天倾', sec: 19, forms: ['half', 'demon'], segs: [], half: [S('summon', 300, { wind: true, glow: 1, glowCol: WHITE }), ...R('summon', 600, 3), S('idle', 300)],
    demon: [S('summon', 300, { wind: true, glow: 1, glowCol: WHITE }), ...R('summon', 900, 4, { glow: 1.3, glowCol: INK }), S('idle', 300)] },   // r19：光柱四段时魔躯一圈暗描边（剪影清楚）
  // §19 末劫狂想（魔躯）：魔气球 → 穹顶 → 整屏品红 → 爆烟地裂
  kuangxiang: { name: '末劫狂想', sec: 19, forms: M_, segs: [S('idle', 120), S('roar', 300, { wind: true, tint: [0.5, 0.45, 1], glow: 1, glowCol: ORANGE }), S('roar', 60, { flash: 0.6, tint: BLACK, hit: true }), S('roar', 120, { hit: true }),
    S('transform', 60, { hit: true }), S('transform', 180, { hit: true, shake: 8 }), S('transform', 180, { hit: true, shake: 8 }), S('idle', 300)] },
  // §19 末劫陷阱：亮剪影 → 蹲按 → 沉进地里 → 旋涡滑向目标（隐藏）→ 光柱 → 从地里钻出
  xianjing: { name: '末劫陷阱', sec: 19, forms: ALL, segs: [S('cast', 100, { flash: 0.8 }), S('summon', 100), S('summon', 200, { lift: -140, ease: 'in', alpha: 0.6 }),
    S('summon', 200, { alpha: 0, dx: 1, tgt: true, lift: -140 }), S('summon', 700, { alpha: 0 }), ...R('summon', 600, 4, { alpha: 0 }), S('upper', 300, { lift: 0, ease: 'out', alpha: 1 }), S('idle', 300)] },
  // §20 灭世重击：剪影蓄 → 冲撞 → 贴身 → 压黑魔焰柱
  mieshi: { name: '灭世重击', sec: 20, forms: ALL, segs: [S('charge', 200, { tint: BLACK, glow: 1, glowCol: WHITE, wind: true }), S('dash', 200, { dx: 300, ease: 'snap', hit: true, ghost: 1 }), S('stab', 300, { hit: true }), S('idle', 300)],
    demon: [S('charge', 200, { tint: BLACK, glow: 1, glowCol: WHITE, wind: true }), S('dash', 200, { dx: 360, ease: 'snap', hit: true, ghost: 1 }), S('claw', 400, { hit: true }),
      S('upper', 200, { add: [0.8, 0.05, 0.05], glow: 1.5, glowCol: RED, hit: true }), ...R('upper', 300, 2, { add: [0.8, 0.05, 0.05], glow: 1.5, glowCol: RED }), S('idle', 300)] },
  kuangnu: { name: '狂怒撕裂', sec: 20, forms: M_, segs: [S('charge', 300, { flash: 0.6, glow: 1, glowCol: WHITE, wind: true }), S('dash', 120, { dx: 280, ease: 'snap', ghost: 1 }), ...R('claw', 400, 3), S('idle', 300)] },
  mieshi_ring: { name: '灭世冲击', sec: 20, forms: M_, segs: [S('charge', 400, { tint: [0.5, 0.4, 0.6], wind: true }), ...R('roar', 500, 3, { shake: 8 }), S('idle', 300)] },
  // §21 永堕 · 混沌弑仙（觉醒一）：黑洞吞身 → 血红魔身 → 乱斩九下 → 金月牙 → X 斩收势
  shixian: { name: '永堕 · 混沌弑仙', sec: 21, forms: M_, segs: [
    S('charge', 200, { wind: true, tint: BLACK }), S('summon', 200, { alpha: 0.3 }), S('aw1_a', 400, { add: [0.22, 0.01, 0.01], glow: 1.5, glowCol: RED }),
    ...Array.from({ length: 9 }, (_, i) => S(i % 2 ? 'aw1_a' : 'aw1_b', 200, { hit: true, tint: i % 3 === 2 ? [0.15, 0.1, 0.12] : undefined, glow: 1.3, glowCol: RED, shake: 2 })),
    S('aw1_b', 200, { hit: true, glow: 1.5, glowCol: GOLD }), S('aw1_c', 300, { hit: true, add: [0.12, 0.0, 0.01], glow: 1.5, glowCol: INK }), S('aw1_c', 300, { hit: true, glow: 1.5, glowCol: INK }), S('idle', 400)] },   // r19：十字光刃、混沌炸开时魔躯不加红、不闪白，外圈一道暗描边（剪影压在金光上）
  // §22 极恶魔潮：白剪影 → 头顶火焰 → 火球 → 轰出（陨石光束）→ 火海
  mochao: { name: '极恶魔潮', sec: 22, forms: M_, segs: [S('cast', 170, { flash: 1 }), S('raise', 170, { wind: true, glow: 1, glowCol: ORANGE }), S('raise', 170, { glow: 1.3, glowCol: ORANGE }), S('throw', 170, { hit: true }), ...R('throw', 330, 2), S('idle', 500)] },
  // §23 末劫梵音 · 灭世魔翼（觉醒二）：大半是演出层（aw2_face / aw2_wings 两张全屏立绘由演出层画），场景立板这边只给：咆哮 → 隐身（演出层）→ 悬空展翼 → 隐身 → 乱斩 → 隐身 → 亮相
  moyi: { name: '末劫梵音 · 灭世魔翼', sec: 23, forms: M_, segs: [
    S('roar', 250, { wind: true }), S('roar', 1000, { alpha: 0 }), S('fly', 500, { lift: 120, ease: 'out', glow: 1.5, glowCol: GOLD }),
    S('fly', 1000, { alpha: 0, lift: 120 }), ...Array.from({ length: 6 }, (_, i) => S(i % 2 ? 'claw' : 'aw1_b', 208, { hit: true, lift: 0, glow: 1.2, glowCol: MAGENTA })),
    S('idle', 500, { alpha: 0 }), S('transform', 500, { hit: true, glow: 1.5, glowCol: INK }), S('transform', 500, { glow: 1.2, glowCol: INK }), S('idle', 500)] },   // r19：金柱那一下魔躯不再加橙色，外圈一道暗描边（剪影压在金光上）
};
/** 试玩页轮播 / 测试的顺序（按规格书的招号） */
export const YWS_MOVE_IDS: string[] = Object.keys(YWS_MOVES).sort((a, b) => YWS_MOVES[a].sec - YWS_MOVES[b].sec);
