// 战斗绘制：敌人、召唤物、掉落、弹道、法术特效、血条与伤害数字
import { EL_COL, elOf } from './foeskills';
import type { Combat, Enemy } from './combat';
import { YAODAN_COL } from './combat';
import type { Drawable } from './life';
import type { Fx } from '../data/arts';
import { drawBeast, BeastLook } from '../gfx/beast';
import { drawBeastSprite, beastSpriteTop, pumpBeastTex, hasBeastSprite, charAnim } from '../gfx/beastTex';
import { drawCharacter, CharState } from '../gfx/character';
import { CharacterFrameCache, type DrawableCharacterFrame } from '../gfx/character-cache';
import { makeCanvas } from '../core/canvas';
import type { StaticSprite } from '../hd2d/staticAtlas';
import { itemDef, TIER_COLORS } from '../data/items';
import { mulberry32 } from '../core/rng';
import { prof } from '../core/prof';
import { QUHUN_LOOK } from '../data/storylooks';
import { artLook } from '../data/artlooks';
import { drawArt } from '../gfx/artifact';
import { vfxProj, vfxBurst, vfxRing, vfxColumn, projSet, burstKey, shieldKey, PROJ_SIZE } from '../gfx/vfxTex';
import { ALT } from './alt';
import { wardY, wardR } from './foemind';
import { AFFIX } from './affix';
import { drawSupUnder, drawSupOver, supSquash } from './suppress';
import { drawTextCached, measureCached, prepareCachedText, drawPreparedText, type PreparedText } from '../gfx/textCache';
import { charBox, beastBox } from '../hd2d/boxes';
import { p1Drawables } from './p1fx';
import { hitFeelPeek } from './hitfeel';   // r9-hitfeel：妖兽挨打闪白
import { hdUi, hdShadows } from '../hd2d/ui';
/** 空中单位的排序偏移：排在所有地面物体之后 */
const AIR_Y = 200000;
/** 立板范围四边各放宽 m（前扑、抖动不出框） */
const padBox = (b: readonly [number, number, number, number], m: number) => [b[0] - m, b[1] + m, b[2] - m, b[3] + m] as const;

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

type EnemyWithYing = Enemy & { ying?: { body: Enemy } };
interface EnemyDrawable extends Drawable { combat: Combat; enemy: EnemyWithYing; alpha: number; time: number; dt: number; cache: boolean; worker: boolean; refresh: boolean; prepared: DrawableCharacterFrame | null }
const enemyDrawables = new WeakMap<Enemy, EnemyDrawable>();
export const characterFrames = new CharacterFrameCache();
const characterRefreshCursor = new WeakMap<Combat, number>();
const enemyMarks = new Map<'shadow' | 'warning' | 'freeze' | 'freezeAir', StaticSprite>();

function enemyMark(kind: 'shadow' | 'warning' | 'freeze' | 'freezeAir'): StaticSprite {
  const found = enemyMarks.get(kind);
  if (found) return found;
  const h = kind === 'freezeAir' ? 110 : 70;
  const box = kind === 'shadow' ? { l: -24, r: 24, t: -7, b: 11 }
    : kind === 'warning' ? { l: -72, r: 72, t: -28, b: 28 }
    : { l: -44, r: 44, t: -h * 1.1 - 2, b: h * 0.1 + 2 };
  const canvas = makeCanvas(Math.ceil((box.r - box.l) * 2), Math.ceil((box.b - box.t) * 2));
  const g = canvas.getContext('2d')!;
  g.setTransform(2, 0, 0, 2, -box.l * 2, -box.t * 2);
  if (kind === 'shadow') {
    g.fillStyle = 'rgba(30,30,24,0.26)'; g.beginPath(); g.ellipse(0, 2, 22, 7, 0, 0, TAU); g.fill();
  } else if (kind === 'warning') {
    g.fillStyle = 'rgb(220,40,30)'; g.beginPath(); g.ellipse(0, 0, 70, 26, 0, 0, TAU); g.fill();
  } else {
    g.fillStyle = 'rgba(190,230,255,0.45)'; g.strokeStyle = 'rgba(240,250,255,0.9)'; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(Math.cos(a) * 42, -h / 2 + Math.sin(a) * h * 0.6); }
    g.closePath(); g.fill(); g.stroke();
  }
  const sprite = { image: canvas, ...box };
  enemyMarks.set(kind, sprite);
  return sprite;
}

function recordCharacter(start: number, mode: ReturnType<CharacterFrameCache['draw']>): void {
  if (!prof.on) return;
  prof.add('R·战斗人物主体', start);
  prof.addMs('R·人物缓存命中', 0, mode === 'reused' || mode === 'deferred' ? 1 : 0);
  prof.addMs('R·人物缓存重绘', 0, mode === 'refreshed' ? 1 : 0);
  prof.addMs('R·人物缓存待刷新', 0, mode === 'deferred' ? 1 : 0);
}

function characterLayers(d: EnemyDrawable, pixelScale: number): ReturnType<NonNullable<Drawable['staticLayers']>> {
  const e = d.enemy, c = d.combat;
  if ((!d.cache && !d.worker) || !e.look || !e.cs) return null;
  if (prof.on) prof.addMs('R·人物静态立板候选', 0, 1);
  const spriteId = e.npcId && hasBeastSprite('n:' + e.npcId) ? 'n:' + e.npcId : 'e:' + e.def.id;
  const reason = e.lift > 0 ? '跳跃' : e.sup ? '威压' : e.def.evil ? '魔修光效' : hasBeastSprite(spriteId) ? '换图' : '';
  if (reason) { if (prof.on) prof.addMs('R·静态排除' + reason, 0, 1); return null; }
  const start = prof.on ? performance.now() : 0, scale = e.ying ? 1.06 * 0.46 : 1.06;
  if (!d.worker) {
    const pending = c.game.renderer?.characterWorkers?.release(e.cs);
    if (pending !== undefined) characterFrames.deferPhysics(e.cs, pending);
  }
  const frame = d.worker ? c.game.renderer!.characterWorkers!.prepare(e.look, e.cs, scale, d.dt, pixelScale, true, undefined, 0)
    : characterFrames.prepare(e.look, e.cs, scale, d.dt, pixelScale, d.refresh);
  if (prof.on) prof.addMs(`R·静态画布${frame.image.width}x${frame.image.height}`, 0, 1);
  d.prepared = frame;
  recordCharacter(start, frame.mode);
  const dx = e.cs.x - e.x, dy = e.cs.y - e.y;
  const body = { image: frame.image, key: 'key' in frame ? frame.key : undefined, revision: frame.revision, l: frame.l + dx, r: frame.r + dx,
    t: frame.t + dy, b: frame.b + dy, alpha: d.alpha };
  const layers: StaticSprite[] = [];
  if (e.windup > 0) layers.push({ ...enemyMark('warning'), alpha: d.alpha * Math.max(0, 0.25 * (1 - e.windup / 0.4)) });
  if (!hdShadows.active) layers.push({ ...enemyMark('shadow'), alpha: d.alpha });
  layers.push(body);
  if (e.st.freeze) layers.push({ ...enemyMark(e.anim.flying ? 'freezeAir' : 'freeze'), alpha: d.alpha });
  const overlay = e.st.root || e.st.shock || e.st.stun ? {
    bounds: [-50, 50, -145, 12] as const,
    draw: (g: G) => { g.save(); g.globalAlpha *= d.alpha; if (e.st.freeze) g.globalCompositeOperation = 'source-over'; drawEnemyStatus(g, e, d.time); g.restore(); },
  } : undefined;
  return { sprites: layers, overlay };
}

const SUMMON_LOOK: Record<string, BeastLook> = {
  fox: { body: 'fox', color: [246, 242, 236], belly: [255, 255, 255], size: 0.85, tails: 3, eye: 'rgba(120,200,255,0.9)', glow: '200,230,255' },
  puppet: { body: 'wolf', color: [150, 130, 100], belly: [180, 160, 130], size: 1.1, eye: 'rgba(120,255,200,0.9)', spikes: true, accent: [90, 80, 70] },
  tihun: { body: 'fox', color: [190, 160, 230], belly: [240, 230, 255], size: 1.1, eye: 'rgba(255,240,140,0.95)', glow: '200,160,255', horn: true },
  demon: { body: 'ghost', color: [200, 50, 60], size: 0.8, eye: 'rgba(255,220,60,0.95)' },
  jiao: { body: 'jiao', color: [60, 150, 120], belly: [190, 230, 200], accent: [220, 240, 200], size: 1.1, glow: '120,240,180' },
};

/** 第三十九步：派系色签（同一派系同一颜色） */
const TEAM_COLS = ['#e0a040', '#60b0e8', '#d070d0', '#e86060', '#70d0b0', '#c8c060', '#a088ff'];
const teamColCache = new Map<string, string>();
let teamColN = 0;
function teamCol(t: string) { let c = teamColCache.get(t); if (!c) { c = TEAM_COLS[teamColN++ % TEAM_COLS.length]; if (teamColCache.size > 200) teamColCache.clear(); teamColCache.set(t, c); } return c; }
export function enemyVis(c: Combat, e: { x: number; y: number; def?: { hide?: boolean }; aggro?: boolean; hideT?: number }) {
  if ((e.hideT ?? 0) > 0) return 0;   // 土遁潜行于地下
  const s = c.game.life.sense;
  // 擅隐匿的妖兽（双瞳鼠、阴芝马）：神识须贴近（约四成半径）或外放方能察觉；一旦惊走则现形
  const R = e.def?.hide && !e.aggro && !(c.game.senseBurstT > 0) ? s.R * 0.45 : s.R;
  return clamp((R - Math.hypot(e.x - s.x, e.y - s.y)) / 110, 0, 1) * ((e as any).affix?.yinOn ? 0.18 : 1);
}

/** 收集需 Y 排序的战斗实体 */
export function collectCombat(c: Combat, out: Drawable[], view: { left: number; top: number; right: number; bottom: number }, t: number, dt: number, hdWorker = false) {
  pumpBeastTex();
  const firstEnemy = out.length;
  for (const e of c.units) {
    if ((e as { gibbed?: boolean }).gibbed) continue;   // 已经炸成碎块了
    if (hdWorker && ((e as { seaHD?: boolean }).seaHD || (e as { bossHD?: boolean }).bossHD)) continue;   // 收官 B2：海兽由 HD 场景里单独的网格画（hd2d/seathings.ts），不进共享的立板图集；r16 夜无赦（bossHD）同理，由 hd2d/bossthings.ts 画
    if (e.x < view.left - 200 || e.x > view.right + 200 || e.y < view.top - 100 || e.y > view.bottom + 260) continue;
    const a = enemyVis(c, e);
    if (a <= 0.01) continue;
    const up = (e.lift > 0 ? e.lift : 0) + (e.flyH ?? 0) + (e.def.flying ? 120 : 0);
    let drawable = enemyDrawables.get(e);
    if (!drawable) {
      const item: EnemyDrawable = { y: 0, combat: c, enemy: e, alpha: a, time: t, dt, cache: false, worker: false, refresh: false, prepared: null,
        staticLayers: (pixelScale) => characterLayers(item, pixelScale), afterStatic: () => emitEnemySparks(item.combat, item.enemy),
        draw: (g) => drawEnemy(g, item.combat, item.enemy, item.alpha, item.time, item.dt, item.cache, item.worker, item.refresh, item.prepared) };
      drawable = item; enemyDrawables.set(e, item);
    }
    drawable.y = e.def.flying || e.flyH > 60 ? e.y + AIR_Y : e.y;   // 升到空中的修士也按「空中的东西」排在后面画
    drawable.hx = e.x; drawable.hy = e.y; drawable.hb = e.look ? charBox(1.06, up) : beastBox(e.def.look?.size ?? 1, up);
    drawable.k = undefined;
    drawable.combat = c; drawable.alpha = a; drawable.time = t; drawable.dt = dt; drawable.prepared = null;
    out.push(drawable);
  }
  const nEnemies = out.length - firstEnemy;
  const crowded = nEnemies >= 120;
  // 远景优化：zoom 远时（z < 0.4），即使敌人不多也启用缓存（远处敌人屏幕上很小，不需要逐帧重画）
  const z = c.game.cam.zoom;
  const farZoom = z < 0.4;
  const workers = c.game.renderer?.characterWorkers;
  const useWorkers = hdWorker && (nEnemies >= 80 || (farZoom && nEnemies >= 20)) && workers?.stats.state === 'ready';
  const candidates: EnemyDrawable[] = [];
  for (let i = firstEnemy; i < out.length; i++) {
    const d = out[i] as EnemyDrawable, e = d.enemy, p = c.game.player;
    const dx = e.x - p.x, dy = e.y - p.y, scale = e.ying ? 1.06 * 0.46 : 1.06;
    // 远景时降低缓存距离阈值：zoom 越小，敌人屏幕尺寸越小，更远的就可以缓存
    const cacheDistSq = farZoom ? 150 * 150 : 220 * 220;
    d.cache = (crowded || farZoom) && !!c.game.renderer?.hd && !!e.look && !!e.cs && !e.dead && d.alpha >= 0.99 && c.lock !== e
      && dx * dx + dy * dy > cacheDistSq && z * scale * e.look.height <= 0.85;
    // 神识圈边缘半透明的人也走后台线程（整张位图按透明度贴上去）；以前这批人每帧在主线程直接画，千人战里占 87 ms
    d.worker = !!useWorkers && !!e.look && !!e.cs && !e.look.headTex && !e.dead && c.lock !== e
      && c.game.cam.zoom * scale * e.look.height <= 0.85;
    d.refresh = d.worker;
    if (d.cache && !d.worker) candidates.push(d);
  }
  if (candidates.length) {
    const start = (characterRefreshCursor.get(c) ?? 0) % candidates.length;
    const budget = Math.min(256, Math.ceil(candidates.length / 4));
    for (let i = 0; i < budget; i++) candidates[(start + i) % candidates.length].refresh = true;
    characterRefreshCursor.set(c, (start + budget) % candidates.length);
  }
  c.gore?.collect(out);   // 炸开的碎块（放在上面按下标处理敌人的那一段之后：那一段把 firstEnemy 以后的都当敌人）
  c.brawl?.brk.collect(out, view);   // 近战 E2：礁石、巨石、枯树、船骸（world/breakables.ts，立板）
  c.wreck?.collect(out, view);   // 野外破坏：石头碎成的大块、拔起来拿着 / 飞着的石头（world/wreck.ts）
  for (const s of c.summons) {
    if (s.kind === 'bugs') continue;
    if (s.kind === 'quhun' && s.cs) { const cs = s.cs; out.push({ y: s.y, hx: s.x, hy: s.y, hb: charBox(1.12), k: 'D·召唤', draw: (g) => { g.save(); g.globalAlpha *= Math.min(1, s.t * 2); drawCharacter(g, QUHUN_LOOK, cs, 1.12, 0); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(120,255,170,0.5)'; g.beginPath(); g.arc(s.x, s.y - 150, 3, 0, Math.PI * 2); g.fill(); g.restore(); } }); continue; }
    // 第三十步：现身时由小到大、由淡到浓；出手时朝目标前扑；将散时闪烁；心魔合体放大
    // HD2D：立成立板（原先没给脚底和范围，被当成贴地的东西平铺在地上）；前扑的位移、心魔合体的放大都算进范围
    const sz = (SUMMON_LOOK[s.kind] ?? SUMMON_LOOK.fox).size * (s.big ?? 1);
    const sz0 = s.z ?? 0;   // P6：召唤物的高度（会飞的跟着主人的高度走）
    out.push({ y: s.kind === 'demon' || sz0 > 60 ? s.y + AIR_Y : s.y, hx: s.x, hy: s.y, hb: padBox(beastBox(sz, (s.kind === 'demon' ? 120 : 0) + sz0), 30 * (s.big ?? 1)), k: 'D·召唤', draw: (g) => {
      const age = s.age ?? 9, atk = s.atk ?? 0, B = s.big ?? 1;
      const grow = age < 0.35 ? 0.4 + 0.6 * (1 - Math.pow(1 - age / 0.35, 3)) : 1;
      const lunge = atk > 0 ? Math.sin(Math.min(1, (1 - atk) * 2.2) * Math.PI) * 22 * B : 0;
      const dir = s.ax !== undefined ? Math.atan2(s.ay - s.y, s.ax - s.x) : 0;
      const x = s.x + Math.cos(dir) * lunge, y = s.y + Math.sin(dir) * lunge * 0.6;
      const A = { move: Math.min(1, (s.mv ?? 1) + atk * 0.5), phase: s.phase, atk: atk > 0.2 ? Math.min(1, atk * 1.4) : 0, hit: 0, t: s.phase / 8, flying: s.kind === 'demon' };
      g.save();
      g.globalAlpha *= Math.min(1, age * 3) * (s.t < 2.5 ? 0.65 + 0.35 * Math.cos(s.t * 14) : 1) * Math.min(1, s.t * 3 + 0.2);
      if (sz0 > 1) g.translate(0, -sz0);
      if (!drawBeastSprite(g, 's:' + s.kind, x, y, s.facing, A, grow * B)) drawBeast(g, SUMMON_LOOK[s.kind] ?? SUMMON_LOOK.fox, x, y, s.facing, A, grow * B);
      g.restore();
    } });
  }
  for (const l of c.loot) {
    const a = enemyVis(c, l);
    if (a <= 0.01) continue;
    // P2：掉落物立起来（原来没给脚底和范围，被当成贴地的东西平铺在地上）：悬在半空轻轻浮动，头顶一道按品阶上色的光柱
    out.push({ y: l.y, hx: l.x, hy: l.y, hb: [-56, 56, -96, 30], k: 'D·掉落', draw: (g) => drawLoot(g, l, t, a, hdWorker) });
  }
  c.acts.collect(out);
  if (c.shield?.art) {   // 法器盾：实体悬浮
    const s = c.shield, sp = c.shieldPos(), L = artLook(s.art!), k = s.amt / s.max;
    // P2：法器盾立起来（悬在身侧，按盾的高度留出范围；原先平铺在地上）
    // 盾牌跟着人一起浮（御剑/飞行高度 st.lift）；地面那圈影子留在原地并按高度变淡
    const lift = c.game.player.st.lift || 0;
    // 御剑飞行时主角的排序 y 被抬到 p.y + 200000（render.ts 里那行），排在一切景物之上；
    // 法器盾要跟着这个偏移，否则飞行时它永远排在主角之前 → 绕到身前也会被人物盖住。
    const pf = c.game.player;
    const pSort = pf.flying && !c.game.yuanying.active ? 200000 : 0;
    out.push({ y: (sp.front ? sp.y + 20 : sp.y - 40) + pSort, hx: sp.x, hy: sp.y, hb: [-96, 96, -(sp.h + 130 + lift), 26], k: 'D·法器盾', draw: (g) => {
      g.save(); g.fillStyle = `rgba(20,16,10,${0.16 * Math.max(0.25, 1 - lift / 120)})`; g.beginPath(); g.ellipse(sp.x, sp.y + 4, 16, 5, 0, 0, TAU); g.fill(); g.restore();
      drawArt(g, L, sp.x, sp.y - sp.h - lift, 52 + c.blockT * 10, Math.cos(c.shieldAng) * 0.25 + Math.sin(t * 1.6) * 0.04, 0.55 + 0.45 * k);
    } });
  }
  // 第二十八步：雷遁 / 血遁残影（半透明人形）
  for (const gh of c.ghosts) {
    if (gh.t < 0) continue;
    const p = c.game.player, k = 1 - gh.t / gh.dur;
    out.push({ y: gh.y - 1, hx: gh.x, hy: gh.y, hb: charBox(1.12, p.st.lift), k: 'D·残影', draw: (g) => { g.save(); g.globalAlpha *= 0.42 * k; const st = p.st; const ox = st.x, oy = st.y, oyaw = st.yaw; st.x = gh.x; st.y = gh.y; st.yaw = gh.yaw; drawCharacter(g, p.look, st, 1.12, 0); st.x = ox; st.y = oy; st.yaw = oyaw; g.restore(); } });
  }
  brawlGhosts(c, out);   // 近战：被击飞者的残影、缩地留下的墨影（world/brawl.ts，限六个）
  p1Drawables(c.brawl, out, dt);   // r8-p1 撼山客第一阶段：闪步残影、全身亮边、蓝影、被打者闪白（world/p1fx.ts）
  if (c.decoy) {
    const d = c.decoy, p = c.game.player;
    out.push({ y: d.y, hx: d.x, hy: d.y, hb: charBox(1.12), k: 'D·替身', draw: (g) => { g.save(); g.globalAlpha = 0.6 + 0.2 * Math.sin(t * 6); const st = p.st; const ox = st.x, oy = st.y; st.x = d.x; st.y = d.y; drawCharacter(g, p.look, st, 1.12, 0); st.x = ox; st.y = oy; g.restore(); } });
  }
}

function drawEnemy(g: G, c: Combat, e: EnemyWithYing, alpha: number, t: number, dt: number, cache: boolean, worker: boolean, refresh: boolean, prepared: DrawableCharacterFrame | null) {
  const timing = prof.on;
  let section = timing ? performance.now() : 0;
  g.save();
  g.globalAlpha *= alpha * (e.dead ? Math.max(0, 1 - e.deathT / 0.8) : 1);
  if (e.dead) { g.translate(e.x, e.y); g.scale(1 + e.deathT * 0.3, 1 - e.deathT * 0.6); g.translate(-e.x, -e.y); }
  // 锁定标记
  if (c.lock === e && !e.dead) {
    // r11-lock：立体画面里锁定环改由 gl/lockgl.ts 横躺着画在脚下（这里画进人物立板会跟着立起来，看不出是个圈）；平面兼容画法仍画这圈
    if (!c.game.renderer?.hd) {
    g.strokeStyle = c.manual ? 'rgba(255,232,160,0.95)' : 'rgba(240,214,140,0.8)'; g.lineWidth = c.manual ? 3 : 2.5;   // 第三十八步：淡金锁定环（手动锁定更亮）
    const r = 34 + Math.sin(t * 6) * 3;
    g.beginPath(); g.ellipse(e.x, e.y + 2, r * 1.3, r * 0.45, 0, 0, TAU); g.stroke();
    for (let i = 0; i < 4; i++) { const a = t * 1.5 + i * Math.PI / 2; g.beginPath(); g.ellipse(e.x, e.y + 2, r * 1.6, r * 0.6, 0, a, a + 0.4); g.stroke(); }
    }
    // 高度差：它比你高 / 低多少；近身够不着时标成红色（法术、飞剑照打，贴身的招式要先飞到同一高度）
    { const dz = Math.round(e.z - c.game.player.z);
      if (Math.abs(dz) > 30) {
        const far = Math.abs(dz) > ALT.meleeReach;
        g.save(); g.font = 'bold 15px "Noto Serif SC",serif'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(20,16,12,0.75)'; g.fillStyle = far ? '#ff9a8a' : '#f0e0a8';
        const s = (dz > 0 ? '▲ 高 ' : '▼ 低 ') + Math.abs(dz) + (far ? ' · 近身够不着' : '');
        g.strokeText(s, e.x, e.y + 34); g.fillText(s, e.x, e.y + 34); g.restore();
      } }
  }
  // 窥破蓄力：红色警示
  if (e.windup > 0) { g.fillStyle = `rgba(220,40,30,${0.25 * (1 - e.windup / 0.4)})`; g.beginPath(); g.ellipse(e.x, e.y, 70, 26, 0, 0, TAU); g.fill(); }
  // 跃起（扑击）：地面留影，身形抬高
  // （修士的飞行高度由人物画法自己抬；妖兽没有那套画法，升空的高度也在这里抬）
  const rise = (e.lift > 0 ? e.lift : 0) + (e.look && e.cs ? 0 : e.flyH);
  if (rise > 0) { g.fillStyle = `rgba(20,16,12,${Math.max(0.08, 0.3 - rise / 900)})`; g.beginPath(); g.ellipse(e.x, e.y + 2, 30 + Math.min(rise, 200) * 0.05, 9 + Math.min(rise, 200) * 0.015, 0, 0, TAU); g.fill(); }
  // 飞得高了：垂一条虚线到地面，看得出它在哪个位置的上空
  if (e.z > ALT.plumb && !e.dead) {
    g.save(); g.strokeStyle = e.ally ? 'rgba(200,240,220,0.4)' : 'rgba(255,214,200,0.42)'; g.lineWidth = 1.6; g.setLineDash([7, 9]);
    g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(e.x, e.y - e.z + 8); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.ellipse(e.x, e.y + 2, 15, 5, 0, 0, TAU); g.stroke(); g.restore();
  }
  if (rise > 0) g.translate(0, -rise);
  // 第四十一步：境界压制——脚下法印 / 地裂，身形压矮发颤
  const sv = c.sup.view(e);
  if (sv) { drawSupUnder(g, e.x, e.y, sv, t); g.save(); supSquash(g, e.x, e.y, sv, t); }
  const msk = e.npcId && hasBeastSprite('n:' + e.npcId) ? 'n:' + e.npcId : 'e:' + e.def.id;   // v0.56：模组给这个修士 / 这个人换了图
  if (timing) { prof.add('R·单位前置', section); section = performance.now(); }
  if (e.look && e.cs && hasBeastSprite(msk) && drawBeastSprite(g, msk, e.x, e.y, e.facing, charAnim(e.cs, t), e.ying ? 0.46 : 1)) { /* 已画 */ }
  else if (e.look && e.cs) {
    g.fillStyle = 'rgba(30,30,24,0.26)'; g.beginPath(); g.ellipse(e.x, e.y + 2, 22, 7, 0, 0, TAU); g.fill();
    const charStart = prof.on ? performance.now() : 0;
    const scale = e.ying ? 1.06 * 0.46 : 1.06;
    if (prepared) {
      characterFrames.drawFrame(g, prepared, e.cs.x, e.cs.y);
      if (prof.on) prof.add('R·战斗人物主体', charStart, 0);
    } else if (worker) {
      const transform = g.getTransform(), pixelScale = Math.hypot(transform.a, transform.b);
      const frame = c.game.renderer!.characterWorkers!.prepare(e.look, e.cs, scale, dt, pixelScale, true, undefined, 0);
      characterFrames.drawFrame(g, frame, e.cs.x, e.cs.y); recordCharacter(charStart, frame.mode);
    } else {
      const pending = c.game.renderer?.characterWorkers?.release(e.cs);
      if (pending !== undefined) characterFrames.deferPhysics(e.cs, pending);
      recordCharacter(charStart, characterFrames.draw(g, e.look, e.cs, scale, e.dead ? 0 : dt, cache, refresh));
    }
    // 魔修血光
    if (e.def.evil) { g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(e.x, e.y - 50, 0, e.x, e.y - 50, 70); gr.addColorStop(0, 'rgba(200,30,40,0.18)'); gr.addColorStop(1, 'rgba(200,30,40,0)'); g.fillStyle = gr; g.fillRect(e.x - 70, e.y - 120, 140, 140); }
  } else if (e.def.look) {
    if (e.blv >= 5 && !e.dead) drawYaoqi(g, e, t);
    if (!drawBeastSprite(g, 'e:' + e.def.id, e.x, e.y, e.facing, e.anim, 1)) drawBeast(g, e.def.look, e.x, e.y, e.facing, e.anim, 1);
    // r9-hitfeel：妖兽挨打闪白（一两帧）：同一个样子压成白再盖一层（人形的闪白走 p1fx 的立板）
    const until = hitFeelPeek(c)?.beastFlash.get(e) ?? 0;
    if (until > 0 && (typeof performance !== 'undefined' ? performance.now() : 0) < until && !e.dead) {
      g.save(); g.filter = 'brightness(0) invert(1)'; g.globalAlpha *= 0.92;
      if (!drawBeastSprite(g, 'e:' + e.def.id, e.x, e.y, e.facing, e.anim, 1)) drawBeast(g, e.def.look, e.x, e.y, e.facing, e.anim, 1);
      g.restore();
    }
  }
  if (timing) { prof.add('R·单位主体含影', section); section = performance.now(); }
  if (sv) { g.restore(); drawSupOver(g, e.x, e.y, sv, t, e.anim.flying ? 170 : e.look ? 120 : 70 + 40 * (e.def.look?.size ?? 1)); }
  // 异状表现 —— 远景优化：zoom < 0.35 时跳过远处敌人的状态特效（屏幕上太小看不见）
  { const z = c.game.cam.zoom, p = c.game.player;
    const distSq = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    const skipFx = z < 0.35 && distSq > 300 * 300;
    if (!skipFx) {
      if (e.st.freeze) { g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(190,230,255,0.45)'; g.strokeStyle = 'rgba(240,250,255,0.9)'; g.lineWidth = 1.5; g.beginPath(); const h = e.anim.flying ? 110 : 70; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(e.x + Math.cos(a) * 42, e.y - h / 2 + Math.sin(a) * h * 0.6); } g.closePath(); g.fill(); g.stroke(); }
      emitEnemySparks(c, e);
      drawEnemyStatus(g, e, t);
    }
  }
  if (timing) { prof.add('R·单位状态绘制', section); section = performance.now(); }
  g.restore();
  if (timing) prof.add('R·单位收尾', section);
}

function drawEnemyStatus(g: G, e: Enemy, t: number): void {
  if (e.st.root) { g.strokeStyle = 'rgba(90,150,60,0.9)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = i * 1.6 + t; g.beginPath(); g.moveTo(e.x + Math.cos(a) * 30, e.y + 4); g.quadraticCurveTo(e.x + Math.cos(a + 1) * 10, e.y - 30, e.x + Math.cos(a + 2) * 20, e.y - 46); g.stroke(); } }
  if (e.st.shock || e.st.stun) { g.strokeStyle = e.st.shock ? 'rgba(200,210,255,0.9)' : 'rgba(255,230,120,0.9)'; g.lineWidth = 1.5; const hy = e.y - (e.anim.flying ? 130 : 90); for (let i = 0; i < 3; i++) { const a = t * 4 + i * TAU / 3; g.beginPath(); g.arc(e.x + Math.cos(a) * 16, hy + Math.sin(a) * 5, 3, 0, TAU); g.stroke(); } }
}

function emitEnemySparks(c: Combat, e: Enemy): void {
  if (e.st.burn && Math.random() < 0.5) c.sparks.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y - Math.random() * 60, vx: 0, vy: -60, t: 0, max: 0.5, size: 4, color: '255,130,40' });
  if (e.st.poison && Math.random() < 0.3) c.sparks.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y - Math.random() * 50, vx: 0, vy: -30, t: 0, max: 0.7, size: 3, color: '140,210,60' });
}

/** 妖气：五级以上妖兽周身缭绕，等阶越高越浓；八级以上（化形大妖）脚下有妖纹旋转 */
function drawYaoqi(g: G, e: Enemy, t: number) {
  const L = e.def.look!, k = e.blv - 4, sz = L.size;
  const col = L.glow ?? (e.def.evil ? '150,60,170' : '170,70,50');
  const fly = e.anim.flying ? 70 : 0;
  g.save();
  // 地面暗晕
  const r0 = 60 * sz * (0.8 + k * 0.12);
  const gr = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, r0);
  gr.addColorStop(0, `rgba(30,10,10,${0.1 + k * 0.025})`); gr.addColorStop(1, 'rgba(30,10,10,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(e.x, e.y + 2, r0, r0 * 0.36, 0, 0, TAU); g.fill();
  g.globalCompositeOperation = 'lighter';
  // 上升的妖气丝缕
  const n = 2 + k;
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.45 + i / n) % 1, sx = Math.sin(i * 2.3 + e.id * 7) * 34 * sz;
    const x = e.x + sx + Math.sin(t * 2 + i) * 8, y = e.y - fly - 20 * sz - ph * 110 * sz;
    const a = Math.sin(ph * Math.PI) * (0.09 + k * 0.012);
    const rr = (10 + ph * 22) * sz;
    const w = g.createRadialGradient(x, y, 0, x, y, rr);
    w.addColorStop(0, `rgba(${col},${a})`); w.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = w; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // 化形大妖：脚下妖纹
  if (e.blv >= 8) {
    g.strokeStyle = `rgba(${col},0.32)`; g.lineWidth = 2;
    const R = 92 * sz;
    for (let i = 0; i < 6; i++) { const a0 = t * 0.6 + i * TAU / 6; g.beginPath(); g.ellipse(e.x, e.y + 2, R, R * 0.36, 0, a0, a0 + 0.6); g.stroke(); }
    g.strokeStyle = `rgba(${col},0.18)`; g.beginPath(); g.ellipse(e.x, e.y + 2, R * 0.7, R * 0.25, 0, 0, TAU); g.stroke();
  }
  g.restore();
}

/** 妖丹：一枚内蕴灵光的圆丹，按等阶变色；五级以上有光柱 */
function drawYaodan(g: G, l: { x: number; y: number; id: string; t: number }, t: number, a: number) {
  const lv = parseInt(l.id.slice(10)) || 1, col = YAODAN_COL[lv] ?? '220,220,200';
  const bob = Math.sin(t * 3 + l.x) * 4 - Math.max(0, 1 - l.t * 2) * 40;
  const x = l.x, y = l.y - 22 + bob, r = 7 + lv * 0.6;
  g.save(); g.globalAlpha *= a; g.globalCompositeOperation = 'lighter';
  if (lv >= 5) { const pg = g.createLinearGradient(x, y - 130, x, y); pg.addColorStop(0, `rgba(${col},0)`); pg.addColorStop(1, `rgba(${col},0.28)`); g.fillStyle = pg; g.fillRect(x - 5, y - 130, 10, 130); }
  const R = 24 + lv * 3.5 + Math.sin(t * 4) * 2.5;
  const gr = g.createRadialGradient(x, y, 0, x, y, R);
  gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  for (let i = 0; i < 2 + (lv >> 2); i++) { const an = t * 2.4 + i * TAU / (2 + (lv >> 2)); const ox = Math.cos(an) * (r + 9), oy = Math.sin(an) * (r + 9) * 0.45; g.fillStyle = `rgba(${col},0.9)`; g.beginPath(); g.arc(x + ox, y + oy, 1.6, 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  const cg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
  cg.addColorStop(0, 'rgba(255,255,250,1)'); cg.addColorStop(0.45, `rgba(${col},1)`); cg.addColorStop(1, `rgba(${col.split(',').map((v) => (+v * 0.45) | 0).join(',')},1)`);
  g.fillStyle = cg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(40,30,20,0.5)'; g.lineWidth = 1; g.stroke();
  g.restore();
}

function drawLoot(g: G, l: { x: number; y: number; id: string; n: number; t: number }, t: number, a: number, hd = false) {
  if (l.id.startsWith('mat_yaodan')) { drawYaodan(g, l, t, a); return; }
  const d = itemDef(l.id);
  const col = TIER_COLORS[d.tier] ?? '#888';
  const bob = Math.sin(t * 3 + l.x) * 4 - Math.max(0, 1 - l.t * 3) * 30;
  g.save(); g.globalAlpha *= a;
  g.globalCompositeOperation = 'lighter';
  // 光柱画在特效层（gl/combatgl.ts 的「掉落物的光柱」），这里只画物件本身
  // 立体画面里不画这团柔光：立板不是叠加混合，一团 0.4 的白在夜里成了物件背后一块灰白的「墓碑」形（被立板下沿切平）；光由特效层的光柱和点光源给
  if (!hd) {
  const gr = g.createRadialGradient(l.x, l.y - 14 + bob, 0, l.x, l.y - 14 + bob, 34);
  const rare = d.type === 'scroll' || d.type === 'artifact';
  gr.addColorStop(0, rare ? 'rgba(255,220,120,0.6)' : 'rgba(200,255,220,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(l.x - 34, l.y - 48 + bob, 68, 68);
  if (rare) { g.strokeStyle = 'rgba(255,230,150,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(l.x, l.y - 14 + bob); g.lineTo(l.x, l.y - 90 - Math.sin(t * 2) * 10); g.stroke(); }
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(250,244,228,0.95)'; g.strokeStyle = col; g.lineWidth = 2;
  g.beginPath(); g.arc(l.x, l.y - 14 + bob, 12, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = col; g.font = 'bold 14px "Noto Serif SC","Songti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(d.glyph, l.x, l.y - 13 + bob);
  g.restore();
}

// ------------------------------------------------------------------ 特效层（发光）
function jag(g: G, x1: number, y1: number, x2: number, y2: number, seed: number, amp: number, segs = 9) {
  const rnd = mulberry32(seed | 0);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  g.beginPath(); g.moveTo(x1, y1);
  for (let i = 1; i < segs; i++) { const u = i / segs, o = (rnd() - 0.5) * amp * Math.sin(u * Math.PI) * 2; g.lineTo(x1 + dx * u + nx * o, y1 + dy * u + ny * o); }
  g.lineTo(x2, y2);
}
function glowDot(g: G, x: number, y: number, r: number, color: string, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,255,245,${a})`); gr.addColorStop(0.3, `rgba(${color},${0.8 * a})`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// 第二十四步：外部 AI 绘制的特效关键图，各法术弹头的世界尺寸（主角约 108 高）
function drawProj(g: G, pr: any, t: number) {
  const ang = Math.atan2(pr.vy, pr.vx), s = pr.size ?? 1, col = pr.color as string, fx = pr.fx as Fx;
  const tr = pr.trail as [number, number][];
  {
    const set = projSet(fx, col);
    if (set) {
      const sz = (PROJ_SIZE[set] ?? 70) * Math.min(2.2, Math.max(0.7, s)) * (pr.fac === 'p' ? 1 : 0.9);
      const tl = tr.length > 1 ? Math.min(260 * s, Math.hypot(tr[0][0] - pr.x, tr[0][1] - pr.y)) : 0;
      const fade = Math.min(1, pr.life / 0.06);
      glowDot(g, pr.x, pr.y, sz * 0.55, col, 0.45 * fade);
      if (vfxProj(g, set, pr.x, pr.y, ang, sz, tl, (fx === 'mind' ? 0.6 : 0.96) * fade, t + pr.x * 0.01)) return;
    }
  }
  const trail = (w: number, a: number) => { if (tr.length < 2) return; for (let i = 1; i < tr.length; i++) { const k = i / tr.length; g.strokeStyle = `rgba(${col},${a * k})`; g.lineWidth = w * k; g.beginPath(); g.moveTo(tr[i - 1][0], tr[i - 1][1]); g.lineTo(tr[i][0], tr[i][1]); g.stroke(); } };
  g.lineCap = 'round';
  switch (fx) {
    case 'fireball': case 'talisman': case 'blood': case 'gold':
      trail(14 * s, 0.5);
      glowDot(g, pr.x, pr.y, 26 * s, col);
      if (fx === 'talisman' && pr.life < 0.12) { g.fillStyle = '#f0d070'; g.fillRect(pr.x - 7, pr.y - 11, 14, 22); }
      break;
    case 'firesnake': case 'dragon': {
      const w = fx === 'dragon' ? 26 : 12;
      for (let i = 1; i < tr.length; i++) { const k = i / tr.length; const wob = Math.sin(t * 14 - i * 0.9) * 6 * k; g.strokeStyle = `rgba(${col},${0.85 * k})`; g.lineWidth = w * s * (0.4 + k); g.beginPath(); g.moveTo(tr[i - 1][0], tr[i - 1][1] + wob); g.lineTo(tr[i][0], tr[i][1] + wob); g.stroke(); }
      glowDot(g, pr.x, pr.y, (fx === 'dragon' ? 44 : 22) * s, col);
      if (fx === 'dragon') { g.strokeStyle = `rgba(230,255,240,0.8)`; g.lineWidth = 2; g.beginPath(); g.moveTo(pr.x, pr.y - 10); g.lineTo(pr.x - Math.cos(ang) * 30 - 10, pr.y - 34); g.moveTo(pr.x, pr.y - 6); g.lineTo(pr.x - Math.cos(ang) * 30 + 6, pr.y - 36); g.stroke(); }
      break;
    }
    case 'crow': {
      trail(8, 0.4);
      g.save(); g.translate(pr.x, pr.y); g.rotate(ang);
      const f = Math.sin(t * 20 + pr.x) * 8;
      g.fillStyle = `rgba(${col},0.9)`; g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -12 - f); g.lineTo(-2, 0); g.lineTo(-6, 12 + f); g.closePath(); g.fill();
      g.restore(); glowDot(g, pr.x, pr.y, 18, col, 0.7);
      break;
    }
    case 'icicle': case 'needle': case 'mind': case 'sword': case 'leaf': case 'goldthunder': {
      const L = fx === 'needle' ? 22 : fx === 'sword' ? 46 * s : fx === 'mind' ? 30 : 30 * s;
      trail(fx === 'needle' ? 2 : 6 * s, fx === 'mind' ? 0.25 : 0.45);
      g.save(); g.translate(pr.x, pr.y); g.rotate(ang);
      if (fx === 'sword') {
        g.fillStyle = `rgba(${col},0.95)`; g.beginPath(); g.moveTo(L * 0.6, 0); g.lineTo(-L * 0.3, -4); g.lineTo(-L * 0.3, 4); g.closePath(); g.fill();
        g.fillStyle = '#d8c070'; g.fillRect(-L * 0.36, -7, 4, 14); g.fillStyle = `rgba(${col},0.7)`; g.fillRect(-L * 0.5, -2, L * 0.14, 4);
      } else if (fx === 'leaf') {
        g.fillStyle = `rgba(${col},0.95)`; g.beginPath(); g.ellipse(0, 0, L * 0.5, 6, 0, 0, TAU); g.fill();
      } else if (fx === 'mind') {
        g.strokeStyle = `rgba(${col},0.55)`; g.lineWidth = 2; g.beginPath(); g.moveTo(L * 0.5, 0); g.lineTo(-L * 0.5, -6); g.moveTo(L * 0.5, 0); g.lineTo(-L * 0.5, 6); g.stroke();
      } else {
        g.fillStyle = fx === 'goldthunder' ? 'rgba(255,240,170,0.95)' : 'rgba(235,248,255,0.95)'; g.beginPath(); g.moveTo(L * 0.5, 0); g.lineTo(-L * 0.5, -(fx === 'needle' ? 1.5 : 5)); g.lineTo(-L * 0.5, fx === 'needle' ? 1.5 : 5); g.closePath(); g.fill();
      }
      g.restore();
      glowDot(g, pr.x, pr.y, (fx === 'needle' ? 10 : 20) * s, col, fx === 'mind' ? 0.4 : 0.8);
      break;
    }
    case 'wind': {
      g.save(); g.translate(pr.x, pr.y); g.rotate(ang);
      for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(${col},${0.8 - i * 0.25})`; g.lineWidth = (5 - i) * s; g.beginPath(); g.arc(-i * 10, 0, 24 * s, -1.1, 1.1); g.stroke(); }
      g.restore();
      break;
    }
    case 'tornado': case 'water': {
      const h = fx === 'water' ? 90 : 110;
      for (let i = 0; i < 8; i++) { const k = i / 8; const r = (14 + k * 34) * s; g.strokeStyle = `rgba(${col},${0.6 - k * 0.3})`; g.lineWidth = 3; g.beginPath(); g.ellipse(pr.x + Math.sin(t * 8 + i) * 6, pr.y + 30 - k * h, r, r * 0.3, 0, t * 6 + i, t * 6 + i + 4.5); g.stroke(); }
      break;
    }
    case 'vine': {
      trail(4, 0.8);
      g.strokeStyle = `rgba(${col},0.95)`; g.lineWidth = 3;
      for (let i = 1; i < tr.length; i++) { const wob = Math.sin(i * 1.4 + t * 10) * 5; g.beginPath(); g.moveTo(tr[i - 1][0], tr[i - 1][1] + wob); g.lineTo(tr[i][0], tr[i][1] - wob); g.stroke(); }
      glowDot(g, pr.x, pr.y, 16, col, 0.6);
      break;
    }
    case 'ghost': {
      trail(12, 0.4);
      glowDot(g, pr.x, pr.y, 22, col, 0.8);
      g.fillStyle = 'rgba(20,20,30,0.6)'; g.beginPath(); g.arc(pr.x - 4, pr.y - 2, 2.2, 0, TAU); g.arc(pr.x + 4, pr.y - 2, 2.2, 0, TAU); g.fill();
      break;
    }
    case 'rock': { g.fillStyle = 'rgba(150,120,80,0.95)'; g.beginPath(); g.arc(pr.x, pr.y, 12 * s, 0, TAU); g.fill(); break; }
    case 'flame': case 'icefire': default:
      trail(16 * s, 0.5);
      glowDot(g, pr.x, pr.y, 30 * s, col);
  }
}

function drawField(g: G, f: any, t: number) {
  const k = clamp(f.t / 0.3, 0, 1) * clamp((f.dur - f.t) / 0.4, 0, 1);
  const col = f.color as string;
  g.save();
  g.translate(f.x, f.y);
  g.scale(1, 0.55);
  switch (f.fx as Fx) {
    case 'flame': {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r);
      gr.addColorStop(0, `rgba(255,200,120,${0.5 * k})`); gr.addColorStop(0.6, `rgba(${col},${0.35 * k})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
      g.scale(1, 1 / 0.55);
      for (let i = 0; i < 14; i++) { const a = t * 2.4 + i * 0.45, r = f.r * (0.2 + 0.8 * ((i * 0.37 + t * 0.7) % 1)); const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.55; const h = 40 + 30 * Math.sin(t * 9 + i); g.fillStyle = `rgba(255,${150 + (i % 3) * 30},60,${0.55 * k})`; g.beginPath(); g.moveTo(x - 10, y); g.quadraticCurveTo(x - 4, y - h * 0.6, x, y - h); g.quadraticCurveTo(x + 4, y - h * 0.6, x + 10, y); g.fill(); }
      break;
    }
    case 'lightning': {
      g.strokeStyle = `rgba(${col},${0.7 * k})`; g.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * f.r, Math.sin(a) * f.r); g.stroke(); }
      for (const rr of [0.4, 0.7, 1]) { g.beginPath(); g.arc(0, 0, f.r * rr, 0, TAU); g.stroke(); }
      g.scale(1, 1 / 0.55);
      if (Math.random() < 0.5) { const a = Math.random() * TAU, r = Math.random() * f.r; g.strokeStyle = `rgba(230,240,255,${0.9 * k})`; jag(g, 0, 0, Math.cos(a) * r, Math.sin(a) * r * 0.55, Math.random() * 1e6, 18); g.stroke(); }
      break;
    }
    case 'rock': {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r);
      gr.addColorStop(0, `rgba(160,120,70,${0.5 * k})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
      g.strokeStyle = `rgba(120,90,50,${0.6 * k})`; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, f.r * (0.3 + i * 0.25), t * (i + 1), t * (i + 1) + 4); g.stroke(); }
      break;
    }
    case 'sword': case 'star': {
      g.strokeStyle = `rgba(${col},${0.7 * k})`; g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.stroke();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + t * 0.4; g.beginPath(); g.moveTo(Math.cos(a) * f.r * 0.9, Math.sin(a) * f.r * 0.9); g.lineTo(Math.cos(a) * f.r * 1.05, Math.sin(a) * f.r * 1.05); g.stroke(); }
      g.scale(1, 1 / 0.55);
      // 剑丝如雨
      for (let i = 0; i < 18; i++) {
        const ph = (t * 2.5 + i * 0.37) % 1;
        const x = Math.sin(i * 12.9898) * f.r * 0.85, y = Math.cos(i * 78.233) * f.r * 0.45;
        const yy = y - 260 * (1 - ph);
        g.strokeStyle = `rgba(${col},${0.9 * k * (1 - ph * 0.3)})`; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(x, yy - 40); g.lineTo(x, yy); g.stroke();
        if (ph > 0.9) glowDot(g, x, y, 16, col, k);
      }
      if (f.fx === 'star') for (let i = 0; i < 20; i++) glowDot(g, Math.sin(i * 3.1 + t * 0.3) * f.r, Math.cos(i * 1.7 + t * 0.2) * f.r * 0.5, 6 + 4 * Math.sin(t * 3 + i), col, k);
      break;
    }
    case 'array': {
      if (vfxRing(g, 'array_activate_ring', 0, 0, f.r * 1.08, 0.85 * k, t * 0.25)) {
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r); gr.addColorStop(0, `rgba(${col},${0.1 * k})`); gr.addColorStop(1, `rgba(${col},${0.18 * k})`);
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
        if (f.t < 0.6) { g.scale(1, 1 / 0.55); vfxBurst(g, 'array_activate_burst', 0, -f.r * 0.3, f.r * 0.7, f.t / 0.6, 0, 1, 0.8); }
        break;
      }
      g.strokeStyle = `rgba(${col},${0.8 * k})`; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, f.r * 0.82, 0, TAU); g.stroke();
      g.save(); g.rotate(t * 0.5);
      g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * TAU; const x = Math.cos(a) * f.r * 0.82, y = Math.sin(a) * f.r * 0.82; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      g.beginPath(); for (let i = 0; i <= 5; i++) { const a = (i * 2 / 5) * TAU; const x = Math.cos(a) * f.r * 0.6, y = Math.sin(a) * f.r * 0.6; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      g.restore();
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r); gr.addColorStop(0, `rgba(${col},${0.12 * k})`); gr.addColorStop(1, `rgba(${col},${0.25 * k})`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
      // 阵旗
      g.scale(1, 1 / 0.55);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; const x = Math.cos(a) * f.r * 0.95, y = Math.sin(a) * f.r * 0.52; g.strokeStyle = `rgba(80,60,40,${k})`; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 40); g.stroke(); g.fillStyle = `rgba(${col},${0.9 * k})`; g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x + 16 + Math.sin(t * 5 + i) * 3, y - 34); g.lineTo(x, y - 28); g.fill(); }
      break;
    }
    case 'none': {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r); gr.addColorStop(0, `rgba(${col},${0.35 * k})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
      break;
    }
    default: {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, f.r); gr.addColorStop(0, `rgba(${col},${0.15 * k})`); gr.addColorStop(1, `rgba(${col},${0.4 * k})`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, f.r, 0, TAU); g.fill();
    }
  }
  g.restore();
}

function drawVfx(g: G, v: any, t: number) {
  const u = clamp(v.t / v.dur, 0, 1), a = 1 - u, col = v.color as string;
  switch (v.kind) {
    case 'ring': {
      if (v.fx && v.fx !== 'roar') {
        const k = v.fx === 'poison' ? 'poison_cloud_ring' : v.fx === 'vine' ? 'wood_vines_ring' : burstKey(v.fx, col, v.school);
        vfxBurst(g, k, v.x, v.y - v.r * 0.12, v.r * 0.95, u, (v.x * 0.37) % 6.28, 0.62);
      }
      const r = v.r * (0.3 + 0.7 * (1 - Math.pow(1 - u, 2.5)));
      g.save(); g.translate(v.x, v.y); g.scale(1, 0.55);
      const gr = g.createRadialGradient(0, 0, r * 0.6, 0, 0, r);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.8, `rgba(${col},${0.55 * a})`); gr.addColorStop(1, `rgba(255,255,255,${0.6 * a})`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      if (v.fx === 'roar') for (let i = 1; i < 3; i++) { g.strokeStyle = `rgba(${col},${0.5 * a})`; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * (1 - i * 0.22), 0, TAU); g.stroke(); }
      g.restore();
      break;
    }
    case 'flash': {
      if (v.fx) { const r = Math.max(46, v.r * 1.5); vfxBurst(g, burstKey(v.fx, col, v.school), v.x, v.y, r, u, (v.seed ?? v.x) % 6.28); glowDot(g, v.x, v.y, v.r * (0.5 + u * 0.4), col, a * 0.6); }
      else glowDot(g, v.x, v.y, v.r * (0.6 + u * 0.6), col, a);
      break;
    }
    case 'warn': {
      if (v.t < 0) break;
      g.save(); g.translate(v.x, v.y); g.scale(1, 0.55);
      g.strokeStyle = `rgba(${col},${0.8})`; g.lineWidth = 2; g.setLineDash([10, 8]);
      g.beginPath(); g.arc(0, 0, v.r, 0, TAU); g.stroke(); g.setLineDash([]);
      g.fillStyle = `rgba(${col},${0.25 * u})`; g.beginPath(); g.arc(0, 0, v.r * u, 0, TAU); g.fill();
      g.restore();
      break;
    }
    case 'strike': {
      const fx = v.fx as Fx;
      if ((fx === 'lightning' || fx === 'goldthunder') && vfxColumn(g, fx === 'lightning' ? 'thunder_blue_head' : 'thunder_gold_head', v.x, v.y + 10, 460, Math.min(1, a * 1.6), (v.seed ?? 0) % 2 > 1)) {
        vfxBurst(g, fx === 'lightning' ? 'thunder_blue_burst' : 'thunder_gold_burst', v.x, v.y - 20, v.r * 0.9, u, 0, 0.7);
        glowDot(g, v.x, v.y, v.r, col, a * 0.6);
        break;
      }
      if (fx === 'frost' && vfxBurst(g, 'ice_freeze_head', v.x, v.y - v.r * 0.3, v.r * 0.8, u * 0.7, 0, 1)) { glowDot(g, v.x, v.y, v.r, col, a * 0.5); break; }
      if (fx === 'rock' && vfxBurst(g, 'earth_spike_head', v.x, v.y - v.r * 0.35, v.r * 0.85, u * 0.7, 0, 1)) { break; }
      if (fx === 'flame') vfxBurst(g, 'fireball_burst', v.x, v.y - 20, v.r * 0.9, u, 0, 0.75);
      if (fx === 'lightning' || fx === 'goldthunder') {
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 6 * a + 1; jag(g, v.x + 30, v.y - 700, v.x, v.y, v.seed, 70, 12); g.stroke();
        g.strokeStyle = `rgba(${col},${0.8 * a})`; g.lineWidth = 14 * a; jag(g, v.x + 30, v.y - 700, v.x, v.y, v.seed, 70, 12); g.stroke();
      } else if (fx === 'flame') {
        glowDot(g, v.x, v.y - 300 * (1 - u), v.r * 0.8, col, a);
      } else if (fx === 'frost') {
        g.save(); g.translate(v.x, v.y); g.fillStyle = `rgba(200,235,255,${0.7 * a})`; g.strokeStyle = `rgba(255,255,255,${a})`;
        for (let i = 0; i < 7; i++) { const an = i / 7 * TAU + v.seed, r = v.r * 0.7; const x = Math.cos(an) * r * 0.8, y = Math.sin(an) * r * 0.4; g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x, y - 60 * (1 - u * 0.3)); g.lineTo(x + 10, y); g.closePath(); g.fill(); g.stroke(); }
        g.restore();
      } else if (fx === 'rock') {
        g.save(); g.translate(v.x, v.y);
        for (let i = 0; i < 8; i++) { const an = i / 8 * TAU, r = v.r * 0.6; const x = Math.cos(an) * r, y = Math.sin(an) * r * 0.5; g.fillStyle = `rgba(140,110,70,${a})`; g.beginPath(); g.moveTo(x - 12, y); g.lineTo(x, y - 50 * Math.sin(u * Math.PI)); g.lineTo(x + 12, y); g.fill(); }
        g.restore();
      } else if (fx === 'gold') {
        g.save(); g.translate(v.x, v.y); g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = 4;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, 0, v.r * (1 - u) * (1 - i * 0.25), v.r * 0.5 * (1 - u) * (1 - i * 0.25), u * 6 + i, 0, TAU); g.stroke(); }
        g.restore();
      }
      glowDot(g, v.x, v.y, v.r, col, a * 0.8);
      break;
    }
    case 'chain': {
      g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = (v.w ?? 2) * 0.6 + 0.5; jag(g, v.x, v.y, v.x2, v.y2, v.seed + Math.floor(v.t * 30), 24); g.stroke();
      g.strokeStyle = `rgba(${col},${0.8 * a})`; g.lineWidth = (v.w ?? 2) * 2.5; jag(g, v.x, v.y, v.x2, v.y2, v.seed + Math.floor(v.t * 30), 24); g.stroke();
      break;
    }
    case 'beam': {
      const w = v.r * (u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85 * 0.7);
      g.lineCap = 'round';
      if (v.fx === 'magnet') { const cols = ['255,90,90', '255,220,90', '120,220,120', '120,170,255', '230,230,240']; cols.forEach((c, i) => { g.strokeStyle = `rgba(${c},${0.55 * a})`; g.lineWidth = w * 0.5; g.beginPath(); const o = (i - 2) * w * 0.25; g.moveTo(v.x, v.y + o); g.lineTo(v.x2, v.y2 + o); g.stroke(); }); }
      else if (v.fx === 'rock') {
        const n = 10; for (let i = 1; i <= n; i++) { const k = i / n; if (k > u * 2.2) break; const x = v.x + (v.x2 - v.x) * k, y = v.y + 40 + (v.y2 + 30 - v.y - 40) * k; g.fillStyle = `rgba(150,115,70,${a})`; g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x - 2, y - 70 * Math.sin(Math.min(1, (u * 2.2 - k) * 3) * Math.PI * 0.5)); g.lineTo(x + 12, y); g.fill(); g.strokeStyle = `rgba(60,40,20,${0.6 * a})`; g.lineWidth = 1; g.stroke(); }
        break;
      }
      g.strokeStyle = `rgba(${col},${0.6 * a})`; g.lineWidth = w * 2; g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(v.x2, v.y2); g.stroke();
      g.strokeStyle = `rgba(255,255,250,${0.9 * a})`; g.lineWidth = w * 0.6; g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(v.x2, v.y2); g.stroke();
      if (v.fx === 'goldthunder' || v.fx === 'icefire') { g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = 2; jag(g, v.x, v.y, v.x2, v.y2, v.seed + Math.floor(v.t * 30), w * 1.5, 14); g.stroke(); }
      break;
    }
    case 'bigsword': {
      const drop = Math.min(1, u * 3);
      const ang = Math.atan2(v.y2 - v.y, v.x2 - v.x);
      const len = Math.hypot(v.x2 - v.x, v.y2 - v.y);
      g.save(); g.translate(v.x, v.y); g.rotate(ang);
      g.globalAlpha *= a;
      g.scale(1, 0.4 + 0.6 * drop);
      const gr = g.createLinearGradient(0, 0, len, 0); gr.addColorStop(0, `rgba(${col},0.3)`); gr.addColorStop(0.5, `rgba(255,255,255,0.95)`); gr.addColorStop(1, `rgba(${col},0.8)`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(40, -v.r * 0.6); g.lineTo(len, 0); g.lineTo(40, v.r * 0.6); g.closePath(); g.fill();
      g.fillStyle = '#e0c060'; g.fillRect(20, -v.r * 0.9, 16, v.r * 1.8);
      g.restore();
      break;
    }
    case 'cone': {
      g.save(); g.translate(v.x, v.y);
      const r = v.r * (0.4 + 0.6 * Math.min(1, u * 2.5));
      const gr = g.createRadialGradient(0, 0, 10, 0, 0, r);
      gr.addColorStop(0, `rgba(255,250,230,${0.8 * a})`); gr.addColorStop(0.5, `rgba(${col},${0.6 * a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, v.ang - v.spread, v.ang + v.spread); g.closePath(); g.fill();
      if (v.fx === 'sword') { g.strokeStyle = `rgba(230,255,245,${a})`; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, r * 0.85, v.ang - v.spread, v.ang + v.spread); g.stroke(); }
      g.restore();
      break;
    }
    case 'aura': {
      if (v.fx === 'breakthrough') { breakFx(g, v, u); break; }
      if (v.fx === 'leaf') { vfxBurst(g, 'heal_green_burst', v.x, v.y - 60, v.r * 1.1, u, 0, 1, 0.85); vfxBurst(g, 'heal_green_ring', v.x, v.y, v.r * 1.1, u, 0, 0.45, 0.8); }
      else vfxBurst(g, 'shield_gold_burst', v.x, v.y - 8, v.r * 1.15, u, 0, 0.5, 0.8);
      g.save(); g.translate(v.x, v.y);
      for (let i = 0; i < 3; i++) { const k = (u + i / 3) % 1; g.strokeStyle = `rgba(${col},${0.6 * (1 - k) * a})`; g.lineWidth = 3; g.beginPath(); g.ellipse(0, -k * 90, v.r * (1 - k * 0.4), v.r * 0.35 * (1 - k * 0.4), 0, 0, TAU); g.stroke(); }
      g.restore();
      break;
    }
    case 'blinkfx': {
      vfxBurst(g, 'teleport_flash_burst', v.x, v.y - 50, v.r * 1.5, u, 0, 1, 0.9);
      for (let i = 0; i < 2; i++) glowDot(g, v.x, v.y - 50, v.r * (1 + u), col, a * 0.5);
      break;
    }
  }
}

/** 发光特效层（夜色之后绘制，故夜里亦明亮） */
/** 第二十七步：敌招预警（Canvas 后备） */
function drawFoeCanvas(g: G, c: Combat, t: number) {
  g.save();
  for (const h of c.foe.hz) {
    const cc = EL_COL[h.el];
    if (h.fired) {
      if (!h.pooling) continue;
      g.fillStyle = `rgba(${cc},0.22)`; g.beginPath(); g.ellipse(h.x, h.y, h.r, h.r * 0.55, 0, 0, TAU); g.fill();
      continue;
    }
    const u = Math.min(1, h.t / h.tele), pulse = 0.75 + 0.25 * Math.sin(t * 14);
    const wc = h.dmg > 0 ? '235,60,40' : '240,150,50';
    g.strokeStyle = `rgba(${wc},${0.8 * pulse})`; g.lineWidth = 2.5;
    g.fillStyle = `rgba(${wc},0.12)`;
    g.beginPath();
    if (h.k === 'circle') { g.ellipse(h.x, h.y, h.r, h.r * 0.55, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = `rgba(${wc},0.25)`; g.beginPath(); g.ellipse(h.x, h.y, h.r * u, h.r * 0.55 * u, 0, 0, TAU); g.fill(); }
    else if (h.k === 'cone') {
      const A0 = Math.atan2(Math.sin(h.ang) / 0.7, Math.cos(h.ang));
      const path = (d: number) => { g.beginPath(); g.moveTo(h.x, h.y); for (let i = 0; i <= 16; i++) { const a = A0 - h.spread + i / 16 * h.spread * 2; g.lineTo(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d * 0.7); } g.closePath(); };
      path(h.r); g.fill(); g.stroke(); g.fillStyle = `rgba(${wc},0.25)`; path(h.r * u); g.fill();
    } else {
      g.save(); g.translate(h.x, h.y); g.rotate(h.ang);
      g.rect(0, -h.w / 2, h.len, h.w); g.fill(); g.stroke(); g.fillStyle = `rgba(${wc},0.25)`; g.fillRect(0, -h.w / 2, h.len * u, h.w);
      g.restore();
    }
  }
  g.restore();
}

export function drawCombatFx(g: G, c: Combat, t: number) {
  const p = c.game.player;
  // 御剑/飞行时人是浮空的（st.lift）：护体灵光、剑轮、回春阵、增益环都要跟着抬
  const lift = p.st.lift || 0;
  g.save();
  // 区域（地面，普通混合）
  for (const f of c.fields) drawField(g, f, t);
  drawFoeCanvas(g, c, t);
  g.globalCompositeOperation = 'lighter';
  for (const v of c.vfx) drawVfx(g, v, t);
  for (const pr of c.projs) { g.save(); g.translate(0, -pr.visual.elevation); drawProj(g, pr, t); g.restore(); }
  // 护体灵光（Canvas 后备）
  for (const e of c.units) if (e.ward && !e.dead) {
    const v = enemyVis(c, e); if (v <= 0.02) continue;
    const w = e.ward, k = w.hp / w.max, r = wardR(e), y = e.y - wardY(e) - e.flyH - e.lift;
    const gr = g.createRadialGradient(e.x, y, r * 0.5, e.x, y, r * 1.15);
    gr.addColorStop(0, `rgba(${w.col},0)`); gr.addColorStop(0.8, `rgba(${w.col},${(0.12 + 0.12 * k + w.t) * v})`); gr.addColorStop(1, `rgba(${w.col},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(e.x, y, r * 1.15, r * 1.25, 0, 0, TAU); g.fill();
    g.strokeStyle = `rgba(${w.col},${(0.35 * k + w.t) * v})`; g.lineWidth = 1.5; g.beginPath(); g.ellipse(e.x, y, r, r * 1.1, 0, 0, TAU); g.stroke();
  }
  c.swarm?.drawCanvas(g); c.petSwarm?.drawCanvas(g);
  // 蚀金蛊群
  for (const s of c.summons) if (s.kind === 'bugs' && s.dots) {
    for (const d of s.dots) { const a = d.a + t * d.s; const x = s.x + Math.cos(a) * d.r, y = s.y - 40 + Math.sin(a * 1.3) * d.r * 0.6; g.fillStyle = 'rgba(255,220,100,0.9)'; g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill(); }
    glowDot(g, s.x, s.y - 40, 40, '255,210,90', 0.35);
  }
  // 护体剑盾
  if (c.orbit) {
    const o = c.orbit;
    for (let i = 0; i < o.n; i++) {
      const an = t * 3.2 + (i / o.n) * TAU;
      const x = p.x + Math.cos(an) * o.r, y = p.y - 40 - lift + Math.sin(an) * o.r * 0.5;
      g.save(); g.translate(x, y); g.rotate(an + Math.PI / 2);
      g.fillStyle = `rgba(${o.color},0.9)`; g.beginPath(); g.moveTo(0, -22); g.lineTo(-3, 10); g.lineTo(3, 10); g.closePath(); g.fill();
      g.restore();
      glowDot(g, x, y, 18, o.color, 0.6);
    }
  }
  // 护盾
  if (c.shield && !c.shield.art) {
    const s = c.shield, k = s.amt / s.max;
    g.save(); g.translate(p.x, p.y - 50 - lift);
    const gr = g.createRadialGradient(0, 0, 40, 0, 0, 72);
    gr.addColorStop(0, `rgba(${s.color},0)`); gr.addColorStop(0.85, `rgba(${s.color},${0.25 + 0.2 * k})`); gr.addColorStop(1, `rgba(255,255,255,${0.35 * k})`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 62, 76, 0, 0, TAU); g.fill();
    vfxRing(g, shieldKey(s.fx, s.color), 0, -6, 84, 0.42 + 0.3 * k, shieldKey(s.fx, s.color) === 'shield_gold_ring' ? 0 : t * 0.3);
    if (s.fx === 'frost' || s.fx === 'vine') { g.strokeStyle = `rgba(${s.color},${0.6})`; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + t * 0.5; g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 36); g.lineTo(Math.cos(a) * 60, Math.sin(a) * 72); g.stroke(); } }
    g.restore();
  }
  // 回春：脚下一圈青木灵阵
  if (c.heal) { g.save(); vfxRing(g, 'heal_green_ring', p.x, p.y - lift, 74, 0.55, t * 0.6, 0.42); g.restore(); }
  // 增益光环
  const b = c.buffs;
  if (b.atk || b.def || b.speed) {
    const col = b.atk ? '255,200,90' : b.def ? '240,210,120' : '190,230,255';
    g.save(); g.translate(p.x, p.y - lift);
    g.strokeStyle = `rgba(${col},0.5)`; g.lineWidth = 2;
    for (let i = 0; i < 2; i++) { const k = (t * 0.8 + i * 0.5) % 1; g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(0, -k * 100, 40, 12, 0, 0, TAU); g.stroke(); }
    g.restore();
  }
  // 火花
  for (const s of c.sparks) { const k = 1 - s.t / s.max; g.fillStyle = `rgba(${s.color},${0.7 * k})`; g.beginPath(); g.arc(s.x, s.y + (s.anchor?.offsetY ?? 0), s.size * k + 0.5, 0, TAU); g.fill(); }
  g.restore();
}

/** 血条、名牌、伤害数字（世界坐标，最上层） */
export function drawCombatUI(g: G, c: Combat, t: number, z: number) {
  const h = c.game.hero;
  const k = 1 / Math.max(0.45, z);
  // 第二十七步：首领大招蓄力——四周压暗泛红；结算一刻全屏闪白
  const uc = c.foe.ultCharge(), fl = c.foe.ultFlash;
  if (uc > 0 || fl > 0) {
    const W = g.canvas.width, H = g.canvas.height;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    if (uc > 0) {
      const a = Math.min(1, uc) * 0.6, gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.62);
      gr.addColorStop(0, 'rgba(40,0,0,0)'); gr.addColorStop(1, `rgba(40,4,2,${a})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    if (fl > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(${c.foe.ultCol},${(fl / 0.35) * 0.32})`; g.fillRect(0, 0, W, H); }
    g.restore();
  }
  g.save();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let uiMark = prof.t();
  const uiView = c.game.renderer?.viewRect() ?? null, uiPlayer = c.game.player, crowd = c.units.length > 150;
  for (const e of c.units) {
    if (e.dead) continue;
    // 屏幕外的单位不画名牌血条
    if (uiView && (e.x < uiView.left - 200 || e.x > uiView.right + 200 || e.y < uiView.top - 300 || e.y > uiView.bottom + 360)) continue;
    const a = enemyVis(c, e);
    if (a <= 0.05) continue;
    // 第五轮返工：墨触海魔的触须（seabeast 标的 sbArm）不出名牌；锁定的那一条只画血条
    const arm = !!(e as { sbArm?: boolean }).sbArm;
    if (arm && c.lock !== e) continue;
    // 人多时（超过 150 个单位）只有近处、锁定目标、精英和首领显示完整名牌，其余只在受伤或交战时显示一条血条
    const brief = crowd && c.lock !== e && !e.affix && !e.boss && Math.hypot(e.x - uiPlayer.x, e.y - uiPlayer.y) > 700;
    hdUi.at?.(g, e.x, e.y);
    if (!e.aggro && e.hp >= e.maxHp && c.lock !== e) {
      // 未交战：仅显示名牌（悬停般淡）
    }
    g.globalAlpha = a;
    const st = e.def.kind === 'human' ? 0 : beastSpriteTop('e:' + e.def.id, !!e.anim.flying);
    const top = (st ? e.y - st - 18 : e.y - (e.def.kind === 'human' ? 150 : e.anim.flying ? 150 : 100) * (e.def.look?.size ?? 1)) - e.lift - e.flyH;
    const w = 70 * k, hh = 6 * k;
    if (!brief && !arm) {
    // 强弱颜色
    const gap = e.level - (h.realm * 13 + h.stage);
    const col = e.ally ? '#a8eec0' : gap <= -5 ? '#8ab07a' : gap < 3 ? '#e8d8a8' : gap < 13 ? '#e08a4a' : '#d03838';
    const font = `${12 * k}px "Noto Serif SC","Songti SC",serif`;
    g.font = font;
    g.fillStyle = e.ally ? 'rgba(10,34,22,0.72)' : 'rgba(20,16,12,0.65)';
    const label = `${e.ally ? '友·' : ''}${e.name}·${e.rankText}`;
    const tw = measureCached(g, label, font) + 10 * k;
    g.fillRect(e.x - tw / 2, top - 18 * k, tw, 15 * k);
    // 第三十九步：混战里一眼分清阵营——同阵绿框，各派系各有一枚色签
    if (e.ally) { g.strokeStyle = 'rgba(120,230,160,0.8)'; g.lineWidth = 1; g.strokeRect(e.x - tw / 2 + 0.5, top - 18 * k + 0.5, tw - 1, 15 * k - 1); }
    else if (e.team) { g.fillStyle = teamCol(e.team); g.fillRect(e.x - tw / 2, top - 18 * k, 3 * k, 15 * k); g.fillRect(e.x + tw / 2 - 3 * k, top - 18 * k, 3 * k, 15 * k); }
    drawTextCached(g, label, e.x, top - 10.5 * k, font, col, null, 0, 'center', 'middle');
    if (e.affix) {   // 第三十五步：精英词缀标签
      const tf = `bold ${11 * k}px "Noto Serif SC","Songti SC",serif`;
      g.font = tf;
      const tags = e.affix.ids.map((id) => AFFIX[id]), ws = tags.map((a) => measureCached(g, a.name, tf) + 8 * k);
      let x0 = e.x - ws.reduce((s, w) => s + w + 3 * k, -3 * k) / 2;
      tags.forEach((a, i) => { g.fillStyle = 'rgba(20,14,10,0.75)'; g.fillRect(x0, top - 33 * k, ws[i], 13 * k); g.strokeStyle = `rgba(${a.col},0.8)`; g.lineWidth = 1; g.strokeRect(x0 + 0.5, top - 33 * k + 0.5, ws[i] - 1, 13 * k - 1); g.fillStyle = `rgb(${a.col})`; g.fillText(a.name, x0 + ws[i] / 2, top - 26.5 * k); x0 += ws[i] + 3 * k; });
    }
    if (e.blv) { const bx = e.x - tw / 2 - 7 * k, by = top - 10.5 * k, r = (3 + Math.min(4, e.blv) * 0.5) * k; g.fillStyle = `rgb(${YAODAN_COL[e.blv]})`; g.beginPath(); g.moveTo(bx, by - r); g.lineTo(bx + r * 0.75, by); g.lineTo(bx, by + r); g.lineTo(bx - r * 0.75, by); g.closePath(); g.fill(); }   // 妖丹色菱：一眼看出等阶
    }
    if (e.aggro || e.hp < e.maxHp || arm) {
      g.fillStyle = 'rgba(20,16,12,0.7)'; g.fillRect(e.x - w / 2 - 1, top - 1, w + 2, hh + 2);
      g.fillStyle = e.ally ? '#3aa860' : '#a82a22'; g.fillRect(e.x - w / 2, top, w * clamp(e.hp / e.maxHp, 0, 1), hh);
      // 异状图标
      let ix = e.x - w / 2;
      for (const s in e.st) { g.fillStyle = ({ burn: '#ff7a3a', freeze: '#9ad8ff', shock: '#b8c4ff', poison: '#7ac04a', root: '#6ab05a', break: '#e0b040', slow: '#90b0d0', stun: '#f0e080' } as Record<string, string>)[s] ?? '#fff'; g.fillRect(ix, top + hh + 2 * k, 6 * k, 3 * k); ix += 8 * k; }
    }
  }
  prof.add('UI·单位名血条', uiMark, c.enemies.length + c.allies.length); uiMark = prof.t();
  g.globalAlpha = 1;
  const textStyles = new Map<string, PreparedText>(), bigTextStyles = new Map<string, PreparedText>();
  let textScale = 0, textDrawn = 0;
  // 屏幕外的飘字不画：按视野矩形粗筛（外扩一圈，飘字自身会上飘）
  const view = uiView, pad = 260;
  for (const x of c.texts) {
    if (view) {
      const wx = x.anchor?.x ?? x.x, wy = x.anchor?.y ?? x.y;
      if (wx < view.left - pad || wx > view.right + pad || wy < view.top - pad || wy > view.bottom + pad) continue;
    }
    textDrawn++;
    const a = x.t < 0.8 ? 1 : 1 - (x.t - 0.8) / 0.3;
    const sc = x.big ? 1.35 : 1;
    const pop = x.t < 0.1 ? 1 + (0.1 - x.t) * 4 : 1;
    g.globalAlpha = a;
    hdUi.at?.(g, x.anchor?.x ?? x.x, x.anchor?.y ?? x.y);
    const textY = x.y + (x.anchor?.offsetY ?? 0);
    const font = `bold ${16 * k * sc}px "Noto Serif SC","Songti SC",serif`;
    // 弹出那 0.1 秒只是放大：仍用位图缓存，按文字中心缩放贴上去，不再逐帧描边写字（那是千人战里最贵的一笔）
    {
      const styles = x.big ? bigTextStyles : textStyles;
      let style = styles.get(x.color);
      if (!style) {
        if (!textScale) { const m = g.getTransform(); textScale = Math.max(0.0625, Math.hypot(m.a, m.b)); }
        style = prepareCachedText(font, x.color, 'rgba(30,20,14,0.8)', 3 * k, 'center', 'middle', textScale);
        styles.set(x.color, style);
      }
      if (pop !== 1) {
        const m = g.getTransform();
        g.translate(x.x, textY); g.scale(pop, pop); g.translate(-x.x, -textY);
        drawPreparedText(g, x.s, x.x, textY, style);
        g.setTransform(m);
      } else drawPreparedText(g, x.s, x.x, textY, style);
    }
  }
  prof.add('UI·伤害数字', uiMark, textDrawn);
  g.restore();
}

/** 突破：脚下灵阵张开，一道光柱冲天，渐隐 */
function breakFx(g: G, v: any, u: number) {
  const a = u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.4);
  vfxRing(g, 'breakthrough_ring', v.x, v.y, v.r * (0.7 + 0.5 * Math.min(1, u * 3)), a * 0.9, u * 2, 0.45);
  vfxColumn(g, 'breakthrough_burst', v.x, v.y + 30, 460 * (0.8 + 0.25 * Math.min(1, u * 4)), a * 0.95);
}

const ghostSt = new WeakMap<object, CharState>();
/** 近战的残影：人形的被击飞者画半透明的人（妖兽的由 gl/brawlgl 画光影）；缩地在原地留下自己的一道墨影 */
function brawlGhosts(c: Combat, out: Drawable[]) {
  for (const gh of c.brawl.ghosts) {
    if (gh.t < 0) continue;
    const e = gh.e, k = 1 - gh.t / gh.dur;
    if (e && !(e.look && e.cs)) continue;
    out.push({ y: gh.y - 1, hx: gh.x, hy: gh.y, hb: charBox(1.12, gh.z), k: 'D·残影', draw: (g) => {
      const src = e ? e.cs! : c.game.player.st, look = e ? e.look! : c.game.player.look;
      // r9：画在每个残影自己的一份人物状态上（原来借本人的那份、临时挪到残影的位置画——衣带、发丝的弹簧把这一挪当成高速甩动，拉成一根根横着的黑长条）
      let st = ghostSt.get(gh); if (!st) { st = new CharState(gh.x, gh.y); ghostSt.set(gh, st); }
      st.action = src.action; st.actionT = src.actionT; st.t = src.t; st.seed = src.seed; st.castN = src.castN; st.hands = [src.hands[0].slice(), src.hands[1].slice()]; st.handInit = true;
      const ox = st.x, oy = st.y, oyaw = st.yaw, ol = st.lift;
      g.save(); g.globalAlpha *= (e ? 0.36 : 0.6) * k;
      if (!e && gh.sx === undefined) g.filter = 'brightness(0.22) saturate(0.3)';   // 缩地的墨影：自己的身形压成一团墨色
      st.x = gh.x; st.y = gh.y; st.yaw = gh.yaw; st.lift = gh.z;
      // r7-fx3d：冲刺的模糊残影——往身后再错开画两层、越往后越淡（看着是被拉糊的）
      if (gh.sx !== undefined) { const a0 = g.globalAlpha; g.globalAlpha = a0 * 0.35; g.translate(-gh.sx * 0.5, -(gh.sy ?? 0) * 0.5); drawCharacter(g, look, st, e ? 1.06 : 1.12, 0); g.translate(gh.sx * 0.5, (gh.sy ?? 0) * 0.5); g.globalAlpha = a0; }   // 多画的一层只一遍：残影一帧要画好几个人，贵
      drawCharacter(g, look, st, e ? 1.06 : 1.12, 0);
      st.x = ox; st.y = oy; st.yaw = oyaw; st.lift = ol;
      g.restore();
    } });
  }
}
