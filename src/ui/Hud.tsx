// 收官 H3：主界面的各块（GameView 只管把它们放进各区）。
//   人物牌（scaleX 的三条 + 残影）、增益 / 减益图标行、目标框、左侧任务列（带给引导用的插槽）、情境提示位、
//   电脑右下的「常用键一圈 + 更多抽屉」、可收起的键位提示、手机的功能抽屉，以及量 HUD 占位给画布避让用的 useHudRects。
// 新画风同界面底座：乌木漆底、鎏金细线、朱印；动效只动 transform / opacity。
// 旧类名（.char-card .bar.hp/.mp/.exp .quest-tracker .sect-tracker .loc-card .talk-tip .gather-tip .sit-banner .action-bar .btn-grid
// .round-btn .round-btn.mod-btn .dock-mask .dock-sheet .dock-item .help-tip）都还挂着——清界皮肤和 Compass（找 .char-card .bar.mp）认它们。
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { KoubeiLine } from './Enyuan';   // 恩怨重做 · 第二批：地点卡上的本地口碑
import type { Game, UIState } from '../world/game';
import type { Enemy, Statuses } from '../world/combat';
import { newWatch, watchHp, type HpTheme, type HpWatch } from './hpfx';   // r11-lock：血条打击感
import { STATUS_NAME } from '../data/arts';
import { REALMS } from '../data/realms';
import { LOC_BY_ID, LOC_TYPE_NAME, type LocDef } from '../data/world';
import { SECT_RANKS } from '../world/worldstate';
import { dirName } from '../world/sites';
import { modx } from '../mod/hooks';
import { audio } from '../world/audio';
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';
import { setHudRects, type HudRect } from '../core/hudzones';
import { SEAL, SEAL_COLOR } from './Panels';
import { Tooltip } from './kit';
import { useQuestEntries } from './questSlot';
import { SeaButtons, seaHint } from './Compass';   // 收官 B3：灵舟、下潜上浮的圆钮，甲板上的情境提示

const sfxOpen = () => audio.sfx('open');
/** 每 ms 毫秒重渲染一次（只读 game 的小块用；不订阅整张 ui） */
function useTick(ms: number) { const [, f] = useState(0); useEffect(() => { const t = setInterval(() => f((x) => x + 1), ms); return () => clearInterval(t); }, [ms]); }
const fmtLeft = (s: number) => (s >= 60 ? Math.ceil(s / 60) + '′' : s >= 10 ? Math.ceil(s) + '' : s.toFixed(1));

// ---------------------------------------------------------------- 条：scaleX + 残影（不动 width）
/** .bar.kind > .bar-ghost + .bar-fill：掉下去时残影停一下再追上（只动 transform） */
/** r11-lock 血条打击感：fx 给了就接上碎玉 / 滴血 / 回血（ui/hpfx.ts）；theme hp 的低于 25% 时边缘渗一圈呼吸的红墨 */
export interface HudBarFx { theme: HpTheme; st?: () => Statuses | undefined; light?: boolean }
export function HudBar({ kind, v, title, cls = '', fx }: { kind: string; v: number; title?: string; cls?: string; fx?: HudBarFx }) {
  const k = Math.max(0, Math.min(1, v || 0));
  const prev = useRef(k); const [ghost, setGhost] = useState(k);
  const el = useRef<HTMLDivElement>(null), w = useRef<HpWatch | null>(null);
  useEffect(() => {
    if (fx) { w.current ??= newWatch(k); watchHp(w.current, el.current, k, fx.st?.(), fx.theme, fx.light); }
    if (k >= prev.current) { prev.current = k; setGhost(k); return; }
    prev.current = k; const t = window.setTimeout(() => setGhost(k), 420); return () => window.clearTimeout(t);
  }, [k]);
  const dying = fx?.theme === 'hp' && k > 0 && k < 0.25;
  return (
    <div ref={el} className={`bar ${kind} ${cls}${dying ? ' dying' : ''}`} title={title}>
      <i className="bar-ghost" style={{ transform: `scaleX(${Math.max(k, ghost).toFixed(4)})` }} />
      <div className="bar-fill" style={{ transform: `scaleX(${k.toFixed(4)})` }} />
      {fx?.theme === 'hp' && <i className="bar-dying" />}
    </div>
  );
}

// ---------------------------------------------------------------- 人物牌
export function CharPlaque({ game, ui }: { game: Game; ui: UIState }) {
  const realmDef = REALMS[game.hero.realm];
  const expPct = Math.min(1, ui.exp / Math.max(1, ui.need));
  return (
    <div className="char-card hud-plaque">
      <div className="char-portrait" style={{ backgroundImage: 'url(./art/hanli.webp)' }} />
      <div className="char-info">
        <div className="char-name">
          <span className="cn-t">苏寒</span>
          <span className="realm-badge" style={{ ['--rc' as string]: realmDef.color } as CSSProperties}>{ui.realmText}</span>
          {ui.daoHurt && <Tooltip tip={<>{ui.daoHurt.why}<br />修炼速度 −40%，法力上限 −20%</>}><span className="realm-badge hurt">道伤{ui.daoHurt.days}日</span></Tooltip>}
        </div>
        <div className="char-sub">{ui.rootName} · {Math.floor(ui.age)}岁 / 寿{ui.maxLife}<span className="sense-range"> · 神识 {ui.sense}</span></div>
        <HudBar kind="hp" v={ui.hp} title={`气血 ${Math.round(ui.hp * 100)}%`} fx={{ theme: 'hp', st: () => game.combat.pst }} />
        <HudBar kind="mp" v={ui.mp} title={`法力 ${Math.round(ui.mp * 100)}%`} fx={{ theme: 'mp' }} />
        <HudBar kind="exp" v={expPct} cls={ui.bottleneck !== 'none' ? 'full' : ''} title={`修为 ${Math.floor(ui.exp)} / ${ui.need}`} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 增益 / 减益
interface Buff { k: string; g: string; name: string; desc: string; left?: number; bad?: boolean }
const STATUS_DESC: Record<string, string> = { burn: '身上着火，每息掉血', freeze: '被冻住，动弹不得', shock: '经脉麻痹，出不了手', poison: '中毒，持续掉血', root: '被定住，走不了', knock: '被击退', break: '护体被破，防御减半', slow: '身形迟缓，移速减半', stun: '头晕目眩，动弹不得' };
function collectBuffs(game: Game, ui: UIState): Buff[] {
  const C = game.combat, now = game.time, b = C.buffs, u = b.until, out: Buff[] = [];
  const timed = (k: keyof typeof b, g: string, name: string, desc: string) => { const until = u[k as string] ?? 0; if (until > now && (k === 'stealth' || (b[k] as number) > 0)) out.push({ k: String(k), g, name, desc, left: until - now }); };
  timed('atk', '攻', '攻势', `出手威力 +${Math.round(b.atk * 100)}%`);
  timed('def', '御', '护体', `受到的伤害减 ${Math.round(b.def * 100)}%`);
  timed('speed', '速', '身法', `移速 +${Math.round(b.speed * 100)}%`);
  timed('regen', '春', '回春', '气血缓缓回复');
  timed('stealth', '隐', '隐匿', '敌人失去了你的踪迹');
  timed('decoy', '替', '替身', '敌人去追替身了');
  if (C.shield && C.shield.amt > 0) out.push({ k: 'shield', g: '盾', name: '护盾', desc: `还能挡 ${Math.round(C.shield.amt)} / ${Math.round(C.shield.max)}`, left: C.shield.t > 0 && C.shield.t < 1e5 ? C.shield.t : undefined });
  if (game.senseBurstT > 0) out.push({ k: 'sense', g: '识', name: '神识外放', desc: `神识范围 ×2，持续耗法力；再按 ${keyLabel(bindOf('sense'))} 收回`, left: game.senseBurstT < 1e5 ? game.senseBurstT : undefined });
  if (ui.concealed) out.push({ k: 'conceal', g: '敛', name: '敛息', desc: '神识缩小，不易被更强者察觉' });
  for (const [k, inst] of Object.entries(C.pst)) if (inst && inst.t > 0) out.push({ k: 'st-' + k, g: k === 'poison' ? '毒' : (STATUS_NAME as Record<string, string>)[k]?.[0] ?? '异', name: (STATUS_NAME as Record<string, string>)[k] ?? k, desc: STATUS_DESC[k] ?? '', left: inst.t, bad: true });
  if (ui.daoHurt) out.push({ k: 'dao', g: '伤', name: '道伤', desc: `${ui.daoHurt.why}——修炼速度 −40%，法力上限 −20%（还有 ${ui.daoHurt.days} 日）`, bad: true });
  return out;
}
export function BuffRow({ game, ui }: { game: Game; ui: UIState }) {
  useTick(250);
  const list = collectBuffs(game, ui);
  if (!list.length) return null;
  return (
    <div className="buff-row">
      {list.slice(0, 10).map((b, i) => (
        <Tooltip key={b.k} tip={<><b>{b.name}</b>{b.left !== undefined ? `　余 ${fmtLeft(b.left)} 息` : ''}<br />{b.desc}</>}>
          <span className={'buff' + (b.bad ? ' bad' : '')} style={{ ['--i' as string]: i } as CSSProperties}>
            <b>{b.g}</b>{b.left !== undefined && <small>{fmtLeft(b.left)}</small>}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- 目标框
/** 锁定对象：名字、境界、血（残影）、罡气（近战里交手的那位才有罡气读数） */
export function TargetFrame({ game }: { game: Game }) {
  useTick(100);
  const e: Enemy | null = game.combat.lock;
  if (!e || e.dead) return null;
  const p = game.player;
  // 妖王血条已经在顶栏上画着这一位了，不重复
  if (e.blv >= 8 && e.aggro && Math.hypot(e.x - p.x, e.y - p.y) < 2200) return null;
  const hp = Math.max(0, e.hp / Math.max(1, e.maxHp));
  const bh = game.combat.brawl.hud();
  const poise = bh.foe && game.combat.brawl.foe === e ? bh.foe : null;
  const rank = e.rankText;
  const danger = (e.realm ?? 0) > game.hero.realm || (e.blv ?? 0) >= 5;
  return (
    <div className={'target-frame' + (danger ? ' danger' : '')} key={e.id}>
      <div className="tf-row"><span className="tf-seal">{e.def.kind === 'human' ? '敌' : e.def.kind === 'ghost' ? '阴' : '妖'}</span><b className="tf-name">{e.name}</b><span className="tf-rank">{rank}</span><span className="tf-pct">{Math.ceil(hp * 100)}%</span></div>
      <HudBar kind="hp tf-hp" v={hp} />
      {poise && <div className={'tf-poise' + (poise.broken ? ' broken' : '')}><span>罡气</span><HudBar kind="poise" v={poise.poiseMax > 0 ? poise.poise / poise.poiseMax : 0} /><em>{poise.broken ? '破罡' : Math.round(poise.poise)}</em></div>}
    </div>
  );
}

// ---------------------------------------------------------------- 左侧任务列
function MainQuest({ game }: { game: Game }) {
  const q = game.story?.tracker();
  if (!q) return null;
  const go = () => { if (q.tx !== undefined && q.ty !== undefined) { audio.sfx('click'); game.destination = { x: q.tx, y: q.ty! }; game.toast(`前往：${q.title}`); } };
  return (
    <div className={'quest-tracker qc-item main' + (q.tx !== undefined ? ' clickable' : '')} onPointerDown={(e) => { e.stopPropagation(); go(); }} title={q.tx !== undefined ? '点击自动前往' : ''}>
      <div className="qt-ch">{q.ch}</div>
      <div className="qt-title">{q.title}</div>
      <div className="qt-text">{q.text}</div>
      {q.ang !== undefined && q.dist !== undefined && q.dist > 160 && <div className="qt-dir"><span className="qt-arrow" style={{ transform: `rotate(${q.ang}rad)` }}>➤</span>约 {Math.max(1, Math.round(q.dist / 30))} 丈</div>}
    </div>
  );
}
function SectTasks({ game }: { game: Game }) {
  const s = game.ws.sect;
  if (!s || !s.tasks.length) return null;
  const list = s.tasks.filter((t) => t.until >= game.day).slice(0, 2);
  if (!list.length) return null;
  return (
    <div className="sect-tracker qc-item">
      <div className="st-head">{LOC_BY_ID.get(s.id)?.name ?? '宗门'} · {SECT_RANKS[s.rank]}</div>
      {list.map((t) => {
        const have = Math.max(0, game.towns.taskProgress(t)), done = have >= t.need;
        const w = game.towns.taskWhere(t);
        const d = w.x !== undefined && w.y !== undefined ? Math.max(1, Math.round(Math.hypot(w.x - game.player.x, w.y - game.player.y) / 30)) : 0;
        const dir = w.x !== undefined && w.y !== undefined ? dirName(w.x - game.player.x, w.y - game.player.y) : '';
        return (
          <div key={t.id} className={'st-row' + (done ? ' done' : '')} onPointerDown={(e) => {
            e.stopPropagation();
            if (w.x === undefined || w.y === undefined) { game.toast('这处目标还没探明。', 'info'); return; }
            audio.sfx('click'); game.setGuide(w.x, w.y, t.text);
          }}>
            <b>{done ? '✔' : '·'} {t.text}</b><span>{have}/{t.need}</span>
            <em>{w.spot}{d ? (game.mijing.active ? '　界外' : `　${dir}方约 ${d} 丈`) : ''}</em>
          </div>
        );
      })}
    </div>
  );
}
function ModQuests({ game }: { game: Game }) {
  const list = modx?.quests().filter((q) => !q.done).slice(0, 3) ?? [];
  if (!list.length) return null;
  return (
    <div className="sect-tracker mod-tracker qc-item">
      {list.map((q) => {
        const has = q.x !== undefined && q.y !== undefined;
        const d = has ? Math.max(1, Math.round(Math.hypot(q.x! - game.player.x, q.y! - game.player.y) / 30)) : 0;
        return (
          <div key={q.key} className="st-row" onPointerDown={(e) => { e.stopPropagation(); if (has) { audio.sfx('click'); game.setGuide(q.x!, q.y!, q.title); } }}>
            <b>· {q.title}</b>{q.need ? <span>{q.have ?? 0}/{q.need}</span> : null}
            <em>{q.text ?? ''}{d ? (game.mijing.active ? '　界外' : `　${dirName(q.x! - game.player.x, q.y! - game.player.y)}方约 ${d} 丈`) : ''}</em>
          </div>
        );
      })}
    </div>
  );
}
/** 插槽里别处塞进来的条目（第四轮的新手引导「下一步」等，见 ui/questSlot.ts） */
function SlotEntries() {
  const list = useQuestEntries();
  if (!list.length) return null;
  return <>{list.map((q) => (
    <div key={q.key} className={'qc-item qc-slot k-' + q.kind + (q.onClick ? ' clickable' : '')} onPointerDown={q.onClick ? (e) => { e.stopPropagation(); audio.sfx('click'); q.onClick!(); } : undefined}>
      <div className="qs-head"><b>{q.title}</b>{q.progress && <span>{q.progress}</span>}</div>
      {q.text && <div className="qs-text">{q.text}</div>}
    </div>
  ))}</>;
}
/** 任务列：插槽（引导）→ 主线 → 宗门 → 模组；矮屏只留最要紧的两块，其余折成「还有 N 件」 */
export function QuestColumn({ game, children }: { game: Game; children?: ReactNode }) {
  useTick(300);
  const [open, setOpen] = useState(false);
  return (
    <div className={'quest-col' + (open ? ' open' : '')}>
      <SlotEntries />
      <MainQuest game={game} />
      <SectTasks game={game} />
      <ModQuests game={game} />
      {children}
      <button className="qc-more" onPointerDown={(e) => { e.stopPropagation(); audio.sfx('click'); setOpen((o) => !o); }}>{open ? '收起' : '展开任务'}</button>
    </div>
  );
}

// ---------------------------------------------------------------- 情境提示位（快捷栏正上方）
/** 交谈、采集、地点卡、打坐横幅都从这一处出：同一时刻按优先级最多两条（最要紧的贴着快捷栏），不再各自定位互相压 */
export function ContextHints({ game, ui, touch, blocked, onTalent }: { game: Game; ui: UIState; touch: boolean; blocked: boolean; onTalent: () => void }) {
  if (blocked) return null;
  // 人在屋里（走进了客栈、铺子、大殿）时不出地点卡：它正好盖在屋子中央；这时交谈键是和掌柜说话，要开总览按「进入」键照旧
  const loc: LocDef | null = ui.nearby && !game.mijing.active && !game.indoor?.inside ? ui.nearby : null;
  const items: { k: string; el: ReactNode }[] = [];
  { const sh = seaHint(game); if (sh && !game.modal) items.push({ k: 'sea', el: <button className={'talk-tip ctx-pill' + (sh.warn ? ' warn' : '')} onClick={() => { if (sh.act) game.interact(); }}>{sh.act && !touch && <kbd>{keyLabel(bindOf('interact'))}</kbd>}{sh.text}</button> }); }   // 收官 B3：海上
  if (ui.gatherP >= 0 && !ui.sitting) items.push({ k: 'gp', el: <button className="gather-tip ctx-pill" onClick={() => game.tryGather()}>采集中…<span className="gp"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, ui.gatherP)).toFixed(3)})` }} /></span></button> });
  if (ui.pendingTalent) items.push({ k: 'talent', el: <button className="talent-alert ctx-pill gold" onClick={onTalent}>逆天改命机缘已至——点此选择</button> });
  if (ui.talk && !game.modal) items.push({ k: 'talk', el: <button className="talk-tip ctx-pill" onClick={() => game.interact()}>{!touch && <kbd>{keyLabel(bindOf('interact'))}</kbd>}{ui.talk}</button> });
  if (ui.gather && ui.gatherP < 0 && !ui.sitting) items.push({ k: 'gather', el: <button className="gather-tip ctx-pill" onClick={() => game.tryGather()}>{!touch && <kbd>{keyLabel(bindOf('gather'))}</kbd>}采集 {ui.gather.name}</button> });
  if (ui.sitting) items.push({ k: 'sit', el: <div className="sit-banner"><div className="sb-t">打坐修炼中</div><div className="sb-s">光阴 ×4 · 每日 +{ui.expRate.toFixed(1)} 修为 · {ui.place}{ui.bottleneck !== 'none' ? ' · 已至瓶颈' : ''}</div></div> });
  if (loc && !game.modal) items.push({
    k: 'loc-' + loc.id, el: (
      <div className="loc-card" key={loc.id}>
        <div className="loc-head">
          <div className="loc-seal" style={{ background: SEAL_COLOR[loc.type] }}>{loc.seal ?? SEAL[loc.type]}</div>
          <div className="loc-name">{loc.name}</div>
          <div className="loc-type">{loc.label ?? LOC_TYPE_NAME[loc.type]}</div>
        </div>
        <div className="loc-desc">{loc.desc}</div>
        <KoubeiLine game={game} loc={loc} />{/* 恩怨重做：本地口碑 */}
        <div className="loc-actions">
          {game.towns.canEnter(loc) ? <button className="ink-btn" onClick={() => { sfxOpen(); game.enterTown(); }}>进入{!touch && <span className="later">（{keyLabel(bindOf('town'))}）</span>}</button>
            : <span className="hint">{loc.type === 'secret' ? '神识之内，或有机缘' : loc.type === 'danger' ? '凶险之地，量力而行' : loc.type === 'inn' ? '路边歇脚处' : ''}</span>}
        </div>
      </div>
    ),
  });
  const shown = items.slice(0, 2);
  if (!shown.length) return null;
  return <div className="ctx-stack">{shown.map((x) => <div className="ctx-item" key={x.k}>{x.el}</div>)}</div>;
}

// ---------------------------------------------------------------- 键位提示：开局展开几秒，之后收成一个「？」
export function HelpHint() {
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem('taixu_help_seen'); } catch { return true; } });
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => { setOpen(false); try { localStorage.setItem('taixu_help_seen', '1'); } catch { /* */ } }, 9000);
    return () => window.clearTimeout(t);
  }, [open]);
  const K = (id: string) => <kbd>{keyLabel(bindOf(id))}</kbd>;
  return (
    <div className={'help-hint' + (open ? ' open' : '')}>
      <button className="hh-btn" onClick={() => { audio.sfx('click'); setOpen((o) => !o); }} title="操作提示" aria-label="操作提示">？</button>
      <div className="help-tip hh-card" aria-hidden={!open}>
        <div className="hh-t">操作</div>
        <div className="hh-grid">
          <span>{K('up')}{K('left')}{K('down')}{K('right')} 移动</span><span>{K('run')} 疾行</span><span>{K('dodge')} 闪避</span>
          <span>{K('interact')} 交谈</span><span>{K('gather')} 采集</span><span>{K('town')} 进城</span>
          <span>{K('slot1')}–{K('slot5')} {K('slot6')} {K('slot7')} 施法</span><span>{K('lock')} 换目标</span><span>{K('brawl')} 近战架势</span>
          <span>{K('fly')} 御剑</span><span>{K('sit')} 打坐</span><span>{K('sense')} 神识外放</span>
          <span>{K('char')} 角色</span><span>{K('bag')} 储物袋</span><span>{K('skills')} 法术书</span>
          <span>{K('map')} 地图</span><span>{K('hudmore')} 更多功能</span><span>{K('help')} 指南</span>
        </div>
        <div className="hh-foot">按键可在「设置 → 改键」里改；点右下「更多」看全部功能</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 电脑右下：常用键一圈 + 更多抽屉
export type PanelOpener = (id: string) => void;
interface RingBtn { k: string; t: string; n: string; tip: string; on?: boolean; glow?: boolean; badge?: number; go: () => void; hold?: (d: -1 | 0 | 1) => void }
/** 抽屉里的条目（电脑「更多」与手机菜单共用一份清单） */
export function drawerItems(game: Game, ui: UIState, open: PanelOpener, touch: boolean): RingBtn[] {
  const friendsN = (game.heartx?.unread ?? 0) + game.friends.S.invites.filter((v) => !v.accepted && !v.done && !v.declined).length;
  const huntN = game.rel?.hunters().filter((d) => d.hunting).length ?? 0;
  const list: RingBtn[] = [
    ...(touch ? [
      { k: 'char', t: '修', n: '角色', tip: '角色 / 冲关', glow: !!(ui.pendingTalent || ui.bottleneck !== 'none'), go: () => open('char') },
      { k: 'bag', t: '袋', n: '储物袋', tip: '储物袋', go: () => open('bag') },
      { k: 'skills', t: '术', n: '法术书', tip: '法术书', go: () => open('skills') },
      { k: 'map', t: '图', n: '地图', tip: '世界地图', go: () => open('map') },
    ] : []),
    { k: 'zhenfa', t: '阵', n: '阵法', tip: `阵法盘（${keyLabel(bindOf('zhenfa'))}）`, go: () => open('zhenfa') },
    { k: 'alchemy', t: '丹', n: '丹器', tip: `丹房 / 器炉（${keyLabel(bindOf('alchemy'))}）`, go: () => open('alchemy') },
    { k: 'seclude', t: '关', n: '闭关', tip: `闭关（${keyLabel(bindOf('seclude'))}）`, go: () => open('seclude') },
    { k: 'wardrobe', t: '衣', n: '衣橱', tip: `衣橱（${keyLabel(bindOf('wardrobe'))}）`, go: () => open('wardrobe') },
    { k: 'friends', t: '友', n: '友人', tip: `友人录（${keyLabel(bindOf('hearts'))}）`, badge: friendsN, go: () => open('friends') },
    { k: 'relations', t: '人', n: '人脉', tip: `人脉录（${keyLabel(bindOf('relations'))}）`, badge: huntN, go: () => game.openModal({ kind: 'relations' }) },
    { k: 'chronicle', t: '记', n: '机缘', tip: `大事记 · 机缘（${keyLabel(bindOf('chronicle'))}）`, go: () => game.openModal({ kind: 'chronicle' }) },
    { k: 'war', t: '符', n: '玉符', tip: `传音玉符（${keyLabel(bindOf('war'))}）`, badge: game.war?.unread, go: () => game.openDialog(game.war.inboxNode()) },
    { k: 'sense', t: '识', n: '外放', tip: `神识外放（${keyLabel(bindOf('sense'))}）`, on: game.senseBurstT > 0, go: () => game.senseBurst() },
    { k: 'conceal', t: '敛', n: '敛息', tip: `敛息（${keyLabel(bindOf('conceal'))}）`, on: ui.concealed, go: () => game.toggleConceal() },
    ...(touch ? [
      // r15-touchctl：「剑」御剑 / 落地挪到了右手侧边那一列（GameView 的 FlyButton），菜单里不再放
      ...(ui.dunkong ? [{ k: 'dunkong', t: '梭', n: dunkongLabel(ui.dunkong), tip: '遁空', on: ui.dunkong.phase !== 'idle', go: () => game.dunkong.toggle() }] : []),
      { k: 'sit', t: '坐', n: ui.sitting ? '起身' : '打坐', tip: '打坐', on: ui.sitting, go: () => game.toggleSit() },
      { k: 'cloud', t: '云', n: '云存档', tip: '云存档', go: () => open('cloud') },
    ] : []),
    { k: 'settings', t: '设', n: '设置', tip: 'Esc', go: () => open('settings') },
    { k: 'help', t: '？', n: '指南', tip: `修仙指南（${keyLabel(bindOf('help'))}）`, go: () => game.openModal({ kind: 'help' }) },
  ];
  for (const b of modx?.buttons() ?? []) list.push({ k: 'mod:' + b.key, t: b.glyph, n: b.label, tip: b.label, badge: b.badge, go: b.go });
  return list;
}
/** 遁空按钮下面的小字：未运转时是「遁空」或剩余冷却，运转中是当前阶段 */
export const dunkongLabel = (d: { phase: string; cd: number }) => d.phase === 'charging' ? '蓄势' : d.phase === 'cruising' ? '收势' : d.phase === 'retracting' ? '收势中' : d.cd > 0 ? d.cd + '息' : '遁空';

function RoundBtn({ b, small, mod, style }: { b: RingBtn; small?: boolean; mod?: boolean; style?: CSSProperties }) {
  return (
    <Tooltip tip={b.tip}>
      <button data-k={b.k} className={'round-btn' + (small ? ' small' : '') + (mod ? ' mod-btn' : '') + (b.on ? ' active' : '') + (b.glow ? ' glow' : '')} style={style}
        onClick={() => { if (!b.hold) b.go(); }}
        onPointerDown={b.hold ? (e) => { e.preventDefault(); b.hold!(1); } : undefined} onPointerUp={b.hold ? () => b.hold!(0) : undefined} onPointerLeave={b.hold ? () => b.hold!(0) : undefined}>
        {b.t}<small>{b.n}</small>{b.badge ? <i className="btn-badge">{b.badge}</i> : null}
      </button>
    </Tooltip>
  );
}

export function ActionRing({ game, ui, open, drawer, setDrawer }: { game: Game; ui: UIState; open: PanelOpener; drawer: boolean; setDrawer: (v: boolean | ((o: boolean) => boolean)) => void }) {
  const go = (id: string) => () => { sfxOpen(); open(id); };
  const inner: RingBtn[] = [
    { k: 'fly', t: '剑', n: ui.flying ? '落地' : '御剑', tip: `御剑 / 落地（${keyLabel(bindOf('fly'))}）`, on: ui.flying, go: () => game.toggleFly() },
    { k: 'sit', t: '坐', n: ui.sitting ? '起身' : '打坐', tip: `打坐（${keyLabel(bindOf('sit'))}）`, on: ui.sitting, go: () => game.toggleSit() },
    { k: 'run', t: ui.run ? '疾' : '步', n: ui.run ? (ui.flying ? '遁光' : '疾行') : '步行', tip: `走 / 跑切换（轻点 ${keyLabel(bindOf('run'))}；御剑时为遁光加速）`, on: ui.run, go: () => { audio.sfx('click'); game.input.run = !game.input.run; game.updateUI(true); } },
  ];
  const outer: RingBtn[] = [
    { k: 'char', t: '修', n: '角色', tip: `角色 / 冲关（${keyLabel(bindOf('char'))}）`, glow: !!(ui.pendingTalent || ui.bottleneck !== 'none'), go: go('char') },
    { k: 'bag', t: '袋', n: '储物', tip: `储物袋（${keyLabel(bindOf('bag'))}）`, go: go('bag') },
    { k: 'skills', t: '术', n: '法术', tip: `法术书（${keyLabel(bindOf('skills'))}）`, go: go('skills') },
    { k: 'map', t: '图', n: '地图', tip: `世界地图（${keyLabel(bindOf('map'))}）`, go: go('map') },
    ...(ui.dunkong ? [{ k: 'dunkong', t: '梭', n: dunkongLabel(ui.dunkong), tip: `遁空：催动遁空梭破空疾行，再按收势（${keyLabel(bindOf('dunkong'))}）`, on: ui.dunkong.phase !== 'idle', go: () => game.dunkong.toggle() }] : []),
  ];
  const items = drawerItems(game, ui, open, false);
  const alert = items.some((b) => b.badge || b.glow);
  const ang = (i: number, n: number) => (n <= 1 ? 225 : 180 + (90 * i) / (n - 1));
  return (
    <div className={'action-bar ring' + (drawer ? ' drawer-open' : '')}>
      <div className="ring-mini">
        <button className="round-btn small mini" onClick={() => { audio.sfx('click'); game.zoomBy(1.25); }} title={`放大（${keyLabel(bindOf('zoomIn'))}）`}>＋</button>
        <button className="round-btn small mini" onClick={() => { audio.sfx('click'); game.zoomBy(0.8); }} title={`缩小（${keyLabel(bindOf('zoomOut'))}）`}>－</button>
        <SeaButtons game={game} />{/* 收官 B3：灵舟、下潜、上浮（只在海上出现） */}
        {ui.flying && <>
          <RoundBtn small b={{ k: 'up', t: '升', n: ui.altBand, tip: `上升（按住；${ascendLabel()}）——离地 ${ui.alt}`, go: () => { /* 按住才升 */ }, hold: (d) => { game.input.climb = d; } }} />
          <RoundBtn small b={{ k: 'dn', t: '降', n: '下降', tip: `下降（按住；${keyLabel(bindOf('descend'))}）`, go: () => { /* */ }, hold: (d) => { game.input.climb = d ? -1 : 0; } }} />
        </>}
      </div>
      {inner.map((b, i) => <span key={b.k} className="ring-slot inner" style={{ ['--a' as string]: ang(i, inner.length) + 'deg', ['--i' as string]: i } as CSSProperties}><RoundBtn b={b} /></span>)}
      {outer.map((b, i) => <span key={b.k} className="ring-slot outer" style={{ ['--a' as string]: ang(i, outer.length) + 'deg', ['--i' as string]: i + 3 } as CSSProperties}><RoundBtn b={b} small /></span>)}
      <Tooltip tip={`更多功能（${keyLabel(bindOf('hudmore'))}）`}>
        <button className={'ring-core round-btn' + (drawer ? ' active' : '') + (alert && !drawer ? ' alert' : '')} onClick={() => { audio.sfx(drawer ? 'click' : 'open'); setDrawer((o) => !o); }} aria-expanded={drawer}>
          <span className="rc-ico" aria-hidden><i /><i /><i /></span><small>{drawer ? '收起' : '更多'}</small>
        </button>
      </Tooltip>
      <div className="more-drawer" aria-hidden={!drawer}>
        <div className="md-head"><span>诸般法门</span></div>
        <div className="btn-grid">
          {items.map((b) => <RoundBtn key={b.k} small mod={b.k.startsWith('mod:')} b={{ ...b, go: () => { setDrawer(false); sfxOpen(); b.go(); } }} />)}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 手机：功能抽屉
export function TouchDock({ game, ui, open, onClose }: { game: Game; ui: UIState; open: PanelOpener; onClose: () => void }) {
  const items = drawerItems(game, ui, open, true);
  return (
    <div className="dock-mask" onClick={onClose}>
      <div className="dock-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="dock-head"><span className="dock-title">诸般法门</span><button className="close-btn" onClick={onClose} aria-label="关闭">×</button></div>
        <div className="dock-grid">
          {items.map((b, i) => (
            <button key={b.k} data-k={b.k} className={'dock-item' + (b.glow ? ' glow' : '') + (b.on ? ' on' : '')} style={{ ['--i' as string]: i } as CSSProperties}
              onClick={() => { sfxOpen(); onClose(); b.go(); }}>
              <span className="di-t">{b.t}</span>
              <span className="di-n">{b.n}</span>
              {b.badge ? <i className="btn-badge">{b.badge}</i> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 量 HUD 占位（给画布上的摊主招牌避让、引导气泡挑位置）
/** 各区和区外几块浮着的近战按钮 */
const HZ_ROOTS = '[data-hz] > *, .hud > .bx-stance, .hud > .bx-pad, .hud > .bx-hud, .hud > .bx-chase, .hud > .bx-clash';
/**
 * 第五轮：往下找「真画了东西」的块——有底色 / 底图 / 边框的、按钮、画布、摇杆——找到就记它的框，不再往里找；
 * 透明的容器（任务列、侧边一列、法诀盘、情境提示的外壳）只是排版用的，往里找它的孩子。
 * 以前整区一块（竖屏上任务列那一区、法诀盘那一块几乎铺满画面），摊主招牌躲无可躲、一个都不画。
 */
function hudBlocks(el: Element, clip: DOMRect | null, out: HudRect[], rr: DOMRect, depth: number): void {
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return;
  const r = el.getBoundingClientRect();
  if (r.width < 3 || r.height < 3) return;
  const painted = el.tagName === 'BUTTON' || el.tagName === 'CANVAS' || el.tagName === 'INPUT' || cs.backgroundImage !== 'none' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
  const kids = el.children;
  if (painted || depth > 6 || !kids.length) {
    if (!painted && !(el.textContent ?? '').trim()) return;   // 空的透明壳
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    if (clip) { x0 = Math.max(x0, clip.left); y0 = Math.max(y0, clip.top); x1 = Math.min(x1, clip.right); y1 = Math.min(y1, clip.bottom); }
    if (x1 - x0 < 3 || y1 - y0 < 3) return;
    out.push({ x0: x0 - rr.left, y0: y0 - rr.top, x1: x1 - rr.left, y1: y1 - rr.top, soft: cs.pointerEvents === 'none' });
    return;
  }
  const c2 = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? r : clip;
  for (const k of kids) hudBlocks(k, c2, out, rr, depth + 1);
}
export function useHudRects(rootRef: { current: HTMLElement | null }) {
  useEffect(() => {
    const measure = () => {
      const root = rootRef.current; if (!root) return;
      const rr = root.getBoundingClientRect(), out: HudRect[] = [];
      for (const el of root.querySelectorAll<HTMLElement>(HZ_ROOTS)) {
        const zone = el.parentElement, zs = zone && zone.hasAttribute('data-hz') ? getComputedStyle(zone) : null;
        hudBlocks(el, zs && (zs.overflowY !== 'visible' || zs.overflowX !== 'visible') ? zone!.getBoundingClientRect() : null, out, rr, 0);
      }
      setHudRects(out);
    };
    measure();
    const t = window.setInterval(measure, 300);
    return () => { window.clearInterval(t); setHudRects([]); };
  }, [rootRef]);
}
