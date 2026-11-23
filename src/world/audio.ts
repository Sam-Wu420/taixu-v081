// 第三十三步：声音引擎（WebAudio）
// · 采样：CC0 音效与乐器（Kenney / OpenGameArt / sfzinstruments 二胡 / SP 竹笛），内联在 sfxData.ts，首次交互时解码
// · 合成：古琴（Karplus-Strong）、堂鼓、木鱼、锣、钹、钟、风雨海潮虫鸣……采样未就绪时一律退回纯合成
// · 配乐（music.ts）按场景切换并与战斗强度联动；环境声（ambience.ts）随天气 / 地形 / 昼夜；
//   声音导演（sounddir.ts）每帧扫描战斗事件，按距离与方位发声（左右声像 + 远处闷化）
import { modx } from '../mod/hooks';
import { Music } from './music';
import { Ambience } from './ambience';
import { SoundDirector } from './sounddir';

export interface PlayOpts {
  x?: number; y?: number;          // 世界坐标（给了就按距离衰减 + 声像）
  vol?: number; rate?: number; detune?: number; pan?: number;
  rev?: number;                    // 混响送量
  when?: number;                   // 绝对时间（ctx 时钟）
  gap?: number; key?: string;      // 同类声的最小间隔（秒）与节流键
  lp?: number;                     // 低通（Hz）
  bus?: 'sfx' | 'music' | 'amb';
}
export interface Voice { src: AudioBufferSourceNode; gain: GainNode; end: number }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const pick = <T,>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export type OldKind = 'click' | 'whoosh' | 'land' | 'open' | 'chime' | 'thunder' | 'break' | 'fail' | 'gather' | 'sword' | 'boom' | 'bell' | 'clang' | 'fire' | 'gain'
  // 收官 P5：虚空挪移的开阵、进甬道、出甬道；遁空梭蓄势；甬道里追兵的飞剑（预警的剑鸣、打中）；遁空途中被拦截（前方有人截道的警讯）
  | 'zhenopen' | 'warpin' | 'warpout' | 'spool' | 'bladewarn' | 'bladehit' | 'ambush'
  // 兵器接进近战：剑、重兵、枪各自的挥（破风）和砍中
  | 'wswing_sword' | 'wswing_heavy' | 'wswing_spear' | 'whit_sword' | 'whit_heavy' | 'whit_spear'
  // r7-fx3d：大招的立体特效配音（合成，不加音频文件）：蓄力嗡鸣、踩地起步、音爆、重拳命中、终结技低频轰鸣、扭曲冲击波、四层爆炸、往前喷的火龙、砸坑落地
  | 'fx_charge' | 'fx_launch' | 'fx_sonic' | 'fx_hit' | 'fx_finisher' | 'fx_warp' | 'fx_blast' | 'fx_roar' | 'fx_crash'
  // r11-lock：手动锁定目标（Tab / 点选）那一下短促的「咔」
  | 'lock';
// 撼山客第一阶段（r8-p1）：破风（快 / 重）、命中（轻 / 重 / 终结）、肘击靠击、冲刺起步、闪步、霸体、倒地滑行、蓄劲、爆炸
/** r9-hitfeel 全游戏打击感的音效名（audio.hf） */
export type HfSfx = 'hfLight' | 'hfHeavy' | 'hfFin' | 'hfSword' | 'hfSwordHeavy' | 'hfBlunt' | 'hfBluntHeavy' | 'hfSpear' | 'hfSpearHeavy' | 'hfHurt' | 'hfHurtHeavy'
  | 'hfPop' | 'hfBoomFire' | 'hfBoomGold' | 'hfBoomFrost' | 'hfBoomVenom' | 'hfBoomThunder' | 'hfBoomInk' | 'hfBoomVoid' | 'hfBoomEarth' | 'hfBoomWind';
export type P1Sfx = 'p1swing' | 'p1swingHeavy' | 'p1hit' | 'p1hitHeavy' | 'p1hitFin' | 'p1bash' | 'p1dash' | 'p1blink' | 'p1armor' | 'p1slide' | 'p1charge' | 'p1boom';

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode; musicBus!: GainNode; sfxBus!: GainNode; ambBus!: GainNode;
  reverb!: ConvolverNode; revIn!: GainNode;
  enabled = true;
  musicVol = 0.55; sfxVol = 0.7;
  bufs: Record<string, AudioBuffer> = {};
  ready = false;
  /** 听者（=主角）位置与神识半径：识外之声压低 */
  lx = 0; ly = 0; hearR = 900;
  voices = 0; maxVoices = 30;
  noise!: AudioBuffer;
  music: Music | null = null;
  amb: Ambience | null = null;
  dir = new SoundDirector(this);
  private last = new Map<string, number>();
  private mode: 'title' | 'world' = 'title';

  /** 总输出（压限器之后）：录像时从这里接一路出去（tools/rec/record.mjs） */
  private outNode: AudioNode | null = null;
  /** 录像用：把游戏的全部声音接到一路 MediaStream（没有声音上下文就先建一个） */
  recordStream(): MediaStream | null {
    this.unlock(); const c = this.ctx; if (!c || !this.outNode) return null;
    try { void c.resume(); } catch { /* */ }
    const d = c.createMediaStreamDestination(); this.outNode.connect(d); return d.stream;
  }
  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
      if (!AC) return;
      const c = this.ctx = new AC() as AudioContext;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
      // r9-hitfeel：压限器后面再串一级限幅（录像峰值 −0.4 dB 快削波了：同一帧几下命中 + 爆炸叠在一起）。阈值 −6 dB、20:1、起音 1 毫秒，再压 −2.2 dB，峰值落在 −3 dB 上下（实测见交付说明）
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
      const trim = c.createGain(); trim.gain.value = 0.78;
      comp.connect(lim); lim.connect(trim); trim.connect(c.destination); this.outNode = trim;
      this.master = c.createGain(); this.master.gain.value = this.enabled ? 1 : 0; this.master.connect(comp);
      this.reverb = c.createConvolver(); this.reverb.buffer = this.impulse(3.4);
      this.revIn = c.createGain(); this.revIn.gain.value = 1; this.revIn.connect(this.reverb);
      const wet = c.createGain(); wet.gain.value = 0.5; this.reverb.connect(wet); wet.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVol; this.musicBus.connect(this.master);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);
      this.ambBus = c.createGain(); this.ambBus.gain.value = this.sfxVol; this.ambBus.connect(this.master);
      const len = c.sampleRate * 2; this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.music = new Music(this); this.music.setMode(this.mode);
      this.amb = new Ambience(this);
      this.load();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.music?.start();
  }

  /** 解码内联采样（动态引入：Node 测试环境不会触发） */
  private async load() {
    try {
      const mod = await import('./sfxData');
      const data = mod.SFX_DATA as Record<string, string>;
      const c = this.ctx!;
      const names = Object.keys(data);
      // 先解码战斗与界面常用的，乐器放后
      names.sort((a, b) => (/^(erhu|dizi|xiao)_/.test(a) ? 1 : 0) - (/^(erhu|dizi|xiao)_/.test(b) ? 1 : 0));
      for (const n of names) {
        try {
          const url = data[n];
          let buf: ArrayBuffer;
          if (url.startsWith('data:')) {
            const bin = atob(url.slice(url.indexOf(',') + 1)); const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            buf = u8.buffer;
          } else buf = await (await fetch(url)).arrayBuffer();   // 创空间版：采样是单独的文件（走缓存）
          this.bufs[n] = await new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(buf, res, rej));
        } catch { /* 单个失败忽略 */ }
      }
      this.ready = true;
    } catch { /* 采样不可用：纯合成 */ }
  }

  setMode(m: 'title' | 'world') { this.mode = m; this.music?.setMode(m); }
  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.3);
  }
  setMusicVol(v: number) { this.musicVol = v; if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  setSfxVol(v: number) {
    this.sfxVol = v;
    if (this.sfxBus && this.ctx) { this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); this.ambBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  has(name: string) { return !!this.bufs[name]; }

  private impulse(sec: number) {
    const c = this.ctx!, len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        // 早期反射稀疏 + 尾音渐暗（一阶低通让尾巴更“木”，不刺耳）
        const n = (Math.random() * 2 - 1) * (i < c.sampleRate * 0.06 ? (Math.random() < 0.02 ? 3 : 0.2) : 1);
        lp += (n - lp) * (0.55 - k * 0.4);
        d[i] = lp * Math.pow(1 - k, 2.4);
      }
    }
    return buf;
  }

  /** 输出端：音量 → 声像 → 总线（+ 混响送） */
  out(vol: number, pan = 0, rev = 0.2, bus: 'sfx' | 'music' | 'amb' = 'sfx', when = 0): GainNode {
    const c = this.ctx!;
    const g = c.createGain(); g.gain.value = vol;
    const B = bus === 'music' ? this.musicBus : bus === 'amb' ? this.ambBus : this.sfxBus;
    let tail: AudioNode = g;
    if (pan) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); tail = p; }
    tail.connect(B);
    if (rev > 0) { const s = c.createGain(); s.gain.value = rev; tail.connect(s); s.connect(this.revIn); }
    void when;
    return g;
  }

  /** 空间化参数：返回 [音量系数, 声像, 低通] 或 null（太远） */
  spatial(x: number, y: number): [number, number, number] | null {
    const dx = x - this.lx, dy = y - this.ly, d = Math.hypot(dx, dy);
    if (d > 3200) return null;
    let k = 1 / (1 + d / 900);
    if (d > this.hearR) k *= 0.35;
    const lp = d > 800 ? 16000 / (1 + (d - 800) / 350) : 0;
    return [k, clamp(dx / 700, -1, 1) * 0.7, lp];
  }

  /** 播放一个采样 */
  play(name: string, o: PlayOpts = {}): Voice | null {
    const c = this.ctx; if (!c || !this.enabled) return null;
    if (modx?.sfxOverride && !name.startsWith('mod:') && modx.sfxFor(name, o)) return null;   // v0.57：模组换掉或静音了这个音效
    const b = this.bufs[name]; if (!b) return null;
    const now = c.currentTime, when = Math.max(now, o.when ?? now);
    const bus = o.bus ?? 'sfx';
    if (bus === 'sfx') {
      const key = o.key ?? name, gap = o.gap ?? 0.04;
      const lt = this.last.get(key);
      if (lt !== undefined && when - lt < gap) return null;
      this.last.set(key, when);
      if (this.voices >= this.maxVoices) return null;
    }
    let vol = o.vol ?? 1, pan = o.pan ?? 0, lp = o.lp ?? 0;
    if (o.x !== undefined) {
      const s = this.spatial(o.x, o.y ?? this.ly); if (!s) return null;
      vol *= s[0]; pan = s[1]; if (s[2]) lp = lp ? Math.min(lp, s[2]) : s[2];
    }
    if (vol < 0.008) return null;
    const src = c.createBufferSource(); src.buffer = b;
    if (o.rate) src.playbackRate.value = o.rate;
    if (o.detune) src.detune.value = o.detune;
    const g = this.out(vol, pan, o.rev ?? (bus === 'music' ? 0.35 : 0.18), bus);
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; src.connect(f); f.connect(g); } else src.connect(g);
    if (bus === 'sfx') { this.voices++; src.onended = () => { this.voices--; }; }
    src.start(when);
    return { src, gain: g, end: when + b.duration / (o.rate ?? 1) };
  }

  // ---------------------------------------------------------------- v0.56：模组的声音（data: 网址，用到时才解码）
  private modDec = new Map<string, Promise<AudioBuffer | null>>();
  private modTrack: { src: AudioBufferSourceNode; gain: GainNode; key: string } | null = null;
  private decodeData(key: string, url: string): Promise<AudioBuffer | null> {
    let p = this.modDec.get(key);
    if (!p) {
      const c = this.ctx;
      if (!c || !/^data:audio\//.test(url)) return Promise.resolve(null);
      p = new Promise<AudioBuffer | null>((res) => {
        try {
          const bin = atob(url.slice(url.indexOf(',') + 1)); const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          c.decodeAudioData(u8.buffer, (b) => res(b), () => res(null));
        } catch { res(null); }
      });
      this.modDec.set(key, p);
    }
    return p;
  }
  /** 播放模组附带的音效 */
  playData(key: string, url: string, o: PlayOpts = {}) {
    this.decodeData(key, url).then((b) => { if (!b) return; this.bufs[key] = b; this.play(key, { gap: 0.02, ...o }); });
  }
  /** 模组换背景音乐：循环播放，原配乐静音；url 为 null 恢复原配乐 */
  musicData(key: string | null, url: string | null, vol = 0.8) {
    const c = this.ctx; if (!c) return;
    const old = this.modTrack;
    if (old && old.key === key) { old.gain.gain.setTargetAtTime(vol, c.currentTime, 0.3); return; }
    if (old) { old.gain.gain.setTargetAtTime(0, c.currentTime, 0.5); try { old.src.stop(c.currentTime + 2); } catch { /* */ } this.modTrack = null; }
    this.music?.setOverride(!!url);
    if (!key || !url) return;
    this.decodeData(key, url).then((b) => {
      if (!b || !this.ctx) return;
      const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const gain = this.ctx.createGain(); gain.gain.value = 0; gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.6);
      src.connect(gain); gain.connect(this.musicBus); src.start();
      this.modTrack = { src, gain, key };
    });
  }

  /** 从一组采样里随机挑一个 */
  any(names: readonly string[], o: PlayOpts = {}) {
    const ok = names.filter((n) => this.bufs[n]);
    if (!ok.length) return null;
    return this.play(pick(ok), { key: o.key ?? names[0], ...o });
  }

  // ------------------------------------------------------------ 合成小件
  tone(type: OscillatorType, f: number, t: number, dur: number, vol: number, dest: AudioNode, f2?: number, att = 0.005) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur * 0.9);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  nz(t: number, dur: number, vol: number, dest: AudioNode, type: BiquadFilterType = 'bandpass', f0 = 1000, f1 = 0, q = 1, att = 0.005) {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  /** 合成落点（给定坐标）→ 输出节点；太远返回 null */
  synthOut(x: number | undefined, y: number | undefined, vol: number, rev = 0.2): AudioNode | null {
    if (!this.ctx || !this.enabled) return null;
    if (x === undefined) return this.out(vol, 0, rev);
    const s = this.spatial(x, y ?? this.ly); if (!s) return null;
    const g = this.out(vol * s[0], s[1], rev);
    if (!s[2]) return g;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = s[2]; f.connect(g);
    return f;
  }
  /** 雷：撕裂的炸响 + 滚雷 */
  crack(x?: number, y?: number, vol = 1, rumble = 1) {
    const o = this.synthOut(x, y, vol, 0.35); if (!o) return;
    const t = this.now;
    this.nz(t, 0.12, 0.9, o, 'highpass', 2500, 0, 0.7, 0.002);
    this.nz(t + 0.01, 0.35, 0.6, o, 'bandpass', 3000, 600, 0.8, 0.003);
    if (rumble > 0) {
      this.nz(t + 0.05, 2.6 * rumble, 0.75, o, 'lowpass', 900, 70, 0.8, 0.06);
      this.tone('sine', 70, t, 0.9, 0.5, o, 32);
    }
  }
  /** 「遁影惊雷」音爆：遁速破开音障的「嘶——嘭嘭——轰隆」。tier 0‥4（气爆 / 音爆 / 裂云 / 惊雷 / 碎空）越大越沉、越长、越响 */
  sonicBoom(x?: number, y?: number, tier = 1, vol = 1) {
    const k = clamp(tier, 0, 4);
    const o = this.synthOut(x, y, clamp((0.42 + k * 0.15) * vol, 0, 1.3), 0.25 + k * 0.08); if (!o) return;
    const t = this.now + 0.01, gap = 0.035 + k * 0.016;
    // 撕空的前奏：一缕急升的气啸
    this.nz(t, 0.14, 0.22 + k * 0.03, o, 'bandpass', 500, 3200 + k * 500, 1.6, 0.05);
    // N 波：头激波、尾激波前后两记炸响；境界越高两响拉得越开、音越沉
    const t1 = t + 0.1;
    for (let i = 0; i < 2; i++) {
      const tt = t1 + i * gap, v = i ? 0.72 : 1;
      this.nz(tt, 0.05 + k * 0.012, 0.95 * v, o, 'highpass', 1800 - k * 250, 0, 0.7, 0.001);
      this.nz(tt, 0.16 + k * 0.05, 0.8 * v, o, 'lowpass', 2400 - k * 300, 160, 0.9, 0.002);
      this.tone('sine', 150 - k * 14, tt, 0.22 + k * 0.07, 0.85 * v, o, 38 - k * 3, 0.002);
    }
    // 空气被推开的闷响与滚动余波
    this.nz(t1 + gap, 0.5 + k * 0.5, 0.5 + k * 0.06, o, 'lowpass', 1300, 70, 0.8, 0.02);
    this.tone('sine', 64 - k * 6, t1, 0.6 + k * 0.4, 0.55, o, 26, 0.004);
    if (k >= 2) { this.nz(t1 + 0.28 + k * 0.05, 0.9 + k * 0.4, 0.3, o, 'lowpass', 700, 60, 0.7, 0.12); this.tone('triangle', 46, t1 + 0.3, 0.9, 0.22, o, 24, 0.05); }
    if (k >= 3) this.nz(t1 + 0.75, 1.6 + (k - 3) * 0.8, 0.22, o, 'lowpass', 420, 50, 0.7, 0.25);
    if (k >= 4) { this.nz(t1 + 0.02, 0.4, 0.4, o, 'bandpass', 5200, 900, 0.9, 0.002); this.tone('sine', 32, t1, 2.2, 0.5, o, 20, 0.01); }
    this.play(k >= 2 ? 'boom1' : 'boom2', { x, y, vol: (0.28 + k * 0.1) * vol, rate: 1.05 - k * 0.11, gap: 0.05, key: 'sonic', rev: 0.3 + k * 0.06, when: t1 });
  }
  /** 火：噼啪 */
  crackle(x?: number, y?: number, vol = 0.5, n = 7) {
    const o = this.synthOut(x, y, vol, 0.1); if (!o) return;
    const t = this.now;
    this.nz(t, 0.5, 0.35, o, 'lowpass', 900, 300, 0.7, 0.04);
    for (let i = 0; i < n; i++) this.nz(t + Math.random() * 0.45, 0.025, rnd(0.3, 0.8), o, 'bandpass', rnd(1800, 5000), 0, 2, 0.001);
  }
  /** 钟（采样优先） */
  bell(x?: number, y?: number, vol = 0.5, rate = 1) {
    if (this.play(pick(['bell1', 'bell2']), { x, y, vol, rate, rev: 0.5, gap: 0.08, key: 'bell' })) return;
    const o = this.synthOut(x, y, vol, 0.5); if (!o) return;
    const t = this.now, f = 196 * rate;
    [[1, 0.3], [2.01, 0.16], [2.98, 0.1], [4.07, 0.07], [6.02, 0.04]].forEach(([m, v]) => this.tone('sine', f * m, t, 2.6, v, o));
  }
  /** 锣：非谐泛音 + 微微下沉 */
  gong(when: number, vol = 0.5, f = 92, dest?: AudioNode, x?: number, y?: number) {
    const o = dest ?? this.synthOut(x, y, vol, 0.5); if (!o) return;
    const v = dest ? vol : 1;
    [[1, 0.5], [1.48, 0.32], [1.98, 0.22], [2.53, 0.18], [3.14, 0.12], [4.21, 0.08], [5.4, 0.05]].forEach(([m, a], i) => {
      const os = this.tone('sine', f * m, when, 3.8 - i * 0.3, a * v, o, f * m * 0.985, 0.01);
      void os;
    });
    this.nz(when, 1.6, 0.15 * v, o, 'bandpass', 2400, 900, 1.2, 0.02);
  }
  /** 鼓（堂鼓） */
  drum(when: number, vol: number, dest: AudioNode, f0 = 150, f1 = 52, dec = 0.42) {
    this.tone('sine', f0, when, dec, vol, dest, f1, 0.002);
    this.tone('triangle', f0 * 1.6, when, dec * 0.3, vol * 0.25, dest, f1 * 1.6, 0.002);
    this.nz(when, 0.05, vol * 0.5, dest, 'lowpass', 1600, 400, 0.7, 0.001);
  }
  /** 木鱼 / 梆子 */
  wood(when: number, vol: number, dest: AudioNode, f = 880) {
    this.tone('sine', f, when, 0.09, vol, dest, f * 0.94, 0.001);
    this.tone('triangle', f * 2.7, when, 0.03, vol * 0.3, dest, 0, 0.001);
  }
  /** 钹 */
  cymbal(when: number, vol: number, dest: AudioNode, dur = 1.3) {
    this.nz(when, dur, vol, dest, 'highpass', 4200, 0, 0.6, 0.002);
    this.nz(when, dur * 0.6, vol * 0.6, dest, 'bandpass', 7000, 4000, 1.5, 0.002);
  }

  // ------------------------------------------------------------ 旧接口（全工程到处在用）
  sfx(kind: OldKind, x?: number, y?: number) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const P = (n: string | readonly string[], vol = 0.6, rate = 1, gap = 0.05, rev = 0.18) =>
      (typeof n === 'string' ? this.play(n, { x, y, vol, rate, gap, rev }) : this.any(n, { x, y, vol, rate: rate * rnd(0.94, 1.06), gap, rev }));
    const o = () => this.synthOut(x, y, 1, 0.25);
    switch (kind) {
      case 'click': if (!P('ui_click', 0.45, rnd(0.95, 1.08), 0.03, 0.05)) this.pluckSfx(880, t, 0.25, 0.4); return;
      case 'open': if (!P('ui_open', 0.5, 1, 0.05, 0.1)) { this.pluckSfx(587, t, 0.3, 1); this.pluckSfx(880, t + 0.06, 0.25, 1); } return;
      case 'chime': {
        P('bell2', 0.22, 1.5, 0.1, 0.4);
        this.pluckSfx(1174, t, 0.3, 1.5); this.pluckSfx(1760, t + 0.08, 0.2, 1.5); return;
      }
      case 'thunder': this.crack(x, y, 0.9, 1); P(['boom2'], 0.35, 0.55, 0.2, 0.4); return;
      case 'whoosh': {
        if (!P(['swish1', 'swish2', 'swish3'], 0.5, rnd(0.75, 1), 0.06)) { const d = o(); if (d) this.nz(t, 0.6, 0.35, d, 'bandpass', 300, 2400, 1.2, 0.08); }
        return;
      }
      case 'sword': {
        P(['unsheathe1', 'unsheathe2'], 0.45, rnd(1, 1.15), 0.08);
        const d = o(); if (!d) return;
        [1568, 2349, 3136].forEach((f, i) => this.tone('sine', f, t, 0.55, 0.05 / (i + 1), d, f * 1.04, 0.01));
        this.nz(t, 0.3, 0.12, d, 'bandpass', 1800, 5000, 2, 0.03);
        return;
      }
      case 'boom': {
        P(['boom1', 'boom2'], 0.75, rnd(0.85, 1), 0.08, 0.3);
        const d = o(); if (!d) return;
        this.tone('sine', 110, t, 0.7, 0.7, d, 32, 0.002);
        if (!this.ready) this.nz(t, 1.1, 0.45, d, 'lowpass', 2200, 120, 0.7, 0.002);
        return;
      }
      case 'bell': this.bell(x, y, 0.5, 0.75); return;
      case 'clang': if (!P(['metal1', 'metal2', 'metal3'], 0.45, rnd(0.9, 1.2), 0.05)) [880, 1320 * 1.02, 2093].forEach((f, i) => this.pluckSfx(f, t, 0.3 / (i + 1), 0.5)); return;
      case 'fire': P(['crunch1', 'crunch2'], 0.3, rnd(1.1, 1.35), 0.08); this.crackle(x, y, 0.4, 6); return;
      case 'gain': [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.pluckSfx(f, t + i * 0.07, 0.3, 2.6)); this.bell(undefined, undefined, 0.45, 1); P('spell', 0.3, 1, 0.3, 0.5); return;
      case 'gather': P(['beads', 'st_leaf'], 0.35, rnd(1, 1.2), 0.1); this.pluckSfx(660, t, 0.22, 0.6); this.pluckSfx(990, t + 0.1, 0.18, 0.8); return;
      case 'break': [523, 659, 784, 1046, 1318].forEach((f, i) => this.pluckSfx(f, t + i * 0.09, 0.35, 2.2)); this.bell(undefined, undefined, 0.4, 0.6); P('magic', 0.35, 0.8, 0.3, 0.5); return;
      case 'fail': P('ui_error', 0.35, 0.8, 0.2); [392, 330, 262, 196].forEach((f, i) => this.pluckSfx(f, t + i * 0.12, 0.3, 1.2)); return;
      case 'land': P(['thud'], 0.45, rnd(0.9, 1.05), 0.1); P(['st_gravel', 'st_grass1', 'st_grass2'], 0.35, 0.8, 0.1); return;
      // —— 收官 P5：虚空挪移与遁空（疾行沿用 thunder、收势沿用 whoosh）
      case 'zhenopen': {    // 开阵：脚下一声低鸣往上抬五度，阵纹逐圈点亮的四声拨弦，一层细细的灵气嘶声
        const d = o(); if (!d) return;
        this.tone('sine', 98, t, 1.1, 0.22, d, 147, 0.15); this.tone('triangle', 196, t, 0.9, 0.05, d, 294, 0.1);
        [523, 659, 784, 1046].forEach((f, i) => this.pluckSfx(f, t + 0.08 + i * 0.11, 0.22, 1.2));
        this.nz(t, 0.7, 0.08, d, 'bandpass', 600, 2400, 3, 0.2);
        return;
      }
      case 'warpin': {      // 进甬道：一口气被吸进去——噪声由高往低一沉，底下一记下坠的闷音
        const d = o(); if (!d) return;
        this.nz(t, 0.55, 0.3, d, 'bandpass', 3200, 260, 1.4, 0.03);
        this.tone('sine', 260, t, 0.6, 0.25, d, 60, 0.01);
        return;
      }
      case 'warpout': {     // 出甬道：冲出去——噪声由低往高一扬、一记落地的低音，尾上两声清音
        const d = o(); if (!d) return;
        this.nz(t, 0.4, 0.26, d, 'bandpass', 300, 3600, 1.2, 0.01);
        this.tone('sine', 70, t, 0.5, 0.32, d, 40, 0.005);
        this.pluckSfx(1174, t + 0.05, 0.25, 1.4); this.pluckSfx(1760, t + 0.12, 0.18, 1.4);
        return;
      }
      case 'spool': {       // 遁空梭蓄势（两息）：一声越绷越紧的嗡鸣往上走，到起步那一刻收住
        const d = o(); if (!d) return;
        this.tone('sine', 110, t, 2.1, 0.16, d, 330, 1.6); this.tone('triangle', 220, t, 2.1, 0.05, d, 880, 1.7);
        this.nz(t, 2.0, 0.06, d, 'bandpass', 400, 3000, 4, 1.5);
        this.pluckSfx(1568, t, 0.15, 1.0);
        return;
      }
      // —— 收官 P5：甬道里的飞剑
      case 'bladewarn': {   // 飞剑锁定：一声由高往低压下来的剑鸣，带点金属的颤音
        const d = o(); if (!d) return;
        this.tone('sine', 2900, t, 0.7, 0.06, d, 1500, 0.02); this.tone('sine', 2900 * 1.012, t, 0.7, 0.04, d, 1520, 0.02);
        this.nz(t, 0.45, 0.07, d, 'bandpass', 5200, 2600, 6, 0.03);
        this.pluckSfx(1760, t + 0.02, 0.18, 0.5);
        return;
      }
      case 'ambush': {      // 截道：一记沉鼓、一道由低往高抢上来的锐响（拦截的遁光），尾上一声短钹
        const d = o(); if (!d) return;
        this.drum(t, 0.7, d, 120, 45, 0.5); this.drum(t + 0.16, 0.5, d, 110, 42, 0.4);
        this.tone('sawtooth', 220, t + 0.05, 0.55, 0.05, d, 1400, 0.03);
        this.nz(t + 0.05, 0.5, 0.18, d, 'bandpass', 500, 4200, 2, 0.04);
        this.cymbal(t + 0.3, 0.12, d, 0.5);
        return;
      }
      case 'bladehit': {    // 打中：金铁一撞 + 闷响
        P(['metal1', 'metal2', 'metal3'], 0.5, rnd(0.75, 0.9), 0.05);
        const d = o(); if (!d) return;
        this.nz(t, 0.12, 0.5, d, 'bandpass', 2600, 900, 1.4, 0.002);
        this.tone('sine', 170, t, 0.4, 0.45, d, 55, 0.002);
        return;
      }
      // —— 兵器接进近战：挥（破风）和砍中，三种兵器各一套（合成，不加音频文件）
      case 'wswing_sword': {   // 剑：一声又细又亮的破风，尾上一丝剑鸣
        P(['swish1', 'swish2', 'swish3'], 0.3, rnd(1.25, 1.45), 0.04);
        const d = o(); if (!d) return;
        this.nz(t, 0.18, 0.16, d, 'bandpass', 2400, 6200, 3, 0.01);
        this.tone('sine', 2600, t + 0.03, 0.14, 0.022, d, 1900, 0.01);
        return;
      }
      case 'wswing_heavy': {   // 重兵：低沉的一抡，带着风压
        P(['swish1', 'swish2', 'swish3'], 0.5, rnd(0.55, 0.68), 0.06);
        const d = o(); if (!d) return;
        this.nz(t, 0.45, 0.3, d, 'bandpass', 180, 900, 1, 0.06);
        this.tone('sine', 92, t, 0.36, 0.12, d, 55, 0.04);
        return;
      }
      case 'wswing_spear': {   // 枪：短促尖利的一声「咻」
        P(['swish1', 'swish2', 'swish3'], 0.34, rnd(1.0, 1.15), 0.04);
        const d = o(); if (!d) return;
        this.nz(t, 0.14, 0.22, d, 'bandpass', 900, 3800, 2.5, 0.005);
        this.tone('sine', 1400, t, 0.08, 0.02, d, 2200, 0.004);
        return;
      }
      case 'whit_sword': {     // 剑砍中：利落的金属一划，余音发颤
        P(['metal1', 'metal2', 'metal3'], 0.3, rnd(1.3, 1.5), 0.04);
        const d = o(); if (!d) return;
        this.nz(t, 0.08, 0.3, d, 'highpass', 4000, 0, 0.8, 0.001);
        this.tone('sine', 3100, t, 0.28, 0.04, d, 2900, 0.002);
        return;
      }
      case 'whit_heavy': {     // 重兵砸中：一记闷响 + 碎裂声
        P(['thud'], 0.55, rnd(0.7, 0.8), 0.05);
        P(['crunch1', 'crunch2'], 0.35, rnd(0.8, 0.95), 0.05);
        const d = o(); if (!d) return;
        this.tone('sine', 120, t, 0.35, 0.5, d, 40, 0.002);
        this.nz(t, 0.25, 0.3, d, 'lowpass', 1200, 200, 0.8, 0.002);
        return;
      }
      // —— r7-fx3d：大招配音（和画面同一帧触发；有分量的都垫一层低频）
      case 'fx_charge': {      // 蓄力：低沉的嗡鸣渐强（0.9 息），底下一层越抬越高的气流声
        const d = o(); if (!d) return;
        this.tone('sine', 52, t, 1.05, 0.42, d, 104, 0.8); this.tone('triangle', 104, t, 1.0, 0.07, d, 230, 0.85);
        this.nz(t, 1.0, 0.22, d, 'lowpass', 180, 900, 0.9, 0.8);
        return;
      }
      case 'fx_launch': {      // 踩地起步：一记闷爆 + 碎石往后溅
        const d = o(); if (!d) return;
        this.drum(t, 1.0, d, 95, 34, 0.55);
        this.nz(t, 0.5, 0.55, d, 'lowpass', 1400, 140, 0.8, 0.002);
        for (let i = 0; i < 9; i++) this.nz(t + 0.03 + Math.random() * 0.3, 0.05, rnd(0.18, 0.4), d, 'bandpass', rnd(1500, 4200), 0, 2.2, 0.001);
        P(['st_gravel'], 0.45, rnd(0.8, 0.95), 0.05);
        return;
      }
      case 'fx_sonic': {       // 音障：尖锐的一声气爆，后面一道空气被撕开的嘶声往下沉
        const d = o(); if (!d) return;
        this.nz(t, 0.07, 0.85, d, 'highpass', 2800, 0, 0.7, 0.001);
        this.nz(t + 0.01, 0.42, 0.42, d, 'bandpass', 6500, 700, 1.4, 0.004);
        this.tone('sine', 1900, t, 0.22, 0.05, d, 260, 0.002);
        this.tone('sine', 85, t, 0.3, 0.35, d, 40, 0.002);
        return;
      }
      case 'fx_hit': {         // 重拳命中：一记闷响 + 爆裂
        const d = o(); if (!d) return;
        this.tone('sine', 150, t, 0.5, 1.0, d, 36, 0.001);
        this.nz(t, 0.32, 0.75, d, 'lowpass', 2800, 180, 0.8, 0.001);
        this.nz(t, 0.06, 0.6, d, 'bandpass', 1700, 0, 1.2, 0.001);
        P(['thud'], 0.6, rnd(0.6, 0.7), 0.04);
        return;
      }
      case 'fx_finisher': {    // 终结技再叠一声低频轰鸣（长、往下沉）
        const d = o(); if (!d) return;
        this.tone('sine', 50, t, 2.4, 0.85, d, 26, 0.004);
        this.tone('sine', 75, t, 1.4, 0.35, d, 38, 0.004);
        this.nz(t, 2.6, 0.6, d, 'lowpass', 420, 55, 0.8, 0.04);
        this.nz(t, 0.12, 0.7, d, 'highpass', 2200, 0, 0.7, 0.002);
        return;
      }
      case 'fx_warp': {        // 空间扭曲冲击波：低频「嗡」的一下
        const d = o(); if (!d) return;
        this.tone('sine', 72, t, 0.7, 0.5, d, 44, 0.03); this.tone('sine', 145, t, 0.55, 0.14, d, 88, 0.03);
        this.nz(t, 0.5, 0.12, d, 'bandpass', 260, 120, 3, 0.05);
        return;
      }
      case 'fx_blast': {       // 四层爆炸：爆裂 → 火焰呼啸 → 噼啪余烬
        const d = o(); if (!d) return;
        this.nz(t, 0.08, 0.9, d, 'highpass', 1800, 0, 0.7, 0.001);
        this.tone('sine', 110, t, 0.6, 0.85, d, 34, 0.001);
        this.nz(t, 0.6, 0.6, d, 'lowpass', 2200, 200, 0.8, 0.002);
        this.nz(t + 0.05, 1.0, 0.38, d, 'bandpass', 380, 1300, 0.9, 0.12);
        for (let i = 0; i < 14; i++) this.nz(t + 0.35 + Math.random() * 1.1, 0.03, rnd(0.15, 0.4), d, 'bandpass', rnd(1800, 5200), 0, 2, 0.001);
        return;
      }
      case 'fx_roar': {        // 往前喷的火龙：一股往前冲的火焰呼啸
        const d = o(); if (!d) return;
        this.nz(t, 0.9, 0.5, d, 'bandpass', 260, 1100, 0.8, 0.04);
        this.nz(t, 0.7, 0.3, d, 'lowpass', 700, 200, 0.7, 0.02);
        for (let i = 0; i < 8; i++) this.nz(t + 0.2 + Math.random() * 0.7, 0.03, rnd(0.12, 0.3), d, 'bandpass', rnd(2000, 5000), 0, 2, 0.001);
        return;
      }
      case 'fx_crash': {       // 落地砸坑：重落地 + 碎石哗啦往下落
        const d = o(); if (!d) return;
        this.drum(t, 1.1, d, 72, 26, 0.9);
        this.nz(t, 1.6, 0.7, d, 'lowpass', 900, 70, 0.8, 0.003);
        for (let i = 0; i < 18; i++) this.nz(t + 0.12 + Math.random() * 1.0, 0.06, rnd(0.15, 0.38), d, 'bandpass', rnd(900, 3800), 0, 1.6, 0.002);
        P(['st_gravel'], 0.55, rnd(0.65, 0.8), 0.05); P(['thud'], 0.7, rnd(0.5, 0.6), 0.05);
        return;
      }
      case 'whit_spear': {     // 枪扎中：「噗」的一下穿透，尖头一磕
        P(['metal1', 'metal2', 'metal3'], 0.26, rnd(1.6, 1.8), 0.04);
        const d = o(); if (!d) return;
        this.nz(t, 0.1, 0.32, d, 'bandpass', 1800, 700, 1.6, 0.001);
        this.tone('sine', 220, t, 0.15, 0.25, d, 90, 0.002);
        return;
      }
      case 'lock': {   // r11-lock：锁上目标——一记又短又脆的金属「嗒」（高通噪声 + 往下一沉的方波），尾上一声清亮的小拨弦；合成，不加音频文件
        const d = this.synthOut(undefined, undefined, 1, 0.12); if (!d) return;
        this.nz(t, 0.04, 0.3, d, 'highpass', 4200, 0, 0.9, 0.001);
        this.tone('square', 2100, t, 0.045, 0.045, d, 1300, 0.001);
        this.tone('sine', 990, t + 0.012, 0.11, 0.16, d, 740, 0.002);
        this.pluckSfx(1760, t + 0.035, 0.13, 0.5);
        return;
      }
    }
  }
  // ------------------------------------------------------------ r8-p2 撼山客第二阶段（赤阳罡、火焰腿法、两个觉醒大招）的配音：离线合成，和画面同一帧触发
  /**
   * p2_ignite 燃身起火（呼的一声火苗窜起 + 噼啪）、p2_flame 火焰呼啸（一甩火弧 / 火龙）、p2_cyclone 旋风（越转越尖的风啸 + 低频嗡）、
   * p2_kick 重踢的闷响（低频 + 皮肉的「啪」）、p2_blast 大爆（终结那一下：爆裂 + 低频轰 + 长尾）、p2_hum 霸体嗡鸣（低沉、渐强、带颤）、
   * p2_core 胸前光核蓄能（往上抬的嗡 + 高频的细鸣）、p2_slam 大字砸屏（极低的重鼓 + 一记钹）、p2_beam 横贯光线（撕裂的嘶 + 电流噼啪）、
   * p2_pillar 地里蹿出的火柱、p2_sun 赤日炸开（长、宽、往下沉的轰）、p2_blade 风刃（尖利的破风）、p2_ring 冲击光环（「嗡」地一胀）
   */
  p2(kind: P2Sfx, x?: number, y?: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime, d = this.synthOut(x, y, 1, 0.25); if (!d) return;
    switch (kind) {
      case 'p2_ignite':
        this.nz(t, 0.7, 0.55, d, 'bandpass', 220, 1400, 0.8, 0.03); this.tone('sine', 70, t, 0.6, 0.35, d, 120, 0.05);
        for (let i = 0; i < 10; i++) this.nz(t + 0.1 + Math.random() * 0.6, 0.03, rnd(0.15, 0.35), d, 'bandpass', rnd(1800, 5000), 0, 2, 0.001);
        return;
      case 'p2_flame':
        this.nz(t, 0.55, 0.6, d, 'bandpass', 300, 1500, 0.7, 0.02); this.nz(t, 0.4, 0.3, d, 'lowpass', 600, 180, 0.7, 0.01);
        this.tone('sine', 95, t, 0.35, 0.3, d, 50, 0.005);
        for (let i = 0; i < 6; i++) this.nz(t + 0.08 + Math.random() * 0.4, 0.03, rnd(0.12, 0.3), d, 'bandpass', rnd(2000, 5200), 0, 2, 0.001);
        return;
      case 'p2_cyclone':
        this.nz(t, 0.8, 0.55, d, 'bandpass', 400, 2600, 3, 0.1); this.nz(t + 0.05, 0.75, 0.35, d, 'bandpass', 900, 4200, 5, 0.12);
        this.tone('sawtooth', 70, t, 0.8, 0.08, d, 140, 0.1); this.tone('sine', 55, t, 0.8, 0.3, d, 90, 0.1);
        return;
      case 'p2_kick':
        this.tone('sine', 130, t, 0.38, 0.95, d, 40, 0.001); this.nz(t, 0.06, 0.8, d, 'bandpass', 1500, 0, 1, 0.001);
        this.nz(t, 0.25, 0.5, d, 'lowpass', 2200, 200, 0.8, 0.001);
        this.play(pick(['thud']), { x, y, vol: 0.55, rate: rnd(0.75, 0.85), gap: 0.03 });
        return;
      case 'p2_blast':
        this.nz(t, 0.09, 1, d, 'highpass', 1600, 0, 0.7, 0.001); this.tone('sine', 85, t, 1.1, 1, d, 26, 0.001); this.tone('sine', 140, t, 0.5, 0.45, d, 45, 0.001);
        this.nz(t, 1.4, 0.75, d, 'lowpass', 2600, 90, 0.8, 0.002); this.nz(t + 0.06, 1.2, 0.4, d, 'bandpass', 350, 1400, 0.8, 0.1);
        for (let i = 0; i < 18; i++) this.nz(t + 0.3 + Math.random() * 1.3, 0.03, rnd(0.15, 0.4), d, 'bandpass', rnd(1800, 5200), 0, 2, 0.001);
        return;
      case 'p2_hum':
        this.tone('sine', 46, t, 1.6, 0.55, d, 62, 0.6); this.tone('triangle', 92, t, 1.5, 0.1, d, 124, 0.6);
        { const o = this.tone('sine', 184, t, 1.5, 0.05, d, 250, 0.7); const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 9; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 1.6); }
        this.nz(t, 1.5, 0.18, d, 'lowpass', 200, 600, 0.9, 0.6);
        return;
      case 'p2_core':
        this.tone('sine', 220, t, 0.9, 0.18, d, 660, 0.4); this.tone('sine', 1760, t + 0.1, 0.8, 0.05, d, 2640, 0.4); this.tone('sine', 55, t, 0.9, 0.4, d, 110, 0.5);
        this.nz(t, 0.8, 0.12, d, 'bandpass', 3000, 6000, 6, 0.4);
        return;
      case 'p2_slam':
        this.drum(t, 1.2, d, 70, 24, 1.1); this.tone('sine', 38, t, 1.4, 0.9, d, 22, 0.002);
        this.cymbal(t + 0.01, 0.22, d, 0.9); this.nz(t, 0.08, 0.7, d, 'highpass', 2400, 0, 0.7, 0.001);
        return;
      case 'p2_beam':
        this.nz(t, 0.7, 0.55, d, 'bandpass', 5200, 1800, 1.5, 0.005); this.tone('sawtooth', 880, t, 0.6, 0.06, d, 220, 0.005);
        for (let i = 0; i < 14; i++) this.nz(t + Math.random() * 0.6, 0.02, rnd(0.2, 0.45), d, 'highpass', rnd(3000, 7000), 0, 1, 0.001);
        return;
      case 'p2_pillar':
        this.nz(t, 0.45, 0.6, d, 'bandpass', 200, 1800, 0.8, 0.01); this.tone('sine', 110, t, 0.3, 0.5, d, 45, 0.002);
        return;
      case 'p2_sun':
        this.nz(t, 0.12, 1, d, 'highpass', 1400, 0, 0.7, 0.002); this.tone('sine', 60, t, 2.4, 1, d, 24, 0.003); this.tone('sine', 120, t, 1.6, 0.4, d, 40, 0.003);
        this.nz(t, 2.4, 0.7, d, 'lowpass', 1800, 60, 0.8, 0.01); this.nz(t + 0.1, 1.8, 0.35, d, 'bandpass', 600, 2000, 0.8, 0.2);
        return;
      case 'p2_blade':
        this.nz(t, 0.3, 0.55, d, 'bandpass', 1200, 6000, 3, 0.005); this.tone('sine', 2400, t, 0.2, 0.05, d, 900, 0.005);
        return;
      case 'p2_ring':
        this.tone('sine', 70, t, 0.6, 0.6, d, 140, 0.01); this.tone('sine', 280, t, 0.4, 0.1, d, 560, 0.01); this.nz(t, 0.4, 0.25, d, 'bandpass', 500, 2000, 2, 0.02);
        return;
    }
  }
  // ------------------------------------------------------------ 撼山客第一阶段（r8-p1，照参考视频还原的十一招）的音效：独立一段，名字带 p1 前缀
  // 现有的采样（swish / punch / thud / crunch / rock…）叠合成的音（tone / nz / drum），不加音频文件。招式里经 world/p1fx.ts 的 X.sfx 调，和画面的命中时刻对齐
  p1(kind: P1Sfx, x?: number, y?: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const P = (n: string | readonly string[], vol = 0.6, rate = 1, gap = 0.02, rev = 0.15) =>
      (typeof n === 'string' ? this.play(n, { x, y, vol, rate, gap, rev }) : this.any(n, { x, y, vol, rate: rate * rnd(0.95, 1.05), gap, rev }));
    const d = this.synthOut(x, y, 1, 0.22); if (!d) return;
    switch (kind) {
      case 'p1swing': {       // 快的破风：短、尖
        P(['swish1', 'swish2', 'swish3'], 0.32, rnd(1.35, 1.55), 0.03);
        this.nz(t, 0.11, 0.2, d, 'bandpass', 2600, 6800, 3, 0.004);
        return;
      }
      case 'p1swingHeavy': {  // 重的破风：长、闷，带风压
        P(['swish1', 'swish2', 'swish3'], 0.5, rnd(0.6, 0.72), 0.04);
        this.nz(t, 0.32, 0.3, d, 'bandpass', 220, 1100, 1.1, 0.03);
        this.tone('sine', 95, t, 0.3, 0.14, d, 60, 0.03);
        return;
      }
      case 'p1hit': {         // 轻击：脆
        P(['punch1', 'punch2'], 0.5, rnd(1.15, 1.3), 0.02);
        this.nz(t, 0.05, 0.32, d, 'highpass', 3200, 0, 0.8, 0.001);
        this.tone('triangle', 1700, t, 0.05, 0.05, d, 900, 0.001);
        return;
      }
      case 'p1hitHeavy': {    // 重击：闷响 + 骨裂
        P(['punchm', 'punch1'], 0.7, rnd(0.75, 0.85), 0.03);
        P(['crunch1', 'crunch2'], 0.38, rnd(1.0, 1.2), 0.03);
        this.tone('sine', 150, t, 0.3, 0.5, d, 45, 0.001);
        this.nz(t, 0.18, 0.32, d, 'lowpass', 1600, 220, 0.8, 0.001);
        return;
      }
      case 'p1hitFin': {      // 终结一下：重击 + 一层低频（地都跟着一沉）
        P(['punchm'], 0.8, rnd(0.62, 0.7), 0.04);
        P(['crunch1', 'crunch2'], 0.45, rnd(0.8, 0.95), 0.04);
        P(['boom1', 'boom2'], 0.45, rnd(1.1, 1.25), 0.1, 0.3);
        this.drum(t, 0.75, d, 110, 34, 0.6);
        this.tone('sine', 62, t, 0.9, 0.55, d, 26, 0.002);
        this.nz(t, 0.35, 0.3, d, 'lowpass', 2400, 160, 0.7, 0.001);
        return;
      }
      case 'p1bash': {        // 肘击 / 靠击：沉闷的一撞
        P(['thud'], 0.75, rnd(0.6, 0.7), 0.04);
        P(['punchm'], 0.55, rnd(0.6, 0.68), 0.04);
        this.drum(t, 0.7, d, 95, 38, 0.45);
        this.nz(t, 0.22, 0.35, d, 'lowpass', 900, 150, 0.8, 0.002);
        return;
      }
      case 'p1dash': {        // 冲刺起步：一蹬地 + 扬土
        P(['thud'], 0.42, rnd(1.05, 1.2), 0.04);
        P(['st_gravel', 'st_grass1'], 0.4, rnd(0.8, 0.95), 0.04);
        this.nz(t, 0.3, 0.2, d, 'bandpass', 500, 1800, 1, 0.01);
        return;
      }
      case 'p1blink': {       // 闪步 / 残影：短促的「咻」
        this.tone('sine', 1500, t, 0.09, 0.07, d, 3600, 0.002);
        this.nz(t, 0.1, 0.22, d, 'bandpass', 2400, 7000, 4, 0.002);
        return;
      }
      case 'p1armor': {       // 霸体：金属嗡鸣（几根略错开的音一起颤）
        P(['metalh', 'metal2'], 0.35, rnd(0.55, 0.62), 0.1, 0.4);
        [196, 294, 392, 589].forEach((f, i) => { this.tone('sine', f, t, 1.4, 0.07 / (i + 1), d, f * 1.002, 0.08); this.tone('sine', f * 1.006, t, 1.4, 0.05 / (i + 1), d, f * 1.008, 0.08); });
        this.nz(t, 0.6, 0.05, d, 'bandpass', 3000, 4200, 8, 0.1);
        return;
      }
      case 'p1slide': {       // 倒地滑行：拖地声
        P(['st_gravel'], 0.4, rnd(0.7, 0.8), 0.05);
        this.nz(t, 0.45, 0.24, d, 'lowpass', 900, 180, 0.9, 0.02);
        return;
      }
      case 'p1charge': {      // 蓄劲：一声往上绷的低鸣
        this.tone('sine', 140, t, 0.45, 0.16, d, 420, 0.06);
        this.nz(t, 0.4, 0.08, d, 'bandpass', 400, 2400, 3, 0.2);
        return;
      }
      case 'p1boom': {        // 四层爆炸：轰 + 火
        P(['boom1', 'boom2'], 0.7, rnd(0.8, 0.95), 0.08, 0.35);
        this.tone('sine', 85, t, 0.8, 0.5, d, 30, 0.002);
        this.crackle(x, y, 0.35, 6);
        return;
      }
    }
  }
  // ------------------------------------------------------------ r9-hitfeel 全游戏打击感的音效：独立一段，名字带 hf 前缀
  // 现有采样（punch / crunch / knife / metal / rock / ice / boom…）叠合成的音，不加音频文件。world/hitfeel.ts 在画面出来的同一帧调（同一帧多次命中先合并、再限流）
  hf(kind: HfSfx, x?: number, y?: number, vol = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime, v = clamp(vol, 0.2, 1);   // 合并的几下不再往上加音量（叠成爆音）；响不响交给次数限流
    const P = (n: string | readonly string[], vv = 0.6, rate = 1, gap = 0.02, rev = 0.15) =>
      (typeof n === 'string' ? this.play(n, { x, y, vol: vv * v, rate, gap, rev, key: 'hf' + kind }) : this.any(n, { x, y, vol: vv * v, rate: rate * rnd(0.95, 1.05), gap, rev, key: 'hf' + kind }));
    const d = this.synthOut(x, y, v, 0.18); if (!d) return;
    switch (kind) {
      // 命中：轻（脆的一下）/ 重（闷响 + 骨裂）/ 终（重击 + 地都一沉的低频）
      case 'hfLight': P(['punch1', 'punch2', 'hit1', 'hit2'], 0.42, rnd(1.15, 1.32)); this.nz(t, 0.045, 0.26, d, 'highpass', 3000, 0, 0.8, 0.001); this.tone('triangle', 1500, t, 0.04, 0.04, d, 800, 0.001); return;
      case 'hfHeavy': P(['punchm', 'punch1'], 0.66, rnd(0.76, 0.86), 0.03); P(['crunch1', 'crunch2'], 0.3, rnd(1.0, 1.2), 0.03); this.tone('sine', 140, t, 0.26, 0.42, d, 46, 0.001); this.nz(t, 0.16, 0.28, d, 'lowpass', 1500, 220, 0.8, 0.001); return;
      case 'hfFin': P(['punchm'], 0.78, rnd(0.6, 0.68), 0.05); P(['boom1', 'boom2'], 0.5, rnd(1.05, 1.2), 0.1, 0.3); this.drum(t, 0.7, d, 105, 32, 0.6); this.tone('sine', 58, t, 0.9, 0.5, d, 26, 0.002); this.nz(t, 0.3, 0.28, d, 'lowpass', 2400, 160, 0.7, 0.001); return;
      // 兵器：剑（金属的一声细「嚓」）、重兵（钝的一砸 + 碎石）、枪（一下扎透的「噗」+ 尖鸣）
      case 'hfSword': P(['knife', 'metal1', 'metal3'], 0.4, rnd(1.25, 1.45)); this.nz(t, 0.09, 0.22, d, 'bandpass', 5200, 9000, 4, 0.001); return;
      case 'hfSwordHeavy': P(['knife'], 0.55, rnd(0.95, 1.05)); P(['metalh', 'metal2'], 0.32, rnd(1.1, 1.25), 0.03, 0.25); this.nz(t, 0.16, 0.3, d, 'bandpass', 4200, 9000, 3, 0.001); this.tone('sine', 120, t, 0.2, 0.28, d, 50, 0.001); return;
      case 'hfBlunt': P(['woodh', 'thud', 'chop'], 0.55, rnd(0.8, 0.95)); this.tone('sine', 110, t, 0.18, 0.3, d, 50, 0.001); return;
      case 'hfBluntHeavy': P(['thud'], 0.7, rnd(0.6, 0.7), 0.03); P(['rock1', 'rock2'], 0.45, rnd(0.9, 1.1), 0.03); this.drum(t, 0.65, d, 90, 32, 0.45); this.nz(t, 0.24, 0.3, d, 'lowpass', 1000, 140, 0.8, 0.001); return;
      case 'hfSpear': P(['punch2', 'hit3'], 0.45, rnd(1.35, 1.5)); this.nz(t, 0.07, 0.24, d, 'bandpass', 2600, 7600, 5, 0.001); this.tone('sine', 2100, t, 0.06, 0.04, d, 3400, 0.001); return;
      case 'hfSpearHeavy': P(['punchm'], 0.6, rnd(1.0, 1.1), 0.03); P(['knife'], 0.4, rnd(0.8, 0.9), 0.03); this.nz(t, 0.18, 0.3, d, 'bandpass', 1800, 7000, 3, 0.001); this.tone('sine', 150, t, 0.22, 0.3, d, 55, 0.001); return;
      // 你挨打：闷一下（重的再带一声低频）
      case 'hfHurt': P(['hit4', 'hit5', 'hit6'], 0.5, rnd(0.85, 1.0)); this.nz(t, 0.08, 0.2, d, 'lowpass', 1800, 400, 0.8, 0.001); return;
      case 'hfHurtHeavy': P(['punchm'], 0.62, rnd(0.7, 0.8), 0.04); P(['crunch1', 'crunch2'], 0.3, rnd(0.85, 1.0), 0.04); this.tone('sine', 90, t, 0.4, 0.4, d, 34, 0.002); return;
      // 爆炸：各系各一种（轰的底子相同，上面叠本系的质感）
      case 'hfPop': P(['hit1', 'hit2', 'hit3'], 0.35, rnd(0.7, 0.85)); this.nz(t, 0.14, 0.22, d, 'lowpass', 2200, 300, 0.8, 0.001); return;
      case 'hfBoomFire': P(['boom1', 'boom2'], 0.62, rnd(0.85, 1.0), 0.06, 0.3); this.tone('sine', 80, t, 0.7, 0.42, d, 30, 0.002); this.crackle(x, y, 0.3 * v, 6); return;
      case 'hfBoomGold': P(['boom1', 'boom2'], 0.5, rnd(1.0, 1.15), 0.06, 0.3); P(['metalh', 'bell2'], 0.22, rnd(1.3, 1.6), 0.08, 0.5); this.tone('sine', 95, t, 0.5, 0.35, d, 40, 0.002); return;
      case 'hfBoomFrost': P(['ice1', 'ice2', 'icem'], 0.6, rnd(0.85, 1.0), 0.05, 0.35); P(['glass1', 'glass2'], 0.32, rnd(1.0, 1.2), 0.05); this.tone('sine', 110, t, 0.4, 0.3, d, 50, 0.002); this.nz(t, 0.5, 0.16, d, 'highpass', 5000, 0, 0.7, 0.01); return;
      case 'hfBoomVenom': P(['goo', 'slime'], 0.55, rnd(0.65, 0.8), 0.05, 0.25); P(['boom1', 'boom2'], 0.3, rnd(1.2, 1.35), 0.06); this.nz(t, 0.6, 0.2, d, 'bandpass', 700, 300, 1.5, 0.02); return;
      case 'hfBoomThunder': this.crack(x, y, 0.75 * v, 0.35); P(['boom1', 'boom2'], 0.35, rnd(1.15, 1.3), 0.06); return;
      case 'hfBoomInk': P(['shade1', 'shade2', 'shade3'], 0.5, rnd(0.6, 0.75), 0.06, 0.5); P(['boom1', 'boom2'], 0.4, rnd(0.7, 0.8), 0.06, 0.3); this.tone('sine', 60, t, 0.8, 0.4, d, 28, 0.004); return;
      case 'hfBoomVoid': this.tone('sine', 420, t, 0.35, 0.18, d, 60, 0.002); this.tone('sine', 70, t, 0.7, 0.4, d, 140, 0.004); this.nz(t, 0.4, 0.24, d, 'bandpass', 3000, 300, 2, 0.003); P(['boom1', 'boom2'], 0.3, rnd(1.3, 1.5), 0.06, 0.4); return;
      case 'hfBoomEarth': P(['rock1', 'rock2'], 0.62, rnd(0.75, 0.9), 0.05); P(['boom1', 'boom2'], 0.45, rnd(0.8, 0.9), 0.06, 0.25); this.drum(t, 0.6, d, 80, 30, 0.5); return;
      case 'hfBoomWind': P(['swish1', 'swish2', 'swish3'], 0.5, rnd(0.55, 0.7), 0.05, 0.3); this.nz(t, 0.5, 0.28, d, 'bandpass', 400, 1600, 1, 0.02); this.tone('sine', 90, t, 0.4, 0.2, d, 45, 0.004); return;
    }
  }
  private pluckSfx(f: number, t: number, v: number, d: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.3, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + d + 0.05);
  }

  /** r7-fx3d：火尾的持续燃烧呼啸（world/fx3d.ts 的 fire 每帧报一次；k 0‥2 火势；不报了 0.2 息内淡出） */
  private burns = new Map<string, { src: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode; seen: number }>();
  burn(key: string, k: number, x?: number, y?: number) {
    if (!this.ctx || !this.enabled) return;
    const c = this.ctx, now = c.currentTime;
    let b = this.burns.get(key);
    if (!b) {
      if (this.burns.size >= 4) return;
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6; g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.out(1, 0, 0.12)); src.start(now, Math.random() * 1.5);
      b = { src, g, f, seen: now }; this.burns.set(key, b);
    }
    const s = x === undefined ? [1] : this.spatial(x, y ?? this.ly);
    const v = s ? s[0] * Math.min(1, k * 0.6) * 0.32 : 0;
    b.g.gain.setTargetAtTime(v, now, 0.05); b.f.frequency.setTargetAtTime(320 + 380 * Math.min(2, k), now, 0.1);
    b.seen = now;
  }
  private burnTick() {
    if (!this.burns.size || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [k, b] of this.burns) {
      if (now - b.seen < 0.12) continue;
      b.g.gain.setTargetAtTime(0, now, 0.06);
      if (now - b.seen > 0.6) { try { b.src.stop(); } catch { /* */ } b.src.disconnect(); this.burns.delete(k); }
    }
  }

  // ------------------------------------------------------------ r16 噬魂魔尊 · 夜无赦的配音：独立一段，名字带 yws_ 前缀；现合成（tone / nz / drum / cymbal），不加音频文件
  /**
   * yws_slash 魂镰挥砍（厚重的破风 + 金属的「铮」）、yws_hit 镰刃入肉（闷 + 撕裂）、yws_heavy 重砸（低频轰 + 碎石）、yws_dark 魔气（低沉的嗡、带颤、往下沉）、
   * yws_soul 噬魂（高处一缕往下拧的鸣 + 呜咽的风）、yws_claw 魔爪（三道撕裂）、yws_spike 石柱拔地（岩石崩裂 + 往上冲的嘶）、yws_gate 鬼门开（远处的钟 + 旋涡的风）、
   * yws_roar 魔啸（极低的咆哮 + 失真的锯齿）、yws_morph 变身（越来越重的心跳 + 炸开）、yws_wheel 劫轮转（越转越尖）、yws_shadow 魔影（一闪的气音）、
   * yws_big 觉醒大招的落锤（极低的重鼓 + 钹 + 长尾）、yws_tele 读条（往上抬的不祥长音）
   */
  private ywsSeed = 0x9e3779b9;
  private ywsR(a: number, b: number) { this.ywsSeed = (Math.imul(this.ywsSeed, 1664525) + 1013904223) >>> 0; return a + (this.ywsSeed / 4294967296) * (b - a); }
  yws(kind: YwsSfx, x?: number, y?: number) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime, d = this.synthOut(x, y, 1, 0.3); if (!d) return;
    const R = (a: number, b: number) => this.ywsR(a, b);
    switch (kind) {
      case 'yws_slash':
        this.nz(t, 0.28, 0.6, d, 'bandpass', 700, 3800, 1.6, 0.004); this.nz(t, 0.18, 0.35, d, 'lowpass', 900, 200, 0.7, 0.002);
        this.tone('triangle', R(1900, 2300), t + 0.04, 0.35, 0.05, d, 1400, 0.002); this.tone('sine', 110, t, 0.2, 0.25, d, 60, 0.002);
        return;
      case 'yws_hit':
        this.tone('sine', 120, t, 0.3, 0.85, d, 42, 0.001); this.nz(t, 0.07, 0.75, d, 'bandpass', 1300, 0, 1, 0.001);
        this.nz(t + 0.01, 0.22, 0.4, d, 'bandpass', 2600, 900, 2, 0.002);
        return;
      case 'yws_heavy':
        this.drum(t, 1, d, 90, 28, 0.9); this.tone('sine', 52, t, 0.9, 0.8, d, 24, 0.002); this.nz(t, 0.6, 0.55, d, 'lowpass', 1800, 120, 0.8, 0.002);
        for (let i = 0; i < 8; i++) this.nz(t + 0.05 + R(0, 0.4), 0.04, R(0.12, 0.3), d, 'bandpass', R(700, 2600), 0, 2, 0.001);
        return;
      case 'yws_dark':
        this.tone('sawtooth', 58, t, 1.1, 0.12, d, 38, 0.15); this.tone('sine', 44, t, 1.2, 0.5, d, 30, 0.2);
        { const o = this.tone('sine', 176, t, 1.0, 0.06, d, 120, 0.3); const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 7; lg.gain.value = 14; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 1.1); }
        this.nz(t, 1.0, 0.2, d, 'lowpass', 500, 160, 0.9, 0.2);
        return;
      case 'yws_soul':
        this.tone('sine', 1320, t, 0.8, 0.07, d, 420, 0.05); this.tone('sine', 1980, t + 0.05, 0.6, 0.04, d, 700, 0.05);
        this.nz(t, 0.9, 0.3, d, 'bandpass', 900, 300, 4, 0.2);
        return;
      case 'yws_claw':
        for (let i = 0; i < 3; i++) { this.nz(t + i * 0.045, 0.16, 0.5, d, 'bandpass', 2400 - i * 400, 900, 2.5, 0.002); this.tone('sine', 140 - i * 15, t + i * 0.045, 0.16, 0.3, d, 60, 0.001); }
        return;
      case 'yws_spike':
        this.nz(t, 0.08, 0.8, d, 'highpass', 1500, 0, 0.7, 0.001); this.drum(t, 0.7, d, 120, 40, 0.5);
        this.nz(t, 0.5, 0.45, d, 'bandpass', 300, 2200, 0.9, 0.01);
        for (let i = 0; i < 6; i++) this.nz(t + 0.04 + R(0, 0.3), 0.04, R(0.15, 0.3), d, 'bandpass', R(900, 2400), 0, 2, 0.001);
        return;
      case 'yws_gate':
        this.gong(t, 0.35, 74, d); this.nz(t, 1.4, 0.35, d, 'bandpass', 250, 900, 3, 0.3); this.tone('sine', 37, t, 1.5, 0.45, d, 30, 0.3);
        return;
      case 'yws_roar':
        this.tone('sawtooth', 62, t, 1.3, 0.22, d, 40, 0.06); this.tone('sawtooth', 93, t, 1.2, 0.12, d, 55, 0.06); this.tone('sine', 34, t, 1.5, 0.7, d, 26, 0.05);
        this.nz(t, 1.3, 0.5, d, 'lowpass', 900, 250, 1.2, 0.05);
        return;
      case 'yws_morph':
        for (let i = 0; i < 4; i++) this.drum(t + i * (0.32 - i * 0.05), 0.4 + i * 0.18, d, 70, 30, 0.35);
        this.tone('sine', 40, t + 0.8, 1.6, 0.9, d, 24, 0.002); this.nz(t + 0.8, 1.2, 0.8, d, 'lowpass', 2400, 90, 0.8, 0.002); this.cymbal(t + 0.8, 0.2, d, 1.2);
        return;
      case 'yws_wheel':
        this.nz(t, 0.9, 0.45, d, 'bandpass', 500, 3600, 4, 0.08); this.tone('sawtooth', 90, t, 0.9, 0.07, d, 300, 0.08); this.tone('sine', 60, t, 0.9, 0.3, d, 110, 0.08);
        return;
      case 'yws_shadow':
        this.nz(t, 0.16, 0.4, d, 'bandpass', 1800, 600, 3, 0.002); this.tone('sine', 520, t, 0.14, 0.05, d, 180, 0.002);
        return;
      case 'yws_big':
        this.drum(t, 1.3, d, 64, 22, 1.3); this.tone('sine', 32, t, 2.2, 1, d, 20, 0.002); this.tone('sine', 96, t, 1, 0.4, d, 36, 0.002);
        this.cymbal(t + 0.01, 0.28, d, 1.6); this.nz(t, 2, 0.7, d, 'lowpass', 2600, 70, 0.8, 0.002);
        for (let i = 0; i < 16; i++) this.nz(t + 0.2 + R(0, 1.4), 0.03, R(0.12, 0.35), d, 'bandpass', R(1500, 5200), 0, 2, 0.001);
        return;
      case 'yws_tele':
        this.tone('sine', 80, t, 1.4, 0.4, d, 160, 0.4); this.tone('triangle', 240, t, 1.3, 0.06, d, 480, 0.5); this.nz(t, 1.3, 0.18, d, 'bandpass', 1200, 4000, 5, 0.6);
        return;
    }
  }
  /** 每帧由 game.update 末尾调用 */
  tick(g: any, dt: number) {
    if (!this.ctx) return;
    this.burnTick();
    try { this.dir.tick(g, dt); } catch (e) { if ((globalThis as any).__TAIXU_DEV) console.warn(e); }
  }
}

/** r8-p2 撼山客第二阶段的音效名 */
export type P2Sfx = 'p2_ignite' | 'p2_flame' | 'p2_cyclone' | 'p2_kick' | 'p2_blast' | 'p2_hum' | 'p2_core' | 'p2_slam' | 'p2_beam' | 'p2_pillar' | 'p2_sun' | 'p2_blade' | 'p2_ring';
/** r16 噬魂魔尊 · 夜无赦的音效名 */
export type YwsSfx = 'yws_slash' | 'yws_hit' | 'yws_heavy' | 'yws_dark' | 'yws_soul' | 'yws_claw' | 'yws_spike' | 'yws_gate' | 'yws_roar' | 'yws_morph' | 'yws_wheel' | 'yws_shadow' | 'yws_big' | 'yws_tele';
export const audio = new AudioEngine();
if (typeof window !== 'undefined') (window as unknown as { __taixuAudio?: AudioEngine }).__taixuAudio = audio;   // 录像脚本从这里取声音
if (typeof window !== 'undefined') (window as any).__audio = audio;
export type { AudioEngine };
