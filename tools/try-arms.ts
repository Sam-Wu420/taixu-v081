// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=arms[&kind=sword|heavy|spear|fist|bond][&tier=0–6]
// 近战兵器线：主角拿着指定兵器站在一片空地上，循环演示这种兵器的每个动作（轻击连段、重击、突进），右上角写着当前是哪个动作。
// 兵器从兵器槽来（kind=bond 是兵器槽空着、本命法宝结的是碧竹飞云剑——握在手里当剑使）。
// 其他参数：
//   &pose=idle|walk|run|fly|sit   不演招，摆这个姿势（兵器收着，斜背在背后；idle 是拿在手里站着）
//   &act=swordL3                  只循环这一个动作
//   &yaw=0.6                      人物朝向（弧度，0 是正对镜头）
//   &hour=night|dusk|noon         定住时辰（夜里看光影下有没有穿帮）
//   &hud=0                        不显示角上的动作名
// 页面上留 window.__arms：hold('swordL1', 0.5) 定在某动作的某个进度（截图用）、play() 接着循环、pose('fly')、hour('night')、yaw(1.2)、list。
import type { Game } from '../src/world/game';
import { DAY_CYCLE } from '../src/world/game';
import * as C from '../src/world/cultivation';
import { WEAPON_MOVES, ACTION_DUR, ACTION_NAMES, isWeaponAction, type Action } from '../src/gfx/character';
import { WEAPONS, WEAPON_TIERS, weaponItemId, type WeaponKind } from '../src/data/weapons';
import { LOC_BY_ID, WORLD_SCALE } from '../src/data/world';

type W = Window & { __arms?: Record<string, unknown>; __armsReady?: boolean };
const HOURS: Record<string, number> = { dawn: 0.262, noon: 0.5, dusk: 0.738, night: 0.95, midnight: 0.02 };

/** 一片开阔平地（离城镇、宗门远，周围都站得住） */
function openField(g: Game): { x: number; y: number } | null {
  const T = g.terrain, p = g.player;
  const ok = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2200)) return false;
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
      const x = cx + i * 300, y = cy + j * 260;
      if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || g.space.blocked(x, y) || g.combat.safeAt(x, y)) return false;
    }
    return true;
  };
  for (let r = 0; r <= 24000; r += 800) {
    const n = Math.max(1, Math.round(r / 500));
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (ok(x, y)) return { x, y }; }
  }
  return null;
}

/** 梁京城外的平野（和 try-gfx 的取景地同一路找法）：地势平、周围没有山石遮挡 */
function cityField(g: Game): { x: number; y: number } | null {
  const city = LOC_BY_ID.get('yuejing'); if (!city) return null;
  const x0 = city.x * WORLD_SCALE, y0 = city.y * WORLD_SCALE, T = g.terrain;
  const h0 = (x: number, y: number) => T.surfaceHeight(x, y);
  for (let r = 9000; r <= 22000; r += 1000) for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8 + 0.3, x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r;
    if (g.combat.safeAt(x, y) || T.inLocZone(x, y, 1800)) continue;
    let ok = true; const hc = h0(x, y);
    for (let j = 0; j < 16 && ok; j++) for (const d of [300, 700]) {
      const qx = x + Math.cos(j * Math.PI / 8) * d, qy = y + Math.sin(j * Math.PI / 8) * d * 0.7;
      if (T.walkFactor(qx, qy) <= 0 || !T.isLand(qx, qy) || g.space.blocked(qx, qy) || Math.abs(h0(qx, qy) - hc) > 60) ok = false;
    }
    if (ok) return { x, y };
  }
  return null;
}

export function tryArms(g: Game, params: URLSearchParams) {
  const w = window as W;
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    const h = g.hero, p = g.player, st = p.st;
    h.realm = Math.max(h.realm, 3); h.stage = 0; h.hp = 1; h.mp = 1;
    const kindP = (params.get('kind') ?? 'sword') as WeaponKind | 'bond';
    const tier = Math.max(0, Math.min(6, Number(params.get('tier') ?? 3)));
    const kind: WeaponKind = kindP === 'bond' ? 'sword' : kindP;
    // 兵器：兵器槽里穿一把（bond：槽空着，本命结碧竹飞云剑）
    const ls = C.itemListeners.splice(0);
    for (const b of h.bag) if (b.worn === 'weapon') C.unwearGear(h, 'weapon');
    if (kindP === 'bond') { C.addItem(h, 'art_qingzhu', 1); C.bindBond(h, 'art_qingzhu'); }
    else if (kind !== 'fist') { const id = weaponItemId(kind, tier); C.addItem(h, id, 1); const b = h.bag.filter((x) => x.id === id && !x.worn).pop(); if (b) C.wearGear(h, b); }
    C.itemListeners.push(...ls);
    const f = cityField(g) ?? openField(g); if (f) g.teleport(f.x, f.y);
    g.combat.enemies.length = 0;
    g.updateUI(true);

    // 演示序列：拿着兵器站一下 → 轻击连段 → 重击 → 突进
    const mv = WEAPON_MOVES[kind];
    const only = params.get('act') as Action | null;
    const list: Action[] = only ? [only] : ['idle', ...mv.light, ...mv.heavy, mv.rush];
    let yaw = Number(params.get('yaw') ?? 0.6);
    let i = -1, t0 = performance.now(), pin: { a: Action; t: number } | null = null;
    let pose: string | null = params.get('pose');
    let cur: Action | null = null;
    const durOf = (a: Action) => (a === 'idle' ? 1.1 : isWeaponAction(a) ? ACTION_DUR[a] : a === 'smash' ? 0.6 : a === 'rush' ? 0.45 : 0.36) + 0.4;
    // 动作由这里接管（游戏每帧问一次 actionOverride；不改游戏本身）
    const combat = g.combat as unknown as { actionOverride(): Action | null };
    const ov0 = combat.actionOverride.bind(g.combat);
    combat.actionOverride = () => {
      if (pose) return pose === 'idle' || pose === 'fly' ? null : (pose as Action);
      if (pin) return pin.a === 'idle' ? null : pin.a;
      return cur && cur !== 'idle' ? cur : null;
    };
    void ov0;
    const up0 = st.update.bind(st);
    st.update = (dt: number) => {
      up0(dt);
      st.yaw = st.targetYaw = yaw;
      st.armed = kind !== 'fist' && (pose === null || pose === 'idle');
      if (pin) { st.actionT = pin.t; st.blend = 1; st.from = null; }
    };
    const hud = document.createElement('div');
    hud.id = 'arms-hud';
    hud.style.cssText = 'position:fixed;right:14px;top:12px;z-index:9999;padding:8px 14px;border-radius:6px;background:rgba(14,10,6,.82);border:1px solid rgba(216,180,101,.5);color:#f1e4c4;font:15px/1.5 "Noto Serif SC",serif;pointer-events:none;white-space:pre';
    if (params.get('hud') !== '0') document.body.appendChild(hud);
    const wname = kindP === 'bond' ? '本命飞剑·碧竹飞云剑（握在手里当剑）' : kind === 'fist' ? '空手' : `${WEAPONS[kind].name}·${WEAPON_TIERS[kind][tier].name}（${tier} 阶）`;
    const show = () => {
      const a = pin?.a ?? (pose ? (pose as Action) : cur ?? 'idle');
      const name = pose ? `${ACTION_NAMES[a as Action] ?? pose}（兵器收着）` : a === 'idle' ? '持兵器站立' : ACTION_NAMES[a];
      hud.textContent = `${wname}\n${name}　${pose ? '' : a}${pin ? `　进度 ${(pin.t / (isWeaponAction(pin.a) ? ACTION_DUR[pin.a] : 0.4)).toFixed(2)}` : !pose && !only ? `　${i + 1} / ${list.length}` : ''}`;
    };
    let hold: number | null = null;
    const api = {
      list,
      /** 定在动作 a 的进度 k（0–1） */
      hold(a: Action, k: number) { pose = null; const d = isWeaponAction(a) ? ACTION_DUR[a] : 0.4; if (!pin || pin.a !== a) st.restart(a); pin = { a, t: Math.max(0, Math.min(1, k)) * d }; show(); },
      play() { pin = null; pose = null; i = -1; t0 = 0; },
      pose(name: string | null) { pin = null; pose = name; if (name === 'fly') { p.flying = true; p.z = p.zTarget = 56; } else { p.flying = false; p.z = p.zTarget = 0; } show(); },
      hour(name: string) { const ph = HOURS[name] ?? 0.5; if (hold) clearInterval(hold); const set = () => { g.clock = (Math.floor(g.clock / DAY_CYCLE) + ph) * DAY_CYCLE; }; set(); hold = window.setInterval(set, 100); },
      yaw(v: number) { yaw = v; },
    };
    w.__arms = api;
    if (params.get('hour')) api.hour(params.get('hour')!);
    if (pose) api.pose(pose);
    const tick = () => {
      h.hp = 1; g.combat.enemies.length = 0;
      if (!pin && !pose) {
        const now = performance.now();
        if (i < 0 || (now - t0) / 1000 > durOf(list[i])) {
          i = (i + 1) % list.length; t0 = now; cur = list[i];
          if (cur !== 'idle') st.restart(cur);
        } else if (cur && cur !== 'idle' && (now - t0) / 1000 > durOf(cur) - 0.4) cur = 'idle';
      }
      show();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    w.__armsReady = true;
  }, 6500);
}
