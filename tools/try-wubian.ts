// 试玩入口：/tools/perf-acceptance.html?auto=new&map=tiannan&try=wubian —— 无边海（绝域，B1）。
// 全新开局，直接落在南荒东岸外的近海上空（飞着）；往东飞就依次经过近海、迷雾断层、核心海域。
//   &realm=2|3|4|5（或 zhuji / jiedan / yuanying / huashen）：境界，默认元婴
//   &at=near|fog|core|storm|eye|ghost|rift|swim|outer：直接落到对应的场面（截图用）
//     storm：飓风的雨带里（眼墙边）；eye：风眼里；ghost：鬼雾里；rift：核心里，四周一阵裂隙潮，每八息再来一阵；
//     swim：核心里力竭落水；outer：南荒西边外圈海的绝域边上（往西顶着罡风飞）
//   海兽（收官 B2）：
//     shadow：核心区，脚下两条巨影在打转（不流血就不破水）；fish：一群鬼齿凶鱼破水；kraken：墨触海魔与它的触须；
//     jiao：刚斩了一只五阶海兽，血腥味散开，十二息后裂海玄蛟从深处破水（试玩里缩短了，平时是三十息）；
//     whale：站在覆海玄鲸的背上（能走、能打坐、能采灵草，隔一阵会下潜）；wraith：鬼雾里的雾中船灵；ray：飓风雨带里的雷鳐
//   灵舟、海渊、奇遇（收官 B3）：
//     boat：已在灵舟上（迷雾断层与核心交界，袋里三条船都给了；&realm=1 是炼气，看不会飞的人乘船入海）；&boat=lz_wupeng|lz_polang|lz_xuangui 换船
//     abyss：核心海域里泅水，脚下就能下潜（按住 PageDown；&d=1200 直接在水下）；ruin：海底古魔遗迹的门口（已在水下，带着避水珠）
//     ghostship：血月夜，站在幽灵古船的甲板上（百鬼海市）；altar：退潮时站在潮汐古魔祭坛的礁盘上
import type { Game } from '../src/world/game';
import { WORLD_SCALE, WORLD_W } from '../src/data/world';
import * as C from '../src/world/cultivation';
import { hashU } from '../src/core/rng';

const REALM: Record<string, number> = { zhuji: 2, jiedan: 3, yuanying: 4, huashen: 5 };
const SEA_TIPS: Record<string, string> = {
  shadow: '核心海域：脚下有两条巨影在打转。别流血、别落水——它们是循着气味来的。',
  fish: '海面就要炸开了：一群鬼齿凶鱼会跃出水面扑咬，咬住了往下拖。',
  kraken: '墨触海魔：先斩它的触须（能锁定），斩掉大半它才露出弱点；被缠住了按方向键挣扎。',
  jiao: '刚斩了一只五阶海兽，血腥味散开了——十二息后裂海玄蛟会从深处破水（平时是三十息）。杀完就走，飞远了就能甩掉。',
  whale: '你站在覆海玄鲸的背上：能走、能打坐（核心区也回灵），背上发光的是深海灵草，走过去就采。它隔一阵会下潜，示警时赶紧按 F 飞起来。',
  wraith: '鬼雾里飘来一只雾中船灵：它手里那盏灯不灭，打散了还会在雾的另一头聚起来。',
  ray: '飓风的雨带里：雷鳐在头顶盘旋，地上亮起预警圈时快躲——它要引雷俯冲了。',
  boat: '你在灵舟上：方向键驾船（有惯性，顺风快、逆风慢），Z 打坐回灵，; 靠岸收舟，F 收舟起飞，按住 PageDown 纵身下潜。袋里三条船都给你了。',
  abyss: '核心海域里泅水：按住 PageDown（或右下的「潜」）往下潜，PageUp 上浮。没有避水的东西，三百单位往下就有水压；袋里有两颗避水丹。',
  ruin: '海底古魔遗迹的门口：靠近了守卫会游过来，门口的镇渊古傀打碎了，宝箱自己弹开。你身上带着避水珠。',
  ghostship: '血月夜，你站在幽灵古船的甲板上：前后左右走动，靠近摊主按 T 买卖，说书鬼能打听海底遗迹。天一亮船就散。',
  altar: '退潮了，你站在潮汐古魔祭坛的礁盘上：走到坛前按 T 献祭海兽材料换加持，或者叩坛引出守坛战。涨潮前会示警。',
};

export function tryWubian(g: Game) {
  const q = new URLSearchParams(location.search);
  const rq = q.get('realm') ?? '4', realm = Math.max(1, Math.min(5, REALM[rq] ?? (Number(rq) || 4)));   // 收官 B3：炼气（1）也能来——乘船入海
  const at = q.get('at') ?? 'near';
  // 新开局稍后会弹开场对话，挡着就按不了键：试玩页里替你关掉
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => clearInterval(closer), 8000);
  const h = g.hero;
  h.realm = realm; h.stage = 0; h.exp = 0; h.hp = 1; h.mp = 1;
  const panel = document.getElementById('perf-panel'); if (panel) panel.style.display = 'none';
  const p = g.player, T = g.terrain;
  // 南荒东岸：沿 y=140000 往东找最后一块陆地
  const y = 140000;
  let coast = 560000; for (let x = 520000; x <= WORLD_W; x += 250) if (T.isLand(x, y)) coast = x;
  const go = (x: number, yy = y) => { g.teleport(x, yy); p.flying = true; p.zTarget = p.z = 56; g.combat.reset(); g.jueyu.reset(); };
  const J = g.jueyu;
  switch (at) {
    case 'fog': go(WORLD_W + 16000); break;
    case 'core': go(WORLD_W + 62000); break;
    case 'storm': go(WORLD_W + 56000); J.forceStorm(p.x + 1500, p.y - 300, 3800); break;
    case 'eye': go(WORLD_W + 56000); J.forceStorm(p.x + 120, p.y + 60, 3800); break;
    case 'ghost': go(WORLD_W + 22000); J.forceFog(p.x + 600, p.y, 5200, 2300); break;
    case 'rift': {
      go(WORLD_W + 62000);
      const tide = () => { J.forceTide(p.x, p.y, 8); J.forceRift(p.x + 380, p.y - 60, 0.25, 820, 0.2); };
      tide(); window.setInterval(() => { if (!g.halted) tide(); }, 8000);
      g.combat.invulnT = 3;   // 进场头三息不挨裂缝，先看清楚
      break;
    }
    case 'swim': go(WORLD_W + 62000); h.mp = 0.003; break;
    case 'outer': go(-36000, 200000); break;
    // —— 海兽（收官 B2）
    case 'shadow': {
      go(WORLD_W + 64000);
      const S = g.seabeast; S.debugShade('mochu', p.x + 700, p.y + 260); S.debugShade('liehai', p.x - 900, p.y - 300);
      break;
    }
    case 'fish': go(WORLD_W + 64000); window.setTimeout(() => g.seabeast.debugBreach('guichi', p.x + 380, p.y + 90), 1200); break;
    case 'kraken': go(WORLD_W + 64000); window.setTimeout(() => g.seabeast.debugBreach('mochu', p.x + 520, p.y - 140), 1200); break;
    case 'jiao': {
      go(WORLD_W + 64000);
      window.setTimeout(() => {
        const m = g.seabeast.debugBreach('guichi', p.x + 300, p.y + 60);
        // 刚斩了一只：血腥味散开（试玩里蛟十二息就到）
        window.setTimeout(() => { if (m && !m.e.dead) g.combat.hitEnemy(m.e, m.e.maxHp * 99, { realm: 9, stCh: 0 }, p.x, p.y); window.setTimeout(() => { const ch = g.seabeast.chain; if (ch) ch.T = 12; }, 400); }, 900);
      }, 1000);
      break;
    }
    case 'whale': {
      const S = g.seabeast, ph = ((g.time + 37) % 300 + 300) % 300; S.whaleShift = 25 - ph;
      const q = S.whaleAt(g.time); go(q.cx, q.cy); p.flying = false; p.z = p.zTarget = 0;
      break;
    }
    case 'wraith': go(WORLD_W + 30000); J.forceFog(p.x + 300, p.y, 5600, 2600); break;   // 雾一起，船灵自己就会飘过来
    case 'ray': go(WORLD_W + 56000); J.forceStorm(p.x + 1500, p.y - 300, 3800); break;
    // —— 灵舟、海渊、奇遇（收官 B3）
    case 'boat': {
      go(WORLD_W + 30000);
      for (const id of ['lz_wupeng', 'lz_polang', 'lz_xuangui']) C.addItem(h, id, 1);
      J.boat.deploy(q.get('boat') ?? 'lz_polang');
      break;
    }
    case 'abyss': {
      go(WORLD_W + 60000); p.flying = false; p.z = p.zTarget = 0; J.swimming = true;
      C.addItem(h, 'hy_bishuidan', 2);
      const d = Number(q.get('d') ?? 0); if (d > 0) J.deep.debugDive(d);
      break;
    }
    case 'ruin': {
      go(WORLD_W + 60000);
      const r = J.deep.nearestRuin(p.x, p.y, 6);
      if (r) { const [x, y] = J.deep.local(r); g.teleport(x - 260, y + 900); p.flying = false; g.combat.reset(); }
      C.addItem(h, 'hy_bishuizhu', 1); C.addItem(h, 'hy_bishuidan', 2);
      J.deep.debugDive(r ? r.floor - 120 : 1800);
      J.deep.drinkWard();   // 避水珠三成五 + 避水丹四成五：遗迹在海底最深处，要六成避水
      break;
    }
    case 'ghostship': {
      go(WORLD_W + 40000);
      // 拨到一个血月夜（第 n 夜三成是血月，按哈希找一个）
      let n = Math.floor(g.clock / 240) + 1; while (hashU(n | 0, 0, 9301) >= 0.3) n++;
      g.clock = n * 240 - 0.02 * 240;
      J.qiyu.forceShip(p.x + 300, p.y - 120, 'moon');
      { const S = J.qiyu.ship; g.teleport(S.x - 200, S.y + 16); p.flying = false; p.z = p.zTarget = 0; }
      break;
    }
    case 'altar': {
      go(WORLD_W + 40000);
      const a = J.qiyu.nearestAltar(p.x, p.y, 5);
      if (a) {
        // 拨钟：让它正处在退潮露出的那一段
        const x0 = g.clock / 240 / 2 + a.ph, cyc = Math.floor(x0) + 1;
        g.clock = (cyc + 0.1 - a.ph) * 2 * 240;
        const [x, y] = J.qiyu.altarPos(a); g.teleport(x + 160, y + 16); p.flying = false; p.z = p.zTarget = 0;
        for (const id of ['mat_sb_guichi', 'mat_sb_chuxu', 'mat_sb_monang']) C.addItem(h, id, 2);
      }
      break;
    }
    default: go(coast + 3500);
  }
  // 镜头：海上开阔，拉远一点
  g.setZoom(({ boat: 1.0, abyss: 0.9, ruin: 0.62, ghostship: 0.85, altar: 0.62 } as Record<string, number>)[at] ?? 0.62);   // 收官 B3：船、海渊离近一点看
  g.toast(at === 'near'
    ? `已在南荒东岸外的近海上空（${['', '', '筑基', '结丹', '元婴', '化神'][realm]}）。一路向东：近海碧蓝 → 迷雾断层（墨青、视野收拢、回复减半、越飞越低）→ 核心（黑水狂涛、灵力流失、遁空梭失灵）。小地图左边的罗盘指着最近的岸。`
    : SEA_TIPS[at] ?? `无边海试玩：${at}。方向键飞行；法力见底会坠海泅水，服丹药或慢慢缓过来再按 F 起飞。`, 'good');
  // 收官 B3：试玩页里新开局的一串传闻、神通提示会盖住画面中间——这几个入口进场后清一次
  if (['boat', 'abyss', 'ruin', 'ghostship', 'altar'].includes(at)) window.setTimeout(() => { const G2 = g as unknown as { toasts: unknown[]; toastListeners?: { forEach(f: (x: () => void) => void): void } }; G2.toasts = []; G2.toastListeners?.forEach((f) => f()); g.toast(SEA_TIPS[at], 'good'); }, 3500);
  (window as unknown as { __wubian: unknown }).__wubian = { at, realm, coast: coast / WORLD_SCALE };
}
