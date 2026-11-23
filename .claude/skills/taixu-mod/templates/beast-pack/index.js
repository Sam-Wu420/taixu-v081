// 模板：妖兽包——新妖兽 + 专属掉落材料 + 用材料换的丹药（演示 takeItem / giveItem / kill 事件）。把 mymod 换成你的模组 id。
/** @param {import('../../../../mods/sdk/taixu-mod').ModAPI} api */
export default function setup(api) {
  api.content.items([
    { id: 'mymod_lin', name: '赤焰蜥鳞', type: 'material', tier: 1, price: 60, glyph: '鳞', stack: true, desc: '赤焰蜥背上的鳞片，摸上去发烫。三片可换一枚赤焰丹。' },
    { id: 'mymod_dan', name: '赤焰丹', type: 'pill', tier: 2, price: 500, glyph: '丹', stack: true, desc: '以赤焰蜥鳞炼成，服下修为精进、气血回复。', pill: { exp: 600, hp: 0.5 } },
  ]);
  api.content.enemies([
    {
      id: 'mymod_xi', name: '赤焰蜥', kind: 'beast', lv: [2, 3],
      look: { body: 'croc', color: [170, 70, 40], belly: [230, 180, 120], accent: [255, 140, 60], size: 1.1, spikes: true, eye: 'rgba(255,200,60,0.95)', glow: '255,140,60' },
      minDanger: 1, maxDanger: 5, zone: 'arid',
      hp: 1.0, atk: 0.9, def: 1.1, speed: 140,
      melee: { range: 70, power: 1.2, cd: 1.4 },
      ranged: { fx: 'flame', color: '255,130,50', range: 380, power: 1.0, cd: 3.2, speed: 520, status: { k: 'burn', dur: 3, ch: 0.5 } },
      pack: [1, 2],
      drops: [{ id: 'mymod_lin', ch: 0.8 }, { id: 'mat_yaodan2', ch: 0.5 }, { id: 'mat_lingshi', ch: 0.6, n: [4, 12] }],
    },
  ]);
  api.icon('mymod_dan', 'dan.png');

  api.on('start', (g) => {
    if (api.store.get('told')) return;
    api.store.set('told', true);
    g.toast('传闻荒漠里出了一种会喷火的赤焰蜥，它的鳞片能炼丹。', 'info');
  });
  // 每打死一只，看鳞片够不够三片，够了就换一枚丹（演示：takeItem 要检查返回值）
  api.on('kill', (g, e) => {
    if (e.id !== 'mymod_xi') return;
    if (g.bagCount('mymod_lin') >= 3 && g.takeItem('mymod_lin', 3)) {
      g.giveItem('mymod_dan', 1);
      g.toast('三片赤焰蜥鳞在掌心熔成一枚赤焰丹。', 'good');
    }
  });
}
