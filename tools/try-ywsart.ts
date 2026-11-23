// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=ywsart —— r16 夜无赦的画面线自测（不带伤害、不带特效，只看立板和程序动画）。
// 一个木偶首领站在你前面，逐个播 world/yewushe-anim.ts 里的招式姿态序列：看卡帧、挤压拉伸、翻转、旋转、残影、辉光、地影。
//   &form=human|half|demon   形态（默认 human；all = 三个形态并排站，各播各的）
//   &move=<招的 id>|all       只播这一招（默认 all：轮着播）
//   &seek=<毫秒>              定格在这一招的这一刻（截图用；残影按姿态表往回推，不靠实时轨迹）
//   &face=1|-1               朝向（默认朝你：-1）
// 页面上留 window.__yws：seek(move, ms, form?)、play(move?)、puppet，供截图脚本换姿势。
import type { Game } from '../src/world/game';
import { openField, clearStage } from './try-hanshan';
import { YWS_MOVE_IDS, YWS_FORM_H, poseAt, idlePose, ywsMoveLen, ghostTrail, type YwsForm } from '../src/world/yewushe-anim';
import type { BossSource, BossView, BossSprite } from '../src/hd2d/bossthings';

type W = Window & { __yws?: Record<string, unknown>; __ywsReady?: boolean };

interface Actor { form: YwsForm; x: number; y: number; face: number; id: number; spr: BossSprite }

class Puppet implements BossSource {
  hdReady = false;
  actors: Actor[] = [];
  /** 当前播的招（null = 待机）、开始的时刻；seekMs 不为空时定格 */
  move: string | null = null; t0 = 0; seekMs: number | null = null;
  list: string[] = []; idx = 0; label = '';
  /** 镜头的右方向（世界坐标；试玩页开场时从 renderer.hd 取一次） */
  right = { x: 1, y: 0 };
  private V: BossView = { sprites: [] };
  now() { return performance.now(); }
  view(): BossView {
    const V = this.V; V.sprites.length = 0;
    const now = this.now();
    // 轮播：一招播完停 0.6 秒再下一招
    if (this.seekMs === null && this.list.length) {
      const id = this.list[this.idx % this.list.length], len = Math.max(...this.actors.map((a) => ywsMoveLen(id, a.form)));
      if (this.move !== id) { this.move = id; this.t0 = now; }
      if (now - this.t0 > len + 600) { this.idx++; this.move = this.list[this.idx % this.list.length]; this.t0 = now; }
    }
    for (const a of this.actors) {
      const t = this.seekMs ?? now - this.t0;
      const P = this.move && t <= ywsMoveLen(this.move, a.form) ? poseAt(this.move, a.form, t) : idlePose(a.form, now);
      const s = a.spr;
      // 朝前 = 画面上朝左 / 朝右（face）：沿镜头的右方向走 dx；dy 是画面纵深方向（右方向转 90 度）
      const R = this.right, fx = R.x * a.face, fy = R.y * a.face;
      s.key = P.frame; s.x = a.x + P.dx * fx - P.dy * R.y; s.y = a.y + P.dx * fy + P.dy * R.x; s.z = P.lift; s.H = P.H; s.ax = P.ax;
      s.face = a.face; s.sx = P.sx; s.sy = P.sy; s.rot = P.rot; s.flash = P.flash; s.glow = P.glow; s.glowCol = P.glowCol; s.tint = P.tint; s.add = P.add; s.alpha = P.alpha;
      // 残影：定格时按姿态表往回推（截图看得到）；实时播放时交给 bossthings 按轨迹自动排
      if (this.seekMs !== null && this.move && P.ghost > 0) {
        s.ghost = 0;
        s.ghosts = ghostTrail(this.move, a.form, t).map((q) => ({ x: a.x + q.dx * fx - q.dy * R.y, y: a.y + q.dx * fy + q.dy * R.x, z: q.lift, alpha: q.alpha * P.ghost, key: q.frame, sx: q.sx, sy: q.sy, rot: q.rot, H: q.H, ax: q.ax }));
      } else { s.ghost = P.ghost; s.ghosts = undefined; }
      V.sprites.push(s);
    }
    this.label = this.move ? `${this.move}  ${Math.round(this.seekMs ?? now - this.t0)} ms` : '待机';
    return V;
  }
}

export function tryYwsArt(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const c = g.combat;
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    const f = openField(g, g.player) ?? { x: g.player.x, y: g.player.y };
    g.teleport(f.x, f.y);
    c.enemies.length = 0;
    clearStage(g);
    const p = g.player, P = new Puppet();
    P.right = (g as unknown as { renderer?: { hd?: { rightDir: { x: number; y: number } } } }).renderer?.hd?.rightDir ?? { x: 1, y: 0 };
    const formP = params.get('form') ?? 'human';
    const forms: YwsForm[] = formP === 'all' ? ['human', 'half', 'demon'] : [formP as YwsForm];
    const face = Number(params.get('face') ?? -1);
    forms.forEach((form, i) => {
      // 三个形态并排：人身、半魔挨着你，魔躯最远（它最大）
      // 站在你画面右边（沿镜头的右方向），三个形态并排时魔躯最远、往纵深退一点
      const ox = forms.length > 1 ? [-120, 220, 640][i] : 0, oz = forms.length > 1 ? [40, -40, -160][i] : 0, R = P.right;
      P.actors.push({ form, x: p.x + R.x * (300 + ox) + R.y * oz, y: p.y + R.y * (300 + ox) - R.x * oz, face, id: 7700 + i,
        spr: { id: 7700 + i, key: '', x: 0, y: 0, z: 0, H: YWS_FORM_H[form], face, sx: 1, sy: 1, rot: 0, alpha: 1, flash: 0, glow: 0 } });
    });
    const mv = params.get('move') ?? 'all';
    P.list = mv === 'all' ? [...YWS_MOVE_IDS] : [mv];
    if (params.get('seek') !== null) { P.move = P.list[0]; P.seekMs = Number(params.get('seek')); }
    (g as unknown as { bossPuppet?: Puppet }).bossPuppet = P;
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    // 左上角写当前播的招和时刻（截图对照用）
    const tag = document.createElement('div');
    tag.style.cssText = 'position:fixed;left:12px;top:12px;z-index:99999;color:#ffd;background:rgba(0,0,0,.6);font:16px/1.4 monospace;padding:4px 8px;pointer-events:none';
    document.body.appendChild(tag);
    window.setInterval(() => { tag.textContent = `ywsart · ${forms.join('/')} · ${P.label}`; }, 100);
    (window as W).__yws = {
      puppet: P,
      seek(move: string, ms: number, form?: YwsForm) { P.list = []; P.move = move; P.seekMs = ms; if (form) for (const a of P.actors) { a.form = form; a.spr.H = YWS_FORM_H[form]; } return P.label; },
      play(move?: string) { P.seekMs = null; P.list = move ? [move] : [...YWS_MOVE_IDS]; P.idx = 0; P.move = null; },
      face(f: number) { for (const a of P.actors) a.face = f; },
    };
    g.updateUI(true);
    window.setTimeout(() => { (window as W).__ywsReady = true; }, 800);
  }, 6500);
}
