// v0.70：问道残卷 · 观招篇——看人出手便能偷学。
// 与修士斗法时，对方每施展一式都会在残卷上留下一点「领悟」：
//   看见（神识之内）+1 · 挨上一记 +2 · 躲开一记 +3（同一次出手各记一次）
// 攒满所需领悟即学会；三成起残卷上显出「残影」，可以先用，威力五折（残篇）；满了是「全篇」。
// 所需领悟按品阶：黄阶 6 · 玄阶 15 · 地阶 35 · 天阶 80；同一个人身上最多学到四成（逼你去跟不同的人交手）。
// 境界不够也能学，只是境界差一阶威力减半、差两阶以上只剩两成五（天阶神通到元婴才完全发挥）。
// 学会的功法记在 hero.arts 里，id 为 cj_<招式 id>；招式表在启动时由各派招式自动转成玩家功法（ARTS）。
import type { Game } from './game';
import type { Enemy } from './combat';
import type { FoeSkill, El } from './foeskills';
import { EL_COL } from './foeskills';
import { allSchoolSkills } from './schools';
import { ARTS, TIER_NAME, type ArtSkill, type Cast, type Fx, type School } from '../data/arts';
import { REALMS } from '../data/realms';
import { audio } from './audio';

export const CJ_NEED = [6, 6, 15, 35, 80];
const PER_SRC = 0.4, SHOW = 0.3;
/** 学不来的：护体、服丹、召唤、出窍、化形这类不是「功法」的招 */
const NOT_ART = new Set(['guard', 'heal', 'summon', 'ying']);
const NOT_ID = new Set(['h_pill', 'h_guard', 'yy_out', 'yy_fury', 'h_big']);

const EL_SCHOOL: Record<El, School> = { fire: '火', ice: '冰', water: '冰', thunder: '雷', wind: '风', earth: '土', poison: '木', sword: '剑', metal: '剑', gold: '神', blood: '魔', ghost: '魔', phys: '体' };
const EL_FX: Record<El, [Fx, Fx]> = {   // [弹道类, 范围类]
  fire: ['fireball', 'flame'], ice: ['icicle', 'frost'], water: ['water', 'water'], thunder: ['lightning', 'lightning'], wind: ['wind', 'tornado'],
  earth: ['rock', 'rock'], poison: ['leaf', 'vine'], sword: ['sword', 'bigsword'], metal: ['needle', 'sword'], gold: ['gold', 'gold'],
  blood: ['blood', 'blood'], ghost: ['ghost', 'ghost'], phys: ['palm', 'palm'],
};
const tierOf = (realm: number) => (realm <= 1 ? 1 : realm >= 4 ? 4 : realm) as 1 | 2 | 3 | 4;
const MP = [0.05, 0.07, 0.12, 0.17, 0.26];

interface Src { sk: FoeSkill; realm: number; sect: string }
const SRC = new Map<string, Src>();
for (const x of allSchoolSkills()) if (!NOT_ART.has(x.sk.k) && !NOT_ID.has(x.sk.id) && !x.sk.hx && !SRC.has(x.sk.id)) SRC.set(x.sk.id, { sk: x.sk, realm: x.realm, sect: x.sect });

/** 把一式 AI 招式转成玩家功法 */
function toArt(id: string, s: Src): ArtSkill {
  const k = s.sk, el = k.el, tier = tierOf(s.realm), [fxB, fxA] = EL_FX[el];
  const pw = (k.pow ?? 1.5) * (1 + tier * 0.1);
  let cast: Cast = 'burst', fx: Fx = fxA, o: Partial<ArtSkill> = {};
  switch (k.k) {
    case 'salvo': cast = 'fan'; fx = fxB; o = { count: Math.min(7, (k.n ?? 1) * (k.waves ?? 1)), speed: 760, power: pw }; break;
    case 'lines': cast = 'fan'; fx = fxB; o = { count: Math.min(7, k.n ?? 3), speed: 900, pierce: true, power: pw }; break;
    case 'spiral': cast = 'fan'; fx = fxB; o = { count: Math.min(9, (k.n ?? 3) * 2), speed: 700, power: pw * 0.8 }; break;
    case 'ring': case 'nova': case 'roar': cast = 'nova'; o = { radius: Math.min(320, k.r ?? 200), power: pw }; break;
    case 'circle': if (k.pool) { cast = 'field'; o = { radius: Math.min(300, k.r ?? 150), dur: Math.min(8, k.pool + 2), power: pw * 0.35 }; } else { cast = 'burst'; o = { radius: Math.min(240, k.r ?? 120), power: pw }; } break;
    case 'rain': cast = 'strike'; o = { count: Math.min(12, k.n ?? 5), radius: Math.min(120, k.r ?? 85), power: pw * 0.85 }; break;
    case 'march': cast = 'strike'; o = { count: Math.min(10, k.n ?? 5), radius: Math.min(120, k.r ?? 80), power: pw * 0.8 }; break;
    case 'track': cast = 'strike'; o = { count: Math.min(6, k.waves ?? 3), radius: Math.min(120, k.r ?? 88), power: pw * 0.9 }; break;
    case 'cone': cast = 'cone'; o = { radius: Math.min(1.2, k.spread ?? 0.6), power: pw }; break;
    case 'beam': cast = 'beam'; fx = el === 'sword' ? 'bigsword' : fxA; o = { radius: Math.max(20, Math.min(80, (k.w ?? 60) / 2)), power: pw * 1.2 }; break;
    case 'charge': case 'leap': cast = 'dash'; fx = fxA; o = { power: pw }; break;
    case 'blink': cast = 'blink'; o = { power: 0 }; break;
    case 'fury': cast = 'buff'; o = { power: 0, dur: Math.min(12, k.dur ?? 8), buff: { atk: 0.25, speed: 0.1 } }; break;
  }
  const range = k.k === 'beam' ? Math.min(900, k.len ?? 600) : k.k === 'cone' ? Math.min(420, k.r ?? 220) : Math.min(860, Math.max(220, k.range ?? 520));
  return {
    id, name: k.name, school: EL_SCHOOL[el], tier, realm: 0, cast, fx, mp: MP[tier], cd: Math.max(1.5, Math.round(k.cd * 0.8 * 10) / 10), power: 1.5, range,
    status: k.status, color: EL_COL[el],
    desc: `问道残卷观招所得——${s.sect ? s.sect + '的' : ''}${TIER_NAME[tier]}${k.ult ? '大招' : '功法'}「${k.name}」，看人施展多了，自己也琢磨出了门道。`,
    evo: ['出手更稳', '威力渐长', '已得其中真意'], ...o,
  } as ArtSkill;
}
/** 启动时就把能学的全部登记进功法表（存档里学会的 cj_ 功法读档即可用） */
for (const [sid, s] of SRC) { const id = 'cj_' + sid; if (!ARTS[id]) ARTS[id] = toArt(id, s); }

export interface CjState { p: Record<string, number>; got: string[] }
type Tok = { seen?: boolean; hit?: boolean; dodge?: boolean };

export class CanJuan {
  game: Game;
  constructor(g: Game) { this.game = g; }
  get S(): CjState { const ws = this.game.ws as any; return (ws.canjuan ??= { p: {}, got: [] }); }
  /** 有残卷才学得会（序章没走完、还没捡到残卷时不算） */
  get owned() { return this.game.hero.bottle?.owned !== false; }
  need(sid: string) { const s = SRC.get(sid); return s ? CJ_NEED[tierOf(s.realm)] : 0; }
  learnable(e: Enemy, sk: FoeSkill) { return e.def.kind === 'human' && SRC.has(sk.id); }
  /** 当前进度 0~1 */
  prog(sid: string) { const n = this.need(sid); return n ? Math.min(1, (this.S.p[sid] ?? 0) / n) : 0; }

  /** 对方起手：在神识之内看见了 */
  onCast(e: Enemy, sk: FoeSkill, tok: Tok) {
    if (!this.owned || tok.seen || !this.learnable(e, sk) || e.ally) return;
    const p = this.game.player, d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > Math.min(1100, this.game.senseRadius * 1.4)) return;
    tok.seen = true; this.add(e, sk, 1);
  }
  onHit(e: Enemy | undefined, sid: string | undefined, tok: Tok | undefined) {
    if (!e || !sid || !tok || tok.hit || !this.owned) return;
    const sk = SRC.get(sid)?.sk; if (!sk || !this.learnable(e, sk)) return;
    tok.hit = true; this.add(e, sk, 2);
  }
  onDodge(e: Enemy | undefined, sid: string | undefined, tok: Tok | undefined) {
    if (!e || !sid || !tok || tok.dodge || tok.hit || !this.owned) return;
    const sk = SRC.get(sid)?.sk; if (!sk || !this.learnable(e, sk)) return;
    tok.dodge = true; this.add(e, sk, 3);
  }

  private add(e: Enemy, sk: FoeSkill, pts: number) {
    const st = this.S, sid = sk.id, need = this.need(sid);
    if (!need || st.got.includes(sid)) return;
    // 同一个人身上最多学到四成
    const given: Record<string, number> = ((e as any)._cj ??= {});
    const room = need * PER_SRC - (given[sid] ?? 0);
    const add = Math.min(pts, room);
    if (add <= 0) { if (!(e as any)._cjCap) { (e as any)._cjCap = true; this.game.toast(`「${sk.name}」从${e.name || '此人'}身上已学不到更多了——找别人再看看。`, 'info'); } return; }
    given[sid] = (given[sid] ?? 0) + add;
    const before = (st.p[sid] ?? 0) / need;
    st.p[sid] = Math.min(need, (st.p[sid] ?? 0) + add);
    const after = st.p[sid] / need;
    const g = this.game, id = 'cj_' + sid;
    if (before < SHOW && after >= SHOW && after < 1) {
      this.give(id);
      g.toast(`问道残卷上浮现出「${sk.name}」的残影——已能勉强施展（残篇，威力五折）。`, 'good');
      audio.sfx('chime');
    }
    if (after >= 1) {
      st.got.push(sid); this.give(id);
      g.toast(`问道残卷：「${sk.name}」全篇显现，你已尽得其妙！`, 'good');
      g.news(`苏寒观人斗法，悟得一门${TIER_NAME[tierOf(SRC.get(sid)!.realm)]}功法「${sk.name}」。`, 'personal');
      audio.sfx('chime');
      g.combat?.vfx.push({ kind: 'ring', x: g.player.x, y: g.player.y, r: 200, t: 0, dur: 1, color: '230,200,120' } as any);
    }
  }
  /** 放进法术书（有空的快捷栏位就顺手放上） */
  private give(id: string) {
    const h = this.game.hero;
    if (h.arts.some((a) => a.id === id)) return;
    h.arts.push({ id, xp: 0 });
    const k = h.hotbar.findIndex((x) => x === null);
    if (k >= 0) h.hotbar[k] = id;
  }
  /** 施展残卷功法时的威力倍率：残篇五折；境界差一阶减半、差两阶以上两成五 */
  powMul(id: string): number {
    if (!id.startsWith('cj_')) return 1;
    const sid = id.slice(3), s = SRC.get(sid); if (!s) return 1;
    const full = this.S.got.includes(sid) ? 1 : 0.5;
    const gap = Math.min(4, s.realm) - this.game.hero.realm;
    return full * (gap <= 0 ? 1 : gap === 1 ? 0.5 : 0.25);
  }
  /** 法术书「问道残卷」页的条目 */
  list() {
    const st = this.S;
    return Object.keys(st.p).map((sid) => {
      const s = SRC.get(sid)!; const need = this.need(sid), v = st.p[sid] ?? 0;
      return { sid, id: 'cj_' + sid, name: s.sk.name, sect: s.sect, tier: tierOf(s.realm), realmName: REALMS[Math.min(4, s.realm)]?.name ?? '', v, need, prog: Math.min(1, v / need), got: st.got.includes(sid) };
    }).filter((x) => x.need).sort((a, b) => +b.got - +a.got || b.prog - a.prog);
  }
}
