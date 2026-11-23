// v0.52.6：洞府独立场景（修 v0.52.5 的三处硬伤）
//  · 相机跟随：竖屏 cover 会把两侧裁掉，石榻 / 洞门原本在屏外，走过去也看不到（玩家说的「黑屏」「选项找不到」多半就是它）
//  · 顶部常驻功能条：药园 / 丹炉 / 蒲团 / 灵泉 / 洞府事务 / 出府 —— 不必走到点位也能开，
//    尤其「洞府事务」直接回到改版前的完整菜单（禁制 / 扩建药园 / 重炼古宝 / 灵宠），一个选项都不丢
//  · 整帧 try/catch：任何一帧画错都不许断 rAF 链（断了就是永久黑屏），出错时降级画底色 + 提示
import { useEffect, useRef, useState } from 'react';
import type { Game } from '../world/game';
import { CharState, drawCharacter } from '../gfx/character';
import { drawBeast, type BeastLook, type BeastAnim } from '../gfx/beast';
import { drawBeastSprite } from '../gfx/beastTex';
import { PET_KINDS } from '../world/pets';
import { bindOf, keyLabel } from '../core/keymap';
import { IS_TOUCH } from '../core/touch';
import { audio } from '../world/audio';
import bgSrc from '../assets/cave/cave_interior.jpg';

// 逻辑坐标：背景图按 1600×900 布置。高度铺满，宽度不够就让相机横着跟随主角
const LW = 1600, LH = 900;
const FLOOR_TOP = 590, FLOOR_BOTTOM = 820;
const SPEED_WALK = 210, SPEED_RUN = 380;

interface Spot { id: string; x: number; y: number; r: number; name: string; hint: string }
const SPOTS: Spot[] = [
  { id: 'exit', x: 70, y: 660, r: 150, name: '洞门', hint: '出洞府' },
  { id: 'spring', x: 330, y: 660, r: 150, name: '灵泉', hint: '泉边打坐（灵气加成）' },
  { id: 'seat', x: 620, y: 680, r: 130, name: '蒲团', hint: '入定 / 闭关' },
  { id: 'furnace', x: 880, y: 680, r: 130, name: '丹炉', hint: '炼丹 / 炼器' },
  { id: 'garden', x: 1180, y: 680, r: 160, name: '药园', hint: '打理药园' },
  { id: 'bed', x: 1450, y: 680, r: 150, name: '石榻', hint: '洞府事务' },
];

/** 顶部功能条：不必走到点位也能开 */
const BAR: { id: string; n: string }[] = [
  { id: 'garden', n: '药园' },
  { id: 'furnace', n: '丹炉' },
  { id: 'seat', n: '蒲团' },
  { id: 'map', n: '地图' },
];

export function CaveScene({ game, onClose }: { game: Game; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState<{ spot: Spot | null; lover: string | null; pet: string | null }>({ spot: null, lover: null, pet: null });
  const joy = useRef({ x: 0, y: 0 });
  const act = useRef<string | null>(null);
  const nearRef = useRef(near); nearRef.current = near;
  const [err, setErr] = useState<string | null>(null);

  // 互动：由热点 id 分发
  const doSpot = (id: string) => {
    const g = game;
    try {
      audio.sfx('open');
      switch (id) {
        case 'exit': onClose(); break;
        case 'spring': g.toggleSit(); g.toast(g.player.sitting ? `灵泉之畔，灵气 ×${g.home.placeMult().toFixed(2)}——你盘膝坐下。` : '你起身。', 'info'); break;
        case 'seat': g.openDialog({ speaker: g.ws.home?.name ?? '洞府', title: '蒲团', mood: 'mystic', text: '蒲团上还留着上次入定时的余温。', options: [
          { label: '盘膝打坐', act: () => { if (!g.player.sitting) g.toggleSit(); return null; } },
          { label: '入室闭关', act: () => { g.onPanel?.('seclude', true); return null; } },
          { label: '算了', act: () => null },
        ] }); break;
        case 'furnace': g.onPanel?.('alchemy', true); break;
        case 'garden': g.openDialog(g.home.gardenNode()); break;
        case 'bed': g.openDialog(g.home.mainNode()); break;
        case 'map': g.onOpenMap?.(); break;
      }
    } catch (e) { g.toast('这里出了点岔子，换个地方试试。', 'warn'); console.error('[cave] spot', id, e); }
  };
  const talkLover = () => { try { game.talkLover(); } catch (e) { console.error('[cave] lover', e); } };
  const talkPet = () => { try { game.talkPet(); } catch (e) { console.error('[cave] pet', e); } };

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d');
    if (!ctx) { setErr('画布初始化失败（此设备不支持 2D 画布）'); return; }
    const bg = new Image();
    let bgOk = false;
    bg.onload = () => { bgOk = true; };
    bg.onerror = () => { bgOk = false; console.warn('[cave] 洞府贴图加载失败，改用底色'); };
    bg.src = bgSrc;

    // 场景内的角色状态（独立于世界坐标）
    const P = { x: 200, y: 700, st: new CharState(200, 700), facing: 1 as 1 | -1 };
    P.st.targetYaw = P.st.yaw = Math.PI / 2;
    let f: ReturnType<Game['hearts']['follower']> = null;
    try { f = game.hearts.follower(); } catch { f = null; }
    const L = f ? { b: f, x: 1040, y: 720, st: new CharState(1040, 720), tx: 1040, ty: 720, t: 0 } : null;
    if (L) { L.st.targetYaw = L.st.yaw = -Math.PI / 2; }
    const pet = game.pets.active;
    const PE = pet ? { x: 700, y: 740, facing: -1, phase: 0, move: 0, t: 0, tx: 700, ty: 740, wait: 2 } : null;
    const keys = new Set<string>();
    let raf = 0, last = performance.now(), t = 0, W = 0, H = 0, dpr = 1, scale = 1, oy = 0, viewW = LW, camX = 0;
    let bad = 0;
    // v0.52.9：静态层（背景 + 灵光 + 热点牌）只在「相机移动 / 尺寸变化 / 一次重绘间隔」时重画，
    // 其余帧直接贴整张缓存。这是核显 / 软件渲染下最实在的一刀——背景图本身就要全屏缩放一次。
    const statCv = document.createElement('canvas');
    let statKey = '';
    const bg2 = new Image();
    let bg2Ok = false, bg2Try = 0;
    bg2.onload = () => { bg2Ok = true; statKey = ''; };
    bg2.onerror = () => { bg2Ok = false; };
    bg2.src = bgSrc;

    const fit = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(1, window.innerWidth);
      H = Math.max(1, window.innerHeight);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      // 高度铺满（地面一定在视野里），宽度不够就让相机横着走——不再用 cover 把两侧裁掉
      scale = Math.max(H / LH, W / LW);
      viewW = W / scale;
      oy = (H - LH * scale) / 2;
    };
    fit();

    const kd = (e: KeyboardEvent) => {
      if (game.modal) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys.add(k); e.preventDefault(); }
      if (k === 'escape') { onClose(); return; }
      if (k === bindOf('interact') || k === 'enter') { const n = nearRef.current; if (n.spot) doSpot(n.spot.id); e.preventDefault(); }
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('resize', fit);

    const clampFloor = (o: { x: number; y: number }) => { o.x = Math.max(40, Math.min(LW - 40, o.x)); o.y = Math.max(FLOOR_TOP, Math.min(FLOOR_BOTTOM, o.y)); };

    /** 静态层：背景图 + 会呼吸的灵光 + 热点提示牌（镜头不动时只有呼吸光在变，直接贴缓存） */
    const drawStatic = () => {
      if (statCv.width !== Math.max(1, Math.round(W * dpr)) || statCv.height !== Math.max(1, Math.round(H * dpr))) {
        statCv.width = Math.max(1, Math.round(W * dpr)); statCv.height = Math.max(1, Math.round(H * dpr));
      }
      const g = statCv.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#120e0a'; g.fillRect(0, 0, W, H);
      g.save(); g.translate(0, oy); g.scale(scale, scale); g.translate(-camX, 0);
      // 背景图：内联 data URL 没解开时用上一张解码好的图，再不行才退化到底色
      const img = bgOk && bg.complete && bg.naturalWidth ? bg : (bg2Ok && bg2.complete && bg2.naturalWidth ? bg2 : null);
      if (img) g.drawImage(img, 0, 0, LW, LH);
      else {
        const gr = g.createLinearGradient(0, 0, 0, LH); gr.addColorStop(0, '#2a2420'); gr.addColorStop(1, '#4a4036'); g.fillStyle = gr; g.fillRect(0, 0, LW, LH);
        // 连图都没有的那一帧：画几条石缝与轮廓，别给玩家一片纯黑
        g.strokeStyle = 'rgba(160,140,110,0.16)'; g.lineWidth = 3;
        for (let i = 0; i < 7; i++) { const y = LH * 0.45 + i * 46; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(LW * 0.5, y - 26 + i * 5, LW, y + 8); g.stroke(); }
        if (!bg2Try) { bg2Try = 1; }
      }
      g.save(); g.globalCompositeOperation = 'lighter';
      const pul = 0.5 + 0.5 * Math.sin(t * 1.3);
      let g2 = g.createRadialGradient(330, 470, 0, 330, 470, 220); g2.addColorStop(0, `rgba(120,230,220,${0.10 + 0.06 * pul})`); g2.addColorStop(1, 'rgba(120,230,220,0)'); g.fillStyle = g2; g.fillRect(80, 250, 500, 420);
      g2 = g.createRadialGradient(880, 420, 0, 880, 420, 150); g2.addColorStop(0, `rgba(255,150,70,${0.12 + 0.08 * Math.sin(t * 7) * 0.5})`); g2.addColorStop(1, 'rgba(255,150,70,0)'); g.fillStyle = g2; g.fillRect(720, 260, 320, 320);
      const h0 = game.ws.home;
      const herbs = h0 && Array.isArray(h0.plots) ? h0.plots.filter((p) => p.herb).length : 0;
      if (herbs) { g2 = g.createRadialGradient(1180, 440, 0, 1180, 440, 190); g2.addColorStop(0, `rgba(150,255,170,${0.06 + 0.03 * herbs + 0.05 * pul})`); g2.addColorStop(1, 'rgba(150,255,170,0)'); g.fillStyle = g2; g.fillRect(980, 240, 400, 400); }
      if (h0 && h0.array > 0) { const col = ['', '150,220,255', '190,170,255', '255,220,140'][h0.array]; g.strokeStyle = `rgba(${col},${0.10 + 0.08 * pul})`; g.lineWidth = 3; g.beginPath(); g.ellipse(LW / 2, LH * 0.55, LW * 0.62, LH * 0.5, 0, 0, Math.PI * 2); g.stroke(); }
      g.restore();
      // 热点提示牌
      g.textAlign = 'center'; g.font = '22px "Noto Serif SC",serif';
      for (const s of SPOTS) {
        const on = nearRef.current.spot?.id === s.id;
        g.globalAlpha = on ? 1 : 0.55;
        g.fillStyle = on ? 'rgba(255,240,200,0.95)' : 'rgba(255,240,200,0.6)';
        const ty = s.y - 200;
        g.beginPath(); g.arc(s.x, ty, on ? 7 : 5, 0, Math.PI * 2); g.fill();
        if (on) {
          g.lineWidth = 4; g.strokeStyle = 'rgba(20,14,10,0.8)';
          const tx = `【${IS_TOUCH ? '点' : keyLabel(bindOf('interact'))}】${s.name}`;
          const tw = g.measureText(tx).width;
          const tx2 = Math.max(camX + tw / 2 + 12, Math.min(camX + viewW - tw / 2 - 12, s.x));
          g.strokeText(tx, tx2, ty - 18); g.fillStyle = '#fff2cc'; g.fillText(tx, tx2, ty - 18);
        }
      }
      g.globalAlpha = 1;
      g.restore();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
      // ---- 主角移动
      let mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      let my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      mx += joy.current.x; my += joy.current.y;
      const len = Math.hypot(mx, my);
      const run = keys.has('shift') || game.input.run;
      const moving = len > 0.05 && !game.modal;
      if (moving && game.player.sitting) game.stand();
      if (moving) {
        if (len > 1) { mx /= len; my /= len; }
        const sp = run ? SPEED_RUN : SPEED_WALK;
        P.x += mx * sp * dt; P.y += my * sp * dt * 0.8; clampFloor(P);
        if (Math.abs(mx) > 0.1) P.facing = mx > 0 ? 1 : -1;
        P.st.faceToward(mx, my * 0.8, false);
        P.st.setAction(run ? 'run' : 'walk'); P.st.speed = sp;
      } else P.st.setAction(game.player.sitting ? 'sit' : 'idle');
      P.st.x = P.x; P.st.y = P.y; P.st.update(dt);

      // ---- 相机跟随主角（夹在场景边界内）
      const maxCam = Math.max(0, LW - viewW);
      camX = maxCam > 0 ? Math.max(0, Math.min(maxCam, P.x - viewW / 2)) : (LW - viewW) / 2;

      // ---- 知交：在屋里慢慢踱步，主角靠近便转身看你
      if (L) {
        L.t -= dt;
        const dP = Math.hypot(P.x - L.x, P.y - L.y);
        if (dP < 150) { L.st.faceToward(P.x - L.x, (P.y - L.y) * 0.8, false); L.st.setAction('idle'); L.t = 2; }
        else {
          if (L.t <= 0) { L.tx = 900 + Math.random() * 500; L.ty = FLOOR_TOP + 60 + Math.random() * (FLOOR_BOTTOM - FLOOR_TOP - 80); L.t = 5 + Math.random() * 6; }
          const dx = L.tx - L.x, dy = L.ty - L.y, d = Math.hypot(dx, dy);
          if (d > 6) { L.x += dx / d * 70 * dt; L.y += dy / d * 56 * dt; L.st.faceToward(dx, dy * 0.8, false); L.st.setAction('walk'); L.st.speed = 70; }
          else L.st.setAction('idle');
        }
        L.st.x = L.x; L.st.y = L.y; L.st.update(dt);
      }
      // ---- 灵宠：趴着 / 偶尔换个地方
      if (PE) {
        PE.t += dt; PE.wait -= dt;
        if (PE.wait <= 0) { PE.tx = 500 + Math.random() * 400; PE.ty = FLOOR_TOP + 80 + Math.random() * 150; PE.wait = 4 + Math.random() * 6; }
        const dx = PE.tx - PE.x, dy = PE.ty - PE.y, d = Math.hypot(dx, dy);
        if (d > 6) { PE.x += dx / d * 90 * dt; PE.y += dy / d * 70 * dt; PE.facing = dx > 0 ? 1 : -1; PE.move = Math.min(1, PE.move + dt * 4); PE.phase += dt * 8; }
        else PE.move = Math.max(0, PE.move - dt * 4);
      }
      // ---- 邻近判定
      let spot: Spot | null = null, bd = 1e9;
      for (const s of SPOTS) { const d = Math.hypot(s.x - P.x, (s.y - P.y) * 1.4); if (d < s.r && d < bd) { bd = d; spot = s; } }
      const loverNear = L && Math.hypot(L.x - P.x, (L.y - P.y) * 1.4) < 130 ? L.b.name : null;
      const petNear = PE && pet && Math.hypot(PE.x - P.x, (PE.y - P.y) * 1.4) < 120 ? pet.name : null;
      const n0 = nearRef.current;
      if (n0.spot?.id !== spot?.id || n0.lover !== loverNear || n0.pet !== petNear) setNear({ spot, lover: loverNear, pet: petNear });
      // ---- 手机点按热点
      if (act.current) { const id = act.current; act.current = null; doSpot(id); }

      // ---- 绘制：静态层（缓存）
      const skey = `${W}x${H}@${dpr}|${camX.toFixed(1)}|${bgOk ? 1 : bg2Ok ? 2 : 0}|${Math.floor(t * 2.2) % 20}|${spot?.id ?? '-'}`;
      if (skey !== statKey) { drawStatic(); statKey = skey; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#120e0a'; ctx.fillRect(0, 0, W, H);
      if (W && H) ctx.drawImage(statCv, 0, 0, W, H);
      // 按 y 排序画人与宠
      const draws: { y: number; f: () => void }[] = [];
      draws.push({ y: P.y, f: () => { ctx.save(); ctx.translate(P.x, P.y); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 4, 30, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); drawCharacter(ctx, game.player.look, P.st, 1.5, dt); } });
      if (L) draws.push({ y: L.y, f: () => { ctx.save(); ctx.translate(L.x, L.y); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 4, 28, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); drawCharacter(ctx, L.b.look, L.st, 1.45, dt);
        const nm = `${L.b.name}${loverNear ? `　【${IS_TOUCH ? '点' : keyLabel(bindOf('lover'))}】交谈` : ''}`; ctx.font = '20px "Noto Serif SC",serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,10,0.8)'; ctx.strokeText(nm, L.x, L.y - 150); ctx.fillStyle = '#ffd9e6'; ctx.fillText(nm, L.x, L.y - 150); } });
      if (PE && pet) draws.push({ y: PE.y, f: () => {
        const k = PET_KINDS[pet.kind]; const sc = (0.55 + (pet.lv || 1) * 0.05) * 1.3;
        const A: BeastAnim = { move: PE.move, phase: PE.phase, atk: 0, hit: 0, t: PE.t, flying: !!k?.flying };
        if (k?.look) { const look = pet.kind === 'huli' ? { ...k.look, tails: 1 + Math.floor((pet.lv || 1) / 3) } as BeastLook : k.look; const sk = pet.kind === 'huli' ? `p:huli${(pet.lv || 1) < 3 ? 1 : (pet.lv || 1) < 6 ? 2 : 3}` : `p:${pet.kind}`; if (!drawBeastSprite(ctx, sk, PE.x, PE.y, PE.facing, A, sc)) drawBeast(ctx, look, PE.x, PE.y, PE.facing, A, sc); }
        else { ctx.fillStyle = 'rgba(120,200,120,0.8)'; for (let i = 0; i < 12; i++) { const a = PE.t * 2 + i; ctx.beginPath(); ctx.arc(PE.x + Math.cos(a) * 26, PE.y - 20 + Math.sin(a * 1.7) * 14, 3, 0, Math.PI * 2); ctx.fill(); } }
        const nm = `${pet.name}${petNear ? `　【${IS_TOUCH ? '点' : keyLabel(bindOf('pets'))}】` : ''}`; ctx.font = '18px "Noto Serif SC",serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,14,10,0.8)'; ctx.strokeText(nm, PE.x, PE.y - 70 * sc); ctx.fillStyle = '#e0ffd8'; ctx.fillText(nm, PE.x, PE.y - 70 * sc); } });
      draws.sort((a, b) => a.y - b.y).forEach((d) => d.f());
      ctx.restore();
      // 暗角
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,6,4,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    };

    const loop = (now: number) => {
      // v0.52.6：一帧出错绝不能断 rAF 链（断了就是永远黑屏）。降级画个底色，继续跑。
      try { frame(now); bad = 0; }
      catch (e) {
        bad++;
        if (bad === 1) console.error('[cave] 帧异常，已降级继续', e);
        try {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = '#1b1610'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = 'rgba(255,230,180,0.8)'; ctx.textAlign = 'center';
          ctx.font = '18px "Noto Serif SC",serif';
          ctx.fillText('洞府画面出了点岔子，已尽量恢复（Esc 可出府）', W / 2, H / 2);
        } catch { /* 画都画不了就只保循环 */ }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 点击 / 触屏：点在热点上直接互动，点人 / 宠交谈
    const click = (e: PointerEvent) => {
      if (game.modal) return;
      const lx = e.clientX / scale + camX, ly = (e.clientY - oy) / scale;
      if (L && Math.hypot(L.x - lx, L.y - 60 - ly) < 80) { talkLover(); return; }
      if (PE && Math.hypot(PE.x - lx, PE.y - 20 - ly) < 70) { talkPet(); return; }
      for (const s of SPOTS) if (Math.hypot(s.x - lx, s.y - 200 - ly) < s.r * 1.1) { act.current = s.id; return; }
    };
    cv.addEventListener('pointerdown', click);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', fit); cv.removeEventListener('pointerdown', click); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  // 手机摇杆
  const joyRef = useRef<HTMLDivElement>(null);
  const onJoy = (e: React.PointerEvent) => {
    const el = joyRef.current; if (!el) return;
    const r = el.getBoundingClientRect(); const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const m = Math.hypot(dx, dy); joy.current = m > 1 ? { x: dx / m, y: dy / m } : { x: dx, y: dy };
  };
  const home = game.ws.home;
  const lover = game.hearts.follower();
  const petNm = game.pets.active?.name;
  const openMain = () => { try { audio.sfx('open'); game.openDialog(game.home.mainNode()); } catch (e) { game.toast('这里出了点岔子。', 'warn'); console.error('[cave] main', e); } };

  return (
    <div className="cave-scene">
      <canvas ref={ref} />
      <div className="cave-top">
        <div className="cave-title">{home?.name ?? '洞府'}<small>　灵气 ×{game.home.placeMult().toFixed(2)}　·　药园 {home?.plots?.filter((p) => p.herb).length ?? 0}/{home?.plots?.length ?? 0}</small></div>
        <div className="cave-sub">{IS_TOUCH ? '摇杆走动 · 点物件 / 人 / 宠互动' : `${keyLabel(bindOf('up'))}${keyLabel(bindOf('left'))}${keyLabel(bindOf('down'))}${keyLabel(bindOf('right'))} 走动 · ${keyLabel(bindOf('interact'))} 互动 · Esc 出府`}</div>
      </div>

      {/* v0.52.6：常驻功能条——不用走遍石室，也一定找得到「洞府事务」 */}
      <div className="cave-bar">
        {BAR.map((b) => (
          <button key={b.id} className="cave-bar-btn" onClick={() => doSpot(b.id)}>{b.n}</button>
        ))}
        <button className="cave-bar-btn main" onClick={openMain}>洞府事务</button>
        <button className="cave-bar-btn exit" onClick={() => { audio.sfx('click'); onClose(); }}>出府</button>
      </div>

      {near.spot && <button className="ink-btn cave-act" onClick={() => doSpot(near.spot!.id)}>{near.spot.name} · {near.spot.hint}</button>}
      {near.lover && <button className="ink-btn cave-act lover" onClick={talkLover}>与{near.lover}说话</button>}
      {near.pet && <button className="ink-btn cave-act pet" onClick={talkPet}>逗一逗{near.pet}</button>}
      {err && <div className="cave-err">{err}</div>}
      {IS_TOUCH && <div ref={joyRef} className="cave-joy" onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); onJoy(e); }} onPointerMove={(e) => { if (e.buttons) onJoy(e); }} onPointerUp={() => { joy.current = { x: 0, y: 0 }; }} onPointerCancel={() => { joy.current = { x: 0, y: 0 }; }}><div className="cave-joy-knob" /></div>}
    </div>
  );
}
