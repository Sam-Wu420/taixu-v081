// 局部单位：为腿部留出近似空间，再用柔性余量控制衣摆摆动；并非三维碰撞。
export function hemGeometry(restRadius: number, legNeed: number, offset: number, flutter: number) {
  const r = Math.max(1e-6, restRadius);
  const leg = Math.min(r * 1.35, Math.max(r * 0.62, legNeed));
  const base = Math.max(r, leg);
  const budget = Math.max(0, Math.min(r * 0.28, (r * 1.65 - base) * 0.5));
  const raw = Math.max(0, offset) + Math.max(0, flutter);
  // 平滑渐近上限，避免硬截断导致速度变化时突然卡住。
  const motion = budget > 0 ? budget * Math.tanh(raw / budget) : 0;
  const factor = raw > 1e-9 ? motion / raw : 1;
  const radius = Math.max(r, leg + motion);
  return { radius, factor, motion, extent: radius + motion, leg };
}
