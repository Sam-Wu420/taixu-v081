import './env';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  mapJoystickVector,
  JOY_DEAD_PX,
  JOY_DEAD_MAG,
  JOY_RUN_MAG,
} from '../src/core/joystick';
import { REALMS, slowWalkCap, flyCruiseCap } from '../src/data/realms';
import { TUNING } from '../src/data/tuning';
import { Terrain } from '../src/world/terrain';
import { Game } from '../src/world/game';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const R = 70; // max = 70 * 0.62 = 43.4px
const max = R * 0.62;

// 1) 死区内（d <= 4px 或 mag <= 0.05）必须静止
const deadPx = mapJoystickVector(JOY_DEAD_PX, 0, R);
assert.equal(deadPx.x, 0);
assert.equal(deadPx.y, 0);
assert.equal(deadPx.mag, 0);

const deadSmallMag = mapJoystickVector(4.5, 0, 150); // max = 93 -> mag = 0.0484 <= 0.05
assert.equal(deadSmallMag.x, 0);
assert.equal(deadSmallMag.y, 0);
assert.equal(deadSmallMag.mag, 0);

// 2) 轻推区（<= 0.86）：速度严格随摇杆推力 mag 线性比例变化，无平台区跳变
let prevLen = 0;
for (const m of [0.12, 0.25, 0.45, 0.65, 0.86]) {
  const ang = 0.7;
  const out = mapJoystickVector(Math.cos(ang) * m * max, Math.sin(ang) * m * max, R);
  const len = Math.hypot(out.x, out.y);
  assert.ok(Math.abs(len - m) < 1e-9, `proportional m=${m} -> len=${len}`);
  assert.ok(len > prevLen);
  assert.ok(out.mag <= JOY_RUN_MAG, `m=${m} must not trigger sprint`);
  prevLen = len;
}

// 3) 疾行区（mag > 0.86）与超界夹紧
const runOut = mapJoystickVector(0.92 * max, 0, R);
assert.ok(Math.abs(Math.hypot(runOut.x, runOut.y) - 0.92) < 1e-9);
assert.ok(runOut.mag > JOY_RUN_MAG);

const farOut = mapJoystickVector(300, 400, R);
assert.equal(farOut.mag, 1);
assert.ok(Math.abs(Math.hypot(farOut.knobX, farOut.knobY) - max) < 1e-6);
assert.ok(Math.abs(Math.hypot(farOut.x, farOut.y) - 1) < 1e-9);

// 4) 境界基础曲线 + 动态分挡验证
for (let i = 1; i < REALMS.length; i++) {
  assert.ok(REALMS[i].speed > REALMS[i - 1].speed, `realm ${REALMS[i].name} speed must exceed ${REALMS[i - 1].name}`);
  if (i >= 2) {
    assert.ok(REALMS[i].speed / REALMS[i - 1].speed >= 1.10, `realm ${REALMS[i].name} step >= 1.10x`);
  }
}

const t = new Terrain();
t.build();
const g = new Game(t);
g.reset();

const walkCap = slowWalkCap();
assert.equal(walkCap, REALMS[1].speed, 'slowWalkCap should match 炼气期 base speed');

// 凡人慢行低于炼气上限；炼气至大罗所有境界慢行统一封顶为炼气速度，疾行恢复当前境界真实速度
g.hero.realm = 0;
g.player.flying = false;
g.player.running = false;
assert.equal(g.speed, REALMS[0].speed);

let prevSprint = 0;
let prevCruise = 0;
let prevBoost = 0;
for (let r = 1; r < REALMS.length; r++) {
  g.hero.realm = r;
  g.hero.stage = 0;
  g.hero.equip = {};

  g.player.flying = false;
  g.player.boosting = false;
  g.player.running = false;
  assert.equal(g.speed, walkCap, `realm ${REALMS[r].name} slow walk must equal 炼气 cap`);

  g.player.running = true;
  const sprint = g.speed;
  assert.ok(Math.abs(sprint - REALMS[r].speed * TUNING.move.runMul) < 1e-6, `realm ${REALMS[r].name} sprint must use true speed`);
  assert.ok(sprint > prevSprint, `realm ${REALMS[r].name} sprint must exceed previous realm`);
  prevSprint = sprint;

  if (REALMS[r].fly) {
    g.player.flying = true;
    g.player.running = false;
    g.player.boosting = false;
    const cruise = g.speed;
    const expectedCruise = Math.min(REALMS[r].speed * TUNING.move.flyMul, flyCruiseCap(r, 1));
    assert.ok(Math.abs(cruise - expectedCruise) < 1e-6, `realm ${REALMS[r].name} cruise=${cruise} expected=${expectedCruise}`);
    assert.ok(cruise > prevCruise, `realm ${REALMS[r].name} cruise must rise gently across realms`);
    prevCruise = cruise;

    g.player.boosting = true;
    const boost = g.speed;
    assert.ok(Math.abs(boost - REALMS[r].speed * TUNING.move.flyMul * TUNING.move.boostMul.light) < 1e-6, `realm ${REALMS[r].name} boost must use true speed`);
    assert.ok(boost > cruise && boost > prevBoost);
    prevBoost = boost;
  }
}

// 高境界配极品飞行法宝时，未疾行仍受动态巡航上限约束，开启遁光立即释放全速
g.hero.realm = 12;
g.hero.equip = { flight: 'art_xuankong_yunzhou' };
g.player.flying = true;
g.player.boosting = false;
const daluoCruise = g.speed;
const daluoRawFly = REALMS[12].speed * TUNING.move.flyMul * 2.6;
assert.ok(daluoCruise < daluoRawFly * 0.3, `大罗巡航应显著低于原始叠乘 (${daluoCruise} vs ${daluoRawFly})`);
g.player.boosting = true;
assert.ok(g.speed > daluoRawFly * 1.5, '大罗开启遁光后应释放真实全速');

// 4b) 化神后期真实 update(dt) 验证：
// - 穿戴四方飞天靴+御风天赋时，未疾行最大步速仍严格锁死在炼气基准；
// - 一旦触发疾行或催动遁光，必须严格按原境界基础速度（化神=850）× 装备 × 天赋公式计算；
// - reset() 清空疾行开关
assert.deepEqual(
  REALMS.slice(2).map((r) => r.speed),
  [300, 440, 610, 850, 1150, 1480, 1880, 2400, 3000, 3700, 4600],
  '筑基至大罗基础速度必须保持原设定，不得因慢行/慢飞而下调',
);
g.reset();
g.hero.realm = 5;
g.hero.stage = 2; // 化神后期
g.hero.equip = { boots: 'art_sifangxue', flight: 'art_fenglei' };
g.hero.talents = ['t_yufeng'];
g.player.flying = false;
g.input.run = false;
g.input.keys.clear();
g.input.keys.add('d');
g.update(0.05);
assert.equal(g.player.running, false, '化神后期常规步行不得触发疾行');
assert.equal(g.speed, walkCap, '化神后期步行最大速度必须降回炼气基准');
const jWalk = mapJoystickVector(0.85 * max, 0, R);
g.input.keys.clear();
g.input.joy.x = jWalk.x; g.input.joy.y = jWalk.y; g.input.joyMag = jWalk.mag;
g.update(0.05);
assert.equal(g.player.running, false, '摇杆轻推未过阈值时化神后期不得触发疾行');
assert.equal(g.speed, walkCap, '摇杆轻推阶段最大基准速度必须保持炼气基准');
const jSprint = mapJoystickVector(max, 0, R);
g.input.joy.x = jSprint.x; g.input.joy.y = jSprint.y; g.input.joyMag = jSprint.mag;
g.update(0.05);
assert.equal(g.player.running, true, '摇杆推满应触发疾行');
const expectedHuashenSprint = 850 * 1.15 * TUNING.move.runMul * g.equipSpeed('boots');
assert.ok(Math.abs(g.speed - expectedHuashenSprint) < 1e-6, `化神后期疾行速度=${g.speed} 应等于原公式 ${expectedHuashenSprint}`);
g.player.flying = true;
g.update(0.05);
const expectedHuashenThunder = 850 * 1.15 * TUNING.move.flyMul * g.equipSpeed('flight') * TUNING.move.boostMul.thunder;
assert.ok(Math.abs(g.speed - expectedHuashenThunder) < 1e-6, `化神后期雷遁速度=${g.speed} 应等于原公式 ${expectedHuashenThunder}`);
g.input.run = true;
g.reset();
assert.equal(g.input.run, false, 'reset() 必须清理残留的疾行开关状态');

// 5) 源码级联不变量：摇杆推至疾行同步切换按钮、飞行非疾行显示「慢 / 慢行」
const gameSrc = readFileSync(new URL('../src/world/game.ts', import.meta.url), 'utf8');
const gvSrc = readFileSync(new URL('../src/ui/GameView.tsx', import.meta.url), 'utf8');
const caveSrc = readFileSync(new URL('../src/ui/CaveScene.tsx', import.meta.url), 'utf8');
assert.ok(gameSrc.includes('run: this.input.run || this.input.joyMag > JOY_RUN_MAG'), 'UIState.run must reflect joystick sprint state');
assert.ok(gameSrc.includes('if (joyRun !== this.lastJoyRun)'), 'game.ts must push immediate updateUI when crossing joystick sprint threshold');
assert.ok(gameSrc.includes('flyCruiseCap(') && gameSrc.includes('slowWalkCap()'), 'game.ts must use dynamic slowWalkCap and flyCruiseCap');
assert.ok(gvSrc.includes("ui.flying ? '慢' : '步'") && gvSrc.includes("ui.flying ? '慢行' : '步行'"), 'GameView must show 慢/慢行 when flying and not sprinting');
assert.ok(caveSrc.includes('mapJoystickVector') && caveSrc.includes('JOY_RUN_MAG'), 'CaveScene must share joystick mapping');
assert.ok(JOY_RUN_MAG > JOY_DEAD_MAG);

console.log('proportional joystick, UI button sync, flying slow label, and dynamic speed tiers passed');
