// 模板：剧情任务——接任务 → 计数 → 回报领奖。进度全部存在 api.store（随存档走）。把 mymod 换成你的模组 id。
const NEED = 8;                       // 要斩杀几头
const TARGET = 'wolf';                // 原版的青背苍狼（敌人 id 见 .claude/skills/fanren-mod/reference/原版数据.md）
const REWARD = [['pill_juqi', 3], ['scroll_art_fengren', 1]];   // 奖励：原版物品

/** @param {import('../../../../mods/sdk/fanren-mod').ModAPI} api */
export default function setup(api) {
  const S = {                         // 小工具：读写任务状态
    get stage() { return api.store.get('stage') ?? 'none'; },   // none → accepted → done
    set stage(v) { api.store.set('stage', v); },
    get n() { return api.store.get('n') ?? 0; },
    set n(v) { api.store.set('n', v); },
  };

  api.on('start', (g) => {
    if (S.stage !== 'none') return;   // 读档也会触发 start，只问一次
    g.dialog({
      speaker: '老庙祝', title: '山神庙',
      text: '路边一座破败的山神庙里，老庙祝颤巍巍地拦住你：「仙长留步！近来山里狼群闹得凶，叼走了好几户的牲口……」\n\n「仙长若肯出手除掉八头青背苍狼，小老儿愿以庙中供奉相谢。」',
      options: [
        { label: '应下此事', tone: 'gold', act: () => { S.stage = 'accepted'; S.n = 0; g.toast(`接下委托：斩杀青背苍狼 0/${NEED}`, 'info'); } },
        { label: '婉拒', act: () => { S.stage = 'declined'; } },
      ],
    });
  });

  api.on('kill', (g, e) => {
    if (S.stage !== 'accepted' || e.id !== TARGET) return;
    S.n = S.n + 1;
    if (S.n < NEED) { g.toast(`青背苍狼 ${S.n}/${NEED}`, 'info'); return; }
    S.stage = 'done';
    // 第二段对话：在上一段的选项之外，直接再调一次 dialog（会排队弹出）
    g.dialog({
      speaker: '老庙祝', title: '山神庙',
      text: '狼嚎声渐渐稀了。老庙祝捧出一个旧布包：「仙长大恩！这是庙里攒下的几样东西，不成敬意。」',
      options: [{ label: '收下', tone: 'gold', act: () => { for (const [id, n] of REWARD) g.giveItem(id, n); g.news('苏寒替山神庙除了狼患。'); g.toast('得聚气丹 ×3、《风刃术》卷轴。', 'good'); } }],
    });
  });
}
