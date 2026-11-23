import { makeCanvas } from '../core/canvas';
import { prof } from '../core/prof';
import { advanceCharacterPose, drawCharacter, type CharState, type Look } from './character';
import { headTexReady } from './headTex';
import { resBucket } from './sprites';
import { resTier } from './resTier';
import { BitmapFrame } from './bitmap-frame';

type Entry = {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; res: number; scale: number;
  look: string; headReady: boolean; action: CharState['action']; castN: number; yaw: number; armed: boolean;
  bucket: number; pending: number; paintedAt: number; revision: number;
};

export type CharacterFrame = {
  image: HTMLCanvasElement; revision: number; l: number; r: number; t: number; b: number;
  mode: 'refreshed' | 'reused' | 'deferred';
};
export type DrawableCharacterFrame = Omit<CharacterFrame, 'image'> & { image: HTMLCanvasElement | BitmapFrame };

/** 拥挤远景的单角色位图，姿态每帧推进，图像按预算且最多 10 Hz 刷新。 */
export class CharacterFrameCache {
  private readonly entries = new WeakMap<CharState, Entry>();
  private readonly deferredPhysics = new WeakMap<CharState, number>();

  deferPhysics(st: CharState, dt: number): void {
    this.deferredPhysics.set(st, (this.deferredPhysics.get(st) ?? 0) + dt);
  }

  private takePhysics(st: CharState): number {
    const dt = this.deferredPhysics.get(st) ?? 0;
    this.deferredPhysics.delete(st);
    return dt;
  }

  release(st: CharState): number {
    const entry = this.entries.get(st);
    if (!entry) return 0;
    this.entries.delete(st);
    return entry.pending;
  }

  draw(ctx: CanvasRenderingContext2D, look: Look, st: CharState, scale: number, dt: number, enabled: boolean, allowRefresh = true, timeMs?: number): 'direct' | 'refreshed' | 'reused' | 'deferred' {
    const timing = prof.on;
    let start = timing ? performance.now() : 0;
    let entry = this.entries.get(st);
    if (!enabled) {
      const pending = this.takePhysics(st);
      if (entry) {
        this.entries.delete(st);
        drawCharacter(ctx, look, st, scale, dt, { physicsDt: dt + entry.pending + pending });
      } else if (pending) drawCharacter(ctx, look, st, scale, dt, { physicsDt: dt + pending });
      else drawCharacter(ctx, look, st, scale, dt);
      if (timing) prof.add('R·人物直接绘制', start);
      return 'direct';
    }

    const transform = ctx.getTransform();
    const frame = this.prepare(look, st, scale, dt, Math.hypot(transform.a, transform.b), allowRefresh, timeMs);
    this.drawFrame(ctx, frame, st.x, st.y);
    return frame.mode;
  }

  /** 清晰度上限（texel / 世界单位），由渲染器每帧按画面里的人数定，见 CharacterWorkerFrames.maxRes */
  maxRes = 1;
  /** 这一帧取了多少个人物 */
  uses = 0;
  prepare(look: Look, st: CharState, scale: number, dt: number, pixelScale: number, allowRefresh = true, timeMs?: number, physicsExtra = 0, rate = 10,
    extra?: { under?: (g: CanvasRenderingContext2D) => void; over?: (g: CanvasRenderingContext2D) => void }): CharacterFrame {
    const timing = prof.on;
    let start = timing ? performance.now() : 0;
    let entry = this.entries.get(st);
    const pose = advanceCharacterPose(look, st, dt);
    if (timing) { prof.add('R·缓存姿态', start); start = performance.now(); }
    const now = timeMs ?? performance.now();
    this.uses++;
    const res = resBucket(resTier.k * pixelScale, this.maxRes);
    const appearance = JSON.stringify(look);
    const headReady = !!look.headTex && headTexReady(look.headTex);
    const yaw = Math.round(st.yaw / (Math.PI / 8));
    const clock = st.action === 'idle' || st.action === 'walk' || st.action === 'run' || st.action === 'fly' ? st.t : st.actionT;
    const bucket = Math.floor(clock * rate);
    let refreshed = false;
    if (!entry) {
      const canvas = makeCanvas(1, 1);
      entry = { canvas, ctx: canvas.getContext('2d')!, res: 0, scale: 0, look: '', headReady: false,
        action: st.action, castN: st.castN, yaw, bucket, pending: 0, paintedAt: now, revision: 0, armed: st.armed };
      this.entries.set(st, entry);
    }
    entry.pending += dt + physicsExtra + this.takePhysics(st);
    const left = -170 * scale, top = -330 * scale, width = 340 * scale, height = 400 * scale;
    const dirty = entry.res !== res || entry.scale !== scale || entry.look !== appearance || entry.headReady !== headReady
      || entry.action !== st.action || entry.castN !== st.castN || entry.yaw !== yaw || entry.bucket !== bucket || entry.armed !== st.armed;
    if (timing) { prof.add('R·缓存键与准备', start); start = performance.now(); }
    if (dirty && (entry.res === 0 || (allowRefresh && now - entry.paintedAt >= 1000 / rate - 1))) {
      const w = Math.ceil(width * res) + 2, h = Math.ceil(height * res) + 2;
      if (entry.canvas.width !== w || entry.canvas.height !== h) { entry.canvas.width = w; entry.canvas.height = h; }
      else { entry.ctx.setTransform(1, 0, 0, 1, 0, 0); entry.ctx.clearRect(0, 0, w, h); }
      entry.ctx.setTransform(res, 0, 0, res, 1 - (st.x + left) * res, 1 - (st.y - st.lift + top) * res);
      // 随身小景（钓竿、摊位、手头活计）与身体画进同一张缓存，层次与原画法一致
      if (extra?.under) { entry.ctx.save(); extra.under(entry.ctx); entry.ctx.restore(); }
      drawCharacter(entry.ctx, look, st, scale, dt, { pose, physicsDt: entry.pending });
      if (extra?.over) { entry.ctx.save(); extra.over(entry.ctx); entry.ctx.restore(); }
      entry.res = res; entry.scale = scale; entry.look = appearance; entry.headReady = headReady;
      entry.action = st.action; entry.castN = st.castN; entry.yaw = yaw; entry.bucket = bucket; entry.armed = st.armed; entry.pending = 0; entry.paintedAt = now; entry.revision++;
      refreshed = true;
      if (timing) prof.add('R·缓存位图重绘', start);
    }
    const ratio = scale / entry.scale, pad = ratio / entry.res;
    const l = left - pad, t = top - st.lift - pad;
    return { image: entry.canvas, revision: entry.revision, l, r: l + entry.canvas.width * pad,
      t, b: t + entry.canvas.height * pad, mode: refreshed ? 'refreshed' : dirty ? 'deferred' : 'reused' };
  }

  drawFrame(ctx: CanvasRenderingContext2D, frame: DrawableCharacterFrame, x: number, y: number): void {
    const start = prof.on ? performance.now() : 0;
    ctx.drawImage(frame.image instanceof BitmapFrame ? frame.image.image : frame.image,
      x + frame.l, y + frame.t, frame.r - frame.l, frame.b - frame.t);
    if (prof.on) prof.add('R·缓存位图贴图', start);
  }
}
