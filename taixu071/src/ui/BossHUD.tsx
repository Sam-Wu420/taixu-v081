// 第十五步：妖王血条（八级以上妖兽交战时，屏幕上方的大血条）+ 锁定战阵态势条
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import type { Enemy } from '../world/combat';
import { visibleLockedBoss } from '../world/senseSignals';

export function BossHUD({ game }: { game: Game }) {
  const [mode, setMode] = useState<'none' | 'boss' | 'form'>('none');
  const [underSect, setUnderSect] = useState(false);
  const ultBox = useRef<HTMLDivElement>(null), ultFill = useRef<HTMLDivElement>(null), ultTxt = useRef<HTMLSpanElement>(null), phaseTag = useRef<HTMLSpanElement>(null), bar = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null), rank = useRef<HTMLSpanElement>(null), fill = useRef<HTMLDivElement>(null), lag = useRef<HTMLDivElement>(null), pct = useRef<HTMLSpanElement>(null);
  const formSub = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let prevMode: 'none' | 'boss' | 'form' = 'none', wasSect = false, lagV = 1, cur: Enemy | null = null, curFormId = 0;
    let lastStaticSig = '', lastPct = '', lastLag = '', lastFill = '', lastUltOp = '', lastUltW = '';
    const step = () => {
      const next = visibleLockedBoss(game);
      const lf = next ? null : (game.sectwar?.lockedFormationInfo?.() ?? null);
      const nextMode: 'none' | 'boss' | 'form' = next ? 'boss' : lf ? 'form' : 'none';
      if (next !== cur) { cur = next; lagV = cur ? cur.hp / cur.maxHp : 1; lastStaticSig = ''; }
      if (lf && lf.id !== curFormId) { curFormId = lf.id; lagV = lf.brokenT > 0 ? 0 : lf.shield / lf.shieldMax; lastStaticSig = ''; }
      if (!lf) curFormId = 0;
      if (nextMode !== prevMode) { prevMode = nextMode; setMode(nextMode); lastStaticSig = ''; lastPct = lastLag = lastFill = lastUltOp = lastUltW = ''; }
      if (nextMode === 'none') return;
      const hasSect = !!(game.sectwar?.hud?.() || game.sectwar?.standoffHud?.() || game.sectwar?.escortHud?.());
      if (hasSect !== wasSect) { wasSect = hasSect; setUnderSect(hasSect); }
      if (nextMode === 'boss' && cur) {
        const v = Math.max(0, cur.hp / cur.maxHp);
        lagV = Math.max(v, lagV - 0.004);
        const rg = cur.rage ?? 0;
        const sSig = `B|${cur.id}|${rg}|${cur.sectName ?? ''}|${cur.rankText}`;
        if (sSig !== lastStaticSig) {
          lastStaticSig = sSig;
          if (name.current) name.current.textContent = cur.shortName ?? cur.name;
          if (rank.current) rank.current.textContent = `${cur.sectName ? cur.sectName + ' · ' : ''}${cur.rankText}${cur.def.title?.includes('·') ? ' · ' + cur.def.title.split('·')[1] : ''}${cur.warOrigin ? ' · ' + cur.warOrigin : ''}`;
          if (phaseTag.current) { phaseTag.current.textContent = rg >= 2 ? '狂暴' : rg === 1 ? '暴怒' : ''; phaseTag.current.className = 'bh-phase p' + rg; }
          if (bar.current) bar.current.className = 'bh-bar p' + rg;
        }
        const fW = `${(v * 100).toFixed(2)}%`, lW = `${(lagV * 100).toFixed(2)}%`, pStr = `${Math.ceil(v * 100)}%`;
        if (fill.current && fW !== lastFill) { lastFill = fW; fill.current.style.width = fW; }
        if (lag.current && lW !== lastLag) { lastLag = lW; lag.current.style.width = lW; }
        if (pct.current && pStr !== lastPct) { lastPct = pStr; pct.current.textContent = pStr; }
        const F = game.combat.foe, u = F.ultSrc === cur ? F.ultCharge() : 0;
        const op = u > 0 ? '1' : '0';
        if (ultBox.current && op !== lastUltOp) { lastUltOp = op; ultBox.current.style.opacity = op; }
        if (u > 0) {
          const uW = `${Math.min(100, u * 100).toFixed(1)}%`;
          if (ultFill.current && uW !== lastUltW) { lastUltW = uW; ultFill.current.style.width = uW; }
          if (ultTxt.current && ultTxt.current.textContent !== `蓄力·${F.ultName}`) ultTxt.current.textContent = `蓄力·${F.ultName}`;
        }
      } else if (nextMode === 'form' && lf) {
        const broken = lf.brokenT > 0;
        const v = broken ? Math.min(1, lf.brokenT / 7.5) : Math.max(0, lf.shield / lf.shieldMax);
        lagV = broken ? v : Math.max(v, lagV - 0.006);
        const sSig = `F|${lf.id}|${lf.soldiers}|${broken ? 1 : 0}|${lf.resonanceHint}`;
        if (sSig !== lastStaticSig) {
          lastStaticSig = sSig;
          if (name.current) name.current.textContent = `${lf.sectName} · ${lf.name}`;
          if (rank.current) rank.current.textContent = `战兵 ${lf.soldiers}/${lf.soldiersMax} · ${lf.weakHint}`;
          if (bar.current) bar.current.className = 'bh-bar form' + (broken ? ' broken' : '');
          if (formSub.current) formSub.current.textContent = lf.resonanceHint;
        }
        const phTxt = broken ? `破盾 ${lf.brokenT.toFixed(1)}s` : `${lf.school}系灵盾`;
        const phCls = 'bh-phase ' + (broken ? 'p2' : 'p1');
        if (phaseTag.current) {
          if (phaseTag.current.textContent !== phTxt) phaseTag.current.textContent = phTxt;
          if (phaseTag.current.className !== phCls) phaseTag.current.className = phCls;
        }
        const fW = `${(v * 100).toFixed(2)}%`, lW = `${(lagV * 100).toFixed(2)}%`, pStr = broken ? '可斩兵' : `护盾 ${lf.shield}/${lf.shieldMax}`;
        if (fill.current && fW !== lastFill) { lastFill = fW; fill.current.style.width = fW; }
        if (lag.current && lW !== lastLag) { lastLag = lW; lag.current.style.width = lW; }
        if (pct.current && pStr !== lastPct) { lastPct = pStr; pct.current.textContent = pStr; }
      }
    };
    step();
    const offFrame = game.onAfterFrame(step);
    const offUi = game.subscribe(step);
    return () => { offFrame(); offUi(); };
  }, [game]);
  if (mode === 'none') return null;
  return (
    <div className={`boss-hud${underSect ? ' with-sect-hud' : ''}`}>
      <div className="bh-head"><span className="bh-name" ref={name} /><span className="bh-rank" ref={rank} /><span className="bh-phase" ref={phaseTag} /><span className="bh-pct" ref={pct} /></div>
      <div className="bh-bar" ref={bar}><div className="bh-lag" ref={lag} /><div className="bh-fill" ref={fill} /><i className="bh-notch" style={{ left: '70%' }} /><i className="bh-notch" style={{ left: '35%' }} /><i className="bh-orn l" /><i className="bh-orn r" /></div>
      {mode === 'boss'
        ? <div className="bh-ult" ref={ultBox}><span ref={ultTxt} /><div className="bh-ult-bar"><div className="bh-ult-fill" ref={ultFill} /></div></div>
        : <div className="bh-form-sub" ref={formSub} />}
    </div>
  );
}
