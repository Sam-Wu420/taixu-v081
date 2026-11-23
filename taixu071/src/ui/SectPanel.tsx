// v0.71 · 宗门面板——把散在对话树里的宗主事务收进一处
//   本宗：概览 / 门人名册 / 分派差事 / 山门求拜者 / 藏经阁 / 宗门建设（含护宗大阵）/
//         库房与用度 / 亲卫随行 / 宗门战事 / 收徒规矩 / 自创功法 / 大事记
// 逻辑仍在各自系统里（world/mysect.ts、world/sectwar.ts），面板只换表现层：
// 一切动作都调公开方法（mysect.guide / grantPill / breakthrough / chargeZhen / …），不另写一套规则。
// v0.62 之后新增的宗主事——抽成与保底线、冲关用度与资格、宗门气运、三阵型护宗大阵、
// 亲卫随行、百人会战与天下共讨——都在这里有了正式的一页，不再藏在一层层对话里。
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { audio } from '../world/audio';
import { ARTS, SCHOOL_NAME, TIER_COLOR, TIER_NAME, effectiveSpellMp, profLevel, type ArtSkill } from '../data/arts';
import { SkillIcon } from './SkillIcon';
import { DAO_NAME, MY_SECT_ID, SCALE_NAME } from '../data/sects';
import { ACTIVE_MAP, ACTIVE_WORLD, LOC_BY_ID, MAP_NAME, WORLD_SCALE } from '../data/world';
import { worldCurrencyId, worldCurrencyName, worldDef } from '../data/worldHierarchy';
import { GONGFA } from '../data/skills';
import { itemDef } from '../data/items';
import { REALMS, realmName } from '../data/realms';
import { bagCount, INSIGHT } from '../world/cultivation';
import { lowerWorldSectRecords, SECT_RANKS } from '../world/worldstate';
import {
  BREAK_COST, BT_RULE_TEXT, DEFAULT_MASTER_AUTO, JOB_TEXT, RANK_TEXT, ROOT_TEXT, SECT_POLICY_INFO, STONE_STEPS, ZHEN_COST, ZHEN_MODE,
  type Disciple, type Job, type MasterAutoFlags, type SectPolicy, type ZhenMode,
} from '../world/mysect';
import { AIRSHIP_BUILD_SPEC, AIRSHIP_MAT_STONE_PRICE } from '../world/warairship';
import { SECT_ELDER, SECT_HOSTILE, SECT_SIEGE } from '../world/relations';
import { Scroll } from './ModalLayer';

export type SectNav = 'overview' | 'roster' | 'jobs' | 'apps' | 'library' | 'build' | 'vault' | 'guard' | 'war' | 'rules' | 'arts' | 'log';
type CoreSectNav = 'overview' | 'roster' | 'library' | 'build' | 'guard' | 'war';

const NAV: { id: CoreSectNav; t: string }[] = [
  { id: 'overview', t: '山门概览' },
  { id: 'roster', t: '门人调遣' },
  { id: 'library', t: '藏经自创' },
  { id: 'build', t: '基建库房' },
  { id: 'guard', t: '亲卫随心' },
  { id: 'war', t: '宗门战事' },
];
const toCoreNav = (n?: SectNav): CoreSectNav => {
  if (n === 'roster' || n === 'jobs' || n === 'apps' || n === 'rules') return 'roster';
  if (n === 'library' || n === 'arts') return 'library';
  if (n === 'build' || n === 'vault') return 'build';
  if (n === 'guard') return 'guard';
  if (n === 'war') return 'war';
  return 'overview';
};
const JOB_ORDER: Job[] = ['xiu', 'ye', 'shou', 'li'];
const JOB_DESC: Record<Job, string> = {
  xiu: '进境最快，宗门高手主要靠他们；也各有一份小进项。',
  ye: '月月灵石进项最多（按抽成归宗主供奉），修炼减半。',
  shou: '外敌来犯时战力 ×1.6，山门被劫时先挡在前面。',
  li: '带回灵石、妖丹、功法卷轴，也可能一去不回。',
};
const ART_COST = [500, 800, 3000, 12000, 40000];

const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.max(0, Math.min(100, (a / b) * 100)));
/** 与某派的声望对应的人话（阈值与 world/relations 里那套一致） */
const repWord = (v: number) => (v <= SECT_ELDER ? '长老出手' : v <= SECT_SIEGE ? '围剿' : v <= SECT_HOSTILE ? '敌视' : v <= -15 ? '冷淡' : v >= 30 ? '友善' : '中立');
const fmt = (n: number) => (n >= 100000000 ? `${Math.round(n / 100000000 * 10) / 10} 亿` : n >= 10000 ? `${Math.round(n / 1000) / 10} 万` : `${Math.floor(n)}`);
/** 灰按钮旁边的「为什么点不了」——手机上没有 hover，必须写出来 */
function Lock({ why }: { why?: string }) { return why ? <span className="sect-lock">{why}</span> : null; }

/** 藏经阁一格：照 060 的样式——与储物袋同一套格子，已收录的绿框 + 「已录」角标 */
function ArtSlot({ a, done, on, onPick }: { a: ArtSkill; done?: boolean; on?: boolean; onPick?: () => void }) {
  return (
    <button className={'slot' + (done ? ' done' : '') + (on ? ' on' : '')} onClick={onPick}
      aria-pressed={!!on}
      title={`《${a.name}》　${TIER_NAME[a.tier]} · ${SCHOOL_NAME[a.school]}${done ? '（已收录）' : '（点击查看 / 录入）'}`}>
      <SkillIcon id={a.id} className="glyph" imgClassName="glyph art-ico" style={{ color: TIER_COLOR[a.tier] }} fallbackText={a.school.slice(0, 1)} />
      <span className="nm">{a.name}</span>
      <span className="cnt">{TIER_NAME[a.tier].replace('阶', '')}</span>
      {done && <span className="lib-done">已录</span>}
    </button>
  );
}

export function SectPanel({ game, onClose, initial, initialTab }: { game: Game; onClose: () => void; initial?: SectNav; initialTab?: 'mine' | 'world' }) {
  const S = game.mysect;
  const my = game.ws.mySect;
  // 老档可能缺字段（v0.60 之前的档、被模组动过的档）：进来先补齐，只补 undefined，幂等。
  // 不补的话，下面任何一处 `.length` 都会把整页渲染打断——表现就是「点了像没反应」。
  if (my) {
    my.ds ??= []; my.apps ??= []; my.lib ??= []; my.log ??= []; my.gifts ??= [];
    my.halls ??= { lib: 0, dan: 0, zhen: 0, ling: 0, dock: 0 };
    my.halls.dock ??= 0;
  }
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const [nav, setNav] = useState<CoreSectNav>(() => toCoreNav(initial));
  const [rosterSub, setRosterSub] = useState<'roster' | 'jobs' | 'apps' | 'rules'>(() => (initial === 'jobs' || initial === 'apps' || initial === 'rules') ? initial : 'roster');
  const [libSub, setLibSub] = useState<'library' | 'arts'>(() => initial === 'arts' ? 'arts' : 'library');
  const [buildSub, setBuildSub] = useState<'build' | 'vault'>(() => initial === 'vault' ? 'vault' : 'build');
  const [showAllLog, setShowAllLog] = useState<boolean>(() => initial === 'log');
  const [sel, setSel] = useState(-1);
  const [rootFilter, setRootFilter] = useState(-1);
  const [page, setPage] = useState(0);
  const [kick, setKick] = useState(-1);
  const [flash, setFlash] = useState('');
  const [libConfirm, setLibConfirm] = useState('');
  const [libTier, setLibTier] = useState(-1);
  const [libOnly, setLibOnly] = useState(false);
  const [libSel, setLibSel] = useState('');
  const [guardWarn, setGuardWarn] = useState(false);
  const [tab, setTab] = useState<'mine' | 'world'>(initialTab ?? 'mine');
  const [swFilter, setSwFilter] = useState<'all' | 'da' | 'zhong' | 'xiao'>('all');
  const [swWarOnly, setSwWarOnly] = useState(false);
  /** 天下宗门里的两页：名录 / 风声（最紧的几对） */
  const [swTab, setSwTab] = useState<'list' | 'hot'>('list');
  const [selSect, setSelSect] = useState('');
  /** 名录滚到底再往下点，详情可能落在屏外——点一行就把它拉进来（桌面两栏本来就在视野里，不会动） */
  const detailRef = useRef<HTMLDivElement | null>(null);
  const reveal = () => requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  /** 一闪而过的确认（「已录入」「已拨入」）——两秒半后自己退场，别在页面上留成一条常驻状态 */
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 2600);
    return () => clearTimeout(t);
  }, [flash]);
  const [declarePick, setDeclarePick] = useState('');
  // 面板开着时游戏是暂停的：数据只会因本面板的动作而变，动作自己会 re()，不再定时整页重渲染
  const act = (f: () => void, sfx: 'click' | 'chime' | 'fail' | 'open' = 'click') => {
    try { audio.sfx(sfx); } catch { /* 音频没解锁不能拖累命令 */ }
    try { f(); } catch (err) { console.error('[sect] 动作出错', err); } finally { re(); }
  };

  const sw = game.sectwar;
  /** 调兵 / 看战报（细节仍在 sectwar 的对话树里：百人会战、破阵、发落都在那） */
  const openWar = (w: any) => { audio.sfx('open'); game.openDialog(sw.myWarNode(w)); };

  // ---------------------------------------------------------------- 天下宗门 & 战事（全局可用，未立派亦可观天下大势）
  const DAO_DOT: Record<string, string> = { zheng: '#2f6b5e', mo: '#a8352a', fo: '#b8862a', yao: '#7a3a9a', zhong: '#7a7a70' };
  const World = () => {
    if (!sw) return <div className="hint">战事系统尚未启用。</div>;
    const all = sw.sects(ACTIVE_MAP);
    const W: Record<string, number> = { da: 0, zhong: 1, xiao: 2 };
    const ids = all
      .filter((sid) => (swFilter === 'all' || sw.scale(sid) === swFilter) && (!swWarOnly || !!sw.warOf(sid)))
      .sort((a, b) => (W[sw.scale(b)] ?? 3) - (W[sw.scale(a)] ?? 3) || sw.alive(b) - sw.alive(a));
    const cur = selSect && ids.includes(selSect) ? selSect : ids[0] ?? '';
    const hot = sw.hotPairs(20);
    const gone = sw.goneSects();
    const SectDetail = (sid: string) => {
      const doc = sw.doctrine(sid), holds = sw.holdsOf(sid), arts = sw.arts(sid);
      const loc = LOC_BY_ID.get(sid), sameMap = !!loc && loc.map === ACTIVE_MAP;
      const rel = my ? sw.tension(MY_SECT_ID, sid) : 0, feud = my ? sw.feudWhy(MY_SECT_ID, sid) : '';
      const rep = game.rel.sectRep(sid);
      const war = sw.warOf(sid), wi = war ? sw.warBrief(war) : null;
      const sp = sw.supplyOf(sid);
      const fl = sw.fleetSummary(sid);
      const rivals = all.filter((x) => x !== sid).map((x) => ({ x, t: sw.tension(sid, x) }))
        .filter((o) => o.t >= 30).sort((a, b) => b.t - a.t).slice(0, 3);
      const can = my ? sw.canDeclare(sid) : { ok: false, why: '尚未开宗立派' };
      return (<>
        <div className="bd-name">{sw.name(sid)}<small>　{SCALE_NAME[sw.scale(sid)]} · {DAO_NAME[sw.dao(sid)]} · 门人 {sw.alive(sid)}/{sw.cap(sid)}</small></div>
        {sid !== MY_SECT_ID && (
          <div className="sw-rel">
            {my && <>
              <span>两派之间：<b>{sw.relName(MY_SECT_ID, sid)}</b><small className="hint">（紧张度 {Math.round(rel)}，满 100 开战）</small></span>
              <div className="sect-bar"><u style={{ width: pct(rel, 100) + '%', ...(rel >= 55 ? { background: 'linear-gradient(90deg,#c86a3a,#e8a05a)' } : {}) }} /></div>
            </>}
            <div className="sw-line">
              <b>声望</b>
              <span>你与它门下结的账：<b className={rep <= SECT_HOSTILE ? 'low' : ''}>{Math.round(rep)}（{repWord(rep)}）</b>
                {rep <= SECT_SIEGE ? '　—— 执法堂已在调人，踏入它的地界要当心' : ''}</span>
            </div>
            {feud && <div className="sw-feud">世仇：{feud}</div>}
            {sw.allyName(sid) && <div className="sw-line"><b>同盟</b><span>{sw.allyName(sid)}</span></div>}
          </div>
        )}
        <div className="sw-line"><b>战备</b><span>疗伤丹 {Math.round(sp.pills)}/{sp.maxPills} · 军费灵石 {fmt(sp.stones)} · 阵材 {Math.round(sp.mats)}</span></div>
        <div className="sw-line"><b>舟师</b><span>一阶灵舟 {fl.intact.t1}（闲 {fl.avail.t1}）· 二阶战舰 {fl.intact.t2} · 三阶巨舟 {fl.intact.t3}{fl.building.length ? ` · 在建 ${fl.building.length}` : ''}</span></div>
        <div className="sw-line">
          <b>据点</b>
          <span className="sw-holds-inline">
            {holds.length
              ? holds.map((id) => <span key={id} className="sw-hold">{LOC_BY_ID.get(id)?.name ?? id}<em>{sw.S.hold[id]?.g ?? 0}</em></span>)
              : <span className="hint">山门之外别无据点</span>}
          </span>
        </div>
        <div className="sw-line"><b>宗法</b><span>{doc.gf ? `《${doc.gf}》· ` : ''}{doc.name}（攻 ×{doc.atk} · 守 ×{doc.def}）</span></div>
        {!!arts.length && <div className="sw-line"><b>秘传</b><span>{arts.join('、')}</span></div>}
        {!!rivals.length && <div className="sw-line"><b>恩怨</b><span>{rivals.map((o) => `${sw.name(o.x)}（${sw.relName(sid, o.x)}）`).join(' · ')}</span></div>}
        {wi && (
          <div className="sw-war">
            <div className="sw-war-t"><b>{wi.title}</b>{wi.zm && <em>正魔之争</em>}</div>
            <div className="sw-war-m">争 <b>{wi.target}</b> · 第 {wi.wave + 1} 阵 · {wi.attName} 主攻 · 折损 {wi.la}/{wi.lb}</div>
            <div className="sect-row-acts">
              {wi.mine && <button className="ink-btn small jade" onClick={() => act(() => { const raw = sw.S.wars.find((x) => x.id === wi.id); if (raw) openWar(raw); }, 'open')}>调兵 / 守御</button>}
              {!wi.mine && war && (() => {
                const mySide = sw.sideOf(war);
                return mySide !== undefined
                  ? <button className="ink-btn small jade" onClick={() => act(() => { game.openDialog(sw.warCampNode(war, mySide)); }, 'open')}>赴前线帅帐</button>
                  : <button className="ink-btn small ghost" onClick={() => act(() => { game.openDialog(sw.warNode(war)); }, 'open')}>观战 / 投效一方</button>;
              })()}
            </div>
          </div>
        )}
        <div className="sect-row-acts">
          {sid === MY_SECT_ID ? (
            <span className="hint">本宗的据点与守御之策在「宗门战事」页里办。</span>
          ) : (<>
            <button className="ink-btn small ghost" disabled={!sameMap}
              title={sameMap ? '在地图上标出它的山门' : `该派在${MAP_NAME[loc?.map ?? 'renjie']}，先过去再指路`}
              onClick={() => {
                if (!loc || !sameMap) return;
                audio.sfx('click'); game.setDestination(loc.x * WORLD_SCALE, loc.y * WORLD_SCALE, sw.name(sid));
                game.toast(`已在地图上标出${sw.name(sid)}山门`, 'good'); onClose();
              }}>在地图上指路</button>
            {my && (wi?.mine
              ? <button className="ink-btn small jade" onClick={() => act(() => { const raw = sw.S.wars.find((x) => x.id === wi.id); if (raw) openWar(raw); }, 'open')}>调兵 · 看战报</button>
              : declarePick === sid
                ? (<>
                  <button className="ink-btn small" style={{ background: 'var(--vermilion)', color: '#fff' }}
                    onClick={() => act(() => { const w = sw.declareOn(sid); setDeclarePick(''); if (w) { setFlash(`已向${sw.name(sid)}宣战`); openWar(w); } else setFlash('宣战不成：门人不足十二，或停战期未满'); }, 'open')}>确定宣战</button>
                  <button className="ink-btn small ghost" onClick={() => { setDeclarePick(''); audio.sfx('click'); }}>取消</button>
                </>)
                : <button className="ink-btn small" disabled={!can.ok} title={can.why} onClick={() => { audio.sfx('click'); setDeclarePick(sid); }}>向它宣战</button>)}
            {my && !can.ok && !wi?.mine && <Lock why={can.why} />}
          </>)}
        </div>
      </>);
    };
    return (<>
      <div className="sect-tabs sw-subtabs">
        <button className={swTab === 'list' ? 'on' : ''} onClick={() => { audio.sfx('click'); setSwTab('list'); }}>名录（{all.length}）</button>
        <button className={swTab === 'hot' ? 'on' : ''} onClick={() => { audio.sfx('click'); setSwTab('hot'); }}>
          风声{hot.length ? `（${hot.length}）` : ''}
        </button>
        <button style={{ marginLeft: 'auto' }} onClick={() => act(() => { game.openDialog(game.war.meritShopNode()); }, 'open')}>
          战功兑换（{game.war?.merit ?? 0}）
        </button>
      </div>
      {swTab === 'list' ? (<>
      <div className="sect-tabs">
        <button className={swFilter === 'all' ? 'on' : ''} onClick={() => { audio.sfx('click'); setSwFilter('all'); }}>全部（{all.length}）</button>
        {(['da', 'zhong', 'xiao'] as const).map((k) => (
          <button key={k} className={swFilter === k ? 'on' : ''} onClick={() => { audio.sfx('click'); setSwFilter(k); }}>
            {SCALE_NAME[k]}（{all.filter((s) => sw.scale(s) === k).length}）
          </button>
        ))}
        <button className={swWarOnly ? 'on' : ''} onClick={() => { audio.sfx('click'); setSwWarOnly((v) => !v); }}>{swWarOnly ? '✓ ' : ''}只看交战</button>
      </div>
      {((sw.S.branch ?? []).length > 0 || gone.length > 0) && (
        <div className="hint">
          {(sw.S.branch ?? []).length > 0 && <><b>本宗分宗（分舵）：</b>{(sw.S.branch ?? []).map((id) => sw.name(id)).join('、')}　</>}
          {gone.length > 0 && <>已除名的宗门：{gone.join('、')}</>}
        </div>
      )}
      <div className="sect-cols">
        <div className="sect-list">
          {ids.map((sid) => {
            const war = sw.warOf(sid);
            return (
              <button key={sid} className={cur === sid ? 'on' : ''}
                onClick={() => { audio.sfx('click'); setSelSect(sid); reveal(); }}>
                <span className="dl-top"><b><i className="sw-dot" style={{ background: DAO_DOT[sw.dao(sid)] ?? '#7a7a70' }} />{sw.name(sid)}{sid === MY_SECT_ID ? '（本宗）' : ''}{war ? ' ⚔' : ''}</b></span>
                <span className="dl-mid">{SCALE_NAME[sw.scale(sid)]} · {sw.alive(sid)} 人</span>
                <span className="dl-bot">{sid === MY_SECT_ID ? '本宗' : my ? sw.relName(MY_SECT_ID, sid) : `声望 ${Math.round(game.rel.sectRep(sid))}`}</span>
              </button>
            );
          })}
          {!ids.length && <div className="hint">没有符合条件的门派——换个筛选看看。</div>}
        </div>
        <div className="sect-detail" ref={detailRef}>
          {cur ? SectDetail(cur) : <div className="hint">左侧还没有门派可选。</div>}
        </div>
      </div>
      </>) : (
        <div className="sw-hot-list">
          <div className="hint">
            本图还没打起来、却已经绷到极限的几对：紧张度满 100 必有战事；世仇难解，争灵脉、夺秘境都会往上添火。
            眼下已开战的两家不列在这儿——它们都在「名录 · 只看交战」或「宗门战事」里。
          </div>
          {!hot.length && <div className="hint">眼下四境相安，没有哪两派绷到要动手的地步。</div>}
          {hot.map((h) => {
            const feud = sw.feudWhy(h.a, h.b);
            const zm = (sw.dao(h.a) === 'mo') !== (sw.dao(h.b) === 'mo');
            return (
              <div key={h.a + h.b} className={'sw-hot' + (h.t >= 80 ? ' hot' : '')}>
                <div className="sw-hot-t">
                  <b>{h.an}</b><span>×</span><b>{h.bn}</b>
                  <em>{h.word} {Math.round(h.t)}</em>
                </div>
                <div className="sw-hot-m">
                  {DAO_NAME[sw.dao(h.a)]} × {DAO_NAME[sw.dao(h.b)]}
                  {feud ? ` · 世仇：${feud}` : ''}{zm ? ' · 正魔之争' : ''}　门人 {sw.alive(h.a)} / {sw.alive(h.b)}
                </div>
                <div className="sect-bar"><u style={{ width: pct(h.t, 100) + '%', ...(h.t >= 55 ? { background: 'linear-gradient(90deg,#c86a3a,#e8a05a)' } : {}) }} /></div>
                <div className="sect-row-acts">
                  <button className="ink-btn small ghost" onClick={() => { audio.sfx('click'); setSelSect(h.a); setSwFilter('all'); setSwWarOnly(false); setSwTab('list'); }}>看{h.an}</button>
                  <button className="ink-btn small ghost" onClick={() => { audio.sfx('click'); setSelSect(h.b); setSwFilter('all'); setSwWarOnly(false); setSwTab('list'); }}>看{h.bn}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {flash && <div className="sect-flash">✓ {flash}</div>}
    </>);
  };

  // ---------------------------------------------------------------- 未立派
  if (!my) {
    const req = S.foundReq();
    const curId = worldCurrencyId(ACTIVE_WORLD);
    const curName = worldCurrencyName(ACTIVE_WORLD);
    const foundCost = S.foundBagCost();
    const curHave = bagCount(game.hero, curId);
    const realmOk = game.hero.realm >= 4;
    const moneyOk = curHave >= foundCost;
    const judge = realmOk && moneyOk;   // 前两条过了，「立在山门」才有判的必要
    const lowerRecords = lowerWorldSectRecords(game.ws, ACTIVE_WORLD);
    return (
      <Scroll title={tab === 'world' ? '天下宗门 & 战事' : '开宗立派'} sub={tab === 'world' ? <span>本图 {sw?.sects(ACTIVE_MAP).length ?? 0} 派 · 战阵、战备与据点一览</span> : <span>{ACTIVE_WORLD === 'human' ? '元婴之后，可自立山门、称宗道祖' : `${worldDef(ACTIVE_WORLD).name}之中，可重新开宗立派，不与下界旧山门冲突`}</span>} onClose={onClose} wide={tab === 'world'} cls="sect-panel">
        <div className="sect-head-tabs">
          <button className={tab === 'mine' ? 'on' : ''} onClick={() => { audio.sfx('click'); setTab('mine'); }}>开宗立派</button>
          <button className={tab === 'world' ? 'on' : ''} onClick={() => { audio.sfx('click'); setTab('world'); }}>天下宗门 & 战事</button>
          {tab === 'world' && <span className="hint" style={{ marginLeft: 'auto' }}>本图 {sw?.sects(ACTIVE_MAP).length ?? 0} 派</span>}
        </div>
        {tab === 'world' ? (
          <div className="sect-world">{World()}</div>
        ) : (
          <>
            <div className="sect-hero">
              <div>
                <div className="sh-name">山门未立</div>
                <div className="sh-sub">
                  {ACTIVE_WORLD === 'human'
                    ? '元婴修士可于脚下这片山水立派：四方求仙者慕名来投，你可收徒传功、开坛讲法、自创功法刊行天下。'
                    : `你已踏足${worldDef(ACTIVE_WORLD).name}：下界宗门已封存留守，此界可自由拜入上界大宗，或在脚下另立新山门。`}
                </div>
              </div>
            </div>
            {lowerRecords.length > 0 && (
              <div className="found-list" style={{ marginBottom: 10 }}>
                {lowerRecords.map((rec) => {
                  const wName = worldDef(rec.world).name;
                  const regent = rec.mySect?.masterId !== undefined
                    ? rec.mySect.ds?.find((d) => d.id === rec.mySect!.masterId)?.name
                    : undefined;
                  const sectLoc = rec.sect ? LOC_BY_ID.get(rec.sect.id)?.name ?? rec.sect.id : '';
                  return (
                    <div key={rec.world} className="found-req">
                      <b>{wName}履历</b>
                      <span>
                        {rec.mySect ? `自建「${rec.mySect.name}」（${regent ? `代掌门 ${regent} 留守` : '护宗长老守山'}）` : ''}
                        {rec.mySect && rec.sect ? ' · ' : ''}
                        {rec.sect ? `曾任${sectLoc}${SECT_RANKS[rec.sect.rank] ?? ''}` : ''}
                      </span>
                      <em className="ok">已归档</em>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="sec-title">立派须备<small>四件事缺一不可</small></div>
            <div className="found-list">
              <div className="found-req">
                <b>境界</b><span>元婴期（现 {realmName(game.hero.realm, game.hero.stage)}）</span>
                <em className={realmOk ? 'ok' : 'no'}>{realmOk ? '✔' : '✘'}</em>
              </div>
              <div className="found-req">
                <b>{curName}</b><span>{fmt(curHave)} / {fmt(foundCost)}（买地、立山门、布护山阵）</span>
                <em className={moneyOk ? 'ok' : 'no'}>{moneyOk ? '✔' : '✘'}</em>
              </div>
              <div className="found-req">
                <b>立在山门</b>
                <span>不近别派山门、不在秘境、脚下是陆地{judge && !req.ok ? `　——　${req.why}` : ''}</span>
                <em className={judge ? (req.ok ? 'ok' : 'no') : 'none'}>{judge ? (req.ok ? '✔' : '✘') : '—'}</em>
              </div>
              <div className="found-req">
                <b>自立门户</b>
                <span>若在别派门下，立派即等同辞别（身份高者以礼相送，否则算叛出）</span>
                <em className="none">—</em>
              </div>
            </div>
            <div className="sect-row-acts">
              <button className="ink-btn jade" disabled={!req.ok} onClick={() => { audio.sfx('open'); game.openDialog(S.foundNode()); }}>开宗立派</button>
              {!req.ok && <span className="sect-lock" style={{ display: 'inline' }}>{req.why}</span>}
            </div>
            {game.ws.myArts?.length ? <div className="hint">你有 {game.ws.myArts.length} 门自创功法，尚需先有宗门才能刊行天下。</div> : null}
          </>
        )}
      </Scroll>
    );
  }

  // ---------------------------------------------------------------- 公用数据
  const bal = S.balance();
  const money = bal.total;
  const zmax = S.zhenMax(), ze = Math.floor(Math.min(my.zhenE ?? 0, zmax));
  const zname = ZHEN_MODE[my.zhenMode ?? 'shou'][0];
  const scale = S.scale();
  const sorted = [...my.ds].sort((a, b) => b.rank - a.rank || b.realm - a.realm || b.stage - a.stage || b.root - a.root);
  const mieN = sw ? (sw.S.mieN ?? 0) : 0;
  const scaleBar = my.fame >= 1800
    ? { txt: '已是本界大宗（上限 400 人）', ratio: 100 }
    : my.fame >= 600
      ? { txt: `中宗门 → 大宗门（还差 ${Math.ceil(1800 - my.fame)} 威望）`, ratio: pct(my.fame - 600, 1200) }
      : { txt: `小宗门 → 中宗门（还差 ${Math.ceil(600 - my.fame)} 威望）`, ratio: pct(my.fame, 600) };

  // 本月账本（概览与库房共用一份算法）：
  //   进项 = 门人进项 + 据点 + 分舵 + 附庸；归宗主 =（前三者按抽成）+ 附庸全额；
  //   支出 = 门人月例 + 本月真要冲关的几笔（没人够格就是 0，「冲关用度」只是上限）。
  const L = (() => {
    const m = S.monthly();
    const cut = my.cut ?? 0.3;
    const si = sw ? sw.myMonthlyIncome() : { holds: 0, branch: 0, vassal: 0 };
    const bt = S.btForecast();
    const inflow = m.income + si.holds + si.branch + si.vassal;
    const toLord = Math.round((m.income + si.holds + si.branch) * cut) + si.vassal;
    return { m, cut, cutPct: Math.round(cut * 100), si, bt, inflow, toLord, upkeep: m.upkeep, net: inflow - toLord - m.upkeep - bt.expect };
  })();

  // ---------------------------------------------------------------- 概览
  const Overview = () => {
    const cnt = new Array(REALMS.length).fill(0);
    for (const d of my.ds) cnt[Math.max(0, Math.min(REALMS.length - 1, d.realm))]++;
    const realmList = my.map === 'xianjie'
      ? [12, 11, 10, 9, 8]
      : my.map === 'lingjie'
        ? [8, 7, 6, 5, 4]
        : [4, 3, 2, 1, 0];
    for (let r = REALMS.length - 1; r >= 0; r--) if (cnt[r] > 0 && !realmList.includes(r)) realmList.push(r);
    const teachCd = Math.ceil(30 - (game.day - my.lastTeach));
    const war = sw?.S.wars.find((w) => w.a === MY_SECT_ID || w.b === MY_SECT_ID);
    const qiGain = Math.round(S.qiFill() * INSIGHT * 100);
    return (<>
      <div className="sect-hero">
        <div>
          <div className="sh-name">{my.name}</div>
          <div className="sh-sub">{SCALE_NAME[scale]}（上限 {S.cap()} 人）· {DAO_NAME[my.dao]} · 立派 {Math.floor((game.day - my.founded) / 360)} 年 · 山门在{MAP_NAME[my.map]}</div>
        </div>
        <div className="sh-tags">
          <span className="sh-tag">{S.fameName()}</span>
          <span className="sh-tag">威望 {Math.floor(my.fame)}</span>
          <span className="sh-tag">战力 {Math.round(S.power())}</span>
        </div>
      </div>
      <div className="sect-scale">
        <div className="sect-bar"><u style={{ width: scaleBar.ratio + '%' }} /></div>
        <small>{scaleBar.txt}</small>
      </div>
      <div className="sect-chips">
        <span className="sect-chip"><b>核心门人</b>{my.ds.length}/{S.cap()}</span>
        <span className="sect-chip"><b>外门战兵</b>{S.outerAlive()}/{S.outerCap()}</span>
        <span className="sect-chip"><b>杂役</b>{S.servantAlive()}/{S.servantCap()}</span>
        <span className="sect-chip"><b>总人数</b>{S.totalAlive()}</span>
        <span className="sect-chip"><b>库房</b>{bal.curScale > 1 ? `${fmt(bal.vaultNative)} ${bal.curName}` : fmt(bal.vault)}</span>
        <span className="sect-chip"><b>储物袋</b>{bal.curScale > 1 ? `${fmt(bal.bagNative)} ${bal.curName}` : fmt(bal.bag)}</span>
        {my.tribute >= 1 && <span className="sect-chip gold"><b>待领供奉</b>{fmt(my.tribute)}</span>}
        <span className="sect-chip"><b>气运</b>{Math.floor(my.qi ?? 0)}/{S.qiCap()}</span>
        <span className="sect-chip"><b>护宗大阵</b>{zmax ? `${zname} ${ze}/${zmax}` : '未布阵'}</span>
        <span className="sect-chip"><b>亲卫</b>{(my.guard ?? []).length}/{S.guardCap()}</span>
        <span className="sect-chip"><b>藏经阁</b>{my.lib.length}/{S.libCap()}</span>
      </div>
      {war && (
        <div className="sect-warn">
          <b>战事未了</b>：{sw!.name(war.a)} ⚔ {sw!.name(war.b)}（第 {war.wave + 1} 阵·折损 {war.la}/{war.lb}）
          <button className="ink-btn small" onClick={() => { setNav('war'); audio.sfx('click'); }}>去宗门战事</button>
        </div>
      )}
      <div className="sect-row-acts">
        <button className="ink-btn small jade" disabled={!my.ds.length || teachCd > 0}
          onClick={() => act(() => { S.teach(); setFlash('开坛讲法三日：门人获益良多，自己也有所悟'); }, 'chime')}>
          开坛讲法{teachCd > 0 ? `（还须 ${teachCd} 日）` : '（三日）'}
        </button>
        {my.tribute >= 1 || (my.gifts?.length ?? 0) > 0
          ? <button className="ink-btn small" onClick={() => act(() => { const r = S.collect(); setFlash(`收下供奉${bal.curName} ${r.stones}${r.gifts ? `、门人献礼 ${r.gifts} 件` : ''}`); }, 'chime')}>
            收取供奉{my.tribute >= 1 ? `（${fmt(my.tribute)}）` : ''}
          </button>
          : <span className="hint">暂无待领供奉</span>}
        <button className="ink-btn small" disabled={S.qiFill() < 0.1}
          onClick={() => act(() => { S.claimQi(); setFlash('万众归心：汲取宗门气运，修为精进'); }, 'chime')}>
          汲取气运（约本层 +{qiGain}%）
        </button>
        {my.apps.length > 0 && <button className="ink-btn small" onClick={() => { setNav('roster'); setRosterSub('apps'); audio.sfx('click'); }}>山门求拜者 {my.apps.length} 人</button>}
        {my.ds.length > 0 && <button className="ink-btn small ghost" onClick={() => { setNav('roster'); setRosterSub('jobs'); audio.sfx('click'); }}>分派差事</button>}
      </div>
      {flash && <div className="sect-flash">✓ {flash}</div>}
      <div className="sec-title">太上退居 · 掌门施政<small>{S.masterDisciple() ? `现任掌门：${S.masterDisciple()!.name}（你居太上长老之位）` : '当前宗主亲政（可在「门人名册」委任忠心真传/长老为掌门）'}</small></div>
      <div className="sect-row-acts" style={{ flexWrap: 'wrap' }}>
        {(['cultivate', 'war', 'economy', 'diplomacy'] as SectPolicy[]).map((p) => (
          <button key={p}
            className={'ink-btn small' + ((my.policy ?? 'cultivate') === p ? ' jade' : ' ghost')}
            title={SECT_POLICY_INFO[p].desc}
            onClick={() => act(() => { S.setPolicy(p); setFlash(`宗门方针定为「${SECT_POLICY_INFO[p].name}」`); }, 'click')}>
            {SECT_POLICY_INFO[p].name}
          </button>
        ))}
        {S.masterDisciple() && (
          <button className="ink-btn small"
            onClick={() => act(() => { if (S.reclaimPower()) setFlash('已收回宗主大权亲政'); }, 'chime')}>
            收回大权亲政
          </button>
        )}
      </div>
      <div className="hint" style={{ marginBottom: 6 }}>
        当前方针：{SECT_POLICY_INFO[my.policy ?? 'cultivate'].desc}
        {!S.masterDisciple() && '（未委任掌门前，方针暂不自动月度调度）'}
      </div>
      {S.masterDisciple() && (() => {
        const auto: Required<MasterAutoFlags> = { ...DEFAULT_MASTER_AUTO, ...my.masterAuto };
        const items: [keyof MasterAutoFlags, string][] = [
          ['recruit', '自动招徒规矩'],
          ['promote', '自动晋升育才'],
          ['build', '自动建殿大阵'],
          ['lib', '自动藏经心法'],
          ['vault', '自动库房用度'],
          ['war', '自动战备外交'],
          ['guard', '自动编组亲卫护卫'],
        ];
        const allOn = items.every(([k]) => auto[k]);
        return (
          <div className="sect-row-acts" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="hint" style={{ alignSelf: 'center', marginRight: 4 }}>掌门全托管权限（可随时关闭某项由你亲理）：</span>
            <button
              className={'ink-btn small' + (allOn ? ' jade' : '')}
              onClick={() => act(() => { S.setAllMasterAuto(!allOn); setFlash(!allOn ? '全部宗门事务已交由掌门自动打理' : '全部宗门事务已改为太上亲理'); }, 'click')}>
              {allOn ? '✓ 全部托管中' : '一键全托管'}
            </button>
            {items.map(([k, label]) => (
              <button key={k}
                className={'ink-btn small' + (auto[k] ? ' jade' : ' ghost')}
                onClick={() => act(() => { S.setMasterAuto(k, !auto[k]); setFlash(`${label}已${!auto[k] ? '交由掌门自动打理' : '改为太上亲理'}`); }, 'click')}>
                {auto[k] ? `✓ ${label}` : `○ ${label}`}
              </button>
            ))}
          </div>
        );
      })()}
      <div className="sec-title">本月收支<small>抽成 {L.cutPct}% · 门人月例 {L.upkeep} · 保底线 {fmt(my.reserve ?? 0)} · 与「库房与用度」同一份账</small></div>
      <div className="sect-chips">
        <span className="sect-chip"><b>进项</b>{fmt(L.inflow)}</span>
        <span className="sect-chip gold"><b>归宗主</b>{fmt(L.toLord)}</span>
        <span className="sect-chip"><b>月例支出</b>{fmt(L.upkeep)}</span>
        <span className="sect-chip"><b>本月冲关</b>{fmt(L.bt.expect)}</span>
        <span className={'sect-chip' + (L.net < 0 ? ' crimson' : '')}><b>库房结余</b>{L.net > 0 ? `+${fmt(L.net)}` : fmt(L.net)}</span>
      </div>
      <div className="sec-title">门人境界<small>共 {my.ds.length} 人 · 入道 {my.ds.filter((d) => d.realm >= 1).length} 人</small></div>
      <div className="sect-tiles">
        {realmList.map((r) => (
          <div key={r} className="sect-tile">
            <b>{r === 0 ? '未入道' : `${REALMS[r]?.name ?? ''}期`}</b><span>{cnt[r]} 人</span>
            <div className="sect-bar"><u style={{ width: pct(cnt[r], my.ds.length) + '%' }} /></div>
          </div>
        ))}
      </div>
      <div className="sec-title">
        宗门大事记<small>第 {Math.floor(my.founded / 360) + 1} 年立派 · 击退来犯 {my.wins} 次 · 失守 {my.losses} 次 · 共 {my.log.length} 条</small>
        {my.log.length > 4 && (
          <button className="ink-btn small ghost" style={{ marginLeft: 'auto' }} onClick={() => { audio.sfx('click'); setShowAllLog((v) => !v); }}>
            {showAllLog ? '收起' : `展开全部（${Math.min(40, my.log.length)} 条）`}
          </button>
        )}
      </div>
      {my.log.length
        ? <div className="sect-log">{my.log.slice(showAllLog ? -40 : -4).reverse().map((l, i) => <div key={i} className="sect-log-row"><small>第 {Math.floor(l.d / 360) + 1} 年</small>{l.t}</div>)}</div>
        : <div className="hint">山门新立，还没有什么可记的事。</div>}
    </>);
  };

  // ---------------------------------------------------------------- 门人名册
  const DiscipleDetail = ({ d }: { d: Disciple }) => {
    const bi = S.breakInfo(d);
    const pillCost = S.pillCostOf(d);
    const taught = S.taughtRecently(d);
    const canUp = S.canPromote(d);
    const pillBlocked = money < pillCost || (bi.bottleneck && clampUnit(d.exp) >= 0.9);
    return (<>
      <div className="bd-name">{d.name}<small>　{RANK_TEXT[d.rank]} · {realmName(d.realm, d.stage)} · {ROOT_TEXT[d.root]}</small></div>
      <div className="bd-type">{Math.floor(d.age)} 岁（寿元约 {REALMS[d.realm]?.life ?? '—'} 年）· {JOB_TEXT[d.job]} · 忠诚 {Math.round(d.loyal)} · 习功法 {d.arts}/{my.lib.length}</div>
      <div className="sect-bar" style={{ margin: '6px 0 2px' }}><u style={{ width: pct(clampUnit(d.exp), 1) + '%' }} /></div>
      <div className="hint">本层进度 {Math.floor(clampUnit(d.exp) * 100)}% · 入门 {Math.floor((game.day - d.joined) / 360)} 年{bi.tries ? ` · 冲关已败 ${bi.tries} 次（回回添成算）` : ''}</div>
      {bi.bottleneck && (
        <div className="sect-bottle">
          <b>已至本境瓶颈</b>：再往上便是{REALMS[d.realm + 1]?.name ?? '下一境'}。
          冲关丹药钱 <b>{bi.cost}</b>（折合 {Math.max(1, Math.ceil(bi.cost / bal.curScale))} {bal.curName} · 保底线之上还有 {bi.spare}）、成算 <b>{Math.round(bi.chance * 100)}%</b>（灵根越好、丹房越高越有把握）。
          {!bi.eligible && <span className="low">　此人不在「冲关资格」之内——库房不会为他出这笔丹药钱。</span>}
          <br /><span className="hint">门人自己修为攒满的那个月也会自行冲关（同一套成算与花费，受「冲关用度」之限）；下面的按钮是宗主亲自主持，提前替他办。</span>
        </div>
      )}
      <div className="sect-row-acts">
        <button className="ink-btn small jade" disabled={taught}
          onClick={() => act(() => { if (S.guide(d)) setFlash(`指点${d.name}一日：修为进一大截、忠诚 +8`); }, 'chime')}>
          指点{taught ? '（近一月已指点）' : '（一日）'}
        </button>
        <button className="ink-btn small" disabled={pillBlocked}
          onClick={() => act(() => { if (S.grantPill(d)) setFlash(`赐 ${d.name} 丹药（${pillCost} 账面 · ${Math.max(1, Math.ceil(pillCost / bal.curScale))} ${bal.curName}）`); }, 'chime')}>
          赐丹（{bal.curScale > 1 ? `${Math.max(1, Math.ceil(pillCost / bal.curScale))} ${bal.curName}` : `${pillCost} 灵石`}）
        </button>
        {bi.bottleneck && (
          <button className="ink-btn small" disabled={!bi.ready || !bi.eligible || !bi.spareOk}
            onClick={() => act(() => { const r = S.breakthrough(d); setFlash(r.msg); }, 'chime')}>
            助其冲关（{bi.cost} · 成算 {Math.round(bi.chance * 100)}%）
          </button>
        )}
        <button className="ink-btn small" disabled={!canUp} title={S.promoteHint(d)}
          onClick={() => act(() => { if (S.promote(d)) setFlash(`${d.name}晋为${RANK_TEXT[d.rank]}`); }, 'chime')}>
          {d.rank >= 3 ? '已是长老' : `晋为${RANK_TEXT[d.rank + 1]}`}
        </button>
        {my.masterId === d.id ? (
          <button className="ink-btn small jade"
            onClick={() => act(() => { if (S.reclaimPower()) setFlash('已收回宗主大权亲政'); }, 'chime')}>
            现任掌门（点击收回亲政）
          </button>
        ) : (
          <button className="ink-btn small" disabled={d.loyal < 70 || (d.rank < 2 && d.realm < 3)}
            title={d.loyal < 70 ? '须忠诚 ≥ 70 方可托付宗政' : d.rank < 2 && d.realm < 3 ? '须真传弟子或结丹以上长老' : '退居太上长老，委任其按月代管宗门'}
            onClick={() => act(() => { const r = S.appointMaster(d); setFlash(r.msg); }, 'chime')}>
            委任掌门
          </button>
        )}
        <button className="ink-btn small ghost" onClick={() => { setKick(kick === d.id ? -1 : d.id); audio.sfx('click'); }}>逐出山门</button>
      </div>
      <div className="sect-row-acts">
        <span className="hint">改派：</span>
        {JOB_ORDER.map((j) => (
          <button key={j} className={'ink-btn small' + (d.job === j ? ' jade' : ' ghost')} disabled={d.job === j}
            onClick={() => act(() => { S.assignJob(d, j); setFlash(`${d.name}改派为「${JOB_TEXT[j]}」`); }, 'click')}>{JOB_TEXT[j]}</button>
        ))}
      </div>
      <div className="sect-row-acts" style={{ marginTop: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
        {taught && <Lock why="指点：近一月已经指点过了（隔一个月才能再指点）" />}
        {money < pillCost && <Lock why={`赐丹：还差 ${pillCost - money} 灵石（库房 ${bal.vault} + 储物袋 ${bal.bag}）`} />}
        {bi.bottleneck && clampUnit(d.exp) >= 0.9 && money >= pillCost && <Lock why="赐丹：修为已蓄至圆满，改点「助其冲关」" />}
        {bi.bottleneck && !bi.ready && <Lock why={`冲关：修为须满九成（现 ${Math.floor(clampUnit(d.exp) * 100)}%），先赐丹蓄力`} />}
        {bi.bottleneck && bi.ready && !bi.eligible && <Lock why="冲关：此人不在「冲关资格」之内（库房与用度 → 冲关资格）" />}
        {bi.bottleneck && bi.ready && bi.eligible && !bi.spareOk && <Lock why={`冲关：库房保底线之上还差 ${bi.cost - bi.spare} 灵石`} />}
        {!canUp && d.rank < 3 && <Lock why={`晋升：${S.promoteHint(d)}`} />}
      </div>
      {/* v0.71：忠诚流水——最近五条，涨绿跌红，写明缘由（月例的零头不记） */}
      {d.loyalLog?.length ? (
        <div className="loyal-log">
          <span className="hint">忠诚近况：</span>
          {d.loyalLog.map((l, i) => (
            <small key={i} className={l.v >= 0 ? 'up' : 'down'}>
              第 {Math.floor(l.d / 360) + 1} 年 · {Math.round(l.b)} {l.v >= 0 ? '+' : ''}{Math.round(l.v * 10) / 10} → <b>{Math.round(Math.min(100, Math.max(0, l.b + l.v)))}</b>（{l.w}）
            </small>
          ))}
        </div>
      ) : <div className="hint" style={{ marginTop: 4 }}>忠诚近况：平稳（只有月例的细碎增减）</div>}
      {kick === d.id && (
        <div className="sect-confirm">
          逐出之后此人不再算本宗门人，宗门战力与名册都少一人，亲卫名单里也会划掉他；他会带着本宗功法下山。
          {d.loyal >= 80 && <><br />（此人忠诚极高，逐出之后怕是要记恨你。）</>}
          <div className="sect-row-acts">
            <button className="ink-btn small" style={{ background: 'var(--bad, #a8352a)', color: '#fff' }}
              onClick={() => act(() => { S.expel(d); setKick(-1); setSel(-1); setFlash(`${d.name}已被逐出山门`); }, 'fail')}>
              确定：逐出{d.name}
            </button>
            <button className="ink-btn small ghost" onClick={() => { setKick(-1); audio.sfx('click'); }}>算了</button>
          </div>
        </div>
      )}
    </>);
  };

  const Roster = () => {
    // 灵根筛选 + 分页：大宗门四百人也翻得动，一页只铺 30 行（渲染与点击都轻）
    const list = sorted.filter((d) => rootFilter < 0 || d.root === rootFilter);
    const PER = 30;
    const pages = Math.max(1, Math.ceil(list.length / PER));
    const p = Math.min(page, pages - 1);
    const shown = list.slice(p * PER, p * PER + PER);
    const cur = list.find((d) => d.id === sel) ?? shown[0] ?? list[0];
    const cntRoot = (r: number) => sorted.filter((d) => d.root === r).length;
    const pick = (r: number) => { audio.sfx('click'); setRootFilter(r); setPage(0); setKick(-1); };
    return (<>
      <div className="sect-tabs roster-filter">
        <button className={rootFilter < 0 ? 'on' : ''} onClick={() => pick(-1)}>全部（{sorted.length}）</button>
        {[5, 4, 3, 2, 1].map((r) => (
          <button key={r} className={rootFilter === r ? 'on' : ''} onClick={() => pick(r)}>{ROOT_TEXT[r]}（{cntRoot(r)}）</button>
        ))}
        <span className="hint" style={{ marginLeft: 'auto' }}>共 {list.length} 人{rootFilter >= 0 ? ` · 只看${ROOT_TEXT[rootFilter]}` : ''}</span>
      </div>
      <div className="sect-cols">
        <div className="roster-col">
          <div className="sect-list">
            {shown.map((d) => {
              const bi = S.breakInfo(d);
              const on = cur?.id === d.id;
              return (
                <button key={d.id} className={on ? 'on' : ''} onClick={() => { setSel(d.id); setKick(-1); audio.sfx('click'); }}
                  title={`${ROOT_TEXT[d.root]} · ${Math.floor(d.age)} 岁 · ${JOB_TEXT[d.job]} · 忠诚 ${Math.round(d.loyal)}`}>
                  <span className="dl-top"><b>{d.name}</b><em>{RANK_TEXT[d.rank]}</em></span>
                  <span className="dl-mid">{realmName(d.realm, d.stage)} · {ROOT_TEXT[d.root]} · {Math.floor(d.age)} 岁</span>
                  <span className="dl-bot">
                    {JOB_TEXT[d.job]} · <i className={d.loyal < 40 ? 'low' : ''}>忠诚 {Math.round(d.loyal)}</i>
                    {' · '}{bi.bottleneck
                      ? (bi.ready && bi.eligible ? <b className="bt-tag">瓶颈 · 可冲关</b> : <span className="bt-wait">瓶颈 · 蓄力 {Math.floor(clampUnit(d.exp) * 100)}%</span>)
                      : `本层 ${Math.floor(clampUnit(d.exp) * 100)}%`}
                  </span>
                </button>
              );
            })}
              {!list.length && (
                <div className="hint">{rootFilter < 0 ? '尚无门人——去「山门求拜者」收几个，或把山门开大些。' : `门下没有${ROOT_TEXT[rootFilter]}弟子。`}</div>
              )}
          </div>
          {pages > 1 && (
            <div className="roster-pager">
              <button className="ink-btn small ghost" disabled={p <= 0} onClick={() => { audio.sfx('click'); setPage(p - 1); }}>上一页</button>
              <span>第 {p + 1} / {pages} 页　·　每页 {PER} 人</span>
              <button className="ink-btn small ghost" disabled={p >= pages - 1} onClick={() => { audio.sfx('click'); setPage(p + 1); }}>下一页</button>
            </div>
          )}
        </div>
        <div className="sect-detail">
          {cur ? DiscipleDetail({ d: cur }) : <div className="hint">选择左侧一名门人。</div>}
        </div>
      </div>
    </>);
  };

  // ---------------------------------------------------------------- 分派差事
  const Jobs = () => {
    const cnt: Record<Job, number> = { xiu: 0, ye: 0, shou: 0, li: 0 };
    for (const d of my.ds) cnt[d.job]++;
    const total = my.ds.length || 1;
    const setAll = (j: Job) => {
      const n = my.ds.filter((d) => d.job !== j).length;
      for (const d of my.ds) S.assignJob(d, j);
      game.updateUI(true);
      setFlash(n ? `已将 ${n} 名门人改派为「${JOB_TEXT[j]}」` : `全派本就在「${JOB_TEXT[j]}」，没有变动`);
    };
    const presets: { label: string; f: (d: Disciple, i: number) => Job }[] = [
      { label: '均衡安排（修炼六成 · 产业二成 · 守山一成 · 历练一成）', f: (_d, i) => (i % 10 < 6 ? 'xiu' : i % 10 < 8 ? 'ye' : i % 10 < 9 ? 'shou' : 'li') },
      { label: '全力修炼', f: () => 'xiu' },
      { label: '广开财路（外门尽数打理产业）', f: (d) => (d.rank === 0 ? 'ye' : 'xiu') },
      { label: '严守山门（筑基以上半数守山）', f: (d, i) => (d.realm >= 2 && i % 2 === 0 ? 'shou' : d.rank === 0 ? 'ye' : 'xiu') },
      { label: '遣筑基以上弟子下山历练', f: (d) => (d.realm >= 2 && d.rank < 3 ? 'li' : d.job === 'li' ? 'xiu' : d.job) },
    ];
    const apply = (p: { label: string; f: (d: Disciple, i: number) => Job }) => {
      sorted.forEach((d, i) => S.assignJob(d, p.f(d, i)));
      game.updateUI(true);
      const c: Record<Job, number> = { xiu: 0, ye: 0, shou: 0, li: 0 };
      for (const d of my.ds) c[d.job]++;
      setFlash(`「${p.label.replace(/（.*?）/g, '')}」已生效：修炼 ${c.xiu} · 产业 ${c.ye} · 守山 ${c.shou} · 历练 ${c.li}`);
    };
    return (<>
      <div className="sect-tiles">
        {JOB_ORDER.map((j) => {
          const all = my.ds.length > 0 && cnt[j] === my.ds.length;
          return (
            <div key={j} className={'sect-tile' + (all ? ' on' : '')}>
              <b>{JOB_TEXT[j]}</b><span>{cnt[j]} 人</span>
              <div className="sect-bar"><u style={{ width: pct(cnt[j], total) + '%' }} /></div>
              <small>{JOB_DESC[j]}</small>
              <button className={'ink-btn small sect-tile-btn' + (all ? ' jade' : ' ghost')} disabled={!my.ds.length || all}
                onClick={() => act(() => setAll(j), 'chime')}>{all ? '全派已在此' : '全派改派到此'}</button>
            </div>
          );
        })}
      </div>
      {flash && <div className="sect-flash">✓ {flash}</div>}
      <div className="sec-title">成套分派<small>按宗门眼下局面一键重排（门人按身份、境界排序后再排）</small></div>
      <div className="sect-row-acts">
        {presets.map((p) => <button key={p.label} className="ink-btn small ghost" title={p.label} onClick={() => act(() => apply(p), 'chime')}>{p.label.replace(/（.*?）/g, '')}</button>)}
      </div>
      <div className="hint">
        修炼：进境最快，出高手靠它。产业：进项最多（按抽成归宗主供奉），修炼减半。守山：外敌来犯时战力 ×1.6。
        历练：带回灵石、妖丹、卷轴，也可能一去不回。想单独调某一个人，去「门人名册」里点他。
      </div>
      <div className="sec-title">眼下各人的差事<small>共 {my.ds.length} 人</small></div>
      <div className="sect-tbl scroll-x">
        <div className="sect-tr tbl head"><span>门人</span><span>身份</span><span>境界</span><span>差事</span><span>忠诚</span><span>本层</span></div>
        {sorted.slice(0, 14).map((d) => (
          <div key={d.id} className="sect-tr tbl" onClick={() => { setSel(d.id); setNav('roster'); audio.sfx('click'); }}>
            <b>{d.name}</b><small>{RANK_TEXT[d.rank]}</small><small>{realmName(d.realm, d.stage)}</small><small>{JOB_TEXT[d.job]}</small>
            <small className={d.loyal < 40 ? 'low' : ''}>{Math.round(d.loyal)}</small><small>{Math.floor(clampUnit(d.exp) * 100)}%</small>
          </div>
        ))}
        {my.ds.length > 14 && <div className="hint">只列出前 14 人——其余去「门人名册」查看。</div>}
      </div>
    </>);
  };

  // ---------------------------------------------------------------- 山门求拜者
  const Apps = () => {
    const full = my.ds.length >= S.cap();
    return (<>
      <div className="sect-chips">
        <span className="sect-chip"><b>门人</b>{my.ds.length}/{S.cap()}</span>
        <span className="sect-chip"><b>山门</b>{my.open ? '大开' : '紧闭'}</span>
        <span className="sect-chip"><b>门槛</b>{ROOT_TEXT[my.minRoot]}以上</span>
        <span className="sect-chip"><b>收录</b>{my.auto ? '执事径直收录' : '宗主亲自过目'}</span>
      </div>
      <div className="sect-row-acts">
        <button className="ink-btn small jade" disabled={full || !my.apps.length} onClick={() => act(() => { S.takeAll('all'); setFlash('合乎门槛的求拜者尽数收入门墙'); }, 'chime')}>尽数收下</button>
        <button className="ink-btn small" disabled={full || !my.apps.length} onClick={() => act(() => { S.takeAll('root3'); setFlash('只收了三灵根以上（带艺投师的散修照收）'); }, 'chime')}>只收三灵根以上</button>
        <button className="ink-btn small ghost" disabled={!my.apps.length} onClick={() => act(() => { S.rejectAll(); setFlash('一概婉拒，山门清净'); }, 'fail')}>一概婉拒</button>
        <button className="ink-btn small ghost" onClick={() => { setNav('roster'); setRosterSub('rules'); audio.sfx('click'); }}>收徒规矩</button>
      </div>
      {full && <Lock why="门墙已满：修聚灵大阵、提升威望（小宗门 120 → 中宗门 200 → 大宗门 400）" />}
      {flash && <div className="sect-flash">✓ {flash}</div>}
      <div className="sec-title">山门外候着 {my.apps.length} 人<small>灵根越好修得越快：天灵根一日抵伪灵根五日</small></div>
      {!my.apps.length && <div className="hint">眼下无人候在山门外。山门开着、威望渐长，四方的求仙者自会循名而来。</div>}
      <div className="sect-tbl">
        {my.apps.slice(0, 12).map((a, i) => (
          <div key={a.name + i} className="sect-tr apps">
            <b>{a.name}</b>
            <small>{a.sex === 'f' ? '女' : '男'} · {Math.floor(a.age)} 岁</small>
            <small className={a.root >= 4 ? 'low' : ''}>{ROOT_TEXT[a.root]} · {realmName(a.realm, a.stage)}</small>
            <small className="sect-app-note">{a.note}</small>
            <button className="ink-btn small" disabled={full} onClick={() => act(() => { if (S.takeApplicant(a)) setFlash(`${a.name}拜入山门`); }, 'chime')}>收下</button>
          </div>
        ))}
        {my.apps.length > 12 && <div className="hint">还有 {my.apps.length - 12} 人在山下排着队。</div>}
      </div>
      <div className="hint">带艺投师的散修来了就能派上用场；三灵根、双灵根、天灵根修得快，也更容易冲关破境。</div>
    </>);
  };

  // ---------------------------------------------------------------- 藏经阁
  // 版式照搬 060：上面三块统计（收录进度 / 修炼加成 / 镇派心法）→ 品阶页签（带各自计数）→
  // 左四列格子（已收录与可发布同屏，绿框「已录」）、右选中的详情与录入（再点一次才确认）。
  const Library = () => {
    const libArts = my.lib.map((id) => ARTS[id]).filter(Boolean) as ArtSkill[];
    const rest = S.publishableArts();
    const all = [...libArts, ...rest];
    const full = my.lib.length >= S.libCap();
    const shown = all.filter((a) => (libTier < 0 || a.tier === libTier) && (!libOnly || !my.lib.includes(a.id)));
    const count = (t: number) => all.filter((a) => t < 0 || a.tier === t).length;
    const heroGf = GONGFA[game.hero.gongfa];
    const cur = all.find((a) => a.id === libSel) ?? shown[0] ?? all[0];
    const done = cur ? my.lib.includes(cur.id) : false;
    const boost = Math.min(20, my.lib.length) * 1.5;
    return (
      <div className="lib-page">
        <div className="sect-tiles">
          <div className="sect-tile"><b>已收录</b><span>{my.lib.length}/{S.libCap()}</span>
            <div className="sect-bar"><u style={{ width: pct(my.lib.length, S.libCap()) + '%' }} /></div>
            <small>还有 {rest.length} 门可录</small></div>
          <div className="sect-tile"><b>门人修炼加成</b><span>+{boost.toFixed(1)}%</span>
            <div className="sect-bar"><u style={{ width: pct(Math.min(20, my.lib.length), 20) + '%' }} /></div>
            <small>每门 +1.5%，最多按 20 门算</small></div>
          <div className="sect-tile"><b>镇派心法</b>
            <span style={{ fontSize: 17 }}>《{GONGFA[my.gf]?.name ?? '基础吐纳术'}》</span>
            <small>门人修炼 ×{GONGFA[my.gf]?.rate ?? 0.8}</small>
            {heroGf && my.gf !== game.hero.gongfa && (
              <button className="ink-btn small jade sect-tile-btn"
                onClick={() => act(() => { if (S.setGf(game.hero.gongfa)) setFlash(`立《${heroGf.name}》为镇派心法`); }, 'chime')}>立《{heroGf.name}》为镇派</button>
            )}
          </div>
        </div>
        {full && <div className="sect-warn">藏经阁已满（{S.libCap()} 门）：去「宗门建设」扩建，每级 +8 门。</div>}

        <div className="sect-tabs">
          <button className={libTier < 0 ? 'on' : ''} onClick={() => { audio.sfx('click'); setLibTier(-1); }}>全部（{count(-1)}）</button>
          {TIER_NAME.map((n, t) => (
            <button key={n} className={libTier === t ? 'on' : ''} onClick={() => { audio.sfx('click'); setLibTier(t); }}>{n}（{count(t)}）</button>
          ))}
          <button className={libOnly ? 'on' : ''} onClick={() => { audio.sfx('click'); setLibOnly((v) => !v); }}>{libOnly ? '✓ ' : ''}只看未收录</button>
        </div>

        <div className="lib-cols">
          <div className="lib-grid">
            {shown.map((a) => (
              <ArtSlot key={a.id} a={a} done={my.lib.includes(a.id)} on={cur?.id === a.id}
                onPick={() => { audio.sfx('click'); setLibSel(a.id); setLibConfirm(''); }} />
            ))}
            {!shown.length && (
              <div className="hint" style={{ gridColumn: '1 / -1' }}>
                {libOnly ? '你会的法术都已录入藏经阁。' : '这一阶没有法术。'}
              </div>
            )}
          </div>
          <div className="lib-detail">
            {cur ? (() => {
              const learnedArt = game.hero.arts.find((a) => a.id === cur.id);
              const mlv = learnedArt ? profLevel(cur.tier, learnedArt.xp) : 0;
              const mpInf = effectiveSpellMp(cur, game.hero.realm, game.hero.stage ?? 0, mlv);
              const mpPct = (v: number) => v <= 0 ? '0%' : v < 0.01 ? `${(v * 100).toFixed(1)}%` : `${Math.round(v * 100)}%`;
              return (<>
              <div className="bd-name" style={{ color: TIER_COLOR[cur.tier] }}>{cur.name}
                <small>　{TIER_NAME[cur.tier]} · {SCHOOL_NAME[cur.school]}{done && <em className="lib-tag">已收录</em>}</small></div>
              <div className="bd-type">
                {cur.power > 0 ? `威力 ×${cur.power} · ` : ''}耗法 {mpPct(mpInf.ratio)}{mpInf.discounted ? `（原 ${mpPct(mpInf.baseRatio)}）` : ''} · 冷却 {cur.cd}s · 射程 {cur.range}
                {cur.radius ? ` · 范围 ${cur.radius}` : ''}{cur.count && cur.count > 1 ? ` · ${cur.count} 发` : ''}
              </div>
              <div className="bd-desc">{cur.desc}</div>
              {done
                ? <div className="hint">已录入藏经阁：门人可修习。宗门每多一门，门人修炼 +1.5%（最多按 20 门算）。</div>
                : <div className="sect-row-acts">
                  {libConfirm === cur.id
                    ? <button className="ink-btn small jade" disabled={full} title="再点一次才真正录入"
                      onClick={() => act(() => {
                        // 录入成功不用另弹提示：格子当场变绿框「已录」、详情换成「已录入藏经阁」，
                        // 状态本身已经把结果说清楚了，再挂一条 ✓ 只是噪音。
                        S.publishArt(cur.id);
                        setLibConfirm('');
                      }, 'chime')}>再点一次，确认录入</button>
                    : <button className="ink-btn small" disabled={full}
                      onClick={() => { audio.sfx('click'); setLibConfirm(cur.id); }}>
                      录入藏经阁（威望 +{[1, 2, 5, 12, 30][cur.tier]}）
                    </button>}
                  {libConfirm === cur.id && <span className="hint">确认要把《{cur.name}》录入藏经阁吗？</span>}
                  {full && <span className="hint">藏经阁已满，先扩建</span>}
                </div>}
            </>);
            })() : <div className="hint">你会的法术都已录入藏经阁。</div>}
          </div>
        </div>
        {flash && <div className="sect-flash">✓ {flash}</div>}
      </div>
    );
  };

  // ---------------------------------------------------------------- 宗门建设
  const Build = () => {
    const rows = S.hallRows().filter((r) => r.k !== 'zhen');
    const zhen = S.hallRows().find((r) => r.k === 'zhen')!;
    const fl = sw ? sw.fleetSummary(MY_SECT_ID) : null;
    const dockLv = my.halls.dock ?? 0;
    const pool = S.ascendPoolInfo();
    const poolCand = pool.enabled ? S.ascendPoolCandidates() : null;
    const fmtNative = (stones: number) => {
      const n = bal.curScale > 1 ? Math.max(1, Math.ceil(stones / bal.curScale)) : stones;
      return `${n >= 10000 ? `${Math.round(n / 1000) / 10} 万` : n} ${bal.curName}`;
    };
    return (<>
      <div className="hint" style={{ marginBottom: 6 }}>殿宇各可升到五级，升一级即见效：藏经阁扩功法上限 · 丹房提高冲关成算与产业进项 · 护宗大阵守山更稳 · 聚灵大阵加快门人修炼 · 战船坞建造飞舟{pool.enabled ? ` · ${pool.name}接引下界门人亲友飞升` : ''}。库房不够时从你的储物袋里补。</div>
      <div className="hall-list">
        {rows.map((r) => (
          <div key={r.k} className="hall-row">
            <div className={'hl-lv' + (r.max ? ' max' : '')}>{r.lv} 级</div>
            <div className="hl-name"><b>{r.name}</b></div>
            <div className="hl-desc">{r.desc}</div>
            <div className="hl-act">
              {r.locked ? <span className="hint">{r.locked}</span> : r.max ? <span className="hint">已至顶</span> : (
                <button className="ink-btn small" disabled={!r.canPay} onClick={() => act(() => { if (S.buildHall(r.k)) setFlash(`${r.name}扩建至 ${r.lv + 1} 级`); }, 'chime')}>
                  {fmtNative(r.cost)} ↑
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {pool.enabled && poolCand && (
        <>
          <div className="sec-title">
            {pool.name} · 跨界接引飞升
            <small>
              {pool.lv > 0
                ? `${pool.lv} 级 · 本月剩余名额 ${pool.rem}/${pool.monthlyCap} · 可接引${REALMS[pool.minRealm]?.name ?? ''}及以上`
                : `尚未筑池（请先在上方建造 1 级${pool.name}）`}
            </small>
          </div>
          <div className="zhen-card">
            <div className="hint" style={{ marginBottom: 6 }}>
              洗髓接引{worldDef(pool.lowerWorld!).name}旧山门门人或尚在人世的亲友飞升至本宗；若故人已在下界寿元耗尽坐化，灵池亦无法逆转生死。
            </div>
            {poolCand.disciples.length === 0 && poolCand.npcs.length === 0 && poolCand.deadNpcs.length === 0 ? (
              <div className="hint">下界暂无待接引的旧山门门人或故人。</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {poolCand.disciples.map(({ d, ok, why, costNative }) => (
                  <div key={'d_' + d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span>
                      <b>[门人] {d.name}</b> · {realmName(d.realm, d.stage)} · {ROOT_TEXT[d.root]} · {Math.floor(d.age)} 岁
                    </span>
                    <button className="ink-btn small jade" disabled={!ok} title={why}
                      onClick={() => act(() => { const res = S.ascendPullDisciple(d.id); setFlash(res.msg); }, ok ? 'chime' : 'fail')}>
                      {ok ? `跨界接引（${costNative} ${bal.curName}）` : why}
                    </button>
                  </div>
                ))}
                {poolCand.npcs.map(({ n, ok, why, costNative }) => (
                  <div key={'n_' + n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span>
                      <b>[亲友] {n.name}</b> · {realmName(n.realm, n.stage)}{n.bond ? ` · ${n.bond}` : ''} · {Math.floor(n.age)}/{n.life} 岁
                    </span>
                    <button className="ink-btn small jade" disabled={!ok} title={why}
                      onClick={() => act(() => { const res = S.ascendPullNpc(n.id); setFlash(res.msg); }, ok ? 'chime' : 'fail')}>
                      {ok ? `接引飞升（${costNative} ${bal.curName}）` : why}
                    </button>
                  </div>
                ))}
                {poolCand.deadNpcs.map((n) => (
                  <div key={'dead_' + n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, opacity: 0.55 }}>
                    <span>[故人] {n.name} · {realmName(n.realm, n.stage)}</span>
                    <span>已坐化辞世 · 不可逆转轮回</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      <div className="sec-title">护宗大阵<small>外敌攻山须先破阵；阵力靠{bal.curName}维持</small></div>
      <div className="zhen-card">
        <div className="zhen-head">
          <b>{zhen.lv ? zname : '尚未布阵'}</b>
          <span>{zhen.lv ? `阵力 ${ze}/${zmax}` : '没有大阵，敌人一到山门便是全宗尽出的灭宗大战'}</span>
        </div>
        <div className="sect-bar"><u style={{ width: pct(ze, Math.max(1, zmax)) + '%' }} /></div>
        {zhen.lv > 0 && (
          <div className="sect-row-acts">
            <button className="ink-btn small jade" disabled={ze >= zmax || money < ZHEN_COST} onClick={() => act(() => { const n = S.chargeZhen(); setFlash(n ? `注入 ${n} 点阵力` : `阵力已满或${bal.curName}不足`); }, 'chime')}>
              注入{bal.curName}充能（1 点 {ZHEN_COST} 账面）
            </button>
            {(['shou', 'sha', 'huan'] as ZhenMode[]).map((m) => (
              <button key={m} className={'ink-btn small' + ((my.zhenMode ?? 'shou') === m ? ' jade' : ' ghost')} title={ZHEN_MODE[m][1]}
                onClick={() => act(() => { S.setZhenMode(m); setFlash(`变阵为「${ZHEN_MODE[m][0]}」`); }, 'chime')}>{ZHEN_MODE[m][0]}</button>
            ))}
          </div>
        )}
        {zhen.lv > 0 && (
          <div className="sect-row-acts">
            <button className={'ink-btn small' + (my.zhenAuto !== false ? ' jade' : ' ghost')} onClick={() => act(() => { S.toggleZhenAuto(); setFlash(`自动充能已${my.zhenAuto !== false ? '打开' : '关闭'}`); }, 'click')}>
              自动充能：{my.zhenAuto !== false ? '开' : '关（每月自库房补一成阵力）'}
            </button>
            {!zhen.max && <button className="ink-btn small" disabled={!zhen.canPay} onClick={() => act(() => { if (S.buildHall('zhen')) setFlash(`护宗大阵扩建至 ${zhen.lv + 1} 级`); }, 'chime')}>扩建 {zhen.lv} → {zhen.lv + 1} 级（{bal.curScale > 1 ? `${Math.max(1, Math.ceil(zhen.cost / bal.curScale))} ${bal.curName}` : `${zhen.cost >= 10000 ? `${zhen.cost / 10000} 万` : zhen.cost} 灵石`} · 上限 {[0, 400, 1200, 3500, 9000, 24000][zhen.lv + 1]}）</button>}
          </div>
        )}
        <div className="hint">
          {zhen.lv === 0
            ? `布下护宗大阵须 ${bal.curScale > 1 ? `${Math.max(1, Math.ceil(3000 / bal.curScale))} ${bal.curName}` : '3000 灵石'}：布成即有一级阵力（上限 400），此后可充能、变阵、扩建。`
            : `「${ZHEN_MODE[my.zhenMode ?? 'shou'][0]}」${zhen.lv} 级：${ZHEN_MODE[my.zhenMode ?? 'shou'][1]}。外敌打到山门，须先攻破大阵——大阵未破，门人躲在阵后毫发无伤；连冲五次不破，自会退兵。阵力被打破，接下来便是灭宗大战。`}
        </div>
        {!zhen.lv && <div className="sect-row-acts"><button className="ink-btn jade" disabled={!zhen.canPay} onClick={() => act(() => { if (S.buildHall('zhen')) setFlash('护宗大阵已布下'); }, 'chime')}>布下护宗大阵（{bal.curScale > 1 ? `${Math.max(1, Math.ceil(3000 / bal.curScale))} ${bal.curName}` : '3000 灵石'}）</button></div>}
      </div>

      {fl && sw && (
        <>
          <div className="sec-title">战船坞 · 宗门舟师<small>战船与运丹灵舟共用库存；战阵击沉或运丹被劫会永久损毁</small></div>
          <div className="zhen-card">
            <div className="zhen-head">
              <b>{dockLv > 0 ? `战船坞 ${dockLv} 级（${fl.maxSlips} 船台）` : '尚未兴建战船坞'}</b>
              <span>阵材 {fl.mats} 份 · 灵石 {fmt(fl.stones)}</span>
            </div>
            <div className="sect-chips" style={{ marginTop: 6 }}>
              <span className="sect-chip"><b>一阶灵舟</b>{fl.intact.t1} 艘（闲 {fl.avail.t1}{fl.busy.t1 ? ` · 在外 ${fl.busy.t1}` : ''}{fl.damaged.t1 ? ` · 损 ${fl.damaged.t1}` : ''}）</span>
              <span className="sect-chip"><b>二阶战舰</b>{fl.intact.t2} 艘（闲 {fl.avail.t2}{fl.damaged.t2 ? ` · 损 ${fl.damaged.t2}` : ''}）</span>
              <span className="sect-chip"><b>三阶巨舟</b>{fl.intact.t3} 艘（闲 {fl.avail.t3}{fl.damaged.t3 ? ` · 损 ${fl.damaged.t3}` : ''}）</span>
            </div>
            {fl.building.length > 0 && (
              <div className="sect-chips" style={{ marginTop: 4 }}>
                {fl.building.map((ord, idx) => {
                  const sp = AIRSHIP_BUILD_SPEC[ord.tier];
                  return (
                    <span key={idx} className="sect-chip gold">
                      <b>在建 {sp.name}</b>还需 {Math.ceil(ord.remDays)} 日（共 {ord.totalDays} 日）
                    </span>
                  );
                })}
              </div>
            )}
            <div className="sect-row-acts" style={{ flexWrap: 'wrap' }}>
              {([1, 2, 3] as const).map((tier) => {
                const sp = AIRSHIP_BUILD_SPEC[tier];
                const slipFull = fl.building.length >= fl.maxSlips;
                const can = dockLv >= sp.dockLvReq && !slipFull && fl.mats >= sp.mats && money >= sp.stones;
                const why = dockLv < sp.dockLvReq
                  ? `须战船坞 ${sp.dockLvReq} 级`
                  : slipFull ? '船台已满' : fl.mats < sp.mats ? `阵材需 ${sp.mats}` : money < sp.stones ? `灵石需 ${sp.stones}` : '';
                return (
                  <button key={tier} className="ink-btn small jade" disabled={!can} title={why || `工期约 ${sp.days} 日`}
                    onClick={() => act(() => { const r = sw.buildAirship(tier); setFlash(r.msg); }, 'chime')}>
                    造{sp.name}（{fmt(sp.stones)}石 · {sp.mats}材）
                  </button>
                );
              })}
              {([1, 2, 3] as const).map((tier) => {
                const tk = (`t${tier}`) as 't1' | 't2' | 't3';
                const dmgN = fl.damaged[tk];
                if (!dmgN) return null;
                const sp = AIRSHIP_BUILD_SPEC[tier];
                const can = dockLv >= 1 && fl.mats >= sp.repairMats && money >= sp.repairStones;
                return (
                  <button key={'rep' + tier} className="ink-btn small" disabled={!can}
                    onClick={() => act(() => { const r = sw.repairAirship(tier); setFlash(r.msg); }, 'chime')}>
                    抢修{sp.name} ×{dmgN}（{sp.repairStones}石 · {sp.repairMats}材）
                  </button>
                );
              })}
            </div>
            <div className="sect-row-acts">
              <button className="ink-btn small ghost" disabled={money < AIRSHIP_MAT_STONE_PRICE * 10}
                onClick={() => act(() => { const r = sw.buyWarMats(10); setFlash(r.msg); }, 'click')}>
                采买阵材 +10（{AIRSHIP_MAT_STONE_PRICE * 10} 灵石）
              </button>
              <button className="ink-btn small ghost" disabled={money < AIRSHIP_MAT_STONE_PRICE * 30}
                onClick={() => act(() => { const r = sw.buyWarMats(30); setFlash(r.msg); }, 'click')}>
                采买阵材 +30（{AIRSHIP_MAT_STONE_PRICE * 30} 灵石）
              </button>
            </div>
            <div className="hint">
              {dockLv === 0
                ? '宗门战船与运丹灵舟皆不可凭空而生：先花 3000 灵石建起 1 级战船坞，方能建造一阶灵舟（3 级造二阶战舰，4 级双船台，5 级造三阶玄舟）。若无在编一阶灵舟，运丹只得走陆路车队。'
                : '提示：一阶轻型灵舟兼顾前线护航与大营运丹（运丹途中若被劫毁将永久折损）；战船坞每高一级既加快造船工期，亦提高宗门阵材日产。'}
            </div>
          </div>
        </>
      )}
      {flash && <div className="sect-flash">✓ {flash}</div>}
    </>);
  };

  // ---------------------------------------------------------------- 库房与用度
  const Vault = () => {
    // 本月收支单：进项 → 归宗主 → 门人月例 → 本月真要冲关的几笔 → 库房结余（算法见组件顶部的 L）
    const { m, cutPct, si: swIn, bt, inflow, toLord, upkeep, net: netVault } = L;
    const rate = my.btRate ?? 0.05;
    const rateTxt = rate >= 1 ? '全部（不限）' : `${Math.round(rate * 100)}%`;
    const spare = Math.max(0, bal.vault - (my.reserve ?? 0));
    return (<>
      <div className="sect-chips">
        <span className="sect-chip"><b>库房</b>{bal.curScale > 1 ? `${fmt(bal.vaultNative)} ${bal.curName}` : fmt(bal.vault)}</span>
        <span className="sect-chip"><b>储物袋</b>{bal.curScale > 1 ? `${fmt(bal.bagNative)} ${bal.curName}` : fmt(bal.bag)}</span>
        <span className="sect-chip gold"><b>待领供奉</b>{fmt(my.tribute)}</span>
        <span className="sect-chip"><b>累计已得</b>{fmt(my.earned ?? 0)}</span>
        <span className="sect-chip"><b>保底线</b>{fmt(my.reserve ?? 0)}</span>
        <span className="sect-chip"><b>盈余</b>{fmt(spare)}</span>
      </div>
      <div className="sec-title">本月收支<small>按现行档位估算；实收随门人修为、据点与战事浮动</small></div>
      <div className="sect-tbl">
        <div className="sect-tr rule"><b>进项</b>
          <span>门人 {fmt(m.income)}{swIn.holds ? ` · 据点 ${fmt(swIn.holds)}` : ''}{swIn.branch ? ` · 分舵 ${fmt(swIn.branch)}` : ''}{swIn.vassal ? ` · 附庸 ${fmt(swIn.vassal)}` : ''}</span>
          <span className="ok">+{fmt(inflow)}</span></div>
        <div className="sect-tr rule"><b>归宗主</b>
          <span>抽成 {cutPct}% 径入宗主供奉，不留在库房{swIn.vassal ? '（附庸月供全额）' : ''}</span>
          <span className="warn">−{fmt(toLord)}</span></div>
        <div className="sect-tr rule"><b>门人月例</b>
          <span>{my.ds.length} 人的月例，库房出</span><span className="warn">−{fmt(m.upkeep)}</span></div>
        <div className="sect-tr rule"><b>本月冲关</b>
          <span>{bt.ready
            ? `${bt.ready} 人够格、合计需 ${fmt(bt.demand)}；受用度与保底线所限，本月预计花 ${fmt(bt.expect)}`
            : '眼下没有够格冲关的门人（受修为与「冲关资格」所限），这一笔不花'}</span>
          <span className="warn">−{fmt(bt.expect)}</span></div>
        <div className="sect-tr rule"><b>库房结余</b>
          <span>进项 − 归宗主 − 月例 − 本月冲关；结余为负说明该抽少些、或让门人多打理产业</span>
          <span className={netVault >= 0 ? 'ok' : 'bad'}>{netVault >= 0 ? '+' : ''}{fmt(netVault)}</span></div>
      </div>
      <div className="sect-chips">
        <span className="sect-chip"><b>宗主本月</b>{fmt(toLord)}（抽成 + 附庸）</span>
        <span className="sect-chip"><b>宗门每月</b>{fmt(inflow)} 进项</span>
        <span className={'sect-chip' + (netVault >= 0 ? '' : ' crimson')}><b>库房每月</b>{netVault >= 0 ? '+' : ''}{fmt(netVault)}</span>
        <span className="sect-chip"><b>冲关用度上限</b>{rateTxt} · 至多 {fmt(bt.budget)}</span>
      </div>
      <div className="sect-row-acts">
        {my.tribute >= 1 || (my.gifts?.length ?? 0) > 0 ? (
          <button className="ink-btn small jade" onClick={() => act(() => {
            const r = S.collect();
            setFlash(r.stones || r.gifts ? `收下供奉 ${r.stones} ${bal.curName}${r.gifts ? `、门人献礼 ${r.gifts} 件` : ''}` : '眼下没有可收的供奉');
          }, 'chime')}>
            收取供奉{my.tribute >= 1 ? `（${fmt(my.tribute)} 账面）` : ''}{(my.gifts?.length ?? 0) > 0 ? `（献礼 ${my.gifts.length} 种）` : ''}
          </button>
        ) : (
          <span className="hint">暂无待领供奉——门人每月按抽成上缴，攒够 1 份再来取{my.tribute > 0 ? `（现积 ${Math.floor(my.tribute * 10) / 10}）` : ''}。</span>
        )}
      </div>
      <div className="sec-title">拨{bal.curName}入库房<small>拨下去的资源不会一月见底：冲关每月的花销受「冲关用度」所限</small></div>
      <div className="sect-row-acts">
        {STONE_STEPS.map((n) => (
          <button key={n} className="ink-btn small ghost" disabled={bal.bag < n} onClick={() => act(() => { const v = S.deposit(n); setFlash(v ? `拨入 ${fmt(v)} 账面` : `储物袋${bal.curName}不足`); }, 'click')}>拨 {fmt(n)}</button>
        ))}
        <button className="ink-btn small ghost" disabled={bal.bag < 2} onClick={() => act(() => { const v = S.deposit(Math.floor(bal.bag / 2)); setFlash(`拨入 ${fmt(v)} 账面`); })}>拨一半</button>
        <button className="ink-btn small" disabled={bal.bag < 1} onClick={() => act(() => { const v = S.deposit(bal.bag); setFlash(`倾囊拨入 ${fmt(v)} 账面`); }, 'chime')}>倾囊拨入</button>
      </div>
      <div className="sec-title">从库房支取<small>库房见底，月例发不出，门人会离心</small></div>
      <div className="sect-row-acts">
        {STONE_STEPS.map((n) => (
          <button key={n} className="ink-btn small ghost" disabled={bal.vault < n} onClick={() => act(() => { const v = S.withdraw(n); setFlash(v ? `支取 ${fmt(v)} 账面` : `库房${bal.curName}不足`); }, 'click')}>取 {fmt(n)}</button>
        ))}
        <button className="ink-btn small ghost" disabled={bal.vault < 2} onClick={() => act(() => { const v = S.withdraw(Math.floor(bal.vault / 2)); setFlash(`支取 ${fmt(v)} 账面`); })}>取一半</button>
        <button className="ink-btn small ghost" disabled={bal.vault < 1} onClick={() => act(() => { const v = S.withdraw(bal.vault); setFlash(`尽数支取 ${fmt(v)} 账面`); })}>尽数支取</button>
      </div>
      <div className="sec-title">宗门用度<small>点击即切换档位</small></div>
      <div className="sect-tbl">
        <div className="sect-tr rule"><b>宗主抽成</b><span>{cutPct}%——门人产业、历练、据点、战利品的进项按此成数径入宗主供奉；抽到五成，门人会渐生怨言</span>
          <button className="ink-btn small ghost" onClick={() => act(() => { const v = S.cycleCut(); setFlash(`宗主抽成改为 ${Math.round(v * 100)}%`); }, 'click')}>{cutPct}%</button></div>
        <div className="sect-tr rule"><b>库房保底</b><span>{fmt(my.reserve ?? 0)} 灵石——门人冲关、大阵自动充能都只动此线之上的灵石</span>
          <button className="ink-btn small ghost" onClick={() => act(() => { const v = S.cycleReserve(); setFlash(`库房保底改为 ${fmt(v)}`); }, 'click')}>{fmt(my.reserve ?? 0)}</button></div>
        <div className="sect-tr rule"><b>冲关用度</b><span>每月至多动用盈余的 {rateTxt}（眼下约 {Math.floor(spare * rate)}）：越小越细水长流，越大门人破境越快</span>
          <button className="ink-btn small ghost" onClick={() => act(() => { const v = S.cycleRate(); setFlash(`冲关用度改为 ${v >= 1 ? '不限' : Math.round(v * 100) + '%'}`); }, 'click')}>{rateTxt}</button></div>
        <div className="sect-tr rule"><b>冲关资格</b><span>{BT_RULE_TEXT[my.btRule ?? 1]}——库房出丹药钱，供哪些门人冲击大境界（门人位阶：外门 · 内门 · 真传（核心）· 长老）</span>
          <button className="ink-btn small ghost" onClick={() => act(() => { const v = S.cycleRule(); setFlash(`冲关资格改为「${BT_RULE_TEXT[v]}」`); }, 'click')}>{BT_RULE_TEXT[my.btRule ?? 1]}</button></div>
      </div>
      <div className="sec-title">冲关账目<small>败一次，下回成算添几分——灵石不白花</small></div>
      <div className="sect-chips">
        <span className="sect-chip"><b>累计冲关</b>{my.btTries ?? 0} 次</span>
        <span className="sect-chip"><b>成</b>{my.btWins ?? 0} 次</span>
        <span className="sect-chip"><b>共花</b>{fmt(my.btSpent ?? 0)}</span>
        <span className="sect-chip"><b>丹药钱</b>筑基 {BREAK_COST[1]} · 结丹 {BREAK_COST[2]} · 结婴 {BREAK_COST[3]}</span>
      </div>
      {my.gifts.length > 0 && (
        <>
          <div className="sec-title">门人献上<small>收取后进你的储物袋</small></div>
          <div className="sect-chips">{my.gifts.map((it) => <span key={it.id} className="sect-chip"><b>{itemDef(it.id).name}</b>×{it.n}</span>)}</div>
          <div className="sect-row-acts"><button className="ink-btn small jade" onClick={() => act(() => { S.collect(); setFlash('门人献上之物已收入储物袋'); }, 'chime')}>一并收取</button></div>
        </>
      )}
      <div className="hint">回报：门人破境备谢师礼（筑基 300 · 结丹 4000 · 元婴 40000）径入供奉；丹房每月有机会献上一炉丹药；宗门气运可在大殿汲取，化作你的修为。</div>
      {flash && <div className="sect-flash">✓ {flash}</div>}
    </>);
  };

  // ---------------------------------------------------------------- 亲卫与掌门护卫
  const Guard = () => {
    const cap = S.guardCap();
    const ids = my.guard ?? [];
    const cur = my.ds.filter((d) => ids.includes(d.id));
    const master = S.masterDisciple();
    const mgCap = S.masterGuardCap();
    const mgIds = my.masterGuard ?? [];
    const mgCur = master ? my.ds.filter((d) => mgIds.includes(d.id)) : [];
    const pool = my.ds
      .filter((d) => d.realm >= 1 && d.id !== master?.id)
      .sort((a, b) => b.realm - a.realm || b.stage - a.stage || b.loyal - a.loyal);
    const anyForLord = pool.some((d) => !mgIds.includes(d.id));
    const anyForMaster = !!master && pool.some((d) => !ids.includes(d.id));
    return (<>
      <div className="sect-chips">
        <span className="sect-chip"><b>太上亲卫</b>{cur.length}/{cap}</span>
        {master && <span className="sect-chip"><b>掌门护卫</b>{mgCur.length}/{mgCap}</span>}
        <span className="sect-chip"><b>可调</b>{pool.length} 名入道门人</span>
      </div>
      <div className="hint">「太上亲卫」贴身随你游历九州、遇敌助战（秘境与洞府不入）；委任掌门后，「掌门护卫」专责护持掌门理政督战，并在宗门守山大阵前优先随掌门披挂出阵。</div>

      <div className="sec-title">太上随行亲卫（{cur.length}/{cap}）<small>可快捷点将，也可在下方名册逐人点选 / 撤换</small></div>
      <div className="sect-row-acts">
        <button className="ink-btn small jade" disabled={!anyForLord} onClick={() => act(() => { S.guardSet(cap); setGuardWarn(true); setFlash(`点了最强的 ${cap} 人随行`); }, 'chime')}>点最强的 {cap} 人随行</button>
        <button className="ink-btn small" disabled={!anyForLord} onClick={() => act(() => { S.guardSet('half'); setGuardWarn(true); setFlash('太上亲卫只带一半'); }, 'chime')}>只带 {Math.ceil(cap / 2)} 人</button>
        <button className="ink-btn small ghost" disabled={!cur.length} onClick={() => act(() => { S.guardSet('clear'); setGuardWarn(false); setFlash('太上亲卫各回洞府'); }, 'fail')}>遣散亲卫</button>
      </div>
      {cur.length
        ? <div className="sect-tbl">{cur.map((d) => (
          <div key={d.id} className="sect-tr apps">
            <b>{d.name}</b><small>{RANK_TEXT[d.rank]}</small><small>{realmName(d.realm, d.stage)}</small>
            <small className={d.loyal < 40 ? 'low' : ''}>忠诚 {Math.round(d.loyal)}</small>
            <button className="ink-btn small ghost" onClick={() => act(() => { const r = S.toggleGuardMember(d.id, 'lord'); setFlash(r.msg); }, 'click')}>撤下</button>
          </div>
        ))}</div>
        : <div className="hint">眼下无太上亲卫随行。</div>}

      {master && (<>
        <div className="sec-title">现任掌门「{master.name}」贴身护卫（{mgCur.length}/{mgCap}）<small>{my.masterAuto?.guard !== false ? '掌门每月按需补齐，你亦可随时手动调整' : '当前由你亲手配置'}</small></div>
        <div className="sect-row-acts">
          <button className="ink-btn small jade" disabled={!anyForMaster} onClick={() => act(() => { S.masterGuardSet(mgCap); setFlash(`为掌门${master.name}点齐 ${mgCap} 名精锐护卫`); }, 'chime')}>配强将 {mgCap} 人</button>
          <button className="ink-btn small" disabled={!anyForMaster} onClick={() => act(() => { S.masterGuardSet('half'); setFlash(`掌门护卫配半编 ${Math.ceil(mgCap / 2)} 人`); }, 'chime')}>只配 {Math.ceil(mgCap / 2)} 人</button>
          <button className="ink-btn small ghost" disabled={!mgCur.length} onClick={() => act(() => { S.masterGuardSet('clear'); setFlash('已撤回掌门护卫'); }, 'fail')}>撤回护卫</button>
        </div>
        {mgCur.length
          ? <div className="sect-tbl">{mgCur.map((d) => (
            <div key={d.id} className="sect-tr apps">
              <b>{d.name}</b><small>{RANK_TEXT[d.rank]}</small><small>{realmName(d.realm, d.stage)}</small>
              <small className={d.loyal < 40 ? 'low' : ''}>忠诚 {Math.round(d.loyal)}</small>
              <button className="ink-btn small ghost" onClick={() => act(() => { const r = S.toggleGuardMember(d.id, 'master'); setFlash(r.msg); }, 'click')}>撤下</button>
            </div>
          ))}</div>
          : <div className="hint">掌门身边眼下尚无贴身护卫。</div>}
      </>)}

      {flash && <div className="sect-flash">✓ {flash}</div>}

      <div className="sec-title">入道门人逐人点将（{pool.length} 人）<small>点选指派为太上亲卫或掌门护卫</small></div>
      {pool.length
        ? <div className="sect-tbl">{pool.slice(0, 40).map((d) => {
          const isLord = ids.includes(d.id);
          const isMasterG = mgIds.includes(d.id);
          return (
            <div key={d.id} className="sect-tr apps">
              <b>{d.name}</b><small>{RANK_TEXT[d.rank]} · {realmName(d.realm, d.stage)}</small>
              <small className={d.loyal < 40 ? 'low' : ''}>忠诚 {Math.round(d.loyal)}</small>
              <small>{JOB_TEXT[d.job]}</small>
              <span className="sect-row-acts" style={{ margin: 0 }}>
                <button className={'ink-btn small' + (isLord ? ' jade' : ' ghost')} onClick={() => act(() => { const r = S.toggleGuardMember(d.id, 'lord'); if (r.ok) setGuardWarn(true); setFlash(r.msg); }, isLord ? 'click' : 'chime')}>
                  {isLord ? '✓ 太上亲卫' : '+ 太上亲卫'}
                </button>
                {master && (
                  <button className={'ink-btn small' + (isMasterG ? ' jade' : ' ghost')} onClick={() => act(() => { const r = S.toggleGuardMember(d.id, 'master'); setFlash(r.msg); }, isMasterG ? 'click' : 'chime')}>
                    {isMasterG ? '✓ 掌门护卫' : '+ 掌门护卫'}
                  </button>
                )}
              </span>
            </div>
          );
        })}</div>
        : <div className="hint">尚无炼气以上入道门人可点。</div>}

      <div className="sect-warn">亲卫与护卫皆是名册上的真人——<b>战死了，名册上就少一个</b>。忠诚低的门人，遇险时未必肯替主上挡刀。</div>
      {guardWarn && cur.some((d) => d.loyal < 40) && <Lock why="太上亲卫里有忠诚不足 40 的人：若要他们卖命，先多讲法、多指点。" />}
    </>);
  };

  // ---------------------------------------------------------------- 宗门战事
  const War = () => {
    if (!sw) return <div className="hint">战事系统尚未启用。</div>;
    const sum = sw.myWarSummary();
    if (!sum) return <div className="hint">尚未开宗立派，谈不上战事。</div>;
    const cands = sw.holdCandidates(10);
    const full = sw.holdFull();
    const foes = sw.sects(ACTIVE_MAP).filter((sid) => sid !== MY_SECT_ID && !sw.warOf(sid))
      .map((sid) => ({ sid, t: sw.tension(MY_SECT_ID, sid) }))
      .sort((a, b) => b.t - a.t).slice(0, 5);
    const fl = sw.fleetSummary(MY_SECT_ID);
    return (<>
      <div className="sect-tiles">
        <div className="sect-tile"><b>据点（上限 {sum.holdMax}）</b><span>{sum.holdCount}{sum.branches.length ? ` + ${sum.branches.length}分宗` : ''}</span>
          <div className="sect-bar"><u style={{ width: pct(sum.holdCount, sum.holdMax) + '%' }} /></div>
          <small>月入约 {sum.income + sum.branchIncome} 灵石</small></div>
        <div className="sect-tile"><b>可调之兵</b><span>{sum.free}</span>
          <small>含外门战兵 {sum.outerFree} · 镇守 {sum.gar} · 杂役 {sum.servantCount} 不入阵</small></div>
        <div className="sect-tile"><b>宗门舟师</b><span>{fl.intact.t1 + fl.intact.t2 + fl.intact.t3} 艘</span>
          <small>一阶 {fl.intact.t1} · 二阶 {fl.intact.t2} · 三阶 {fl.intact.t3}{fl.building.length ? ` · 在建 ${fl.building.length}` : ''}</small></div>
        <div className="sect-tile"><b>本宗战事</b><span>{sum.wars.length}</span>
          <small>{sum.wars.length ? '战报见下' : '眼下无战事'} · 胜 {my.wins} · 负 {my.losses}</small></div>
      </div>
      <div className="sect-row-acts">
        <button className="ink-btn small ghost" onClick={() => { audio.sfx('click'); setNav('build'); setBuildSub('build'); }}>
          前往战船坞造船 / 修船（{fl.dockLv > 0 ? `${fl.dockLv}级` : '未建'} · 阵材 {fl.mats}）
        </button>
        <button className="ink-btn small" onClick={() => act(() => { game.openDialog(game.war.meritShopNode()); }, 'open')}>
          战功兑换（战功 {game.war?.merit ?? 0}）
        </button>
      </div>
      {(sum.holds.length > 0 || sum.branches.length > 0) && (
        <div className="sw-holds-line">
          {sum.holds.map((h) => <span key={h.id} className="sw-hold">{h.name}<em>{h.g}</em></span>)}
          {sum.branches.map((b) => <span key={b.id} className="sw-hold" title="已收编/改立的本宗分宗，不占据点上限">{b.name}·分宗<em>+{b.income}</em></span>)}
        </div>
      )}
      <div className="sect-row-acts">
        <span className="hint">守御之策：</span>
        {sw.defList().map((d) => (
          <button key={d.m} className={'ink-btn small' + (sw.defNow() === d.m ? ' jade' : ' ghost')} title={d.hint}
            onClick={() => act(() => sw.setDefense(d.m), 'click')}>{d.name}</button>
        ))}
      </div>
      <div className="hint">{sw.defList().find((d) => d.m === sw.defNow())?.hint}</div>
      <div className="sect-row-acts">
        <span className="hint">战阵阵型：</span>
        {sw.patternList().map((p) => (
          <button key={p.id} className={'ink-btn small' + (sw.patternNow() === p.id ? ' jade' : ' ghost')} title={p.desc}
            onClick={() => act(() => sw.setPattern(p.id), 'click')}>{p.name}</button>
        ))}
      </div>
      <div className="hint">{sw.patternList().find((p) => p.id === sw.patternNow())?.desc}</div>
      {mieN >= 2 && <div className="sect-warn"><b>天下共讨</b>：本宗连灭两派，诸派自危、歃血为盟。守住山门，或各个击破。</div>}
      {sum.mieN > 0 && mieN < 2 && <div className="hint">已并 {sum.mieN} 派道统——再灭一派，诸派会联手来讨。</div>}

      <div className="sec-title">进行中的战事<small>{sum.wars.length ? `${sum.wars.length} 场` : '眼下太平'}</small></div>
      {sum.wars.length
        ? <div className="sect-tbl">{sum.wars.map((w) => (
          <div key={w.id} className="sw-war">
            <div className="sw-war-t"><b>{w.title}</b>{w.zm && <em>正魔之争</em>}{w.fall && <em className="low">听候发落</em>}</div>
            <div className="sw-war-m">争 <b>{w.target}</b> · 第 {w.wave + 1} 阵 · {w.attName} 主攻 · 折损 {w.la}/{w.lb}</div>
            <div className="sect-row-acts">
              <button className="ink-btn small jade" onClick={() => act(() => { const raw = sw.S.wars.find((x) => x.id === w.id); if (raw) openWar(raw); }, 'open')}>{w.fall ? '发落败者' : '调兵 / 看战报'}</button>
              {!w.fall && <button className="ink-btn small" onClick={() => act(() => { const raw = sw.S.wars.find((x) => x.id === w.id); if (raw) game.openDialog(sw.musterOrderNode(raw)); }, 'open')}>点兵援军</button>}
              <span className="hint">{w.why}</span>
            </div>
          </div>
        ))}</div>
        : <div className="hint">眼下本宗没有战事。别派相争会先在山门之外的据点摩擦起来——你可以投效一方，或趁乱行事。</div>}

      <div className="sec-title">据点<small>镇守的弟子不能同时随你出征 · 月月有进项</small></div>
      <div className="sect-tbl">
        {cands.map((h) => {
          const fortLv = h.fortLv ?? 0;
          const fortCost = [450, 900, 1600][fortLv] ?? 1600;
          const captains = my.ds.filter((d) => d.realm >= 2);
          const otherHolds = sum.holds.filter((o) => o.id !== h.id);
          return (
          <div key={h.id} className="sect-tr hold">
            <b>{h.name}{h.owner === MY_SECT_ID ? '（本宗）' : ''}</b>
            <small>{h.owner ? h.ownerName : '无主'}{h.g ? ` · ${h.g} 人` : ''}{fortLv > 0 ? ` · 工事Lv.${fortLv}` : ''}{h.commanderName ? ` · 主将 ${h.commanderName}` : ''}</small>
            <small>{h.dir}方 {h.dist} 里 · 月入 {h.income}</small>
            <div className="sect-row-acts" style={{ margin: 0 }}>
              {h.owner === MY_SECT_ID ? (<>
                <button className="ink-btn small" disabled={sum.free < 5} onClick={() => act(() => { if (sw.holdAdd(h.id, 5)) setFlash(`${h.name}增派 5 人`); }, 'click')}>增派 5</button>
                <button className="ink-btn small ghost" disabled={h.g <= 5} onClick={() => act(() => { if (sw.holdWithdraw(h.id, 5)) setFlash(`${h.name}撤回 5 人`); }, 'click')}>撤回 5</button>
                <button className="ink-btn small ghost" disabled={fortLv >= 3 || my.stones < fortCost}
                  title={fortLv >= 3 ? '防御工事已满级 (Lv.3)' : `升级防御工事至 Lv.${fortLv + 1}（耗 ${fortCost} 灵石）`}
                  onClick={() => act(() => { const r = sw.upgradeHoldFort(h.id); setFlash(r.msg); }, 'click')}>{fortLv >= 3 ? '工事满级' : `筑防Lv.${fortLv + 1}`}</button>
                <button className="ink-btn small ghost" disabled={!captains.length && !h.commanderId}
                  title={!captains.length && !h.commanderId ? '尚无筑基以上门人' : '委任或卸任据点镇守主将'}
                  onClick={() => act(() => {
                    game.openDialog({
                      speaker: h.name, title: '委任据点主将', mood: 'normal',
                      text: `主将坐镇可使${h.name}月入额外 +15%、战时守军更加稳固。${h.commanderName ? `\n当前主将：${h.commanderName}` : ''}`,
                      options: [
                        ...(h.commanderId ? [{ label: '卸任当前主将', tone: 'bad' as const, act: () => { const r = sw.assignHoldCommander(h.id, undefined); setFlash(r.msg); re(); return null; } }] : []),
                        ...captains.slice(0, 8).map((d) => ({
                          label: `${d.name}（${realmName(d.realm, d.stage)}）${h.commanderId === d.id ? ' · 现任' : ''}`,
                          act: () => { const r = sw.assignHoldCommander(h.id, d.id); setFlash(r.msg); re(); return null; },
                        })),
                        { label: '取消', act: () => null },
                      ],
                    });
                  }, 'open')}>{h.commanderName ? '换将' : '委任主将'}</button>
                {otherHolds.length > 0 && (
                  <button className="ink-btn small ghost" disabled={h.g <= 5}
                    title={h.g <= 5 ? '守军须多于 5 人方可调防' : '从本据点调拨 5 人直赴他处据点协防'}
                    onClick={() => act(() => {
                      game.openDialog({
                        speaker: h.name, title: '跨据点调防', mood: 'normal',
                        text: `从${h.name}（现有 ${h.g} 人）抽调 5 人直接赴他处据点协防：`,
                        options: [
                          ...otherHolds.slice(0, 8).map((o) => ({
                            label: `调拨 5 人 → ${o.name}（现 ${o.g} 人）`,
                            act: () => { const r = sw.transferHoldGarrison(h.id, o.id, 5); setFlash(r.msg); re(); return null; },
                          })),
                          { label: '取消', act: () => null },
                        ],
                      });
                    }, 'open')}>调防</button>
                )}
                <button className="ink-btn small ghost" onClick={() => act(() => { sw.holdDrop(h.id); setFlash(`弃守${h.name}`); }, 'fail')}>弃守</button>
              </>) : !h.owner ? (<>
                {[6, 12, 20].map((n) => (
                  <button key={n} className="ink-btn small" disabled={full || sum.free < n}
                    title={full ? '据点已满（宗门规模所限）' : sum.free < n ? '可调之兵不足' : `派 ${n} 人去镇守`}
                    onClick={() => act(() => { if (sw.holdPlant(h.id, n)) setFlash(`${n} 名弟子进驻${h.name}`); }, 'chime')}>进驻 {n}</button>
                ))}
              </>) : (<>
                <button className="ink-btn small" disabled={!LOC_BY_ID.has(h.owner) || sw.combatTotal(MY_SECT_ID) < 12}
                  title={sw.combatTotal(MY_SECT_ID) < 12 ? '战兵不足十二' : `强占即是向${h.ownerName}宣战`}
                  onClick={() => act(() => { const w = sw.holdSeize(h.id); if (w) { setFlash(`兵锋转向${h.name}`); openWar(w); } else setFlash('强占不成：停战之约未满，或战兵不足十二'); }, 'open')}>强占（=宣战）</button>
              </>)}
            </div>
          </div>
          );
        })}
      </div>
      {full && <Lock why="据点已满：提升宗门规模（威望 600 中宗门 · 1800 大宗门）才能多镇守几处" />}

      <div className="sec-title">宣战<small>门人须有十二人以上；打过之后五年内不能再战</small></div>
      <div className="sect-tbl">
        {foes.map(({ sid, t }) => {
          const can = sw.canDeclare(sid);
          return (
            <div key={sid} className="sect-tr hold">
              <b>{sw.name(sid)}</b>
              <small>{SCALE_NAME[sw.scale(sid)]} · {sw.alive(sid)} 人 · 战力约 {Math.round(sw.strength(sid))}</small>
              <small className={t >= 55 ? 'low' : ''}>{sw.relName(MY_SECT_ID, sid)}（{Math.round(t)}）</small>
              <div className="sect-row-acts" style={{ margin: 0 }}>
                {declarePick === sid ? (<>
                  <button className="ink-btn small" style={{ background: 'var(--vermilion)', color: '#fff' }}
                    onClick={() => act(() => { const w = sw.declareOn(sid); setDeclarePick(''); if (w) { setFlash(`已向${sw.name(sid)}宣战`); openWar(w); } else setFlash('宣战不成：门人不足十二，或停战期未满'); }, 'open')}>确定宣战</button>
                  <button className="ink-btn small ghost" onClick={() => { setDeclarePick(''); audio.sfx('click'); }}>取消</button>
                </>) : (
                  <button className="ink-btn small" disabled={!can.ok} title={can.why}
                    onClick={() => { audio.sfx('click'); setDeclarePick(sid); }}>宣战</button>
                )}
              </div>
              {!can.ok && <small className="sect-lock">{can.why}</small>}
            </div>
          );
        })}
        {!foes.length && <div className="hint">此地各派都在交战，或都已结盟。</div>}
      </div>
      <div className="sect-row-acts">
        <button className="ink-btn small ghost" onClick={() => { audio.sfx('click'); setTab('world'); }}>天下宗门一览</button>
        <button className="ink-btn small ghost" onClick={() => act(() => { game.openDialog(game.mysect.zhenNode()); }, 'open')}>护宗大阵（充能 · 变阵 · 扩建）</button>
        <span className="hint">护宗大阵：{sum.zhenCap ? `${sum.zhenName} 阵力 ${sum.zhenHp}/${sum.zhenCap}` : '尚未布阵'}</span>
      </div>
      {flash && <div className="sect-flash">✓ {flash}</div>}
    </>);
  };

  // ---------------------------------------------------------------- 收徒规矩
  const Seg = ({ opts }: { opts: { k: string; on: boolean; label: string; act: () => void }[] }) => (
    <span className="seg">
      {opts.map((o) => (
        <button key={o.k} className={o.on ? 'on' : ''}
          onClick={() => { audio.sfx('click'); o.act(); re(); }}>{o.label}</button>
      ))}
    </span>
  );
  const Rules = () => {
    const rate = S.recruitRate();
    return (<>
      <div className="rule-list">
        <div className="rule-row">
          <div className="rr-label">山门</div>
          <div className="rr-body">
            <Seg opts={[
              { k: 'open', on: my.open, label: '大开', act: () => S.setOpen(true) },
              { k: 'shut', on: !my.open, label: '紧闭', act: () => S.setOpen(false) },
            ]} />
            <span className="hint">关门期间不再有人来投，现有门人照旧修炼。</span>
          </div>
        </div>
        <div className="rule-row">
          <div className="rr-label">门槛</div>
          <div className="rr-body">
            <Seg opts={[1, 2, 3, 4, 5].map((k) => ({
              k: String(k), on: my.minRoot === k, label: ROOT_TEXT[k], act: () => S.setMinRoot(k),
            }))} />
            <span className="hint">现收「{ROOT_TEXT[my.minRoot]}及以上」——门槛越高来的人越少，但来的人修得快；带艺投师的散修放宽一档。</span>
          </div>
        </div>
        <div className="rule-row">
          <div className="rr-label">收录</div>
          <div className="rr-body">
            <Seg opts={[
              { k: 'auto', on: my.auto, label: '执事自行收录', act: () => S.setAuto(true) },
              { k: 'manual', on: !my.auto, label: '宗主亲自过目', act: () => S.setAuto(false) },
            ]} />
            <span className="hint">
              {my.auto ? '合乎门槛的求拜者当月经执事收下，宗主不必逐一手批。' : '求拜者会堆在山门，等你在「山门求拜者」页逐个决定。'}
            </span>
          </div>
        </div>
      </div>
      <div className="rule-foot">
        {my.open ? `按现在的名望与藏经阁，每月约来 ${rate.perMonth.toFixed(1)} 人（一年约 ${Math.round(rate.perYear)} 人）` : '山门紧闭：眼下没有人来投'}
        <span>　·　门人 {my.ds.length}/{S.cap()}　·　待见 {my.apps.length} 人</span>
      </div>
      {flash && <div className="sect-flash">✓ {flash}</div>}
    </>);
  };

  // ---------------------------------------------------------------- 自创功法
  const Arts = () => {
    const list = S.myArts();
    const cap = S.myArtCap();
    return (<>
      <div className="sect-chips">
        <span className="sect-chip"><b>已自创</b>{list.length}/{cap}</span>
        <span className="sect-chip"><b>可作根基</b>练到「大成」以上的法术</span>
        <span className="sect-chip"><b>境界所限</b>元婴初期一门，每进一小阶多一门</span>
      </div>
      <div className="sect-row-acts">
        <button className="ink-btn jade" disabled={list.length >= cap} onClick={() => { audio.sfx('open'); const n = S.openArtsNode(); if (n) game.openDialog(n); }}>
          闭关自创新功法（{list.length}/{cap}）
        </button>
        {list.length >= cap && <Lock why="境界所限：元婴初期一门，每进一小阶多一门" />}
      </div>
      <div className="sec-title">自创功法名录<small>威力约高两成、运转快一成、品阶升一阶</small></div>
      {!list.length && <div className="hint">尚未自创过功法。以一门练到「大成」的法术为根基，可再融入另一门的意境，闭关三十日成一门新术。</div>}
      <div className="sect-tbl">
        {list.map((m) => {
          const a = m.def, cost = ART_COST[a.tier] ?? 800;
          return (
            <div key={a.id} className="sect-tr hold">
              <b style={{ color: TIER_COLOR[a.tier] }}>《{a.name}》</b>
              <small>{TIER_NAME[a.tier]} · {SCHOOL_NAME[a.school]}</small>
              <small>脱胎《{ARTS[m.base]?.name ?? '？'}》{m.mix ? ` · 融《${ARTS[m.mix]?.name ?? '？'}》` : ''}</small>
              {m.pub
                ? <small>已刊行天下（第 {Math.floor(m.pub / 360) + 1} 年）</small>
                : <button className="ink-btn small" disabled={money < cost} onClick={() => act(() => { if (S.publishMyArt(m)) setFlash(`《${a.name}》刊行天下，${my.name}威望大涨`); else setFlash(`${bal.curName}不足`); }, 'chime')}>刊行天下（{bal.curScale > 1 ? `${Math.max(1, Math.ceil(cost / bal.curScale))} ${bal.curName}` : `${cost} 灵石`}）</button>}
            </div>
          );
        })}
      </div>
      <div className="hint">刊行之后，这门功法会流入各地坊市、洞府与他人的储物袋；你的名字随它传开，来投的好苗子更多。</div>
      {flash && <div className="sect-flash">✓ {flash}</div>}
    </>);
  };

  // ---------------------------------------------------------------- 大事记
  const Log = () => (
    <>
      <div className="sect-chips">
        <span className="sect-chip"><b>击退来犯</b>{my.wins} 次</span>
        <span className="sect-chip"><b>失守</b>{my.losses} 次</span>
        <span className="sect-chip"><b>立派</b>第 {Math.floor(my.founded / 360) + 1} 年</span>
      </div>
      {my.log.length
        ? <div className="sect-log">{my.log.slice(-40).reverse().map((l, i) => <div key={i} className="sect-log-row"><small>第 {Math.floor(l.d / 360) + 1} 年</small>{l.t}</div>)}</div>
        : <div className="hint">还没有什么可记的事。</div>}
    </>
  );

  function subTabs<T extends string>(items: readonly (readonly [T, string, string?])[], cur: T, setCur: (v: T) => void) {
    return (
      <div className="sect-tabs" style={{ marginBottom: 8 }}>
        {items.map(([k, label, b]) => (
          <button key={k} className={cur === k ? 'on' : ''} onClick={() => { audio.sfx('click'); setCur(k); setFlash(''); }}>
            {label}{b ? `（${b}）` : ''}
          </button>
        ))}
      </div>
    );
  }

  const view = nav === 'overview'
    ? (showAllLog ? <>{Overview()}{Log()}</> : Overview())
    : nav === 'roster'
      ? (<>
        {subTabs<'roster' | 'jobs' | 'apps' | 'rules'>([
          ['roster', '门人名册', `${my.ds.length}`],
          ['jobs', '分派差事'],
          ['apps', '山门求拜者', my.apps.length ? `${my.apps.length}` : undefined],
          ['rules', '收徒规矩'],
        ], rosterSub, setRosterSub)}
        {rosterSub === 'roster' ? Roster() : rosterSub === 'jobs' ? Jobs() : rosterSub === 'apps' ? Apps() : Rules()}
      </>)
      : nav === 'library'
        ? (<>
          {subTabs<'library' | 'arts'>([
            ['library', '藏经阁', `${my.lib.length}/${S.libCap()}`],
            ['arts', '自创功法', `${S.myArts().length}/${S.myArtCap()}`],
          ], libSub, setLibSub)}
          {libSub === 'library' ? Library() : Arts()}
        </>)
        : nav === 'build'
          ? (<>
            {subTabs<'build' | 'vault'>([
              ['build', '宗门建设 · 大阵'],
              ['vault', '库房与用度', my.tribute >= 1 ? '有供奉' : undefined],
            ], buildSub, setBuildSub)}
            {buildSub === 'build' ? Build() : Vault()}
          </>)
          : nav === 'guard'
            ? Guard()
            : War();

  const badge = (id: CoreSectNav): string => {
    if (id === 'roster') return my.apps.length ? `${my.ds.length}+${my.apps.length}` : `${my.ds.length}`;
    if (id === 'build' && my.tribute >= 1) return '●';
    if (id === 'guard') return `${(my.guard ?? []).length}/${S.guardCap()}`;
    if (id === 'war') return sw?.S.wars.some((w) => w.a === MY_SECT_ID || w.b === MY_SECT_ID) ? '⚔' : '';
    return '';
  };

  return (
    // 标题行不再挂「小宗门·正道·名动一方（威望）·门人 x/y·灵石」——这些概览页里都有，重复一遍反而挤
    <Scroll title={`${my.name} · 宗主大殿`}
      onClose={onClose} wide cls="sect-panel">
      <div className="sect-head-tabs">
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => { audio.sfx('click'); setTab('mine'); }}>本宗</button>
        <button className={tab === 'world' ? 'on' : ''} onClick={() => { audio.sfx('click'); setTab('world'); setDeclarePick(''); }}>天下宗门 & 战事</button>
        {tab === 'world' && <span className="hint" style={{ marginLeft: 'auto' }}>本图 {sw?.sects(ACTIVE_MAP).length ?? 0} 派</span>}
      </div>
      {tab === 'mine' ? (
        <div className="sect-body">
          <div className="sect-nav">
            {NAV.map((n) => {
              const b = badge(n.id);
              return (
                <button key={n.id} className={nav === n.id ? 'on' : ''} onClick={() => { setNav(n.id); setFlash(''); setLibConfirm(''); audio.sfx('click'); }}>
                  {n.t}{b && <span>{b}</span>}
                </button>
              );
            })}
          </div>
          <div className="sect-content">{view}</div>
        </div>
      ) : (
        <div className="sect-world">{World()}</div>
      )}
    </Scroll>
  );
}

const clampUnit = (v: number) => Math.max(0, Math.min(1, v));
