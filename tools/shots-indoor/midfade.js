// 截「走进去屋顶淡出中」：人走过门槛那一刻，把溶解程度按住在一半（只为截图，游戏里 0.35 息溶完）
(async () => {
  const g = window.__game, I = g.indoor, up = I.update.bind(I);
  I.update = (dt) => { up(dt); if (I.fade > 0.5) I.fade = 0.5; };
  window.__unhold = () => { I.update = up; };
  // 等人走过门槛
  for (let i = 0; i < 60 && !I.inside; i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, 400));
  return { inside: I.inside?.id, fade: I.fade };
})()
