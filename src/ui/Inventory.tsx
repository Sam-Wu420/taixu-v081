// 收官 C（甲）：储物袋（照 DNF 装备栏的结构重做，替换 CultPanels 里原来的 BagPanel）。
//   上半：洞府夜景做底，人物居中（衣橱的 LookPreview，可拖动转身；穿上装备时摆个架势），左右各五个装备槽，下面一排快捷栏副本（面板开着时真快捷栏被遮住）；
//   下半：页签（装备、丹药、材料、功法符箓、杂物）+ 8 列格子（窄屏 6 列）；底栏是灵石、问道残卷、搜索、整理。
//   悬停出详情卡（装备类列出和身上那件的对比）；点一下选中，底部出操作条（使用、服用、穿脱、放入快捷栏……原 BagPanel 的操作全保留）。
//   拖拽（dnd.ts）：格子间换位、拖到装备槽穿上、拖回格子卸下、拖到快捷栏副本放入、拖出面板丢弃（要确认）；双击或右键快捷穿戴 / 使用。
// 模组契约：面板 id 仍是 bag，<ModSlot id="bag"> 仍在面板里；旧类名 .modal-mask / .scroll-panel / .panel-head / .close-btn / .tabs / .slot / .slot.on / .ink-btn 仍挂着。
// 动效只动 transform / opacity。
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Game } from '../world/game';
import * as C from '../world/cultivation';
import { itemDef, herbValue, type ItemDef } from '../data/items';
import { SLOT_LEFT, SLOT_RIGHT, SLOT_NAME, SETS, STAT_NAME, statText, BOND_MUL, SLOT_WEAPON, type EquipSlot, type WearSlot, type GearStat } from '../data/gear';
import { WEAPONS } from '../data/weapons';
import { heroWeaponLook, lookWithWeapon } from '../world/arms';
import { realmName } from '../data/realms';
import { modx } from '../mod/hooks';
import { audio } from '../world/audio';
import { PET_KINDS } from '../world/pets';
import { LookPreview } from './Wardrobe';
import { ModSlot } from './ModUi';
import { ItemGlyph } from './ItemIcon';
import { slotInfo, talCount } from './CombatUI';
import { SKILL_ICON } from '../gfx/skillIconData';
import { LacquerModal, InkTabs, ItemCell, TierPill, Stone, InkToast, useInkToast, FloatCard, btnCls, tierColor } from './kit';
import { Dnd, type DragSrc } from './dnd';
import sceneUrl from '../assets/kit/inv_scene.webp';
import './inventory.css';

const TABS: { k: C.BagTab; label: string }[] = [{ k: 'gear', label: '装备' }, { k: 'pill', label: '丹药' }, { k: 'mat', label: '材料' }, { k: 'scroll', label: '功法符箓' }, { k: 'misc', label: '杂物' }];
const TYPE_NAME: Record<string, string> = { pill: '丹药', herb: '灵草', material: '材料', talisman: '符箓', scroll: '功法', artifact: '法宝', misc: '杂物', gear: '装备' };
const GEAR_SLOT_SET = new Set<string>(['crown', 'belt', 'wrist', 'ring', 'pendant', 'weapon']);   // 穿 gear 的槽（兵器槽也走 wearGear）
const click = () => audio.sfx('click');

/** 版面：电脑宽屏、手机竖屏（窄）、手机横屏（矮） */
function useLayout() {
  const get = () => { const w = typeof window === 'undefined' ? 1600 : window.innerWidth, hh = typeof window === 'undefined' ? 900 : window.innerHeight; return hh <= 520 ? 'land' : w <= 760 ? 'tall' : 'wide'; };
  const [m, setM] = useState<'wide' | 'tall' | 'land'>(get);
  useEffect(() => { const f = () => setM(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return m;
}

/** 一件东西的总属性（装备：基础 + 词条） */
function gearTotal(b: C.BagItem | undefined): Partial<Record<GearStat, number>> {
  const out: Partial<Record<GearStat, number>> = {};
  if (!b) return out;
  const g = itemDef(b.id).gear;
  if (g) for (const [k, v] of Object.entries(g.base) as [GearStat, number][]) out[k] = (out[k] ?? 0) + v;
  for (const a of b.affix ?? []) out[a.k] = (out[a.k] ?? 0) + a.v;
  return out;
}
/** 法宝对比用的几个数 */
function artNums(d: ItemDef): [string, number][] {
  const a = d.art; if (!a) return [];
  if (a.kind === 'armor') return [['防御', a.def ?? 0]];
  if (a.kind === 'shield') return [['护盾', a.absorb ?? 0]];
  if (a.kind === 'flight' || a.kind === 'wings' || a.kind === 'boots') return [['速度', (a.mapSpeed ?? 1) - 1]];
  return [['威力', a.power]];
}
const pct = (v: number) => (v * 100).toFixed(Math.abs(v * 100) < 10 ? 1 : 0).replace(/\.0$/, '') + '%';

/** 详情卡：名字、品阶、描述、词条、套装进度；装备类列出和身上那件的对比 */
export function ItemCard({ game, b, id }: { game: Game; b?: C.BagItem; id: string }) {
  const h = game.hero, d = itemDef(id);
  const fakeKnown = !!(b?.fake && b.ident);
  const slot = C.slotOf(id);
  const worn = slot ? C.wornIn(h, slot) : undefined;
  const isWorn = !!b && (b.worn || (worn === b && !GEAR_SLOT_SET.has(slot!)));
  const cmp: ReactNode[] = [];
  if (slot && worn && !isWorn) {
    if (d.gear) {
      const mine = gearTotal(b), other = gearTotal(worn);
      for (const k of new Set([...Object.keys(mine), ...Object.keys(other)]) as Set<GearStat>) {
        const dv = (mine[k] ?? 0) - (other[k] ?? 0); if (Math.abs(dv) < 1e-4) continue;
        cmp.push(<div key={k} className={'inv-cmp ' + (dv > 0 ? 'up' : 'down')}>{STAT_NAME[k]} <b>{dv > 0 ? '▲' : '▼'} {pct(Math.abs(dv))}</b></div>);
      }
    } else if (d.art) {
      const a = artNums(d), o = artNums(itemDef(worn.id));
      a.forEach(([n, v], i) => { const dv = v - (o[i]?.[1] ?? 0); if (Math.abs(dv) > 1e-4) cmp.push(<div key={n} className={'inv-cmp ' + (dv > 0 ? 'up' : 'down')}>{n} <b>{dv > 0 ? '▲' : '▼'} {n === '威力' ? Math.abs(dv).toFixed(1) : pct(Math.abs(dv))}</b></div>); });
    }
  }
  const prog = C.setProgress(h);
  const set = d.gear?.set ? SETS[d.gear.set] : null;
  return (
    <div className="inv-card-in">
      <div className="inv-card-top">
        <ItemGlyph id={id} className="inv-card-ico" style={{ color: tierColor(d.tier, 'lacquer') }} px={96} />
        <div>
          <div className="inv-card-name" style={{ color: fakeKnown ? '#e0604a' : tierColor(d.tier, 'lacquer') }}>{fakeKnown ? `【伪】假${d.name}` : d.name}</div>
          <div className="inv-card-tags"><TierPill t={d.tier} /><span>{slot ? SLOT_NAME[slot] : TYPE_NAME[d.type]}</span>{b && b.n > 1 && <span>持有 {b.n}</span>}{b?.age ? <span>{b.age} 年药龄</span> : null}{isWorn && <span className="on">已穿</span>}{h.equip.bond === id && <span className="on">本命</span>}{b?.ident && !b.fake && <span className="ok">已验真品</span>}</div>
        </div>
      </div>
      <p className="inv-card-desc">{fakeKnown ? (b!.fake === 'broken' ? `后半篇错漏百出的残缺伪简，强练必伤经脉！（可找卖假货的${b!.sellerName ?? '摊贩'}算账，或直接销毁）` : `外层用灵草汁染出宝光，内里却是廉价淬体丸！（可找卖假货的${b!.sellerName ?? '摊贩'}算账）`) : d.desc}</p>
      {d.gear?.weapon && d.gear.weapon !== 'fist' && <div className="inv-card-sec dim inv-wpn-info">{WEAPONS[d.gear.weapon].name} · {WEAPONS[d.gear.weapon].hands === 2 ? '双手' : '单手'}　{WEAPONS[d.gear.weapon].desc}</div>}
      {d.gear && <div className="inv-card-sec">
        {(Object.entries(d.gear.base) as [GearStat, number][]).map(([k, v]) => <div key={k} className="inv-stat">{statText(k, v)}</div>)}
        {(b?.affix ?? []).map((a, i) => <div key={i} className="inv-stat aff">◆ {statText(a.k, a.v)}</div>)}
      </div>}
      {d.art && <div className="inv-card-sec dim">{d.art.power ? `威力 ×${d.art.power} · ` : ''}{d.art.mp ? `法力 ${d.art.mp} · ` : ''}{d.art.cd ? `冷却 ${d.art.cd}s · ` : ''}需{['凡人', '炼气', '筑基', '结丹', '元婴', '化神'][d.art.reqRealm] ?? ''}期{slot === 'bond' ? `　·　结为本命：伤害 ×${BOND_MUL}` : ''}{slot === 'bond' && d.art.kind === 'sword' ? '；兵器槽空着时可握在手里当剑使' : ''}</div>}
      {set && <div className="inv-card-sec set">
        <div className="inv-set-t">【{set.name}】套装 {prog[set.id] ?? 0} / {set.pieces.length}</div>
        <div className="inv-set-pcs">{set.pieces.map((p) => <span key={p} className={h.bag.some((x) => x.id === p && x.worn) ? 'on' : h.bag.some((x) => x.id === p) ? 'have' : ''}>{itemDef(p).name}</span>)}</div>
        {set.bonus.map((x) => <div key={x.n} className={'inv-set-b' + ((prog[set.id] ?? 0) >= x.n ? ' on' : '')}>{x.n} 件：{x.text}</div>)}
      </div>}
      {d.type === 'herb' && <div className="inv-card-sec dim">药龄越高炼丹越稳、卖价越高。按寻常行情约值 <b>{Math.round(herbValue(d, b?.age ?? 0) * 0.5)}</b> 灵石。</div>}
      {cmp.length > 0 && <div className="inv-card-sec cmp"><div className="inv-cmp-t">比身上的「{itemDef(worn!.id).name}」</div>{cmp}</div>}
      {slot && worn && !isWorn && cmp.length === 0 && d.gear && <div className="inv-card-sec dim">和身上那件不相上下。</div>}
      {d.price > 0 && <div className="inv-card-price"><Stone n={Math.round(d.price * 0.5)} sm />　寻常收价</div>}
    </div>
  );
}

export function Inventory({ game, onClose }: { game: Game; onClose: () => void }) {
  const h = game.hero;
  const mode = useLayout();
  const [, force] = useState(0); const re = () => force((x) => x + 1);
  const [tab, setTab] = useState<C.BagTab>('gear');
  const [sel, setSel] = useState<C.BagItem | null>(null);
  const [selSlot, setSelSlot] = useState<EquipSlot | null>(null);
  const [hover, setHover] = useState<{ b?: C.BagItem; id: string; box: { x: number; y: number; w: number; h: number } } | null>(null);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<C.BagItem | null>(null);
  const [fx, setFx] = useState<{ slot: EquipSlot; n: number } | null>(null);
  const [pose, setPose] = useState<'idle' | 'cast'>('idle');
  const [shake, setShake] = useState<{ key: string; n: number } | null>(null);
  const [info, setInfo] = useState(false);
  const [dragKey, setDragKey] = useState('');   // 正被拖着的那一格（拿起时原位变淡）
  const [msg, say] = useInkToast(2400);
  const poseT = useRef(0);
  C.ensureBagPos(h);   // 模组、旧代码直接 push 进袋的东西补上格子

  // 袋里东西变了（掉落、模组给物品）就重画
  useEffect(() => {
    let sig = '';
    const iv = window.setInterval(() => { const s = h.bag.length + ':' + h.bag.reduce((a, b) => a + b.n, 0) + ':' + Object.values(h.equip).join(','); if (s !== sig) { if (sig) re(); sig = s; } }, 400);
    return () => window.clearInterval(iv);
  }, [h]);
  useEffect(() => () => window.clearTimeout(poseT.current), []);

  // —— 操作
  const flash = (slot: EquipSlot) => {
    setFx({ slot, n: Date.now() }); setPose('cast');
    window.clearTimeout(poseT.current); poseT.current = window.setTimeout(() => setPose('idle'), 1300);
  };
  const reject = (key: string, why?: string) => { setShake({ key, n: Date.now() }); audio.sfx('fail'); if (why) say(why); };
  const equip = (b: C.BagItem): boolean => {
    const slot = C.slotOf(b.id); if (!slot) return false;
    if (GEAR_SLOT_SET.has(slot)) { const r = C.wearGear(h, b); if (!r.ok) return false; audio.sfx('chime'); }
    else if (slot === 'bond') { if (!C.bindBond(h, b.id)) return false; audio.sfx('chime'); if (!h.equip.bond) { say(`${itemDef(b.id).name}不再是本命法宝`); re(); return true; } say(`${itemDef(b.id).name}结为本命法宝：伤害 ×${BOND_MUL}`); }
    else { if ((h.equip as Record<string, string | undefined>)[slot] === b.id) return true; game.combat.castArtifact(b.id); if ((h.equip as Record<string, string | undefined>)[slot] !== b.id) return false; }
    flash(slot); game.updateUI(true); re(); return true;
  };
  const unequip = (slot: EquipSlot, pos?: number) => {
    if (GEAR_SLOT_SET.has(slot)) { const b = C.unwearGear(h, slot as WearSlot, pos); if (b && tab !== 'gear') setTab('gear'); }
    else if (slot === 'bond') C.bindBond(h, undefined);
    else { const id = (h.equip as Record<string, string | undefined>)[slot]; if (id) game.combat.castArtifact(id); }
    audio.sfx('land'); game.updateUI(true); re();
  };
  const hbKey = (d: ItemDef): string | null => d.art ? 'art:' + d.id : d.type === 'talisman' && d.tal && d.tal.kind !== 'revive' ? 'tal:' + d.id : ((d.pill || d.id === 'herb_yangshen') && d.type !== 'material') || game.jueyu.usable(d.id) ? 'pill:' + d.id : null;   // 收官 B3：灵舟、避水丹也能放快捷栏（走 pill: 那一路，game.usePill 交给 jueyu）
  const toHotbar = (key: string, i?: number) => {
    const j = h.hotbar.indexOf(key);
    if (i === undefined) { if (j >= 0) { say(`已在快捷栏 ${j + 1}`); return; } const k = h.hotbar.findIndex((x) => !x); i = k >= 0 ? k : 8; }
    if (j >= 0 && j !== i) h.hotbar[j] = h.hotbar[i];
    h.hotbar[i] = key; click(); say(`${slotInfo(key)?.name ?? ''}放入快捷栏 ${i + 1}`); re();
  };
  const discard = (b: C.BagItem) => {
    const i = h.bag.indexOf(b); if (i < 0) return;
    h.bag.splice(i, 1);
    if (!h.bag.some((x) => x.id === b.id)) h.hotbar = h.hotbar.map((x) => (x && x.endsWith(':' + b.id) && !x.startsWith('pill:') ? null : x));
    setSel(null); setConfirm(null); audio.sfx('land'); say(`丢掉了${itemDef(b.id).name}${b.n > 1 ? ' ×' + b.n : ''}`); game.updateUI(true); re();
  };
  const canDiscard = (b: C.BagItem) => { const d = itemDef(b.id); return !b.worn && !(d.price <= 0 && (d.type === 'misc' || d.type === 'artifact')) && b.id !== 'item_bottle'; };
  /** 双击 / 右键：穿戴、服用、研读…… */
  const quick = (b: C.BagItem) => {
    const d = itemDef(b.id), slot = C.slotOf(b.id);
    if (modx?.canUse(b.id)) { game.usePill(b.id, b); re(); return; }
    if (game.jueyu.usable(b.id)) { game.usePill(b.id, b); re(); return; }   // 收官 B3：灵舟（祭出 / 修补）、避水丹
    if (slot && slot !== 'bond') { equip(b); return; }
    if ((d.pill || b.id === 'herb_yangshen') && d.type !== 'material' && !(b.fake && b.ident)) { game.usePill(b.id, b); re(); return; }
    if (d.type === 'scroll' && !(b.fake && b.ident)) { if (game.learnScroll(b.id, b)) setSel(null); re(); return; }
    if (b.id.startsWith('egg_') && !game.ws.incubate) { game.pets.onEgg(b.id); re(); return; }
    const k = hbKey(d); if (k) toHotbar(k);
  };

  // —— 拖拽
  const dnd = useMemo(() => new Dnd({
    root: () => document.querySelector<HTMLElement>('.lq-modal.inv'),
    canDrop: (src, t) => {
      const [kind, key] = t.split(':');
      if (src.kind === 'cell') {
        const d = itemDef(src.id);
        if (kind === 'cell') return true;
        if (kind === 'slot') return C.slotAccepts(key as EquipSlot, src.id);
        if (kind === 'hb') return !!hbKey(d);
      }
      if (src.kind === 'slot') return kind === 'cell' && tabRef.current === 'gear';
      if (src.kind === 'hb') return kind === 'hb';
      return false;
    },
    onDrop: (src, t) => {
      const b = src.kind === 'cell' ? cellRef.current.get(Number(src.key)) : undefined;
      if (!t) {   // 拖出面板
        if (src.kind === 'cell' && b) { if (canDiscard(b)) setConfirm(b); else reject(src.kind + ':' + src.key, '这是要紧的东西，丢不得。'); }
        else if (src.kind === 'slot') unequip(src.key as EquipSlot);
        else if (src.kind === 'hb') { h.hotbar[Number(src.key)] = null; audio.sfx('land'); re(); }
        return;
      }
      const [kind, key] = t.split(':');
      if (src.kind === 'cell' && b) {
        if (kind === 'cell') { C.moveBagItem(h, b, Number(key)); audio.sfx('click'); re(); }
        else if (kind === 'slot') { if (!equip(b)) reject(t, '穿不上：境界不够或此刻腾不出手。'); }
        else if (kind === 'hb') { const k = hbKey(itemDef(b.id)); if (k) toHotbar(k, Number(key)); }
      } else if (src.kind === 'slot' && kind === 'cell') unequip(src.key as EquipSlot, Number(key));
      else if (src.kind === 'hb' && kind === 'hb') { const i = Number(src.key), j = Number(key); [h.hotbar[i], h.hotbar[j]] = [h.hotbar[j], h.hotbar[i]]; click(); re(); }
    },
    onReject: (src, t) => reject(t ?? src.kind + ':' + src.key, t?.startsWith('slot:') ? '这件放不了这个槽。' : undefined),
    onStart: (src) => { setHover(null); setDragKey(src.kind + ':' + src.key); audio.sfx('click'); },
    onEnd: () => setDragKey(''),
  }), []);
  useEffect(() => () => dnd.dispose(), [dnd]);
  const tabRef = useRef(tab); tabRef.current = tab;

  // —— 格子
  const cells = C.bagCells(h, tab);
  const cellRef = useRef(cells); cellRef.current = cells;
  const cols = mode === 'wide' ? 10 : 6;   // 第五轮：电脑十列（格子小一号），配上收紧的人物区，1600×900 下露得出四行
  const maxPos = Math.max(-1, ...cells.keys());
  const nCells = Math.max(cols * (mode === 'wide' ? 5 : 4), Math.ceil((maxPos + 1 + cols) / cols) * cols);   // 不够了自动加一行
  const ql = q.trim();
  const counts: Record<string, number> = {}; for (const b of h.bag) if (C.shownCount(h, b) > 0) { const t = C.tabOf(b.id); counts[t] = (counts[t] ?? 0) + 1; }

  const lingshi = C.bagCount(h, 'mat_lingshi');
  const cur = sel && h.bag.includes(sel) && C.shownCount(h, sel) > 0 ? sel : null, cd = cur ? itemDef(cur.id) : null;
  // 近战兵器线：预览里的人把兵器拿在手里（兵器槽 > 剑类本命法宝）；面板开着时游戏不走帧，这里自己按袋子算
  const look = lookWithWeapon((game.player as { look: Parameters<typeof LookPreview>[0]['look'] }).look, heroWeaponLook(h));
  const dim = mode === 'wide' ? { w: 210, h: 224 } : mode === 'tall' ? { w: 170, h: 236 } : { w: 150, h: 196 };
  const held = C.heldWeapon(h);
  const st = game.stats, gm = C.gearMods(h), prog = C.setProgress(h);
  const pet = game.pets?.active;

  const hoverOn = (e: React.PointerEvent, id: string, b?: C.BagItem) => { if (e.pointerType !== 'mouse' || dnd.dragging) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setHover({ b, id, box: { x: r.left, y: r.top, w: r.width, h: r.height } }); };
  const hoverOff = () => setHover(null);
  const shakeCls = (key: string) => (shake && shake.key === key ? ' shake-' + (shake.n % 2) : '') + (dragKey === key ? ' lifted' : '');

  const eqSlot = (s: EquipSlot) => {
    const b = C.wornIn(h, s), key = 'slot:' + s;
    const d = b ? itemDef(b.id) : null;
    return (
      <div key={s} data-drop={key} className={'inv-eq' + (s === SLOT_WEAPON ? ' wpn' : '') + (b ? ' full t' + d!.tier : '') + (selSlot === s ? ' on' : '') + shakeCls(key)} style={d ? { ['--tc' as string]: tierColor(d.tier, 'lacquer') } as CSSProperties : undefined}
        onPointerDown={(e) => { if (b) dnd.down(e, e.currentTarget, { kind: 'slot', key: s, id: b.id }); }}
        onPointerEnter={(e) => b ? hoverOn(e, b.id, b) : undefined} onPointerLeave={hoverOff}
        onClick={() => { click(); setSel(null); setSelSlot(selSlot === s ? null : s); setInfo(false); }}
        onDoubleClick={() => { if (b) unequip(s); }} onContextMenu={(e) => { e.preventDefault(); if (b) unequip(s); }}
        title={b ? undefined : s === SLOT_WEAPON ? (held.from === 'bond' ? `兵器：空着——手里握的是本命飞剑「${itemDef(held.item!).name}」（把剑、重兵或长枪拖到这里）` : '兵器：空（把剑、重兵或长枪拖到这里；空着就是拳脚）') : `${SLOT_NAME[s]}：空（把${s === 'bond' ? '一件攻击法宝' : SLOT_NAME[s]}拖到这里）`}>
        {b ? <ItemGlyph id={b.id} className="inv-eq-ico" style={{ color: tierColor(d!.tier, 'lacquer') }} /> : s === SLOT_WEAPON && held.from === 'bond' ? <ItemGlyph id={held.item!} className="inv-eq-ico inv-eq-ghost" /> : <span className="inv-eq-ph">{s === SLOT_WEAPON ? '兵' : SLOT_NAME[s].slice(-1)}</span>}
        <span className="inv-eq-n">{s === SLOT_WEAPON && !b ? (held.from === 'bond' ? '本命剑' : '拳脚') : SLOT_NAME[s]}</span>
        {fx?.slot === s && <i className="inv-eq-ring" key={fx.n} />}
      </div>
    );
  };

  return (
    <LacquerModal title="储物袋" variant="lacquer" className="inv scroll-panel" maskClass="modal-mask" closeClass="close-btn" width={760} height={880} onClose={onClose} closeTip="收起（Esc）">
      <div className="lq-head panel-head inv-head">
        <span className="inv-realm">{h.name} · {realmName(h.realm, h.stage)}</span>
        {Object.keys(prog).length > 0 && <span className="inv-sets">{(Object.entries(prog) as [keyof typeof SETS, number][]).map(([s, n]) => <em key={s} className={n >= 2 ? 'on' : ''}>{SETS[s].name} {n}/4</em>)}</span>}
      </div>
      <div className={'inv-body m-' + mode}>
        {/* —— 上半：人物与装备栏 */}
        <section className="inv-doll" style={{ backgroundImage: `url(${sceneUrl})` }}>
          <div className="inv-doll-shade" />
          <div className="inv-col l">{SLOT_LEFT.map(eqSlot)}</div>
          <div className="inv-center">
            <div className="inv-fig" style={{ width: dim.w, height: dim.h }}>
              {fx && <i className="inv-halo" key={'h' + fx.n} />}
              <LookPreview look={look} width={dim.w} height={dim.h} scale={3.0} base={mode === 'wide' ? 0.72 : 0.74} armed act={pose === 'cast' ? 'cast' : 'idle'} />
              {fx && <i className="inv-flash" key={'f' + fx.n} />}
              {/* 近战兵器线：第十一个槽「兵器」放在人物脚下正中，比别的槽大一号 */}
              <div className="inv-wpn">{eqSlot(SLOT_WEAPON)}</div>
            </div>
            <div className="inv-stats">
              <span>气血 <b>{st.hp}</b></span><span>法力 <b>{st.mp}</b></span><span>攻 <b>{st.atk}</b></span><span>防 <b>{st.def}</b></span>
              {(['poise', 'melee', 'waterward', 'windward'] as GearStat[]).filter((k) => (gm[k] ?? 0) > 0).map((k) => <span key={k} className="new">{STAT_NAME[k]} <b>+{pct(gm[k]!)}</b></span>)}
            </div>
            <div className="inv-hb">
              {h.hotbar.map((id, i) => {
                const inf = slotInfo(id), key = 'hb:' + i, pn = id?.startsWith('pill:') ? talCount(game, id.slice(5)) : id?.startsWith('tal:') ? talCount(game, id.slice(4)) : -1;
                return (
                  <div key={i} data-drop={key} className={'inv-hbc' + (inf ? '' : ' empty') + (pn === 0 ? ' dry' : '') + shakeCls(key)} style={inf ? { ['--sc' as string]: inf.color } as CSSProperties : undefined}
                    onPointerDown={(e) => { if (id) dnd.down(e, e.currentTarget, { kind: 'hb', key: String(i), id }); }}
                    onClick={() => { if (cur) { const k = hbKey(itemDef(cur.id)); if (k) toHotbar(k, i); } }}
                    onContextMenu={(e) => { e.preventDefault(); if (id) { h.hotbar[i] = null; re(); } }}
                    title={inf ? `${inf.name}（右键或拖出面板移出）` : `快捷栏 ${i + 1}：空`}>
                    {inf && (id!.startsWith('art:') || id!.startsWith('tal:') || id!.startsWith('pill:')) ? <ItemGlyph id={id!.slice(id!.indexOf(':') + 1)} className="hb-glyph" /> : inf && SKILL_ICON[id!] ? <img className="hb-glyph art-ico" src={SKILL_ICON[id!]} alt="" draggable={false} /> : inf ? <span className="hb-glyph">{inf.glyph}</span> : null}
                    {pn >= 0 && <small>{pn}</small>}
                    <em>{i + 1}</em>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="inv-col r">{SLOT_RIGHT.map(eqSlot)}</div>
          {pet && <div className="inv-pet" title="出战灵宠（在灵宠菜单里换）"><b>灵宠</b>{pet.name}<small>{PET_KINDS[pet.kind]?.name ?? ''} · {pet.lv} 级</small></div>}
        </section>

        {/* —— 下半：页签、格子 */}
        <section className="inv-bag">
          <InkTabs<C.BagTab> legacy className="fill inv-tabs" value={tab} onChange={(k) => { click(); setTab(k); setSel(null); setHover(null); }} items={TABS.map((t) => ({ k: t.k, label: t.label, badge: counts[t.k] || undefined }))} />
          <div className="inv-grid lq-scroll" key={tab} style={{ ['--cols' as string]: cols } as CSSProperties}>
            {Array.from({ length: nCells }, (_, pos) => {
              const b = cells.get(pos), key = 'cell:' + pos;
              if (!b) return <ItemCell key={pos} className={'slot inv-cell' + shakeCls(key)} attrs={{ 'data-drop': key }} style={{ ['--d' as string]: Math.min(pos, 48) * 9 + 'ms' } as CSSProperties} />;
              const d = itemDef(b.id), n = C.shownCount(h, b), fk = !!(b.fake && b.ident);
              const miss = !!ql && !d.name.includes(ql);
              return (
                <ItemCell key={pos} id={b.id} n={n} tier={d.tier} age={b.age} on={cur === b} off={miss} mark={fk ? '伪' : d.gear?.set ? '套' : h.equip.bond === b.id ? '本' : undefined}
                  className={'slot inv-cell' + (cur === b ? ' on' : '') + shakeCls(key)} attrs={{ 'data-drop': key, 'data-id': b.id, 'data-uid': b.uid }}
                  style={{ ['--d' as string]: Math.min(pos, 48) * 9 + 'ms', ['--fd' as string]: ((pos * 0.37) % 3).toFixed(2) + 's' } as CSSProperties}
                  onClick={() => { click(); setSelSlot(null); setSel(cur === b ? null : b); setInfo(false); }}>
                  <span className="inv-hit" onPointerDown={(e) => dnd.down(e, e.currentTarget.parentElement as HTMLElement, { kind: 'cell', key: String(pos), id: b.id })}
                    onPointerEnter={(e) => hoverOn(e, b.id, b)} onPointerLeave={hoverOff}
                    onDoubleClick={() => quick(b)} onContextMenu={(e) => { e.preventDefault(); quick(b); }} />
                </ItemCell>
              );
            })}
            <div className="inv-modslot"><ModSlot id="bag" /></div>
          </div>
        </section>
      </div>

      {/* —— 操作条：选中格子或装备槽时出来 */}
      {(cur && cd) || selSlot ? (
        <div className="inv-acts" key={cur ? 'b' + (cur.uid ?? cur.id + cur.pos) : 's' + selSlot}>
          {info && cur && <div className="inv-acts-card lq-scroll"><ItemCard game={game} b={cur} id={cur.id} /></div>}
          <div className="inv-acts-row">
            {cur && cd ? <>
              <span className="inv-acts-name" style={{ color: tierColor(cd.tier, 'lacquer') }}>{cur.fake && cur.ident ? `伪·${cd.name}` : cd.name}{cur.n > 1 && <small> ×{C.shownCount(h, cur)}</small>}</span>
              <button className={btnCls('line')} onClick={() => setInfo(!info)}>{info ? '收起' : '详情'}</button>
              {modx?.canUse(cur.id) && <button className={btnCls('jade', 'ink-btn jade')} onClick={() => { game.usePill(cur.id, cur); re(); }}>使用</button>}
              {(cd.pill || cur.id === 'herb_yangshen') && cd.type !== 'material' && !modx?.canUse(cur.id) && !(cur.fake && cur.ident) && <button className={btnCls('jade', 'ink-btn jade')} onClick={() => { game.usePill(cur.id, cur); re(); }}>服用</button>}
              {cur.id === 'mat_lingquan' && <button className={btnCls('jade', 'ink-btn jade')} onClick={() => { game.usePill(cur.id, cur); re(); }}>饮下</button>}
              {game.jueyu.usable(cur.id) && <button className={btnCls('jade', 'ink-btn jade')} onClick={() => { game.usePill(cur.id, cur); re(); }}>{cur.id === 'hy_bishuidan' ? '服用' : game.jueyu.boat.aboard && game.jueyu.boat.id === cur.id ? '收舟' : game.jueyu.boat.hpOf(cur.id) < 0.999 && !game.player.flying && game.terrain.isLand(game.player.x, game.player.y) ? `修补（耐久 ${Math.round(game.jueyu.boat.hpOf(cur.id) * 100)}%）` : `祭出（耐久 ${Math.round(game.jueyu.boat.hpOf(cur.id) * 100)}%）`}</button>}
              {cur.id === 'misc_guhua' && <button className={btnCls('jade', 'ink-btn jade')} title="挂在自己洞府门前，走进画里就是一处小洞天" onClick={() => { if (game.huajuan.hang(cur)) setSel(null); re(); }}>挂进洞府</button>}
              {cur.id.startsWith('egg_') && <button className={btnCls('jade', 'ink-btn jade')} disabled={!!game.ws.incubate} onClick={() => { game.pets.onEgg(cur.id); setSel(null); re(); }}>{game.ws.incubate ? '已有灵卵在温养' : '温养'}</button>}
              {cd.type === 'scroll' && !(cur.fake && cur.ident) && <button className={btnCls('jade', 'ink-btn jade')} onClick={() => { if (game.learnScroll(cur.id, cur)) setSel(null); re(); }}>研读参悟</button>}
              {(cd.type === 'pill' || cd.type === 'scroll') && !cur.ident && <button className={btnCls('line', 'ink-btn')} title="耗少许法力，以神识探查丹药或玉简真伪" onClick={() => { const r = game.renxin.appraiseBagSlot(cur, false); game.toast(r.msg, r.isFake ? 'warn' : 'good'); say(r.msg.slice(0, 40)); audio.sfx(r.isFake ? 'fail' : 'chime'); re(); }}>神识探查真伪</button>}
              {cur.fake && cur.ident && <button className={btnCls('line', 'ink-btn ghost')} onClick={() => { const i = h.bag.indexOf(cur); if (i >= 0) h.bag.splice(i, 1); setSel(null); game.toast(`已销毁伪造的${cd.name}。`, 'info'); re(); }}>销毁伪物</button>}
              {C.slotOf(cur.id) && C.slotOf(cur.id) !== 'bond' && <button data-act="wear" className={btnCls('jade', 'ink-btn jade')} onClick={() => { if (!equip(cur)) reject('cell:' + cur.pos, '穿不上：境界不够或此刻腾不出手。'); }}>{cd.gear ? '穿上' : '祭出'}</button>}
              {C.slotOf(cur.id) === 'bond' && <button className={btnCls('line', 'ink-btn')} onClick={() => equip(cur)}>{h.equip.bond === cur.id ? '解除本命' : '结为本命'}</button>}
              {hbKey(cd) && <button data-act="hotbar" className={btnCls('line', 'ink-btn')} onClick={() => toHotbar(hbKey(cd)!)}>放入快捷栏</button>}
              {cd.type === 'herb' && h.bottle.owned !== false && <button className={btnCls('line', 'ink-btn')} disabled={h.bottle.drops <= 0} onClick={() => { const age = (cur.age ?? 0) + C.BOTTLE_YEARS; game.useBottle(cur); setSel(h.bag.find((x) => x.id === cur.id && x.age === age) ?? null); re(); }}>问道残卷催熟（+{C.BOTTLE_YEARS}年）</button>}
              {canDiscard(cur) && <button className={btnCls('line', 'ink-btn ghost inv-drop')} onClick={() => setConfirm(cur)}>丢弃</button>}
            </> : selSlot && <>
              <span className="inv-acts-name">{SLOT_NAME[selSlot]}{C.wornIn(h, selSlot) ? '：' + itemDef(C.wornIn(h, selSlot)!.id).name : selSlot === SLOT_WEAPON && held.from === 'bond' ? '：空（握着本命飞剑）' : '：空'}</span>
              {C.wornIn(h, selSlot) ? <button className={btnCls('jade', 'ink-btn jade')} onClick={() => { unequip(selSlot); setSelSlot(null); }}>{selSlot === 'bond' ? '解除本命' : GEAR_SLOT_SET.has(selSlot) ? '卸下' : '收起'}</button>
                : <span className="inv-acts-tip">把{selSlot === 'bond' ? '一件攻击法宝' : selSlot === SLOT_WEAPON ? '剑、重兵或长枪' : SLOT_NAME[selSlot]}拖到这一格，或在格子里选中后点「{selSlot === 'bond' ? '结为本命' : '穿上'}」。</span>}
            </>}
            <button className="inv-acts-x" onClick={() => { setSel(null); setSelSlot(null); }} aria-label="取消选中">×</button>
          </div>
        </div>
      ) : null}

      {/* —— 底栏 */}
      <div className="inv-foot">
        <span className="inv-money"><Stone n={lingshi} unit /></span>
        {h.bottle.owned !== false && <span className="inv-bottle" title="问道残卷墨露">问道残卷 <b>{'●'.repeat(Math.max(0, Math.min(C.BOTTLE_MAX, h.bottle.drops)))}<i>{'○'.repeat(Math.max(0, C.BOTTLE_MAX - h.bottle.drops))}</i></b></span>}
        <label className="inv-q"><i>⌕</i><input value={q} placeholder="搜物品名" onChange={(e) => setQ(e.target.value)} /></label>
        <button className={btnCls('line', 'inv-sort')} onClick={() => { C.sortBag(h); click(); say('整理好了'); re(); }}>整理</button>
      </div>

      {confirm && <div className="inv-confirm" onClick={() => setConfirm(null)}>
        <div className="inv-confirm-box" onClick={(e) => e.stopPropagation()}>
          <div className="inv-confirm-t">丢掉「{itemDef(confirm.id).name}」{confirm.n > 1 ? ` ×${confirm.n}` : ''}？</div>
          <p>丢了就找不回来了。</p>
          <div className="inv-confirm-b"><button className={btnCls('line')} onClick={() => setConfirm(null)}>算了</button><button className={btnCls('zhu')} onClick={() => discard(confirm)}>丢弃</button></div>
        </div>
      </div>}

      {hover && !dnd.dragging && <FloatCard box={hover.box} className="lq-tip inv-card"><ItemCard game={game} b={hover.b} id={hover.id} /></FloatCard>}
      <InkToast msg={msg} tone="jade" className="inv-toast" />
    </LacquerModal>
  );
}
