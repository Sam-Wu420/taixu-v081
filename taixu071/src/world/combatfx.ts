import { guidanceInfoVisible } from './guidanceFilter';
import { drawItemTierBeam } from './gatherVisual';
import { enemyPerceptibility } from './senseSignals';
import type { EnemyLike } from './senseSignals';
import { farMarkerMode, markerRelation } from './farView';
import {
  drawSenseMark,
  resolveEnemyMarkKind,
  resolveMarkContext,
  resolveNpcMarkKind,
  type SenseMarkInfo,
} from './senseMarks';
// 战斗绘制：敌人、召唤物、掉落、弹道、法术特效、血条与伤害数字
import { EL_COL, elOf } from './foeskills';
import type { Combat, Enemy } from './combat';
import { YAODAN_COL } from './combat';
import type { Drawable } from './life';
import type { Fx } from '../data/arts';
import { drawBeast, BeastLook } from '../gfx/beast';
import { drawBeastSprite, beastSpriteTop, pumpBeastTex, hasBeastSprite, charAnim } from '../gfx/beastTex';
import { drawCharacter } from '../gfx/character';
import { charFrames, CHAR_FRAME_SCALE, getDotSprite, getShadowSprite } from '../gfx/charAtlas';
import { equipmentAppearance } from '../gfx/equipmentAppearance';
import { itemDef, TIER_COLORS } from '../data/items';
import { mulberry32 } from '../core/rng';
import { QUHUN_LOOK } from '../data/storylooks';
import { itemArtLook } from '../data/itemArtLook';
import { drawArt } from '../gfx/artifact';
import { vfxProj, vfxBurst, vfxRing, vfxColumn, projSet, burstKey, shieldKey } from '../gfx/vfxTex';
import { wardY, wardR } from './foemind';
import { AFFIX } from './affix';
import { drawSupUnder, drawSupOver, supSquash } from './suppress';
/** 空中单位的排序偏移：排在所有地面物体之后 */
const AIR_Y = 200000;

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const SUMMON_LOOK: Record<string, BeastLook> = {
  fox: { body: 'fox', color: [246, 242, 236], belly: [255, 255, 255], size: 0.85, tails: 3, eye: 'rgba(120,200,255,0.9)', glow: '200,230,255' },
  puppet: { body: 'wolf', color: [150, 130, 100], belly: [180, 160, 130], size: 1.1, eye: 'rgba(120,255,200,0.9)', spikes: true, accent: [90, 80, 70] },
  tihun: { body: 'fox', color: [190, 160, 230], belly: [240, 230, 255], size: 1.1, eye: 'rgba(255,240,140,0.95)', glow: '200,160,255', horn: true },
  demon: { body: 'ghost', color: [200, 50, 60], size: 0.8, eye: 'rgba(255,220,60,0.95)' },
  jiao: { body: 'jiao', color: [60, 150, 120], belly: [190, 230, 200], accent: [220, 240, 200], size: 1.1, glow: '120,240,180' },
};

export function enemyVis(c: Combat, e: { x: number; y: number; def?: { hide?: boolean }; aggro?: boolean; hideT?: number }) {
  const s = c.game.life.sense;
  return enemyPerceptibility(e, s.x, s.y, s.R, c.game.senseBurstT > 0);
}

/** 只过滤标记了实体来源的附着效果；无来源攻击预警与玩家效果不受影响。 */
export function actorFxVisible(c: Combat, source?: EnemyLike): boolean {
  if (!source) return true;
  const sense = c.game.life.sense;
  return enemyPerceptibility(source, sense.x, sense.y, sense.R, c.game.senseBurstT > 0, true) > 0.05;
}

function isPrimaryActor(c: Combat, source?: any): boolean {
  if (!source) return true;
  return source === c.lock || !!source.boss || !!source.warFormLeader;
}

function enemyDisplayLabel(e: Enemy): string {
  const base = e.shortName ?? e.name;
  return `${e.sectName ? e.sectName + '·' : ''}${base}·${e.rankText}`;
}

const LABEL_WIDTH_CACHE = new Map<string, number>();
function measureLabelWidth(g: G, font: string, text: string): number {
  const key = `${font}|${text}`;
  const hit = LABEL_WIDTH_CACHE.get(key);
  if (hit !== undefined) return hit;
  const w = g.measureText(text).width;
  if (LABEL_WIDTH_CACHE.size >= 1024) LABEL_WIDTH_CACHE.clear();
  LABEL_WIDTH_CACHE.set(key, w);
  return w;
}

/** 收集需 Y 排序的战斗实体 */
export function collectCombat(
  c: Combat,
  out: Drawable[],
  view: { left: number; top: number; right: number; bottom: number },
  t: number,
  dt: number,
  splitLayers = false,
) {
  pumpBeastTex();
  const z = c.game?.cam?.zoom ?? 1;
  const dpr = c.game?.renderer?.dpr ?? 1;
  const ren = c.game?.renderer as { pushAtlasSpr?: (...args: any[]) => boolean } | undefined;
  c.game.sectwar?.collectFormations?.(out, view, t, { splitLayers, ren, z, dpr });
  for (const e of c.units) {
    if (e.gone || (e.dead && e.deathT >= 0.8)) continue;
    if (e.x < view.left - 200 || e.x > view.right + 200 || e.y < view.top - 100 || e.y > view.bottom + 420) continue;
    const a = enemyVis(c, e);
    if (a <= 0.01) continue;
    const deathFade = e.dead ? Math.max(0, 1 - e.deathT / 0.8) : 1;
    if (deathFade <= 0.01) continue;
    const S = e.look ? ((e as any).ying ? 1.12 * 0.46 : 1.12) : (e.def.look?.size ?? 1);
    const flyOff = e.flyH || 0;
    const screenH = (e.look ? 150 : 100) * S * z * dpr;
    const hasMod = !!(e.look && e.cs && hasBeastSprite(e.npcId && hasBeastSprite('n:' + e.npcId) ? 'n:' + e.npcId : 'e:' + e.def.id));
    const batchableLook = !e.windup && e.lift <= 0 && c.lock !== e && !e.st.freeze && !e.st.root && !e.st.shock && !e.st.stun && !c.sup?.view?.(e) && !e.def.evil && e.blv < 5 && !hasMod;
    let gl: ((batch: any, occA: number) => boolean) | undefined;
    if (batchableLook && ren?.pushAtlasSpr && screenH < 12) {
      if (!charFrames.takeDot(!!e.boss || e.dead)) continue;
      const rel = markerRelation(e);
      const [cr, cg, cb] = rel === 'hostile' ? [0.81, 0.37, 0.34] : rel === 'ally' ? [0.40, 0.79, 0.87] : [0.95, 0.91, 0.80];
      const ds = 0.5 / Math.max(0.02, z);
      const da = a * deathFade;
      gl = (batch, occA) => ren.pushAtlasSpr!(batch, getDotSprite(), e.x, e.y - 6 * S - flyOff, ds, ds, false, da * occA, 'P2:dot8', cr, cg, cb);
    } else if (batchableLook && ren?.pushAtlasSpr && screenH <= 125 && e.look && e.cs) {
      const look = e.look, cs = e.cs;
      const sxDead = e.dead ? 1 + e.deathT * 0.3 : 1;
      const syDead = e.dead ? Math.max(0.1, 1 - e.deathT * 0.6) : 1;
      const fa = a * deathFade;
      gl = (batch, occA) => {
        const f = charFrames.get(look, cs);
        if (!f) return false;
        const sc = (S * (look.height || 1)) / CHAR_FRAME_SCALE;
        const shA = flyOff > 0 ? Math.max(0.22, 1 - flyOff / 320) : 1;
        const shSx = 1.15 * (1 + flyOff * 0.004);
        return ren.pushAtlasSpr!(batch, getShadowSprite(), e.x, e.y + 2, shSx * sxDead, 1.15, false, fa * occA * shA, 'P2:shadow32')
          && ren.pushAtlasSpr!(batch, f, e.x, e.y - flyOff, sc * sxDead, sc * syDead, false, fa * occA, f.key);
      };
    }
    const halfW = 70 * S;
    out.push({
      y: (e.def.flying || flyOff > 12) ? e.y + AIR_Y : e.y,
      x: e.x, minX: e.x - halfW, maxX: e.x + halfW, minY: e.y - flyOff - 170 * S,
      gl, draw: (g) => drawEnemy(g, c, e, a, t, dt),
    });
  }
  for (const s of c.summons) {
    if (s.kind === 'bugs') continue;
    if (s.kind === 'quhun' && s.cs) { const cs = s.cs; out.push({ y: s.y, x: s.x, minX: s.x - 60, maxX: s.x + 60, minY: s.y - 170, draw: (g) => { g.save(); g.globalAlpha *= Math.min(1, s.t * 2); drawCharacter(g, QUHUN_LOOK, cs, 1.12, 0); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(120,255,170,0.5)'; g.beginPath(); g.arc(s.x, s.y - 150, 3, 0, Math.PI * 2); g.fill(); g.restore(); } }); continue; }
    // 第三十步：现身时由小到大、由淡到浓；出手时朝目标前扑；将散时闪烁；心魔合体放大
    const sHalfW = 70 * (s.big ?? 1);
    out.push({ y: s.kind === 'demon' ? s.y + AIR_Y : s.y, x: s.x, minX: s.x - sHalfW, maxX: s.x + sHalfW, minY: s.y - 160 * (s.big ?? 1), draw: (g) => {
      const age = s.age ?? 9, atk = s.atk ?? 0, B = s.big ?? 1;
      const grow = age < 0.35 ? 0.4 + 0.6 * (1 - Math.pow(1 - age / 0.35, 3)) : 1;
      const lunge = atk > 0 ? Math.sin(Math.min(1, (1 - atk) * 2.2) * Math.PI) * 22 * B : 0;
      const dir = s.ax !== undefined ? Math.atan2(s.ay - s.y, s.ax - s.x) : 0;
      const x = s.x + Math.cos(dir) * lunge, y = s.y + Math.sin(dir) * lunge * 0.6;
      const A = { move: Math.min(1, (s.mv ?? 1) + atk * 0.5), phase: s.phase, atk: atk > 0.2 ? Math.min(1, atk * 1.4) : 0, hit: 0, t: s.phase / 8, flying: s.kind === 'demon' };
      g.save();
      g.globalAlpha *= Math.min(1, age * 3) * (s.t < 2.5 ? 0.65 + 0.35 * Math.cos(s.t * 14) : 1) * Math.min(1, s.t * 3 + 0.2);
      if (!drawBeastSprite(g, 's:' + s.kind, x, y, s.facing, A, grow * B)) drawBeast(g, SUMMON_LOOK[s.kind] ?? SUMMON_LOOK.fox, x, y, s.facing, A, grow * B);
      g.restore();
    } });
  }
  for (const l of c.loot) {
    const a = enemyVis(c, l);
    if (a <= 0.01) continue;
    out.push({ y: l.y, draw: (g) => { if(guidanceInfoVisible(c.game,'灵物'))drawItemTierBeam(g,l.id,l.x,l.y,a,c.game.cam?.zoom??1); drawLoot(g, l, t, a); } });
  }
  c.acts.collect(out);
  if (c.shield?.art) {   // 法器盾：实体悬浮
    const s = c.shield, sp = c.shieldPos(), L = itemArtLook(s.art!), k = s.amt / s.max;
    // 盾牌跟着人一起浮（御剑/飞行高度 st.lift）；地面那圈影子留在原地并按高度变淡
    const lift = c.game.player.st.lift || 0;
    // 御剑飞行时主角的排序 y 被抬到 p.y + 200000（render.ts 里那行），排在一切景物之上；
    // 法器盾要跟着这个偏移，否则飞行时它永远排在主角之前 → 绕到身前也会被人物盖住。
    const pf = c.game.player;
    const pSort = pf.flying && !c.game.yuanying.active ? 200000 : 0;
    out.push({ y: (sp.front ? sp.y + 20 : sp.y - 40) + pSort, draw: (g) => {
      g.save(); g.fillStyle = `rgba(20,16,10,${0.16 * Math.max(0.22, 1 - lift / 220)})`; g.beginPath(); g.ellipse(sp.x, sp.y + 4, 16, 5, 0, 0, TAU); g.fill(); g.restore();
      drawArt(g, L, sp.x, sp.y - sp.h - lift, 26 + c.blockT * 22, Math.cos(c.shieldAng) * 0.25 + Math.sin(t * 1.6) * 0.04, 0.55 + 0.45 * k);
    } });
  }
  // 第二十八步：雷遁 / 血遁残影（半透明人形）
  for (const gh of c.ghosts) {
    if (gh.t < 0) continue;
    const p = c.game.player, k = 1 - gh.t / gh.dur;
    out.push({ y: gh.y - 1, draw: (g) => { g.save(); g.globalAlpha *= 0.42 * k; const st = p.st; const ox = st.x, oy = st.y, oyaw = st.yaw; st.x = gh.x; st.y = gh.y; st.yaw = gh.yaw; try { const h = c.game.hero; drawCharacter(g, equipmentAppearance(p.look, h.equip, h.wardrobe?.showEquipment === true), st, 1.12, 0, { ghost: true }); } finally { st.x = ox; st.y = oy; st.yaw = oyaw; g.restore(); } } });
  }
  if (c.decoy) {
    const d = c.decoy, p = c.game.player;
    out.push({ y: d.y, draw: (g) => { g.save(); g.globalAlpha = 0.6 + 0.2 * Math.sin(t * 6); const st = p.st; const ox = st.x, oy = st.y; st.x = d.x; st.y = d.y; try { const h = c.game.hero; drawCharacter(g, equipmentAppearance(p.look, h.equip, h.wardrobe?.showEquipment === true), st, 1.12, 0, { ghost: true }); } finally { st.x = ox; st.y = oy; g.restore(); } } });
  }
}

function drawEnemy(g: G, c: Combat, e: Enemy, alpha: number, t: number, dt: number) {
  if (e.gone || (e.dead && e.deathT >= 0.8)) return;
  const deathFade = e.dead ? Math.max(0, 1 - e.deathT / 0.8) : 1;
  if (deathFade <= 0.01) return;
  const z = c.game?.cam?.zoom ?? 1;
  const dpr = c.game?.renderer?.dpr ?? 1;
  const S = e.look ? ((e as any).ying ? 1.12 * 0.46 : 1.12) : (e.def.look?.size ?? 1);
  const flyOff = e.flyH || 0;
  const screenH = (e.look ? 150 : 100) * S * z * dpr;
  const simple = !e.windup && e.lift <= 0 && c.lock !== e && !e.st.freeze && !e.st.root && !e.st.shock && !e.st.stun && !c.sup?.view?.(e) && !e.def.evil && e.blv < 5;
  if (simple && screenH < 12) {
    const rel = markerRelation(e);
    g.save();
    g.globalAlpha *= alpha * deathFade;
    g.fillStyle = rel === 'hostile' ? '#cf5f56' : rel === 'ally' ? '#65c9df' : '#f2e7cd';
    g.beginPath();
    g.arc(e.x, e.y - 6 * S - flyOff, 2 / Math.max(0.02, z), 0, TAU);
    g.fill();
    g.restore();
    return;
  }
  g.save();
  g.globalAlpha *= alpha * deathFade;
  if (e.dead) { g.translate(e.x, e.y); g.scale(1 + e.deathT * 0.3, Math.max(0.1, 1 - e.deathT * 0.6)); g.translate(-e.x, -e.y); }
  // 锁定标记
  if (c.lock === e && !e.dead) {
    g.strokeStyle = c.manual ? 'rgba(255,232,160,0.95)' : 'rgba(240,214,140,0.8)'; g.lineWidth = c.manual ? 3 : 2.5;   // 第三十八步：淡金锁定环（手动锁定更亮）
    const r = 34 + Math.sin(t * 6) * 3;
    g.beginPath(); g.ellipse(e.x, e.y + 2, r * 1.3, r * 0.45, 0, 0, TAU); g.stroke();
    for (let i = 0; i < 4; i++) { const a = t * 1.5 + i * Math.PI / 2; g.beginPath(); g.ellipse(e.x, e.y + 2, r * 1.6, r * 0.6, 0, a, a + 0.4); g.stroke(); }
  }
  // 窥破蓄力：红色警示
  if (e.windup > 0) { g.fillStyle = `rgba(220,40,30,${0.25 * (1 - e.windup / 0.4)})`; g.beginPath(); g.ellipse(e.x, e.y, 70, 26, 0, 0, TAU); g.fill(); }
  // 跃起（扑击）：地面留影，身形抬高
  if (e.lift > 0) { g.fillStyle = `rgba(20,16,12,${Math.max(0.08, 0.3 - e.lift / 600)})`; g.beginPath(); g.ellipse(e.x, e.y + 2, 30 + e.lift * 0.05, 9 + e.lift * 0.015, 0, 0, TAU); g.fill(); g.translate(0, -e.lift); }
  // 第四十一步：境界压制——脚下法印 / 地裂，身形压矮发颤
  const sv = c.sup.view(e);
  if (sv) { drawSupUnder(g, e.x, e.y, sv, t); g.save(); supSquash(g, e.x, e.y, sv, t); }
  const msk = e.npcId && hasBeastSprite('n:' + e.npcId) ? 'n:' + e.npcId : 'e:' + e.def.id;   // v0.56：模组给这个修士 / 这个人换了图
  if (e.look && e.cs && hasBeastSprite(msk) && drawBeastSprite(g, msk, e.x, e.y, e.facing, charAnim(e.cs, t), (e as any).ying ? 0.46 : 1)) { /* 已画 */ }
  else if (e.look && e.cs) {
    if (screenH >= 14) {
      g.fillStyle = `rgba(30,30,24,${flyOff > 0 ? Math.max(0.12, 0.26 - flyOff / 400) : 0.26})`;
      g.beginPath(); g.ellipse(e.x, e.y + 2, 22 + flyOff * 0.22, 7 + flyOff * 0.05, 0, 0, TAU); g.fill();
    }
    const cf = simple && screenH <= 125 ? charFrames.get(e.look, e.cs) : null;
    if (cf) {
      const sc = (S * (e.look.height || 1)) / CHAR_FRAME_SCALE;
      g.drawImage(cf.canvas, e.x - cf.ax * sc, e.y - flyOff - cf.ay * sc, cf.w * sc, cf.h * sc);
    } else {
      drawCharacter(g, e.look, e.cs, (e as any).ying ? 1.12 * 0.46 : 1.12, e.dead ? 0 : dt);   // v0.54.2：出窍的元婴缩成尺许
    }
    // 魔修血光
    if (e.def.evil) { g.globalCompositeOperation = 'lighter'; const gr = g.createRadialGradient(e.x, e.y - 50 - flyOff, 0, e.x, e.y - 50 - flyOff, 70); gr.addColorStop(0, 'rgba(200,30,40,0.18)'); gr.addColorStop(1, 'rgba(200,30,40,0)'); g.fillStyle = gr; g.fillRect(e.x - 70, e.y - 120 - flyOff, 140, 140); }
  } else if (e.def.look) {
    if (e.blv >= 5 && !e.dead) drawYaoqi(g, e, t);
    if (!drawBeastSprite(g, 'e:' + e.def.id, e.x, e.y, e.facing, e.anim, 1)) drawBeast(g, e.def.look, e.x, e.y, e.facing, e.anim, 1);
  }
  if (sv) { g.restore(); drawSupOver(g, e.x, e.y, sv, t, (e.anim.flying ? 170 : e.look ? 120 : 70 + 40 * (e.def.look?.size ?? 1)) + flyOff); }
  // 异状表现
  if (e.st.freeze) { g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(190,230,255,0.45)'; g.strokeStyle = 'rgba(240,250,255,0.9)'; g.lineWidth = 1.5; g.beginPath(); const h = e.anim.flying ? 110 : 70; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(e.x + Math.cos(a) * 42, e.y - flyOff - h / 2 + Math.sin(a) * h * 0.6); } g.closePath(); g.fill(); g.stroke(); }
  if (e.st.burn && Math.random() < 0.5) c.sparks.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y - flyOff - Math.random() * 60, vx: 0, vy: -60, t: 0, max: 0.5, size: 4, color: '255,130,40' });
  if (e.st.poison && Math.random() < 0.3) c.sparks.push({ x: e.x + (Math.random() - 0.5) * 40, y: e.y - flyOff - Math.random() * 50, vx: 0, vy: -30, t: 0, max: 0.7, size: 3, color: '140,210,60' });
  if (e.st.root) { g.strokeStyle = 'rgba(90,150,60,0.9)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { const a = i * 1.6 + t; g.beginPath(); g.moveTo(e.x + Math.cos(a) * 30, e.y + 4); g.quadraticCurveTo(e.x + Math.cos(a + 1) * 10, e.y - 30, e.x + Math.cos(a + 2) * 20, e.y - 46); g.stroke(); } }
  if (e.st.shock || e.st.stun) { g.strokeStyle = e.st.shock ? 'rgba(200,210,255,0.9)' : 'rgba(255,230,120,0.9)'; g.lineWidth = 1.5; const hy = e.y - flyOff - (e.anim.flying ? 130 : 90); for (let i = 0; i < 3; i++) { const a = t * 4 + i * TAU / 3; g.beginPath(); g.arc(e.x + Math.cos(a) * 16, hy + Math.sin(a) * 5, 3, 0, TAU); g.stroke(); } }
  g.restore();
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

/** 妖丹：一枚内蕴灵光的圆丹，光柱由统一的物品品阶绘制。 */
function drawYaodan(g: G, l: { x: number; y: number; id: string; t: number }, t: number, a: number) {
  const lv = parseInt(l.id.slice(10)) || 1, col = YAODAN_COL[lv] ?? '220,220,200';
  const bob = Math.sin(t * 3 + l.x) * 4 - Math.max(0, 1 - l.t * 2) * 40;
  const x = l.x, y = l.y - 22 + bob, r = 7 + lv * 0.6;
  g.save(); g.globalAlpha *= a; g.globalCompositeOperation = 'lighter';
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

function drawLoot(g: G, l: { x: number; y: number; id: string; n: number; t: number }, t: number, a: number) {
  if (l.id.startsWith('mat_yaodan')) { drawYaodan(g, l, t, a); return; }
  const d = itemDef(l.id);
  const col = TIER_COLORS[d.tier] ?? '#888';
  const bob = Math.sin(t * 3 + l.x) * 4 - Math.max(0, 1 - l.t * 3) * 30;
  g.save(); g.globalAlpha *= a;
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(l.x, l.y - 14 + bob, 0, l.x, l.y - 14 + bob, 34);
  const rare = d.type === 'scroll' || d.type === 'artifact';
  gr.addColorStop(0, rare ? 'rgba(255,220,120,0.6)' : 'rgba(200,255,220,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(l.x - 34, l.y - 48 + bob, 68, 68);
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
  gr.addColorStop(0, `rgba(255,255,245,${0.65 * a})`); gr.addColorStop(0.35, `rgba(${color},${0.52 * a})`); gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// 程序特效的各法术弹头世界尺寸（主角约 108 高）
const PROJ_SIZE: Record<string, number> = { fireball: 74, fire_bird: 96, ice_cone: 70, sword_qi_green: 84, sword_qi_gold: 84, sword_qi_red: 84, gold_arc: 78, wind_blade: 80, poison_arrow: 60, soul_wisp: 70 };
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
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.8, `rgba(${col},${0.42 * a})`); gr.addColorStop(1, `rgba(255,255,255,${0.35 * a})`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
      if (v.fx === 'roar') for (let i = 1; i < 3; i++) { g.strokeStyle = `rgba(${col},${0.4 * a})`; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * (1 - i * 0.22), 0, TAU); g.stroke(); }
      g.restore();
      break;
    }
    case 'flash': {
      if (v.fx) { const r = Math.max(42, v.r * 1.3); vfxBurst(g, burstKey(v.fx, col, v.school), v.x, v.y, r, u, (v.seed ?? v.x) % 6.28, 0.72); glowDot(g, v.x, v.y, v.r * (0.45 + u * 0.35), col, a * 0.38); }
      else glowDot(g, v.x, v.y, v.r * (0.5 + u * 0.5), col, a * 0.55);
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
  const z = c.game?.cam?.zoom ?? 1;
  const macroFar = z < 0.36;
  const inWar = !!c.game.sectwar?.hasActiveBattle?.();
  // 御剑/飞行时人是浮空的（st.lift）：护体灵光、剑轮、回春阵、增益环都要跟着抬
  const lift = p.st.lift || 0;
  const nUnits = c.units.length;
  const dense = nUnits >= 8, heavy = nUnits >= 14;
  g.save();
  // 大战场人群密集时在主角脚下画一层清淡定位环，确保自身站位一目了然
  if (dense) {
    g.save();
    g.strokeStyle = 'rgba(155, 232, 255, 0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(p.x, p.y - lift * 0.25, 36, 17, 0, 0, TAU);
    g.stroke();
    g.restore();
  }
  // 区域（地面，普通混合）
  for (const f of c.fields) drawField(g, f, t);
  drawFoeCanvas(g, c, t);
  // 混战与远景降噪：先用普通混合低透明度画普通 NPC 的法术与弹道，再切 lighter 画主角与核心目标，避免缩小时线团糊成一片
  if (dense || (macroFar && inWar)) {
    const npcAlpha = macroFar ? 0.36 : heavy ? 0.34 : 0.46;
    const cells = macroFar ? new Map<string, number>() : null;
    g.save();
    g.globalAlpha = npcAlpha;
    for (const v of c.vfx) {
      if (!actorFxVisible(c, v.source) || isPrimaryActor(c, v.source)) continue;
      if (cells) {
        const ck = `v:${Math.round(v.x / 160)},${Math.round(v.y / 160)}`;
        const cnt = cells.get(ck) ?? 0;
        if (cnt >= 1) continue;
        cells.set(ck, cnt + 1);
      }
      drawVfx(g, { ...v, r: (v.r ?? 40) * (macroFar ? 0.65 : 0.78) }, t);
    }
    for (const pr of c.projs as any[]) {
      if (pr.fac === 'p' || isPrimaryActor(c, pr.src)) continue;
      if (cells) {
        const ck = `p:${Math.round(pr.x / 140)},${Math.round(pr.y / 140)}`;
        const cnt = cells.get(ck) ?? 0;
        if (cnt >= 2) continue;
        cells.set(ck, cnt + 1);
        // 远景不画冗长折线拖尾，改绘干爽短灵光束，防止百人齐射缩成毛线团
        const ang = Math.atan2(pr.vy, pr.vx);
        const len = 34 / Math.max(0.12, z * 3);
        const col = pr.color as string;
        g.strokeStyle = `rgba(${col},0.75)`;
        g.lineWidth = Math.max(2, 1.5 / Math.max(0.08, z));
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(pr.x - Math.cos(ang) * len, pr.y - Math.sin(ang) * len);
        g.lineTo(pr.x, pr.y);
        g.stroke();
        continue;
      }
      drawProj(g, pr, t);
    }
    g.restore();
  }
  g.globalCompositeOperation = 'lighter';
  for (const v of c.vfx) {
    if (!actorFxVisible(c, v.source)) continue;
    if ((dense || (macroFar && inWar)) && !isPrimaryActor(c, v.source)) continue;
    drawVfx(g, v, t);
  }
  for (const pr of c.projs as any[]) {
    if ((dense || (macroFar && inWar)) && pr.fac !== 'p' && !isPrimaryActor(c, pr.src)) continue;
    drawProj(g, pr, t);
  }
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
  // 火花（混战时减弱普通 NPC 火花）
  for (const s of c.sparks) {
    if (!actorFxVisible(c, s.source)) continue;
    if (dense && !isPrimaryActor(c, s.source)) continue;
    const k = 1 - s.t / s.max;
    g.fillStyle = `rgba(${s.color},${0.7 * k})`;
    g.beginPath(); g.arc(s.x, s.y, s.size * k + 0.5, 0, TAU); g.fill();
  }
  g.restore();
}

const farMarkerState = new WeakMap<Combat, boolean>();

/** Keep guidance handoff aligned with the same zoom mode and anchor as combat markers. */
export function enemyGuidanceY(c:Combat, e:Enemy, z:number):number {
  const k=1/Math.max(.02,z);
  if(farMarkerMode(farMarkerState.get(c),z)) return e.y-30;
  const st=e.def.kind==='human'?0:beastSpriteTop('e:'+e.def.id,!!e.anim.flying);
  const top=st?e.y-st-18:e.y-(e.def.kind==='human'?150:e.anim.flying?150:100)*(e.def.look?.size??1);
  return top-10.5*k;
}

/** 血条、名牌、伤害数字（世界坐标，最上层） */
export function drawCombatUI(g: G, c: Combat, t: number, z: number) {
  const h = c.game.hero;
  // 世界坐标绘制时按缩放反补偿，远景标签保持 12 CSS 像素而非继续缩小。
  const k = 1 / Math.max(0.02, z);
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
  const units = c.units;
  const transform = g.getTransform();
  const pixelRatio = Math.abs(transform.a / z) || 1;
  const margin = 150 * pixelRatio;
  const onScreenPt = (wx: number, wy: number) => {
    const x = transform.a * wx + transform.c * wy + transform.e, y = transform.b * wx + transform.d * wy + transform.f;
    return x >= -margin && x <= g.canvas.width + margin && y >= -margin && y <= g.canvas.height + margin;
  };
  const far = farMarkerMode(farMarkerState.get(c), z);
  farMarkerState.set(c, far);
  const markCtx = resolveMarkContext(c.game);
  const visibleUnits: Enemy[] = [];
  const visibleMarks: SenseMarkInfo[] = [];
  for (const e of units) {
    if (e.dead || !onScreenPt(e.x, e.y) || enemyVis(c, e) <= 0.05) continue;
    const mark = resolveEnemyMarkKind(e, markCtx);
    if (e !== c.lock && !guidanceInfoVisible(c.game, e.def.kind === 'human' ? '修士' : '妖兽', 'enemy', e)
      && !(mark.kind === 'quest' && guidanceInfoVisible(c.game, '机缘', 'enemy', e))) continue;
    visibleUnits.push(e);
    visibleMarks.push(mark);
  }
  const npcActive = c.game?.npcs?.active;
  const npcFocus = c.game?.npcs?.focus ?? null;
  const lifeObj = c.game?.life;
  const visibleNpcs: { a: any; v: number; mark: SenseMarkInfo }[] = [];
  if (npcActive) {
    for (const a of npcActive.values()) {
      if (a.enemy || !a.d?.alive || a.d.hidden) continue;
      if (!onScreenPt(a.st.x, a.st.y)) continue;
      const v = lifeObj?.vis ? lifeObj.vis({ x: a.st.x, y: a.st.y }) : 1;
      if (v <= 0.05) continue;
      const mark = resolveNpcMarkKind(a, markCtx);
      if (a !== npcFocus && !guidanceInfoVisible(c.game, '修士', 'npc', a)
        && !(mark.kind === 'quest' && guidanceInfoVisible(c.game, '机缘', 'npc', a))) continue;
      visibleNpcs.push({ a, v, mark });
    }
  }
  if (far) {
    // 远景（含 z < 0.16 拉远视角）：全缩放持续保留各类别几何标记；
    // 按世界坐标邻域去重（非屏幕网格），避免高速飞行平移视角时 NPC 标记跨越 12px 网格线反复闪烁
    const inWarBattle = !!c.game.sectwar?.hasActiveBattle?.();
    type FarMarkItem = { key: string; x: number; y: number; alpha: number; mark: SenseMarkInfo; boss?: boolean; locked?: boolean };
    const farCandidates: FarMarkItem[] = [];
    const alwaysMarks: FarMarkItem[] = [];
    const pushFar = (item: FarMarkItem, always: boolean) => {
      if (always) { alwaysMarks.push(item); return; }
      farCandidates.push(item);
    };
    for (let i = 0; i < visibleUnits.length; i++) {
      const e = visibleUnits[i], mark = visibleMarks[i];
      const isLocked = e === c.lock;
      const isLeader = !!(e as any).warFormLeader;
      if (!isLocked && inWarBattle && (e as any).warForm && !e.boss && !isLeader) continue;
      const eKey = e.npcId ? `n:${e.npcId}` : `e:${e.def?.id ?? ''}:${Math.round(e.x)}:${Math.round(e.y)}`;
      pushFar({ key: eKey, x: e.x, y: e.y - 30, alpha: enemyVis(c, e), mark, boss: e.boss, locked: isLocked }, isLocked || !!e.boss || isLeader);
    }
    for (let i = 0; i < visibleNpcs.length; i++) {
      const { a, v, mark } = visibleNpcs[i];
      const isFocus = a === npcFocus;
      pushFar({ key: `a:${a.d.id}`, x: a.st.x, y: a.st.y - 30 - (a.st.lift || 0), alpha: v * 0.92, mark, locked: isFocus }, isFocus);
    }
    farCandidates.sort((a, b) =>
      (b.mark.priority - a.mark.priority)
      || (a.y - b.y)
      || (a.x - b.x)
      || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const invZ = 1 / Math.max(0.02, z);
    const cellW = 12 * invZ;
    const minDistSq = (10.5 * invZ) * (10.5 * invZ);
    const accepted = new Map<number, FarMarkItem[]>();
    const winners: FarMarkItem[] = [];
    for (let i = 0; i < farCandidates.length; i++) {
      const item = farCandidates[i];
      const cx = Math.floor(item.x / cellW);
      const cy = Math.floor(item.y / cellW);
      let blocked = false;
      for (let dy = -1; dy <= 1 && !blocked; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const bucket = accepted.get(((cx + dx) + 32768) * 65536 + ((cy + dy) + 32768));
          if (!bucket) continue;
          for (let j = 0; j < bucket.length; j++) {
            const p = bucket[j];
            const rx = item.x - p.x, ry = item.y - p.y;
            if (rx * rx + ry * ry < minDistSq) { blocked = true; break; }
          }
          if (blocked) break;
        }
      }
      if (blocked) continue;
      winners.push(item);
      const bk = (cx + 32768) * 65536 + (cy + 32768);
      let bucket = accepted.get(bk);
      if (!bucket) { bucket = []; accepted.set(bk, bucket); }
      bucket.push(item);
    }
    for (let i = 0; i < winners.length; i++) {
      const item = winners[i];
      g.globalAlpha = item.alpha;
      drawSenseMark(g, item.x, item.y, 4 * k, k, item.mark.kind, { elder: item.mark.elder, boss: item.boss, locked: item.locked });
    }
    for (let i = 0; i < alwaysMarks.length; i++) {
      const item = alwaysMarks[i];
      g.globalAlpha = item.alpha;
      drawSenseMark(g, item.x, item.y, 4 * k, k, item.mark.kind, { elder: item.mark.elder, boss: item.boss, locked: item.locked });
    }
  } else {
    for (let i = 0; i < visibleNpcs.length; i++) {
      const { a, v, mark } = visibleNpcs[i];
      const isFocus = a === npcFocus;
      const hScale = 1.12 * (a.look?.height || 1);
      const markY = a.st.y - 124 * hScale - (a.st.lift || 0);
      const alphaMul = isFocus || mark.kind !== 'neutral' ? 0.9 : (a.d.faction === 'mortal' ? 0.36 : 0.62);
      g.globalAlpha = v * alphaMul;
      drawSenseMark(g, a.st.x, markY, 3.6 * k, k, mark.kind, { elder: mark.elder, locked: isFocus });
    }
  }
  // 近景：神识内圈所有可见动物/妖兽/修士均绘制分类几何标记与头顶文字；极大规模混战（>24人）时再做防叠避让
  const labelIndices = far
    ? (c.lock ? (() => { const idx = visibleUnits.indexOf(c.lock); return idx >= 0 ? [idx] : []; })() : [])
    : visibleUnits.map((_, idx) => idx);
  const crowded = !far && visibleUnits.length > 24;
  if (crowded) {
    const px = c.game.player.x, py = c.game.player.y;
    labelIndices.sort((ia, ib) => {
      const a = visibleUnits[ia], b = visibleUnits[ib];
      const pa = (a === c.lock ? 0 : a.boss ? 1 : (a as any).warFormLeader ? 2 : 3);
      const pb = (b === c.lock ? 0 : b.boss ? 1 : (b as any).warFormLeader ? 2 : 3);
      if (pa !== pb) return pa - pb;
      return Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py);
    });
  }
  const placedBoxes: [number, number, number, number][] = [];
  let drawnLabels = 0;
  const labelFont = `${12 * k}px "Noto Serif SC","Songti SC",serif`;
  g.font = labelFont;
  for (const idx of labelIndices) {
    const e = visibleUnits[idx], mark = visibleMarks[idx];
    const a = enemyVis(c, e);
    if (a <= 0.05) continue;
    g.globalAlpha = a;
    const st = e.def.kind === 'human' ? 0 : beastSpriteTop('e:' + e.def.id, !!e.anim.flying);
    const top = far ? e.y - 30 - 15 * k : st ? e.y - st - 18 : e.y - (e.def.kind === 'human' ? 150 : e.anim.flying ? 150 : 100) * (e.def.look?.size ?? 1);
    const w = 70 * k, hh = 6 * k;
    if (!far) {
      // 近景人物身上的神识内圈类别标记（位于角色肩/胸口之上，不依赖名牌边框或文字前缀）
      const markY = e.y - (e.def.kind === 'human' ? 124 : (e.anim.flying ? 115 : 80)) * (e.def.look?.size ?? 1);
      drawSenseMark(g, e.x, markY, 4.2 * k, k, mark.kind, { elder: mark.elder, boss: e.boss && e === c.lock, locked: e === c.lock });
    }
    const gap = e.level - (h.realm * 13 + h.stage);
    const col = e.ally ? '#a8eec0' : gap <= -5 ? '#8ab07a' : gap < 3 ? '#e8d8a8' : gap < 13 ? '#e08a4a' : '#d03838';
    const crowdedSkip = crowded && e !== c.lock && drawnLabels >= 48;
    let label = '';
    let tw = 0;
    let showLabel = !crowdedSkip;
    if (showLabel) {
      label = enemyDisplayLabel(e);
      tw = measureLabelWidth(g, labelFont, label) + 10 * k;
      if (crowded && e !== c.lock) {
        const sx = transform.a * e.x + transform.c * (top - 10.5 * k) + transform.e;
        const sy = transform.b * e.x + transform.d * (top - 10.5 * k) + transform.f;
        const bw = tw * z * pixelRatio * 0.52, bh = 18 * pixelRatio;
        const box: [number, number, number, number] = [sx - bw, sy - bh, sx + bw, sy + bh];
        if (placedBoxes.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) {
          showLabel = false;
        } else {
          placedBoxes.push(box);
        }
      }
    }
    if (showLabel) {
      drawnLabels++;
      g.fillStyle = 'rgba(20,16,12,0.62)';
      g.fillRect(e.x - tw / 2, top - 18 * k, tw, 15 * k);
      g.fillStyle = col;
      g.fillText(label, e.x, top - 10.5 * k);
    } else if (e.hp < e.maxHp) {
      // 被避让隐藏名牌的受伤单位仅保留极细血条，敌友已由身上的神识标记一眼区分
      const sw = 28 * k, sh = 3 * k;
      g.fillStyle = 'rgba(18,14,10,0.65)'; g.fillRect(e.x - sw / 2, top - 4 * k, sw, sh);
      g.fillStyle = e.ally ? '#65c9df' : '#cf5f56'; g.fillRect(e.x - sw / 2, top - 4 * k, sw * clamp(e.hp / e.maxHp, 0, 1), sh);
    }
    if (e === c.lock && e.affix) {   // 详细词缀仅在锁定时显示
      g.font = `bold ${11 * k}px "Noto Serif SC","Songti SC",serif`;
      const tags = e.affix.ids.map((id) => AFFIX[id]), ws = tags.map((a) => g.measureText(a.name).width + 8 * k);
      let x0 = e.x - ws.reduce((s, w) => s + w + 3 * k, -3 * k) / 2;
      tags.forEach((a, i) => { g.fillStyle = 'rgba(20,14,10,0.75)'; g.fillRect(x0, top - 33 * k, ws[i], 13 * k); g.strokeStyle = `rgba(${a.col},0.8)`; g.lineWidth = 1; g.strokeRect(x0 + 0.5, top - 33 * k + 0.5, ws[i] - 1, 13 * k - 1); g.fillStyle = `rgb(${a.col})`; g.fillText(a.name, x0 + ws[i] / 2, top - 26.5 * k); x0 += ws[i] + 3 * k; });
      g.font = labelFont;
    }
    if (e === c.lock && e.blv) { const bx = e.x - tw / 2 - 7 * k, by = top - 10.5 * k, r = (3 + Math.min(4, e.blv) * 0.5) * k; g.fillStyle = `rgb(${YAODAN_COL[e.blv]})`; g.beginPath(); g.moveTo(bx, by - r); g.lineTo(bx + r * 0.75, by); g.lineTo(bx, by + r); g.lineTo(bx - r * 0.75, by); g.closePath(); g.fill(); }   // 妖丹色菱：一眼看出等阶
    if (e === c.lock) {
      g.fillStyle = 'rgba(20,16,12,0.7)'; g.fillRect(e.x - w / 2 - 1, top - 1, w + 2, hh + 2);
      g.fillStyle = e.ally ? '#3aa860' : '#a82a22'; g.fillRect(e.x - w / 2, top, w * clamp(e.hp / e.maxHp, 0, 1), hh);
      // 异状图标
      let ix = e.x - w / 2;
      for (const s in e.st) { g.fillStyle = ({ burn: '#ff7a3a', freeze: '#9ad8ff', shock: '#b8c4ff', poison: '#7ac04a', root: '#6ab05a', break: '#e0b040', slow: '#90b0d0', stun: '#f0e080' } as Record<string, string>)[s] ?? '#fff'; g.fillRect(ix, top + hh + 2 * k, 6 * k, 3 * k); ix += 8 * k; }
    }
  }
  g.globalAlpha = 1;
  for (const x of c.texts) {
    // 敌人文字跟随来源可见性；死亡后的短暂伤害/击杀提示仍可显示。
    if (!actorFxVisible(c, x.source)) continue;
    const a = x.t < 0.8 ? 1 : 1 - (x.t - 0.8) / 0.3;
    const sc = x.big ? 1.35 : 1;
    const pop = x.t < 0.1 ? 1 + (0.1 - x.t) * 4 : 1;
    g.globalAlpha = a;
    g.font = `bold ${16 * k * sc * pop}px "Noto Serif SC","Songti SC",serif`;
    g.lineWidth = 3 * k; g.strokeStyle = 'rgba(30,20,14,0.8)';
    g.strokeText(x.s, x.x, x.y); g.fillStyle = x.color; g.fillText(x.s, x.x, x.y);
  }
  g.restore();
}

/** 第二十四步：WebGL 模式下，特效关键图画在 UI 透明画布上（GL 粒子负责光晕与火花，贴图负责法术本体形态） */
export function drawCombatSprites(g: G, c: Combat, t: number) {
  const p = c.game.player;
  const z = c.game?.cam?.zoom ?? 1;
  const macroFar = z < 0.36;
  const inWar = !!c.game.sectwar?.hasActiveBattle?.();
  const nUnits = c.units.length;
  const dense = nUnits >= 8, heavy = nUnits >= 14;
  const spCells = macroFar && (dense || inWar) ? new Map<string, number>() : null;
  g.save();
  if (dense) {
    const lift = p.st.lift || 0;
    g.save();
    g.strokeStyle = 'rgba(155, 232, 255, 0.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(p.x, p.y - lift * 0.25, 36, 17, 0, 0, TAU);
    g.stroke();
    g.restore();
  }
  for (const f of c.fields) {
    if (f.fx !== 'array') continue;
    const k = clamp(f.t / 0.3, 0, 1) * clamp((f.dur - f.t) / 0.4, 0, 1);
    g.save(); g.translate(f.x, f.y); g.scale(1, 0.55);
    vfxRing(g, 'array_activate_ring', 0, 0, f.r * 1.08, 0.8 * k, t * 0.25);
    g.restore();
    if (f.t < 0.6) vfxBurst(g, 'array_activate_burst', f.x, f.y - f.r * 0.17, f.r * 0.7, f.t / 0.6, 0, 1, 0.8);
  }
  for (const v of c.vfx as any[]) {
    if (!actorFxVisible(c, v.source)) continue;
    const prim = isPrimaryActor(c, v.source);
    if (spCells && !prim) {
      const ck = `v:${Math.round(v.x / 160)},${Math.round(v.y / 160)}`;
      const cnt = spCells.get(ck) ?? 0;
      if (cnt >= 1) continue;
      spCells.set(ck, cnt + 1);
    }
    const u = clamp(v.t / v.dur, 0, 1), col = v.color as string;
    if (v.t < 0) continue;
    const npcDim = (dense || (macroFar && inWar)) && !prim;
    const vr = npcDim ? (v.r ?? 40) * (macroFar ? 0.62 : 0.72) : v.r;
    g.save();
    if (npcDim) g.globalAlpha *= macroFar ? 0.36 : heavy ? 0.32 : 0.44;
    switch (v.kind) {
      case 'flash': if (v.fx) vfxBurst(g, burstKey(v.fx, col, v.school), v.x, v.y, Math.max(46, vr * 1.5), u, (v.seed ?? v.x) % 6.28); break;
      case 'ring': if (v.fx && v.fx !== 'roar') vfxBurst(g, v.fx === 'poison' ? 'poison_cloud_ring' : v.fx === 'vine' ? 'wood_vines_ring' : burstKey(v.fx, col, v.school), v.x, v.y - vr * 0.12, vr * 0.95, u, (v.x * 0.37) % 6.28, 0.62); break;
      case 'strike': {
        const fx = v.fx;
        if (fx === 'lightning' || fx === 'goldthunder') { vfxColumn(g, fx === 'lightning' ? 'thunder_blue_head' : 'thunder_gold_head', v.x, v.y + 10, 460, Math.min(1, (1 - u) * 1.6), (v.seed ?? 0) % 2 > 1); vfxBurst(g, fx === 'lightning' ? 'thunder_blue_burst' : 'thunder_gold_burst', v.x, v.y - 20, vr * 0.9, u, 0, 0.7); }
        else if (fx === 'frost') vfxBurst(g, 'ice_freeze_head', v.x, v.y - vr * 0.3, vr * 0.8, u * 0.7, 0, 1);
        else if (fx === 'rock') vfxBurst(g, 'earth_spike_head', v.x, v.y - vr * 0.35, vr * 0.85, u * 0.7, 0, 1);
        else if (fx === 'flame') vfxBurst(g, 'fireball_burst', v.x, v.y - 20, vr * 0.9, u, 0, 0.75);
        break;
      }
      case 'blinkfx': vfxBurst(g, 'teleport_flash_burst', v.x, v.y - 50, vr * 1.5, u, 0, 1, 0.9); break;
      case 'aura':
        if (v.fx === 'breakthrough') breakFx(g, v, u);
        else if (v.fx === 'leaf') { vfxBurst(g, 'heal_green_burst', v.x, v.y - 60, vr * 1.1, u, 0, 1, 0.85); vfxBurst(g, 'heal_green_ring', v.x, v.y, vr * 1.1, u, 0, 0.45, 0.8); }
        else vfxBurst(g, 'shield_gold_burst', v.x, v.y - 8, vr * 1.15, u, 0, 0.5, 0.8);
        break;
    }
    g.restore();
  }
  for (const pr of c.projs as any[]) {
    const prim = pr.fac === 'p' || isPrimaryActor(c, pr.src);
    if (spCells && !prim) {
      const ck = `p:${Math.round(pr.x / 140)},${Math.round(pr.y / 140)}`;
      const cnt = spCells.get(ck) ?? 0;
      if (cnt >= 2) continue;
      spCells.set(ck, cnt + 1);
    }
    const set = projSet(pr.fx, pr.color); if (!set) continue;
    const npcDim = (dense || (macroFar && inWar)) && !prim;
    const s = (pr.size ?? 1) * (npcDim ? 0.82 : 1), tr = pr.trail as [number, number][];
    const sz = (PROJ_SIZE[set] ?? 70) * Math.min(2.2, Math.max(0.7, s)) * (pr.fac === 'p' ? 1 : 0.9);
    const tl = macroFar && npcDim ? Math.min(72 * s, Math.hypot((tr[0]?.[0] ?? pr.x) - pr.x, (tr[0]?.[1] ?? pr.y) - pr.y))
      : tr.length > 1 ? Math.min(260 * s, Math.hypot(tr[0][0] - pr.x, tr[0][1] - pr.y)) : 0;
    const baseA = (pr.fx === 'mind' ? 0.6 : 0.96) * Math.min(1, pr.life / 0.06) * (npcDim ? (macroFar ? 0.45 : heavy ? 0.45 : 0.58) : 1);
    vfxProj(g, set, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), sz, tl, baseA, t + pr.x * 0.01);
  }
  if (c.shield && !c.shield.art) { const s = c.shield, k = s.amt / s.max, key = shieldKey(s.fx, s.color); vfxRing(g, key, p.x, p.y - 56 - (p.st.lift || 0), 84, 0.42 + 0.3 * k, key === 'shield_gold_ring' ? 0 : t * 0.3); }
  if (c.heal) vfxRing(g, 'heal_green_ring', p.x, p.y - (p.st.lift || 0), 74, 0.55, t * 0.6, 0.42);
  g.restore();
}

/** 突破：脚下灵阵张开，一道光柱冲天，渐隐 */
function breakFx(g: G, v: any, u: number) {
  const a = u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.4);
  vfxRing(g, 'breakthrough_ring', v.x, v.y, v.r * (0.7 + 0.5 * Math.min(1, u * 3)), a * 0.9, u * 2, 0.45);
  vfxColumn(g, 'breakthrough_burst', v.x, v.y + 30, 460 * (0.8 + 0.25 * Math.min(1, u * 4)), a * 0.95);
}
