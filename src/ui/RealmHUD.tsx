// v0.54：秘境里的抬头信息——名字、层数、石室探明、首领，以及一张秘境小图（只画走过的石室）
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { TIER_NAME, THEMES } from '../data/mijing';
import { REALM_OX, REALM_OY, CELL } from '../world/mijing';

/** 小图的边长（画布像素）。秘境放大后格子图有几百格见方，不能再按「一格两像素」画 */
const MAP_PX = 220;

export function RealmHUD({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t: number) => {
      if (t - last > 250) {
        last = t; force((x) => x + 1);
        const cv = ref.current, M = game.mijing.mini();
        if (cv && M) {
          const g = cv.getContext('2d')!;
          if (M.isles && M.bound) {
            // 石台群：节点式的小图——一座台一个点，桥是连线；没去过的台只有淡淡的轮廓
            const B = M.bound, k = MAP_PX / (B.r * 2), X = (x: number) => (x - B.x + B.r) * k, Y = (y: number) => (y - B.y + B.r) * k;
            if (cv.width !== MAP_PX) { cv.width = MAP_PX; cv.height = MAP_PX; }
            g.clearRect(0, 0, MAP_PX, MAP_PX);
            g.fillStyle = 'rgba(14,12,16,0.85)'; g.beginPath(); g.arc(MAP_PX / 2, MAP_PX / 2, MAP_PX / 2 - 1, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(226,190,120,0.45)'; g.lineWidth = 1.5; g.stroke();
            const near = (x: number, y: number) => M.isles!.findIndex((s) => Math.hypot(s.x - x, s.y - y) < s.r + CELL * 2);
            for (const b of M.bridges ?? []) {
              const ia = near(b.ax, b.ay), ib = near(b.bx, b.by), seen = (ia >= 0 && M.rooms[ia].entered) || (ib >= 0 && M.rooms[ib].entered);
              g.strokeStyle = seen ? 'rgba(200,196,180,0.75)' : 'rgba(150,150,140,0.22)'; g.lineWidth = Math.max(1.5, b.w * k);
              g.beginPath(); g.moveTo(X(b.ax), Y(b.ay)); g.lineTo(X(b.bx), Y(b.by)); g.stroke();
            }
            M.isles.forEach((s, i) => {
              const r = M.rooms[i], rad = Math.max(3.5, s.r * k);
              g.beginPath();
              if (s.round) g.arc(X(s.x), Y(s.y), rad, 0, Math.PI * 2);
              else for (let j = 0; j < 8; j++) { const a = (j + 0.5) / 8 * Math.PI * 2, px = X(s.x) + Math.cos(a) * rad * 1.06, py = Y(s.y) + Math.sin(a) * rad * 1.06; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
              g.closePath();
              if (r.entered) {
                g.fillStyle = r.kind === 'boss' ? 'rgba(220,90,70,0.85)' : r.kind === 'treasure' ? 'rgba(230,200,110,0.8)' : r.cleared ? 'rgba(170,190,180,0.75)' : 'rgba(230,150,110,0.8)';
                g.fill();
              } else { g.strokeStyle = r.kind === 'boss' ? 'rgba(220,110,90,0.55)' : 'rgba(190,190,180,0.35)'; g.lineWidth = 1.2; g.stroke(); }
            });
            for (const o of M.objs) {
              if (o.hidden || (o.kind !== 'exit' && o.kind !== 'stairs')) continue;
              if (o.room !== undefined && !M.rooms[o.room]?.entered) continue;
              g.fillStyle = '#c8a0ff'; g.fillRect(X(o.x) - 2, Y(o.y) - 2, 5, 5);
            }
            const p = game.player;
            g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(X(p.x), Y(p.y), 3.2, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(40,30,20,0.9)'; g.lineWidth = 1; g.stroke();
          } else {
            // 旧的拼图迷宫：按格子画
            const S = 2;
            cv.width = M.gw * S; cv.height = M.gh * S;
            g.fillStyle = 'rgba(14,12,16,0.85)'; g.fillRect(0, 0, cv.width, cv.height);
            // 走过的石室：按真实形状画（拼图石室不是方的）
            for (let i = 0; i < M.roomOf.length; i++) {
              const k = M.roomOf[i]; if (k < 0) continue; const r = M.rooms[k]; if (!r.entered) continue;
              g.fillStyle = M.cells[i] === 3 ? 'rgba(90,130,160,0.7)' : r.kind === 'boss' ? 'rgba(220,90,70,0.85)' : r.kind === 'treasure' ? 'rgba(230,200,110,0.8)' : r.cleared ? 'rgba(170,190,180,0.75)' : 'rgba(230,150,110,0.8)';
              g.fillRect((i % M.gw) * S, Math.floor(i / M.gw) * S, S, S);
            }
            // 走过的甬道：玩家附近一圈（神识所及）
            g.fillStyle = 'rgba(150,160,150,0.4)';
            for (let y = Math.max(0, M.py - 12); y < Math.min(M.gh, M.py + 12); y++) for (let x = Math.max(0, M.px - 16); x < Math.min(M.gw, M.px + 16); x++) if (M.cells[y * M.gw + x] === 1) g.fillRect(x * S, y * S, S, S);
            for (const o of M.objs) {
              if (o.hidden || (o.kind !== 'exit' && o.kind !== 'stairs' && o.kind !== 'door') || (o.kind === 'door' && o.open)) continue;
              const ox = (o.x - REALM_OX) / CELL, oy = (o.y - REALM_OY) / CELL;
              if (!M.rooms.some((r) => r.entered && ox >= r.x0 - 3 && ox <= r.x1 + 3 && oy >= r.y0 - 3 && oy <= r.y1 + 3)) continue;
              g.fillStyle = o.kind === 'door' ? '#8fd0ff' : '#c8a0ff'; g.fillRect(ox * S - 2, oy * S - 2, 5, 5);
            }
            g.fillStyle = '#fff2c0'; g.beginPath(); g.arc(M.px * S + S / 2, M.py * S + S / 2, 3, 0, Math.PI * 2); g.fill();
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game]);
  const cur = game.mijing.cur;
  if (!cur) return null;
  const F = cur.floors[cur.fi];
  const seen = F.rooms.filter((r) => r.entered).length;
  const boss = F.rooms.find((r) => r.kind === 'boss');
  const here = game.mijing.roomAt(game.player.x, game.player.y);
  const foes = here ? here.foes.filter((e) => !e.dead && game.combat.enemies.includes(e) && e.aggro).length : 0;
  return (
    <div className="realm-hud">
      <div className="rh-title"><b>{cur.spec.name}</b><small>{TIER_NAME[cur.spec.tier]} · {THEMES[cur.spec.theme].name}{cur.spec.floors > 1 ? ` · 第 ${cur.fi + 1}/${cur.spec.floors} 层` : ''}</small></div>
      <div className="rh-line">石室 {seen}/{F.rooms.length} · {boss ? (F.bossDead ? '首领已除' : boss.entered ? '首领未除' : '首领未现') : ''}{foes ? ` · 此间妖物 ${foes}` : ''} · 斩敌 {cur.kills}</div>
      <canvas ref={ref} className="rh-map" />
      <div className="rh-tip">入口古阵随时可退出 · 首领伏诛后出口亮起</div>
    </div>
  );
}
