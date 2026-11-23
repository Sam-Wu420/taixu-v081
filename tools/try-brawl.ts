// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=brawl —— 贴身斗法（world/brawl.ts）
// 全新开局：结丹（四式都会、已放进技能栏 1–4），找一片开阔平地，面前一个不还手的木人桩、一个会还手的体修、一头妖兽；已进近战架势。
// 可选：&foe=0 不放会还手的体修（截图用）；&calm=1 三个都不主动出手。
// E2 加的参数：
//   &at=rocks   礁石滩：海边，身边摆一圈礁石、巨石、枯树、船骸（被轰飞的人撞上就碎）
//   &at=sea     海面上空：御剑低飞在近海的水面上，对手也悬在水面上（往下砸 → 冲天水柱；平着轰飞 → 犁出水沟）
//   &foe=school 各派体修：青玄门、断刀坞、重岳剑门、玄煞宗、体修散修各一人，一头五阶走兽，再加一个青霞谷剑修（被体修盯上会后撤布阵）
//   &clash=1    一上来就拼招（体修扑过来、你也扑过去，两边撞上）
// 兵器线加的参数：
//   &wpn=sword|heavy|spear|fist|bond   直接拿着那种兵器进场（兵器槽里穿一把；bond = 槽空着、本命结碧竹飞云剑，握在手里当剑）
//   &tier=0–6                          兵器品阶（默认 3）
//   &foe=armed                         几个拿不同兵器的人形对手（剑、刀、锤、枪各一个，会贴身打你），外加木人桩
// r7 撼山客传的招：&learn=hs  直接学会一寸崩、震脚（法术书里有，已放进技能栏第 5、6 格）
// 撼山客第三批：&learn=hs3[&realm=5]   直接会千钧坠、一拳破界（技能栏 5、6；破界要化神）
// r8-p2 撼山客第二阶段：&learn=p2   直接会赤焰回旋腿、炎阳炮拳、赤阳罡（技能栏 5、6、7；撞山靠有就放第 8 格）
// r8-p1：&learn=p1   直接会撞山靠（技能栏第 5 格）
import type { Game } from '../src/world/game';
import * as C from '../src/world/cultivation';
import { weaponItemId, type WeaponKind } from '../src/data/weapons';
import { lookWithWeapon } from '../src/world/arms';
import { Enemy } from '../src/world/combat';
import { ENEMIES } from '../src/data/enemies';
import { cultivator, newTeam } from '../src/world/melee';
import { learnMove, moveArtId, MOVES } from '../src/world/brawlmoves';
import '../src/world/hsmoves';

type W = Window & { __brawlReady?: boolean; __brawl?: { dummy: Enemy; brawler: Enemy | null; beast: Enemy | null; foes: Enemy[] } };

/** 找一片开阔平地：中心周围 ±1600 × ±900 都站得住、没有屋舍和城镇、地势能走通 */
export function openField(g: Game): { x: number; y: number } | null {
  const T = g.terrain, p = g.player;
  const ok = (cx: number, cy: number) => {
    if (T.inLocZone(cx, cy, 2600)) return false;   // 离城镇、宗门、险地都远一点：被轰飞也不会撞进人家院子
    for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) {
      const x = cx + i * 400, y = cy + j * 300;
      if (T.walkFactor(x, y) <= 0 || !T.isLand(x, y) || g.space.blocked(x, y) || g.combat.safeAt(x, y)) return false;
      if (!T.canTraverse(cx, cy, x, y)) return false;
    }
    return true;
  };
  for (let r = 0; r <= 24000; r += 800) {
    const n = Math.max(1, Math.round(r / 500));
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r; if (ok(x, y)) return { x, y }; }
  }
  return null;
}
/** 找一段海岸：脚下是能走的平地，某个方向六七百外就是海（开阔、离城镇远） */
function coast(g: Game): { x: number; y: number; ux: number; uy: number } | null {
  const T = g.terrain, p = g.player;
  const land = (x: number, y: number) => T.isLand(x, y) && T.walkFactor(x, y) > 0 && !g.space.blocked(x, y) && !g.combat.safeAt(x, y);
  for (let r = 0; r <= 60000; r += 900) {
    const n = Math.max(1, Math.round(r / 600));
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2, cx = p.x + Math.cos(a) * r, cy = p.y + Math.sin(a) * r;
      if (!land(cx, cy) || T.inLocZone(cx, cy, 2400)) continue;
      for (let d = 0; d < 8; d++) {
        const da = d / 8 * Math.PI * 2, ux = Math.cos(da), uy = Math.sin(da);
        // 朝这个方向：五百以内是陆地（站得开），七百到两千都是海
        let ok = true;
        for (let s = 100; s <= 450 && ok; s += 120) if (!land(cx - ux * s, cy - uy * s * 0.7) || !land(cx + uy * s, cy - ux * s * 0.7) || !land(cx - uy * s, cy + ux * s * 0.7)) ok = false;
        for (let s = 750; s <= 2200 && ok; s += 250) if (T.isLand(cx + ux * s, cy + uy * s)) ok = false;
        if (ok) return { x: cx, y: cy, ux, uy };
      }
    }
  }
  return null;
}

export function tryBrawl(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const h = g.hero, B = g.combat.brawl, at = params.get('at'), foeP = params.get('foe');
    h.realm = 3; h.stage = 1; h.hp = 1; h.mp = 1;
    B.learn(true);
    // 兵器：兵器槽里穿一把（bond：槽空着，本命结碧竹飞云剑）
    const wpn = params.get('wpn') as WeaponKind | 'bond' | null, tier = Math.max(0, Math.min(6, Number(params.get('tier') ?? 3)));
    if (wpn) {
      const ls = C.itemListeners.splice(0);
      if (h.bag.some((x) => x.worn === 'weapon')) C.unwearGear(h, 'weapon');
      if (wpn === 'bond') { C.addItem(h, 'art_qingzhu', 1); C.bindBond(h, 'art_qingzhu'); }
      else if (wpn !== 'fist') { const id = weaponItemId(wpn, tier); C.addItem(h, id, 1); const b = h.bag.filter((x) => x.id === id && !x.worn).pop(); if (b) C.wearGear(h, b); }
      C.itemListeners.push(...ls);
      B.syncWeapon();
    }
    ['bx_qishen', 'bx_lianquan', 'bx_bengshan', 'bx_suodi'].forEach((id, i) => { h.hotbar[i] = id; });
    if (params.get('learn') === 'hs') ['yicunbeng', 'zhenjiao'].forEach((id, i) => { if (learnMove(h, id)) h.hotbar[4 + i] = moveArtId(id); });
    if (params.get('learn') === 'hs3') {
      // 撼山客第三批：直接会千钧坠、一拳破界（技能栏 5、6）；&realm=5 化神才使得出破界
      h.realm = Math.max(1, Math.min(5, Number(params.get('realm') ?? 3)));
      learnMove(h, 'qianjunzhui'); learnMove(h, 'pojie'); h.hotbar[4] = moveArtId('qianjunzhui'); h.hotbar[5] = moveArtId('pojie');
      const s = g.hanshan.s; s.taught = [...new Set([...(s.taught ?? []), 'qianjunzhui', 'pojie'])];
    }
    if (params.get('learn') === 'p2') {
      // r8-p2 撼山客第二阶段传的：赤焰回旋腿、炎阳炮拳、赤阳罡（技能栏 5、6、7；撞山靠若已做出来放第 8 格）
      h.realm = Math.max(2, h.realm);
      const ids = ['p2xuan', 'p2pao', 'p2gang'];
      for (const m of MOVES.values()) if (m.name === '撞山靠') ids.push(m.id);
      ids.forEach((id, i) => { if (learnMove(h, id)) h.hotbar[4 + i] = moveArtId(id); });
    }
    let seaU = { x: 1, y: 0 };
    if (at === 'rocks' || at === 'sea') {
      const c = coast(g);
      if (c) { seaU = { x: c.ux, y: c.uy }; if (at === 'sea') g.teleport(c.x + c.ux * 1500, c.y + c.uy * 1500); else g.teleport(c.x, c.y); }
    } else { const f = openField(g); if (f) g.teleport(f.x, f.y); }
    g.combat.enemies.length = 0;
    const p = g.player, calm = params.get('calm') === '1';
    if (at === 'sea') { p.flying = true; p.z = p.zTarget = 56; }
    const foes: Enemy[] = [];
    const dummy = B.spawnDummy(p.x + 230, p.y + 20, 2);
    dummy.name = '木人桩'; dummy.kit = []; dummy.skT = 1e9;   // 木人：不放任何招式
    if (at === 'sea') dummy.flyH = 56;   // 海上：木人也悬在水面上（往下砸就砸进海里）
    let brawler: Enemy | null = null, beast: Enemy | null = null;
    if (foeP === 'armed') {
      // 拿兵器的人形对手：剑、刀（重兵）、锤（重兵）、枪各一个，编成一伙冲你来；都会贴身打（断刀坞 / 重岳剑门 / 青玄门的近战路数）
      const team = newTeam('械');
      const list: [string, string, WeaponKind, number, number, number][] = [['huadao', '持剑客', 'sword', 3, -640, -180], ['huadao', '断刀坞刀客', 'heavy', 2, 620, -220], ['jujian', '重岳剑门锤师', 'heavy', 3, -560, 300], ['qixuan', '青玄门枪手', 'spear', 3, 680, 280]];
      for (const [sch, name, kind, t, dx, dy] of list) {
        const e = cultivator(p.x + dx, p.y + dy, 3, 1, sch, name); e.team = team; e.aggro = !calm; e.maxHp = e.hp = e.maxHp * 3;
        e.look = lookWithWeapon(e.look!, kind === 'heavy' ? { kind, tier: t, form: name.includes('锤') ? 'hammer' : 'dao' } : { kind, tier: t });
        g.combat.enemies.push(e); foes.push(e);
      }
      brawler = foes[0];
    } else if (foeP === 'school') {
      // 各派体修：青玄门、断刀坞、重岳剑门、玄煞宗、体修散修各一人（编成一伙，都冲你来），一头五阶走兽（雪吼兽），一个剑修
      const team = newTeam('体');
      const list: [string, string, number, number][] = [['qixuan', '青玄门弟子', -620, -200], ['huadao', '断刀坞刀客', -520, 260], ['jujian', '重岳剑门力士', 640, -260], ['tiansha', '玄煞宗魔修', 700, 240], ['tixiu', '铁臂散修', -120, -420]];
      for (const [sch, name, dx, dy] of list) { const e = cultivator(p.x + dx, p.y + dy, 3, 1, sch, name); e.team = team; e.aggro = !calm; e.maxHp = e.hp = e.maxHp * 3; g.combat.enemies.push(e); foes.push(e); }
      const sw = cultivator(p.x + 160, p.y + 520, 3, 0, 'huangfeng', '青霞谷剑修'); sw.team = team; sw.aggro = !calm; g.combat.enemies.push(sw); foes.push(sw);
      const td = ENEMIES.xuehou ?? Object.values(ENEMIES).find((d) => d.look?.body === 'tiger' || d.look?.body === 'wolf');
      if (td) { beast = new Enemy(td, p.x - 300, p.y + 420, 3, 1); beast.blv = Math.max(beast.blv, 5); beast.aggro = !calm; beast.maxHp = beast.hp = beast.maxHp * 4; g.combat.enemies.push(beast); foes.push(beast); }
      brawler = foes[4];
    } else {
      if (foeP !== '0') { brawler = B.spawnBrawler(p.x - 720, p.y - 160, 3, 0); brawler.aggro = !calm; brawler.maxHp = brawler.hp = brawler.maxHp * 4; if (at === 'sea') brawler.flyH = 56; foes.push(brawler); }
      const bd = ENEMIES.redwolf ?? ENEMIES.wolf;
      if (bd && at !== 'sea') { beast = new Enemy(bd, p.x + 620, p.y - 320, 2, 1); beast.aggro = !calm; beast.maxHp = beast.hp = beast.maxHp * 6; g.combat.enemies.push(beast); foes.push(beast); }
    }
    if (at === 'rocks') {
      // 礁石滩：只留手摆的（关掉自动摆放），一圈礁石、巨石、枯树、船骸，再来两个体修连着打
      B.brk.reset(); B.brk.manual = true;
      const R = (k: 'reef' | 'boulder' | 'tree' | 'wreck', dx: number, dy: number, s = 0.6, v = 0) => B.brk.place(k, p.x + dx, p.y + dy, s, v);
      R('boulder', 520, -40, 0.7, 0); R('boulder', -560, 60, 0.8, 1); R('reef', 420 + seaU.x * 300, 160 + seaU.y * 300, 0.7, 2); R('reef', seaU.x * 620, seaU.y * 620, 0.8, 1);
      R('reef', seaU.x * 760 - seaU.y * 260, seaU.y * 760 + seaU.x * 260, 0.6, 3); R('tree', -360, -300, 0.7, 0); R('tree', 300, 330, 0.6, 1); R('wreck', -200, 380, 0.7, 0);
      R('boulder', 860, 200, 0.5, 2); R('reef', -seaU.y * 520 + seaU.x * 380, seaU.x * 520 + seaU.y * 380, 0.5, 0);
      for (let i = 0; i < 2; i++) { const e = B.spawnBrawler(p.x + (i ? 900 : -900), p.y + (i ? -300 : 300), 3, 0); e.aggro = !calm; e.maxHp = e.hp = e.maxHp * 4; foes.push(e); }
    }
    if (calm) { for (const e of g.combat.enemies) { e.speed = 0; e.def = { ...e.def, melee: undefined, ranged: undefined }; } (g.combat as unknown as { spawnT: number }).spawnT = 1e9; }   // 安静的场子（截图用）：不刷野怪
    if (!B.stance) B.toggleStance();
    g.setZoom(0.85);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    g.updateUI(true);
    (window as W).__brawl = { dummy, brawler, beast, foes };
    (window as W).__brawlReady = true;
    if (params.get('learn') === 'hs2') void import('./try-hsmoves2').then((m) => m.learnHs2(g));   // 撼山客第二批：直接会燕回、十方弹、犁地（tools/try-hsmoves2.ts）
    if (params.get('learn') === 'p1') void import('./try-hsp1').then((m) => m.learnP1(g));   // r8-p1：直接会撞山靠（技能栏第 5 格，tools/try-hsp1.ts）
    if (params.get('clash') === '1' && brawler) {
      // 一上来就拼招：体修在右前方，两边同时欺身扑向对方
      brawler.x = p.x + 520; brawler.y = p.y; brawler.aggro = true; brawler.speed = 0;
      g.combat.lock = brawler; g.combat.manual = true;
      window.setTimeout(() => { B.forceRush(brawler!); B.rush(); window.setTimeout(() => { if (!B.clash.on) B.clash.start(brawler!, 'rush'); }, 260); }, 400);
    }
    g.toast(at === 'sea' ? '海面上空：御剑低飞。按住下降键重击把人砸进海里（冲天水柱），平着轰飞能犁出一道水沟。' : at === 'rocks' ? '礁石滩：把人轰向礁石、巨石、枯树——撞上就碎，还要再吃一下撞击。' : foeP === 'armed' ? '拿兵器的对手：剑客出手快、重兵前摇长（看见抡起来就躲）、枪手突刺前地上先亮一条线。' : foeP === 'school' ? '各派体修都会扑上来贴身打（两拳接抓投、佯攻后撤、你脱困后追一手）；剑修被你盯上会后撤布阵。' : '贴身斗法：右边木人桩、远处一个会还手的体修、一头火狼。左键连拳，右键崩山（罡气打空才轰得飞），Shift 欺身，空格缩地追击 / 被打飞时脱困；技能栏 1–4 是同样四式。', 'good');
  }, 6500);
}
