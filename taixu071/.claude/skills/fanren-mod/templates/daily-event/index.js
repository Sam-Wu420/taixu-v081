// 模板：随时间发生的随机事件。day 回调约每半天一次、天数可能是小数——自己累计到间隔再触发。把 mymod 换成你的模组 id。
const EVERY = 5;          // 平均每几天一次
const CHANCE = 0.6;       // 到点后触发的几率

const EVENTS = [
  (g) => g.dialog({
    speaker: '游方郎中', text: '一个背着药篓的郎中凑过来：「仙长，上好的回气丹，十块灵石一枚，童叟无欺！」',
    options: [
      { label: '买一枚（10 灵石）', act: () => { if (g.takeItem('mat_lingshi', 10)) { g.giveItem('pill_huiqi', 1); g.toast('得回气丹 ×1。', 'good'); } else g.toast('灵石不够。', 'warn'); } },
      { label: '摆摆手走开' },
    ],
  }),
  (g) => g.dialog({
    speaker: '迷路的孩童', text: '路边一个小孩抽抽搭搭地哭，说跟家人走散了。',
    options: [
      { label: '送他回村', tone: 'jade', act: () => { g.giveItem('mat_lingshi', 5); g.toast('孩子的父母千恩万谢，硬塞给你几块碎灵石。', 'good'); } },
      { label: '指个方向，自己走吧' },
    ],
  }),
  (g) => { g.toast('路边一块残碑上刻着半句口诀，你默念几遍，似有所悟。', 'info'); g.giveItem('pill_juqi', 1); },
];

/** @param {import('../../../../mods/sdk/fanren-mod').ModAPI} api */
export default function setup(api) {
  api.on('day', (g, days) => {
    const acc = (api.store.get('acc') ?? 0) + days;
    if (acc < EVERY) { api.store.set('acc', acc); return; }
    api.store.set('acc', 0);
    if (Math.random() > CHANCE) return;
    const i = Math.floor(Math.random() * EVENTS.length);
    try { EVENTS[i](g); } catch (e) { api.log('事件出错', e); }   // 自己兜一层：一个事件写错不至于累计出错停用整个模组
  });
}
