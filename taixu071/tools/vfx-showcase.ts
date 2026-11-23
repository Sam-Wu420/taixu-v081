import { GLStage, type PostParams } from '../src/gl/stage';
import { FxSys } from '../src/gl/fx';
import { drawHeroGL } from '../src/gl/herogl';
import { drawLingdunGL } from '../src/gl/lingdungl';
import { drawRealmFootGL, drawRealmFoot2D, getRealmFoot } from '../src/gl/realmFoot';
import { SenseFx, TIERS } from '../src/world/sense';
import { LD_TIERS, Lingdun } from '../src/world/lingdun';
import { REALMS } from '../src/data/realms';
import { WORLDS, type WorldId } from '../src/data/worldHierarchy';
import { baseSenseRange, detailSenseRange, awarenessBaseRange, effectiveAwarenessRange, SENSE_BURST_MULTIPLIER } from '../src/world/senseRange';
import { CharState, drawCharacter, HANLI_LOOK } from '../src/gfx/character';

function worldForRealm(r: number): WorldId {
  if (r <= 5) return 'human';
  if (r <= 8) return 'spirit';
  return 'immortal';
}

function calcRadii(realm: number, world: WorldId, burst: boolean, concealed: boolean) {
  const senseStat = realm === 0 ? 0 : Math.pow(4, realm) * 15;
  const base = baseSenseRange(senseStat, 1, 380, world);
  const full = awarenessBaseRange(senseStat, 1, world);
  const inner = detailSenseRange(base * (burst ? SENSE_BURST_MULTIPLIER : 1), realm, world);
  const outer = effectiveAwarenessRange(full, inner, burst, concealed);
  return { inner, outer, full, senseStat };
}

function boot() {
  const root = document.getElementById('app')!;
  const stage = GLStage.create();
  const glOk = !!stage;

  // Build UI shell
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #0d1117; color: #e6e1d6; font-family: "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif; }
      .wrap { max-width: 1280px; margin: 0 auto; padding: 14px 16px 28px; }
      .hdr { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 10px; }
      .hdr h1 { margin: 0; font-size: 20px; letter-spacing: 1px; color: #f2dfb1; }
      .hdr .sub { font-size: 12px; color: #9ea6b2; }
      .bar { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; align-items: center; }
      .pill { cursor: pointer; border: 1px solid #303a4a; background: #161c26; color: #cfc9bc; padding: 5px 10px; border-radius: 6px; font-size: 12px; transition: all .15s; font-family: inherit; }
      .pill:hover { border-color: #7c6943; color: #fff; }
      .pill.on { background: #2d2618; border-color: #d9b66b; color: #ffe7a8; font-weight: 600; }
      .pill.btn-act { border-color: #3a6b63; color: #9ef0dc; }
      .pill.btn-act.on { background: #143630; border-color: #5ee6c7; color: #d8fff6; }
      .stage-box { position: relative; border: 1px solid #2b3240; border-radius: 10px; overflow: hidden; background: #131820; box-shadow: 0 12px 36px rgba(0,0,0,.55); }
      .stage-box canvas { display: block; width: 100%; height: 520px; }
      .hud { position: absolute; left: 12px; top: 12px; background: rgba(12,16,22,0.78); backdrop-filter: blur(6px); border: 1px solid rgba(217,182,107,0.28); border-radius: 8px; padding: 10px 12px; font-size: 12px; line-height: 1.65; pointer-events: none; max-width: 340px; }
      .hud b { color: #ffe7a8; }
      .hud .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 11px; margin-left: 6px; background: rgba(94,230,199,0.14); color: #8cf2da; border: 1px solid rgba(94,230,199,0.35); }
      .legend { position: absolute; right: 12px; top: 12px; background: rgba(12,16,22,0.78); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 11px; font-size: 12px; line-height: 1.7; pointer-events: none; }
      .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
      .grid-title { margin: 16px 0 8px; font-size: 14px; color: #d9be78; display: flex; justify-content: space-between; align-items: center; }
      .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(175px, 1fr)); gap: 10px; }
      .card { background: #151a23; border: 1px solid #262e3d; border-radius: 8px; padding: 8px; cursor: pointer; transition: border-color .15s, transform .15s; }
      .card:hover { border-color: #6a5b3b; transform: translateY(-1px); }
      .card.on { border-color: #d9b66b; background: #1d1a14; }
      .card canvas { width: 100%; height: 120px; display: block; border-radius: 6px; background: radial-gradient(circle at 50% 50%, #1a212d 0%, #0d1016 100%); }
      .card .meta { margin-top: 6px; font-size: 11px; color: #b7b1a4; line-height: 1.45; }
      .card .meta strong { color: #f2dfb1; font-size: 12px; }
    </style>
    <div class="wrap">
      <div class="hdr">
        <h1>太虚仙途 · 全阶境界特效与神识双圈实机图鉴（0–12 阶）</h1>
        <div class="sub">引擎模式：<b>${glOk ? 'WebGL2 实时后期 + 泛光渲染' : 'Canvas2D 回退渲染'}</b> · 所有光环 / 护盾 / 神识纹理均直接由游戏源码实时生成</div>
      </div>
      <div class="bar" id="realm-bar"></div>
      <div class="bar" id="ctrl-bar"></div>
      <div class="stage-box" id="stage-box">
        <div class="hud" id="hud"></div>
        <div class="legend">
          <div><span class="dot" style="border: 1.5px dashed #e3b278"></span><b>清晰内圈</b>（detailSenseRadius · 施法锁定与细查边界）</div>
          <div><span class="dot" style="border: 1.5px solid #5ee6c7"></span><b>神识外圈</b>（awarenessRadius · 粗略气息与水墨星图）</div>
          <div><span class="dot" style="background: rgba(255,215,120,0.85)"></span><b>周身光环 + 灵力护盾</b>（不遮挡人物主体）</div>
        </div>
      </div>
      <div class="grid-title">
        <span>全阶境界神识纹理与护盾配色总览（点击卡片直接切换查看）</span>
        <span style="font-size:12px;color:#9ea6b2">人界(0-5) · 灵界(6-8) · 仙界(9-12)</span>
      </div>
      <div class="gallery" id="gallery"></div>
    </div>
  `;

  const state = {
    realm: 8,
    world: 'spirit' as WorldId,
    burst: false,
    concealed: false,
    sitting: false,
    flying: false,
    shieldOn: false,
    viewMode: 'near' as 'near' | 'both' | 'far',
    autoTour: false,
  };

  const realmBar = document.getElementById('realm-bar')!;
  const ctrlBar = document.getElementById('ctrl-bar')!;
  const hudEl = document.getElementById('hud')!;
  const stageBox = document.getElementById('stage-box')!;

  const realmBtns: HTMLButtonElement[] = [];
  for (let r = 0; r <= 12; r++) {
    const b = document.createElement('button');
    b.className = 'pill';
    b.textContent = `${r} ${REALMS[r].name}`;
    b.onclick = () => {
      state.realm = r;
      state.world = worldForRealm(r);
      state.autoTour = false;
      syncUI();
    };
    realmBar.appendChild(b);
    realmBtns.push(b);
  }

  function addToggle(label: string, get: () => boolean, toggle: () => void, act = false) {
    const b = document.createElement('button');
    b.className = 'pill' + (act ? ' btn-act' : '');
    b.textContent = label;
    b.onclick = () => { toggle(); syncUI(); };
    ctrlBar.appendChild(b);
    return { b, get };
  }

  const toggles = [
    addToggle('R 敛息（虚）', () => state.concealed, () => { state.concealed = true; state.burst = false; }, true),
    addToggle('正常（半实）', () => !state.concealed && !state.burst, () => { state.concealed = false; state.burst = false; }, true),
    addToggle('Q 外放（全实）', () => state.burst, () => { state.burst = true; state.concealed = false; }, true),
    addToggle('打坐吐纳', () => state.sitting, () => { state.sitting = !state.sitting; if (state.sitting) state.flying = false; }),
    addToggle('御空飞遁', () => state.flying, () => { state.flying = !state.flying; if (state.flying) state.sitting = false; }),
    addToggle('灵力护盾', () => state.shieldOn, () => { state.shieldOn = !state.shieldOn; }),
    addToggle('近景（看脚底法阵+升腾烟雾）', () => state.viewMode === 'near', () => { state.viewMode = 'near'; }),
    addToggle('双圈全景', () => state.viewMode === 'both', () => { state.viewMode = 'both'; }),
    addToggle('远景（外放全圈）', () => state.viewMode === 'far', () => { state.viewMode = 'far'; }),
    addToggle('自动巡览各阶', () => state.autoTour, () => { state.autoTour = !state.autoTour; }),
  ];

  const hitBtn = document.createElement('button');
  hitBtn.className = 'pill';
  hitBtn.textContent = '模拟护盾受击/碎盾';
  ctrlBar.appendChild(hitBtn);

  // Canvas & GL setup
  const W = 1240, H = 520;
  const viewCanvas = stage ? stage.canvas : document.createElement('canvas');
  viewCanvas.width = W;
  viewCanvas.height = H;
  stageBox.insertBefore(viewCanvas, hudEl);

  const sceneCanvas = document.createElement('canvas');
  sceneCanvas.width = W;
  sceneCanvas.height = H;
  const sctx = sceneCanvas.getContext('2d')!;

  const atmoCanvas = document.createElement('canvas');
  atmoCanvas.width = 4;
  atmoCanvas.height = 4;

  if (stage) {
    stage.resize(W, H);
    stage.bloomOn = true;
    stage.bloomLevels = 2;
  }
  const fx = stage ? new FxSys(stage.batch) : null;
  const senseFx = new SenseFx();
  const charSt = new CharState(0, 0);

  const mockGame: any = {
    hero: { realm: state.realm, stage: 2, dead: false, mp: 1, hp: 1, equip: {} },
    player: { x: 0, y: 0, st: charSt, sitting: false, flying: false, boosting: false },
    concealed: false,
    senseBurstT: 0,
    trauma: 0,
  };
  const mockCombat: any = {
    game: mockGame,
    pStats: { hp: 10000 },
    combatT: 0,
    inCombat: true,
    shield: null,
    texts: [],
    ghosts: [],
    wing: null,
    clones: [],
    buffs: { until: {} },
  };
  const lingdun = new Lingdun(mockCombat);
  mockCombat.lingdun = lingdun;

  function resetShield() {
    const n = Math.max(0, LD_TIERS[state.realm]?.layers ?? 0);
    lingdun.cap = 1000;
    lingdun.hp = Array(n).fill(1000);
    lingdun.shown = state.shieldOn && n > 0 ? 1 : 0;
    lingdun.evq.length = 0;
  }
  resetShield();

  hitBtn.onclick = () => {
    if (!state.shieldOn || !lingdun.hp.length) { state.shieldOn = true; resetShield(); syncUI(); return; }
    lingdun.absorb(650, 120, -40);
    if (lingdun.hp.every((v) => v <= 0) || !lingdun.hp.length) resetShield();
  };

  // Build 13-realm gallery cards
  const galleryEl = document.getElementById('gallery')!;
  const cards: HTMLElement[] = [];
  for (let r = 0; r <= 12; r++) {
    const card = document.createElement('div');
    card.className = 'card';
    const cv = document.createElement('canvas');
    cv.width = 240;
    cv.height = 150;
    const gctx = cv.getContext('2d')!;
    const s = TIERS[r];
    const ld = LD_TIERS[r];
    const w = worldForRealm(r);
    const rrN = calcRadii(r, w, false, false);
    const rrB = calcRadii(r, w, true, false);

    // Draw REAL 2.5D bespoke underfoot realm formation from getRealmFoot(r)
    gctx.clearRect(0, 0, 240, 150);
    if (r >= 1) {
      const ft = getRealmFoot(r);
      const rr = Math.min(98, ft.r * 0.86);
      gctx.save();
      gctx.translate(120, 96);
      gctx.scale(1, 0.44);
      gctx.drawImage(ft.base, -rr, -rr, rr * 2, rr * 2);
      gctx.drawImage(ft.spin, -rr, -rr, rr * 2, rr * 2);
      gctx.restore();
    }
    // Standing silhouette above underfoot formation
    gctx.save();
    gctx.fillStyle = 'rgba(232,226,214,0.88)';
    gctx.beginPath(); gctx.arc(120, 48, 6.5, 0, Math.PI * 2); gctx.fill();
    gctx.beginPath(); gctx.roundRect(113, 56, 14, 34, 5); gctx.fill();
    gctx.restore();

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `
      <div><strong>${r} · ${REALMS[r].name}</strong> (${WORLDS[w].name})</div>
      <div>神识：${s.name}</div>
      <div>护盾：${ld.name || '无'} (${ld.layers}层)</div>
      <div>常态：内 ${Math.round(rrN.inner)} / 外 ${Math.round(rrN.outer)}</div>
      <div>外放：内 ${Math.round(rrB.inner)} / 外 ${Math.round(rrB.outer)}</div>
    `;
    card.appendChild(cv);
    card.appendChild(meta);
    card.onclick = () => {
      state.realm = r;
      state.world = w;
      state.autoTour = false;
      syncUI();
    };
    galleryEl.appendChild(card);
    cards.push(card);
  }

  function syncUI() {
    realmBtns.forEach((b, i) => b.classList.toggle('on', i === state.realm));
    cards.forEach((c, i) => c.classList.toggle('on', i === state.realm));
    toggles.forEach((t) => t.b.classList.toggle('on', t.get()));
    mockGame.hero.realm = state.realm;
    mockGame.concealed = state.concealed;
    mockGame.senseBurstT = state.burst ? 5 : 0;
    mockGame.player.sitting = state.sitting;
    mockGame.player.flying = state.flying;
    if (lingdun.hp.length !== (LD_TIERS[state.realm]?.layers ?? 0)) resetShield();
    lingdun.shown = state.shieldOn && lingdun.hp.length > 0 ? 1 : 0;

    const rr = calcRadii(state.realm, state.world, state.burst, state.concealed);
    const tierS = TIERS[state.realm];
    const ldS = LD_TIERS[state.realm];
    const gapPct = Math.round((rr.outer / Math.max(1, rr.inner) - 1) * 100);
    const stateTxt = state.concealed ? '敛息（虚 · 隐匿收敛）' : state.burst ? '神识外放（全实 · 灵烟澎湃）' : '正常（半实 · 灵烟徐升）';
    hudEl.innerHTML = `
      <div><b>${REALMS[state.realm].name}</b> <span class="tag">${WORLDS[state.world].name}</span></div>
      <div>气息状态：<b>${stateTxt}</b></div>
      <div>神识特效：<b>${tierS.name}</b></div>
      <div>灵力护盾：<b>${ldS.name || '无'}</b>（${ldS.layers}层）</div>
      <div>清晰内圈 / 外圈：<b>${Math.round(rr.inner)}</b> / <b>${Math.round(rr.outer)}</b> 步（<b>+${gapPct}%</b>）</div>
    `;
  }
  syncUI();

  let last = performance.now();
  let t = 0;
  let tourT = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    if (state.autoTour) {
      tourT += dt;
      if (tourT > 2.4) {
        tourT = 0;
        state.realm = (state.realm + 1) % 13;
        state.world = worldForRealm(state.realm);
        syncUI();
      }
    }

    const rr = calcRadii(state.realm, state.world, state.burst, state.concealed);
    senseFx.hidden += ((state.concealed ? 1 : 0) - senseFx.hidden) * Math.min(1, dt * 6);
    senseFx.update(dt * 3.5, rr.outer, rr.inner);

    const targetZoom = state.viewMode === 'near'
      ? 1.55
      : state.viewMode === 'far'
        ? Math.min(0.55, (H * 0.43) / Math.max(320, rr.outer))
        : Math.min(0.75, (H * 0.42) / Math.max(260, rr.inner * 1.15));

    charSt.lift += ((state.flying ? 70 : 0) - charSt.lift) * Math.min(1, dt * 6);
    charSt.setAction(state.sitting ? 'sit' : state.flying ? 'fly' : 'idle');
    charSt.update(dt);

    // Draw background terrain & character onto sceneCanvas
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = sctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.65);
    bg.addColorStop(0, state.world === 'immortal' ? '#1c2430' : state.world === 'spirit' ? '#182426' : '#1b221e');
    bg.addColorStop(1, '#0c1016');
    sctx.fillStyle = bg;
    sctx.fillRect(0, 0, W, H);

    sctx.save();
    sctx.translate(W / 2, H / 2);
    sctx.scale(targetZoom, targetZoom);

    // Subtle ground grid + range reference rings
    const step = 200;
    sctx.strokeStyle = 'rgba(255,255,255,0.04)';
    sctx.lineWidth = 1 / targetZoom;
    const span = Math.ceil(Math.max(W, H) / targetZoom / 2 / step + 1) * step;
    sctx.beginPath();
    for (let gx = -span; gx <= span; gx += step) {
      sctx.moveTo(gx, -span); sctx.lineTo(gx, span);
      sctx.moveTo(-span, gx); sctx.lineTo(span, gx);
    }
    sctx.stroke();

    // Shadow & Character
    sctx.fillStyle = 'rgba(0,0,0,0.38)';
    sctx.beginPath();
    sctx.ellipse(0, 2, 22 + charSt.lift * 0.25, 7 + charSt.lift * 0.05, 0, 0, Math.PI * 2);
    sctx.fill();
    drawCharacter(sctx, HANLI_LOOK, charSt, 1.12, dt, {});

    if (!stage || !fx) {
      senseFx.drawPooled(sctx, 0, 0, t);
      senseFx.drawInner(sctx, 0, 0, state.realm, t, targetZoom);
      drawRealmFoot2D(sctx, 0, -charSt.lift + 3, state.realm, t, { concealed: state.concealed, burst: state.burst, sitting: state.sitting, flying: state.flying });
    }
    sctx.restore();

    if (stage && fx) {
      const B = stage.batch;
      B.reset(0, 0, targetZoom, W, H, stage.atlas);
      fx.update(dt);
      senseFx.drawGL(fx, stage, 0, 0, state.realm, [], t, targetZoom);
      senseFx.drawInnerGL(fx, stage, 0, 0, state.realm, t, targetZoom);
      drawRealmFootGL(fx, stage, 0, -charSt.lift + 3, state.realm, t, dt, { concealed: state.concealed, burst: state.burst, sitting: state.sitting, flying: state.flying });
      drawHeroGL(fx, mockCombat, t, dt);
      if (state.shieldOn) drawLingdunGL(fx, mockCombat, t, dt, charSt.lift);
      fx.flushBake(stage.atlas);

      const tierS = TIERS[state.realm];
      const P: PostParams = {
        t,
        mul: [1, 1, 1],
        warm: 0.08,
        dusk: 0,
        sense: {
          on: true,
          x: W / 2,
          y: H / 2,
          R: rr.inner * targetZoom,
          ink: [tierS.ink[0] / 255, tierS.ink[1] / 255, tierS.ink[2] / 255],
          glow: [tierS.glow[0] / 255, tierS.glow[1] / 255, tierS.glow[2] / 255],
          hide: senseFx.hidden,
          alarm: 0,
        },
        atmo: null,
        fog: [0, 0, 0, 0],
        fogBands: 0,
        flash: [0, 0, 0, 0],
        tint: [0, 0, 0, 0],
        vig: 0.25,
        hurt: 0,
        fade: 0,
        aberr: 0,
        bloom: 0.65,
        grain: 0.02,
        sat: 1.05,
      };
      stage.render(sceneCanvas, atmoCanvas, P, 1);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();
