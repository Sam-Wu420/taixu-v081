export default function setup(api) {
  api.content.items([{ id: 'vfivedemo_fu', name: '回春符', type: 'misc', tier: 1, price: 50, desc: '贴在身上，回复一半气血。', glyph: '符', stack: true }]);
  api.content.itemUse('vfivedemo_fu', (g) => { g.heal(0.5); g.fx('ring', g.hero.x, g.hero.y, { r: 140, color: '140,230,120', fx: 'leaf' }); return '一道清光，伤势好了大半'; });
  api.content.arts([{ id: 'vfivedemo_lei', name: '掌心雷', school: '雷', tier: 1, realm: 1, cast: 'custom', fx: 'lightning', mp: 0.02, cd: 1, power: 1, range: 600, color: '170,190,255', desc: '模组自定义出手：附近每个敌人头上落一道雷。', evo: ['a', 'b', 'c'],
    onCast: (g) => { for (const e of g.enemies(700)) { g.fx('strike', e.x, e.y, { r: 90, fx: 'lightning', color: '170,190,255' }); g.damage(e.ref, 30); g.addStatus(e.ref, 'vfivedemo_yin', 3); } g.shake(0.2); } }]);
  api.content.status({ id: 'vfivedemo_yin', name: '雷印', color: '#a8b8ff' });
  api.ui.hud('state', { pos: 'top', render: (g) => [{ type: 'text', text: `【接口五】修为 ${g.hero.exp}/${g.hero.need} · 灵石 ${g.hero.lingshi}`, bold: true }] });
  api.ui.extend('bag', { title: '接口五：储物袋里的一段', render: (g) => [{ type: 'text', text: '这一段是模组加在原版储物袋里的。' }, { type: 'bar', label: '气血', value: g.hero.hp, max: 1 }] });
  api.ui.panel('myseclude', { title: '模组的闭关', render: (g) => [{ type: 'text', text: '原版「闭关」面板被模组替换成了这个。' }] });
  api.ui.replace('seclude', 'myseclude');
  api.ui.settings([{ key: 'hard', label: '困难模式', type: 'bool', default: false }, { key: 'mul', label: '修为倍数', type: 'number', default: 2, min: 1, max: 10 }, { key: 'style', label: '风格', type: 'select', default: '水墨', options: ['水墨', '工笔'] }]);
  api.hook('exp', (g, c) => { c.amount *= Number(api.settings.get('mul')) || 1; });
  api.on('start', (g) => { if (!api.store.get('given')) { api.store.set('given', 1); g.giveItem('vfivedemo_fu', 3); g.learnArt('vfivedemo_lei'); } });
}
