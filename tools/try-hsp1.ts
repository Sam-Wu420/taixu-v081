// 试玩入口：perf-acceptance.html?auto=new&map=tiannan&try=hsp1&move=<招> —— 撼山客第一阶段照参考视频还原的十一招（r8-p1）
//   换成视频动作的七招：yicunbeng 一寸崩、jingang 金刚不坏、houfa 后发先至、suodi 缩地成寸、liuxing 流星百裂、yanhui 燕回、shifang 十方弹
//   新增的四招：duanmai 断脉腿、zhuangshan 撞山靠、dingxin 顶心膝、yingzong 影踪连环踢
// 他对着一个人形陪练循环放这一招（陪练在他画面右边：侧面对打），镜头是招式自己的侧面取景。
// 可选：&on=me 对着你放；&loop=0 不自动循环（只用 __p1.go）；&real=1 按真实时间走（录像、量帧时间）；&burn=1 他燃着身放（r9：第二阶段时第一阶段的招带火）
// 控制台 / 截图脚本：
//   await __p1.go(id?, T?, quick?)   从头放一次（不给 id 就是网址里那招）；T 给了就放到第 T 息定格（世界和特效一起停住，画面照常画）；quick：不先等镜头推到位（量帧时间用）
//   __p1.unfreeze()          接着走
// 你学会撞山靠：try=brawl&learn=p1（tools/try-brawl.ts）
import type { Game } from '../src/world/game';
import type { Enemy } from '../src/world/combat';
import { HS_BATCH1, type HsMoveId } from '../src/world/hsmoves';
import { performHs2, hs2ResetAi } from '../src/world/hsmoves2';
import { performHsP1, HSP1_IDS, learnHsP1 } from '../src/world/hsmovesp1';
import { moveArtId } from '../src/world/brawlmoves';
import { openField, clearStage } from './try-hanshan';
import { p1 } from '../src/world/p1fx';
import { hsp2Of } from '../src/world/hsp2';

type W = Window & { __p1?: unknown; __p1Ready?: boolean; __hs?: unknown };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const P1_MOVES = ['yicunbeng', 'jingang', 'houfa', 'suodi', 'liuxing', 'yanhui', 'shifang', ...HSP1_IDS] as const;

/** 逐帧固定步长；定格 = 步长几乎为零（同 try-hsmoves2） */
function stepper(g: Game, real = false) {
  g.debugFixedDt = real ? 0 : 1 / 60;
  let t0 = g.time, stopAt = Infinity, onStop: (() => void) | null = null;
  window.setInterval(() => { if (g.time - t0 >= stopAt) { g.debugFixedDt = 1e-7; stopAt = Infinity; const f = onStop; onStop = null; f?.(); } }, 2);
  return {
    start(T?: number): Promise<void> {
      g.debugFixedDt = real && T === undefined ? 0 : 1 / 60; t0 = g.time;
      if (T === undefined) { stopAt = Infinity; return Promise.resolve(); }
      stopAt = T;
      return new Promise((res) => { onStop = res; });
    },
    get frozen() { return g.debugFixedDt < 1e-4; },
  };
}

export function tryHsp1(g: Game, params: URLSearchParams) {
  const closer = window.setInterval(() => { if (g.modal) g.closeModal(true); }, 300);
  window.setTimeout(() => {
    clearInterval(closer);
    if (g.modal) g.closeModal(true);
    const id0 = params.get('move') ?? 'yicunbeng', onMe = params.get('on') === 'me', H = g.hanshan, c = g.combat, B = c.brawl, h = g.hero;
    h.realm = 3; h.stage = 1; h.hp = 1; h.mp = 1;
    B.learn(true);
    (c as unknown as { spawnT: number }).spawnT = 1e9;
    g.weather.forced = 'clear'; g.weather.kind = 'clear'; g.weather.k = 0;   // 晴天（雾会把招式的光洗成一片）
    // 场子：开阔、少树的平地（树冠会把两个人盖住）
    const T = g.terrain;
    const fmax = (cx: number, cy: number) => { let m = 0; for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) m = Math.max(m, T.sample(cx + i * 260, cy + j * 220).forest); return m; };
    let f = openField(g, g.player) ?? { x: g.player.x, y: g.player.y }, best = fmax(f.x, f.y);
    for (let r = 0; r < 40 && best > 0.06; r++) { const q = openField(g, g.player, 2500 + r * 2500); if (!q) continue; const m = fmax(q.x, q.y); if (m < best) { best = m; f = q; } }
    g.teleport(f.x, f.y);
    c.enemies.length = 0;
    H.s.met = true; H.s.spotted = true; H.s.angryUntil = undefined;
    H.place(f.x, f.y, 'stay');
    clearStage(g);
    document.querySelector<HTMLElement>('#perf-panel')?.style.setProperty('display', 'none');
    const wait = window.setInterval(() => {
      let e = H.ent!; if (!e) return;
      clearInterval(wait);
      const S = stepper(g, params.get('real') === '1');   // &real=1：按真实时间走（录像、量帧时间用）；不给就按固定步长（定格截图对时）
      hs2ResetAi(1e12);
      // 他一直在打架状态（不回平时、寻常近战不出手）；他被收起又生成了（换了一个人）就跟着换
      const arm = () => {
        const cur = H.ent; if (!cur) return;
        if (cur !== e || H.mode === 'calm') { e = cur; (H as unknown as { toFight(m: string): void }).toFight('brawl'); }
        (H as unknown as { brawling(): void }).brawling = () => { e.hp = e.maxHp; e.aggro = true; };
        H.autoMoves = false;
        const b = B.body(e); if (b.ai) b.ai.cd = 1e12;
        e.tgP = false; (e as unknown as { noP: boolean }).noP = true;
      };
      (H as unknown as { toFight(m: string): void }).toFight('brawl'); arm();
      const O = { x: f.x, y: f.y }, R = g.renderer?.hd?.rightDir ?? { x: 1, y: 0 };
      const far = (id: string) => id === 'yingzong' || id === 'suodi' ? 420 : id === 'duanmai' || id === 'zhuangshan' ? 200 : 170;
      let dummy: Enemy | null = null;
      const mk = (x: number, y: number) => { const d = B.spawnSparMan(x, y, 3); d.kit = []; d.skT = 1e9; d.maxHp = d.hp = 1e12; d.aggro = false; d.speed = 0; return d; };
      const p = g.player;
      window.setInterval(() => { h.hp = Math.max(h.hp, 0.7); h.mp = 1; }, 200);
      const reset = (id: string) => {
        arm();
        if (params.get('burn') === '1') hsp2Of(g).ignite();
        for (const r of [...B.runs]) r.done = true;
        B.clear(e); e.x = O.x; e.y = O.y; e.flyH = 0; e.lift = 0; if (e.cs) { e.cs.x = e.x; e.cs.y = e.y; e.cs.setAction('idle'); e.cs.faceToward(R.x, R.y, false); e.cs.yaw = e.cs.targetYaw; }
        for (const k of Object.keys(e.skCd)) e.skCd[k] = 0;
        const dx = O.x + R.x * far(id), dy = O.y + R.y * far(id);
        if (!onMe) {
          if (!dummy || !c.enemies.includes(dummy)) dummy = mk(dx, dy);
          B.clear(dummy); const bd = B.body(dummy); bd.subT = 0; bd.staggerT = 0; dummy.hideT = 0; dummy.dead = false; dummy.hp = dummy.maxHp;
          dummy.x = dx; dummy.y = dy; dummy.flyH = 0; dummy.lift = 0; if (dummy.cs) { dummy.cs.x = dx; dummy.cs.y = dy; dummy.cs.setAction('idle'); dummy.cs.faceToward(-R.x, -R.y, false); dummy.cs.yaw = dummy.cs.targetYaw; }
          p.x = O.x - R.x * 300 - R.y * 1100; p.y = O.y - R.y * 300 + R.x * 1100;
        } else { p.x = dx; p.y = dy; }
        B.pb.air = false; B.pb.staggerT = 0; B.playerLift = 0; c.pst = {}; c.invulnT = 0; p.flying = false; p.z = p.zTarget = 0; p.st.x = p.x; p.st.y = p.y;
        B.ghosts.length = 0;
        try { c.wreck.marks.length = 0; } catch { /* */ }
      };
      const fire = (id: string): boolean => {
        const tg = onMe ? null : dummy;
        if ((HS_BATCH1 as readonly string[]).includes(id)) {
          if (id === 'jingang') window.setTimeout(() => { if (dummy) H.hurl(dummy, 'sword'); }, 250);   // 金刚不坏：起手后朝他飞一柄剑，让他硬吃
          return H.cast(id as HsMoveId, tg, params.get('cut') === '1');   // &cut=1：收尾那一下切定格特写（截图对时默认不切）
        }
        if ((HSP1_IDS as readonly string[]).includes(id)) return performHsP1(H, id, tg, true);
        return performHs2(H, id, tg, true);
      };
      let auto = params.get('loop') !== '0', busyUntil = 0, cur = id0;
      const api = {
        H, id: id0, get dummy() { return dummy; }, fx: p1(B),
        async go(id?: string, T?: number, quick = false) {
          auto = false; cur = id ?? cur; S.start(); reset(cur);
          for (let i = 0; i < 40 && (B.peek(e)?.move || B.runs.length); i++) { for (const r of [...B.runs]) r.done = true; await sleep(30); }
          await sleep(80); reset(cur);
          // 截图对时用：先把侧面取景开起来、等镜头推到位（真打的时候他放招前已经在打，镜头本来就在两人身上）
          if (dummy && !onMe && !quick) { const t0 = g.time; while (g.time - t0 < 1.3) { B.sideShot(e, dummy, 0.5, 2.1); await sleep(30); } reset(cur); }   // 按世界时间等（无头浏览器一秒只画十来帧）
          const ok = fire(cur); const done = S.start(T); return ok ? done.then(() => ({ ok, t: B.peek(e)?.move?.t ?? -1, action: e.cs?.action, actionT: e.cs?.actionT })) : Promise.reject(new Error('没放出来'));
        },
        unfreeze() { S.start(); },
        loop(on = true) { auto = on; },
      };
      (window as W).__p1 = api;
      reset(cur);
      window.setInterval(() => {
        if (!auto || S.frozen) return;
        if (B.peek(e)?.move) { busyUntil = g.time; return; }
        if (g.time - busyUntil > 1.4) { reset(cur); fire(cur); busyUntil = g.time; }
      }, 100);
      g.toast(`撼山客 · 第一阶段（照参考视频）：${cur}`, 'good');
      (window as W).__p1Ready = true;
    }, 100);
  }, 6500);
}

/** try=brawl&learn=p1：你直接会撞山靠（技能栏第 5 格），对着木人桩放 */
export function learnP1(g: Game) {
  const h = g.hero;
  h.realm = Math.max(2, h.realm);
  learnHsP1(h);
  h.hotbar[4] = moveArtId('zhuangshan');
  g.updateUI(true);
  g.toast('你会了撼山客的撞山靠（技能栏第 5 格）：侧身沉马，一步撞进对手怀里。', 'good');
}
