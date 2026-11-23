import { bindOf, keyLabel } from '../core/keymap';
// 第三步界面：快捷栏（1–9）与法术书（K）
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { ARTS, ART_LIST, SCHOOL_COLOR, SCHOOL_NAME, TIER_NAME, TIER_COLOR, PROF_NAME, STATUS_NAME, profLevel, profNeed, School } from '../data/arts';
import { itemDef } from '../data/items';
import { REALMS } from '../data/realms';
import { audio } from '../world/audio';
import { ItemGlyph } from './ItemIcon';
import { SKILL_ICON } from '../gfx/skillIconData';
import { ZHEN_BY_ID } from '../data/zhenfa';
import { INS_NEED } from '../world/shentong';
import { LqPanel } from './kit/LqPanel';   // 收官 H1：统一外壳
import { HELD_NOW, meleeArtView } from '../data/weapons';
import { moveOfArt } from '../world/brawlmoves';

/** 近战四式跟着手里的兵器换名字、图标字、说明（空手照原样）；挂进来的特殊招式用它自己的图标字 */
function artView(s: { id: string; name: string; desc: string; cast: string }): { name: string; glyph: string; desc: string } {
  const v = s.cast === 'melee' ? meleeArtView(s.id, HELD_NOW.kind) : null;
  if (v) return v;
  const m = moveOfArt(s.id);
  return { name: s.name, glyph: m?.glyph ?? s.name[0], desc: s.desc };
}

export function slotInfo(id: string | null | undefined): { glyph: string; name: string; color: string; tier: number } | null {
  if (!id) return null;
  if (id.startsWith('art:')) { const d = itemDef(id.slice(4)); return { glyph: d.glyph, name: d.name, color: '#b8802a', tier: d.tier }; }
  if (id.startsWith('tal:')) { const d = itemDef(id.slice(4)); return { glyph: d.name[0], name: d.name, color: d.tal?.color ?? '#c0a050', tier: d.tier }; }
  if (id.startsWith('pill:')) { const d = itemDef(id.slice(5)); return { glyph: d.glyph, name: d.name, color: '#5aa08e', tier: d.tier }; }   // 收官 C：快捷栏丹药
  if (id.startsWith('zf:')) { const z = ZHEN_BY_ID[id.slice(3)]; return z ? { glyph: '阵', name: z.name, color: `rgb(${z.color})`, tier: 2 } : null; }
  const s = ARTS[id];
  if (!s) return null;
  const v = artView(s);
  return { glyph: v.glyph, name: v.name, color: SCHOOL_COLOR[s.school], tier: s.tier };
}

export function talCount(game: Game, id: string) { let n = 0; for (const b of game.hero.bag) if (b.id === id) n += b.n; return n; }

/** 快捷栏：PC 底部一排九格；触屏右下 3×3 法诀盘 */
export function Hotbar({ game, touch }: { game: Game; touch: boolean }) {
  const cdRefs = useRef<(HTMLDivElement | null)[]>([]);
  const txtRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0, sig = '';
    const loop = () => {
      const h = game.hero;
      const s = h.hotbar.join('|') + h.arts.length + HELD_NOW.kind + (game.senseBurstT > 0 ? 'W' : '') + (game.concealed ? 'C' : '') + h.hotbar.map((id) => id?.startsWith('tal:') ? talCount(game, id.slice(4)) : id?.startsWith('pill:') ? talCount(game, id.slice(5)) : '').join(',');
      if (s !== sig) { sig = s; force((x) => x + 1); }
      h.hotbar.forEach((id, i) => {
        const el = cdRefs.current[i], tx = txtRefs.current[i];
        if (!el || !id) return;
        const key = id.startsWith('art:') ? id : id;
        const f = game.combat.cdFrac(key), left = game.combat.cdLeft(key);
        el.style.transform = `scaleY(${f.toFixed(3)})`;   // 收官 H3：冷却遮罩改 scaleY（原来每帧改 height）
        if (tx) tx.textContent = left > 0.05 ? (left >= 10 ? Math.ceil(left) + '' : left.toFixed(1)) : '';
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  const h = game.hero;
  return (
    <div className={'hotbar' + (touch ? ' pad' : '')}>
      {h.hotbar.map((id, i) => {
        const inf = slotInfo(id);
        const equipped = (id?.startsWith('art:') && Object.values(h.equip ?? {}).includes(id.slice(4))) || (id === 'waifang' && game.senseBurstT > 0) || (id === 'lianxi' && game.concealed);
        const pillN = id?.startsWith('pill:') ? talCount(game, id.slice(5)) : -1;   // 收官 C：丹药条目，数量为 0 时格子变灰
        return (
          <button key={i} className={'hb-slot' + (inf ? '' : ' empty') + (equipped ? ' equipped' : '') + (pillN === 0 ? ' dry' : '')}
            title={inf ? `${inf.name}（${keyLabel(bindOf('slot' + (i + 1)))}）` : `空（按 ${keyLabel(bindOf('skills'))} 放置法术）`}
            onPointerDown={(e) => { e.stopPropagation(); audio.unlock(); if (inf) game.combat.castSlot(i); else game.onPanel?.('skills', true); }}
            style={inf ? { ['--sc' as any]: inf.color } : undefined}>
            {inf && id!.startsWith('pill:') ? <ItemGlyph id={id!.slice(5)} className="hb-glyph" /> : inf && (id!.startsWith('art:') || id!.startsWith('tal:')) ? <ItemGlyph id={id!.slice(4)} className="hb-glyph" /> : inf && SKILL_ICON[id!] ? <img className="hb-glyph art-ico sk-ico" src={SKILL_ICON[id!]} alt="" draggable={false} /> : inf && <span className="hb-glyph">{inf.glyph}</span>}
            {inf && !touch && <span className="hb-name">{inf.name}</span>}
            {id?.startsWith('tal:') && <span className="hb-count">{talCount(game, id.slice(4))}</span>}
            {pillN >= 0 && <span className="hb-count">{pillN}</span>}
            <div className="hb-cd" ref={(el) => { cdRefs.current[i] = el; }} />
            <span className="hb-cdt" ref={(el) => { txtRefs.current[i] = el; }} />
            {!touch && <span className="hb-key">{keyLabel(bindOf('slot' + (i + 1)))}</span>}
          </button>
        );
      })}
    </div>
  );
}

const SCHOOLS: School[] = ['神', '火', '冰', '雷', '风', '土', '木', '剑', '体', '御', '魔', '识', '阵', '身', '符'];
const CAST_NAME: Record<string, string> = { bolt: '弹道', fan: '扇射', nova: '周身爆发', burst: '落点爆发', cone: '前方锥形', beam: '光柱', strike: '天降', chain: '连锁', field: '持续区域', orbit: '环身', dash: '冲刺', blink: '瞬移', buff: '增益', shield: '护盾', heal: '疗伤', summon: '召唤', sense: '神识', melee: '近战' };   // 收官 H1：近战四式（cast: 'melee'）补中文类型名

/** 法术书：已习得法术、熟练度、放入快捷栏 */
export function SkillPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const [, force] = useState(0);
  const re = () => force((x) => x + 1);
  const h = game.hero;
  const [tab, setTab] = useState<'arts' | 'items' | 'cj'>('arts');
  const [school, setSchool] = useState<School | 'all'>('all');
  const [sel, setSel] = useState<string>(h.arts[0]?.id ?? '');
  const learned = new Set(h.arts.map((a) => a.id));
  const list = h.arts.map((a) => ({ a, s: ARTS[a.id] })).filter((x) => x.s && (school === 'all' || x.s.school === school)).sort((x, y) => x.s.tier - y.s.tier || x.s.realm - y.s.realm);
  const arts = [...new Set(h.bag.filter((b) => itemDef(b.id).art).map((b) => b.id))];
  const tals = [...new Set(h.bag.filter((b) => { const t = itemDef(b.id).tal; return t && t.kind !== 'revive'; }).map((b) => b.id))];
  const selKey = sel;
  const assign = (i: number) => {
    if (!selKey) return;
    const j = h.hotbar.indexOf(selKey);
    if (j >= 0) h.hotbar[j] = h.hotbar[i];
    h.hotbar[i] = selKey;
    audio.sfx('click'); re();
  };
  const clear = (i: number) => { h.hotbar[i] = null; audio.sfx('click'); re(); };
  const s = ARTS[sel];
  const a = h.arts.find((x) => x.id === sel);
  const lv = s && a ? profLevel(s.tier, a.xp) : 0;
  const need = s ? profNeed(s.tier) : [0];
  const it = sel.startsWith('art:') || sel.startsWith('tal:') ? itemDef(sel.slice(4)) : null;
  const niHints = game.combat.ni.hints();   // 「遁影惊雷」：逆天四法的悟法与进度
  return (
    <LqPanel title="法术书" sub={<>已习得 <b>{learned.size}</b> / {ART_LIST.length} 门 · 斩妖 {h.kills ?? 0}</>} onClose={onClose} wide cls="cult-panel skill-panel" bare>
        <div className="cult-body">
          <details className="ni-hints" style={{ margin: '0 0 8px', padding: '6px 10px', border: '1px solid rgba(192,138,26,.45)', borderRadius: 6, background: 'rgba(192,138,26,.08)', fontSize: 13, lineHeight: 1.75 }}>
            <summary style={{ cursor: 'pointer', color: '#a8760f', fontWeight: 700 }}>逆天机缘 · 已悟 {niHints.filter((x) => x.got).length} / 4　<small style={{ fontWeight: 400, opacity: 0.8 }}>四门逆天之法不卖、不掉，只能自悟；点开看悟法</small></summary>
            {niHints.map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', opacity: x.got ? 0.7 : 1 }}>
                <b style={{ minWidth: 112, color: x.got ? '#4f8f4a' : '#8a4fb0' }}>{x.got ? '✓ ' : ''}《{x.name}》</b>
                <span style={{ flex: 1 }}>{x.got ? '已悟。' : x.tip}</span>
                {!x.got && <span style={{ width: 72, height: 6, borderRadius: 3, background: 'rgba(0,0,0,.16)', overflow: 'hidden', flex: 'none' }}><i style={{ display: 'block', height: '100%', width: Math.round(x.k * 100) + '%', background: '#c08a1a' }} /></span>}
              </div>
            ))}
          </details>
          <div className="tabs">
            <button className={tab === 'arts' ? 'on' : ''} onClick={() => setTab('arts')}>法术神通</button>
            <button className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>法宝法器</button>
            {game.canjuan?.owned && <button className={tab === 'cj' ? 'on' : ''} onClick={() => setTab('cj')}>问道残卷</button>}
            {tab === 'arts' && <span className="school-filter">
              <button className={school === 'all' ? 'on' : ''} onClick={() => setSchool('all')}>全</button>
              {SCHOOLS.filter((x) => h.arts.some((a) => ARTS[a.id]?.school === x)).map((x) => <button key={x} className={school === x ? 'on' : ''} style={{ color: SCHOOL_COLOR[x] }} onClick={() => setSchool(x)}>{x}</button>)}
            </span>}
          </div>
          <div className="bag-wrap">
            <div className="skill-list">
              {tab === 'arts' && list.map(({ a, s }) => {
                const l = profLevel(s.tier, a.xp);
                return (
                  <button key={s.id} className={'skill-row' + (sel === s.id ? ' on' : '')} onClick={() => { setSel(s.id); audio.sfx('click'); }}>
                    {SKILL_ICON[s.id] ? <img className="sk-glyph art-ico sk-ico" src={SKILL_ICON[s.id]} alt="" draggable={false} style={{ ['--sc' as any]: SCHOOL_COLOR[s.school] }} /> : <span className="sk-glyph" style={{ background: SCHOOL_COLOR[s.school] }}>{artView(s).glyph}</span>}
                    <span className="sk-name">{artView(s).name}<small style={{ color: TIER_COLOR[s.tier] }}>{TIER_NAME[s.tier]}</small></span>
                    <span className={'sk-prof p' + l}>{PROF_NAME[l]}</span>
                    {h.hotbar.includes(s.id) && <span className="sk-slot">{h.hotbar.indexOf(s.id) + 1}</span>}
                  </button>
                );
              })}
              {tab === 'items' && arts.map((id) => {
                const d = itemDef(id), key = 'art:' + id;
                return (
                  <button key={id} className={'skill-row' + (sel === key ? ' on' : '')} onClick={() => { setSel(key); audio.sfx('click'); }}>
                    <ItemGlyph id={id} className="sk-glyph" style={{ background: '#8a6a30' }} />
                    <span className="sk-name">{d.name}<small>{['凡器', '法器', '上品法器', '顶阶法器', '法宝', '古宝', '通天灵宝'][d.tier] ?? ''}</small></span>
                    {Object.values(h.equip ?? {}).includes(id) && <span className="sk-prof p2">已祭出</span>}
                    {h.hotbar.includes(key) && <span className="sk-slot">{h.hotbar.indexOf(key) + 1}</span>}
                  </button>
                );
              })}
              {tab === 'items' && tals.map((id) => {
                const d = itemDef(id), key = 'tal:' + id;
                return (
                  <button key={id} className={'skill-row' + (sel === key ? ' on' : '')} onClick={() => { setSel(key); audio.sfx('click'); }}>
                    <ItemGlyph id={d.id} className="sk-glyph" style={{ background: d.tal?.color ?? '#a08040' }} />
                    <span className="sk-name">{d.name}<small>符箓 ×{talCount(game, id)}</small></span>
                    {h.hotbar.includes(key) && <span className="sk-slot">{h.hotbar.indexOf(key) + 1}</span>}
                  </button>
                );
              })}
              {tab === 'cj' && (() => {
                const L = game.canjuan.list();
                return <>
                  <div className="hint" style={{ marginBottom: 6, lineHeight: 1.7 }}>与人斗法时，对方施展的功法会印进残卷：看见 +1、挨上 +2、躲开 +3。黄阶 6 · 玄阶 15 · 地阶 35 · 天阶 80 点学会；三成起可先用（残篇，威力五折）。同一人身上最多学到四成；境界不到威力打折，天阶神通到元婴才完全发挥。</div>
                  {L.length === 0 && <div className="hint">残卷上还是一片空白。去和各派修士、散修斗上几场吧。</div>}
                  {L.map((x) => (
                    <button key={x.sid} className={'skill-row' + (sel === x.id ? ' on' : '')} disabled={x.prog < 0.3} onClick={() => { if (x.prog >= 0.3) { setSel(x.id); audio.sfx('click'); } }}>
                      <span className="sk-glyph" style={{ background: TIER_COLOR[x.tier] }}>{x.got ? '全' : x.prog >= 0.3 ? '残' : '影'}</span>
                      <span className="sk-name">{x.name}<small style={{ color: TIER_COLOR[x.tier] }}>{TIER_NAME[x.tier]} · {x.sect}</small></span>
                      <span className="cj-bar"><i style={{ width: `${Math.round(x.prog * 100)}%`, background: TIER_COLOR[x.tier] }} /></span>
                      <span className={'sk-prof p' + (x.got ? 3 : x.prog >= 0.3 ? 1 : 0)}>{x.got ? '全篇' : `${Math.floor(x.v)}/${x.need}`}</span>
                    </button>
                  ))}
                </>;
              })()}
              {tab === 'items' && arts.length === 0 && tals.length === 0 && <div className="hint">储物袋中尚无法器。斩杀妖兽、探索洞府遗迹可得。</div>}
              {tab === 'arts' && <div className="hint" style={{ marginTop: 8 }}>尚有 {ART_LIST.length - learned.size} 门法术散落天下：妖兽、魔修掉落，洞府遗迹，日后坊市、宗门藏经阁亦可求得。</div>}
            </div>
            <div className="bag-detail">
              {s && a && (
                <>
                  <div className="bd-name" style={{ color: SCHOOL_COLOR[s.school] }}>{artView(s).name}<small>　{SCHOOL_NAME[s.school]} · {TIER_NAME[s.tier]}</small></div>
                  <div className="bd-type">{CAST_NAME[s.cast]} · 需{REALMS[s.realm].name}期 · 法力 {Math.round(s.mp * 100)}%{s.hpCost ? ` · 气血 ${Math.round(s.hpCost * 100)}%` : ''} · 冷却 {s.cd}s{s.power > 0 ? ` · 威力 ×${s.power}` : ''}{s.status ? ` · ${STATUS_NAME[s.status.k]}` : ''}</div>
                  <div className="bd-desc">{artView(s).desc}</div>
                  {s.cast === 'melee' && HELD_NOW.kind !== 'fist' && <div className="hint">招式跟着手里的兵器走；卸下兵器就是拳脚的{s.name}。</div>}
                  {s.needs && <div className="hint">需持有 {itemDef(s.needs).name}{C_has(game, s.needs) ? '（已有）' : '（未得）'}</div>}
                  {s.id.startsWith('hx_') && <div className="hx-prog">
                    <div className="hint">观兽悟形：斩杀相应妖兽可参悟其余六形（妖兽境界越高、妖王，悟得越多；元婴之后各形体形放大、威力再增并多一段后招）</div>
                    {game.shentong.progress().map((f) => <div key={f.id} className={'hx-row' + (f.have ? ' on' : '')}>
                      <b>{f.name}</b><small>{f.blurb}</small>
                      <span className="hx-bar"><i style={{ width: `${Math.round(f.p * 100)}%` }} /></span>
                      <em>{f.have ? '已悟' : `${Math.round(f.p * INS_NEED)}/${INS_NEED}`}</em>
                    </div>)}
                  </div>}
                  {s.id === 'yuanying' && <div className="hint">{game.yuanying.active ? `元婴在外：还剩 ${Math.ceil(game.yuanying.t)} 息，肉身护光 ${Math.round((game.yuanying.body?.shield ?? 0) / Math.max(0.01, game.yuanying.body?.max ?? 1) * 100)}%。` : '出窍后再按一次归窍。肉身毫无还手之力，敌人会专找它下手。'}</div>}
                  <div className="prof-track">
                    {PROF_NAME.map((n, i) => <div key={i} className={'pt' + (i <= lv ? ' on' : '')}><b>{n}</b><span>{i === 0 ? '入门' : s.evo[i - 1]}</span></div>)}
                  </div>
                  <div className="prof-bar"><i style={{ width: `${lv >= 3 ? 100 : Math.min(100, ((a.xp - need[lv]) / (need[lv + 1] - need[lv])) * 100)}%` }} /><span>{lv >= 3 ? '已臻圆满' : `施展 ${a.xp} / ${need[lv + 1]} 次可至${PROF_NAME[lv + 1]}`}</span></div>
                </>
              )}
              {it && it.art && (
                <>
                  <div className="bd-name" style={{ color: '#8a6a30' }}>{it.name}</div>
                  <div className="bd-desc">{it.desc}</div>
                  <div className="bd-type">驱使法力 {it.art.mp} · 冷却 {it.art.cd}s{it.art.power ? ` · 威力 ×${it.art.power}` : ''}</div>
                  {(['armor', 'shield', 'flight', 'wings', 'boots'] as string[]).includes(it.art.kind) && <button className="ink-btn jade" onClick={() => { game.combat.castArtifact(sel.slice(4)); re(); }}>{Object.values(h.equip ?? {}).includes(sel.slice(4)) ? '收起' : '祭出护身'}</button>}
                </>
              )}
              {it && it.tal && (
                <>
                  <div className="bd-name" style={{ color: it.tal.color }}>{it.name}<small>　符箓 · 持有 {talCount(game, it.id)}</small></div>
                  <div className="bd-desc">{it.desc}</div>
                  <div className="bd-type">一次性消耗 · 符箓之力对高境界敌人衰减较少（越一大境界仍有三成）</div>
                </>
              )}
              {sel && <>
                <div className="hint" style={{ marginTop: 10 }}>点击下方格子放入快捷栏（默认：1–5 数字键、第 6 格鼠标左键、第 7 格鼠标右键、第 8/9 格 X / V；可在设置里改键）：</div>
                <div className="hb-assign">
                  {h.hotbar.map((id, i) => {
                    const inf = slotInfo(id);
                    return (
                      <div key={i} className={'hba' + (id === selKey ? ' cur' : '')}>
                        <button onClick={() => assign(i)} style={inf ? { borderColor: inf.color } : undefined}>
                          <b>{i + 1}</b><span style={{ color: inf?.color }}>{inf ? inf.name : '空'}</span>
                        </button>
                        {id && <i onClick={() => clear(i)}>×</i>}
                      </div>
                    );
                  })}
                </div>
              </>}
            </div>
          </div>
        </div>
    </LqPanel>
  );
}
function C_has(game: Game, id: string) { return game.hero.bag.some((b) => b.id === id); }
