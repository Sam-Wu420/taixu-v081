// 第十五步：妖王血条（八级以上妖兽交战时，屏幕上方的大血条）
// 收官 H3：排进顶栏堆叠（GameView 的 .hz-top）；血条、残影、蓄力条都改成 scaleX（原来每帧改 width，带 width 过渡）
// r11-lock：锁定目标的大血条也走这一套（同一份样式、同一个组件，原来的小目标框 TargetFrame 不再挂）——
//   · 锁定的就是首领：只出首领这一条，条头多一枚「锁」印，条下多一行罡气 / 状态；
//   · 锁定的不是首领、首领又在打：首领条收成窄的一条在上，锁定目标的大条在下（同在顶栏堆叠里，按顺序排，不互相压）；
//   · 锁定目标的条：态度印（敌 / 中 / 友，颜色同脚下的锁定环）、名字、境界 / 阶数、气血大条（掉血时残影条停一下再跟上）、
//     近战交手时的罡气条、身上的状态（燃烧、中毒……，剩几息）和护体灵光、精英词缀。
//   动效只动 transform / opacity；数值每帧走 rAF 直接改 transform，罡气 / 状态这一行每 150 毫秒重渲染一次。
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Game } from '../world/game';
import type { Enemy } from '../world/combat';
import { STATUS_NAME } from '../data/arts';
import { AFFIX } from '../world/affix';
import { lockStance, LOCK_NAME } from '../world/locktarget';
import { hpfx, newWatch, watchHp, type HpWatch } from './hpfx';   // r11-lock：血条打击感

/** 正在打的首领：八级以上、交上手、两千二以内；已经挂着的那位离开两千六、脱战、死了才放掉 */
export function pickBoss(game: Game, prev: Enemy | null): Enemy | null {
  const p = game.player;
  if (prev && !prev.dead && prev.aggro && Math.hypot(prev.x - p.x, prev.y - p.y) <= 2600) return prev;
  for (const e of game.combat.enemies) if (!e.dead && e.blv >= 8 && e.aggro && Math.hypot(e.x - p.x, e.y - p.y) < 2200) return e;
  return null;
}
/** 锁定目标条要不要单独出：有锁定、没死、不是正挂着的首领 */
export function lockBarTarget(game: Game, boss: Enemy | null): Enemy | null {
  const L = game.combat.lock;
  return L && !L.dead && L !== boss ? L : null;
}

type Refs = { name: RefObject<HTMLSpanElement | null>; rank: RefObject<HTMLSpanElement | null>; pct: RefObject<HTMLSpanElement | null>; fill: RefObject<HTMLDivElement | null>; lag: RefObject<HTMLDivElement | null>; bar: RefObject<HTMLDivElement | null> };
const useRefs = (): Refs => ({ name: useRef<HTMLSpanElement>(null), rank: useRef<HTMLSpanElement>(null), pct: useRef<HTMLSpanElement>(null), fill: useRef<HTMLDivElement>(null), lag: useRef<HTMLDivElement>(null), bar: useRef<HTMLDivElement>(null) });
/** 残影：掉血后停 0.35 息，再以每息四成的速度追上（回血时直接跟上） */
interface Lag { e: Enemy | null; v: number; hold: number; w: HpWatch }
/** r11-lock 血条打击感：每帧把数值交给 hpfx（碎玉、滴血、回血；低于 25% 渗红墨）；cls = 血条原来的类名 */
function paint(R: Refs, e: Enemy, L: Lag, dt: number, rank: string, cls = 'bh-bar') {
  const v = Math.max(0, e.hp / Math.max(1, e.maxHp));
  if (L.e !== e) { L.e = e; L.v = v; L.hold = 0; L.w = newWatch(v); }
  watchHp(L.w, R.bar.current, v, e.st);
  if (R.bar.current) { const c = cls + (v > 0 && v < 0.25 ? ' dying' : ''), shaking = R.bar.current.classList.contains('hpfx-shake'); if (R.bar.current.className.replace(' hpfx-shake', '') !== c) R.bar.current.className = c + (shaking ? ' hpfx-shake' : ''); }
  if (v >= L.v) { L.v = v; L.hold = 0; } else if ((L.hold += dt) > 0.35) L.v = Math.max(v, L.v - dt * 0.4);
  if (R.name.current) R.name.current.textContent = e.name;
  if (R.rank.current) R.rank.current.textContent = rank;
  if (R.fill.current) R.fill.current.style.transform = `scaleX(${v.toFixed(4)})`;
  if (R.lag.current) R.lag.current.style.transform = `scaleX(${L.v.toFixed(4)})`;
  if (R.pct.current) R.pct.current.textContent = `${Math.ceil(v * 100)}%`;
}
const bossRank = (e: Enemy) => `${e.rankText}${e.def.title?.includes('·') ? ' · ' + e.def.title.split('·')[1] : ''}`;

/** 条下那一行：罡气（近战交手时）、状态、护体灵光、精英词缀 */
function SubRow({ game, e }: { game: Game; e: Enemy }) {
  const B = game.combat.brawl, bh = B.hud();
  const poise = bh.foe && B.foe === e ? bh.foe : null;
  const st = Object.entries(e.st).filter(([, s]) => s && s.t > 0) as [string, { t: number }][];
  const tags: { k: string; g: string; n: string; bad?: boolean; left?: number; col?: string }[] = [];
  if (e.ward) tags.push({ k: 'ward', g: '护', n: '护体灵光' });
  for (const id of e.affix?.ids ?? []) tags.push({ k: 'af-' + id, g: AFFIX[id].name[0], n: AFFIX[id].name, col: AFFIX[id].col });
  for (const [k, s] of st) tags.push({ k: 'st-' + k, g: k === 'poison' ? '毒' : (STATUS_NAME as Record<string, string>)[k]?.[0] ?? '异', n: (STATUS_NAME as Record<string, string>)[k] ?? k, bad: true, left: s.t });
  // 罡气被打空：琉璃一样碎开（只在「没破 → 破了」那一下）
  const pRef = useRef<HTMLDivElement>(null), wasBroken = useRef(!!poise?.broken);
  useEffect(() => { const b = !!poise?.broken; if (b && !wasBroken.current && pRef.current) hpfx.shatter(pRef.current); wasBroken.current = b; });
  if (!poise && !tags.length) return null;
  const pk = poise && poise.poiseMax > 0 ? Math.max(0, Math.min(1, poise.poise / poise.poiseMax)) : 0;
  return (
    <div className="lk-sub">
      {poise && <div className={'lk-poise' + (poise.broken ? ' broken' : '')}><span>罡气</span><div className="lk-pbar" ref={pRef}><i style={{ transform: `scaleX(${pk.toFixed(3)})` }} /></div><em>{poise.broken ? '破罡' : Math.round(poise.poise)}</em></div>}
      {tags.length > 0 && <div className="lk-tags">{tags.slice(0, 8).map((t) => (
        <span key={t.k} className={'lk-tag' + (t.bad ? ' bad' : '')} title={t.n} style={t.col ? { borderColor: `rgba(${t.col},0.8)`, color: `rgb(${t.col})` } : undefined}>
          <b>{t.g}</b>{t.left !== undefined && <small>{t.left >= 10 ? Math.ceil(t.left) : t.left.toFixed(1)}</small>}
        </span>))}</div>}
    </div>
  );
}

export function BossHUD({ game }: { game: Game }) {
  // boss / lock：这一帧挂着谁（身份变了才重渲染）；tick：罡气、状态那一行的低频刷新
  const [view, setView] = useState<{ boss: Enemy | null; lock: Enemy | null; manual: boolean }>({ boss: null, lock: null, manual: false });
  const [, setTick] = useState(0);
  const ultBox = useRef<HTMLDivElement>(null), ultFill = useRef<HTMLDivElement>(null), ultTxt = useRef<HTMLSpanElement>(null), phaseTag = useRef<HTMLSpanElement>(null);
  const RB = useRefs(), RL = useRefs();
  useEffect(() => {
    let raf = 0, boss: Enemy | null = null, lock: Enemy | null = null, manual = false, last = performance.now(), tickAcc = 0;
    const LB: Lag = { e: null, v: 1, hold: 0, w: newWatch(1) }, LL: Lag = { e: null, v: 1, hold: 0, w: newWatch(1) };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const nb = pickBoss(game, boss), nl = lockBarTarget(game, nb), nm = game.combat.manual && !!game.combat.lock;
      if (nb !== boss || nl !== lock || nm !== manual) { boss = nb; lock = nl; manual = nm; setView({ boss, lock, manual }); }
      if ((tickAcc += dt) > 0.15) { tickAcc = 0; if (boss || lock) setTick((x) => x + 1); }
      if (boss) {
        // 第三十八步：阶段（暴怒 / 狂暴）与大招蓄力
        const rg = boss.rage ?? 0;
        paint(RB, boss, LB, dt, bossRank(boss), 'bh-bar p' + rg);
        if (phaseTag.current) { phaseTag.current.textContent = rg >= 2 ? '狂暴' : rg === 1 ? '暴怒' : ''; phaseTag.current.className = 'bh-phase p' + rg; }
        const F = game.combat.foe, Y = game.yewushe, yu = Y && Y.ent === boss ? Y.ultOf(boss) : 0, u = F.ultSrc === boss ? F.ultCharge() : yu;   // r16：夜无赦的大招读条
        if (ultBox.current) ultBox.current.style.opacity = u > 0 ? '1' : '0';
        if (u > 0 && ultFill.current) ultFill.current.style.transform = `scaleX(${Math.min(1, u).toFixed(3)})`;
        if (u > 0 && ultTxt.current) ultTxt.current.textContent = `蓄力·${F.ultSrc === boss ? F.ultName : Y?.ult?.name ?? ''}`;
      }
      if (lock) paint(RL, lock, LL, dt, lock.rankText);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  const { boss, lock, manual } = view;
  if (!boss && !lock) return null;
  const bossLocked = !!boss && game.combat.lock === boss;
  const k = lock ? lockStance(lock) : 'foe';
  const danger = !!lock && ((lock.realm ?? 0) > game.hero.realm || (lock.blv ?? 0) >= 5);
  return (<>
    {boss && (
      <div className={'boss-hud' + (lock ? ' mini' : '') + (bossLocked ? ' locked' : '')}>
        <div className="bh-head">{bossLocked && <span key={'lk' + boss.id + (manual ? 'm' : '')} className="lk-seal k-foe">锁</span>}<span className="bh-name" ref={RB.name} /><span className="bh-rank" ref={RB.rank} /><span className="bh-phase" ref={phaseTag} /><span className="bh-pct" ref={RB.pct} /></div>
        <div className="bh-bar" ref={RB.bar}><div className="bh-lag" ref={RB.lag} /><div className="bh-fill" ref={RB.fill} /><i className="bh-notch" style={{ left: '70%' }} /><i className="bh-notch" style={{ left: '35%' }} /><i className="bh-orn l" /><i className="bh-orn r" /></div>
        <div className="bh-ult" ref={ultBox}><span ref={ultTxt} /><div className="bh-ult-bar"><div className="bh-ult-fill" ref={ultFill} /></div></div>
        {bossLocked && <SubRow game={game} e={boss} />}
      </div>
    )}
    {lock && (
      <div key={lock.id} className={`boss-hud lock-hud k-${k}` + (manual ? ' manual' : '') + (danger ? ' danger' : '')}>
        <div className="bh-head">
          <span className={`lk-seal k-${k}`}>{LOCK_NAME[k]}</span>
          <span className="bh-name" ref={RL.name} /><span className="bh-rank" ref={RL.rank} />
          {danger && <span className="lk-danger">险</span>}
          <span className="lk-mode">{manual ? '锁定' : '目标'}</span>
          <span className="bh-pct" ref={RL.pct} />
        </div>
        <div className="bh-bar" ref={RL.bar}><div className="bh-lag" ref={RL.lag} /><div className="bh-fill" ref={RL.fill} /><i className="bh-orn l" /><i className="bh-orn r" /></div>
        <SubRow game={game} e={lock} />
      </div>
    )}
  </>);
}
