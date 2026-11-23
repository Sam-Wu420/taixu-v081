// 13 种灵草统一程序化绘制模块：各自具备高辨识度的植物/灵物形态、脉络纹理与灵气动态
// 供大世界采集点 (nodes.ts)、药王奇遇 (sites.ts)、洞府药圃 (home.ts)、秘境 (mijing.ts) 与野外奇遇 (events.ts) 共享

const TAU = Math.PI * 2;

export const HERB_META: Record<string, { main: string; leaf: string; accent: string; glow: string }> = {
  herb_huangjing:  { main: '#d8b24c', leaf: '#5c9448', accent: '#f6dc84', glow: '220,210,120' },
  herb_lingzhi:    { main: '#b83c32', leaf: '#623a2c', accent: '#f2c88a', glow: '215,80,60' },
  herb_jinxin:     { main: '#4e9654', leaf: '#387440', accent: '#ffe168', glow: '255,220,120' },
  herb_zihou:      { main: '#a85cd0', leaf: '#4b7e48', accent: '#f4c8ff', glow: '190,110,235' },
  herb_tianling:   { main: '#e2b644', leaf: '#3d7c46', accent: '#fff4bc', glow: '255,210,95' },
  herb_nichang:    { main: '#e888b8', leaf: '#5b8e78', accent: '#ffd6ee', glow: '255,165,215' },
  herb_xuelian:    { main: '#eef7ff', leaf: '#568e88', accent: '#ffe68c', glow: '220,242,255' },
  herb_huolong:    { main: '#d84438', leaf: '#5e8842', accent: '#9be068', glow: '255,105,55' },
  herb_bingpo:     { main: '#7ccbf4', leaf: '#4c88b8', accent: '#e6fbff', glow: '145,220,255' },
  herb_xuejing:    { main: '#9e2636', leaf: '#4c262e', accent: '#ff5268', glow: '220,45,68' },
  herb_jiuqu:      { main: '#dfc594', leaf: '#4f8c42', accent: '#e8483c', glow: '255,135,95' },
  herb_tianleizhu: { main: '#4ea06e', leaf: '#7ac878', accent: '#9ae4ff', glow: '130,210,255' },
  herb_yangshen:   { main: '#f4f0e4', leaf: '#7caea8', accent: '#ffffff', glow: '235,248,242' },
};

export function herbMainColor(id: string): string {
  return HERB_META[id]?.main ?? '#4f8a4a';
}

export function herbGlowRgb(id: string): string {
  return HERB_META[id]?.glow ?? '170,235,175';
}

export interface HerbDrawOpts {
  seed?: number;
  avail?: boolean;
  mini?: boolean;
  soil?: boolean;
}

/** 在指定画布坐标 (x, y 地面锚点) 绘制具象化的灵草形态 */
export function drawHerbSprite(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  scale: number,
  t: number,
  opts: HerbDrawOpts = {},
) {
  const meta = HERB_META[id] ?? HERB_META.herb_huangjing;
  const seed = opts.seed ?? 17;
  const avail = opts.avail !== false;
  const mini = !!opts.mini;
  const sway = Math.sin(t * 1.7 + seed * 0.73) * 0.055;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  if (opts.soil) {
    ctx.fillStyle = 'rgba(42,34,24,0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 19, 6.5, 0, 0, TAU);
    ctx.fill();
  }

  if (!avail) {
    ctx.strokeStyle = '#5a5042';
    ctx.lineWidth = 1.8;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 3.5, 0);
      ctx.lineTo(i * 5.2, -7 - (Math.abs(i) % 2) * 3);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.rotate(sway);

  switch (id) {
    case 'herb_huangjing': {
      // 多节玉黄块状根茎露土 + 拱形青茎 + 对生狭长竹状叶 + 垂坠淡黄小果
      ctx.fillStyle = '#c9a65a';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.ellipse(i * 6, -1, 5.5, 3.2, i * 0.15, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = '#4e843e';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(-5, -14, 4, -27);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const py = -9 - i * 4.5;
        const px = -1 + i * 1.2;
        const dir = i % 2 === 0 ? -1 : 1;
        ctx.fillStyle = i % 2 === 0 ? '#5c9a4c' : '#4a833d';
        ctx.beginPath();
        ctx.ellipse(px + dir * 7, py, 8, 2.3, dir * -0.35, 0, TAU);
        ctx.fill();
        if (!mini && i >= 1) {
          ctx.fillStyle = meta.accent;
          ctx.beginPath();
          ctx.arc(px + dir * 4, py + 3.2, 1.9, 0, TAU);
          ctx.fill();
        }
      }
      break;
    }

    case 'herb_lingzhi': {
      // 紫褐漆光菌柄 + 三重云纹扇形赤灵芝菌盖（带金边年轮）
      const caps: [number, number, number, number][] = mini
        ? [[0, -14, 11, 5], [-6, -9, 7, 3.4]]
        : [[0, -19, 13.5, 6.2], [-9.5, -12, 8.8, 4.2], [9, -11, 8, 3.8]];
      for (const [cx, cy] of caps) {
        ctx.strokeStyle = '#5a3228';
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.moveTo(cx * 0.25, 0);
        ctx.quadraticCurveTo(cx * 0.4, cy * 0.45, cx, cy + 1);
        ctx.stroke();
      }
      for (const [cx, cy, rw, rh] of caps) {
        ctx.fillStyle = '#9e2c24';
        ctx.beginPath();
        ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, TAU);
        ctx.quadraticCurveTo(cx, cy + rh * 0.35, cx - rw, cy);
        ctx.fill();
        ctx.fillStyle = meta.main;
        ctx.beginPath();
        ctx.ellipse(cx, cy - rh * 0.14, rw * 0.84, rh * 0.72, 0, Math.PI, TAU);
        ctx.fill();
        ctx.strokeStyle = meta.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy - rh * 0.14, rw * 0.88, rh * 0.76, 0, Math.PI + 0.2, TAU - 0.2);
        ctx.stroke();
      }
      break;
    }

    case 'herb_jinxin': {
      // 舒展翠叶丛 + 亮金主叶脉 + 中心金心星花
      const angs = mini ? [-0.75, 0, 0.75] : [-1.05, -0.52, 0, 0.52, 1.05];
      for (const a of angs) {
        const len = 18 + (Math.abs(a) < 0.2 ? 4 : 0);
        const ex = Math.sin(a) * len, ey = -Math.cos(a) * len;
        ctx.fillStyle = meta.main;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(ex * 0.45 - Math.cos(a) * 4, ey * 0.5 - Math.sin(a) * 3, ex, ey);
        ctx.quadraticCurveTo(ex * 0.45 + Math.cos(a) * 4, ey * 0.5 + Math.sin(a) * 3, 0, 0);
        ctx.fill();
        ctx.strokeStyle = meta.accent;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.lineTo(ex * 0.86, ey * 0.86);
        ctx.stroke();
      }
      // 顶部金心星花
      ctx.fillStyle = '#ffe97a';
      for (let p = 0; p < 4; p++) {
        const pa = p * Math.PI * 0.5 + t * 0.4;
        ctx.beginPath();
        ctx.ellipse(Math.cos(pa) * 3.5, -16 + Math.sin(pa) * 3.5, 3.2, 1.4, pa, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -16, 1.8, 0, TAU);
      ctx.fill();
      break;
    }

    case 'herb_zihou': {
      // 幽紫蔓茎 + 猴面形紫兰冠（头冠三瓣 + 垂耳 + 淡紫面纹）
      ctx.strokeStyle = '#477a42';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-7, -10, 6, -18, 1, -28);
      ctx.stroke();
      ctx.fillStyle = '#538e4c';
      ctx.beginPath();
      ctx.ellipse(-7, -10, 6, 2.6, -0.45, 0, TAU);
      ctx.ellipse(7, -15, 6, 2.5, 0.45, 0, TAU);
      ctx.fill();
      const blooms: [number, number, number][] = mini ? [[1, -25, 1]] : [[1, -27, 1.05], [-8, -20, 0.78]];
      for (const [bx, by, bs] of blooms) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(bs, bs);
        ctx.fillStyle = '#8b3fb8';
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.ellipse(k * 5.2, -3.5 + Math.abs(k) * 2, 4.2, 5.4, k * 0.45, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#c87cf2';
        ctx.beginPath();
        ctx.ellipse(0, 2.5, 4.8, 4.2, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = meta.accent;
        ctx.beginPath();
        ctx.arc(-1.8, 0.8, 1.1, 0, TAU);
        ctx.arc(1.8, 0.8, 1.1, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    }

    case 'herb_tianling': {
      // 灵木小枝 + 丰润青碧叶 + 2~3颗莹润金桃状天灵果
      ctx.strokeStyle = '#5e442b';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-4, -13, 2, -24);
      ctx.moveTo(-1, -13);
      ctx.lineTo(-9, -19);
      ctx.moveTo(1, -16);
      ctx.lineTo(10, -21);
      ctx.stroke();
      for (const [lx, ly, rot] of [[-8, -14, -0.5], [8, -15, 0.45], [0, -24, 0.1]]) {
        ctx.fillStyle = meta.leaf;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 6.5, 2.8, rot, 0, TAU);
        ctx.fill();
      }
      const fruits: [number, number, number][] = mini ? [[1, -21, 5.2]] : [[-8, -20, 4.8], [9, -22, 4.8], [1, -27, 5.6]];
      for (const [fx, fy, fr] of fruits) {
        const fg = ctx.createRadialGradient(fx - fr * 0.3, fy - fr * 0.3, 1, fx, fy, fr);
        fg.addColorStop(0, '#fff7cc');
        fg.addColorStop(0.55, meta.main);
        fg.addColorStop(1, '#b87c24');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(fx, fy, fr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.beginPath();
        ctx.arc(fx - fr * 0.32, fy - fr * 0.32, fr * 0.25, 0, TAU);
        ctx.fill();
      }
      break;
    }

    case 'herb_nichang': {
      // 飘逸粉紫彩带叶 + 垂丝流苏花穗，如仙衣霓裳
      for (let i = -2; i <= 2; i++) {
        const tipX = i * 6.5 + Math.sin(t * 2.3 + i) * 2.2;
        const tipY = -22 + Math.abs(i) * 3;
        ctx.strokeStyle = i % 2 === 0 ? '#67a086' : '#d278ac';
        ctx.lineWidth = i === 0 ? 2.6 : 1.9;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(i * 3, -12, i * 8, -16, tipX, tipY);
        ctx.stroke();
        // 垂坠霓裳花铃
        ctx.fillStyle = i % 2 === 0 ? meta.main : meta.accent;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - 3, tipY + 6.5);
        ctx.lineTo(tipX + 3, tipY + 6.5);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case 'herb_xuelian': {
      // 寒翠莲座 + 多层晶莹雪白重瓣莲 + 暖金花蕊
      ctx.fillStyle = '#4f8680';
      ctx.beginPath();
      ctx.ellipse(-9, -3, 7, 3, -0.25, 0, TAU);
      ctx.ellipse(9, -3, 7, 3, 0.25, 0, TAU);
      ctx.fill();
      const petals = mini ? 5 : 9;
      for (let i = 0; i < petals; i++) {
        const a = -Math.PI * 0.44 + (i / Math.max(1, petals - 1)) * Math.PI * 0.88;
        ctx.save();
        ctx.translate(0, -6);
        ctx.rotate(a);
        ctx.fillStyle = i % 2 === 0 ? '#f4faff' : '#d6ebfa';
        ctx.strokeStyle = 'rgba(130,185,220,0.75)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(0, -10.5, 3.8, 10.5, 0, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#ffe588';
      ctx.beginPath();
      ctx.arc(0, -11, 3.4, 0, TAU);
      ctx.fill();
      break;
    }

    case 'herb_huolong': {
      // 仙人掌棱状赤绿肥茎 + 带绿鳞尖的炽红火龙灵果
      ctx.fillStyle = '#5c843c';
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.quadraticCurveTo(-8, -14, -3, -24);
      ctx.lineTo(4, -24);
      ctx.quadraticCurveTo(8, -14, 4, 0);
      ctx.closePath();
      ctx.fill();
      if (!mini) {
        ctx.beginPath();
        ctx.ellipse(-8, -12, 3.5, 7, -0.45, 0, TAU);
        ctx.ellipse(8, -14, 3.5, 7, 0.45, 0, TAU);
        ctx.fill();
      }
      const fPts: [number, number, number][] = mini ? [[0, -23, 6]] : [[0, -25, 6.5], [-8, -16, 4.6]];
      for (const [fx, fy, fr] of fPts) {
        ctx.fillStyle = meta.main;
        ctx.beginPath();
        ctx.ellipse(fx, fy, fr * 0.85, fr, 0, 0, TAU);
        ctx.fill();
        // 绿焰鳞片
        ctx.fillStyle = meta.accent;
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath();
          ctx.moveTo(fx + k * 3.2, fy - fr * 0.55);
          ctx.lineTo(fx + k * 5.2, fy - fr * 1.25);
          ctx.lineTo(fx + k * 1.5, fy - fr * 0.75);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }

    case 'herb_bingpo': {
      // 半透明棱柱冰晶剑叶簇 + 漂浮寒芒碎晶
      const shards: [number, number, number][] = mini
        ? [[-0.35, 16, 4], [0, 22, 4.8], [0.35, 16, 4]]
        : [[-0.65, 14, 3.4], [-0.28, 20, 4.2], [0, 25, 5], [0.28, 20, 4.2], [0.65, 14, 3.4]];
      for (const [a, len, w] of shards) {
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = 'rgba(130,215,255,0.85)';
        ctx.strokeStyle = '#eefcff';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-w, -len * 0.55);
        ctx.lineTo(0, -len);
        ctx.lineTo(w, -len * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      if (!mini) {
        const fy = -27 - Math.sin(t * 3 + seed) * 2.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, fy - 3); ctx.lineTo(2.5, fy); ctx.lineTo(0, fy + 3); ctx.lineTo(-2.5, fy); ctx.closePath(); ctx.fill();
      }
      break;
    }

    case 'herb_xuejing': {
      // 深绛锯齿剑叶 + 血脉筋络 + 叶尖凝血珠
      for (let i = -2; i <= 2; i++) {
        const a = i * 0.34;
        const len = 23 - Math.abs(i) * 3;
        ctx.save();
        ctx.rotate(a);
        ctx.fillStyle = i % 2 === 0 ? '#6e1e2a' : '#962838';
        ctx.beginPath();
        ctx.moveTo(-2.5, 0);
        ctx.lineTo(-3.6, -len * 0.45);
        ctx.lineTo(-1.8, -len * 0.52);
        ctx.lineTo(-3.0, -len * 0.78);
        ctx.lineTo(0, -len);
        ctx.lineTo(3.0, -len * 0.78);
        ctx.lineTo(1.8, -len * 0.52);
        ctx.lineTo(3.6, -len * 0.45);
        ctx.lineTo(2.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = meta.accent;
        ctx.beginPath();
        ctx.arc(0, -len, 1.8, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      break;
    }

    case 'herb_jiuqu': {
      // 九曲灵参：人形蜿蜒白玉参根（半埋土中）+ 掌状五叶 + 朱红参果簇
      ctx.strokeStyle = '#dcc292';
      ctx.lineWidth = 4.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, -2);
      ctx.moveTo(0, -3);
      ctx.lineTo(-6, 3);
      ctx.moveTo(0, -3);
      ctx.lineTo(6, 3);
      ctx.moveTo(0, -8);
      ctx.lineTo(-6, -4);
      ctx.moveTo(0, -8);
      ctx.lineTo(6, -4);
      ctx.stroke();
      ctx.strokeStyle = '#4e8a42';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, -24);
      ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.fillStyle = '#5ca04c';
        ctx.beginPath();
        ctx.ellipse(i * 4.5, -21 + Math.abs(i) * 1.4, 4.5, 2, i * 0.35, 0, TAU);
        ctx.fill();
      }
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = '#e84438';
        ctx.beginPath();
        ctx.arc(i * 2.5, -27 - (i === 0 ? 2 : 0), 2.3, 0, TAU);
        ctx.fill();
      }
      break;
    }

    case 'herb_tianleizhu': {
      // 天雷竹：青碧带节竹干 + 竹叶 + 缠绕跳跃青紫电弧
      ctx.fillStyle = '#458e62';
      ctx.fillRect(-3.4, -27, 6.8, 27);
      ctx.strokeStyle = '#d4f2c8';
      ctx.lineWidth = 1.4;
      for (const ny of [-9, -18, -26]) {
        ctx.beginPath();
        ctx.moveTo(-4, ny);
        ctx.lineTo(4, ny);
        ctx.stroke();
      }
      ctx.fillStyle = '#70c472';
      ctx.beginPath();
      ctx.ellipse(7, -20, 6.5, 2.2, -0.35, 0, TAU);
      ctx.ellipse(-7, -13, 6.5, 2.2, 0.35, 0, TAU);
      ctx.fill();
      const arcFlick = Math.sin(t * 14 + seed);
      if (arcFlick > -0.4) {
        ctx.strokeStyle = '#9ceeff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(5, -13);
        ctx.lineTo(-5, -19);
        ctx.lineTo(6, -26);
        ctx.stroke();
      }
      break;
    }

    case 'herb_yangshen': {
      // 万年灵乳：玉石钟乳墩 + 乳白晶柱 + 垂滴凝珠与水面涟漪
      ctx.fillStyle = '#6f8e8c';
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#b4ece4';
      ctx.beginPath();
      ctx.ellipse(0, -1, 9, 3, 0, 0, TAU);
      ctx.fill();
      // 钟乳石笋柱
      ctx.fillStyle = '#f0ece0';
      ctx.beginPath();
      ctx.moveTo(-5, -2);
      ctx.lineTo(-3, -24);
      ctx.lineTo(0, -28);
      ctx.lineTo(3, -24);
      ctx.lineTo(5, -2);
      ctx.closePath();
      ctx.fill();
      const dropY = -12 + ((t * 9) % 10);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(4, dropY, 1.8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -1, 5 + ((t * 4) % 4), 1.6, 0, 0, TAU);
      ctx.stroke();
      break;
    }

    default: {
      // 兜底普通灵草
      ctx.strokeStyle = '#3a6a3a';
      ctx.lineWidth = 1.6;
      for (let k = -2; k <= 2; k++) {
        ctx.fillStyle = meta.main;
        ctx.beginPath();
        ctx.ellipse(k * 4, -10 + Math.abs(k) * 2, 6, 2.5, k * 0.4, 0, TAU);
        ctx.fill();
      }
      break;
    }
  }

  ctx.restore();
}
