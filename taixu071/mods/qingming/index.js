// 示例模组「青冥剑修」——演示模组接口的全部用法：加法术、加物品、加妖兽、配图标、开局对话、击杀计数、存档数据。
// 打包：node tools/mod-pack.mjs mods/qingming   → dist-mods/qingming-1.0.0.fmod

/** @param {import('../sdk/fanren-mod').ModAPI} api */
export default function setup(api) {
  // —— 法术：id 以「qingming_」开头；cast / fx 用游戏现成的出手方式与特效
  api.content.arts([
    {
      id: 'qingming_jianqi', name: '青冥剑气', school: '剑', tier: 1, realm: 1,
      cast: 'fan', fx: 'sword', mp: 0.06, cd: 2.2, power: 1.25, range: 620, speed: 980, count: 3, pierce: true,
      color: '120,210,255', desc: '青冥剑修的入门剑诀：一指点出三道青色剑气，可穿透敌人。',
      evo: ['剑气更快', '多出一道剑气', '剑气化作青冥剑芒，破敌护体'], lvCount: [3, 3, 4, 5],
    },
    {
      id: 'qingming_jiangang', name: '青冥剑罡', school: '剑', tier: 2, realm: 2,
      cast: 'strike', fx: 'bigsword', mp: 0.16, cd: 9, power: 2.4, range: 720, radius: 130, count: 4,
      status: { k: 'stun', dur: 0.6, ch: 0.4 },
      color: '150,225,255', desc: '剑罡自天而降，接连斩落四道，被斩中者一时动弹不得。',
      evo: ['剑罡范围扩大', '多斩落一道', '落点留下剑痕，再震一次'],
    },
  ]);

  // —— 物品
  api.content.items([
    { id: 'qingming_dan', name: '青冥丹', type: 'pill', tier: 2, price: 600, glyph: '丹', stack: true,
      desc: '青冥剑修以雷纹狼角炼成的丹药，服下修为大涨，法力回满。', pill: { exp: 800, mp: 1 } },
    { id: 'qingming_jiao', name: '雷纹狼角', type: 'material', tier: 1, price: 45, glyph: '角', stack: true,
      desc: '雷纹狼额上的独角，隐隐有雷光游走。青冥剑修收这个。' },
  ]);

  // —— 妖兽：身形用游戏现成的程序画法（wolf / tiger / snake / eagle ……），只要给颜色、大小、发光
  api.content.enemies([
    { id: 'qingming_leilang', name: '雷纹狼', kind: 'beast', lv: [1, 2],
      look: { body: 'wolf', color: [70, 86, 120], belly: [190, 200, 230], size: 1.15, eye: 'rgba(140,220,255,0.95)', glow: '140,200,255', horn: true, accent: [170, 220, 255] },
      minDanger: 1, maxDanger: 4, hp: 0.75, atk: 0.8, def: 0.7, speed: 175,
      melee: { range: 64, power: 1.1, cd: 1.1, status: { k: 'shock', dur: 0.5, ch: 0.25 } },
      pack: [2, 3],
      drops: [{ id: 'qingming_jiao', ch: 0.7 }, { id: 'mat_yaodan1', ch: 0.4 }, { id: 'mat_lingshi', ch: 0.6, n: [2, 6] }] },
  ]);

  // —— 图标（files 里的图片）
  api.icon('qingming_jianqi', 'jianqi.png');
  api.icon('qingming_jiangang', 'jiangang.png');
  api.icon('qingming_dan', 'dan.png');

  // —— 进游戏：第一次见面，剑修传你入门剑诀
  api.on('start', (g) => {
    if (api.store.get('met')) return;
    api.store.set('met', true);
    g.dialog({
      speaker: '青冥剑修', title: '隐居的剑修',
      text: '一个背剑的青衫老者拦在路边，上下打量你一眼：「小子根骨平平，倒还有几分韧劲。老夫这门《青冥剑气》，送你了。」\n\n「最近山里多了些雷纹狼，额上的独角对老夫有用。斩够五头，回头来找老夫，有好处给你。」',
      options: [
        { label: '谢过前辈', tone: 'gold', act: () => { g.learnArt('qingming_jianqi'); g.toast('学会《青冥剑气》！（快捷栏满了的话，按 K 打开法术书放进去）', 'good'); } },
        { label: '拱手作别', act: () => { g.giveItem('scroll_art_qingming_jianqi', 1); g.toast('老者把一卷《青冥剑气》塞进你手里。', 'info'); } },
      ],
    });
  });

  // —— 击杀计数：斩雷纹狼五头，得青冥丹与《青冥剑罡》
  api.on('kill', (g, e) => {
    if (e.id !== 'qingming_leilang') return;
    const n = (api.store.get('wolves') ?? 0) + 1;
    api.store.set('wolves', n);
    if (n < 5) { g.toast(`雷纹狼 ${n}/5`, 'info'); return; }
    if (n === 5) {
      g.giveItem('qingming_dan', 1);
      g.giveItem('scroll_art_qingming_jiangang', 1);
      g.news('苏寒替青冥剑修斩了五头雷纹狼，得了一枚青冥丹与一卷《青冥剑罡》。');
      g.toast('青冥剑修传音：「好小子！」——得「青冥丹」与《青冥剑罡》卷轴。', 'good');
    }
  });
}
