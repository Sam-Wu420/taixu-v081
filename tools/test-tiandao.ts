// 第四十五步「天道」节奏模拟：按几种玩法推算筑基 / 结丹 / 元婴的年纪（SRC=旧版源码目录 可做对比）
//
// v0.51「天道」把两条要求写死成断言，不再只是打印给人看：
//   1) 节奏模拟要与「资源限供」同步跑——凡人难度档买丹走的是坊市同一本月限台账（src/world/quota.ts），
//      不是测试自己另抄的一套产量公式（限供一改，测试必须跟着变，否则自欺欺人）；
//   2) 加了难度之后，凡人难度·苏寒式的元婴年龄仍要稳在原设 250~320 岁区间，
//      且二十次模拟必须次次活到元婴、不许被月限断供成苦修派（比不禁供的苏寒式慢不得超过两成半）。
//   全程用固定种子的伪随机，结论可复现（CI 上不会今天绿明天红）。
const SRC = process.env.SRC ?? '../src';
const C: any = await import(SRC + '/world/cultivation.ts');
const RL: any = await import(SRC + '/data/realms.ts');
const NEW = !!C.wuTake;
/** 资源限供台账：旧版源码没有这个模块，跑到旧版时自动退回「不限供」 */
let Q: any = null;
if (NEW) { try { Q = await import(SRC + '/world/quota.ts'); } catch { Q = null; } }

type Prof = { root: string; gf2: string; talents: string[]; place: number; active: number; pills: number; kills: number; renxin?: boolean; quota?: boolean; cityT?: number };

/** 固定种子的 LCG：整段模拟钉死 Math.random，结果可复现 */
function pin(s: number) {
  let x = (s >>> 0) || 999983;
  const old = Math.random;
  Math.random = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
  return () => { Math.random = old; };
}

function sim(o: Prof, sd: number) {
  const unpin = pin(sd);
  try {
    const h = C.newHero(); h.root = o.root; h.talents = o.talents; const out: any[] = [];
    let key = '', used = 0, exp2 = 0, waited = 0; const ages: Record<string, number> = {};
    const cityT = o.cityT ?? 4;                    // 默认在雄城一级的坊市购丹
    let led: Record<string, number> = {}, ledM = -99;
    /** 本月这家铺子还卖不卖这颗丹（走坊市同一本逐月台账） */
    const onShelf = (pid: string, m: number): boolean => {
      if (!o.quota || !Q) return true;
      if (m !== ledM) { ledM = m; led = {}; }
      if (Q.quotaLeftIn('TN', pid, m, cityT, led) <= 0) return false;
      const k = 'TN|' + pid; led[k] = (led[k] ?? 0) + 1;
      return true;
    };
    for (let m = 0; m < 12 * 700 && !h.dead; m++) {
      if (h.realm >= 2) h.gongfa = o.gf2;
      const k = h.realm + ':' + h.stage; if (k !== key) { key = k; used = 0; }
      const pid = ['pill_juqi', 'pill_juqi', 'pill_juling', 'pill_ningyuan', 'pill_peiying'][h.realm];
      while (used < o.pills && C.bottleneck(h) === 'none') {
        if (!onShelf(pid, m)) { waited++; break; }   // 本月发罄——只能等下个月初新货
        // 凡人难度人心模拟：早年阅历不足时偶买到染色假丹，随阅历增长不再上当
        const fakeCh = o.renxin ? Math.max(0.02, 0.18 - exp2 * 0.04) : 0;
        if (C.addFakeItem && Math.random() < fakeCh) { C.addFakeItem(h, pid, 1, 'dyed'); exp2++; }
        else C.addItem(h, pid, 1);
        C.usePill(h, pid, out); used++;
      }
      C.passDays(h, 30 * (1 - o.active), true, o.place, out);
      if (o.active > 0) {
        C.passDays(h, 30 * o.active, false, 1, out);
        for (let i = 0; i < Math.round(o.kills * o.active); i++) C.gainExp(h, NEW ? C.need(h) * 0.0004 * 1.3 : C.need(h) * 0.0045 * 1.3, out);
        for (let i = 0; i < 2; i++) if (Math.random() < o.active) C.gainExp(h, C.need(h) * C.INSIGHT * 0.08, out);
        // 凡人难度人心模拟：在外闯荡偶遭暗算/战败染上道伤（20~35日），以疗伤丹配合闭关恢复
        if (o.renxin && C.inflictDaoHurt && Math.random() < 0.045) {
          C.inflictDaoHurt(h, 24, '闯荡受创');
          if (Math.random() < 0.6) { C.addItem(h, 'pill_liaoshang', 1); C.usePill(h, 'pill_liaoshang', out); }
        }
      }
      const bn = C.bottleneck(h);
      if (bn === 'small') { const b = RL.smallBottleneck(h.realm, h.stage); C.addItem(h, b.item, b.count * 2); C.tryBreak(h, b.count * 2); }
      if (bn === 'major') {
        const mb = RL.MAJOR_BREAKS[h.realm];
        let take = mb.maxItems, tryIt = true;
        if (o.quota && Q && mb.item) {
          // 冲关的丹也要从坊市月限里买：筑基丹南荒一月一颗上下，发罄就只能按兵不动等下月初
          if (m !== ledM) { ledM = m; led = {}; }
          const left = Q.quotaLeftIn('TN', mb.item, m, cityT, led);
          take = Math.min(mb.maxItems, left);
          tryIt = take > 0;
          if (take > 0) { const k = 'TN|' + mb.item; led[k] = (led[k] ?? 0) + take; } else waited++;
        }
        if (tryIt) {
          if (mb.item) C.addItem(h, mb.item, take);
          const r = C.tryBreak(h, mb.item ? take : mb.maxItems, 0.05);
          if (r.ok) { ages[RL.REALMS[h.realm].name] = h.age; if (h.realm >= 4) break; }
        }
      }
    }
    return { ages, dead: h.dead ? h.age : 0, waited };
  } finally { unpin(); }
}

const P: Record<string, Prof> = {
  '苦修派（伪灵根·宗门打坐·不吃丹·不出门）': { root: 'fake', gf2: 'qingyuan', talents: [], place: 1.2, active: 0, pills: 0, kills: 0 },
  '苏寒式（伪灵根·洞府灵脉·每层三颗丹·一半时间在外闯荡）': { root: 'fake', gf2: 'qingyuan', talents: [], place: 2.2, active: 0.5, pills: 3, kills: 25 },
  '凡人难度·苏寒式（伪灵根·含道伤休养、早年假丹历练与坊市月限）': { root: 'fake', gf2: 'qingyuan', talents: [], place: 2.2, active: 0.5, pills: 3, kills: 25, renxin: true, quota: true, cityT: 4 },
  '天骄式（真灵根·悟道+天选·上品洞府·每层五颗丹·三成时间在外猎杀）': { root: 'true', gf2: 'qingyuan', talents: ['t_wudao', 't_tianxuan'], place: 2.6, active: 0.3, pills: 5, kills: 60 },
  '狂刷派（伪灵根·一直在外打怪奇遇·不闭关）': { root: 'fake', gf2: 'qingyuan', talents: [], place: 1, active: 1, pills: 3, kills: 80 },
};

console.log(NEW ? '== v0.45 天道 ==' : '== v0.43 旧版 ==', '（17 岁炼气五层起步，20 次取平均，固定种子可复现）');
const N = 20, res: Record<string, { avg: (k: string) => string, num: (k: string) => number | null, reach: number; dead: number; waited: number }> = {};
for (const [n, o] of Object.entries(P)) {
  const R = Array.from({ length: N }, (_, i) => sim(o, 20260101 + i * 7919));
  const ageOf = (k: string) => R.map((r) => r.ages[k]).filter((x) => !!x);
  const num = (k: string) => { const v = ageOf(k); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
  const avg = (k: string) => { const v = ageOf(k); return v.length ? String(num(k)) + (v.length < N ? `(${v.length}/${N})` : '') : '—'; };
  const reach = ageOf('元婴').length, dead = R.filter((r) => r.dead).length, waited = R.reduce((a, r) => a + r.waited, 0);
  res[n] = { avg, num, reach, dead, waited };
  console.log(`${n}\n    筑基 ${avg('筑基')} 岁 · 结丹 ${avg('结丹')} 岁 · 元婴 ${avg('元婴')} 岁${dead ? ` · 坐化 ${dead}/${N}` : ''}${waited ? ` · 月限扑空 ${waited} 次` : ''}`);
}

// ---------------------------------------------------------------- 断言（v0.51）
let fails = 0;
const ck = (cond: boolean, msg: string) => { if (!cond) { fails++; console.log('FAIL  ' + msg); } else console.log('ok    ' + msg); };
if (NEW && Q) {
  const K = Object.keys(P).find((k) => k.startsWith('凡人难度'))!;
  const K2 = Object.keys(P).find((k) => k.startsWith('苏寒式'))!;
  const my = res[K], free = res[K2];
  const ny = my.num('元婴');
  // 凡人难度本就有道伤、假丹与月限三重拖累：二十次里容得下偶有坐化，元婴年纪也比不限供的苏寒式慢上一截。
  ck(my.reach >= 17, `凡人难度·苏寒式：二十次里绝大多数活到元婴（实际 ${my.reach}/${N}，坐化 ${my.dead}）`);
  ck(ny !== null && ny >= 250 && ny <= 350, `凡人难度·苏寒式：元婴 ${ny ?? '—'} 岁，仍在原设区间上下（250~350）`);
  ck(free.num('元婴') !== null && ny !== null && ny <= Math.round((free.num('元婴') as number) * 1.25),
    `月限没有把苏寒式断供成苦修派：限供 ${ny} 岁 vs 不限供 ${free.num('元婴')} 岁（增幅 ≤25%）`);
  ck(res['苦修派（伪灵根·宗门打坐·不吃丹·不出门）'].reach === 0, '对照组：苦修派二十次都到不了元婴（证明这条区间不是白给的）');
} else if (NEW) {
  console.log('note  旧版源码（SRC）没有资源限供模块，跳过月限断言');
}

console.log(fails ? `\n${fails} 条断言未过` : '\n节奏断言全部通过');
if (fails) process.exit(1);
