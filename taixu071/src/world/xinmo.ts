// 第十八步：心魔劫——结丹、结婴时，按你一路走来的经历生成幻境
import type { Game } from './game';
import type { DNode, DOpt } from './modal';
import * as C from './cultivation';
import { BEAUTIES } from '../data/beauties';
import { REALMS } from '../data/realms';
import { ACTIVE_WORLD } from '../data/world';

interface Trial { id: string; title: string; text: string; opts: { label: string; v: number; after: string }[] }

const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class XinMo {
  constructor(private game: Game) {}
  /** 是否需要过心魔关（筑基→结丹 3 关、结丹→元婴 5 关、元婴→化神初期 6 关天道问心） */
  needed() { const h = this.game.hero; return C.bottleneck(h, ACTIVE_WORLD) === 'major' && h.realm >= 2 && h.realm <= 4; }

  private trials(): Trial[] {
    const g = this.game, h = g.hero, ws = g.ws, out: Trial[] = [];
    // 杀孽
    if (h.kills >= 30 || ws.rep < -20) out.push({ id: 'kill', title: '血河', text: `你盘坐在一条血河中央。\n\n河面浮起一张张脸——死在你手下的${h.kills}条性命，有妖兽，有修士，有些你连名字都没问。它们齐声问你：值得吗？`, opts: [
      { label: '「修仙路上，本就是你死我活。」', v: 0.025, after: '血河翻涌了一下，慢慢沉了下去。你的心没有动。' },
      { label: '「因果我一力担之，但求大道无悔。」', v: 0.035, after: '那些脸一张张闭上眼睛，散成点点红光。' },
      { label: '（运功强行镇压）', v: -0.10, after: '血河越压越高，没过了你的胸口。法力剧烈逆冲！' },
    ] });
    // 红颜
    const comp = BEAUTIES.find((b) => ws.hearts[b.id]?.flags.companion && !ws.hearts[b.id]?.flags.parted);
    const close = comp ?? BEAUTIES.filter((b) => (ws.hearts[b.id]?.favor ?? 0) >= 40).sort((a, b) => ws.hearts[b.id].favor - ws.hearts[a.id].favor)[0];
    if (close) { const fv = ws.hearts[close.id].favor; out.push({ id: 'love', title: '红尘', text: `${close.name}站在你面前，眼里含着泪。\n\n「别修了。你这一闭关，又是几十年。我等不起了……留下来，就做一对凡人夫妻，好不好？」\n\n她的手是暖的。`, opts: [
      { label: '（抱住她）「好。」', v: -0.12, after: '怀里的人化作一缕黑烟。你猛然惊醒，嘴角溢出一丝血。' },
      { label: '「你不是她。」（并指为剑，斩下）', v: 0.025, after: '幻影碎成万千光点。心口却空了一块。' },
      ...(fv >= 70 ? [{ label: '「她不会这样说。她会说——去吧，我等你。」', v: 0.045, after: `幻影怔住，然后笑了，笑得和真的${close.name}一模一样，慢慢淡去。\n\n你心中一片澄明。` }] : []),
    ] }); }
    // 邹大夫
    out.push({ id: 'mo', title: '旧人', text: '一间昏暗的药庐。邹大夫坐在灯下，脸上爬满黑色的纹路。\n\n「好徒儿……你的身子，借为师用一用。为师待你不薄吧？」\n\n他伸出枯瘦的手，按向你的天灵盖。', opts: [
      { label: '「你早已死了，邹居义。」', v: 0.03, after: '药庐连同老人一起塌成灰烬。青玄门的钟声远远传来，又散了。' },
      { label: '（出手抢先杀他）', v: -0.02, after: '杀心骤起，正中心魔下怀——旧影虽散，灵台却起了一丝涟漪。' },
      { label: '（后退一步）「师父……」', v: -0.11, after: '那只手按了下来。你惊出一身冷汗，丹田剧震！' },
    ] });
    // 寿元
    out.push({ id: 'age', title: '白发', text: `你看见自己——${Math.floor(h.age) + 120}岁的自己，白发枯坐在一间破洞府里，寿元将尽，境界寸步未进。\n\n他抬头看你：「你逃不掉的。资质如此，再怎么熬，也不过是我这样。」`, opts: [
      { label: '「那便走到油尽灯枯的那一步再看。」', v: 0.03, after: '老人愣了愣，叹口气，闭上了眼睛。' },
      { label: '「我有问道残卷，岂会同你一样！」', v: -0.05, after: '老人嗤笑一声：「恃外物者，先失本心。」——你心头猛地一沉。' },
      { label: '（心生恐惧，加快运功）', v: -0.11, after: '灵力在经脉里疯狂冲撞，你险些当场走火入魔。' },
    ] });
    // 问道残卷
    out.push({ id: 'bottle', title: '残卷', text: '问道残卷悬在你面前，卷尾滴落着墨露。\n\n一个声音在耳边低语：「有它在，何必出生入死？躲在洞府里一滴墨露一株化三，种出满山灵药，闭关一千年便能成仙。」', opts: [
      { label: '（深以为然，伸手去拿瓶子）', v: -0.12, after: '瓶子在你指尖碎成了沙。避世贪安之念反噬神魂，灵台剧痛！' },
      { label: '「不历生死风浪，温室之中岂有真仙？」', v: 0.035, after: '瓶子沉默地落回你怀里，化作温润清光。' },
    ] });
    // 散修出身 / 宗门
    if (ws.sect) out.push({ id: 'sect', title: '同门', text: '宗门被围，师兄弟一个个倒下。有人朝你喊：「苏师弟！快来救——」\n\n可你正在冲关的紧要关头。', opts: [
      { label: '（明辨真妄，守一不移）', v: 0.03, after: '喊声越来越远。幻境里的血是假的——你知道。' },
      { label: '（中断冲关，冲出去）', v: -0.10, after: '洞府外一片寂静，什么都没有。你的灵力已经散了一半。' },
    ] });
    // 大道独行（结婴 / 化神）
    if (h.realm >= 3) out.push({ id: 'solitude', title: '孤峰', text: '你立于万丈寒峰之巅，脚下故人、师长、同辈尽皆化作累累白骨。\n\n风雪中有声音叹息：「越往上走，世间便越无人唤你的名字。千年孤寂，与囚笼何异？」', opts: [
      { label: '「吾辈求道，本就是向天争命、独行万里。」', v: 0.035, after: '寒风顿止，云海之上一轮孤月清辉万里。' },
      { label: '（怅然回首，心生倦意）', v: -0.11, after: '一步回望，万丈孤峰轰然崩塌，神魂直坠无底深渊！' },
    ] });
    // 结婴专属：碎丹
    if (h.realm === 3) out.push({ id: 'dan', title: '碎丹', text: '金丹在丹田里裂开一道惊心动魄的缝。\n\n结婴，便是要亲手把苦修百年的金丹彻底震碎。一旦碎了却凝不成元婴，百年苦功化为乌有！', opts: [
      { label: '「不破不立——给我碎！」', v: 0.04, after: '你神念如锤，金丹轰然崩解，漫天金芒向丹田中心坍缩凝聚！' },
      { label: '（留三分余地，护住残丹）', v: -0.14, after: '瞻前顾后乃结婴大忌！裂缝歪斜，狂暴灵力反噬心脉！' },
    ] });
    // 化神专属：天道法则问心
    if (h.realm >= 4) {
      out.push({ id: 'law', title: '天堑', text: '苍穹之上降下无数灰色法则锁链，将整个人界死死封锁。\n\n恢弘天音震响识海：「人界浊世，元气早绝。尔一介凡胎妄窥化神，便是逆天而行，当受神魂俱灭之罚！」', opts: [
        { label: '「天若封路，我便以元神斩开一线天！」', v: 0.03, after: '你元婴昂首长啸，识海之中剑意冲霄，硬生生逼退漫天灰雾！' },
        { label: '「顺应天命，暂敛神魂以求全身。」', v: -0.16, after: '灰色锁链瞬间缠紧元婴，化神契机几近断绝！' },
      ] });
      out.push({ id: 'ego', title: '真我', text: '天地元气灌入识海，你的神念瞬间暴涨百倍，山川草木皆在一念之间。\n\n你几乎分不清自己究竟还是那个从青玄门走出的苏寒，还是高高在上的天道本身。', opts: [
        { label: '「借天地元气，修我自身真灵——我仍是苏寒！」', v: 0.035, after: '泥丸宫中一点灵光定住乾坤，万千杂念尽数臣服。' },
        { label: '（放任神念融于天地法则之中）', v: -0.18, after: '神魂险些被浩瀚天地同化消融，惊醒时已是一身冷汗！' },
      ] });
    }
    return out;
  }

  /** 开始心魔劫。完成后调用 done(bonus) */
  start(done: (bonus: number) => void) {
    const g = this.game, h = g.hero;
    const n = h.realm >= 4 ? 6 : h.realm === 3 ? 5 : 3;
    const pool = shuffle(this.trials());
    const finaleId = h.realm >= 4 ? 'ego' : h.realm === 3 ? 'dan' : '';
    const fi = finaleId ? pool.findIndex((t) => t.id === finaleId) : -1;
    let finale: Trial | null = null;
    if (fi >= 0) finale = pool.splice(fi, 1)[0];
    if (h.realm >= 4) {
      const li = pool.findIndex((t) => t.id === 'law');
      if (li > 0) pool.unshift(pool.splice(li, 1)[0]);
    }
    const list = pool.slice(0, finale ? n - 1 : n);
    if (finale) list.push(finale);
    let bonus = 0;
    const maxBonus = h.realm >= 4 ? 0.12 : h.realm === 3 ? 0.14 : 0.16;
    const realmTitle = h.realm === 4 ? '化神初期 · 天道问心' : (h.realm > 4 ? (REALMS[h.realm + 1]?.name ? `${REALMS[h.realm + 1].name} · 天道问心` : '破界 · 天道问心') : (REALMS[h.realm + 1]?.name ?? ''));
    const head = { speaker: '心魔', title: `心魔大劫 · ${realmTitle}`, mood: 'danger' as const };
    const step = (i: number): DNode => {
      if (i >= list.length) {
        const clamped = Math.max(-0.45, Math.min(maxBonus, bonus));
        return {
          ...head,
          title: '心魔劫 · 破妄',
          text: `重重幻境轰然剥落，天地间骤起狂风雷鸣！\n\n${clamped >= 0.10 ? '道心澄澈如镜，万邪不侵！' : clamped > 0 ? '道心尚稳，勉强守住灵台清明。' : clamped > -0.10 ? '心神摇曳，气息已见紊乱！' : '心魔蚀骨，经脉逆乱，此番冲关凶多吉少！'}\n\n（心魔劫结算：冲关成功率 ${clamped >= 0 ? '+' : ''}${Math.round(clamped * 100)}%）`,
          options: [{ label: '（引动天象，死战破境！）', tone: 'gold', act: () => { done(clamped); return null; } } as DOpt],
        };
      }
      const t = list[i];
      return {
        ...head,
        title: `心魔劫 · ${t.title}（${i + 1}/${list.length}）`,
        text: t.text,
        options: shuffle(t.opts.slice()).map((o) => ({
          label: o.label,
          act: () => {
            bonus += o.v;
            return {
              ...head,
              title: `心魔劫 · ${t.title}`,
              text: `${o.after}\n\n${o.v > 0 ? '（道心稳固 ↑）' : '（心神动摇 ↓↓）'}`,
              options: [{ label: '……', act: () => step(i + 1) }],
            };
          },
        } as DOpt)),
      };
    };
    g.openDialog(step(0));
  }
}
