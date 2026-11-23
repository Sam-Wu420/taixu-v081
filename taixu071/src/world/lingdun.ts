// v0.63：灵力护盾 —— 炼气即有的护体灵光。
//   · 层数随境界叠加：炼气一层（十层起两层）、筑基二、结丹三、元婴四、化神五；筑基以上到后期再添一层，最多六层。
//   · 颜色、外观随境界变：炼气淡青薄罩 → 筑基青碧、绕叶符 → 结丹金罩、绕符印、脚下生阵
//     → 元婴紫府罩、背现八卦、罩面走电 → 化神五色神光（金木水火土各一层）、足踏莲台。
//   · 受击先耗最外一层；一层耗尽便「叭」地碎开，余劲卸去四分之一再落到下一层 —— 连破几层就是「叭叭叭」。
//   · 遇敌自行升起（嗡——），脱战即补满；战中四息未受击后，每 2.6 息耗少许法力重凝一层。
//   · 画在 gl/lingdungl.ts，跟着 st.lift 抬升：御剑、飞遁时罩子随人走，不再留在地上。
import type { Combat } from './combat';
import { audio } from './audio';

export interface LdTier { name: string; layers: number; k: number; col: string }
/** 下标即大境界：0 凡人（无）· 1 炼气 · 2 筑基 · 3 结丹 · 4 元婴 · 5 化神。k = 每层可挡的气血比例 */
export const LD_TIERS: LdTier[] = [
  { name: '', layers: 0, k: 0, col: '255,255,255' },
  { name: '灵气罩', layers: 1, k: 0.14, col: '170,235,255' },
  { name: '青霄护罩', layers: 2, k: 0.13, col: '110,240,190' },
  { name: '金丹罡罩', layers: 3, k: 0.12, col: '255,205,95' },
  { name: '紫府灵罩', layers: 4, k: 0.11, col: '190,130,255' },
  { name: '五色神光罩', layers: 5, k: 0.1, col: '255,215,150' },
  { name: '太虚玄罩', layers: 5, k: 0.1, col: '255,190,95' },
  { name: '混元万象罩', layers: 5, k: 0.095, col: '115,245,215' },
  { name: '天威宝罩', layers: 6, k: 0.09, col: '200,150,255' },
  { name: '仙元清罩', layers: 6, k: 0.088, col: '135,218,255' },
  { name: '玄穹玉罩', layers: 6, k: 0.085, col: '115,245,242' },
  { name: '太乙金罩', layers: 6, k: 0.082, col: '255,216,96' },
  { name: '万劫不灭罩', layers: 6, k: 0.08, col: '255,242,175' },
];
/** 化神五色，由内而外：金 木 水 火 土（第六层为白） */
export const LD_FIVE = ['255,214,110', '120,235,150', '110,190,255', '255,120,90', '225,185,120', '255,255,255'];

export interface LdEv { k: 'up' | 'hit' | 'pop' | 'gone'; i: number; delay: number; ang: number }

/** 相邻两层碎裂的间隔（秒）：「叭、叭、叭」的节奏 */
const POP_GAP = 0.09;

export class Lingdun {
  /** 各层剩余灵力，内层在前、最外层在末尾 */
  hp: number[] = [];
  cap = 1;
  /** 显形度 0..1（脱战后淡去） */
  shown = 0;
  flash = 0; hitAng = 0;
  sinceHit = 99; fillT = 0;
  /** 给绘制层的事件（升起 / 受击 / 碎裂 / 尽碎） */
  evq: LdEv[] = [];
  private wasOn = false;
  constructor(public c: Combat) {}

  get tier(): LdTier { const r = this.c.game.hero.realm | 0; return LD_TIERS[r < 0 ? 0 : r >= LD_TIERS.length ? LD_TIERS.length - 1 : r]; }
  /** 当前境界应有的层数 */
  get want(): number {
    const h = this.c.game.hero as any, tr = this.tier;
    if (!tr.layers || h.dead) return 0;
    const st = h.stage ?? 0, late = h.realm === 1 ? st >= 9 : st >= 2;
    return Math.min(6, tr.layers + (late ? 1 : 0));
  }
  get layers() { return this.hp.length; }
  private ev(e: LdEv) { if (this.evq.length < 32) this.evq.push(e); }

  update(dt: number) {
    const c = this.c, h = c.game.hero;
    // 无效帧或受污染的战斗数据不能写坏整组护盾；不在这里偷偷修复数值。
    if (!Number.isFinite(dt) || dt < 0 || !Number.isSafeInteger(h.realm) || h.realm < 0 ||
        !Number.isSafeInteger(h.stage) || h.stage < 0 || !Number.isFinite(h.mp) || h.mp < 0 ||
        !Number.isFinite(c.pStats.hp) || c.pStats.hp <= 0 || !Number.isFinite(c.combatT) ||
        !Number.isFinite(this.shown) || !Number.isFinite(this.flash) ||
        !Number.isFinite(this.sinceHit) || !Number.isFinite(this.fillT) ||
        this.hp.some(v => !Number.isFinite(v) || v < 0)) return;
    const want = this.want, cap = Math.max(1, c.pStats.hp * this.tier.k);
    if (!Number.isFinite(cap) || !Number.isFinite(this.sinceHit + dt) ||
        !Number.isFinite(this.fillT + dt) || !Number.isFinite(cap * 0.12 * dt) ||
        !Number.isFinite(dt * 7)) return;
    this.sinceHit += dt; this.flash = Math.max(0, this.flash - dt * 4);
    this.cap = cap;
    if (this.hp.length > want) this.hp.length = want;
    const on = want > 0 && (c.combatT < 5 || c.inCombat);
    if (!on) while (this.hp.length < want) this.hp.push(this.cap);   // 脱战即满
    this.shown += ((on && this.hp.length ? 1 : 0) - this.shown) * Math.min(1, dt * (on ? 7 : 2.5));
    if (on && !this.wasOn && this.hp.length) { this.ev({ k: 'up', i: 0, delay: 0, ang: 0 }); sfxUp(this.hp.length); }
    this.wasOn = on;
    if (on && this.hp.length < want) {
      // 战中重凝：四息未受击后，每 2.6 息一层，耗 3% 法力
      if (this.sinceHit > 4) {
        this.fillT += dt;
        if (this.fillT >= 2.6 && h.mp > 0.04) { this.fillT = 0; h.mp -= 0.03; this.hp.push(this.cap * 0.6); this.ev({ k: 'up', i: this.hp.length - 1, delay: 0, ang: 0 }); sfxUp(1); }
      } else this.fillT = 0;
    }
    // 残层缓缓补满
    if (this.sinceHit > 3) for (let i = 0; i < this.hp.length; i++) if (this.hp[i] < this.cap) this.hp[i] = Math.min(this.cap, this.hp[i] + this.cap * 0.12 * dt);
    for (let i = 0; i < this.hp.length; i++) if (this.hp[i] > this.cap) this.hp[i] = this.cap;
  }

  /** 挡下一击，返回穿透过来的伤害（0 = 全挡住了） */
  absorb(d: number, fx: number, fy: number): number {
    if (!Number.isFinite(d) || d <= 0) return 0;
    if (!this.hp.length) return d;
    const c = this.c, p = c.game.player;
    // 已知伤害保留原值交还调用方，非法状态不消耗护盾、不生成事件。
    if (this.hp.some(v => !Number.isFinite(v) || v < 0) ||
        !Number.isFinite(this.shown) || !Number.isFinite(fx) || !Number.isFinite(fy) ||
        !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
        !Number.isFinite(fx - p.x) || !Number.isFinite(fy - p.y)) return d;
    this.sinceHit = 0; this.fillT = 0; this.flash = 1; this.shown = Math.max(this.shown, 0.6);
    this.hitAng = Math.atan2(fy - p.y, fx - p.x);
    let pops = 0;
    while (d > 0 && this.hp.length) {
      const top = this.hp.length - 1, take = Math.min(this.hp[top], d);
      this.hp[top] -= take; d -= take;
      if (this.hp[top] > 0.5) break;
      this.hp.pop();
      this.ev({ k: 'pop', i: top, delay: pops * POP_GAP, ang: this.hitAng });
      sfxPop(top, pops * POP_GAP, this.hp.length === 0);
      pops++;
      d *= 0.75;   // 每碎一层，余劲卸去四分之一
    }
    if (!pops) { this.ev({ k: 'hit', i: this.hp.length - 1, delay: 0, ang: this.hitAng }); sfxHit(); }
    else if (!this.hp.length) {
      this.ev({ k: 'gone', i: 0, delay: pops * POP_GAP, ang: this.hitAng });
      c.texts.push({ x: p.x, y: p.y - 136 - (p.st.lift || 0), s: '盾碎', color: '#9fe8ff', t: 0, vy: -46, big: true });
      c.game.trauma = Math.min(0.5, (c.game.trauma || 0) + 0.12);
    }
    return d < 1 ? 0 : d;
  }
}

// ------------------------------------------------------------------ 声音（全部合成，不占素材）
/** 叭！—— 清脆的一声爆裂：高频噪声爆点 + 急速下滑的音头 + 两三粒碎晶叮响。越靠外的层音越高，连破时听来就是「叭叭叭」 */
function sfxPop(i: number, delay: number, last: boolean) {
  const o = audio.synthOut(undefined, undefined, 0.95, 0.2); if (!o) return;
  const t = audio.now + delay, r = 1 + i * 0.1 + Math.random() * 0.04;
  audio.nz(t, 0.045, 1.0, o, 'highpass', 1700 * r, 0, 0.8, 0.001);          // 爆点
  audio.nz(t, 0.11, 0.5, o, 'bandpass', 2600 * r, 900, 1.6, 0.001);          // 碎裂的沙声
  audio.tone('square', 980 * r, t, 0.075, 0.3, o, 210, 0.001);               // 「叭」的音头
  audio.tone('sine', 520 * r, t, 0.12, 0.42, o, 150, 0.001);                 // 一点身体感
  for (let k = 0; k < 3; k++) audio.tone('sine', (2600 + Math.random() * 2600) * r, t + 0.02 + k * 0.03 + Math.random() * 0.02, 0.14, 0.11, o, 0, 0.001);   // 碎晶
  if (last) {   // 最后一层：整面罩子塌掉，多一声闷响和一串碎落
    audio.nz(t + 0.05, 0.5, 0.45, o, 'lowpass', 1400, 200, 0.7, 0.004);
    audio.tone('sine', 150, t + 0.04, 0.4, 0.5, o, 48, 0.003);
    for (let k = 0; k < 8; k++) audio.nz(t + 0.06 + Math.random() * 0.35, 0.03, 0.3 + Math.random() * 0.4, o, 'bandpass', 3000 + Math.random() * 4000, 0, 3, 0.001);
  }
}
/** 咚 —— 打在罩上没破：一声闷而短的回响 */
let lastHit = 0;
function sfxHit() {
  const now = audio.now; if (now - lastHit < 0.06) return; lastHit = now;
  const o = audio.synthOut(undefined, undefined, 0.6, 0.25); if (!o) return;
  audio.tone('triangle', 620, now, 0.1, 0.32, o, 400, 0.001);
  audio.tone('sine', 1240, now, 0.2, 0.1, o, 0, 0.002);
  audio.nz(now, 0.05, 0.25, o, 'bandpass', 2200, 0, 2, 0.001);
}
/** 嗡 —— 灵罩升起：每层一个上扬的音，叠成一小串 */
function sfxUp(n: number) {
  const o = audio.synthOut(undefined, undefined, 0.5, 0.35); if (!o) return;
  const t = audio.now;
  for (let k = 0; k < Math.min(6, n); k++) { const f = 294 * Math.pow(2, (k * 4) / 12); audio.tone('sine', f, t + k * 0.07, 0.45, 0.2, o, f * 1.5, 0.04); audio.tone('triangle', f * 3, t + k * 0.07, 0.2, 0.05, o, f * 4, 0.01); }
  audio.nz(t, 0.4, 0.1, o, 'bandpass', 1600, 4400, 2, 0.06);
}
