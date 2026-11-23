// 收官 I（甲）：新手引导的步骤机。挂成 game.tutorial，主循环每帧 tick(dt)（暂停、开着面板时也走，储物袋那步要在面板里教）。
//
// 三块：
//   · 入门一课（全新开局自动开始，场景在青霞谷）：移动与镜头 → 交谈 → 储物袋穿装备 → 丹药进快捷栏并服下 → 木人桩（法术，再进架势打一套）
//     → 打坐回气 → 御剑升降落地 → 世界地图 → 宗门差事 → 成。每步「说什么、指哪里、等什么」：
//       说什么：title / text（键位一律从 keymap 取；电脑、触屏各一套说法）；
//       指哪里：界面元素（CSS 选择器，可带一串备选、可要求按钮文字含某几个字）、世界里的点（地上光圈 + 屏幕边缘的方向箭头）、屏幕矩形；
//       等什么：尽量读已有状态（game.ui、modal、袋里物品、穿戴、快捷栏、玩家位移、飞 / 坐、近战 log）——不改别的系统的逻辑。
//   · 情境小课：第一次遇到时才教（摆摊、秘境、无边海、拼招、被追杀、虚空、筑基后的欺身、结丹后的缩地）；灵舟、海渊留了接口 trigger(id)。
//   · 任务列常驻一条「下一步」（ui/questSlot 的 setQuestEntries）：上课时是当前这一步；下课后按境界、进度给一两条建议。
//
// 存档：进度在 ws.tut（可选字段，存档版本不升）。旧存档读进来没有这个字段 = 入门一课视为已上过（不打扰老玩家）。
// 随机数：一个都不取。发的装备用 addGearItem 带固定词条（空），不走摇词条的随机数；木人桩用 brawl.spawnDummy，不取随机数。
// 模组：装了自带引导的「清界」（qingjie）时入门一课和「下一步」让位；?auto=new（shahe 新局直接入阵、试玩入口）不自动开课（App 管）。
// 出错：tick 整体包在 try 里，引导出岔子绝不能弄坏主循环（模组无头环境里也一样）。
import type { Game } from './game';
import type { WorldState } from './worldstate';
import type { Enemy } from './combat';
import * as C from './cultivation';
import { itemDef } from '../data/items';
import { ARTS } from '../data/arts';
import { REALMS } from '../data/realms';
import { SLOT_NAME, type EquipSlot, type GearSlot } from '../data/gear';
import { LOC_BY_ID, WORLD_SCALE, locHere } from '../data/world';
import { ascendLabel, bindOf, keyLabel } from '../core/keymap';
import { isTouch } from '../core/touch';
import { audio } from './audio';
import { setQuestEntries, type QuestEntry } from '../ui/questSlot';

// ---------------------------------------------------------------- 类型
/** 界面元素：sel 是 CSS 选择器（逗号分隔的都算），has 要求元素文字里含这几个字；drop 是「拖到哪」的第二个记号 */
export interface UiPick { sel: string; has?: string }
export type CoachTarget =
  | { kind: 'ui'; picks: UiPick[]; drop?: UiPick }
  | { kind: 'world'; x: number; y: number; h?: number; name?: string }
  | { kind: 'screen'; get: () => { x0: number; y0: number; x1: number; y1: number } | null }
  | null;
export type CoachBtn = 'skip' | 'next' | 'ok' | 'hide';
export interface CoachView {
  /** 内容变了才变（Coach 据此重画气泡） */
  key: string;
  lesson: 'main' | 'ctx';
  title: string;
  text: string;
  /** 这一步的几个小目标（打勾） */
  checks?: { t: string; ok: boolean }[];
  /** 第几步 / 共几步（入门一课）；情境小课是第几页 */
  idx: number; total: number;
  target: CoachTarget;
  /** 指着界面元素时要不要压暗四周 */
  dim: boolean;
  /** 气泡放哪：auto 跟着目标；top 顶部居中；corner 左下角（开着地图时，不挡地图的题字和图）；
   *  side 靠屏幕边上的空位（第五轮：打斗中弹出的情境小课，不占画面中间） */
  place: 'auto' | 'top' | 'corner' | 'side';
  /** 正在打斗（有锁定的敌人、刚挨打或刚出手的几息内）：气泡一律避开画面中间 */
  fight?: boolean;
  /** 只留一条小胶囊（对话框开着时） */
  quiet: boolean;
  buttons: CoachBtn[];
}
export interface TutSave {
  v: 1;
  /** 入门一课正在上 */
  on: boolean;
  /** 当前步骤 id */
  step: string;
  /** 上完了 / 跳过了 */
  done: boolean; skipped: boolean;
  /** 已上过的情境小课 */
  ctx: string[];
  /** 发过的东西（重看时不重复发） */
  gearUid?: number;
}
type WS = WorldState & { tut?: TutSave };

interface StepView { text: string; target?: CoachTarget; checks?: { t: string; ok: boolean }[]; dim?: boolean; place?: 'auto' | 'top' | 'corner'; quiet?: boolean; buttons?: CoachBtn[] }
interface Step {
  id: string;
  title: string;
  /** 进这一步时（发东西、摆木人桩、记下起点） */
  enter?(t: Tutorial): void;
  /** 每 0.1 秒一次：更新这一步自己的小状态 */
  update?(t: Tutorial, dt: number): void;
  view(t: Tutorial): StepView;
  done(t: Tutorial): boolean;
  /** 目标不存在：直接跳到下一步 */
  skip?(t: Tutorial): boolean;
  /** 离开这一步（完成、跳过、整课跳过）时收拾 */
  leave?(t: Tutorial): void;
}
interface CtxPage { title: string; text: string; target?: CoachTarget; /** 这一页眼下已经不用讲了（要它做的事已经做了）：自动翻到下一页 */ skip?: () => boolean }
interface CtxLesson { id: string; name: string; when(t: Tutorial): boolean; pages(t: Tutorial): CtxPage[]; /** 条件没了就收起（拼招打完了） */ keep?(t: Tutorial): boolean }

const K = (id: string) => id === 'ascend' ? ascendLabel() : keyLabel(bindOf(id));   // 上升：御剑时是闪避键（默认空格）
/** 任务列里那一条只放第一句（气泡里才是全文） */
const shortOf = (s: string) => { const t = s.split(/[。；\n]/)[0]; return t.length > 30 ? t.slice(0, 29) + '…' : t; };
const ui = (sel: string, has?: string): UiPick => ({ sel, has });
const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** 引导自己发的那件装备：挑一个空着的新槽位（都穿满了就给腰带） */
const GEAR_TRY: [string, EquipSlot][] = [['gear_belt_0', 'belt'], ['gear_wrist_0', 'wrist'], ['gear_ring_0', 'ring'], ['gear_crown_0', 'crown'], ['gear_pendant_0', 'pendant']];
const PILL = 'pill_huiqi';
/** 触屏：先开「≡ 菜单」，再点抽屉里的某一格 */
function dockPick(t: Tutorial, k: string, name: string): { text: string; target: CoachTarget } {
  return t.dock
    ? { text: `点「${name}」。`, target: { kind: 'ui', picks: [ui(`.dock-item[data-k="${k}"]`)] } }
    : { text: `点右侧的「≡ 菜单」，再点「${name}」。`, target: { kind: 'ui', picks: [ui('.dock-main')] } };
}
/** 打开储物袋这一小步（两种设备） */
function openBag(t: Tutorial, why: string): StepView {
  if (t.touch) { const d = dockPick(t, 'bag', '储物袋'); return { text: why + d.text, target: d.target, dim: true }; }
  return { text: `${why}按 ${K('bag')}（或点右下的「袋」）打开储物袋。`, target: { kind: 'ui', picks: [ui('[data-k="bag"]')] }, dim: true };
}

// ---------------------------------------------------------------- 入门一课
function mainSteps(): Step[] {
  return [
    {
      id: 'move', title: '行走与镜头',
      enter(t) { const p = t.g.player; t.snap = { x: p.x, y: p.y, z: t.zoomN, moved: false, zoomed: false }; },
      update(t) { const s = t.snap, p = t.g.player; if (near(p, s as { x: number; y: number }) > 260) s.moved = true; if (t.zoomN !== s.z) s.zoomed = true; },   // 只认玩家自己缩放（进城时镜头自动拉近不算）
      view(t) {
        const checks = [{ t: '走几步', ok: !!t.snap.moved }, { t: '拉近 / 拉远镜头', ok: !!t.snap.zoomed }];
        return t.touch
          ? { text: '用左下的摇杆走几步（推到底是疾行）；两根手指在画面上捏合，把镜头拉近拉远。', target: { kind: 'ui', picks: [ui('.joystick')] }, checks }
          : { text: `用 ${K('up')} ${K('left')} ${K('down')} ${K('right')} 走几步；滚动鼠标滚轮（或 ${K('zoomIn')} / ${K('zoomOut')}、右下的 ＋ －）把镜头拉近拉远。`, target: { kind: 'ui', picks: [ui('.ring-mini')] }, checks };
      },
      done: (t) => !!(t.snap.moved && t.snap.zoomed),
    },
    {
      id: 'talk', title: '与人交谈',
      enter(t) { t.snap = { npc: t.pickNpc(), saw: false }; },
      skip: (t) => !t.snap.npc,
      update(t) {
        const s = t.snap; if (t.g.modal?.kind === 'dialog') s.saw = true;
        if (!s.saw && !t.g.npcs.active.get(s.npc)) s.npc = t.pickNpc() ?? s.npc;   // 走远了被收起来：换最近的一位
      },
      view(t) {
        const s = t.snap;
        if (s.saw) return { text: '听他说完，选一句回话，或者离开。说完话就进下一课。', place: 'top', quiet: true };
        const a = t.g.npcs.active.get(s.npc), name = a?.d.name ?? '那位修士';
        const w: CoachTarget = a ? { kind: 'world', x: a.st.x, y: a.st.y, h: 150, name } : null;
        if (t.g.ui?.talk) return t.touch
          ? { text: '点右侧的「谈」（或直接点他），和他说话。', target: { kind: 'ui', picks: [ui('.talk-btn')] }, dim: true }
          : { text: `按 ${K('interact')}（或点下面这条）和他说话。`, target: { kind: 'ui', picks: [ui('.talk-tip')] } };
        return { text: t.touch ? `走到「${name}」跟前（地上有光圈），点他一下就能交谈。` : `走到「${name}」跟前（地上有光圈），按 ${K('interact')} 和他说话。`, target: w };
      },
      done: (t) => !!t.snap.saw && !t.g.modal,
    },
    {
      id: 'gear', title: '穿上装备',
      enter(t) { t.ensureGear(); },
      view(t) {
        const s = t.S!, b = t.gearItem(); const name = b ? itemDef(b.id).name : '装备', slot = b ? C.slotOf(b.id) : null, sn = slot ? SLOT_NAME[slot] : '装备';
        if (t.panel !== 'bag') return openBag(t, `师门发下一件「${name}」。`);
        const cell = ui(`[data-uid="${s.gearUid}"]`), tab = ui('.inv-tabs button', '装备');
        return t.touch
          ? { text: `点一下「${name}」选中，再点下面的「穿上」。`, target: { kind: 'ui', picks: [ui('[data-act="wear"]'), cell, tab] }, dim: true }
          : { text: `把「${name}」从格子里拖到「${sn}」槽上穿好（双击、右键也行）。`, target: { kind: 'ui', picks: [cell, tab], drop: ui(`[data-drop="slot:${slot}"]`) }, dim: true };
      },
      done: (t) => !!t.gearItem()?.worn,
    },
    {
      id: 'pill', title: '丹药进快捷栏',
      enter(t) { if (C.bagCount(t.g.hero, PILL) < 1) C.addItem(t.g.hero, PILL, 2); t.snap = { n0: -1 }; },
      update(t) { const i = t.g.hero.hotbar.indexOf('pill:' + PILL); if (i >= 0 && t.snap.n0 < 0) t.snap.n0 = C.bagCount(t.g.hero, PILL); },
      view(t) {
        const h = t.g.hero, i = h.hotbar.indexOf('pill:' + PILL);
        const checks = [{ t: '放进快捷栏', ok: i >= 0 }, { t: '服下一颗', ok: false }];
        if (i < 0) {
          if (t.panel !== 'bag') return { ...openBag(t, '回气丹能救急——先把它放进快捷栏。'), checks };
          const cell = ui(`[data-id="${PILL}"]`), tab = ui('.inv-tabs button', '丹药');
          return t.touch
            ? { text: '换到「丹药」页，点一下「回气丹」，再点「放入快捷栏」。', target: { kind: 'ui', picks: [ui('[data-act="hotbar"]'), cell, tab] }, dim: true, checks }
            : { text: '换到「丹药」页，把「回气丹」拖到下面快捷栏最右那一格。', target: { kind: 'ui', picks: [cell, tab], drop: ui('.inv-hb .inv-hbc:last-child') }, dim: true, checks };
        }
        if (t.panel === 'bag') return { text: t.touch ? '放好了。点右上角 × 关上储物袋。' : '放好了。关上储物袋（Esc 或右上角 ×）。', target: { kind: 'ui', picks: [ui('.lq-modal.inv .lq-close')] }, dim: true, checks };
        const slot = { kind: 'ui' as const, picks: [ui(`.hotbar .hb-slot:nth-child(${i + 1})`)] };
        return t.touch
          ? { text: '点法诀盘上的回气丹，服下一颗——法力见底时就这么救急。', target: slot, dim: true, checks }
          : { text: `按 ${K('slot' + (i + 1))} 服下一颗回气丹——法力见底时就这么救急。`, target: slot, dim: true, checks };
      },
      done: (t) => t.snap.n0 >= 0 && C.bagCount(t.g.hero, PILL) < t.snap.n0,
    },
    {
      id: 'spell', title: '施法',
      enter(t) { t.spawnDummy(); t.snap = { hp0: t.dummy?.hp ?? 0 }; },
      update(t) { t.keepDummy(); },
      view(t) {
        const id = t.g.hero.hotbar[0], nm = id && ARTS[id] ? `「${ARTS[id].name}」` : '';
        const w: CoachTarget = t.dummy ? { kind: 'world', x: t.dummy.x, y: t.dummy.y, h: 120, name: '木人桩' } : null;
        return t.touch
          ? { text: `面前立着一只木人桩。点法诀盘第一格${nm}施法——法术自己会找最近的目标；想打别的，点敌人或按『锁』锁定。`, target: { kind: 'ui', picks: [ui('.hotbar.pad .hb-slot:nth-child(1)')] }, dim: false }
          : { text: `面前立着一只木人桩。按 ${K('slot1')} 放一记${nm}——法术会自动锁定最近的目标（淡金环）。`, target: w };
      },
      done: (t) => !!t.dummy && t.dummy.hp < t.snap.hp0 - 1e-6,
    },
    {
      id: 'brawl', title: '贴身斗法',
      enter(t) {
        const B = t.g.combat.brawl; if (!B.log) { B.log = []; t.ownLog = true; }
        t.snap = { at: B.log.length, sub: 0, heavyMiss: false };
        if (!t.dummy) t.spawnDummy();
      },
      update(t) {
        t.keepDummy();
        const B = t.g.combat.brawl, s = t.snap, subs = t.brawlSubs(), d = t.dummy;
        const log = (B.log ?? []).slice(s.at);
        const k = subs[s.sub];
        const hits = (ks: string[]) => log.filter((l) => ks.includes(l.k) && (!d || l.who === d.name)).length;
        let ok = false;
        if (k === 'stance') ok = B.stance;
        // 第五轮：连拳这一关要真把罡气打空（木人桩破罡）才过——以前数三下就过，下一句却说「罡气打空了」，木人桩其实还剩一截，点「崩」被判没空。
        // 万一怎么都打不破（比如木人被轰远了又刷新），连中八拳也放行，下一句按实情说「罡气回上来了，再连几拳」。
        else if (k === 'light') ok = (!!d && B.body(d).breakT > 0) || hits(['light', 'finisher']) >= 8;
        else if (k === 'heavy') { const n = hits(['heavy']); ok = n > 0 && !!d && (B.flung === d || B.body(d).air); if (n > 0 && !ok) s.heavyMiss = true; }
        else if (k === 'rush') ok = hits(['rush']) > 0;
        else if (k === 'pursue') ok = hits(['pursuit']) > 0;
        else if (k === 'unstance') ok = !B.stance;
        if (ok && s.sub < subs.length) { s.sub++; s.at = (B.log ?? []).length; s.heavyMiss = false; if (s.sub < subs.length) t.ding(false); }
        if (B.log && B.log.length > 400 && t.ownLog) { B.log.splice(0, 300); s.at = Math.max(0, s.at - 300); }   // 自己开的 log，别让它一直长
      },
      view(t) {
        const subs = t.brawlSubs(), s = t.snap, k = subs[Math.min(s.sub, subs.length - 1)], T = t.touch, B = t.g.combat.brawl;
        const NAME: Record<string, string> = { stance: '进架势', light: '连拳', heavy: '崩山轰飞', rush: '化虹欺身', pursue: '缩地追击', unstance: '收势' };
        const checks = subs.map((x, i) => ({ t: NAME[x], ok: i < s.sub }));
        const w: CoachTarget = t.dummy ? { kind: 'world', x: t.dummy.x, y: t.dummy.y, h: 120, name: '木人桩' } : null;
        const later = t.g.hero.realm < 2 ? '\n（化虹欺身到筑基、缩地追击到结丹才使得出来，到时候会再教你。）' : t.g.hero.realm < 3 ? '\n（缩地追击要到结丹，到时候会再教你。）' : '';
        const btn = (cls: string): CoachTarget => ({ kind: 'ui', picks: [ui(cls)] });
        const V: Record<string, StepView> = {
          stance: T ? { text: '近战另有一套：点右下的「架」进入近战架势（手里有兵器就用兵器，空着手是拳脚）。', target: btn('.bx-stance') } : { text: `近战另有一套：按 ${K('brawl')}（或鼠标中键）进入近战架势（手里有兵器就用兵器，空着手是拳脚）。`, target: w },
          light: T ? { text: '连点「轻」出拳，把木人桩的罡气（顶上目标框里那条）打空。', target: btn('.bx-btn.light') } : { text: '鼠标左键连出拳，把木人桩的罡气（顶上目标框里那条）打空。', target: w },
          // 说法跟着木人桩眼下的罡气走：正破着罡就叫你轰，罡气回上来了（破罡只维持一两息）就叫你再连几拳
          heavy: (() => {
            const broken = !!t.dummy && B.body(t.dummy).breakT > 0;
            const lead = broken ? '罡气打空了——趁它破罡，' : s.heavyMiss ? '罡气还没空，轰不动——先再连几拳把它打空，再' : '罡气又回上来了——先再连几拳把它打空，再';
            return T ? { text: lead + '点「崩」一记崩山，把它轰飞！（长按「崩」能拖动定方向）', target: btn('.bx-btn.heavy') } : { text: lead + '鼠标右键一记崩山，把它轰飞！它朝鼠标所指之处飞；按住右键能定向——时间放慢、箭头跟着鼠标，松开出手。', target: w };
          })(),
          rush: T ? { text: '点「欺」化虹欺身，一闪扑到它跟前。', target: btn('.bx-btn.rush') } : { text: `按 ${K('run')} 化虹欺身，一闪扑到它跟前。`, target: w },
          pursue: T ? { text: '再把它轰飞，趁它还在倒飞点「追」缩地追上去。（长按「崩」时点「升」是上挑，追上去就到它头顶往下砸。）', target: btn('.bx-btn.pursue') } : { text: `再把它轰飞，趁它还在倒飞按 ${K('dodge')} 缩地追上去再打。（出手时按住 ${K('ascend')} 是上挑，追上去就到它头顶往下砸。）`, target: w },
          unstance: T ? { text: '打完一套。点「收」收势。' + later, target: btn('.bx-stance') } : { text: `打完一套。再按 ${K('brawl')}（或鼠标中键）收势。` + later, target: w },
        };
        return { ...V[k], checks, dim: false };
      },
      done: (t) => t.snap.sub >= t.brawlSubs().length,
      leave(t) { if (t.ownLog) { t.g.combat.brawl.log = null; t.ownLog = false; } t.coveredBrawl(); },
    },
    {
      id: 'sit', title: '打坐回气',
      enter(t) { t.snap = { sat: 0 }; },
      update(t, dt) { if (t.g.player.sitting) t.snap.sat += dt; },
      view(t) {
        const checks = [{ t: '坐满三息', ok: t.snap.sat >= 3 }];
        if (t.g.player.sitting) return { text: '盘膝坐下，法力气血慢慢回满，修为也在涨。再坐一会儿……', checks };
        if (t.touch) { const d = dockPick(t, 'sit', '坐'); return { text: '打了一架，坐下回口气：' + d.text, target: d.target, dim: true, checks }; }
        return { text: `打了一架，坐下回口气：按 ${K('sit')}（或右下的「坐」）打坐。`, target: { kind: 'ui', picks: [ui('[data-k="sit"]')] }, dim: true, checks };
      },
      done: (t) => t.snap.sat >= 3,
      leave(t) { t.removeDummy(); },
    },
    {
      id: 'fly', title: '御剑',
      enter(t) { t.snap = { sub: 0, top: 0 }; },
      update(t) {
        const p = t.g.player, s = t.snap;
        if (s.sub === 0 && p.flying) s.sub = 1;
        if (s.sub === 1 && p.flying && p.zTarget >= 96) { s.sub = 2; s.top = p.zTarget; t.ding(false); }
        if (s.sub === 2) { s.top = Math.max(s.top, p.zTarget); if (p.zTarget <= s.top - 30 || !p.flying) { s.sub = 3; t.ding(false); } }
        if (s.sub === 3 && !p.flying) s.sub = 4;
        if (s.sub >= 1 && s.sub < 3 && !p.flying) s.sub = 0;   // 半路落地了：从头来
      },
      view(t) {
        const s = t.snap, T = t.touch;
        const checks = ['起飞', '升高', '压低', '落地'].map((x, i) => ({ t: x, ok: s.sub > i }));
        const tg = (sel: string): CoachTarget => ({ kind: 'ui', picks: [ui(sel)] });
        if (s.sub === 0) { if (T) { const d = dockPick(t, 'fly', '剑'); return { text: '御剑：' + d.text, target: d.target, dim: true, checks }; } return { text: `按 ${K('fly')}（或右下的「剑」）御剑而起。`, target: tg('[data-k="fly"]'), dim: true, checks }; }
        if (s.sub === 1) return T ? { text: '按住摇杆上方的「升」往高处飞。', target: tg('.climb-pad .up'), dim: true, checks } : { text: `按住 ${K('ascend')}（或右下的「升」）往高处飞。`, target: tg('[data-k="up"]'), dim: true, checks };
        if (s.sub === 2) return T ? { text: '按住「降」压低一些。', target: tg('.climb-pad .dn'), dim: true, checks } : { text: `按住 ${K('descend')}（或「降」）压低一些。`, target: tg('[data-k="dn"]'), dim: true, checks };
        if (T) { const d = dockPick(t, 'fly', '落地'); return { text: '落地：' + d.text, target: d.target, dim: true, checks }; }
        return { text: `再按 ${K('fly')} 落地。`, target: tg('[data-k="fly"]'), dim: true, checks };
      },
      done: (t) => t.snap.sub >= 4,
    },
    {
      id: 'map', title: '世界地图',
      enter(t) { t.snap = { saw: false }; },
      update(t) { if (t.panel === 'map') t.snap.saw = true; },
      view(t) {
        if (t.panel === 'map') return { text: t.touch ? '两指缩放、拖动平移，看看南荒有多大。看完点右上角 × 关上。' : '滚轮缩放、拖动平移，看看南荒有多大。看完按 Esc 或右上角 × 关上。', place: 'corner' };
        return { text: t.touch ? '点右上的小地图，打开世界地图。' : `按 ${K('map')}（或点右上的小地图）打开世界地图。`, target: { kind: 'ui', picks: [ui('.minimap-wrap')] }, dim: true };
      },
      done: (t) => !!t.snap.saw && t.panel !== 'map',
    },
    {
      id: 'sect', title: '宗门差事',
      enter(t) { t.snap = { guide0: t.g.guide }; },
      skip(t) { return !t.sectHere(); },
      view(t) {
        const g = t.g, L = locHere(g.ws.sect?.id)!, m = g.modal;
        if (m?.kind === 'dialog' && m.node?.speaker === L.name) return { text: '挑一件差事点它——地图上就会给你指路；做完回这里交差，换宗门贡献。', target: { kind: 'ui', picks: [ui('.dlg-opt', '任务：'), ui('.dlg-opt', '交付')] }, dim: true };
        if (m?.kind === 'town' && m.loc?.id === L.id) return { text: '点「宗门事务」，看看任务堂贴了什么差事。', target: { kind: 'ui', picks: [ui('.town-fac[data-fac="sect"]'), ui('.town-fac', '宗')] }, dim: true };
        if (m) return { text: '先把眼前这个窗口关了。', place: 'top', quiet: true };
        if (g.ui?.nearby?.id === L.id) return { text: t.touch ? `点下面的「进入」，进${L.name}办事。` : `按 ${K('town')}（或点「进入」）进${L.name}办事。`, target: { kind: 'ui', picks: [ui('.loc-card .ink-btn')] }, dim: true };
        return { text: `回${L.name}山门（地上有光圈），进宗门接一件差事。`, target: { kind: 'world', x: L.x * WORLD_SCALE, y: L.y * WORLD_SCALE, h: 60, name: L.name } };
      },
      done(t) { const gd = t.g.guide; return !!gd && gd !== t.snap.guide0 && !!t.g.ws.sect?.tasks.some((x) => x.text === gd.name); },
    },
    {
      id: 'end', title: '入门一课 · 成',
      enter(t) { t.snap = { ok: false, t: 0 }; },
      update(t, dt) { t.snap.t += dt; },
      view(t) {
        return { text: `往后的路你自己走。左侧任务列最上面那条「下一步」会按你的境界出主意；卡住了${t.touch ? '点「≡ 菜单」里的「指南」' : `按 ${K('help')} 翻修仙指南`}。这一课在「设置」里能重看。`, target: { kind: 'ui', picks: [ui('.qc-slot.k-guide'), ui('.quest-col')] }, buttons: ['ok'] };
      },
      done: (t) => !!t.snap.ok || t.snap.t > 20,
    },
  ];
}

// ---------------------------------------------------------------- 情境小课
function ctxLessons(): CtxLesson[] {
  return [
    {
      id: 'stall', name: '摆摊',
      when: (t) => !t.g.offWorld && t.stallSign() !== null,
      pages: (t) => [
        { title: '摆摊的修士', text: t.touch ? '头顶挂着招牌的是摆摊的修士。点招牌（或走过去点他）就能看他摊上的货。' : `头顶挂着招牌的是摆摊的修士。点招牌（或走到他跟前按 ${K('interact')}）就能看他摊上的货。`, target: { kind: 'screen', get: () => t.stallSign() }, skip: () => t.g.modal?.kind === 'stall' },   // 总审：摊位窗口已经开着就不讲「点招牌」了
        { title: '讨价还价', text: '摊上的价钱能还；还得太狠他会翻脸。你的东西也能卖给他——摊主的身家是真的，没钱就收不起。', target: t.g.modal?.kind === 'stall' ? { kind: 'ui', picks: [{ sel: '.lq-btn, button', has: '还价' }] } : undefined },
      ],
    },
    {
      id: 'mijing', name: '秘境',
      when: (t) => { const gt = t.g.mijing.gate; return t.g.mijing.active || (!!gt && near(gt, t.g.player) < 700); },
      pages: (t) => {
        const gt = t.g.mijing.gate;
        return [
          { title: '秘境', text: '云门开了：走进去就是秘境——一块块开阔的石台浮在云里，分内外两圈，越往里越凶，宝也越好。', target: gt && !t.g.mijing.active ? { kind: 'world', x: gt.x, y: gt.y, h: 80, name: '云门' } : null },
          { title: '进出自如', text: '秘境里妖物成群地刷，右上换成节点小图。打不过就走回云门出来；没打完的下次还能回去。' },
        ];
      },
    },
    {
      id: 'wubian', name: '无边海',
      when: (t) => !!t.g.jueyu.hud.show,
      // 收官 B4：别界的险地是同一套规矩换了介质（流沙、冰海、熔岩、冥河、瘴泽），小课的名字、天象、落进去的说法都按这一处的配置取
      pages: (t) => {
        const P = t.g.jueyu.profile, nm = P?.name ?? '无边海', M = P?.medium, W = P?.weather, sea = !M || M.kind === 'sea';
        const hurt = !!M && (M.burn > 0 || M.chill > 0 || M.toxic > 0);
        return [
          { title: nm, text: `你进了${nm}${P?.local ? '' : '的深处'}。罗盘上金色的「岸」指着最近的岸；越往里分带越凶，${W?.storm.name ?? '飓风'}、${W?.ghost.name ?? '鬼雾'}、${W?.rift.name ?? '空间裂缝'}一层比一层狠。`, target: { kind: 'ui', picks: [ui('.jy-compass')] } },
          { title: '灵力流失', text: `这里法力会一点点漏掉，飞得越久越亏——一定留够回程的法力。${sea ? '避水、抗风的装备能少吃些苦头。' : hurt ? `${M!.name}还伤人，气血也要留意。` : ''}` },
          sea ? { title: '落水', text: '法力耗尽就会落进海里泅水：只剩小招式能用，游到能起飞的地方再飞。罗盘的「岸」是你的命。' }
            : { title: `落进${M!.name}`, text: `法力耗尽就会掉进${M!.name}里：只剩小招式能用${M!.burn > 0 ? '，还会一直掉血' : ''}，挣到能起飞的地方再飞。罗盘的「岸」是你的命。` },
        ];
      },
    },
    {
      id: 'clash', name: '拼招',
      when: (t) => !!t.g.combat.brawl.clash.st,
      keep: (t) => !!t.g.combat.brawl.clash.st,
      pages: (t) => [{ title: '拼招', text: t.touch ? '两边的招撞上了！三选一：攻克破、破克卸、卸克攻——点一张。平手就连点拼力气。' : `两边的招撞上了！三选一：攻克破、破克卸、卸克攻——按 ${K('left')} / ${K('up')} / ${K('right')} 选。平手就连按拼力气。`, target: { kind: 'ui', picks: [ui('.bx-clash')] } }],
    },
    {
      id: 'pursuit', name: '被追杀',
      when: (t) => t.g.pursuit.active,
      pages: (t) => [
        { title: '被追杀', text: '有人盯上你了！顶上这条是他离你多远——拉开够远就算甩掉。', target: { kind: 'ui', picks: [ui('.pursuit')] } },
        { title: '怎么逃', text: `打不过就跑：御剑、疾行、敛息（${t.touch ? '「≡ 菜单」里点「敛息」' : K('conceal')}）都能拉开距离；逃进城镇宗门，他就不敢明着动手。` },
      ],
    },
    {
      id: 'xukong', name: '虚空',
      when: (t) => t.g.xukong.active && !!t.g.ui?.xukong,   // 第六轮返工：等顶上的读数出来了再教（刚冲出天穹那几息读数还没有，气泡指了个空）
      pages: (t) => [
        // 第六轮返工：实拍查了一遍——第一页指着顶上那块读数（原来不指），第二页指着「降」（触屏是摇杆上方那颗）
        { title: '虚空', text: '你飞出了天穹，进了虚空。顶上的读数写着你在哪、离哪一界最近。', target: { kind: 'ui', picks: [ui('.xukong-read')] } },
        { title: '回到界内', text: `对准下方的一界，${t.touch ? '按住摇杆上方的「降」' : `按住 ${K('descend')}（或右下的「降」）`}落下去就回到界内。虚空兽很凶，别恋战。`, target: { kind: 'ui', picks: [ui(t.touch ? '.climb-pad .dn' : '[data-k="dn"]')] } },
      ],
    },
    // 第六轮返工：入门一课说「欺身到筑基、缩地到结丹，到时候再教」——原来要等下回进了架势才教，不进架势就一直不出。
    // 现在突破那一刻（关了闭关、突破的窗口，不在打斗里、不在天上）就弹；人正在架势里，指着那颗键教，不在就先说怎么进架势
    {
      id: 'rush', name: '化虹欺身',
      when: (t) => t.g.hero.realm >= 2 && (t.g.combat.brawl.stance || t.calm()),
      pages: (t) => { const on = t.g.combat.brawl.stance; return [{ title: '化虹欺身', text: (t.touch ? '筑基了，近战多一式：点「欺」化作一道长虹扑到锁定的对手跟前，撞上就破防；御剑时对手比你高、比你低都扑得到。' : `筑基了，近战多一式：按 ${K('run')} 化作一道长虹扑到锁定的对手跟前，撞上就破防；御剑时对手比你高、比你低都扑得到。`) + (on ? '' : t.touch ? '（先点右下的「架」进近战架势。）' : `（先按 ${K('brawl')} 或鼠标中键进近战架势。）`), target: t.touch ? { kind: 'ui', picks: [ui(on ? '.bx-btn.rush' : '.bx-stance')] } : null }]; },
    },
    {
      id: 'suodi', name: '缩地追击',
      when: (t) => t.g.hero.realm >= 3 && (t.g.combat.brawl.stance || t.calm()),
      pages: (t) => { const on = t.g.combat.brawl.stance; return [{ title: '缩地追击', text: (t.touch ? '结丹了：一记崩山把人轰飞，趁他还在倒飞点「追」，一步缩地截到他前头再打，一次最多追三下。长按「崩」时点「升」把人挑上天，再点「追」就瞬移到他头顶往下砸。' : `结丹了：一记崩山把人轰飞，趁他还在倒飞按 ${K('dodge')}，一步缩地截到他前头再打，一次最多追三下。出手时按住 ${K('ascend')} 把人挑上天，再按 ${K('dodge')} 就瞬移到他头顶往下砸。`) + (on ? '' : t.touch ? '（先点右下的「架」进近战架势。）' : `（先按 ${K('brawl')} 或鼠标中键进近战架势。）`), target: t.touch ? { kind: 'ui', picks: [ui(on ? '.bx-btn.pursue' : '.bx-stance')] } : null }]; },
    },
    // 灵舟、海渊：第一次上船、第一次沉到水下时教
    {
      id: 'lingzhou', name: '灵舟', when: (t) => !!t.g.jueyu?.boat?.aboard,   // 第一次上船时教（world/lingzhou.ts）
      pages: (t) => [
        { title: '灵舟', text: '你上了灵舟。船上灵力流失只剩一小半，坐下打坐还能回气——飞累了就落到船上歇一程。' },
        { title: '护好船', text: t.touch ? '船有耐久：触须缠船、飓风巨浪都会伤它，耐久见底船就碎、人落水。被缠住就推摇杆划桨挣开，或斩断那条触须。点「舟」收船。' : `船有耐久：触须缠船、飓风巨浪都会伤它，耐久见底船就碎、人落水。被缠住就按方向键划桨挣开，或斩断那条触须。按 ${K('boat')} 收船，按 ${K('fly')} 收船起飞。` },
      ],
    },
    {
      id: 'haiyuan', name: '海渊', when: (t) => !!t.g.jueyu?.underwater,   // 第一次沉到水下时教（world/haiyuan.ts）
      pages: (t) => [
        { title: '海渊', text: '你沉进了海渊。水下行动慢、闭气耗灵力；越深水压越大，避水不够就掉血——右边的读数写着你有几成避水、这里要几成。' },
        { title: '上浮', text: t.touch ? '点「浮」往上游，露出海面就出来了。海底有古魔遗迹和灵药，带够避水的装备、避水珠再往深处去。' : `按住 ${K('ascend')} 往上游，露出海面就出来了。海底有古魔遗迹和灵药，带够避水的装备、避水珠再往深处去。` },
      ],
    },
  ];
}

const MAIN_KEY = 'taixu.tut.ctx';
/** 情境小课开关（设置里改；存本机，不进存档） */
export function ctxLessonsOn(): boolean { try { return localStorage.getItem(MAIN_KEY) !== '0'; } catch { return true; } }
export function setCtxLessonsOn(on: boolean): void { try { localStorage.setItem(MAIN_KEY, on ? '1' : '0'); } catch { /* 隐私窗口 */ } }

// ---------------------------------------------------------------- 步骤机
export class Tutorial {
  readonly steps = mainSteps();
  readonly lessons = ctxLessons();
  /** GameView 告诉我们开着哪个面板（bag / map / settings……）、手机菜单抽屉开没开 */
  panel = '';
  dock = false;
  /** 装着的模组 id（App 里覆盖成读 modHost；测试里可以直接改） */
  modIds: () => string[] = () => { try { return (((globalThis as Record<string, unknown>).__modHost as { mods?: { b?: { manifest?: { id?: string } } }[] } | undefined)?.mods ?? []).map((m) => m?.b?.manifest?.id ?? ''); } catch { return []; } };
  /** 触屏（测试里可以强制） */
  forceTouch: boolean | null = null;
  get touch(): boolean { return this.forceTouch ?? isTouch(); }
  /** 每一步自己的小状态 */
  snap: Record<string, any> = {};
  /** 木人桩 */
  dummy: Enemy | null = null;
  ownLog = false;
  /** 盖章计数（Coach 看它变了就盖一次「成」） */
  stampK = 0;
  /** 收起气泡（只留任务列那一条） */
  collapsed = false;
  /** 二次确认跳过 */
  askSkip = false;
  private ws: WorldState | null = null;
  private stepId = '';
  private acc = 0; private nextAcc = 1;
  private ctxCur: { id: string; i: number; t: number; side?: boolean } | null = null;   // side：这一课弹出时正在打斗（之后一直靠边，不跟着打斗时有时无来回跳）
  private subs = new Set<() => void>();
  private view: CoachView | null = null;
  private viewSig = '';
  private warned = false;
  private nextSig = '';

  /** 玩家自己缩放镜头的次数（滚轮、＋－、捏合、键盘都走 setZoom；进城自动拉近直接改 targetZoom，不算） */
  zoomN = 0;
  constructor(readonly g: Game) {
    // 只数一下、照常转给原来的 setZoom（每次现查原型上的，模组以后改了原型也照样生效）
    const self = this;
    g.setZoom = function (this: Game, z: number) { self.zoomN++; return Object.getPrototypeOf(g).setZoom.call(this, z); };
  }

  get S(): TutSave | undefined { return (this.g.ws as WS).tut; }
  /** 入门一课正在上 */
  get active(): boolean { const s = this.S; return !!s?.on && !s.done && !this.yielding; }
  /** 装了自带引导的清界：让位 */
  get yielding(): boolean { return this.modIds().includes('qingjie'); }

  // ------------------------------------------------ 对外
  /** 新开局（App 在 g.reset() 之后调）：开始入门一课 */
  begin(): void {
    (this.g.ws as WS).tut = { v: 1, on: true, step: this.steps[0].id, done: false, skipped: false, ctx: [] };
    this.ws = this.g.ws; this.stepId = ''; this.collapsed = false; this.askSkip = false;
    try { localStorage.setItem('taixu_help_seen', '1'); } catch { /* 键位提示卡不再和引导同时弹 */ }
    this.enterStep(this.steps[0]);
    this.emit();
  }
  /** 设置里「重看新手引导」 */
  replay(): void {
    const s = this.ensure(); s.on = true; s.done = false; s.skipped = false; s.step = this.steps[0].id;
    this.stepId = ''; this.collapsed = false; this.askSkip = false; this.ctxCur = null;
    this.enterStep(this.steps[0]); this.emit();
  }
  /** 跳过整课（气泡上二次确认后调） */
  skip(): void {
    const s = this.S; if (!s) return;
    this.cur?.leave?.(this); this.removeDummy();
    s.on = false; s.skipped = true; s.done = true; this.askSkip = false; this.stepId = '';
    this.g.toast('已跳过入门一课。想重看：设置 → 新手引导。', 'info');
    this.flushHeld();
    this.emit();
  }
  /** 气泡上的按钮 */
  press(b: CoachBtn | 'skip-yes' | 'skip-no' | 'expand'): void {
    if (b === 'skip') { this.askSkip = true; }
    else if (b === 'skip-no') this.askSkip = false;
    else if (b === 'skip-yes') { this.skip(); return; }
    else if (b === 'hide') this.collapsed = true;
    else if (b === 'expand') this.collapsed = false;
    else if (b === 'ok' && this.active && this.stepId === 'end') this.snap.ok = true;
    else if ((b === 'next' || b === 'ok') && this.ctxCur) {
      const L = this.lessons.find((x) => x.id === this.ctxCur!.id); const n = L ? L.pages(this).length : 0;
      if (b === 'next' && this.ctxCur.i + 1 < n) { this.ctxCur.i++; this.ctxCur.t = 0; } else this.ctxCur = null;
    }
    this.emit(true);
  }
  /** 世界线 / 主线以后接：某个情境小课的时机到了（灵舟、海渊） */
  trigger(id: string): boolean {
    const s = this.ensure(), L = this.lessons.find((x) => x.id === id);
    if (!L || s.ctx.includes(id) || !ctxLessonsOn() || this.active || this.ctxCur) return false;
    s.ctx.push(id); this.ctxCur = { id, i: 0, t: 0 }; this.emit(true); return true;
  }
  /**
   * 原来那十几条一次性 hint：入门一课教过的（开局操作、交谈、施法、御剑、进城）就不再另弹，免得两套同时冒出来；
   * 没教过的（大事记、阵盘……）上课期间先压着，下课再一条条弹（直接丢掉的话，只在某个时刻调一次的那几条就永远看不到了）。跳过了引导的照弹。
   */
  mutes(id: string, text = ''): boolean {
    if (this.yielding) return false;
    // 情境小课里讲（被追杀、秘境），别再另弹一条。第五轮：挪到「存档里有没有引导进度」之前——旧存档没有 ws.tut，
    // 以前直接放行，写死 Shift、R 的老提示和小课一起冒出来
    if ((id === 'pursuit' || id === 'mijing') && ctxLessonsOn()) return true;
    const s = this.S; if (!s) return false;
    const taught = id === 'opening' || id === 'talk' || id === 'fight' || id === 'fly' || id === 'town';
    if (this.active) { if (!taught && text && !this.held.some((x) => x.id === id)) this.held.push({ id, text }); return true; }
    return taught && s.done && !s.skipped;
  }
  private held: { id: string; text: string }[] = [];
  /** 下课了：压着的提示一条条放出来（隔两息一条，别一下子糊满） */
  private flushHeld(): void {
    const list = this.held.splice(0); let k = 0;
    for (const x of list) { k++; setTimeout(() => { try { this.g.hint(x.id, x.text); } catch { /* 读档换了局 */ } }, 1500 + k * 2200); }
  }
  subscribe(f: () => void): () => void { this.subs.add(f); return () => { this.subs.delete(f); }; }
  getView(): CoachView | null { return this.view; }
  /** 当前步骤 id（测试、截图用） */
  get step(): string { return this.active ? this.stepId : ''; }
  /** 截图 / 测试：跳到某一步 */
  jump(id: string): void {
    const i = this.steps.findIndex((x) => x.id === id); if (i < 0) return;
    const s = this.ensure(); s.on = true; s.done = false; s.skipped = false;
    this.cur?.leave?.(this); this.stepId = ''; this.collapsed = false;
    this.enterStep(this.steps[i]); this.emit(true);
  }

  // ------------------------------------------------ 每帧
  tick(dt: number): void {
    try { this.tickIn(dt); } catch (e) { if (!this.warned) { this.warned = true; console.warn('[引导] 出错，已跳过这一帧', e); } }
  }
  private tickIn(dt: number): void {
    const g = this.g;
    if (g.ws !== this.ws) { this.ws = g.ws; this.onNewWorld(); }
    this.acc += dt; this.nextAcc += dt;
    if (this.acc < 0.1) return;
    const step = this.acc; this.acc = 0;
    if (this.active && !g.hero.dead) this.mainTick(step);
    else if (this.stepId) { this.cur?.leave?.(this); this.stepId = ''; }
    this.ctxTick(step);
    if (this.nextAcc >= 1) { this.nextAcc = 0; this.nextEntries(); }
    this.emit();
  }
  /** 读档、新开局、换图：ws 换了一份 */
  private onNewWorld(): void {
    this.stepId = ''; this.ctxCur = null; this.askSkip = false; this.collapsed = false; this.dummy = null;
    if (this.ownLog) { this.g.combat.brawl.log = null; this.ownLog = false; }
    const s = this.S;
    if (s?.on && !s.done) { const st = this.steps.find((x) => x.id === s.step) ?? this.steps[0]; this.enterStep(st); }   // 读档：从存下的那一步接着上
  }
  private get cur(): Step | undefined { return this.steps.find((x) => x.id === this.stepId); }
  private enterStep(st: Step): void {
    const s = this.ensure(); s.step = st.id; this.stepId = st.id; this.snap = {}; this.askSkip = false;
    st.enter?.(this);
    if (st.skip?.(this)) this.advance(false);
  }
  private advance(stamp: boolean): void {
    const s = this.S!, cur = this.cur; cur?.leave?.(this);
    const i = this.steps.findIndex((x) => x.id === this.stepId);
    if (stamp) this.ding(true);
    if (i < 0 || i + 1 >= this.steps.length) { s.on = false; s.done = true; this.stepId = ''; this.removeDummy(); this.g.toast('入门一课 · 成。往后的路，任你纵横。', 'good'); this.flushHeld(); return; }
    this.enterStep(this.steps[i + 1]);
  }
  private mainTick(dt: number): void {
    const s = this.S!;
    if (!this.stepId || this.stepId !== s.step) { const st = this.steps.find((x) => x.id === s.step) ?? this.steps[0]; this.enterStep(st); if (!this.active) return; }
    const st = this.cur; if (!st) return;
    st.update?.(this, dt);
    if (st.done(this)) this.advance(true);
  }
  private ctxTick(dt: number): void {
    const g = this.g;
    if (this.ctxCur) {
      this.ctxCur.t += dt;
      const L = this.lessons.find((x) => x.id === this.ctxCur!.id);
      if (!L || (L.keep && !L.keep(this)) || this.ctxCur.t > 40) this.ctxCur = null;   // 拼招打完了 / 放着不管四十息：收起
      return;
    }
    if (this.active || !ctxLessonsOn() || g.hero.dead || this.panel) return;
    const s = this.S;
    for (const L of this.lessons) {
      if (s?.ctx.includes(L.id)) continue;
      let hit = false; try { hit = L.when(this); } catch { hit = false; }
      if (!hit) continue;
      this.ensure().ctx.push(L.id); this.ctxCur = { id: L.id, i: 0, t: 0 }; this.collapsed = false;
      return;
    }
  }
  /** 旧存档、跳过之后、上完之后：确保有一份 tut（只在真要写的时候建，免得往不相干的存档里塞东西） */
  private ensure(): TutSave {
    const w = this.g.ws as WS;
    return (w.tut ??= { v: 1, on: false, step: '', done: true, skipped: false, ctx: [] });
  }
  /** 第六轮返工：入门一课里已经教过的近战式（开局就是筑基 / 结丹的），情境小课里不再教一遍 */
  coveredBrawl(): void { const r = this.g.hero.realm, c = this.ensure().ctx; if (r >= 2 && !c.includes('rush')) c.push('rush'); if (r >= 3 && !c.includes('suodi')) c.push('suodi'); }
  /** 第六轮返工：眼下清闲（没有窗口、没在打斗、脚踩实地、在界内，不在虚空、秘境、险地里，没被追杀）——突破后的近战小课这时候弹 */
  calm(): boolean { const g = this.g; return !g.modal && !g.offWorld && !g.player.flying && !g.xukong.active && !g.mijing.active && !g.jueyu.hud.show && !g.pursuit.active && g.combat.combatT > 6 && !g.combat.enemies.some((e) => !e.dead && e.aggro && Math.hypot(e.x - g.player.x, e.y - g.player.y) < 1500); }
  /** 一步完成：盖「成」、叮一声 */
  ding(big: boolean): void { this.stampK++; try { audio.sfx(big ? 'chime' : 'click'); } catch { /* 无头 */ } }

  // ------------------------------------------------ 给各步用的小工具
  /** 最近的一位能说话的人（不是敌人、活着） */
  pickNpc(): string | null {
    const p = this.g.player; let best: string | null = null, bd = 4200;
    for (const [id, a] of this.g.npcs.active) {
      if (a.enemy || !a.d.alive) continue;
      const d = near(a.st, p); if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  /** 发一件装备。重看时不再发：上回发的那件还在就用它（已经穿着的先替你卸回格子里，再穿一次） */
  ensureGear(): void {
    const h = this.g.hero, s = this.ensure();
    const have = h.bag.find((b) => b.uid !== undefined && b.uid === s.gearUid);
    if (have) { if (have.worn) C.unwearGear(h, have.worn as GearSlot); return; }
    const pick = GEAR_TRY.find(([, slot]) => !C.wornIn(h, slot)) ?? GEAR_TRY[0];
    const old = h.bag.find((b) => b.id === pick[0] && !b.worn && b.uid !== undefined);
    if (old) { s.gearUid = old.uid; return; }
    C.addGearItem(h, pick[0], []);   // 带着固定（空）词条放进袋：不走摇词条的随机数
    s.gearUid = h.gearSeq;
    this.g.toast(`师门发下一件「${itemDef(pick[0]).name}」。`, 'good');
  }
  gearItem(): C.BagItem | undefined { const s = this.S; return s?.gearUid === undefined ? undefined : this.g.hero.bag.find((b) => b.uid === s.gearUid); }
  /** 摆一只木人桩：面朝的方向前面两百来步，站得住的地方 */
  spawnDummy(): void {
    const g = this.g, p = g.player, B = g.combat.brawl;
    this.removeDummy();
    let x = p.x + 230, y = p.y + 20;
    for (const [dx, dy] of [[230, 20], [-230, 20], [0, 200], [0, -200], [320, 160], [-320, -160]]) { const qx = p.x + dx, qy = p.y + dy; if (g.terrain.walkFactor(qx, qy) > 0 && !g.space.blocked(qx, qy)) { x = p.x + dx; y = p.y + dy; break; } }
    // Enemy 的构造里要取几个 Math.random（动作相位、外观）：换成引导自己的一串数，用完还回去——外面的随机数一个都不多取
    const R = Math.random; let k = 0x2545f491;
    Math.random = () => { k = (Math.imul(k, 1664525) + 1013904223) >>> 0; return k / 4294967296; };
    let e: Enemy; try { e = B.spawnDummy(x, y, 1); } finally { Math.random = R; }
    e.name = '木人桩'; e.kit = []; e.skT = 1e9;   // 木人：不放任何招式（同 tools/try-brawl.ts）
    this.dummy = e;
  }
  /** 木人桩被打没了、飞得太远（被轰飞到看不见）、被战斗系统收走：在身边重摆一只 */
  keepDummy(): void {
    const e = this.dummy, g = this.g;
    if (!e) { this.spawnDummy(); return; }
    const gone = e.dead || !g.combat.enemies.includes(e), far = near(e, g.player) > 2600 && !g.combat.brawl.body(e).air;   // 还在天上飞着的不算丢
    if (gone || far) this.spawnDummy();
  }
  removeDummy(): void {
    const e = this.dummy; this.dummy = null; if (!e) return;
    const L = this.g.combat.enemies, i = L.indexOf(e); if (i >= 0) L.splice(i, 1);
    if (this.g.combat.lock === e) this.g.combat.lock = null;
  }
  /** 近战这一步要过的几关（按境界：欺身要筑基、缩地要结丹，够不着的不教） */
  brawlSubs(): string[] { const r = this.g.hero.realm; return ['stance', 'light', 'heavy', ...(r >= 2 ? ['rush'] : []), ...(r >= 3 ? ['pursue'] : []), 'unstance']; }
  /** 宗门在本图 */
  sectHere(): boolean { return !!locHere(this.g.ws.sect?.id); }
  /** 屏幕上第一块摊主招牌（摆摊那节小课指它） */
  stallSign(): { x0: number; y0: number; x1: number; y1: number } | null {
    const hits = (this.g.stall as unknown as { hits?: { x0: number; y0: number; x1: number; y1: number }[] }).hits;
    if (!hits?.length) return null;
    const r = this.g.canvas?.getBoundingClientRect?.(), ox = r?.left ?? 0, oy = r?.top ?? 0, q = hits[0];
    return { x0: q.x0 + ox, y0: q.y0 + oy, x1: q.x1 + ox, y1: q.y1 + oy };
  }

  // ------------------------------------------------ 给 Coach 的画面
  private buildView(): CoachView | null {
    const g = this.g;
    if (g.hero.dead || g.inCave) return null;
    if (this.active) {
      const st = this.cur; if (!st) return null;
      const i = this.steps.indexOf(st), total = this.steps.length - 1;   // 「成」不算一步
      // 跟这一步无关的面板开着（设置、法术书……）：先不出来
      if (this.panel && this.panel !== 'bag' && this.panel !== 'map') return null;
      const v = st.view(this);
      if (this.askSkip) return { key: `main:${st.id}:ask`, lesson: 'main', title: '跳过入门一课？', text: '之后随时能在「设置 → 新手引导」重看。', idx: Math.min(i + 1, total), total, target: null, dim: false, place: 'auto', quiet: false, buttons: [] };
      const quiet = !!v.quiet || (g.modal?.kind === 'dialog' && !(v.target && v.target.kind === 'ui' && v.target.picks.some((p) => p.sel.startsWith('.dlg'))));
      return {
        key: `main:${st.id}:${v.text}:${(v.checks ?? []).map((c) => +c.ok).join('')}`, lesson: 'main', title: st.title, text: v.text, checks: v.checks,
        idx: Math.min(i + 1, total), total, target: v.target ?? null, dim: !!v.dim, place: v.place ?? 'auto', quiet,
        buttons: v.buttons ?? (st.id === 'end' ? ['ok'] : ['skip', 'hide']),
      };
    }
    if (this.ctxCur) {
      const L = this.lessons.find((x) => x.id === this.ctxCur!.id); if (!L) return null;
      const pages = L.pages(this);
      while (this.ctxCur.i < pages.length - 1 && pages[this.ctxCur.i].skip?.()) this.ctxCur.i++;
      const i = Math.min(this.ctxCur.i, pages.length - 1), pg = pages[i];
      // 第五轮：打斗中（有锁定的敌人、刚挨打 / 出手的几息内）弹的小课靠边放，不盖住打斗；有指着的界面元素（手机上的「欺」「追」钮）照旧贴着它，但也避开画面中间
      const fight = (this.ctxCur.side ||= this.inFight());
      return { key: `ctx:${L.id}:${i}`, lesson: 'ctx', title: pg.title, text: pg.text, idx: i + 1, total: pages.length, target: pg.target ?? null, dim: false, place: fight && !pg.target ? 'side' : 'auto', fight, quiet: false, buttons: [i + 1 < pages.length ? 'next' : 'ok'] };
    }
    return null;
  }
  /** 正在打斗：锁定着活的敌人，或刚挨打 / 出手（combat.combatT 是离上一次出手、挨打过了几息），或近战架势里身边有敌人 */
  inFight(): boolean {
    const c = this.g.combat, L = c.lock;
    return (!!L && !L.dead) || c.combatT < 4 || (!!c.brawl?.stance && c.inCombat);
  }
  private emit(force = false): void {
    const v = this.buildView();
    const sig = v ? `${v.key}|${v.quiet}|${v.place}|${this.collapsed}|${this.askSkip}|${this.stampK}` : `none|${this.stampK}`;
    if (!force && sig === this.viewSig) { this.view = v ?? null; return; }
    this.viewSig = sig; this.view = v ?? null;
    for (const f of [...this.subs]) { try { f(); } catch { /* 界面那边的错不能弄坏主循环 */ } }
  }

  // ------------------------------------------------ 任务列「下一步」
  private nextEntries(): void {
    const g = this.g;
    if (this.yielding) { this.setEntries(null); return; }
    if (this.active) {
      const st = this.cur; if (!st) return;
      const i = this.steps.indexOf(st), total = this.steps.length - 1;
      const v = st.view(this);
      this.setEntries([{ key: 'next', kind: 'guide', title: '下一步：' + st.title, text: shortOf(v.text), progress: st.id === 'end' ? '成' : `${Math.min(i + 1, total)}/${total}`, onClick: () => { this.collapsed = false; this.askSkip = false; this.emit(true); } }]);
      return;
    }
    this.setEntries(this.suggest().slice(0, 2).map((x, i) => ({ key: 'sug' + i, kind: 'guide', title: (i === 0 ? '下一步：' : '也可以：') + x.title, text: x.text, onClick: x.go })));
  }
  private setEntries(list: QuestEntry[] | null): void {
    const sig = list ? list.map((e) => e.title + e.text + e.progress).join('|') : '';
    if (sig === this.nextSig) return;
    this.nextSig = sig; setQuestEntries('guide', list);
  }
  /** 下课以后：按境界、进度给一两条「接下来可以做什么」 */
  suggest(): { title: string; text: string; go?: () => void }[] {
    const g = this.g, h = g.hero, T = this.touch, out: { title: string; text: string; go?: () => void }[] = [];
    const b = C.bottleneck(h);
    if (b !== 'none') out.push({ title: '冲关', text: T ? '修为满了：「≡ 菜单 → 角色」冲关' : `修为满了：按 ${K('char')} 打开角色面板冲关`, go: () => g.onPanel?.('char', true) });
    if (h.hp < 0.35) out.push({ title: '养伤', text: T ? '气血不足：菜单里「坐」打坐，或服疗伤丹' : `气血不足：按 ${K('sit')} 打坐，或服疗伤丹` });
    const s = g.ws.sect, task = s?.tasks.find((x) => x.until >= g.day && g.towns.taskProgress(x) < x.need);
    if (s && task) {
      const w = g.towns.taskWhere(task);
      out.push({ title: '宗门差事', text: `${task.text}（${Math.max(0, g.towns.taskProgress(task))}/${task.need}）${w.spot ? ' · ' + w.spot : ''}`, go: w.x !== undefined && w.y !== undefined ? () => g.setGuide(w.x!, w.y!, task.text) : undefined });
    }
    const done = s?.tasks.find((x) => g.towns.taskProgress(x) >= x.need);
    if (s && done) { const L = LOC_BY_ID.get(s.id); out.unshift({ title: '交差', text: `「${done.text}」办完了，回${L?.name ?? '宗门'}交差领贡献`, go: L ? () => g.setGuide(L.x * WORLD_SCALE, L.y * WORLD_SCALE, L.name) : undefined }); }
    const r = h.realm;
    if (r <= 1) out.push({ title: '筑基丹', text: C.bagCount(h, 'pill_zhuji') > 0 ? '筑基丹到手了：修为满了就冲关' : '攒宗门贡献换筑基丹，或去坊市、拍卖会碰碰运气' });
    else if (r === 2) out.push({ title: '历练', text: '筑基了：去秘境、险地历练，攒结丹的材料' });
    else if (r === 3) out.push({ title: '出海', text: '结丹了：沧溟海、无边海在等你，记得备好避水的装备' });
    else out.push({ title: `${REALMS[r]?.name ?? ''}之后`, text: '飞出天穹，去虚空里看看诸界' });
    return out;
  }
}
