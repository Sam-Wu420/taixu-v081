// 「遁影惊雷」：逆天四法 · 搏命秘术 · 水遁 · 音爆 · 敌修秘术（AI）
//
// · 逆天四法（data/arts3.ts 的 NI_ARTS）：寸阴凝世诀（时停）/ 万劫不磨体（无敌）/ 逆命回光术（回满 + 冷却清零）/ 一线开天（倾尽法力的一击）。
//   都是短暂的、冷却极长的；不卖、不掉，只能靠机缘自悟（jiyuan / onKill），进度见法术书顶上的「逆天机缘」。
// · 搏命秘术（MI_ARTS）：沸血惊鸿遁 / 沧浪遁（江河）/ 覆海游（海）/ 裂脉诀 / 鼓元术 / 玄龟闭息 / 抽髓化元 / 破空一掠——炼气就能学，都有代价。
// · 音爆：全力催动遁光、沸血遁、破空一掠时破开音障；按实际遁速分五档，越快越沉、越长、越响（audio.sonicBoom）。敌修催动遁光同样有。
// · 敌修（人形敌人）每人随身带一两门秘术：追人 / 逃命时沸血遁、缠斗时裂脉诀、残血鼓元术……用过的秘术有机会从他身上搜出卷轴。
// 绘制在 gl/nitiangl.ts（读这里的状态）；挂接点：combat.ts（pStats / speedMul / cast / exec / hitPlayer / hitEnemy / kill / update / updateProjs）、game.ts（stats / 移动）。
import type { Combat, Enemy } from './combat';
import type { ArtSkill } from '../data/arts';
import { ARTS, PROF_DMG } from '../data/arts';
import { gongfaArtMul } from '../data/skills';
import { levelOf } from '../data/realms';
import { NI_ARTS, MI_ARTS } from '../data/arts3';
import { maxLife } from './cultivation';
import { audio } from './audio';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const NI = new Set(NI_ARTS), ALL = new Set([...NI_ARTS, ...MI_ARTS]);

interface Aim { x: number; y: number; dx: number; dy: number; target?: Enemy | null }
/** 一条临时增减益：from 之前不生效（用来排「术散之后」的代价） */
export interface NiMod { id: string; name: string; from: number; until: number; atk?: number; def?: number; speed?: number; hp?: number; regen?: number; bad?: boolean; col: string; end?: () => void; on?: boolean }
export interface NiBoom { x: number; y: number; ang: number; t: number; dur: number; tier: number; lift: number; seen?: boolean }
export interface NiEv { k: 'stasis' | 'unstasis' | 'inv' | 'invhit' | 'invend' | 'huiguang' | 'ktfire' | 'splash' | 'learn' | 'burst' | 'foe'; x: number; y: number; ang?: number; col?: string; r?: number; s?: string }
/** 敌修身上的秘术状态：ph 0 = 生效中，1 = 代价期 */
export interface FoeNi { kit: string[]; cd: number; k: string | null; ph: 0 | 1; t: number; dur: number; dunHi: boolean; boomCd: number; inv: number; elite: boolean; invUsed: boolean; used: Set<string>; txt: number }

/** 音爆档位：按实际遁速（世界像素 / 秒）。-1 = 还破不开音障 */
export function boomTier(speed: number): number { return speed < 520 ? -1 : speed < 800 ? 0 : speed < 1150 ? 1 : speed < 1650 ? 2 : speed < 2300 ? 3 : 4; }
export const BOOM_NAME = ['气爆', '音爆', '音爆·裂云', '音爆·惊雷', '音爆·碎空'];

/** 逆天机缘所需：水畔静坐（秒）/ 濒死反杀（次）/ 越阶斩敌（次）/ 雷雨静坐（秒） */
export const NI_NEED = { river: 75, brink: 3, cross: 3, storm: 45 };

/** 敌修秘术：mul = 生效期的数值倍率，am = 代价期的倍率 */
type FoeMul = { speed?: number; atk?: number; dfn?: number };
const FOE_MI: Record<string, { name: string; art: string; col: string; dur: number; aft: number; mul: FoeMul; am: FoeMul }> = {
  xue: { name: '沸血遁', art: 'feixue', col: '235,60,70', dur: 4, aft: 5, mul: { speed: 1.75 }, am: { speed: 0.8 } },
  lie: { name: '裂脉诀', art: 'liemai', col: '255,130,60', dur: 7, aft: 8, mul: { atk: 1.35 }, am: { atk: 0.8 } },
  gu: { name: '鼓元术', art: 'guyuan', col: '150,230,130', dur: 8, aft: 6, mul: { dfn: 1.25 }, am: { dfn: 0.85 } },
  gui: { name: '玄龟闭息', art: 'guixi', col: '205,185,125', dur: 6, aft: 0.2, mul: { dfn: 1.8, speed: 0.7 }, am: {} },
  shui: { name: '沧浪遁', art: 'canglang', col: '120,190,240', dur: 5, aft: 2, mul: { speed: 1.8 }, am: { speed: 0.9 } },
};

function stasisCss(on: boolean) {
  if (typeof document === 'undefined' || !document.body || !document.head || !document.getElementById) return;
  if (!document.getElementById('ni-css')) {
    const st = document.createElement('style'); st.id = 'ni-css';
    st.textContent = '.game-canvas{transition:filter .28s ease}body.ni-stasis .game-canvas{filter:grayscale(.78) contrast(1.14) brightness(.93)}';
    document.head.appendChild(st);
  }
  document.body.classList.toggle('ni-stasis', on);
}
const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
function modText(m: NiMod) {
  const o: string[] = [];
  if (m.atk) o.push('攻击' + pct(m.atk)); if (m.def) o.push('防御' + pct(m.def)); if (m.speed) o.push('身法' + pct(m.speed)); if (m.hp) o.push('气血上限' + pct(m.hp));
  return `${o.join('，')}（${Math.round(m.until - m.from)} 息）`;
}

export class Nitian {
  mods: NiMod[] = [];
  /** 寸阴凝世：剩余 / 总时长 / 施展处 */
  stasisT = 0; stasisMax = 0; stasisX = 0; stasisY = 0;
  /** 万劫不磨：剩余 / 总时长 */
  invT = 0; invMax = 0;
  /** 水遁：river 沧浪遁 / sea 覆海游；lx,ly = 最近一次脚踏实地之处；inW = 此刻身在水中 */
  wd: { kind: 'river' | 'sea'; t: number; max: number; lv: number; lx: number; ly: number; inW: boolean; name: string } | null = null;
  /** 一线开天：蓄势 → 出手 → 余晖 */
  kt: { t: number; charge: number; x: number; y: number; dx: number; dy: number; len: number; w: number; dmg: number; base: any; fired: boolean; tg: Enemy | null } | null = null;
  booms: NiBoom[] = [];
  /** 给绘制层的一次性事件 */
  evq: NiEv[] = [];
  fs = new WeakMap<Enemy, FoeNi>();
  private spot: { x: number; y: number } | null = null;
  private wasBoost = false; private boomIn = -1; private reboom = 0; private lastBoom = -9;
  private aiT = 0; private jiT = 0; private blockT = 0; private ghostT = 0; private boltT = 3;
  constructor(public c: Combat) {}

  reset() {
    this.mods = []; this.stasisT = 0; this.invT = 0; this.wd = null; this.kt = null; this.booms = []; this.evq = []; this.spot = null;
    this.wasBoost = false; this.boomIn = -1; stasisCss(false);
  }

  // ------------------------------------------------------------ 数值
  private mul(k: 'atk' | 'def' | 'speed' | 'hp'): number {
    let m = 1; const now = this.c.game.time;
    for (const x of this.mods) { const v = x[k]; if (v && now >= x.from && now < x.until) m *= 1 + v; }
    return m;
  }
  get atkK() { return this.mods.length ? this.mul('atk') : 1; }
  get defK() { return this.mods.length ? Math.max(0.2, this.mul('def')) : 1; }
  get speedK() { return this.mods.length ? Math.max(0.35, this.mul('speed')) : 1; }
  get hpK() { return this.mods.length ? this.mul('hp') : 1; }
  get stasis() { return this.stasisT > 0; }
  active(id: string) { const now = this.c.game.time; return this.mods.some((m) => m.id === id && now >= m.from && now < m.until); }
  private add(m: NiMod) { this.mods = this.mods.filter((x) => x.id !== m.id); this.mods.push(m); }
  private has(id: string) { return this.c.game.hero.arts.some((a) => a.id === id); }
  private prog(): { river: number; brink: number; cross: number; storm: number } {
    const h = this.c.game.hero as any;
    return h.nt ?? (h.nt = { river: 0, brink: 0, cross: 0, storm: 0 });
  }
  /** 法术书里的「逆天机缘」 */
  hints() {
    const nt = this.prog(), f = (v: number, n: number) => clamp(v / n, 0, 1);
    return [
      { id: 'cunyin', tip: '逝者如斯——寻一处江河，于水畔打坐观水，久之自悟。', k: f(nt.river, NI_NEED.river) },
      { id: 'wanjie', tip: `向死而生——气血不足两成时斩杀不弱于己的对手（${Math.min(nt.brink, NI_NEED.brink)}/${NI_NEED.brink}）。`, k: f(nt.brink, NI_NEED.brink) },
      { id: 'niming', tip: `以弱胜强——越阶斩杀修为高过自己的对手（${Math.min(nt.cross, NI_NEED.cross)}/${NI_NEED.cross}）。`, k: f(nt.cross, NI_NEED.cross) },
      { id: 'kaitian', tip: '天威难测——雷雨之中打坐，感天雷之势，久之自悟（登高更快）。', k: f(nt.storm, NI_NEED.storm) },
    ].map((x) => ({ ...x, name: ARTS[x.id]?.name ?? x.id, got: this.has(x.id) }));
  }

  // ------------------------------------------------------------ 水
  private isWater(kind: 'river' | 'sea', x: number, y: number, m = 0) {
    const T = this.c.game.terrain;
    return kind === 'sea' ? !T.isLand(x, y) : T.isLand(x, y) && T.riverEdge(x, y) < -m;
  }
  private findWater(kind: 'river' | 'sea', x: number, y: number, R: number): { x: number; y: number } | null {
    if (this.isWater(kind, x, y, 14)) return { x, y };
    for (let r = 40; r <= R; r += 40) for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, ux = Math.cos(a), uy = Math.sin(a) * 0.9;
      if (!this.isWater(kind, x + ux * r, y + uy * r, 14)) continue;
      const far = kind === 'sea' && this.isWater(kind, x + ux * (r + 70), y + uy * (r + 70)) ? 70 : 0;   // 入海时再往里送一截，免得贴着岸
      return { x: x + ux * (r + far), y: y + uy * (r + far) };
    }
    return null;
  }
  private rv = { x: NaN, y: NaN, ok: false };
  /** 是否身在江河之畔（三十丈内）。静坐时位置不变，结果缓存 */
  private byRiver(x: number, y: number) {
    const r = this.rv;
    if (!(Math.abs(x - r.x) < 30 && Math.abs(y - r.y) < 30)) { r.x = x; r.y = y; r.ok = !!this.findWater('river', x, y, 320); }
    return r.ok;
  }
  /** 移动倍率（game.ts 的 factor）：0 = 此处不归水遁管 */
  waterK(x: number, y: number): number {
    const w = this.wd; if (!w) return 0;
    const T = this.c.game.terrain;
    if (!T.isLand(x, y)) return w.kind === 'sea' ? 2.3 + w.lv * 0.15 : 0;
    if (T.riverEdge(x, y) < 0) return w.kind === 'river' ? 2.5 + w.lv * 0.15 : 1.9 + w.lv * 0.1;
    return 0;
  }
  /** 覆海游期间海面可行 */
  waterOk(x: number, y: number) { const w = this.wd; return !!w && w.kind === 'sea' && !this.c.game.terrain.isLand(x, y); }
  private endWater(why: 'time' | 'mp') {
    const c = this.c, g = c.game, p = g.player, h = g.hero, w = this.wd; if (!w) return;
    this.wd = null;
    const now = g.time;
    if (!g.isFlying && !g.terrain.isLand(p.x, p.y)) {
      this.evq.push({ k: 'splash', x: p.x, y: p.y, r: 1.4 });
      p.x = w.lx; p.y = w.ly; g.cam.x += (p.x - g.cam.x) * 0.6; g.cam.y += (p.y - g.cam.y) * 0.6;
      h.hp = Math.max(0.05, h.hp - 0.06);
      this.evq.push({ k: 'splash', x: p.x, y: p.y, r: 1 });
      g.toast(why === 'mp' ? '法力不济，覆海游难以为继——被浪头卷回了岸边，脏腑受了些震荡。' : '覆海游气尽——被浪头卷回了岸边，脏腑受了些震荡。', 'warn');
      this.splashSfx(0.7);
    } else g.toast(`${w.name}术散。`, 'info');
    this.add({ id: 'shui_a', name: '湿寒入体', from: now, until: now + 3, speed: -0.15, bad: true, col: '150,190,220' });
  }

  // ------------------------------------------------------------ 施展
  /** 出手前的额外限制（不扣法力、不记冷却）：返回 true = 不能施展 */
  deny(id: string): boolean {
    const g = this.c.game, p = g.player, h = g.hero;
    if (id === 'niming' && maxLife(h) - h.age < 4) { g.toast('寿元将尽，再逆天命只怕当场坐化。', 'warn'); return true; }
    if (id === 'kaitian' && this.kt) return true;
    if (id !== 'canglang' && id !== 'fuhai') return false;
    if (g.mijing?.active) { g.toast('秘境之中无水可借。', 'warn'); return true; }
    if (g.isFlying) { g.toast('先落下遁光，方能借水而遁。', 'warn'); return true; }
    let spot = id === 'canglang' ? this.findWater('river', p.x, p.y, 320) : this.findWater('sea', p.x, p.y, 460) ?? this.findWater('river', p.x, p.y, 320);
    if (!spot && this.wd && this.wd.inW) spot = { x: p.x, y: p.y };
    if (!spot) { g.toast(id === 'canglang' ? '附近没有江河，沧浪遁无水可借。' : '此处离海（与江河）太远，覆海游施展不开。', 'warn'); return true; }
    this.spot = spot; return false;
  }

  /** 接管出手：返回 true = 已处理（combat.exec 不再走通用分支） */
  cast(s: ArtSkill, lv: number, a: Aim, atk: number, realm: number): boolean {
    if (!ALL.has(s.id)) return false;
    const c = this.c, g = c.game, p = g.player, h = g.hero, now = g.time;
    const say = (t: string, col: string, big = true) => c.texts.push({ x: p.x, y: p.y - 170 - (p.st.lift || 0), s: t, color: col, t: 0, vy: -24, big });
    const gf = gongfaArtMul(h.gongfa, s.school);
    switch (s.id) {
      case 'cunyin': {
        const dur = (s.dur ?? 3.2) + lv * 0.5;
        this.stasisT = this.stasisMax = dur; this.stasisX = p.x; this.stasisY = p.y;
        this.evq.push({ k: 'stasis', x: p.x, y: p.y });
        this.add({ id: 'cunyin_a', name: '光阴反噬', from: now + dur, until: now + dur + (lv >= 1 ? 3 : 4.5), speed: lv >= 1 ? -0.2 : -0.3, bad: true, col: '150,170,210' });
        stasisCss(true); this.stasisSfx(true); g.juice(0.1, 0.25);
        g.toast('寸阴凝世——天地俱寂，唯你独行。', 'good'); say('寸阴凝世', '#cfe0ff');
        return true;
      }
      case 'wanjie': {
        const dur = (s.dur ?? 4) + lv * 0.5;
        this.invT = this.invMax = dur; c.pst = {};
        this.evq.push({ k: 'inv', x: p.x, y: p.y });
        this.add({ id: 'wanjie_a', name: '金身褪去', from: now + dur, until: now + dur + 8, def: lv >= 2 ? -0.2 : -0.3, bad: true, col: '200,190,150' });
        audio.gong(audio.now, 0.55, 150); audio.sfx('clang'); g.juice(0.06, 0.3);
        g.toast('万劫不磨——金身一现，诸邪不侵。', 'good'); say('万劫不磨', '#ffe9a8');
        return true;
      }
      case 'niming': {
        h.hp = 1; h.mp = 1; c.pst = {};
        const cds = (c as any).cds as Map<string, number>;
        for (const k of [...cds.keys()]) if (!NI.has(k)) cds.set(k, 0);
        this.mods = this.mods.filter((m) => !m.bad);
        const cost = lv >= 3 ? 1 : lv >= 2 ? 1.4 : lv >= 1 ? 1.7 : 2;
        h.lifeLost = (h.lifeLost || 0) + cost;
        this.evq.push({ k: 'huiguang', x: p.x, y: p.y });
        const o = audio.synthOut(undefined, undefined, 0.5, 0.6);
        if (o) [523, 659, 784, 1046, 1318].forEach((f, i) => audio.tone('sine', f, audio.now + i * 0.09, 1.1, 0.16, o, f * 1.005, 0.02));
        audio.bell(undefined, undefined, 0.45, 1); audio.sfx('gain'); g.juice(0.05, 0.2);
        g.toast(`逆命回光——气血法力尽复，诸法冷却清零。折损寿元 ${cost} 载。`, 'good'); say('逆命回光', '#b8ffd0');
        return true;
      }
      case 'kaitian': {
        const pool = h.mp; h.mp = 0;
        const dmg = atk * s.power * PROF_DMG[lv] * gf * (0.75 + pool * 0.75);
        this.kt = { t: 0, charge: 0.85, x: p.x, y: p.y, dx: a.dx, dy: a.dy, len: (ARTS[s.id]?.range || 1500) * (1 + lv * 0.08), w: (s.radius ?? 90) * (1 + lv * 0.1), dmg, base: { realm, stCh: 1, status: { k: 'stun', dur: 1.2, ch: 1 }, school: s.school, skill: s.id }, fired: false, tg: a.target ?? null };
        const o = audio.synthOut(undefined, undefined, 0.5, 0.4);
        if (o) { audio.tone('sawtooth', 70, audio.now, 0.9, 0.12, o, 620, 0.3); audio.nz(audio.now, 0.9, 0.3, o, 'bandpass', 300, 5200, 1.4, 0.5); }
        say('一线开天', '#fff4d0');
        return true;
      }
      case 'feixue': {
        const dur = (s.dur ?? 5) * (1 + lv * 0.12);
        this.add({ id: 'feixue', name: s.name, from: now, until: now + dur, speed: 1.1 * (1 + lv * 0.12), col: s.color });
        this.add({ id: 'feixue_a', name: '血亏气虚', from: now + dur, until: now + dur + 5, speed: lv >= 1 ? -0.15 : -0.25, bad: true, col: '150,90,100' });
        this.evq.push({ k: 'burst', x: p.x, y: p.y, col: s.color, s: 'blood' });
        const sv = Math.hypot(p.st.vx, p.st.vy);
        this.boom(p.x, p.y, 0, sv > 20 ? Math.atan2(p.st.vy, p.st.vx) : Math.atan2(a.dy, a.dx), true, 1, Math.max(0, boomTier(g.speed * c.speedMul)));
        g.toast('沸血惊鸿遁！精血燃起，遁速暴增。', 'info'); say('沸血惊鸿遁', '#ff8a80', false);
        return true;
      }
      case 'liemai': {
        const dur = (s.dur ?? 8) * (1 + lv * 0.1);
        this.add({ id: 'liemai', name: s.name, from: now, until: now + dur, atk: 0.5 * (1 + lv * 0.15), col: s.color });
        this.add({ id: 'liemai_a', name: '经脉受损', from: now + dur, until: now + dur + 10, atk: lv >= 1 ? -0.15 : -0.25, bad: true, col: '150,110,90' });
        this.evq.push({ k: 'burst', x: p.x, y: p.y, col: s.color, s: 'fire' });
        g.juice(0.03, 0.2); g.toast('裂脉诀！经脉欲裂，法力奔涌。', 'info'); say('裂脉诀', '#ffb070', false);
        return true;
      }
      case 'guyuan': {
        const dur = (s.dur ?? 10) * (1 + lv * 0.1), lose = lv >= 1 ? 0.07 : 0.12;
        this.add({
          id: 'guyuan', name: s.name, from: now, until: now + dur, hp: 0.4 * (1 + lv * 0.12), col: s.color,
          end: () => { h.hp = Math.max(0.05, h.hp - lose); g.toast(`鼓元术散去，本元亏空——损耗 ${Math.round(lose * 100)}% 气血。`, 'warn'); },
        });
        this.add({ id: 'guyuan_a', name: '本元亏空', from: now + dur, until: now + dur + 8, def: -0.2, bad: true, col: '120,150,110' });
        this.evq.push({ k: 'burst', x: p.x, y: p.y, col: s.color, s: 'leaf' });
        g.toast('鼓元术！本元鼓荡，气血暴涨。', 'info'); say('鼓元术', '#b8f0a0', false);
        return true;
      }
      case 'guixi': {
        const dur = (s.dur ?? 8) * (1 + lv * 0.1);
        this.add({ id: 'guixi', name: s.name, from: now, until: now + dur, def: 0.9 * (1 + lv * 0.12), speed: lv >= 2 ? -0.25 : -0.35, regen: 0.012, col: s.color });
        this.evq.push({ k: 'burst', x: p.x, y: p.y, col: s.color, s: 'rock' });
        g.toast('玄龟闭息！龟甲覆体，气息闭锁。', 'info'); say('玄龟闭息', '#e8d8a0', false);
        return true;
      }
      case 'chousui': {
        const got = 0.35 + lv * 0.05;
        h.mp = Math.min(1, h.mp + got);
        this.add({ id: 'chousui_a', name: '髓亏体虚', from: now, until: now + 12, def: lv >= 2 ? -0.08 : -0.15, bad: true, col: '130,120,160' });
        this.evq.push({ k: 'burst', x: p.x, y: p.y, col: s.color, s: 'marrow' });
        g.toast(`抽髓化元！法力回复 ${Math.round(got * 100)}%。`, 'info'); say('抽髓化元', '#a8c8ff', false);
        return true;
      }
      case 'pokong': {
        const k = g.input.keys; let mx = 0, my = 0;
        if (k.has('w') || k.has('arrowup')) my -= 1; if (k.has('s') || k.has('arrowdown')) my += 1;
        if (k.has('a') || k.has('arrowleft')) mx -= 1; if (k.has('d') || k.has('arrowright')) mx += 1;
        mx += g.input.joy.x; my += g.input.joy.y;
        const len = Math.hypot(mx, my), dx = len > 0.1 ? mx / len : a.dx, dy = len > 0.1 ? my / len : a.dy;
        const dist = (ARTS[s.id]?.range || 520) * (1 + lv * 0.1), dur = 0.24;
        const dmg = atk * s.power * PROF_DMG[lv] * gf;
        c.dash = { t: 0, dur, vx: dx * dist / dur, vy: dy * dist / dur, dmg, hit: new Set(), invuln: true, color: s.color, sparkAcc: 0 };
        const R = 230 + (lv >= 2 ? 70 : 0);
        for (const e of c.enemies) {
          if (e.dead) continue;
          const ex = e.x - p.x, ey = e.y - p.y, d = Math.hypot(ex, ey) || 1;
          if (d > R) continue;
          c.hitEnemy(e, dmg * 0.5, { realm, stCh: 1, status: { k: 'stun', dur: 0.5 + lv * 0.15, ch: 1 }, school: s.school, skill: s.id }, p.x, p.y);
          e.kx += ex / d * 700; e.ky += ey / d * 440;
        }
        this.boom(p.x, p.y, 0, Math.atan2(dy, dx), true, 1, clamp(h.realm, 1, 4));
        c.addGhosts(p.x, p.y, p.x + dx * dist, p.y + dy * dist, 8, '225,240,255', 0.45);
        return true;
      }
      case 'canglang': case 'fuhai': {
        const kind = s.id === 'fuhai' ? 'sea' as const : 'river' as const;
        const dur = (s.dur ?? 9) * (1 + lv * 0.15);
        const sp = this.spot ?? { x: p.x, y: p.y }; this.spot = null;
        this.wd = { kind, t: dur, max: dur, lv, lx: p.x, ly: p.y, inW: false, name: s.name };
        if (Math.hypot(sp.x - p.x, sp.y - p.y) > 6) { c.addGhosts(p.x, p.y, sp.x, sp.y, 5, s.color, 0.4); p.x = sp.x; p.y = sp.y; g.cam.x += (p.x - g.cam.x) * 0.4; g.cam.y += (p.y - g.cam.y) * 0.4; }
        c.buffs.until.stealth = Math.max(c.buffs.until.stealth ?? 0, now + 2 + (lv >= 2 ? 1.5 : 0));
        for (const e of c.enemies) if (!e.pursuer) e.aggro = false;
        g.toast(kind === 'sea' ? '覆海游！纵身入水，如鲸潜行。' : '沧浪遁！纵身入水，顺流而遁。', 'info'); say(s.name, '#a8dcff', false);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ 万劫不磨
  /** hitPlayer 里调用：金身在则这一击化解 */
  block(fx: number, fy: number): boolean {
    if (this.invT <= 0) return false;
    const c = this.c, p = c.game.player;
    if (this.blockT <= 0) {
      this.blockT = 0.22;
      c.texts.push({ x: p.x + rand(-20, 20), y: p.y - 120 - (p.st.lift || 0), s: '不磨', color: '#ffe9a8', t: 0, vy: -40 });
      this.evq.push({ k: 'invhit', x: p.x, y: p.y, ang: Math.atan2(fy - (p.y - 46), fx - p.x) });
      audio.sfx('clang');
    }
    return true;
  }
  /** hitEnemy 里调用：敌修的金身 */
  foeBlock(e: Enemy): boolean {
    const st = this.fs.get(e);
    if (!st || st.inv <= 0) return false;
    if (st.txt <= 0) { st.txt = 0.3; this.c.texts.push({ x: e.x + rand(-20, 20), y: e.y - 120, s: '不磨', color: '#ffe9a8', t: 0, vy: -40 }); this.evq.push({ k: 'invhit', x: e.x, y: e.y, ang: rand(0, TAU) }); audio.sfx('clang', e.x, e.y); }
    return true;
  }

  // ------------------------------------------------------------ 音爆
  /** tier 不给则按 speed 定档；mine = 主角自己的（不走声像、带震屏与字样） */
  boom(x: number, y: number, speed: number, ang: number, mine: boolean, vol = 1, tier?: number) {
    const tr = tier ?? boomTier(speed); if (tr < 0) return;
    const g = this.c.game, now = g.time;
    if (mine) { if (now - this.lastBoom < 0.45) return; this.lastBoom = now; }
    const lift = mine ? (g.player.st.lift || 0) : 60;
    this.booms.push({ x, y, ang: Number.isFinite(ang) ? ang : 0, t: 0, dur: 0.55 + tr * 0.12, tier: tr, lift });
    if (this.booms.length > 12) this.booms.shift();
    if (mine) audio.sonicBoom(undefined, undefined, tr, vol); else audio.sonicBoom(x, y, tr, vol);
    if (mine) {
      g.juice(0, (0.08 + tr * 0.07) * vol);
      if (vol >= 1 && tr >= 1) this.c.texts.push({ x, y: y - 150 - lift, s: BOOM_NAME[tr], color: '#e8f4ff', t: 0, vy: -30, big: tr >= 3 });
    }
  }

  // ------------------------------------------------------------ 击杀：机缘与搜身
  onKill(e: Enemy) {
    const c = this.c, g = c.game, h = g.hero;
    if (e.ally || e.spar || e.minion || e.npcKill || h.dead) return;
    const knows = (id: string) => h.arts.some((a) => a.id === id);
    if (e.def.kind === 'human') {   // 用过的秘术有三成机会搜出卷轴；否则小概率摸到一卷
      const st = this.fs.get(e);
      const used = st ? [...st.used].map((k) => FOE_MI[k]?.art).filter((id) => id && !knows(id)) : [];
      if (used.length && Math.random() < 0.3) c.dropLoot(e.x, e.y, 'scroll_art_' + used[(Math.random() * used.length) | 0], 1);
      else if (Math.random() < 0.05) { const pool = MI_ARTS.filter((id) => !knows(id)); if (pool.length) c.dropLoot(e.x, e.y, 'scroll_art_' + pool[(Math.random() * pool.length) | 0], 1); }
    }
    const nt = this.prog(), hl = levelOf(h.realm, h.stage);
    if (!knows('wanjie') && h.hp < 0.2 && e.level >= hl - 2) {
      nt.brink++;
      if (nt.brink >= NI_NEED.brink) this.learn('wanjie', '第三次从鬼门关前杀回来，你忽然明白：身可碎，意不可磨——你悟出了逆天之法《万劫不磨体》。');
      else g.toast(`生死一线间，你似有所悟……（向死而生 ${nt.brink}/${NI_NEED.brink}）`, 'good');
    }
    if (!knows('niming') && (e.realm > h.realm || e.level >= hl + 3)) {
      nt.cross++;
      if (nt.cross >= NI_NEED.cross) this.learn('niming', '三度以弱胜强，你隐约触到了「命」的边——命若可逆，死亦可回。你悟出了逆天之法《逆命回光术》。');
      else g.toast(`以弱胜强，你心头涌起一股逆天而行的快意……（越阶斩敌 ${nt.cross}/${NI_NEED.cross}）`, 'good');
    }
  }
  private learn(id: string, msg: string) {
    const g = this.c.game, h = g.hero, p = g.player;
    if (h.arts.some((a) => a.id === id) || !ARTS[id]) return;
    h.arts.push({ id, xp: 0 });
    const k = h.hotbar.findIndex((x) => x === null); if (k >= 0) h.hotbar[k] = id;
    g.toast(msg, 'good'); g.news(`${h.name}顿悟逆天之法《${ARTS[id].name}》。`, 'personal');
    this.evq.push({ k: 'learn', x: p.x, y: p.y, col: ARTS[id].color });
    audio.sfx('gain'); audio.bell(undefined, undefined, 0.5, 0.75); g.juice(0.05, 0.3);
    g.updateUI(true);
  }
  /** 静坐悟法：水畔观水 / 雷雨听雷（每 0.5 秒结算一次） */
  private jiyuan(dt: number) {
    const c = this.c, g = c.game, p = g.player, h = g.hero, T = g.terrain;
    if (h.dead || g.mijing?.active || !p.sitting) return;
    const nt = this.prog();
    if (!this.has('cunyin') && this.byRiver(p.x, p.y)) {
      const b = nt.river; nt.river += dt;
      if (b < 2 && nt.river >= 2) g.toast('水声入耳，你心中一动——逝者如斯，不舍昼夜。（于江河之畔静坐，似可悟出些什么）', 'good');
      else if (b < NI_NEED.river * 0.5 && nt.river >= NI_NEED.river * 0.5) g.toast('河水奔流不息，你却仿佛看见其中一朵浪花……停了一瞬。', 'good');
      if (nt.river >= NI_NEED.river) this.learn('cunyin', '流水在你眼中慢了下来，终于静止——原来光阴亦是一条河，河可断流。你悟出了逆天之法《寸阴凝世诀》。');
    }
    const wk = g.weather?.kind;
    if (!this.has('kaitian') && (wk === 'storm' || wk === 'rain')) {
      const b = nt.storm; nt.storm += dt * (wk === 'storm' ? 1 : 0.4) * (T.sample(p.x, p.y).elev > 0.35 ? 1.6 : 1);
      if (b < 2 && nt.storm >= 2) g.toast('雷声滚过头顶，你的经脉竟随之隐隐震颤。（雷雨中静坐，似可悟出些什么；登高更易）', 'good');
      this.boltT -= dt;
      if (this.boltT <= 0) {   // 天雷落在近处
        this.boltT = rand(4, 8);
        const bx = p.x + rand(-260, 260), by = p.y + rand(-150, 150);
        c.vfx.push({ kind: 'strike', x: bx, y: by, r: 70, t: 0, dur: 0.5, color: '200,215,255', fx: 'lightning', seed: Math.random() * 1e6 });
        audio.crack(bx, by, 0.8, 1);
      }
      if (nt.storm >= NI_NEED.storm) this.learn('kaitian', '一道天雷在你眼前劈开夜幕——那不是光，是天地被划开的一条线。你悟出了逆天之法《一线开天》。');
    }
  }

  // ------------------------------------------------------------ 敌修秘术（AI）
  private newFoe(e: Enemy): FoeNi {
    const pool = ['xue', 'lie', 'gu', 'gui', 'shui'].sort(() => Math.random() - 0.5);
    const n = e.minion ? (Math.random() < 0.4 ? 1 : 0) : e.realm <= 1 ? (Math.random() < 0.45 ? 1 : 2) : e.realm === 2 ? 2 : 3;
    const elite = !e.minion && !e.ally && !e.spar && (e.boss ? true : e.realm >= 4 ? Math.random() < 0.35 : e.realm === 3 ? Math.random() < 0.15 : false);
    return { kit: pool.slice(0, n), cd: rand(2, 7), k: null, ph: 0, t: 0, dur: 0, dunHi: false, boomCd: 0, inv: 0, elite, invUsed: false, used: new Set(), txt: 0 };
  }
  private apply(e: Enemy, m: FoeMul, undo = false) {
    if (m.speed) { const k = undo ? 1 / m.speed : m.speed; e.speed *= k; (e as any).niSpd = ((e as any).niSpd ?? 1) * k; }
    if (m.atk) e.atk = undo ? e.atk / m.atk : e.atk * m.atk;
    if (m.dfn) e.dfn = undo ? e.dfn / m.dfn : e.dfn * m.dfn;
  }
  private foeStart(e: Enemy, st: FoeNi, k: string) {
    const d = FOE_MI[k], c = this.c;
    st.k = k; st.ph = 0; st.t = 0; st.dur = d.dur; st.used.add(k);
    this.apply(e, d.mul);
    if (k === 'xue') { e.hp = Math.max(e.maxHp * 0.1, e.hp - e.maxHp * 0.08); this.boom(e.x, e.y, 0, Math.atan2(e.mvy, e.mvx), false, 0.7, clamp(e.realm - 1, 0, 3)); }
    if (k === 'gu') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2);
    if (k === 'shui') this.splashSfx(0.4, e.x, e.y);
    c.texts.push({ x: e.x, y: e.y - 132, s: d.name + '！', color: `rgb(${d.col})`, t: 0, vy: -26 });
    this.evq.push({ k: 'foe', x: e.x, y: e.y, col: d.col, s: k });
  }
  private foeThink(e: Enemy, st: FoeNi) {
    const g = this.c.game, p = g.player, T = g.terrain;
    const tg = e.tgE && !e.tgE.dead ? e.tgE : e.ally ? null : p;
    if (!tg) return;
    const d = Math.hypot(tg.x - e.x, tg.y - e.y), hk = e.hp / Math.max(1, e.maxHp);
    const fleeing = e.flee || e.fled || e.retreatT > 0;
    const has = (k: string) => st.kit.includes(k);
    if (has('xue') && hk > 0.25 && (fleeing || (d > 460 && d < 1800))) return this.foeStart(e, st, 'xue');
    if (has('gu') && hk < 0.5) return this.foeStart(e, st, 'gu');
    if (has('shui') && (fleeing || d > 300) && T.isLand(e.x, e.y) && T.riverEdge(e.x, e.y) < 0) return this.foeStart(e, st, 'shui');
    if (has('lie') && !fleeing && d < 640 && hk > 0.4 && Math.random() < 0.5) return this.foeStart(e, st, 'lie');
    if (has('gui') && !fleeing && hk < 0.85 && d < 520 && Math.random() < 0.4) return this.foeStart(e, st, 'gui');
  }
  private foeTick(dt: number) {
    const c = this.c, g = c.game, p = g.player;
    this.aiT -= dt; const think = this.aiT <= 0; if (think) this.aiT = 0.25;
    for (const e of c.units) {
      if (e.dead || e.def.kind !== 'human' || (e as any).shell) continue;
      let st = this.fs.get(e);
      if (!st) { if (!think) continue; st = this.newFoe(e); this.fs.set(e, st); }
      st.txt -= dt; st.boomCd -= dt;
      // 催动遁光 → 音爆（筑基以上；境界越高越沉）
      const hi = e.dun > 0.85;
      if (hi && !st.dunHi && st.boomCd <= 0 && e.realm >= 2 && Math.abs(e.x - p.x) < 2400 && Math.abs(e.y - p.y) < 2400) { st.boomCd = 4; this.boom(e.x, e.y, 0, Math.atan2(e.mvy, e.mvx), false, 0.8, clamp(e.realm - 1, 1, 4)); }
      st.dunHi = hi;
      if (st.inv > 0) st.inv -= dt;
      if (st.k) {
        const d = FOE_MI[st.k]; st.t += dt;
        if (st.ph === 0 && st.t >= st.dur) {
          this.apply(e, d.mul, true); this.apply(e, d.am);
          if (st.k === 'gu') e.hp = Math.max(1, e.hp - e.maxHp * 0.07);
          st.ph = 1; st.t = 0; st.dur = d.aft;
        } else if (st.ph === 1 && st.t >= st.dur) { this.apply(e, d.am, true); st.k = null; st.cd = rand(14, 22); }
      } else if (st.cd > 0) st.cd -= dt;
      else if (think && (e.aggro || e.flee || e.fled) && !e.st.freeze && !e.st.stun && !e.cast && e.sup < 2 && e.hideT <= 0) this.foeThink(e, st);   // 逃命的也会用（沸血遁）
      // 强敌的金身：残血时一次
      if (st.elite && !st.invUsed && e.aggro && e.hp < e.maxHp * 0.3 && think && Math.random() < 0.5) {
        st.invUsed = true; st.inv = 2 + e.realm * 0.25;
        c.texts.push({ x: e.x, y: e.y - 150, s: '万劫不磨！', color: '#ffe9a8', t: 0, vy: -26, big: true });
        this.evq.push({ k: 'inv', x: e.x, y: e.y });
        audio.gong(audio.now, 0.4, 150, undefined, e.x, e.y);
      }
    }
  }

  // ------------------------------------------------------------ 每帧
  update(dt: number) {
    const c = this.c, g = c.game, p = g.player, h = g.hero, now = g.time;
    // 增减益：到点生效 / 到点散去
    if (this.mods.length) {
      let regen = 0;
      for (const m of this.mods) {
        if (now < m.from) continue;
        if (!m.on) { m.on = true; if (m.bad) g.toast(`${m.name}：${modText(m)}`, 'warn'); }
        if (m.regen && now < m.until) regen += m.regen;
      }
      if (regen && !h.dead) h.hp = Math.min(1, h.hp + regen * dt);
      const ended = this.mods.filter((m) => now >= m.until);
      if (ended.length) { this.mods = this.mods.filter((m) => now < m.until); for (const m of ended) m.end?.(); }
      // 沸血遁：一路血色残影
      if (this.active('feixue') && Math.hypot(p.st.vx, p.st.vy) > 80) { this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = 0.05; c.ghosts.push({ x: p.x, y: p.y, t: 0, dur: 0.3, color: '235,50,60', yaw: p.st.yaw }); } }
    }
    if (this.stasisT > 0) {
      this.stasisT -= dt;
      if (this.stasisT <= 0 || h.dead) { this.stasisT = 0; this.evq.push({ k: 'unstasis', x: p.x, y: p.y }); this.stasisSfx(false); stasisCss(false); }
    }
    if (this.invT > 0) {
      this.invT -= dt;
      if (this.invT <= 0) { this.invT = 0; this.evq.push({ k: 'invend', x: p.x, y: p.y }); audio.sfx('break'); }
    }
    this.blockT -= dt;
    if (this.kt) {
      const k = this.kt; k.t += dt;
      if (!k.fired) {
        k.x = p.x; k.y = p.y;
        // 蓄势时白线跟着锁定的目标转（出手一瞬才定向），免得对手横移一步就躲开
        if (k.tg && !k.tg.dead && k.tg.hideT <= 0) { const dx = k.tg.x - p.x, dy = k.tg.y - p.y, d = Math.hypot(dx, dy); if (d > 1) { k.dx = dx / d; k.dy = dy / d; } }
        if (h.dead) this.kt = null; else if (k.t >= k.charge) this.fireKaitian();
      }
      else if (k.t > k.charge + 0.9) this.kt = null;
    }
    if (this.booms.length) { for (const b of this.booms) b.t += dt; this.booms = this.booms.filter((b) => b.t < b.dur); }
    // 全力催动遁光：起步破音障，其后隔几息再爆一记
    const sp = Math.hypot(p.st.vx, p.st.vy), ang = Math.atan2(p.st.vy, p.st.vx);
    if (p.boosting && !this.wasBoost) { this.boomIn = 0.18; this.reboom = rand(3.2, 4.6); }
    this.wasBoost = !!p.boosting;
    if (this.boomIn >= 0) { this.boomIn -= dt; if (this.boomIn < 0 && p.boosting) this.boom(p.x, p.y, Math.max(sp, g.speed * c.speedMul), ang, true); }
    if (p.boosting) { this.reboom -= dt; if (this.reboom <= 0) { this.reboom = rand(3.4, 5.2); if (boomTier(sp) >= 1) this.boom(p.x, p.y, sp, ang, true, 0.55); } }
    // 水遁
    if (this.wd) {
      const w = this.wd, T = g.terrain, land = T.isLand(p.x, p.y);
      w.t -= dt;
      const inW = !g.isFlying && (land ? T.riverEdge(p.x, p.y) < 0 : w.kind === 'sea');
      if (land) { w.lx = p.x; w.ly = p.y; }
      if (inW && !w.inW) { this.evq.push({ k: 'splash', x: p.x, y: p.y, r: 1 }); this.splashSfx(0.6); }
      w.inW = inW;
      if (inW && w.kind === 'sea' && !land) h.mp = Math.max(0, h.mp - 0.012 * dt);
      if (w.t <= 0) this.endWater('time');
      else if (w.kind === 'sea' && !land && inW && h.mp <= 0.004) this.endWater('mp');
      else if (h.dead) this.wd = null;
    }
    this.jiT -= dt; if (this.jiT <= 0) { this.jiT = 0.5; this.jiyuan(0.5); }
    if (!this.stasis) this.foeTick(dt);
  }

  private fireKaitian() {
    const c = this.c, g = c.game, k = this.kt!; k.fired = true;
    for (const e of c.enemies) {
      if (e.dead) continue;
      const t = clamp(((e.x - k.x) * k.dx + (e.y - k.y) * k.dy) / k.len, 0, 1);
      const cx = k.x + k.dx * k.len * t, cy = k.y + k.dy * k.len * t;
      if (Math.hypot(e.x - cx, e.y - cy) > k.w + 34) continue;
      e.evRoll = Math.max(e.evRoll, 0.5);   // 天威之下，遁无可遁：这一击不给瞬移闪避的机会（foemind 的闪避判定在 evRoll > 0 时不触发）
      c.hitEnemy(e, k.dmg, { ...k.base, realm: Math.max(k.base.realm, e.realm) }, k.x, k.y);   // 无视境界压制
      e.kx += k.dx * 520; e.ky += k.dy * 330;
    }
    this.evq.push({ k: 'ktfire', x: k.x, y: k.y, ang: Math.atan2(k.dy, k.dx), r: k.len });
    g.juice(0.1, 0.9); audio.crack(undefined, undefined, 1, 1.5); audio.sonicBoom(undefined, undefined, 4, 1); audio.sfx('boom');
  }

  // ------------------------------------------------------------ 音效（合成）
  private stasisSfx(on: boolean) {
    const o = audio.synthOut(undefined, undefined, 0.6, 0.5); if (!o) return;
    const t = audio.now;
    if (on) {   // 万籁骤收：一声下坠的长音、世界被闷住，随后滴答两声
      audio.tone('sine', 1320, t, 0.7, 0.3, o, 82, 0.01); audio.tone('triangle', 660, t, 0.7, 0.18, o, 41, 0.01);
      audio.nz(t, 0.6, 0.4, o, 'lowpass', 6000, 120, 0.8, 0.01);
      audio.wood(t + 0.55, 0.5, o, 1400); audio.wood(t + 0.95, 0.35, o, 1400);
      audio.bell(undefined, undefined, 0.4, 0.5);
    } else {   // 光阴复流：一声上扬
      audio.tone('sine', 110, t, 0.45, 0.28, o, 1100, 0.02); audio.nz(t, 0.4, 0.3, o, 'bandpass', 300, 5000, 1, 0.05);
      audio.wood(t + 0.02, 0.4, o, 1800);
    }
  }
  private splashSfx(vol: number, x?: number, y?: number) {
    if (audio.play('splash', { x, y, vol, gap: 0.1 })) return;
    const o = audio.synthOut(x, y, vol, 0.2); if (!o) return;
    const t = audio.now;
    audio.nz(t, 0.45, 0.6, o, 'bandpass', 1400, 320, 0.8, 0.005); audio.nz(t + 0.03, 0.6, 0.3, o, 'highpass', 3600, 0, 0.6, 0.02);
    audio.tone('sine', 160, t, 0.2, 0.3, o, 60, 0.004);
  }
}
