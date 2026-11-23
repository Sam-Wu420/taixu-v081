import { CharState, drawCharacter, restoreCharacterPhysics, type CharacterPhysics } from './character';
import type { CharacterPaintRequest } from './character-worker-protocol';

export function paintCharacter(ctx: CanvasRenderingContext2D, request: CharacterPaintRequest): CharacterPhysics {
  const { state, physics, look, pose, scale, res, dt, physicsDt } = request;
  const st = Object.assign(new CharState(), state);
  restoreCharacterPhysics(st, physics);
  const left = -170 * scale, top = -330 * scale;
  const width = Math.ceil(340 * scale * res) + 2, height = Math.ceil(400 * scale * res) + 2;
  if (ctx.canvas.width !== width || ctx.canvas.height !== height) {
    ctx.canvas.width = width; ctx.canvas.height = height;
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
  }
  ctx.setTransform(res, 0, 0, res, 1 - (st.x + left) * res, 1 - (st.y - st.lift + top) * res);
  drawCharacter(ctx, look, st, scale, dt, { pose, physicsDt });
  return { strands: st.strands, springs: st.springs, hp: st.hp };
}

export function characterPhysicsBuffers(physics: CharacterPhysics): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const strand of physics.strands.values()) buffers.push(strand.x.buffer, strand.y.buffer, strand.ox.buffer, strand.oy.buffer);
  return buffers;
}
