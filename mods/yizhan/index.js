/** @param {import('../sdk/taixu-mod').ModAPI} api */
// 茶寮驿站：相邻两座城镇（城池、集镇、宗门）之间的路边，各有一间茶寮或驿站。
// 兼容：游戏 v0.56（模组接口 v3）上是一座小小的路边集镇（自带客栈住店、酒楼打听消息）；
//       接口 v4 起是专门的路边小站（一间屋、茶桌、灯笼；驿站多一座马棚）。

// 位置（地图坐标）——按原版地点事先算好：相邻城镇连线的中点，避开别的地点
// [id, 名字, 地图, x, y, 是否驿站, 一头的地点 id, 名字, 另一头 id, 名字]
const SPOTS = [
  ["yizhan_t0", "长亭茶寮", "tiannan", 666, 221, 0, "tiantian", "镇天城", "huayi", "归意门"],
  ["yizhan_t1", "望乡茶寮", "tiannan", 562, 366, 0, "zijin", "赤霞城", "baiqiao", "天工院"],
  ["yizhan_t2", "青石驿", "tiannan", 763, 514, 1, "qingniu", "白石镇", "yanling", "鸿翎堡"],
  ["yizhan_t3", "飞鸿驿", "tiannan", 667, 286, 1, "zijin", "赤霞城", "huayi", "归意门"],
  ["yizhan_t4", "秋原驿", "tiannan", 411, 358, 1, "luoyun", "栖云宗", "hehuan", "天欢宗"],
  ["yizhan_t5", "竹林茶寮", "tiannan", 851, 432, 0, "huangfeng", "青霞谷", "lingshou", "驭兽山"],
  ["yizhan_t6", "石桥茶寮", "tiannan", 360, 429, 0, "hehuan", "天欢宗", "yinluo", "幽罗宗"],
  ["yizhan_t7", "歇马茶寮", "tiannan", 310, 477, 0, "yuling", "役灵宗", "yinluo", "幽罗宗"],
  ["yizhan_t8", "凉棚茶寮", "tiannan", 790, 578, 0, "qingniu", "白石镇", "huadao", "断刀坞"],
  ["yizhan_t9", "寒山驿", "tiannan", 818, 485, 1, "qingniu", "白石镇", "tainan", "南屏山"],
  ["yizhan_t10", "黄沙驿", "tiannan", 663, 467, 1, "yanyue", "凝霜宗", "cheqi", "青骊城"],
  ["yizhan_t11", "柳荫茶寮", "tiannan", 733, 448, 0, "yuejing", "梁京", "yanling", "鸿翎堡"],
  ["yizhan_t12", "听雨茶寮", "tiannan", 822, 360, 0, "lingshou", "驭兽山", "yuanwu", "定武城"],
  ["yizhan_t13", "长风驿", "tiannan", 738, 392, 1, "yanling", "鸿翎堡", "yuanwu", "定武城"],
  ["yizhan_d0", "望川驿", "dajin", 413, 530, 1, "yejia", "叶家", "qinzhou", "秦州城"],
  ["yizhan_d1", "白马驿", "dajin", 514, 596, 1, "yejia", "叶家", "shuozhou", "朔州城"],
  ["yizhan_d2", "落雁驿", "dajin", 587, 723, 1, "tianlan", "天穹圣殿", "shuozhou", "朔州城"],
  ["yizhan_d3", "云阳驿", "dajin", 407, 318, 1, "tianmo", "天魔宗", "youzhou", "幽州城"],
  ["yizhan_d4", "清溪驿", "dajin", 793, 326, 1, "taiyi", "太一门", "yunzhou", "云州城"],
  ["yizhan_d5", "古道驿", "dajin", 642, 599, 1, "jin_fangshi", "落霞坊市", "caojia", "曹家"],
];
const PRICE = { tea: 2, post: 3 };   // 歇脚一日
const TEA_TALK = ['「这条道上前些日子有人看见妖狼，客官赶夜路可得当心。」', '「茶是山上自己采的，不值什么钱，解渴。」', '「早年这里还是荒坡，后来过路的修士多了，才搭起这间棚子。」', '「客官是修道之人吧？眼神和我们凡人不一样。」', '「前头那座城最近不太平，听说有魔道的人出没。」', '「歇够了再走，路还长着呢。」'];

export default function setup(api) {
  const v4 = api.apiVersion >= 4;
  const spots = SPOTS.map(([id, name, map, x, y, post, aId, aName, bId, bName]) => ({ id, name, map, x, y, post: !!post, a: { id: aId, name: aName }, b: { id: bId, name: bName } }));
  const byId = Object.fromEntries(spots.map((s) => [s.id, s]));
  api.content.locations(spots.map((s) => ({
    id: s.id, name: s.name, map: s.map, x: s.x, y: s.y, danger: 1,
    // v4：路边小站；v3：小集镇（缩小一半）
    type: v4 ? 'inn' : 'town', scale: 0.5, look: s.post ? 'post' : 'tea', label: s.post ? '驿站' : '茶寮', seal: s.post ? '驿' : '茶',
    desc: s.post ? `${s.a.name}与${s.b.name}之间的官驿。换马、歇脚、打听消息都在这里，也能雇车直送两头。` : `${s.a.name}往${s.b.name}的路边，一间茶寮，几张粗木桌，过往行人在此歇脚。`,
  })));
  const ids = spots.map((s) => s.id), posts = spots.filter((s) => s.post).map((s) => s.id);
  const pay = (g, n) => g.takeItem('mat_lingshi', n);

  // 歇脚、打听消息：v3 的集镇本来就有「客栈」「酒楼」，只在 v4 的小站里另加
  if (v4) {
    api.content.townAction({ id: 'rest', seal: '歇', name: '歇脚一日', desc: '要一间小屋睡上一夜，气血法力尽复', where: ids, act: (g, loc) => {
      const s = byId[loc.id], p = s.post ? PRICE.post : PRICE.tea;
      if (!pay(g, p)) return { speaker: '掌柜', text: `住一夜 ${p} 块灵石。客官囊中……怕是不太方便？`, options: [{ label: '告辞' }] };
      g.rest(1);
      return { speaker: '掌柜', text: `（你在${s.post ? '驿舍' : '茶寮后头的小屋'}里睡了一夜）\n\n天亮了，窗外有鸡叫。气血法力都已恢复。\n\n「客官慢走，路上小心。」`, options: [{ label: '起身' }] };
    } });
    api.content.townAction({ id: 'news', seal: '讯', name: '打听消息', desc: '和邻桌的过路人搭话：近处的机缘、坊间的传闻', where: ids, act: (g, loc) => { g.tavern(loc.id); } });
  }
  // 来壶粗茶
  api.content.townAction({ id: 'tea', seal: '茶', name: '来壶粗茶', desc: '一块灵石，解渴，顺便和掌柜聊两句', where: ids, act: (g) => {
    if (!pay(g, 1)) return { speaker: '掌柜', text: '一壶茶一块灵石……要不，先喝碗凉水？', options: [{ label: '多谢' }] };
    g.heal(0.15, 0.25);
    return { speaker: '掌柜', text: `（一壶粗茶下肚，精神一振）\n\n${TEA_TALK[Math.floor(Math.random() * TEA_TALK.length)]}`, options: [{ label: '再坐会儿' }] };
  } });
  // 驿站：雇车
  api.content.townAction({ id: 'cart', seal: '车', name: '雇车', desc: '坐驿站的马车，直送道路两头的城镇', where: posts, act: (g, loc) => {
    const s = byId[loc.id];
    const trip = (to) => {
      const t = g.location(to.id), here = g.location(loc.id);
      if (!t || !here) return { label: `去${to.name}（路断了）`, disabled: true };
      const d = Math.hypot(t.x - here.x, t.y - here.y) / 300, cost = Math.max(5, Math.round(d * 0.4)), days = Math.max(1, Math.round(d / 40));
      return { label: `去${to.name}（${cost} 灵石，约 ${days} 日）`, disabled: g.bagCount('mat_lingshi') < cost, act: () => {
        if (!pay(g, cost)) return;
        if (g.rest) g.rest(days); else g.heal(1, 1);   // v3 没有「过几日」，车上睡一觉、气血回满
        if (!g.teleport(t.x, t.y + 240)) g.teleport(t.x + 240, t.y);
        g.toast(`坐了 ${days} 日马车，到了${to.name}。`, 'good');
      } };
    };
    return { speaker: '车把式', text: '「要走哪头？马车稳当，路上睡一觉就到了。」', options: [trip(s.a), trip(s.b), { label: '不坐了' }] };
  } });
}
