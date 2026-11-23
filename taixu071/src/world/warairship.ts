// v0.74 · 宗门战船 / 飞舟空战系统
// - 三阶宗门飞舟（一阶轻型灵舟 / 二阶战阵飞舟 / 三阶镇宗玄舟），含正魔及灵/仙扩展主题
// - 严格闭环：甲板操舟手受灵力护盾绝对保护；外围御剑护法维持回盾与防空；破盾窗口期方可伤及船体与操舟弟子
// - 武器配置：一阶单门轻弩炮；二阶双联破阵灵炮(140px爆) + 舷侧连弩；三阶镇宗重炮(280px破阵破盾) + 四方玄光连弩 + 战鼓鼓舞波
// - 击沉坠落空中腰斩断船，冒烟残骸留场 30 秒

import type { Game } from './game';
import type { Enemy } from './combat';
import type { Drawable } from './life';
import type { School } from '../data/arts';
import {
  drawAirshipEntity,
  airshipDirFromVec,
  airshipDirFromAngle,
  angleOfAirshipDir,
  getAirshipMetrics,
  getAirshipShieldAxes,
  type AirshipDir8,
  type AirshipStyle,
  type AirshipTier,
} from '../gfx/airship';
import {
  applyFormationDamage,
  ensureFormationShield,
  facingFromVec,
  type WarFormation,
} from './warformation';
import { pushWorldDiscipleBatch, type DiscipleBatchUnit } from './sectwarTypes';
import type { CustomSectUniform } from '../gfx/sectUniform';

export interface AirshipBuildSpec {
  tier: AirshipTier;
  name: string;
  dockLvReq: number;
  stones: number;
  mats: number;
  days: number;
  repairStones: number;
  repairMats: number;
}

export const AIRSHIP_BUILD_SPEC: Record<AirshipTier, AirshipBuildSpec> = {
  1: { tier: 1, name: '一阶轻型灵舟', dockLvReq: 1, stones: 2400, mats: 12, days: 18, repairStones: 600, repairMats: 3 },
  2: { tier: 2, name: '二阶战阵飞舟', dockLvReq: 3, stones: 8500, mats: 32, days: 42, repairStones: 2100, repairMats: 8 },
  3: { tier: 3, name: '三阶镇宗玄舟', dockLvReq: 5, stones: 26000, mats: 75, days: 90, repairStones: 6500, repairMats: 18 },
};
export const AIRSHIP_MAT_STONE_PRICE = 180;

export interface AirshipTierSpec {
  tier: AirshipTier;
  name: string;
  moName: string;
  maxHp: number;
  maxShield: number;
  shieldRegen: number;
  minCrew: number;
  crewMax: number;
  escortTarget: number;
  zLift: number;
  cannonCd: number;
  chargeTime: number;
  cannonDmg: number;
  cannonRange: number;
  cannonAoe: number;
  cannonSalvo: number;
  secondaryCd: number;
  secondaryRange: number;
  secondaryDmg: number;
  drumCd: number;
}

export const AIRSHIP_BATTLE_SPEC: Record<AirshipTier, AirshipTierSpec> = {
  1: {
    tier: 1,
    name: '轻型灵舟',
    moName: '幽冥轻舟',
    maxHp: 900,
    maxShield: 650,
    shieldRegen: 22,
    minCrew: 8,
    crewMax: 10,
    escortTarget: 8,
    zLift: 150,
    cannonCd: 5.5,
    chargeTime: 0.7,
    cannonDmg: 85,
    cannonRange: 1050,
    cannonAoe: 0,
    cannonSalvo: 1,
    secondaryCd: 0,
    secondaryRange: 0,
    secondaryDmg: 0,
    drumCd: 0,
  },
  2: {
    tier: 2,
    name: '战阵飞舟',
    moName: '骨翼战舟',
    maxHp: 2600,
    maxShield: 1950,
    shieldRegen: 58,
    minCrew: 14,
    crewMax: 20,
    escortTarget: 16,
    zLift: 200,
    cannonCd: 6.5,
    chargeTime: 1.2,
    cannonDmg: 175,
    cannonRange: 1350,
    cannonAoe: 140,
    cannonSalvo: 2,
    secondaryCd: 2.2,
    secondaryRange: 450,
    secondaryDmg: 58,
    drumCd: 0,
  },
  3: {
    tier: 3,
    name: '镇宗玄舟',
    moName: '血煞魔舰',
    maxHp: 6400,
    maxShield: 4600,
    shieldRegen: 120,
    minCrew: 25,
    crewMax: 35,
    escortTarget: 26,
    zLift: 260,
    cannonCd: 9.0,
    chargeTime: 1.8,
    cannonDmg: 380,
    cannonRange: 1700,
    cannonAoe: 280,
    cannonSalvo: 1,
    secondaryCd: 1.6,
    secondaryRange: 560,
    secondaryDmg: 75,
    drumCd: 12.0,
  },
};

export interface WarAirship {
  id: number;
  warId: number;
  sid: string;
  sectName: string;
  ours: boolean;
  tier: AirshipTier;
  style: AirshipStyle;
  bannerText: string;
  customUniform?: CustomSectUniform;
  x: number;
  y: number;
  tx: number;
  ty: number;
  zLift: number;
  vx: number;
  vy: number;
  dir: AirshipDir8;
  /** 连续航向角（弧度）、目标转向角与转向防抖冷却，杜绝战船瞬间 180° 甩头 */
  faceAng?: number;
  targetFaceAng?: number;
  faceTurnCd?: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldRegen: number;
  brokenT: number;
  crew: number;
  minCrew: number;
  crewMax: number;
  escorts: Enemy[];
  escortsMax: number;
  cannonCd: number;
  cannonCharge: number;
  cannonMaxCharge: number;
  secondaryCd: number;
  drumCd: number;
  lastShieldHitT: number;
  lastHullHitT: number;
  sunk: boolean;
  wreckT: number;
  smokeAcc: number;
  uncrewedWarned?: boolean;
  fleetHandled?: boolean;
  /** 战后撤离 / 归营目标坐标与淡出计时 */
  retreatTx?: number;
  retreatTy?: number;
  retreatMode?: 'return' | 'rout';
  retreatFadeT?: number;
  retreatFadeMax?: number;
}

export function createWarAirship(opts: {
  id: number;
  warId: number;
  sid: string;
  sectName: string;
  ours: boolean;
  tier: AirshipTier;
  style: AirshipStyle;
  x: number;
  y: number;
  tx: number;
  ty: number;
  crew: number;
  escortsMax?: number;
  customUniform?: CustomSectUniform;
}): WarAirship {
  const sp = AIRSHIP_BATTLE_SPEC[opts.tier];
  const dx0 = opts.tx - opts.x, dy0 = opts.ty - opts.y;
  const initAng = dx0 * dx0 + dy0 * dy0 >= 1e-4 ? Math.atan2(dy0, dx0) : 0;
  const dir = airshipDirFromAngle(initAng);
  return {
    id: opts.id,
    warId: opts.warId,
    sid: opts.sid,
    sectName: opts.sectName,
    ours: opts.ours,
    tier: opts.tier,
    style: opts.style,
    bannerText: opts.sectName.slice(0, 1) || (opts.ours ? '宗' : '敌'),
    customUniform: opts.customUniform,
    x: opts.x,
    y: opts.y,
    tx: opts.tx,
    ty: opts.ty,
    zLift: sp.zLift,
    vx: 0,
    vy: 0,
    dir,
    faceAng: initAng,
    targetFaceAng: initAng,
    faceTurnCd: 0,
    hp: sp.maxHp,
    maxHp: sp.maxHp,
    shield: sp.maxShield,
    maxShield: sp.maxShield,
    shieldRegen: sp.shieldRegen,
    brokenT: 0,
    crew: Math.max(sp.minCrew, Math.min(sp.crewMax, opts.crew)),
    minCrew: sp.minCrew,
    crewMax: sp.crewMax,
    escorts: [],
    escortsMax: Math.max(1, opts.escortsMax ?? sp.escortTarget),
    cannonCd: sp.cannonCd * (0.45 + Math.random() * 0.45),
    cannonCharge: 0,
    cannonMaxCharge: sp.chargeTime,
    secondaryCd: sp.secondaryCd * (0.5 + Math.random() * 0.5),
    drumCd: sp.drumCd,
    lastShieldHitT: -99,
    lastHullHitT: -99,
    sunk: false,
    wreckT: 30,
    smokeAcc: 0,
  };
}

function wrapShipAngle(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

/** 战船有界角速度连续转向（与弟子战阵一致：带水平滞回防抖与分阶角速度上限，严禁瞬间甩头） */
export function turnAirshipToward(
  ship: WarAirship,
  dx: number,
  dy: number,
  dt: number,
  opts?: { instant?: boolean; forceTarget?: boolean; minDelta?: number },
): number {
  if (ship.faceAng === undefined || !Number.isFinite(ship.faceAng)) {
    ship.faceAng = angleOfAirshipDir(ship.dir);
  }
  if (ship.targetFaceAng === undefined || !Number.isFinite(ship.targetFaceAng)) {
    ship.targetFaceAng = ship.faceAng;
  }
  const hasVec = dx * dx + dy * dy >= 1e-4;
  if (opts?.instant && hasVec) {
    const a = Math.atan2(dy, dx);
    ship.faceAng = a;
    ship.targetFaceAng = a;
    ship.faceTurnCd = 0;
    ship.dir = airshipDirFromAngle(a);
    return a;
  }

  const stepDt = Math.max(0, dt);
  ship.faceTurnCd = Math.max(0, (ship.faceTurnCd ?? 0) - stepDt);
  const minDelta = opts?.minDelta ?? (opts?.forceTarget ? 0.04 : 0.12);

  if (hasVec && (opts?.forceTarget || ship.faceTurnCd <= 0)) {
    const wantAng = Math.atan2(dy, dx);
    const prevCos = Math.cos(ship.faceAng);
    const wantCos = Math.cos(wantAng);
    // 水平越线 < 110px 时防抖滞回（除非显式切换撤退/航点），防止靶标微幅错位导致左右反复摆头
    if (opts?.forceTarget || Math.abs(dx) > 110 || wantCos * prevCos >= 0) {
      if (Math.abs(wrapShipAngle(wantAng - ship.targetFaceAng)) > minDelta) {
        ship.targetFaceAng = wantAng;
        if (!opts?.forceTarget) {
          ship.faceTurnCd = wantCos * prevCos < 0 ? 1.15 : 0.65;
        }
      }
    } else if (Math.abs(dy) > 95) {
      const clampedX = prevCos >= 0 ? Math.max(12, Math.abs(dx)) : -Math.max(12, Math.abs(dx));
      const clampedAng = Math.atan2(dy, clampedX);
      if (Math.abs(wrapShipAngle(clampedAng - ship.targetFaceAng)) > minDelta) {
        ship.targetFaceAng = clampedAng;
        ship.faceTurnCd = 0.65;
      }
    }
  }

  // 一/二/三阶分别按 1.15 / 0.85 / 0.62 rad/s 平滑旋舵（约 2.7s ~ 5.0s 完成掉头）
  const turnRate = ship.tier === 1 ? 1.15 : ship.tier === 2 ? 0.85 : 0.62;
  const maxTurn = turnRate * stepDt;
  const diff = wrapShipAngle(ship.targetFaceAng - ship.faceAng);
  if (Math.abs(diff) <= maxTurn) ship.faceAng = ship.targetFaceAng;
  else ship.faceAng = wrapShipAngle(ship.faceAng + Math.sign(diff) * maxTurn);

  ship.dir = airshipDirFromAngle(ship.faceAng);
  return ship.faceAng;
}

/** 判定点击/法术命中点是否在飞舟实体受击范围内（涵盖高空船体与正下方护盾投影圈） */
export function isPointOnAirship(ship: WarAirship, wx: number, wy: number, pad = 0): boolean {
  if (ship.sunk) return false;
  const m = getAirshipMetrics(ship.tier);
  const ang = ship.faceAng !== undefined && Number.isFinite(ship.faceAng) ? ship.faceAng : angleOfAirshipDir(ship.dir);
  const sh = getAirshipShieldAxes(ship.tier, ang, 1);
  const rx = (ship.shield > 0 ? sh.rx : sh.rx * ((m.hullLength * 0.46) / m.shieldRx)) + pad;
  const ry = (ship.shield > 0 ? sh.ry : sh.ry * 0.72) + pad;
  const cr = Math.cos(sh.rot), sr = Math.sin(sh.rot);
  const dx = wx - ship.x;
  const checkEll = (dy: number, lim: number) => {
    const lx = dx * cr + dy * sr;
    const ly = -dx * sr + dy * cr;
    return Math.hypot(lx / rx, ly / ry) <= lim;
  };
  const cyAir = ship.y - ship.zLift;
  if (checkEll(wy - cyAir, 1.0)) return true;
  // 也兼容玩家朝飞舟地面投影方向施法的命中判定
  const cyMid = ship.y - ship.zLift * 0.45;
  return checkEll(wy - cyMid, 0.92);
}

/** 飞舟受击：开启护盾时绝对拦截所有伤害并保护甲板操舟弟子；破盾窗口才损及船体与操舟手 */
export function applyAirshipDamage(
  ship: WarAirship,
  rawDmg: number,
  attackerRealm: number,
  game?: Game,
  opts?: { shieldBonus?: number; fromNpc?: boolean; school?: School },
): { hullDmg: number; crewLost: number; sunkNow: boolean } {
  if (ship.sunk || rawDmg <= 0) return { hullDmg: 0, crewLost: 0, sunkNow: false };
  const realmMul = attackerRealm >= 5 ? 2.4 : attackerRealm >= 4 ? 1.8 : attackerRealm === 3 ? 1.3 : attackerRealm === 2 ? 1.0 : 0.75;
  const effDmg = rawDmg * realmMul;
  const now = game?.time ?? 0;

  if (ship.shield > 0) {
    const sDmg = effDmg * (opts?.shieldBonus ?? 1);
    const absorbed = Math.min(ship.shield, sDmg);
    ship.shield = Math.max(0, ship.shield - absorbed);
    ship.lastShieldHitT = now;
    if (ship.shield > 0) {
      if (!opts?.fromNpc) {
        game?.combat?.texts.push({
          x: ship.x + (Math.random() - 0.5) * 60,
          y: ship.y - ship.zLift - 58,
          s: `舟盾 -${Math.max(1, Math.round(absorbed))}`,
          color: '#9ee6ff',
          t: 0,
          vy: -32,
        });
      }
      return { hullDmg: 0, crewLost: 0, sunkNow: false };
    }
    // 护盾刚破碎：开启 8.0 秒破盾窗口期，甲板与船体暴露！
    ship.brokenT = 8.0;
    const m = getAirshipMetrics(ship.tier);
    game?.combat?.vfx.push({
      kind: 'ring',
      x: ship.x,
      y: ship.y - ship.zLift,
      r: m.shieldRx * 0.9,
      t: 0,
      dur: 0.65,
      color: '255,210,120',
      fx: 'shock' as any,
    });
    game?.combat?.texts.push({
      x: ship.x,
      y: ship.y - ship.zLift - 96,
      s: `${ship.sectName}飞舟护盾破碎！甲板暴露！`,
      color: ship.ours ? '#ff9d80' : '#ffe38c',
      t: 0,
      vy: -28,
      big: true,
    });
    return { hullDmg: 0, crewLost: 0, sunkNow: false };
  }

  // 破盾窗口期：直接损伤船体耐久并震伤甲板操舟弟子
  const hullDmg = Math.min(ship.hp, Math.max(1, Math.round(effDmg)));
  ship.hp = Math.max(0, ship.hp - hullDmg);
  ship.lastHullHitT = now;
  const crewLost = Math.min(ship.crew, Math.max(0, Math.round(hullDmg / (ship.tier === 3 ? 210 : ship.tier === 2 ? 150 : 110))));
  ship.crew = Math.max(0, ship.crew - crewLost);

  if (ship.crew < ship.minCrew && !ship.uncrewedWarned && ship.hp > 0) {
    ship.uncrewedWarned = true;
    ship.cannonCharge = 0;
    game?.combat?.texts.push({
      x: ship.x,
      y: ship.y - ship.zLift - 86,
      s: '操舟弟子不足！灵阵失稳！',
      color: '#ffb478',
      t: 0,
      vy: -28,
    });
  }

  if (!opts?.fromNpc) {
    game?.combat?.texts.push({
      x: ship.x + (Math.random() - 0.5) * 48,
      y: ship.y - ship.zLift - 64,
      s: `-${hullDmg}${crewLost > 0 ? ` (操舟-${crewLost})` : ''}`,
      color: '#ff9678',
      t: 0,
      vy: -34,
    });
  }

  if (ship.hp <= 0) {
    ship.sunk = true;
    ship.wreckT = 30.0;
    ship.cannonCharge = 0;
    const m = getAirshipMetrics(ship.tier);
    game?.combat?.vfx.push({
      kind: 'ring',
      x: ship.x,
      y: ship.y - ship.zLift * 0.5,
      r: m.hullLength * 0.55,
      t: 0,
      dur: 0.9,
      color: '255,140,70',
      fx: 'fireball' as any,
    });
    game?.combat?.texts.push({
      x: ship.x,
      y: ship.y - ship.zLift - 92,
      s: `${AIRSHIP_BATTLE_SPEC[ship.tier][ship.style === 'mo' ? 'moName' : 'name']}龙骨腰斩坠毁！`,
      color: '#ff9a68',
      t: 0,
      vy: -24,
      big: true,
    });
    if (!opts?.fromNpc) {
      game && (game.war.merit += ship.tier * 45);
    }
    return { hullDmg, crewLost, sunkNow: true };
  }

  return { hullDmg, crewLost, sunkNow: false };
}

/** 飞舟单帧更新：护航拦截、回盾/失稳、主炮蓄力发射、副炮防空、三阶战鼓、击沉30秒断船残骸 */
export function tickWarAirship(
  ship: WarAirship,
  dt: number,
  game: Game,
  allShips: WarAirship[],
  allFormations: WarFormation[],
  enemyActors: Enemy[],
  allyActors: Enemy[],
  holdFire = false,
): boolean {
  const sp = AIRSHIP_BATTLE_SPEC[ship.tier];
  const m = getAirshipMetrics(ship.tier);

  if (ship.sunk) {
    ship.wreckT -= dt;
    // 坠落地面过程（快速砸地后停在原地冒烟 30 秒）
    if (ship.zLift > 0) {
      ship.zLift = Math.max(0, ship.zLift - 260 * dt);
    }
    ship.smokeAcc += dt;
    if (ship.smokeAcc >= 0.42 && game.combat) {
      ship.smokeAcc = 0;
      game.combat.sparks.push({
        x: ship.x + (Math.random() - 0.5) * m.hullLength * 0.35,
        y: ship.y - ship.zLift - 18,
        vx: (Math.random() - 0.5) * 18,
        vy: -36 - Math.random() * 24,
        t: 0,
        max: 1.5,
        size: ship.tier === 3 ? 16 : 11,
        color: '85,72,66',
      });
    }
    return ship.wreckT > 0;
  }

  // 统计外围护法存活比例
  ship.escorts = ship.escorts.filter((e) => !e.dead && !e.gone);
  const escortsAlive = ship.escorts.length;
  const escortRatio = Math.min(1, escortsAlive / Math.max(1, ship.escortsMax));
  const crewOperational = ship.crew >= ship.minCrew;

  // 1) 航行定位与平滑连续转向（严禁瞬间掉头；急转弯时呈弧线回转）
  const dxT = ship.tx - ship.x;
  const dyT = ship.ty - ship.y;
  const dT = Math.hypot(dxT, dyT);
  const baseSpd = ship.tier === 1 ? 155 : ship.tier === 2 ? 115 : 82;
  const maxSpd = holdFire && dT > 260 ? Math.max(baseSpd, 400) : baseSpd;
  if (dT > 24 && crewOperational) {
    const curAng = turnAirshipToward(ship, dxT, dyT, dt, { forceTarget: holdFire && dT > 260 });
    const wantAng = Math.atan2(dyT, dxT);
    const angErr = Math.abs(wrapShipAngle(wantAng - curAng));
    const moveSpd = Math.min(maxSpd, dT * 1.4) * (angErr > 0.7 ? 0.72 : 1.0);
    // 远距急转向时沿当前船艏弧线回转而非倒车平移；临近航点直接对齐落位
    const moveAng = dT > 150 && angErr > 0.45 ? curAng : wantAng;
    ship.vx = Math.cos(moveAng) * moveSpd;
    ship.vy = Math.sin(moveAng) * moveSpd;
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
  } else {
    ship.vx *= 0.85;
    ship.vy *= 0.85;
  }

  // 2) 开启护盾时阻止敌方飞行单位（含玩家）越盾登舰伤及甲板操舟弟子
  if (ship.shield > 0) {
    const curShipAng = ship.faceAng !== undefined && Number.isFinite(ship.faceAng) ? ship.faceAng : angleOfAirshipDir(ship.dir);
    const shProj = getAirshipShieldAxes(ship.tier, curShipAng, 1);
    const repelRx = shProj.rx * 0.52;
    const repelRy = shProj.ry * 0.56;
    const cr = Math.cos(shProj.rot), sr = Math.sin(shProj.rot);
    const cyAir = ship.y - ship.zLift;
    const checkList = ship.ours ? enemyActors : allyActors;
    for (const u of checkList) {
      if (u.dead || (u.flyH ?? 0) < 16) continue;
      const rx = u.x - ship.x;
      const ry = (u.y - u.flyH) - cyAir;
      const lx = rx * cr + ry * sr;
      const ly = -rx * sr + ry * cr;
      const ell = Math.hypot(lx / repelRx, ly / repelRy);
      if (ell > 0.001 && ell < 1.0) {
        const push = (1.04 - ell) * 280 * dt;
        u.x += (rx / (Math.hypot(rx, ry) || 1)) * push;
        u.y += (ry / (Math.hypot(rx, ry) || 1)) * push;
      }
    }
    if (!ship.ours && game.isFlying && !game.hero.dead) {
      const p = game.player;
      const rx = p.x - ship.x;
      const ry = (p.y - (p.st.lift ?? 0)) - cyAir;
      const lx = rx * cr + ry * sr;
      const ly = -rx * sr + ry * cr;
      const ell = Math.hypot(lx / repelRx, ly / repelRy);
      if (ell > 0.001 && ell < 1.0) {
        const len = Math.hypot(rx, ry) || 1;
        const scaleOut = 1.03 / Math.max(0.1, ell);
        p.x = ship.x + rx * scaleOut;
        p.y = ship.y + ry * scaleOut;
      }
    }
  }

  // 3) 护盾窗口期与外围护法维持回盾
  if (ship.brokenT > 0) {
    ship.brokenT = Math.max(0, ship.brokenT - dt);
  } else if (crewOperational && ship.shield < ship.maxShield && game.time - ship.lastShieldHitT >= 2.8) {
    const regenRate = ship.shieldRegen * (0.25 + 0.75 * escortRatio);
    ship.shield = Math.min(ship.maxShield, ship.shield + regenRate * dt);
  }

  if (holdFire || !crewOperational || !game.combat) return true;

  // 4) 主炮索敌、蓄力预警与开火
  const foeShips = allShips.filter((s) => !s.sunk && s.ours !== ship.ours);
  const foeForms = allFormations.filter((f) => !f.collapsed && f.soldiers > 0 && f.ours !== ship.ours);
  const foeUnits = ship.ours ? enemyActors : allyActors;

  let tgtX: number | null = null;
  let tgtY: number | null = null;
  let tgtShip: WarAirship | null = null;
  let tgtForm: WarFormation | null = null;
  let tgtUnit: Enemy | null = null;
  let bestDist = sp.cannonRange;

  if (ship.tier >= 2) {
    // 二/三阶优先点杀破盾/残盾敌舟，其次优先集火破盾/高威胁敌方战阵
    let bestShipScore = -Infinity;
    for (const fs of foeShips) {
      const d = Math.hypot(fs.x - ship.x, fs.y - ship.y);
      if (d >= sp.cannonRange) continue;
      const sc = -d * 0.25 + (fs.brokenT > 0 ? 1500 : fs.shield < fs.maxShield * 0.35 ? 650 : 0) + fs.tier * 180;
      if (sc > bestShipScore) { bestShipScore = sc; tgtShip = fs; tgtForm = null; tgtUnit = null; tgtX = fs.x; tgtY = fs.y - fs.zLift * 0.7; }
    }
    if (!tgtShip) {
      let bestFormScore = -Infinity;
      for (const ff of foeForms) {
        const d = Math.hypot(ff.x - ship.x, ff.y - ship.y);
        if (d >= sp.cannonRange) continue;
        const sc = -d * 0.25 + ((ff.brokenT ?? 0) > 0 ? 1500 : (ff.shield ?? 0) < (ff.shieldMax ?? 1) * 0.3 ? 700 : 0) + ff.soldiers * 1.5;
        if (sc > bestFormScore) { bestFormScore = sc; tgtForm = ff; tgtUnit = null; tgtX = ff.x; tgtY = ff.y; }
      }
    }
  }
  if (tgtX === null) {
    for (const u of foeUnits) {
      if (u.dead || (u as any).warForm) continue;
      const d = Math.hypot(u.x - ship.x, u.y - ship.y);
      if (d < bestDist) { bestDist = d; tgtUnit = u; tgtX = u.x; tgtY = u.y - (u.flyH ?? 0); }
    }
    if (!ship.ours && !game.hero.dead) {
      const pd = Math.hypot(game.player.x - ship.x, game.player.y - ship.y);
      if (pd < bestDist) { bestDist = pd; tgtX = game.player.x; tgtY = game.player.y - (game.player.st.lift ?? 0); tgtUnit = null; }
    }
    // 一阶突击灵舟周围无散兵时也协同炮击附近敌阵
    if (tgtX === null && foeForms.length) {
      for (const ff of foeForms) {
        const d = Math.hypot(ff.x - ship.x, ff.y - ship.y);
        if (d < bestDist) { bestDist = d; tgtForm = ff; tgtUnit = null; tgtX = ff.x; tgtY = ff.y; }
      }
    }
  }

  if (tgtX !== null && tgtY !== null) {
    // 悬停接战时平滑转向目标方向（有界角速度，不瞬间甩头，允许小角度微调锁头）
    if (dT <= 24) turnAirshipToward(ship, tgtX - ship.x, tgtY - ship.y, dt, { forceTarget: true, minDelta: 0.05 });
    if (ship.cannonCharge > 0) {
      ship.cannonCharge += dt;
      if (ship.cannonCharge >= ship.cannonMaxCharge) {
        ship.cannonCharge = 0;
        ship.cannonCd = sp.cannonCd;
        fireAirshipMainCannon(ship, sp, tgtX, tgtY, tgtShip, tgtForm, tgtUnit, game);
      }
    } else {
      ship.cannonCd -= dt;
      if (ship.cannonCd <= 0) {
        ship.cannonCharge = 0.01;
      }
    }
  } else {
    if (dT <= 24) {
      const fAng = ship.targetFaceAng ?? ship.faceAng ?? angleOfAirshipDir(ship.dir);
      turnAirshipToward(ship, Math.cos(fAng), Math.sin(fAng), dt);
    }
    ship.cannonCharge = 0;
    ship.cannonCd = Math.max(0.4, ship.cannonCd - dt);
  }

  // 5) 副武器：舷侧防空连弩（自动驱离靠近的敌方飞行单位）
  if (sp.secondaryCd > 0) {
    ship.secondaryCd -= dt;
    if (ship.secondaryCd <= 0) {
      let bestU: Enemy | null = null;
      let bestD = sp.secondaryRange;
      for (const u of foeUnits) {
        if (u.dead || (u as any).warForm) continue;
        if ((u.flyH ?? 0) < 12 && u.realm < 2) continue;
        const d = Math.hypot(u.x - ship.x, u.y - ship.y);
        if (d < bestD) { bestD = d; bestU = u; }
      }
      const p = game.player;
      const pFlyDist = !ship.ours && !game.hero.dead && game.isFlying ? Math.hypot(p.x - ship.x, p.y - ship.y) : 1e9;
      if (bestU || pFlyDist < sp.secondaryRange) {
        ship.secondaryCd = sp.secondaryCd;
        const tx = bestU ? bestU.x : p.x;
        const ty = bestU ? bestU.y - (bestU.flyH ?? 0) - 24 : p.y - (p.st.lift ?? 0) - 24;
        const ox = ship.x, oy = ship.y - ship.zLift;
        const ang = Math.atan2(ty - oy, tx - ox);
        const boltSpd = 980;
        const shotN = ship.tier >= 3 ? 2 : 1;
        for (let k = 0; k < shotN; k++) {
          const sa = ang + (shotN > 1 ? (k - 0.5) * 0.14 : 0);
          game.combat.projs.push({
            fac: ship.ours ? 'p' : 'e',
            ally: ship.ours,
            fx: 'needle',
            color: ship.style === 'mo' ? '255,100,130' : '150,230,255',
            realm: ship.tier + 1,
            x: ox,
            y: oy,
            vx: Math.cos(sa) * boltSpd,
            vy: Math.sin(sa) * boltSpd,
            life: 0,
            max: (sp.secondaryRange + 80) / boltSpd,
            dmg: sp.secondaryDmg,
            pierce: false,
            homing: false,
            hit: new Set(),
            r: 18,
            aoe: 0,
            school: ship.style === 'mo' ? '魔' : '剑',
            size: 1.0,
            trail: [],
          } as any);
        }
      } else {
        ship.secondaryCd = 0.6;
      }
    }
  }

  // 6) 三阶旗舰：战鼓灵气鼓舞波（周期性小幅补充下方己方战阵护盾/灵池）
  if (sp.drumCd > 0) {
    ship.drumCd -= dt;
    if (ship.drumCd <= 0) {
      ship.drumCd = sp.drumCd;
      game.combat.vfx.push({
        kind: 'ring',
        x: ship.x,
        y: ship.y,
        r: 420,
        t: 0,
        dur: 0.75,
        color: ship.style === 'mo' ? '255,95,120' : '255,220,120',
        fx: 'shock' as any,
      });
      for (const ff of allFormations) {
        if (ff.collapsed || ff.soldiers <= 0 || ff.ours !== ship.ours) continue;
        if (Math.hypot(ff.x - ship.x, ff.y - ship.y) > 780) continue;
        const sh = ensureFormationShield(ff);
        if ((ff.brokenT ?? 0) <= 0) ff.shield = Math.min(sh.shieldMax, (ff.shield ?? 0) + Math.round(sh.shieldMax * 0.08));
        ff.mp = Math.min(sh.mpMax, (ff.mp ?? 0) + Math.round(sh.mpMax * 0.14));
      }
    }
  }

  return true;
}

function fireAirshipMainCannon(
  ship: WarAirship,
  sp: AirshipTierSpec,
  tgtX: number,
  tgtY: number,
  tgtShip: WarAirship | null,
  tgtForm: WarFormation | null,
  tgtUnit: Enemy | null,
  game: Game,
) {
  const combat = game.combat;
  if (!combat) return;
  const ox = ship.x;
  const oy = ship.y - ship.zLift - 12;
  const color = ship.style === 'mo' ? '255,80,110' : '120,235,255';
  const school: School = ship.style === 'mo' ? '魔' : '雷';

  if (ship.tier === 3) {
    // 三阶镇宗主炮：高空贯穿重光炮 + 落点 280px 灵爆（破阵/破盾倍率 ×1.5）
    combat.vfx.push({
      kind: 'beam',
      x: ox,
      y: oy,
      x2: tgtX,
      y2: tgtY,
      r: 36,
      t: 0,
      dur: 0.48,
      color,
      fx: 'goldthunder',
      seed: Math.random() * 1e6,
    });
    combat.vfx.push({
      kind: 'ring',
      x: tgtX,
      y: tgtY,
      r: sp.cannonAoe,
      t: 0,
      dur: 0.55,
      color,
      fx: 'fireball' as any,
    });
    if (tgtShip && !tgtShip.sunk) {
      applyAirshipDamage(tgtShip, sp.cannonDmg, 3, game, { shieldBonus: 1.5, fromNpc: true, school });
    }
    if (tgtForm && !tgtForm.collapsed) {
      applyFormationDamage(tgtForm, sp.cannonDmg * 1.25, 3, game, { school, fromNpc: true, hitX: tgtX, hitY: tgtY });
    }
    game.sectwar?.damageFormationArea(tgtX, tgtY, sp.cannonAoe, sp.cannonDmg, ship.ours ? 'foe' : 'ally', 3, school, undefined, true);
    if (!ship.ours && !game.hero.dead && Math.hypot(game.player.x - tgtX, game.player.y - tgtY) <= sp.cannonAoe) {
      combat.hitPlayer(sp.cannonDmg * 0.72, 3, undefined, ox, ship.y);
    }
    return;
  }

  // 一阶单发轻弩炮 / 二阶双联破阵灵炮
  const ang = Math.atan2(tgtY - oy, tgtX - ox);
  const pSpd = ship.tier === 2 ? 840 : 760;
  for (let i = 0; i < sp.cannonSalvo; i++) {
    const a = ang + (sp.cannonSalvo > 1 ? (i - 0.5) * 0.1 : 0);
    combat.projs.push({
      fac: ship.ours ? 'p' : 'e',
      ally: ship.ours,
      fx: ship.style === 'mo' ? 'firesnake' : 'fireball',
      color,
      realm: ship.tier + 1,
      x: ox,
      y: oy,
      vx: Math.cos(a) * pSpd,
      vy: Math.sin(a) * pSpd,
      life: 0,
      max: (sp.cannonRange + 140) / pSpd,
      dmg: sp.cannonDmg,
      formDmg: sp.cannonDmg * 1.15,
      formRealm: ship.tier + 1,
      pierce: false,
      homing: false,
      hit: new Set(),
      r: ship.tier === 2 ? 28 : 20,
      aoe: sp.cannonAoe,
      school,
      size: ship.tier === 2 ? 1.55 : 1.15,
      trail: [],
      target: tgtUnit,
      targetForm: tgtForm,
    } as any);
  }
}

function airshipEscortVisualCount(ship: WarAirship): number {
  if (ship.sunk || ship.crew <= 0) return 0;
  // 真实战斗船（id >= 0）按存活护法比例显示护航剑修；对峙/撤离船（id < 0）按阶位配置 4/6/8 名御剑护航
  if (ship.id < 0) return ship.tier === 3 ? 8 : ship.tier === 2 ? 6 : 4;
  return ship.escorts.length;
}

/** 将飞舟及外围御剑护航弟子收集进入世界 Y 排序列表（高空压在地面/低空修士上方；30秒断船残骸落在地面） */
export function collectAirshipDrawables(
  ships: WarAirship[],
  out: Drawable[],
  view: { left: number; top: number; right: number; bottom: number },
  t: number,
  lockedId?: number,
  z = 1,
  ren?: {
    pushAtlasSpr?: (...args: any[]) => boolean;
    dpr?: number;
  },
) {
  for (const ship of ships) {
    const m = getAirshipMetrics(ship.tier);
    const pad = m.hullLength * 0.8;
    if (
      ship.x < view.left - pad ||
      ship.x > view.right + pad ||
      ship.y < view.top - pad - 200 ||
      ship.y > view.bottom + pad + 320
    ) {
      continue;
    }

    const wreckFade = ship.sunk ? Math.min(1, Math.max(0, ship.wreckT / 4.0)) : 1;
    const shieldRatio = ship.sunk || ship.maxShield <= 0 ? 0 : ship.shield / ship.maxShield;
    const chargeRatio = !ship.sunk && ship.cannonCharge > 0 ? Math.min(1, ship.cannonCharge / Math.max(0.1, ship.cannonMaxCharge)) : 0;
    const shipAng = ship.faceAng !== undefined && Number.isFinite(ship.faceAng) ? ship.faceAng : angleOfAirshipDir(ship.dir);

    // 外围御剑护航弟子（不再在甲板/风帆上叠人，改为分列飞舟两侧高空御剑护卫）
    const escortVisN = airshipEscortVisualCount(ship);
    if (!ship.sunk && escortVisN > 0 && z >= 0.08) {
      const cosA = Math.cos(shipAng);
      const sinA = Math.sin(shipAng);
      const perpX = -sinA;
      const perpY = cosA;
      const faceDir = facingFromVec(cosA, sinA, cosA < 0);
      const backUnits: DiscipleBatchUnit[] = [];
      const frontUnits: DiscipleBatchUnit[] = [];
      const pairs = Math.ceil(escortVisN / 2);
      for (let i = 0; i < escortVisN; i++) {
        const sideSign = i % 2 === 0 ? -1 : 1;
        const rIdx = Math.floor(i / 2);
        const u = pairs <= 1 ? 0 : (rIdx / (pairs - 1)) - 0.5;
        const fwdOff = -u * m.halfL * 1.42 + (i % 2 === 0 ? 14 : -14);
        const latOff = sideSign * (m.halfW * 2.15 + 68 + (rIdx % 2) * 26);
        const swayFwd = Math.sin(t * 1.25 + i * 1.73 + ship.id * 0.3) * 14;
        const swayLat = Math.cos(t * 1.05 + i * 2.11 + ship.id * 0.5) * 10;
        const ex = ship.x + cosA * (fwdOff + swayFwd) + perpX * (latOff + swayLat);
        const ey = ship.y + sinA * (fwdOff + swayFwd) + perpY * (latOff + swayLat) * 0.72;
        if (ex < view.left - 160 || ex > view.right + 160 || ey < view.top - 160 || ey > view.bottom + 260) continue;
        const eLift = ship.zLift * 0.88 + ((rIdx % 2) * 12 - 6) + Math.sin(t * 2.4 + i * 1.45) * 6;
        const fr = Math.floor(t * 1.2 + i * 0.7) & 1;
        const unit: DiscipleBatchUnit = {
          x: ex,
          y: ey,
          lift: eLift,
          variant: i % 6,
          facing: faceDir.facing,
          frame: fr,
          flipX: faceDir.flip,
        };
        if (ey < ship.y) backUnits.push(unit);
        else frontUnits.push(unit);
      }
      const shipYBase = ship.y + 18000;
      if (backUnits.length) {
        const markIdx = out.length;
        pushWorldDiscipleBatch(out, ren, backUnits, 'D·护舟弟子', ship.sid, ship.customUniform, z, ship.ours);
        for (let j = markIdx; j < out.length; j++) out[j].y = shipYBase - 220 + (j - markIdx);
      }
      if (frontUnits.length) {
        const markIdx = out.length;
        pushWorldDiscipleBatch(out, ren, frontUnits, 'D·护舟弟子', ship.sid, ship.customUniform, z, ship.ours);
        for (let j = markIdx; j < out.length; j++) out[j].y = shipYBase + 220 + (j - markIdx);
      }
    }

    out.push({
      y: ship.sunk ? ship.y + 30 : ship.y + 18000,
      k: 'D·宗门飞舟',
      draw: (g) => {
        drawAirshipEntity(
          g,
          ship.x,
          ship.y,
          ship.zLift,
          ship.dir,
          t,
          { tier: ship.tier, style: ship.style, bannerText: ship.bannerText },
          {
            angle: shipAng,
            shieldRatio,
            chargeRatio,
            wreck: ship.sunk,
            wreckFade,
            scale: 1,
          },
        );

        // 战船血条/护盾条/操舟人数与蓄力指示（远近景随 z 自适应）
        if (!ship.sunk && z >= 0.08) {
          drawAirshipHud(g, ship, lockedId === ship.id, z);
        }
      },
    });
  }
}

function drawAirshipHud(g: CanvasRenderingContext2D, ship: WarAirship, locked: boolean, z: number) {
  const m = getAirshipMetrics(ship.tier);
  const sp = AIRSHIP_BATTLE_SPEC[ship.tier];
  const inv = z < 0.35 ? Math.min(2.6, 0.35 / Math.max(0.08, z)) : 1;
  const barW = Math.min(180, 94 + ship.tier * 28) * inv;
  const x = ship.x;
  const y = ship.y - ship.zLift - m.h * 0.38 - 18 * inv;

  g.save();
  const escortCnt = airshipEscortVisualCount(ship);
  const title = `${ship.sectName}·${sp[ship.style === 'mo' ? 'moName' : 'name']} (舟${ship.crew}/${ship.minCrew} · 护${escortCnt})`;
  g.font = `bold ${Math.round(12 * inv)}px "Noto Serif SC", serif`;
  g.textAlign = 'center';
  const tw = Math.max(barW + 18 * inv, g.measureText(title).width + 18 * inv);
  g.fillStyle = 'rgba(14,12,10,0.82)';
  g.fillRect(x - tw * 0.5, y - 30 * inv, tw, 38 * inv);
  g.strokeStyle = locked ? 'rgba(255,220,110,0.98)' : ship.ours ? 'rgba(110,205,255,0.88)' : 'rgba(255,115,105,0.88)';
  g.lineWidth = (locked ? 2.0 : 1.2) * inv;
  g.strokeRect(x - tw * 0.5, y - 30 * inv, tw, 38 * inv);
  g.fillStyle = locked ? '#ffe89c' : ship.ours ? '#bfe6ff' : '#ffc2b8';
  g.fillText(title, x, y - 14 * inv);

  // 耐久条 + 护盾条
  const bx = x - barW * 0.5;
  const hpFrac = Math.max(0, Math.min(1, ship.hp / ship.maxHp));
  const shFrac = Math.max(0, Math.min(1, ship.shield / Math.max(1, ship.maxShield)));
  g.fillStyle = 'rgba(30,20,18,0.9)';
  g.fillRect(bx, y - 8 * inv, barW, 5 * inv);
  g.fillStyle = ship.ours ? '#62c478' : '#e05848';
  g.fillRect(bx, y - 8 * inv, barW * hpFrac, 5 * inv);

  g.fillStyle = 'rgba(20,26,34,0.9)';
  g.fillRect(bx, y - 1 * inv, barW, 4 * inv);
  g.fillStyle = ship.brokenT > 0 ? '#ffb85c' : '#64c8ff';
  g.fillRect(bx, y - 1 * inv, barW * shFrac, 4 * inv);
  g.restore();
}
