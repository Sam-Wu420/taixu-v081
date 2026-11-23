/** @param {import('../sdk/taixu-mod').ModAPI} api */
export default function setup(api) {
  // ---------------- 内容
  api.content.items([
    { id: 'xianzong_cao', name: '云雾草', type: 'herb', tier: 1, price: 60, glyph: '草', stack: true, desc: '只长在云雾谷里，叶面凝着一层薄雾。' },
  ]);
  api.content.arts([{
    id: 'xianzong_yunbu', name: '云步', school: '身', tier: 2, realm: 1, cast: 'blink', fx: 'wind',
    mp: 0.08, cd: 5, power: 0, range: 360, color: '220,235,255',
    desc: '踏雾而行，一步数丈。云老道的看家身法。', evo: ['距离更远', '冷却更短', '落地留一团云雾'],
  }]);
  api.content.enemies([{
    id: 'xianzong_wuyao', name: '雾妖', kind: 'ghost', lv: [1, 2], evil: true,
    look: { body: 'ghost', color: [210, 225, 245], size: 1 },
    minDanger: 1, maxDanger: 3, hp: 0.8, atk: 0.7, def: 0.5, speed: 120,
    melee: { range: 60, power: 0.9, cd: 1.4 },
    drops: [{ id: 'xianzong_cao', ch: 0.8, n: [1, 2] }],
    skills: [{ id: 'xianzong_wu', name: '迷雾', k: 'circle', el: 'ghost', r: 120, tele: 0.9, pow: 1.2, range: 420, cd: 7, status: { k: 'slow', dur: 2, ch: 0.6 } }],
  }]);
  api.gfx.sprite('e:xianzong_wuyao', {
    frames: { idle: ['wisp_idle0.png', 'wisp_idle1.png', 'wisp_idle2.png', 'wisp_idle3.png'], attack: ['wisp_atk0.png', 'wisp_atk1.png'] },
    fps: 6, height: 110, motion: 'float',
  });

  // ---------------- 地点：青玄门北边
  api.content.locations([
    { id: 'xianzong_zhen', name: '仙踪镇', type: 'town', map: 'tiannan', x: 812, y: 506, desc: '山脚的小镇，传说曾有仙人在此留下足迹。' },
    { id: 'xianzong_gu', name: '云雾谷', type: 'secret', map: 'tiannan', x: 834, y: 522, desc: '谷中终年云雾不散，偶有雾影飘过。' },
  ]);
  api.content.townAction({ id: 'cha', seal: '茶', name: '仙踪茶馆', desc: '喝一盏云雾茶，听说书人讲仙人旧事', where: ['xianzong_zhen'], act: () => ({
    speaker: '说书人', text: '话说三百年前，有位白衣仙人路过此地，在青石上留下一个足印……据说如今那云雾谷里，还藏着他炼丹用的仙草。',
    options: [{ label: '赏他几块灵石', act: (g) => {} }, { label: '起身离开' }],
  }) });
  api.content.townAction({ id: 'cai', seal: '采', name: '采云雾草', desc: '在谷底寻草（每三日一次）', where: ['xianzong_gu'], act: (g) => {
    const last = api.store.get('lastPick') ?? -99;
    if (g.day - last < 3) return { speaker: '云雾谷', text: '能采的都采过了，过几日再来。', options: [{ label: '好' }] };
    api.store.set('lastPick', g.day);
    g.giveItem('xianzong_cao', 2); g.toast('采到云雾草 ×2', 'good');
    g.fx('ring', g.hero.x, g.hero.y, { r: 160, color: '220,235,255', fx: 'array' });
    upd(g);
  } });
  api.content.townAction({ id: 'tan', seal: '探', name: '深入谷中', desc: '雾影就在前面', where: ['xianzong_gu'], act: (g) => {
    g.spawnEnemy('xianzong_wuyao', 260, 0); g.spawnEnemy('xianzong_wuyao', -220, 80);
    g.shake(0.3); g.toast('雾中钻出两只雾妖！', 'warn');
  } });

  // ---------------- 人物
  api.content.npcs([{
    id: 'xianzong_yun', name: '云老道', sex: 'm', home: 'xianzong_zhen', realm: 2, stage: 1, title: '游方道人', role: 'elder', pers: 'kind',
    look: { robe: '#4a3a7a', hair: '#e8e4dc', beard: '#e8e4dc' },
    greet: ['无量天尊。小友面相不凡啊。', '镇上的茶不错，就是说书的嘴碎了些。'],
    talk: (g, npc) => {
      const st = api.store.get('step') ?? 0;
      if (st === 0) return { speaker: npc.name, text: '小友来得巧。贫道炼一炉丹，缺几株云雾草，就长在东边谷里。', options: [
        { label: '前辈要几株？', next: { speaker: npc.name, text: '三株足矣。事成之后，贫道传你一门身法。', options: [
          { label: '晚辈这就去', act: () => { api.store.set('step', 1); upd(g); } }, { label: '改日再说' }] } }] };
      if (st === 1) {
        const have = g.bagCount('xianzong_cao');
        if (have < 3) return { speaker: npc.name, text: `草呢？还差 ${3 - have} 株。`, options: [{ label: '这就去' }] };
        return { speaker: npc.name, text: '好，好！正是这个。', options: [{ label: '奉上云雾草', tone: 'gold', act: () => {
          g.takeItem('xianzong_cao', 3); g.learnArt('xianzong_yunbu'); g.addFavor(npc.id, 20); api.store.set('step', 2); upd(g);
          g.flash('220,235,255', 0.5);
          return { speaker: npc.name, text: '这门《云步》你收好。另外……谷里近来雾妖作祟，小友若有余力，替贫道除掉三只。', options: [{ label: '包在晚辈身上', act: () => { api.store.set('kills', 0); upd(g); } }] };
        } }] };
      }
      if (st === 2) {
        const k = api.store.get('kills') ?? 0;
        if (k < 3) return { speaker: npc.name, text: `雾妖还剩 ${3 - k} 只。`, options: [{ label: '这就去' }] };
        return { speaker: npc.name, text: '谷中清净了。小友侠义，贫道记下了。', options: [{ label: '前辈客气', act: () => { g.giveItem('mat_lingshi', 200); g.addExp(400); g.addFavor(npc.id, 20); api.store.set('step', 3); upd(g); } }] };
      }
      return null;   // 都办完了：走寻常交谈
    },
  }]);

  // ---------------- 任务栏
  function upd(g) {
    const st = api.store.get('step') ?? 0, gu = g.location('xianzong_gu'), zhen = g.location('xianzong_zhen');
    g.quest.remove('a'); g.quest.remove('b');
    if (st === 1) g.quest.set('a', { title: '云老道的仙草', text: '云雾谷采草', have: Math.min(3, g.bagCount('xianzong_cao')), need: 3, x: gu.x, y: gu.y });
    if (st === 2) { const k = api.store.get('kills') ?? 0; g.quest.set('b', k >= 3 ? { title: '回禀云老道', x: zhen.x, y: zhen.y } : { title: '除雾妖', text: '云雾谷「深入谷中」', have: k, need: 3, x: gu.x, y: gu.y }); }
  }
  api.on('start', upd);
  api.on('kill', (g, e) => { if (e.id === 'xianzong_wuyao' && api.store.get('step') === 2) { api.store.set('kills', (api.store.get('kills') ?? 0) + 1); upd(g); } });
  api.on('enter', (g, loc) => { if (loc.id === 'xianzong_zhen' && !api.store.get('seen')) { api.store.set('seen', true); g.toast('仙踪镇：听说镇上来了个游方道人。'); } });

  // ---------------- 界面
  api.ui.panel('lu', { title: '仙踪录', sub: '云老道托付的事', render: (g) => {
    const st = api.store.get('step') ?? 0;
    return [
      { type: 'text', text: ['还没见过云老道。去青玄门北边的仙踪镇看看。', '替云老道去云雾谷采三株云雾草。', '谷里雾妖作祟，替云老道除掉三只。', '云老道的事都办完了。'][st] },
      st === 1 ? { type: 'bar', label: '云雾草', value: g.bagCount('xianzong_cao'), max: 3 } : st === 2 ? { type: 'bar', label: '雾妖', value: api.store.get('kills') ?? 0, max: 3, color: '#8aa0c8' } : { type: 'divider' },
      { type: 'row', children: [{ type: 'item', id: 'xianzong_cao', n: g.bagCount('xianzong_cao') }] },
      { type: 'button', label: '指路仙踪镇', onClick: () => { const l = g.location('xianzong_zhen'); g.guide(l.x, l.y, '仙踪镇'); } },
    ];
  } });
  api.ui.button({ id: 'lu', glyph: '仙', label: '仙踪', onClick: (g) => g.openPanel('lu'), badge: () => { const s = api.store.get('step') ?? 0; return s === 1 || s === 2 ? 1 : 0; } });
  api.ui.hotkey('7', (g) => g.openPanel('lu'));

  // ---------------- 画面：云雾谷口一圈缓缓转动的雾环
  api.on('draw', (g, d) => {
    const gu = g.location('xianzong_gu'); if (!gu) return;
    if (Math.abs(gu.x - g.hero.x) > 3000 || Math.abs(gu.y - g.hero.y) > 2000) return;
    const t = g.time.phase * 400;
    for (let i = 0; i < 10; i++) {
      const a = t + i * Math.PI / 5;
      d.circle(gu.x + Math.cos(a) * 420, gu.y + Math.sin(a) * 160, 46, 'rgba(235,242,255,0.22)');
    }
    d.text('云雾谷', gu.x, gu.y - 260, { color: '#eaf2ff', size: 30 });
  });
}
