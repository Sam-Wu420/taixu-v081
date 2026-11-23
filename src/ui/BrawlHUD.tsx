// 贴身斗法的界面（world/brawl.ts）：自己的罡气条、交手对象的罡气条、架势提示；手机上快捷栏旁的「架势」按钮，
// 进了架势以后快捷栏那块换成四个大按钮（轻击、崩山、欺身、追击 / 脱困），方向用摇杆。
// E2：拼招面板（三个选项、倒计时、结果；连按拼点的计数；手机上三个大按钮）、连段计数、收尾大字。
// r7 重击定向：按住右键（手机长按「崩」）时一条小提示（上挑 / 平飞 / 下砸、倒计时、松开出手）；手机上「崩」变成小摇杆，旁边出「升」「降」两颗。
// 条只动 transform（scaleX），不做宽度、滤镜、阴影动画（WebGL 上会卡帧）。下一轮主界面重排时这块会挪到目标框里。
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { audio } from '../world/audio';
import { bindOf, keyLabel, ascendLabel } from '../core/keymap';
import { PICKS, PICK_NAME, beats, type Pick } from '../world/clash';
import { meleeArtView } from '../data/weapons';
import './brawl-hud.css';
import { hpfx } from './hpfx';

type Hud = ReturnType<Game['combat']['brawl']['hud']>;
type ClashHud = NonNullable<Hud['clash']>;

function Bar({ label, v, max, broken, foe }: { label: string; v: number; max: number; broken: boolean; foe?: boolean }) {
  const k = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
  // r11-lock 血条打击感：罡气被打空那一下，琉璃一样碎开（ui/hpfx.ts）
  const tr = useRef<HTMLSpanElement>(null), was = useRef(broken);
  useEffect(() => { if (broken && !was.current && tr.current) hpfx.shatter(tr.current); was.current = broken; }, [broken]);
  return (
    <div className={'bx-bar' + (broken ? ' broken' : '') + (foe ? ' foe' : '')}>
      <span className="bx-label">{label}</span>
      <span className="bx-track" ref={tr}><i style={{ transform: `scaleX(${k})` }} /></span>
      <span className="bx-num">{broken ? '破罡' : Math.round(v)}</span>
    </div>
  );
}

/** r7：重击定向选的上下 */
const VERT_NAME: Record<string, string> = { '1': '上挑', '0': '平飞', '-1': '下砸' };

/** 三手：攻（左）、破（上）、卸（右）——克制关系写在卡片下面 */
const PICK_KEY: Record<Pick, string> = { atk: 'left', brk: 'up', par: 'right' };
const PICK_TIP: Record<Pick, string> = { atk: '克 破', brk: '克 卸', par: '克 攻' };

function ClashPanel({ c, touch, onPick }: { c: ClashHud; touch: boolean; onPick: (k: Pick) => void }) {
  const res = c.res, shown = c.ePick;
  const head = c.phase === 'mash' ? '拼点 · 连按！' : c.phase === 'result' ? (res === 'win' ? '胜！' : '败！') : '拼招 · 三选一';
  return (
    <div className={'bx-clash ' + c.phase + (res ? ' ' + res : '') + (touch ? ' touch' : '')}>
      <div className="bx-clash-head"><b>{head}</b><span>{c.foe}{c.temper ? ` · ${c.temper}` : ''}</span></div>
      {c.tell && <div className={'bx-clash-tell ' + c.tell}>对方起手 · <b>{PICK_NAME[c.tell]}</b>势{c.temper === '狡诈' ? '（狡诈之人，或是虚招）' : ''}</div>}
      {c.phase !== 'result' && <div className="bx-clash-time"><i style={{ transform: `scaleX(${c.left})` }} /></div>}
      {c.phase === 'mash' ? (
        <div className="bx-mash">
          <div className="bx-mash-n"><b>{c.pN}</b><small>你</small></div>
          {touch
            ? <button className="bx-mash-btn" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPick('atk'); }}>连按</button>
            : <div className="bx-mash-tip">连按 {keyLabel(bindOf('left'))} / {keyLabel(bindOf('up'))} / {keyLabel(bindOf('right'))} 或鼠标</div>}
          <div className="bx-mash-n foe"><b>{c.eN}</b><small>对方</small></div>
        </div>
      ) : (
        <div className="bx-picks">
          {PICKS.map((k) => {
            const mine = c.pick === k, theirs = shown === k;
            const cls = 'bx-pick ' + k + (mine ? ' mine' : '') + (theirs ? ' theirs' : '') + (c.tell === k && !shown ? ' tell' : '') + (mine && shown && beats(k, shown) ? ' won' : '') + (mine && shown && shown !== k && beats(shown, k) ? ' lost' : '');
            return (
              <button key={k} className={cls} disabled={c.phase !== 'pick' || !!c.pick} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPick(k); }}>
                <b>{PICK_NAME[k]}</b>
                <small>{touch ? PICK_TIP[k] : `${keyLabel(bindOf(PICK_KEY[k]))} · ${PICK_TIP[k]}`}</small>
                {theirs && <em>对方</em>}
              </button>
            );
          })}
        </div>
      )}
      {c.phase === 'result' && <div className="bx-clash-res">{c.tie ? `拼点 ${c.pN} : ${c.eN}` : `${c.pick ? PICK_NAME[c.pick] : '迟疑'} 对 ${shown ? PICK_NAME[shown] : '?'}`}</div>}
    </div>
  );
}

/**
 * part：电脑上罡气条和架势提示（'bars'）排进底部那一区（快捷栏、遁光读数的上面，GameView 放在 hz-bc 里按顺序排），
 * 其余（拼招、连段、收尾大字、追！）照旧浮在画面上（'rest'）。第五轮：以前罡气条绝对定位在快捷栏上方固定高度，御剑时和「御剑 遁速」那行叠在一起。
 * 不给 part（手机）就整套都出。
 */
export function BrawlHUD({ game, touch, part }: { game: Game; touch: boolean; part?: 'bars' | 'rest' }) {
  const B = game.combat.brawl;
  const [s, set] = useState<Hud>(() => B.hud());
  // 拼招、定向期间刷新得快一点（倒计时、连按计数要跟手）
  const fast = !!s.clash || !!s.aim;
  useEffect(() => { const t = setInterval(() => set(B.hud()), fast ? 50 : 100); return () => clearInterval(t); }, [B, fast]);
  // 崩山（r7）：轻点是出手（朝锁定的目标把人推开）；长按变成小摇杆——时间放慢，往哪拖对手就往哪飞，松手出手
  const heavyT = useRef<{ timer: number; aim: boolean; cx: number; cy: number; R: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const heavyDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    audio.unlock();
    const el = e.currentTarget; try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    const r = el.getBoundingClientRect();
    const h = { timer: 0, aim: false, cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: Math.max(40, r.width * 0.9) };
    h.timer = window.setTimeout(() => { if (heavyT.current === h && B.aimStart('touch', 0.2)) { h.aim = true; setKnob({ x: 0, y: 0 }); set(B.hud()); } }, 220);
    heavyT.current = h;
  };
  const heavyMove = (e: React.PointerEvent) => {
    const h = heavyT.current; if (!h?.aim) return;
    let jx = (e.clientX - h.cx) / h.R, jy = (e.clientY - h.cy) / h.R; const m = Math.hypot(jx, jy); if (m > 1) { jx /= m; jy /= m; }
    B.aimDrag(jx, jy); setKnob({ x: jx, y: jy });
  };
  const heavyUp = (cancel = false) => {
    const h = heavyT.current; if (!h) return; heavyT.current = null; clearTimeout(h.timer);
    if (h.aim) { if (cancel) B.aimCancel(); else B.aimRelease(); setKnob({ x: 0, y: 0 }); }
    else if (!cancel) B.heavy(false);
    set(B.hud());
  };
  if (game.hero.dead) return null;
  const show = s.stance || !!s.foe || s.poise < s.poiseMax - 0.5 || s.air;
  const btn = (cls: string, glyph: string, name: string, go: () => void) => (
    <button className={'bx-btn ' + cls} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); go(); }}>{glyph}<small>{name}</small></button>
  );
  const pick = (k: Pick) => { audio.unlock(); B.clash.pick(k); set(B.hud()); };
  return (
    <>
      {/* 手机上拼招面板占着底部：罡气条先收起 */}
      {show && !(touch && s.clash) && part !== 'rest' && (
        <div className={'bx-hud' + (touch ? ' touch' : '')}>
          <Bar label="罡气" v={s.poise} max={s.poiseMax} broken={s.broken} />
          {s.foe && <Bar label={s.foe.name} v={s.foe.poise} max={s.foe.poiseMax} broken={s.foe.broken} foe />}
          {/* 兵器线：手里是什么兵器、它的要点一句（换兵器后下一次出手就是新的） */}
          {s.stance && !s.clash && !s.aim && <div className={'bx-tip wpn k-' + s.weapon.kind}><b>{s.weapon.kind === 'fist' ? '拳脚' : s.weapon.name}</b> · {s.weapon.tip}</div>}
          {s.stance && !touch && !s.clash && (s.aim
            ? <div className="bx-tip aim">定向 · 松开右键出手 · 按住 {ascendLabel()} 上挑 / {keyLabel(bindOf('descend'))} 下砸 · 都不按平飞</div>
            : <div className="bx-tip">架势 · 左键{meleeArtView('bx_lianquan', s.weapon.kind)?.name ?? '轻击'} · 右键{meleeArtView('bx_bengshan', s.weapon.kind)?.name ?? '崩山'}（轻点出手；按住定向，同时按住 {ascendLabel()} 上挑、{keyLabel(bindOf('descend'))} 下砸）· {keyLabel(bindOf('run'))} {meleeArtView('bx_qishen', s.weapon.kind)?.name ?? '欺身'} · {keyLabel(bindOf('dodge'))} {s.air ? `脱困（耗 ${Math.round(s.techCost * 100)}% 灵力）` : '缩地追击'} · {keyLabel(bindOf('brawl'))} / 中键收势</div>)}
        </div>
      )}
      {part !== 'bars' && <>
      {s.combo >= 2 && <div className={'bx-combo' + (touch ? ' touch' : '')} key={s.combo}><b>{s.combo}</b><small>连</small></div>}
      {s.finisher && <div className={'bx-fin' + (touch ? ' touch' : '')} key={s.finisher}>{s.finisher}</div>}
      {s.clash && <ClashPanel c={s.clash} touch={touch} onPick={pick} />}
      {/* r7 重击定向：选的上下、倒计时（放慢那一段才出），罡气没破时说一声打不飞 */}
      {s.aim?.slow && !s.clash && (
        <div className={'bx-aimtag v' + s.aim.v + (s.aim.ok ? '' : ' no') + (touch ? ' touch' : '')}>
          <b>{s.aim.foe ? (s.aim.ok ? VERT_NAME[String(s.aim.v)] : '罡气未破') : '够不着'}</b>
          <span className="bx-aimbar"><i style={{ transform: `scaleX(${s.aim.left})` }} /></span>
          <small>{s.aim.foe && !s.aim.ok ? '这一下只削罡气' : touch ? '拖动定方向 · 松手出手' : '松开右键出手'}</small>
        </div>
      )}
      {/* 收官 E3「追！」：砸下去的人能一键俯冲追上去时，一个醒目的提示（手机上就是按钮），箭头指着它在哪；被砸向下界时是「脱！」 */}
      {(s.chase && !s.chase.plunging) || s.dropped ? (
        <button className={'bx-chase' + (s.dropped ? ' drop' : '') + (touch ? ' touch' : '')} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); B.pursue(); set(B.hud()); }}>
          {s.chase && s.chase.ang !== null && !s.dropped && <i className="bx-chase-arrow" style={{ transform: `rotate(${s.chase.ang}rad)` }} />}
          <b>{s.dropped ? '脱！' : '追！'}</b>
          <small>{s.dropped ? `${touch ? '点这里' : keyLabel(bindOf('dodge'))} 脱困` : `${touch ? '点这里' : keyLabel(bindOf('dodge'))} ${s.chase?.void ? '俯冲追下界' : '俯冲追砸'}`}</small>
        </button>
      ) : null}
      {touch && (
        <button className={'bx-stance round-btn' + (s.stance ? ' on' : '')} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); audio.unlock(); audio.sfx('click'); B.toggleStance(); set(B.hud()); }}>
          {s.stance ? '收' : '架'}<small>{s.stance ? '收势' : '架势'}</small>
        </button>
      )}
      {touch && s.stance && !s.clash && (
        <div className="bx-pad">
          {btn('light', meleeArtView('bx_lianquan', s.weapon.kind)?.glyph ?? '轻', meleeArtView('bx_lianquan', s.weapon.kind)?.name ?? '轻击', () => B.light())}
          <button className={'bx-btn heavy' + (s.aim?.touch ? ' aiming' : '')} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); heavyDown(e); }} onPointerMove={(e) => { e.stopPropagation(); heavyMove(e); }} onPointerUp={(e) => { e.stopPropagation(); heavyUp(); }} onPointerCancel={() => heavyUp(true)}>
            {s.aim?.touch ? <><span className="bx-joy" /><i className="bx-knob" style={{ transform: `translate(${knob.x * 26}px, ${knob.y * 26}px)` }} /></> : <>{meleeArtView('bx_bengshan', s.weapon.kind)?.glyph ?? '崩'}<small>{meleeArtView('bx_bengshan', s.weapon.kind)?.name ?? '崩山'} · 长按定向</small></>}
          </button>
          {btn('rush', meleeArtView('bx_qishen', s.weapon.kind)?.glyph ?? '欺', meleeArtView('bx_qishen', s.weapon.kind)?.name ?? '欺身', () => B.rush())}
          {/* 长按「崩」定向时：点「升」上挑、点「降」下砸（再点一下取消） */}
          {s.aim?.touch && (
            <div className="bx-vpick">
              <button className={'bx-vbtn up' + (s.aim.v === 1 ? ' on' : '')} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); B.aimVert(1); set(B.hud()); }}>升<small>上挑</small></button>
              <button className={'bx-vbtn dn' + (s.aim.v === -1 ? ' on' : '')} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); B.aimVert(-1); set(B.hud()); }}>降<small>下砸</small></button>
            </div>
          )}
          {btn('pursue' + (s.air || s.dropped ? ' tech' : s.canPursue || s.chase ? ' ready' : ''), s.air || s.dropped ? '脱' : '追', s.air || s.dropped ? (s.techCd > 0 ? `脱困 ${s.techCd.toFixed(1)}` : '脱困') : s.chase ? '追击俯冲' : `缩地${s.canPursue ? ` ${3 - s.chain}` : ''}`, () => B.pursue())}
        </div>
      )}
      </>}
    </>
  );
}
