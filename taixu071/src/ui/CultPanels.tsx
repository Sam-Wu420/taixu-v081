import { flightMount, effectiveFlightMount, isFlightMountItem, setFlightMount } from '../world/flightMount';
import { CharacterPortrait } from './CharacterPortrait';
import { equipmentAppearance } from '../gfx/equipmentAppearance';
// 第二步面板：角色 / 背包 / 炼丹 / 闭关 / 存档 / 坐化
import { modx } from '../mod/hooks';
import { ModSlot } from './ModUi';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Game, SeclusionProgress, SeclusionReport, SeclusionSession } from '../world/game';
import { Game as GameCls } from '../world/game';
import * as C from '../world/cultivation';
import { REALMS, realmDef, realmName, realmRule, smallBottleneck, MAJOR_BREAKS, levelOf, isAtRealmCap, realmCapLabel, realmCapDesc } from '../data/realms';
import { ACTIVE_MAP, ACTIVE_WORLD, MAP_NAME, LOC_BY_ID } from '../data/world';
import { WORLDS, worldRealmCap, worldCurrencyId, worldCurrencyName, WORLD_IDS, planeSpaceLaw, worldLawSuppression, type WorldId } from '../data/worldHierarchy';
import { canCrossWorld } from '../world/travel';
import * as HP from '../world/higherPlane';
import { herbValue, itemDef } from '../data/items';
import { RECIPES, ageToCount } from '../data/recipes';
import { talentById } from '../data/skills';
import { audio } from '../world/audio';
import { ItemGlyph } from './ItemIcon';
import { prepareFuzzyQuery, fuzzyScoreFields } from './fuzzySearch';
import { DaoxinSys } from '../world/daoxin';
import { unzipSave } from '../world/savezip';
import { importRawSave, importErrorText } from '../world/saveImport';

const TYPE_NAME: Record<string, string> = { pill: '丹药', herb: '灵草', material: '材料', talisman: '符箓', scroll: '功法', artifact: '法宝', misc: '杂物' };
const TIER_COLOR = ['#5a544a', '#2f6b5e', '#2b5a8a', '#7a3a9a', '#b8802a', '#a8352a', '#d04a20'];
const fmt = (n: number) => n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toLocaleString();

function Panel({ title, onClose, children, wide, sub, slot }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; sub?: React.ReactNode; slot?: string }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className={'scroll-panel cult-panel' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="panel-head"><div className="panel-title">{title}</div><div className="panel-sub">{sub}</div><button className="close-btn" onClick={onClose}>×</button></div>
        <div className="cult-body">{children}{slot && <ModSlot id={slot} />}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 角色
export function CharPanel({ game, onClose, onOpenHigher }: { game: Game; onClose: () => void; onOpenHigher?: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const h = game.hero;
  const st = C.heroStats(h);
  const need = C.need(h);
  const bn = C.bottleneck(h, ACTIVE_WORLD);
  const root = C.rootDef(h), gf = C.gongfaDef(h);
  const pl = game.placeBonus();
  const sb = bn === 'small' ? smallBottleneck(h.realm, h.stage, ACTIVE_WORLD) : null;
  const mb = bn === 'major' ? MAJOR_BREAKS[h.realm] : null;
  const pillId = sb?.item ?? mb?.item ?? '';
  const have = pillId ? C.bagCount(h, pillId) : 0;
  const minPills = mb?.minItems ?? 0;
  const maxPills = sb ? Math.min(have, sb.count * 2) : mb ? Math.min(have, mb.maxItems) : 0;
  const [pills, setPills] = useState(Math.min(maxPills, Math.max(minPills, sb ? sb.count : (mb ? mb.maxItems : 1))));
  const usePills = Math.max(Math.min(minPills, maxPills), Math.min(pills, maxPills));
  const chance = sb ? C.smallChance(h, usePills, ACTIVE_WORLD) : mb ? C.majorChance(h, usePills, 0, ACTIVE_WORLD) : 0;
  const gate = bn === 'major' ? C.checkMajorGate(h, game.ws, game.ui?.explored ?? 0) : null;
  const auxInfo = bn === 'major' ? C.majorAuxBonus(h) : null;
  const medStale = C.isMedStale(h);
  const lifeLeft = C.maxLife(h) - h.age;
  const cap = worldRealmCap(ACTIVE_WORLD);
  const overCap = h.realm > cap.maxRealm || (h.realm === cap.maxRealm && h.stage > cap.maxStage);
  const atCap = isAtRealmCap(h.realm, h.stage, ACTIVE_WORLD);
  const nextTalent = atCap ? undefined : C.TALENT_LEVELS.find((lv) => lv > levelOf(h.realm, h.stage));

  return (
    <Panel title="苏寒" slot="char" onClose={onClose} wide sub={<span className="realm-badge" style={{ background: realmDef(h.realm).color, fontSize: 14 }}>{realmName(h.realm, h.stage)}</span>}>
      {h.pendingTalent && (
        <div className="talent-pick">
          <div className="tp-title">逆 天 改 命</div>
          <div className="tp-sub">修为精进，心有所感——择一机缘，永久改变命数</div>
          <div className="tp-cards">
            {h.pendingTalent.map((id) => { const t = talentById(id)!; return (
              <button key={id} className={'tp-card tier' + t.tier} onClick={() => { game.chooseTalent(id); re(); }}>
                <div className="tp-name">{t.name}</div><div className="tp-desc">{t.desc}</div>
              </button>); })}
          </div>
        </div>
      )}
      <div className="char-grid">
        <div className="char-left">
          <div className="char-big-portrait"><CharacterPortrait look={equipmentAppearance(game.player.look, h.equip, h.wardrobe?.showEquipment === true)} /></div>
          <div className="kv"><span>年龄</span><b>{Math.floor(h.age)} 岁</b></div>
          <div className="kv"><span>寿元</span><b style={{ color: lifeLeft < 10 ? '#a8352a' : undefined }}>{C.maxLife(h)} 载（余 {Math.max(0, lifeLeft).toFixed(1)}）</b></div>
          <div className="kv"><span>灵根</span><b title={root.desc}>{root.name} ×{root.rate}</b></div>
          <div className="kv"><span>功法</span><b title={gf.desc}>{gf.name} ×{gf.rate}</b></div>
          {h.bottle.owned !== false && <div className="kv"><span>问道残卷</span><b className="bottle">{'●'.repeat(Math.max(0, Math.min(C.BOTTLE_MAX, h.bottle.drops)))}{'○'.repeat(Math.max(0, C.BOTTLE_MAX - h.bottle.drops))}{h.bottle.drops < C.BOTTLE_MAX && <small>（{Math.ceil(C.BOTTLE_DAYS - h.bottle.charge)} 天后凝露）</small>}</b></div>}
        </div>
        <div className="char-right">
          {C.hasDaoHurt(h) && (
            <div className="warn-box" style={{ marginBottom: 10, borderLeft: '3px solid #b8302a', background: 'rgba(184,48,42,0.1)', padding: '6px 10px' }}>
              <b style={{ color: '#a82820' }}>【道伤 · 经脉受损】尚余 {Math.ceil(h.daoHurt!.days)} 日</b>（{h.daoHurt!.why}）
              <div className="hint" style={{ marginTop: 2 }}>修炼速度 -40% · 法力上限 -20%　｜　服用疗伤丹/金髓丸/万年灵乳、闭关调息或请知交护法可加速痊愈。</div>
            </div>
          )}
          <div className="sec-title">装备 · 御器</div>
          <div className="kv"><span>独立御器栏</span><b>{effectiveFlightMount(h) ? `${itemDef(effectiveFlightMount(h)!).name}${flightMount(h) ? '' : '（法器栏）'}` : '未装备 · 凌空飞行'}</b></div>
          <div className="hint">从储物袋选择一件可御使的飞剑、飞舟、遁翼或披风作为飞行外观（不消耗物品）；未单设时自动沿用法器页祭出的飞行法器。炼气期须在法器页祭出神风舟等飞行法器方可起飞。</div>
          <select aria-label="御器栏" value={flightMount(h) ?? ''} onChange={e=>{setFlightMount(h,e.currentTarget.value || null);game.renderer?.resetStill();game.updateUI();re();}}>
            <option value="">{h.equip?.flight && C.bagCount(h, h.equip.flight) > 0 ? `跟随法器栏（${itemDef(h.equip.flight).name}）` : '不装备 · 凌空飞行'}</option>
            {Array.from(new Set(h.bag.filter(b=>C.bagCount(h,b.id)>0 && isFlightMountItem(b.id)).map(b=>b.id))).map(id=><option key={id} value={id}>{itemDef(id).name}</option>)}
          </select>
          <div className="sec-title">修为</div>
          {atCap ? (
            <div className="warn-box" style={{ borderLeft: '3px solid #c9a24a', background: 'rgba(201,162,74,0.12)', padding: '8px 12px', marginBottom: 8 }}>
              <b style={{ color: '#8a5a14' }}>{overCap ? `【已逾${WORLDS[ACTIVE_WORLD].name}上限 · ${realmName(h.realm, h.stage)}】` : `【${WORLDS[ACTIVE_WORLD].name}之巅 · ${realmCapLabel(ACTIVE_WORLD)}】`}</b>
              <div className="hint" style={{ marginTop: 3 }}>{realmCapDesc(ACTIVE_WORLD)}（寿元 {C.maxLife(h)} 载）。纵横山海、俯瞰众生，待他日破界飞升。</div>
            </div>
          ) : (
            <>
              <div className="exp-line">
                <div className="bar exp big"><div style={{ width: `${Math.min(100, (h.exp / need) * 100)}%` }} /></div>
                <span>{fmt(h.exp)} / {fmt(need)}</span>
              </div>
              <div className="hint">打坐每日 +{C.expPerDay(h, pl.mult, ACTIVE_WORLD).toFixed(1)} 修为（{pl.name}{pl.mult > 1 ? ` ×${pl.mult.toFixed(1)}` : ''}{C.hasDaoHurt(h) ? ' · 道伤×0.6' : ''}{medStale ? ' · 久居闭关滞涩×0.12' : ''}）· 预计 {bn === 'none' ? Math.ceil((need - h.exp) / Math.max(0.1, C.expPerDay(h, pl.mult, ACTIVE_WORLD))) + ' 天' : '已满'}</div>
              {medStale && bn === 'none' && (
                <div className="warn-box" style={{ marginTop: 6, borderLeft: '3px solid #b86a28', background: 'rgba(184,106,40,0.10)', padding: '6px 10px' }}>
                  <b style={{ color: '#9c4e14' }}>【闭关苦修障 · 道心枯寂】</b>
                  <div className="hint" style={{ marginTop: 2 }}>久居洞府闭门苦修，灵力已生郁结！请出关前往大世界斗法斩妖、探寻秘境古迹、完成悬赏或宗门差事，以红尘实战印证所学后方可恢复闭关进境。</div>
                </div>
              )}
            </>
          )}

          {(h.realm >= 5 || ACTIVE_WORLD !== 'human' || (game.ws.ascendedWorlds?.length ?? 0) > 0) && onOpenHigher && (
            <div style={{ margin: '8px 0', padding: '7px 10px', background: 'rgba(62,92,130,0.10)', border: '1px solid rgba(100,145,200,0.28)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12.5 }}>
                <b>上界修行 · 跨界飞升</b>
                <div className="hint" style={{ margin: 0 }}>飞升灵界/仙界、化灵/化仙池、天劫、玄天残胚、大道法则与斩仙榜</div>
              </div>
              <button className="ink-btn small jade" onClick={() => { onClose(); onOpenHigher(); }}>打开</button>
            </div>
          )}

          {bn !== 'none' && (
            <div className={'break-box ' + bn}>
              <div className="bk-title">{bn === 'major' ? `冲击${h.realm + 1 === cap.maxRealm && cap.maxStage === 0 ? `${realmCapLabel(ACTIVE_WORLD)}（${WORLDS[ACTIVE_WORLD].name}极境）` : (REALMS[h.realm + 1]?.name ?? '极境')}` : `冲击${realmName(h.realm, h.stage + 1)}`}</div>
              <div className="bk-desc">
                {mb ? mb.desc : `小瓶颈：建议服用${itemDef(sb!.item).name} ${sb!.count} 枚辅助冲关。`}
                {mb && (() => { const fp = realmRule(h.realm).failPenalty; return `　失败重罚：修为倒退 ${Math.round((1 - fp.keepRatio) * 100)}%、折寿 ${fp.lifeCost} 载、道伤 ${fp.hurtDays} 日！`; })()}
              </div>
              {gate && (
                <div style={{ margin: '8px 0', padding: '7px 10px', background: 'rgba(60,48,32,0.07)', borderRadius: 6, border: '1px solid rgba(90,72,48,0.18)' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: gate.ok ? '#2f6b5e' : '#9e3428' }}>
                    {gate.ok ? '✓ 红尘历练与道基印证已圆满' : '◈ 破境道基印证（须亲历核心玩法方可冲关，不可单靠闭关突破）'}
                  </div>
                  {gate.list.map((it, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: 1.65, color: it.ok ? '#2f6b5e' : '#7a2e24' }}>
                      <span>{it.ok ? '✓ ' : '✗ '}{it.label}</span>
                      <b>{it.cur} / {it.need}</b>
                    </div>
                  ))}
                </div>
              )}
              {pillId && (
                <div className="bk-row">
                  <span>投入 {itemDef(pillId).name}（持有 {have}{minPills > 0 ? ` · 至少需 ${minPills}` : ''}）</span>
                  <button className="mini" disabled={usePills <= minPills} onClick={() => setPills(Math.max(minPills, usePills - 1))}>－</button>
                  <b>{usePills}</b>
                  <button className="mini" disabled={usePills >= maxPills} onClick={() => setPills(usePills + 1)}>＋</button>
                </div>
              )}
              {auxInfo && auxInfo.names.length > 0 && (
                <div className="hint" style={{ color: '#2f6b5e', marginBottom: 4 }}>护魂奇珍加持：{auxInfo.names.join('、')}（成功率 +{Math.round(auxInfo.bonus * 100)}%）</div>
              )}
              <div className="bk-row"><span>成功率</span><div className="bar chance"><div style={{ width: `${chance * 100}%` }} /></div><b>{(chance * 100).toFixed(0)}%</b></div>
              {mb && game.xinmo.needed() && <div className="hint">此关须先渡{h.realm >= 4 ? '六重天道问心大劫' : h.realm === 3 ? '五重心魔大劫' : '三重心魔劫'}：一旦心神失守将大幅削减成功率。</div>}
              <button className="ink-btn jade" disabled={!!(gate && !gate.ok) || (minPills > 0 && usePills < minPills)} onClick={() => { const r = game.breakthrough(usePills); setPills(minPills); re(); void r; }}>
                {gate && !gate.ok ? '历练未满 · 不可冲关' : minPills > 0 && have < minPills ? `缺少${itemDef(pillId).name}` : '引动天象 · 冲关'}
              </button>
            </div>
          )}

          <div className="sec-title">属性</div>
          {(planeSpaceLaw(ACTIVE_WORLD).stat < 1 || worldLawSuppression(h.realm, ACTIVE_WORLD) < 1) && (
            <div className="hint" style={{ marginBottom: 4, color: '#6b5c42' }}>
              {planeSpaceLaw(ACTIVE_WORLD).stat < 1 && (
                <span>{WORLDS[ACTIVE_WORLD].name}空间法则稳固：体魄法力 ×{Math.round(planeSpaceLaw(ACTIVE_WORLD).stat * 100)}% · 遁速 ×{Math.round(planeSpaceLaw(ACTIVE_WORLD).speed * 100)}% · 神识空间 ×{Math.round(planeSpaceLaw(ACTIVE_WORLD).senseSpace * 100)}%</span>
              )}
              {worldLawSuppression(h.realm, ACTIVE_WORLD) < 1 && (
                <span>{planeSpaceLaw(ACTIVE_WORLD).stat < 1 ? '　｜　' : ''}逆返下界天道排斥：威能额外折减至 ×{Math.round(worldLawSuppression(h.realm, ACTIVE_WORLD) * 100)}%</span>
              )}
            </div>
          )}
          <div className="stat-grid">
            <div><span>气血</span><b>{Math.round(st.hp * h.hp)} / {st.hp}</b></div>
            <div><span>法力</span><b>{Math.round(st.mp * h.mp)} / {st.mp}</b></div>
            <div><span>攻击</span><b>{st.atk}</b></div>
            <div><span>防御</span><b>{st.def}</b></div>
            <div><span>神识</span><b>{st.sense}</b></div>
            <div><span>感知</span><b title="清晰内圈 / 神识外圈">{Math.round(game.detailSenseRadius)} / {Math.round(game.awarenessRadius)} 步</b></div>
          </div>
          {((h.pillN ?? 0) > 0 || (h.sensePillBonus ?? 0) > 0 || (h.lifePillN ?? 0) > 0) && (
            <div className="hint" style={{ marginTop: 4 }}>
              丹毒耐药：本境丹毒 {Math.floor(h.pillN ?? 0)} 层（修为丹药效约 {Math.max(1, Math.round(Math.pow(C.PILL_FATIGUE, h.pillN ?? 0) * 100))}%）
              {(h.sensePillBonus ?? 0) > 0 && ` · 养魂耐药 ${Math.min(100, Math.round(((h.sensePillBonus ?? 0) / C.SENSE_PILL_CAP) * 100))}%`}
              {(h.lifePillN ?? 0) > 0 && ` · 延寿丹 ${h.lifePillN}/${C.LIFE_PILL_MAX} 枚`}
            </div>
          )}

          <div className="sec-title">天赋 <small>{nextTalent ? `下次逆天改命：${realmName(...fromLv(nextTalent))}` : ''}</small></div>
          <div className="talent-list">
            {h.talents.length === 0 && <div className="hint">尚无。炼气四层、七层、十层、十三层及此后每一境界，皆可逆天改命一次。</div>}
            {h.talents.map((id) => { const t = talentById(id); return t && <span key={id} className={'tal tier' + t.tier} title={t.desc}>{t.name}</span>; })}
          </div>
          <div className="sec-title">履历</div>
          <div className="hint">打坐 {Math.round(h.stats.meditateDays)} 日 · 采集 {h.stats.gathered} 次 · 服丹 {h.stats.pills} 枚 · 炼丹 {h.stats.alchemy} 炉 · 突破 {h.stats.breaks} 次 · 失败 {h.stats.failed} 次</div>
          <div className="sec-title">道心 <small>只可上调，不可下调</small></div>
          <div className="hint" style={{ lineHeight: 1.75 }}>
            <b style={{ color: game.daoxin.is('tiandao') ? '#b8443a' : game.daoxin.is('fanren') ? '#c9a24a' : '#5f8a6a', fontSize: 14 }}>「{game.daoxin.tierName()}」</b>
            <span>　{game.daoxin.tierDef().short}</span>
            <div style={{ marginTop: 3 }}>{game.daoxin.tierDef().desc}</div>
            <div style={{ marginTop: 6 }}>
              <button className="ink-btn ghost" onClick={() => { game.openDialog(game.daoxin.raiseNode()); re(); }}>砥砺道心</button>
            </div>
            {DaoxinSys.readAll().length > 0 && (
              <div style={{ marginTop: 6, color: '#8ea0c8' }}>
                前世之碑 {DaoxinSys.readAll().length} 座 —— 最近的一座立在{DaoxinSys.readAll()[0].place}：{DaoxinSys.readAll()[0].name}（{DaoxinSys.readAll()[0].realm}），{DaoxinSys.readAll()[0].year}年殁于{DaoxinSys.readAll()[0].killer}之手。
              </div>
            )}
          </div>
          <div className="sec-title">《苏寒随笔》· 江湖阅历 <small>辨伪识人心眼 +{Math.round((game.renxin?.discernBonus() ?? 0) * 100)}%</small></div>
          {game.jianghu && <div className="hint" style={{ color: game.jianghu.cred < 30 ? '#d08a7a' : game.jianghu.cred >= 85 ? '#c9a24a' : undefined }}>{game.jianghu.credText()}</div>}
          {(!game.ws.exp2 || game.ws.exp2.length === 0) ? (
            <div className="hint">扉页尚空。在尔虞我诈的修仙界里吃过亏或看破骗局后，便会记入随笔，化作日后看穿人心与假货的本钱。</div>
          ) : (
            <div style={{ maxHeight: 120, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.55, padding: '4px 6px', background: 'rgba(90,72,48,0.06)', borderRadius: 4 }}>
              {[...game.ws.exp2].reverse().map((e) => (
                <div key={e.id} style={{ marginBottom: 4 }}>
                  <b style={{ color: e.kind === 'see' ? '#2f6b5e' : '#a8352a' }}>【{e.title}{e.count > 1 ? `×${e.count}` : ''}】</b>
                  <span>{e.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
function fromLv(lv: number): [number, number] { if (lv <= 13) return [1, lv - 1]; if (lv >= 23) return [5, 0]; const k = lv - 14; return [2 + Math.floor(k / 3), k % 3]; }

// ---------------------------------------------------------------- 背包
const BagSlot = memo(function BagSlot({
  idx, id, name, tier, n, selected, isKnownFake, onSelect,
}: {
  idx: number; id: string; name: string; tier: number; n: number; selected: boolean; isKnownFake: boolean;
  onSelect: (idx: number) => void;
}) {
  return (
    <button
      className={'slot' + (selected ? ' on' : '')}
      onClick={() => onSelect(idx)}
      title={isKnownFake ? `【伪】假${name}` : name}
    >
      <ItemGlyph id={id} className="glyph" style={{ color: isKnownFake ? '#b8302a' : (TIER_COLOR[tier] ?? '#333') }} />
      <span className="nm" style={isKnownFake ? { color: '#b8302a' } : undefined}>{isKnownFake ? `伪·${name}` : name}</span>
      <span className="cnt">{n}</span>
    </button>
  );
});

const BAG_BATCH_INIT = 42;
const BAG_BATCH_STEP = 48;

export function BagPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [tick, force] = useState(0);
  const re = () => force((x) => x + 1);
  const [tab, setTab] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [sel, setSel] = useState<number>(-1);
  const [renderLimit, setRenderLimit] = useState(BAG_BATCH_INIT);
  const gridRef = useRef<HTMLDivElement>(null);
  const h = game.hero;
  const qNorm = query.trim().toLowerCase();
  const items = useMemo(
    () => {
      const fq = prepareFuzzyQuery(query);
      if (!fq) {
        const out: { b: (typeof h.bag)[number]; i: number; d: ReturnType<typeof itemDef> }[] = [];
        for (let i = 0; i < h.bag.length; i++) {
          const b = h.bag[i];
          const d = itemDef(b.id);
          if (tab !== 'all' && d.type !== tab) continue;
          out.push({ b, i, d });
        }
        return out;
      }
      const scored: { b: (typeof h.bag)[number]; i: number; d: ReturnType<typeof itemDef>; score: number }[] = [];
      for (let i = 0; i < h.bag.length; i++) {
        const b = h.bag[i];
        const d = itemDef(b.id);
        if (tab !== 'all' && d.type !== tab) continue;
        const typeLabel = TYPE_NAME[d.type];
        const score = fuzzyScoreFields(fq, [
          { text: d.name, weight: 1, kind: 'primary' },
          { text: typeLabel, weight: 0.65, kind: 'primary' },
          { text: [d.name, typeLabel].filter(Boolean).join(' '), weight: 0.55, kind: 'secondary' },
          { text: d.desc, weight: 0.4, kind: 'secondary' },
        ]);
        if (score > 0) scored.push({ b, i, d, score });
      }
      scored.sort((a, b) => (b.score - a.score) || (a.i - b.i));
      return scored.map(({ b, i, d }) => ({ b, i, d }));
    },
    [h.bag, h.bag.length, tab, qNorm, query, tick],
  );
  // 首帧仅挂首批可见格（~42 格），随后按帧增量补齐，彻底消除大背包打开瞬间卡顿
  useEffect(() => {
    setRenderLimit(BAG_BATCH_INIT);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [tab, qNorm]);
  useEffect(() => {
    if (renderLimit >= items.length) return;
    let raf = 0;
    const step = () => {
      setRenderLimit((prev) => {
        const next = Math.min(items.length, prev + BAG_BATCH_STEP);
        if (next < items.length) raf = requestAnimationFrame(step);
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [renderLimit < items.length, items.length]);

  const onSelect = useCallback((idx: number) => {
    setSel(idx);
    audio.sfx('click');
  }, []);
  const cur = sel >= 0 ? h.bag[sel] : null;
  const cd = cur ? itemDef(cur.id) : null;
  const { lingshi, lingjing, xianyuan } = useMemo(() => {
    let ls = 0, lj = 0, xy = 0;
    for (const b of h.bag) {
      if (b.fake && b.ident) continue;
      if (b.id === 'mat_lingshi') ls += b.n;
      else if (b.id === 'mat_lingjing') lj += b.n;
      else if (b.id === 'mat_xianyuan') xy += b.n;
    }
    return { lingshi: ls, lingjing: lj, xianyuan: xy };
  }, [h.bag, h.bag.length, tick]);
  const curId = worldCurrencyId(ACTIVE_WORLD), curName = worldCurrencyName(ACTIVE_WORLD);
  const curCount = curId === 'mat_lingshi' ? lingshi : curId === 'mat_lingjing' ? lingjing : curId === 'mat_xianyuan' ? xianyuan : C.bagCount(h, curId);
  const visibleItems = renderLimit >= items.length ? items : items.slice(0, renderLimit);
  return (
    <Panel title="储物袋" slot="bag" onClose={onClose} wide sub={<span>{curName} <b>{curCount}</b>{curId !== 'mat_lingshi' && lingshi > 0 ? <> · 灵石 <b>{lingshi}</b></> : null}{curId !== 'mat_lingjing' && lingjing > 0 ? <> · 灵晶 <b>{lingjing}</b></> : null}{curId !== 'mat_xianyuan' && xianyuan > 0 ? <> · 仙元石 <b>{xianyuan}</b></> : null}{h.bottle.owned !== false && <>　·　问道残卷 <b className="bottle">{'●'.repeat(Math.max(0, Math.min(C.BOTTLE_MAX, h.bottle.drops)))}{'○'.repeat(Math.max(0, C.BOTTLE_MAX - h.bottle.drops))}</b></>}</span>}>
      <div className="tabs bag-tabs">
        {['all', 'pill', 'herb', 'material', 'scroll', 'artifact'].map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setSel(-1); }}>{t === 'all' ? '全部' : TYPE_NAME[t]}</button>)}
        <input
          className="bag-search"
          type="search"
          value={query}
          placeholder="搜寻物品…"
          onChange={(e) => { setQuery(e.target.value); setSel(-1); }}
        />
      </div>
      <div className="bag-wrap">
        <div
          className="bag-grid"
          ref={gridRef}
          onScroll={(e) => {
            if (renderLimit >= items.length) return;
            const el = e.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 220) {
              setRenderLimit((prev) => Math.min(items.length, prev + BAG_BATCH_STEP * 2));
            }
          }}
        >
          {visibleItems.map(({ b, i, d }) => (
            <BagSlot
              key={i}
              idx={i}
              id={d.id}
              name={d.name}
              tier={d.tier}
              n={b.n}
              selected={sel === i}
              isKnownFake={!!(b.fake && b.ident)}
              onSelect={onSelect}
            />
          ))}
          {items.length === 0 && <div className="hint" style={{ gridColumn: '1/-1' }}>{qNorm ? '未找到匹配物品。' : '空空如也。在神识范围内寻找灵草、矿脉与灵泉，按 E 采集。'}</div>}
        </div>
        <div className="bag-detail">
          {cur && cd ? (
            <>
              <div className="bd-name" style={{ color: cur.fake && cur.ident ? '#b8302a' : TIER_COLOR[cd.tier] }}>
                {cur.fake && cur.ident ? `【伪劣】假${cd.name}` : cd.name}
                {cur.ident && !cur.fake && <small style={{ color: '#2f6b5e' }}>　✓ 已验真品</small>}
              </div>
              <div className="bd-type">{TYPE_NAME[cd.type]} · {['凡品', '下品', '中品', '上品', '极品', '灵品', '仙品'][cd.tier] ?? ''} · 持有 {cur.n}{cur.sellerName && cur.ident && cur.fake ? ` · 购自 ${cur.sellerName}` : ''}</div>
              <div className="bd-desc">
                {cur.fake && cur.ident
                  ? (cur.fake === 'broken' ? `这是一枚后半篇错漏百出的残缺伪简，强练必伤经脉！（可拿去找卖假货的 ${cur.sellerName ?? '摊贩'} 索赔算账，或直接销毁）` : `外层用灵草汁染出宝光，内里却是廉价淬体丸！（可去找卖假货的 ${cur.sellerName ?? '摊贩'} 算账）`)
                  : cd.desc}
              </div>
              {cd.type === 'herb' && <div className="hint">灵草只看数量，不计年份。问道残卷的墨露滴上一株，可一化为三。</div>}
              <div className="bd-actions">
                {modx?.canUse(cur.id) && <button className="ink-btn jade" onClick={() => { game.usePill(cur.id, sel); if (!h.bag[sel] || h.bag[sel].id !== cur.id) setSel(-1); re(); }}>使 用</button>}
                {(cd.pill || cur.id === 'herb_yangshen') && !modx?.canUse(cur.id) && !(cur.fake && cur.ident) && <button className="ink-btn jade" onClick={() => { game.usePill(cur.id, sel); if (!h.bag[sel] || h.bag[sel].id !== cur.id) setSel(-1); re(); }}>服用</button>}
                {cur.id.startsWith('egg_') && <button className="ink-btn jade" disabled={!!game.ws.incubate} onClick={() => { game.pets.onEgg(cur.id); setSel(-1); re(); }}>{game.ws.incubate ? '已有灵卵在温养' : '温 养'}</button>}
                {cd.type === 'scroll' && !(cur.fake && cur.ident) && <button className="ink-btn jade" onClick={() => { if (game.learnScroll(cur.id, sel)) setSel(-1); re(); }}>研读参悟</button>}
                {(cd.type === 'pill' || cd.type === 'scroll') && !cur.ident && (
                  <button className="ink-btn" title="耗少许法力，以神识探查丹药或玉简真伪" onClick={() => { const res = game.renxin.appraiseBagSlot(sel, false); game.toast(res.msg, res.isFake ? 'warn' : 'good'); audio.sfx(res.isFake ? 'fail' : 'chime'); re(); }}>神识探查真伪</button>
                )}
                {cur.fake && cur.ident && (
                  <button className="ink-btn ghost" onClick={() => { h.bag.splice(sel, 1); setSel(-1); game.toast(`已销毁伪造的${cd.name}。`, 'info'); re(); }}>销毁伪物</button>
                )}
                {cd.art && <button className="ink-btn" onClick={() => { const key = 'art:' + cur.id; if (!h.hotbar.includes(key)) { const k = h.hotbar.findIndex((x) => !x); h.hotbar[k >= 0 ? k : 8] = key; game.toast(`${cd.name}已放入快捷栏 ${(k >= 0 ? k : 8) + 1}`); } re(); }}>放入快捷栏</button>}
                {cd.art && ['armor', 'shield', 'flight', 'wings', 'boots'].includes(cd.art.kind) && <button className="ink-btn jade" onClick={() => { game.combat.castArtifact(cur.id); re(); }}>{Object.values(h.equip ?? {}).includes(cur.id) ? '收起' : '祭出'}</button>}
                {cd.type === 'talisman' && cd.tal?.kind !== 'revive' && <button className="ink-btn" onClick={() => { const key = 'tal:' + cur.id; if (!h.hotbar.includes(key)) { const k = h.hotbar.findIndex((x) => !x); h.hotbar[k >= 0 ? k : 8] = key; game.toast(`${cd.name}已放入快捷栏 ${(k >= 0 ? k : 8) + 1}`); } re(); }}>放入快捷栏</button>}
                {cd.type === 'herb' && h.bottle.owned !== false && <button className="ink-btn" disabled={h.bottle.drops <= 0} onClick={() => { game.useBottle(cur); const ni = h.bag.findIndex((x) => x.id === cur.id); setSel(ni); re(); }}>滴一滴墨露（一株化三，+{C.BOTTLE_GROW} 株）</button>}
              </div>
            </>
          ) : <div className="hint">选择一件物品查看。</div>}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- 炼丹
export function AlchemyPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const [tab, setTab] = useState<'pill' | 'forge' | 'donate'>('pill');
  const list = RECIPES.filter((x) => (x.kind ?? 'pill') === (tab === 'forge' ? 'forge' : 'pill'));
  const [sel, setSel] = useState(RECIPES[0].id);
  const [log, setLog] = useState<string[]>([]);
  const h = game.hero;
  const fire = game.forgeFire;
  const r = list.find((x) => x.id === sel) ?? list[0];
  const chk = C.checkRecipe(h, r, fire);
  const forge = tab === 'forge';
  const maxBatch = !chk.ok ? 0 : Math.min(50, r.inputs.reduce((m, inp) => {
    const need = inp.minAge ? ageToCount(inp.n, inp.minAge) : inp.n;
    return Math.min(m, Math.floor(C.bagCount(h, inp.id) / Math.max(1, need)));
  }, 50));
  const doBatch = (count: number) => {
    let tries = 0, wins = 0;
    for (let i = 0; i < count; i++) {
      if (!C.checkRecipe(h, r, fire).ok) break;
      const res = game.brew(r);
      tries++;
      if (res.ok) wins++;
    }
    if (tries === 1) {
      const last = wins ? `成${forge ? '器' : '丹'}！得 ${itemDef(r.out).name} ×${r.outN}` : `${forge ? '炼器' : '炼丹'}失手，药材损毁。`;
      setLog((l) => [last, ...l].slice(0, 6));
    } else if (tries > 1) {
      const msg = `连开 ${tries} 炉：成功 ${wins} 炉（产出 ${itemDef(r.out).name} ×${wins * r.outN}），失手 ${tries - wins} 炉。`;
      setLog((l) => [msg, ...l].slice(0, 6));
    }
    re();
  };
  const donateSid = game.ws.mySect ? 'mysect' : game.ws.sect?.id ?? '';
  const donateItems = h.bag.filter((b) => {
    if (b.fake && b.ident) return false;
    const d = itemDef(b.id);
    return b.id === 'mat_lingshi' || b.id === 'mat_lingjing' || b.id === 'mat_xianyuan' || d.type === 'pill' || d.type === 'herb' || d.type === 'material';
  });
  return (
    <Panel title={tab === 'donate' ? '战备捐献' : forge ? '器炉' : '丹房'} slot="alchemy" onClose={onClose} wide sub={tab === 'donate' ? '将丹药、灵草、灵材或灵石批量拨入宗门战备库，可换取战功与宗门贡献。' : forge ? (fire ? '此地有地火可借，炼器无碍。妖兽身上的鳞、爪、鳍、角与妖丹皆是炼器之材。' : '此处无地火，只能以自身法力催火——成器率大减。去城镇法器阁或宗门炼器房更稳妥。') : '以灵草炼丹。灵草只看数量，凑齐配方所需株数即可开炉（支持批量连炼）。'}>
      <div className="alch-tabs">
        <button className={tab === 'pill' ? 'on' : ''} onClick={() => { setTab('pill'); setSel(RECIPES[0].id); }}>炼丹</button>
        <button className={tab === 'forge' ? 'on' : ''} onClick={() => { setTab('forge'); setSel(''); }}>炼器{fire ? <i>地火</i> : null}</button>
        {donateSid && <button className={tab === 'donate' ? 'on' : ''} onClick={() => setTab('donate')}>战备捐献</button>}
      </div>
      {tab !== 'donate' ? (
      <div className="alch">
        <div className="recipe-list">
          {list.map((x) => { const ok = C.checkRecipe(h, x, fire).ok; return (
            <button key={x.id} className={'recipe' + (r.id === x.id ? ' on' : '') + (ok ? ' ok' : '')} onClick={() => setSel(x.id)}>
              <span className="glyph">{forge ? '器' : '丹'}</span>{x.name}{ok && <i>{forge ? '可炼' : '可炼'}</i>}
            </button>); })}
        </div>
        <div className="recipe-detail">
          <div className="bd-name">{r.name}<small>　产出 {itemDef(r.out).name} ×{r.outN}　耗时 {r.days} 日{forge ? `　需${REALMS[r.reqRealm]?.name ?? '高阶'}期` : ''}</small></div>
          <div className="bd-desc">{r.desc}</div>
          <div className="sec-title">{forge ? '所需材料' : '所需药材'}</div>
          <div className="inputs">
            {r.inputs.map((inp) => { const have = C.bagCount(h, inp.id, inp.minAge ?? 0); const ok = have >= inp.n; return (
              <div key={inp.id} className={'inp' + (ok ? ' ok' : '')}>
                <ItemGlyph id={inp.id} className="glyph" />
                <div><b>{itemDef(inp.id).name}</b><div className="hint">持有 {have} / 需 {inp.n}{!ok && inp.minAge && C.bagCount(h, inp.id) > have ? `（另有 ${C.bagCount(h, inp.id) - have} 株年份不足，可用问道残卷催熟）` : ''}</div></div>
              </div>); })}
          </div>
          <div className="bk-row"><span>{forge ? '成器率' : '成丹率'}</span><div className="bar chance"><div style={{ width: `${chk.chance * 100}%` }} /></div><b>{(chk.chance * 100).toFixed(0)}%</b></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="ink-btn jade" disabled={!chk.ok} onClick={() => doBatch(1)}>{forge ? '起炉炼器' : '开炉'}</button>
            {maxBatch >= 2 && ([5, 10] as const).filter((q) => maxBatch >= q).map((q) => (
              <button key={q} className="ink-btn" onClick={() => doBatch(q)}>{`×${q}`}</button>
            ))}
            {maxBatch >= 2 && (
              <button className="ink-btn ghost" onClick={() => doBatch(maxBatch)}>{`全炼（${maxBatch}）`}</button>
            )}
          </div>
          <div className="alch-log">{log.map((l, i) => <div key={i} style={{ opacity: 1 - i * 0.18 }}>{l}</div>)}</div>
        </div>
      </div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(() => {
          const sp = game.sectwar?.supplyOf(donateSid);
          return sp ? (
            <div className="hint">当前受捐宗门：<b>{game.sectwar.name(donateSid)}</b> · 战备丹药 {Math.round(sp.pills)} / {sp.maxPills} · 军费灵石 {fmt(sp.stones)} · 阵材 {Math.round(sp.mats)} · 我的战功 <b>{game.war.merit}</b></div>
          ) : null;
        })()}
        <div className="shop-list" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {donateItems.length === 0 && <div className="hint">储物袋中暂无可捐献的丹药、灵草、灵材或灵石。</div>}
          {donateItems.map((b, i) => {
            const d = itemDef(b.id);
            const steps = b.id === 'mat_lingshi' ? [50, 200, 1000] : (b.id === 'mat_lingjing' || b.id === 'mat_xianyuan') ? [5, 20, 100] : [1, 5, 10];
            return (
              <div key={b.id + i + (b.age ?? '')} className="shop-row">
                <ItemGlyph id={d.id} className="glyph" style={{ color: TIER_COLOR[d.tier] }} />
                <div className="sr-main">
                  <div className="sr-name" style={{ color: TIER_COLOR[d.tier] }}>{d.name}<small className="sr-type">持有 {b.n}</small></div>
                  <div className="sr-desc">{d.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {steps.filter((q) => b.n >= q).map((q) => (
                    <button key={q} className="ink-btn small ghost" onClick={() => { const res = game.sectwar.donateSupply(donateSid, b.id, q); setLog((l) => [res.msg, ...l].slice(0, 6)); audio.sfx(res.ok ? 'chime' : 'fail'); re(); }}>捐 {q}</button>
                  ))}
                  <button className="ink-btn small jade" onClick={() => { const res = game.sectwar.donateSupply(donateSid, b.id, b.n); setLog((l) => [res.msg, ...l].slice(0, 6)); audio.sfx(res.ok ? 'chime' : 'fail'); re(); }}>全部</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="alch-log">{log.map((l, i) => <div key={i} style={{ opacity: 1 - i * 0.18 }}>{l}</div>)}</div>
      </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- 闭关
export function SecludePanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [rep, setRep] = useState<SeclusionReport | null>(null);
  const [prog, setProg] = useState<SeclusionProgress | null>(null);
  const [customDays, setCustomDays] = useState<string>('7');
  const sessRef = useRef<SeclusionSession | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const beginAsyncSeclude = useCallback((days: number, opts?: { ignoreInterrupts?: boolean }, mergeBase?: SeclusionReport) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audio.sfx('whoosh');
    const sess = game.startSeclude(days, opts);
    sessRef.current = sess;
    const finishWith = (r: SeclusionReport) => {
      sessRef.current = null;
      setProg(null);
      if (mergeBase) {
        setRep({
          ...r,
          days: mergeBase.days + r.days,
          from: mergeBase.from,
          expGain: mergeBase.expGain + r.expGain,
          msgs: [...mergeBase.msgs, ...r.msgs],
        });
      } else {
        setRep(r);
      }
    };
    const first = sess.step(12);
    if (first.done && first.report) { finishWith(first.report); return; }
    setRep(null);
    setProg(first);
    const tick = () => {
      if (sessRef.current !== sess) return;
      const st = sess.step(12);
      if (st.done && st.report) { finishWith(st.report); return; }
      setProg(st);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [game]);

  const stopEarly = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const sess = sessRef.current;
    if (!sess) return;
    const st = sess.cancelEarly();
    sessRef.current = null;
    setProg(null);
    if (st.report) setRep(st.report);
  }, []);

  const h = game.hero;
  const pl = game.placeBonus();
  const rate = C.expPerDay(h, pl.mult, ACTIVE_WORLD);
  const bn = C.bottleneck(h, ACTIVE_WORLD);
  const cap = worldRealmCap(ACTIVE_WORLD);
  const overCap = h.realm > cap.maxRealm || (h.realm === cap.maxRealm && h.stage > cap.maxStage);
  const atCap = isAtRealmCap(h.realm, h.stage, ACTIVE_WORLD);
  const stale = !atCap && C.isMedStale(h);
  const opts: [string, number][] = [['七日', 7], ['半月', 15], ['一月', 30], ['一季', 90], ['一年', 360], ['十年', 3600], ['三十年', 10800], ['直到瓶颈', 0]];
  const parsedCustom = Math.max(1, Math.min(36000, Math.floor(Number(customDays) || 0)));
  const canSeclude = (d: number) => bn === 'none' && (!atCap || d > 0) && (!stale || (d > 0 && d <= 90));
  const pct = prog ? Math.min(100, Math.max(0, Math.round(prog.progress * 100))) : 0;

  return (
    <Panel title="闭关" slot="seclude" onClose={() => { if (sessRef.current) stopEarly(); else onClose(); }} sub={`${pl.name}${pl.mult > 1 ? ` · 灵气 ×${pl.mult.toFixed(1)}` : ''} · 每日 +${(atCap ? 0 : rate).toFixed(1)} 修为`}>
      {prog ? (
        <div className="sec-report">
          <div className="sr-title">{prog.phase === 'catchup' ? '推演关外世事……' : '闭关修炼中……'}</div>
          <div className="sr-line" style={{ marginBottom: 8 }}>
            {prog.daysTarget > 0
              ? <>已闭关 <b>{Math.round(prog.daysDone)}</b> / {prog.daysTarget} 日（{pct}%）</>
              : <>已闭关 <b>{prog.daysDone >= 360 ? `${(prog.daysDone / 360).toFixed(1)} 年（${Math.round(prog.daysDone)} 日）` : `${Math.round(prog.daysDone)} 日`}</b> · 冲刺瓶颈进度 {pct}%</>}
          </div>
          <div style={{ width: '100%', height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(210,180,120,0.35)', overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #4b8f6e, #7fd4a8)', transition: 'width 60ms linear' }} />
          </div>
          <div className="hint" style={{ marginBottom: 10 }}>
            当前境界：{prog.realmText} · 修为 {fmt(prog.exp)} / {fmt(prog.need)} · 寿元 {Math.floor(prog.age)} / {Math.round(prog.maxLife)} 岁
          </div>
          <div className="bd-actions">
            <button className="ink-btn ghost" onClick={stopEarly}>提前出关</button>
          </div>
        </div>
      ) : !rep ? (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>闭关期间光阴飞逝，年岁随之增长。修为主要靠岁月苦修：筑基要十几二十年，结丹动辄数十年，结婴需百年之功；丹药只能锦上添花，服多了还会积下丹毒。遇到瓶颈、逆天改命机缘、战事告急或寿元将尽时会提示或自动出关。宗门、秘境与灵泉畔修炼更快。</div>
          {C.hasDaoHurt(h) && <div className="warn-box" style={{ marginBottom: 8 }}>经脉受损（道伤余 {Math.ceil(h.daoHurt!.days)} 日）：闭关调息可以 1.8 倍速度平复道伤（约需闭关 {Math.ceil(h.daoHurt!.days / 1.8)} 日痊愈）。</div>}
          {atCap && <div className="warn-box">{overCap ? `已逾${WORLDS[ACTIVE_WORLD].name}上限（当前：${realmName(h.realm, h.stage)}），寿元 ${C.maxLife(h)} 载。在此界闭关修为不会增长，但仍可闭关静养调息、凝露候时。` : `已臻${WORLDS[ACTIVE_WORLD].name}极境「${realmCapLabel(ACTIVE_WORLD)}」，寿元 ${C.maxLife(h)} 载。在此界闭关修为不会增长，但仍可闭关静养调息、凝露候时。`}</div>}
          {stale && bn === 'none' && <div className="warn-box" style={{ marginBottom: 8 }}>久居闭关不历红尘，道心已生滞涩——长闭关须先外出斗法斩敌或完成差事方能精进（90 日内的短闭关调息/候战照常可用）。</div>}
          {bn !== 'none' && <div className="warn-box">修为已至瓶颈，闭关无益——请先完成红尘历练并在角色面板冲关。</div>}
          <div className="sec-opts">
            {opts.map(([n, d]) => (
              <button key={n} className="sec-opt" disabled={!canSeclude(d)} onClick={() => beginAsyncSeclude(d)}>
                <b>{n}</b><small>{d ? `+${fmt(atCap ? 0 : rate * d)} 修为 · 年龄 +${(d / 360).toFixed(d < 360 ? 2 : 0)}` : (atCap ? '已臻极境' : `约 ${Math.ceil((C.need(h) - h.exp) / Math.max(0.1, rate))} 日`)}</small>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 6px', flexWrap: 'wrap' }}>
            <span className="hint">自定义天数：</span>
            <input
              type="number"
              min={1}
              max={36000}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              style={{ width: 92, padding: '4px 8px', background: 'rgba(18,16,14,0.85)', color: '#f0e6d2', border: '1px solid rgba(210,180,120,0.35)', borderRadius: 4 }}
            />
            <span className="hint">日</span>
            <button
              className="ink-btn small jade"
              disabled={!canSeclude(parsedCustom)}
              onClick={() => beginAsyncSeclude(parsedCustom)}
            >
              开始闭关（+{fmt(atCap ? 0 : rate * parsedCustom)}）
            </button>
          </div>
          <div className="hint">寿元：{Math.floor(h.age)} / {C.maxLife(h)} 岁</div>
        </>
      ) : (
        <div className="sec-report">
          <div className="sr-title">{rep.interrupted ? '关外急报' : '出 关'}</div>
          <div className="sr-line">闭关 <b>{rep.days >= 360 ? `${(rep.days / 360).toFixed(1)} 年` : `${Math.round(rep.days)} 日`}</b> · {rep.reason}</div>
          <div className="sr-line">{rep.from === rep.to ? rep.to : <>{rep.from} → <b className="up">{rep.to}</b></>}</div>
          {rep.interrupted && (
            <div className="warn-box" style={{ margin: '8px 0' }}>
              <b>{rep.interrupted.title}</b>
              <div style={{ marginTop: 4 }}>{rep.interrupted.desc}</div>
              <div className="hint" style={{ marginTop: 4 }}>原定闭关尚余 {rep.interrupted.remainDays} 日。</div>
            </div>
          )}
          {rep.msgs.slice(-8).map((m, i) => <div key={i} className={'sr-msg ' + (m.kind ?? '')}>{m.text}</div>)}
          <div className="bd-actions">
            <button className="ink-btn jade" onClick={onClose}>{rep.interrupted ? '破关而出' : '出关'}</button>
            {rep.interrupted && (
              <button
                className="ink-btn ghost"
                onClick={() => beginAsyncSeclude(rep.interrupted!.remainDays, { ignoreInterrupts: true }, rep)}
              >
                继续苦修（余 {rep.interrupted.remainDays} 日）
              </button>
            )}
            {game.hero.pendingTalent && <span className="hint">（打开角色面板选择逆天改命）</span>}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- 存档
export function SavePanel({ game, onClose, onCloud }: { game: Game; onClose: () => void; onCloud?: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const [code, setCode] = useState<string | null>(null);
  const slots = GameCls.listSlots();
  const doExport = async () => {
    if (!game.daoxin.backupAllowed()) { game.toast(game.daoxin.backupRefusal('存'), 'warn'); return; }
    if (!game.save(0)) { game.toast(game.saveFailText(), 'warn'); return; }
    const raw = unzipSave(localStorage.getItem('fanren_save_auto') ?? '');   // 存档码给的是明文 JSON，跨版本通用
    const s = btoa(unescape(encodeURIComponent(raw)));
    // HTTPS 下直接复制；HTTP/移动端剪贴板不可用时，用游戏内弹窗显示（原生 prompt 会被面板/浏览器挡住）
    const clip = (navigator as any).clipboard;
    try {
      if (clip && typeof clip.writeText === 'function') {
        await clip.writeText(s);
        game.toast('存档码已复制到剪贴板。', 'good');
        return;
      }
    } catch { /* 落到弹窗 */ }
    setCode(s);
  };
  return (<>
    <Panel title="存档" onClose={onClose} sub="自动存档每二十秒及离开时写入">
      <div className="slots">
        {slots.map((s) => (
          <div key={s.key} className={'slot-row' + (s.empty ? ' empty' : '')}>
            <div className="sl-name">{s.name}</div>
            <div className="sl-info">{s.unavailable ? '存储不可访问' : s.invalid ? '存档损坏或格式无效（建议先备份）' : s.empty ? '—— 空 ——' : <>{s.realm} · {s.age}岁 · 第{s.year}年 · {s.region}<small>{s.time ? new Date(s.time).toLocaleString() : ''}</small></>}</div>
            <div className="sl-btns">
              {s.slot > 0 && !s.unavailable && <button className="ink-btn" onClick={() => { if (s.invalid && !confirm(`${s.name}含有无法读取的数据，确定覆盖？建议先备份。`)) return; if (game.save(s.slot)) game.toast(`已存入${s.name}。`, 'good'); else game.toast(game.saveFailText(), 'warn'); audio.sfx('chime'); re(); }}>存</button>}
              {!s.empty && !s.invalid && !s.unavailable && <button className="ink-btn ghost" onClick={() => { if (game.load(s.key)) { game.toast(`已读取${s.name}。`, 'good'); onClose(); } else game.toast('读取失败；当前状态可能已改变，请重新加载页面。', 'warn'); }}>读</button>}
              {!s.empty && !s.unavailable && s.slot > 0 && <button className="ink-btn ghost" onClick={() => { if (confirm(`删除${s.name}？`)) { GameCls.deleteSlot(s.slot); re(); } }}>删</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="sec-title">云存档<small>一座人人都能存、谁都删不掉的公共寄存库</small></div>
      <div className="bd-actions">
        <button className="ink-btn small jade" onClick={() => onCloud?.()}>打开万民卷宗</button>
      </div>
      <div className="sec-title">存档码<small>{game.daoxin.backupAllowed() ? '复制到别处保存，或在另一台设备导入（离线“云存档”）' : '天道档不留备份：导不出，也导不回——陨落之处那座碑就是你的存档'}</small></div>
      <div className="bd-actions">
        <button className="ink-btn small" onClick={doExport}>导出存档码</button>
        <button className="ink-btn small ghost" onClick={() => {
          if (!game.daoxin.backupAllowed()) { game.toast(game.daoxin.backupRefusal('取'), 'warn'); return; }
          const code = prompt('粘贴存档码：'); if (!code) return;
          if (!confirm('导入并读取？成功后会覆盖存档三，请先备份。')) return;
          try {
            const raw = decodeURIComponent(escape(atob(code.trim())));
            const result = importRawSave(raw, 'fanren_save_3', localStorage, key => game.load(key));
            if (result === 'ok') { game.toast('导入成功（已写入存档三）。', 'good'); onClose(); }
            else game.toast(importErrorText(result), 'warn');
          } catch { game.toast('存档码无法解码，未覆盖存档三。', 'warn'); }
        }}>导入存档码</button>
      </div>
    </Panel>
    {code !== null && (
      <div className="code-mask" onClick={() => setCode(null)}>
        <div className="code-box" onClick={(e) => e.stopPropagation()}>
          <h3>存档码</h3>
          <p>把下面整段文字复制到别处保存，或粘贴到另一台设备导入。HTTP/移动端不会自动复制，请长按文本框全选。</p>
          <textarea readOnly value={code} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
          <div className="code-acts">
            <button className="ink-btn small" onClick={async () => {
              try {
                await (navigator as any).clipboard.writeText(code);
                game.toast('存档码已复制到剪贴板。', 'good'); setCode(null);
              } catch {
                const ta = document.querySelector('.code-box textarea') as HTMLTextAreaElement | null;
                ta?.focus(); ta?.select();
                try { document.execCommand('copy'); game.toast('已全选，直接复制即可。', 'info'); }
                catch { game.toast('请长按文本框全选复制。', 'info'); }
              }
            }}>复制</button>
            <button className="ink-btn small ghost" onClick={() => setCode(null)}>关闭</button>
          </div>
        </div>
      </div>
    )}
  </>);
}

// ---------------------------------------------------------------- 上界修行 · 跨界飞升
export function HigherPlanePanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const re = () => { force((x) => x + 1); game.updateUI(true); };
  const [tab, setTab] = useState<'ascend' | 'spirit' | 'immortal' | 'rank'>(
    ACTIVE_WORLD === 'immortal' ? 'immortal' : ACTIVE_WORLD === 'spirit' ? 'spirit' : 'ascend',
  );
  const [xtKind, setXtKind] = useState<'sword' | 'ding'>('sword');
  const h = game.hero;
  const hi = HP.ensureHigher(h);
  const ws = game.ws;
  const stones = C.bagCount(h, 'mat_lingshi');
  const jings = C.bagCount(h, 'mat_lingjing');
  const xuans = C.bagCount(h, 'mat_xianyuan');
  const returnTarget = HP.returnTargetWorldForHero(h, ws, ACTIVE_WORLD);
  const nearLoc = game.nearbyLocation();
  const spiritDoms = Object.entries(ws.worlds?.spirit?.spiritDomains ?? {}).filter(([, d]) => d.owner === 'player');
  const rankDone = ws.worlds?.immortal?.immortalRankDone ?? [];
  const xt = hi.xuantian ?? { stage: 0, progress: 0, kind: null };
  const fd = hi.fiveDecays ?? { level: 0, suppressedUntil: 0, progress: 0 };
  const corpses = hi.threeCorpses ?? [false, false, false];
  const bagPages = C.bagCount(h, 'item_canjuan_page');
  const totalPages = (hi.canjuanPages ?? 0) + bagPages;

  const feedback = (res: { ok: boolean; msg: string }) => {
    game.toast(res.msg, res.ok ? 'good' : 'warn');
    audio.sfx(res.ok ? 'chime' : 'fail');
    re();
  };

  return (
    <Panel
      title="上界修行 · 跨界飞升"
      slot="higher"
      onClose={onClose}
      wide
      sub={<span>当前：<b>{WORLDS[ACTIVE_WORLD].name}</b>（{MAP_NAME[ACTIVE_MAP]}） · 灵石 {fmt(stones)} · 灵晶 {jings} · 仙元石 {xuans}</span>}
    >
      <div className="alch-tabs">
        <button className={tab === 'ascend' ? 'on' : ''} onClick={() => setTab('ascend')}>跨界飞升 · 化池</button>
        <button className={tab === 'spirit' ? 'on' : ''} onClick={() => setTab('spirit')}>灵界 · 天劫玄天灵域</button>
        <button className={tab === 'immortal' ? 'on' : ''} onClick={() => setTab('immortal')}>仙界 · 法则仙窍五衰</button>
        <button className={tab === 'rank' ? 'on' : ''} onClick={() => setTab('rank')}>斩仙榜 · 岁月天书</button>
      </div>

      {tab === 'ascend' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {returnTarget && (
            <div className="warn-box" style={{ borderLeft: '3px solid #9e3428', background: 'rgba(158,52,40,0.08)', padding: '6px 10px' }}>
              <b>【逆返下界 · 天道排斥】当前排斥：{Math.round(hi.planeRejection ?? 0)}% / 100%</b>
              <div className="hint" style={{ marginTop: 2 }}>在{WORLDS[ACTIVE_WORLD].name}动用高阶神通杀伐会积蓄天道排斥；打坐养息可缓慢消退，满 100% 将被强行弹回{WORLDS[returnTarget].name}（不死不删档）。</div>
            </div>
          )}

          <div className="sec-title">三界通行</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
            {WORLD_IDS.map((wId: WorldId) => {
              const def = WORLDS[wId];
              const isCur = wId === ACTIVE_WORLD;
              const gate = isCur ? null : canCrossWorld(h, ACTIVE_WORLD, wId, ws, game.day);
              return (
                <div key={wId} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: `1px solid ${isCur ? '#2f6b5e' : 'rgba(90,72,48,0.2)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>{def.name}</b>
                    <small style={{ color: isCur ? '#2f6b5e' : 'var(--ink-soft)' }}>{isCur ? '当前所在' : worldCurrencyName(wId)}</small>
                  </div>
                  <div className="hint" style={{ margin: '4px 0 6px' }}>{def.scale} · 极境 {def.realmCap.label}</div>
                  {!isCur && gate && (
                    <>
                      {gate.direction === 'descend' && gate.returnCost && (
                        <div className="hint" style={{ color: '#9e3428', marginBottom: 4 }}>
                          逆返代价：耗法力 {Math.round(gate.returnCost.mpRatio * 100)}%、折寿 {gate.returnCost.lifeCost} 载、冷却 {gate.returnCost.cooldownDays} 日
                        </div>
                      )}
                      {!gate.ok && <div className="hint" style={{ color: '#9e3428', marginBottom: 4 }}>{gate.reason}</div>}
                      <button className="ink-btn small jade" disabled={!gate.ok} onClick={() => { if (game.crossWorldTo(wId)) onClose(); else re(); }}>
                        {gate.direction === 'ascend' ? `飞升 / 赴往${def.name}` : `逆返${def.name}`}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {ACTIVE_WORLD === 'human' && (
            <>
              <div className="sec-title">飞升灵界 · 双路线</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                {(() => {
                  const c1 = HP.canAscendToSpirit(h, ws, 'orthodox');
                  const c2 = HP.canAscendToSpirit(h, ws, 'smuggle');
                  const hasDing = C.bagCount(h, 'item_dingkongzhu') > 0;
                  return (
                    <>
                      <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(47,107,94,0.08)', border: '1px solid rgba(47,107,94,0.28)' }}>
                        <b>路线一：古飞升台正统飞升</b>
                        <div className="hint" style={{ margin: '4px 0 6px' }}>需修至化神后期圆满。引动天地接引金柱，稳妥飞升灵界·天渊圣域接引古台并获赠起步灵晶与丹药。</div>
                        {!c1.ok && <div className="hint" style={{ color: '#9e3428', marginBottom: 4 }}>{c1.reason}</div>}
                        <button className="ink-btn small jade" disabled={!c1.ok} onClick={() => { if (game.ascendSpirit('orthodox')) onClose(); else re(); }}>引动接引台飞升</button>
                      </div>
                      <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(130,85,40,0.08)', border: '1px solid rgba(130,85,40,0.28)' }}>
                        <b>路线二：空间节点偷渡</b>
                        <div className="hint" style={{ margin: '4px 0 6px' }}>化神初期即可尝试！须持《破界符》×1（{C.bagCount(h, 'tok_pojie')} 枚）。持有《定空珠》可将成功率由 45% 升至 88%（当前：{hasDing ? '已持定空珠' : '未持定空珠'}）。失手仅重伤折寿，不死不删档。</div>
                        {!c2.ok && <div className="hint" style={{ color: '#9e3428', marginBottom: 4 }}>{c2.reason}</div>}
                        <button className="ink-btn small" disabled={!c2.ok} onClick={() => { if (game.ascendSpirit('smuggle')) onClose(); else re(); }}>撕裂节点偷渡</button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          )}

          {ACTIVE_WORLD === 'spirit' && (
            <>
              <div className="sec-title">大乘飞升仙界</div>
              {(() => {
                const ci = HP.canAscendToImmortal(h, ws);
                return (
                  <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(184,128,42,0.08)', border: '1px solid rgba(184,128,42,0.28)' }}>
                    <b>叩响仙门（已渡高阶天劫 {hi.tribulations ?? 0}/2 次）</b>
                    <div className="hint" style={{ margin: '4px 0 6px' }}>修至大乘后期圆满并渡过至少 2 次高阶天劫，即可破开灵界壁障，降临北寒仙域·化仙古池。</div>
                    {!ci.ok && <div className="hint" style={{ color: '#9e3428', marginBottom: 4 }}>{ci.reason}</div>}
                    <button className="ink-btn small jade" disabled={!ci.ok} onClick={() => { if (game.ascendImmortal()) onClose(); else re(); }}>引动飞仙大劫</button>
                  </div>
                );
              })()}
            </>
          )}

          <div className="sec-title">化灵池 / 化仙池 · 货币凝炼保底</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className="ink-btn small" disabled={stones < 5000} onClick={() => feedback(HP.exchangeCurrency(h, 'stone2lingjing', 1))}>5,000 灵石 → 1 灵晶</button>
            <button className="ink-btn small ghost" disabled={stones < 25000} onClick={() => feedback(HP.exchangeCurrency(h, 'stone2lingjing', 5))}>25,000 灵石 → 5 灵晶</button>
            <button className="ink-btn small" disabled={jings < 200} onClick={() => feedback(HP.exchangeCurrency(h, 'lingjing2xianyuan', 1))}>200 灵晶 → 1 仙元石</button>
            <button className="ink-btn small ghost" disabled={jings < 1000} onClick={() => feedback(HP.exchangeCurrency(h, 'lingjing2xianyuan', 5))}>1,000 灵晶 → 5 仙元石</button>
          </div>
        </div>
      )}

      {tab === 'spirit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sec-title">高阶天劫（累计已渡 {hi.tribulations ?? 0} 次{((hi.tribCooldownUntil ?? 0) > game.day) ? ` · 调息余 ${Math.ceil(hi.tribCooldownUntil! - game.day)} 日` : ''}）</div>
          <div className="hint">持有《替劫木偶》×{C.bagCount(h, 'mat_tijie_muou')}（败劫时自动消耗替死护命）。渡过六九重劫或九九灭世大天劫必得《雷海精金》。</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
            {HP.TRIB_TIERS.map((t) => (
              <div key={t.tier} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
                <b>{t.name}</b>
                <div className="hint" style={{ margin: '3px 0 6px' }}>需 {REALMS[t.minRealm]?.name}+ · 阵眼耗 {t.costJing} 灵晶 · 过劫寿元 +{t.lifeGain} / 灵晶 +{t.rewardJing}</div>
                <button
                  className="ink-btn small jade"
                  disabled={h.realm < t.minRealm || (ACTIVE_WORLD !== 'spirit' && ACTIVE_WORLD !== 'immortal') || (hi.tribCooldownUntil ?? 0) > game.day}
                  onClick={() => {
                    const res = HP.triggerTribulation(h, ws, game.day, t.tier);
                    game.flushMsgs(res.msgs);
                    audio.sfx(res.passed ? 'break' : 'fail');
                    re();
                  }}
                >
                  引动{t.name}
                </button>
              </div>
            ))}
          </div>

          <div className="sec-title">玄天之宝 · 三阶孕育</div>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
            <div>
              当前阶段：<b>{['未启（需《玄天混沌残胚》）', '第一阶 · 混沌初孕（耗问道墨露）', '第二阶 · 雷火淬锋（耗雷海精金或太阴寒髓）', '第三阶 · 玄天已成'][xt.stage]}</b>
              {xt.kind && <span> · 胚型：{xt.kind === 'ding' ? '浑天玄鼎' : '玄天斩灵剑'}</span>}
              {xt.stage > 0 && xt.stage < 3 && <span> · 进度 {xt.progress}%</span>}
            </div>
            {xt.stage === 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="hint">择定器胚：</span>
                <button className={'ink-btn small ' + (xtKind === 'sword' ? 'jade' : 'ghost')} onClick={() => setXtKind('sword')}>玄天斩灵剑</button>
                <button className={'ink-btn small ' + (xtKind === 'ding' ? 'jade' : 'ghost')} onClick={() => setXtKind('ding')}>浑天玄鼎</button>
              </div>
            )}
            <div style={{ marginTop: 6 }}>
              <button className="ink-btn small jade" disabled={xt.stage === 3} onClick={() => feedback(HP.nurtureXuantian(h, xtKind))}>
                {xt.stage === 0 ? `启胚孕育（残胚 ×${C.bagCount(h, 'mat_xuantian_pei')}）` : xt.stage === 1 ? `滴入问道墨露（余 ${h.bottle.drops} 滴）` : xt.stage === 2 ? `投入精材淬锋（精金 ${C.bagCount(h, 'mat_leihai_jin')} / 寒髓 ${C.bagCount(h, 'mat_taiyin_sui')}）` : '已然大成'}
              </button>
            </div>
          </div>

          <div className="sec-title">灵界灵域 · 据点与月俸（已掌 {spiritDoms.length} 处）</div>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
            <div className="hint" style={{ marginBottom: 6 }}>
              {ACTIVE_WORLD !== 'spirit'
                ? '须身处灵界城池或宗门附近方能设阵争夺灵域；已掌灵域每三十日自动产供灵晶。'
                : nearLoc
                  ? `当前所在【${nearLoc.name}】，炼虚以上耗 30 灵晶可设镇域灵阵。`
                  : '走近灵界任一城池或宗门据点后，可在此设立镇域灵阵收取月供。'}
            </div>
            {ACTIVE_WORLD === 'spirit' && nearLoc && (
              <button className="ink-btn small jade" style={{ marginBottom: 6 }} onClick={() => feedback(HP.claimSpiritDomain(h, ws, game.day, nearLoc.id))}>
                镇压「{nearLoc.name}」灵域（30 灵晶）
              </button>
            )}
            {spiritDoms.length > 0 && (
              <div className="hint">
                已掌据点：{spiritDoms.map(([id, d]) => `${LOC_BY_ID.get(id)?.name ?? id}（每30日 +${4 + d.level * 3} 灵晶）`).join('、')}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'immortal' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sec-title">大道法则树（持有《大道法则晶丝》×{C.bagCount(h, 'mat_faze_jingsi')}）</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
            {HP.DAO_LAWS.map((law) => {
              const lv = hi.laws?.[law.id] ?? 0;
              return (
                <div key={law.id} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{law.name}</b><span>{lv} / 5 重</span></div>
                  <div className="hint" style={{ margin: '3px 0' }}>{law.desc}</div>
                  <div className="hint" style={{ color: '#2f6b5e', marginBottom: 5 }}>{law.bonusText}</div>
                  <button className="ink-btn small jade" disabled={lv >= 5 || h.realm < 8} onClick={() => feedback(HP.comprehendDaoLaw(h, law.id))}>
                    {lv >= 5 ? '已圆满' : `参悟（需晶丝 ×${lv + 1}）`}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 8 }}>
            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
              <div className="sec-title" style={{ marginTop: 0 }}>周天三十六仙窍（{hi.immortalAcupoints ?? 0} / 36）</div>
              <div className="hint" style={{ marginBottom: 6 }}>真仙以上可耗仙元石逐一贯通仙窍，全面增幅气血、仙元与攻防底蕴。</div>
              <button className="ink-btn small jade" disabled={(hi.immortalAcupoints ?? 0) >= 36 || h.realm < 9} onClick={() => feedback(HP.openImmortalAcupoint(h))}>
                {(hi.immortalAcupoints ?? 0) >= 36 ? '三十六窍圆满' : `冲开第 ${(hi.immortalAcupoints ?? 0) + 1} 仙窍（需 ${3 + Math.floor((hi.immortalAcupoints ?? 0) / 6) * 2} 仙元石）`}
              </button>
            </div>

            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
              <div className="sec-title" style={{ marginTop: 0 }}>天人五衰（第 {fd.level}/5 层 · 衰气 {Math.round(fd.progress)}%）</div>
              <div className="hint" style={{ marginBottom: 6 }}>
                {fd.suppressedUntil > game.day ? `镇衰稳固中（余 ${Math.ceil(fd.suppressedUntil - game.day)} 日）` : '五衰每层削弱全属性 8%，满五层将急剧蚀损寿元。'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="ink-btn small" disabled={C.bagCount(h, 'pill_dingxian_zhenshuai') < 1} onClick={() => feedback(HP.suppressFiveDecays(h, game.day, 'pill'))}>定仙镇衰丹（{C.bagCount(h, 'pill_dingxian_zhenshuai')}）</button>
                <button className="ink-btn small jade" disabled={C.bagCount(h, 'mat_hundun_jingyuan') < 1} onClick={() => feedback(HP.suppressFiveDecays(h, game.day, 'chaos'))}>混沌净源（{C.bagCount(h, 'mat_hundun_jingyuan')}）</button>
              </div>
            </div>
          </div>

          <div className="sec-title">太乙斩三尸 · 身外化身（{corpses.filter(Boolean).length}/3 · 持有《太乙斩尸丹》×{C.bagCount(h, 'pill_jinxian')}）</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['善尸', '恶尸', '执念尸'] as const).map((nm, i) => {
              const idx = i as 0 | 1 | 2;
              const done = corpses[idx];
              return (
                <button key={nm} className={'ink-btn small ' + (done ? 'ghost' : 'jade')} disabled={done || h.realm < 11} onClick={() => feedback(HP.severCorpse(h, idx))}>
                  {done ? `✓ 已斩${nm}` : `斩${nm}（需晶丝×${3 + idx * 2} + 斩尸丹×1）`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'rank' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sec-title">玉皇仙庭 · 斩仙榜（已正法 {rankDone.length}/{HP.IMMORTAL_RANK_LIST.length}）</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
            {HP.IMMORTAL_RANK_LIST.map((t) => {
              const cleared = rankDone.includes(t.id);
              return (
                <div key={t.id} style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: `1px solid ${cleared ? '#2f6b5e' : 'rgba(90,72,48,0.2)'}` }}>
                  <b>{t.name}</b> <small className="hint">{t.title}</small>
                  <div className="hint" style={{ margin: '4px 0 6px' }}>赏赐：仙元石 ×{t.rewardXianyuan}、法则晶丝 ×{t.rewardLaws}{t.pageDrop ? '、《岁月天书原章》×1' : ''}</div>
                  <button className="ink-btn small jade" disabled={cleared || ACTIVE_WORLD !== 'immortal' || h.realm < t.reqRealm} onClick={() => { if (game.summonImmortalRank(t.id)) { audio.sfx('open'); onClose(); } else audio.sfx('fail'); }}>
                    {cleared ? '✓ 已正法' : h.realm < t.reqRealm ? `需${REALMS[t.reqRealm]?.name}` : '赴榜迎战'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="sec-title">问道残卷 · 岁月天书终局（已集 {hi.canjuanPages ?? 0}/7 页{bagPages > 0 ? ` · 袋中尚有 ${bagPages} 页` : ''}）</div>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(90,72,48,0.07)', border: '1px solid rgba(90,72,48,0.2)' }}>
            <div className="hint" style={{ marginBottom: 6 }}>
              仙界《岁月逆流》神通可凭《岁月金露》（{C.bagCount(h, 'mat_suiyue_jinlu')}）或 3 滴问道墨露（{h.bottle.drops}）瞬间回溯伤势、丹毒与闭关疲惫。集齐七页《岁月天书原章》且证道大罗巅峰后，可叩响太初终局。
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="ink-btn small" disabled={h.realm < 9 || (hi.canjuanTimeCooldownUntil ?? 0) > game.day} onClick={() => feedback(HP.canjuanTimeRewind(h, game.day))}>
                {(hi.canjuanTimeCooldownUntil ?? 0) > game.day ? `岁月逆流冷却（${Math.ceil(hi.canjuanTimeCooldownUntil! - game.day)}日）` : '施展《岁月逆流》'}
              </button>
              {bagPages > 0 && (
                <button className="ink-btn small jade" onClick={() => { const res = HP.absorbCanjuanPages(h); game.toast(res.msg ?? '已融合。', 'good'); re(); }}>
                  融合袋中原章（+{bagPages} 页）
                </button>
              )}
            </div>
            {hi.ending ? (
              <div className="warn-box" style={{ marginTop: 8, borderLeft: '3px solid #b8802a' }}>
                <b>【太初终局已证 · {hi.ending === 'transcend' ? '超脱时间长河' : '重入轮回道胎'}】</b>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="ink-btn small jade" disabled={totalPages < 7 || h.realm < 12} onClick={() => feedback(HP.triggerFinalEnding(h, 'transcend'))}>超脱时间长河（大罗 + 7页）</button>
                <button className="ink-btn small" disabled={totalPages < 7 || h.realm < 12} onClick={() => feedback(HP.triggerFinalEnding(h, 'samsara'))}>重入轮回道胎（大罗 + 7页）</button>
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------- 坐化
export function DeathScreen({ game, onExit }: { game: Game; onExit: () => void }) {
  const h = game.hero;
  return (
    <div className="death">
      <div className="death-inner">
        <div className="d-title">坐 化</div>
        <div className="d-sub">苏寒寿元耗尽，于{game.ui.region}坐化，享年 {Math.floor(h.age)} 岁。</div>
        <div className="d-sub">终其一生，修至 <b>{realmName(h.realm, h.stage)}</b>。</div>
        <div className="d-stats">打坐 {Math.round(h.stats.meditateDays)} 日 · 采集 {h.stats.gathered} 次 · 炼丹 {h.stats.alchemy} 炉 · 突破 {h.stats.breaks} 次</div>
        <div className="d-quote">“大道无情，仙途漫漫。”</div>
        <button className="ink-btn" onClick={onExit}>重入轮回</button>
      </div>
    </div>
  );
}
