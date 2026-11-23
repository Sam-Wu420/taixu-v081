// 模板：法术包——注册法术（自动生成卷轴）+ 配图标。把所有 mymod 换成你的模组 id。
/** @param {import('../../../../mods/sdk/fanren-mod').ModAPI} api */
export default function setup(api) {
  api.content.arts([
    {
      id: 'mymod_leiyinjian', name: '雷音剑', school: '雷', tier: 2, realm: 2,
      cast: 'bolt', fx: 'lightning', mp: 0.12, cd: 3.5, power: 2.0, range: 680, speed: 950, pierce: true,
      status: { k: 'shock', dur: 0.8, ch: 0.35 },
      color: '170,190,255',
      desc: '剑出如雷，穿透一线之敌，中者麻痹。',
      evo: ['剑速更快', '多出一道剑雷', '剑雷化作雷龙，麻痹必中'], lvCount: [1, 1, 2, 2],
    },
    {
      id: 'mymod_leiyinhuti', name: '雷音护体', school: '雷', tier: 1, realm: 1,
      cast: 'shield', fx: 'lightning', mp: 0.1, cd: 18, power: 0.25, range: 0, dur: 10,
      status: { k: 'shock', dur: 0.6, ch: 0.5 },
      color: '190,200,255',
      desc: '雷光护身，挡下一部分伤害，近身之敌受雷震。',
      evo: ['护盾更厚', '持续更久', '护盾碎裂时雷光四射'],
    },
  ]);
  api.icon('mymod_leiyinjian', 'icon.png');
  api.icon('mymod_leiyinhuti', 'icon.png');
}
