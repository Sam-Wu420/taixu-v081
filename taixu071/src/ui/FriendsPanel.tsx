// v0.54：友人录（H）——同行 · 知交 · 邀约
import { useEffect, useState } from 'react';
import type { Game } from '../world/game';
import type { NpcData } from '../world/npc';
import { PERS_NAME } from '../world/npc';
import { TIER_COLOR, TIER_TEXT_COLOR } from '../world/relations';
import { audio } from '../world/audio';
import { dirName } from '../world/sites';
import { Bust } from './ModalLayer';

type Tab = 'party' | 'friends' | 'hearts' | 'invites';

export function FriendsBody({ game }: { game: Game }) {
  const F = game.friends;
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  useEffect(() => { const t = setInterval(re, 700); return () => clearInterval(t); }, []);
  const party = F.party(), friends = F.friends(), invs = F.S.invites.filter((i) => !i.done && !i.declined);
  const extraSos = game.activeSosTargets().filter((t) => !t.inviteId);
  const hasUrgent = invs.some((i) => !i.accepted || i.kind === 'help') || extraSos.length > 0;
  const [tab, setTab] = useState<Tab>(hasUrgent ? 'invites' : party.length ? 'party' : 'friends');
  const [sel, setSel] = useState<string>('');
  const [msg, setMsg] = useState('');
  const say = (s: string) => { setMsg(s); audio.sfx('click'); re(); };
  const farLabel = (x: number, y: number) => `${dirName(x - game.player.x, y - game.player.y)}方约 ${Math.max(1, Math.round(Math.hypot(x - game.player.x, y - game.player.y) / 260))} 里`;
  const goDirect = (x: number, y: number, title: string, followNpcId?: string, jadeId?: number) => {
    audio.sfx('click');
    if (jadeId) {
      const j = game.war.inbox.find((v) => v.id === jadeId);
      if (j && !j.accepted) j.accepted = true;
    }
    game.navigateTo(x, y, title, followNpcId);
    game.closeModal();
  };
  const row = (d: NpcData, extra?: JSX.Element) => {
    const tier = game.rel.tier(d);
    return (
      <div key={d.id} className={'fr-row' + (sel === d.id ? ' on' : '')} onClick={() => { setSel(d.id); audio.sfx('click'); }}>
        <div className="fr-main">
          <b>{d.name}</b><small className="fr-tier" style={{ color: TIER_TEXT_COLOR[tier] }}>{tier}</small>
          <span>
            {F.realmOf(d)}{F.sectName(d) ? ` · ${F.sectName(d)}` : ''} · {PERS_NAME[d.pers]} · 好感 {Math.round(game.renxin?.shownFavor?.(d) ?? d.favor)}
            {F.where(d) !== '同行中' ? <>　<em>{F.where(d)}</em></> : null}
          </span>
        </div>
        {extra}
      </div>
    );
  };
  const cur = sel ? game.npcs.byId.get(sel) : null;
  const curA = cur ? game.npcs.activeOf(cur.id) : null;
  return (
    <>
      <div className="tabs">
        {([['party', `同行 ${party.length}/${F.partyMax()}`], ['friends', `知交 ${friends.length}`], ['invites', `邀约求援 ${invs.length + extraSos.length}${hasUrgent ? ' ●' : ''}`]] as [Tab, string][]).map(([k, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); setMsg(''); }}>{n}</button>)}
      </div>
      {msg && <div className="fr-msg">{msg}</div>}
      <div className="bag-wrap">
        <div className="skill-list">
          {tab === 'party' && <>
            {party.length === 0 && <div className="hint">眼下孤身一人。到「知交」里邀人同行（当面相邀，或好感 40 以上可传音），最多三人。</div>}
            {party.map((a) => row(a.d, <div className="fr-acts">
              <button className="mini" onClick={(e) => { e.stopPropagation(); F.setWait(a.d, !F.isWaiting(a.d)); say(F.isWaiting(a.d) ? `${a.d.name}：「我在此等你。」` : `${a.d.name}跟了上来。`); }}>{F.isWaiting(a.d) ? '跟上' : '等候'}</button>
              <button className="mini" onClick={(e) => { e.stopPropagation(); F.dismiss(a.d); say(`${a.d.name}离队了。`); }}>散去</button>
            </div>))}
            {party.length > 1 && <div className="fr-acts wide"><button className="ink-btn" onClick={() => { F.waitAll(true); say('同行者都在原地等你。'); }}>全体等候</button><button className="ink-btn" onClick={() => { F.waitAll(false); say('同行者都跟了上来。'); }}>全体跟上</button></div>}
          </>}
          {tab === 'friends' && <>
            {friends.length === 0 && <div className="hint">还没有知交。与人论道、送礼、并肩作战、解人之围都能攒下交情（好感 30 以上即为好友）。</div>}
            {friends.map((d) => row(d, curA?.act === 'follow' && cur?.id === d.id ? undefined : <div className="fr-acts">
              {game.npcs.activeOf(d.id)?.act !== 'follow' && <button className="mini" disabled={F.partyFull()} onClick={(e) => { e.stopPropagation(); say(F.invite(d)); }}>{F.where(d) === '就在附近' ? '邀其同行' : '传音相邀'}</button>}
            </div>))}
          </>}
          {tab === 'invites' && <>
            {invs.length === 0 && extraSos.length === 0 && <div className="hint">暂无邀约与求援。好友会不时传音约你同探古修洞府，或向你求援——有真有假，赴约前多留个心眼。</div>}
            {extraSos.map((t) => (
              <div key={t.id} className="fr-inv help">
                <div className="fr-inv-h"><b>{t.name}</b><small>{t.tag} · {t.detail} · {farLabel(t.x, t.y)}</small></div>
                <div className="fr-inv-t">{t.title}</div>
                <div className="fr-acts">
                  <button className="ink-btn jade" onClick={() => goDirect(t.x, t.y, t.title, t.followNpcId, t.jadeId)}>{game.canFly ? '直接御剑前往' : '直接导航前往'}</button>
                </div>
              </div>
            ))}
            {invs.map((inv) => { const d = game.npcs.byId.get(inv.npc); return (
              <div key={inv.id} className={'fr-inv' + (inv.kind === 'help' ? ' help' : '')}>
                <div className="fr-inv-h"><b>{d?.name ?? '故人'}</b><small>{inv.kind === 'help' ? '求援' : '同探'} · {inv.place} · {farLabel(inv.x, inv.y)} · 还剩 {Math.max(0, Math.ceil(inv.until - game.day))} 日</small></div>
                <div className="fr-inv-t">{F.inviteText(inv)}</div>
                <div className="fr-acts">
                  {!inv.accepted ? <>
                    <button className="ink-btn jade" onClick={() => { audio.sfx('click'); F.acceptAndGo(inv); game.closeModal(); }}>{game.canFly ? '应约并御剑前往' : '应约并直接导航'}</button>
                    <button className="ink-btn" onClick={() => { F.accept(inv); say(`已应约：去${inv.place}。地图上标了「约」。`); }}>仅应约</button>
                    <button className="ink-btn" onClick={() => { F.decline(inv); say('你婉言回绝了。'); }}>回绝</button>
                  </> : <>
                    <button className="ink-btn jade" onClick={() => goDirect(inv.x, inv.y, `${d?.name ?? '故人'} · ${inv.place}`)}>{game.canFly ? '直接御剑前往' : '直接导航前往'}</button>
                    <span className="hint">已应约（地图标「约」）</span>
                  </>}
                </div>
              </div>); })}
          </>}
        </div>
        <div className="bag-detail">
          {cur ? <>
            <div className="fr-bust"><Bust look={game.npcs.look(cur)} w={150} h={180} /></div>
            <div className="bd-name">{cur.name}<small>　{F.realmOf(cur)}{F.sectName(cur) ? ` · ${F.sectName(cur)}` : ''}</small></div>
            <div className="bd-type">{PERS_NAME[cur.pers]} · {game.rel.tier(cur)} · {cur.age | 0} 岁 · 居{F.home(cur) || '无定所'} · {F.where(cur)}</div>
            {cur.plan && <div className="bd-desc">眼下打算：{(cur.plan as any).why ?? (cur.plan as any).k ?? ''}</div>}
            <div className="hint">同行的友人会替你出手、替你挡刀。交情越深，越肯为你冒险——可人心隔肚皮，约你去荒僻之处的，未必都是好意。</div>
          </> : <div className="hint">选一位友人查看详情。</div>}
        </div>
      </div>
    </>
  );
}

export function FriendsPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const F = game.friends;
  const party = F.party(), friends = F.friends(), invs = F.S.invites.filter((i) => !i.done && !i.declined);
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="scroll-panel cult-panel wide fr-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><div className="panel-title">江湖人物 · 友人</div><div className="panel-sub">同行 {party.length}/{F.partyMax()}{F.S.remote.length ? `（另有 ${F.S.remote.length} 人在路上）` : ''} · 知交 {friends.length} · 邀约 {invs.length}</div><button className="close-btn" onClick={onClose}>×</button></div>
        <div className="cult-body">
          <FriendsBody game={game} />
        </div>
      </div>
    </div>
  );
}
