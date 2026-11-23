// 法宝匣缩略图：尽量用真实外观。
// · 妖兽 / 修士 / 灵宠：借游戏自己的绘制——每帧末临时放一只「影子单位」进战场名单，渲染器收集绘制表时把它那一项摘出来，
//   画进一张离屏画布、裁掉空白、缩成方图缓存（一帧最多画三只）。画不出东西（例如交给 3D 框架接管的傀儡）就退回字形。
// · 有名人物：立绘（原版 art/npc、模组框架登记的立绘）。
// · 物品、法术：开发版里能拿到原版图标表就用图标；正式版退回字形。
// 都只在界面需要时排队，画过一次就缓存，不存盘。
const SIZE = 96, CW = 512, CH = 512, OX = 256, OY = 430;

export function createThumbs({ G, U, H, enemyClass, onReady }) {
  const cache = new Map();          // key → dataURL | '' (画不出)
  const queue = [], queued = new Set();
  let pending = [];                 // 本帧放进战场的影子单位
  let seq = 0, dev = null, devTried = false;
  const ok = typeof document !== 'undefined' && typeof Image !== 'undefined';
  const cv = ok ? Object.assign(document.createElement('canvas'), { width: CW, height: CH }) : null;
  const cx = cv?.getContext('2d', { willReadFrequently: true }) ?? null;

  // ---------------- 开发版：原版图标表、立绘表（vite 开发服务器上同一份模块）；正式版没有就算了
  function tryDev() {
    if (devTried || !ok) return; devTried = true;
    const vite = !!document.querySelector('script[src*="/@vite/client"]');
    if (!vite) return;
    const imp = (p) => import(/* @vite-ignore */ new URL(p, location.origin).href).catch(() => null);
    Promise.all([imp('/src/gfx/icons.ts'), imp('/src/gfx/skillIconData.ts'), imp('/src/data/portraits.ts')]).then(([ic, sk, pt]) => {
      dev = { icon: ic?.paintedIcon ?? null, skill: sk?.SKILL_ICON ?? null, named: pt?.namedPortrait ?? null, npc: pt?.npcPortrait ?? null };
      onReady?.();
    });
  }
  const probe = new Map();   // url → true/false/undefined（加载中）
  function img(url, key) {
    if (!url) return null;
    const p = probe.get(url);
    if (p === true) return url; if (p === false) return null;
    if (p === undefined) { probe.set(url, null); const im = new Image(); im.onload = () => { probe.set(url, true); cache.delete(key); onReady?.(); }; im.onerror = () => { probe.set(url, false); onReady?.(); }; im.src = url; }
    return null;
  }

  /** 条目 → 缩略图网址（还没有就排队，返回 null） */
  function get(e) {
    if (!ok || !e) return null;
    tryDev();
    const key = keyOf(e); if (!key) return null;
    if (cache.has(key)) return cache.get(key) || null;
    if (e.kind === 'item') { const u = dev?.icon?.(e.id); if (u) { cache.set(key, u); return u; } return null; }
    if (e.kind === 'art') { const u = dev?.skill?.[e.id]; if (u) { cache.set(key, u); return u; } return null; }
    if (e.kind === 'npc') {
      const n = G()?.npcs?.byId?.get(e.id);
      const drg = globalThis.DrGNext?.portraitOf?.(e.name);
      const u = drg || (n && dev?.npc?.(n)) || dev?.named?.(e.name) || img(`./art/npc/${e.id}.webp`, key);
      if (u) { cache.set(key, u); return u; }
      return null;
    }
    if (e.kind === 'enemy' || e.kind === 'pet') {
      const drg = e.kind === 'enemy' ? globalThis.DrGNext?.portraitOf?.(e.name) : null;
      if (drg) { cache.set(key, drg); return drg; }
      if (!queued.has(key)) { queued.add(key); queue.push({ key, e }); }
      return null;
    }
    return null;
  }
  const keyOf = (e) => (e.kind === 'enemy' ? 'e:' + e.id : e.kind === 'pet' ? 'p:' + e.id : e.kind === 'npc' ? 'n:' + e.id : e.kind === 'item' ? 'i:' + e.id : e.kind === 'art' ? 'a:' + e.id : null);
  const has = (e) => { const k = keyOf(e); return !!(k && cache.get(k)); };

  // ---------------- 帧末：放影子单位（由 index.js 的 update 包装调用）
  function pre() {
    if (!ok || !queue.length || pending.length) return;
    const g = G(), E = enemyClass(g); if (!g || !E) return;
    const p = g.player, C = g.combat, base = Math.floor(p.y) + 0.25;
    for (let n = 0; n < 3 && queue.length; n++) {
      const job = queue.shift(); let def = null, fake = null;
      if (job.e.kind === 'enemy') def = U.ENEMIES[job.e.id];
      else {
        let pk = null; try { pk = globalThis.__modHost && G() ? petKinds()[job.e.id] : null; } catch { /* */ }
        if (pk?.look) { fake = `__shthumb_${job.e.id}`; def = { id: fake, name: pk.name, kind: 'beast', look: pk.look, hp: 1, atk: 1, def: 1, speed: 0, drops: [], minDanger: 0, maxDanger: 0, flying: !!pk.flying }; if (U.BEAST_SPR['p:' + job.e.id]) U.BEAST_SPR['e:' + fake] = U.BEAST_SPR['p:' + job.e.id]; }
      }
      if (!def) { cache.set(job.key, ''); queued.delete(job.key); continue; }
      let e = null;
      try { e = new E(def, p.x, base + (++seq % 997) * 0.001, 1, 0); } catch { e = null; }
      if (!e) { cache.set(job.key, ''); queued.delete(job.key); if (fake) delete U.BEAST_SPR['e:' + fake]; continue; }
      e.busy = true; e.aggro = false; e.facing = 1; e.anim.t = 0.6; e.__shThumb = true;
      if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.yaw = Math.PI / 2; }
      C.enemies.push(e);
      pending.push({ job, e, fake, tries: job.tries ?? 0 });
    }
  }
  let petCache = null;
  function petKinds() { if (!petCache) { try { petCache = globalThis.__shahe?.petKinds?.() ?? {}; } catch { petCache = {}; } } return petCache; }

  // ---------------- 渲染器收集绘制表时：摘出影子单位那几项，画进离屏画布
  function collect(list) {
    if (!pending.length) return;
    const C = G()?.combat;
    const frac = (y) => y - Math.floor(y);
    for (const pd of pending) {
      const want = frac(pd.e.y);
      let hit = -1;
      for (let i = list.length - 1; i >= 0; i--) { const it = list[i]; if (it && typeof it.y === 'number' && Math.abs(frac(it.y) - want) < 1e-6 && Math.abs((it.y % 200000) - (pd.e.y % 200000)) < 1) { hit = i; break; } }
      let url = '';
      if (hit >= 0) {
        const it = list.splice(hit, 1)[0];
        try { url = shoot(it, pd.e); } catch { url = ''; }
      }
      if (C) { const i = C.enemies.indexOf(pd.e); if (i >= 0) C.enemies.splice(i, 1); }
      if (pd.fake) delete U.BEAST_SPR['e:' + pd.fake];
      // 贴图类妖兽第一帧常常还没备好贴图（退回程序画）：一秒后再画一次
      const spr = pd.job.e.kind === 'enemy' && U.BEAST_SPR['e:' + pd.job.e.id];
      if (spr && pd.tries < 1) { pd.job.tries = pd.tries + 1; setTimeout(() => { queue.push(pd.job); }, 900); }
      else queued.delete(pd.job.key);
      if (url || !cache.has(pd.job.key)) cache.set(pd.job.key, url);
    }
    pending = [];
    onReady?.();
  }
  function shoot(it, e) {
    if (!cx) return '';
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, CW, CH);
    cx.save(); cx.translate(OX - e.x, OY - e.y); it.draw(cx); cx.restore();
    const id = cx.getImageData(0, 0, CW, CH), d = id.data;
    let x0 = CW, y0 = CH, x1 = -1, y1 = -1, amax = 0;
    for (let y = 0; y < CH; y += 2) for (let x = 0; x < CW; x += 2) { const a = d[(y * CW + x) * 4 + 3]; if (a > amax) amax = a; if (a > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0 || x1 - x0 < 6 || y1 - y0 < 6) return '';
    // 神识边缘、隐匿妖兽画出来是半透明的：整体提回不透明
    if (amax > 0 && amax < 240) { const k = 255 / amax; for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i] * k); cx.putImageData(id, 0, 0); }
    x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(CW, x1 + 5); y1 = Math.min(CH, y1 + 5);
    const w = x1 - x0, h = y1 - y0, s = Math.min((SIZE - 6) / w, (SIZE - 6) / h, 1.6);
    const out = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE }), o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(cv, x0, y0, w, h, (SIZE - w * s) / 2, SIZE - 3 - h * s, w * s, h * s);
    return out.toDataURL('image/webp', 0.86);
  }
  /** 整张清掉重画（设置里的「重画缩略图」） */
  function reset() { cache.clear(); queue.length = 0; queued.clear(); petCache = null; for (const [u, v] of probe) if (v === false) probe.delete(u); }
  const busy = () => queue.length > 0 || pending.length > 0;
  return { get, has, pre, collect, reset, busy, cache };
}
