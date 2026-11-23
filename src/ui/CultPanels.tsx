// 第二步面板：角色 / 背包 / 炼丹 / 闭关 / 存档 / 坐化
import { modx } from '../mod/hooks';
import { LqPanel } from './kit/LqPanel';   // 收官 H1：统一外壳
import { useState } from 'react';
import type { Game, SeclusionReport } from '../world/game';
import { Game as GameCls } from '../world/game';
import * as C from '../world/cultivation';
import { REALMS, realmName, smallBottleneck, MAJOR_BREAKS, levelOf } from '../data/realms';
import { herbValue, itemDef } from '../data/items';
import { RECIPES } from '../data/recipes';
import { talentById } from '../data/skills';
import { audio } from '../world/audio';
import { ItemGlyph } from './ItemIcon';
import { DaoxinSys } from '../world/daoxin';

const TYPE_NAME: Record<string, string> = { pill: '丹药', herb: '灵草', material: '材料', talisman: '符箓', scroll: '功法', artifact: '法宝', misc: '杂物' };
import { TIER_INK as TIER_COLOR, fmtNum as fmt } from './kit/tier';   // 收官 H0：品阶色表与格式化收成一份

/** 收官 H1：旧卷轴外壳换成界面底座（LqPanel = LacquerModal + 旧类名 .modal-mask / .scroll-panel / .cult-panel / .panel-head / .panel-title / .close-btn / .cult-body）；
 *  宽面板挂匾额，窄面板（闭关、存档）用紧凑标题栏；模组插槽仍在内容区末尾 */
function Panel({ title, onClose, children, wide, sub, slot, cls = '' }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; sub?: React.ReactNode; slot?: string; cls?: string }) {
  return <LqPanel title={title} sub={sub} onClose={onClose} wide={wide} compact={!wide} slot={slot} cls={'cult-panel ' + cls}>{children}</LqPanel>;
}

// ---------------------------------------------------------------- 角色
export function CharPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const h = game.hero;
  const st = C.heroStats(h);
  const need = C.need(h);
  const bn = C.bottleneck(h);
  const root = C.rootDef(h), gf = C.gongfaDef(h);
  const pl = game.placeBonus();
  const sb = bn === 'small' ? smallBottleneck(h.realm, h.stage) : null;
  const mb = bn === 'major' ? MAJOR_BREAKS[h.realm] : null;
  const pillId = sb?.item ?? mb?.item ?? '';
  const have = pillId ? C.bagCount(h, pillId) : 0;
  const minPills = mb?.minItems ?? 0;
  const maxPills = sb ? Math.min(have, sb.count * 2) : mb ? Math.min(have, mb.maxItems) : 0;
  const [pills, setPills] = useState(Math.min(maxPills, Math.max(minPills, sb ? sb.count : (mb ? mb.maxItems : 1))));
  const usePills = Math.max(Math.min(minPills, maxPills), Math.min(pills, maxPills));
  const chance = sb ? C.smallChance(h, usePills) : mb ? C.majorChance(h, usePills) : 0;
  const gate = bn === 'major' ? C.checkMajorGate(h, game.ws, game.ui?.explored ?? 0) : null;
  const auxInfo = bn === 'major' ? C.majorAuxBonus(h) : null;
  const medStale = C.isMedStale(h);
  const lifeLeft = C.maxLife(h) - h.age;
  const nextTalent = h.realm >= 5 ? undefined : C.TALENT_LEVELS.find((lv) => lv > levelOf(h.realm, h.stage));

  return (
    <Panel title="苏寒" slot="char" onClose={onClose} wide sub={<span className="realm-badge" style={{ background: REALMS[h.realm].color, fontSize: 14 }}>{realmName(h.realm, h.stage)}</span>}>
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
          <div className="char-big-portrait" style={{ backgroundImage: 'url(./art/hanli.webp)' }} />
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
          <div className="sec-title">修为</div>
          {h.realm >= 5 ? (
            <div className="warn-box" style={{ borderLeft: '3px solid #c9a24a', background: 'rgba(201,162,74,0.12)', padding: '8px 12px', marginBottom: 8 }}>
              <b style={{ color: '#8a5a14' }}>【人界之巅 · 化神初期】</b>
              <div className="hint" style={{ marginTop: 3 }}>人界天地元气稀薄，化神初期已是此界万古以来的最高道果（寿元两千载）。纵横山海、俯瞰众生，待他日破界飞升。</div>
            </div>
          ) : (
            <>
              <div className="exp-line">
                <div className="bar exp big"><div style={{ width: `${Math.min(100, (h.exp / need) * 100)}%` }} /></div>
                <span>{fmt(h.exp)} / {fmt(need)}</span>
              </div>
              <div className="hint">打坐每日 +{C.expPerDay(h, pl.mult).toFixed(1)} 修为（{pl.name}{pl.mult > 1 ? ` ×${pl.mult.toFixed(1)}` : ''}{C.hasDaoHurt(h) ? ' · 道伤×0.6' : ''}{medStale ? ' · 久居闭关滞涩×0.12' : ''}）· 预计 {bn === 'none' ? Math.ceil((need - h.exp) / Math.max(0.1, C.expPerDay(h, pl.mult))) + ' 天' : '已满'}</div>
              {medStale && bn === 'none' && (
                <div className="warn-box" style={{ marginTop: 6, borderLeft: '3px solid #b86a28', background: 'rgba(184,106,40,0.10)', padding: '6px 10px' }}>
                  <b style={{ color: '#9c4e14' }}>【闭关苦修障 · 道心枯寂】</b>
                  <div className="hint" style={{ marginTop: 2 }}>久居洞府闭门苦修，灵力已生郁结！请出关前往大世界斗法斩妖、探寻秘境古迹、完成悬赏或宗门差事，以红尘实战印证所学后方可恢复闭关进境。</div>
                </div>
              )}
            </>
          )}

          {bn !== 'none' && (
            <div className={'break-box ' + bn}>
              <div className="bk-title">{bn === 'major' ? `冲击${h.realm === 4 ? '化神初期（人界极境）' : REALMS[h.realm + 1]?.name}` : `冲击${realmName(h.realm, h.stage + 1)}`}</div>
              <div className="bk-desc">
                {mb ? mb.desc : `小瓶颈：建议服用${itemDef(sb!.item).name} ${sb!.count} 枚辅助冲关。`}
                {mb && `　失败重罚：修为倒退${h.realm >= 4 ? '五成、折寿三十载、道伤六十日' : h.realm === 3 ? '四成半、折寿十二载、道伤四十二日' : h.realm === 2 ? '三成半、折寿六载' : '三成、折寿三载'}！`}
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
          <div className="stat-grid">
            <div><span>气血</span><b>{Math.round(st.hp * h.hp)} / {st.hp}</b></div>
            <div><span>法力</span><b>{Math.round(st.mp * h.mp)} / {st.mp}</b></div>
            <div><span>攻击</span><b>{st.atk}</b></div>
            <div><span>防御</span><b>{st.def}</b></div>
            <div><span>神识</span><b>{st.sense}</b></div>
            <div><span>感知</span><b>{Math.round(game.senseRadius)} 步</b></div>
          </div>

          <div className="sec-title">天赋 <small>{nextTalent ? `下次逆天改命：${realmName(...fromLv(nextTalent))}` : ''}</small></div>
          <div className="talent-list">
            {h.talents.length === 0 && <div className="hint">尚无。炼气四层、七层、十层、十三层及此后每一境界，皆可逆天改命一次。</div>}
            {h.talents.map((id) => { const t = talentById(id); return t && <span key={id} className={'tal tier' + t.tier} title={t.desc}>{t.name}</span>; })}
          </div>
          <div className="sec-title">履历</div>
          <div className="hint">打坐 {Math.round(h.stats.meditateDays)} 日 · 采集 {h.stats.gathered} 次 · 服丹 {h.stats.pills} 枚 · 炼丹 {h.stats.alchemy} 炉 · 突破 {h.stats.breaks} 次 · 失败 {h.stats.failed} 次</div>
          <div className="sec-title">道心 <small>只可上调，不可下调</small></div>
          <div className="hint" style={{ lineHeight: 1.75 }}>
            <b style={{ color: game.daoxin.is('tiandao') ? '#b8443a' : game.daoxin.is('taixu') ? '#c9a24a' : '#5f8a6a', fontSize: 14 }}>「{game.daoxin.tierName()}」</b>
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
export { Inventory as BagPanel } from './Inventory';

// ---------------------------------------------------------------- 炼丹
export function AlchemyPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const [tab, setTab] = useState<'pill' | 'forge'>('pill');
  const list = RECIPES.filter((x) => (x.kind ?? 'pill') === tab);
  const [sel, setSel] = useState(RECIPES[0].id);
  const [log, setLog] = useState<string[]>([]);
  const h = game.hero;
  const fire = game.forgeFire;
  const r = list.find((x) => x.id === sel) ?? list[0];
  const chk = C.checkRecipe(h, r, fire);
  const forge = tab === 'forge';
  return (
    <Panel title={forge ? '器炉' : '丹房'} slot="alchemy" onClose={onClose} wide sub={forge ? (fire ? '此地有地火可借，炼器无碍。妖兽身上的鳞、爪、鳍、角与妖丹皆是炼器之材。' : '此处无地火，只能以自身法力催火——成器率大减。去城镇法器阁或宗门炼器房更稳妥。') : '以灵草炼丹。灵草只看数量，凑齐配方所需株数即可开炉。'}>
      <div className="alch-tabs">
        <button className={tab === 'pill' ? 'on' : ''} onClick={() => { setTab('pill'); setSel(RECIPES[0].id); }}>炼丹</button>
        <button className={tab === 'forge' ? 'on' : ''} onClick={() => { setTab('forge'); setSel(''); }}>炼器{fire ? <i>地火</i> : null}</button>
      </div>
      <div className="alch">
        <div className="recipe-list">
          {list.map((x) => { const ok = C.checkRecipe(h, x, fire).ok; return (
            <button key={x.id} className={'recipe' + (r.id === x.id ? ' on' : '') + (ok ? ' ok' : '')} onClick={() => setSel(x.id)}>
              <span className="glyph">{forge ? '器' : '丹'}</span>{x.name}{ok && <i>{forge ? '可炼' : '可炼'}</i>}
            </button>); })}
        </div>
        <div className="recipe-detail">
          <div className="bd-name">{r.name}<small>　产出 {itemDef(r.out).name} ×{r.outN}　耗时 {r.days} 日{forge ? `　需${['凡人', '炼气', '筑基', '结丹', '元婴'][r.reqRealm]}期` : ''}</small></div>
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
          <button className="ink-btn jade" disabled={!chk.ok} onClick={() => { const res = game.brew(r); setLog((l) => [res.msgs.map((m) => m.text).join(' '), ...l].slice(0, 5)); re(); }}>{forge ? '起 炉 炼 器' : '开 炉'}</button>
          <div className="alch-log">{log.map((l, i) => <div key={i} style={{ opacity: 1 - i * 0.18 }}>{l}</div>)}</div>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- 闭关
export function SecludePanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [rep, setRep] = useState<SeclusionReport | null>(null);
  const h = game.hero;
  const pl = game.placeBonus();
  const rate = C.expPerDay(h, pl.mult);
  const bn = C.bottleneck(h);
  const opts: [string, number][] = [['一月', 30], ['一年', 360], ['十年', 3600], ['三十年', 10800], ['直到瓶颈', 0]];
  return (
    <Panel title="闭关" slot="seclude" onClose={onClose} sub={`${pl.name}${pl.mult > 1 ? ` · 灵气 ×${pl.mult.toFixed(1)}` : ''} · 每日 +${rate.toFixed(1)} 修为`}>
      {!rep ? (
        <>
          <div className="hint" style={{ marginBottom: 10 }}>闭关期间光阴飞逝，年岁随之增长。修为主要靠岁月苦修：筑基要十几二十年，结丹动辄数十年，结婴需百年之功；丹药只能锦上添花，服多了还会积下丹毒。遇到瓶颈、逆天改命机缘、大事将起或寿元将尽时会自动出关。宗门、秘境与灵泉畔修炼更快。</div>
          {C.hasDaoHurt(h) && <div className="warn-box" style={{ marginBottom: 8 }}>经脉受损（道伤余 {Math.ceil(h.daoHurt!.days)} 日）：闭关调息可以 1.8 倍速度平复道伤（约需闭关 {Math.ceil(h.daoHurt!.days / 1.8)} 日痊愈）。</div>}
          {h.realm >= 5 && <div className="warn-box">已臻人界极境「化神初期」，寿元两千载，无须再闭死关。</div>}
          {C.isMedStale(h) && bn === 'none' && <div className="warn-box" style={{ marginBottom: 8 }}>久居闭关不历红尘，道心已生滞涩！须先外出斗法斩敌、探寻秘境古迹或完成宗门悬赏差事印证道心，方可继续闭关精进。</div>}
          {bn !== 'none' && <div className="warn-box">修为已至瓶颈，闭关无益——请先完成红尘历练并在角色面板冲关。</div>}
          <div className="sec-opts">
            {opts.map(([n, d]) => (
              <button key={n} className="sec-opt" disabled={bn !== 'none' || h.realm >= 5 || C.isMedStale(h)} onClick={() => { audio.sfx('whoosh'); setRep(game.seclude(d)); }}>
                <b>{n}</b><small>{d ? `+${fmt(rate * d)} 修为 · 年龄 +${(d / 360).toFixed(d < 360 ? 2 : 0)}` : `约 ${Math.ceil((C.need(h) - h.exp) / Math.max(0.1, rate))} 日`}</small>
              </button>
            ))}
          </div>
          <div className="hint">寿元：{Math.floor(h.age)} / {C.maxLife(h)} 岁</div>
        </>
      ) : (
        <div className="sec-report">
          <div className="sr-title">出 关</div>
          <div className="sr-line">闭关 <b>{rep.days >= 360 ? `${(rep.days / 360).toFixed(1)} 年` : `${Math.round(rep.days)} 日`}</b> · {rep.reason}</div>
          <div className="sr-line">{rep.from === rep.to ? rep.to : <>{rep.from} → <b className="up">{rep.to}</b></>}</div>
          {rep.msgs.slice(-8).map((m, i) => <div key={i} className={'sr-msg ' + (m.kind ?? '')}>{m.text}</div>)}
          <div className="bd-actions"><button className="ink-btn jade" onClick={onClose}>出关</button>{game.hero.pendingTalent && <span className="hint">（打开角色面板选择逆天改命）</span>}</div>
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
    if (!game.save(0)) { game.toast('本地存档失败，先检查浏览器存储权限。', 'warn'); return; }
    const raw = localStorage.getItem('taixu_save_auto') ?? '';
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
            <div className="sl-info">{s.empty ? '—— 空 ——' : <>{s.realm} · {s.age}岁 · 第{s.year}年 · {s.region}<small>{s.time ? new Date(s.time).toLocaleString() : ''}</small></>}</div>
            <div className="sl-btns">
              {s.slot > 0 && <button className="ink-btn" onClick={() => { if (game.save(s.slot)) game.toast(`已存入${s.name}。`, 'good'); audio.sfx('chime'); re(); }}>存</button>}
              {!s.empty && <button className="ink-btn ghost" onClick={() => { if (game.load(s.key)) { game.toast(`已读取${s.name}。`, 'good'); onClose(); } }}>读</button>}
              {!s.empty && s.slot > 0 && <button className="ink-btn ghost" onClick={() => { if (confirm(`删除${s.name}？`)) { GameCls.deleteSlot(s.slot); re(); } }}>删</button>}
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
        <button className="ink-btn small ghost" onClick={() => { if (!game.daoxin.backupAllowed()) { game.toast(game.daoxin.backupRefusal('取'), 'warn'); return; } const code = prompt('粘贴存档码：'); if (!code) return; try { const raw = decodeURIComponent(escape(atob(code.trim()))); JSON.parse(raw); localStorage.setItem('taixu_save_3', raw); if (game.load('taixu_save_3')) { game.toast('导入成功（已写入存档三）。', 'good'); onClose(); } } catch { game.toast('存档码无效。', 'warn'); } }}>导入存档码</button>
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

// ---------------------------------------------------------------- 坐化
export function DeathScreen({ game, onExit }: { game: Game; onExit: () => void }) {
  const h = game.hero;
  return (
    // 收官 H2：坐化——墨色长夜里一轴竖排的「坐化」、一方朱印，下面一张乌木漆底的生平卡；动效只动 transform / opacity
    <div className="death">
      <div className="death-inner">
        <div className="d-title"><span>坐</span><span>化</span><i className="d-seal">{realmName(h.realm, h.stage).slice(0, 2)}</i></div>
        <div className="d-card lq-lacquer">
          <div className="d-sub">苏寒寿元耗尽，于{game.ui.region}坐化，享年 {Math.floor(h.age)} 岁。</div>
          <div className="d-sub">终其一生，修至 <b>{realmName(h.realm, h.stage)}</b>。</div>
          <div className="d-stats"><span>打坐<b>{Math.round(h.stats.meditateDays)}</b>日</span><span>采集<b>{h.stats.gathered}</b>次</span><span>炼丹<b>{h.stats.alchemy}</b>炉</span><span>突破<b>{h.stats.breaks}</b>次</span></div>
        </div>
        <div className="d-quote">“大道无情，仙途漫漫。”</div>
        <button className="ink-btn lq-btn lq-btn-zhu" onClick={onExit}>重入轮回</button>
      </div>
    </div>
  );
}
