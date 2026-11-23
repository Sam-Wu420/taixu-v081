// r7：撼山客的「动静」——他在两万以内和妖兽打架时，屏幕边缘朝他那边一闪一闪的冲击光（world/hanshan.ts 的 flashes）。
// 只是「远处有动静」的提示：一团淡金色的光在屏幕边上鼓一下就散，不盖住画面；动效只动 transform / opacity（hanshan.css）。
import { useEffect, useState } from 'react';
import type { Game } from '../world/game';
import './hanshan.css';

export function HanshanQuake({ game }: { game: Game }) {
  const [, tick] = useState(0);
  useEffect(() => game.subscribe(() => tick((x) => x + 1)), [game]);
  const H = game.hanshan;
  if (!H?.flashes.length || typeof window === 'undefined') return null;
  const W = window.innerWidth, Hh = window.innerHeight, cx = W / 2, cy = Hh / 2;
  // 世界里的方向 → 屏幕上的方向（HD2D 镜头可以转：按镜头方位角转回来）
  const yaw = game.camYaw || 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
  return (
    <div className="hs-quake-layer" aria-hidden>
      {H.flashes.map((f) => {
        const wx = Math.cos(f.ang), wy = Math.sin(f.ang);
        const sx = wx * cs + wy * sn, sy = -wx * sn + wy * cs;
        // 射线打到屏幕边上的那一点
        const kx = Math.abs(sx) > 1e-4 ? (cx) / Math.abs(sx) : Infinity, ky = Math.abs(sy) > 1e-4 ? (cy) / Math.abs(sy) : Infinity, k = Math.min(kx, ky);
        const x = cx + sx * k, y = cy + sy * k;
        const rot = Math.atan2(sy, sx) * 180 / Math.PI;
        const s = 0.7 + 0.6 * f.k;
        return <div key={f.id} className="hs-quake" style={{ left: x, top: y, ['--hs-rot' as string]: `${rot}deg`, ['--hs-s' as string]: s, ['--hs-a' as string]: (0.55 + 0.4 * f.k).toFixed(2) } as React.CSSProperties}><i /></div>;
      })}
    </div>
  );
}
