E2 近战截图脚本（给 tools/edge-shot.mjs 的 --eval / --step 用；在 Git Bash 里加 MSYS_NO_PATHCONV=1，路径写相对的）。
每个脚本：等试玩入口准备好 → 摆场景 → 触发 → 等到那一刻 → 冻结粒子和逻辑（截完下一步会解冻）。
  clash.js       try=brawl&clash=1           拼招：三个选项（等到三选一阶段）
  clash-res.js   （接 clash.js）              拼招：出「攻」对「破」，结果
  rocks.js       try=brawl&at=rocks&calm=1&foe=0   把木人轰向巨石，撞碎那一刻
  sea.js         try=brawl&at=sea&calm=1&foe=0     往下砸进海里，冲天水柱
  plow.js        （接 sea.js）                平着轰飞掠过海面，犁出水沟
  school.js      try=brawl&foe=school        体修变招（抓投前摇）、剑修后撤布阵
  block.js       try=brawl&calm=1&foe=0      欺身撞上火墙被拦下
  dive.js        try=brawl&calm=1&foe=0      御剑在高空对地上的木人俯冲砸击
