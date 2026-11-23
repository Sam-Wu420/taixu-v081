/** @param {import('../sdk/taixu-mod').ModAPI} api */
export default function setup(api) {
  // 一、改原版：风刃术更利，青背苍狼成群出没
  api.content.patch.art('fengren', { power: 1.25, desc: '凝风成刃，可穿透多名敌人。雷泽异变后风刃更利。' });
  api.content.patch.enemy('wolf', { pack: [2, 4] });

  // 二、新材料与器方
  api.content.items([
    { id: 'leize_lin', name: '雷蛟鳞', type: 'material', tier: 3, price: 900, glyph: '鳞', stack: true, desc: '雷泽蛟的逆鳞，隐有雷光游走。炼器上材。' },
    { id: 'leize_fu', name: '引雷符', type: 'misc', tier: 2, price: 400, glyph: '符', stack: true, desc: '以雷蛟鳞粉绘成，可引天雷。' },
  ]);
  api.content.recipes([
    { id: 'leize_r_fu', name: '引雷符', out: 'leize_fu', outN: 2, inputs: [{ id: 'leize_lin', n: 1 }, { id: 'mat_lingshi', n: 20 }], base: 0.55, days: 2, reqRealm: 2, desc: '雷蛟鳞研粉，和灵石绘符。', kind: 'forge' },
  ]);

  // 三、新妖兽：只用专属招式
  api.content.enemies([{
    id: 'leize_jiao', name: '雷泽蛟', kind: 'beast', lv: [3, 5],
    look: { body: 'jiao', color: [60, 70, 110], belly: [170, 190, 230], size: 1.5, eye: 'rgba(160,220,255,0.95)', glow: '150,190,255' },
    minDanger: 2, maxDanger: 5, hp: 1.4, atk: 1, def: 0.9, speed: 150,
    melee: { range: 80, power: 1.2, cd: 1.3 },
    ranged: { fx: 'lightning', color: '170,190,255', range: 480, power: 0.9, cd: 3, speed: 650 },
    drops: [{ id: 'leize_lin', ch: 0.6 }, { id: 'mat_lingshi', ch: 0.8, n: [6, 14] }],
    skillsReplace: true,
    skills: [
      { id: 'leize_bao', name: '雷暴', k: 'circle', el: 'thunder', r: 130, tele: 0.9, pow: 1.9, range: 520, cd: 7, status: { k: 'shock', dur: 0.8, ch: 0.4 } },
      { id: 'leize_zhu', name: '雷矢连珠', k: 'salvo', el: 'thunder', n: 3, waves: 3, spread: 0.4, tele: 0.4, pow: 0.75, range: 560, cd: 6 },
      { id: 'leize_zhu2', name: '九霄雷柱', k: 'beam', el: 'thunder', len: 680, w: 80, dur: 0.6, tele: 1.1, pow: 2.6, range: 640, min: 120, cd: 14, ult: true, hpBelow: 0.5 },
    ],
  }]);

  // 四、原版妖兽也学雷法，掉雷蛟鳞
  api.content.enemySkills('jinhu', [{ id: 'leize_hu', name: '风雷啸', k: 'cone', el: 'thunder', r: 300, spread: 0.5, tele: 0.85, pow: 1.8, range: 300, cd: 9 }]);
  api.content.addDrops('jinhu', [{ id: 'leize_lin', ch: 0.08 }]);

  // 五、青霞谷藏经阁多一卷
  api.content.sectLibrary('huangfeng', ['scroll_art_fengren']);
}
