// 结伴：队伍框。人物卡下面一列，每位同行者一张：头像（底框自带的金圈里）、名字、境界、作风印章、气血（掉血闪白、残影慢慢跟上）、
// 法力、状态（调息倒计时、等候、出窍、气血告急、当前指令）、跑出画面时朝他所在方向的箭头和距离。点卡片下指令；最上面一行定队伍作风。
// 底框（含头像的金圈）由 our-codex-image 生成（src/assets/party/card.webp）。动效只动 transform / opacity。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Game } from '../world/game';
import { ORDER_NAME, type PartyMember, type PartyOrder } from '../world/party';
import { STYLE_DEF, type StyleK } from '../world/fellows';
import { audio } from '../world/audio';
import cardUrl from '../assets/party/card.webp';
import './party.css';
import { newWatch, watchHp, type HpWatch } from './hpfx';
import { MateSeal } from './FeudHud';
import { bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';   // 恩怨重做：队友有没有被人盯上

const ORDERS: PartyOrder[] = ['follow', 'focus', 'free', 'wait', 'retreat'];
/** 恩怨重做 · 第二批的战术指令：掩护、包抄、护着我撤、别杀他（world/enyuan.ts） */
const TACTICS: PartyOrder[] = ['cover', 'flank', 'escort', 'spare'];
const ORDER_SEAL: Record<PartyOrder, string> = { follow: '随', focus: '攻', free: '散', wait: '候', retreat: '退', cover: '掩', flank: '抄', escort: '护', spare: '留' };
const ORDER_TIP: Partial<Record<PartyOrder, string>> = { cover: '挡在你和来敌之间，专打冲你来的', flank: '绕到锁定目标背后打，伤害高些', escort: '你撤，他断后，只打贴近你的', spare: '下令时锁定的那个人留活口' };
const MY_STYLES: (StyleK | null)[] = [null, 'hunt', 'herb', 'bandit', 'mentor'];
const MY_NAME: Record<string, string> = { hunt: '猎妖', herb: '采药', bandit: '劫道', mentor: '传道', caravan: '护商' };

/** 指令菜单。手机上左中这一栏又缩又短（zoom + overflow），菜单放在里面只露两行：手机上挂到画面最外层、固定在左上 */
function MenuBox({ cls, children }: { cls: string; children: ReactNode }) {
  const box = <div className={cls + (IS_TOUCH ? ' pf-menu-touch' : '')} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>{children}</div>;
  if (!IS_TOUCH || typeof document === 'undefined') return box;
  return createPortal(box, document.querySelector('.game-root') ?? document.body);
}

function Card({ m, game, open, setOpen }: { m: PartyMember; game: Game; open: boolean; setOpen: (id: string | null) => void }) {
  const prev = useRef(m.hp);
  const [hit, setHit] = useState(0);
  const hpEl = useRef<HTMLDivElement>(null), hpW = useRef<HpWatch | null>(null);
  useEffect(() => { if (m.hp < prev.current - 0.005) setHit((x) => x + 1); prev.current = m.hp; if (hpW.current) watchHp(hpW.current, hpEl.current, m.hp, undefined, 'hp', true); else hpW.current = newWatch(m.hp); }, [m.hp]);   // r11-lock：队伍框用轻量版碎玉
  const st = m.style ? STYLE_DEF[m.style as StyleK] : undefined;
  const low = m.hp < 0.3 && m.down <= 0;
  return (
    <div className={'pf-card' + (m.down > 0 ? ' down' : '') + (low ? ' low' : '') + (open ? ' open' : '')}
      onClick={(e) => { e.stopPropagation(); audio.sfx('click'); setOpen(open ? null : m.id); }} title={`${m.name}（${m.realm}）——点一下下指令`}>
      <div className="pf-face" style={m.portrait ? { backgroundImage: `url(${m.portrait})` } : undefined}>
        {m.down > 0 && <span className="pf-down">{Math.ceil(m.down)}</span>}
      </div>
      <div className="pf-frame" style={{ backgroundImage: `url(${cardUrl})` }} />
      <MateSeal n={m.feud ?? 0} />
      <div className="pf-main">
        <div className="pf-name"><b>{m.name}</b><small>{m.realm}</small>{st && <i className="pf-style" style={{ background: st.color }} title={st.name}>{st.seal}</i>}</div>
        <div className="pf-bar hp" ref={hpEl} title={`气血 ${Math.round(m.hp * 100)}%`}><i className="ghost" style={{ transform: `scaleX(${m.hp})` }} /><i className="fill" style={{ transform: `scaleX(${m.hp})` }} />{hit > 0 && <i className="flash" key={hit} />}</div>
        <div className="pf-bar mp" title={`法力 ${Math.round(m.mp * 100)}%`}><i className="fill" style={{ transform: `scaleX(${m.mp})` }} /></div>
        <div className="pf-tags">
          <em className={'pf-ord o-' + m.order}>{ORDER_SEAL[m.order]}·{ORDER_NAME[m.order]}</em>
          {m.down > 0 && <em className="pf-tag gray">调息</em>}
          {m.ying && <em className="pf-tag gold">出窍</em>}
          {low && <em className="pf-tag red">告急</em>}
          {m.dazi && <em className="pf-tag dazi" title="固定搭档：一直跟着你；有自己的底线">搭</em>}
          {m.off && <em className="pf-off"><i style={{ transform: `rotate(${m.ang}rad)` }}>➤</i>{m.dist} 丈</em>}
        </div>
      </div>
      {open && <MenuBox cls="pf-menu">
        <div className="pf-menu-sep">{m.name} · 指令</div>
        {ORDERS.map((o) => <button key={o} className={m.order === o ? 'on' : ''} onClick={() => { audio.sfx('click'); game.party.order(m.id, o); setOpen(null); }}><span>{ORDER_SEAL[o]}</span>{ORDER_NAME[o]}</button>)}
        <div className="pf-menu-sep">战术</div>
        {TACTICS.map((o) => <button key={o} className={'tac' + (m.order === o ? ' on' : '')} title={ORDER_TIP[o]} onClick={() => { audio.sfx('click'); game.party.order(m.id, o); setOpen(null); }}><span>{ORDER_SEAL[o]}</span>{ORDER_NAME[o]}</button>)}
        {(m.dazi || m.canDazi) && <DaziBtns m={m} game={game} done={() => setOpen(null)} />}
      </MenuBox>}
    </div>
  );
}

/** 第三批：搭档（world/dazi.ts）——设为固定搭档 / 问问他的打算 / 请他先回去 */
function DaziBtns({ m, game, done }: { m: PartyMember; game: Game; done: () => void }) {
  const d = game.npcs.byId.get(m.id); if (!d) return null;
  const why = m.canDazi ? game.dazi.why(d) : '';
  return <>
    <div className="pf-menu-sep">搭档</div>
    {m.dazi ? <>
      <button className="tac" onClick={() => { audio.sfx('click'); done(); const n = game.dazi.propNode(); if (n) game.openDialog(n); }}><span>议</span>问问打算</button>
      <button onClick={() => { audio.sfx('click'); done(); game.dazi.unset(d); }}><span>辞</span>请他先回去</button>
    </> : <button className="tac" disabled={!!why} title={why || '一直跟着你、战斗里听指令；他有自己的底线'} onClick={() => { audio.sfx('click'); done(); game.dazi.set(d); }}><span>搭</span>设为固定搭档{why && <small>{why}</small>}</button>}
  </>;
}

export function PartyFrames({ game, party }: { game: Game; party: PartyMember[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pick, setPick] = useState(false);
  // 恩怨重做：全体指令菜单——点队伍框上的「令」，或带着队友交战时按打坐键（打坐在战斗里用不上）
  const [all, setAll] = useState(false);
  useEffect(() => { const E = game.enyuan; E.onMenu = (o) => setAll(o); return () => { if (E.onMenu) E.onMenu = undefined; }; }, [game]);
  const closeAll = () => { setAll(false); game.enyuan.menuOpen = false; };
  useEffect(() => { if (!open && !pick && !all) return; const off = () => { setOpen(null); setPick(false); closeAll(); }; window.addEventListener('pointerdown', off); return () => window.removeEventListener('pointerdown', off); }, [open, pick, all]);
  if (!party.length) return null;
  const my = game.fellows.myStyle;
  return (
    <div className="pf-col" onPointerDown={(e) => e.stopPropagation()}>
      <div className="pf-head">
        <button className="pf-style-btn" style={my ? { borderColor: STYLE_DEF[my].color } : undefined} onClick={() => { audio.sfx('click'); setPick(!pick); setOpen(null); }}>
          {my ? <><i style={{ background: STYLE_DEF[my].color }}>{STYLE_DEF[my].seal}</i>作风·{MY_NAME[my]}</> : '定作风'}<span>▾</span>
        </button>
        <button className={'pf-cmd-btn' + (all ? ' on' : '')} title={`队伍指令（交战时按 ${keyLabel(bindOf('sit'))}）`} onClick={() => { audio.sfx('click'); const o = !all; setAll(o); game.enyuan.menuOpen = o; setOpen(null); setPick(false); }}>令{!IS_TOUCH && <kbd>{keyLabel(bindOf('sit'))}</kbd>}</button>
        {all && <MenuBox cls="pf-menu pf-menu-all">
          <div className="pf-menu-sep">全体 · 战术</div>
          {TACTICS.map((o) => <button key={o} className="tac" title={ORDER_TIP[o]} onClick={() => { audio.sfx('click'); game.party.orderAll(o); closeAll(); }}><span>{ORDER_SEAL[o]}</span>{ORDER_NAME[o]}<small>{ORDER_TIP[o]}</small></button>)}
          <div className="pf-menu-sep">全体 · 基本</div>
          {ORDERS.map((o) => <button key={o} onClick={() => { audio.sfx('click'); game.party.orderAll(o); closeAll(); }}><span>{ORDER_SEAL[o]}</span>{ORDER_NAME[o]}</button>)}
        </MenuBox>}
        {pick && <div className="pf-styles">
          {MY_STYLES.map((k) => <button key={k ?? 'none'} className={my === k ? 'on' : ''} onClick={() => { audio.sfx('click'); game.fellows.setMyStyle(k); setPick(false); }}>
            {k ? <i style={{ background: STYLE_DEF[k].color }}>{STYLE_DEF[k].seal}</i> : <i className="none">无</i>}
            <b>{k ? MY_NAME[k] : '不定作风'}</b><small>{k ? STYLE_DEF[k].player : '同行者各凭本心，不立规矩。'}</small>
          </button>)}
        </div>}
      </div>
      {party.map((m) => <Card key={m.id} m={m} game={game} open={open === m.id} setOpen={setOpen} />)}
      {party.length > 1 && <div className="pf-all">
        {ORDERS.map((o) => <button key={o} title={`全体${ORDER_NAME[o]}`} onClick={() => { audio.sfx('click'); game.party.orderAll(o); }}>{ORDER_SEAL[o]}</button>)}
      </div>}
    </div>
  );
}
