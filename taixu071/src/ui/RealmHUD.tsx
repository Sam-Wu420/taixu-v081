// v0.54：秘境里的抬头信息——名字、层数、石室探明、首领，以及一张秘境小图（只画走过的石室）
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { TIER_NAME, THEMES } from '../data/mijing';
import { REALM_OX, REALM_OY, CELL } from '../world/mijing';

export function RealmHUD({ game }: { game: Game }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    let last = 0, sig = '';
    const step = (forceNow = false) => {
      const t = performance.now();
      if (!forceNow && t - last < 220) return;
      last = t;
      const cur = game.mijing.cur;
      if (!cur) return;
      const M = game.mijing.mini();
      if (!M) return;
      const F = cur.floors[cur.fi];
      let seen = 0;
      for (let i = 0; i < M.rooms.length; i++) if (M.rooms[i].entered) seen++;
      const here = game.mijing.roomAt(game.player.x, game.player.y);
      let foes = 0;
      if (here) for (let i = 0; i < here.foes.length; i++) {
        const e = here.foes[i];
        if (!e.dead && e.aggro && game.combat.enemies.includes(e)) foes++;
      }
      const nextSig = `${cur.fi}|${M.px},${M.py}|${seen}|${F.bossDead ? 1 : 0}|${foes}|${cur.kills}`;
      if (nextSig === sig) return;
      sig = nextSig;
      force((x) => x + 1);
      const cv = ref.current;
      if (cv) {
        const S = 2, g = cv.getContext('2d')!;
        const w = M.gw * S, h = M.gh * S;
        if (cv.width !== w) cv.width = w;
        if (cv.height !== h) cv.height = h;
        g.fillStyle = 'rgba(14,12,16,0.85)'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < M.roomOf.length; i++) {
          const k = M.roomOf[i]; if (k < 0) continue; const r = M.rooms[k]; if (!r.entered) continue;
          g.fillStyle = M.cells[i] === 3 ? 'rgba(90,130,160,0.7)' : r.kind === 'boss' ? 'rgba(220,90,70,0.85)' : r.kind === 'treasure' ? 'rgba(230,200,110,0.8)' : r.cleared ? 'rgba(170,190,180,0.75)' : 'rgba(230,150,110,0.8)';
          g.fillRect((i % M.gw) * S, Math.floor(i / M.gw) * S, S, S);
        }
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
    };
    step(true);
    const offFrame = game.onAfterFrame(() => step(false));
    const offUi = game.subscribe(() => step(true));
    return () => { offFrame(); offUi(); };
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
