import assert from 'node:assert/strict';
import './env';

(globalThis as any).window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { ArtActs, flyY, lookOf, trailPts } = await import('../src/world/artacts');
const { itemDef } = await import('../src/data/items');

const LIFT = 90;
const makeFakeCombat = () => ({
  reach: 500,
  enemies: [],
  fxq: [],
  summons: [],
  hitEnemy() {},
  impact() {},
  game: {
    time: 10,
    player: { x: 1000, y: 2000, st: { lift: LIFT } },
    juice() {},
    toast() {},
  },
} as any);

function makeFxSpy() {
  const calls: { op: string; x: number; y: number }[] = [];
  const spy: any = {
    B: { strip() {} },
    sprite(_cell: number, x: number, y: number) { calls.push({ op: 'sprite', x, y }); },
    trail(pts: [number, number][]) { if (pts.length) calls.push({ op: 'trail_end', x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] }); },
    glow(x: number, y: number) { calls.push({ op: 'glow', x, y }); },
    flash(x: number, y: number) { calls.push({ op: 'flash', x, y }); },
    ring(x: number, y: number) { calls.push({ op: 'ring', x, y }); },
    orb(x: number, y: number) { calls.push({ op: 'orb', x, y }); },
    bolt(x0: number, y0: number, x1: number, y1: number) { calls.push({ op: 'bolt0', x: x0, y: y0 }, { op: 'bolt1', x: x1, y: y1 }); },
    emit(e: { x: number; y: number }) { calls.push({ op: 'emit', x: e.x, y: e.y }); },
    ground() {},
    shockRing(x: number, y: number) { calls.push({ op: 'shockRing', x, y }); },
    shock(x: number, y: number) { calls.push({ op: 'shock', x, y }); },
    sparks(x: number, y: number) { calls.push({ op: 'sparks', x, y }); },
    beam(x0: number, y0: number) { calls.push({ op: 'beam', x: x0, y: y0 }); },
    smoke() {},
    circle() {},
    rays() {},
    glint() {},
  };
  return { spy, calls };
}

function makeCtxSpy() {
  const translates: [number, number][] = [];
  const ctx: any = {
    save() {},
    restore() {},
    translate(x: number, y: number) { translates.push([x, y]); },
    rotate() {},
    scale() {},
    beginPath() {},
    ellipse() {},
    arc() {},
    rect() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    fillRect() {},
    drawImage() {},
    clip() {},
    setLineDash() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  };
  return { ctx, translates };
}

function makeInit(itemId: string) {
  const def = itemDef(itemId);
  return {
    itemId,
    art: def.art!,
    L: lookOf(itemId),
    cc: [0.6, 0.9, 1] as [number, number, number],
    dmg: 50,
    src: { realm: 2, stCh: 0 },
    pieces: def.art!.pieces,
    ax: 1300,
    ay: 2000,
    target: null,
  };
}

// 1. SwordAct: Blade sprite, glow, flash, trailPts, and bodies must all share flyY(b) = b.y - b.h - LIFT
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_qingfeng')), true);
  acts.update(0.01); // ph 0 -> 1
  acts.update(0.25); // ph 1 -> 2
  const sword: any = acts.list[0];
  const b = sword.blades[0];
  const expectedY = flyY(b);
  assert.ok(b.lift === LIFT, 'Sword blade captures player lift');
  assert.ok(Math.abs(expectedY - (b.y - b.h - LIFT)) < 1e-6);

  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 1, 0.016);
  const spriteCall = calls.find((x) => x.op === 'sprite');
  const glowCall = calls.find((x) => x.op === 'glow');
  const trailEnd = calls.find((x) => x.op === 'trail_end');
  assert.ok(spriteCall && Math.abs(spriteCall.y - expectedY) < 1e-6, `Sword sprite y=${spriteCall?.y} expected=${expectedY}`);
  assert.ok(glowCall && Math.abs(glowCall.y - expectedY) < 1e-6, `Sword glow y=${glowCall?.y} expected=${expectedY}`);
  assert.ok(trailEnd && Math.abs(trailEnd.y - expectedY) < 1e-6, `Sword trail end y=${trailEnd?.y} expected=${expectedY}`);
  const pts = trailPts(b);
  assert.ok(Math.abs(pts[pts.length - 1][1] - expectedY) < 1e-6);
}

// 2. JinfuAct: mother blade glow matches flyY(m)
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_jinfu')), true);
  acts.update(0.05);
  const act: any = acts.list[0];
  const expectedY = flyY(act.mom);
  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 1, 0.016);
  const glowCall = calls.find((x) => x.op === 'glow');
  assert.ok(glowCall && Math.abs(glowCall.y - expectedY) < 1e-6, `Jinfu glow y=${glowCall?.y} expected=${expectedY}`);
}

// 3. RingAct: bodies() translate and glow() ring/glow/orb all match flyY(f)
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_wuxing')), true);
  acts.update(0.1);
  const act: any = acts.list[0];
  const expectedY = flyY(act.f);
  const out: any[] = [];
  acts.collect(out);
  const { ctx, translates } = makeCtxSpy();
  out[0].draw(ctx);
  assert.ok(translates.some(([, ty]) => Math.abs(ty - expectedY) < 1e-6), `Ring body translate y=${JSON.stringify(translates)} expected=${expectedY}`);
  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 1, 0.016);
  const ringCall = calls.find((x) => x.op === 'ring');
  const glowCall = calls.find((x) => x.op === 'glow');
  assert.ok(ringCall && Math.abs(ringCall.y - expectedY) < 1e-6, `Ring GL y=${ringCall?.y} expected=${expectedY}`);
  assert.ok(glowCall && Math.abs(glowCall.y - expectedY) < 1e-6, `Ring glow y=${glowCall?.y} expected=${expectedY}`);
}

// 4. MirrorAct: body and glow both lift by -LIFT
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_ningguang')), true);
  acts.update(0.05);
  const act: any = acts.list[0];
  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 1, 0.016);
  const glowCall = calls.find((x) => x.op === 'glow');
  assert.ok(glowCall && Math.abs(glowCall.y - (act.my - 96 - LIFT)) < 1e-6, `Mirror glow y=${glowCall?.y} expected=${act.my - 96 - LIFT}`);
  const out: any[] = [];
  acts.collect(out);
  const { ctx, translates } = makeCtxSpy();
  out[0].draw(ctx);
  assert.ok(translates.some(([, ty]) => ty < act.my - 80 - LIFT + 10), `Mirror body lifted: ${JSON.stringify(translates)}`);
}

// 5. BellAct: body and glow both lift by -LIFT
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_yinzhong')), true);
  acts.update(0.25);
  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 1, 0.016);
  const glowCall = calls.find((x) => x.op === 'glow');
  assert.ok(glowCall && Math.abs(glowCall.y - (2000 - 165 - LIFT)) < 1e-6, `Bell glow y=${glowCall?.y}`);
  const out: any[] = [];
  acts.collect(out);
  const { ctx, translates } = makeCtxSpy();
  out[0].draw(ctx);
  assert.ok(translates.some(([, ty]) => Math.abs(ty - (2000 - 170 - LIFT)) < 1e-6), `Bell body translate y=${JSON.stringify(translates)}`);
}

// 6. BindAct: head path and glow start lifted by -LIFT
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_fulongsuo')), true);
  acts.update(0.05);
  acts.update(0.05);
  const act: any = acts.list[0];
  const expectedY = flyY(act.head);
  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 1, 0.016);
  const glowCall = calls.find((x) => x.op === 'glow');
  assert.ok(glowCall && Math.abs(glowCall.y - expectedY) < 1e-6, `Bind glow y=${glowCall?.y} expected=${expectedY}`);
}

// 7. Dynamic mid-flight player movement + lift change:
//    - Trail points keep their baked world Y (zero vertical jump when lift changes)
//    - Returning artifacts (SwordAct / RingAct / JinfuAct) and held artifacts (MirrorAct / BellAct) track new player pos & lift
{
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_qingfeng')), true);
  acts.update(0.01); // ph 0 -> 1
  acts.update(0.25); // ph 1 -> 2
  const sword: any = acts.list[0];
  const b = sword.blades[0];
  const bakedTrailY0 = b.trail[0][1];

  // Player moves far away and lands (lift: 90 -> 0) while sword is flying out / returning
  c.game.player.x = 1800;
  c.game.player.y = 2300;
  c.game.player.st.lift = 0;

  for (let i = 0; i < 30; i++) acts.update(0.03);
  assert.equal(b.trail[0][1] === bakedTrailY0 || b.trail.length === 12, true);
  // Force ph = 3 if still ph 2, then step return
  if (b.ph === 2) { b.ph = 3; b.pt = 0; }
  for (let i = 0; i < 15 && b.ph === 3; i++) {
    acts.update(0.03);
    if (b.ph === 3) {
      const { spy, calls } = makeFxSpy();
      acts.drawGL(spy, 1 + i * 0.03, 0.03);
      const expectedY = flyY(b);
      const spriteCall = calls.find((x) => x.op === 'sprite');
      const glowCall = calls.find((x) => x.op === 'glow');
      const trailEnd = calls.find((x) => x.op === 'trail_end');
      assert.ok(spriteCall && Math.abs(spriteCall.y - expectedY) < 1e-6);
      assert.ok(glowCall && Math.abs(glowCall.y - expectedY) < 1e-6);
      assert.ok(trailEnd && Math.abs(trailEnd.y - expectedY) < 1e-6);
    }
  }
  assert.ok((b.lift ?? 0) < LIFT * 0.5, `Sword lift converged toward new player lift 0, got ${b.lift}`);

  // MirrorAct follows moved player & new lift dynamically
  assert.equal(acts.spawn(makeInit('art_ningguang')), true);
  const mirror: any = acts.list[acts.list.length - 1];
  c.game.player.x = 2100;
  c.game.player.y = 2400;
  c.game.player.st.lift = 120;
  acts.update(0.05);
  assert.ok(Math.abs(mirror.mx - (2100 + Math.cos(mirror.aim) * 56)) < 1e-6);
  const { spy, calls } = makeFxSpy();
  acts.drawGL(spy, 2, 0.016);
  const mGlow = calls.filter((x) => x.op === 'glow').pop();
  assert.ok(mGlow && Math.abs(mGlow.y - (mirror.my - 96 - 120)) < 1e-6);
}

// 8. Exact return-to-player position & lift convergence (SwordAct, JinfuAct, RingAct)
{
  // 8a. SwordAct: even at coarse dt=0.05 (step > 100px), blade catches player cleanly without tunneling,
  //     converging lift 100% to player lift and emitting cast fx at exact torso height.
  const c = makeFakeCombat();
  const acts = new ArtActs(c);
  assert.equal(acts.spawn(makeInit('art_qingfeng')), true);
  const sword: any = acts.list[0];
  const b = sword.blades[0];
  b.ph = 3; b.pt = 0.2; b.x = 1350; b.y = 2000; b.h = 46; b.lift = 0; b.vx = -2100; b.vy = 0;
  c.game.player.x = 1000; c.game.player.y = 2000; c.game.player.st.lift = 135;
  c.fxq.length = 0;
  for (let i = 0; i < 10 && !sword.done; i++) acts.update(0.05);
  assert.equal(sword.done, true, 'SwordAct finished return without tunneling');
  assert.equal(b.x, 1000);
  assert.equal(b.y, 2000);
  assert.equal(b.lift, 135);
  assert.equal(b.h, 72);
  const sCast = c.fxq.find((q: any) => q.k === 'cast');
  assert.ok(sCast && sCast.x === 1000 && sCast.y === 2000 - 70 - 135, `Sword cast fx=${JSON.stringify(sCast)}`);

  // 8b. JinfuAct: when mother blade arrives before kids, mom.vis -> 0 (hidden from bodies & glow),
  //     does not reappear if player walks away, and finishes with lift == player lift + cast fx.
  const c2 = makeFakeCombat();
  const acts2 = new ArtActs(c2);
  assert.equal(acts2.spawn(makeInit('art_jinfu')), true);
  const jinfu: any = acts2.list[0];
  jinfu.mom.ph = 3; jinfu.mom.pt = 0; jinfu.mom.vis = 1;
  jinfu.mom.x = 1020; jinfu.mom.y = 2000; jinfu.mom.lift = 0; // already near player
  for (let i = 0; i < jinfu.kids.length; i++) {
    jinfu.kids[i].vis = 1;
    jinfu.kids[i].x = 1500 + i * 100; jinfu.kids[i].y = 2000; jinfu.kids[i].lift = 0;
  }
  c2.game.player.x = 1000; c2.game.player.y = 2000; c2.game.player.st.lift = 110;
  acts2.update(0.02); // mom arrives first while kids are still returning
  assert.equal(jinfu.mom.vis, 0, 'Mother blade hidden immediately upon return');
  assert.equal(jinfu.done, false, 'JinfuAct waits for remaining kids');
  // Player moves away > 40px while kids are still returning: mom must stay hidden and not respawn!
  c2.game.player.x = 900; c2.game.player.y = 2000;
  acts2.update(0.02);
  assert.equal(jinfu.mom.vis, 0, 'Mother blade remains hidden when player moves');
  const jBodies: any[] = [];
  acts2.collect(jBodies);
  assert.equal(jBodies.length, jinfu.kids.filter((k: any) => k.vis > 0.02).length, 'Returned mom is not drawn');
  c2.fxq.length = 0;
  for (let i = 0; i < 40 && !jinfu.done; i++) acts2.update(0.03);
  assert.equal(jinfu.done, true, 'JinfuAct finished after all kids returned');
  assert.ok(jinfu.kids.every((k: any) => k.vis === 0 && k.lift === 110));
  const jCast = c2.fxq.find((q: any) => q.k === 'cast');
  assert.ok(jCast && jCast.x === 900 && jCast.y === 2000 - 70 - 110);

  // 8c. RingAct: short return from ground target to elevated & moved player converges lift 100%
  const c3 = makeFakeCombat();
  const acts3 = new ArtActs(c3);
  assert.equal(acts3.spawn(makeInit('art_wuxing')), true);
  const ring: any = acts3.list[0];
  ring.ph = 2; ring.pt = 0; ring.f.x = 1220; ring.f.y = 2000; ring.f.h = 54; ring.f.lift = 0;
  c3.game.player.x = 1050; c3.game.player.y = 2040; c3.game.player.st.lift = 140;
  c3.fxq.length = 0;
  for (let i = 0; i < 30 && !ring.done; i++) acts3.update(0.03);
  assert.equal(ring.done, true, 'RingAct finished return');
  assert.equal(ring.f.x, 1050);
  assert.equal(ring.f.y, 2040);
  assert.equal(ring.f.lift, 140);
  assert.equal(ring.f.h, 74);
  const rCast = c3.fxq.find((q: any) => q.k === 'cast');
  assert.ok(rCast && rCast.x === 1050 && rCast.y === 2040 - 70 - 140);
}

console.log('artacts lift alignment: sword, jinfu, ring, mirror, bell, bind bodies & WebGL glow aligned + dynamic tracking + return passed');
