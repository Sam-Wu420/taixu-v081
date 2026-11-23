import './env';
import assert from 'node:assert/strict';
import { createCanvas } from './env';
import { CharState, HANLI_LOOK, DEFAULT_WARDROBE, dressLook, drawCharacter } from '../src/gfx/character';

const g: any = createCanvas(420, 420).getContext('2d');
for (const sex of ['m', 'f'] as const) for (const free of [true, false]) for (const speed of [0, 240, 1200]) for (let d = 0; d < 8; d++) {
  const st = new CharState(210, 310);
  st.naturalFlight = true; st.setFreeFlight(free); st.setAction('fly');
  st.speed = speed; st.yaw = st.targetYaw = d * Math.PI / 4; st.blend = 1;
  const look = dressLook(HANLI_LOOK, DEFAULT_WARDROBE[sex]);
  let info: any;
  for (let i = 0; i < 6; i++) {
    st.update(1 / 60);
    drawCharacter(g, look, st, 1.3, 1 / 60, { noDefaultMount: true, onFlightArms: (x) => { info = x; } });
  }
  const pose: any = st.last;
  if (free) {
    assert.ok(pose.lean <= 0.18, 'free flight stays upright-poised like mounted flight');
    assert.equal(pose.lIK, 1, 'free flight uses behind-hand IK');
    assert.equal(pose.rIK, 1, 'free flight uses chest sword-seal IK');
    assert.ok(pose.lTz < 0 && pose.rTz > 0, 'free flight places one hand behind and sword-seal hand in front');
    assert.equal(pose.lHip, 0); assert.equal(pose.rHip, 0);
    assert.equal(pose.lHipR, pose.rHipR);
    assert.equal(pose.lKn, pose.rKn);
    assert.equal(pose.lFoot, 0); assert.equal(pose.rFoot, 0);
  }
  for (const side of ['left', 'right']) {
    const [, upper, lower] = info[side];
    assert.ok(upper > 0 && lower > 0);
  }
}

// Equipped player returns exactly to the old sword pose, including IK and legs.
for (const sex of ['m', 'f'] as const) {
  const look = dressLook(HANLI_LOOK, DEFAULT_WARDROBE[sex]);
  const renderPose = (natural: boolean) => {
    const st = new CharState(210, 310);
    st.seed = 5; st.t = 1; st.speed = 240; st.naturalFlight = natural;
    st.setAction('fly'); st.blend = 1;
    drawCharacter(g, look, st, 1, 0, { noDefaultMount: true });
    return st.last;
  };
  assert.deepEqual(renderPose(true), renderPose(false));
}

// Transition blend on free-flight toggle
const st = new CharState(200, 300);
st.naturalFlight = true; st.setAction('fly'); st.blend = 1;
drawCharacter(g, HANLI_LOOK, st, 1, 1 / 60);
st.setFreeFlight(true);
assert.equal(st.blend, 0); assert.ok(st.from);
st.update(0.08);
assert.ok(st.blend > 0 && st.blend < 1);

// Casting while flying (both freeFlight and mounted) changes upper-body pose clearly within 0.12s while keeping flight legs
for (const free of [true, false]) {
  for (let style = 0; style < 4; style++) {
    const cst = new CharState(200, 300);
    cst.seed = 0; cst.naturalFlight = true; cst.setFreeFlight(free);
    cst.setAction('fly'); cst.blend = 1;
    drawCharacter(g, HANLI_LOOK, cst, 1, 1 / 60, { noDefaultMount: true });
    const flyPose = { ...cst.last! };
    cst.gait = 'fly';
    cst.castN = style - 1;
    cst.castPose();
    for (let f = 0; f < 9; f++) {
      cst.update(1 / 60);
      drawCharacter(g, HANLI_LOOK, cst, 1, 1 / 60, { noDefaultMount: true });
    }
    const castP = cst.last!;
    assert.equal(castP.lHip, flyPose.lHip);
    assert.equal(castP.rHip, flyPose.rHip);
    const upperDelta = Math.abs(castP.rTx - flyPose.rTx) + Math.abs(castP.rTy - flyPose.rTy) + Math.abs(castP.rTz - flyPose.rTz);
    assert.ok(upperDelta > 5, `free=${free} style=${style}: cast upper body must move clearly during flight (delta=${upperDelta})`);
  }
}

console.log('flight pose: sword-poise upper body, standing free legs, cast-in-flight upper body transitions, 3 speeds, 8 directions passed');
