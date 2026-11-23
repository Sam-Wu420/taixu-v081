// 恩怨重做：顶上的热度血印——有人在找你时亮起，几枚就是几级热度（world/feud.ts）。
// 每半秒看一眼 game.rel.feud.topMarks()，变了才重画；只动 opacity / transform（见记忆：HUD 动画不用 filter / box-shadow）。
import { useEffect, useState } from 'react';
import type { Game } from '../world/game';
import sealUrl from '../assets/feud/seal.webp';
import cardUrl from '../assets/feud/card.webp';
import stampFirstUrl from '../assets/feud/stamp_first.webp';
import stampDefUrl from '../assets/feud/stamp_def.webp';
import warrantUrl from '../assets/feud/warrant.webp';
import { realmName } from '../data/realms';
import { LOC_BY_ID } from '../data/world';
import { registerIcons } from '../gfx/icons';
import yirongUrl from '../assets/feud/icon_yirong.webp';
import chuanxunUrl from '../assets/feud/icon_chuanxun.webp';
registerIcons({ pill_yirong: yirongUrl, tal_chuanxun: chuanxunUrl });   // 恩怨重做：易容丹、传讯符的物品图标（our-codex-image 生成）
import './feud.css';
import './enyuan.css';
import { audio } from '../world/audio';
import { DZ_LIMIT } from '../world/dazi';

const LV = ['', '记恨', '寻仇', '追索', '追杀', '血海深仇', '不死不休'];

export function FeudHud({ game }: { game: Game }) {
  const [m, setM] = useState(0);
  const [who, setWho] = useState('');
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const F = game.rel?.feud;
      const n = F ? F.topMarks() : 0;
      setM((o) => (o === n ? o : n));
      const top = n > 0 && F ? F.rows().find((r) => r.marks === n) : undefined;
      const w = top ? `${top.d.name}${top.hunting ? ' 正在找你' : ''}` : '';
      setWho((o) => (o === w ? o : w));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => { alive = false; window.clearInterval(id); };
  }, [game]);
  if (m <= 0) return null;
  return (
    <div className={'feud-hud lv' + m} title={`有人在找你：热度 ${m} 级（${LV[m]}）。人脉录 → 恩怨 页可看详情`}>
      <div className="fh-seals">
        {[1, 2, 3, 4, 5, 6].map((i) => <img key={i} className={i <= m ? 'on' : ''} src={sealUrl} alt="" draggable={false} />)}
      </div>
      <div className="fh-txt"><b>{LV[m]}</b><span>{who}</span></div>
    </div>
  );
}

/** 队伍框里的小血印（0–3） */
export function MateSeal({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className={'pf-feud n' + n} title={`有人盯上了他（${n} 级）`}><img src={sealUrl} alt="" draggable={false} />{n > 1 ? <b>{n}</b> : null}</span>;
}

/** 第三批：恩怨页下面的搭档栏——当前搭档、能请来做搭档的伴侣 / 义兄弟 / 师徒（world/dazi.ts） */
function DaziRow({ game }: { game: Game }) {
  const D = game.dazi, cur = D.cur(), list = D.candidates().filter((d) => d !== cur).slice(0, 5);
  const [, re] = useState(0);
  if (!cur && !list.length) return null;
  return (
    <div className="fp-dazi">
      <b>搭档</b>
      <span className="fp-dz-tip">伴侣、义兄弟、师徒可以做固定搭档：一直跟着你，战斗里听队伍指令。他们有自己的底线——你太狠，会劝你、离开你，甚至反目成仇。</span>
      {cur && <div className="fp-dz-row on"><i>{D.tie(cur)}</i><em>{cur.name}</em><small>{realmName(cur.realm, cur.stage)} · 能忍 {Math.max(0, (DZ_LIMIT[cur.pers] ?? 3) - (cur.dzQ ?? 0))} 回{cur.dzW ? ' · 劝过你' : ''}</small>
        <button onClick={(e) => { e.stopPropagation(); audio.sfx('click'); const n = D.propNode(); if (n) game.openDialog(n); }}>问问打算</button>
        <button onClick={(e) => { e.stopPropagation(); audio.sfx('click'); D.unset(cur); re((x) => x + 1); }}>请他先回去</button></div>}
      {list.map((d) => { const why = D.why(d); return (
        <div key={d.id} className="fp-dz-row"><i>{D.tie(d)}</i><em>{d.name}</em><small>{why || realmName(d.realm, d.stage)}</small>
          <button disabled={!!why} onClick={(e) => { e.stopPropagation(); audio.sfx('click'); D.set(d); re((x) => x + 1); }}>设为搭档</button></div>
      ); })}
    </div>
  );
}

/** 人脉录「恩怨」页：谁在找你、为什么、谁先动的手、热度几级、多久后放弃、认不认得你、现在能用哪几种化解办法 */
export function FeudPage({ game, onPick }: { game: Game; onPick?: (id: string) => void }) {
  const F = game.rel.feud, rows = F.rows();
  const S = game.rel.S as { sectFoe?: Record<string, string> };
  const warn = (game.ws.flags as { feudWarn?: { day: number; id: string; dir: string; li: number } }).feudWarn;
  const disguised = F.disguised(), dl = Math.max(0, Math.ceil(((game.ws.flags as { yirong?: number }).yirong ?? 0) - game.day));
  return (
    <div className="feud-page">
      <div className="fp-head">
        <span>热度看血印：三枚以上才会主动追杀，以下只在路上撞见时对峙。点「化解」可赔礼、退还、托人说和、请宗门长辈、立心魔誓、约生死斗。随游玩时间自然消退（一日只有两息，按日算太快，所以按真实玩了多久算）；换地图、远离出事的地方、回宗门闭关都退得更快；追杀扑空一次降一档，连扑三次空就认栽。</span>
        {disguised && <b className="fp-dis">易容中 · 余 {dl} 日：仇家认不出你</b>}
      </div>
      {rows.length === 0 && <div className="hint">眼下没人在找你——愿你一直这样走下去。</div>}
      {rows.map((r) => {
        const d = r.d, first = r.by === 'hero';
        const near = warn && warn.id === d.id && game.day - warn.day < 3 ? `${warn.dir}约 ${warn.li} 里外等你` : '';
        return (
          <div key={d.id} className={'fp-card' + (r.hunting ? ' hunt' : '') + (r.marks >= 3 ? ' hot' : '')} style={{ backgroundImage: `url(${cardUrl})` }} onClick={() => onPick?.(d.id)}>
            {(d.grudge ?? 0) > 0 && <div className="fp-act"><button title="赔礼、退还、托人说和、请宗门长辈、立心魔誓、约生死斗" onClick={(e) => { e.stopPropagation(); audio.sfx('click'); game.openDialog(game.enyuan.reconcileNode(d)); }}>化解</button></div>}
            <div className={'fp-stamp ' + (first ? 'first' : 'def')} style={{ backgroundImage: `url(${first ? stampFirstUrl : stampDefUrl})` }}><span>{first ? '先手' : r.by === 'npc' ? '自卫' : '旧账'}</span></div>
            <div className="fp-main">
              <div className="fp-name"><b>{d.name}</b><small>{d.realm ? realmName(d.realm, d.stage) : '凡人'}{d.sect ? ' · ' + (LOC_BY_ID.get(d.sect)?.name ?? '') : ''}</small>
                <span className="fp-seals">{[1, 2, 3, 4, 5, 6].map((i) => <img key={i} className={i <= r.marks ? 'on' : ''} src={sealUrl} alt="" draggable={false} />)}</span></div>
              <div className="fp-why">{(d.grudge ?? 0) >= 2 ? '血仇' : '旧怨'}：{r.why}</div>
              <div className="fp-meta">
                <span>{first ? '你先动的手' : r.by === 'npc' ? `对方那边先动的手` : '旧账，说不清谁先'}</span>
                <span>{r.hunting ? (near || '正在找你') : r.marks >= 3 ? '会来追杀' : '不会主动追杀'}</span>
                <span>{r.quitIn ? `约再 ${r.quitIn} 分钟（游玩）后放弃追杀` : r.marks >= 3 ? '' : '热度低'}</span>
                <span className={r.know ? 'bad' : 'good'}>{r.know ? '认得你' : '认不出你'}</span>
                {(d.miss ?? 0) > 0 && <span>已扑空 {d.miss} 次</span>}
                {r.warned && <span className="good">已收{S.sectFoe?.[d.id] ? '宗门通缉' : '宗门警告帖'}</span>}
              </div>
              <div className="fp-ways">化解：{r.ways.join(' · ')}</div>
            </div>
          </div>
        );
      })}
      <DaziRow game={game} />
      {game.ws.sect && <div className="fp-warrant" style={{ backgroundImage: `url(${warrantUrl})` }}><b>{LOC_BY_ID.get(game.ws.sect.id)?.name}护短帖</b><span>门下弟子在宗门地界内被以大欺小，巡山弟子与长老必来相护；在远处被追杀，执法堂给对方送去警告帖；不听警告的，列为宗门仇敌，同盟诸派见之必究。</span>{rows.filter((r) => r.warned).map((r) => <em key={r.d.id}>已警告：{r.d.name}{S.sectFoe?.[r.d.id] ? '（已列为宗门仇敌）' : ''}</em>)}</div>}
    </div>
  );
}
