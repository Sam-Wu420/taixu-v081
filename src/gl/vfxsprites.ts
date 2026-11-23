// 特效关键贴图与粒子共用 Batch 和世界深度；静态原图只上传一次。
import { makeCanvas } from '../core/canvas';
import { prof } from '../core/prof';
import { vfxImg, projSet, burstKey, shieldKey, PROJ_SIZE } from '../gfx/vfxTex';
import type { Combat } from '../world/combat';
import type { Batch } from './batch';

interface SpriteStage {
  readonly batch: Batch;
  readonly atlas: WebGLTexture;
  uploadStatic(canvas: HTMLCanvasElement): WebGLTexture;
}

type ImageLookup = (key: string) => HTMLImageElement | null;

export class VfxSprites {
  private readonly canvases = new Map<string, HTMLCanvasElement>();
  constructor(private readonly stage: SpriteStage, private readonly image: ImageLookup = vfxImg) {}

  private texture(key: string): WebGLTexture | null {
    let canvas = this.canvases.get(key);
    if (!canvas) {
      const image = this.image(key); if (!image) return null;
      canvas = makeCanvas(image.naturalWidth, image.naturalHeight);
      canvas.getContext('2d')!.drawImage(image, 0, 0);
      this.canvases.set(key, canvas);
    }
    return this.stage.uploadStatic(canvas);
  }

  private quad(key: string, x: number, y: number, w: number, h: number, angle: number, alpha: number, squash = 1, flip = false): void {
    const texture = this.texture(key); if (!texture) return;
    const B = this.stage.batch; B.tex(texture); B.pt(x, y);
    B.quadS(-1, B.ox, B.oy, w * B.os, h * B.os, angle, 1, 1, 1, alpha, 0, flip ? [1, 0, 0, 1] : [0, 0, 1, 1], squash, B.od);
  }

  private ground(key: string, x: number, y: number, r: number, angle: number, alpha: number, squash = 0.55): void {
    const texture = this.texture(key); if (!texture) return;
    const B = this.stage.batch; B.tex(texture);
    B.groundQuad(-1, x, y, r, angle, 1, 1, 1, alpha, 0, squash, [0, 0, 1, 1]);
  }

  private burst(key: string, x: number, y: number, r: number, u: number, rot = 0, squash = 1, alpha = 1): void {
    const e = 1 - Math.pow(1 - Math.min(1, u * 1.6), 3);
    const size = r * 2 * (0.45 + 0.65 * e), a = alpha * (u < 0.15 ? u / 0.15 : Math.pow(1 - (u - 0.15) / 0.85, 1.3));
    if (a > 0.01) this.quad(key, x, y, size, size, rot + u * 0.25, a, squash);
  }

  private column(key: string, x: number, y: number, h: number, alpha: number, flip = false): void {
    this.quad(key, x, y - h / 2, h, h, 0, alpha, 1, flip);
  }

  draw(c: Combat, t: number): void {
    const B = this.stage.batch, previous = B.billboard, p = c.game.player;
    let fxMark = prof.t(), fxVertex = B.n;
    for (const f of c.fields) {
      if (f.fx !== 'array') continue;
      const k = Math.min(1, Math.max(0, f.t / 0.3)) * Math.min(1, Math.max(0, (f.dur - f.t) / 0.4));
      this.ground('array_activate_ring', f.x, f.y, f.r * 1.08, t * 0.25, 0.8 * k);
      if (f.t < 0.6) { B.billboard = { x: f.x, y: f.y }; this.burst('array_activate_burst', f.x, f.y - f.r * 0.17, f.r * 0.7, f.t / 0.6, 0, 1, 0.8); }
    }
    prof.add('FX图·领域', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
    for (const v of c.vfx) {
      if (v.t < 0) continue;
      const u = Math.min(1, Math.max(0, v.t / v.dur)), color = v.color;
      B.billboard = v.anchor ?? { x: v.x, y: v.y };
      switch (v.kind) {
        case 'flash': if (v.fx) this.burst(burstKey(v.fx, color, v.school), v.x, v.y, Math.max(46, v.r * 1.5), u, (v.seed ?? v.x) % 6.28); break;
        case 'ring': if (v.fx && v.fx !== 'roar') this.burst(v.fx === 'poison' ? 'poison_cloud_ring' : v.fx === 'vine' ? 'wood_vines_ring' : burstKey(v.fx, color, v.school), v.x, v.y - v.r * 0.12, v.r * 0.95, u, (v.x * 0.37) % 6.28, 0.62); break;
        case 'strike':
          if (v.fx === 'lightning' || v.fx === 'goldthunder') { this.column(v.fx === 'lightning' ? 'thunder_blue_head' : 'thunder_gold_head', v.x, v.y + 10, 460, Math.min(1, (1 - u) * 1.6), (v.seed ?? 0) % 2 > 1); this.burst(v.fx === 'lightning' ? 'thunder_blue_burst' : 'thunder_gold_burst', v.x, v.y - 20, v.r * 0.9, u, 0, 0.7); }
          else if (v.fx === 'frost') this.burst('ice_freeze_head', v.x, v.y - v.r * 0.3, v.r * 0.8, u * 0.7);
          else if (v.fx === 'rock') this.burst('earth_spike_head', v.x, v.y - v.r * 0.35, v.r * 0.85, u * 0.7);
          else if (v.fx === 'flame') this.burst('fireball_burst', v.x, v.y - 20, v.r * 0.9, u, 0, 0.75);
          break;
        case 'blinkfx': this.burst('teleport_flash_burst', v.x, v.y - 50, v.r * 1.5, u, 0, 1, 0.9); break;
        case 'aura':
          if (v.fx === 'breakthrough') {
            const a = u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.4);
            this.ground('breakthrough_ring', v.x, v.y, v.r * (0.7 + 0.5 * Math.min(1, u * 3)), u * 2, a * 0.9, 0.45);
            this.column('breakthrough_burst', v.x, v.y + 30, 460 * (0.8 + 0.25 * Math.min(1, u * 4)), a * 0.95);
          } else if (v.fx === 'leaf') {
            this.burst('heal_green_burst', v.x, v.y - 60, v.r * 1.1, u, 0, 1, 0.85);
            this.burst('heal_green_ring', v.x, v.y, v.r * 1.1, u, 0, 0.45, 0.8);
          } else this.burst('shield_gold_burst', v.x, v.y - 8, v.r * 1.15, u, 0, 0.5, 0.8);
          break;
      }
    }
    prof.add('FX图·法术', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
    for (const pr of c.projs) {
      const set = projSet(pr.fx, pr.color); if (!set || !this.texture(set + '_head')) continue;
      B.billboard = null;
      const angle = B.direction(pr.vx, pr.vy), s = pr.size, tr = pr.trail;
      const size = (PROJ_SIZE[set] ?? 70) * Math.min(2.2, Math.max(0.7, s)) * (pr.fac === 'p' ? 1 : 0.9);
      const worldLength = tr.length > 1 ? Math.hypot(tr[0][0] - pr.x, tr[0][1] - pr.y) : 0;
      let length = Math.min(260 * s, worldLength), trailAngle = angle;
      const alpha = (pr.fx === 'mind' ? 0.6 : 0.96) * Math.min(1, pr.life / 0.06);
      const anchor = { x: pr.x, y: pr.y + pr.visual.groundOffsetY, offsetY: -pr.visual.elevation };
      B.billboard = anchor;
      if (B.hd && length > 0) {
        B.pt(pr.x, pr.y); const hx = B.ox, hy = B.oy;
        const k = length / worldLength, tx = pr.x + (tr[0][0] - pr.x) * k, ty = pr.y + (tr[0][1] - pr.y) * k;
        anchor.x = tx; anchor.y = ty + pr.visual.groundOffsetY; B.pt(tx, ty);
        const dx = hx - B.ox, dy = hy - B.oy;
        length = Math.hypot(dx, dy) / B.os; trailAngle = Math.atan2(dy, dx);
        anchor.x = pr.x; anchor.y = pr.y + pr.visual.groundOffsetY;
      }
      const ux = Math.cos(angle), uy = Math.sin(angle);
      if (length > 0) {
        const w = length + size * 0.35, h = size * 0.9 * (1 + 0.06 * Math.sin((t + pr.x * 0.01) * 30)), center = -length / 2 + size * 0.075;
        const tx = B.hd ? Math.cos(trailAngle) : ux, ty = B.hd ? Math.sin(trailAngle) : uy;
        this.quad(set + '_trail', pr.x + tx * center, pr.y + ty * center, w, h, trailAngle, alpha * 0.85);
      }
      this.quad(set + '_head', pr.x - ux * size * 0.1, pr.y - uy * size * 0.1, size, size, angle, alpha);
    }
    prof.add('FX图·弹道', fxMark, B.n - fxVertex); fxMark = prof.t(); fxVertex = B.n;
    B.billboard = { x: p.x, y: p.y };
    if (c.shield && !c.shield.art) {
      const s = c.shield, k = s.amt / s.max, key = shieldKey(s.fx, s.color);
      this.quad(key, p.x, p.y - 56 - p.st.lift, 168, 168, key === 'shield_gold_ring' ? 0 : t * 0.3, 0.42 + 0.3 * k);
    }
    if (c.heal) this.ground('heal_green_ring', p.x, p.y, 74, t * 0.6, 0.55, 0.42);
    B.billboard = previous;
    B.tex(this.stage.atlas);
    prof.add('FX图·其他', fxMark, B.n - fxVertex);
  }
}
