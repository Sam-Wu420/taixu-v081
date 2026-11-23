// P10：占山宗门在地面底图上的那一层——台地铺石板、石阶画踏步线、台沿一道深色的压边。
// 地面分块的底图有两处在画：主线程（预览 / 后备）和地形 Worker（正式烘焙）。两边都调这里，用的是同一份规划（随烘焙数据传给 Worker），画出来一样。
import { grandSectPlan, terraceOutline, type GrandSectPlan } from '../data/sectPlan';

/** 随烘焙数据传给 Worker 的：每座占山宗门的中心（世界坐标）与规划 */
export interface GrandSectGround { id: string; x: number; y: number; plan: GrandSectPlan }

export function grandSectGrounds(locs: readonly { id: string; type: string; x: number; y: number; major?: boolean; scale?: number; minor?: boolean }[], scale: number): GrandSectGround[] {
  const out: GrandSectGround[] = [];
  for (const l of locs) { const plan = grandSectPlan(l); if (plan) out.push({ id: l.id, x: l.x * scale, y: l.y * scale, plan }); }
  return out;
}

function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * 画进一块底图。g 已经变换到世界坐标（与 buildChunk 里画道路时一样），ox / oy / size 是这一块的范围。
 * 石板按世界坐标对缝：相邻两块接得上。
 */
export function paintGrandSects(g: CanvasRenderingContext2D, ox: number, oy: number, size: number, sects: readonly GrandSectGround[]): void {
  for (const s of sects) {
    const p = s.plan, R = Math.max(p.rx, p.ry) + p.apron;
    if (s.x + p.cx + R < ox || s.x + p.cx - R > ox + size || s.y + p.cy + R < oy || s.y + p.cy - R > oy + size) continue;
    g.save();
    g.translate(s.x, s.y);
    const lx0 = ox - s.x, ly0 = oy - s.y, lx1 = lx0 + size, ly1 = ly0 + size;
    for (const t of p.terraces) {
      const x0 = t.x - t.w / 2, y0 = t.y - t.h / 2, x1 = x0 + t.w, y1 = y0 + t.h + (t.bulge ?? 0);
      if (x1 < lx0 || x0 > lx1 || y1 < ly0 || y0 > ly1) continue;
      // 台面轮廓（圆角、南沿鼓出）：先剪出来，再往里铺
      const outline = terraceOutline(t, 60);
      g.save();
      g.beginPath(); outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.clip();
      g.fillStyle = t.causeway ? 'rgb(158,154,136)' : 'rgb(170,164,142)';
      g.fillRect(x0, y0, t.w, y1 - y0);
      // 石板：一行行错缝的长条石，块块深浅不一，缝是淡墨线
      const th = t.causeway ? 40 : 52, tw = th * 1.6;
      const iy0 = Math.max(Math.floor(y0 / th), Math.floor(ly0 / th) - 1), iy1 = Math.min(Math.ceil(y1 / th), Math.ceil(ly1 / th) + 1);
      const xa0 = Math.max(x0, lx0 - tw), xa1 = Math.min(x1, lx1 + tw);
      g.strokeStyle = 'rgba(78,72,56,0.42)'; g.lineWidth = 3;
      g.beginPath();
      for (let iy = iy0; iy <= iy1; iy++) {
        const y = iy * th; g.moveTo(xa0, y); g.lineTo(xa1, y);
        const off = (hash(iy, 31) * tw) | 0;
        for (let x = Math.floor((xa0 - off) / tw) * tw + off; x < xa1; x += tw) {
          const h = hash(Math.round(x / tw), iy);
          if (h < 0.5) {
            g.fillStyle = h < 0.22 ? `rgba(96,90,70,${0.08 + h * 0.4})` : `rgba(236,230,212,${0.06 + (h - 0.22) * 0.5})`;
            g.fillRect(x, y, tw, th);
          }
          g.moveTo(x, y); g.lineTo(x, y + th);
        }
      }
      g.stroke();
      // 苔痕：台沿、墙根一带成片的青苔，台面中间零零星星
      for (let k = 0; k < Math.min(160, t.w * t.h / 60000); k++) {
        const hx = hash(k * 7 + 1, t.w | 0), hy = hash(k * 13 + 5, t.h | 0), hr = hash(k, 99);
        let mx = x0 + hx * t.w, my = y0 + hy * (y1 - y0);
        // 往台沿靠
        if (hr < 0.6) { const e = hash(k, 3); if (e < 0.25) mx = x0 + hx * 120; else if (e < 0.5) mx = x1 - hx * 120; else if (e < 0.75) my = y0 + hy * 120; else my = y1 - hy * 160; }
        if (mx < lx0 - 200 || mx > lx1 + 200 || my < ly0 - 200 || my > ly1 + 200) continue;
        const R = 40 + hr * 150, rg = g.createRadialGradient(mx, my, 0, mx, my, R);
        rg.addColorStop(0, `rgba(92,112,70,${0.16 + hr * 0.14})`); rg.addColorStop(1, 'rgba(92,112,70,0)');
        g.fillStyle = rg; g.fillRect(mx - R, my - R, R * 2, R * 2);
      }
      // 中轴的御道：深一号、大块的方石，两边一道镶边
      if (!t.causeway && Math.abs(t.x) < 1 && !t.perch) {
        const w = t.w > 1500 ? 300 : 200;
        g.fillStyle = 'rgba(120,112,92,0.55)'; g.fillRect(-w / 2, y0, w, y1 - y0);
        g.strokeStyle = 'rgba(64,58,44,0.5)'; g.lineWidth = 8; g.strokeRect(-w / 2, y0 - 20, w, y1 - y0 + 40);
        g.lineWidth = 3; g.beginPath();
        for (let y = Math.floor(y0 / 100) * 100; y < y1; y += 100) { g.moveTo(-w / 2, y); g.lineTo(w / 2, y); }
        g.moveTo(0, y0); g.lineTo(0, y1); g.stroke();
      }
      g.restore();
      // 台沿压一道深色
      g.strokeStyle = 'rgba(60,56,42,0.5)'; g.lineWidth = 12;
      g.beginPath(); outline.forEach(([x, y, nx, ny], i) => { const px = x - nx * 6, py = y - ny * 6; if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.stroke();
    }
    // 院落之间的小径：一条深一号的碎石板路，两边一道浅边
    for (const q of p.paths ?? []) {
      if (Math.max(q.x1, q.x2) + 80 < lx0 || Math.min(q.x1, q.x2) - 80 > lx1 || Math.max(q.y1, q.y2) + 80 < ly0 || Math.min(q.y1, q.y2) - 80 > ly1) continue;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(214,206,182,0.75)'; g.lineWidth = q.w + 16; g.beginPath(); g.moveTo(q.x1, q.y1); g.lineTo(q.x2, q.y2); g.stroke();
      g.strokeStyle = 'rgba(128,118,96,0.85)'; g.lineWidth = q.w; g.beginPath(); g.moveTo(q.x1, q.y1); g.lineTo(q.x2, q.y2); g.stroke();
      g.strokeStyle = 'rgba(70,64,50,0.4)'; g.lineWidth = 2; g.setLineDash([18, 22]); g.beginPath(); g.moveTo(q.x1, q.y1); g.lineTo(q.x2, q.y2); g.stroke(); g.setLineDash([]);
    }
    for (const st of p.stairs) {
      const dx = st.x2 - st.x1, dy = st.y2 - st.y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy * st.w / 2, ny = ux * st.w / 2;
      if (Math.max(st.x1, st.x2) + st.w < lx0 || Math.min(st.x1, st.x2) - st.w > lx1 || Math.max(st.y1, st.y2) + st.w < ly0 || Math.min(st.y1, st.y2) - st.w > ly1) continue;
      g.fillStyle = 'rgb(222,214,192)';
      g.beginPath(); g.moveTo(st.x1 + nx, st.y1 + ny); g.lineTo(st.x2 + nx, st.y2 + ny); g.lineTo(st.x2 - nx, st.y2 - ny); g.lineTo(st.x1 - nx, st.y1 - ny); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90,78,58,0.45)'; g.lineWidth = 3;
      g.beginPath();
      for (let d = 0; d < L; d += 30) { const x = st.x1 + ux * d, y = st.y1 + uy * d; g.moveTo(x + nx, y + ny); g.lineTo(x - nx, y - ny); }
      g.stroke();
    }
    g.restore();
  }
}
