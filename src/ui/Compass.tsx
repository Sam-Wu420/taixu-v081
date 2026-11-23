// 绝域的界面（world/jueyu.ts 的 hud）：挂在小地图那一圈里（GameView 只加一行）。
//   罗盘：离岸超过近海带的一半时在小地图左边出现。平时盘面朝北，金色的「岸」标出最近的岸在哪个方向、大约多远；
//         进了迷雾断层，指针和「岸」都开始乱晃乱转，越深越乱。
//   小地图锁死：盖一层流动的墨雾、写「神识受扰」，看不见自己在哪。
//   人物牌上法力条旁的警示：灵力流失（每息掉多少）、回复减半。
//   泅水：屏幕下方一条状态提示，写明法力回到多少才能再御器。
//   海兽（收官 B2，world/seabeast.ts 的 hud）：罗盘下「水下有东西……」、盘面上覆海玄鲸的方位（「鲸」）、
//   血腥连锁的倒计时条（「血腥味散开了……」，一条收紧的血线）、被触须缠住时的挣扎提示。
//   收官 B3：灵舟（右下一串圆钮：「舟」祭出 / 登船 / 收舟，下面一条耐久；「潜」「浮」按住下潜 / 上浮——手机上没有键盘，这几个钮就是操作）；
//   海渊（顶上一块：下潜多少丈、海底多深、避水够不够、闭气还剩多少）；奇遇（盘面上远远的方位：「鬼」幽灵古船、「潮」退潮的祭坛、
//   「遗」打听到的遗迹、「墟」水下感应到的遗迹——方向故意不准，远了左右晃，近了才准）；甲板上的提示（鬼市摊主、祭坛、涨潮、鬼船将散）。
// 每帧只改 transform / opacity / 文字（不重渲染 React，不动 filter、box-shadow、宽度），手机上也不掉帧。
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../world/game';
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import './compass.css';

const fmtDist = (d: number) => (d < 1500 ? '近岸' : d < 10000 ? `约 ${(d / 1000).toFixed(1)} 千` : `约 ${(d / 10000).toFixed(1)} 万`);

/**
 * 收官 B3：灵舟、下潜、上浮三个圆钮——放进主界面现成的按钮区（电脑：右下常用键一圈的小钮那一排；手机：右侧那一列），
 * 跟着「船在不在、能不能潜、在不在水下」出现。手机上没有键盘，它们就是操作。四分之一秒问一次就够。
 */
export function SeaButtons({ game }: { game: Game }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((x) => x + 1), 250); return () => window.clearInterval(id); }, []);
  const J = game.jueyu, B = J.boat.hud, D = J.deep.hud;
  const hold = (v: number) => ({ onPointerDown: (e: { preventDefault(): void }) => { e.preventDefault(); game.input.climb = v; }, onPointerUp: () => { game.input.climb = 0; }, onPointerLeave: () => { game.input.climb = 0; }, onPointerCancel: () => { game.input.climb = 0; } });
  return <>
    {B.show && !J.deep.active && <button className={'round-btn small sea-boat' + (B.aboard ? ' active' : '')} onClick={() => J.boat.toggle()} title={`${B.name}：祭出 / 登船 / 上岸收舟（${keyLabel(bindOf('boat'))}）——耐久 ${Math.round(B.hp * 100)}%`}>
      舟<small>{B.act}</small><i className={'sea-hp' + (B.hp < 0.3 ? ' low' : '')}><b style={{ transform: `scaleX(${Math.max(0, Math.min(1, B.hp)).toFixed(3)})` }} /></i>
    </button>}
    {(D.canDive || J.deep.active) && <button className="round-btn small sea-dive" {...hold(-1)} title={`按住下潜（${keyLabel(bindOf('descend'))}）`}>潜<small>下潜</small></button>}
    {J.deep.active && <button className="round-btn small sea-rise" {...hold(1)} title={`按住上浮（${ascendLabel()}）`}>浮<small>上浮</small></button>}
  </>;
}
/** 收官 B3：情境提示（主界面的 ContextHints 读，出在快捷栏正上方）：甲板上的摊主 / 祭坛、鬼船将散、涨潮、触须缠船 */
export function seaHint(game: Game): { text: string; warn: boolean; act: boolean } | null {
  const J = game.jueyu, Q = J.qiyu.hud, B = J.boat.hud;
  if (B.warn) return { text: B.warn, warn: true, act: false };
  if (Q.deckWarn) return { text: Q.deckWarn, warn: true, act: false };
  if (Q.prompt) return { text: Q.prompt, warn: false, act: true };
  return null;
}

/**
 * 第五轮：人物牌底下的状态小牌（灵力流失 / 回复减半）。以前它挂在 .game-root 上、每 0.25 秒量一次人物牌法力条的位置贴过去：
 * 竖屏上人物牌伸到罗盘跟前，小牌压在罗盘上；量不到法力条的那几帧（刚开局、面板开着）它就停在屏幕最左上角被切掉一半。
 * 现在它是左上区（hz-tl）里的一行，跟在增益行后面，排版自己管位置；只在有警示时占地方。每帧只改文字、opacity、类名。
 */
export function JyStatus({ game }: { game: Game }) {
  const box = useRef<HTMLDivElement>(null), txt = useRef<HTMLSpanElement>(null), pulse = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const el = box.current; if (!el) return;
      const H = game.jueyu.hud, drain = H.show && H.drainPct > 0.05, half = H.show && !drain && H.regenK < 0.9, on = drain || half;
      if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
      el.classList.toggle('half', half);
      const s = drain ? `灵力流失 −${H.drainPct.toFixed(1)}%/息` : half ? `回复 ×${H.regenK.toFixed(1)}` : '';
      if (txt.current && txt.current.textContent !== s) txt.current.textContent = s;
      if (pulse.current) pulse.current.style.opacity = drain ? (0.45 + 0.55 * Math.abs(Math.sin(now / 250))).toFixed(3) : '0';
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  return <div className="jy-mpwarn hud-chip" ref={box}><span className="jy-mpwarn-pulse" ref={pulse} /><span ref={txt} /></div>;
}

export function Compass({ game }: { game: Game }) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<Element | null>(null);
  const R = useRef<Record<string, HTMLElement | null>>({});
  const ref = (k: string) => (el: HTMLElement | null) => { R.current[k] = el; };
  useEffect(() => { setRoot(host.current?.closest('.game-root') ?? document.body); }, []);
  useEffect(() => {
    let raf = 0, last = performance.now(), needle = 0, shore = 0, wob = 0, nv = 0, sv = 0, shown = 0, lockK = 0, lurkK = 0, bloodK = 0, whaleA = 0, heldK = 0, still = 0;
    const qa: Record<string, number> = { ghost: 0, altar: 0, rumor: 0, ruin: 0 };   // 奇遇记号的角度（平滑）
    const set = (k: string, f: (el: HTMLElement) => void) => { const el = R.current[k]; if (el) f(el); };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const J = game.jueyu, H = J.hud;
      // 总审·性能：不在险地、海上没有任何要显示的东西时，这一圈三十来处样式写入每帧照做（「40 敌连续施法」里每秒 8 毫秒）——都收起来、淡出走完之后就整个跳过
      { const S0 = game.seabeast.hud, D0 = J.deep.hud, Q0 = J.qiyu.hud;
        const quiet = !H.show && !H.swimming && !D0.show && !S0.held && !(S0.blood > 0) && !(S0.lurk > 0.01) && !(S0.whaleDist < 30000) && Q0.ghostDir !== Q0.ghostDir && Q0.altarDir !== Q0.altarDir && Q0.rumorDir !== Q0.rumorDir
          && shown < 0.004 && lockK < 0.004 && lurkK < 0.004 && bloodK < 0.004 && heldK < 0.004;
        if (!quiet) still = 0; else if (++still > 3) return; }
      // 出现 / 消失
      shown += ((H.show ? 1 : 0) - shown) * Math.min(1, dt * 4);
      set('dial', (el) => { el.style.opacity = shown.toFixed(3); el.style.transform = `translateY(-50%) scale(${(0.85 + 0.15 * shown).toFixed(3)})`; });
      // 指针：平时稳稳指北；越深越乱——一股随机的扭力推着它转，深处干脆整圈乱转
      const sp = H.spin, t = now / 1000;
      wob = Math.sin(t * 7.3) * 0.6 + Math.sin(t * 3.1 + 1.7) * 0.8 + Math.sin(t * 13.7) * 0.3;
      nv += (wob * sp * 9 - nv * 2.2) * dt + (sp > 0.85 ? 10 * dt * Math.sign(Math.sin(t * 0.37) + 0.2) : 0);
      needle += nv * dt; needle += (0 - Math.atan2(Math.sin(needle), Math.cos(needle))) * Math.min(1, dt * 3 * (1 - sp));
      set('needle', (el) => { el.style.transform = `rotate(${needle}rad)`; });
      // 「岸」的方向（世界方向 → 盘面：北朝上，东朝右，y 向下）；乱的时候它也被扯着晃
      const want = H.shoreDir + Math.PI / 2 + Math.sin(t * 5.1 + 2) * sp * 1.6 + Math.sin(t * 1.3) * sp * 0.9;
      let dd = want - shore; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
      sv += (dd * 18 - sv * 7) * dt; shore += sv * dt;
      set('shore', (el) => { el.style.transform = `rotate(${shore}rad)`; el.style.opacity = H.shoreDist > 1500 ? '1' : '0'; });
      set('dist', (el) => { const s = sp > 0.6 ? '神识受扰' : `离岸 ${fmtDist(H.shoreDist)}`; if (el.textContent !== s) el.textContent = s; });
      set('band', (el) => { const s = H.band ? `${H.zone}·${H.band}` : ''; if (el.textContent !== s) el.textContent = s; });
      // 小地图锁死
      lockK += ((H.lock && H.show ? 1 : 0) - lockK) * Math.min(1, dt * 2.5);
      set('lock', (el) => { el.style.opacity = lockK.toFixed(3); });
      set('swirl', (el) => { el.style.transform = `rotate(${(t * 0.6) % (Math.PI * 2)}rad)`; });
      // 泅水
      set('swim', (el) => { el.style.opacity = H.swimming ? '1' : '0'; el.style.transform = `translateX(-50%) translateY(${H.swimming ? 0 : 10}px)`; });
      set('swimSub', (el) => {
        const mp = Math.round(game.hero.mp * 100), need = Math.round(H.takeoffAt * 100);
        const s = H.canTakeoff ? `法力 ${mp}%，可以再御器——${IS_TOUCH ? '点「飞」' : `按 ${keyLabel(bindOf('fly'))}`}起飞` : `法力 ${mp}% / ${need}%：服丹药，或在水里慢慢缓过来；只能用一二品的小法术`;
        if (el.textContent !== s) el.textContent = s;
      });
      set('gale', (el) => { el.style.opacity = (H.gale * shown).toFixed(3); });
      // —— 海兽
      const SB = game.seabeast.hud;
      lurkK += (SB.lurk - lurkK) * Math.min(1, dt * 3);
      set('lurk', (el) => { el.style.opacity = (lurkK > 0.15 ? Math.min(1, lurkK * 1.4) * (0.55 + 0.45 * Math.abs(Math.sin(t * 2.2))) : 0).toFixed(3); el.style.transform = `translateY(${(1 - Math.min(1, lurkK * 2)) * 4}px)`; });
      // 鲸：三万以内在盘面上标出方位（跟岸一样从正北起算，东朝右）
      const wOn = SB.whaleDist < 30000;
      if (wOn) { let d2 = SB.whaleDir + Math.PI / 2 - whaleA; d2 = Math.atan2(Math.sin(d2), Math.cos(d2)); whaleA += d2 * Math.min(1, dt * 6); }
      set('whale', (el) => { el.style.opacity = wOn ? (SB.whaleUp ? 1 : 0.45).toString() : '0'; el.style.transform = `rotate(${whaleA}rad)`; });
      set('whaleTxt', (el) => { const s = wOn ? `覆海玄鲸 ${fmtDist(SB.whaleDist).replace('近岸', '就在附近')}${SB.whaleUp ? '' : '（潜在水下）'}` : ''; if (el.textContent !== s) el.textContent = s; });
      // 血腥连锁：一条收紧的血线
      bloodK += ((SB.blood > 0 ? 1 : 0) - bloodK) * Math.min(1, dt * 4);
      set('blood', (el) => { el.style.opacity = bloodK.toFixed(3); el.style.transform = `translateX(-50%) translateY(${(1 - bloodK) * -8}px)`; });
      set('bloodBar', (el) => { el.style.transform = `scaleX(${Math.max(0, SB.blood).toFixed(4)})`; el.style.opacity = SB.blood < 0.3 ? (0.6 + 0.4 * Math.abs(Math.sin(t * 9))).toFixed(3) : '1'; });
      set('bloodTxt', (el) => { const s = SB.blood > 0 ? `血腥味散开了……${SB.bloodN > 1 ? `深处有 ${SB.bloodN} 条东西被惊动了` : '深处有东西被惊动了'}——杀完就走，绝不恋战` : ''; if (el.textContent !== s) el.textContent = s; });
      // 被触须缠住
      heldK += ((SB.held ? 1 : 0) - heldK) * Math.min(1, dt * 6);
      set('held', (el) => { el.style.opacity = heldK.toFixed(3); el.style.transform = `translateX(-50%) scale(${(0.92 + 0.08 * heldK + (SB.held ? 0.03 * Math.sin(t * 14) : 0)).toFixed(3)})`; });
      // —— 收官 B3：灵舟、海渊、奇遇
      const B = J.boat.hud, D = J.deep.hud, Q = J.qiyu.hud;
      const txt = (k: string, s: string) => set(k, (el) => { if (el.textContent !== s) el.textContent = s; });
      const vis = (k: string, on: boolean, extra = '') => set(k, (el) => { el.style.opacity = on ? '1' : '0'; el.style.transform = (extra || '') + (on ? ' scale(1)' : ' scale(0.85)'); el.style.pointerEvents = on ? 'auto' : 'none'; });

      // 海渊
      set('abyss', (el) => { el.style.opacity = D.show ? '1' : '0'; el.style.transform = `translateX(${D.show ? 0 : 12}px)`; });
      txt('abyssD', D.show ? `下潜 ${D.zhang.toLocaleString()} 丈` : '');
      txt('abyssF', D.show ? `海底约 ${D.floorZhang.toLocaleString()} 丈${D.boat ? ' · 龟甲宝船护着' : ''}` : '');
      set('wardBar', (el) => { el.style.transform = `scaleX(${Math.min(1, D.ward / 0.8).toFixed(3)})`; el.classList.toggle('bad', D.ward < D.need && !D.boat); });
      set('wardNeed', (el) => { el.style.transform = `translateX(${(Math.min(1, D.need / 0.8) * 100).toFixed(1)}%)`; });
      txt('wardTxt', D.boat ? '避水：宝船护罩' : `避水 ${Math.round(D.ward * 100)}% / 需 ${Math.round(D.need * 100)}%`);
      set('airBar', (el) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, D.breath)).toFixed(3)})`; el.classList.toggle('bad', D.breath < 0.15); });
      txt('airTxt', D.choke ? '闭不住气了！' : `闭气（灵力）${Math.round(D.breath * 100)}%`);
      set('abyssWarn', (el) => { const s = D.choke ? '气息将尽——快浮上去！' : D.hurt > 0 ? '水压挤得骨节作响——避水不够，浮浅一些' : ''; if (el.textContent !== s) el.textContent = s; el.style.opacity = s ? (0.65 + 0.35 * Math.abs(Math.sin(t * 5))).toFixed(3) : '0'; });
      // 奇遇：盘面上的记号
      const mark = (k: string, dir: number, on: boolean) => {
        if (on) { let d2 = dir + Math.PI / 2 - qa[k]; d2 = Math.atan2(Math.sin(d2), Math.cos(d2)); qa[k] += d2 * Math.min(1, dt * 4); }
        set('q_' + k, (el) => { el.style.opacity = on ? (0.75 + 0.25 * Math.sin(t * 2.3 + k.length)).toFixed(3) : '0'; el.style.transform = `rotate(${qa[k].toFixed(3)}rad)`; });
      };
      mark('ghost', Q.ghostDir, Q.ghostDir === Q.ghostDir);
      mark('altar', Q.altarDir, Q.altarDir === Q.altarDir);
      mark('rumor', Q.rumorDir, Q.rumorDir === Q.rumorDir);
      mark('ruin', D.ruinDir, D.ruinDir === D.ruinDir && D.ruinDist > 600);
      txt('qyTxt', Q.ghostTxt || Q.altarTxt || Q.rumorTxt || (D.ruinName && D.ruinDist < 9000 ? `感到${D.ruinName}的灵光就在附近的海底` : ''));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, root]);
  return (
    <div ref={host} className="jy-host">
      <div className="jy-mmlock" ref={ref('lock')} aria-hidden>
        <div className="jy-swirl" ref={ref('swirl')} />
        <span>神识受扰</span>
      </div>
      <div className="jy-compass" ref={ref('dial')} title="罗盘：金色的「岸」指着最近的岸">
        <div className="jy-face">
          <i className="n">北</i><i className="e">东</i><i className="s">南</i><i className="w">西</i>
          <div className="jy-shore" ref={ref('shore')}><b>岸</b></div>
          <div className="jy-needle" ref={ref('needle')}><span className="up" /><span className="dn" /></div>
          <div className="jy-pin" />
          <div className="jy-gale" ref={ref('gale')} />
          <div className="jy-whale" ref={ref('whale')}><b>鲸</b></div>
          <div className="jy-qy ghost" ref={ref('q_ghost')}><b>鬼</b></div>
          <div className="jy-qy altar" ref={ref('q_altar')}><b>潮</b></div>
          <div className="jy-qy rumor" ref={ref('q_rumor')}><b>遗</b></div>
          <div className="jy-qy ruin" ref={ref('q_ruin')}><b>墟</b></div>
        </div>
        <div className="jy-dist" ref={ref('dist')} />
        <div className="jy-band" ref={ref('band')} />
        <div className="jy-lurk" ref={ref('lurk')}>水下有东西……</div>
        <div className="jy-whaletxt" ref={ref('whaleTxt')} />
        <div className="jy-qytxt" ref={ref('qyTxt')} />
      </div>
      {root && createPortal(
        <>
          <div className="jy-swim" ref={ref('swim')}><div className="t">泅 水</div><div className="s" ref={ref('swimSub')} /></div>
          <div className="jy-blood" ref={ref('blood')}><div className="txt" ref={ref('bloodTxt')} /><div className="track"><div className="bar" ref={ref('bloodBar')} /></div></div>
          <div className="jy-held" ref={ref('held')}>被触须缠住了！{IS_TOUCH ? '来回推摇杆' : '按方向键'}挣扎，或斩断这条触须</div>


          <div className="jy-abyss" ref={ref('abyss')}>
            <div className="hd"><b>万丈海渊</b><span ref={ref('abyssD')} /></div>
            <div className="sub" ref={ref('abyssF')} />
            <div className="row"><span className="lb" ref={ref('wardTxt')} /><span className="track ward"><i ref={ref('wardBar')} /><em ref={ref('wardNeed')} /></span></div>
            <div className="row"><span className="lb" ref={ref('airTxt')} /><span className="track air"><i ref={ref('airBar')} /></span></div>
            <div className="warn" ref={ref('abyssWarn')} />
          </div>

        </>, root)}
    </div>
  );
}
