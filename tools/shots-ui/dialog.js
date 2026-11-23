(async () => {
  const core = document.querySelector('.ring-core[aria-expanded="true"]'); if (core) core.click();
  const dm = document.querySelector('.dock-mask'); if (dm) dm.click();
  await new Promise((r) => setTimeout(r, 500));
  const g = window.__game; if (g.modal) g.closeModal(true);
  g.openDialog({ speaker: '上官翎', title: '凝霜宗 · 结丹初期', portrait: './art/nangongwan.webp', mood: 'love',
    text: '苏道友，许久不见。上回赤霄禁地一别，我常想起你那一手符箓。\n今日恰在此处相逢，可愿陪我走一段山路？',
    options: [
      { label: '「荣幸之至。」', tone: 'love', act: () => null },
      { label: '赠她一枚驻颜丹', tone: 'gold', hint: '好感 +8', act: () => null },
      { label: '与她论道（需筑基后期）', disabled: true, hint: '修为不足', act: () => null },
      { label: '告辞', act: () => null },
    ] });
  await new Promise((r) => setTimeout(r, 2600));
  return 'dlg';
})()
